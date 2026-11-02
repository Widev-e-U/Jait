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
    reservations: HashMap<String, Arc<()>>,
    factory_creations: HashMap<String, usize>,
    on_started: Option<StartedCallback>,
    on_stopped: Option<StoppedCallback>,
}
#[derive(Clone, Default)]
pub struct SurfaceRegistry {
    inner: Arc<Mutex<State>>,
}
// Prevent an owner reservation from claiming an ID while a factory is creating it.
// Drop also releases the claim on factory errors or panics.
struct FactoryCreation {
    registry: SurfaceRegistry,
    id: String,
    active: bool,
}
impl FactoryCreation {
    fn release(&mut self, state: &mut State) {
        if self.active {
            if let Some(count) = state.factory_creations.get_mut(&self.id) {
                *count -= 1;
                if *count == 0 {
                    state.factory_creations.remove(&self.id);
                }
            }
            self.active = false;
        }
    }
}
impl Drop for FactoryCreation {
    fn drop(&mut self) {
        if self.active {
            let registry = self.registry.clone();
            let mut state = registry.inner.lock().expect("surface registry");
            self.release(&mut state);
        }
    }
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
    /// Set ownership only outside an active registration attempt.
    pub fn set_owner(&self, id: &str, user: &str) {
        let mut state = self.inner.lock().expect("surface registry");
        if state.reservations.contains_key(id) {
            return;
        }
        state.owners.insert(id.into(), user.into());
    }
    /// Reserve an unused ID and its owner for one registration attempt.
    pub fn reserve_owner(&self, id: &str, user: &str) -> Option<Arc<()>> {
        let mut state = self.inner.lock().expect("surface registry");
        if state.surfaces.contains_key(id)
            || state.owners.contains_key(id)
            || state.factory_creations.contains_key(id)
        {
            return None;
        }
        let token = Arc::new(());
        state.owners.insert(id.into(), user.into());
        state.reservations.insert(id.into(), token.clone());
        Some(token)
    }
    /// Finish an attempt; cleanup never affects a superseding registration.
    pub fn finish_reservation(&self, id: &str, token: &Arc<()>, cleanup: bool) -> bool {
        let mut state = self.inner.lock().expect("surface registry");
        if !state
            .reservations
            .get(id)
            .is_some_and(|current| Arc::ptr_eq(current, token))
        {
            return false;
        }
        state.reservations.remove(id);
        let removed = if cleanup {
            state.owners.remove(id);
            let removed = state.surfaces.remove(id);
            state.surface_order.retain(|key| key != id);
            removed
        } else {
            None
        };
        drop(state);
        drop(removed);
        true
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
        let old = std::mem::replace(
            &mut self.inner.lock().expect("surface registry").on_started,
            callback,
        );
        drop(old);
    }
    pub fn on_stopped(&self, callback: Option<StoppedCallback>) {
        let old = std::mem::replace(
            &mut self.inner.lock().expect("surface registry").on_stopped,
            callback,
        );
        drop(old);
    }
    pub fn register(&self, factory: Arc<dyn SurfaceFactory>) {
        // Factory code may re-enter the registry; never invoke it under the lock.
        let kind = factory.kind().to_owned();
        let displaced = {
            let mut state = self.inner.lock().expect("surface registry");
            if !state.factories.contains_key(&kind) {
                state.factory_order.push(kind.clone());
            }
            state.factories.insert(kind, factory)
        };
        // The last factory reference can run arbitrary Drop code.
        drop(displaced);
    }
    pub fn register_instance(&self, id: &str, surface: SurfaceRef) {
        let mut state = self.inner.lock().expect("surface registry");
        let displaced_reservation = state.reservations.remove(id).is_some();
        if state.surfaces.contains_key(id) || displaced_reservation {
            // Neither a prior instance nor another attempt's reservation grants ownership.
            state.owners.remove(id);
        }
        if !state.surfaces.contains_key(id) {
            state.surface_order.push(id.into());
        }
        let displaced = state.surfaces.insert(id.into(), surface);
        drop(state);
        drop(displaced);
    }
    /// Register the first instance only for the holder of this owner's reservation.
    pub fn register_reserved_instance(
        &self,
        id: &str,
        token: &Arc<()>,
        surface: SurfaceRef,
    ) -> bool {
        let mut state = self.inner.lock().expect("surface registry");
        if state.surfaces.contains_key(id)
            || !state
                .reservations
                .get(id)
                .is_some_and(|current| Arc::ptr_eq(current, token))
        {
            return false;
        }
        state.surface_order.push(id.into());
        state.surfaces.insert(id.into(), surface);
        true
    }
    pub async fn start_surface(
        &self,
        kind: &str,
        id: &str,
        input: SurfaceStartInput,
    ) -> SurfaceResult<SurfaceRef> {
        let factory = {
            let mut state = self.inner.lock().expect("surface registry");
            let factory = state
                .factories
                .get(kind)
                .cloned()
                .ok_or_else(|| format!("Surface factory '{kind}' is not registered"))?;
            if state.reservations.contains_key(id) {
                return Err(format!("Surface '{id}' has a pending registration"));
            }
            *state.factory_creations.entry(id.into()).or_default() += 1;
            factory
        };
        let mut creation = FactoryCreation {
            registry: self.clone(),
            id: id.into(),
            active: true,
        };
        let surface = factory.create(id)?;
        // Publish the instance and its owner together so a replacement cannot
        // observe or inherit the previous instance's owner.
        let displaced = {
            let mut state = self.inner.lock().expect("surface registry");
            creation.release(&mut state);
            if state.reservations.contains_key(id) {
                return Err(format!("Surface '{id}' has a pending registration"));
            }
            if !state.surfaces.contains_key(id) {
                state.surface_order.push(id.into());
            }
            let displaced = state.surfaces.insert(id.into(), surface.clone());
            match input.properties.get("userId").and_then(Value::as_str) {
                Some(user) => {
                    state.owners.insert(id.into(), user.into());
                }
                None => {
                    state.owners.remove(id);
                }
            }
            displaced
        };
        drop(displaced);
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
        let Some((surface, _)) = self.surface_with_owner(id) else {
            return Ok(false);
        };
        self.stop_surface_instance(id, surface, reason).await
    }

