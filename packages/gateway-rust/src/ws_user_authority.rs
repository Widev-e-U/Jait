//! Async current-user existence checks backing the WebSocket hub authority.
//!
//! [`WsUserAuthority`] implements [`crate::ws::WsUserAuthorityCheck`], so the hub
//! consults it at upgrade admission, at identity binding/re-authentication and on
//! every protected dispatch. This is only an existence check, not token verification
//! or resource authority. It uses the shared worker's bounded mailbox and does not
//! cache results, so revocation takes effect on the next check.
//!
//! Fail-closed contract: empty IDs, zero deadlines, mailbox overload, worker errors
//! and deadlines that expire before the query returns all deny.
use std::time::Duration;

use crate::db::worker::DatabaseWorker;

#[derive(Clone)]
pub struct WsUserAuthority {
    database: DatabaseWorker,
    timeout: Duration,
}

impl WsUserAuthority {
    /// Use an existing worker and an explicit deadline for each check.
    pub fn new(database: DatabaseWorker, timeout: Duration) -> Self {
        Self { database, timeout }
    }

    /// Resolve a paired-node credential against current ownership and user existence.
    pub async fn resolve_node(
        &self,
        token: &str,
    ) -> Option<crate::services::node_credentials::NodeIdentity> {
        if token.is_empty() || self.timeout.is_zero() {
            return None;
        }
        let token = token.to_owned();
        tokio::time::timeout(
            self.timeout,
            self.database.run(move |db| {
                Ok(
                    crate::services::node_credentials::NodeCredentialsService::new(Some(db))
                        .resolve_active(&token)?,
                )
            }),
        )
        .await
        .ok()?
        .ok()?
    }

    /// Check current ownership through the same sessions table used by HTTP routes.
    pub async fn session_owned(&self, user_id: &str, session_id: &str) -> bool {
        if user_id.is_empty() || session_id.is_empty() || self.timeout.is_zero() {
            return false;
        }
        let user_id = user_id.to_owned();
        let session_id = session_id.to_owned();
        matches!(
            tokio::time::timeout(
                self.timeout,
                self.database.run(move |db| {
                    Ok(crate::services::sessions::SessionService::new(db)
                        .get(&session_id, Some(&user_id))?
                        .is_some())
                })
            )
            .await,
            Ok(Ok(true))
        )
    }

