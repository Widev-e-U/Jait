//! Consent routes over the queue the settings chat's executor waits on.
//!
//! A user may only see and decide consents for sessions they own, and every decision is
//! written to the log. A failed ownership lookup denies access.
use crate::{
    routes::{
        auth::AuthState,
        consent::{ConsentAudit, ConsentClaim, ConsentOwnership, ConsentRoutes},
    },
    runtime::blocking::BlockingLane,
    security::{
        consent_manager::{ConsentManager, DecisionVia},
        control_access::{SqliteConsentOwnership, claim_owned_consent},
    },
    services::sessions::SessionService,
};
use std::{num::NonZeroU16, sync::Arc};

pub fn composed_consent_routes(auth: &AuthState, manager: ConsentManager) -> ConsentRoutes {
    let worker = auth.worker();
    let runtime = tokio::runtime::Handle::current();
    let claim_runtime = runtime.clone();
    // Runs on the blocking lane, so waiting on the database worker cannot stall the runtime.
    let owns_session: ConsentOwnership = Arc::new(move |session, user| {
        // Network Git prompts live in a per-user session that has no stored session row.
        if super::git_network::owns_consent_session(session, user) {
            return Ok(true);
        }
        let (session, user) = (session.to_owned(), user.to_owned());
        let worker = worker.clone();
        runtime
            .block_on(async move {
                worker
                    .run(move |db| {
                        Ok(SessionService::new(db)
                            .get(&session, Some(&user))?
                            .is_some())
                    })
                    .await
            })
            .map_err(|e| e.to_string())
    });
    let audit: ConsentAudit = Arc::new(|event| {
        eprintln!("consent audit: {event}");
        Ok(())
    });
    let claim: ConsentClaim = {
        let (worker, runtime, manager) = (auth.worker(), claim_runtime, manager.clone());
        Arc::new(move |user, id, approve, reason| {
            let Some(session) = manager.get_request(id).map(|r| r.snapshot().session_id) else {
                return Ok(false);
            };
            let claim = if super::git_network::owns_consent_session(&session, user) {
                // Per-user prompt session with no stored row to lease.
                manager.claim_for_session(
                    id,
                    &session,
                    approve,
                    DecisionVia::Click,
                    reason,
                    manager.prepare_decision_time()?,
                )?
            } else {
                let (manager, id, user) = (manager.clone(), id.to_owned(), user.to_owned());
                let worker = worker.clone();
                runtime
                    .block_on(async move {
                        worker
                            .run(move |db| {
                                claim_owned_consent(
                                    &SqliteConsentOwnership { db },
                                    &manager,
                                    &user,
                                    &id,
                                    approve,
                                    reason,
                                )
                                .map_err(Into::into)
                            })
                            .await
                    })
                    .map_err(|e| e.to_string())?
            };
            // Finalize only after the ownership lease is released.
            claim.map_or(Ok(false), |claim| claim.finalize().map(|_| true))
        })
    };
    ConsentRoutes {
        auth: auth.clone(),
        manager,
        owns_session,
        audit,
        claim: Some(claim),
        lane: BlockingLane::new(NonZeroU16::new(4).unwrap()),
        active_profile_name: None,
        permissions: Vec::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        db::worker::DatabaseWorker,
        security::{
            consent_manager::{ConsentRequestPolicy, RequestConsent},
            contracts::Risk,
            tool_permissions::{ConsentLevel, PolicySource},
        },
    };
    use rusqlite::Connection;

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn composed_claim_only_lets_the_session_owner_decide() {
        let db = Connection::open_in_memory().unwrap();
        db.execute_batch("CREATE TABLE sessions(id TEXT PRIMARY KEY, user_id TEXT); CREATE TABLE agent_threads(id TEXT PRIMARY KEY, user_id TEXT); INSERT INTO sessions VALUES('session','owner');").unwrap();
        let worker = DatabaseWorker::new(db, NonZeroU16::new(2).unwrap()).unwrap();
        let auth = AuthState::from_worker(worker, "test-secret".into()).unwrap();
        let manager = ConsentManager::default();
        let pending = manager
            .request_consent(RequestConsent {
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
            })
            .unwrap();
        let claim = composed_consent_routes(&auth, manager.clone())
            .claim
            .unwrap();
        let id = pending.id.clone();
        let decide = |user: &'static str, approve: bool| {
            let (claim, id) = (claim.clone(), id.clone());
            async move {
                tokio::task::spawn_blocking(move || claim(user, &id, approve, None))
                    .await
                    .unwrap()
                    .unwrap()
            }
        };
        assert!(!decide("intruder", true).await);
        assert!(!decide("intruder", false).await);
        assert_eq!(manager.pending_count(), 1);
        assert!(decide("owner", false).await);
        assert_eq!(manager.pending_count(), 0);
        assert!(!decide("owner", true).await);
    }
}
