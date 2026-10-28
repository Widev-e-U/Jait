//! Port of `packages/gateway/src/lib/security/protocols.ts`.
//!
//! The TypeScript module holds the shared evidence/rule/result helpers used by every
//! security adapter plus three protocol probes (TLS, HTTP, SSH identification).
//!
//! Design notes for the port:
//! * Every decision that the TypeScript performs is preserved as a pure function so the
//!   ordering of evidence/rules/coverage gaps and the exact string literals stay identical
//!   and testable without a network.
//! * `check_ssh` and `check_http` perform real network I/O with `tokio`/`reqwest`, matching
//!   the Node implementations (3 s budget, no redirects, no body retention, 64 KiB body cap).
//! * `check_tls` is fail-closed: Node's `socket.getPeerCertificate()` needs an X.509 parser
//!   which this crate does not link, so the adapter reports the gap instead of inventing
//!   certificate facts (see `CHECK_TLS_UNAVAILABLE_GAP`).

use std::sync::OnceLock;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value, json};
use tokio::io::AsyncReadExt;
use tokio::net::TcpStream;
use tokio::sync::watch;
use tokio::time::{Duration, timeout};

/// `rule()` rollback text in the TypeScript implementation.
pub const ROLLBACK: &str = "Preserve the previous configuration and restore it if legitimate access is affected.";
/// Every adapter starts with this coverage gap.
pub const GAP_GATEWAY_OBSERVATION: &str =
    "Gateway-side observation; WAN exposure and exploitability are not established.";
pub const GAP_TLS_SCOPE: &str = "Negotiated TLS >=1.2 only; acceptance of older protocols and full cipher coverage were not tested. Trust is relative to this gateway's CA store.";
pub const GAP_TLS_TIMED_OUT: &str = "TLS handshake timed out";
pub const GAP_TLS_FAILED: &str = "TLS handshake failed; certificate policy cannot be determined";
pub const GAP_TLS_CANCELLED: &str = "TLS check cancelled";
pub const GAP_HTTP_SCOPE: &str = "Only GET / was requested. Redirects were not followed; response bodies and sensitive headers were discarded. Missing headers are policy observations, not confirmed exploitable vulnerabilities.";
pub const GAP_HTTP_REDIRECT: &str = "Redirect destination and final response were not assessed.";
pub const GAP_HTTP_BODY_CAP: &str = "Response body consumption stopped at 64 KiB";
pub const GAP_HTTP_CANCELLED: &str = "HTTP check cancelled";
pub const GAP_HTTP_TIMED_OUT: &str = "HTTP request timed out";
pub const GAP_HTTP_FAILED: &str = "HTTP request failed";
pub const GAP_HTTP_INCOMPLETE: &str = "Response stream was incomplete";
pub const GAP_SSH_SCOPE: &str = "Identification strings are untrusted self-reports. Cipher negotiation, credentials, configuration and CVEs were not tested.";
pub const GAP_SSH_EXCEEDED: &str = "SSH identification exceeded 4 KiB";
pub const GAP_SSH_CANCELLED: &str = "SSH identification cancelled";
pub const GAP_SSH_TIMED_OUT: &str = "SSH identification timed out";
pub const GAP_SSH_FAILED: &str = "SSH connection failed";
pub const GAP_SSH_NO_IDENTIFICATION: &str = "No valid SSH identification received";

/// Documented replacement for the Node-only certificate inspection path.
pub const CHECK_TLS_UNAVAILABLE_GAP: &str =
    "TLS certificate inspection is unavailable in this runtime: negotiated protocol, certificate validity and identity require an X.509 parser that the gateway does not link. Certificate policy cannot be determined.";

const SSH_TIMEOUT_MS: u64 = 3_000;
const HTTP_TIMEOUT_MS: u64 = 3_000;
const SSH_IDENTIFICATION_LIMIT: usize = 4_096;
pub const HTTP_BODY_LIMIT: usize = 65_536;
const THIRTY_DAYS_MS: i64 = 30 * 86400 * 1000;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Severity {
    Info,
    Low,
    Medium,
    High,
    Critical,
}

