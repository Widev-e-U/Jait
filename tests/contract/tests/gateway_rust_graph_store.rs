#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::{
    contracts::ecmascript_json::JsonDocument,
    services::code_graph::{
        engine::GraphError,
        runner::RunResult,
        service::{Build, CodeGraphService, Revision},
    },
};
use rusqlite::{Connection, types::ValueRef};
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}
const SCHEMA: &str = "CREATE TABLE code_graph_indexes (id TEXT PRIMARY KEY,user_id TEXT,repository_id TEXT,project_root TEXT NOT NULL,provider TEXT NOT NULL DEFAULT 'graphify',status TEXT NOT NULL DEFAULT 'missing',graph_path TEXT,graph_version TEXT,source_revision TEXT,graphify_version TEXT,stats TEXT,graphrag_status TEXT NOT NULL DEFAULT 'not-prepared',graphrag_path TEXT,error TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);CREATE UNIQUE INDEX idx_code_graph_indexes_user_project ON code_graph_indexes(user_id,project_root)";
fn js(value: &Value) -> String {
    JsonDocument::parse(&value.to_string()).unwrap().stringify()
}
fn normalize(value: Value, work: &str, ids: &HashMap<String, String>) -> Value {
    match value {
        Value::String(s) => json!(ids.get(&s).unwrap_or(&s).replace(work, "$WORK")),
        Value::Array(a) => Value::Array(a.into_iter().map(|v| normalize(v, work, ids)).collect()),
        Value::Object(o) => Value::Object(
            o.into_iter()
                .map(|(k, v)| (k, normalize(v, work, ids)))
                .collect(),
        ),
        v => v,
    }
}
async fn native(call: &Value, work: &Path) -> Value {
    std::fs::create_dir_all(work).unwrap();
    let db = Arc::new(Mutex::new(Connection::open_in_memory().unwrap()));
    db.lock().unwrap().execute_batch(SCHEMA).unwrap();
    let builds = Arc::new(Mutex::new(vec![]));
    let log = builds.clone();
    let fixture = call.clone();
    let count = Arc::new(Mutex::new(0usize));
    let build: Build = Arc::new(move |p| {
        log.lock().unwrap().push(json!({"projectRoot":p.project_root,"outputDir":p.output_dir,"aborted":p.signal.as_ref().map(|s|s.is_cancelled())}));
        let i = {
            let mut i = count.lock().unwrap();
            let old = *i;
            *i += 1;
            old
        };
        let outcome = fixture["builds"][i].clone();
        let graph = fixture.get("graph").cloned().unwrap_or(json!({}));
        Box::pin(async move {
            if let Some(delay) = outcome["delay"].as_u64() {
                tokio::time::sleep(std::time::Duration::from_millis(delay)).await;
            }
            if let Some(error) = outcome["error"].as_str() {
                return Err(GraphError::error(error));
            }
            let path = Path::new(&p.output_dir).join("graphify-out/graph.json");
            if outcome["missing"] != true {
                tokio::fs::create_dir_all(path.parent().unwrap())
                    .await
                    .unwrap();
                let content = outcome["content"]
                    .as_str()
                    .map(str::to_owned)
                    .unwrap_or_else(|| js(outcome.get("graph").unwrap_or(&graph)));
                let content = outcome["bytes"]
                    .as_array()
                    .map(|bytes| {
                        bytes
                            .iter()
                            .map(|v| v.as_u64().unwrap() as u8)
                            .collect::<Vec<_>>()
                    })
                    .unwrap_or_else(|| content.into_bytes());
                tokio::fs::write(&path, content).await.unwrap();
            }
            Ok(RunResult {
                graph_path: path.to_str().unwrap().into(),
                version: Some(
                    outcome["version"]
                        .as_str()
                        .unwrap_or("graphify fixture")
                        .into(),
                ),
                stdout: String::new(),
                stderr: String::new(),
            })
        })
    });
    let revision = call["revision"].as_str().map(str::to_owned);
    let revision: Revision = Arc::new(move |_| {
        let revision = revision.clone();
        Box::pin(async move { revision })
    });
    let mut service = CodeGraphService::new(
        db.clone(),
        work.join("data").to_str().unwrap().into(),
        std::env::var("HOME").unwrap_or_default(),
        build,
        revision,
    );
    service.clock = Arc::new(|| 1790000000123);
    let service = Arc::new(service);
    let project = call["project"]
        .as_str()
        .map(str::to_owned)
        .unwrap_or_else(|| work.join("project").to_str().unwrap().to_owned());
    let mut steps = vec![];
    for action in call["actions"].as_array().unwrap() {
        let p = &action["params"];
        let project = action["projectRoot"].as_str().unwrap_or(&project);
        let user = action["user"].as_str();
        let repository = action["repository"].as_str().map(str::to_owned);
        let step: Result<Value, GraphError> = async {
            match action["op"].as_str().unwrap() {
                "get" => service.get_index(project, user),
                "index" => {
                    service
                        .index(project, user.map(str::to_owned), repository, None)
                        .await
                }
                "parallel" => {
                    let (a, b) = tokio::join!(
                        service.index(project, user.map(str::to_owned), repository.clone(), None),
                        service.index(project, user.map(str::to_owned), repository, None)
                    );
                    Ok(json!([a?, b?]))
                }
                "snapshot" => {
                    service
                        .snapshot(project, user, p["maxNodes"].as_f64())
                        .await
                }
                "query" => service.query(project, user, p).await,
                "path" => {
                    service
                        .shortest_path(
                            project,
                            user,
                            p["source"].as_str().unwrap(),
                            p["target"].as_str().unwrap(),
                            p["maxDepth"].as_f64(),
                        )
                        .await
                }
                "prepare" => service.prepare_graph_rag(project, user).await,
                "sql" => {
                    db.lock()
                        .unwrap()
                        .execute_batch(action["sql"].as_str().unwrap())
                        .unwrap();
                    Ok(json!({"executed":true}))
                }
                "overwrite" => {
                    let index = service.get_index(project, user)?;
                    tokio::fs::write(
                        index["graphPath"].as_str().unwrap(),
                        action["content"].as_str().unwrap(),
                    )
                    .await
                    .unwrap();
                    Ok(json!({"written":true}))
                }
                _ => panic!("unknown action"),
            }
        }
        .await;
        steps.push(step.unwrap_or_else(|e| json!({"error":e.message})));
    }
    let db = db.lock().unwrap();
    let mut query = db
        .prepare("SELECT * FROM code_graph_indexes ORDER BY rowid")
        .unwrap();
    let names: Vec<_> = query
        .column_names()
        .into_iter()
        .map(str::to_owned)
        .collect();
    let rows: Vec<Value> = query
        .query_map([], |row| {
            let mut out = serde_json::Map::new();
            for (i, name) in names.iter().enumerate() {
                out.insert(
                    name.clone(),
                    match row.get_ref(i)? {
                        ValueRef::Null => Value::Null,
                        ValueRef::Text(s) => json!(String::from_utf8_lossy(s)),
                        _ => panic!("nontext"),
                    },
                );
            }
            Ok(Value::Object(out))
        })
        .unwrap()
        .collect::<Result<_, _>>()
        .unwrap();
    let ids: HashMap<_, _> = rows
        .iter()
        .map(|r| {
            (
                r["id"].as_str().unwrap().to_owned(),
                format!(
                    "$INDEX:{}:{}",
                    r["user_id"].as_str().unwrap_or("null"),
                    r["project_root"].as_str().unwrap()
                ),
            )
        })
        .collect();
    let mut exports = vec![];
    for row in &rows {
        if let Some(path) = row["graphrag_path"].as_str() {
            let manifest: Value = serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap();
            exports.push(json!({"entities":std::fs::read_to_string(manifest["entitiesPath"].as_str().unwrap()).unwrap(),"relationships":std::fs::read_to_string(manifest["relationshipsPath"].as_str().unwrap()).unwrap(),"textUnits":std::fs::read_to_string(manifest["textUnitsPath"].as_str().unwrap()).unwrap(),"manifest":manifest}));
        }
    }
    let out = normalize(
        json!({"steps":steps,"rows":rows,"builds":*builds.lock().unwrap(),"exports":exports}),
        work.to_str().unwrap(),
        &ids,
    );
    serde_json::from_str(&js(&out)).unwrap()
}
fn graph() -> Value {
    json!({"nodes":[{"id":"a","label":"Auth","source_file":"a.ts","line":1},{"id":"b","label":"Database","source_file":"b.ts","line":2},{"id":"c","label":"Cache"}],"links":[{"source":"a","target":"b","relation":"calls","confidence":"EXTRACTED","source_file":"a.ts","line":10},{"source":"b","target":"c","relation":"uses","confidence":"INFERRED"}]})
}
async fn compare(mut call: Value) {
    let base = root()
        .join(".jait/artifacts/gateway-rust/code-graph/lifecycle")
        .join(uuid::Uuid::new_v4().to_string());
    call["project"] = json!(base.join("project"));
    let mut request = call.clone();
    request["op"] = json!("nativegraphstore.lifecycle");
    request["workspace"] = json!(base.join("reference"));
    let expected = internal_driver::call(
        &root(),
        &base.join("driver"),
        json!({"version":1,"calls":[request]}),
        &|| false,
    )
    .unwrap()[0]
        .clone();
    let result = native(&call, &base.join("native")).await;
    if result != expected {
        std::fs::create_dir_all(&base).unwrap();
        std::fs::write(
            base.join("native.json"),
            serde_json::to_string_pretty(&result).unwrap(),
        )
        .unwrap();
        std::fs::write(
            base.join("reference.json"),
            serde_json::to_string_pretty(&expected).unwrap(),
        )
        .unwrap();
        panic!("Lifecycle mismatch; full results: {}", base.display());
    }
}
#[tokio::test]
async fn indexing_snapshots_queries_paths_and_graphrag_export_match_actual_service() {
    compare(json!({"graph":graph(),"revision":"head:dirty","actions":[
        {"op":"get","user":"alice"},{"op":"index","user":"alice","repository":"repo-a"},
        {"op":"snapshot","user":"alice","params":{"maxNodes":2}},
        {"op":"query","user":"alice","params":{"query":"Auth Database"}},
        {"op":"path","user":"alice","params":{"source":"Auth","target":"Cache"}},
        {"op":"prepare","user":"alice"},{"op":"get","user":"alice"}
    ]}))
    .await;
}
#[tokio::test]
async fn ownership_missing_indices_and_parallel_build_deduplication_match_reference() {
    compare(json!({"graph":graph(),"builds":[{"delay":10}],"actions":[
        {"op":"get"},{"op":"snapshot"},{"op":"prepare"},{"op":"query","params":{"query":" "}},
        {"op":"parallel","user":"alice"},{"op":"get","user":"bob"},{"op":"snapshot","user":"bob"},
        {"op":"index","user":"bob","repository":"b"},{"op":"get","user":"alice"},{"op":"index"},
        {"op":"get","user":""}
    ]}))
    .await;
}
#[tokio::test]
async fn failed_build_preserves_prior_evidence_and_retry_resets_export_state() {
    compare(json!({"graph":graph(),"builds":[{},{"error":"extractor refused"},{}],"actions":[
        {"op":"index","user":"alice","repository":"repo-a"},{"op":"prepare","user":"alice"},
        {"op":"index","user":"alice","repository":null},{"op":"get","user":"alice"},{"op":"snapshot","user":"alice"},
        {"op":"index","user":"alice"},{"op":"get","user":"alice"},{"op":"snapshot","user":"alice"}
    ]})).await;
}
#[tokio::test]
async fn missing_extractor_output_and_project_root_guards_match_reference() {
    compare(json!({"builds":[{"missing":true}],"actions":[
        {"op":"get","projectRoot":" "},{"op":"get","projectRoot":"relative/repo"},
        {"op":"get","projectRoot":"/"},{"op":"index","user":"alice"},{"op":"get","user":"alice"}
    ]}))
    .await;
}

