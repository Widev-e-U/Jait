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
    let dir = std::env::temp_dir().join(format!("jait-mounts-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).unwrap();
    let web_root = web.then(|| {
        let root = dir.join("web");
        std::fs::create_dir_all(root.join("assets")).unwrap();
        std::fs::write(root.join("index.html"), "<html>jait-ui</html>").unwrap();
        std::fs::write(root.join("assets/app.js"), "console.log(1)").unwrap();
        root
    });
    let app = Application::bind(
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
    assert!(Application::bind(l, a).await.is_err());
    let (l, a) = mk(true);
    let app = Application::bind(l, a).await.unwrap();
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
