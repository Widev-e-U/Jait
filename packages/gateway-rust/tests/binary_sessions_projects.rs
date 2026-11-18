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
    // Health reflects the real database without requiring authentication.
    let health = client.get(url("/health")).send().await.unwrap();
    assert_eq!(health.status(), 200);
    let health: Value = health.json().await.unwrap();
    assert_eq!(health["healthy"], true);
    assert_eq!(health["hasUsers"], false);
    assert_eq!(health["sessions"], 0);
    assert!(health["schemaVersion"].as_u64().unwrap() > 0);
    let owner = register("owner", None).await;
    let health: Value = client
        .get(url("/health"))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(health["hasUsers"], true);
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

    // Profile CRUD must remain scoped to the authenticated owner through the binary.
    let unauthenticated = client
        .get(url("/api/assistants/profiles"))
        .send()
        .await
        .unwrap();
    assert_eq!(unauthenticated.status(), 401);
    let (status, created) = call(
        M::POST,
        "/api/assistants/profiles".into(),
        owner.clone(),
        Some(json!({"name":"Binary assistant", "systemPrompt":"Help", "enabledSkills":["one"]})),
    )
    .await;
    assert_eq!(status, 201, "{created}");
    let profile_id = created["profile"]["id"].as_str().unwrap();
    let path = format!("/api/assistants/profiles/{profile_id}");
    let (status, _) = call(M::GET, path.clone(), other.clone(), None).await;
    assert_eq!(status, 404);
    let (status, _) = call(
        M::PATCH,
        path.clone(),
        other.clone(),
        Some(json!({"name":"Stolen"})),
    )
    .await;
    assert_eq!(status, 404);
    let (status, updated) = call(
        M::PATCH,
        path.clone(),
        owner.clone(),
        Some(json!({"name":"Updated"})),
    )
    .await;
    assert_eq!(status, 200, "{updated}");
    assert_eq!(updated["profile"]["name"], "Updated");
    let (_, profiles) = call(
        M::GET,
        "/api/assistants/profiles".into(),
        owner.clone(),
        None,
    )
    .await;
    assert!(
        profiles["profiles"]
            .as_array()
            .unwrap()
            .iter()
            .any(|p| p["id"] == profile_id)
    );
    let (status, _) = call(M::DELETE, path.clone(), other.clone(), None).await;
    assert_eq!(status, 404);
    let (status, _) = call(M::DELETE, path.clone(), owner.clone(), None).await;
    assert_eq!(status, 204);
    let (status, _) = call(M::GET, path, owner.clone(), None).await;
    assert_eq!(status, 404);

    // Architecture reads and writes the actual isolated project file.
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let project_root = gateway.directory.join("architecture-project");
        std::fs::create_dir(&project_root).unwrap();
        std::fs::set_permissions(&project_root, std::fs::Permissions::from_mode(0o700)).unwrap();
        let root = project_root.to_str().unwrap();
        // A group-writable project must not permit the architecture file write.
        std::fs::set_permissions(&project_root, std::fs::Permissions::from_mode(0o770)).unwrap();
        let (status, _) = call(
            M::PUT,
            "/api/architecture".into(),
            owner.clone(),
            Some(json!({"projectRoot":root, "diagram":"graph TD; A-->B"})),
        )
        .await;
        assert_eq!(status, 500);
        assert!(!project_root.join(".jait/architecture.mmd").exists());
        std::fs::set_permissions(&project_root, std::fs::Permissions::from_mode(0o700)).unwrap();
        let (status, invalid) = call(
            M::PUT,
            "/api/architecture".into(),
            owner.clone(),
            Some(json!({"projectRoot":root, "diagram":"  "})),
        )
        .await;
        assert_eq!(status, 400, "{invalid}");
        let (status, saved) = call(
            M::PUT,
            "/api/architecture".into(),
            owner.clone(),
            Some(json!({"projectRoot":root, "diagram":" graph TD; A-->B "})),
        )
        .await;
        assert_eq!(status, 200, "{saved}");
        assert_eq!(saved["diagram"]["diagram"], "graph TD; A-->B");
        assert_eq!(
            std::fs::read_to_string(project_root.join(".jait/architecture.mmd")).unwrap(),
            "graph TD; A-->B\n"
        );
        let query = url::form_urlencoded::Serializer::new(String::new())
            .append_pair("projectRoot", root)
            .finish();
        let architecture_url = format!("{}?{query}", url("/api/architecture"));
        let fetched = client
            .get(&architecture_url)
            .bearer_auth(&owner)
            .send()
            .await
            .unwrap();
        assert_eq!(fetched.status(), 200);
        let fetched: Value = fetched.json().await.unwrap();
        assert_eq!(fetched["diagram"]["diagram"], "graph TD; A-->B");
        let unauthenticated = client.get(&architecture_url).send().await.unwrap();
        assert_eq!(unauthenticated.status(), 401);
    }

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
    let health: Value = client
        .get(url("/health"))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(health["sessions"], 1);
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
    // Creation must validate the parent within the authenticated owner's active tree.
    let (status, rejected) = call(
        M::POST,
        "/api/projects".into(),
        other.clone(),
        Some(json!({"title":"Foreign child", "parentId":pid})),
    )
    .await;
    assert_eq!(status, 400, "{rejected}");
    assert_eq!(rejected["error"], "PARENT_NOT_FOUND");
    let (_, other_projects) = call(M::GET, "/api/projects".into(), other.clone(), None).await;
    assert!(
        !other_projects.to_string().contains("Foreign child"),
        "{other_projects}"
    );
    let mut parent = pid.clone();
    for depth in 2..=5 {
        let (status, child) = call(
            M::POST,
            "/api/projects".into(),
            owner.clone(),
            Some(json!({"title":format!("Depth {depth}"), "parentId":parent})),
        )
        .await;
        assert_eq!(status, 201, "{child}");
        parent = child["id"].as_str().unwrap().to_owned();
    }
    let (status, rejected) = call(
        M::POST,
        "/api/projects".into(),
        owner.clone(),
        Some(json!({"title":"Too deep child", "parentId":parent})),
    )
    .await;
    assert_eq!(status, 400, "{rejected}");
    assert_eq!(rejected["error"], "TOO_DEEP");
    let (_, projects) = call(M::GET, "/api/projects".into(), owner.clone(), None).await;
    assert!(
        !projects.to_string().contains("Too deep child"),
        "{projects}"
    );
    // Opening an existing root reuses its owned project; explicit creation conflicts.
    let root = "/binary-project-root";
    let (status, first) = call(
        M::POST,
        "/api/projects".into(),
        owner.clone(),
        Some(json!({"rootPath":root, "title":"Original root"})),
    )
    .await;
    assert_eq!(status, 201, "{first}");
    let root_id = first["id"].as_str().unwrap().to_owned();
    let (status, reopened) = call(
        M::POST,
        "/api/projects".into(),
        owner.clone(),
        Some(json!({"rootPath":root, "title":"Ignored", "parentId":pid})),
    )
    .await;
    assert_eq!(status, 201, "{reopened}");
    assert_eq!(reopened["id"], root_id);
    assert_eq!(reopened["title"], "Original root");
    assert_eq!(reopened["parentId"], pid);
    let (status, conflict) = call(
        M::POST,
        "/api/projects".into(),
        owner.clone(),
        Some(json!({"rootPath":root, "exclusiveRoot":true})),
    )
    .await;
    assert_eq!(status, 409, "{conflict}");
    assert_eq!(conflict["error"], "ROOT_PATH_IN_USE");
    let (status, foreign_root) = call(
        M::POST,
        "/api/projects".into(),
        other.clone(),
        Some(json!({"rootPath":root})),
    )
    .await;
    assert_eq!(status, 201, "{foreign_root}");
    assert_ne!(foreign_root["id"], root_id);
    let (status, rejected) = call(
        M::POST,
        "/api/projects".into(),
        owner.clone(),
        Some(json!({"rootPath":root, "parentId":"missing-parent"})),
    )
    .await;
    assert_eq!(status, 400, "{rejected}");
    assert_eq!(
        rejected["details"],
        "Cannot create under parent: PARENT_NOT_FOUND"
    );
    let (_, still_owned) = call(
        M::GET,
        format!("/api/projects/{root_id}"),
        owner.clone(),
        None,
    )
    .await;
    assert_eq!(still_owned["parentId"], pid);
    let (status, cycle) = call(
        M::POST,
        "/api/projects".into(),
        owner.clone(),
        Some(json!({"rootPath":root, "parentId":root_id})),
    )
    .await;
    assert_eq!(status, 400, "{cycle}");
    assert_eq!(cycle["error"], "CYCLE");
    let (_, unchanged) = call(
        M::GET,
        format!("/api/projects/{root_id}"),
        owner.clone(),
        None,
    )
    .await;
    assert_eq!(unchanged["parentId"], pid);
    let (status, empty_node) = call(
        M::POST,
        "/api/projects".into(),
        owner.clone(),
        Some(json!({"rootPath":root, "nodeId":"", "exclusiveRoot":true})),
    )
    .await;
    assert_eq!(status, 201, "{empty_node}");
    assert_eq!(empty_node["nodeId"], "");
    assert_ne!(empty_node["id"], root_id);
    // Selection is persisted per owner and cannot reference another owner's project.
    let anonymous = client
        .get(url("/api/projects/last-active"))
        .send()
        .await
        .unwrap();
    assert_eq!(anonymous.status(), 401);
    let (status, body) = call(
        M::POST,
        "/api/projects/select".into(),
        other.clone(),
        Some(json!({"projectId": pid})),
    )
    .await;
    assert_eq!(status, 404, "{body}");
    let (status, body) = call(
        M::POST,
        "/api/projects/select".into(),
        owner.clone(),
        Some(json!({"projectId": pid})),
    )
    .await;
    assert_eq!(status, 200, "{body}");
    assert_eq!(body["ok"], true);
    let (status, selected) = call(
        M::GET,
        "/api/projects/last-active".into(),
        owner.clone(),
        None,
    )
    .await;
    assert_eq!(status, 200, "{selected}");
    assert_eq!(selected["project"]["id"], pid);
    assert!(selected["session"].is_null(), "{selected}");
    let (status, foreign) = call(
        M::GET,
        "/api/projects/last-active".into(),
        other.clone(),
        None,
    )
    .await;
    assert_eq!(status, 200, "{foreign}");
    assert!(foreign["project"].is_null(), "{foreign}");
    assert!(foreign["session"].is_null(), "{foreign}");
    // Environment snapshots use the same owner-scoped project store through
    // the production composition. Node connectivity is still unimplemented.
    let anonymous = client
        .get(url("/api/environment/snapshot"))
        .send()
        .await
        .unwrap();
    assert_eq!(anonymous.status(), 401);
    let (status, snapshot) = call(
        M::GET,
        "/api/environment/snapshot".into(),
        owner.clone(),
        None,
    )
    .await;
    assert_eq!(status, 200, "{snapshot}");
    let projects = snapshot["snapshot"]["projects"].as_array().unwrap();
    assert!(
        projects
            .iter()
            .any(|p| p["id"] == pid && p["title"] == "Alpha"),
        "{snapshot}"
    );
    let (status, foreign_snapshot) = call(
        M::GET,
        "/api/environment/snapshot".into(),
        other.clone(),
        None,
    )
    .await;
    assert_eq!(status, 200, "{foreign_snapshot}");
    assert!(
        !foreign_snapshot["snapshot"]["projects"]
            .as_array()
            .unwrap()
            .iter()
            .any(|p| p["id"] == pid),
        "{foreign_snapshot}"
    );
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
    // The subtree endpoint must expose only the authenticated owner's hierarchy.
    let (status, subtree) = call(
        M::GET,
        format!("/api/projects/{pid}/subtree"),
        owner.clone(),
        None,
    )
    .await;
    assert_eq!(status, 200, "{subtree}");
    assert_eq!(subtree["projectId"], pid);
    assert_eq!(subtree["descendantCount"], 5);
    assert!(
        subtree["descendantIds"]
            .as_array()
            .unwrap()
            .contains(&json!(root_id))
    );
    assert_eq!(subtree["sessionCount"], 0);
    let (status, _) = call(
        M::GET,
        format!("/api/projects/{pid}/subtree"),
        other.clone(),
        None,
    )
    .await;
    assert_eq!(status, 404);
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
    let (status, archived) =
        call(M::GET, "/api/projects/archived".into(), owner.clone(), None).await;
    assert_eq!(status, 200, "{archived}");
    assert!(
        archived["projects"]
            .as_array()
            .unwrap()
            .iter()
            .any(|p| p["id"] == pid)
    );
    let (status, removed) = call(
        M::DELETE,
        "/api/projects/archived".into(),
        other.clone(),
        None,
    )
    .await;
    assert_eq!(status, 200, "{removed}");
    assert_eq!(removed["removed"], 0);
    let (status, foreign_project) = call(
        M::POST,
        "/api/projects".into(),
        other.clone(),
        Some(json!({"title":"Foreign archive"})),
    )
    .await;
    assert_eq!(status, 201, "{foreign_project}");
    let foreign_id = foreign_project["id"].as_str().unwrap();
    let (status, _) = call(
        M::DELETE,
        format!("/api/projects/{foreign_id}"),
        other.clone(),
        None,
    )
    .await;
    assert_eq!(status, 204);
    let (_, archived) = call(M::GET, "/api/projects/archived".into(), owner.clone(), None).await;
    assert!(
        archived["projects"]
            .as_array()
            .unwrap()
            .iter()
            .any(|p| p["id"] == pid)
    );
    let (status, removed) = call(
        M::DELETE,
        "/api/projects/archived".into(),
        owner.clone(),
        None,
    )
    .await;
    assert_eq!(status, 200, "{removed}");
    assert!(removed["removed"].as_u64().unwrap() >= 1);
    let (status, deleted) = call(M::GET, format!("/api/projects/{pid}"), owner.clone(), None).await;
    assert_eq!(status, 200, "{deleted}");
    assert_eq!(deleted["status"], "deleted");
    let (_, archived) = call(M::GET, "/api/projects/archived".into(), owner.clone(), None).await;
    assert!(archived["projects"].as_array().unwrap().is_empty());
    let (status, foreign_archived) =
        call(M::GET, "/api/projects/archived".into(), other.clone(), None).await;
    assert_eq!(status, 200, "{foreign_archived}");
    assert!(
        foreign_archived["projects"]
            .as_array()
            .unwrap()
            .iter()
            .any(|p| p["id"] == foreign_id)
    );
}

#[tokio::test]
async fn project_list_limit_uses_node_query_semantics_through_binary() {
    let gateway = Gateway::start();
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
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
    let token = register.json::<Value>().await.unwrap()["access_token"]
        .as_str()
        .unwrap()
        .to_owned();
    for index in 0..101 {
        let response = client
            .post(url("/api/projects"))
            .bearer_auth(&token)
            .json(&json!({"title": format!("Project {index}")}))
            .send()
            .await
            .unwrap();
        assert_eq!(response.status(), 201);
    }
    for (query, expected_count, has_more) in [
        ("?limit=2.9", 2, true),
        ("?limit=3extra", 3, true),
        ("?limit=2&limit=3", 101, false),
        ("?limit=1000", 100, true),
    ] {
        let response = client
            .get(url(&format!("/api/projects{query}")))
            .bearer_auth(&token)
            .send()
            .await
            .unwrap();
        assert_eq!(response.status(), 200);
        let body = response.json::<Value>().await.unwrap();
        assert_eq!(
            body["projects"].as_array().unwrap().len(),
            expected_count,
            "{query}"
        );
        assert_eq!(body["hasMore"], has_more, "{query}");
    }
}
