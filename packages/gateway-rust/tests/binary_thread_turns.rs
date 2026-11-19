//! Thread turns through the production binary: send, steer, approve, stop and interrupt. The
//! owner's OpenAI-compatible model asks for a consent-gated file write, so a turn waits for a
//! decision before it changes anything.
use jait_gateway::ws::{OpCode, read_frame, write_client_frame};
use serde_json::{Value, json};
use std::{
    io::{BufRead, BufReader},
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::{Arc, Mutex, mpsc},
    time::Duration,
};

const WAIT: Duration = Duration::from_secs(20);

struct Gateway {
    child: Child,
    directory: PathBuf,
    base: String,
}

impl Gateway {
    fn start() -> Self {
        let directory = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../.jait/artifacts/binary-thread-turns-tests")
            .join(uuid::Uuid::new_v4().to_string());
        std::fs::create_dir_all(&directory).unwrap();
        let directory = directory.canonicalize().unwrap();
        // The approved write in the consent test replaces this note.
        std::fs::write(directory.join("thread-note.txt"), "original\n").unwrap();
        let mut child = Command::new(env!("CARGO_BIN_EXE_jait-gateway"))
            .env_clear()
            .env("HOME", &directory)
            .env("PATH", std::env::var("PATH").unwrap_or_default())
            .env("JAIT_RUST_APPLICATION", "1")
            .env("JAIT_RUST_PORT", "0")
            .env("JAIT_RUST_PROJECT_ROOT", &directory)
            .env("JAIT_RUST_DB", directory.join("gateway.sqlite"))
            .env("JWT_SECRET", "isolated-thread-turns-secret")
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

/// Records each model request and answers from the newest message.
#[derive(Clone, Default)]
struct Model {
    requests: Arc<Mutex<Vec<Value>>>,
}

impl Model {
    /// Every tool message the model has been sent, so a tool that did not run shows its result.
    fn tool_results(&self) -> Value {
        let requests = self.requests.lock().unwrap();
        Value::Array(
            requests
                .iter()
                .flat_map(|body| body["messages"].as_array().cloned().unwrap_or_default())
                .filter(|message| message["role"] == "tool")
                .map(|message| message["content"].clone())
                .collect(),
        )
    }

    fn answer(&self, body: Value) -> String {
        let last = body["messages"]
            .as_array()
            .and_then(|messages| messages.last())
            .cloned()
            .unwrap_or(Value::Null);
        self.requests.lock().unwrap().push(body);
        let event = if last["role"] == "tool" {
            text_event("Note written.")
        } else {
            match last["content"].as_str().unwrap_or_default() {
                content if content.contains("start the note") => tool_call_event(),
                content if content.contains("steer please") => text_event("Steered answer."),
                content if content.contains("follow up please") => {
                    text_event("Follow-up answered.")
                }
                content if content.contains("create the report") => tool_call_for(
                    "call_2",
                    "file_write",
                    json!({"path": "notes/report.md", "content": "report from thread\n"}),
                ),
                content if content.contains("read the key") => {
                    tool_call_for("call_3", "file_read", json!({"path": ".ssh/id_rsa"}))
                }
                _ => text_event("Unexpected request."),
            }
        };
        format!("data: {event}\n\ndata: [DONE]\n\n")
    }
}

fn text_event(text: &str) -> Value {
    json!({"choices":[{"delta":{"content":text},"finish_reason":"stop"}]})
}

/// Asks for the consent-gated `file_write` tool on `thread-note.txt`.
fn tool_call_event() -> Value {
    tool_call_for(
        "call_1",
        "file_write",
        json!({"path": "thread-note.txt", "content": "from thread\n"}),
    )
}

/// Streams one tool call with the given id, tool name and arguments.
fn tool_call_for(id: &str, name: &str, arguments: Value) -> Value {
    let arguments = arguments.to_string();
    json!({"choices":[{"delta":{"tool_calls":[{"index":0,"id":id,"type":"function","function":{"name":name,"arguments":arguments}}]},"finish_reason":"tool_calls"}]})
}

/// Serves the fake model on an ephemeral port and returns its `/v1` base URL.
async fn serve_model(model: Model) -> (String, tokio::task::JoinHandle<()>) {
    let router = axum::Router::new().route(
        "/v1/chat/completions",
        axum::routing::post(move |axum::Json(body): axum::Json<Value>| {
            let model = model.clone();
            async move { ([("content-type", "text/event-stream")], model.answer(body)) }
        }),
    );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}/v1", listener.local_addr().unwrap());
    let task = tokio::spawn(async move { axum::serve(listener, router).await.unwrap() });
    (base, task)
}

/// Minimal WebSocket client over the gateway's own frame codec.
struct WsClient(tokio::net::TcpStream);

impl WsClient {
    async fn connect(base: &str, token: &str) -> Self {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        let host = base.trim_start_matches("http://");
        let mut stream = tokio::net::TcpStream::connect(host).await.unwrap();
        let request = format!(
            "GET /ws?token={token} HTTP/1.1\r\nHost: {host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n"
        );
        stream.write_all(request.as_bytes()).await.unwrap();
        let mut head = Vec::new();
        while !head.ends_with(b"\r\n\r\n") {
            head.push(stream.read_u8().await.unwrap());
        }
        assert!(String::from_utf8_lossy(&head).starts_with("HTTP/1.1 101"));
        Self(stream)
    }

