//! Surface ownership and lifecycle. Locks cover registry metadata only; adapters
//! and callbacks run outside the lock, including across start/stop awaits.
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::{
    collections::HashMap,
    future::Future,
    pin::Pin,
    sync::{Arc, Mutex},
};
pub type SurfaceResult<T> = Result<T, String>;
pub type SurfaceFuture<'a, T> = Pin<Box<dyn Future<Output = SurfaceResult<T>> + Send + 'a>>;
#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum SurfaceState {
    Idle,
    Starting,
    Running,
    Stopping,
    Stopped,
    Error,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SurfaceStartInput {
    pub session_id: String,
    pub project_root: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub node_id: Option<String>,
    #[serde(flatten)]
    pub properties: Map<String, Value>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SurfaceSnapshot {
    pub id: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub state: SurfaceState,
    pub session_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub started_at: Option<String>,
    pub metadata: Map<String, Value>,
}
pub trait Surface: Send + Sync + std::any::Any {
    fn id(&self) -> &str;
    fn kind(&self) -> &str;
    fn state(&self) -> SurfaceState;
    fn session_id(&self) -> Option<String>;
    fn start(&self, input: SurfaceStartInput) -> SurfaceFuture<'_, ()>;
    fn stop(&self, reason: Option<String>) -> SurfaceFuture<'_, ()>;
    fn snapshot(&self) -> SurfaceResult<SurfaceSnapshot>;
}
pub type SurfaceRef = Arc<dyn Surface>;
pub trait SurfaceFactory: Send + Sync {
    fn kind(&self) -> &str;
    fn create(&self, id: &str) -> SurfaceResult<SurfaceRef>;
}
pub type StartedCallback = Arc<dyn Fn(&str, &SurfaceRef) -> SurfaceResult<()> + Send + Sync>;
pub type StoppedCallback =
    Arc<dyn Fn(&str, &SurfaceRef, Option<&str>) -> SurfaceResult<()> + Send + Sync>;
#[derive(Default)]
struct State {
    factories: HashMap<String, Arc<dyn SurfaceFactory>>,
    factory_order: Vec<String>,
    surfaces: HashMap<String, SurfaceRef>,
    surface_order: Vec<String>,
    owners: HashMap<String, String>,
    on_started: Option<StartedCallback>,
    on_stopped: Option<StoppedCallback>,
}
#[derive(Clone, Default)]
pub struct SurfaceRegistry {
    inner: Arc<Mutex<State>>,
}
struct FrozenSnapshot {
    surface: SurfaceRef,
    snapshot: SurfaceSnapshot,
}
impl Surface for FrozenSnapshot {
    fn id(&self) -> &str {
        self.surface.id()
    }
    fn kind(&self) -> &str {
        self.surface.kind()
    }
    fn state(&self) -> SurfaceState {
        self.surface.state()
    }
    fn session_id(&self) -> Option<String> {
        self.surface.session_id()
    }
    fn start(&self, input: SurfaceStartInput) -> SurfaceFuture<'_, ()> {
        self.surface.start(input)
    }
    fn stop(&self, reason: Option<String>) -> SurfaceFuture<'_, ()> {
        self.surface.stop(reason)
    }
    fn snapshot(&self) -> SurfaceResult<SurfaceSnapshot> {
        Ok(self.snapshot.clone())
    }
}
impl SurfaceRegistry {
    pub fn set_owner(&self, id: &str, user: &str) {
        self.inner
            .lock()
            .expect("surface registry")
            .owners
            .insert(id.into(), user.into());
    }
    pub fn owner(&self, id: &str) -> Option<String> {
        self.inner
            .lock()
            .expect("surface registry")
            .owners
            .get(id)
            .cloned()
    }
    pub fn on_started(&self, callback: Option<StartedCallback>) {
        self.inner.lock().expect("surface registry").on_started = callback;
    }
    pub fn on_stopped(&self, callback: Option<StoppedCallback>) {
        self.inner.lock().expect("surface registry").on_stopped = callback;
    }
    pub fn register(&self, factory: Arc<dyn SurfaceFactory>) {
        let mut state = self.inner.lock().expect("surface registry");
        let kind = factory.kind().to_owned();
        if !state.factories.contains_key(&kind) {
            state.factory_order.push(kind.clone());
        }
        state.factories.insert(kind, factory);
    }
    pub fn register_instance(&self, id: &str, surface: SurfaceRef) {
        let mut state = self.inner.lock().expect("surface registry");
        if !state.surfaces.contains_key(id) {
            state.surface_order.push(id.into());
        }
        state.surfaces.insert(id.into(), surface);
    }
    pub async fn start_surface(
        &self,
        kind: &str,
        id: &str,
        input: SurfaceStartInput,
    ) -> SurfaceResult<SurfaceRef> {
        let factory = self
            .inner
            .lock()
            .expect("surface registry")
            .factories
            .get(kind)
            .cloned()
            .ok_or_else(|| format!("Surface factory '{kind}' is not registered"))?;
        let surface = factory.create(id)?;
        self.register_instance(id, surface.clone());
        if let Some(user) = input.properties.get("userId").and_then(Value::as_str) {
            self.set_owner(id, user);
        }
        surface.start(input).await?;
        let callback = self
            .inner
            .lock()
            .expect("surface registry")
            .on_started
            .clone();
        if let Some(callback) = callback {
            callback(id, &surface)?;
        }
        Ok(surface)
    }
    pub async fn stop_surface(&self, id: &str, reason: Option<String>) -> SurfaceResult<bool> {
        let Some(surface) = self.surface(id) else {
            return Ok(false);
        };
        let snapshot = surface.snapshot()?;
        surface.stop(reason.clone()).await?;
        let callback = self
            .inner
            .lock()
            .expect("surface registry")
            .on_stopped
            .clone();
        if let Some(callback) = callback {
            let frozen: SurfaceRef = Arc::new(FrozenSnapshot { surface, snapshot });
            callback(id, &frozen, reason.as_deref())?;
        }
        self.unregister(id);
        Ok(true)
    }
    pub fn surface(&self, id: &str) -> Option<SurfaceRef> {
        self.inner
            .lock()
            .expect("surface registry")
            .surfaces
            .get(id)
            .cloned()
    }
    pub fn list(&self) -> Vec<SurfaceRef> {
        let state = self.inner.lock().expect("surface registry");
        state
            .surface_order
            .iter()
            .filter_map(|id| state.surfaces.get(id).cloned())
            .collect()
    }
    pub fn snapshots(&self) -> SurfaceResult<Vec<SurfaceSnapshot>> {
        self.list()
            .iter()
            .map(|surface| surface.snapshot())
            .collect()
    }
    pub fn by_session(&self, id: &str) -> Vec<SurfaceRef> {
        self.list()
            .into_iter()
            .filter(|s| s.session_id().as_deref() == Some(id))
            .collect()
    }
    pub fn unregister(&self, id: &str) -> bool {
        let mut state = self.inner.lock().expect("surface registry");
        state.owners.remove(id);
        let removed = state.surfaces.remove(id).is_some();
        if removed {
            state.surface_order.retain(|key| key != id);
        }
        removed
    }
    pub async fn stop_all(&self, reason: Option<&str>) {
        let ids = self
            .inner
            .lock()
            .expect("surface registry")
            .surface_order
            .clone();
        let _ = futures_util::future::join_all(
            ids.iter()
                .map(|id| self.stop_surface(id, Some(reason.unwrap_or("shutdown").into()))),
        )
        .await;
    }
    pub fn registered_types(&self) -> Vec<String> {
        self.inner
            .lock()
            .expect("surface registry")
            .factory_order
            .clone()
    }
}
impl crate::security::control_access::SurfaceAccess for SurfaceRegistry {
    fn surface(
        &self,
        id: &str,
    ) -> Result<Option<crate::security::control_access::AccessSurface>, String> {
        Ok(self
            .surface(id)
            .map(|surface| crate::security::control_access::AccessSurface {
                session_id: surface.session_id(),
            }))
    }
    fn owner(&self, id: &str) -> Result<Option<String>, String> {
        Ok(self.owner(id))
    }
}
pub fn should_sync_project_surface_ui(surface: &dyn Surface) -> SurfaceResult<bool> {
    if surface.kind() != "filesystem" && surface.kind() != "remote-filesystem" {
        return Ok(false);
    }
    Ok(surface
        .snapshot()?
        .metadata
        .get("panelOpen")
        .is_some_and(Value::is_boolean))
}
