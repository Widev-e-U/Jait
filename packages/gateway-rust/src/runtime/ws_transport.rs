//! Opt-in transport infrastructure. This module is not mounted by Application.
//! The caller must supply trusted hub dependencies and close/drain it before the
//! shared database worker shuts down.
use crate::ws::{HandshakeOutcome, HandshakeRequest, WsHub, negotiate_handshake};
use axum::{
    Router,
    body::Body,
    extract::{Request, State},
    http::{Response, StatusCode, header},
    routing::any,
};
use hyper_util::rt::TokioIo;
use std::{
    num::NonZeroUsize,
    sync::{Arc, Mutex},
};
use tokio::sync::watch;

struct StateData {
    closed: bool,
    active: usize,
}
struct Inner {
    hub: Arc<WsHub>,
    limit: usize,
    state: Mutex<StateData>,
    changed: watch::Sender<usize>,
    stop: watch::Sender<bool>,
}
/// Owns admission and all accepted upgrade tasks. Closing is synchronous;
/// `drain` waits until even pending HTTP upgrades have exited.
#[derive(Clone)]
pub struct WsTransport(Arc<Inner>);
struct Permit(Arc<Inner>);
impl Drop for Permit {
    fn drop(&mut self) {
        let mut state = self.0.state.lock().expect("websocket transport state");
        state.active -= 1;
        self.0.changed.send_replace(state.active);
    }
}
impl WsTransport {
    pub fn new(hub: Arc<WsHub>, max_connections: NonZeroUsize) -> Self {
        let (changed, _) = watch::channel(0);
        let (stop, _) = watch::channel(false);
        Self(Arc::new(Inner {
            hub,
            limit: max_connections.get(),
            state: Mutex::new(StateData {
                closed: false,
                active: 0,
            }),
            changed,
            stop,
        }))
    }
    pub(crate) fn hub(&self) -> Arc<WsHub> {
        self.0.hub.clone()
    }
    /// The router is opt-in. Its path comes from the configured hub.
    pub fn router(&self) -> Router {
        Router::new()
            .route(&self.0.hub.config().path, any(upgrade))
            .with_state(self.clone())
    }
    fn reserve(&self) -> Option<Permit> {
        let mut state = self.0.state.lock().expect("websocket transport state");
        if state.closed || state.active >= self.0.limit {
            return None;
        }
        state.active += 1;
        self.0.changed.send_replace(state.active);
        Some(Permit(self.0.clone()))
    }
    pub fn close(&self) {
        let mut state = self.0.state.lock().expect("websocket transport state");
        if !state.closed {
            state.closed = true;
            self.0.stop.send_replace(true);
            self.0.hub.stop();
        }
    }
    pub async fn drain(&self) {
        let mut changed = self.0.changed.subscribe();
        loop {
            if *changed.borrow_and_update() == 0 {
                return;
            }
            if changed.changed().await.is_err() {
                return;
            }
        }
    }
}

async fn upgrade(State(transport): State<WsTransport>, mut request: Request) -> Response<Body> {
    let headers = request
        .headers()
        .iter()
        .map(|(k, v)| v.to_str().map(|v| (k.to_string(), v.to_owned())))
        .collect::<Result<Vec<_>, _>>();
    let Ok(headers) = headers else {
        return response(StatusCode::BAD_REQUEST, "invalid header");
    };
    let handshake = HandshakeRequest {
        method: request.method().to_string(),
        target: request.uri().to_string(),
        headers,
    };
    let accept = match negotiate_handshake(&handshake, &transport.0.hub.config().path) {
        HandshakeOutcome::Accepted { accept_key } => accept_key,
        HandshakeOutcome::Rejected { status, body, .. } => {
            return response(
                StatusCode::from_u16(status).unwrap_or(StatusCode::BAD_REQUEST),
                &body,
            );
        }
    };
    let Some(permit) = transport.reserve() else {
        return response(StatusCode::SERVICE_UNAVAILABLE, "websocket unavailable");
    };
    let mut stop = transport.0.stop.subscribe();
    let hub = transport.0.hub.clone();
    let token = handshake.bearer_token();
    let upgraded = hyper::upgrade::on(&mut request);
    tokio::spawn(async move {
        let _permit = permit;
        if *stop.borrow_and_update() {
            return;
        }
        tokio::select! {
            result = upgraded => if let Ok(stream) = result { let _ = hub.serve_upgraded(TokioIo::new(stream), token).await; },
            _ = stop.changed() => {}
        }
    });
    Response::builder()
        .status(StatusCode::SWITCHING_PROTOCOLS)
        .header(header::CONNECTION, "Upgrade")
        .header(header::UPGRADE, "websocket")
        .header("sec-websocket-accept", accept)
        .body(Body::empty())
        .expect("valid handshake response")
}
fn response(status: StatusCode, body: &str) -> Response<Body> {
    Response::builder()
        .status(status)
        .body(Body::from(body.to_owned()))
        .expect("valid response")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ws::WsHubConfig;
    use std::{future::IntoFuture, time::Duration};

    #[tokio::test]
    async fn focused_transport_upgrade_closes_and_drains() {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        let transport = WsTransport::new(
            Arc::new(WsHub::new(WsHubConfig::default())),
            NonZeroUsize::new(1).unwrap(),
        );
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let server = tokio::spawn(axum::serve(listener, transport.router()).into_future());
        let mut client = tokio::net::TcpStream::connect(addr).await.unwrap();
        client.write_all(b"GET /ws HTTP/1.1\r\nHost: localhost\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n").await.unwrap();
        let mut response = vec![0; 1024];
        let n = tokio::time::timeout(Duration::from_secs(2), client.read(&mut response))
            .await
            .unwrap()
            .unwrap();
        assert!(
            std::str::from_utf8(&response[..n])
                .unwrap()
                .starts_with("HTTP/1.1 101")
        );
        transport.close();
        tokio::time::timeout(Duration::from_secs(2), transport.drain())
            .await
            .unwrap();
        server.abort();
        let _ = server.await;
    }

    #[tokio::test]
    async fn focused_transport_close_blocks_admission_and_drains_permits() {
        let transport = WsTransport::new(
            Arc::new(WsHub::new(WsHubConfig::default())),
            NonZeroUsize::new(1).unwrap(),
        );
        let permit = transport.reserve().unwrap();
        assert!(transport.reserve().is_none());
        transport.close();
        assert!(transport.reserve().is_none());
        assert!(
            tokio::time::timeout(Duration::from_millis(20), transport.drain())
                .await
                .is_err()
        );
        drop(permit);
        tokio::time::timeout(Duration::from_secs(1), transport.drain())
            .await
            .unwrap();
    }
}
