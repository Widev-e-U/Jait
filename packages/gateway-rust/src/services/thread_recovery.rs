//! Native port of the thread restart-recovery lifecycle from
//! `packages/gateway/src/services/threads.ts`.
//!
//! Reference spans (TypeScript, `ThreadStore`):
//! - constants:        `RESTART_ERROR`, `RESTART_ACTIVITY_SUMMARY`,
//!                     `CANCELLED_DELIVERY_ERROR`, `BLOCKED_ERROR_PREFIX`
//! - `queueRestartRecovery` / `listPendingRecovery` / `claimRecovery` /
//!                     `getRecovery` / `clearRecovery`
//! - status transitions: `markRunning`, `markCompleted`,
//!                     `markCompletedAndClearSession`, `clearSession`,
//!                     `markError`, `markInterrupted`
//!
//! Semantics preserved from the reference:
//! - `queue_restart_recovery` is idempotent: it re-queues rows that are still
//!   `running`, plus rows that are already `interrupted` *and* still have a
//!   `thread_recovery` row (so a restart in the middle of a recovery attempt
//!   does not forget it), de-duplicated by thread id, running rows first in
//!   `updated_at DESC` order.
//! - a stale provider session id is only overwritten when the thread still
//!   carries one; a `None` session never erases a previous stale id.
//! - every mutation runs inside a single transaction per thread so a crash
//!   cannot leave a `pending` flag without the matching `interrupted` status.
//! - `claim_recovery` is a compare-and-set: it only succeeds while
//!   `pending = 1`, and increments `attempts` on success.
//! - `mark_error` maps any `Execution blocked: …` message onto the `blocked`
//!   status and keeps the provider session id in that case, mirroring the
//!   reference; all other errors clear the session.
//! - `mark_interrupted` deliberately does *not* touch `error`; the reference
//!   leaves the previous error text in place and only the restart path
//!   (`RESTART_ERROR`) rewrites it.
//!
//! - interruption atomically clears recovery, updates the thread, and cancels
//!   its queued team deliveries, including when invoked inside a transaction.

use rusqlite::{Connection, OptionalExtension, params};

/// Reference `RESTART_ERROR`.
pub const RESTART_ERROR: &str = "Gateway restarted — automatically continuing saved work.";
/// Reference `RESTART_ACTIVITY_SUMMARY`.
pub const RESTART_ACTIVITY_SUMMARY: &str = "Gateway restarted — continuation queued";
/// Activity `kind` used when the restart queue records itself on a thread.
pub const RESTART_ACTIVITY_KIND: &str = "session";
/// Reference `CANCELLED_DELIVERY_ERROR`.
pub const CANCELLED_DELIVERY_ERROR: &str = "Thread was stopped before this delivery started.";
/// Reference `BLOCKED_ERROR_PREFIX`.
pub const BLOCKED_ERROR_PREFIX: &str = "Execution blocked:";

pub type Result<T> = std::result::Result<T, rusqlite::Error>;

/// A row of `thread_recovery`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RecoveryEntry {
    pub thread_id: String,
    pub pending: bool,
    pub attempts: i64,
    pub stale_provider_session_id: Option<String>,
}

/// The `agent_threads` columns the recovery lifecycle reads.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RecoveryThread {
    pub id: String,
    pub status: String,
    pub provider_session_id: Option<String>,
}

const SELECT_RECOVERY: &str =
    "select thread_id, pending, attempts, stale_provider_session_id from thread_recovery";

fn row_to_entry(row: &rusqlite::Row<'_>) -> rusqlite::Result<RecoveryEntry> {
    Ok(RecoveryEntry {
        thread_id: row.get(0)?,
        pending: row.get::<_, i64>(1)? != 0,
        attempts: row.get(2)?,
        stale_provider_session_id: row.get(3)?,
    })
}

/// `select * from agent_threads where status = 'running' order by updated_at desc`
pub fn list_running(connection: &Connection) -> Result<Vec<RecoveryThread>> {
    let mut statement = connection.prepare(
        "select id, status, provider_session_id from agent_threads \
         where status = 'running' order by updated_at desc, id asc",
    )?;
    let rows = statement.query_map([], |row| {
        Ok(RecoveryThread {
            id: row.get(0)?,
            status: row.get(1)?,
            provider_session_id: row.get(2)?,
        })
    })?;
    rows.collect()
}

/// Single-row read used to join `thread_recovery` back onto its thread.
pub fn get_thread(connection: &Connection, id: &str) -> Result<Option<RecoveryThread>> {
    connection
        .query_row(
            "select id, status, provider_session_id from agent_threads where id = ?1",
            params![id],
            |row| {
                Ok(RecoveryThread {
                    id: row.get(0)?,
                    status: row.get(1)?,
                    provider_session_id: row.get(2)?,
                })
            },
        )
        .optional()
}

