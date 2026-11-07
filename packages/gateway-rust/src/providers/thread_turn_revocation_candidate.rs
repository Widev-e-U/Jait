//! Isolated experiment: detect conflicting database writes after a history head exists.
//! Not a migration, authorization mechanism, runtime fence, or production integration.
//! Every relevant mutation revokes, including legitimate metadata writes. This deliberately
//! conservative policy needs a coordinated cross-runtime protocol before it can be used.
//! The head triggers change the v1 installer fingerprint: installing this candidate
//! makes existing v1 retry verification fail. It must not be installed independently on a v1 database.
use rusqlite::{Connection, OptionalExtension};

/// Install once into a controlled fixture. Existing objects are an error; this does not
/// recognize, repair, or migrate any deployed schema. All objects roll back on failure.
pub fn install(db: &Connection) -> rusqlite::Result<()> {
    db.execute_batch("SAVEPOINT rust_revocation_candidate_install")?;
    let result = db.execute_batch(r#"
        CREATE TABLE rust_thread_revocation_candidate_v1 (
            thread_id TEXT PRIMARY KEY NOT NULL
        );
        CREATE TRIGGER rust_revocation_candidate_thread_insert_v1 BEFORE INSERT ON agent_threads BEGIN
            INSERT OR IGNORE INTO rust_thread_revocation_candidate_v1
                SELECT NEW.id WHERE EXISTS (SELECT 1 FROM rust_thread_turn_heads WHERE thread_id=NEW.id);
        END;
        CREATE TRIGGER rust_revocation_candidate_thread_update_v1 BEFORE UPDATE ON agent_threads BEGIN
            INSERT OR IGNORE INTO rust_thread_revocation_candidate_v1
                SELECT OLD.id WHERE EXISTS (SELECT 1 FROM rust_thread_turn_heads WHERE thread_id=OLD.id);
            INSERT OR IGNORE INTO rust_thread_revocation_candidate_v1
                SELECT NEW.id WHERE EXISTS (SELECT 1 FROM rust_thread_turn_heads WHERE thread_id=NEW.id);
        END;
        CREATE TRIGGER rust_revocation_candidate_thread_delete_v1 BEFORE DELETE ON agent_threads BEGIN
            INSERT OR IGNORE INTO rust_thread_revocation_candidate_v1
                SELECT OLD.id WHERE EXISTS (SELECT 1 FROM rust_thread_turn_heads WHERE thread_id=OLD.id);
        END;
        CREATE TRIGGER rust_revocation_candidate_activity_insert_v1 BEFORE INSERT ON agent_thread_activities BEGIN
            INSERT OR IGNORE INTO rust_thread_revocation_candidate_v1
                SELECT NEW.thread_id WHERE EXISTS (SELECT 1 FROM rust_thread_turn_heads WHERE thread_id=NEW.thread_id);
            INSERT OR IGNORE INTO rust_thread_revocation_candidate_v1
                SELECT thread_id FROM agent_thread_activities WHERE id=NEW.id
                  AND EXISTS (SELECT 1 FROM rust_thread_turn_heads WHERE thread_id=agent_thread_activities.thread_id);
        END;
        CREATE TRIGGER rust_revocation_candidate_activity_update_v1 BEFORE UPDATE ON agent_thread_activities BEGIN
            INSERT OR IGNORE INTO rust_thread_revocation_candidate_v1
                SELECT OLD.thread_id WHERE EXISTS (SELECT 1 FROM rust_thread_turn_heads WHERE thread_id=OLD.thread_id);
            INSERT OR IGNORE INTO rust_thread_revocation_candidate_v1
                SELECT NEW.thread_id WHERE EXISTS (SELECT 1 FROM rust_thread_turn_heads WHERE thread_id=NEW.thread_id);
        END;
        CREATE TRIGGER rust_revocation_candidate_activity_delete_v1 BEFORE DELETE ON agent_thread_activities BEGIN
            INSERT OR IGNORE INTO rust_thread_revocation_candidate_v1
                SELECT OLD.thread_id WHERE EXISTS (SELECT 1 FROM rust_thread_turn_heads WHERE thread_id=OLD.thread_id);
        END;
        CREATE TRIGGER rust_revocation_candidate_no_readmission_v1 BEFORE INSERT ON rust_thread_turn_heads
        WHEN EXISTS (SELECT 1 FROM rust_thread_revocation_candidate_v1 WHERE thread_id=NEW.thread_id)
        BEGIN SELECT RAISE(ABORT, 'thread history revoked'); END;
        CREATE TRIGGER rust_revocation_candidate_no_head_move_v1 BEFORE UPDATE OF thread_id ON rust_thread_turn_heads
        WHEN EXISTS (SELECT 1 FROM rust_thread_revocation_candidate_v1 WHERE thread_id=NEW.thread_id)
        BEGIN SELECT RAISE(ABORT, 'thread history revoked'); END;
    "#);
    match result {
        Ok(()) => db.execute_batch("RELEASE rust_revocation_candidate_install"),
        Err(error) => {
            db.execute_batch("ROLLBACK TO rust_revocation_candidate_install; RELEASE rust_revocation_candidate_install")?;
            Err(error)
        }
    }
}

/// Call inside the same transaction as each history operation, after authenticating the
/// identity and checking the head. This check is not authority to start external effects.
pub fn ensure_not_revoked(db: &Connection, thread: &str) -> rusqlite::Result<()> {
    let revoked = db
        .query_row(
            "SELECT 1 FROM rust_thread_revocation_candidate_v1 WHERE thread_id=?1",
            [thread],
            |r| r.get::<_, i64>(0),
        )
        .optional()?
        .is_some();
    if revoked {
        return Err(rusqlite::Error::InvalidQuery);
    }
    Ok(())
}
