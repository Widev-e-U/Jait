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
async fn project_membership_is_owner_managed_and_revocable() {
    let gateway = Gateway::start();
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .unwrap();
    let url = |p: &str| format!("{}{p}", gateway.base);
    let owner: Value = client
        .post(url("/api/auth/register"))
        .json(&json!({"username":"owner","password":"owner-pass-123"}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let owner = owner["access_token"].as_str().unwrap().to_owned();
    let invitation: Value = client
        .post(url("/api/auth/invitations"))
        .bearer_auth(&owner)
        .json(&json!({}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let member: Value = client.post(url("/api/auth/register")).json(&json!({"username":"member","password":"owner-pass-123","invitation":invitation["invitation"]})).send().await.unwrap().json().await.unwrap();
    let member_id = member["user"]["id"].as_str().unwrap().to_owned();
    let member = member["access_token"].as_str().unwrap().to_owned();
    let project: Value = client
        .post(url("/api/projects"))
        .bearer_auth(&owner)
        .json(&json!({"title":"Shared project"}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let id = project["id"].as_str().unwrap();
    let private: Value = client
        .post(url("/api/sessions"))
        .bearer_auth(&owner)
        .json(&json!({"projectId":id,"name":"private marker"}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let private_id = private["id"].as_str().unwrap();
    {
        let db = rusqlite::Connection::open(gateway.directory.join("gateway.sqlite")).unwrap();
        db.execute("INSERT INTO messages(id,session_id,role,content,tool_calls,segments,thinking,created_at) VALUES('fixture-user',?1,'user','hello',NULL,NULL,NULL,'2026-01-01T00:00:00Z')", [private_id]).unwrap();
        db.execute(r#"INSERT INTO messages(id,session_id,role,content,tool_calls,segments,thinking,created_at) VALUES('fixture-assistant',?1,'assistant','answer','[{"secret":"tool-secret"}]','[{"secret":"segment-secret"}]','thinking-secret','2026-01-01T00:00:01Z')"#, [private_id]).unwrap();
        db.execute("INSERT INTO messages(id,session_id,role,content,created_at) VALUES('fixture-system',?1,'system','system-secret','2026-01-01T00:00:02Z')", [private_id]).unwrap();
    }
    let messages_url = url(&format!("/api/sessions/{private_id}/messages"));
    let shared_stream_url = url(&format!("/api/sessions/{private_id}/shared-stream"));
    let project_url = url(&format!("/api/projects/{id}"));
    let members_url = format!("{project_url}/members");
    assert_eq!(
        client
            .get(&project_url)
            .bearer_auth(&member)
            .send()
            .await
            .unwrap()
            .status(),
        404
    );
    assert_eq!(
        client
            .post(&members_url)
            .bearer_auth(&member)
            .json(&json!({"username":"member"}))
            .send()
            .await
            .unwrap()
            .status(),
        404
    );
    let added = client
        .post(&members_url)
        .bearer_auth(&owner)
        .json(&json!({"username":"member"}))
        .send()
        .await
        .unwrap();
    assert_eq!(added.status(), 200);
    let added: Value = added.json().await.unwrap();
    assert_eq!(added["members"].as_array().unwrap().len(), 2);
    assert_eq!(added["canManage"], true);
    assert!(
        added["members"]
            .as_array()
            .unwrap()
            .iter()
            .any(|m| m["username"] == "member" && m["role"] == "member")
    );
    let owner_detail: Value = client
        .get(&project_url)
        .bearer_auth(&owner)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let owner_session = owner_detail["sessions"]
        .as_array()
        .unwrap()
        .iter()
        .find(|s| s["id"] == private_id)
        .unwrap();
    assert_eq!(owner_session["isOwner"], true);
    assert_eq!(owner_session["canManageShare"], true);

    assert_eq!(
        client
            .get(&project_url)
            .bearer_auth(&member)
            .send()
            .await
            .unwrap()
            .status(),
        200
    );
    let listing: Value = client
        .get(url("/api/projects"))
        .bearer_auth(&member)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert!(!listing.to_string().contains(private_id));
    assert!(
        listing["projects"]
            .as_array()
            .unwrap()
            .iter()
            .any(|p| p["id"] == id)
    );
    assert_eq!(
        client
            .get(&shared_stream_url)
            .bearer_auth(&member)
            .send()
            .await
            .unwrap()
            .status(),
        404
    );
    let session_url = url(&format!("/api/sessions/{private_id}"));
    let share_url = format!("{session_url}/share");
    assert_eq!(
        client
            .get(format!("{messages_url}?limit=invalid"))
            .bearer_auth(&member)
            .send()
            .await
            .unwrap()
            .status(),
        404
    );
    assert_eq!(
        client
            .get(&messages_url)
            .bearer_auth(&member)
            .send()
            .await
            .unwrap()
            .status(),
        404
    );
    assert_eq!(
        client
            .get(&session_url)
            .bearer_auth(&member)
            .send()
            .await
            .unwrap()
            .status(),
        404
    );
    assert_eq!(
        client
            .patch(&share_url)
            .bearer_auth(&member)
            .json(&json!({"sharedWithProject":true}))
            .send()
            .await
            .unwrap()
            .status(),
        404
    );
    assert_eq!(
        client
            .patch(&share_url)
            .bearer_auth(&owner)
            .json(&json!({"sharedWithProject":"true"}))
            .send()
            .await
            .unwrap()
            .status(),
        400
    );
    assert_eq!(
        client
            .patch(&share_url)
            .bearer_auth(&owner)
            .json(&json!({"sharedWithProject":true}))
            .send()
            .await
            .unwrap()
            .status(),
        200
    );
    let shared: Value = client
        .get(&session_url)
        .bearer_auth(&member)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(shared["id"], private_id);
    assert_eq!(shared["sharedWithProject"], true);
    assert_eq!(shared["isOwner"], false);
    assert_eq!(shared["canManageShare"], false);
    let shared_messages: Value = client
        .get(&messages_url)
        .bearer_auth(&member)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let visible = shared_messages["messages"].as_array().unwrap();
    assert_eq!(visible.len(), 2);
    assert_eq!(visible[0]["content"], "hello");
    assert_eq!(visible[1]["content"], "answer");
    assert!(visible.iter().all(|message| {
        message
            .as_object()
            .unwrap()
            .keys()
            .all(|key| ["id", "role", "content", "authorUserId"].contains(&key.as_str()))
    }));
    assert!(!shared_messages.to_string().contains("secret"));
    let mut shared_stream = client
        .get(&shared_stream_url)
        .bearer_auth(&member)
        .send()
        .await
        .unwrap();
    assert_eq!(shared_stream.status(), 200);
    let snapshot = tokio::time::timeout(Duration::from_secs(5), async {
        let mut bytes = Vec::new();
        while !bytes.ends_with(b"\n\n") {
            bytes.extend_from_slice(
                &shared_stream
                    .chunk()
                    .await
                    .unwrap()
                    .expect("stream closed before snapshot"),
            );
            assert!(bytes.len() < 1_000_000, "snapshot exceeded test limit");
        }
        String::from_utf8(bytes).unwrap()
    })
    .await
    .unwrap();
    assert!(snapshot.contains("\"type\":\"snapshot\""));
    assert!(snapshot.contains("hello") && snapshot.contains("answer"));
    assert!(!snapshot.contains("secret"));
    let owner_messages: Value = client
        .get(&messages_url)
        .bearer_auth(&owner)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert!(owner_messages.to_string().contains("thinking-secret"));
    assert!(owner_messages.to_string().contains("system-secret"));
    assert_eq!(
        client
            .patch(&session_url)
            .bearer_auth(&member)
            .json(&json!({"name":"unauthorized"}))
            .send()
            .await
            .unwrap()
            .status(),
        404
    );
    assert_eq!(
        client
            .patch(&share_url)
            .bearer_auth(&owner)
            .json(&json!({"sharedWithProject":false}))
            .send()
            .await
            .unwrap()
            .status(),
        200
    );
    assert!(
        tokio::time::timeout(Duration::from_secs(4), shared_stream.chunk())
            .await
            .unwrap()
            .unwrap()
            .is_none()
    );
    assert_eq!(
        client
            .get(&shared_stream_url)
            .bearer_auth(&member)
            .send()
            .await
            .unwrap()
            .status(),
        404
    );
    assert_eq!(
        client
            .get(&messages_url)
            .bearer_auth(&member)
            .send()
            .await
            .unwrap()
            .status(),
        404
    );
    assert_eq!(
        client
            .get(&session_url)
            .bearer_auth(&member)
            .send()
            .await
            .unwrap()
            .status(),
        404
    );
    assert_eq!(
        client
            .patch(&share_url)
            .bearer_auth(&owner)
            .json(&json!({"sharedWithProject":true}))
            .send()
            .await
            .unwrap()
            .status(),
        200
    );
    assert_eq!(
        client
            .delete(&project_url)
            .bearer_auth(&owner)
            .send()
            .await
            .unwrap()
            .status(),
        204
    );
    assert_eq!(
        client
            .get(&messages_url)
            .bearer_auth(&member)
            .send()
            .await
            .unwrap()
            .status(),
        404
    );
    assert_eq!(
        client
            .get(&session_url)
            .bearer_auth(&member)
            .send()
            .await
            .unwrap()
            .status(),
        404
    );
    let archived: Value = client
        .get(url("/api/projects?status=archived"))
        .bearer_auth(&member)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert!(!archived.to_string().contains(id));
    assert_eq!(
        client
            .get(&project_url)
            .bearer_auth(&member)
            .send()
            .await
            .unwrap()
            .status(),
        404
    );
    assert_eq!(
        client
            .post(format!("{project_url}/restore"))
            .bearer_auth(&owner)
            .send()
            .await
            .unwrap()
            .status(),
        200
    );
    assert_eq!(
        client
            .delete(format!("{members_url}/{member_id}"))
            .bearer_auth(&member)
            .send()
            .await
            .unwrap()
            .status(),
        404
    );
    assert_eq!(
        client
            .delete(format!("{members_url}/{member_id}"))
            .bearer_auth(&owner)
            .send()
            .await
            .unwrap()
            .status(),
        204
    );
    assert_eq!(
        client
            .get(&messages_url)
            .bearer_auth(&member)
            .send()
            .await
            .unwrap()
            .status(),
        404
    );
    assert_eq!(
        client
            .get(&session_url)
            .bearer_auth(&member)
            .send()
            .await
            .unwrap()
            .status(),
        404
    );
    assert_eq!(
        client
            .get(&project_url)
            .bearer_auth(&member)
            .send()
            .await
            .unwrap()
            .status(),
        404
    );
}
