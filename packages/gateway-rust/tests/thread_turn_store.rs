use jait_gateway::{routes, runtime};
use runtime::chat_turn::{TurnEvent, TurnPersistence};
#[path = "../src/providers/thread_turn_store.rs"]
mod thread_turn_store;
use thread_turn_store::{ThreadTurnStore, install_schema};

fn fixture() -> (routes::auth::AuthState, ThreadTurnStore) {
    let db = rusqlite::Connection::open_in_memory().unwrap();
    db.execute_batch("CREATE TABLE agent_threads(id TEXT PRIMARY KEY, user_id TEXT, provider_id TEXT, provider_session_id TEXT);").unwrap();
    install_schema(&db).unwrap();
    db.execute_batch("INSERT INTO agent_threads VALUES('thread','owner','jait','session');
        INSERT INTO rust_thread_turn_heads(thread_id,owner_id,provider_session_id) VALUES('thread','owner','session');").unwrap();
    let auth = routes::auth::AuthState::new(db, "fixture-secret".into()).unwrap();
    let store = ThreadTurnStore::new(
        auth.clone(),
        "owner".into(),
        "thread".into(),
        "session".into(),
    )
    .unwrap();
    (auth, store)
}
#[tokio::test]
async fn persists_and_rechecks_owner_and_provider_session() {
    let (auth, store) = fixture();
    let event = TurnEvent::User {
        content: "hello".into(),
    };
    assert_eq!(store.identity(), ("owner", "thread", "session"));
    store.check_capacity(1, 1024, 1024).await.unwrap();
    store.append(event.clone()).await.unwrap();
    assert_eq!(store.load().await.unwrap(), vec![event]);
    let other = ThreadTurnStore::new(
        auth.clone(),
        "other".into(),
        "thread".into(),
        "session".into(),
    )
    .unwrap();
    assert!(other.load().await.is_err());
    auth.with_database(|db| {
        db.execute(
            "UPDATE agent_threads SET provider_session_id='replacement' WHERE id='thread'",
            [],
        )?;
        Ok(())
    })
    .await
    .unwrap();
    assert!(store.check_authority().await.is_err());
    assert!(
        store
            .append(TurnEvent::User {
                content: "denied".into()
            })
            .await
            .is_err()
    );
    let replacement = ThreadTurnStore::new(
        auth.clone(),
        "owner".into(),
        "thread".into(),
        "replacement".into(),
    )
    .unwrap();
    assert!(replacement.load().await.is_err());
    auth.with_database(|db| {
        db.execute(
            "UPDATE agent_threads SET user_id='other' WHERE id='thread'",
            [],
        )?;
        Ok(())
    })
    .await
    .unwrap();
    assert!(replacement.load().await.is_err());
    auth.shutdown().await.unwrap();
}
#[tokio::test]
async fn missing_head_corrupt_history_and_limits_fail_closed() {
    let (auth, store) = fixture();
    assert!(
        store
            .append(TurnEvent::User {
                content: "x".repeat(1024 * 1024)
            })
            .await
            .is_err()
    );
    assert!(store.load().await.unwrap().is_empty());
    auth.with_database(|db| {
        db.execute_batch("CREATE TRIGGER reject_event BEFORE INSERT ON rust_thread_turn_events BEGIN SELECT RAISE(ABORT, 'rejected'); END;")?;
        Ok(())
    }).await.unwrap();
    assert!(
        store
            .append(TurnEvent::User {
                content: "rejected".into()
            })
            .await
            .is_err()
    );
    assert!(store.load().await.unwrap().is_empty());
    auth.with_database(|db| {
        db.execute_batch("DROP TRIGGER reject_event")?;
        Ok(())
    })
    .await
    .unwrap();
    auth.with_database(|db| {
        db.execute(
            "INSERT INTO rust_thread_turn_events VALUES ('thread',1,'{bad')",
            [],
        )?;
        Ok(())
    })
    .await
    .unwrap();
    assert!(store.load().await.is_err());
    auth.with_database(|db| {
        db.execute("DELETE FROM rust_thread_turn_heads", [])?;
        Ok(())
    })
    .await
    .unwrap();
    assert!(store.load().await.is_err());
    assert!(store.check_authority().await.is_err());
    auth.shutdown().await.unwrap();
}

#[test]
fn schema_install_is_atomic_and_never_backfills_existing_threads() {
    let db = rusqlite::Connection::open_in_memory().unwrap();
    db.execute_batch("CREATE TABLE agent_threads(id TEXT PRIMARY KEY, user_id TEXT, provider_id TEXT, provider_session_id TEXT); INSERT INTO agent_threads VALUES('old','owner','jait','session'); CREATE TABLE rust_thread_turn_events(x TEXT);").unwrap();
    assert!(install_schema(&db).is_err());
    let heads: i64 = db
        .query_row(
            "SELECT count(*) FROM sqlite_master WHERE name='rust_thread_turn_heads'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(heads, 0);
    db.execute_batch("DROP TABLE rust_thread_turn_events")
        .unwrap();
    install_schema(&db).unwrap();
    let heads: i64 = db
        .query_row("SELECT count(*) FROM rust_thread_turn_heads", [], |r| {
            r.get(0)
        })
        .unwrap();
    assert_eq!(heads, 0);
    assert!(install_schema(&db).is_err());
}

#[tokio::test]
async fn deletion_and_identity_changes_invalidate_history_transactionally() {
    let (auth, store) = fixture();
    store
        .append(TurnEvent::User {
            content: "private".into(),
        })
        .await
        .unwrap();
    auth.with_database(|db| {
        db.execute_batch("BEGIN; DELETE FROM agent_threads WHERE id='thread'; ROLLBACK;")?;
        Ok(())
    })
    .await
    .unwrap();
    assert_eq!(store.load().await.unwrap().len(), 1);
    auth.with_database(|db| {
        db.execute_batch("DELETE FROM agent_threads WHERE id='thread'; INSERT INTO agent_threads VALUES('thread','owner','jait','session');")?;
        let count: i64 = db.query_row("SELECT count(*) FROM rust_thread_turn_events", [], |r| r.get(0))?;
        assert_eq!(count, 0);
        Ok(())
    }).await.unwrap();
    assert!(store.load().await.is_err());
    auth.with_database(|db| {
        db.execute_batch("INSERT INTO rust_thread_turn_heads(thread_id,owner_id,provider_session_id) VALUES('thread','owner','session'); UPDATE agent_threads SET user_id='other' WHERE id='thread'; UPDATE agent_threads SET user_id='owner' WHERE id='thread';")?;
        Ok(())
    }).await.unwrap();
    assert!(store.load().await.is_err());
    auth.shutdown().await.unwrap();
}

#[tokio::test]
async fn missing_sequence_fails_closed() {
    let (auth, store) = fixture();
    store
        .append(TurnEvent::User {
            content: "one".into(),
        })
        .await
        .unwrap();
    store
        .append(TurnEvent::User {
            content: "two".into(),
        })
        .await
        .unwrap();
    auth.with_database(|db| {
        db.execute("DELETE FROM rust_thread_turn_events WHERE sequence=1", [])?;
        Ok(())
    })
    .await
    .unwrap();
    assert!(store.load().await.is_err());
    auth.shutdown().await.unwrap();
}

#[tokio::test]
async fn missing_tail_blocks_load_and_append() {
    let (auth, store) = fixture();
    store
        .append(TurnEvent::User {
            content: "one".into(),
        })
        .await
        .unwrap();
    auth.with_database(|db| {
        db.execute("DELETE FROM rust_thread_turn_events WHERE sequence=1", [])?;
        Ok(())
    })
    .await
    .unwrap();
    assert!(store.load().await.is_err());
    assert!(
        store
            .append(TurnEvent::User {
                content: "two".into()
            })
            .await
            .is_err()
    );
    auth.shutdown().await.unwrap();
}

#[tokio::test]
async fn gapped_history_with_matching_count_rejects_capacity_and_append() {
    let (auth, store) = fixture();
    store
        .append(TurnEvent::User {
            content: "one".into(),
        })
        .await
        .unwrap();
    store
        .append(TurnEvent::User {
            content: "two".into(),
        })
        .await
        .unwrap();
    auth.with_database(|db| {
        db.execute_batch("DELETE FROM rust_thread_turn_events WHERE sequence=1; UPDATE rust_thread_turn_heads SET event_count=1 WHERE thread_id='thread';")?;
        Ok(())
    }).await.unwrap();
    assert!(store.load().await.is_err());
    assert!(store.check_capacity(1, 1024, 1024).await.is_err());
    assert!(
        store
            .append(TurnEvent::User {
                content: "three".into()
            })
            .await
            .is_err()
    );
    let (count, head): (i64, i64) = auth
        .with_database(|db| {
            Ok((
                db.query_row("SELECT count(*) FROM rust_thread_turn_events", [], |r| {
                    r.get(0)
                })?,
                db.query_row(
                    "SELECT event_count FROM rust_thread_turn_heads WHERE thread_id='thread'",
                    [],
                    |r| r.get(0),
                )?,
            ))
        })
        .await
        .unwrap();
    assert_eq!((count, head), (1, 1));
    auth.shutdown().await.unwrap();
}
