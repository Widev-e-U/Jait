//! Persisted chat-session routes through the production binary: message context snapshots,
//! sub-agent bodies, restart-from truncation and the provider pre-warm hint. Rows are seeded
//! straight into the gateway's SQLite file, the way a finished turn leaves them.
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
            .join("../../.jait/artifacts/binary-chat-session-tests")
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
            .env("JWT_SECRET", "isolated-chat-session-secret")
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

    /// A second connection to the gateway's database, for seeding and inspecting rows.
    fn db(&self) -> rusqlite::Connection {
        let db = rusqlite::Connection::open(self.directory.join("gateway.sqlite")).unwrap();
        db.busy_timeout(Duration::from_secs(10)).unwrap();
        db
    }
}

impl Drop for Gateway {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
        let _ = std::fs::remove_dir_all(&self.directory);
    }
}

fn client() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(60))
        .build()
        .unwrap()
}

async fn call(
    client: &reqwest::Client,
    base: &str,
    token: Option<&str>,
    method: &str,
    path: &str,
    body: Value,
) -> (u16, Value) {
    let mut request = client.request(method.parse().unwrap(), format!("{base}{path}"));
    if let Some(token) = token {
        request = request.bearer_auth(token);
    }
    if !body.is_null() {
        request = request.json(&body);
    }
    let response = request.send().await.unwrap();
    let status = response.status().as_u16();
    (status, response.json().await.unwrap_or_default())
}

/// The gateway owner and an invited second account that must never reach the owner's sessions.
async fn owner_and_intruder(client: &reqwest::Client, base: &str) -> (String, String) {
    let registered = client
        .post(format!("{base}/api/auth/register"))
        .json(&json!({"username": "chat-owner", "password": "correct-horse-1"}))
        .send()
        .await
        .unwrap()
        .json::<Value>()
        .await
        .unwrap();
    let owner = registered["access_token"]
        .as_str()
        .unwrap_or_else(|| panic!("no owner token: {registered}"))
        .to_owned();
    let (_, invite) = call(
        client,
        base,
        Some(&owner),
        "POST",
        "/api/auth/invitations",
        json!({}),
    )
    .await;
    let other = client
        .post(format!("{base}/api/auth/register"))
        .json(&json!({
            "username": "chat-intruder",
            "password": "correct-horse-2",
            "invitation": invite["invitation"],
        }))
        .send()
        .await
        .unwrap()
        .json::<Value>()
        .await
        .unwrap();
    let intruder = other["access_token"]
        .as_str()
        .unwrap_or_else(|| panic!("no intruder token: {other}"))
        .to_owned();
    (owner, intruder)
}

async fn new_session(client: &reqwest::Client, base: &str, token: &str) -> String {
    let (status, created) = call(
        client,
        base,
        Some(token),
        "POST",
        "/api/sessions",
        json!({}),
    )
    .await;
    assert_eq!(status, 201, "{created}");
    created["id"].as_str().unwrap().to_owned()
}

