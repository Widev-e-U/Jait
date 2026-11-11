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
        // password hashing is slow when every test in the file registers at once
        .timeout(Duration::from_secs(60))
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
async fn thread_create_needs_a_visible_provider_and_an_owned_session() {
    let (base, stop, task, dir) = start().await;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .unwrap();
    let url = format!("{base}/api/threads");
    let anon = client
        .post(&url)
        .json(&serde_json::json!({}))
        .send()
        .await
        .unwrap();
    assert_eq!(anon.status(), 401);
    let token = token(&client, &base).await;
    let post = |body: serde_json::Value| {
        let (client, url, token) = (client.clone(), url.clone(), token.clone());
        async move {
            client
                .post(url)
                .bearer_auth(token)
                .json(&body)
                .send()
                .await
                .unwrap()
        }
    };
    // no provider requested and none chosen on a chat: never guessed
    assert_eq!(post(serde_json::json!({})).await.status(), 400);
    assert_eq!(
        post(serde_json::json!({"providerId": "no-such-provider"}))
            .await
            .status(),
        400
    );
    assert_eq!(
        post(serde_json::json!({"providerId": "jait", "sessionId": "not-mine"}))
            .await
            .status(),
        404
    );
    assert_eq!(
        post(serde_json::json!({"providerId": "jait", "personaAgentId": "missing"}))
            .await
            .status(),
        400
    );
    let created = post(serde_json::json!({
        "providerId": "jait", "title": "T", "skillIds": [" a ", "a", "b"], "runtimeMode": "supervised"
    }))
    .await;
    assert_eq!(created.status(), 201);
    let thread: serde_json::Value = created.json().await.unwrap();
    assert_eq!(thread["status"], "idle");
    assert_eq!(thread["providerId"], "jait");
    assert_eq!(thread["runtimeMode"], "supervised");
    assert_eq!(thread["skillIds"], serde_json::json!(["a", "b"]));
    let fetched: serde_json::Value = client
        .get(format!("{url}/{}", thread["id"].as_str().unwrap()))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(fetched["title"], "T");
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
    let blank = client
        .post(format!("{base}/api/voice/speak"))
        .bearer_auth(&token)
        .json(&serde_json::json!({"text": "   "}))
        .send()
        .await
        .unwrap();
    assert_eq!(blank.status(), 400);
    let spoken = client
        .post(format!("{base}/api/voice/speak"))
        .bearer_auth(&token)
        .json(&serde_json::json!({"text": "hello there"}))
        .send()
        .await
        .unwrap();
    let status = spoken.status().as_u16();
    let body = spoken.text().await.unwrap();
    assert!(
        status != 404 && status != 401 && status < 500,
        "voice/speak: {status} {body}"
    );
    stop.send(()).unwrap();
    tokio::time::timeout(Duration::from_secs(10), task)
        .await
        .unwrap()
        .unwrap();
    let _ = std::fs::remove_dir_all(dir);
}

