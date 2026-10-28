//! Actual production Go adapter comparisons with injected transport, not a
//! reconstructed vendor model. Native-only bounds/cancellation are separate.
#[path = "../src/internal_driver.rs"]
mod internal_driver;
use futures_util::future::BoxFuture;
use jait_gateway::services::{llm_headers::LlmRequestConfig, opencode_go_fetch as g};
use serde_json::{Value, json};
use std::{
    collections::{BTreeMap, VecDeque},
    fs,
    path::PathBuf,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, AtomicUsize, Ordering},
    },
    time::Duration,
};
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..")
}
fn protocol(v: &Value) -> g::Protocol {
    if v == "messages" {
        g::Protocol::Messages
    } else {
        g::Protocol::Responses
    }
}
fn err(e: g::GoError) -> String {
    match e {
        g::GoError::InvalidInput => "invalid-input".into(),
        g::GoError::Stream(s) | g::GoError::Transport(s) => s,
        g::GoError::Limit => "native-limit".into(),
        g::GoError::Cancelled => "native-cancelled".into(),
        g::GoError::Deadline => "native-deadline".into(),
    }
}
struct Reader {
    chunks: VecDeque<Vec<u8>>,
    error: Option<String>,
    closed: bool,
    cancelled: Arc<AtomicBool>,
    reads: Arc<AtomicUsize>,
}
impl g::GoReader for Reader {
    fn next(&mut self) -> BoxFuture<'_, Result<Option<Vec<u8>>, g::GoError>> {
        Box::pin(async {
            self.reads.fetch_add(1, Ordering::SeqCst);
            if let Some(chunk) = self.chunks.pop_front() {
                Ok(Some(chunk))
            } else if let Some(e) = self.error.take() {
                {
                    self.closed = true;
                    Err(g::GoError::Transport(e))
                }
            } else {
                {
                    self.closed = true;
                    Ok(None)
                }
            }
        })
    }
    fn cancel(&mut self, _: &str) {
        if self.closed {
            return;
        }
        self.closed = true;
        self.cancelled.store(true, Ordering::SeqCst);
        self.chunks.clear();
    }
}
fn reader(
    call: &Value,
    cancelled: Arc<AtomicBool>,
    reads: Arc<AtomicUsize>,
) -> Option<Box<dyn g::GoReader>> {
    let r = &call["response"];
    if r.get("body") == Some(&Value::Null) && r.get("chunks").is_none() {
        return None;
    }
    let chunks = if let Some(a) = r["chunks"].as_array() {
        a.iter()
            .map(|v| {
                v.as_array()
                    .unwrap()
                    .iter()
                    .map(|n| n.as_u64().unwrap() as u8)
                    .collect()
            })
            .collect()
    } else {
        let body = r.get("body").cloned().unwrap_or(json!({}));
        VecDeque::from([if let Some(s) = body.as_str() {
            s.as_bytes().to_vec()
        } else {
            body.to_string().into_bytes()
        }])
    };
    Some(Box::new(Reader {
        chunks,
        error: r["sourceError"].as_str().map(str::to_owned),
        closed: false,
        cancelled,
        reads,
    }))
}
async fn native(call: &Value) -> Value {
    match call["op"].as_str().unwrap() {
        "protocol" => json!(g::go_protocol(call["model"].as_str().unwrap()).path()),
        "request" => match g::go_request(&call["body"], protocol(&call["protocol"])) {
            Ok(v) => json!({"value":v}),
            Err(e) => json!({"error":err(e)}),
        },
        "fetch" => {
            let mut llm = json!({"backend":"opencode-go","openaiModel":"claude-test","openaiApiKey":"fixture-key","openaiBaseUrl":"https://example.invalid/zen/go/v1","sessionId":"scope-1"});
            if let Some(o) = call["llm"].as_object() {
                for (k, v) in o {
                    llm[k] = v.clone()
                }
            }
            let config: LlmRequestConfig = serde_json::from_value(llm.clone()).unwrap();
            let signal = Arc::new(AtomicBool::new(call["abortBefore"] == true));
            let captured = Arc::new(Mutex::new(json!({})));
            let source_cancelled = Arc::new(AtomicBool::new(false));
            let reads = Arc::new(AtomicUsize::new(0));
            let fixture = call.clone();
            let capture = captured.clone();
            let source_cancel = source_cancelled.clone();
            let source_reads = reads.clone();
            let captured_signal = signal.clone();
            let fetch: g::Fetch = Arc::new(move |request| {
                let fixture = fixture.clone();
                let capture = capture.clone();
                let source_cancel = source_cancel.clone();
                let source_reads = source_reads.clone();
                let captured_signal = captured_signal.clone();
                Box::pin(async move {
                    *capture.lock().unwrap() = json!({"url":request.url,"method":request.method,"headers":request.headers.map(g::normalize_headers).transpose()?,"body":request.body.map(|s|serde_json::from_str::<Value>(&s).unwrap_or(json!(s))),"extensions":request.extensions,"signal":Arc::ptr_eq(&request.cancelled,&captured_signal)});
                    if let Some(e) = fixture["fetchError"].as_str() {
                        return Err(g::GoError::Transport(e.into()));
                    }
                    let headers = fixture["response"]
                        .get("headers")
                        .cloned()
                        .unwrap_or(json!({"content-type":"application/json"}));
                    let headers = serde_json::from_value::<BTreeMap<String, String>>(headers)
                        .unwrap()
                        .into_iter()
                        .map(|(k, v)| (k.to_ascii_lowercase(), v))
                        .collect();
                    Ok(g::Response {
                        status: fixture["response"]["status"].as_u64().unwrap_or(200) as u16,
                        headers,
                        body: reader(&fixture, source_cancel, source_reads),
                    })
                })
            });
            let raw = call["bodyRaw"]
                .as_str()
                .map(str::to_owned)
                .unwrap_or_else(|| call.get("body").cloned().unwrap_or(json!({})).to_string());
            let headers = call.get("headers").map(|v| {
                if let Some(a) = v.as_array() {
                    a.iter()
                        .map(|p| {
                            (
                                p[0].as_str().unwrap().to_owned(),
                                p[1].as_str().unwrap().to_owned(),
                            )
                        })
                        .collect::<Vec<_>>()
                } else {
                    v.as_object()
                        .unwrap()
                        .iter()
                        .map(|(k, v)| (k.clone(), v.as_str().unwrap().to_owned()))
                        .collect::<Vec<_>>()
                }
            });
            let request = g::Request {
                url: call["url"]
                    .as_str()
                    .unwrap_or("https://original.invalid/completions")
                    .into(),
                method: Some(call["method"].as_str().unwrap_or("POST").into()),
                headers,
                body: Some(raw),
                extensions: call.get("extensions").cloned().unwrap_or(Value::Null),
                cancelled: signal,
            };
            let result = g::fetch_jait_llm(
                &config,
                llm["openaiModel"].as_str().unwrap(),
                request,
                &fetch,
                g::Budget::default(),
            )
            .await;
            match result {
                Err(e) => {
                    json!({"request":captured.lock().unwrap().clone(),"error":err(e),"cancelled":false,"sourceCancelled":source_cancelled.load(Ordering::SeqCst)})
                }
                Ok(mut response) => {
                    let mut result = json!({"request":captured.lock().unwrap().clone(),"status":response.status,"headers":response.headers});
                    let mut body = vec![];
                    let mut cancelled = false;
                    let mut error = None;
                    if let Some(reader) = response.body.as_mut() {
                        let mut n = 0;
                        loop {
                            match reader.next().await {
                                Ok(Some(chunk)) => {
                                    body.extend(chunk);
                                    n += 1;
                                    if call["consume"] == "cancel" && n == 1 {
                                        reader.cancel("user");
                                        cancelled = true;
                                        break;
                                    }
                                }
                                Ok(None) => break,
                                Err(e) => {
                                    error = Some(err(e));
                                    break;
                                }
                            }
                        }
                    }
                    if let Some(e) = error {
                        result["error"] = json!(e)
                    } else {
                        let body = String::from_utf8_lossy(&body);
                        if result["headers"]["content-type"]
                            .as_str()
                            .is_some_and(|s| s.contains("text/event-stream"))
                        {
                            result["frames"] = json!(
                                body.split("\n\n")
                                    .filter(|s| !s.is_empty())
                                    .map(|s| if s == "data: [DONE]" {
                                        json!("[DONE]")
                                    } else {
                                        serde_json::from_str::<Value>(&s[6..]).unwrap()
                                    })
                                    .collect::<Vec<_>>()
                            )
                        } else if let Ok(value) = serde_json::from_str::<Value>(&body) {
                            result["value"] = value
                        } else {
                            result["raw"] = json!(body)
                        }
                    }
                    result["cancelled"] = json!(cancelled);
                    result["sourceCancelled"] = json!(source_cancelled.load(Ordering::SeqCst));
                    result
                }
            }
        }
        _ => panic!("unknown op"),
    }
}
fn normalize_numbers(v: &mut Value) {
    match v {
        Value::Number(n) => {
            if let Some(f) = n.as_f64()
                && f.fract() == 0.
                && f.abs() < 9_007_199_254_740_992.
            {
                *v = json!(f as i64)
            }
        }
        Value::Array(a) => {
            for v in a {
                normalize_numbers(v)
            }
        }
        Value::Object(o) => {
            for v in o.values_mut() {
                normalize_numbers(v)
            }
        }
        _ => (),
    }
}
async fn compare(label: &str, calls: Vec<Value>) {
    let dir = root()
        .join(".jait/artifacts/gateway-rust/continuation-opencode-go/contracts")
        .join(label);
    fs::create_dir_all(&dir).unwrap();
    for (batch, calls) in calls.chunks(4).enumerate() {
        let mut expected = vec![];
        for c in calls {
            let mut v = native(c).await;
            normalize_numbers(&mut v);
            expected.push(v)
        }
        let reference = calls
            .iter()
            .map(|c| {
                let mut c = c.clone();
                c["op"] = json!(format!("nativegofetch.{}", c["op"].as_str().unwrap()));
                c
            })
            .collect::<Vec<_>>();
        let actual = internal_driver::call(
            &root(),
            &dir.join(format!("batch-{batch}")),
            json!({"version":1,"calls":reference}),
            &|| false,
        )
        .unwrap();
        assert_eq!(
            actual.as_array().unwrap().len(),
            expected.len(),
            "driver result cardinality"
        );
        for (i, (a, e)) in actual.as_array().unwrap().iter().zip(&expected).enumerate() {
            if a != e {
                fs::write(
                    dir.join(format!("mismatch-{batch}-{i}.json")),
                    serde_json::to_vec_pretty(&json!({"input":calls[i],"actual":a,"native":e}))
                        .unwrap(),
                )
                .unwrap();
                panic!("{label} mismatch {batch}:{i}: {}", dir.display())
            }
        }
        println!(
            "differential {label} batch {batch}: {} scenarios",
            calls.len()
        );
    }
}
fn frame(e: Value) -> String {
    format!("data: {e}\n\n")
}
fn streamed(protocol: &str, events: Vec<Value>) -> Value {
    let s = events.into_iter().map(frame).collect::<String>();
    json!({"op":"fetch","body":{"stream":true},"llm":{"openaiModel":if protocol=="messages"{"claude-test"}else{"gpt-test"}},"response":{"chunks":[s.as_bytes()]}})
}
#[tokio::test]
async fn model_dispatch_and_request_translation() {
    let mut calls = vec![];
    for model in [
        "claude-4", "CLAUDE-4", "gpt-5", "GPT-test", "grok-4", "o3", "O9", "o", "oA", "o٣",
        "gemini", "qwen", "claude", "xgpt-4",
    ] {
        calls.push(json!({"op":"protocol","model":model}))
    }
    for p in ["messages", "responses"] {
        for messages in [
            json!([]),
            json!([{"role":"system","content":"system"},{"role":"developer","content":[{"type":"text","text":"policy"}]},{"role":"user","content":"first"},{"role":"user","content":"second"},{"role":"assistant","content":""},{"role":"tool","tool_call_id":"c1","content":"tool result"}]),
            json!([{"role":"user","content":[{"type":"text","text":"hi 🐳"},{"type":"image_url","image_url":{"url":"data:image/png;base64,AAA\nBB"}},{"type":"image_url","image_url":{"url":"https://image.invalid/a"}},{"type":"ignored","text":"no"}]},{"role":"assistant","content":null,"tool_calls":[{"id":"c1","function":{"name":"tool","arguments":"{\"a\":1}"}},{"id":"c2","function":{"name":"other","arguments":""}}]}]),
            json!([{"role":"assistant","content":[]},{"role":"user","content":42},{"role":"tool","content":[{"type":"text","text":"one"},{"type":"text","text":"two"}]}]),
        ] {
            for extra in [
                json!({}),
                json!({"max_tokens":0,"temperature":null,"tool_choice":"required","reasoning_effort":"high"}),
                json!({"max_tokens":12,"stream":true,"tools":[{"type":"function","function":{"name":"f","description":"d","parameters":{"type":"object"}}}]}),
            ] {
                let mut body = extra;
                body["messages"] = messages.clone();
                body["model"] = json!("vendor-model");
                calls.push(json!({"op":"request","protocol":p,"body":body}))
            }
        }
    }
    for body in [
        json!({"messages":1}),
        json!({"messages":[{"role":"assistant","tool_calls":[{"function":{"arguments":"bad-json"}}]}]}),
        json!({"tools":[{}]}),
    ] {
        calls.push(json!({"op":"request","protocol":"messages","body":body}));
    }
    compare("dispatch-request", calls).await;
}
#[tokio::test]
async fn completion_usage_and_fetch_composition() {
    let mut calls = vec![];
    for (model, response) in [
        (
            "claude-x",
            json!({"content":[{"type":"text","text":"hi"},{"type":"thinking","thinking":"ignored"},{"type":"text","text":"🐳"}],"stop_reason":"end_turn","usage":{"input_tokens":10,"cache_read_input_tokens":5,"cache_creation_input_tokens":2,"output_tokens":3}}),
        ),
        (
            "claude-x",
            json!({"content":[{"type":"tool_use","id":"c1","name":"tool","input":{"x":1}}],"stop_reason":"max_tokens"}),
        ),
        (
            "gpt-x",
            json!({"output":[{"type":"message","content":[{"type":"output_text","text":"answer"}]},{"type":"function_call","call_id":"c1","name":"tool","arguments":"{}"}],"usage":{"input_tokens":4,"output_tokens":6}}),
        ),
        ("gpt-x", json!({"output":[],"status":"incomplete"})),
        ("grok-x", json!({})),
        ("o3", json!({"output":[{"type":"message","content":[]}] })),
    ] {
        for headers in [
            None,
            Some(json!({})),
            Some(json!({"Authorization":"custom","x-custom":"kept"})),
        ] {
            let mut call = json!({"op":"fetch","llm":{"openaiModel":model,"openaiBaseUrl":"https://example.invalid/zen/go/v1///"},"body":{"model":model,"messages":[],"temperature":0.2},"response":{"body":response,"status":201,"headers":{"x-upstream":"discarded"}},"extensions":{"redirect":"manual","tag":3}});
            if let Some(headers) = headers {
                call["headers"] = headers
            }
            calls.push(call)
        }
    }
    for llm in [
        json!({"backend":"other","openaiModel":"claude-x","openaiBaseUrl":"https://other.invalid"}),
        json!({"backend":"other","openaiModel":"claude-x","openaiBaseUrl":"https://opencode.ai/zen/go/v1"}),
        json!({"backend":"other","openaiModel":"claude-x","openaiBaseUrl":"https://opencode.ai/zen/go"}),
        json!({"backend":"other","openaiModel":"claude-x","openaiBaseUrl":"bad"}),
        json!({"openaiModel":"gemini-x"}),
    ] {
        calls.push(json!({"op":"fetch","llm":llm,"body":{"stream":false},"response":{"status":400,"body":"untouched","headers":{"x-error":"kept"}}}))
    }
    for status in [200, 401, 429, 503] {
        calls.push(json!({"op":"fetch","body":{},"response":{"status":status,"body":"bad-json","headers":{"x":"kept"}}}))
    }
    calls.push(json!({"op":"fetch","bodyRaw":"bad-json","response":{"body":{}}}));
    calls.push(json!({"op":"fetch","body":{},"fetchError":"transport-down"}));
    calls.push(json!({"op":"fetch","body":{"stream":true},"response":{"body":null}}));
    calls.push(json!({"op":"fetch","body":{},"response":{"body":{"content":[{"type":"tool_use","id":"numeric","name":"n","input":{"2":2.0,"1":1.0,"x":1.5}}]}}}));
    calls.push(json!({"op":"fetch","headers":{},"body":{"messages":[{"role":"user","content":[{"type":"text","text":1.0}]}]},"response":{"body":{"content":[]}}}));
    compare("completion-fetch", calls).await;
}
#[tokio::test]
async fn streaming_messages_tools_thinking_usage() {
    let mut calls = vec![];
    let events = vec![
        json!({"type":"message_start","message":{"usage":{"input_tokens":10,"cache_read_input_tokens":3,"cache_creation_input_tokens":2}}}),
        json!({"type":"content_block_start","index":4,"content_block":{"type":"text","text":"start"}}),
        json!({"type":"content_block_delta","index":4,"delta":{"type":"text_delta","text":"🐳"}}),
        json!({"type":"content_block_start","index":7,"content_block":{"type":"thinking","thinking":"think"}}),
        json!({"type":"content_block_delta","delta":{"type":"thinking_delta","thinking":"more"}}),
        json!({"type":"content_block_start","index":8,"content_block":{"type":"tool_use","id":"c1","name":"first"}}),
        json!({"type":"content_block_start","index":9,"content_block":{"type":"tool_use","id":"c2","name":"second"}}),
        json!({"type":"content_block_delta","index":8,"delta":{"type":"input_json_delta","partial_json":"{\"x\":"}}),
        json!({"type":"content_block_delta","index":9,"delta":{"type":"input_json_delta","partial_json":"{}"}}),
        json!({"type":"message_delta","delta":{"stop_reason":"tool_use"},"usage":{"output_tokens":5}}),
        json!({"type":"message_stop"}),
    ];
    for width in [0, 1, 2, 3, 7, 31, 1024] {
        let mut c = streamed("messages", events.clone());
        if width > 0 {
            let bytes = c["response"]["chunks"][0].as_array().unwrap();
            c["response"]["chunks"] =
                json!(bytes.chunks(width).map(|c| c.to_vec()).collect::<Vec<_>>())
        }
        calls.push(c)
    }
    for reason in [
        "end_turn",
        "max_tokens",
        "incomplete",
        "tool_use",
        "unknown",
    ] {
        calls.push(streamed(
            "messages",
            vec![
                json!({"type":"message_delta","delta":{"stop_reason":reason}}),
                json!({"type":"message_stop"}),
            ],
        ))
    }
    calls.push(streamed("messages",vec![json!({"type":"content_block_delta","index":99,"delta":{"type":"input_json_delta","partial_json":"x"}}),json!({"type":"message_stop"})]));
    compare("stream-messages", calls).await;
}
#[tokio::test]
async fn streaming_responses_completion_and_errors() {
    let mut calls = vec![];
    let events = vec![
        json!({"type":"response.created"}),
        json!({"type":"response.output_text.delta","delta":"a🐳"}),
        json!({"type":"response.reasoning_summary_text.delta","delta":"summary"}),
        json!({"type":"response.reasoning_text.delta","delta":"reason"}),
        json!({"type":"response.output_item.added","output_index":3,"item":{"type":"function_call","call_id":"c1","name":"first"}}),
        json!({"type":"response.output_item.added","output_index":5,"item":{"type":"function_call","call_id":"c2","name":"second","arguments":"{"}}),
        json!({"type":"response.function_call_arguments.delta","output_index":3,"delta":"{}"}),
        json!({"type":"response.completed","response":{"usage":{"input_tokens":2,"output_tokens":3}}}),
    ];
    for width in [0, 1, 2, 3, 7, 64] {
        let mut c = streamed("responses", events.clone());
        if width > 0 {
            let bytes = c["response"]["chunks"][0].as_array().unwrap();
            c["response"]["chunks"] =
                json!(bytes.chunks(width).map(|c| c.to_vec()).collect::<Vec<_>>())
        }
        calls.push(c)
    }
    for typ in ["response.completed", "response.incomplete"] {
        calls.push(streamed("responses", vec![json!({"type":typ})]))
    }
    for e in [
        json!({"type":"error","error":{"message":"vendor-down"}}),
        json!({"type":"response.failed","response":{"error":{"message":"vendor-failed"}}}),
        json!({"type":"error"}),
    ] {
        for p in ["messages", "responses"] {
            calls.push(streamed(p, vec![e.clone()]))
        }
    }
    for body in [
        "data: bad-json\n\n",
        "data: [DONE]\n\n",
        "data: {\"type\":\"message_stop\"}",
        "event: ignore\n\n",
        "",
    ] {
        calls.push(json!({"op":"fetch","body":{"stream":true},"response":{"body":body}}))
    }
    calls.push(json!({"op":"fetch","body":{"stream":true},"response":{"chunks":[],"sourceError":"source-down"}}));
    compare("stream-responses-errors", calls).await;
}
#[tokio::test]
async fn streaming_framing_cancel_and_isolation() {
    let mut calls = vec![];
    let base =
        frame(json!({"type":"content_block_delta","delta":{"type":"text_delta","text":"visible"}}))
            + &frame(json!({"type":"message_stop"}));
    for raw in [
        base.clone(),
        base.replace('\n', "\r\n"),
        format!(
            "\u{feff}:comment\n\nevent: type\ndata: {}\n\n",
            json!({"type":"message_stop"})
        ),
        format!("data: \u{feff}{}\n\n", json!({"type":"message_stop"})),
        "data: {\n data:ignored\ndata: \"type\":\"message_stop\"}\n\n".to_string(),
        format!("data: [DONE]\n\n{}", frame(json!({"type":"message_stop"}))),
    ] {
        calls.push(json!({"op":"fetch","body":{"stream":true},"response":{"body":raw}}))
    }
    let bytes = base.replace('\n', "\r\n").into_bytes();
    for split in [1, 2, 9, bytes.iter().position(|b| *b == b'\r').unwrap() + 1] {
        calls.push(json!({"op":"fetch","body":{"stream":true},"response":{"chunks":[&bytes[..split],&bytes[split..]]}}))
    }
    calls.push(
        json!({"op":"fetch","body":{"stream":true},"consume":"cancel","response":{"body":base}}),
    );
    calls.push(streamed(
        "responses",
        vec![
            json!({"type":"response.function_call_arguments.delta","output_index":5,"delta":"{}"}),
            json!({"type":"response.completed"}),
        ],
    ));
    compare("framing-cancel", calls).await;
}
#[tokio::test]
async fn native_response_budgets_backpressure_and_abort() {
    let cancelled = Arc::new(AtomicBool::new(false));
    let reads = Arc::new(AtomicUsize::new(0));
    let signal = Arc::new(AtomicBool::new(false));
    let cancellation = cancelled.clone();
    let counter = reads.clone();
    let signal_copy = signal.clone();
    let config:LlmRequestConfig=serde_json::from_value(json!({"openaiApiKey":"k","openaiBaseUrl":"https://example.invalid","backend":"opencode-go","sessionId":"s"})).unwrap();
    let fetch: g::Fetch = Arc::new(move |_| {
        let cancelled = cancellation.clone();
        let reads = counter.clone();
        Box::pin(async move {
            Ok(g::Response {
                status: 200,
                headers: BTreeMap::new(),
                body: Some(Box::new(Reader {
                    chunks: VecDeque::from([b"data: ".to_vec(), vec![b'x'; 100]]),
                    error: None,
                    closed: false,
                    cancelled,
                    reads,
                })),
            })
        })
    });
    let request = g::Request {
        url: "https://original.invalid".into(),
        method: Some("POST".into()),
        headers: None,
        body: Some("{\"stream\":true}".into()),
        extensions: Value::Null,
        cancelled: signal,
    };
    let budget = g::Budget {
        max_frame_bytes: 32,
        ..Default::default()
    };
    let mut response = g::fetch_jait_llm(&config, "claude-x", request.clone(), &fetch, budget)
        .await
        .unwrap();
    assert_eq!(
        reads.load(Ordering::SeqCst),
        0,
        "response must not eagerly pull"
    );
    assert!(matches!(
        response.body.as_mut().unwrap().next().await,
        Err(g::GoError::Limit)
    ));
    assert!(cancelled.load(Ordering::SeqCst));
    assert_eq!(reads.load(Ordering::SeqCst), 2);
    let budget = g::Budget {
        max_request_bytes: 1,
        ..Default::default()
    };
    assert!(matches!(
        g::fetch_jait_llm(&config, "claude-x", request.clone(), &fetch, budget).await,
        Err(g::GoError::Limit)
    ));
    signal_copy.store(true, Ordering::SeqCst);
    assert!(matches!(
        g::fetch_jait_llm(&config, "claude-x", request, &fetch, g::Budget::default()).await,
        Err(g::GoError::Cancelled)
    ));
}
struct PendingReader(Arc<AtomicBool>);
impl g::GoReader for PendingReader {
    fn next(&mut self) -> BoxFuture<'_, Result<Option<Vec<u8>>, g::GoError>> {
        Box::pin(std::future::pending())
    }
    fn cancel(&mut self, _: &str) {
        self.0.store(true, Ordering::SeqCst);
    }
}
#[tokio::test]
async fn native_deadline_and_drop_cancel_source() {
    let cancelled = Arc::new(AtomicBool::new(false));
    let flag = cancelled.clone();
    let fetch: g::Fetch = Arc::new(move |_| {
        let flag = flag.clone();
        Box::pin(async move {
            Ok(g::Response {
                status: 200,
                headers: BTreeMap::new(),
                body: Some(Box::new(PendingReader(flag))),
            })
        })
    });
    let config:LlmRequestConfig=serde_json::from_value(json!({"openaiApiKey":"k","openaiBaseUrl":"https://example.invalid","backend":"opencode-go","sessionId":"s"})).unwrap();
    let request = g::Request {
        url: "unused".into(),
        method: None,
        headers: None,
        body: Some("{\"stream\":true}".into()),
        extensions: Value::Null,
        cancelled: Arc::new(AtomicBool::new(false)),
    };
    let mut response = g::fetch_jait_llm(
        &config,
        "claude-x",
        request.clone(),
        &fetch,
        g::Budget {
            next_timeout: Duration::from_millis(20),
            ..Default::default()
        },
    )
    .await
    .unwrap();
    assert!(matches!(
        response.body.as_mut().unwrap().next().await,
        Err(g::GoError::Deadline)
    ));
    assert!(cancelled.load(Ordering::SeqCst));
    cancelled.store(false, Ordering::SeqCst);
    let response = g::fetch_jait_llm(&config, "claude-x", request, &fetch, g::Budget::default())
        .await
        .unwrap();
    drop(response);
    assert!(cancelled.load(Ordering::SeqCst));
}
#[tokio::test]
async fn native_pending_body_cancellation_and_total_output_limits() {
    let flag = Arc::new(AtomicBool::new(false));
    let cancellation = flag.clone();
    let fetch: g::Fetch = Arc::new(move |_| {
        let flag = cancellation.clone();
        Box::pin(async move {
            Ok(g::Response {
                status: 200,
                headers: BTreeMap::new(),
                body: Some(Box::new(PendingReader(flag))),
            })
        })
    });
    let config:LlmRequestConfig=serde_json::from_value(json!({"openaiApiKey":"k","openaiBaseUrl":"https://example.invalid","backend":"opencode-go","sessionId":"s"})).unwrap();
    let signal = Arc::new(AtomicBool::new(false));
    let request = g::Request {
        url: "unused".into(),
        method: None,
        headers: None,
        body: Some("{\"stream\":true}".into()),
        extensions: Value::Null,
        cancelled: signal.clone(),
    };
    let mut response = g::fetch_jait_llm(
        &config,
        "claude-x",
        request.clone(),
        &fetch,
        g::Budget::default(),
    )
    .await
    .unwrap();
    let stop = tokio::spawn(async move {
        tokio::task::yield_now().await;
        signal.store(true, Ordering::SeqCst)
    });
    let result = tokio::time::timeout(
        Duration::from_millis(200),
        response.body.as_mut().unwrap().next(),
    )
    .await
    .unwrap();
    stop.await.unwrap();
    assert!(matches!(result, Err(g::GoError::Cancelled)));
    assert!(flag.load(Ordering::SeqCst));
    for (bound, total) in [(1, false), (16, true)] {
        let call = streamed(
            "messages",
            vec![
                json!({"type":"content_block_delta","delta":{"type":"text_delta","text":"payload"}}),
                json!({"type":"message_stop"}),
            ],
        );
        let flag = Arc::new(AtomicBool::new(false));
        let flag2 = flag.clone();
        let call2 = call.clone();
        let fetch: g::Fetch = Arc::new(move |_| {
            let call = call2.clone();
            let flag = flag2.clone();
            Box::pin(async move {
                Ok(g::Response {
                    status: 200,
                    headers: BTreeMap::new(),
                    body: reader(&call, flag, Arc::new(AtomicUsize::new(0))),
                })
            })
        });
        let mut budget = g::Budget::default();
        if total {
            budget.max_response_bytes = bound
        } else {
            budget.max_output_bytes = bound
        }
        let mut request = request.clone();
        request.cancelled = Arc::new(AtomicBool::new(false));
        let mut response = g::fetch_jait_llm(&config, "claude-x", request, &fetch, budget)
            .await
            .unwrap();
        assert!(matches!(
            response.body.as_mut().unwrap().next().await,
            Err(g::GoError::Limit)
        ));
        assert!(flag.load(Ordering::SeqCst));
    }
}
#[tokio::test]
async fn intentional_lone_surrogate_restriction_is_fail_closed() {
    let dir = root().join(
        ".jait/artifacts/gateway-rust/continuation-opencode-go/contracts/unicode-compatibility",
    );
    fs::create_dir_all(&dir).unwrap();
    let input = json!({"op":"fetch","inspectUnicode":true,"bodyRaw":"{\"messages\":[{\"role\":\"user\",\"content\":\"\\ud800\"}]}","response":{"body":{"content":[]}}});
    let native_result = native(&input).await;
    assert_eq!(native_result["error"], "invalid-input");
    assert_eq!(
        native_result["request"],
        json!({}),
        "invalid Unicode must have no outbound effect"
    );
    let mut reference = input;
    reference["op"] = json!("nativegofetch.fetch");
    let result = internal_driver::call(
        &root(),
        &dir,
        json!({"version":1,"calls":[reference]}),
        &|| false,
    )
    .unwrap();
    assert_eq!(
        result[0],
        json!({"effect":true,"requestLone":true,"responseLone":false,"error":null})
    );
    let input = json!({"op":"fetch","inspectUnicode":true,"body":{"stream":true},"response":{"body":"data: {\"type\":\"content_block_delta\",\"delta\":{\"type\":\"text_delta\",\"text\":\"\\ud800\"}}\n\ndata: {\"type\":\"message_stop\"}\n\n"}});
    let native_result = native(&input).await;
    assert_eq!(native_result["error"], "invalid-input");
    assert_eq!(native_result["sourceCancelled"], true);
    let mut reference = input;
    reference["op"] = json!("nativegofetch.fetch");
    let result = internal_driver::call(
        &root(),
        &dir.join("stream"),
        json!({"version":1,"calls":[reference]}),
        &|| false,
    )
    .unwrap();
    assert_eq!(
        result[0],
        json!({"effect":true,"requestLone":false,"responseLone":true,"error":null})
    );
}

