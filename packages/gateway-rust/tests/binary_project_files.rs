//! Project filesystem routes through the production binary, confined to the project root.
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
            .join("../../.jait/artifacts/binary-project-files-tests")
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
async fn project_files_are_confined_and_owned_through_the_binary() {
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
    // The production mount must reject unauthenticated access before dispatching
    // both known and unknown project filesystem paths.
    for path in ["/api/project/list", "/api/project/not-a-route"] {
        let response = client.get(url(path)).send().await.unwrap();
        assert_eq!(response.status(), 401, "{path}");
    }
    let owner = register("owner", None).await;
    let unknown = client
        .get(url("/api/project/not-a-route"))
        .bearer_auth(&owner)
        .send()
        .await
        .unwrap();
    assert_eq!(unknown.status(), 404);
    let no_project = client
        .get(url("/api/project/info"))
        .bearer_auth(&owner)
        .send()
        .await
        .unwrap();
    assert_eq!(no_project.status(), 404);
    assert_eq!(
        no_project.json::<Value>().await.unwrap(),
        json!({
            "error": "NO_PROJECT", "message": "No filesystem surface is running"
        })
    );
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

    let work = gateway.directory.join("work");
    std::fs::create_dir_all(work.join("sub")).unwrap();
    std::fs::write(work.join("hello.txt"), "hello needle").unwrap();
    std::fs::write(work.join("sub/inner.txt"), "inner").unwrap();
    std::fs::write(gateway.directory.join("secret.txt"), "outside").unwrap();
    let (status, project) = call(
        M::POST,
        "/api/projects".into(),
        owner.clone(),
        Some(json!({"title":"Files","rootPath": work.to_string_lossy()})),
    )
    .await;
    assert_eq!(status, 201, "{project}");
    let pid = project["id"].as_str().unwrap().to_owned();
    let q = |route: &str, extra: &str| format!("/api/project/{route}?projectId={pid}{extra}");

    let (status, listing) = call(M::GET, q("list", ""), owner.clone(), None).await;
    assert_eq!(status, 200, "{listing}");
    assert!(
        listing["entries"]
            .as_array()
            .unwrap()
            .iter()
            .any(|entry| entry["name"] == "hello.txt")
    );
    let (status, file) = call(M::GET, q("read", "&path=hello.txt"), owner.clone(), None).await;
    assert_eq!(status, 200, "{file}");
    assert_eq!(file["content"], "hello needle");
    for route in ["list", "read"] {
        let (status, body) =
            call(M::GET, q(route, "&path=../secret.txt"), owner.clone(), None).await;
        assert_eq!(status, 400, "{body}");
        assert_eq!(body["error"], "INVALID_PATH");
    }

    for (payload, message) in [
        (json!({}), "path is required"),
        (json!({"path": "/some/path"}), "sessionId is required"),
    ] {
        let (status, body) = call(
            M::POST,
            "/api/project/open".into(),
            owner.clone(),
            Some(payload),
        )
        .await;
        assert_eq!(status, 400, "{body}");
        assert_eq!(body["error"], "VALIDATION_ERROR");
        assert_eq!(body["message"], message);
    }

    let (status, session) = call(
        M::POST,
        "/api/sessions".into(),
        owner.clone(),
        Some(json!({})),
    )
    .await;
    assert_eq!(status, 201, "{session}");
    let session_id = session["id"].as_str().unwrap();
    for (token, sid) in [(owner.clone(), "missing"), (other.clone(), session_id)] {
        let (status, body) = call(
            M::POST,
            "/api/project/open".into(),
            token,
            Some(json!({"path": work.to_string_lossy(), "sessionId": sid})),
        )
        .await;
        assert_eq!(status, 404, "{body}");
    }
    // Session authorization must precede filesystem metadata checks: a caller
    // cannot distinguish an existing file from a missing path using another
    // user's session.
    for path in [work.join("hello.txt"), work.join("absent")] {
        let (status, body) = call(
            M::POST,
            "/api/project/open".into(),
            other.clone(),
            Some(json!({"path": path.to_string_lossy(), "sessionId": session_id})),
        )
        .await;
        assert_eq!(status, 404, "{body}");
        assert_eq!(body["error"], "NOT_FOUND");
    }
    for (path, expected) in [
        (work.join("absent"), "PATH_NOT_FOUND"),
        (work.join("hello.txt"), "NOT_A_DIRECTORY"),
    ] {
        let (status, body) = call(
            M::POST,
            "/api/project/open".into(),
            owner.clone(),
            Some(json!({"path": path.to_string_lossy(), "sessionId": session_id})),
        )
        .await;
        assert_eq!(status, 400, "{body}");
        assert_eq!(body["error"], expected);
    }
    // Malformed node selectors must not fall back to gateway-local metadata.
    for node in [json!(42), json!(false), json!({"id": "remote"})] {
        let (status, body) = call(
            M::POST,
            "/api/project/open".into(),
            owner.clone(),
            Some(json!({"path": work.join("absent").to_string_lossy(), "sessionId": session_id, "nodeId": node})),
        )
        .await;
        assert_eq!(status, 400, "{body}");
        assert_eq!(body["error"], "VALIDATION_ERROR");
        assert_eq!(body["message"], "nodeId must be a string");
    }
    // A remote path must not be checked against the gateway filesystem, even
    // when the same path happens to name a local file or directory.
    for path in [work.join("absent"), work.join("hello.txt"), work.clone()] {
        let (status, body) = call(
            M::POST,
            "/api/project/open".into(),
            owner.clone(),
            Some(json!({"path": path.to_string_lossy(), "sessionId": session_id, "nodeId": "remote"})),
        )
        .await;
        assert_eq!(status, 501, "{body}");
        assert_eq!(body["error"], "NOT_IMPLEMENTED");
    }
    // A valid path/session open starts the session's own filesystem surface. A
    // payload that also names a project follows the same lifecycle, and each open
    // replaces the session's previous surface.
    let work_path = work.to_string_lossy().into_owned();
    let mut surface_ids = Vec::new();
    for payload in [
        json!({"path": work_path, "sessionId": session_id}),
        json!({"projectId": pid, "path": work_path, "sessionId": session_id}),
    ] {
        let (status, body) = call(
            M::POST,
            "/api/project/open".into(),
            owner.clone(),
            Some(payload),
        )
        .await;
        assert_eq!(status, 200, "{body}");
        assert_eq!(body["projectRoot"], work_path, "{body}");
        assert_eq!(body["nodeId"], "gateway", "{body}");
        assert_eq!(body["panelOpen"], false, "{body}");
        // The session has no project of its own, so the response names none.
        assert!(body["projectId"].is_null(), "{body}");
        surface_ids.push(body["surfaceId"].as_str().unwrap().to_owned());
    }
    let (first, current) = (surface_ids[0].clone(), surface_ids[1].clone());
    assert_ne!(first, current);
    // The replaced surface is gone; the current one serves its owner only.
    let (status, body) = call(
        M::GET,
        format!("/api/project/list?surfaceId={first}&path="),
        owner.clone(),
        None,
    )
    .await;
    assert_eq!(status, 404, "{body}");
    assert_eq!(body["error"], "NO_PROJECT");
    let (status, listing) = call(
        M::GET,
        format!("/api/project/list?surfaceId={current}&path="),
        owner.clone(),
        None,
    )
    .await;
    assert_eq!(status, 200, "{listing}");
    assert!(
        listing["entries"]
            .as_array()
            .unwrap()
            .iter()
            .any(|entry| entry["name"] == "hello.txt"),
        "{listing}"
    );
    let (status, body) = call(
        M::GET,
        format!("/api/project/list?surfaceId={current}&path="),
        other.clone(),
        None,
    )
    .await;
    assert_eq!(status, 404, "{body}");
    assert_eq!(body["error"], "NO_PROJECT");
    let (status, file) = call(
        M::GET,
        format!("/api/project/read?surfaceId={current}&path=hello.txt"),
        owner.clone(),
        None,
    )
    .await;
    assert_eq!(status, 200, "{file}");
    assert_eq!(file["content"], "hello needle");
    let (status, body) = call(
        M::GET,
        format!("/api/project/read?surfaceId={current}&path=../secret.txt"),
        owner.clone(),
        None,
    )
    .await;
    assert_eq!(status, 400, "{body}");
    assert_eq!(body["error"], "INVALID_PATH");
    // The session records the panel for the surface it started.
    let (status, session_state) = call(
        M::GET,
        format!("/api/sessions/{session_id}/state"),
        owner.clone(),
        None,
    )
    .await;
    assert_eq!(status, 200, "{session_state}");
    assert_eq!(
        session_state["project.panel"]["surfaceId"], current,
        "{session_state}"
    );
    assert_eq!(
        session_state["project.panel"]["remotePath"], work_path,
        "{session_state}"
    );

    // Another user cannot resolve the project: no root, no access.
    let (status, body) = call(M::GET, q("list", ""), other.clone(), None).await;
    assert_eq!(status, 404, "{body}");
    let (status, body) = call(M::GET, q("info", ""), other.clone(), None).await;
    assert_eq!(status, 404, "{body}");
    let (status, body) = call(
        M::POST,
        "/api/project/open".into(),
        other.clone(),
        Some(json!({"projectId": pid})),
    )
    .await;
    assert_eq!(status, 404, "{body}");
    let (status, state) = call(
        M::GET,
        format!("/api/projects/{pid}/state"),
        owner.clone(),
        None,
    )
    .await;
    assert_eq!(status, 200, "{state}");
    assert!(state.get("project.ui").is_none(), "{state}");
    let (status, body) = call(
        M::POST,
        "/api/project/write".into(),
        other.clone(),
        Some(json!({"projectId": pid, "path":"x.txt","content":"no"})),
    )
    .await;
    assert_eq!(status, 404, "{body}");
    assert!(!work.join("x.txt").exists());

    // Legacy project opens still report a missing root after it disappears.
    let vanished = work.join("vanished-project");
    std::fs::create_dir(&vanished).unwrap();
    let (status, vanished_project) = call(
        M::POST,
        "/api/projects".into(),
        owner.clone(),
        Some(json!({"title": "Vanished", "rootPath": vanished.to_string_lossy()})),
    )
    .await;
    assert_eq!(status, 201, "{vanished_project}");
    std::fs::remove_dir(&vanished).unwrap();
    let (status, body) = call(
        M::POST,
        "/api/project/open".into(),
        owner.clone(),
        Some(json!({"projectId": vanished_project["id"]})),
    )
    .await;
    assert_eq!(status, 404, "{body}");
    assert_eq!(body["error"], "NO_PROJECT");

    // A remote project's coincidentally existing local path must never be opened locally.
    let (status, remote) = call(
        M::POST,
        "/api/projects".into(),
        owner.clone(),
        Some(json!({"title":"Remote", "rootPath": work.to_string_lossy(), "nodeId":"remote-node"})),
    )
    .await;
    assert_eq!(status, 201, "{remote}");
    let remote_id = remote["id"].as_str().unwrap();
    let (status, body) = call(
        M::POST,
        "/api/project/open".into(),
        owner.clone(),
        Some(json!({"projectId": remote_id})),
    )
    .await;
    assert_eq!(status, 400, "{body}");
    assert_eq!(body["error"], "NODE_OFFLINE");
    for route in ["list", "read", "download", "stat", "backup", "search"] {
        let (status, body) = call(
            M::GET,
            format!("/api/project/{route}?projectId={remote_id}&path=hello.txt&query=hello"),
            owner.clone(),
            None,
        )
        .await;
        assert_eq!(status, 400, "{route}: {body}");
        assert_eq!(body["error"], "NODE_OFFLINE", "{route}");
    }
    // An explicit surface is independently authorized, even when the selected
    // project root belongs to a remote node.
    let (status, body) = call(
        M::GET,
        format!("/api/project/search?projectId={remote_id}&surfaceId=missing&query=hello"),
        owner.clone(),
        None,
    )
    .await;
    assert_eq!(status, 404, "{body}");
    assert_eq!(body["error"], "SURFACE_NOT_FOUND");
    for route in [
        "write",
        "delete",
        "rename",
        "move",
        "create-file",
        "create-directory",
        "undo",
        "undo-all",
        "apply-diff",
        "reveal",
    ] {
        let (status, body) = call(
            M::POST,
            format!("/api/project/{route}"),
            owner.clone(),
            Some(
                json!({"projectId": remote_id, "path": "hello.txt", "content": "remote overwrite"}),
            ),
        )
        .await;
        assert_eq!(status, 400, "{route}: {body}");
        assert_eq!(body["error"], "NODE_OFFLINE", "{route}");
    }
    assert_eq!(
        std::fs::read_to_string(work.join("hello.txt")).unwrap(),
        "hello needle"
    );
    let (status, state) = call(
        M::GET,
        format!("/api/projects/{remote_id}/state"),
        owner.clone(),
        None,
    )
    .await;
    assert_eq!(status, 200, "{state}");
    assert!(state.get("project.ui").is_none(), "{state}");

    // Info, open, list, stat, read.
    let (status, info) = call(M::GET, q("info", ""), owner.clone(), None).await;
    assert_eq!(status, 200, "{info}");
    assert_eq!(info["open"], true);
    let (status, body) = call(
        M::PATCH,
        format!("/api/projects/{pid}/state"),
        owner.clone(),
        Some(json!({"project.ui": {"tabs": ["hello.txt"], "panel": {"width": 320}}})),
    )
    .await;
    assert_eq!(status, 200, "{body}");
    let (status, body) = call(
        M::POST,
        "/api/project/open".into(),
        owner.clone(),
        Some(json!({"projectId": pid})),
    )
    .await;
    assert_eq!(status, 200, "{body}");
    let (status, state) = call(
        M::GET,
        format!("/api/projects/{pid}/state"),
        owner.clone(),
        None,
    )
    .await;
    assert_eq!(status, 200, "{state}");
    assert_eq!(state["project.ui"]["tabs"], json!(["hello.txt"]));
    assert_eq!(
        state["project.ui"]["panel"],
        json!({"width": 320, "open": true})
    );
    // A session bound to the project mirrors its panel into project UI state and keeps
    // the saved tabs. An explicit openPanel overrides the saved panel preference.
    let (status, linked) = call(
        M::POST,
        "/api/sessions".into(),
        owner.clone(),
        Some(json!({"projectId": pid})),
    )
    .await;
    assert_eq!(status, 201, "{linked}");
    let linked_id = linked["id"].as_str().unwrap().to_owned();
    let (status, body) = call(
        M::POST,
        "/api/project/open".into(),
        owner.clone(),
        Some(json!({"path": work_path, "sessionId": linked_id, "openPanel": false})),
    )
    .await;
    assert_eq!(status, 200, "{body}");
    assert_eq!(body["projectId"], pid, "{body}");
    assert_eq!(body["panelOpen"], false, "{body}");
    let linked_surface = body["surfaceId"].as_str().unwrap().to_owned();
    let (status, state) = call(
        M::GET,
        format!("/api/projects/{pid}/state"),
        owner.clone(),
        None,
    )
    .await;
    assert_eq!(status, 200, "{state}");
    assert_eq!(state["project.ui"]["tabs"], json!(["hello.txt"]), "{state}");
    assert_eq!(state["project.ui"]["panel"]["open"], false, "{state}");
    assert_eq!(
        state["project.ui"]["panel"]["surfaceId"], linked_surface,
        "{state}"
    );
    assert_eq!(state["project.ui"]["panel"]["nodeId"], "gateway", "{state}");
    // Without openPanel the saved preference (closed) decides.
    let (status, body) = call(
        M::POST,
        "/api/project/open".into(),
        owner.clone(),
        Some(json!({"path": work_path, "sessionId": linked_id})),
    )
    .await;
    assert_eq!(status, 200, "{body}");
    assert_eq!(body["panelOpen"], false, "{body}");
    let (status, list) = call(M::GET, q("list", ""), owner.clone(), None).await;
    assert_eq!(status, 200, "{list}");
    assert!(list.to_string().contains("hello.txt"), "{list}");
    let (status, stat) = call(M::GET, q("stat", "&path=hello.txt"), owner.clone(), None).await;
    assert_eq!(status, 200, "{stat}");
    assert_eq!(stat["isFile"], true);
    let (status, read) = call(M::GET, q("read", "&path=hello.txt"), owner.clone(), None).await;
    assert_eq!(status, 200, "{read}");
    assert_eq!(read["content"], "hello needle");
    let (status, _) = call(
        M::GET,
        q("read", "&path=../secret.txt"),
        owner.clone(),
        None,
    )
    .await;
    assert_eq!(status, 400);
    let (status, _) = call(
        M::GET,
        q("download", "&path=../secret.txt"),
        owner.clone(),
        None,
    )
    .await;
    assert_eq!(status, 403);
    let (status, _) = call(
        M::GET,
        q("download", "&path=hello.txt"),
        owner.clone(),
        None,
    )
    .await;
    assert_eq!(status, 200);
    let (status, found) = call(
        M::GET,
        q("search", "&query=needle&mode=content"),
        owner.clone(),
        None,
    )
    .await;
    assert_eq!(status, 200, "{found}");
    assert!(found.to_string().contains("hello.txt"), "{found}");

    // Write, backup, undo, apply-diff.
    let write = |path: &str, content: &str| {
        Some(json!({"projectId": pid, "path": path, "content": content}))
    };
    let (status, body) = call(
        M::POST,
        "/api/project/write".into(),
        owner.clone(),
        write("hello.txt", "changed"),
    )
    .await;
    assert_eq!(status, 200, "{body}");
    assert_eq!(
        std::fs::read_to_string(work.join("hello.txt")).unwrap(),
        "changed"
    );
    let (status, backup) = call(M::GET, q("backup", "&path=hello.txt"), owner.clone(), None).await;
    assert_eq!(status, 200, "{backup}");
    assert_eq!(backup["originalContent"], "hello needle");
    let (status, body) = call(
        M::POST,
        "/api/project/undo".into(),
        owner.clone(),
        Some(json!({"projectId": pid, "path":"hello.txt"})),
    )
    .await;
    assert_eq!(status, 200, "{body}");
    assert_eq!(
        std::fs::read_to_string(work.join("hello.txt")).unwrap(),
        "hello needle"
    );
    let (status, _) = call(
        M::POST,
        "/api/project/write".into(),
        owner.clone(),
        write("hello.txt", "v2"),
    )
    .await;
    assert_eq!(status, 200);
    let (status, body) = call(
        M::POST,
        "/api/project/undo-all".into(),
        owner.clone(),
        Some(json!({"projectId": pid, "paths":["hello.txt"]})),
    )
    .await;
    assert_eq!(status, 200, "{body}");
    assert_eq!(
        std::fs::read_to_string(work.join("hello.txt")).unwrap(),
        "hello needle"
    );
    let (status, body) = call(
        M::POST,
        "/api/project/apply-diff".into(),
        owner.clone(),
        Some(json!({"projectId": pid, "path":"hello.txt", "content":"applied"})),
    )
    .await;
    assert_eq!(status, 200, "{body}");
    assert_eq!(
        std::fs::read_to_string(work.join("hello.txt")).unwrap(),
        "applied"
    );

    // Path confinement on every mutation.
    let (status, _) = call(
        M::POST,
        "/api/project/write".into(),
        owner.clone(),
        write("../escape.txt", "x"),
    )
    .await;
    assert_eq!(status, 400);
    assert!(!gateway.directory.join("escape.txt").exists());
    let (status, _) = call(
        M::POST,
        "/api/project/delete".into(),
        owner.clone(),
        Some(json!({"projectId": pid, "path":"../secret.txt"})),
    )
    .await;
    assert_eq!(status, 400);
    assert!(gateway.directory.join("secret.txt").exists());
    let (status, _) = call(
        M::POST,
        "/api/project/delete".into(),
        owner.clone(),
        Some(json!({"projectId": pid, "path":"."})),
    )
    .await;
    assert_eq!(status, 400);
    assert!(work.exists());

    // Create, rename, move, delete.
    let (status, body) = call(
        M::POST,
        "/api/project/create-file".into(),
        owner.clone(),
        write("new.txt", "fresh"),
    )
    .await;
    assert_eq!(status, 200, "{body}");
    let (status, _) = call(
        M::POST,
        "/api/project/create-file".into(),
        owner.clone(),
        write("new.txt", "again"),
    )
    .await;
    assert_eq!(status, 400);
    let (status, body) = call(
        M::POST,
        "/api/project/create-directory".into(),
        owner.clone(),
        Some(json!({"projectId": pid, "path":"made"})),
    )
    .await;
    assert_eq!(status, 200, "{body}");
    assert!(work.join("made").is_dir());
    let (status, body) = call(
        M::POST,
        "/api/project/rename".into(),
        owner.clone(),
        Some(json!({"projectId": pid, "path":"new.txt","name":"renamed.txt"})),
    )
    .await;
    assert_eq!(status, 200, "{body}");
    let (status, _) = call(
        M::POST,
        "/api/project/rename".into(),
        owner.clone(),
        Some(json!({"projectId": pid, "path":"renamed.txt","name":"../out.txt"})),
    )
    .await;
    assert_eq!(status, 400);
    let (status, body) = call(
        M::POST,
        "/api/project/move".into(),
        owner.clone(),
        Some(json!({"projectId": pid, "path":"renamed.txt","directory":"made"})),
    )
    .await;
    assert_eq!(status, 200, "{body}");
    assert!(work.join("made/renamed.txt").is_file());
    let (status, body) = call(
        M::POST,
        "/api/project/delete".into(),
        owner.clone(),
        Some(json!({"projectId": pid, "path":"made"})),
    )
    .await;
    assert_eq!(status, 200, "{body}");
    assert!(!work.join("made").exists());
    let (status, body) = call(
        M::POST,
        "/api/project/reveal".into(),
        owner.clone(),
        Some(json!({"projectId": pid, "path":"hello.txt"})),
    )
    .await;
    assert_eq!(status, 200, "{body}");
}