    /// Next text message, or None if nothing arrives within `wait`.
    async fn next(&mut self, wait: Duration) -> Option<Value> {
        tokio::time::timeout(wait, async {
            loop {
                let frame = read_frame(&mut self.0, 1 << 20).await.unwrap()?;
                match frame.opcode {
                    OpCode::Text => return serde_json::from_str(frame.text()?).ok(),
                    OpCode::Ping => {
                        write_client_frame(&mut self.0, OpCode::Pong, &frame.payload, [1, 2, 3, 4])
                            .await
                            .unwrap()
                    }
                    OpCode::Pong => {}
                    _ => return None,
                }
            }
        })
        .await
        .ok()
        .flatten()
    }

    /// Waits for the next message of `kind`, skipping other traffic.
    async fn until(&mut self, kind: &str, wait: Duration) -> Option<Value> {
        let deadline = tokio::time::Instant::now() + wait;
        while let Some(left) = deadline.checked_duration_since(tokio::time::Instant::now()) {
            let message = self.next(left).await?;
            if message["type"] == kind {
                return Some(message);
            }
        }
        None
    }
}

fn client() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .unwrap()
}

async fn send_json(request: reqwest::RequestBuilder) -> (u16, Value) {
    let response = request.send().await.unwrap();
    let status = response.status().as_u16();
    let text = response.text().await.unwrap();
    (
        status,
        serde_json::from_str(&text).unwrap_or(Value::String(text)),
    )
}

