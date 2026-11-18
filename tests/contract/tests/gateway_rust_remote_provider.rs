#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::providers::remote_cli::*;
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{Arc, Mutex},
    time::Duration,
};

struct PeerState {
    active: Value,
    providers: Option<Vec<String>>,
    operations: Vec<Value>,
    aliases: HashMap<String, String>,
    sessions: HashMap<String, String>,
    listeners: HashMap<u64, RemoteEventHandler>,
    next: u64,
    pending_operations: usize,
}
#[derive(Clone)]
struct Peer(Arc<Mutex<PeerState>>);
impl Peer {
    fn new(call: &Value) -> Self {
        let providers = call
            .get("providers")
            .cloned()
            .unwrap_or_else(|| json!(["codex"]));
        Self(Arc::new(Mutex::new(PeerState {
            active: json!({}),
            providers: serde_json::from_value(providers).unwrap(),
            operations: vec![],
            aliases: HashMap::new(),
            sessions: HashMap::new(),
            listeners: HashMap::new(),
            next: 0,
            pending_operations: 0,
        })))
    }
    fn event(&self, id: &str, event: Value) {
        let listeners = self
            .0
            .lock()
            .unwrap()
            .listeners
            .values()
            .cloned()
            .collect::<Vec<_>>();
        for listener in listeners {
            listener(id, event.clone());
        }
    }
}
impl RemoteProviderTransport for Peer {
    fn providers(&self, _: &str) -> Option<Vec<String>> {
        self.0.lock().unwrap().providers.clone()
    }
    fn operation<'a>(
        &'a self,
        node: &'a str,
        operation: &'a str,
        params: Value,
        timeout: Duration,
    ) -> OperationFuture<'a> {
        Box::pin(async move {
            let active = {
                let mut state = self.0.lock().unwrap();
                let active = state.active.clone();
                if operation == "start-session" {
                    let id = params["sessionId"].as_str().unwrap();
                    let alias = active["alias"].as_str().unwrap_or("s");
                    state.aliases.insert(id.into(), alias.into());
                    state.sessions.insert(alias.into(), id.into());
                }
                state.operations.push(json!({"nodeId":node,"operation":operation,"params":params,"timeoutMs":timeout.as_millis() as u64}));
                active
            };
            let id = params["sessionId"].as_str().unwrap_or("");
            if let Some(events) = active["events"].as_array() {
                for event in events {
                    self.event(id, replace_session(event, id));
                }
            }
            if active["pending"] == true {
                self.0.lock().unwrap().pending_operations += 1;
                let _pending = PendingOperation(self.clone());
                std::future::pending::<()>().await;
            }
            if let Some(error) = active.get("error") {
                return Err(error.as_str().unwrap().into());
            }
            Ok(active.get("reply").cloned().unwrap_or_else(|| json!({})))
        })
    }
    fn subscribe(&self, handler: RemoteEventHandler) -> Unsubscribe {
        let mut state = self.0.lock().unwrap();
        state.next += 1;
        let key = state.next;
        state.listeners.insert(key, handler);
        let weak = Arc::downgrade(&self.0);
        Box::new(move || {
            if let Some(state) = weak.upgrade() {
                state.lock().unwrap().listeners.remove(&key);
            }
        })
    }
}
struct PendingOperation(Peer);
impl Drop for PendingOperation {
    fn drop(&mut self) {
        self.0.0.lock().unwrap().pending_operations -= 1;
    }
}

