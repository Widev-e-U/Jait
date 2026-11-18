//! Scope validation for the explicit-IP assessment profile. No network I/O.
//! A private-field validated scope is required before the execution service can
//! issue a per-dispatch TCP permit; reachability never grants authorization.
//! Operator ownership, project-path binding and execution leases belong to the
//! assessment service, which is not activated by this validator.
use crate::{
    services::{calendar::js_text, subscription_usage_fetchers::js_date_parse},
    text::js_trim,
    time::iso,
};
use serde::Serialize;
use serde_json::Value;
use std::net::Ipv4Addr;
pub const PROFILES: &[&str] = &[
    "tls",
    "http",
    "https",
    "ssh",
    "host-audit",
    "nmap",
    "nuclei",
    "trivy",
    "telemetry",
];
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidatedScopeInput {
    pub(super) targets: Vec<Ipv4Addr>,
    pub(super) exclusions: Vec<Ipv4Addr>,
    pub(super) ports: Vec<u16>,
    expires_at: String,
    authorized: bool,
    pub(super) methods: Vec<String>,
    pub(super) paths: Vec<String>,
    server_names: Vec<String>,
    ssh_usernames: Vec<String>,
}
impl ValidatedScopeInput {
    pub fn normalized(&self) -> Value {
        serde_json::to_value(self).expect("scope serialization")
    }
    pub fn expiry_ms(&self) -> i64 {
        js_date_parse(&self.expires_at).expect("validated timestamp")
    }
}
fn ips(value: &Value, label: &str, empty: bool) -> Result<Vec<Ipv4Addr>, String> {
    let Some(values) = value
        .as_array()
        .filter(|v| v.len() <= 16 && (empty || !v.is_empty()))
    else {
        return Err(format!(
            "{label} must contain {}–16 explicit IPv4 addresses",
            if empty { 0 } else { 1 }
        ));
    };
    let mut output = vec![];
    for value in values {
        let ip = value
            .as_str()
            .filter(|s| js_trim(s) == *s)
            .and_then(|s| s.parse::<Ipv4Addr>().ok())
            .ok_or("Only literal IPv4 addresses are supported; no hostnames, URLs or CIDRs")?;
        let first = ip.octets()[0];
        if first == 0 || first >= 224 {
            return Err("Unicast targets required".into());
        }
        if !output.contains(&ip) {
            output.push(ip);
        }
    }
    Ok(output)
}
fn strings(value: Option<&Value>) -> Result<Vec<String>, String> {
    let empty = vec![];
    let values = match value.filter(|v| !v.is_null()) {
        Some(v) => v
            .as_array()
            .ok_or("Invalid scoped paths, server names or SSH users")?,
        None => &empty,
    };
    if values.len() > 4 {
        return Err("Invalid scoped paths, server names or SSH users".into());
    }
    values
        .iter()
        .map(|v| {
            v.as_str()
                .filter(|s| {
                    !s.is_empty()
                        && s.encode_utf16().count() <= 240
                        && !s.chars().any(|c| c <= '\u{1f}')
                })
                .map(str::to_string)
                .ok_or_else(|| "Invalid scoped paths, server names or SSH users".into())
        })
        .collect()
}
pub fn validate_scope(input: &Value, now: i64) -> Result<ValidatedScopeInput, String> {
    if input.get("authorized") != Some(&Value::Bool(true)) {
        return Err("Explicit target authorization is required".into());
    }
    let targets = ips(&input["targets"], "Targets", false)?;
    let exclusions = ips(&input["exclusions"], "Exclusions", true)?;
    let invalid_ports = || "Choose 1–16 TCP ports from 1–65535".to_string();
    let values = input["ports"]
        .as_array()
        .filter(|v| !v.is_empty() && v.len() <= 16)
        .ok_or_else(invalid_ports)?;
    let mut ports = vec![];
    for value in values {
        let n = value
            .as_f64()
            .filter(|n| n.is_finite() && n.fract() == 0.0 && *n >= 1.0 && *n <= 65535.0)
            .ok_or_else(invalid_ports)? as u16;
        if !ports.contains(&n) {
            ports.push(n);
        }
    }
    let expires = input
        .get("expiresAt")
        .and_then(|v| js_date_parse(&js_text(v)))
        .filter(|time| *time > now && *time <= now.saturating_add(3_600_000))
        .ok_or("Scope expiry must be in the next hour")?;
    if targets.iter().all(|ip| exclusions.contains(ip)) {
        return Err("All targets are excluded".into());
    }
    let raw_methods = input
        .get("methods")
        .filter(|v| !v.is_null())
        .cloned()
        .unwrap_or_else(|| serde_json::json!(["tcp"]));
    let invalid_methods = || "Select explicitly authorized assessment methods".to_string();
    let raw_methods = raw_methods
        .as_array()
        .filter(|v| !v.is_empty() && v.len() <= 12)
        .ok_or_else(invalid_methods)?;
    let mut methods = vec![];
    for value in raw_methods {
        let method = value
            .as_str()
            .filter(|s| *s == "tcp" || PROFILES.contains(s))
            .ok_or_else(invalid_methods)?;
        if !methods.iter().any(|m| m == method) {
            methods.push(method.to_string());
        }
    }
    let paths = strings(input.get("paths"))?;
    let server_names = strings(input.get("serverNames"))?;
    let ssh_usernames = strings(input.get("sshUsernames"))?;
    for name in &server_names {
        let bytes = name.as_bytes();
        if !bytes[0].is_ascii_alphanumeric()
            || !bytes[bytes.len() - 1].is_ascii_alphanumeric()
            || !bytes
                .iter()
                .all(|c| c.is_ascii_alphanumeric() || matches!(c, b'.' | b'-'))
        {
            return Err("TLS server names must be plain DNS names; they are used only for SNI and identity checks".into());
        }
    }
    for name in &ssh_usernames {
        let bytes = name.as_bytes();
        if bytes.len() > 64
            || !(bytes[0].is_ascii_alphabetic() || bytes[0] == b'_')
            || !bytes
                .iter()
                .all(|c| c.is_ascii_alphanumeric() || matches!(c, b'_' | b'.' | b'-'))
        {
            return Err("Invalid authorized SSH username".into());
        }
    }
    Ok(ValidatedScopeInput {
        targets,
        exclusions,
        ports,
        expires_at: iso(expires)?,
        authorized: true,
        methods,
        paths,
        server_names,
        ssh_usernames,
    })
}
