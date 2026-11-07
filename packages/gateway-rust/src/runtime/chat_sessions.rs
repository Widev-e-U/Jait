//! Application-owned admission for the candidate native chat path. Construct one
//! manager per runtime and share clones; no HTTP route or production activation.
use super::{
    chat_store::SqliteTurnStore,
    chat_turn::{
        TurnConfig, TurnCoordinator, TurnError, TurnEvent, TurnOutcome, TurnPersistence,
        TurnProvider, TurnTools,
    },
};
use crate::{
    providers::openai_stream::EventSink, security::consent_executor::ToolExecutionContext,
};
use futures_util::future::BoxFuture;
use std::{
    collections::HashSet,
    num::NonZeroU16,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
};
use tokio::{
    sync::{OwnedSemaphorePermit, Semaphore},
    time::Instant,
};

/// Admission keys identify the durable history, not a replaceable provider session.
/// All writers for a history must use the same manager and canonical key.
#[derive(Clone, Debug, Eq, Hash, PartialEq)]
pub enum TurnStoreKey {
    Chat(String),
    Thread(String),
}

/// An authenticated, owned handle to one durable history. Implementations must
/// revalidate authority on every storage operation and choose the same key for
/// all handles that write the same history. Never derive identity from model input.
/// The owned handle must preserve identity and share the same underlying history.
pub trait SessionTurnStore: TurnPersistence + Send + Sync + 'static {
    fn identity(&self) -> (&str, &str);
    fn admission_key(&self) -> TurnStoreKey;
    fn owned_handle(&self) -> Arc<dyn SessionTurnStore>;
    fn load(&self) -> BoxFuture<'_, Result<Vec<TurnEvent>, String>>;
}

impl SessionTurnStore for SqliteTurnStore {
    fn identity(&self) -> (&str, &str) {
        SqliteTurnStore::identity(self)
    }
    fn admission_key(&self) -> TurnStoreKey {
        TurnStoreKey::Chat(SqliteTurnStore::identity(self).1.to_owned())
    }
    fn owned_handle(&self) -> Arc<dyn SessionTurnStore> {
        Arc::new(self.clone())
    }
    fn load(&self) -> BoxFuture<'_, Result<Vec<TurnEvent>, String>> {
        Box::pin(SqliteTurnStore::load(self))
    }
}

pub struct SessionTurn<'a> {
    pub config: TurnConfig,
    pub provider: &'a dyn TurnProvider,
    pub tools: &'a dyn TurnTools,
    pub store: &'a dyn SessionTurnStore,
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
    sessions: Mutex<HashSet<TurnStoreKey>>,
    permits: Arc<Semaphore>,
    drained: tokio::sync::Notify,
}
#[derive(Clone)]
pub struct SessionTurnManager(Arc<Admission>);
impl SessionTurnManager {
    pub fn new(max_in_flight: NonZeroU16) -> Self {
        Self(Arc::new(Admission {
            sessions: Mutex::new(HashSet::new()),
            permits: Arc::new(Semaphore::new(usize::from(max_in_flight.get()))),
            drained: tokio::sync::Notify::new(),
        }))
    }
    /// Wait for all admitted work, including detached storage tasks, to finish.
    /// The caller must first prevent new admissions; otherwise an empty snapshot
    /// cannot establish that the manager will remain drained.
    pub async fn wait_drained(&self) {
        loop {
            let notified = self.0.drained.notified();
            tokio::pin!(notified);
            notified.as_mut().enable();
            if self.0.sessions.lock().unwrap().is_empty() {
                return;
            }
            notified.await;
        }
    }
    /// The lease covers storage load, generation, tools and every durable write.
    /// Dropping the caller retains admission until any dispatched store operation finishes.
    /// It never retries model tool ids.
    pub async fn run(&self, mut request: SessionTurn<'_>) -> Result<TurnOutcome, SessionTurnError> {
        let handle = request.store.owned_handle();
        let (owner, session) = handle.identity();
        if owner != request.context.user_id || session != request.context.session_id {
            return Err(SessionTurnError::ContextMismatch);
        }
        request.config.validate().map_err(SessionTurnError::Turn)?;
        let lease = Arc::new(self.acquire_key(handle.admission_key())?);
        let store = LeasedStore {
            store: handle,
            lease,
            serial: Arc::new(tokio::sync::Mutex::new(())),
            failed: Arc::new(AtomicBool::new(false)),
        };
        let deadline = Instant::now() + request.config.timeout;
        let result = async {
            let events = tokio::select! { biased;
                _ = request.context.cancellation.wait_cancelled() => return Err(SessionTurnError::Turn(TurnError::Cancelled)),
                _ = tokio::time::sleep_until(deadline) => return Err(SessionTurnError::Turn(TurnError::TimedOut)),
                events = store.load() => events.map_err(SessionTurnError::Storage)?,
            };
            request.config.timeout = deadline
                .checked_duration_since(Instant::now())
                .filter(|remaining| !remaining.is_zero())
                .ok_or(SessionTurnError::Turn(TurnError::TimedOut))?;
            TurnCoordinator {
                config: request.config,
                provider: request.provider,
                tools: request.tools,
                persistence: &store,
            }
            .run(
                events.iter().map(|event| event.to_message()).collect(),
                request.user_content,
                request.context,
                request.sink,
            )
            .await
            .map_err(SessionTurnError::Turn)
        }.await;
        // A cancelled coordinator can drop a storage future after its SQL was
        // dispatched. Wait for that task's definitive result before finalizing.
        let _drained = store.serial.lock().await;
        if store.failed.load(Ordering::Acquire) {
            return Err(SessionTurnError::Storage(
                "Turn storage operation failed".into(),
            ));
        }
        result
    }

