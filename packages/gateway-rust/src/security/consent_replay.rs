//! Bounded durable consent-decision replay storage.
//!
//! This primitive does not authenticate callers or publish events. Its host must
//! check current session ownership before every append and replay, and must not
//! expose a decision until the append commits. It is not wired into the queue.
use super::consent_manager::ConsentDecision;
use rusqlite::{Connection, OptionalExtension, params};
use std::io::{self, Write};

const MAX_NAMESPACES: i64 = 256;
const RETAINED: i64 = 64;
const MAX_ID_BYTES: usize = 512;
pub(crate) const MAX_PAYLOAD_BYTES: usize = 16 * 1024;

#[derive(Debug, PartialEq, Eq)]
pub(crate) enum ReplayError {
    InvalidInput,
    Capacity,
    Gap,
    FutureCursor,
    Storage(String),
}
impl From<rusqlite::Error> for ReplayError {
    fn from(error: rusqlite::Error) -> Self {
        Self::Storage(error.to_string())
    }
}

#[derive(Debug, PartialEq, Eq)]
pub(crate) struct ReplayEntry {
    pub sequence: i64,
    pub decision: ConsentDecision,
}

/// Explicit setup on a host-supplied database; never opens or changes the default database.
pub(crate) fn initialize(db: &Connection) -> Result<(), ReplayError> {
    db.execute_batch(
        "CREATE TABLE IF NOT EXISTS rust_consent_replay_heads (
        owner_id TEXT NOT NULL, session_id TEXT NOT NULL, head INTEGER NOT NULL,
        PRIMARY KEY (owner_id, session_id)
    );
    CREATE TABLE IF NOT EXISTS rust_consent_replay_events (
        owner_id TEXT NOT NULL, session_id TEXT NOT NULL, sequence INTEGER NOT NULL,
        payload TEXT NOT NULL, PRIMARY KEY (owner_id, session_id, sequence)
    );",
    )?;
    Ok(())
}

fn validate_identity(owner: &str, session: &str) -> Result<(), ReplayError> {
    if [owner, session]
        .iter()
        .any(|s| s.trim().is_empty() || s.len() > MAX_ID_BYTES)
    {
        return Err(ReplayError::InvalidInput);
    }
    Ok(())
}

// Stop serialization as soon as the encoded representation exceeds the limit.
pub(crate) struct BoundedPayload(pub(crate) Vec<u8>);
impl Write for BoundedPayload {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        if bytes.len() > MAX_PAYLOAD_BYTES - self.0.len() {
            return Err(io::Error::other("consent replay payload limit"));
        }
        self.0.extend_from_slice(bytes);
        Ok(bytes.len())
    }
    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

/// Commits an append and retention together. Errors never publish a sequence.
pub(crate) fn append(
    db: &mut Connection,
    owner: &str,
    session: &str,
    decision: &ConsentDecision,
) -> Result<i64, ReplayError> {
    validate_identity(owner, session)?;
    if decision.request_id.trim().is_empty() || decision.request_id.len() > MAX_ID_BYTES {
        return Err(ReplayError::InvalidInput);
    }
    let mut payload = BoundedPayload(Vec::new());
    serde_json::to_writer(&mut payload, decision).map_err(|_| ReplayError::Capacity)?;
    let payload = String::from_utf8(payload.0).map_err(|_| ReplayError::InvalidInput)?;
    let tx = db.transaction()?;
    let head: Option<i64> = tx
        .query_row(
            "SELECT head FROM rust_consent_replay_heads WHERE owner_id=?1 AND session_id=?2",
            params![owner, session],
            |row| row.get(0),
        )
        .optional()?;
    let next = match head {
        Some(head) if head <= 0 => return Err(ReplayError::Gap),
        Some(head) => head.checked_add(1).ok_or(ReplayError::Capacity)?,
        None => {
            let count: i64 = tx.query_row(
                "SELECT count(*) FROM rust_consent_replay_heads",
                [],
                |row| row.get(0),
            )?;
            if count >= MAX_NAMESPACES {
                return Err(ReplayError::Capacity);
            }
            1
        }
    };
    tx.execute("INSERT INTO rust_consent_replay_heads(owner_id, session_id, head) VALUES(?1, ?2, ?3) ON CONFLICT(owner_id,session_id) DO UPDATE SET head=excluded.head", params![owner, session, next])?;
    tx.execute("INSERT INTO rust_consent_replay_events(owner_id, session_id, sequence, payload) VALUES(?1, ?2, ?3, ?4)", params![owner, session, next, payload])?;
    tx.execute("DELETE FROM rust_consent_replay_events WHERE owner_id=?1 AND session_id=?2 AND sequence<=?3", params![owner, session, next.saturating_sub(RETAINED)])?;
    tx.commit()?;
    Ok(next)
}

