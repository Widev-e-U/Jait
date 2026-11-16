//! Thread and persona-agent routes through the production binary.
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
            .join("../../.jait/artifacts/binary-thread-routes-tests")
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
async fn thread_routes_through_the_binary() {
    let gateway = Gateway::start();
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .unwrap();
    let url = |path: &str| format!("{}{path}", gateway.base);
    let register = |name: &'static str, invitation: Option<Value>| {
        let client = client.clone();
        let target = url("/api/auth/register");
        async move {
            let mut body = json!({"username":name, "password":"owner-pass-123"});
            if let Some(invitation) = invitation {
                body["invitation"] = invitation;
            }
            let response = client.post(target).json(&body).send().await.unwrap();
            assert_eq!(response.status(), 200);
            response.json::<Value>().await.unwrap()["access_token"]
                .as_str()
                .unwrap()
                .to_owned()
        }
    };
    let owner = register("owner", None).await;
    let invite = client
        .post(url("/api/auth/invitations"))
        .bearer_auth(&owner)
        .json(&json!({}))
        .send()
        .await
        .unwrap()
        .json::<Value>()
        .await
        .unwrap();
    let other = register("other", Some(invite["invitation"].clone())).await;
    let call = |method: reqwest::Method, path: String, token: String, body: Option<Value>| {
        let client = client.clone();
        let target = url(&path);
        async move {
            let mut request = client.request(method, target).bearer_auth(token);
            if let Some(body) = body {
                request = request.json(&body);
            }
            let response = request.send().await.unwrap();
            let status = response.status().as_u16();
            let text = response.text().await.unwrap();
            (
                status,
                serde_json::from_str::<Value>(&text).unwrap_or(Value::String(text)),
            )
        }
    };
    use reqwest::Method as M;

    let (st, provs) = call(M::GET, "/api/providers".into(), owner.clone(), None).await;
    assert_eq!(st, 200, "{provs}");
    let list = provs["providers"]
        .as_array()
        .or(provs.as_array())
        .cloned()
        .unwrap_or_default();
    let pid = list
        .first()
        .and_then(|p| p["id"].as_str())
        .unwrap_or_else(|| panic!("no registered provider: {provs}"))
        .to_owned();
    let r = client.get(url("/api/threads")).send().await.unwrap();
    assert_eq!(r.status(), 401);
    let (st, b) = call(M::GET, "/api/threads".into(), owner.clone(), None).await;
    assert!(
        st == 200 && b["threads"] == json!([]) && b["hasMore"] == false,
        "{b}"
    );

    // No provider is guessed for the user.
    let (st, b) = call(
        M::POST,
        "/api/threads".into(),
        owner.clone(),
        Some(json!({"title":"x"})),
    )
    .await;
    assert_eq!(st, 400, "{b}");
    // A thread cannot attach to someone else's session.
    let (_, s) = call(
        M::POST,
        "/api/sessions".into(),
        owner.clone(),
        Some(json!({})),
    )
    .await;
    let sid = s["id"].as_str().unwrap().to_owned();
    let (st, _) = call(
        M::POST,
        "/api/threads".into(),
        other.clone(),
        Some(json!({"sessionId":sid,"providerId":pid})),
    )
    .await;
    assert_eq!(st, 404);
    let (st, b) = call(
        M::POST,
        "/api/threads".into(),
        owner.clone(),
        Some(json!({"title":"T1","providerId":pid.as_str(),"sessionId":sid})),
    )
    .await;
    assert_eq!(st, 201, "{b}");
    let tid = b["id"].as_str().unwrap().to_owned();
    let (st, _) = call(
        M::POST,
        "/api/agent-control/halt".into(),
        owner.clone(),
        Some(json!({"reason":"maintenance"})),
    )
    .await;
    assert_eq!(st, 200);
    for (path, action) in [
        ("start", "start-thread"),
        ("send", "send-message"),
        ("steer", "steer-thread"),
    ] {
        let (st, response) = call(
            M::POST,
            format!("/api/threads/{tid}/{path}"),
            owner.clone(),
            Some(json!({"message":"continue"})),
        )
        .await;
        assert_eq!(st, 409, "{path}: {response}");
        assert_eq!(response["code"], "agent_halted");
        assert_eq!(response["action"], action);
        assert_eq!(response["reason"], "maintenance");
    }
    let (st, response) = call(
        M::POST,
        format!("/api/threads/{tid}/start"),
        other.clone(),
        Some(json!({"message":"continue"})),
    )
    .await;
    assert_eq!(st, 404, "{response}");
    let (st, _) = call(
        M::POST,
        "/api/agent-control/resume".into(),
        owner.clone(),
        Some(json!({})),
    )
    .await;
    assert_eq!(st, 200);
    assert!(
        b["status"] == "idle" && b["providerId"] == pid.as_str() && b["userId"] == s["userId"],
        "{b}"
    );

    // The body can arrive after the first halt check. Recheck before admitting work.
    {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        let address = gateway.base.strip_prefix("http://").unwrap();
        let mut stream = tokio::net::TcpStream::connect(address).await.unwrap();
        let body = json!({"message":"continue"}).to_string();
        let headers = format!(
            "POST /api/threads/{tid}/send HTTP/1.1\r\nHost: {address}\r\nAuthorization: Bearer {owner}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nExpect: 100-continue\r\nConnection: close\r\n\r\n",
            body.len()
        );
        stream.write_all(headers.as_bytes()).await.unwrap();
        let mut interim = [0; 25];
        tokio::time::timeout(Duration::from_secs(10), stream.read_exact(&mut interim))
            .await
            .unwrap()
            .unwrap();
        assert_eq!(&interim, b"HTTP/1.1 100 Continue\r\n\r\n");
        let (st, _) = call(
            M::POST,
            "/api/agent-control/halt".into(),
            owner.clone(),
            Some(json!({"reason":"body race"})),
        )
        .await;
        assert_eq!(st, 200);
        stream.write_all(body.as_bytes()).await.unwrap();
        let mut response = Vec::new();
        tokio::time::timeout(Duration::from_secs(10), stream.read_to_end(&mut response))
            .await
            .unwrap()
            .unwrap();
        let response = String::from_utf8(response).unwrap();
        let (head, body) = response.split_once("\r\n\r\n").unwrap();
        assert!(head.starts_with("HTTP/1.1 409"), "{response}");
        let payload: Value = serde_json::from_str(body).unwrap();
        assert_eq!(payload["code"], "agent_halted");
        assert_eq!(payload["action"], "send-message");
        assert_eq!(payload["reason"], "body race");
        let (st, _) = call(
            M::POST,
            "/api/agent-control/resume".into(),
            owner.clone(),
            Some(json!({})),
        )
        .await;
        assert_eq!(st, 200);
    }

    let (st, b) = call(M::GET, "/api/threads".into(), owner.clone(), None).await;
    assert!(
        st == 200 && b["threads"].as_array().unwrap().len() == 1,
        "{b}"
    );
    let (_, b) = call(M::GET, "/api/threads".into(), other.clone(), None).await;
    assert_eq!(b["threads"], json!([]));
    let (_, b) = call(
        M::GET,
        format!("/api/threads?sessionId={sid}"),
        other.clone(),
        None,
    )
    .await;
    assert_eq!(b["threads"], json!([]), "{b}");
    let (st, b) = call(M::GET, format!("/api/threads/{tid}"), owner.clone(), None).await;
    assert!(st == 200 && b["title"] == "T1", "{b}");
    let (st, b) = call(
        M::GET,
        format!("/api/threads/{tid}/runtime"),
        owner.clone(),
        None,
    )
    .await;
    assert!(st == 200 && b["startedAt"].is_null(), "{b}");
    let (st, b) = call(
        M::GET,
        format!("/api/threads/{tid}/activities"),
        owner.clone(),
        None,
    )
    .await;
    assert!(st == 200 && b["activities"] == json!([]), "{b}");

    // Patch, including the PR-state activity.
    let (st, b) = call(
        M::PATCH,
        format!("/api/threads/{tid}"),
        owner.clone(),
        Some(json!({"title":"T2","prState":"open"})),
    )
    .await;
    assert!(
        st == 200 && b["title"] == "T2" && b["prState"] == "open",
        "{b}"
    );
    let (_, b) = call(
        M::GET,
        format!("/api/threads/{tid}/activities"),
        owner.clone(),
        None,
    )
    .await;
    assert_eq!(b["activities"][0]["kind"], "pr_state", "{b}");
    let (st, _) = call(
        M::PATCH,
        format!("/api/threads/{tid}"),
        owner.clone(),
        Some(json!({"providerId":""})),
    )
    .await;
    assert_eq!(st, 400);
    let (st, _) = call(
        M::PATCH,
        format!("/api/threads/{tid}"),
        owner.clone(),
        Some(json!({"personaAgentId":"nope"})),
    )
    .await;
    assert_eq!(st, 400);

    // Everything is invisible to another user.
    for (m, p, body) in [
        (M::GET, format!("/api/threads/{tid}"), None),
        (
            M::PATCH,
            format!("/api/threads/{tid}"),
            Some(json!({"title":"hijack"})),
        ),
        (M::GET, format!("/api/threads/{tid}/runtime"), None),
        (M::GET, format!("/api/threads/{tid}/activities"), None),
        (M::POST, format!("/api/threads/{tid}/stop"), Some(json!({}))),
        (
            M::POST,
            format!("/api/threads/{tid}/interrupt"),
            Some(json!({})),
        ),
        (M::DELETE, format!("/api/threads/{tid}"), None),
    ] {
        let (st, b) = call(m.clone(), p.clone(), other.clone(), body).await;
        assert_eq!(st, 404, "{m} {p} {b}");
    }
    let (st, b) = call(
        M::POST,
        format!("/api/threads/{tid}/interrupt"),
        owner.clone(),
        Some(json!({})),
    )
    .await;
    assert_eq!(st, 409, "{b}");

    // Persona agents are per user.
    let (st, b) = call(
        M::PUT,
        "/api/persona-agents/pa1".into(),
        owner.clone(),
        Some(json!({"name":"Helper"})),
    )
    .await;
    assert!(
        st == 200 && b["name"] == "Helper" && b["id"] == "pa1",
        "{b}"
    );
    let (_, b) = call(M::GET, "/api/persona-agents".into(), owner.clone(), None).await;
    assert_eq!(b["agents"].as_array().unwrap().len(), 1, "{b}");
    let (_, b) = call(M::GET, "/api/persona-agents".into(), other.clone(), None).await;
    assert_eq!(b["agents"], json!([]), "{b}");
    let (st, b) = call(
        M::POST,
        "/api/threads".into(),
        owner.clone(),
        Some(json!({"providerId":pid.as_str(),"personaAgentId":"pa1"})),
    )
    .await;
    assert!(st == 201 && b["personaAgentId"] == "pa1", "{b}");
    let (_, _) = call(
        M::DELETE,
        "/api/persona-agents/pa1".into(),
        other.clone(),
        None,
    )
    .await;
    let (_, b) = call(M::GET, "/api/persona-agents".into(), owner.clone(), None).await;
    assert_eq!(
        b["agents"].as_array().unwrap().len(),
        1,
        "other user must not delete: {b}"
    );
    let (st, _) = call(
        M::DELETE,
        "/api/persona-agents/pa1".into(),
        owner.clone(),
        None,
    )
    .await;
    assert_eq!(st, 200);
    let (_, b) = call(M::GET, "/api/persona-agents".into(), owner.clone(), None).await;
    assert_eq!(b["agents"], json!([]), "{b}");

    // Delete.
    let (st, _) = call(
        M::DELETE,
        format!("/api/threads/{tid}"),
        owner.clone(),
        None,
    )
    .await;
    assert_eq!(st, 204);
    let (st, _) = call(M::GET, format!("/api/threads/{tid}"), owner.clone(), None).await;
    assert_eq!(st, 404);
}

