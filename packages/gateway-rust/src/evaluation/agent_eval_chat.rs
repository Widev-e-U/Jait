//! Isolated evaluation chat transport. Callers must retain and stop the isolated
//! gateway after all runs; public gateway fields require an authority review.
use super::agent_eval::EventParser;
use super::isolated_gateway::IsolatedGateway;
use serde::Serialize;
use serde_json::{Value, json};
use std::time::{Duration, Instant};
use tokio::sync::watch;
use url::Url;

#[derive(Debug, Clone)]
pub struct ChatOptions {
    pub model: String,
    pub judge_model: String,
    pub reasoning_effort: Option<String>,
    pub timeout: Duration,
    pub max_tool_calls: usize,
    pub max_trace_bytes: usize,
    pub cancel: Option<watch::Receiver<bool>>,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatRun {
    pub session_id: String,
    pub content: String,
    pub events: Vec<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    pub duration_ms: u128,
}
#[derive(Debug, Clone, Copy)]
pub enum Role {
    Worker,
    Judge,
}
impl Role {
    fn name(self) -> &'static str {
        match self {
            Self::Worker => "worker",
            Self::Judge => "judge",
        }
    }
}

// Session metadata is small; cap the actual streamed bytes even when the server
// omits or misstates Content-Length. The enclosing run timeout bounds time.
const MAX_SESSION_RESPONSE_BYTES: usize = 64 * 1024;

async fn read_session_response(mut response: reqwest::Response) -> Result<Value, String> {
    let mut body = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|e| e.to_string())? {
        if chunk.len() > MAX_SESSION_RESPONSE_BYTES.saturating_sub(body.len()) {
            return Err("Session response-size limit exceeded".into());
        }
        body.extend_from_slice(&chunk);
    }
    serde_json::from_slice(&body).map_err(|e| e.to_string())
}

async fn cancelled(signal: &mut Option<watch::Receiver<bool>>) {
    match signal {
        Some(rx) => loop {
            if *rx.borrow() {
                return;
            }
            if rx.changed().await.is_err() {
                std::future::pending::<()>().await;
            }
        },
        None => std::future::pending::<()>().await,
    }
}
fn js_string(value: Option<&Value>) -> String {
    match value {
        None | Some(Value::Null) => String::new(),
        Some(Value::String(s)) => s.clone(),
        Some(Value::Bool(b)) => b.to_string(),
        Some(Value::Number(n)) => ryu_js::Buffer::new()
            .format(n.as_f64().expect("finite JSON number"))
            .to_owned(),
        Some(Value::Array(a)) => a
            .iter()
            .map(|v| js_string(Some(v)))
            .collect::<Vec<_>>()
            .join(","),
        Some(Value::Object(_)) => "[object Object]".into(),
    }
}
fn accept(
    event: Value,
    run: &mut ChatRun,
    calls: &mut usize,
    limit: usize,
    done: &mut bool,
) -> Result<(), String> {
    run.events.push(event.clone());
    match event.get("type").and_then(Value::as_str).unwrap_or("") {
        "token" => run.content.push_str(&js_string(event.get("content"))),
        "content_rollback" => {
            if let Some(number) = event.get("contentLength").and_then(Value::as_f64) {
                let units: Vec<u16> = run.content.encode_utf16().collect();
                let end = if number < 0.0 {
                    (units.len() as f64 + number.trunc()).max(0.0) as usize
                } else {
                    (number.trunc() as usize).min(units.len())
                };
                // UTF-8 cannot retain an isolated UTF-16 surrogate. This is a known
                // compatibility gap when the rollback splits a surrogate pair.
                run.content = String::from_utf16_lossy(&units[..end]);
            }
        }
        "error" => {
            return Err(event
                .get("message")
                .filter(|v| !v.is_null())
                .map(|v| js_string(Some(v)))
                .unwrap_or_else(|| "Provider failed".into()));
        }
        "approval_required" | "user_question" => {
            return Err(
                "Run requires user input; respond in its Jait session and rerun this evaluation"
                    .into(),
            );
        }
        "tool_start" => {
            *calls += 1;
            if *calls > limit {
                return Err("Tool-call limit exceeded".into());
            }
        }
        "done" => *done = true,
        _ => {}
    }
    Ok(())
}
fn decode(buffer: &mut Vec<u8>, final_chunk: bool) -> String {
    if final_chunk {
        return String::from_utf8_lossy(&std::mem::take(buffer)).into_owned();
    }
    let keep = match std::str::from_utf8(buffer) {
        Ok(_) => 0,
        Err(error) if error.error_len().is_none() => buffer.len() - error.valid_up_to(),
        Err(_) => {
            // Retain only a potentially incomplete final sequence, while
            // replacing malformed bytes as TextDecoder does.
            let tail = buffer.len().saturating_sub(3);
            (tail..buffer.len())
                .find(|&i| {
                    std::str::from_utf8(&buffer[i..])
                        .is_err_and(|e| e.valid_up_to() == 0 && e.error_len().is_none())
                })
                .map_or(0, |i| buffer.len() - i)
        }
    };
    let rest = buffer.split_off(buffer.len() - keep);
    let text = String::from_utf8_lossy(buffer).into_owned();
    *buffer = rest;
    text
}

