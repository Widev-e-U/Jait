//! Authentication checks against the actual gateway executable, isolated from user state.
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
            .join("../../.jait/artifacts/binary-auth-tests")
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
            .env("JWT_SECRET", "isolated-binary-test-secret")
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
async fn binary_authentication_and_invitation_enforce_ownership() {
    let gateway = Gateway::start();
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(45))
        .build()
        .unwrap();
    let url = |path: &str| format!("{}{path}", gateway.base);
    let response = client.get(url("/api/auth/me")).send().await.unwrap();
    assert_eq!(response.status(), 401);
    let response = client
        .post(url("/api/auth/register"))
        .json(&json!({"username":"owner", "password":"owner-pass-123"}))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    let registered: Value = response.json().await.unwrap();
    let token = registered["access_token"].as_str().unwrap();
    let response = client
        .get(url("/api/auth/me"))
        .bearer_auth(token)
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    assert_eq!(response.json::<Value>().await.unwrap()["username"], "owner");
    let response = client
        .post(url("/api/auth/register"))
        .json(&json!({"username":"other", "password":"other-pass-123"}))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 403);
    let response = client
        .post(url("/api/auth/login"))
        .json(&json!({"username":"owner", "password":"wrong-password"}))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 401);
    let response = client
        .post(url("/api/auth/login"))
        .json(&json!({"username":"owner", "password":"owner-pass-123"}))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    assert!(response.json::<Value>().await.unwrap()["access_token"].is_string());
    let response = client
        .post(url("/api/auth/invitations"))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 401);
    let response = client
        .post(url("/api/auth/invitations"))
        .bearer_auth(token)
        .json(&json!({}))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    let invitation = response.json::<Value>().await.unwrap()["invitation"]
        .as_str()
        .unwrap()
        .to_owned();
    let response = client
        .post(url("/api/auth/register"))
        .json(&json!({"username":"other", "password":"other-pass-123", "invitation":invitation}))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    let other = response.json::<Value>().await.unwrap()["access_token"]
        .as_str()
        .unwrap()
        .to_owned();
    let response = client
        .get(url("/api/auth/me"))
        .bearer_auth(&other)
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    assert_eq!(response.json::<Value>().await.unwrap()["username"], "other");
    let response = client
        .post(url("/api/auth/register"))
        .json(&json!({"username":"third", "password":"third-pass-123", "invitation":invitation}))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 403);
    let response = client
        .post(url("/api/auth/invitations"))
        .bearer_auth(&other)
        .json(&json!({}))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 403);
    let response = client.get(url("/api/auth/settings")).send().await.unwrap();
    assert_eq!(response.status(), 401);
    let response = client
        .patch(url("/api/auth/settings"))
        .bearer_auth(token)
        .json(&json!({"theme":"dark"}))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    assert_eq!(response.json::<Value>().await.unwrap()["theme"], "dark");
    let response = client
        .get(url("/api/auth/settings"))
        .bearer_auth(&other)
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    assert_ne!(response.json::<Value>().await.unwrap()["theme"], "dark");
    // Exercise the remaining auth subroutes through the same composed executable.
    let env_url = url("/api/auth/settings/env-status");
    assert_eq!(client.get(&env_url).send().await.unwrap().status(), 401);
    let env_status = client
        .get(&env_url)
        .bearer_auth(token)
        .send()
        .await
        .unwrap();
    assert_eq!(env_status.status(), 200);
    assert!(env_status.json::<Value>().await.unwrap()["env_set"].is_object());

    let tools_url = url("/api/auth/settings/tools");
    assert_eq!(client.get(&tools_url).send().await.unwrap().status(), 401);
    assert_eq!(
        client
            .patch(&tools_url)
            .json(&json!({"disabled_tools":[]}))
            .send()
            .await
            .unwrap()
            .status(),
        401
    );
    let listed = client
        .get(&tools_url)
        .bearer_auth(token)
        .send()
        .await
        .unwrap();
    assert_eq!(listed.status(), 200);
    let listed = listed.json::<Value>().await.unwrap();
    let tools = listed["tools"].as_array().unwrap();
    let optional = tools.iter().find(|tool| tool["locked"] == false).unwrap()["name"]
        .as_str()
        .unwrap();
    assert_eq!(
        client
            .patch(&tools_url)
            .bearer_auth(token)
            .json(&json!({"disabled_tools":"bad"}))
            .send()
            .await
            .unwrap()
            .status(),
        400
    );
    let updated = client
        .patch(&tools_url)
        .bearer_auth(token)
        .json(&json!({"disabled_tools":["nonexistent-tool", optional]}))
        .send()
        .await
        .unwrap();
    assert_eq!(updated.status(), 200);
    let disabled = updated.json::<Value>().await.unwrap();
    assert_eq!(disabled["disabled_tools"], json!([optional]));
    let other_tools = client
        .get(&tools_url)
        .bearer_auth(&other)
        .send()
        .await
        .unwrap()
        .json::<Value>()
        .await
        .unwrap();
    assert_eq!(other_tools["disabled_count"], 0);

    let bind_url = url("/api/auth/session/bind");
    assert_eq!(
        client
            .post(&bind_url)
            .json(&json!({}))
            .send()
            .await
            .unwrap()
            .status(),
        401
    );
    assert_eq!(
        client
            .post(&bind_url)
            .bearer_auth(token)
            .json(&json!({}))
            .send()
            .await
            .unwrap()
            .status(),
        400
    );
    assert_eq!(
        client
            .post(&bind_url)
            .bearer_auth(token)
            .json(&json!({"session_id":"missing"}))
            .send()
            .await
            .unwrap()
            .status(),
        404
    );
    let session = client
        .post(url("/api/sessions"))
        .bearer_auth(token)
        .json(&json!({}))
        .send()
        .await
        .unwrap();
    assert_eq!(session.status(), 201);
    let session = session.json::<Value>().await.unwrap();
    let session_id = session["id"].as_str().unwrap();
    assert_eq!(
        client
            .post(&bind_url)
            .bearer_auth(&other)
            .json(&json!({"session_id":session_id}))
            .send()
            .await
            .unwrap()
            .status(),
        404
    );
    assert_eq!(
        client
            .post(&bind_url)
            .bearer_auth(token)
            .json(&json!({"session_id":session_id}))
            .send()
            .await
            .unwrap()
            .status(),
        200
    );

    let archive_url = url("/api/auth/settings/archive");
    assert_eq!(
        client.delete(&archive_url).send().await.unwrap().status(),
        401
    );
    let archive = client
        .delete(&archive_url)
        .bearer_auth(&other)
        .send()
        .await
        .unwrap();
    assert_eq!(archive.status(), 200);
    assert_eq!(archive.json::<Value>().await.unwrap()["removed"], 0);

    let response = client.post(url("/api/auth/refresh")).send().await.unwrap();
    assert_eq!(response.status(), 204);
    let response = client
        .post(url("/api/auth/refresh"))
        .bearer_auth(token)
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    assert!(response.json::<Value>().await.unwrap()["access_token"].is_string());
    let response = client
        .post(url("/api/auth/logout"))
        .bearer_auth(token)
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    assert!(
        response
            .headers()
            .get("set-cookie")
            .unwrap()
            .to_str()
            .unwrap()
            .contains("Max-Age=0")
    );
}