#[tokio::test]
async fn thread_creation_rechecks_halt_after_body_wait() {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    let gateway = Gateway::start();
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .unwrap();
    let url = |path: &str| format!("{}{path}", gateway.base);
    let owner: Value = client
        .post(url("/api/auth/register"))
        .json(&json!({"username":"owner", "password":"owner-pass-123"}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let owner = owner["access_token"].as_str().unwrap();
    let providers: Value = client
        .get(url("/api/providers"))
        .bearer_auth(owner)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let provider = providers["providers"]
        .as_array()
        .or(providers.as_array())
        .and_then(|list| list.first())
        .and_then(|item| item["id"].as_str())
        .expect("test gateway must have a provider");
    let body = json!({"title":"race", "providerId":provider}).to_string();
    let address = gateway.base.strip_prefix("http://").unwrap();
    let mut stream = tokio::net::TcpStream::connect(address).await.unwrap();
    let headers = format!(
        "POST /api/threads HTTP/1.1\r\nHost: {address}\r\nAuthorization: Bearer {owner}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nExpect: 100-continue\r\nConnection: close\r\n\r\n",
        body.len()
    );
    stream.write_all(headers.as_bytes()).await.unwrap();
    let mut interim = [0; 25];
    tokio::time::timeout(Duration::from_secs(10), stream.read_exact(&mut interim))
        .await
        .expect("server did not begin reading the body")
        .unwrap();
    assert_eq!(&interim, b"HTTP/1.1 100 Continue\r\n\r\n");

    // The server polls the body only after the first halt check has passed.
    let halt = client
        .post(url("/api/agent-control/halt"))
        .bearer_auth(owner)
        .json(&json!({"reason":"race"}))
        .send()
        .await
        .unwrap();
    assert_eq!(halt.status(), 200);
    stream.write_all(body.as_bytes()).await.unwrap();
    let mut response = Vec::new();
    tokio::time::timeout(Duration::from_secs(10), stream.read_to_end(&mut response))
        .await
        .expect("server did not finish the thread request")
        .unwrap();
    let response = String::from_utf8(response).unwrap();
    let (head, payload) = response.split_once("\r\n\r\n").unwrap();
    assert!(head.starts_with("HTTP/1.1 409"), "{response}");
    let payload: Value = serde_json::from_str(payload).unwrap();
    assert_eq!(payload["code"], "agent_halted");
    assert_eq!(payload["action"], "create-thread");
    assert_eq!(payload["reason"], "race");
    let threads: Value = client
        .get(url("/api/threads"))
        .bearer_auth(owner)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(threads["threads"], json!([]));

    let resume = client
        .post(url("/api/agent-control/resume"))
        .bearer_auth(owner)
        .json(&json!({}))
        .send()
        .await
        .unwrap();
    assert_eq!(resume.status(), 200);
    let created = client
        .post(url("/api/threads"))
        .bearer_auth(owner)
        .header("Content-Type", "application/json")
        .body(body)
        .send()
        .await
        .unwrap();
    assert_eq!(created.status(), 201);
}
