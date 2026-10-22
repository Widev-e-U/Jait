#[path = "../src/internal_driver.rs"]
mod internal_driver;
use futures_util::future::BoxFuture;
use jait_gateway::{
    execution::process_runner::{ProcessCancellation, ProcessPool, ProcessRequest},
    security::{
        consent_executor::{
            ConsentAwareExecutor, ConsentExecutorOptions, ExecuteOptions, ExecutionOrigin,
            RuntimeMode, ToolDelegate, ToolExecutionContext, ToolResult, ToolTrust,
        },
        consent_manager::{ConsentManager, ConsentManagerOptions},
        tool_permissions::ToolPermission,
    },
};
use serde_json::{Value, json};
use std::{
    collections::{HashMap, HashSet},
    num::NonZeroU16,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::Duration,
};
fn root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}
fn work() -> PathBuf {
    let path = root()
        .join(".jait/artifacts/gateway-rust/consent-executor")
        .join(uuid::Uuid::new_v4().to_string());
    std::fs::create_dir_all(&path).unwrap();
    path
}
struct Trust {
    level: f64,
    approvals: Mutex<Vec<String>>,
}
impl ToolTrust for Trust {
    fn level<'a>(&'a self, _: &'a str) -> BoxFuture<'a, Result<f64, String>> {
        Box::pin(async move { Ok(self.level) })
    }
    fn record_approval<'a>(&'a self, name: &'a str) -> BoxFuture<'a, Result<(), String>> {
        Box::pin(async move {
            self.approvals.lock().unwrap().push(name.into());
            Ok(())
        })
    }
}
fn permission(name: &str, level: &str) -> Value {
    json!({"toolName":name,"consentLevel":level,"risk":"medium","description":"fixture policy"})
}
fn context(work: &Path, cancellation: ProcessCancellation) -> ToolExecutionContext {
    ToolExecutionContext {
        user_id: "user".into(),
        session_id: "session".into(),
        action_id: "action".into(),
        project_root: work.into(),
        origin: ExecutionOrigin::Agent,
        runtime_mode: RuntimeMode::Guarded,
        cancellation,
        on_output: None,
    }
}
async fn native(call: &Value, work: &Path) -> Value {
    let requests = Arc::new(Mutex::new(Vec::<Value>::new()));
    let calls = Arc::new(Mutex::new(Vec::<Value>::new()));
    let current = Arc::new(Mutex::new(json!({})));
    let cancellation = ProcessCancellation::default();
    if call["preCancel"] == true {
        cancellation.cancel();
    }
    let manager_slot = Arc::new(Mutex::new(None::<ConsentManager>));
    let record = requests.clone();
    let step_slot = current.clone();
    let token = cancellation.clone();
    let manager_ref = manager_slot.clone();
    let manager = ConsentManager::new(ConsentManagerOptions {
        on_request: Some(Arc::new(move |request| {
            let request = request.snapshot();
            record.lock().unwrap().push(json!({"toolName":request.tool_name,"summary":request.summary,"preview":request.preview,"risk":request.risk,"policy":request.policy,"sessionId":request.session_id}));
            let step = step_slot.lock().unwrap().clone();
            let manager = manager_ref.lock().unwrap().clone().unwrap();
            match step["decision"].as_str() {
                Some("timeout") => {}
                Some("cancel-approved") => {
                    token.cancel();
                    manager.approve(&request.id, None, None)?;
                }
                Some("reject") => {
                    manager.reject(&request.id, None, step["reason"].as_str().map(String::from))?;
                }
                _ => {
                    manager.approve(&request.id, None, None)?;
                }
            }
            Ok(())
        })),
        ..ConsentManagerOptions::default()
    });
    *manager_slot.lock().unwrap() = Some(manager.clone());
    if call["approveAll"] == true {
        manager.enable_approve_all_for_session("session");
    }
    let trust = Arc::new(Trust {
        level: call["trustLevel"].as_f64().unwrap_or(0.0),
        approvals: Mutex::new(vec![]),
    });
    let permissions = call["permissions"]
        .as_array()
        .unwrap()
        .iter()
        .map(|v| {
            let p: ToolPermission = serde_json::from_value(v.clone()).unwrap();
            (p.tool_name.clone(), p)
        })
        .collect();
    let approvals = call["approvals"]
        .as_array()
        .map(|items| {
            items
                .iter()
                .map(|v| v.as_str().unwrap().to_owned())
                .collect()
        })
        .unwrap_or_default();
    let result_calls = calls.clone();
    let marker = work.join("native-marker");
    let delegate_marker = marker.clone();
    let step_slot = current.clone();
    let directory = work.to_path_buf();
    let pool = ProcessPool::new(NonZeroU16::new(1).unwrap());
    let delegate: ToolDelegate = Arc::new(move |name, input, ctx| {
        let calls = result_calls.clone();
        let marker = delegate_marker.clone();
        let step = step_slot.lock().unwrap().clone();
        let pool = pool.clone();
        let directory = directory.clone();
        Box::pin(async move {
            calls
                .lock()
                .unwrap()
                .push(json!({"name":name,"input":input}));
            if let Some(error) = step["throw"].as_str() {
                return Err(error.into());
            }
            let result = pool
                .run(
                    ProcessRequest {
                        argv: vec!["/usr/bin/touch".into(), marker.to_string_lossy().into()],
                        cwd: directory,
                        environment: HashMap::new(),
                        input: None,
                        timeout: Duration::from_secs(3),
                        output_limit: 4096,
                    },
                    ctx.cancellation.clone(),
                )
                .await
                .map_err(|e| e.to_string())?;
            if result.exit_code != Some(0) {
                return Err("fixture child failed".into());
            }
            Ok(ToolResult {
                ok: step["resultOk"].as_bool().unwrap_or(true),
                message: "Delegate complete".into(),
                data: Some(json!({"output":"fixture output","exitCode":0})),
            })
        })
    });
    let executor = ConsentAwareExecutor::new(
        ConsentExecutorOptions {
            user_id: "user".into(),
            session_id: "session".into(),
            permissions,
            session_approvals: approvals,
            profile_name: call["profileName"].as_str().map(String::from),
            max_concurrent: NonZeroU16::new(2).unwrap(),
        },
        manager.clone(),
        trust.clone(),
        delegate,
    );
    let mut ctx = context(work, cancellation);
    if call["origin"] == "scheduler" {
        ctx.origin = ExecutionOrigin::Scheduler;
    }
    if call["runtimeMode"] == "full-access" {
        ctx.runtime_mode = RuntimeMode::FullAccess;
    }
    let mut results = vec![];
    for step in call["steps"].as_array().unwrap() {
        *current.lock().unwrap() = step.clone();
        results.push(
            executor
                .execute(
                    step["name"].as_str().unwrap(),
                    &step["input"],
                    &ctx,
                    ExecuteOptions {
                        dry_run: step["dryRun"] == true,
                        consent_timeout_ms: Some(if step["decision"] == "timeout" {
                            2.0
                        } else {
                            5000.0
                        }),
                    },
                )
                .await
                .map(|value| serde_json::to_value(value).unwrap())
                .unwrap_or_else(|error| json!({"error":error})),
        );
    }
    let mut approvals = executor.session_approvals().into_iter().collect::<Vec<_>>();
    approvals.sort();
    let value = json!({"results":results,"requests":requests.lock().unwrap().clone(),"delegateCalls":calls.lock().unwrap().clone(),"trustApprovals":trust.approvals.lock().unwrap().clone(),"approvals":approvals,"pending":manager.pending_count(),"sideEffect":marker.exists()});
    // Break the observer fixture cycle; production observers do not retain their manager.
    *manager_slot.lock().unwrap() = None;
    manager.cancel_all(Some("fixture cleanup")).unwrap();
    value
}
#[cfg(unix)]
#[tokio::test]
async fn real_typescript_executor_matches_policy_dryrun_trust_aliases_overrides_and_cancellation() {
    let directory = work();
    let mut scenarios = vec![
        json!({"permissions":[permission("terminal.run","once")],"steps":[{"name":"terminal.run","input":{"command":"printf safe"}},{"name":"terminal.run","input":{"command":"printf second"}}]}),
        json!({"permissions":[permission("terminal.run","always")],"steps":[{"name":"terminal.run","input":{"command":"printf safe"},"decision":"reject","reason":"declined"}]}),
        json!({"permissions":[permission("terminal.run","always")],"steps":[{"name":"terminal.run","input":{"command":"printf safe"},"decision":"timeout"}]}),
        json!({"permissions":[],"steps":[{"name":"unknown.tool","input":{"x":1},"dryRun":true}]}),
        json!({"permissions":[permission("terminal.run","always")],"preCancel":true,"steps":[{"name":"terminal.run","input":{"command":"printf safe"}}]}),
        json!({"permissions":[permission("terminal.run","always")],"steps":[{"name":"terminal.run","input":{"command":"printf safe"},"decision":"cancel-approved"}]}),
        json!({"permissions":[permission("terminal.run","once")],"steps":[{"name":"terminal.run","input":{"command":"printf safe"},"resultOk":false}]}),
        json!({"permissions":[permission("terminal.run","once")],"trustLevel":2,"steps":[{"name":"terminal.run","input":{"command":"printf safe"}}]}),
        json!({"permissions":[permission("terminal.run","always")],"approveAll":true,"steps":[{"name":"terminal.run","input":{"command":"git reset --hard"},"decision":"reject"}]}),
        json!({"permissions":[permission("terminal.run","dangerous")],"runtimeMode":"full-access","steps":[{"name":"terminal.run","input":{"command":"git reset --hard"}}]}),
        json!({"permissions":[permission("terminal.run","dangerous")],"origin":"scheduler","steps":[{"name":"terminal.run","input":{"command":"printf safe"}}]}),
        json!({"permissions":[{"toolName":"terminal.run","consentLevel":"none","risk":"low","description":"fixture policy","deniedCommands":["*forbidden*"]}],"runtimeMode":"full-access","steps":[{"name":"execute","input":{"command":"forbidden"}},{"name":"jait.terminal","input":{"command":"forbidden"}}]}),
        json!({"permissions":[permission("file.write","always")],"profileName":"standard","steps":[{"name":"file.write","input":{"path":"file","content":"x".repeat(600)},"dryRun":true},{"name":"computer.session","input":{"action":"start","nodeId":"node"},"dryRun":true},{"name":"computer.act","input":{"action":"click"},"dryRun":true}]}),
    ];
    // Each object-preview and nullish summary branch is compared against the real export.
    for (name, input) in [
        ("terminal.stream", json!({"command":"printf safe"})),
        ("file.read", json!({"path":null})),
        (
            "file.patch",
            json!({"path":"a","search":"b","replace":"c","ignored":true}),
        ),
        ("os.install", json!({"package":[1,null,"x"]})),
        ("os.query", json!({"type":{"nested":true}})),
        ("computer.session", json!({"action":"stop"})),
        ("computer.session", json!({"action":"start","nodeId":null})),
        ("computer.observe", json!({"nodeId":"node"})),
        ("surfaces.start", json!({"type":"web"})),
        ("surfaces.stop", json!({"id":"surface"})),
        ("custom.tool", json!({"values":[true,null,"資料🦀"]})),
        ("file.write", json!({"path":false,"content":17})),
        (
            "file.write",
            json!({"path":"unicode","content":"🦀".repeat(300)}),
        ),
    ] {
        scenarios
            .push(json!({"permissions":[],"steps":[{"name":name,"input":input,"dryRun":true}]}));
    }
    for (level, trust) in [
        ("none", 0.0),
        ("once", 1.5),
        ("once", 2.0),
        ("always", 2.5),
        ("always", 3.0),
        ("dangerous", 4.0),
    ] {
        scenarios.push(json!({"permissions":[permission("custom.tool",level)],"trustLevel":trust,"steps":[{"name":"custom.tool","input":{}},{"name":"custom.tool","input":{},"dryRun":true}]}));
    }
    scenarios.extend([
        json!({"permissions":[permission("terminal.run","once")],"approvals":["terminal.run"],"steps":[{"name":"terminal.run","input":{"command":"printf safe"}}]}),
        json!({"permissions":[permission("terminal.run","once")],"steps":[{"name":"terminal.run","input":{"command":"printf safe"},"resultOk":false},{"name":"terminal.run","input":{"command":"printf safe"}}]}),
        json!({"permissions":[permission("terminal.run","once")],"approveAll":true,"steps":[{"name":"terminal.run","input":{"command":"printf safe"}},{"name":"terminal.run","input":{"command":"git reset --hard"},"decision":"reject"}]}),
        json!({"permissions":[permission("terminal.run","once")],"origin":"scheduler","steps":[{"name":"terminal.run","input":{"command":"git reset --hard"},"decision":"reject"}]}),
        json!({"permissions":[{"toolName":"terminal.run","consentLevel":"none","risk":"low","description":"allow fixture","allowedCommands":["printf *"]}],"steps":[{"name":"execute","input":{"command":"unexpected"}},{"name":"jait.terminal","input":{"command":"unexpected"}}]}),
        json!({"permissions":[permission("terminal.run","always")],"steps":[{"name":"terminal.run","input":{"command":42}}]}),
        json!({"permissions":[permission("terminal.run","always")],"steps":[{"name":"terminal.run","input":{"command":"printf safe"},"decision":"reject"}]}),
        json!({"permissions":[],"approveAll":true,"steps":[{"name":"custom.tool","input":{}}]}),
    ]);
    scenarios.extend([
        json!({"permissions":[permission("terminal.run","none")],"steps":[{"name":"terminal.run","input":{"command":"git reset --hard"},"dryRun":true}]}),
        json!({"permissions":[{"toolName":"terminal.run","consentLevel":"none","risk":"low","description":"dryrun fixture","deniedCommands":["*"]}],"steps":[{"name":"terminal.run","input":{"command":"forbidden"},"dryRun":true}]}),
        json!({"permissions":[permission("terminal.run","once")],"steps":[{"name":"terminal.run","input":{"command":"printf safe"},"throw":"fixture failure"},{"name":"terminal.run","input":{"command":"printf safe"}}]}),
        json!({"permissions":[permission("terminal.run","none")],"steps":[{"name":"terminal.run","input":{"command":"git reset --hard"},"decision":"reject"}]}),
    ]);
    scenarios.push(json!({"permissions":[permission("terminal.run","none")],"steps":[{"name":"execute","input":{"command":"printf safe"},"decision":"reject"},{"name":"jait.terminal","input":{"command":"printf safe"},"decision":"reject"}]}));
    let mut calls = vec![];
    let mut scenarios_with_markers = vec![];
    for (i, scenario) in scenarios.into_iter().enumerate() {
        let mut scenario = scenario;
        scenario["op"] = json!("nativeconsentexec.scenario");
        scenario["marker"] = json!(
            directory
                .join(format!("reference-marker-{i}"))
                .to_string_lossy()
        );
        calls.push(scenario.clone());
        scenarios_with_markers.push(scenario);
    }
    let reference_directory = directory.clone();
    let reference = tokio::task::spawn_blocking(move || {
        internal_driver::call(
            &root(),
            &reference_directory,
            json!({"version":1,"calls":calls}),
            &|| false,
        )
        .unwrap()
    })
    .await
    .unwrap();
    for (i, scenario) in scenarios_with_markers.iter().enumerate() {
        let case_directory = directory.join(format!("native-{i}"));
        std::fs::create_dir_all(&case_directory).unwrap();
        let actual = native(scenario, &case_directory).await;
        assert_eq!(actual, reference[i], "scenario {i}");
    }
}