async fn register(client: &reqwest::Client, base: &str) -> String {
    let registered: Value = client
        .post(format!("{base}/api/auth/register"))
        .json(&json!({"username":"owner","password":"owner-pass-123"}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    registered["access_token"].as_str().unwrap().to_owned()
}

/// Points the owner's saved settings at the fake model.
async fn configure_model(client: &reqwest::Client, base: &str, token: &str, model_base: &str) {
    let saved = client
        .patch(format!("{base}/api/auth/settings"))
        .bearer_auth(token)
        .json(&json!({
            "api_keys": {"OPENAI_BASE_URL": model_base, "OPENAI_API_KEY": "test-key"},
            "selected_model": "test-model"
        }))
        .send()
        .await
        .unwrap();
    assert_eq!(saved.status(), 200);
}

/// Registers `root` as the owner's project, creates a session on it and a native thread on that
/// session; returns (thread id, session id). File tools act only inside an owned project.
async fn new_thread(
    client: &reqwest::Client,
    base: &str,
    token: &str,
    root: &std::path::Path,
) -> (String, String) {
    let (_, providers) = send_json(
        client
            .get(format!("{base}/api/providers"))
            .bearer_auth(token),
    )
    .await;
    let provider = providers["providers"]
        .as_array()
        .or(providers.as_array())
        .unwrap()[0]["id"]
        .as_str()
        .unwrap()
        .to_owned();
    let (status, project) = send_json(
        client
            .post(format!("{base}/api/projects"))
            .bearer_auth(token)
            .json(&json!({"title":"thread turns","rootPath":root,"nodeId":"gateway"})),
    )
    .await;
    assert_eq!(status, 201, "{project}");
    let (_, session) = send_json(
        client
            .post(format!("{base}/api/sessions"))
            .bearer_auth(token)
            .json(&json!({"projectId":project["id"],"projectPath":root})),
    )
    .await;
    let session_id = session["id"].as_str().unwrap().to_owned();
    let (status, thread) = send_json(
        client
            .post(format!("{base}/api/threads"))
            .bearer_auth(token)
            .json(&json!({"title":"thread turn","providerId":provider,"sessionId":session_id})),
    )
    .await;
    assert_eq!(status, 201, "{thread}");
    (thread["id"].as_str().unwrap().to_owned(), session_id)
}

async fn thread_json(client: &reqwest::Client, base: &str, token: &str, id: &str) -> Value {
    send_json(
        client
            .get(format!("{base}/api/threads/{id}"))
            .bearer_auth(token),
    )
    .await
    .1
}

/// Polls the thread until it reports `expected`; the failure names the thread as last seen.
async fn wait_for_status(
    client: &reqwest::Client,
    base: &str,
    token: &str,
    id: &str,
    expected: &str,
) -> Value {
    let deadline = tokio::time::Instant::now() + WAIT;
    loop {
        let thread = thread_json(client, base, token, id).await;
        if thread["status"] == expected {
            return thread;
        }
        assert!(
            tokio::time::Instant::now() < deadline,
            "thread did not reach {expected}: {thread}"
        );
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
}

async fn session_messages(client: &reqwest::Client, base: &str, token: &str, id: &str) -> String {
    let (status, body) = send_json(
        client
            .get(format!("{base}/api/sessions/{id}/messages"))
            .bearer_auth(token),
    )
    .await;
    assert_eq!(status, 200, "{body}");
    body.to_string()
}

async fn post_json(
    client: &reqwest::Client,
    base: &str,
    token: &str,
    path: &str,
    body: Value,
) -> (u16, Value) {
    send_json(
        client
            .post(format!("{base}{path}"))
            .bearer_auth(token)
            .json(&body),
    )
    .await
}

#[tokio::test]
async fn thread_turn_waits_for_consent_and_completes_through_the_binary() {
    let model = Model::default();
    let (model_base, model_task) = serve_model(model.clone()).await;
    let gateway = Gateway::start();
    let client = client();
    let base = gateway.base.clone();
    let token = register(&client, &base).await;
    configure_model(&client, &base, &token, &model_base).await;
    let (thread, session) = new_thread(&client, &base, &token, &gateway.directory).await;
    let mut ws = WsClient::connect(&base, &token).await;

    let (status, body) = post_json(
        &client,
        &base,
        &token,
        &format!("/api/threads/{thread}/start"),
        json!({"message": "start the note"}),
    )
    .await;
    assert_eq!(status, 200, "{body}");
    let required = ws
        .until("consent.required", WAIT)
        .await
        .expect("the owner's socket receives the consent prompt");
    assert_eq!(required["payload"]["toolName"], "file.write", "{required}");
    let consent_id = required["payload"]["id"].as_str().unwrap().to_owned();
    assert_eq!(
        thread_json(&client, &base, &token, &thread).await["status"],
        "running"
    );

    // While the turn waits for consent, the thread is running and another message is refused.
    let (status, body) = post_json(
        &client,
        &base,
        &token,
        &format!("/api/threads/{thread}/send"),
        json!({"message": "follow up please"}),
    )
    .await;
    assert_eq!(status, 409, "{body}");
    assert_eq!(body["error"], "A turn is already in progress");

    // The approve route validates its body and refuses approval for native turns, as Node does.
    let (status, body) = post_json(
        &client,
        &base,
        &token,
        &format!("/api/threads/{thread}/approve"),
        json!({}),
    )
    .await;
    assert_eq!(status, 400, "{body}");
    let (status, body) = post_json(
        &client,
        &base,
        &token,
        "/api/threads/nope/approve",
        json!({"requestId": consent_id, "approved": true}),
    )
    .await;
    assert_eq!(status, 404, "{body}");
    let (status, body) = post_json(
        &client,
        &base,
        &token,
        &format!("/api/threads/{thread}/approve"),
        json!({"requestId": consent_id, "approved": true}),
    )
    .await;
    assert_eq!(status, 409, "{body}");
    assert_eq!(
        body["error"],
        "Thread approval is not supported by this provider"
    );
    assert_eq!(
        std::fs::read_to_string(gateway.directory.join("thread-note.txt")).unwrap(),
        "original\n",
        "the write must wait for consent"
    );

    // Approving the consent request runs the write, then the turn answers and completes.
    let (status, body) = post_json(
        &client,
        &base,
        &token,
        &format!("/api/consent/{consent_id}/approve"),
        json!({}),
    )
    .await;
    assert_eq!(status, 200, "{body}");
    let resolved = ws
        .until("consent.resolved", WAIT)
        .await
        .expect("the owner's socket receives the decision");
    assert_eq!(resolved["payload"]["requestId"], consent_id.as_str());
    assert_eq!(resolved["payload"]["approved"], true, "{resolved}");
    wait_for_status(&client, &base, &token, &thread, "completed").await;
    assert_eq!(
        std::fs::read_to_string(gateway.directory.join("thread-note.txt")).unwrap(),
        "from thread\n",
        "the approved write did not run; tool results: {}",
        model.tool_results()
    );
    assert!(
        session_messages(&client, &base, &token, &session)
            .await
            .contains("Note written.")
    );
    let requests = model.requests.lock().unwrap().clone();
    assert!(
        requests.iter().any(|body| {
            body["messages"]
                .as_array()
                .and_then(|messages| messages.last())
                .is_some_and(|last| last["role"] == "tool")
        }),
        "the approved write's result must reach the model"
    );

    // A completed thread accepts a follow-up turn on the same session.
    let (status, body) = post_json(
        &client,
        &base,
        &token,
        &format!("/api/threads/{thread}/send"),
        json!({"message": "follow up please"}),
    )
    .await;
    assert_eq!(status, 200, "{body}");
    wait_for_status(&client, &base, &token, &thread, "completed").await;
    assert!(
        session_messages(&client, &base, &token, &session)
            .await
            .contains("Follow-up answered.")
    );
    let (status, activities) = send_json(
        client
            .get(format!("{base}/api/threads/{thread}/activities"))
            .bearer_auth(&token),
    )
    .await;
    assert_eq!(status, 200, "{activities}");
    assert!(
        activities.to_string().contains("follow up please"),
        "{activities}"
    );
    model_task.abort();
}

#[tokio::test]
async fn thread_steer_replaces_a_turn_waiting_for_consent_through_the_binary() {
    let model = Model::default();
    let (model_base, model_task) = serve_model(model.clone()).await;
    let gateway = Gateway::start();
    let client = client();
    let base = gateway.base.clone();
    let token = register(&client, &base).await;
    configure_model(&client, &base, &token, &model_base).await;
    let (thread, session) = new_thread(&client, &base, &token, &gateway.directory).await;
    let mut ws = WsClient::connect(&base, &token).await;

    let (status, body) = post_json(
        &client,
        &base,
        &token,
        &format!("/api/threads/{thread}/start"),
        json!({"message": "start the note"}),
    )
    .await;
    assert_eq!(status, 200, "{body}");
    let required = ws
        .until("consent.required", WAIT)
        .await
        .expect("the owner's socket receives the consent prompt");
    let consent_id = required["payload"]["id"].as_str().unwrap().to_owned();

    // Steering stops the turn that waits for consent and starts a new one with the message.
    let (status, body) = post_json(
        &client,
        &base,
        &token,
        &format!("/api/threads/{thread}/steer"),
        json!({"message": "steer please"}),
    )
    .await;
    assert_eq!(status, 200, "{body}");
    assert_eq!(body["steered"], true, "{body}");
    wait_for_status(&client, &base, &token, &thread, "completed").await;
    assert!(
        session_messages(&client, &base, &token, &session)
            .await
            .contains("Steered answer.")
    );

    // The steered-away request is no longer open, so no stale prompt remains.
    let (status, pending) = send_json(
        client
            .get(format!("{base}/api/consent/pending"))
            .bearer_auth(&token),
    )
    .await;
    assert_eq!(status, 200, "{pending}");
    assert_eq!(pending["requests"], json!([]), "{pending}");

    // Approving the steered-away request cannot run its write.
    let (status, body) = post_json(
        &client,
        &base,
        &token,
        &format!("/api/consent/{consent_id}/approve"),
        json!({}),
    )
    .await;
    assert_ne!(status, 200, "{body}");
    tokio::time::sleep(Duration::from_millis(300)).await;
    assert_eq!(
        std::fs::read_to_string(gateway.directory.join("thread-note.txt")).unwrap(),
        "original\n",
        "a steered-away write must never run"
    );
    model_task.abort();
}

#[tokio::test]
async fn thread_stop_and_interrupt_match_the_node_contract_through_the_binary() {
    let gateway = Gateway::start();
    let client = client();
    let base = gateway.base.clone();
    let token = register(&client, &base).await;
    let (thread, _session) = new_thread(&client, &base, &token, &gateway.directory).await;

    // A native thread has no provider session to interrupt, so interrupt is refused as in Node.
    let (status, body) = post_json(
        &client,
        &base,
        &token,
        &format!("/api/threads/{thread}/interrupt"),
        json!({}),
    )
    .await;
    assert_eq!(status, 409, "{body}");
    assert_eq!(body["error"], "Thread has no active session");

    // Stop needs a signed-in owner and an owned thread.
    let anonymous = client
        .post(format!("{base}/api/threads/{thread}/stop"))
        .json(&json!({}))
        .send()
        .await
        .unwrap();
    assert_eq!(anonymous.status(), 401);
    let (status, body) =
        post_json(&client, &base, &token, "/api/threads/nope/stop", json!({})).await;
    assert_eq!(status, 404, "{body}");

    // Stop marks the native thread interrupted.
    let (status, body) = post_json(
        &client,
        &base,
        &token,
        &format!("/api/threads/{thread}/stop"),
        json!({}),
    )
    .await;
    assert_eq!(status, 200, "{body}");
    assert_eq!(body["ok"], true, "{body}");
    wait_for_status(&client, &base, &token, &thread, "interrupted").await;
}

/// Stopping a native turn that waits for consent interrupts it. The owner's socket hears the
/// interruption, no completed or error status follows, and approving the stale consent request
/// cannot run its write.
#[tokio::test]
async fn thread_stop_during_consent_broadcasts_interrupted_and_a_stale_approval_cannot_write() {
    let model = Model::default();
    let (model_base, model_task) = serve_model(model.clone()).await;
    let gateway = Gateway::start();
    let client = client();
    let base = gateway.base.clone();
    let token = register(&client, &base).await;
    configure_model(&client, &base, &token, &model_base).await;
    let (thread, _session) = new_thread(&client, &base, &token, &gateway.directory).await;
    let mut ws = WsClient::connect(&base, &token).await;

    let (status, body) = post_json(
        &client,
        &base,
        &token,
        &format!("/api/threads/{thread}/start"),
        json!({"message": "start the note"}),
    )
    .await;
    assert_eq!(status, 200, "{body}");
    let running = ws
        .until("thread.status", WAIT)
        .await
        .expect("the owner's socket hears the turn start");
    assert_eq!(running["payload"]["status"], "running", "{running}");
    let required = ws
        .until("consent.required", WAIT)
        .await
        .expect("the owner's socket receives the consent prompt");
    let consent_id = required["payload"]["id"].as_str().unwrap().to_owned();

    // Stop answers once the stopped turn has released its session.
    let (status, body) = post_json(
        &client,
        &base,
        &token,
        &format!("/api/threads/{thread}/stop"),
        json!({}),
    )
    .await;
    assert_eq!(status, 200, "{body}");
    assert_eq!(body["ok"], true, "{body}");
    let interrupted = ws
        .until("thread.status", WAIT)
        .await
        .expect("the owner's socket hears the stop");
    assert_eq!(interrupted["payload"]["threadId"], thread.as_str());
    assert_eq!(
        interrupted["payload"]["status"], "interrupted",
        "{interrupted}"
    );
    assert_eq!(
        interrupted["payload"]["thread"]["status"], "interrupted",
        "{interrupted}"
    );
    wait_for_status(&client, &base, &token, &thread, "interrupted").await;

    // Approving the stale request cannot run its write.
    let (status, body) = post_json(
        &client,
        &base,
        &token,
        &format!("/api/consent/{consent_id}/approve"),
        json!({}),
    )
    .await;
    assert_ne!(status, 200, "{body}");
    tokio::time::sleep(Duration::from_millis(300)).await;
    assert_eq!(
        std::fs::read_to_string(gateway.directory.join("thread-note.txt")).unwrap(),
        "original\n",
        "a stopped turn's write must never run"
    );

    // No completed or error status follows the stop.
    while let Some(later) = ws.until("thread.status", Duration::from_millis(800)).await {
        assert!(
            !matches!(
                later["payload"]["status"].as_str(),
                Some("completed" | "error")
            ),
            "{later}"
        );
    }
    assert_eq!(
        thread_json(&client, &base, &token, &thread).await["status"],
        "interrupted"
    );
    model_task.abort();
}

/// File tools in a native thread: an approved write creates a file in a directory that does not
/// exist yet, and a read of a denied secret path completes without consent and never returns the
/// file's contents to the model.
#[tokio::test]
async fn thread_file_tools_create_files_and_refuse_secret_paths_through_the_binary() {
    let model = Model::default();
    let (model_base, model_task) = serve_model(model.clone()).await;
    let gateway = Gateway::start();
    std::fs::create_dir_all(gateway.directory.join(".ssh")).unwrap();
    std::fs::write(gateway.directory.join(".ssh/id_rsa"), "PRIVATE KEY\n").unwrap();
    let client = client();
    let base = gateway.base.clone();
    let token = register(&client, &base).await;
    configure_model(&client, &base, &token, &model_base).await;
    let (thread, _session) = new_thread(&client, &base, &token, &gateway.directory).await;
    let mut ws = WsClient::connect(&base, &token).await;

    let (status, body) = post_json(
        &client,
        &base,
        &token,
        &format!("/api/threads/{thread}/start"),
        json!({"message": "create the report"}),
    )
    .await;
    assert_eq!(status, 200, "{body}");
    let required = ws
        .until("consent.required", WAIT)
        .await
        .expect("the owner's socket receives the consent prompt");
    assert_eq!(required["payload"]["toolName"], "file.write", "{required}");
    let consent_id = required["payload"]["id"].as_str().unwrap().to_owned();
    assert!(
        !gateway.directory.join("notes").exists(),
        "the create must wait for consent"
    );
    let (status, body) = post_json(
        &client,
        &base,
        &token,
        &format!("/api/consent/{consent_id}/approve"),
        json!({}),
    )
    .await;
    assert_eq!(status, 200, "{body}");
    wait_for_status(&client, &base, &token, &thread, "completed").await;
    assert_eq!(
        std::fs::read_to_string(gateway.directory.join("notes/report.md")).unwrap(),
        "report from thread\n",
        "the approved create did not run; tool results: {}",
        model.tool_results()
    );

    // file.read needs no consent, so this turn completes without a prompt. The denial must reach
    // the model, and the key's contents must not.
    let (status, body) = post_json(
        &client,
        &base,
        &token,
        &format!("/api/threads/{thread}/send"),
        json!({"message": "read the key"}),
    )
    .await;
    assert_eq!(status, 200, "{body}");
    wait_for_status(&client, &base, &token, &thread, "completed").await;
    let results = model.tool_results().to_string();
    assert!(results.contains("denied"), "{results}");
    assert!(!results.contains("PRIVATE KEY"), "{results}");
    model_task.abort();
}

/// `POST /api/consent/:id/approve-all` is the notification bulk approval. Through the binary it approves the pending
/// request in the owner's session, which runs the write and completes the turn. A stranger gets the 404 that Node
/// returns and leaves the request pending. A second bulk approval finds nothing pending.
#[tokio::test]
async fn consent_approve_all_resolves_the_pending_request_through_the_binary() {
    let model = Model::default();
    let (model_base, model_task) = serve_model(model.clone()).await;
    let gateway = Gateway::start();
    let client = client();
    let base = gateway.base.clone();
    let owner = register(&client, &base).await;
    configure_model(&client, &base, &owner, &model_base).await;
    let (thread, session) = new_thread(&client, &base, &owner, &gateway.directory).await;
    let mut ws = WsClient::connect(&base, &owner).await;

    let (status, body) = post_json(
        &client,
        &base,
        &owner,
        &format!("/api/threads/{thread}/start"),
        json!({"message": "start the note"}),
    )
    .await;
    assert_eq!(status, 200, "{body}");
    let required = ws
        .until("consent.required", WAIT)
        .await
        .expect("the owner's socket receives the consent prompt");
    let consent_id = required["payload"]["id"].as_str().unwrap().to_owned();
    let approve_all = format!("{base}/api/consent/{consent_id}/approve-all");
    assert_eq!(
        std::fs::read_to_string(gateway.directory.join("thread-note.txt")).unwrap(),
        "original\n",
        "the write must wait for consent"
    );

    let (status, body) = send_json(client.post(approve_all.as_str()).json(&json!({}))).await;
    assert_eq!(status, 401, "{body}");

    let invite: Value = client
        .post(format!("{base}/api/auth/invitations"))
        .bearer_auth(&owner)
        .json(&json!({}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let stranger: Value = client
        .post(format!("{base}/api/auth/register"))
        .json(&json!({
            "username": "stranger",
            "password": "owner-pass-123",
            "invitation": invite["invitation"],
        }))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let stranger = stranger["access_token"].as_str().unwrap().to_owned();
    let (status, body) = send_json(
        client
            .post(approve_all.as_str())
            .bearer_auth(&stranger)
            .json(&json!({})),
    )
    .await;
    assert_eq!(status, 404, "{body}");
    assert_eq!(body["error"], "NOT_FOUND", "{body}");
    let (_, pending) = send_json(
        client
            .get(format!("{base}/api/consent/pending"))
            .bearer_auth(&owner),
    )
    .await;
    assert_eq!(
        pending["requests"].as_array().map(Vec::len),
        Some(1),
        "{pending}"
    );

    let (status, body) = send_json(
        client
            .post(approve_all.as_str())
            .bearer_auth(&owner)
            .json(&json!({})),
    )
    .await;
    assert_eq!(status, 200, "{body}");
    assert_eq!(body["ok"], true, "{body}");
    assert_eq!(body["sessionId"], session.as_str(), "{body}");
    assert_eq!(body["approvedCount"], 1, "{body}");
    assert_eq!(body["requestIds"], json!([consent_id]), "{body}");
    let resolved = ws
        .until("consent.resolved", WAIT)
        .await
        .expect("the owner's socket receives the decision");
    assert_eq!(resolved["payload"]["requestId"], consent_id.as_str());
    assert_eq!(resolved["payload"]["approved"], true, "{resolved}");
    wait_for_status(&client, &base, &owner, &thread, "completed").await;
    assert_eq!(
        std::fs::read_to_string(gateway.directory.join("thread-note.txt")).unwrap(),
        "from thread\n",
        "the approved write did not run; tool results: {}",
        model.tool_results()
    );

    let (_, pending) = send_json(
        client
            .get(format!("{base}/api/consent/pending"))
            .bearer_auth(&owner),
    )
    .await;
    assert_eq!(pending["requests"], json!([]), "{pending}");
    let (status, body) = send_json(
        client
            .post(approve_all.as_str())
            .bearer_auth(&owner)
            .json(&json!({})),
    )
    .await;
    assert_eq!(status, 404, "{body}");
    assert_eq!(body["error"], "NOT_FOUND", "{body}");
    model_task.abort();
}
