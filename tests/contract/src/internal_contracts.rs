//! Assertions over the actual TypeScript implementation, not algorithm copies.
use crate::internal_driver;
use anyhow::{Result, ensure};
use serde_json::{Value, json};
use std::path::Path;

type Check = fn(&Path, &Path, &dyn Fn() -> bool) -> Result<()>;
pub const CASES: &[(&str, Check)] = &[
    ("internal.auth-public-github-callbacks", public_github),
    ("internal.auth-protected-github-routes", protected_github),
    ("internal.auth-exact-public-paths", exact_paths),
    ("internal.auth-legacy-public-paths", legacy_public),
    ("internal.auth-session-roundtrip", session_roundtrip),
    ("internal.auth-wrong-secret", wrong_secret),
    ("internal.auth-purpose-token-rejected", purpose_token),
    ("internal.auth-bearer-shapes", bearer_shapes),
    ("internal.auth-cookie-name", cookie_name),
    ("internal.commands-observed-destructive", observed_commands),
    ("internal.commands-common-destructive", destructive_commands),
    ("internal.commands-ordinary-allowed", ordinary_commands),
    (
        "internal.compaction.active-turn-prefix-and-callback",
        active_turn_prefix_and_callback,
    ),
];

// The reference test asserts inside summaryGenerator as well as after compaction.
// Both phases are observed by the adapter; all predicates stay here in Rust.
fn active_turn_prefix_and_callback(r: &Path, d: &Path, c: &dyn Fn() -> bool) -> Result<()> {
    let mut history = vec![
        json!({"role":"system","content":"base instructions"}),
        json!({"role":"user","content":"Verify authorized targets; preserve evidence"}),
        json!({"role":"system","content":"[active-turn-summary]scope-expires-at-18:00[/active-turn-summary]"}),
    ];
    for index in 0..38 {
        history.push(json!({"role":"assistant","content":format!("Evidence {index}"),"tool_calls":[{"id":format!("c{index}"),"type":"function","function":{"name":"file_read","arguments":"{}"}}]}));
        history.push(json!({"role":"tool","tool_call_id":format!("c{index}"),"content":format!("result-{index} {}", "x".repeat(400))}));
    }
    let actual = internal_driver::call(
        r,
        d,
        json!({"version":1,"calls":[{"op":"compaction.active-turn","history":history,"limit":1000,"summary":"[conversation-summary]Scope and progress preserved; next verify rollback.[/conversation-summary]"}]}),
        c,
    )?;
    check_active_turn_prefix(&actual, &history)
}

fn check_active_turn_prefix(actual: &Value, original: &[Value]) -> Result<()> {
    let results = actual
        .as_array()
        .ok_or_else(|| anyhow::anyhow!("expected results"))?;
    ensure!(results.len() == 1, "expected exactly one compaction result");
    let result = &results[0];
    let snapshots = result["duringSummary"]
        .as_array()
        .ok_or_else(|| anyhow::anyhow!("missing callback observations"))?;
    ensure!(!snapshots.is_empty(), "summary callback was not observed");
    for snapshot in snapshots {
        ensure!(
            snapshot
                .as_array()
                .is_some_and(|messages| messages == original),
            "history changed before summary completed"
        );
    }
    ensure!(result["changed"] == true, "compaction did not run");
    let source = result["source"]
        .as_array()
        .ok_or_else(|| anyhow::anyhow!("missing removed prefix"))?;
    ensure!(
        source.iter().any(|message| message["content"]
            .as_str()
            .is_some_and(|text| text.contains("scope-expires-at-18:00"))),
        "old checkpoint absent from summary source"
    );
    ensure!(
        source.iter().any(|message| message["content"]
            .as_str()
            .is_some_and(|text| text.starts_with("result-0 "))),
        "oldest result absent from summary source"
    );
    ensure!(
        source
            .iter()
            .filter(|message| message["role"] == "tool")
            .count()
            == 30,
        "wrong removed tool result count"
    );
    let history = result["history"]
        .as_array()
        .ok_or_else(|| anyhow::anyhow!("missing compacted history"))?;
    ensure!(
        history.get(1) == original.get(1),
        "active user message changed"
    );
    ensure!(
        history
            .get(2)
            .and_then(|message| message["content"].as_str())
            .is_some_and(|text| text.contains("[active-turn-summary]")),
        "active checkpoint absent"
    );
    ensure!(
        history.get(3..) == original.get(original.len().saturating_sub(16)..),
        "recent tool pairs changed"
    );
    Ok(())
}

