//! Contract coverage for the resumable `user.ask` refresh.
//!
//! Every differential assertion replays the same step script through the real
//! Python-free TypeScript bridge (`nativeaskresume.ts`) and through the native
//! `input_requests`/`user_ask` code, then compares whole JSON documents.
//! Generated request ids are normalised to `<requestId>` because uuid v7 values
//! legitimately differ between implementations.
//!
//! Timers: the TypeScript bridge replaces `setTimeout`/`clearTimeout` with a
//! caller-driven queue, and native waits run on a paused Tokio clock advanced by
//! exactly `RESUME_WAIT_MS`. Nothing sleeps.

#[path = "../src/internal_driver.rs"]
mod internal_driver;

use jait_gateway::{
    services::input_requests::{QuestionInput, UserQuestionService, WaitOutcome},
    tools::user_ask::{self, AskContext, UserAskInput},
};
use serde_json::{Value, json};
use std::{
    path::PathBuf,
    sync::{
        Arc, Mutex,
        atomic::{AtomicUsize, Ordering},
    },
    time::Duration,
};

/// 2026-10-18T12:00:00.000Z, the instant the TypeScript bridge pins `Date` to.
const NOW_MS: i64 = 1_792_324_800_000;
/// Production deadline. The constant itself is asserted, never shortened.
const RESUME_WAIT_MS: u64 = 60_000;

type Clock = Arc<dyn Fn() -> i64 + Send + Sync>;

fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}

fn artefact_dir() -> PathBuf {
    static SEQ: AtomicUsize = AtomicUsize::new(0);
    let directory = root()
        .join(".jait/artifacts/gateway-rust/parallel-20261020/user-ask-resume")
        .join(format!(
            "run-{}-{}",
            std::process::id(),
            SEQ.fetch_add(1, Ordering::SeqCst)
        ));
    std::fs::create_dir_all(&directory).unwrap();
    directory
}

/// Runs one driver call and returns `results[0]`; the bridge returns the results
/// array, not the `{version, results}` envelope.
fn reference(call: Value) -> Value {
    internal_driver::call(
        &root(),
        &artefact_dir(),
        json!({"version": 1, "calls": [call]}),
        &|| false,
    )
    .unwrap()[0]
        .clone()
}

fn clock() -> Clock {
    Arc::new(|| NOW_MS)
}

fn questions() -> Vec<Value> {
    vec![json!({"id": "deploy_target", "header": "Target", "question": "Where?"})]
}

fn input() -> QuestionInput {
    QuestionInput {
        session_id: "session-a".into(),
        user_id: Some("owner-a".into()),
        requested_by: Some("user.ask".into()),
        title: Some("Deploy".into()),
        attention: Some("urgent".into()),
        questions: questions(),
    }
}

/// Records the observable callback projections both implementations report.
type Events = Arc<Mutex<Vec<Value>>>;

fn observer(
    kind: &'static str,
    events: Events,
) -> Arc<dyn Fn(jait_gateway::services::input_requests::InputRequest) + Send + Sync> {
    Arc::new(
        move |request: jait_gateway::services::input_requests::InputRequest| {
            let value = serde_json::to_value(&request).unwrap();
            events.lock().unwrap().push(json!({
                "kind": kind,
                "status": value["status"],
                "title": value["title"],
                "createdAt": value["createdAt"],
                "questions": value["questions"].as_array().map(Vec::len).unwrap_or(0),
            }));
        },
    )
}

fn scrub(value: &mut Value, ids: &[String]) {
    match value {
        Value::String(text) => {
            if ids.iter().any(|id| id == text) {
                *text = "<requestId>".into();
            }
        }
        Value::Array(items) => items.iter_mut().for_each(|item| scrub(item, ids)),
        Value::Object(map) => map.values_mut().for_each(|item| scrub(item, ids)),
        _ => {}
    }
}

fn text<'a>(value: &'a Value, key: &str) -> Option<&'a str> {
    value.get(key).and_then(Value::as_str)
}

fn owned_text(value: &Value, key: &str) -> Option<String> {
    text(value, key).map(str::to_owned)
}