    #[cfg(test)]
    fn acquire(&self, session: &str) -> Result<SessionLease, SessionTurnError> {
        self.acquire_key(TurnStoreKey::Chat(session.to_owned()))
    }
    fn acquire_key(&self, session: TurnStoreKey) -> Result<SessionLease, SessionTurnError> {
        let mut sessions = self.0.sessions.lock().unwrap();
        if sessions.contains(&session) {
            return Err(SessionTurnError::SessionBusy);
        }
        let permit = self
            .0
            .permits
            .clone()
            .try_acquire_owned()
            .map_err(|_| SessionTurnError::Capacity)?;
        sessions.insert(session.clone());
        Ok(SessionLease {
            admission: self.0.clone(),
            session,
            _permit: permit,
        })
    }
}
// Detached store tasks keep admission until the worker replies, even if the turn
// times out or its caller is dropped. A stuck database consumes bounded capacity.
struct LeasedStore {
    store: Arc<dyn SessionTurnStore>,
    lease: Arc<SessionLease>,
    serial: Arc<tokio::sync::Mutex<()>>,
    failed: Arc<AtomicBool>,
}
// Set on unwind as well as an ordinary storage failure. The guard is held
// until the detached task finishes, so the owner observes the flag after drain.
struct StorageTaskFailure(Arc<AtomicBool>);
impl Drop for StorageTaskFailure {
    fn drop(&mut self) {
        if std::thread::panicking() {
            self.0.store(true, Ordering::Release);
        }
    }
}
impl LeasedStore {
    async fn supervised<T: Send + 'static>(
        &self,
        operation: impl std::future::Future<Output = Result<T, String>> + Send + 'static,
    ) -> Result<T, String> {
        let guard = self.serial.clone().lock_owned().await;
        let lease = self.lease.clone();
        let failed = self.failed.clone();
        tokio::spawn(async move {
            let _guard = guard;
            let _lease = lease;
            let _panic = StorageTaskFailure(failed.clone());
            let result = operation.await;
            if result.is_err() {
                failed.store(true, Ordering::Release);
            }
            result
        })
        .await
        .map_err(|_| "Turn storage task failed".to_string())?
    }
    async fn load(&self) -> Result<Vec<TurnEvent>, String> {
        let store = self.store.clone();
        self.supervised(async move { store.load().await }).await
    }
}
impl TurnPersistence for LeasedStore {
    fn check_capacity(
        &self,
        events: usize,
        bytes: usize,
        max_event_bytes: usize,
    ) -> BoxFuture<'_, Result<(), String>> {
        let store = self.store.clone();
        Box::pin(
            self.supervised(
                async move { store.check_capacity(events, bytes, max_event_bytes).await },
            ),
        )
    }
    fn check_authority(&self) -> BoxFuture<'_, Result<(), String>> {
        let store = self.store.clone();
        Box::pin(self.supervised(async move { store.check_authority().await }))
    }
    fn append(&self, event: TurnEvent) -> BoxFuture<'_, Result<(), String>> {
        let store = self.store.clone();
        Box::pin(self.supervised(async move { store.append(event).await }))
    }
}
struct SessionLease {
    admission: Arc<Admission>,
    session: TurnStoreKey,
    _permit: OwnedSemaphorePermit,
}
impl Drop for SessionLease {
    fn drop(&mut self) {
        self.admission
            .sessions
            .lock()
            .unwrap()
            .remove(&self.session);
        self.admission.drained.notify_waiters();
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
    #[tokio::test]
    async fn abandoned_storage_result_is_observed_before_drain() {
        let (auth, store, _) = fixture();
        let manager = SessionTurnManager::new(NonZeroU16::new(1).unwrap());
        let leased = LeasedStore {
            store: Arc::new(store),
            lease: Arc::new(manager.acquire("session").unwrap()),
            serial: Arc::new(tokio::sync::Mutex::new(())),
            failed: Arc::new(AtomicBool::new(false)),
        };
        let (started_tx, started_rx) = tokio::sync::oneshot::channel();
        let (release_tx, release_rx) = tokio::sync::oneshot::channel();
        let mut operation = Box::pin(leased.supervised(async move {
            let _ = started_tx.send(());
            let _ = release_rx.await;
            Err::<(), _>("late failure".to_owned())
        }));
        tokio::select! {
            _ = started_rx => {},
            _ = &mut operation => panic!("operation finished before release"),
        }
        drop(operation);
        assert!(
            tokio::time::timeout(Duration::from_millis(20), leased.serial.lock())
                .await
                .is_err()
        );
        assert!(matches!(
            manager.acquire("session"),
            Err(SessionTurnError::SessionBusy)
        ));
        release_tx.send(()).unwrap();
        let _drained = leased.serial.lock().await;
        assert!(leased.failed.load(Ordering::Acquire));
        drop(_drained);
        drop(leased);
        assert!(manager.acquire("session").is_ok());
        auth.shutdown().await.unwrap();
    }
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn timed_out_started_append_retains_session_and_capacity() {
        let (auth, store, _) = fixture();
        let (started_tx, started_rx) = tokio::sync::oneshot::channel();
        let (release_tx, release_rx) = std::sync::mpsc::channel();
        auth.with_database(move |db| {
            let mut started = Some(started_tx);
            db.progress_handler(
                1,
                Some(move || {
                    if let Some(started) = started.take() {
                        let _ = started.send(());
                        let _ = release_rx.recv();
                    }
                    false
                }),
            )?;
            Ok(())
        })
        .await
        .unwrap();
        let manager = SessionTurnManager::new(NonZeroU16::new(1).unwrap());
        let leased = LeasedStore {
            store: Arc::new(store.clone()),
            lease: Arc::new(manager.acquire("session").unwrap()),
            serial: Arc::new(tokio::sync::Mutex::new(())),
            failed: Arc::new(AtomicBool::new(false)),
        };
        let task = tokio::spawn(async move {
            tokio::time::timeout(
                Duration::from_millis(100),
                leased.append(TurnEvent::User {
                    content: "late".into(),
                }),
            )
            .await
        });
        started_rx.await.unwrap();
        assert!(task.await.unwrap().is_err());
        assert!(matches!(
            manager.acquire("session"),
            Err(SessionTurnError::SessionBusy)
        ));
        assert!(matches!(
            manager.acquire("other"),
            Err(SessionTurnError::Capacity)
        ));
        release_tx.send(()).unwrap();
        // A subsequent worker request establishes that the started write completed.
        auth.with_database(|db| {
            db.progress_handler(0, None::<fn() -> bool>)?;
            Ok(())
        })
        .await
        .unwrap();
        assert_eq!(store.load().await.unwrap().len(), 1);
        assert!(manager.acquire("session").is_ok());
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
    #[derive(Clone)]
    struct FocusedThreadStore {
        owner: String,
        session: String,
        thread: String,
        load_error: bool,
        authority_error: bool,
    }
    impl TurnPersistence for FocusedThreadStore {
        fn check_capacity(
            &self,
            _: usize,
            _: usize,
            _: usize,
        ) -> BoxFuture<'_, Result<(), String>> {
            Box::pin(async { Ok(()) })
        }
        fn append(&self, _: TurnEvent) -> BoxFuture<'_, Result<(), String>> {
            Box::pin(async { Ok(()) })
        }
        fn check_authority(&self) -> BoxFuture<'_, Result<(), String>> {
            Box::pin(async move {
                if self.authority_error {
                    Err("revoked".into())
                } else {
                    Ok(())
                }
            })
        }
    }
    impl SessionTurnStore for FocusedThreadStore {
        fn identity(&self) -> (&str, &str) {
            (&self.owner, &self.session)
        }
        fn admission_key(&self) -> TurnStoreKey {
            TurnStoreKey::Thread(self.thread.clone())
        }
        fn owned_handle(&self) -> Arc<dyn SessionTurnStore> {
            Arc::new(self.clone())
        }
        fn load(&self) -> BoxFuture<'_, Result<Vec<TurnEvent>, String>> {
            Box::pin(async move {
                if self.load_error {
                    Err("fixture load failed".into())
                } else {
                    Ok(vec![])
                }
            })
        }
    }

    #[tokio::test]
    async fn focused_store_domains_exclude_same_history_and_share_capacity() {
        let (auth, chat, context) = fixture();
        let manager = SessionTurnManager::new(NonZeroU16::new(2).unwrap());
        let thread = FocusedThreadStore {
            owner: "owner".into(),
            session: "session".into(),
            thread: "session".into(),
            load_error: false,
            authority_error: false,
        };
        let chat_lease = manager.acquire_key(chat.admission_key()).unwrap();
        let thread_lease = manager.acquire_key(thread.admission_key()).unwrap();
        let mut replacement = thread.clone();
        replacement.session = "replacement".into();
        assert!(matches!(
            manager.acquire_key(replacement.admission_key()),
            Err(SessionTurnError::SessionBusy)
        ));
        assert!(matches!(
            manager.acquire_key(TurnStoreKey::Thread("other".into())),
            Err(SessionTurnError::Capacity)
        ));
        drop(thread_lease);
        drop(chat_lease);
        let mut req = request(&chat, &context, &FinishProvider);
        req.store = &thread;
        assert!(manager.run(req).await.is_ok());
        auth.shutdown().await.unwrap();
    }

    #[tokio::test]
    async fn focused_store_context_and_load_failure_are_enforced() {
        let (auth, chat, context) = fixture();
        let manager = SessionTurnManager::new(NonZeroU16::new(1).unwrap());
        let mut thread = FocusedThreadStore {
            owner: "other".into(),
            session: "session".into(),
            thread: "thread".into(),
            load_error: true,
            authority_error: false,
        };
        let mut req = request(&chat, &context, &FinishProvider);
        req.store = &thread;
        assert!(matches!(
            manager.run(req).await,
            Err(SessionTurnError::ContextMismatch)
        ));
        thread.owner = "owner".into();
        let mut req = request(&chat, &context, &FinishProvider);
        req.store = &thread;
        assert!(matches!(
            manager.run(req).await,
            Err(SessionTurnError::Storage(_))
        ));
        assert!(manager.acquire_key(thread.admission_key()).is_ok());
        auth.shutdown().await.unwrap();
    }
    #[tokio::test]
    async fn focused_store_authority_override_is_supervised() {
        let manager = SessionTurnManager::new(NonZeroU16::new(1).unwrap());
        let thread = FocusedThreadStore {
            owner: "owner".into(),
            session: "session".into(),
            thread: "thread".into(),
            load_error: false,
            authority_error: true,
        };
        let leased = LeasedStore {
            store: Arc::new(thread),
            lease: Arc::new(
                manager
                    .acquire_key(TurnStoreKey::Thread("thread".into()))
                    .unwrap(),
            ),
            serial: Arc::new(tokio::sync::Mutex::new(())),
            failed: Arc::new(AtomicBool::new(false)),
        };
        assert_eq!(leased.check_authority().await.unwrap_err(), "revoked");
        assert!(leased.failed.load(Ordering::Acquire));
    }
}
