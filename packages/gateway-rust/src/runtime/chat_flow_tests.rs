//! Actual HTTP + consent + bounded subprocess + persistent restart composition.
use super::{chat_store::SqliteTurnStore, chat_turn::*};
use crate::{
    db,
    execution::process_runner::{ProcessCancellation, ProcessPool, ProcessRequest},
    providers::openai_stream::{EventSink, OpenAiHttp},
    routes::auth::AuthState,
    security::{
        consent_executor::*,
        consent_manager::{ConsentManager, ConsentManagerOptions, ConsentStatus},
    },
};
use axum::{Json, Router, extract::State, response::IntoResponse, routing::post};
use futures_util::future::BoxFuture;
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    future::IntoFuture,
    num::NonZeroU16,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::Duration,
};

struct LowTrust;
impl ToolTrust for LowTrust {
    fn level<'a>(&'a self, _: &'a str) -> BoxFuture<'a, Result<f64, String>> {
        Box::pin(async { Ok(0.0) })
    }
    fn record_approval<'a>(&'a self, _: &'a str) -> BoxFuture<'a, Result<(), String>> {
        Box::pin(async { Ok(()) })
    }
}
fn open(path: &Path) -> AuthState {
    let connection = db::open_database(path).unwrap();
    db::migrate_database(&connection).unwrap();
    connection.execute("INSERT OR IGNORE INTO sessions(id,user_id,created_at,last_active_at,status) VALUES('session','owner','2026-10-21T00:00:00Z','2026-10-21T00:00:00Z','active')",[]).unwrap();
    AuthState::new(connection, "fixture-secret".into()).unwrap()
}
fn config() -> TurnConfig {
    TurnConfig {
        model: "fixture".into(),
        tools: vec![TurnTool {
            name: "terminal.run".into(),
            description: "Owned fixture process".into(),
            parameters: json!({"type":"object","properties":{}}),
        }],
        max_rounds: 4,
        max_tool_calls: 4,
        max_history_bytes: 128 * 1024,
        max_tool_result_bytes: 4096,
        timeout: Duration::from_secs(10),
    }
}
async fn model(
    State(requests): State<Arc<Mutex<Vec<Value>>>>,
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let mut requests = requests.lock().unwrap();
    let index = requests.len();
    requests.push(body);
    let chunk = match index {
        0 => {
            json!({"choices":[{"delta":{"tool_calls":[{"index":0,"id":"owned-call","type":"function","function":{"name":"terminal_run","arguments":"{}"}}]},"finish_reason":"tool_calls"}]})
        }
        1 => json!({"choices":[{"delta":{"content":"Process verified"},"finish_reason":"stop"}]}),
        _ => json!({"choices":[{"delta":{"content":"Resumed"},"finish_reason":"stop"}]}),
    };
    (
        [("content-type", "text/event-stream")],
        format!("data: {chunk}\n\ndata: [DONE]\n\n"),
    )
}
#[tokio::test]
async fn actual_model_tool_and_sqlite_flow_resumes_after_storage_restart() {
    let work: PathBuf = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../.jait/artifacts/gateway-rust/chat-flow")
        .join(uuid::Uuid::new_v4().to_string());
    std::fs::create_dir_all(&work).unwrap();
    let database = work.join("flow.sqlite");
    let requests = Arc::new(Mutex::new(Vec::new()));
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let (stop, stopped) = tokio::sync::oneshot::channel();
    let server = tokio::spawn(
        axum::serve(
            listener,
            Router::new()
                .route("/v1/chat/completions", post(model))
                .with_state(requests.clone()),
        )
        .with_graceful_shutdown(async {
            let _ = stopped.await;
        })
        .into_future(),
    );
    let provider =
        OpenAiHttp::configured(&format!("http://{address}/v1"), "fixture-key", "session").unwrap();
    let decisions = Arc::new(Mutex::new(Vec::new()));
    let manager_slot = Arc::new(Mutex::new(None::<ConsentManager>));
    let slot = manager_slot.clone();
    let decision_log = decisions.clone();
    let consent = ConsentManager::new(ConsentManagerOptions {
        on_request: Some(Arc::new(move |request| {
            let request = request.snapshot();
            decision_log
                .lock()
                .unwrap()
                .push((request.tool_name.clone(), request.session_id.clone()));
            slot.lock()
                .unwrap()
                .as_ref()
                .unwrap()
                .approve(&request.id, None, None)?;
            Ok(())
        })),
        ..ConsentManagerOptions::default()
    });
    *manager_slot.lock().unwrap() = Some(consent.clone());
    let pool = ProcessPool::new(NonZeroU16::new(1).unwrap());
    let delegate: ToolDelegate = Arc::new(move |name, input, context, _permit| {
        assert_eq!(name, "terminal.run");
        assert_eq!(input, &json!({}));
        assert_eq!(context.user_id, "owner");
        let pool = pool.clone();
        let cwd = context.project_root.clone();
        let cancellation = context.cancellation.clone();
        Box::pin(async move {
            let result = pool
                .run(
                    ProcessRequest {
                        argv: vec!["/usr/bin/printf".into(), "checked\n".into()],
                        cwd,
                        environment: HashMap::new(),
                        input: None,
                        timeout: Duration::from_secs(2),
                        output_limit: 4096,
                    },
                    cancellation,
                )
                .await
                .map_err(|e| e.to_string())?;
            Ok(ToolResult::message(
                result.exit_code == Some(0),
                result.output,
            ))
        })
    });
    let executor = ConsentAwareExecutor::new(
        ConsentExecutorOptions {
            user_id: "owner".into(),
            session_id: "session".into(),
            permissions: HashMap::new(),
            session_approvals: Default::default(),
            profile_name: None,
            max_concurrent: NonZeroU16::new(1).unwrap(),
        },
        consent,
        Arc::new(LowTrust),
        delegate,
    );
    let context = ToolExecutionContext {
        user_id: "owner".into(),
        session_id: "session".into(),
        action_id: "turn".into(),
        project_root: work,
        origin: ExecutionOrigin::Agent,
        runtime_mode: RuntimeMode::Guarded,
        cancellation: ProcessCancellation::default(),
        on_output: None,
    };
    let emissions = Arc::new(Mutex::new(Vec::<Value>::new()));
    let sink: EventSink = {
        let emissions = emissions.clone();
        Arc::new(move |event| {
            emissions.lock().unwrap().push(event);
            Box::pin(async { Ok(()) })
        })
    };
    let auth = open(&database);
    let store = SqliteTurnStore::new(auth.clone(), "owner".into(), "session".into()).unwrap();
    let outcome = TurnCoordinator {
        config: config(),
        provider: &provider,
        tools: &executor,
        persistence: &store,
    }
    .run(vec![], "Check process".into(), &context, sink.clone())
    .await
    .unwrap();
    assert_eq!(outcome.content, "Process verified");
    assert_eq!(outcome.tool_calls, 1);
    assert_eq!(
        *decisions.lock().unwrap(),
        vec![("terminal.run".into(), "session".into())]
    );
    let before = store.load().await.unwrap();
    assert_eq!(before.len(), 4);
    assert!(
        matches!(&before[2],TurnEvent::Tool{result,..} if result.ok && result.message=="checked"),
        "{:#?}",
        before[2]
    );
    {
        let emitted = emissions.lock().unwrap();
        let start = emitted
            .iter()
            .position(|event| event["type"] == "tool_start")
            .unwrap();
        let result = emitted
            .iter()
            .position(|event| event["type"] == "tool_result")
            .unwrap();
        let answer = emitted
            .iter()
            .position(|event| event["type"] == "token" && event["content"] == "Process verified")
            .unwrap();
        assert!(start < result && result < answer);
        assert_eq!(
            emitted[start],
            json!({"type":"tool_start","call_id":"owned-call","tool":"terminal.run","args":{}})
        );
        assert_eq!(
            emitted[result],
            json!({"type":"tool_result","call_id":"owned-call","tool":"terminal.run","ok":true,"message":"checked"})
        );
    }
    auth.shutdown().await.unwrap();
    let restarted = open(&database);
    let resumed =
        SqliteTurnStore::new(restarted.clone(), "owner".into(), "session".into()).unwrap();
    let events = resumed.load().await.unwrap();
    assert_eq!(events, before);
    let history = events.iter().map(TurnEvent::to_message).collect();
    let outcome = TurnCoordinator {
        config: config(),
        provider: &provider,
        tools: &executor,
        persistence: &resumed,
    }
    .run(history, "Continue".into(), &context, sink)
    .await
    .unwrap();
    assert_eq!(outcome.content, "Resumed");
    assert_eq!(resumed.load().await.unwrap().len(), 6);
    {
        let recorded = requests.lock().unwrap();
        assert_eq!(recorded.len(), 3);
        assert_eq!(recorded[0]["messages"].as_array().unwrap().len(), 1);
        assert_eq!(recorded[1]["messages"][2]["tool_call_id"], "owned-call");
        assert!(
            recorded[1]["messages"][2]["content"]
                .as_str()
                .unwrap()
                .contains("checked")
        );
        assert_eq!(recorded[2]["messages"].as_array().unwrap().len(), 5);
    }
    restarted.shutdown().await.unwrap();
    let _ = stop.send(());
    server.await.unwrap().unwrap();
}

