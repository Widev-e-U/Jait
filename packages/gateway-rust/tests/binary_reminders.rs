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
            .join("../../.jait/artifacts/binary-reminder-tests")
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

    fn restart(&mut self) {
        self.child.kill().unwrap();
        self.child.wait().unwrap();
        let (child, base) = Self::launch(&self.directory);
        self.child = child;
        self.base = base;
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
async fn reminders_are_isolated_by_owner_through_the_binary() {
    let mut gateway = Gateway::start();
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(45))
        .build()
        .unwrap();
    let base = gateway.base.clone();
    let url = |path: &str| format!("{base}{path}");
    let reminders = url("/api/reminders");
    assert_eq!(client.get(&reminders).send().await.unwrap().status(), 401);
    let owner = client
        .post(url("/api/auth/register"))
        .json(&json!({
            "username":"owner", "password":"owner-pass-123"
        }))
        .send()
        .await
        .unwrap()
        .json::<Value>()
        .await
        .unwrap();
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
    let other = client
        .post(url("/api/auth/register"))
        .json(&json!({
            "username":"other", "password":"other-pass-123", "invitation":invite["invitation"]
        }))
        .send()
        .await
        .unwrap()
        .json::<Value>()
        .await
        .unwrap();
    let other_token = other["access_token"].as_str().unwrap();

    assert_eq!(
        client
            .post(&reminders)
            .bearer_auth(token)
            .json(&json!({"content":"  "}))
            .send()
            .await
            .unwrap()
            .status(),
        400
    );
    let created = client
        .post(&reminders)
        .bearer_auth(token)
        .json(&json!({"content":"  Call Alice  "}))
        .send()
        .await
        .unwrap();
    assert_eq!(created.status(), 201);
    let reminder = created.json::<Value>().await.unwrap()["reminder"].clone();
    assert_eq!(reminder["content"], "Call Alice");
    let id = reminder["id"].as_str().unwrap();
    let item = url(&format!("/api/reminders/{id}"));
    let list = client
        .get(&reminders)
        .bearer_auth(token)
        .send()
        .await
        .unwrap()
        .json::<Value>()
        .await
        .unwrap();
    assert_eq!(list["reminders"].as_array().unwrap().len(), 1);
    let other_list = client
        .get(&reminders)
        .bearer_auth(other_token)
        .send()
        .await
        .unwrap()
        .json::<Value>()
        .await
        .unwrap();
    assert!(other_list["reminders"].as_array().unwrap().is_empty());
    assert_eq!(
        client
            .patch(&item)
            .bearer_auth(other_token)
            .json(&json!({"content":"stolen"}))
            .send()
            .await
            .unwrap()
            .status(),
        404
    );
    assert_eq!(
        client
            .delete(&item)
            .bearer_auth(other_token)
            .send()
            .await
            .unwrap()
            .status(),
        404
    );

    let updated = client
        .patch(&item)
        .bearer_auth(token)
        .json(&json!({"status":"archived"}))
        .send()
        .await
        .unwrap();
    assert_eq!(updated.status(), 200);
    assert_eq!(
        updated.json::<Value>().await.unwrap()["reminder"]["status"],
        "archived"
    );
    let active = client
        .get(&reminders)
        .bearer_auth(token)
        .send()
        .await
        .unwrap()
        .json::<Value>()
        .await
        .unwrap();
    assert!(active["reminders"].as_array().unwrap().is_empty());
    let export = client
        .get(url("/api/reminders/export.md"))
        .bearer_auth(token)
        .send()
        .await
        .unwrap();
    assert_eq!(export.status(), 200);
    assert!(export.text().await.unwrap().contains("Call Alice"));

    // The actual process is stopped and restarted against the same database.
    gateway.restart();
    let item = format!("{}/api/reminders/{id}", gateway.base);
    let persisted = client
        .get(format!("{}/api/reminders/export.md", gateway.base))
        .bearer_auth(token)
        .send()
        .await
        .unwrap();
    assert_eq!(persisted.status(), 200);
    assert!(persisted.text().await.unwrap().contains("Call Alice"));
    let other_export = client
        .get(format!("{}/api/reminders/export.md", gateway.base))
        .bearer_auth(other_token)
        .send()
        .await
        .unwrap();
    assert_eq!(other_export.status(), 200);
    assert!(!other_export.text().await.unwrap().contains("Call Alice"));
    assert_eq!(
        client
            .delete(&item)
            .bearer_auth(token)
            .send()
            .await
            .unwrap()
            .status(),
        200
    );
    assert_eq!(
        client
            .delete(&item)
            .bearer_auth(token)
            .send()
            .await
            .unwrap()
            .status(),
        404
    );
}

