//! Mobile routes on the real consent queue and session ownership.
//!
//! The mobile collaborator traits are synchronous, and the router calls them on the
//! blocking pool, so waiting on the database worker here cannot stall the runtime. Any
//! failed lookup denies access. Push devices, routines and the active-session list have
//! no native backend yet, so they stay empty.
use crate::{
    routes::{
        auth::AuthState,
        mobile::{ConsentStore, ControlAccessView, DeviceRegistration, DeviceStore, MobileRoutes},
    },
    security::{
        consent_manager::{ConsentManager, ConsentStatus, DecisionVia},
        control_access::ControlAccess,
    },
    services::sessions::SessionService,
};
use serde_json::{Value, json};
use std::{
    collections::BTreeMap,
    sync::{Arc, Mutex},
};

#[derive(Default)]
struct MemoryDevices(Mutex<BTreeMap<String, Value>>);

impl DeviceStore for MemoryDevices {
    fn register(&self, registration: DeviceRegistration) -> Value {
        let now = crate::routes::mobile::iso_now();
        let device = json!({
            "id": registration.id,
            "name": registration.name,
            "platform": registration.platform,
            "capabilities": registration.capabilities,
            "lastSeenAt": now,
        });
        self.0
            .lock()
            .unwrap()
            .insert(registration.id, device.clone());
        device
    }
    fn heartbeat(&self, device_id: &str) -> Option<Value> {
        let mut devices = self.0.lock().unwrap();
        let device = devices.get_mut(device_id)?;
        device["lastSeenAt"] = json!(crate::routes::mobile::iso_now());
        Some(device.clone())
    }
    fn list(&self) -> Vec<Value> {
        self.0.lock().unwrap().values().cloned().collect()
    }
}

struct Owners {
    auth: AuthState,
    runtime: tokio::runtime::Handle,
    manager: ConsentManager,
}

impl Owners {
    fn owns(&self, session: &str, user: &str) -> bool {
        let (session, user) = (session.to_owned(), user.to_owned());
        let worker = self.auth.worker();
        self.runtime
            .block_on(async move {
                worker
                    .run(move |db| {
                        let sessions = SessionService::new(db);
                        Ok(ControlAccess {
                            sessions: Some(&sessions),
                            ..Default::default()
                        }
                        .session(&session, Some(&user))
                        .unwrap_or(false))
                    })
                    .await
            })
            .unwrap_or(false)
    }
}

impl ControlAccessView for Owners {
    fn session(&self, session_id: &str, user_id: &str) -> bool {
        self.owns(session_id, user_id)
    }
    fn consent_request(&self, id: &str, user_id: &str) -> bool {
        self.manager.get_request(id).is_some_and(|request| {
            let request = request.snapshot();
            request.status == ConsentStatus::Pending && self.owns(&request.session_id, user_id)
        })
    }
}

struct Queue(ConsentManager);

impl ConsentStore for Queue {
    fn list_pending(&self) -> Vec<Value> {
        self.0
            .list_pending(None)
            .into_iter()
            .filter_map(|request| serde_json::to_value(request.snapshot()).ok())
            .collect()
    }
    fn approve(&self, id: &str, _method: &str, _actor: &str) -> bool {
        self.0
            .approve(id, Some(DecisionVia::Click), None)
            .unwrap_or(false)
    }
    fn reject(&self, id: &str, _method: &str, _actor: &str) -> bool {
        self.0
            .reject(id, Some(DecisionVia::Click), None)
            .unwrap_or(false)
    }
}

pub fn composed_mobile_routes(auth: &AuthState, manager: ConsentManager) -> MobileRoutes {
    MobileRoutes::new(
        auth.clone(),
        Arc::new(MemoryDevices::default()),
        Arc::new(Queue(manager.clone())),
        Arc::new(Owners {
            auth: auth.clone(),
            runtime: tokio::runtime::Handle::current(),
            manager,
        }),
    )
}