/// Native mirror of `nativeaskresume.ts`: the same step script, the same JSON.
async fn run_scenario(steps: &Value) -> Value {
    let events: Events = Events::default();
    let on_request = observer("request", events.clone());
    let on_resolved = observer("resolved", events.clone());
    let service = UserQuestionService::new(clock(), Some(on_request), Some(on_resolved));
    let mut ids: Vec<String> = Vec::new();
    let mut seen: Vec<String> = Vec::new();
    let mut out: Vec<Value> = Vec::new();
    let steps = steps.as_array().expect("steps array").clone();
    for step in steps {
        match text(&step, "op").expect("op") {
            "observeDetached" => {
                service.set_on_detached_resolved(Some(observer("detached", events.clone())));
                out.push(json!({"observing":true}));
            }
            "start" => {
                ids.push(
                    service.start_resumable(QuestionInput {
                        session_id: text(&step, "sessionId").unwrap_or_default().into(),
                        user_id: owned_text(&step, "userId"),
                        requested_by: Some(text(&step, "requestedBy").unwrap_or("user.ask").into()),
                        title: owned_text(&step, "title"),
                        attention: owned_text(&step, "attention"),
                        questions: step
                            .get("questions")
                            .and_then(Value::as_array)
                            .cloned()
                            .unwrap_or_default(),
                    }),
                );
                out.push(json!({"started": true}));
            }
            "ask" => {
                let input: UserAskInput = serde_json::from_value(step["input"].clone()).unwrap();
                let context = AskContext {
                    session_id: text(&step["context"], "sessionId")
                        .unwrap_or_default()
                        .into(),
                    user_id: owned_text(&step["context"], "userId"),
                    requested_by: owned_text(&step["context"], "requestedBy"),
                };
                let fire = step.get("fire").and_then(Value::as_bool) != Some(false);
                let worker = service.clone();
                let handle =
                    tokio::spawn(async move { user_ask::execute(&worker, input, &context).await });
                for _ in 0..16 {
                    tokio::task::yield_now().await;
                }
                let settled_now = handle.is_finished();
                let result = if settled_now {
                    Some(handle.await.unwrap())
                } else if fire {
                    // Advancing only completes waits that own a deadline; a plain
                    // ask has none, so it must stay observable as unsettled.
                    tokio::time::advance(Duration::from_millis(RESUME_WAIT_MS)).await;
                    for _ in 0..8 {
                        tokio::task::yield_now().await;
                    }
                    if handle.is_finished() {
                        Some(handle.await.unwrap())
                    } else {
                        handle.abort();
                        None
                    }
                } else {
                    handle.abort();
                    None
                };
                out.push(match result {
                    Some(result) => json!({"settled": true, "result": result}),
                    None => json!({"settled": false, "result": null}),
                });
            }
            "wait" => {
                let id = match step.get("request") {
                    Some(Value::String(last)) if last == "last" => service
                        .list_pending(None, None)
                        .last()
                        .map(|r| r.id.clone()),
                    Some(Value::Number(index)) => {
                        ids.get(index.as_u64().unwrap() as usize).cloned()
                    }
                    _ => None,
                };
                let session = text(&step, "sessionId").unwrap_or_default().to_owned();
                let user = owned_text(&step, "userId");
                let yield_after = match step["options"].get("yieldAfterMs") {
                    Some(Value::Null) => None,
                    Some(v) => Some(Duration::from_millis(v.as_u64().unwrap())),
                    None => Some(Duration::from_millis(RESUME_WAIT_MS)),
                };
                let fire = step.get("fire").and_then(Value::as_bool) != Some(false);
                let worker = service.clone();
                let handle = tokio::spawn(async move {
                    match id {
                        Some(id) => {
                            match worker
                                .wait_for_answer_with_timeout(
                                    &id,
                                    &session,
                                    user.as_deref(),
                                    yield_after,
                                )
                                .await
                            {
                                WaitOutcome::Missing => json!({"status": "missing"}),
                                WaitOutcome::Pending => json!({"status": "pending"}),
                                WaitOutcome::Answered(result) => {
                                    json!({"status": "answered", "result": result})
                                }
                            }
                        }
                        None => json!({"status": "missing"}),
                    }
                });
                for _ in 0..16 {
                    tokio::task::yield_now().await;
                }
                let settled_now = handle.is_finished();
                let outcome = if settled_now {
                    Some(handle.await.unwrap())
                } else if fire {
                    tokio::time::advance(Duration::from_millis(RESUME_WAIT_MS)).await;
                    for _ in 0..8 {
                        tokio::task::yield_now().await;
                    }
                    if handle.is_finished() {
                        Some(handle.await.unwrap())
                    } else {
                        handle.abort();
                        None
                    }
                } else {
                    handle.abort();
                    None
                };
                out.push(match outcome {
                    Some(outcome) => json!({"settled": true, "outcome": outcome}),
                    None => json!({"settled": false, "outcome": null}),
                });
            }
            "concurrent" => {
                let mut handles = Vec::new();
                for wait in step["waits"].as_array().cloned().unwrap_or_default() {
                    let id = match wait.get("request") {
                        Some(Value::Number(index)) => {
                            ids.get(index.as_u64().unwrap() as usize).cloned()
                        }
                        _ => None,
                    };
                    let session = text(&wait, "sessionId").unwrap_or_default().to_owned();
                    let user = owned_text(&wait, "userId");
                    let yield_after = match wait["options"].get("yieldAfterMs") {
                        Some(Value::Null) => None,
                        Some(v) => Some(Duration::from_millis(v.as_u64().unwrap())),
                        None => Some(Duration::from_millis(RESUME_WAIT_MS)),
                    };
                    let worker = service.clone();
                    handles.push(tokio::spawn(async move {
                        match id {
                            Some(id) => {
                                match worker
                                    .wait_for_answer_with_timeout(
                                        &id,
                                        &session,
                                        user.as_deref(),
                                        yield_after,
                                    )
                                    .await
                                {
                                    WaitOutcome::Missing => json!({"status": "missing"}),
                                    WaitOutcome::Pending => json!({"status": "pending"}),
                                    WaitOutcome::Answered(result) => {
                                        json!({"status": "answered", "result": result})
                                    }
                                }
                            }
                            None => json!({"status": "missing"}),
                        }
                    }));
                }
                for _ in 0..16 {
                    tokio::task::yield_now().await;
                }
                let applied = step.get("then").map(|action| apply(&service, &ids, action));
                for _ in 0..4 {
                    tokio::task::yield_now().await;
                }
                if step.get("fire").and_then(Value::as_bool) != Some(false) {
                    tokio::time::advance(Duration::from_millis(RESUME_WAIT_MS)).await;
                }
                let mut waits = Vec::new();
                for handle in handles {
                    let settled = handle.is_finished();
                    let outcome = if settled {
                        handle.await.unwrap()
                    } else {
                        handle.abort();
                        Value::Null
                    };
                    waits.push(json!({"settled": settled, "outcome": outcome}));
                }
                out.push(json!({"applied": applied, "waits": waits}));
                let applied_after = match step.get("then") {
                    Some(action) => apply(&service, &ids, action),
                    None => Value::Null,
                };
                out.push(json!({"appliedAfterFire": applied_after}));
            }
            "submit" | "cancel" => out.push(apply(&service, &ids, &step)),
            "list" => {
                let pending = service.list_pending(
                    text(&step, "sessionId"),
                    step.get("userId").and_then(Value::as_str),
                );
                out.push(json!({
                    "count": pending.len(),
                    "statuses": pending.iter().map(|r| r.status.clone()).collect::<Vec<_>>(),
                }));
            }
            other => panic!("unknown step {other}"),
        }
        for id in &ids {
            if !seen.contains(id) {
                seen.push(id.clone());
            }
        }
        for request in service.list_pending(None, None) {
            if !seen.contains(&request.id) {
                seen.push(request.id);
            }
        }
        for _ in 0..4 {
            tokio::task::yield_now().await;
        }
    }
    let pending = service.list_pending(None, None);
    let mut document = json!({
        "events": events.lock().unwrap().clone(),
        "steps": out,
        "pending": {
            "count": pending.len(),
            "statuses": pending.iter().map(|r| r.status.clone()).collect::<Vec<_>>(),
        },
    });
    scrub(&mut document, &seen);
    document
}

