#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::{
    Gateway,
    config::GatewayConfig,
    db,
    health::HealthState,
    routes::auth::{AuthState, ToolSettingsInfo},
    security::{
        http_auth::{self, AuthUser},
        request_origin,
    },
};
use serde_json::{Value, json};
use std::{fs, path::PathBuf, time::Duration};
use tokio::sync::oneshot;

fn observe(calls: Value) -> Value {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap();
    let dir = root
        .join(".jait/artifacts/gateway-rust/native-http")
        .join(uuid::Uuid::new_v4().to_string());
    fs::create_dir_all(&dir).unwrap();
    internal_driver::call(&root, &dir, json!({"version":1,"calls":calls}), &|| false).unwrap()
}
fn normalize(value: &mut Value) {
    if let Some(body) = value.get_mut("body") {
        if let Some(token) = body.get("access_token").and_then(Value::as_str) {
            let user = http_auth::verify_auth_token(token, "http-fixture-secret")
                .expect("cryptographically valid session token");
            assert_eq!(json!(user), body["user"]);
            body["access_token"] = json!("<token>");
        }
        if let Some(invitation) = body.get("invitation").and_then(Value::as_str) {
            assert_eq!(invitation.len(), 32);
            assert!(
                invitation
                    .bytes()
                    .all(|v| v.is_ascii_alphanumeric() || v == b'_' || v == b'-')
            );
            body["invitation"] = json!("<invitation>");
        }
        if let Some(timestamp) = body.get("updated_at").and_then(Value::as_str) {
            assert!(
                timestamp.ends_with('Z') && timestamp.contains('T'),
                "{timestamp}"
            );
            body["updated_at"] = json!("<timestamp>");
        }
    }
    if let Some(user) = value.get_mut("body").and_then(|v| v.get_mut("user"))
        && let Some(id) = user.get("id").and_then(Value::as_str)
        && !["owner", "other", "missing"].contains(&id)
    {
        assert_eq!(uuid::Uuid::parse_str(id).unwrap().get_version_num(), 7);
        user["id"] = json!("<new-user>");
    }
    if let Some(cookies) = value.get_mut("cookie").and_then(Value::as_array_mut) {
        for cookie in cookies {
            if let Some((token, attributes)) = cookie
                .as_str()
                .and_then(|v| v.strip_prefix("jait_token="))
                .and_then(|v| v.split_once(';'))
                && !token.is_empty()
            {
                assert!(http_auth::verify_auth_token(token, "http-fixture-secret").is_some());
                *cookie = json!(format!("jait_token=<token>;{attributes}"));
            }
        }
    }
}
async fn scenario(seed: &str, empty: bool, tools: Option<Value>, steps: Value) -> (Value, Value) {
    let call = json!({"op":"nativehttp.auth","seed":seed,"empty":empty,"steps":steps,"tools":tools,"cors":"https://allowed.example"});
    let reference = tokio::task::spawn_blocking(move || observe(json!([call])))
        .await
        .unwrap()[0]
        .clone();
    let database = db::open_database(std::path::Path::new(":memory:")).unwrap();
    db::migrate_database(&database).unwrap();
    if !empty {
        for (id, name, created) in [
            ("owner", "alice", "2026-01-01"),
            ("other", "bob", "2026-01-02"),
        ] {
            database.execute("INSERT INTO users(id,username,password_hash,created_at,updated_at) VALUES(?,?,?,?,?)",rusqlite::params![id,name,reference["hash"].as_str().unwrap(),created,created]).unwrap();
        }
    }
    database.execute_batch(seed).unwrap();
    let mut state = AuthState::new(database, "http-fixture-secret".into()).unwrap();
    state.cors_origin = "https://allowed.example".into();
    state.tools = tools.map(|v| serde_json::from_value::<Vec<ToolSettingsInfo>>(v).unwrap());
    let gateway = Gateway::bind_authenticated(
        GatewayConfig {
            address: "127.0.0.1:0".parse().unwrap(),
        },
        HealthState::default(),
        state.clone(),
    )
    .await
    .unwrap();
    let base = format!("http://{}", gateway.local_addr().unwrap());
    let (shutdown, receive) = oneshot::channel();
    let task = tokio::spawn(gateway.serve(async {
        let _ = receive.await;
    }));
    // This is a transport hang guard, not a response-time contract. Password
    // hashing in debug builds competes with the full parallel verification run.
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(60))
        .build()
        .unwrap();
    let mut results = vec![];
    for (index, step) in steps.as_array().unwrap().iter().enumerate() {
        if let Some(sql) = step["mutate"].as_str() {
            let sql = sql.to_string();
            state
                .with_database(move |db| {
                    db.execute_batch(&sql)?;
                    Ok(())
                })
                .await
                .unwrap();
        }
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
        if let Some(user) = step["user"].as_str() {
            let token = http_auth::sign_auth_token(
                &AuthUser {
                    id: user.into(),
                    username: if user == "owner" { "alice" } else { "bob" }.into(),
                },
                "http-fixture-secret",
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
        let cookies: Vec<String> = result
            .headers()
            .get_all("set-cookie")
            .iter()
            .map(|v| v.to_str().unwrap().to_string())
            .collect();
        let cookie = (!cookies.is_empty()).then_some(cookies);
        let raw = result.text().await.unwrap();
        let body = serde_json::from_str::<Value>(&raw).unwrap_or(json!(raw));
        let mut native = json!({"status":status,"body":body,"cookie":cookie});
        let mut expected = reference["results"][index].clone();
        normalize(&mut native);
        normalize(&mut expected);
        assert_eq!(native, expected, "request {index}: {step}");
        results.push(native);
    }
    let native_users = state
        .with_database(|db| {
            let mut statement = db.prepare("SELECT username FROM users ORDER BY username")?;
            let names = statement
                .query_map([], |r| r.get::<_, String>(0))?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            Ok(json!(names))
        })
        .await
        .unwrap();
    assert_eq!(
        native_users,
        json!(
            reference["users"]
                .as_array()
                .unwrap()
                .iter()
                .map(|r| r["username"].as_str().unwrap())
                .collect::<Vec<_>>()
        )
    );
    let native_sessions = state
        .with_database(|db| {
            let mut statement = db.prepare("SELECT id,user_id FROM sessions ORDER BY id")?;
            let rows = statement
                .query_map([], |r| {
                    Ok(json!({"id":r.get::<_,String>(0)?,"user_id":r.get::<_,Option<String>>(1)?}))
                })?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            Ok(json!(rows))
        })
        .await
        .unwrap();
    assert_eq!(
        native_sessions, reference["sessions"],
        "durable session ownership"
    );
    shutdown.send(()).unwrap();
    task.await.unwrap().unwrap();
    (json!(results), reference)
}
#[test]
fn browser_origin_checks_match_exact_reference_urls_and_host_rules() {
    let mut calls = vec![];
    for origin in [
        None,
        Some(""),
        Some("null"),
        Some("https://evil.example"),
        Some("https://allowed.example"),
        Some("https://allowed.example/"),
        Some("http://fixture.local"),
        Some("HTTP://fixture.local"),
        Some("http://fixture.local:80"),
        Some("http://[::1]:8220"),
        Some("tauri://localhost"),
        Some("http://tauri.localhost"),
        Some("https://tauri.localhost"),
        Some("capacitor://localhost"),
        Some("https://user:pass@fixture.local"),
        Some("http://fixture.local/path"),
    ] {
        for host in ["fixture.local", "[::1]:8220"] {
            calls.push(json!({"op":"nativehttp.origin","origin":origin,"host":host,"cors":" https://allowed.example , https://other.example "}));
        }
    }
    let reference = observe(json!(calls));
    for (i, call) in calls.iter().enumerate() {
        assert_eq!(
            json!(request_origin::is_allowed_request_origin(
                call["origin"].as_str(),
                call["host"].as_str(),
                call["cors"].as_str().unwrap()
            )),
            reference[i],
            "{call}"
        );
    }
}
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn account_validation_login_refresh_and_auth_denials_match_actual_server() {
    scenario("",false,None,json!([
        {"method":"POST","path":"/api/auth/refresh"},
        {"method":"GET","path":"/api/auth/me"},
        {"method":"POST","path":"/api/auth/login","body":{}},
        {"method":"POST","path":"/api/auth/login","body":{"username":3,"password":"test"}},
        {"method":"POST","path":"/api/auth/login","body":{"username":"alice","password":"wrong"}},
        {"method":"POST","path":"/api/auth/login","body":{"username":" ALICE ","password":"password 🦀"}},
        {"method":"GET","path":"/api/auth/me","user":"owner"},
        {"method":"POST","path":"/api/auth/refresh","user":"owner"},
        {"method":"POST","path":"/api/auth/register","body":{"username":"new","password":"short"}},
        {"method":"POST","path":"/api/auth/register","body":{"username":"ALICE","password":"newpassword"}},
        {"method":"POST","path":"/api/auth/register","body":{"username":"new","password":"password1"}},
        {"method":"POST","path":"/api/auth/logout","user":"owner"},
        {"method":"POST","path":"/api/auth/invitations","user":"other"},
        {"method":"POST","path":"/api/auth/invitations","user":"owner"},
        {"method":"GET","path":"/api/auth/me","user":"missing"},
        {"method":"GET","path":"/api/auth/settings","user":"missing"},
        {"method":"POST","path":"/api/auth/refresh","user":"missing"}
    ])).await;
}
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn settings_patch_filtering_nullable_fields_and_user_isolation_match_actual_server() {
    scenario("",false,None,json!([
        {"method":"GET","path":"/api/auth/settings","user":"owner"},
        {"method":"PATCH","path":"/api/auth/settings","user":"owner","body":{"theme":"dark","api_keys":{"a":" keep ","b":3},"disabled_tools":["terminal",3,"terminal"],"stt_provider":"gpt","chat_streaming_action":"queue","chat_provider":" fixture ","jait_backend":"ollama","recent_models":["a",3,"b"],"selected_model":" model ","reasoning_effort":"high","project_picker_path":" /資料 ","project_picker_node_id":" node "}},
        {"method":"GET","path":"/api/auth/settings","user":"other"},
        {"method":"PATCH","path":"/api/auth/settings","user":"owner","body":{"theme":"bad","stt_provider":"bad","chat_streaming_action":"bad","jait_backend":"bad","selected_model":null,"reasoning_effort":"invalid","project_picker_path":" ","project_picker_node_id":null,"recent_models":[]}},
        {"method":"PATCH","path":"/api/auth/settings","user":"owner","body":{"api_keys":[" one ",3," three "]}},
        {"method":"GET","path":"/api/auth/settings/tools","user":"owner"},
        {"method":"PATCH","path":"/api/auth/settings/tools","user":"owner","body":{}},
        {"method":"DELETE","path":"/api/auth/settings/archive","user":"owner"}
    ])).await;
}
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn tool_settings_preserve_core_locks_and_filter_unknown_names() {
    let tools = json!([
        {"name":"todo","description":"core","tier":"core","category":"meta","source":"builtin"},
        {"name":"terminal","displayName":"Shell","description":"shell","tier":"standard","category":"terminal","source":"builtin"}
    ]);
    scenario("",false,Some(tools),json!([
        {"method":"GET","path":"/api/auth/settings/tools","user":"owner"},
        {"method":"PATCH","path":"/api/auth/settings/tools","user":"owner","body":{}},
        {"method":"PATCH","path":"/api/auth/settings/tools","user":"owner","body":{"disabled_tools":["todo","terminal","missing",3,"terminal"]}},
        {"method":"GET","path":"/api/auth/settings/tools","user":"owner"},
        {"method":"GET","path":"/api/auth/settings/tools","user":"other"}
    ])).await;
}
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn origin_rejections_and_deleted_user_denials_prevent_effects() {
    scenario("",false,None,json!([
        {"method":"POST","path":"/api/auth/login","headers":{"origin":"https://evil.example"},"body":{"username":"alice","password":"password 🦀"}},
        {"method":"GET","path":"/api/auth/settings","headers":{"origin":"https://evil.example"},"user":"owner"},
        {"method":"GET","path":"/api/auth/me","headers":{"origin":"http://fixture.local"},"user":"owner"},
        {"method":"GET","path":"/api/auth/me","headers":{"origin":"https://allowed.example"},"user":"owner"},
        {"method":"PATCH","path":"/api/auth/settings","user":"owner","mutate":"DELETE FROM users WHERE id='owner'","body":{"theme":"dark"}}
    ])).await;
}
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn native_first_owner_registration_preserves_utf16_password_length_rule() {
    scenario("",true,None,json!([
        {"method":"POST","path":"/api/auth/register","body":{"username":" ","password":"password"}},
        {"method":"POST","path":"/api/auth/register","body":{"username":"new","password":"🦀🦀🦀"}},
        {"method":"POST","path":"/api/auth/register","body":{"username":" NEW ","password":"🦀🦀🦀🦀"}},
        {"method":"POST","path":"/api/auth/login","body":{"username":"new","password":"🦀🦀🦀🦀"}}
    ])).await;
}
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn binding_cannot_transfer_another_users_session() {
    let seed = "INSERT INTO sessions(id,user_id,name,created_at,last_active_at) VALUES('foreign','other','private','now','now'),('unowned',NULL,'old','now','now')";
    let (results,_)=scenario(seed,false,None,json!([
        {"method":"POST","path":"/api/auth/session/bind","user":"owner","body":{"session_id":"foreign"}},
        {"method":"POST","path":"/api/auth/session/bind","user":"owner","body":{"session_id":"unowned"}},
        {"method":"POST","path":"/api/auth/session/bind","user":"owner","body":{"session_id":"missing"}},
        {"method":"POST","path":"/api/auth/session/bind","user":"owner","body":{}}
    ])).await;
    assert_eq!(
        results[0]["status"], 404,
        "foreign session must not be rebound"
    );
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn environment_status_and_bounded_recent_models_match_actual_server() {
    scenario("",false,None,json!([
        {"method":"GET","path":"/api/auth/settings/env-status","user":"owner"},
        {"method":"PATCH","path":"/api/auth/settings","user":"owner","body":{"recent_models":(0..25).map(|i|format!("model-{i}")).collect::<Vec<_>>()}},
        {"method":"GET","path":"/api/auth/settings","user":"owner"}
    ])).await;
}
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn registration_consumes_valid_invitation_once_and_rejects_expired_tokens() {
    scenario("INSERT INTO account_invitations(token_hash,created_by,expires_at) VALUES('ec654fac9599f62e79e2706abef23dfb7c07c08185aa86db4d8695f0b718d1b3','owner','9999-01-01T00:00:00.000Z'),('fa64ea1e82e1206f828ab2a02917c7e92accb98e3b95881a1b4ad52b914b66e3','owner','2000-01-01T00:00:00.000Z')",false,None,json!([
        {"method":"POST","path":"/api/auth/register","body":{"username":"new","password":"password1","invitation":" expired "}},
        {"method":"POST","path":"/api/auth/register","body":{"username":"new","password":"password1","invitation":" valid "}},
        {"method":"POST","path":"/api/auth/register","body":{"username":"newer","password":"password1","invitation":"valid"}},
        {"method":"POST","path":"/api/auth/login","body":{"username":"new","password":"password1"}}
    ])).await;
}