fn replace_session(value: &Value, id: &str) -> Value {
    match value {
        Value::String(s) if s == "$session" => json!(id),
        Value::Object(map) => Value::Object(
            map.iter()
                .map(|(k, v)| (k.clone(), replace_session(v, id)))
                .collect(),
        ),
        Value::Array(values) => json!(
            values
                .iter()
                .map(|v| replace_session(v, id))
                .collect::<Vec<_>>()
        ),
        _ => value.clone(),
    }
}
fn clean(value: &Value, aliases: &HashMap<String, String>) -> Value {
    match value {
        Value::String(s) => {
            let mut s = s.clone();
            for (id, alias) in aliases {
                s = s.replace(id, alias);
            }
            if s.len() > 10
                && s.chars().take(4).all(|c| c.is_ascii_digit())
                && s.as_bytes()[4] == b'-'
                && s.as_bytes()[10] == b'T'
            {
                json!("<time>")
            } else {
                json!(s)
            }
        }
        Value::Object(map) => Value::Object(
            map.iter()
                .map(|(k, v)| (k.clone(), clean(v, aliases)))
                .collect(),
        ),
        Value::Array(values) => json!(values.iter().map(|v| clean(v, aliases)).collect::<Vec<_>>()),
        _ => value.clone(),
    }
}
async fn flush() {
    for _ in 0..8 {
        tokio::task::yield_now().await;
    }
}
async fn native(call: &Value) -> Value {
    let peer = Peer::new(call);
    let id = call["providerId"].as_str().unwrap_or("codex");
    let provider = RemoteCliProvider::new(
        Arc::new(peer.clone()),
        call["nodeId"].as_str().unwrap_or("node").into(),
        id.into(),
        Some(call["providerType"].as_str().unwrap_or(id).into()),
    );
    let events = Arc::new(Mutex::new(Vec::<Value>::new()));
    let output = events.clone();
    let mut unsub = Some(provider.on_event(Arc::new(move |event| {
        output.lock().unwrap().push(event);
    })));
    let outcomes = Arc::new(Mutex::new(serde_json::Map::new()));
    let mut pending = HashMap::new();
    let mut rows = vec![];
    for step in call["steps"].as_array().unwrap() {
        peer.0.lock().unwrap().active = step.clone();
        let alias = step["session"].as_str().unwrap_or("s");
        let id = peer
            .0
            .lock()
            .unwrap()
            .sessions
            .get(alias)
            .cloned()
            .unwrap_or_else(|| alias.into());
        let result:Result<Value,String>=async {
            match step["op"].as_str().unwrap() {
                "start"=>{let options=step.get("options").cloned().unwrap_or_else(||json!({"threadId":"thread","workingDirectory":"/workspace","mode":"supervised"}));Ok(serde_json::to_value(provider.start_session(serde_json::from_value(options).unwrap()).await?).unwrap())},
                "send"=>{
                    let key=step["key"].as_str().unwrap_or("turn").to_owned();let task_key=key.clone();let outcomes=outcomes.clone();let provider=provider.clone();let message=step["message"].as_str().unwrap_or("hello").to_owned();let attachments=step.get("attachments").and_then(Value::as_array).cloned();
                    pending.insert(key,tokio::spawn(async move{let result=provider.send_turn(&id,&message,attachments).await;outcomes.lock().unwrap().insert(task_key,match result{Ok(())=>json!({"ok":true}),Err(error)=>json!({"error":error})});}));Ok(Value::Null)
                },
                "event"=>{peer.event(&id,replace_session(&step["event"],&id));Ok(Value::Null)},
                "await"=>{if let Some(task)=pending.remove(step["key"].as_str().unwrap_or("turn")){task.await.unwrap();}Ok(Value::Null)},
                "advance"=>{tokio::time::advance(Duration::from_secs(step["seconds"].as_u64().unwrap())).await;Ok(Value::Null)},
                "stop"=>{provider.stop_session(&id).await?;Ok(Value::Null)},
                "interrupt"=>{provider.interrupt_turn(&id).await?;Ok(Value::Null)},
                "approval"=>{provider.respond_to_approval(&id,"request",step["approved"].as_bool().unwrap_or(false)).await;Ok(Value::Null)},
                "availability"=>{peer.0.lock().unwrap().providers=serde_json::from_value(step["providers"].clone()).unwrap();Ok(json!(provider.check_availability()))},
                "models"=>provider.list_models().await,
                "auth"=>provider.auth_status().await,
                "login"=>provider.start_login().await,
                "logout"=>provider.logout().await,
                "loginInput"=>{provider.send_login_input(step["input"].as_str().unwrap()).await?;Ok(Value::Null)},
                "unsubscribe"=>{if let Some(unsub)=unsub.take(){unsub();}Ok(Value::Null)},
                _=>panic!("unknown fixture step"),
            }
        }.await;
        flush().await;
        let state = peer.0.lock().unwrap();
        let value = result.unwrap_or_else(|error| json!({"error":error}));
        rows.push(clean(&json!({"value":value,"operations":state.operations,"events":*events.lock().unwrap(),"outcomes":*outcomes.lock().unwrap(),"info":provider.info(),"subscribed":!state.listeners.is_empty()}),&state.aliases));
    }
    if let Some(unsub) = unsub {
        unsub();
    }
    let sessions = peer
        .0
        .lock()
        .unwrap()
        .sessions
        .values()
        .cloned()
        .collect::<Vec<_>>();
    for id in sessions {
        peer.event(&id, json!({"type":"session.completed","sessionId":id}));
    }
    for (_, task) in pending {
        task.await.unwrap();
    }
    json!(rows)
}
fn reference(call: &Value) -> Value {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap();
    let output = root
        .join(".jait/artifacts/gateway-rust/remote-provider")
        .join(uuid::Uuid::new_v4().to_string());
    std::fs::create_dir_all(&output).unwrap();
    internal_driver::call(&root, &output, json!({"version":1,"calls":[call]}), &|| {
        false
    })
    .unwrap()[0]
        .clone()
}
// Start paused with the runtime's timer epoch. Pausing after real work leaves a
// submillisecond offset that rounds an exact 1800s advance to the next tick.
#[tokio::test(start_paused = true)]
async fn real_remote_provider_matches_native_execution_and_streamed_lifecycle() {
    let matrices = vec![
        json!({"steps":[{"op":"start","reply":{"providerThreadId":"remote-thread"},"options":{"threadId":"thread","workingDirectory":"/workspace","mode":"supervised","model":"model","reasoningEffort":"high","env":{"FIXTURE":"1"},"mcpServers":[{"name":"fixture","transport":"stdio","command":"fixture"}]}},{"op":"send","attachments":[{"name":"img.png","mimeType":"image/png","data":"Zml4dHVyZQ=="}],"events":[{"type":"provider.turn-started"},{"method":"item/agentMessage/delta","params":{"delta":"hello 😀"}},{"type":"tool.output","sessionId":"$session","callId":"tool","content":"output"}]},{"op":"event","event":{"method":"item/completed","params":{"item":{"type":"agentMessage","text":"hello 😀"}}}},{"op":"event","event":{"type":"provider.turn-completed"}},{"op":"await"},{"op":"stop","reply":{"stopped":true}}]}),
        json!({"steps":[{"op":"start"},{"op":"send","reply":{"completed":true},"events":[{"type":"provider.turn-completed"}]},{"op":"await"},{"op":"send","key":"second","reply":{"completed":true}},{"op":"await","key":"second"},{"op":"interrupt","reply":{"stopped":true}},{"op":"send","key":"missing"},{"op":"await","key":"missing"}]}),
        json!({"steps":[{"op":"start","error":"permission denied"},{"op":"event","event":{"type":"provider.error","message":"ignored after failed start"}},{"op":"start","alias":"next"},{"op":"send","session":"next","error":"connection lost"},{"op":"await"},{"op":"stop","session":"next","reply":{"stopped":false}},{"op":"stop","session":"next","reply":{"stopped":true}}]}),
        json!({"steps":[{"op":"start"},{"op":"send"},{"op":"event","event":{"type":"provider.line","line":"{bad"}},{"op":"event","event":{"type":"token","sessionId":"wrong","content":"ignored"}},{"op":"event","event":{"type":"provider.line","line":"{\"method\":\"item/agentMessage/delta\",\"params\":{\"delta\":\"stream\"}}"}},{"op":"event","event":{"type":"provider.error","message":"  failure  "}},{"op":"await"},{"op":"event","event":{"type":"token","content":"ignored after error"}}]}),
        json!({"steps":[{"op":"start","alias":"first"},{"op":"start","alias":"second"},{"op":"send","session":"first","key":"one"},{"op":"send","session":"second","key":"two"},{"op":"event","session":"unknown","event":{"type":"turn.completed"}},{"op":"event","session":"first","event":{"type":"provider.stopped"}},{"op":"await","key":"one"},{"op":"event","session":"second","event":{"method":"turn/completed","params":{"turn":{"status":"failed","error":{"message":"failed"}}}}},{"op":"await","key":"two"},{"op":"event","session":"second","event":{"type":"token","content":"raw RPC session.error retains reference session"}},{"op":"stop","session":"second"}]}),
        json!({"steps":[{"op":"availability","providers":null},{"op":"availability","providers":["other"]},{"op":"availability","providers":["codex"]},{"op":"auth","reply":{"status":"authenticated"}},{"op":"login","reply":{"ok":true}},{"op":"loginInput","input":"fixture-code"},{"op":"logout","reply":{"ok":true}},{"op":"models","reply":{"data":[{"id":"one","displayName":"One","description":"description","isDefault":true,"supportedReasoningEfforts":[{"reasoningEffort":"high","description":"High"},null,{"reasoningEffort":" "}]},{"model":"two","name":"Two","supportedReasoningEfforts":[]},{"id":"hidden","hidden":true},null,[],{"id":" "}]}}]}),
        json!({"providerId":"custom-account","providerType":"claude-code","steps":[{"op":"models","reply":[{"id":"custom","name":"Custom"}]},{"op":"models","reply":{"data":[{"id":"ignored"}]}},{"op":"start"},{"op":"approval","approved":false},{"op":"unsubscribe"},{"op":"send","reply":{"completed":true}},{"op":"await"},{"op":"stop"}]}),
        json!({"manualTime":true,"steps":[{"op":"start"},{"op":"send"},{"op":"advance","seconds":1799},{"op":"advance","seconds":1},{"op":"await"},{"op":"send","key":"retry","reply":{"completed":true}},{"op":"await","key":"retry"},{"op":"stop"}]}),
        json!({"steps":[{"op":"start"},{"op":"send"},{"op":"event","event":{"type":"provider.turn-started","sessionId":"wrong"}},{"op":"event","event":{"type":"token","sessionId":42,"content":"non-string session is replaced"}},{"op":"event","event":{"type":"","extra":"direct empty event type"}},{"op":"event","event":{"type":"provider.line","line":"{\"type\":\"provider.line\",\"line\":\"{\\\"method\\\":\\\"item/agentMessage/delta\\\",\\\"params\\\":{\\\"delta\\\":\\\"nested\\\"}}\"}"}},{"op":"event","event":{"type":"session.error","error":"direct failure"}},{"op":"await"},{"op":"event","event":{"type":"token","content":"late ignored"}},{"op":"send","key":"missing"},{"op":"await","key":"missing"}]}),
        json!({"steps":[{"op":"start"},{"op":"send","key":"a"},{"op":"send","key":"b"},{"op":"event","event":{"method":"turn/completed","params":{"turn":{"status":"completed"}}}},{"op":"await","key":"a"},{"op":"await","key":"b"},{"op":"stop","error":"stop unavailable"},{"op":"stop"}]}),
        json!({"steps":[{"op":"start"},{"op":"stop","error":"connection lost"},{"op":"send","reply":{"completed":true}},{"op":"await"},{"op":"stop","reply":{"stopped":false}},{"op":"event","event":{"type":"provider.error","message":"  "}},{"op":"stop"}]}),
        json!({"steps":[{"op":"models","reply":null},{"op":"models","reply":[]},{"op":"models","reply":[{"id":"\u{feff}valid\u{feff}","displayName":" ","name":"fallback","isDefault":false,"description":" ","supportedReasoningEfforts":[{},[],{"reasoningEffort":" ","description":"ignored"},{"reasoningEffort":"low","description":" "}]},{"id":"fallback-no-efforts","supportedReasoningEfforts":null},{"id":"hidden false","hidden":false}]},{"op":"auth","error":"auth failed"},{"op":"login","error":"login failed"},{"op":"logout","error":"logout failed"}]}),
    ];
    for (index, mut call) in matrices.into_iter().enumerate() {
        call["op"] = json!("nativeremoteprovider.scenario");
        let expected = reference(&call);
        let actual = native(&call).await;
        if actual != expected {
            let directory = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("../../.jait/artifacts/gateway-rust/remote-provider-failures");
            std::fs::create_dir_all(&directory).unwrap();
            std::fs::write(
                directory.join(format!("scenario-{index}.json")),
                serde_json::to_vec_pretty(&json!({"actual":actual,"expected":expected})).unwrap(),
            )
            .unwrap();
            panic!(
                "remote provider scenario {index}: {}",
                first_difference(&actual, &expected, "")
            );
        }
    }
}

