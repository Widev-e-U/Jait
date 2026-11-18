#[path = "../src/internal_driver.rs"]
mod internal_driver;
use futures_util::future::BoxFuture;
use jait_gateway::{
    Gateway,
    config::GatewayConfig,
    db,
    health::HealthState,
    providers::registry::{ProviderAdapter, ProviderRegistry},
    routes::{
        auth::AuthState,
        jobs::{JaitModelCatalogue, JobRoutes},
    },
    scheduler::service::{SchedulerOptions, SchedulerService},
    security::http_auth::{self, AuthUser},
    services::jait_models::{JaitModelsConfig, ModelFetchFuture, ModelFetchers, ProviderModelInfo},
};
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    num::NonZeroU16,
    path::PathBuf,
    sync::{Arc, Mutex},
    time::Duration,
};
static LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}
struct Provider(Value);
impl ProviderAdapter for Provider {
    fn id(&self) -> &str {
        self.0["id"].as_str().unwrap()
    }
    fn owner_user_id(&self) -> Option<&str> {
        self.0["owner"].as_str()
    }
    fn info(&self) -> Value {
        json!({"id":self.0["id"],"name":self.0["name"]})
    }
    fn check_availability(&self) -> BoxFuture<'static, Result<(), String>> {
        Box::pin(async { Ok(()) })
    }
}
struct EmptyFetchers;
impl ModelFetchers for EmptyFetchers {
    fn fetch_openai<'a>(&'a self, _: &'a str, _: &'a str) -> ModelFetchFuture<'a> {
        Box::pin(async { Ok(vec![]) })
    }
    fn fetch_openrouter<'a>(&'a self, _: &'a str) -> ModelFetchFuture<'a> {
        Box::pin(async { Ok(vec![]) })
    }
    fn fetch_ollama<'a>(&'a self, _: &'a str) -> ModelFetchFuture<'a> {
        Box::pin(async { Ok(vec![]) })
    }
    fn fetch_omniroute<'a>(&'a self, _: &'a str, _: &'a str) -> ModelFetchFuture<'a> {
        Box::pin(async { Ok(vec![]) })
    }
}
fn observe(value: &Value, aliases: &mut HashMap<String, String>) {
    if let Some(values) = value.as_array() {
        for v in values {
            observe(v, aliases)
        }
    }
    if let Some(values) = value.as_object() {
        if let Some(id) = value["id"]
            .as_str()
            .filter(|_| values.contains_key("job_id"))
            && !aliases.contains_key(id)
        {
            assert_eq!(uuid::Uuid::parse_str(id).unwrap().get_version_num(), 7);
            aliases.insert(id.into(), format!("run:{}", aliases.len()));
        }
        for v in values.values() {
            observe(v, aliases)
        }
    }
}
fn normalize(value: Value, aliases: &HashMap<String, String>) -> Value {
    match value {
        Value::String(s) => json!(
            aliases
                .get(&s)
                .cloned()
                .or_else(|| s
                    .strip_prefix("Job not found: ")
                    .and_then(|id| aliases.get(id))
                    .map(|id| format!("Job not found: {id}")))
                .unwrap_or(s)
        ),
        Value::Array(values) => {
            Value::Array(values.into_iter().map(|v| normalize(v, aliases)).collect())
        }
        Value::Object(values) => Value::Object(
            values
                .into_iter()
                .map(|(k, v)| (k, normalize(v, aliases)))
                .collect(),
        ),
        other => other,
    }
}
async fn compare(mut call: Value) {
    let _lock = LOCK.lock().await;
    let root = root();
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64;
    call["op"] = json!("nativejobhttp.run");
    call["now"] = json!(now);
    let expected = internal_driver::call(
        &root,
        &root
            .join(".jait/artifacts/gateway-rust/jobs-http/contracts")
            .join(uuid::Uuid::new_v4().to_string()),
        json!({"version":1,"calls":[call.clone()]}),
        &|| false,
    )
    .unwrap()[0]
        .clone();
    let fixture = root
        .join(".jait/artifacts/gateway-rust/jobs-http/native")
        .join(uuid::Uuid::new_v4().to_string());
    std::fs::create_dir_all(&fixture).unwrap();
    let path = fixture.join("state.sqlite");
    let connection = db::open_database(&path).unwrap();
    db::migrate_database(&connection).unwrap();
    connection.execute_batch("INSERT INTO users(id,username,password_hash,created_at,updated_at)VALUES('owner','alice','fixture','old','old'),('other','bob','fixture','old','old')").unwrap();
    if let Some(seed) = call["seed"].as_str() {
        connection.execute_batch(seed).unwrap()
    }
    let secret = "job-route-fixture".to_string();
    let auth = AuthState::new(connection, secret.clone()).unwrap();
    let worker = db::worker::DatabaseWorker::new(
        db::open_database(&path).unwrap(),
        NonZeroU16::new(64).unwrap(),
    )
    .unwrap();
    let step = Arc::new(Mutex::new(Value::Null));
    let calls = Arc::new(Mutex::new(Vec::<Value>::new()));
    let events = Arc::new(Mutex::new(Vec::<Value>::new()));
    let captured_step = step.clone();
    let captured_calls = calls.clone();
    let mut options = SchedulerOptions::new(
        worker.clone(),
        root.to_string_lossy().into_owned(),
        Arc::new(move |execution| {
            captured_calls.lock().unwrap().push(execution);
            let step = captured_step.lock().unwrap().clone();
            Box::pin(async move {
                if let Some(error) = step["throw"].as_str() {
                    return Err(error.into());
                }
                Ok(step
                    .get("result")
                    .filter(|v| !v.is_null())
                    .cloned()
                    .unwrap_or(json!({"ok":true,"message":"done","data":{"answer":42}})))
            })
        }),
    );
    options.clock = Arc::new(move || now);
    options.log = Arc::new(|_| {});
    let captured_events = events.clone();
    let captured_step = step.clone();
    options.on_executed = Some(Arc::new(move |event| {
        captured_events.lock().unwrap().push(event.clone());
        captured_step.lock().unwrap()["callbackError"]
            .as_str()
            .map_or(Ok(()), |e| Err(e.into()))
    }));
    let scheduler = SchedulerService::new(options);
    let registry = ProviderRegistry::default();
    let providers = call["providers"].as_array().cloned().unwrap_or_default();
    for p in &providers {
        registry.register(Arc::new(Provider(p.clone())));
    }
    let catalogue_calls = Arc::new(Mutex::new(Vec::<String>::new()));
    let captured_catalogue_calls = catalogue_calls.clone();
    let settings_error = call["settingsError"].as_str().map(str::to_owned);
    let routes = JobRoutes {
        auth: auth.clone(),
        scheduler: scheduler.clone(),
        project_root: root.to_string_lossy().into_owned(),
        clock: Arc::new(move || now),
        providers: if call["noRegistry"] == true {
            None
        } else {
            Some(registry)
        },
        provider_models: Arc::new(move |id| {
            let p = providers.iter().find(|p| p["id"] == id).unwrap().clone();
            if p["noModels"] != true {
                captured_catalogue_calls.lock().unwrap().push(id)
            }
            Box::pin(async move {
                if p["noModels"] == true {
                    return Ok(vec![]);
                }
                if let Some(error) = p["error"].as_str() {
                    return Err(error.into());
                }
                Ok(serde_json::from_value::<Vec<ProviderModelInfo>>(
                    p.get("models").cloned().unwrap_or(json!([])),
                )
                .unwrap())
            })
        }),
        jait_models: if call["jaitCatalogue"] == true {
            Some(JaitModelCatalogue {
                config: JaitModelsConfig {
                    ollama_url: "http://fixture.invalid:11434".into(),
                    omniroute_base_url: "http://fixture.invalid:20128/v1".into(),
                    ..Default::default()
                },
                fetchers: Arc::new(EmptyFetchers),
                user_api_keys: Arc::new(move |_| {
                    let error = settings_error.clone();
                    Box::pin(async move { error.map_or_else(|| Ok(HashMap::new()), Err) })
                }),
            })
        } else {
            None
        },
    };
    let gateway = Gateway::bind_authenticated(
        GatewayConfig {
            address: "127.0.0.1:0".parse().unwrap(),
        },
        HealthState::default(),
        auth.clone(),
    )
    .await
    .unwrap()
    .with_jobs(routes);
    let base = format!("http://{}", gateway.local_addr().unwrap());
    let (send, receive) = tokio::sync::oneshot::channel();
    let task = tokio::spawn(gateway.serve(async {
        let _ = receive.await;
    }));
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .build()
        .unwrap();
    let mut aliases = HashMap::<String, String>::new();
    let mut results = vec![];
    for s in call["steps"].as_array().unwrap() {
        *step.lock().unwrap() = s.clone();
        if let Some(sql) = s["sql"].as_str() {
            let mut sql = sql.to_string();
            for (id, alias) in &aliases {
                sql = sql.replace(&format!("${alias}"), id);
            }
            auth.with_database(move |db| Ok(db.execute_batch(&sql)?))
                .await
                .unwrap();
            continue;
        }
        let mut path = s["path"].as_str().unwrap().to_string();
        for (id, alias) in &aliases {
            path = path.replace(&format!("${alias}"), id);
        }
        let mut request = client
            .request(
                s["method"].as_str().unwrap().parse().unwrap(),
                format!("{base}{path}"),
            )
            .header("host", "fixture.local")
            .header("connection", "close");
        if let Some(headers) = s["headers"].as_object() {
            for (k, v) in headers {
                request = request.header(k, v.as_str().unwrap());
            }
        }
        if let Some(user) = s["user"].as_str() {
            let token = http_auth::sign_auth_token(
                &AuthUser {
                    id: user.into(),
                    username: if user == "owner" { "alice" } else { "bob" }.into(),
                },
                &secret,
            )
            .unwrap();
            request = if s["cookie"] == true {
                request.header("cookie", format!("jait_token={token}"))
            } else {
                request.bearer_auth(token)
            };
        }
        if s["oversize"] == true {
            request = request
                .header("content-type", "application/json")
                .body(vec![b'x'; 1048577]);
        } else if let Some(raw) = s["raw"].as_str() {
            request = request.body(raw.to_string())
        } else if let Some(body) = s.get("body") {
            request = request.json(body);
        }
        let response = request.send().await.unwrap();
        let status = response.status().as_u16();
        let content_type = response
            .headers()
            .get("content-type")
            .map(|v| v.to_str().unwrap().to_owned());
        let raw = response.text().await.unwrap();
        let body: Value = serde_json::from_str(&raw).unwrap_or(json!(raw));
        if let Some(alias) = s["alias"].as_str()
            && let Some(id) = body["id"].as_str()
        {
            assert_eq!(uuid::Uuid::parse_str(id).unwrap().get_version_num(), 7);
            aliases.insert(id.into(), alias.into());
        }
        observe(&body, &mut aliases);
        results.push(json!({"status":status,"body":body,"contentType":content_type}));
    }
    let events = events.lock().unwrap().clone();
    for event in &events {
        if let Some(id) = event["actionId"].as_str()
            && !aliases.contains_key(id)
        {
            aliases.insert(id.into(), format!("run:{}", aliases.len()));
        }
    }
    let actual = normalize(
        json!({"results":results,"calls":calls.lock().unwrap().clone(),"events":events,"catalogueCalls":catalogue_calls.lock().unwrap().clone()}),
        &aliases,
    );
    send.send(()).unwrap();
    task.await.unwrap().unwrap();
    auth.shutdown().await.unwrap();
    worker.shutdown().await.unwrap();
    if actual != expected {
        std::fs::write(
            fixture.join("actual.json"),
            serde_json::to_string_pretty(&actual).unwrap(),
        )
        .unwrap();
        std::fs::write(
            fixture.join("expected.json"),
            serde_json::to_string_pretty(&expected).unwrap(),
        )
        .unwrap();
        std::fs::write(
            fixture.join("scenario.json"),
            serde_json::to_string_pretty(&call).unwrap(),
        )
        .unwrap();
    }
    assert_eq!(
        actual,
        expected,
        "comparison artifacts: {}",
        fixture.display()
    );
}
fn create(name: &str) -> Value {
    json!({"method":"POST","path":"/api/jobs","user":"owner","body":{"name":name,"cron_expression":"* * * * *"},"alias":name})
}
#[tokio::test]
async fn crud_defaults_owner_filter_and_foreign_system_job_access() {
    compare(json!({"steps":[
        create("first"),
        {"method":"GET","path":"/api/jobs/$first","user":"other"},
        {"method":"PATCH","path":"/api/jobs/$first","user":"other","body":{"name":"stolen"}},
        {"method":"DELETE","path":"/api/jobs/$first","user":"other"},
        {"method":"GET","path":"/api/jobs/$first","user":"owner","cookie":true},
        {"method":"GET","path":"/api/jobs","user":"other"},
        {"sql":"UPDATE scheduled_jobs SET user_id=NULL WHERE id='$first'"},
        {"method":"GET","path":"/api/jobs/$first","user":"other"},
        {"method":"PATCH","path":"/api/jobs/$first","user":"other","body":{"name":" shared ","enabled":false}},
        {"method":"GET","path":"/api/jobs?include_disabled=false","user":"owner"},
        {"method":"DELETE","path":"/api/jobs/$first","user":"other"},
        {"method":"GET","path":"/api/jobs/$first","user":"owner"}
    ]})).await;
}
#[tokio::test]
async fn create_validation_primitive_bodies_booleans_and_tool_normalization() {
    let mut steps = vec![];
    for body in [
        json!(null),
        json!([]),
        json!("text"),
        json!({}),
        json!({"name":1,"cron_expression":"* * * * *"}),
        json!({"name":"x","cron_expression":"broken"}),
        json!({"name":"x","cron_expression":"* * * * *","job_type":"agent_task"}),
    ] {
        steps.push(json!({"method":"POST","path":"/api/jobs","user":"owner","body":body}));
    }
    for (i, enabled) in [
        json!(true),
        json!(false),
        json!("TRUE"),
        json!("false"),
        json!(" true "),
        json!(0),
        json!(null),
    ]
    .into_iter()
    .enumerate()
    {
        steps.push(json!({"method":"POST","path":"/api/jobs","user":"owner","alias":format!("x{i}"),"body":{"name":" ﻿ job   ","cron_expression":" * * * * * ","enabled":enabled,"payload":{"command":" a.b_c ","args":{"__jaitJobMeta":{"once":true},"title":"keep"}}}}));
    }
    steps.push(json!({"method":"GET","path":"/api/jobs","user":"owner"}));
    compare(json!({"steps":steps})).await;
}
#[tokio::test]
async fn agent_task_conversion_and_semantic_patch_preserve_source_rules() {
    compare(json!({"steps":[
        {"method":"POST","path":"/api/jobs","user":"owner","alias":"agent","body":{"name":"assistant","cron_expression":"*/5 * * * *","job_type":"agent_task","prompt":"  execute  ","provider":"jait","model":"initial","payload":{"title":"remove","custom":7,"action":"delete","kind":"delegation","detach":false,"workingDirectory":"/ignored"}}},
        {"method":"PATCH","path":"/api/jobs/$agent","user":"owner","body":{"enabled":"false","name":" preserve spaces "}},
        {"method":"PATCH","path":"/api/jobs/$agent","user":"owner","body":{"model":null,"prompt":" "}},
        {"method":"PATCH","path":"/api/jobs/$agent","user":"owner","body":{"provider":"","description":"details","payload":{"title":"remove again","extra":true}}},
        {"method":"POST","path":"/api/jobs/$agent/trigger","user":"owner"},
        {"method":"PATCH","path":"/api/jobs/$agent","user":"owner","body":{"job_type":"system_job","payload":{"command":" gateway_status ","args":{"x":8}}}},
        {"method":"PATCH","path":"/api/jobs/$agent","user":"owner","body":{"job_type":"agent_task","prompt":" next "}},
        {"method":"GET","path":"/api/jobs/$agent/runs","user":"owner"}
    ]})).await;
}
#[tokio::test]
async fn inference_from_cron_records_and_metadata_edges_match() {
    let mut steps = vec![];
    for (i,(tool,input))in [
        ("thread_control",json!({"prompt":"  task ","providerId":"p","model":"m","title":"remove"})),
        ("agent_spawn",json!({"prompt":"task","__jaitJobMeta":{},"providerId":"p"})),
        ("thread.control",json!({"prompt":"task","__jaitJobMeta":{"jobType":"system_job","prompt":"","model":null}})),
        ("thread.control",json!({"__jaitJobMeta":{"jobType":"agent_thread_job","prompt":"legacy"}})),
        ("gateway.status",json!([1,2])),
    ].into_iter().enumerate(){
        steps.push(create(&format!("seed{i}")));
        steps.push(json!({"sql":format!("UPDATE scheduled_jobs SET tool_name='{}',input='{}' WHERE id='$seed{}'",tool,input,i)}));
    }
    steps.push(json!({"method":"GET","path":"/api/jobs","user":"owner"}));
    steps.push(json!({"method":"PATCH","path":"/api/jobs/$seed0","user":"owner","body":{"model":"changed"}}));
    steps.push(
        json!({"method":"PATCH","path":"/api/jobs/$seed1","user":"owner","body":{"payload":[]}}),
    );
    compare(json!({"steps":steps})).await;
}
#[tokio::test]
async fn trigger_failure_history_callback_error_and_owner_denial_match() {
    compare(json!({"steps":[create("job"),
        {"method":"POST","path":"/api/jobs/$job/trigger","user":"other"},
        {"method":"POST","path":"/api/jobs/$job/trigger","user":"owner","result":{"ok":false,"message":"rejected"}},
        {"method":"POST","path":"/api/jobs/$job/trigger","user":"owner","throw":"engine failed"},
        {"method":"POST","path":"/api/jobs/$job/trigger","user":"owner","callbackError":"listener failed"},
        {"method":"GET","path":"/api/jobs/$job/runs","user":"other"},
        {"method":"GET","path":"/api/jobs/$job/runs?page=1&size=2","user":"owner"},
        {"method":"GET","path":"/api/jobs/$job/runs?page=2&size=2","user":"owner"},
        {"method":"POST","path":"/api/jobs/missing/trigger","user":"owner"}
    ]})).await;
}
#[tokio::test]
async fn query_pagination_repeated_values_and_invalid_patch_validation_match() {
    let mut steps = vec![create("first"), create("second"), create("third")];
    for query in [
        "page=2&size=1",
        "page=0&size=0",
        "page=-2&size=-3",
        "page=2junk&size=1tail",
        "page=2&page=3&size=1",
        "size=9999&include_disabled=FALSE",
        "page=garbage&size=NaN",
        "page=9999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999",
    ] {
        steps.push(json!({"method":"GET","path":format!("/api/jobs?{query}"),"user":"owner"}));
    }
    for body in [
        json!({"cron_expression":null}),
        json!({"cron_expression":"bad"}),
        json!({"job_type":"agent_task","prompt":" "}),
        json!({"enabled":null}),
        json!({"payload":{"args":true}}),
    ] {
        steps.push(json!({"method":"PATCH","path":"/api/jobs/$first","user":"owner","body":body}));
    }
    compare(json!({"steps":steps})).await;
}
#[tokio::test]
async fn provider_visibility_missing_methods_failure_isolation_and_jait_expansion_match() {
    let providers = json!([
        {"id":"shared","name":"Shared","models":[{"id":"s","name":"S"}]},
        {"id":"owned","name":"Owned","owner":"owner","models":[{"id":"o","name":"O"}]},
        {"id":"foreign","name":"Foreign","owner":"other","models":[{"id":"f","name":"F"}]},
        {"id":"empty","name":"Empty","noModels":true},
        {"id":"broken","name":"Broken","error":"offline"},
        {"id":"jait","name":"Jait","models":[{"id":"fallback","name":"Fallback"}]}
    ]);
    for catalogue in [false, true] {
        compare(
            json!({"providers":providers,"jaitCatalogue":catalogue,"steps":[
                {"method":"GET","path":"/api/jobs/providers/available","user":"owner"},
                {"method":"GET","path":"/api/jobs/providers/available","user":"other"}
            ]}),
        )
        .await;
    }
    compare(json!({"providers":providers,"jaitCatalogue":true,"settingsError":"settings failed","steps":[{"method":"GET","path":"/api/jobs/providers/available","user":"owner"}]})).await;
    compare(json!({"providers":providers,"noRegistry":true,"steps":[{"method":"GET","path":"/api/jobs/providers/available","user":"owner"}]})).await;
}
#[tokio::test]
async fn authentication_body_limits_poisoning_and_origin_checks_match() {
    compare(json!({"steps":[
        {"method":"GET","path":"/api/jobs"},
        {"method":"POST","path":"/api/jobs","user":"owner","headers":{"content-type":"application/json"},"raw":"{"},
        {"method":"POST","path":"/api/jobs","user":"owner","headers":{"content-type":"application/json"},"raw":"{\"__proto__\":{}}"},
        {"method":"POST","path":"/api/jobs","user":"owner","headers":{"content-type":"application/json"},"raw":""},
        {"method":"POST","path":"/api/jobs","user":"owner","headers":{"content-type":"text/plain"},"raw":"text"},
        {"method":"POST","path":"/api/jobs","user":"owner","oversize":true},
        {"method":"POST","path":"/api/jobs","user":"owner","headers":{"content-type":"application/xml"},"raw":"xml"},
        {"method":"GET","path":"/api/jobs/%FF","user":"owner"},
        {"method":"GET","path":"/api/jobs/%zz","user":"owner"},
        {"method":"POST","path":"/api/jobs","headers":{"content-type":"application/json"},"raw":"{"},
        {"method":"GET","path":"/api/jobs","user":"owner","headers":{"origin":"https://foreign.invalid"}}
    ]})).await;
}

