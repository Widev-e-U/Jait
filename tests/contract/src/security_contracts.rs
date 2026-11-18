//! HTTP contracts run unchanged against either gateway implementation.
//! No case starts a successful assessment, contacts a target, or invokes a scanner.
//! Mapping: routes/security-assessments.test.ts and routes/security-workbench.test.ts;
//! scope validation and pre-dispatch authorization from security/{assessment,workbench}.ts.
use crate::{
    client::{equal, string},
    scenarios::{Scenario, Suite},
};
use anyhow::{Context, Result, ensure};
use serde_json::{Value, json};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

fn expires_after(milliseconds: u64) -> String {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("contract clock must follow Unix epoch")
        .as_millis() as u64
        + milliseconds;
    // Gregorian civil date conversion; no external command or backend clock hook.
    let days = (timestamp / 86_400_000) as i64 + 719_468;
    let era = days / 146_097;
    let day_of_era = days - era * 146_097;
    let year_of_era =
        (day_of_era - day_of_era / 1460 + day_of_era / 36524 - day_of_era / 146096) / 365;
    let mut year = year_of_era + era * 400;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_prime = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * month_prime + 2) / 5 + 1;
    let month = month_prime + if month_prime < 10 { 3 } else { -9 };
    year += i64::from(month <= 2);
    let seconds = timestamp / 1000 % 86_400;
    format!(
        "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}.{:03}Z",
        seconds / 3600,
        seconds / 60 % 60,
        seconds % 60,
        timestamp % 1000
    )
}

fn input() -> Value {
    json!({
        "targets":["127.0.0.1"],
        "exclusions":[],
        "ports":[1],
        "authorized":true,
        "expiresAt":expires_after(600_000)
    })
}

fn scope(s: &Suite, body: Value) -> Result<Value> {
    s.gateway.api.json(
        "POST",
        "/api/security/scopes",
        Some(&s.owner),
        Some(body),
        200,
    )
}

fn history(s: &Suite, token: &str) -> Result<Value> {
    s.gateway
        .api
        .json("GET", "/api/security/assessments", Some(token), None, 200)
}

/// Node identity is enforced globally before handlers run: a request claiming
/// a node the caller does not own is refused without touching state, whether
/// the claim arrives in the body or in the query. See the node preHandler in
/// server.ts.
fn foreign_node_guard(s: &mut Suite) -> Result<()> {
    let before = history(s, &s.owner)?;
    let mut body = input();
    body["nodeId"] = json!("forged-execution-node");
    let response = s.gateway.api.json(
        "POST",
        "/api/security/scopes",
        Some(&s.owner),
        Some(body),
        404,
    )?;
    equal(
        &response["error"],
        json!("Node not found"),
        "body node rejection",
    )?;
    let response = s.gateway.api.json(
        "GET",
        "/api/security/assessments?nodeId=forged-execution-node",
        Some(&s.owner),
        None,
        404,
    )?;
    equal(
        &response["error"],
        json!("Node not found"),
        "query node rejection",
    )?;
    equal(
        &history(s, &s.owner)?,
        before,
        "foreign node rejection changed history",
    )
}

fn rejected(s: &Suite, path: &str, token: &str, body: Value, reason: &str) -> Result<()> {
    let response = s
        .gateway
        .api
        .json("POST", path, Some(token), Some(body), 400)?;
    ensure!(
        string(&response, "error")?.contains(reason),
        "security rejection did not identify expected reason: {reason}"
    );
    Ok(())
}

fn invalid_scope(s: &Suite, field: &str, value: Value, reason: &str) -> Result<()> {
    let before = history(s, &s.owner)?;
    let mut body = input();
    body[field] = value;
    rejected(s, "/api/security/scopes", &s.owner, body, reason)?;
    equal(
        &history(s, &s.owner)?,
        before,
        "rejected scope changed history",
    )
}

fn anonymous(s: &mut Suite) -> Result<()> {
    for path in [
        "/api/security/assessments",
        "/api/security/assessments/unknown",
        "/api/security/workbench",
        "/api/security/engines",
        "/api/security/checks/unknown",
        "/api/security/checks/unknown/report",
        "/api/security/findings/unknown/plan",
    ] {
        s.gateway.api.expect("GET", path, None, None, 401)?;
    }
    for (method, path, body) in [
        ("POST", "/api/security/scopes", input()),
        (
            "POST",
            "/api/security/assessments",
            json!({"scopeId":"unknown"}),
        ),
        (
            "POST",
            "/api/security/assessments/unknown/cancel",
            json!({}),
        ),
        ("POST", "/api/security/comparisons", json!({})),
        ("POST", "/api/security/checks", json!({})),
        ("POST", "/api/security/checks/unknown/cancel", json!({})),
        ("DELETE", "/api/security/checks/unknown", json!({})),
        ("POST", "/api/security/findings/unknown/verify", json!({})),
        (
            "POST",
            "/api/security/findings/unknown/decision",
            json!({"disposition":"open"}),
        ),
    ] {
        s.gateway.api.expect(method, path, None, Some(body), 401)?;
    }
    Ok(())
}

