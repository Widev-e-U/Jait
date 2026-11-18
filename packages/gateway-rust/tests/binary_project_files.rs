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

    // Another user cannot resolve the project: no root, no access.
    let (status, body) = call(M::GET, q("list", ""), other.clone(), None).await;
    assert_eq!(status, 404, "{body}");
    let (status, body) = call(
        M::POST,
        "/api/project/write".into(),
        other.clone(),
        Some(json!({"projectId": pid, "path":"x.txt","content":"no"})),
    )
    .await;
    assert_eq!(status, 404, "{body}");
    assert!(!work.join("x.txt").exists());

    // Info, open, list, stat, read.
    let (status, info) = call(M::GET, q("info", ""), owner.clone(), None).await;
    assert_eq!(status, 200, "{info}");
    assert_eq!(info["open"], true);
    let (status, body) = call(
        M::POST,
        "/api/project/open".into(),
        owner.clone(),
        Some(json!({"projectId": pid})),
    )
    .await;
    assert_eq!(status, 200, "{body}");
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
