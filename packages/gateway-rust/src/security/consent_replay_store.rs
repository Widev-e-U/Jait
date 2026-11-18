//! Experimental unified replay store. The host must authorize each operation,
//! serialize session lifecycle with decisions and subscribers, persist its epoch
//! outside this database, and rotate that epoch on restore. No delivery is wired.
use super::consent_manager::ConsentDecision;
use super::consent_replay::{BoundedPayload, MAX_PAYLOAD_BYTES, ReplayEntry, ReplayError};
use super::consent_replay_lifecycle::NamespaceCursor;
use rusqlite::{Connection, OptionalExtension, Transaction, TransactionBehavior, params};

const RETAINED: i64 = 64;
const MAX_NAMESPACES: i64 = 256;
const MAX_ID_BYTES: usize = 512;

fn identity(owner: &str, session: &str) -> Result<(), ReplayError> {
    if [owner, session]
        .iter()
        .any(|v| v.trim().is_empty() || v.len() > MAX_ID_BYTES)
    {
        return Err(ReplayError::InvalidInput);
    }
    Ok(())
}

/// Initializes only a fresh store. Existing experimental schemas require an
/// explicit migration or disposal, never implicit reuse of their cursors.
pub(crate) fn create_new(db: &mut Connection, epoch: &str) -> Result<(), ReplayError> {
    if uuid::Uuid::parse_str(epoch).is_err() {
        return Err(ReplayError::InvalidInput);
    }
    let tx = db.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let count: i64 = tx.query_row("SELECT count(*) FROM sqlite_master WHERE name IN ('rust_consent_lifecycle_meta','rust_consent_lifecycle_namespaces','rust_consent_replay_heads','rust_consent_replay_events','rust_consent_v2_meta','rust_consent_v2_namespaces','rust_consent_v2_events')", [], |r| r.get(0))?;
    if count != 0 {
        return Err(ReplayError::Gap);
    }
    tx.execute_batch("CREATE TABLE rust_consent_v2_meta (singleton INTEGER PRIMARY KEY CHECK(singleton=1), epoch TEXT NOT NULL, last_generation INTEGER NOT NULL);
      CREATE TABLE rust_consent_v2_namespaces (owner_id TEXT NOT NULL, session_id TEXT NOT NULL, generation INTEGER NOT NULL UNIQUE, head INTEGER NOT NULL, PRIMARY KEY(owner_id,session_id));
      CREATE TABLE rust_consent_v2_events (generation INTEGER NOT NULL, sequence INTEGER NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(generation,sequence));")?;
    tx.execute("INSERT INTO rust_consent_v2_meta VALUES(1,?1,0)", [epoch])?;
    tx.commit()?;
    Ok(())
}

fn metadata(tx: &Transaction<'_>, epoch: &str) -> Result<i64, ReplayError> {
    if uuid::Uuid::parse_str(epoch).is_err() {
        return Err(ReplayError::InvalidInput);
    }
    let row: Option<(String, i64)> = tx
        .query_row(
            "SELECT epoch,last_generation FROM rust_consent_v2_meta WHERE singleton=1",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()?;
    let last = match row {
        Some((stored, last)) if stored == epoch && last >= 0 => last,
        _ => return Err(ReplayError::Gap),
    };
    let invalid: i64 = tx.query_row("SELECT count(*) FROM rust_consent_v2_namespaces WHERE generation<=0 OR generation>?1 OR head<0", [last], |r| r.get(0))?;
    if invalid != 0 {
        return Err(ReplayError::Gap);
    }
    Ok(last)
}

fn head(
    tx: &Transaction<'_>,
    epoch: &str,
    owner: &str,
    session: &str,
    cursor: &NamespaceCursor,
) -> Result<i64, ReplayError> {
    identity(owner, session)?;
    if cursor.sequence < 0 || cursor.generation <= 0 {
        return Err(ReplayError::InvalidInput);
    }
    let last = metadata(tx, epoch)?;
    let row: Option<(i64,i64)> = tx.query_row("SELECT generation,head FROM rust_consent_v2_namespaces WHERE owner_id=?1 AND session_id=?2", params![owner,session], |r| Ok((r.get(0)?,r.get(1)?))).optional()?;
    match row {
        Some((generation, head))
            if cursor.store_id == epoch
                && generation == cursor.generation
                && generation <= last
                && head >= 0 =>
        {
            // A missing or extra event must not be hidden by a later append or
            // retirement. The primary key makes count and bounds sufficient to
            // establish a contiguous retained sequence.
            let (count, first, last_event): (i64, Option<i64>, Option<i64>) = tx.query_row(
                "SELECT count(*), min(sequence), max(sequence) FROM rust_consent_v2_events WHERE generation=?1",
                [generation],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )?;
            let expected = head.min(RETAINED);
            let bounds = if expected == 0 {
                (None, None)
            } else {
                (Some(head - expected + 1), Some(head))
            };
            if count != expected || (first, last_event) != bounds {
                return Err(ReplayError::Gap);
            }
            // Do not publish a new event or erase a namespace whose retained
            // history cannot be decoded. This is bounded by RETAINED and the
            // per-payload limit, and does not authenticate valid JSON contents.
            let mut stmt =
                tx.prepare("SELECT payload FROM rust_consent_v2_events WHERE generation=?1")?;
            let mut rows = stmt.query([generation])?;
            while let Some(row) = rows.next()? {
                let bytes = match row.get_ref(0)? {
                    rusqlite::types::ValueRef::Text(bytes) if bytes.len() <= MAX_PAYLOAD_BYTES => {
                        bytes
                    }
                    _ => return Err(ReplayError::Gap),
                };
                let _: ConsentDecision =
                    serde_json::from_slice(bytes).map_err(|_| ReplayError::Gap)?;
            }
            Ok(head)
        }
        _ => Err(ReplayError::Gap),
    }
}

pub(crate) fn create_namespace(
    db: &mut Connection,
    epoch: &str,
    owner: &str,
    session: &str,
) -> Result<NamespaceCursor, ReplayError> {
    identity(owner, session)?;
    let tx = db.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let last = metadata(&tx, epoch)?;
    let count: i64 = tx.query_row("SELECT count(*) FROM rust_consent_v2_namespaces", [], |r| {
        r.get(0)
    })?;
    if count >= MAX_NAMESPACES {
        return Err(ReplayError::Capacity);
    }
    let generation = last.checked_add(1).ok_or(ReplayError::Capacity)?;
    tx.execute(
        "INSERT INTO rust_consent_v2_namespaces VALUES(?1,?2,?3,0)",
        params![owner, session, generation],
    )?;
    tx.execute(
        "UPDATE rust_consent_v2_meta SET last_generation=?1 WHERE singleton=1",
        [generation],
    )?;
    tx.commit()?;
    Ok(NamespaceCursor {
        store_id: epoch.into(),
        generation,
        sequence: 0,
    })
}

/// Appends only to the exact expected head and returns the committed cursor.
pub(crate) fn append(
    db: &mut Connection,
    epoch: &str,
    owner: &str,
    session: &str,
    cursor: &NamespaceCursor,
    decision: &ConsentDecision,
) -> Result<NamespaceCursor, ReplayError> {
    if decision.request_id.trim().is_empty() || decision.request_id.len() > MAX_ID_BYTES {
        return Err(ReplayError::InvalidInput);
    }
    let mut payload = BoundedPayload(Vec::new());
    serde_json::to_writer(&mut payload, decision).map_err(|_| ReplayError::Capacity)?;
    let payload = String::from_utf8(payload.0).map_err(|_| ReplayError::InvalidInput)?;
    let tx = db.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let current = head(&tx, epoch, owner, session, cursor)?;
    if cursor.sequence != current {
        return Err(if cursor.sequence > current {
            ReplayError::FutureCursor
        } else {
            ReplayError::Gap
        });
    }
    let next = current.checked_add(1).ok_or(ReplayError::Capacity)?;
    tx.execute(
        "INSERT INTO rust_consent_v2_events VALUES(?1,?2,?3)",
        params![cursor.generation, next, payload],
    )?;
    tx.execute("UPDATE rust_consent_v2_namespaces SET head=?1 WHERE owner_id=?2 AND session_id=?3 AND generation=?4", params![next,owner,session,cursor.generation])?;
    tx.execute(
        "DELETE FROM rust_consent_v2_events WHERE generation=?1 AND sequence<=?2",
        params![cursor.generation, next.saturating_sub(RETAINED)],
    )?;
    tx.commit()?;
    Ok(NamespaceCursor {
        sequence: next,
        ..cursor.clone()
    })
}

pub(crate) fn replay(
    db: &mut Connection,
    epoch: &str,
    owner: &str,
    session: &str,
    cursor: &NamespaceCursor,
) -> Result<Vec<ReplayEntry>, ReplayError> {
    let tx = db.transaction()?;
    let current = head(&tx, epoch, owner, session, cursor)?;
    if cursor.sequence > current {
        return Err(ReplayError::FutureCursor);
    }
    if cursor.sequence < current.saturating_sub(RETAINED) {
        return Err(ReplayError::Gap);
    }
    let entries = {
        let mut stmt = tx.prepare("SELECT sequence,payload FROM rust_consent_v2_events WHERE generation=?1 AND sequence>?2 ORDER BY sequence LIMIT ?3")?;
        let mut rows = stmt.query(params![cursor.generation, cursor.sequence, RETAINED])?;
        let mut result = Vec::new();
        while let Some(row) = rows.next()? {
            let sequence: i64 = row.get(0)?;
            if cursor
                .sequence
                .checked_add(result.len() as i64)
                .and_then(|n| n.checked_add(1))
                != Some(sequence)
            {
                return Err(ReplayError::Gap);
            }
            let bytes = match row.get_ref(1)? {
                rusqlite::types::ValueRef::Text(bytes) if bytes.len() <= MAX_PAYLOAD_BYTES => bytes,
                _ => return Err(ReplayError::Gap),
            };
            let decision = serde_json::from_slice(bytes).map_err(|_| ReplayError::Gap)?;
            result.push(ReplayEntry { sequence, decision });
        }
        result
    };
    if cursor.sequence.checked_add(entries.len() as i64) != Some(current) {
        return Err(ReplayError::Gap);
    }
    tx.commit()?;
    Ok(entries)
}

/// Deletes the matching generation and its events atomically; host serialization
/// must prevent in-flight effects or subscribers from outliving retirement.
pub(crate) fn retire(
    db: &mut Connection,
    epoch: &str,
    owner: &str,
    session: &str,
    cursor: &NamespaceCursor,
) -> Result<(), ReplayError> {
    let tx = db.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let current = head(&tx, epoch, owner, session, cursor)?;
    if cursor.sequence != current {
        return Err(ReplayError::Gap);
    }
    tx.execute(
        "DELETE FROM rust_consent_v2_events WHERE generation=?1",
        [cursor.generation],
    )?;
    tx.execute("DELETE FROM rust_consent_v2_namespaces WHERE owner_id=?1 AND session_id=?2 AND generation=?3", params![owner,session,cursor.generation])?;
    tx.commit()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::security::consent_manager::DecisionVia;
    const EPOCH: &str = "b97c0cc6-6177-4f3e-b752-18886080b2b0";
    const OTHER: &str = "a3ff1a06-5d5d-4e3a-9030-bbc31c03c7b0";
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
    fn retirement_recreation_and_restore_reject_stale_cursors() {
        let mut db = Connection::open_in_memory().unwrap();
        create_new(&mut db, EPOCH).unwrap();
        let first = create_namespace(&mut db, EPOCH, "owner", "session").unwrap();
        let end = append(&mut db, EPOCH, "owner", "session", &first, &decision("one")).unwrap();
        assert_eq!(
            replay(&mut db, EPOCH, "owner", "session", &first).unwrap()[0]
                .decision
                .request_id,
            "one"
        );
        assert_eq!(
            retire(&mut db, EPOCH, "owner", "session", &first),
            Err(ReplayError::Gap)
        );
        assert_eq!(
            replay(&mut db, OTHER, "owner", "session", &first),
            Err(ReplayError::Gap)
        );
        retire(&mut db, EPOCH, "owner", "session", &end).unwrap();
        let next = create_namespace(&mut db, EPOCH, "owner", "session").unwrap();
        assert!(next.generation > first.generation);
        assert_eq!(
            replay(&mut db, EPOCH, "owner", "session", &first),
            Err(ReplayError::Gap)
        );
        assert_eq!(
            append(&mut db, EPOCH, "owner", "session", &end, &decision("stale")),
            Err(ReplayError::Gap)
        );
        assert!(
            replay(&mut db, EPOCH, "owner", "session", &next)
                .unwrap()
                .is_empty()
        );
        let count: i64 = db
            .query_row("SELECT count(*) FROM rust_consent_v2_events", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(count, 0);
    }
    #[test]
    fn append_and_retirement_failures_roll_back_all_changes() {
        let mut db = Connection::open_in_memory().unwrap();
        create_new(&mut db, EPOCH).unwrap();
        let start = create_namespace(&mut db, EPOCH, "owner", "session").unwrap();
        db.execute_batch("CREATE TRIGGER reject_insert BEFORE INSERT ON rust_consent_v2_events BEGIN SELECT RAISE(ABORT, 'reject'); END;").unwrap();
        assert!(matches!(
            append(&mut db, EPOCH, "owner", "session", &start, &decision("x")),
            Err(ReplayError::Storage(_))
        ));
        db.execute_batch("DROP TRIGGER reject_insert;").unwrap();
        let end = append(&mut db, EPOCH, "owner", "session", &start, &decision("x")).unwrap();
        assert_eq!(end.sequence, 1);
        db.execute_batch("CREATE TRIGGER reject_retire BEFORE DELETE ON rust_consent_v2_namespaces BEGIN SELECT RAISE(ABORT, 'reject'); END;").unwrap();
        assert!(matches!(
            retire(&mut db, EPOCH, "owner", "session", &end),
            Err(ReplayError::Storage(_))
        ));
        assert_eq!(
            replay(&mut db, EPOCH, "owner", "session", &start)
                .unwrap()
                .len(),
            1
        );
        db.execute_batch("DROP TRIGGER reject_retire;").unwrap();
        retire(&mut db, EPOCH, "owner", "session", &end).unwrap();
    }
    #[test]
    fn ordering_retention_and_legacy_schema_fail_closed() {
        let mut db = Connection::open_in_memory().unwrap();
        super::super::consent_replay::initialize(&db).unwrap();
        assert_eq!(create_new(&mut db, EPOCH), Err(ReplayError::Gap));
        let mut db = Connection::open_in_memory().unwrap();
        create_new(&mut db, EPOCH).unwrap();
        let start = create_namespace(&mut db, EPOCH, "owner", "session").unwrap();
        let mut cursor = start.clone();
        for i in 0..65 {
            cursor = append(
                &mut db,
                EPOCH,
                "owner",
                "session",
                &cursor,
                &decision(&i.to_string()),
            )
            .unwrap();
        }
        assert_eq!(
            replay(&mut db, EPOCH, "owner", "session", &start),
            Err(ReplayError::Gap)
        );
        let after_one = NamespaceCursor {
            sequence: 1,
            ..start.clone()
        };
        let rows = replay(&mut db, EPOCH, "owner", "session", &after_one).unwrap();
        assert_eq!(rows.len(), 64);
        assert_eq!(rows[0].sequence, 2);
        assert_eq!(rows[63].sequence, 65);
        assert_eq!(
            append(
                &mut db,
                EPOCH,
                "owner",
                "session",
                &after_one,
                &decision("stale")
            ),
            Err(ReplayError::Gap)
        );
        db.execute(
            "DELETE FROM rust_consent_v2_events WHERE generation=?1 AND sequence=42",
            [cursor.generation],
        )
        .unwrap();
        assert_eq!(
            replay(&mut db, EPOCH, "owner", "session", &after_one),
            Err(ReplayError::Gap)
        );
    }
    #[test]
    fn competing_writers_cannot_append_at_same_head() {
        use std::sync::{Arc, Barrier};
        use std::time::Duration;
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../.jait/artifacts");
        std::fs::create_dir_all(&root).unwrap();
        let path = root.join(format!("replay-race-{}.sqlite", uuid::Uuid::new_v4()));
        let start = {
            let mut db = Connection::open(&path).unwrap();
            create_new(&mut db, EPOCH).unwrap();
            create_namespace(&mut db, EPOCH, "owner", "session").unwrap()
        };
        let barrier = Arc::new(Barrier::new(3));
        let workers: Vec<_> = (0..2)
            .map(|i| {
                let path = path.clone();
                let cursor = start.clone();
                let barrier = barrier.clone();
                std::thread::spawn(move || {
                    let mut db = Connection::open(path).unwrap();
                    db.busy_timeout(Duration::from_secs(5)).unwrap();
                    barrier.wait();
                    append(
                        &mut db,
                        EPOCH,
                        "owner",
                        "session",
                        &cursor,
                        &decision(&i.to_string()),
                    )
                })
            })
            .collect();
        barrier.wait();
        let results: Vec<_> = workers.into_iter().map(|w| w.join().unwrap()).collect();
        assert_eq!(results.iter().filter(|r| r.is_ok()).count(), 1);
        assert_eq!(
            results
                .iter()
                .filter(|r| matches!(r, Err(ReplayError::Gap)))
                .count(),
            1
        );
        let mut db = Connection::open(&path).unwrap();
        assert_eq!(
            replay(&mut db, EPOCH, "owner", "session", &start)
                .unwrap()
                .len(),
            1
        );
        drop(db);
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn restored_file_rejects_rotated_host_epoch() {
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../.jait/artifacts");
        std::fs::create_dir_all(&root).unwrap();
        let path = root.join(format!("replay-restore-{}.sqlite", uuid::Uuid::new_v4()));
        let snapshot = root.join(format!("replay-snapshot-{}.sqlite", uuid::Uuid::new_v4()));
        let start = {
            let mut db = Connection::open(&path).unwrap();
            create_new(&mut db, EPOCH).unwrap();
            let start = create_namespace(&mut db, EPOCH, "owner", "session").unwrap();
            append(
                &mut db,
                EPOCH,
                "owner",
                "session",
                &start,
                &decision("before"),
            )
            .unwrap();
            start
        };
        std::fs::copy(&path, &snapshot).unwrap();
        {
            let mut db = Connection::open(&path).unwrap();
            let end = NamespaceCursor {
                sequence: 1,
                ..start.clone()
            };
            append(&mut db, EPOCH, "owner", "session", &end, &decision("after")).unwrap();
        }
        std::fs::copy(&snapshot, &path).unwrap();
        let mut restored = Connection::open(&path).unwrap();
        assert_eq!(
            replay(&mut restored, OTHER, "owner", "session", &start),
            Err(ReplayError::Gap)
        );
        assert_eq!(
            append(
                &mut restored,
                OTHER,
                "owner",
                "session",
                &start,
                &decision("stale")
            ),
            Err(ReplayError::Gap)
        );
        assert_eq!(
            replay(&mut restored, EPOCH, "owner", "session", &start)
                .unwrap()
                .len(),
            1
        );
        drop(restored);
        std::fs::remove_file(path).unwrap();
        std::fs::remove_file(snapshot).unwrap();
    }
    #[test]
    fn corrupted_retained_history_blocks_append_and_retirement() {
        let mut db = Connection::open_in_memory().unwrap();
        create_new(&mut db, EPOCH).unwrap();
        let start = create_namespace(&mut db, EPOCH, "owner", "session").unwrap();
        let one = append(&mut db, EPOCH, "owner", "session", &start, &decision("one")).unwrap();
        let end = append(&mut db, EPOCH, "owner", "session", &one, &decision("two")).unwrap();
        db.execute(
            "DELETE FROM rust_consent_v2_events WHERE generation=?1 AND sequence=1",
            [end.generation],
        )
        .unwrap();
        assert_eq!(
            append(&mut db, EPOCH, "owner", "session", &end, &decision("three")),
            Err(ReplayError::Gap)
        );
        assert_eq!(
            retire(&mut db, EPOCH, "owner", "session", &end),
            Err(ReplayError::Gap)
        );
        let head: i64 = db
            .query_row("SELECT head FROM rust_consent_v2_namespaces", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(head, 2);
        db.execute("DELETE FROM rust_consent_v2_events", [])
            .unwrap();
        assert_eq!(
            replay(&mut db, EPOCH, "owner", "session", &end),
            Err(ReplayError::Gap)
        );
    }
    #[test]
    fn invalid_retained_payload_blocks_mutations() {
        let mut db = Connection::open_in_memory().unwrap();
        create_new(&mut db, EPOCH).unwrap();
        let start = create_namespace(&mut db, EPOCH, "owner", "session").unwrap();
        let end = append(&mut db, EPOCH, "owner", "session", &start, &decision("one")).unwrap();
        for bad in ["{bad".to_owned(), "x".repeat(MAX_PAYLOAD_BYTES + 1)] {
            db.execute(
                "UPDATE rust_consent_v2_events SET payload=?1 WHERE generation=?2 AND sequence=1",
                params![bad, end.generation],
            )
            .unwrap();
            assert_eq!(
                append(&mut db, EPOCH, "owner", "session", &end, &decision("two")),
                Err(ReplayError::Gap)
            );
            assert_eq!(
                retire(&mut db, EPOCH, "owner", "session", &end),
                Err(ReplayError::Gap)
            );
            assert_eq!(
                replay(&mut db, EPOCH, "owner", "session", &end),
                Err(ReplayError::Gap)
            );
        }
        let head: i64 = db
            .query_row("SELECT head FROM rust_consent_v2_namespaces", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(head, 1);
    }
}
