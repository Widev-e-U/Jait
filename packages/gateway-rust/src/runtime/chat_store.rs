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
const STREAM_EVENT_TYPE: &str = "rust.chat.stream";
const MAX_STREAM_EVENTS: i64 = 8192;
const MAX_STREAM_BYTES: i64 = 16 * 1024 * 1024;
const MAX_STREAM_EVENT_BYTES: usize = 64 * 1024;
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

    /// Check space for one maximum-size ordinary frame and a terminal frame.
    /// Call under the session lease before starting provider effects. This is not
    /// a cross-process reservation and does not reserve an entire turn's output.
    pub(crate) async fn check_stream_capacity(&self) -> Result<(), String> {
        let owner = self.owner.clone();
        let session = self.session.clone();
        self.auth.with_database(move |db| {
            let tx = db.unchecked_transaction()?;
            require_owner(&tx, &owner, &session)?;
            let (count, bytes): (i64, i64) = tx.query_row(
                "SELECT count(*),COALESCE(sum(length(CAST(payload AS BLOB))),0) FROM session_events WHERE session_id=? AND type=?",
                params![session, STREAM_EVENT_TYPE], |row| Ok((row.get(0)?, row.get(1)?)),
            )?;
            if count > MAX_STREAM_EVENTS - 2 || bytes > MAX_STREAM_BYTES - 2 * MAX_STREAM_EVENT_BYTES as i64 {
                return Err("Stored stream has insufficient capacity".into());
            }
            tx.commit()?;
            Ok(())
        }).await.map_err(|_| "Stream capacity could not be admitted".into())
    }

    /// Append an ordinary client frame while retaining one terminal frame slot.
    pub(crate) async fn append_stream_event(&self, event: Value) -> Result<(), String> {
        self.append_stream_frame(event, false).await
    }

    /// Append a final done/error frame, which may use the reserved slot.
    pub(crate) async fn append_stream_terminal(&self, event: Value) -> Result<(), String> {
        self.append_stream_frame(event, true).await
    }

    async fn append_stream_frame(&self, event: Value, terminal: bool) -> Result<(), String> {
        let kind = event.get("type").and_then(Value::as_str);
        if !event.is_object() || kind.is_none() || matches!(kind, Some("done" | "error")) != terminal {
            return Err("Invalid stream event".into());
        }
        let data = serde_json::to_string(&event).map_err(|_| "Stream event could not be encoded")?;
        if data.len() > MAX_STREAM_EVENT_BYTES {
            return Err("Stream event exceeds persistence limit".into());
        }
        let owner = self.owner.clone();
        let session = self.session.clone();
        let events = self.events.clone();
        self.auth.with_database(move |db| {
            let tx = db.unchecked_transaction()?;
            require_owner(&tx, &owner, &session)?;
            let (count, bytes): (i64, i64) = tx.query_row(
                "SELECT count(*),COALESCE(sum(length(CAST(payload AS BLOB))),0) FROM session_events WHERE session_id=? AND type=?",
                params![session, STREAM_EVENT_TYPE], |row| Ok((row.get(0)?, row.get(1)?)),
            )?;
            let reserve_count = if terminal { 0 } else { 1 };
            let reserve_bytes = if terminal { 0 } else { MAX_STREAM_EVENT_BYTES as i64 };
            if count >= MAX_STREAM_EVENTS - reserve_count || bytes + data.len() as i64 > MAX_STREAM_BYTES - reserve_bytes {
                return Err("Stored stream exceeds persistence limits".into());
            }
            let next: i64 = tx.query_row("SELECT COALESCE(MAX(log_id),0)+1 FROM session_events WHERE session_id=?", [&session], |row| row.get(0))?;
            tx.execute("INSERT INTO session_events(session_id,log_id,type,payload,created_at) VALUES(?,?,?,?,?)", params![session, next, STREAM_EVENT_TYPE, data, chrono::Utc::now().timestamp_millis()])?;
            tx.commit()?;
            let _ = events.publish_serialized(&session, next, data);
            Ok(())
        }).await.map_err(|_| "Stream event could not be persisted".into())
    }

    async fn append_event(&self, event: TurnEvent) -> Result<(), String> {
        let start = match &event {
            TurnEvent::User { content } => Some(serde_json::to_string(&json!({"type":"request","content":content}))
                .map_err(|_| "Stream event could not be encoded")?),
            _ => None,
        };
        if start.as_ref().is_some_and(|data| data.len() > MAX_STREAM_EVENT_BYTES) {
            return Err("Stream event exceeds persistence limit".into());
        }
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
            if let Some(data) = &start {
                let (count, bytes): (i64, i64) = tx.query_row(
                    "SELECT count(*),COALESCE(sum(length(CAST(payload AS BLOB))),0) FROM session_events WHERE session_id=? AND type=?",
                    params![session, STREAM_EVENT_TYPE], |row| Ok((row.get(0)?, row.get(1)?)),
                )?;
                if count >= MAX_STREAM_EVENTS - 1 || bytes + data.len() as i64 > MAX_STREAM_BYTES - MAX_STREAM_EVENT_BYTES as i64 {
                    return Err("Stored stream exceeds persistence limits".into());
                }
                tx.execute("INSERT INTO session_events(session_id,log_id,type,payload,created_at) VALUES(?,?,?,?,?)", params![session,next+1,STREAM_EVENT_TYPE,data,now.timestamp_millis()])?;
            }
            tx.execute("UPDATE sessions SET last_active_at=? WHERE id=? AND user_id=?", params![now.to_rfc3339_opts(chrono::SecondsFormat::Millis,true),session,owner])?;
            super::chat_projection::project_log(&tx,&session)?;
            tx.commit()?;
            if let Some(data) = start { let _ = events.publish_serialized(&session, next + 1, data); }
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
    use crate::runtime::chat_events::{Frame, Message};
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
    async fn stream_events_are_owner_checked_durable_and_separate_from_history() {
        let path = artifact_database();
        let auth = open(&path);
        let bus = EventBus::new();
        let (mut receiver, _) = bus.subscribe("session", "owner").unwrap();
        let adapter = store(&auth).with_events(bus.clone());
        let other = SqliteTurnStore::new(auth.clone(), "other".into(), "session".into())
            .unwrap()
            .with_events(bus);
        assert!(
            other
                .append_stream_event(json!({"type":"token","content":"no"}))
                .await
                .is_err()
        );
        assert!(
            adapter
                .append_stream_event(json!({"content":"missing type"}))
                .await
                .is_err()
        );
        assert!(
            adapter
                .append_stream_event(
                    json!({"type":"token","content":"x".repeat(MAX_STREAM_EVENT_BYTES)})
                )
                .await
                .is_err()
        );
        adapter
            .append_stream_event(json!({"type":"token","content":"yes"}))
            .await
            .unwrap();
        let Message::Durable(frame) = receiver.try_recv().unwrap() else { panic!("expected durable frame") };
        assert_eq!(frame.log_id, 1);
        assert_eq!(
            serde_json::from_str::<Value>(&frame.data).unwrap()["content"],
            "yes"
        );
        assert!(adapter.load().await.unwrap().is_empty());
        auth.shutdown().await.unwrap();
        let restarted = open(&path);
        let payload: String = restarted
            .with_database(|db| {
                Ok(db.query_row(
                    "SELECT payload FROM session_events WHERE session_id='session' AND type=?",
                    [STREAM_EVENT_TYPE],
                    |row| row.get(0),
                )?)
            })
            .await
            .unwrap();
        assert_eq!(
            serde_json::from_str::<Value>(&payload).unwrap()["content"],
            "yes"
        );
        restarted.shutdown().await.unwrap();
    }

    #[tokio::test]
    async fn user_history_and_request_frame_commit_together() {
        let auth = open(Path::new(":memory:"));
        let bus = EventBus::new();
        let (mut receiver, _) = bus.subscribe("session", "owner").unwrap();
        let adapter = store(&auth).with_events(bus);
        adapter.append(TurnEvent::User { content: "history".into() }).await.unwrap();
        let Message::Durable(start) = receiver.try_recv().unwrap() else { panic!("expected request") };
        assert_eq!(start.log_id, 2);
        assert_eq!(serde_json::from_str::<Value>(&start.data).unwrap()["content"], "history");
        adapter.append_stream_event(json!({"type":"token","content":"visible"})).await.unwrap();
        let Message::Durable(frame) = receiver.try_recv().unwrap() else { panic!("expected durable frame") };
        assert_eq!(frame.log_id, 3);
        assert_eq!(serde_json::from_str::<Value>(&frame.data).unwrap()["content"], "visible");
        auth.shutdown().await.unwrap();
    }

    #[tokio::test]
    async fn full_stream_rejects_without_deleting_or_publishing() {
        let auth = open(Path::new(":memory:"));
        let bus = EventBus::new();
        let (mut receiver, _) = bus.subscribe("session", "owner").unwrap();
        let adapter = store(&auth).with_events(bus);
        auth.with_database(|db| {
            let tx = db.unchecked_transaction()?;
            {
                let mut insert = tx.prepare("INSERT INTO session_events(session_id,log_id,type,payload,created_at) VALUES('session',?,?,?,0)")?;
                for id in 1..=MAX_STREAM_EVENTS {
                    insert.execute(params![id, STREAM_EVENT_TYPE, r#"{"type":"token"}"#])?;
                }
            }
            tx.commit()?;
            Ok(())
        }).await.unwrap();
        assert!(adapter.append_stream_terminal(json!({"type":"done"})).await.is_err());
        assert!(matches!(receiver.try_recv(), Err(tokio::sync::broadcast::error::TryRecvError::Empty)));
        let (count, first, last): (i64, i64, i64) = auth.with_database(|db| {
            Ok(db.query_row("SELECT count(*),min(log_id),max(log_id) FROM session_events WHERE session_id='session' AND type=?", [STREAM_EVENT_TYPE], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))?)
        }).await.unwrap();
        assert_eq!((count, first, last), (MAX_STREAM_EVENTS, 1, MAX_STREAM_EVENTS));
        auth.shutdown().await.unwrap();
    }

    #[tokio::test]
    async fn stream_reserves_terminal_slot_and_preflight_checks_ownership() {
        let auth = open(Path::new(":memory:"));
        let bus = EventBus::new();
        let (mut receiver, _) = bus.subscribe("session", "owner").unwrap();
        let adapter = store(&auth).with_events(bus);
        assert!(adapter.check_stream_capacity().await.is_ok());
        let other = SqliteTurnStore::new(auth.clone(), "other".into(), "session".into()).unwrap();
        assert!(other.check_stream_capacity().await.is_err());
        assert!(adapter.append_stream_event(json!({"type":"done"})).await.is_err());
        assert!(adapter.append_stream_terminal(json!({"type":"token"})).await.is_err());
        auth.with_database(|db| {
            let tx = db.unchecked_transaction()?;
            {
                let mut insert = tx.prepare("INSERT INTO session_events(session_id,log_id,type,payload,created_at) VALUES('session',?,?,?,0)")?;
                for id in 1..MAX_STREAM_EVENTS {
                    insert.execute(params![id, STREAM_EVENT_TYPE, r#"{"type":"token"}"#])?;
                }
            }
            tx.commit()?;
            Ok(())
        }).await.unwrap();
        assert!(adapter.check_stream_capacity().await.is_err());
        assert!(adapter.append_stream_event(json!({"type":"token"})).await.is_err());
        assert!(matches!(receiver.try_recv(), Err(tokio::sync::broadcast::error::TryRecvError::Empty)));
        adapter.append_stream_terminal(json!({"type":"error"})).await.unwrap();
        let Message::Durable(Frame { log_id, .. }) = receiver.try_recv().unwrap() else { panic!("expected durable frame") };
        assert_eq!(log_id, MAX_STREAM_EVENTS);
        assert!(adapter.append_stream_terminal(json!({"type":"done"})).await.is_err());
        auth.shutdown().await.unwrap();
    }

    #[tokio::test]
    async fn stream_byte_limit_preserves_terminal_reserve() {
        let auth = open(Path::new(":memory:"));
        let adapter = store(&auth);
        auth.with_database(|db| {
            let empty = serde_json::to_string(&json!({"type":"token","content":""}))?;
            let payload = serde_json::to_string(&json!({"type":"token","content":"x".repeat(MAX_STREAM_EVENT_BYTES - empty.len())}))?;
            assert_eq!(payload.len(), MAX_STREAM_EVENT_BYTES);
            let tx = db.unchecked_transaction()?;
            {
                let mut insert = tx.prepare("INSERT INTO session_events(session_id,log_id,type,payload,created_at) VALUES('session',?,?,?,0)")?;
                for id in 1..=(MAX_STREAM_BYTES / MAX_STREAM_EVENT_BYTES as i64 - 1) {
                    insert.execute(params![id, STREAM_EVENT_TYPE, payload])?;
                }
            }
            tx.commit()?;
            Ok(())
        }).await.unwrap();
        assert!(adapter.check_stream_capacity().await.is_err());
        assert!(adapter.append_stream_event(json!({"type":"token"})).await.is_err());
        adapter.append_stream_terminal(json!({"type":"error"})).await.unwrap();
        let bytes: i64 = auth.with_database(|db| {
            Ok(db.query_row("SELECT sum(length(CAST(payload AS BLOB))) FROM session_events WHERE session_id='session' AND type=?", [STREAM_EVENT_TYPE], |row| row.get(0))?)
        }).await.unwrap();
        assert!(bytes <= MAX_STREAM_BYTES);
        auth.shutdown().await.unwrap();
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
        assert_eq!(ids, vec![40, 41, 42, 43, 44, 45]);
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
