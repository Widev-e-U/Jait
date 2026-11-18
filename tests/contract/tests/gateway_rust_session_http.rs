#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::{
    Gateway,
    config::GatewayConfig,
    db,
    health::HealthState,
    routes::{
        auth::AuthState,
        sessions::{SessionNode, SessionRoutes, SessionRuntime, TitleFuture, TitleRequest},
    },
    security::http_auth::{self, AuthUser},
    services::thread_title::normalize_generated_thread_title,
};
use serde_json::{Map, Value, json};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::Duration,
};
const NOW: &str = "2026-10-18T12:00:00.000Z";
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}
fn reference(call: Value) -> Value {
    let dir = root()
        .join(".jait/artifacts/gateway-rust/native-session-http")
        .join(uuid::Uuid::new_v4().to_string());
    fs::create_dir_all(&dir).unwrap();
    internal_driver::call(&root(), &dir, json!({"version":1,"calls":[call]}), &|| {
        false
    })
    .unwrap()[0]
        .clone()
}
struct Runtime {
    data: Value,
    events: Mutex<Vec<Value>>,
    auth: AuthState,
}
impl Runtime {
    fn push(&self, v: Value) {
        self.events.lock().unwrap().push(v);
    }
}
impl SessionRuntime for Runtime {
    fn turn_active(&self, id: &str) -> bool {
        self.data["busy"]
            .as_array()
            .is_some_and(|a| a.iter().any(|v| v == id))
    }
    fn nodes(&self) -> Vec<SessionNode> {
        if self.data["ws"] == false {
            return vec![];
        }
        self.data["nodes"]
            .as_array()
            .map(|a| {
                a.iter()
                    .map(|v| SessionNode {
                        id: v["id"].as_str().unwrap().into(),
                        is_gateway: v["isGateway"] == true,
                    })
                    .collect()
            })
            .unwrap_or_default()
    }
    fn can_access_node(&self, node: &str, user: &str) -> bool {
        self.data["ws"] != false
            && self.data["allowed"]
                .as_array()
                .is_some_and(|a| a.iter().any(|v| v == &format!("{node}:{user}")))
    }
    fn broadcast(&self, user: &str, event: Value) {
        if self.data["ws"] != false {
            self.push(json!({"kind":"broadcast","user":user,"event":event}));
        }
    }
    fn hook(&self, event: &str, data: Value) {
        self.push(json!({"kind":"hook","event":event,"data":data}));
    }
    fn title(&self, request: TitleRequest) -> TitleFuture<'_> {
        Box::pin(async move {
            self.push(json!({"kind":"title","prompt":request.prompt,"model":request.model}));
            if let Some(sql) = self.data["titleMutation"].as_str() {
                let sql = sql.to_string();
                self.auth
                    .with_database(move |db| {
                        db.execute_batch(&sql)?;
                        Ok(())
                    })
                    .await
                    .map_err(|e| e.to_string())?;
            }
            if self.data["titleError"] == true {
                return Err("fixture title failure".into());
            }
            let raw = self.data["title"]
                .as_str()
                .unwrap_or("Generated task title");
            let title = normalize_generated_thread_title(raw, "");
            if title.0.is_empty() {
                Err("Title generation returned empty result".into())
            } else {
                Ok(String::from_utf16_lossy(&title.0))
            }
        })
    }
}
fn normalize(snapshot: &mut Value) {
    let mut pairs = vec![];
    for (table, kind, fields) in [
        ("sessions", "session", vec!["id"]),
        ("projects", "project", vec!["id"]),
        ("audit", "audit", vec!["id", "action_id"]),
    ] {
        for (i, row) in snapshot[table].as_array().unwrap().iter().enumerate() {
            for field in &fields {
                let Some(id) = row[field].as_str() else {
                    continue;
                };
                if let Ok(uuid) = uuid::Uuid::parse_str(id) {
                    assert_eq!(uuid.get_version_num(), 7);
                    pairs.push((id.to_string(), format!("<{kind}-{field}-{i}>")));
                }
            }
        }
    }
    fn visit(v: &mut Value, pairs: &[(String, String)]) {
        match v {
            Value::String(s) => {
                for (a, b) in pairs {
                    *s = s.replace(a, b);
                }
            }
            Value::Array(a) => {
                for v in a {
                    visit(v, pairs)
                }
            }
            Value::Object(m) => {
                for v in m.values_mut() {
                    visit(v, pairs)
                }
            }
            _ => {}
        }
    }
    visit(snapshot, &pairs);
}
fn snapshot(db: &rusqlite::Connection, table: &str) -> rusqlite::Result<Value> {
    use rusqlite::types::ValueRef;
    let mut query = db.prepare(&format!("SELECT * FROM {table} ORDER BY rowid"))?;
    let names = query
        .column_names()
        .into_iter()
        .map(String::from)
        .collect::<Vec<_>>();
    let rows = query
        .query_map([], |r| {
            let mut m = Map::new();
            for (i, name) in names.iter().enumerate() {
                let v = match r.get_ref(i)? {
                    ValueRef::Null => Value::Null,
                    ValueRef::Integer(i) => json!(i),
                    ValueRef::Real(n) => json!(n),
                    ValueRef::Text(t) => json!(String::from_utf8_lossy(t)),
                    ValueRef::Blob(_) => panic!("unexpected fixture blob"),
                };
                m.insert(name.clone(), v);
            }
            Ok(Value::Object(m))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(json!(rows))
}
async fn scenario(seed: &str, steps: Value, options: Value) -> Value {
    let mut call = options.clone();
    call["op"] = json!("nativesessionhttp.run");
    call["seed"] = json!(seed);
    call["steps"] = steps.clone();
    call["now"] = json!(NOW);
    let expected = tokio::task::spawn_blocking(move || reference(call))
        .await
        .unwrap();
    let db = db::open_database(Path::new(":memory:")).unwrap();
    db::migrate_database(&db).unwrap();
    db.execute_batch("INSERT INTO users(id,username,password_hash,created_at,updated_at) VALUES('owner','alice','fixture','old','old'),('other','bob','fixture','old','old');").unwrap();
    db.execute_batch(seed).unwrap();
    let auth = AuthState::new(db, "session-http-secret".into()).unwrap();
    let runtime = Arc::new(Runtime {
        data: options.clone(),
        events: Mutex::new(vec![]),
        auth: auth.clone(),
    });
    let mut routes = SessionRoutes::new(auth.clone(), root().to_str().unwrap().into());
    routes.time = Some(NOW.into());
    routes.runtime = runtime.clone();
    routes.projects = options["projects"] != false;
    routes.session_state = options["state"] != false;
    routes.user_settings = options["settings"] != false;
    let gateway = Gateway::bind_authenticated(
        GatewayConfig {
            address: "127.0.0.1:0".parse().unwrap(),
        },
        HealthState::default(),
        auth.clone(),
    )
    .await
    .unwrap()
    .with_sessions(routes);
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
    let mut new_id = String::new();
    for step in steps.as_array().unwrap() {
        if let Some(sql) = step["sql"].as_str() {
            let sql = sql.to_string();
            auth.with_database(move |db| {
                db.execute_batch(&sql)?;
                Ok(())
            })
            .await
            .unwrap();
            results.push(Value::Null);
            continue;
        }
        let path = step["path"].as_str().unwrap().replace("$new", &new_id);
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
                "session-http-secret",
            )
            .unwrap();
            request = request.bearer_auth(token);
        }
        if let Some(raw) = step["raw"].as_str() {
            request = request.body(raw.to_string());
        } else if let Some(body) = step.get("body") {
            request = request.json(body);
        }
        let result = request.send().await.unwrap();
        let status = result.status().as_u16();
        let raw = result.text().await.unwrap();
        let body = serde_json::from_str::<Value>(&raw).unwrap_or(json!(raw));
        if status == 201 {
            new_id = body["id"].as_str().unwrap().into();
        }
        results.push(json!({"status":status,"body":body}));
    }
    let mut actual=auth.with_database(move|db|Ok(json!({"results":results,"sessions":snapshot(db,"sessions")?,"projects":snapshot(db,"projects")?,"state":snapshot(db,"session_state")?,"audit":snapshot(db,"audit_log")?}))).await.unwrap();
    actual["runtime"] = json!(*runtime.events.lock().unwrap());
    send.send(()).unwrap();
    task.await.unwrap().unwrap();
    auth.shutdown().await.unwrap();
    let mut expected = expected;
    normalize(&mut actual);
    normalize(&mut expected);
    if actual != expected {
        fn difference(a: &Value, b: &Value, path: &str) -> String {
            match (a, b) {
                (Value::Object(a), Value::Object(b)) => {
                    for key in a.keys().chain(b.keys()) {
                        let av = a.get(key).unwrap_or(&Value::Null);
                        let bv = b.get(key).unwrap_or(&Value::Null);
                        if av != bv {
                            return difference(av, bv, &format!("{path}.{key}"));
                        }
                    }
                }
                (Value::Array(a), Value::Array(b)) => {
                    for i in 0..a.len().max(b.len()) {
                        let av = a.get(i).unwrap_or(&Value::Null);
                        let bv = b.get(i).unwrap_or(&Value::Null);
                        if av != bv {
                            return difference(av, bv, &format!("{path}[{i}]"));
                        }
                    }
                }
                _ => {}
            }
            format!("{path}: native {a}, reference {b}")
        }
        let path = root()
            .join(".jait/artifacts/gateway-rust/native-session-http")
            .join(uuid::Uuid::new_v4().to_string());
        fs::create_dir_all(&path).unwrap();
        fs::write(
            path.join("native.json"),
            serde_json::to_string_pretty(&actual).unwrap(),
        )
        .unwrap();
        fs::write(
            path.join("reference.json"),
            serde_json::to_string_pretty(&expected).unwrap(),
        )
        .unwrap();
        panic!(
            "session HTTP parity: {}; artifacts {}",
            difference(&actual, &expected, "$"),
            path.display()
        );
    }

    actual
}
fn session(id: &str, user: &str, project: Option<&str>) -> String {
    format!(
        "INSERT INTO sessions(id,user_id,project_id,name,project_path,created_at,last_active_at,viewed_at,status)VALUES('{id}','{user}',{},'New Chat','/old','2026-01-01','2026-10-18T11:00:00.000Z',NULL,'active');",
        project.map(|v| format!("'{v}'")).unwrap_or("NULL".into())
    )
}
fn project(id: &str, user: &str, path: Option<&str>) -> String {
    format!(
        "INSERT INTO projects(id,user_id,title,root_path,node_id,created_at,last_active_at,status,kind)VALUES('{id}','{user}','Project',{},'gateway','old','old','active','folder');",
        path.map(|v| format!("'{v}'")).unwrap_or("NULL".into())
    )
}
#[tokio::test]
async fn authentication_ownership_and_not_found_are_checked_before_effects() {
    scenario(&session("s","owner",None),json!([
        {"method":"GET","path":"/api/sessions"},{"method":"GET","path":"/api/sessions","user":"missing"},
        {"method":"GET","path":"/api/sessions/s","user":"other"},{"method":"PATCH","path":"/api/sessions/s","user":"other","body":{"name":"foreign"}},
        {"method":"POST","path":"/api/sessions/s/archive","user":"other"},{"method":"DELETE","path":"/api/sessions/s","user":"other"},
        {"method":"GET","path":"/api/sessions/s/state","user":"other"},{"method":"PATCH","path":"/api/sessions/s/state","user":"other","body":{"x":1}},
        {"method":"POST","path":"/api/sessions/s/move","user":"other","body":{"projectId":null}},
        {"method":"POST","path":"/api/sessions/s/generate-title","user":"other","body":{"prompt":"hello"}},
        {"method":"GET","path":"/api/sessions/missing","user":"owner"},{"method":"GET","path":"/api/sessions/messages","user":"owner"}
    ]),json!({})).await;
}
#[tokio::test]
async fn create_personal_chat_audits_hooks_and_broadcasts_then_archive_and_delete() {
    scenario("",json!([
        {"method":"POST","path":"/api/sessions","user":"owner","body":{"name":"Hello","projectPath":"/work"}},
        {"method":"GET","path":"/api/sessions/$new","user":"owner"},{"method":"GET","path":"/api/sessions/last-active","user":"owner"},
        {"method":"POST","path":"/api/sessions/$new/archive","user":"owner"},{"method":"GET","path":"/api/sessions/last-active","user":"owner"},
        {"method":"DELETE","path":"/api/sessions/$new","user":"owner"},{"method":"GET","path":"/api/sessions/$new","user":"owner"}
    ]),json!({"projects":false})).await;
}
#[tokio::test]
async fn create_project_chat_checks_owner_and_reuses_root() {
    let seed =
        project("p", "owner", Some("/repo")) + &project("foreign", "other", Some("/foreign"));
    scenario(&seed,json!([
        {"method":"POST","path":"/api/sessions","user":"owner","body":{"projectId":"foreign"}},
        {"method":"POST","path":"/api/sessions","user":"owner","body":{"projectId":"missing"}},
        {"method":"POST","path":"/api/sessions","user":"owner","body":{"projectId":"p"}},
        {"method":"POST","path":"/api/sessions","user":"owner","body":{"projectPath":"/repo","name":"By root"}},
        {"method":"POST","path":"/api/sessions","user":"owner","body":{"projectPath":"/new/repo","projectTitle":"New","nodeId":"device"}}
    ]),json!({})).await;
}
#[tokio::test]
async fn list_filters_pagination_parse_integer_and_repeated_query_parameters() {
    let seed = session("a", "owner", None)
        + &session("b", "owner", Some("p"))
        + &session("c", "other", None)
        + &session("d", "owner", None)
        + "UPDATE sessions SET status='archived' WHERE id='d';";
    let mut steps = vec![];
    for query in [
        "",
        "?personal=true",
        "?personal=false",
        "?status=active",
        "?status=archived",
        "?limit=1",
        "?limit=1.9",
        "?limit=2junk",
        "?limit=+2",
        "?limit=0",
        "?limit=-1",
        "?limit=Infinity",
        "?limit=1&limit=2",
        "?status=active&status=archived",
        "?limit=%EF%BB%BF2",
    ] {
        steps.push(json!({"method":"GET","path":format!("/api/sessions{query}"),"user":"owner"}));
    }
    scenario(&seed, json!(steps), json!({})).await;
}
#[tokio::test]
async fn session_selection_validates_nodes_and_preserves_nullable_chat_fields() {
    let seed = session("s", "owner", None)
        + &session("p", "owner", Some("project"))
        + &session("busy", "owner", None);
    let mut steps = vec![];
    for (id, body) in [
        ("busy", json!({"nodeId":null})),
        ("p", json!({"nodeId":null})),
        ("s", json!({"nodeId":null})),
        ("s", json!({"nodeId":"  "})),
        ("s", json!({"nodeId":"x".repeat(201)})),
        ("s", json!({"nodeId":"missing"})),
        ("s", json!({"nodeId":"fake-gateway"})),
        ("s", json!({"nodeId":"forbidden"})),
        (
            "s",
            json!({"nodeId":" owned ","name":"Renamed","provider":"codex","model":"test","reasoningEffort":null}),
        ),
        (
            "s",
            json!({"nodeId":"gateway","provider":null,"model":42,"reasoningEffort":true}),
        ),
        ("s", json!({"model":"model"})),
        ("s", json!({"provider":[]})),
    ] {
        steps.push(json!({"method":"PATCH","path":format!("/api/sessions/{id}"),"user":"owner","body":body}));
    }
    scenario(&seed,json!(steps),json!({"busy":["busy"],"nodes":[{"id":"owned"},{"id":"forbidden"},{"id":"fake-gateway","isGateway":true}],"allowed":["owned:owner"]})).await;
}
#[tokio::test]
async fn moving_chats_handles_ownership_noop_personal_and_missing_root() {
    let seed = session("s", "owner", None)
        + &project("p", "owner", Some("/repo"))
        + &project("virtual", "owner", None)
        + &project("foreign", "other", Some("/foreign"));
    let mut steps = vec![];
    for body in [
        json!({}),
        json!({"projectId":2}),
        json!({"projectId":"foreign"}),
        json!({"projectId":"p"}),
        json!({"projectId":"p"}),
        json!({"projectId":"virtual"}),
        json!({"projectId":""}),
        json!({"projectId":null}),
    ] {
        steps.push(
            json!({"method":"POST","path":"/api/sessions/s/move","user":"owner","body":body}),
        );
    }
    scenario(&seed, json!(steps), json!({})).await;
}
#[tokio::test]
async fn viewed_watermark_rejects_bad_values_and_only_broadcasts_when_changed() {
    let mut steps = vec![];
    for body in [
        json!({"lastActiveAt":false}),
        json!({"lastActiveAt":null}),
        json!({"lastActiveAt":"bad"}),
        json!({"lastActiveAt":"2026-10-18T10:00:00.000Z"}),
        json!({"lastActiveAt":"2026-10-18T09:00:00.000Z"}),
        json!({"lastActiveAt":"2026-10-18T13:00:00.000Z"}),
        json!({}),
    ] {
        steps.push(
            json!({"method":"POST","path":"/api/sessions/s/viewed","user":"owner","body":body}),
        );
    }
    scenario(&session("s", "owner", None), json!(steps), json!({})).await;
}
#[tokio::test]
async fn viewed_accepts_reference_date_parse_formats_and_rejects_invalid_dates() {
    let mut steps = vec![];
    for stamp in [
        "2026-10-17",
        "2026-10",
        "2026",
        "2026-02-30",
        "2026-10-17T24:00:00Z",
        "2026-10-17T10:00:00+0230",
        "2026-10-17T10:00:00.123456Z",
        "2026-10-17t10:00:00z",
        "10/17/2026",
        "2026/10/17",
        "10-17-2026",
        "Oct 17 2026",
        "Sat, 17 Oct 2026 10:00:00 GMT",
        "October 17, 2026 06:00:00 EDT",
        "2026-10-17T10:00:00",
        "2026-13-01",
        "2026-01-32",
        "2026-10-17T24:01:00Z",
        "2026-10-17T10:00:00+25:00",
        "2026-10-17T10:00:60Z",
        " 2026-10-17T10:00:00Z",
        "",
        "not a date",
    ] {
        steps.push(json!({"sql":"UPDATE sessions SET viewed_at=NULL WHERE id='s'"}));
        steps.push(json!({"method":"POST","path":"/api/sessions/s/viewed","user":"owner","body":{"lastActiveAt":stamp}}));
    }
    scenario(&session("s", "owner", None), json!(steps), json!({})).await;
}
#[tokio::test]
async fn state_routes_filter_keys_validate_objects_and_delete_null_entries() {
    scenario(&session("s","owner",None),json!([
        {"method":"PATCH","path":"/api/sessions/s/state","user":"owner","body":{"x":1,"y":true}},
        {"method":"GET","path":"/api/sessions/s/state?keys=x,%20missing%20","user":"owner"},
        {"method":"GET","path":"/api/sessions/s/state?keys=,,,","user":"owner"},
        {"method":"GET","path":"/api/sessions/s/state?keys=x&keys=y","user":"owner"},
        {"method":"PATCH","path":"/api/sessions/s/state","user":"owner","body":[]},
        {"method":"PATCH","path":"/api/sessions/s/state","user":"owner","body":2},
        {"method":"PATCH","path":"/api/sessions/s/state","user":"owner","body":null},
        {"method":"PATCH","path":"/api/sessions/s/state","user":"owner","body":{"y":null}},
        {"method":"GET","path":"/api/sessions/s/state","user":"owner"}
    ]),json!({})).await;
}
#[tokio::test]
async fn head_optional_routes_method_fallbacks_and_parser_errors_match_reference() {
    for options in [json!({}), json!({"state":false})] {
        scenario(&session("s","owner",None),json!([
            {"method":"HEAD","path":"/api/sessions","user":"owner"},
            {"method":"HEAD","path":"/api/sessions/s","user":"owner"},
            {"method":"HEAD","path":"/api/sessions/s/state","user":"owner"},
            {"method":"GET","path":"/api/sessions/s/state","user":"owner"},
            {"method":"PATCH","path":"/api/sessions/s/state","user":"owner","body":{}},
            {"method":"PUT","path":"/api/sessions/s","user":"owner","body":{}},
            {"method":"GET","path":"/api/sessions/s/archive","user":"owner"},
            {"method":"GET","path":"/api/sessions/s/generate-title","user":"owner"},
            {"method":"GET","path":"/api/sessions/s/unknown","user":"owner"},
            {"method":"PUT","path":"/api/sessions/s"},
            {"method":"POST","path":"/api/sessions","user":"owner","raw":"{","headers":{"content-type":"application/json"}},
            {"method":"POST","path":"/api/sessions","user":"owner","raw":"","headers":{"content-type":"application/json"}},
            {"method":"PATCH","path":"/api/sessions/s","user":"owner","raw":"text","headers":{"content-type":"application/xml"}},
            {"method":"PATCH","path":"/api/sessions/s","user":"owner","raw":"{\"__proto__\":{}}","headers":{"content-type":"application/json"}},
            {"method":"GET","path":"/api/sessions","user":"owner"}
        ]),options).await;
    }
}
#[tokio::test]
async fn title_generation_and_fallback_recheck_after_await() {
    for options in [
        json!({}),
        json!({"titleError":true}),
        json!({"title":"   "}),
        json!({"titleMutation":"UPDATE sessions SET name='User renamed' WHERE id='s';"}),
        json!({"titleMutation":"DELETE FROM sessions WHERE id='s';"}),
    ] {
        scenario(&session("s","owner",None),json!([
            {"method":"POST","path":"/api/sessions/s/generate-title","user":"owner","body":{"prompt":" \nTitle:  - First title...\nignored ","model":"fixture-model"}},
            {"method":"GET","path":"/api/sessions/s","user":"owner"}
        ]),options).await;
    }
}
#[tokio::test]
async fn title_generation_does_not_overwrite_user_name_and_validates_prompt_first() {
    let seed = session("s", "owner", None) + "UPDATE sessions SET name='User title' WHERE id='s';";
    scenario(&seed,json!([
        {"method":"POST","path":"/api/sessions/s/generate-title","user":"owner","body":{"prompt":"task"}},
        {"method":"POST","path":"/api/sessions/missing/generate-title","user":"owner","body":{}},
        {"method":"POST","path":"/api/sessions/s/generate-title","user":"owner","body":{"prompt":1}}
    ]),json!({})).await;
}
#[tokio::test]
async fn read_only_agent_helpers_preserve_global_gate_and_query_validation() {
    scenario(&(session("s","owner",None)+&session("foreign","other",None)),json!([
        {"method":"GET","path":"/api/tools/sessions.list"},
        {"method":"GET","path":"/api/tools/sessions.list","user":"owner"},
        {"method":"GET","path":"/api/tools/sessions.status","user":"owner"},
        {"method":"GET","path":"/api/tools/sessions.status?sessionId=s","user":"owner"},
        {"method":"GET","path":"/api/tools/sessions.status?sessionId=missing","user":"owner"},
        {"method":"GET","path":"/api/tools/sessions.status?sessionId=s&sessionId=s","user":"owner"}
    ]),json!({})).await;
}
#[tokio::test]
async fn partial_storage_failures_keep_reference_effect_order() {
    let seed = session("s", "owner", None)
        + "CREATE TRIGGER reject_audit BEFORE INSERT ON audit_log BEGIN SELECT RAISE(FAIL,'fixture'); END;";
    scenario(&seed,json!([
        {"method":"DELETE","path":"/api/sessions/s","user":"owner"},
        {"method":"POST","path":"/api/sessions","user":"owner","body":{"name":"persisted-before-error"}},
        {"method":"GET","path":"/api/sessions","user":"owner"}
    ]),json!({"projects":false})).await;
}
#[tokio::test]
async fn primitive_patch_bodies_and_optional_adapters_match_reference() {
    let mut steps = vec![];
    for body in [
        json!(1),
        json!(false),
        json!("text"),
        json!([]),
        json!(null),
        json!({"name":null}),
    ] {
        steps.push(json!({"method":"PATCH","path":"/api/sessions/s","user":"owner","body":body}));
    }
    steps.push(json!({"method":"PATCH","path":"/api/sessions/s","user":"owner","body":{"nodeId":"missing"}}));
    scenario(
        &session("s", "owner", None),
        json!(steps),
        json!({"projects":false,"ws":false,"settings":false}),
    )
    .await;
}
#[tokio::test]
async fn list_row_cap_and_title_word_boundaries_are_exercised() {
    let mut seed = String::new();
    for i in 0..102 {
        seed += &session(&format!("s{i}"), "owner", None);
    }
    scenario(&seed,json!([
        {"method":"GET","path":"/api/sessions?limit=1000","user":"owner"},
        {"method":"POST","path":"/api/sessions/s0/generate-title","user":"owner","body":{"prompt":"Long title","model":"m"}}
    ]),json!({"title":"longword ".repeat(12)})).await;
}
#[test]
fn title_normalization_matches_reference_utf16_and_word_boundaries() {
    let mut inputs = vec![];
    for prefix in [
        "",
        "Title: ",
        "TITLE :\u{feff}",
        "- ",
        "*\t",
        "• ",
        "1. ",
        "12) ",
        "\"",
        "'",
        "`",
        "Title: - ",
        "01. ",
        "-Title:",
    ] {
        for text in [
            "One task...",
            "\r\nFirst line\nignored",
            "\n  \n",
            "a   b\t c\u{feff}d\u{0085}e",
            "...;;:--––",
            "\"quoted\"",
            "`backticks`",
        ] {
            inputs.push(json!([format!("{prefix}{text}"), "Fallback"]));
        }
    }
    for len in [23, 24, 25, 78, 79, 80, 81, 82, 100] {
        inputs.push(json!(["a".repeat(len), ""]));
        inputs.push(json!([
            format!("{} 🦀 trailing", "a".repeat(len)),
            "fallback"
        ]));
        inputs.push(json!([
            format!("{} {}", "x".repeat(len), "word ".repeat(20)),
            "fallback"
        ]));
    }
    for chunk in inputs.chunks(40) {
        let expected = reference(json!({"op":"nativesessionhttp.normalize","inputs":chunk}));
        let actual = json!(
            chunk
                .iter()
                .map(|v| normalize_generated_thread_title(
                    v[0].as_str().unwrap(),
                    v[1].as_str().unwrap()
                )
                .0)
                .collect::<Vec<_>>()
        );
        assert_eq!(actual, expected);
    }
}