fn invalid_tokens(s: &mut Suite) -> Result<()> {
    for token in ["not-a-token", "eyJhbGciOiJub25lIn0.eyJzdWIiOiJvd25lciJ9."] {
        s.gateway
            .api
            .expect("GET", "/api/security/assessments", Some(token), None, 401)?;
        s.gateway.api.expect(
            "POST",
            "/api/security/scopes",
            Some(token),
            Some(input()),
            401,
        )?;
        s.gateway.api.expect(
            "POST",
            "/api/security/checks",
            Some(token),
            Some(json!({})),
            401,
        )?;
    }
    Ok(())
}

fn authorization_required(s: &mut Suite) -> Result<()> {
    for authorized in [json!(false), json!("true"), json!(1), Value::Null] {
        invalid_scope(s, "authorized", authorized, "Explicit target authorization")?;
    }
    let mut body = input();
    body.as_object_mut()
        .context("scope input")?
        .remove("authorized");
    rejected(
        s,
        "/api/security/scopes",
        &s.owner,
        body,
        "Explicit target authorization",
    )
}

fn target_validation(s: &mut Suite) -> Result<()> {
    for targets in [
        json!([]),
        Value::Null,
        json!("127.0.0.1"),
        json!((1..=17).map(|n| format!("127.0.0.{n}")).collect::<Vec<_>>()),
    ] {
        invalid_scope(s, "targets", targets, "Targets must contain")?;
    }
    for target in [
        "router.local",
        "https://127.0.0.1",
        "127.0.0.0/24",
        "::1",
        "127.0.0.1 ",
        "127.000.0.1",
        "127.0.0.1; echo injected",
    ] {
        invalid_scope(s, "targets", json!([target]), "Only literal IPv4")?;
    }
    invalid_scope(s, "targets", json!([123]), "Only literal IPv4")?;
    for target in ["0.0.0.0", "224.0.0.1", "255.255.255.255"] {
        invalid_scope(s, "targets", json!([target]), "Unicast targets")?;
    }
    Ok(())
}

fn exclusion_validation(s: &mut Suite) -> Result<()> {
    invalid_scope(s, "exclusions", Value::Null, "Exclusions must contain")?;
    invalid_scope(
        s,
        "exclusions",
        json!(["router.local"]),
        "Only literal IPv4",
    )?;
    invalid_scope(
        s,
        "exclusions",
        json!(["127.0.0.1"]),
        "All targets are excluded",
    )?;
    invalid_scope(
        s,
        "exclusions",
        json!(vec!["127.0.0.2"; 17]),
        "Exclusions must contain",
    )
}

fn port_validation(s: &mut Suite) -> Result<()> {
    for ports in [
        Value::Null,
        json!("443"),
        json!([]),
        json!([0]),
        json!([65536]),
        json!([1.5]),
        json!(["443"]),
        json!([true]),
        json!(vec![1; 17]),
    ] {
        invalid_scope(s, "ports", ports, "Choose 1–16 TCP ports")?;
    }
    Ok(())
}

fn expiry_validation(s: &mut Suite) -> Result<()> {
    for expiry in [
        "",
        "not-a-date",
        "2000-01-01T00:00:00Z",
        "2099-01-01T00:00:00Z",
    ] {
        invalid_scope(
            s,
            "expiresAt",
            json!(expiry),
            "Scope expiry must be in the next hour",
        )?;
    }
    invalid_scope(
        s,
        "expiresAt",
        json!(expires_after(3_700_000)),
        "Scope expiry must be in the next hour",
    )
}

fn method_validation(s: &mut Suite) -> Result<()> {
    for methods in [
        json!([]),
        Value::Null,
        json!("tcp"),
        json!(["arbitrary-shell"]),
        json!(["tcp; id"]),
        json!(vec!["tcp"; 13]),
        json!([42]),
    ] {
        // null is treated like omitted by the current API and defaults to TCP.
        if methods.is_null() {
            continue;
        }
        invalid_scope(
            s,
            "methods",
            methods,
            "Select explicitly authorized assessment methods",
        )?;
    }
    Ok(())
}

