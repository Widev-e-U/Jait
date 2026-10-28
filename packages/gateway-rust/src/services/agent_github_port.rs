//! Shared GitHub credential-service operations. Host implementations retain effect authority.
use crate::tools::core_io::HostError;
use futures_util::future::BoxFuture;
use serde_json::Value;
use std::sync::Arc;

#[derive(Clone, Debug)]
pub enum GithubOperation {
    Initialize,
    CurrentAgent {
        user: String,
        thread: Option<String>,
    },
    List(String),
    Get(String, String),
    PublicBaseUrl,
    WebhookSecret(String, String),
    Test(String, String),
    ResolveEnv(String, String),
    BeginSetup {
        user: String,
        agent: String,
        options: Value,
    },
    SaveManual {
        user: String,
        agent: String,
        options: Value,
    },
    BeginInstallation(String, String),
    AttachInstallation(String, String, Value),
    Verify(String, String),
    Disconnect(String, String),
    ReadState(Value),
    CompleteSetup(String, String, Value),
    CompleteCallback(super::agent_github_apps::GithubSetupCallback),
    FindByAppId(String),
    FindByInstallationId(String),
}
pub type GithubPort =
    Arc<dyn Fn(GithubOperation) -> BoxFuture<'static, Result<Value, HostError>> + Send + Sync>;

use super::agent_github_apps::{AgentGithubAppService, GithubEffect};
use crate::db::worker::{DatabaseError, DatabaseWorker, OperationError};
use std::{
    collections::HashSet,
    num::NonZeroU16,
    sync::{
        Mutex,
        atomic::{AtomicU64, Ordering},
    },
};
use tokio::sync::{OwnedSemaphorePermit, Semaphore, watch};
use tokio::{
    task::JoinHandle,
    time::{Duration, MissedTickBehavior},
};

/// Explicit host lifecycle and authenticated current-agent resolver. Neither
/// callback receives credential/network authority from a request.
pub type GithubInitialize =
    Arc<dyn Fn() -> BoxFuture<'static, Result<(), HostError>> + Send + Sync>;
pub type GithubCurrentAgent = Arc<
    dyn Fn(String, Option<String>) -> BoxFuture<'static, Result<Value, HostError>> + Send + Sync,
