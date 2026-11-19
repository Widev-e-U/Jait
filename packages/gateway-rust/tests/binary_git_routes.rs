//! Git routes through the production binary, on real repositories inside an isolated directory.
use serde_json::{Value, json};
use std::{
    io::{BufRead, BufReader},
    path::{Path, PathBuf},
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
        // The system temp directory is outside any repository, so "not a repository" stays true.
        let directory =
            std::env::temp_dir().join(format!("jait-git-routes-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&directory).unwrap();
        let directory = directory.canonicalize().unwrap();
        // The gateway needs git on PATH. Its HOME is isolated, so its global git config is empty.
        let mut child = Command::new(env!("CARGO_BIN_EXE_jait-gateway"))
            .env_clear()
            .env("HOME", &directory)
            .env("PATH", std::env::var("PATH").unwrap_or_default())
            .env("JAIT_RUST_APPLICATION", "1")
            .env("JAIT_RUST_PORT", "0")
            .env("JAIT_RUST_PROJECT_ROOT", &directory)
            .env("JAIT_RUST_DB", directory.join("gateway.sqlite"))
            .env("JWT_SECRET", "isolated-binary-git-routes-test-secret")
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

struct Api {
    client: reqwest::Client,
    base: String,
    token: String,
}

impl Api {
    async fn post(&self, path: &str, body: Value) -> (u16, Value) {
        let response = self
            .client
            .post(format!("{}{path}", self.base))
            .bearer_auth(&self.token)
            .json(&body)
            .send()
            .await
            .unwrap();
        let status = response.status().as_u16();
        let text = response.text().await.unwrap();
        (
            status,
            serde_json::from_str(&text).unwrap_or(Value::String(text)),
        )
    }
}

/// Repository setup uses the git CLI, so these commits are not part of the routes under test.
fn git_cli(dir: &Path, args: &[&str]) -> String {
    let output = Command::new("git")
        .arg("-C")
        .arg(dir)
        .args(args)
        .env("GIT_CONFIG_GLOBAL", "/dev/null")
        .env("GIT_CONFIG_NOSYSTEM", "1")
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "git {args:?}: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    String::from_utf8(output.stdout).unwrap()
}

/// Git routes act only on the exact root of an active project the caller owns, so every
/// repository the test uses is registered as a project before any git call.
async fn register_project(api: &Api, title: &str, root: &Path) {
    let (status, body) = api
        .post("/api/projects", json!({"title": title, "rootPath": root}))
        .await;
    assert_eq!(status, 201, "{body}");
}

#[tokio::test]
async fn git_routes_operate_on_owned_repositories_through_the_binary() {
    let gateway = Gateway::start();
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .unwrap();
    let registered: Value = client
        .post(format!("{}/api/auth/register", gateway.base))
        .json(&json!({"username":"owner", "password":"owner-pass-123"}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let api = Api {
        client: client.clone(),
        base: gateway.base.clone(),
        token: registered["access_token"].as_str().unwrap().to_owned(),
    };
    let anonymous = client
        .post(format!("{}/api/git/status", gateway.base))
        .json(&json!({"cwd": "/"}))
        .send()
        .await
        .unwrap();
    assert_eq!(anonymous.status(), 401);
    let (status, body) = api.post("/api/git/status", json!({})).await;
    assert_eq!(
        (status, body["error"].as_str()),
        (400, Some("Missing cwd")),
        "{body}"
    );

    // A directory that is not a repository reports the empty status.
    let plain = gateway.directory.join("plain");
    std::fs::create_dir(&plain).unwrap();
    register_project(&api, "plain", &plain).await;
    let (status, body) = api.post("/api/git/status", json!({"cwd": plain})).await;
    assert_eq!(status, 200, "{body}");
    assert!(
        body["branch"].is_null() && body["hasWorkingTreeChanges"] == false,
        "{body}"
    );

    // Initialise a repository and set its identity through the routes.
    let repo = gateway.directory.join("repo");
    std::fs::create_dir(&repo).unwrap();
    register_project(&api, "repo", &repo).await;
    let (status, body) = api.post("/api/git/init", json!({"cwd": repo})).await;
    assert!(status == 200 && body["ok"] == true, "{body}");
    assert!(repo.join(".git").is_dir());
    let (status, body) = api
        .post(
            "/api/git/identity",
            json!({"cwd": repo, "name": "Ada Tester", "email": "ada@example.test"}),
        )
        .await;
    assert!(
        status == 200 && body["name"] == "Ada Tester" && body["email"] == "ada@example.test",
        "{body}"
    );
    let (status, body) = api.post("/api/git/identity", json!({"cwd": repo})).await;
    assert!(
        status == 200 && body["name"] == "Ada Tester" && body["email"] == "ada@example.test",
        "{body}"
    );
    let (status, body) = api
        .post("/api/git/identity", json!({"cwd": repo, "name": "Ada"}))
        .await;
    assert_eq!(
        (status, body["error"].as_str()),
        (400, Some("Both name and email are required")),
        "{body}"
    );

    // The first commit comes from the git CLI, not from a route.
    std::fs::write(repo.join("README.md"), "hello\n").unwrap();
    git_cli(&repo, &["add", "-A"]);
    git_cli(&repo, &["commit", "-q", "-m", "Initial commit"]);
    let default_branch = git_cli(&repo, &["rev-parse", "--abbrev-ref", "HEAD"])
        .trim()
        .to_owned();

    // Status, branch listing, and branch switching.
    let (status, body) = api.post("/api/git/status", json!({"cwd": repo})).await;
    assert_eq!(status, 200, "{body}");
    assert_eq!(body["branch"], default_branch.as_str(), "{body}");
    assert_eq!(body["hasWorkingTreeChanges"], false, "{body}");
    let (status, body) = api.post("/api/git/branches", json!({"cwd": repo})).await;
    assert!(
        status == 200
            && body["isRepo"] == true
            && body["branches"]
                .as_array()
                .unwrap()
                .iter()
                .any(|name| name == default_branch.as_str()),
        "{body}"
    );
    let (status, body) = api
        .post("/api/git/create-branch", json!({"cwd": repo}))
        .await;
    assert_eq!(
        (status, body["error"].as_str()),
        (400, Some("Missing cwd or branch")),
        "{body}"
    );
    let (status, body) = api
        .post(
            "/api/git/create-branch",
            json!({"cwd": repo, "branch": "feature/notes"}),
        )
        .await;
    assert!(
        status == 200 && body["ok"] == true && body["branch"] == "feature/notes",
        "{body}"
    );
    let (status, body) = api
        .post(
            "/api/git/checkout",
            json!({"cwd": repo, "branch": default_branch}),
        )
        .await;
    assert!(status == 200 && body["ok"] == true, "{body}");
    let (_, body) = api.post("/api/git/status", json!({"cwd": repo})).await;
    assert_eq!(body["branch"], default_branch.as_str(), "{body}");
    let (status, body) = api
        .post(
            "/api/git/checkout",
            json!({"cwd": repo, "branch": "no-such-branch"}),
        )
        .await;
    assert!(
        status == 500
            && body["error"]
                .as_str()
                .is_some_and(|error| !error.is_empty()),
        "{body}"
    );
    let (status, body) = api
        .post(
            "/api/git/checkout",
            json!({"cwd": repo, "branch": "feature/notes"}),
        )
        .await;
    assert!(status == 200 && body["ok"] == true, "{body}");

    // A tracked edit and an untracked file, through the diff views.
    std::fs::write(repo.join("README.md"), "changed\n").unwrap();
    std::fs::write(repo.join("notes.txt"), "todo\n").unwrap();
    let (status, body) = api.post("/api/git/diff", json!({"cwd": repo})).await;
    assert!(status == 200 && body["hasChanges"] == true, "{body}");
    assert!(
        body["diff"].as_str().unwrap().contains("+changed"),
        "{body}"
    );
    let (status, body) = api.post("/api/git/diff-stats", json!({"cwd": repo})).await;
    assert!(
        status == 200
            && body["files"] == 2
            && body["insertions"] == 1
            && body["deletions"] == 1
            && body["hasChanges"] == true,
        "{body}"
    );
    let (status, body) = api
        .post(
            "/api/git/file-diffs",
            json!({"cwd": repo, "paths": ["README.md", "notes.txt"]}),
        )
        .await;
    assert_eq!(status, 200, "{body}");
    let files = body["files"].as_array().unwrap();
    assert_eq!(files.len(), 2, "{body}");
    // The reference trims one terminal newline from blob reads (`trimCommandOutput` in
    // services/git.ts) but not from working-tree reads, so `original` has no trailing newline.
    assert!(
        files.iter().any(|file| file["path"] == "README.md"
            && file["status"] == "M"
            && file["original"] == "hello"
            && file["modified"] == "changed\n"),
        "{body}"
    );
    assert!(
        files.iter().any(|file| file["path"] == "notes.txt"
            && file["status"] == "?"
            && file["original"] == ""
            && file["modified"] == "todo\n"),
        "{body}"
    );

    // Staging moves the tracked file into the index, and unstaging moves it back.
    let (status, body) = api
        .post(
            "/api/git/stage",
            json!({"cwd": repo, "paths": ["README.md"]}),
        )
        .await;
    assert!(status == 200 && body["ok"] == true, "{body}");
    let (_, body) = api.post("/api/git/status", json!({"cwd": repo})).await;
    assert_eq!(
        body["index"]["files"].as_array().unwrap().len(),
        1,
        "{body}"
    );
    let (status, body) = api
        .post(
            "/api/git/unstage",
            json!({"cwd": repo, "paths": ["README.md"]}),
        )
        .await;
    assert!(status == 200 && body["ok"] == true, "{body}");
    let (_, body) = api.post("/api/git/status", json!({"cwd": repo})).await;
    assert_eq!(
        body["index"]["files"].as_array().unwrap().len(),
        0,
        "{body}"
    );
    assert_eq!(
        body["workingTree"]["files"].as_array().unwrap().len(),
        2,
        "{body}"
    );

    // Discard restores a tracked file. Removing an untracked file runs `git clean`, which the
    // authority does not allow (`permitted` in runtime/git_mount.rs), so the route refuses it.
    // This asserts the current policy. Allowing `git clean -f -- <paths>` inside owned roots is
    // an owner decision.
    let (status, body) = api
        .post(
            "/api/git/discard",
            json!({"cwd": repo, "paths": ["README.md"]}),
        )
        .await;
    assert!(
        status == 200 && body["ok"] == true && body["discardedCount"] == 1,
        "{body}"
    );
    assert_eq!(
        std::fs::read_to_string(repo.join("README.md")).unwrap(),
        "hello\n"
    );
    let (status, body) = api
        .post(
            "/api/git/discard",
            json!({"cwd": repo, "paths": ["notes.txt"]}),
        )
        .await;
    let refused = body["error"]
        .as_str()
        .is_some_and(|error| error.contains("not authorized"));
    assert_eq!((status, refused), (500, true), "{body}");
    assert_eq!(
        std::fs::read_to_string(repo.join("notes.txt")).unwrap(),
        "todo\n"
    );
    std::fs::remove_file(repo.join("notes.txt")).unwrap();
    let (_, body) = api.post("/api/git/status", json!({"cwd": repo})).await;
    assert_eq!(body["hasWorkingTreeChanges"], false, "{body}");

    // A committed change on the feature branch, compared with the default branch.
    std::fs::write(repo.join("README.md"), "branch edit\n").unwrap();
    git_cli(
        &repo,
        &["commit", "-q", "-am", "Edit on the feature branch"],
    );
    let (status, body) = api
        .post(
            "/api/git/diff-stats",
            json!({"cwd": repo, "baseBranch": default_branch, "branch": "feature/notes"}),
        )
        .await;
    assert!(
        status == 200 && body["files"] == 1 && body["insertions"] == 1 && body["deletions"] == 1,
        "{body}"
    );
    let (status, body) = api
        .post(
            "/api/git/file-diffs",
            json!({"cwd": repo, "baseBranch": default_branch, "branch": "feature/notes"}),
        )
        .await;
    assert_eq!(status, 200, "{body}");
    // Both sides of a between-refs diff are blob reads, so both lose one terminal newline.
    let files = body["files"].as_array().unwrap();
    assert!(
        files.len() == 1
            && files[0]["path"] == "README.md"
            && files[0]["status"] == "M"
            && files[0]["original"] == "hello"
            && files[0]["modified"] == "branch edit",
        "{body}"
    );
}
