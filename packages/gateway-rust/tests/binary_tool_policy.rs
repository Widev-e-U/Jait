//! Live user tool settings must apply to direct execution through the production binary.
use serde_json::{Value, json};
use std::{
    io::{BufRead, BufReader},
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::mpsc,
    time::{Duration, Instant},
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
    let missing_input = client
        .post(url("/api/tools/execute"))
        .bearer_auth(token)
        .json(&json!({"tool":"file.read", "sessionId":session_id}))
        .send()
        .await
        .unwrap()
        .json::<Value>()
        .await
        .unwrap();
    let null_input = client
        .post(url("/api/tools/execute"))
        .bearer_auth(token)
        .json(&json!({"tool":"file.read", "sessionId":session_id, "input":null}))
        .send()
        .await
        .unwrap()
        .json::<Value>()
        .await
        .unwrap();
    assert_eq!(null_input, missing_input);
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

#[tokio::test]
async fn direct_execution_rejects_invalid_request_bodies() {
    let gateway = Gateway::start();
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .unwrap();
    let url = |path: &str| format!("{}{path}", gateway.base);
    let token = client
        .post(url("/api/auth/register"))
        .json(&json!({"username":"owner", "password":"owner-pass-123"}))
        .send()
        .await
        .unwrap()
        .json::<Value>()
        .await
        .unwrap()["access_token"]
        .as_str()
        .unwrap()
        .to_owned();
    for (content_type, body, status, code) in [
        (
            "application/json",
            "{",
            400,
            "FST_ERR_CTP_INVALID_JSON_BODY",
        ),
        ("application/json", "", 400, "FST_ERR_CTP_EMPTY_JSON_BODY"),
        (
            "application/json",
            r#"{"tool":"file.read","input":{"__proto__":{}}}"#,
            400,
            "FST_ERR_CTP_INVALID_JSON_BODY",
        ),
        (
            "application/octet-stream",
            "{}",
            415,
            "FST_ERR_CTP_INVALID_MEDIA_TYPE",
        ),
    ] {
        let response = client
            .post(url("/api/tools/execute"))
            .bearer_auth(&token)
            .header("content-type", content_type)
            .body(body)
            .send()
            .await
            .unwrap();
        assert_eq!(response.status().as_u16(), status);
        assert_eq!(response.json::<Value>().await.unwrap()["code"], code);
    }
    let response = client
        .post(url("/api/tools/execute"))
        .bearer_auth(&token)
        .header("content-type", "application/json")
        .body("x".repeat(256 * 1024 + 1))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 413);
}

