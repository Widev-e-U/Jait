//! Session state, project state and consent routes through the production binary.
use serde_json::{Value, json};
use std::{
    io::{BufRead, BufReader},
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::mpsc,
    time::Duration,
};

struct Gateway {
    child: Child,
    directory: PathBuf,
    base: String,
}

impl Gateway {
    fn start() -> Self {
        let directory = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../.jait/artifacts/binary-state-consent-tests")
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
            .env("JWT_SECRET", "isolated-state-consent-secret")
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

#[tokio::test]
async fn state_trust_and_consent_routes_are_owned_through_the_binary() {
    let gateway = Gateway::start();
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .unwrap();
    let url = |path: &str| format!("{}{path}", gateway.base);
    let register = |name: &'static str, invitation: Option<Value>| {
        let client = client.clone();
        let target = url("/api/auth/register");
        async move {
            let mut body = json!({"username":name, "password":"owner-pass-123"});
            if let Some(invitation) = invitation {
                body["invitation"] = invitation;
            }
            let response = client.post(target).json(&body).send().await.unwrap();
            assert_eq!(response.status(), 200);
            response.json::<Value>().await.unwrap()["access_token"]
                .as_str()
                .unwrap()
                .to_owned()
        }
    };
    let owner = register("owner", None).await;
    let invite = client
        .post(url("/api/auth/invitations"))
        .bearer_auth(&owner)
        .json(&json!({}))
        .send()
        .await
        .unwrap()
        .json::<Value>()
        .await
        .unwrap();
    let other = register("other", Some(invite["invitation"].clone())).await;
    let call = |method: reqwest::Method, path: String, token: String, body: Option<Value>| {
        let client = client.clone();
        let target = url(&path);
        async move {
            let mut request = client.request(method, target).bearer_auth(token);
            if let Some(body) = body {
                request = request.json(&body);
            }
            let response = request.send().await.unwrap();
            let status = response.status().as_u16();
            let text = response.text().await.unwrap();
            (
                status,
                serde_json::from_str::<Value>(&text).unwrap_or(Value::String(text)),
            )
        }
    };
    use reqwest::Method as M;

    // Unauthenticated consent access is rejected.
    let response = client
        .get(url("/api/consent/pending"))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 401);

    // Consent: empty queues, counts and ownership of unknown ids.
    let (status, pending) = call(M::GET, "/api/consent/pending".into(), owner.clone(), None).await;
    assert_eq!(status, 200, "{pending}");
    let (status, count) = call(M::GET, "/api/consent/count".into(), owner.clone(), None).await;
    assert_eq!(status, 200, "{count}");
    let (status, policy) = call(M::GET, "/api/consent/policy".into(), owner.clone(), None).await;
    assert_eq!(status, 200, "{policy}");
    let (status, body) = call(M::GET, "/api/consent/nope".into(), owner.clone(), None).await;
    assert_eq!(status, 404, "{body}");
    for action in ["approve", "reject"] {
        let (status, body) = call(
            M::POST,
            format!("/api/consent/nope/{action}"),
            owner.clone(),
            Some(json!({})),
        )
        .await;
        assert_eq!(status, 404, "{action} {body}");
    }

    // Trust levels.
    let (status, levels) = call(M::GET, "/api/trust/levels".into(), owner.clone(), None).await;
    assert_eq!(status, 200, "{levels}");
    let (status, trust) = call(M::GET, "/api/trust".into(), owner.clone(), None).await;
    assert_eq!(status, 200, "{trust}");

    // Session state and archive are owner-scoped.
    let (status, session) = call(
        M::POST,
        "/api/sessions".into(),
        owner.clone(),
        Some(json!({})),
    )
    .await;
    assert_eq!(status, 201, "{session}");
    let id = session["id"].as_str().unwrap().to_owned();

