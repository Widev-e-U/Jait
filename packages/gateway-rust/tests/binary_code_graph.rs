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
        Self::start_with(|_| Vec::new())
    }

    /// `setup` runs once the isolated directory exists and before the gateway starts. It
    /// returns extra environment for the gateway process.
    fn start_with(setup: impl FnOnce(&std::path::Path) -> Vec<(&'static str, String)>) -> Self {
        let directory = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../.jait/artifacts/binary-code-graph-tests")
            .join(uuid::Uuid::new_v4().to_string());
        std::fs::create_dir_all(&directory).unwrap();
        let directory = directory.canonicalize().unwrap();
        let env = setup(&directory);
        let (child, base) = Self::launch(&directory, &env);
        Self {
            child,
            directory,
            base,
        }
    }

    fn launch(directory: &std::path::Path, env: &[(&'static str, String)]) -> (Child, String) {
        let mut command = Command::new(env!("CARGO_BIN_EXE_jait-gateway"));
        command
            .env_clear()
            .env("HOME", directory)
            .env("JAIT_RUST_APPLICATION", "1")
            .env("JAIT_RUST_PORT", "0")
            .env("JAIT_RUST_PROJECT_ROOT", directory)
            .env("JAIT_RUST_DB", directory.join("gateway.sqlite"))
            .env("JWT_SECRET", "isolated-binary-reminder-test-secret");
        for (key, value) in env {
            command.env(key, value);
        }
        let mut child = command
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

/// A local executable stands in for the managed Graphify runtime, which needs Python and a
/// network install. It answers the pinned version probe and writes the graph file that the
/// extract step must produce.
#[cfg(unix)]
const FAKE_GRAPHIFY: &str = r#"#!/bin/sh
case "$1" in
  --version) echo "graphify 0.9.30" ;;
  extract)
    out=""
    while [ "$#" -gt 0 ]; do
      if [ "$1" = "--out" ]; then shift; out="$1"; fi
      shift
    done
    mkdir -p "$out/graphify-out" || exit 1
    printf '%s' '{"nodes":[{"id":"main","label":"main"},{"id":"helper","label":"helper"}],"links":[{"source":"main","target":"helper"}]}' > "$out/graphify-out/graph.json" || exit 1
    ;;
  *) exit 2 ;;
esac
"#;

#[cfg(unix)]
fn fake_graphify(directory: &std::path::Path) -> Vec<(&'static str, String)> {
    use std::os::unix::fs::PermissionsExt;
    let program = directory.join("bin").join("graphify");
    std::fs::create_dir_all(program.parent().unwrap()).unwrap();
    std::fs::write(&program, FAKE_GRAPHIFY).unwrap();
    std::fs::set_permissions(&program, std::fs::Permissions::from_mode(0o755)).unwrap();
    vec![
        (
            "JAIT_GRAPHIFY_COMMAND",
            program.to_string_lossy().into_owned(),
        ),
        ("PATH", "/usr/local/bin:/usr/bin:/bin".into()),
    ]
}

#[cfg(unix)]
#[tokio::test]
async fn owner_index_builds_the_graph_through_the_binary() {
    let gateway = Gateway::start_with(fake_graphify);
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
    let root = gateway.directory.join("project");
    std::fs::create_dir(&root).unwrap();
    std::fs::write(root.join("main.rs"), "fn main() {}\n").unwrap();
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

    let index = client
        .post(url("/api/code-graph/index"))
        .bearer_auth(token)
        .json(&json!({"projectRoot":root}))
        .send()
        .await
        .unwrap();
    let status = index.status();
    let body = index.json::<Value>().await.unwrap();
    assert_eq!(status, 200, "{body}");
    assert_eq!(body["index"]["status"], "ready", "{body}");
    assert_eq!(
        body["index"]["graphifyVersion"], "graphify 0.9.30",
        "{body}"
    );
    assert_eq!(body["index"]["stats"]["nodeCount"], 2, "{body}");
    assert_eq!(body["index"]["stats"]["edgeCount"], 1, "{body}");

    let status = client
        .get(url(&format!("/api/code-graph?{query}")))
        .bearer_auth(token)
        .send()
        .await
        .unwrap()
        .json::<Value>()
        .await
        .unwrap();
    assert_eq!(status["index"]["status"], "ready", "{status}");
    assert_eq!(
        status["index"]["graphRagStatus"], "not-prepared",
        "{status}"
    );

    let snapshot = client
        .get(url(&format!("/api/code-graph/snapshot?{query}")))
        .bearer_auth(token)
        .send()
        .await
        .unwrap();
    assert_eq!(snapshot.status(), 200);
    let snapshot = snapshot.json::<Value>().await.unwrap();
    assert_eq!(
        snapshot["snapshot"]["nodes"].as_array().map(Vec::len),
        Some(2),
        "{snapshot}"
    );

    let found = client
        .post(url("/api/code-graph/query"))
        .bearer_auth(token)
        .json(&json!({"projectRoot":root, "query":"main"}))
        .send()
        .await
        .unwrap();
    assert_eq!(found.status(), 200);
    let found = found.json::<Value>().await.unwrap();
    assert!(
        found["result"]["nodes"]
            .as_array()
            .is_some_and(|nodes| !nodes.is_empty()),
        "{found}"
    );

    let path = client
        .post(url("/api/code-graph/path"))
        .bearer_auth(token)
        .json(&json!({"projectRoot":root, "source":"main", "target":"helper"}))
        .send()
        .await
        .unwrap();
    assert_eq!(path.status(), 200);
    let path = path.json::<Value>().await.unwrap();
    assert!(!path["result"].is_null(), "{path}");
}