    /// Stop the captured instance only if it is still registered under this ID.
    pub async fn stop_surface_instance(
        &self,
        id: &str,
        surface: SurfaceRef,
        reason: Option<String>,
    ) -> SurfaceResult<bool> {
        if !self
            .surface_with_owner(id)
            .is_some_and(|(current, _)| Arc::ptr_eq(&current, &surface))
        {
            return Ok(false);
        }
        let snapshot = surface.snapshot()?;
        surface.stop(reason.clone()).await?;
        let callback = self
            .inner
            .lock()
            .expect("surface registry")
            .on_stopped
            .clone();
        if let Some(callback) = callback {
            let frozen: SurfaceRef = Arc::new(FrozenSnapshot {
                surface: surface.clone(),
                snapshot,
            });
            callback(id, &frozen, reason.as_deref())?;
        }
        // A replacement can be registered while stop or the callback awaits/runs.
        // Only remove the instance that this operation actually stopped.
        let mut state = self.inner.lock().expect("surface registry");
        if state
            .surfaces
            .get(id)
            .is_some_and(|current| Arc::ptr_eq(current, &surface))
        {
            state.surfaces.remove(id);
            state.owners.remove(id);
            state.reservations.remove(id);
            state.surface_order.retain(|key| key != id);
        }
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
    /// Capture an instance and its recorded owner in the same registry state.
    pub fn surface_with_owner(&self, id: &str) -> Option<(SurfaceRef, Option<String>)> {
        let state = self.inner.lock().expect("surface registry");
        if state.reservations.contains_key(id) {
            return None;
        }
        state.surfaces.get(id).cloned().map(|surface| {
            let owner = state.owners.get(id).cloned();
            (surface, owner)
        })
    }

    pub fn list_with_owners(&self) -> Vec<(SurfaceRef, Option<String>)> {
        let state = self.inner.lock().expect("surface registry");
        state
            .surface_order
            .iter()
            .filter_map(|id| {
                if state.reservations.contains_key(id) {
                    return None;
                }
                state
                    .surfaces
                    .get(id)
                    .cloned()
                    .map(|surface| (surface, state.owners.get(id).cloned()))
            })
            .collect()
    }

    pub fn list(&self) -> Vec<SurfaceRef> {
        let state = self.inner.lock().expect("surface registry");
        state
            .surface_order
            .iter()
            .filter_map(|id| {
                if state.reservations.contains_key(id) {
                    None
                } else {
                    state.surfaces.get(id).cloned()
                }
            })
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
    /// Remove only the instance captured by the caller, preserving replacements.
    pub fn unregister_instance(&self, id: &str, surface: &SurfaceRef) -> bool {
        let mut state = self.inner.lock().expect("surface registry");
        if !state
            .surfaces
            .get(id)
            .is_some_and(|current| Arc::ptr_eq(current, surface))
        {
            return false;
        }
        state.surfaces.remove(id);
        state.owners.remove(id);
        state.reservations.remove(id);
        state.surface_order.retain(|key| key != id);
        true
    }
    pub fn unregister(&self, id: &str) -> bool {
        let mut state = self.inner.lock().expect("surface registry");
        state.owners.remove(id);
        state.reservations.remove(id);
        let removed = state.surfaces.remove(id);
        if removed.is_some() {
            state.surface_order.retain(|key| key != id);
        }
        drop(state);
        let existed = removed.is_some();
        drop(removed);
        existed
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
        Ok(self.surface_with_owner(id).map(|(surface, owner)| {
            crate::security::control_access::AccessSurface {
                session_id: surface.session_id(),
                owner,
            }
        }))
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

#[cfg(test)]
mod tests {
    use super::*;

    struct TestSurface;
    impl Surface for TestSurface {
        fn id(&self) -> &str {
            "same"
        }
        fn kind(&self) -> &str {
            "filesystem"
        }
        fn state(&self) -> SurfaceState {
            SurfaceState::Running
        }
        fn session_id(&self) -> Option<String> {
            Some("session".into())
        }
        fn start(&self, _: SurfaceStartInput) -> SurfaceFuture<'_, ()> {
            Box::pin(async { Ok(()) })
        }
        fn stop(&self, _: Option<String>) -> SurfaceFuture<'_, ()> {
            Box::pin(async { Ok(()) })
        }
        fn snapshot(&self) -> SurfaceResult<SurfaceSnapshot> {
            Ok(SurfaceSnapshot {
                id: "same".into(),
                kind: "filesystem".into(),
                state: SurfaceState::Running,
                session_id: "session".into(),
                started_at: None,
                metadata: Map::new(),
            })
        }
    }

    struct TestFactory;
    impl SurfaceFactory for TestFactory {
        fn kind(&self) -> &str {
            "filesystem"
        }
        fn create(&self, _: &str) -> SurfaceResult<SurfaceRef> {
            Ok(Arc::new(TestSurface))
        }
    }

    #[test]
    fn factory_kind_can_reenter_registry_during_registration() {
        use std::sync::mpsc;
        use std::time::Duration;

        struct ReentrantFactory(SurfaceRegistry);
        impl SurfaceFactory for ReentrantFactory {
            fn kind(&self) -> &str {
                let _ = self.0.registered_types();
                "reentrant"
            }
            fn create(&self, _: &str) -> SurfaceResult<SurfaceRef> {
                Err("unused".into())
            }
        }

        let registry = SurfaceRegistry::default();
        let other = registry.clone();
        let (done, received) = mpsc::channel();
        std::thread::spawn(move || {
            other.register(Arc::new(ReentrantFactory(other.clone())));
            done.send(()).unwrap();
        });
        received
            .recv_timeout(Duration::from_secs(5))
            .expect("registration deadlocked");
        assert_eq!(registry.registered_types(), vec!["reentrant"]);
    }

    #[test]
    fn replacing_factory_drops_it_outside_registry_lock() {
        use std::sync::mpsc;
        use std::time::Duration;

        struct ReentrantDrop(SurfaceRegistry);
        impl SurfaceFactory for ReentrantDrop {
            fn kind(&self) -> &str {
                "filesystem"
            }
            fn create(&self, _: &str) -> SurfaceResult<SurfaceRef> {
                Err("unused".into())
            }
        }
        impl Drop for ReentrantDrop {
            fn drop(&mut self) {
                let _ = self.0.registered_types();
            }
        }

        let registry = SurfaceRegistry::default();
        registry.register(Arc::new(ReentrantDrop(registry.clone())));
        let other = registry.clone();
        let (done, received) = mpsc::channel();
        std::thread::spawn(move || {
            other.register(Arc::new(TestFactory));
            done.send(()).unwrap();
        });
        received
            .recv_timeout(Duration::from_secs(5))
            .expect("factory drop deadlocked");
        assert_eq!(registry.registered_types(), vec!["filesystem"]);
    }

    #[test]
    fn surface_and_callback_destructors_can_reenter_registry() {
        use std::sync::mpsc;
        use std::time::Duration;

        struct Reenter(SurfaceRegistry);
        impl Drop for Reenter {
            fn drop(&mut self) {
                let _ = self.0.registered_types();
            }
        }
        struct ReentrantSurface(Reenter);
        impl Surface for ReentrantSurface {
            fn id(&self) -> &str {
                "same"
            }
            fn kind(&self) -> &str {
                "filesystem"
            }
            fn state(&self) -> SurfaceState {
                SurfaceState::Idle
            }
            fn session_id(&self) -> Option<String> {
                None
            }
            fn start(&self, _: SurfaceStartInput) -> SurfaceFuture<'_, ()> {
                Box::pin(async { Ok(()) })
            }
            fn stop(&self, _: Option<String>) -> SurfaceFuture<'_, ()> {
                Box::pin(async { Ok(()) })
            }
            fn snapshot(&self) -> SurfaceResult<SurfaceSnapshot> {
                TestSurface.snapshot()
            }
        }

        let registry = SurfaceRegistry::default();
        let other = registry.clone();
        let (done, received) = mpsc::channel();
        std::thread::spawn(move || {
            let make = || Arc::new(ReentrantSurface(Reenter(other.clone()))) as SurfaceRef;
            other.register_instance("same", make());
            other.register_instance("same", make());
            assert!(other.unregister("same"));
            let token = other.reserve_owner("same", "alice").unwrap();
            assert!(other.register_reserved_instance("same", &token, make()));
            assert!(other.finish_reservation("same", &token, true));
            let capture = Reenter(other.clone());
            other.on_started(Some(Arc::new(move |_, _| {
                let _ = &capture;
                Ok(())
            })));
            other.on_started(None);
            let capture = Reenter(other.clone());
            other.on_stopped(Some(Arc::new(move |_, _, _| {
                let _ = &capture;
                Ok(())
            })));
            other.on_stopped(None);
            done.send(()).unwrap();
        });
        received
            .recv_timeout(Duration::from_secs(5))
            .expect("destructor deadlocked");
        assert!(registry.surface("same").is_none());
        assert!(registry.owner("same").is_none());
    }

