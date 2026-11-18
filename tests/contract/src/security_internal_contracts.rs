//! Security assertions over production TypeScript exports; no implementation copies.
use crate::internal_driver;
use anyhow::{Result, ensure};
use serde_json::{Value, json};
use std::path::Path;
type Check = fn(&Path, &Path, &dyn Fn() -> bool) -> Result<()>;
fn call(r: &Path, d: &Path, c: &dyn Fn() -> bool, calls: Value) -> Result<Value> {
    internal_driver::call(r, d, json!({"version":1,"calls":calls}), c)
}
macro_rules! exact {
    ($name:ident, $calls:expr, $expected:expr) => {
        fn $name(r: &Path, d: &Path, c: &dyn Fn() -> bool) -> Result<()> {
            let actual = call(r, d, c, $calls)?;
            ensure!(
                actual == $expected,
                "unexpected production result: {actual}"
            );
            Ok(())
        }
    };
}
exact!(
    arp_linux,
    json!([{"op":"security.network.arp","input":"? (192.168.1.1) at 00:11:22:33:44:55 [ether] on eth0\n? (192.168.1.2) at aa:bb:cc:dd:ee:ff [ether] on eth0\n? (192.168.1.3) at <incomplete> on eth0"}]),
    json!([[{"ip":"192.168.1.1","mac":"00:11:22:33:44:55","responsive":true},{"ip":"192.168.1.2","mac":"aa:bb:cc:dd:ee:ff","responsive":true}]])
);
exact!(
    arp_macos,
    json!([{"op":"security.network.arp","input":"? (192.168.1.3) at 0:11:22:33:44:55 on en0 ifscope [ethernet]"}]),
    json!([[{"ip":"192.168.1.3","mac":"00:11:22:33:44:55","responsive":true}]])
);
exact!(
    arp_hyphen,
    json!([{"op":"security.network.arp","input":"192.168.1.4 at 00-11-22-33-44-55 [ether] on eth0"}]),
    json!([[{"ip":"192.168.1.4","mac":"00:11:22:33:44:55","responsive":true}]])
);
exact!(
    arp_filtered,
    json!([{"op":"security.network.arp","input":"? (192.168.1.10) at ff:ff:ff:ff:ff:ff [ether] on eth0\n? (192.168.1.11) at 00:00:00:00:00:00 [ether] on eth0\n? (192.168.1.12) at 01:00:5e:00:00:01 [ether] on eth0\n? (192.168.1.13) at 02:11:22:33:44:55 [ether] on eth0"}]),
    json!([[{"ip":"192.168.1.13","mac":"02:11:22:33:44:55","responsive":true}]])
);
exact!(
    arp_empty,
    json!([{"op":"security.network.arp","input":""},{"op":"security.network.arp","input":"no arp entries here\njust text"}]),
    json!([[], []])
);
exact!(
    prefix_cidr,
    json!([{"op":"security.network.prefix","input":"192.168.1.0/24"}]),
    json!(["192.168.1"])
);
exact!(
    prefix_ip,
    json!([{"op":"security.network.prefix","input":"192.168.1.42"}]),
    json!(["192.168.1"])
);
exact!(
    prefix_bare,
    json!([{"op":"security.network.prefix","input":"  10.0.0  "}]),
    json!(["10.0.0"])
);
fn string_cases(
    r: &Path,
    d: &Path,
    c: &dyn Fn() -> bool,
    op: &str,
    inputs: &[&str],
    expected: Value,
) -> Result<()> {
    let calls: Vec<Value> = inputs.iter().map(|s| json!({"op":op,"input":s})).collect();
    let actual = call(r, d, c, json!(calls))?;
    ensure!(
        actual == Value::Array(inputs.iter().map(|_| expected.clone()).collect()),
        "unexpected results {actual}"
    );
    Ok(())
}
fn prefix_range(r: &Path, d: &Path, c: &dyn Fn() -> bool) -> Result<()> {
    string_cases(
        r,
        d,
        c,
        "security.network.prefix",
        &[
            "256.1.1.0/24",
            "192.168.999.0/24",
            "999.999.999.0/24",
            "256.1.1.42",
            "256.1.1",
        ],
        Value::Null,
    )
}
fn prefix_invalid(r: &Path, d: &Path, c: &dyn Fn() -> bool) -> Result<()> {
    string_cases(
        r,
        d,
        c,
        "security.network.prefix",
        &["192.168.1.0/16", "192.168.1.0/24/24", "not-an-ip", ""],
        Value::Null,
    )
}
fn ipv4_valid(r: &Path, d: &Path, c: &dyn Fn() -> bool) -> Result<()> {
    string_cases(
        r,
        d,
        c,
        "security.network.ipv4",
        &["192.168.1.1", "0.0.0.0", "255.255.255.255"],
        json!(true),
    )
}
fn ipv4_invalid(r: &Path, d: &Path, c: &dyn Fn() -> bool) -> Result<()> {
    string_cases(
        r,
        d,
        c,
        "security.network.ipv4",
        &[
            "192.168.1",
            "192.168.1.1.1",
            "256.1.1.1",
            "1.1.1.999",
            "192.168.1.abc",
            "192.168.1.1 ",
            "",
        ],
        json!(false),
    )
}
exact!(
    ips_normalize,
    json!([{"op":"security.network.ips","input":[" 192.168.1.1 ","192.168.1.1","10.0.0.1","bad","999.1.1.1"]}]),
    json!([["192.168.1.1", "10.0.0.1"]])
);
exact!(
    ips_empty,
    json!([{"op":"security.network.ips"},{"op":"security.network.ips","input":[]}]),
    json!([[], []])
);
exact!(
    merge_first,
    json!([{"op":"security.network.merge","input":[{"ip":"192.168.1.1","mac":"00:11:22:33:44:55","responsive":true},{"ip":"192.168.1.1","mac":null,"responsive":false},{"ip":"192.168.1.2","mac":null,"responsive":false}]}]),
    json!([[{"ip":"192.168.1.1","mac":"00:11:22:33:44:55","responsive":true},{"ip":"192.168.1.2","mac":null,"responsive":false}]])
);
exact!(
    merge_later,
    json!([{"op":"security.network.merge","input":[{"ip":"192.168.1.1","mac":null,"responsive":true},{"ip":"192.168.1.1","mac":"00:11:22:33:44:55","responsive":false}]}]),
    json!([[{"ip":"192.168.1.1","mac":"00:11:22:33:44:55","responsive":true}]])
);
fn candidates_one(r: &Path, d: &Path, c: &dyn Fn() -> bool) -> Result<()> {
    let result = call(
        r,
        d,
        c,
        json!([{"op":"security.network.candidates","input":["192.168.1"]}]),
    )?;
    ensure!(
        result[0].as_array().unwrap().len() == 254
            && result[0][0] == "192.168.1.1"
            && result[0][253] == "192.168.1.254",
        "wrong candidates {result}"
    );
    Ok(())
}
fn candidates_two(r: &Path, d: &Path, c: &dyn Fn() -> bool) -> Result<()> {
    let result = call(
        r,
        d,
        c,
        json!([{"op":"security.network.candidates","input":["10.0.0","10.0.1"]}]),
    )?;
    ensure!(
        result[0].as_array().unwrap().len() == 508
            && result[0][0] == "10.0.0.1"
            && result[0][253] == "10.0.0.254"
            && result[0][254] == "10.0.1.1"
            && result[0][507] == "10.0.1.254",
        "wrong candidates {result}"
    );
    Ok(())
}
fn ssrf_block(
    r: &Path,
    d: &Path,
    c: &dyn Fn() -> bool,
    urls: &[&str],
    hosts: &[&str],
) -> Result<()> {
    let calls: Vec<Value> = urls
        .iter()
        .map(|s| json!({"op":"security.ssrf","url":s}))
        .collect();
    let result = call(r, d, c, json!(calls))?;
    for (item, host) in result.as_array().unwrap().iter().zip(hosts) {
        ensure!(
            item["error"]
                .as_str()
                .is_some_and(|e| e.contains(&format!("Blocked private host: {host}"))),
            "wrong SSRF error {item}"
        );
    }
    Ok(())
}
fn ssrf_ipv4(r: &Path, d: &Path, c: &dyn Fn() -> bool) -> Result<()> {
    ssrf_block(
        r,
        d,
        c,
        &[
            "http://0.1.2.3",
            "http://127.0.0.1:8080",
            "http://192.168.1.20",
            "http://LOCALHOST",
        ],
        &["0.1.2.3", "127.0.0.1", "192.168.1.20", "localhost"],
    )
}
fn ssrf_reserved(r: &Path, d: &Path, c: &dyn Fn() -> bool) -> Result<()> {
    ssrf_block(
        r,
        d,
        c,
        &[
            "http://100.64.0.1",
            "http://192.0.2.10",
            "http://198.18.0.1",
            "http://198.51.100.10",
            "http://203.0.113.10",
            "http://224.0.0.1",
            "http://240.0.0.1",
        ],
        &[
            "100.64.0.1",
            "192.0.2.10",
            "198.18.0.1",
            "198.51.100.10",
            "203.0.113.10",
            "224.0.0.1",
            "240.0.0.1",
        ],
    )
}
fn ssrf_ipv6(r: &Path, d: &Path, c: &dyn Fn() -> bool) -> Result<()> {
    ssrf_block(
        r,
        d,
        c,
        &[
            "http://[::1]/",
            "http://[fd00::1]/",
            "http://[fe80::1]/",
            "http://[ff02::1]/",
            "http://[2001:db8::1]/",
            "http://[::ffff:127.0.0.1]/",
            "http://[::ffff:100.64.0.1]/",
            "http://[::ffff:192.168.1.20]/",
        ],
        &[
            "::1",
            "fd00::1",
            "fe80::1",
            "ff02::1",
            "2001:db8::1",
            "::ffff:7f00:1",
            "::ffff:6440:1",
            "::ffff:c0a8:114",
        ],
    )
}
fn ssrf_allow(r: &Path, d: &Path, c: &dyn Fn() -> bool) -> Result<()> {
    let result = call(
        r,
        d,
        c,
        json!([{"op":"security.ssrf","url":"http://[::1]/","options":{"allowPrivateHosts":true}},{"op":"security.ssrf","url":"http://192.168.1.20","options":{"allowPrivateHosts":true}}]),
    )?;
    for item in result.as_array().unwrap() {
        ensure!(item.get("error").is_none(), "unexpected block {item}");
    }
    Ok(())
}
fn ssrf_allowlist(r: &Path, d: &Path, c: &dyn Fn() -> bool) -> Result<()> {
    let result = call(
        r,
        d,
        c,
        json!([{"op":"security.ssrf","url":"https://example.com/path","options":{"allowedHosts":["EXAMPLE.com"]}},{"op":"security.ssrf","url":"https://api.example.com/path","options":{"allowedHosts":["EXAMPLE.com"]}}]),
    )?;
    ensure!(result[0].get("error").is_none(), "allowed host blocked");
    ensure!(
        result[1]["error"]
            .as_str()
            .is_some_and(|e| e.contains("Host not allowlisted: api.example.com")),
        "wrong allowlist error {result}"
    );
    Ok(())
}
fn scope() -> Value {
    json!({"targets":["192.0.2.10","192.0.2.11"],"exclusions":[],"ports":[22,80],"authorized":true})
}
fn assessment_call() -> Value {
    json!({"op":"security.assessment","input":scope(),"owner":"owner","other":"other","states":["open","open","open","open"]})
}
fn one(r: &Path, d: &Path, c: &dyn Fn() -> bool, input: Value) -> Result<Value> {
    Ok(call(r, d, c, json!([input]))?[0].clone())
}
fn scope_targets(r: &Path, d: &Path, c: &dyn Fn() -> bool) -> Result<()> {
    let calls: Vec<Value> = [
        "--script=attack",
        "127.0.0.1;id",
        "router.local",
        "http://127.0.0.1",
        "::1",
        "192.0.2.0/24",
        "224.0.0.1",
        "0.0.0.0",
        "127.1",
        "0177.0.0.1",
    ]
    .iter()
    .map(|target| {
        let mut s = scope();
        s["targets"] = json!([target]);
        json!({"op":"security.scope.validate","input":s})
    })
    .collect();
    for item in call(r, d, c, json!(calls))?.as_array().unwrap() {
        ensure!(
            item.get("error").is_some(),
            "unsupported target accepted {item}"
        );
    }
    Ok(())
}
fn scope_bounds(r: &Path, d: &Path, c: &dyn Fn() -> bool) -> Result<()> {
    let bad = vec![
        json!({"authorized":false}),
        json!({"targets":[]}),
        json!({"ports":[]}),
        json!({"ports":[0]}),
        json!({"ports":[65536]}),
        json!({"ports":[1.5]}),
        json!({"ports":vec![22;17]}),
        json!({"targets":vec!["127.0.0.1";17]}),
        json!({"exclusions":["not-an-ip"]}),
        json!({"exclusions":["192.0.2.10","192.0.2.11"]}),
    ];
    let mut calls = Vec::new();
    for patch in bad {
        let mut s = scope();
        for (k, v) in patch.as_object().unwrap() {
            s[k] = v.clone();
        }
        calls.push(json!({"op":"security.scope.validate","input":s}));
    }
    for expires in [-1, 3_700_000] {
        calls.push(json!({"op":"security.scope.validate","input":scope(),"expiresInMs":expires}));
    }
    for item in call(r, d, c, json!(calls))?.as_array().unwrap() {
        ensure!(item.get("error").is_some(), "invalid scope accepted {item}");
    }
    Ok(())
}
fn assessment_dispatch(r: &Path, d: &Path, c: &dyn Fn() -> bool) -> Result<()> {
    let mut input = assessment_call();
    input["input"]["targets"] = json!(["192.0.2.10", "192.0.2.11", "192.0.2.10"]);
    input["input"]["exclusions"] = json!(["192.0.2.11"]);
    input["mutateTarget"] = json!("203.0.113.5");
    let a = one(r, d, c, input)?;
    ensure!(
        a["attempts"] == json!([["192.0.2.10", 22], ["192.0.2.10", 80]]),
        "dispatch escaped scope {a}"
    );
    ensure!(
        a["result"]["plannedChecks"] == 2 && a["result"]["status"] == "completed",
        "wrong completion {a}"
    );
    for o in a["result"]["observations"].as_array().unwrap() {
        ensure!(
            o["evidenceId"].as_str().is_some_and(|v| !v.is_empty())
                && o["observedAt"].as_str().is_some_and(|v| !v.is_empty()),
            "missing evidence {o}"
        );
    }
    Ok(())
}
fn assessment_ownership(r: &Path, d: &Path, c: &dyn Fn() -> bool) -> Result<()> {
    let mut input = assessment_call();
    input["checkOwnership"] = json!(true);
    input["node"] = json!("remote-node");
    let a = one(r, d, c, input)?;
    for (key, message) in [
        ("otherStart", "Scope not found"),
        ("nodeStart", "gateway only"),
        ("duplicateStart", "already running"),
        ("otherCancel", "not found"),
    ] {
        ensure!(
            a["errors"][key]["error"]
                .as_str()
                .is_some_and(|s| s.contains(message)),
            "missing {key}: {a}"
        );
    }
    ensure!(a["otherHistory"]["runs"] == json!([]), "other sees runs");
    Ok(())
}
fn assessment_expired(r: &Path, d: &Path, c: &dyn Fn() -> bool) -> Result<()> {
    let mut input = assessment_call();
    input["expiresInMs"] = json!(40);
    input["delayBeforeStartMs"] = json!(60);
    input["startOnly"] = json!(true);
    let a = one(r, d, c, input)?;
    ensure!(
        a["error"].as_str().is_some_and(|s| s.contains("expiry")),
        "expired scope executed {a}"
    );
    Ok(())
}
fn assessment_partial(r: &Path, d: &Path, c: &dyn Fn() -> bool) -> Result<()> {
    let mut input = assessment_call();
    input["expiresInMs"] = json!(45);
    input["intervalMs"] = json!(100);
    let a = one(r, d, c, input)?;
    ensure!(
        a["result"]["status"] == "partial" && a["attempts"].as_array().unwrap().len() == 1,
        "wrong partial dispatch {a}"
    );
    ensure!(
        a["result"]["coverageGaps"]
            .as_array()
            .unwrap()
            .iter()
            .any(|s| s.as_str().is_some_and(|v| v.contains("not performed"))),
        "missing coverage gap {a}"
    );
    Ok(())
}
fn assessment_cancel(r: &Path, d: &Path, c: &dyn Fn() -> bool) -> Result<()> {
    let mut input = assessment_call();
    input["blockProbe"] = json!(true);
    input["abortState"] = json!("error");
    input["cancel"] = json!(true);
    let a = one(r, d, c, input)?;
    ensure!(
        a["result"]["status"] == "cancelled"
            && a["result"]["observations"] == json!([])
            && a["attempts"].as_array().unwrap().len() == 1,
        "wrong cancellation {a}"
    );
    Ok(())
}
fn assessment_frozen_budget(r: &Path, d: &Path, c: &dyn Fn() -> bool) -> Result<()> {
    let mut input = assessment_call();
    input["blockProbe"] = json!(true);
    input["abortState"] = json!("error");
    input["freezeClock"] = json!(true);
    input["durationMs"] = json!(10);
    let a = one(r, d, c, input)?;
    ensure!(
        a["result"]["status"] == "partial",
        "budget mistaken for cancellation {a}"
    );
    Ok(())
}
fn assessment_forward_cancel(r: &Path, d: &Path, c: &dyn Fn() -> bool) -> Result<()> {
    let mut input = assessment_call();
    input["blockProbe"] = json!(true);
    input["abortState"] = json!("error");
    input["advanceClockMs"] = json!(3_600_000);
    input["cancel"] = json!(true);
    let a = one(r, d, c, input)?;
    ensure!(
        a["result"]["status"] == "cancelled",
        "cancellation mistaken for budget {a}"
    );
    Ok(())
}
fn assessment_duration(r: &Path, d: &Path, c: &dyn Fn() -> bool) -> Result<()> {
    let mut input = assessment_call();
    input["blockProbe"] = json!(true);
    input["abortState"] = json!("error");
    input["durationMs"] = json!(30);
    let a = one(r, d, c, input)?;
    ensure!(
        a["result"]["status"] == "partial" && a["result"]["observations"] == json!([]),
        "wrong duration result {a}"
    );
    Ok(())
}
fn assessment_probe_errors(r: &Path, d: &Path, c: &dyn Fn() -> bool) -> Result<()> {
    let mut input = assessment_call();
    input["states"] = json!(["timeout","error",{"error":"untrusted scanner output"}]);
    let a = one(r, d, c, input)?;
    let states: Vec<Value> = a["result"]["observations"]
        .as_array()
        .unwrap()
        .iter()
        .map(|v| v["state"].clone())
        .collect();
    ensure!(
        states == vec![json!("timeout"), json!("error")] && a["result"]["status"] == "partial",
        "wrong failed probe result {a}"
    );
    ensure!(
        !a["result"].to_string().contains("untrusted scanner output"),
        "untrusted error leaked"
    );
    Ok(())
}
fn assessment_restart(r: &Path, d: &Path, c: &dyn Fn() -> bool) -> Result<()> {
    let mut input = assessment_call();
    input["persistence"] = json!(true);
    input["states"] = json!(["refused", "refused", "refused", "refused"]);
    let a = one(r, d, c, input)?;
    ensure!(
        a["recoveredRun"] == a["result"] && a["recoveredHistory"]["scopes"][0] == a["scope"],
        "restart lost evidence {a}"
    );
    ensure!(
        a["otherHistory"] == json!({"scopes":[],"runs":[]}),
        "restart leaked ownership {a}"
    );
    Ok(())
}
fn assessment_interrupted(r: &Path, d: &Path, c: &dyn Fn() -> bool) -> Result<()> {
    let mut input = assessment_call();
    input["persistence"] = json!(true);
    input["blockProbe"] = json!(true);
    input["abortState"] = json!("error");
    input["reopenWhileRunning"] = json!(true);
    input["cancel"] = json!(true);
    let a = one(r, d, c, input)?;
    ensure!(
        a["interrupted"]["status"] == "interrupted",
        "unfinished run not marked interrupted {a}"
    );
    Ok(())
}

