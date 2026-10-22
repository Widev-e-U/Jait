#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::{
    db,
    routes::{
        auth::AuthState,
        reminders::{ReminderExtraPort, ReminderRoutes},
    },
    security::http_auth::{self, AuthUser},
    services::reminders::{ListReminderOptions, ReminderService},
};
use serde_json::{Value, json};
use std::{
    collections::BTreeMap,
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
fn normalize(v: &Value, aliases: &BTreeMap<String, String>) -> Value {
    match v {
        Value::String(s) => {
            let mut s = s.clone();
            for (id, label) in aliases {
                s = s.replace(id, label);
            }
            json!(s)
        }
        Value::Array(a) => json!(a.iter().map(|v| normalize(v, aliases)).collect::<Vec<_>>()),
        Value::Object(o) => Value::Object(
            o.iter()
                .map(|(k, v)| (k.clone(), normalize(v, aliases)))
                .collect(),
        ),
        _ => v.clone(),
    }
}
async fn scenario(call: Value) {
    let expected = internal_driver::call(
        &root(),
        &root()
            .join(".jait/artifacts/gateway-rust/reminder-http/contracts")
            .join(uuid::Uuid::new_v4().to_string()),
        json!({"version":1,"calls":[call]}),
        &|| false,
    )
    .unwrap()[0]
        .clone();
    let db = db::open_database(std::path::Path::new(":memory:")).unwrap();
    db::migrate_database(&db).unwrap();
    db.execute_batch("INSERT INTO users(id,username,password_hash,created_at,updated_at)VALUES('owner','alice','fixture','old','old'),('other','bob','fixture','old','old');").unwrap();
    if let Some(seed) = call["seed"].as_str() {
        db.execute_batch(seed).unwrap();
    }
    let auth = AuthState::new(db, "reminder-http-secret".into()).unwrap();
    let events = Arc::new(Mutex::new(vec![]));
    let active = Arc::new(Mutex::new(Value::Null));
    let mut routes = ReminderRoutes::new(auth.clone());
    routes.time = Some("2026-10-22T00:00:00.000Z".into());
    for service in call["extras"].as_array().into_iter().flatten() {
        let name = service.as_str().unwrap().to_string();
        let logs = events.clone();
        let step = active.clone();
        let definition = call.clone();
        let port: ReminderExtraPort = Arc::new(move |method, args| {
            logs.lock()
                .unwrap()
                .push(json!({"service":name,"method":method,"args":args}));
            let fail = step.lock().unwrap()["portError"] == format!("{name}.{method}");
            let result = if fail {
                Err(format!("fixture {name} failure"))
            } else {
                Ok(match (name.as_str(), method) {
                    ("memory", "list") => definition.get("memories").cloned().unwrap_or(json!([])),
                    ("memory", "forget") => json!(args[0] == "engine"),
                    ("projects", "listWithSessions") => definition
                        .get("projects")
                        .cloned()
                        .unwrap_or(json!({"projects":[],"hasMore":false})),
                    ("projects", "getById") | ("sessions", "getById") => {
                        if args[0] == "owned" {
                            json!({"id":"owned"})
                        } else {
                            Value::Null
                        }
                    }
                    ("threads", "list") => definition.get("threads").cloned().unwrap_or(json!([])),
                    _ => panic!("unknown port"),
                })
            };
            Box::pin(async move { result })
        });
        match service.as_str().unwrap() {
            "memory" => routes.memory = Some(port),
            "projects" => routes.projects = Some(port),
            "sessions" => routes.sessions = Some(port),
            "threads" => routes.threads = Some(port),
            _ => unreachable!(),
        }
    }
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    let (send, receive) = tokio::sync::oneshot::channel();
    let task = tokio::spawn(async move {
        axum::serve(listener, routes.router())
            .with_graceful_shutdown(async {
                let _ = receive.await;
            })
            .await
            .unwrap();
    });
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .build()
        .unwrap();
    let mut results = vec![];
    let mut aliases = BTreeMap::<String, String>::new();
    for step in call["steps"].as_array().unwrap() {
        *active.lock().unwrap() = step.clone();
        let mut path = step["path"].as_str().unwrap().to_string();
        for (id, label) in &aliases {
            path = path.replace(label, id);
        }
        let mut request = client
            .request(
                step["method"].as_str().unwrap().parse().unwrap(),
                format!("{base}{path}"),
            )
            .header("host", "fixture.local")
            .header("connection", "close");
        for (key, value) in step["headers"].as_object().into_iter().flatten() {
            request = request.header(key, value.as_str().unwrap());
        }
        for (field, cookie) in [("user", false), ("cookie", true)] {
            if let Some(user) = step[field].as_str() {
                let token = http_auth::sign_auth_token(
                    &AuthUser {
                        id: user.into(),
                        username: if user == "owner" { "alice" } else { "bob" }.into(),
                    },
                    "reminder-http-secret",
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
            request = request.json(body);
        }
        let res = request.send().await.unwrap();
        let status = res.status().as_u16();
        let content = res
            .headers()
            .get("content-type")
            .map(|h| h.to_str().unwrap().to_string());
        let disposition = res
            .headers()
            .get("content-disposition")
            .map(|h| h.to_str().unwrap().to_string());
        let raw = res.text().await.unwrap();
        let body = serde_json::from_str::<Value>(&raw).unwrap_or(json!(raw));
        let ids: Vec<String> = auth
            .with_database(|db| {
                Ok(db
                    .prepare("SELECT id FROM reminders ORDER BY rowid")?
                    .query_map([], |r| r.get(0))?
                    .collect::<rusqlite::Result<_>>()?)
            })
            .await
            .unwrap();
        for id in ids {
            if let Ok(uuid) = uuid::Uuid::parse_str(&id) {
                assert_eq!(uuid.get_version_num(), 7);
                if !aliases.contains_key(&id) {
                    let n = aliases.len();
                    aliases.insert(id, format!("$r{n}"));
                }
            }
        }
        results.push(normalize(
            &json!({"status":status,"body":body,"contentType":content,"disposition":disposition}),
            &aliases,
        ));
    }
    let rows = auth
        .with_database(|db| {
            Ok(ReminderService::new(db).list(ListReminderOptions {
                status: Some("all".into()),
                limit: Some(500.0),
                ..Default::default()
            })?)
        })
        .await
        .unwrap();
    let actual = normalize(
        &json!({"results":results,"events":*events.lock().unwrap(),"rows":rows}),
        &aliases,
    );
    send.send(()).unwrap();
    task.await.unwrap();
    auth.shutdown().await.unwrap();
    for (i, (a, b)) in actual["results"]
        .as_array()
        .unwrap()
        .iter()
        .zip(expected["results"].as_array().unwrap())
        .enumerate()
    {
        assert_eq!(a, b, "HTTP step {i}: {}", call["steps"][i]);
    }
    assert_eq!(actual, expected);
}
#[tokio::test]
async fn authenticated_crud_foreign_owners_null_patches_queries_and_export_match() {
    let mut steps = vec![
        json!({"method":"GET","path":"/api/reminders"}),
        json!({"method":"GET","path":"/api/reminders","user":"missing"}),
        json!({"method":"POST","path":"/api/reminders","user":"owner","body":{"content":" \u{feff} "}}),
    ];
    for body in [
        json!({"content":"  remember useful 🦀 preference  ","projectId":"p","sessionId":"s","sourceType":" ","sourceId":" x ","tags":[" A ","a",5,"B"],"userId":"other"}),
        json!({"content":"another","status":"archived","tags":null}),
    ] {
        steps.push(json!({"method":"POST","path":"/api/reminders","cookie":"owner","body":body}));
    }
    steps.extend([json!({"method":"GET","path":"/api/reminders?status=all","user":"other"}),
        json!({"method":"GET","path":"/api/reminders/export.md","user":"other"}),
        json!({"method":"PATCH","path":"/api/reminders/$r0","user":"other","body":{"content":"stolen"}}),json!({"method":"DELETE","path":"/api/reminders/$r0","user":"other"}),json!({"method":"PATCH","path":"/api/reminders/$r0","user":"owner","body":{"content":" "}}),json!({"method":"PATCH","path":"/api/reminders/$r0","user":"owner","body":{"status":null}}),json!({"method":"PATCH","path":"/api/reminders/$r0","user":"owner","body":{"content":5,"projectId":null,"sessionId":true,"tags":null,"status":"archived"}})]);
    for q in [
        "",
        "?status=all",
        "?status=bad",
        "?status=archived",
        "?projectId=p",
        "?sessionId=s",
        "?limit=1.9",
        "?limit=0",
        "?limit=1e2",
        "?limit=1&limit=2",
        "?status=all&status=archived",
    ] {
        for path in ["/api/reminders", "/api/reminders/export.md"] {
            steps.push(json!({"method":"GET","path":format!("{path}{q}"),"user":"owner"}));
        }
    }
    steps.extend([json!({"method":"DELETE","path":"/api/reminders/$r0","user":"owner"}),json!({"method":"DELETE","path":"/api/reminders/$r0","user":"owner"}),json!({"method":"GET","path":"/api/reminders","cookie":"owner","headers":{"origin":"https://foreign.invalid"}})]);
    scenario(json!({"op":"nativereminderhttp.routes","steps":steps})).await;
}
#[tokio::test]
async fn optional_dependencies_validate_owned_targets_merge_engine_records_and_preserve_call_order()
{
    scenario(json!({"op":"nativereminderhttp.routes","extras":["memory","projects","sessions","threads"],"projects":{"projects":[{"id":"owned","name":"project","reminderCount":999}],"hasMore":true},"threads":[{"id":"thread","status":"running"}],"memories":[{"id":"engine","scope":"project","content":"engine note","source":{"type":"user","id":"source","surface":"chat"},"createdAt":"old","updatedAt":"old"}],"steps":[
 {"method":"POST","path":"/api/reminders","user":"owner","body":{"content":"keep","projectId":"foreign","sessionId":"owned"}},
 {"method":"POST","path":"/api/reminders","user":"owner","body":{"content":"keep","projectId":"owned","sessionId":"foreign"}},
 {"method":"POST","path":"/api/reminders","user":"owner","body":{"content":"keep","projectId":"owned","sessionId":"owned"}},
 {"method":"GET","path":"/api/reminders","user":"owner"},{"method":"GET","path":"/api/reminders?status=archived","user":"owner"},{"method":"GET","path":"/api/reminders?projectId=owned","user":"owner"},
 {"method":"GET","path":"/api/reminders?sessionId=owned","user":"owner"},{"method":"DELETE","path":"/api/reminders/$r0","user":"owner"},{"method":"DELETE","path":"/api/reminders/engine","user":"owner"},{"method":"DELETE","path":"/api/reminders/missing","user":"owner"},
 {"method":"GET","path":"/api/reminders","user":"owner","portError":"memory.list"},{"method":"GET","path":"/api/reminders","user":"owner","portError":"projects.listWithSessions"},{"method":"GET","path":"/api/reminders","user":"owner","portError":"threads.list"}
 ]})).await;
}

#[tokio::test]
async fn parser_validation_precedence_typed_body_normalization_and_target_failures_match() {
    scenario(json!({"op":"nativereminderhttp.routes","extras":["memory","projects","sessions"],"steps":[
 {"method":"POST","path":"/api/reminders","raw":"{","headers":{"content-type":"application/json"}},
 {"method":"POST","path":"/api/reminders","user":"owner"},{"method":"POST","path":"/api/reminders","user":"owner","body":null},
 {"method":"POST","path":"/api/reminders","user":"owner","body":{"content":5}},{"method":"POST","path":"/api/reminders","user":"owner","body":["text"]},
 {"method":"POST","path":"/api/reminders","user":"owner","body":{"content":"keep","projectId":"owned"},"portError":"projects.getById"},
 {"method":"POST","path":"/api/reminders","user":"owner","body":{"content":"keep","sessionId":"owned"},"portError":"sessions.getById"},
 {"method":"POST","path":"/api/reminders","user":"owner","body":{"content":"  keep  ","projectId":5,"sessionId":true,"tags":{},"status":"wrong","sourceType":5,"sourceId":false,"sourceSurface":null}},
 {"method":"PATCH","path":"/api/reminders/missing","user":"owner","body":{"status":null}},
 {"method":"PATCH","path":"/api/reminders/$r0","user":"owner","body":["text"]},
 {"method":"DELETE","path":"/api/reminders/engine","user":"owner","portError":"memory.forget"},
 {"method":"GET","path":"/api/reminders","user":"owner","headers":{"origin":"https://foreign.invalid"}}
 ]})).await;
}
