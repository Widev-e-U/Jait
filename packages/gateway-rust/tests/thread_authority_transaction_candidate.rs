#[path = "../src/providers/atomic_thread_admission.rs"]
mod admission;
#[path = "../src/providers/thread_authority_transaction_candidate.rs"]
mod authority;
#[path = "../src/providers/thread_revocation_upgrade_candidate.rs"]
mod upgrade;
#[path = "../src/providers/thread_turn_schema_installer.rs"]
mod v1;
use authority::{TrustedThreadIdentity, with_authorized_database_work};
use rusqlite::{Connection, OpenFlags};
use std::sync::atomic::{AtomicUsize, Ordering};

fn fixture() -> (Connection, Connection) {
    static NEXT: AtomicUsize = AtomicUsize::new(0);
    let uri = format!(
        "file:authority_candidate_{}?mode=memory&cache=shared",
        NEXT.fetch_add(1, Ordering::Relaxed)
    );
    let flags = OpenFlags::SQLITE_OPEN_READ_WRITE
        | OpenFlags::SQLITE_OPEN_CREATE
        | OpenFlags::SQLITE_OPEN_URI;
    let mut first = Connection::open_with_flags(&uri, flags).unwrap();
    let second = Connection::open_with_flags(&uri, flags).unwrap();
    first.execute_batch("CREATE TABLE agent_threads(id TEXT PRIMARY KEY,user_id TEXT,session_id TEXT,title TEXT NOT NULL,provider_id TEXT NOT NULL,status TEXT NOT NULL,provider_session_id TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL); CREATE TABLE agent_thread_activities(id TEXT PRIMARY KEY,thread_id TEXT NOT NULL);").unwrap();
    v1::install_schema(&first).unwrap();
    admission::install_schema(&first).unwrap();
    upgrade::upgrade(&first).unwrap();
    admission::create_idle(
        &mut first,
        &admission::FreshThread {
            id: "t",
            owner: "owner",
            parent_session: Some("parent"),
            title: "title",
            timestamp: "now",
        },
    )
    .unwrap();
    admission::start(&mut first, "t", "owner", Some("parent"), "provider", "now").unwrap();
    (first, second)
}
fn id<'a>() -> TrustedThreadIdentity<'a> {
    TrustedThreadIdentity {
        thread: "t",
        owner: "owner",
        parent_session: Some("parent"),
        provider_session: "provider",
    }
}

#[test]
fn checks_identity_before_work_and_rejects_missing_schema() {
    let (mut db, _) = fixture();
    let wrong = [
        TrustedThreadIdentity {
            owner: "other",
            ..id()
        },
        TrustedThreadIdentity {
            parent_session: None,
            ..id()
        },
        TrustedThreadIdentity {
            provider_session: "other",
            ..id()
        },
        TrustedThreadIdentity {
            thread: " ",
            ..id()
        },
    ];
    for identity in wrong {
        let mut called = false;
        assert!(
            with_authorized_database_work(&mut db, &identity, |_| {
                called = true;
                Ok(())
            })
            .is_err()
        );
        assert!(!called);
    }
    db.execute("DROP TABLE rust_thread_revocation_candidate_v1", [])
        .unwrap();
    assert!(with_authorized_database_work(&mut db, &id(), |_| Ok(())).is_err());
}

#[test]
fn competing_writer_is_blocked_during_work_then_revokes_next_attempt() {
    let (mut db, other) = fixture();
    with_authorized_database_work(&mut db, &id(), |tx| {
        assert!(
            other
                .execute(
                    "UPDATE agent_threads SET status='interrupted' WHERE id='t'",
                    []
                )
                .is_err()
        );
        tx.execute(
            "INSERT INTO rust_thread_turn_events VALUES ('t',1,'payload')",
            [],
        )?;
        Ok(())
    })
    .unwrap();
    other
        .execute(
            "UPDATE agent_threads SET status='interrupted' WHERE id='t'",
            [],
        )
        .unwrap();
    other
        .execute("UPDATE agent_threads SET status='running' WHERE id='t'", [])
        .unwrap();
    assert!(with_authorized_database_work(&mut db, &id(), |_| Ok(())).is_err());
}

#[test]
fn failed_database_work_rolls_back() {
    let (mut db, _) = fixture();
    let result: rusqlite::Result<()> = with_authorized_database_work(&mut db, &id(), |tx| {
        tx.execute(
            "INSERT INTO rust_thread_turn_events VALUES ('t',1,'payload')",
            [],
        )?;
        Err(rusqlite::Error::InvalidQuery)
    });
    assert!(result.is_err());
    let count: i64 = db
        .query_row("SELECT count(*) FROM rust_thread_turn_events", [], |r| {
            r.get(0)
        })
        .unwrap();
    assert_eq!(count, 0);
}
