//! Live user tool settings must apply to direct execution through the production binary.
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
            .join("../../.jait/artifacts/binary-tool-policy-tests")
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
            .env("JWT_SECRET", "isolated-tool-policy-test-secret")
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
async fn direct_execution_tracks_live_disabled_tool_settings() {
    let gateway = Gateway::start();
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .unwrap();
    let url = |path: &str| format!("{}{path}", gateway.base);
    let registered = client
        .post(url("/api/auth/register"))
        .json(&json!({"username":"owner", "password":"owner-pass-123"}))
        .send()
        .await
        .unwrap();
    assert_eq!(registered.status(), 200);
    let registered: Value = registered.json().await.unwrap();
    let token = registered["access_token"].as_str().unwrap();
    let session = client
        .post(url("/api/sessions"))
        .bearer_auth(token)
        .json(&json!({}))
        .send()
        .await
        .unwrap();
    assert_eq!(session.status(), 201);
    let session: Value = session.json().await.unwrap();
    let session_id = session["id"].as_str().unwrap();
    let execute = || async {
        let response = client
            .post(url("/api/tools/execute"))
            .bearer_auth(token)
            .json(
                &json!({"tool":"file.read", "sessionId":session_id, "input":{"path":"notes.txt"}}),
            )
            .send()
            .await
            .unwrap();
        assert_eq!(response.status(), 200);
        response.json::<Value>().await.unwrap()
    };
    let initial = execute().await;
    assert!(
        initial.to_string().contains("binary-policy-marker"),
        "{initial}"
    );
    for disabled in [true, false] {
        let tools = if disabled {
            json!(["file.read"])
        } else {
            json!([])
        };
        let response = client
            .patch(url("/api/auth/settings"))
            .bearer_auth(token)
            .json(&json!({"disabled_tools": tools}))
            .send()
            .await
            .unwrap();
        assert_eq!(response.status(), 200);
        let result = execute().await;
        if disabled {
            assert_eq!(result["ok"], false, "{result}");
            assert!(result.to_string().contains("disabled"), "{result}");
            assert!(
                !result.to_string().contains("binary-policy-marker"),
                "{result}"
            );
        } else {
            assert!(
                result.to_string().contains("binary-policy-marker"),
                "{result}"
            );
        }
    }
}