#[tokio::test]
async fn owner_admission_and_dropped_consent_waits_cannot_dispatch_late_effects() {
    let directory = work();
    let manager = ConsentManager::default();
    let executed = Arc::new(std::sync::atomic::AtomicBool::new(false));
    let signal = executed.clone();
    let delegate: ToolDelegate = Arc::new(move |_, _, _| {
        let signal = signal.clone();
        Box::pin(async move {
            signal.store(true, std::sync::atomic::Ordering::SeqCst);
            Ok(ToolResult::message(true, "unexpected"))
        })
    });
    let trust = Arc::new(Trust {
        level: 0.0,
        approvals: Mutex::new(vec![]),
    });
    let executor = Arc::new(ConsentAwareExecutor::new(
        ConsentExecutorOptions {
            user_id: "user".into(),
            session_id: "session".into(),
            permissions: HashMap::new(),
            session_approvals: HashSet::new(),
            profile_name: None,
            max_concurrent: NonZeroU16::new(1).unwrap(),
        },
        manager.clone(),
        trust,
        delegate,
    ));
    let token = ProcessCancellation::default();
    let mut foreign = context(&directory, token.clone());
    foreign.user_id = "foreign".into();
    assert!(
        !executor
            .execute(
                "terminal.run",
                &json!({"command":"fixture"}),
                &foreign,
                ExecuteOptions::default()
            )
            .await
            .unwrap()
            .ok
    );
    assert_eq!(manager.pending_count(), 0);
    let worker = executor.clone();
    let ctx = context(&directory, token.clone());
    let task = tokio::spawn(async move {
        worker
            .execute(
                "terminal.run",
                &json!({"command":"fixture"}),
                &ctx,
                ExecuteOptions::default(),
            )
            .await
    });
    tokio::time::timeout(Duration::from_secs(3), async {
        while manager.pending_count() == 0 {
            tokio::task::yield_now().await;
        }
    })
    .await
    .unwrap();
    let pending_id = manager.list_pending(None)[0].snapshot().id;
    let overflow = executor
        .execute(
            "terminal.run",
            &json!({"command":"fixture"}),
            &context(&directory, ProcessCancellation::default()),
            ExecuteOptions::default(),
        )
        .await
        .unwrap_err();
    assert_eq!(overflow, "tool execution capacity unavailable");
    token.cancel();
    assert_eq!(task.await.unwrap().unwrap().message, "Cancelled");
    tokio::time::timeout(Duration::from_secs(3), async {
        while manager.pending_count() != 0 {
            tokio::time::sleep(Duration::from_millis(1)).await;
        }
    })
    .await
    .unwrap();
    assert!(!manager.approve(&pending_id, None, None).unwrap());
    tokio::time::timeout(Duration::from_secs(3), async {
        loop {
            if executor
                .execute(
                    "terminal.run",
                    &json!({"command":"fixture"}),
                    &context(&directory, ProcessCancellation::default()),
                    ExecuteOptions {
                        dry_run: true,
                        consent_timeout_ms: None,
                    },
                )
                .await
                .is_ok()
            {
                break;
            }
            tokio::time::sleep(Duration::from_millis(1)).await;
        }
    })
    .await
    .unwrap();
    let worker = executor.clone();
    let ctx = context(&directory, ProcessCancellation::default());
    let task = tokio::spawn(async move {
        worker
            .execute(
                "terminal.run",
                &json!({"command":"fixture"}),
                &ctx,
                ExecuteOptions::default(),
            )
            .await
    });
    tokio::time::timeout(Duration::from_secs(3), async {
        while manager.pending_count() == 0 {
            tokio::task::yield_now().await;
        }
    })
    .await
    .unwrap();
    let pending_id = manager.list_pending(None)[0].snapshot().id;
    task.abort();
    let _ = task.await;
    tokio::time::timeout(Duration::from_secs(3), async {
        while manager.pending_count() != 0 {
            tokio::time::sleep(Duration::from_millis(1)).await;
        }
    })
    .await
    .unwrap();
    assert!(!manager.approve(&pending_id, None, None).unwrap());
    assert!(!executed.load(std::sync::atomic::Ordering::SeqCst));
    manager.cancel_all(None).unwrap();
}

