#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::security::tool_permissions::*;
use serde_json::{Value, json};
use std::{
    collections::{HashMap, HashSet},
    path::PathBuf,
};
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}
fn permission(v: &Value) -> Option<ToolPermission> {
    v.get("permission")
        .filter(|v| !v.is_null())
        .map(|p| serde_json::from_value(p.clone()).unwrap())
}
fn native(call: &Value) -> Value {
    let p = permission(call);
    match call["op"].as_str().unwrap() {
        "nativepermission.resolve" => {
            let entries: Vec<(String, ToolPermission)> =
                serde_json::from_value(call["entries"].clone()).unwrap_or_default();
            json!(resolve_tool_permission(
                call["name"].as_str().unwrap(),
                &entries.into_iter().collect::<HashMap<_, _>>()
            ))
        }
        "nativepermission.requires" => {
            let trust = match call["trustKind"].as_str() {
                Some("nan") => f64::NAN,
                Some("infinity") => f64::INFINITY,
                _ => call["trust"].as_f64().unwrap_or(0.0),
            };
            let approvals: HashSet<String> =
                serde_json::from_value(call["approvals"].clone()).unwrap_or_default();
            json!(requires_consent(p.as_ref(), trust, &approvals))
        }
        "nativepermission.command" => json!(is_command_allowed(
            call["value"].as_str().unwrap(),
            p.as_ref()
        )),
        "nativepermission.path" => json!(is_path_allowed_by_permission(
            call["value"].as_str().unwrap(),
            p.as_ref()
        )),
        "nativepermission.glob" => json!(match_glob(
            call["value"].as_str().unwrap(),
            call["pattern"].as_str().unwrap()
        )),
        "nativepermission.classify" => json!(classify_irreversible_command(
            call["value"].as_str().unwrap()
        )),
        _ => panic!("operation"),
    }
}
fn compare(calls: Vec<Value>) {
    for batch in calls.chunks(48) {
        let output = internal_driver::call(
            &root(),
            &root()
                .join(".jait/artifacts/gateway-rust/tool-permissions")
                .join(uuid::Uuid::new_v4().to_string()),
            json!({"version":1,"calls":batch}),
            &|| false,
        )
        .unwrap();
        for (call, expected) in batch.iter().zip(output.as_array().unwrap()) {
            assert_eq!(&native(call), expected, "call {call}");
        }
    }
}
fn policy(level: &str) -> Value {
    json!({"toolName":"terminal.run","consentLevel":level,"risk":"high","description":"test policy"})
}
#[test]
fn unknown_and_profile_policies_preserve_source_and_fields() {
    let p = policy("once");
    compare(vec![
        json!({"op":"nativepermission.resolve","name":"missing"}),
        json!({"op":"nativepermission.resolve","name":"constructor"}),
        json!({"op":"nativepermission.resolve","name":"terminal.run","entries":[["terminal.run",p]]}),
        json!({"op":"nativepermission.resolve","name":"alias","entries":[["alias",policy("none")]]}),
    ]);
}
#[test]
fn trust_and_approval_matrix_matches_reference() {
    let mut calls =
        vec![json!({"op":"nativepermission.requires","trust":99,"approvals":["terminal.run"]})];
    for level in ["none", "once", "always", "dangerous"] {
        for trust in [-1.0, 0.0, 1.0, 1.99, 2.0, 2.99, 3.0, 4.0] {
            for approved in [false, true] {
                calls.push(json!({"op":"nativepermission.requires","permission":policy(level),"trust":trust,"approvals":if approved{vec!["terminal.run"]}else{vec!["other"]}}));
            }
        }
        for kind in ["nan", "infinity"] {
            calls.push(json!({"op":"nativepermission.requires","permission":policy(level),"trustKind":kind}));
        }
    }
    compare(calls);
}
#[test]
fn glob_wildcards_escaping_utf16_and_case_match_reference() {
    let mut calls = Vec::new();
    for pattern in [
        "*",
        "**",
        "?",
        "??",
        "a?b",
        "*.ts",
        "src/**",
        "src/*",
        "src/**/a?.ts",
        "A[1].(x)+$^{}|\\q",
        "<<GLOBSTAR>>",
        "***",
        "**?",
        "",
    ] {
        for value in [
            "",
            "a",
            "ab",
            "a/b",
            "src/a.ts",
            "src/deep/a1.ts",
            "a\nb",
            "x\r",
            "A[1].(x)+$^{}|\\q",
            "😀",
            "x\u{2028}",
            "src/😀",
            "line\nlast",
            "file.ts\n",
        ] {
            calls.push(json!({"op":"nativepermission.glob","pattern":pattern,"value":value}));
        }
    }
    for (value, pattern) in [
        ("K", "k"),
        ("ſ", "s"),
        ("Σ", "ς"),
        ("İ", "i"),
        ("😀", "😀"),
        ("foo\n", "foo"),
        ("foo\r\n", "foo"),
        ("A/B", "a/b"),
    ] {
        calls.push(json!({"op":"nativepermission.glob","pattern":pattern,"value":value}));
    }
    compare(calls);
}
#[test]
fn allow_deny_precedence_and_reason_text_match_reference() {
    let mut calls = Vec::new();
    for (op, allowed, denied) in [
        ("command", "allowedCommands", "deniedCommands"),
        ("path", "allowedPaths", "deniedPaths"),
    ] {
        for (allow, deny) in [
            (vec![], vec![]),
            (vec!["src/**"], vec![]),
            (vec!["**"], vec!["**/secret*", "rm *"]),
            (vec!["x"], vec!["x"]),
        ] {
            let mut p = policy("always");
            p[allowed] = json!(allow);
            p[denied] = json!(deny);
            for value in [
                "",
                "src/file.ts",
                "src/secret.env",
                "x",
                "rm file",
                "C:\\Users\\name",
            ] {
                calls.push(
                    json!({"op":format!("nativepermission.{op}"),"value":value,"permission":p}),
                );
            }
        }
        calls.push(
            json!({"op":format!("nativepermission.{op}"),"value":"rm -rf /","permission":null}),
        );
    }
    compare(calls);
}
#[test]
fn irreversible_command_order_boundaries_and_lookarounds_match_reference() {
    let commands = [
        "git stash",
        "git stash list",
        "git stash listing",
        "git stash pop",
        "git stash -u",
        "git checkout -- a",
        "git checkout --",
        "git restore file",
        "git restore --staged a",
        "git restore x\n--staged",
        "git reset --hard",
        "git clean -xdf",
        "git clean -dfx",
        "git rm a",
        "git push --force",
        "git push x -f",
        "git push --force-with-lease",
        "rm -rf /",
        "rm -i a",
        "pkill -f server",
        "killall x",
        "mkfs /dev/x",
        "dd if=x of=y",
        "git status",
        "GIT STASH",
        "echo git stash; rm -rf x",
        "a_git stash",
        "git restore x; git stash list",
    ];
    let mut calls = Vec::new();
    for command in commands {
        calls.push(json!({"op":"nativepermission.classify","value":command}));
        for space in [
            "\t", "\n", "\r", "\u{a0}", "\u{feff}", "\u{2028}", "\u{0085}",
        ] {
            calls
                .push(json!({"op":"nativepermission.classify","value":command.replace(' ',space)}));
        }
    }
    compare(calls);
}
#[test]
fn malformed_policy_levels_are_rejected_before_dispatch() {
    let mut p = policy("dangerous");
    p["consentLevel"] = json!("off");
    assert!(serde_json::from_value::<ToolPermission>(p).is_err());
}

#[test]
fn renamed_browser_tools_preserve_legacy_policy_and_canonical_override_for_both_entrypoints() {
    let legacy = json!({"toolName":"preview.open","consentLevel":"always","risk":"high","description":"Legacy restrictions","deniedPaths":["**/private/**"]});
    let canonical = json!({"toolName":"browser.open","consentLevel":"dangerous","risk":"high","description":"Explicit override"});
    compare(vec![
        json!({"op":"nativepermission.resolve","name":"browser.open","entries":[["preview.open",legacy]]}),
        json!({"op":"nativepermission.resolve","name":"preview.open","entries":[["preview.open",legacy],["browser.open",canonical]]}),
        json!({"op":"nativepermission.resolve","name":"browser.open","entries":[["preview.open",legacy],["browser.open",canonical]]}),
    ]);
}
