//! Differential contract for `packages/gateway/src/providers/codex-event-mapper.ts`.
//!
//! Every fixture replays through the TypeScript reference mapper (via the
//! bounded `provider.codex-event-map` driver op) and through the native port in
//! the same order, so the reference's single module-level fallback-id counter
//! advances identically to the native thread-local counter. Generated fallback
//! ids are compared with their numeric tail normalized (`codex-item-#`); the
//! counter's absolute value depends on how many events the reference process
//! handled before the batch, and the native unit test
//! `falls_back_to_generated_call_ids` pins the actual sequence.
#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::providers::codex_event_mapper::map_codex_notification;
use serde_json::{Value, json};
use std::path::PathBuf;

fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}

fn reference(batch: &Value) -> Value {
    let base = root().join(".jait/artifacts/gateway-rust/codex-event-mapper");
    let results = internal_driver::call(
        &root(),
        &base,
        json!({"version":1,"calls":[{"op":"provider.codex-event-map","calls":batch}]}),
        &|| false,
    )
    .unwrap();
    results[0].clone()
}

fn normalize_id(text: &str) -> String {
    for prefix in ["codex-item-", "codex-evt-"] {
        if let Some(tail) = text.strip_prefix(prefix)
            && !tail.is_empty()
            && tail.bytes().all(|b| b.is_ascii_digit())
        {
            return format!("{prefix}#");
        }
    }
    text.to_owned()
}

fn normalize(value: Value) -> Value {
    match value {
        Value::String(text) => Value::String(normalize_id(&text)),
        Value::Array(items) => Value::Array(items.into_iter().map(normalize).collect()),
        Value::Object(entries) => Value::Object(
            entries
                .into_iter()
                .map(|(key, value)| (key, normalize(value)))
                .collect(),
        ),
        other => other,
    }
}

fn compare(batch: Value) {
    let calls = batch.as_array().unwrap().clone();
    assert!(calls.len() <= 64, "driver batches are limited to 64 calls");
    let expected = reference(&batch);
    let actual = Value::Array(
        calls
            .iter()
            .map(|call| {
                let method = call["method"].as_str().unwrap();
                let params = call.get("params").cloned().unwrap_or(Value::Null);
                let session = call
                    .get("sessionId")
                    .and_then(Value::as_str)
                    .unwrap_or("session-1");
                serde_json::to_value(map_codex_notification(method, &params, session)).unwrap()
            })
            .collect(),
    );
    assert_eq!(
        normalize(actual),
        normalize(expected),
        "codex batch {batch}"
    );
}

fn call(method: &str, params: Value) -> Value {
    json!({"method": method, "params": params})
}

#[test]
fn streaming_token_and_reasoning_deltas_keep_precedence_and_drop_empty() {
    let mut batch = Vec::new();
    for method in [
        "item/agentMessage/delta",
        "codex/event/agent_message_delta",
        "codex/event/agent_message_content_delta",
    ] {
        for params in [
            json!({"delta":"Implemented the runner."}),
            json!({"text":"Ran the focused tests."}),
            json!({"content":"Fallback content."}),
            json!({"delta":"delta wins","text":"text","content":"content"}),
            json!({"delta":"","text":"text wins"}),
            json!({"delta":7,"text":null,"content":["x"]}),
            json!({"delta":"   "}),
            json!({"delta":"multi\nline\t\u{1f600}"}),
            json!({}),
        ] {
            batch.push(call(method, params));
        }
    }
    for method in [
        "item/reasoning/textDelta",
        "item/reasoning/summaryTextDelta",
    ] {
        for params in [
            json!({"delta":"Considering the plan."}),
            json!({"delta":""}),
            json!({"delta":42}),
            json!({"delta":"\u{1f9e0}","extra":{"nested":true}}),
        ] {
            batch.push(call(method, params));
        }
    }
    compare(Value::Array(batch));
}