fn assessment_persistence_failure(r: &Path, d: &Path, c: &dyn Fn() -> bool) -> Result<()> {
    let mut input = assessment_call();
    input["persistence"] = json!(true);
    input["failCompletionPersistence"] = json!(true);
    let actual = one(r, d, c, input)?;
    let result = &actual["result"];
    ensure!(
        result["status"] == "partial",
        "persistence failure was hidden"
    );
    ensure!(
        result["observations"]
            .as_array()
            .is_some_and(|v| v.len() == 4),
        "measurements lost"
    );
    ensure!(
        result["coverageGaps"]
            .as_array()
            .is_some_and(|g| g.iter().any(|s| s
                .as_str()
                .is_some_and(|s| s.contains("could not be persisted")))),
        "missing persistence gap"
    );
    ensure!(
        !result.to_string().contains("private storage details"),
        "private error leaked"
    );
    Ok(())
}
fn assessment_tcp_before_after(r: &Path, d: &Path, c: &dyn Fn() -> bool) -> Result<()> {
    let actual = one(r, d, c, json!({"op":"security.tcp-before-after"}))?;
    let before = &actual["before"];
    let after = &actual["after"];
    ensure!(
        before["observations"][0]["state"] == "open",
        "listening service not detected"
    );
    ensure!(
        after["observations"][0]["state"] == "refused",
        "closed service not verified"
    );
    ensure!(
        after["scope"]["vantagePoint"] == before["scope"]["vantagePoint"],
        "vantage changed"
    );
    ensure!(after["scopeId"] == before["scopeId"], "scope changed");
    ensure!(
        after["status"] == "completed",
        "after verification incomplete"
    );
    Ok(())
}