fn fixture_executor(
    manager: ConsentManager,
    trust: Arc<dyn ToolTrust>,
    delegate: ToolDelegate,
    permissions: HashMap<String, ToolPermission>,
) -> Arc<ConsentAwareExecutor> {
    Arc::new(ConsentAwareExecutor::new(
        ConsentExecutorOptions {
            user_id: "user".into(),
            session_id: "session".into(),
            permissions,
            session_approvals: HashSet::new(),
            profile_name: None,
            max_concurrent: NonZeroU16::new(1).unwrap(),
        },
        manager,
        trust,
        delegate,
    ))
}

#[tokio::test]
async fn model_arguments_cannot_impersonate_owner_or_enable_full_access() {
    let directory = work();
    let manager = ConsentManager::default();
    let trust = Arc::new(Trust {
        level: 0.0,
        approvals: Mutex::new(vec![]),
    });
    let delegate: ToolDelegate =
        Arc::new(|_, _, _| Box::pin(async { panic!("unauthorized dispatch") }));
    let executor = fixture_executor(manager.clone(), trust.clone(), delegate, HashMap::new());
    let input = json!({"command":"fixture", "user_id":"user", "sessionId":"session", "runtimeMode":"full-access", "requestedBy":"scheduler", "cancellation":false});
    let mut foreign = context(&directory, ProcessCancellation::default());
    foreign.session_id = "another-session".into();
    foreign.runtime_mode = RuntimeMode::FullAccess;
    assert_eq!(
        executor
            .execute("terminal.run", &input, &foreign, ExecuteOptions::default())
            .await
            .unwrap()
            .message,
        "Tool context does not belong to this session"
    );
    assert_eq!(manager.pending_count(), 0);
    let token = ProcessCancellation::default();
    let worker = executor.clone();
    let ctx = context(&directory, token.clone());
    let task = tokio::spawn(async move {
        worker
            .execute("terminal.run", &input, &ctx, ExecuteOptions::default())
            .await
    });
    tokio::time::timeout(Duration::from_secs(3), async {
        while manager.pending_count() == 0 {
            tokio::task::yield_now().await;
        }
    })
    .await
    .unwrap();
    let request = manager.list_pending(None)[0].snapshot();
    assert_eq!(request.session_id, "session");
    assert_eq!(request.action_id, "action");
    manager
        .reject(&request.id, None, Some("not authorized".into()))
        .unwrap();
    assert!(!task.await.unwrap().unwrap().ok);
    assert!(trust.approvals.lock().unwrap().is_empty());
    assert!(executor.session_approvals().is_empty());
}

