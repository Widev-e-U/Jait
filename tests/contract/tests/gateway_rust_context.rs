#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::{
    providers::todo_result::extract_todo_result_items, tools::token_estimator as estimates,
};
use serde_json::{Value, json};
use std::{fs, path::PathBuf};
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}
fn reference(call: Value) -> Value {
    let p = root()
        .join(".jait/artifacts/gateway-rust/native-context")
        .join(uuid::Uuid::new_v4().to_string());
    fs::create_dir_all(&p).unwrap();
    internal_driver::call(&root(), &p, json!({"version":1,"calls":[call]}), &|| false).unwrap()[0]
        .clone()
}
fn estimates(cases: Vec<Value>) -> Value {
    let expected = reference(json!({"op":"nativecontext.estimates","cases":cases}));
    let actual=cases.iter().map(|c|{
        let messages=c["messages"].as_array().unwrap();let schemas=c["schemas"].as_array().unwrap();
        json!({"text":estimates::estimate_tokens(c["text"].as_str().unwrap_or("")),
            "json":estimates::estimate_optional_json_tokens(c.get("json")),
            "messages":messages.iter().map(estimates::estimate_message_tokens).collect::<Vec<_>>(),
            "history":estimates::estimate_history_tokens(messages),"schemas":estimates::estimate_tool_schema_tokens(schemas),
            "usage":estimates::compute_context_usage(messages,schemas,c["window"].as_f64().unwrap())})
    }).collect::<Vec<_>>();
    assert_eq!(json!(actual), expected);
    json!(actual)
}
fn todos(cases: Vec<Value>) -> Value {
    let expected = reference(json!({"op":"nativecontext.todo","cases":cases}));
    let actual = cases
        .iter()
        .map(
            |c| match extract_todo_result_items(c["name"].as_str(), &c["data"], &c["args"]) {
                Ok(value) => value.unwrap_or(Value::Null),
                Err(error) => json!({"error":error}),
            },
        )
        .collect::<Vec<_>>();
    assert_eq!(json!(actual), expected);
    json!(actual)
}
#[test]
fn token_estimates_count_utf16_text_json_and_ceiling_boundaries() {
    let cases=(0..100).map(|n|json!({"text":"😀中".repeat(n),"json":if n%3==0{json!("😀x".repeat(n))}else if n%3==1{json!(null)}else{json!({"10":1e21,"2":-0.0,"text":"\n😀","n":1e-7})},
        "messages":[],"schemas":[],"window":n})).collect();
    estimates(cases);
}
#[test]
fn hidden_reasoning_tool_fields_and_priming_are_counted_in_the_correct_categories() {
    let messages = json!([
        {"role":"system","content":"system rules","thinking":"hidden".repeat(30)},
        {"role":"user","content":"hello","name":"fixture"},
        {"role":"assistant","content":"","tool_calls":[{"id":"call","function":{"name":"read","arguments":"{\"path\":\"😀\"}"}}],"thinking":"😀".repeat(100)},
        {"role":"tool","content":"result","tool_call_id":"call"},
        {"role":"other","content":"history","name":"","tool_calls":[]}
    ]);
    let cases=[0.0,-1.0,1.0,2048.0,0.1,100000.0].map(|window|json!({"text":"","json":"","messages":messages,
        "schemas":[{"name":"read","parameters":{"path":{"type":"string"}}},"raw",null],"window":window})).to_vec();
    let v = estimates(cases);
    assert_eq!(v[0]["usage"]["ratio"], 0);
    assert_eq!(v[2]["usage"]["ratio"], 1);
    assert!(v[0]["messages"][2].as_u64().unwrap() > 50);
    assert_eq!(estimates::estimate_history_tokens(&[]), 3);
}
#[test]
fn tool_schema_safety_margin_preserves_binary_float_ceiling() {
    let cases=(0..100).map(|n|json!({"text":"","json":{},"messages":[],"schemas":[{"text":"x".repeat(n)}],"window":10000})).collect();
    estimates(cases);
}
fn item(id: Value) -> Value {
    json!({"id":id,"title":"row","status":"completed"})
}
#[test]
fn todo_data_precedence_aliases_empty_arrays_and_invalid_rows_match() {
    let mut cases = vec![];
    for name in [
        None,
        Some("other"),
        Some("todo"),
        Some(" TodoWrite \u{feff}"),
        Some("mcp__jait__TODO"),
        Some("prefixmanage_todo_list"),
    ] {
        for data in [
            json!({"items":[item(json!(1))]}),
            json!({"items":[]}),
            json!({"items":"bad"}),
            json!({"items":[{"id":"1","title":"bad","status":"completed"}]}),
            json!(null),
        ] {
            cases.push(json!({"name":name,"data":data,"args":{"todoList":[{"id":2,"title":"from args","status":"in-progress"}]}}));
        }
    }
    todos(cases);
    let v = todos(vec![
        json!({"name":"todo","data":null,"args":{"todoList":null,"todos":[{"content":"ignored"}]}}),
        json!({"name":"todo","data":{"items":[item(json!(9007199254740993_u64)),item(json!(1e-7))]},"args":{}}),
        json!({"name":"todo","data":{"items":[{"id":1,"title":"x","status":"pending"}]},"args":{"todos":[]}}),
    ]);
    assert!(v[0].is_null());
    assert_eq!(v[1][0]["id"], json!(9007199254740992_u64));
}
#[test]
fn provider_todos_map_unknown_statuses_nullish_fields_and_javascript_string_values() {
    let cases = vec![
        json!({"name":"todo","args":{"todos":[null,3,"raw",[],{"content":"","title":"ignored","status":"in_progress"},
            {"content":null,"title":"fallback","id":-2.5,"status":"completed"},
            {"content":["x",null,[1,true],{"x":3}],"status":17},
            {"content":{"x":1},"status":"unknown"},{"title":true,"status":null}]}}),
        json!({"name":"todo","args":{"todos":"bad"}}),
        json!({"name":"other","args":{"todos":[{}]}}),
        json!({"name":"todo","args":{"todos":[{"content":{"toString":false}}]}}),
        json!({"name":"todo","args":{"todos":[{"status":{"toString":false}}]}}),
    ];
    let v = todos(cases);
    assert_eq!(v[0][4]["title"], "");
    assert_eq!(v[0][5]["title"], "fallback");
    assert_eq!(v[0][6]["title"], "x,,1,true,[object Object]");
    assert!(v[3].get("error").is_some());
}

#[test]
fn undefined_json_and_empty_requests_have_the_source_zero_costs() {
    let v = estimates(vec![
        json!({"text":"","messages":[],"schemas":[],"window":0}),
    ]);
    assert_eq!(v[0]["json"], 0);
    assert_eq!(v[0]["history"], 3);
    assert_eq!(v[0]["usage"]["total"], 0);
}