impl Severity {
    pub fn as_str(self) -> &'static str {
        match self {
            Severity::Info => "info",
            Severity::Low => "low",
            Severity::Medium => "medium",
            Severity::High => "high",
            Severity::Critical => "critical",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RuleStatus {
    Observed,
    Suspected,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Confidence {
    High,
    Medium,
    Low,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuleObservation {
    pub rule_id: String,
    pub title: String,
    pub severity: Severity,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub status: Option<RuleStatus>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub confidence: Option<Confidence>,
    pub evidence_index: usize,
    pub remediation: String,
    pub rollback: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SecurityEvidence {
    pub id: String,
    pub target: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub port: Option<u16>,
    pub observed_at: String,
    pub summary: String,
    pub facts: Map<String, Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdapterResult {
    pub engine: String,
    pub engine_version: String,
    pub evidence: Vec<SecurityEvidence>,
    pub rules: Vec<RuleObservation>,
    pub coverage_gaps: Vec<String>,
    pub conclusive: bool,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub raw: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub content_type: Option<String>,
}

impl AdapterResult {
    pub fn push_gap(&mut self, gap: &str) {
        self.coverage_gaps.push(gap.to_owned());
    }
}

/// Minimal stand-in for the DOM `AbortSignal` the TypeScript adapters accept.
///
/// Cloning shares the same flag, mirroring how one signal is handed to several checks.
#[derive(Debug, Clone)]
pub struct Cancellation {
    flag: Arc<AtomicBool>,
    tx: watch::Sender<bool>,
}

impl Default for Cancellation {
    fn default() -> Self {
        Self::new()
    }
}

impl Cancellation {
    pub fn new() -> Self {
        let (tx, _rx) = watch::channel(false);
        Self { flag: Arc::new(AtomicBool::new(false)), tx }
    }

    /// `signal.abort()`.
    pub fn cancel(&self) {
        self.flag.store(true, Ordering::SeqCst);
        let _ = self.tx.send_replace(true);
    }

    /// `signal.aborted`.
    pub fn is_cancelled(&self) -> bool {
        self.flag.load(Ordering::SeqCst)
    }

    /// Resolves once the signal is aborted (immediately when already aborted).
    pub async fn cancelled(&self) {
        if self.is_cancelled() {
            return;
        }
        let mut rx = self.tx.subscribe();
        if *rx.borrow() {
            return;
        }
        while rx.changed().await.is_ok() {
            if *rx.borrow() {
                return;
            }
        }
    }
}

fn is_empty_opt(value: Option<&str>) -> bool {
    value.is_none_or(|v| v.is_empty())
}

/// Mirrors `const version = () => process.versions.bun ? "bun:" + process.versions.bun : process.version;`
///
/// JavaScript truthiness is preserved: an empty Bun version falls through to the Node version.
pub fn version_string(bun_version: Option<&str>, node_version: Option<&str>) -> String {
    if !is_empty_opt(bun_version) {
        let bun = bun_version.unwrap_or_default();
        return format!("bun:{bun}");
    }
    node_version.unwrap_or_default().to_owned()
}

/// Runtime identifier reported for every adapter (`process.version` in Node).
pub const RUNTIME_VERSION: &str = concat!("gateway-rust-", env!("CARGO_PKG_VERSION"));

pub fn engine_version() -> String {
    version_string(None, Some(RUNTIME_VERSION))
}

fn iso_from_millis(millis: i64) -> Option<String> {
    chrono::DateTime::from_timestamp_millis(millis)
        .map(|dt| dt.to_rfc3339_opts(chrono::SecondsFormat::Millis, true))
}

pub fn now_iso8601() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

pub fn now_millis() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

pub fn evidence(
    target: &str,
    port: Option<u16>,
    summary: &str,
    facts: Map<String, Value>,
) -> SecurityEvidence {
    SecurityEvidence {
        id: uuid::Uuid::new_v4().to_string(),
        target: target.to_owned(),
        port,
        observed_at: now_iso8601(),
        summary: summary.to_owned(),
        facts,
    }
}

/// `rule(ruleId, title, severity, remediation, evidenceIndex = 0)`.
pub fn rule(
    rule_id: &str,
    title: &str,
    severity: Severity,
    remediation: &str,
    evidence_index: usize,
) -> RuleObservation {
    RuleObservation {
        rule_id: rule_id.to_owned(),
        title: title.to_owned(),
        severity,
        status: None,
        confidence: None,
        evidence_index,
        remediation: remediation.to_owned(),
        rollback: ROLLBACK.to_owned(),
    }
}

pub fn rule_at_zero(
    rule_id: &str,
    title: &str,
    severity: Severity,
    remediation: &str,
) -> RuleObservation {
    rule(rule_id, title, severity, remediation, 0)
}

/// `function result(engine: string): AdapterResult`.
pub fn result(engine: &str) -> AdapterResult {
    AdapterResult {
        engine: engine.to_owned(),
        engine_version: engine_version(),
        evidence: Vec::new(),
        rules: Vec::new(),
        coverage_gaps: vec![GAP_GATEWAY_OBSERVATION.to_owned()],
        conclusive: false,
        raw: None,
        content_type: None,
    }
}

fn hsts_regex() -> &'static regex::Regex {
    static RE: OnceLock<regex::Regex> = OnceLock::new();
    RE.get_or_init(|| {
        regex::Regex::new(r"(?i)^max-age\s*=\s*([0-9]+)(?:\s*;|$)")
            .unwrap_or_else(|_| regex::Regex::new(r"^$").expect("static fallback regex"))
    })
}

/// `const maxAgeMatch = /^max-age\s*=\s*(\d+)(?:\s*;|$)/i.exec(hsts); hstsEnabled = Boolean(maxAgeMatch && Number(maxAgeMatch[1]) > 0);`
pub fn hsts_enabled(header: Option<&str>) -> bool {
    let Some(header) = header else {
        return false;
    };
    let Some(captures) = hsts_regex().captures(header) else {
        return false;
    };
    let Some(digits) = captures.get(1) else {
        return false;
    };
    digits
        .as_str()
        .parse::<f64>()
        .map(|value| value > 0.0)
        .unwrap_or(false)
}

fn ssh_regex() -> &'static regex::Regex {
    static RE: OnceLock<regex::Regex> = OnceLock::new();
    RE.get_or_init(|| {
        regex::Regex::new(r"^SSH-(1\.0|1\.5|1\.99|2\.0)-([A-Za-z0-9._-]{1,64})(?:[ \r]|$)")
            .unwrap_or_else(|_| regex::Regex::new(r"^$").expect("static fallback regex"))
    })
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SshIdentification {
    pub protocol: String,
    pub software_identifier: String,
}

/// Matches one already-split identification line against the TypeScript regex.
pub fn parse_ssh_identification_line(line: &str) -> Option<SshIdentification> {
    let captures = ssh_regex().captures(line)?;
    Some(SshIdentification {
        protocol: captures.get(1)?.as_str().to_owned(),
        software_identifier: captures.get(2)?.as_str().to_owned(),
    })
}

/// `for (const line of buffer.split("\n").slice(0, -1))` — only complete lines are inspected,
/// and the first matching line wins.
pub fn parse_ssh_identification(buffer: &str) -> Option<SshIdentification> {
    let mut lines = buffer.split('\n');
    let mut complete: Vec<&str> = lines.by_ref().collect();
    // `.slice(0, -1)` drops the trailing (possibly partial) segment.
    complete.pop();
    complete
        .into_iter()
        .find_map(parse_ssh_identification_line)
}

/// Node decodes chunks with `chunk.toString("ascii")`; every byte maps to one char.
fn decode_ascii(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| char::from(*byte)).collect()
}

/// Facts describing an HTTP root response, as observed by the transport layer.
#[derive(Debug, Clone, Default)]
pub struct HttpObservation<'a> {
    pub status_code: u16,
    pub secure: bool,
    pub hsts: Option<&'a str>,
    pub content_type_options: Option<&'a str>,
    pub frame_options: Option<&'a str>,
    pub content_security_policy: Option<&'a str>,
}

fn contains_frame_ancestors(csp: Option<&str>) -> bool {
    csp.is_some_and(|value| value.contains("frame-ancestors"))
}

/// Port of the `response` handler inside `checkHttp`.
pub fn evaluate_http_response(target: &str, port: u16, observation: &HttpObservation<'_>) -> AdapterResult {
    let mut output = result(if observation.secure { "node-https" } else { "node-http" });
    let status = observation.status_code;
    let hsts = hsts_enabled(observation.hsts);
    let no_sniff = observation.content_type_options == Some("nosniff");
    let framing = observation.frame_options.is_some() || contains_frame_ancestors(observation.content_security_policy);

    let mut facts = Map::new();
    facts.insert("statusCode".to_owned(), json!(status));
    facts.insert("transport".to_owned(), json!(if observation.secure { "https" } else { "http" }));
    facts.insert("redirectObserved".to_owned(), json!((300..400).contains(&status)));
    facts.insert("hstsEnabled".to_owned(), json!(hsts));
    facts.insert("noSniff".to_owned(), json!(no_sniff));
    facts.insert("framingPolicyPresent".to_owned(), json!(framing));
    facts.insert("bodyRetained".to_owned(), json!(false));

    output.evidence.push(evidence(
        target,
        Some(port),
        "HTTP root response and security-header presence",
        facts,
    ));
    output.conclusive = (200..300).contains(&status);
    output.push_gap(GAP_HTTP_SCOPE);
    if (300..400).contains(&status) {
        output.push_gap(GAP_HTTP_REDIRECT);
    }
    if output.conclusive {
        if observation.secure && !hsts {
            output.rules.push(rule_at_zero(
                "http.hsts",
                "HTTPS response has no active HSTS policy",
                Severity::Low,
                "Consider an appropriate Strict-Transport-Security policy after confirming HTTPS works for the intended hostname; avoid enabling preload or includeSubDomains without reviewing their scope.",
            ));
        }
        if !no_sniff {
            output.rules.push(rule_at_zero(
                "http.nosniff",
                "Response omits X-Content-Type-Options: nosniff",
                Severity::Low,
                "Configure X-Content-Type-Options: nosniff after validating MIME types.",
            ));
        }
        if !framing {
            output.rules.push(rule_at_zero(
                "http.framing",
                "Response has no framing policy",
                Severity::Info,
                "Review whether embedding is intended; configure CSP frame-ancestors if embedding should be restricted.",
            ));
        }
    }
    output
}

/// Facts Node reads from `socket.getPeerCertificate()` on `secureConnect`.
#[derive(Debug, Clone, Default)]
pub struct TlsObservation<'a> {
    pub has_certificate: bool,
    pub negotiated_protocol: Option<&'a str>,
    pub authorized: bool,
    pub identity_matches: bool,
    pub valid_from_ms: Option<i64>,
    pub valid_to_ms: Option<i64>,
    pub fingerprint256: Option<&'a str>,
    pub now_ms: i64,
}

/// Port of the `secureConnect` handler inside `checkTls`.
pub fn evaluate_tls_certificate(target: &str, port: u16, observation: &TlsObservation<'_>) -> AdapterResult {
    let mut output = result("node-tls");
    let now = observation.now_ms;
    let expires = observation.valid_to_ms;
    let begins = observation.valid_from_ms;

    let expired = expires.is_some_and(|value| value <= now);
    let not_yet_valid = begins.is_some_and(|value| value > now);
    let expiring_soon =
        expires.is_some_and(|value| value > now && value - now < THIRTY_DAYS_MS);

    output.conclusive = observation.has_certificate && expires.is_some() && begins.is_some();

    let mut facts = Map::new();
    facts.insert("negotiatedProtocol".to_owned(), json!(observation.negotiated_protocol));
    facts.insert("trustedByGateway".to_owned(), json!(observation.authorized));
    facts.insert("identityMatches".to_owned(), json!(observation.identity_matches));
    facts.insert(
        "validFrom".to_owned(),
        json!(begins.and_then(iso_from_millis)),
    );
    facts.insert(
        "validTo".to_owned(),
        json!(expires.and_then(iso_from_millis)),
    );
    facts.insert("fingerprint256".to_owned(), json!(observation.fingerprint256));
    facts.insert("expired".to_owned(), json!(expired));
    facts.insert("notYetValid".to_owned(), json!(not_yet_valid));
    facts.insert("expiringSoon".to_owned(), json!(expiring_soon));

    output.evidence.push(evidence(
        target,
        Some(port),
        "TLS certificate and negotiated protocol",
        facts,
    ));

    if expired {
        output.rules.push(rule_at_zero(
            "tls.expired",
            "TLS certificate is expired",
            Severity::High,
            "Renew the certificate through the service's configured issuer, then reload the service and repeat this TLS check.",
        ));
    } else if expires.is_some_and(|value| value - now < THIRTY_DAYS_MS) {
        output.rules.push(rule_at_zero(
            "tls.expiring",
            "TLS certificate expires within 30 days",
            Severity::Low,
            "Schedule certificate renewal and repeat this check after reloading the service.",
        ));
    }
    if not_yet_valid {
        output.rules.push(rule_at_zero(
            "tls.not-yet-valid",
            "TLS certificate is not yet valid",
            Severity::Medium,
            "Check system time and certificate issuance dates.",
        ));
    }
    if !observation.authorized {
        output.rules.push(rule_at_zero(
            "tls.gateway-trust",
            "Certificate chain is not trusted by this gateway",
            Severity::Medium,
            "Review the certificate chain and intended private CA trust. Install an approved CA on the gateway or serve the correct chain.",
        ));
    }
    if !observation.identity_matches {
        output.rules.push(rule_at_zero(
            "tls.identity",
            "Certificate identity does not match the checked name",
            Severity::Medium,
            "Check the intended DNS name, certificate SANs and virtual-host configuration; configure the approved TLS server name in the scope.",
        ));
    }
    output.push_gap(GAP_TLS_SCOPE);
    output
}

/// Port of the identification branch of `checkSsh` once a line matched.
pub fn evaluate_ssh_identification(
    target: &str,
    port: u16,
    identification: &SshIdentification,
) -> AdapterResult {
    let mut output = result("node-net-ssh-identification");
    output.conclusive = true;
    let mut facts = Map::new();
    facts.insert("protocol".to_owned(), json!(identification.protocol));
    facts.insert(
        "softwareIdentifier".to_owned(),
        json!(identification.software_identifier),
    );
    facts.insert("authenticationAttempted".to_owned(), json!(false));
    output.evidence.push(evidence(
        target,
        Some(port),
        "SSH identification observed; no authentication attempted",
        facts,
    ));
    if identification.protocol != "2.0" {
        output.rules.push(rule_at_zero(
            "ssh.legacy-identification",
            "SSH server advertises a legacy-compatible protocol",
            Severity::Medium,
            "Review SSH server protocol settings and disable SSHv1 compatibility where supported.",
        ));
    }
    output.push_gap(GAP_SSH_SCOPE);
    output
}

/// `checkSsh(target, port, signal)` — reads the server identification banner only.
pub async fn check_ssh(target: &str, port: u16, cancellation: &Cancellation) -> AdapterResult {
    let mut output = result("node-net-ssh-identification");
    if cancellation.is_cancelled() {
        return output;
    }

    let timeout_budget = Duration::from_millis(SSH_TIMEOUT_MS);
    let connect = TcpStream::connect((target, port));
    let mut stream = tokio::select! {
        biased;
        _ = cancellation.cancelled() => {
            output.push_gap(GAP_SSH_CANCELLED);
            return output;
        }
        outcome = timeout(timeout_budget, connect) => match outcome {
            Ok(Ok(stream)) => stream,
            Ok(Err(_)) => {
                output.push_gap(GAP_SSH_FAILED);
                return output;
            }
            Err(_) => {
                output.push_gap(GAP_SSH_TIMED_OUT);
                return output;
            }
        },
    };

    let mut buffer = String::new();
    let mut chunk = [0u8; 1024];
    loop {
        let read = tokio::select! {
            biased;
            _ = cancellation.cancelled() => {
                output.push_gap(GAP_SSH_CANCELLED);
                return output;
            }
            outcome = timeout(timeout_budget, stream.read(&mut chunk)) => match outcome {
                Ok(Ok(read)) => read,
                Ok(Err(_)) => {
                    // `socket.once("error")`
                    output.push_gap(GAP_SSH_FAILED);
                    return output;
                }
                Err(_) => {
                    output.push_gap(GAP_SSH_TIMED_OUT);
                    return output;
                }
            },
        };
        if read == 0 {
            if !output.conclusive {
                output.push_gap(GAP_SSH_NO_IDENTIFICATION);
            }
            return output;
        }
        buffer.push_str(&decode_ascii(&chunk[..read]));
        if buffer.chars().count() > SSH_IDENTIFICATION_LIMIT {
            output.push_gap(GAP_SSH_EXCEEDED);
            return output;
        }
        if let Some(identification) = parse_ssh_identification(&buffer) {
            return evaluate_ssh_identification(target, port, &identification);
        }
    }
}

fn http_url(target: &str, port: u16, secure: bool) -> String {
    let scheme = if secure { "https" } else { "http" };
    let host = if target.contains(':') && !target.starts_with('[') {
        format!("[{target}]")
    } else {
        target.to_owned()
    };
    format!("{scheme}://{host}:{port}/")
}

fn header_value<'a>(headers: &'a reqwest::header::HeaderMap, name: &str) -> Option<&'a str> {
    headers.get(name).and_then(|value| value.to_str().ok())
}