#[tokio::test]
async fn command_denials_apply_to_all_terminal_names_even_with_internal_bypass() {
    let directory = work();
    for name in [
        "terminal.run",
        "terminal.stream",
        "execute",
        "jait.terminal",
    ] {
        for bypass in ["full-access", "scheduler", "approve-all", "trust"] {
            let manager = ConsentManager::default();
            if bypass == "approve-all" {
                manager.enable_approve_all_for_session("session");
            }
            let trust = Arc::new(Trust {
                level: 3.0,
                approvals: Mutex::new(vec![]),
            });
            let delegate: ToolDelegate =
                Arc::new(|_, _, _| Box::pin(async { panic!("denied command dispatched") }));
            let policy: ToolPermission = serde_json::from_value(json!({"toolName":name,"consentLevel":"none","risk":"low","description":"deny fixture","deniedCommands":["*forbidden*"]})).unwrap();
            let executor = fixture_executor(
                manager.clone(),
                trust.clone(),
                delegate,
                HashMap::from([(name.into(), policy)]),
            );
            let mut ctx = context(&directory, ProcessCancellation::default());
            if bypass == "full-access" {
                ctx.runtime_mode = RuntimeMode::FullAccess;
            }
            if bypass == "scheduler" {
                ctx.origin = ExecutionOrigin::Scheduler;
            }
            let result = executor
                .execute(
                    name,
                    &json!({"command":"forbidden"}),
                    &ctx,
                    ExecuteOptions::default(),
                )
                .await
                .unwrap();
            assert!(!result.ok, "{name} {bypass}");
            assert!(result.message.starts_with("Command blocked:"));
            assert_eq!(manager.pending_count(), 0);
            assert!(trust.approvals.lock().unwrap().is_empty());
        }
    }
}

