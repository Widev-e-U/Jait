//! Scheduled job routes through the production binary.
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
            .join("../../.jait/artifacts/binary-jobs-routes-tests")
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
async fn jobs_routes_through_the_binary() {
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

    // Auth required.
    let r = client.get(url("/api/jobs")).send().await.unwrap();
    assert_eq!(r.status(), 401);

    // Validation.
    let (st, _) = call(M::POST, "/api/jobs".into(), owner.clone(), Some(json!({}))).await;
    assert_eq!(st, 400);
    let (st, _) = call(
        M::POST,
        "/api/jobs".into(),
        owner.clone(),
        Some(json!({"name":"x","cron_expression":"nope"})),
    )
    .await;
    assert_eq!(st, 400);
    let (st, _) = call(
        M::POST,
        "/api/jobs".into(),
        owner.clone(),
        Some(json!({"name":"x","cron_expression":"* * * * *","job_type":"agent_task"})),
    )
    .await;
    assert_eq!(st, 400);

    // Create, list, get.
    let (st, job) = call(
        M::POST,
        "/api/jobs".into(),
        owner.clone(),
        Some(json!({"name":"nightly","cron_expression":"0 3 * * *","enabled":false})),
    )
    .await;
    assert_eq!(st, 201, "{job}");
    assert_eq!(job["name"], "nightly");
    assert_eq!(job["job_type"], "system_job");
    assert_eq!(job["enabled"], false);
    let id = job["id"].as_str().unwrap().to_owned();
    let (st, list) = call(M::GET, "/api/jobs".into(), owner.clone(), None).await;
    assert!(st == 200 && list["total"] == 1, "{list}");
    let (_, list) = call(
        M::GET,
        "/api/jobs?include_disabled=false".into(),
        owner.clone(),
        None,
    )
    .await;
    assert_eq!(list["total"], 0, "{list}");
    let (_, list) = call(M::GET, "/api/jobs".into(), other.clone(), None).await;
    assert_eq!(list["total"], 0, "{list}");
    let (st, got) = call(M::GET, format!("/api/jobs/{id}"), owner.clone(), None).await;
    assert!(st == 200 && got["id"] == id.as_str(), "{got}");

    // Another user cannot see or change it.
    for (m, p, body) in [
        (M::GET, format!("/api/jobs/{id}"), None),
        (
            M::PATCH,
            format!("/api/jobs/{id}"),
            Some(json!({"name":"hijack"})),
        ),
        (M::DELETE, format!("/api/jobs/{id}"), None),
        (M::GET, format!("/api/jobs/{id}/runs"), None),
        (M::POST, format!("/api/jobs/{id}/trigger"), Some(json!({}))),
    ] {
        let (st, b) = call(m.clone(), p.clone(), other.clone(), body).await;
        assert_eq!(st, 404, "{m} {p} {b}");
    }

    // Owner patch.
    let (st, b) = call(
        M::PATCH,
        format!("/api/jobs/{id}"),
        owner.clone(),
        Some(json!({"cron_expression":"bad"})),
    )
    .await;
    assert_eq!(st, 400, "{b}");
    let (st, b) = call(
        M::PATCH,
        format!("/api/jobs/{id}"),
        owner.clone(),
        Some(json!({"name":"renamed","enabled":true})),
    )
    .await;
    assert!(
        st == 200 && b["name"] == "renamed" && b["enabled"] == true,
        "{b}"
    );

    // Runs, providers.
    let (st, b) = call(M::GET, format!("/api/jobs/{id}/runs"), owner.clone(), None).await;
    assert!(st == 200 && b["items"].is_array(), "{b}");
    let (st, b) = call(
        M::GET,
        "/api/jobs/providers/available".into(),
        owner.clone(),
        None,
    )
    .await;
    assert!(st == 200 && b["providers"].is_object(), "{b}");

    // Delete.
    let (st, _) = call(M::DELETE, format!("/api/jobs/{id}"), owner.clone(), None).await;
    assert_eq!(st, 204);
    let (st, _) = call(M::DELETE, format!("/api/jobs/{id}"), owner.clone(), None).await;
    assert_eq!(st, 404);
}
