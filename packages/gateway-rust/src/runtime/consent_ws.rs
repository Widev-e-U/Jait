//! Delivers consent queue transitions to WebSocket clients.
//!
//! Frames go through `broadcast_to_session`, so only clients that are bound to the request's
//! session and still authorized for it receive them. The Node gateway broadcast to everyone;
//! this does not. When the bridge lags or an event was too large to retain, every pending
//! request is sent again, since the UI treats `consent.required` as idempotent per id.
use crate::{
    security::consent_manager::{ConsentManager, ConsentQueueEvent},
    ws::WsHub,
};
use serde_json::json;
use std::sync::Arc;
use tokio::sync::broadcast::error::RecvError;

pub fn spawn(consent: ConsentManager, hub: Arc<WsHub>) {
    tokio::spawn(async move {
        let mut shutdown = hub.shutdown_receiver();
        loop {
            let Ok((_, mut events)) = consent.try_subscribe_pending_changes() else {
                return;
            };
            loop {
                let event = tokio::select! {
                    _ = shutdown.recv() => return,
                    event = events.recv() => event,
                };
                match event {
                    Ok(ConsentQueueEvent::Required(request)) => {
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
        }
    });
}
