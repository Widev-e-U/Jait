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
