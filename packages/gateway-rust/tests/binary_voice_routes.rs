//! Voice routes through the production binary.
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
            .join("../../.jait/artifacts/binary-voice-routes-tests")
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
async fn voice_routes_through_the_binary() {
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


    // Authenticated owner paths. (Node serves state/speak/transcribe without a
    // session, so no 401 is asserted for them; wake-candidate does require one.)
    let (st, _) = call(M::POST, "/api/voice/wake-candidate".into(), String::new(), Some(json!({"transcript":"hey"}))).await;
    assert_eq!(st, 401);
    let (st, b) = call(M::POST, "/api/voice/wake-candidate".into(), owner.clone(), Some(json!({"transcript":"hey jait"}))).await;
    assert!(st == 200 && b["activate"] == false, "{b}");
    let (st, b) = call(M::POST, "/api/voice/wake-candidate".into(), owner.clone(), Some(json!({}))).await;
    assert!(st == 200 && b["activate"] == false, "{b}");

    let (st, b) = call(M::GET, "/api/voice/state/s1".into(), owner.clone(), None).await;
    assert!(st == 200 && b["state"]["sessionId"] == "s1" && b["state"]["wakeWordEnabled"] == true, "{b}");
    let (st, b) = call(M::PATCH, "/api/voice/state/s1".into(), owner.clone(), Some(json!({"wakeWordEnabled":false,"talkModeEnabled":true,"listening":"nope"}))).await;
    assert!(st == 200 && b["state"]["wakeWordEnabled"] == false && b["state"]["talkModeEnabled"] == true && b["state"]["listening"] == false, "{b}");
    let (_, b) = call(M::GET, "/api/voice/state/s1".into(), owner.clone(), None).await;
    assert_eq!(b["state"]["wakeWordEnabled"], false, "{b}");

    let (st, b) = call(M::POST, "/api/voice/speak".into(), owner.clone(), Some(json!({}))).await;
    assert!(st == 400 && b["error"] == "VALIDATION_ERROR", "{b}");
    let (st, b) = call(M::POST, "/api/voice/transcribe".into(), owner.clone(), Some(json!({}))).await;
    assert!(st == 400 && b["error"] == "VALIDATION_ERROR", "{b}");
    let (st, b) = call(M::POST, "/api/voice/transcribe-audio".into(), owner.clone(), Some(json!({"audioBase64":"AAAA"}))).await;
    assert!(st == 501 && b["error"] == "NOT_CONFIGURED", "{b}");
    let (st, b) = call(M::GET, "/api/voice-assistant/status".into(), owner.clone(), None).await;
    assert!(st == 200 && b["available"] == false && b["voice"] == "alloy", "{b}");
    let _ = &other;
}