/// Returns strictly ordered events after `cursor`; retention loss is explicit.
/// An absent namespace has head zero. Authorization is the caller's responsibility.
pub(crate) fn replay(
    db: &mut Connection,
    owner: &str,
    session: &str,
    cursor: i64,
) -> Result<Vec<ReplayEntry>, ReplayError> {
    validate_identity(owner, session)?;
    if cursor < 0 {
        return Err(ReplayError::InvalidInput);
    }
    let tx = db.transaction()?;
    let stored_head: Option<i64> = tx
        .query_row(
            "SELECT head FROM rust_consent_replay_heads WHERE owner_id=?1 AND session_id=?2",
            params![owner, session],
            |row| row.get(0),
        )
        .optional()?;
    let head = match stored_head {
        Some(head) if head <= 0 => return Err(ReplayError::Gap),
        Some(head) => head,
        None => 0,
    };
    if cursor > head {
        return Err(ReplayError::FutureCursor);
    }
    if cursor < head.saturating_sub(RETAINED) {
        return Err(ReplayError::Gap);
    }
    let entries = {
        let mut stmt = tx.prepare("SELECT sequence,payload FROM rust_consent_replay_events WHERE owner_id=?1 AND session_id=?2 AND sequence>?3 ORDER BY sequence LIMIT ?4")?;
        let mut rows = stmt.query(params![owner, session, cursor, RETAINED])?;
        let mut result = Vec::new();
        while let Some(row) = rows.next()? {
            let sequence: i64 = row.get(0)?;
            let payload = match row.get_ref(1)? {
                rusqlite::types::ValueRef::Text(bytes) if bytes.len() <= MAX_PAYLOAD_BYTES => bytes,
                _ => return Err(ReplayError::Gap),
            };
            let expected = cursor
                .checked_add(result.len() as i64)
                .and_then(|n| n.checked_add(1));
            if Some(sequence) != expected {
                return Err(ReplayError::Gap);
            }
            let decision = serde_json::from_slice(payload).map_err(|_| ReplayError::Gap)?;
            result.push(ReplayEntry { sequence, decision });
        }
        result
    };
    if cursor.checked_add(entries.len() as i64) != Some(head) {
        return Err(ReplayError::Gap);
    }
    tx.commit()?;
    Ok(entries)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::security::consent_manager::DecisionVia;
    fn decision(id: &str) -> ConsentDecision {
        ConsentDecision {
            request_id: id.into(),
            action_id: "action".into(),
            approved: true,
            decided_at: "2026-01-01T00:00:00Z".into(),
            decided_via: DecisionVia::Click,
            reason: None,
        }
    }
    #[test]
    fn ordered_replay_is_scoped_and_retention_gaps_fail_closed() {
        let mut db = Connection::open_in_memory().unwrap();
        initialize(&db).unwrap();
        for i in 0..65 {
            assert_eq!(
                append(&mut db, "owner", "session", &decision(&i.to_string())).unwrap(),
                i + 1
            );
        }
        assert_eq!(
            replay(&mut db, "owner", "session", 0),
            Err(ReplayError::Gap)
        );
        let rows = replay(&mut db, "owner", "session", 1).unwrap();
        assert_eq!(rows.len(), 64);
        assert_eq!(rows[0].decision.request_id, "1");
        assert_eq!(rows[63].sequence, 65);
        assert!(replay(&mut db, "other", "session", 0).unwrap().is_empty());
        assert_eq!(
            replay(&mut db, "owner", "session", 66),
            Err(ReplayError::FutureCursor)
        );
        db.execute(
            "DELETE FROM rust_consent_replay_events WHERE sequence=42",
            [],
        )
        .unwrap();
        assert_eq!(
            replay(&mut db, "owner", "session", 1),
            Err(ReplayError::Gap)
        );
    }
    #[test]
    fn failed_insert_rolls_back_head_and_corrupt_head_fails_closed() {
        let mut db = Connection::open_in_memory().unwrap();
        initialize(&db).unwrap();
        db.execute_batch("CREATE TRIGGER reject_event BEFORE INSERT ON rust_consent_replay_events BEGIN SELECT RAISE(ABORT, 'rejected'); END;").unwrap();
        assert!(matches!(
            append(&mut db, "owner", "session", &decision("r")),
            Err(ReplayError::Storage(_))
        ));
        db.execute_batch("DROP TRIGGER reject_event;").unwrap();
        assert_eq!(
            append(&mut db, "owner", "session", &decision("r")).unwrap(),
            1
        );
        db.execute("UPDATE rust_consent_replay_heads SET head=-1", [])
            .unwrap();
        assert_eq!(
            replay(&mut db, "owner", "session", 0),
            Err(ReplayError::Gap)
        );
        assert_eq!(
            append(&mut db, "owner", "session", &decision("r2")),
            Err(ReplayError::Gap)
        );
    }

    #[test]
    fn zero_head_and_oversized_stored_payload_fail_closed() {
        let mut db = Connection::open_in_memory().unwrap();
        initialize(&db).unwrap();
        append(&mut db, "owner", "session", &decision("r")).unwrap();
        db.execute("UPDATE rust_consent_replay_heads SET head=0", [])
            .unwrap();
        assert_eq!(
            replay(&mut db, "owner", "session", 0),
            Err(ReplayError::Gap)
        );
        assert_eq!(
            append(&mut db, "owner", "session", &decision("r2")),
            Err(ReplayError::Gap)
        );
        db.execute("UPDATE rust_consent_replay_heads SET head=1", [])
            .unwrap();
        db.execute(
            "UPDATE rust_consent_replay_events SET payload=?1",
            ["x".repeat(MAX_PAYLOAD_BYTES + 1)],
        )
        .unwrap();
        assert_eq!(
            replay(&mut db, "owner", "session", 0),
            Err(ReplayError::Gap)
        );
    }

    #[test]
    fn namespace_capacity_rejects_new_namespaces_without_blocking_existing_ones() {
        let mut db = Connection::open_in_memory().unwrap();
        initialize(&db).unwrap();
        for i in 0..MAX_NAMESPACES {
            append(&mut db, "owner", &i.to_string(), &decision("r")).unwrap();
        }
        assert_eq!(
            append(&mut db, "owner", "overflow", &decision("r")),
            Err(ReplayError::Capacity)
        );
        assert_eq!(append(&mut db, "owner", "0", &decision("r2")).unwrap(), 2);
    }

    #[test]
    fn committed_events_survive_connection_reopen() {
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../.jait/artifacts");
        std::fs::create_dir_all(&root).unwrap();
        let name = format!(
            "consent-replay-{}-{}.sqlite",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        );
        let path = root.join(name);
        {
            let mut db = Connection::open(&path).unwrap();
            initialize(&db).unwrap();
            append(&mut db, "owner", "session", &decision("r")).unwrap();
        }
        {
            let mut db = Connection::open(&path).unwrap();
            let entries = replay(&mut db, "owner", "session", 0).unwrap();
            assert_eq!(entries.len(), 1);
            assert_eq!(entries[0].decision.request_id, "r");
            assert_eq!(
                append(&mut db, "owner", "session", &decision("r2")).unwrap(),
                2
            );
        }
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn rejected_payload_does_not_advance_cursor() {
        let mut db = Connection::open_in_memory().unwrap();
        initialize(&db).unwrap();
        let mut oversized = decision("request");
        oversized.reason = Some("x".repeat(MAX_PAYLOAD_BYTES));
        assert_eq!(
            append(&mut db, "owner", "session", &oversized),
            Err(ReplayError::Capacity)
        );
        assert_eq!(
            append(&mut db, "owner", "session", &decision("request")).unwrap(),
            1
        );
        assert_eq!(replay(&mut db, "owner", "session", 0).unwrap().len(), 1);
    }
}