#[tokio::test]
async fn native_empty_chunks_are_bounded_and_cancelled() {
    for stream in [false, true] {
        let flag = Arc::new(AtomicBool::new(false));
        let reads = Arc::new(AtomicUsize::new(0));
        let f = flag.clone();
        let n = reads.clone();
        let fetch: g::Fetch = Arc::new(move |_| {
            let flag = f.clone();
            let reads = n.clone();
            Box::pin(async move {
                Ok(g::Response {
                    status: 200,
                    headers: BTreeMap::new(),
                    body: Some(Box::new(Reader {
                        chunks: VecDeque::from(vec![vec![]; 8]),
                        error: None,
                        closed: false,
                        cancelled: flag,
                        reads,
                    })),
                })
            })
        });
        let config: LlmRequestConfig = serde_json::from_value(json!({"openaiApiKey":"k","openaiBaseUrl":"https://example.invalid","backend":"opencode-go"})).unwrap();
        let request = g::Request {
            url: "unused".into(),
            method: None,
            headers: None,
            body: Some(json!({"stream":stream}).to_string()),
            extensions: Value::Null,
            cancelled: Arc::new(AtomicBool::new(false)),
        };
        let budget = g::Budget {
            max_read_events: 3,
            ..Default::default()
        };
        let result = g::fetch_jait_llm(&config, "claude-x", request, &fetch, budget).await;
        if stream {
            let mut response = result.unwrap();
            assert!(matches!(
                response.body.as_mut().unwrap().next().await,
                Err(g::GoError::Limit)
            ));
        } else {
            assert!(matches!(result, Err(g::GoError::Limit)));
        }
        assert!(flag.load(Ordering::SeqCst));
        assert_eq!(reads.load(Ordering::SeqCst), 3);
    }
}