    // Session-wide approval can only be inspected or changed by its owner.
    let approve_all = format!("/api/consent/pending/{id}/approve-all");
    let pending_for_session = format!("/api/consent/pending/{id}");
    let response = client.get(url(&approve_all)).send().await.unwrap();
    assert_eq!(response.status(), 401);
    for method in [M::GET, M::POST, M::DELETE] {
        let (status, body) = call(method, approve_all.clone(), other.clone(), None).await;
        assert_eq!(status, 404, "{body}");
    }
    let (status, body) = call(M::GET, pending_for_session.clone(), other.clone(), None).await;
    assert_eq!(status, 404, "{body}");
    let (status, body) = call(M::GET, pending_for_session, owner.clone(), None).await;
    assert_eq!(status, 200, "{body}");
    assert_eq!(body["requests"], json!([]));
    let (status, body) = call(M::GET, approve_all.clone(), owner.clone(), None).await;
    assert_eq!(status, 200, "{body}");
    assert_eq!(body["approveAllEnabled"], false);
    let (status, body) = call(M::POST, approve_all.clone(), owner.clone(), Some(json!({}))).await;
    assert_eq!(status, 200, "{body}");
    assert_eq!(body["approveAllEnabled"], true);
    assert_eq!(body["approvedCount"], 0);
    let (status, body) = call(M::DELETE, approve_all.clone(), other.clone(), None).await;
    assert_eq!(status, 404, "{body}");
    let (status, body) = call(M::GET, approve_all.clone(), owner.clone(), None).await;
    assert_eq!(status, 200, "{body}");
    assert_eq!(body["approveAllEnabled"], true);
    let (status, body) = call(M::DELETE, approve_all.clone(), owner.clone(), None).await;
    assert_eq!(status, 200, "{body}");
    assert_eq!(body["approveAllEnabled"], false);
    let (status, state) = call(
        M::GET,
        format!("/api/sessions/{id}/state"),
        owner.clone(),
        None,
    )
    .await;
    assert_eq!(status, 200, "{state}");
    let (status, _) = call(
        M::GET,
        format!("/api/sessions/{id}/state"),
        other.clone(),
        None,
    )
    .await;
    assert_eq!(status, 404);
    let (status, _) = call(
        M::PATCH,
        format!("/api/sessions/{id}/state"),
        other.clone(),
        Some(json!({})),
    )
    .await;
    assert_eq!(status, 404);
    let (status, body) = call(
        M::POST,
        format!("/api/sessions/{id}/archive"),
        owner.clone(),
        Some(json!({})),
    )
    .await;
    assert!(status == 200 || status == 204, "{status} {body}");
    let (_, got) = call(M::GET, format!("/api/sessions/{id}"), owner.clone(), None).await;
    assert_eq!(got["status"], "archived", "{got}");

    // Project state and project sessions are owner-scoped.
    let (status, project) = call(
        M::POST,
        "/api/projects".into(),
        owner.clone(),
        Some(json!({"title":"Gamma"})),
    )
    .await;
    assert_eq!(status, 201, "{project}");
    let pid = project["id"].as_str().unwrap().to_owned();
    let (status, state) = call(
        M::GET,
        format!("/api/projects/{pid}/state"),
        owner.clone(),
        None,
    )
    .await;
    assert_eq!(status, 200, "{state}");
    let (status, _) = call(
        M::GET,
        format!("/api/projects/{pid}/state"),
        other.clone(),
        None,
    )
    .await;
    assert_eq!(status, 404);
    let (status, body) = call(
        M::GET,
        format!("/api/projects/{pid}/sessions"),
        owner.clone(),
        None,
    )
    .await;
    assert_eq!(status, 200, "{body}");
    let (status, _) = call(
        M::GET,
        format!("/api/projects/{pid}/sessions"),
        other.clone(),
        None,
    )
    .await;
    assert_eq!(status, 404);

    let (status, _) = call(
        M::POST,
        format!("/api/projects/{pid}/sessions"),
        other.clone(),
        Some(json!({"name":"intruder","projectPath":"/etc"})),
    )
    .await;
    assert_eq!(status, 404);
    let (status, created) = call(
        M::POST,
        format!("/api/projects/{pid}/sessions"),
        owner.clone(),
        Some(json!({"name":"inside","projectPath":"/etc"})),
    )
    .await;
    assert_eq!(status, 201, "{created}");
    assert_ne!(created["projectPath"], "/etc", "{created}");
    let (_, listed) = call(
        M::GET,
        format!("/api/projects/{pid}/sessions"),
        owner.clone(),
        None,
    )
    .await;
    assert!(listed.to_string().contains("inside"), "{listed}");

    // Repositories start empty and are not shared between users.
    let (status, repos) = call(M::GET, "/api/repos".into(), owner.clone(), None).await;
    assert_eq!(status, 200, "{repos}");
    let (status, _) = call(M::DELETE, "/api/repos/nope".into(), other.clone(), None).await;
    assert_eq!(status, 404);
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