>;
pub struct GithubHost {
    pub initialize: GithubInitialize,
    pub current_agent: GithubCurrentAgent,
    pub effect: GithubEffect,
}
struct Admission {
    owners: Mutex<HashSet<(String, String)>>,
    permits: Arc<Semaphore>,
}
struct OperationLease {
    admission: Arc<Admission>,
    owner: Option<(String, String)>,
    _permit: OwnedSemaphorePermit,
}
impl Drop for OperationLease {
    fn drop(&mut self) {
        if let Some(owner) = &self.owner {
            self.admission
                .owners
                .lock()
                .unwrap_or_else(|p| p.into_inner())
                .remove(owner);
        }
    }
}
/// One instance per database/runtime; all HTTP/tool/env clients share its port.
/// Entry adapters retain authentication, agent ownership and consent checks.
/// Busy owners and global overload are rejected before effects, without retry
/// or an unbounded waiter queue. Admission is process-local, not a DB lock.
pub struct NativeGithubPort {
    service: Arc<AgentGithubAppService>,
    worker: DatabaseWorker,
    host: GithubHost,
    admission: Arc<Admission>,
    cleanup: Mutex<Option<watch::Sender<bool>>>,
}
fn host_error(message: impl Into<String>) -> HostError {
    HostError::Error(message.into())
}
fn service_error(error: OperationError) -> HostError {
    host_error(error.to_string())
}
fn database_error(error: DatabaseError) -> HostError {
    match error {
        DatabaseError::Operation(error) => service_error(error),
        other => host_error(other.to_string()),
    }
}
impl GithubOperation {
    fn owner(&self) -> Option<(String, String)> {
        match self {
            Self::Get(u, a)
            | Self::WebhookSecret(u, a)
            | Self::Test(u, a)
            | Self::ResolveEnv(u, a)
            | Self::Verify(u, a)
            | Self::Disconnect(u, a)
            | Self::BeginInstallation(u, a)
            | Self::AttachInstallation(u, a, _)
            | Self::CompleteSetup(u, a, _) => Some((u.clone(), a.clone())),
            Self::CompleteCallback(callback) => {
                Some((callback.user.clone(), callback.agent.clone()))
            }
            Self::BeginSetup { user, agent, .. } | Self::SaveManual { user, agent, .. } => {
                Some((user.clone(), agent.clone()))
            }
            _ => None,
        }
    }
}
impl NativeGithubPort {
    pub fn new(
        service: Arc<AgentGithubAppService>,
        worker: DatabaseWorker,
        host: GithubHost,
        capacity: NonZeroU16,
    ) -> Arc<Self> {
        Arc::new(Self {
            service,
            worker,
            cleanup: Mutex::new(None),
            host,
            admission: Arc::new(Admission {
                owners: Mutex::new(HashSet::new()),
                permits: Arc::new(Semaphore::new(usize::from(capacity.get()))),
            }),
        })
    }
    pub fn port(self: &Arc<Self>) -> GithubPort {
        let this = self.clone();
        Arc::new(move |operation| {
            let this = this.clone();
            Box::pin(async move { this.call(operation).await })
        })
    }
    /// Stop admissions; admitted work retains its lease until SQL/effects finish
    /// or are cancelled. The runtime separately owns database shutdown/drain.
    pub fn close(&self) {
        // Serialize close with start so a concurrent start cannot escape shutdown.
        let cleanup = self.cleanup.lock().unwrap_or_else(|p| p.into_inner());
        self.admission.permits.close();
        if let Some(stop) = &*cleanup {
            let _ = stop.send(true);
        }
    }
    /// Explicit runtime composition only: construction does not spawn background
    /// work. Start once, before mounting clients; retain the returned handle and
    /// await shutdown before closing the shared database. No network/host effects.
    pub fn start_expiry_cleanup(
        &self,
        period: Duration,
        batch: u16,
    ) -> Result<GithubExpiryCleanup, HostError> {
        if !(Duration::from_secs(1)..=Duration::from_secs(60)).contains(&period)
            || !(1..=256).contains(&batch)
        {
            return Err(host_error("Invalid GitHub cleanup limits"));
        }
        let runtime = tokio::runtime::Handle::try_current()
            .map_err(|_| host_error("GitHub cleanup requires an async runtime"))?;
        let mut slot = self
            .cleanup
            .lock()
            .map_err(|_| host_error("GitHub cleanup unavailable"))?;
        if self.admission.permits.is_closed() || slot.is_some() {
            return Err(host_error("GitHub cleanup already started or port closed"));
        }
        let (stop, mut cancelled) = watch::channel(false);
        let attempts = Arc::new(AtomicU64::new(0));
        let attempted = attempts.clone();
        let worker = self.worker.clone();
        let service = self.service.clone();
        let task = runtime.spawn(async move {
            let mut ticks = tokio::time::interval(period);
            ticks.set_missed_tick_behavior(MissedTickBehavior::Skip);
            loop {
                tokio::select! {
                    biased;
                    _ = cancelled.changed() => return Ok(()),
                    _ = ticks.tick() => {},
                }
                let service = service.clone();
                let cancelled = cancelled.clone();
                // Do not detach started SQL on cancellation: explicit shutdown
                // joins it. A queued sweep checks cancellation before touching DB.
                attempted.fetch_add(1, Ordering::Relaxed);
                match worker
                    .run(move |db| {
                        if *cancelled.borrow() {
                            return Ok(0);
                        }
                        service.expire_setup_challenges(db, batch)
                    })
                    .await
                {
                    Ok(_) | Err(DatabaseError::Busy) => {}
                    Err(error) => return Err(database_error(error)),
                }
            }
        });
        *slot = Some(stop.clone());
        Ok(GithubExpiryCleanup {
            stop,
            task: Some(task),
            attempts,
        })
    }
    fn acquire(&self, owner: Option<(String, String)>) -> Result<Arc<OperationLease>, HostError> {
        let mut owners = self
            .admission
            .owners
            .lock()
            .map_err(|_| host_error("GitHub admission unavailable"))?;
        if owner.as_ref().is_some_and(|owner| owners.contains(owner)) {
            return Err(host_error("GitHub agent operation is busy"));
        }
        let permit = self
            .admission
            .permits
            .clone()
            .try_acquire_owned()
            .map_err(|_| host_error("GitHub operation capacity unavailable"))?;
        if let Some(owner) = &owner {
            owners.insert(owner.clone());
        }
        Ok(Arc::new(OperationLease {
            admission: self.admission.clone(),
            owner,
            _permit: permit,
        }))
    }
    pub async fn call(&self, operation: GithubOperation) -> Result<Value, HostError> {
        if let GithubOperation::CompleteCallback(callback) = &operation {
            self.service
                .validate_setup_callback(callback)
                .map_err(service_error)?;
        }
        let lease = self.acquire(operation.owner())?;
        // SQL may finish after a caller drops its future. Every queued/started
        // job retains this lease, preventing a new same-owner operation then.
        let worker = self.worker.with_job_guard(lease);
        let s = self.service.clone();
        let effect = &self.host.effect;
        match operation {
            GithubOperation::Initialize => {
                (self.host.initialize)().await?;
                Ok(Value::Null)
            }
            GithubOperation::CurrentAgent { user, thread } => {
                (self.host.current_agent)(user, thread).await
            }
            GithubOperation::PublicBaseUrl => Ok(Value::String(s.public_base_url())),
            GithubOperation::ReadState(state) => Ok(state
                .as_str()
                .map(|v| s.read_state(v))
                .unwrap_or(Value::Null)),
            GithubOperation::Test(u, a) => {
                s.test(&worker, effect, &u, &a).await.map_err(service_error)
            }
            GithubOperation::ResolveEnv(u, a) => s
                .resolve_env(&worker, effect, &u, &a)
                .await
                .map(|v| v.unwrap_or(Value::Null))
                .map_err(service_error),
            GithubOperation::Verify(u, a) => s
                .verify(&worker, &u, &a, effect)
                .await
                .map_err(service_error),
            GithubOperation::CompleteCallback(callback) => s
                .complete_callback(&worker, callback, effect)
                .await
                .map_err(service_error),
            GithubOperation::CompleteSetup(u, a, code) => {
                let code = code
                    .as_str()
                    .ok_or_else(|| host_error("Invalid GitHub setup code"))?;
                s.complete_setup(&worker, &u, &a, code, effect)
                    .await
                    .map_err(service_error)
            }
            GithubOperation::AttachInstallation(u, a, id) => {
                let id = id
                    .as_str()
                    .ok_or_else(|| host_error("Invalid GitHub installation id"))?;
                s.attach_installation(&worker, &u, &a, id, effect)
                    .await
                    .map_err(service_error)
            }
            op => worker
                .run(move |db| match op {
                    GithubOperation::List(u) => s.list(db, &u),
                    GithubOperation::Get(u, a) => s.get(db, &u, &a),
                    GithubOperation::WebhookSecret(u, a) => s
                        .webhook_secret(db, &u, &a)
                        .map(|v| v.map(Value::String).unwrap_or(Value::Null)),
                    GithubOperation::BeginSetup {
                        user,
                        agent,
                        options,
                    } => Ok(serde_json::to_value(
                        s.begin_setup(db, &user, &agent, &options)?,
                    )?),
                    GithubOperation::BeginInstallation(u, a) => s.begin_installation(db, &u, &a),
                    GithubOperation::SaveManual {
                        user,
                        agent,
                        options,
                    } => s.save_manual(db, &user, &agent, &options),
                    GithubOperation::Disconnect(u, a) => s.disconnect(db, &u, &a),
                    GithubOperation::FindByAppId(id) => s.find_owner(db, "appId", &id),
                    GithubOperation::FindByInstallationId(id) => {
                        s.find_owner(db, "installationId", &id)
                    }
                    _ => unreachable!("non-SQL operation already dispatched"),
                })
                .await
                .map_err(database_error),
        }
    }
}

