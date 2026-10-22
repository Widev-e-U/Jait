#[path = "../src/internal_driver.rs"]
mod internal_driver;
use futures_util::future::BoxFuture;
use jait_gateway::{
    Gateway,
    config::GatewayConfig,
    db,
    db::worker::DatabaseWorker,
    health::HealthState,
    providers::registry::{ProviderAdapter, ProviderRegistry},
    routes::{
        auth::AuthState,
        environment::{EnvironmentControlPlane, EnvironmentRoutes},
    },
    security::http_auth::{self, AuthUser},
};
use serde_json::{Value, json};
use std::{
    num::NonZeroU16,
    path::PathBuf,
    sync::{Arc, Mutex},
    time::Duration,
};
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}
struct Provider {
    id: String,
    owner: Option<String>,
    info: Arc<Mutex<Value>>,
    script: Value,
    events: Arc<Mutex<Vec<Value>>>,
}
impl ProviderAdapter for Provider {
    fn id(&self) -> &str {
        &self.id
    }
    fn owner_user_id(&self) -> Option<&str> {
        self.owner.as_deref()
    }
    fn info(&self) -> Value {
        self.info.lock().unwrap().clone()
    }
    fn check_availability(&self) -> BoxFuture<'static, Result<(), String>> {
        self.events
            .lock()
            .unwrap()
            .push(json!({"op":"check","id":self.id}));
        let script = self.script.clone();
        let info = self.info.clone();
        Box::pin(async move {
            if let Some(error) = script["error"].as_str() {
                return Err(error.into());
            }
            if let Some(after) = script["after"].as_object() {
                let mut info = info.lock().unwrap();
                for (k, v) in after {
                    info[k] = v.clone();
                }
            }
            Ok(())
        })
    }
}
struct Nodes {
    nodes: Vec<Value>,
    fs_nodes: Vec<Value>,
    events: Arc<Mutex<Vec<Value>>>,
}
impl EnvironmentControlPlane for Nodes {
    fn nodes(&self) -> Result<Vec<Value>, String> {
        self.events.lock().unwrap().push(json!({"op":"nodes"}));
        Ok(self.nodes.clone())
    }
    fn filesystem_nodes(&self) -> Result<Vec<Value>, String> {
        self.events.lock().unwrap().push(json!({"op":"fsNodes"}));
        Ok(self.fs_nodes.clone())
    }
}
async fn compare(mut call: Value) {
    let root = root();
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64;
    call["now"] = json!(now);
    call["op"] = json!("nativeenvironmenthttp.routes");
    let dir = root
        .join(".jait/artifacts/gateway-rust/environment-http")
        .join(uuid::Uuid::new_v4().to_string());
    std::fs::create_dir_all(&dir).unwrap();
    let expected = internal_driver::call(
        &root,
        &dir,
        json!({"version":1,"calls":[call.clone()]}),
        &|| false,
    )
    .unwrap()[0]
        .clone();
    let path = dir.join("state.sqlite");
    let connection = db::open_database(&path).unwrap();
    db::migrate_database(&connection).unwrap();
    connection.execute_batch("INSERT INTO users(id,username,password_hash,created_at,updated_at)VALUES('owner','alice','fixture','old','old'),('other','bob','fixture','old','old')").unwrap();
    if let Some(seed) = call["seed"].as_str() {
        connection.execute_batch(seed).unwrap();
    }
    let auth = AuthState::new(connection, "environment-http-fixture".into()).unwrap();
    let worker = DatabaseWorker::new(
        db::open_database(&path).unwrap(),
        NonZeroU16::new(64).unwrap(),
    )
    .unwrap();
    let events = Arc::new(Mutex::new(vec![]));
    let providers = ProviderRegistry::default();
    for p in call["providers"].as_array().into_iter().flatten() {
        providers.register(Arc::new(Provider {
            id: p["info"]["id"].as_str().unwrap().into(),
            owner: p["owner"].as_str().map(str::to_owned),
            info: Arc::new(Mutex::new(p["info"].clone())),
            script: p.clone(),
            events: events.clone(),
        }));
    }
    let routes = EnvironmentRoutes {
        auth: auth.clone(),
        clock: Arc::new(move || now),
        assistants: (call["noAssistants"] != true).then(|| worker.clone()),
        projects: (call["noProjects"] != true).then(|| worker.clone()),
        repositories: (call["noRepositories"] != true).then(|| worker.clone()),
        network_hosts: (call["noNetwork"] != true).then(|| worker.clone()),
        providers: (call["noProviders"] != true).then_some(providers),
        nodes: (call["noNodes"] != true).then(|| {
            Arc::new(Nodes {
                nodes: call["nodes"].as_array().cloned().unwrap_or_default(),
                fs_nodes: call["fsNodes"].as_array().cloned().unwrap_or_default(),
                events: events.clone(),
            }) as Arc<dyn EnvironmentControlPlane>
        }),
    };
    let gateway = Gateway::bind_authenticated(
        GatewayConfig {
            address: "127.0.0.1:0".parse().unwrap(),
        },
        HealthState::default(),
        auth.clone(),
    )
    .await
    .unwrap()
    .with_environment(routes);
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
    for step in call["steps"].as_array().unwrap() {
        if let Some(sql) = step["sql"].as_str() {
            let sql = sql.to_string();
            worker
                .run(move |db| Ok(db.execute_batch(&sql)?))
                .await
                .unwrap();
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
        if let Some(user) = step["user"].as_str().or(step["cookie"].as_str()) {
            let token = http_auth::sign_auth_token(
                &AuthUser {
                    id: user.into(),
                    username: if user == "owner" { "alice" } else { "bob" }.into(),
                },
                "environment-http-fixture",
            )
            .unwrap();
            request = if step["cookie"].is_string() {
                request.header("cookie", format!("jait_token={token}"))
            } else {
                request.bearer_auth(token)
            };
        }
        let response = request.send().await.unwrap();
        let status = response.status().as_u16();
        let content_type = response
            .headers()
            .get("content-type")
            .map(|v| v.to_str().unwrap().to_string());
        let raw = response.text().await.unwrap();
        let body = if step["exactRaw"] == true {
            json!(raw.encode_utf16().collect::<Vec<_>>())
        } else {
            serde_json::from_str::<Value>(&raw).unwrap_or(json!(raw))
        };
        results.push(json!({"status":status,"body":body,"contentType":content_type}));
    }
    send.send(()).unwrap();
    task.await.unwrap().unwrap();
    auth.shutdown().await.unwrap();
    worker.shutdown().await.unwrap();
    let actual = json!({"results":results,"events":*events.lock().unwrap()});
    std::fs::write(
        dir.join("native.json"),
        serde_json::to_vec_pretty(&actual).unwrap(),
    )
    .unwrap();
    std::fs::write(
        dir.join("reference.json"),
        serde_json::to_vec_pretty(&expected).unwrap(),
    )
    .unwrap();
    for (i, (a, e)) in actual["results"]
        .as_array()
        .unwrap()
        .iter()
        .zip(expected["results"].as_array().unwrap())
        .enumerate()
    {
        assert_eq!(
            a,
            e,
            "environment HTTP parity response {i}; evidence {}",
            dir.display()
        );
    }
    assert_eq!(
        actual,
        expected,
        "environment HTTP parity; evidence {}",
        dir.display()
    );
}
const SEED: &str = r#"
INSERT INTO assistant_profiles(id,user_id,name,enabled_skills,enabled_plugins,is_default,created_at,updated_at)
VALUES('a','owner','Fixture','["scan","code"]','[]',1,'old','new'),('b','other','Other','[]','[]',1,'old','new');
INSERT INTO projects(id,user_id,title,root_path,node_id,status,created_at,last_active_at)
VALUES('p1','owner','One','/fixture/one',NULL,'active','old','new'),
('p2','owner','Archived','/fixture/two',NULL,'archived','old','old'),
('p3','other','Other','/fixture/three','remote','active','old','now');
INSERT INTO sessions(id,user_id,project_id,status,created_at,last_active_at)
VALUES('s1','owner','p1','active','old','now'),('s2','owner','p1','archived','old','now'),('s3','other','p1','active','old','now');
INSERT INTO automation_repositories(id,user_id,name,local_path,device_id,created_at,updated_at)
VALUES('r1','owner','Local','/fixture/local',NULL,'old','new'),
('r2','owner','Connected','/fixture/remote','remote','old','now'),
('r3','owner','Offline','/fixture/offline','offline','old','later'),
('r4','other','Other','/fixture/other',NULL,'old','new');
INSERT INTO network_hosts(ip,mac,hostname,open_ports,ssh_reachable,agent_status,providers,first_seen_at,last_seen_at,scanned_at)
VALUES('192.0.2.1',NULL,'fixture','[22,443]',1,'online','["fixture"]','old','new','new'),
('192.0.2.2',NULL,NULL,'[]',2,'offline',NULL,'old','old','old');
"#;
#[tokio::test]
async fn real_repositories_ownership_active_counts_nodes_and_provider_lifecycle() {
    compare(json!({"seed":SEED,"nodes":[{"id":"remote","name":"Remote","platform":"linux","role":"node","lifecycle":"ready"},{"id":"offline","name":"Offline","platform":"windows","role":"node","lifecycle":"offline"}],"fsNodes":[{"id":"remote","name":"First"},{"id":"remote","name":"Last"}],
 "providers":[{"info":{"id":"fixture","name":"Fixture","available":false},"after":{"available":true}},{"owner":"other","info":{"id":"other","name":"Other provider","available":false,"unavailableReason":"fixture reason"},"error":"fixture check failed"}],
 "steps":[{"method":"GET","path":"/api/environment/snapshot"},{"method":"GET","path":"/api/environment/snapshot","user":"missing"},{"method":"GET","path":"/api/environment/snapshot","user":"owner"},{"method":"GET","path":"/api/environment/snapshot","cookie":"other"},{"method":"HEAD","path":"/api/environment/snapshot","user":"owner"}]})).await;
}
#[tokio::test]
async fn optional_dependencies_empty_and_populated() {
    for flag in [
        "noAssistants",
        "noProjects",
        "noRepositories",
        "noNetwork",
        "noProviders",
        "noNodes",
    ] {
        let mut call = json!({"seed":SEED,"steps":[{"method":"GET","path":"/api/environment/snapshot","cookie":"owner"}]});
        call[flag] = json!(true);
        compare(call).await;
    }
    compare(json!({"noAssistants":true,"noProjects":true,"noRepositories":true,"noNetwork":true,"noProviders":true,"noNodes":true,"steps":[{"method":"GET","path":"/api/environment/snapshot","user":"owner"}]})).await;
}
#[tokio::test]
async fn missing_tables_and_corrupted_host_json_fail_without_partial_snapshots() {
    for table in [
        "assistant_profiles",
        "projects",
        "automation_repositories",
        "network_hosts",
    ] {
        compare(json!({"steps":[{"sql":format!("DROP TABLE {table};")},{"method":"GET","path":"/api/environment/snapshot","user":"owner"}]})).await;
    }
    for sql in [
        "UPDATE network_hosts SET open_ports='broken';",
        "UPDATE network_hosts SET providers='{';",
    ] {
        compare(json!({"seed":SEED,"steps":[{"sql":sql},{"method":"GET","path":"/api/environment/snapshot","user":"owner"}]})).await;
    }
}

#[test]
fn stored_json_diagnostics_match_real_bun_parser_without_recursive_traversal() {
    let root = root();
    let invalid = [
        "broken",
        "{",
        "[",
        "",
        " ",
        "tru",
        "falsex",
        "nullx",
        "undefined",
        "NaN",
        "Infinity",
        "[1,]",
        "{\"a\":}",
        "{\"a\":1,}",
        "{x:1}",
        "01",
        "1.",
        "1e",
        "-",
        "+1",
        ".1",
        "[1 2]",
        "{}x",
        "\"bad\\x\"",
        "\"bad\n\"",
        "\"\\u12\"",
        "true false",
        "[1",
        "[1,",
        "[x]",
        "{\"a\"",
        "{\"a\":",
        "{\"a\",1}",
        "{\"a\":1",
        "{\"a\":1,",
        "{\"a\" 1}",
        "{\"a\":01}",
        "{\"a\":1e}",
        "[1e]",
        "[1.]",
        "[01]",
        "-x",
        "--1",
        "foo.bar",
        "foo-bar",
        "foo$bar",
        "trueX",
        "null0",
        "tRue",
        "[true false]",
        "[1,,2]",
        "{,}",
        "{1:2}",
    ];
    let mut inputs = invalid.iter().map(|s| s.to_string()).collect::<Vec<_>>();
    inputs.extend((0u8..=127).map(|c| char::from(c).to_string()));
    for c in 0u8..=127 {
        let s = char::from(c);
        inputs.extend([
            format!("[{s}]"),
            format!("{{{s}}}"),
            format!("{{\"x\":{s}}}"),
            format!("1{s}"),
            format!("[1{s}]"),
            format!("{{\"x\":0{s}}}"),
        ]);
    }
    inputs.extend(
        [
            "null",
            "true",
            "false",
            "0",
            "-0",
            "1e400",
            "[]",
            "{}",
            "\"\\ud800\"",
            "{\"1\":2,\"x\":3}",
            "\u{feff}[]",
        ]
        .map(str::to_owned),
    );
    inputs.extend(
        [
            "🦀", "{🦀}", "[🦀]", "π", "é", "生", "∑", "\u{00a0}", "\u{0085}", "\u{feff}", "1🦀",
        ]
        .map(str::to_owned),
    );
    println!("Compared {} JSON diagnostic inputs", inputs.len());
    let mut differences = vec![];
    for batch in inputs.chunks(64) {
        let expected = internal_driver::call(
            &root,
            &root
                .join(".jait/artifacts/gateway-rust/environment-http/json-diagnostics")
                .join(uuid::Uuid::new_v4().to_string()),
            json!({"version":1,"calls":[{"op":"nativeenvironmenthttp.jsonparse","inputs":batch}]}),
            &|| false,
        )
        .unwrap()[0]
            .clone();
        for (input, expected) in batch.iter().zip(expected.as_array().unwrap()) {
            let actual = jait_gateway::contracts::json_diagnostic::parse(input)
                .err()
                .map(|e| e.0.0);
            if json!(actual) != *expected {
                differences.push((input.clone(), actual, expected.clone()));
            }
        }
    }
    assert!(
        differences.is_empty(),
        "{} JSON diagnostic differences: {:?}",
        differences.len(),
        &differences[..differences.len().min(40)]
    );
    let deep = format!("{}broken", "[".repeat(20000));
    assert!(jait_gateway::contracts::json_diagnostic::parse(&deep).is_err());
}

#[tokio::test]
async fn stored_json_preserves_utf16_number_semantics_and_non_bmp_error_messages_over_http() {
    for data in [
        r#"["\ud800",9007199254740993,1e400,-0,{"2":"x","1":"y","__proto__":{}}]"#.to_owned(),
        format!("{}0{}", "[".repeat(500), "]".repeat(500)),
    ] {
        let sql = format!(
            "UPDATE network_hosts SET providers='{}';",
            data.replace('\'', "''")
        );
        compare(json!({"seed":SEED,"noAssistants":true,"noProjects":true,"noRepositories":true,"noProviders":true,"noNodes":true,"steps":[
         {"sql":sql},{"method":"GET","path":"/api/environment/snapshot","user":"owner","exactRaw":true},
         {"sql":"UPDATE network_hosts SET open_ports='🦀';"},{"method":"GET","path":"/api/environment/snapshot","user":"owner","exactRaw":true}
        ]})).await;
    }
}
