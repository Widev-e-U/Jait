#[path = "../src/providers/atomic_thread_admission.rs"]
mod admission;
use admission::{FreshThread, create_idle, install_schema, start};
use rusqlite::{Connection, OpenFlags};
use std::{
    sync::{Arc, Barrier},
    thread,
    time::Duration,
};

fn schema(db: &Connection) {
    db.execute_batch("PRAGMA foreign_keys=ON;
        CREATE TABLE agent_threads (id TEXT PRIMARY KEY, user_id TEXT, session_id TEXT, title TEXT NOT NULL, provider_id TEXT NOT NULL, status TEXT NOT NULL, provider_session_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
        CREATE TABLE agent_thread_activities (id TEXT PRIMARY KEY, thread_id TEXT NOT NULL);
        CREATE TABLE rust_thread_turn_heads (thread_id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, provider_session_id TEXT NOT NULL, event_count INTEGER NOT NULL);
        CREATE TABLE rust_thread_turn_events (thread_id TEXT NOT NULL, sequence INTEGER NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(thread_id,sequence));").unwrap();
    install_schema(db).unwrap();
}
fn new_row<'a>(id: &'a str) -> FreshThread<'a> {
    FreshThread {
        id,
        owner: "owner",
        parent_session: Some("parent"),
        title: "title",
        timestamp: "now",
    }
}
fn count(db: &Connection, sql: &str) -> i64 {
    db.query_row(sql, [], |r| r.get(0)).unwrap()
}
fn idle(db: &Connection) {
    assert_eq!(
        count(
            db,
            "SELECT count(*) FROM agent_threads WHERE id='t' AND status='idle' AND provider_session_id IS NULL"
        ),
        1
    );
    assert_eq!(
        count(
            db,
            "SELECT count(*) FROM rust_thread_fresh_markers WHERE thread_id='t' AND state='fresh'"
        ),
        1
    );
    assert_eq!(count(db, "SELECT count(*) FROM rust_thread_turn_heads"), 0);
}

