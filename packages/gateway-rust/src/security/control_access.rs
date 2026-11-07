//! Shared ownership checks for HTTP, WebSocket input and output.
//! Store adapters perform blocking reads on the bounded worker.
use crate::services::sessions::{CreateSession, SessionService};
pub type AccessResult<T> = Result<T, String>;
pub trait SessionAccess {
    fn owned_session_exists(&self, session: &str, user: &str) -> AccessResult<bool>;
    fn create_execution_session(&self, user: &str, root: &str) -> AccessResult<String>;
}
impl SessionAccess for SessionService<'_> {
    fn owned_session_exists(&self, session: &str, user: &str) -> AccessResult<bool> {
        self.get(session, Some(user))
            .map(|v| v.is_some())
            .map_err(|e| e.to_string())
    }
    fn create_execution_session(&self, user: &str, root: &str) -> AccessResult<String> {
        self.create(CreateSession {
            user_id: Some(user.into()),
            project_path: Some(root.into()),
            name: Some("API tool session".into()),
            ..Default::default()
        })
        .map(|v| v.id)
        .map_err(|e| e.to_string())
    }
}
pub struct AccessSurface {
    pub session_id: Option<String>,
    pub owner: Option<String>,
}
pub struct AccessConsent {
    pub status: String,
    pub session_id: String,
}
pub trait SurfaceAccess {
    fn surface(&self, id: &str) -> AccessResult<Option<AccessSurface>>;
}
pub trait ConsentAccess {
    fn request(&self, id: &str) -> AccessResult<Option<AccessConsent>>;
}
pub trait ThreadAccess {
    fn owner(&self, id: &str) -> AccessResult<Option<String>>;
}
#[derive(Default)]
pub struct ControlAccess<'a> {
    pub sessions: Option<&'a dyn SessionAccess>,
    pub surfaces: Option<&'a dyn SurfaceAccess>,
    pub consent: Option<&'a dyn ConsentAccess>,
    pub threads: Option<&'a dyn ThreadAccess>,
}
impl ControlAccess<'_> {
    pub fn execution_session(&self, id: &str, user: &str, root: &str) -> AccessResult<String> {
        if id == "default"
            && let Some(sessions) = self.sessions
        {
            return sessions.create_execution_session(user, root);
        }
        Ok(id.into())
    }
    pub fn session(&self, id: &str, user: Option<&str>) -> AccessResult<bool> {
        let Some(user) = user.filter(|u| !u.is_empty()) else {
            return Ok(false);
        };
        if let Some(sessions) = self.sessions
            && sessions.owned_session_exists(id, user)?
        {
            return Ok(true);
        }
        match self.threads {
            Some(threads) => Ok(threads.owner(id)?.as_deref() == Some(user)),
            None => Ok(false),
        }
    }
    pub fn surface(&self, id: &str, user: Option<&str>) -> AccessResult<bool> {
        let Some(user) = user.filter(|u| !u.is_empty()) else {
            return Ok(false);
        };
        let Some(surfaces) = self.surfaces else {
            return Ok(false);
        };
        let Some(surface) = surfaces.surface(id)? else {
            return Ok(false);
        };
        match surface.owner.filter(|owner| !owner.is_empty()) {
            Some(owner) => Ok(owner == user),
            None => self.session(surface.session_id.as_deref().unwrap_or(""), Some(user)),
        }
    }
    pub fn consent_request(&self, id: &str, user: Option<&str>) -> AccessResult<bool> {
        let Some(consent) = self.consent else {
            return Ok(false);
        };
        let Some(request) = consent.request(id)? else {
            return Ok(false);
        };
        Ok(request.status == "pending" && self.session(&request.session_id, user)?)
    }
}

/// Host authority whose lease serializes session ownership changes with claims.
/// Implementations must synchronize *all* ownership revocations with the lease;
/// a point-in-time ownership lookup does not satisfy this contract.
pub(crate) trait ConsentOwnershipLease {
    type Lease<'a>
    where
        Self: 'a;
    fn acquire<'a>(&'a self, session: &str, user: &str) -> AccessResult<Option<Self::Lease<'a>>>;
}

/// SQLite ownership authority for claims executed on the database worker. An
/// immediate transaction prevents other SQLite writers from changing ownership
/// until the claim is made. Sessions and agent_threads must be in this same
/// database, and every ownership revocation must write to that database.
/// This is not suitable for callbacks or persistence while the lease is held.
pub(crate) struct SqliteConsentOwnership<'a> {
    pub(crate) db: &'a rusqlite::Connection,
}

