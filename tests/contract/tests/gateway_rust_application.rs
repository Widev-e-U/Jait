#[path = "../src/internal_driver.rs"]
mod internal_driver;

use jait_gateway::{
    config::GatewayConfig,
    db,
    runtime::application::{Application, ApplicationConfig},
    security::http_auth,
};
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    time::Duration,
};
use tokio::sync::oneshot;

fn root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}
fn work() -> PathBuf {
    let path = root()
        .join(".jait/artifacts/gateway-rust/application/native")
        .join(uuid::Uuid::new_v4().to_string());
    fs::create_dir_all(&path).unwrap();
    path
}
fn config(path: &Path) -> ApplicationConfig {
    ApplicationConfig {
        database_path: path.join("application.sqlite"),
        project_root: path.to_path_buf(),
        jwt_secret: "application-fixture-secret".into(),
        cors_origin: String::new(),
        health: None,
    }
}
async fn start(path: &Path) -> (String, oneshot::Sender<()>, tokio::task::JoinHandle<()>) {
    let app = Application::bind(
        GatewayConfig {
            address: "127.0.0.1:0".parse().unwrap(),
        },
        config(path),
    )
    .await
    .unwrap();
    let base = format!("http://{}", app.local_addr().unwrap());
    let (send, receive) = oneshot::channel();
    let task = tokio::spawn(async {
        app.serve(async {
            let _ = receive.await;
        })
        .await
        .unwrap();
    });
    (base, send, task)
}
fn normalize(value: &mut Value, ids: &mut HashMap<String, String>) {
    match value {
        Value::Object(fields) => {
            if let Some(uptime) = fields.remove("uptime") {
                assert!(uptime.is_u64());
            }
            for (key, value) in fields {
                if key == "access_token" {
                    assert!(
                        http_auth::verify_auth_token(
                            value.as_str().unwrap(),
                            "application-fixture-secret"
                        )
                        .is_some()
                    );
                    *value = json!("<token>");
                } else {
                    normalize(value, ids);
                }
            }
        }
        Value::Array(values) => {
            for value in values {
                normalize(value, ids);
            }
        }
        Value::String(text) => {
            if let Some(cookie) = text.strip_prefix("jait_token=") {
                let (token, rest) = cookie.split_once(';').unwrap();
                assert!(
                    http_auth::verify_auth_token(token, "application-fixture-secret").is_some()
                );
                *text = format!("jait_token=<token>;{rest}");
            } else if uuid::Uuid::parse_str(text).is_ok() {
                let next = format!("<id-{}>", ids.len());
                *text = ids.entry(text.clone()).or_insert(next).clone();
            } else if chrono::DateTime::parse_from_rfc3339(text).is_ok() {
                *text = "<time>".into();
            }
        }
        _ => {}
    }
}