#[tokio::test]
async fn direct_execution_does_not_treat_remote_project_as_local() {
    let gateway = Gateway::start();
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .unwrap();
    let url = |path: &str| format!("{}{path}", gateway.base);
    let token = client
        .post(url("/api/auth/register"))
        .json(&json!({"username":"owner", "password":"owner-pass-123"}))
        .send()
        .await
        .unwrap()
        .json::<Value>()
        .await
        .unwrap()["access_token"]
        .as_str()
        .unwrap()
        .to_owned();
    let project = client
        .post(url("/api/projects"))
        .bearer_auth(&token)
        .json(&json!({"title":"Remote", "rootPath":gateway.directory, "nodeId":"remote-node"}))
        .send()
        .await
        .unwrap();
    assert_eq!(project.status(), 201);
    let project = project.json::<Value>().await.unwrap();
    let session = client
        .post(url("/api/sessions"))
        .bearer_auth(&token)
        .json(&json!({"projectId":project["id"], "projectPath":gateway.directory}))
        .send()
        .await
        .unwrap();
    assert_eq!(session.status(), 201);
    let session = session.json::<Value>().await.unwrap();
    for node in [Value::Null, json!("gateway"), json!("remote-node")] {
        let response = client.post(url("/api/tools/execute")).bearer_auth(&token)
            .json(&json!({"tool":"file.read", "sessionId":session["id"], "nodeId":node, "input":{"path":"notes.txt"}}))
            .send().await.unwrap();
        assert_eq!(response.status(), 503);
        let body = response.json::<Value>().await.unwrap();
        assert_eq!(body["error"], "REMOTE_NODE_UNAVAILABLE");
        assert!(!body.to_string().contains("binary-policy-marker"));
    }
    // A child with a local node can inherit remote project authority.
    let child = client
        .post(url("/api/projects"))
        .bearer_auth(&token)
        .json(&json!({"title":"Child", "parentId":project["id"], "nodeId":"gateway"}))
        .send()
        .await
        .unwrap();
    assert_eq!(child.status(), 201);
    let child = child.json::<Value>().await.unwrap();
    let session = client
        .post(url("/api/sessions"))
        .bearer_auth(&token)
        .json(&json!({"projectId":child["id"], "projectPath":gateway.directory}))
        .send()
        .await
        .unwrap();
    assert_eq!(session.status(), 201);
    let session = session.json::<Value>().await.unwrap();
    let mcp = client
        .post(url("/mcp"))
        .bearer_auth(&token)
        .header("x-jait-session-id", session["id"].as_str().unwrap())
        .json(&json!({"jsonrpc":"2.0", "id":1, "method":"tools/call", "params":{"name":"file_read", "arguments":{"path":"notes.txt"}}}))
        .send().await.unwrap();
    assert_eq!(mcp.status(), 200);
    let mcp = mcp.json::<Value>().await.unwrap();
    assert_eq!(mcp["result"]["isError"], true, "{mcp}");
    assert!(!mcp.to_string().contains("binary-policy-marker"));
    // The next call uses current ancestry, not authority cached when the session was created.
    for (node, allowed) in [("gateway", true), ("remote-node", false)] {
        let update = client
            .patch(url(&format!(
                "/api/projects/{}",
                project["id"].as_str().unwrap()
            )))
            .bearer_auth(&token)
            .json(&json!({"nodeId":node}))
            .send()
            .await
            .unwrap();
        assert_eq!(update.status(), 200);
        let mcp = client.post(url("/mcp")).bearer_auth(&token)
            .header("x-jait-session-id", session["id"].as_str().unwrap())
            .json(&json!({"jsonrpc":"2.0", "id":2, "method":"tools/call", "params":{"name":"file_read", "arguments":{"path":"notes.txt"}}}))
            .send().await.unwrap().json::<Value>().await.unwrap();
        assert_eq!(mcp["result"]["isError"], !allowed, "{mcp}");
        assert_eq!(
            mcp.to_string().contains("binary-policy-marker"),
            allowed,
            "{mcp}"
        );
    }
    let response = client
        .post(url("/api/chat"))
        .bearer_auth(&token)
        .json(&json!({"sessionId":session["id"], "content":"read notes"}))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 503);
    assert_eq!(
        response.json::<Value>().await.unwrap()["error"],
        "REMOTE_NODE_UNAVAILABLE"
    );
    let providers = client
        .get(url("/api/providers"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap()
        .json::<Value>()
        .await
        .unwrap();
    let list = providers["providers"]
        .as_array()
        .or(providers.as_array())
        .unwrap();
    let provider = list[0]["id"].as_str().unwrap();
    let thread = client
        .post(url("/api/threads"))
        .bearer_auth(&token)
        .json(&json!({"title":"Remote", "sessionId":session["id"], "providerId":provider}))
        .send()
        .await
        .unwrap();
    assert_eq!(thread.status(), 201);
    let thread = thread.json::<Value>().await.unwrap();
    let response = client
        .post(url(&format!(
            "/api/threads/{}/start",
            thread["id"].as_str().unwrap()
        )))
        .bearer_auth(&token)
        .json(&json!({"message":"read notes"}))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 503);
    assert_eq!(
        response.json::<Value>().await.unwrap()["error"],
        "REMOTE_NODE_UNAVAILABLE"
    );
    let response = client
        .post(url("/api/tools/execute"))
        .bearer_auth(&token)
        .json(&json!({"tool":"file.read", "sessionId":session["id"], "input":{"path":"notes.txt"}}))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 503);
    assert_eq!(
        response.json::<Value>().await.unwrap()["error"],
        "REMOTE_NODE_UNAVAILABLE"
    );
}

