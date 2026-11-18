//! Integration of session callback fencing with native activity mapping.
//! This does not exercise an HTTP route or a real provider subscription.
use jait_gateway::services::thread_lifecycle::{Cancellation, LifecycleError, ThreadEventOwner};
use jait_gateway::services::thread_provider_events::ProviderEventDispatch;
use rusqlite::Connection;
use serde_json::json;

fn db() -> Connection {
    let db = Connection::open_in_memory().unwrap();
    db.execute_batch("CREATE TABLE agent_threads (id TEXT, provider_session_id TEXT); INSERT INTO agent_threads VALUES ('thread-a', 'provider-a'); CREATE TABLE agent_thread_activities (id TEXT, thread_id TEXT, kind TEXT, summary TEXT, payload TEXT, created_at TEXT)").unwrap();
    db
}

#[test]
fn callback_fencing_prevents_stale_database_and_context_writes() {
    let db = db();
    let mut owner = ThreadEventOwner::new("thread-a".into(), "provider-a".into()).unwrap();
    let old = owner.begin_turn().unwrap();
    owner
        .dispatch(
            &db,
            old,
            &json!({"sessionId":"provider-a","type":"activity","kind":"context_flow","summary":"old pending"}),
        )
        .unwrap();
    assert_eq!(owner.interrupt_turn(), Cancellation::CancelTurn(old));
    assert_eq!(owner
        .dispatch(
            &db,
            old,
            &json!({"sessionId":"provider-a","type":"message","role":"assistant","content":"late"})
        )
        .unwrap(), ProviderEventDispatch::Stale);
    assert_eq!(owner.begin_turn(), Err(LifecycleError::TurnAlreadyActive));
    owner.finish_turn(old).unwrap();
    let new = owner.begin_turn().unwrap();
    owner
        .dispatch(
            &db,
            old,
            &json!({"sessionId":"provider-a","type":"session.completed"}),
        )
        .unwrap();
    owner
        .dispatch(
            &db,
            new,
            &json!({"sessionId":"provider-a","type":"message","role":"assistant","content":"current"}),
        )
        .unwrap();
    owner
        .dispatch(
            &db,
            new,
            &json!({"sessionId":"provider-a","type":"turn.completed"}),
        )
        .unwrap();
    let rows: Vec<(String, String)> = db
        .prepare("SELECT thread_id, summary FROM agent_thread_activities ORDER BY rowid")
        .unwrap()
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
        .unwrap()
        .map(Result::unwrap)
        .collect();
    assert_eq!(
        rows,
        [
            ("thread-a".into(), "current".into()),
            ("thread-a".into(), "Turn completed — ready for input".into())
        ]
    );
}

#[test]
fn stop_fences_callback_and_cannot_reopen_before_or_after_join() {
    let db = db();
    let mut owner = ThreadEventOwner::new("thread-a".into(), "provider-a".into()).unwrap();
    let token = owner.begin_turn().unwrap();
    assert_eq!(owner.stop(), Cancellation::CancelTurn(token));
    assert!(!owner.ready_to_cleanup());
    assert_eq!(owner
        .dispatch(
            &db,
            token,
            &json!({"sessionId":"provider-a","type":"message","role":"assistant","content":"late"})
        )
        .unwrap(), ProviderEventDispatch::Stale);
    assert_eq!(owner.begin_turn(), Err(LifecycleError::Stopping));
    owner.finish_turn(token).unwrap();
    assert!(owner.ready_to_cleanup());
    assert_eq!(owner.begin_turn(), Err(LifecycleError::Stopping));
    assert_eq!(
        db.query_row("SELECT COUNT(*) FROM agent_thread_activities", [], |r| r
            .get::<_, i64>(0))
            .unwrap(),
        0
    );
}

#[test]
fn nonterminal_finish_discards_context_before_the_next_turn() {
    let db = db();
    let mut owner = ThreadEventOwner::new("thread-a".into(), "provider-a".into()).unwrap();
    let old = owner.begin_turn().unwrap();
    owner
        .dispatch(
            &db,
            old,
            &json!({"sessionId":"provider-a","type":"activity","kind":"context_flow","summary":"abandoned"}),
        )
        .unwrap();
    owner.finish_turn(old).unwrap();
    let new = owner.begin_turn().unwrap();
    owner
        .dispatch(
            &db,
            new,
            &json!({"sessionId":"provider-a","type":"turn.completed"}),
        )
        .unwrap();
    let rows: Vec<String> = db
        .prepare("SELECT summary FROM agent_thread_activities ORDER BY rowid")
        .unwrap()
        .query_map([], |r| r.get(0))
        .unwrap()
        .map(Result::unwrap)
        .collect();
    assert_eq!(rows, ["Turn completed — ready for input"]);
}

#[test]
fn owner_rejects_foreign_and_replaced_provider_sessions() {
    let db = db();
    let mut owner = ThreadEventOwner::new("thread-a".into(), "provider-a".into()).unwrap();
    let token = owner.begin_turn().unwrap();
    let wrong =
        json!({"sessionId":"provider-b","type":"message","role":"assistant","content":"wrong"});
    assert_eq!(
        owner.dispatch(&db, token, &wrong).unwrap(),
        ProviderEventDispatch::Stale
    );
    db.execute(
        "UPDATE agent_threads SET provider_session_id = 'provider-b' WHERE id = 'thread-a'",
        [],
    )
    .unwrap();
    let old = json!({"sessionId":"provider-a","type":"message","role":"assistant","content":"old"});
    assert_eq!(
        owner.dispatch(&db, token, &old).unwrap(),
        ProviderEventDispatch::Stale
    );
    assert_eq!(
        db.query_row("SELECT COUNT(*) FROM agent_thread_activities", [], |r| r
            .get::<_, i64>(0))
            .unwrap(),
        0
    );
}