/// `getRecovery(threadId)`.
pub fn get_recovery(connection: &Connection, thread_id: &str) -> Result<Option<RecoveryEntry>> {
    connection
        .query_row(
            &format!("{SELECT_RECOVERY} where thread_id = ?1"),
            params![thread_id],
            row_to_entry,
        )
        .optional()
}

/// `listPendingRecovery()`.
pub fn list_pending_recovery(connection: &Connection) -> Result<Vec<RecoveryEntry>> {
    let mut statement = connection.prepare(&format!(
        "{SELECT_RECOVERY} where pending = 1 order by thread_id asc"
    ))?;
    let rows = statement.query_map([], row_to_entry)?;
    rows.collect()
}

/// `queueRestartRecovery()` — flag resumable work for the supervisor.
///
/// Returns the queued thread ids in the reference's iteration order so callers
/// and tests can observe the exact set without re-querying.
pub fn queue_restart_recovery(connection: &mut Connection, now: &str) -> Result<Vec<String>> {
    let mut targets: Vec<RecoveryThread> = Vec::new();
    for thread in list_running(connection)? {
        if !targets.iter().any(|seen| seen.id == thread.id) {
            targets.push(thread);
        }
    }
    let mut statement = connection.prepare(SELECT_RECOVERY)?;
    let mut rows = statement.query([])?;
    while let Some(row) = rows.next()? {
        let entry = row_to_entry(row)?;
        if let Some(thread) = get_thread(connection, &entry.thread_id)?
            && thread.status == "interrupted"
            && !targets.iter().any(|seen| seen.id == thread.id)
        {
            targets.push(thread);
        }
    }
    drop(rows);
    drop(statement);

    let mut queued = Vec::with_capacity(targets.len());
    for thread in targets {
        let transaction = connection.transaction()?;
        match thread.provider_session_id.as_deref() {
            Some(session) => transaction.execute(
                "insert into thread_recovery \
                     (thread_id, attempts, stale_provider_session_id, pending) \
                 values (?1, 0, ?2, 1) \
                 on conflict(thread_id) do update set \
                     stale_provider_session_id = excluded.stale_provider_session_id, \
                     pending = 1",
                params![thread.id, session],
            )?,
            None => transaction.execute(
                "insert into thread_recovery (thread_id, attempts, pending) values (?1, 0, 1) \
                 on conflict(thread_id) do update set pending = 1",
                params![thread.id],
            )?,
        };
        transaction.execute(
            "update agent_threads \
                set status = 'interrupted', provider_session_id = null, error = ?2, updated_at = ?3 \
              where id = ?1",
            params![thread.id, RESTART_ERROR, now],
        )?;
        transaction.execute(
            "insert into agent_thread_activities (id, thread_id, kind, summary, payload, created_at) \
             values (?1, ?2, ?3, ?4, null, ?5)",
            params![
                crate::db::identifiers::uuidv7().to_string(),
                thread.id,
                RESTART_ACTIVITY_KIND,
                RESTART_ACTIVITY_SUMMARY,
                now
            ],
        )?;
        transaction.commit()?;
        queued.push(thread.id);
    }
    Ok(queued)
}

/// `claimRecovery(threadId)` — compare-and-set so two supervisors never resume
/// the same thread twice.
pub fn claim_recovery(connection: &Connection, thread_id: &str) -> Result<bool> {
    let changed = connection.execute(
        "update thread_recovery set pending = 0, attempts = attempts + 1 \
          where thread_id = ?1 and pending = 1",
        params![thread_id],
    )?;
    Ok(changed > 0)
}

/// `clearRecovery(threadId)`.
pub fn clear_recovery(connection: &Connection, thread_id: &str) -> Result<bool> {
    let changed = connection.execute(
        "delete from thread_recovery where thread_id = ?1",
        params![thread_id],
    )?;
    Ok(changed > 0)
}

/// `markRunning(id, providerSessionId)` — note the reference does *not* clear a
/// recovery row here.
pub fn mark_running(
    connection: &Connection,
    id: &str,
    provider_session_id: &str,
    now: &str,
) -> Result<bool> {
    let changed = connection.execute(
        "update agent_threads \
            set status = 'running', provider_session_id = ?2, error = null, \
                completed_at = null, updated_at = ?3 \
          where id = ?1",
        params![id, provider_session_id, now],
    )?;
    Ok(changed > 0)
}

/// `markCompleted(id)`.
pub fn mark_completed(connection: &Connection, id: &str, now: &str) -> Result<bool> {
    clear_recovery(connection, id)?;
    let changed = connection.execute(
        "update agent_threads \
            set status = 'completed', error = null, completed_at = ?2, updated_at = ?2 \
          where id = ?1",
        params![id, now],
    )?;
    Ok(changed > 0)
}

