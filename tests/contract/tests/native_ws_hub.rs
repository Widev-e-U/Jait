//! Contract tests for the native websocket hub (`packages/gateway-rust/src/ws.rs`,
//! ported from `packages/gateway/src/ws.ts`).
//!
//! Every test drives the public `jait_gateway::ws` API only: the real
//! `WsHub::serve_connection` handshake/state machine over a duplex transport, the
//! real frame codec, the real token verifier boundary (`StaticTokenVerifier`) and
//! the real envelope/fan-out logic.

use std::sync::Arc;
use std::time::Duration;

use jait_gateway::ws::{
    CLOSE_GOING_AWAY, CLOSE_UNAUTHORIZED, Frame, OpCode, StaticTokenVerifier, WsHub, WsHubConfig,
    WsIdentity, read_frame,
};
use serde_json::{Value, json};
use tokio::io::{AsyncReadExt, AsyncWriteExt, DuplexStream};

/// RFC 6455 example key/accept pair, used to pin the handshake digest.
const RFC_KEY: &str = "dGhlIHNhbXBsZSBub25jZQ==";
const RFC_ACCEPT: &str = "s3pPLMBiTxaQ9kYGzzhZRbK+xOo=";
const MASK: [u8; 4] = [0x37, 0xfa, 0x21, 0x3d];

struct WsClient {
    io: DuplexStream,
}

impl WsClient {
    /// Open a socket against `hub` and complete the upgrade handshake.
    async fn open(hub: &Arc<WsHub>, target: &str) -> (Self, String) {
        let mut headers = format!(
            "GET {target} HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\n\
             Connection: Upgrade\r\nSec-WebSocket-Key: {RFC_KEY}\r\n\
             Sec-WebSocket-Version: 13\r\n"
        );
        headers.push_str("\r\n");
        Self::open_raw(hub, &headers).await
    }

    /// Open with an `Authorization: Bearer` header instead of a query token.
    async fn open_bearer(hub: &Arc<WsHub>, target: &str, token: &str) -> (Self, String) {
        let request = format!(
            "GET {target} HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\n\
             Connection: Upgrade\r\nSec-WebSocket-Key: {RFC_KEY}\r\n\
             Sec-WebSocket-Version: 13\r\nAuthorization: Bearer {token}\r\n\r\n"
        );
        Self::open_raw(hub, &request).await
    }

    async fn open_raw(hub: &Arc<WsHub>, request: &str) -> (Self, String) {
        let (mut io, server_io) = tokio::io::duplex(64 * 1024);
        let hub = Arc::clone(hub);
        tokio::spawn(async move {
            let _ = hub.serve_connection(server_io).await;
        });
        io.write_all(request.as_bytes())
            .await
            .expect("write request");
        io.flush().await.expect("flush request");
        let response = read_response_headers(&mut io).await;
        (Self { io }, response)
    }

    async fn send_masked(&mut self, opcode: u8, payload: &[u8]) {
        assert!(payload.len() < 126, "test helper only masks short frames");
        let mut frame = vec![0x80 | opcode, 0x80 | payload.len() as u8];
        frame.extend_from_slice(&MASK);
        for (index, byte) in payload.iter().enumerate() {
            frame.push(byte ^ MASK[index % 4]);
        }
        self.io.write_all(&frame).await.expect("write frame");
        self.io.flush().await.expect("flush frame");
    }

    async fn send_text(&mut self, text: &str) {
        self.send_masked(0x1, text.as_bytes()).await;
    }

    async fn send_json(&mut self, value: Value) {
        self.send_text(&value.to_string()).await;
    }

    async fn send_protocol_ping(&mut self, payload: &[u8]) {
        self.send_masked(0x9, payload).await;
    }

    async fn send_close(&mut self, code: u16) {
        // 0x8 is Close; 0xa would be Pong and never reaches the close arm.
        self.send_masked(0x8, &code.to_be_bytes()).await;
    }

    /// Read the next frame, or `None` when the peer closed the socket.
    async fn recv(&mut self) -> Option<Frame> {
        tokio::time::timeout(Duration::from_secs(5), read_frame(&mut self.io, 1 << 20))
            .await
            .expect("frame within timeout")
            .expect("valid frame")
    }

