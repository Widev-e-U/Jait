//! Session and project routes through the production binary, isolated by owner.
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
            .join("../../.jait/artifacts/binary-sessions-projects-tests")
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
            .env("JWT_SECRET", "isolated-sessions-projects-secret")
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
async fn sessions_and_projects_are_owned_through_the_binary() {
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

    // Sessions: create, list, get, patch, archive, delete, all owner-scoped.
    let (status, session) = call(
        M::POST,
        "/api/sessions".into(),
        owner.clone(),
        Some(json!({})),
    )
    .await;
    assert_eq!(status, 201, "{session}");
    let id = session["id"].as_str().unwrap().to_owned();
    let (status, list) = call(M::GET, "/api/sessions".into(), owner.clone(), None).await;
    assert_eq!(status, 200, "{list}");
    assert!(list.to_string().contains(&id), "{list}");
    let (_, other_list) = call(M::GET, "/api/sessions".into(), other.clone(), None).await;
    assert!(!other_list.to_string().contains(&id), "{other_list}");
    let (status, got) = call(M::GET, format!("/api/sessions/{id}"), owner.clone(), None).await;
    assert_eq!(status, 200, "{got}");
    assert_eq!(got["id"], id.as_str());
    let (status, _) = call(M::GET, format!("/api/sessions/{id}"), other.clone(), None).await;
    assert_eq!(status, 404);
    let (status, _) = call(
        M::PATCH,
        format!("/api/sessions/{id}"),
        other.clone(),
        Some(json!({"name":"stolen"})),
    )
    .await;
    assert_eq!(status, 404);
    let (status, patched) = call(
        M::PATCH,
        format!("/api/sessions/{id}"),
        owner.clone(),
        Some(json!({"name":"Renamed"})),
    )
    .await;
    assert_eq!(status, 200, "{patched}");
    let (_, got) = call(M::GET, format!("/api/sessions/{id}"), owner.clone(), None).await;
    assert_eq!(got["name"], "Renamed", "{got}");
    let (status, _) = call(
        M::POST,
        format!("/api/sessions/{id}/archive"),
        other.clone(),
        Some(json!({})),
    )
    .await;
    assert_eq!(status, 404);
    let (status, _) = call(
        M::DELETE,
        format!("/api/sessions/{id}"),
        other.clone(),
        None,
    )
    .await;
    assert_eq!(status, 404);
    let (status, body) = call(
        M::DELETE,
        format!("/api/sessions/{id}"),
        owner.clone(),
        None,
    )
    .await;
    assert!(status == 200 || status == 204, "{status} {body}");
    // Deletion is soft, as in the Node gateway: the row stays and is marked deleted.
    let (_, got) = call(M::GET, format!("/api/sessions/{id}"), owner.clone(), None).await;
    assert_eq!(got["status"], "deleted", "{got}");

    // Projects: create, list, get, patch, delete, all owner-scoped.
    let (status, project) = call(
        M::POST,
        "/api/projects".into(),
        owner.clone(),
        Some(json!({"title":"Alpha"})),
    )
    .await;
    assert_eq!(status, 201, "{project}");
    let pid = project["id"].as_str().unwrap().to_owned();
    let (status, list) = call(M::GET, "/api/projects".into(), owner.clone(), None).await;
    assert_eq!(status, 200, "{list}");
    assert!(list.to_string().contains(&pid), "{list}");
    let (_, other_list) = call(M::GET, "/api/projects".into(), other.clone(), None).await;
    assert!(!other_list.to_string().contains(&pid), "{other_list}");
    let (status, got) = call(M::GET, format!("/api/projects/{pid}"), owner.clone(), None).await;
    assert_eq!(status, 200, "{got}");
    let (status, _) = call(M::GET, format!("/api/projects/{pid}"), other.clone(), None).await;
    assert_eq!(status, 404);
    let (status, _) = call(
        M::PATCH,
        format!("/api/projects/{pid}"),
        other.clone(),
        Some(json!({"name":"stolen"})),
    )
    .await;
    assert_eq!(status, 404);
    let (status, patched) = call(
        M::PATCH,
        format!("/api/projects/{pid}"),
        owner.clone(),
        Some(json!({"title":"Beta"})),
    )
    .await;
    assert_eq!(status, 200, "{patched}");
    let (_, got) = call(M::GET, format!("/api/projects/{pid}"), owner.clone(), None).await;
    assert!(got.to_string().contains("Beta"), "{got}");
    let (status, _) = call(
        M::DELETE,
        format!("/api/projects/{pid}"),
        other.clone(),
        None,
    )
    .await;
    assert_eq!(status, 404);
    let (status, body) = call(
        M::DELETE,
        format!("/api/projects/{pid}"),
        owner.clone(),
        None,
    )
    .await;
    assert!(status == 200 || status == 204, "{status} {body}");
    let (_, list) = call(M::GET, "/api/projects".into(), owner.clone(), None).await;
    assert!(
        !list.to_string().contains("Beta") || list.to_string().contains("deleted"),
        "{list}"
    );
}