/// `markCompletedAndClearSession(id)` — same as `mark_completed` plus a dropped
/// provider session id (the reference routes it through the same update helper).
pub fn mark_completed_and_clear_session(
    connection: &Connection,
    id: &str,
    now: &str,
) -> Result<bool> {
    clear_recovery(connection, id)?;
    let changed = connection.execute(
        "update agent_threads \
            set status = 'completed', provider_session_id = null, error = null, \
                completed_at = ?2, updated_at = ?2 \
          where id = ?1",
        params![id, now],
    )?;
    Ok(changed > 0)
}

/// `clearSession(id)`.
pub fn clear_session(connection: &Connection, id: &str, now: &str) -> Result<bool> {
    let changed = connection.execute(
        "update agent_threads set provider_session_id = null, updated_at = ?2 where id = ?1",
        params![id, now],
    )?;
    Ok(changed > 0)
}

/// `markError(id, error)` — `Execution blocked:` messages become `blocked` and
/// keep their provider session; every other error drops it.
pub fn mark_error(connection: &Connection, id: &str, error: &str, now: &str) -> Result<bool> {
    clear_recovery(connection, id)?;
    let blocked = error.starts_with(BLOCKED_ERROR_PREFIX);
    let status = if blocked { "blocked" } else { "error" };
    let changed = connection.execute(
        "update agent_threads \
            set status = ?2, error = ?3, \
                provider_session_id = case when ?4 = 1 then provider_session_id else null end, \
                updated_at = ?5 \
          where id = ?1",
        params![id, status, error, i64::from(blocked), now],
    )?;
    Ok(changed > 0)
}

