//! WebSocket subscription messages through the production binary, and the fail-closed
//! contract of the WebSocket terminal and consent controls that the composed runtime
//! does not mount yet.
use serde_json::{Value, json};
use std::{
    io::{BufRead, BufReader},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::mpsc,
    time::Duration,
};

const WAIT: Duration = Duration::from_secs(10);
const QUIET: Duration = Duration::from_millis(800);

struct Gateway {
    child: Child,
    directory: PathBuf,
    base: String,
}

impl Gateway {
    fn start() -> Self {
        let directory = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../.jait/artifacts/binary-ws-messages-tests")
            .join(uuid::Uuid::new_v4().to_string());
        std::fs::create_dir_all(&directory).unwrap();
        let directory = directory.canonicalize().unwrap();
        std::fs::write(directory.join("notes.txt"), "binary-policy-marker").unwrap();
        let mut child = Command::new(env!("CARGO_BIN_EXE_jait-gateway"))
            .env_clear()
            .env("HOME", &directory)
            .env("JAIT_RUST_APPLICATION", "1")
            .env("JAIT_RUST_PORT", "0")
            .env("JAIT_RUST_PROJECT_ROOT", &directory)
            .env("JAIT_RUST_DB", directory.join("gateway.sqlite"))
            .env("JWT_SECRET", "isolated-ws-messages-secret")
            .env("HOOK_SECRET", "isolated-hook-secret")
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()
            .unwrap();
        let stdout = child.stdout.take().unwrap();
        let (tx, rx) = mpsc::channel();
        std::thread::spawn(move || {
            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                if let Ok(value) = serde_json::from_str::<Value>(&line)
                    && value["event"] == "gateway.ready"
                {
                    let _ = tx.send(value["address"].as_str().unwrap_or("").to_owned());
                    return;
                }
            }
        });
        let address = match rx.recv_timeout(Duration::from_secs(30)) {
            Ok(address) => address,
            Err(error) => {
                let _ = child.kill();
                let _ = child.wait();
                panic!("gateway failed to become ready: {error}");
            }
        };
        assert!(address.starts_with("127.0.0.1:"));
        Self {
            child,
            directory,
            base: format!("http://{address}"),
        }
    }
}

impl Drop for Gateway {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
        let _ = std::fs::remove_dir_all(&self.directory);
    }
}

fn http_client() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .unwrap()
}

async fn register(
    client: &reqwest::Client,
    base: &str,
    name: &str,
    invitation: Option<Value>,
) -> String {
    let mut body = json!({"username": name, "password": "ws-pass-123"});
    if let Some(invitation) = invitation {
        body["invitation"] = invitation;
    }
    let response = client
        .post(format!("{base}/api/auth/register"))
        .json(&body)
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    response.json::<Value>().await.unwrap()["access_token"]
        .as_str()
        .unwrap()
        .to_owned()
}

/// Registers a second account through an owner-issued invitation.
async fn register_invited(client: &reqwest::Client, base: &str, owner: &str) -> String {
    let invite = post_json(client, base, "/api/auth/invitations", owner, json!({})).await;
    register(client, base, "other", Some(invite["invitation"].clone())).await
}

async fn post_json(
    client: &reqwest::Client,
    base: &str,
    path: &str,
    token: &str,
    body: Value,
) -> Value {
    let response = client
        .post(format!("{base}{path}"))
        .bearer_auth(token)
        .json(&body)
        .send()
        .await
        .unwrap();
    let status = response.status();
    let text = response.text().await.unwrap();
    assert!(status.is_success(), "{path} -> {status}: {text}");
    serde_json::from_str(&text).unwrap()
}

async fn owned_session(client: &reqwest::Client, base: &str, token: &str, root: &Path) -> String {
    let project = post_json(
        client,
        base,
        "/api/projects",
        token,
        json!({"title": "WS", "rootPath": root, "nodeId": "gateway"}),
    )
    .await;
    let session = post_json(
        client,
        base,
        "/api/sessions",
        token,
        json!({"projectId": project["id"], "projectPath": root}),
    )
    .await;
    session["id"].as_str().unwrap().to_owned()
}

async fn pending_consent(client: &reqwest::Client, base: &str, token: &str) -> String {
    tokio::time::timeout(WAIT, async {
        loop {
            let pending = client
                .get(format!("{base}/api/consent/pending"))
                .bearer_auth(token)
                .send()
                .await
                .unwrap()
                .json::<Value>()
                .await
                .unwrap();
            if let Some(id) = pending["requests"]
                .as_array()
                .and_then(|requests| requests.first())
                .and_then(|request| request["id"].as_str())
            {
                return id.to_owned();
            }
            tokio::time::sleep(Duration::from_millis(25)).await;
        }
    })
    .await
    .expect("tool must request consent")
}

async fn consent_still_pending(
    client: &reqwest::Client,
    base: &str,
    token: &str,
    id: &str,
) -> bool {
    let pending = client
        .get(format!("{base}/api/consent/pending"))
        .bearer_auth(token)
        .send()
        .await
        .unwrap()
        .json::<Value>()
        .await
        .unwrap();
    pending.to_string().contains(id)
}

