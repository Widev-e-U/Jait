//! Public HTTP/SSE -> production main -> consent -> real file -> persisted history.
//! Only the external OpenAI-compatible model peer is scripted. No gateway exports
//! or dependency-injected test tools are invoked by these assertions.
#[allow(dead_code)]
#[path = "../src/client.rs"]
mod client;
#[allow(dead_code)]
#[path = "../src/fixture.rs"]
mod fixture;
#[allow(dead_code)]
#[path = "../src/provider_fixture.rs"]
mod provider_fixture;
use anyhow::{Context, Result, bail, ensure};
use provider_fixture::{LocalProvider, Reply};
use serde_json::{Value, json};
use std::{
    fs,
    io::Read,
    path::PathBuf,
    time::{Duration, Instant},
};

const CONTENT: &str = "order=42\r\nstatus=freigegeben α🙂\n$(literal); \\\n";
const PROMPT: &str = "migration-flow-input: write the supplied literal payload once";
const ANSWER: &str = "migration-flow-output: order 42 stored";
const CALL: &str = "flow-write-42";
struct Flow {
    gateway: fixture::Gateway,
    directory: PathBuf,
    project: PathBuf,
    token: String,
    session: String,
}
fn register(api: &client::Api, username: &str, invitation: Option<&str>) -> Result<String> {
    let response = api.request("POST", "/api/auth/register", None,
        Some(json!({"username":username,"password":"local-contract-password","invitation":invitation})))?;
    if matches!(response.status().as_u16(), 404 | 501) {
        bail!(
            "missing backend implementation: public registration required for chat-flow provisioning"
        );
    }
    ensure!(
        response.status() == 200,
        "public registration returned {}",
        response.status()
    );
    let value: Value = serde_json::from_slice(&client::bounded_body(response)?)?;
    client::string(&value, "access_token")
}
fn flow() -> Result<Flow> {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()?;
    let directory = root
        .join(".jait/artifacts/chat-flow")
        .join(uuid::Uuid::new_v4().to_string());
    let project = directory.join("project");
    fs::create_dir_all(project.join(".git"))?;
    let gateway = fixture::Gateway::start(&root, &directory, None)?;
    let token = register(&gateway.api, "flow-owner", None)?;
    let session = gateway.api.json(
        "POST",
        "/api/sessions",
        Some(&token),
        Some(json!({"name":"migration data flow","projectPath":project})),
        201,
    )?;
    Ok(Flow {
        gateway,
        directory,
        project,
        token,
        session: client::string(&session, "id")?,
    })
}
impl Flow {
    fn path(&self, suffix: &str) -> String {
        format!("/api/sessions/{}/{suffix}", self.session)
    }
    fn file(&self) -> PathBuf {
        self.project.join("order 42.txt")
    }
    fn args(&self) -> Value {
        json!({"path":self.file(),"content":CONTENT})
    }
    fn model(&self, replies: Vec<Reply>) -> Result<LocalProvider> {
        let peer = LocalProvider::start_chat(replies)?;
        self.gateway.api.json(
            "PATCH",
            "/api/auth/settings",
            Some(&self.token),
            Some(json!({
                "jait_backend":"omniroute", "chat_provider":"jait",
                "api_keys":{"OMNIROUTE_BASE_URL":format!("{}/v1",peer.base_url()),"OPENAI_MODEL":"migration-fixture","OMNIROUTE_API_KEY":"local-unused"}
            })),
            200,
        )?;
        Ok(peer)
    }
    fn start(&self, content: &str) -> Result<Sse> {
        Sse::open(self.gateway.api.request("POST", "/api/chat", Some(&self.token),
            Some(json!({"sessionId":self.session,"content":content,"provider":"jait","model":"migration-fixture","runtimeMode":"supervised"})))?)
    }
    fn pending(&self) -> Result<Value> {
        let deadline = Instant::now() + Duration::from_secs(5);
        loop {
            let list = self.gateway.api.json(
                "GET",
                &format!("/api/consent/pending/{}", self.session),
                Some(&self.token),
                None,
                200,
            )?;
            if let Some(request) = list["requests"].as_array().and_then(|v| v.first()) {
                return Ok(request.clone());
            }
            ensure!(
                Instant::now() < deadline,
                "tool never reached production consent manager"
            );
            std::thread::sleep(Duration::from_millis(10));
        }
    }
    fn decide(&self, request: &Value, approved: bool) -> Result<()> {
        self.gateway.api.json(
            "POST",
            &format!(
                "/api/consent/{}/{}",
                request["id"].as_str().context("consent id")?,
                if approved { "approve" } else { "reject" }
            ),
            Some(&self.token),
            Some(json!({"reason":"migration contract"})),
            200,
        )?;
        Ok(())
    }
    fn snapshot(&self) -> Result<Value> {
        self.gateway
            .api
            .json("GET", &self.path("messages"), Some(&self.token), None, 200)
    }
    fn save(&self, name: &str, value: &Value) -> Result<()> {
        fs::write(self.directory.join(name), serde_json::to_vec_pretty(value)?)?;
        Ok(())
    }
}
fn tool_reply(args: Value) -> Reply {
    Reply::sse(vec![
        json!({"choices":[{"delta":{"tool_calls":[{"index":0,"id":CALL,"type":"function","function":{"name":"file_write","arguments":args.to_string()}}]},"finish_reason":"tool_calls"}]}),
    ])
}
fn final_reply(text: &str) -> Reply {
    Reply::sse(vec![
        json!({"choices":[{"delta":{"content":text},"finish_reason":null}]}),
        json!({"choices":[{"delta":{},"finish_reason":"stop"}]}),
    ])
}
struct Sse {
    response: reqwest::blocking::Response,
}
impl Sse {
    fn open(response: reqwest::blocking::Response) -> Result<Self> {
        ensure!(
            response.status() == 200,
            "chat HTTP status {}",
            response.status()
        );
        ensure!(
            response.headers()["content-type"]
                .to_str()?
                .starts_with("text/event-stream"),
            "missing SSE content type"
        );
        Ok(Self { response })
    }
    fn next(&mut self) -> Result<(Option<u64>, Value)> {
        let mut frame = vec![];
        loop {
            let mut byte = [0];
            ensure!(self.response.read(&mut byte)? == 1, "premature SSE EOF");
            frame.push(byte[0]);
            ensure!(frame.len() <= 1_048_576, "SSE frame bound exceeded");
            if frame.ends_with(b"\n\n") {
                let text = String::from_utf8(std::mem::take(&mut frame))?;
                let id = text
                    .lines()
                    .find_map(|l| l.strip_prefix("id: "))
                    .map(str::parse)
                    .transpose()?;
                if let Some(data) = text.lines().find_map(|l| l.strip_prefix("data: ")) {
                    return Ok((id, serde_json::from_str(data)?));
                }
            }
        }
    }
    fn until(&mut self, kind: &str) -> Result<Vec<Value>> {
        let mut events = vec![];
        for _ in 0..256 {
            let (_, v) = self.next()?;
            let done = v["type"] == kind;
            events.push(v);
            if done {
                return Ok(events);
            }
        }
        bail!("stream did not reach {kind}")
    }
}
fn result(events: &[Value]) -> Result<&Value> {
    let found = events
        .iter()
        .filter(|v| v["type"] == "tool_result" && v["call_id"] == CALL)
        .collect::<Vec<_>>();
    ensure!(
        found.len() == 1,
        "expected exactly one correlated tool result"
    );
    Ok(found[0])
}
fn assert_completed(events: &[Value], answer: &str) -> Result<()> {
    ensure!(
        events.iter().filter(|v| v["type"] == "done").count() == 1,
        "exactly one completion required"
    );
    ensure!(
        !events.iter().any(|v| v["type"] == "error"),
        "unexpected error event"
    );
    let text = events
        .iter()
        .filter(|v| v["type"] == "token")
        .filter_map(|v| v["content"].as_str())
        .collect::<String>();
    ensure!(text == answer, "assistant content changed");
    Ok(())
}
fn provider_messages(
    requests: &[provider_fixture::RecordedRequest],
    index: usize,
) -> Result<Value> {
    let request = requests
        .iter()
        .filter(|r| {
            serde_json::from_slice::<Value>(&r.body)
                .ok()
                .is_some_and(|b| b["stream"] == true)
        })
        .nth(index)
        .context("missing streaming model request")?;
    ensure!(
        request.method == "POST" && request.path == "/v1/chat/completions",
        "wrong model route"
    );
    let body: Value = serde_json::from_slice(&request.body)?;
    ensure!(
        body["model"] == "migration-fixture",
        "settings did not reach model selection"
    );
    Ok(body["messages"].clone())
}
#[test]
fn approved_tool_data_survives_history_replay_restart_and_next_turn() -> Result<()> {
    let mut f = flow()?;
    let peer = f.model(vec![tool_reply(f.args()), final_reply(ANSWER)])?;
    let mut stream = f.start(PROMPT)?;
    let mut events = stream.until("tool_start")?;
    assert_eq!(events.last().unwrap()["args"], f.args());
    let consent = f.pending()?;
    assert_eq!(consent["toolName"], "file.write");
    assert!(!f.file().exists(), "tool ran before approval");
    f.decide(&consent, true)?;
    events.extend(stream.until("done")?);
    assert_completed(&events, ANSWER)?;
    let tool = result(&events)?;
    assert_eq!(tool["ok"], true);
    assert_eq!(tool["data"]["path"], json!(f.file()));
    assert_eq!(tool["data"]["size"], CONTENT.len());
    assert_eq!(fs::read(f.file())?, CONTENT.as_bytes());
    drop(stream);
    let requests = peer.finish()?;
    let first = provider_messages(&requests, 0)?;
    assert!(
        first
            .as_array()
            .unwrap()
            .iter()
            .any(|m| m["role"] == "user" && m["content"] == PROMPT)
    );
    let second = provider_messages(&requests, 1)?;
    let feedback = second
        .as_array()
        .unwrap()
        .iter()
        .find(|m| m["role"] == "tool" && m["tool_call_id"] == CALL)
        .context("tool result never reached next provider request")?;
    let feedback: Value = serde_json::from_str(
        feedback["content"]
            .as_str()
            .context("tool feedback content")?,
    )?;
    assert_eq!(feedback["ok"], true);
    assert_eq!(feedback["data"], tool["data"]);
    let before = f.snapshot()?;
    assert_eq!(before["streaming"], false);
    let messages = before["messages"].as_array().context("messages")?;
    assert_eq!(messages.len(), 2, "unexpected transcript row count");
    assert_eq!(messages[0]["role"], "user");
    assert_eq!(messages[0]["content"], PROMPT);
    assert_eq!(messages[1]["role"], "assistant");
    assert_eq!(messages[1]["content"], ANSWER);
    let persisted = &messages[1]["toolCalls"][0];
    assert_eq!(persisted["callId"], CALL);
    assert_eq!(persisted["args"], f.args());
    assert_eq!(persisted["data"], tool["data"]);
    assert_eq!(persisted["ok"], true);
    f.save(
        "completed.json",
        &json!({"events":events,"snapshot":before,"provider_messages":[first,second]}),
    )?;
    let response = reqwest::blocking::Client::builder()
        .no_proxy()
        .timeout(Duration::from_secs(10))
        .build()?
        .get(format!("{}{}", f.gateway.api.base, f.path("events")))
        .bearer_auth(&f.token)
        .header("Last-Event-ID", "0")
        .send()?;
    let mut replay = Sse::open(response)?;
    let mut durable = vec![];
    for _ in 0..256 {
        let (id, event) = replay.next()?;
        let done = event["type"] == "done";
        durable.push(json!({"id":id.context("durable event id")?,"event":event}));
        if done {
            break;
        }
    }
    ensure!(
        durable.last().is_some_and(|v| v["event"]["type"] == "done"),
        "replay completion missing"
    );
    let logged = durable
        .iter()
        .map(|v| v["event"].clone())
        .collect::<Vec<_>>();
    assert_eq!(result(&logged)?["data"], tool["data"]);
    let cursor = durable.first().unwrap()["id"].as_u64().unwrap();
    assert!(
        durable
            .windows(2)
            .all(|w| w[0]["id"].as_u64() < w[1]["id"].as_u64())
    );
    drop(replay);
    f.gateway.restart()?;
    let after = f.snapshot()?;
    assert_eq!(
        after["messages"], before["messages"],
        "restart changed persisted transcript"
    );
    assert_eq!(
        after["seq"], before["seq"],
        "restart changed durable cursor"
    );
    let response = reqwest::blocking::Client::builder()
        .no_proxy()
        .timeout(Duration::from_secs(10))
        .build()?
        .get(format!("{}{}", f.gateway.api.base, f.path("events")))
        .bearer_auth(&f.token)
        .header("Last-Event-ID", cursor.to_string())
        .send()?;
    let mut replay = Sse::open(response)?;
    for expected in durable.iter().skip(1) {
        let (id, event) = replay.next()?;
        assert_eq!(id, expected["id"].as_u64());
        assert_eq!(event, expected["event"]);
    }
    drop(replay);
    f.save(
        "restart-replay.json",
        &json!({"events":durable,"snapshot":after}),
    )?;
    let next = f.model(vec![final_reply("continued after restart")])?;
    let mut stream = f.start("migration-followup")?;
    assert_completed(&stream.until("done")?, "continued after restart")?;
    drop(stream);
    let requests = next.finish()?;
    let history = provider_messages(&requests, 0)?;
    let history = history.as_array().context("resumed provider messages")?;
    assert!(
        history
            .iter()
            .any(|m| m["role"] == "user" && m["content"] == PROMPT),
        "restart lost user context"
    );
    assert!(
        history
            .iter()
            .any(|m| m["role"] == "assistant" && m["content"] == ANSWER),
        "restart lost assistant context"
    );
    assert_eq!(fs::read(f.file())?, CONTENT.as_bytes());
    Ok(())
}
#[test]
fn rejected_tool_has_no_file_side_effect_and_reaches_provider_and_history() -> Result<()> {
    let f = flow()?;
    let peer = f.model(vec![tool_reply(f.args()), final_reply("write rejected")])?;
    let mut stream = f.start(PROMPT)?;
    let mut events = stream.until("tool_start")?;
    let consent = f.pending()?;
    assert!(!f.file().exists());
    f.decide(&consent, false)?;
    events.extend(stream.until("done")?);
    assert_completed(&events, "write rejected")?;
    let tool = result(&events)?;
    assert_eq!(tool["ok"], false);
    assert_eq!(tool["data"]["consentRejected"], true);
    assert!(!f.file().exists(), "rejected tool wrote to disk");
    drop(stream);
    let requests = peer.finish()?;
    let messages = provider_messages(&requests, 1)?;
    assert!(messages.as_array().unwrap().iter().any(|m| {
        m["role"] == "tool"
            && m["tool_call_id"] == CALL
            && m["content"]
                .as_str()
                .unwrap_or("")
                .contains("consentRejected")
    }));
    let snapshot = f.snapshot()?;
    let tc = &snapshot["messages"][1]["toolCalls"][0];
    assert_eq!(tc["ok"], false);
    assert_eq!(tc["data"]["consentRejected"], true);
    f.save(
        "rejected.json",
        &json!({"events":events,"snapshot":snapshot}),
    )?;
    Ok(())
}
#[test]
fn foreign_user_cannot_approve_cancel_or_read_another_users_tool_flow() -> Result<()> {
    let f = flow()?;
    let invitation = f.gateway.api.json(
        "POST",
        "/api/auth/invitations",
        Some(&f.token),
        Some(json!({})),
        200,
    )?;
    let foreign = register(
        &f.gateway.api,
        "flow-foreign",
        invitation["invitation"].as_str(),
    )?;
    let peer = f.model(vec![tool_reply(f.args()), final_reply(ANSWER)])?;
    let input = Some(
        json!({"sessionId":f.session,"content":"unauthorized input","provider":"jait","model":"migration-fixture","runtimeMode":"supervised"}),
    );
    f.gateway
        .api
        .expect("POST", "/api/chat", None, input.clone(), 401)?;
    f.gateway
        .api
        .expect("POST", "/api/chat", Some(&foreign), input, 404)?;
    assert_eq!(
        f.snapshot()?["messages"],
        json!([]),
        "unauthorized request mutated history"
    );
    let mut stream = f.start(PROMPT)?;
    let mut events = stream.until("tool_start")?;
    let consent = f.pending()?;
    let consent_path = format!("/api/consent/{}/approve", consent["id"].as_str().unwrap());
    f.gateway
        .api
        .expect("POST", &consent_path, None, Some(json!({})), 401)?;
    f.gateway
        .api
        .expect("POST", &consent_path, Some(&foreign), Some(json!({})), 404)?;
    for suffix in ["messages", "events", "stream"] {
        f.gateway
            .api
            .expect("GET", &f.path(suffix), Some(&foreign), None, 404)?;
    }
    f.gateway
        .api
        .expect("POST", &f.path("cancel"), Some(&foreign), None, 404)?;
    assert!(!f.file().exists(), "foreign decision executed tool");
    assert_eq!(f.pending()?["id"], consent["id"]);
    f.decide(&consent, true)?;
    events.extend(stream.until("done")?);
    assert_completed(&events, ANSWER)?;
    drop(stream);
    peer.finish()?;
    assert_eq!(fs::read(f.file())?, CONTENT.as_bytes());
    Ok(())
}
#[test]
fn cancellation_during_consent_prevents_late_approval_side_effects() -> Result<()> {
    let f = flow()?;
    let peer = f.model(vec![tool_reply(f.args())])?;
    let mut stream = f.start(PROMPT)?;
    let mut events = stream.until("tool_start")?;
    let consent = f.pending()?;
    assert!(!f.file().exists());
    assert_eq!(
        f.gateway
            .api
            .json("POST", &f.path("cancel"), Some(&f.token), None, 200)?["cancelled"],
        true
    );
    events.extend(stream.until("done")?);
    ensure!(
        !events.iter().any(|v| v["type"] == "error"),
        "cancelled turn emitted error"
    );
    drop(stream);
    // Accept implementations that invalidate pending consent, or retain a guarded
    // request. Both must prevent the already-cancelled tool from touching disk.
    let response = f.gateway.api.request(
        "POST",
        &format!("/api/consent/{}/approve", consent["id"].as_str().unwrap()),
        Some(&f.token),
        Some(json!({})),
    )?;
    ensure!(
        matches!(response.status().as_u16(), 200 | 404),
        "late decision unexpected status"
    );
    peer.finish()?;
    let snapshot = f.snapshot()?;
    assert_eq!(snapshot["streaming"], false);
    assert!(!f.file().exists(), "late approval ran cancelled tool");
    f.save(
        "cancelled-consent.json",
        &json!({"events":events,"snapshot":snapshot}),
    )?;
    Ok(())
}
