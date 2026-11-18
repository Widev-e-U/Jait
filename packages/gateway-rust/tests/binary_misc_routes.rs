//! Filesystem, user-question, skills and todo routes through the production binary.
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
            .join("../../.jait/artifacts/binary-misc-routes-tests")
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
            .env("JWT_SECRET", "isolated-repos-secret")
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
async fn misc_routes_are_owned_through_the_binary() {
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

    // Filesystem browsing.
    let dir = gateway.directory.to_string_lossy().into_owned();
    let (st, b) = call(M::GET, "/api/filesystem/nodes".into(), o_(&owner), None).await;
    assert!(st == 200 && b["nodes"].is_array(), "{b}");
    let (st, b) = call(M::GET, "/api/filesystem/roots".into(), o_(&owner), None).await;
    assert!(
        st == 200 && b["roots"].is_array() && !b["roots"].as_array().unwrap().is_empty(),
        "{b}"
    );
    let (st, b) = call(
        M::GET,
        format!("/api/filesystem/browse?path={dir}"),
        o_(&owner),
        None,
    )
    .await;
    assert_eq!(st, 200, "{b}");
    assert!(
        b["entries"]
            .as_array()
            .unwrap()
            .iter()
            .any(|e| e["name"] == "notes.txt" && e["type"] == "file"),
        "{b}"
    );
    let (st, b) = call(
        M::GET,
        format!("/api/filesystem/browse?path={dir}/missing"),
        o_(&owner),
        None,
    )
    .await;
    assert_eq!((st, &b["error"]), (400, &json!("BROWSE_FAILED")), "{b}");
    let (st, b) = call(
        M::GET,
        format!("/api/filesystem/browse?path={dir}/notes.txt"),
        o_(&owner),
        None,
    )
    .await;
    assert_eq!((st, &b["error"]), (400, &json!("NOT_A_DIRECTORY")), "{b}");
    for p in ["nodes", "roots", "browse"] {
        let r = client
            .get(url(&format!("/api/filesystem/{p}")))
            .send()
            .await
            .unwrap();
        assert_eq!(r.status(), 401, "{p}");
    }

    // User questions: nothing pending, validation, unknown ids.
    let (st, b) = call(
        M::GET,
        "/api/user-questions/requests".into(),
        o_(&owner),
        None,
    )
    .await;
    assert!(st == 200 && b["requests"] == json!([]), "{b}");
    let (st, _) = call(
        M::POST,
        "/api/user-questions/requests/nope/submit".into(),
        o_(&owner),
        Some(json!({})),
    )
    .await;
    assert_eq!(st, 400);
    let (st, _) = call(
        M::POST,
        "/api/user-questions/requests/nope/submit".into(),
        o_(&owner),
        Some(json!({"answers":{}})),
    )
    .await;
    assert_eq!(st, 404);
    let (st, _) = call(
        M::POST,
        "/api/user-questions/requests/nope/cancel".into(),
        o_(&owner),
        Some(json!({})),
    )
    .await;
    assert_eq!(st, 404);
    let r = client
        .get(url("/api/user-questions/requests"))
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 401);

    // Skills.
    let (st, b) = call(M::GET, "/api/skills".into(), o_(&owner), None).await;
    assert!(st == 200 && b.is_array(), "{b}");
    let (st, _) = call(
        M::PATCH,
        "/api/skills/nope".into(),
        o_(&owner),
        Some(json!({"enabled":true})),
    )
    .await;
    assert_eq!(st, 404);
    let (st, _) = call(
        M::POST,
        "/api/skills/nope/install-tool".into(),
        o_(&owner),
        Some(json!({})),
    )
    .await;
    assert_eq!(st, 404);
    let r = client.get(url("/api/skills")).send().await.unwrap();
    assert_eq!(r.status(), 401);

    // Repository todos: PATCH and DELETE through /api/jait-todos, owner only.
    std::fs::create_dir_all(gateway.directory.join("todo-repo")).unwrap();
    let local = gateway
        .directory
        .join("todo-repo")
        .to_string_lossy()
        .into_owned();
    let (st, b) = call(
        M::POST,
        "/api/repos".into(),
        o_(&owner),
        Some(json!({"name":"T","localPath":local})),
    )
    .await;
    assert_eq!(st, 200, "{b}");
    let repo = b["repo"]["id"].as_str().unwrap().to_owned();
    let (st, b) = call(
        M::POST,
        format!("/api/repos/{repo}/todos"),
        o_(&owner),
        Some(json!({"message":"ship it"})),
    )
    .await;
    assert_eq!(st, 201, "{b}");
    let todo = b["todo"]["id"].as_str().unwrap().to_owned();
    let (st, b) = call(
        M::PATCH,
        format!("/api/jait-todos/{todo}"),
        o_(&other),
        Some(json!({"status":"done"})),
    )
    .await;
    assert_eq!(st, 404, "{b}");
    let (st, _) = call(
        M::DELETE,
        format!("/api/jait-todos/{todo}"),
        o_(&other),
        None,
    )
    .await;
    assert_eq!(st, 404);
    let (st, _) = call(
        M::PATCH,
        format!("/api/jait-todos/{todo}"),
        o_(&owner),
        Some(json!({"status":"bogus"})),
    )
    .await;
    assert_eq!(st, 400);
    let (st, b) = call(
        M::PATCH,
        format!("/api/jait-todos/{todo}"),
        o_(&owner),
        Some(json!({"status":"done","priority":"high"})),
    )
    .await;
    assert!(
        st == 200 && b["todo"]["status"] == "done" && b["todo"]["priority"] == "high",
        "{b}"
    );
    let (st, b) = call(
        M::DELETE,
        format!("/api/jait-todos/{todo}"),
        o_(&owner),
        None,
    )
    .await;
    assert!(st == 200 && b["ok"] == true, "{b}");
    let (st, _) = call(
        M::DELETE,
        format!("/api/jait-todos/{todo}"),
        o_(&owner),
        None,
    )
    .await;
    assert_eq!(st, 404);
    let _ = &other;
}