/// `markInterrupted(id)` — atomically clears recovery, interrupts the thread,
/// and cancels its queued team deliveries. Leaves the thread error untouched.
/// A savepoint permits callers to include this operation in a larger transaction.
///
/// This is a persistence primitive, not an authorization or cancellation entry
/// point. The session owner must authenticate and authorize the thread, serialize
/// this transition with starts and provider events, and stop the correct active
/// (or stale remote) provider session before using it for a full stop. It must
/// also clean up subscriptions and resume registrations. Otherwise a late event
/// can overwrite this state or an active worker can continue after it is saved.
/// A turn-only interrupt has different semantics and must not call this helper:
/// it retains the provider session and does not cancel queued deliveries.
pub fn mark_interrupted(connection: &mut Connection, id: &str, now: &str) -> Result<bool> {
    let transaction = connection.savepoint()?;
    clear_recovery(&transaction, id)?;
    let changed = transaction.execute(
        "update agent_threads \
            set status = 'interrupted', provider_session_id = null, updated_at = ?2 \
          where id = ?1",
        params![id, now],
    )?;
    transaction.execute(
        "update team_room_deliveries set status = 'cancelled', error = ?2 \
          where session_id = ?1 and status = 'queued'",
        params![id, CANCELLED_DELIVERY_ERROR],
    )?;
    transaction.commit()?;
    Ok(changed > 0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::open_database;
    use std::path::Path;

    fn database() -> Connection {
        let connection = open_database(Path::new(":memory:")).expect("open in-memory database");
        crate::db::migrate_database(&connection).expect("migrate");
        connection
    }

    fn insert_thread(connection: &Connection, id: &str, status: &str, session: Option<&str>) {
        connection
            .execute(
                "insert into agent_threads \
                     (id, title, provider_id, status, provider_session_id, created_at, updated_at) \
                 values (?1, ?1, 'jait', ?2, ?3, 't0', 't0')",
                params![id, status, session],
            )
            .expect("insert thread");
    }

    #[test]
    fn restarted_threads_are_queued_at_most_once() {
        let mut connection = database();
        insert_thread(&connection, "a", "running", Some("sess-a"));
        insert_thread(&connection, "b", "interrupted", None);
        insert_thread(&connection, "c", "completed", Some("sess-c"));
        connection
            .execute(
                "insert into thread_recovery (thread_id, attempts, pending) values ('b', 2, 0)",
                [],
            )
            .expect("seed recovery");

        let queued = queue_restart_recovery(&mut connection, "t1").expect("queue");
        assert_eq!(queued, vec!["a".to_string(), "b".to_string()]);

        let recovery = get_recovery(&connection, "a").expect("read").expect("row");
        assert!(recovery.pending);
        assert_eq!(
            recovery.stale_provider_session_id.as_deref(),
            Some("sess-a")
        );

        // `b` keeps its attempt count and has no session to record.
        let recovery = get_recovery(&connection, "b").expect("read").expect("row");
        assert!(recovery.pending);
        assert_eq!(recovery.attempts, 2);
        assert_eq!(recovery.stale_provider_session_id, None);

        // `c` never had resumable work.
        assert!(get_recovery(&connection, "c").expect("read").is_none());
    }

    #[test]
    fn claim_is_compare_and_set() {
        let mut connection = database();
        insert_thread(&connection, "a", "running", Some("sess-a"));
        queue_restart_recovery(&mut connection, "t1").expect("queue");

        assert!(claim_recovery(&connection, "a").expect("claim"));
        assert!(!claim_recovery(&connection, "a").expect("second claim"));
        let recovery = get_recovery(&connection, "a").expect("read").expect("row");
        assert_eq!(recovery.attempts, 1);
        assert!(!recovery.pending);
        assert_eq!(list_pending_recovery(&connection).expect("list").len(), 0);
    }

    #[test]
    fn blocked_errors_keep_their_session() {
        let connection = database();
        insert_thread(&connection, "a", "running", Some("sess-a"));
        mark_error(&connection, "a", "Execution blocked: quota", "t2").expect("mark");
        let thread = get_thread(&connection, "a").expect("read").expect("row");
        assert_eq!(thread.status, "blocked");
        assert_eq!(thread.provider_session_id.as_deref(), Some("sess-a"));

        mark_error(&connection, "a", "boom", "t3").expect("mark");
        let thread = get_thread(&connection, "a").expect("read").expect("row");
        assert_eq!(thread.status, "error");
        assert_eq!(thread.provider_session_id, None);
    }
    #[test]
    fn interruption_cancels_only_queued_deliveries_for_the_thread() {
        let mut connection = database();
        insert_thread(&connection, "a", "running", Some("sess-a"));
        insert_thread(&connection, "b", "running", Some("sess-b"));
        connection
            .execute(
                "update agent_threads set error = 'previous' where id = 'a'",
                [],
            )
            .unwrap();
        connection
            .execute(
                "insert into thread_recovery (thread_id, pending) values ('a', 1)",
                [],
            )
            .unwrap();
        for (id, session, status) in [
            ("one", "a", "queued"),
            ("two", "a", "running"),
            ("three", "b", "queued"),
        ] {
            connection.execute("insert into team_room_deliveries (id, room_id, message_id, agent_id, session_id, status, error) values (?1, 'r', 'm', 'agent', ?2, ?3, 'old')", params![id, session, status]).unwrap();
        }
        assert!(mark_interrupted(&mut connection, "a", "t1").unwrap());
        assert!(get_recovery(&connection, "a").unwrap().is_none());
        let thread: (String, Option<String>, String) = connection
            .query_row(
                "select status, provider_session_id, error from agent_threads where id = 'a'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .unwrap();
        assert_eq!(thread, ("interrupted".into(), None, "previous".into()));
        let mut stmt = connection
            .prepare("select id, status, error from team_room_deliveries order by id")
            .unwrap();
        let rows: Vec<(String, String, String)> = stmt
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
            .unwrap()
            .map(|r| r.unwrap())
            .collect();
        assert_eq!(
            rows,
            vec![
                (
                    "one".into(),
                    "cancelled".into(),
                    CANCELLED_DELIVERY_ERROR.into()
                ),
                ("three".into(), "queued".into(), "old".into()),
                ("two".into(), "running".into(), "old".into())
            ]
        );
    }

    #[test]
    fn interruption_rolls_back_on_delivery_failure_and_nests() {
        let mut connection = database();
        insert_thread(&connection, "a", "running", Some("sess-a"));
        connection
            .execute(
                "insert into thread_recovery (thread_id, pending) values ('a', 1)",
                [],
            )
            .unwrap();
        connection.execute_batch("create trigger reject_cancel before update on team_room_deliveries begin select raise(abort, 'reject'); end; insert into team_room_deliveries values ('d', 'r', 'm', 'agent', 'a', 'queued', null);").unwrap();
        assert!(mark_interrupted(&mut connection, "a", "t1").is_err());
        assert_eq!(
            get_thread(&connection, "a").unwrap().unwrap().status,
            "running"
        );
        assert!(get_recovery(&connection, "a").unwrap().unwrap().pending);
        connection
            .execute_batch("drop trigger reject_cancel; begin")
            .unwrap();
        assert!(mark_interrupted(&mut connection, "a", "t2").unwrap());
        connection.execute_batch("rollback").unwrap();
        assert_eq!(
            get_thread(&connection, "a").unwrap().unwrap().status,
            "running"
        );
        assert!(get_recovery(&connection, "a").unwrap().unwrap().pending);
        let status: String = connection
            .query_row(
                "select status from team_room_deliveries where id = 'd'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(status, "queued");
    }
}
