#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::{
    Gateway,
    config::GatewayConfig,
    db,
    health::HealthState,
    routes::{auth::AuthState, trust::TrustRoutes},
    security::{
        http_auth::{self, AuthUser},
        trust_worker::TrustWorker,
    },
};
use serde_json::{Value, json};
use std::{
    fs,
    num::NonZeroU16,
    path::{Path, PathBuf},
    time::Duration,
};
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}
async fn scenario(call: Value) -> Value {
    let dir = root()
        .join(".jait/artifacts/gateway-rust/trust-http")
        .join(uuid::Uuid::new_v4().to_string());
    fs::create_dir_all(&dir).unwrap();
    let expected =
        internal_driver::call(&root(), &dir, json!({"version":1,"calls":[call]}), &|| {
            false
        })
        .unwrap()[0]
            .clone();
    let account = db::open_database(Path::new(":memory:")).unwrap();
    db::migrate_database(&account).unwrap();
    account.execute_batch("INSERT INTO users(id,username,password_hash,created_at,updated_at)VALUES('owner','alice','fixture','old','old'),('other','bob','fixture','old','old');").unwrap();
    let database = dir.join("trust.sqlite");
    let connection = db::open_database(&database).unwrap();
    db::migrate_database(&connection).unwrap();
    if let Some(seed) = call["seed"].as_str() {
        connection.execute_batch(seed).unwrap();
    }
    let persistent = call["memory"] != true;
    let trust = TrustWorker::new(
        if persistent {
            Some(connection)
        } else {
            drop(connection);
            None
        },
        NonZeroU16::new(64).unwrap(),
    )
    .unwrap();
    let auth = AuthState::new(account, "trust-http-secret".into()).unwrap();
    let gateway = Gateway::bind_authenticated(
        GatewayConfig {
            address: "127.0.0.1:0".parse().unwrap(),
        },
        HealthState::default(),
        auth.clone(),
    )
    .await
    .unwrap()
    .with_trust(TrustRoutes {
        auth: auth.clone(),
        trust: trust.clone(),
    });
    let base = format!("http://{}", gateway.local_addr().unwrap());
    let (send, receive) = tokio::sync::oneshot::channel();
    let server = tokio::spawn(gateway.serve(async {
        let _ = receive.await;
    }));
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .build()
        .unwrap();
    let mut results = vec![];
    for step in call["steps"].as_array().unwrap() {
        if let Some(action) = step["approve"].as_str() {
            let mut state = None;
            for _ in 0..step["count"].as_u64().unwrap_or(1) {
                state = Some(trust.approve(action.into()).await.unwrap());
            }
            results.push(json!(state));
            continue;
        }
        if let Some(action) = step["revert"].as_str() {
            results.push(json!(trust.revert(action.into()).await.unwrap()));
            continue;
        }
        if let Some(sql) = step["sql"].as_str() {
            let connection = db::open_database(&database).unwrap();
            connection.execute_batch(sql).unwrap();
            results.push(Value::Null);
            continue;
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
        for (field, cookie) in [("user", false), ("cookie", true)] {
            if let Some(user) = step[field].as_str() {
                let token = http_auth::sign_auth_token(
                    &AuthUser {
                        id: user.into(),
                        username: if user == "owner" { "alice" } else { "bob" }.into(),
                    },
                    "trust-http-secret",
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
        let response = request.send().await.unwrap();
        let status = response.status().as_u16();
        let raw = response.text().await.unwrap();
        let body = serde_json::from_str::<Value>(&raw).unwrap_or(json!(raw));
        results.push(json!({"status":status,"body":body}));
    }
    let connection = db::open_database(&database).unwrap();
    let rows=connection.prepare("SELECT action_type,approved_count,reverted_count,current_level FROM trust_levels ORDER BY rowid").unwrap().query_map([],|r|Ok(json!({"action_type":r.get::<_,String>(0)?,"approved_count":r.get::<_,Option<i64>>(1)?,"reverted_count":r.get::<_,Option<i64>>(2)?,"current_level":r.get::<_,Option<i64>>(3)?}))).unwrap().collect::<Result<Vec<_>,_>>().unwrap();
    send.send(()).unwrap();
    server.await.unwrap().unwrap();
    trust.shutdown().await.unwrap();
    auth.shutdown().await.unwrap();
    let actual = json!({"results":results,"rows":rows});
    if actual != expected {
        fs::write(
            dir.join("native.json"),
            serde_json::to_string_pretty(&actual).unwrap(),
        )
        .unwrap();
        fs::write(
            dir.join("reference.json"),
            serde_json::to_string_pretty(&expected).unwrap(),
        )
        .unwrap();
    }
    assert!(
        actual == expected,
        "trust HTTP parity artifacts {}",
        dir.display()
    );
    actual
}
#[tokio::test]
async fn trust_http_preserves_memory_order_and_shared_cache_across_worker_jobs() {
    scenario(json!({"op":"nativetrusthttp.run","memory":true,"steps":[
     {"method":"GET","path":"/api/trust/levels","user":"owner"},
     {"method":"GET","path":"/api/trust/levels/second","user":"owner"},
     {"method":"GET","path":"/api/trust/levels/first","cookie":"owner"},
     {"approve":"first","count":3},{"approve":"first","count":7},{"revert":"first"},
     {"method":"GET","path":"/api/trust/levels","user":"other"},
     {"method":"POST","path":"/api/trust/levels/first/reset","user":"owner"},
     {"method":"GET","path":"/api/trust/levels/first","user":"owner"},
     {"method":"POST","path":"/api/trust/levels/a%2Fb%3Ac%20%F0%9F%98%80/reset","user":"owner"},
     {"method":"GET","path":"/api/trust/levels","user":"owner"}
    ]}))
    .await;
}
#[tokio::test]
async fn trust_http_distinguishes_cached_state_from_external_database_updates() {
    scenario(json!({"op":"nativetrusthttp.run","seed":"INSERT INTO trust_levels(action_type,approved_count,reverted_count,current_level)VALUES('seeded',25,4,3);","steps":[
  {"method":"GET","path":"/api/trust/levels/seeded","user":"owner"},
  {"sql":"UPDATE trust_levels SET approved_count=1,current_level=0 WHERE action_type='seeded';"},
  {"method":"GET","path":"/api/trust/levels/seeded","user":"owner"},
  {"method":"GET","path":"/api/trust/levels","user":"owner"},
  {"method":"GET","path":"/api/trust/levels/new","user":"owner"},
  {"method":"GET","path":"/api/trust/levels","user":"owner"},
  {"method":"POST","path":"/api/trust/levels/seeded/reset","user":"owner"},
  {"method":"POST","path":"/api/trust/levels/new/reset","user":"owner"},
  {"method":"GET","path":"/api/trust/levels","user":"owner"}
 ]})).await;
}
#[tokio::test]
async fn failed_trust_writes_keep_cached_reset_and_approval_effects() {
    scenario(json!({"op":"nativetrusthttp.run","seed":"INSERT INTO trust_levels(action_type,approved_count,reverted_count,current_level)VALUES('blocked',25,4,3); CREATE TRIGGER deny_trust BEFORE UPDATE ON trust_levels BEGIN SELECT RAISE(FAIL,'fixture denied'); END;","steps":[
  {"method":"GET","path":"/api/trust/levels/blocked","user":"owner"},
  {"method":"POST","path":"/api/trust/levels/blocked/reset","user":"owner"},
  {"method":"GET","path":"/api/trust/levels/blocked","user":"owner"},
  {"method":"GET","path":"/api/trust/levels","user":"owner"},
  {"approve":"blocked","count":3},
  {"method":"GET","path":"/api/trust/levels/blocked","user":"owner"}
 ]})).await;
}
#[tokio::test]
async fn trust_routes_retain_account_origin_and_body_parser_boundaries() {
    scenario(json!({"op":"nativetrusthttp.run","memory":true,"steps":[
  {"method":"GET","path":"/api/trust/levels"},
  {"method":"GET","path":"/api/trust/levels","user":"missing"},
  {"method":"GET","path":"/api/trust/levels","cookie":"owner","headers":{"origin":"https://foreign.invalid"}},
  {"method":"GET","path":"/api/trust/levels","user":"owner","headers":{"origin":"https://foreign.invalid"}},
  {"method":"POST","path":"/api/trust/levels/action/reset","user":"owner","raw":"{bad","headers":{"content-type":"application/json"}},
  {"method":"POST","path":"/api/trust/levels/action/reset","user":"owner","body":{}},
  {"method":"GET","path":"/api/trust/levels","user":"owner"}
 ]})).await;
}
#[tokio::test]
async fn concurrent_worker_jobs_serialize_and_shutdown_is_shared() {
    let worker = TrustWorker::new(None, NonZeroU16::new(64).unwrap()).unwrap();
    let mut jobs = vec![];
    for _ in 0..30 {
        let worker = worker.clone();
        jobs.push(tokio::spawn(async move {
            worker.approve("shared".into()).await.unwrap()
        }));
    }
    for job in jobs {
        job.await.unwrap();
    }
    let state = worker.get("shared".into()).await.unwrap();
    assert_eq!(state.approved_count, 30);
    assert_eq!(state.current_level, 3);
    let clone = worker.clone();
    let (a, b) = tokio::join!(worker.shutdown(), clone.shutdown());
    a.unwrap();
    b.unwrap();
    assert!(matches!(
        clone.reset("closed".into()).await,
        Err(jait_gateway::db::worker::DatabaseError::Closed)
    ));
}