#[test]
fn tool_output_deltas_require_a_delta_and_resolve_ids_in_order() {
    let mut batch = Vec::new();
    for method in [
        "item/commandExecution/outputDelta",
        "item/fileChange/outputDelta",
    ] {
        for params in [
            json!({"delta":"ls -la\n","itemId":"call-1"}),
            json!({"delta":"out","item":{"id":"item-2"}}),
            json!({"delta":"out","itemId":"","item":{"id":"item-3"}}),
            json!({"delta":"out","id":"call-4"}),
            json!({"delta":"out"}),
            json!({"delta":""}),
            json!({"delta":9,"itemId":"call-5"}),
            json!({"delta":"tail","itemId":"  ","item":{"id":""},"id":"  "}),
            // Unlike token deltas, tool output deltas never fall back to text/content.
            json!({"text":"text must be ignored","itemId":"call-6"}),
            json!({"content":"content must be ignored","itemId":"call-7"}),
            json!({"delta":" ","itemId":"call-8"}),
        ] {
            batch.push(call(method, params));
        }
    }
    compare(Value::Array(batch));
}

#[test]
fn started_items_map_categories_arguments_and_non_tool_fallbacks() {
    let mut batch = Vec::new();
    for item in [
        json!({"id":"item-1","type":"commandExecution","command":["bash","-lc","ls -la"],"cwd":"/tmp"}),
        json!({"id":"item-2","type":"command_execution","command":"echo hi"}),
        json!({"id":"item-3","type":"file_change","path":"/tmp/a.ts","old_string":"a","new_string":"b"}),
        json!({"id":"item-4","type":"file_read","file_path":"/tmp/b.ts"}),
        json!({"id":"item-5","type":"mcp_tool_call","name":"todo","arguments":{"todoList":[]}}),
        json!({"id":"item-6","type":"search","query":"needle"}),
        json!({"id":"item-7","type":"web_search","query":"codex"}),
        json!({"id":"item-8","type":"function_call","name":"spawn_agent","arguments":{"agent_type":"explorer"}}),
        json!({"id":"item-9","type":"custom_tool_call","name":"functions.send_input","input":{"text":"hi"}}),
        json!({"id":"item-10","type":"agent_message","content":"done"}),
        json!({"id":"item-11","type":"user_message","content":"hello"}),
        json!({"id":"item-12","type":"reasoning","content":[{"type":"text","text":"thinking"}]}),
        json!({"id":"item-13","type":""}),
        json!({"id":"item-14"}),
        json!({"id":"item-15","type":"mcp","name":"","toolName":"fallback_tool"}),
        json!({"id":"item-16","type":"tool"}),
        json!({"id":"item-17","type":"execute"}),
    ] {
        batch.push(call("item/started", json!({"item": item})));
    }
    // `item/started` also accepts the message body directly.
    batch.push(call(
        "item/started",
        json!({"id":"direct-1","type":"file_read","path":"/tmp/c.ts"}),
    ));
    batch.push(call(
        "item/started",
        json!({"item":{"type":"file_change","path":"/tmp/d.ts"},"itemId":"explicit-1"}),
    ));
    for call_value in batch {
        compare(json!([call_value]));
    }
}

#[test]
fn codex_event_item_lifecycle_uses_the_message_envelope() {
    let mut batch = Vec::new();
    for msg in [
        json!({"id":"agent-call-1","type":"function_call","name":"spawn_agent","arguments":{"agent_type":"explorer","message":"Inspect the repo"}}),
        json!({"item_id":"evt-1","type":"file_read","file_path":"/tmp/a.ts"}),
        json!({"itemId":"evt-2","id":"msg-2","type":"commandExecution","command":["echo","hi"]}),
        json!({"id":"evt-3","kind":"file_change","path":"/tmp/b.ts"}),
        json!({"id":"evt-4","type":"agent_message","content":"summary"}),
        json!({"id":"evt-5","type":"user_message","content":"hello"}),
        json!({"id":"evt-6","type":"mcp_tool_call","name":"todo","arguments":{"todoList":[{"id":1}]},"status":"failed","summary":"boom"}),
        json!({"id":"evt-7","type":"task_complete","last_agent_message":"Finished."}),
        json!({"id":"evt-8","type":"file_read"}),
        json!({"type":"file_read"}),
    ] {
        for method in ["codex/event/item_started", "codex/event/item_completed"] {
            batch.push(call(method, json!({"msg": msg})));
        }
    }
    for method in ["codex/event/item_started", "codex/event/item_completed"] {
        batch.push(call(method, json!({})));
        batch.push(call(
            method,
            json!({"id":"flat-1","type":"file_read","file_path":"/tmp/e.ts","output":"text"}),
        ));
    }
    compare(Value::Array(batch));
}

