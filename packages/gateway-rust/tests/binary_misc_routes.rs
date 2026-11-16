//! Filesystem, user-question, skills and todo routes through the production binary.
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
            .join("../../.jait/artifacts/binary-misc-routes-tests")
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
async fn misc_routes_are_owned_through_the_binary() {
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

    // Filesystem browsing.
    let dir = gateway.directory.to_string_lossy().into_owned();
    let (st, b) = call(M::GET, "/api/filesystem/nodes".into(), o_(&owner), None).await;
    assert!(st == 200 && b["nodes"].is_array(), "{b}");
    let (st, b) = call(M::GET, "/api/filesystem/roots".into(), o_(&owner), None).await;
    assert!(
        st == 200 && b["roots"].is_array() && !b["roots"].as_array().unwrap().is_empty(),
        "{b}"
    );
    let (st, b) = call(
        M::GET,
        format!("/api/filesystem/browse?path={dir}"),
        o_(&owner),
        None,
    )
    .await;
    assert_eq!(st, 200, "{b}");
    assert!(
        b["entries"]
            .as_array()
            .unwrap()
            .iter()
            .any(|e| e["name"] == "notes.txt" && e["type"] == "file"),
        "{b}"
    );
    let (st, b) = call(
        M::GET,
        format!("/api/filesystem/browse?path={dir}/missing"),
        o_(&owner),
        None,
    )
    .await;
    assert_eq!((st, &b["error"]), (400, &json!("BROWSE_FAILED")), "{b}");
    let (st, b) = call(
        M::GET,
        format!("/api/filesystem/browse?path={dir}/notes.txt"),
        o_(&owner),
        None,
    )
    .await;
    assert_eq!((st, &b["error"]), (400, &json!("NOT_A_DIRECTORY")), "{b}");
    for p in ["nodes", "roots", "browse"] {
        let r = client
            .get(url(&format!("/api/filesystem/{p}")))
            .send()
            .await
            .unwrap();
        assert_eq!(r.status(), 401, "{p}");
    }

    // User questions: nothing pending, validation, unknown ids.
    let (st, b) = call(
        M::GET,
        "/api/user-questions/requests".into(),
        o_(&owner),
        None,
    )
    .await;
    assert!(st == 200 && b["requests"] == json!([]), "{b}");
    let (st, _) = call(
        M::POST,
        "/api/user-questions/requests/nope/submit".into(),
        o_(&owner),
        Some(json!({})),
    )
    .await;
    assert_eq!(st, 400);
    let (st, _) = call(
        M::POST,
        "/api/user-questions/requests/nope/submit".into(),
        o_(&owner),
        Some(json!({"answers":{}})),
    )
    .await;
    assert_eq!(st, 404);
    let (st, _) = call(
        M::POST,
        "/api/user-questions/requests/nope/cancel".into(),
        o_(&owner),
        Some(json!({})),
    )
    .await;
    assert_eq!(st, 404);
    let r = client
        .get(url("/api/user-questions/requests"))
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 401);

    // Skills.
    let (st, b) = call(M::GET, "/api/skills".into(), o_(&owner), None).await;
    assert!(st == 200 && b.is_array(), "{b}");
    let (st, _) = call(
        M::PATCH,
        "/api/skills/nope".into(),
        o_(&owner),
        Some(json!({"enabled":true})),
    )
    .await;
    assert_eq!(st, 404);
    let (st, _) = call(
        M::POST,
        "/api/skills/nope/install-tool".into(),
        o_(&owner),
        Some(json!({})),
    )
    .await;
    assert_eq!(st, 404);
    let r = client.get(url("/api/skills")).send().await.unwrap();
    assert_eq!(r.status(), 401);

    // Repository todos: PATCH and DELETE through /api/jait-todos, owner only.
    std::fs::create_dir_all(gateway.directory.join("todo-repo")).unwrap();
    let local = gateway
        .directory
        .join("todo-repo")
        .to_string_lossy()
        .into_owned();
    let (st, b) = call(
        M::POST,
        "/api/repos".into(),
        o_(&owner),
        Some(json!({"name":"T","localPath":local})),
    )
    .await;
    assert_eq!(st, 200, "{b}");
    let repo = b["repo"]["id"].as_str().unwrap().to_owned();
    let (st, b) = call(
        M::POST,
        format!("/api/repos/{repo}/todos"),
        o_(&owner),
        Some(json!({"message":"ship it"})),
    )
    .await;
    assert_eq!(st, 201, "{b}");
    let todo = b["todo"]["id"].as_str().unwrap().to_owned();
    let (st, b) = call(
        M::PATCH,
        format!("/api/jait-todos/{todo}"),
        o_(&other),
        Some(json!({"status":"done"})),
    )
    .await;
    assert_eq!(st, 404, "{b}");
    let (st, _) = call(
        M::DELETE,
        format!("/api/jait-todos/{todo}"),
        o_(&other),
        None,
    )
    .await;
    assert_eq!(st, 404);
    let (st, _) = call(
        M::PATCH,
        format!("/api/jait-todos/{todo}"),
        o_(&owner),
        Some(json!({"status":"bogus"})),
    )
    .await;
    assert_eq!(st, 400);
    let (st, b) = call(
        M::PATCH,
        format!("/api/jait-todos/{todo}"),
        o_(&owner),
        Some(json!({"status":"done","priority":"high"})),
    )
    .await;
    assert!(
        st == 200 && b["todo"]["status"] == "done" && b["todo"]["priority"] == "high",
        "{b}"
    );
    let (st, b) = call(
        M::DELETE,
        format!("/api/jait-todos/{todo}"),
        o_(&owner),
        None,
    )
    .await;
    assert!(st == 200 && b["ok"] == true, "{b}");
    let (st, _) = call(
        M::DELETE,
        format!("/api/jait-todos/{todo}"),
        o_(&owner),
        None,
    )
    .await;
    assert_eq!(st, 404);
    let _ = &other;
}

