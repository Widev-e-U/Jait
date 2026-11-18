//! Configured Ollama native /api/chat transport. Reuses the canonical stream
//! decoder and turn coordinator; configuration comes from authenticated server
//! settings, never tool arguments. No retries, redirects or ambient proxy.
use super::openai_stream::{
    EventSink, MAX_FRAME_BYTES, MAX_STREAM_BYTES, ParsedStream, SseDecoder, StreamFailure,
};
use crate::{execution::process_runner::ProcessCancellation, runtime::chat_turn::TurnProvider};
use futures_util::future::BoxFuture;
use serde_json::{Value, json};
use std::{
    collections::{BTreeMap, HashMap},
    time::Duration,
};

pub struct OllamaHttp {
    client: reqwest::Client,
    endpoint: String,
    num_ctx: u64,
    headers: BTreeMap<String, String>,
}
fn invalid(message: &str) -> StreamFailure {
    StreamFailure::Other(message.into())
}
impl OllamaHttp {
    /// Endpoint and context budget must be resolved from owner settings first.
    /// Configured local inference is a dedicated effect, not generic URL fetch.
    pub fn configured(
        base: &str,
        api_key: &str,
        session_id: &str,
        num_ctx: f64,
    ) -> Result<Self, String> {
        let mut url = url::Url::parse(base).map_err(|_| "Invalid configured Ollama endpoint")?;
        if !matches!(url.scheme(), "http" | "https")
            || url.host_str().is_none()
            || !url.username().is_empty()
            || url.password().is_some()
            || url.query().is_some()
            || url.fragment().is_some()
        {
            return Err("Invalid configured Ollama endpoint".into());
        }
        if !num_ctx.is_finite() || num_ctx < 1. || num_ctx.fract() != 0. || num_ctx > 16_777_216. {
            return Err("Invalid Ollama context budget".into());
        }
        let path = url.path().trim_end_matches('/');
        let path = path.strip_suffix("/v1").unwrap_or(path);
        url.set_path(&format!("{path}/api/chat"));
        let client = reqwest::Client::builder()
            .no_proxy()
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(Duration::from_secs(10))
            .timeout(Duration::from_secs(600))
            .build()
            .map_err(|_| "Ollama client initialization failed")?;
        let config: crate::services::llm_headers::LlmRequestConfig = serde_json::from_value(
            json!({"openaiApiKey":api_key,"openaiBaseUrl":base,"sessionId":session_id}),
        )
        .map_err(|_| "Invalid Ollama header configuration")?;
        Ok(Self {
            client,
            endpoint: url.into(),
            num_ctx: num_ctx as u64,
            headers: config.headers(Some(session_id)),
        })
    }
    pub async fn stream_native(
        &self,
        body: Value,
        cancel: &ProcessCancellation,
        sink: EventSink,
    ) -> Result<ParsedStream, StreamFailure> {
        if cancel.is_cancelled() {
            return Err(StreamFailure::Cancelled);
        }
        let body = native_request(body, self.num_ctx)?;
        let request = self
            .headers
            .iter()
            .fold(self.client.post(&self.endpoint), |request, (key, value)| {
                request.header(key, value)
            })
            .json(&body)
            .send();
        let mut response = tokio::select! { biased;
            _ = cancel.wait_cancelled() => return Err(StreamFailure::Cancelled),
            result = request => result.map_err(|_| invalid("Ollama connection failed"))?,
        };
        if !response.status().is_success() {
            // Untrusted model diagnostics can contain supplied histories or secrets.
            // Preserve status without importing arbitrary body text into errors.
            return Err(StreamFailure::Http {
                status: response.status().as_u16(),
                message: "Ollama request failed".into(),
            });
        }
        let mut decoder = NativeDecoder::default();
        loop {
            let next = tokio::select! { biased;
                _ = cancel.wait_cancelled() => return Ok(decoder.interrupted()),
                result = response.chunk() => result.map_err(|_| invalid("Ollama stream connection failed"))?,
            };
            let events = match next {
                Some(chunk) => decoder.feed(&chunk)?,
                None => decoder.finish()?,
            };
            for event in events {
                tokio::select! { biased;
                    _ = cancel.wait_cancelled() => return Ok(decoder.interrupted()),
                    result = tokio::time::timeout(Duration::from_secs(30), sink(event)) =>
                        result.map_err(|_| invalid("Ollama event consumer timed out"))?
                            .map_err(|_| invalid("Ollama event consumer failed"))?,
                }
            }
            if decoder.done {
                return Ok(decoder.result());
            }
            // finish requires a terminal done record, so an ordinary EOF errors.
        }
    }
}
impl TurnProvider for OllamaHttp {
    fn stream<'a>(
        &'a self,
        body: Value,
        cancellation: &'a ProcessCancellation,
        sink: EventSink,
    ) -> BoxFuture<'a, Result<ParsedStream, StreamFailure>> {
        Box::pin(self.stream_native(body, cancellation, sink))
    }
}
fn native_request(body: Value, num_ctx: u64) -> Result<Value, StreamFailure> {
    let model = body["model"]
        .as_str()
        .filter(|s| !s.is_empty())
        .ok_or_else(|| invalid("Ollama model is required"))?;
    let messages = body["messages"]
        .as_array()
        .ok_or_else(|| invalid("Ollama messages must be an array"))?;
    let mut names = HashMap::<String, String>::new();
    let mut native = Vec::with_capacity(messages.len());
    for message in messages {
        let role = message["role"]
            .as_str()
            .filter(|s| matches!(*s, "system" | "user" | "assistant" | "tool"))
            .ok_or_else(|| invalid("Invalid Ollama message role"))?;
        let content = match &message["content"] {
            Value::String(s) => s.clone(),
            Value::Null => String::new(),
            _ => return Err(invalid("Native Ollama attachments are not integrated")),
        };
        let mut output = json!({"role":role,"content":content});
        if let Some(calls) = message.get("tool_calls") {
            let calls = calls
                .as_array()
                .ok_or_else(|| invalid("Invalid Ollama tool history"))?;
            let mut mapped = Vec::with_capacity(calls.len());
            for call in calls {
                let name = call["function"]["name"]
                    .as_str()
                    .filter(|s| !s.is_empty())
                    .ok_or_else(|| invalid("Missing Ollama tool name"))?;
                let arguments = match &call["function"]["arguments"] {
                    Value::String(s) => serde_json::from_str::<Value>(s)
                        .map_err(|_| invalid("Malformed Ollama tool history arguments"))?,
                    value => value.clone(),
                };
                if !arguments.is_object() {
                    return Err(invalid("Ollama tool arguments must be an object"));
                }
                if let Some(id) = call["id"].as_str() {
                    names.insert(id.into(), name.into());
                }
                mapped.push(json!({"function":{"name":name,"arguments":arguments}}));
            }
            output["tool_calls"] = Value::Array(mapped);
        }
        if role == "tool" {
            let name = message
                .get("name")
                .and_then(Value::as_str)
                .or_else(|| {
                    message["tool_call_id"]
                        .as_str()
                        .and_then(|id| names.get(id).map(String::as_str))
                })
                .filter(|s| !s.is_empty())
                .ok_or_else(|| invalid("Uncorrelated Ollama tool result"))?;
            output["tool_name"] = json!(name);
        }
        if let Some(thinking) = message
            .get("thinking")
            .or_else(|| message.get("reasoning_content"))
            && let Some(thinking) = thinking.as_str().filter(|s| !s.is_empty())
        {
            output["thinking"] = json!(thinking);
        }
        native.push(output);
    }
    let mut output =
        json!({"model":model,"messages":native,"stream":true,"options":{"num_ctx":num_ctx}});
    if let Some(tools) = body
        .get("tools")
        .and_then(Value::as_array)
        .filter(|v| !v.is_empty())
    {
        output["tools"] = json!(tools);
    }
    Ok(output)
}
#[derive(Default)]
struct NativeDecoder {
    pending: Vec<u8>,
    total: usize,
    calls: usize,
    done: bool,
    sse: SseDecoder,
}
impl NativeDecoder {
    fn feed(&mut self, bytes: &[u8]) -> Result<Vec<Value>, StreamFailure> {
        self.total = self
            .total
            .checked_add(bytes.len())
            .ok_or_else(|| invalid("Ollama stream byte limit"))?;
        if self.total > MAX_STREAM_BYTES {
            return Err(invalid("Ollama stream byte limit"));
        }
        let mut events = Vec::new();
        for part in bytes.split_inclusive(|b| *b == b'\n') {
            if self.pending.len().saturating_add(part.len()) > MAX_FRAME_BYTES {
                return Err(invalid("Ollama frame byte limit"));
            }
            self.pending.extend_from_slice(part);
            if part.last() == Some(&b'\n') {
                let line = std::mem::take(&mut self.pending);
                events.extend(self.line(&line)?);
            }
        }
        Ok(events)
    }
    fn line(&mut self, line: &[u8]) -> Result<Vec<Value>, StreamFailure> {
        if line.iter().all(u8::is_ascii_whitespace) {
            return Ok(vec![]);
        }
        if self.done {
            return Err(invalid("Ollama data after completion"));
        }
        let chunk: Value =
            serde_json::from_slice(line).map_err(|_| invalid("Malformed Ollama stream data"))?;
        if !chunk.is_object() || chunk.get("error").is_some() {
            return Err(invalid("Ollama returned an invalid or error frame"));
        }
        let mut delta = json!({});
        if let Some(message) = chunk.get("message") {
            if !message.is_object() {
                return Err(invalid("Malformed Ollama message"));
            }
            for (native, target) in [("content", "content"), ("thinking", "reasoning_content")] {
                if let Some(value) = message.get(native) {
                    if !value.is_string() {
                        return Err(invalid("Malformed Ollama text delta"));
                    }
                    delta[target] = value.clone();
                }
            }
            if let Some(calls) = message.get("tool_calls") {
                let calls = calls
                    .as_array()
                    .ok_or_else(|| invalid("Malformed Ollama tool calls"))?;
                let mut mapped = Vec::new();
                for call in calls {
                    if self.calls >= 128 {
                        return Err(invalid("Ollama tool call limit"));
                    }
                    let name = call["function"]["name"]
                        .as_str()
                        .filter(|s| !s.is_empty())
                        .ok_or_else(|| invalid("Malformed Ollama tool name"))?;
                    let arguments = match call["function"].get("arguments") {
                        Some(Value::String(s)) => s.clone(),
                        value => {
                            serde_json::to_string(value.unwrap_or(&json!({}))).expect("JSON value")
                        }
                    };
                    let id = call["id"]
                        .as_str()
                        .filter(|s| !s.is_empty())
                        .map(str::to_owned)
                        .unwrap_or_else(|| format!("ollama-{}", self.calls));
                    mapped.push(json!({"index":self.calls,"id":id,"type":"function","function":{"name":name,"arguments":arguments}}));
                    self.calls += 1;
                }
                delta["tool_calls"] = json!(mapped);
            }
        }
        let done = match chunk.get("done") {
            Some(Value::Bool(done)) => *done,
            None => false,
            _ => return Err(invalid("Malformed Ollama completion flag")),
        };
        let finish = if done {
            Some(
                chunk
                    .get("done_reason")
                    .and_then(Value::as_str)
                    .unwrap_or("stop"),
            )
        } else {
            None
        };
        let mut frame = json!({"choices":[{"delta":delta,"finish_reason":finish}]});
        if done
            && let (Some(prompt), Some(completion)) = (
                chunk["prompt_eval_count"].as_u64(),
                chunk["eval_count"].as_u64(),
            )
        {
            let total = prompt
                .checked_add(completion)
                .ok_or_else(|| invalid("Ollama usage overflow"))?;
            frame["usage"] =
                json!({"prompt_tokens":prompt,"completion_tokens":completion,"total_tokens":total});
        }
        let mut data = b"data: ".to_vec();
        data.extend(serde_json::to_vec(&frame).expect("JSON value"));
        data.extend_from_slice(b"\n\n");
        let mut events = self
            .sse
            .feed(&data)
            .map_err(|_| invalid("Invalid Ollama normalized stream"))?;
        if done {
            events.extend(
                self.sse
                    .feed(b"data: [DONE]\n\n")
                    .map_err(|_| invalid("Invalid Ollama completion"))?,
            );
            self.done = true;
        }
        Ok(events)
    }
    fn finish(&mut self) -> Result<Vec<Value>, StreamFailure> {
        let line = std::mem::take(&mut self.pending);
        let events = self.line(&line)?;
        if !self.done {
            return Err(invalid("Ollama stream ended before completion"));
        }
        Ok(events)
    }
    fn result(self) -> ParsedStream {
        self.sse.result()
    }
    fn interrupted(self) -> ParsedStream {
        let mut result = self.result();
        result.interrupted = true;
        result
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    fn sink() -> EventSink {
        Arc::new(|_| Box::pin(async { Ok(()) }))
    }
    #[test]
    fn native_history_maps_correlated_tools_and_context_without_openai_fields() {
        let output = native_request(json!({"model":"local","messages":[
            {"role":"assistant","content":null,"reasoning_content":"thought","tool_calls":[
                {"id":"a","type":"function","function":{"name":"file_read","arguments":"{\"path\":\"x\"}"}}]},
            {"role":"tool","tool_call_id":"a","content":"result"}
        ],"stream_options":{},"tool_choice":"auto"}), 8192).unwrap();
        assert_eq!(output["options"]["num_ctx"], 8192);
        assert_eq!(
            output["messages"][0]["tool_calls"][0]["function"]["arguments"]["path"],
            "x"
        );
        assert!(output["messages"][0]["tool_calls"][0].get("id").is_none());
        assert_eq!(output["messages"][0]["thinking"], "thought");
        assert_eq!(output["messages"][1]["tool_name"], "file_read");
        assert!(output.get("stream_options").is_none());
        assert!(output.get("tool_choice").is_none());
        assert!(native_request(json!({"model":"m","messages":[{"role":"tool","content":"x","tool_call_id":"missing"}]}),8192).is_err());
    }
    #[test]
    fn native_decoder_handles_every_byte_boundary_thinking_tools_and_usage() {
        let text = concat!(
            "{\"message\":{\"content\":\"Hi 😀\",\"thinking\":\"secret\"},\"done\":false}\n",
            "{\"message\":{\"tool_calls\":[{\"function\":{\"name\":\"read\",\"arguments\":{\"path\":\"x\"}}}]},\"done\":false}\n",
            "{\"done\":true,\"done_reason\":\"stop\",\"prompt_eval_count\":2,\"eval_count\":3}\n"
        );
        let mut decoder = NativeDecoder::default();
        let mut events = vec![];
        for byte in text.as_bytes() {
            events.extend(decoder.feed(&[*byte]).unwrap());
        }
        let result = decoder.result();
        assert_eq!(result.content_text, "Hi 😀");
        assert_eq!(result.thinking_text, "secret");
        assert_eq!(result.tool_calls.len(), 1);
        assert_eq!(result.tool_calls[0].function.arguments, r#"{"path":"x"}"#);
        assert_eq!(result.usage.unwrap()["total_tokens"], 5);
        assert!(events.iter().any(|e| e["type"] == "token"));
    }
    #[test]
    fn malformed_truncated_oversized_and_error_streams_fail_closed() {
        for bytes in [
            b"not json\n".as_slice(),
            b"{\"error\":\"fixture-secret\"}\n",
            b"{\"done\":\"yes\"}\n",
            b"{\"message\":{\"content\":123}}\n",
        ] {
            let err = NativeDecoder::default().feed(bytes).unwrap_err();
            assert!(!format!("{err:?}").contains("fixture-secret"));
        }
        let mut decoder = NativeDecoder::default();
        decoder
            .feed(b"{\"message\":{\"content\":\"partial\"}}\n")
            .unwrap();
        assert!(decoder.finish().is_err());
        assert!(
            NativeDecoder::default()
                .feed(&vec![b'x'; MAX_FRAME_BYTES + 1])
                .is_err()
        );
        let mut decoder = NativeDecoder {
            total: MAX_STREAM_BYTES,
            ..Default::default()
        };
        assert!(decoder.feed(b"x").is_err());
    }
    async fn server(
        response: &'static str,
        stall: bool,
    ) -> (String, tokio::task::JoinHandle<String>) {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let base = format!("http://{}/v1", listener.local_addr().unwrap());
        let task = tokio::spawn(async move {
            let (mut stream, _) = listener.accept().await.unwrap();
            let mut bytes = Vec::new();
            let mut buffer = [0u8; 4096];
            loop {
                let n = stream.read(&mut buffer).await.unwrap();
                if n == 0 {
                    break;
                }
                bytes.extend_from_slice(&buffer[..n]);
                if let Some(split) = bytes.windows(4).position(|w| w == b"\r\n\r\n") {
                    let headers = String::from_utf8_lossy(&bytes[..split]).to_ascii_lowercase();
                    let len = headers
                        .lines()
                        .find_map(|s| {
                            s.strip_prefix("content-length: ")
                                .and_then(|s| s.parse::<usize>().ok())
                        })
                        .unwrap_or(0);
                    if bytes.len() >= split + 4 + len {
                        break;
                    }
                }
            }
            stream.write_all(response.as_bytes()).await.unwrap();
            if stall {
                std::future::pending::<()>().await;
            }
            String::from_utf8(bytes).unwrap()
        });
        (base, task)
    }
    #[tokio::test]
    async fn transport_posts_native_context_and_parses_real_ndjson() {
        let (base,task)=server("HTTP/1.1 200 OK\r\nContent-Type: application/x-ndjson\r\nConnection: close\r\n\r\n{\"message\":{\"content\":\"answer\"},\"done\":true}\n",false).await;
        let result = OllamaHttp::configured(&base, "fixture-secret", "s", 8192.)
            .unwrap()
            .stream_native(
                json!({"model":"local","messages":[]}),
                &ProcessCancellation::default(),
                sink(),
            )
            .await
            .unwrap();
        assert_eq!(result.content_text, "answer");
        let request = task.await.unwrap();
        assert!(request.starts_with("POST /api/chat HTTP/1.1"));
        assert!(
            request
                .to_ascii_lowercase()
                .contains("authorization: bearer fixture-secret")
        );
        let body: Value = serde_json::from_str(request.split_once("\r\n\r\n").unwrap().1).unwrap();
        assert_eq!(body["options"]["num_ctx"], 8192);
        assert_eq!(body["stream"], true);
    }
    #[tokio::test]
    async fn stalled_sink_cancellation_returns_partial_and_drops_transport() {
        let (base,task)=server("HTTP/1.1 200 OK\r\nContent-Type: application/x-ndjson\r\nConnection: close\r\n\r\n{\"message\":{\"content\":\"partial\"},\"done\":false}\n",true).await;
        let cancel = ProcessCancellation::default();
        let control = cancel.clone();
        let sink: EventSink = Arc::new(move |_| {
            control.cancel();
            Box::pin(std::future::pending())
        });
        let result = tokio::time::timeout(
            Duration::from_secs(2),
            OllamaHttp::configured(&base, "fixture-secret", "s", 8192.)
                .unwrap()
                .stream_native(json!({"model":"local","messages":[]}), &cancel, sink),
        )
        .await
        .unwrap()
        .unwrap();
        assert!(result.interrupted);
        assert_eq!(result.content_text, "partial");
        task.abort();
        let _ = task.await;
    }
    #[tokio::test]
    async fn redirects_errors_and_pre_cancel_do_not_forward_or_retry() {
        for response in [
            "HTTP/1.1 302 Found\r\nLocation: http://127.0.0.1:1/leak\r\nContent-Length: 0\r\n\r\n",
            "HTTP/1.1 500 Error\r\nContent-Length: 14\r\n\r\nfixture-secret",
        ] {
            let (base, task) = server(response, false).await;
            let error = OllamaHttp::configured(&base, "fixture-secret", "s", 8192.)
                .unwrap()
                .stream_native(
                    json!({"model":"local","messages":[]}),
                    &ProcessCancellation::default(),
                    sink(),
                )
                .await
                .unwrap_err();
            assert!(matches!(error, StreamFailure::Http { .. }));
            assert!(!format!("{error:?}").contains("fixture-secret"));
            task.await.unwrap();
        }
        let cancel = ProcessCancellation::default();
        cancel.cancel();
        assert!(matches!(
            OllamaHttp::configured("http://127.0.0.1:1/v1", "", "s", 8192.)
                .unwrap()
                .stream_native(json!({}), &cancel, sink())
                .await,
            Err(StreamFailure::Cancelled)
        ));
    }
    #[test]
    fn settings_reject_ambiguous_endpoints_and_invalid_context() {
        for base in [
            "file:///etc/passwd",
            "http://user:pass@localhost/v1",
            "http://localhost/v1?key=x",
            "http://localhost/v1#x",
        ] {
            assert!(OllamaHttp::configured(base, "", "s", 8192.).is_err());
        }
        for context in [0., -1., f64::NAN, f64::INFINITY, 1.5, 16_777_217.] {
            assert!(OllamaHttp::configured("http://localhost/v1", "", "s", context).is_err());
        }
    }
}
