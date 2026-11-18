//! Calendar routes through the production binary.
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
            .join("../../.jait/artifacts/binary-calendar-tests")
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
async fn calendar_routes_through_the_binary() {
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

    let o = owner.clone();
    let x = other.clone();
    let (st, _) = call(M::GET, "/api/calendar/config".into(), String::new(), None).await;
    assert_eq!(st, 401);

    let (st, b) = call(M::GET, "/api/calendar/config".into(), o.clone(), None).await;
    assert!(st == 200 && b["providers"]["google"] == false, "{b}");
    let (st, _) = call(
        M::POST,
        "/api/calendar/config/google".into(),
        o.clone(),
        Some(json!({})),
    )
    .await;
    assert_eq!(st, 400);
    let (st, b) = call(
        M::POST,
        "/api/calendar/config/google".into(),
        o.clone(),
        Some(json!({"clientId":"id","clientSecret":"secret"})),
    )
    .await;
    assert!(st == 200 && b["ok"] == true, "{b}");
    let (_, b) = call(M::GET, "/api/calendar/config".into(), o.clone(), None).await;
    assert_eq!(b["providers"]["google"], true, "{b}");
    let (_, b) = call(M::GET, "/api/calendar/config".into(), x.clone(), None).await;
    assert_eq!(b["providers"]["google"], false, "{b}");

    let (st, b) = call(M::GET, "/api/calendar/accounts".into(), o.clone(), None).await;
    assert!(st == 200 && b["accounts"] == json!([]), "{b}");
    let (st, _) = call(
        M::POST,
        "/api/calendar/device/sync".into(),
        o.clone(),
        Some(json!({})),
    )
    .await;
    assert_eq!(st, 400);
    // A failed snapshot write must roll back the account.
    let db = rusqlite::Connection::open(gateway.directory.join("gateway.sqlite")).unwrap();
    db.execute_batch("CREATE TRIGGER reject_snapshot BEFORE INSERT ON device_calendar_snapshots BEGIN SELECT RAISE(ABORT, 'injected failure'); END;").unwrap();
    let (st, _) = call(
        M::POST,
        "/api/calendar/device/sync".into(),
        o.clone(),
        Some(json!({"deviceId":"failed","calendars":[],"events":[]})),
    )
    .await;
    assert_eq!(st, 500);
    let (_, accounts) = call(M::GET, "/api/calendar/accounts".into(), o.clone(), None).await;
    assert_eq!(accounts["accounts"], json!([]));
    db.execute_batch("DROP TRIGGER reject_snapshot").unwrap();

    let (st, b) = call(
        M::POST,
        "/api/calendar/device/sync".into(),
        o.clone(),
        Some(json!({"deviceId":"dev-1","deviceName":"Phone","calendars":[{"id":"work"}],"events":[{"id":"later","calendarId":"work","title":"Planning","start":"2030-01-03T10:00:00.000Z","end":"2030-01-03T11:00:00.000Z"},{"id":"earlier","calendarId":"work","title":"Planning","start":"2030-01-02T10:00:00.000Z","end":"2030-01-02T11:00:00.000Z"}]})),
    )
    .await;
    assert_eq!(st, 200, "{b}");
    let account_id = b["account"]["id"].as_str().unwrap().to_owned();
    db.execute_batch("CREATE TRIGGER reject_snapshot_update BEFORE UPDATE ON device_calendar_snapshots BEGIN SELECT RAISE(ABORT, 'injected failure'); END;").unwrap();
    let (st, _) = call(
        M::POST,
        "/api/calendar/device/sync".into(),
        o.clone(),
        Some(json!({"deviceId":"dev-1","deviceName":"Changed","calendars":[],"events":[]})),
    )
    .await;
    assert_eq!(st, 500);
    let (_, accounts) = call(M::GET, "/api/calendar/accounts".into(), o.clone(), None).await;
    assert_eq!(accounts["accounts"][0]["displayName"], "Phone");
    db.execute_batch("DROP TRIGGER reject_snapshot_update")
        .unwrap();
    let (_, b) = call(M::GET, "/api/calendar/accounts".into(), o.clone(), None).await;
    assert_eq!(b["accounts"].as_array().unwrap().len(), 1, "{b}");
    let (_, b) = call(M::GET, "/api/calendar/accounts".into(), x.clone(), None).await;
    assert_eq!(b["accounts"], json!([]), "{b}");

    let (st, b) = call(M::GET, "/api/calendar/calendars".into(), o.clone(), None).await;
    assert_eq!(st, 200);
    assert_eq!(b["calendars"], json!([{"id":"work"}]));
    let (st, b) = call(
        M::GET,
        "/api/calendar/events?timeMin=2030-01-01T00%3A00%3A00Z&timeMax=2030-01-05T00%3A00%3A00Z&calendarId=work&q=planning&limit=1".into(),
        o.clone(),
        None,
    )
    .await;
    assert_eq!(st, 200);
    assert_eq!(b["events"].as_array().unwrap().len(), 1);
    assert_eq!(b["events"][0]["id"], "earlier");
    let (st, _) = call(
        M::GET,
        "/api/calendar/connect/google".into(),
        o.clone(),
        None,
    )
    .await;
    assert!(st == 200 || st == 400);

    let response = client
        .get(url("/api/calendar/oauth/callback"))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    assert!(
        response
            .text()
            .await
            .unwrap()
            .contains("Missing authorization code")
    );

    let (st, _) = call(
        M::DELETE,
        format!("/api/calendar/accounts/{account_id}"),
        x.clone(),
        None,
    )
    .await;
    assert_eq!(st, 404);
    let (st, b) = call(
        M::DELETE,
        format!("/api/calendar/accounts/{account_id}"),
        o.clone(),
        None,
    )
    .await;
    assert!(st == 200 && b["ok"] == true, "{b}");
    let (st, _) = call(
        M::DELETE,
        format!("/api/calendar/accounts/{account_id}"),
        o.clone(),
        None,
    )
    .await;
    assert_eq!(st, 404);
}