#[tokio::test]
async fn malformed_graph_documents_record_reference_diagnostics_and_allow_retry() {
    for content in [
        "{",
        "{nope}",
        "[1,]",
        "{\"a\":}",
        "true false",
        "{\"nodes\":[]}",
    ] {
        compare(
            json!({"builds":[{"content":content},{}],"graph":graph(),"actions":[
                {"op":"index","user":"alice"},{"op":"get","user":"alice"},
                {"op":"index","user":"alice"},{"op":"snapshot","user":"alice"}
            ]}),
        )
        .await;
    }
}

#[tokio::test]
async fn invalid_utf8_is_decoded_before_content_hashing_like_node_readfile() {
    let mut bytes = b"{\"nodes\":[{\"id\":\"".to_vec();
    bytes.push(255);
    bytes.extend_from_slice(b"\"}]}");
    compare(json!({"builds":[{"bytes":bytes}],"actions":[{"op":"index","user":"alice"},{"op":"snapshot","user":"alice"}]})).await;
}
#[tokio::test]
async fn sqlite_write_failure_records_error_and_subsequent_retry_is_possible() {
    compare(json!({"graph":graph(),"actions":[
        {"op":"index","user":"alice"},
        {"op":"sql","sql":"CREATE TRIGGER deny_ready BEFORE UPDATE ON code_graph_indexes WHEN NEW.status='ready' BEGIN SELECT RAISE(ABORT,'write refused'); END"},
        {"op":"index","user":"alice"},{"op":"get","user":"alice"},
        {"op":"sql","sql":"DROP TRIGGER deny_ready"},{"op":"index","user":"alice"},{"op":"snapshot","user":"alice"}
    ]})).await;
}