fn o_(t: &str) -> String {
    t.to_owned()
}

#[tokio::test]
async fn node_credentials_enforce_ownership_and_revocation_through_binary() {
    let gateway = Gateway::start();
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .unwrap();
    let register = client
        .post(format!("{}/api/auth/register", gateway.base))
        .json(&json!({"username":"owner", "password":"owner-pass-123"}))
        .send()
        .await
        .unwrap()
        .json::<Value>()
        .await
        .unwrap();
    let owner = register["access_token"].as_str().unwrap();
    let invite = client
        .post(format!("{}/api/auth/invitations", gateway.base))
        .bearer_auth(owner)
        .json(&json!({}))
        .send()
        .await
        .unwrap()
        .json::<Value>()
        .await
        .unwrap();
    let other = client.post(format!("{}/api/auth/register", gateway.base))
        .json(&json!({"username":"other", "password":"owner-pass-123", "invitation":invite["invitation"]}))
        .send().await.unwrap().json::<Value>().await.unwrap();
    let other = other["access_token"].as_str().unwrap();
    let db = rusqlite::Connection::open(gateway.directory.join("gateway.sqlite")).unwrap();
    let owner_id: String = db
        .query_row("SELECT id FROM users WHERE username='owner'", [], |row| {
            row.get(0)
        })
        .unwrap();
    db.execute("INSERT INTO nodes(node_id,first_seen_at,last_seen_at,created_at,updated_at,user_id) VALUES ('node-test','now','now','now','now',?1)", [&owner_id]).unwrap();
    let url = format!("{}/api/nodes/node-test/credential", gateway.base);
    assert_eq!(client.post(&url).send().await.unwrap().status(), 401);
    assert_eq!(
        client
            .post(&url)
            .bearer_auth(other)
            .send()
            .await
            .unwrap()
            .status(),
        404
    );
    assert_eq!(
        client
            .delete(&url)
            .bearer_auth(other)
            .send()
            .await
            .unwrap()
            .status(),
        404
    );
    assert_eq!(
        client
            .post(&url)
            .header("Origin", "https://untrusted.example")
            .send()
            .await
            .unwrap()
            .status(),
        403
    );
    let issued = client.post(&url).bearer_auth(owner).send().await.unwrap();
    assert_eq!(issued.status(), 200);
    let issued = issued.json::<Value>().await.unwrap();
    let credential = issued["credential"].as_str().unwrap();
    assert!(credential.starts_with("jait-node-"));
    let stored: String = db
        .query_row(
            "SELECT token_hash FROM node_credentials WHERE node_id='node-test'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    use sha2::{Digest, Sha256};
    assert_eq!(stored, hex::encode(Sha256::digest(credential.as_bytes())));
    let second = client.post(&url).bearer_auth(owner).send().await.unwrap();
    assert_eq!(second.status(), 200);
    let second = second.json::<Value>().await.unwrap();
    assert_ne!(second["credential"].as_str().unwrap(), credential);
    assert_eq!(
        client
            .delete(&url)
            .bearer_auth(other)
            .send()
            .await
            .unwrap()
            .status(),
        404
    );
    let count: i64 = db
        .query_row(
            "SELECT count(*) FROM node_credentials WHERE node_id='node-test'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(count, 2);
    assert_eq!(
        client
            .delete(&url)
            .bearer_auth(owner)
            .send()
            .await
            .unwrap()
            .status(),
        200
    );
    let count: i64 = db
        .query_row(
            "SELECT count(*) FROM node_credentials WHERE node_id='node-test'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(count, 0);
}

#[tokio::test]
async fn update_activation_is_unavailable_through_the_binary() {
    let gateway = Gateway::start();
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .unwrap();
    let register = client
        .post(format!("{}/api/auth/register", gateway.base))
        .json(&json!({"username":"owner", "password":"owner-pass-123"}))
        .send()
        .await
        .unwrap();
    assert_eq!(register.status(), 200);
    let register = register.json::<Value>().await.unwrap();
    let owner = register["access_token"].as_str().unwrap();
    let url = format!("{}/api/update/apply", gateway.base);
    assert_eq!(
        client
            .post(&url)
            .json(&json!({"version":"1.2.3"}))
            .send()
            .await
            .unwrap()
            .status(),
        401
    );
    let response = client
        .post(&url)
        .bearer_auth(owner)
        .json(&json!({"version":"1.2.3"}))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 409);
    let body = response.json::<Value>().await.unwrap();
    assert!(body["error"].as_str().unwrap().contains("systemd-managed"));
}

#[tokio::test]
async fn team_rooms_enforce_thread_ownership_and_persist_messages() {
    let gateway = Gateway::start();
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .unwrap();
    let base = &gateway.base;
    assert_eq!(
        client
            .get(format!("{base}/api/team-rooms"))
            .send()
            .await
            .unwrap()
            .status(),
        401
    );
    let owner: Value = client
        .post(format!("{base}/api/auth/register"))
        .json(&json!({"username":"owner", "password":"owner-pass-123"}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let owner = owner["access_token"].as_str().unwrap();
    let invitation: Value = client
        .post(format!("{base}/api/auth/invitations"))
        .bearer_auth(owner)
        .json(&json!({}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let other: Value = client.post(format!("{base}/api/auth/register"))
        .json(&json!({"username":"other", "password":"owner-pass-123", "invitation":invitation["invitation"]}))
        .send().await.unwrap().json().await.unwrap();
    let other = other["access_token"].as_str().unwrap();
    assert_eq!(
        client
            .put(format!("{base}/api/persona-agents/pa1"))
            .bearer_auth(owner)
            .json(&json!({"name":"Helper"}))
            .send()
            .await
            .unwrap()
            .status(),
        200
    );
    let db = rusqlite::Connection::open(gateway.directory.join("gateway.sqlite")).unwrap();
    let other_id: String = db
        .query_row("SELECT id FROM users WHERE username='other'", [], |row| {
            row.get(0)
        })
        .unwrap();
    db.execute("INSERT INTO agent_threads (id,user_id,title,provider_id,status,created_at,updated_at) VALUES ('foreign-thread',?1,'Other','test','idle','now','now')", [&other_id]).unwrap();
    let owner_id: String = db
        .query_row("SELECT id FROM users WHERE username='owner'", [], |row| {
            row.get(0)
        })
        .unwrap();
    db.execute("INSERT INTO agent_threads (id,user_id,title,provider_id,status,created_at,updated_at) VALUES ('owned-thread',?1,'Owner','test','idle','now','now')", [&owner_id]).unwrap();
    let collection = format!("{base}/api/team-rooms");
    let response = client
        .post(&collection)
        .bearer_auth(owner)
        .json(&json!({"agentId":"pa1", "sourceSessionId":"foreign-thread"}))
        .send()
        .await
        .unwrap();
    assert_eq!(
        response.status(),
        400,
        "foreign thread must not be accepted"
    );
    let response = client
        .post(&collection)
        .bearer_auth(owner)
        .json(&json!({"agentId":"pa1", "sourceSessionId":"owned-thread"}))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 200, "owned thread must be accepted");
    let room: Value = client
        .post(&collection)
        .bearer_auth(owner)
        .json(&json!({"name":"Team", "memberIds":["pa1"]}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let room_id = room["room"]["id"].as_str().expect("room was created");
    let room_url = format!("{collection}/{room_id}");
    assert_eq!(
        client
            .get(&room_url)
            .bearer_auth(other)
            .send()
            .await
            .unwrap()
            .status(),
        404
    );
    let message_url = format!("{room_url}/messages");
    let payload = json!({"content":"hello", "clientKey":"first", "recipientIds":[]});
    let response = client
        .post(&message_url)
        .bearer_auth(owner)
        .json(&payload)
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 201);
    let message: Value = response.json().await.unwrap();
    let repeated: Value = client
        .post(&message_url)
        .bearer_auth(owner)
        .json(&payload)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(message["message"]["id"], repeated["message"]["id"]);
    let loaded: Value = client
        .get(&room_url)
        .bearer_auth(owner)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(loaded["messages"].as_array().unwrap().len(), 1);
    assert_eq!(loaded["messages"][0]["content"], "hello");
    let foreign: Value = client
        .get(&collection)
        .bearer_auth(other)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(foreign["rooms"], json!([]));
}

#[tokio::test]
async fn github_app_mount_fails_closed_without_a_native_host() {
    let gateway = Gateway::start();
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .unwrap();
    let list = format!("{}/api/github-apps", gateway.base);
    assert_eq!(client.get(&list).send().await.unwrap().status(), 401);
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
    let response = client.get(&list).bearer_auth(token).send().await.unwrap();
    assert_eq!(response.status(), 200);
    let body: Value = response.json().await.unwrap();
    assert_eq!(body["connections"], json!([]));
    assert_eq!(body["configured"], 0);
    let webhook = format!("{}/api/github/apps/webhook", gateway.base);
    let response = client
        .post(&webhook)
        .json(&json!({"installation":{"id":123}}))
        .header("x-hub-signature-256", "sha256=invalid")
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 500);
    let response = client
        .post(&webhook)
        .json(&json!({}))
        .header("x-github-delivery", "first")
        .header("x-github-delivery", "second")
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 400);
    let body: Value = response.json().await.unwrap();
    assert_eq!(body["detail"], "ambiguous_headers");
}

#[tokio::test]
async fn agent_control_reports_unavailable_stop_and_isolates_owners() {
    let gateway = Gateway::start();
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .unwrap();
    let url = |path: &str| format!("{}{path}", gateway.base);
    assert_eq!(
        client
            .get(url("/api/agent-control"))
            .send()
            .await
            .unwrap()
            .status(),
        401
    );
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
    let invite: Value = client
        .post(url("/api/auth/invitations"))
        .bearer_auth(owner)
        .json(&json!({}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let other: Value = client.post(url("/api/auth/register"))
        .json(&json!({"username":"other", "password":"owner-pass-123", "invitation":invite["invitation"]}))
        .send().await.unwrap().json().await.unwrap();
    let other = other["access_token"].as_str().unwrap();
    let response = client
        .post(url("/api/agent-control/halt"))
        .bearer_auth(owner)
        .json(&json!({"reason":"  maintenance  "}))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    let halted: Value = response.json().await.unwrap();
    assert_eq!(halted["state"]["halted"], true);
    assert_eq!(halted["state"]["reason"], "maintenance");
    assert_eq!(halted["stopped"], 0);
    assert!(
        halted["stopError"]
            .as_str()
            .unwrap()
            .contains("not available")
    );
    let state: Value = client
        .get(url("/api/agent-control"))
        .bearer_auth(other)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(state["state"]["halted"], false);
    let state: Value = client
        .get(url("/api/agent-control"))
        .bearer_auth(owner)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(state["state"]["halted"], true);
    let resumed: Value = client
        .post(url("/api/agent-control/resume"))
        .bearer_auth(owner)
        .json(&json!({}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(resumed["state"]["halted"], false);
}

#[tokio::test]
async fn plugin_mount_refuses_loading_without_native_host() {
    let gateway = Gateway::start();
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .unwrap();
    let url = |path: &str| format!("{}{path}", gateway.base);
    assert_eq!(
        client
            .get(url("/api/plugins"))
            .send()
            .await
            .unwrap()
            .status(),
        401
    );
    let registration: Value = client
        .post(url("/api/auth/register"))
        .json(&json!({"username":"owner", "password":"owner-pass-123"}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let token = registration["access_token"].as_str().unwrap();
    let response = client
        .get(url("/api/plugins"))
        .bearer_auth(token)
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    assert_eq!(response.json::<Value>().await.unwrap(), json!([]));
    let response = client
        .post(url("/api/plugins/example/enable"))
        .bearer_auth(token)
        .json(&json!({}))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 400);
    let body: Value = response.json().await.unwrap();
    assert!(body["error"].as_str().unwrap().contains("not available"));
    assert_eq!(
        client
            .get(url("/api/plugins/example"))
            .bearer_auth(token)
            .send()
            .await
            .unwrap()
            .status(),
        404
    );
}