fn identity_metadata(s: &mut Suite) -> Result<()> {
    let mut body = input();
    body["targets"] = json!(["127.0.0.1", "127.0.0.1", "127.0.0.2"]);
    body["exclusions"] = json!(["127.0.0.2", "127.0.0.2"]);
    body["ports"] = json!([1, 65535, 1]);
    body["methods"] = json!(["http", "http", "tcp"]);
    body["operatorId"] = json!("forged-operator");
    // No forged nodeId here: the global node guard rejects foreign node
    // identities before handlers run (see foreign_node_guard). Omitting it is
    // the only way a caller reaches this route without owning the node.
    body["vantagePoint"] = json!("forged-vantage");
    body["projectRoot"] = json!("/forged-root");
    let response = scope(s, body)?;
    uuid::Uuid::parse_str(&string(&response, "id")?)?;
    equal(
        &response["operatorId"],
        json!(s.owner_id),
        "scope authenticated operator",
    )?;
    equal(
        &response["nodeId"],
        json!("gateway"),
        "scope execution node",
    )?;
    equal(
        &response["profile"],
        json!("tcp-connect-v1"),
        "scope profile revision",
    )?;
    ensure!(
        string(&response, "vantagePoint")? != "forged-vantage",
        "caller forged vantage point"
    );
    string(&response, "createdAt")?;
    ensure!(
        response.get("projectRoot").is_none(),
        "unbound project root accepted"
    );
    equal(
        &response["targets"],
        json!(["127.0.0.1", "127.0.0.2"]),
        "deduplicated targets",
    )?;
    equal(
        &response["exclusions"],
        json!(["127.0.0.2"]),
        "deduplicated exclusions",
    )?;
    equal(&response["ports"], json!([1, 65535]), "deduplicated ports")?;
    equal(
        &response["methods"],
        json!(["http", "tcp"]),
        "deduplicated methods",
    )?;
    let stored = history(s, &s.owner)?;
    let scopes = stored["scopes"].as_array().context("scopes list")?;
    let listed = scopes
        .iter()
        .find(|row| row["id"] == response["id"])
        .context("created scope omitted from history")?;
    equal(listed, response, "persisted canonical scope")
}

fn optional_names(s: &mut Suite) -> Result<()> {
    for value in [
        json!(["https://example.com"]),
        json!(["example.com\n"]),
        json!([1]),
    ] {
        let reason = if value_has_number(&value) || value.to_string().contains("\\n") {
            "Invalid scoped"
        } else {
            "TLS server names"
        };
        invalid_scope(s, "serverNames", value, reason)?;
    }
    for username in ["root;id", "-root", "root user"] {
        invalid_scope(
            s,
            "sshUsernames",
            json!([username]),
            "Invalid authorized SSH username",
        )?;
    }
    invalid_scope(
        s,
        "serverNames",
        json!(vec!["example.com"; 5]),
        "Invalid scoped",
    )?;
    invalid_scope(s, "sshUsernames", json!(vec!["root"; 5]), "Invalid scoped")?;
    invalid_scope(s, "serverNames", json!(["x".repeat(241)]), "Invalid scoped")?;
    let mut body = input();
    body["serverNames"] = json!(["router.example"]);
    body["sshUsernames"] = json!(["audit_user"]);
    let created = scope(s, body)?;
    equal(
        &created["serverNames"],
        json!(["router.example"]),
        "authorized TLS names",
    )?;
    equal(
        &created["sshUsernames"],
        json!(["audit_user"]),
        "authorized SSH users",
    )
}

fn value_has_number(value: &Value) -> bool {
    value
        .as_array()
        .is_some_and(|values| values.iter().any(Value::is_number))
}

fn default_methods(s: &mut Suite) -> Result<()> {
    let created = scope(s, input())?;
    equal(&created["methods"], json!(["tcp"]), "default scope method")?;
    for field in ["paths", "serverNames", "sshUsernames"] {
        equal(&created[field], json!([]), "default optional scoped values")?;
    }
    Ok(())
}

fn user_isolation(s: &mut Suite) -> Result<()> {
    let created = scope(s, input())?;
    let id = string(&created, "id")?;
    let before = history(s, &s.member)?;
    let member_scopes = before["scopes"].as_array().context("member scope list")?;
    ensure!(
        !member_scopes.iter().any(|row| row["id"] == id),
        "foreign scope leaked in history"
    );
    rejected(
        s,
        "/api/security/assessments",
        &s.member,
        json!({"scopeId":id}),
        "Scope not found",
    )?;
    rejected(
        s,
        "/api/security/checks",
        &s.member,
        json!({"scopeId":id,"profile":"http","target":"127.0.0.1","port":1}),
        "Scope not found",
    )?;
    equal(
        &history(s, &s.member)?,
        before,
        "cross-user assessment created history",
    )
}

