//! Contract tests for `services::subscription_usage_fetchers`.
//!
//! Native outcomes are compared against the real TypeScript exports through
//! `drivers/nativesubscriptionusage.ts`. No live subscription service is contacted and no
//! real credential is used: every provider response is either scripted or served by an owned
//! loopback listener.
//!
//! The gateway crate must export the module as `services::subscription_usage_fetchers`
//! before this file compiles.
#[path = "../src/internal_driver.rs"]
mod internal_driver;

use jait_gateway::services::subscription_usage_fetchers as su;
use serde_json::{Value, json};
use std::{
    collections::VecDeque,
    io::{Read, Write},
    net::TcpListener,
    path::PathBuf,
    sync::{Arc, Mutex},
};

type BoxedResponse =
    std::pin::Pin<Box<dyn std::future::Future<Output = Result<su::UsageResponse, String>> + Send>>;

struct Recorder {
    requests: Mutex<Vec<su::UsageRequest>>,
}

impl Recorder {
    fn requests(&self) -> Vec<su::UsageRequest> {
        self.requests.lock().expect("requests").clone()
    }
}

fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .expect("repository root")
}

fn lane_dir() -> PathBuf {
    let dir = root().join(".jait/artifacts/gateway-rust/parallel-20261020/subscription-usage");
    std::fs::create_dir_all(&dir).expect("lane artifacts");
    dir
}

/// One call into the real TypeScript exports. The bridge returns the `results` array.
fn reference(call: Value) -> Value {
    let mut results = internal_driver::call(
        &root(),
        &lane_dir(),
        json!({"version": 1, "calls": [call]}),
        &|| false,
    )
    .expect("typescript reference driver");
    results.as_array_mut().expect("results array").remove(0)
}

fn scripted(
    responses: Vec<Result<su::UsageResponse, String>>,
) -> (Arc<Recorder>, su::UsageTransport) {
    let recorder = Arc::new(Recorder {
        requests: Mutex::new(Vec::new()),
    });
    let queue = Arc::new(Mutex::new(VecDeque::from(responses)));
    let seen = Arc::clone(&recorder);
    let transport: Arc<dyn Fn(su::UsageRequest) -> BoxedResponse + Send + Sync> =
        Arc::new(move |request| {
            seen.requests.lock().expect("requests").push(request);
            let next = queue.lock().expect("queue").pop_front();
            Box::pin(async move {
                next.unwrap_or_else(|| Err("unexpected provider request".to_string()))
            })
        });
    let transport: su::UsageTransport = transport;
    (recorder, transport)
}

/// `chunks` followed by stream end; `cancel` is what `reader.cancel()` resolves to.
fn native_stream(status: u16, chunks: &[&str], cancel: Result<(), String>) -> su::UsageResponse {
    let mut reads: Vec<Result<Option<Vec<u8>>, String>> = chunks
        .iter()
        .map(|chunk| Ok(Some(chunk.as_bytes().to_vec())))
        .collect();
    reads.push(Ok(None));
    su::UsageResponse::with_body(status, su::UsageBody::scripted(reads, cancel))
}

/// The reference records only the options production passes: no explicit method.
fn assert_request(request: &su::UsageRequest, expected: &Value) {
    assert_eq!(Value::String(request.url.clone()), expected["url"], "url");
    assert_eq!(
        Value::String(request.redirect.as_str().to_string()),
        expected["redirect"],
        "redirect mode"
    );
    let headers = Value::Array(
        request
            .headers
            .iter()
            .map(|(name, value)| json!([name, value]))
            .collect(),
    );
    assert_eq!(headers, expected["headers"], "headers and their order");
    assert_eq!(request.method, "GET");
    assert!(
        expected["method"].is_null(),
        "reference must rely on the GET default"
    );
    assert_eq!(request.timeout_ms, su::REQUEST_TIMEOUT_MS);
    assert_eq!(su::REQUEST_TIMEOUT_MS, 10_000);
}

fn differential_usage(html: &str) {
    let native = su::parse_ollama_settings_usage(html);
    let expected = reference(
        json!({"op": "nativesubscriptionusage.parse", "html": html, "timezone": std::env::var("JAIT_SUBSCRIPTION_TEST_TZ").ok()}),
    );
    if expected["ok"] == Value::Bool(true) {
        assert_eq!(
            native.expect("native accepts the document"),
            expected["value"],
            "document: {html}"
        );
    } else {
        assert_eq!(
            native.expect_err("native rejects the document"),
            expected["error"]
                .as_str()
                .expect("reference error")
                .to_string(),
            "document: {html}"
        );
    }
}

