//! Terminal requests through the real gateway executable and isolated storage.
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
            .join("../../.jait/artifacts/binary-terminal-tests")
            .join(uuid::Uuid::new_v4().to_string());
        std::fs::create_dir_all(&directory).unwrap();
        let directory = directory.canonicalize().unwrap();
        let mut child = Command::new(env!("CARGO_BIN_EXE_jait-gateway"))
            .env_clear()
            .env("HOME", &directory)
            .env("JAIT_RUST_APPLICATION", "1")
            .env("JAIT_RUST_PORT", "0")
            .env("JAIT_RUST_PROJECT_ROOT", &directory)
            .env("JAIT_RUST_DB", directory.join("gateway.sqlite"))
            .env("JWT_SECRET", "isolated-binary-terminal-test-secret")
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
async fn explicit_gateway_terminal_is_local_and_remote_ids_are_denied() {
    let gateway = Gateway::start();
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(45))
        .build()
        .unwrap();
    let url = |path: &str| format!("{}{path}", gateway.base);
    let account = client
        .post(url("/api/auth/register"))
        .json(&json!({
            "username":"owner", "password":"owner-pass-123"
        }))
        .send()
        .await
        .unwrap()
        .json::<Value>()
        .await
        .unwrap();
    let token = account["access_token"].as_str().unwrap();
    let terminals = url("/api/terminals");
    assert_eq!(
        client
            .post(&terminals)
            .json(&json!({"nodeId":"gateway"}))
            .send()
            .await
            .unwrap()
            .status(),
        401
    );
    for remote in ["missing-node", " local "] {
        let response = client
            .post(&terminals)
            .bearer_auth(token)
            .json(&json!({"nodeId":remote}))
            .send()
            .await
            .unwrap();
        assert_eq!(response.status(), 404);
    }
    let response = client
        .post(&terminals)
        .bearer_auth(token)
        .json(&json!({"nodeId":" gateway "}))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 201);
    let terminal = response.json::<Value>().await.unwrap();
    let id = terminal["id"].as_str().unwrap();
    let item = url(&format!("/api/terminals/{id}"));
    let invitation = client
        .post(url("/api/auth/invitations"))
        .bearer_auth(token)
        .json(&json!({}))
        .send()
        .await
        .unwrap();
    assert_eq!(invitation.status(), 200);
    let invitation = invitation.json::<Value>().await.unwrap();
    let other = client
        .post(url("/api/auth/register"))
        .json(&json!({"username":"other", "password":"other-pass-123", "invitation":invitation["invitation"]}))
        .send()
        .await
        .unwrap();
    assert_eq!(other.status(), 200);
    let other = other.json::<Value>().await.unwrap();
    let other_token = other["access_token"].as_str().unwrap();
    for method in [reqwest::Method::GET, reqwest::Method::DELETE] {
        let response = client
            .request(method, &item)
            .bearer_auth(other_token)
            .send()
            .await
            .unwrap();
        assert_eq!(response.status(), 404);
    }
    assert_eq!(
        client
            .get(&item)
            .bearer_auth(token)
            .send()
            .await
            .unwrap()
            .status(),
        200
    );
    assert_eq!(
        client
            .delete(&item)
            .bearer_auth(token)
            .send()
            .await
            .unwrap()
            .status(),
        200
    );
}