fn filesystem_binding(s: &mut Suite) -> Result<()> {
    let mut body = input();
    body["methods"] = json!(["trivy"]);
    body["paths"] = json!(["package.json"]);
    body["projectRoot"] = json!("/forged-root");
    rejected(
        s,
        "/api/security/scopes",
        &s.owner,
        body.clone(),
        "Select an owned project session",
    )?;
    body["sessionId"] = json!(uuid::Uuid::new_v4().to_string());
    rejected(
        s,
        "/api/security/scopes",
        &s.owner,
        body.clone(),
        "Owned project session not found",
    )?;
    let id = s.create("Security scope ownership fixture")?;
    body["sessionId"] = json!(id);
    let denial = rejected(
        s,
        "/api/security/scopes",
        &s.member,
        body,
        "Owned project session not found",
    );
    let cleanup = s.delete(&id);
    denial?;
    cleanup
}

fn check_denials(s: &Suite, body: Value, cases: Vec<(&str, Value, &str)>) -> Result<()> {
    let created = scope(s, body)?;
    let before = s
        .gateway
        .api
        .json("GET", "/api/security/workbench", Some(&s.owner), None, 200)?;
    for (field, value, reason) in cases {
        let mut request =
            json!({"scopeId":created["id"],"profile":"http","target":"127.0.0.1","port":1});
        request[field] = value;
        rejected(s, "/api/security/checks", &s.owner, request, reason)?;
    }
    equal(
        &s.gateway
            .api
            .json("GET", "/api/security/workbench", Some(&s.owner), None, 200)?,
        before,
        "denied checks produced runs or findings",
    )
}

fn target_port_denials(s: &mut Suite) -> Result<()> {
    let mut body = input();
    body["targets"] = json!(["127.0.0.1", "127.0.0.2"]);
    body["exclusions"] = json!(["127.0.0.2"]);
    body["methods"] = json!(["http"]);
    check_denials(
        s,
        body,
        vec![
            ("target", json!("127.0.0.2"), "Target is outside"),
            ("target", json!("192.0.2.1"), "Target is outside"),
            ("target", json!("localhost"), "Target is outside"),
            ("target", json!("http://127.0.0.1"), "Target is outside"),
            ("port", json!(2), "Port is outside"),
            ("port", json!("1"), "Port is outside"),
            ("port", json!(1.5), "Port is outside"),
        ],
    )
}

fn parameter_denials(s: &mut Suite) -> Result<()> {
    let mut body = input();
    body["methods"] = json!(["http"]);
    check_denials(
        s,
        body,
        vec![
            ("serverName", json!("forged.example"), "TLS name is outside"),
            ("username", json!("root"), "SSH username is outside"),
            ("path", json!("../outside"), "Filesystem target is outside"),
            ("scheme", json!("file"), "Unsupported web transport"),
            ("scheme", json!("http; id"), "Unsupported web transport"),
            (
                "includePackages",
                json!("true"),
                "Package scan option must be boolean",
            ),
            (
                "profile",
                json!("arbitrary-shell"),
                "Unsupported security profile",
            ),
            ("profile", json!("tls"), "This method is not authorized"),
        ],
    )
}

fn required_check_fields(s: &mut Suite) -> Result<()> {
    let mut body = input();
    body["methods"] = json!([
        "http",
        "tls",
        "https",
        "ssh",
        "nuclei",
        "host-audit",
        "trivy",
        "telemetry"
    ]);
    let created = scope(s, body)?;
    for profile in ["http", "tls", "https", "ssh", "nuclei", "host-audit"] {
        rejected(
            s,
            "/api/security/checks",
            &s.owner,
            json!({"scopeId":created["id"],"profile":profile,"port":1}),
            "An explicit target is required",
        )?;
    }
    for profile in ["http", "tls", "https", "ssh", "nuclei"] {
        rejected(
            s,
            "/api/security/checks",
            &s.owner,
            json!({"scopeId":created["id"],"profile":profile,"target":"127.0.0.1"}),
            "An explicit port is required",
        )?;
    }
    for profile in ["trivy", "telemetry"] {
        rejected(
            s,
            "/api/security/checks",
            &s.owner,
            json!({"scopeId":created["id"],"profile":profile}),
            "A project-bound filesystem target is required",
        )?;
    }
    Ok(())
}

