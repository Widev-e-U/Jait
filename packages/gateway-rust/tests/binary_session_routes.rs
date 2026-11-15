//! Session sub-routes through the production binary.
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
            .join("../../.jait/artifacts/binary-session-routes-tests")
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
async fn session_sub_routes_are_owned_through_the_binary() {
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

    let (_, s) = call(M::POST, "/api/sessions".into(), owner.clone(), Some(json!({}))).await;
    let id = s["id"].as_str().unwrap().to_owned();
    let o = owner.clone();
    let x = other.clone();

    // Owner-scoped lookups.
    let (st, b) = call(M::GET, "/api/sessions/last-active".into(), o.clone(), None).await;
    assert_eq!((st, b["session"]["id"].as_str()), (200, Some(id.as_str())), "{b}");
    let (_, b) = call(M::GET, "/api/sessions/last-active".into(), x.clone(), None).await;
    assert!(b["session"].is_null(), "{b}");
    let (st, b) = call(M::GET, "/api/sessions/streaming".into(), o.clone(), None).await;
    assert_eq!(st, 200, "{b}");
    assert_eq!(b["sessionIds"], json!([]));
    let (st, b) = call(M::GET, "/api/tools/sessions.list".into(), o.clone(), None).await;
    assert!(st == 200 && b.to_string().contains(&id), "{b}");
    let (_, b) = call(M::GET, "/api/tools/sessions.list".into(), x.clone(), None).await;
    assert!(!b.to_string().contains(&id), "{b}");
    let status_path = format!("/api/tools/sessions.status?sessionId={id}");
    let (st, b) = call(M::GET, status_path.clone(), o.clone(), None).await;
    assert!(st == 200 && b["id"] == id.as_str(), "{b}");
    let (st, _) = call(M::GET, status_path, x.clone(), None).await;
    assert_eq!(st, 404);
    let (st, _) = call(M::GET, "/api/tools/sessions.status".into(), o.clone(), None).await;
    assert_eq!(st, 400);

    // Viewed and title generation.
    let (st, b) = call(M::POST, format!("/api/sessions/{id}/viewed"), o.clone(), Some(json!({}))).await;
    assert!(st == 200 && b["ok"] == true, "{b}");
    let (st, _) = call(M::POST, format!("/api/sessions/{id}/viewed"), x.clone(), Some(json!({}))).await;
    assert_eq!(st, 404);
    let (st, _) = call(M::POST, format!("/api/sessions/{id}/viewed"), o.clone(), Some(json!({"lastActiveAt":"nope"}))).await;
    assert_eq!(st, 400);
    let (st, _) = call(M::POST, format!("/api/sessions/{id}/generate-title"), o.clone(), Some(json!({}))).await;
    assert_eq!(st, 400);

    // Messages, runtime, plan, loop, cancel, steer, fork, approve.
    let (st, b) = call(M::GET, format!("/api/sessions/{id}/messages"), o.clone(), None).await;
    assert!(st == 200 && b["total"] == 0 && b["streaming"] == false, "{b}");
    let (st, b) = call(M::GET, format!("/api/sessions/{id}/runtime"), o.clone(), None).await;
    assert!(st == 200 && b["running"] == false, "{b}");
    let (st, b) = call(M::GET, format!("/api/sessions/{id}/plan"), o.clone(), None).await;
    assert_eq!(st, 404, "{b}");
    let (st, b) = call(M::GET, format!("/api/sessions/{id}/loop"), o.clone(), None).await;
    assert!(st == 200 && b["loop"].is_null(), "{b}");
    let (st, _) = call(M::POST, format!("/api/sessions/{id}/loop"), o.clone(), Some(json!({}))).await;
    assert_eq!(st, 400);
    let (st, b) = call(M::POST, format!("/api/sessions/{id}/cancel"), o.clone(), Some(json!({}))).await;
    assert!(st == 200 && b["cancelled"] == false, "{b}");
    let (st, _) = call(M::POST, format!("/api/sessions/{id}/steer"), o.clone(), Some(json!({"message":"x"}))).await;
    assert_eq!(st, 409);
    let (st, _) = call(M::POST, format!("/api/sessions/{id}/approve"), o.clone(), Some(json!({}))).await;
    assert_eq!(st, 400);
    let (st, b) = call(M::POST, format!("/api/sessions/{id}/fork"), o.clone(), Some(json!({}))).await;
    assert_eq!(st, 201, "{b}");
    assert_ne!(b["id"], id.as_str());
    assert_eq!(b["userId"], s["userId"]);

    // Every one of these must be invisible to another user.
    for (m, p, body) in [
        (M::GET, format!("/api/sessions/{id}/messages"), None),
        (M::GET, format!("/api/sessions/{id}/runtime"), None),
        (M::GET, format!("/api/sessions/{id}/plan"), None),
        (M::POST, format!("/api/sessions/{id}/plan/reject"), Some(json!({}))),
        (M::GET, format!("/api/sessions/{id}/loop"), None),
        (M::POST, format!("/api/sessions/{id}/loop"), Some(json!({}))),
        (M::POST, format!("/api/sessions/{id}/cancel"), Some(json!({}))),
        (M::POST, format!("/api/sessions/{id}/steer"), Some(json!({"message":"x"}))),
        (M::POST, format!("/api/sessions/{id}/fork"), Some(json!({}))),
        (M::GET, format!("/api/sessions/{id}/trajectory"), None),
        (M::GET, format!("/api/sessions/{id}/stream"), None),
        (M::GET, format!("/api/sessions/{id}/events"), None),
    ] {
        let (st, b) = call(m.clone(), p.clone(), x.clone(), body).await;
        assert_eq!(st, 404, "{m} {p} {b}");
    }

    // Event streams are SSE for the owner; read only the response head.
    for tail in ["stream", "events", "trajectory"] {
        let r = client
            .get(url(&format!("/api/sessions/{id}/{tail}")))
            .bearer_auth(&owner)
            .send()
            .await
            .unwrap();
        assert_eq!(r.status(), 200, "{tail}");
        let kind = r.headers()["content-type"].to_str().unwrap().to_owned();
        assert!(kind.starts_with("text/event-stream"), "{tail} {kind}");
    }
}