#[tokio::test]
async fn admission_is_held_through_running_delegate_and_released_on_abort() {
    let directory = work();
    let manager = ConsentManager::default();
    let trust = Arc::new(Trust {
        level: 3.0,
        approvals: Mutex::new(vec![]),
    });
    let entered = Arc::new(tokio::sync::Notify::new());
    let entered_delegate = entered.clone();
    let delegate: ToolDelegate = Arc::new(move |_, _, _| {
        let entered = entered_delegate.clone();
        Box::pin(async move {
            entered.notify_one();
            std::future::pending::<()>().await;
            unreachable!()
        })
    });
    let executor = fixture_executor(manager.clone(), trust.clone(), delegate, HashMap::new());
    let worker = executor.clone();
    let mut ctx = context(&directory, ProcessCancellation::default());
    ctx.runtime_mode = RuntimeMode::FullAccess;
    let task = tokio::spawn(async move {
        worker
            .execute(
                "terminal.run",
                &json!({"command":"fixture"}),
                &ctx,
                ExecuteOptions::default(),
            )
            .await
    });
    tokio::time::timeout(Duration::from_secs(3), entered.notified())
        .await
        .unwrap();
    let ctx = context(&directory, ProcessCancellation::default());
    assert_eq!(
        executor
            .execute(
                "terminal.run",
                &json!({}),
                &ctx,
                ExecuteOptions {
                    dry_run: true,
                    consent_timeout_ms: None
                }
            )
            .await
            .unwrap_err(),
        "tool execution capacity unavailable"
    );
    task.abort();
    assert!(task.await.unwrap_err().is_cancelled());
    assert!(
        executor
            .execute(
                "terminal.run",
                &json!({}),
                &ctx,
                ExecuteOptions {
                    dry_run: true,
                    consent_timeout_ms: None
                }
            )
            .await
            .unwrap()
            .ok
    );
    assert_eq!(manager.pending_count(), 0);
    assert!(trust.approvals.lock().unwrap().is_empty());
}

