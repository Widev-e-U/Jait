//! Network, security-assessment, code-graph and repo-scoped routes through the production binary.
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
            .join("../../.jait/artifacts/binary-net-store-tests")
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
async fn network_security_codegraph_through_the_binary() {
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

    let o = owner.clone();
    let x = other.clone();

    // Everything here requires a login.
    for (m, p, b) in [
        (M::GET, "/api/network/interfaces", None),
        (M::GET, "/api/network/scan/latest", None),
        (M::GET, "/api/network/nodes", None),
        (M::GET, "/api/network/devices", None),
        (M::GET, "/api/network/topology", None),
        (M::POST, "/api/network/nodes/register", Some(json!({}))),
        (M::POST, "/api/network/ssh/enable", Some(json!({}))),
        (M::GET, "/api/code-graph", None),
        (M::POST, "/api/code-graph/index", Some(json!({}))),
        (M::GET, "/api/security/assessments", None),
        (M::POST, "/api/security/scopes", Some(json!({}))),
        (M::GET, "/api/repos/nope/pull-requests", None),
        (M::GET, "/api/repos/nope/todos", None),
        (M::PATCH, "/api/repo-proposals/nope", Some(json!({}))),
    ] {
        let (st, _) = call(m.clone(), p.into(), String::new(), b).await;
        assert_eq!(st, 401, "{m} {p}");
    }

    // Network owner paths.
    let (st, b) = call(M::GET, "/api/network/interfaces".into(), o.clone(), None).await;
    assert!(st == 200 && b["interfaces"].is_array(), "{b}");
    let (st, b) = call(M::GET, "/api/network/scan/latest".into(), o.clone(), None).await;
    assert!(st == 200 && b["ok"] == false, "{b}");
    let (st, b) = call(M::GET, "/api/network/nodes".into(), o.clone(), None).await;
    assert!(st == 200 && b["nodes"] == json!([]), "{b}");
    let (st, b) = call(M::GET, "/api/network/devices".into(), o.clone(), None).await;
    assert!(st == 200 && b["devices"] == json!([]), "{b}");
    let (st, b) = call(M::GET, "/api/network/topology".into(), o.clone(), None).await;
    assert!(
        st == 200 && b["hosts"] == json!([]) && b["gateway"].is_null(),
        "{b}"
    );
    let (st, b) = call(
        M::POST,
        "/api/network/nodes/register".into(),
        o.clone(),
        Some(json!({})),
    )
    .await;
    assert!(st == 400 && b["error"] == "id and ip are required", "{b}");
    let (st, b) = call(
        M::POST,
        "/api/network/ssh/enable".into(),
        o.clone(),
        Some(json!({})),
    )
    .await;
    assert!(
        st == 200 && b["command"].is_string() && b["steps"].is_array(),
        "{b}"
    );

    // Security assessments start empty; scopes require explicit authorization.
    let (st, b) = call(M::GET, "/api/security/assessments".into(), o.clone(), None).await;
    assert!(
        st == 200 && b["scopes"] == json!([]) && b["runs"] == json!([]),
        "{b}"
    );
    let (st, b) = call(
        M::GET,
        "/api/security/assessments/nope".into(),
        o.clone(),
        None,
    )
    .await;
    assert!(st == 404 && b["error"] == "Assessment not found", "{b}");
    let (st, b) = call(
        M::POST,
        "/api/security/assessments".into(),
        o.clone(),
        Some(json!({})),
    )
    .await;
    assert!(st == 400 && b["error"] == "scopeId required", "{b}");
    let (st, b) = call(
        M::POST,
        "/api/security/assessments/nope/cancel".into(),
        o.clone(),
        Some(json!({})),
    )
    .await;
    assert_eq!(st, 404, "{b}");
    let (st, b) = call(
        M::POST,
        "/api/security/scopes".into(),
        o.clone(),
        Some(json!({})),
    )
    .await;
    assert!(
        st == 400 && b["error"] == "Explicit target authorization is required",
        "{b}"
    );

    // Code graph requires a project root; unknown repos are 404 for repo-scoped routes.
    for (m, p) in [
        (M::GET, "/api/code-graph"),
        (M::GET, "/api/code-graph/snapshot"),
    ] {
        let (st, b) = call(m.clone(), p.into(), o.clone(), None).await;
        assert!(
            st == 400 && b["error"] == "projectRoot is required",
            "{m} {p} {b}"
        );
    }
    for p in ["index", "query", "path", "graphrag/prepare"] {
        let (st, b) = call(
            M::POST,
            format!("/api/code-graph/{p}"),
            o.clone(),
            Some(json!({})),
        )
        .await;
        assert!(
            st == 400 && b["error"] == "projectRoot is required",
            "{p} {b}"
        );
    }
    for (m, p, body) in [
        (M::GET, "/api/repos/nope/pull-requests", None),
        (M::GET, "/api/repos/nope/pull-requests/1", None),
        (M::GET, "/api/repos/nope/todos", None),
        (M::POST, "/api/repos/nope/todos", Some(json!({}))),
        (M::GET, "/api/repos/nope/proposals", None),
        (M::POST, "/api/repos/nope/proposals", Some(json!({}))),
    ] {
        let (st, b) = call(m.clone(), p.into(), o.clone(), body).await;
        assert!(
            st == 404 && b["error"] == "Repository not found",
            "{m} {p} {b}"
        );
    }
    for m in [M::PATCH, M::DELETE] {
        let (st, b) = call(
            m.clone(),
            "/api/repo-proposals/nope".into(),
            o.clone(),
            Some(json!({})),
        )
        .await;
        assert!(st == 404 && b["error"] == "Todo not found", "{m} {b}");
    }
    let _ = x;
}