/// `checkHttp(target, port, secure, signal)` — single `GET /`, headers only.
pub async fn check_http(
    target: &str,
    port: u16,
    secure: bool,
    cancellation: &Cancellation,
) -> AdapterResult {
    let mut output = result(if secure { "node-https" } else { "node-http" });
    if cancellation.is_cancelled() {
        return output;
    }
    let client = match reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .danger_accept_invalid_certs(true)
        .timeout(Duration::from_millis(HTTP_TIMEOUT_MS))
        .build()
    {
        Ok(client) => client,
        Err(_) => {
            output.push_gap(GAP_HTTP_FAILED);
            return output;
        }
    };
    let request = client
        .get(http_url(target, port, secure))
        .header(reqwest::header::USER_AGENT, "Jait-Security/1")
        .header(reqwest::header::ACCEPT, "*/*")
        .header(reqwest::header::CONNECTION, "close");

    let mut response = tokio::select! {
        biased;
        _ = cancellation.cancelled() => {
            output.conclusive = false;
            output.push_gap(GAP_HTTP_CANCELLED);
            return output;
        }
        outcome = request.send() => match outcome {
            Ok(response) => response,
            Err(error) => {
                output.conclusive = false;
                if error.is_timeout() {
                    output.push_gap(GAP_HTTP_TIMED_OUT);
                } else {
                    output.push_gap(GAP_HTTP_FAILED);
                }
                return output;
            }
        },
    };

    let observation = HttpObservation {
        status_code: response.status().as_u16(),
        secure,
        hsts: header_value(response.headers(), "strict-transport-security"),
        content_type_options: header_value(response.headers(), "x-content-type-options"),
        frame_options: header_value(response.headers(), "x-frame-options"),
        content_security_policy: header_value(response.headers(), "content-security-policy"),
    };
    output = evaluate_http_response(target, port, &observation);

    let mut bytes = 0usize;
    loop {
        let next = tokio::select! {
            biased;
            _ = cancellation.cancelled() => {
                output.conclusive = false;
                output.push_gap(GAP_HTTP_CANCELLED);
                return output;
            }
            outcome = response.chunk() => outcome,
        };
        match next {
            Ok(Some(chunk)) => {
                bytes += chunk.len();
                if bytes > HTTP_BODY_LIMIT {
                    output.push_gap(GAP_HTTP_BODY_CAP);
                    return output;
                }
            }
            Ok(None) => return output,
            Err(error) => {
                output.conclusive = false;
                if error.is_timeout() {
                    output.push_gap(GAP_HTTP_TIMED_OUT);
                } else {
                    output.push_gap(GAP_HTTP_INCOMPLETE);
                }
                return output;
            }
        }
    }
}

