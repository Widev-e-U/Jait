#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::{
    execution::shell_prompt::{is_powershell_shell, is_shell_prompt_line},
    nodes::git_routing::{GitFsNode, resolve_remote_git_node_id},
    services::llm_headers::LlmRequestConfig,
    surfaces::terminal_output::terminal_output_slice,
};
use serde_json::{Value, json};
use std::{collections::HashMap, fs, path::PathBuf};
fn observe(calls: Vec<Value>) -> Vec<Value> {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap();
    let path = root
        .join(".jait/artifacts/gateway-rust/native-terminal")
        .join(uuid::Uuid::new_v4().to_string());
    fs::create_dir_all(&path).unwrap();
    internal_driver::call(&root, &path, json!({"version":1,"calls":calls}), &|| false)
        .unwrap()
        .as_array()
        .unwrap()
        .clone()
}
fn number(value: &Value, default: f64) -> f64 {
    match value.as_str() {
        Some("NaN") => f64::NAN,
        Some("Infinity") => f64::INFINITY,
        Some("-Infinity") => f64::NEG_INFINITY,
        _ => value.as_f64().unwrap_or(default),
    }
}
fn slices(cases: Vec<Value>) {
    for batch in cases.chunks(64) {
        let expected = observe(batch.to_vec());
        for (case, expected) in batch.iter().zip(expected) {
            let buffer: Vec<String> = serde_json::from_value(case["buffer"].clone()).unwrap();
            let actual = terminal_output_slice(
                &buffer,
                case["count"].as_u64().unwrap() as usize,
                number(&case["offset"], 0.0),
                (!case["end"].is_null()).then(|| number(&case["end"], 0.0)),
                number(&case["lines"], 100.0),
                case["trim"] == true,
            );
            assert_eq!(json!(actual), expected, "case {case}");
        }
    }
}
#[test]
fn terminal_slices_cover_retention_offsets_bounds_and_partial_line_prefix() {
    let mut cases = vec![];
    let buffer = json!([
        "first\npartial",
        " continued",
        "\rnext line",
        "\nresult 🦀\n",
        "last"
    ]);
    for count in [5, 20] {
        for offset in [
            json!(0),
            json!(1),
            json!(2),
            json!(3),
            json!(4),
            json!(5),
            json!(16),
            json!(17),
            json!(100),
            json!(-1),
            json!(2.9),
            json!("NaN"),
            json!("Infinity"),
        ] {
            for end in [
                Value::Null,
                json!(2),
                json!(4),
                json!(19),
                json!(50),
                json!(-2),
                json!("Infinity"),
            ] {
                cases.push(json!({"op":"nativeterminal.slice","buffer":buffer,"count":count,"offset":offset,"end":end,"lines":2}));
            }
        }
    }
    slices(cases);
}
#[test]
fn terminal_bounded_commands_ignore_live_tail_limit_and_trim_last_done_marker() {
    let buffer = (0..125).map(|i| format!("chunk-{i}\n")).collect::<Vec<_>>();
    let cases = vec![
        json!({"op":"nativeterminal.slice","buffer":buffer,"count":125,"offset":2,"end":124,"lines":3}),
        json!({"op":"nativeterminal.slice","buffer":buffer,"count":125,"offset":2,"lines":3}),
        json!({"op":"nativeterminal.slice","buffer":["one","\u{1b}]633;D;0\u{7}PS C:\\>"],"count":2,"offset":0,"end":2,"trim":true}),
        json!({"op":"nativeterminal.slice","buffer":["one\u{1b}]633;D;0\n","second","\u{1b}]633;D;1\u{7}next prompt"],"count":3,"offset":0,"end":3,"trim":true}),
        json!({"op":"nativeterminal.slice","buffer":[],"count":0,"offset":30,"end":40,"trim":true}),
    ];
    slices(cases);
}
#[test]
fn terminal_live_tail_js_fractional_and_nonfinite_line_limits() {
    let mut cases = vec![];
    for lines in [
        json!(0),
        json!(-1),
        json!(-2.5),
        json!(0.5),
        json!(1.5),
        json!(2),
        json!("NaN"),
        json!("Infinity"),
        json!("-Infinity"),
    ] {
        for offset in [0, 1, 2, 3] {
            cases.push(json!({"op":"nativeterminal.slice","buffer":["start"," of line","\nbody","tail"],"count":4,"offset":offset,"lines":lines}));
        }
    }
    slices(cases);
}
#[test]
fn prompt_recognition_matches_shell_names_and_ecmascript_whitespace_and_line_rules() {
    let mut calls = vec![];
    for shell in [
        "bash",
        "/bin/zsh",
        "pwsh",
        "C:\\Program Files\\PowerShell\\pwsh.exe",
        "PowerShell.EXE",
        "/usr/bin/pwsh-preview",
        "fish",
        "ſpwsh",
    ] {
        for line in [
            "",
            "   ",
            "PS C:\\work>",
            "PS C:\\work> echo hi",
            "PS >",
            "ps C:\\work>",
            "jakob@host:~/dir$",
            "root@host:/#",
            "~/dir%",
            "/tmp$",
            "../work#",
            "C:\\work>",
            "C:\\work$",
            "host %",
            "host\u{feff}$",
            "host\u{85}$",
            "A-B_2.#",
            "bad prompt",
            "PS C:\nwork>",
            "user@host:/a\u{2028}$",
        ] {
            calls.push(json!({"op":"nativeterminal.prompt","shell":shell,"line":line}));
        }
    }
    for chunk in calls.chunks(64) {
        let expected = observe(chunk.to_vec());
        for (call, expected) in chunk.iter().zip(expected) {
            let shell = call["shell"].as_str().unwrap();
            let line = call["line"].as_str().unwrap();
            assert_eq!(
                json!({"powershell":is_powershell_shell(shell),"prompt":is_shell_prompt_line(line,shell)}),
                expected,
                "{call}"
            );
        }
    }
}
#[test]
fn git_routing_respects_explicit_gateway_remote_offline_windows_and_local_precedence() {
    let nodes = json!([{"id":"gateway","isGateway":true,"platform":"linux"},{"id":"linux-node","platform":"linux"},{"id":"windows-node","platform":"windows"},{"id":"other-node"}]);
    let mut calls = vec![];
    for cwd in [
        "/tmp/repo",
        "C:\\work",
        "D:/work",
        "C:relative",
        "\\\\server\\share",
        "1:/weird",
        "é:/weird",
    ] {
        for requested in [
            Value::Null,
            json!(""),
            json!("gateway"),
            json!(" linux-node "),
            json!("windows-node"),
            json!("offline-node"),
            json!("\u{feff}gateway\u{a0}"),
        ] {
            for local in [true, false] {
                calls.push(json!({"op":"nativeterminal.routing","nodes":nodes,"cwd":cwd,"requested":requested,"local":local}));
            }
        }
    }
    calls.extend([json!({"op":"nativeterminal.routing","nodes":[],"cwd":"/a"}),json!({"op":"nativeterminal.routing","nodes":[{"id":"gateway","isGateway":true}],"cwd":"C:\\a"})]);
    for chunk in calls.chunks(64) {
        let expected = observe(chunk.to_vec());
        for (call, expected) in chunk.iter().zip(expected) {
            let nodes: Vec<GitFsNode> = serde_json::from_value(call["nodes"].clone()).unwrap();
            assert_eq!(
                json!(resolve_remote_git_node_id(
                    &nodes,
                    call["cwd"].as_str().unwrap(),
                    call["requested"].as_str(),
                    call["local"] == true
                )),
                expected,
                "{call}"
            );
        }
    }
}
#[test]
fn llm_headers_keep_configuration_identity_and_explicit_conversation_precedence() {
    let config = |url: &str, backend: Value, session: Value| json!({"openaiApiKey":"fixture-secret","openaiBaseUrl":url,"backend":backend,"sessionId":session});
    let configs = json!([
        config("https://api.example/v1", Value::Null, Value::Null),
        config("https://opencode.ai/zen/go/v1", Value::Null, Value::Null),
        config("https://opencode.ai/zen/go/v1", Value::Null, Value::Null),
        config("invalid", json!("opencode-go"), json!("configured")),
        config("https://OPENCODE.AI:443/zen/go/v1", Value::Null, json!("")),
        config("https://opencode.ai/zen/go", Value::Null, Value::Null),
        config(
            "https://opencode.ai.attacker.example/zen/go/v1",
            Value::Null,
            Value::Null
        ),
        config("https://opencode.ai/zen/go/%20", Value::Null, Value::Null),
        config("https://opencode.ai/other", json!("openai"), Value::Null),
    ]);
    let steps = json!([{"config":0},{"config":1},{"config":1},{"config":2},{"config":1,"session":"override"},{"config":1,"session":""},{"config":3},{"config":3,"session":"explicit"},{"config":4},{"config":4},{"config":5},{"config":6},{"config":7},{"config":8}]);
    let expected = observe(vec![
        json!({"op":"nativeterminal.headers","configs":configs,"steps":steps}),
    ])
    .remove(0);
    let configs: Vec<LlmRequestConfig> = serde_json::from_value(configs).unwrap();
    let mut ids = HashMap::new();
    let mut serial = 0;
    let actual = steps
        .as_array()
        .unwrap()
        .iter()
        .map(|step| {
            let mut headers = configs[step["config"].as_u64().unwrap() as usize]
                .headers(step["session"].as_str());
            if let Some(value) = headers.get_mut("x-opencode-session")
                && let Ok(id) = uuid::Uuid::parse_str(value)
            {
                assert_eq!(id.get_version_num(), 4);
                assert_eq!(id.get_variant(), uuid::Variant::RFC4122);
                let canonical = ids.entry(value.clone()).or_insert_with(|| {
                    serial += 1;
                    format!("generated-{serial}")
                });
                *value = canonical.clone();
            }
            json!(headers)
        })
        .collect::<Vec<_>>();
    assert_eq!(json!(actual), expected);
}