fn first_difference(actual: &Value, expected: &Value, path: &str) -> String {
    if actual == expected {
        return String::new();
    }
    match (actual, expected) {
        (Value::Array(a), Value::Array(b)) => {
            for (index, (a, b)) in a.iter().zip(b).enumerate() {
                if a != b {
                    return first_difference(a, b, &format!("{path}/{index}"));
                }
            }
            return format!("{path}/length: actual={}, expected={}", a.len(), b.len());
        }
        (Value::Object(a), Value::Object(b)) => {
            for key in a.keys().chain(b.keys()) {
                match (a.get(key), b.get(key)) {
                    (Some(a), Some(b)) if a != b => {
                        return first_difference(a, b, &format!("{path}/{key}"));
                    }
                    (None, Some(_)) => return format!("{path}/{key}: actual key missing"),
                    (Some(_), None) => return format!("{path}/{key}: unexpected actual key"),
                    _ => {}
                }
            }
        }
        _ => {}
    }
    let preview = |value: &Value| value.to_string().chars().take(256).collect::<String>();
    format!(
        "{path}: actual={}, expected={}",
        preview(actual),
        preview(expected)
    )
}

fn options() -> StartSessionOptions {
    serde_json::from_value(
        json!({"threadId":"thread","workingDirectory":"/workspace","mode":"supervised"}),
    )
    .unwrap()
}
fn setup(peer: &Peer) -> (RemoteCliProvider, Arc<Mutex<Vec<Value>>>, Unsubscribe) {
    let provider =
        RemoteCliProvider::new(Arc::new(peer.clone()), "node".into(), "codex".into(), None);
    let events = Arc::new(Mutex::new(vec![]));
    let output = events.clone();
    let unsubscribe = provider.on_event(Arc::new(move |event| output.lock().unwrap().push(event)));
    (provider, events, unsubscribe)
}

