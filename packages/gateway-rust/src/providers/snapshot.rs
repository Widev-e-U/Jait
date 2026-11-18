//! Provider availability/auth snapshots with stale-while-revalidate semantics.
use crate::time::Clock;
use futures_util::{
    FutureExt,
    future::{BoxFuture, Shared, join_all},
};
use serde_json::{Value, json};
use std::sync::{Arc, Mutex};
use tokio::sync::oneshot;

pub type Availability = Arc<dyn Fn() -> BoxFuture<'static, Result<bool, String>> + Send + Sync>;
pub type AuthStatus =
    Arc<dyn Fn() -> BoxFuture<'static, Result<Option<Value>, String>> + Send + Sync>;
/// Protocol boundaries return typed futures. Probe errors are localized per provider.
#[derive(Clone)]
pub struct SnapshotProvider {
    pub id: String,
    pub provider_type: Option<String>,
    pub info: Arc<dyn Fn() -> Value + Send + Sync>,
    pub availability: Availability,
    pub auth: Option<AuthStatus>,
}
pub type Snapshot = Arc<Vec<Value>>;
pub type SnapshotFuture = Shared<BoxFuture<'static, Result<Snapshot, Arc<String>>>>;
#[derive(Default)]
struct CacheState {
    snapshot: Option<Snapshot>,
    computed_at: i64,
    inflight: Option<SnapshotFuture>,
}
#[derive(Clone)]
pub struct ProviderSnapshotCache {
    state: Arc<Mutex<CacheState>>,
    registry: Arc<dyn Fn() -> Vec<SnapshotProvider> + Send + Sync>,
    clock: Clock,
}
impl ProviderSnapshotCache {
    pub fn new(
        registry: Arc<dyn Fn() -> Vec<SnapshotProvider> + Send + Sync>,
        clock: Clock,
    ) -> Self {
        Self {
            state: Arc::new(Mutex::new(CacheState::default())),
            registry,
            clock,
        }
    }
    /// Starts work immediately inside Tokio, even if the caller drops its waiter.
    pub fn get(&self, force: bool) -> SnapshotFuture {
        let state = self.state.lock().unwrap();
        if !force && let Some(snapshot) = &state.snapshot {
            let snapshot = snapshot.clone();
            let fresh = i128::from((self.clock)()) - i128::from(state.computed_at) < 60_000;
            drop(state);
            if !fresh {
                self.warm();
            }
            return futures_util::future::ready(Ok(snapshot)).boxed().shared();
        }
        drop(state);
        self.refresh()
    }
    pub fn invalidate(&self) {
        let mut state = self.state.lock().unwrap();
        state.snapshot = None;
        state.computed_at = 0;
    }
    pub fn warm(&self) {
        drop(self.refresh());
    }
    fn refresh(&self) -> SnapshotFuture {
        let mut state = self.state.lock().unwrap();
        if let Some(inflight) = &state.inflight {
            return inflight.clone();
        }
        let (send, receive) = oneshot::channel();
        let future = async move {
            receive
                .await
                .unwrap_or_else(|_| Err(Arc::new("Provider snapshot worker cancelled".into())))
        }
        .boxed()
        .shared();
        state.inflight = Some(future.clone());
        let cache = self.clone();
        tokio::spawn(async move {
            let computation = std::panic::AssertUnwindSafe(async {
                let providers = (cache.registry)();
                join_all(providers.into_iter().map(|p| async move {
                    let installed = (p.availability)().await.unwrap_or(false);
                    let auth = if let Some(auth) = p.auth {
                        match auth().await {
                            Ok(auth) => auth,
                            Err(_) => {
                                let mut fallback = (p.info)()["auth"].clone();
                                if let Some(map) = fallback.as_object_mut() {
                                    map.insert("authenticated".into(), Value::Null);
                                    map.insert(
                                        "detail".into(),
                                        json!("Failed to check provider auth status."),
                                    );
                                }
                                (!fallback.is_null()).then_some(fallback)
                            }
                        }
                    } else {
                        None
                    };
                    let info = (p.info)();
                    let mut row = json!({"id":p.id,"installed":installed});
                    for key in [
                        "name",
                        "description",
                        "available",
                        "unavailableReason",
                        "modes",
                    ] {
                        if let Some(value) = info.get(key) {
                            row[key] = value.clone();
                        }
                    }
                    if let Some(provider_type) = p
                        .provider_type
                        .map(Value::String)
                        .or_else(|| info.get("providerType").cloned())
                    {
                        row["providerType"] = provider_type;
                    }
                    if let Some(auth) = auth
                        .filter(|a| !a.is_null())
                        .or_else(|| info.get("auth").cloned())
                    {
                        row["auth"] = auth;
                    }
                    row
                }))
                .await
            })
            .catch_unwind()
            .await;
            let result = computation
                .map(Arc::new)
                .map_err(|_| Arc::new("Provider snapshot worker panicked".into()));
            {
                let mut state = cache.state.lock().unwrap();
                if let Ok(snapshot) = &result {
                    state.snapshot = Some(snapshot.clone());
                    state.computed_at = (cache.clock)();
                }
                state.inflight = None;
            }
            let _ = send.send(result);
        });
        future
    }
}
