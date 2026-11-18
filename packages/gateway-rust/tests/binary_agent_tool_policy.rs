//! Agent tool policy through the production binary.
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
            .join("../../.jait/artifacts/binary-agent-tool-policy-tests")
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
async fn disabled_tool_is_hidden_and_rejected_in_binary_chat() {
    exercise_agent_policy(false, false).await;
}

#[tokio::test]
async fn disabled_agent_tool_is_also_denied_by_direct_api() {
    exercise_agent_policy(true, false).await;
}

#[tokio::test]
async fn reenabled_tool_is_advertised_and_executed_in_new_chat() {
    exercise_agent_policy(true, true).await;
}

async fn exercise_agent_policy(check_direct: bool, reenable: bool) {
    use std::sync::{Arc, Mutex};
    let seen = Arc::new(Mutex::new(Vec::<Value>::new()));
    let model = axum::Router::new().route(
        "/v1/chat/completions",
        axum::routing::post({
            let seen = seen.clone();
            move |axum::Json(body): axum::Json<Value>| {
                let seen = seen.clone();
                async move {
                    let tool_result = body["messages"].as_array().unwrap().iter()
                        .rev().find(|m| m["role"] == "tool")
                        .map(|m| m["content"].to_string());
                    seen.lock().unwrap().push(body);
                    let event = match tool_result {
                        None => json!({"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"file_read","arguments":"{\"path\":\"notes.txt\"}"}}]},"finish_reason":"tool_calls"}]}),
                        Some(result) => json!({"choices":[{"delta":{"content":result},"finish_reason":"stop"}]}),
                    };
                    ([("content-type", "text/event-stream")], format!("data: {event}\n\ndata: [DONE]\n\n"))
                }
            }
        }),
    );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let model_base = format!("http://{}/v1", listener.local_addr().unwrap());
    let model_task = tokio::spawn(async move { axum::serve(listener, model).await.unwrap() });
    let gateway = Gateway::start();
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .unwrap();
    let url = |path: &str| format!("{}{path}", gateway.base);
    let registered: Value = client
        .post(url("/api/auth/register"))
        .json(&json!({"username":"owner", "password":"owner-pass-123"}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let token = registered["access_token"].as_str().unwrap();
    let settings = client
        .patch(url("/api/auth/settings"))
        .bearer_auth(token)
        .json(
            &json!({"api_keys":{"OPENAI_BASE_URL":model_base,"OPENAI_API_KEY":"test-key"},
            "selected_model":"test-model", "disabled_tools":["file.read"]}),
        )
        .send()
        .await
        .unwrap();
    assert_eq!(settings.status(), 200);
    let session: Value = client
        .post(url("/api/sessions"))
        .bearer_auth(token)
        .json(&json!({}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let session_id = session["id"].as_str().unwrap();
    let response = client
        .post(url("/api/chat"))
        .bearer_auth(token)
        .json(&json!({"sessionId":session_id, "content":"read notes"}))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    let body = response.text().await.unwrap();
    assert!(!body.contains("binary-policy-marker"), "{body}");
    let calls = seen.lock().unwrap().clone();
    assert_eq!(calls.len(), 2, "{calls:?}");
    assert!(
        !calls[0]["tools"]
            .as_array()
            .unwrap()
            .iter()
            .any(|tool| tool["function"]["name"] == "file_read")
    );
    assert!(calls[1].to_string().contains("not advertised"), "{calls:?}");
    assert!(!calls[1].to_string().contains("binary-policy-marker"));
    if !check_direct {
        model_task.abort();
        return;
    }
    if reenable {
        let settings = client
            .patch(url("/api/auth/settings"))
            .bearer_auth(token)
            .json(&json!({"disabled_tools":[]}))
            .send()
            .await
            .unwrap();
        assert_eq!(settings.status(), 200);
        let session: Value = client
            .post(url("/api/sessions"))
            .bearer_auth(token)
            .json(&json!({}))
            .send()
            .await
            .unwrap()
            .json()
            .await
            .unwrap();
        let response = client
            .post(url("/api/chat"))
            .bearer_auth(token)
            .json(&json!({"sessionId":session["id"], "content":"read notes"}))
            .send()
            .await
            .unwrap();
        assert_eq!(response.status(), 200);
        let body = response.text().await.unwrap();
        assert!(body.contains("binary-policy-marker"), "{body}");
        let calls = seen.lock().unwrap().clone();
        assert_eq!(calls.len(), 4, "{calls:?}");
        assert!(
            calls[2]["tools"]
                .as_array()
                .unwrap()
                .iter()
                .any(|tool| { tool["function"]["name"] == "file_read" }),
            "{calls:?}"
        );
        assert!(
            calls[3].to_string().contains("binary-policy-marker"),
            "{calls:?}"
        );
    }
    let direct: Value = client
        .post(url("/api/tools/execute"))
        .bearer_auth(token)
        .json(&json!({"tool":"file.read", "sessionId":session_id, "input":{"path":"notes.txt"}}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    if reenable {
        assert!(
            direct.to_string().contains("binary-policy-marker"),
            "{direct}"
        );
    } else {
        assert_eq!(direct["ok"], false, "{direct}");
        assert!(direct.to_string().contains("disabled"), "{direct}");
        assert!(
            !direct.to_string().contains("binary-policy-marker"),
            "{direct}"
        );
    }
    model_task.abort();
}
