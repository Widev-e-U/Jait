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
