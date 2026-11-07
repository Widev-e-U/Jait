//! Candidate thread turn log. Not wired into the provider or a route.
//!
//! Schema installation does not provision history: existing TypeScript activity is
//! not a complete provider transcript. An absent head fails closed.
//! Operations must be supervised by the session manager through completion, even
//! if their caller is cancelled; capacity preflight requires an exclusive lease.
use crate::{
    routes::auth::AuthState,
    runtime::chat_turn::{TurnEvent, TurnPersistence},
};
use futures_util::future::BoxFuture;
use rusqlite::{OptionalExtension, params};
use serde_json::json;

const MAX_EVENTS: usize = 512;
const MAX_BYTES: usize = 8 * 1024 * 1024;
const MAX_EVENT_BYTES: usize = 1024 * 1024;

#[path = "thread_turn_schema_installer.rs"]
mod thread_turn_schema_installer;
pub use thread_turn_schema_installer::install_schema;

#[derive(Clone)]
pub struct ThreadTurnStore {
    auth: AuthState,
    owner: String,
    thread: String,
    session: String,
}
impl ThreadTurnStore {
    /// All identities must come from authenticated application state, never model input.
    pub fn new(
        auth: AuthState,
        owner: String,
        thread: String,
        session: String,
    ) -> Result<Self, String> {
        if owner.is_empty() || thread.is_empty() || session.is_empty() {
            return Err("Authenticated owner, thread and provider session are required".into());
        }
        Ok(Self {
            auth,
            owner,
            thread,
            session,
        })
    }
    pub fn identity(&self) -> (&str, &str, &str) {
        (&self.owner, &self.thread, &self.session)
    }

