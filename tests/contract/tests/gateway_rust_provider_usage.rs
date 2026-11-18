//! Exact JSON comparisons with the production provider accounting functions.
#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::providers::usage::{
    ModelUsage, TurnUsageAccumulator, parse_acp_usage, parse_codex_usage, summarize_usage,
};
use serde_json::{Value, json};
use std::path::PathBuf;

fn compare(calls: Vec<Value>) {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap();
    let expected = internal_driver::call(
        &root,
        &root.join(".jait/artifacts/gateway-rust/provider-usage"),
        json!({"version":1,"calls":calls}),
        &|| false,
    )
    .unwrap();
    let actual: Vec<Value> = calls.iter().map(native).collect();
    assert_eq!(json!(actual), expected, "calls={calls:?}");
}
fn native(call: &Value) -> Value {
    match call["op"].as_str().unwrap() {
        "nativeusage.codex" => serde_json::to_value(parse_codex_usage(&call["value"])).unwrap(),
        "nativeusage.acp" => serde_json::to_value(parse_acp_usage(
            &call["value"],
            call["id"].as_str().unwrap(),
        ))
        .unwrap(),
        "nativeusage.summary" => summarize_usage(
            &serde_json::from_value::<Vec<jait_gateway::providers::usage::UsageRound>>(
                call["rounds"].clone(),
            )
            .unwrap(),
        )
        .unwrap_or(Value::Null),
        "nativeusage.accumulate" => {
            let mut state = TurnUsageAccumulator::new(
                call.get("baseline")
                    .filter(|v| !v.is_null())
                    .map(|v| serde_json::from_value::<ModelUsage>(v.clone()).unwrap()),
                call["fresh"].as_bool().unwrap_or(false),
            );
            Value::Array(call["actions"].as_array().unwrap().iter().map(|action| {
                if action["op"] == "add" { state.add(serde_json::from_value(action["usage"].clone()).unwrap()); }
                json!({"baseline":state.baseline,"metrics":state.metrics_with_duration(action["durationMs"].as_f64().unwrap_or(0.0))})
            }).collect())
        }
        _ => panic!("unknown native operation"),
    }
}
fn acp(value: Value) -> Value {
    json!({"op":"nativeusage.acp","value":value,"id":"turn-\u{1f980}"})
}
fn codex(value: Value) -> Value {
    json!({"op":"nativeusage.codex","value":value})
}
fn usage(input: u64, output: u64, scope: &str) -> Value {
    json!({"inputTokens":input,"outputTokens":output,"scope":scope})
}
fn add(value: Value) -> Value {
    json!({"op":"add","usage":value,"durationMs":1250})
}
fn accumulate(baseline: Value, fresh: bool, actions: Vec<Value>) -> Value {
    json!({"op":"nativeusage.accumulate","baseline":baseline,"fresh":fresh,"actions":actions})
}

