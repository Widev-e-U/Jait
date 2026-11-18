//! Context-overhead policy: model payload slimming, bounded JSON, usage accounting.
use jait_gateway::context_overhead::*;
use jait_gateway::prompts::{PromptSkill, format_skills};
use serde_json::{Value, json};
fn js_len(text: &str) -> usize {
    text.encode_utf16().count()
}
fn usage(input: u64, output: u64, cached: Option<u64>, requests: Option<u64>) -> ModelUsage {
    ModelUsage {
        input_tokens: input,
        output_tokens: output,
        scope: "session".into(),
        cached_input_tokens: cached,
        total_tokens: None,
        request_count: requests,
        id: None,
        last_request: None,
    }
}
fn codex_totals() -> (ModelUsage, ModelUsage) {
    let mut last = usage(26_210, 62, Some(7_168), Some(1));
    last.scope = "turn".into();
    let mut total = usage(188_328, 797, Some(157_184), Some(6));
    total.last_request = Some(Box::new(last.clone()));
    (total, last)
}
fn skill(name: &str) -> PromptSkill {
    PromptSkill {
        name: name.into(),
        description: format!("{name} instructions"),
        file_path: format!("/private/installed/{name}/SKILL.md"),
    }
}

#[test]
fn skills_bootstrap_stays_a_discovery_instruction() {
    assert_eq!(format_skills(&[]), "");
    let one = format_skills(&[skill("debugging")]);
    let many: Vec<_> = (0..72).map(|i| skill(&format!("skill-{i}"))).collect();
    let discovery = format_skills(&many);
    assert_eq!(one, discovery, "catalog size must not leak into the prompt");
    assert!(
        js_len(&discovery) < 700,
        "skills block: {} chars",
        js_len(&discovery)
    );
    assert!(discovery.contains("skills.search"));
    assert!(
        !discovery.contains("/private/installed"),
        "skill paths leaked"
    );
    assert!(!discovery.contains("skill-71"), "individual skills listed");
}

#[test]
fn model_data_keeps_ui_echoes_out_of_model_payload() {
    let data = json!({
        "ok": true,
        "output": "$ echo hi\nhi\n",
        "terminalOutput": "$ echo hi\nhi\n",
        "terminalOutputAnsi": "\u{1b}[1m$ echo hi\u{1b}[0m\nhi\n",
        "exitCode": 0,
        "terminalId": "term-1"
    });
    let projected = project_model_data(&data);
    assert_eq!(projected.get("terminalOutputAnsi"), None);
    assert_eq!(projected.get("terminalOutput"), None);
    assert_eq!(projected["output"], json!("$ echo hi\nhi\n"));
    // The UI copy keeps its echoes: projection only clones.
    assert!(data.get("terminalOutputAnsi").is_some());
    assert!(data.get("terminalOutput").is_some());
    // No canonical output: terminalOutput stays as the only evidence.
    let raw = json!({"ok": true, "terminalOutput": "raw only", "terminalOutputAnsi": "ansi"});
    assert_eq!(
        project_model_data(&raw),
        json!({"ok": true, "terminalOutput": "raw only"})
    );
}

#[test]
fn bound_model_data_keeps_oversized_envelopes_valid_json() {
    let data = json!({
        "logs": "🦀".repeat(50),
        "ok": false, "exitCode": 2, "timedOut": false, "needsInteraction": false,
        "terminalId": "term-2", "outputOffset": 10, "outputEndOffset": 20
    });
    let max_chars = 220;
    let result = bound_model_data(&data, max_chars);
    let text = result.to_string();
    serde_json::from_str::<Value>(&text).expect("bounded result must stay valid JSON");
    assert!(
        js_len(&text) <= max_chars,
        "bound exceeded: {} chars",
        js_len(&text)
    );
    assert_eq!(result["truncated"], json!(true));
    assert_eq!(result["originalChars"], json!(js_len(&data.to_string())));
    // Execution/evidence status survives clipping; the bulk payload lives in preview.
    for key in [
        "ok",
        "exitCode",
        "timedOut",
        "needsInteraction",
        "terminalId",
        "outputOffset",
        "outputEndOffset",
    ] {
        assert_eq!(result[key], data[key], "scalar metadata lost: {key}");
    }
    let preview = result["preview"].as_str().unwrap();
    assert!(!preview.is_empty());
    assert_eq!(
        preview.encode_utf16().count(),
        js_len(preview),
        "broken UTF-16 pairs"
    );
    assert!(preview.contains('\u{1f980}'), "emoji preview corrupted");
}

#[test]
fn small_model_payloads_pass_through_unchanged() {
    let data = json!({"ok": true, "message": "small", "data": {"value": 1}});
    assert_eq!(bound_model_data(&data, 30_000), data);
}

