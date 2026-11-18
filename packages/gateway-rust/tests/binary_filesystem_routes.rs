//! Filesystem requests through the real gateway executable and isolated storage.
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
            .join("../../.jait/artifacts/binary-filesystem-tests")
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
            .env("JWT_SECRET", "isolated-binary-filesystem-test-secret")
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
async fn remote_filesystem_requests_never_fall_back_to_local_browsing() {
    let gateway = Gateway::start();
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .unwrap();
    let nodes = format!("{}/api/filesystem/nodes", gateway.base);
    assert_eq!(client.get(&nodes).send().await.unwrap().status(), 401);
    for route in ["roots", "browse"] {
        let url = format!(
            "{}/api/filesystem/{route}?nodeId=remote-node&path=.",
            gateway.base
        );
        assert_eq!(client.get(url).send().await.unwrap().status(), 401);
    }
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
    let list: Value = client
        .get(&nodes)
        .bearer_auth(token)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert!(
        list["nodes"]
            .as_array()
            .unwrap()
            .iter()
            .any(|node| node["id"] == "gateway")
    );
    for route in ["roots", "browse"] {
        for node_query in [
            "nodeId=remote-node",
            "nodeId=gateway&nodeId=remote-node",
            "nodeId=remote-node&nodeId=gateway",
            "nodeId=&nodeId=remote-node",
            "nodeId=remote%2Dnode",
        ] {
            let response = client
                .get(format!(
                    "{}/api/filesystem/{route}?{node_query}&path=.",
                    gateway.base
                ))
                .bearer_auth(token)
                .send()
                .await
                .unwrap();
            assert_eq!(response.status(), 502);
            assert_eq!(
                response.json::<Value>().await.unwrap()["error"],
                "NODE_BROWSE_FAILED"
            );
        }
    }
    let response = client
        .get(format!(
            "{}/api/filesystem/roots?nodeId=gateway",
            gateway.base
        ))
        .bearer_auth(token)
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    assert!(response.json::<Value>().await.unwrap()["roots"].is_array());
}