fn expect(
    root: &Path,
    directory: &Path,
    cancelled: &dyn Fn() -> bool,
    calls: Value,
    expected: Value,
) -> Result<()> {
    let actual = internal_driver::call(
        root,
        directory,
        json!({"version":1,"calls":calls}),
        cancelled,
    )?;
    ensure!(
        actual == expected,
        "driver returned {actual}; expected {expected}"
    );
    Ok(())
}
fn paths(
    root: &Path,
    directory: &Path,
    cancelled: &dyn Fn() -> bool,
    inputs: &[&str],
    expected: bool,
) -> Result<()> {
    expect(
        root,
        directory,
        cancelled,
        Value::Array(
            inputs
                .iter()
                .map(|path| json!({"op":"auth.public","path":path}))
                .collect(),
        ),
        Value::Array(inputs.iter().map(|_| json!(expected)).collect()),
    )
}
fn public_github(r: &Path, d: &Path, c: &dyn Fn() -> bool) -> Result<()> {
    paths(
        r,
        d,
        c,
        &["/api/github/apps/callback", "/api/github/apps/webhook"],
        true,
    )
}
fn protected_github(r: &Path, d: &Path, c: &dyn Fn() -> bool) -> Result<()> {
    paths(
        r,
        d,
        c,
        &[
            "/api/github-apps",
            "/api/agents/abc/github-app",
            "/api/agents/abc/github-app/setup",
            "/api/agents/abc/github-app/manual",
        ],
        false,
    )
}
fn exact_paths(r: &Path, d: &Path, c: &dyn Fn() -> bool) -> Result<()> {
    paths(
        r,
        d,
        c,
        &[
            "/api/github/apps/callback/extra",
            "/api/github/apps/webhook/extra",
            "/preview/api/github/apps/callback",
        ],
        false,
    )
}
fn legacy_public(r: &Path, d: &Path, c: &dyn Fn() -> bool) -> Result<()> {
    paths(
        r,
        d,
        c,
        &[
            "/api/auth/login",
            "/api/auth/register",
            "/api/auth/refresh",
            "/api/mobile/discovery",
            "/api/email/oauth/callback",
            "/api/calendar/oauth/callback",
        ],
        true,
    )
}
fn session_roundtrip(r: &Path, d: &Path, c: &dyn Fn() -> bool) -> Result<()> {
    expect(
        r,
        d,
        c,
        json!([{"op":"auth.roundtrip","user":{"id":"user-1","username":"jakob"},"secret":"fixture-secret"}]),
        json!([{"id":"user-1","username":"jakob"}]),
    )
}
fn wrong_secret(r: &Path, d: &Path, c: &dyn Fn() -> bool) -> Result<()> {
    expect(
        r,
        d,
        c,
        json!([{"op":"auth.roundtrip","user":{"id":"user-1","username":"jakob"},"secret":"fixture-secret","verifySecret":"other-secret"}]),
        json!([null]),
    )
}
fn purpose_token(r: &Path, d: &Path, c: &dyn Fn() -> bool) -> Result<()> {
    expect(
        r,
        d,
        c,
        json!([{"op":"auth.claims","claims":{"username":"jakob","purpose":"preview"},"subject":"user-1","secret":"fixture-secret"}]),
        json!([null]),
    )
}
fn bearer_shapes(r: &Path, d: &Path, c: &dyn Fn() -> bool) -> Result<()> {
    expect(
        r,
        d,
        c,
        json!([
            {"op":"auth.bearer","header":"Bearer abc"},{"op":"auth.bearer","header":"bearer  abc "},
            {"op":"auth.bearer","header":"Basic abc"},{"op":"auth.bearer"},{"op":"auth.bearer","header":"Bearer   "}
        ]),
        json!(["abc", "abc", null, null, null]),
    )
}
fn cookie_name(r: &Path, d: &Path, c: &dyn Fn() -> bool) -> Result<()> {
    expect(
        r,
        d,
        c,
        json!([{"op":"auth.cookie"}]),
        json!(["jait_token"]),
    )
}
fn commands(
    r: &Path,
    d: &Path,
    c: &dyn Fn() -> bool,
    inputs: &[&str],
    irreversible: bool,
    reason: bool,
) -> Result<()> {
    let calls: Vec<Value> = inputs
        .iter()
        .map(|command| json!({"op":"command.classify","command":command}))
        .collect();
    let actual = internal_driver::call(r, d, json!({"version":1,"calls":calls}), c)?;
    let values = actual.as_array().expect("transport validates array");
    ensure!(
        values.len() == inputs.len(),
        "classification result count changed"
    );
    for (command, result) in inputs.iter().zip(values) {
        ensure!(
            result["irreversible"] == irreversible,
            "wrong classification for {command}: {result}"
        );
        if reason {
            ensure!(
                result["reason"].as_str().is_some_and(|s| !s.is_empty()),
                "missing classification reason for {command}"
            );
        }
    }
    Ok(())
}
fn observed_commands(r: &Path, d: &Path, c: &dyn Fn() -> bool) -> Result<()> {
    commands(
        r,
        d,
        c,
        &[
            "cd /home/jakob/TizenAnilabStream && git stash && cd watch && npm test 2>&1 > /tmp/out.log; cd .. && git stash pop",
            "git checkout -- watch/data/watch.sqlite && git stash pop",
            "cd /home/jakob/TizenAnilabStream && git rm --cached watch/data/watch.sqlite >/dev/null && echo \"untracked\"",
            "pkill -f \"node server.js\" 2>/dev/null; sleep 1",
            "pkill -f \"PORT=8935\" 2>/dev/null; pkill -f \"server.js\" 2>/dev/null",
        ],
        true,
        true,
    )
}
fn destructive_commands(r: &Path, d: &Path, c: &dyn Fn() -> bool) -> Result<()> {
    commands(
        r,
        d,
        c,
        &[
            "git reset --hard origin/main",
            "rm -rf node_modules",
            "git clean -fd",
            "git push --force origin main",
        ],
        true,
        false,
    )
}
fn ordinary_commands(r: &Path, d: &Path, c: &dyn Fn() -> bool) -> Result<()> {
    commands(
        r,
        d,
        c,
        &[
            "npm test 2>&1 | tail -20",
            "git status --short",
            "git stash list",
            "git diff --stat && git log --oneline -5",
            "cd /home/jakob/TizenAnilabStream && git push origin main",
            "ssh jakob@base \"docker stack deploy -c watch.yml watch\"",
            "git add watch/native.html && git commit -m 'fix'",
            "node --test tests/frontend.test.js",
        ],
        false,
        false,
    )
}

