#[path = "../src/internal_driver.rs"]
mod internal_driver;
use futures_util::future::BoxFuture;
use jait_gateway::{
    execution::command_timeout::TimeoutPolicy,
    runtime::blocking::BlockingLane,
    surfaces::filesystem::OutputCallback,
    tools::{core_io::HostError, filesystem_resolver::FileSystemResolver, remote_executor::*},
};
use serde_json::{Value, json};
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
fn failure(v: &Value) -> Result<(), HostError> {
    if let Some(s) = v["error"].as_str() {
        return Err(HostError::Error(s.into()));
    }
    if let Some(v) = v.get("thrown") {
        return Err(HostError::Thrown(v.clone()));
    }
    Ok(())
}
struct Control {
    test: Value,
    events: Arc<Mutex<Vec<Value>>>,
    callback: Option<OutputCallback>,
}
impl RemoteControlPlane for Control {
    fn find_node(&self, id: &str) -> Result<bool, HostError> {
        self.events
            .lock()
            .unwrap()
            .push(json!({"op":"find","id":id}));
        failure(&self.test["findFailure"])?;
        Ok(self.test["connected"] == true)
    }
    fn fs_nodes(&self) -> Result<Vec<FsNode>, HostError> {
        self.events.lock().unwrap().push(json!({"op":"nodes"}));
        failure(&self.test["nodesFailure"])?;
        Ok(self.test["nodes"]
            .as_array()
            .into_iter()
            .flatten()
            .map(|v| FsNode {
                id: v["id"].as_str().unwrap().into(),
                platform: v["platform"].as_str().map(str::to_string),
                is_gateway: v["isGateway"] == true,
            })
            .collect())
    }
    fn proxy<'a>(
        &'a self,
        node: &'a str,
        tool: &'a str,
        input: &'a Value,
        options: Value,
        callback: Option<OutputCallback>,
    ) -> BoxFuture<'a, Result<Value, HostError>> {
        let same_callback = match (&callback, &self.callback) {
            (Some(a), Some(b)) => Arc::ptr_eq(a, b),
            (None, None) => true,
            _ => false,
        };
        self.events.lock().unwrap().push(json!({"op":"proxy","node":node,"tool":tool,"input":input,"options":options,"sameCallback":same_callback}));
        Box::pin(async move {
            if let Some(chunk) = self.test["chunk"].as_str()
                && let Some(callback) = callback
            {
                callback(chunk).map_err(|e| HostError::Error(e.to_string()))?;
            }
            failure(&self.test["proxyFailure"])?;
            Ok(self.test.get("response").cloned().unwrap_or(json!({})))
        })
    }
}
async fn compare(cases: Vec<Value>) {
    for batch in cases.chunks(4) {
        let root = root();
        let expected = internal_driver::call(
            &root,
            &root.join(".jait/artifacts/gateway-rust/remote-executor/contracts"),
            json!({"version":1,"calls":[{"op":"nativeremoteexecutor.run","cases":batch}]}),
            &|| false,
        )
        .unwrap()[0]
            .clone();
        let mut actual = vec![];
        for test in batch {
            let events = Arc::new(Mutex::new(vec![]));
            let chunks = Arc::new(Mutex::new(vec![]));
            let callback: Option<OutputCallback> = if test["callback"] == true {
                let chunks = chunks.clone();
                Some(Arc::new(move |chunk| {
                    chunks.lock().unwrap().push(json!(chunk));
                    Ok(())
                }))
            } else {
                None
            };
            let context = Arc::new(RemoteContext {
                data: test.get("context").cloned().unwrap_or(json!({})),
                on_output_chunk: callback.clone(),
            });
            let context_id = Arc::as_ptr(&context) as usize;
            let ws = Arc::new(Control {
                test: test.clone(),
                events: events.clone(),
                callback: callback.clone(),
            });
            let local: LocalExecutor = {
                let test = test.clone();
                let events = events.clone();
                Arc::new(move |tool, input, ctx, opts| {
                    let same_callback = match (&ctx.on_output_chunk, &callback) {
                        (Some(a), Some(b)) => Arc::ptr_eq(a, b),
                        (None, None) => true,
                        _ => false,
                    };
                    let mut event = json!({"op":"local","tool":tool,"input":input,"context":ctx.data,"sameContext":ctx as *const _ as usize==context_id,"sameCallback":same_callback});
                    if let Some(v) = opts {
                        event["options"] = v.clone();
                    }
                    events.lock().unwrap().push(event);
                    let test = test.clone();
                    Box::pin(async move {
                        if let Some(chunk) = test["chunk"].as_str()
                            && let Some(callback) = &ctx.on_output_chunk
                        {
                            callback(chunk).map_err(|e| HostError::Error(e.to_string()))?;
                        }
                        failure(&test["localFailure"])?;
                        Ok(test.get("response").cloned().unwrap_or(json!({})))
                    })
                })
            };
            let policy = TimeoutPolicy::from_values(
                test["policy"]["default"].as_str(),
                test["policy"]["max"].as_str(),
            );
            let lane = BlockingLane::new(2.try_into().unwrap());
            let result = match test["kind"].as_str() {
                Some("timeout") => Ok(serde_json::from_str::<Value>(
                    &proxy_timeout_ms(test["tool"].as_str().unwrap(), &test["input"], &policy)
                        .to_string(),
                )
                .unwrap()),
                Some("resolve") => resolve_remote_node_for_session(
                    ws.as_ref(),
                    test["path"].as_str(),
                    test["projectNodeId"].as_str(),
                    &lane,
                )
                .await
                .map(|v| json!(v)),
                Some("target") => Ok::<Value, HostError>(resolve_call_node_target(
                    test["tool"].as_str().unwrap(),
                    &test["input"],
                )),
                _ => {
                    create_remote_tool_executor(
                        ws,
                        local,
                        test["node"].as_str().map(str::to_string),
                        FileSystemResolver::new(root.clone(), lane).unwrap(),
                        policy,
                    )
                    .execute(
                        test["tool"].as_str().unwrap(),
                        &test["input"],
                        &context,
                        test.get("options"),
                    )
                    .await
                }
            };
            let mut row =
                json!({"events":*events.lock().unwrap(),"chunks":*chunks.lock().unwrap()});
            match result {
                Ok(v) => row["result"] = v,
                Err(HostError::Error(s)) => row["thrown"] = json!({"error":s}),
                Err(HostError::Thrown(v)) => row["thrown"] = json!({"value":v}),
            };
            actual.push(row);
        }
        for (index, (a, e)) in actual.iter().zip(expected.as_array().unwrap()).enumerate() {
            assert_eq!(a, e, "case {:?}", batch[index]);
        }
    }
}
#[tokio::test]
async fn node_target_strips_node_id_pins_aliases_locally_and_rejects_gateway_only_tools() {
    let mut cases = vec![];
    for tool in [
        "execute",
        "terminal.run",
        "jait.terminal",
        "file.write",
        "os.query",
        "memory.search",
        "cron.add",
    ] {
        for input in [
            json!(null),
            json!("x"),
            json!([1, 2]),
            json!({}),
            json!({"nodeId": "device-windows", "command": "whoami"}),
            json!({"nodeId": "  device-windows  ", "command": "whoami"}),
            json!({"nodeId": "", "command": "whoami"}),
            json!({"nodeId": "   ", "command": "whoami"}),
            json!({"nodeId": 7, "command": "whoami"}),
            json!({"nodeId": "gateway", "command": "whoami"}),
            json!({"nodeId": "GATEWAY", "command": "whoami"}),
            json!({"nodeId": " Local ", "command": "whoami"}),
            json!({"nodeId": "this", "command": "whoami"}),
        ] {
            cases.push(json!({"kind":"target","tool":tool,"input":input}));
        }
    }
    compare(cases).await;
}
#[tokio::test]
async fn timeout_policy_is_finite_capped_and_background_requires_exact_true() {
    let mut cases = vec![];
    for tool in [
        "execute",
        "terminal.run",
        "jait.terminal",
        "file.write",
        "unknown",
    ] {
        for input in [
            json!(null),
            json!("x"),
            json!({}),
            json!({"timeout":0}),
            json!({"timeout":-1}),
            json!({"timeout":1.2}),
            json!({"timeout":"0x20"}),
            json!({"timeout":1e100}),
            json!({"isBackground":true,"timeout":999999}),
            json!({"isBackground":1,"timeout":50}),
        ] {
            for policy in [
                json!({}),
                json!({"default":"100","max":"200"}),
                json!({"default":"bad","max":"-1"}),
            ] {
                cases.push(json!({"kind":"timeout","tool":tool,"input":input,"policy":policy}));
            }
        }
    }
    compare(cases).await;
}
#[tokio::test]
async fn resolver_keeps_explicit_binding_exists_precedence_and_first_platform_match() {
    let mut cases = vec![];
    let nodes = json!([{"id":"gateway","isGateway":true},{"id":"linux","platform":"linux"},{"id":"win","platform":"windows"},{"id":"win2","platform":"windows"}]);
    for path in [
        None,
        Some(""),
        Some("/native/nonexistent/project"),
        Some("C:\\native\\project"),
        Some("c:/native/project"),
        Some("relative-project"),
    ] {
        for binding in [None, Some("gateway"), Some("explicit"), Some("")] {
            for connected in [true, false] {
                let mut row = json!({"kind":"resolve","connected":connected,"nodes":nodes});
                if let Some(v) = path {
                    row["path"] = json!(v);
                }
                if let Some(v) = binding {
                    row["projectNodeId"] = json!(v);
                }
                cases.push(row);
            }
        }
    }
    for binding in [None, Some("explicit")] {
        for connected in [true, false] {
            let mut row = json!({"kind":"resolve","path":root().to_string_lossy(),"nodes":nodes,"connected":connected});
            if let Some(v) = binding {
                row["projectNodeId"] = json!(v);
            }
            cases.push(row);
        }
    }
    cases.push(
        json!({"kind":"resolve","path":"C:/missing","nodes":[{"id":"linux","platform":"linux"}]}),
    );
    cases.push(json!({"kind":"resolve","path":"/missing","nodes":[]}));
    cases.push(json!({"kind":"resolve","projectNodeId":"explicit","findFailure":{"thrown":null}}));
    cases.push(json!({"kind":"resolve","path":"/missing","nodesFailure":{"error":"nodes failed"}}));
    compare(cases).await;
}
#[tokio::test]
async fn routing_allowlist_terminals_context_callbacks_and_disconnects_match() {
    let mut cases = vec![];
    for tool in [
        "execute",
        "terminal.run",
        "jait.terminal",
        "read",
        "file.read",
        "edit",
        "file.write",
        "file.patch",
        "file.list",
        "file.stat",
        "image.view",
        "search",
        "file.search",
        "os.query",
        "new.tool",
        "web",
        "memory.save",
        "cron",
        "agent",
        "jait",
        "file.delete",
    ] {
        for node in [Value::Null, json!("remote")] {
            for connected in [true, false] {
                for background in [true, false] {
                    cases.push(json!({"tool":tool,"node":node,"connected":connected,"input":{"path":"relative","command":"never runs","isBackground":background},"context":{"userId":"owner","sessionId":"s","projectRoot":"/scope","executionNodeId":"old"},"options":{"dryRun":true,"consentTimeoutMs":50},"callback":true,"chunk":"chunk","response":{"ok":true,"data":{"watched":true}}}));
                }
            }
        }
    }
    compare(cases).await;
}
#[tokio::test]
async fn gateway_owned_reads_stay_local_but_remote_project_reads_and_all_writes_route() {
    let root = root();
    let file = root
        .join("packages/gateway-rust/Cargo.toml")
        .to_string_lossy()
        .into_owned();
    let missing = root
        .join(".jait/artifacts/nonexistent-remote-executor-file")
        .to_string_lossy()
        .into_owned();
    let mut cases = vec![];
    for tool in ["read", "file.read", "file.write", "image.view"] {
        for path in [&file, &missing] {
            for project in [
                None,
                Some(root.to_string_lossy().into_owned()),
                Some("C:\\project".into()),
                Some(file.clone()),
            ] {
                let mut context = json!({"userId":"owner","sessionId":"s"});
                if let Some(v) = project {
                    context["projectRoot"] = json!(v);
                }
                cases.push(json!({"tool":tool,"node":"remote","connected":true,"context":context,"input":{"path":path},"response":{"ok":true,"data":"unchanged"}}));
            }
        }
    }
    compare(cases).await;
}
#[tokio::test]
async fn local_lookup_and_proxy_failures_keep_exception_boundaries() {
    let mut cases = vec![];
    for failure in [
        json!({"error":"failed"}),
        json!({"thrown":null}),
        json!({"thrown":{"reason":"opaque"}}),
        json!({"thrown":[null,"x",7]}),
    ] {
        for tool in ["execute", "file.write", "web"] {
            for slot in ["findFailure", "proxyFailure", "localFailure"] {
                let mut row = json!({"tool":tool,"node":"remote","connected":true,"input":{},"context":{"sessionId":"s"}});
                row[slot] = failure.clone();
                cases.push(row);
            }
        }
    }
    compare(cases).await;
}