#[tokio::test]
async fn sqlite_faults_preserve_structured_errors_and_trigger_catch_boundaries() {
    compare(json!({"steps":[
        {"sql":"CREATE TRIGGER reject_create BEFORE INSERT ON scheduled_jobs BEGIN SELECT RAISE(FAIL, 'create refused'); END"},
        create("first"),
        {"sql":"DROP TRIGGER reject_create"},
        create("first"),
        {"sql":"CREATE TRIGGER reject_update BEFORE UPDATE ON scheduled_jobs BEGIN SELECT RAISE(FAIL, 'update refused'); END"},
        {"method":"PATCH","path":"/api/jobs/$first","user":"owner","body":{"name":"cannot write"}},
        {"method":"GET","path":"/api/jobs/$first","user":"owner"},
        {"method":"POST","path":"/api/jobs/$first/trigger","user":"owner"},
        {"sql":"DROP TRIGGER reject_update; CREATE TRIGGER reject_delete BEFORE DELETE ON scheduled_jobs BEGIN SELECT RAISE(FAIL, 'delete refused'); END"},
        {"method":"DELETE","path":"/api/jobs/$first","user":"owner"},
        {"sql":"CREATE TRIGGER reject_run BEFORE INSERT ON scheduled_job_runs BEGIN SELECT RAISE(FAIL, 'start refused'); END"},
        {"method":"POST","path":"/api/jobs/$first/trigger","user":"owner"},
        {"sql":"ALTER TABLE scheduled_jobs RENAME TO hidden_jobs"},
        {"method":"GET","path":"/api/jobs","user":"owner"}
    ]})).await;
}