#[tokio::test]
async fn message_context_and_sub_agent_bodies_are_read_from_persisted_rows() {
    let gateway = Gateway::start();
    let (client, base) = (client(), gateway.base.clone());
    for path in [
        "/api/sessions/s/messages/0/context-flow",
        "/api/sessions/s/sub-agents/a",
    ] {
        let (status, _) = call(&client, &base, None, "GET", path, Value::Null).await;
        assert_eq!(status, 401, "{path}");
    }
    let (owner, intruder) = owner_and_intruder(&client, &base).await;
    let session = new_session(&client, &base, &owner).await;
    let flow = json!({"rounds": [{"n": 1}]}).to_string();
    let db = gateway.db();
    for (id, role, content, flow, at) in [
        ("m1", "user", "hi", None::<&str>, "2030-01-01T00:00:01Z"),
        ("m2", "assistant", "", None, "2030-01-01T00:00:02Z"),
        (
            "m3",
            "assistant",
            "hello",
            Some(flow.as_str()),
            "2030-01-01T00:00:03Z",
        ),
    ] {
        db.execute(
            "INSERT INTO messages(id, session_id, role, content, context_flow, created_at) VALUES(?1,?2,?3,?4,?5,?6)",
            rusqlite::params![id, session, role, content, flow, at],
        )
        .unwrap();
    }
    db.execute(
        "INSERT INTO sub_agent_history(sub_agent_id, session_id, message_id, rounds, duration_ms, content, created_at) VALUES('sa1', ?1, 'm3', 2, 40, '\"done\"', '2030-01-01T00:00:04Z')",
        [&session],
    )
    .unwrap();

    let flow_path = |index: &str| format!("/api/sessions/{session}/messages/{index}/context-flow");
    // A message with no snapshot answers null, not an error.
    let (status, body) = call(
        &client,
        &base,
        Some(&owner),
        "GET",
        &flow_path("0"),
        Value::Null,
    )
    .await;
    assert_eq!(
        (status, &body["contextFlow"]),
        (200, &Value::Null),
        "{body}"
    );
    // The empty assistant placeholder is not visible, so the index that follows it is "hello".
    let (status, body) = call(
        &client,
        &base,
        Some(&owner),
        "GET",
        &flow_path("1"),
        Value::Null,
    )
    .await;
    assert_eq!(status, 200, "{body}");
    assert_eq!(body["contextFlow"]["rounds"][0]["n"], 1);
    for (index, expected) in [("2", 404), ("-1", 400), ("abc", 400)] {
        let (status, body) = call(
            &client,
            &base,
            Some(&owner),
            "GET",
            &flow_path(index),
            Value::Null,
        )
        .await;
        assert_eq!(status, expected, "index {index}: {body}");
    }
    let (status, body) = call(
        &client,
        &base,
        Some(&intruder),
        "GET",
        &flow_path("1"),
        Value::Null,
    )
    .await;
    assert_eq!(
        status, 404,
        "another account must not read the snapshot: {body}"
    );
    assert!(body.get("contextFlow").is_none(), "{body}");

    let sub = |id: &str| format!("/api/sessions/{session}/sub-agents/{id}");
    let (status, body) = call(
        &client,
        &base,
        Some(&owner),
        "GET",
        &sub("sa1"),
        Value::Null,
    )
    .await;
    assert_eq!(status, 200, "{body}");
    assert_eq!(body["subAgent"]["subAgentId"], "sa1");
    assert_eq!(body["subAgent"]["content"], "done");
    assert_eq!(body["subAgent"]["rounds"], 2);
    assert_eq!(body["subAgent"]["durationMs"], 40);
    assert_eq!(body["subAgent"]["messageId"], "m3");
    let (status, _) = call(
        &client,
        &base,
        Some(&owner),
        "GET",
        &sub("nope"),
        Value::Null,
    )
    .await;
    assert_eq!(status, 404);
    let (status, body) = call(
        &client,
        &base,
        Some(&intruder),
        "GET",
        &sub("sa1"),
        Value::Null,
    )
    .await;
    assert_eq!(
        status, 404,
        "another account must not read the sub-agent: {body}"
    );
    assert!(body.get("subAgent").is_none(), "{body}");
}