fn apply(service: &UserQuestionService, ids: &[String], action: &Value) -> Value {
    let id = match action.get("request") {
        Some(Value::String(last)) if last == "last" => service
            .list_pending(None, None)
            .last()
            .map(|r| r.id.clone()),
        Some(Value::Number(index)) => ids.get(index.as_u64().unwrap() as usize).cloned(),
        _ => None,
    };
    let user = owned_text(action, "userId");
    match text(action, "op") {
        Some("submit") => {
            let ok = id
                .map(|id| {
                    service.submit(
                        &id,
                        action.get("value").cloned().unwrap_or(Value::Null),
                        user.as_deref(),
                    )
                })
                .unwrap_or(false);
            json!({"ok": ok})
        }
        Some("cancel") => {
            let ok = id
                .map(|id| service.cancel(&id, user.as_deref()))
                .unwrap_or(false);
            json!({"ok": ok})
        }
        other => panic!("unknown action {other:?}"),
    }
}

fn replay(steps: Value) -> Value {
    reference(json!({"op": "nativeaskresume.scenario", "steps": steps}))
}

// ---------------------------------------------------------------- metadata

#[test]
fn metadata_is_exactly_the_constructor_definition() {
    let reference = reference(json!({"op": "nativeask.metadata"}));
    assert_eq!(
        serde_json::to_value(user_ask::metadata()).unwrap(),
        reference
    );

    let parameters = &reference["parameters"];
    assert_eq!(parameters["type"], "object");
    // `questions` is optional now that a call may resume with only a requestId.
    assert!(
        parameters.get("required").is_none(),
        "resuming with only requestId must not be rejected by schema validation"
    );
    assert_eq!(
        parameters["properties"]["requestId"]["type"], "string",
        "the resume handle must be documented"
    );
    let questions = parameters["properties"]["questions"]["description"]
        .as_str()
        .unwrap();
    assert!(questions.contains("Required unless resuming with requestId"));
    assert!(
        reference["description"]
            .as_str()
            .unwrap()
            .contains("MCP calls may return pending with a requestId")
    );
    assert_eq!(reference["name"], "user.ask");
}

