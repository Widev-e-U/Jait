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
async fn dropped_request_drops_host_future_and_releases_route_permit() {
    struct DropSignal(Option<tokio::sync::oneshot::Sender<()>>);
    impl Drop for DropSignal {
        fn drop(&mut self) {
            if let Some(sender) = self.0.take() {
                let _ = sender.send(());
            }
        }
    }
    let (started, ready) = tokio::sync::oneshot::channel();
    let (dropped, observed) = tokio::sync::oneshot::channel();
    let signals = Arc::new(std::sync::Mutex::new(Some((started, dropped))));
    let state = state().with_port(Arc::new(move |_, _| {
        let (started, dropped) = signals.lock().unwrap().take().unwrap();
        Box::pin(async move {
            let _drop_signal = DropSignal(Some(dropped));
            let _ = started.send(());
            std::future::pending().await
        })
    }));
    let retained = state.clone();
    let work =
        tokio::spawn(async move { state.invoke(call("owner", PreviewOperation::Restart)).await });
    tokio::time::timeout(Duration::from_secs(2), ready)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(retained.permits.available_permits(), 7);
    work.abort();
    let _ = work.await;
    tokio::time::timeout(Duration::from_secs(1), observed)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(retained.permits.available_permits(), 8);
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

#[tokio::test]
async fn successful_response_limit_includes_json_envelope() {
    // {"screenshot":"..."} adds 17 bytes to this ASCII payload.
    for (size, expected_status) in [(OUTPUT_LIMIT - 17, 200), (OUTPUT_LIMIT - 16, 502)] {
        let state = state().with_port(Arc::new(move |_, _| {
            Box::pin(async move { Ok(PreviewReply::Value(Value::String("x".repeat(size)))) })
        }));
        let response = state
            .invoke(call("owner", PreviewOperation::Screenshot))
            .await;
        assert_eq!(response.status(), expected_status);
        if expected_status == 200 {
            let bytes = to_bytes(response.into_body(), OUTPUT_LIMIT + 1)
                .await
                .unwrap();
            assert_eq!(bytes.len(), OUTPUT_LIMIT);
        } else {
            assert_eq!(
                body(response).await,
                json!({"error":"Preview response exceeds byte limit"})
            );
        }
        state.auth.shutdown().await.unwrap();
    }
}

#[tokio::test]
async fn history_route_validates_and_enforces_session_ownership() {
    use crate::{
        security::http_auth::{AuthUser, sign_auth_token},
        services::users::UserService,
    };
    use axum::{body::Body, http::Request};
    use tower::ServiceExt;

    let db = rusqlite::Connection::open_in_memory().unwrap();
    crate::db::migrate_database(&db).unwrap();
    let owner = UserService::new(&db)
        .create_user_with_hash("preview-owner", "hash")
        .unwrap();
    let other = UserService::new(&db)
        .create_user_with_hash("preview-other", "hash")
        .unwrap();
    db.execute("INSERT INTO sessions (id, user_id, created_at, last_active_at, status) VALUES ('history-session', ?1, 'now', 'now', 'active')", [&owner.id]).unwrap();
    let secret = "a-secret-with-32-characters-minimum";
    let token = |user: &crate::services::users::UserRecord| {
        sign_auth_token(
            &AuthUser {
                id: user.id.clone(),
                username: user.username.clone(),
            },
            secret,
        )
        .unwrap()
    };
    let owner_token = token(&owner);
    let other_token = token(&other);
    let calls = Arc::new(std::sync::Mutex::new(Vec::new()));
    let observed = calls.clone();
    let auth = AuthState::new(db, secret.into()).unwrap();
    let state = PreviewRoutes::new(auth.clone()).with_port(Arc::new(move |call, _| {
        observed.lock().unwrap().push(call.operation);
        Box::pin(async { Ok(PreviewReply::Value(json!({"id":"live"}))) })
    }));
    let router = state.router();
    let request = |token: &str, value: Value| {
        Request::builder()
            .method("POST")
            .uri("/api/preview/history")
            .header("authorization", format!("Bearer {token}"))
            .header("content-type", "application/json")
            .body(Body::from(value.to_string()))
            .unwrap()
    };
    for direction in ["back", "forward"] {
        let response = router
            .clone()
            .oneshot(request(
                &owner_token,
                json!({"sessionId":"history-session","direction":direction}),
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), 200);
        assert_eq!(body(response).await, json!({"session":{"id":"live"}}));
    }
    for value in [
        json!({"sessionId":"history-session","direction":"sideways"}),
        json!({"sessionId":"history-session","direction":"back","extra":true}),
        json!({"sessionId":"history-session"}),
    ] {
        assert_eq!(
            router
                .clone()
                .oneshot(request(&owner_token, value))
                .await
                .unwrap()
                .status(),
            400
        );
    }
    assert_eq!(
        router
            .clone()
            .oneshot(request(
                &other_token,
                json!({"sessionId":"history-session","direction":"back"})
            ))
            .await
            .unwrap()
            .status(),
        404
    );
    assert_eq!(
        *calls.lock().unwrap(),
        vec![
            PreviewOperation::History {
                direction: HistoryDirection::Back
            },
            PreviewOperation::History {
                direction: HistoryDirection::Forward
            }
        ]
    );
    auth.shutdown().await.unwrap();
}

#[tokio::test]
async fn history_error_messages_are_scoped_and_bounded() {
    let history = || PreviewOperation::History {
        direction: HistoryDirection::Back,
    };
    let state = state().with_port(Arc::new(|_, _| {
        Box::pin(async { Err(PreviewFailure::HistoryMessage("navigation failed".into())) })
    }));
    let response = state.invoke(call("owner", history())).await;
    assert_eq!(response.status(), 400);
    assert_eq!(body(response).await, json!({"error":"navigation failed"}));
    let response = state.invoke(call("owner", PreviewOperation::Reload)).await;
    assert_eq!(response.status(), 500);
    assert_eq!(
        body(response).await,
        json!({"error":"Preview operation failed"})
    );
    let state = state.with_port(Arc::new(|_, _| {
        Box::pin(async { Err(PreviewFailure::HistoryMessage("x".repeat(OUTPUT_LIMIT))) })
    }));
    let response = state.invoke(call("owner", history())).await;
    assert_eq!(response.status(), 502);
    assert_eq!(
        body(response).await,
        json!({"error":"Preview response exceeds byte limit"})
    );
    state.auth.shutdown().await.unwrap();
}

#[tokio::test]
async fn navigate_and_reload_errors_are_scoped_and_bounded() {
    let navigate = || PreviewOperation::Navigate {
        url: "http://localhost".into(),
    };
    for (operation, other, failure) in [
        (
            navigate(),
            PreviewOperation::Reload,
            PreviewFailure::NavigateMessage("navigation detail".into()),
        ),
        (
            PreviewOperation::Reload,
            navigate(),
            PreviewFailure::ReloadMessage("reload detail".into()),
        ),
    ] {
        let state = state().with_port(Arc::new(move |_, _| {
            let failure = failure.clone();
            Box::pin(async move { Err(failure) })
        }));
        let response = state.invoke(call("owner", operation)).await;
        assert_eq!(response.status(), 400);
        assert!(
            body(response).await["error"]
                .as_str()
                .unwrap()
                .ends_with(" detail")
        );
        let response = state.invoke(call("owner", other)).await;
        assert_eq!(response.status(), 500);
        assert_eq!(
            body(response).await,
            json!({"error":"Preview operation failed"})
        );
        state.auth.shutdown().await.unwrap();
    }
    let state = state().with_port(Arc::new(|_, _| {
        Box::pin(async { Err(PreviewFailure::ReloadMessage("x".repeat(OUTPUT_LIMIT))) })
    }));
    assert_eq!(
        state
            .invoke(call("owner", PreviewOperation::Reload))
            .await
            .status(),
        502
    );
    let state = state.with_port(Arc::new(|_, _| {
        Box::pin(async { Err(PreviewFailure::Failed) })
    }));
    for (operation, expected) in [
        (navigate(), "Could not navigate."),
        (PreviewOperation::Reload, "Could not refresh."),
    ] {
        let response = state.invoke(call("owner", operation)).await;
        assert_eq!(response.status(), 400);
        assert_eq!(body(response).await, json!({"error":expected}));
    }
    state.auth.shutdown().await.unwrap();
}