#[tokio::test]
async fn projects_search_and_graphrag_prepare_are_authenticated_and_scoped() {
    let (base, stop, task, dir) = start().await;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .unwrap();
    let anon = client
        .get(format!("{base}/api/projects/search?q=x"))
        .send()
        .await
        .unwrap();
    assert_eq!(anon.status(), 401);
    let anon = client
        .post(format!("{base}/api/code-graph/graphrag/prepare"))
        .json(&serde_json::json!({}))
        .send()
        .await
        .unwrap();
    assert_eq!(anon.status(), 401);
    let token = token(&client, &base).await;
    let blank: serde_json::Value = client
        .get(format!("{base}/api/projects/search?q="))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert!(blank["projects"].as_array().unwrap().is_empty());
    let created = client
        .post(format!("{base}/api/projects"))
        .bearer_auth(&token)
        .json(&serde_json::json!({"title":"findable-alpha","rootPath": dir.to_str().unwrap()}))
        .send()
        .await
        .unwrap();
    assert!(created.status().is_success(), "{}", created.status());
    let found: serde_json::Value = client
        .get(format!("{base}/api/projects/search?q=findable"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(found["projects"].as_array().unwrap().len(), 1);
    let none: serde_json::Value = client
        .get(format!("{base}/api/projects/search?q=zzz-nothing"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert!(none["projects"].as_array().unwrap().is_empty());
    // a root outside the caller's projects is never prepared
    let outside = client
        .post(format!("{base}/api/code-graph/graphrag/prepare"))
        .bearer_auth(&token)
        .json(&serde_json::json!({"workspaceRoot": "/etc"}))
        .send()
        .await
        .unwrap();
    let status = outside.status().as_u16();
    let body = outside.text().await.unwrap();
    assert!(
        [400, 403, 404, 409, 503].contains(&status),
        "graphrag/prepare outside projects: {status} {body}"
    );
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
async fn chat_lists_without_consent_and_patch_waits_for_approval() {
    for (tool, arguments, consent) in [
        ("file_list", serde_json::json!({"path": "."}), false),
        (
            "file_patch",
            serde_json::json!({"path": "notes.txt", "search": "original", "replace": "patched"}),
            true,
        ),
    ] {
        let (model_base, seen) = fake_model_calling(tool, arguments).await;
        let (base, stop, task, dir) = start_seeded(false, |d| {
            std::fs::write(d.join("notes.txt"), "original text").unwrap();
            std::fs::create_dir(d.join("subdir")).unwrap();
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
        if consent {
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
            let pending = pending.expect("patch must wait for consent");
            assert_eq!(pending["toolName"], "file.patch");
            assert_eq!(
                std::fs::read_to_string(dir.join("notes.txt")).unwrap(),
                "original text",
                "file must not change before approval"
            );
            let decided = client
                .post(format!(
                    "{base}/api/consent/{}/approve",
                    pending["id"].as_str().unwrap()
                ))
                .bearer_auth(&token)
                .json(&serde_json::json!({}))
                .send()
                .await
                .unwrap();
            assert_eq!(decided.status(), 200);
        }
        let text = tokio::time::timeout(Duration::from_secs(20), turn)
            .await
            .unwrap()
            .unwrap();
        if consent {
            assert_eq!(
                std::fs::read_to_string(dir.join("notes.txt")).unwrap(),
                "patched text"
            );
        } else {
            assert!(
                text.contains("notes.txt") && text.contains("subdir"),
                "{text}"
            );
        }
        assert!(seen.lock().unwrap().len() >= 2);
        stop.send(()).unwrap();
        tokio::time::timeout(Duration::from_secs(10), task)
            .await
            .unwrap()
            .unwrap();
        let _ = std::fs::remove_dir_all(dir);
    }
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
    let anon = client
        .get(format!("{base}/api/channels"))
        .send()
        .await
        .unwrap();
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
    let anon = client
        .get(format!("{base}/api/plugins"))
        .send()
        .await
        .unwrap();
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

#[tokio::test]
async fn pull_requests_are_authenticated_and_owner_scoped() {
    let (base, stop, task, dir) = start().await;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .unwrap();
    let url = format!("{base}/api/repos/missing/pull-requests");
    assert_eq!(client.get(&url).send().await.unwrap().status(), 401);
    let token = token(&client, &base).await;
    let missing = client.get(&url).bearer_auth(&token).send().await.unwrap();
    assert_eq!(missing.status(), 404);
    stop.send(()).unwrap();
    tokio::time::timeout(Duration::from_secs(10), task)
        .await
        .unwrap()
        .unwrap();
    let _ = std::fs::remove_dir_all(dir);
}

#[tokio::test]
async fn hooks_require_the_secret_token_and_fail_closed_without_a_runtime() {
    let (base, stop, task, dir) = start().await;
    let client = reqwest::Client::new();
    for path in ["/hooks/wake", "/hooks/agent"] {
        let r = client
            .post(format!("{base}{path}"))
            .json(&serde_json::json!({}))
            .send()
            .await
            .unwrap();
        assert_eq!(r.status(), 401, "{path} without a token");
        let r = client
            .post(format!("{base}{path}"))
            .header("x-hook-token", "wrong")
            .json(&serde_json::json!({}))
            .send()
            .await
            .unwrap();
        assert_eq!(r.status(), 401, "{path} with a wrong token");
    }
    let _ = stop.send(());
    let _ = task.await;
    let _ = std::fs::remove_dir_all(dir);
}

#[tokio::test]
async fn email_is_authenticated_and_lists_no_accounts() {
    let (base, stop, task, dir) = start().await;
    let client = reqwest::Client::new();
    let anon = client
        .get(format!("{base}/api/email/accounts"))
        .send()
        .await
        .unwrap();
    assert_eq!(anon.status(), 401);
    let token = token(&client, &base).await;
    let r = client
        .get(format!("{base}/api/email/accounts"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 200, "{}", r.text().await.unwrap());
    let _ = stop.send(());
    let _ = task.await;
    let _ = std::fs::remove_dir_all(dir);
}

#[tokio::test]
async fn trust_levels_are_authenticated_and_listed() {
    let (base, stop, task, dir) = start().await;
    let client = reqwest::Client::new();
    let anon = client
        .get(format!("{base}/api/trust/levels"))
        .send()
        .await
        .unwrap();
    assert_eq!(anon.status(), 401);
    let token = token(&client, &base).await;
    let ok = client
        .get(format!("{base}/api/trust/levels"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap();
    assert_eq!(ok.status(), 200);
    let body: serde_json::Value = ok.json().await.unwrap();
    assert!(body["levels"].is_array(), "{body}");
    drop(stop);
    let _ = task.await;
    let _ = std::fs::remove_dir_all(dir);
}

#[tokio::test]
async fn read_routes_require_login_and_answer_for_the_caller() {
    let (base, stop, task, dir) = start().await;
    let client = reqwest::Client::new();
    // (path, status for a logged-in caller)
    let paths = [
        ("/api/auth/me", 200),
        ("/api/auth/settings/env-status", 200),
        ("/api/consent/count", 200),
        ("/api/consent/policy", 200),
        ("/api/consent/pending/missing-session", 404),
        ("/api/consent/missing-consent", 404),
        ("/api/calendar/calendars", 400),
        ("/api/calendar/events", 400),
        ("/api/email/config", 200),
        ("/api/filesystem/browse", 200),
    ];
    for (path, _) in paths {
        let anon = client.get(format!("{base}{path}")).send().await.unwrap();
        assert_eq!(anon.status(), 401, "{path} must require auth");
    }
    let token = token(&client, &base).await;
    for (path, expected) in paths {
        let r = client
            .get(format!("{base}{path}"))
            .bearer_auth(&token)
            .send()
            .await
            .unwrap();
        assert_eq!(r.status(), expected, "{path}");
    }
    let me: serde_json::Value = client
        .get(format!("{base}/api/auth/me"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(me["username"], "mounter");
    let count: serde_json::Value = client
        .get(format!("{base}/api/consent/count"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(count["count"], 0);
    drop(stop);
    let _ = task.await;
    let _ = std::fs::remove_dir_all(dir);
}

#[tokio::test]
async fn tool_settings_list_and_disable_persist_for_the_caller() {
    let (base, stop, task, dir) = start().await;
    let client = reqwest::Client::new();
    let url = format!("{base}/api/auth/settings/tools");
    assert_eq!(client.get(&url).send().await.unwrap().status(), 401);
    assert_eq!(
        client
            .patch(&url)
            .json(&serde_json::json!({"disabled_tools": []}))
            .send()
            .await
            .unwrap()
            .status(),
        401
    );
    let token = token(&client, &base).await;
    let get = || async {
        client
            .get(&url)
            .bearer_auth(&token)
            .send()
            .await
            .unwrap()
            .json::<serde_json::Value>()
            .await
            .unwrap()
    };
    let listed = get().await;
    let tools = listed["tools"].as_array().expect("tools array");
    assert!(tools.iter().any(|t| t["name"] == "file.read"));
    assert!(tools.iter().all(|t| t["enabled"] == true));
    let bad = client
        .patch(&url)
        .bearer_auth(&token)
        .json(&serde_json::json!({"disabled_tools": "file.read"}))
        .send()
        .await
        .unwrap();
    assert_eq!(bad.status(), 400);
    let patched = client
        .patch(&url)
        .bearer_auth(&token)
        .json(&serde_json::json!({"disabled_tools": ["file.read"]}))
        .send()
        .await
        .unwrap();
    assert_eq!(patched.status(), 200);
    let after = get().await;
    let read = after["tools"]
        .as_array()
        .unwrap()
        .iter()
        .find(|t| t["name"] == "file.read")
        .unwrap();
    // core tools are locked and cannot be disabled; anything else must now be off
    assert_eq!(read["enabled"], read["locked"]);
    drop(stop);
    let _ = task.await;
    let _ = std::fs::remove_dir_all(dir);
}

#[tokio::test]
async fn tools_list_and_execute_need_login_and_an_owned_session() {
    let (base, stop, task, dir) = start_seeded(false, |d| {
        std::fs::write(d.join("notes.txt"), "tool-marker-7").unwrap();
    })
    .await;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .unwrap();
    assert_eq!(
        client
            .get(format!("{base}/api/tools"))
            .send()
            .await
            .unwrap()
            .status(),
        401
    );
    assert_eq!(
        client
            .post(format!("{base}/api/tools/execute"))
            .json(&serde_json::json!({"tool": "file.read"}))
            .send()
            .await
            .unwrap()
            .status(),
        401
    );
    let token = token(&client, &base).await;
    let listed: serde_json::Value = client
        .get(format!("{base}/api/tools"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let names: Vec<&str> = listed["tools"]
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|t| t["name"].as_str())
        .collect();
    assert!(
        names.contains(&"file.read") && names.contains(&"terminal.run"),
        "{listed}"
    );
    let exec = |body: serde_json::Value| {
        let (client, base, token) = (client.clone(), base.clone(), token.clone());
        async move {
            client
                .post(format!("{base}/api/tools/execute"))
                .bearer_auth(token)
                .json(&body)
                .send()
                .await
                .unwrap()
        }
    };
    assert_eq!(exec(serde_json::json!({})).await.status(), 400);
    assert_eq!(
        exec(serde_json::json!({"tool": "file.read"}))
            .await
            .status(),
        400
    );
    assert_eq!(
        exec(serde_json::json!({"tool": "file.read", "sessionId": "nope"}))
            .await
            .status(),
        404
    );
    assert_eq!(
        exec(serde_json::json!({"tool": "file.read", "sessionId": "x", "nodeId": "other"}))
            .await
            .status(),
        503
    );
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
    let ok = exec(serde_json::json!({
        "tool": "file.read", "sessionId": session["id"], "input": {"path": "notes.txt"}
    }))
    .await;
    assert_eq!(ok.status(), 200);
    let body: serde_json::Value = ok.json().await.unwrap();
    assert!(body.to_string().contains("tool-marker-7"), "{body}");
    let escape = exec(serde_json::json!({
        "tool": "file.read", "sessionId": session["id"], "input": {"path": "../../etc/passwd"}
    }))
    .await;
    let escape: serde_json::Value = escape.json().await.unwrap();
    assert_eq!(escape["ok"], false, "{escape}");
    stop.send(()).unwrap();
    tokio::time::timeout(Duration::from_secs(10), task)
        .await
        .unwrap()
        .unwrap();
    let _ = std::fs::remove_dir_all(dir);
}

#[tokio::test]
async fn surfaces_list_is_authenticated_and_owner_scoped() {
    let (base, stop, task, dir) = start().await;
    let client = reqwest::Client::new();
    let anon = client
        .get(format!("{base}/api/surfaces"))
        .send()
        .await
        .unwrap();
    assert_eq!(anon.status(), 401);
    let token = token(&client, &base).await;
    let made = client
        .post(format!("{base}/api/terminals"))
        .bearer_auth(&token)
        .json(&serde_json::json!({}))
        .send()
        .await
        .unwrap();
    let made_status = made.status();
    let ok = client
        .get(format!("{base}/api/surfaces"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap();
    assert_eq!(ok.status(), 200);
    let body: serde_json::Value = ok.json().await.unwrap();
    assert!(body["surfaces"].is_array(), "{body}");
    assert!(body["registeredTypes"].is_array(), "{body}");
    if made_status.is_success() {
        assert!(!body["surfaces"].as_array().unwrap().is_empty(), "{body}");
    }
    drop(stop);
    let _ = task.await;
    let _ = std::fs::remove_dir_all(dir);
}

#[tokio::test]
async fn agent_control_halts_resumes_and_reports_stop_failure() {
    let (base, stop, task, dir) = start().await;
    let client = reqwest::Client::new();
    let anon = client
        .get(format!("{base}/api/agent-control"))
        .send()
        .await
        .unwrap();
    assert_eq!(anon.status(), 401);
    let token = token(&client, &base).await;
    let halt: serde_json::Value = client
        .post(format!("{base}/api/agent-control/halt"))
        .bearer_auth(&token)
        .json(&serde_json::json!({"reason":"test"}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(halt["state"]["halted"], true, "{halt}");
    assert!(
        halt["stopError"].as_str().is_some_and(|e| !e.is_empty()),
        "{halt}"
    );
    let resumed: serde_json::Value = client
        .post(format!("{base}/api/agent-control/resume"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(resumed["state"]["halted"], false, "{resumed}");
    drop(stop);
    let _ = task.await;
    let _ = std::fs::remove_dir_all(dir);
}

#[tokio::test]
async fn github_apps_are_authenticated_and_fail_closed() {
    let (base, stop, task, dir) = start().await;
    let client = reqwest::Client::new();
    let anon = client
        .get(format!("{base}/api/github-apps"))
        .send()
        .await
        .unwrap();
    assert_eq!(anon.status(), 401);
    let token = token(&client, &base).await;
    let list: serde_json::Value = client
        .get(format!("{base}/api/github-apps"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(list["configured"], 0, "{list}");
    let hook = client
        .post(format!("{base}/api/github/apps/webhook"))
        .json(&serde_json::json!({"zen":"x"}))
        .send()
        .await
        .unwrap();
    assert!(
        hook.status().is_client_error() || hook.status().is_server_error(),
        "{}",
        hook.status()
    );
    drop(stop);
    let _ = task.await;
    let _ = std::fs::remove_dir_all(dir);
}

#[tokio::test]
async fn preview_is_authenticated_and_fails_closed_without_a_backend() {
    let (base, stop, task, dir) = start().await;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .unwrap();
    let url = format!("{base}/api/preview/session/missing");
    assert_eq!(client.get(&url).send().await.unwrap().status(), 401);
    let token = token(&client, &base).await;
    let missing = client.get(&url).bearer_auth(&token).send().await.unwrap();
    assert!(matches!(missing.status().as_u16(), 404 | 503));
    stop.send(()).unwrap();
    tokio::time::timeout(Duration::from_secs(10), task)
        .await
        .unwrap()
        .unwrap();
    let _ = std::fs::remove_dir_all(dir);
}

#[tokio::test]
async fn screen_share_is_authenticated_and_capture_fails_closed() {
    let (base, stop, task, dir) = start().await;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .unwrap();
    let url = format!("{base}/api/screen-share/state");
    assert_eq!(client.get(&url).send().await.unwrap().status(), 401);
    let token = token(&client, &base).await;
    let state = client.get(&url).bearer_auth(&token).send().await.unwrap();
    assert_eq!(state.status(), 200);
    let capture = client
        .post(format!("{base}/api/screen-share/capture"))
        .bearer_auth(&token)
        .json(&serde_json::json!({}))
        .send()
        .await
        .unwrap();
    assert!(capture.status().is_client_error() || capture.status().is_server_error());
    stop.send(()).unwrap();
    tokio::time::timeout(Duration::from_secs(10), task)
        .await
        .unwrap()
        .unwrap();
    let _ = std::fs::remove_dir_all(dir);
}

#[tokio::test]
async fn network_is_authenticated_and_scans_need_a_scope() {
    let (base, stop, task, dir) = start().await;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .unwrap();
    let url = format!("{base}/api/network/interfaces");
    assert_eq!(client.get(&url).send().await.unwrap().status(), 401);
    let token = token(&client, &base).await;
    let ok = client.get(&url).bearer_auth(&token).send().await.unwrap();
    assert_eq!(ok.status(), 200);
    let nodes = client
        .get(format!("{base}/api/network/nodes"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap();
    assert_eq!(nodes.status(), 200);
    let scan = client
        .post(format!("{base}/api/network/scan"))
        .bearer_auth(&token)
        .json(&serde_json::json!({}))
        .send()
        .await
        .unwrap();
    assert!(
        scan.status().is_client_error(),
        "scan without scope: {}",
        scan.status()
    );
    stop.send(()).unwrap();
    tokio::time::timeout(Duration::from_secs(10), task)
        .await
        .unwrap()
        .unwrap();
    let _ = std::fs::remove_dir_all(dir);
}

#[tokio::test]
async fn projects_are_created_archived_restored_and_purged_for_their_owner() {
    let (base, stop, task, dir) = start().await;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .unwrap();
    let anon = client
        .get(format!("{base}/api/projects"))
        .send()
        .await
        .unwrap();
    assert_eq!(anon.status(), 401);
    let token = token(&client, &base).await;
    let created = client
        .post(format!("{base}/api/projects"))
        .bearer_auth(&token)
        .json(&serde_json::json!({"title": "Parity"}))
        .send()
        .await
        .unwrap();
    assert_eq!(created.status(), 201);
    let project: serde_json::Value = created.json().await.unwrap();
    let id = project["id"].as_str().expect("project id").to_owned();

    let fetched = client
        .get(format!("{base}/api/projects/{id}"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap();
    assert_eq!(fetched.status(), 200);

    let archived = client
        .delete(format!("{base}/api/projects/{id}"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap();
    assert_eq!(archived.status(), 200);
    let body: serde_json::Value = archived.json().await.unwrap();
    assert_eq!(body["archived"], serde_json::json!([id]), "{body}");

    let list: serde_json::Value = client
        .get(format!("{base}/api/projects/archived"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert!(list.to_string().contains(&id), "{list}");

    let restored = client
        .post(format!("{base}/api/projects/{id}/restore"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap();
    assert_eq!(restored.status(), 200);

    client
        .delete(format!("{base}/api/projects/{id}"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap();
    let purged = client
        .delete(format!("{base}/api/projects/archived"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap();
    assert_eq!(purged.status(), 200);
    let body: serde_json::Value = purged.json().await.unwrap();
    assert_eq!(body["removed"], 1, "{body}");
    let after: serde_json::Value = client
        .get(format!("{base}/api/projects/archived"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert!(!after.to_string().contains(&id), "{after}");

    drop(stop);
    let _ = task.await;
    let _ = std::fs::remove_dir_all(dir);
}

#[tokio::test]
async fn node_credentials_are_issued_and_revoked_for_owned_nodes_only() {
    let (base, stop, task, dir) = start().await;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .unwrap();
    let id = "node-a";
    let url = format!("{base}/api/nodes/{id}/credential");
    assert_eq!(client.post(&url).send().await.unwrap().status(), 401);
    assert_eq!(client.delete(&url).send().await.unwrap().status(), 401);
    let token = token(&client, &base).await;
    // Unknown node: 404 for both verbs.
    assert_eq!(
        client
            .post(&url)
            .bearer_auth(&token)
            .send()
            .await
            .unwrap()
            .status(),
        404
    );
    assert_eq!(
        client
            .delete(&url)
            .bearer_auth(&token)
            .send()
            .await
            .unwrap()
            .status(),
        404
    );
    {
        let db = rusqlite::Connection::open(dir.join("gateway.sqlite")).unwrap();
        let now = "2026-01-01T00:00:00.000Z";
        db.execute(
            "INSERT INTO nodes(node_id,user_id,name,first_seen_at,last_seen_at,created_at,updated_at) \
             VALUES('node-a',(SELECT id FROM users LIMIT 1),'a',?1,?1,?1,?1), \
             ('node-b','someone-else','b',?1,?1,?1,?1)",
            [now],
        )
        .unwrap();
    }
    let issued: serde_json::Value = client
        .post(&url)
        .bearer_auth(&token)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert!(
        issued["credential"]
            .as_str()
            .is_some_and(|c| c.starts_with("jait-node-")),
        "{issued}"
    );
    // Another user's node is indistinguishable from a missing one.
    let other = format!("{base}/api/nodes/node-b/credential");
    assert_eq!(
        client
            .post(&other)
            .bearer_auth(&token)
            .send()
            .await
            .unwrap()
            .status(),
        404
    );
    assert_eq!(
        client
            .delete(&other)
            .bearer_auth(&token)
            .send()
            .await
            .unwrap()
            .status(),
        404
    );
    let revoked: serde_json::Value = client
        .delete(&url)
        .bearer_auth(&token)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(revoked["ok"], true);
    {
        let db = rusqlite::Connection::open(dir.join("gateway.sqlite")).unwrap();
        let left: i64 = db
            .query_row(
                "SELECT COUNT(*) FROM node_credentials WHERE node_id='node-a'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(left, 0);
    }
    drop(stop);
    let _ = task.await;
    let _ = std::fs::remove_dir_all(dir);
}

#[tokio::test]
async fn project_hierarchy_sessions_and_state_are_owner_scoped() {
    let (base, stop, task, dir) = start().await;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .unwrap();
    let token = token(&client, &base).await;
    let make = |title: &'static str| {
        let client = client.clone();
        let base = base.clone();
        let token = token.clone();
        async move {
            let created: serde_json::Value = client
                .post(format!("{base}/api/projects"))
                .bearer_auth(&token)
                .json(&serde_json::json!({ "title": title }))
                .send()
                .await
                .unwrap()
                .json()
                .await
                .unwrap();
            created["id"].as_str().expect("project id").to_owned()
        }
    };
    let parent = make("Parent").await;
    let child = make("Child").await;

    for suffix in ["move", "restore", "sessions", "state", "subtree"] {
        let anon = client
            .post(format!("{base}/api/projects/{parent}/{suffix}"))
            .send()
            .await
            .unwrap();
        assert_eq!(anon.status(), 401, "{suffix} without a token");
    }
    let missing = client
        .post(format!("{base}/api/projects/nope/move"))
        .bearer_auth(&token)
        .json(&serde_json::json!({ "parentId": parent }))
        .send()
        .await
        .unwrap();
    assert_eq!(missing.status(), 404);

    let moved = client
        .post(format!("{base}/api/projects/{child}/move"))
        .bearer_auth(&token)
        .json(&serde_json::json!({ "parentId": parent }))
        .send()
        .await
        .unwrap();
    assert_eq!(moved.status(), 200);
    let moved: serde_json::Value = moved.json().await.unwrap();
    assert_eq!(moved["parentId"], serde_json::json!(parent), "{moved}");

    let cycle = client
        .post(format!("{base}/api/projects/{parent}/move"))
        .bearer_auth(&token)
        .json(&serde_json::json!({ "parentId": child }))
        .send()
        .await
        .unwrap();
    assert_eq!(cycle.status(), 400);
    let cycle: serde_json::Value = cycle.json().await.unwrap();
    assert_eq!(cycle["error"], "CYCLE", "{cycle}");

    let subtree: serde_json::Value = client
        .get(format!("{base}/api/projects/{parent}/subtree"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(
        subtree["descendantIds"],
        serde_json::json!([child]),
        "{subtree}"
    );
    assert_eq!(subtree["descendantCount"], 1);

    let not_archived = client
        .post(format!("{base}/api/projects/{parent}/restore"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap();
    assert_eq!(not_archived.status(), 400);

    let created = client
        .post(format!("{base}/api/projects/{parent}/sessions"))
        .bearer_auth(&token)
        .json(&serde_json::json!({ "name": "Planning" }))
        .send()
        .await
        .unwrap();
    assert_eq!(created.status(), 201);
    let session: serde_json::Value = created.json().await.unwrap();
    let listed: serde_json::Value = client
        .get(format!("{base}/api/projects/{parent}/sessions"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert!(
        listed.to_string().contains(session["id"].as_str().unwrap()),
        "{listed}"
    );

    let patched = client
        .patch(format!("{base}/api/projects/{parent}/state"))
        .bearer_auth(&token)
        .json(&serde_json::json!({ "layout": "split" }))
        .send()
        .await
        .unwrap();
    assert_eq!(patched.status(), 200);
    let state: serde_json::Value = client
        .get(format!("{base}/api/projects/{parent}/state"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(state["layout"], "split", "{state}");
    let bad = client
        .patch(format!("{base}/api/projects/{parent}/state"))
        .bearer_auth(&token)
        .json(&serde_json::json!([1, 2]))
        .send()
        .await
        .unwrap();
    assert_eq!(bad.status(), 400);

    drop(stop);
    let _ = task.await;
    let _ = std::fs::remove_dir_all(dir);
}

#[tokio::test]
async fn mobile_routes_register_devices_and_guard_consents_by_owner() {
    let (base, stop, task, dir) = start().await;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .unwrap();
    let discovery = client
        .get(format!("{base}/api/mobile/discovery"))
        .send()
        .await
        .unwrap();
    assert_eq!(discovery.status(), 200);
    let registered = client
        .post(format!("{base}/api/mobile/devices/register"))
        .json(&serde_json::json!({"id":"phone-1","name":"Phone","platform":"mobile"}))
        .send()
        .await
        .unwrap();
    assert_eq!(registered.status(), 200);
    let anon_beat = client
        .post(format!("{base}/api/mobile/devices/phone-1/heartbeat"))
        .send()
        .await
        .unwrap();
    assert_eq!(anon_beat.status(), 401);
    let anon_list = client
        .get(format!("{base}/api/mobile/devices"))
        .send()
        .await
        .unwrap();
    assert_eq!(anon_list.status(), 401);
    let token = token(&client, &base).await;
    let beat = client
        .post(format!("{base}/api/mobile/devices/phone-1/heartbeat"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap();
    assert_eq!(beat.status(), 200);
    let missing = client
        .post(format!("{base}/api/mobile/devices/ghost/heartbeat"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap();
    assert_eq!(missing.status(), 404);
    let listed: serde_json::Value = client
        .get(format!("{base}/api/mobile/devices"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(listed["devices"][0]["id"], "phone-1", "{listed}");

    let anon = client
        .get(format!("{base}/api/mobile/consent/pending"))
        .send()
        .await
        .unwrap();
    assert_eq!(anon.status(), 401);
    let pending: serde_json::Value = client
        .get(format!("{base}/api/mobile/consent/pending"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(pending["requests"], serde_json::json!([]), "{pending}");
    for verb in ["approve", "reject"] {
        let unknown = client
            .post(format!("{base}/api/mobile/consent/nope/{verb}"))
            .bearer_auth(&token)
            .send()
            .await
            .unwrap();
        assert_eq!(unknown.status(), 404, "{verb}");
    }

    drop(stop);
    let _ = task.await;
    let _ = std::fs::remove_dir_all(dir);
}

#[tokio::test]
async fn security_assessments_require_auth_and_reject_unscoped_runs() {
    let (base, stop, task, dir) = start().await;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .unwrap();
    let list = format!("{base}/api/security/assessments");
    assert_eq!(client.get(&list).send().await.unwrap().status(), 401);
    let token = token(&client, &base).await;
    let ok = client.get(&list).bearer_auth(&token).send().await.unwrap();
    assert_eq!(ok.status(), 200, "{:?}", ok.text().await);
    let no_scope = client
        .post(&list)
        .bearer_auth(&token)
        .json(&serde_json::json!({}))
        .send()
        .await
        .unwrap();
    assert_eq!(no_scope.status(), 400);
    let filesystem = client
        .post(format!("{base}/api/security/scopes"))
        .bearer_auth(&token)
        .json(&serde_json::json!({"paths":["/etc"]}))
        .send()
        .await
        .unwrap();
    assert_eq!(
        filesystem.status(),
        400,
        "path scope needs an owned project session"
    );
    let unknown = client
        .get(format!("{base}/api/security/assessments/nope"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap();
    assert_eq!(unknown.status(), 404);
    stop.send(()).unwrap();
    tokio::time::timeout(Duration::from_secs(10), task)
        .await
        .unwrap()
        .unwrap();
    let _ = std::fs::remove_dir_all(dir);
}

#[tokio::test]
async fn security_workbench_is_authenticated_and_refuses_unavailable_engines() {
    let (base, stop, task, dir) = start().await;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .unwrap();
    let url = format!("{base}/api/security/workbench");
    assert_eq!(client.get(&url).send().await.unwrap().status(), 401);
    let token = token(&client, &base).await;
    let history = client.get(&url).bearer_auth(&token).send().await.unwrap();
    assert_eq!(history.status(), 200);
    let engines: serde_json::Value = client
        .get(format!("{base}/api/security/engines"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert!(
        engines.to_string().len() < 200,
        "no engines expected: {engines}"
    );
    let unknown = client
        .get(format!("{base}/api/security/checks/nope"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap();
    assert!(unknown.status().is_client_error(), "{}", unknown.status());
    let run = client
        .post(format!("{base}/api/security/checks"))
        .bearer_auth(&token)
        .json(&serde_json::json!({"kind":"http","target":"http://127.0.0.1:1"}))
        .send()
        .await
        .unwrap();
    assert!(
        !run.status().is_success(),
        "check must not run: {}",
        run.status()
    );
    stop.send(()).unwrap();
    tokio::time::timeout(Duration::from_secs(10), task)
        .await
        .unwrap()
        .unwrap();
    let _ = std::fs::remove_dir_all(dir);
}

#[tokio::test]
async fn mcp_requires_login_lists_project_tools_and_needs_an_owned_session() {
    let (base, stop, task, dir) = start().await;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .unwrap();
    let list = serde_json::json!({"jsonrpc":"2.0","id":1,"method":"tools/list"});
    let anon = client
        .post(format!("{base}/mcp"))
        .json(&list)
        .send()
        .await
        .unwrap();
    assert_eq!(anon.status(), 401);
    let token = token(&client, &base).await;
    let ok = client
        .post(format!("{base}/mcp"))
        .bearer_auth(&token)
        .header("accept", "application/json, text/event-stream")
        .json(&list)
        .send()
        .await
        .unwrap();
    assert_eq!(ok.status(), 200);
    let text = ok.text().await.unwrap();
    for name in [
        "file_read",
        "file_write",
        "file_list",
        "file_patch",
        "terminal_run",
    ] {
        assert!(text.contains(&format!("\"{name}\"")), "{name}: {text}");
    }
    let call = serde_json::json!({"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"terminal_run","arguments":{"command":"echo hi"}}});
    let denied = client
        .post(format!("{base}/mcp"))
        .bearer_auth(&token)
        .header("accept", "application/json, text/event-stream")
        .json(&call)
        .send()
        .await
        .unwrap()
        .text()
        .await
        .unwrap();
    assert!(denied.contains("requires a sessionId"), "{denied}");
    assert!(!denied.contains("hi\\n"), "{denied}");
    let foreign = client
        .post(format!("{base}/mcp"))
        .bearer_auth(&token)
        .header("x-jait-session-id", "not-my-session")
        .header("accept", "application/json, text/event-stream")
        .json(&call)
        .send()
        .await
        .unwrap();
    assert_eq!(foreign.status(), 404);
    stop.send(()).unwrap();
    tokio::time::timeout(Duration::from_secs(10), task)
        .await
        .unwrap()
        .unwrap();
    let _ = std::fs::remove_dir_all(dir);
}

#[tokio::test]
async fn mcp_file_write_waits_for_consent_on_an_owned_session() {
    let (base, stop, task, dir) = start_seeded(false, |d| {
        std::fs::write(d.join("notes.txt"), "original").unwrap();
    })
    .await;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .unwrap();
    let token = token(&client, &base).await;
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
    for (action, expected) in [("reject", "original"), ("approve", "via-mcp")] {
        let call = {
            let (client, base, token) = (client.clone(), base.clone(), token.clone());
            let session_id = session["id"].as_str().unwrap().to_string();
            let body = serde_json::json!({"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"file_write","arguments":{"path":"notes.txt","content":"via-mcp"}}});
            tokio::spawn(async move {
                client
                    .post(format!("{base}/mcp"))
                    .bearer_auth(&token)
                    .header("x-jait-session-id", session_id)
                    .header("accept", "application/json, text/event-stream")
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
        let pending = pending.expect("mcp write must wait for consent");
        assert_eq!(pending["toolName"], "file.write");
        assert_eq!(
            std::fs::read_to_string(dir.join("notes.txt")).unwrap(),
            "original",
            "file must not change before a decision"
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
        tokio::time::timeout(Duration::from_secs(20), call)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(
            std::fs::read_to_string(dir.join("notes.txt")).unwrap(),
            expected,
            "after {action}"
        );
    }
    stop.send(()).unwrap();
    tokio::time::timeout(Duration::from_secs(10), task)
        .await
        .unwrap()
        .unwrap();
    let _ = std::fs::remove_dir_all(dir);
}

#[tokio::test]
async fn browser_devtools_refuse_without_a_browser_host() {
    let (base, stop, task, dir) = start().await;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .unwrap();
    let url = format!("{base}/api/preview/devtools");
    let body = serde_json::json!({"sessionId":"s1"});
    assert_eq!(
        client.post(&url).json(&body).send().await.unwrap().status(),
        401
    );
    let token = token(&client, &base).await;
    let created = client
        .post(&url)
        .bearer_auth(&token)
        .json(&body)
        .send()
        .await
        .unwrap();
    assert_eq!(created.status(), 404);
    let forged = client
        .get(format!(
            "{base}/preview/bogus/devtools/grant/devtools_app.html"
        ))
        .send()
        .await
        .unwrap();
    assert!(forged.status().is_client_error(), "{}", forged.status());
    stop.send(()).unwrap();
    tokio::time::timeout(Duration::from_secs(10), task)
        .await
        .unwrap()
        .unwrap();
    let _ = std::fs::remove_dir_all(dir);
}

#[tokio::test]
async fn project_files_are_served_for_the_owner_and_stay_inside_the_root() {
    let (base, stop, task, dir) = start().await;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .unwrap();
    let root = dir.join("proj-files");
    std::fs::create_dir_all(root.join("src")).unwrap();
    std::fs::write(root.join("src/a.txt"), "alpha-marker").unwrap();
    let outside = dir.join("outside-secret");
    std::fs::create_dir_all(&outside).unwrap();
    std::fs::write(outside.join("secret.txt"), "top-secret").unwrap();
    std::os::unix::fs::symlink(&outside, root.join("link")).unwrap();

    let anon = client
        .get(format!("{base}/api/project/list"))
        .send()
        .await
        .unwrap();
    assert_eq!(anon.status(), 401, "project files need login");

    let token = token(&client, &base).await;
    let created: serde_json::Value = client
        .post(format!("{base}/api/projects"))
        .bearer_auth(&token)
        .json(&serde_json::json!({"title": "Files", "rootPath": root.to_string_lossy()}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let id = created["id"].as_str().expect("project id").to_owned();
    let q = |route: &str, path: &str| {
        client
            .get(format!(
                "{base}/api/project/{route}?{}",
                url::form_urlencoded::Serializer::new(String::new())
                    .append_pair("projectId", &id)
                    .append_pair("path", path)
                    .finish()
            ))
            .bearer_auth(&token)
    };

    let list: serde_json::Value = q("list", "src").send().await.unwrap().json().await.unwrap();
    assert_eq!(list["entries"][0]["name"], "a.txt");
    let read: serde_json::Value = q("read", "src/a.txt")
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(read["content"], "alpha-marker");
    let stat: serde_json::Value = q("stat", "src/a.txt")
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(stat["isFile"], true);

    // lexical escape and a symlink inside the project that leads outside are both refused
    for path in ["../outside-secret/secret.txt", "link/secret.txt", "link"] {
        let r = q("read", path).send().await.unwrap();
        assert_eq!(r.status(), 400, "{path} must be refused");
    }
    let through_link = client
        .post(format!("{base}/api/project/write"))
        .bearer_auth(&token)
        .json(&serde_json::json!({"projectId": id, "path": "link/new.txt", "content": "x"}))
        .send()
        .await
        .unwrap();
    assert_eq!(through_link.status(), 400);
    assert!(
        !outside.join("new.txt").exists(),
        "write must not leave the project"
    );

    let wrote = client
        .post(format!("{base}/api/project/write"))
        .bearer_auth(&token)
        .json(&serde_json::json!({"projectId": id, "path": "src/b.txt", "content": "beta"}))
        .send()
        .await
        .unwrap();
    assert_eq!(wrote.status(), 200);
    assert_eq!(
        std::fs::read_to_string(root.join("src/b.txt")).unwrap(),
        "beta"
    );

    // create / rename / move / delete stay inside the root and never touch the root itself
    let post = |route: &str, body: serde_json::Value| {
        let mut body = body;
        body["projectId"] = serde_json::json!(id);
        client
            .post(format!("{base}{route}"))
            .bearer_auth(&token)
            .json(&body)
    };
    let status = |r: reqwest::Response| r.status().as_u16();
    assert_eq!(
        status(
            post(
                "/api/project/create-directory",
                serde_json::json!({"path": "made/deep"})
            )
            .send()
            .await
            .unwrap()
        ),
        200
    );
    assert!(root.join("made/deep").is_dir());
    assert_eq!(
        status(
            post(
                "/api/project/create-file",
                serde_json::json!({"path": "made/f.txt", "content": "hi"})
            )
            .send()
            .await
            .unwrap()
        ),
        200
    );
    assert_eq!(
        std::fs::read_to_string(root.join("made/f.txt")).unwrap(),
        "hi"
    );
    assert_eq!(
        status(
            post(
                "/api/project/create-file",
                serde_json::json!({"path": "made/f.txt"})
            )
            .send()
            .await
            .unwrap()
        ),
        400,
        "no overwrite"
    );
    assert_eq!(
        status(
            post(
                "/api/project/create-file",
                serde_json::json!({"path": "link/c.txt"})
            )
            .send()
            .await
            .unwrap()
        ),
        400
    );
    assert!(!outside.join("c.txt").exists());
    assert_eq!(
        status(
            post(
                "/api/project/rename",
                serde_json::json!({"path": "made/f.txt", "name": "g.txt"})
            )
            .send()
            .await
            .unwrap()
        ),
        200
    );
    assert!(root.join("made/g.txt").is_file());
    for name in ["../escaped.txt", "x/y.txt", "..", ""] {
        let r = post(
            "/api/project/rename",
            serde_json::json!({"path": "made/g.txt", "name": name}),
        )
        .send()
        .await
        .unwrap();
        assert_eq!(status(r), 400, "rename to {name:?} must be refused");
    }
    assert!(root.join("made/g.txt").is_file());
    assert!(!dir.join("proj-files/../escaped.txt").exists());
    assert_eq!(
        status(
            post(
                "/api/project/move",
                serde_json::json!({"path": "made/g.txt", "directory": "src"})
            )
            .send()
            .await
            .unwrap()
        ),
        200
    );
    assert!(root.join("src/g.txt").is_file());
    assert_eq!(
        status(
            post(
                "/api/project/move",
                serde_json::json!({"path": "src/g.txt", "directory": "link"})
            )
            .send()
            .await
            .unwrap()
        ),
        400
    );
    assert!(root.join("src/g.txt").is_file());
    for path in ["", ".", "link/secret.txt"] {
        let r = post("/api/project/delete", serde_json::json!({"path": path}))
            .send()
            .await
            .unwrap();
        assert_eq!(status(r), 400, "delete of {path:?} must be refused");
    }
    assert!(root.join("src/a.txt").is_file() && outside.join("secret.txt").is_file());
    assert_eq!(
        status(
            post("/api/project/delete", serde_json::json!({"path": "made"}))
                .send()
                .await
                .unwrap()
        ),
        200
    );
    assert!(!root.join("made").exists());
    let found: serde_json::Value = client
        .get(format!(
            "{base}/api/project/search?projectId={id}&query=alpha-marker"
        ))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert!(found.to_string().contains("alpha-marker"), "{found}");

    let download = |query: String, bearer: String| {
        let client = client.clone();
        let base = base.clone();
        let id = id.clone();
        async move {
            client
                .get(format!(
                    "{base}/api/project/download?projectId={id}&{query}"
                ))
                .bearer_auth(bearer)
                .send()
                .await
                .unwrap()
        }
    };
    let ok = download("path=src/a.txt".into(), token.clone()).await;
    assert_eq!(ok.status(), 200);
    assert_eq!(ok.headers()["content-type"], "application/octet-stream");
    assert_eq!(ok.headers()["x-content-type-options"], "nosniff");
    assert!(
        ok.headers()["content-disposition"]
            .to_str()
            .unwrap()
            .contains("filename*=UTF-8''a.txt")
    );
    assert!(ok.text().await.unwrap().contains("alpha-marker"));
    assert_eq!(download("".into(), token.clone()).await.status(), 400);
    assert_eq!(
        download("path=src".into(), token.clone()).await.status(),
        400
    );
    for escape in ["../outside.txt", "link/secret.txt"] {
        assert_eq!(
            download(format!("path={escape}"), token.clone())
                .await
                .status(),
            403,
            "{escape}"
        );
    }
    let no_auth = client
        .get(format!(
            "{base}/api/project/download?projectId={id}&path=src/a.txt"
        ))
        .send()
        .await
        .unwrap();
    assert_eq!(no_auth.status(), 401);

    // another user cannot reach this project's files
    let invite: serde_json::Value = client
        .post(format!("{base}/api/auth/invitations"))
        .bearer_auth(&token)
        .json(&serde_json::json!({}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let other: serde_json::Value = client
        .post(format!("{base}/api/auth/register"))
        .json(&serde_json::json!({"username":"intruder","password":"correct-horse-2","invitation":invite["invitation"]}))
        .timeout(Duration::from_secs(60))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let other_token = other["access_token"]
        .as_str()
        .unwrap_or_else(|| panic!("no second token: {other}"))
        .to_owned();
    let stolen = client
        .get(format!(
            "{base}/api/project/read?projectId={id}&path=src/a.txt"
        ))
        .bearer_auth(&other_token)
        .send()
        .await
        .unwrap();
    assert!(
        stolen.status() == 404 || stolen.status() == 403,
        "got {}",
        stolen.status()
    );

    let _ = stop.send(());
    let _ = task.await;
}

#[tokio::test]
async fn git_routes_run_local_operations_only_inside_the_callers_projects() {
    let (base, stop, task, dir) = start().await;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .unwrap();
    let token = token(&client, &base).await;
    let root = dir.join("git-proj");
    std::fs::create_dir_all(&root).unwrap();
    let root = root.canonicalize().unwrap();
    let created: serde_json::Value = client
        .post(format!("{base}/api/projects"))
        .bearer_auth(&token)
        .json(&serde_json::json!({"title": "G", "rootPath": root.to_string_lossy()}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert!(created["id"].is_string(), "{created}");
    let call = |path: &'static str, body: serde_json::Value| {
        let client = client.clone();
        let token = token.clone();
        let url = format!("{base}{path}");
        async move {
            let r = client
                .post(url)
                .bearer_auth(token)
                .json(&body)
                .send()
                .await
                .unwrap();
            let status = r.status().as_u16();
            (
                status,
                r.json::<serde_json::Value>().await.unwrap_or_default(),
            )
        }
    };
    let cwd = serde_json::json!({"cwd": root});

    let (s, b) = call("/api/git/init", cwd.clone()).await;
    assert_eq!(s, 200, "{b}");
    let (s, b) = call(
        "/api/git/identity",
        serde_json::json!({"cwd": root, "name": "T", "email": "t@example.com"}),
    )
    .await;
    assert_eq!(s, 200, "{b}");
    let (s, b) = call("/api/git/identity", cwd.clone()).await;
    assert!(s == 200 && b["email"] == "t@example.com", "{b}");

    std::fs::write(root.join("a.txt"), "one\n").unwrap();
    let (s, b) = call(
        "/api/git/stage",
        serde_json::json!({"cwd": root, "paths": ["a.txt"]}),
    )
    .await;
    assert_eq!(s, 200, "{b}");
    let (s, b) = call("/api/git/status", cwd.clone()).await;
    assert!(s == 200 && b.to_string().contains("a.txt"), "{b}");
    let (s, b) = call("/api/git/diff-stats", cwd.clone()).await;
    assert_eq!(s, 200, "{b}");
    let (s, b) = call(
        "/api/git/unstage",
        serde_json::json!({"cwd": root, "paths": ["a.txt"]}),
    )
    .await;
    assert_eq!(s, 200, "{b}");
    let (s, b) = call(
        "/api/git/file-diffs",
        serde_json::json!({"cwd": root, "paths": ["a.txt"]}),
    )
    .await;
    assert_eq!(s, 200, "{b}");
    let (s, b) = call(
        "/api/git/discard",
        serde_json::json!({"cwd": root, "paths": ["a.txt"]}),
    )
    .await;
    assert!(s == 200 || s == 500, "{s} {b}");

    // stacked action: local commit works, no-op reports no changes, push is refused
    std::fs::write(root.join("b.txt"), "two\n").unwrap();
    let (s, b) = call(
        "/api/git/run-stacked-action",
        serde_json::json!({"cwd": root, "action": "commit", "commitMessage": "feat: add b"}),
    )
    .await;
    assert!(
        s == 200
            && b["commit"]["status"] == "created"
            && b["commit"]["subject"] == "feat: add b"
            && b["push"]["status"] == "skipped_not_requested",
        "{s} {b}"
    );
    let log = std::process::Command::new("git")
        .args(["log", "-1", "--format=%s"])
        .current_dir(&root)
        .output()
        .unwrap();
    assert_eq!(String::from_utf8_lossy(&log.stdout).trim(), "feat: add b");
    let (s, b) = call(
        "/api/git/run-stacked-action",
        serde_json::json!({"cwd": root, "action": "commit"}),
    )
    .await;
    assert!(
        s == 200 && b["commit"]["status"] == "skipped_no_changes",
        "{s} {b}"
    );
    let (s, _) = call(
        "/api/git/run-stacked-action",
        serde_json::json!({"cwd": root, "action": "nope"}),
    )
    .await;
    assert_eq!(s, 400);
    let (s, _) = call(
        "/api/git/run-stacked-action",
        serde_json::json!({"cwd": root, "action": "commit_push_pr"}),
    )
    .await;
    assert_eq!(s, 501);

    // network, worktree and a repository that is not the caller's project are all refused
    assert!(
        std::process::Command::new("git")
            .args(["remote", "add", "origin", "https://example.invalid/x.git"])
            .current_dir(&root)
            .status()
            .unwrap()
            .success()
    );
    for path in ["/api/git/fetch", "/api/git/remove-worktree"] {
        let (s, b) = call(
            path,
            serde_json::json!({"cwd": root, "path": root.join("wt")}),
        )
        .await;
        assert!(s >= 400, "{path} must not act: {s} {b}");
    }
    let (s, b) = call("/api/git/sync", cwd.clone()).await;
    assert!(
        s == 200 && b["pull"]["status"] == "skipped_no_upstream",
        "{b}"
    );
    std::fs::write(root.join("c.txt"), "three\n").unwrap();
    let (s, b) = call(
        "/api/git/run-stacked-action",
        serde_json::json!({"cwd": root, "action": "commit_push", "commitMessage": "feat: add c"}),
    )
    .await;
    assert!(
        s >= 400,
        "push must be refused by the git authority: {s} {b}"
    );
    let (s, _) = call("/api/git/status", serde_json::json!({"cwd": dir})).await;
    assert_eq!(s, 403, "a directory that is not a project root");
    let (s, _) = call(
        "/api/git/status",
        serde_json::json!({"cwd": root.join("sub")}),
    )
    .await;
    assert!(s == 403 || s == 400);

    let _ = stop.send(());
    let _ = task.await;
}

#[tokio::test]
async fn team_rooms_are_stored_per_user_and_authenticated() {
    let (base, stop, task, dir) = start().await;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .unwrap();
    for (method, path) in [("GET", "/api/team-rooms"), ("POST", "/api/team-rooms")] {
        let anon = client
            .request(method.parse().unwrap(), format!("{base}{path}"))
            .send()
            .await
            .unwrap();
        assert_eq!(anon.status(), 401, "{path} must require auth");
    }
    let token = token(&client, &base).await;
    let empty: serde_json::Value = client
        .get(format!("{base}/api/team-rooms"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert!(empty["rooms"].as_array().unwrap().is_empty());
    let invalid = client
        .post(format!("{base}/api/team-rooms"))
        .bearer_auth(&token)
        .json(&serde_json::json!({"name": ""}))
        .send()
        .await
        .unwrap();
    assert_eq!(invalid.status(), 400);
    let missing = client
        .get(format!("{base}/api/team-rooms/no-such-room"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap();
    assert_eq!(missing.status(), 404);
    let bad_message = client
        .post(format!("{base}/api/team-rooms/no-such-room/messages"))
        .bearer_auth(&token)
        .json(&serde_json::json!({"content": "hi", "clientKey": "k1"}))
        .send()
        .await
        .unwrap();
    assert_eq!(bad_message.status(), 400);
    // a persona agent the caller owns can anchor a room
    let agent: serde_json::Value = client
        .put(format!("{base}/api/persona-agents/lead"))
        .bearer_auth(&token)
        .json(&serde_json::json!({"name": "Lead", "providerId": "p"}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let agent_id = agent["id"].as_str().unwrap_or("lead").to_owned();
    let created = client
        .post(format!("{base}/api/team-rooms"))
        .bearer_auth(&token)
        .json(&serde_json::json!({"agentId": agent_id}))
        .send()
        .await
        .unwrap();
    let status = created.status();
    let body: serde_json::Value = created.json().await.unwrap();
    assert_eq!(status, 200, "{body}");
    let room = body["room"]["id"].as_str().unwrap().to_owned();
    let listed: serde_json::Value = client
        .get(format!("{base}/api/team-rooms"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(listed["rooms"].as_array().unwrap().len(), 1);
    let detail: serde_json::Value = client
        .get(format!("{base}/api/team-rooms/{room}"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(detail["room"]["id"], room.as_str());
    let posted = client
        .post(format!("{base}/api/team-rooms/{room}/messages"))
        .bearer_auth(&token)
        .json(&serde_json::json!({"content": "hello team", "clientKey": "k1"}))
        .send()
        .await
        .unwrap();
    assert_eq!(posted.status(), 201);
    let detail: serde_json::Value = client
        .get(format!("{base}/api/team-rooms/{room}"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert!(
        detail["messages"]
            .as_array()
            .unwrap()
            .iter()
            .any(|m| m["content"] == "hello team")
    );
    stop.send(()).unwrap();
    tokio::time::timeout(Duration::from_secs(10), task)
        .await
        .unwrap()
        .unwrap();
    let _ = std::fs::remove_dir_all(dir);
}

#[tokio::test]
async fn voice_assistant_status_and_streaming_sessions_are_served() {
    let (base, stop, task, dir) = start().await;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .unwrap();
    let status = client
        .get(format!("{base}/api/voice-assistant/status"))
        .send()
        .await
        .unwrap();
    assert_eq!(status.status(), 200);
    let status: serde_json::Value = status.json().await.unwrap();
    assert!(status["available"].is_boolean());
    assert!(status["model"].is_string() && status["voice"].is_string());
    let anon = client
        .get(format!("{base}/api/sessions/streaming"))
        .send()
        .await
        .unwrap();
    assert_eq!(anon.status(), 401);
    let token = token(&client, &base).await;
    let streaming: serde_json::Value = client
        .get(format!("{base}/api/sessions/streaming"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(streaming["sessionIds"], serde_json::json!([]));
    let _ = stop.send(());
    let _ = task.await;
    drop(dir);
}

#[tokio::test]
async fn session_runtime_reports_idle_for_owned_sessions_only() {
    let (base, stop, task, dir) = start().await;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .unwrap();
    let token = token(&client, &base).await;
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
    let id = session["id"].as_str().unwrap();
    let anon = client
        .get(format!("{base}/api/sessions/{id}/runtime"))
        .send()
        .await
        .unwrap();
    assert_eq!(anon.status(), 401);
    let runtime: serde_json::Value = client
        .get(format!("{base}/api/sessions/{id}/runtime"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(runtime["running"], false);
    assert!(runtime["startedAt"].is_null());
    let missing = client
        .get(format!("{base}/api/sessions/nosuchsession/runtime"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap();
    assert_eq!(missing.status(), 404);
    let _ = stop.send(());
    let _ = task.await;
    drop(dir);
}

#[tokio::test]
async fn project_undo_backup_and_apply_diff_restore_pre_write_state() {
    let (base, stop, task, dir) = start().await;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .unwrap();
    let root = dir.join("proj-undo");
    std::fs::create_dir_all(&root).unwrap();
    std::fs::write(root.join("a.txt"), "orig").unwrap();
    let token = token(&client, &base).await;
    let created: serde_json::Value = client
        .post(format!("{base}/api/projects"))
        .bearer_auth(&token)
        .json(&serde_json::json!({"title": "Undo", "rootPath": root.to_string_lossy()}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let id = created["id"].as_str().expect("project id").to_owned();
    let post = |route: &str, mut body: serde_json::Value| {
        body["projectId"] = serde_json::json!(id);
        client
            .post(format!("{base}/api/project/{route}"))
            .bearer_auth(&token)
            .json(&body)
    };

    let none = post("undo", serde_json::json!({"path": "a.txt"}))
        .send()
        .await
        .unwrap();
    assert_eq!(none.status(), 404, "no backup before any write");

    for content in ["first", "second"] {
        post(
            "write",
            serde_json::json!({"path": "a.txt", "content": content}),
        )
        .send()
        .await
        .unwrap();
    }
    post(
        "write",
        serde_json::json!({"path": "new.txt", "content": "n"}),
    )
    .send()
    .await
    .unwrap();
    let backup: serde_json::Value = client
        .get(format!(
            "{base}/api/project/backup?projectId={id}&path=a.txt"
        ))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(
        backup["originalContent"], "orig",
        "only the first version is kept"
    );
    assert_eq!(backup["currentContent"], "second");

    let undone: serde_json::Value = post(
        "undo-all",
        serde_json::json!({"paths": ["a.txt", "new.txt", "../escape.txt"]}),
    )
    .send()
    .await
    .unwrap()
    .json()
    .await
    .unwrap();
    assert_eq!(undone["results"][0]["restored"], true);
    assert_eq!(undone["results"][1]["restored"], true);
    assert_eq!(undone["results"][2]["restored"], false);
    assert_eq!(std::fs::read_to_string(root.join("a.txt")).unwrap(), "orig");
    assert!(
        !root.join("new.txt").exists(),
        "new file is removed on undo"
    );

    let escape = post(
        "apply-diff",
        serde_json::json!({"path": "../escape.txt", "content": "x"}),
    )
    .send()
    .await
    .unwrap();
    assert_eq!(escape.status(), 400);
    assert!(!dir.join("escape.txt").exists());

    let applied = post(
        "apply-diff",
        serde_json::json!({"path": "a.txt", "content": "merged"}),
    )
    .send()
    .await
    .unwrap();
    assert_eq!(applied.status(), 200);
    assert_eq!(
        std::fs::read_to_string(root.join("a.txt")).unwrap(),
        "merged"
    );
    let after = post("undo", serde_json::json!({"path": "a.txt"}))
        .send()
        .await
        .unwrap();
    assert_eq!(after.status(), 404, "apply-diff clears the backup");

    let _ = stop.send(());
    tokio::time::timeout(Duration::from_secs(10), task)
        .await
        .unwrap()
        .unwrap();
    let _ = std::fs::remove_dir_all(dir);
}

#[tokio::test]
async fn session_loop_is_null_for_owned_sessions_and_404_otherwise() {
    let (base, stop, task, dir) = start().await;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .unwrap();
    let token = token(&client, &base).await;
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
    let id = session["id"].as_str().unwrap();
    let anon = client
        .get(format!("{base}/api/sessions/{id}/loop"))
        .send()
        .await
        .unwrap();
    assert_eq!(anon.status(), 401);
    let body: serde_json::Value = client
        .get(format!("{base}/api/sessions/{id}/loop"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert!(body["loop"].is_null());
    let missing = client
        .get(format!("{base}/api/sessions/nosuchsession/loop"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap();
    assert_eq!(missing.status(), 404);
    let _ = stop.send(());
    let _ = task.await;
    drop(dir);
}

#[tokio::test]
async fn session_fork_creates_a_new_owned_branch() {
    let (base, stop, task, dir) = start().await;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .unwrap();
    let token = token(&client, &base).await;
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
    let id = session["id"].as_str().unwrap();
    let anon = client
        .post(format!("{base}/api/sessions/{id}/fork"))
        .send()
        .await
        .unwrap();
    assert_eq!(anon.status(), 401);
    let forked = client
        .post(format!("{base}/api/sessions/{id}/fork"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap();
    assert_eq!(forked.status(), 201);
    let branch: serde_json::Value = forked.json().await.unwrap();
    assert_ne!(branch["id"].as_str().unwrap(), id);
    let fetched = client
        .get(format!(
            "{base}/api/sessions/{}",
            branch["id"].as_str().unwrap()
        ))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap();
    assert_eq!(fetched.status(), 200);
    let missing = client
        .post(format!("{base}/api/sessions/nosuchsession/fork"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap();
    assert_eq!(missing.status(), 404);
    let _ = stop.send(());
    let _ = task.await;
    drop(dir);
}

#[tokio::test]
async fn thread_stop_and_interrupt_respect_ownership_and_session_state() {
    let (base, stop, task, dir) = start().await;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .unwrap();
    let token = token(&client, &base).await;
    let created: serde_json::Value = client
        .post(format!("{base}/api/threads"))
        .bearer_auth(&token)
        .json(&serde_json::json!({"providerId": "jait"}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let id = created["id"].as_str().unwrap();
    for action in ["stop", "interrupt"] {
        let anon = client
            .post(format!("{base}/api/threads/{id}/{action}"))
            .send()
            .await
            .unwrap();
        assert_eq!(anon.status(), 401);
        let missing = client
            .post(format!("{base}/api/threads/nope/{action}"))
            .bearer_auth(&token)
            .send()
            .await
            .unwrap();
        assert_eq!(missing.status(), 404);
    }
    // no provider session: interrupt is a conflict, stop records the interruption
    let interrupt = client
        .post(format!("{base}/api/threads/{id}/interrupt"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap();
    assert_eq!(interrupt.status(), 409);
    let stopped = client
        .post(format!("{base}/api/threads/{id}/stop"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap();
    assert_eq!(stopped.status(), 200);
    let fetched: serde_json::Value = client
        .get(format!("{base}/api/threads/{id}"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(fetched["status"], "interrupted");
    let _ = stop.send(());
    let _ = task.await;
    drop(dir);
}

#[tokio::test(flavor = "multi_thread")]
async fn thread_start_send_and_resume_run_real_turns_on_the_thread_session() {
    let (model_base, seen) = fake_openai().await;
    let (base, stop, task, dir) = start().await;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .unwrap();
    let token = token(&client, &base).await;
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
    let create = |body: serde_json::Value| {
        let (client, base, token) = (client.clone(), base.clone(), token.clone());
        async move {
            let created: serde_json::Value = client
                .post(format!("{base}/api/threads"))
                .bearer_auth(&token)
                .json(&body)
                .send()
                .await
                .unwrap()
                .json()
                .await
                .unwrap();
            created["id"].as_str().unwrap().to_owned()
        }
    };
    let thread = create(serde_json::json!({"providerId": "jait", "sessionId": session_id})).await;
    let orphan = create(serde_json::json!({"providerId": "jait"})).await;
    let post = |path: String, body: serde_json::Value, auth: bool| {
        let (client, token) = (client.clone(), token.clone());
        async move {
            let request = client.post(path).json(&body);
            let request = if auth {
                request.bearer_auth(token)
            } else {
                request
            };
            request.send().await.unwrap()
        }
    };
    let status_of = |id: String| {
        let (client, base, token) = (client.clone(), base.clone(), token.clone());
        async move {
            let thread: serde_json::Value = client
                .get(format!("{base}/api/threads/{id}"))
                .bearer_auth(token)
                .send()
                .await
                .unwrap()
                .json()
                .await
                .unwrap();
            thread["status"].as_str().unwrap_or_default().to_owned()
        }
    };
    let wait_for = |id: String, want: &'static str| async move {
        for _ in 0..100 {
            if status_of(id.clone()).await == want {
                return;
            }
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
        panic!("thread never reached {want}");
    };

    for action in ["start", "send", "resume"] {
        let url = format!("{base}/api/threads/{thread}/{action}");
        assert_eq!(
            post(url, serde_json::json!({"message": "hi"}), false)
                .await
                .status(),
            401
        );
        let url = format!("{base}/api/threads/nope/{action}");
        assert_eq!(
            post(url, serde_json::json!({"message": "hi"}), true)
                .await
                .status(),
            404
        );
    }
    let url = format!("{base}/api/threads/{thread}/start");
    assert_eq!(
        post(url, serde_json::json!({"message": "  "}), true)
            .await
            .status(),
        400
    );
    let url = format!("{base}/api/threads/{orphan}/start");
    assert_eq!(
        post(url, serde_json::json!({"message": "hi"}), true)
            .await
            .status(),
        409
    );
    // nothing stopped or failed yet, so there is nothing to resume
    let url = format!("{base}/api/threads/{thread}/resume");
    assert_eq!(post(url, serde_json::json!({}), true).await.status(), 409);

    let url = format!("{base}/api/threads/{thread}/start");
    let started = post(url, serde_json::json!({"message": "hi"}), true).await;
    assert_eq!(started.status(), 200);
    wait_for(thread.clone(), "completed").await;
    let url = format!("{base}/api/threads/{thread}/send");
    assert_eq!(
        post(url, serde_json::json!({"message": "again"}), true)
            .await
            .status(),
        200
    );
    wait_for(thread.clone(), "completed").await;
    let activities: serde_json::Value = client
        .get(format!("{base}/api/threads/{thread}/activities"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let texts = activities["activities"].as_array().unwrap();
    assert!(
        texts.iter().any(|a| a["payload"]["content"] == "hi"),
        "{activities}"
    );
    assert!(
        texts.iter().any(|a| a["payload"]["content"] == "again"),
        "{activities}"
    );

    // a stopped thread resumes with the saved history
    let stopped = post(
        format!("{base}/api/threads/{thread}/stop"),
        serde_json::json!({}),
        true,
    )
    .await;
    assert_eq!(stopped.status(), 200);
    assert_eq!(status_of(thread.clone()).await, "interrupted");
    let url = format!("{base}/api/threads/{thread}/resume");
    assert_eq!(post(url, serde_json::json!({}), true).await.status(), 200);
    wait_for(thread.clone(), "completed").await;
    let calls = seen.lock().unwrap().clone();
    assert_eq!(calls.len(), 3);
    assert!(
        calls[2]
            .1
            .to_string()
            .contains("Continue the interrupted task")
    );

    // steering needs a running turn: auth, ownership, validation and the idle conflict
    let url = format!("{base}/api/threads/{thread}/steer");
    let steer = |url: String, body: serde_json::Value, auth: bool| post(url, body, auth);
    assert_eq!(
        steer(url.clone(), serde_json::json!({"message": "x"}), false)
            .await
            .status(),
        401
    );
    let missing = format!("{base}/api/threads/nope/steer");
    assert_eq!(
        steer(missing, serde_json::json!({"message": "x"}), true)
            .await
            .status(),
        404
    );
    assert_eq!(
        steer(url.clone(), serde_json::json!({"message": " "}), true)
            .await
            .status(),
        400
    );
    assert_eq!(
        steer(url, serde_json::json!({"message": "change course"}), true)
            .await
            .status(),
        409
    );

    // approval: auth, ownership, validation, then the built-in provider has no approval channel
    let approve_url = format!("{base}/api/threads/{thread}/approve");
    let decision = serde_json::json!({"requestId": "r1", "approved": true});
    assert_eq!(
        post(approve_url.clone(), decision.clone(), false)
            .await
            .status(),
        401
    );
    assert_eq!(
        post(
            format!("{base}/api/threads/nope/approve"),
            decision.clone(),
            true
        )
        .await
        .status(),
        404
    );
    assert_eq!(
        post(
            approve_url.clone(),
            serde_json::json!({"requestId": "r1"}),
            true
        )
        .await
        .status(),
        400
    );
    assert_eq!(post(approve_url, decision, true).await.status(), 409);
    assert_eq!(seen.lock().unwrap().len(), 3);
    let _ = stop.send(());
    let _ = task.await;
    drop(dir);
}

#[tokio::test(flavor = "multi_thread")]
async fn session_plan_and_prewarm_respect_auth_and_ownership() {
    let (base, stop, task, dir) = start().await;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .unwrap();
    let token = token(&client, &base).await;
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
    let id = session["id"].as_str().unwrap();
    assert_eq!(
        client
            .get(format!("{base}/api/sessions/{id}/plan"))
            .send()
            .await
            .unwrap()
            .status(),
        401
    );
    let plan = client
        .get(format!("{base}/api/sessions/{id}/plan"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap();
    assert_eq!(plan.status(), 404);
    let body: serde_json::Value = plan.json().await.unwrap();
    assert_eq!(body["details"], "No pending plan for this session");
    let reject = client
        .post(format!("{base}/api/sessions/{id}/plan/reject"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap();
    assert_eq!(reject.status(), 404);
    let execute = client
        .post(format!("{base}/api/sessions/{id}/plan/execute"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap();
    assert_eq!(execute.status(), 404);
    let body: serde_json::Value = execute.json().await.unwrap();
    assert_eq!(body["details"], "No pending plan for this session");
    let missing = client
        .get(format!("{base}/api/sessions/nope/plan"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap();
    assert_eq!(missing.status(), 404);
    let prewarm = |body: serde_json::Value| {
        let request = client
            .post(format!("{base}/api/chat/prewarm"))
            .bearer_auth(&token)
            .json(&body);
        async move { request.send().await.unwrap() }
    };
    assert_eq!(prewarm(serde_json::json!({})).await.status(), 400);
    let skipped = prewarm(serde_json::json!({"sessionId": id, "provider": "jait"})).await;
    assert_eq!(skipped.status(), 200);
    let skipped: serde_json::Value = skipped.json().await.unwrap();
    assert_eq!(skipped["reason"], "not-a-cli-provider");
    assert_eq!(
        prewarm(serde_json::json!({"sessionId": "nope", "provider": "codex"}))
            .await
            .status(),
        404
    );
    let warm: serde_json::Value =
        prewarm(serde_json::json!({"sessionId": id, "provider": "codex"}))
            .await
            .json()
            .await
            .unwrap();
    assert_eq!(warm["status"], "skipped");
    let anon = client
        .post(format!("{base}/api/chat/prewarm"))
        .json(&serde_json::json!({"sessionId": id}))
        .send()
        .await
        .unwrap();
    assert_eq!(anon.status(), 401);
    let _ = stop.send(());
    let _ = task.await;
    drop(dir);
}

#[tokio::test]
async fn consent_routes_are_owner_scoped_and_toggle_session_approve_all() {
    let (base, stop, task, dir) = start().await;
    let client = reqwest::Client::new();
    for path in [
        "/api/consent/policy",
        "/api/consent/pending",
        "/api/consent/count",
        "/api/consent/nope",
        "/api/consent/pending/nope",
    ] {
        let anon = client.get(format!("{base}{path}")).send().await.unwrap();
        assert_eq!(anon.status(), 401, "{path}");
    }
    let token = token(&client, &base).await;
    let get = |path: String| {
        let request = client.get(format!("{base}{path}")).bearer_auth(&token);
        async move { request.send().await.unwrap() }
    };
    let policy: serde_json::Value = get("/api/consent/policy".into())
        .await
        .json()
        .await
        .unwrap();
    assert_eq!(policy["unknownToolsRequireConsent"], true, "{policy}");
    let pending: serde_json::Value = get("/api/consent/pending".into())
        .await
        .json()
        .await
        .unwrap();
    assert_eq!(pending["requests"], serde_json::json!([]), "{pending}");
    let count: serde_json::Value = get("/api/consent/count".into()).await.json().await.unwrap();
    assert_eq!(count["count"], 0, "{count}");
    assert_eq!(get("/api/consent/nope".into()).await.status(), 404);
    // a session the caller does not own is invisible, not an empty list
    assert_eq!(get("/api/consent/pending/nope".into()).await.status(), 404);
    assert_eq!(
        get("/api/consent/pending/nope/approve-all".into())
            .await
            .status(),
        404
    );
    for action in ["approve", "reject", "approve-all"] {
        let unknown = client
            .post(format!("{base}/api/consent/nope/{action}"))
            .bearer_auth(&token)
            .json(&serde_json::json!({}))
            .send()
            .await
            .unwrap();
        assert_eq!(unknown.status(), 404, "{action}");
    }
    let foreign = client
        .post(format!("{base}/api/consent/pending/nope/approve-all"))
        .bearer_auth(&token)
        .json(&serde_json::json!({}))
        .send()
        .await
        .unwrap();
    assert_eq!(foreign.status(), 404);
    let trust: serde_json::Value = get("/api/trust".into()).await.json().await.unwrap();
    assert!(trust["message"].is_string(), "{trust}");

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
    let id = session["id"].as_str().unwrap().to_owned();
    let own: serde_json::Value = get(format!("/api/consent/pending/{id}"))
        .await
        .json()
        .await
        .unwrap();
    assert_eq!(own["requests"], serde_json::json!([]), "{own}");
    let url = format!("{base}/api/consent/pending/{id}/approve-all");
    let state = |value: serde_json::Value| async move { value["approveAllEnabled"].clone() };
    let off: serde_json::Value = get(format!("/api/consent/pending/{id}/approve-all"))
        .await
        .json()
        .await
        .unwrap();
    assert_eq!(state(off).await, false);
    let on: serde_json::Value = client
        .post(&url)
        .bearer_auth(&token)
        .json(&serde_json::json!({}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(on["approveAllEnabled"], true, "{on}");
    assert_eq!(on["approvedCount"], 0, "{on}");
    let enabled: serde_json::Value = get(format!("/api/consent/pending/{id}/approve-all"))
        .await
        .json()
        .await
        .unwrap();
    assert_eq!(state(enabled).await, true);
    let cleared: serde_json::Value = client
        .delete(&url)
        .bearer_auth(&token)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(cleared["approveAllEnabled"], false, "{cleared}");
    let _ = stop.send(());
    let _ = task.await;
    drop(dir);
}

#[tokio::test]
async fn session_lifecycle_routes_archive_move_view_and_keep_state() {
    let (base, stop, task, dir) = start().await;
    let client = reqwest::Client::new();
    for (method, path) in [
        ("GET", "/api/sessions/last-active"),
        ("GET", "/api/tools/sessions.list"),
        ("GET", "/api/tools/sessions.status"),
        ("GET", "/api/sessions/x/state"),
        ("POST", "/api/sessions/x/archive"),
        ("POST", "/api/sessions/x/viewed"),
        ("POST", "/api/sessions/x/move"),
        ("POST", "/api/sessions/x/generate-title"),
    ] {
        let anon = client
            .request(method.parse().unwrap(), format!("{base}{path}"))
            .send()
            .await
            .unwrap();
        assert_eq!(anon.status(), 401, "{method} {path}");
    }
    let token = token(&client, &base).await;
    let send = |method: &str, path: String, body: serde_json::Value| {
        let request = client
            .request(method.parse().unwrap(), format!("{base}{path}"))
            .bearer_auth(&token)
            .json(&body);
        async move { request.send().await.unwrap() }
    };
    let none: serde_json::Value = send(
        "GET",
        "/api/sessions/last-active".into(),
        serde_json::json!(null),
    )
    .await
    .json()
    .await
    .unwrap();
    assert!(none["session"].is_null(), "{none}");
    let made = send(
        "POST",
        "/api/sessions".into(),
        serde_json::json!({"name": "lifecycle", "projectPath": dir.to_string_lossy()}),
    )
    .await;
    assert_eq!(made.status(), 201);
    let session: serde_json::Value = made.json().await.unwrap();
    let id = session["id"].as_str().unwrap().to_owned();
    let project = session["projectId"]
        .as_str()
        .expect("project created")
        .to_owned();

    let last: serde_json::Value = send(
        "GET",
        "/api/sessions/last-active".into(),
        serde_json::json!(null),
    )
    .await
    .json()
    .await
    .unwrap();
    assert_eq!(last["session"]["id"], id, "{last}");
    let listed: serde_json::Value = send(
        "GET",
        "/api/tools/sessions.list".into(),
        serde_json::json!(null),
    )
    .await
    .json()
    .await
    .unwrap();
    assert!(listed["sessions"].to_string().contains(&id), "{listed}");
    let status_url = |sid: &str| format!("/api/tools/sessions.status?sessionId={sid}");
    let status = send("GET", status_url(&id), serde_json::json!(null)).await;
    assert_eq!(status.status(), 200);
    assert_eq!(
        send("GET", status_url("nope"), serde_json::json!(null))
            .await
            .status(),
        404
    );
    assert_eq!(
        send(
            "GET",
            "/api/tools/sessions.status".into(),
            serde_json::json!(null)
        )
        .await
        .status(),
        400
    );

    let viewed: serde_json::Value = send(
        "POST",
        format!("/api/sessions/{id}/viewed"),
        serde_json::json!({}),
    )
    .await
    .json()
    .await
    .unwrap();
    assert_eq!(viewed["ok"], true, "{viewed}");
    let bad_stamp = send(
        "POST",
        format!("/api/sessions/{id}/viewed"),
        serde_json::json!({"lastActiveAt": "not a date"}),
    )
    .await;
    assert_eq!(bad_stamp.status(), 400);

    let patched = send(
        "PATCH",
        format!("/api/sessions/{id}/state"),
        serde_json::json!({"draft": "hello", "tab": 2}),
    )
    .await;
    assert_eq!(patched.status(), 200);
    let state: serde_json::Value = send(
        "GET",
        format!("/api/sessions/{id}/state"),
        serde_json::json!(null),
    )
    .await
    .json()
    .await
    .unwrap();
    assert!(state.to_string().contains("hello"), "{state}");
    let only_tab: serde_json::Value = send(
        "GET",
        format!("/api/sessions/{id}/state?keys=tab"),
        serde_json::json!(null),
    )
    .await
    .json()
    .await
    .unwrap();
    assert!(!only_tab.to_string().contains("hello"), "{only_tab}");
    assert_eq!(
        send(
            "PATCH",
            format!("/api/sessions/{id}/state"),
            serde_json::json!([1])
        )
        .await
        .status(),
        400
    );
    assert_eq!(
        send(
            "GET",
            "/api/sessions/nope/state".into(),
            serde_json::json!(null)
        )
        .await
        .status(),
        404
    );

    // moving to the project it is already in is a no-op; a malformed or foreign target is refused
    let same: serde_json::Value = send(
        "POST",
        format!("/api/sessions/{id}/move"),
        serde_json::json!({"projectId": project}),
    )
    .await
    .json()
    .await
    .unwrap();
    assert_eq!(same["moved"], false, "{same}");
    let to_chat: serde_json::Value = send(
        "POST",
        format!("/api/sessions/{id}/move"),
        serde_json::json!({"projectId": null}),
    )
    .await
    .json()
    .await
    .unwrap();
    assert_eq!(to_chat["moved"], true, "{to_chat}");
    assert!(to_chat["toProjectId"].is_null(), "{to_chat}");
    assert_eq!(
        send(
            "POST",
            format!("/api/sessions/{id}/move"),
            serde_json::json!({"projectId": 7})
        )
        .await
        .status(),
        400
    );
    assert_eq!(
        send(
            "POST",
            format!("/api/sessions/{id}/move"),
            serde_json::json!({"projectId": "nope"})
        )
        .await
        .status(),
        404
    );
    assert_eq!(
        send(
            "POST",
            "/api/sessions/nope/move".into(),
            serde_json::json!({"projectId": null})
        )
        .await
        .status(),
        404
    );

    // no title transport is configured, so a missing session is the only deterministic answer here
    assert_eq!(
        send(
            "POST",
            "/api/sessions/nope/generate-title".into(),
            serde_json::json!({"prompt": "hi"})
        )
        .await
        .status(),
        404
    );

    let archived: serde_json::Value = send(
        "POST",
        format!("/api/sessions/{id}/archive"),
        serde_json::json!({}),
    )
    .await
    .json()
    .await
    .unwrap();
    assert_eq!(archived["status"], "archived", "{archived}");
    assert_eq!(
        send(
            "POST",
            "/api/sessions/nope/archive".into(),
            serde_json::json!({})
        )
        .await
        .status(),
        404
    );
    let _ = stop.send(());
    let _ = task.await;
    drop(dir);
}

#[tokio::test]
async fn terminal_routes_are_owner_scoped_and_validate_input() {
    let (base, stop, task, dir) = start().await;
    let client = reqwest::Client::new();
    for (method, path) in [
        ("GET", "/api/terminals/shells"),
        ("GET", "/api/terminals/term-x"),
        ("DELETE", "/api/terminals/term-x"),
        ("POST", "/api/terminals/term-x/write"),
        ("POST", "/api/terminals/term-x/resize"),
        ("POST", "/api/terminals/term-x/execute"),
    ] {
        let anon = client
            .request(method.parse().unwrap(), format!("{base}{path}"))
            .json(&serde_json::json!({}))
            .send()
            .await
            .unwrap();
        assert_eq!(anon.status(), 401, "{method} {path}");
    }
    let token = token(&client, &base).await;
    let send = |method: &str, path: String, body: serde_json::Value| {
        let request = client
            .request(method.parse().unwrap(), format!("{base}{path}"))
            .bearer_auth(&token)
            .json(&body);
        async move { request.send().await.unwrap() }
    };
    let shells: serde_json::Value = send(
        "GET",
        "/api/terminals/shells".into(),
        serde_json::json!(null),
    )
    .await
    .json()
    .await
    .unwrap();
    assert!(shells["shells"].is_array(), "{shells}");
    for (method, path) in [
        ("GET", "/api/terminals/term-x"),
        ("DELETE", "/api/terminals/term-x"),
        ("POST", "/api/terminals/term-x/write"),
        ("POST", "/api/terminals/term-x/resize"),
    ] {
        let missing = send(method, path.into(), serde_json::json!({"data": "x"})).await;
        assert_eq!(missing.status(), 404, "{method} {path}");
    }
    let blank = send(
        "POST",
        "/api/terminals/term-x/execute".into(),
        serde_json::json!({"command": "   "}),
    )
    .await;
    assert_eq!(blank.status(), 400);
    let unknown = send(
        "POST",
        "/api/terminals/term-x/execute".into(),
        serde_json::json!({"command": "echo hi"}),
    )
    .await;
    assert_eq!(unknown.status(), 404);

    let made = send("POST", "/api/terminals".into(), serde_json::json!({})).await;
    if made.status() == 201 {
        let term: serde_json::Value = made.json().await.unwrap();
        let id = term["id"].as_str().unwrap().to_owned();
        assert_eq!(
            send(
                "GET",
                format!("/api/terminals/{id}"),
                serde_json::json!(null)
            )
            .await
            .status(),
            200
        );
        let write = send(
            "POST",
            format!("/api/terminals/{id}/write"),
            serde_json::json!({"data": "\n"}),
        )
        .await;
        assert_eq!(write.status(), 200);
        let resized: serde_json::Value = send(
            "POST",
            format!("/api/terminals/{id}/resize"),
            serde_json::json!({"cols": 100, "rows": 30}),
        )
        .await
        .json()
        .await
        .unwrap();
        assert_eq!(resized["ok"], true, "{resized}");
        // a second account must not see, drive or stop the first account's terminal
        let invite: serde_json::Value = client
            .post(format!("{base}/api/auth/invitations"))
            .bearer_auth(&token)
            .json(&serde_json::json!({}))
            .send()
            .await
            .unwrap()
            .json()
            .await
            .unwrap();
        let other: serde_json::Value = client
            .post(format!("{base}/api/auth/register"))
            .json(&serde_json::json!({"username": "intruder", "password": "correct-horse-2", "invitation": invite["invitation"]}))
            .timeout(Duration::from_secs(60))
            .send()
            .await
            .unwrap()
            .json()
            .await
            .unwrap();
        let other = other["access_token"]
            .as_str()
            .unwrap_or_else(|| panic!("no second token: {other}"))
            .to_owned();
        for (method, path) in [
            ("GET", format!("/api/terminals/{id}")),
            ("POST", format!("/api/terminals/{id}/write")),
            ("DELETE", format!("/api/terminals/{id}")),
        ] {
            let denied = client
                .request(method.parse().unwrap(), format!("{base}{path}"))
                .bearer_auth(&other)
                .json(&serde_json::json!({"data": "x"}))
                .send()
                .await
                .unwrap();
            assert_eq!(denied.status(), 404, "{method} {path}");
        }
        let stopped = send(
            "DELETE",
            format!("/api/terminals/{id}"),
            serde_json::json!(null),
        )
        .await;
        assert_eq!(stopped.status(), 200);
        assert_eq!(
            send(
                "GET",
                format!("/api/terminals/{id}"),
                serde_json::json!(null)
            )
            .await
            .status(),
            404
        );
    }
    let _ = stop.send(());
    let _ = task.await;
    drop(dir);
}

async fn call(
    client: &reqwest::Client,
    base: &str,
    token: Option<&str>,
    method: &str,
    path: &str,
    body: serde_json::Value,
) -> (u16, serde_json::Value) {
    let mut request = client.request(method.parse().unwrap(), format!("{base}{path}"));
    if let Some(token) = token {
        request = request.bearer_auth(token);
    }
    if !body.is_null() {
        request = request.json(&body);
    }
    let response = request.send().await.unwrap();
    let status = response.status().as_u16();
    (status, response.json().await.unwrap_or_default())
}

#[tokio::test]
async fn repo_todo_proposal_and_plan_routes_validate_and_isolate_owners() {
    use serde_json::json;
    let (base, stop, task, dir) = start().await;
    let client = reqwest::Client::new();
    for (method, path) in [
        ("GET", "/api/repos/x/todos"),
        ("POST", "/api/repos/x/todos"),
        ("PATCH", "/api/jait-todos/x"),
        ("DELETE", "/api/jait-todos/x"),
        ("PATCH", "/api/repo-proposals/x"),
        ("GET", "/api/plans/x"),
        ("PATCH", "/api/plans/x"),
        ("DELETE", "/api/plans/x"),
        ("POST", "/api/plans/x/generate"),
        ("POST", "/api/plans/x/start"),
        ("POST", "/api/plans/x/tasks/t/start"),
        ("PATCH", "/api/repos/x"),
        ("DELETE", "/api/repos/x"),
    ] {
        let (status, _) = call(&client, &base, None, method, path, json!(null)).await;
        assert_eq!(status, 401, "{method} {path}");
    }
    let owner = token(&client, &base).await;
    let intruder = second_token(&client, &base, &owner).await;
    let owner = Some(owner.as_str());
    let intruder = Some(intruder.as_str());
    let local = dir.join("repo-under-test");
    std::fs::create_dir_all(&local).unwrap();
    let (status, repo) = call(
        &client,
        &base,
        owner,
        "POST",
        "/api/repos",
        json!({"name":"under-test","localPath":local.to_string_lossy()}),
    )
    .await;
    assert_eq!(status, 200, "{repo}");
    let repo_id = repo["repo"]["id"].as_str().unwrap().to_owned();

    // Todos.
    let todos = format!("/api/repos/{repo_id}/todos");
    let (status, _) = call(
        &client,
        &base,
        owner,
        "POST",
        &todos,
        json!({"message":"  "}),
    )
    .await;
    assert_eq!(status, 400);
    let (status, _) = call(
        &client,
        &base,
        intruder,
        "POST",
        &todos,
        json!({"message":"x"}),
    )
    .await;
    assert_eq!(status, 404);
    let (status, _) = call(&client, &base, intruder, "GET", &todos, json!(null)).await;
    assert_eq!(status, 404);
    let (status, created) = call(
        &client,
        &base,
        owner,
        "POST",
        &todos,
        json!({"message":"ship it","priority":"high","tags":[" A ","a","B"],"dueDate":"2030-01-02"}),
    )
    .await;
    assert_eq!(status, 201, "{created}");
    let todo = &created["todo"];
    assert_eq!(todo["priority"], "high");
    let todo_id = todo["id"].as_str().unwrap().to_owned();
    let (_, listed) = call(&client, &base, owner, "GET", &todos, json!(null)).await;
    assert_eq!(listed["todos"].as_array().unwrap().len(), 1);
    let item = format!("/api/jait-todos/{todo_id}");
    for body in [
        json!({"message":""}),
        json!({"status":"bogus"}),
        json!({"priority":"urgent"}),
    ] {
        let (status, _) = call(&client, &base, owner, "PATCH", &item, body).await;
        assert_eq!(status, 400);
    }
    let (status, _) = call(
        &client,
        &base,
        intruder,
        "PATCH",
        &item,
        json!({"status":"done"}),
    )
    .await;
    assert_eq!(status, 404);
    let (status, _) = call(&client, &base, intruder, "DELETE", &item, json!(null)).await;
    assert_eq!(status, 404);
    let (status, patched) = call(
        &client,
        &base,
        owner,
        "PATCH",
        &item,
        json!({"status":"done"}),
    )
    .await;
    assert_eq!(status, 200);
    assert_eq!(patched["todo"]["status"], "done");
    let (status, _) = call(&client, &base, owner, "DELETE", &item, json!(null)).await;
    assert_eq!(status, 200);
    let (status, _) = call(&client, &base, owner, "DELETE", &item, json!(null)).await;
    assert_eq!(status, 404);

    // Legacy proposal aliases.
    let proposals = format!("/api/repos/{repo_id}/proposals");
    let (status, created) = call(
        &client,
        &base,
        owner,
        "POST",
        &proposals,
        json!({"message":"idea"}),
    )
    .await;
    assert_eq!(status, 201, "{created}");
    let proposal_id = created["proposal"]["id"].as_str().unwrap().to_owned();
    let alias = format!("/api/repo-proposals/{proposal_id}");
    let (status, _) = call(
        &client,
        &base,
        intruder,
        "PATCH",
        &alias,
        json!({"status":"done"}),
    )
    .await;
    assert_eq!(status, 404);
    let (status, patched) = call(
        &client,
        &base,
        owner,
        "PATCH",
        &alias,
        json!({"status":"in_progress"}),
    )
    .await;
    assert_eq!(status, 200);
    assert_eq!(patched["proposal"]["status"], "in_progress");
    let (status, _) = call(&client, &base, owner, "DELETE", &alias, json!(null)).await;
    assert_eq!(status, 200);

    // Plans.
    let plans = format!("/api/repos/{repo_id}/plans");
    let (status, _) = call(
        &client,
        &base,
        intruder,
        "POST",
        &plans,
        json!({"title":"x"}),
    )
    .await;
    assert_eq!(status, 404);
    let (status, created) = call(
        &client,
        &base,
        owner,
        "POST",
        &plans,
        json!({"title":"Launch"}),
    )
    .await;
    assert_eq!(status, 201, "{created}");
    let plan_id = created["plan"]["id"].as_str().unwrap().to_owned();
    let plan = format!("/api/plans/{plan_id}");
    let (status, got) = call(&client, &base, owner, "GET", &plan, json!(null)).await;
    assert_eq!(status, 200);
    assert_eq!(got["plan"]["title"], "Launch");
    for (method, path) in [
        ("GET", plan.clone()),
        ("PATCH", plan.clone()),
        ("DELETE", plan.clone()),
        ("POST", format!("{plan}/generate")),
        ("POST", format!("{plan}/start")),
        ("POST", format!("{plan}/tasks/t/start")),
    ] {
        let (status, _) = call(&client, &base, intruder, method, &path, json!({})).await;
        assert_eq!(status, 404, "{method} {path}");
    }
    let (status, patched) = call(
        &client,
        &base,
        owner,
        "PATCH",
        &plan,
        json!({"title":"Launch 2","status":"bogus"}),
    )
    .await;
    assert_eq!(status, 200);
    assert_eq!(patched["plan"]["title"], "Launch 2");
    assert_ne!(patched["plan"]["status"], "bogus");
    let (status, _) = call(
        &client,
        &base,
        owner,
        "POST",
        &format!("{plan}/start"),
        json!({}),
    )
    .await;
    assert_eq!(status, 400);
    let (status, _) = call(
        &client,
        &base,
        owner,
        "POST",
        &format!("{plan}/tasks/nope/start"),
        json!({}),
    )
    .await;
    assert_eq!(status, 404);
    let (status, _) = call(&client, &base, owner, "DELETE", &plan, json!(null)).await;
    assert_eq!(status, 200);
    let (status, _) = call(&client, &base, owner, "GET", &plan, json!(null)).await;
    assert_eq!(status, 404);

    // Repo item routes.
    let repo_path = format!("/api/repos/{repo_id}");
    let (status, _) = call(
        &client,
        &base,
        intruder,
        "PATCH",
        &repo_path,
        json!({"name":"mine"}),
    )
    .await;
    assert_eq!(status, 404);
    let (status, _) = call(&client, &base, intruder, "DELETE", &repo_path, json!(null)).await;
    assert_eq!(status, 404);
    let (status, renamed) = call(
        &client,
        &base,
        owner,
        "PATCH",
        &repo_path,
        json!({"name":"renamed"}),
    )
    .await;
    assert_eq!(status, 200);
    assert_eq!(renamed["repo"]["name"], "renamed");
    let (status, _) = call(&client, &base, owner, "DELETE", &repo_path, json!(null)).await;
    assert_eq!(status, 200);
    let (status, _) = call(&client, &base, owner, "DELETE", &repo_path, json!(null)).await;
    assert_eq!(status, 404);
    let _ = stop.send(());
    let _ = task.await;
    drop(dir);
}

#[tokio::test]
async fn session_context_flow_and_sub_agent_routes_read_persisted_rows() {
    use serde_json::json;
    let (base, stop, task, dir) = start().await;
    let client = reqwest::Client::new();
    for path in [
        "/api/sessions/s/messages/0/context-flow",
        "/api/sessions/s/sub-agents/a",
    ] {
        let (status, _) = call(&client, &base, None, "GET", path, json!(null)).await;
        assert_eq!(status, 401, "{path}");
    }
    let owner = token(&client, &base).await;
    let intruder = second_token(&client, &base, &owner).await;
    let (status, created) = call(
        &client,
        &base,
        Some(&owner),
        "POST",
        "/api/sessions",
        json!({}),
    )
    .await;
    assert_eq!(status, 201, "{created}");
    let session = created["id"].as_str().unwrap().to_owned();
    let db = rusqlite::Connection::open(dir.join("gateway.sqlite")).unwrap();
    let flow = json!({"rounds":[{"n":1}]}).to_string();
    for (id, role, content, calls, flow, at) in [
        (
            "m1",
            "user",
            "hi",
            None::<&str>,
            None::<&str>,
            "2030-01-01T00:00:01Z",
        ),
        ("m2", "assistant", "", None, None, "2030-01-01T00:00:02Z"),
        (
            "m3",
            "assistant",
            "hello",
            None,
            Some(flow.as_str()),
            "2030-01-01T00:00:03Z",
        ),
    ] {
        db.execute(
            "INSERT INTO messages(id, session_id, role, content, tool_calls, context_flow, created_at) VALUES(?1,?2,?3,?4,?5,?6,?7)",
            rusqlite::params![id, session, role, content, calls, flow, at],
        )
        .unwrap();
    }
    db.execute(
        "INSERT INTO sub_agent_history(sub_agent_id, session_id, message_id, rounds, duration_ms, content, created_at) VALUES('sa1', ?1, 'm3', 2, 40, '\"done\"', '2030-01-01T00:00:04Z')",
        [&session],
    )
    .unwrap();
    drop(db);
    let flow_path = |i: &str| format!("/api/sessions/{session}/messages/{i}/context-flow");
    let (status, body) = call(
        &client,
        &base,
        Some(&owner),
        "GET",
        &flow_path("0"),
        json!(null),
    )
    .await;
    assert_eq!((status, &body["contextFlow"]), (200, &json!(null)));
    // The empty assistant placeholder is not visible, so index 1 is "hello".
    let (status, body) = call(
        &client,
        &base,
        Some(&owner),
        "GET",
        &flow_path("1"),
        json!(null),
    )
    .await;
    assert_eq!(status, 200);
    assert_eq!(body["contextFlow"]["rounds"][0]["n"], 1);
    for (path, expected) in [
        (flow_path("2"), 404),
        (flow_path("-1"), 400),
        (flow_path("abc"), 400),
    ] {
        let (status, _) = call(&client, &base, Some(&owner), "GET", &path, json!(null)).await;
        assert_eq!(status, expected, "{path}");
    }
    let (status, _) = call(
        &client,
        &base,
        Some(&intruder),
        "GET",
        &flow_path("1"),
        json!(null),
    )
    .await;
    assert_eq!(status, 404);
    let sub = |id: &str| format!("/api/sessions/{session}/sub-agents/{id}");
    let (status, body) = call(
        &client,
        &base,
        Some(&owner),
        "GET",
        &sub("sa1"),
        json!(null),
    )
    .await;
    assert_eq!(status, 200, "{body}");
    assert_eq!(body["subAgent"]["content"], "done");
    assert_eq!(body["subAgent"]["rounds"], 2);
    assert_eq!(body["subAgent"]["messageId"], "m3");
    let (status, _) = call(
        &client,
        &base,
        Some(&owner),
        "GET",
        &sub("nope"),
        json!(null),
    )
    .await;
    assert_eq!(status, 404);
    let (status, _) = call(
        &client,
        &base,
        Some(&intruder),
        "GET",
        &sub("sa1"),
        json!(null),
    )
    .await;
    assert_eq!(status, 404);
    let _ = stop.send(());
    let _ = task.await;
    let _ = std::fs::remove_dir_all(dir);
}

#[tokio::test]
async fn session_approve_steer_and_trajectory_routes_enforce_ownership() {
    use serde_json::json;
    let (base, stop, task, dir) = start().await;
    let client = reqwest::Client::new();
    for (method, path) in [
        ("POST", "/api/sessions/s/approve"),
        ("POST", "/api/sessions/s/steer"),
        ("GET", "/api/sessions/s/trajectory"),
    ] {
        let (status, _) = call(&client, &base, None, method, path, json!({})).await;
        assert_eq!(status, 401, "{path}");
    }
    let owner = token(&client, &base).await;
    let intruder = second_token(&client, &base, &owner).await;
    let (status, created) = call(
        &client,
        &base,
        Some(&owner),
        "POST",
        "/api/sessions",
        json!({}),
    )
    .await;
    assert_eq!(status, 201, "{created}");
    let session = created["id"].as_str().unwrap().to_owned();
    let approve = format!("/api/sessions/{session}/approve");
    let steer = format!("/api/sessions/{session}/steer");
    let (status, _) = call(&client, &base, Some(&owner), "POST", &approve, json!({})).await;
    assert_eq!(status, 400);
    let (status, _) = call(
        &client,
        &base,
        Some(&owner),
        "POST",
        &approve,
        json!({"requestId":"r"}),
    )
    .await;
    assert_eq!(status, 409);
    let (status, _) = call(
        &client,
        &base,
        Some(&intruder),
        "POST",
        &approve,
        json!({"requestId":"r"}),
    )
    .await;
    assert_eq!(status, 404);
    let (status, _) = call(
        &client,
        &base,
        Some(&owner),
        "POST",
        &steer,
        json!({"message":" "}),
    )
    .await;
    assert_eq!(status, 400);
    let (status, _) = call(
        &client,
        &base,
        Some(&owner),
        "POST",
        &steer,
        json!({"message":"go"}),
    )
    .await;
    assert_eq!(status, 409, "no active turn");
    let (status, _) = call(
        &client,
        &base,
        Some(&intruder),
        "POST",
        &steer,
        json!({"message":"go"}),
    )
    .await;
    assert_eq!(status, 404);
    let db = rusqlite::Connection::open(dir.join("gateway.sqlite")).unwrap();
    db.execute(
        "INSERT INTO session_events(session_id, log_id, type, payload, created_at) VALUES(?1, 1, 'rust.chat.stream', '{\"type\":\"token\",\"text\":\"hi\"}', 1700000000000)",
        [&session],
    )
    .unwrap();
    drop(db);
    let trajectory = format!("{base}/api/sessions/{session}/trajectory");
    let denied = client
        .get(&trajectory)
        .bearer_auth(&intruder)
        .send()
        .await
        .unwrap();
    assert_eq!(denied.status(), 404);
    let mut live = client
        .get(&trajectory)
        .bearer_auth(&owner)
        .send()
        .await
        .unwrap();
    assert_eq!(live.status(), 200);
    let chunk = tokio::time::timeout(std::time::Duration::from_secs(5), live.chunk())
        .await
        .expect("replayed chunk")
        .unwrap()
        .expect("chunk");
    let text = String::from_utf8_lossy(&chunk);
    assert!(text.contains("\"trajectory_event\""), "{text}");
    assert!(text.contains("\"replay\":true"), "{text}");
    assert!(text.contains("\"log_id\":1"), "{text}");
    drop(live);
    let _ = stop.send(());
    let _ = task.await;
    let _ = std::fs::remove_dir_all(dir);
}

#[tokio::test]
async fn session_retry_tool_route_enforces_auth_ownership_and_records() {
    use serde_json::json;
    let (base, stop, task, dir) = start().await;
    let client = reqwest::Client::new();
    let (status, _) = call(
        &client,
        &base,
        None,
        "POST",
        "/api/sessions/s/retry-tool",
        json!({"callId":"c"}),
    )
    .await;
    assert_eq!(status, 401);
    let owner = token(&client, &base).await;
    let intruder = second_token(&client, &base, &owner).await;
    let (status, created) = call(
        &client,
        &base,
        Some(&owner),
        "POST",
        "/api/sessions",
        json!({}),
    )
    .await;
    assert_eq!(status, 201, "{created}");
    let path = format!(
        "/api/sessions/{}/retry-tool",
        created["id"].as_str().unwrap()
    );
    let (status, _) = call(
        &client,
        &base,
        Some(&intruder),
        "POST",
        &path,
        json!({"callId":"c"}),
    )
    .await;
    assert_eq!(status, 404);
    let (status, _) = call(&client, &base, Some(&owner), "POST", &path, json!({})).await;
    assert_eq!(status, 400);
    let (status, body) = call(
        &client,
        &base,
        Some(&owner),
        "POST",
        &path,
        json!({"callId":"c"}),
    )
    .await;
    assert_eq!(status, 404);
    assert_eq!(body["details"], "No tool calls recorded for this session");
    let _ = stop.send(());
    let _ = task.await;
    let _ = std::fs::remove_dir_all(dir);
}

#[tokio::test]
async fn session_restart_from_truncates_persisted_messages() {
    use serde_json::json;
    let (base, stop, task, dir) = start().await;
    let client = reqwest::Client::new();
    let (status, _) = call(
        &client,
        &base,
        None,
        "POST",
        "/api/sessions/s/restart-from",
        json!({}),
    )
    .await;
    assert_eq!(status, 401);
    let owner = token(&client, &base).await;
    let intruder = second_token(&client, &base, &owner).await;
    let (status, created) = call(
        &client,
        &base,
        Some(&owner),
        "POST",
        "/api/sessions",
        json!({}),
    )
    .await;
    assert_eq!(status, 201, "{created}");
    let session = created["id"].as_str().unwrap().to_owned();
    let db = rusqlite::Connection::open(dir.join("gateway.sqlite")).unwrap();
    for (id, role, content, at) in [
        ("r1", "user", "first", "2030-01-01T00:00:01Z"),
        ("r2", "assistant", "answer one", "2030-01-01T00:00:02Z"),
        ("r3", "user", "second", "2030-01-01T00:00:03Z"),
        ("r4", "assistant", "answer two", "2030-01-01T00:00:04Z"),
    ] {
        db.execute(
            "INSERT INTO messages(id, session_id, role, content, created_at) VALUES(?1,?2,?3,?4,?5)",
            rusqlite::params![id, session, role, content, at],
        )
        .unwrap();
    }
    let count = || -> i64 {
        db.query_row(
            "SELECT COUNT(*) FROM messages WHERE session_id = ?1",
            [&session],
            |row| row.get(0),
        )
        .unwrap()
    };
    let path = format!("/api/sessions/{session}/restart-from");
    let (status, _) = call(&client, &base, Some(&owner), "POST", &path, json!({})).await;
    assert_eq!(status, 400);
    let (status, _) = call(
        &client,
        &base,
        Some(&intruder),
        "POST",
        &path,
        json!({"messageIndex":2}),
    )
    .await;
    assert_eq!(status, 404);
    assert_eq!(count(), 4, "intruder must not delete");
    let (status, _) = call(
        &client,
        &base,
        Some(&owner),
        "POST",
        &path,
        json!({"messageIndex":9}),
    )
    .await;
    assert_eq!(status, 404);
    let (status, _) = call(
        &client,
        &base,
        Some(&owner),
        "POST",
        &path,
        json!({"messageIndex":2,"expectedContent":"stale"}),
    )
    .await;
    assert_eq!(status, 409);
    assert_eq!(count(), 4);
    // Index 3 is an assistant row, so it falls back to the preceding user row (index 2).
    let (status, body) = call(
        &client,
        &base,
        Some(&owner),
        "POST",
        &path,
        json!({"messageIndex":3,"expectedContent":"second"}),
    )
    .await;
    assert_eq!(status, 200, "{body}");
    assert_eq!(body["streaming"], false);
    assert_eq!(body["messages"].as_array().unwrap().len(), 2, "{body}");
    assert_eq!(count(), 2);
    let (status, _) = call(
        &client,
        &base,
        Some(&owner),
        "POST",
        &path,
        json!({"messageFromEnd":0}),
    )
    .await;
    assert_eq!(status, 200);
    assert_eq!(count(), 0);
    let _ = stop.send(());
    let _ = task.await;
    let _ = std::fs::remove_dir_all(dir);
}

#[tokio::test]
async fn user_question_routes_validate_and_report_missing_requests() {
    use serde_json::json;
    let (base, stop, task, dir) = start().await;
    let client = reqwest::Client::new();
    for path in [
        "/api/user-questions/requests/q/submit",
        "/api/user-questions/requests/q/cancel",
    ] {
        let (status, _) = call(&client, &base, None, "POST", path, json!({})).await;
        assert_eq!(status, 401, "{path}");
    }
    let owner = token(&client, &base).await;
    let owner = Some(owner.as_str());
    let (status, listed) = call(
        &client,
        &base,
        owner,
        "GET",
        "/api/user-questions/requests",
        json!(null),
    )
    .await;
    assert_eq!(status, 200);
    assert_eq!(listed["requests"], json!([]));
    let (status, _) = call(
        &client,
        &base,
        owner,
        "POST",
        "/api/user-questions/requests/q/submit",
        json!({}),
    )
    .await;
    assert_eq!(status, 400);
    let (status, _) = call(
        &client,
        &base,
        owner,
        "POST",
        "/api/user-questions/requests/q/submit",
        json!({"answers":{"0":{"selected":["a"]}}}),
    )
    .await;
    assert_eq!(status, 404);
    let (status, _) = call(
        &client,
        &base,
        owner,
        "POST",
        "/api/user-questions/requests/q/cancel",
        json!({}),
    )
    .await;
    assert_eq!(status, 404);
    let _ = stop.send(());
    let _ = task.await;
    drop(dir);
}

async fn second_token(client: &reqwest::Client, base: &str, owner: &str) -> String {
    let invite: serde_json::Value = client
        .post(format!("{base}/api/auth/invitations"))
        .bearer_auth(owner)
        .json(&serde_json::json!({}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let other: serde_json::Value = client
        .post(format!("{base}/api/auth/register"))
        .json(&serde_json::json!({"username":"intruder","password":"correct-horse-2","invitation":invite["invitation"]}))
        .timeout(Duration::from_secs(60))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    other["access_token"]
        .as_str()
        .unwrap_or_else(|| panic!("no second token: {other}"))
        .to_owned()
}

#[tokio::test]
async fn reminder_item_routes_validate_and_isolate_owners() {
    let (base, stop, task, dir) = start().await;
    let client = reqwest::Client::new();
    for (method, path) in [
        ("PATCH", "/api/reminders/x"),
        ("DELETE", "/api/reminders/x"),
        ("GET", "/api/reminders/export.md"),
    ] {
        let anon = client
            .request(method.parse().unwrap(), format!("{base}{path}"))
            .send()
            .await
            .unwrap();
        assert_eq!(anon.status(), 401, "{method} {path}");
    }
    let token = token(&client, &base).await;
    let blank = client
        .post(format!("{base}/api/reminders"))
        .bearer_auth(&token)
        .json(&serde_json::json!({"content": "   "}))
        .send()
        .await
        .unwrap();
    assert_eq!(blank.status(), 400);
    let created: serde_json::Value = client
        .post(format!("{base}/api/reminders"))
        .bearer_auth(&token)
        .json(&serde_json::json!({"content": "remember-the-milk-marker"}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let id = created["reminder"]["id"].as_str().unwrap().to_owned();

    let export = client
        .get(format!("{base}/api/reminders/export.md"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap();
    assert_eq!(export.status(), 200);
    assert!(
        export
            .headers()
            .get("content-type")
            .unwrap()
            .to_str()
            .unwrap()
            .starts_with("text/markdown")
    );
    assert!(
        export
            .text()
            .await
            .unwrap()
            .contains("remember-the-milk-marker")
    );

    let other = second_token(&client, &base, &token).await;
    let foreign_export = client
        .get(format!("{base}/api/reminders/export.md"))
        .bearer_auth(&other)
        .send()
        .await
        .unwrap()
        .text()
        .await
        .unwrap();
    assert!(!foreign_export.contains("remember-the-milk-marker"));
    for method in ["PATCH", "DELETE"] {
        let denied = client
            .request(
                method.parse().unwrap(),
                format!("{base}/api/reminders/{id}"),
            )
            .bearer_auth(&other)
            .json(&serde_json::json!({"content": "hijack"}))
            .send()
            .await
            .unwrap();
        assert_eq!(denied.status(), 404, "{method}");
    }

    let empty = client
        .patch(format!("{base}/api/reminders/{id}"))
        .bearer_auth(&token)
        .json(&serde_json::json!({"content": " "}))
        .send()
        .await
        .unwrap();
    assert_eq!(empty.status(), 400);
    let bad_status = client
        .patch(format!("{base}/api/reminders/{id}"))
        .bearer_auth(&token)
        .json(&serde_json::json!({"status": "bogus"}))
        .send()
        .await
        .unwrap();
    assert_eq!(bad_status.status(), 400);
    let patched: serde_json::Value = client
        .patch(format!("{base}/api/reminders/{id}"))
        .bearer_auth(&token)
        .json(&serde_json::json!({"content": "edited-marker", "status": "archived"}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(patched["reminder"]["content"], "edited-marker", "{patched}");
    assert_eq!(patched["reminder"]["status"], "archived", "{patched}");
    let missing = client
        .patch(format!("{base}/api/reminders/nope"))
        .bearer_auth(&token)
        .json(&serde_json::json!({"content": "x"}))
        .send()
        .await
        .unwrap();
    assert_eq!(missing.status(), 404);

    let deleted = client
        .delete(format!("{base}/api/reminders/{id}"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap();
    assert_eq!(deleted.status(), 200);
    let again = client
        .delete(format!("{base}/api/reminders/{id}"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap();
    assert_eq!(again.status(), 404);
    let _ = stop.send(());
    let _ = task.await;
    drop(dir);
}

#[tokio::test]
async fn trust_level_item_routes_need_login_and_reset_state() {
    let (base, stop, task, dir) = start().await;
    let client = reqwest::Client::new();
    let anon_get = client
        .get(format!("{base}/api/trust/levels/file.write"))
        .send()
        .await
        .unwrap();
    assert_eq!(anon_get.status(), 401);
    let anon_reset = client
        .post(format!("{base}/api/trust/levels/file.write/reset"))
        .json(&serde_json::json!({}))
        .send()
        .await
        .unwrap();
    assert_eq!(anon_reset.status(), 401);
    let token = token(&client, &base).await;
    let level = client
        .get(format!("{base}/api/trust/levels/file.write"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap();
    assert_eq!(level.status(), 200);
    let level: serde_json::Value = level.json().await.unwrap();
    assert!(level.is_object(), "{level}");
    let reset = client
        .post(format!("{base}/api/trust/levels/file.write/reset"))
        .bearer_auth(&token)
        .json(&serde_json::json!({}))
        .send()
        .await
        .unwrap();
    assert_eq!(reset.status(), 200);
    let reset: serde_json::Value = reset.json().await.unwrap();
    assert!(reset.is_object(), "{reset}");
    let _ = stop.send(());
    let _ = task.await;
    drop(dir);
}

#[tokio::test]
async fn assistant_profile_item_routes_validate_and_isolate_owners() {
    let (base, stop, task, dir) = start().await;
    let client = reqwest::Client::new();
    let anon = client
        .get(format!("{base}/api/assistants/profiles/x"))
        .send()
        .await
        .unwrap();
    assert_eq!(anon.status(), 401);
    let token = token(&client, &base).await;
    let nameless = client
        .post(format!("{base}/api/assistants/profiles"))
        .bearer_auth(&token)
        .json(&serde_json::json!({"name": "  "}))
        .send()
        .await
        .unwrap();
    assert_eq!(nameless.status(), 400);
    let created: serde_json::Value = client
        .post(format!("{base}/api/assistants/profiles"))
        .bearer_auth(&token)
        .json(&serde_json::json!({"name": "Reviewer", "runtimeMode": "bogus"}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let id = created["profile"]["id"].as_str().unwrap().to_owned();
    assert_eq!(created["profile"]["name"], "Reviewer", "{created}");
    assert!(created["profile"]["runtimeMode"].is_null(), "{created}");

    let got: serde_json::Value = client
        .get(format!("{base}/api/assistants/profiles/{id}"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(got["profile"]["id"], id.as_str());

    let other = second_token(&client, &base, &token).await;
    for method in ["GET", "PATCH", "DELETE"] {
        let denied = client
            .request(
                method.parse().unwrap(),
                format!("{base}/api/assistants/profiles/{id}"),
            )
            .bearer_auth(&other)
            .json(&serde_json::json!({"name": "hijack"}))
            .send()
            .await
            .unwrap();
        assert_eq!(denied.status(), 404, "{method}");
    }

    let patched: serde_json::Value = client
        .patch(format!("{base}/api/assistants/profiles/{id}"))
        .bearer_auth(&token)
        .json(&serde_json::json!({"description": "d", "runtimeMode": "supervised"}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(patched["profile"]["runtimeMode"], "supervised", "{patched}");
    assert_eq!(patched["profile"]["name"], "Reviewer", "{patched}");
    let missing = client
        .patch(format!("{base}/api/assistants/profiles/nope"))
        .bearer_auth(&token)
        .json(&serde_json::json!({"description": "x"}))
        .send()
        .await
        .unwrap();
    assert_eq!(missing.status(), 404);

    let deleted = client
        .delete(format!("{base}/api/assistants/profiles/{id}"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap();
    assert_eq!(deleted.status(), 204);
    let again = client
        .delete(format!("{base}/api/assistants/profiles/{id}"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap();
    assert_eq!(again.status(), 404);
    let _ = stop.send(());
    let _ = task.await;
    drop(dir);
}
