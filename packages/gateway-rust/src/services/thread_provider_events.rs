//! Provider event to thread activity mapping from `ThreadService.logProviderEvent`.
//! Keep one instance with the owning service/session supervisor. Call `forget_thread`
//! when a thread is deleted, just as the TypeScript service does.

use crate::services::thread_activity::{append_activity, is_transient_activity_kind};
use rusqlite::Connection;
use serde_json::{Map, Value, json};
use std::collections::HashMap;
use std::sync::Arc;

#[derive(Clone, Default)]
pub struct ThreadProviderEvents {
    pending: HashMap<String, (String, Option<Value>)>,
}

/// Opaque identity of one provider subscription. It is only meaningful to the
/// single owner that created it; it is not an authentication credential.
#[derive(Clone, Debug)]
pub struct ProviderEventLease {
    thread_id: String,
    generation: Arc<()>,
    expected_session: Option<String>,
}

/// A session owner can use this fence to discard queued callbacks after a
/// subscription is replaced or revoked. All operations must run on that owner:
/// checking a lease and applying an event must not be split across tasks.
/// This type does not start/stop providers, authorize users, or unsubscribe.
#[derive(Default)]
pub struct FencedThreadProviderEvents {
    events: ThreadProviderEvents,
    generations: HashMap<String, Arc<()>>,
}

#[derive(Debug, PartialEq)]
pub enum ProviderEventDispatch {
    Stale,
    Applied(Option<Value>),
}

impl FencedThreadProviderEvents {
    /// Replaces the current subscription and discards its buffered context.
    /// An Arc identity stays unique while any old lease exists, including when
    /// the owner itself is replaced and a new owner starts with the same thread.
    pub fn begin(&mut self, thread_id: &str) -> ProviderEventLease {
        let generation = Arc::new(());
        self.events.forget_thread(thread_id);
        self.generations
            .insert(thread_id.to_owned(), generation.clone());
        ProviderEventLease {
            thread_id: thread_id.to_owned(),
            generation,
            expected_session: None,
        }
    }

    /// Bind the provider session identity to the opaque subscription lease.
    /// The caller must install/revoke this lease on its serialized session owner.
    pub fn begin_session(&mut self, thread_id: &str, session_id: &str) -> ProviderEventLease {
        let mut lease = self.begin(thread_id);
        lease.expected_session = Some(session_id.to_owned());
        lease
    }

    /// Discard pending context only for the current subscription. This is used
    /// after fencing an interrupted or finished turn, without unsubscribing the
    /// still-live provider session. A stale cleanup cannot affect a replacement.
    pub fn clear_pending(&mut self, lease: &ProviderEventLease) -> bool {
        if !self.accepts(lease) {
            return false;
        }
        self.events.forget_thread(&lease.thread_id);
        true
    }

    /// Apply an event using only the session identity captured by begin_session.
    /// The owner must apply its turn fence before calling this for turn events.
    pub fn dispatch_bound_session(
        &mut self,
        db: &Connection,
        lease: &ProviderEventLease,
        event: &Value,
    ) -> rusqlite::Result<ProviderEventDispatch> {
        match &lease.expected_session {
            Some(session) => self.dispatch_current_session(db, lease, session, event),
            None => Ok(ProviderEventDispatch::Stale),
        }
    }

    fn accepts(&self, lease: &ProviderEventLease) -> bool {
        self.generations
            .get(&lease.thread_id)
            .is_some_and(|current| Arc::ptr_eq(current, &lease.generation))
    }

    /// Revoke only the named subscription, so a late cleanup from an old
    /// provider cannot remove a newer subscription or its pending context.
    pub fn revoke(&mut self, lease: &ProviderEventLease) -> bool {
        if !self.accepts(lease) {
            return false;
        }
        self.generations.remove(&lease.thread_id);
        self.events.forget_thread(&lease.thread_id);
        true
    }

