#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::{
    Gateway,
    config::GatewayConfig,
    db,
    health::HealthState,
    routes::{auth::AuthState, secrets::SecretRoutes},
    security::http_auth::{self, AuthUser},
    services::{
        input_requests::{SecretInput, SecretInputService},
        user_secrets::{SaveSecretParams, UserSecretService},
    },
    time::Clock,
};
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    sync::{
        Arc,
        atomic::{AtomicI64, Ordering},
    },
    time::Duration,
};

fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}

fn reference(call: Value) -> Value {
    let dir = root()
        .join(".jait/artifacts/gateway-rust/secrets")
        .join(uuid::Uuid::new_v4().to_string());
    fs::create_dir_all(&dir).unwrap();
    internal_driver::call(&root(), &dir, json!({"version":1,"calls":[call]}), &|| {
        false
    })
    .unwrap()[0]
        .clone()
}

/// Normalize random ids and wall-clock timestamps to placeholders and sort
/// object keys so both implementations can be compared structurally.
fn normalize(value: &mut Value) {
    match value {
        Value::Array(array) => {
            for item in array {
                normalize(item);
            }
        }
        Value::Object(map) => {
            for (key, item) in map.iter_mut() {
                match key.as_str() {
                    "id" => *item = json!("<id>"),
                    "createdAt" | "updatedAt" | "lastUsedAt" | "expiresAt" => {
                        *item = json!("<time>")
                    }
                    _ => normalize(item),
                }
            }
            let mut sorted: Vec<(String, Value)> = std::mem::take(map).into_iter().collect();
            sorted.sort_by(|a, b| a.0.cmp(&b.0));
            *map = sorted.into_iter().collect();
        }
        _ => {}
    }
}

fn save_params(value: Option<&Value>) -> SaveSecretParams {
    let value = value.expect("save step params");
    SaveSecretParams {
        user_id: value["userId"].as_str().map(String::from),
        r#type: value["type"].as_str().unwrap_or("").to_string(),
        key: value["key"].as_str().unwrap_or("").to_string(),
        label: value["label"].as_str().unwrap_or("").to_string(),
        value: value["value"].as_str().unwrap_or("").to_string(),
    }
}

async fn service_scenario(call: Value) -> Value {
    let mut expected = reference(call.clone());
    normalize(&mut expected);
    let db = db::open_database(Path::new(":memory:")).unwrap();
    db::migrate_database(&db).unwrap();
    if let Some(seed) = call["seed"].as_str() {
        db.execute_batch(seed).unwrap();
    }
    let secret = call["secret"].as_str().unwrap().to_string();
    let base = call["now"].as_i64().unwrap();
    let counter = Arc::new(AtomicI64::new(0));
    let clock: Clock = Arc::new(move || base + counter.fetch_add(1000, Ordering::SeqCst));
    let service = UserSecretService::with_clock(&secret, clock);
    let mut results = Vec::new();
    for step in call["steps"].as_array().unwrap() {
        let op = step["op"].as_str().unwrap();
        let value = match op {
            "save" => match service.save(&db, save_params(step.get("params"))) {
                Ok(record) => serde_json::to_value(record).unwrap(),
                Err(error) => json!({"error": error.to_string()}),
            },
            "list" => {
                let user = step["user"].as_str();
                let type_filter = step["type"].as_str();
                match service.list(&db, user, type_filter) {
                    Ok(list) => serde_json::to_value(list).unwrap(),
                    Err(error) => json!({"error": error.to_string()}),
                }
            }
            "get" => {
                let user = step["user"].as_str();
                let type_filter = step["type"].as_str().unwrap();
                let key = step["key"].as_str().unwrap();
                match service.get_value(&db, user, type_filter, key) {
                    Ok(value) => serde_json::to_value(value).unwrap(),
                    Err(error) => json!({"error": error.to_string()}),
                }
            }
            "delete" => {
                let id = step["id"].as_str().unwrap();
                let user = step["user"].as_str();
                match service.delete(&db, id, user) {
                    Ok(value) => json!(value),
                    Err(error) => json!({"error": error.to_string()}),
                }
            }
            _ => panic!("unknown service step"),
        };
        results.push(value);
    }
    let mut actual = json!({"results": results});
    normalize(&mut actual);
    assert_eq!(actual, expected);
    actual
}