// ---------------------------------------------------------------- scenarios

#[tokio::test(start_paused = true)]
async fn pending_wait_retains_answer_until_collected_once() {
    let steps = json!([
        {"op": "start", "sessionId": "session-a", "userId": "owner-a"},
        {"op": "wait", "request": 0, "sessionId": "session-a", "userId": "owner-a"},
        {"op": "wait", "request": 0, "sessionId": "session-a", "userId": "owner-a"},
        {"op": "submit", "request": 0, "value": "blue", "userId": "owner-a"},
        {"op": "wait", "request": 0, "sessionId": "session-a", "userId": "owner-a", "fire": false},
        {"op": "wait", "request": 0, "sessionId": "session-a", "userId": "owner-a", "fire": false},
        {"op": "list"}
    ]);
    let expected = replay(steps.clone());
    let actual = run_scenario(&steps).await;
    assert_eq!(actual, expected);
    assert_eq!(actual["steps"][1]["outcome"], json!({"status": "pending"}));
    assert_eq!(actual["steps"][2]["outcome"], json!({"status": "pending"}));
    assert_eq!(
        actual["steps"][4]["outcome"],
        json!({"status": "answered", "result": "blue"}),
        "an answer that arrives between waits resolves the next wait without a timer"
    );
    assert_eq!(
        actual["steps"][5]["outcome"],
        json!({"status": "missing"}),
        "collection is one-time"
    );
}

#[tokio::test(start_paused = true)]
async fn waits_are_bound_to_the_exact_session_and_owner() {
    let steps = json!([
        {"op": "start", "sessionId": "session-a", "userId": "owner-a"},
        {"op": "wait", "request": 0, "sessionId": "session-b", "userId": "owner-a", "fire": false},
        {"op": "wait", "request": 0, "sessionId": "session-a", "userId": "owner-b", "fire": false},
        {"op": "wait", "request": 0, "sessionId": "session-a", "userId": null, "fire": false},
        {"op": "list"},
        {"op": "submit", "request": 0, "value": "blue", "userId": "owner-b"},
        {"op": "list"},
        {"op": "submit", "request": 0, "value": "blue", "userId": "owner-a"},
        {"op": "wait", "request": 0, "sessionId": "session-a", "userId": "owner-a", "fire": false}
    ]);
    let expected = replay(steps.clone());
    let actual = run_scenario(&steps).await;
    assert_eq!(actual, expected);
    for index in 1..4 {
        assert_eq!(
            actual["steps"][index]["outcome"],
            json!({"status": "missing"})
        );
        assert_eq!(actual["steps"][index]["settled"], true);
    }
    assert_eq!(
        actual["steps"][4]["count"], 1,
        "a rejected probe keeps the request"
    );
    assert_eq!(
        actual["steps"][5]["ok"], false,
        "a foreign owner cannot answer"
    );
    assert_eq!(actual["steps"][6]["count"], 1);
    assert_eq!(actual["steps"][7]["ok"], true);
    assert_eq!(
        actual["steps"][8]["outcome"],
        json!({"status": "answered", "result": "blue"})
    );
}

