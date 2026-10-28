use super::*;
use axum::body::to_bytes;
use std::sync::atomic::{AtomicUsize, Ordering};
fn state() -> PreviewRoutes {
    let db = rusqlite::Connection::open_in_memory().unwrap();
    db.execute_batch("CREATE TABLE sessions(id TEXT,user_id TEXT,project_id TEXT,name TEXT,project_path TEXT,created_at TEXT,last_active_at TEXT,viewed_at TEXT,status TEXT,metadata TEXT);
    INSERT INTO sessions VALUES ('session','owner',NULL,NULL,NULL,'now','now','now','active',NULL);").unwrap();
    PreviewRoutes::new(AuthState::new(db, "a-secret-with-32-characters-minimum".into()).unwrap())
}
fn call(owner: &str, operation: PreviewOperation) -> PreviewCall {
    PreviewCall {
        owner_id: owner.into(),
        session_id: "session".into(),
        operation,
    }
}
async fn body(response: Response) -> Value {
    serde_json::from_slice(
        &to_bytes(response.into_body(), OUTPUT_LIMIT + 4096)
            .await
            .unwrap(),
    )
    .unwrap()
}
#[tokio::test]
async fn unowned_session_never_reaches_preview_effect() {
    let calls = Arc::new(AtomicUsize::new(0));
    let count = calls.clone();
    let state = state().with_port(Arc::new(move |_, _| {
        count.fetch_add(1, Ordering::SeqCst);
        Box::pin(async { Ok(PreviewReply::Value(Value::Null)) })
    }));
    assert_eq!(
        state
            .invoke(call("other", PreviewOperation::Screenshot))
            .await
            .status(),
        404
    );
    assert_eq!(calls.load(Ordering::SeqCst), 0);
    state.auth.shutdown().await.unwrap();
}
#[tokio::test]
async fn backend_is_explicit_and_suppression_has_no_content() {
    let state = state();
    assert_eq!(
        state
            .invoke(call("owner", PreviewOperation::Screenshot))
            .await
            .status(),
        503
    );
    let state = state.with_port(Arc::new(|call, _| {
        Box::pin(async move {
            assert!(matches!(call.operation, PreviewOperation::Inspect { .. }));
            Ok(PreviewReply::Suppressed)
        })
    }));
    assert_eq!(
        body(
            state
                .invoke(call(
                    "owner",
                    PreviewOperation::Inspect {
                        selector: Some("body".into())
                    }
                ))
                .await
        )
        .await,
        json!({"inspect":null,"suppressed":true})
    );
    state.auth.shutdown().await.unwrap();
}
#[tokio::test]
async fn dropping_request_cancels_owned_backend_effect() {
    let (started, ready) = tokio::sync::oneshot::channel();
    let sender = Arc::new(std::sync::Mutex::new(Some(started)));
    let state = state().with_port(Arc::new(move |_, cancellation| {
        sender
            .lock()
            .unwrap()
            .take()
            .unwrap()
            .send(cancellation)
            .unwrap_or_else(|_| panic!("cancellation receiver dropped"));
        Box::pin(std::future::pending())
    }));
    let retained = state.clone();
    let work =
        tokio::spawn(async move { state.invoke(call("owner", PreviewOperation::Restart)).await });
    let cancellation = tokio::time::timeout(Duration::from_secs(2), ready)
        .await
        .unwrap()
        .unwrap();
    assert!(!cancellation.is_cancelled());
    work.abort();
    let _ = work.await;
    tokio::time::timeout(Duration::from_secs(1), cancellation.wait_cancelled())
        .await
        .unwrap();
    retained.auth.shutdown().await.unwrap();
}
#[tokio::test]
async fn missing_session_mapping_and_output_cap_are_preserved() {
    let state = state().with_port(Arc::new(|_, _| {
        Box::pin(async { Ok(PreviewReply::Value(Value::Null)) })
    }));
    assert_eq!(
        state
            .invoke(call("owner", PreviewOperation::Restart))
            .await
            .status(),
        404
    );
    assert_eq!(
        body(state.invoke(call("owner", PreviewOperation::Session)).await).await,
        json!({"session":null})
    );
    let state = state.with_port(Arc::new(|_, _| {
        Box::pin(async { Ok(PreviewReply::Value(Value::String("x".repeat(OUTPUT_LIMIT)))) })
    }));
    assert_eq!(
        state
            .invoke(call("owner", PreviewOperation::Screenshot))
            .await
            .status(),
        502
    );
    state.auth.shutdown().await.unwrap();
}