#[test]
fn completed_items_preserve_structured_payloads_and_reject_user_echoes() {
    let mut batch = Vec::new();
    for item in [
        json!({"id":"item-1","type":"mcp_tool_call","status":"completed","output":{"path":"/tmp/a.png"}}),
        json!({"id":"item-2","type":"mcp_tool_call","status":"failed","error":{"message":"bad"}}),
        json!({"id":"item-3","type":"mcp_tool_call","status":"error","summary":"summary text"}),
        json!({"id":"item-4","type":"commandExecution","status":"declined","output":"","exitCode":1}),
        json!({"id":"item-5","type":"file_change","status":"completed","output":{"changes":[]},"last_agent_message":"patched"}),
        json!({"id":"item-6","type":"file_read","output":{"content":"a"},"status":"completed"}),
        json!({"id":"item-7","type":"web_search","output":"[{\"title\":\"x\"}]"}),
        json!({"id":"item-8","type":"agent_message","content":[{"type":"text","text":"Agent finished."},{"type":"output_text","text":"More."}]}),
        json!({"id":"item-9","type":"agent_message","content":[{"type":"image","data":"zzz"}]}),
        json!({"id":"item-10","type":"user_message","content":"echo"}),
        json!({"id":"item-11","role":"user","type":"message","content":"echo"}),
        json!({"id":"item-12","role":"assistant","type":"message","content":"kept"}),
        json!({"id":"item-13","type":"reasoning","content":"hidden"}),
        json!({"id":"item-14","type":"file_read","output":{"nested":{"deep":true}},"status":"failed"}),
        json!({"id":"item-15","type":"mcp_tool_call","output":[1,2,3],"status":"completed"}),
        json!({"id":"item-16","type":"mcp_tool_call","output":null,"summary":null,"message":"m","status":null}),
    ] {
        batch.push(call("item/completed", json!({"item": item})));
    }
    for method in [
        "item/mcpToolCall/progress",
        "item/mcpToolCall/completed",
        "item/mcpToolCall/failed",
    ] {
        for params in [
            json!({"itemId":"call-1","message":"RUN v3\n"}),
            json!({"id":"call-2","name":"todo","toolName":"other","tool":"third","arguments":{"a":1},"args":{"b":2},"result":{"items":[]},"status":"completed"}),
            json!({"itemId":"  ","item":{"id":"call-3"},"message":""}),
            json!({"message":7,"output":{"k":"v"},"summary":"sum"}),
            json!({"itemId":"call-4","name":"todo","output":"raw text","status":"failed"}),
            json!({"itemId":"call-5","toolName":"t","args":null,"arguments":null,"error":"nope"}),
            json!({"itemId":"call-6","status":"error"}),
        ] {
            batch.push(call(method, params));
        }
    }
    compare(Value::Array(batch));
}

#[test]
fn turn_lifecycle_and_retryable_errors_stay_consistent() {
    let mut batch = vec![
        call("turn/started", json!({})),
        call("turn/started", json!({"turn":{"id":"t1"}})),
        call("turn/completed", json!({"turn":{"status":"completed"}})),
        call(
            "turn/completed",
            json!({"turn":{"status":"failed","error":{"message":"boom"}}}),
        ),
        call(
            "turn/completed",
            json!({"turn":{"status":"failed","error":null}}),
        ),
        call(
            "turn/completed",
            json!({"turn":{"status":"failed","error":{"message":"   "}}}),
        ),
        call("turn/completed", json!({"turn":{"status":"failed"}})),
        call("turn/completed", json!({})),
        call(
            "turn/completed",
            json!({"turn":{"status":9,"error":{"message":8}}}),
        ),
        call(
            "error",
            json!({"error":{"message":"temporary"},"willRetry":true}),
        ),
        call(
            "error",
            json!({"error":{"message":"temporary"},"willRetry":false}),
        ),
        call(
            "error",
            json!({"error":{"message":"temporary"},"willRetry":"true"}),
        ),
        call("error", json!({"error":{"message":"fatal"}})),
        call("error", json!({"error":{"message":""}})),
        call("error", json!({"error":null})),
        call("session/completed", json!({})),
        call(
            "codex/event/turn_diff",
            json!({"msg":{"unified_diff":"@@ -1 +1 @@"}}),
        ),
    ];
    batch.push(call(
        "turn/completed",
        json!({"turn":{"status":"failed","error":{"message":" padded \n"}}}),
    ));
    compare(Value::Array(batch));
}