#[test]
fn parses_numeric_values_as_js_safe_integers() {
    compare(
        [
            json!(0),
            json!(-0.0),
            json!(1.0),
            json!(42.0),
            json!(9007199254740991_u64),
            json!(9007199254740992_u64),
            json!(-1),
            json!(1.5),
            json!("5"),
            json!(null),
            json!(true),
            json!([]),
            json!({}),
        ]
        .into_iter()
        .map(|n| acp(json!({"inputTokens":n,"outputTokens":1})))
        .collect(),
    );
}
#[test]
fn counter_aliases_use_nullish_precedence_and_validate_cache() {
    compare(vec![
        acp(
            json!({"inputTokens":null,"input_tokens":50,"output_tokens":2,"cachedReadTokens":20,"total_tokens":99,"requestCount":0}),
        ),
        acp(json!({"inputTokens":"bad","input_tokens":50,"outputTokens":2})),
        acp(json!({"inputTokens":0,"input_tokens":50,"outputTokens":0,"output_tokens":2})),
        acp(
            json!({"inputTokens":50,"outputTokens":2,"cachedInputTokens":null,"cached_input_tokens":0,"cachedReadTokens":20,"totalTokens":null,"total_tokens":52}),
        ),
        acp(json!({"inputTokens":50,"outputTokens":2,"cachedInputTokens":51})),
        acp(
            json!({"inputTokens":50,"outputTokens":2,"cachedInputTokens":-1,"cachedReadTokens":20,"requestCount":1.5,"totalTokens":true}),
        ),
        acp(
            json!({"inputTokens":50,"outputTokens":2,"cachedInputTokens":50.0,"totalTokens":0.0,"requestCount":1.0}),
        ),
    ]);
}
#[test]
fn codex_envelope_nulls_fall_back_but_other_invalid_values_do_not() {
    let counters = json!({"inputTokens":3,"outputTokens":2,"cachedInputTokens":1});
    let info = json!({"total":counters,"last":counters});
    compare(vec![
        codex(json!({"msg":null,"tokenUsage":info})),
        codex(json!({"tokenUsage":null,"info":info})),
        codex(
            json!({"tokenUsage":{"total":null,"total_token_usage":counters,"last":null,"last_token_usage":counters}}),
        ),
        codex(json!({"msg":false,"tokenUsage":info})),
        codex(json!({"tokenUsage":false,"info":info})),
        codex(json!({"tokenUsage":{"total":false,"total_token_usage":counters}})),
        codex(
            json!({"msg":{"info":{"total_token_usage":counters,"last_token_usage":{"input_tokens":1,"output_tokens":0}}}}),
        ),
        codex(
            json!({"tokenUsage":{"total":counters,"last":{"inputTokens":1,"outputTokens":0,"cachedInputTokens":2}}}),
        ),
    ]);
}
#[test]
fn malformed_envelopes_and_counters_never_create_usage() {
    compare(
        [
            Value::Null,
            json!(0),
            json!("x"),
            json!(true),
            json!([]),
            json!({}),
            json!({"tokenUsage":[]}),
            json!({"tokenUsage":{"total":[]}}),
        ]
        .into_iter()
        .flat_map(|v| [codex(v.clone()), acp(v)])
        .collect(),
    );
}
#[test]
fn resumed_and_fresh_sessions_charge_only_attributable_tokens() {
    let mut first = usage(1000, 50, "session");
    first["lastRequest"] = json!({"inputTokens":20,"outputTokens":2});
    compare(vec![
        accumulate(
            Value::Null,
            false,
            vec![
                json!({"op":"snapshot"}),
                add(usage(1000, 50, "session")),
                add(usage(1030, 52, "session")),
            ],
        ),
        accumulate(
            Value::Null,
            false,
            vec![add(first.clone()), add(usage(1030, 52, "session"))],
        ),
        accumulate(
            Value::Null,
            true,
            vec![add(first), add(usage(1030, 52, "session"))],
        ),
        accumulate(
            usage(1000, 50, "session"),
            false,
            vec![
                add(usage(1030, 52, "session")),
                add(usage(1030, 52, "session")),
                add(usage(1020, 55, "session")),
                add(usage(1040, 51, "session")),
                add(usage(1040, 56, "session")),
            ],
        ),
    ]);
}
#[test]
fn equal_input_output_ignores_cache_and_request_only_updates() {
    let first = json!({"inputTokens":100,"outputTokens":10,"cachedInputTokens":50,"requestCount":2,"scope":"session"});
    compare(vec![accumulate(
        first.clone(),
        true,
        vec![
            add({
                let mut update = first.clone();
                update["cachedInputTokens"] = json!(80);
                update["requestCount"] = json!(3);
                update
            }),
            add(
                json!({"inputTokens":120,"outputTokens":12,"cachedInputTokens":40,"requestCount":1,"scope":"session"}),
            ),
            add(
                json!({"inputTokens":130,"outputTokens":13,"cachedInputTokens":45,"requestCount":2,"scope":"session"}),
            ),
            add(usage(135, 14, "session")),
            add(
                json!({"inputTokens":140,"outputTokens":15,"cachedInputTokens":50,"requestCount":4,"scope":"session"}),
            ),
        ],
    )]);
}
#[test]
fn turn_ids_replace_without_reordering_and_override_session_deltas() {
    let mut large = usage(9007199254740991, 0, "turn");
    large["id"] = json!("z");
    let mut one = usage(1, 0, "turn");
    one["id"] = json!("a");
    let mut two = usage(2, 0, "turn");
    two["id"] = json!("m");
    let mut replaced = large.clone();
    replaced["outputTokens"] = json!(1);
    let mut empty = usage(2, 3, "turn");
    empty["id"] = json!("");
    compare(vec![accumulate(
        Value::Null,
        true,
        vec![
            add(usage(100, 10, "session")),
            add(large),
            add(one),
            add(two),
            add(replaced),
            add(empty),
            add(usage(4, 2, "turn")),
            add(usage(7, 1, "turn")),
            add(usage(200, 20, "session")),
        ],
    )]);
}
#[test]
fn optional_aggregate_counters_require_every_contribution() {
    let a = json!({"scope":"turn","id":"a","inputTokens":10,"outputTokens":1,"cachedInputTokens":0,"requestCount":0});
    let b = json!({"scope":"turn","id":"b","inputTokens":20,"outputTokens":2,"cachedInputTokens":10,"requestCount":1});
    compare(vec![accumulate(
        Value::Null,
        false,
        vec![
            add(a),
            add(b),
            add(json!({"scope":"turn","id":"c","inputTokens":1,"outputTokens":0})),
            add(
                json!({"scope":"turn","id":"c","inputTokens":1,"outputTokens":0,"cachedInputTokens":0,"requestCount":0}),
            ),
        ],
    )]);
}

