//! Actual HTTP + consent + bounded subprocess + persistent restart composition.
use super::{chat_store::SqliteTurnStore, chat_turn::*};
use crate::{
    db,
    execution::process_runner::{ProcessCancellation, ProcessPool, ProcessRequest},
    providers::openai_stream::{EventSink, OpenAiHttp},
    routes::auth::AuthState,
    security::{
        consent_executor::*,
        consent_manager::{ConsentManager, ConsentManagerOptions},
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
    let delegate: ToolDelegate = Arc::new(move |name, input, context| {
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
