#[path = "thread_turn_schema_installer.rs"]
mod installer;
use rusqlite::{Connection, hooks::{AuthAction, AuthContext, Authorization}};
use std::{sync::{Arc, Barrier}, time::Duration};

fn setup(db: &Connection) {
    db.execute_batch("CREATE TABLE agent_threads(id TEXT PRIMARY KEY, user_id TEXT, provider_id TEXT, provider_session_id TEXT);").unwrap();
}
fn objects(db: &Connection) -> i64 {
    db.query_row("SELECT count(*) FROM sqlite_schema WHERE name GLOB 'rust_thread_turn_*'", [], |r| r.get(0)).unwrap()
}
#[test]
fn install_retry_and_outer_rollback() {
    let db = Connection::open_in_memory().unwrap(); setup(&db);
    db.execute_batch("BEGIN").unwrap();
    installer::install_schema(&db).unwrap(); installer::install_schema(&db).unwrap();
    assert_eq!(db.query_row("SELECT count(*) FROM rust_thread_turn_heads", [], |r| r.get::<_, i64>(0)).unwrap(), 0);
    db.execute_batch("ROLLBACK").unwrap(); assert_eq!(objects(&db), 0);
    installer::install_schema(&db).unwrap(); installer::install_schema(&db).unwrap();
}
#[test]
fn interrupted_install_rolls_back_all_objects() {
    let db = Connection::open_in_memory().unwrap(); setup(&db);
    db.authorizer(Some(|ctx: AuthContext<'_>| match ctx.action {
        AuthAction::CreateTrigger { .. } => Authorization::Deny,
        _ => Authorization::Allow,
    })).unwrap();
    assert!(installer::install_schema(&db).is_err());
    db.authorizer(None::<fn(AuthContext<'_>) -> Authorization>).unwrap();
    assert_eq!(objects(&db), 0); installer::install_schema(&db).unwrap();
}
#[test]
fn rejects_conflicts_and_tampering() {
    for ddl in ["CREATE TABLE rust_thread_turn_heads(x TEXT)", "CREATE VIEW rust_thread_turn_events AS SELECT 1", "CREATE TABLE rust_thread_turn_schema_marker_v1(x TEXT)", "CREATE TABLE rust_thread_turn_unexpected(x TEXT)"] {
        let db = Connection::open_in_memory().unwrap(); setup(&db); db.execute_batch(ddl).unwrap();
        assert!(installer::install_schema(&db).is_err()); assert_eq!(objects(&db), 1);
    }
    for mutation in ["DROP TRIGGER rust_thread_turn_identity", "CREATE INDEX extra_index ON rust_thread_turn_events(payload)", "DELETE FROM rust_thread_turn_schema_marker_v1", "DROP TABLE rust_thread_turn_heads; CREATE TABLE rust_thread_turn_heads(thread_id TEXT PRIMARY KEY, owner_id TEXT, provider_session_id TEXT, event_count INTEGER)"] {
        let db = Connection::open_in_memory().unwrap(); setup(&db); installer::install_schema(&db).unwrap();
        db.execute_batch(mutation).unwrap(); assert!(installer::install_schema(&db).is_err(), "{mutation}");
    }
}
#[test]
fn concurrent_connections_retry_safely() {
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join(format!("concurrent-{}.sqlite", std::process::id()));
    let db = Connection::open(&path).unwrap(); setup(&db); drop(db);
    let barrier = Arc::new(Barrier::new(2));
    let workers: Vec<_> = (0..2).map(|_| { let path = path.clone(); let barrier = barrier.clone(); std::thread::spawn(move || {
        let db = Connection::open(path).unwrap(); db.busy_timeout(Duration::from_secs(5)).unwrap(); barrier.wait();
        match installer::install_schema(&db) {
            Ok(()) => true,
            Err(rusqlite::Error::SqliteFailure(error, _)) if error.code == rusqlite::ErrorCode::DatabaseBusy => false,
            Err(error) => panic!("unexpected installer failure: {error}"),
        }
    })}).collect();
    let outcomes: Vec<_> = workers.into_iter().map(|worker| worker.join().unwrap()).collect();
    assert!(outcomes.iter().any(|success| *success));
    let db = Connection::open(&path).unwrap(); installer::install_schema(&db).unwrap();
    assert_eq!(db.query_row("SELECT count(*) FROM rust_thread_turn_schema_marker_v1", [], |r| r.get::<_, i64>(0)).unwrap(), 1);
    drop(db); std::fs::remove_file(path).unwrap();
}
#[test]
fn prerequisite_and_invalidation_triggers() {
    let missing = Connection::open_in_memory().unwrap();
    missing.execute_batch("CREATE TABLE agent_threads(id TEXT)").unwrap();
    assert!(installer::install_schema(&missing).is_err()); assert_eq!(objects(&missing), 0);
    let db = Connection::open_in_memory().unwrap(); setup(&db);
    db.execute_batch("INSERT INTO agent_threads VALUES ('t','u','jait','s')").unwrap();
    installer::install_schema(&db).unwrap();
    assert_eq!(db.query_row("SELECT count(*) FROM rust_thread_turn_heads", [], |r| r.get::<_, i64>(0)).unwrap(), 0);
    for operation in ["UPDATE agent_threads SET provider_session_id='s2' WHERE id='t'", "DELETE FROM agent_threads WHERE id='t'"] {
        db.execute_batch("INSERT INTO rust_thread_turn_heads VALUES ('t','u','s',1); INSERT INTO rust_thread_turn_events VALUES ('t',1,'event')").unwrap();
        db.execute_batch(operation).unwrap();
        for table in ["rust_thread_turn_heads", "rust_thread_turn_events"] {
            assert_eq!(db.query_row(&format!("SELECT count(*) FROM {table}"), [], |r| r.get::<_, i64>(0)).unwrap(), 0);
        }
    }
}
