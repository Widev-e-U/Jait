//! Mobile device requests through the real gateway executable and isolated storage.
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
            .join("../../.jait/artifacts/binary-mobile-tests")
            .join(uuid::Uuid::new_v4().to_string());
        std::fs::create_dir_all(&directory).unwrap();
        let directory = directory.canonicalize().unwrap();
        let mut child = Command::new(env!("CARGO_BIN_EXE_jait-gateway"))
            .env_clear()
            .env("HOME", &directory)
            .env("JAIT_RUST_APPLICATION", "1")
            .env("JAIT_RUST_PORT", "0")
            .env("JAIT_RUST_PROJECT_ROOT", &directory)
            .env("JAIT_RUST_DB", directory.join("gateway.sqlite"))
            .env("JWT_SECRET", "isolated-binary-mobile-test-secret")
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
async fn mobile_device_flow_runs_through_the_binary() {
    let gateway = Gateway::start();
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(45))
        .build()
        .unwrap();
    let url = |path: &str| format!("{}{path}", gateway.base);
    let response = client
        .get(url("/api/mobile/discovery"))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    assert_eq!(
        response.json::<Value>().await.unwrap()["name"],
        "jait-gateway"
    );
    let forbidden = client
        .get(url("/api/mobile/discovery"))
        .header("origin", "https://untrusted.example")
        .send()
        .await
        .unwrap();
    assert_eq!(forbidden.status(), 403);
    assert_eq!(
        forbidden.json::<Value>().await.unwrap()["error"],
        "ORIGIN_FORBIDDEN"
    );

    let register = url("/api/mobile/devices/register");
    let unauthorized = client
        .post(&register)
        .json(&json!({"id":"intruder", "name":"Intruder", "platform":"mobile"}))
        .send()
        .await
        .unwrap();
    assert_eq!(unauthorized.status(), 401);
    // Authentication precedes both payload parsing and push registration.
    assert_eq!(
        client
            .post(&register)
            .header("content-type", "application/json")
            .body("{")
            .send()
            .await
            .unwrap()
            .status(),
        401
    );
    assert_eq!(
        client
            .post(&register)
            .json(&json!({
                "id":"intruder-push", "name":"Intruder", "platform":"mobile",
                "pushToken":"untrusted"
            }))
            .send()
            .await
            .unwrap()
            .status(),
        401
    );
    let response = client
        .post(url("/api/auth/register"))
        .json(&json!({"username":"owner", "password":"owner-pass-123"}))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    let cookie = response
        .headers()
        .get("set-cookie")
        .unwrap()
        .to_str()
        .unwrap()
        .split(';')
        .next()
        .unwrap()
        .to_owned();
    let account = response.json::<Value>().await.unwrap();
    let token = account["access_token"].as_str().unwrap();
    let list_url = url("/api/mobile/devices");
    assert_eq!(
        client
            .get(&list_url)
            .header("cookie", &cookie)
            .send()
            .await
            .unwrap()
            .status(),
        200
    );
    assert_eq!(
        client
            .get(&list_url)
            .header("cookie", &cookie)
            .header("origin", "https://untrusted.example")
            .send()
            .await
            .unwrap()
            .status(),
        403
    );
    // An invalid bearer token must not fall back to a valid session cookie.
    assert_eq!(
        client
            .get(&list_url)
            .header("cookie", &cookie)
            .bearer_auth("invalid")
            .send()
            .await
            .unwrap()
            .status(),
        401
    );
    let invalid = client
        .post(&register)
        .bearer_auth(token)
        .json(&json!({"id":"phone"}))
        .send()
        .await
        .unwrap();
    assert_eq!(invalid.status(), 400);
    let response = client
        .post(&register)
        .bearer_auth(token)
        .json(&json!({
            "id":" phone ", "name":" My phone ", "platform":"mobile", "capabilities":["camera", 7]
        }))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    let device = response.json::<Value>().await.unwrap()["device"].clone();
    assert_eq!(device["id"], "phone");
    assert_eq!(device["name"], "My phone");
    assert_eq!(device["capabilities"], json!(["camera", "7"]));
    assert!(device["lastSeenAt"].is_string());

    assert_eq!(client.get(&list_url).send().await.unwrap().status(), 401);
    let response = client
        .get(&list_url)
        .bearer_auth(token)
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    let devices = response.json::<Value>().await.unwrap();
    assert_eq!(devices["devices"].as_array().unwrap().len(), 1);
    assert_eq!(devices["devices"][0]["id"], "phone");

    let heartbeat = url("/api/mobile/devices/phone/heartbeat");
    assert_eq!(client.post(&heartbeat).send().await.unwrap().status(), 401);
    let response = client
        .post(&heartbeat)
        .bearer_auth(token)
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    assert_eq!(
        response.json::<Value>().await.unwrap()["device"]["id"],
        "phone"
    );
    assert_eq!(
        client
            .post(url("/api/mobile/devices/missing/heartbeat"))
            .bearer_auth(token)
            .send()
            .await
            .unwrap()
            .status(),
        404
    );
}