#[tokio::test]
async fn cancelling_waiting_consent_removes_request_without_executing_tool() {
    use std::sync::atomic::{AtomicUsize, Ordering};
    let requested = Arc::new(tokio::sync::Notify::new());
    let observer = requested.clone();
    let consent = ConsentManager::new(ConsentManagerOptions {
        on_request: Some(Arc::new(move |_| {
            observer.notify_one();
            Ok(())
        })),
        ..ConsentManagerOptions::default()
    });
    let calls = Arc::new(AtomicUsize::new(0));
    let observed_calls = calls.clone();
    let delegate: ToolDelegate = Arc::new(move |_, _, _, _permit| {
        observed_calls.fetch_add(1, Ordering::SeqCst);
        Box::pin(async { Ok(ToolResult::message(true, "executed")) })
    });
    let executor = ConsentAwareExecutor::new(
        ConsentExecutorOptions {
            user_id: "owner".into(),
            session_id: "session".into(),
            permissions: HashMap::new(),
            session_approvals: Default::default(),
            profile_name: None,
            max_concurrent: NonZeroU16::new(1).unwrap(),
        },
        consent.clone(),
        Arc::new(LowTrust),
        delegate,
    );
    let cancellation = ProcessCancellation::default();
    let context = ToolExecutionContext {
        user_id: "owner".into(),
        session_id: "session".into(),
        action_id: "action".into(),
        project_root: PathBuf::from("."),
        origin: ExecutionOrigin::Agent,
        runtime_mode: RuntimeMode::Guarded,
        cancellation: cancellation.clone(),
        on_output: None,
    };
    let task = tokio::spawn(async move {
        executor
            .execute(
                "terminal.run",
                &json!({}),
                &context,
                ExecuteOptions::default(),
            )
            .await
    });
    tokio::time::timeout(Duration::from_secs(2), requested.notified())
        .await
        .unwrap();
    assert_eq!(consent.list_pending(Some("session")).len(), 1);
    cancellation.cancel();
    let result = tokio::time::timeout(Duration::from_secs(2), task)
        .await
        .unwrap()
        .unwrap()
        .unwrap();
    assert!(!result.ok);
    tokio::time::timeout(Duration::from_secs(2), async {
        while !consent.list_pending(Some("session")).is_empty() {
            tokio::task::yield_now().await;
        }
    })
    .await
    .unwrap();
    assert_eq!(calls.load(Ordering::SeqCst), 0);
}