fn differential_cookie(value: &str) {
    let native = su::normalize_ollama_session(value);
    let expected = reference(json!({"op": "nativesubscriptionusage.normalize", "value": value}));
    if expected["ok"] == Value::Bool(true) {
        assert_eq!(
            Value::String(native.expect("native accepts the cookie")),
            expected["value"],
            "value: {value:?}"
        );
    } else {
        assert_eq!(
            native.expect_err("native rejects the cookie"),
            expected["error"]
                .as_str()
                .expect("reference error")
                .to_string(),
            "value: {value:?}"
        );
    }
}

fn reset_document(timestamp: &str) -> String {
    format!(
        concat!(
            r#"<div data-usage-meter><p data-usage-track aria-label="Session usage 10%"></p></div>"#,
            r#"<div data-time="{}"></div>"#,
            r#"<div data-usage-meter><p data-usage-track aria-label="Weekly usage 20%"></p></div>"#
        ),
        timestamp
    )
}

const DASHBOARD: &str = r#"<!doctype html><html><body>
<div data-usage-meter>
  <section><p data-usage-track aria-label="Session usage 12.5%">x</p></section>
</div>
<div data-time="2026-01-05T06:00:00Z"></div>
<div data-usage-meter>
  <p data-usage-track aria-label="Weekly usage 100%"></p>
</div>
<div data-time="2026-01-06"></div>
</body></html>"#;

#[test]
fn parses_the_dashboard_document_like_the_reference() {
    differential_usage(DASHBOARD);
}

#[test]
fn parsing_matches_the_reference_across_markup_shapes() {
    for html in [
        // Numeric character reference in a label.
        r#"<div data-usage-meter><p data-usage-track aria-label="Session usage 50&#37;"></p></div><div data-time="2026-01-05"></div><div data-usage-meter><p data-usage-track aria-label="Weekly usage 5%"></p></div>"#,
        // Uppercase attribute names and single-quoted values.
        r#"<div DATA-USAGE-METER><p DATA-USAGE-TRACK ARIA-LABEL="session 33%"></p></div><div data-time='2026-01-05T00:00:00Z'></div><div data-usage-meter><p data-usage-track aria-label="weekly 66.6%"></p></div>"#,
        // Comments around the meter tree.
        r#"<!-- top --><div data-usage-meter><!-- inner --><p data-usage-track aria-label="Session 1%"></p></div><div data-time="2026-01-05"></div><div data-usage-meter><p data-usage-track aria-label="Weekly 2%"></p></div>"#,
        // Void element inside the track.
        r#"<div data-usage-meter><p data-usage-track aria-label="Session 10%"><br></p></div><div data-time="2026-01-05"></div><div data-usage-meter><p data-usage-track aria-label="Weekly 20%"></p></div>"#,
        // Duplicate attribute: HTML parsers keep the first occurrence.
        r#"<div data-usage-meter><p data-usage-track aria-label="Session 10%" aria-label="Session 90%"></p></div><div data-time="2026-01-05"></div><div data-usage-meter><p data-usage-track aria-label="Weekly 20%"></p></div>"#,
        // Unquoted attribute value stops at whitespace, so the percent is not part of the label.
        r#"<div data-usage-meter><p data-usage-track aria-label=Session 10%></p></div><div data-usage-meter><p data-usage-track aria-label="Weekly 20%"></p></div>"#,
        // Markup inside a raw-text element is not a track.
        r#"<script>var x = "<div data-usage-track aria-label='Session 99%'>";</script><div data-usage-meter><p data-usage-track aria-label="Weekly 20%"></p></div>"#,
        // Whitespace and attribute-free tracks are ignored, leaving the meters missing.
        r#"<div data-usage-meter><p data-usage-track></p></div><div data-time="2026-01-05"></div><div data-usage-meter><p data-usage-track aria-label="monthly 20%"></p></div>"#,
    ] {
        differential_usage(html);
    }
}

#[test]
fn rejects_invalid_meters_like_the_reference() {
    for html in [
        // Percent above the bound.
        r#"<div data-usage-meter><p data-usage-track aria-label="Session 101%"></p></div><div data-time="2026-01-05"></div><div data-usage-meter><p data-usage-track aria-label="Weekly 20%"></p></div>"#,
        // Duplicate meter for one window.
        r#"<div data-usage-meter><p data-usage-track aria-label="Session 10%"></p></div><div data-usage-meter><p data-usage-track aria-label="Session 20%"></p></div><div data-usage-meter><p data-usage-track aria-label="Weekly 30%"></p></div>"#,
        // Only one of the two required windows.
        r#"<div data-usage-meter><p data-usage-track aria-label="Session 10%"></p></div>"#,
        // Label percent not at a word boundary.
        r#"<div data-usage-meter><p data-usage-track aria-label="Session 10%used"></p></div><div data-usage-meter><p data-usage-track aria-label="Weekly 20%"></p></div>"#,
        "",
    ] {
        differential_usage(html);
    }
}

