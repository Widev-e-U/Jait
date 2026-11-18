//! Shared provider usage requests, success freshness and failure backoff.
use crate::time::{Clock, default_clock};
use futures_util::{
    FutureExt,
    future::{BoxFuture, Shared, ready},
};
use std::{
    collections::HashMap,
    future::Future,
    sync::{Arc, Mutex},
};
use tokio::sync::oneshot;

pub type RefreshFuture<T> = Shared<BoxFuture<'static, Result<T, Arc<String>>>>;
pub type FailurePredicate<T> = Arc<dyn Fn(&T) -> bool + Send + Sync>;
pub struct RefreshOptions<T> {
    pub force: bool,
    pub failed: Option<FailurePredicate<T>>,
}
impl<T> Default for RefreshOptions<T> {
    fn default() -> Self {
        Self {
            force: false,
            failed: None,
        }
    }
}
struct Timing {
    completed_at: Option<i64>,
    next_at: i128,
    failures: u64,
}
struct Entry<T: Clone> {
    future: RefreshFuture<T>,
    timing: Arc<Mutex<Timing>>,
}
pub struct UsageRefreshCache<T: Clone> {
    entries: Mutex<HashMap<String, Entry<T>>>,
    clock: Clock,
    start: Mutex<Option<oneshot::Receiver<()>>>,
}
impl<T: Clone + Send + Sync + 'static> Default for UsageRefreshCache<T> {
    fn default() -> Self {
        Self::new(default_clock())
    }
}
impl<T: Clone + Send + Sync + 'static> UsageRefreshCache<T> {
    pub fn new(clock: Clock) -> Self {
        Self {
            entries: Mutex::new(HashMap::new()),
            clock,
            start: Mutex::new(None),
        }
    }
    /// Starts a request inside Tokio even when every returned waiter is dropped.
    /// Reuses active/throttled requests. Loader and predicate must not panic.
    pub fn run<F, Fut>(&self, key: &str, load: F, options: RefreshOptions<T>) -> RefreshFuture<T>
    where
        F: FnOnce() -> Fut + Send + 'static,
        Fut: Future<Output = Result<T, String>> + Send + 'static,
    {
        let now = (self.clock)();
        let mut entries = self.entries.lock().unwrap();
        let previous = entries.get(key);
        if let Some(previous) = previous {
            let timing = previous.timing.lock().unwrap();
            if timing.completed_at.is_none() || i128::from(now) < timing.next_at && !options.force {
                return previous.future.clone();
            }
        }
        if previous.is_none() && entries.len() >= 1000 {
            entries.retain(|_, entry| {
                let t = entry.timing.lock().unwrap();
                t.completed_at.is_none() || t.next_at > i128::from(now)
            });
            if entries.len() >= 1000 {
                return ready(Err(Arc::new(
                    "Usage refresh capacity reached; try again later.".into(),
                )))
                .boxed()
                .shared();
            }
        }
        let failures = entries
            .get(key)
            .map(|entry| entry.timing.lock().unwrap().failures)
            .unwrap_or(0);
        let timing = Arc::new(Mutex::new(Timing {
            completed_at: None,
            next_at: i128::MAX,
            failures,
        }));
        let (send, receive) = oneshot::channel();
        let future = async move {
            receive
                .await
                .unwrap_or_else(|_| Err(Arc::new(String::from("Usage refresh worker cancelled"))))
        }
        .boxed()
        .shared();
        entries.insert(
            key.into(),
            Entry {
                future: future.clone(),
                timing: timing.clone(),
            },
        );
        let clock = self.clock.clone();
        let (started, next_start) = oneshot::channel();
        let previous_start = self.start.lock().unwrap().replace(next_start);
        tokio::spawn(async move {
            if let Some(previous) = previous_start {
                let _ = previous.await;
            }
            let mut loader = Box::pin(load());
            // Promise callbacks enter in run order. Release the next callback
            // after this future's initial poll, allowing all pending I/O to overlap.
            let first = futures_util::future::poll_fn(|cx| {
                std::task::Poll::Ready(loader.as_mut().poll(cx))
            })
            .await;
            let _ = started.send(());
            let result = match first {
                std::task::Poll::Ready(result) => result,
                std::task::Poll::Pending => loader.await,
            };
            let failed = match &result {
                Ok(value) => options.failed.as_ref().is_some_and(|f| f(value)),
                Err(_) => true,
            };
            {
                let mut timing = timing.lock().unwrap();
                let completed_at = clock();
                timing.completed_at = Some(completed_at);
                timing.failures = if failed {
                    timing.failures.saturating_add(1)
                } else {
                    0
                };
                let delay = (300_000_i128 * (1_i128 << timing.failures.min(3))).min(1_800_000);
                timing.next_at = i128::from(completed_at) + delay;
            }
            let _ = send.send(result.map_err(Arc::new));
        });
        future
    }
}
