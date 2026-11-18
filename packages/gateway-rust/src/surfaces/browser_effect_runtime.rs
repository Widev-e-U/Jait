//! Bounded, revocable execution boundary for an independently supervised browser.
//! This interface does not itself enforce Chromium network or filesystem policy.
use futures_util::FutureExt;
use std::{
    future::Future,
    pin::Pin,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    time::Duration,
};
use tokio::sync::{Semaphore, watch};

pub type EffectFuture<T> = Pin<Box<dyn Future<Output = Result<T, String>> + Send + 'static>>;

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum BrowserEffectOutput {
    None,
    /// Data returned over the driver channel, subject to `max_output_bytes`.
    Inline,
    /// A requested filesystem destination; authorization alone does not confine writes.
    File(String),
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct BrowserEffectRequest {
    pub operation: String,
    pub target: String,
    pub output: BrowserEffectOutput,
}

/// Server-owned policy. Implementations must reject unknown operations and targets.
pub trait BrowserEffectAuthority: Send + Sync {
    fn authorize(&self, request: &BrowserEffectRequest) -> Result<(), String>;
}

/// Supervisor for one browser instance. `terminate` must stop and reap all effects
/// before resolving; it must be idempotent and after it is called this instance
/// must never execute again. `execute` must settle its effects before returning.
/// The host must independently enforce network and filesystem constraints, and
/// bound driver-channel output before allocating or buffering it.
pub trait BrowserEffectSupervisor: Send + Sync + 'static {
    fn execute(&self, request: BrowserEffectRequest) -> EffectFuture<Vec<u8>>;
    fn terminate(&self) -> EffectFuture<()>;
}

#[derive(Clone)]
pub struct BrowserEffectRuntime {
    inner: Arc<Inner>,
}
struct Inner {
    authority: Option<Arc<dyn BrowserEffectAuthority>>,
    supervisor: Arc<dyn BrowserEffectSupervisor>,
    revoked: AtomicBool,
    cancel: watch::Sender<bool>,
    slot: Arc<Semaphore>,
    timeout: Duration,
    max_output_bytes: usize,
}

struct CancelOnDrop(Option<watch::Sender<bool>>);
impl Drop for CancelOnDrop {
    fn drop(&mut self) {
        if let Some(sender) = self.0.take() {
            let _ = sender.send(true);
        }
    }
}

impl BrowserEffectRuntime {
    pub fn new(
        authority: Option<Arc<dyn BrowserEffectAuthority>>,
        supervisor: Arc<dyn BrowserEffectSupervisor>,
        timeout: Duration,
        max_output_bytes: usize,
    ) -> Result<Self, String> {
        if timeout.is_zero()
            || timeout > Duration::from_secs(120)
            || max_output_bytes == 0
            || max_output_bytes > 1024 * 1024
        {
            return Err("invalid browser effect limits".into());
        }
        let (cancel, _) = watch::channel(false);
        Ok(Self {
            inner: Arc::new(Inner {
                authority,
                supervisor,
                revoked: AtomicBool::new(false),
                cancel,
                slot: Arc::new(Semaphore::new(1)),
                timeout,
                max_output_bytes,
            }),
        })
    }

    /// Permanently revoke the instance and signal its active operation.
    pub async fn revoke(&self) -> Result<(), String> {
        self.inner.revoked.store(true, Ordering::SeqCst);
        self.inner.cancel.send_replace(true);
        let inner = self.inner.clone();
        tokio::spawn(async move {
            let _permit = inner
                .slot
                .clone()
                .acquire_owned()
                .await
                .map_err(|_| "browser effect runtime closed")?;
            inner.supervisor.terminate().await
        })
        .await
        .map_err(|_| "browser effect supervisor failed".to_string())?
    }