#[tokio::test]
async fn cancellation_wins_when_consent_is_approved_before_waiter_resumes() {
    use std::sync::atomic::{AtomicUsize, Ordering};
    let requested = Arc::new(tokio::sync::Notify::new());
    let observer = requested.clone();
    let consent = ConsentManager::new(ConsentManagerOptions {
        on_request: Some(Arc::new(move |_| {
            observer.notify_one();
            Ok(())
        })),
        ..ConsentManagerOptions::default()
    });
    let calls = Arc::new(AtomicUsize::new(0));
    let observed_calls = calls.clone();
    let delegate: ToolDelegate = Arc::new(move |_, _, _, _permit| {
        observed_calls.fetch_add(1, Ordering::SeqCst);
        Box::pin(async { Ok(ToolResult::message(true, "executed")) })
    });
    let executor = ConsentAwareExecutor::new(
        ConsentExecutorOptions {
            user_id: "owner".into(),
            session_id: "session".into(),
            permissions: HashMap::new(),
            session_approvals: Default::default(),
            profile_name: None,
            max_concurrent: NonZeroU16::new(1).unwrap(),
        },
        consent.clone(),
        Arc::new(LowTrust),
        delegate,
    );
    let cancellation = ProcessCancellation::default();
    let context = ToolExecutionContext {
        user_id: "owner".into(),
        session_id: "session".into(),
        action_id: "action".into(),
        project_root: PathBuf::from("."),
        origin: ExecutionOrigin::Agent,
        runtime_mode: RuntimeMode::Guarded,
        cancellation: cancellation.clone(),
        on_output: None,
    };
    let task = tokio::spawn(async move {
        executor
            .execute(
                "terminal.run",
                &json!({}),
                &context,
                ExecuteOptions::default(),
            )
            .await
    });
    tokio::time::timeout(Duration::from_secs(2), requested.notified())
        .await
        .unwrap();
    assert_eq!(consent.list_pending(Some("session")).len(), 1);
    let request_id = consent.list_pending(Some("session"))[0].snapshot().id;
    cancellation.cancel();
    assert!(consent.approve(&request_id, None, None).unwrap());
    let result = tokio::time::timeout(Duration::from_secs(2), task)
        .await
        .unwrap()
        .unwrap()
        .unwrap();
    assert!(!result.ok);
    tokio::time::timeout(Duration::from_secs(2), async {
        while !consent.list_pending(Some("session")).is_empty() {
            tokio::task::yield_now().await;
        }
    })
    .await
    .unwrap();
    assert_eq!(calls.load(Ordering::SeqCst), 0);
}

