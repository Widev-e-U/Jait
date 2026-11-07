//! Isolated SQLite admission experiment. Not registered or safe for production.
//! This does not fence other writers, authorize effects, supervise cancellation,
//! or provide provider lifecycle ownership. Callers must not activate a provider
//! on the strength of this primitive. Schema installation is not a migration.
use rusqlite::{Connection, TransactionBehavior, params};

#[derive(Debug)]
pub enum AdmissionError {
    InvalidIdentity,
    Ineligible,
    Sql(rusqlite::Error),
}
impl std::fmt::Display for AdmissionError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidIdentity => f.write_str("invalid identity"),
            Self::Ineligible => f.write_str("thread is ineligible"),
            Self::Sql(error) => write!(f, "database error: {error}"),
        }
    }
}
impl From<rusqlite::Error> for AdmissionError {
    fn from(value: rusqlite::Error) -> Self {
        Self::Sql(value)
    }
}

/// Install only in an isolated test database or a separately reviewed migration.
/// Identity/status changes and activities revoke freshness even if later reversed.
pub fn install_schema(db: &Connection) -> rusqlite::Result<()> {
    db.execute_batch("SAVEPOINT admission_schema;")?;
    let result = db.execute_batch(r#"
        CREATE TABLE rust_thread_fresh_markers (
            thread_id TEXT PRIMARY KEY NOT NULL,
            owner_id TEXT NOT NULL,
            parent_session_id TEXT,
            state TEXT NOT NULL CHECK(state IN ('fresh','consumed'))
        );
        CREATE TRIGGER rust_fresh_delete AFTER DELETE ON agent_threads BEGIN
            DELETE FROM rust_thread_fresh_markers WHERE thread_id=OLD.id;
        END;
        CREATE TRIGGER rust_fresh_insert AFTER INSERT ON agent_threads BEGIN
            DELETE FROM rust_thread_fresh_markers WHERE thread_id=NEW.id AND state='fresh';
        END;
        CREATE TRIGGER rust_fresh_change AFTER UPDATE ON agent_threads
        WHEN EXISTS (SELECT 1 FROM rust_thread_fresh_markers WHERE thread_id=OLD.id AND state='fresh')
        BEGIN DELETE FROM rust_thread_fresh_markers WHERE thread_id=OLD.id; END;
        CREATE TRIGGER rust_fresh_activity BEFORE INSERT ON agent_thread_activities BEGIN
            DELETE FROM rust_thread_fresh_markers WHERE state='fresh' AND (thread_id=NEW.thread_id OR thread_id IN (SELECT thread_id FROM agent_thread_activities WHERE id=NEW.id));
        END;
        CREATE TRIGGER rust_fresh_activity_update BEFORE UPDATE ON agent_thread_activities BEGIN
            DELETE FROM rust_thread_fresh_markers WHERE state='fresh' AND (thread_id IN (OLD.thread_id, NEW.thread_id) OR thread_id IN (SELECT thread_id FROM agent_thread_activities WHERE id=NEW.id));
        END;
        CREATE TRIGGER rust_fresh_activity_delete BEFORE DELETE ON agent_thread_activities BEGIN
            DELETE FROM rust_thread_fresh_markers WHERE state='fresh' AND thread_id=OLD.thread_id;
        END;
    "#);
    match result {
        Ok(()) => db.execute_batch("RELEASE admission_schema"),
        Err(e) => {
            db.execute_batch("ROLLBACK TO admission_schema; RELEASE admission_schema")?;
            Err(e)
        }
    }
}

/// Minimal candidate row, not a replacement for the full production create contract.
pub struct FreshThread<'a> {
    pub id: &'a str,
    pub owner: &'a str,
    pub parent_session: Option<&'a str>,
    pub title: &'a str,
    pub timestamp: &'a str,
}
fn valid(s: &str) -> bool {
    !s.trim().is_empty()
}

/// Atomically creates an idle row and its provenance. No existing row is adopted.
pub fn create_idle(db: &mut Connection, row: &FreshThread<'_>) -> Result<(), AdmissionError> {
    if !valid(row.id) || !valid(row.owner) || row.parent_session.is_some_and(|s| !valid(s)) {
        return Err(AdmissionError::InvalidIdentity);
    }
    let tx = db.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let has_history: bool = tx.query_row("SELECT EXISTS (SELECT 1 FROM agent_thread_activities WHERE thread_id=?1 UNION ALL SELECT 1 FROM rust_thread_turn_heads WHERE thread_id=?1 UNION ALL SELECT 1 FROM rust_thread_turn_events WHERE thread_id=?1)", [row.id], |r| r.get(0))?;
    if has_history {
        return Err(AdmissionError::Ineligible);
    }
    tx.execute("INSERT INTO agent_threads (id,user_id,session_id,title,provider_id,status,created_at,updated_at) VALUES (?1,?2,?3,?4,'jait','idle',?5,?5)", params![row.id,row.owner,row.parent_session,row.title,row.timestamp])?;
    tx.execute(
        "INSERT INTO rust_thread_fresh_markers VALUES (?1,?2,?3,'fresh')",
        params![row.id, row.owner, row.parent_session],
    )?;
    tx.commit()?;
    Ok(())
}

/// Atomically consumes a fresh marker, binds a session and creates an empty head.
/// Trusted identity inputs must be authenticated by the eventual caller. BEGIN
/// IMMEDIATE serializes competing instances, but provides no post-commit fencing.
pub fn start(
    db: &mut Connection,
    thread: &str,
    owner: &str,
    parent: Option<&str>,
    provider_session: &str,
    timestamp: &str,
) -> Result<(), AdmissionError> {
    if !valid(thread)
        || !valid(owner)
        || !valid(provider_session)
        || parent.is_some_and(|s| !valid(s))
    {
        return Err(AdmissionError::InvalidIdentity);
    }
    let tx = db.transaction_with_behavior(TransactionBehavior::Immediate)?;
    // Consume first so the freshness-revocation trigger does not delete the marker.
    let consumed = tx.execute("UPDATE rust_thread_fresh_markers SET state='consumed' WHERE thread_id=?1 AND owner_id=?2 AND parent_session_id IS ?3 AND state='fresh' AND EXISTS (SELECT 1 FROM agent_threads t WHERE t.id=?1 AND t.user_id=?2 AND t.session_id IS ?3 AND t.provider_id='jait' AND t.status='idle' AND t.provider_session_id IS NULL) AND NOT EXISTS (SELECT 1 FROM rust_thread_turn_heads WHERE thread_id=?1) AND NOT EXISTS (SELECT 1 FROM rust_thread_turn_events WHERE thread_id=?1) AND NOT EXISTS (SELECT 1 FROM agent_thread_activities WHERE thread_id=?1)", params![thread,owner,parent])?;
    if consumed != 1 {
        return Err(AdmissionError::Ineligible);
    }
    let updated = tx.execute("UPDATE agent_threads SET provider_session_id=?4,status='running',updated_at=?5 WHERE id=?1 AND user_id=?2 AND session_id IS ?3 AND provider_id='jait' AND status='idle' AND provider_session_id IS NULL", params![thread,owner,parent,provider_session,timestamp])?;
    if updated != 1 {
        return Err(AdmissionError::Ineligible);
    }
    tx.execute("INSERT INTO rust_thread_turn_heads (thread_id,owner_id,provider_session_id,event_count) VALUES (?1,?2,?3,0)", params![thread,owner,provider_session])?;
    tx.commit()?;
    Ok(())
}