impl ConsentOwnershipLease for SqliteConsentOwnership<'_> {
    type Lease<'a>
        = rusqlite::Transaction<'a>
    where
        Self: 'a;

    fn acquire<'a>(&'a self, session: &str, user: &str) -> AccessResult<Option<Self::Lease<'a>>> {
        if session.is_empty() || user.trim().is_empty() {
            return Ok(None);
        }
        let tx =
            rusqlite::Transaction::new_unchecked(self.db, rusqlite::TransactionBehavior::Immediate)
                .map_err(|e| e.to_string())?;
        let owned: bool = tx.query_row(
            "SELECT EXISTS(SELECT 1 FROM sessions WHERE id=?1 AND user_id=?2) OR EXISTS(SELECT 1 FROM agent_threads WHERE id=?1 AND user_id=?2)",
            rusqlite::params![session, user], |row| row.get(0),
        ).map_err(|e| e.to_string())?;
        if owned { Ok(Some(tx)) } else { Ok(None) }
    }
}

/// Claim only while the host confirms the authenticated user's ownership under
/// its lease. The caller must finalize the returned claim after this function
/// returns, on a supervised blocking lane. This adapter is not an authentication
/// mechanism and requires an actual host implementation to provide revocation.
pub(crate) fn claim_owned_consent<A: ConsentOwnershipLease>(
    authority: &A,
    manager: &crate::security::consent_manager::ConsentManager,
    user: &str,
    request_id: &str,
    approved: bool,
    reason: Option<String>,
) -> AccessResult<Option<crate::security::consent_manager::DecisionClaim>> {
    use crate::security::consent_manager::DecisionVia;
    if user.trim().is_empty() {
        return Ok(None);
    }
    let Some(request) = manager.get_request(request_id).map(|r| r.snapshot()) else {
        return Ok(None);
    };
    // The injected clock may execute host code; run it before taking the lease.
    let prepared = manager.prepare_decision_time()?;
    let Some(lease) = authority.acquire(&request.session_id, user)? else {
        return Ok(None);
    };
    let claim = manager.claim_for_session(
        request_id,
        &request.session_id,
        approved,
        DecisionVia::Click,
        reason,
        prepared,
    );
    drop(lease);
    claim
}

/// Claim a bounded batch while ownership is leased. Finalize the returned
/// claims only after this function releases the lease, on a supervised lane.
pub(crate) fn claim_owned_consent_batch<A: ConsentOwnershipLease>(
    authority: &A,
    manager: &crate::security::consent_manager::ConsentManager,
    user: &str,
    session: &str,
    limit: usize,
    reason: Option<String>,
) -> AccessResult<Option<Vec<(String, crate::security::consent_manager::DecisionClaim)>>> {
    if user.trim().is_empty() || session.is_empty() {
        return Ok(None);
    }
    let prepared = manager.prepare_decision_time()?;
    let Some(lease) = authority.acquire(session, user)? else {
        return Ok(None);
    };
    let claims = manager.claim_batch_for_session(session, limit, reason, prepared);
    drop(lease);
    claims.map(Some)
}

#[cfg(test)]
mod sqlite_ownership_tests {
    use super::{ConsentOwnershipLease, SqliteConsentOwnership};
    use rusqlite::{Connection, OpenFlags};

    #[test]
    fn sqlite_ownership_lease_serializes_other_connection_revocation() {
        let uri = "file:consent_ownership_lease_test?mode=memory&cache=shared";
        let flags = OpenFlags::SQLITE_OPEN_READ_WRITE
            | OpenFlags::SQLITE_OPEN_CREATE
            | OpenFlags::SQLITE_OPEN_URI;
        let db = Connection::open_with_flags(uri, flags).unwrap();
        let other = Connection::open_with_flags(uri, flags).unwrap();
        db.execute_batch("CREATE TABLE sessions(id TEXT PRIMARY KEY, user_id TEXT); CREATE TABLE agent_threads(id TEXT PRIMARY KEY, user_id TEXT); INSERT INTO sessions VALUES('session','owner');").unwrap();
        let authority = SqliteConsentOwnership { db: &db };
        assert!(authority.acquire("session", "wrong").unwrap().is_none());
        let lease = authority.acquire("session", "owner").unwrap().unwrap();
        // A distinct connection cannot revoke while the decision is claimed.
        assert!(
            other
                .execute(
                    "UPDATE sessions SET user_id='new-owner' WHERE id='session'",
                    []
                )
                .is_err()
        );
        drop(lease);
        assert_eq!(
            other
                .execute(
                    "UPDATE sessions SET user_id='new-owner' WHERE id='session'",
                    []
                )
                .unwrap(),
            1
        );
        assert!(authority.acquire("session", "owner").unwrap().is_none());
        assert!(authority.acquire("session", "new-owner").unwrap().is_some());
    }