    pub async fn load(&self) -> Result<Vec<TurnEvent>, String> {
        let this = self.clone();
        self.auth.with_database(move |db| {
            let tx = db.unchecked_transaction()?;
            this.authorize(&tx)?;
            let mut events = Vec::new();
            let mut bytes = 0usize;
            {
                let mut query = tx.prepare("SELECT payload, length(CAST(payload AS BLOB)), sequence FROM rust_thread_turn_events WHERE thread_id=?1 ORDER BY sequence LIMIT ?2")?;
                let mut rows = query.query(params![this.thread, (MAX_EVENTS + 1) as i64])?;
                while let Some(row) = rows.next()? {
                    let length: i64 = row.get(1)?;
                    let sequence: i64 = row.get(2)?;
                    if sequence != (events.len() + 1) as i64 { return Err("History sequence is incomplete".into()); }
                    if length < 0 || length as usize > MAX_EVENT_BYTES { return Err("History event exceeds limits".into()); }
                    let payload: String = row.get(0)?;
                    bytes = bytes.checked_add(payload.len()).ok_or("History size overflow")?;
                    if events.len() >= MAX_EVENTS || payload.len() > MAX_EVENT_BYTES || bytes > MAX_BYTES { return Err("History exceeds limits".into()); }
                    let value: serde_json::Value = serde_json::from_str(&payload)?;
                    if value["version"] != 1 { return Err("Unsupported history version".into()); }
                    events.push(serde_json::from_value(value["event"].clone())?);
                }
            }
            let expected: i64 = tx.query_row("SELECT event_count FROM rust_thread_turn_heads WHERE thread_id=?1", [&this.thread], |r| r.get(0))?;
            if expected != events.len() as i64 { return Err("History count is incomplete".into()); }
            tx.commit()?;
            Ok(events)
        }).await.map_err(|_| "Thread turn history could not be loaded".into())
    }
    // Authorization and head existence are checked inside the same transaction as
    // each read/write. A changed owner or provider session revokes the old store.
    fn authorize(
        &self,
        db: &rusqlite::Connection,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let found: Option<i64> = db.query_row(
            "SELECT 1 FROM agent_threads t JOIN rust_thread_turn_heads h ON h.thread_id=t.id WHERE t.id=?1 AND t.user_id=?2 AND t.provider_id='jait' AND t.provider_session_id=?3 AND h.owner_id=?2 AND h.provider_session_id=?3",
            params![self.thread, self.owner, self.session], |row| row.get(0)).optional()?;
        if found.is_none() {
            return Err("Thread turn authority unavailable".into());
        }
        Ok(())
    }
    async fn capacity(
        &self,
        events: usize,
        bytes: usize,
        max_event_bytes: usize,
    ) -> Result<(), String> {
        if events > MAX_EVENTS || bytes > MAX_BYTES || max_event_bytes > MAX_EVENT_BYTES {
            return Err("Thread turn batch exceeds limits".into());
        }
        let this = self.clone();
        self.auth.with_database(move |db| {
            let tx = db.unchecked_transaction()?;
            this.authorize(&tx)?;
            let (count, stored, last): (i64, i64, i64) = tx.query_row("SELECT count(*), COALESCE(sum(length(CAST(payload AS BLOB))),0), COALESCE(max(sequence),0) FROM rust_thread_turn_events WHERE thread_id=?1", [&this.thread], |r| Ok((r.get(0)?,r.get(1)?,r.get(2)?)))?;
            let expected: i64 = tx.query_row("SELECT event_count FROM rust_thread_turn_heads WHERE thread_id=?1", [&this.thread], |r| r.get(0))?;
            if count != expected || count != last { return Err("History sequence is incomplete".into()); }
            if count < 0 || stored < 0 || count as usize > MAX_EVENTS - events || stored as usize > MAX_BYTES - bytes { return Err("Thread turn history has insufficient capacity".into()); }
            tx.commit()?;
            Ok(())
        }).await.map_err(|_| "Thread turn capacity could not be checked".into())
    }
    async fn append_event(&self, event: TurnEvent) -> Result<(), String> {
        let payload = serde_json::to_string(&json!({"version":1,"event":event}))
            .map_err(|_| "Thread turn event could not be encoded")?;
        if payload.len() > MAX_EVENT_BYTES {
            return Err("Thread turn event exceeds limits".into());
        }
        let this = self.clone();
        self.auth.with_database(move |db| {
            let tx = db.unchecked_transaction()?;
            this.authorize(&tx)?;
            let (count, stored, last): (i64, i64, i64) = tx.query_row("SELECT count(*), COALESCE(sum(length(CAST(payload AS BLOB))),0), COALESCE(max(sequence),0) FROM rust_thread_turn_events WHERE thread_id=?1", [&this.thread], |r| Ok((r.get(0)?,r.get(1)?,r.get(2)?)))?;
            let expected: i64 = tx.query_row("SELECT event_count FROM rust_thread_turn_heads WHERE thread_id=?1", [&this.thread], |r| r.get(0))?;
            if count != expected || count != last { return Err("History sequence is incomplete".into()); }
            if count < 0 || stored < 0 || count as usize >= MAX_EVENTS || stored as usize > MAX_BYTES - payload.len() { return Err("Thread turn history exceeds limits".into()); }
            tx.execute("INSERT INTO rust_thread_turn_events(thread_id,sequence,payload) VALUES (?1, COALESCE((SELECT MAX(sequence)+1 FROM rust_thread_turn_events WHERE thread_id=?1),1), ?2)", params![this.thread,payload])?;
            tx.execute("UPDATE rust_thread_turn_heads SET event_count=event_count+1 WHERE thread_id=?1", [&this.thread])?;
            tx.commit()?;
            Ok(())
        }).await.map_err(|_| "Thread turn event could not be persisted".into())
    }
}
impl TurnPersistence for ThreadTurnStore {
    fn check_capacity(
        &self,
        events: usize,
        bytes: usize,
        max_event_bytes: usize,
    ) -> BoxFuture<'_, Result<(), String>> {
        Box::pin(self.capacity(events, bytes, max_event_bytes))
    }
    fn append(&self, event: TurnEvent) -> BoxFuture<'_, Result<(), String>> {
        Box::pin(self.append_event(event))
    }
}
