#[path = "../src/internal_driver.rs"]
mod internal_driver;
use futures_util::{FutureExt, StreamExt, future::BoxFuture, stream::FuturesUnordered};
use jait_gateway::{providers::steering_dispatcher::*, tools::core_io::HostError};
use serde_json::{Value, json};
use std::{
    path::PathBuf,
    sync::{
        Arc, Mutex,
        atomic::{AtomicUsize, Ordering},
    },
};
use tokio::sync::oneshot;

fn truthy(value: &Value) -> bool {
    match value {
        Value::Null => false,
        Value::Bool(v) => *v,
        Value::String(v) => !v.is_empty(),
        Value::Number(v) => v.as_f64().is_some_and(|v| v != 0.0),
        _ => true,
    }
}
fn messages(values: &[Arc<SteeringMessage>]) -> Value {
    json!(values.iter().map(|v| v.as_ref()).collect::<Vec<_>>())
}
type Cell<T> = Arc<Mutex<T>>;
type Task = BoxFuture<'static, Result<(), HostError>>;
#[derive(Default)]
struct Queue {
    messages: Mutex<Vec<Arc<SteeringMessage>>>,
    listeners: Cell<Vec<(usize, PendingListener)>>,
    next: AtomicUsize,
}
impl Queue {
    fn enqueue(&self, action: &Value) {
        let mut metadata = serde_json::Map::new();
        if truthy(&action["meta"]["hidden"]) {
            metadata.insert("hidden".into(), json!(true));
        }
        for name in ["displayContent", "queuedMessageId"] {
            if truthy(&action["meta"][name]) {
                metadata.insert(name.into(), action["meta"][name].clone());
            }
        }
        self.messages
            .lock()
            .unwrap()
            .push(Arc::new(SteeringMessage {
                message: action["message"].as_str().unwrap_or("").into(),
                metadata,
            }));
        let callbacks: Vec<_> = self
            .listeners
            .lock()
            .unwrap()
            .iter()
            .map(|(_, f)| f.clone())
            .collect();
        for listener in callbacks {
            listener();
        }
    }
    fn drain(&self) -> Vec<Arc<SteeringMessage>> {
        std::mem::take(&mut *self.messages.lock().unwrap())
    }
}
impl SteeringSource for Queue {
    fn has_pending(&self) -> bool {
        !self.messages.lock().unwrap().is_empty()
    }
    fn peek(&self) -> Option<Arc<SteeringMessage>> {
        self.messages.lock().unwrap().first().cloned()
    }
    fn consume(&self, message: &Arc<SteeringMessage>) -> bool {
        let mut pending = self.messages.lock().unwrap();
        if let Some(index) = pending.iter().position(|entry| Arc::ptr_eq(entry, message)) {
            pending.remove(index);
            true
        } else {
            false
        }
    }
    fn on_pending(&self, listener: PendingListener) -> Unsubscribe {
        let id = self.next.fetch_add(1, Ordering::SeqCst);
        self.listeners.lock().unwrap().push((id, listener));
        let listeners = self.listeners.clone();
        Box::new(move || listeners.lock().unwrap().retain(|(key, _)| *key != id))
    }
}
fn host_error(value: &Value) -> HostError {
    if let Some(error) = value.get("error") {
        HostError::Error(error.as_str().unwrap().into())
    } else {
        HostError::Thrown(value["thrown"].clone())
    }
}
fn error_value(error: &HostError) -> Value {
    match error {
        HostError::Error(error) => json!({"error":error}),
        HostError::Thrown(value) => json!({"thrown":value}),
    }
}
fn flush(scheduled: &Cell<Vec<Task>>, active: &mut FuturesUnordered<Task>) {
    for _ in 0..24 {
        for future in std::mem::take(&mut *scheduled.lock().unwrap()) {
            active.push(future);
        }
        while let Some(Some(result)) = active.next().now_or_never() {
            result.unwrap();
        }
    }
}
async fn native(test: &Value) -> Value {
    let queue = Arc::new(Queue::default());
    let events: Cell<Vec<Value>> = Cell::default();
    let pauses: Cell<Vec<Value>> = Cell::default();
    let scheduled: Cell<Vec<Task>> = Cell::default();
    type SteeringReply = oneshot::Sender<Result<bool, HostError>>;
    let held: Cell<Vec<Option<SteeringReply>>> = Cell::default();
    let mut active = FuturesUnordered::new();
    let responses = test["responses"].as_array().cloned().unwrap_or_default();
    let next = AtomicUsize::new(0);
    let event_log = events.clone();
    let held_acks = held.clone();
    let deliver: Deliver = Arc::new(move |message| {
        event_log.lock().unwrap().push(json!({"deliver":message}));
        let response = responses
            .get(next.fetch_add(1, Ordering::SeqCst))
            .cloned()
            .unwrap_or(json!(true));
        if response == "hold" {
            let (tx, rx) = oneshot::channel();
            held_acks.lock().unwrap().push(Some(tx));
            Box::pin(async move { rx.await.unwrap() })
        } else {
            Box::pin(async move {
                if response.is_object() {
                    Err(host_error(&response))
                } else {
                    Ok(response.as_bool().unwrap())
                }
            })
        }
    });
    let event_log = events.clone();
    let consumed: Consumed = Arc::new(move |message| {
        event_log
            .lock()
            .unwrap()
            .push(json!({"consumed":message.as_ref()}));
        Ok(())
    });
    let event_log = events.clone();
    let failed: Failed = Arc::new(move |error| {
        event_log
            .lock()
            .unwrap()
            .push(json!({"failed":error_value(&error)}));
        Ok(())
    });
    let tasks = scheduled.clone();
    let dispatcher = ProviderSteeringDispatcher::new(
        queue.clone(),
        deliver,
        consumed,
        failed,
        Arc::new(move |task| tasks.lock().unwrap().push(task)),
    );
    let mut snapshots = vec![];
    for action in test["actions"].as_array().unwrap() {
        match action["op"].as_str().unwrap() {
            "enqueue" => queue.enqueue(action),
            "start" => dispatcher.start(),
            "pause" => {
                let mut values = pauses.lock().unwrap();
                let index = values.len();
                values.push(json!("pending"));
                drop(values);
                let paused = dispatcher.pause();
                let values = pauses.clone();
                scheduled.lock().unwrap().push(Box::pin(async move {
                    let outcome = paused.await;
                    values.lock().unwrap()[index] = match outcome {
                        Ok(()) => json!("ok"),
                        Err(error) => error_value(&error),
                    };
                    Ok(())
                }));
            }
            "dispose" => dispatcher.dispose(),
            "resolve" | "reject" => {
                let index = action["index"].as_u64().unwrap_or(0) as usize;
                if let Some(sender) = held.lock().unwrap()[index].take() {
                    let result = if action["op"] == "reject" {
                        Err(host_error(action))
                    } else {
                        Ok(action["value"].as_bool().unwrap_or(true))
                    };
                    sender.send(result).unwrap();
                }
            }
            "drain" => events
                .lock()
                .unwrap()
                .push(json!({"drained":messages(&queue.drain())})),
            "flush" => flush(&scheduled, &mut active),
            op => panic!("unknown action {op}"),
        }
        snapshots.push(json!({"events":*events.lock().unwrap(),"pending":messages(&queue.messages.lock().unwrap()),"pauses":*pauses.lock().unwrap(),"listeners":queue.listeners.lock().unwrap().len()}));
    }
    dispatcher.dispose();
    for sender in held.lock().unwrap().iter_mut().filter_map(Option::take) {
        let _ = sender.send(Ok(false));
    }
    flush(&scheduled, &mut active);
    assert!(active.is_empty());
    json!(snapshots)
}
async fn compare(cases: Vec<Value>) {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap();
    let expected = internal_driver::call(
        &root,
        &root.join(".jait/artifacts/gateway-rust/steering-dispatcher/contracts"),
        json!({"version":1,"calls":[{"op":"nativesteeringdispatch.compare","cases":cases}]}),
        &|| false,
    )
    .unwrap()[0]
        .clone();
    for (index, test) in cases.iter().enumerate() {
        assert_eq!(native(test).await, expected[index], "case {index}: {test}");
    }
}
fn enqueue(message: &str) -> Value {
    json!({"op":"enqueue","message":message})
}
fn action(op: &str) -> Value {
    json!({"op":op})
}

