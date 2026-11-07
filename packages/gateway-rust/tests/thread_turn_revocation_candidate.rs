#[path = "../src/providers/thread_turn_revocation_candidate.rs"]
mod candidate;
#[path = "../src/providers/thread_turn_schema_installer.rs"]
mod v1_installer;
use rusqlite::{Connection, OpenFlags};
use std::sync::atomic::{AtomicUsize, Ordering};

fn fixture() -> (Connection, Connection) {
    static NEXT: AtomicUsize = AtomicUsize::new(0);
    let uri = format!(
        "file:revocation{}?mode=memory&cache=shared",
        NEXT.fetch_add(1, Ordering::Relaxed)
    );
    let flags = OpenFlags::SQLITE_OPEN_READ_WRITE
        | OpenFlags::SQLITE_OPEN_CREATE
        | OpenFlags::SQLITE_OPEN_URI;
    let first = Connection::open_with_flags(&uri, flags).unwrap();
    let second = Connection::open_with_flags(&uri, flags).unwrap();
    first.execute_batch("CREATE TABLE agent_threads(id TEXT PRIMARY KEY, status TEXT); CREATE TABLE agent_thread_activities(id TEXT PRIMARY KEY, thread_id TEXT, body TEXT); CREATE TABLE rust_thread_turn_heads(thread_id TEXT PRIMARY KEY); INSERT INTO agent_threads VALUES ('a','idle'),('b','idle'); INSERT INTO agent_thread_activities VALUES ('old','a','x'); INSERT INTO rust_thread_turn_heads VALUES ('a'),('b');").unwrap();
    candidate::install(&first).unwrap();
    (first, second)
}

#[test]
fn other_connection_change_then_restore_stays_revoked_and_isolated() {
    let (first, second) = fixture();
    second.execute_batch("UPDATE agent_threads SET status='running' WHERE id='a'; UPDATE agent_threads SET status='idle' WHERE id='a';").unwrap();
    assert!(candidate::ensure_not_revoked(&first, "a").is_err());
    assert!(candidate::ensure_not_revoked(&first, "b").is_ok());
    first
        .execute("DELETE FROM rust_thread_turn_heads WHERE thread_id='a'", [])
        .unwrap();
    assert!(
        first
            .execute("INSERT INTO rust_thread_turn_heads VALUES ('a')", [])
            .is_err()
    );
    assert!(
        first
            .execute(
                "UPDATE rust_thread_turn_heads SET thread_id='a' WHERE thread_id='b'",
                []
            )
            .is_err()
    );
}

#[test]
fn rollback_does_not_revoke() {
    let (first, second) = fixture();
    second
        .execute_batch("BEGIN; UPDATE agent_threads SET status='running' WHERE id='a'; ROLLBACK;")
        .unwrap();
    assert!(candidate::ensure_not_revoked(&first, "a").is_ok());
}

#[test]
fn activity_insert_update_delete_and_replace_revoke_affected_threads() {
    for mutation in [
        "INSERT INTO agent_thread_activities VALUES ('new','a','x')",
        "UPDATE agent_thread_activities SET body='y' WHERE id='old'",
        "UPDATE agent_thread_activities SET thread_id='b' WHERE id='old'",
        "DELETE FROM agent_thread_activities WHERE id='old'",
        "INSERT OR REPLACE INTO agent_thread_activities VALUES ('old','b','y')",
    ] {
        let (first, second) = fixture();
        second.execute(mutation, []).unwrap();
        assert!(
            candidate::ensure_not_revoked(&first, "a").is_err(),
            "{mutation}"
        );
        if mutation.contains("REPLACE") || mutation.contains("thread_id='b'") {
            assert!(candidate::ensure_not_revoked(&first, "b").is_err());
        } else {
            assert!(candidate::ensure_not_revoked(&first, "b").is_ok());
        }
    }
}

#[test]
fn thread_replace_and_delete_revoke() {
    for mutation in [
        "INSERT OR REPLACE INTO agent_threads VALUES ('a','idle')",
        "DELETE FROM agent_threads WHERE id='a'",
    ] {
        let (first, second) = fixture();
        second.execute(mutation, []).unwrap();
        assert!(candidate::ensure_not_revoked(&first, "a").is_err());
        assert!(candidate::ensure_not_revoked(&first, "b").is_ok());
    }
}

#[test]
fn installation_collision_rolls_back_new_objects() {
    let db = Connection::open_in_memory().unwrap();
    db.execute_batch("CREATE TABLE agent_threads(id TEXT); CREATE TABLE agent_thread_activities(id TEXT, thread_id TEXT); CREATE TABLE rust_thread_turn_heads(thread_id TEXT); CREATE TRIGGER rust_revocation_candidate_thread_update_v1 BEFORE UPDATE ON agent_threads BEGIN SELECT 1; END;").unwrap();
    assert!(candidate::install(&db).is_err());
    let objects: i64 = db.query_row("SELECT count(*) FROM sqlite_schema WHERE name='rust_thread_revocation_candidate_v1' OR name='rust_revocation_candidate_thread_insert_v1'", [], |r| r.get(0)).unwrap();
    assert_eq!(objects, 0);
}

#[test]
fn candidate_makes_strict_v1_installer_retry_fail() {
    let db = Connection::open_in_memory().unwrap();
    db.execute_batch("CREATE TABLE agent_threads(id TEXT PRIMARY KEY, user_id TEXT, provider_id TEXT, provider_session_id TEXT); CREATE TABLE agent_thread_activities(id TEXT PRIMARY KEY, thread_id TEXT);").unwrap();
    v1_installer::install_schema(&db).unwrap();
    v1_installer::install_schema(&db).unwrap();
    candidate::install(&db).unwrap();
    assert!(v1_installer::install_schema(&db).is_err());
}
