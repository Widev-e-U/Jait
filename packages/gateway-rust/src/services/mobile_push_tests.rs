use super::*;
use std::num::NonZeroU16;
fn database() -> DatabaseWorker {
    let connection = rusqlite::Connection::open_in_memory().unwrap();
    connection.execute_batch("CREATE TABLE mobile_push_registrations(device_id TEXT PRIMARY KEY,user_id TEXT NOT NULL,token TEXT NOT NULL UNIQUE,platform TEXT,enabled INTEGER,created_at TEXT,updated_at TEXT,last_seen_at TEXT);").unwrap();
    DatabaseWorker::new(connection, NonZeroU16::new(16).unwrap()).unwrap()
}
fn service(transport: PushTransport) -> MobilePushService {
    MobilePushService::new(
        database(),
        Some(FirebaseServiceAccount {
            project_id: "fixture".into(),
            client_email: "fixture@example.test".into(),
            private_key: "unused test key".into(),
        }),
        transport,
        Arc::new(|| 0),
        BlockingLane::new(NonZeroU16::new(1).unwrap()),
    )
}
async fn cached(service: &MobilePushService) {
    *service.token.lock().await = Some(AccessToken {
        value: "fixture-token".into(),
        expires_at: 1_000_000,
    });
}
#[tokio::test]
async fn registration_is_owner_scoped_and_token_move_is_atomic() {
    let service = service(Arc::new(|_| {
        Box::pin(async { panic!("unexpected network effect") })
    }));
    service.register("phone", "alice", "old").await.unwrap();
    assert!(!service.unregister("phone", "bob").await.unwrap());
    assert!(service.list("bob").await.unwrap().is_empty());
    service.register("watch", "alice", "old").await.unwrap();
    let rows = service.list("alice").await.unwrap();
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].device_id, "watch");
    assert!(service.unregister("watch", "alice").await.unwrap());
}
#[tokio::test]
async fn stale_delivery_failure_cannot_delete_rotated_registration() {
    let entered = Arc::new(tokio::sync::Notify::new());
    let released = Arc::new(tokio::sync::Notify::new());
    let start = entered.clone();
    let finish = released.clone();
    let transport: PushTransport = Arc::new(move |request| {
        assert!(matches!(request.endpoint, PushEndpoint::Fcm { .. }));
        let start = start.clone();
        let finish = finish.clone();
        Box::pin(async move {
            start.notify_one();
            finish.notified().await;
            Ok(PushResponse {
                status: 404,
                body: Value::Null,
            })
        })
    });
    let service = Arc::new(service(transport));
    cached(&service).await;
    let old = service.register("phone", "alice", "old").await.unwrap();
    let pending = service.clone();
    let delivery = tokio::spawn(async move {
        pending
            .send_data(&old, BTreeMap::new(), Some("60s"), false)
            .await
    });
    tokio::time::timeout(Duration::from_secs(5), entered.notified())
        .await
        .unwrap();
    service.register("phone", "alice", "new").await.unwrap();
    released.notify_one();
    assert!(delivery.await.unwrap().is_err());
    let rows = service.list("alice").await.unwrap();
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].token, "new");
}
#[tokio::test]
async fn revoked_attention_excludes_resolving_device_and_preserves_payload() {
    let requests = Arc::new(std::sync::Mutex::new(Vec::new()));
    let captured = requests.clone();
    let service = service(Arc::new(move |request| {
        captured
            .lock()
            .unwrap()
            .push(serde_json::from_str::<Value>(&request.body).unwrap());
        Box::pin(async {
            Ok(PushResponse {
                status: 200,
                body: json!({}),
            })
        })
    }));
    cached(&service).await;
    service
        .register("phone", "alice", "phone-token")
        .await
        .unwrap();
    service
        .register("watch", "alice", "watch-token")
        .await
        .unwrap();
    service
        .register("other", "bob", "other-token")
        .await
        .unwrap();
    let event = AttentionCleared {
        key: "question:q".into(),
        kind: super::super::attention::AttentionKind::Question,
        request_id: "q".into(),
        session_id: "session".into(),
        user_id: Some("alice".into()),
        reason: super::super::attention::AttentionClearedReason::Answered,
        resolved_by: Some("phone".into()),
        cleared_at: "1970-01-01T00:00:00.000Z".into(),
    };
    service.send_attention_cleared(&event).await.unwrap();
    let calls = requests.lock().unwrap();
    assert_eq!(calls.len(), 1);
    assert_eq!(calls[0]["message"]["token"], "watch-token");
    assert_eq!(calls[0]["message"]["data"]["type"], "attention.cleared");
    assert_eq!(calls[0]["message"]["data"]["reason"], "answered");
    assert_eq!(calls[0]["message"]["android"]["ttl"], "60s");
}
