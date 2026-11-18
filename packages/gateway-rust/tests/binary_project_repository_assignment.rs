//! Project repository assignment through the real gateway executable.
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
            .join("../../.jait/artifacts/binary-project-repository-tests")
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
async fn assignment_uses_owned_existing_repositories_and_fails_closed_on_discovery() {
    let gateway = Gateway::start();
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .unwrap();
    let url = |path: &str| format!("{}{path}", gateway.base);
    let owner = client
        .post(url("/api/auth/register"))
        .json(&json!({"username":"owner","password":"owner-pass-123"}))
        .send()
        .await
        .unwrap()
        .json::<Value>()
        .await
        .unwrap();
    let token = owner["access_token"].as_str().unwrap();
    let invitation = client
        .post(url("/api/auth/invitations"))
        .bearer_auth(token)
        .json(&json!({}))
        .send()
        .await
        .unwrap()
        .json::<Value>()
        .await
        .unwrap();
    let other = client.post(url("/api/auth/register")).json(&json!({"username":"other","password":"other-pass-123","invitation":invitation["invitation"]})).send().await.unwrap().json::<Value>().await.unwrap();
    let other_token = other["access_token"].as_str().unwrap();
    let root = gateway.directory.join("project");
    std::fs::create_dir_all(root.join(".git")).unwrap();
    let project = client
        .post(url("/api/projects"))
        .bearer_auth(token)
        .json(&json!({"title":"Project", "rootPath":root}))
        .send()
        .await
        .unwrap();
    assert_eq!(project.status(), 201);
    let project = project.json::<Value>().await.unwrap();
    let path = format!(
        "/api/projects/{}/repository",
        project["id"].as_str().unwrap()
    );
    let foreign = client
        .post(url(&path))
        .bearer_auth(other_token)
        .json(&json!({}))
        .send()
        .await
        .unwrap();
    assert_eq!(foreign.status(), 404);
    let response = client
        .post(url(&path))
        .bearer_auth(token)
        .json(&json!({}))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 503);
    assert_eq!(
        response.json::<Value>().await.unwrap()["error"],
        "SURFACE_UNAVAILABLE"
    );
    // A remote project may name the same path as a local directory, but that
    // never authorizes discovery using the gateway's filesystem or Git process.
    let remote = client
        .post(url("/api/projects"))
        .bearer_auth(token)
        .json(&json!({"title":"Remote", "rootPath":root, "nodeId":"remote-node"}))
        .send()
        .await
        .unwrap();
    assert_eq!(remote.status(), 201);
    let remote = remote.json::<Value>().await.unwrap();
    let remote_path = format!(
        "/api/projects/{}/repository",
        remote["id"].as_str().unwrap()
    );
    let response = client
        .post(url(&remote_path))
        .bearer_auth(token)
        .json(&json!({}))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 503);
    let error = response.json::<Value>().await.unwrap();
    assert_eq!(error["error"], "SURFACE_UNAVAILABLE");
    assert!(error["details"].as_str().unwrap().contains("remote nodes"));
    let repos = client
        .get(url("/api/repos"))
        .bearer_auth(token)
        .send()
        .await
        .unwrap()
        .json::<Value>()
        .await
        .unwrap();
    assert_eq!(repos["repos"], json!([]));
    let response = client
        .post(url("/api/repos"))
        .bearer_auth(token)
        .json(&json!({"name":"Existing", "localPath":root}))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    let repo = response.json::<Value>().await.unwrap();
    // Even an owned local repository with the same path cannot be silently
    // attached to a project whose filesystem belongs to a different node.
    let response = client
        .post(url(&remote_path))
        .bearer_auth(token)
        .json(&json!({}))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 503);
    let error = response.json::<Value>().await.unwrap();
    assert_eq!(error["error"], "SURFACE_UNAVAILABLE");
    assert!(error["details"].as_str().unwrap().contains("remote nodes"));
    let foreign_root = gateway.directory.join("foreign-project");
    std::fs::create_dir(&foreign_root).unwrap();
    let foreign_project = client
        .post(url("/api/projects"))
        .bearer_auth(other_token)
        .json(&json!({"title":"Foreign", "rootPath":foreign_root}))
        .send()
        .await
        .unwrap();
    assert_eq!(foreign_project.status(), 201);
    let foreign_project = foreign_project.json::<Value>().await.unwrap();
    let foreign_path = format!(
        "/api/projects/{}/repository",
        foreign_project["id"].as_str().unwrap()
    );
    let cross_owner = client
        .post(url(&foreign_path))
        .bearer_auth(other_token)
        .json(&json!({"repoId":repo["repo"]["id"]}))
        .send()
        .await
        .unwrap();
    assert_eq!(cross_owner.status(), 404);
    assert_eq!(
        cross_owner.json::<Value>().await.unwrap()["error"],
        "REPOSITORY_NOT_FOUND"
    );
    let mut owner_ws = WsClient::connect(&gateway.base, token).await;
    let mut other_ws = WsClient::connect(&gateway.base, other_token).await;
    let response = client
        .post(url(&path))
        .bearer_auth(token)
        .json(&json!({}))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    let assigned = response.json::<Value>().await.unwrap();
    assert_eq!(assigned["project"]["editorModeActive"], false);
    assert_eq!(assigned["project"]["rootPathStatus"], "available");
    let event = owner_ws
        .until("project.updated", Duration::from_secs(2))
        .await
        .expect("assignment event");
    assert_eq!(event["payload"]["project"], assigned["project"]);
    assert!(
        other_ws
            .until("project.updated", Duration::from_millis(300))
            .await
            .is_none()
    );
    assert_eq!(assigned["repo"]["id"], repo["repo"]["id"]);
    assert_eq!(assigned["assigned"], true);
    assert_eq!(assigned["created"], false);
    let response = client
        .post(url(&path))
        .bearer_auth(token)
        .json(&json!({}))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    let repeated = response.json::<Value>().await.unwrap();
    assert_eq!(repeated["assigned"], false);
    assert_eq!(repeated["skipped"], true);
    let event = owner_ws
        .until("project.updated", Duration::from_secs(2))
        .await
        .expect("repeated assignment event");
    assert_eq!(event["payload"]["project"], repeated["project"]);
}