#[test]
fn agent_messages_usage_activities_and_unknown_methods_match() {
    let batch = vec![
        call(
            "codex/event/agent_message",
            json!({"content":"content wins","text":"t"}),
        ),
        call("codex/event/agent_message", json!({"text":"text"})),
        call("codex/event/agent_message", json!({"message":"message"})),
        call("codex/event/agent_message", json!({"delta":"delta"})),
        call("codex/event/agent_message", json!({"content":""})),
        call("codex/event/user_message", json!({"content":"echo"})),
        call("item/plan/delta", json!({"delta":"step"})),
        call("turn/plan/updated", json!({"plan":[]})),
        call("turn/diff/updated", json!({"diff":""})),
        call(
            "thread/tokenUsage/updated",
            json!({"tokenUsage":{"total":{"inputTokens":10,"outputTokens":5,"cachedInputTokens":2},"last":{"inputTokens":3,"outputTokens":1}}}),
        ),
        call(
            "thread/tokenUsage/updated",
            json!({"tokenUsage":{"total":{"inputTokens":10,"outputTokens":5,"cachedInputTokens":11}}}),
        ),
        call(
            "thread/tokenUsage/updated",
            json!({"tokenUsage":{"total":{"inputTokens":1.5,"outputTokens":2}}}),
        ),
        call("thread/tokenUsage/updated", json!({"tokenUsage":{}})),
        call(
            "codex/event/token_count",
            json!({"msg":{"info":{"total_token_usage":{"input_tokens":100,"output_tokens":40,"total_tokens":140,"request_count":2},"last_token_usage":{"input_tokens":7,"output_tokens":3}}}}),
        ),
        call(
            "codex/event/token_count",
            json!({"msg":{"info":{"total_token_usage":{"input_tokens":-1,"output_tokens":4}}}}),
        ),
        call(
            "codex/event/token_count",
            json!({"info":{"total_token_usage":{"input_tokens":12,"output_tokens":4,"cached_input_tokens":6}}}),
        ),
        call(
            "codex/event/task_started",
            json!({"msg":{"type":"task_started"}}),
        ),
        call(
            "codex/event/task_complete",
            json!({"msg":{"type":"task_complete","last_agent_message":"Updated the tests."}}),
        ),
        call(
            "codex/event/task_complete",
            json!({"msg":{"type":"task_complete","content":[{"type":"text","text":"parts"}]}}),
        ),
        call(
            "codex/event/task_complete",
            json!({"msg":{"type":"task_complete"}}),
        ),
        call("codex/event/agent_reasoning", json!({"msg":{"text":"why"}})),
        call("thread/started", json!({"thread":{"id":"t"}})),
        call("thread/status/changed", json!({"status":"running"})),
        call("thread/name/updated", json!({"name":"n"})),
        call("model/rerouted", json!({"from":"a","to":"b"})),
        call("configWarning", json!({"summary":"s"})),
        call("deprecationNotice", json!({"summary":"s"})),
        call("account/updated", json!({"plan":"pro"})),
        call("skills/changed", json!({"skills":[]})),
        call(
            "codex/event/mcp_startup_complete",
            json!({"msg":{"name":"jait"}}),
        ),
        call("codex/event/skills_update_available", json!({"msg":{}})),
        call(
            "some/unknown/method",
            json!({"any":["payload",{"deep":null}]}),
        ),
        call("", json!({})),
    ];
    compare(Value::Array(batch));
}

