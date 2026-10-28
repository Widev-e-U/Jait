//! Actual-TypeScript differentials for the canonical native output projection.
//! Assertions include failure-preservation and conservative fallback behavior;
//! this target does not exercise the historical reconstructed filter model.
#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::{contracts::bounded_json::Utf16Text, tools::command_output_filters as f};
use serde_json::{Value, json};
use std::{fs, path::PathBuf};
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..")
}
fn encoded_text(t: &Utf16Text) -> Value {
    json!({"utf16":t.0})
}
fn encoded(value: Value) -> Value {
    match value {
        Value::String(s) => encoded_text(&Utf16Text::from(s)),
        Value::Array(a) => Value::Array(a.into_iter().map(encoded).collect()),
        Value::Object(o) => Value::Object(o.into_iter().map(|(k, v)| (k, encoded(v))).collect()),
        v => v,
    }
}
fn native(call: &Value) -> Value {
    let input = call["input"].as_str().unwrap_or_default();
    let text = |v: Option<Utf16Text>| v.map(|v| encoded_text(&v)).unwrap_or(Value::Null);
    match call["op"].as_str().unwrap(){
 "normalize"=>encoded(json!(f::normalize_command_for_filtering(input))),
 "primary-command"=>encoded(serde_json::to_value(f::resolve_primary_command(input)).unwrap()),
 "enabled"=>json!(f::command_output_filtering_enabled(call["env"]["JAIT_COMMAND_OUTPUT_FILTERS"].as_str())),
 "git-status"=>text(f::compress_git_status(input)),"git-log"=>text(f::compress_git_log(input)),"git-diff"=>text(f::compress_git_diff(input)),"grep"=>text(f::compress_grep_output(input)),"tests"=>text(f::compress_test_output(input)),"path-list"=>text(f::compress_path_list(input)),
 "compress"=> f::compress_command_output(call["command"].as_str().unwrap(),input,call["options"]["enabled"]!=false).map(|v|json!({"output":encoded_text(&v.output),"filterId":encoded(json!(v.filter_id)),"note":encoded(json!(v.note)),"originalChars":v.original_chars,"compressedChars":v.compressed_chars})).unwrap_or(Value::Null),
 _=>panic!("unknown native operation")
 }
}
fn compare(label: &str, calls: Vec<Value>) {
    let root = root();
    let dir = root
        .join(".jait/artifacts/gateway-rust/command-output-filters/contracts")
        .join(label);
    fs::create_dir_all(&dir).unwrap();
    for (batch, calls) in calls.chunks(32).enumerate() {
        let expected: Vec<Value> = calls.iter().map(native).collect();
        println!(
            "differential {label} batch {batch}: {} scenarios",
            calls.len()
        );
        let reference: Vec<_> = calls
            .iter()
            .map(|v| {
                let mut v = v.clone();
                v["op"] = json!(format!("nativeoutputfilters.{}", v["op"].as_str().unwrap()));
                v
            })
            .collect();
        let actual = internal_driver::call(
            &root,
            &dir.join(format!("batch-{batch}")),
            json!({"version":1,"calls":reference}),
            &|| false,
        )
        .unwrap();
        let actual = actual.as_array().expect("driver result array");
        assert_eq!(actual.len(), expected.len());
        for (index, (a, e)) in actual.iter().zip(&expected).enumerate() {
            if a != e {
                let path = dir.join(format!("mismatch-{batch}-{index}.json"));
                fs::write(
                    &path,
                    serde_json::to_vec_pretty(&json!({"input":calls[index],"actual":a,"native":e}))
                        .unwrap(),
                )
                .unwrap();
                panic!("{label} mismatch at {batch}:{index}; {}", path.display());
            }
        }
    }
}
fn call(op: &str, input: impl Into<String>) -> Value {
    json!({"op":op,"input":input.into()})
}
fn lines(n: usize, mut make: impl FnMut(usize) -> String) -> String {
    (0..n).map(&mut make).collect::<Vec<_>>().join("\n")
}
#[test]
fn command_normalization_and_admission() {
    let commands = [
        "",
        "  git status  ",
        "export PAGER=cat MANPAGER=cat; git status | head",
        "$env:PAGER = 'cat'; $env:LESS='-R'; git log",
        "A=x B=y cd 'my repo' && (sudo git -C /repo status | cat",
        "sudo git -c core.pager=cat --git-dir=/repo/.git --work-tree /repo diff",
        "\u{feff}git status\u{feff}",
        "\u{85}git status",
        "rg 'one|two' | head",
        "git status || echo fallback",
        "'C:\\Program Files\\Git\\git.exe' status",
        "echo \"x|y\" | git status",
        "git \"unfinished|value",
        "A=foo\\ bar git status",
        "cd ./x && cd y && git status",
        "\"\" test",
        "export X=1\ngit status",
        "export X=1; sudo git status",
    ];
    let mut calls = Vec::new();
    for command in commands {
        for op in ["normalize", "primary-command"] {
            calls.push(call(op, command));
        }
    }
    for value in [
        None,
        Some("0"),
        Some(" FALSE "),
        Some("Off"),
        Some("no"),
        Some("falsey"),
        Some("\u{feff}NO\u{feff}"),
        Some("\u{85}no"),
    ] {
        calls.push(json!({"op":"enabled","env":value.map(|v|json!({"JAIT_COMMAND_OUTPUT_FILTERS":v})).unwrap_or(json!({}))}));
    }
    compare("commands", calls);
}
#[test]
fn status_categories_and_caps() {
    let mut calls = Vec::new();
    for status in ["On branch main\nnothing to commit, working tree clean".to_owned(),"On branch main\nYour branch is ahead of 'origin/main' by 2 commits.\nChanges to be committed:\n modified: staged.txt\n deleted: gone.txt\nChanges not staged for commit:\n modified: pending.txt\nUntracked files:\n (use git add)\n new.txt".to_owned(),"On branch main\nYour branch is behind 'origin/main' by 1 commit.\nUnmerged paths:\n both modified: conflict.txt".to_owned(),"## ...topic...origin/topic\nMM both.txt\n D deleted.txt\n?? untracked.txt\n!! ignored.txt\nM  \"quoted path\"".to_owned(),lines(23,|i|format!("?? path{i}.txt")),"human prose without recognized metadata".to_owned(),
        "\u{1b}[32mOn branch colored\u{1b}[0m\nUntracked files:\n visible.txt".to_owned(),"On branch main\nUntracKed files:\n no-summary.txt".to_owned(),"## \n".to_owned(),"On branch ſafety\r\nChanges not staged for commit:\r\n modified: win.txt\r".to_owned(),"On branch BOM\u{2028}".to_owned(),"On branch multi\nUntracked files:\n\u{85}file\n\u{feff}trimmed\u{feff}".to_owned()]{calls.push(call("git-status",status));}
    compare("status", calls);
    let output=f::compress_git_status("On branch x\nChanges to be committed:\n modified: a\nChanges not staged for commit:\n modified: b").unwrap();
    assert_eq!(
        String::from_utf16(&output.0).unwrap(),
        "branch: x\nstaged(1): a\nmodified(1): b"
    );
}
#[test]
fn logs_and_diff_preserve_effective_content() {
    let logs = lines(52, |i| {
        format!(
            "commit {:040x}\nAuthor: Person {i} <person@example.invalid>\nDate: ignored\n\n    title {i}\n\n    body ignored\n",
            i + 1
        )
    });
    let mut calls = vec![
        call("git-log", logs),
        call("git-log", "abcdef1 short format"),
        call(
            "git-log",
            "commit abcdef1234\nAuthor: no address\nDate: x\n",
        ),
        call(
            "git-log",
            "commit abcdef1234\r\nAuthor: Windows User <w@example.invalid>\r\n    subject\r",
        ),
        call(
            "git-log",
            "commit abcdefg\n    accepted hex boundary\ncommit 1234567890xxx\n    later prefix",
        ),
        call("git-log", "commit ABCDEFA\n    uppercase rejected"),
    ];
    for diff in [
        "diff --git a/a b/a\nindex abc..def 100644\n--- a/a\n+++ b/a\n@@ -1 +1 @@\n-old\n+new\n\\ No newline at end of file\n",
        "file.txt | 1 +",
        "@@ hunk\n+ERROR must stay\n-context",
        "diff --git a/a b/a\nindex abc..def 100644\nbinary files differ",
        "@@ x\nindex uppercase..DEAD\n+added",
    ] {
        calls.push(call("git-diff", diff));
    }
    compare("log-diff", calls);
}
#[test]
fn grep_grouping_thresholds_and_surrogate_slices() {
    let mut calls = Vec::new();
    for count in [24, 25, 26, 200] {
        calls.push(call(
            "grep",
            lines(count, |i| {
                format!("{}/file.txt:{}:{}", i % 23, i + 1, "a match".repeat(20))
            }),
        ));
    }
    calls.push(call("grep", lines(30, |i| format!("same.rs:{i}:matched"))));
    calls.push(call(
        "grep",
        lines(30, |i| {
            if i == 7 {
                "malformed line".into()
            } else {
                format!("file{}:{i}:match", i % 2)
            }
        }),
    ));
    calls.push(call(
        "grep",
        lines(30, |i| {
            format!(
                "C:\\src\\file{}:{i}:{}",
                i % 2,
                "x".repeat(118) + "🦀" + "tail"
            )
        }),
    ));
    calls.push(call(
        "grep",
        lines(30, |i| format!("p{}:{i}:carriage\r", i % 2)),
    ));
    calls.push(call(
        "grep",
        lines(30, |i| {
            format!("p{}:１２:unicode digits are not line numbers {i}", i % 2)
        }),
    ));
    compare("grep", calls);
    let sample = lines(30, |i| {
        format!("p{}:{i}:{}", i % 2, "x".repeat(118) + "🦀tail")
    });
    let out = f::compress_grep_output(&sample).unwrap();
    assert!(
        out.0.windows(2).any(|v| v == [0xd83e, 0x2026]),
        "119-unit slice retains lone high surrogate before ellipsis"
    );
}
#[test]
fn tests_failure_signals_summary_priority_and_context() {
    let mut calls = Vec::new();
    for marker in [
        "FAIL suite",
        "FAILED suite",
        "✗ broken",
        "✕ broken",
        "✘ broken",
        "× broken",
        "✖ broken",
        "● broken",
        "--- FAIL: test",
        "not ok 3 failure",
        "E  assertion failure",
        "AssertionError: expected value",
        "error: a failure",
        "Expected value",
    ] {
        calls.push(call(
            "tests",
            format!(
                "{}\n{marker}\n{}\n{}\nTests: 1 failed, 90 passed",
                lines(45, |i| format!("✓ passing {i}")),
                lines(12, |i| format!("detail {i}")),
                lines(15, |i| format!("✓ after {i}"))
            ),
        ));
    }
    for summary in [
        "Test Files 1 failed",
        "test result: FAILED. 2 passed; 1 failed",
        "PASS file.rs",
        "ok module.test",
        "12 passing",
        "2 failing",
        "finished in 1.5s",
        "=== 2 passed ===",
        "Time 3.4s",
        "Suites 2",
    ] {
        calls.push(call(
            "tests",
            format!("{}\n{summary}", lines(45, |i| format!("noise {i}"))),
        ));
    }
    for count in [38, 39, 40, 41] {
        calls.push(call(
            "tests",
            format!(
                "{}\nTests: 1 passed",
                lines(count, |i| format!("noise {i}"))
            ),
        ));
    }
    calls.push(call(
        "tests",
        lines(50, |i| format!("unrecognized noise {i}")),
    ));
    for summary in ["teſt result: failure", "Teſts 4", "1 ſkipped", "1 sKipped"] {
        calls.push(call(
            "tests",
            format!("{}\n{summary}", lines(50, |i| format!("noise {i}"))),
        ));
    }
    calls.push(call(
        "tests",
        format!(
            "{}\n✗ failure\nline1\n\nnot context\nTests: 1 failed",
            lines(50, |i| format!("pass {i}"))
        ),
    ));
    calls.push(call(
        "tests",
        format!(
            "{}\nFAIL suite\n{}",
            lines(10, |i| format!("noise {i}")),
            lines(40, |i| format!("PASS suite{i}"))
        ),
    ));
    compare("tests", calls);
    let raw = format!(
        "{}\n✗ failure\nassertion details\nTests: 1 failed",
        lines(50, |i| format!("pass {i}"))
    );
    let result = String::from_utf16(&f::compress_test_output(&raw).unwrap().0).unwrap();
    assert!(result.contains("✗ failure\nassertion details\nTests: 1 failed"));
    assert!(!result.contains("pass 0"));
}
#[test]
fn path_histograms_long_rows_and_stable_ties() {
    let mut calls = Vec::new();
    for count in [39, 40, 41, 60] {
        calls.push(call(
            "path-list",
            lines(count, |i| {
                format!("root/file{i}.{}", ["ts", "rs", "css", "txt"][i % 4])
            }),
        ));
    }
    for prefix in [
        "-rw-r--r-- 1 user group 8 Oct 26 2026 ",
        "drwxr-xr-x+ 2 user group 8 2026-10-26 10:20 ",
        "-rw-r--r--@ 1 user group 8 Oct 26 10:20 ",
    ] {
        calls.push(call(
            "path-list",
            format!(
                "total 80\n{}",
                lines(45, |i| format!("{prefix}name with space {i}.txt"))
            ),
        ));
    }
    calls.push(call(
        "path-list",
        lines(45, |i| {
            if i == 3 {
                "-rw-r--r-- malformed long row".into()
            } else {
                format!("file{i}.txt")
            }
        }),
    ));
    calls.push(call(
        "path-list",
        lines(45, |i| format!("dir.ignored/{i}.extensiontoolong")),
    ));
    calls.push(call(
        "path-list",
        lines(60, |i| format!("C:\\dir\\name{i}.e{}", i % 12)),
    ));
    calls.push(call(
        "path-list",
        lines(45, |i| {
            format!(
                ".hidden{i}\u{feff}plain{i}\u{85}part .{}",
                ["🦀🦀🦀", "🦀🦀🦀🦀"][i % 2]
            )
        }),
    ));
    compare("paths", calls);
}
#[test]
fn dispatch_disabled_unknown_prefixes_and_never_grow() {
    let statuses = format!(
        "On branch topic\nUntracked files:\n{}",
        lines(60, |i| format!(" long-file-{i}.txt"))
    );
    let tests = format!(
        "{}\n✗ failed case\nassertion: important\nTests: 1 failed",
        lines(60, |i| format!("passing case {i}"))
    );
    let paths = lines(60, |i| format!("dir/file{i}.txt"));
    let grep = lines(40, |i| format!("dir/file{}:{i}:matching text", i % 3));
    let diff = format!(
        "@@ x\n{}",
        lines(30, |i| format!(
            "index {:08x}..{:08x} 100644\n+line {i}",
            i,
            i + 1
        ))
    );
    let log = lines(8, |i| {
        format!(
            "commit {:040x}\nAuthor: Tester <t@x.invalid>\n\n    title {i}\n",
            i + 1
        )
    });
    let mut calls = Vec::new();
    for command in [
        "git status",
        "sudo git -c x=y -C repo status",
        "export PAGER=cat; git status | head",
        "'C:\\Git\\git.exe' --git-dir=x status",
        "unknown",
        "echo git status",
    ] {
        calls.push(json!({"op":"compress","command":command,"input":statuses}));
    }
    for (command, input) in [
        ("git log", log),
        ("git diff", diff),
        ("git grep match", grep.clone()),
        ("/usr/bin/rg x", grep),
        ("find .", paths),
        ("cargo test", tests.clone()),
        ("python3 -m pytest", tests.clone()),
        ("bun run test:unit", tests.clone()),
        ("npm testing", tests.clone()),
        ("dotnet test", tests.clone()),
        ("vitest", tests.clone()),
        ("go test", tests.clone()),
    ] {
        calls.push(json!({"op":"compress","command":command,"input":input}));
    }
    calls.push(
        json!({"op":"compress","command":"bun test","input":tests,"options":{"enabled":false}}),
    );
    for (command, input) in [
        ("git status", "On branch x"),
        ("git status", "\nOn branch x\n"),
        ("ls", ""),
        ("echo", "x"),
    ] {
        calls.push(json!({"op":"compress","command":command,"input":input}));
    }
    calls.push(json!({"op":"compress","command":"git status","input":format!("On branch {}","x".repeat(210))}));
    calls.push(
        json!({"op":"compress","command":"git status","input":format!("## {}", "x".repeat(210))}),
    );
    calls.push(json!({"op":"compress","command":"git status","input":format!("On branch {}", "🦀".repeat(110))}));
    for value in &calls {
        if let Some(result) = f::compress_command_output(
            value["command"].as_str().unwrap(),
            value["input"].as_str().unwrap(),
            value["options"]["enabled"] != false,
        ) {
            assert!(
                result.compressed_chars
                    < value["input"]
                        .as_str()
                        .unwrap()
                        .trim()
                        .encode_utf16()
                        .count()
            );
        }
    }
    compare("dispatch", calls);
}
