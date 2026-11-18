#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::services::execution_guard::{ExecutionCheckpoint, ExecutionGuard};
use serde_json::{Value, json};
use std::{fs, path::PathBuf};
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}
fn compare(cases: Vec<Value>) -> Value {
    let dir = root()
        .join(".jait/artifacts/gateway-rust/execution-guard")
        .join(uuid::Uuid::new_v4().to_string());
    fs::create_dir_all(&dir).unwrap();
    let expected = internal_driver::call(
        &root(),
        &dir,
        json!({"version":1,"calls":[{"op":"nativeguard.run","cases":cases}]}),
        &|| false,
    )
    .unwrap()[0]
        .clone();
    let actual=cases.iter().map(|c|{
  let checkpoint=c.get("checkpoint").map(|v|serde_json::from_value::<ExecutionCheckpoint>(v.clone()).unwrap());
  let mut guard=ExecutionGuard::new(checkpoint,c["maxCalls"].as_u64().unwrap_or(120),c["windowSize"].as_u64().unwrap_or(20));
  c["steps"].as_array().unwrap().iter().map(|s|{
   let reason=match s["op"].as_str().unwrap(){"before"=>guard.before_call(),"record"=>{let r=&s["result"];guard.record(s["tool"].as_str().unwrap(),r["ok"].as_bool().unwrap(),r["message"].as_str().unwrap(),r.get("data"))},_=>None};
   json!({"reason":reason,"stopReason":guard.stop_reason(),"checkpoint":guard.snapshot()})
  }).collect::<Vec<_>>()
 }).collect::<Vec<_>>();
    let actual = actual
        .into_iter()
        .zip(&cases)
        .map(|(rows, c)| {
            if c["finalOnly"] == true {
                rows.into_iter().rev().take(1).collect::<Vec<_>>()
            } else {
                rows
            }
        })
        .collect::<Vec<_>>();
    if json!(actual) != expected {
        fs::write(
            dir.join("native.json"),
            serde_json::to_string_pretty(&actual).unwrap(),
        )
        .unwrap();
        fs::write(
            dir.join("reference.json"),
            serde_json::to_string_pretty(&expected).unwrap(),
        )
        .unwrap();
    }
    assert!(
        json!(actual) == expected,
        "guard parity artifacts {}",
        dir.display()
    );
    json!(actual)
}
fn record(tool: &str, ok: bool, message: &str, data: Value) -> Value {
    json!({"op":"record","tool":tool,"result":{"ok":ok,"message":message,"data":data}})
}
fn calls(records: Vec<Value>) -> Vec<Value> {
    records
        .into_iter()
        .flat_map(|s| [json!({"op":"before"}), s])
        .collect()
}
#[test]
fn total_call_and_no_progress_windows_are_sticky_and_survive_checkpoints() {
    compare(vec![
        json!({"maxCalls":2,"steps":calls(vec![record("file.read",true,"",json!({"content":"one"})),record("file.read",true,"",json!({"content":"two"})),record("file.read",true,"",json!({"content":"three"}))])}),
        json!({"windowSize":2,"steps":calls(vec![record("file.read",true,"",json!({"content":"one"})),record("file.read",true,"",json!({"content":"one"})),record("file.read",true,"",json!({"content":"one"})),record("file.read",true,"",json!({"content":"one"})),record("file.read",true,"",json!({"content":"new"}))])}),
        json!({"maxCalls":0,"steps":[{"op":"before"},{"op":"snapshot"}]}),
        json!({"checkpoint":{"calls":12,"windowCalls":1,"evidence":["old","old"],"failures":{},"stopReason":"saved stop"},"steps":[{"op":"before"},record("execute",true,"",json!({"output":"ignored"}))]}),
    ]);
}
#[test]
fn aliases_failure_families_hidden_exit_failures_and_successful_recovery_match() {
    let errors = [
        "preview is not shared with the agent",
        "Executable doesn't exist",
        "fatal: not a git repository",
        "source chat not found",
        "ENOENT fixture",
        "bash: missing: command not found",
        "Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'fixture'",
        "No test files found",
        "bash: fixture: permission denied",
        "consent timed out",
    ];
    let mut cases = vec![];
    for message in errors {
        cases.push(json!({"steps":calls(vec![record("functions.mcp__jait__jait_terminal",false,message,Value::Null),record("execute",false,message,Value::Null),record("terminal.run",true,"recovered",json!({"output":"new"})),record("jait.terminal",false,message,Value::Null)])}));
        cases.push(json!({"steps":calls(vec![record("execute",true,message,json!({"exitCode":0})),record("file.read",false,message,Value::Null),record("execute",true,"done",json!({"exitCode":-1}))])}));
    }
    compare(cases);
}
#[test]
fn recurring_failures_share_fingerprints_but_optional_files_do_not_exhaust_environment() {
    compare(vec![
        json!({"steps":calls((1..=4).map(|n|record("file.read",false,&format!("failure call_{n}-abc at line {n}"),Value::Null)).collect())}),
        json!({"steps":calls(vec![record("execute",false,"command not found",Value::Null),record("execute",false,"Cannot find module 'x'",Value::Null),record("execute",false,"permission denied",Value::Null),record("execute",false,"No test files found",Value::Null),record("execute",false,"consent timeout",Value::Null),record("execute",false,"source chat not found",Value::Null),record("execute",true,"new",Value::Null)])}),
        json!({"steps":calls((0..8).map(|n|record("file.read",false,&format!("ENOENT file-{n}"),Value::Null)).collect())}),
        json!({"steps":calls(vec![record("file.read",false,"ENOENT .git metadata not found",Value::Null),record("execute",false,"ENOENT invalid gitfile",Value::Null),record("execute",false,"ENOENT invalid gitfile",Value::Null),record("execute",false,"ENOENT invalid gitfile",Value::Null)])}),
    ]);
}
#[test]
fn bookkeeping_is_not_evidence_line_numbers_are_stripped_and_retention_is_bounded() {
    let mut cases = vec![];
    for tool in [
        "todo",
        "jait.todos",
        "memory.save",
        "team.chat",
        "thread.control",
        "agent.spawn",
        "tools.search",
        "jait.catalog",
    ] {
        cases.push(json!({"windowSize":1,"steps":calls(vec![record(tool,true,"fresh",json!({"content":"fresh"}))])}));
    }
    cases.push(json!({"windowSize":1,"steps":calls(vec![record("file.read",true,"",json!({"content":"1\tline"})),record("file.read",true,"",json!({"content":"200\tline"}))])}));
    cases.push(json!({"steps":calls(vec![record("x",true,"quoted 😀",Value::Null),record("x",true,"",json!({"10":1,"2":2,"x":-0.0})),record("x",true,"",json!({"content":"\u{feff}\t"}))])}));
    cases.push(json!({"finalOnly":true,"maxCalls":200,"windowSize":200,"steps":calls((0..130).map(|n|record("file.read",true,"",json!({"content":format!("observation-{n}")}))).collect())}));
    compare(cases);
}
#[test]
fn failure_hashes_preserve_utf16_prefixes_and_ascii_word_boundaries() {
    compare(vec![json!({"steps":calls(vec![
     record("x",false,&format!("{}😀suffix","a".repeat(3999)),Value::Null),
     record("x",false,"版本12 call_abc-é 😀 32_foo 9_ _8 call_xyz-92",Value::Null),
     record("x",false,"null",json!({"output":""}))
    ])})]);
}

