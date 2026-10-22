//! Explicit development turn log on the existing bounded SQLite worker.
//! Ownership is checked in every transaction, including after transfer/deletion.
//! This log is separate from the production UI message/tool projection.
use super::chat_events::EventBus;
use super::chat_turn::{TurnEvent, TurnPersistence};
use crate::routes::auth::AuthState;
use futures_util::future::BoxFuture;
use rusqlite::{OptionalExtension, params};
use serde_json::{Value, json};
use std::sync::Arc;

const EVENT_TYPE: &str = "rust.chat.message";
const MAX_EVENT_BYTES: usize = 1024 * 1024;
const MAX_HISTORY_EVENTS: usize = 512;
const MAX_HISTORY_BYTES: usize = 8 * 1024 * 1024;

/// Construct only after HTTP authentication. Neither identity comes from model arguments.
#[derive(Clone)]
pub struct SqliteTurnStore {
    auth: AuthState,
    owner: String,
    session: String,
    events: Arc<EventBus>,
}
impl SqliteTurnStore {
    pub fn new(auth: AuthState, owner: String, session: String) -> Result<Self, String> {
        if owner.is_empty() || session.is_empty() {
            return Err("Authenticated owner and session are required".into());
        }
        Ok(Self {
            auth,
            owner,
            session,
            events: EventBus::new(),
        })
    }

    /// Fan committed events out to a shared bus (the HTTP subscription layer).
    /// Defaults to a private bus so store construction in tests stays unchanged.
    pub(crate) fn with_events(mut self, events: Arc<EventBus>) -> Self {
        self.events = events;
        self
    }

    pub(crate) fn identity(&self) -> (&str, &str) {
        (&self.owner, &self.session)
    }

    /// Returns all candidate turn events or fails: never silently drops old tool context.
    pub async fn load(&self) -> Result<Vec<TurnEvent>, String> {
        let owner = self.owner.clone();
        let session = self.session.clone();
        self.auth.with_database(move |db| {
            let tx = db.unchecked_transaction()?;
            require_owner(&tx, &owner, &session)?;
            super::chat_projection::require_native_history(&tx,&session)?;
            let mut events = Vec::new();
            let mut bytes = 0;
            {
                let mut statement = tx.prepare("SELECT payload,length(CAST(payload AS BLOB)) FROM session_events WHERE session_id=? AND type=? ORDER BY log_id LIMIT ?")?;
                let mut rows = statement.query(params![session, EVENT_TYPE, (MAX_HISTORY_EVENTS + 1) as i64])?;
                while let Some(row) = rows.next()? {
                    let length: i64 = row.get(1)?;
                    if length < 0 || length as usize > MAX_EVENT_BYTES {
                        return Err("Stored turn event exceeds migration runtime limits".into());
                    }
                    let payload: String = row.get(0)?;
                    bytes += payload.len();
                    if bytes > MAX_HISTORY_BYTES || events.len() == MAX_HISTORY_EVENTS {
                        return Err("Stored turn history exceeds migration runtime limits".into());
                    }
                    let value: Value = serde_json::from_str(&payload)?;
                    if value["version"] != 1 {
                        return Err("Unsupported stored turn history version".into());
                    }
                    events.push(serde_json::from_value(value["event"].clone())?);
                }
            }
            tx.commit()?;
            Ok(events)
        }).await.map_err(|_| "Turn history could not be loaded".into())
    }