#[test]
fn adversarial_type_normalization_and_payload_gating_match() {
    let mut batch = Vec::new();
    for item_type in [
        "FileChange",
        "MCP_Tool-Call",
        "commandExecutionPreview",
        "WEB_SEARCH",
        "web_search_preview",
        "  spaced  type  ",
        "patch",
        "subagent",
        "SubAgentRun",
        "__proto__",
        "constructor",
        "file///change",
    ] {
        let item = json!({"id":"adv-1","type":item_type,"name":"todo","arguments":{"q":item_type}});
        batch.push(call("item/started", json!({"item": item.clone()})));
        batch.push(call("item/completed", json!({"item": item})));
        batch.push(call(
            "codex/event/item_completed",
            json!({"msg": {"id":"adv-2","type":item_type}}),
        ));
    }
    // `item/started` accepts a non-object `item`, which then degrades to the
    // notification body itself instead of shadowing it.
    batch.push(call(
        "item/started",
        json!({"item":"not-an-object","type":"file_read","id":"adv-non-object"}),
    ));
    batch.push(call(
        "item/started",
        json!({"item":["array"],"type":"file_read","id":"adv-array"}),
    ));
    // Whitespace-only strings never satisfy the text gate.
    batch.push(call(
        "item/completed",
        json!({"item":{"id":"ws-1","type":"message","content":"   "}}),
    ));
    batch.push(call(
        "item/completed",
        json!({"item":{"id":"ws-2","type":"message","content":"\n\t","text":"real"}}),
    ));
    batch.push(call("item/completed", json!({"item":{"id":"ws-3","type":"message","content":[{"type":"text","text":"  "},{"type":"text","text":"keep"}]}})));
    batch.push(call(
        "item/completed",
        json!({"item":{"id":"ws-4","type":"message","content":[{"type":"output_text","text":7}]}}),
    ));
    batch.push(call(
        "codex/event/task_complete",
        json!({"msg":{"type":"task_complete","last_agent_message":"   "}}),
    ));
    batch.push(call("codex/event/agent_message", json!({"content":"   "})));
    // Tool payloads accept objects, JSON-encoded objects, and reject the rest.
    for output in [
        json!("{\"a\":1}"),
        json!("{oops"),
        json!("[1,2]"),
        json!("\"str\""),
        json!("{\"nested\":{\"deep\":[1,null]}}"),
        json!(""),
    ] {
        batch.push(call(
            "item/completed",
            json!({"item":{"id":"json-1","type":"file_read","output":output}}),
        ));
        batch.push(call(
            "item/completed",
            json!({"item":{"id":"json-2","type":"file_read","result":output}}),
        ));
    }
    // mcp progress accepts `args` when `arguments` is absent or null.
    batch.push(call(
        "item/mcpToolCall/progress",
        json!({"itemId":"p-1","args":{"only":"args"}}),
    ));
    batch.push(call(
        "item/mcpToolCall/progress",
        json!({"itemId":"p-2","arguments":null,"args":{"fallback":true}}),
    ));
    batch.push(call(
        "item/mcpToolCall/progress",
        json!({"itemId":"p-3","message":"  "}),
    ));
    batch.push(call(
        "item/mcpToolCall/completed",
        json!({"itemId":"p-4","arguments":"string","args":"string"}),
    ));
    compare(Value::Array(batch));
}

#[test]
fn session_identifiers_and_non_object_payloads_pass_through() {
    let batch = vec![
        json!({"method":"item/agentMessage/delta","params":{"delta":"x"},"sessionId":""}),
        json!({"method":"item/agentMessage/delta","params":{"delta":"x"},"sessionId":"中文 \" $unit"}),
        json!({"method":"turn/started","params":{}}),
        json!({"method":"unknown/activity","params":[1,2],"sessionId":"arr"}),
        json!({"method":"unknown/activity","params":"text","sessionId":"str"}),
        json!({"method":"turn/completed","params":{"turn":[1]}}),
    ];
    compare(Value::Array(batch));
}