    #[test]
    fn sqlite_lease_covers_thread_fallback_and_revocation() {
        let uri = "file:consent_thread_lease_test?mode=memory&cache=shared";
        let flags = OpenFlags::SQLITE_OPEN_READ_WRITE
            | OpenFlags::SQLITE_OPEN_CREATE
            | OpenFlags::SQLITE_OPEN_URI;
        let db = Connection::open_with_flags(uri, flags).unwrap();
        let other = Connection::open_with_flags(uri, flags).unwrap();
        db.execute_batch("CREATE TABLE sessions(id TEXT PRIMARY KEY, user_id TEXT); CREATE TABLE agent_threads(id TEXT PRIMARY KEY, user_id TEXT); INSERT INTO sessions VALUES('thread','different-owner'); INSERT INTO agent_threads VALUES('thread','owner');").unwrap();
        let authority = SqliteConsentOwnership { db: &db };
        let lease = authority.acquire("thread", "owner").unwrap().unwrap();
        assert!(
            other
                .execute(
                    "UPDATE agent_threads SET user_id='new-owner' WHERE id='thread'",
                    []
                )
                .is_err()
        );
        drop(lease);
        assert_eq!(
            other
                .execute(
                    "UPDATE agent_threads SET user_id='new-owner' WHERE id='thread'",
                    []
                )
                .unwrap(),
            1
        );
        assert!(authority.acquire("thread", "owner").unwrap().is_none());
        assert!(authority.acquire("thread", "new-owner").unwrap().is_some());
        assert!(
            authority
                .acquire("thread", "different-owner")
                .unwrap()
                .is_some()
        );
    }
}
/// Internal supervised single-decision path. The host must authenticate `user`,
/// provide its authoritative database worker, and ensure every ownership
/// mutation uses the same SQLite database. It is not a route or authentication
/// boundary. Lane admission precedes the claim, and accepted work completes even
/// if the awaiting caller disconnects. Callbacks never run on the database worker
/// or while its ownership transaction is held.
pub(crate) async fn supervised_sqlite_consent_decision(
    worker: crate::db::worker::DatabaseWorker,
    lane: crate::runtime::blocking::BlockingLane,
    manager: crate::security::consent_manager::ConsentManager,
    user: String,
    request_id: String,
    approved: bool,
    reason: Option<String>,
) -> Result<bool, String> {
    use crate::security::consent_manager::DecisionVia;
    let runtime = tokio::runtime::Handle::current();
    lane.run(move || {
        if user.trim().is_empty() {
            return Ok(false);
        }
        let Some(request) = manager.get_request(&request_id).map(|r| r.snapshot()) else {
            return Ok(false);
        };
        let prepared = manager.prepare_decision_time()?;
        let worker_manager = manager.clone();
        let claim = runtime
            .block_on(worker.run(move |db| {
                let authority = SqliteConsentOwnership { db };
                let Some(lease) = authority
                    .acquire(&request.session_id, &user)
                    .map_err(std::io::Error::other)?
                else {
                    return Ok(None);
                };
                let claim = worker_manager
                    .claim_for_session(
                        &request_id,
                        &request.session_id,
                        approved,
                        DecisionVia::Click,
                        reason,
                        prepared,
                    )
                    .map_err(std::io::Error::other)?;
                drop(lease);
                Ok(claim)
            }))
            .map_err(|e| e.to_string())?;
        match claim {
            Some(claim) => {
                claim.finalize()?;
                Ok(true)
            }
            None => Ok(false),
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod supervised_consent_tests {
    use super::supervised_sqlite_consent_decision;
    use crate::{
        db::worker::DatabaseWorker,
        runtime::blocking::BlockingLane,
        security::{
            consent_manager::{
                ConsentManager, ConsentManagerOptions, ConsentRequestPolicy, RequestConsent,
            },
            contracts::Risk,
            tool_permissions::{ConsentLevel, PolicySource},
        },
    };
    use rusqlite::{Connection, OpenFlags};
    use std::{
        num::NonZeroU16,
        sync::{Arc, mpsc},
        time::Duration,
    };

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
    async fn supervised_claim_rejects_overload_and_shutdown_before_claim() {
        let db = Connection::open_in_memory().unwrap();
        db.execute_batch("CREATE TABLE sessions(id TEXT PRIMARY KEY, user_id TEXT); CREATE TABLE agent_threads(id TEXT PRIMARY KEY, user_id TEXT); INSERT INTO sessions VALUES('session','owner');").unwrap();
        let worker = DatabaseWorker::new(db, NonZeroU16::new(2).unwrap()).unwrap();
        let lane = BlockingLane::new(NonZeroU16::new(1).unwrap());
        let manager = ConsentManager::default();
        let pending = manager.request_consent(request()).unwrap();
        let (entered, started) = tokio::sync::oneshot::channel();
        let (release, wait) = mpsc::channel();
        let busy_lane = lane.clone();
        let busy = tokio::spawn(async move {
            busy_lane
                .run(move || {
                    entered.send(()).unwrap();
                    wait.recv().unwrap();
                })
                .await
                .unwrap();
        });
        started.await.unwrap();
        let error = supervised_sqlite_consent_decision(
            worker.clone(),
            lane.clone(),
            manager.clone(),
            "owner".into(),
            pending.id.clone(),
            true,
            None,
        )
        .await
        .unwrap_err();
        assert!(error.contains("full"));
        assert_eq!(manager.pending_count(), 1);
        release.send(()).unwrap();
        busy.await.unwrap();
        worker.shutdown().await.unwrap();
        assert!(
            supervised_sqlite_consent_decision(
                worker.clone(),
                lane.clone(),
                manager.clone(),
                "owner".into(),
                pending.id.clone(),
                true,
                None
            )
            .await
            .is_err()
        );
        assert_eq!(manager.pending_count(), 1);
        lane.close_and_drain().await;
        assert!(
            supervised_sqlite_consent_decision(
                worker,
                lane,
                manager.clone(),
                "owner".into(),
                pending.id,
                true,
                None
            )
            .await
            .is_err()
        );
        assert_eq!(manager.pending_count(), 1);
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn supervised_claim_releases_sqlite_before_callback_and_survives_disconnect() {
        let uri = "file:supervised_consent_test?mode=memory&cache=shared";
        let flags = OpenFlags::SQLITE_OPEN_READ_WRITE
            | OpenFlags::SQLITE_OPEN_CREATE
            | OpenFlags::SQLITE_OPEN_URI;
        let db = Connection::open_with_flags(uri, flags).unwrap();
        db.execute_batch("CREATE TABLE sessions(id TEXT PRIMARY KEY, user_id TEXT); CREATE TABLE agent_threads(id TEXT PRIMARY KEY, user_id TEXT); INSERT INTO sessions VALUES('session','owner');").unwrap();
        let worker = DatabaseWorker::new(db, NonZeroU16::new(2).unwrap()).unwrap();
        let lane = BlockingLane::new(NonZeroU16::new(1).unwrap());
        let (entered, started) = tokio::sync::oneshot::channel();
        let entered = std::sync::Mutex::new(Some(entered));
        let (release, wait) = mpsc::channel();
        let wait = std::sync::Mutex::new(wait);
        let manager = ConsentManager::new(ConsentManagerOptions {
            on_decision: Some(Arc::new(move |_| {
                let other = Connection::open_with_flags(uri, flags).map_err(|e| e.to_string())?;
                other
                    .execute(
                        "UPDATE sessions SET user_id='new-owner' WHERE id='session'",
                        [],
                    )
                    .map_err(|e| e.to_string())?;
                if let Some(sender) = entered.lock().unwrap().take() {
                    let _ = sender.send(());
                }
                wait.lock().unwrap().recv().map_err(|e| e.to_string())?;
                Ok(())
            })),
            ..Default::default()
        });
        let mut pending = manager.request_consent(request()).unwrap();
        assert!(
            !supervised_sqlite_consent_decision(
                worker.clone(),
                lane.clone(),
                manager.clone(),
                "stranger".into(),
                pending.id.clone(),
                true,
                None
            )
            .await
            .unwrap()
        );
        let task = tokio::spawn(supervised_sqlite_consent_decision(
            worker.clone(),
            lane.clone(),
            manager.clone(),
            "owner".into(),
            pending.id.clone(),
            true,
            None,
        ));
        tokio::time::timeout(Duration::from_secs(5), started)
            .await
            .unwrap()
            .unwrap();
        task.abort();
        release.send(()).unwrap();
        assert!(
            tokio::time::timeout(Duration::from_secs(5), pending.wait())
                .await
                .unwrap()
                .unwrap()
                .approved
        );
        lane.close_and_drain().await;
        let next_lane = BlockingLane::new(NonZeroU16::new(1).unwrap());
        let next = manager.request_consent(request()).unwrap();
        assert!(
            !supervised_sqlite_consent_decision(
                worker.clone(),
                next_lane.clone(),
                manager.clone(),
                "owner".into(),
                next.id,
                true,
                None
            )
            .await
            .unwrap()
        );
        next_lane.close_and_drain().await;
        worker.shutdown().await.unwrap();
    }
}