#[cfg(test)]
mod active_turn_assertion_tests {
    use super::*;

    #[test]
    fn rejects_each_original_predicate_failure_including_callback_only_mutation() {
        // Use arbitrary message contents: the contract must preserve relations,
        // rather than pinning today's complete production output.
        let original: Vec<Value> = (0..79)
            .map(|index| json!({"role":"user","content":format!("message {index}")}))
            .collect();
        let mut history = original[..3].to_vec();
        history[2] = json!({"role":"system","content":"prefix [active-turn-summary] suffix"});
        history.extend_from_slice(&original[63..]);
        let mut source =
            vec![json!({"role":"system","content":"prefix scope-expires-at-18:00 suffix"})];
        source.extend(
            (0..30).map(|index| json!({"role":"tool","content":format!("result-{index} text")})),
        );
        let good =
            json!([{"changed":true,"duringSummary":[original],"history":history,"source":source}]);
        check_active_turn_prefix(&good, &original).unwrap();
        for (pointer, value) in [
            (
                "/0/duringSummary/0/4/content",
                json!("changed only during callback"),
            ),
            ("/0/changed", json!(false)),
            ("/0/source/0/content", json!("checkpoint lost")),
            ("/0/source/1/content", json!("oldest result lost")),
            ("/0/source/2/role", json!("assistant")),
            ("/0/history/1/content", json!("user request changed")),
            ("/0/history/2/content", json!("checkpoint lost")),
            ("/0/history/3/content", json!("tail changed")),
            ("/0/duringSummary", json!([])),
        ] {
            let mut bad = good.clone();
            *bad.pointer_mut(pointer).unwrap() = value;
            assert!(
                check_active_turn_prefix(&bad, &original).is_err(),
                "accepted {pointer}"
            );
        }
    }
}
