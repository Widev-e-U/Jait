//! Reminder requests through the real gateway executable and isolated storage.
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
            .join("../../.jait/artifacts/binary-code-graph-tests")
            .join(uuid::Uuid::new_v4().to_string());
        std::fs::create_dir_all(&directory).unwrap();
        let directory = directory.canonicalize().unwrap();
        let (child, base) = Self::launch(&directory);
        Self {
            child,
            directory,
            base,
        }
    }

    fn launch(directory: &std::path::Path) -> (Child, String) {
        let mut child = Command::new(env!("CARGO_BIN_EXE_jait-gateway"))
            .env_clear()
            .env("HOME", directory)
            .env("JAIT_RUST_APPLICATION", "1")
            .env("JAIT_RUST_PORT", "0")
            .env("JAIT_RUST_PROJECT_ROOT", directory)
            .env("JAIT_RUST_DB", directory.join("gateway.sqlite"))
            .env("JWT_SECRET", "isolated-binary-reminder-test-secret")
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
        (child, format!("http://{address}"))
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
async fn code_graph_routes_enforce_owned_project_boundaries() {
    let gateway = Gateway::start();
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .unwrap();
    let url = |path: &str| format!("{}{path}", gateway.base);
    let register = client
        .post(url("/api/auth/register"))
        .json(&json!({"username":"owner", "password":"owner-pass-123"}))
        .send()
        .await
        .unwrap();
    assert_eq!(register.status(), 200);
    let owner = register.json::<Value>().await.unwrap();
    let token = owner["access_token"].as_str().unwrap();
    let invite = client
        .post(url("/api/auth/invitations"))
        .bearer_auth(token)
        .json(&json!({}))
        .send()
        .await
        .unwrap()
        .json::<Value>()
        .await
        .unwrap();
    let other = client.post(url("/api/auth/register")).json(&json!({"username":"other", "password":"other-pass-123", "invitation":invite["invitation"]})).send().await.unwrap().json::<Value>().await.unwrap();
    let other_token = other["access_token"].as_str().unwrap();
    let root = gateway.directory.join("project");
    std::fs::create_dir(&root).unwrap();
    let project = client
        .post(url("/api/projects"))
        .bearer_auth(token)
        .json(&json!({"title":"Project", "rootPath":root}))
        .send()
        .await
        .unwrap();
    assert_eq!(project.status(), 201, "{}", project.text().await.unwrap());
    let root = root.to_str().unwrap();
    let query = url::form_urlencoded::Serializer::new(String::new())
        .append_pair("projectRoot", root)
        .finish();
    let endpoint = url(&format!("/api/code-graph?{query}"));
    assert_eq!(client.get(&endpoint).send().await.unwrap().status(), 401);
    assert_eq!(
        client
            .get(url("/api/code-graph"))
            .bearer_auth(token)
            .send()
            .await
            .unwrap()
            .status(),
        400
    );
    assert_eq!(
        client
            .get(&endpoint)
            .bearer_auth(other_token)
            .send()
            .await
            .unwrap()
            .status(),
        404
    );
    let response = client
        .get(&endpoint)
        .bearer_auth(token)
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 200, "{}", response.text().await.unwrap());
    let index = response.json::<Value>().await.unwrap();
    assert_eq!(index["index"]["projectRoot"], root);
    assert_eq!(index["index"]["status"], "missing");
    assert_eq!(index["index"]["graphRagStatus"], "not-prepared");
    let snapshot = client
        .get(url(&format!("/api/code-graph/snapshot?{query}")))
        .bearer_auth(token)
        .send()
        .await
        .unwrap();
    assert_eq!(snapshot.status(), 409);
    assert_eq!(
        snapshot.json::<Value>().await.unwrap()["code"],
        "GRAPH_NOT_READY"
    );
    let query_body = json!({"projectRoot":root, "query":"test"});
    assert_eq!(
        client
            .post(url("/api/code-graph/query"))
            .bearer_auth(other_token)
            .json(&query_body)
            .send()
            .await
            .unwrap()
            .status(),
        404
    );
    // Every graph operation must reject a different user's project before
    // consulting the graph backend, including operations that can write.
    for (path, body) in [
        ("/api/code-graph/index", json!({"projectRoot":root})),
        (
            "/api/code-graph/path",
            json!({"projectRoot":root, "source":"a", "target":"b"}),
        ),
        (
            "/api/code-graph/graphrag/prepare",
            json!({"projectRoot":root}),
        ),
    ] {
        let response = client
            .post(url(path))
            .bearer_auth(other_token)
            .json(&body)
            .send()
            .await
            .unwrap();
        assert_eq!(response.status(), 404, "{path}");
        assert_eq!(
            response.json::<Value>().await.unwrap()["error"],
            "Project not found",
            "{path}"
        );
    }
    let result = client
        .post(url("/api/code-graph/query"))
        .bearer_auth(token)
        .json(&query_body)
        .send()
        .await
        .unwrap();
    assert_eq!(result.status(), 409);
    assert_eq!(
        result.json::<Value>().await.unwrap()["code"],
        "GRAPH_NOT_READY"
    );
    let response = client
        .post(url("/api/code-graph/query"))
        .bearer_auth(token)
        .json(&json!({"projectRoot":root, "query":""}))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 400);
}
