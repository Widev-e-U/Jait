//! Isolated v1-to-revocation upgrade experiment. Not wired to application startup.
//! This coordinates the exact v1 installer with the candidate's extra head triggers;
//! it does not establish writer authority, effect fencing, or production migration policy.
#[path = "thread_turn_revocation_candidate.rs"]
mod revocation;
#[path = "thread_turn_schema_installer.rs"]
mod v1;
use rusqlite::{Connection, Error, Result};

type Object = (String, String, String, Option<String>);

fn fingerprint(db: &Connection) -> Result<Vec<Object>> {
    let mut query = db.prepare("SELECT type,name,tbl_name,sql FROM main.sqlite_schema WHERE name GLOB 'rust_thread_turn_*' OR name GLOB 'rust_revocation_candidate_*' OR name GLOB 'rust_thread_revocation_candidate_*' OR tbl_name IN ('rust_thread_turn_schema_marker_v1','rust_thread_turn_heads','rust_thread_turn_events','rust_thread_revocation_candidate_v1') ORDER BY type,name")?;
    let rows = query.query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))?;
    rows.collect()
}

fn reference() -> Result<Vec<Object>> {
    let db = Connection::open_in_memory()?;
    db.execute_batch("CREATE TABLE agent_threads(id TEXT, user_id TEXT, provider_id TEXT, provider_session_id TEXT); CREATE TABLE agent_thread_activities(id TEXT, thread_id TEXT);")?;
    v1::install_schema(&db)?;
    revocation::install(&db)?;
    fingerprint(&db)
}

/// Requires a correctly installed v1 schema. All objects are created atomically;
/// retries accept only the exact upgraded schema and correct v1 marker. This deliberately
/// does not import or infer ownership of any existing thread history.
pub fn upgrade(db: &Connection) -> Result<()> {
    db.execute_batch("SAVEPOINT rust_revocation_upgrade_candidate")?;
    let result = (|| {
        let present: i64 = db.query_row("SELECT count(*) FROM main.sqlite_schema WHERE name GLOB 'rust_revocation_candidate_*' OR name GLOB 'rust_thread_revocation_candidate_*'", [], |r| r.get(0))?;
        if present == 0 {
            // v1's installer can create absent v1, so require its existing marker first.
            let marker: i64 = db.query_row("SELECT count(*) FROM main.sqlite_schema WHERE type='table' AND name='rust_thread_turn_schema_marker_v1'", [], |r| r.get(0))?;
            if marker != 1 {
                return Err(Error::InvalidQuery);
            }
            v1::install_schema(db)?;
            revocation::install(db)?;
        }
        if fingerprint(db)? != reference()? {
            return Err(Error::InvalidQuery);
        }
        let marker: (i64, i64) = db.query_row("SELECT count(*), count(*) FILTER (WHERE singleton=1 AND version='thread-turn-schema-v1') FROM main.rust_thread_turn_schema_marker_v1", [], |r| Ok((r.get(0)?,r.get(1)?)))?;
        if marker != (1, 1) {
            return Err(Error::InvalidQuery);
        }
        Ok(())
    })();
    match result {
        Ok(()) => db.execute_batch("RELEASE rust_revocation_upgrade_candidate"),
        Err(error) => {
            db.execute_batch("ROLLBACK TO rust_revocation_upgrade_candidate; RELEASE rust_revocation_upgrade_candidate")?;
            Err(error)
        }
    }
}