    /// Read frames until a text envelope arrives (skipping heartbeat pings).
    async fn recv_json(&mut self) -> Value {
        loop {
            let frame = self.recv().await.expect("envelope before close");
            match frame.opcode {
                OpCode::Text => {
                    let text = frame.text().expect("utf-8 text frame");
                    return serde_json::from_str(text).expect("json envelope");
                }
                OpCode::Ping | OpCode::Pong => continue,
                other => panic!("unexpected frame before envelope: {other:?}"),
            }
        }
    }

    /// Read frames until a control frame of `opcode` arrives.
    async fn recv_control(&mut self, opcode: OpCode) -> Frame {
        loop {
            let frame = self.recv().await.expect("control frame before close");
            if frame.opcode == opcode {
                return frame;
            }
        }
    }

    /// Drain until the peer closes; returns the close frame if one was sent.
    async fn drain_to_close(&mut self) -> Option<Frame> {
        loop {
            match self.recv().await {
                None => return None,
                Some(frame) if frame.opcode == OpCode::Close => return Some(frame),
                Some(_) => continue,
            }
        }
    }
}

async fn read_response_headers(io: &mut DuplexStream) -> String {
    let mut out = Vec::new();
    let mut byte = [0u8; 1];
    while out.len() < 8192 {
        let read = io.read(&mut byte).await.expect("read response");
        if read == 0 {
            break;
        }
        out.push(byte[0]);
        if out.ends_with(b"\r\n\r\n") {
            break;
        }
    }
    String::from_utf8(out).expect("ascii response")
}

fn authenticated_hub(token: &str, session: &str) -> Arc<WsHub> {
    let verifier = StaticTokenVerifier::new().with_token(
        token,
        WsIdentity {
            user_id: "user-1".into(),
            session_id: Some(session.into()),
            expires_at: u64::MAX,
        },
    );
    let mut config = WsHubConfig::default();
    config.token_verifier = Arc::new(verifier);
    Arc::new(WsHub::new(config))
}

fn fast_heartbeat_hub() -> Arc<WsHub> {
    let mut config = WsHubConfig::default();
    config.heartbeat_interval = Duration::from_millis(20);
    config.heartbeat_timeout = Duration::from_millis(80);
    Arc::new(WsHub::new(config))
}