struct WaitingTrust(Arc<tokio::sync::Notify>);
impl ToolTrust for WaitingTrust {
    fn level<'a>(&'a self, _: &'a str) -> BoxFuture<'a, Result<f64, String>> {
        Box::pin(async move {
            self.0.notify_one();
            std::future::pending().await
        })
    }
    fn record_approval<'a>(&'a self, _: &'a str) -> BoxFuture<'a, Result<(), String>> {
        Box::pin(async { panic!("cancelled lookup cannot earn trust") })
    }
}

#[tokio::test]
async fn cancellation_interrupts_trust_lookup_before_creating_consent() {
    let directory = work();
    let manager = ConsentManager::default();
    let entered = Arc::new(tokio::sync::Notify::new());
    let delegate: ToolDelegate =
        Arc::new(|_, _, _| Box::pin(async { panic!("cancelled lookup dispatched") }));
    let executor = fixture_executor(
        manager.clone(),
        Arc::new(WaitingTrust(entered.clone())),
        delegate,
        HashMap::new(),
    );
    let token = ProcessCancellation::default();
    let ctx = context(&directory, token.clone());
    let task = tokio::spawn(async move {
        executor
            .execute(
                "terminal.run",
                &json!({"command":"fixture"}),
                &ctx,
                ExecuteOptions::default(),
            )
            .await
    });
    tokio::time::timeout(Duration::from_secs(3), entered.notified())
        .await
        .unwrap();
    token.cancel();
    let result = tokio::time::timeout(Duration::from_secs(3), task)
        .await
        .expect("cancellation must not wait on trust storage")
        .unwrap()
        .unwrap();
    assert_eq!(result.message, "Cancelled");
    assert!(!result.ok);
    assert_eq!(manager.pending_count(), 0);
}