    #[test]
    fn factory_publication_drops_replaced_surface_outside_lock() {
        use std::sync::mpsc;
        use std::time::Duration;

        struct ReentrantSurface(SurfaceRegistry);
        impl Drop for ReentrantSurface {
            fn drop(&mut self) {
                let _ = self.0.registered_types();
            }
        }
        impl Surface for ReentrantSurface {
            fn id(&self) -> &str {
                "same"
            }
            fn kind(&self) -> &str {
                "filesystem"
            }
            fn state(&self) -> SurfaceState {
                SurfaceState::Idle
            }
            fn session_id(&self) -> Option<String> {
                None
            }
            fn start(&self, _: SurfaceStartInput) -> SurfaceFuture<'_, ()> {
                Box::pin(async { Ok(()) })
            }
            fn stop(&self, _: Option<String>) -> SurfaceFuture<'_, ()> {
                Box::pin(async { Ok(()) })
            }
            fn snapshot(&self) -> SurfaceResult<SurfaceSnapshot> {
                TestSurface.snapshot()
            }
        }

        let registry = SurfaceRegistry::default();
        registry.register(Arc::new(TestFactory));
        registry.register_instance("same", Arc::new(ReentrantSurface(registry.clone())));
        registry.set_owner("same", "previous");
        let other = registry.clone();
        let (done, received) = mpsc::channel();
        std::thread::spawn(move || {
            let runtime = tokio::runtime::Builder::new_current_thread()
                .build()
                .unwrap();
            let mut properties = Map::new();
            properties.insert("userId".into(), Value::String("alice".into()));
            let result = runtime.block_on(other.start_surface(
                "filesystem",
                "same",
                SurfaceStartInput {
                    session_id: "session".into(),
                    project_root: "/".into(),
                    node_id: None,
                    properties,
                },
            ));
            done.send(result.is_ok()).unwrap();
        });
        assert!(
            received
                .recv_timeout(Duration::from_secs(5))
                .expect("publication deadlocked")
        );
        assert_eq!(registry.owner("same").as_deref(), Some("alice"));
        assert!(registry.surface("same").is_some());
    }

    #[test]
    fn reservation_cleanup_preserves_replacement_and_owner() {
        let registry = SurfaceRegistry::default();
        let token = registry.reserve_owner("same", "alice").unwrap();
        assert!(registry.register_reserved_instance("same", &token, Arc::new(TestSurface)));
        let replacement: SurfaceRef = Arc::new(TestSurface);
        registry.register_instance("same", replacement.clone());
        registry.set_owner("same", "bob");
        assert!(!registry.finish_reservation("same", &token, true));
        let (current, owner) = registry.surface_with_owner("same").unwrap();
        assert!(Arc::ptr_eq(&current, &replacement));
        assert_eq!(owner.as_deref(), Some("bob"));
        let token = registry.reserve_owner("other", "alice").unwrap();
        assert!(registry.register_reserved_instance("other", &token, Arc::new(TestSurface)));
        assert!(registry.finish_reservation("other", &token, true));
        assert!(registry.surface_with_owner("other").is_none());
        assert!(registry.owner("other").is_none());
    }

    #[test]
    fn reserved_surface_is_hidden_from_authorization_until_committed() {
        let registry = SurfaceRegistry::default();
        let token = registry.reserve_owner("same", "alice").unwrap();
        let surface: SurfaceRef = Arc::new(TestSurface);
        assert!(registry.register_reserved_instance("same", &token, surface.clone()));
        assert!(registry.surface("same").is_some());
        assert!(registry.surface_with_owner("same").is_none());
        assert!(registry.list_with_owners().is_empty());
        assert!(registry.finish_reservation("same", &token, false));
        let (published, owner) = registry.surface_with_owner("same").unwrap();
        assert!(Arc::ptr_eq(&published, &surface));
        assert_eq!(owner.as_deref(), Some("alice"));
        assert_eq!(registry.list_with_owners().len(), 1);
    }

    #[tokio::test]
    async fn pending_surface_is_excluded_from_listing_and_generic_stop() {
        let registry = SurfaceRegistry::default();
        let token = registry.reserve_owner("same", "alice").unwrap();
        let surface: SurfaceRef = Arc::new(TestSurface);
        assert!(registry.register_reserved_instance("same", &token, surface.clone()));
        assert!(registry.list().is_empty());
        assert!(registry.snapshots().unwrap().is_empty());
        assert!(registry.by_session("session").is_empty());
        assert!(!registry.stop_surface("same", None).await.unwrap());
        assert!(
            !registry
                .stop_surface_instance("same", surface.clone(), None)
                .await
                .unwrap()
        );
        assert!(registry.finish_reservation("same", &token, false));
        assert_eq!(registry.list().len(), 1);
        assert!(registry.stop_surface("same", None).await.unwrap());
    }

    #[test]
    fn unrelated_first_registration_displaces_reservation_without_owner() {
        let registry = SurfaceRegistry::default();
        let token = registry.reserve_owner("same", "alice").unwrap();
        let unrelated: SurfaceRef = Arc::new(TestSurface);
        registry.register_instance("same", unrelated.clone());
        assert!(!registry.register_reserved_instance("same", &token, Arc::new(TestSurface)));
        assert!(!registry.finish_reservation("same", &token, true));
        let (current, owner) = registry.surface_with_owner("same").unwrap();
        assert!(Arc::ptr_eq(&current, &unrelated));
        assert_eq!(owner, None);
    }

    #[test]
    fn unregister_captured_instance_preserves_replacement_owner() {
        let registry = SurfaceRegistry::default();
        let original: SurfaceRef = Arc::new(TestSurface);
        let replacement: SurfaceRef = Arc::new(TestSurface);
        registry.register_instance("same", original.clone());
        registry.set_owner("same", "alice");
        registry.register_instance("same", replacement.clone());
        registry.set_owner("same", "bob");
        assert!(!registry.unregister_instance("same", &original));
        let (current, owner) = registry.surface_with_owner("same").unwrap();
        assert!(Arc::ptr_eq(&current, &replacement));
        assert_eq!(owner.as_deref(), Some("bob"));
        assert!(registry.unregister_instance("same", &replacement));
        assert!(registry.surface_with_owner("same").is_none());
    }

    #[test]
    fn direct_replacement_clears_owner_but_first_registration_keeps_reservation() {
        let registry = SurfaceRegistry::default();
        registry.set_owner("same", "alice");
        registry.register_instance("same", Arc::new(TestSurface));
        assert_eq!(
            registry.surface_with_owner("same").unwrap().1.as_deref(),
            Some("alice")
        );
        registry.register_instance("same", Arc::new(TestSurface));
        assert_eq!(registry.surface_with_owner("same").unwrap().1, None);
    }

    #[test]
    fn captured_owner_stays_with_captured_instance_after_replacement() {
        let registry = SurfaceRegistry::default();
        let original: SurfaceRef = Arc::new(TestSurface);
        let replacement: SurfaceRef = Arc::new(TestSurface);
        registry.register_instance("same", original.clone());
        registry.set_owner("same", "alice");
        let (captured, owner) = registry.surface_with_owner("same").unwrap();
        registry.register_instance("same", replacement.clone());
        registry.set_owner("same", "bob");
        assert!(Arc::ptr_eq(&captured, &original));
        assert_eq!(owner.as_deref(), Some("alice"));
        let (current, current_owner) = registry.surface_with_owner("same").unwrap();
        assert!(Arc::ptr_eq(&current, &replacement));
        assert_eq!(current_owner.as_deref(), Some("bob"));
    }

    #[tokio::test]
    async fn reservation_cannot_overtake_factory_creation() {
        struct PausedFactory {
            entered: std::sync::Mutex<Option<tokio::sync::oneshot::Sender<()>>>,
            resume: std::sync::Mutex<std::sync::mpsc::Receiver<()>>,
        }
        impl SurfaceFactory for PausedFactory {
            fn kind(&self) -> &str {
                "filesystem"
            }
            fn create(&self, _: &str) -> SurfaceResult<SurfaceRef> {
                self.entered
                    .lock()
                    .unwrap()
                    .take()
                    .unwrap()
                    .send(())
                    .unwrap();
                self.resume.lock().unwrap().recv().unwrap();
                Ok(Arc::new(TestSurface))
            }
        }
        let registry = SurfaceRegistry::default();
        let (entered_tx, entered_rx) = tokio::sync::oneshot::channel();
        let (resume_tx, resume_rx) = std::sync::mpsc::channel();
        registry.register(Arc::new(PausedFactory {
            entered: std::sync::Mutex::new(Some(entered_tx)),
            resume: std::sync::Mutex::new(resume_rx),
        }));
        let other = registry.clone();
        let runtime = tokio::runtime::Handle::current();
        let task = tokio::task::spawn_blocking(move || {
            runtime.block_on(other.start_surface(
                "filesystem",
                "same",
                SurfaceStartInput {
                    session_id: "session".into(),
                    project_root: "/".into(),
                    node_id: None,
                    properties: Map::new(),
                },
            ))
        });
        entered_rx.await.unwrap();
        assert!(registry.reserve_owner("same", "alice").is_none());
        resume_tx.send(()).unwrap();
        assert!(task.await.unwrap().is_ok());
        assert!(registry.surface("same").is_some());
    }

    #[tokio::test]
    async fn reservation_waits_for_all_factory_creations_to_exit() {
        use std::sync::{
            atomic::{AtomicUsize, Ordering},
            mpsc,
        };
        use std::time::Duration;

        struct PausedFailures {
            next: AtomicUsize,
            entered: mpsc::Sender<usize>,
            releases: Mutex<Vec<Option<mpsc::Receiver<()>>>>,
        }
        impl SurfaceFactory for PausedFailures {
            fn kind(&self) -> &str {
                "filesystem"
            }
            fn create(&self, _: &str) -> SurfaceResult<SurfaceRef> {
                let index = self.next.fetch_add(1, Ordering::SeqCst);
                let release = self.releases.lock().unwrap()[index].take().unwrap();
                self.entered.send(index).unwrap();
                release.recv_timeout(Duration::from_secs(10)).unwrap();
                Err("expected failure".into())
            }
        }
        let registry = SurfaceRegistry::default();
        let (entered_tx, entered_rx) = mpsc::channel();
        let (release0, wait0) = mpsc::channel();
        let (release1, wait1) = mpsc::channel();
        registry.register(Arc::new(PausedFailures {
            next: AtomicUsize::new(0),
            entered: entered_tx,
            releases: Mutex::new(vec![Some(wait0), Some(wait1)]),
        }));
        let (finished_tx, finished_rx) = mpsc::channel();
        let runtime = tokio::runtime::Handle::current();
        let mut tasks = Vec::new();
        for _ in 0..2 {
            let other = registry.clone();
            let runtime = runtime.clone();
            let finished = finished_tx.clone();
            tasks.push(tokio::task::spawn_blocking(move || {
                let result = runtime.block_on(other.start_surface(
                    "filesystem",
                    "same",
                    SurfaceStartInput {
                        session_id: "session".into(),
                        project_root: "/".into(),
                        node_id: None,
                        properties: Map::new(),
                    },
                ));
                finished.send(result.is_err()).unwrap();
            }));
        }
        let first = entered_rx.recv_timeout(Duration::from_secs(10)).unwrap();
        let second = entered_rx.recv_timeout(Duration::from_secs(10)).unwrap();
        assert_ne!(first, second);
        assert!(registry.reserve_owner("same", "alice").is_none());
        release0.send(()).unwrap();
        assert!(finished_rx.recv_timeout(Duration::from_secs(10)).unwrap());
        assert!(registry.reserve_owner("same", "alice").is_none());
        release1.send(()).unwrap();
        assert!(finished_rx.recv_timeout(Duration::from_secs(10)).unwrap());
        let token = registry
            .reserve_owner("same", "alice")
            .expect("both creations exited");
        assert!(registry.finish_reservation("same", &token, true));
        for task in tasks {
            task.await.unwrap();
        }
    }

    #[tokio::test]
    async fn factory_panic_preserves_other_creation_guard() {
        use std::sync::{
            atomic::{AtomicUsize, Ordering},
            mpsc,
        };
        use std::time::Duration;

        struct PausedFactories {
            next: AtomicUsize,
            entered: mpsc::Sender<usize>,
            releases: Mutex<Vec<Option<mpsc::Receiver<()>>>>,
        }
        impl SurfaceFactory for PausedFactories {
            fn kind(&self) -> &str {
                "filesystem"
            }
            fn create(&self, _: &str) -> SurfaceResult<SurfaceRef> {
                let index = self.next.fetch_add(1, Ordering::SeqCst);
                let release = self.releases.lock().unwrap()[index].take().unwrap();
                self.entered.send(index).unwrap();
                release.recv_timeout(Duration::from_secs(10)).unwrap();
                if index == 0 {
                    panic!("expected factory panic");
                }
                Err("expected factory error".into())
            }
        }
        let registry = SurfaceRegistry::default();
        let (entered_tx, entered_rx) = mpsc::channel();
        let (release0, wait0) = mpsc::channel();
        let (release1, wait1) = mpsc::channel();
        registry.register(Arc::new(PausedFactories {
            next: AtomicUsize::new(0),
            entered: entered_tx,
            releases: Mutex::new(vec![Some(wait0), Some(wait1)]),
        }));
        let (finished_tx, finished_rx) = mpsc::channel();
        let runtime = tokio::runtime::Handle::current();
        let mut tasks = Vec::new();
        for _ in 0..2 {
            let other = registry.clone();
            let runtime = runtime.clone();
            let finished = finished_tx.clone();
            tasks.push(tokio::task::spawn_blocking(move || {
                let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                    runtime.block_on(other.start_surface(
                        "filesystem",
                        "same",
                        SurfaceStartInput {
                            session_id: "session".into(),
                            project_root: "/".into(),
                            node_id: None,
                            properties: Map::new(),
                        },
                    ))
                }));
                finished.send(matches!(result, Err(_))).unwrap();
            }));
        }
        let first = entered_rx.recv_timeout(Duration::from_secs(10)).unwrap();
        let second = entered_rx.recv_timeout(Duration::from_secs(10)).unwrap();
        assert_ne!(first, second);
        release0.send(()).unwrap();
        assert!(finished_rx.recv_timeout(Duration::from_secs(10)).unwrap());
        assert!(registry.reserve_owner("same", "alice").is_none());
        release1.send(()).unwrap();
        assert!(!finished_rx.recv_timeout(Duration::from_secs(10)).unwrap());
        let token = registry
            .reserve_owner("same", "alice")
            .expect("both creations exited");
        assert!(registry.finish_reservation("same", &token, true));
        for task in tasks {
            task.await.unwrap();
        }
    }

    #[tokio::test]
    async fn factory_failure_releases_creation_guard() {
        struct FailingFactory(bool);
        impl SurfaceFactory for FailingFactory {
            fn kind(&self) -> &str {
                "filesystem"
            }
            fn create(&self, _: &str) -> SurfaceResult<SurfaceRef> {
                if self.0 {
                    panic!("factory panic");
                }
                Err("factory error".into())
            }
        }
        for panic in [false, true] {
            let registry = SurfaceRegistry::default();
            registry.register(Arc::new(FailingFactory(panic)));
            let other = registry.clone();
            let task = tokio::spawn(async move {
                other
                    .start_surface(
                        "filesystem",
                        "same",
                        SurfaceStartInput {
                            session_id: "session".into(),
                            project_root: "/project".into(),
                            node_id: None,
                            properties: Map::new(),
                        },
                    )
                    .await
            });
            let result = task.await;
            if panic {
                assert!(matches!(result, Err(error) if error.is_panic()));
            } else {
                assert!(matches!(result.unwrap(), Err(error) if error == "factory error"));
            }
            let token = registry
                .reserve_owner("same", "owner")
                .expect("creation guard must be released");
            assert!(registry.finish_reservation("same", &token, true));
        }
    }

    #[tokio::test]
    async fn pending_registration_prevents_factory_creation() {
        struct CountingFactory(Arc<std::sync::atomic::AtomicUsize>);
        impl SurfaceFactory for CountingFactory {
            fn kind(&self) -> &str {
                "filesystem"
            }
            fn create(&self, _: &str) -> SurfaceResult<SurfaceRef> {
                self.0.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                Ok(Arc::new(TestSurface))
            }
        }
        let registry = SurfaceRegistry::default();
        let calls = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        registry.register(Arc::new(CountingFactory(calls.clone())));
        let token = registry.reserve_owner("same", "alice").unwrap();
        let input = SurfaceStartInput {
            session_id: "session".into(),
            project_root: "/".into(),
            node_id: None,
            properties: Map::new(),
        };
        assert!(
            registry
                .start_surface("filesystem", "same", input)
                .await
                .is_err()
        );
        assert_eq!(calls.load(std::sync::atomic::Ordering::SeqCst), 0);
        assert!(registry.finish_reservation("same", &token, true));
    }

    #[tokio::test]
    async fn factory_start_preserves_pending_registration() {
        let registry = SurfaceRegistry::default();
        registry.register(Arc::new(TestFactory));
        let token = registry.reserve_owner("same", "alice").unwrap();
        let pending: SurfaceRef = Arc::new(TestSurface);
        assert!(registry.register_reserved_instance("same", &token, pending.clone()));
        let input = SurfaceStartInput {
            session_id: "session".into(),
            project_root: "/".into(),
            node_id: None,
            properties: Map::new(),
        };
        assert!(
            registry
                .start_surface("filesystem", "same", input)
                .await
                .is_err()
        );
        assert!(Arc::ptr_eq(&registry.surface("same").unwrap(), &pending));
        assert!(registry.surface_with_owner("same").is_none());
        assert!(registry.finish_reservation("same", &token, false));
        let (current, owner) = registry.surface_with_owner("same").unwrap();
        assert!(Arc::ptr_eq(&current, &pending));
        assert_eq!(owner.as_deref(), Some("alice"));
    }

    #[tokio::test]
    async fn start_replacement_replaces_owner_with_instance() {
        let registry = SurfaceRegistry::default();
        registry.register(Arc::new(TestFactory));
        registry.register_instance("same", Arc::new(TestSurface));
        registry.set_owner("same", "old-owner");
        let input = |user: Option<&str>| {
            let mut properties = Map::new();
            if let Some(user) = user {
                properties.insert("userId".into(), user.into());
            }
            SurfaceStartInput {
                session_id: "session".into(),
                project_root: "/".into(),
                node_id: None,
                properties,
            }
        };
        registry
            .start_surface("filesystem", "same", input(Some("new-owner")))
            .await
            .unwrap();
        assert_eq!(registry.owner("same").as_deref(), Some("new-owner"));
        registry
            .start_surface("filesystem", "same", input(None))
            .await
            .unwrap();
        assert_eq!(registry.owner("same"), None);
    }

    #[tokio::test]
    async fn stop_captured_instance_rejects_replacement() {
        let registry = SurfaceRegistry::default();
        let original: SurfaceRef = Arc::new(TestSurface);
        let replacement: SurfaceRef = Arc::new(TestSurface);
        registry.register_instance("same", original.clone());
        registry.register_instance("same", replacement.clone());
        assert!(
            !registry
                .stop_surface_instance("same", original, None)
                .await
                .unwrap()
        );
        assert!(Arc::ptr_eq(
            &registry.surface("same").unwrap(),
            &replacement
        ));
    }

    #[tokio::test]
    async fn suspended_stop_preserves_replacement_and_owner() {
        struct PausedStop {
            entered: Arc<tokio::sync::Notify>,
            resume: Arc<tokio::sync::Notify>,
        }
        impl Surface for PausedStop {
            fn id(&self) -> &str {
                "same"
            }
            fn kind(&self) -> &str {
                "filesystem"
            }
            fn state(&self) -> SurfaceState {
                SurfaceState::Running
            }
            fn session_id(&self) -> Option<String> {
                Some("session".into())
            }
            fn start(&self, _: SurfaceStartInput) -> SurfaceFuture<'_, ()> {
                Box::pin(async { Ok(()) })
            }
            fn stop(&self, _: Option<String>) -> SurfaceFuture<'_, ()> {
                Box::pin(async {
                    self.entered.notify_one();
                    self.resume.notified().await;
                    Ok(())
                })
            }
            fn snapshot(&self) -> SurfaceResult<SurfaceSnapshot> {
                TestSurface.snapshot()
            }
        }
        let registry = SurfaceRegistry::default();
        let entered = Arc::new(tokio::sync::Notify::new());
        let resume = Arc::new(tokio::sync::Notify::new());
        let original: SurfaceRef = Arc::new(PausedStop {
            entered: entered.clone(),
            resume: resume.clone(),
        });
        let replacement: SurfaceRef = Arc::new(TestSurface);
        registry.register_instance("same", original);
        registry.set_owner("same", "alice");
        let stopping = registry.clone();
        let task = tokio::spawn(async move { stopping.stop_surface("same", None).await });
        entered.notified().await;
        registry.register_instance("same", replacement.clone());
        registry.set_owner("same", "bob");
        resume.notify_one();
        assert!(task.await.unwrap().unwrap());
        let (current, owner) = registry.surface_with_owner("same").unwrap();
        assert!(Arc::ptr_eq(&current, &replacement));
        assert_eq!(owner.as_deref(), Some("bob"));
    }

    #[tokio::test]
    async fn stop_does_not_unregister_replacement() {
        let registry = SurfaceRegistry::default();
        let original: SurfaceRef = Arc::new(TestSurface);
        let replacement: SurfaceRef = Arc::new(TestSurface);
        registry.register_instance("same", original);
        let callback_registry = registry.clone();
        let callback_replacement = replacement.clone();
        registry.on_stopped(Some(Arc::new(move |id, _, _| {
            callback_registry.register_instance(id, callback_replacement.clone());
            callback_registry.set_owner(id, "replacement-owner");
            Ok(())
        })));
        assert!(registry.stop_surface("same", None).await.unwrap());
        assert!(Arc::ptr_eq(
            &registry.surface("same").unwrap(),
            &replacement
        ));
        assert_eq!(registry.owner("same").as_deref(), Some("replacement-owner"));
    }
}