    async fn append_event(&self, event: TurnEvent) -> Result<(), String> {
        let publish_event = event.clone();
        let payload = serde_json::to_string(&json!({"version":1,"event":event}))
            .map_err(|_| "Turn event could not be encoded")?;
        if payload.len() > MAX_EVENT_BYTES {
            return Err("Turn event exceeds persistence limit".into());
        }
        let owner = self.owner.clone();
        let session = self.session.clone();
        let events = self.events.clone();
        self.auth.with_database(move |db| {
            let tx = db.unchecked_transaction()?;
            require_owner(&tx, &owner, &session)?;
            super::chat_projection::require_native_history(&tx,&session)?;
            let (count, bytes): (i64, i64) = tx.query_row("SELECT count(*),COALESCE(sum(length(CAST(payload AS BLOB))),0) FROM session_events WHERE session_id=? AND type=?", params![session,EVENT_TYPE], |row| Ok((row.get(0)?,row.get(1)?)))?;
            if count >= MAX_HISTORY_EVENTS as i64 || bytes + payload.len() as i64 > MAX_HISTORY_BYTES as i64 {
                return Err("Stored turn history exceeds migration runtime limits".into());
            }
            // Allocate against every event type to preserve the shared append-only sequence.
            let next: i64 = tx.query_row("SELECT COALESCE(MAX(log_id),0)+1 FROM session_events WHERE session_id=?", [&session], |row| row.get(0))?;
            let now = chrono::Utc::now();
            tx.execute("INSERT INTO session_events(session_id,log_id,type,payload,created_at) VALUES(?,?,?,?,?)", params![session,next,EVENT_TYPE,payload,now.timestamp_millis()])?;
            tx.execute("UPDATE sessions SET last_active_at=? WHERE id=? AND user_id=?", params![now.to_rfc3339_opts(chrono::SecondsFormat::Millis,true),session,owner])?;
            super::chat_projection::project_log(&tx,&session)?;
            tx.commit()?;
            // Fan out only after the append is durable; a subscriber may resume
            // from this `log_id` and its replay is guaranteed to include it.
            let _ = events.publish(&session, next, &publish_event);
            Ok(())
        }).await.map_err(|_| "Turn event could not be persisted".into())
    }
}
impl TurnPersistence for SqliteTurnStore {
    /// The application session lease spans this preflight and all subsequent appends.
    /// This is admission under that exclusive lease, not a cross-process reservation.
    fn check_capacity(
        &self,
        events: usize,
        bytes: usize,
        max_event_bytes: usize,
    ) -> BoxFuture<'_, Result<(), String>> {
        Box::pin(async move {
            if events > MAX_HISTORY_EVENTS
                || bytes > MAX_HISTORY_BYTES
                || max_event_bytes > MAX_EVENT_BYTES
            {
                return Err("Turn batch exceeds persistence limits".into());
            }
            let owner = self.owner.clone();
            let session = self.session.clone();
            self.auth.with_database(move |db| {
                require_owner(db,&owner,&session)?;
                let (count,stored_bytes):(i64,i64)=db.query_row("SELECT count(*),COALESCE(sum(length(CAST(payload AS BLOB))),0) FROM session_events WHERE session_id=? AND type=?",params![session,EVENT_TYPE],|row|Ok((row.get(0)?,row.get(1)?)))?;
                if count as usize + events > MAX_HISTORY_EVENTS || stored_bytes as usize + bytes > MAX_HISTORY_BYTES {
                    return Err("Stored turn history has insufficient capacity".into());
                }
                Ok(())
            }).await.map_err(|_| "Turn batch could not be admitted".into())
        })
    }
    fn append(&self, event: TurnEvent) -> BoxFuture<'_, Result<(), String>> {
        Box::pin(self.append_event(event))
    }
}
fn require_owner(
    db: &rusqlite::Connection,
    owner: &str,
    session: &str,
) -> Result<(), crate::routes::auth::Error> {
    let found = db
        .query_row(
            "SELECT 1 FROM sessions WHERE id=? AND user_id=? AND status='active'",
            params![session, owner],
            |_| Ok(()),
        )
        .optional()?;
    found.ok_or_else(|| "Active session is unavailable".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        db,
        providers::openai_stream::{OpenAiFunction, OpenAiToolCall},
        security::consent_executor::ToolResult,
    };
    use std::path::{Path, PathBuf};
    fn artifact_database() -> PathBuf {
        let directory = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../.jait/artifacts/gateway-rust/chat-store")
            .join(uuid::Uuid::new_v4().to_string());
        std::fs::create_dir_all(&directory).unwrap();
        directory.join("turns.sqlite")
    }
    fn open(path: &Path) -> AuthState {
        let db = db::open_database(path).unwrap();
        db::migrate_database(&db).unwrap();
        db.execute("INSERT OR IGNORE INTO sessions(id,user_id,created_at,last_active_at,status) VALUES('session','owner','2026-10-21T00:00:00Z','2026-10-21T00:00:00Z','active')", []).unwrap();
        AuthState::new(db, "fixture-secret".into()).unwrap()
    }
    fn store(auth: &AuthState) -> SqliteTurnStore {
        SqliteTurnStore::new(auth.clone(), "owner".into(), "session".into()).unwrap()
    }
    #[tokio::test]
    async fn complete_tool_history_survives_restart_and_shared_log_sequence() {
        let path = artifact_database();
        let auth = open(&path);
        auth.with_database(|db| { db.execute("INSERT INTO session_events(session_id,log_id,type,payload,created_at) VALUES('session',40,'token','{}',0)",[])?; Ok(()) }).await.unwrap();
        let events = vec![
            TurnEvent::User {
                content: "inspect".into(),
            },
            TurnEvent::Assistant {
                content: String::new(),
                thinking: "private".into(),
                tool_calls: vec![OpenAiToolCall {
                    id: "call-1".into(),
                    kind: "function".into(),
                    function: OpenAiFunction {
                        name: "terminal".into(),
                        arguments: "{}".into(),
                    },
                }],
            },
            TurnEvent::Tool {
                tool_call_id: "call-1".into(),
                name: "terminal".into(),
                result: ToolResult::message(true, "verified"),
            },
            TurnEvent::Assistant {
                content: "done".into(),
                thinking: String::new(),
                tool_calls: vec![],
            },
        ];
        for event in &events {
            store(&auth).append(event.clone()).await.unwrap();
        }
        let ids = auth
            .with_database(|db| {
                let mut stmt = db.prepare("SELECT log_id FROM session_events ORDER BY log_id")?;
                Ok(stmt
                    .query_map([], |row| row.get::<_, i64>(0))?
                    .collect::<rusqlite::Result<Vec<_>>>()?)
            })
            .await
            .unwrap();
        assert_eq!(ids, vec![40, 41, 42, 43, 44]);
        auth.shutdown().await.unwrap();
        let restarted = open(&path);
        assert_eq!(store(&restarted).load().await.unwrap(), events);
        restarted.shutdown().await.unwrap();
    }
    #[tokio::test]
    async fn ownership_and_active_status_checked_on_every_read_and_write() {
        let auth = open(Path::new(":memory:"));
        let adapter = store(&auth);
        let other = SqliteTurnStore::new(auth.clone(), "other".into(), "session".into()).unwrap();
        assert!(other.load().await.is_err());
        assert!(
            other
                .append(TurnEvent::User {
                    content: "spoof".into()
                })
                .await
                .is_err()
        );
        adapter
            .append(TurnEvent::User {
                content: "allowed".into(),
            })
            .await
            .unwrap();
        auth.with_database(|db| {
            db.execute("UPDATE sessions SET user_id='other' WHERE id='session'", [])?;
            Ok(())
        })
        .await
        .unwrap();
        assert!(adapter.load().await.is_err());
        assert!(
            adapter
                .append(TurnEvent::User {
                    content: "revoked".into()
                })
                .await
                .is_err()
        );
        auth.with_database(|db| {
            db.execute(
                "UPDATE sessions SET status='archived' WHERE id='session'",
                [],
            )?;
            Ok(())
        })
        .await
        .unwrap();
        assert!(other.load().await.is_err());
        auth.shutdown().await.unwrap();
    }
    #[tokio::test]
    async fn oversize_and_corrupt_history_fail_without_exposing_sql() {
        let auth = open(Path::new(":memory:"));
        let adapter = store(&auth);
        assert!(
            adapter
                .append(TurnEvent::User {
                    content: "x".repeat(MAX_EVENT_BYTES)
                })
                .await
                .is_err()
        );
        assert!(adapter.load().await.unwrap().is_empty());
        auth.with_database(|db| { db.execute("INSERT INTO session_events(session_id,log_id,type,payload,created_at) VALUES('session',1,'rust.chat.message','{broken',0)",[])?; Ok(()) }).await.unwrap();
        assert_eq!(
            adapter.load().await.unwrap_err(),
            "Turn history could not be loaded"
        );
        auth.shutdown().await.unwrap();
    }
    #[tokio::test]
    async fn full_history_rejects_append_without_silent_truncation() {
        let auth = open(Path::new(":memory:"));
        let adapter = store(&auth);
        auth.with_database(|db| {
            for id in 1..=MAX_HISTORY_EVENTS as i64 {
                db.execute("INSERT INTO session_events(session_id,log_id,type,payload,created_at) VALUES('session',?,'rust.chat.message',?,0)",params![id,r#"{"version":1,"event":{"type":"user","content":"fixture"}}"#])?;
            }
            Ok(())
        }).await.unwrap();
        assert_eq!(adapter.load().await.unwrap().len(), MAX_HISTORY_EVENTS);
        assert!(adapter.check_capacity(1, 128, 128).await.is_err());
        assert!(
            adapter
                .append(TurnEvent::User {
                    content: "overflow".into()
                })
                .await
                .is_err()
        );
        assert_eq!(adapter.load().await.unwrap().len(), MAX_HISTORY_EVENTS);
        auth.shutdown().await.unwrap();
    }
}
