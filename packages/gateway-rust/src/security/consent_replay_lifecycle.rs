//! Experimental lifecycle allocator for consent replay; not connected to delivery.
//! Callers must enforce current ownership and serialize retirement with all
//! in-flight decisions and subscribers. Database restoration requires a new
//! externally managed store epoch before cursors can safely be used.
use super::consent_replay::ReplayError;
use rusqlite::{Connection, OptionalExtension, Transaction, TransactionBehavior, params};

const MAX_NAMESPACES: i64 = 256;
const MAX_ID_BYTES: usize = 512;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct NamespaceCursor {
    pub store_id: String,
    pub generation: i64,
    pub sequence: i64,
}

fn identity(owner: &str, session: &str) -> Result<(), ReplayError> {
    if [owner, session]
        .iter()
        .any(|s| s.trim().is_empty() || s.len() > MAX_ID_BYTES)
    {
        return Err(ReplayError::InvalidInput);
    }
    Ok(())
}

/// Creates an empty allocator bound to an independently persisted host epoch.
/// The host must rotate the epoch after restoring a database and never reuse it.
/// An epoch mismatch fails closed; recovery requires a fresh store.
pub(crate) fn create_new(db: &mut Connection, epoch: &str) -> Result<String, ReplayError> {
    if uuid::Uuid::parse_str(epoch).is_err() {
        return Err(ReplayError::InvalidInput);
    }
    let tx = db.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let existing: i64 = tx.query_row(
        "SELECT count(*) FROM sqlite_master WHERE name IN ('rust_consent_lifecycle_meta', 'rust_consent_lifecycle_namespaces')",
        [], |row| row.get(0),
    )?;
    if existing != 0 {
        return Err(ReplayError::Gap);
    }
    tx.execute_batch("CREATE TABLE rust_consent_lifecycle_meta (singleton INTEGER PRIMARY KEY CHECK(singleton=1), store_id TEXT NOT NULL, last_generation INTEGER NOT NULL);
        CREATE TABLE rust_consent_lifecycle_namespaces (owner_id TEXT NOT NULL, session_id TEXT NOT NULL, generation INTEGER NOT NULL UNIQUE, PRIMARY KEY(owner_id,session_id));")?;
    let store_id = epoch.to_owned();
    tx.execute(
        "INSERT INTO rust_consent_lifecycle_meta VALUES(1, ?1, 0)",
        [&store_id],
    )?;
    tx.commit()?;
    Ok(store_id)
}

fn metadata(tx: &Transaction<'_>, epoch: &str) -> Result<(String, i64), ReplayError> {
    if uuid::Uuid::parse_str(epoch).is_err() {
        return Err(ReplayError::InvalidInput);
    }
    let value: Option<(String, i64)> = tx
        .query_row(
            "SELECT store_id,last_generation FROM rust_consent_lifecycle_meta WHERE singleton=1",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()?;
    match value {
        Some((id, generation)) if id == epoch && generation >= 0 => {
            let invalid: i64 = tx.query_row(
                "SELECT count(*) FROM rust_consent_lifecycle_namespaces WHERE generation <= 0 OR generation > ?1",
                [generation], |row| row.get(0),
            )?;
            if invalid != 0 {
                return Err(ReplayError::Gap);
            }
            Ok((id, generation))
        }
        _ => Err(ReplayError::Gap),
    }
}

/// Creates a namespace and allocates its generation atomically. The host is
/// responsible for authorizing this operation and synchronizing session state.
pub(crate) fn create_namespace(
    db: &mut Connection,
    epoch: &str,
    owner: &str,
    session: &str,
) -> Result<NamespaceCursor, ReplayError> {
    identity(owner, session)?;
    let tx = db.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let (store_id, last) = metadata(&tx, epoch)?;
    let count: i64 = tx.query_row(
        "SELECT count(*) FROM rust_consent_lifecycle_namespaces",
        [],
        |row| row.get(0),
    )?;
    if count >= MAX_NAMESPACES {
        return Err(ReplayError::Capacity);
    }
    let generation = last.checked_add(1).ok_or(ReplayError::Capacity)?;
    tx.execute("INSERT INTO rust_consent_lifecycle_namespaces(owner_id,session_id,generation) VALUES(?1,?2,?3)", params![owner, session, generation])?;
    tx.execute(
        "UPDATE rust_consent_lifecycle_meta SET last_generation=?1 WHERE singleton=1",
        [generation],
    )?;
    tx.commit()?;
    Ok(NamespaceCursor {
        store_id,
        generation,
        sequence: 0,
    })
}

/// Checks an expected cursor before retirement. This does not delete replay
/// events; integrating both deletions into one transaction is required before use.
pub(crate) fn retire_namespace(
    db: &mut Connection,
    epoch: &str,
    owner: &str,
    session: &str,
    cursor: &NamespaceCursor,
) -> Result<(), ReplayError> {
    identity(owner, session)?;
    if cursor.generation <= 0 || cursor.sequence < 0 {
        return Err(ReplayError::InvalidInput);
    }
    let tx = db.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let (store_id, last) = metadata(&tx, epoch)?;
    let generation: Option<i64> = tx.query_row("SELECT generation FROM rust_consent_lifecycle_namespaces WHERE owner_id=?1 AND session_id=?2", params![owner, session], |row| row.get(0)).optional()?;
    if cursor.store_id != store_id
        || generation != Some(cursor.generation)
        || cursor.generation > last
    {
        return Err(ReplayError::Gap);
    }
    tx.execute("DELETE FROM rust_consent_lifecycle_namespaces WHERE owner_id=?1 AND session_id=?2 AND generation=?3", params![owner, session, cursor.generation])?;
    tx.commit()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    const EPOCH: &str = "b97c0cc6-6177-4f3e-b752-18886080b2b0";
    const ROTATED_EPOCH: &str = "a3ff1a06-5d5d-4e3a-9030-bbc31c03c7b0";
    #[test]
    fn recreation_invalidates_stale_retirement() {
        let mut db = Connection::open_in_memory().unwrap();
        let store = create_new(&mut db, EPOCH).unwrap();
        let old = create_namespace(&mut db, EPOCH, "owner", "session").unwrap();
        retire_namespace(&mut db, EPOCH, "owner", "session", &old).unwrap();
        let new = create_namespace(&mut db, EPOCH, "owner", "session").unwrap();
        assert_eq!(new.store_id, store);
        assert!(new.generation > old.generation);
        assert_eq!(
            retire_namespace(&mut db, EPOCH, "owner", "session", &old),
            Err(ReplayError::Gap)
        );
        retire_namespace(&mut db, EPOCH, "owner", "session", &new).unwrap();
        assert_eq!(create_new(&mut db, EPOCH), Err(ReplayError::Gap));
    }
    #[test]
    fn reopened_database_and_concurrent_connections_allocate_distinct_generations() {
        use std::sync::{Arc, Barrier};
        use std::time::Duration;
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../.jait/artifacts");
        std::fs::create_dir_all(&root).unwrap();
        let path = root.join(format!("consent-lifecycle-{}.sqlite", uuid::Uuid::new_v4()));
        let initial;
        {
            let mut db = Connection::open(&path).unwrap();
            create_new(&mut db, EPOCH).unwrap();
            initial = create_namespace(&mut db, EPOCH, "owner", "first").unwrap();
        }
        let barrier = Arc::new(Barrier::new(3));
        let mut workers = Vec::new();
        for session in ["second", "third"] {
            let path = path.clone();
            let barrier = barrier.clone();
            workers.push(std::thread::spawn(move || {
                let mut db = Connection::open(path).unwrap();
                db.busy_timeout(Duration::from_secs(5)).unwrap();
                barrier.wait();
                create_namespace(&mut db, EPOCH, "owner", session).unwrap()
            }));
        }
        barrier.wait();
        let a = workers.remove(0).join().unwrap();
        let b = workers.remove(0).join().unwrap();
        assert_eq!(a.store_id, initial.store_id);
        assert_eq!(b.store_id, initial.store_id);
        let mut generations = [a.generation, b.generation];
        generations.sort();
        assert_eq!(generations, [2, 3]);
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn allocator_rejects_counter_behind_live_generation() {
        let mut db = Connection::open_in_memory().unwrap();
        create_new(&mut db, EPOCH).unwrap();
        let cursor = create_namespace(&mut db, EPOCH, "owner", "session").unwrap();
        db.execute(
            "UPDATE rust_consent_lifecycle_meta SET last_generation=0",
            [],
        )
        .unwrap();
        assert_eq!(
            create_namespace(&mut db, EPOCH, "owner", "other"),
            Err(ReplayError::Gap)
        );
        assert_eq!(
            retire_namespace(&mut db, EPOCH, "owner", "session", &cursor),
            Err(ReplayError::Gap)
        );
    }

    #[test]
    fn failed_creation_does_not_consume_generation_and_missing_metadata_fails_closed() {
        let mut db = Connection::open_in_memory().unwrap();
        create_new(&mut db, EPOCH).unwrap();
        db.execute_batch("CREATE TRIGGER reject_namespace BEFORE INSERT ON rust_consent_lifecycle_namespaces BEGIN SELECT RAISE(ABORT, 'rejected'); END;").unwrap();
        assert!(matches!(
            create_namespace(&mut db, EPOCH, "owner", "session"),
            Err(ReplayError::Storage(_))
        ));
        db.execute_batch("DROP TRIGGER reject_namespace;").unwrap();
        assert_eq!(
            create_namespace(&mut db, EPOCH, "owner", "session")
                .unwrap()
                .generation,
            1
        );
        db.execute("DELETE FROM rust_consent_lifecycle_meta", [])
            .unwrap();
        assert_eq!(
            create_namespace(&mut db, EPOCH, "owner", "other"),
            Err(ReplayError::Gap)
        );
        assert_eq!(create_new(&mut db, EPOCH), Err(ReplayError::Gap));
    }
    #[test]
    fn rotated_external_epoch_rejects_restored_store_and_old_cursor() {
        let mut db = Connection::open_in_memory().unwrap();
        create_new(&mut db, EPOCH).unwrap();
        let old = create_namespace(&mut db, EPOCH, "owner", "session").unwrap();
        assert_eq!(
            create_namespace(&mut db, ROTATED_EPOCH, "owner", "other"),
            Err(ReplayError::Gap)
        );
        assert_eq!(
            retire_namespace(&mut db, ROTATED_EPOCH, "owner", "session", &old),
            Err(ReplayError::Gap)
        );
        assert_eq!(
            create_namespace(&mut db, "invalid", "owner", "other"),
            Err(ReplayError::InvalidInput)
        );
        retire_namespace(&mut db, EPOCH, "owner", "session", &old).unwrap();
    }
}
