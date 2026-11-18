#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::{
    Gateway,
    config::GatewayConfig,
    db,
    health::HealthState,
    routes::{
        auth::AuthState,
        skills::{SkillRecord, SkillRoutes, ToolStatus},
    },
    security::http_auth::{self, AuthUser},
};
use serde_json::{Value, json};
use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
    time::Duration,
};
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}
fn skill(id: &str) -> Value {
    json!({"id":id,"name":format!("Skill {id}"),"description":"fixture description","filePath":"/fixture/SKILL.md","source":"user","enabled":true,"unrelated":"omitted"})
}
async fn compare(mut call: Value) {
    call["op"] = json!("nativeskillhttp.routes");
    let expected = internal_driver::call(
        &root(),
        &root().join(".jait/artifacts/gateway-rust/skill-http"),
        json!({"version":1,"calls":[call.clone()]}),
        &|| false,
    )
    .unwrap()[0]
        .clone();
    let db = db::open_database(std::path::Path::new(":memory:")).unwrap();
    db::migrate_database(&db).unwrap();
    db.execute_batch("INSERT INTO users(id,username,password_hash,created_at,updated_at)VALUES('owner','alice','fixture','old','old'),('other','bob','fixture','old','old')").unwrap();
    let auth = AuthState::new(db, "skill-http-fixture".into()).unwrap();
    let records: Arc<Mutex<Vec<SkillRecord>>> = Arc::new(Mutex::new(Vec::new()));
    for skill in call["skills"].as_array().unwrap() {
        let mut records = records.lock().unwrap();
        if let Some(record) = records
            .iter_mut()
            .find(|record| record.lock().unwrap()["id"] == skill["id"])
        {
            *record = Arc::new(Mutex::new(skill.clone()));
        } else {
            records.push(Arc::new(Mutex::new(skill.clone())));
        }
    }
    let current = Arc::new(Mutex::new(json!({})));
    let events = Arc::new(Mutex::new(Vec::<Value>::new()));
    let list = records.clone();
    let get = records.clone();
    let set = records.clone();
    let checks = events.clone();
    let checking = current.clone();
    let installs = events.clone();
    let installing = current.clone();
    let routes = SkillRoutes {
        auth: auth.clone(),
        list: Arc::new(move || Ok(list.lock().unwrap().clone())),
        get: Arc::new(move |id| {
            Ok(get
                .lock()
                .unwrap()
                .iter()
                .find(|record| record.lock().unwrap()["id"] == id)
                .cloned())
        }),
        set_enabled: Arc::new(move |id, enabled| {
            if let Some(skill) = set
                .lock()
                .unwrap()
                .iter()
                .find(|record| record.lock().unwrap()["id"] == id)
            {
                skill.lock().unwrap()["enabled"] = json!(enabled);
            }
            Ok(())
        }),
        check_tools: Arc::new(move |skill| {
            checks.lock().unwrap().push(json!({"check":skill["id"]}));
            let step = checking.lock().unwrap();
            if let Some(message) = step["checkThrow"].as_str() {
                return Err(message.into());
            }
            let status = &step["tools"][skill["id"].as_str().unwrap()];
            Ok(ToolStatus {
                satisfied: status["satisfied"].as_bool().unwrap_or(true),
                missing: status["missing"]
                    .as_array()
                    .map(|a| a.iter().map(|s| s.as_str().unwrap().into()).collect())
                    .unwrap_or_default(),
            })
        }),
        install_tool: Arc::new(move |record, install_id| {
            let step = installing.lock().unwrap().clone();
            let events = installs.clone();
            Box::pin(async move {
                let mut event = json!({"install":record.lock().unwrap()["id"]});
                if let Some(id) = install_id {
                    event["installId"] = id;
                }
                events.lock().unwrap().push(event);
                tokio::task::yield_now().await;
                if let Some(message) = step["installThrow"].as_str() {
                    return Err(message.into());
                }
                if let Some(changes) = step["afterInstall"].as_object() {
                    let mut record = record.lock().unwrap();
                    for (k, v) in changes {
                        record[k] = v.clone();
                    }
                }
                Ok(step.get("installResult").cloned().unwrap_or(
                    json!({"ok":true,"package":"fixture-package","output":"fixture output"}),
                ))
            })
        }),
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
    .with_skills(routes);
    let base = format!("http://{}", gateway.local_addr().unwrap());
    let (send, receive) = tokio::sync::oneshot::channel();
    let task = tokio::spawn(gateway.serve(async {
        let _ = receive.await;
    }));
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .build()
        .unwrap();
    let mut results = vec![];
    for step in call["steps"].as_array().unwrap() {
        *current.lock().unwrap() = step.clone();
        let mut request = client
            .request(
                step["method"].as_str().unwrap().parse().unwrap(),
                format!("{base}{}", step["path"].as_str().unwrap()),
            )
            .header("host", "fixture.local")
            .header("connection", "close");
        if let Some(headers) = step["headers"].as_object() {
            for (k, v) in headers {
                request = request.header(k, v.as_str().unwrap());
            }
        }
        for (key, cookie) in [("user", false), ("cookie", true)] {
            if let Some(user) = step[key].as_str() {
                let token = http_auth::sign_auth_token(
                    &AuthUser {
                        id: user.into(),
                        username: if user == "owner" { "alice" } else { "bob" }.into(),
                    },
                    "skill-http-fixture",
                )
                .unwrap();
                request = if cookie {
                    request.header("cookie", format!("jait_token={token}"))
                } else {
                    request.bearer_auth(token)
                };
            }
        }
        if let Some(raw) = step["raw"].as_str() {
            request = request.body(raw.to_string());
        } else if let Some(body) = step.get("body") {
            request = request.body(body.to_string());
            if step["headers"]["content-type"].is_null() {
                request = request.header("content-type", "application/json");
            }
        }
        let res = request.send().await.unwrap();
        let status = res.status().as_u16();
        let raw = res.text().await.unwrap();
        let body = serde_json::from_str::<Value>(&raw).unwrap_or(json!(raw));
        results.push(json!({"status":status,"body":body}));
    }
    let values: Vec<Value> = records
        .lock()
        .unwrap()
        .iter()
        .map(|r| r.lock().unwrap().clone())
        .collect();
    let actual = json!({"results":results,"events":*events.lock().unwrap(),"skills":values});
    send.send(()).unwrap();
    task.await.unwrap().unwrap();
    auth.shutdown().await.unwrap();
    assert_eq!(actual, expected);
}
#[tokio::test]
async fn list_projection_order_auth_and_mutable_enable_state_match() {
    let mut b = skill("two");
    b["requires"] = json!({"bins":["synthetic-missing"]});
    b["install"] = json!([]);
    compare(json!({"skills":[skill("one"),b,skill("one")],"steps":[
        {"method":"GET","path":"/api/skills"},
        {"method":"GET","path":"/api/skills","user":"owner","tools":{"two":{"satisfied":false,"missing":["synthetic-missing"]}}},
        {"method":"PATCH","path":"/api/skills/one","user":"owner","body":{"enabled":false,"ignored":1}},
        {"method":"GET","path":"/api/skills","user":"other"},
        {"method":"PATCH","path":"/api/skills/two","user":"owner","body":{"enabled":"false"}},
        {"method":"PATCH","path":"/api/skills/two","user":"owner","body":null},
        {"method":"PATCH","path":"/api/skills/missing","user":"owner","body":{"enabled":false}},
        {"method":"GET","path":"/api/skills","user":"deleted"},
        {"method":"PATCH","path":"/api/skills/one","cookie":"owner","headers":{"origin":"https://evil.example"},"body":{"enabled":true}},
        {"method":"GET","path":"/api/skills","cookie":"owner"},
        {"method":"HEAD","path":"/api/skills","user":"owner"}
    ]})).await;
}
#[tokio::test]
async fn install_service_results_errors_and_shared_record_mutations_match() {
    compare(json!({"skills":[skill("one")],"steps":[
        {"method":"POST","path":"/api/skills/missing/install-tool","user":"owner","body":{}},
        {"method":"POST","path":"/api/skills/one/install-tool","user":"owner","body":{"installId":"one"},"installResult":{"ok":true,"package":"fixture","output":"done","skill":"must be replaced"},"afterInstall":{"requires":{},"install":[],"enabled":false}},
        {"method":"POST","path":"/api/skills/one/install-tool","user":"owner","body":null,"installThrow":"Unsupported install kind: brew"},
        {"method":"POST","path":"/api/skills/one/install-tool","user":"owner","body":{"installId":null},"installThrow":"No matching install option"},
        {"method":"POST","path":"/api/skills/one/install-tool","user":"owner","body":{"installId":0},"installThrow":"npm exited","throwString":true},
        {"method":"POST","path":"/api/skills/one/install-tool","user":"owner","body":[],"checkThrow":"checker failed"},
        {"method":"GET","path":"/api/skills","user":"owner","checkThrow":"list checker failed"}
    ]})).await;
}
#[tokio::test]
async fn malformed_and_wrong_content_type_bodies_preserve_framework_errors() {
    compare(json!({"skills":[skill("one")],"steps":[
        {"method":"PATCH","path":"/api/skills/one","user":"owner","headers":{"content-type":"application/json"},"raw":"{bad"},
        {"method":"PATCH","path":"/api/skills/one","user":"owner","headers":{"content-type":"application/json"},"raw":""},
        {"method":"POST","path":"/api/skills/one/install-tool","user":"owner","headers":{"content-type":"application/xml"},"raw":"<body/>"},
        {"method":"PATCH","path":"/api/skills/one","user":"owner","body":{"enabled":null}},
        {"method":"PATCH","path":"/api/skills/one","user":"owner","body":false},
        {"method":"POST","path":"/api/skills/one/install-tool","user":"owner","body":"text"}
    ]})).await;
}

#[tokio::test]
async fn empty_and_null_optional_metadata_preserve_javascript_omission_rules() {
    let mut records = vec![];
    for (i, value) in [
        Value::Null,
        json!(false),
        json!(0),
        json!(""),
        json!([]),
        json!({}),
        json!({"bins":[]}),
    ]
    .into_iter()
    .enumerate()
    {
        let mut record = skill(&format!("skill-{i}"));
        record["requires"] = value.clone();
        record["install"] = value;
        records.push(record);
    }
    compare(
        json!({"skills":records,"steps":[{"method":"GET","path":"/api/skills","user":"owner"}]}),
    )
    .await;
}
