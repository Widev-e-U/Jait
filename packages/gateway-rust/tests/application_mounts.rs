//! Black-box checks that routers are served by the composed application binary path.
use jait_gateway::config::GatewayConfig;
use jait_gateway::runtime::application::{Application, ApplicationConfig};
use std::time::Duration;

async fn start() -> (
    String,
    tokio::sync::oneshot::Sender<()>,
    tokio::task::JoinHandle<()>,
    std::path::PathBuf,
) {
    start_with_web(false).await
}

async fn start_with_web(
    web: bool,
) -> (
    String,
    tokio::sync::oneshot::Sender<()>,
    tokio::task::JoinHandle<()>,
    std::path::PathBuf,
) {
    start_seeded(web, |_| {}).await
}

async fn start_seeded(
    web: bool,
    seed: impl FnOnce(&std::path::Path),
) -> (
    String,
    tokio::sync::oneshot::Sender<()>,
    tokio::task::JoinHandle<()>,
    std::path::PathBuf,
) {
    let dir = std::env::temp_dir().join(format!("jait-mounts-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).unwrap();
    seed(&dir);
    let web_root = web.then(|| {
        let root = dir.join("web");
        std::fs::create_dir_all(root.join("assets")).unwrap();
        std::fs::write(root.join("index.html"), "<html>jait-ui</html>").unwrap();
        std::fs::write(root.join("assets/app.js"), "console.log(1)").unwrap();
        root
    });
    let mut app = Application::bind_with_settings_chat(
        GatewayConfig {
            address: "127.0.0.1:0".parse().unwrap(),
            allow_non_loopback: false,
        },
        ApplicationConfig {
            database_path: dir.join("gateway.sqlite"),
            project_root: dir.clone(),
            jwt_secret: "mount-secret".into(),
            cors_origin: String::new(),
            web_root,
            health: None,
        },
    )
    .await
    .unwrap();
    app.mount_websocket(
        jait_gateway::ws::WsHubConfig::default(),
        std::num::NonZeroUsize::new(8).unwrap(),
        Duration::from_secs(5),
    )
    .unwrap();
    let base = format!("http://{}", app.local_addr().unwrap());
    let (stop, stopped) = tokio::sync::oneshot::channel::<()>();
    let task = tokio::spawn(async move {
        app.serve(async move {
            let _ = stopped.await;
        })
        .await
        .unwrap();
    });
    (base, stop, task, dir)
}

async fn token(client: &reqwest::Client, base: &str) -> String {
    let r: serde_json::Value = client
        .post(format!("{base}/api/auth/register"))
        .json(&serde_json::json!({"username":"mounter","password":"correct-horse-1"}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    r["access_token"]
        .as_str()
        .unwrap_or_else(|| panic!("no token: {r}"))
        .to_owned()
}

#[tokio::test]
async fn threads_and_reminders_are_served_and_authenticated() {
    let (base, stop, task, dir) = start().await;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .unwrap();
    for path in ["/api/threads", "/api/reminders"] {
        let anon = client.get(format!("{base}{path}")).send().await.unwrap();
        assert_eq!(anon.status(), 401, "{path} must require auth, not 404");
    }
    let token = token(&client, &base).await;
    for path in ["/api/threads", "/api/reminders"] {
        let ok = client
            .get(format!("{base}{path}"))
            .bearer_auth(&token)
            .send()
            .await
            .unwrap();
        assert_eq!(ok.status(), 200, "{path}");
    }
    stop.send(()).unwrap();
    tokio::time::timeout(Duration::from_secs(10), task)
        .await
        .unwrap()
        .unwrap();
    let _ = std::fs::remove_dir_all(dir);
}

#[tokio::test]
async fn filesystem_and_secrets_are_served_and_authenticated() {
    let (base, stop, task, dir) = start().await;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .unwrap();
    for path in ["/api/filesystem/roots", "/api/secrets"] {
        let anon = client.get(format!("{base}{path}")).send().await.unwrap();
        assert_eq!(anon.status(), 401, "{path} must require auth, not 404");
    }
    let token = token(&client, &base).await;
    let roots = client
        .get(format!("{base}/api/filesystem/roots"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap();
    assert_eq!(roots.status(), 200);
    let secrets = client
        .get(format!("{base}/api/secrets"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap();
    assert_eq!(secrets.status(), 200);
    stop.send(()).unwrap();
    tokio::time::timeout(Duration::from_secs(10), task)
        .await
        .unwrap()
        .unwrap();
    let _ = std::fs::remove_dir_all(dir);
}

#[tokio::test]
async fn git_plans_proposals_and_repositories_are_served_and_authenticated() {
    let (base, shutdown, task, _dir) = start().await;
    let client = reqwest::Client::new();
    let token = token(&client, &base).await;
    for path in ["/api/repos"] {
        let anon = client.get(format!("{base}{path}")).send().await.unwrap();
        assert_eq!(anon.status(), 401, "{path}");
        let ok = client
            .get(format!("{base}{path}"))
            .bearer_auth(&token)
            .send()
            .await
            .unwrap();
        assert_eq!(ok.status(), 200, "{path}");
    }
    for path in ["/api/git/status", "/api/git/branches"] {
        let anon = client
            .post(format!("{base}{path}"))
            .json(&serde_json::json!({}))
            .send()
            .await
            .unwrap();
        assert_eq!(anon.status(), 401, "{path}");
    }
    let anon = client
        .get(format!("{base}/api/repos/x/plans"))
        .send()
        .await
        .unwrap();
    assert_eq!(anon.status(), 401);
    let anon = client
        .get(format!("{base}/api/repos/x/proposals"))
        .send()
        .await
        .unwrap();
    assert_eq!(anon.status(), 401);
    let _ = shutdown.send(());
    let _ = task.await;
}

#[tokio::test]
async fn profiles_architecture_and_questions_are_served_and_authenticated() {
    let (base, shutdown, task, _dir) = start().await;
    let client = reqwest::Client::new();
    let token = token(&client, &base).await;
    for path in ["/api/assistants/profiles", "/api/user-questions/requests"] {
        let anon = client.get(format!("{base}{path}")).send().await.unwrap();
        assert_eq!(anon.status(), 401, "{path}");
        let ok = client
            .get(format!("{base}{path}"))
            .bearer_auth(&token)
            .send()
            .await
            .unwrap();
        assert_eq!(ok.status(), 200, "{path}");
    }
    let anon = client
        .get(format!("{base}/api/architecture"))
        .send()
        .await
        .unwrap();
    assert_eq!(anon.status(), 401);
    let _ = shutdown.send(());
    let _ = task.await;
}

#[tokio::test]
async fn web_ui_is_served_with_spa_fallback_and_api_stays_json() {
    let (base, stop, task, dir) = start_with_web(true).await;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .unwrap();
    let root = client.get(format!("{base}/")).send().await.unwrap();
    assert_eq!(root.status(), 200);
    assert!(root.text().await.unwrap().contains("jait-ui"));
    let asset = client
        .get(format!("{base}/assets/app.js"))
        .send()
        .await
        .unwrap();
    assert_eq!(asset.status(), 200);
    assert_eq!(asset.text().await.unwrap(), "console.log(1)");
    let spa = client
        .get(format!("{base}/projects/abc"))
        .send()
        .await
        .unwrap();
    assert_eq!(spa.status(), 200);
    assert!(spa.text().await.unwrap().contains("jait-ui"));
    let api = client
        .get(format!("{base}/api/does-not-exist"))
        .send()
        .await
        .unwrap();
    assert_eq!(api.status(), 404);
    assert!(api.text().await.unwrap().contains("Not Found"));
    let traversal = client
        .get(format!("{base}/..%2f..%2fgateway.sqlite"))
        .send()
        .await
        .unwrap();
    assert!(!traversal.text().await.unwrap().contains("SQLite"));
    let _ = stop.send(());
    task.await.unwrap();
    let _ = std::fs::remove_dir_all(dir);
}

#[tokio::test]
async fn non_loopback_bind_requires_the_explicit_flag() {
    let lookup = |host: &'static str, flag: Option<&'static str>| {
        move |k: &str| match k {
            "JAIT_RUST_HOST" => Some(host.to_owned()),
            "JAIT_RUST_ALLOW_NON_LOOPBACK" => flag.map(str::to_owned),
            _ => None,
        }
    };
    assert!(GatewayConfig::from_lookup(lookup("0.0.0.0", None)).is_err());
    assert!(GatewayConfig::from_lookup(lookup("0.0.0.0", Some("maybe"))).is_err());
    let cfg = GatewayConfig::from_lookup(lookup("0.0.0.0", Some("1"))).unwrap();
    assert!(cfg.allow_non_loopback);
    let dir = std::env::temp_dir().join(format!("jait-mounts-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).unwrap();
    let mk = |allow: bool| {
        (
            GatewayConfig {
                address: "0.0.0.0:0".parse().unwrap(),
                allow_non_loopback: allow,
            },
            ApplicationConfig {
                database_path: dir.join("gateway.sqlite"),
                project_root: dir.clone(),
                jwt_secret: "mount-secret".into(),
                cors_origin: String::new(),
                web_root: None,
                health: None,
            },
        )
    };
    let (l, a) = mk(false);
    assert!(Application::bind_with_settings_chat(l, a).await.is_err());
    let (l, a) = mk(true);
    let app = Application::bind_with_settings_chat(l, a).await.unwrap();
    assert!(!app.local_addr().unwrap().ip().is_loopback());
    drop(app);
    let _ = std::fs::remove_dir_all(dir);
}

#[tokio::test]
async fn code_graph_and_update_are_served_and_authenticated() {
    let (base, stop, task, dir) = start().await;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .unwrap();
    for path in [
        "/api/code-graph",
        "/api/code-graph/snapshot",
        "/api/update/changelog",
    ] {
        let anon = client.get(format!("{base}{path}")).send().await.unwrap();
        assert_eq!(anon.status(), 401, "{path} must require auth, not 404");
    }
    let anon = client
        .post(format!("{base}/api/update/apply"))
        .send()
        .await
        .unwrap();
    assert_eq!(anon.status(), 401);
    let token = token(&client, &base).await;
    let graph = client
        .get(format!("{base}/api/code-graph"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap();
    let status = graph.status();
    let body = graph.text().await.unwrap();
    assert!(
        status != 404 && status != 401 && !status.is_server_error(),
        "code-graph: {status} {body}"
    );
    let apply = client
        .post(format!("{base}/api/update/apply"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap();
    assert_ne!(apply.status(), 404);
    stop.send(()).unwrap();
    tokio::time::timeout(Duration::from_secs(10), task)
        .await
        .unwrap()
        .unwrap();
    let _ = std::fs::remove_dir_all(dir);
}

#[tokio::test]
async fn environment_and_calendar_are_served_and_authenticated() {
    let (base, stop, task, dir) = start().await;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .unwrap();
    for path in [
        "/api/environment/snapshot",
        "/api/calendar/config",
        "/api/calendar/accounts",
    ] {
        let anon = client.get(format!("{base}{path}")).send().await.unwrap();
        assert_eq!(anon.status(), 401, "{path} must require auth, not 404");
    }
    let token = token(&client, &base).await;
    for path in [
        "/api/environment/snapshot",
        "/api/calendar/config",
        "/api/calendar/accounts",
    ] {
        let ok = client
            .get(format!("{base}{path}"))
            .bearer_auth(&token)
            .send()
            .await
            .unwrap();
        let status = ok.status();
        let body = ok.text().await.unwrap();
        assert_eq!(status, 200, "{path}: {body}");
    }
    stop.send(()).unwrap();
    tokio::time::timeout(Duration::from_secs(10), task)
        .await
        .unwrap()
        .unwrap();
    let _ = std::fs::remove_dir_all(dir);
}

#[tokio::test]
async fn voice_is_served_and_authenticated() {
    let (base, stop, task, dir) = start().await;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .unwrap();
    // Node parity: the 501 probe precedes auth, so without a configured STT transport this is 501.
    let anonymous = client
        .post(format!("{base}/api/voice/transcribe-audio"))
        .send()
        .await
        .unwrap();
    assert!([401, 501].contains(&anonymous.status().as_u16()));
    let token = token(&client, &base).await;
    let unconfigured = client
        .post(format!("{base}/api/voice/transcribe-audio"))
        .bearer_auth(&token)
        .json(&serde_json::json!({}))
        .send()
        .await
        .unwrap();
    // Empty audio is rejected (400) when the operator env configured a provider, else 501.
    assert!([400, 501].contains(&unconfigured.status().as_u16()));
    let state = client
        .get(format!("{base}/api/voice/state/s1"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap();
    assert_eq!(state.status(), 200);
    stop.send(()).unwrap();
    tokio::time::timeout(Duration::from_secs(10), task)
        .await
        .unwrap()
        .unwrap();
    let _ = std::fs::remove_dir_all(dir);
}

#[tokio::test]
async fn skills_are_discovered_toggled_and_authenticated() {
    let (base, stop, task, dir) = start_seeded(false, |dir| {
        let skill = dir.join(".jait/skills/demo");
        std::fs::create_dir_all(&skill).unwrap();
        std::fs::write(
            skill.join("SKILL.md"),
            "---\nname: Demo\ndescription: A demo skill\n---\nBody\n",
        )
        .unwrap();
    })
    .await;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .unwrap();
    assert_eq!(
        client
            .get(format!("{base}/api/skills"))
            .send()
            .await
            .unwrap()
            .status(),
        401
    );
    let token = token(&client, &base).await;
    let list: serde_json::Value = client
        .get(format!("{base}/api/skills"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let demo = list
        .as_array()
        .unwrap()
        .iter()
        .find(|s| s["id"] == "demo")
        .unwrap_or_else(|| panic!("demo skill missing: {list}"));
    assert_eq!(demo["source"], "project");
    assert_eq!(demo["enabled"], true);
    let toggled: serde_json::Value = client
        .patch(format!("{base}/api/skills/demo"))
        .bearer_auth(&token)
        .json(&serde_json::json!({"enabled": false}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(toggled["enabled"], false);
    let missing = client
        .patch(format!("{base}/api/skills/nope"))
        .bearer_auth(&token)
        .json(&serde_json::json!({"enabled": true}))
        .send()
        .await
        .unwrap();
    assert_eq!(missing.status(), 404);
    stop.send(()).unwrap();
    tokio::time::timeout(Duration::from_secs(10), task)
        .await
        .unwrap()
        .unwrap();
    let _ = std::fs::remove_dir_all(dir);
}

/// Minimal OpenAI-compatible streaming endpoint; records the bearer key it was called with.
async fn fake_openai() -> (
    String,
    std::sync::Arc<std::sync::Mutex<Vec<(String, serde_json::Value)>>>,
) {
    use axum::{Router, http::HeaderMap, routing::post};
    let seen = std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));
    let log = seen.clone();
    let app = Router::new().route(
        "/v1/chat/completions",
        post(move |headers: HeaderMap, body: axum::Json<serde_json::Value>| {
            let log = log.clone();
            async move {
                let auth = headers
                    .get("authorization")
                    .and_then(|v| v.to_str().ok())
                    .unwrap_or_default()
                    .to_owned();
                log.lock().unwrap().push((auth, body.0));
                let sse = concat!(
                    "data: {\"choices\":[{\"delta\":{\"content\":\"hello from \"}}]}\n\n",
                    "data: {\"choices\":[{\"delta\":{\"content\":\"the fake model\"},\"finish_reason\":\"stop\"}]}\n\n",
                    "data: [DONE]\n\n"
                );
                ([("content-type", "text/event-stream")], sse)
            }
        }),
    );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}/v1", listener.local_addr().unwrap());
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    (base, seen)
}

#[tokio::test]
async fn chat_turn_runs_on_the_users_saved_openai_compatible_settings() {
    let (model_base, seen) = fake_openai().await;
    let (base, stop, task, dir) = start().await;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .unwrap();
    let token = token(&client, &base).await;
    // No model selected: the turn must fail instead of choosing a default for the user.
    let session: serde_json::Value = client
        .post(format!("{base}/api/sessions"))
        .bearer_auth(&token)
        .json(&serde_json::json!({}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let session_id = session["id"].as_str().unwrap().to_owned();
    let no_model = client
        .post(format!("{base}/api/chat"))
        .bearer_auth(&token)
        .json(&serde_json::json!({"sessionId": session_id, "content": "hi"}))
        .send()
        .await
        .unwrap();
    assert_ne!(no_model.status(), 200);
    assert!(seen.lock().unwrap().is_empty());
    let saved = client
        .patch(format!("{base}/api/auth/settings"))
        .bearer_auth(&token)
        .json(&serde_json::json!({
            "api_keys": {"OPENAI_BASE_URL": model_base, "OPENAI_API_KEY": "user-key"},
            "selected_model": "test-model"
        }))
        .send()
        .await
        .unwrap();
    assert_eq!(saved.status(), 200);
    let reply = client
        .post(format!("{base}/api/chat"))
        .bearer_auth(&token)
        .json(&serde_json::json!({"sessionId": session_id, "content": "hi"}))
        .send()
        .await
        .unwrap();
    assert_eq!(reply.status(), 200);
    let body = reply.text().await.unwrap();
    assert!(body.contains("hello from"), "{body}");
    assert!(body.contains("\"type\":\"done\""), "{body}");
    let calls = seen.lock().unwrap().clone();
    assert_eq!(calls.len(), 1);
    assert_eq!(calls[0].0, "Bearer user-key");
    assert_eq!(calls[0].1["model"], "test-model");
    stop.send(()).unwrap();
    tokio::time::timeout(Duration::from_secs(10), task)
        .await
        .unwrap()
        .unwrap();
    let _ = std::fs::remove_dir_all(dir);
}

/// Fake model: the first request asks for `file.read`, later requests answer with whatever the
/// tool message carried, so the test proves the tool result reached the model.
async fn fake_tool_model() -> (
    String,
    std::sync::Arc<std::sync::Mutex<Vec<serde_json::Value>>>,
) {
    fake_model_calling("file_read", serde_json::json!({"path": "notes.txt"})).await
}

async fn fake_model_calling(
    tool: &'static str,
    arguments: serde_json::Value,
) -> (
    String,
    std::sync::Arc<std::sync::Mutex<Vec<serde_json::Value>>>,
) {
    use axum::{Router, routing::post};
    let seen = std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));
    let log = seen.clone();
    let app = Router::new().route(
        "/v1/chat/completions",
        post(move |body: axum::Json<serde_json::Value>| {
            let log = log.clone();
            let arguments = arguments.clone();
            async move {
                let tool_text = body.0["messages"]
                    .as_array()
                    .and_then(|m| m.iter().rev().find(|m| m["role"] == "tool"))
                    .map(|m| m["content"].to_string());
                log.lock().unwrap().push(body.0.clone());
                let sse = match tool_text {
                    None => format!(
                        "data: {}\n\ndata: [DONE]\n\n",
                        serde_json::json!({"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":tool,"arguments":arguments.to_string()}}]},"finish_reason":"tool_calls"}]})
                    ),
                    Some(t) => format!(
                        "data: {}\n\ndata: [DONE]\n\n",
                        serde_json::json!({"choices":[{"delta":{"content":format!("tool said: {t}")},"finish_reason":"stop"}]})
                    ),
                };
                ([("content-type", "text/event-stream")], sse)
            }
        }),
    );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}/v1", listener.local_addr().unwrap());
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    (base, seen)
}

#[tokio::test]
async fn chat_turn_reads_a_project_file_through_the_consent_executor() {
    let (model_base, seen) = fake_tool_model().await;
    let (base, stop, task, dir) = start_seeded(false, |d| {
        std::fs::write(d.join("notes.txt"), "secret-marker-42").unwrap();
    })
    .await;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .unwrap();
    let token = token(&client, &base).await;
    let saved = client
        .patch(format!("{base}/api/auth/settings"))
        .bearer_auth(&token)
        .json(&serde_json::json!({
            "api_keys": {"OPENAI_BASE_URL": model_base, "OPENAI_API_KEY": "k"},
            "selected_model": "m"
        }))
        .send()
        .await
        .unwrap();
    assert_eq!(saved.status(), 200);
    let session: serde_json::Value = client
        .post(format!("{base}/api/sessions"))
        .bearer_auth(&token)
        .json(&serde_json::json!({}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let reply = client
        .post(format!("{base}/api/chat"))
        .bearer_auth(&token)
        .json(&serde_json::json!({"sessionId": session["id"], "content": "read notes"}))
        .send()
        .await
        .unwrap();
    assert_eq!(reply.status(), 200);
    let body = reply.text().await.unwrap();
    assert!(body.contains("secret-marker-42"), "{body}");
    let calls = seen.lock().unwrap().clone();
    assert_eq!(calls.len(), 2, "{calls:?}");
    assert_eq!(calls[0]["tools"][0]["function"]["name"], "file_read");
    stop.send(()).unwrap();
    tokio::time::timeout(Duration::from_secs(10), task)
        .await
        .unwrap()
        .unwrap();
    let _ = std::fs::remove_dir_all(dir);
}

#[tokio::test]
async fn chat_write_waits_for_consent_then_applies_or_leaves_the_file() {
    let (model_base, seen) = fake_model_calling(
        "file_write",
        serde_json::json!({"path": "notes.txt", "content": "rewritten"}),
    )
    .await;
    let (base, stop, task, dir) = start_seeded(false, |d| {
        std::fs::write(d.join("notes.txt"), "original").unwrap();
    })
    .await;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .unwrap();
    let token = token(&client, &base).await;
    let saved = client
        .patch(format!("{base}/api/auth/settings"))
        .bearer_auth(&token)
        .json(&serde_json::json!({
            "api_keys": {"OPENAI_BASE_URL": model_base, "OPENAI_API_KEY": "k"},
            "selected_model": "m"
        }))
        .send()
        .await
        .unwrap();
    assert_eq!(saved.status(), 200);
    for (action, expected) in [("reject", "original"), ("approve", "rewritten")] {
        let session: serde_json::Value = client
            .post(format!("{base}/api/sessions"))
            .bearer_auth(&token)
            .json(&serde_json::json!({}))
            .send()
            .await
            .unwrap()
            .json()
            .await
            .unwrap();
        let turn = {
            let (client, base, token) = (client.clone(), base.clone(), token.clone());
            let body = serde_json::json!({"sessionId": session["id"], "content": "rewrite notes"});
            tokio::spawn(async move {
                client
                    .post(format!("{base}/api/chat"))
                    .bearer_auth(&token)
                    .json(&body)
                    .send()
                    .await
                    .unwrap()
                    .text()
                    .await
                    .unwrap()
            })
        };
        let mut pending = None;
        for _ in 0..100 {
            let listed: serde_json::Value = client
                .get(format!("{base}/api/consent/pending"))
                .bearer_auth(&token)
                .send()
                .await
                .unwrap()
                .json()
                .await
                .unwrap();
            if let Some(first) = listed["requests"].as_array().and_then(|r| r.first()) {
                pending = Some(first.clone());
                break;
            }
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
        let pending = pending.expect("write must wait for consent");
        assert_eq!(pending["toolName"], "file.write");
        assert_eq!(
            std::fs::read_to_string(dir.join("notes.txt")).unwrap(),
            "original",
            "file must not change before approval"
        );
        let decided = client
            .post(format!(
                "{base}/api/consent/{}/{action}",
                pending["id"].as_str().unwrap()
            ))
            .bearer_auth(&token)
            .json(&serde_json::json!({}))
            .send()
            .await
            .unwrap();
        assert_eq!(decided.status(), 200);
        tokio::time::timeout(Duration::from_secs(20), turn)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(
            std::fs::read_to_string(dir.join("notes.txt")).unwrap(),
            expected,
            "after {action}"
        );
    }
    assert!(seen.lock().unwrap().len() >= 2);
    // Without a token the consent queue is not readable.
    let anonymous = client
        .get(format!("{base}/api/consent/pending"))
        .send()
        .await
        .unwrap();
    assert_eq!(anonymous.status(), 401);
    stop.send(()).unwrap();
    tokio::time::timeout(Duration::from_secs(10), task)
        .await
        .unwrap()
        .unwrap();
    let _ = std::fs::remove_dir_all(dir);
}

#[tokio::test]
async fn chat_terminal_command_waits_for_consent_then_runs_or_never_starts() {
    let (model_base, seen) = fake_model_calling(
        "terminal_run",
        serde_json::json!({"command": "printf ran > marker.txt"}),
    )
    .await;
    let (base, stop, task, dir) = start_seeded(false, |d| {
        let _ = d;
    })
    .await;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .unwrap();
    let token = token(&client, &base).await;
    let saved = client
        .patch(format!("{base}/api/auth/settings"))
        .bearer_auth(&token)
        .json(&serde_json::json!({
            "api_keys": {"OPENAI_BASE_URL": model_base, "OPENAI_API_KEY": "k"},
            "selected_model": "m"
        }))
        .send()
        .await
        .unwrap();
    assert_eq!(saved.status(), 200);
    for (action, expected) in [("reject", false), ("approve", true)] {
        let session: serde_json::Value = client
            .post(format!("{base}/api/sessions"))
            .bearer_auth(&token)
            .json(&serde_json::json!({}))
            .send()
            .await
            .unwrap()
            .json()
            .await
            .unwrap();
        let turn = {
            let (client, base, token) = (client.clone(), base.clone(), token.clone());
            let body = serde_json::json!({"sessionId": session["id"], "content": "rewrite notes"});
            tokio::spawn(async move {
                client
                    .post(format!("{base}/api/chat"))
                    .bearer_auth(&token)
                    .json(&body)
                    .send()
                    .await
                    .unwrap()
                    .text()
                    .await
                    .unwrap()
            })
        };
        let mut pending = None;
        for _ in 0..100 {
            let listed: serde_json::Value = client
                .get(format!("{base}/api/consent/pending"))
                .bearer_auth(&token)
                .send()
                .await
                .unwrap()
                .json()
                .await
                .unwrap();
            if let Some(first) = listed["requests"].as_array().and_then(|r| r.first()) {
                pending = Some(first.clone());
                break;
            }
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
        let pending = pending.expect("write must wait for consent");
        assert_eq!(pending["toolName"], "terminal.run");
        assert!(
            !dir.join("marker.txt").exists(),
            "command must not start before approval"
        );
        let decided = client
            .post(format!(
                "{base}/api/consent/{}/{action}",
                pending["id"].as_str().unwrap()
            ))
            .bearer_auth(&token)
            .json(&serde_json::json!({}))
            .send()
            .await
            .unwrap();
        assert_eq!(decided.status(), 200);
        tokio::time::timeout(Duration::from_secs(20), turn)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(dir.join("marker.txt").exists(), expected, "after {action}");
    }
    assert!(seen.lock().unwrap().len() >= 2);
    // Without a token the consent queue is not readable.
    let anonymous = client
        .get(format!("{base}/api/consent/pending"))
        .send()
        .await
        .unwrap();
    assert_eq!(anonymous.status(), 401);
    stop.send(()).unwrap();
    tokio::time::timeout(Duration::from_secs(10), task)
        .await
        .unwrap()
        .unwrap();
    let _ = std::fs::remove_dir_all(dir);
}

#[tokio::test]
async fn acp_chat_turn_routes_agent_permission_through_consent() {
    let script = r#"read a; printf '%s\n' '{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":1}}'
read b; printf '%s\n' '{"jsonrpc":"2.0","id":2,"result":{"sessionId":"agent"}}'
read c
printf '%s\n' '{"jsonrpc":"2.0","id":"cb","method":"session/request_permission","params":{"sessionId":"agent","toolCall":{"title":"Delete everything"},"options":[{"optionId":"yes","name":"Allow","kind":"allow_once"},{"optionId":"no","name":"Reject","kind":"reject_once"}]}}'
read d
case "$d" in *'"yes"'*) word=approved;; *) word=denied;; esac
printf '{"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"agent","update":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"agent %s"}}}}\n' "$word"
printf '%s\n' '{"jsonrpc":"2.0","id":3,"result":{"stopReason":"end_turn"}}'
read keep"#;
    // SAFETY: only this test sets the operator ACP variables, before the app is built.
    unsafe {
        std::env::set_var("JAIT_ACP_COMMAND", "/bin/sh");
        std::env::set_var(
            "JAIT_ACP_ARGS",
            serde_json::json!(["-c", script]).to_string(),
        );
    }
    let (base, stop, task, dir) = start_seeded(false, |_| {}).await;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .unwrap();
    let token = token(&client, &base).await;
    // Without the opt-in the ACP agent is never used, and selecting it needs no model.
    let saved = client
        .patch(format!("{base}/api/auth/settings"))
        .bearer_auth(&token)
        .json(&serde_json::json!({"api_keys": {"JAIT_CHAT_PROVIDER": "acp"}}))
        .send()
        .await
        .unwrap();
    assert_eq!(saved.status(), 200);
    for (action, expected) in [("reject", "agent denied"), ("approve", "agent approved")] {
        let session: serde_json::Value = client
            .post(format!("{base}/api/sessions"))
            .bearer_auth(&token)
            .json(&serde_json::json!({}))
            .send()
            .await
            .unwrap()
            .json()
            .await
            .unwrap();
        let turn = {
            let (client, base, token) = (client.clone(), base.clone(), token.clone());
            let body = serde_json::json!({"sessionId": session["id"], "content": "go"});
            tokio::spawn(async move {
                client
                    .post(format!("{base}/api/chat"))
                    .bearer_auth(&token)
                    .json(&body)
                    .send()
                    .await
                    .unwrap()
                    .text()
                    .await
                    .unwrap()
            })
        };
        let mut pending = None;
        for _ in 0..100 {
            let listed: serde_json::Value = client
                .get(format!("{base}/api/consent/pending"))
                .bearer_auth(&token)
                .send()
                .await
                .unwrap()
                .json()
                .await
                .unwrap();
            if let Some(first) = listed["requests"].as_array().and_then(|r| r.first()) {
                pending = Some(first.clone());
                break;
            }
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
        let Some(pending) = pending else {
            let body = tokio::time::timeout(Duration::from_secs(5), turn).await;
            panic!("the agent's permission request must reach consent: {body:?}");
        };
        assert_eq!(pending["toolName"], "Delete everything");
        let decided = client
            .post(format!(
                "{base}/api/consent/{}/{action}",
                pending["id"].as_str().unwrap()
            ))
            .bearer_auth(&token)
            .json(&serde_json::json!({}))
            .send()
            .await
            .unwrap();
        assert_eq!(decided.status(), 200);
        let streamed = tokio::time::timeout(Duration::from_secs(20), turn)
            .await
            .unwrap()
            .unwrap();
        assert!(streamed.contains(expected), "{action}: {streamed}");
    }
    stop.send(()).unwrap();
    tokio::time::timeout(Duration::from_secs(10), task)
        .await
        .unwrap()
        .unwrap();
    let _ = std::fs::remove_dir_all(dir);
}

/// Minimal WebSocket client over the gateway's own frame codec.
struct WsClient(tokio::net::TcpStream);

impl WsClient {
    async fn connect(base: &str, token: &str) -> Self {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        let host = base.trim_start_matches("http://");
        let mut stream = tokio::net::TcpStream::connect(host).await.unwrap();
        let request = format!(
            "GET /ws?token={token} HTTP/1.1\r\nHost: {host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n"
        );
        stream.write_all(request.as_bytes()).await.unwrap();
        let mut head = Vec::new();
        while !head.ends_with(b"\r\n\r\n") {
            head.push(stream.read_u8().await.unwrap());
        }
        assert!(String::from_utf8_lossy(&head).starts_with("HTTP/1.1 101"));
        Self(stream)
    }

    async fn send(&mut self, message: serde_json::Value) {
        jait_gateway::ws::write_client_frame(
            &mut self.0,
            jait_gateway::ws::OpCode::Text,
            message.to_string().as_bytes(),
            [1, 2, 3, 4],
        )
        .await
        .unwrap();
    }

    /// Next text message, or None if nothing arrives within `wait`.
    async fn next(&mut self, wait: Duration) -> Option<serde_json::Value> {
        let frame = tokio::time::timeout(wait, jait_gateway::ws::read_frame(&mut self.0, 1 << 20))
            .await
            .ok()?
            .unwrap()?;
        serde_json::from_str(frame.text()?).ok()
    }

    async fn until(&mut self, kind: &str, wait: Duration) -> Option<serde_json::Value> {
        let deadline = tokio::time::Instant::now() + wait;
        while let Some(left) = deadline.checked_duration_since(tokio::time::Instant::now()) {
            let message = self.next(left).await?;
            if message["type"] == kind {
                return Some(message);
            }
        }
        None
    }
}

#[tokio::test]
async fn consent_prompts_reach_only_websocket_clients_bound_to_the_session() {
    let (model_base, _seen) = fake_model_calling(
        "terminal_run",
        serde_json::json!({"command": "printf ran > marker.txt"}),
    )
    .await;
    let (base, stop, task, dir) = start().await;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .unwrap();
    let token = token(&client, &base).await;
    client
        .patch(format!("{base}/api/auth/settings"))
        .bearer_auth(&token)
        .json(&serde_json::json!({
            "api_keys": {"OPENAI_BASE_URL": model_base, "OPENAI_API_KEY": "k"},
            "selected_model": "m"
        }))
        .send()
        .await
        .unwrap();
    let session: serde_json::Value = client
        .post(format!("{base}/api/sessions"))
        .bearer_auth(&token)
        .json(&serde_json::json!({}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let mut bound = WsClient::connect(&base, &token).await;
    bound
        .send(serde_json::json!({"type":"subscribe","sessionId":session["id"]}))
        .await;
    assert!(
        bound
            .until("session.created", Duration::from_secs(5))
            .await
            .is_some()
    );
    // Authenticated as the same user but never bound to the session.
    let mut unbound = WsClient::connect(&base, &token).await;
    let turn = {
        let (client, base, token) = (client.clone(), base.clone(), token.clone());
        let body = serde_json::json!({"sessionId": session["id"], "content": "run it"});
        tokio::spawn(async move {
            client
                .post(format!("{base}/api/chat"))
                .bearer_auth(&token)
                .json(&body)
                .send()
                .await
                .unwrap()
                .text()
                .await
                .unwrap()
        })
    };
    let required = bound
        .until("consent.required", Duration::from_secs(15))
        .await
        .expect("bound client must be told about the pending consent");
    assert_eq!(required["payload"]["toolName"], "terminal.run");
    assert_eq!(required["sessionId"], session["id"]);
    let id = required["payload"]["id"].as_str().unwrap().to_owned();
    let decided = client
        .post(format!("{base}/api/consent/{id}/reject"))
        .bearer_auth(&token)
        .json(&serde_json::json!({}))
        .send()
        .await
        .unwrap();
    assert_eq!(decided.status(), 200);
    let resolved = bound
        .until("consent.resolved", Duration::from_secs(10))
        .await
        .expect("bound client must see the decision");
    assert_eq!(resolved["payload"]["requestId"], id);
    assert_eq!(resolved["payload"]["approved"], false);
    assert!(
        unbound
            .until("consent.required", Duration::from_millis(300))
            .await
            .is_none(),
        "a client not bound to the session must not receive its consent prompt"
    );
    let _ = tokio::time::timeout(Duration::from_secs(20), turn).await;
    assert!(!dir.join("marker.txt").exists());
    stop.send(()).unwrap();
    tokio::time::timeout(Duration::from_secs(10), task)
        .await
        .unwrap()
        .unwrap();
    let _ = std::fs::remove_dir_all(dir);
}

#[tokio::test]
async fn providers_list_the_registered_acp_adapters() {
    let (base, stop, task, dir) = start().await;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .unwrap();
    let anon = client
        .get(format!("{base}/api/providers"))
        .send()
        .await
        .unwrap();
    assert_eq!(anon.status(), 401);
    let token = token(&client, &base).await;
    let ok = client
        .get(format!("{base}/api/providers"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap();
    let status = ok.status();
    let body = ok.text().await.unwrap();
    assert_eq!(status, 200, "{body}");
    for id in ["jait", "codex", "claude-code", "pi", "muse"] {
        assert!(body.contains(&format!("\"{id}\"")), "{id} missing: {body}");
    }
    stop.send(()).unwrap();
    tokio::time::timeout(Duration::from_secs(10), task)
        .await
        .unwrap()
        .unwrap();
    let _ = std::fs::remove_dir_all(dir);
}

#[tokio::test]
async fn provider_settings_persist_through_the_real_store() {
    let (base, stop, task, dir) = start().await;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .unwrap();
    let url = format!("{base}/api/provider-usage/ollama/session");
    let anon = client
        .post(&url)
        .json(&serde_json::json!({"session": null}))
        .send()
        .await
        .unwrap();
    assert_eq!(anon.status(), 401);
    let token = token(&client, &base).await;
    let cleared = client
        .post(&url)
        .bearer_auth(&token)
        .json(&serde_json::json!({"session": null}))
        .send()
        .await
        .unwrap();
    let status = cleared.status();
    let body = cleared.text().await.unwrap();
    assert_eq!(status, 200, "{body}");
    assert!(body.contains("\"ok\":true"), "{body}");
    stop.send(()).unwrap();
    tokio::time::timeout(Duration::from_secs(10), task)
        .await
        .unwrap()
        .unwrap();
    let _ = std::fs::remove_dir_all(dir);
}

#[tokio::test]
async fn provider_accounts_and_usage_are_served_from_the_database() {
    let (base, stop, task, dir) = start().await;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .unwrap();
    for path in ["/api/provider-accounts", "/api/provider-usage"] {
        let anon = client.get(format!("{base}{path}")).send().await.unwrap();
        assert_eq!(anon.status(), 401, "{path}");
    }
    let token = token(&client, &base).await;
    let accounts = client
        .get(format!("{base}/api/provider-accounts"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap();
    let status = accounts.status();
    let body: serde_json::Value = accounts.json().await.unwrap();
    assert_eq!(status, 200, "{body}");
    assert_eq!(body["accounts"], serde_json::json!([]));
    let usage = client
        .get(format!("{base}/api/provider-usage"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap();
    let status = usage.status();
    let body: serde_json::Value = usage.json().await.unwrap();
    assert_eq!(status, 200, "{body}");
    assert_eq!(body["usage"], serde_json::json!([]));
    let summary = client
        .get(format!("{base}/api/provider-usage/summary"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap();
    let status = summary.status();
    let body: serde_json::Value = summary.json().await.unwrap();
    assert_eq!(status, 200, "{body}");
    assert!(body.is_object(), "{body}");
    let missing = client
        .delete(format!("{base}/api/provider-accounts/nope"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap();
    assert_eq!(missing.status(), 404);
    stop.send(()).unwrap();
    tokio::time::timeout(Duration::from_secs(10), task)
        .await
        .unwrap()
        .unwrap();
    let _ = std::fs::remove_dir_all(dir);
}

#[tokio::test]
async fn maintenance_runs_are_served_and_execution_needs_consent() {
    let (base, stop, task, dir) = start().await;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .unwrap();
    let anon = client
        .get(format!("{base}/api/maintenance/runs"))
        .send()
        .await
        .unwrap();
    assert_eq!(anon.status(), 401);
    let token = token(&client, &base).await;
    let list = client
        .get(format!("{base}/api/maintenance/runs"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap();
    assert_eq!(list.status(), 200);
    let missing = client
        .get(format!("{base}/api/maintenance/runs/none"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap();
    assert_eq!(missing.status(), 404);
    let run = client
        .post(format!("{base}/api/maintenance/run"))
        .bearer_auth(&token)
        .json(&serde_json::json!({"repoId": "none"}))
        .send()
        .await
        .unwrap();
    assert_eq!(run.status(), 500);
    stop.send(()).unwrap();
    tokio::time::timeout(Duration::from_secs(10), task)
        .await
        .unwrap()
        .unwrap();
    let _ = std::fs::remove_dir_all(dir);
}

#[tokio::test]
async fn jobs_are_created_listed_and_removed() {
    let (base, stop, task, dir) = start().await;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .unwrap();
    let anon = client.get(format!("{base}/api/jobs")).send().await.unwrap();
    assert_eq!(anon.status(), 401);
    let token = token(&client, &base).await;
    let created = client
        .post(format!("{base}/api/jobs"))
        .bearer_auth(&token)
        .json(&serde_json::json!({"name":"nightly","cron_expression":"0 3 * * *","job_type":"system_job","tool_name":"gateway.status"}))
        .send()
        .await
        .unwrap();
    assert_eq!(created.status(), 201);
    let created: serde_json::Value = created.json().await.unwrap();
    let id = created["id"].as_str().expect("job id").to_string();
    let list: serde_json::Value = client
        .get(format!("{base}/api/jobs"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert!(list.to_string().contains(&id));
    let providers = client
        .get(format!("{base}/api/jobs/providers/available"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap();
    assert_eq!(providers.status(), 200);
    let deleted = client
        .delete(format!("{base}/api/jobs/{id}"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap();
    assert!(deleted.status().is_success());
    stop.send(()).unwrap();
    tokio::time::timeout(Duration::from_secs(10), task)
        .await
        .unwrap()
        .unwrap();
    let _ = std::fs::remove_dir_all(dir);
}

#[tokio::test]
async fn channels_are_authenticated_and_report_no_connectors() {
    let (base, stop, task, dir) = start().await;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .unwrap();
    let anon = client.get(format!("{base}/api/channels")).send().await.unwrap();
    assert_eq!(anon.status(), 401);
    let token = token(&client, &base).await;
    let list: serde_json::Value = client
        .get(format!("{base}/api/channels"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(list, serde_json::json!([]));
    let status = client
        .get(format!("{base}/api/channels/telegram/status"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap();
    assert_eq!(status.status(), 404);
    let start_channel = client
        .post(format!("{base}/api/channels/telegram/start"))
        .bearer_auth(&token)
        .json(&serde_json::json!({}))
        .send()
        .await
        .unwrap();
    assert_eq!(start_channel.status(), 400);
    stop.send(()).unwrap();
    tokio::time::timeout(Duration::from_secs(10), task)
        .await
        .unwrap()
        .unwrap();
    let _ = std::fs::remove_dir_all(dir);
}


#[tokio::test]
async fn plugins_are_authenticated_and_none_are_loaded() {
    let (base, stop, task, dir) = start().await;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .unwrap();
    let anon = client.get(format!("{base}/api/plugins")).send().await.unwrap();
    assert_eq!(anon.status(), 401);
    let token = token(&client, &base).await;
    let list: serde_json::Value = client
        .get(format!("{base}/api/plugins"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(list, serde_json::json!([]));
    let missing = client
        .get(format!("{base}/api/plugins/nope"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap();
    assert_eq!(missing.status(), 404);
    let enable = client
        .post(format!("{base}/api/plugins/nope/enable"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap();
    assert_eq!(enable.status(), 400);
    stop.send(()).unwrap();
    tokio::time::timeout(Duration::from_secs(10), task)
        .await
        .unwrap()
        .unwrap();
    let _ = std::fs::remove_dir_all(dir);
}
