//! OpenCode Go protocol translation. The caller owns the authorized fetch effect;
//! this adapter performs no network access and never retries. Bodies pull one
//! upstream chunk at a time and synchronously cancel on error/drop.
use super::llm_headers::LlmRequestConfig;
use crate::contracts::bounded_json::JsonGraph;
fn stringify(v: &Value) -> String {
    JsonGraph::from_value(v)
        .stringify()
        .expect("acyclic JSON value")
}
use futures_util::future::BoxFuture;
use serde_json::{Map, Value, json};
use std::{
    collections::BTreeMap,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    time::Duration,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Protocol {
    Messages,
    Responses,
    ChatCompletions,
}
impl Protocol {
    pub fn path(self) -> &'static str {
        match self {
            Self::Messages => "messages",
            Self::Responses => "responses",
            Self::ChatCompletions => "chat/completions",
        }
    }
}
pub fn go_protocol(model: &str) -> Protocol {
    let lower = model.to_ascii_lowercase();
    if lower.starts_with("claude-") {
        Protocol::Messages
    } else if lower.starts_with("gpt-")
        || lower.starts_with("grok-")
        || lower.as_bytes().first() == Some(&b'o')
            && lower.as_bytes().get(1).is_some_and(u8::is_ascii_digit)
    {
        Protocol::Responses
    } else {
        Protocol::ChatCompletions
    }
}
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum GoError {
    InvalidInput,
    Stream(String),
    Transport(String),
    Limit,
    Cancelled,
    Deadline,
}
fn truth(v: &Value) -> bool {
    match v {
        Value::Null => false,
        Value::Bool(v) => *v,
        Value::Number(v) => v.as_f64().is_some_and(|n| n != 0.),
        Value::String(v) => !v.is_empty(),
        _ => true,
    }
}
fn obj() -> Value {
    Value::Object(Map::new())
}
fn copy(dst: &mut Value, key: &str, src: &Value, from: &str) {
    if let Some(v) = src.get(from) {
        dst[key] = v.clone();
    }
}
fn nullish(v: Option<&Value>, default: Value) -> Value {
    v.filter(|v| !v.is_null()).cloned().unwrap_or(default)
}
fn list(v: Option<&Value>) -> Result<&[Value], GoError> {
    match v {
        None | Some(Value::Null) => Ok(&[]),
        Some(Value::Array(v)) => Ok(v),
        _ => Err(GoError::InvalidInput),
    }
}
fn js_string(v: &Value) -> String {
    match v {
        Value::String(s) => s.clone(),
        Value::Null => "null".into(),
        Value::Array(a) => a
            .iter()
            .map(|v| {
                if v.is_null() {
                    String::new()
                } else {
                    js_string(v)
                }
            })
            .collect::<Vec<_>>()
            .join(","),
        Value::Object(_) => "[object Object]".into(),
        Value::Number(n) => n
            .as_f64()
            .map(|n| ryu_js::Buffer::new().format(n).to_string())
            .unwrap_or_default(),
        _ => v.to_string(),
    }
}
fn text(v: &Value) -> String {
    if let Some(s) = v.as_str() {
        return s.into();
    }
    v.as_array()
        .map(|a| {
            a.iter()
                .filter(|p| p["type"] == "text")
                .map(|p| {
                    if truth(&p["text"]) {
                        js_string(&p["text"])
                    } else {
                        String::new()
                    }
                })
                .collect()
        })
        .unwrap_or_default()
}
fn parts(v: &Value, p: Protocol, role: &Value) -> Result<Vec<Value>, GoError> {
    let kind = if p == Protocol::Messages {
        "text"
    } else if role == "assistant" {
        "output_text"
    } else {
        "input_text"
    };
    let Some(a) = v.as_array() else {
        return Ok(vec![json!({"type":kind,"text":text(v)})]);
    };
    let mut out = vec![];
    for part in a {
        if part["type"] == "text" {
            let mut v = json!({"type":kind});
            copy(&mut v, "text", part, "text");
            out.push(v);
        } else if part["type"] == "image_url" {
            let url = if truth(&part["image_url"]["url"]) {
                part["image_url"]["url"].clone()
            } else {
                json!("")
            };
            if p == Protocol::Responses {
                out.push(json!({"type":"input_image","image_url":url}));
            } else {
                let url_text = js_string(&url);
                let source = if let Some(rest) = url_text.strip_prefix("data:") {
                    if let Some((media, data)) = rest.split_once(";base64,") {
                        if !media.is_empty() && !media.contains(';') {
                            json!({"type":"base64","media_type":media,"data":data})
                        } else {
                            json!({"type":"url","url":url})
                        }
                    } else {
                        json!({"type":"url","url":url})
                    }
                } else {
                    json!({"type":"url","url":url})
                };
                out.push(json!({"type":"image","source":source}));
            }
        }
    }
    Ok(out)
}
pub fn go_request(body: &Value, p: Protocol) -> Result<Value, GoError> {
    if !body.is_object() {
        return Err(GoError::InvalidInput);
    }
    let messages = list(body.get("messages"))?;
    let tools = list(body.get("tools"))?;
    for message in messages {
        if message.is_null()
            || message["content"]
                .as_array()
                .is_some_and(|a| a.iter().any(Value::is_null))
        {
            return Err(GoError::InvalidInput);
        }
    }
    let mut result = obj();
    copy(&mut result, "model", body, "model");
    if p == Protocol::Responses {
        let mut input = vec![];
        for m in messages {
            if m["role"] == "tool" {
                let mut v = json!({"type":"function_call_output","output":text(&m["content"])});
                copy(&mut v, "call_id", m, "tool_call_id");
                input.push(v);
                continue;
            }
            if !text(&m["content"]).is_empty() || m["content"].is_array() {
                let mut v = json!({"content":parts(&m["content"],p,&m["role"])?});
                copy(&mut v, "role", m, "role");
                input.push(v);
            }
            for call in list(m.get("tool_calls"))? {
                let f = call
                    .get("function")
                    .filter(|v| v.is_object())
                    .ok_or(GoError::InvalidInput)?;
                let mut v = json!({"type":"function_call"});
                copy(&mut v, "call_id", call, "id");
                copy(&mut v, "name", f, "name");
                copy(&mut v, "arguments", f, "arguments");
                input.push(v);
            }
        }
        result["input"] = json!(input);
        copy(&mut result, "stream", body, "stream");
        result["store"] = json!(false);
        if truth(&body["max_tokens"]) {
            result["max_output_tokens"] = body["max_tokens"].clone();
        }
        if truth(&body["reasoning_effort"]) {
            result["reasoning"] = json!({"effort":body["reasoning_effort"]});
        }
        if !tools.is_empty() {
            let mut translated = vec![];
            for t in tools {
                let mut f = json!({"type":"function"});
                if let Some(m) = t["function"].as_object() {
                    for (k, v) in m {
                        f[k] = v.clone();
                    }
                }
                translated.push(f)
            }
            result["tools"] = json!(translated);
            result["tool_choice"] = nullish(body.get("tool_choice"), json!("auto"));
        }
    } else if p == Protocol::Messages {
        let mut translated: Vec<Value> = vec![];
        for m in messages
            .iter()
            .filter(|m| m["role"] != "system" && m["role"] != "developer")
        {
            let role = if m["role"] == "assistant" {
                "assistant"
            } else {
                "user"
            };
            let mut content = if m["role"] == "tool" {
                let mut v = json!({"type":"tool_result","content":text(&m["content"])});
                copy(&mut v, "tool_use_id", m, "tool_call_id");
                vec![v]
            } else {
                parts(&m["content"], p, &m["role"])?
                    .into_iter()
                    .filter(|v| v["type"] != "text" || truth(&v["text"]))
                    .collect()
            };
            for call in list(m.get("tool_calls"))? {
                let f = call
                    .get("function")
                    .filter(|v| v.is_object())
                    .ok_or(GoError::InvalidInput)?;
                let raw = if truth(&f["arguments"]) {
                    js_string(&f["arguments"])
                } else {
                    "{}".into()
                };
                let input =
                    serde_json::from_str::<Value>(&raw).map_err(|_| GoError::InvalidInput)?;
                let mut v = json!({"type":"tool_use","input":input});
                copy(&mut v, "id", call, "id");
                copy(&mut v, "name", f, "name");
                content.push(v);
            }
            if content.is_empty() {
                continue;
            }
            if let Some(prev) = translated.last_mut().filter(|v| v["role"] == role) {
                prev["content"]
                    .as_array_mut()
                    .ok_or(GoError::InvalidInput)?
                    .extend(content)
            } else {
                translated.push(json!({"role":role,"content":content}));
            }
        }
        result["messages"] = json!(translated);
        copy(&mut result, "stream", body, "stream");
        result["max_tokens"] = nullish(body.get("max_tokens"), json!(8192));
        result["system"] = json!(
            messages
                .iter()
                .filter(|m| m["role"] == "system" || m["role"] == "developer")
                .map(|m| text(&m["content"]))
                .collect::<Vec<_>>()
                .join("\n\n")
        );
        if !tools.is_empty() {
            let mut translated = vec![];
            for t in tools {
                let f = t
                    .get("function")
                    .filter(|v| v.is_object())
                    .ok_or(GoError::InvalidInput)?;
                let mut v = obj();
                for (k, from) in [
                    ("name", "name"),
                    ("description", "description"),
                    ("input_schema", "parameters"),
                ] {
                    copy(&mut v, k, f, from)
                }
                translated.push(v)
            }
            result["tools"] = json!(translated);
            result["tool_choice"] = json!({"type":"auto"});
        }
        copy(&mut result, "temperature", body, "temperature");
    } else {
        return Err(GoError::InvalidInput);
    }
    Ok(result)
}
fn num(v: &Value) -> f64 {
    v.as_f64().unwrap_or(0.)
}
fn usage(u: &Value, p: Protocol) -> Value {
    let prompt = num(&u["input_tokens"])
        + if p == Protocol::Messages {
            num(&u["cache_read_input_tokens"]) + num(&u["cache_creation_input_tokens"])
        } else {
            0.
        };
    let completion = num(&u["output_tokens"]);
    json!({"prompt_tokens":prompt,"completion_tokens":completion,"total_tokens":prompt+completion})
}
fn finish(v: &Value) -> &'static str {
    match v.as_str() {
        Some("tool_use") => "tool_calls",
        Some("max_tokens" | "incomplete") => "length",
        _ => "stop",
    }
}
pub fn completion(data: &Value, p: Protocol) -> Result<Value, GoError> {
    if data.is_null() {
        return Err(GoError::InvalidInput);
    }
    let blocks = list(data.get(if p == Protocol::Messages {
        "content"
    } else {
        "output"
    }))?;
    let mut content = String::new();
    let mut calls = vec![];
    for b in blocks {
        if b.is_null() {
            return Err(GoError::InvalidInput);
        }
        if p == Protocol::Messages
            && b["type"] == "text"
            && let Some(v) = b.get("text").filter(|v| !v.is_null())
        {
            content.push_str(&js_string(v))
        }
        if p == Protocol::Responses {
            for c in list(b.get("content"))? {
                if c.is_null() {
                    return Err(GoError::InvalidInput);
                }
                if c["type"] == "output_text"
                    && let Some(v) = c.get("text").filter(|v| !v.is_null())
                {
                    content.push_str(&js_string(v))
                }
            }
        }
        if b["type"] == "tool_use" || b["type"] == "function_call" {
            let mut call = json!({"type":"function","function":{}});
            if let Some(id) = b
                .get("call_id")
                .filter(|v| !v.is_null())
                .or_else(|| b.get("id"))
            {
                call["id"] = id.clone()
            };
            copy(&mut call["function"], "name", b, "name");
            if let Some(arguments) = b.get("arguments").filter(|v| !v.is_null()) {
                call["function"]["arguments"] = arguments.clone()
            } else if let Some(input) = b.get("input") {
                call["function"]["arguments"] = json!(stringify(input))
            }
            calls.push(call);
        }
    }
    let mut message = json!({"role":"assistant","content":content});
    let reason = if calls.is_empty() {
        finish(
            data.get("stop_reason")
                .filter(|v| !v.is_null())
                .unwrap_or(&data["status"]),
        )
    } else {
        message["tool_calls"] = json!(calls);
        "tool_calls"
    };
    Ok(
        json!({"choices":[{"message":message,"finish_reason":reason}],"usage":usage(&data["usage"],p)}),
    )
}