#[test]
fn round_summaries_retain_omitted_metrics_and_optional_totals() {
    compare(vec![
        json!({"op":"nativeusage.summary","rounds":[]}),
        json!({"op":"nativeusage.summary","rounds":[{}, {"metrics":null}]}),
        json!({"op":"nativeusage.summary","rounds":[{"metrics":{"durationMs":0}}]}),
        json!({"op":"nativeusage.summary","rounds":[{},
          {"metrics":{"durationMs":1.25,"promptTokens":5,"completionTokens":2,"totalTokens":0,"cachedPromptTokens":0,"requestCount":0}},
          {"metrics":{"durationMs":2.5,"completionTokens":3,"cachedPromptTokens":1,"requestCount":1,"tokenUsageEstimated":true}}]}),
        json!({"op":"nativeusage.summary","rounds":[
          {"metrics":{"durationMs":10,"promptTokens":5,"cachedPromptTokens":2,"requestCount":1}},
          {"metrics":{"durationMs":20,"completionTokens":3,"tokenUsageEstimated":false}}]}),
    ]);
}
#[test]
fn summary_rounding_and_duration_follow_js_numbers() {
    compare(vec![
        json!({"op":"nativeusage.summary","rounds":[
          {"metrics":{"durationMs":0.1,"promptTokens":9007199254740991_u64,"completionTokens":0.5}},
          {"metrics":{"durationMs":0.2,"promptTokens":1,"totalTokens":1.25}},
          {"metrics":{"durationMs":-1,"promptTokens":2,"completionTokens":1}}]}),
        accumulate(
            Value::Null,
            true,
            vec![json!({"op":"add","usage":usage(0,0,"turn"),"durationMs":0.125})],
        ),
    ]);
}

#[test]
fn each_optional_and_required_counter_checks_the_number_domain() {
    for key in [
        "outputTokens",
        "cachedInputTokens",
        "totalTokens",
        "requestCount",
    ] {
        let calls = [
            json!(null),
            json!(-1),
            json!(1.5),
            json!("2"),
            json!(false),
            json!([]),
            json!({}),
            json!(9007199254740992_u64),
            json!(0.0),
            json!(1.0),
        ]
        .into_iter()
        .map(|value| {
            let mut counters = json!({"inputTokens":10,"outputTokens":1});
            counters[key] = value;
            acp(counters)
        })
        .collect();
        compare(calls);
    }
}
#[test]
fn summary_overflows_and_cancelling_floats_keep_reduction_order() {
    compare(vec![
        json!({"op":"nativeusage.summary","rounds":[
            {"metrics":{"durationMs":1e308,"promptTokens":1e308,"cachedPromptTokens":1e308,"requestCount":1e308}},
            {"metrics":{"durationMs":1e308,"promptTokens":1e308,"cachedPromptTokens":1e308,"requestCount":1e308}}]}),
        json!({"op":"nativeusage.summary","rounds":[
            {"metrics":{"durationMs":1e20,"promptTokens":1e20}},
            {"metrics":{"durationMs":-1e20,"promptTokens":-1e20}},
            {"metrics":{"durationMs":0.125,"promptTokens":0.5}}]}),
    ]);
}
#[test]
fn seeded_mixed_usage_streams_match_every_snapshot() {
    let mut seed = 73_u64;
    let mut actions = Vec::new();
    let (mut input, mut output) = (100, 10);
    for i in 0..48 {
        seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1);
        input += seed % 13;
        output += (seed >> 8) % 7;
        let turn = i % 5 == 0;
        let mut u = usage(
            if i % 7 == 0 { input - 10 } else { input },
            output,
            if turn { "turn" } else { "session" },
        );
        if turn {
            u["id"] = json!(format!("id-{}", i % 3));
        }
        if i % 4 != 0 {
            u["cachedInputTokens"] = json!((seed >> 16) % 50);
        }
        if i % 6 != 0 {
            u["requestCount"] = json!(i);
        }
        actions.push(add(u));
    }
    compare(vec![
        accumulate(Value::Null, false, actions.clone()),
        accumulate(usage(90, 5, "session"), true, actions),
    ]);
}

#[test]
fn insertion_order_is_observable_above_safe_sum_range() {
    let mut actions = Vec::new();
    for (id, input) in [
        ("z", 9_007_199_254_740_991_u64),
        ("a", 1),
        ("m", 1),
        ("b", 1),
        ("z", 9_007_199_254_740_991_u64),
    ] {
        let mut u = usage(input, 0, "turn");
        u["id"] = json!(id);
        actions.push(add(u));
    }
    compare(vec![accumulate(Value::Null, false, actions)]);
}