/// `checkTls(target, port, serverName, signal)`.
///
/// The handshake itself is not attempted: without an X.509 parser the gateway could report
/// neither the validity window nor the identity match, and guessing those facts would turn a
/// fail-closed check into a permissive one. The result keeps the base coverage gap, adds the
/// documented capability gap and stays non-conclusive.
pub async fn check_tls(
    _target: &str,
    _port: u16,
    _server_name: Option<&str>,
    cancellation: &Cancellation,
) -> AdapterResult {
    let mut output = result("node-tls");
    if cancellation.is_cancelled() {
        output.push_gap(GAP_TLS_CANCELLED);
        return output;
    }
    output.push_gap(CHECK_TLS_UNAVAILABLE_GAP);
    output
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::AsyncWriteExt;

    fn facts_map(pairs: &[(&str, Value)]) -> Map<String, Value> {
        let mut map = Map::new();
        for (key, value) in pairs {
            map.insert((*key).to_owned(), value.clone());
        }
        map
    }

    #[test]
    fn rule_defaults_match_typescript() {
        let observed = rule_at_zero("http.hsts", "title", Severity::Low, "fix it");
        assert_eq!(observed.rule_id, "http.hsts");
        assert_eq!(observed.title, "title");
        assert_eq!(observed.severity, Severity::Low);
        assert_eq!(observed.evidence_index, 0);
        assert_eq!(observed.remediation, "fix it");
        assert_eq!(
            observed.rollback,
            "Preserve the previous configuration and restore it if legitimate access is affected."
        );
        assert_eq!(observed.status, None);
        assert_eq!(observed.confidence, None);

        let indexed = rule("tls.expired", "t", Severity::High, "r", 3);
        assert_eq!(indexed.evidence_index, 3);
    }

    #[test]
    fn result_shape_and_initial_gap() {
        let output = result("node-tls");
        assert_eq!(output.engine, "node-tls");
        assert_eq!(output.engine_version, engine_version());
        assert!(output.evidence.is_empty());
        assert!(output.rules.is_empty());
        assert_eq!(
            output.coverage_gaps,
            vec!["Gateway-side observation; WAN exposure and exploitability are not established.".to_owned()]
        );
        assert!(!output.conclusive);
        assert_eq!(output.raw, None);
        assert_eq!(output.content_type, None);
    }

    #[test]
    fn evidence_omits_absent_port() {
        let without_port = evidence("10.0.0.1", None, "summary", facts_map(&[("a", json!(1))]));
        assert_eq!(without_port.port, None);
        assert_eq!(without_port.target, "10.0.0.1");
        assert_eq!(without_port.summary, "summary");
        assert_eq!(without_port.facts.get("a"), Some(&json!(1)));
        assert_eq!(without_port.id.len(), 36);
        assert!(without_port.observed_at.ends_with('Z'));
        assert!(!without_port.observed_at.contains("+00:00"));

        let with_port = evidence("10.0.0.1", Some(443), "summary", Map::new());
        assert_eq!(with_port.port, Some(443));
        let json = serde_json::to_value(&with_port).expect("serialisable");
        assert_eq!(json["port"], json!(443));
        assert!(json.get("raw").is_none());
        let json_without = serde_json::to_value(&without_port).expect("serialisable");
        assert!(json_without.get("port").is_none());
    }

    #[test]
    fn version_prefers_bun_and_preserves_truthiness() {
        assert_eq!(version_string(Some("1.1.30"), Some("v22.3.0")), "bun:1.1.30");
        assert_eq!(version_string(None, Some("v22.3.0")), "v22.3.0");
        assert_eq!(version_string(Some(""), Some("v22.3.0")), "v22.3.0");
        assert_eq!(version_string(None, None), "");
        assert_eq!(engine_version(), RUNTIME_VERSION);
    }

    #[test]
    fn hsts_requires_leading_max_age_and_positive_value() {
        assert!(hsts_enabled(Some("max-age=31536000")));
        assert!(hsts_enabled(Some("max-age=31536000; includeSubDomains")));
        assert!(hsts_enabled(Some("MAX-AGE=60")));
        assert!(hsts_enabled(Some("max-age = 10 ;")));
        assert!(!hsts_enabled(Some("max-age=0")));
        assert!(!hsts_enabled(Some("max-age=0; includeSubDomains")));
        assert!(!hsts_enabled(Some("includeSubDomains; max-age=100")));
        assert!(!hsts_enabled(Some("max-age=12x")));
        assert!(!hsts_enabled(Some("")));
        assert!(!hsts_enabled(None));
    }

    #[test]
    fn http_secure_success_with_all_headers_emits_no_rules() {
        let observation = HttpObservation {
            status_code: 200,
            secure: true,
            hsts: Some("max-age=63072000"),
            content_type_options: Some("nosniff"),
            frame_options: Some("DENY"),
            content_security_policy: None,
        };
        let output = evaluate_http_response("example.test", 443, &observation);
        assert_eq!(output.engine, "node-https");
        assert!(output.conclusive);
        assert!(output.rules.is_empty());
        assert_eq!(output.evidence.len(), 1);
        let evidence = &output.evidence[0];
        assert_eq!(evidence.port, Some(443));
        assert_eq!(evidence.summary, "HTTP root response and security-header presence");
        assert_eq!(evidence.facts.get("statusCode"), Some(&json!(200)));
        assert_eq!(evidence.facts.get("transport"), Some(&json!("https")));
        assert_eq!(evidence.facts.get("redirectObserved"), Some(&json!(false)));
        assert_eq!(evidence.facts.get("hstsEnabled"), Some(&json!(true)));
        assert_eq!(evidence.facts.get("noSniff"), Some(&json!(true)));
        assert_eq!(evidence.facts.get("framingPolicyPresent"), Some(&json!(true)));
        assert_eq!(evidence.facts.get("bodyRetained"), Some(&json!(false)));
        assert_eq!(output.coverage_gaps, vec![GAP_GATEWAY_OBSERVATION.to_owned(), GAP_HTTP_SCOPE.to_owned()]);
    }

    #[test]
    fn http_secure_missing_headers_rule_order_matches() {
        let observation = HttpObservation {
            status_code: 204,
            secure: true,
            hsts: None,
            content_type_options: Some("Nosniff"),
            frame_options: None,
            content_security_policy: Some("default-src 'self'"),
        };
        let output = evaluate_http_response("example.test", 8443, &observation);
        assert!(output.conclusive);
        let ids: Vec<&str> = output.rules.iter().map(|r| r.rule_id.as_str()).collect();
        assert_eq!(ids, vec!["http.hsts", "http.nosniff", "http.framing"]);
        assert_eq!(output.rules[0].severity, Severity::Low);
        assert_eq!(output.rules[1].severity, Severity::Low);
        assert_eq!(output.rules[2].severity, Severity::Info);
        assert_eq!(output.rules[0].title, "HTTPS response has no active HSTS policy");
        assert_eq!(output.rules[1].title, "Response omits X-Content-Type-Options: nosniff");
        assert_eq!(output.rules[2].title, "Response has no framing policy");
        assert!(output.rules.iter().all(|rule| rule.evidence_index == 0));
        // value comparison is case sensitive: "Nosniff" is not "nosniff"
        assert_eq!(output.evidence[0].facts.get("noSniff"), Some(&json!(false)));
    }

    #[test]
    fn http_plain_transport_never_emits_hsts_rule() {
        let observation = HttpObservation {
            status_code: 200,
            secure: false,
            hsts: None,
            content_type_options: Some("nosniff"),
            frame_options: None,
            content_security_policy: None,
        };
        let output = evaluate_http_response("example.test", 80, &observation);
        assert_eq!(output.engine, "node-http");
        assert_eq!(output.evidence[0].facts.get("transport"), Some(&json!("http")));
        assert_eq!(output.evidence[0].facts.get("framingPolicyPresent"), Some(&json!(false)));
        let ids: Vec<&str> = output.rules.iter().map(|r| r.rule_id.as_str()).collect();
        assert_eq!(ids, vec!["http.framing"]);
        assert_eq!(output.rules[0].severity, Severity::Info);
    }

    #[test]
    fn http_redirect_is_not_conclusive_and_adds_gap() {
        let observation = HttpObservation {
            status_code: 301,
            secure: true,
            hsts: Some("max-age=60"),
            content_type_options: Some("nosniff"),
            frame_options: Some("SAMEORIGIN"),
            content_security_policy: None,
        };
        let output = evaluate_http_response("example.test", 443, &observation);
        assert!(!output.conclusive);
        assert!(output.rules.is_empty());
        assert_eq!(output.evidence[0].facts.get("redirectObserved"), Some(&json!(true)));
        assert_eq!(
            output.coverage_gaps,
            vec![
                GAP_GATEWAY_OBSERVATION.to_owned(),
                GAP_HTTP_SCOPE.to_owned(),
                GAP_HTTP_REDIRECT.to_owned()
            ]
        );
    }

    #[test]
    fn http_server_error_is_not_conclusive_and_suppresses_rules() {
        let observation = HttpObservation {
            status_code: 500,
            secure: true,
            hsts: None,
            content_type_options: None,
            frame_options: None,
            content_security_policy: None,
        };
        let output = evaluate_http_response("example.test", 443, &observation);
        assert!(!output.conclusive);
        assert!(output.rules.is_empty());
        assert_eq!(output.evidence[0].facts.get("redirectObserved"), Some(&json!(false)));
        assert_eq!(output.coverage_gaps.len(), 2);
    }

    #[test]
    fn ssh_identification_line_parsing_rules() {
        assert_eq!(
            parse_ssh_identification_line("SSH-2.0-OpenSSH_9.6"),
            Some(SshIdentification {
                protocol: "2.0".to_owned(),
                software_identifier: "OpenSSH_9.6".to_owned()
            })
        );
        assert_eq!(
            parse_ssh_identification_line("SSH-1.99-dropbear_2020.81\r"),
            Some(SshIdentification {
                protocol: "1.99".to_owned(),
                software_identifier: "dropbear_2020.81".to_owned()
            })
        );
        assert_eq!(
            parse_ssh_identification_line("SSH-1.5-OLD ssh"),
            Some(SshIdentification {
                protocol: "1.5".to_owned(),
                software_identifier: "OLD".to_owned()
            })
        );
        // unsupported protocol version
        assert_eq!(parse_ssh_identification_line("SSH-3.0-other"), None);
        // software identifier without terminator consumes the rest of the line
        assert_eq!(
            parse_ssh_identification_line("SSH-2.0-with space"),
            Some(SshIdentification {
                protocol: "2.0".to_owned(),
                software_identifier: "with".to_owned()
            })
        );
        // software identifier capped at 64 characters
        let long = "A".repeat(65);
        assert_eq!(parse_ssh_identification_line(&format!("SSH-2.0-{long}")), None);
        let boundary = "A".repeat(64);
        assert_eq!(
            parse_ssh_identification_line(&format!("SSH-2.0-{boundary}")),
            Some(SshIdentification {
                protocol: "2.0".to_owned(),
                software_identifier: boundary
            })
        );
        // a bare prefix without a trailing space or line end does not match
        let truncated = format!("SSH-2.0-{}", "a".repeat(64));
        assert!(parse_ssh_identification_line(&truncated).is_some());
        assert_eq!(parse_ssh_identification_line("SSH-2.0-"), None);
        assert_eq!(parse_ssh_identification_line("nope"), None);
    }

    #[test]
    fn ssh_identification_uses_only_complete_lines_and_first_match() {
        assert_eq!(parse_ssh_identification("SSH-2.0-OpenSSH_9.6"), None);
        assert_eq!(
            parse_ssh_identification("SSH-2.0-OpenSSH_9.6\r\n")
                .map(|found| found.software_identifier),
            Some("OpenSSH_9.6".to_owned())
        );
        assert_eq!(
            parse_ssh_identification("banner\nSSH-1.99-one\nSSH-2.0-two\n")
                .map(|found| found.protocol),
            Some("1.99".to_owned())
        );
        assert_eq!(parse_ssh_identification("banner\nno match\n"), None);
        assert_eq!(parse_ssh_identification(""), None);
    }

    #[test]
    fn ssh_evaluation_legacy_and_modern_branches() {
        let legacy = evaluate_ssh_identification(
            "10.0.0.5",
            22,
            &SshIdentification {
                protocol: "1.99".to_owned(),
                software_identifier: "dropbear".to_owned(),
            },
        );
        assert_eq!(legacy.engine, "node-net-ssh-identification");
        assert!(legacy.conclusive);
        assert_eq!(legacy.rules.len(), 1);
        assert_eq!(legacy.rules[0].rule_id, "ssh.legacy-identification");
        assert_eq!(legacy.rules[0].severity, Severity::Medium);
        assert_eq!(
            legacy.rules[0].title,
            "SSH server advertises a legacy-compatible protocol"
        );
        assert_eq!(
            legacy.evidence[0].summary,
            "SSH identification observed; no authentication attempted"
        );
        assert_eq!(legacy.evidence[0].facts.get("protocol"), Some(&json!("1.99")));
        assert_eq!(legacy.evidence[0].facts.get("authenticationAttempted"), Some(&json!(false)));
        assert_eq!(
            legacy.coverage_gaps,
            vec![GAP_GATEWAY_OBSERVATION.to_owned(), GAP_SSH_SCOPE.to_owned()]
        );

        let modern = evaluate_ssh_identification(
            "10.0.0.5",
            22,
            &SshIdentification {
                protocol: "2.0".to_owned(),
                software_identifier: "OpenSSH_9.6".to_owned(),
            },
        );
        assert!(modern.rules.is_empty());
        assert!(modern.conclusive);
    }

    #[test]
    fn tls_expired_beats_expiring_and_ordering_is_stable() {
        let now = 1_700_000_000_000i64;
        let observation = TlsObservation {
            has_certificate: true,
            negotiated_protocol: Some("TLSv1.3"),
            authorized: false,
            identity_matches: false,
            valid_from_ms: Some(now - 200 * 86400 * 1000),
            valid_to_ms: Some(now - 1000),
            fingerprint256: Some("AA:BB"),
            now_ms: now,
        };
        let output = evaluate_tls_certificate("example.test", 443, &observation);
        assert_eq!(output.engine, "node-tls");
        assert!(output.conclusive);
        let ids: Vec<&str> = output.rules.iter().map(|r| r.rule_id.as_str()).collect();
        assert_eq!(ids, vec!["tls.expired", "tls.gateway-trust", "tls.identity"]);
        assert_eq!(output.rules[0].severity, Severity::High);
        assert_eq!(output.rules[0].title, "TLS certificate is expired");
        assert_eq!(output.rules[1].severity, Severity::Medium);
        assert_eq!(
            output.rules[1].title,
            "Certificate chain is not trusted by this gateway"
        );
        assert_eq!(
            output.rules[2].title,
            "Certificate identity does not match the checked name"
        );
        assert_eq!(output.evidence[0].facts.get("expired"), Some(&json!(true)));
        assert_eq!(output.evidence[0].facts.get("expiringSoon"), Some(&json!(false)));
        assert_eq!(output.evidence[0].facts.get("fingerprint256"), Some(&json!("AA:BB")));
        assert_eq!(output.evidence[0].facts.get("negotiatedProtocol"), Some(&json!("TLSv1.3")));
        assert_eq!(
            output.coverage_gaps,
            vec![GAP_GATEWAY_OBSERVATION.to_owned(), GAP_TLS_SCOPE.to_owned()]
        );
    }

    #[test]
    fn tls_expiring_soon_and_not_yet_valid() {
        let now = 1_700_000_000_000i64;
        let observation = TlsObservation {
            has_certificate: true,
            negotiated_protocol: Some("TLSv1.2"),
            authorized: true,
            identity_matches: true,
            valid_from_ms: Some(now + 86400 * 1000),
            valid_to_ms: Some(now + 10 * 86400 * 1000),
            fingerprint256: None,
            now_ms: now,
        };
        let output = evaluate_tls_certificate("example.test", 443, &observation);
        let ids: Vec<&str> = output.rules.iter().map(|r| r.rule_id.as_str()).collect();
        assert_eq!(ids, vec!["tls.expiring", "tls.not-yet-valid"]);
        assert_eq!(output.rules[0].severity, Severity::Low);
        assert_eq!(output.rules[0].title, "TLS certificate expires within 30 days");
        assert_eq!(output.rules[1].severity, Severity::Medium);
        assert_eq!(output.rules[1].title, "TLS certificate is not yet valid");
        assert_eq!(output.evidence[0].facts.get("expiringSoon"), Some(&json!(true)));
        assert_eq!(output.evidence[0].facts.get("notYetValid"), Some(&json!(true)));
        assert_eq!(output.evidence[0].facts.get("fingerprint256"), Some(&json!(null)));
    }

    #[test]
    fn tls_boundary_of_thirty_day_window_does_not_expire_soon() {
        let now = 1_700_000_000_000i64;
        let boundary = TlsObservation {
            has_certificate: true,
            negotiated_protocol: Some("TLSv1.3"),
            authorized: true,
            identity_matches: true,
            valid_from_ms: Some(now - 1000),
            valid_to_ms: Some(now + THIRTY_DAYS_MS),
            fingerprint256: None,
            now_ms: now,
        };
        let output = evaluate_tls_certificate("example.test", 443, &boundary);
        assert!(output.rules.is_empty());
        assert_eq!(output.evidence[0].facts.get("expiringSoon"), Some(&json!(false)));
        assert!(output.conclusive);
    }

    #[test]
    fn tls_unparseable_dates_follow_the_nan_branch() {
        let now = 1_700_000_000_000i64;
        let observation = TlsObservation {
            has_certificate: true,
            negotiated_protocol: Some("TLSv1.3"),
            authorized: true,
            identity_matches: true,
            valid_from_ms: None,
            valid_to_ms: None,
            fingerprint256: Some("CC"),
            now_ms: now,
        };
        let output = evaluate_tls_certificate("example.test", 443, &observation);
        assert!(!output.conclusive);
        assert!(output.rules.is_empty());
        assert_eq!(output.evidence[0].facts.get("validFrom"), Some(&json!(null)));
        assert_eq!(output.evidence[0].facts.get("validTo"), Some(&json!(null)));
        assert_eq!(output.evidence[0].facts.get("expired"), Some(&json!(false)));
        assert_eq!(output.evidence[0].facts.get("notYetValid"), Some(&json!(false)));
        assert_eq!(output.evidence[0].facts.get("expiringSoon"), Some(&json!(false)));
    }

    #[test]
    fn tls_valid_dates_render_as_iso_strings() {
        let now = 1_700_000_000_000i64;
        let observation = TlsObservation {
            has_certificate: true,
            negotiated_protocol: Some("TLSv1.3"),
            authorized: true,
            identity_matches: true,
            valid_from_ms: Some(0),
            valid_to_ms: Some(now + 400 * 86400 * 1000),
            fingerprint256: None,
            now_ms: now,
        };
        let output = evaluate_tls_certificate("example.test", 443, &observation);
        assert_eq!(
            output.evidence[0].facts.get("validFrom"),
            Some(&json!("1970-01-01T00:00:00.000Z"))
        );
        assert_eq!(
            output.evidence[0].facts.get("validTo"),
            Some(&json!("2024-12-18T22:13:20.000Z"))
        );
    }

    #[test]
    fn check_tls_is_fail_closed() {
        let runtime = tokio::runtime::Builder::new_current_thread().enable_all().build();
        let Ok(runtime) = runtime else { return };
        let output = runtime.block_on(check_tls("example.test", 443, None, &Cancellation::new()));
        assert_eq!(output.engine, "node-tls");
        assert!(!output.conclusive);
        assert!(output.evidence.is_empty());
        assert!(output.rules.is_empty());
        assert_eq!(
            output.coverage_gaps,
            vec![
                GAP_GATEWAY_OBSERVATION.to_owned(),
                CHECK_TLS_UNAVAILABLE_GAP.to_owned()
            ]
        );
    }

    #[tokio::test]
    async fn check_ssh_reads_local_identification() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.expect("bind");
        let port = listener.local_addr().expect("addr").port();
        tokio::spawn(async move {
            if let Ok((mut socket, _)) = listener.accept().await {
                let _ = socket.write_all(b"SSH-2.0-OpenSSH_9.6\r\n").await;
                let mut request = [0u8; 64];
                let _ = socket.read(&mut request).await;
            }
        });
        let output = check_ssh("127.0.0.1", port, &Cancellation::new()).await;
        assert!(output.conclusive);
        assert!(output.rules.is_empty());
        assert_eq!(
            output.evidence[0].facts.get("softwareIdentifier"),
            Some(&json!("OpenSSH_9.6"))
        );
        assert_eq!(output.evidence[0].facts.get("protocol"), Some(&json!("2.0")));
    }

    #[tokio::test]
    async fn check_ssh_reports_closed_port() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.expect("bind");
        let port = listener.local_addr().expect("addr").port();
        drop(listener);
        let output = check_ssh("127.0.0.1", port, &Cancellation::new()).await;
        assert!(!output.conclusive);
        assert_eq!(
            output.coverage_gaps,
            vec![GAP_GATEWAY_OBSERVATION.to_owned(), GAP_SSH_FAILED.to_owned()]
        );
    }

    #[tokio::test]
    async fn check_ssh_honours_preexisting_cancellation() {
        let cancellation = Cancellation::new();
        cancellation.cancel();
        let output = check_ssh("127.0.0.1", 9, &cancellation).await;
        assert_eq!(output.coverage_gaps, vec![GAP_GATEWAY_OBSERVATION.to_owned()]);
        assert!(!output.conclusive);
    }
}