/// `cancel` must synchronously revoke pending transport work; a reader must not
/// detach work when its borrowed next future is dropped. Runtime supplies it.
pub trait GoReader: Send {
    fn next(&mut self) -> BoxFuture<'_, Result<Option<Vec<u8>>, GoError>>;
    fn cancel(&mut self, reason: &str);
}
#[derive(Clone)]
pub struct Budget {
    pub max_request_bytes: usize,
    pub max_response_bytes: usize,
    pub max_frame_bytes: usize,
    pub max_output_bytes: usize,
    pub max_read_events: usize,
    pub next_timeout: Duration,
}
impl Default for Budget {
    fn default() -> Self {
        Self {
            max_request_bytes: 1_048_576,
            max_response_bytes: 8_388_608,
            max_frame_bytes: 1_048_576,
            max_output_bytes: 1_048_576,
            max_read_events: 65_536,
            next_timeout: Duration::from_secs(30),
        }
    }
}
#[derive(Clone)]
pub struct Request {
    pub url: String,
    pub method: Option<String>,
    pub headers: Option<Vec<(String, String)>>,
    pub body: Option<String>,
    pub extensions: Value,
    pub cancelled: Arc<AtomicBool>,
}
pub struct Response {
    pub status: u16,
    pub headers: BTreeMap<String, String>,
    pub body: Option<Box<dyn GoReader>>,
}
/// Fetch Headers normalization for ordered typed name/value pairs. Duplicated
/// names retain append order; invalid names/values fail before outbound effect.
pub fn normalize_headers(
    input: Vec<(String, String)>,
) -> Result<BTreeMap<String, String>, GoError> {
    let mut result = BTreeMap::<String, String>::new();
    for (name, value) in input {
        if name.is_empty()
            || !name
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b"!#$%&'*+-.^_`|~".contains(&b))
        {
            return Err(GoError::InvalidInput);
        }
        let value = value.trim_matches(['\t', '\n', '\r', ' ']);
        if value
            .chars()
            .any(|c| c == '\0' || c == '\r' || c == '\n' || u32::from(c) > 255)
        {
            return Err(GoError::InvalidInput);
        }
        let name = name.to_ascii_lowercase();
        result
            .entry(name)
            .and_modify(|existing| {
                existing.push_str(", ");
                existing.push_str(value);
            })
            .or_insert_with(|| value.to_owned());
    }
    Ok(result)
}
pub type Fetch =
    Arc<dyn Fn(Request) -> BoxFuture<'static, Result<Response, GoError>> + Send + Sync>;