fn o_(t: &str) -> String {
    t.to_owned()
}

#[tokio::test]
async fn node_credentials_enforce_ownership_and_revocation_through_binary() {
    let gateway = Gateway::start();
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .unwrap();
    let register = client
        .post(format!("{}/api/auth/register", gateway.base))
        .json(&json!({"username":"owner", "password":"owner-pass-123"}))
        .send()
        .await
        .unwrap()
        .json::<Value>()
        .await
        .unwrap();
    let owner = register["access_token"].as_str().unwrap();
    let invite = client
        .post(format!("{}/api/auth/invitations", gateway.base))
        .bearer_auth(owner)
        .json(&json!({}))
        .send()
        .await
        .unwrap()
        .json::<Value>()
        .await
        .unwrap();
    let other = client.post(format!("{}/api/auth/register", gateway.base))
        .json(&json!({"username":"other", "password":"owner-pass-123", "invitation":invite["invitation"]}))
        .send().await.unwrap().json::<Value>().await.unwrap();
    let other = other["access_token"].as_str().unwrap();
    let db = rusqlite::Connection::open(gateway.directory.join("gateway.sqlite")).unwrap();
    let owner_id: String = db
        .query_row("SELECT id FROM users WHERE username='owner'", [], |row| {
            row.get(0)
        })
        .unwrap();
    db.execute("INSERT INTO nodes(node_id,first_seen_at,last_seen_at,created_at,updated_at,user_id) VALUES ('node-test','now','now','now','now',?1)", [&owner_id]).unwrap();
    let url = format!("{}/api/nodes/node-test/credential", gateway.base);
    assert_eq!(client.post(&url).send().await.unwrap().status(), 401);
    assert_eq!(
        client
            .post(&url)
            .bearer_auth(other)
            .send()
            .await
            .unwrap()
            .status(),
        404
    );
    assert_eq!(
        client
            .delete(&url)
            .bearer_auth(other)
            .send()
            .await
            .unwrap()
            .status(),
        404
    );
    assert_eq!(
        client
            .post(&url)
            .header("Origin", "https://untrusted.example")
            .send()
            .await
            .unwrap()
            .status(),
        403
    );
    let issued = client.post(&url).bearer_auth(owner).send().await.unwrap();
    assert_eq!(issued.status(), 200);
    let issued = issued.json::<Value>().await.unwrap();
    let credential = issued["credential"].as_str().unwrap();
    assert!(credential.starts_with("jait-node-"));
    let stored: String = db
        .query_row(
            "SELECT token_hash FROM node_credentials WHERE node_id='node-test'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    use sha2::{Digest, Sha256};
    assert_eq!(stored, hex::encode(Sha256::digest(credential.as_bytes())));
    let second = client.post(&url).bearer_auth(owner).send().await.unwrap();
    assert_eq!(second.status(), 200);
    let second = second.json::<Value>().await.unwrap();
    assert_ne!(second["credential"].as_str().unwrap(), credential);
    assert_eq!(
        client
            .delete(&url)
            .bearer_auth(other)
            .send()
            .await
            .unwrap()
            .status(),
        404
    );
    let count: i64 = db
        .query_row(
            "SELECT count(*) FROM node_credentials WHERE node_id='node-test'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(count, 2);
    assert_eq!(
        client
            .delete(&url)
            .bearer_auth(owner)
            .send()
            .await
            .unwrap()
            .status(),
        200
    );
    let count: i64 = db
        .query_row(
            "SELECT count(*) FROM node_credentials WHERE node_id='node-test'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(count, 0);
}

#[tokio::test]
async fn update_activation_is_unavailable_through_the_binary() {
    let gateway = Gateway::start();
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .unwrap();
    let register = client
        .post(format!("{}/api/auth/register", gateway.base))
        .json(&json!({"username":"owner", "password":"owner-pass-123"}))
        .send()
        .await
        .unwrap();
    assert_eq!(register.status(), 200);
    let register = register.json::<Value>().await.unwrap();
    let owner = register["access_token"].as_str().unwrap();
    let url = format!("{}/api/update/apply", gateway.base);
    assert_eq!(
        client
            .post(&url)
            .json(&json!({"version":"1.2.3"}))
            .send()
            .await
            .unwrap()
            .status(),
        401
    );
    let response = client
        .post(&url)
        .bearer_auth(owner)
        .json(&json!({"version":"1.2.3"}))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 409);
    let body = response.json::<Value>().await.unwrap();
    assert!(body["error"].as_str().unwrap().contains("systemd-managed"));
}

#[tokio::test]
async fn team_rooms_enforce_thread_ownership_and_persist_messages() {
    let gateway = Gateway::start();
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .unwrap();
    let base = &gateway.base;
    assert_eq!(
        client
            .get(format!("{base}/api/team-rooms"))
            .send()
            .await
            .unwrap()
            .status(),
        401
    );
    let owner: Value = client
        .post(format!("{base}/api/auth/register"))
        .json(&json!({"username":"owner", "password":"owner-pass-123"}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let owner = owner["access_token"].as_str().unwrap();
    let invitation: Value = client
        .post(format!("{base}/api/auth/invitations"))
        .bearer_auth(owner)
        .json(&json!({}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let other: Value = client.post(format!("{base}/api/auth/register"))
        .json(&json!({"username":"other", "password":"owner-pass-123", "invitation":invitation["invitation"]}))
        .send().await.unwrap().json().await.unwrap();
    let other = other["access_token"].as_str().unwrap();
    assert_eq!(
        client
            .put(format!("{base}/api/persona-agents/pa1"))
            .bearer_auth(owner)
            .json(&json!({"name":"Helper"}))
            .send()
            .await
            .unwrap()
            .status(),
        200
    );
    let db = rusqlite::Connection::open(gateway.directory.join("gateway.sqlite")).unwrap();
    let other_id: String = db
        .query_row("SELECT id FROM users WHERE username='other'", [], |row| {
            row.get(0)
        })
        .unwrap();
    db.execute("INSERT INTO agent_threads (id,user_id,title,provider_id,status,created_at,updated_at) VALUES ('foreign-thread',?1,'Other','test','idle','now','now')", [&other_id]).unwrap();
    let owner_id: String = db
        .query_row("SELECT id FROM users WHERE username='owner'", [], |row| {
            row.get(0)
        })
        .unwrap();
    db.execute("INSERT INTO agent_threads (id,user_id,title,provider_id,status,created_at,updated_at) VALUES ('owned-thread',?1,'Owner','test','idle','now','now')", [&owner_id]).unwrap();
    let collection = format!("{base}/api/team-rooms");
    let response = client
        .post(&collection)
        .bearer_auth(owner)
        .json(&json!({"agentId":"pa1", "sourceSessionId":"foreign-thread"}))
        .send()
        .await
        .unwrap();
    assert_eq!(
        response.status(),
        400,
        "foreign thread must not be accepted"
    );
    let response = client
        .post(&collection)
        .bearer_auth(owner)
        .json(&json!({"agentId":"pa1", "sourceSessionId":"owned-thread"}))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 200, "owned thread must be accepted");
    let room: Value = client
        .post(&collection)
        .bearer_auth(owner)
        .json(&json!({"name":"Team", "memberIds":["pa1"]}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let room_id = room["room"]["id"].as_str().expect("room was created");
    let room_url = format!("{collection}/{room_id}");
    assert_eq!(
        client
            .get(&room_url)
            .bearer_auth(other)
            .send()
            .await
            .unwrap()
            .status(),
        404
    );
    let message_url = format!("{room_url}/messages");
    let payload = json!({"content":"hello", "clientKey":"first", "recipientIds":[]});
    let response = client
        .post(&message_url)
        .bearer_auth(owner)
        .json(&payload)
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 201);
    let message: Value = response.json().await.unwrap();
    let repeated: Value = client
        .post(&message_url)
        .bearer_auth(owner)
        .json(&payload)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(message["message"]["id"], repeated["message"]["id"]);
    let loaded: Value = client
        .get(&room_url)
        .bearer_auth(owner)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(loaded["messages"].as_array().unwrap().len(), 1);
    assert_eq!(loaded["messages"][0]["content"], "hello");
    let foreign: Value = client
        .get(&collection)
        .bearer_auth(other)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(foreign["rooms"], json!([]));
}

#[tokio::test]
async fn github_app_mount_fails_closed_without_a_native_host() {
    let gateway = Gateway::start();
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .unwrap();
    let list = format!("{}/api/github-apps", gateway.base);
    assert_eq!(client.get(&list).send().await.unwrap().status(), 401);
    let registration: Value = client
        .post(format!("{}/api/auth/register", gateway.base))
        .json(&json!({"username":"owner", "password":"owner-pass-123"}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let token = registration["access_token"].as_str().unwrap();
    let response = client.get(&list).bearer_auth(token).send().await.unwrap();
    assert_eq!(response.status(), 200);
    let body: Value = response.json().await.unwrap();
    assert_eq!(body["connections"], json!([]));
    assert_eq!(body["configured"], 0);
    let webhook = format!("{}/api/github/apps/webhook", gateway.base);
    let response = client
        .post(&webhook)
        .json(&json!({"installation":{"id":123}}))
        .header("x-hub-signature-256", "sha256=invalid")
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 500);
    let response = client
        .post(&webhook)
        .json(&json!({}))
        .header("x-github-delivery", "first")
        .header("x-github-delivery", "second")
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 400);
    let body: Value = response.json().await.unwrap();
    assert_eq!(body["detail"], "ambiguous_headers");
}

#[tokio::test]
async fn agent_control_reports_unavailable_stop_and_isolates_owners() {
    let gateway = Gateway::start();
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .unwrap();
    let url = |path: &str| format!("{}{path}", gateway.base);
    assert_eq!(
        client
            .get(url("/api/agent-control"))
            .send()
            .await
            .unwrap()
            .status(),
        401
    );
    let owner: Value = client
        .post(url("/api/auth/register"))
        .json(&json!({"username":"owner", "password":"owner-pass-123"}))
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
        .json(&json!({"username":"other", "password":"owner-pass-123", "invitation":invite["invitation"]}))
        .send().await.unwrap().json().await.unwrap();
    let other = other["access_token"].as_str().unwrap();
    let mut owner_ws = WsClient::connect(&gateway.base, owner).await;
    let mut other_ws = WsClient::connect(&gateway.base, other).await;
    let response = client
        .post(url("/api/agent-control/halt"))
        .bearer_auth(owner)
        .json(&json!({"reason":"  maintenance  "}))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    let halted: Value = response.json().await.unwrap();
    assert_eq!(halted["state"]["halted"], true);
    assert_eq!(halted["state"]["reason"], "maintenance");
    let event = owner_ws
        .until("agent.halted", Duration::from_secs(2))
        .await
        .expect("owner receives halt event");
    assert_eq!(event["sessionId"], "");
    assert_eq!(event["payload"], halted["state"]);
    assert!(event["timestamp"].as_str().is_some());
    assert!(
        other_ws
            .until("agent.halted", Duration::from_millis(250))
            .await
            .is_none(),
        "halt event leaked to another owner"
    );
    assert_eq!(halted["stopped"], 0);
    assert!(
        halted["stopError"]
            .as_str()
            .unwrap()
            .contains("not available")
    );
    let state: Value = client
        .get(url("/api/agent-control"))
        .bearer_auth(other)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(state["state"]["halted"], false);
    let state: Value = client
        .get(url("/api/agent-control"))
        .bearer_auth(owner)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(state["state"]["halted"], true);
    let blocked = client
        .post(url("/api/threads"))
        .bearer_auth(owner)
        .json(&json!({}))
        .send()
        .await
        .unwrap();
    assert_eq!(blocked.status(), 409);
    let body: Value = blocked.json().await.unwrap();
    assert_eq!(body["code"], "agent_halted");
    assert_eq!(body["action"], "create-thread");
    assert_eq!(body["reason"], "maintenance");
    let other_create = client
        .post(url("/api/threads"))
        .bearer_auth(other)
        .json(&json!({}))
        .send()
        .await
        .unwrap();
    assert_eq!(other_create.status(), 400);
    let resumed: Value = client
        .post(url("/api/agent-control/resume"))
        .bearer_auth(owner)
        .json(&json!({}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(resumed["state"]["halted"], false);
    let event = owner_ws
        .until("agent.halted", Duration::from_secs(2))
        .await
        .expect("owner receives resume event");
    assert_eq!(event["payload"], resumed["state"]);
    assert!(
        other_ws
            .until("agent.halted", Duration::from_millis(250))
            .await
            .is_none(),
        "resume event leaked to another owner"
    );
    let after_resume = client
        .post(url("/api/threads"))
        .bearer_auth(owner)
        .json(&json!({}))
        .send()
        .await
        .unwrap();
    assert_eq!(after_resume.status(), 400);
}

#[tokio::test]
async fn plugin_mount_refuses_loading_without_native_host() {
    let gateway = Gateway::start();
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .unwrap();
    let url = |path: &str| format!("{}{path}", gateway.base);
    assert_eq!(
        client
            .get(url("/api/plugins"))
            .send()
            .await
            .unwrap()
            .status(),
        401
    );
    let registration: Value = client
        .post(url("/api/auth/register"))
        .json(&json!({"username":"owner", "password":"owner-pass-123"}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let token = registration["access_token"].as_str().unwrap();
    let response = client
        .get(url("/api/plugins"))
        .bearer_auth(token)
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    assert_eq!(response.json::<Value>().await.unwrap(), json!([]));
    let response = client
        .post(url("/api/plugins/example/enable"))
        .bearer_auth(token)
        .json(&json!({}))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 400);
    let body: Value = response.json().await.unwrap();
    assert!(body["error"].as_str().unwrap().contains("not available"));
    assert_eq!(
        client
            .get(url("/api/plugins/example"))
            .bearer_auth(token)
            .send()
            .await
            .unwrap()
            .status(),
        404
    );
}

#[tokio::test]
async fn maintenance_routes_enforce_auth_and_read_real_empty_store() {
    let gateway = Gateway::start();
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .unwrap();
    let url = |path: &str| format!("{}{path}", gateway.base);
    let unauthorized = client
        .get(url("/api/maintenance/runs"))
        .send()
        .await
        .unwrap();
    assert_eq!(unauthorized.status(), 401);
    let unauthorized_detail = client
        .get(url("/api/maintenance/runs/missing"))
        .send()
        .await
        .unwrap();
    assert_eq!(unauthorized_detail.status(), 401);
    let unauthorized_run = client
        .post(url("/api/maintenance/run"))
        .json(&json!({"repoId":"missing"}))
        .send()
        .await
        .unwrap();
    assert_eq!(unauthorized_run.status(), 401);

    let registered: Value = client
        .post(url("/api/auth/register"))
        .json(&json!({"username":"owner", "password":"owner-pass-123"}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let token = registered["access_token"].as_str().unwrap();
    let response = client
        .get(url("/api/maintenance/runs?jobId=missing&limit=1"))
        .bearer_auth(token)
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    assert_eq!(response.json::<Value>().await.unwrap(), json!({"runs":[]}));
    let response = client
        .get(url("/api/maintenance/runs/missing"))
        .bearer_auth(token)
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 404);
    assert_eq!(
        response.json::<Value>().await.unwrap(),
        json!({"error":"Run not found"})
    );
    let response = client
        .post(url("/api/maintenance/run"))
        .bearer_auth(token)
        .json(&json!({}))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 400);
    assert_eq!(
        response.json::<Value>().await.unwrap(),
        json!({"error":"repoId is required"})
    );
}

#[tokio::test]
async fn maintenance_reads_persisted_runs_with_node_filter_and_limit() {
    let gateway = Gateway::start();
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .unwrap();
    let url = |path: &str| format!("{}{path}", gateway.base);
    let registered: Value = client
        .post(url("/api/auth/register"))
        .json(&json!({"username":"owner", "password":"owner-pass-123"}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let token = registered["access_token"].as_str().unwrap();
    let db = rusqlite::Connection::open(gateway.directory.join("gateway.sqlite")).unwrap();
    for index in 0..150 {
        db.execute(
            "INSERT INTO scheduled_job_runs(id,job_id,status,triggered_by,output,started_at) VALUES(?1,'job-a','completed','maintenance','stored output',?2)",
            rusqlite::params![format!("run-{index:03}"), format!("2026-01-01T00:{:02}:{:02}Z", index / 60, index % 60)],
        ).unwrap();
    }
    db.execute(
        "INSERT INTO scheduled_job_runs(id,job_id,status,triggered_by,started_at) VALUES('other','job-b','failed','manual','2025-01-01T00:00:00Z')",
        [],
    ).unwrap();
    for index in 0..80 {
        db.execute(
            "INSERT INTO scheduled_job_runs(id,job_id,status,triggered_by,started_at) VALUES(?1,'job-b','failed','manual',?2)",
            rusqlite::params![format!("other-{index:03}"), format!("2025-01-01T00:{:02}:{:02}Z", index / 60, index % 60)],
        ).unwrap();
    }
    drop(db);

    let response = client
        .get(url("/api/maintenance/runs?jobId=job-a&limit=200"))
        .bearer_auth(token)
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    let body: Value = response.json().await.unwrap();
    let runs = body["runs"].as_array().unwrap();
    assert_eq!(runs.len(), 150);
    assert_eq!(runs[0]["id"], "run-149");
    assert_eq!(runs[0]["output"], "stored output");

    let response = client
        .get(url("/api/maintenance/runs?jobId=&limit=200"))
        .bearer_auth(token)
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    assert_eq!(
        response.json::<Value>().await.unwrap()["runs"]
            .as_array()
            .unwrap()
            .len(),
        200
    );

    for (query, expected) in [
        ("", 50),
        ("?limit=0", 50),
        ("?limit=-1", 1),
        ("?limit=999", 200),
    ] {
        let response = client
            .get(url(&format!("/api/maintenance/runs{query}")))
            .bearer_auth(token)
            .send()
            .await
            .unwrap();
        assert_eq!(response.status(), 200);
        let body: Value = response.json().await.unwrap();
        assert_eq!(body["runs"].as_array().unwrap().len(), expected, "{query}");
    }

    let response = client
        .get(url("/api/maintenance/runs/run-149"))
        .bearer_auth(token)
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    let run: Value = response.json().await.unwrap();
    assert_eq!(run["run"]["jobId"], "job-a");
    assert_eq!(run["run"]["triggeredBy"], "maintenance");
    assert_eq!(run["run"]["output"], "stored output");
}

#[tokio::test]
async fn maintenance_existing_repository_fails_closed_without_shell_consent() {
    let gateway = Gateway::start();
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .unwrap();
    let url = |path: &str| format!("{}{path}", gateway.base);
    let registered: Value = client
        .post(url("/api/auth/register"))
        .json(&json!({"username":"owner", "password":"owner-pass-123"}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let token = registered["access_token"].as_str().unwrap();
    let db = rusqlite::Connection::open(gateway.directory.join("gateway.sqlite")).unwrap();
    db.execute(
        "INSERT INTO automation_repositories(id,name,local_path,created_at,updated_at) VALUES('repo-a','test repo',?1,'2026-01-01','2026-01-01')",
        [gateway.directory.to_str().unwrap()],
    ).unwrap();
    drop(db);

    let response = client
        .post(url("/api/maintenance/run"))
        .bearer_auth(token)
        .json(&json!({"repoId":"repo-a"}))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 500);
    let body: Value = response.json().await.unwrap();
    assert_eq!(
        body["error"],
        "Maintenance checks require shell consent, which is not available in the Rust gateway yet"
    );

    let db = rusqlite::Connection::open(gateway.directory.join("gateway.sqlite")).unwrap();
    let count: i64 = db
        .query_row("SELECT COUNT(*) FROM scheduled_job_runs", [], |row| {
            row.get(0)
        })
        .unwrap();
    assert_eq!(count, 0, "refused execution must not create a run");
}

#[tokio::test]
async fn unavailable_integrations_are_authenticated_and_fail_closed_through_binary() {
    let gateway = Gateway::start();
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .unwrap();
    let url = |path: &str| format!("{}{path}", gateway.base);
    for path in ["/api/channels", "/api/plugins"] {
        assert_eq!(client.get(url(path)).send().await.unwrap().status(), 401);
    }
    let registration = client
        .post(url("/api/auth/register"))
        .json(&json!({"username":"owner", "password":"owner-pass-123"}))
        .send()
        .await
        .unwrap();
    assert_eq!(registration.status(), 200);
    let body = registration.json::<Value>().await.unwrap();
    let token = body["access_token"].as_str().unwrap();
    for path in ["/api/channels", "/api/plugins"] {
        let response = client
            .get(url(path))
            .bearer_auth(token)
            .send()
            .await
            .unwrap();
        assert_eq!(response.status(), 200);
        assert_eq!(response.json::<Value>().await.unwrap(), json!([]));
    }
    let response = client
        .post(url("/api/plugins/scan"))
        .bearer_auth(token)
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 500);
    assert_eq!(
        response.json::<Value>().await.unwrap()["message"],
        "Plugins are not available in the Rust gateway yet"
    );
    let response = client
        .post(url("/api/channels/telegram/start"))
        .bearer_auth(token)
        .json(&json!({}))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 400);
    assert_eq!(
        response.json::<Value>().await.unwrap()["error"],
        "No channel connectors are available in the Rust gateway yet"
    );
    for path in ["/hooks/wake", "/hooks/agent"] {
        assert_eq!(client.post(url(path)).send().await.unwrap().status(), 401);
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
