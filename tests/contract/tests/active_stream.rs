//! Rust reads actual socket bytes and owns every behavioral oracle.
#[allow(dead_code)]
#[path = "../src/client.rs"]
mod client;
#[allow(dead_code)]
#[path = "../src/fixture.rs"]
mod fixture;
use anyhow::{Result, ensure};
use serde_json::{Value, json};
use std::{fs, io::Read, path::PathBuf};

struct Sse {
    response: reqwest::blocking::Response,
}
impl Sse {
    fn open(response: reqwest::blocking::Response) -> Self {
        assert_eq!(response.status(), 200);
        assert!(
            response.headers()["content-type"]
                .to_str()
                .unwrap()
                .starts_with("text/event-stream")
        );
        Self { response }
    }
    fn next(&mut self) -> Result<(Option<u64>, Value)> {
        let mut frame = Vec::new();
        loop {
            let mut byte = [0];
            ensure!(self.response.read(&mut byte)? == 1, "premature SSE EOF");
            frame.push(byte[0]);
            ensure!(frame.len() < 1_048_576, "SSE frame exceeds bound");
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
        let mut events = Vec::new();
        for _ in 0..200 {
            let (_, event) = self.next()?;
            let done = event["type"] == kind;
            events.push(event);
            if done {
                return Ok(events);
            }
        }
        anyhow::bail!("event bound exceeded waiting for {kind}")
    }
}
fn ordered(events: &[Value]) -> Result<()> {
    for kind in ["tool_start", "tool_result", "done"] {
        ensure!(
            events.iter().filter(|event| event["type"] == kind).count() == 1,
            "expected exactly one {kind} event"
        );
    }
    let tokens: String = events
        .iter()
        .filter(|e| e["type"] == "token")
        .filter_map(|e| e["content"].as_str())
        .collect();
    ensure!(tokens == "α🙂β終", "token order/content mismatch");
    let start = events
        .iter()
        .position(|e| e["type"] == "tool_start")
        .ok_or_else(|| anyhow::anyhow!("missing tool_start"))?;
    let result = events
        .iter()
        .position(|e| e["type"] == "tool_result")
        .ok_or_else(|| anyhow::anyhow!("missing tool_result"))?;
    ensure!(start < result, "tool result before start");
    ensure!(
        events[start]["call_id"] == events[result]["call_id"],
        "tool correlation mismatch"
    );
    ensure!(events[result]["ok"] == true, "tool failed");
    ensure!(
        events.last().unwrap()["type"] == "done",
        "missing terminal done"
    );
    Ok(())
}
fn stream_fixture() -> Result<(PathBuf, fixture::Gateway, Value, String)> {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()?;
    let directory = root
        .join(".jait/artifacts/rust-continuation/active-stream")
        .join(uuid::Uuid::new_v4().to_string());
    fs::create_dir_all(&directory)?;
    let default_argv = json!([
        std::env::var("JAIT_CONTRACT_BUN").unwrap_or("bun".into()),
        "--no-env-file",
        root.join("tests/contract/drivers/active-stream.ts")
    ])
    .to_string();
    let argv = match std::env::var("JAIT_CONTRACT_ACTIVE_STREAM_ARGV") {
        Ok(argv) => argv,
        Err(_) => {
            ensure!(
                std::env::var_os("JAIT_CONTRACT_BACKEND_ARGV").is_none(),
                "active_stream requires JAIT_CONTRACT_ACTIVE_STREAM_ARGV; generic backend selection cannot provision its controls"
            );
            default_argv
        }
    };
    let gateway = fixture::Gateway::start_owned_command(&root, &directory, &argv)?;
    let identity: Value = serde_json::from_slice(&fs::read(directory.join("identity.json"))?)?;
    Ok((directory, gateway, identity, argv))
}
#[test]
fn active_stream_loopback_contract() -> Result<()> {
    let (directory, mut gateway, identity, argv) = stream_fixture()?;
    let token = identity["token"].as_str().unwrap();
    let session = identity["session"].as_str().unwrap();
    let path = |suffix: &str| format!("/api/sessions/{session}/{suffix}");
    let mut stream = Sse::open(gateway.api.request(
        "POST",
        "/api/chat",
        Some(token),
        Some(json!({"sessionId":session,"content":"Use proof.ok once","model":"gpt-4o"})),
    )?);
    let mut events = stream.until("token")?;
    assert_eq!(events.last().unwrap()["content"], "α🙂");
    // Provider cannot emit β until Rust has received α🙂 through the HTTP socket.
    assert_eq!(
        gateway
            .api
            .json("GET", "/__fixture/requests", None, None, 200)?["calls"],
        1
    );
    let mut resumed = Sse::open(
        gateway
            .api
            .request("GET", &path("stream"), Some(token), None)?,
    );
    let (_, snapshot) = resumed.next()?;
    assert_eq!(snapshot["type"], "snapshot");
    assert_eq!(snapshot["streaming"], true);
    assert!(snapshot.to_string().contains("α🙂"));
    // Open durable replay while the provider is gated, then overlap live emission.
    let live_client = reqwest::blocking::Client::builder()
        .no_proxy()
        .timeout(std::time::Duration::from_secs(10))
        .build()?;
    let mut live = Sse::open(
        live_client
            .get(format!("{}{}", gateway.api.base, path("events")))
            .bearer_auth(token)
            .header("Last-Event-ID", "0")
            .send()?,
    );
    let mut live_events = Vec::new();
    loop {
        let (id, event) = live.next()?;
        let token_seen = event["type"] == "token" && event["content"] == "α🙂";
        live_events.push(json!({"id":id,"event":event}));
        ensure!(
            live_events.len() < 200,
            "replay did not reach current token"
        );
        if token_seen {
            break;
        }
    }
    gateway.api.json(
        "POST",
        &path("steer"),
        Some(token),
        Some(json!({"message":"steering-must-reach-provider"})),
        200,
    )?;
    for suffix in ["stream", "events", "trajectory"] {
        gateway.api.expect("GET", &path(suffix), None, None, 401)?;
        gateway.api.expect(
            "GET",
            &path(suffix),
            identity["foreignToken"].as_str(),
            None,
            404,
        )?;
    }
    drop(stream); // transport disconnect must not cancel the active turn
    gateway
        .api
        .json("POST", "/__fixture/release", None, None, 200)?;
    events.extend(resumed.until("done")?);
    ordered(&events)?;
    loop {
        let (id, event) = live.next()?;
        let done = event["type"] == "done";
        live_events.push(json!({"id":id,"event":event}));
        ensure!(
            live_events.len() < 200,
            "live completion exceeded event bound"
        );
        if done {
            break;
        }
    }
    let ids = live_events
        .iter()
        .map(|e| e["id"].as_u64().expect("durable ID"))
        .collect::<Vec<_>>();
    ensure!(
        ids.windows(2).all(|pair| pair[0] < pair[1]),
        "duplicate/out-of-order replay-live handoff"
    );
    ordered(
        &live_events
            .iter()
            .map(|e| e["event"].clone())
            .collect::<Vec<_>>(),
    )?;
    let provider_requests = gateway
        .api
        .json("GET", "/__fixture/requests", None, None, 200)?;
    ensure!(
        provider_requests["requests"][1]["messages"]
            .to_string()
            .contains("steering-must-reach-provider"),
        "accepted steering never reached the next provider request"
    );
    fs::write(
        directory.join("live-handoff.json"),
        serde_json::to_vec_pretty(&live_events)?,
    )?;
    drop(live);
    fs::write(
        directory.join("events.json"),
        serde_json::to_vec_pretty(&events)?,
    )?;
    let mut dropped = events.clone();
    dropped.retain(|e| e["content"] != "β");
    assert!(
        ordered(&dropped)
            .unwrap_err()
            .to_string()
            .contains("token order/content mismatch")
    );
    let mut reordered = events.clone();
    let a = reordered
        .iter()
        .position(|e| e["type"] == "tool_start")
        .unwrap();
    let b = reordered
        .iter()
        .position(|e| e["type"] == "tool_result")
        .unwrap();
    reordered.swap(a, b);
    assert!(
        ordered(&reordered).is_err(),
        "reordered tool control survived"
    );
    duplicate_controls(&events);
    // The shipping durable endpoint supports Last-Event-ID independently of /stream.
    let replay_client = reqwest::blocking::Client::builder()
        .no_proxy()
        .timeout(std::time::Duration::from_secs(5))
        .build()?;
    let replay = |base: &str, cursor: u64| -> Result<Sse> {
        Ok(Sse::open(
            replay_client
                .get(format!("{base}{}", path("events")))
                .bearer_auth(token)
                .header("Last-Event-ID", cursor.to_string())
                .send()?,
        ))
    };
    let mut durable = replay(&gateway.api.base, 0)?;
    let mut logged = Vec::new();
    let mut cursor = 0;
    loop {
        let (id, event) = durable.next()?;
        let id = id.expect("durable event ID");
        assert!(id > cursor, "durable IDs must strictly increase");
        cursor = id;
        assert_eq!(event["replay"], true);
        let done = event["type"] == "done";
        logged.push(json!({"id":id,"event":event}));
        assert!(logged.len() < 200);
        if done {
            break;
        }
    }
    let mid = logged
        .iter()
        .find(|e| e["event"]["content"] == "α🙂")
        .unwrap()["id"]
        .as_u64()
        .unwrap();
    drop(durable);
    fs::write(
        directory.join("durable.json"),
        serde_json::to_vec_pretty(&logged)?,
    )?;
    // Restart preserves completed history, but no process-local active execution.
    gateway.restart()?;
    let mut replayed = replay(&gateway.api.base, mid)?;
    for expected in logged.iter().filter(|e| e["id"].as_u64().unwrap() > mid) {
        let (id, event) = replayed.next()?;
        assert_eq!(id, expected["id"].as_u64());
        assert_eq!(event, expected["event"], "restart replay changed event");
    }
    drop(replayed);
    let mut after = Sse::open(
        gateway
            .api
            .request("GET", &path("stream"), Some(token), None)?,
    );
    let (_, snapshot) = after.next()?;
    assert_eq!(snapshot["streaming"], false);
    assert!(snapshot.to_string().contains("終"));
    assert_eq!(after.next()?.1["type"], "done");
    assert_eq!(
        gateway.api.json(
            "POST",
            &path("steer"),
            Some(token),
            Some(json!({"message":"late"})),
            409
        )?["error"],
        "CONFLICT"
    );
    // New process resets provider gate: hold a live turn, steer it, then cancel.
    let mut cancel = Sse::open(gateway.api.request(
        "POST",
        "/api/chat",
        Some(token),
        Some(json!({"sessionId":session,"content":"hold for cancellation","model":"gpt-4o"})),
    )?);
    cancel.until("token")?;
    assert_eq!(
        gateway.api.json(
            "POST",
            &path("steer"),
            Some(token),
            Some(json!({"message":"steering-proof"})),
            200
        )?["steered"],
        true
    );
    let mut steered = Sse::open(
        gateway
            .api
            .request("GET", &path("stream"), Some(token), None)?,
    );
    assert!(steered.next()?.1.to_string().contains("steering-proof"));
    drop(steered);
    assert_eq!(
        gateway
            .api
            .json("POST", &path("cancel"), Some(token), None, 200)?["cancelled"],
        true
    );
    let cancelled = cancel.until("done")?;
    assert!(!cancelled.iter().any(|e| e["type"] == "error"));
    assert!(!cancelled.iter().any(|e| e["content"] == "β"));
    assert_eq!(
        gateway
            .api
            .json("POST", &path("cancel"), Some(token), None, 200)?["cancelled"],
        false
    );
    fs::write(
        directory.join("cancel.json"),
        serde_json::to_vec_pretty(&cancelled)?,
    )?;
    gateway.restart()?;
    let mut interrupted = Sse::open(gateway.api.request(
        "POST",
        "/api/chat",
        Some(token),
        Some(json!({"sessionId":session,"content":"restart while held","model":"gpt-4o"})),
    )?);
    interrupted.until("token")?;
    gateway.restart()?; // owned process group is killed with a live provider/socket
    assert!(
        interrupted.until("done").is_err(),
        "killed turn fabricated successful completion"
    );
    let mut recovered = Sse::open(gateway.api.request(
        "GET",
        &path("stream"),
        Some(token),
        None,
    )?);
    assert_eq!(recovered.next()?.1["streaming"], false);
    assert_eq!(recovered.next()?.1["type"], "done");
    fs::write(
        directory.join("result.json"),
        serde_json::to_vec_pretty(&json!({
            "status":"passed", "backend_argv":serde_json::from_str::<Value>(&argv)?,
            "negative_controls":["dropped β rejected", "tool result before start rejected"],
            "restart_completed_replay":true, "restart_active_not_resumed":true
        }))?,
    )?;
    Ok(())
}

fn duplicate_controls(events: &[Value]) {
    for kind in ["tool_start", "tool_result", "done"] {
        let original = events
            .iter()
            .find(|event| event["type"] == kind)
            .unwrap()
            .clone();
        let mut duplicate = events.to_vec();
        duplicate.insert(duplicate.len() - 1, original);
        assert!(
            ordered(&duplicate).is_err(),
            "duplicate {kind} control survived"
        );
    }
}
#[test]
fn stream_oracle_rejects_duplicate_tool_and_completion_events() {
    let trace = vec![
        json!({"type":"token","content":"α🙂β終"}),
        json!({"type":"tool_start","call_id":"proof"}),
        json!({"type":"tool_result","call_id":"proof","ok":true}),
        json!({"type":"done"}),
    ];
    assert!(ordered(&trace).is_ok());
    duplicate_controls(&trace);
}
#[test]
fn provider_failure_and_tool_failure_reach_terminal_events() -> Result<()> {
    for mode in ["provider-error", "tool-error"] {
        let (directory, mut gateway, identity, _) = stream_fixture()?;
        let token = identity["token"].as_str().unwrap();
        let session = identity["session"].as_str().unwrap();
        gateway.api.json(
            "POST",
            "/__fixture/mode",
            None,
            Some(json!({"mode":mode})),
            200,
        )?;
        let mut stream = Sse::open(gateway.api.request(
            "POST",
            "/api/chat",
            Some(token),
            Some(json!({"sessionId":session,"content":"failure fixture","model":"gpt-4o"})),
        )?);
        let mut events = Vec::new();
        if mode == "tool-error" {
            events.extend(stream.until("token")?);
            gateway
                .api
                .json("POST", "/__fixture/release", None, None, 200)?;
        }
        let terminal = if mode == "provider-error" {
            "error"
        } else {
            "done"
        };
        events.extend(stream.until(terminal)?);
        ensure!(
            events.iter().filter(|e| e["type"] == terminal).count() == 1,
            "terminal event cardinality"
        );
        if mode == "provider-error" {
            ensure!(
                stream
                    .next()
                    .unwrap_err()
                    .to_string()
                    .contains("premature SSE EOF"),
                "error terminal did not close stream"
            );
            ensure!(
                !events.iter().any(|e| e["type"] == "done"),
                "provider failure fabricated success"
            );
        } else {
            ensure!(
                events
                    .iter()
                    .any(|e| e["type"] == "tool_result" && e["ok"] == false),
                "tool error swallowed"
            );
        }
        fs::write(
            directory.join(format!("{mode}.json")),
            serde_json::to_vec_pretty(&events)?,
        )?;
        gateway.stop()?;
    }
    Ok(())
}
#[test]
fn cold_and_invalid_cursor_subscribers_receive_only_the_new_turn() -> Result<()> {
    let (_directory, mut gateway, identity, _) = stream_fixture()?;
    let token = identity["token"].as_str().unwrap();
    let session = identity["session"].as_str().unwrap();
    let input = json!({"sessionId":session,"content":"first completed turn","model":"gpt-4o"});
    let mut initial = Sse::open(gateway.api.request(
        "POST",
        "/api/chat",
        Some(token),
        Some(input),
    )?);
    initial.until("token")?;
    gateway
        .api
        .json("POST", "/__fixture/release", None, None, 200)?;
    initial.until("done")?;
    drop(initial);
    gateway.restart()?;
    // No snapshot request seeds the counter before these cold subscribers.
    let client = reqwest::blocking::Client::builder()
        .no_proxy()
        .timeout(std::time::Duration::from_secs(10))
        .build()?;
    let url = format!("{}/api/sessions/{session}/events", gateway.api.base);
    let mut cold = Sse::open(client.get(&url).bearer_auth(token).send()?);
    let mut invalid = Sse::open(
        client
            .get(&url)
            .bearer_auth(token)
            .header("Last-Event-ID", "invalid-cursor")
            .send()?,
    );
    let mut turn = Sse::open(gateway.api.request(
        "POST",
        "/api/chat",
        Some(token),
        Some(json!({"sessionId":session,"content":"new turn only","model":"gpt-4o"})),
    )?);
    turn.until("token")?;
    for s in [&mut cold, &mut invalid] {
        let (_, first) = s.next()?;
        ensure!(
            first["type"] == "request" && first["replay"] != true,
            "cold/invalid cursor replayed stale history: {first}"
        );
        let rest = s.until("token")?;
        ensure!(
            rest.last().unwrap()["content"] == "α🙂",
            "new turn token missing"
        );
    }
    gateway.api.json(
        "POST",
        &format!("/api/sessions/{session}/cancel"),
        Some(token),
        None,
        200,
    )?;
    turn.until("done")?;
    gateway.stop()?;
    Ok(())
}
#[test]
fn unread_client_does_not_prevent_bounded_cancellation() -> Result<()> {
    let (directory, mut gateway, identity, _) = stream_fixture()?;
    let token = identity["token"].as_str().unwrap();
    let session = identity["session"].as_str().unwrap();
    gateway.api.json(
        "POST",
        "/__fixture/mode",
        None,
        Some(json!({"mode":"flood"})),
        200,
    )?;
    let unread = Sse::open(gateway.api.request(
        "POST",
        "/api/chat",
        Some(token),
        Some(
            json!({"sessionId":session,"content":"bounded slow-consumer fixture","model":"gpt-4o"}),
        ),
    )?);
    // The response body is deliberately never consumed. The producer has a hard
    // 16 MiB ceiling, so a failure cannot run indefinitely or exhaust the host.
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(8);
    loop {
        let stats = gateway
            .api
            .json("GET", "/__fixture/requests", None, None, 200)?;
        if stats["producedBytes"].as_u64().unwrap() >= 2 * 1024 * 1024 {
            break;
        }
        ensure!(
            std::time::Instant::now() < deadline,
            "producer did not reach slow-socket trigger"
        );
        std::thread::sleep(std::time::Duration::from_millis(10));
    }
    let started = std::time::Instant::now();
    let cancelled = gateway.api.json(
        "POST",
        &format!("/api/sessions/{session}/cancel"),
        Some(token),
        None,
        200,
    )?;
    ensure!(
        cancelled["cancelled"] == true,
        "slow client blocked cancellation"
    );
    let bound = std::time::Duration::from_secs(8);
    let stats = loop {
        let stats = gateway
            .api
            .json("GET", "/__fixture/requests", None, None, 200)?;
        if stats["producerCancelled"] == true {
            break stats;
        }
        ensure!(
            started.elapsed() < bound,
            "upstream producer did not observe cancellation within eight seconds"
        );
        std::thread::sleep(std::time::Duration::from_millis(10));
    };
    ensure!(
        stats["producedBytes"].as_u64().unwrap() < 16 * 1024 * 1024,
        "producer hit fixture ceiling before cancellation"
    );
    fs::write(
        directory.join("slow-consumer.json"),
        serde_json::to_vec_pretty(
            &json!({"stats":stats,"cancel_ms":started.elapsed().as_millis(),"producer_limit_bytes":16*1024*1024,"not_proven":"unbounded-stream memory/backpressure guarantee"}),
        )?,
    )?;
    drop(unread);
    gateway.stop()?;
    Ok(())
}