#[tokio::test]
async fn restart_from_deletes_the_edited_message_and_everything_after_it() {
    let gateway = Gateway::start();
    let (client, base) = (client(), gateway.base.clone());
    let (status, _) = call(
        &client,
        &base,
        None,
        "POST",
        "/api/sessions/s/restart-from",
        json!({}),
    )
    .await;
    assert_eq!(status, 401);
    let (owner, intruder) = owner_and_intruder(&client, &base).await;
    let session = new_session(&client, &base, &owner).await;
    let db = gateway.db();
    for (id, role, content, at) in [
        ("r1", "user", "first", "2030-01-01T00:00:01Z"),
        ("r2", "assistant", "answer one", "2030-01-01T00:00:02Z"),
        ("r3", "user", "second", "2030-01-01T00:00:03Z"),
        ("r4", "assistant", "answer two", "2030-01-01T00:00:04Z"),
    ] {
        db.execute(
            "INSERT INTO messages(id, session_id, role, content, created_at) VALUES(?1,?2,?3,?4,?5)",
            rusqlite::params![id, session, role, content, at],
        )
        .unwrap();
    }
    let remaining = || -> Vec<String> {
        let mut statement = db
            .prepare("SELECT id FROM messages WHERE session_id = ?1 ORDER BY created_at, id")
            .unwrap();
        statement
            .query_map([&session], |row| row.get(0))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap()
    };
    let path = format!("/api/sessions/{session}/restart-from");
    let restart = |token: &str, body: Value| {
        let (client, base, path, token) =
            (client.clone(), base.clone(), path.clone(), token.to_owned());
        async move { call(&client, &base, Some(&token), "POST", &path, body).await }
    };

    let (status, body) = restart(&owner, json!({})).await;
    assert_eq!(
        status, 400,
        "a restart names the message it starts from: {body}"
    );
    let (status, body) = restart(&intruder, json!({"messageIndex": 2})).await;
    assert_eq!(status, 404, "{body}");
    assert_eq!(
        remaining(),
        ["r1", "r2", "r3", "r4"],
        "another account must not delete"
    );
    let (status, _) = restart(&owner, json!({"messageIndex": 9})).await;
    assert_eq!(status, 404);
    let (status, body) = restart(
        &owner,
        json!({"messageIndex": 2, "expectedContent": "stale"}),
    )
    .await;
    assert_eq!(
        status, 409,
        "an edit of a changed message is refused: {body}"
    );
    assert_eq!(
        remaining(),
        ["r1", "r2", "r3", "r4"],
        "a refused restart deletes nothing"
    );

    // Index 3 is an assistant row, so the restart falls back to the user message before it.
    let (status, body) = restart(
        &owner,
        json!({"messageIndex": 3, "expectedContent": "second"}),
    )
    .await;
    assert_eq!(status, 200, "{body}");
    assert_eq!(body["streaming"], false);
    assert_eq!(body["messages"].as_array().unwrap().len(), 2, "{body}");
    assert_eq!(remaining(), ["r1", "r2"]);

    // Counting from the end reaches the same fallback and clears the rest.
    let (status, body) = restart(&owner, json!({"messageFromEnd": 0})).await;
    assert_eq!(status, 200, "{body}");
    assert!(remaining().is_empty());
}

#[tokio::test]
async fn prewarm_reports_that_no_provider_session_is_warmed() {
    let gateway = Gateway::start();
    let (client, base) = (client(), gateway.base.clone());
    let (status, _) = call(
        &client,
        &base,
        None,
        "POST",
        "/api/chat/prewarm",
        json!({"sessionId": "s"}),
    )
    .await;
    assert_eq!(status, 401);
    let (owner, intruder) = owner_and_intruder(&client, &base).await;
    let session = new_session(&client, &base, &owner).await;
    let prewarm = |token: &str, body: Value| {
        let (client, base, token) = (client.clone(), base.clone(), token.to_owned());
        async move {
            call(
                &client,
                &base,
                Some(&token),
                "POST",
                "/api/chat/prewarm",
                body,
            )
            .await
        }
    };

    let (status, body) = prewarm(&owner, json!({})).await;
    assert_eq!(status, 400, "{body}");
    // The built-in provider has no CLI session to warm.
    let (status, body) = prewarm(&owner, json!({"sessionId": session, "provider": "jait"})).await;
    assert_eq!(status, 200, "{body}");
    assert_eq!(body["status"], "skipped");
    assert_eq!(body["reason"], "not-a-cli-provider");
    // This gateway starts provider sessions per turn, so a CLI provider is acknowledged but not warmed.
    let (status, body) = prewarm(&owner, json!({"sessionId": session, "provider": "codex"})).await;
    assert_eq!(status, 200, "{body}");
    assert_eq!(body["status"], "skipped");
    // Neither an unknown session nor another account's session is acknowledged.
    let (status, _) = prewarm(&owner, json!({"sessionId": "nope", "provider": "codex"})).await;
    assert_eq!(status, 404);
    let (status, body) = prewarm(
        &intruder,
        json!({"sessionId": session, "provider": "codex"}),
    )
    .await;
    assert_eq!(status, 404, "{body}");
}
