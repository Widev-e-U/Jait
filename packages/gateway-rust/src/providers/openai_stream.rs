//! Bounded OpenAI chat/completions HTTP and incremental SSE transport.
//! Endpoints and credentials must come from authenticated server configuration,
//! never model arguments. Redirects are disabled so credentials cannot move hosts.
use crate::{
    execution::process_runner::ProcessCancellation, services::llm_headers::LlmRequestConfig,
    text::js_trim,
};
use futures_util::future::BoxFuture;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{
    collections::{BTreeMap, HashMap},
    sync::Arc,
    time::Duration,
};

pub type EventSink = Arc<dyn Fn(Value) -> BoxFuture<'static, Result<(), String>> + Send + Sync>;
pub const MAX_STREAM_BYTES: usize = 8 * 1024 * 1024;
pub const MAX_FRAME_BYTES: usize = 256 * 1024;
pub const MAX_TOOL_ARGUMENT_BYTES: usize = 64 * 1024;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct OpenAiToolCall {
    pub id: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub function: OpenAiFunction,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct OpenAiFunction {
    pub name: String,
    pub arguments: String,
}
#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParsedStream {
    pub content_text: String,
    pub thinking_text: String,
    pub tool_calls: Vec<OpenAiToolCall>,
    pub finish_reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub usage: Option<Value>,
    pub interrupted: bool,
}
#[derive(Debug)]
pub enum StreamFailure {
    Http { status: u16, message: String },
    Cancelled,
    Other(String),
}
pub struct OpenAiHttp {
    client: reqwest::Client,
    endpoint: String,
    headers: std::collections::BTreeMap<String, String>,
    secret: String,
}
impl OpenAiHttp {
    /// The caller explicitly authorizes this configured service endpoint. This
    /// is not a general URL-fetch path and must not accept request-body URLs.
    pub fn configured(base_url: &str, api_key: &str, session_id: &str) -> Result<Self, String> {
        let url = url::Url::parse(base_url).map_err(|_| "Invalid configured model endpoint")?;
        if !matches!(url.scheme(), "http" | "https")
            || url.host_str().is_none()
            || !url.username().is_empty()
            || url.password().is_some()
            || url.query().is_some()
            || url.fragment().is_some()
        {
            return Err("Invalid configured model endpoint".into());
        }
        let config: LlmRequestConfig = serde_json::from_value(
            json!({"openaiApiKey":api_key,"openaiBaseUrl":base_url,"sessionId":session_id}),
        )
        .map_err(|e| e.to_string())?;
        Ok(Self {
            client: reqwest::Client::builder()
                .redirect(reqwest::redirect::Policy::none())
                .connect_timeout(Duration::from_secs(10))
                .timeout(Duration::from_secs(600))
                .build()
                .map_err(|_| "Model HTTP client could not be initialized")?,
            endpoint: format!("{}/chat/completions", base_url.trim_end_matches('/')),
            headers: config.headers(Some(session_id)),
            secret: api_key.into(),
        })
    }
    pub async fn stream(
        &self,
        body: Value,
        cancel: &ProcessCancellation,
        sink: EventSink,
    ) -> Result<ParsedStream, StreamFailure> {
        if cancel.is_cancelled() {
            return Err(StreamFailure::Cancelled);
        }
        let request = self
            .headers
            .iter()
            .fold(self.client.post(&self.endpoint), |request, (k, v)| {
                request.header(k, v)
            })
            .json(&body)
            .send();
        let mut response = tokio::select! {
            _=cancel.wait_cancelled()=>return Err(StreamFailure::Cancelled),
            result=request=>result.map_err(|_|StreamFailure::Other("Model connection failed".into()))?,
        };
        if cancel.is_cancelled() {
            return Err(StreamFailure::Cancelled);
        }
        if !response.status().is_success() {
            let status = response.status().as_u16();
            let mut bytes = Vec::new();
            loop {
                let next = tokio::select! {_=cancel.wait_cancelled()=>return Err(StreamFailure::Cancelled),result=response.chunk()=>result.map_err(|_|StreamFailure::Other("Model error response could not be read".into()))?};
                let Some(chunk) = next else {
                    break;
                };
                if bytes.len() + chunk.len() > MAX_FRAME_BYTES {
                    return Err(StreamFailure::Other(
                        "Model error response exceeds size limit".into(),
                    ));
                }
                bytes.extend_from_slice(&chunk);
            }
            let text = String::from_utf8_lossy(&bytes);
            let message = format_llm_error(status, &text);
            let message = if self.secret.is_empty() {
                message
            } else {
                message.replace(&self.secret, "[REDACTED]")
            };
            return Err(StreamFailure::Http { status, message });
        }
        if !response
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .is_some_and(|v| {
                v.split(';')
                    .next()
                    .unwrap_or("")
                    .trim()
                    .eq_ignore_ascii_case("text/event-stream")
            })
        {
            return Err(StreamFailure::Other(
                "Model response is not an SSE stream".into(),
            ));
        }
        let mut decoder = SseDecoder::default();
        loop {
            let next = tokio::select! {
                _=cancel.wait_cancelled()=>{decoder.parsed.interrupted=true;break;},
                result=response.chunk()=>result.map_err(|_|StreamFailure::Other("Model stream connection failed".into()))?,
            };
            let events = match &next {
                Some(chunk) => decoder.feed(chunk),
                None => decoder.finish(),
            }
            .map_err(|message| {
                StreamFailure::Other(if self.secret.is_empty() {
                    message
                } else {
                    message.replace(&self.secret, "[REDACTED]")
                })
            })?;
            for event in events {
                tokio::select! {
                    _=cancel.wait_cancelled()=>{decoder.parsed.interrupted=true;return Ok(decoder.result());},
                    result=tokio::time::timeout(Duration::from_secs(30),sink(event))=>result.map_err(|_|StreamFailure::Other("Model event consumer timed out".into()))?.map_err(StreamFailure::Other)?,
                }
            }
            if next.is_none() || decoder.done {
                break;
            }
        }
        if !decoder.parsed.interrupted && !decoder.done && decoder.parsed.finish_reason.is_none() {
            return Err(StreamFailure::Other(
                "Model stream ended before completion".into(),
            ));
        }
        Ok(decoder.result())
    }
}