#[tokio::test]
async fn project_authority_is_rechecked_after_tool_consent() {
    let gateway = Gateway::start();
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .unwrap();
    let url = |path: &str| format!("{}{path}", gateway.base);
    let token = client
        .post(url("/api/auth/register"))
        .json(&json!({"username":"owner", "password":"owner-pass-123"}))
        .send()
        .await
        .unwrap()
        .json::<Value>()
        .await
        .unwrap()["access_token"]
        .as_str()
        .unwrap()
        .to_owned();
    let project = client
        .post(url("/api/projects"))
        .bearer_auth(&token)
        .json(&json!({"title":"Local", "rootPath":gateway.directory, "nodeId":"gateway"}))
        .send()
        .await
        .unwrap()
        .json::<Value>()
        .await
        .unwrap();
    let session = client
        .post(url("/api/sessions"))
        .bearer_auth(&token)
        .json(&json!({"projectId":project["id"], "projectPath":gateway.directory}))
        .send()
        .await
        .unwrap()
        .json::<Value>()
        .await
        .unwrap();
    let session_id = session["id"].as_str().unwrap();
    for mcp in [false, true] {
        let patch = client
            .patch(url(&format!(
                "/api/projects/{}",
                project["id"].as_str().unwrap()
            )))
            .bearer_auth(&token)
            .json(&json!({"nodeId":"gateway"}))
            .send()
            .await
            .unwrap();
        assert_eq!(patch.status(), 200);
        let request = if mcp {
            client.post(url("/mcp")).bearer_auth(&token).header("x-jait-session-id", session_id)
                .json(&json!({"jsonrpc":"2.0", "id":1, "method":"tools/call", "params":{"name":"file_write", "arguments":{"path":"notes.txt", "content":"unauthorized-change"}}}))
        } else {
            client.post(url("/api/tools/execute")).bearer_auth(&token)
                .json(&json!({"tool":"file.write", "sessionId":session_id, "input":{"path":"notes.txt", "content":"unauthorized-change"}}))
        };
        let running = tokio::spawn(async move { request.send().await.unwrap() });
        let consent_id = tokio::time::timeout(Duration::from_secs(10), async {
            loop {
                let pending = client
                    .get(url("/api/consent/pending"))
                    .bearer_auth(&token)
                    .send()
                    .await
                    .unwrap()
                    .json::<Value>()
                    .await
                    .unwrap();
                if let Some(id) = pending["requests"]
                    .as_array()
                    .and_then(|r| r.first())
                    .and_then(|r| r["id"].as_str())
                {
                    break id.to_owned();
                }
                tokio::time::sleep(Duration::from_millis(25)).await;
            }
        })
        .await
        .expect("tool must request consent");
        let patch = client
            .patch(url(&format!(
                "/api/projects/{}",
                project["id"].as_str().unwrap()
            )))
            .bearer_auth(&token)
            .json(&json!({"nodeId":"remote-node"}))
            .send()
            .await
            .unwrap();
        assert_eq!(patch.status(), 200);
        let approved = client
            .post(url(&format!("/api/consent/{consent_id}/approve")))
            .bearer_auth(&token)
            .json(&json!({}))
            .send()
            .await
            .unwrap();
        assert_eq!(approved.status(), 200);
        let response = running.await.unwrap();
        let body = response.text().await.unwrap();
        assert!(
            body.contains("Project execution authority is no longer available"),
            "{body}"
        );
        assert_eq!(
            std::fs::read_to_string(gateway.directory.join("notes.txt")).unwrap(),
            "binary-policy-marker"
        );
    }
}

#[tokio::test]
async fn session_root_removal_is_rechecked_after_tool_consent() {
    let gateway = Gateway::start();
    let original_root = gateway.directory.join("original");
    std::fs::create_dir(&original_root).unwrap();
    std::fs::write(original_root.join("notes.txt"), "binary-policy-marker").unwrap();
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .unwrap();
    let url = |path: &str| format!("{}{path}", gateway.base);
    let token = client
        .post(url("/api/auth/register"))
        .json(&json!({"username":"owner", "password":"owner-pass-123"}))
        .send()
        .await
        .unwrap()
        .json::<Value>()
        .await
        .unwrap()["access_token"]
        .as_str()
        .unwrap()
        .to_owned();
    let project = client
        .post(url("/api/projects"))
        .bearer_auth(&token)
        .json(&json!({"title":"Local", "rootPath":original_root, "nodeId":"gateway"}))
        .send()
        .await
        .unwrap()
        .json::<Value>()
        .await
        .unwrap();
    let session = client
        .post(url("/api/sessions"))
        .bearer_auth(&token)
        .json(&json!({"projectId":project["id"], "projectPath":original_root}))
        .send()
        .await
        .unwrap()
        .json::<Value>()
        .await
        .unwrap();
    let session_id = session["id"].as_str().unwrap();
    for mcp in [false, true] {
        let patch = client
            .post(url(&format!("/api/sessions/{session_id}/move")))
            .bearer_auth(&token)
            .json(&json!({"projectId":project["id"]}))
            .send()
            .await
            .unwrap();
        assert_eq!(patch.status(), 200);
        let request = if mcp {
            client.post(url("/mcp")).bearer_auth(&token).header("x-jait-session-id", session_id)
                .json(&json!({"jsonrpc":"2.0", "id":1, "method":"tools/call", "params":{"name":"file_write", "arguments":{"path":"notes.txt", "content":"unauthorized-change"}}}))
        } else {
            client.post(url("/api/tools/execute")).bearer_auth(&token)
                .json(&json!({"tool":"file.write", "sessionId":session_id, "input":{"path":"notes.txt", "content":"unauthorized-change"}}))
        };
        let running = tokio::spawn(async move { request.send().await.unwrap() });
        let consent_id = tokio::time::timeout(Duration::from_secs(10), async {
            loop {
                let pending = client
                    .get(url("/api/consent/pending"))
                    .bearer_auth(&token)
                    .send()
                    .await
                    .unwrap()
                    .json::<Value>()
                    .await
                    .unwrap();
                if let Some(id) = pending["requests"]
                    .as_array()
                    .and_then(|r| r.first())
                    .and_then(|r| r["id"].as_str())
                {
                    break id.to_owned();
                }
                tokio::time::sleep(Duration::from_millis(25)).await;
            }
        })
        .await
        .expect("tool must request consent");
        let patch = client
            .post(url(&format!("/api/sessions/{session_id}/move")))
            .bearer_auth(&token)
            .json(&json!({"projectId":null}))
            .send()
            .await
            .unwrap();
        assert_eq!(patch.status(), 200);
        let approved = client
            .post(url(&format!("/api/consent/{consent_id}/approve")))
            .bearer_auth(&token)
            .json(&json!({}))
            .send()
            .await
            .unwrap();
        assert_eq!(approved.status(), 200);
        let response = running.await.unwrap();
        let body = response.text().await.unwrap();
        assert!(
            body.contains("Project execution authority is no longer available"),
            "{body}"
        );
        assert_eq!(
            std::fs::read_to_string(original_root.join("notes.txt")).unwrap(),
            "binary-policy-marker"
        );
    }
}

