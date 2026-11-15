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
        consent_manager::{ConsentManager, ConsentStatus},
        control_access::{ControlAccess, SqliteConsentOwnership, claim_owned_consent},
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

struct Queue {
    auth: AuthState,
    runtime: tokio::runtime::Handle,
    manager: ConsentManager,
}

impl Queue {
    fn decide_owned(&self, id: &str, user_id: &str, approved: bool) -> bool {
        let (manager, id, user) = (self.manager.clone(), id.to_owned(), user_id.to_owned());
        let worker = self.auth.worker();
        // Ownership is leased by a SQLite immediate transaction for the claim
        // itself; the claim is finalized after the lease is released.
        let claim = self
            .runtime
            .block_on(async move {
                worker
                    .run(move |db| {
                        Ok(claim_owned_consent(
                            &SqliteConsentOwnership { db },
                            &manager,
                            &user,
                            &id,
                            approved,
                            None,
                        )
                        .ok()
                        .flatten())
                    })
                    .await
            })
            .ok()
            .flatten();
        claim.is_some_and(|claim| claim.finalize().is_ok())
    }
}

impl ConsentStore for Queue {
    fn list_pending(&self) -> Vec<Value> {
        self.manager
            .list_pending(None)
            .into_iter()
            .filter_map(|request| serde_json::to_value(request.snapshot()).ok())
            .collect()
    }
    fn decide(&self, id: &str, user_id: &str, approve: bool) -> bool {
        self.decide_owned(id, user_id, approve)
    }
}

pub fn composed_mobile_routes(auth: &AuthState, manager: ConsentManager) -> MobileRoutes {
    MobileRoutes::new(
        auth.clone(),
        Arc::new(MemoryDevices::default()),
        Arc::new(Queue {
            auth: auth.clone(),
            runtime: tokio::runtime::Handle::current(),
            manager: manager.clone(),
        }),
        Arc::new(Owners {
            auth: auth.clone(),
            runtime: tokio::runtime::Handle::current(),
            manager,
        }),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        db::worker::DatabaseWorker,
        security::{
            consent_manager::{ConsentManager, ConsentRequestPolicy, RequestConsent},
            contracts::Risk,
            tool_permissions::{ConsentLevel, PolicySource},
        },
    };
    use rusqlite::Connection;
    use std::num::NonZeroU16;

    fn request() -> RequestConsent {
        RequestConsent {
            action_id: "action".into(),
            tool_name: "tool".into(),
            summary: "test".into(),
            preview: Default::default(),
            risk: Risk::High,
            policy: ConsentRequestPolicy {
                consent_level: ConsentLevel::Always,
                description: "test".into(),
                known_tool: true,
                source: PolicySource::Profile,
            },
            session_id: "session".into(),
            timeout_ms: Some(10_000.0),
        }
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn only_the_session_owner_can_decide_a_consent() {
        let db = Connection::open_in_memory().unwrap();
        db.execute_batch("CREATE TABLE sessions(id TEXT PRIMARY KEY, user_id TEXT); CREATE TABLE agent_threads(id TEXT PRIMARY KEY, user_id TEXT); INSERT INTO sessions VALUES('session','owner');").unwrap();
        let worker = DatabaseWorker::new(db, NonZeroU16::new(2).unwrap()).unwrap();
        let auth = AuthState::from_worker(worker, "test-secret".into()).unwrap();
        let manager = ConsentManager::default();
        let pending = manager.request_consent(request()).unwrap();
        let queue = Arc::new(Queue {
            auth,
            runtime: tokio::runtime::Handle::current(),
            manager: manager.clone(),
        });
        let id = pending.id.clone();
        let decide = |user: &'static str, approve: bool| {
            let (queue, id) = (queue.clone(), id.clone());
            async move {
                tokio::task::spawn_blocking(move || queue.decide(&id, user, approve))
                    .await
                    .unwrap()
            }
        };
        assert!(!decide("intruder", true).await);
        assert!(!decide("intruder", false).await);
        assert_eq!(manager.pending_count(), 1);
        assert!(decide("owner", true).await);
        assert_eq!(manager.pending_count(), 0);
        assert!(!decide("owner", true).await);
    }
}