async fn route_scenario(call: Value) -> Value {
    let mut expected = reference(call.clone());
    normalize(&mut expected);
    let db = db::open_database(Path::new(":memory:")).unwrap();
    db::migrate_database(&db).unwrap();
    db.execute_batch("INSERT INTO users(id,username,password_hash,created_at,updated_at)VALUES('owner','alice','fixture','old','old'),('other','bob','fixture','old','old');").unwrap();
    if let Some(seed) = call["seed"].as_str() {
        db.execute_batch(seed).unwrap();
    }
    let secret = call["secret"]
        .as_str()
        .unwrap_or("secrets-fixture")
        .to_string();
    let auth = AuthState::new(db, secret.clone()).unwrap();
    let secret_input =
        SecretInputService::new(jait_gateway::time::default_clock(), 120_000.0, None, None);
    let user_secrets = UserSecretService::new(&secret);
    let gateway = Gateway::bind_authenticated(
        GatewayConfig {
            address: "127.0.0.1:0".parse().unwrap(),
        },
        HealthState::default(),
        auth.clone(),
    )
    .await
    .unwrap()
    .with_secrets(SecretRoutes {
        auth: auth.clone(),
        secret_input: secret_input.clone(),
        user_secrets: Some(user_secrets),
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
    let mut results = vec![];
    let mut ids = HashMap::new();
    for step in call["steps"].as_array().unwrap() {
        if let Some(request) = step.get("request") {
            let input: SecretInput = serde_json::from_value(request.clone()).unwrap();
            let handle = secret_input.request_secret(input.clone()).unwrap();
            ids.insert(input.session_id.clone(), handle.id.clone());
            results.push(Value::Null);
            continue;
        }
        let mut path = step["path"].as_str().unwrap().to_string();
        for (alias, id) in &ids {
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
        for (field, cookie) in [("user", false), ("cookie", true)] {
            if let Some(user) = step[field].as_str() {
                let token = http_auth::sign_auth_token(
                    &AuthUser {
                        id: user.into(),
                        username: if user == "owner" { "alice" } else { "bob" }.into(),
                    },
                    &secret,
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
        let raw = res.text().await.unwrap();
        let body = serde_json::from_str::<Value>(&raw).unwrap_or(json!(raw));
        results.push(json!({"status": status, "body": body}));
    }
    let mut actual = json!({"results": results});
    normalize(&mut actual);
    send.send(()).unwrap();
    task.await.unwrap().unwrap();
    auth.shutdown().await.unwrap();
    assert_eq!(actual, expected);
    actual
}

#[tokio::test]
async fn secret_storage_roundtrips_and_is_owner_scoped() {
    service_scenario(json!({
        "op": "nativesecrets.service",
        "now": 1700000000000i64,
        "secret": "test-secret",
        "steps": [
            {"op":"save","params":{"userId":"owner","type":"api","key":"openai","label":"OpenAI","value":"sk-secret-123"}},
            {"op":"save","params":{"userId":null,"type":"api","key":"global","label":"Global key","value":"sk-global-456"}},
            {"op":"list","user":"owner"},
            {"op":"list","user":null},
            {"op":"list","user":"owner","type":"api"},
            {"op":"get","user":"owner","type":"api","key":"openai"},
            {"op":"get","user":null,"type":"api","key":"global"},
            {"op":"get","user":"owner","type":"api","key":"global"},
            {"op":"get","user":"owner","type":"api","key":"missing"},
            {"op":"save","params":{"userId":"owner","type":"api","key":"openai","label":"Updated","value":"sk-updated-789"}},
            {"op":"get","user":"owner","type":"api","key":"openai"},
            {"op":"list","user":"owner"},
            {"op":"delete","id":"missing","user":"owner"},
            {"op":"save","params":{"userId":"owner","type":"  ","key":"x","label":"x","value":"v"}},
            {"op":"save","params":{"userId":"owner","type":"x","key":"  ","label":"x","value":"v"}},
            {"op":"save","params":{"userId":"owner","type":"x","key":"x","label":"  ","value":"v"}},
            {"op":"save","params":{"userId":"owner","type":"x","key":"x","label":"x","value":"   "}}
        ]
    }))
    .await;
}

#[test]
fn native_ciphertext_is_decryptable_by_typescript() {
    let service = UserSecretService::new("compat-secret");
    let encrypted = service.encrypt("hello secret 🔑");
    let result = reference(json!({
        "op": "nativesecrets.decrypt",
        "secret": "compat-secret",
        "encryptedValue": encrypted.encrypted_value,
        "iv": encrypted.iv,
        "authTag": encrypted.auth_tag,
    }));
    assert_eq!(result["value"], json!("hello secret 🔑"));
}

#[test]
fn typescript_ciphertext_is_decryptable_by_native() {
    let result = reference(json!({
        "op": "nativesecrets.encrypt",
        "secret": "compat-secret",
        "value": "hello from typescript 🔐",
    }));
    let service = UserSecretService::new("compat-secret");
    let value = service
        .decrypt(
            result["encryptedValue"].as_str().unwrap(),
            result["iv"].as_str().unwrap(),
            result["authTag"].as_str().unwrap(),
        )
        .unwrap();
    assert_eq!(value, "hello from typescript 🔐");
}

#[tokio::test]
async fn secret_routes_authenticate_filter_and_persist() {
    route_scenario(json!({
        "op": "nativesecrets.routes",
        "secret": "secrets-fixture",
        "steps": [
            {"request":{"sessionId":"a","userId":"owner","title":"Git","prompt":"Enter token","rememberable":true,"rememberLabel":"GitHub","secretType":"git","secretKey":"github"}},
            {"request":{"sessionId":"b","userId":"other","title":"SSH","prompt":"Password please"}},
            {"method":"GET","path":"/api/secrets/requests"},
            {"method":"GET","path":"/api/secrets/requests","user":"owner"},
            {"method":"GET","path":"/api/secrets/requests?sessionId=b","user":"owner"},
            {"method":"GET","path":"/api/secrets"},
            {"method":"POST","path":"/api/secrets/requests/$a/submit","user":"other","body":{"value":"secret-value"}},
            {"method":"POST","path":"/api/secrets/requests/$a/submit","user":"owner","body":{"value":"secret-value","remember":true}},
            {"method":"POST","path":"/api/secrets/requests/$b/cancel","cookie":"other"},
            {"method":"GET","path":"/api/secrets"},
            {"method":"POST","path":"/api/secrets","user":"owner","body":{"type":"ssh","key":"server","label":"Server","value":"ssh-key"}},
            {"method":"POST","path":"/api/secrets","user":"owner","body":{"type":"ssh","key":"server","label":"Server2","value":"ssh-key2"}},
            {"method":"GET","path":"/api/secrets?type=ssh","user":"owner"},
            {"method":"GET","path":"/api/secrets?type=git","user":"owner"}
        ]
    }))
    .await;
}

#[tokio::test]
async fn secret_routes_reject_bad_requests_and_unknown_secrets() {
    route_scenario(json!({
        "op": "nativesecrets.routes",
        "secret": "secrets-fixture",
        "seed": "INSERT INTO user_secrets(id,user_id,type,key,label,encrypted_value,iv,auth_tag,created_at,updated_at,last_used_at) VALUES('seed-secret','owner','api','seeded','Seeded','AAAA','AAAA','AAAA','old','old',NULL);",
        "steps": [
            {"method":"GET","path":"/api/secrets","cookie":"owner","headers":{"origin":"https://foreign.invalid"}},
            {"method":"GET","path":"/api/secrets","user":"owner","headers":{"origin":"https://foreign.invalid"}},
            {"method":"GET","path":"/api/secrets","headers":{"authorization":"Bearer invalid"}},
            {"method":"GET","path":"/api/secrets","user":"missing"},
            {"method":"POST","path":"/api/secrets","user":"owner","body":{}},
            {"method":"POST","path":"/api/secrets","user":"owner","body":{"type":"x","key":"k","label":"l","value":""}},
            {"method":"POST","path":"/api/secrets","user":"owner","raw":"{bad","headers":{"content-type":"application/json"}},
            {"method":"POST","path":"/api/secrets","user":"owner","raw":"","headers":{"content-type":"application/json"}},
            {"method":"POST","path":"/api/secrets","user":"owner","body":{"__proto__":{"polluted":true},"type":"x","key":"k","label":"l","value":"v"}},
            {"method":"DELETE","path":"/api/secrets/seed-secret","user":"other"},
            {"method":"DELETE","path":"/api/secrets/seed-secret","user":"owner"},
            {"method":"DELETE","path":"/api/secrets/seed-secret","user":"owner"},
            {"method":"POST","path":"/api/secrets/requests/missing/submit","user":"owner","body":{"value":"x"}},
            {"method":"POST","path":"/api/secrets/requests/missing/cancel","user":"owner"}
        ]
    }))
    .await;
}