#[tokio::test]
async fn persistent_account_session_restart_and_live_health_match_typescript() {
    let phases = json!([
        [
            {"method":"GET","path":"/health"},
            {"method":"GET","path":"/api/sessions"},
            {"method":"POST","path":"/api/auth/register","body":{"username":"alice","password":"short"}},
            {"method":"POST","path":"/api/auth/register","body":{"username":"alice","password":"fixture password"}},
            {"method":"GET","path":"/api/auth/me","cookie":true},
            {"method":"POST","path":"/api/sessions","auth":true,"body":{"name":"Native workflow"}},
            {"method":"GET","path":"/health"},
            {"method":"GET","path":"/api/sessions?status=active","auth":true}
        ],
        [
            {"method":"GET","path":"/health"},
            {"method":"GET","path":"/api/auth/me","cookie":true},
            {"method":"POST","path":"/api/auth/login","body":{"username":"alice","password":"wrong password"}},
            {"method":"POST","path":"/api/auth/login","body":{"username":"alice","password":"fixture password"}},
            {"method":"GET","path":"/api/sessions/$session","auth":true},
            {"method":"DELETE","path":"/api/sessions/$session","auth":true},
            {"method":"GET","path":"/health"},
            {"method":"GET","path":"/api/sessions?status=active","auth":true}
        ]
    ]);
    let driver_work = work();
    let input = json!({"version":1,"calls":[{"op":"nativeapplication.lifecycle","phases":phases}]});
    let mut reference = tokio::task::spawn_blocking(move || {
        internal_driver::call(&root(), &driver_work, input, &|| false).unwrap()[0].clone()
    })
    .await
    .unwrap();
    let native_work = work();
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .unwrap();
    let mut token = String::new();
    let mut cookie = String::new();
    let mut session = String::new();
    let mut results = vec![];
    for phase in phases.as_array().unwrap() {
        let (base, shutdown, task) = start(&native_work).await;
        for step in phase.as_array().unwrap() {
            let method =
                reqwest::Method::from_bytes(step["method"].as_str().unwrap().as_bytes()).unwrap();
            let path = step["path"].as_str().unwrap().replace("$session", &session);
            let mut request = client
                .request(method, format!("{base}{path}"))
                .header("host", "fixture.local")
                .header("connection", "close");
            if step["auth"] == true {
                request = request.bearer_auth(&token);
            }
            if step["cookie"] == true {
                request = request.header("cookie", &cookie);
            }
            if let Some(body) = step.get("body") {
                request = request.json(body);
            }
            let response = request.send().await.unwrap();
            let status = response.status().as_u16();
            let cookies: Vec<String> = response
                .headers()
                .get_all("set-cookie")
                .iter()
                .map(|value| value.to_str().unwrap().to_owned())
                .collect();
            if let Some(value) = cookies.first() {
                cookie = value.split(';').next().unwrap().into();
            }
            let raw = response.text().await.unwrap();
            let body: Value = serde_json::from_str(&raw).unwrap_or(json!(raw));
            if let Some(value) = body["access_token"].as_str() {
                token = value.into();
            }
            if status == 201 {
                session = body["id"].as_str().unwrap().into();
            }
            results.push(json!({"status":status,"body":body,"cookies":cookies}));
        }
        shutdown.send(()).unwrap();
        task.await.unwrap();
    }
    // Health follows live writes and persistent restart; deleted sessions are not active.
    assert_eq!(results[0]["body"]["hasUsers"], false);
    assert_eq!(results[6]["body"]["sessions"], 1);
    assert_eq!(results[8]["body"]["sessions"], 1);
    assert_eq!(results[8]["body"]["hasUsers"], true);
    assert_eq!(results[14]["body"]["sessions"], 0);
    let mut native = json!(results);
    normalize(&mut native, &mut HashMap::new());
    normalize(&mut reference, &mut HashMap::new());
    fs::write(
        native_work.join("normalized-native.json"),
        serde_json::to_vec_pretty(&native).unwrap(),
    )
    .unwrap();
    fs::write(
        native_work.join("normalized-reference.json"),
        serde_json::to_vec_pretty(&reference).unwrap(),
    )
    .unwrap();
    assert_eq!(native, reference);
    // Reopen the actual native database through the production TypeScript services.
    let reopen_work = work();
    let reopen_request = json!({"version":1,"calls":[{
        "op":"nativeapplication.reopen","database":native_work.join("application.sqlite")
    }]});
    let reopened = tokio::task::spawn_blocking(move || {
        internal_driver::call(&root(), &reopen_work, reopen_request, &|| false).unwrap()[0].clone()
    })
    .await
    .unwrap();
    assert_eq!(
        reopened,
        json!({"users":1,"username":"alice","active":0,
        "sessions":[{"status":"deleted","name":"Native workflow"}]})
    );
}

#[tokio::test]
async fn invalid_configuration_cannot_create_state_or_bind_publicly() {
    let directory = work();
    let invalid = directory.join("not-created").join("application.sqlite");
    let mut settings = config(&directory);
    settings.database_path = invalid.clone();
    settings.jwt_secret = " \t".into();
    assert!(
        Application::bind(GatewayConfig::default(), settings)
            .await
            .is_err()
    );
    assert!(!invalid.exists());
    let mut settings = config(&directory);
    settings.database_path = invalid.clone();
    assert!(
        Application::bind(
            GatewayConfig {
                address: "0.0.0.0:0".parse().unwrap()
            },
            settings
        )
        .await
        .is_err()
    );
    assert!(!invalid.exists());
    for fields in [
        vec![("JAIT_RUST_APPLICATION", "yes")],
        vec![("JAIT_RUST_APPLICATION", "1")],
        vec![
            ("JAIT_RUST_APPLICATION", "1"),
            ("JAIT_RUST_DB", "relative.sqlite"),
        ],
    ] {
        assert!(
            ApplicationConfig::from_lookup(|key| fields
                .iter()
                .find(|(name, _)| *name == key)
                .map(|(_, value)| value.to_string()))
            .is_err()
        );
    }
    assert!(ApplicationConfig::from_lookup(|_| None).unwrap().is_none());
    // Disabled mode ignores credentials and paths rather than opening host defaults.
    assert!(
        ApplicationConfig::from_lookup(|key| (key == "JWT_SECRET").then(|| "unused".into()))
            .unwrap()
            .is_none()
    );
}

#[tokio::test]
async fn storage_failure_reports_unhealthy_without_leaking_database_error() {
    let directory = work();
    let (base, shutdown, task) = start(&directory).await;
    let db = db::open_database(&directory.join("application.sqlite")).unwrap();
    db.execute_batch("DROP TABLE sessions").unwrap();
    let response = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .unwrap()
        .get(format!("{base}/health"))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), reqwest::StatusCode::SERVICE_UNAVAILABLE);
    assert_eq!(
        response.json::<Value>().await.unwrap(),
        json!({"healthy":false})
    );
    drop(db);
    shutdown.send(()).unwrap();
    task.await.unwrap();
}