#[derive(Default)]
pub struct SseDecoder {
    buffer: Vec<u8>,
    bytes: usize,
    parsed: ParsedStream,
    calls: BTreeMap<i64, OpenAiToolCall>,
    slots: HashMap<String, i64>,
    provisional: HashMap<i64, String>,
    seq: usize,
    last_slot: i64,
    inline_buffer: String,
    inline_tag: Option<String>,
    event_data: String,
    done: bool,
}
impl SseDecoder {
    pub fn feed(&mut self, chunk: &[u8]) -> Result<Vec<Value>, String> {
        if self.done {
            return Ok(vec![]);
        }
        self.bytes = self
            .bytes
            .checked_add(chunk.len())
            .ok_or("Model stream exceeds size limit")?;
        if self.bytes > MAX_STREAM_BYTES {
            return Err("Model stream exceeds size limit".into());
        }
        self.buffer.extend_from_slice(chunk);
        let mut events = vec![];
        while let Some(index) = self.buffer.iter().position(|b| *b == b'\n') {
            if index > MAX_FRAME_BYTES {
                return Err("Model SSE frame exceeds size limit".into());
            }
            let line = self.buffer.drain(..=index).collect::<Vec<_>>();
            events.extend(
                self.line(
                    std::str::from_utf8(&line)
                        .map_err(|_| "Provider returned invalid UTF-8 SSE data")?,
                )?,
            );
            if self.done {
                self.buffer.clear();
                break;
            }
        }
        if self.buffer.len() > MAX_FRAME_BYTES {
            return Err("Model SSE frame exceeds size limit".into());
        }
        Ok(events)
    }
    pub fn finish(&mut self) -> Result<Vec<Value>, String> {
        let remaining = std::mem::take(&mut self.buffer);
        let mut events = self.line(
            std::str::from_utf8(&remaining)
                .map_err(|_| "Provider returned invalid UTF-8 SSE data")?,
        )?;
        events.extend(self.dispatch()?);
        events.extend(self.inline_content("", true));
        Ok(events)
    }
    pub fn result(mut self) -> ParsedStream {
        self.parsed.tool_calls = self
            .calls
            .into_iter()
            .map(|(slot, mut call)| {
                if call.id.is_empty() {
                    call.id = self
                        .provisional
                        .remove(&slot)
                        .unwrap_or_else(|| format!("pending-{slot}"));
                }
                call
            })
            .collect();
        self.parsed
    }
    fn line(&mut self, line: &str) -> Result<Vec<Value>, String> {
        if self.done {
            return Ok(vec![]);
        }
        let line = line.trim_end_matches(['\r', '\n']);
        if line.is_empty() {
            return self.dispatch();
        }
        if let Some(data) = line.strip_prefix("data:") {
            let data = data.strip_prefix(' ').unwrap_or(data);
            if self.event_data.len() + data.len() + 1 > MAX_FRAME_BYTES {
                return Err("Model SSE frame exceeds size limit".into());
            }
            if !self.event_data.is_empty() {
                self.event_data.push('\n');
            }
            self.event_data.push_str(data);
        }
        Ok(vec![])
    }
    fn dispatch(&mut self) -> Result<Vec<Value>, String> {
        if self.done || self.event_data.is_empty() {
            return Ok(vec![]);
        }
        let data = std::mem::take(&mut self.event_data);
        let payload = js_trim(&data);
        if payload == "[DONE]" {
            self.done = true;
            return Ok(self.inline_content("", true));
        }
        if payload.is_empty() {
            return Ok(vec![]);
        }
        let chunk: Value =
            serde_json::from_str(payload).map_err(|_| "Provider returned malformed SSE data")?;
        if let Some(error) = chunk
            .get("error")
            .filter(|v| !v.is_null() && **v != Value::Bool(false))
        {
            let detail = error
                .as_str()
                .map(str::to_owned)
                .or_else(|| {
                    error
                        .get("message")
                        .and_then(Value::as_str)
                        .map(str::to_owned)
                })
                .unwrap_or_else(|| error.to_string());
            return Err(format!("Provider stream error: {detail}"));
        }
        if let Some(usage) = chunk
            .get("usage")
            .filter(|u| u["prompt_tokens"].is_number() && u["completion_tokens"].is_number())
        {
            let mut out = json!({"prompt_tokens":usage["prompt_tokens"],"completion_tokens":usage["completion_tokens"],"total_tokens":usage.get("total_tokens").cloned().unwrap_or_else(||json!(usage["prompt_tokens"].as_f64().unwrap()+usage["completion_tokens"].as_f64().unwrap()))});
            if let Some(cached) = usage["prompt_tokens_details"]
                .get("cached_tokens")
                .or_else(|| usage["input_tokens_details"].get("cached_tokens"))
                .filter(|v| v.is_number())
            {
                out["cached_tokens"] = cached.clone();
            }
            self.parsed.usage = Some(out);
        }
        let Some(choice) = chunk["choices"].as_array().and_then(|a| a.first()) else {
            return Ok(vec![]);
        };
        if let Some(finish) = choice
            .get("finish_reason")
            .and_then(Value::as_str)
            .filter(|s| !s.is_empty())
        {
            self.parsed.finish_reason = Some(finish.into());
        }
        let Some(delta) = choice.get("delta").filter(|v| !v.is_null()) else {
            return Ok(vec![]);
        };
        let mut events = vec![];
        if let Some(thinking) = delta
            .get("reasoning")
            .filter(|v| !v.is_null())
            .or_else(|| delta.get("reasoning_content"))
            .and_then(Value::as_str)
            .filter(|s| !s.is_empty())
        {
            self.parsed.thinking_text.push_str(thinking);
            events.push(json!({"type":"thinking","content":thinking}));
        }
        if let Some(content) = delta
            .get("content")
            .and_then(Value::as_str)
            .filter(|s| !s.is_empty())
        {
            events.extend(self.inline_content(content, false));
        }
        if let Some(calls) = delta.get("tool_calls").and_then(Value::as_array) {
            for call in calls {
                let id = call
                    .get("id")
                    .and_then(Value::as_str)
                    .filter(|s| !s.is_empty());
                let index = call.get("index").and_then(Value::as_i64);
                if index.is_some_and(|index| index < 0) || id.is_some_and(|id| id.len() > 512) {
                    return Err("Invalid provider tool-call identifier".into());
                }
                let slot = if let Some(existing) = id.and_then(|id| self.slots.get(id).copied()) {
                    if index.is_some_and(|index| index != existing) {
                        return Err("Provider changed a tool-call index".into());
                    }
                    existing
                } else if let Some(index) = index {
                    index
                } else if id.is_none() {
                    self.last_slot
                } else {
                    let mut free = 0;
                    while self.calls.contains_key(&free) {
                        free += 1;
                    }
                    free
                };
                if let Some(id) = id {
                    self.slots.insert(id.into(), slot);
                }
                self.last_slot = slot;
                if !self.calls.contains_key(&slot) && self.calls.len() >= 64 {
                    return Err("Model tool-call count exceeds limit".into());
                }
                let new = !self.calls.contains_key(&slot);
                let function = &call["function"];
                if new {
                    self.calls.insert(
                        slot,
                        OpenAiToolCall {
                            id: id.unwrap_or("").into(),
                            kind: "function".into(),
                            function: OpenAiFunction {
                                name: function["name"].as_str().unwrap_or("").into(),
                                arguments: String::new(),
                            },
                        },
                    );
                    if id.is_none() {
                        self.provisional
                            .insert(slot, format!("pending-{}", self.seq));
                        self.seq += 1;
                    } else {
                        self.provisional.remove(&slot);
                    }
                }
                let existing = self.calls.get_mut(&slot).unwrap();
                if let Some(id) = id {
                    if !existing.id.is_empty() && existing.id != id {
                        return Err("Provider changed a tool-call identifier".into());
                    }
                    existing.id = id.into();
                }
                if !new {
                    existing
                        .function
                        .name
                        .push_str(function["name"].as_str().unwrap_or(""));
                }
                existing
                    .function
                    .arguments
                    .push_str(function["arguments"].as_str().unwrap_or(""));
                if existing.function.arguments.len() > MAX_TOOL_ARGUMENT_BYTES
                    || existing.function.name.len() > 512
                {
                    return Err("Model tool-call data exceeds limit".into());
                }
                let call_id = if existing.id.is_empty() {
                    self.provisional
                        .get(&slot)
                        .cloned()
                        .unwrap_or_else(|| format!("pending-{slot}"))
                } else {
                    existing.id.clone()
                };
                let mut event = json!({"type":"tool_call_delta","call_id":call_id,"index":slot});
                if let Some(name) = function["name"].as_str().filter(|s| !s.is_empty()) {
                    event["name_delta"] = json!(name);
                }
                if let Some(args) = function["arguments"].as_str().filter(|s| !s.is_empty()) {
                    event["args_delta"] = json!(args);
                }
                events.push(event);
            }
        }
        Ok(events)
    }
    fn inline_content(&mut self, content: &str, final_chunk: bool) -> Vec<Value> {
        self.inline_buffer.push_str(content);
        let mut events = vec![];
        loop {
            let lower = self.inline_buffer.to_ascii_lowercase();
            let tags: Vec<String> = if let Some(tag) = &self.inline_tag {
                vec![format!("</{tag}>")]
            } else {
                ["think", "thinking", "reasoning"]
                    .iter()
                    .map(|tag| format!("<{tag}>"))
                    .collect()
            };
            let found = tags
                .iter()
                .filter_map(|tag| lower.find(tag).map(|pos| (pos, tag)))
                .min_by_key(|(pos, _)| *pos);
            let (take, tag) = if let Some((pos, tag)) = found {
                (pos, Some(tag.clone()))
            } else {
                let hold = if final_chunk {
                    0
                } else {
                    tags.iter()
                        .flat_map(|tag| (1..tag.len()).filter(|len| lower.ends_with(&tag[..*len])))
                        .max()
                        .unwrap_or(0)
                };
                (self.inline_buffer.len() - hold, None)
            };
            if take > 0 {
                let text = self.inline_buffer.drain(..take).collect::<String>();
                let kind = if self.inline_tag.is_some() {
                    self.parsed.thinking_text.push_str(&text);
                    "thinking"
                } else {
                    self.parsed.content_text.push_str(&text);
                    "token"
                };
                events.push(json!({"type":kind,"content":text}));
            }
            let Some(tag) = tag else {
                break;
            };
            self.inline_buffer.drain(..tag.len());
            if self.inline_tag.is_some() {
                self.inline_tag = None;
            } else {
                self.inline_tag = Some(tag[1..tag.len() - 1].into());
            }
        }
        events
    }
}

