//! Isolated candidate only. Runtime fencing and migration coordination are prerequisites.
use rusqlite::{Connection, Error, Result};

const SCHEMA: &str = r#"
CREATE TABLE main.rust_thread_turn_schema_marker_v1 (
    singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
    version TEXT NOT NULL CHECK(version = 'thread-turn-schema-v1')
);
CREATE TABLE main.rust_thread_turn_heads (
    thread_id TEXT PRIMARY KEY NOT NULL,
    owner_id TEXT NOT NULL,
    provider_session_id TEXT NOT NULL,
    event_count INTEGER NOT NULL DEFAULT 0 CHECK(event_count >= 0)
);
CREATE TABLE main.rust_thread_turn_events (
    thread_id TEXT NOT NULL,
    sequence INTEGER NOT NULL CHECK(sequence > 0),
    payload TEXT NOT NULL,
    PRIMARY KEY(thread_id, sequence)
);
CREATE TRIGGER main.rust_thread_turn_delete AFTER DELETE ON agent_threads BEGIN
    DELETE FROM rust_thread_turn_events WHERE thread_id=OLD.id;
    DELETE FROM rust_thread_turn_heads WHERE thread_id=OLD.id;
END;
CREATE TRIGGER main.rust_thread_turn_identity AFTER UPDATE OF id, user_id, provider_id, provider_session_id ON agent_threads
WHEN OLD.id IS NOT NEW.id OR OLD.user_id IS NOT NEW.user_id
  OR OLD.provider_id IS NOT NEW.provider_id OR OLD.provider_session_id IS NOT NEW.provider_session_id
BEGIN
    DELETE FROM rust_thread_turn_events WHERE thread_id=OLD.id;
    DELETE FROM rust_thread_turn_heads WHERE thread_id=OLD.id;
END;
INSERT INTO main.rust_thread_turn_schema_marker_v1(singleton, version) VALUES (1, 'thread-turn-schema-v1');
"#;

// Include implicit indexes and every extra object attached to our tables, as well as
// the entire reserved name prefix. Exact sqlite_schema SQL deliberately rejects even
// semantically equivalent DDL; compatibility must be explicitly reviewed.
fn fingerprint(db: &Connection) -> Result<Vec<(String, String, String, Option<String>)>> {
    let mut statement = db.prepare("SELECT type, name, tbl_name, sql FROM main.sqlite_schema WHERE name GLOB 'rust_thread_turn_*' OR tbl_name IN ('rust_thread_turn_schema_marker_v1', 'rust_thread_turn_heads', 'rust_thread_turn_events') ORDER BY type, name")?;
    let rows = statement.query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))?;
    rows.collect()
}

fn prerequisite(db: &Connection) -> Result<()> {
    let kind: String = db.query_row(
        "SELECT type FROM main.sqlite_schema WHERE name='agent_threads'",
        [],
        |r| r.get(0),
    )?;
    if kind != "table" {
        return Err(Error::InvalidQuery);
    }
    let mut stmt = db.prepare("PRAGMA main.table_info(agent_threads)")?;
    let columns: Vec<String> = stmt.query_map([], |r| r.get(1))?.collect::<Result<_>>()?;
    if ["id", "user_id", "provider_id", "provider_session_id"]
        .iter()
        .any(|c| !columns.iter().any(|actual| actual == c))
    {
        return Err(Error::InvalidQuery);
    }
    Ok(())
}

/// Atomic install or strict retry verification; creates no history heads. A successful
/// retry proves schema identity, not marker provenance or exclusive writer authority.
/// The caller must coordinate migrations and fence all legacy writers before use.
pub fn install_schema(db: &Connection) -> Result<()> {
    db.execute_batch("SAVEPOINT rust_thread_turn_install_v1")?;
    let result = (|| {
        prerequisite(db)?;
        let actual = fingerprint(db)?;
        if actual.is_empty() {
            db.execute_batch(SCHEMA)?;
        } else {
            let reference = Connection::open_in_memory()?;
            reference.execute_batch("CREATE TABLE agent_threads (id TEXT, user_id TEXT, provider_id TEXT, provider_session_id TEXT);")?;
            reference.execute_batch(SCHEMA)?;
            if actual != fingerprint(&reference)? {
                return Err(Error::InvalidQuery);
            }
            let marker: (i64, i64) = db.query_row("SELECT count(*), count(*) FILTER (WHERE singleton=1 AND version='thread-turn-schema-v1') FROM main.rust_thread_turn_schema_marker_v1", [], |r| Ok((r.get(0)?, r.get(1)?)))?;
            if marker != (1, 1) {
                return Err(Error::InvalidQuery);
            }
        }
        Ok(())
    })();
    match result {
        Ok(()) => db.execute_batch("RELEASE rust_thread_turn_install_v1"),
        Err(error) => {
            db.execute_batch(
                "ROLLBACK TO rust_thread_turn_install_v1; RELEASE rust_thread_turn_install_v1",
            )?;
            Err(error)
        }
    }
}
