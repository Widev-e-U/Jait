#[path = "../src/providers/thread_revocation_upgrade_candidate.rs"]
mod upgrade;
use rusqlite::Connection;
use upgrade::v1;

fn db() -> Connection {
    let db = Connection::open_in_memory().unwrap();
    db.execute_batch("CREATE TABLE agent_threads(id TEXT PRIMARY KEY, user_id TEXT, provider_id TEXT, provider_session_id TEXT); CREATE TABLE agent_thread_activities(id TEXT PRIMARY KEY, thread_id TEXT);").unwrap();
    db
}

#[test]
fn v1_upgrade_and_strict_retry_preserve_data() {
    let db = db();
    v1::install_schema(&db).unwrap();
    db.execute(
        "INSERT INTO agent_threads VALUES ('a','owner','jait','session')",
        [],
    )
    .unwrap();
    db.execute(
        "INSERT INTO rust_thread_turn_heads VALUES ('a','owner','session',0)",
        [],
    )
    .unwrap();
    upgrade::upgrade(&db).unwrap();
    upgrade::upgrade(&db).unwrap();
    let heads: i64 = db
        .query_row(
            "SELECT count(*) FROM rust_thread_turn_heads WHERE thread_id='a'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(heads, 1);
    db.execute("UPDATE agent_threads SET user_id='other' WHERE id='a'", [])
        .unwrap();
    let tombstones: i64 = db
        .query_row(
            "SELECT count(*) FROM rust_thread_revocation_candidate_v1 WHERE thread_id='a'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(tombstones, 1);
    upgrade::upgrade(&db).unwrap();
    assert!(v1::install_schema(&db).is_err());
}

#[test]
fn rejects_missing_v1_and_altered_v1_without_changes() {
    let db = db();
    assert!(upgrade::upgrade(&db).is_err());
    v1::install_schema(&db).unwrap();
    db.execute_batch("CREATE TRIGGER unexpected_head AFTER INSERT ON rust_thread_turn_heads BEGIN SELECT 1; END;").unwrap();
    assert!(upgrade::upgrade(&db).is_err());
    let objects: i64 = db.query_row("SELECT count(*) FROM sqlite_schema WHERE name GLOB 'rust_revocation_candidate_*' OR name GLOB 'rust_thread_revocation_candidate_*'", [], |r| r.get(0)).unwrap();
    assert_eq!(objects, 0);
}

#[test]
fn rejects_partial_and_tampered_upgrade() {
    let db = db();
    v1::install_schema(&db).unwrap();
    db.execute_batch(
        "CREATE TABLE rust_thread_revocation_candidate_v1(thread_id TEXT PRIMARY KEY);",
    )
    .unwrap();
    assert!(upgrade::upgrade(&db).is_err());
    db.execute_batch("DROP TABLE rust_thread_revocation_candidate_v1;")
        .unwrap();
    upgrade::upgrade(&db).unwrap();
    db.execute_batch("DROP TRIGGER rust_revocation_candidate_thread_insert_v1;")
        .unwrap();
    assert!(upgrade::upgrade(&db).is_err());
}

#[test]
fn outer_rollback_removes_upgrade_and_leaves_v1_retryable() {
    let db = db();
    v1::install_schema(&db).unwrap();
    db.execute_batch("BEGIN").unwrap();
    upgrade::upgrade(&db).unwrap();
    db.execute_batch("ROLLBACK").unwrap();
    v1::install_schema(&db).unwrap();
    let tables: i64 = db
        .query_row(
            "SELECT count(*) FROM sqlite_schema WHERE name='rust_thread_revocation_candidate_v1'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(tables, 0);
}

#[test]
fn failed_upgrade_rolls_back_partial_objects_and_preserves_v1() {
    let db = db();
    v1::install_schema(&db).unwrap();
    db.execute_batch("DROP TABLE agent_thread_activities;")
        .unwrap();
    assert!(upgrade::upgrade(&db).is_err());
    let objects: i64 = db.query_row("SELECT count(*) FROM sqlite_schema WHERE name GLOB 'rust_revocation_candidate_*' OR name GLOB 'rust_thread_revocation_candidate_*'", [], |r| r.get(0)).unwrap();
    assert_eq!(objects, 0);
    v1::install_schema(&db).unwrap();
}

fn two_connections() -> (Connection, Connection) {
    use rusqlite::OpenFlags;
    use std::sync::atomic::{AtomicUsize, Ordering};
    static NEXT: AtomicUsize = AtomicUsize::new(0);
    let uri = format!(
        "file:upgrade_contention_{}?mode=memory&cache=shared",
        NEXT.fetch_add(1, Ordering::Relaxed)
    );
    let flags = OpenFlags::SQLITE_OPEN_READ_WRITE
        | OpenFlags::SQLITE_OPEN_CREATE
        | OpenFlags::SQLITE_OPEN_URI;
    let first = Connection::open_with_flags(&uri, flags).unwrap();
    let second = Connection::open_with_flags(&uri, flags).unwrap();
    first.execute_batch("CREATE TABLE agent_threads(id TEXT PRIMARY KEY, user_id TEXT, provider_id TEXT, provider_session_id TEXT); CREATE TABLE agent_thread_activities(id TEXT PRIMARY KEY, thread_id TEXT);").unwrap();
    v1::install_schema(&first).unwrap();
    (first, second)
}

#[test]
fn locked_legacy_writer_blocks_upgrade_without_partial_schema() {
    let (first, second) = two_connections();
    second
        .execute_batch(
            "BEGIN IMMEDIATE; INSERT INTO agent_threads VALUES ('a','owner','jait',NULL);",
        )
        .unwrap();
    assert!(upgrade::upgrade(&first).is_err());
    second.execute_batch("COMMIT;").unwrap();
    v1::install_schema(&first).unwrap();
    let count: i64 = first.query_row("SELECT count(*) FROM sqlite_schema WHERE name GLOB 'rust_revocation_candidate_*' OR name GLOB 'rust_thread_revocation_candidate_*'", [], |r| r.get(0)).unwrap();
    assert_eq!(count, 0);
    upgrade::upgrade(&first).unwrap();
    upgrade::upgrade(&second).unwrap();
    let count: i64 = first
        .query_row("SELECT count(*) FROM agent_threads WHERE id='a'", [], |r| {
            r.get(0)
        })
        .unwrap();
    assert_eq!(count, 1);
}

#[test]
fn old_startup_cannot_accept_uncommitted_or_committed_upgrade() {
    let (first, second) = two_connections();
    first.execute_batch("BEGIN IMMEDIATE;").unwrap();
    upgrade::upgrade(&first).unwrap();
    assert!(v1::install_schema(&second).is_err());
    first.execute_batch("ROLLBACK;").unwrap();
    v1::install_schema(&second).unwrap();
    upgrade::upgrade(&first).unwrap();
    assert!(v1::install_schema(&second).is_err());
    upgrade::upgrade(&second).unwrap();
}