async fn wait_for(condition: impl Fn() -> bool) -> bool {
    for _ in 0..200 {
        if condition() {
            return true;
        }
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
    condition()
}

#[tokio::test]
async fn hub_is_constructed_with_default_config_and_no_clients() {
    let hub = WsHub::new(WsHubConfig::default());
    assert_eq!(hub.config().path, "/ws");
    assert_eq!(hub.client_count(), 0);
    assert!(!hub.is_stopped());
    assert!(hub.clients().is_empty());
}

#[tokio::test]
async fn handshake_accepts_upgrade_and_announces_unauthenticated_client() {
    let hub = Arc::new(WsHub::new(WsHubConfig::default()));
    let (mut client, response) = WsClient::open(&hub, "/ws").await;

    assert!(
        response.starts_with("HTTP/1.1 101 Switching Protocols"),
        "unexpected handshake response: {response}"
    );
    assert!(
        response.contains(&format!("Sec-WebSocket-Accept: {RFC_ACCEPT}")),
        "accept digest mismatch: {response}"
    );
    assert!(response.contains("Upgrade: websocket"));
    assert!(response.contains("Connection: Upgrade"));

    let envelope = client.recv_json().await;
    assert_eq!(envelope["type"], "session.created");
    assert_eq!(envelope["sessionId"], "");
    assert_eq!(envelope["payload"]["authenticated"], false);
    let client_id = envelope["payload"]["clientId"]
        .as_str()
        .expect("client id in connected envelope");
    assert!(!client_id.is_empty());
    assert!(envelope["timestamp"].is_string());

    assert_eq!(hub.client_count(), 1);
    let snapshot = hub.clients().pop().expect("one client snapshot");
    assert_eq!(snapshot.id, client_id);
    assert!(!snapshot.authenticated);
    assert!(snapshot.user_id.is_none());
    assert!(snapshot.subscriptions.is_empty());
    assert_eq!(snapshot.dropped, 0);
}

#[tokio::test]
async fn handshake_rejects_foreign_path_and_non_upgrade_requests() {
    let hub = Arc::new(WsHub::new(WsHubConfig::default()));

    let (_client, response) = WsClient::open(&hub, "/elsewhere").await;
    assert!(
        !response.contains(" 101 "),
        "path must be rejected: {response}"
    );

    let request =
        format!("GET /ws HTTP/1.1\r\nHost: localhost\r\nSec-WebSocket-Key: {RFC_KEY}\r\n\r\n");
    let (_plain, plain_response) = WsClient::open_raw(&hub, &request).await;
    assert!(
        !plain_response.contains(" 101 "),
        "non-upgrade request must be rejected: {plain_response}"
    );

    assert!(wait_for(|| hub.client_count() == 0).await);
}

#[tokio::test]
async fn query_token_binds_identity_but_not_a_session() {
    let hub = authenticated_hub("secret", "sess-1");
    let (mut client, response) = WsClient::open(&hub, "/ws?token=secret").await;
    assert!(response.starts_with("HTTP/1.1 101"), "{response}");

    let envelope = client.recv_json().await;
    assert_eq!(envelope["type"], "session.created");
    assert_eq!(envelope["payload"]["authenticated"], true);
    // Reference shape is `{ clientId, authenticated }`; identity is not echoed.
    assert!(envelope["payload"].get("userId").is_none(), "{envelope}");
    // The reference greeting frame carries `sessionId: ""` on the envelope even when
    // the handshake bound a session; the binding is observable only server-side.
    assert_eq!(envelope["sessionId"], "", "{envelope}");

    let snapshot = hub.clients().pop().expect("client snapshot");
    assert!(snapshot.authenticated);
    assert_eq!(snapshot.user_id.as_deref(), Some("user-1"));
    // `authenticateClient` (`ws.ts` L388) only clears `sessionId`; the single binding
    // site in the reference is `case "subscribe"` (`ws.ts` L514). A handshake token
    // therefore identifies the client but leaves it unsubscribed.
    assert_eq!(
        snapshot.session_id, None,
        "handshake must not bind a session"
    );
}

#[tokio::test]
async fn bearer_header_token_is_accepted_and_bad_tokens_stay_unauthenticated() {
    let hub = authenticated_hub("secret", "sess-1");
    let (mut client, _) = WsClient::open_bearer(&hub, "/ws", "secret").await;
    let envelope = client.recv_json().await;
    assert_eq!(envelope["type"], "session.created");
    // Reference shape is `{ clientId, authenticated }`; identity is not echoed.
    assert!(envelope["payload"].get("userId").is_none(), "{envelope}");
    assert_eq!(envelope["payload"]["authenticated"], true);

    let mut bad_config = WsHubConfig::default();
    bad_config.token_verifier = Arc::new(StaticTokenVerifier::new());
    let bad_hub = Arc::new(WsHub::new(bad_config));
    // Reference `authenticateClient` failure path (`ws.ts` L401-407): one error frame
    // carrying code `UNAUTHORIZED`, immediately followed by `ws.close(4001)`. The
    // greeting frame is never reached, so no `session.created` may be observed.
    let (mut bad_client, bad_response) = WsClient::open(&bad_hub, "/ws?token=nope").await;
    assert!(bad_response.starts_with("HTTP/1.1 101"));
    let refused = bad_client.recv_json().await;
    assert_eq!(refused["type"], "error");
    assert_eq!(refused["payload"]["code"], "UNAUTHORIZED");
    let close = bad_client.recv_control(OpCode::Close).await;
    assert_eq!(close.close_code(), Some(CLOSE_UNAUTHORIZED));
    assert!(wait_for(|| bad_hub.client_count() == 0).await);
}

#[tokio::test]
async fn unauthenticated_client_is_denied_with_error_frame_and_not_closed() {
    let hub = Arc::new(WsHub::new(WsHubConfig::default()));
    let (mut client, _) = WsClient::open(&hub, "/ws").await;
    assert_eq!(client.recv_json().await["type"], "session.created");

    client
        .send_json(json!({ "type": "resource.subscribe", "payload": { "resource": "terminal" } }))
        .await;

    let error = client.recv_json().await;
    assert_eq!(error["type"], "error");
    assert_eq!(error["payload"]["code"], "UNAUTHORIZED");

    // The reference `denyControl` path replies with an error frame only: it does not
    // close the socket, so a second denied request still produces a second reply.
    client
        .send_json(json!({ "type": "resource.subscribe", "payload": { "resource": "terminal" } }))
        .await;
    let again = client.recv_json().await;
    assert_eq!(again["type"], "error");
    assert_eq!(again["payload"]["code"], "UNAUTHORIZED");

    assert_eq!(hub.client_count(), 1);
}

#[tokio::test]
async fn message_authentication_then_subscribe_receives_session_fanout() {
    let hub = authenticated_hub("secret", "sess-1");
    let (mut client, _) = WsClient::open(&hub, "/ws").await;
    assert_eq!(client.recv_json().await["type"], "session.created");

    // The reference `case "authenticate"` reads `msg.token` at the top level of the
    // frame; a token nested under `payload` is never consulted.
    client
        .send_json(json!({ "type": "authenticate", "token": "secret" }))
        .await;
    let ack = client.recv_json().await;
    assert_eq!(ack["type"], "session.created");
    assert_eq!(ack["payload"]["authenticated"], true);
    assert_eq!(ack["sessionId"], "", "{ack}");

    // The reference serves registry snapshots for known root resources only; every
    // other resource is rejected with this exact message, carrying no machine code,
    // and records no subscription (documented divergence: no registry snapshots).
    client
        .send_json(json!({
            "type": "resource.subscribe",
            "sessionId": "sess-1",
            "payload": { "resource": "terminal", "id": "term-9" }
        }))
        .await;
    let rejected = client.recv_json().await;
    assert_eq!(rejected["type"], "error");
    assert_eq!(rejected["payload"]["message"], "Unknown resource: terminal");
    assert!(rejected["payload"].get("code").is_none());

    // `case "subscribe"` (`ws.ts` L514) is the reference's only `client.sessionId`
    // binding site; it binds the requested session and acknowledges it.
    client
        .send_json(json!({ "type": "subscribe", "sessionId": "sess-1" }))
        .await;
    let bound = client.recv_json().await;
    assert_eq!(bound["type"], "session.created");
    assert_eq!(bound["payload"]["subscribed"], true);
    assert_eq!(bound["sessionId"], "sess-1");

    let snapshot = hub.clients().pop().expect("client snapshot");
    assert!(snapshot.subscriptions.is_empty());

    let delivered = hub.broadcast_to_session(
        "sess-1",
        "terminal.output",
        json!({ "terminalId": "term-9", "data": "hello" }),
    );
    assert_eq!(delivered, 1);
    let update = client.recv_json().await;
    assert_eq!(update["type"], "terminal.output");
    assert_eq!(update["sessionId"], "sess-1");
    assert_eq!(update["payload"]["data"], "hello");

    // No other session receives the fan-out.
    assert_eq!(
        hub.broadcast_to_session("sess-2", "terminal.output", json!({})),
        0
    );

    // `resource.unsubscribe` is bookkeeping only and emits no acknowledgement, so the
    // next frame on the wire must be the reply to the message sent after it.
    client
        .send_json(json!({
            "type": "resource.unsubscribe",
            "payload": { "resource": "terminal", "id": "term-9" }
        }))
        .await;
    client.send_json(json!({ "type": "totally.unknown" })).await;
    let after = client.recv_json().await;
    assert_eq!(
        after["payload"]["message"],
        "Unknown message type: totally.unknown"
    );
    assert!(
        hub.clients()
            .pop()
            .expect("snapshot")
            .subscriptions
            .is_empty()
    );
}

#[tokio::test]
async fn authenticate_message_with_bad_token_closes_with_4001() {
    let mut config = WsHubConfig::default();
    config.token_verifier = Arc::new(StaticTokenVerifier::new().with_token(
        "good",
        WsIdentity {
            user_id: "user-1".into(),
            session_id: None,
            expires_at: u64::MAX,
        },
    ));
    let hub = Arc::new(WsHub::new(config));
    let (mut client, _) = WsClient::open(&hub, "/ws").await;
    assert_eq!(client.recv_json().await["type"], "session.created");

    client
        .send_json(json!({ "type": "authenticate", "token": "bad" }))
        .await;
    let denial = client.recv_json().await;
    assert_eq!(denial["type"], "error");
    assert_eq!(denial["payload"]["code"], "UNAUTHORIZED");

    let close = client.recv_control(OpCode::Close).await;
    assert_eq!(close.close_code(), Some(CLOSE_UNAUTHORIZED));
    assert!(wait_for(|| hub.client_count() == 0).await);
}

#[tokio::test]
async fn protocol_ping_is_answered_with_pong_frame() {
    let hub = Arc::new(WsHub::new(WsHubConfig::default()));
    let (mut client, _) = WsClient::open(&hub, "/ws").await;
    assert_eq!(client.recv_json().await["type"], "session.created");

    client.send_protocol_ping(b"keepalive").await;
    let pong = client.recv_control(OpCode::Pong).await;
    assert_eq!(pong.payload, b"keepalive");
    assert_eq!(hub.client_count(), 1);
}

#[tokio::test]
async fn unknown_message_types_report_reference_error_and_keep_the_socket() {
    let hub = authenticated_hub("secret", "sess-1");
    let (mut client, _) = WsClient::open(&hub, "/ws?token=secret").await;
    assert_eq!(client.recv_json().await["type"], "session.created");

    client.send_json(json!({ "type": "ping" })).await;
    let pong = client.recv_json().await;
    assert_eq!(pong["type"], "error");
    assert_eq!(pong["payload"]["message"], "Unknown message type: ping");
    assert!(pong["payload"].get("code").is_none());

    client.send_json(json!({ "type": "totally.unknown" })).await;
    let error = client.recv_json().await;
    assert_eq!(error["type"], "error");
    assert_eq!(
        error["payload"]["message"],
        "Unknown message type: totally.unknown"
    );
    assert!(error["payload"].get("code").is_none());

    // The connection survives both replies.
    assert_eq!(hub.client_count(), 1);
}

#[tokio::test]
async fn malformed_messages_are_reported_without_dropping_the_socket() {
    let hub = authenticated_hub("secret", "sess-1");
    let (mut client, _) = WsClient::open(&hub, "/ws?token=secret").await;
    assert_eq!(client.recv_json().await["type"], "session.created");

    client.send_text("{not json").await;
    let error = client.recv_json().await;
    assert_eq!(error["type"], "error");
    assert_eq!(error["payload"]["message"], "Invalid JSON");
    assert!(error["payload"].get("code").is_none(), "{error}");

    // A frame with no `type` falls through the reference dispatch to the default arm.
    client.send_json(json!({ "payload": {} })).await;
    let error = client.recv_json().await;
    assert_eq!(error["type"], "error");
    assert!(
        error["payload"]["message"]
            .as_str()
            .is_some_and(|m| m.starts_with("Unknown message type")),
        "{error}"
    );

    // An authenticated subscribe with no `resource` is a validation error, not a close.
    client
        .send_json(json!({ "type": "resource.subscribe", "payload": {} }))
        .await;
    let error = client.recv_json().await;
    assert_eq!(error["type"], "error");
    assert!(
        error["payload"]["message"]
            .as_str()
            .is_some_and(|m| !m.is_empty()),
        "{error}"
    );

    client.send_json(json!({ "type": "totally.unknown" })).await;
    let liveness = client.recv_json().await;
    assert_eq!(liveness["type"], "error");
    assert_eq!(
        liveness["payload"]["message"],
        "Unknown message type: totally.unknown"
    );
    assert_eq!(hub.client_count(), 1);
}

#[tokio::test]
async fn broadcasts_target_authenticated_clients_and_users() {
    let hub = authenticated_hub("secret", "sess-1");
    let (mut first, _) = WsClient::open(&hub, "/ws?token=secret").await;
    assert_eq!(first.recv_json().await["type"], "session.created");

    let mut guest_config = WsHubConfig::default();
    guest_config.token_verifier = Arc::new(StaticTokenVerifier::new());
    let guest_hub = Arc::new(WsHub::new(guest_config));
    let (mut guest, _) = WsClient::open(&guest_hub, "/ws").await;
    assert_eq!(guest.recv_json().await["type"], "session.created");

    assert_eq!(hub.broadcast_all("system.notice", json!({ "n": 1 })), 1);
    let notice = first.recv_json().await;
    assert_eq!(notice["type"], "system.notice");
    assert_eq!(notice["payload"]["n"], 1);

    assert_eq!(
        hub.broadcast_to_user("user-1", "user.notice", json!({ "n": 2 })),
        1
    );
    assert_eq!(first.recv_json().await["type"], "user.notice");

    assert_eq!(
        hub.broadcast_to_user("user-2", "user.notice", json!({ "n": 3 })),
        0
    );
    assert_eq!(guest_hub.broadcast_all("system.notice", json!({})), 0);
    assert_eq!(
        guest_hub.broadcast_to_user("user-1", "user.notice", json!({})),
        0
    );
}

#[tokio::test]
async fn client_close_unregisters_and_releases_the_socket() {
    let hub = authenticated_hub("secret", "sess-1");
    let (mut client, _) = WsClient::open(&hub, "/ws?token=secret").await;
    assert_eq!(client.recv_json().await["type"], "session.created");
    assert_eq!(hub.client_count(), 1);

    client.send_close(1000).await;
    // The reference close arm unregisters the client and drops the transport; it never
    // sends a Close frame back, so no echo is expected here.
    assert!(wait_for(|| hub.client_count() == 0).await);
    assert!(hub.clients().is_empty());
}

#[tokio::test]
async fn dropping_the_socket_without_close_still_unregisters_the_client() {
    let hub = authenticated_hub("secret", "sess-1");
    {
        let (mut client, _) = WsClient::open(&hub, "/ws?token=secret").await;
        assert_eq!(client.recv_json().await["type"], "session.created");
        assert_eq!(hub.client_count(), 1);
    }
    assert!(wait_for(|| hub.client_count() == 0).await);
}

#[tokio::test]
async fn heartbeat_pings_and_drops_silent_clients() {
    let hub = fast_heartbeat_hub();
    let (mut client, _) = WsClient::open(&hub, "/ws").await;
    assert_eq!(client.recv_json().await["type"], "session.created");

    // The hub must emit protocol pings on its own schedule.
    let ping = client.recv_control(OpCode::Ping).await;
    assert_eq!(ping.opcode, OpCode::Ping);

    // Never answer with a pong: the hub terminates the socket.
    let close = client.drain_to_close().await;
    if let Some(frame) = close {
        assert_eq!(frame.opcode, OpCode::Close);
    }
    assert!(wait_for(|| hub.client_count() == 0).await);
}

#[tokio::test]
async fn answered_pongs_keep_the_connection_alive() {
    let hub = fast_heartbeat_hub();
    let (mut client, _) = WsClient::open(&hub, "/ws").await;
    assert_eq!(client.recv_json().await["type"], "session.created");

    for _ in 0..4 {
        let ping = client.recv_control(OpCode::Ping).await;
        client.send_masked(0xa, &ping.payload).await; // pong echo
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
    assert_eq!(hub.client_count(), 1);
    assert!(!hub.is_stopped());
}

#[tokio::test]
async fn stop_closes_connected_clients_with_going_away() {
    let hub = authenticated_hub("secret", "sess-1");
    let (mut client, _) = WsClient::open(&hub, "/ws?token=secret").await;
    assert_eq!(client.recv_json().await["type"], "session.created");

    hub.stop();
    assert!(hub.is_stopped());
    let close = client.recv_control(OpCode::Close).await;
    assert_eq!(close.close_code(), Some(CLOSE_GOING_AWAY));
    assert!(wait_for(|| hub.client_count() == 0).await);

    // A second stop is a no-op, and new clients are rejected after shutdown.
    hub.stop();
    let (_late, response) = WsClient::open(&hub, "/ws").await;
    assert!(
        !response.contains(" 101 "),
        "stopped hub must not accept: {response}"
    );
}

#[tokio::test]
async fn hub_disconnect_signal_is_observable_for_cancellation() {
    let hub = Arc::new(WsHub::new(WsHubConfig::default()));
    let mut shutdown = hub.shutdown_receiver();
    hub.stop();
    let reason = tokio::time::timeout(Duration::from_secs(1), shutdown.recv())
        .await
        .expect("shutdown broadcast within timeout")
        .expect("shutdown broadcast payload");
    assert!(!reason.is_empty());
}