#[tokio::test(start_paused = true)]
async fn cancellation_between_waits_retains_the_request() {
    // MCP clients hit their own deadline and call again. Abandoning a native wait
    // must not evict the request or drop the answer.
    let service = UserQuestionService::new(clock(), None, None);
    let id = service.start_resumable(input());

    let abandoned = service.clone();
    let waiting = id.clone();
    let handle = tokio::spawn(async move {
        abandoned
            .wait_for_answer(&waiting, "session-a", Some("owner-a"))
            .await
    });
    for _ in 0..16 {
        tokio::task::yield_now().await;
    }
    assert!(!handle.is_finished(), "the wait is parked on the deadline");
    handle.abort();
    assert!(handle.await.is_err());

    assert_eq!(
        service.list_pending(None, None).len(),
        1,
        "request survives abort"
    );
    assert!(service.submit(&id, "blue".into(), Some("owner-a")));

    assert_eq!(
        service
            .wait_for_answer(&id, "session-a", Some("owner-a"))
            .await,
        WaitOutcome::Answered(Some(Value::String("blue".into()))),
        "the answer given while nothing was waiting is still collectable"
    );
    assert_eq!(
        service
            .wait_for_answer(&id, "session-a", Some("owner-a"))
            .await,
        WaitOutcome::Missing
    );
}

#[tokio::test(start_paused = true)]
async fn concurrent_waits_share_one_answer() {
    let steps = json!([
        {"op": "start", "sessionId": "session-a", "userId": "owner-a"},
        {"op": "concurrent",
         "waits": [
            {"request": 0, "sessionId": "session-a", "userId": "owner-a"},
            {"request": 0, "sessionId": "session-a", "userId": "owner-a"},
            {"request": 0, "sessionId": "session-b", "userId": "owner-a"}
         ],
         "then": {"op": "submit", "request": 0, "value": "blue", "userId": "owner-a"}},
        {"op": "wait", "request": 0, "sessionId": "session-a", "userId": "owner-a", "fire": false}
    ]);
    let expected = replay(steps.clone());
    let actual = run_scenario(&steps).await;
    assert_eq!(actual, expected);
    let waits = actual["steps"][1]["waits"].as_array().unwrap();
    assert_eq!(
        waits[0]["outcome"],
        json!({"status": "answered", "result": "blue"})
    );
    assert_eq!(
        waits[1]["outcome"],
        json!({"status": "answered", "result": "blue"}),
        "both waiters observe the same settled answer"
    );
    assert_eq!(
        waits[2]["outcome"],
        json!({"status": "missing"}),
        "a wait from another session never joins the fan-out"
    );
    assert_eq!(
        actual["steps"].as_array().unwrap().last().unwrap()["outcome"],
        json!({"status": "missing"})
    );
}

#[tokio::test(start_paused = true)]
async fn cancelled_request_reports_cancellation_not_an_answer() {
    let steps = json!([
        {"op": "start", "sessionId": "session-a", "userId": "owner-a"},
        {"op": "wait", "request": 0, "sessionId": "session-a", "userId": "owner-a"},
        {"op": "cancel", "request": 0, "userId": "owner-a"},
        {"op": "wait", "request": 0, "sessionId": "session-a", "userId": "owner-a", "fire": false}
    ]);
    let expected = replay(steps.clone());
    let actual = run_scenario(&steps).await;
    assert_eq!(actual, expected);
    assert_eq!(
        actual["steps"][3]["outcome"],
        json!({"status": "answered", "result": null}),
        "cancellation settles the promise with null, so the tool reports cancellation"
    );
    assert_eq!(
        actual["events"].as_array().unwrap().last().unwrap()["status"],
        "cancelled"
    );
}

// ---------------------------------------------------------------- tool / MCP