// TypeScript rejects protocol payloads before truncation. Compare real source
// exports so the native normalizer cannot accidentally name a chat from tool data.
#[test]
fn title_normalization_rejects_tool_protocol_like_reference() {
    let mut inputs = vec![];
    for marker in [
        "<tool_call>",
        "<tool_calls>",
        "</tool_call>",
        "<|tool_call|>",
        "<function_call>",
        "<function_calls/>",
        "<tool_use id=fixture>",
        "[TOOL_CALL]",
        "[tool_calls]",
        "<TOOL_CALL>",
    ] {
        for prefix in ["", "Title: - ", "1. ", "`"] {
            for fallback in ["Fallback 🦀", ""] {
                inputs.push(json!([
                    format!("{prefix}{marker}\n{{\"name\":\"fixture\"}}\nPlausible later title"),
                    fallback
                ]));
            }
        }
    }
    for chunk in inputs.chunks(40) {
        let expected = reference(json!({"op":"nativesessionhttp.normalize","inputs":chunk}));
        let fallback_units = json!(
            chunk
                .iter()
                .map(|v| { v[1].as_str().unwrap().encode_utf16().collect::<Vec<_>>() })
                .collect::<Vec<_>>()
        );
        assert_eq!(
            expected, fallback_units,
            "reference must reject the whole response"
        );
        let actual = json!(
            chunk
                .iter()
                .map(|v| {
                    normalize_generated_thread_title(v[0].as_str().unwrap(), v[1].as_str().unwrap())
                        .0
                })
                .collect::<Vec<_>>()
        );
        assert_eq!(
            actual, expected,
            "native thread-title protocol rejection parity"
        );
    }
}

