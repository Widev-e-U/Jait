//! Isolated database authority experiment, never wired to a provider or route.
//! Inputs are assumed to come from an authenticated caller; this function does not
//! authenticate them. A checked transaction authorizes database work only. It is not
//! a lease, does not authorize effects, and does not fence writers after commit.
use rusqlite::{Connection, Error, OptionalExtension, Transaction, TransactionBehavior, params};

pub struct TrustedThreadIdentity<'a> {
    pub thread: &'a str,
    pub owner: &'a str,
    pub parent_session: Option<&'a str>,
    pub provider_session: &'a str,
}

/// Run database-only work after checking live thread identity, admission provenance,
/// head, and tombstone under one SQLite write transaction. Callers must not perform
/// external effects here; the callback cannot be safely cancelled or retried blindly.
/// This candidate presumes trusted schema and writer access; it cannot protect against
/// a database administrator or an attacker able to modify its tables or triggers.
pub fn with_authorized_database_work<T>(
    db: &mut Connection,
    id: &TrustedThreadIdentity<'_>,
    work: impl FnOnce(&Transaction<'_>) -> rusqlite::Result<T>,
) -> rusqlite::Result<T> {
    if id.thread.trim().is_empty()
        || id.owner.trim().is_empty()
        || id.provider_session.trim().is_empty()
        || id.parent_session.is_some_and(|s| s.trim().is_empty())
    {
        return Err(Error::InvalidQuery);
    }
    let tx = db.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let authorized: Option<i64> = tx.query_row(
        "SELECT 1 FROM agent_threads t JOIN rust_thread_turn_heads h ON h.thread_id=t.id JOIN rust_thread_fresh_markers m ON m.thread_id=t.id WHERE t.id=?1 AND t.user_id=?2 AND t.session_id IS ?3 AND t.provider_id='jait' AND t.provider_session_id=?4 AND t.status='running' AND h.owner_id=?2 AND h.provider_session_id=?4 AND m.owner_id=?2 AND m.parent_session_id IS ?3 AND m.state='consumed' AND NOT EXISTS (SELECT 1 FROM rust_thread_revocation_candidate_v1 r WHERE r.thread_id=t.id)",
        params![id.thread, id.owner, id.parent_session, id.provider_session], |row| row.get(0),
    ).optional()?;
    if authorized.is_none() {
        return Err(Error::InvalidQuery);
    }
    let value = work(&tx)?;
    tx.commit()?;
    Ok(value)
}