fn mentions(frames: &[Value], needle: &str) -> bool {
    frames
        .iter()
        .any(|frame| frame.to_string().contains(needle))
}

/// Minimal WebSocket client over the gateway's own frame codec.
struct WsClient(tokio::net::TcpStream);

impl WsClient {
    async fn connect(base: &str, token: &str) -> Self {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        let host = base.trim_start_matches("http://");
        let mut stream = tokio::net::TcpStream::connect(host).await.unwrap();
        let request = format!(
            "GET /ws?token={token} HTTP/1.1\r\nHost: {host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n"
        );
        stream.write_all(request.as_bytes()).await.unwrap();
        let mut head = Vec::new();
        while !head.ends_with(b"\r\n\r\n") {
            head.push(stream.read_u8().await.unwrap());
        }
        assert!(String::from_utf8_lossy(&head).starts_with("HTTP/1.1 101"));
        Self(stream)
    }

    async fn send(&mut self, value: Value) {
        use jait_gateway::ws::{OpCode, write_client_frame};
        let text = value.to_string();
        write_client_frame(&mut self.0, OpCode::Text, text.as_bytes(), [1, 2, 3, 4])
            .await
            .unwrap();
    }

    /// Next text message, or None if nothing arrives within `wait`.
    async fn next(&mut self, wait: Duration) -> Option<Value> {
        use jait_gateway::ws::{OpCode, read_frame, write_client_frame};
        tokio::time::timeout(wait, async {
            loop {
                let frame = read_frame(&mut self.0, 1 << 20).await.unwrap()?;
                match frame.opcode {
                    OpCode::Text => return serde_json::from_str(frame.text()?).ok(),
                    OpCode::Ping => {
                        write_client_frame(&mut self.0, OpCode::Pong, &frame.payload, [1, 2, 3, 4])
                            .await
                            .unwrap()
                    }
                    OpCode::Pong => {}
                    _ => return None,
                }
            }
        })
        .await
        .ok()
        .flatten()
    }

    async fn until(&mut self, kind: &str, wait: Duration) -> Option<Value> {
        self.until_where(wait, |message| message["type"] == kind)
            .await
    }

    /// Next message accepted by `accept`, skipping the others, or None within `wait`.
    async fn until_where(
        &mut self,
        wait: Duration,
        accept: impl Fn(&Value) -> bool,
    ) -> Option<Value> {
        let deadline = tokio::time::Instant::now() + wait;
        while let Some(left) = deadline.checked_duration_since(tokio::time::Instant::now()) {
            let message = self.next(left).await?;
            if accept(&message) {
                return Some(message);
            }
        }
        None
    }

    /// Collects frames until `done` accepts them or `wait` elapses.
    async fn collect_until(
        &mut self,
        wait: Duration,
        done: impl Fn(&[Value]) -> bool,
    ) -> Vec<Value> {
        let deadline = tokio::time::Instant::now() + wait;
        let mut seen = Vec::new();
        while !done(&seen) {
            let Some(left) = deadline.checked_duration_since(tokio::time::Instant::now()) else {
                break;
            };
            match self.next(left).await {
                Some(message) => seen.push(message),
                None => break,
            }
        }
        seen
    }
}

#[tokio::test]
async fn subscribe_and_resource_messages_are_scoped_through_the_binary() {
    let gateway = Gateway::start();
    let client = http_client();
    let owner = register(&client, &gateway.base, "owner", None).await;
    let other = register_invited(&client, &gateway.base, &owner).await;
    let session_id = owned_session(&client, &gateway.base, &owner, &gateway.directory).await;

    let mut ws = WsClient::connect(&gateway.base, &owner).await;
    ws.send(json!({"type": "subscribe", "sessionId": session_id}))
        .await;
    // The server greets every authenticated socket with an unsolicited session.created
    // (empty sessionId), so the ack is matched by its session.
    let ack = ws
        .until_where(WAIT, |message| {
            message["type"] == "session.created" && message["sessionId"] == session_id.as_str()
        })
        .await
        .expect("owned subscribe is acknowledged");
    assert_eq!(ack["payload"]["subscribed"], true);

    let mut intruder = WsClient::connect(&gateway.base, &other).await;
    intruder
        .send(json!({"type": "subscribe", "sessionId": session_id}))
        .await;
    let refused = intruder
        .until("error", WAIT)
        .await
        .expect("foreign subscribe is refused");
    assert_eq!(refused["payload"]["code"], "SESSION_FORBIDDEN");
    assert!(
        intruder
            .until_where(QUIET, |message| {
                message["type"] == "session.created" && message["sessionId"] == session_id.as_str()
            })
            .await
            .is_none(),
        "foreign subscribe must not be acknowledged"
    );

    ws.send(
        json!({"type": "resource.subscribe", "payload": {"resource": "root:/pending-consents"}}),
    )
    .await;
    let snapshot = ws
        .until("consent.pending-snapshot", WAIT)
        .await
        .expect("pending consent snapshot");
    assert!(snapshot["payload"]["requests"].is_array(), "{snapshot}");

    // resource.unsubscribe sends no acknowledgement, so the next reply belongs to the
    // subscribe that follows it.
    ws.send(
        json!({"type": "resource.unsubscribe", "payload": {"resource": "root:/pending-consents"}}),
    )
    .await;
    ws.send(json!({"type": "subscribe", "sessionId": session_id}))
        .await;
    let next = ws.next(WAIT).await.expect("reply to the following message");
    assert_eq!(next["type"], "session.created", "{next}");
    assert_eq!(next["sessionId"], session_id.as_str(), "{next}");
}

