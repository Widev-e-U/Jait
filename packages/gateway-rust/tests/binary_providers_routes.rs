//! Provider and provider-account routes through the production binary.
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
            .join("../../.jait/artifacts/binary-providers-tests")
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
async fn provider_routes_through_the_binary() {
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

    for (m, p) in [
        (M::GET, "/api/providers"),
        (M::GET, "/api/provider-accounts"),
        (M::GET, "/api/provider-usage"),
        (M::GET, "/api/provider-usage/summary"),
    ] {
        let (st, _) = call(m.clone(), p.into(), String::new(), None).await;
        assert_eq!(st, 401, "{m} {p}");
    }

    let (st, b) = call(M::GET, "/api/providers".into(), o.clone(), None).await;
    assert_eq!(st, 200, "{b}");
    assert!(
        b["providers"].as_array().is_some_and(|a| !a.is_empty()),
        "{b}"
    );
    let (st, b) = call(M::GET, "/api/provider-accounts".into(), o.clone(), None).await;
    assert_eq!(st, 200, "{b}");
    assert_eq!(b["accounts"], json!([]));
    let (st, b) = call(M::GET, "/api/provider-usage".into(), o.clone(), None).await;
    assert!(st == 200 && b["usage"] == json!([]), "{b}");
    let (st, b) = call(
        M::GET,
        "/api/provider-usage/summary".into(),
        o.clone(),
        None,
    )
    .await;
    assert!(st == 200 && b["profiles"] == json!([]), "{b}");

    let (st, _) = call(
        M::POST,
        "/api/provider-accounts".into(),
        o.clone(),
        Some(json!({})),
    )
    .await;
    assert_eq!(st, 400);
    let (st, b) = call(
        M::PATCH,
        "/api/provider-accounts/nope".into(),
        o.clone(),
        Some(json!({"label":""})),
    )
    .await;
    assert_eq!(st, 400, "{b}");
    let (st, b) = call(
        M::PATCH,
        "/api/provider-accounts/nope".into(),
        o.clone(),
        Some(json!({"label":"x"})),
    )
    .await;
    assert_eq!(st, 404, "{b}");
    let (st, _) = call(
        M::DELETE,
        "/api/provider-accounts/nope".into(),
        o.clone(),
        None,
    )
    .await;
    assert_eq!(st, 404);
    let (st, _) = call(
        M::POST,
        "/api/provider-accounts/nope/opencode-go".into(),
        o.clone(),
        Some(json!({})),
    )
    .await;
    assert_eq!(st, 404);
    let (st, b) = call(M::GET, "/api/providers/nope/models".into(), o.clone(), None).await;
    assert_eq!(st, 404, "{b}");
    let (st, b) = call(
        M::GET,
        "/api/providers/nope/auth/status".into(),
        o.clone(),
        None,
    )
    .await;
    assert_eq!(st, 404, "{b}");
    let (st, b) = call(
        M::POST,
        "/api/providers/omniroute/test".into(),
        o.clone(),
        Some(json!({"baseUrl":"file:///x"})),
    )
    .await;
    assert_eq!(st, 400, "{b}");
    let (st, b) = call(
        M::POST,
        "/api/providers/backend/test".into(),
        o.clone(),
        Some(json!({})),
    )
    .await;
    assert_eq!(st, 400, "{b}");
    let (st, b) = call(
        M::POST,
        "/api/providers/nope/auth/logout".into(),
        o.clone(),
        Some(json!({})),
    )
    .await;
    assert_eq!(st, 404, "{b}");
    // Another user sees an empty account list and cannot touch accounts.
    let (st, b) = call(M::GET, "/api/provider-accounts".into(), x.clone(), None).await;
    assert!(st == 200 && b["accounts"] == json!([]), "{b}");
    let _ = &client;
}
