//! Application-owned admission for the candidate native chat path. Construct one
//! manager per runtime and share clones; no HTTP route or production activation.
use super::{
    chat_store::SqliteTurnStore,
    chat_turn::{TurnConfig, TurnCoordinator, TurnError, TurnOutcome, TurnProvider, TurnTools},
};
use crate::{
    providers::openai_stream::EventSink, security::consent_executor::ToolExecutionContext,
};
use std::{
    collections::HashSet,
    num::NonZeroU16,
    sync::{Arc, Mutex},
};
use tokio::{
    sync::{OwnedSemaphorePermit, Semaphore},
    time::Instant,
};

pub struct SessionTurn<'a> {
    pub config: TurnConfig,
    pub provider: &'a dyn TurnProvider,
    pub tools: &'a dyn TurnTools,
    pub store: &'a SqliteTurnStore,
    pub context: &'a ToolExecutionContext,
    pub user_content: String,
    pub sink: EventSink,
}
#[derive(Debug, PartialEq, Eq)]
pub enum SessionTurnError {
    ContextMismatch,
    SessionBusy,
    Capacity,
    Storage(String),
    Turn(TurnError),
}
struct Admission {
    sessions: Mutex<HashSet<String>>,
    permits: Arc<Semaphore>,
}
#[derive(Clone)]
pub struct SessionTurnManager(Arc<Admission>);
impl SessionTurnManager {
    pub fn new(max_in_flight: NonZeroU16) -> Self {
        Self(Arc::new(Admission {
            sessions: Mutex::new(HashSet::new()),
            permits: Arc::new(Semaphore::new(usize::from(max_in_flight.get()))),
        }))
    }
    /// The lease covers storage load, generation, tools and every durable write.
    /// Dropping this future releases admission; it never retries model tool ids.
    pub async fn run(&self, mut request: SessionTurn<'_>) -> Result<TurnOutcome, SessionTurnError> {
        let (owner, session) = request.store.identity();
        if owner != request.context.user_id || session != request.context.session_id {
            return Err(SessionTurnError::ContextMismatch);
        }
        request.config.validate().map_err(SessionTurnError::Turn)?;
        let _lease = self.acquire(session)?;
        let deadline = Instant::now() + request.config.timeout;
        let events = tokio::select! { biased;
            _ = request.context.cancellation.wait_cancelled() => return Err(SessionTurnError::Turn(TurnError::Cancelled)),
            _ = tokio::time::sleep_until(deadline) => return Err(SessionTurnError::Turn(TurnError::TimedOut)),
            events = request.store.load() => events.map_err(SessionTurnError::Storage)?,
        };
        request.config.timeout = deadline
            .checked_duration_since(Instant::now())
            .filter(|remaining| !remaining.is_zero())
            .ok_or(SessionTurnError::Turn(TurnError::TimedOut))?;
        TurnCoordinator {
            config: request.config,
            provider: request.provider,
            tools: request.tools,
            persistence: request.store,
        }
        .run(
            events.iter().map(|event| event.to_message()).collect(),
            request.user_content,
            request.context,
            request.sink,
        )
        .await
        .map_err(SessionTurnError::Turn)
    }
    fn acquire(&self, session: &str) -> Result<SessionLease, SessionTurnError> {
        let mut sessions = self.0.sessions.lock().unwrap();
        if sessions.contains(session) {
            return Err(SessionTurnError::SessionBusy);
        }
        let permit = self
            .0
            .permits
            .clone()
            .try_acquire_owned()
            .map_err(|_| SessionTurnError::Capacity)?;
        sessions.insert(session.to_owned());
        Ok(SessionLease {
            admission: self.0.clone(),
            session: session.to_owned(),
            _permit: permit,
        })
    }
}
struct SessionLease {
    admission: Arc<Admission>,
    session: String,
    _permit: OwnedSemaphorePermit,
}
impl Drop for SessionLease {
    fn drop(&mut self) {
        self.admission
            .sessions
            .lock()
            .unwrap()
            .remove(&self.session);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        db,
        execution::process_runner::ProcessCancellation,
        providers::openai_stream::{ParsedStream, StreamFailure},
        routes::auth::AuthState,
        security::consent_executor::{ExecutionOrigin, RuntimeMode, ToolResult},
    };
    use futures_util::future::BoxFuture;
    use serde_json::Value;
    use std::{path::Path, time::Duration};
    struct WaitingProvider {
        started: tokio::sync::Notify,
    }
    impl TurnProvider for WaitingProvider {
        fn stream<'a>(
            &'a self,
            _: Value,
            _: &'a ProcessCancellation,
            _: EventSink,
        ) -> BoxFuture<'a, Result<ParsedStream, StreamFailure>> {
            Box::pin(async move {
                self.started.notify_one();
                std::future::pending().await
            })
        }
    }
    struct FinishProvider;
    impl TurnProvider for FinishProvider {
        fn stream<'a>(
            &'a self,
            _: Value,
            _: &'a ProcessCancellation,
            _: EventSink,
        ) -> BoxFuture<'a, Result<ParsedStream, StreamFailure>> {
            Box::pin(async {
                Ok(ParsedStream {
                    content_text: "done".into(),
                    finish_reason: Some("stop".into()),
                    ..ParsedStream::default()
                })
            })
        }
    }
    struct NoTools;
    impl TurnTools for NoTools {
        fn execute<'a>(
            &'a self,
            _: &'a str,
            _: &'a Value,
            _: &'a ToolExecutionContext,
        ) -> BoxFuture<'a, Result<ToolResult, String>> {
            panic!("unexpected tool")
        }
    }
    fn fixture() -> (AuthState, SqliteTurnStore, ToolExecutionContext) {
        let root = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../.jait/artifacts/gateway-rust/chat-sessions")
            .join(uuid::Uuid::new_v4().to_string());
        std::fs::create_dir_all(&root).unwrap();
        let database = db::open_database(&root.join("sessions.sqlite")).unwrap();
        db::migrate_database(&database).unwrap();
        database.execute("INSERT INTO sessions(id,user_id,created_at,last_active_at,status) VALUES('session','owner','2026-10-21','2026-10-21','active')",[]).unwrap();
        let auth = AuthState::new(database, "fixture".into()).unwrap();
        let store = SqliteTurnStore::new(auth.clone(), "owner".into(), "session".into()).unwrap();
        let context = ToolExecutionContext {
            user_id: "owner".into(),
            session_id: "session".into(),
            action_id: "turn".into(),
            project_root: root,
            origin: ExecutionOrigin::Agent,
            runtime_mode: RuntimeMode::Guarded,
            cancellation: ProcessCancellation::default(),
            on_output: None,
        };
        (auth, store, context)
    }
    fn request<'a>(
        store: &'a SqliteTurnStore,
        context: &'a ToolExecutionContext,
        provider: &'a dyn TurnProvider,
    ) -> SessionTurn<'a> {
        SessionTurn {
            config: TurnConfig {
                model: "model".into(),
                tools: vec![],
                max_rounds: 2,
                max_tool_calls: 2,
                max_history_bytes: 16 * 1024,
                max_tool_result_bytes: 1024,
                timeout: Duration::from_secs(10),
            },
            provider,
            tools: &NoTools,
            store,
            context,
            user_content: "hello".into(),
            sink: Arc::new(|_| Box::pin(async { Ok(()) })),
        }
    }
    #[tokio::test]
    async fn shared_manager_rejects_concurrent_same_session_and_releases_after_abort() {
        let (auth, store, context) = fixture();
        let manager = SessionTurnManager::new(NonZeroU16::new(2).unwrap());
        let provider = Arc::new(WaitingProvider {
            started: tokio::sync::Notify::new(),
        });
        let task = {
            let manager = manager.clone();
            let store = store.clone();
            let context = context.clone();
            let provider = provider.clone();
            tokio::spawn(async move { manager.run(request(&store, &context, &*provider)).await })
        };
        provider.started.notified().await;
        assert_eq!(
            manager
                .clone()
                .run(request(&store, &context, &FinishProvider))
                .await
                .unwrap_err(),
            SessionTurnError::SessionBusy
        );
        task.abort();
        assert!(task.await.unwrap_err().is_cancelled());
        assert_eq!(
            manager
                .run(request(&store, &context, &FinishProvider))
                .await
                .unwrap()
                .content,
            "done"
        );
        assert_eq!(store.load().await.unwrap().len(), 3);
        auth.shutdown().await.unwrap();
    }
    #[tokio::test]
    async fn mismatched_context_and_cancelled_turn_do_not_consume_capacity() {
        let (auth, store, context) = fixture();
        let manager = SessionTurnManager::new(NonZeroU16::new(1).unwrap());
        let mut bad = context.clone();
        bad.user_id = "other".into();
        assert_eq!(
            manager
                .run(request(&store, &bad, &FinishProvider))
                .await
                .unwrap_err(),
            SessionTurnError::ContextMismatch
        );
        let cancelled = context.clone();
        cancelled.cancellation.cancel();
        assert_eq!(
            manager
                .run(request(&store, &cancelled, &FinishProvider))
                .await
                .unwrap_err(),
            SessionTurnError::Turn(TurnError::Cancelled)
        );
        assert!(store.load().await.unwrap().is_empty());
        let mut fresh = context.clone();
        fresh.cancellation = ProcessCancellation::default();
        assert!(
            manager
                .run(request(&store, &fresh, &FinishProvider))
                .await
                .is_ok()
        );
        auth.shutdown().await.unwrap();
    }
    #[test]
    fn capacity_and_session_admission_are_bounded_and_release_on_drop() {
        let manager = SessionTurnManager::new(NonZeroU16::new(1).unwrap());
        let lease = manager.acquire("one").unwrap();
        assert!(matches!(
            manager.acquire("one"),
            Err(SessionTurnError::SessionBusy)
        ));
        assert!(matches!(
            manager.acquire("two"),
            Err(SessionTurnError::Capacity)
        ));
        drop(lease);
        assert!(manager.acquire("two").is_ok());
    }
}