#[test]
fn timestamp_forms_match_the_reference() {
    for timestamp in [
        "2026-01-05T06:00:00Z",
        "2026-01-05T06:00:00+02:00",
        "2026-01-05T06:00",
        "2026-01-05T06:00Z",
        "2026-01-05",
        "2026-01-05 06:00:00",
        // The reference does not trim: surrounding whitespace makes the value invalid.
        " 2026-01-05T06:00:00Z ",
        "bogus",
        "2026-13-05",
        // Legacy `Date.parse` forms accepted by the reference.
        "2026/01/05",
        "2026/1/5",
        "01/05/2026",
        "1/5/2026",
        "05-01-2026",
        "Jan 5 2026",
        "Jan 5 2026 06:00:00 GMT",
        "2026-1-5",
        "2026-01-05T06:00",
        "+002026-01-05T06:00:00Z",
        // Out-of-range days roll over instead of failing.
        "2026-02-30",
        "2026-02-30T06:00:00Z",
    ] {
        differential_usage(&reset_document(timestamp));
    }
}

/// Legacy dates and rollover must retain the real reference's accepted timestamp.
#[test]
fn legacy_and_rollover_timestamps_match_the_reference() {
    for timestamp in ["Jan 5 2026", "2026/01/05", "05-01-2026", "2026-02-30"] {
        let document = reset_document(timestamp);
        let expected = reference(json!({"op": "nativesubscriptionusage.parse", "html": document}));
        assert!(
            expected["value"]["limits"]["session"]["resetsAt"].is_string(),
            "reference accepts {timestamp}: {expected}"
        );
        let native = su::parse_ollama_settings_usage(&document).expect("native meters");
        assert_eq!(
            native["limits"]["session"]["resetsAt"],
            expected["value"]["limits"]["session"]["resetsAt"],
            "legacy/rollover Date.parse parity for {timestamp}"
        );
    }
}

#[test]
fn malformed_html_and_attribute_entities_match_the_reference() {
    let weekly =
        r#"<div data-usage-meter><p data-usage-track aria-label="Weekly usage 20%"></p></div>"#;
    for session in [
        r#"<div data-usage-meter><p data-usage-track aria-label="Session usage 10&percnt;"></p></div>"#,
        r#"<div data-usage-meter><p data-usage-track aria-label="Session usage&#32;10&#37"></p></div>"#,
        r#"<p data-usage-meter><p data-usage-track aria-label="Session usage 10%"></p><div data-time="2026-01-05"></div>"#,
        r#"<div data-usage-meter><li data-usage-track aria-label="Session usage 10%"><li></div><div data-time="2026-01-05"></div>"#,
        r#"<div data-usage-meter><frame><p data-usage-track aria-label="Session usage 10%"></div><div data-time="2026-01-05"></div>"#,
        r#"<script>ignore </scriptx><p data-usage-track aria-label="Session usage 10%"></p></script>"#,
        r#"<div data-usage-meter><p data-usage-track aria-label="Session usage&Tab;10%"></p></div>"#,
        r#"<svg><g data-usage-meter/><g data-usage-track aria-label="Session usage 10%"/></svg>"#,
    ] {
        differential_usage(&format!("{session}{weekly}"));
    }
}

#[test]
fn rejects_invalid_date_ranges_like_the_reference() {
    for timestamp in [
        "2026-01-32",
        "2026-02-99",
        "2026-00-01",
        "2026-01-05T24:01:00Z",
        "2026-01-05T00:00:00+24:00",
        "2026-01-05T00:00:00+00:60",
        "-000000-01-01T00:00:00Z",
        "+999999-01-01T00:00:00Z",
        "2026-01-05T06:00:60Z",
        "Jan 5 26",
        "01/05/26",
        "Jan 5 2026 EST",
        "Jan 5 2026 PDT",
        "Jan 5 9223372036854775807",
        "Jan 5 -9223372036854775808",
    ] {
        differential_usage(&reset_document(timestamp));
    }
}

