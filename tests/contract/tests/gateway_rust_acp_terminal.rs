#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::{
    contracts::bounded_json::Utf16Text, execution::completion_output::extract_completion_output,
    providers::acp_terminal::*,
};
use serde_json::{Value, json};
use std::{fs, num::NonZeroU16, path::PathBuf, time::Duration};
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}
fn directory() -> PathBuf {
    let p = root()
        .join(".jait/artifacts/gateway-rust/acp-terminal")
        .join(uuid::Uuid::new_v4().to_string());
    fs::create_dir_all(&p).unwrap();
    p
}
fn reference(calls: Vec<Value>) -> Value {
    internal_driver::call(
        &root(),
        &directory(),
        json!({"version":1,"calls":calls}),
        &|| false,
    )
    .unwrap()
}
fn number(v: &Value) -> Option<f64> {
    match v.as_str() {
        Some("NaN") => Some(f64::NAN),
        Some("Infinity") => Some(f64::INFINITY),
        Some("-Infinity") => Some(f64::NEG_INFINITY),
        _ => v.as_f64(),
    }
}
fn clean(v: Utf16Text, failed: bool) -> Vec<u16> {
    if !failed {
        return v.0;
    }
    let text = String::from_utf16_lossy(&v.0);
    let text = if let Some(i) = text.find("[terminal error: ") {
        format!("{}[terminal error: <spawn-error>]", &text[..i])
    } else {
        text
    };
    text.encode_utf16().collect()
}
async fn compare(mut call: Value) {
    call["op"] = json!("nativeacpterminal.run");
    let expected = reference(vec![call.clone()])[0].clone();
    let pool = AcpTerminalPool::new(NonZeroU16::new(1).unwrap());
    let mut options = AcpTerminalOptions::new(call["command"].as_str().unwrap_or("node"));
    options.args = call["args"]
        .as_array()
        .map(|a| a.iter().map(|s| s.as_str().unwrap().to_string()).collect())
        .unwrap_or_else(|| vec!["-e".into(), call["script"].as_str().unwrap().into()]);
    options.cwd = call["cwd"].as_str().map(PathBuf::from);
    options.output_byte_limit = number(&call["limit"]);
    options.env = call["env"]
        .as_array()
        .map(|a| {
            a.iter()
                .map(|v| {
                    (
                        v["name"].as_str().unwrap().into(),
                        v["value"].as_str().unwrap().into(),
                    )
                })
                .collect()
        })
        .unwrap_or_default();
    let before = (jait_gateway::time::default_clock())();
    let t = pool.spawn(options).unwrap();
    let started_valid =
        t.started_at() >= before && t.started_at() <= (jait_gateway::time::default_clock())();
    if let Some(stop) = call["stop"].as_str() {
        tokio::time::timeout(Duration::from_secs(5), async {
            while !String::from_utf16_lossy(&t.current_output().output.0).contains("READY") {
                tokio::time::sleep(Duration::from_millis(2)).await;
            }
        })
        .await
        .expect("fixture READY missing");
        if stop == "kill" {
            t.kill();
            t.kill();
        } else {
            t.release();
            t.release();
        }
    }
    let exit = tokio::time::timeout(Duration::from_secs(6), t.wait_for_exit())
        .await
        .unwrap()
        .unwrap();
    let completion = t.wait_for_completion().await.unwrap();
    let repeated = t.wait_for_exit().await.unwrap();
    t.kill();
    t.release();
    t.release();
    let output = t.current_output();
    let failed = call["spawnFailure"] == true;
    let actual = json!({"command":t.command(),"startedValid":started_valid,"running":t.is_running(),"exit":exit,"repeated":repeated,"output":{"output":clean(output.output,failed),"exitStatus":output.exit_status,"truncated":output.truncated},"completion":{"exitCode":completion.exit_code,"output":clean(completion.output,failed)}});
    assert_eq!(actual, expected, "ACP terminal case {call}");
}
#[tokio::test]
async fn processes_capture_stdout_stderr_cwd_environment_and_exit_codes() {
    let dir = directory();
    compare(json!({"script":"process.stdout.write(JSON.stringify({cwd:process.cwd(),value:process.env.JAIT_ACP_FIXTURE,argument:process.argv[1]}));","args":["-e","process.stdout.write(JSON.stringify({cwd:process.cwd(),value:process.env.JAIT_ACP_FIXTURE,argument:process.argv[1]}));","literal ; $(no-shell) &"],"cwd":dir,"env":[{"name":"JAIT_ACP_FIXTURE","value":"first"},{"name":"JAIT_ACP_FIXTURE","value":"last 😀"}]})).await;
    compare(json!({"script":"process.stderr.write('stderr 🦀\\n');process.exitCode=7;"})).await;
    compare(json!({"script":"process.exitCode=0;"})).await;
}
#[tokio::test]
async fn byte_limits_retain_utf16_suffixes_zero_is_unbounded_and_completion_has_own_cap() {
    for limit in [
        Value::Null,
        json!(0),
        json!(1),
        json!(2),
        json!(3),
        json!(4),
        json!(5.5),
        json!(-1),
        json!("NaN"),
        json!("Infinity"),
        json!("-Infinity"),
    ] {
        compare(json!({"script":"process.stdout.write('prefix😀');","limit":limit})).await;
    }
    compare(json!({"script":"process.stdout.write('x'.repeat(4100));"})).await;
}
#[tokio::test]
async fn kill_release_and_signalled_exit_are_idempotent_and_settle_repeated_waiters() {
    for stop in ["kill", "release"] {
        compare(json!({"script":"console.log('READY');setInterval(()=>{},1000);","stop":stop}))
            .await;
    }
    compare(json!({"script":"process.kill(process.pid,'SIGTERM');"})).await;
}
#[tokio::test]
async fn spawn_failure_and_bad_cwd_settle_all_completion_waiters() {
    compare(json!({"command":"jait-fixture-missing-acp-executable-7b8d4c","args":[],"spawnFailure":true})).await;
    compare(json!({"command":"node","args":["-e","process.exit(0)"],"cwd":directory().join("does-not-exist"),"spawnFailure":true})).await;
}
#[tokio::test]
async fn process_admission_rejects_overload_and_drop_reaps_an_ignored_term_child() {
    let pool = AcpTerminalPool::new(NonZeroU16::new(1).unwrap());
    let mut options = AcpTerminalOptions::new("node");
    options.args = vec![
        "-e".into(),
        "process.on('SIGTERM',()=>{});console.log('READY');setInterval(()=>{},1000);".into(),
    ];
    let terminal = pool.spawn(options).unwrap();
    tokio::time::timeout(Duration::from_secs(5), async {
        while !String::from_utf16_lossy(&terminal.current_output().output.0).contains("READY") {
            tokio::time::sleep(Duration::from_millis(2)).await;
        }
    })
    .await
    .unwrap();
    assert_eq!(
        pool.spawn(AcpTerminalOptions::new("node"))
            .err()
            .unwrap()
            .kind(),
        std::io::ErrorKind::WouldBlock
    );
    terminal.kill();
    drop(terminal);
    let next = tokio::time::timeout(Duration::from_secs(5), async {
        loop {
            let mut options = AcpTerminalOptions::new("node");
            options.args = vec!["-e".into(), "process.exit(0)".into()];
            match pool.spawn(options) {
                Ok(t) => break t,
                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    tokio::time::sleep(Duration::from_millis(2)).await
                }
                Err(e) => panic!("{e}"),
            }
        }
    })
    .await
    .unwrap();
    assert_eq!(next.wait_for_exit().await.unwrap().exit_code, Some(0));
    pool.close();
    assert_eq!(
        pool.spawn(AcpTerminalOptions::new("node"))
            .err()
            .unwrap()
            .kind(),
        std::io::ErrorKind::BrokenPipe
    );
}
#[test]
fn completion_cleanup_matches_shell_markers_echo_prompts_sentinels_and_utf16_boundaries() {
    let mut cases = vec![
        json!({"raw":"","command":""}),
        json!({"raw":" \r\n \n","command":"x"}),
        json!({"raw":"echo hi\r\nhi\r\nuser@host:~$\n","command":"echo hi"}),
        json!({"raw":"🦀 run\nresult\n","command":"🦀 run"}),
        json!({"raw":". '/repo/.jait/artifacts/jait-terminal/cmd.sh'\nresult\n","command":"unrelated"}),
        json!({"raw":"user$ cmd\n\u{1b}[31mred\u{1b}[0m\n\u{1b}]633;D;0\u{7}PS C:\\work>","command":"cmd","shell":"pwsh"}),
        json!({"raw":"prefix\n__JAIT_BACKGROUND_DONE_abc-123__:0\nbody\n","command":"cmd"}),
        json!({"raw":"\u{1b}]0;title\u{7}body\n","command":"cmd"}),
        json!({"raw":".\u{85}'jait-terminal'\nbody","command":"cmd"}),
        json!({"raw":"x".repeat(4001),"command":""}),
        json!({"raw":format!("a😀{}","z".repeat(3999)),"command":""}),
        json!({"units":[32,55296,120,56320,32],"command":""}),
    ];
    for end in ["\u{7}", "\u{1b}\\"] {
        for code in ["A", "B", "C", "D", "E", "P"] {
            cases.push(
                json!({"raw":format!("\u{1b}]633;{code};payload{end}value\n"),"command":"cmd"}),
            );
        }
    }
    for batch in cases.chunks(4) {
        let calls = batch
            .iter()
            .cloned()
            .map(|mut c| {
                c["op"] = json!("nativeacpterminal.cleanup");
                c
            })
            .collect::<Vec<_>>();
        let expected = reference(calls);
        for (i, c) in batch.iter().enumerate() {
            let raw = c["units"]
                .as_array()
                .map(|a| a.iter().map(|v| v.as_u64().unwrap() as u16).collect())
                .unwrap_or_else(|| {
                    c["raw"]
                        .as_str()
                        .unwrap()
                        .encode_utf16()
                        .collect::<Vec<_>>()
                });
            let actual = extract_completion_output(
                &raw,
                c["command"].as_str().unwrap_or(""),
                c["shell"].as_str().unwrap_or(""),
            );
            assert_eq!(json!(actual.0), expected[i], "completion case {c}");
        }
    }
}
