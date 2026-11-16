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
            .join("../../.jait/artifacts/binary-move-trust-tests")
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
async fn session_move_trust_and_project_search_through_the_binary() {
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

    // Session move: validation, ownership, no-op and real move.
    let (_, project) = call(
        M::POST,
        "/api/projects".into(),
        owner.clone(),
        Some(json!({"title":"Searchable Zebra"})),
    )
    .await;
    let pid = project["id"].as_str().unwrap().to_owned();
    let (status, session) = call(
        M::POST,
        "/api/sessions".into(),
        owner.clone(),
        Some(json!({})),
    )
    .await;
    assert_eq!(status, 201, "{session}");
    let id = session["id"].as_str().unwrap().to_owned();
    let path = format!("/api/sessions/{id}/move");
    let (status, body) = call(
        M::POST,
        path.clone(),
        owner.clone(),
        Some(json!({"projectId": 5})),
    )
    .await;
    assert_eq!(status, 400, "{body}");
    let (status, _) = call(
        M::POST,
        path.clone(),
        other.clone(),
        Some(json!({"projectId": null})),
    )
    .await;
    assert_eq!(status, 404);
    let (status, _) = call(
        M::POST,
        path.clone(),
        owner.clone(),
        Some(json!({"projectId": "missing"})),
    )
    .await;
    assert_eq!(status, 404);
    let (status, body) = call(
        M::POST,
        path.clone(),
        owner.clone(),
        Some(json!({"projectId": null})),
    )
    .await;
    assert_eq!(status, 200, "{body}");
    assert_eq!(body["moved"], false, "{body}");
    let (status, body) = call(
        M::POST,
        path.clone(),
        owner.clone(),
        Some(json!({"projectId": pid})),
    )
    .await;
    assert_eq!(status, 200, "{body}");
    assert_eq!(body["moved"], true, "{body}");
    assert_eq!(body["toProjectId"], pid.as_str(), "{body}");
    let (_, listed) = call(
        M::GET,
        format!("/api/projects/{pid}/sessions"),
        owner.clone(),
        None,
    )
    .await;
    assert!(listed.to_string().contains(&id), "{listed}");
    let (_, other_project) = call(
        M::POST,
        "/api/projects".into(),
        other.clone(),
        Some(json!({"title":"Theirs"})),
    )
    .await;
    let opid = other_project["id"].as_str().unwrap().to_owned();
    let (status, _) = call(
        M::POST,
        path.clone(),
        owner.clone(),
        Some(json!({"projectId": opid})),
    )
    .await;
    assert_eq!(status, 404);

    // Project search is owner-scoped.
    let (status, found) = call(
        M::GET,
        "/api/projects/search?q=Zebra".into(),
        owner.clone(),
        None,
    )
    .await;
    assert_eq!(status, 200, "{found}");
    assert!(found.to_string().contains(&pid), "{found}");
    let (_, found) = call(
        M::GET,
        "/api/projects/search?q=Zebra".into(),
        other.clone(),
        None,
    )
    .await;
    assert!(!found.to_string().contains(&pid), "{found}");
    let (_, found) = call(
        M::GET,
        "/api/projects/search?q=".into(),
        owner.clone(),
        None,
    )
    .await;
    assert_eq!(found["projects"], json!([]), "{found}");

    // Trust level read and reset.
    let (status, state) = call(
        M::GET,
        "/api/trust/levels/file.write".into(),
        owner.clone(),
        None,
    )
    .await;
    assert_eq!(status, 200, "{state}");
    let (status, state) = call(
        M::POST,
        "/api/trust/levels/file.write/reset".into(),
        owner.clone(),
        Some(json!({})),
    )
    .await;
    assert_eq!(status, 200, "{state}");
}