#[tokio::test]
async fn cancellation_with_invalid_clock_removes_pending_consent() {
    use std::sync::atomic::{AtomicI64, AtomicUsize, Ordering};
    let clock = Arc::new(AtomicI64::new(0));
    let current = clock.clone();
    let requested = Arc::new(tokio::sync::Notify::new());
    let observer = requested.clone();
    let consent = ConsentManager::new(ConsentManagerOptions {
        clock: Arc::new(move || current.load(Ordering::SeqCst)),
        on_request: Some(Arc::new(move |_| {
            observer.notify_one();
            Ok(())
        })),
        ..ConsentManagerOptions::default()
    });
    let calls = Arc::new(AtomicUsize::new(0));
    let observed_calls = calls.clone();
    let delegate: ToolDelegate = Arc::new(move |_, _, _, _permit| {
        observed_calls.fetch_add(1, Ordering::SeqCst);
        Box::pin(async { Ok(ToolResult::message(true, "executed")) })
    });
    let executor = ConsentAwareExecutor::new(
        ConsentExecutorOptions {
            user_id: "owner".into(),
            session_id: "session".into(),
            permissions: HashMap::new(),
            session_approvals: Default::default(),
            profile_name: None,
            max_concurrent: NonZeroU16::new(1).unwrap(),
        },
        consent.clone(),
        Arc::new(LowTrust),
        delegate,
    );
    let cancellation = ProcessCancellation::default();
    let context = ToolExecutionContext {
        user_id: "owner".into(),
        session_id: "session".into(),
        action_id: "action".into(),
        project_root: PathBuf::from("."),
        origin: ExecutionOrigin::Agent,
        runtime_mode: RuntimeMode::Guarded,
        cancellation: cancellation.clone(),
        on_output: None,
    };
    let task = tokio::spawn(async move {
        executor
            .execute(
                "terminal.run",
                &json!({}),
                &context,
                ExecuteOptions::default(),
            )
            .await
    });
    tokio::time::timeout(Duration::from_secs(2), requested.notified())
        .await
        .unwrap();
    assert_eq!(consent.list_pending(Some("session")).len(), 1);
    let request = consent.list_pending(Some("session"))[0].clone();
    clock.store(i64::MAX, Ordering::SeqCst);
    cancellation.cancel();
    let result = tokio::time::timeout(Duration::from_secs(2), task)
        .await
        .unwrap()
        .unwrap()
        .unwrap();
    assert!(!result.ok);
    tokio::time::timeout(Duration::from_secs(2), async {
        // Cancellation claims the request off the pending queue under the queue
        // lock, while the terminal status is written by the deferred transition.
        // Both must settle before the retained snapshot observes Rejected.
        while !consent.list_pending(Some("session")).is_empty()
            || request.snapshot().status == ConsentStatus::Pending
        {
            tokio::task::yield_now().await;
        }
    })
    .await
    .unwrap();
    assert_eq!(request.snapshot().status, ConsentStatus::Rejected);
    assert!(!consent.approve(&request.snapshot().id, None, None).unwrap());
    assert_eq!(calls.load(Ordering::SeqCst), 0);
}

