//! The composed binary serves the built web UI on its gateway port only when `JAIT_WEB_DIR`
//! names a build with an `index.html`. A non-loopback bind is refused without the explicit flag.
use serde_json::Value;
use std::{
    io::{BufRead, BufReader, Read},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::mpsc,
    time::{Duration, Instant},
};

const SHELL_MARKER: &str = "jait-web-shell";
const ASSET_MARKER: &str = "jait-asset-marker";

/// A per-test directory under the artifacts root, removed on drop.
struct Scratch(PathBuf);

impl Scratch {
    fn new() -> Self {
        let directory = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../.jait/artifacts/binary-web-ui-tests")
            .join(uuid::Uuid::new_v4().to_string());
        std::fs::create_dir_all(&directory).unwrap();
        Self(directory.canonicalize().unwrap())
    }
}

impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

fn write_web_build(root: &Path) {
    std::fs::create_dir_all(root.join("assets")).unwrap();
    std::fs::write(
        root.join("index.html"),
        format!("<html>{SHELL_MARKER}</html>"),
    )
    .unwrap();
    std::fs::write(
        root.join("assets").join("app.js"),
        format!("console.log('{ASSET_MARKER}')"),
    )
    .unwrap();
}

struct Gateway {
    child: Child,
    base: String,
}

impl Gateway {
    fn start(scratch: &Scratch, web_root: Option<&Path>) -> Self {
        let mut command = Command::new(env!("CARGO_BIN_EXE_jait-gateway"));
        command
            .env_clear()
            .env("HOME", &scratch.0)
            .env("JAIT_RUST_APPLICATION", "1")
            .env("JAIT_RUST_PORT", "0")
            .env("JAIT_RUST_PROJECT_ROOT", &scratch.0)
            .env("JAIT_RUST_DB", scratch.0.join("gateway.sqlite"))
            .env("JWT_SECRET", "binary-web-ui-secret")
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit());
        if let Some(root) = web_root {
            command.env("JAIT_WEB_DIR", root);
        }
        let mut child = command.spawn().unwrap();
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
        assert!(address.starts_with("127.0.0.1:"), "{address}");
        Self {
            child,
            base: format!("http://{address}"),
        }
    }
}

impl Drop for Gateway {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

#[tokio::test]
async fn composed_binary_serves_the_built_ui_and_keeps_api_paths_json() {
    let scratch = Scratch::new();
    let web = scratch.0.join("web");
    write_web_build(&web);
    let gateway = Gateway::start(&scratch, Some(web.as_path()));
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .unwrap();
    let get = |path: &str| client.get(format!("{}{path}", gateway.base)).send();

    let root = get("/").await.unwrap();
    assert_eq!(root.status(), 200);
    assert!(
        root.headers()["content-type"]
            .to_str()
            .unwrap()
            .starts_with("text/html")
    );
    assert!(root.text().await.unwrap().contains(SHELL_MARKER));

    let asset = get("/assets/app.js").await.unwrap();
    assert_eq!(asset.status(), 200);
    assert!(asset.text().await.unwrap().contains(ASSET_MARKER));

    // Client routes fall back to the shell.
    let spa = get("/projects/alpha").await.unwrap();
    assert_eq!(spa.status(), 200);
    assert!(spa.text().await.unwrap().contains(SHELL_MARKER));

    // An unclaimed API path is a refusal or JSON not-found, never the shell.
    let unknown = get("/api/does-not-exist").await.unwrap();
    let status = unknown.status();
    let body = unknown.text().await.unwrap();
    assert!(
        matches!(status.as_u16(), 401 | 404),
        "/api/does-not-exist -> {status}"
    );
    assert!(
        !body.contains(SHELL_MARKER),
        "/api/does-not-exist received the shell"
    );

    // The health route is claimed by its own JSON handler (200, or 503 when storage is down).
    let health = get("/health").await.unwrap();
    let content_type = health.headers()["content-type"]
        .to_str()
        .unwrap()
        .to_owned();
    let body = health.text().await.unwrap();
    assert!(
        content_type.starts_with("application/json"),
        "/health -> {content_type}"
    );
    assert!(
        serde_json::from_str::<Value>(&body).is_ok(),
        "/health is not JSON: {body}"
    );
    assert!(!body.contains(SHELL_MARKER), "/health received the shell");

    // Only GET and HEAD reach the shell.
    let post = client
        .post(format!("{}/", gateway.base))
        .send()
        .await
        .unwrap();
    assert_eq!(post.status(), 404);
    assert!(!post.text().await.unwrap().contains(SHELL_MARKER));
}

#[tokio::test]
async fn composed_binary_serves_no_ui_without_a_web_dir() {
    let scratch = Scratch::new();
    let gateway = Gateway::start(&scratch, None);
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .unwrap();
    let root = client
        .get(format!("{}/", gateway.base))
        .send()
        .await
        .unwrap();
    assert_eq!(root.status(), 404);
    assert!(!root.text().await.unwrap().contains(SHELL_MARKER));
}

#[test]
fn composed_binary_refuses_a_non_loopback_bind_without_the_migration_flag() {
    let mut child = Command::new(env!("CARGO_BIN_EXE_jait-gateway"))
        .env_clear()
        .env("JAIT_RUST_HOST", "0.0.0.0")
        .env("JAIT_RUST_PORT", "0")
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    let deadline = Instant::now() + Duration::from_secs(20);
    let status = loop {
        if let Some(status) = child.try_wait().unwrap() {
            break status;
        }
        if Instant::now() > deadline {
            let _ = child.kill();
            let _ = child.wait();
            panic!("gateway kept running with a non-loopback host and no migration flag");
        }
        std::thread::sleep(Duration::from_millis(25));
    };
    let mut stderr = String::new();
    child
        .stderr
        .take()
        .unwrap()
        .read_to_string(&mut stderr)
        .unwrap();
    assert!(!status.success(), "{stderr}");
    assert!(
        stderr.contains("JAIT_RUST_HOST must be loopback during migration"),
        "{stderr}"
    );
}