#[test]
fn local_dates_observe_host_timezone() {
    if std::env::var("JAIT_SUBSCRIPTION_TEST_TZ").is_ok() {
        for timestamp in [
            "2026-01-05T06:00:00",
            "2026/01/05",
            "Jan 5 2026",
            "2026-03-08T02:30:00",
            "2026-11-01T01:30:00",
            "2026-03-29T02:30:00",
            "2026-10-25T02:30:00",
            "2011-12-30T12:00:00",
            "2026-01-05",
            "2026-01-05T06:00:00Z",
        ] {
            differential_usage(&reset_document(timestamp));
        }
        return;
    }
    for timezone in ["UTC", "America/New_York", "Europe/Berlin", "Pacific/Apia"] {
        let output = std::process::Command::new(std::env::current_exe().expect("test binary"))
            .args([
                "--exact",
                "local_dates_observe_host_timezone",
                "--nocapture",
            ])
            .env("TZ", timezone)
            .env("JAIT_SUBSCRIPTION_TEST_TZ", timezone)
            .output()
            .expect("timezone subprocess");
        assert!(
            output.status.success(),
            "timezone {timezone}: {} {}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        );
    }
}

#[test]
fn normalizes_the_cookie_like_the_reference() {
    let long = "a".repeat(4096);
    let too_long = "a".repeat(4097);
    for value in [
        "  __Secure-session=abc  ",
        "__Secure-session=abc",
        "abc",
        "",
        "   ",
        "a b",
        "a;b",
        "a,b",
        "a\u{0}b",
        "a\u{1f}b",
        "a\u{7f}b",
        "a\tb",
        "__Secure-session=__Secure-session=x",
        long.as_str(),
        too_long.as_str(),
    ] {
        differential_cookie(value);
    }
}

fn open_code_reference(status: u16, body: &str) -> Value {
    reference(json!({
        "op": "nativesubscriptionusage.opencode",
        "apiKey": "sk-test-123",
        "scenario": {"status": status, "chunks": [body]}
    }))
}

async fn open_code_native(status: u16, body: &str) -> (Result<Value, String>, Arc<Recorder>) {
    let (recorder, transport) = scripted(vec![Ok(su::UsageResponse::with_chunks(
        status,
        vec![body.as_bytes().to_vec()],
    ))]);
    let native = su::fetch_open_code_go_usage(&transport, "sk-test-123").await;
    (native, recorder)
}

const OPEN_CODE_VALID: &str = r#"{"usage":{"rolling":{"status":"ok","percent":25,"resetsAt":"2026-01-05T06:00:00Z"},"weekly":{"status":"rate-limited","percent":0,"resetsAt":"2026-01-06T00:00:00Z"},"monthly":{"status":"ok","percent":12.5,"resetsAt":"2026-02-01T00:00:00Z"}}}"#;

#[tokio::test]
async fn open_code_json_consumption_does_not_cancel_the_stream() {
    let expected = reference(
        json!({"op": "nativesubscriptionusage.opencode", "apiKey": "test",
        "scenario": {"chunks": [OPEN_CODE_VALID], "cancelError": "should not be called"}}),
    );
    assert_eq!(expected["ok"], true);
    assert_eq!(expected["events"], json!(["read", "end"]));
    let (_, transport) = scripted(vec![Ok(native_stream(
        200,
        &[OPEN_CODE_VALID],
        Err("should not be called".into()),
    ))]);
    let native = su::fetch_open_code_go_usage(&transport, "test")
        .await
        .expect("JSON consumption must not cancel");
    assert_eq!(native, expected["value"]);
}

#[tokio::test]
async fn utf8_and_bom_decoding_matches_the_reference() {
    let prefix = r#"<div data-usage-meter><p data-usage-track aria-label="Session usage 10%">"#;
    let suffix = r#"</p></div><div data-usage-meter><p data-usage-track aria-label="Weekly usage 20%"></p></div>"#;
    for middle in [
        vec![vec![0xf0, 0x9f], vec![0x98, 0x80]],
        vec![vec![0xe2], vec![0x28, 0xa1]],
        vec![vec![0xe2, 0x82]],
    ] {
        let mut chunks = vec![vec![0xef], vec![0xbb, 0xbf], prefix.as_bytes().to_vec()];
        chunks.extend(middle);
        chunks.push(suffix.as_bytes().to_vec());
        let expected = settings_reference("test", json!({"byteChunks": chunks}));
        let (native, _) =
            settings_native("test", su::UsageResponse::with_chunks(200, chunks)).await;
        assert_eq!(native.expect("native document"), expected["value"]);
    }
    let mut chunks = vec![vec![0xef, 0xbb], vec![0xbf]];
    chunks.push(OPEN_CODE_VALID.replace("25", "25.0").as_bytes().to_vec());
    let expected = reference(
        json!({"op": "nativesubscriptionusage.opencode", "apiKey": "test", "scenario": {"byteChunks": chunks}}),
    );
    let (_, transport) = scripted(vec![Ok(su::UsageResponse::with_chunks(200, chunks))]);
    assert_eq!(
        su::fetch_open_code_go_usage(&transport, "test")
            .await
            .expect("JSON BOM"),
        expected["value"]
    );
}

#[test]
fn deeply_nested_documents_match_without_recursive_stack_use() {
    let depth = 100_000;
    let html = format!(
        "{}{}{}",
        "<a>".repeat(depth),
        DASHBOARD,
        "</a>".repeat(depth)
    );
    let expected = reference(
        json!({"op": "nativesubscriptionusage.parse", "html": DASHBOARD, "depth": depth}),
    );
    let started = std::time::Instant::now();
    assert_eq!(
        su::parse_ollama_settings_usage(&html).expect("deep native document"),
        expected["value"]
    );
    assert!(
        started.elapsed() < std::time::Duration::from_secs(5),
        "deep native parse must avoid repeated ancestor scans"
    );
}

#[tokio::test]
async fn stream_byte_limit_is_exercised_on_both_real_paths() {
    for (text, count, bytes) in [("x", 2_000_001, 2_000_001), ("😀", 500_001, 2_000_004)] {
        let expected =
            settings_reference("test", json!({"repeatText": text, "repeatCount": count}));
        let (native, _) = settings_native(
            "test",
            su::UsageResponse::with_chunks(200, vec![vec![b'x'; bytes]]),
        )
        .await;
        assert_eq!(
            native.expect_err("byte cap"),
            expected["error"].as_str().expect("reference cap")
        );
        assert_eq!(expected["error"], su::TOO_LARGE);
        assert_eq!(expected["events"], json!(["read", "cancel"]));
    }
}

#[tokio::test]
async fn open_code_go_returns_the_validated_body_and_request_like_the_reference() {
    let expected = open_code_reference(200, OPEN_CODE_VALID);
    let (native, recorder) = open_code_native(200, OPEN_CODE_VALID).await;
    assert_eq!(native.expect("native accepts"), expected["value"]);
    assert_request(&recorder.requests()[0], &expected["request"]);
    assert_eq!(su::OPEN_CODE_GO_URL, "https://opencode.ai/zen/go/v1/usage");
}

#[tokio::test]
async fn open_code_go_maps_statuses_without_echoing_the_credential() {
    for status in [401u16, 403, 429, 500] {
        let expected = open_code_reference(status, "");
        let (native, recorder) = open_code_native(status, "").await;
        let error = native.expect_err("native rejects the status");
        assert_eq!(error, expected["error"].as_str().expect("reference error"));
        assert!(
            !error.contains("sk-test-123"),
            "credential in error: {error}"
        );
        assert_request(&recorder.requests()[0], &expected["request"]);
        assert_eq!(
            expected["events"].as_array().map(Vec::len),
            Some(0),
            "the reference never reads a failing body"
        );
    }
}

#[tokio::test]
async fn open_code_go_rejects_the_same_shapes_as_the_reference() {
    for invalid in [
        // Missing window.
        r#"{"usage":{"rolling":{"status":"ok","percent":25,"resetsAt":"2026-01-05T06:00:00Z"},"weekly":{"status":"rate-limited","percent":0,"resetsAt":"2026-01-06T00:00:00Z"}}}"#,
        // Negative percent.
        r#"{"usage":{"rolling":{"status":"ok","percent":-1,"resetsAt":"2026-01-05T06:00:00Z"},"weekly":{"status":"ok","percent":0,"resetsAt":"2026-01-06T00:00:00Z"},"monthly":{"status":"ok","percent":0,"resetsAt":"2026-02-01T00:00:00Z"}}}"#,
        // Percent is a string.
        r#"{"usage":{"rolling":{"status":"ok","percent":"25","resetsAt":"2026-01-05T06:00:00Z"},"weekly":{"status":"ok","percent":0,"resetsAt":"2026-01-06T00:00:00Z"},"monthly":{"status":"ok","percent":0,"resetsAt":"2026-02-01T00:00:00Z"}}}"#,
        // Unknown status.
        r#"{"usage":{"rolling":{"status":"paused","percent":0,"resetsAt":"2026-01-05T06:00:00Z"},"weekly":{"status":"ok","percent":0,"resetsAt":"2026-01-06T00:00:00Z"},"monthly":{"status":"ok","percent":0,"resetsAt":"2026-02-01T00:00:00Z"}}}"#,
        // Unparseable reset timestamp.
        r#"{"usage":{"rolling":{"status":"ok","percent":0,"resetsAt":"not a date"},"weekly":{"status":"ok","percent":0,"resetsAt":"2026-01-06T00:00:00Z"},"monthly":{"status":"ok","percent":0,"resetsAt":"2026-02-01T00:00:00Z"}}}"#,
        "{}",
    ] {
        let expected = open_code_reference(200, invalid);
        let (native, _) = open_code_native(200, invalid).await;
        assert_eq!(
            native.expect_err("native rejects"),
            expected["error"].as_str().expect("reference error"),
            "body: {invalid}"
        );
        assert_eq!(expected["error"].as_str(), Some(su::UNEXPECTED_USAGE));
    }
}

/// A JSON syntax error surfaces the runtime parser's message, so only the outcome is shared.
#[tokio::test]
async fn open_code_go_json_syntax_errors_fail_on_both_sides_not_by_message() {
    let expected = open_code_reference(200, "{oops");
    let (native, _) = open_code_native(200, "{oops").await;
    assert_eq!(expected["ok"], Value::Bool(false));
    let error = native.expect_err("native rejects malformed JSON");
    assert_ne!(
        error,
        expected["error"].as_str().expect("reference error"),
        "documented gap: Bun and serde_json do not produce identical syntax messages"
    );
}

fn settings_reference(session: &str, scenario: Value) -> Value {
    reference(json!({
        "op": "nativesubscriptionusage.ollama",
        "session": session,
        "scenario": scenario
    }))
}

async fn settings_native(
    session: &str,
    response: su::UsageResponse,
) -> (Result<Value, String>, Arc<Recorder>) {
    let (recorder, transport) = scripted(vec![Ok(response)]);
    let native = su::fetch_ollama_settings_usage(&transport, session).await;
    (native, recorder)
}

const SETTINGS_CHUNK_A: &str = "\u{feff}<div data-usage-meter>";
const SETTINGS_CHUNK_B: &str = r#"<p data-usage-track aria-label="Session usage 25%"></p></div><div data-time="2026-01-05T06:00:00Z"></div><div data-usage-meter><p data-usage-track aria-label="Weekly usage 50%"></p></div>"#;

#[tokio::test]
async fn ollama_streams_parses_and_cancels_like_the_reference() {
    let expected = settings_reference(
        "__Secure-session=abc123",
        json!({"status": 200, "chunks": [SETTINGS_CHUNK_A, SETTINGS_CHUNK_B]}),
    );
    let (native, recorder) = settings_native(
        "__Secure-session=abc123",
        native_stream(200, &[SETTINGS_CHUNK_A, SETTINGS_CHUNK_B], Ok(())),
    )
    .await;
    assert_eq!(native.expect("native fetch"), expected["value"]);
    assert_request(&recorder.requests()[0], &expected["request"]);
    let events = expected["events"].as_array().expect("events");
    assert!(
        events.iter().any(|event| event == "cancel"),
        "the reference always cancels the reader: {events:?}"
    );
    assert_eq!(su::OLLAMA_SETTINGS_URL, "https://ollama.com/settings");
}

#[tokio::test]
async fn ollama_matches_the_reference_for_status_body_and_cancel_cases() {
    // Redirects and rejected sessions never reach the body.
    for status in [302u16, 401, 403, 500] {
        let expected = settings_reference("abc123", json!({"status": status}));
        let (native, recorder) = settings_native("abc123", su::UsageResponse::new(status)).await;
        assert_eq!(
            native.expect_err("native rejects the status"),
            expected["error"].as_str().expect("reference error"),
            "status: {status}"
        );
        assert_request(&recorder.requests()[0], &expected["request"]);
        assert_eq!(expected["events"].as_array().map(Vec::len), Some(0));
    }

    // Missing body.
    let expected = settings_reference("abc123", json!({"status": 200, "noBody": true}));
    let (native, _) = settings_native("abc123", su::UsageResponse::new(200)).await;
    assert_eq!(
        native.expect_err("native rejects"),
        expected["error"].as_str().unwrap()
    );
    assert_eq!(su::EMPTY_SETTINGS, expected["error"].as_str().unwrap());

    // A rejected `cancel()` overrides the terminal outcome, so `cancel` must run last.
    let expected = settings_reference(
        "abc123",
        json!({"status": 200, "chunks": [], "cancelError": "cancel failed"}),
    );
    let (native, _) = settings_native(
        "abc123",
        native_stream(200, &[], Err("cancel failed".to_string())),
    )
    .await;
    assert_eq!(native.expect_err("cancel error wins"), "cancel failed");
    assert_eq!(expected["error"].as_str(), Some("cancel failed"));
    let events: Vec<&str> = expected["events"]
        .as_array()
        .expect("events")
        .iter()
        .map(|event| event.as_str().expect("event"))
        .collect();
    assert_eq!(
        events,
        vec!["end", "cancel"],
        "cancel must follow the read loop"
    );

    // A body read failure is surfaced unchanged.
    let expected = settings_reference(
        "abc123",
        json!({"status": 200, "chunks": ["<div", "x"], "failAfter": 1, "readError": "stream failed"}),
    );
    let (native, _) = settings_native(
        "abc123",
        su::UsageResponse::with_body(
            200,
            su::UsageBody::scripted(
                vec![Ok(Some(b"<div".to_vec())), Err("stream failed".to_string())],
                Ok(()),
            ),
        ),
    )
    .await;
    assert_eq!(
        native.expect_err("read error"),
        expected["error"].as_str().unwrap()
    );

    // The cookie is validated before any request is issued.
    let expected = settings_reference("bad cookie", json!({"status": 200, "chunks": []}));
    let (native, recorder) = settings_native("bad cookie", native_stream(200, &[], Ok(()))).await;
    assert_eq!(native.expect_err("invalid cookie"), su::INVALID_COOKIE);
    assert!(
        recorder.requests().is_empty(),
        "no request for an invalid cookie"
    );
    assert!(
        expected["request"].is_null(),
        "the reference issues no request either"
    );
}

/// The reference's 2 MB stream bound cannot be exercised differentially: the bridge rejects
/// driver input above 64 KiB, so an oversize body cannot reach the TypeScript side.
#[tokio::test]
async fn ollama_bounds_oversized_streams_and_documents_like_the_reference() {
    let oversized = "a".repeat(su::MAX_RESPONSE_BYTES + 1);
    let (native, _) = settings_native("abc123", native_stream(200, &[&oversized], Ok(()))).await;
    assert_eq!(native.expect_err("stream bound"), su::TOO_LARGE);
    assert_eq!(
        su::parse_ollama_settings_usage(&oversized).expect_err("document bound"),
        su::TOO_LARGE
    );
}

#[tokio::test]
async fn concurrent_fetches_keep_credentials_separate() {
    const SETTINGS: &str = r#"<div data-usage-meter><p data-usage-track aria-label="Session 1%"></p></div><div data-time="2026-01-05"></div><div data-usage-meter><p data-usage-track aria-label="Weekly 2%"></p></div>"#;
    let recorder = Arc::new(Recorder {
        requests: Mutex::new(Vec::new()),
    });
    let seen = Arc::clone(&recorder);
    let transport: Arc<dyn Fn(su::UsageRequest) -> BoxedResponse + Send + Sync> =
        Arc::new(move |request| {
            let settings = request.url == su::OLLAMA_SETTINGS_URL;
            seen.requests.lock().expect("requests").push(request);
            let response = if settings {
                native_stream(200, &[SETTINGS], Ok(()))
            } else {
                su::UsageResponse::with_chunks(200, vec![OPEN_CODE_VALID.as_bytes().to_vec()])
            };
            Box::pin(async move { Ok(response) })
        });
    let transport: su::UsageTransport = transport;

    let (settings, usage) = tokio::join!(
        su::fetch_ollama_settings_usage(&transport, "session-one"),
        su::fetch_open_code_go_usage(&transport, "sk-two")
    );
    assert_eq!(
        settings.expect("settings")["limits"]["session"]["usage"],
        json!(0.01)
    );
    assert!(usage.is_ok());

    let requests = recorder.requests();
    assert_eq!(requests.len(), 2);
    let cookies: Vec<String> = requests
        .iter()
        .flat_map(|request| request.headers.iter())
        .filter(|(name, _)| name == "Cookie")
        .map(|(_, value)| value.clone())
        .collect();
    let authorization: Vec<String> = requests
        .iter()
        .flat_map(|request| request.headers.iter())
        .filter(|(name, _)| name == "Authorization")
        .map(|(_, value)| value.clone())
        .collect();
    assert_eq!(cookies, vec!["__Secure-session=session-one".to_string()]);
    assert_eq!(authorization, vec!["Bearer sk-two".to_string()]);
}

/// Owned loopback fixture. Serves each raw response in order (one connection each) and
/// returns every request head it saw, so wire-level assertions need no external network.
fn spawn_loopback(responses: Vec<&'static str>) -> (String, std::thread::JoinHandle<Vec<String>>) {
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind loopback");
    let address = listener.local_addr().expect("loopback address");
    let handle = std::thread::spawn(move || {
        let mut seen = Vec::new();
        for response in responses {
            let (mut socket, _) = listener.accept().expect("accept");
            socket
                .set_read_timeout(Some(std::time::Duration::from_secs(5)))
                .ok();
            let mut request = Vec::new();
            let mut buffer = [0u8; 1024];
            while !request.windows(4).any(|window| window == b"\r\n\r\n") {
                match socket.read(&mut buffer) {
                    Ok(0) | Err(_) => break,
                    Ok(read) => request.extend_from_slice(&buffer[..read]),
                }
            }
            let _ = socket.write_all(response.as_bytes());
            seen.push(String::from_utf8_lossy(&request).into_owned());
        }
        seen
    });
    (format!("http://{address}"), handle)
}

/// A 302 that names a redirect target; the reference probe returns it verbatim in
/// `manual` mode and rejects it in `error` mode.
const FOUND_WITH_LOCATION: &str =
    "HTTP/1.1 302 Found\r\nLocation: /login\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
/// A 302 without `Location`. The reference still rejects it in `error` mode
/// (`UnexpectedRedirect`) and still returns it in `manual` mode (location `null`).
const FOUND_WITHOUT_LOCATION: &str =
    "HTTP/1.1 302 Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";

/// The owned transport is the only place a real socket is used: it proves the adapter sends
/// the reference headers and honours both redirect modes on the wire.
#[tokio::test]
async fn native_transport_sends_the_headers_and_honours_both_redirect_modes() {
    let transport = su::native_transport().expect("native transport");
    let request = su::UsageRequest {
        url: String::new(),
        method: "GET",
        redirect: su::Redirect::Manual,
        headers: vec![
            ("Cookie".to_string(), "__Secure-session=abc".to_string()),
            ("Accept".to_string(), "text/html".to_string()),
        ],
        timeout_ms: su::REQUEST_TIMEOUT_MS,
    };

    let (base, server) = spawn_loopback(vec![FOUND_WITH_LOCATION]);
    let response = transport(su::UsageRequest {
        url: format!("{base}/settings"),
        ..request.clone()
    })
    .await
    .expect("manual response");
    assert_eq!(response.status, 302);
    let wire = server.join().expect("loopback server");
    assert_eq!(wire.len(), 1, "manual mode must not follow Location");
    assert!(
        wire[0].starts_with("GET /settings HTTP/1.1"),
        "request line: {}",
        wire[0]
    );
    let lower = wire[0].to_ascii_lowercase();
    assert!(
        lower.contains("cookie: __secure-session=abc"),
        "cookie: {}",
        wire[0]
    );
    assert!(lower.contains("accept: text/html"), "accept: {}", wire[0]);
    let cookie_at = lower.find("cookie:").expect("cookie header");
    let accept_at = lower.find("accept:").expect("accept header");
    assert!(
        cookie_at < accept_at,
        "the reference sends Cookie before Accept: {}",
        wire[0]
    );

    // `redirect: "manual"` without `Location` is still a plain 302 (reference probe).
    let (base, server) = spawn_loopback(vec![FOUND_WITHOUT_LOCATION]);
    let response = transport(su::UsageRequest {
        url: format!("{base}/settings"),
        ..request.clone()
    })
    .await
    .expect("manual response without Location");
    assert_eq!(response.status, 302);
    assert_eq!(server.join().expect("loopback server").len(), 1);

    // `redirect: "error"` rejects every 3xx, with or without `Location`, and the response
    // body is never read. The fixture only ever serves the redirect, so a followed redirect
    // or a body read would show up as a timeout or a second connection.
    for fixture in [FOUND_WITH_LOCATION, FOUND_WITHOUT_LOCATION] {
        let transport = su::native_transport().expect("native transport");
        let (base, server) = spawn_loopback(vec![fixture]);
        let error = transport(su::UsageRequest {
            url: format!("{base}/settings"),
            redirect: su::Redirect::Error,
            ..request.clone()
        })
        .await
        .expect_err("redirect: error must reject a 3xx response");
        assert!(
            !error.is_empty() && !error.contains("abc"),
            "redirect rejection must not echo the credential: {error}"
        );
        assert_eq!(
            server.join().expect("loopback server").len(),
            1,
            "redirect: error must not open a second connection"
        );
    }
}

// Exercise the real mixed SDK/parser import graph in fresh Bun processes. This
// startup path previously failed with require() async module for htmlparser2.
#[test]
fn usage_parser_and_matrix_sdk_share_a_synchronous_module_boundary() {
    use std::{
        fs,
        process::{Command, Stdio},
        thread,
        time::{Duration, Instant},
    };
    let directory = lane_dir().join(format!("import-loader-{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(&directory).expect("import loader artifacts");
    let script = "import {parseOllamaSettingsUsage} from './src/services/subscription-usage-fetchers.ts'; import {MatrixClient} from './src/services/messenger-matrix-runtime.ts'; if(typeof parseOllamaSettingsUsage!=='function'||typeof MatrixClient!=='function')throw new Error('missing real exports'); process.exit(0);";
    let bun = std::env::var("JAIT_CONTRACT_BUN").unwrap_or_else(|_| "bun".into());
    for trial in 0..8 {
        let log = directory.join(format!("{trial}.log"));
        let output = fs::File::create(&log).expect("startup log");
        let mut child = Command::new(&bun)
            .args(["--no-env-file", "--eval", script])
            .current_dir(root().join("packages/gateway"))
            .stdin(Stdio::null())
            .stdout(output.try_clone().unwrap())
            .stderr(output)
            .spawn()
            .expect("Bun import graph");
        let deadline = Instant::now() + Duration::from_secs(5);
        let status = loop {
            if let Some(status) = child.try_wait().expect("import graph status") {
                break status;
            }
            if Instant::now() >= deadline {
                let _ = child.kill();
                let _ = child.wait();
                panic!(
                    "Bun import graph exceeded five seconds; inspect {}",
                    log.display()
                );
            }
            thread::sleep(Duration::from_millis(10));
        };
        assert!(
            status.success(),
            "Bun import graph failed; inspect {}",
            log.display()
        );
    }
}
