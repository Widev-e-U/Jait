//! Workbench permits cannot be fabricated by tool/route/model input. Scope
//! lookup remains operator-owned; validation precedes every engine dispatch.
use super::scope::{PROFILES, validate_scope};
use crate::services::calendar::truthy;
use serde_json::{Value, json};
use std::net::Ipv4Addr;
#[derive(Clone)]
pub struct AuthorizedCheck {
    input: Value,
    scope: Value,
    operator: String,
    expires: i64,
}
impl AuthorizedCheck {
    pub fn input(&self) -> &Value {
        &self.input
    }
    pub fn scope(&self) -> &Value {
        &self.scope
    }
    pub fn operator(&self) -> &str {
        &self.operator
    }
    pub fn expires(&self) -> i64 {
        self.expires
    }
    pub fn ensure_live(&self, now: i64) -> Result<(), String> {
        if now >= self.expires {
            Err("Scope expiry must be in the next hour".into())
        } else {
            Ok(())
        }
    }
    pub fn profile(&self) -> &str {
        self.input["profile"].as_str().expect("authorized profile")
    }
    pub fn targets(&self) -> Vec<Ipv4Addr> {
        let values = if let Some(target) = self.input.get("target") {
            vec![target]
        } else {
            self.scope["targets"]
                .as_array()
                .expect("scope targets")
                .iter()
                .collect()
        };
        values
            .into_iter()
            .filter(|target| {
                !self.scope["exclusions"]
                    .as_array()
                    .expect("scope exclusions")
                    .contains(target)
            })
            .map(|target| {
                target
                    .as_str()
                    .expect("literal scoped address")
                    .parse()
                    .expect("validated IPv4")
            })
            .collect()
    }
    pub fn ports(&self) -> Vec<u16> {
        if let Some(port) = self.input.get("port") {
            vec![port.as_f64().expect("authorized port") as u16]
        } else {
            self.scope["ports"]
                .as_array()
                .expect("scope ports")
                .iter()
                .map(|p| p.as_f64().expect("validated port") as u16)
                .collect()
        }
    }
}
pub fn normalize_check_input(input: &Value) -> Result<Value, String> {
    if !input.is_object() && !input.is_array() {
        return Err("Check input required".into());
    }
    let mut result = json!({});
    for key in [
        "scopeId",
        "profile",
        "target",
        "port",
        "serverName",
        "username",
        "path",
        "source",
        "scheme",
        "includePackages",
    ] {
        if let Some(v) = input.get(key) {
            result[key] = v.clone();
        }
    }
    Ok(result)
}
fn contains(scope: &Value, key: &str, value: &Value) -> bool {
    scope[key]
        .as_array()
        .is_some_and(|values| values.contains(value))
}
pub fn authorize_check(
    input: &Value,
    scope: Value,
    operator: &str,
    node: &str,
    now: i64,
) -> Result<AuthorizedCheck, String> {
    if node != "gateway" {
        return Err("Security checks currently execute on the gateway only".into());
    }
    // A native resolver uses AssessmentService::get_scope; retaining the owner
    // predicate here also prevents an incorrectly wired scope port from escaping.
    if scope["operatorId"] != operator {
        return Err("Scope not found".into());
    }
    let validated = validate_scope(&scope, now)?;
    if input
        .get("scheme")
        .is_some_and(|scheme| !matches!(scheme.as_str(), Some("http" | "https")))
    {
        return Err("Unsupported web transport".into());
    }
    if input
        .get("includePackages")
        .is_some_and(|value| !value.is_boolean())
    {
        return Err("Package scan option must be boolean".into());
    }
    let profile = input["profile"]
        .as_str()
        .filter(|s| PROFILES.contains(s))
        .ok_or("Unsupported security profile")?;
    let tcp = json!(["tcp"]);
    let methods = scope
        .get("methods")
        .filter(|v| !v.is_null())
        .unwrap_or(&tcp);
    if !methods
        .as_array()
        .is_some_and(|m| m.iter().any(|m| m == profile))
    {
        return Err("This method is not authorized by the scope".into());
    }
    if let Some(target) = input.get("target")
        && (!contains(&scope, "targets", target) || contains(&scope, "exclusions", target))
    {
        return Err("Target is outside the authorized scope".into());
    }
    if let Some(port) = input.get("port") {
        let port = port.as_f64().filter(|p| p.is_finite() && p.fract() == 0.0);
        if !port.is_some_and(|port| {
            scope["ports"]
                .as_array()
                .is_some_and(|ports| ports.iter().any(|p| p.as_f64() == Some(port)))
        }) {
            return Err("Port is outside the authorized scope".into());
        }
    }
    for (field, list, message) in [
        (
            "serverName",
            "serverNames",
            "TLS name is outside the authorized scope",
        ),
        (
            "username",
            "sshUsernames",
            "SSH username is outside the authorized scope",
        ),
        (
            "path",
            "paths",
            "Filesystem target is outside the authorized scope",
        ),
    ] {
        if let Some(value) = input.get(field)
            && !contains(&scope, list, value)
        {
            return Err(message.into());
        }
    }
    if ["tls", "http", "https", "ssh", "nuclei", "host-audit"].contains(&profile)
        && !truthy(&input["target"])
    {
        return Err("An explicit target is required for this profile".into());
    }
    if ["tls", "http", "https", "ssh", "nuclei"].contains(&profile) && input.get("port").is_none() {
        return Err("An explicit port is required for this profile".into());
    }
    if ["trivy", "telemetry"].contains(&profile)
        && (!truthy(&input["path"]) || !truthy(&scope["projectRoot"]))
    {
        return Err("A project-bound filesystem target is required".into());
    }
    if profile == "host-audit" && truthy(&input["username"]) && input.get("port").is_none() {
        return Err("Remote host audit requires an explicitly authorized SSH port".into());
    }
    if profile == "telemetry" && !matches!(input["source"].as_str(), Some("wazuh" | "suricata")) {
        return Err("Select Wazuh or Suricata import".into());
    }
    Ok(AuthorizedCheck {
        input: input.clone(),
        scope,
        operator: operator.into(),
        expires: validated.expiry_ms(),
    })
}