    /// Next text message, or None if nothing arrives within `wait`.
    async fn next(&mut self, wait: Duration) -> Option<serde_json::Value> {
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

    async fn until(&mut self, kind: &str, wait: Duration) -> Option<serde_json::Value> {
        let deadline = tokio::time::Instant::now() + wait;
        while let Some(left) = deadline.checked_duration_since(tokio::time::Instant::now()) {
            let message = self.next(left).await?;
            if message["type"] == kind {
                return Some(message);
            }
        }
        None
    }
}

#[tokio::test]
async fn session_events_reach_only_the_owner_through_the_binary() {
    let gateway = Gateway::start();
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .unwrap();
    let url = |path: &str| format!("{}{path}", gateway.base);
    let owner: Value = client
        .post(url("/api/auth/register"))
        .json(&json!({"username":"event-owner","password":"owner-pass-123"}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let owner = owner["access_token"].as_str().unwrap();
    let invite: Value = client
        .post(url("/api/auth/invitations"))
        .bearer_auth(owner)
        .json(&json!({}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let other: Value = client.post(url("/api/auth/register"))
        .json(&json!({"username":"event-other","password":"owner-pass-123","invitation":invite["invitation"]}))
        .send().await.unwrap().json().await.unwrap();
    let other = other["access_token"].as_str().unwrap();
    let mut owner_socket = WsClient::connect(&gateway.base, owner).await;
    let mut other_socket = WsClient::connect(&gateway.base, other).await;
    // Consume the connection greeting before issuing mutations.
    assert_eq!(
        owner_socket.next(Duration::from_secs(5)).await.unwrap()["type"],
        "session.created"
    );
    assert_eq!(
        other_socket.next(Duration::from_secs(5)).await.unwrap()["type"],
        "session.created"
    );
    let created: Value = client
        .post(url("/api/sessions"))
        .bearer_auth(owner)
        .json(&json!({"name":"original"}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let id = created["id"].as_str().unwrap();
    let event = owner_socket
        .until("chat.created", Duration::from_secs(5))
        .await
        .unwrap();
    assert_eq!(event["sessionId"], "");
    assert_eq!(event["payload"]["session"]["id"], id);
    let response = client
        .patch(url(&format!("/api/sessions/{id}")))
        .bearer_auth(owner)
        .json(&json!({"name":"renamed"}))
        .send()
        .await
        .unwrap();
    assert!(response.status().is_success());
    let event = owner_socket
        .until("chat.updated", Duration::from_secs(5))
        .await
        .unwrap();
    assert_eq!(event["payload"]["session"]["name"], "renamed");
    assert!(
        other_socket
            .until("chat.created", Duration::from_millis(300))
            .await
            .is_none()
    );
    assert!(
        other_socket
            .until("chat.updated", Duration::from_millis(300))
            .await
            .is_none()
    );
}

#[tokio::test]
async fn email_and_hooks_enforce_composed_runtime_boundaries() {
    let gateway = Gateway::start();
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .unwrap();
    let url = |path: &str| format!("{}{path}", gateway.base);
    let response = client.get(url("/api/email/accounts")).send().await.unwrap();
    assert_eq!(response.status(), 401);
    let token = client
        .post(url("/api/auth/register"))
        .json(&json!({"username":"owner", "password":"owner-pass-123"}))
        .send()
        .await
        .unwrap()
        .json::<Value>()
        .await
        .unwrap()["access_token"]
        .as_str()
        .unwrap()
        .to_owned();
    let response = client
        .get(url("/api/email/accounts"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    assert_eq!(
        response.json::<Value>().await.unwrap()["accounts"],
        json!([])
    );
    let response = client
        .post(url("/api/email/accounts"))
        .bearer_auth(&token)
        .json(&json!({}))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 400);
    for path in ["/hooks/wake", "/hooks/agent"] {
        let response = client
            .post(url(path))
            .json(&json!({}))
            .send()
            .await
            .unwrap();
        assert_eq!(response.status(), 401);
        let response = client
            .post(url(path))
            .header("x-hook-token", "isolated-hook-secret")
            .json(&json!({}))
            .send()
            .await
            .unwrap();
        assert_eq!(response.status(), 500);
        assert_eq!(
            response.json::<Value>().await.unwrap()["message"],
            "Hook handling is not available in the Rust gateway yet"
        );
    }
}