    /// Check the subscription fence, event session and the current persisted
    /// thread session before mapping. The same connection's savepoint covers the
    /// read and activity writes: SQLite prevents a concurrent writer from
    /// silently changing the session between them (in WAL mode an obsolete
    /// snapshot fails rather than upgrading). Call this synchronously on the
    /// owning session's serialized execution path; it does not replace the turn
    /// cancellation fence, streaming checkpoints, or user authorization. Requires
    /// an autocommit connection so an outer rollback cannot diverge in-memory
    /// buffered state from the committed activity rows.
    pub fn dispatch_current_session(
        &mut self,
        db: &Connection,
        lease: &ProviderEventLease,
        expected_session: &str,
        event: &Value,
    ) -> rusqlite::Result<ProviderEventDispatch> {
        if !self.accepts(lease)
            || event.get("sessionId").and_then(Value::as_str) != Some(expected_session)
        {
            return Ok(ProviderEventDispatch::Stale);
        }
        if !db.is_autocommit() {
            return Err(rusqlite::Error::InvalidQuery);
        }
        db.execute_batch("SAVEPOINT thread_provider_event")?;
        let previous = self.events.clone();
        let result = (|| {
            let matches: bool = db.query_row(
                "SELECT EXISTS(SELECT 1 FROM agent_threads WHERE id = ?1 AND provider_session_id = ?2)",
                rusqlite::params![lease.thread_id, expected_session],
                |row| row.get(0),
            )?;
            if !matches {
                return Ok(ProviderEventDispatch::Stale);
            }
            self.dispatch(db, lease, event)
        })();
        match result {
            Ok(dispatch) => {
                if let Err(error) = db.execute_batch("RELEASE thread_provider_event") {
                    self.events = previous;
                    let _ = db.execute_batch(
                        "ROLLBACK TO thread_provider_event; RELEASE thread_provider_event",
                    );
                    return Err(error);
                }
                Ok(dispatch)
            }
            Err(error) => {
                self.events = previous;
                let _ = db.execute_batch(
                    "ROLLBACK TO thread_provider_event; RELEASE thread_provider_event",
                );
                Err(error)
            }
        }
    }

    pub fn dispatch(
        &mut self,
        db: &Connection,
        lease: &ProviderEventLease,
        event: &Value,
    ) -> rusqlite::Result<ProviderEventDispatch> {
        if !self.accepts(lease) {
            return Ok(ProviderEventDispatch::Stale);
        }
        self.events
            .log_provider_event(db, &lease.thread_id, event)
            .map(ProviderEventDispatch::Applied)
    }
}

fn field<'a>(event: &'a Value, name: &str) -> &'a str {
    event.get(name).and_then(Value::as_str).unwrap_or("")
}

// Match object literals with optional undefined fields: omit absent keys, retain null.
fn payload(event: &Value, keys: &[&str]) -> Value {
    let mut result = Map::new();
    for key in keys {
        if let Some(value) = event.get(*key) {
            result.insert((*key).to_owned(), value.clone());
        }
    }
    Value::Object(result)
}

fn transient(thread_id: &str, kind: &str, summary: &str, payload: Option<&Value>) -> Value {
    let mut value = json!({"id": crate::identifiers::uuidv7(), "threadId": thread_id,
        "kind": kind, "summary": summary, "createdAt": crate::security::protocols::now_iso8601()});
    if let Some(payload) = payload {
        value["payload"] = payload.clone();
    }
    value
}

// Rust strings cannot represent the lone surrogate produced when JS slice cuts
// a surrogate pair. Use the replacement character in that exceptional case.
fn js_slice_500(content: &str) -> String {
    char::decode_utf16(content.encode_utf16().take(500))
        .map(|c| c.unwrap_or(char::REPLACEMENT_CHARACTER))
        .collect()
}

impl ThreadProviderEvents {
    pub fn forget_thread(&mut self, thread_id: &str) {
        self.pending.remove(thread_id);
    }

