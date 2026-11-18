#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::{
    Gateway,
    assessments::service::{AssessmentOptions, AssessmentRegistry, ProbeState},
    config::GatewayConfig,
    db,
    health::HealthState,
    routes::{auth::AuthState, security_assessments::SecurityAssessmentRoutes},
    security::http_auth::{self, AuthUser},
    time,
};
use serde_json::{Value, json};
use std::{collections::HashMap, path::PathBuf, sync::Arc, time::Duration};
static LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}
fn normalize(value: &mut Value) {
    match value {
        Value::Array(values) => values.iter_mut().for_each(normalize),
        Value::Object(fields) => {
            for (key, value) in fields {
                match key.as_str() {
                    "id" | "scopeId" => *value = json!("<id>"),
                    "createdAt" | "startedAt" | "completedAt" | "observedAt"
                        if !value.is_null() =>
                    {
                        *value = json!("<time>")
                    }
                    // JSON parser diagnostics belong to the engine; retain the
                    // HTTP error status and reject invalid persisted metadata in both.
                    "error"
                        if value.as_str().is_some_and(|message| {
                            message.starts_with("JSON Parse error:")
                                || message == "Invalid session metadata"
                        }) =>
                    {
                        *value = json!("<invalid persisted JSON>")
                    }
                    "vantagePoint" => *value = json!("<host>"),
                    "engine" => *value = json!("<tcp-engine>"),
                    "engineVersion" => *value = json!("<engine-version>"),
                    _ => normalize(value),
                }
            }
        }
        _ => {}
    }
}
async fn compare(mut call: Value) {
    let _lock = LOCK.lock().await;
    call["op"] = json!("nativeassessmenthttp.run");
    let root = root();
    let mut expected = internal_driver::call(
        &root,
        &root
            .join(".jait/artifacts/gateway-rust/assessment-http/contracts")
            .join(uuid::Uuid::new_v4().to_string()),
        json!({"version":1,"calls":[call.clone()]}),
        &|| false,
    )
    .unwrap()[0]
        .clone();
    normalize(&mut expected);
    let fixture = root
        .join(".jait/artifacts/gateway-rust/assessment-http/native-fixtures")
        .join(uuid::Uuid::new_v4().to_string());
    std::fs::create_dir_all(&fixture).unwrap();
    let database_path = fixture.join("state.sqlite");
    let connection = db::open_database(&database_path).unwrap();
    db::migrate_database(&connection).unwrap();
    connection.execute_batch("INSERT INTO users(id,username,password_hash,created_at,updated_at)VALUES('owner','alice','fixture','old','old'),('other','bob','fixture','old','old')").unwrap();
    if let Some(seed) = call["seed"].as_str() {
        connection.execute_batch(seed).unwrap();
    }
    let secret = "assessment-route-fixture".to_string();
    let auth = AuthState::new(connection, secret.clone()).unwrap();
    let mut options = AssessmentOptions::new("native-route-contract".into()).unwrap();
    options.probe = Arc::new(|_, abort| {
        Box::pin(async move {
            abort.cancelled().await;
            Ok(ProbeState::Error)
        })
    });
    let registry = AssessmentRegistry::new(options);
    let assessment_worker = db::worker::DatabaseWorker::new(
        db::open_database(&database_path).unwrap(),
        std::num::NonZeroU16::new(64).unwrap(),
    )
    .unwrap();
    registry
        .set_database(Arc::new(
            jait_gateway::assessments::store::SqliteAssessmentStore::new(assessment_worker.clone()),
        ))
        .await
        .unwrap();
    let gateway = Gateway::bind_authenticated(
        GatewayConfig {
            address: "127.0.0.1:0".parse().unwrap(),
        },
        HealthState::default(),
        auth.clone(),
    )
    .await
    .unwrap()
    .with_security_assessments(SecurityAssessmentRoutes {
        auth: auth.clone(),
        assessments: registry.clone(),
        project_database: if call["noProjectDatabase"] == true {
            None
        } else {
            Some(auth.clone())
        },
    });
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
    let mut actual = vec![];
    for step in call["steps"].as_array().unwrap() {
        if let Some(alias) = step["wait"].as_str() {
            registry
                .get()
                .await
                .wait(&aliases[alias], step["user"].as_str().unwrap_or("owner"))
                .await
                .unwrap();
            continue;
        }
        if let Some(sql) = step["sql"].as_str() {
            let sql = sql.to_string();
            auth.with_database(move |db| Ok(db.execute_batch(&sql)?))
                .await
                .unwrap();
            continue;
        }
        let mut path = step["path"].as_str().unwrap().to_string();
        for (alias, id) in &aliases {
            path = path.replace(&format!("${alias}"), id);
        }
        let mut request = client
            .request(
                step["method"].as_str().unwrap().parse().unwrap(),
                format!("{base}{path}"),
            )
            .header("host", "fixture.local")
            .header("connection", "close");
        if let Some(headers) = step["headers"].as_object() {
            for (k, v) in headers {
                request = request.header(k, v.as_str().unwrap());
            }
        }
        if let Some(user) = step["user"].as_str() {
            let token = http_auth::sign_auth_token(
                &AuthUser {
                    id: user.into(),
                    username: if user == "owner" { "alice" } else { "bob" }.into(),
                },
                &secret,
            )
            .unwrap();
            request = if step["cookie"] == true {
                request.header("cookie", format!("jait_token={token}"))
            } else {
                request.bearer_auth(token)
            };
        }
        if let Some(raw) = step["raw"].as_str() {
            request = request.body(raw.to_string());
        } else if let Some(body) = step.get("body") {
            let mut body = body.clone();
            // Fixture aliases are spelled as a dollar sign followed by a name.
            if let Some(id) = body["scopeId"]
                .as_str()
                .and_then(|value| value.strip_prefix('\x24'))
                .and_then(|alias| aliases.get(alias))
            {
                body["scopeId"] = json!(id);
            }
            request = request.json(&body);
        }
        let response = request.send().await.unwrap();
        let status = response.status().as_u16();
        let raw = response.text().await.unwrap();
        let body: Value = serde_json::from_str(&raw).unwrap_or(json!(raw));
        if let Some(alias) = step["alias"].as_str()
            && let Some(id) = body["id"].as_str()
        {
            aliases.insert(alias.into(), id.into());
        }
        actual.push(json!({"status":status,"body":body}));
    }
    for id in aliases.values() {
        let service = registry.get().await;
        if service.cancel(id, "owner").await.is_ok() {
            let _ = service.wait(id, "owner").await;
        }
    }
    let mut actual = json!(actual);
    normalize(&mut actual);
    send.send(()).unwrap();
    task.await.unwrap().unwrap();
    auth.shutdown().await.unwrap();
    assessment_worker.shutdown().await.unwrap();
    assert_eq!(
        actual.as_array().unwrap().len(),
        expected.as_array().unwrap().len()
    );
    for (index, (actual, expected)) in actual
        .as_array()
        .unwrap()
        .iter()
        .zip(expected.as_array().unwrap())
        .enumerate()
    {
        assert_eq!(actual, expected, "response index {index}");
    }
}
fn input() -> Value {
    json!({"authorized":true,"targets":["192.0.2.1"],"exclusions":[],"ports":[443],"expiresAt":time::iso(chrono::Utc::now().timestamp_millis()+600000).unwrap()})
}
fn create(body: Value) -> Value {
    json!({"method":"POST","path":"/api/security/scopes","user":"owner","body":body,"alias":"scope"})
}
#[tokio::test]
async fn authenticated_routes_preserve_owner_errors_status_and_cancel() {
    compare(json!({"steps":[{"method":"GET","path":"/api/security/assessments"},{"method":"GET","path":"/api/security/assessments","user":"owner"},create(input()),{"method":"POST","path":"/api/security/assessments","user":"other","body":{"scopeId":"$scope"}},{"method":"POST","path":"/api/security/assessments","user":"owner","body":{"scopeId":"$scope"},"alias":"run"},{"method":"GET","path":"/api/security/assessments/$run","user":"other"},{"method":"POST","path":"/api/security/assessments/$run/cancel","user":"other"},{"method":"GET","path":"/api/security/assessments/$run","user":"owner"},{"method":"POST","path":"/api/security/assessments/$run/cancel","user":"owner"},{"wait":"run"},{"method":"GET","path":"/api/security/assessments/$run","user":"owner"},{"method":"GET","path":"/api/security/assessments","user":"owner"}]})).await;
}
#[tokio::test]
async fn malformed_start_inputs_and_missing_records() {
    let mut steps = vec![];
    for body in [
        json!(null),
        json!({}),
        json!({"scopeId":3}),
        json!({"scopeId":""}),
        json!({"scopeId":"missing"}),
    ] {
        steps.push(
            json!({"method":"POST","path":"/api/security/assessments","user":"owner","body":body}),
        );
    }
    steps.extend([
        json!({"method":"GET","path":"/api/security/assessments/missing","user":"owner"}),
        json!({"method":"POST","path":"/api/security/assessments/missing/cancel","user":"owner"}),
    ]);
    compare(json!({"steps":steps})).await;
}
#[tokio::test]
async fn project_binding_denies_missing_foreign_deleted_and_remote_sessions() {
    let project = root().join(".jait/artifacts/gateway-rust/assessment-http/project");
    std::fs::create_dir_all(&project).unwrap();
    let path = project.to_str().unwrap();
    let seed = format!(
        "INSERT INTO projects(id,user_id,title,root_path,node_id,created_at,last_active_at,status,kind)VALUES('project','owner','Project','{path}','gateway','old','old','active','folder'),('foreign-project','other','Foreign','{path}','gateway','old','old','active','folder');INSERT INTO sessions(id,user_id,project_id,name,project_path,metadata,created_at,last_active_at,status)VALUES('owned','owner','project','Chat','{path}','{{}}','old','old','active'),('foreign','other',NULL,'Chat','{path}','{{}}','old','old','active'),('deleted','owner','project','Chat','{path}','{{}}','old','old','deleted'),('wrong-project','owner','foreign-project','Chat','{path}','{{}}','old','old','active'),('remote','owner','project','Chat','{path}','{{\"executionNodeId\":\"remote\"}}','old','old','active');"
    );
    let mut steps = vec![];
    for session in [
        None,
        Some("missing"),
        Some("foreign"),
        Some("deleted"),
        Some("wrong-project"),
        Some("remote"),
        Some("owned"),
    ] {
        let mut body = input();
        body["paths"] = json!(["."]);
        if let Some(session) = session {
            body["sessionId"] = json!(session);
        }
        steps.push(create(body));
    }

    let mut scoped = input();
    scoped["paths"] = json!(["."]);
    scoped["sessionId"] = json!("owned");
    for metadata in ["not-json", "null", "[]", "{}"] {
        steps.push(
            json!({"sql":format!("UPDATE sessions SET metadata='{}' WHERE id='owned'",metadata)}),
        );
        steps.push(create(scoped.clone()));
    }
    steps.push(json!({"sql":"UPDATE projects SET node_id='remote' WHERE id='project'"}));
    steps.push(create(scoped.clone()));
    steps.push(json!({"sql":"UPDATE projects SET node_id='gateway' WHERE id='project'"}));
    scoped["paths"] = json!(["../outside"]);
    steps.push(create(scoped));
    compare(json!({"seed":seed,"steps":steps})).await;
    let mut body = input();
    body["paths"] = json!(["."]);
    body["sessionId"] = json!("owned");
    compare(json!({"noProjectDatabase":true,"steps":[create(body)]})).await;
}