#[tokio::test]
async fn reminder_projects_use_owned_live_project_data() {
    let gateway = Gateway::start();
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(45))
        .build()
        .unwrap();
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
    let other = client.post(url("/api/auth/register")).json(&json!({"username":"other", "password":"other-pass-123", "invitation":invitation["invitation"]})).send().await.unwrap().json::<Value>().await.unwrap();
    let other_token = other["access_token"].as_str().unwrap();
    let create_project = |token: &str, title: &str| {
        client
            .post(url("/api/projects"))
            .bearer_auth(token)
            .json(&json!({"title":title}))
    };
    let owner_project = create_project(token, "Owner project").send().await.unwrap();
    assert_eq!(owner_project.status(), 201);
    let owner_project = owner_project.json::<Value>().await.unwrap();
    let owner_id = owner_project["id"].as_str().unwrap();
    let other_project = create_project(other_token, "Other project")
        .send()
        .await
        .unwrap();
    assert_eq!(other_project.status(), 201);
    let other_project = other_project.json::<Value>().await.unwrap();
    let other_id = other_project["id"].as_str().unwrap();
    let reminders = url("/api/reminders");
    let forbidden = client
        .post(&reminders)
        .bearer_auth(token)
        .json(&json!({"content":"No", "projectId":other_id}))
        .send()
        .await
        .unwrap();
    assert_eq!(forbidden.status(), 404);
    let created = client
        .post(&reminders)
        .bearer_auth(token)
        .json(&json!({"content":"Project reminder", "projectId":owner_id}))
        .send()
        .await
        .unwrap();
    assert_eq!(created.status(), 201);
    let list = client
        .get(&reminders)
        .bearer_auth(token)
        .send()
        .await
        .unwrap()
        .json::<Value>()
        .await
        .unwrap();
    let projects = list["projects"].as_array().unwrap();
    assert_eq!(projects.len(), 1);
    assert_eq!(projects[0]["id"], owner_id);
    assert_eq!(projects[0]["reminderCount"], 1);
    assert!(projects[0]["sessions"].is_array());
    assert_eq!(list["hasMoreProjects"], false);
    let other_list = client
        .get(&reminders)
        .bearer_auth(other_token)
        .send()
        .await
        .unwrap()
        .json::<Value>()
        .await
        .unwrap();
    let other_projects = other_list["projects"].as_array().unwrap();
    assert_eq!(other_projects.len(), 1);
    assert_eq!(other_projects[0]["id"], other_id);
    assert_eq!(other_projects[0]["reminderCount"], 0);

    let providers = client
        .get(url("/api/providers"))
        .bearer_auth(token)
        .send()
        .await
        .unwrap()
        .json::<Value>()
        .await
        .unwrap();
    let provider = providers["providers"]
        .as_array()
        .or(providers.as_array())
        .and_then(|p| p.first())
        .and_then(|p| p["id"].as_str())
        .expect("fixture provider");
    for (user_token, title) in [(token, "Owner thread"), (other_token, "Other thread")] {
        let session = client
            .post(url("/api/sessions"))
            .bearer_auth(user_token)
            .json(&json!({}))
            .send()
            .await
            .unwrap();
        assert_eq!(session.status(), 201);
        let session = session.json::<Value>().await.unwrap();
        let session_id = session["id"].as_str().unwrap();
        let foreign_token = if user_token == token {
            other_token
        } else {
            token
        };
        let denied = client
            .post(&reminders)
            .bearer_auth(foreign_token)
            .json(&json!({"content":"foreign session", "sessionId":session_id}))
            .send()
            .await
            .unwrap();
        assert_eq!(denied.status(), 404);
        let created = client
            .post(&reminders)
            .bearer_auth(user_token)
            .json(&json!({"content":title, "sessionId":session_id}))
            .send()
            .await
            .unwrap();
        assert_eq!(created.status(), 201);
        let filtered = client
            .get(format!("{reminders}?sessionId={session_id}"))
            .bearer_auth(user_token)
            .send()
            .await
            .unwrap()
            .json::<Value>()
            .await
            .unwrap();
        assert_eq!(filtered["reminders"].as_array().unwrap().len(), 1);
        assert_eq!(filtered["reminders"][0]["content"], title);
        let thread = client
            .post(url("/api/threads"))
            .bearer_auth(user_token)
            .json(&json!({"title":title, "providerId":provider, "sessionId":session["id"]}))
            .send()
            .await
            .unwrap();
        assert_eq!(thread.status(), 201, "{}", thread.text().await.unwrap());
    }
    for (user_token, title) in [(token, "Owner thread"), (other_token, "Other thread")] {
        let expected = client
            .get(url("/api/threads"))
            .bearer_auth(user_token)
            .send()
            .await
            .unwrap()
            .json::<Value>()
            .await
            .unwrap();
        let actual = client
            .get(&reminders)
            .bearer_auth(user_token)
            .send()
            .await
            .unwrap()
            .json::<Value>()
            .await
            .unwrap();
        assert_eq!(actual["threads"], expected["threads"]);
        assert_eq!(actual["threads"].as_array().unwrap().len(), 1);
        assert_eq!(actual["threads"][0]["title"], title);
    }
}