#[test]
fn idle_then_start_requires_exact_identity_and_is_one_shot() {
    let mut db = Connection::open_in_memory().unwrap();
    schema(&db);
    create_idle(&mut db, &new_row("t")).unwrap();
    assert!(start(&mut db, "t", "other", Some("parent"), "p", "later").is_err());
    assert!(start(&mut db, "t", "owner", None, "p", "later").is_err());
    idle(&db);
    start(&mut db, "t", "owner", Some("parent"), "p", "later").unwrap();
    assert_eq!(
        count(
            &db,
            "SELECT count(*) FROM agent_threads t JOIN rust_thread_turn_heads h ON t.id=h.thread_id WHERE t.status='running' AND t.provider_session_id='p' AND h.owner_id='owner' AND h.provider_session_id='p' AND h.event_count=0"
        ),
        1
    );
    assert!(start(&mut db, "t", "owner", Some("parent"), "other", "later").is_err());
}
#[test]
fn legacy_and_mutated_rows_fail_closed() {
    let mut db = Connection::open_in_memory().unwrap();
    schema(&db);
    db.execute("INSERT INTO agent_threads VALUES ('legacy','owner','parent','x','jait','idle',NULL,'n','n')", []).unwrap();
    assert!(start(&mut db, "legacy", "owner", Some("parent"), "p", "n").is_err());
    create_idle(&mut db, &new_row("t")).unwrap();
    db.execute_batch("UPDATE agent_threads SET provider_id='other' WHERE id='t'; UPDATE agent_threads SET provider_id='jait' WHERE id='t';").unwrap();
    assert!(start(&mut db, "t", "owner", Some("parent"), "p", "n").is_err());
    create_idle(&mut db, &new_row("activity")).unwrap();
    db.execute(
        "INSERT INTO agent_thread_activities VALUES ('a','activity')",
        [],
    )
    .unwrap();
    assert!(start(&mut db, "activity", "owner", Some("parent"), "p", "n").is_err());
    assert_eq!(count(&db, "SELECT count(*) FROM rust_thread_turn_heads"), 0);
}
#[test]
fn failures_roll_back_creation_binding_head_and_consumption() {
    let mut db = Connection::open_in_memory().unwrap();
    schema(&db);
    db.execute_batch("CREATE TRIGGER fail_marker BEFORE INSERT ON rust_thread_fresh_markers BEGIN SELECT RAISE(ABORT,'marker'); END;").unwrap();
    assert!(create_idle(&mut db, &new_row("t")).is_err());
    assert_eq!(count(&db, "SELECT count(*) FROM agent_threads"), 0);
    db.execute_batch("DROP TRIGGER fail_marker;").unwrap();
    create_idle(&mut db, &new_row("t")).unwrap();
    for (name, table, op) in [
        ("binding", "agent_threads", "UPDATE"),
        ("head", "rust_thread_turn_heads", "INSERT"),
        ("consume", "rust_thread_fresh_markers", "UPDATE"),
    ] {
        db.execute_batch(&format!("CREATE TRIGGER fail_{name} BEFORE {op} ON {table} BEGIN SELECT RAISE(ABORT,'injected'); END;")).unwrap();
        assert!(start(&mut db, "t", "owner", Some("parent"), "p", "n").is_err());
        idle(&db);
        db.execute_batch(&format!("DROP TRIGGER fail_{name};"))
            .unwrap();
    }
    db.execute_batch("CREATE TABLE parent_fk(id INTEGER PRIMARY KEY); CREATE TABLE child_fk(id INTEGER REFERENCES parent_fk(id) DEFERRABLE INITIALLY DEFERRED); CREATE TRIGGER fail_commit AFTER INSERT ON rust_thread_turn_heads BEGIN INSERT INTO child_fk VALUES (1); END;").unwrap();
    assert!(start(&mut db, "t", "owner", Some("parent"), "p", "n").is_err());
    idle(&db);
    assert_eq!(count(&db, "SELECT count(*) FROM child_fk"), 0);
}
#[test]
fn existing_history_and_duplicate_creation_are_rejected() {
    let mut db = Connection::open_in_memory().unwrap();
    schema(&db);
    create_idle(&mut db, &new_row("t")).unwrap();
    assert!(create_idle(&mut db, &new_row("t")).is_err());
    db.execute(
        "INSERT INTO rust_thread_turn_events VALUES ('t',1,'untrusted')",
        [],
    )
    .unwrap();
    assert!(start(&mut db, "t", "owner", Some("parent"), "p", "n").is_err());
    idle(&db);
}
#[test]
fn competing_connections_allow_only_one_start() {
    let uri = "file:admission_race?mode=memory&cache=shared";
    let flags = OpenFlags::SQLITE_OPEN_READ_WRITE
        | OpenFlags::SQLITE_OPEN_CREATE
        | OpenFlags::SQLITE_OPEN_URI;
    let mut db = Connection::open_with_flags(uri, flags).unwrap();
    schema(&db);
    create_idle(&mut db, &new_row("t")).unwrap();
    let barrier = Arc::new(Barrier::new(3));
    let handles: Vec<_> = ["p1", "p2"]
        .into_iter()
        .map(|session| {
            let b = barrier.clone();
            thread::spawn(move || {
                let mut c = Connection::open_with_flags(uri, flags).unwrap();
                c.busy_timeout(Duration::from_secs(2)).unwrap();
                b.wait();
                start(&mut c, "t", "owner", Some("parent"), session, "n").is_ok()
            })
        })
        .collect();
    barrier.wait();
    let successes = handles
        .into_iter()
        .map(|h| h.join().unwrap())
        .filter(|ok| *ok)
        .count();
    assert_eq!(successes, 1);
    assert_eq!(count(&db, "SELECT count(*) FROM rust_thread_turn_heads"), 1);
    assert_eq!(
        count(
            &db,
            "SELECT count(*) FROM agent_threads t JOIN rust_thread_turn_heads h ON t.id=h.thread_id AND t.provider_session_id=h.provider_session_id WHERE t.status='running'"
        ),
        1
    );
}

#[test]
fn replacement_and_activity_moves_revoke_freshness_even_when_reversed() {
    let mut db = Connection::open_in_memory().unwrap();
    schema(&db);
    db.execute_batch("PRAGMA recursive_triggers=OFF;").unwrap();
    create_idle(&mut db, &new_row("replaced")).unwrap();
    db.execute_batch("INSERT OR REPLACE INTO agent_threads VALUES ('replaced','owner','parent','title','jait','idle',NULL,'now','now');").unwrap();
    assert!(start(&mut db, "replaced", "owner", Some("parent"), "p", "n").is_err());
    create_idle(&mut db, &new_row("moved")).unwrap();
    db.execute_batch("INSERT INTO agent_thread_activities VALUES ('a','other'); UPDATE agent_thread_activities SET thread_id='moved' WHERE id='a'; UPDATE agent_thread_activities SET thread_id='other' WHERE id='a';").unwrap();
    assert!(start(&mut db, "moved", "owner", Some("parent"), "p", "n").is_err());
    assert_eq!(count(&db, "SELECT count(*) FROM rust_thread_turn_heads"), 0);
}

#[test]
fn orphan_history_cannot_be_adopted_as_fresh() {
    let mut db = Connection::open_in_memory().unwrap();
    schema(&db);
    db.execute_batch("INSERT INTO agent_thread_activities VALUES ('orphan','t');")
        .unwrap();
    assert!(create_idle(&mut db, &new_row("t")).is_err());
    assert_eq!(
        count(&db, "SELECT count(*) FROM agent_threads WHERE id='t'"),
        0
    );
    assert_eq!(
        count(
            &db,
            "SELECT count(*) FROM rust_thread_fresh_markers WHERE thread_id='t'"
        ),
        0
    );
}