#[tokio::test]
async fn invalid_scopes_and_cookie_authentication() {
    let mut denied = input();
    denied["authorized"] = json!(false);
    let mut hostile = input();
    hostile["targets"] = json!(["127.0.0.1; touch /forbidden"]);
    let mut wrong_method = input();
    wrong_method["methods"] = json!(["tls"]);
    let mut steps = vec![
        create(denied),
        create(hostile),
        create(wrong_method),
        json!({"method":"POST","path":"/api/security/assessments","user":"owner","body":{"scopeId":"$scope"}}),
    ];
    steps.push(
        json!({"method":"GET","path":"/api/security/assessments","user":"owner","cookie":true}),
    );
    steps.push(json!({"method":"GET","path":"/api/security/assessments","user":"owner","cookie":true,"headers":{"origin":"https://foreign.invalid"}}));
    steps.push(json!({"method":"GET","path":"/api/security/assessments","user":"deleted"}));
    compare(json!({"steps":steps})).await;
}

#[tokio::test]
async fn malformed_scope_bodies_preserve_route_error_order() {
    let mut steps = vec![];
    for body in [
        json!(null),
        json!(false),
        json!(3),
        json!("text"),
        json!([]),
        json!({}),
        json!({"paths":["."],"sessionId":false}),
        json!({"paths":"abc","sessionId":3}),
    ] {
        steps.push(create(body));
    }
    steps.push(json!({"method":"POST","path":"/api/security/scopes","user":"owner","headers":{"content-type":"application/json"},"raw":"{bad"}));
    compare(json!({"steps":steps})).await;
}

#[tokio::test]
async fn missing_scope_body_and_storage_read_failure_are_reported() {
    compare(json!({"steps":[
        {"method":"POST","path":"/api/security/scopes","user":"owner"},
        {"sql":"DROP TABLE security_scopes"},
        {"method":"GET","path":"/api/security/assessments","user":"owner"}
    ]}))
    .await;
}