    /// Returns true only when the exact ID is present and the check completes
    /// successfully before the deadline. Invalid IDs, overload and errors deny.
    pub async fn user_exists(&self, user_id: &str) -> bool {
        if user_id.is_empty() || self.timeout.is_zero() {
            return false;
        }
        let user_id = user_id.to_owned();
        matches!(
            tokio::time::timeout(
                self.timeout,
                self.database.run(move |db| {
                    Ok(db.query_row(
                        "SELECT EXISTS(SELECT 1 FROM users WHERE id = ?1)",
                        [&user_id],
                        |row| row.get::<_, bool>(0),
                    )?)
                }),
            )
            .await,
            Ok(Ok(true))
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;
    use std::num::NonZeroU16;
    use tokio::sync::oneshot;

    fn worker(schema: bool) -> DatabaseWorker {
        let db = Connection::open_in_memory().unwrap();
        if schema {
            db.execute_batch(
                "CREATE TABLE users (id TEXT PRIMARY KEY); INSERT INTO users VALUES ('alice');",
            )
            .unwrap();
        }
        DatabaseWorker::new(db, NonZeroU16::new(1).unwrap()).unwrap()
    }

    #[tokio::test]
    async fn exact_existence_and_revocation() {
        let db = worker(true);
        let authority = WsUserAuthority::new(db.clone(), Duration::from_secs(2));
        assert!(authority.user_exists("alice").await);
        assert!(!authority.user_exists("Alice").await);
        assert!(!authority.user_exists("' OR 1=1 --").await);
        assert!(!authority.user_exists("").await);
        db.run(|db| {
            db.execute("DELETE FROM users WHERE id = ?1", ["alice"])?;
            Ok(())
        })
        .await
        .unwrap();
        assert!(!authority.user_exists("alice").await);
        db.shutdown().await.unwrap();
        assert!(!authority.user_exists("alice").await);
    }

    #[tokio::test]
    async fn node_identity_requires_live_user_owner_and_credential() {
        let db = worker(true);
        let token = db.run(|db| {
            db.execute_batch("CREATE TABLE nodes(node_id TEXT PRIMARY KEY, user_id TEXT); CREATE TABLE node_credentials(token_hash TEXT PRIMARY KEY, node_id TEXT, user_id TEXT, created_at TEXT); INSERT INTO nodes VALUES('n','alice');")?;
            Ok(crate::services::node_credentials::NodeCredentialsService::new(Some(db))
                .issue("n", "alice")?.unwrap())
        }).await.unwrap();
        let authority = WsUserAuthority::new(db.clone(), Duration::from_secs(2));
        assert_eq!(authority.resolve_node(&token).await.unwrap().node_id, "n");
        db.run(|db| {
            db.execute("UPDATE nodes SET user_id='other'", [])?;
            Ok(())
        })
        .await
        .unwrap();
        assert!(authority.resolve_node(&token).await.is_none());
        db.run(|db| {
            db.execute("UPDATE nodes SET user_id='alice'", [])?;
            db.execute("DELETE FROM users WHERE id='alice'", [])?;
            Ok(())
        })
        .await
        .unwrap();
        assert!(authority.resolve_node(&token).await.is_none());
        db.run(|db| {
            db.execute("INSERT INTO users VALUES('alice')", [])?;
            db.execute("DELETE FROM node_credentials", [])?;
            Ok(())
        })
        .await
        .unwrap();
        assert!(authority.resolve_node(&token).await.is_none());
        db.shutdown().await.unwrap();
    }

    /// A job cancelled by its caller stays in the bounded mailbox until the worker thread pops it,
    /// and the worker pops it only after the running job has responded. Wait for the mailbox to
    /// drain before the next database job, or that job is refused as busy.
    async fn wait_for_mailbox_drain(db: &DatabaseWorker) {
        for _ in 0..1_000 {
            if db.queued_jobs() == 0 {
                return;
            }
            tokio::time::sleep(Duration::from_millis(1)).await;
        }
        panic!("worker mailbox did not drain the cancelled job");
    }

    #[tokio::test]
    async fn node_resolution_timeout_and_database_failure_deny() {
        let db = worker(true);
        let token = db.run(|db| {
            db.execute_batch("CREATE TABLE nodes(node_id TEXT PRIMARY KEY, user_id TEXT); CREATE TABLE node_credentials(token_hash TEXT PRIMARY KEY, node_id TEXT, user_id TEXT, created_at TEXT); INSERT INTO nodes VALUES('n','alice');")?;
            Ok(crate::services::node_credentials::NodeCredentialsService::new(Some(db))
                .issue("n", "alice")?.unwrap())
        }).await.unwrap();
        let (started_tx, started_rx) = oneshot::channel();
        let (release_tx, release_rx) = std::sync::mpsc::channel();
        let blocking_db = db.clone();
        let blocking = tokio::spawn(async move {
            blocking_db
                .run(move |db| {
                    let _ = started_tx.send(());
                    release_rx.recv_timeout(Duration::from_secs(5))?;
                    db.execute("DELETE FROM node_credentials", [])?;
                    Ok(())
                })
                .await
        });
        started_rx.await.unwrap();
        let short = WsUserAuthority::new(db.clone(), Duration::from_millis(25));
        assert!(short.resolve_node(&token).await.is_none());
        release_tx.send(()).unwrap();
        blocking.await.unwrap().unwrap();
        wait_for_mailbox_drain(&db).await;
        let authority = WsUserAuthority::new(db.clone(), Duration::from_secs(2));
        assert!(authority.resolve_node(&token).await.is_none());
        db.run(|db| {
            db.execute("DROP TABLE users", [])?;
            Ok(())
        })
        .await
        .unwrap();
        assert!(authority.resolve_node(&token).await.is_none());
        db.shutdown().await.unwrap();
        assert!(authority.resolve_node(&token).await.is_none());
    }

    #[tokio::test]
    async fn session_ownership_is_current_and_fails_closed() {
        let db = worker(true);
        db.run(|db| {
            db.execute_batch("CREATE TABLE sessions (id TEXT PRIMARY KEY, user_id TEXT, project_id TEXT, name TEXT, project_path TEXT, created_at TEXT, last_active_at TEXT, viewed_at TEXT, status TEXT, metadata TEXT, shared_with_project INTEGER DEFAULT 0); INSERT INTO sessions VALUES ('s', 'alice', NULL, 'chat', NULL, 'now', 'now', NULL, 'active', NULL, 0);")?;
            Ok(())
        }).await.unwrap();
        let authority = WsUserAuthority::new(db.clone(), Duration::from_secs(2));
        assert!(authority.session_owned("alice", "s").await);
        assert!(!authority.session_owned("bob", "s").await);
        assert!(!authority.session_owned("", "s").await);
        db.run(|db| {
            db.execute("DELETE FROM sessions WHERE id = ?1", ["s"])?;
            Ok(())
        })
        .await
        .unwrap();
        assert!(!authority.session_owned("alice", "s").await);
        db.shutdown().await.unwrap();
        assert!(!authority.session_owned("alice", "s").await);
    }

    #[tokio::test]
    async fn database_error_and_zero_deadline_deny() {
        let db = worker(false);
        assert!(
            !WsUserAuthority::new(db.clone(), Duration::from_secs(2))
                .user_exists("alice")
                .await
        );
        assert!(
            !WsUserAuthority::new(db.clone(), Duration::ZERO)
                .user_exists("alice")
                .await
        );
        db.shutdown().await.unwrap();
    }

    #[tokio::test]
    async fn overload_and_timeout_deny() {
        let db = worker(true);
        let (started_tx, started_rx) = oneshot::channel();
        let (release_tx, release_rx) = std::sync::mpsc::channel();
        let blocking_db = db.clone();
        let blocking = tokio::spawn(async move {
            blocking_db
                .run(move |_| {
                    let _ = started_tx.send(());
                    release_rx.recv_timeout(Duration::from_secs(5))?;
                    Ok(())
                })
                .await
        });
        started_rx.await.unwrap();
        let authority = WsUserAuthority::new(db.clone(), Duration::from_millis(25));
        // The queued lookup times out while the worker is occupied.
        assert!(!authority.user_exists("alice").await);
        // Its cancelled job still occupies the single slot until dispatched.
        assert!(!authority.user_exists("alice").await);
        release_tx.send(()).unwrap();
        blocking.await.unwrap().unwrap();
        db.shutdown().await.unwrap();
    }
}