#[tokio::test(start_paused = true)]
async fn mcp_new_request_is_resumable_and_rejects_questions_on_resume() {
    let steps = json!([
        {"op": "ask",
         "input": {"title": "Deploy", "questions": [
            {"id": "q1", "header": "Target", "question": "Where?", "options": [{"label": "a"}]}]},
         "context": {"sessionId": "session-a", "userId": "owner-a", "requestedBy": "mcp-client"}},
        {"op": "list"},
        {"op": "submit", "request": "last", "value": "blue", "userId": "owner-a"},
        {"op": "list"},
        {"op": "ask",
         "input": {"requestId": "<resume>", "questions": [
            {"id": "q1", "header": "Target", "question": "Where?"}]},
         "context": {"sessionId": "session-a", "userId": "owner-a", "requestedBy": "mcp-client"}}
    ]);
    // The driver cannot know the generated id, so the resume step is rewritten
    // here from the pending list before both implementations replay it.
    let expected_pending = replay(json!([steps[0].clone()]));
    let request_id = expected_pending["steps"][0]["result"]["data"]["requestId"]
        .as_str()
        .unwrap()
        .to_owned();
    assert_eq!(
        expected_pending["steps"][0]["result"]["data"]["status"],
        "pending"
    );
    assert_eq!(expected_pending["steps"][0]["result"]["ok"], true);

    let mut steps = steps;
    steps[4]["input"]["requestId"] = json!(request_id);
    let expected = replay(steps.clone());
    let actual = run_scenario(&steps).await;
    assert_eq!(actual, expected);
    assert_eq!(actual["steps"][1]["count"], 1);
    assert_eq!(
        actual["steps"][4]["result"],
        json!({
            "ok": false,
            "message": "Resume with only requestId; do not supply new questions."
        })
    );
}

#[tokio::test(start_paused = true)]
async fn resume_after_answer_is_collected_and_then_missing() {
    let steps = json!([
        {"op": "ask",
         "input": {"questions": [{"id": "q1", "header": "H", "question": "Q?"}]},
         "context": {"sessionId": "session-a", "userId": "owner-a", "requestedBy": "mcp-client"}}
    ]);
    let first = replay(steps.clone());
    let request_id = first["steps"][0]["result"]["data"]["requestId"]
        .as_str()
        .unwrap()
        .to_owned();
    assert_eq!(
        first["pending"]["count"], 1,
        "a pending MCP request stays listed"
    );

    let steps = json!([
        {"op": "start", "sessionId": "session-a", "userId": "owner-a"},
        {"op": "submit", "request": 0, "value": "blue", "userId": "owner-a"},
        {"op": "ask",
         "input": {"requestId": "<resume>"},
         "context": {"sessionId": "session-a", "userId": "owner-a", "requestedBy": "mcp-client"}},
        {"op": "ask",
         "input": {"requestId": "<resume>"},
         "context": {"sessionId": "session-b", "userId": "owner-a", "requestedBy": "mcp-client"}}
    ]);
    // Resuming an id that was never started by this session is missing, and the
    // tool says so without creating a new question.
    let mut probe = steps.clone();
    probe[2]["input"]["requestId"] = json!(request_id);
    probe[3]["input"]["requestId"] = json!(request_id);
    let expected = replay(probe.clone());
    let actual = run_scenario(&probe).await;
    assert_eq!(actual, expected);
    assert_eq!(
        actual["steps"][2]["result"],
        json!({
            "ok": false,
            "message": "Question request not found for this user and session."
        })
    );
    assert_eq!(actual["pending"]["count"], 0, "the probe created nothing");
}

#[tokio::test(start_paused = true)]
async fn non_mcp_calls_keep_plain_ask_semantics() {
    let steps = json!([
        {"op": "ask",
         "input": {"title": "Deploy", "attention": "urgent", "questions": [
            {"id": "q1", "header": "H", "question": "Q?"}]},
         "context": {"sessionId": "session-a", "userId": "owner-a"}},
        {"op": "list"},
        {"op": "ask",
         "input": {"questions": [{"id": "q1", "header": "H", "question": "Q?"}]},
         "context": {"sessionId": "session-a", "userId": "owner-a"}},
        {"op": "list"}
    ]);
    let expected = replay(steps.clone());
    let actual = run_scenario(&steps).await;
    assert_eq!(actual, expected);
    assert_eq!(
        actual["steps"][0],
        json!({"settled": false, "result": null})
    );
    assert_eq!(
        actual["steps"][2],
        json!({"settled": false, "result": null})
    );
    assert_eq!(
        actual["pending"]["count"], 2,
        "plain asks remain pending without an answer or cancellation"
    );
}

// ---------------------------------------------------------------- inputs / deadline