#[tokio::test(start_paused = true)]
async fn missing_completion_times_out_at_reference_deadline_and_can_run_another_turn() {
    let peer = Peer::new(&json!({}));
    let (provider, events, unsubscribe) = setup(&peer);
    let session = provider.start_session(options()).await.unwrap();
    let worker = provider.clone();
    let id = session.id.clone();
    let task = tokio::spawn(async move { worker.send_turn(&id, "hello", None).await });
    flush().await;
    tokio::time::advance(Duration::from_secs(1799)).await;
    flush().await;
    assert!(!task.is_finished());
    assert_eq!(events.lock().unwrap().len(), 1);
    tokio::time::advance(Duration::from_secs(1)).await;
    flush().await;
    task.await.unwrap().unwrap();
    assert_eq!(
        events.lock().unwrap()[1],
        json!({"type":"session.error","sessionId":session.id,"error":"Remote codex turn timed out waiting for completion"})
    );
    assert!(
        provider.session(&session.id).is_some(),
        "reference timeout retains the session"
    );
    peer.0.lock().unwrap().active = json!({"reply":{"completed":true}});
    provider
        .send_turn(&session.id, "retry", None)
        .await
        .unwrap();
    assert_eq!(events.lock().unwrap()[2]["type"], "turn.completed");
    unsubscribe();
}