#[test]
fn codex_usage_counters_include_cache_and_request_counts() {
    let params = json!({"msg": {"tokenUsage": {
        "total": {"inputTokens": 188_328, "outputTokens": 797, "cachedInputTokens": 157_184, "requestCount": 6},
        "last": {"inputTokens": 26_210, "outputTokens": 62, "cachedInputTokens": 7_168, "requestCount": 1}
    }}});
    let (expected, last) = codex_totals();
    assert_eq!(parse_codex_usage(&params), Some(expected.clone()));
    assert_eq!(expected.last_request.as_deref(), Some(&last));
    // Flat body plus snake_case/legacy counter names.
    let flat = json!({"tokenUsage": {"total_token_usage": {"input_tokens": 800, "output_tokens": 40, "cachedReadTokens": 800}}});
    let parsed = parse_codex_usage(&flat).unwrap();
    assert_eq!(parsed.input_tokens, 800);
    assert_eq!(parsed.cached_input_tokens, Some(800));
    assert_eq!(parsed.scope, "session");
}

#[test]
fn usage_parsers_reject_impossible_counters() {
    // Cached reads can never exceed input.
    assert_eq!(
        parse_codex_usage(
            &json!({"tokenUsage": {"total": {"inputTokens": 10, "outputTokens": 1, "cachedInputTokens": 11}}})
        ),
        None
    );
    // Missing counters cannot be estimated silently.
    assert_eq!(
        parse_codex_usage(&json!({"tokenUsage": {"total": {"inputTokens": 10}}})),
        None
    );
    // Beyond the JS-safe integer range cannot round-trip into UI metrics.
    assert_eq!(
        parse_acp_usage(
            &json!({"inputTokens": 9_007_199_254_740_992_u64, "outputTokens": 1}),
            "turn-1"
        ),
        None
    );
    let ok = parse_acp_usage(&json!({"inputTokens": 100, "outputTokens": 10}), "turn-1").unwrap();
    assert_eq!(ok.scope, "turn");
    assert_eq!(ok.id.as_deref(), Some("turn-1"));
}

#[test]
fn cumulative_notifications_are_charged_once() {
    let (total1, _) = codex_totals();
    let total2 = usage(200_000, 859, Some(165_184), Some(7));
    let mut resumed = TurnUsageAccumulator::new(Some(total1.clone()), false);
    resumed.add(total2.clone());
    let charged = resumed.metrics(9_000).unwrap();
    // Only the growth over the resumed baseline is new spend.
    assert_eq!(charged["promptTokens"], json!(11_672));
    assert_eq!(charged["completionTokens"], json!(62));
    assert_eq!(charged["cachedPromptTokens"], json!(8_000));
    assert_eq!(charged["requestCount"], json!(1));
    // Repeated and out-of-order cumulative notifications add nothing.
    resumed.add(total1.clone());
    resumed.add(total1.clone());
    assert_eq!(resumed.metrics(9_000).unwrap(), charged);
}

#[test]
fn resumed_sessions_never_charge_the_lifetime_total() {
    let (total1, last) = codex_totals();
    let mut resumed = TurnUsageAccumulator::new(None, false);
    resumed.add(total1.clone());
    let metrics = resumed.metrics(9_000).unwrap();
    // Only the last request is new spend; 188k lifetime input must not reappear.
    assert_eq!(metrics["promptTokens"], json!(last.input_tokens));
    assert_eq!(metrics["completionTokens"], json!(last.output_tokens));
    assert_eq!(
        metrics["totalTokens"],
        json!(last.input_tokens + last.output_tokens)
    );
    assert_eq!(metrics["tokenUsageEstimated"], json!(false));
    // A fresh session's first cumulative notification is entirely new spend.
    let mut fresh = TurnUsageAccumulator::new(Some(total1.clone()), true);
    fresh.add(total1.clone());
    assert_eq!(fresh.metrics(9_000), None, "duplicate notification charged");
    fresh.add(usage(200_000, 859, Some(165_184), Some(7)));
    assert_eq!(fresh.metrics(9_000).unwrap()["promptTokens"], json!(11_672));
}

#[test]
fn turn_scoped_usage_is_attributed_per_request() {
    let mut turns = TurnUsageAccumulator::new(None, false);
    turns.add(parse_acp_usage(&json!({"inputTokens": 100, "outputTokens": 10}), "turn-1").unwrap());
    turns.add(parse_acp_usage(&json!({"inputTokens": 150, "outputTokens": 12}), "turn-1").unwrap());
    turns.add(parse_acp_usage(&json!({"inputTokens": 200, "outputTokens": 20}), "turn-2").unwrap());
    let metrics = turns.metrics(5_000).unwrap();
    // Same id replaces its turn; distinct ids accumulate.
    assert_eq!(metrics["promptTokens"], json!(350));
    assert_eq!(metrics["completionTokens"], json!(32));
    assert_eq!(
        metrics,
        json!({
            "durationMs": 5000, "promptTokens": 350, "completionTokens": 32,
            "totalTokens": 382, "tokenUsageEstimated": false
        })
    );
    assert_eq!(
        turns.baseline, None,
        "turn usage must not pollute the session baseline"
    );
}
