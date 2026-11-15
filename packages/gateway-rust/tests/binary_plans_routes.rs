//! Plan routes through the production binary.
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
            .join("../../.jait/artifacts/binary-plans-routes-tests")
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
async fn plan_routes_through_the_binary() {
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

    let dir = gateway.directory.to_string_lossy().to_string();

    let (st, _) = call(M::GET, "/api/plans/nope".into(), String::new(), None).await;
    assert_eq!(st, 401);

    let (st, b) = call(
        M::POST,
        "/api/repos".into(),
        owner.clone(),
        Some(json!({"name":"plan-repo","localPath":dir})),
    )
    .await;
    assert_eq!(st, 200, "{b}");
    let repo = b["repo"]["id"].as_str().unwrap().to_owned();
    let list_path = format!("/api/repos/{repo}/plans");

    // Another user cannot see or create plans in the owner's repo.
    let (st, _) = call(M::GET, list_path.clone(), other.clone(), None).await;
    assert_eq!(st, 404);
    let (st, _) = call(M::POST, list_path.clone(), other.clone(), Some(json!({"title":"x"}))).await;
    assert_eq!(st, 404);

    let (st, b) = call(M::GET, list_path.clone(), owner.clone(), None).await;
    assert!(st == 200 && b["plans"] == json!([]), "{b}");
    let (st, b) = call(
        M::POST,
        list_path.clone(),
        owner.clone(),
        Some(json!({"title":"Roadmap","tasks":[{"id":"t1","title":"First","status":"proposed"}]})),
    )
    .await;
    assert_eq!(st, 201, "{b}");
    let id = b["plan"]["id"].as_str().unwrap().to_owned();
    assert_eq!(b["plan"]["title"], "Roadmap");
    let (_, b) = call(M::GET, list_path.clone(), owner.clone(), None).await;
    assert_eq!(b["plans"].as_array().unwrap().len(), 1, "{b}");

    let plan_path = format!("/api/plans/{id}");
    let (st, b) = call(M::GET, plan_path.clone(), owner.clone(), None).await;
    assert!(st == 200 && b["plan"]["id"] == id.as_str(), "{b}");
    for (m, p, body) in [
        (M::GET, plan_path.clone(), None),
        (M::PATCH, plan_path.clone(), Some(json!({"title":"hijack"}))),
        (M::DELETE, plan_path.clone(), None),
        (M::POST, format!("{plan_path}/start"), Some(json!({}))),
        (M::POST, format!("{plan_path}/tasks/t1/start"), Some(json!({}))),
    ] {
        let (st, b) = call(m.clone(), p.clone(), other.clone(), body).await;
        assert_eq!(st, 404, "{m} {p} {b}");
    }

    let (st, b) = call(
        M::PATCH,
        plan_path.clone(),
        owner.clone(),
        Some(json!({"title":"Renamed","status":"active"})),
    )
    .await;
    assert!(st == 200 && b["plan"]["title"] == "Renamed" && b["plan"]["status"] == "active", "{b}");
    // Unknown statuses are ignored rather than stored.
    let (_, b) = call(M::PATCH, plan_path.clone(), owner.clone(), Some(json!({"status":"bogus"}))).await;
    assert_eq!(b["plan"]["status"], "active", "{b}");

    // Starting with no approved tasks is rejected.
    let (st, _) = call(M::POST, format!("{plan_path}/start"), owner.clone(), Some(json!({}))).await;
    assert_eq!(st, 400);
    let (st, _) = call(M::POST, format!("{plan_path}/tasks/missing/start"), owner.clone(), Some(json!({}))).await;
    assert_eq!(st, 404);
    // Starting a task approves it and returns the repo view.
    let (st, b) = call(M::POST, format!("{plan_path}/tasks/t1/start"), owner.clone(), Some(json!({}))).await;
    assert!(st == 200 && b["task"]["id"] == "t1" && b["repo"]["id"] == repo.as_str(), "{b}");
    let (_, b) = call(M::GET, plan_path.clone(), owner.clone(), None).await;
    assert_eq!(b["plan"]["tasks"][0]["status"], "approved", "{b}");
    let (st, b) = call(M::POST, format!("{plan_path}/start"), owner.clone(), Some(json!({}))).await;
    assert!(st == 200 && b["tasks"].as_array().unwrap().len() == 1, "{b}");

    // Delete: owner succeeds once.
    let (st, b) = call(M::DELETE, plan_path.clone(), owner.clone(), None).await;
    assert!(st == 200 && b["ok"] == true, "{b}");
    let (st, _) = call(M::GET, plan_path, owner.clone(), None).await;
    assert_eq!(st, 404);
}