/// The composed runtime does not mount WebSocket terminal controls (application.rs clears
/// `config.terminals`), so terminal.input and terminal.resize have no effect and nothing is
/// streamed to the subscriber. This pins that fail-closed contract. Re-point it once the
/// controls are supervised and mounted, because the web terminal depends on them.
#[tokio::test]
async fn terminal_controls_are_fail_closed_in_the_composed_runtime() {
    let gateway = Gateway::start();
    let client = http_client();
    let owner = register(&client, &gateway.base, "owner", None).await;
    let terminal = post_json(
        &client,
        &gateway.base,
        "/api/terminals",
        &owner,
        json!({"nodeId": "gateway"}),
    )
    .await;
    let terminal_id = terminal["id"].as_str().unwrap().to_owned();

    let mut ws = WsClient::connect(&gateway.base, &owner).await;
    ws.send(json!({"type": "terminal.subscribe", "terminalId": terminal_id}))
        .await;
    ws.until("surface.connected", WAIT)
        .await
        .expect("terminal subscribe is processed");
    ws.send(json!({"type": "terminal.resize", "terminalId": terminal_id, "cols": 100, "rows": 30}))
        .await;
    ws.send(
        json!({"type": "terminal.input", "terminalId": terminal_id, "data": "echo ws-$((40+2))\n"}),
    )
    .await;
    let frames = ws
        .collect_until(QUIET * 3, |seen| mentions(seen, "ws-42"))
        .await;
    assert!(
        !mentions(&frames, "ws-42"),
        "unmounted terminal input executed: {frames:?}"
    );
    ws.send(json!({"type": "terminal.unsubscribe", "terminalId": terminal_id}))
        .await;
}

/// The composed runtime does not mount WebSocket consent decisions (application.rs clears
/// `config.consent`), so consent.approve and consent.reject leave the request pending. The
/// HTTP consent routes remain the decision path. Re-point this test once WebSocket decisions
/// are mounted under supervision.
#[tokio::test]
async fn consent_controls_are_fail_closed_in_the_composed_runtime() {
    let gateway = Gateway::start();
    let client = http_client();
    let owner = register(&client, &gateway.base, "owner", None).await;
    let session_id = owned_session(&client, &gateway.base, &owner, &gateway.directory).await;
    let mut ws = WsClient::connect(&gateway.base, &owner).await;

    let tool_call = |content: &str| {
        let client = client.clone();
        let target = format!("{}/api/tools/execute", gateway.base);
        let token = owner.clone();
        let body = json!({
            "tool": "file.write",
            "sessionId": session_id,
            "input": {"path": "notes.txt", "content": content}
        });
        tokio::spawn(async move {
            client
                .post(target)
                .bearer_auth(token)
                .json(&body)
                .send()
                .await
                .unwrap()
        })
    };
    let notes = || std::fs::read_to_string(gateway.directory.join("notes.txt")).unwrap();

    let approved = tool_call("ws-approved");
    let consent_id = pending_consent(&client, &gateway.base, &owner).await;
    ws.send(json!({"type": "consent.approve", "requestId": consent_id}))
        .await;
    tokio::time::sleep(QUIET).await;
    assert!(
        consent_still_pending(&client, &gateway.base, &owner, &consent_id).await,
        "WebSocket approve must not decide consent"
    );
    assert_eq!(notes(), "binary-policy-marker");
    post_json(
        &client,
        &gateway.base,
        &format!("/api/consent/{consent_id}/approve"),
        &owner,
        json!({}),
    )
    .await;
    let response = tokio::time::timeout(WAIT, approved)
        .await
        .expect("approved tool resumes")
        .unwrap();
    assert_eq!(response.status(), 200);
    assert_eq!(notes(), "ws-approved");

    let rejected = tool_call("ws-rejected");
    let consent_id = pending_consent(&client, &gateway.base, &owner).await;
    ws.send(json!({"type": "consent.reject", "requestId": consent_id, "reason": "not today"}))
        .await;
    tokio::time::sleep(QUIET).await;
    assert!(
        consent_still_pending(&client, &gateway.base, &owner, &consent_id).await,
        "WebSocket reject must not decide consent"
    );
    post_json(
        &client,
        &gateway.base,
        &format!("/api/consent/{consent_id}/reject"),
        &owner,
        json!({"reason": "not today"}),
    )
    .await;
    tokio::time::timeout(WAIT, rejected)
        .await
        .expect("rejected tool resumes")
        .unwrap();
    assert_eq!(
        notes(),
        "ws-approved",
        "a rejected write must not reach the file"
    );
    assert!(!consent_still_pending(&client, &gateway.base, &owner, &consent_id).await);
}