#[tokio::test]
async fn approved_dispatch_preserves_process_deadline_and_output_bound() {
    let directory = work();
    let manager = ConsentManager::default();
    let trust = Arc::new(Trust {
        level: 0.0,
        approvals: Mutex::new(vec![]),
    });
    let pool = ProcessPool::new(NonZeroU16::new(1).unwrap());
    let delegate: ToolDelegate = Arc::new(move |_, _, ctx| {
        let pool = pool.clone();
        Box::pin(async move {
            let result = pool
                .run(
                    ProcessRequest {
                        argv: vec![
                            "/bin/sh".into(),
                            "-c".into(),
                            "printf '%04096d' 0; /bin/sleep 5".into(),
                        ],
                        cwd: ctx.project_root.clone(),
                        environment: HashMap::new(),
                        input: None,
                        timeout: Duration::from_millis(300),
                        output_limit: 512,
                    },
                    ctx.cancellation.clone(),
                )
                .await
                .map_err(|error| error.to_string())?;
            Ok(ToolResult {
                ok: result.exit_code == Some(0) && !result.cancelled && !result.timed_out,
                message: "bounded process complete".into(),
                data: Some(serde_json::to_value(result).unwrap()),
            })
        })
    });
    let executor = fixture_executor(manager.clone(), trust.clone(), delegate, HashMap::new());
    let worker = executor.clone();
    let ctx = context(&directory, ProcessCancellation::default());
    let task = tokio::spawn(async move {
        worker
            .execute(
                "terminal.run",
                &json!({"command":"server fixture"}),
                &ctx,
                ExecuteOptions::default(),
            )
            .await
    });
    tokio::time::timeout(Duration::from_secs(3), async {
        while manager.pending_count() == 0 {
            tokio::task::yield_now().await;
        }
    })
    .await
    .unwrap();
    let request = manager.list_pending(None)[0].snapshot();
    manager.approve(&request.id, None, None).unwrap();
    let result = tokio::time::timeout(Duration::from_secs(3), task)
        .await
        .unwrap()
        .unwrap()
        .unwrap();
    assert!(!result.ok);
    let data = result.data.unwrap();
    assert_eq!(data["timedOut"], true);
    assert_eq!(data["truncated"], true);
    assert!(data["output"].as_str().unwrap().len() <= 512);
    assert_eq!(manager.pending_count(), 0);
    assert!(trust.approvals.lock().unwrap().is_empty());
    assert!(executor.session_approvals().is_empty());
}

#[tokio::test]
async fn delegate_retains_authenticated_context_and_injected_durable_audit_writer() {
    use jait_gateway::{
        db,
        services::audit::{AuditEntry, AuditWriter},
    };
    for (origin, runtime_mode) in [
        (ExecutionOrigin::Agent, RuntimeMode::Guarded),
        (ExecutionOrigin::Scheduler, RuntimeMode::Guarded),
        (ExecutionOrigin::User, RuntimeMode::FullAccess),
    ] {
        let directory = work();
        let database_path = directory.join("audit.sqlite");
        let connection = db::open_database(&database_path).unwrap();
        db::migrate_database(&connection).unwrap();
        let database = Arc::new(Mutex::new(connection));
        let output = Arc::new(Mutex::new(vec![]));
        let output_sink = output.clone();
        let manager = ConsentManager::default();
        let trust = Arc::new(Trust {
            level: 0.0,
            approvals: Mutex::new(vec![]),
        });
        let database_delegate = database.clone();
        let expected_directory = directory.clone();
        let delegate: ToolDelegate = Arc::new(move |name, input, ctx| {
            assert_eq!(ctx.user_id, "user");
            assert_eq!(ctx.session_id, "session");
            assert_eq!(ctx.action_id, "action");
            assert_eq!(ctx.project_root, expected_directory);
            assert_eq!(ctx.origin, origin);
            assert_eq!(ctx.runtime_mode, runtime_mode);
            assert!(!ctx.cancellation.is_cancelled());
            ctx.on_output.as_ref().unwrap()("authenticated output".into());
            let database = database_delegate.clone();
            let entry = AuditEntry {
                session_id: Some(ctx.session_id.clone()),
                action_id: ctx.action_id.clone(),
                action_type: "tool".into(),
                tool_name: Some(name.into()),
                inputs: Some(input.clone()),
                outputs: Some(json!({"ok":true})),
                status: "completed".into(),
                ..AuditEntry::default()
            };
            Box::pin(async move {
                tokio::task::spawn_blocking(move || {
                    AuditWriter::new(&database.lock().unwrap())
                        .write(entry)
                        .map_err(|error| error.to_string())
                })
                .await
                .map_err(|error| error.to_string())??;
                Ok(ToolResult::message(true, "audited"))
            })
        });
        let policy: ToolPermission =
            serde_json::from_value(permission("file.write", "once")).unwrap();
        let executor = fixture_executor(
            manager.clone(),
            trust.clone(),
            delegate,
            HashMap::from([("file.write".into(), policy)]),
        );
        let token = ProcessCancellation::default();
        let mut ctx = context(&directory, token.clone());
        ctx.origin = origin;
        ctx.runtime_mode = runtime_mode;
        ctx.on_output = Some(Arc::new(move |text| output_sink.lock().unwrap().push(text)));
        let input = json!({"path":"fixture","userId":"spoof","sessionId":"spoof","actionId":"spoof","projectRoot":"/spoof","requestedBy":"scheduler","runtimeMode":"full-access"});
        let planned = executor
            .execute(
                "file.write",
                &input,
                &ctx,
                ExecuteOptions {
                    dry_run: true,
                    consent_timeout_ms: None,
                },
            )
            .await
            .unwrap();
        assert!(planned.ok);
        assert!(
            AuditWriter::new(&database.lock().unwrap())
                .get_all()
                .unwrap()
                .is_empty()
        );
        let worker = executor.clone();
        let task = tokio::spawn(async move {
            worker
                .execute("file.write", &input, &ctx, ExecuteOptions::default())
                .await
        });
        if origin == ExecutionOrigin::Agent {
            tokio::time::timeout(Duration::from_secs(3), async {
                while manager.pending_count() == 0 {
                    tokio::task::yield_now().await;
                }
            })
            .await
            .unwrap();
            assert!(
                AuditWriter::new(&database.lock().unwrap())
                    .get_all()
                    .unwrap()
                    .is_empty()
            );
            let request = manager.list_pending(None)[0].snapshot();
            manager.approve(&request.id, None, None).unwrap();
        }
        assert!(
            tokio::time::timeout(Duration::from_secs(3), task)
                .await
                .unwrap()
                .unwrap()
                .unwrap()
                .ok
        );
        assert_eq!(*output.lock().unwrap(), vec!["authenticated output"]);
        assert_eq!(*trust.approvals.lock().unwrap(), vec!["file.write"]);
        assert_eq!(
            executor.session_approvals().contains("file.write"),
            origin == ExecutionOrigin::Agent
        );
        drop(executor);
        drop(database);
        let reopened = db::open_database(&database_path).unwrap();
        let records = AuditWriter::new(&reopened)
            .get_by_session("session")
            .unwrap();
        assert_eq!(records.len(), 1);
        assert_eq!(records[0].session_id.as_deref(), Some("session"));
        assert_eq!(records[0].action_id, "action");
        assert_eq!(records[0].tool_name.as_deref(), Some("file.write"));
        assert_eq!(records[0].status, "completed");
        assert!(
            AuditWriter::new(&reopened)
                .get_by_session("spoof")
                .unwrap()
                .is_empty()
        );
        token.cancel();
    }
}