    pub async fn execute(&self, request: BrowserEffectRequest) -> Result<Vec<u8>, String> {
        if request.operation.is_empty()
            || request.target.is_empty()
            || request.operation.len() > 128
            || request.target.len() > 8192
            || matches!(&request.output, BrowserEffectOutput::File(path) if path.is_empty() || path.len() > 8192)
        {
            return Err("invalid browser effect request".into());
        }
        let permit = self
            .inner
            .slot
            .clone()
            .try_acquire_owned()
            .map_err(|_| "browser effect capacity exhausted".to_string())?;
        if self.inner.revoked.load(Ordering::SeqCst) {
            return Err("browser authority revoked".into());
        }
        self.inner
            .authority
            .as_ref()
            .ok_or("browser effect authority unavailable")?
            .authorize(&request)?;
        // Subscribe before dispatch, and recheck: a concurrent revoke must not be missed.
        let mut revoked = self.inner.cancel.subscribe();
        if self.inner.revoked.load(Ordering::SeqCst) {
            return Err("browser authority revoked".into());
        }
        let (abandon, mut abandoned) = watch::channel(false);
        let mut guard = CancelOnDrop(Some(abandon));
        let inner = self.inner.clone();
        let task = tokio::spawn(async move {
            let _permit = permit;
            let result = tokio::select! {
                biased;
                _ = revoked.changed() => None,
                _ = abandoned.changed() => None,
                _ = tokio::time::sleep(inner.timeout) => None,
                result = std::panic::AssertUnwindSafe(async { inner.supervisor.execute(request).await }).catch_unwind() => Some(result),
            };
            match result {
                Some(Ok(Ok(bytes)))
                    if !inner.revoked.load(Ordering::SeqCst)
                        && bytes.len() <= inner.max_output_bytes =>
                {
                    Ok(bytes)
                }
                other => {
                    inner.revoked.store(true, Ordering::SeqCst);
                    inner.cancel.send_replace(true);
                    inner.supervisor.terminate().await?;
                    match other {
                        Some(Ok(Ok(_))) => {
                            Err("browser effect output limit exceeded or authority revoked".into())
                        }
                        Some(Ok(Err(error))) => Err(error),
                        Some(Err(_)) => Err("browser effect supervisor panicked".into()),
                        None => Err("browser effect cancelled or timed out".into()),
                    }
                }
            }
        });
        let result = task
            .await
            .map_err(|_| "browser effect supervisor failed".to_string())?;
        guard.0 = None;
        result
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use tokio::sync::Notify;

    struct Policy;
    impl BrowserEffectAuthority for Policy {
        fn authorize(&self, r: &BrowserEffectRequest) -> Result<(), String> {
            if r.operation == "read"
                && r.target == "allowed"
                && r.output == BrowserEffectOutput::Inline
            {
                Ok(())
            } else {
                Err("denied".into())
            }
        }
    }
    struct Supervisor {
        calls: AtomicUsize,
        terminated: AtomicUsize,
        started: Notify,
        pending: bool,
    }
    impl BrowserEffectSupervisor for Arc<Supervisor> {
        fn execute(&self, _: BrowserEffectRequest) -> EffectFuture<Vec<u8>> {
            let this = self.clone();
            Box::pin(async move {
                this.calls.fetch_add(1, Ordering::SeqCst);
                this.started.notify_one();
                if this.pending {
                    std::future::pending::<()>().await;
                }
                Ok(vec![1, 2])
            })
        }
        fn terminate(&self) -> EffectFuture<()> {
            let this = self.clone();
            Box::pin(async move {
                this.terminated.fetch_add(1, Ordering::SeqCst);
                Ok(())
            })
        }
    }
    fn setup(policy: bool, pending: bool) -> (BrowserEffectRuntime, Arc<Supervisor>) {
        let supervisor = Arc::new(Supervisor {
            calls: AtomicUsize::new(0),
            terminated: AtomicUsize::new(0),
            started: Notify::new(),
            pending,
        });
        let authority = policy.then(|| Arc::new(Policy) as Arc<dyn BrowserEffectAuthority>);
        (
            BrowserEffectRuntime::new(
                authority,
                Arc::new(supervisor.clone()),
                Duration::from_secs(2),
                16,
            )
            .unwrap(),
            supervisor,
        )
    }
    fn request() -> BrowserEffectRequest {
        BrowserEffectRequest {
            operation: "read".into(),
            target: "allowed".into(),
            output: BrowserEffectOutput::Inline,
        }
    }
    #[tokio::test]
    async fn authority_checks_every_dimension_before_dispatch() {
        let (missing, s) = setup(false, false);
        assert!(missing.execute(request()).await.is_err());
        assert_eq!(s.calls.load(Ordering::SeqCst), 0);
        let (runtime, s) = setup(true, false);
        let mut denied = request();
        denied.output = BrowserEffectOutput::File("/outside".into());
        assert!(runtime.execute(denied).await.is_err());
        assert_eq!(runtime.execute(request()).await.unwrap(), vec![1, 2]);
        assert_eq!(s.calls.load(Ordering::SeqCst), 1);
    }
    #[tokio::test]
    async fn revoke_stops_active_and_rejects_new_work() {
        let (runtime, s) = setup(true, true);
        let r = runtime.clone();
        let task = tokio::spawn(async move { r.execute(request()).await });
        s.started.notified().await;
        assert!(runtime.execute(request()).await.is_err());
        runtime.revoke().await.unwrap();
        assert!(task.await.unwrap().is_err());
        assert!(s.terminated.load(Ordering::SeqCst) >= 1);
        assert!(runtime.execute(request()).await.is_err());
    }
    #[tokio::test]
    async fn timeout_terminates_and_revokes() {
        let (runtime, s) = setup(true, true);
        let short = BrowserEffectRuntime::new(
            Some(Arc::new(Policy)),
            Arc::new(s.clone()),
            Duration::from_millis(10),
            16,
        )
        .unwrap();
        assert!(short.execute(request()).await.is_err());
        assert!(s.terminated.load(Ordering::SeqCst) >= 1);
        assert!(short.execute(request()).await.is_err());
        drop(runtime);
    }

    #[tokio::test]
    async fn excess_output_terminates_and_revokes() {
        let (_, s) = setup(true, false);
        let runtime = BrowserEffectRuntime::new(
            Some(Arc::new(Policy)),
            Arc::new(s.clone()),
            Duration::from_secs(1),
            1,
        )
        .unwrap();
        assert!(runtime.execute(request()).await.is_err());
        assert!(s.terminated.load(Ordering::SeqCst) >= 1);
        assert!(runtime.execute(request()).await.is_err());
    }

    #[tokio::test]
    async fn dropping_caller_still_terminates() {
        let (runtime, s) = setup(true, true);
        let r = runtime.clone();
        let task = tokio::spawn(async move { r.execute(request()).await });
        s.started.notified().await;
        task.abort();
        let _ = task.await;
        tokio::time::timeout(Duration::from_secs(1), async {
            while s.terminated.load(Ordering::SeqCst) == 0 {
                tokio::task::yield_now().await;
            }
        })
        .await
        .unwrap();
        assert!(runtime.execute(request()).await.is_err());
    }
}