#[tokio::test]
async fn cancellation_claim_blocks_approval_and_retains_permit_until_finalized() {
    use std::sync::{
        Condvar,
        atomic::{AtomicUsize, Ordering},
    };
    let requested = Arc::new(tokio::sync::Notify::new());
    let request_notice = requested.clone();
    let entered = Arc::new(tokio::sync::Notify::new());
    let entered_notice = entered.clone();
    let release = Arc::new((Mutex::new(false), Condvar::new()));
    let observer_release = release.clone();
    let consent = ConsentManager::new(ConsentManagerOptions {
        on_request: Some(Arc::new(move |_| {
            request_notice.notify_one();
            Ok(())
        })),
        on_decision: Some(Arc::new(move |_| {
            entered_notice.notify_one();
            let (lock, wake) = &*observer_release;
            let mut released = lock.lock().unwrap();
            while !*released {
                released = wake.wait(released).unwrap();
            }
            Ok(())
        })),
        ..ConsentManagerOptions::default()
    });
    let calls = Arc::new(AtomicUsize::new(0));
    let observed = calls.clone();
    let delegate: ToolDelegate = Arc::new(move |_, _, _, _permit| {
        observed.fetch_add(1, Ordering::SeqCst);
        Box::pin(async { Ok(ToolResult::message(true, "executed")) })
    });
    let executor = Arc::new(ConsentAwareExecutor::new(
        ConsentExecutorOptions {
            user_id: "owner".into(),
            session_id: "session".into(),
            permissions: HashMap::new(),
            session_approvals: Default::default(),
            profile_name: None,
            max_concurrent: NonZeroU16::new(1).unwrap(),
        },
        consent.clone(),
        Arc::new(LowTrust),
        delegate,
    ));
    let cancellation = ProcessCancellation::default();
    let context = ToolExecutionContext {
        user_id: "owner".into(),
        session_id: "session".into(),
        action_id: "action".into(),
        project_root: PathBuf::from("."),
        origin: ExecutionOrigin::Agent,
        runtime_mode: RuntimeMode::Guarded,
        cancellation: cancellation.clone(),
        on_output: None,
    };
    let task_executor = executor.clone();
    let task_context = context.clone();
    let task = tokio::spawn(async move {
        task_executor
            .execute(
                "terminal.run",
                &json!({}),
                &task_context,
                ExecuteOptions::default(),
            )
            .await
    });
    tokio::time::timeout(Duration::from_secs(2), requested.notified())
        .await
        .unwrap();
    let request_id = consent.list_pending(Some("session"))[0].snapshot().id;
    cancellation.cancel();
    let result = tokio::time::timeout(Duration::from_secs(2), task)
        .await
        .unwrap()
        .unwrap()
        .unwrap();
    let entered_result = tokio::time::timeout(Duration::from_secs(2), entered.notified()).await;
    let approval = consent.approve(&request_id, None, None);
    let mut next_context = context;
    next_context.cancellation = ProcessCancellation::default();
    let capacity = executor
        .execute(
            "terminal.run",
            &json!({}),
            &next_context,
            ExecuteOptions {
                dry_run: true,
                ..ExecuteOptions::default()
            },
        )
        .await;
    {
        let (lock, wake) = &*release;
        *lock.lock().unwrap() = true;
        wake.notify_all();
    }
    assert!(entered_result.is_ok());
    assert!(!result.ok);
    assert!(!approval.unwrap());
    assert_eq!(capacity.unwrap_err(), "tool execution capacity unavailable");
    tokio::time::timeout(Duration::from_secs(2), async {
        loop {
            if executor
                .execute(
                    "terminal.run",
                    &json!({}),
                    &next_context,
                    ExecuteOptions {
                        dry_run: true,
                        ..ExecuteOptions::default()
                    },
                )
                .await
                .is_ok()
            {
                break;
            }
            tokio::task::yield_now().await;
        }
    })
    .await
    .unwrap();
    assert_eq!(calls.load(Ordering::SeqCst), 0);
}
