//! Delivers consent queue transitions to WebSocket clients.
//!
//! Frames go through `broadcast_to_session`, so only clients that are bound to the request's
//! session and still authorized for it receive them. The Node gateway broadcast to everyone;
//! this does not. Pending requests are replayed at bridge startup. Lag recovery remains
//! incomplete: a pending-only replay cannot restore missed decisions, and re-subscribing
//! after that replay can miss a transition. Clients need a separate reconciliation path.
use crate::{
    security::consent_manager::{ConsentManager, ConsentQueueEvent},
    ws::WsHub,
};
use serde_json::json;
use std::sync::Arc;
use tokio::sync::broadcast::error::RecvError;

pub fn spawn(consent: ConsentManager, hub: Arc<WsHub>) -> Result<(), &'static str> {
    // Subscribe before returning: a request can arrive before the spawned task
    // receives its first poll. The manager captures this snapshot and receiver
    // under the same queue lock, so later transitions are retained by `events`.
    let mut shutdown = hub.shutdown_receiver();
    if hub.is_stopped() {
        return Err("websocket hub stopped");
    }
    let (initial, mut events) = consent.try_subscribe_pending_changes()?;
    tokio::spawn(async move {
        let initial_order = hub.consent_order.lock().await;
        for identity in initial {
            if let Some(pending) = consent.get_request(&identity.id) {
                let request = pending.snapshot();
                if request.status == crate::security::consent_manager::ConsentStatus::Pending {
                    hub.broadcast_to_session(
                        &request.session_id,
                        "consent.required",
                        json!(request),
                    );
                }
            }
        }
        drop(initial_order);
        loop {
            loop {
                let event = tokio::select! {
                    _ = shutdown.recv() => return,
                    event = events.recv() => event,
                };
                let _order = hub.consent_order.lock().await;
                match event {
                    Ok(ConsentQueueEvent::Required(request)) => {
                        // A queued older request must not resurrect a request
                        // already resolved before a newer snapshot was sent.
                        if consent.get_request(&request.id).is_none() {
                            continue;
                        }
                        hub.broadcast_to_session(
                            &request.session_id,
                            "consent.required",
                            json!(request.as_ref()),
                        );
                    }
                    Ok(ConsentQueueEvent::Resolved {
                        session_id,
                        decision,
                    }) => {
                        hub.broadcast_to_session(
                            &session_id,
                            "consent.resolved",
                            json!(decision.as_ref()),
                        );
                    }
                    Ok(ConsentQueueEvent::SnapshotRequired) | Err(RecvError::Lagged(_)) => {
                        for pending in consent.list_pending(None) {
                            let request = pending.snapshot();
                            hub.broadcast_to_session(
                                &request.session_id,
                                "consent.required",
                                json!(request),
                            );
                        }
                        break;
                    }
                    Err(RecvError::Closed) => return,
                }
            }
            drop(events);
            let Ok((_, receiver)) = consent.try_subscribe_pending_changes() else {
                return;
            };
            events = receiver;
        }
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        security::{
            consent_manager::{ConsentRequestPolicy, RequestConsent},
            contracts::Risk,
            tool_permissions::{ConsentLevel, PolicySource},
        },
        ws::{
            OpCode, StaticTokenVerifier, WsAuthorizer, WsHubConfig, WsIdentity, read_frame,
            write_client_frame,
        },
    };
    use std::time::Duration;
    use tokio::io::{AsyncWriteExt, DuplexStream};

    struct SessionAuthority;
    impl WsAuthorizer for SessionAuthority {
        fn can_access_session(&self, user: &str, session: &str) -> Result<bool, String> {
            Ok(user == "owner" && session == "session")
        }
        fn can_access_resource(&self, _: &str, _: &str) -> Result<bool, String> {
            Ok(false)
        }
    }

    fn request(action: &str) -> RequestConsent {
        RequestConsent {
            action_id: action.into(),
            tool_name: "terminal.run".into(),
            summary: "approve".into(),
            preview: Default::default(),
            risk: Risk::High,
            policy: ConsentRequestPolicy {
                consent_level: ConsentLevel::Always,
                description: "fixture".into(),
                known_tool: true,
                source: PolicySource::Profile,
            },
            session_id: "session".into(),
            timeout_ms: None,
        }
    }

    async fn next(client: &mut DuplexStream) -> serde_json::Value {
        let frame = tokio::time::timeout(Duration::from_secs(3), read_frame(client, 1 << 20))
            .await
            .unwrap()
            .unwrap()
            .unwrap();
        serde_json::from_slice(&frame.payload).unwrap()
    }

    #[tokio::test]
    async fn startup_fails_when_subscription_capacity_is_exhausted() {
        let consent = ConsentManager::default();
        let receivers: Vec<_> = (0..128)
            .map(|_| consent.try_subscribe_pending_changes().unwrap().1)
            .collect();
        let hub = Arc::new(WsHub::new(WsHubConfig::default()));
        assert_eq!(
            spawn(consent.clone(), hub.clone()),
            Err("consent subscriber limit reached")
        );
        drop(receivers);
        assert_eq!(spawn(consent, hub.clone()), Ok(()));
        hub.stop();
    }

    #[tokio::test]
    async fn startup_rejects_stopped_hub() {
        let hub = Arc::new(WsHub::new(WsHubConfig::default()));
        hub.stop();
        assert_eq!(
            spawn(ConsentManager::default(), hub),
            Err("websocket hub stopped")
        );
    }

    #[tokio::test(flavor = "current_thread")]
    async fn queued_resolved_request_cannot_reappear_after_snapshot() {
        let consent = ConsentManager::default();
        let verifier = StaticTokenVerifier::new().with_token(
            "fixture",
            WsIdentity {
                user_id: "owner".into(),
                session_id: Some("session".into()),
                expires_at: u64::MAX,
            },
        );
        let hub = Arc::new(WsHub::new(WsHubConfig {
            token_verifier: Arc::new(verifier),
            authorizer: Some(Arc::new(SessionAuthority)),
            pending_consents: Some(consent.clone()),
            ..Default::default()
        }));
        let (server, mut client) = tokio::io::duplex(1 << 16);
        let task_hub = hub.clone();
        let connection = tokio::spawn(async move {
            task_hub
                .serve_upgraded(server, Some("fixture".into()))
                .await
        });
        assert_eq!(next(&mut client).await["type"], "session.created");
        write_client_frame(
            &mut client,
            OpCode::Text,
            br#"{"type":"subscribe","sessionId":"session"}"#,
            [1, 2, 3, 4],
        )
        .await
        .unwrap();
        assert_eq!(next(&mut client).await["payload"]["subscribed"], true);
        spawn(consent.clone(), hub.clone()).unwrap();
        // This runtime cannot poll the bridge between request and resolution.
        let request = consent.request_consent(request("queued")).unwrap();
        assert!(consent.approve(&request.id, None, None).unwrap());
        write_client_frame(
            &mut client,
            OpCode::Text,
            br#"{"type":"resource.subscribe","payload":{"resource":"root:/pending-consents"}}"#,
            [1, 2, 3, 4],
        )
        .await
        .unwrap();
        let first = next(&mut client).await;
        let second = next(&mut client).await;
        let kinds = [
            first["type"].as_str().unwrap(),
            second["type"].as_str().unwrap(),
        ];
        assert!(kinds.contains(&"consent.resolved"));
        assert!(kinds.contains(&"consent.pending-snapshot"));
        let snapshot = if first["type"] == "consent.pending-snapshot" {
            first
        } else {
            second
        };
        assert!(
            snapshot["payload"]["requests"]
                .as_array()
                .unwrap()
                .is_empty()
        );
        hub.stop();
        client.shutdown().await.unwrap();
        let _ = tokio::time::timeout(Duration::from_secs(3), connection)
            .await
            .unwrap();
    }

    #[tokio::test(flavor = "current_thread")]
    async fn startup_replays_pending_and_captures_transition_before_first_poll() {
        let verifier = StaticTokenVerifier::new().with_token(
            "fixture",
            WsIdentity {
                user_id: "owner".into(),
                session_id: Some("session".into()),
                expires_at: u64::MAX,
            },
        );
        let hub = Arc::new(WsHub::new(WsHubConfig {
            token_verifier: Arc::new(verifier),
            authorizer: Some(Arc::new(SessionAuthority)),
            ..Default::default()
        }));
        let (server, mut client) = tokio::io::duplex(1 << 16);
        let task_hub = hub.clone();
        let connection = tokio::spawn(async move {
            task_hub
                .serve_upgraded(server, Some("fixture".into()))
                .await
        });
        assert_eq!(next(&mut client).await["type"], "session.created");
        write_client_frame(
            &mut client,
            OpCode::Text,
            br#"{"type":"subscribe","sessionId":"session"}"#,
            [1, 2, 3, 4],
        )
        .await
        .unwrap();
        assert_eq!(next(&mut client).await["payload"]["subscribed"], true);
        let consent = ConsentManager::default();
        let old = consent.request_consent(request("before-start")).unwrap();
        spawn(consent.clone(), hub.clone()).unwrap();
        // The single-thread runtime cannot poll the bridge between these calls.
        let new = consent.request_consent(request("after-start")).unwrap();
        let first = next(&mut client).await;
        let second = next(&mut client).await;
        assert_eq!(first["type"], "consent.required");
        assert_eq!(first["payload"]["id"], old.id);
        assert_eq!(second["type"], "consent.required");
        assert_eq!(second["payload"]["id"], new.id);
        hub.stop();
        client.shutdown().await.unwrap();
        let _ = tokio::time::timeout(Duration::from_secs(3), connection)
            .await
            .unwrap();
    }
}