pub fn format_llm_error(status: u16, text: &str) -> String {
    let parsed: Value = serde_json::from_str(text).unwrap_or(Value::Null);
    let error = &parsed["error"];
    let message = error.as_str().or_else(|| error["message"].as_str());
    match status {
        401 => "Your API key is invalid or expired. Please check your settings.".into(),
        403 => "Access denied by the model provider. Please check your API key permissions.".into(),
        429 if error["code"] == "insufficient_quota"
            || message.is_some_and(|m| m.contains("quota")) =>
        {
            "You've exceeded your API quota. Please check your plan and billing details.".into()
        }
        429 => format!(
            "Rate limited by the model provider. Please wait a moment and try again.{}",
            message.map(|m| format!("\n{m}")).unwrap_or_default()
        ),
        500 | 502 | 503 => {
            format!("The model provider is experiencing issues ({status}). Please try again later.")
        }
        _ => message
            .map(|message| format!("Request failed ({status}): {message}"))
            .unwrap_or_else(|| format!("Request failed with status {status}. Please try again.")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::{
        io::{AsyncReadExt, AsyncWriteExt},
        net::TcpListener,
    };

    fn frame(delta: Value) -> Vec<u8> {
        format!("data: {}\r\n\r\n", json!({"choices":[{"delta":delta}]})).into_bytes()
    }
    #[test]
    fn inline_reasoning_survives_every_byte_split_and_multiple_blocks() {
        let wire = frame(
            json!({"content":"<think>secret 🦀</think>Hello <reasoning>more</reasoning>world<"}),
        );
        for width in 1..wire.len() {
            let mut decoder = SseDecoder::default();
            let mut events = vec![];
            for chunk in wire.chunks(width) {
                events.extend(decoder.feed(chunk).unwrap());
            }
            events.extend(decoder.finish().unwrap());
            let result = decoder.result();
            assert_eq!(result.content_text, "Hello world<");
            assert_eq!(result.thinking_text, "secret 🦀more");
            let tokens = events
                .iter()
                .filter(|e| e["type"] == "token")
                .map(|e| e["content"].as_str().unwrap())
                .collect::<String>();
            assert_eq!(tokens, result.content_text);
        }
    }
    #[test]
    fn incremental_reasoning_never_leaks_into_tokens() {
        let mut decoder = SseDecoder::default();
        let mut events = vec![];
        for text in ["<thi", "nk>sec", "ret", "</th", "ink>Visible"] {
            events.extend(decoder.feed(&frame(json!({"content":text}))).unwrap());
        }
        let result = decoder.result();
        assert_eq!(result.content_text, "Visible");
        assert_eq!(result.thinking_text, "secret");
        assert!(
            events
                .iter()
                .filter(|e| e["type"] == "token")
                .all(|e| e["content"] == "Visible")
        );
    }
    #[test]
    fn multiline_sse_and_null_delta_finish_and_usage_are_retained() {
        let mut decoder = SseDecoder::default();
        decoder
            .feed(
                br#": comment
data: {"choices": [],
data: "usage":{"prompt_tokens":4,"completion_tokens":2}}

"#,
            )
            .unwrap();
        decoder
            .feed(
                br#"data: {"choices":[{"delta":null,"finish_reason":"stop"}]}

"#,
            )
            .unwrap();
        let result = decoder.result();
        assert_eq!(result.finish_reason.as_deref(), Some("stop"));
        assert_eq!(result.usage.unwrap()["total_tokens"], 6.0);
    }
    #[test]
    fn done_stops_processing_trailing_malformed_data() {
        let mut decoder = SseDecoder::default();
        decoder.feed(b"data: [DONE]\n\ndata: broken\n\n").unwrap();
        assert!(decoder.done);
        assert!(decoder.feed(b"not SSE").unwrap().is_empty());
    }
    #[test]
    fn interleaved_sparse_tool_slots_do_not_overwrite_calls() {
        let mut decoder = SseDecoder::default();
        for delta in [
            json!({"tool_calls":[{"index":7,"id":"a","function":{"name":"first","arguments":"{"}}]}),
            json!({"tool_calls":[{"id":"b","function":{"name":"second","arguments":"{}"}}]}),
            json!({"tool_calls":[{"index":7,"function":{"arguments":"}"}}]}),
        ] {
            decoder.feed(&frame(delta)).unwrap();
        }
        let calls = decoder.result().tool_calls;
        assert_eq!(calls.len(), 2);
        assert_eq!(calls[0].id, "b");
        assert_eq!(calls[1].function.arguments, "{}");
    }
    #[test]
    fn conflicting_ids_and_indices_are_rejected() {
        for next in [
            json!({"index":0,"id":"other"}),
            json!({"index":1,"id":"same"}),
            json!({"index":-1}),
        ] {
            let mut decoder = SseDecoder::default();
            decoder
                .feed(&frame(
                    json!({"tool_calls":[{"index":0,"id":"same","function":{"name":"x"}}]}),
                ))
                .unwrap();
            assert!(decoder.feed(&frame(json!({"tool_calls":[next]}))).is_err());
        }
    }
    #[test]
    fn malformed_utf8_and_bounded_frames_are_rejected() {
        assert!(SseDecoder::default().feed(b"data: \xff\n").is_err());
        assert!(
            SseDecoder::default()
                .feed(&vec![b'x'; MAX_FRAME_BYTES + 1])
                .is_err()
        );
        let mut decoder = SseDecoder::default();
        assert!(decoder.feed(&frame(json!({"tool_calls":[{"function":{"arguments":"x".repeat(MAX_TOOL_ARGUMENT_BYTES+1)}}]}))).is_err());
        let mut decoder = SseDecoder::default();
        decoder.feed(b"data: bad JSON").unwrap();
        assert!(decoder.finish().is_err());
    }
    async fn server(response: String, hold: bool) -> (String, tokio::task::JoinHandle<String>) {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        let task = tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut request = vec![];
            let mut buffer = [0; 4096];
            while !request.windows(4).any(|v| v == b"\r\n\r\n") {
                let count = socket.read(&mut buffer).await.unwrap();
                if count == 0 {
                    break;
                }
                request.extend_from_slice(&buffer[..count]);
            }
            socket.write_all(response.as_bytes()).await.unwrap();
            if hold {
                std::future::pending::<()>().await;
            }
            String::from_utf8(request).unwrap()
        });
        (base, task)
    }
    fn sink() -> EventSink {
        Arc::new(|_| Box::pin(async { Ok(()) }))
    }
    #[tokio::test]
    async fn done_completes_without_waiting_for_socket_eof() {
        let (base,task)=server("HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nConnection: close\r\n\r\ndata: [DONE]\n\n".into(),true).await;
        let result = tokio::time::timeout(
            Duration::from_secs(2),
            OpenAiHttp::configured(&format!("{base}/"), "fixture-secret", "s")
                .unwrap()
                .stream(json!({}), &ProcessCancellation::default(), sink()),
        )
        .await
        .unwrap()
        .unwrap();
        assert!(!result.interrupted);
        task.abort();
    }
    #[tokio::test]
    async fn truncated_or_wrong_content_type_cannot_complete_a_turn() {
        for (mime, body) in [
            ("application/json", "{}"),
            (
                "text/event-stream",
                "data: {\"choices\":[{\"delta\":{\"content\":\"partial\"}}]}\n\n",
            ),
        ] {
            let (base, task) = server(
                format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: {mime}\r\nConnection: close\r\n\r\n{body}"
                ),
                false,
            )
            .await;
            assert!(matches!(
                OpenAiHttp::configured(&base, "key", "s")
                    .unwrap()
                    .stream(json!({}), &ProcessCancellation::default(), sink())
                    .await,
                Err(StreamFailure::Other(_))
            ));
            task.await.unwrap();
        }
    }
    #[tokio::test]
    async fn stream_errors_redact_credentials_and_redirects_are_not_followed() {
        for response in [
            "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nConnection: close\r\n\r\ndata: {\"error\":{\"message\":\"fixture-secret\"}}\n\n",
            "HTTP/1.1 302 Found\r\nLocation: http://127.0.0.1:1/leak\r\nContent-Length: 0\r\n\r\n",
        ] {
            let (base, task) = server(response.into(), false).await;
            let error = OpenAiHttp::configured(&base, "fixture-secret", "s")
                .unwrap()
                .stream(json!({}), &ProcessCancellation::default(), sink())
                .await
                .unwrap_err();
            assert!(!format!("{error:?}").contains("fixture-secret"));
            assert!(matches!(
                error,
                StreamFailure::Other(_) | StreamFailure::Http { status: 302, .. }
            ));
            let request = task.await.unwrap();
            assert!(request.starts_with("POST /chat/completions "));
            assert!(
                request
                    .to_lowercase()
                    .contains("authorization: bearer fixture-secret")
            );
        }
    }
    #[tokio::test]
    async fn cancellation_interrupts_a_stalled_sink() {
        let (base, task) = server(
            format!(
                "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nConnection: close\r\n\r\n{}",
                String::from_utf8(frame(json!({"content":"hello"}))).unwrap()
            ),
            true,
        )
        .await;
        let cancel = ProcessCancellation::default();
        let control = cancel.clone();
        let sink: EventSink = Arc::new(move |_| {
            control.cancel();
            Box::pin(std::future::pending())
        });
        let result = tokio::time::timeout(
            Duration::from_secs(2),
            OpenAiHttp::configured(&base, "key", "s")
                .unwrap()
                .stream(json!({}), &cancel, sink),
        )
        .await
        .unwrap()
        .unwrap();
        assert!(result.interrupted);
        task.abort();
    }
}
