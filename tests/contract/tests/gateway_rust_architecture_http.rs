#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::{
    config::GatewayConfig,
    db,
    health::HealthState,
    routes::{architecture::ArchitectureRoutes, auth::AuthState},
    runtime::Gateway,
    security::http_auth::{self, AuthUser},
};
use serde_json::{Value, json};
use std::{
    fs,
    path::{Path, PathBuf},
    time::Duration,
};
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}
fn normalize(value: &mut Value) {
    match value {
        Value::Array(a) => {
            for v in a {
                normalize(v)
            }
        }
        Value::Object(o) => {
            for (key, v) in o {
                if key == "updatedAt" {
                    assert!(v.as_str().is_some_and(|s| {
                        jait_gateway::services::provider_reset_windows::parse_iso(s).is_some()
                    }));
                    *v = json!("<time>");
                } else {
                    normalize(v)
                }
            }
        }
        _ => {}
    }
}
async fn compare(mut call: Value) {
    let dir = root()
        .join(".jait/artifacts/gateway-rust/architecture-http")
        .join(uuid::Uuid::new_v4().to_string());
    fs::create_dir_all(&dir).unwrap();
    let project = dir.join("project");
    let name = project.to_str().unwrap();
    call["op"] = json!("nativearchitecturehttp.http");
    call["root"] = json!(name);
    let mut expected =
        internal_driver::call(&root(), &dir, json!({"version":1,"calls":[call]}), &|| {
            false
        })
        .unwrap()[0]
            .clone();
    normalize(&mut expected);
    fs::remove_dir_all(&project).unwrap();
    fs::create_dir_all(&project).unwrap();
    let db = db::open_database(Path::new(":memory:")).unwrap();
    db::migrate_database(&db).unwrap();
    db.execute_batch("INSERT INTO users(id,username,password_hash,created_at,updated_at)VALUES('owner','alice','fixture','old','old'),('other','bob','fixture','old','old');").unwrap();
    if let Some(seed) = call["seed"].as_str() {
        db.execute_batch(&seed.replace("$ROOT", name)).unwrap();
    }
    let auth = AuthState::new(db, "architecture-fixture".into()).unwrap();
    let gateway = Gateway::bind_authenticated(
        GatewayConfig {
            address: "127.0.0.1:0".parse().unwrap(),
        },
        HealthState::default(),
        auth.clone(),
    )
    .await
    .unwrap()
    .with_architecture(ArchitectureRoutes { auth: auth.clone() });
    let base = format!("http://{}", gateway.local_addr().unwrap());
    let (tx, rx) = tokio::sync::oneshot::channel();
    let task = tokio::spawn(gateway.serve(async {
        let _ = rx.await;
    }));
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .build()
        .unwrap();
    let mut results = vec![];
    for step in call["steps"].as_array().unwrap() {
        let encoded = url_encode(name);
        let path = step["path"].as_str().unwrap().replace("$ROOT", &encoded);
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
        for (key, cookie) in [("user", false), ("cookie", true)] {
            if let Some(id) = step[key].as_str() {
                let token = http_auth::sign_auth_token(
                    &AuthUser {
                        id: id.into(),
                        username: if id == "owner" { "alice" } else { "bob" }.into(),
                    },
                    "architecture-fixture",
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
            let encoded = serde_json::to_string(body).unwrap().replace("$ROOT", name);
            request = request.body(encoded);
            if step["headers"]["content-type"].is_null() {
                request = request.header("content-type", "application/json");
            }
        }
        let response = request.send().await.unwrap();
        let status = response.status().as_u16();
        let raw = response.text().await.unwrap();
        let body = serde_json::from_str::<Value>(&raw).unwrap_or(json!(raw));
        results.push(json!({"status":status,"body":body}));
    }
    let file = fs::read_to_string(project.join(".jait/architecture.mmd")).ok();
    let text = serde_json::to_string(&json!({"results":results,"fileText":file}))
        .unwrap()
        .replace(name, "<root>");
    let mut actual: Value = serde_json::from_str(&text).unwrap();
    normalize(&mut actual);
    tx.send(()).unwrap();
    task.await.unwrap().unwrap();
    auth.shutdown().await.unwrap();
    assert_eq!(actual, expected);
}
fn url_encode(value: &str) -> String {
    // URLs need only encode the project fixture's POSIX slashes and UUID-safe text.
    value.replace('%', "%25").replace('/', "%2F")
}
#[tokio::test]
async fn architecture_routes_auth_cookie_origin_validation_and_real_storage_round_trip() {
    compare(json!({"steps":[
  {"method":"GET","path":"/api/architecture"},
  {"method":"GET","path":"/api/architecture","user":"owner"},
  {"method":"GET","path":"/api/architecture?projectRoot=%20","user":"owner"},
  {"method":"GET","path":"/api/architecture?projectRoot=$ROOT","user":"owner"},
  {"method":"PUT","path":"/api/architecture","user":"owner","body":{}},
  {"method":"PUT","path":"/api/architecture","user":"owner","body":{"projectRoot":"$ROOT","diagram":" "}},
  {"method":"PUT","path":"/api/architecture","user":"owner","body":{"projectRoot":"  $ROOT \n","diagram":"\u{feff} graph TD; A-->B \n"}},
  {"method":"GET","path":"/api/architecture?projectRoot=$ROOT","user":"owner"},
  {"method":"GET","path":"/api/architecture?projectRoot=$ROOT","user":"other"},
  {"method":"HEAD","path":"/api/architecture?projectRoot=$ROOT","user":"owner"},
  {"method":"GET","path":"/api/architecture?projectRoot=$ROOT","cookie":"owner"},
  {"method":"GET","path":"/api/architecture?projectRoot=$ROOT","user":"deleted"},
  {"method":"PUT","path":"/api/architecture","user":"owner","headers":{"origin":"https://evil.example"},"body":{"projectRoot":"$ROOT","diagram":"blocked"}}
 ]})).await;
}
#[tokio::test]
async fn architecture_routes_framework_parser_duplicate_query_and_wrong_runtime_types() {
    compare(json!({"steps":[
  {"method":"PUT","path":"/api/architecture","user":"owner","body":null},{"method":"PUT","path":"/api/architecture","user":"owner","body":{"projectRoot":"/etc","diagram":"blocked"}},
  {"method":"PUT","path":"/api/architecture","user":"owner","body":[]},
  {"method":"PUT","path":"/api/architecture","user":"owner","body":{"projectRoot":10,"diagram":"x"}},
  {"method":"PUT","path":"/api/architecture","user":"owner","body":{"projectRoot":null,"diagram":10}},
  {"method":"GET","path":"/api/architecture?projectRoot=a&projectRoot=b","user":"owner"},
  {"method":"PUT","path":"/api/architecture","user":"owner","raw":"{bad","headers":{"content-type":"application/json"}},
  {"method":"PUT","path":"/api/architecture","user":"owner","raw":"","headers":{"content-type":"application/json"}},
  {"method":"PUT","path":"/api/architecture","user":"owner","raw":"x","headers":{"content-type":"application/octet-stream"}},
  {"method":"PUT","path":"/api/architecture","user":"owner","body":{"projectRoot":"$ROOT","diagram":"x","__proto__":{}}}
 ]})).await;
}
#[tokio::test]
async fn architecture_routes_database_fallback_owner_filter_and_failed_write_file_effects() {
    compare(json!({"seed":"INSERT INTO architecture_diagrams(id,user_id,project_root,diagram,created_at,updated_at)VALUES('legacy','owner','$ROOT','legacy diagram','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z'); CREATE TRIGGER reject_diagram BEFORE UPDATE ON architecture_diagrams BEGIN SELECT RAISE(ABORT,'forced failure'); END;","steps":[
  {"method":"GET","path":"/api/architecture?projectRoot=$ROOT","user":"owner"},
  {"method":"GET","path":"/api/architecture?projectRoot=$ROOT","user":"other"},
  {"method":"PUT","path":"/api/architecture","user":"owner","body":{"projectRoot":"$ROOT","diagram":"written before failure"}},
  {"method":"GET","path":"/api/architecture?projectRoot=$ROOT","user":"owner"}
 ]})).await;
}
