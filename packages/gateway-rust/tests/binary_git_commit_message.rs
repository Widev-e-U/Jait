//! Commit-message generation through the production binary. The owner's OpenAI-compatible model
//! answers the streamed request, so the fake model replies with server-sent events.
use serde_json::{Value, json};
use std::{
    io::{BufRead, BufReader},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{
        Arc, Mutex,
        atomic::{AtomicU8, Ordering},
        mpsc,
    },
    time::Duration,
};

/// How the fake model answers the next request.
const SSE_ANSWER: u8 = 0;
const HTTP_FAILURE: u8 = 1;
const PLAIN_JSON: u8 = 2;

struct Gateway {
    child: Child,
    directory: PathBuf,
    base: String,
}

impl Gateway {
    fn start() -> Self {
        let directory =
            std::env::temp_dir().join(format!("jait-commit-message-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&directory).unwrap();
        let directory = directory.canonicalize().unwrap();
        // The gateway needs git on PATH. Its HOME is isolated, so its global git config is empty.
        let mut child = Command::new(env!("CARGO_BIN_EXE_jait-gateway"))
            .env_clear()
            .env("HOME", &directory)
            .env("PATH", std::env::var("PATH").unwrap_or_default())
            .env("JAIT_RUST_APPLICATION", "1")
            .env("JAIT_RUST_PORT", "0")
            .env("JAIT_RUST_PROJECT_ROOT", &directory)
            .env("JAIT_RUST_DB", directory.join("gateway.sqlite"))
            .env("JWT_SECRET", "isolated-commit-message-test-secret")
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

/// One request the gateway sent to the model.
#[derive(Clone, Debug)]
struct RecordedRequest {
    authorization: Option<String>,
    body: Value,
}

/// Records every request the gateway sends to the model and answers as its mode says.
#[derive(Clone, Default)]
struct FakeModel {
    mode: Arc<AtomicU8>,
    requests: Arc<Mutex<Vec<RecordedRequest>>>,
}

impl FakeModel {
    fn respond(&self, headers: &axum::http::HeaderMap, body: Value) -> axum::response::Response {
        use axum::response::IntoResponse;
        let authorization = headers
            .get(axum::http::header::AUTHORIZATION)
            .and_then(|value| value.to_str().ok())
            .map(str::to_owned);
        self.requests.lock().unwrap().push(RecordedRequest {
            authorization,
            body,
        });
        match self.mode.load(Ordering::SeqCst) {
            HTTP_FAILURE => (
                axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                axum::Json(json!({"error": "provider rejected test-key"})),
            )
                .into_response(),
            PLAIN_JSON => axum::Json(json!({
                "choices": [{"message": {"role": "assistant", "content": "Update README greeting"}, "finish_reason": "stop"}]
            }))
            .into_response(),
            _ => (
                [(axum::http::header::CONTENT_TYPE, "text/event-stream")],
                concat!(
                    "data: {\"choices\":[{\"delta\":{\"role\":\"assistant\",\"content\":\"Update README \"}}]}\n\n",
                    "data: {\"choices\":[{\"delta\":{\"content\":\"greeting\\n\"}}]}\n\n",
                    "data: {\"choices\":[{\"delta\":{},\"finish_reason\":\"stop\"}]}\n\n",
                    "data: [DONE]\n\n",
                ),
            )
                .into_response(),
        }
    }
}

/// Serves the fake model on an ephemeral port and returns its `/v1` base URL.
async fn serve_model(model: FakeModel) -> (String, tokio::task::JoinHandle<()>) {
    let router = axum::Router::new().route(
        "/v1/chat/completions",
        axum::routing::post(
            move |headers: axum::http::HeaderMap, axum::Json(body): axum::Json<Value>| {
                let model = model.clone();
                async move { model.respond(&headers, body) }
            },
        ),
    );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}/v1", listener.local_addr().unwrap());
    let task = tokio::spawn(async move { axum::serve(listener, router).await.unwrap() });
    (base, task)
}

/// Repository setup uses the git CLI, so these commits are not part of the route under test.
fn git_cli(dir: &Path, args: &[&str]) {
    let output = Command::new("git")
        .arg("-C")
        .arg(dir)
        .args(args)
        .env("GIT_CONFIG_GLOBAL", "/dev/null")
        .env("GIT_CONFIG_NOSYSTEM", "1")
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "git {args:?}: {}",
        String::from_utf8_lossy(&output.stderr)
    );
}

/// Creates a repository with one commit that holds `README.md` as `hello`.
fn init_repo(dir: &Path) {
    std::fs::create_dir_all(dir).unwrap();
    git_cli(dir, &["init", "-q"]);
    git_cli(dir, &["config", "user.name", "Test Owner"]);
    git_cli(dir, &["config", "user.email", "owner@example.invalid"]);
    std::fs::write(dir.join("README.md"), "hello\n").unwrap();
    git_cli(dir, &["add", "README.md"]);
    git_cli(dir, &["commit", "-q", "-m", "Initial commit"]);
}

async fn register(
    client: &reqwest::Client,
    base: &str,
    username: &str,
    invitation: Option<&Value>,
) -> String {
    let mut body = json!({"username": username, "password": "owner-pass-123"});
    if let Some(invitation) = invitation {
        body["invitation"] = invitation.clone();
    }
    let response: Value = client
        .post(format!("{base}/api/auth/register"))
        .json(&body)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert!(response["access_token"].is_string(), "{response}");
    response["access_token"].as_str().unwrap().to_owned()
}

async fn register_project(
    client: &reqwest::Client,
    base: &str,
    token: &str,
    title: &str,
    root: &Path,
) {
    let response = client
        .post(format!("{base}/api/projects"))
        .bearer_auth(token)
        .json(&json!({"title": title, "rootPath": root}))
        .send()
        .await
        .unwrap();
    let status = response.status().as_u16();
    let body: Value = response.json().await.unwrap_or(Value::Null);
    assert_eq!(status, 201, "{body}");
}

async fn generate(
    client: &reqwest::Client,
    base: &str,
    token: Option<&str>,
    body: Value,
) -> (u16, Value) {
    let mut request = client
        .post(format!("{base}/api/git/generate-commit-message"))
        .json(&body);
    if let Some(token) = token {
        request = request.bearer_auth(token);
    }
    let response = request.send().await.unwrap();
    let status = response.status().as_u16();
    let text = response.text().await.unwrap();
    (
        status,
        serde_json::from_str(&text).unwrap_or(Value::String(text)),
    )
}

#[tokio::test]
async fn generate_commit_message_uses_the_owners_model_through_the_binary() {
    let model = FakeModel::default();
    let (model_base, model_task) = serve_model(model.clone()).await;
    let gateway = Gateway::start();
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .unwrap();
    let url = |path: &str| format!("{}{path}", gateway.base);
    let owner = register(&client, &gateway.base, "owner", None).await;
    let settings = client
        .patch(url("/api/auth/settings"))
        .bearer_auth(&owner)
        .json(&json!({"api_keys":{"OPENAI_BASE_URL":model_base, "OPENAI_API_KEY":"test-key"}, "selected_model":"test-model"}))
        .send()
        .await
        .unwrap();
    assert_eq!(settings.status(), 200);
    let invite: Value = client
        .post(url("/api/auth/invitations"))
        .bearer_auth(&owner)
        .json(&json!({}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let other = register(&client, &gateway.base, "other", Some(&invite["invitation"])).await;

    // `dirty` has an unstaged change, `clean` has none, and `outside` has a change but is never
    // registered as a project.
    let dirty = gateway.directory.join("dirty");
    let clean = gateway.directory.join("clean");
    let outside = gateway.directory.join("outside");
    for repo in [&dirty, &clean, &outside] {
        init_repo(repo);
    }
    std::fs::write(dirty.join("README.md"), "changed\n").unwrap();
    std::fs::write(outside.join("README.md"), "changed\n").unwrap();
    register_project(&client, &gateway.base, &owner, "dirty", &dirty).await;
    register_project(&client, &gateway.base, &owner, "clean", &clean).await;
    let model_calls = || model.requests.lock().unwrap().len();

    // Anonymous callers and callers without a cwd are refused before any git work.
    let (status, body) = generate(&client, &gateway.base, None, json!({"cwd": dirty})).await;
    assert_eq!(status, 401, "{body}");
    let (status, body) = generate(&client, &gateway.base, Some(&owner), json!({})).await;
    assert!(status == 400 && body["error"] == "Missing cwd", "{body}");

    // The root must be an active project the caller owns. A second account cannot use the
    // owner's repository, and an unregistered repository is refused for the owner too.
    let (status, body) = generate(
        &client,
        &gateway.base,
        Some(&owner),
        json!({"cwd": outside}),
    )
    .await;
    assert!(
        status == 403 && body["error"] == "Git root is not one of your projects",
        "{body}"
    );
    let (status, body) =
        generate(&client, &gateway.base, Some(&other), json!({"cwd": dirty})).await;
    assert!(
        status == 403 && body["error"] == "Git root is not one of your projects",
        "{body}"
    );

    // The CLI provider is not wired for commit messages, and an empty diff never reaches the model.
    let (status, body) = generate(
        &client,
        &gateway.base,
        Some(&owner),
        json!({"cwd": dirty, "provider": "cli"}),
    )
    .await;
    assert!(
        status == 501 && body["error"] == "CLI provider-backed commit generation is not configured",
        "{body}"
    );
    let (status, body) =
        generate(&client, &gateway.base, Some(&owner), json!({"cwd": clean})).await;
    assert!(
        status == 400 && body["error"] == "No changes to generate a commit message for",
        "{body}"
    );
    assert_eq!(model_calls(), 0);

    // The streamed answer is returned trimmed. The request carries the diff, the configured model
    // and the configured key, with the route's fixed sampling settings.
    let (status, body) =
        generate(&client, &gateway.base, Some(&owner), json!({"cwd": dirty})).await;
    assert!(
        status == 200 && body["message"] == "Update README greeting",
        "{body}"
    );
    let requests = model.requests.lock().unwrap().clone();
    assert_eq!(requests.len(), 1, "{requests:?}");
    let recorded = &requests[0];
    let request = &recorded.body;
    assert_eq!(recorded.authorization.as_deref(), Some("Bearer test-key"));
    assert_eq!(request["model"], "test-model", "{request}");
    assert_eq!(request["stream"], true, "{request}");
    assert_eq!(request["max_tokens"], 1024, "{request}");
    assert_eq!(request["temperature"], 0.3, "{request}");
    assert_eq!(request["messages"][0]["role"], "system", "{request}");
    let prompt = request["messages"][1]["content"].as_str().unwrap();
    assert!(
        prompt.contains("```diff") && prompt.contains("-hello") && prompt.contains("+changed"),
        "{request}"
    );

    // A provider failure, and an answer that is not an event stream, are both reported as a 502.
    // The fake provider's error text names the key, and the gateway must not pass it on.
    model.mode.store(HTTP_FAILURE, Ordering::SeqCst);
    let (status, body) =
        generate(&client, &gateway.base, Some(&owner), json!({"cwd": dirty})).await;
    assert!(
        status == 502
            && body["error"] == "Commit message generation failed"
            && !body.to_string().contains("test-key"),
        "{body}"
    );
    model.mode.store(PLAIN_JSON, Ordering::SeqCst);
    let (status, body) =
        generate(&client, &gateway.base, Some(&owner), json!({"cwd": dirty})).await;
    assert!(
        status == 502 && body["error"] == "Commit message generation failed",
        "{body}"
    );
    model.mode.store(SSE_ANSWER, Ordering::SeqCst);
    model_task.abort();
}
