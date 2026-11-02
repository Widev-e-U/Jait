//! Consumer-level contract tests for `packages/gateway/src/tools/agent-loop.ts`
//! against the native port in `jait_gateway::tools::agent_loop`.
//!
//! Every expectation is transcribed from the TypeScript reference
//! (`formatLLMError`, `isRetryableRateLimit`, `parseRetryAfterMs`,
//! `rateLimitBackoffMs`, `toOpenAIName`, `serializeMessages`) rather than read
//! back out of the native implementation.
use jait_gateway::tools::agent_loop::{
    format_llm_error, is_retryable_rate_limit, parse_retry_after_ms, rate_limit_backoff_ms,
    serialize_messages, to_openai_name, AgentMessage, OpenAiToolCall,
};
use serde_json::json;

#[test]
fn format_llm_error_matches_reference_status_switch() {
    assert_eq!(
        format_llm_error(401, ""),
        "Your API key is invalid or expired. Please check your settings."
    );
    assert_eq!(
        format_llm_error(403, ""),
        "Access denied by the model provider. Please check your API key permissions."
    );
    assert_eq!(
        format_llm_error(429, ""),
        "Rate limited by the model provider. Please wait a moment and try again."
    );
    // Only 500/502/503 are reported as provider outages.
    for status in [500_u16, 502, 503] {
        assert_eq!(
            format_llm_error(status, ""),
            format!("The model provider is experiencing issues ({status}). Please try again later.")
        );
    }
    // 504 is deliberately *not* an outage message in the reference, and unknown
    // statuses fall through to the generic sentence.
    assert_eq!(
        format_llm_error(504, ""),
        "Request failed with status 504. Please try again."
    );
    assert_eq!(
        format_llm_error(418, ""),
        "Request failed with status 418. Please try again."
    );

    // Quota exhaustion arrives as 429 but must not read as a plain rate limit.
    assert_eq!(
        format_llm_error(429, r#"{"error":{"code":"insufficient_quota"}}"#),
        "You've exceeded your API quota. Please check your plan and billing details."
    );
    assert_eq!(
        format_llm_error(429, r#"{"error":{"message":"You exceeded your current quota"}}"#),
        "You've exceeded your API quota. Please check your plan and billing details."
    );
}

#[test]
fn format_llm_error_surfaces_sanitized_provider_detail() {
    // OpenAI-shaped `{"error":{"message":...}}`.
    assert_eq!(
        format_llm_error(400, r#"{"error":{"message":"model does not support images"}}"#),
        "Request failed (400): model does not support images"
    );
    // Ollama-shaped `{"error":"..."}`.
    assert_eq!(
        format_llm_error(400, r#"{"error":"boom"}"#),
        "Request failed (400): boom"
    );
    // A 429 with a provider detail appends it under the rate-limit sentence.
    assert_eq!(
        format_llm_error(429, r#"{"error":{"message":"slow down"}}"#),
        "Rate limited by the model provider. Please wait a moment and try again.\nslow down"
    );
    // Non-JSON bodies are not leaked verbatim into the user-facing message.
    assert_eq!(
        format_llm_error(400, "<html>bad gateway</html>"),
        "Request failed with status 400. Please try again."
    );
    // A JSON body without a usable message is likewise not surfaced.
    assert_eq!(
        format_llm_error(400, r#"{"error":{}}"#),
        "Request failed with status 400. Please try again."
    );
}

#[test]
fn is_retryable_rate_limit_excludes_quota_exhaustion() {
    // A bare 429 is worth retrying...
    assert!(is_retryable_rate_limit(429, ""));
    assert!(is_retryable_rate_limit(
        429,
        r#"{"error":{"message":"Requests per minute exceeded"}}"#
    ));
    // ...but quota/billing failures are terminal: retrying cannot help.
    assert!(!is_retryable_rate_limit(
        429,
        r#"{"error":{"code":"insufficient_quota"}}"#
    ));
    assert!(!is_retryable_rate_limit(
        429,
        r#"{"error":{"type":"billing_hard_limit_reached"}}"#
    ));
    assert!(!is_retryable_rate_limit(
        429,
        r#"{"error":{"message":"You are out of credits"}}"#
    ));
    // Non-429 statuses are never classified as rate limits.
    assert!(!is_retryable_rate_limit(500, ""));
    assert!(!is_retryable_rate_limit(200, ""));
}

#[test]
fn parse_retry_after_handles_seconds_and_http_dates() {
    // Delay-seconds form.
    assert_eq!(parse_retry_after_ms(Some("2"), 0), Some(2_000));
    assert_eq!(parse_retry_after_ms(Some("1.5"), 0), Some(1_500));
    assert_eq!(parse_retry_after_ms(Some("0"), 0), Some(0));
    // Negative and missing values fall back to the caller's own backoff.
    assert_eq!(parse_retry_after_ms(Some("-3"), 0), Some(0));
    assert_eq!(parse_retry_after_ms(Some("   "), 0), None);
    assert_eq!(parse_retry_after_ms(Some("soon"), 0), None);
    assert_eq!(parse_retry_after_ms(None, 0), None);

    // HTTP-date form is measured against the supplied clock, never the wall
    // clock: "Wed, 21 Oct 2015 07:28:00 GMT" is 1445412480000 ms.
    assert_eq!(
        parse_retry_after_ms(Some("Wed, 21 Oct 2015 07:28:00 GMT"), 1_445_412_480_000),
        Some(0)
    );
    assert_eq!(
        parse_retry_after_ms(
            Some("Wed, 21 Oct 2015 07:28:00 GMT"),
            1_445_412_480_000 - 5_000
        ),
        Some(5_000)
    );
}

#[test]
fn rate_limit_backoff_doubles_then_clamps() {
    assert_eq!(rate_limit_backoff_ms(1, None), 2_000);
    assert_eq!(rate_limit_backoff_ms(2, None), 4_000);
    assert_eq!(rate_limit_backoff_ms(3, None), 8_000);
    assert_eq!(rate_limit_backoff_ms(4, None), 16_000);
    assert_eq!(rate_limit_backoff_ms(5, None), 30_000);
    // Never exceeds the ceiling, however many attempts have already failed.
    assert_eq!(rate_limit_backoff_ms(6, None), 30_000);
    assert_eq!(rate_limit_backoff_ms(20, None), 30_000);

    // A provider `Retry-After` replaces the exponential delay, still clamped.
    assert_eq!(rate_limit_backoff_ms(1, Some(5_000)), 5_000);
    assert_eq!(rate_limit_backoff_ms(4, Some(60_000)), 30_000);
    assert_eq!(rate_limit_backoff_ms(1, Some(-5)), 0);
}

#[test]
fn openai_tool_names_round_trip_through_underscores() {
    // The provider-safe form replaces every dot with an underscore.
    assert_eq!(to_openai_name("file.write"), "file_write");
    assert_eq!(to_openai_name("browser.sandbox.start"), "browser_sandbox_start");
    assert_eq!(to_openai_name("a.b.c"), "a_b_c");
    assert_eq!(to_openai_name("noDots"), "noDots");
}

#[test]
fn serialized_messages_match_the_wire_contract() {
    // Assistant turn carrying tool calls: tool_calls keep the provider's exact
    // `{id, type, function:{name, arguments-as-JSON-string}}` shape, and the
    // visible content is preserved verbatim.
    let with_calls = AgentMessage {
        role: "assistant".into(),
        content: "thinking out loud".into(),
        tool_calls: Some(vec![OpenAiToolCall::new(
            "call-1",
            "file_read",
            "{\"path\":\"a\"}",
        )]),
        ..Default::default()
    };
    let wire = serialize_messages(std::slice::from_ref(&with_calls), false);
    assert_eq!(wire.len(), 1);
    assert_eq!(wire[0]["role"], json!("assistant"));
    assert_eq!(wire[0]["content"], json!("thinking out loud"));
    assert_eq!(
        wire[0]["tool_calls"],
        json!([{
            "id": "call-1",
            "type": "function",
            "function": { "name": "file_read", "arguments": "{\"path\":\"a\"}" }
        }])
    );

    // Hidden reasoning is replayed as `reasoning_content` only when the caller
    // asks for it (assistant role only).
    let mut thinking = AgentMessage::assistant("answer");
    thinking.thinking = Some("because".into());
    let plain = serialize_messages(std::slice::from_ref(&thinking), false);
    assert_eq!(plain[0], json!({ "role": "assistant", "content": "answer" }));
    let reasoned = serialize_messages(std::slice::from_ref(&thinking), true);
    assert_eq!(
        reasoned[0],
        json!({ "role": "assistant", "content": "answer", "reasoning_content": "because" })
    );
    // A tool turn never carries reasoning, even when one is requested.
    let tool = AgentMessage::tool("call-1", "file.read", "ok");
    let tool_wire = serialize_messages(std::slice::from_ref(&tool), true);
    assert!(tool_wire[0].get("reasoning_content").is_none());

    // Tool results stay correlated by `tool_call_id`.
    assert_eq!(tool_wire[0]["role"], json!("tool"));
    assert_eq!(tool_wire[0]["content"], json!("ok"));
    assert_eq!(tool_wire[0]["tool_call_id"], json!("call-1"));

    // A speaker name on a non-tool turn survives serialization.
    let mut named = AgentMessage::user("hi");
    named.name = Some("alice".into());
    let named_wire = serialize_messages(std::slice::from_ref(&named), false);
    assert_eq!(
        named_wire[0],
        json!({ "role": "user", "content": "hi", "name": "alice" })
    );

    // Synthetic gateway-injected messages still reach the model but are
    // flagged so callers can exclude them from persisted history.
    let mut injected = AgentMessage::system("nudge");
    assert!(!injected.is_synthetic());
    injected.synthetic = Some(true);
    assert!(injected.is_synthetic());
    assert!(!thinking.is_synthetic());

    // The wire transcript never leaks the internal recovery handle.
    let mut handled = AgentMessage::assistant("kept");
    handled.evidence_reference = Some("evidence-1".into());
    let handled_wire = serialize_messages(std::slice::from_ref(&handled), false);
    assert!(handled_wire[0].get("evidence_reference").is_none());
}