struct CancellingTrust(ProcessCancellation);
impl ToolTrust for CancellingTrust {
    fn level<'a>(&'a self, _: &'a str) -> BoxFuture<'a, Result<f64, String>> {
        Box::pin(async move {
            self.0.cancel();
            Ok(3.0)
        })
    }
    fn record_approval<'a>(&'a self, _: &'a str) -> BoxFuture<'a, Result<(), String>> {
        Box::pin(async { panic!("cancelled effect boundary cannot earn trust") })
    }
}

#[tokio::test]
async fn cancellation_that_races_a_ready_trust_lookup_is_rechecked_before_effects() {
    let directory = work();
    let manager = ConsentManager::default();
    let token = ProcessCancellation::default();
    let delegate: ToolDelegate =
        Arc::new(|_, _, _| Box::pin(async { panic!("cancelled effect dispatched") }));
    let executor = fixture_executor(
        manager.clone(),
        Arc::new(CancellingTrust(token.clone())),
        delegate,
        HashMap::new(),
    );
    let mut ctx = context(&directory, token);
    ctx.runtime_mode = RuntimeMode::FullAccess;
    let result = executor
        .execute(
            "terminal.run",
            &json!({"command":"fixture"}),
            &ctx,
            ExecuteOptions::default(),
        )
        .await
        .unwrap();
    assert!(!result.ok);
    assert_eq!(result.message, "Cancelled");
    assert_eq!(manager.pending_count(), 0);
}

#[tokio::test]
async fn malformed_nonobject_arguments_are_rejected_before_trust_consent_or_effects() {
    let directory = work();
    let manager = ConsentManager::default();
    let trust = Arc::new(WaitingTrust(Arc::new(tokio::sync::Notify::new())));
    let delegate: ToolDelegate =
        Arc::new(|_, _, _| Box::pin(async { panic!("malformed arguments dispatched") }));
    let executor = fixture_executor(manager.clone(), trust, delegate, HashMap::new());
    let mut ctx = context(&directory, ProcessCancellation::default());
    ctx.runtime_mode = RuntimeMode::FullAccess;
    for input in [
        Value::Null,
        json!([]),
        json!([1]),
        json!(true),
        json!(17),
        json!("scalar"),
    ] {
        for dry_run in [false, true] {
            let result = tokio::time::timeout(
                Duration::from_secs(3),
                executor.execute(
                    "custom.tool",
                    &input,
                    &ctx,
                    ExecuteOptions {
                        dry_run,
                        consent_timeout_ms: None,
                    },
                ),
            )
            .await
            .expect("invalid arguments must not poll trust")
            .unwrap();
            assert!(!result.ok);
            assert_eq!(result.message, "Tool arguments must be an object");
            assert_eq!(manager.pending_count(), 0);
        }
    }
}