/// Runs a single chat using a loopback-only isolated gateway handle. Errors
/// trigger a separately bounded cancellation request and drop the stream.
pub async fn run_chat(
    gateway: &IsolatedGateway,
    options: &ChatOptions,
    workspace: &str,
    prompt: &str,
    role: Role,
    id: &str,
) -> ChatRun {
    let start = Instant::now();
    let mut run = ChatRun {
        session_id: String::new(),
        content: String::new(),
        events: Vec::new(),
        error: None,
        duration_ms: 0,
    };
    let mut session_request_started = false;
    let result: Result<(), String> = async {
        let base = Url::parse(&gateway.gateway).map_err(|e| e.to_string())?;
        if base.scheme() != "http" || base.host_str() != Some("127.0.0.1") || base.port().is_none() || !base.username().is_empty() || base.password().is_some() { return Err("Invalid isolated gateway endpoint".into()); }
        let client = reqwest::Client::builder().redirect(reqwest::redirect::Policy::none()).build().map_err(|e| e.to_string())?;
        let request = async {
            session_request_started = true;
            let session = client.post(base.join("/api/sessions").map_err(|e| e.to_string())?)
                .bearer_auth(&gateway.token).json(&json!({"name":format!("Eval {id} / {}", role.name()), "projectPath":workspace})).send().await.map_err(|e| e.to_string())?;
            if !session.status().is_success() { return Err(format!("Jait /api/sessions returned HTTP {}", session.status().as_u16())); }
            let session = read_session_response(session).await?;
            run.session_id = session.get("id").and_then(Value::as_str).filter(|s| !s.is_empty()).ok_or("Jait did not return a session id")?.to_owned();
            let mut body = json!({"sessionId":run.session_id, "content":prompt, "provider":"jait", "mode":if matches!(role, Role::Worker) {"agent"} else {"ask"}, "model":if matches!(role, Role::Worker) {&options.model} else {&options.judge_model}});
            if let Some(effort) = options.reasoning_effort.as_ref().filter(|s| !s.is_empty()) { body["reasoningEffort"] = json!(effort); }
            let mut response = client.post(base.join("/api/chat").map_err(|e| e.to_string())?).bearer_auth(&gateway.token).json(&body).send().await.map_err(|e| e.to_string())?;
            if !response.status().is_success() { return Err(format!("Jait /api/chat returned HTTP {}", response.status().as_u16())); }
            if !response.headers().get(reqwest::header::CONTENT_TYPE).and_then(|v| v.to_str().ok()).is_some_and(|v| v.contains("text/event-stream")) { return Err("Expected a Jait event stream".into()); }
            let mut parser = EventParser::default();
            let mut buffer = Vec::new(); let mut bytes = 0usize; let mut calls = 0usize; let mut done = false;
            while !done {
                let chunk = response.chunk().await.map_err(|e| e.to_string())?;
                let final_chunk = chunk.is_none();
                if let Some(chunk) = chunk {
                    bytes = bytes.saturating_add(chunk.len());
                    if bytes > options.max_trace_bytes { return Err("Trace-size limit exceeded; no partial trace will be graded".into()); }
                    buffer.extend_from_slice(&chunk);
                }
                for event in parser.push(&decode(&mut buffer, final_chunk), final_chunk)? { accept(event, &mut run, &mut calls, options.max_tool_calls, &mut done)?; }
                if final_chunk { break; }
            }
            if !done { return Err("Stream ended without a done event".into()); }
            Ok(())
        };
        let mut signal = options.cancel.clone();
        tokio::select! {
            result = tokio::time::timeout(options.timeout, request) => result.map_err(|_| "Evaluation timed out".to_string())?,
            _ = cancelled(&mut signal) => Err("Evaluation cancelled".into()),
        }
    }.await;
    if let Err(error) = result {
        run.error = Some(error);
        if run.session_id.is_empty() && session_request_started {
            run.events.push(json!({"type":"eval_cancel_error", "message":"Could not confirm gateway cancellation; session creation may have completed without returning an id"}));
        }
        if !run.session_id.is_empty() {
            let cancel = async {
                let mut url = Url::parse(&gateway.gateway).map_err(|e| e.to_string())?;
                url.set_path("/api/sessions/");
                url.path_segments_mut()
                    .map_err(|_| "invalid URL")?
                    .pop_if_empty()
                    .push(&run.session_id)
                    .push("cancel");
                let client = reqwest::Client::builder()
                    .redirect(reqwest::redirect::Policy::none())
                    .build()
                    .map_err(|e| e.to_string())?;
                let response = client
                    .post(url)
                    .bearer_auth(&gateway.token)
                    .json(&json!({}))
                    .send()
                    .await
                    .map_err(|e| e.to_string())?;
                if !response.status().is_success() {
                    return Err("cancel failed".into());
                }
                Ok::<(), String>(())
            };
            if !matches!(
                tokio::time::timeout(Duration::from_secs(5), cancel).await,
                Ok(Ok(()))
            ) {
                let message = format!(
                    "Could not confirm gateway cancellation; inspect session {}",
                    run.session_id
                );
                run.events
                    .push(json!({"type":"eval_cancel_error", "message":message}));
            }
        }
    }
    run.duration_ms = start.elapsed().as_millis();
    run
}