#[test]
fn optional_fields_default_without_breaking_old_inputs() {
    let input: UserAskInput = serde_json::from_value(
        json!({"questions": [{"id": "q", "header": "H", "question": "Q?"}]}),
    )
    .unwrap();
    assert_eq!(input.request_id, None);
    assert_eq!(input.questions.len(), 1);

    let empty: UserAskInput = serde_json::from_value(json!({})).unwrap();
    assert_eq!(empty.request_id, None);
    assert!(empty.questions.is_empty());
    assert_eq!(empty.title, None);
    assert_eq!(empty.attention, None);

    let context = AskContext {
        session_id: "s".into(),
        user_id: None,
        requested_by: None,
    };
    assert_eq!(
        context.requested_by, None,
        "absent requestedBy is not MCP-origin"
    );

    let resumable: UserAskInput = serde_json::from_value(json!({"requestId": "req-1"})).unwrap();
    assert_eq!(resumable.request_id.as_deref(), Some("req-1"));
}

#[tokio::test(start_paused = true)]
async fn deadline_is_sixty_seconds_and_cleared_after_answering() {
    let service = UserQuestionService::new(clock(), None, None);
    assert_eq!(
        service.resume_wait(),
        Duration::from_millis(RESUME_WAIT_MS),
        "production deadline must stay at 60 s"
    );

    let reported = reference(json!({"op": "nativeaskresume.timers"}));
    assert_eq!(reported["scheduled"], json!([60_000]));
    assert_eq!(reported["outcome"], json!({"status": "pending"}));
    assert_eq!(
        reported["remaining"], 0,
        "the timer is cleared in `finally`"
    );

    // Native expiry keeps the request addressable; 59.999 s is not enough.
    let id = service.start_resumable(input());
    let early = service.clone();
    let waiting = id.clone();
    let handle = tokio::spawn(async move {
        early
            .wait_for_answer(&waiting, "session-a", Some("owner-a"))
            .await
    });
    for _ in 0..16 {
        tokio::task::yield_now().await;
    }
    tokio::time::advance(Duration::from_millis(RESUME_WAIT_MS - 1)).await;
    for _ in 0..4 {
        tokio::task::yield_now().await;
    }
    assert!(!handle.is_finished(), "59.999 s must not expire the wait");
    tokio::time::advance(Duration::from_millis(1)).await;
    assert_eq!(handle.await.unwrap(), WaitOutcome::Pending);
    assert_eq!(
        service
            .list_pending(Some("session-a"), Some("owner-a"))
            .len(),
        1
    );
    assert!(service.submit(&id, "blue".into(), Some("owner-a")));
    assert_eq!(
        service
            .wait_for_answer(&id, "session-a", Some("owner-a"))
            .await,
        WaitOutcome::Answered(Some(Value::String("blue".into())))
    );
}

#[tokio::test(start_paused = true)]
async fn empty_and_duplicate_question_sets_still_fail_before_any_request() {
    let service = UserQuestionService::new(clock(), None, None);
    for (input, message) in [
        (
            json!({"questions": []}),
            "At least one question is required.",
        ),
        (
            json!({"questions": [{"id": "q", "header": "H", "question": "Q?"},
                                 {"id": "q", "header": "H2", "question": "Q2?"}]}),
            "Duplicate question id(s): q",
        ),
        (
            json!({"questions": [{"id": "", "header": "H", "question": "Q?"}]}),
            "Each question requires id, header, and question.",
        ),
    ] {
        let context = AskContext {
            session_id: "session-a".into(),
            user_id: Some("owner-a".into()),
            requested_by: Some("mcp-client".into()),
        };
        let parsed: UserAskInput = serde_json::from_value(input).unwrap();
        let result = user_ask::execute(&service, parsed, &context).await;
        assert_eq!(result["ok"], false);
        assert_eq!(result["message"].as_str(), Some(message));
    }
    assert_eq!(
        service.list_pending(None, None).len(),
        0,
        "validation never registers a resumable request"
    );
}

