//! Repository routes through the production binary.
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
            .join("../../.jait/artifacts/binary-node-credentials-tests")
            .join(uuid::Uuid::new_v4().to_string());
        std::fs::create_dir_all(&directory).unwrap();
        let directory = directory.canonicalize().unwrap();
        std::fs::write(directory.join("notes.txt"), "binary-policy-marker").unwrap();
        let mut child = Command::new(env!("CARGO_BIN_EXE_jait-gateway"))
            .env_clear()
            .env("HOME", &directory)
            .env("PATH", std::env::var_os("PATH").unwrap_or_default())
            .env("JAIT_RUST_APPLICATION", "1")
            .env("JAIT_RUST_PORT", "0")
            .env("JAIT_RUST_PROJECT_ROOT", &directory)
            .env("JAIT_RUST_DB", directory.join("gateway.sqlite"))
            .env("JWT_SECRET", "isolated-repos-secret")
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
async fn credential_issuance_and_revocation_are_owner_scoped() {
    use jait_gateway::services::node_credentials::NodeCredentialsService;
    let gateway = Gateway::start();
    let client = reqwest::Client::new();
    let owner = client
        .post(format!("{}/api/auth/register", gateway.base))
        .json(&json!({"username":"owner", "password":"owner-pass-123"}))
        .send()
        .await
        .unwrap()
        .json::<Value>()
        .await
        .unwrap();
    let token = owner["access_token"].as_str().unwrap();
    let invitation = client
        .post(format!("{}/api/auth/invitations", gateway.base))
        .bearer_auth(token)
        .json(&json!({}))
        .send()
        .await
        .unwrap()
        .json::<Value>()
        .await
        .unwrap()["invitation"]
        .clone();
    let other = client
        .post(format!("{}/api/auth/register", gateway.base))
        .json(&json!({"username":"other", "password":"owner-pass-123", "invitation":invitation}))
        .send()
        .await
        .unwrap()
        .json::<Value>()
        .await
        .unwrap();
    let other_token = other["access_token"].as_str().unwrap();
    let db = rusqlite::Connection::open(gateway.directory.join("gateway.sqlite")).unwrap();
    let owner_id: String = db
        .query_row("SELECT id FROM users WHERE username='owner'", [], |r| {
            r.get(0)
        })
        .unwrap();
    db.execute("INSERT INTO nodes(node_id, user_id, first_seen_at, last_seen_at, created_at, updated_at) VALUES('test-node', ?1, 'now', 'now', 'now', 'now')", [&owner_id]).unwrap();
    let endpoint = format!("{}/api/nodes/test-node/credential", gateway.base);
    assert_eq!(client.post(&endpoint).send().await.unwrap().status(), 401);
    assert_eq!(
        client
            .post(&endpoint)
            .bearer_auth(other_token)
            .send()
            .await
            .unwrap()
            .status(),
        404
    );
    assert_eq!(
        client
            .delete(&endpoint)
            .bearer_auth(other_token)
            .send()
            .await
            .unwrap()
            .status(),
        404
    );
    assert_eq!(
        client
            .post(&endpoint)
            .header("Origin", "https://untrusted.example")
            .send()
            .await
            .unwrap()
            .status(),
        403
    );
    let response = client
        .post(&endpoint)
        .bearer_auth(token)
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    let body = response.json::<Value>().await.unwrap();
    let credential = body["credential"].as_str().unwrap();
    assert!(credential.starts_with("jait-node-"));
    // A paired-node credential must not inherit the owner's HTTP authority.
    assert_eq!(
        client
            .get(format!("{}/api/auth/me", gateway.base))
            .bearer_auth(credential)
            .send()
            .await
            .unwrap()
            .status(),
        401
    );
    assert_eq!(
        client
            .post(&endpoint)
            .bearer_auth(credential)
            .send()
            .await
            .unwrap()
            .status(),
        401
    );
    // Both upgrade and message authentication admit a restricted node identity.
    let mut upgrade = node_ws_connect(&gateway.base, Some(credential)).await;
    assert_eq!(
        node_ws_read(&mut upgrade).await["payload"]["authenticated"],
        true
    );
    let mut message = node_ws_connect(&gateway.base, None).await;
    assert_eq!(
        node_ws_read(&mut message).await["payload"]["authenticated"],
        false
    );
    node_ws_send(
        &mut message,
        json!({"type":"authenticate", "token":credential}),
    )
    .await;
    assert_eq!(
        node_ws_read(&mut message).await["payload"]["authenticated"],
        true
    );
    for socket in [&mut upgrade, &mut message] {
        node_ws_send(socket, json!({"type":"subscribe", "sessionId":"other"})).await;
        assert_eq!(node_ws_read(socket).await["payload"]["code"], "FORBIDDEN");
    }
    // A paired node cannot claim another node ID while registration is unavailable.
    for socket in [&mut upgrade, &mut message] {
        node_ws_send(socket, json!({"type":"node.hello", "payload":{"id":"spoofed-node", "name":"Spoof", "platform":"linux"}})).await;
        assert_eq!(node_ws_read(socket).await["payload"]["code"], "FORBIDDEN");
    }
    // Even the credential's own ID must fail closed until registration can
    // revalidate ownership and connection generation atomically.
    for socket in [&mut upgrade, &mut message] {
        node_ws_send(socket, json!({"type":"node.hello", "payload":{"id":"test-node", "name":"Node", "platform":"linux"}})).await;
        assert_eq!(node_ws_read(socket).await["payload"]["code"], "FORBIDDEN");
    }
    let spoofed: i64 = db
        .query_row(
            "SELECT COUNT(*) FROM nodes WHERE node_id='spoofed-node'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(spoofed, 0);
    let service = NodeCredentialsService::new(Some(&db));
    let identity = service.resolve(credential).unwrap().unwrap();
    assert_eq!(identity.node_id, "test-node");
    assert_eq!(identity.user_id, owner_id);
    let stored: String = db
        .query_row(
            "SELECT token_hash FROM node_credentials WHERE node_id='test-node'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_ne!(stored, credential);
    assert_eq!(
        client
            .delete(&endpoint)
            .bearer_auth(other_token)
            .send()
            .await
            .unwrap()
            .status(),
        404
    );
    assert!(service.resolve(credential).unwrap().is_some());
    let second_body = client
        .post(&endpoint)
        .bearer_auth(token)
        .send()
        .await
        .unwrap()
        .json::<Value>()
        .await
        .unwrap();
    let second = second_body["credential"].as_str().unwrap();
    assert_ne!(credential, second);
    assert!(service.resolve(second).unwrap().is_some());

    // Simulate a persisted ownership change and check authority against the current
    // owner, including credentials issued before the change.
    let other_id: String = db
        .query_row("SELECT id FROM users WHERE username='other'", [], |r| {
            r.get(0)
        })
        .unwrap();
    // A pending transfer holds SQLite's write lock while the previous owner
    // attempts issuance or revocation. Once committed, neither request may
    // mutate credentials under the stale ownership decision.
    for method in [reqwest::Method::POST, reqwest::Method::DELETE] {
        db.execute_batch("BEGIN IMMEDIATE").unwrap();
        db.execute(
            "UPDATE nodes SET user_id=? WHERE node_id='test-node'",
            [&other_id],
        )
        .unwrap();
        let request = client.request(method, &endpoint).bearer_auth(token);
        let pending = tokio::spawn(async move { request.send().await.unwrap().status() });
        tokio::time::sleep(Duration::from_millis(200)).await;
        assert!(
            !pending.is_finished(),
            "request should wait for the transfer"
        );
        db.execute_batch("COMMIT").unwrap();
        assert_eq!(pending.await.unwrap(), 404);
        let count: i64 = db
            .query_row(
                "SELECT COUNT(*) FROM node_credentials WHERE node_id='test-node'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count, 2);
        db.execute(
            "UPDATE nodes SET user_id=? WHERE node_id='test-node'",
            [&owner_id],
        )
        .unwrap();
    }
    db.execute(
        "UPDATE nodes SET user_id=? WHERE node_id='test-node'",
        [&other_id],
    )
    .unwrap();
    assert!(service.resolve(credential).unwrap().is_none());
    assert!(service.resolve(second).unwrap().is_none());
    for socket in [&mut upgrade, &mut message] {
        node_ws_send(socket, json!({"type":"subscribe", "sessionId":"other"})).await;
        assert_eq!(
            node_ws_read(socket).await["payload"]["code"],
            "UNAUTHORIZED"
        );
    }

    assert_eq!(
        client
            .post(&endpoint)
            .bearer_auth(token)
            .send()
            .await
            .unwrap()
            .status(),
        404
    );
    assert_eq!(
        client
            .delete(&endpoint)
            .bearer_auth(token)
            .send()
            .await
            .unwrap()
            .status(),
        404
    );
    let transferred = client
        .post(&endpoint)
        .bearer_auth(other_token)
        .send()
        .await
        .unwrap();
    assert_eq!(transferred.status(), 200);
    let transferred_body = transferred.json::<Value>().await.unwrap();
    let transferred_token = transferred_body["credential"].as_str().unwrap();
    assert_eq!(
        service.resolve(transferred_token).unwrap().unwrap().user_id,
        other_id
    );
    let mut revoked_upgrade = node_ws_connect(&gateway.base, Some(transferred_token)).await;
    assert_eq!(
        node_ws_read(&mut revoked_upgrade).await["payload"]["authenticated"],
        true
    );
    let mut revoked_message = node_ws_connect(&gateway.base, None).await;
    assert_eq!(
        node_ws_read(&mut revoked_message).await["payload"]["authenticated"],
        false
    );
    node_ws_send(
        &mut revoked_message,
        json!({"type":"authenticate", "token":transferred_token}),
    )
    .await;
    assert_eq!(
        node_ws_read(&mut revoked_message).await["payload"]["authenticated"],
        true
    );
    assert_eq!(
        client
            .delete(&endpoint)
            .bearer_auth(other_token)
            .send()
            .await
            .unwrap()
            .status(),
        200
    );
    for socket in [&mut revoked_upgrade, &mut revoked_message] {
        node_ws_send(socket, json!({"type":"subscribe", "sessionId":"other"})).await;
        assert_eq!(
            node_ws_read(socket).await["payload"]["code"],
            "UNAUTHORIZED"
        );
    }
    assert!(service.resolve(credential).unwrap().is_none());
    assert!(service.resolve(second).unwrap().is_none());
    assert!(service.resolve(transferred_token).unwrap().is_none());
    let remaining: i64 = db
        .query_row(
            "SELECT COUNT(*) FROM node_credentials WHERE node_id='test-node'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(remaining, 0);
}

#[test]
fn in_memory_credentials_respect_ownership_and_revocation() {
    use jait_gateway::services::node_credentials::NodeCredentialsService;

    let mut service = NodeCredentialsService::new(None);
    assert!(service.bind("node", "owner").unwrap());
    assert!(!service.bind("node", "other").unwrap());
    assert!(service.issue("node", "other").unwrap().is_none());
    let token = service.issue("node", "owner").unwrap().unwrap();
    let identity = service.resolve(&token).unwrap().unwrap();
    assert_eq!(identity.user_id, "owner");
    assert_eq!(identity.node_id, "node");
    assert!(!service.revoke("node", "other").unwrap());
    assert!(service.resolve(&token).unwrap().is_some());
    assert!(service.revoke("node", "owner").unwrap());
    assert!(service.resolve(&token).unwrap().is_none());
}

#[test]
fn persisted_node_binding_rejects_missing_and_conflicting_owners() {
    use jait_gateway::services::node_credentials::NodeCredentialsService;
    let db = rusqlite::Connection::open_in_memory().unwrap();
    db.execute_batch("CREATE TABLE nodes (node_id TEXT PRIMARY KEY, user_id TEXT); INSERT INTO nodes VALUES ('node', NULL);").unwrap();
    let mut credentials = NodeCredentialsService::new(Some(&db));
    assert!(!credentials.bind("missing", "alice").unwrap());
    assert!(credentials.bind("node", "alice").unwrap());
    assert!(credentials.bind("node", "alice").unwrap());
    assert!(!credentials.bind("node", "bob").unwrap());
    assert_eq!(credentials.owner("node").unwrap().as_deref(), Some("alice"));
}

#[test]
fn concurrent_persisted_claims_have_exactly_one_owner() {
    use jait_gateway::services::node_credentials::NodeCredentialsService;
    use std::sync::{Arc, Barrier};
    let directory = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../.jait/artifacts/binary-node-credentials-tests")
        .join(uuid::Uuid::new_v4().to_string());
    std::fs::create_dir_all(&directory).unwrap();
    let path = directory.join("claims.sqlite");
    let db = rusqlite::Connection::open(&path).unwrap();
    db.execute_batch("CREATE TABLE nodes (node_id TEXT PRIMARY KEY, user_id TEXT); INSERT INTO nodes VALUES ('node', NULL);").unwrap();
    let barrier = Arc::new(Barrier::new(3));
    let threads: Vec<_> = ["alice", "bob"]
        .into_iter()
        .map(|user| {
            let path = path.clone();
            let barrier = barrier.clone();
            std::thread::spawn(move || {
                let db = rusqlite::Connection::open(path).unwrap();
                db.busy_timeout(Duration::from_secs(5)).unwrap();
                let mut service = NodeCredentialsService::new(Some(&db));
                barrier.wait();
                (user, service.bind("node", user).unwrap())
            })
        })
        .collect();
    barrier.wait();
    let results: Vec<_> = threads
        .into_iter()
        .map(|thread| thread.join().unwrap())
        .collect();
    assert_eq!(results.iter().filter(|(_, success)| *success).count(), 1);
    let winner = results.iter().find(|(_, success)| *success).unwrap().0;
    let owner: String = db
        .query_row(
            "SELECT user_id FROM nodes WHERE node_id='node'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(owner, winner);
    drop(db);
    std::fs::remove_dir_all(directory).unwrap();
}

#[test]
fn persisted_credential_stops_resolving_after_ownership_changes() {
    use jait_gateway::services::node_credentials::NodeCredentialsService;
    let db = rusqlite::Connection::open_in_memory().unwrap();
    db.execute_batch("CREATE TABLE users (id TEXT PRIMARY KEY); INSERT INTO users VALUES ('alice'); CREATE TABLE nodes (node_id TEXT PRIMARY KEY, user_id TEXT); CREATE TABLE node_credentials (token_hash TEXT PRIMARY KEY, node_id TEXT, user_id TEXT, created_at TEXT); INSERT INTO nodes VALUES ('node', 'alice');").unwrap();
    let mut service = NodeCredentialsService::new(Some(&db));
    let token = service.issue("node", "alice").unwrap().unwrap();
    assert!(service.resolve(&token).unwrap().is_some());
    db.execute("UPDATE nodes SET user_id='bob' WHERE node_id='node'", [])
        .unwrap();
    assert!(service.resolve(&token).unwrap().is_none());
    db.execute("DELETE FROM nodes WHERE node_id='node'", [])
        .unwrap();
    assert!(service.resolve(&token).unwrap().is_none());
}

#[test]
fn empty_node_or_owner_cannot_claim_or_issue_credentials() {
    use jait_gateway::services::node_credentials::NodeCredentialsService;
    let db = rusqlite::Connection::open_in_memory().unwrap();
    db.execute_batch("CREATE TABLE nodes (node_id TEXT PRIMARY KEY, user_id TEXT); CREATE TABLE node_credentials (token_hash TEXT PRIMARY KEY, node_id TEXT, user_id TEXT, created_at TEXT); INSERT INTO nodes VALUES ('node', ''), ('', 'alice');").unwrap();
    use sha2::{Digest, Sha256};
    let hash = hex::encode(Sha256::digest(b"legacy-token"));
    db.execute(
        "INSERT INTO node_credentials VALUES (?1, 'node', '', 'now')",
        [&hash],
    )
    .unwrap();
    assert!(
        NodeCredentialsService::new(Some(&db))
            .resolve("legacy-token")
            .unwrap()
            .is_none()
    );
    for database in [Some(&db), None] {
        let mut service = NodeCredentialsService::new(database);
        assert!(!service.bind("node", "").unwrap());
        assert!(!service.bind("", "alice").unwrap());
        assert!(service.issue("node", "").unwrap().is_none());
        assert!(service.issue("", "alice").unwrap().is_none());
        assert!(!service.revoke("node", "").unwrap());
    }
}

#[test]
fn credential_issuance_requires_live_owner_in_write_transaction() {
    use jait_gateway::services::node_credentials::NodeCredentialsService;
    let db = rusqlite::Connection::open_in_memory().unwrap();
    db.execute_batch("CREATE TABLE users (id TEXT PRIMARY KEY); CREATE TABLE nodes (node_id TEXT PRIMARY KEY, user_id TEXT); CREATE TABLE node_credentials (token_hash TEXT PRIMARY KEY, node_id TEXT, user_id TEXT, created_at TEXT); INSERT INTO nodes VALUES ('node', 'alice');").unwrap();
    let mut service = NodeCredentialsService::new(Some(&db));
    assert!(service.issue("node", "alice").unwrap().is_none());
    db.execute("INSERT INTO users VALUES ('alice')", [])
        .unwrap();
    assert!(service.issue("node", "alice").unwrap().is_some());
    db.execute("DELETE FROM users WHERE id='alice'", [])
        .unwrap();
    assert!(service.issue("node", "alice").unwrap().is_none());
    let count: i64 = db
        .query_row("SELECT COUNT(*) FROM node_credentials", [], |r| r.get(0))
        .unwrap();
    assert_eq!(count, 1);
}

#[test]
fn credential_database_failures_roll_back_and_leave_existing_tokens_usable() {
    use jait_gateway::services::node_credentials::NodeCredentialsService;
    let db = rusqlite::Connection::open_in_memory().unwrap();
    db.execute_batch("CREATE TABLE users (id TEXT PRIMARY KEY); INSERT INTO users VALUES ('alice'); CREATE TABLE nodes (node_id TEXT PRIMARY KEY, user_id TEXT); CREATE TABLE node_credentials (token_hash TEXT PRIMARY KEY, node_id TEXT, user_id TEXT, created_at TEXT); INSERT INTO nodes VALUES ('node', 'alice');").unwrap();
    let mut service = NodeCredentialsService::new(Some(&db));
    let original = service.issue("node", "alice").unwrap().unwrap();
    db.execute_batch("CREATE TRIGGER fail_insert BEFORE INSERT ON node_credentials BEGIN SELECT RAISE(ABORT, 'insert failed'); END;").unwrap();
    assert!(service.issue("node", "alice").is_err());
    assert!(service.resolve(&original).unwrap().is_some());
    db.execute_batch("DROP TRIGGER fail_insert; CREATE TRIGGER fail_delete BEFORE DELETE ON node_credentials BEGIN SELECT RAISE(ABORT, 'delete failed'); END;").unwrap();
    assert!(service.revoke("node", "alice").is_err());
    assert!(service.resolve(&original).unwrap().is_some());
    db.execute_batch("DROP TRIGGER fail_delete;").unwrap();
    assert!(service.revoke("node", "alice").unwrap());
    assert!(service.resolve(&original).unwrap().is_none());
}

async fn node_ws_connect(base: &str, token: Option<&str>) -> tokio::net::TcpStream {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    let host = base.trim_start_matches("http://");
    let mut stream = tokio::net::TcpStream::connect(host).await.unwrap();
    let path = token
        .map(|t| format!("/ws?token={t}"))
        .unwrap_or_else(|| "/ws".into());
    stream.write_all(format!("GET {path} HTTP/1.1\r\nHost: {host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n").as_bytes()).await.unwrap();
    let mut head = Vec::new();
    while !head.ends_with(b"\r\n\r\n") {
        head.push(stream.read_u8().await.unwrap());
    }
    assert!(String::from_utf8_lossy(&head).starts_with("HTTP/1.1 101"));
    stream
}
async fn node_ws_read(socket: &mut tokio::net::TcpStream) -> Value {
    let frame = tokio::time::timeout(
        Duration::from_secs(5),
        jait_gateway::ws::read_frame(socket, 1 << 20),
    )
    .await
    .unwrap()
    .unwrap()
    .unwrap();
    serde_json::from_str(frame.text().unwrap()).unwrap()
}
async fn node_ws_send(socket: &mut tokio::net::TcpStream, value: Value) {
    jait_gateway::ws::write_client_frame(
        socket,
        jait_gateway::ws::OpCode::Text,
        value.to_string().as_bytes(),
        [1, 2, 3, 4],
    )
    .await
    .unwrap();
}
