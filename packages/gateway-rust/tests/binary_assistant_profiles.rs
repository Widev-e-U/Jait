//! Assistant profile requests through the real gateway executable and isolated storage.
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
            .join("../../.jait/artifacts/binary-assistant-profile-tests")
            .join(uuid::Uuid::new_v4().to_string());
        std::fs::create_dir_all(&directory).unwrap();
        let directory = directory.canonicalize().unwrap();
        let (child, base) = Self::launch(&directory);
        Self {
            child,
            directory,
            base,
        }
    }

    fn launch(directory: &std::path::Path) -> (Child, String) {
        let mut child = Command::new(env!("CARGO_BIN_EXE_jait-gateway"))
            .env_clear()
            .env("HOME", directory)
            .env("JAIT_RUST_APPLICATION", "1")
            .env("JAIT_RUST_PORT", "0")
            .env("JAIT_RUST_PROJECT_ROOT", directory)
            .env("JAIT_RUST_DB", directory.join("gateway.sqlite"))
            .env("JWT_SECRET", "isolated-binary-profile-test-secret")
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
        (child, format!("http://{address}"))
    }

    fn restart(&mut self) {
        self.child.kill().unwrap();
        self.child.wait().unwrap();
        let (child, base) = Self::launch(&self.directory);
        self.child = child;
        self.base = base;
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
async fn assistant_profiles_are_persistent_and_owner_scoped() {
    let mut gateway = Gateway::start();
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(45))
        .build()
        .unwrap();
    let url = |base: &str, path: &str| format!("{base}{path}");
    let collection = url(&gateway.base, "/api/assistants/profiles");
    for method in [reqwest::Method::GET, reqwest::Method::POST] {
        assert_eq!(
            client
                .request(method, &collection)
                .send()
                .await
                .unwrap()
                .status(),
            401
        );
    }
    let owner = client
        .post(url(&gateway.base, "/api/auth/register"))
        .json(&json!({"username":"owner", "password":"owner-pass-123"}))
        .send()
        .await
        .unwrap()
        .json::<Value>()
        .await
        .unwrap();
    let owner = owner["access_token"].as_str().unwrap();
    let invitation = client
        .post(url(&gateway.base, "/api/auth/invitations"))
        .bearer_auth(owner)
        .json(&json!({}))
        .send()
        .await
        .unwrap()
        .json::<Value>()
        .await
        .unwrap();
    let other = client.post(url(&gateway.base, "/api/auth/register"))
        .json(&json!({"username":"other", "password":"other-pass-123", "invitation":invitation["invitation"]}))
        .send().await.unwrap().json::<Value>().await.unwrap();
    let other = other["access_token"].as_str().unwrap();
    let invalid = client
        .post(&collection)
        .bearer_auth(owner)
        .json(&json!({"name":"  "}))
        .send()
        .await
        .unwrap();
    assert_eq!(invalid.status(), 400);
    let created = client.post(&collection).bearer_auth(owner).json(&json!({
        "name":"  First  ", "description":"Original", "enabledSkills":["alpha", 7], "isDefault":false
    })).send().await.unwrap();
    assert_eq!(created.status(), 201);
    let created = created.json::<Value>().await.unwrap();
    let profile = &created["profile"];
    assert_eq!(profile["name"], "First");
    assert_eq!(profile["enabledSkills"], json!(["alpha"]));
    assert_eq!(profile["isDefault"], true);
    let id = profile["id"].as_str().unwrap();
    let item = format!("{collection}/{id}");
    for method in [
        reqwest::Method::GET,
        reqwest::Method::PATCH,
        reqwest::Method::DELETE,
    ] {
        assert_eq!(
            client
                .request(method.clone(), &item)
                .send()
                .await
                .unwrap()
                .status(),
            401
        );
        assert_eq!(
            client
                .request(method, &item)
                .bearer_auth(other)
                .json(&json!({"name":"stolen"}))
                .send()
                .await
                .unwrap()
                .status(),
            404
        );
    }
    let other_list = client
        .get(&collection)
        .bearer_auth(other)
        .send()
        .await
        .unwrap()
        .json::<Value>()
        .await
        .unwrap();
    assert_eq!(other_list["profiles"], json!([]));
    let updated = client
        .patch(&item)
        .bearer_auth(owner)
        .json(&json!({"description":"Updated", "runtimeMode":"supervised"}))
        .send()
        .await
        .unwrap();
    assert_eq!(updated.status(), 200);
    let updated = updated.json::<Value>().await.unwrap();
    assert_eq!(updated["profile"]["description"], "Updated");
    assert_eq!(updated["profile"]["runtimeMode"], "supervised");
    gateway.restart();
    let collection = url(&gateway.base, "/api/assistants/profiles");
    let item = format!("{collection}/{id}");
    let fetched = client.get(&item).bearer_auth(owner).send().await.unwrap();
    assert_eq!(fetched.status(), 200);
    let fetched = fetched.json::<Value>().await.unwrap();
    assert_eq!(fetched["profile"]["description"], "Updated");
    let listed = client
        .get(&collection)
        .bearer_auth(owner)
        .send()
        .await
        .unwrap()
        .json::<Value>()
        .await
        .unwrap();
    assert_eq!(listed["profiles"].as_array().unwrap().len(), 1);
    assert_eq!(
        client
            .delete(&item)
            .bearer_auth(owner)
            .send()
            .await
            .unwrap()
            .status(),
        204
    );
    assert_eq!(
        client
            .get(&item)
            .bearer_auth(owner)
            .send()
            .await
            .unwrap()
            .status(),
        404
    );
}
