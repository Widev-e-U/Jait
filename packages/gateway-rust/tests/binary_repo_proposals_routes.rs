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
            .join("../../.jait/artifacts/binary-proposals-tests")
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
async fn repository_todos_and_proposal_aliases_are_owner_scoped() {
    let gateway = Gateway::start();
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .unwrap();
    let url = |path: &str| format!("{}{path}", gateway.base);
    let response = client
        .post(url("/api/auth/register"))
        .json(&json!({"username":"owner", "password":"owner-pass-123"}))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    let owner = response.json::<Value>().await.unwrap()["access_token"]
        .as_str()
        .unwrap()
        .to_owned();
    let response = client
        .post(url("/api/auth/invitations"))
        .bearer_auth(&owner)
        .json(&json!({}))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    let invitation = response.json::<Value>().await.unwrap()["invitation"].clone();
    let response = client
        .post(url("/api/auth/register"))
        .json(&json!({"username":"other", "password":"owner-pass-123", "invitation":invitation}))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    let other = response.json::<Value>().await.unwrap()["access_token"]
        .as_str()
        .unwrap()
        .to_owned();
    let response = client
        .post(url("/api/repos"))
        .bearer_auth(&owner)
        .json(
            &json!({"name":"Repo", "localPath": gateway.directory.join("repo").to_string_lossy()}),
        )
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    let repo = response.json::<Value>().await.unwrap()["repo"]["id"]
        .as_str()
        .unwrap()
        .to_owned();
    let todos = format!("/api/repos/{repo}/todos");
    let proposals = format!("/api/repos/{repo}/proposals");
    let response = client.get(url(&todos)).send().await.unwrap();
    assert_eq!(response.status(), 401);
    let response = client
        .post(url(&proposals))
        .bearer_auth(&other)
        .json(&json!({"message":"unauthorized"}))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 404);
    let response = client
        .post(url(&format!("{todos}/generate")))
        .bearer_auth(&other)
        .json(&json!({}))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 404);
    let response = client
        .post(url(&todos))
        .bearer_auth(&owner)
        .json(&json!({"message":"  Fix bug  ", "tags":[" Bug ","bug","UX"], "priority":"high"}))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 201);
    let created = response.json::<Value>().await.unwrap();
    let id = created["todo"]["id"].as_str().unwrap();
    assert_eq!(created["todo"]["message"], "Fix bug");
    assert_eq!(created["todo"]["priority"], "high");
    assert_eq!(
        serde_json::from_str::<Value>(created["todo"]["tags"].as_str().unwrap()).unwrap(),
        json!(["bug", "ux"])
    );
    let response = client
        .get(url(&proposals))
        .bearer_auth(&owner)
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    let list = response.json::<Value>().await.unwrap();
    assert_eq!(list["proposals"][0]["id"], id);
    for path in [&todos, &proposals] {
        let response = client
            .get(url(path))
            .bearer_auth(&other)
            .send()
            .await
            .unwrap();
        assert_eq!(response.status(), 404);
    }
    let alias = format!("/api/repo-proposals/{id}");
    let todo = format!("/api/jait-todos/{id}");
    let response = client
        .patch(url(&alias))
        .bearer_auth(&other)
        .json(&json!({"status":"done"}))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 404);
    let response = client
        .delete(url(&todo))
        .bearer_auth(&other)
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 404);
    let response = client
        .patch(url(&alias))
        .bearer_auth(&owner)
        .json(&json!({"status":"invalid"}))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 400);
    let response = client
        .patch(url(&alias))
        .bearer_auth(&owner)
        .json(&json!({"status":"done"}))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    assert_eq!(
        response.json::<Value>().await.unwrap()["proposal"]["status"],
        "done"
    );
    // POST /api/repos/:repoId/proposals creates a proposal for the owner. DELETE /api/repo-proposals/:id
    // removes it for the owner; a non-owner gets the same 404 as the other owner-scoped routes.
    let response = client
        .post(url(&proposals))
        .bearer_auth(&owner)
        .json(&json!({"message":"Write the changelog"}))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 201);
    let extra = response.json::<Value>().await.unwrap()["proposal"]["id"]
        .as_str()
        .unwrap()
        .to_owned();
    let extra_alias = format!("/api/repo-proposals/{extra}");
    let response = client
        .delete(url(&extra_alias))
        .bearer_auth(&other)
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 404);
    let response = client
        .delete(url(&extra_alias))
        .bearer_auth(&owner)
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    assert_eq!(response.json::<Value>().await.unwrap(), json!({"ok": true}));
    let response = client
        .post(url(&format!("{todos}/generate")))
        .bearer_auth(&owner)
        .json(&json!({}))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 503);
    let response = client
        .delete(url(&todo))
        .bearer_auth(&owner)
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    let response = client
        .get(url(&todos))
        .bearer_auth(&owner)
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    assert_eq!(response.json::<Value>().await.unwrap()["todos"], json!([]));
}