struct WsClient(tokio::net::TcpStream);

impl WsClient {
    async fn connect(base: &str, token: &str) -> Self {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        let host = base.trim_start_matches("http://");
        let mut stream = tokio::net::TcpStream::connect(host).await.unwrap();
        let request = format!(
            "GET /ws?token={token} HTTP/1.1\r\nHost: {host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n"
        );
        stream.write_all(request.as_bytes()).await.unwrap();
        let mut head = Vec::new();
        while !head.ends_with(b"\r\n\r\n") {
            head.push(stream.read_u8().await.unwrap());
        }
        assert!(String::from_utf8_lossy(&head).starts_with("HTTP/1.1 101"));
        Self(stream)
    }

    /// Next text message, or None if nothing arrives within `wait`.
    async fn next(&mut self, wait: Duration) -> Option<serde_json::Value> {
        use jait_gateway::ws::{OpCode, read_frame, write_client_frame};
        tokio::time::timeout(wait, async {
            loop {
                let frame = read_frame(&mut self.0, 1 << 20).await.unwrap()?;
                match frame.opcode {
                    OpCode::Text => return serde_json::from_str(frame.text()?).ok(),
                    OpCode::Ping => {
                        write_client_frame(&mut self.0, OpCode::Pong, &frame.payload, [1, 2, 3, 4])
                            .await
                            .unwrap()
                    }
                    OpCode::Pong => {}
                    _ => return None,
                }
            }
        })
        .await
        .ok()
        .flatten()
    }

    async fn until(&mut self, kind: &str, wait: Duration) -> Option<serde_json::Value> {
        let deadline = tokio::time::Instant::now() + wait;
        while let Some(left) = deadline.checked_duration_since(tokio::time::Instant::now()) {
            let message = self.next(left).await?;
            if message["type"] == kind {
                return Some(message);
            }
        }
        None
    }
}

