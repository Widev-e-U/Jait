#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::execution::{
    command_syntax::command_syntax_error, command_wait::resolve_command_yield_ms,
};
use serde_json::{Value, json};
use std::{
    path::{Path, PathBuf},
    time::{Duration, Instant},
};

fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}
fn work() -> PathBuf {
    let path = root()
        .join(".jait/artifacts/gateway-rust/terminal-helpers")
        .join(uuid::Uuid::new_v4().to_string());
    std::fs::create_dir_all(&path).unwrap();
    path
}
fn reference(work: &Path, op: &str, cases: &[Value]) -> Value {
    internal_driver::call(
        &root(),
        work,
        json!({"version":1,"calls":[{"op":op,"cases":cases}]}),
        &|| false,
    )
    .unwrap()[0]
        .clone()
}
fn number(value: &Value) -> f64 {
    match value.as_str() {
        Some("NaN") => f64::NAN,
        Some("Infinity") => f64::INFINITY,
        Some("-Infinity") => f64::NEG_INFINITY,
        _ => value.as_f64().unwrap(),
    }
}

#[test]
fn yield_policy_matches_reference_for_types_rounding_and_deadline_boundaries() {
    let work = work();
    let mut cases = vec![];
    for value in [
        json!(null),
        json!(-1),
        json!(-0.01),
        json!(0),
        json!(0.01),
        json!(1.1),
        json!(9999.01),
        json!(29999.1),
        json!(30000),
        json!(30000.1),
        json!(1e30),
        json!("42"),
        json!(false),
        json!([]),
        json!({}),
        json!("NaN"),
        json!("Infinity"),
        json!("-Infinity"),
    ] {
        for timeout in [
            json!(-1),
            json!(0),
            json!(0.25),
            json!(1),
            json!(30),
            json!(9999.5),
            json!(30000),
            json!(86400000),
            json!("NaN"),
            json!("Infinity"),
            json!("-Infinity"),
        ] {
            cases.push(json!({"value":value,"timeout":timeout}));
        }
    }
    cases.push(json!({"timeout":3600000}));
    // Bound driver input/output; retain every case and exact scalar comparison.
    for batch in cases.chunks(32) {
        let expected = reference(&work, "nativecommandhelpers.wait", batch);
        for (index, case) in batch.iter().enumerate() {
            let actual = resolve_command_yield_ms(case.get("value"), number(&case["timeout"]));
            if actual.is_nan() {
                assert_eq!(expected[index], json!("NaN"), "{case}");
            } else {
                assert_eq!(Some(actual), expected[index].as_f64(), "{case}");
            }
        }
    }
}