/// Host-owned lifecycle. Explicit shutdown drains an admitted SQL sweep; dropping
/// cancels the task, although SQLite work already started may still finish.
pub struct GithubExpiryCleanup {
    stop: watch::Sender<bool>,
    task: Option<JoinHandle<Result<(), HostError>>>,
    attempts: Arc<AtomicU64>,
}
impl GithubExpiryCleanup {
    /// Bounded diagnostic counter of attempts, including busy/rejected sweeps;
    /// this is not a count of successful updates or completed database jobs.
    pub fn attempted_sweeps(&self) -> u64 {
        self.attempts.load(Ordering::Relaxed)
    }
    /// Runtime supervisors can observe termination and join to recover the error.
    pub fn is_finished(&self) -> bool {
        self.task.as_ref().is_none_or(JoinHandle::is_finished)
    }
    pub fn cancel(&self) {
        let _ = self.stop.send(true);
    }
    pub async fn shutdown(mut self) -> Result<(), HostError> {
        self.cancel();
        self.task
            .take()
            .expect("cleanup task owned")
            .await
            .map_err(|_| host_error("GitHub cleanup task failed"))?
    }
}
impl Drop for GithubExpiryCleanup {
    fn drop(&mut self) {
        self.cancel();
        if let Some(task) = self.task.take() {
            task.abort();
        }
    }
}

