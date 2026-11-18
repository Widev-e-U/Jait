#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::{
    Gateway,
    config::GatewayConfig,
    db,
    health::HealthState,
    routes::{assistant_profiles::AssistantProfileRoutes, auth::AuthState},
    security::http_auth::{self, AuthUser},
    services::assistant_profiles::AssistantProfileService,
};
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
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
        .join(".jait/artifacts/gateway-rust/profiles")
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
    let gateway = Gateway::bind_authenticated(
        GatewayConfig {
            address: "127.0.0.1:0".parse().unwrap(),
        },
        HealthState::default(),
        auth.clone(),
    )
    .await
    .unwrap()
    .with_assistant_profiles(AssistantProfileRoutes { auth: auth.clone() });
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
    let mut ids = HashMap::<String, String>::new();
    for step in call["steps"].as_array().unwrap() {
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
        if let Some(alias) = step["alias"].as_str() {
            ids.insert(
                alias.to_string(),
                body["profile"]["id"].as_str().unwrap().to_string(),
            );
        }
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

fn service_scenario(mut call: Value) {
    call["op"] = json!("nativeprofiles.service");
    call["now"] = json!(NOW);
    let mut expected = reference(call.clone());
    normalize(&mut expected);
    let db = db::open_database(Path::new(":memory:")).unwrap();
    db::migrate_database(&db).unwrap();
    if let Some(seed) = call["seed"].as_str() {
        db.execute_batch(seed).unwrap();
    }
    let service = AssistantProfileService::with_time(&db, NOW);
    let mut ids = HashMap::<String, String>::new();
    let mut results = vec![];
    for step in call["steps"].as_array().unwrap() {
        let id = step["id"].as_str().unwrap_or("");
        let id = ids.get(id).map(String::as_str).unwrap_or(id);
        let user = step["user"].as_str().unwrap_or("");
        let value = match step["op"].as_str().unwrap() {
            "create" => service.create(user, &step["input"]),
            "update" => service
                .update(id, user, &step["input"])
                .map(|v| v.unwrap_or(Value::Null)),
            "delete" => service.delete(id, user).map(|v| json!(v)),
            "get" => service
                .get(id, step["user"].as_str())
                .map(|v| v.unwrap_or(Value::Null)),
            "list" => service.list(step["user"].as_str()).map(|v| json!(v)),
            "sql" => db
                .execute_batch(step["sql"].as_str().unwrap())
                .map(|_| Value::Null),
            _ => panic!("bad step"),
        }
        .unwrap_or_else(|_| json!({"error":"database"}));
        if let Some(alias) = step["alias"].as_str() {
            ids.insert(alias.into(), value["id"].as_str().unwrap().into());
        }
        results.push(value);
    }
    let mut actual = json!({"results":results});
    normalize(&mut actual);
    assert_eq!(actual, expected);
}
#[test]
fn profiles_preserve_defaults_owner_filters_null_patches_and_string_arrays() {
    service_scenario(json!({"steps":[
        {"op":"create","user":"owner","alias":"a","input":{"name":" \u{FEFF}Alice  ","enabledSkills":[" x ","","  ",1,"x"],"description":"Desc"}},
        {"op":"create","user":"owner","alias":"b","input":{"name":"Bob","isDefault":true,"runtimeMode":"supervised"}},
        {"op":"create","user":"other","alias":"c","input":{"name":"Other"}},
        {"op":"list"},{"op":"list","user":"owner"},{"op":"list","user":""},
        {"op":"get","id":"a","user":"other"},{"op":"update","id":"a","user":"other","input":{"name":"Hacked"}},
        {"op":"update","id":"a","user":"owner","input":{"description":null,"systemPrompt":"Text","toolProfile":"dev","runtimeMode":null,"enabledSkills":["skill","  "],"enabledPlugins":["p"]}},
        {"op":"update","id":"b","user":"owner","input":{"isDefault":false}},
        {"op":"list","user":"owner"},{"op":"update","id":"missing","user":"owner","input":{}},
        {"op":"delete","id":"c","user":"owner"},{"op":"delete","id":"b","user":"owner"},
        {"op":"list","user":"owner"},{"op":"delete","id":"a","user":"owner"},{"op":"list","user":"owner"}
    ]}));
}
#[test]
fn legacy_arrays_filter_types_and_corrupt_default_values_are_not_truthy() {
    service_scenario(json!({"steps":[
        {"op":"create","user":"o","alias":"a","input":{"name":"A"}},
        {"op":"sql","sql":"UPDATE assistant_profiles SET enabled_skills='[1,\"x\",null,\" \"]',enabled_plugins='invalid',is_default=2"},
        {"op":"list"},{"op":"update","id":"a","user":"o","input":{}},{"op":"get","id":"a"}
    ]}));
}
#[test]
fn clearing_defaults_retains_reference_partial_effects_when_insert_or_update_fails() {
    service_scenario(json!({"steps":[
        {"op":"create","user":"o","input":{"name":"A"},"alias":"a"},
        {"op":"sql","sql":"CREATE TRIGGER reject_insert BEFORE INSERT ON assistant_profiles BEGIN SELECT RAISE(ABORT,'blocked'); END"},
        {"op":"create","user":"o","input":{"name":"B","isDefault":true}},{"op":"list","user":"o"},
        {"op":"sql","sql":"DROP TRIGGER reject_insert; CREATE TRIGGER reject_update BEFORE UPDATE OF name ON assistant_profiles BEGIN SELECT RAISE(ABORT,'blocked'); END"},
        {"op":"update","id":"a","user":"o","input":{"name":"new","isDefault":true}},{"op":"list","user":"o"}
    ]}));
}
#[tokio::test]
async fn profile_http_crud_auth_ownership_filters_and_parser_boundaries() {
    route_scenario(json!({"op":"nativeprofiles.routes","steps":[
        {"method":"GET","path":"/api/assistants/profiles"},
        {"method":"POST","path":"/api/assistants/profiles","user":"owner","body":{"name":"  "}},
        {"method":"POST","path":"/api/assistants/profiles","user":"owner","body":{"name":" A ","runtimeMode":"invalid","enabledSkills":["a",1,""]},"alias":"a"},
        {"method":"POST","path":"/api/assistants/profiles","cookie":"other","body":{"name":"Other"},"alias":"b"},
        {"method":"GET","path":"/api/assistants/profiles","user":"owner"},
        {"method":"GET","path":"/api/assistants/profiles/$b","user":"owner"},
        {"method":"PATCH","path":"/api/assistants/profiles/$a","user":"other","body":{"name":"no"}},
        {"method":"PATCH","path":"/api/assistants/profiles/$a","user":"owner","body":{"name":"","description":null,"runtimeMode":17,"isDefault":false}},
        {"method":"GET","path":"/api/assistants/profiles/$a","cookie":"owner"},
        {"method":"DELETE","path":"/api/assistants/profiles/$a","user":"other"},
        {"method":"DELETE","path":"/api/assistants/profiles/$a","user":"owner"},
        {"method":"DELETE","path":"/api/assistants/profiles/$a","user":"owner"},
        {"method":"GET","path":"/api/assistants/profiles","cookie":"owner","headers":{"origin":"https://evil.example"}},
        {"method":"POST","path":"/api/assistants/profiles","user":"owner","headers":{"content-type":"application/json"},"raw":"{bad"},
        {"method":"POST","path":"/api/assistants/profiles","user":"owner","body":{"name":"ok","__proto__":{}}},
        {"method":"GET","path":"/api/assistants/profiles","user":"deleted"}
    ]})).await;
}

#[test]
fn delete_promotes_most_recent_owned_profile_and_empty_owner_is_unscoped() {
    service_scenario(json!({"steps":[
        {"op":"create","user":"o","input":{"name":"Old"},"alias":"a"},
        {"op":"create","user":"o","input":{"name":"Recent"},"alias":"b"},
        {"op":"create","user":"o","input":{"name":"Default","isDefault":true},"alias":"c"},
        {"op":"sql","sql":"UPDATE assistant_profiles SET updated_at='2026-01-01' WHERE name='Old'; UPDATE assistant_profiles SET updated_at='2026-10-01' WHERE name='Recent'"},
        {"op":"delete","id":"c","user":"o"},{"op":"list","user":"o"},{"op":"get","id":"a","user":""}
    ]}));
}
