//! Prompt construction, normalization and cancellation through the real source function.
#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::services::chat_notification::{
    DETAIL_TIMEOUT_MS, NotificationCompletionRequest, NotificationOptions,
    generate_chat_notification_detail, normalize_notification_detail,
};
use serde_json::{Value, json};
use std::{
    path::PathBuf,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
    time::Duration,
};
fn reference(calls: Vec<Value>) -> Value {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap();
    internal_driver::call(
        &root,
        &root.join(".jait/artifacts/gateway-rust/chat-notification"),
        json!({"version":1,"calls":calls}),
        &|| false,
    )
    .unwrap()
}
fn compare_normalize(raws: Vec<String>) {
    let calls = raws
        .iter()
        .map(|raw| json!({"op":"nativenotification.normalize","raw":raw}))
        .collect();
    let actual: Vec<_> = raws
        .iter()
        .map(|raw| normalize_notification_detail(raw).map(|v| v.0))
        .collect();
    assert_eq!(json!(actual), reference(calls), "raws={raws:?}");
}
fn request_value(request: NotificationCompletionRequest) -> Value {
    json!({"config":request.config,"messages":request.messages.iter().map(|m|json!({"role":m.role,"units":m.content.0})).collect::<Vec<_>>(),"maxTokens":request.max_tokens,"temperature":request.temperature})
}
struct Cancelled(Arc<AtomicBool>);
impl Drop for Cancelled {
    fn drop(&mut self) {
        self.0.store(true, Ordering::SeqCst);
    }
}
async fn compare_generate(task: String, response: String, raw: &str, mode: &str) {
    let config = json!({"model":"fixture-model","backend":"openai","baseUrl":"https://model.invalid","apiKey":"test-only"});
    let expected = reference(vec![
        json!({"op":"nativenotification.generate","options":{"task":task,"response":response,"llm":config},"mode":mode,"raw":raw}),
    ]);
    let expected = &expected[0];
    let calls = Arc::new(Mutex::new(Vec::new()));
    let captured = calls.clone();
    let cancelled = Arc::new(AtomicBool::new(false));
    let flag = cancelled.clone();
    let raw = raw.to_owned();
    let mode = mode.to_owned();
    let start = tokio::time::Instant::now();
    let result = generate_chat_notification_detail(
        &NotificationOptions {
            task,
            response,
            llm: config,
        },
        move |request| {
            captured.lock().unwrap().push(request_value(request));
            async move {
                match mode.as_str() {
                    "failure" => Err("private backend detail".into()),
                    "timeout" => {
                        let _cancel = Cancelled(flag);
                        std::future::pending::<Result<String, String>>().await
                    }
                    _ => Ok(raw),
                }
            }
        },
    )
    .await
    .map(|v| v.0);
    assert_eq!(
        json!({"result":result,"calls":*calls.lock().unwrap(),"aborted":cancelled.load(Ordering::SeqCst)}),
        json!({"result":expected["result"],"calls":expected["calls"],"aborted":expected["aborted"]})
    );
    let count = calls.lock().unwrap().len();
    assert_eq!(
        expected["scheduled"],
        if count == 0 {
            json!([])
        } else {
            json!([DETAIL_TIMEOUT_MS])
        }
    );
    assert_eq!(expected["cleared"], json!(count));
    assert_eq!(expected["remaining"], 0);
    if cancelled.load(Ordering::SeqCst) {
        assert_eq!(start.elapsed(), Duration::from_millis(DETAIL_TIMEOUT_MS));
    }
}
#[test]
fn prefixes_bullets_quotes_whitespace_and_first_line_match() {
    compare_normalize(
        [
            "",
            " \t\u{feff}",
            "\r\n Summary: \"Fixed the login bug.\"\nMore detail",
            "DETAIL\u{a0}:\t- `Done`",
            "notification: 12) 'Finished'",
            "Body: • outcome",
            "body: -- not a bullet",
            "Summary: 1.done",
            "summary: １) unicode digit",
            "summary: 1. done",
            "summaryx: keep",
            "# Heading stays",
            "...",
            "body: \"''`",
            "raw\u{0085}text",
            "body: word . ;",
            "\"quoted.\"",
            "Body: \u{2028}a\u{feff}\u{202f}b",
            "\r\r\nNotification: Success;,:.\nnext",
        ]
        .into_iter()
        .map(str::to_owned)
        .collect(),
    );
}
#[test]
fn utf16_truncation_preserves_reference_word_boundary_and_surrogate_units() {
    compare_normalize(vec![
        "a".repeat(160),
        "a".repeat(161),
        format!("{}🦀x", "a".repeat(159)),
        format!("{} {}", "a".repeat(39), "b".repeat(140)),
        format!("{} {}", "a".repeat(40), "b".repeat(140)),
        "long outcome ".repeat(30),
        "🦀".repeat(100),
        format!("{} x", "🦀".repeat(80)),
    ]);
}
#[tokio::test(start_paused = true)]
async fn generation_keeps_final_response_tail_and_exact_request_options() {
    compare_generate(
        "Fix login".into(),
        format!("{}Final result: fixed login", "Planning ".repeat(1000)),
        "Summary: fixed login.",
        "success",
    )
    .await;
}
#[tokio::test(start_paused = true)]
async fn request_slices_task_and_response_in_utf16_code_units() {
    compare_generate(
        format!("  {}🦀tail  ", "t".repeat(1199)),
        format!(" lead🦀{}  ", "r".repeat(3999)),
        "done",
        "success",
    )
    .await;
    compare_generate(
        " \u{feff}\u{0085}task\u{a0} ".into(),
        " \u{feff}response\u{0085}\u{a0}".into(),
        "body: \"\"",
        "success",
    )
    .await;
}
#[tokio::test(start_paused = true)]
async fn empty_responses_skip_timer_and_client() {
    for response in ["", " \t\r\n\u{feff}"] {
        compare_generate("hello".into(), response.into(), "ignored", "success").await;
    }
}
#[tokio::test(start_paused = true)]
async fn backend_failure_and_deadline_return_none_and_release_pending_transport() {
    compare_generate("task".into(), "partial outcome".into(), "unused", "failure").await;
    compare_generate("task".into(), "partial outcome".into(), "unused", "timeout").await;
}