#[tokio::test]
async fn failed_project_assignment_does_not_reconcile_repository() {
    let gateway = Gateway::start();
    let client = reqwest::Client::new();
    let url = |path: &str| format!("{}{path}", gateway.base);
    let owner = client
        .post(url("/api/auth/register"))
        .json(&json!({"username":"owner", "password":"owner-pass-123"}))
        .send()
        .await
        .unwrap()
        .json::<Value>()
        .await
        .unwrap();
    let token = owner["access_token"].as_str().unwrap();
    let root = gateway.directory.join("project");
    std::fs::create_dir_all(root.join(".git")).unwrap();
    let project = client
        .post(url("/api/projects"))
        .bearer_auth(token)
        .json(&json!({"title":"Project", "rootPath":root, "nodeId":"gateway"}))
        .send()
        .await
        .unwrap()
        .json::<Value>()
        .await
        .unwrap();
    let repo = client
        .post(url("/api/repos"))
        .bearer_auth(token)
        .json(&json!({"name":"Existing", "localPath":root}))
        .send()
        .await
        .unwrap()
        .json::<Value>()
        .await
        .unwrap();
    let project_id = project["id"].as_str().unwrap();
    let repo_id = repo["repo"]["id"].as_str().unwrap();
    let db = rusqlite::Connection::open(gateway.directory.join("gateway.sqlite")).unwrap();
    db.execute(
        "UPDATE automation_repositories SET device_id='remote' WHERE id=?",
        [repo_id],
    )
    .unwrap();
    db.execute_batch("CREATE TRIGGER fail_project_assignment BEFORE UPDATE OF metadata ON projects BEGIN SELECT RAISE(ABORT, 'injected failure'); END;").unwrap();
    let mut events = WsClient::connect(&gateway.base, token).await;
    let mut project_events = WsClient::connect(&gateway.base, token).await;
    let response = client
        .post(url(&format!("/api/projects/{project_id}/repository")))
        .bearer_auth(token)
        .json(&json!({"repoId":repo_id}))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 500);
    let device: Option<String> = db
        .query_row(
            "SELECT device_id FROM automation_repositories WHERE id=?",
            [repo_id],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(device.as_deref(), Some("remote"));
    assert!(
        events
            .until("repo.updated", Duration::from_millis(300))
            .await
            .is_none()
    );
    db.execute_batch("DROP TRIGGER fail_project_assignment")
        .unwrap();
    // A response-enrichment failure happens after assignment and repository
    // reconciliation, but before commit. Neither change nor event may escape.
    db.execute_batch("ALTER TABLE project_state RENAME TO project_state_hidden")
        .unwrap();
    let response = client
        .post(url(&format!("/api/projects/{project_id}/repository")))
        .bearer_auth(token)
        .json(&json!({"repoId":repo_id}))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 500);
    let device: Option<String> = db
        .query_row(
            "SELECT device_id FROM automation_repositories WHERE id=?",
            [repo_id],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(device.as_deref(), Some("remote"));
    let metadata: Option<String> = db
        .query_row(
            "SELECT metadata FROM projects WHERE id=?",
            [project_id],
            |row| row.get(0),
        )
        .unwrap();
    assert!(
        metadata
            .as_deref()
            .and_then(|value| serde_json::from_str::<Value>(value).ok())
            .and_then(|value| value.get("repositoryId").cloned())
            .is_none()
    );
    assert!(
        events
            .until("repo.updated", Duration::from_millis(300))
            .await
            .is_none()
    );
    assert!(
        project_events
            .until("project.updated", Duration::from_millis(300))
            .await
            .is_none()
    );
    db.execute_batch("ALTER TABLE project_state_hidden RENAME TO project_state")
        .unwrap();
    // A deferred foreign key fails at COMMIT, after both updates and event
    // buffering have succeeded. Neither writes nor events may escape.
    db.execute_batch("CREATE TABLE assignment_test_parent(id INTEGER PRIMARY KEY);
        CREATE TABLE assignment_test_child(parent_id INTEGER REFERENCES assignment_test_parent(id) DEFERRABLE INITIALLY DEFERRED);
        CREATE TRIGGER fail_assignment_commit AFTER UPDATE OF metadata ON projects
        BEGIN INSERT INTO assignment_test_child(parent_id) VALUES (99); END;")
        .unwrap();
    let response = client
        .post(url(&format!("/api/projects/{project_id}/repository")))
        .bearer_auth(token)
        .json(&json!({"repoId":repo_id}))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 500);
    let device: Option<String> = db
        .query_row(
            "SELECT device_id FROM automation_repositories WHERE id=?",
            [repo_id],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(device.as_deref(), Some("remote"));
    assert!(
        events
            .until("repo.updated", Duration::from_millis(300))
            .await
            .is_none()
    );
    assert!(
        project_events
            .until("project.updated", Duration::from_millis(300))
            .await
            .is_none()
    );
    db.execute_batch("DROP TRIGGER fail_assignment_commit")
        .unwrap();
    let response = client
        .post(url(&format!("/api/projects/{project_id}/repository")))
        .bearer_auth(token)
        .json(&json!({"repoId":repo_id}))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    let assignment = response.json::<Value>().await.unwrap();
    let project_event = project_events
        .until("project.updated", Duration::from_secs(2))
        .await
        .expect("committed assignment event");
    assert_eq!(project_event["payload"]["project"], assignment["project"]);
    let event = events
        .until("repo.updated", Duration::from_secs(2))
        .await
        .expect("committed change must emit event");
    assert_eq!(event["payload"]["repo"]["id"], repo_id);
    let device: Option<String> = db
        .query_row(
            "SELECT device_id FROM automation_repositories WHERE id=?",
            [repo_id],
            |row| row.get(0),
        )
        .unwrap();
    assert!(device.is_none());

    // Clearing the root and its repository metadata must be atomic.
    db.execute_batch("CREATE TRIGGER fail_repository_clear BEFORE UPDATE OF metadata ON projects BEGIN SELECT RAISE(ABORT, 'injected clear failure'); END;").unwrap();
    let response = client
        .patch(url(&format!("/api/projects/{project_id}")))
        .bearer_auth(token)
        .json(&json!({"rootPath":null}))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 500);
    let persisted: (Option<String>, Option<String>) = db
        .query_row(
            "SELECT root_path, metadata FROM projects WHERE id=?",
            [project_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .unwrap();
    assert_eq!(persisted.0.as_deref(), root.to_str());
    assert_eq!(
        serde_json::from_str::<Value>(persisted.1.as_deref().unwrap()).unwrap()["repositoryId"],
        repo_id
    );
    db.execute_batch("DROP TRIGGER fail_repository_clear")
        .unwrap();
    let response = client
        .patch(url(&format!("/api/projects/{project_id}")))
        .bearer_auth(token)
        .json(&json!({"rootPath":null}))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    let persisted: (Option<String>, Option<String>) = db
        .query_row(
            "SELECT root_path, metadata FROM projects WHERE id=?",
            [project_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .unwrap();
    assert!(persisted.0.is_none());
    assert!(
        serde_json::from_str::<Value>(persisted.1.as_deref().unwrap())
            .unwrap()
            .get("repositoryId")
            .is_none()
    );
}

#[tokio::test]
async fn project_created_events_follow_commit_and_are_owner_scoped() {
    let gateway = Gateway::start();
    let client = reqwest::Client::new();
    let url = |path: &str| format!("{}{path}", gateway.base);
    let owner = client
        .post(url("/api/auth/register"))
        .json(&json!({"username":"event-owner","password":"owner-pass-123"}))
        .send()
        .await
        .unwrap()
        .json::<Value>()
        .await
        .unwrap();
    let token = owner["access_token"].as_str().unwrap();
    let invitation = client
        .post(url("/api/auth/invitations"))
        .bearer_auth(token)
        .json(&json!({}))
        .send()
        .await
        .unwrap()
        .json::<Value>()
        .await
        .unwrap();
    let other = client.post(url("/api/auth/register"))
        .json(&json!({"username":"event-other","password":"other-pass-123","invitation":invitation["invitation"]}))
        .send().await.unwrap().json::<Value>().await.unwrap();
    let mut owner_ws = WsClient::connect(&gateway.base, token).await;
    let mut other_ws =
        WsClient::connect(&gateway.base, other["access_token"].as_str().unwrap()).await;
    let db = rusqlite::Connection::open(gateway.directory.join("gateway.sqlite")).unwrap();
    db.execute_batch("CREATE TABLE event_test_parent(id INTEGER PRIMARY KEY);
        CREATE TABLE event_test_child(parent_id INTEGER REFERENCES event_test_parent(id) DEFERRABLE INITIALLY DEFERRED);
        CREATE TRIGGER fail_project_create_commit AFTER INSERT ON projects
        BEGIN INSERT INTO event_test_child(parent_id) VALUES (99); END;").unwrap();
    let failed = client
        .post(url("/api/projects"))
        .bearer_auth(token)
        .json(&json!({"title":"rollback"}))
        .send()
        .await
        .unwrap();
    assert_eq!(failed.status(), 500);
    assert!(
        owner_ws
            .until("project.created", Duration::from_millis(300))
            .await
            .is_none()
    );
    db.execute_batch("DROP TRIGGER fail_project_create_commit")
        .unwrap();
    let created = client
        .post(url("/api/projects"))
        .bearer_auth(token)
        .json(&json!({"title":"event project"}))
        .send()
        .await
        .unwrap();
    assert_eq!(created.status(), 201);
    let project = created.json::<Value>().await.unwrap();
    let event = owner_ws
        .until("project.created", Duration::from_secs(2))
        .await
        .expect("owner receives event");
    assert_eq!(event["sessionId"], "");
    assert_eq!(event["payload"]["project"], project);
    assert_eq!(project["editorModeActive"], false);
    assert!(project.get("rootPathStatus").unwrap().is_null());
    assert!(event["timestamp"].as_str().is_some());
    assert!(
        other_ws
            .until("project.created", Duration::from_millis(300))
            .await
            .is_none()
    );
    let id = project["id"].as_str().unwrap();
    db.execute_batch("CREATE TRIGGER fail_project_update_commit AFTER UPDATE ON projects BEGIN INSERT INTO event_test_child(parent_id) VALUES (99); END;").unwrap();
    let failed = client
        .patch(url(&format!("/api/projects/{id}")))
        .bearer_auth(token)
        .json(&json!({"title":"failed update"}))
        .send()
        .await
        .unwrap();
    assert_eq!(failed.status(), 500);
    assert!(
        owner_ws
            .until("project.updated", Duration::from_millis(300))
            .await
            .is_none()
    );
    db.execute_batch("DROP TRIGGER fail_project_update_commit")
        .unwrap();
    let updated = client
        .patch(url(&format!("/api/projects/{id}")))
        .bearer_auth(token)
        .json(&json!({"title":"updated title"}))
        .send()
        .await
        .unwrap();
    assert_eq!(updated.status(), 200);
    let updated = updated.json::<Value>().await.unwrap();
    assert_eq!(updated["title"], "updated title");
    assert_eq!(updated["editorModeActive"], false);
    let event = owner_ws
        .until("project.updated", Duration::from_secs(2))
        .await
        .expect("owner receives update");
    assert_eq!(event["payload"]["project"], updated);
    assert!(
        other_ws
            .until("project.updated", Duration::from_millis(300))
            .await
            .is_none()
    );
    let unchanged = client
        .patch(url(&format!("/api/projects/{id}")))
        .bearer_auth(token)
        .json(&json!({}))
        .send()
        .await
        .unwrap()
        .json::<Value>()
        .await
        .unwrap();
    assert_eq!(unchanged["editorModeActive"], false);
    let event = owner_ws
        .until("project.updated", Duration::from_secs(2))
        .await
        .expect("owner receives no-op update");
    assert_eq!(event["payload"]["project"], unchanged);
    let invalid = client
        .post(url(&format!("/api/projects/{id}/move")))
        .bearer_auth(token)
        .json(&json!({"parentId":"missing"}))
        .send()
        .await
        .unwrap();
    assert_eq!(invalid.status(), 400);
    assert!(
        owner_ws
            .until("project.updated", Duration::from_millis(300))
            .await
            .is_none()
    );
    db.execute_batch("CREATE TRIGGER fail_project_move_commit AFTER UPDATE ON projects BEGIN INSERT INTO event_test_child(parent_id) VALUES (99); END;").unwrap();
    let failed_move = client
        .post(url(&format!("/api/projects/{id}/move")))
        .bearer_auth(token)
        .json(&json!({"parentId":null}))
        .send()
        .await
        .unwrap();
    assert_eq!(failed_move.status(), 500);
    assert!(
        owner_ws
            .until("project.updated", Duration::from_millis(300))
            .await
            .is_none()
    );
    db.execute_batch("DROP TRIGGER fail_project_move_commit")
        .unwrap();
    let moved = client
        .post(url(&format!("/api/projects/{id}/move")))
        .bearer_auth(token)
        .json(&json!({"parentId":null}))
        .send()
        .await
        .unwrap();
    assert_eq!(moved.status(), 200);
    let moved = moved.json::<Value>().await.unwrap();
    assert_eq!(moved["editorModeActive"], false);
    let event = owner_ws
        .until("project.updated", Duration::from_secs(2))
        .await
        .expect("owner receives move");
    assert_eq!(event["payload"]["project"], moved);
    assert!(
        other_ws
            .until("project.updated", Duration::from_millis(300))
            .await
            .is_none()
    );
    let count_before: i64 = db
        .query_row(
            "SELECT count(*) FROM sessions WHERE project_id=?1",
            [id],
            |r| r.get(0),
        )
        .unwrap();
    db.execute_batch("CREATE TRIGGER fail_project_session_touch BEFORE UPDATE ON projects BEGIN SELECT RAISE(ABORT, 'injected failure'); END;").unwrap();
    let failed_session = client
        .post(url(&format!("/api/projects/{id}/sessions")))
        .bearer_auth(token)
        .json(&json!({"name":"rollback"}))
        .send()
        .await
        .unwrap();
    assert_eq!(failed_session.status(), 500);
    let count_after: i64 = db
        .query_row(
            "SELECT count(*) FROM sessions WHERE project_id=?1",
            [id],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(
        count_after, count_before,
        "failed touch must roll back session creation"
    );
    assert!(
        owner_ws
            .until("chat.created", Duration::from_millis(300))
            .await
            .is_none()
    );
    db.execute_batch("DROP TRIGGER fail_project_session_touch")
        .unwrap();
    db.execute_batch("CREATE TRIGGER fail_chat_create_commit AFTER INSERT ON sessions BEGIN INSERT INTO event_test_child(parent_id) VALUES (99); END;").unwrap();
    let failed_commit = client
        .post(url(&format!("/api/projects/{id}/sessions")))
        .bearer_auth(token)
        .json(&json!({"name":"commit rollback"}))
        .send()
        .await
        .unwrap();
    assert_eq!(failed_commit.status(), 500);
    let count_after: i64 = db
        .query_row(
            "SELECT count(*) FROM sessions WHERE project_id=?1",
            [id],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(count_after, count_before);
    assert!(
        owner_ws
            .until("chat.created", Duration::from_millis(300))
            .await
            .is_none()
    );
    db.execute_batch("DROP TRIGGER fail_chat_create_commit")
        .unwrap();
    let denied_session = client
        .post(url(&format!("/api/projects/{id}/sessions")))
        .bearer_auth(other["access_token"].as_str().unwrap())
        .json(&json!({}))
        .send()
        .await
        .unwrap();
    assert_eq!(denied_session.status(), 404);
    let created_session = client
        .post(url(&format!("/api/projects/{id}/sessions")))
        .bearer_auth(token)
        .json(&json!({"name":"project session"}))
        .send()
        .await
        .unwrap();
    assert_eq!(created_session.status(), 201);
    let created_session = created_session.json::<Value>().await.unwrap();
    let chat_event = owner_ws
        .until("chat.created", Duration::from_secs(2))
        .await
        .expect("owner receives session creation");
    assert_eq!(
        chat_event["payload"],
        json!({"projectId":id,"session":created_session})
    );
    assert!(
        other_ws
            .until("chat.created", Duration::from_millis(300))
            .await
            .is_none()
    );
    let session = client
        .post(url("/api/sessions"))
        .bearer_auth(token)
        .json(&json!({}))
        .send()
        .await
        .unwrap();
    assert_eq!(session.status(), 201);
    let session = session.json::<Value>().await.unwrap();
    let session_id = session["id"].as_str().unwrap();
    db.execute(
        "UPDATE sessions SET project_id=?1, status='archived' WHERE id=?2",
        rusqlite::params![id, session_id],
    )
    .unwrap();
    db.execute("UPDATE projects SET status='archived' WHERE id=?1", [id])
        .unwrap();
    let denied = client
        .post(url(&format!("/api/projects/{id}/restore")))
        .bearer_auth(other["access_token"].as_str().unwrap())
        .send()
        .await
        .unwrap();
    assert_eq!(denied.status(), 404);
    db.execute_batch("CREATE TRIGGER fail_session_restore BEFORE UPDATE ON sessions BEGIN SELECT RAISE(ABORT, 'injected failure'); END;").unwrap();
    let failed = client
        .post(url(&format!("/api/projects/{id}/restore")))
        .bearer_auth(token)
        .send()
        .await
        .unwrap();
    assert_eq!(failed.status(), 500);
    let status: String = db
        .query_row("SELECT status FROM projects WHERE id=?1", [id], |r| {
            r.get(0)
        })
        .unwrap();
    assert_eq!(
        status, "archived",
        "failed session restore must roll back project restore"
    );
    assert!(
        owner_ws
            .until("project.restored", Duration::from_millis(300))
            .await
            .is_none()
    );
    db.execute_batch("DROP TRIGGER fail_session_restore")
        .unwrap();
    db.execute_batch("CREATE TRIGGER fail_restore_commit AFTER UPDATE ON projects BEGIN INSERT INTO event_test_child(parent_id) VALUES (99); END;").unwrap();
    let failed_commit = client
        .post(url(&format!("/api/projects/{id}/restore")))
        .bearer_auth(token)
        .send()
        .await
        .unwrap();
    assert_eq!(failed_commit.status(), 500);
    let project_status: String = db
        .query_row("SELECT status FROM projects WHERE id=?1", [id], |r| {
            r.get(0)
        })
        .unwrap();
    let session_status: String = db
        .query_row(
            "SELECT status FROM sessions WHERE id=?1",
            [session_id],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(project_status, "archived");
    assert_eq!(session_status, "archived");
    assert!(
        owner_ws
            .until("project.restored", Duration::from_millis(300))
            .await
            .is_none()
    );
    db.execute_batch("DROP TRIGGER fail_restore_commit")
        .unwrap();
    let restored = client
        .post(url(&format!("/api/projects/{id}/restore")))
        .bearer_auth(token)
        .send()
        .await
        .unwrap();
    assert_eq!(restored.status(), 200);
    let restored = restored.json::<Value>().await.unwrap();
    assert_eq!(restored["status"], "active");
    assert_eq!(restored["editorModeActive"], false);
    let status: String = db
        .query_row(
            "SELECT status FROM sessions WHERE id=?1",
            [session_id],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(status, "active");
    let event = owner_ws
        .until("project.restored", Duration::from_secs(2))
        .await
        .expect("owner receives restore");
    assert_eq!(event["payload"]["project"], restored);
    assert!(
        other_ws
            .until("project.restored", Duration::from_millis(300))
            .await
            .is_none()
    );
    let child = client
        .post(url("/api/projects"))
        .bearer_auth(token)
        .json(&json!({"title":"child", "parentId":id}))
        .send()
        .await
        .unwrap()
        .json::<Value>()
        .await
        .unwrap();
    let child_id = child["id"].as_str().unwrap();
    let child_session = client
        .post(url("/api/sessions"))
        .bearer_auth(token)
        .json(&json!({}))
        .send()
        .await
        .unwrap()
        .json::<Value>()
        .await
        .unwrap();
    let child_session_id = child_session["id"].as_str().unwrap();
    db.execute(
        "UPDATE sessions SET project_id=?1 WHERE id=?2",
        rusqlite::params![child_id, child_session_id],
    )
    .unwrap();
    let denied = client
        .delete(url(&format!("/api/projects/{id}")))
        .bearer_auth(other["access_token"].as_str().unwrap())
        .send()
        .await
        .unwrap();
    assert_eq!(denied.status(), 404);
    db.execute_batch("CREATE TRIGGER fail_archive_session BEFORE UPDATE ON sessions BEGIN SELECT RAISE(ABORT, 'injected failure'); END;").unwrap();
    let failed = client
        .delete(url(&format!("/api/projects/{id}")))
        .bearer_auth(token)
        .send()
        .await
        .unwrap();
    assert_eq!(failed.status(), 500);
    for project_id in [id, child_id] {
        let status: String = db
            .query_row(
                "SELECT status FROM projects WHERE id=?1",
                [project_id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(
            status, "active",
            "archive failure must roll back project subtree"
        );
    }
    assert!(
        owner_ws
            .until("project.deleted", Duration::from_millis(300))
            .await
            .is_none()
    );
    db.execute_batch("DROP TRIGGER fail_archive_session")
        .unwrap();
    db.execute_batch("CREATE TRIGGER fail_archive_commit AFTER UPDATE ON projects BEGIN INSERT INTO event_test_child(parent_id) VALUES (99); END;").unwrap();
    let failed = client
        .delete(url(&format!("/api/projects/{id}")))
        .bearer_auth(token)
        .send()
        .await
        .unwrap();
    assert_eq!(failed.status(), 500);
    let status: String = db
        .query_row(
            "SELECT status FROM sessions WHERE id=?1",
            [session_id],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(status, "active");
    assert!(
        owner_ws
            .until("project.deleted", Duration::from_millis(300))
            .await
            .is_none()
    );
    db.execute_batch("DROP TRIGGER fail_archive_commit")
        .unwrap();
    let deleted = client
        .delete(url(&format!("/api/projects/{id}")))
        .bearer_auth(token)
        .send()
        .await
        .unwrap();
    assert_eq!(deleted.status(), 204);
    assert!(deleted.bytes().await.unwrap().is_empty());
    for project_id in [id, child_id] {
        let status: String = db
            .query_row(
                "SELECT status FROM projects WHERE id=?1",
                [project_id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(status, "archived");
    }
    let status: String = db
        .query_row(
            "SELECT status FROM sessions WHERE id=?1",
            [session_id],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(status, "archived");
    let status: String = db
        .query_row(
            "SELECT status FROM sessions WHERE id=?1",
            [child_session_id],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(
        status, "active",
        "Node archives sessions in the selected project only"
    );
    let event = owner_ws
        .until("project.deleted", Duration::from_secs(2))
        .await
        .expect("owner receives delete");
    assert_eq!(event["payload"], json!({"projectId":id}));
    assert!(
        other_ws
            .until("project.deleted", Duration::from_millis(300))
            .await
            .is_none()
    );
}

#[tokio::test]
async fn project_collection_exposes_editor_and_local_root_status() {
    let gateway = Gateway::start();
    let client = reqwest::Client::new();
    let url = |path: &str| format!("{}{path}", gateway.base);
    let owner = client
        .post(url("/api/auth/register"))
        .json(&json!({"username":"status-owner","password":"owner-pass-123"}))
        .send()
        .await
        .unwrap()
        .json::<Value>()
        .await
        .unwrap();
    let token = owner["access_token"].as_str().unwrap();
    let root = gateway.directory.to_str().unwrap();
    let created = client
        .post(url("/api/projects"))
        .bearer_auth(token)
        .json(&json!({"rootPath":root,"title":"Status project"}))
        .send()
        .await
        .unwrap()
        .json::<Value>()
        .await
        .unwrap();
    assert_eq!(created["editorModeActive"], false);
    assert_eq!(created["rootPathStatus"], "available");
    let id = created["id"].as_str().unwrap();
    let state = client
        .patch(url(&format!("/api/projects/{id}/state")))
        .bearer_auth(token)
        .json(&json!({"project.ui":{"panel":{"open":true}}}))
        .send()
        .await
        .unwrap();
    assert!(state.status().is_success());
    let list = client
        .get(url("/api/projects"))
        .bearer_auth(token)
        .send()
        .await
        .unwrap()
        .json::<Value>()
        .await
        .unwrap();
    let project = list["projects"]
        .as_array()
        .unwrap()
        .iter()
        .find(|p| p["id"] == id)
        .unwrap();
    assert_eq!(project["editorModeActive"], true);
    assert_eq!(project["rootPathStatus"], "available");
    let detail = client
        .get(url(&format!("/api/projects/{id}")))
        .bearer_auth(token)
        .send()
        .await
        .unwrap()
        .json::<Value>()
        .await
        .unwrap();
    assert_eq!(detail["editorModeActive"], true);
    assert_eq!(detail["rootPathStatus"], "available");
    let search = client
        .get(url("/api/projects/search?q=Status"))
        .bearer_auth(token)
        .send()
        .await
        .unwrap()
        .json::<Value>()
        .await
        .unwrap();
    let found = search["projects"]
        .as_array()
        .unwrap()
        .iter()
        .find(|p| p["id"] == id)
        .unwrap();
    assert_eq!(found["editorModeActive"], true);
    assert_eq!(found["rootPathStatus"], "available");
    let reopened = client
        .post(url("/api/projects"))
        .bearer_auth(token)
        .json(&json!({"rootPath":root}))
        .send()
        .await
        .unwrap()
        .json::<Value>()
        .await
        .unwrap();
    assert_eq!(reopened["editorModeActive"], true);
    let missing = client
        .post(url("/api/projects"))
        .bearer_auth(token)
        .json(&json!({"rootPath":gateway.directory.join("absent")}))
        .send()
        .await
        .unwrap()
        .json::<Value>()
        .await
        .unwrap();
    assert_eq!(missing["rootPathStatus"], "missing");
    let no_root = client
        .post(url("/api/projects"))
        .bearer_auth(token)
        .json(&json!({"title":"No root"}))
        .send()
        .await
        .unwrap()
        .json::<Value>()
        .await
        .unwrap();
    assert!(no_root.get("rootPathStatus").unwrap().is_null());
}

#[tokio::test]
async fn permanent_archive_deletion_is_atomic_and_owner_scoped() {
    let gateway = Gateway::start();
    let client = reqwest::Client::new();
    let url = |path: &str| format!("{}{path}", gateway.base);
    let owner = client
        .post(url("/api/auth/register"))
        .json(&json!({"username":"purge-owner","password":"owner-pass-123"}))
        .send()
        .await
        .unwrap()
        .json::<Value>()
        .await
        .unwrap();
    let token = owner["access_token"].as_str().unwrap();
    let invitation = client
        .post(url("/api/auth/invitations"))
        .bearer_auth(token)
        .json(&json!({}))
        .send()
        .await
        .unwrap()
        .json::<Value>()
        .await
        .unwrap();
    let other = client.post(url("/api/auth/register")).json(&json!({"username":"purge-other","password":"other-pass-123","invitation":invitation["invitation"]})).send().await.unwrap().json::<Value>().await.unwrap();
    let other_token = other["access_token"].as_str().unwrap();
    let project = client
        .post(url("/api/projects"))
        .bearer_auth(token)
        .json(&json!({"title":"purge"}))
        .send()
        .await
        .unwrap()
        .json::<Value>()
        .await
        .unwrap();
    let id = project["id"].as_str().unwrap();
    let foreign = client
        .post(url("/api/projects"))
        .bearer_auth(other_token)
        .json(&json!({"title":"foreign"}))
        .send()
        .await
        .unwrap()
        .json::<Value>()
        .await
        .unwrap();
    let foreign_id = foreign["id"].as_str().unwrap();
    let session = client
        .post(url(&format!("/api/projects/{id}/sessions")))
        .bearer_auth(token)
        .json(&json!({}))
        .send()
        .await
        .unwrap()
        .json::<Value>()
        .await
        .unwrap();
    let session_id = session["id"].as_str().unwrap();
    let db = rusqlite::Connection::open(gateway.directory.join("gateway.sqlite")).unwrap();
    db.execute(
        "UPDATE projects SET status='archived' WHERE id IN (?1, ?2)",
        rusqlite::params![id, foreign_id],
    )
    .unwrap();
    let mut owner_ws = WsClient::connect(&gateway.base, token).await;
    let mut other_ws = WsClient::connect(&gateway.base, other_token).await;
    db.execute_batch("CREATE TRIGGER fail_purge BEFORE UPDATE ON projects BEGIN SELECT RAISE(ABORT, 'injected'); END;").unwrap();
    let failed = client
        .delete(url("/api/projects/archived"))
        .bearer_auth(token)
        .send()
        .await
        .unwrap();
    assert_eq!(failed.status(), 500);
    let count: i64 = db
        .query_row(
            "SELECT count(*) FROM sessions WHERE id=?1 AND status='active'",
            [session_id],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(
        count, 1,
        "failed project deletion must roll back session deletion"
    );
    assert!(
        owner_ws
            .until("project.deleted", Duration::from_millis(300))
            .await
            .is_none()
    );
    db.execute_batch("DROP TRIGGER fail_purge; CREATE TABLE purge_parent(id INTEGER PRIMARY KEY); CREATE TABLE purge_child(id INTEGER REFERENCES purge_parent(id) DEFERRABLE INITIALLY DEFERRED); CREATE TRIGGER fail_purge_commit AFTER UPDATE ON projects BEGIN INSERT INTO purge_child VALUES (42); END;").unwrap();
    let failed = client
        .delete(url("/api/projects/archived"))
        .bearer_auth(token)
        .send()
        .await
        .unwrap();
    assert_eq!(failed.status(), 500);
    for (table, key) in [("projects", id), ("sessions", session_id)] {
        let status: String = db
            .query_row(
                &format!("SELECT status FROM {table} WHERE id=?1"),
                [key],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(
            status,
            if table == "projects" {
                "archived"
            } else {
                "active"
            },
            "commit failure must roll back {table}"
        );
    }
    assert!(
        owner_ws
            .until("project.deleted", Duration::from_millis(300))
            .await
            .is_none()
    );
    db.execute_batch("DROP TRIGGER fail_purge_commit").unwrap();
    let response = client
        .delete(url("/api/projects/archived"))
        .bearer_auth(token)
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    assert_eq!(
        response.json::<Value>().await.unwrap(),
        json!({"ok":true,"removed":1})
    );
    let event = owner_ws
        .until("project.deleted", Duration::from_secs(2))
        .await
        .expect("owner receives permanent deletion");
    assert_eq!(event["payload"], json!({"projectId":id,"permanent":true}));
    assert!(
        other_ws
            .until("project.deleted", Duration::from_millis(300))
            .await
            .is_none()
    );
    for (table, key) in [("projects", id), ("sessions", session_id)] {
        let status: String = db
            .query_row(
                &format!("SELECT status FROM {table} WHERE id=?1"),
                [key],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(status, "deleted");
    }
    let foreign_status: String = db
        .query_row(
            "SELECT status FROM projects WHERE id=?1",
            [foreign_id],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(foreign_status, "archived");
    let foreign_count: i64 = db
        .query_row(
            "SELECT count(*) FROM projects WHERE id=?1",
            [foreign_id],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(foreign_count, 1);
}

#[tokio::test]
async fn project_creation_rolls_back_when_status_enrichment_fails() {
    let gateway = Gateway::start();
    let client = reqwest::Client::new();
    let url = |path: &str| format!("{}{path}", gateway.base);
    let owner = client
        .post(url("/api/auth/register"))
        .json(&json!({"username":"enrichment-owner","password":"owner-pass-123"}))
        .send()
        .await
        .unwrap()
        .json::<Value>()
        .await
        .unwrap();
    let token = owner["access_token"].as_str().unwrap();
    let mut events = WsClient::connect(&gateway.base, token).await;
    let db = rusqlite::Connection::open(gateway.directory.join("gateway.sqlite")).unwrap();
    db.execute_batch("DROP TABLE project_state").unwrap();
    let result = client
        .post(url("/api/projects"))
        .bearer_auth(token)
        .json(&json!({"title":"must roll back"}))
        .send()
        .await
        .unwrap();
    assert_eq!(result.status(), 500);
    let count: i64 = db
        .query_row(
            "SELECT count(*) FROM projects WHERE title='must roll back'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(
        count, 0,
        "response enrichment failure must roll back project creation"
    );
    assert!(
        events
            .until("project.created", Duration::from_millis(300))
            .await
            .is_none()
    );
}

#[tokio::test]
async fn project_update_rolls_back_when_status_enrichment_fails() {
    let gateway = Gateway::start();
    let client = reqwest::Client::new();
    let url = |path: &str| format!("{}{path}", gateway.base);
    let owner = client
        .post(url("/api/auth/register"))
        .json(&json!({"username":"update-owner","password":"owner-pass-123"}))
        .send()
        .await
        .unwrap()
        .json::<Value>()
        .await
        .unwrap();
    let token = owner["access_token"].as_str().unwrap();
    let project = client
        .post(url("/api/projects"))
        .bearer_auth(token)
        .json(&json!({"title":"original"}))
        .send()
        .await
        .unwrap()
        .json::<Value>()
        .await
        .unwrap();
    let id = project["id"].as_str().unwrap();
    let mut events = WsClient::connect(&gateway.base, token).await;
    let db = rusqlite::Connection::open(gateway.directory.join("gateway.sqlite")).unwrap();
    db.execute_batch("DROP TABLE project_state").unwrap();
    let result = client
        .patch(url(&format!("/api/projects/{id}")))
        .bearer_auth(token)
        .json(&json!({"title":"must roll back"}))
        .send()
        .await
        .unwrap();
    assert_eq!(result.status(), 500);
    let title: String = db
        .query_row("SELECT title FROM projects WHERE id=?", [id], |row| {
            row.get(0)
        })
        .unwrap();
    assert_eq!(title, "original");
    assert!(
        events
            .until("project.updated", Duration::from_millis(300))
            .await
            .is_none()
    );
}