#[cfg(test)]
mod tests {
    use super::*;
    async fn session_response(body: Vec<u8>) -> Result<Value, String> {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut request = [0u8; 1024];
            let _ = socket.read(&mut request).await.unwrap();
            // Chunked encoding exercises the cap without a Content-Length header.
            socket
                .write_all(
                    b"HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n",
                )
                .await
                .unwrap();
            for chunk in body.chunks(4096) {
                socket
                    .write_all(format!("{:x}\r\n", chunk.len()).as_bytes())
                    .await
                    .unwrap();
                socket.write_all(chunk).await.unwrap();
                socket.write_all(b"\r\n").await.unwrap();
            }
            let _ = socket.write_all(b"0\r\n\r\n").await;
        });
        let response = reqwest::get(format!("http://{address}/")).await.unwrap();
        let result = read_session_response(response).await;
        let _ = server.await;
        result
    }

    #[tokio::test]
    async fn session_response_bounds_chunked_bodies() {
        assert_eq!(
            session_response(br#"{"id":"ok"}"#.to_vec()).await.unwrap()["id"],
            "ok"
        );
        let mut exact = vec![b' '; MAX_SESSION_RESPONSE_BYTES];
        exact[0] = b'0';
        assert_eq!(session_response(exact).await.unwrap(), json!(0));
        assert_eq!(
            session_response(vec![b' '; MAX_SESSION_RESPONSE_BYTES + 1])
                .await
                .unwrap_err(),
            "Session response-size limit exceeded"
        );
    }

    #[test]
    fn streaming_decoder_retains_split_utf8_and_replaces_bad_bytes() {
        let mut bytes = vec![b'a', 0xf0, 0x9f];
        assert_eq!(decode(&mut bytes, false), "a");
        bytes.extend_from_slice(&[0x98, 0x80, 0xff, 0xe2]);
        assert_eq!(decode(&mut bytes, false), "😀�");
        bytes.extend_from_slice(&[0x82, 0xac]);
        assert_eq!(decode(&mut bytes, true), "€");
    }
    #[test]
    fn tool_limit_keeps_event_and_requests_cancellation() {
        let mut run = ChatRun {
            session_id: "id".into(),
            content: String::new(),
            events: Vec::new(),
            error: None,
            duration_ms: 0,
        };
        let mut calls = 0;
        let mut done = false;
        assert_eq!(
            accept(
                json!({"type":"tool_start"}),
                &mut run,
                &mut calls,
                0,
                &mut done
            )
            .unwrap_err(),
            "Tool-call limit exceeded"
        );
        assert_eq!(run.events.len(), 1);
    }
}
