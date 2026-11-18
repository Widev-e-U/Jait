use base64::Engine;
#[path = "../src/internal_driver.rs"]
mod internal_driver;
use futures_util::future::BoxFuture;
use jait_gateway::{
    contracts::lenient_base64::decode_lenient_base64,
    surfaces::{
        filesystem::{FileReply, FileSystemError, FileSystemResult},
        registry::{Surface, SurfaceStartInput},
        remote_filesystem::{
            RemoteFileSystemSurface, RemoteFileSystemSurfaceFactory, RemoteFsTransport,
            RemoteOperation as Op,
        },
    },
};
use serde_json::{Map, Value, json};
use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
};
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}
fn reference(call: Value) -> Value {
    internal_driver::call(
        &root(),
        &root()
            .join(".jait/artifacts/gateway-rust/remote-filesystem")
            .join(uuid::Uuid::new_v4().to_string()),
        json!({"version":1,"calls":[call]}),
        &|| false,
    )
    .unwrap()[0]
        .clone()
}
struct Port {
    step: Arc<Mutex<Value>>,
    events: Arc<Mutex<Vec<Value>>>,
    files: Arc<Mutex<Map<String, Value>>>,
}
impl RemoteFsTransport for Port {
    fn request<'a>(
        &'a self,
        node: &'a str,
        operation: &'a str,
        input: Value,
    ) -> BoxFuture<'a, FileSystemResult<Value>> {
        Box::pin(async move {
            self.events
                .lock()
                .unwrap()
                .push(json!({"node":node,"operation":operation,"input":input}));
            let step = self.step.lock().unwrap().clone();
            if step["fail"] == operation {
                return Err(if let Some(v) = step.get("thrown") {
                    FileSystemError::thrown(v.clone())
                } else {
                    FileSystemError::message(step["error"].as_str().unwrap_or("RPC failure"))
                });
            }
            if let Some(v) = step.get("reply") {
                return Ok(v.clone());
            }
            let path = input["path"].as_str().unwrap_or("");
            let mut files = self.files.lock().unwrap();
            Ok(match operation {
                "read" => {
                    json!({"content":files.get(path).ok_or_else(||FileSystemError::message("File missing"))?})
                }
                "readBinary" => {
                    let text = if let Some(encoded) = step["encoded"].as_str() {
                        encoded.to_string()
                    } else {
                        base64::engine::general_purpose::STANDARD.encode(
                            files
                                .get(path)
                                .and_then(Value::as_str)
                                .ok_or_else(|| FileSystemError::message("File missing"))?
                                .as_bytes(),
                        )
                    };
                    json!({"content":text})
                }
                "write" => {
                    files.insert(path.into(), input["content"].clone());
                    json!({"ok":true})
                }
                "exists" => json!(files.contains_key(path)),
                "list" => json!(["second", "first/"]),
                "stat" => {
                    json!({"size":7,"isDirectory":false,"modified":"2026-01-02T03:04:05.000Z"})
                }
                _ => panic!("unsupported fixture RPC"),
            })
        })
    }
}
fn packed(result: FileSystemResult<FileReply>) -> Value {
    match result {
        Err(e) => json!({"error":e.details}),
        Ok(FileReply::Undefined) => json!({"undefined":true}),
        Ok(FileReply::Value(v)) => json!({"value":v}),
        Ok(FileReply::Bytes(v)) => json!({"buffer":v}),
    }
}
async fn native(test: &Value) -> Value {
    let step = Arc::new(Mutex::new(Value::Null));
    let events = Arc::new(Mutex::new(vec![]));
    let files = Arc::new(Mutex::new(
        test["files"].as_object().cloned().unwrap_or_default(),
    ));
    let port = Arc::new(Port {
        step: step.clone(),
        events: events.clone(),
        files: files.clone(),
    });
    let surface = if test["factory"] == true {
        RemoteFileSystemSurfaceFactory::new(port).create_remote("remote-fixture")
    } else {
        RemoteFileSystemSurface::new("remote-fixture", port)
    }
    .with_clock(Arc::new(|| jait_gateway::time::iso(1790000000000).unwrap()));
    let log = events.clone();
    let current = step.clone();
    surface.on_output(Some(Arc::new(move |data| {
        log.lock().unwrap().push(json!({"output":data}));
        if let Some(e) = current.lock().unwrap()["outputError"].as_str() {
            return Err(FileSystemError::message(e));
        }
        Ok(())
    })));
    let log = events.clone();
    let current = step.clone();
    surface.on_state_change(Some(Arc::new(move |state| {
        log.lock().unwrap().push(json!({"state":state}));
        if let Some(e) = current.lock().unwrap()["stateError"].as_str() {
            return Err(FileSystemError::message(e));
        }
        Ok(())
    })));
    let mut outcomes = vec![];
    for s in test["ops"].as_array().unwrap() {
        *step.lock().unwrap() = s.clone();
        let name = s["op"].as_str().unwrap();
        let path = s["path"].as_str().unwrap_or("").to_string();
        let text = |k: &str| s[k].as_str().unwrap_or("").to_string();
        let direct = match name {
            "start" => {
                let mut input = json!({"sessionId":"fixture-session","projectRoot":"E:\\Project","nodeId":"fixture-node"});
                if let Some(fields) = s["input"].as_object() {
                    for (k, v) in fields {
                        input[k] = v.clone();
                    }
                }
                Some(
                    surface
                        .start_remote(serde_json::from_value::<SurfaceStartInput>(input).unwrap())
                        .map(|_| FileReply::Undefined),
                )
            }
            "stop" => Some(surface.stop_remote().map(|_| FileReply::Undefined)),
            "snapshot" => Some(Ok(FileReply::Value(
                serde_json::to_value(surface.remote_snapshot()).unwrap(),
            ))),
            "state" => Some(Ok(FileReply::Value(
                json!({"id":surface.id(),"type":surface.kind(),"state":surface.state(),"sessionId":surface.session_id(),"nodeId":surface.node_id()}),
            ))),
            "allowed" => Some(Ok(FileReply::Value(json!(surface.is_path_allowed(&path))))),
            "hasBackup" => Some(Ok(FileReply::Value(json!(surface.has_backup(&path))))),
            "getBackup" => Some(Ok(match surface.backup(&path) {
                Some(v) => FileReply::Value(json!(v)),
                None => FileReply::Undefined,
            })),
            "clearBackup" => {
                surface.clear_backup(&path);
                Some(Ok(FileReply::Undefined))
            }
            _ => None,
        };
        let result = if let Some(v) = direct {
            v
        } else {
            let op = match name {
                "read" => Op::Read(path),
                "readBinary" => Op::ReadBinary(path),
                "write" => Op::Write {
                    path,
                    content: text("content"),
                },
                "patch" => Op::Patch {
                    path,
                    search: text("search"),
                    replace: text("replace"),
                },
                "exists" => Op::Exists(path),
                "list" => Op::List(path),
                "stat" => Op::Stat(path),
                "restore" => Op::Restore(path),
                "saveExternalBackup" => Op::SaveExternalBackup(path),
                _ => panic!("invalid fixture step"),
            };
            surface.execute(op).await
        };
        outcomes.push(packed(result));
    }
    json!({"outcomes":outcomes,"events":*events.lock().unwrap(),"files":*files.lock().unwrap()})
}
async fn compare(cases: Vec<Value>) {
    let expected = reference(json!({"op":"nativeremotefs.cases","cases":cases}));
    for (i, c) in cases.iter().enumerate() {
        let actual = native(c).await;
        for (j, (a, b)) in actual["outcomes"]
            .as_array()
            .unwrap()
            .iter()
            .zip(expected[i]["outcomes"].as_array().unwrap())
            .enumerate()
        {
            assert_eq!(a, b, "remote filesystem case {i} step {j}: {}", c["ops"][j]);
        }
        assert_eq!(actual, expected[i], "remote filesystem case {i}");
    }
}
#[tokio::test]
async fn facade_lifecycle_nested_counts_backups_and_restore_match_actual_source() {
    compare(vec![json!({"factory":true,"files":{"a":"hello 🦀 hello"},"ops":[
  {"op":"state"},{"op":"snapshot"},{"op":"read","path":"a"},{"op":"allowed","path":"E:/Project/a"},{"op":"getBackup","path":"a"},
  {"op":"start","input":{"panelOpen":false}},{"op":"snapshot"},{"op":"read","path":"a"},{"op":"readBinary","path":"a","encoded":"TQ=="},{"op":"exists","path":"missing"},{"op":"list","path":"E:\\Project"},{"op":"stat","path":"a"},
  {"op":"write","path":"a","content":"second"},{"op":"write","path":"a","content":"third"},{"op":"getBackup","path":"a"},{"op":"getBackup","path":"./a"},{"op":"hasBackup","path":"a"},{"op":"restore","path":"a"},{"op":"read","path":"a"},{"op":"restore","path":"a"},
  {"op":"patch","path":"a","search":"absent","replace":"bad"},{"op":"patch","path":"a","search":"hello","replace":"$$-$&-$`-$'"},{"op":"getBackup","path":"a"},{"op":"read","path":"a"},{"op":"restore","path":"a"},
  {"op":"patch","path":"a","search":"","replace":"prefix"},{"op":"clearBackup","path":"a"},{"op":"hasBackup","path":"a"},
  {"op":"write","path":"new","content":"new"},{"op":"getBackup","path":"new"},{"op":"restore","path":"new"},{"op":"exists","path":"new"},
  {"op":"saveExternalBackup","path":"a"},{"op":"write","path":"a","content":"changed"},{"op":"saveExternalBackup","path":"a"},{"op":"getBackup","path":"a"},{"op":"saveExternalBackup","path":"missing"},{"op":"restore","path":"missing"},
  {"op":"snapshot"},{"op":"stop"},{"op":"snapshot"},{"op":"allowed","path":"e:/project/a"},{"op":"start","input":{"nodeId":"next","panelOpen":"invalid"}},{"op":"getBackup","path":"a"},{"op":"state"},{"op":"snapshot"}
 ]})]).await;
}
#[tokio::test]
async fn failures_callbacks_and_null_backup_effect_order_match() {
    compare(vec![json!({"files":{"a":"old"},"ops":[{"op":"start"},{"op":"write","path":"a","content":"new","fail":"read"},{"op":"getBackup","path":"a"},{"op":"restore","path":"a"},{"op":"write","path":"a","content":"later","fail":"write"},{"op":"getBackup","path":"a"},{"op":"patch","path":"a","search":"new","replace":"X","fail":"read"},{"op":"exists","path":"a","fail":"exists","thrown":null},{"op":"list","path":"a","fail":"list","thrown":{"kind":"no"}},{"op":"stat","path":"a","fail":"stat"},{"op":"snapshot"}]}),
 json!({"files":{"a":"before"},"ops":[{"op":"start"},{"op":"write","path":"a","content":"after","outputError":"callback failed"},{"op":"getBackup","path":"a"},{"op":"restore","path":"a"},{"op":"snapshot"}]}),
 json!({"ops":[{"op":"start","stateError":"state failed"},{"op":"state"},{"op":"stop","stateError":"stop failed"},{"op":"snapshot"}]})]).await;
}
#[tokio::test]
async fn every_io_checks_running_and_node_before_rpc_or_counting() {
    let mut cases = vec![];
    for node in [Value::Null, json!("")] {
        let mut ops = vec![];
        for phase in 0..3 {
            if phase == 1 {
                ops.push(json!({"op":"start","input":{"nodeId":node}}));
            }
            if phase == 2 {
                ops.push(json!({"op":"stop"}));
            }
            for name in [
                "read",
                "readBinary",
                "write",
                "patch",
                "exists",
                "list",
                "stat",
                "restore",
                "saveExternalBackup",
            ] {
                ops.push(json!({"op":name,"path":"a","content":"bad","search":"a","replace":"b"}));
            }
            ops.push(json!({"op":"snapshot"}));
        }
        cases.push(json!({"ops":ops}));
    }
    compare(cases).await;
}
#[tokio::test]
async fn remote_prefix_hint_preserves_cross_platform_unicode_and_reference_limitations() {
    let mut cases = vec![];
    for root in ["E:\\Project", "/proj/", "/", "", "C:\\İSTANBUL", "🦀/Case"] {
        let mut ops = vec![json!({"op":"start","input":{"projectRoot":root}})];
        for path in [
            "e:/project/a",
            "E:\\Project-other",
            "/proj",
            "/proj/a",
            "/proj-other",
            "../outside",
            "C:/i\u{307}stanbul/a",
            "🦀/case/a",
        ] {
            ops.push(json!({"op":"allowed","path":path}));
        }
        cases.push(json!({"ops":ops}));
    }
    compare(cases).await;
}
#[test]
fn permissive_binary_decoder_matches_actual_buffer_over_ascii_unicode_and_random_strings() {
    let mut inputs: Vec<String> = [
        "",
        "TQ==",
        "TWE",
        "T",
        "TWFu",
        "-_8=",
        "TQ=AAAA",
        "T🦀Q",
        "Tő==",
        "TQĽAAAA",
        "\0T Q\n==",
    ]
    .into_iter()
    .map(str::to_string)
    .collect();
    for b in 0..128u8 {
        inputs.push(format!("T{}Q==", char::from(b)));
    }
    let mut seed = 0x5eed_u32;
    for n in 0..400 {
        let mut s = String::new();
        for _ in 0..n % 39 {
            seed = seed.wrapping_mul(1664525).wrapping_add(1013904223);
            s.push(char::from((seed >> 24) as u8));
        }
        inputs.push(s);
    }
    let expected = reference(json!({"op":"nativeremotefs.decode","inputs":inputs}));
    let actual: Vec<_> = inputs.iter().map(|s| decode_lenient_base64(s)).collect();
    assert_eq!(json!(actual), expected);
}