#[test]
fn regexes_preserve_javascript_case_folding_and_line_terminators() {
    compare(vec![
        json!({"windowSize":1,"steps":calls(vec![
            record("file.read",true,"",json!({"content":"1\tfirst\r2\tsecond\u{2028}3\tthird\u{2029}4\tlast"})),
            record("file.read",true,"",json!({"content":"first\rsecond\u{2028}third\u{2029}last"}))
        ])}),
        json!({"steps":calls(vec![
            record("execute",true,"stdout\u{2028}bash: foo: command not found",Value::Null),
            record("execute",false,"permiſſion denied",Value::Null),
            record("mcp__foo\u{2028}__todo",true,"observation",Value::Null),
            record("execute",false,"unable to read\rfile git",Value::Null)
        ])}),
    ]);
}

#[test]
fn checkpoint_roundtrip_preserves_partial_window_progress_and_recovery() {
    let rows = compare(vec![
        json!({"windowSize":3,"steps":calls(vec![record("execute",false,"permission denied",Value::Null),record("file.read",true,"",json!({"content":"new evidence"}))])}),
    ]);
    let checkpoint = rows[0].as_array().unwrap().last().unwrap()["checkpoint"].clone();
    compare(vec![
        json!({"checkpoint":checkpoint,"windowSize":3,"steps":calls(vec![record("terminal.run",true,"ok",Value::Null),record("file.read",true,"",json!({"content":"new evidence"}))])}),
        json!({"checkpoint":{"calls":0,"windowCalls":0,"evidence":[],"failures":{},"stopReason":""},"steps":[{"op":"before"},record("file.read",true,"new",Value::Null)]}),
    ]);
}