#[cfg(unix)]
fn script(directory: &Path, name: &str, content: &str, executable: bool) -> PathBuf {
    use std::os::unix::fs::PermissionsExt;
    std::fs::create_dir_all(directory).unwrap();
    let file = directory.join(name);
    std::fs::write(&file, content).unwrap();
    std::fs::set_permissions(
        &file,
        std::fs::Permissions::from_mode(if executable { 0o700 } else { 0o600 }),
    )
    .unwrap();
    file
}
#[cfg(unix)]
async fn compare(work: &Path, cases: &[Value]) {
    let expected = reference(work, "nativecommandhelpers.syntax", cases);
    for (index, case) in cases.iter().enumerate() {
        let actual = command_syntax_error(
            case["command"].as_str().unwrap(),
            case["shell"].as_str().unwrap(),
        )
        .await
        .unwrap();
        assert_eq!(
            actual.map(|v| json!(v.0)).unwrap_or(Value::Null),
            expected[index],
            "{case}"
        );
    }
}
#[cfg(unix)]
#[tokio::test]
async fn real_shell_syntax_and_parse_only_behavior_match_reference() {
    let work = work();
    let marker = work.join("must-not-execute");
    let commands = vec![
        String::new(),
        "printf '%s' complete".into(),
        "printf \"unfinished".into(),
        "if true; then".into(),
        "for x in a b; do printf '%s' \"$x\"; done".into(),
        "case x in x) :;; esac".into(),
        "cat <<'EOF'\nhello\nEOF\n".into(),
        "printf '%s' \"$(printf incomplete\"".into(),
        "echo ok\n)".into(),
        "# comment\ntrue && false || :".into(),
        "printf '\\0'".into(),
        "echo héllø 世界\n)".into(),
        format!("printf executed > '{}'", marker.display()),
        format!("echo \"$(printf executed > '{}')\"", marker.display()),
        format!("echo \"`printf executed > '{}'`\"", marker.display()),
        format!(
            "while true; do printf executed >> '{}'; done",
            marker.display()
        ),
        format!("cat <(printf executed > '{}')", marker.display()),
        "printf 'embedded\0NUL'".into(),
    ];
    for shell in ["/bin/bash", "/bin/sh"] {
        let cases = commands
            .iter()
            .map(|command| json!({"shell":shell,"command":command}))
            .collect::<Vec<_>>();
        compare(&work, &cases).await;
    }
    assert!(
        !marker.exists(),
        "parse-only must never execute submitted command"
    );
}
#[cfg(unix)]
#[tokio::test]
async fn shell_selection_flags_environment_and_spawn_failures_match_reference() {
    let work = work();
    let diagnostic = "#!/bin/sh\nprintf '%s\\n' \"$BASH_ENV\" \"$ENV\" \"$@\" >&2\nexit 2\n";
    let bash = script(&work.join("bash-fixture"), "bash", diagnostic, true);
    let sh = script(&work.join("sh-fixture"), "sh", diagnostic, true);
    let zsh = script(&work.join("zsh-fixture"), "zsh", diagnostic, true);
    let denied = script(&work.join("denied"), "bash", "#!/bin/sh\nexit 0\n", false);
    let marker = work.join("unsupported-must-not-spawn");
    let unsupported = script(
        &work,
        "pwsh",
        &format!("#!/bin/sh\ntouch '{}'\n", marker.display()),
        true,
    );
    let warning = script(
        &work.join("warning"),
        "bash",
        "#!/bin/sh\necho warning >&2\nexit 0\n",
        true,
    );
    let empty = script(&work.join("empty"), "bash", "#!/bin/sh\nexit 2\n", true);
    compare(
        &work,
        &[
            bash,
            sh,
            zsh,
            denied,
            unsupported,
            warning,
            empty,
            work.join("missing/bash"),
        ]
        .into_iter()
        .map(|shell| json!({"shell":shell,"command":"ignored"}))
        .collect::<Vec<_>>(),
    )
    .await;
    assert!(!marker.exists());
}
#[cfg(unix)]
#[tokio::test]
async fn malformed_executables_and_path_errors_match_reference() {
    use std::os::unix::fs::symlink;
    let work = work();
    let empty = script(&work.join("empty-executable"), "bash", "", true);
    let text = script(&work.join("text-executable"), "bash", "exit 2", true);
    let missing_interpreter = script(
        &work.join("missing-interpreter"),
        "bash",
        "#!/no-such-interpreter\\n",
        true,
    );
    let file = work.join("not-directory");
    std::fs::write(&file, "file").unwrap();
    let loop_dir = work.join("symlink-loop");
    std::fs::create_dir_all(&loop_dir).unwrap();
    let loop_file = loop_dir.join("bash");
    symlink("bash", &loop_file).unwrap();
    compare(
        &work,
        &[
            empty,
            text,
            missing_interpreter,
            file.join("bash"),
            loop_file,
        ]
        .into_iter()
        .map(|shell| json!({"shell":shell,"command":""}))
        .collect::<Vec<_>>(),
    )
    .await;
}
#[cfg(unix)]
#[tokio::test]
async fn output_and_time_limits_match_reference() {
    let work = work();
    let stdout = script(
        &work.join("stdout"),
        "bash",
        "#!/bin/sh\nhead -c 20000 /dev/zero\n",
        true,
    );
    let stderr = script(
        &work.join("stderr"),
        "bash",
        "#!/bin/sh\nhead -c 20000 /dev/zero >&2\n",
        true,
    );
    let exact = script(
        &work.join("exact"),
        "bash",
        "#!/bin/sh\nhead -c 8000 /dev/zero\n",
        true,
    );
    let split = script(
        &work.join("split"),
        "bash",
        "#!/bin/sh\nhead -c 4000 /dev/zero\nhead -c 4001 /dev/zero >&2\n",
        true,
    );
    let slow = script(&work.join("timeout"), "bash", "#!/bin/sh\nsleep 30\n", true);
    let started = Instant::now();
    compare(
        &work,
        &[stdout, stderr, exact, split, slow]
            .into_iter()
            .map(|shell| json!({"shell":shell,"command":"ignored"}))
            .collect::<Vec<_>>(),
    )
    .await;
    assert!(started.elapsed() < Duration::from_secs(10));
}
#[cfg(unix)]
#[tokio::test]
async fn diagnostic_trimming_and_utf16_cut_preserve_lone_surrogate() {
    let work = work();
    // Two leading spaces trim away. The UTF-16 cut falls inside the final emoji.
    let text = format!("  {}😀tail  \n", "x".repeat(1999));
    let shell = script(
        &work,
        "bash",
        &format!("#!/bin/sh\nprintf '%s' '{}' >&2\nexit 2\n", text),
        true,
    );
    let cases = [json!({"shell":shell,"command":""})];
    compare(&work, &cases).await;
    let actual = command_syntax_error("", shell.to_str().unwrap())
        .await
        .unwrap()
        .unwrap();
    assert_eq!(actual.0.len(), "Invalid shell syntax: ".len() + 2000);
    assert_eq!(actual.0.last(), Some(&0xd83d));
}
#[cfg(unix)]
fn running(pid: i32) -> bool {
    let stat = std::fs::read_to_string(format!("/proc/{pid}/stat"));
    stat.is_ok_and(|v| !v.rsplit_once(')').unwrap().1.trim_start().starts_with('Z'))
}
#[cfg(target_os = "linux")]
#[tokio::test]
async fn timeout_and_dropped_future_stop_owned_parser_descendants() {
    let work = work();
    for cancel in [false, true] {
        let pid = work.join(if cancel { "cancel.pid" } else { "timeout.pid" });
        let shell = script(
            &work.join(if cancel { "cancel" } else { "timeout" }),
            "bash",
            &format!(
                "#!/bin/sh\nsleep 30 &\necho $! > '{}'\nwait\n",
                pid.display()
            ),
            true,
        );
        let task =
            tokio::spawn(async move { command_syntax_error("", shell.to_str().unwrap()).await });
        let deadline = Instant::now() + Duration::from_secs(5);
        while !pid.exists() {
            assert!(Instant::now() < deadline, "parser failed to start");
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
        let child: i32 = std::fs::read_to_string(&pid)
            .unwrap()
            .trim()
            .parse()
            .unwrap();
        if cancel {
            task.abort();
            assert!(task.await.unwrap_err().is_cancelled());
        } else {
            let result = task.await.unwrap().unwrap().unwrap();
            assert!(String::from_utf16_lossy(&result.0).ends_with("ETIMEDOUT"));
        }
        let deadline = Instant::now() + Duration::from_secs(3);
        while running(child) {
            assert!(Instant::now() < deadline, "owned descendant still running");
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    }
}