#[tokio::test]
async fn project_revocation_stops_running_terminal_effect() {
    let gateway = Gateway::start();
    let original_root = gateway.directory.join("terminal-original");
    std::fs::create_dir(&original_root).unwrap();
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .unwrap();
    let url = |path: &str| format!("{}{path}", gateway.base);
    let token = client
        .post(url("/api/auth/register"))
        .json(&json!({"username":"owner", "password":"owner-pass-123"}))
        .send()
        .await
        .unwrap()
        .json::<Value>()
        .await
        .unwrap()["access_token"]
        .as_str()
        .unwrap()
        .to_owned();
    let project = client
        .post(url("/api/projects"))
        .bearer_auth(&token)
        .json(&json!({"title":"Local", "rootPath":original_root, "nodeId":"gateway"}))
        .send()
        .await
        .unwrap()
        .json::<Value>()
        .await
        .unwrap();
    let session = client
        .post(url("/api/sessions"))
        .bearer_auth(&token)
        .json(&json!({"projectId":project["id"], "projectPath":original_root}))
        .send()
        .await
        .unwrap()
        .json::<Value>()
        .await
        .unwrap();
    let session_id = session["id"].as_str().unwrap();
    let started_at = Instant::now();
    let request = client
        .post(url("/api/tools/execute"))
        .bearer_auth(&token)
        .json(&json!({"tool":"terminal.run", "sessionId":session_id, "input":{"command":"touch started && sleep 8 && touch finished"}}));
    let running = tokio::spawn(async move { request.send().await.unwrap().text().await.unwrap() });
    let consent_id = tokio::time::timeout(Duration::from_secs(10), async {
        loop {
            let pending = client
                .get(url("/api/consent/pending"))
                .bearer_auth(&token)
                .send()
                .await
                .unwrap()
                .json::<Value>()
                .await
                .unwrap();
            if let Some(id) = pending["requests"]
                .as_array()
                .and_then(|r| r.first())
                .and_then(|r| r["id"].as_str())
            {
                break id.to_owned();
            }
            tokio::time::sleep(Duration::from_millis(25)).await;
        }
    })
    .await
    .expect("terminal command must request consent");
    let approved = client
        .post(url(&format!("/api/consent/{consent_id}/approve")))
        .bearer_auth(&token)
        .json(&json!({}))
        .send()
        .await
        .unwrap();
    assert_eq!(approved.status(), 200);
    // Revoke only once the command is running, so the test covers an effect already in flight.
    tokio::time::timeout(Duration::from_secs(10), async {
        while !original_root.join("started").exists() {
            tokio::time::sleep(Duration::from_millis(25)).await;
        }
    })
    .await
    .expect("approved command must start");
    let moved = client
        .post(url(&format!("/api/sessions/{session_id}/move")))
        .bearer_auth(&token)
        .json(&json!({"projectId":null}))
        .send()
        .await
        .unwrap();
    assert_eq!(moved.status(), 200);
    // The command sleeps for 8 seconds; revocation must end it within the recheck period.
    let body = tokio::time::timeout(Duration::from_secs(5), running)
        .await
        .expect("revoked command must stop before its sleep ends")
        .unwrap();
    let body: Value = serde_json::from_str(&body).unwrap();
    assert_eq!(body["ok"], json!(false), "{body}");
    assert!(
        body["message"]
            .as_str()
            .unwrap_or_default()
            .contains("Project execution authority is no longer available"),
        "{body}"
    );
    // A surviving shell or sleep child would still create `finished` after its sleep.
    tokio::time::sleep(Duration::from_secs(10).saturating_sub(started_at.elapsed())).await;
    assert!(!original_root.join("finished").exists());
}
