//! Repository routes through the production binary.
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
            .join("../../.jait/artifacts/binary-repos-tests")
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
async fn repository_crud_and_strategy_are_owned_through_the_binary() {
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

    let local = gateway
        .directory
        .join("repo-one")
        .to_string_lossy()
        .into_owned();
    let (status, body) = call(
        M::POST,
        "/api/repos".into(),
        owner.clone(),
        Some(json!({"name":"x"})),
    )
    .await;
    assert_eq!(status, 400, "{body}");
    let (status, created) = call(
        M::POST,
        "/api/repos".into(),
        owner.clone(),
        Some(json!({"name":"One","localPath":local})),
    )
    .await;
    assert_eq!(status, 200, "{created}");
    let id = created["repo"]["id"].as_str().unwrap().to_owned();
    // Same path for the same user returns the existing repository.
    let (_, again) = call(
        M::POST,
        "/api/repos".into(),
        owner.clone(),
        Some(json!({"name":"Two","localPath":local})),
    )
    .await;
    assert_eq!(again["repo"]["id"], id.as_str(), "{again}");
    let (_, list) = call(M::GET, "/api/repos".into(), owner.clone(), None).await;
    assert!(list.to_string().contains(&id), "{list}");
    let (_, other_list) = call(M::GET, "/api/repos".into(), other.clone(), None).await;
    assert!(!other_list.to_string().contains(&id), "{other_list}");

    let (status, patched) = call(
        M::PATCH,
        format!("/api/repos/{id}"),
        owner.clone(),
        Some(json!({"name":"Renamed"})),
    )
    .await;
    assert_eq!(status, 200, "{patched}");
    assert_eq!(patched["repo"]["name"], "Renamed", "{patched}");
    let (status, _) = call(
        M::PATCH,
        format!("/api/repos/{id}"),
        other.clone(),
        Some(json!({"name":"stolen"})),
    )
    .await;
    assert_eq!(status, 404);

    // Strategy is owner-scoped and must be a string.
    let (status, strategy) = call(
        M::GET,
        format!("/api/repos/{id}/strategy"),
        owner.clone(),
        None,
    )
    .await;
    assert_eq!(status, 200, "{strategy}");
    assert_eq!(strategy["strategy"], "", "{strategy}");
    let (status, _) = call(
        M::GET,
        format!("/api/repos/{id}/strategy"),
        other.clone(),
        None,
    )
    .await;
    assert_eq!(status, 404);
    let (status, _) = call(
        M::PUT,
        format!("/api/repos/{id}/strategy"),
        other.clone(),
        Some(json!({"strategy":"stolen"})),
    )
    .await;
    assert_eq!(status, 404);
    let (status, _) = call(
        M::PUT,
        format!("/api/repos/{id}/strategy"),
        owner.clone(),
        Some(json!({"strategy":7})),
    )
    .await;
    assert_eq!(status, 400);
    let (status, put) = call(
        M::PUT,
        format!("/api/repos/{id}/strategy"),
        owner.clone(),
        Some(json!({"strategy":"# Plan"})),
    )
    .await;
    assert_eq!(status, 200, "{put}");
    let (_, strategy) = call(
        M::GET,
        format!("/api/repos/{id}/strategy"),
        owner.clone(),
        None,
    )
    .await;
    assert_eq!(strategy["strategy"], "# Plan", "{strategy}");

    let (status, _) = call(M::DELETE, format!("/api/repos/{id}"), other.clone(), None).await;
    assert_eq!(status, 404);
    let (status, deleted) = call(M::DELETE, format!("/api/repos/{id}"), owner.clone(), None).await;
    assert_eq!(status, 200, "{deleted}");
    let (_, list) = call(M::GET, "/api/repos".into(), owner.clone(), None).await;
    assert!(!list.to_string().contains(&id), "{list}");
    let (status, _) = call(M::DELETE, format!("/api/repos/{id}"), owner.clone(), None).await;
    assert_eq!(status, 404);
}