#[tokio::test(start_paused = true)]
async fn abandoning_turn_future_cleans_its_timer_without_spurious_errors() {
    let peer = Peer::new(&json!({}));
    let (provider, events, unsubscribe) = setup(&peer);
    let session = provider.start_session(options()).await.unwrap();
    let worker = provider.clone();
    let id = session.id.clone();
    let task = tokio::spawn(async move { worker.send_turn(&id, "abandoned", None).await });
    flush().await;
    task.abort();
    assert!(task.await.unwrap_err().is_cancelled());
    tokio::time::advance(Duration::from_secs(1801)).await;
    flush().await;
    assert_eq!(
        events.lock().unwrap().len(),
        1,
        "abandoned timer must not emit a session failure"
    );
    peer.0.lock().unwrap().active = json!({"reply":{"completed":true}});
    provider.send_turn(&session.id, "next", None).await.unwrap();
    assert_eq!(events.lock().unwrap()[1]["type"], "turn.completed");
    unsubscribe();
}

#[tokio::test]
async fn adapters_share_one_peer_without_cross_delivering_or_detaching_each_other() {
    let peer = Peer::new(&json!({}));
    let (first, first_events, first_unsub) = setup(&peer);
    let (second, second_events, second_unsub) = setup(&peer);
    let a = first.start_session(options()).await.unwrap();
    let b = second.start_session(options()).await.unwrap();
    assert_eq!(peer.0.lock().unwrap().listeners.len(), 2);
    peer.event(
        &a.id,
        json!({"method":"item/agentMessage/delta","params":{"delta":"first"}}),
    );
    assert_eq!(first_events.lock().unwrap().len(), 2);
    assert_eq!(second_events.lock().unwrap().len(), 1);
    first.stop_session(&a.id).await.unwrap();
    assert_eq!(peer.0.lock().unwrap().listeners.len(), 1);
    peer.event(&a.id, json!({"type":"token","content":"stale"}));
    peer.event(&b.id, json!({"type":"token","content":"second"}));
    assert_eq!(first_events.lock().unwrap().len(), 2);
    assert_eq!(second_events.lock().unwrap()[1]["content"], "second");
    drop(second);
    assert!(peer.0.lock().unwrap().listeners.is_empty());
    first_unsub();
    second_unsub();
}