    fn flush(&mut self, db: &Connection, thread_id: &str) -> rusqlite::Result<()> {
        if let Some((summary, payload)) = self.pending.remove(thread_id) {
            append_activity(
                db,
                thread_id,
                "context_flow",
                &summary,
                payload.as_ref().filter(|v| !v.is_null()),
            )?;
        }
        Ok(())
    }

    /// Accepts the JSON representation of a valid TypeScript ProviderEvent.
    /// Returns the emitted activity, if any; a flushed context row precedes it
    /// in SQLite and is intentionally not returned.
    pub fn log_provider_event(
        &mut self,
        db: &Connection,
        thread_id: &str,
        event: &Value,
    ) -> rusqlite::Result<Option<Value>> {
        let typ = field(event, "type");
        let tool = field(event, "tool");
        let record = |kind: &str, summary: &str, data: Option<&Value>| {
            append_activity(db, thread_id, kind, summary, data.filter(|v| !v.is_null())).map(Some)
        };
        match typ {
            "turn.started" => {
                self.forget_thread(thread_id);
                Ok(None)
            }
            "session.started" => {
                self.forget_thread(thread_id);
                record("session", "Session started", None)
            }
            "tool.start" => record(
                "tool.start",
                &format!("Using {tool}"),
                Some(&payload(event, &["tool", "args", "callId", "parentCallId"])),
            ),
            "tool.result" => {
                let ok = event.get("ok").and_then(Value::as_bool).unwrap_or(false);
                record(
                    if ok { "tool.result" } else { "tool.error" },
                    &format!("{tool}: {}", field(event, "message")),
                    Some(&payload(
                        event,
                        &["tool", "ok", "message", "callId", "parentCallId", "data"],
                    )),
                )
            }
            "tool.approval-required" => record(
                "tool.approval",
                &format!("Approval required: {tool}"),
                Some(&payload(event, &["tool", "args", "requestId"])),
            ),
            "message" if field(event, "role") != "user" => record(
                "message",
                &js_slice_500(field(event, "content")),
                Some(&payload(event, &["role", "content"])),
            ),
            "turn.completed" | "session.completed" | "session.error" => {
                self.flush(db, thread_id)?;
                match typ {
                    "turn.completed" => record("session", "Turn completed — ready for input", None),
                    "session.completed" => record("session", "Session completed", None),
                    _ => record("error", field(event, "error"), None),
                }
            }
            "activity" => {
                let kind = field(event, "kind");
                let summary = field(event, "summary");
                let data = event.get("payload");
                if kind == "context_flow" {
                    self.pending
                        .insert(thread_id.to_owned(), (summary.to_owned(), data.cloned()));
                    Ok(Some(transient(thread_id, kind, summary, data)))
                } else if is_transient_activity_kind(kind) {
                    Ok(Some(transient(thread_id, kind, summary, data)))
                } else {
                    record(kind, summary, data)
                }
            }
            _ => Ok(None),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn db() -> Connection {
        let db = Connection::open_in_memory().unwrap();
        db.execute_batch("CREATE TABLE agent_thread_activities (id TEXT, thread_id TEXT, kind TEXT, summary TEXT, payload TEXT, created_at TEXT)").unwrap();
        db
    }
    fn rows(db: &Connection) -> Vec<(String, String, String)> {
        db.prepare("SELECT thread_id, kind, summary FROM agent_thread_activities ORDER BY rowid")
            .unwrap()
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
            .unwrap()
            .map(Result::unwrap)
            .collect()
    }
    #[test]
    fn bound_session_and_pending_cleanup_are_fenced() {
        let db = db();
        db.execute_batch("CREATE TABLE agent_threads (id TEXT PRIMARY KEY, provider_session_id TEXT); INSERT INTO agent_threads VALUES ('a','s')").unwrap();
        let mut owner = FencedThreadProviderEvents::default();
        let unbound = owner.begin("a");
        assert_eq!(
            owner
                .dispatch_bound_session(
                    &db,
                    &unbound,
                    &json!({"type":"session.started", "sessionId":"s"})
                )
                .unwrap(),
            ProviderEventDispatch::Stale
        );
        let old = owner.begin_session("a", "s");
        let current = owner.begin_session("a", "s");
        owner.dispatch_bound_session(&db, &current, &json!({"type":"activity", "kind":"context_flow", "summary":"current", "sessionId":"s"})).unwrap();
        assert!(!owner.clear_pending(&old));
        owner
            .dispatch_bound_session(
                &db,
                &current,
                &json!({"type":"turn.completed", "sessionId":"s"}),
            )
            .unwrap();
        assert_eq!(rows(&db)[0].2, "current");
        owner.dispatch_bound_session(&db, &current, &json!({"type":"activity", "kind":"context_flow", "summary":"discard", "sessionId":"s"})).unwrap();
        assert!(owner.clear_pending(&current));
        owner
            .dispatch_bound_session(
                &db,
                &current,
                &json!({"type":"turn.completed", "sessionId":"s"}),
            )
            .unwrap();
        assert_eq!(rows(&db).len(), 3);
        assert!(owner.revoke(&current));
        assert!(!owner.clear_pending(&current));
        assert_eq!(
            owner
                .dispatch_bound_session(
                    &db,
                    &current,
                    &json!({"type":"session.started", "sessionId":"s"})
                )
                .unwrap(),
            ProviderEventDispatch::Stale
        );
    }

    #[test]
    fn session_dispatch_requires_matching_event_and_current_persisted_session() {
        let db = db();
        db.execute_batch("CREATE TABLE agent_threads (id TEXT PRIMARY KEY, provider_session_id TEXT); INSERT INTO agent_threads VALUES ('a','session-a')").unwrap();
        let mut owner = FencedThreadProviderEvents::default();
        let lease = owner.begin("a");
        let event = json!({"type":"session.started", "sessionId":"session-a"});
        db.execute_batch("BEGIN").unwrap();
        assert!(
            owner
                .dispatch_current_session(&db, &lease, "session-a", &event)
                .is_err()
        );
        db.execute_batch("ROLLBACK").unwrap();
        assert_eq!(
            owner
                .dispatch_current_session(
                    &db,
                    &lease,
                    "session-a",
                    &json!({"type":"session.started", "sessionId":"foreign"})
                )
                .unwrap(),
            ProviderEventDispatch::Stale
        );
        assert_eq!(
            owner
                .dispatch_current_session(
                    &db,
                    &lease,
                    "session-a",
                    &json!({"type":"session.started"})
                )
                .unwrap(),
            ProviderEventDispatch::Stale
        );
        assert!(matches!(
            owner
                .dispatch_current_session(&db, &lease, "session-a", &event)
                .unwrap(),
            ProviderEventDispatch::Applied(Some(_))
        ));
        db.execute(
            "UPDATE agent_threads SET provider_session_id = 'replacement' WHERE id = 'a'",
            [],
        )
        .unwrap();
        assert_eq!(
            owner
                .dispatch_current_session(&db, &lease, "session-a", &event)
                .unwrap(),
            ProviderEventDispatch::Stale
        );
        db.execute("DELETE FROM agent_threads WHERE id = 'a'", [])
            .unwrap();
        assert_eq!(
            owner
                .dispatch_current_session(&db, &lease, "session-a", &event)
                .unwrap(),
            ProviderEventDispatch::Stale
        );
        assert_eq!(rows(&db).len(), 1);
    }

    #[test]
    fn session_dispatch_rolls_back_buffer_when_activity_write_fails() {
        let db = db();
        db.execute_batch("CREATE TABLE agent_threads (id TEXT PRIMARY KEY, provider_session_id TEXT); INSERT INTO agent_threads VALUES ('a','s')").unwrap();
        let mut owner = FencedThreadProviderEvents::default();
        let lease = owner.begin("a");
        owner.dispatch_current_session(&db, &lease, "s", &json!({"type":"activity", "kind":"context_flow", "summary":"retained", "sessionId":"s"})).unwrap();
        db.execute_batch("CREATE TRIGGER fail_session BEFORE INSERT ON agent_thread_activities WHEN NEW.kind = 'session' BEGIN SELECT RAISE(ABORT, 'injected'); END;").unwrap();
        assert!(
            owner
                .dispatch_current_session(
                    &db,
                    &lease,
                    "s",
                    &json!({"type":"turn.completed", "sessionId":"s"})
                )
                .is_err()
        );
        assert!(rows(&db).is_empty());
        db.execute_batch("DROP TRIGGER fail_session").unwrap();
        owner
            .dispatch_current_session(
                &db,
                &lease,
                "s",
                &json!({"type":"turn.completed", "sessionId":"s"}),
            )
            .unwrap();
        assert_eq!(rows(&db).len(), 2);
        assert_eq!(rows(&db)[0].2, "retained");
    }

    #[test]
    fn fencing_rejects_old_callbacks_and_old_cleanup_without_touching_new_context() {
        let db = db();
        let mut owner = FencedThreadProviderEvents::default();
        let old = owner.begin("a");
        let other = owner.begin("b");
        owner
            .dispatch(
                &db,
                &old,
                &json!({"type":"activity", "kind":"context_flow", "summary":"old"}),
            )
            .unwrap();
        let current = owner.begin("a");
        owner
            .dispatch(
                &db,
                &current,
                &json!({"type":"activity", "kind":"context_flow", "summary":"new"}),
            )
            .unwrap();
        assert_eq!(
            owner
                .dispatch(&db, &old, &json!({"type":"session.completed"}))
                .unwrap(),
            ProviderEventDispatch::Stale
        );
        assert!(!owner.revoke(&old));
        assert!(matches!(
            owner
                .dispatch(&db, &other, &json!({"type":"session.started"}))
                .unwrap(),
            ProviderEventDispatch::Applied(Some(_))
        ));
        owner
            .dispatch(&db, &current, &json!({"type":"session.completed"}))
            .unwrap();
        assert_eq!(
            rows(&db),
            vec![
                ("b".into(), "session".into(), "Session started".into()),
                ("a".into(), "context_flow".into(), "new".into()),
                ("a".into(), "session".into(), "Session completed".into())
            ]
        );
        assert!(owner.revoke(&current));
        assert_eq!(
            owner
                .dispatch(&db, &current, &json!({"type":"session.started"}))
                .unwrap(),
            ProviderEventDispatch::Stale
        );
    }

    #[test]
    fn fencing_revoke_discards_buffer_and_reconstructed_owner_rejects_old_lease() {
        let db = db();
        let mut owner = FencedThreadProviderEvents::default();
        let lease = owner.begin("a");
        owner
            .dispatch(
                &db,
                &lease,
                &json!({"type":"activity", "kind":"context_flow", "summary":"discard"}),
            )
            .unwrap();
        assert!(owner.revoke(&lease));
        let replacement = owner.begin("a");
        owner
            .dispatch(&db, &replacement, &json!({"type":"turn.completed"}))
            .unwrap();
        assert_eq!(
            rows(&db),
            vec![(
                "a".into(),
                "session".into(),
                "Turn completed — ready for input".into()
            )]
        );
        let mut reconstructed = FencedThreadProviderEvents::default();
        let fresh = reconstructed.begin("a");
        assert_eq!(
            reconstructed
                .dispatch(&db, &replacement, &json!({"type":"session.started"}))
                .unwrap(),
            ProviderEventDispatch::Stale
        );
        assert!(!reconstructed.revoke(&replacement));
        assert!(reconstructed.revoke(&fresh));
        assert!(owner.revoke(&replacement));
    }

    #[test]
    fn latest_context_flushes_before_completion_per_thread() {
        let db = db();
        let mut service = ThreadProviderEvents::default();
        for (id, summary) in [("a", "old"), ("b", "other"), ("a", "latest")] {
            let activity = service.log_provider_event(&db, id, &json!({"type":"activity", "kind":"context_flow", "summary":summary, "payload":{"n":1}})).unwrap().unwrap();
            assert_eq!(activity["summary"], summary);
        }
        assert!(rows(&db).is_empty());
        let completed = service
            .log_provider_event(&db, "a", &json!({"type":"turn.completed"}))
            .unwrap()
            .unwrap();
        assert_eq!(completed["summary"], "Turn completed — ready for input");
        service
            .log_provider_event(&db, "b", &json!({"type":"session.error", "error":"failed"}))
            .unwrap();
        assert_eq!(
            rows(&db),
            vec![
                ("a".into(), "context_flow".into(), "latest".into()),
                (
                    "a".into(),
                    "session".into(),
                    "Turn completed — ready for input".into()
                ),
                ("b".into(), "context_flow".into(), "other".into()),
                ("b".into(), "error".into(), "failed".into())
            ]
        );
    }
    #[test]
    fn resets_and_transient_events_do_not_persist_context() {
        let db = db();
        let mut service = ThreadProviderEvents::default();
        for reset in ["turn.started", "session.started", "delete"] {
            service
                .log_provider_event(
                    &db,
                    "t",
                    &json!({"type":"activity", "kind":"context_flow", "summary":"lost"}),
                )
                .unwrap();
            if reset == "delete" {
                service.forget_thread("t");
            } else {
                service
                    .log_provider_event(&db, "t", &json!({"type":reset}))
                    .unwrap();
            }
            service
                .log_provider_event(&db, "t", &json!({"type":"session.completed"}))
                .unwrap();
        }
        let before = rows(&db).len();
        for event in [
            json!({"type":"token"}),
            json!({"type":"tool.output"}),
            json!({"type":"message", "role":"user"}),
            json!({"type":"activity", "kind":"thinking", "summary":"x"}),
        ] {
            service.log_provider_event(&db, "t", &event).unwrap();
        }
        assert_eq!(rows(&db).len(), before);
        assert!(rows(&db).iter().all(|r| r.1 != "context_flow"));
    }
    #[test]
    fn tool_and_message_mapping_preserves_payload() {
        let db = db();
        let mut service = ThreadProviderEvents::default();
        let result = service.log_provider_event(&db, "t", &json!({"type":"tool.result", "tool":"shell", "ok":false, "message":"bad", "data":{"exit":1}})).unwrap().unwrap();
        assert_eq!(result["kind"], "tool.error");
        assert_eq!(result["payload"]["data"]["exit"], 1);
        let message = service
            .log_provider_event(
                &db,
                "t",
                &json!({"type":"message", "role":"assistant", "content":"x".repeat(600)}),
            )
            .unwrap()
            .unwrap();
        assert_eq!(message["summary"].as_str().unwrap().len(), 500);
        assert_eq!(message["payload"]["content"].as_str().unwrap().len(), 600);
    }
    #[test]
    fn failed_flush_discards_pending_and_stops_completion() {
        let db = db();
        let mut service = ThreadProviderEvents::default();
        service
            .log_provider_event(
                &db,
                "t",
                &json!({"type":"activity", "kind":"context_flow", "summary":"x"}),
            )
            .unwrap();
        db.execute_batch("DROP TABLE agent_thread_activities")
            .unwrap();
        assert!(
            service
                .log_provider_event(&db, "t", &json!({"type":"turn.completed"}))
                .is_err()
        );
        assert!(service.pending.is_empty());
    }
}