#[tokio::test]
async fn malformed_null_shapes_match_typescript() {
    let mut calls = vec![];
    for p in ["messages", "responses"] {
        for body in [
            json!({"messages":[null]}),
            json!({"messages":[{"role":"user","content":[null]}]}),
            json!({"messages":[{"role":"system","content":[null]}]}),
        ] {
            calls.push(json!({"op":"request","protocol":p,"body":body}));
        }
    }
    for (model, body) in [
        ("claude-x", json!({"content":[null]})),
        ("gpt-x", json!({"output":[null]})),
        ("gpt-x", json!({"output":[{"content":[null]}]})),
    ] {
        calls.push(
            json!({"op":"fetch","llm":{"openaiModel":model},"body":{},"response":{"body":body}}),
        );
    }
    for p in ["messages", "responses"] {
        calls.push(streamed(
            p,
            vec![
                Value::Null,
                json!({"type":if p=="messages"{"message_stop"}else{"response.completed"}}),
            ],
        ));
    }
    compare("malformed-null-shapes", calls).await;
}

#[tokio::test]
async fn image_url_coercion_and_header_normalization() {
    let mut calls = vec![];
    for p in ["messages", "responses"] {
        for url in [
            json!(42),
            json!({"untrusted":"value"}),
            json!(["data:image/png;base64,AAA"]),
            json!(["https://image.invalid", "next"]),
            json!(true),
        ] {
            calls.push(json!({"op":"request","protocol":p,"body":{"messages":[{"role":"user","content":[{"type":"image_url","image_url":{"url":url}}]}]}}));
        }
    }
    for headers in [
        json!({"x-test":"  a \t","X-Test":"b"}),
        json!([["X-Test", "first"], ["x-test", " second "]]),
        json!({" x-bad":"a"}),
        json!({"x-valid":"a\nb"}),
        json!({"x-valid":"🐳"}),
        json!({"x-valid":"\r\n a \r\n"}),
        json!({"x-latin":"é"}),
    ] {
        calls.push(
            json!({"op":"fetch","headers":headers,"body":{},"response":{"body":{"content":[]}}}),
        );
    }
    compare("image-headers", calls).await;
}