#[tokio::test(start_paused = true)]
async fn delayed_question_and_browser_answers_wake_once_without_losing_results() {
    for tool in ["user.ask", "browser.handoff"] {
        for cancel in [false, true] {
            let steps = json!([
                {"op":"observeDetached"},
                {"op":"start","sessionId":"chat","userId":"owner","requestedBy":tool},
                {"op":"wait","request":0,"sessionId":"chat","userId":"owner"},
                {"op":"submit","request":0,"userId":"foreign","value":{"answers":{}}},
                {"op":if cancel { "cancel" } else { "submit" },"request":0,"userId":"owner",
                  "value":{"answers":{"browser":{"selected":["Done"],"freeText":null,"skipped":false}}}},
                {"op":"cancel","request":0,"userId":"owner"},
                {"op":"wait","request":0,"sessionId":"chat","userId":"owner","fire":false},
                {"op":"wait","request":0,"sessionId":"chat","userId":"owner","fire":false}
            ]);
            let expected = replay(steps.clone());
            let actual = run_scenario(&steps).await;
            assert_eq!(actual, expected, "{tool}, cancel={cancel}");
            assert_eq!(actual["steps"][3]["ok"], false);
            assert_eq!(
                actual["events"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .filter(|event| event["kind"] == "detached")
                    .count(),
                1
            );
            assert_eq!(actual["steps"][6]["outcome"]["status"], "answered");
            assert_eq!(actual["steps"][7]["outcome"]["status"], "missing");
        }
    }
}

#[tokio::test(start_paused = true)]
async fn attached_question_wait_resumes_without_a_duplicate_wake() {
    let steps = json!([
        {"op":"observeDetached"},
        {"op":"start","sessionId":"chat","userId":"owner"},
        {"op":"wait","request":0,"sessionId":"chat","userId":"owner"},
        {"op":"concurrent","waits":[{"request":0,"sessionId":"chat","userId":"owner"}],
          "then":{"op":"submit","request":0,"userId":"owner","value":{"answers":{}}}}
    ]);
    let expected = replay(steps.clone());
    let actual = run_scenario(&steps).await;
    assert_eq!(actual, expected);
    assert!(
        !actual["events"]
            .as_array()
            .unwrap()
            .iter()
            .any(|event| event["kind"] == "detached")
    );
}

#[tokio::test(start_paused = true)]
async fn explicit_question_wait_deadlines_and_attached_unbounded_wait_match_typescript() {
    let steps = json!([
        {"op":"observeDetached"},
        {"op":"start","sessionId":"chat","userId":"owner"},
        {"op":"wait","request":0,"sessionId":"chat","userId":"foreign","options":{"yieldAfterMs":null}},
        {"op":"wait","request":0,"sessionId":"chat","userId":"owner","options":{"yieldAfterMs":7}},
        {"op":"concurrent","waits":[{"request":0,"sessionId":"chat","userId":"owner","options":{"yieldAfterMs":null}}],"then":{"op":"submit","request":0,"userId":"owner","value":{"answers":{}}}},
        {"op":"wait","request":0,"sessionId":"chat","userId":"owner","options":{"yieldAfterMs":0}},
        {"op":"start","sessionId":"chat","userId":"owner"},
        {"op":"wait","request":1,"sessionId":"chat","userId":"owner","options":{"yieldAfterMs":null}}
    ]);
    let expected = replay(steps.clone());
    let actual = run_scenario(&steps).await;
    assert_eq!(actual, expected);
    assert!(
        !actual["events"]
            .as_array()
            .unwrap()
            .iter()
            .any(|event| event["kind"] == "detached")
    );
}

#[tokio::test(start_paused = true)]
async fn custom_question_deadline_is_measured_and_matches_reference_timer() {
    let reference = internal_driver::call(
        &root(),
        &root().join(".jait/artifacts/gateway-rust/channels-http/wait-deadline"),
        json!({"version":1,"calls":[{"op":"nativeaskresume.timers","options":{"yieldAfterMs":7}}]}),
        &|| false,
    )
    .unwrap()[0]
        .clone();
    assert_eq!(
        reference,
        json!({"scheduled":[7],"outcome":{"status":"pending"},"remaining":0})
    );
    let service = UserQuestionService::default();
    let id = service.start_resumable(
        serde_json::from_value(json!({"sessionId":"s","userId":null,"questions":[]})).unwrap(),
    );
    let worker = service.clone();
    let pending = tokio::spawn(async move {
        worker
            .wait_for_answer_with_timeout(&id, "s", None, Some(Duration::from_millis(7)))
            .await
    });
    for _ in 0..16 {
        tokio::task::yield_now().await;
    }
    tokio::time::advance(Duration::from_millis(6)).await;
    assert!(!pending.is_finished());
    tokio::time::advance(Duration::from_millis(2)).await;
    for _ in 0..16 {
        tokio::task::yield_now().await;
    }
    assert!(pending.is_finished());
    assert_eq!(pending.await.unwrap(), WaitOutcome::Pending);
}