#[test]
fn title_protocol_boundaries_preserve_similar_legitimate_titles() {
    let mut inputs = vec![];
    for raw in [
        "tool_call as a concept",
        "<tool_callback>",
        "<tool_calling>",
        "<tool_callsx>",
        "<function_callback>",
        "<tool_user>",
        "[TOOL_CALLING]",
        "<|tool_usex>",
        "</|tool_call>",
        "<tool_call\u{0085}attribute>",
        "<tool_call~>",
        "<tool_call\u{feff}attribute>",
        "<Tool_USE",
        "[tool_call]More",
        "</FUNCTION_CALLS /name>",
        "<tool_calls|payload>",
        "Text about <tool_call>",
        "<ordinary_tag>",
    ] {
        for fallback in ["Fallback 🦀", ""] {
            inputs.push(json!([raw, fallback]));
        }
    }
    let expected = reference(json!({"op":"nativesessionhttp.normalize","inputs":inputs}));
    let actual = json!(
        inputs
            .iter()
            .map(|value| {
                normalize_generated_thread_title(
                    value[0].as_str().unwrap(),
                    value[1].as_str().unwrap(),
                )
                .0
            })
            .collect::<Vec<_>>()
    );
    assert_eq!(
        actual, expected,
        "protocol prefix boundary and ASCII case behavior"
    );
}