#[tokio::test]
async fn starts_are_deferred_and_arrivals_are_acknowledged_in_fifo_order() {
    compare(vec![
        json!({"actions":[enqueue("before start"),action("flush"),action("start"),action("flush"),enqueue("after start"),action("flush"),action("pause"),action("flush")]}),
        json!({"responses":["hold",true],"actions":[action("start"),enqueue("first"),action("flush"),enqueue("second"),action("flush"),{"op":"resolve"},action("flush")]}),
        json!({"actions":[action("start"),enqueue("first"),enqueue("second"),action("start"),action("start"),action("flush"),action("start"),action("flush")]}),
        json!({"actions":[enqueue("first"),action("start"),action("pause"),enqueue("later"),action("flush"),action("start"),action("flush")]}),
    ]).await;
}
#[tokio::test]
async fn rejection_retains_fifo_fallback_and_only_start_reopens_delivery() {
    let mut cases = vec![];
    for response in [
        json!(false),
        json!({"error":"unsupported"}),
        json!({"thrown":null}),
        json!({"thrown":{"reason":"busy"}}),
    ] {
        cases.push(json!({"responses":[response,true,true],"actions":[action("start"),enqueue("first"),enqueue("second"),action("flush"),enqueue("third"),action("flush"),action("pause"),action("flush"),action("start"),action("flush")]}));
        cases.push(json!({"responses":[response],"actions":[enqueue("first"),enqueue("second"),action("start"),action("flush"),action("pause"),action("flush"),action("drain"),action("flush")]}));
    }
    compare(cases).await;
}
#[tokio::test]
async fn pause_waits_for_the_current_ack_and_preserves_later_arrivals() {
    let mut cases = vec![];
    for accepted in [true, false] {
        cases.push(json!({"responses":["hold",true],"actions":[action("start"),enqueue("first"),action("flush"),action("pause"),action("pause"),enqueue("after boundary"),action("flush"),{"op":"resolve","value":accepted},action("flush"),action("drain")]}));
        cases.push(json!({"responses":["hold",true],"actions":[action("start"),enqueue("first"),action("flush"),action("pause"),action("start"),enqueue("next turn"),{"op":"resolve","value":accepted},action("flush"),action("start"),action("flush")]}));
    }
    cases.push(json!({"responses":["hold"],"actions":[action("start"),enqueue("first"),action("flush"),action("pause"),{"op":"reject","error":"connection closed"},action("flush"),action("drain")]}));
    compare(cases).await;
}
#[tokio::test]
async fn dispose_unsubscribes_and_suppresses_late_transcript_markers() {
    compare(vec![
        json!({"actions":[enqueue("first"),action("start"),action("dispose"),action("dispose"),action("start"),action("flush"),action("pause"),action("flush")]}),
        json!({"responses":["hold"],"actions":[action("start"),enqueue("first"),action("flush"),action("dispose"),enqueue("cancelled"),action("start"),{"op":"resolve"},action("flush"),action("pause"),action("flush"),action("drain")]}),
        json!({"responses":["hold"],"actions":[action("start"),enqueue("first"),action("flush"),action("dispose"),{"op":"reject","thrown":"failure after dispose"},action("flush"),action("drain")]}),
    ]).await;
}
#[tokio::test]
async fn exact_object_consumption_and_message_metadata_survive_acknowledgement() {
    compare(vec![
        json!({"responses":["hold",true],"actions":[action("start"),enqueue("same"),action("flush"),action("drain"),enqueue("same"),{"op":"resolve"},action("flush")]}),
        json!({"responses":["hold"],"actions":[action("start"),enqueue("first"),action("flush"),action("drain"),{"op":"resolve"},action("flush")]}),
        json!({"actions":[{"op":"enqueue","message":"😀\n[STEERING] nested","meta":{"hidden":true,"displayContent":"visible","queuedMessageId":"q1","extra":"stripped"}},enqueue(""),{"op":"enqueue","message":"last","meta":{"hidden":false,"displayContent":"","queuedMessageId":""}},action("start"),action("flush")]}),
    ]).await;
}

