//! Architecture requests through the real gateway executable and isolated storage.
#![cfg(unix)]
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
            .join("../../.jait/artifacts/binary-architecture-tests")
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
}

impl Drop for Gateway {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
        let _ = std::fs::remove_dir_all(&self.directory);
    }
}

#[tokio::test]
async fn architecture_refuses_linked_storage_outside_project() {
    use std::os::unix::fs::{PermissionsExt, symlink};
    let gateway = Gateway::start();
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(45))
        .build()
        .unwrap();
    let project = gateway.directory.join("project");
    let outside = gateway.directory.join("outside");
    std::fs::create_dir_all(&project).unwrap();
    std::fs::set_permissions(&project, std::fs::Permissions::from_mode(0o700)).unwrap();
    std::fs::create_dir_all(&outside).unwrap();
    let sentinel = outside.join("architecture.mmd");
    std::fs::write(&sentinel, "outside sentinel").unwrap();
    symlink(&outside, project.join(".jait")).unwrap();
    let login: Value = client
        .post(format!("{}/api/auth/register", gateway.base))
        .json(&json!({"username":"owner", "password":"owner-pass-123"}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let token = login["access_token"].as_str().unwrap();
    let url = format!("{}/api/architecture", gateway.base);
    let response = client
        .put(&url)
        .bearer_auth(token)
        .json(&json!({"projectRoot":project.to_str().unwrap(), "diagram":"graph TD; A-->B"}))
        .send()
        .await
        .unwrap();
    assert!(!response.status().is_success(), "linked write was accepted");
    assert_eq!(
        std::fs::read_to_string(&sentinel).unwrap(),
        "outside sentinel"
    );
    let query = url::form_urlencoded::Serializer::new(String::new())
        .append_pair("projectRoot", project.to_str().unwrap())
        .finish();
    let response = client
        .get(format!("{url}?{query}"))
        .bearer_auth(token)
        .send()
        .await
        .unwrap();
    let body: Value = response.json().await.unwrap();
    assert!(
        !body.to_string().contains("outside sentinel"),
        "linked file was exposed"
    );
    std::fs::remove_file(project.join(".jait")).unwrap();
    let response = client
        .put(&url)
        .bearer_auth(token)
        .json(&json!({"projectRoot":project.to_str().unwrap(), "diagram":" graph TD; A-->B "}))
        .send()
        .await
        .unwrap();
    let status = response.status();
    let text = response.text().await.unwrap();
    assert_eq!(status, 200, "{text}");
    let saved: Value = serde_json::from_str(&text).unwrap();
    assert_eq!(saved["diagram"]["diagram"], "graph TD; A-->B");
    let diagram = project.join(".jait/architecture.mmd");
    assert_eq!(
        std::fs::read_to_string(&diagram).unwrap(),
        "graph TD; A-->B\n"
    );
    let response = client
        .get(format!("{url}?{query}"))
        .bearer_auth(token)
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    let fetched: Value = response.json().await.unwrap();
    assert_eq!(fetched["diagram"]["diagram"], "graph TD; A-->B");

    std::fs::remove_file(&diagram).unwrap();
    std::fs::hard_link(&sentinel, &diagram).unwrap();
    let response = client
        .get(format!("{url}?{query}"))
        .bearer_auth(token)
        .send()
        .await
        .unwrap();
    assert!(
        !response.status().is_success(),
        "hard-linked file was exposed"
    );
    let response = client
        .put(&url)
        .bearer_auth(token)
        .json(&json!({"projectRoot":project.to_str().unwrap(), "diagram":"replacement"}))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    assert_eq!(
        std::fs::read_to_string(&sentinel).unwrap(),
        "outside sentinel"
    );
    assert_eq!(std::fs::read_to_string(&diagram).unwrap(), "replacement\n");
    std::fs::remove_file(&diagram).unwrap();
    symlink(&sentinel, &diagram).unwrap();
    let response = client
        .get(format!("{url}?{query}"))
        .bearer_auth(token)
        .send()
        .await
        .unwrap();
    assert!(!response.status().is_success(), "symbolic link was exposed");
    let response = client
        .put(&url)
        .bearer_auth(token)
        .json(&json!({"projectRoot":project.to_str().unwrap(), "diagram":"safe replacement"}))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    assert_eq!(
        std::fs::read_to_string(&sentinel).unwrap(),
        "outside sentinel"
    );
    assert_eq!(
        std::fs::read_to_string(&diagram).unwrap(),
        "safe replacement\n"
    );
}