fn expired_execution_denied(s: &mut Suite) -> Result<()> {
    let mut body = input();
    body["expiresAt"] = json!(expires_after(1500));
    body["methods"] = json!(["tcp", "http"]);
    let created = scope(s, body)?;
    std::thread::sleep(Duration::from_millis(1650));
    rejected(
        s,
        "/api/security/assessments",
        &s.owner,
        json!({"scopeId":created["id"]}),
        "Scope expiry",
    )?;
    rejected(
        s,
        "/api/security/checks",
        &s.owner,
        json!({"scopeId":created["id"],"profile":"http","target":"127.0.0.1","port":1}),
        "Scope expiry",
    )
}

fn missing_resources(s: &mut Suite) -> Result<()> {
    for path in [
        "/api/security/assessments/unknown",
        "/api/security/checks/unknown",
        "/api/security/checks/unknown/report",
        "/api/security/findings/unknown/plan",
    ] {
        let value = s.gateway.api.json("GET", path, Some(&s.owner), None, 404)?;
        string(&value, "error")?;
    }
    for (path, status, body) in [
        ("/api/security/assessments/unknown/cancel", 404, json!({})),
        ("/api/security/checks/unknown/cancel", 404, json!({})),
        (
            "/api/security/comparisons",
            404,
            json!({"beforeRunId":"unknown","afterRunId":"unknown"}),
        ),
        ("/api/security/findings/unknown/verify", 400, json!({})),
        (
            "/api/security/findings/unknown/decision",
            400,
            json!({"disposition":"accepted-risk"}),
        ),
        (
            "/api/security/findings/unknown/decision",
            400,
            json!({"disposition":"verified-absent"}),
        ),
    ] {
        let value = s
            .gateway
            .api
            .json("POST", path, Some(&s.owner), Some(body), status)?;
        string(&value, "error")?;
    }
    let value = s.gateway.api.json(
        "DELETE",
        "/api/security/checks/unknown",
        Some(&s.owner),
        None,
        400,
    )?;
    string(&value, "error")?;
    rejected(
        s,
        "/api/security/assessments",
        &s.owner,
        json!({}),
        "scopeId required",
    )?;
    rejected(
        s,
        "/api/security/assessments",
        &s.owner,
        json!({"scopeId":123}),
        "scopeId required",
    )?;
    rejected(
        s,
        "/api/security/assessments",
        &s.owner,
        json!({"scopeId":"unknown"}),
        "Scope not found",
    )?;
    rejected(
        s,
        "/api/security/checks",
        &s.owner,
        json!({"scopeId":"unknown","profile":"http","target":"127.0.0.1","port":1}),
        "Scope not found",
    )
}

fn empty_execution_history(s: &mut Suite) -> Result<()> {
    for token in [&s.owner, &s.member] {
        let assessments = history(s, token)?;
        equal(
            &assessments["runs"],
            json!([]),
            "scope-only suite created TCP runs",
        )?;
        let workbench =
            s.gateway
                .api
                .json("GET", "/api/security/workbench", Some(token), None, 200)?;
        equal(&workbench["runs"], json!([]), "denied checks created runs")?;
        equal(
            &workbench["findings"],
            json!([]),
            "denied checks created findings",
        )?;
    }
    Ok(())
}

pub const CASES: &[Scenario] = &[
    ("security.anonymous-routes-denied", anonymous),
    ("security.invalid-tokens-denied", invalid_tokens),
    (
        "security.explicit-authorization-required",
        authorization_required,
    ),
    ("security.scope-target-validation", target_validation),
    ("security.scope-exclusion-validation", exclusion_validation),
    ("security.scope-port-validation", port_validation),
    ("security.scope-expiry-validation", expiry_validation),
    ("security.scope-method-validation", method_validation),
    (
        "security.scope-operator-vantage-and-canonical-storage",
        identity_metadata,
    ),
    ("security.foreign-node-guard", foreign_node_guard),
    ("security.scope-tls-and-ssh-names", optional_names),
    ("security.scope-default-methods", default_methods),
    ("security.scope-cross-user-isolation", user_isolation),
    (
        "security.scope-filesystem-session-binding",
        filesystem_binding,
    ),
    (
        "security.check-target-and-port-denials",
        target_port_denials,
    ),
    (
        "security.check-method-and-parameter-denials",
        parameter_denials,
    ),
    ("security.check-required-fields", required_check_fields),
    (
        "security.expired-scope-blocks-execution",
        expired_execution_denied,
    ),
    ("security.missing-resources-and-inputs", missing_resources),
    (
        "security.denied-executions-leave-no-runs",
        empty_execution_history,
    ),
];