pub const CASES: &[(&str, Check)] = &[
    (
        "internal.security.assessment-persistence-failure",
        assessment_persistence_failure,
    ),
    (
        "internal.security.assessment-tcp-before-after",
        assessment_tcp_before_after,
    ),
    ("internal.security.arp-linux", arp_linux),
    ("internal.security.arp-macos", arp_macos),
    ("internal.security.arp-hyphen", arp_hyphen),
    ("internal.security.arp-filtered", arp_filtered),
    ("internal.security.arp-empty", arp_empty),
    ("internal.security.prefix-cidr", prefix_cidr),
    ("internal.security.prefix-ip", prefix_ip),
    ("internal.security.prefix-bare", prefix_bare),
    ("internal.security.prefix-range", prefix_range),
    ("internal.security.prefix-invalid", prefix_invalid),
    ("internal.security.ipv4-valid", ipv4_valid),
    ("internal.security.ipv4-invalid", ipv4_invalid),
    ("internal.security.ips-normalize", ips_normalize),
    ("internal.security.ips-empty", ips_empty),
    ("internal.security.merge-first", merge_first),
    ("internal.security.merge-later", merge_later),
    ("internal.security.candidates-one", candidates_one),
    ("internal.security.candidates-two", candidates_two),
    ("internal.security.ssrf-ipv4", ssrf_ipv4),
    ("internal.security.ssrf-reserved", ssrf_reserved),
    ("internal.security.ssrf-ipv6", ssrf_ipv6),
    ("internal.security.ssrf-allow", ssrf_allow),
    ("internal.security.ssrf-allowlist", ssrf_allowlist),
    ("internal.security.scope-targets", scope_targets),
    ("internal.security.scope-bounds", scope_bounds),
    ("internal.security.assessment-dispatch", assessment_dispatch),
    (
        "internal.security.assessment-ownership",
        assessment_ownership,
    ),
    ("internal.security.assessment-expired", assessment_expired),
    ("internal.security.assessment-partial", assessment_partial),
    ("internal.security.assessment-cancel", assessment_cancel),
    (
        "internal.security.assessment-frozen-budget",
        assessment_frozen_budget,
    ),
    (
        "internal.security.assessment-forward-cancel",
        assessment_forward_cancel,
    ),
    ("internal.security.assessment-duration", assessment_duration),
    (
        "internal.security.assessment-probe-errors",
        assessment_probe_errors,
    ),
    ("internal.security.assessment-restart", assessment_restart),
    (
        "internal.security.assessment-interrupted",
        assessment_interrupted,
    ),
];
