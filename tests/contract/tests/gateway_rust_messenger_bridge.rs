#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::services::messenger_bridge::*;
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{
        Arc, Mutex,
        atomic::{AtomicI64, Ordering},
    },
};
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}
fn expanded_result(step: &Value) -> Value {
    let mut result = step["result"].clone();
    if let Some(size) = result.get("dataRepeat").and_then(Value::as_u64) {
        result.as_object_mut().unwrap().remove("dataRepeat");
        result["data"] = json!("x".repeat(size as usize));
    }
    result
}
fn result_value(response: MessengerToolResponse) -> Value {
    let mut result = json!({"ok":response.ok,"messageUnits":response.message.0});
    if let Some(data) = response.data {
        result["data"] = data;
    }
    result
}
async fn native(call: &Value) -> Value {
    if call["op"] == "nativebridge.parse" {
        return Value::Array(
            call["inputs"]
                .as_array()
                .unwrap()
                .iter()
                .map(|input| parse_messenger_command(input).unwrap_or(Value::Null))
                .collect(),
        );
    }
    let now = Arc::new(AtomicI64::new(1000));
    let clock = now.clone();
    let bridge = MessengerBridge::with_clock(Arc::new(move || clock.load(Ordering::SeqCst)));
    let current_id = Arc::new(Mutex::new(String::new()));
    let sent = Arc::new(Mutex::new(vec![]));
    let gateway = Arc::new(Mutex::new(vec![]));
    let requests = Arc::new(Mutex::new(HashMap::<String, MessengerRequest>::new()));
    let mut signals = HashMap::<String, MessengerAbortSignal>::new();
    let mut futures = vec![];
    let outcomes = Arc::new(Mutex::new(vec![]));
    let mut counts = vec![];
    for step in call["steps"].as_array().unwrap() {
        match step["op"].as_str().unwrap() {
            "register" => {
                let step = step.clone();
                let active_step = step.clone();
                let sent = sent.clone();
                let current = current_id.clone();
                let requests = requests.clone();
                let callback_bridge = bridge.clone();
                bridge.register(step["id"].as_str().unwrap().into(),BrowserClient{
     user_id:step["owner"].as_str().unwrap().into(),
     active:Arc::new(move||if active_step["activeError"]==true{Err("active failed".into())}else{Ok(active_step["active"]!=false)}),
     send:Arc::new(move|request|{
      let id=current.lock().unwrap().clone();requests.lock().unwrap().insert(id.clone(),request.clone());
      sent.lock().unwrap().push(json!({"id":id,"client":step["id"],"expiresAt":request.expires_at,"command":request.command}));
      if let Some(result)=step.get("result"){callback_bridge.complete(step["id"].as_str().unwrap(),step["owner"].as_str().unwrap(),&request.request_id,result);}
      if step["disconnect"]==true{Err("send failed".into())}else{Ok(())}
     }),
    });
            }
            "unregister" => bridge.unregister(step["id"].as_str().unwrap()),
            "gateway" => {
                let callback_bridge = bridge.clone();
                let gateway = gateway.clone();
                let step = step.clone();
                bridge.set_gateway_handler(if step["enabled"]==true{Some(Arc::new(move|owner,command,signal|{
     gateway.lock().unwrap().push(json!({"owner":owner,"command":command,"aborted":signal.as_ref().is_some_and(MessengerAbortSignal::is_aborted)}));
     if step["reenter"]==true{callback_bridge.set_gateway_handler(None);}
     let result=if step["fail"]==true{Err("gateway failed".into())}else{Ok(MessengerToolResponse{ok:true,message:"gateway response".into(),data:Some(command)})};Box::pin(async move{result})
    }))}else{None});
            }
            "request" => {
                let id = step["id"].as_str().unwrap().to_owned();
                *current_id.lock().unwrap() = id.clone();
                let signal = if step["signal"] == true {
                    let signal = MessengerAbortSignal::default();
                    if step["aborted"] == true {
                        signal.abort();
                    }
                    signals.insert(id.clone(), signal.clone());
                    Some(signal)
                } else {
                    None
                };
                let future = bridge.request(
                    step["owner"].as_str(),
                    &step["input"],
                    signal,
                    step["timeout"].as_f64(),
                );
                let outcomes = outcomes.clone();
                futures.push(tokio::spawn(async move {
                    let result = match future.await {
                        Ok(result) => json!({"id":id,"result":result_value(result)}),
                        Err(error) => json!({"id":id,"error":error}),
                    };
                    outcomes.lock().unwrap().push(result);
                }));
            }
            "complete" => {
                let id = requests
                    .lock()
                    .unwrap()
                    .get(step["id"].as_str().unwrap())
                    .map(|request| request.request_id.clone())
                    .unwrap_or_else(|| "absent".into());
                bridge.complete(
                    step["client"].as_str().unwrap(),
                    step["owner"].as_str().unwrap(),
                    &id,
                    &expanded_result(step),
                );
            }
            "abort" => {
                if let Some(signal) = signals.get(step["id"].as_str().unwrap()) {
                    signal.abort();
                }
            }
            "tick" => {
                let ms = step["ms"].as_i64().unwrap();
                now.fetch_add(ms, Ordering::SeqCst);
                tokio::time::advance(std::time::Duration::from_millis(ms as u64)).await;
            }
            "stop" => bridge.stop(),
            _ => panic!("unknown native bridge action"),
        }
        for _ in 0..4 {
            tokio::task::yield_now().await;
        }
        counts.push(bridge.pending_count());
    }
    bridge.stop();
    for task in futures {
        task.await.unwrap();
    }
    bridge.set_gateway_handler(None);
    let outcomes = outcomes.lock().unwrap().clone();
    let sent = sent.lock().unwrap().clone();
    let gateway = gateway.lock().unwrap().clone();
    json!({"sent":sent,"outcomes":outcomes,"gateway":gateway,"counts":counts,"timers":bridge.pending_count()})
}
async fn compare(calls: Vec<Value>) {
    let cloned = calls.clone();
    let directory = root();
    let expected = tokio::task::spawn_blocking(move || {
        internal_driver::call(
            &directory,
            &directory
                .join(".jait/artifacts/gateway-rust/messenger-bridge")
                .join(uuid::Uuid::new_v4().to_string()),
            json!({"version":1,"calls":cloned}),
            &|| false,
        )
        .unwrap()
    })
    .await
    .unwrap();
    assert_eq!(expected.as_array().unwrap().len(), calls.len());
    for (call, expected) in calls.iter().zip(expected.as_array().unwrap()) {
        let actual = native(call).await;
        // Compare JSON number values after ECMAScript serialization, so f64
        // integral expiry timestamps have the same wire representation as JS.
        let actual: Value = serde_json::from_str(
            &jait_gateway::contracts::bounded_json::JsonGraph::from_value(&actual)
                .stringify()
                .unwrap(),
        )
        .unwrap();
        if &actual != expected {
            let file = root()
                .join(".jait/artifacts")
                .join(format!("mismatch-{}.json", uuid::Uuid::new_v4()));
            std::fs::write(
                &file,
                serde_json::to_vec_pretty(
                    &json!({"call":call,"actual":actual,"expected":expected}),
                )
                .unwrap(),
            )
            .unwrap();
            panic!("bridge mismatch: {}", file.display());
        }
    }
}
fn request(id: &str, owner: Option<&str>, input: Value) -> Value {
    let mut value = json!({"op":"request","id":id,"input":input});
    if let Some(owner) = owner {
        value["owner"] = json!(owner);
    }
    value
}
fn register(id: &str, owner: &str) -> Value {
    json!({"op":"register","id":id,"owner":owner})
}
fn sequence(steps: Vec<Value>) -> Value {
    json!({"op":"nativebridge.sequence","steps":steps})
}
#[tokio::test(start_paused = true)]
async fn command_schema_matches_strict_defaults_and_unicode_boundaries() {
    let mut inputs = vec![
        json!(null),
        json!([]),
        json!({}),
        json!({"action":"status"}),
        json!({"action":"status","extra":true}),
    ];
    for action in ["rooms", "messages", "search", "send", "open"] {
        let base = match action {
            "rooms" => json!({"action":action}),
            "messages" => json!({"action":action,"roomId":"!ok"}),
            "search" => json!({"action":action,"query":" word "}),
            "send" => json!({"action":action,"roomId":"!ok","text":"body"}),
            _ => json!({"action":action,"userId":"@a:server"}),
        };
        inputs.push(base.clone());
        for key in [
            "query", "service", "limit", "roomId", "text", "userId", "earlier",
        ] {
            for value in [
                json!(null),
                json!(true),
                json!(-1),
                json!(0),
                json!(1.5),
                json!(51),
                json!(""),
                json!("\u{feff}  "),
                json!("!a"),
                json!("@a:b\n"),
                json!("x".repeat(201)),
                json!("😀".repeat(101)),
            ] {
                let mut input = base.clone();
                input[key] = value;
                inputs.push(input);
            }
        }
    }
    let calls = inputs
        .chunks(64)
        .map(|inputs| json!({"op":"nativebridge.parse","inputs":inputs}))
        .collect();
    compare(calls).await;
}
#[tokio::test(start_paused = true)]
async fn ownership_unique_active_client_and_failures_match() {
    let mut disconnected = register("a", "alice");
    disconnected["disconnect"] = json!(true);
    let mut inactive = register("inactive", "alice");
    inactive["active"] = json!(false);
    let mut active_error = register("error", "alice");
    active_error["activeError"] = json!(true);
    compare(vec![sequence(vec![
        request("anonymous", None, json!({"action":"status"})),
        request("invalid", None, json!({"action":"unknown"})),
        request("none", Some("alice"), json!({"action":"status"})),
        register("b", "bob"),
        inactive,
        request("other-owner", Some("alice"), json!({"action":"status"})),
        register("a", "alice"),
        register("c", "alice"),
        request("multiple", Some("alice"), json!({"action":"status"})),
        json!({"op":"unregister","id":"c"}),
        disconnected,
        request("disconnected", Some("alice"), json!({"action":"status"})),
        active_error,
        request("active-failed", Some("alice"), json!({"action":"status"})),
    ])])
    .await;
}
#[tokio::test(start_paused = true)]
async fn spoofed_results_and_invalid_payloads_cannot_finish_requests() {
    compare(vec![sequence(vec![register("a","alice"),register("b","bob"),request("one",Some("alice"),json!({"action":"rooms"})),
 json!({"op":"complete","id":"one","client":"b","owner":"bob","result":{"ok":true,"message":"spoof"}}),
 json!({"op":"complete","id":"one","client":"a","owner":"bob","result":{"ok":true,"message":"spoof"}}),
 json!({"op":"complete","id":"one","client":"a","owner":"alice","result":{"ok":1,"message":"invalid"}}),
 json!({"op":"complete","id":"one","client":"a","owner":"alice","result":{"ok":true,"message":"done","data":{"rows":3},"extra":"discarded"}}),
 json!({"op":"complete","id":"one","client":"a","owner":"alice","result":{"ok":true,"message":"late"}})])]).await;
}
#[tokio::test(start_paused = true)]
async fn revoke_abort_timeout_and_send_race_never_retry() {
    let mut aborted = request("pre-abort", Some("alice"), json!({"action":"status"}));
    aborted["signal"] = json!(true);
    aborted["aborted"] = json!(true);
    let mut pending = request("cancel", Some("alice"), json!({"action":"status"}));
    pending["signal"] = json!(true);
    let mut timeout = request(
        "timeout",
        Some("alice"),
        json!({"action":"send","roomId":"!room","text":"hello"}),
    );
    timeout["timeout"] = json!(1);
    let mut inline = register("inline", "alice");
    inline["result"] = json!({"ok":true,"message":"sent"});
    inline["disconnect"] = json!(true);
    compare(vec![sequence(vec![register("a","alice"),aborted,pending,json!({"op":"abort","id":"cancel"}),json!({"op":"complete","id":"cancel","client":"a","owner":"alice","result":{"ok":true,"message":"late"}}),timeout,json!({"op":"tick","ms":1}),request("revoke",Some("alice"),json!({"action":"status"})),register("a","bob"),json!({"op":"unregister","id":"a"}),inline,request("inline",Some("alice"),json!({"action":"status"})),json!({"op":"stop"})])]).await;
}
#[tokio::test(start_paused = true)]
async fn output_budget_and_utf16_message_slice_match() {
    let mut calls = vec![];
    for result in [
        json!({"ok":true,"message":"a".repeat(1999)+"😀 tail","data":null}),
        json!({"ok":false,"message":"big","dataRepeat":149930}),
        json!({"ok":true,"message":"big","dataRepeat":150001}),
    ] {
        calls.push(sequence(vec![
            register("a", "alice"),
            request("one", Some("alice"), json!({"action":"status"})),
            json!({"op":"complete","id":"one","client":"a","owner":"alice","result":result}),
        ]));
    }
    // Keep large replies in separate bounded driver calls.
    for call in calls {
        compare(vec![call]).await;
    }
}
#[tokio::test(start_paused = true)]
async fn gateway_precedence_and_reentrant_handler_match() {
    let mut pre_aborted = request("aborted", Some("alice"), json!({"action":"status"}));
    pre_aborted["signal"] = json!(true);
    pre_aborted["aborted"] = json!(true);
    compare(vec![sequence(vec![
        json!({"op":"gateway","enabled":true,"reenter":true}),
        pre_aborted,
        request(
            "gateway",
            Some("alice"),
            json!({"action":"search","query":"  term  "}),
        ),
        request("fallback", Some("alice"), json!({"action":"status"})),
        json!({"op":"gateway","enabled":true,"fail":true}),
        request("failure", Some("alice"), json!({"action":"status"})),
    ])])
    .await;
}
#[tokio::test(start_paused = true)]
async fn pending_capacity_is_global_and_returns_after_stop() {
    let mut steps = vec![register("a", "alice"), register("b", "bob")];
    for i in 0..33 {
        steps.push(request(
            &i.to_string(),
            Some(if i % 2 == 0 { "alice" } else { "bob" }),
            json!({"action":"status"}),
        ));
    }
    steps.push(json!({"op":"stop"}));
    steps.push(register("a", "alice"));
    steps.push(request("new", Some("alice"), json!({"action":"status"})));
    compare(vec![sequence(steps)]).await;
}