#[tokio::test(start_paused = true)]
async fn abandoning_start_drops_transport_and_removes_session_and_subscription() {
    let peer = Peer::new(&json!({}));
    peer.0.lock().unwrap().active = json!({"pending":true});
    let (provider, events, unsubscribe) = setup(&peer);
    let worker = provider.clone();
    let task = tokio::spawn(async move { worker.start_session(options()).await });
    flush().await;
    let id = peer.0.lock().unwrap().sessions["s"].clone();
    assert!(provider.session(&id).is_some());
    assert_eq!(peer.0.lock().unwrap().pending_operations, 1);
    task.abort();
    assert!(task.await.unwrap_err().is_cancelled());
    assert!(provider.session(&id).is_none());
    assert_eq!(peer.0.lock().unwrap().pending_operations, 0);
    assert!(peer.0.lock().unwrap().listeners.is_empty());
    peer.event(&id, json!({"type":"provider.turn-completed"}));
    assert!(events.lock().unwrap().is_empty());
    unsubscribe();
}
#[tokio::test(start_paused = true)]
async fn independent_completion_timer_fires_while_request_pending_and_abort_releases_it() {
    let peer = Peer::new(&json!({}));
    let (provider, events, unsubscribe) = setup(&peer);
    let session = provider.start_session(options()).await.unwrap();
    peer.0.lock().unwrap().active = json!({"pending":true});
    let worker = provider.clone();
    let id = session.id.clone();
    let task = tokio::spawn(async move { worker.send_turn(&id, "pending", None).await });
    flush().await;
    assert_eq!(peer.0.lock().unwrap().pending_operations, 1);
    tokio::time::advance(Duration::from_secs(1799)).await;
    flush().await;
    assert_eq!(events.lock().unwrap().len(), 1);
    tokio::time::advance(Duration::from_secs(1)).await;
    flush().await;
    assert_eq!(events.lock().unwrap().len(), 2);
    assert_eq!(events.lock().unwrap()[1]["type"], "session.error");
    assert!(
        !task.is_finished(),
        "transport retains its distinct longer request deadline"
    );
    task.abort();
    assert!(task.await.unwrap_err().is_cancelled());
    assert_eq!(peer.0.lock().unwrap().pending_operations, 0);
    tokio::time::advance(Duration::from_secs(3600)).await;
    flush().await;
    assert_eq!(events.lock().unwrap().len(), 2);
    unsubscribe();
}
#[tokio::test]
async fn malformed_primitive_notifications_are_ignored_without_panicking() {
    let peer = Peer::new(&json!({}));
    let (provider, events, unsubscribe) = setup(&peer);
    let session = provider.start_session(options()).await.unwrap();
    for event in [
        Value::Null,
        json!(false),
        json!(5),
        json!([]),
        json!("untrusted text"),
    ] {
        peer.event(&session.id, event);
    }
    assert_eq!(events.lock().unwrap().len(), 1);
    assert!(provider.session(&session.id).is_some());
    unsubscribe();
}

#[tokio::test]
async fn adapter_cleanup_preserves_preexisting_transport_listener() {
    let peer = Peer::new(&json!({}));
    let seen = Arc::new(Mutex::new(Vec::<String>::new()));
    let output = seen.clone();
    let previous = peer.subscribe(Arc::new(move |id, _| {
        output.lock().unwrap().push(id.into())
    }));
    let (provider, events, unsubscribe) = setup(&peer);
    let session = provider.start_session(options()).await.unwrap();
    peer.event(&session.id, json!({"type":"token","content":"owned"}));
    assert_eq!(peer.0.lock().unwrap().listeners.len(), 2);
    assert_eq!(events.lock().unwrap().len(), 2);
    drop(provider);
    assert_eq!(peer.0.lock().unwrap().listeners.len(), 1);
    peer.event("unrelated", json!({"type":"provider.turn-completed"}));
    assert_eq!(*seen.lock().unwrap(), vec![session.id, "unrelated".into()]);
    previous();
    assert!(peer.0.lock().unwrap().listeners.is_empty());
    unsubscribe();
}