struct BytesBody(Option<Vec<u8>>);
impl GoReader for BytesBody {
    fn next(&mut self) -> BoxFuture<'_, Result<Option<Vec<u8>>, GoError>> {
        Box::pin(async { Ok(self.0.take()) })
    }
    fn cancel(&mut self, _: &str) {
        self.0 = None;
    }
}
struct OwnedReader {
    reader: Box<dyn GoReader>,
    cancelled: bool,
    done: bool,
    signal: Arc<AtomicBool>,
    budget: Budget,
    bytes: usize,
    reads: usize,
}
impl OwnedReader {
    fn new(reader: Box<dyn GoReader>, signal: Arc<AtomicBool>, budget: Budget) -> Self {
        Self {
            reader,
            cancelled: false,
            done: false,
            signal,
            budget,
            bytes: 0,
            reads: 0,
        }
    }
    fn cancel(&mut self, reason: &str) {
        if !self.cancelled && !self.done {
            self.reader.cancel(reason);
            self.cancelled = true;
        }
    }
    async fn next(&mut self) -> Result<Option<Vec<u8>>, GoError> {
        if self.done {
            return Ok(None);
        }
        if self.signal.load(Ordering::Acquire) {
            self.cancel("cancelled");
            return Err(GoError::Cancelled);
        }
        if self.reads >= self.budget.max_read_events {
            self.cancel("read event limit");
            return Err(GoError::Limit);
        }
        self.reads += 1;
        let signal = self.signal.clone();
        let value = tokio::select! {
            biased;
            _ = cancelled(signal) => { self.cancel("cancelled"); return Err(GoError::Cancelled); },
            value = tokio::time::timeout(self.budget.next_timeout, self.reader.next()) => value,
        };
        let value = match value {
            Ok(Ok(v)) => v,
            Ok(Err(e)) => {
                self.cancel("upstream error");
                return Err(e);
            }
            Err(_) => {
                self.cancel("deadline");
                return Err(GoError::Deadline);
            }
        };
        if self.signal.load(Ordering::Acquire) {
            self.cancel("cancelled");
            return Err(GoError::Cancelled);
        }
        if let Some(bytes) = &value {
            self.bytes = self.bytes.checked_add(bytes.len()).ok_or(GoError::Limit)?;
            if self.bytes > self.budget.max_response_bytes {
                self.cancel("response limit");
                return Err(GoError::Limit);
            }
        } else {
            self.done = true
        }
        Ok(value)
    }
}
impl Drop for OwnedReader {
    fn drop(&mut self) {
        if !self.done {
            self.cancel("body dropped");
        }
    }
}
/// One state machine per response; no shared tool indexes, usage, or decoder.
struct StreamBody {
    source: OwnedReader,
    protocol: Protocol,
    buffer: String,
    utf8: Vec<u8>,
    first: bool,
    ended: bool,
    done: bool,
    indices: Vec<(Value, usize)>,
    tools: usize,
    totals: Value,
    pending: Option<Vec<u8>>,
}
impl StreamBody {
    fn new(source: OwnedReader, protocol: Protocol) -> Self {
        Self {
            source,
            protocol,
            buffer: String::new(),
            utf8: vec![],
            first: true,
            ended: false,
            done: false,
            indices: vec![],
            tools: 0,
            totals: obj(),
            pending: None,
        }
    }
    fn index(&self, v: &Value) -> Option<usize> {
        self.indices
            .iter()
            .rev()
            .find(|(k, _)| k == v)
            .map(|(_, v)| *v)
    }
    fn convert(&mut self, e: &Value) -> Result<Option<Value>, GoError> {
        if e.is_null() {
            return Err(GoError::InvalidInput);
        }
        let typ = e["type"].as_str().unwrap_or_default();
        let mut delta = obj();
        let mut reason = None;
        if typ == "error" || typ == "response.failed" {
            return Err(GoError::Stream(
                e["error"]["message"]
                    .as_str()
                    .or_else(|| e["response"]["error"]["message"].as_str())
                    .unwrap_or("Go stream failed")
                    .into(),
            ));
        }
        if self.protocol == Protocol::Messages {
            if typ == "message_start" {
                self.totals = e["message"]["usage"]
                    .as_object()
                    .cloned()
                    .map(Value::Object)
                    .unwrap_or_else(obj)
            }
            if typ == "content_block_start" {
                let b = &e["content_block"];
                if b["type"] == "tool_use" {
                    let index = self.tools;
                    self.tools += 1;
                    self.indices.push((e["index"].clone(), index));
                    let mut t =
                        json!({"index":index,"type":"function","function":{"arguments":""}});
                    copy(&mut t, "id", b, "id");
                    copy(&mut t["function"], "name", b, "name");
                    delta["tool_calls"] = json!([t]);
                }
                if b["type"] == "text" && truth(&b["text"]) {
                    delta["content"] = b["text"].clone()
                }
                if b["type"] == "thinking" && truth(&b["thinking"]) {
                    delta["reasoning_content"] = b["thinking"].clone()
                }
            }
            if typ == "content_block_delta" {
                let d = &e["delta"];
                if d["type"] == "text_delta" {
                    copy(&mut delta, "content", d, "text")
                }
                if d["type"] == "thinking_delta" {
                    copy(&mut delta, "reasoning_content", d, "thinking")
                }
                if d["type"] == "input_json_delta" {
                    let mut t = json!({"function":{}});
                    if let Some(index) = self.index(&e["index"]) {
                        t["index"] = json!(index)
                    }
                    copy(&mut t["function"], "arguments", d, "partial_json");
                    delta["tool_calls"] = json!([t]);
                }
            }
            if typ == "message_delta" {
                if let Some(o) = e["usage"].as_object() {
                    for (k, v) in o {
                        self.totals[k] = v.clone()
                    }
                }
                reason = Some(finish(&e["delta"]["stop_reason"]))
            }
            if typ == "message_stop" {
                self.ended = true
            }
        } else {
            if typ == "response.output_text.delta" {
                copy(&mut delta, "content", e, "delta")
            }
            if typ == "response.reasoning_summary_text.delta"
                || typ == "response.reasoning_text.delta"
            {
                copy(&mut delta, "reasoning_content", e, "delta")
            }
            if typ == "response.output_item.added" && e["item"]["type"] == "function_call" {
                let index = self.tools;
                self.tools += 1;
                self.indices.push((e["output_index"].clone(), index));
                let b = &e["item"];
                let mut t = json!({"index":index,"type":"function","function":{"arguments":nullish(b.get("arguments"),json!(""))}});
                copy(&mut t, "id", b, "call_id");
                copy(&mut t["function"], "name", b, "name");
                delta["tool_calls"] = json!([t]);
            }
            if typ == "response.function_call_arguments.delta" {
                let mut t = json!({"function":{}});
                if let Some(index) = self.index(&e["output_index"]) {
                    t["index"] = json!(index)
                }
                copy(&mut t["function"], "arguments", e, "delta");
                delta["tool_calls"] = json!([t]);
            }
            if typ == "response.completed" || typ == "response.incomplete" {
                self.totals = nullish(e["response"].get("usage"), obj());
                reason = Some(if typ == "response.incomplete" {
                    "length"
                } else if self.tools > 0 {
                    "tool_calls"
                } else {
                    "stop"
                });
                self.ended = true
            }
        }
        if delta.as_object().is_none_or(Map::is_empty) && reason.is_none() {
            return Ok(None);
        }
        let mut chunk = json!({"choices":[{"index":0,"delta":delta,"finish_reason":reason}]});
        if reason.is_some() {
            chunk["usage"] = usage(&self.totals, self.protocol)
        }
        Ok(Some(chunk))
    }
    fn decode(&mut self, bytes: &[u8]) {
        self.utf8.extend_from_slice(bytes);
        let mut decoded = String::new();
        let mut offset = 0;
        loop {
            match std::str::from_utf8(&self.utf8[offset..]) {
                Ok(s) => {
                    decoded.push_str(s);
                    offset = self.utf8.len();
                    break;
                }
                Err(e) => {
                    let good = offset + e.valid_up_to();
                    decoded.push_str(
                        std::str::from_utf8(&self.utf8[offset..good]).expect("validated UTF8"),
                    );
                    if let Some(n) = e.error_len() {
                        decoded.push('\u{fffd}');
                        offset = good + n;
                    } else {
                        offset = good;
                        break;
                    }
                }
            }
        }
        self.utf8.drain(..offset);
        if self.first && !decoded.is_empty() {
            self.first = false;
            if decoded.starts_with('\u{feff}') {
                decoded.remove(0);
            }
        }
        // Deliberately normalize within decoded chunks, matching the reference even
        // when a CR/LF pair straddles chunks. No invented cross-chunk CRLF cleanup.
        self.buffer.push_str(&decoded.replace("\r\n", "\n"));
    }
    async fn pull(&mut self) -> Result<Option<Vec<u8>>, GoError> {
        if let Some(bytes) = self.pending.take() {
            return Ok(Some(bytes));
        }
        if self.done {
            return Ok(None);
        }
        loop {
            if let Some(at) = self.buffer.find("\n\n") {
                if at > self.source.budget.max_frame_bytes {
                    return Err(GoError::Limit);
                }
                let frame = self.buffer[..at].to_owned();
                self.buffer.drain(..at + 2);
                let data = frame
                    .split('\n')
                    .filter_map(|l| l.strip_prefix("data:"))
                    .map(|l| l.trim_start_matches(crate::text::js_whitespace))
                    .collect::<Vec<_>>()
                    .join("\n");
                if data.is_empty() || data == "[DONE]" {
                    continue;
                }
                let e: Value = serde_json::from_str(&data).map_err(|_| GoError::InvalidInput)?;
                let chunk = self.convert(&e)?;
                if self.ended {
                    self.source.cancel("completed");
                    self.source.done = true;
                    self.done = true;
                    if chunk.is_some() {
                        self.pending = Some(b"data: [DONE]\n\n".to_vec());
                    } else {
                        return Ok(Some(b"data: [DONE]\n\n".to_vec()));
                    }
                }
                if let Some(chunk) = chunk {
                    let bytes = format!("data: {}\n\n", stringify(&chunk)).into_bytes();
                    if bytes.len() > self.source.budget.max_output_bytes {
                        return Err(GoError::Limit);
                    }
                    return Ok(Some(bytes));
                }
            } else {
                if self.buffer.len() > self.source.budget.max_frame_bytes {
                    return Err(GoError::Limit);
                }
                let Some(bytes) = self.source.next().await? else {
                    return Err(GoError::Stream("Go stream ended before completion".into()));
                };
                self.decode(&bytes);
                if self.buffer.len() > self.source.budget.max_frame_bytes
                    && !self.buffer.contains("\n\n")
                {
                    return Err(GoError::Limit);
                }
            }
        }
    }
}
impl GoReader for StreamBody {
    fn next(&mut self) -> BoxFuture<'_, Result<Option<Vec<u8>>, GoError>> {
        Box::pin(async {
            let result = self.pull().await;
            if result.is_err() {
                self.source.cancel("stream error");
                self.done = true
            }
            result
        })
    }
    fn cancel(&mut self, reason: &str) {
        self.source.cancel(reason);
        self.done = true;
        self.pending = None;
    }
}