#[cfg(test)]
mod expiry_tests {
    use super::*;
    use crate::services::agent_github_challenge as challenge;
    use rusqlite::{Connection, params};
    use std::sync::atomic::{AtomicI64, Ordering};

    const NOW: i64 = 1_700_000_000_123;
    fn database(count: usize) -> Connection {
        let db = Connection::open_in_memory().unwrap();
        challenge::ensure_schema(&db).unwrap();
        db.execute_batch("CREATE TABLE fixture_credentials(value TEXT); INSERT INTO fixture_credentials VALUES('keep encrypted credential');").unwrap();
        for n in 0..count {
            let phase = [
                "awaiting_manifest",
                "manifest_reserved",
                "manifest_uncertain",
                "awaiting_installation",
                "installation_reserved",
                "installation_uncertain",
                "complete",
            ][n % 7];
            db.execute("INSERT INTO native_github_setup_challenges(user_id,agent_id,generation,state_hash,issued_at,expires_at,phase,revision_hash,app_id,manifest_hash,installation_hash,manifest_result,installation_result,reservation) VALUES('u',?,7,'state',?,?,?,'revision','42','manifest','installation','{}','{}','reservation')",params![n.to_string(),NOW-challenge::TTL_MS,NOW,phase]).unwrap();
        }
        db
    }
    fn host(db: Connection) -> (Arc<NativeGithubPort>, DatabaseWorker, Arc<AtomicI64>) {
        host_with_capacity(db, 8)
    }
    fn host_with_capacity(
        db: Connection,
        capacity: u16,
    ) -> (Arc<NativeGithubPort>, DatabaseWorker, Arc<AtomicI64>) {
        let clock = Arc::new(AtomicI64::new(NOW - 1));
        let time = clock.clone();
        let service = Arc::new(AgentGithubAppService::new(
            None,
            None,
            Arc::new(move || time.load(Ordering::SeqCst)),
        ));
        let worker = DatabaseWorker::new(db, NonZeroU16::new(capacity).unwrap()).unwrap();
        let port = NativeGithubPort::new(
            service,
            worker.clone(),
            GithubHost {
                initialize: Arc::new(|| {
                    Box::pin(async { panic!("cleanup must not initialize external effects") })
                }),
                current_agent: Arc::new(|_, _| {
                    Box::pin(async { panic!("cleanup must not resolve agents") })
                }),
                effect: Arc::new(|_| {
                    Box::pin(async { panic!("cleanup must not perform external effects") })
                }),
            },
            NonZeroU16::new(2).unwrap(),
        );
        (port, worker, clock)
    }
    async fn revoked(worker: &DatabaseWorker) -> i64 {
        worker
            .run(|db| {
                Ok(db.query_row(
                    "SELECT count(*) FROM native_github_setup_challenges WHERE phase='revoked'",
                    [],
                    |r| r.get(0),
                )?)
            })
            .await
            .unwrap()
    }
    async fn wait_for_revoked(worker: &DatabaseWorker, expected: i64) {
        for _ in 0..100 {
            if revoked(worker).await == expected {
                return;
            }
            tokio::task::yield_now().await;
        }
        panic!("cleanup did not reach expected revoked count {expected}");
    }
    #[tokio::test(start_paused = true)]
    async fn idle_expiry_batches_use_canonical_clock_and_preserve_tombstones_credentials() {
        let (port, worker, clock) = host(database(7));
        let cleanup = port
            .start_expiry_cleanup(Duration::from_secs(1), 2)
            .unwrap();
        // The initial immediate sweep is harmless before the exact deadline.
        tokio::task::yield_now().await;
        assert_eq!(revoked(&worker).await, 0);
        clock.store(NOW, Ordering::SeqCst);
        for expected in [2, 4, 6, 7] {
            tokio::time::advance(Duration::from_secs(1)).await;
            wait_for_revoked(&worker, expected).await;
        }
        worker.run(|db| {
            let cleared: i64 = db.query_row("SELECT count(*) FROM native_github_setup_challenges WHERE generation=7 AND state_hash='state' AND revision_hash IS NULL AND app_id IS NULL AND manifest_hash IS NULL AND installation_hash IS NULL AND manifest_result IS NULL AND installation_result IS NULL AND reservation IS NULL", [], |r| r.get(0))?;
            assert_eq!(cleared, 7);
            let credential: String = db.query_row("SELECT value FROM fixture_credentials", [], |r| r.get(0))?;
            assert_eq!(credential, "keep encrypted credential");
            Ok(())
        }).await.unwrap();
        cleanup.shutdown().await.unwrap();
        worker.shutdown().await.unwrap();
    }
    #[tokio::test]
    async fn cleanup_limits_single_start_close_and_cancellation_are_explicit() {
        let (port, worker, clock) = host(database(1));
        for (period, batch) in [
            (Duration::ZERO, 1),
            (Duration::from_secs(61), 1),
            (Duration::from_secs(1), 0),
            (Duration::from_secs(1), 257),
        ] {
            assert!(port.start_expiry_cleanup(period, batch).is_err());
        }
        let cleanup = port
            .start_expiry_cleanup(Duration::from_secs(1), 1)
            .unwrap();
        assert!(
            port.start_expiry_cleanup(Duration::from_secs(1), 1)
                .is_err()
        );
        port.close();
        clock.store(NOW, Ordering::SeqCst);
        tokio::time::timeout(Duration::from_secs(5), async {
            while !cleanup.is_finished() {
                tokio::task::yield_now().await;
            }
        })
        .await
        .unwrap();
        cleanup.shutdown().await.unwrap();
        tokio::task::yield_now().await;
        assert_eq!(revoked(&worker).await, 0);
        assert!(port.call(GithubOperation::PublicBaseUrl).await.is_err());
        assert!(
            port.start_expiry_cleanup(Duration::from_secs(1), 1)
                .is_err()
        );
        worker.shutdown().await.unwrap();
    }
    #[tokio::test]
    async fn shutdown_waits_for_queued_sweep_and_cancel_skips_sql() {
        let (port, worker, clock) = host(database(1));
        clock.store(NOW, Ordering::SeqCst);
        let (started, ready) = tokio::sync::oneshot::channel();
        let (release, wait) = std::sync::mpsc::channel();
        let blocked = worker.clone();
        let blocker = tokio::spawn(async move {
            blocked
                .run(move |_| {
                    let _ = started.send(());
                    wait.recv_timeout(Duration::from_secs(5)).unwrap();
                    Ok(())
                })
                .await
                .unwrap()
        });
        ready.await.unwrap();
        let cleanup = port
            .start_expiry_cleanup(Duration::from_secs(60), 1)
            .unwrap();
        // This test uses Tokio's current-thread runtime: after observing the
        // attempt, the runner has reached worker.run's first pending await,
        // which follows synchronous mailbox admission. SQL is still blocked.
        tokio::time::timeout(Duration::from_secs(5), async {
            while cleanup.attempted_sweeps() == 0 {
                tokio::task::yield_now().await;
            }
        })
        .await
        .unwrap();
        cleanup.cancel();
        let mut shutdown = Box::pin(cleanup.shutdown());
        assert!(futures_util::poll!(&mut shutdown).is_pending());
        release.send(()).unwrap();
        blocker.await.unwrap();
        shutdown.await.unwrap();
        assert_eq!(revoked(&worker).await, 0);
        worker.shutdown().await.unwrap();
    }
    #[tokio::test]
    async fn cleanup_sql_failure_is_visible_and_host_can_join_it() {
        let db = database(1);
        db.execute_batch("CREATE TRIGGER reject_expiry BEFORE UPDATE ON native_github_setup_challenges BEGIN SELECT RAISE(ABORT,'fixture failure'); END;").unwrap();
        let (port, worker, clock) = host(db);
        clock.store(NOW, Ordering::SeqCst);
        let cleanup = port
            .start_expiry_cleanup(Duration::from_secs(1), 1)
            .unwrap();
        tokio::time::timeout(Duration::from_secs(5), async {
            while !cleanup.is_finished() {
                tokio::task::yield_now().await;
            }
        })
        .await
        .unwrap();
        assert!(cleanup.shutdown().await.is_err());
        assert_eq!(revoked(&worker).await, 0);
        worker.shutdown().await.unwrap();
    }
    #[tokio::test]
    async fn full_database_mailbox_defers_cleanup_until_next_tick() {
        let (port, worker, clock) = host_with_capacity(database(1), 1);
        clock.store(NOW, Ordering::SeqCst);
        let (started, ready) = tokio::sync::oneshot::channel();
        let (release, wait) = std::sync::mpsc::channel();
        let blocked = worker.clone();
        let blocker = tokio::spawn(async move {
            blocked
                .run(move |_| {
                    let _ = started.send(());
                    wait.recv_timeout(Duration::from_secs(5)).unwrap();
                    Ok(())
                })
                .await
                .unwrap()
        });
        ready.await.unwrap();
        let queued_worker = worker.clone();
        let mut queued = Box::pin(queued_worker.run(|db| {
            Ok(db.query_row(
                "SELECT count(*) FROM native_github_setup_challenges WHERE phase='revoked'",
                [],
                |row| row.get::<_, i64>(0),
            )?)
        }));
        // Poll admission directly so the mailbox is full before the runner starts.
        assert!(futures_util::poll!(&mut queued).is_pending());
        assert!(matches!(
            worker.run(|_| Ok(())).await,
            Err(DatabaseError::Busy)
        ));
        let cleanup = port
            .start_expiry_cleanup(Duration::from_secs(1), 1)
            .unwrap();
        // Observe actual admission before releasing the full mailbox. A single
        // yield need not poll the initial interval tick before this task resumes.
        tokio::time::timeout(Duration::from_secs(5), async {
            while cleanup.attempted_sweeps() == 0 {
                tokio::task::yield_now().await;
            }
        })
        .await
        .unwrap();
        assert!(!cleanup.is_finished());
        release.send(()).unwrap();
        blocker.await.unwrap();
        // Read in the already queued operation: a later interval tick may run
        // before this task resumes, but cannot overtake this mailbox entry.
        assert_eq!(queued.await.unwrap(), 0);
        tokio::time::timeout(Duration::from_secs(5), async {
            loop {
                if revoked(&worker).await == 1 {
                    break;
                }
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
        })
        .await
        .unwrap();
        cleanup.shutdown().await.unwrap();
        worker.shutdown().await.unwrap();
    }
    #[test]
    fn invalid_sweep_limits_do_not_create_schema() {
        let db = Connection::open_in_memory().unwrap();
        for (now, batch) in [(-1, 1), (NOW, 0), (NOW, 257)] {
            assert!(challenge::expire_batch(&db, now, batch).is_err());
        }
        let tables: i64 = db
            .query_row(
                "SELECT count(*) FROM sqlite_master WHERE type='table'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(tables, 0);
    }
    #[tokio::test(start_paused = true)]
    async fn dropping_cleanup_cancels_without_later_sweeps() {
        let (port, worker, clock) = host(database(1));
        let cleanup = port
            .start_expiry_cleanup(Duration::from_secs(1), 1)
            .unwrap();
        drop(cleanup);
        clock.store(NOW, Ordering::SeqCst);
        tokio::time::advance(Duration::from_secs(60)).await;
        assert_eq!(revoked(&worker).await, 0);
        worker.shutdown().await.unwrap();
    }
}