#[tokio::test]
async fn cancelled_host_tasks_release_pause_and_do_not_retry_uncertain_delivery() {
    let queue = Arc::new(Queue::default());
    let tasks: Cell<Vec<Task>> = Cell::default();
    let schedule = tasks.clone();
    let dispatcher = ProviderSteeringDispatcher::new(
        queue.clone(),
        Arc::new(|_| Box::pin(std::future::pending())),
        Arc::new(|_| Ok(())),
        Arc::new(|_| Ok(())),
        Arc::new(move |task| schedule.lock().unwrap().push(task)),
    );
    queue.enqueue(&enqueue("keep"));
    dispatcher.start();
    let mut pending = FuturesUnordered::new();
    flush(&tasks, &mut pending);
    let pause = dispatcher.pause();
    pending.clear();
    assert_eq!(
        pause.await,
        Err(HostError::Error("Steering task cancelled".into()))
    );
    queue.enqueue(&enqueue("later"));
    assert!(tasks.lock().unwrap().is_empty());
    assert_eq!(queue.messages.lock().unwrap().len(), 2);
    dispatcher.start();
    assert_eq!(tasks.lock().unwrap().len(), 1);
    let pause = dispatcher.pause();
    tasks.lock().unwrap().clear();
    assert_eq!(
        pause.await,
        Err(HostError::Error("Steering task cancelled".into()))
    );
    dispatcher.dispose();
    assert!(queue.listeners.lock().unwrap().is_empty());
}

#[tokio::test]
async fn dropping_an_unpolled_active_task_blocks_automatic_retry() {
    let queue = Arc::new(Queue::default());
    let tasks: Cell<Vec<Task>> = Cell::default();
    let schedule = tasks.clone();
    let dispatcher = ProviderSteeringDispatcher::new(
        queue.clone(),
        Arc::new(|_| Box::pin(std::future::pending())),
        Arc::new(|_| Ok(())),
        Arc::new(|_| Ok(())),
        Arc::new(move |task| schedule.lock().unwrap().push(task)),
    );
    queue.enqueue(&enqueue("uncertain"));
    dispatcher.start();
    let admitted = std::mem::take(&mut *tasks.lock().unwrap());
    drop(admitted);
    queue.enqueue(&enqueue("later"));
    let remaining = tasks.lock().unwrap().len();
    assert_eq!(remaining, 0);
    dispatcher.start();
    let admitted = std::mem::take(&mut *tasks.lock().unwrap());
    assert_eq!(admitted.len(), 1);
    dispatcher.dispose();
    drop(admitted);
    drop(dispatcher);
    assert!(queue.listeners.lock().unwrap().is_empty());
}