async fn cancelled(signal: Arc<AtomicBool>) {
    while !signal.load(Ordering::Acquire) {
        tokio::time::sleep(Duration::from_millis(5)).await;
    }
}

pub async fn fetch_jait_llm(
    config: &LlmRequestConfig,
    model: &str,
    mut request: Request,
    fetch: &Fetch,
    budget: Budget,
) -> Result<Response, GoError> {
    let go = config.backend.as_deref() == Some("opencode-go")
        || url::Url::parse(&config.openai_base_url)
            .is_ok_and(|u| u.host_str() == Some("opencode.ai") && u.path().starts_with("/zen/go/"));
    let protocol = if go {
        go_protocol(model)
    } else {
        Protocol::ChatCompletions
    };
    if protocol == Protocol::ChatCompletions {
        return fetch(request).await;
    }
    let raw = request.body.as_deref().ok_or(GoError::InvalidInput)?;
    if raw.len() > budget.max_request_bytes {
        return Err(GoError::Limit);
    }
    let body: Value = serde_json::from_str(raw).map_err(|_| GoError::InvalidInput)?;
    let body = go_request(&body, protocol)?;
    let mut headers = normalize_headers(
        request
            .headers
            .take()
            .unwrap_or_else(|| config.headers(None).into_iter().collect()),
    )?;
    if protocol == Protocol::Messages {
        headers.insert("x-api-key".into(), config.openai_api_key.clone());
        headers.insert("anthropic-version".into(), "2023-06-01".into());
    }
    request.url = format!(
        "{}/{}",
        config.openai_base_url.trim_end_matches('/'),
        protocol.path()
    );
    request.headers = Some(
        normalize_headers(headers.into_iter().collect())?
            .into_iter()
            .collect(),
    );
    let serialized = stringify(&body);
    if serialized.len() > budget.max_request_bytes {
        return Err(GoError::Limit);
    }
    request.body = Some(serialized);
    let signal = request.cancelled.clone();
    if signal.load(Ordering::Acquire) {
        return Err(GoError::Cancelled);
    }
    let watch = signal.clone();
    let mut response = tokio::select! {
        biased;
        _ = cancelled(watch) => return Err(GoError::Cancelled),
        value = tokio::time::timeout(budget.next_timeout, fetch(request)) => value.map_err(|_| GoError::Deadline)??,
    };
    if !(200..=299).contains(&response.status) {
        return Ok(response);
    }
    if truth(&body["stream"]) && response.body.is_some() {
        response.body = Some(Box::new(StreamBody::new(
            OwnedReader::new(response.body.take().expect("checked body"), signal, budget),
            protocol,
        )));
        response.headers = BTreeMap::from([("content-type".into(), "text/event-stream".into())]);
        return Ok(response);
    }
    let mut bytes = vec![];
    if let Some(reader) = response.body.take() {
        let mut reader = OwnedReader::new(reader, signal, budget);
        while let Some(chunk) = reader.next().await? {
            bytes.extend_from_slice(&chunk)
        }
    }
    let data: Value = serde_json::from_slice(&bytes).map_err(|_| GoError::InvalidInput)?;
    let translated = completion(&data, protocol)?;
    Ok(Response {
        status: 200,
        headers: BTreeMap::from([(
            "content-type".into(),
            "application/json;charset=utf-8".into(),
        )]),
        body: Some(Box::new(BytesBody(Some(
            stringify(&translated).into_bytes(),
        )))),
    })
}
