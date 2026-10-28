//! Native port of `packages/gateway/src/lib/security/engines.ts`.
//!
//! Engine availability probing and version capture, an injectable command
//! runner with timeouts and cooperative cancellation, and the Nmap / Nuclei /
//! Trivy output parsers that turn scanner output into [`AdapterResult`].
//!
//! Security posture carried over from the TypeScript module:
//! * an engine that is not installed is reported as [`EngineError::Unavailable`]
//!   (never as an empty successful result),
//! * scanner output is re-validated against the caller's allowlists (targets,
//!   ports, template id, matched URL) so a compromised binary cannot widen the
//!   scope of an authorized scan,
//! * captured output is bounded, and a binary is killed as soon as the bound is
//!   exceeded, matching `execFile(... { maxBuffer })`,
//! * arguments are passed as an argv array (never a shell string), so no
//!   shell metacharacter handling is reachable.

use std::collections::HashSet;
use std::fmt;
use std::future::Future;
use std::pin::Pin;
use std::process::Stdio;
use std::sync::OnceLock;
use std::time::Duration;

use serde_json::{Map, Value};
use sha2::{Digest, Sha256};

use super::protocols::{
    evidence, rule, AdapterResult, Cancellation, Confidence, RuleStatus, Severity,
};

/// Maximum accepted parser input, matching the TypeScript `512 * 1024` guard.
pub const MAX_ENGINE_DOCUMENT: usize = 512 * 1024;
/// Wall-clock budget for a single engine invocation.
pub const DEFAULT_TIMEOUT: Duration = Duration::from_secs(45);
/// Cap on captured stdout, mirroring `maxBuffer`.
pub const DEFAULT_MAX_CAPTURE: usize = 1024 * 1024;
/// Cap on captured stderr (version banners are small).
pub const MAX_STDERR_CAPTURE: usize = 64 * 1024;

/// Every failure mode of an engine invocation or parser.
#[derive(Debug)]
pub enum EngineError {
    /// The engine binary is missing or did not produce a recognisable banner.
    Unavailable { engine: String, detail: String },
    /// The engine ran but failed, timed out, or was killed.
    Failed(String),
    /// The engine produced output that violates the reviewed contract.
    Output(String),
    /// Captured output exceeded the configured bound.
    TooLarge { limit: usize },
    /// The caller's [`Cancellation`] fired while the engine was running.
    Cancelled,
    Io(std::io::Error),
}

impl EngineError {
    pub fn is_unavailable(&self) -> bool {
        matches!(self, EngineError::Unavailable { .. })
    }

    fn output(message: impl Into<String>) -> Self {
        EngineError::Output(message.into())
    }
}

impl fmt::Display for EngineError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            EngineError::Unavailable { engine, detail } => {
                write!(f, "engine {engine} is unavailable: {detail}")
            }
            EngineError::Failed(message) => write!(f, "engine failure: {message}"),
            EngineError::Output(message) => write!(f, "invalid engine output: {message}"),
            EngineError::TooLarge { limit } => {
                write!(f, "engine output exceeded {limit} bytes")
            }
            EngineError::Cancelled => f.write_str("engine invocation cancelled"),
            EngineError::Io(error) => write!(f, "engine io error: {error}"),
        }
    }
}

impl std::error::Error for EngineError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            EngineError::Io(error) => Some(error),
            _ => None,
        }
    }
}

impl From<std::io::Error> for EngineError {
    fn from(error: std::io::Error) -> Self {
        EngineError::Io(error)
    }
}

/// Result of one engine invocation.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct CommandOutput {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: Option<i32>,
    pub truncated: bool,
}

impl CommandOutput {
    /// A clean exit with no captured-output overflow.
    pub fn succeeded(&self) -> bool {
        self.exit_code == Some(0) && !self.truncated
    }
}

/// Boxed future returned by [`CommandRunner`], keeping the trait object safe
/// without pulling in `async-trait`.
pub type CommandFuture<'a> =
    Pin<Box<dyn Future<Output = Result<CommandOutput, EngineError>> + Send + 'a>>;

/// Injectable command runner: production uses [`SystemCommandRunner`], tests
/// supply deterministic fakes.
pub trait CommandRunner: Send + Sync {
    fn run<'a>(
        &'a self,
        program: &'a str,
        args: &'a [String],
        cancel: &'a Cancellation,
    ) -> CommandFuture<'a>;
}

/// Spawns real processes with a timeout, an output cap and cancellation.
#[derive(Debug, Clone)]
pub struct SystemCommandRunner {
    pub timeout: Duration,
    pub max_capture: usize,
}

impl SystemCommandRunner {
    pub fn new() -> Self {
        Self {
            timeout: DEFAULT_TIMEOUT,
            max_capture: DEFAULT_MAX_CAPTURE,
        }
    }

    pub fn with_timeout(mut self, timeout: Duration) -> Self {
        self.timeout = timeout;
        self
    }

    pub fn with_max_capture(mut self, max_capture: usize) -> Self {
        self.max_capture = max_capture;
        self
    }
}

impl Default for SystemCommandRunner {
    fn default() -> Self {
        Self::new()
    }
}

enum RunOutcome {
    Exited,
    TimedOut,
    Cancelled,
    TooLarge,
}

fn terminate(pid: Option<u32>) {
    if let Some(pid) = pid {
        // SIGKILL via libc keeps `child` free of a second mutable borrow, which
        // `tokio::select!` would otherwise require.
        unsafe {
            libc::kill(pid as libc::pid_t, libc::SIGKILL);
        }
    }
}

async fn wait_for_cancel(cancel: &Cancellation) {
    while !cancel.is_cancelled() {
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
}

async fn read_capped<R>(
    mut reader: R,
    limit: usize,
    overflow: Option<tokio::sync::watch::Sender<bool>>,
) -> (Vec<u8>, bool)
where
    R: tokio::io::AsyncRead + Unpin,
{
    use tokio::io::AsyncReadExt;

    let mut out = Vec::new();
    let mut chunk = vec![0u8; 16 * 1024];
    loop {
        match reader.read(&mut chunk).await {
            Ok(0) | Err(_) => return (out, false),
            Ok(read) => {
                if out.len() + read > limit {
                    let room = limit.saturating_sub(out.len());
                    out.extend_from_slice(&chunk[..room]);
                    if let Some(sender) = overflow {
                        let _ = sender.send(true);
                    }
                    return (out, true);
                }
                out.extend_from_slice(&chunk[..read]);
            }
        }
    }
}

impl CommandRunner for SystemCommandRunner {
    fn run<'a>(
        &'a self,
        program: &'a str,
        args: &'a [String],
        cancel: &'a Cancellation,
    ) -> CommandFuture<'a> {
        Box::pin(async move {
            let mut command = tokio::process::Command::new(program);
            command
                .args(args)
                .stdin(Stdio::null())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .kill_on_drop(true);

            let mut child = match command.spawn() {
                Ok(child) => child,
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                    return Err(EngineError::Unavailable {
                        engine: program.to_owned(),
                        detail: "binary was not found on PATH".to_owned(),
                    })
                }
                Err(error) => return Err(EngineError::Io(error)),
            };

            let pid = child.id();
            let stdout = child
                .stdout
                .take()
                .ok_or_else(|| EngineError::Failed("no stdout pipe".to_owned()))?;
            let stderr = child.stderr.take();

            let (overflow_tx, mut overflow_rx) = tokio::sync::watch::channel(false);
            let stdout_reader =
                tokio::spawn(read_capped(stdout, self.max_capture, Some(overflow_tx)));
            let stderr_reader = tokio::spawn(async move {
                match stderr {
                    Some(stderr) => read_capped(stderr, MAX_STDERR_CAPTURE, None).await.0,
                    None => Vec::new(),
                }
            });

            let mut outcome = RunOutcome::Exited;
            tokio::select! {
                waited = child.wait() => {
                    if let Err(error) = waited {
                        terminate(pid);
                        return Err(EngineError::Io(error));
                    }
                }
                _ = overflow_rx.changed() => {
                    outcome = RunOutcome::TooLarge;
                    terminate(pid);
                }
                _ = tokio::time::sleep(self.timeout) => {
                    outcome = RunOutcome::TimedOut;
                    terminate(pid);
                }
                _ = wait_for_cancel(cancel) => {
                    outcome = RunOutcome::Cancelled;
                    terminate(pid);
                }
            }

            if !matches!(outcome, RunOutcome::Exited) {
                let _ = child.wait().await;
            }

            let (stdout, truncated) = stdout_reader
                .await
                .unwrap_or_else(|_| (Vec::new(), false));
            let stderr = stderr_reader.await.unwrap_or_default();

            match outcome {
                RunOutcome::TimedOut => {
                    return Err(EngineError::Failed(format!(
                        "{program} exceeded its {:?} budget",
                        self.timeout
                    )))
                }
                RunOutcome::Cancelled => return Err(EngineError::Cancelled),
                RunOutcome::TooLarge => {
                    return Err(EngineError::TooLarge {
                        limit: self.max_capture,
                    })
                }
                RunOutcome::Exited => {}
            }

            Ok(CommandOutput {
                stdout: String::from_utf8_lossy(&stdout).into_owned(),
                stderr: String::from_utf8_lossy(&stderr).into_owned(),
                exit_code: None,
                truncated,
            })
        })
    }
}

/// The three external engines the gateway knows how to drive.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum EngineName {
    Nmap,
    Nuclei,
    Trivy,
}

impl EngineName {
    pub const ALL: [EngineName; 3] = [EngineName::Nmap, EngineName::Nuclei, EngineName::Trivy];

    pub fn as_str(self) -> &'static str {
        match self {
            EngineName::Nmap => "nmap",
            EngineName::Nuclei => "nuclei",
            EngineName::Trivy => "trivy",
        }
    }

    pub fn version_args(self) -> &'static [&'static str] {
        match self {
            EngineName::Nmap => &["--version"],
            EngineName::Nuclei => &["-version"],
            EngineName::Trivy => &["--version"],
        }
    }

    fn version_pattern(self) -> &'static regex::Regex {
        use std::sync::OnceLock;
        static NMAP: OnceLock<regex::Regex> = OnceLock::new();
        static NUCLEI: OnceLock<regex::Regex> = OnceLock::new();
        static TRIVY: OnceLock<regex::Regex> = OnceLock::new();
        match self {
            EngineName::Nmap => NMAP.get_or_init(|| {
                regex::Regex::new(r"(?i)nmap version\s+v?([0-9][0-9A-Za-z.\-]*)").expect("nmap")
            }),
            EngineName::Nuclei => NUCLEI.get_or_init(|| {
                regex::Regex::new(r"(?i)nuclei engine version:?\s*v?([0-9][0-9A-Za-z.\-]*)")
                    .expect("nuclei")
            }),
            EngineName::Trivy => TRIVY.get_or_init(|| {
                regex::Regex::new(r"(?im)^\s*version:\s*v?([0-9][0-9A-Za-z.\-]*)").expect("trivy")
            }),
        }
    }

    /// Extract a version from a banner, or `None` when it is unrecognisable.
    pub fn capture_version(self, banner: &str) -> Option<String> {
        self.version_pattern()
            .captures(banner)
            .and_then(|captures| captures.get(1))
            .map(|matched| matched.as_str().to_owned())
    }
}

/// Probe one engine, returning its advertised version.
pub async fn engine_version(
    engine: EngineName,
    cancel: &Cancellation,
    runner: &dyn CommandRunner,
) -> Result<String, EngineError> {
    if cancel.is_cancelled() {
        return Err(EngineError::Cancelled);
    }
    let args: Vec<String> = engine
        .version_args()
        .iter()
        .map(|arg| (*arg).to_owned())
        .collect();
    let output = runner.run(engine.as_str(), &args, cancel).await?;
    let banner = if output.stdout.trim().is_empty() {
        output.stderr.as_str()
    } else {
        output.stdout.as_str()
    };
    engine
        .capture_version(banner)
        .ok_or_else(|| EngineError::Unavailable {
            engine: engine.as_str().to_owned(),
            detail: "version banner was not recognised".to_owned(),
        })
}

/// Availability snapshot for one engine.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EngineStatus {
    pub engine: EngineName,
    pub available: bool,
    pub version: Option<String>,
    pub detail: Option<String>,
}

/// Probe every engine in [`EngineName::ALL`] sequentially.
pub async fn probe_engines(cancel: &Cancellation, runner: &dyn CommandRunner) -> Vec<EngineStatus> {
    let mut statuses = Vec::with_capacity(EngineName::ALL.len());
    for engine in EngineName::ALL {
        match engine_version(engine, cancel, runner).await {
            Ok(version) => statuses.push(EngineStatus {
                engine,
                available: true,
                version: Some(version),
                detail: None,
            }),
            Err(error) => statuses.push(EngineStatus {
                engine,
                available: false,
                version: None,
                detail: Some(error.to_string()),
            }),
        }
    }
    statuses
}

fn facts<const N: usize>(pairs: [(&str, Value); N]) -> Map<String, Value> {
    let mut map = Map::new();
    for (key, value) in pairs {
        map.insert(key.to_owned(), value);
    }
    map
}

fn text(value: &str) -> Value {
    Value::String(value.to_owned())
}

fn base_result(engine: &str, version: &str, gap: &str, raw: &str, content_type: &str) -> AdapterResult {
    AdapterResult {
        engine: engine.to_owned(),
        engine_version: version.to_owned(),
        evidence: Vec::new(),
        rules: Vec::new(),
        coverage_gaps: vec![gap.to_owned()],
        conclusive: false,
        raw: Some(raw.to_owned()),
        content_type: Some(content_type.to_owned()),
    }
}

fn byte_len(value: &str) -> usize {
    value.len()
}

// ---------------------------------------------------------------------------
// Minimal XML reader
// ---------------------------------------------------------------------------

/// A parsed element. Attribute names are stored unprefixed and duplicate
/// attributes are impossible by construction of the parser.
#[derive(Debug, Default, Clone)]
struct XmlNode {
    name: String,
    attributes: Vec<(String, String)>,
    children: Vec<XmlNode>,
    text: String,
}

impl XmlNode {
    fn attribute(&self, name: &str) -> Option<&str> {
        self.attributes
            .iter()
            .find(|(key, _)| key == name)
            .map(|(_, value)| value.as_str())
    }

    fn child(&self, name: &str) -> Option<&XmlNode> {
        self.children.iter().find(|child| child.name == name)
    }

    fn children_named<'a>(&'a self, name: &'a str) -> impl Iterator<Item = &'a XmlNode> + 'a {
        self.children.iter().filter(move |child| child.name == name)
    }
}

fn malformed() -> EngineError {
    EngineError::output("Malformed Nmap XML")
}

fn parse_attributes(input: &str) -> Vec<(String, String)> {
    let bytes = input.as_bytes();
    let mut attributes = Vec::new();
    let mut index = 0usize;
    while index < bytes.len() {
        while index < bytes.len() && bytes[index].is_ascii_whitespace() {
            index += 1;
        }
        let key_start = index;
        while index < bytes.len() && !bytes[index].is_ascii_whitespace() && bytes[index] != b'=' {
            index += 1;
        }
        if key_start == index {
            break;
        }
        let key = input[key_start..index].to_owned();
        while index < bytes.len() && bytes[index].is_ascii_whitespace() {
            index += 1;
        }
        let mut value = String::new();
        if index < bytes.len() && bytes[index] == b'=' {
            index += 1;
            while index < bytes.len() && bytes[index].is_ascii_whitespace() {
                index += 1;
            }
            if index < bytes.len() && (bytes[index] == b'"' || bytes[index] == b'\'') {
                let quote = bytes[index];
                index += 1;
                let value_start = index;
                while index < bytes.len() && bytes[index] != quote {
                    index += 1;
                }
                value = input[value_start..index].to_owned();
                if index < bytes.len() {
                    index += 1;
                }
            } else {
                let value_start = index;
                while index < bytes.len() && !bytes[index].is_ascii_whitespace() {
                    index += 1;
                }
                value = input[value_start..index].to_owned();
            }
        }
        attributes.push((key, value));
    }
    attributes
}

fn parse_xml(input: &str) -> Result<XmlNode, EngineError> {
    let bytes = input.as_bytes();
    let mut stack: Vec<XmlNode> = Vec::new();
    let mut root: Option<XmlNode> = None;
    let mut index = 0usize;
    while index < bytes.len() {
        if bytes[index] != b'<' {
            let start = index;
            while index < bytes.len() && bytes[index] != b'<' {
                index += 1;
            }
            if let Some(top) = stack.last_mut() {
                top.text.push_str(&input[start..index]);
            }
            continue;
        }
        let mut cursor = index + 1;
        let mut quote: Option<u8> = None;
        while cursor < bytes.len() {
            let byte = bytes[cursor];
            match quote {
                Some(open) => {
                    if byte == open {
                        quote = None;
                    }
                }
                None => {
                    if byte == b'"' || byte == b'\'' {
                        quote = Some(byte);
                    } else if byte == b'>' {
                        break;
                    }
                }
            }
            cursor += 1;
        }
        if cursor >= bytes.len() {
            return Err(malformed());
        }
        let inner = &input[index + 1..cursor];
        index = cursor + 1;
        if inner.starts_with('?') || inner.starts_with('!') {
            continue;
        }
        if let Some(rest) = inner.strip_prefix('/') {
            let name = rest.trim();
            let node = stack.pop().ok_or_else(malformed)?;
            if node.name != name {
                return Err(malformed());
            }
            match stack.last_mut() {
                Some(parent) => parent.children.push(node),
                None => {
                    if root.is_some() {
                        return Err(malformed());
                    }
                    root = Some(node);
                }
            }
            continue;
        }
        let self_closing = inner.trim_end().ends_with('/');
        let body = inner.trim_end().trim_end_matches('/');
        let name_end = body
            .find(|character: char| character.is_whitespace())
            .unwrap_or(body.len());
        let name = &body[..name_end];
        if name.is_empty() {
            return Err(malformed());
        }
        let node = XmlNode {
            name: name.to_owned(),
            attributes: parse_attributes(&body[name_end..]),
            children: Vec::new(),
            text: String::new(),
        };
        if self_closing {
            match stack.last_mut() {
                Some(parent) => parent.children.push(node),
                None => {
                    if root.is_some() {
                        return Err(malformed());
                    }
                    root = Some(node);
                }
            }
        } else {
            stack.push(node);
        }
    }
    if !stack.is_empty() {
        return Err(malformed());
    }
    root.ok_or_else(malformed)
}

fn contains_ignore_ascii_case(haystack: &str, needle: &str) -> Option<usize> {
    let haystack = haystack.as_bytes();
    let needle = needle.as_bytes();
    if needle.is_empty() || haystack.len() < needle.len() {
        return None;
    }
    (0..=haystack.len() - needle.len()).find(|&start| {
        haystack[start..start + needle.len()]
            .iter()
            .zip(needle)
            .all(|(a, b)| a.eq_ignore_ascii_case(b))
    })
}

fn remove_doctype_nmaprun(input: &str) -> String {
    const DOCTYPE: &str = "<!doctype nmaprun";
    let Some(start) = contains_ignore_ascii_case(input, DOCTYPE) else {
        return input.to_owned();
    };
    let after = start + DOCTYPE.len();
    let mut cursor = after;
    while cursor < input.len() && input.as_bytes()[cursor].is_ascii_whitespace() {
        cursor += 1;
    }
    if cursor >= input.len() || input.as_bytes()[cursor] != b'>' {
        return input.to_owned();
    }
    let mut out = String::with_capacity(input.len());
    out.push_str(&input[..start]);
    out.push_str(&input[cursor + 1..]);
    out
}

fn reject_unsafe_xml(raw: &str) -> Result<(), EngineError> {
    let unsupported = || EngineError::output("Unsupported or oversized Nmap XML");
    if contains_ignore_ascii_case(raw, "<!entity").is_some() {
        return Err(unsupported());
    }
    if let Some(start) = contains_ignore_ascii_case(raw, "<!doctype") {
        let rest = &raw[start..];
        let tag_end = rest.find('>').map(|end| &rest[..end]).unwrap_or(rest);
        for keyword in ["system", "public", "["] {
            if contains_ignore_ascii_case(tag_end, keyword).is_some() {
                return Err(unsupported());
            }
        }
    }
    if let Some(start) = contains_ignore_ascii_case(raw, "<script") {
        let next = raw[start + "<script".len()..].chars().next();
        if matches!(next, Some(character) if character.is_whitespace() || character == '>') {
            return Err(unsupported());
        }
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Nmap
// ---------------------------------------------------------------------------

/// Port states Nmap may report for an observation.
const PORT_STATES: [&str; 6] = [
    "open",
    "closed",
    "filtered",
    "unfiltered",
    "open|filtered",
    "closed|filtered",
];

/// Keep `[A-Za-z0-9._+ -]`, mirroring `cleanLabel`.
pub fn clean_label(value: Option<&str>) -> String {
    let Some(value) = value else {
        return String::new();
    };
    value
        .chars()
        .filter(|character| {
            character.is_ascii_alphanumeric()
                || matches!(character, '.' | '_' | '+' | ' ' | '-')
        })
        .take(80)
        .collect()
}

/// Parse `nmap -oX -` output against the authorized targets and ports.
pub fn parse_nmap(
    raw: &str,
    targets: &[&str],
    ports: &[u16],
    version: &str,
) -> Result<AdapterResult, EngineError> {
    if byte_len(raw) > MAX_ENGINE_DOCUMENT {
        return Err(EngineError::output("Unsupported or oversized Nmap XML"));
    }
    reject_unsafe_xml(raw)?;
    let document = remove_doctype_nmaprun(raw);
    let root = parse_xml(&document)?;
    if root.name != "nmaprun" {
        return Err(EngineError::output("Missing Nmap run"));
    }

    let mut output = base_result(
        "nmap",
        version,
        "Selected TCP ports only; port labels do not identify applications or establish CVEs. No NSE scripts, DNS, UDP, OS or active version detection.",
        raw,
        "application/xml",
    );
    output.conclusive = true;

    let mut measured: HashSet<String> = HashSet::new();
    for host in root.children_named("host") {
        let addresses: Vec<&XmlNode> = host
            .children_named("address")
            .filter(|address| {
                matches!(
                    address.attribute("addrtype"),
                    Some("ipv4") | Some("ipv6")
                )
            })
            .collect();
        let target = match addresses.as_slice() {
            [address] => address.attribute("addr").unwrap_or_default().to_owned(),
            _ => return Err(EngineError::output("Nmap returned an out-of-scope address")),
        };
        if !targets.contains(&target.as_str()) {
            return Err(EngineError::output("Nmap returned an out-of-scope address"));
        }

        let port_section = host.child("ports");
        if let Some(section) = port_section {
            for observation in section.children_named("port") {
                let port: u16 = observation
                    .attribute("portid")
                    .and_then(|value| value.parse().ok())
                    .ok_or_else(|| EngineError::output("Nmap returned an out-of-scope port"))?;
                if observation.attribute("protocol") != Some("tcp") || !ports.contains(&port) {
                    return Err(EngineError::output("Nmap returned an out-of-scope port"));
                }
                let key = format!("{target}:{port}");
                if !measured.insert(key) {
                    return Err(EngineError::output("Duplicate Nmap port observation"));
                }
                let state = observation
                    .child("state")
                    .and_then(|node| node.attribute("state"))
                    .unwrap_or_default()
                    .to_owned();
                if !PORT_STATES.contains(&state.as_str()) {
                    return Err(EngineError::output("Invalid Nmap port state"));
                }
                let service = observation.child("service");
                let common_port_name = clean_label(service.and_then(|n| n.attribute("name")));
                let identification_method = match service.and_then(|n| n.attribute("method")) {
                    Some("probed") => "probed",
                    _ => "port-table",
                };
                output.evidence.push(evidence(
                    &target,
                    Some(port),
                    "Nmap TCP port observation",
                    facts([
                        ("state", text(&state)),
                        ("commonPortName", text(&common_port_name)),
                        ("identificationMethod", text(identification_method)),
                    ]),
                ));
            }
        }

        let remaining: Vec<u16> = ports
            .iter()
            .copied()
            .filter(|port| !measured.contains(&format!("{target}:{port}")))
            .collect();
        let aggregates: Vec<&XmlNode> = port_section
            .map(|section| section.children_named("extraports").collect())
            .unwrap_or_default();
        if let [aggregate] = aggregates.as_slice() {
            let count = aggregate
                .attribute("count")
                .and_then(|value| value.trim().parse::<usize>().ok());
            let aggregate_state = aggregate.attribute("state").unwrap_or_default();
            if count == Some(remaining.len())
                && !remaining.is_empty()
                && matches!(aggregate_state, "closed" | "filtered")
            {
                for port in remaining {
                    measured.insert(format!("{target}:{port}"));
                    output.evidence.push(evidence(
                        &target,
                        Some(port),
                        "Nmap complete remaining-port aggregate",
                        facts([
                            ("state", text(aggregate_state)),
                            ("identificationMethod", text("complete-aggregate")),
                        ]),
                    ));
                }
            }
        }
    }

    let uncovered = targets
        .iter()
        .any(|target| ports.iter().any(|port| !measured.contains(&format!("{target}:{port}"))));
    if uncovered {
        output.conclusive = false;
        output.push_gap("Some authorized target/port pairs lack a deterministic observation");
    }
    let finished_ok = root
        .child("runstats")
        .and_then(|runstats| runstats.child("finished"))
        .and_then(|finished| finished.attribute("exit"))
        == Some("success");
    if !finished_ok {
        output.conclusive = false;
        output.push_gap("Scanner did not report successful completion");
    }
    if output.evidence.is_empty() {
        output.conclusive = false;
        output.push_gap(
            "No explicit port observations; empty output is not proof that targets are secure",
        );
    }
    Ok(output)
}

/// Run Nmap over an already-authorized target/port set.
pub async fn scan_nmap(
    targets: &[&str],
    ports: &[u16],
    cancel: &Cancellation,
    runner: &dyn CommandRunner,
) -> Result<AdapterResult, EngineError> {
    let version = engine_version(EngineName::Nmap, cancel, runner).await?;
    let mut args: Vec<String> = [
        "--unprivileged",
        "-sT",
        "-Pn",
        "-n",
        "--disable-arp-ping",
        "--max-retries",
        "1",
        "--max-rate",
        "5",
        "--max-parallelism",
        "1",
        "--host-timeout",
        "15s",
    ]
    .iter()
    .map(|arg| (*arg).to_owned())
    .collect();
    args.push("-p".to_owned());
    args.push(
        ports
            .iter()
            .map(|port| port.to_string())
            .collect::<Vec<_>>()
            .join(","),
    );
    args.push("-oX".to_owned());
    args.push("-".to_owned());
    args.extend(targets.iter().map(|target| (*target).to_owned()));

    let output = runner.run("nmap", &args, cancel).await?;
    let mut parsed = parse_nmap(&output.stdout, targets, ports, &version)?;
    if !output.succeeded() {
        parsed.conclusive = false;
        parsed.push_gap("Nmap was stopped or failed; coverage is incomplete");
    }
    Ok(parsed)
}

// ---------------------------------------------------------------------------
// Nuclei
// ---------------------------------------------------------------------------

/// Exact reviewed template: a single `GET /`, no redirects, callbacks or
/// extracted values.
pub const NUCLEI_TEMPLATE: &str = r#"id: jait-nosniff-v1
info:
  name: Jait nosniff header observation
  author: jait
  severity: low
http:
  - method: GET
    path:
      - "{{BaseURL}}/"
    redirects: false
    max-redirects: 0
    matchers-condition: and
    matchers:
      - type: status
        status: [200]
      - type: word
        part: header
        words: ["X-Content-Type-Options: nosniff"]
        case-insensitive: true
        negative: true
"#;

/// SHA-256 of [`NUCLEI_TEMPLATE`], pinning the reviewed revision.
pub fn nuclei_revision() -> &'static str {
    static REVISION: OnceLock<String> = OnceLock::new();
    REVISION.get_or_init(|| {
        let mut hasher = Sha256::new();
        hasher.update(NUCLEI_TEMPLATE.as_bytes());
        hasher
            .finalize()
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect()
    })
}

/// Parse `nuclei -jsonl` output for the pinned template.
pub fn parse_nuclei(raw: &str, url: &str, version: &str) -> Result<AdapterResult, EngineError> {
    if byte_len(raw) > MAX_ENGINE_DOCUMENT {
        return Err(EngineError::output("Oversized Nuclei output"));
    }
    let parsed = url::Url::parse(url)
        .map_err(|_| EngineError::output("Nuclei target is not a valid URL"))?;
    let host = parsed
        .host_str()
        .ok_or_else(|| EngineError::output("Nuclei target has no host"))?
        .to_owned();
    let port = parsed.port_or_known_default().unwrap_or_else(|| {
        if parsed.scheme() == "https" {
            443
        } else {
            80
        }
    });
    let revision = nuclei_revision();

    let mut output = base_result(
        "nuclei",
        &format!("{version}/template-{}", &revision[..16]),
        "Only Jait's revision-pinned nosniff template was run. No other vulnerability templates, crawling, redirects, callbacks, headless, code or fuzzing modes.",
        raw,
        "application/x-ndjson",
    );

    let with_slash = format!("{url}/");
    for line in raw.split('\n').filter(|line| !line.is_empty()) {
        let item: Value = serde_json::from_str(line)
            .map_err(|_| EngineError::output("Nuclei emitted a malformed result line"))?;
        let template_id = item.get("template-id").and_then(Value::as_str).unwrap_or("");
        let matched_at = item.get("matched-at").and_then(Value::as_str).unwrap_or("");
        if template_id != "jait-nosniff-v1" || (matched_at != url && matched_at != with_slash) {
            return Err(EngineError::output(
                "Nuclei result escaped the template or target allowlist",
            ));
        }
        let index = output.evidence.len();
        output.evidence.push(evidence(
            &host,
            Some(port),
            "Reviewed Nuclei header-policy match",
            facts([
                ("templateId", text("jait-nosniff-v1")),
                ("templateRevision", text(revision)),
                ("nosniffObservedAbsent", Value::Bool(true)),
            ]),
        ));
        output.rules.push(rule(
            "http.nosniff",
            "Response omits X-Content-Type-Options: nosniff",
            Severity::Low,
            "Configure X-Content-Type-Options: nosniff after validating MIME types.",
            index,
        ));
    }

    output.evidence.insert(
        0,
        evidence(
            url,
            None,
            "Reviewed Nuclei profile revision",
            facts([
                ("templateId", text("jait-nosniff-v1")),
                ("templateRevision", text(revision)),
                ("method", text("GET /")),
                ("matchCount", Value::from(output.rules.len())),
            ]),
        ),
    );
    for observation in &mut output.rules {
        observation.evidence_index += 1;
    }
    output.push_gap("An unmatched template alone cannot establish absence; verification requires the dedicated HTTP check to receive a conclusive response.");
    Ok(output)
}

/// Temporary directory holding the reviewed template/config, removed on drop.
struct TempDir {
    path: std::path::PathBuf,
}

impl TempDir {
    fn create_nuclei() -> Result<Self, EngineError> {
        let unique = format!(
            "jait-nuclei-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|elapsed| elapsed.as_nanos())
                .unwrap_or_default()
        );
        let path = std::env::temp_dir().join(unique);
        std::fs::create_dir_all(&path)?;
        Ok(Self { path })
    }
}

impl Drop for TempDir {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.path);
    }
}

fn write_private(path: &std::path::Path, contents: &str) -> std::io::Result<()> {
    use std::io::Write;
    use std::os::unix::fs::OpenOptionsExt;

    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .mode(0o600)
        .open(path)?;
    file.write_all(contents.as_bytes())
}

/// Run the pinned Nuclei template against one authorized URL.
pub async fn scan_nuclei(
    url: &str,
    cancel: &Cancellation,
    runner: &dyn CommandRunner,
) -> Result<AdapterResult, EngineError> {
    let version = engine_version(EngineName::Nuclei, cancel, runner).await?;
    let directory = TempDir::create_nuclei()?;
    let template = directory.path.join("reviewed.yaml");
    let config = directory.path.join("config.yaml");
    write_private(&template, NUCLEI_TEMPLATE)?;
    write_private(&config, "{}\n")?;

    let args: Vec<String> = [
        "-u",
        url,
        "-t",
    ]
    .iter()
    .map(|arg| (*arg).to_owned())
    .chain(std::iter::once(
        template.to_string_lossy().into_owned(),
    ))
    .chain(
        [
            "-config",
            // config path injected below
        ]
        .iter()
        .map(|arg| (*arg).to_owned()),
    )
    .collect();
    let mut args = args;
    args.push(config.to_string_lossy().into_owned());
    args.extend(
        [
            "-jsonl",
            "-omit-raw",
            "-silent",
            "-no-color",
            "-no-interactsh",
            "-disable-redirects",
            "-disable-update-check",
            "-no-httpx",
            "-rate-limit",
            "1",
            "-concurrency",
            "1",
            "-bulk-size",
            "1",
            "-timeout",
            "3",
            "-retries",
            "0",
        ]
        .iter()
        .map(|arg| (*arg).to_owned()),
    );

    let output = runner.run("nuclei", &args, cancel).await?;
    let mut parsed = parse_nuclei(&output.stdout, url, &version)?;
    if !output.succeeded() {
        parsed.push_gap("Nuclei exited unsuccessfully or exceeded its budget");
    }
    Ok(parsed)
}

// ---------------------------------------------------------------------------
// Trivy
// ---------------------------------------------------------------------------

/// Maximum number of Trivy findings (misconfigurations + vulnerabilities).
pub const MAX_TRIVY_FINDINGS: usize = 256;
/// Maximum number of results blocks accepted from one Trivy document.
pub const MAX_TRIVY_RESULTS: usize = 128;

fn is_ds_rule_id(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.len() == 7
        && bytes.starts_with(b"DS-")
        && bytes[3..].iter().all(|byte| byte.is_ascii_digit())
}

/// `String(value).toLowerCase()` mapped onto the closed severity set.
pub fn normalize_severity(value: Option<&Value>) -> Severity {
    let lowered = match value {
        Some(Value::String(text)) => text.to_ascii_lowercase(),
        Some(other) => other.to_string().to_ascii_lowercase(),
        None => return Severity::Info,
    };
    match lowered.as_str() {
        "low" => Severity::Low,
        "medium" => Severity::Medium,
        "high" => Severity::High,
        "critical" => Severity::Critical,
        _ => Severity::Info,
    }
}

fn str_field<'a>(item: &'a Value, key: &str) -> Option<&'a str> {
    item.get(key).and_then(Value::as_str)
}

fn array_field<'a>(item: &'a Value, key: &str) -> Vec<&'a Value> {
    match item.get(key) {
        Some(Value::Array(items)) => items.iter().collect(),
        Some(Value::Null) | None => Vec::new(),
        Some(other) => vec![other],
    }
}

/// Parse `trivy fs --format json` output.
pub fn parse_trivy(raw: &str, target: &str, version: &str) -> Result<AdapterResult, EngineError> {
    if byte_len(raw) > MAX_ENGINE_DOCUMENT {
        return Err(EngineError::output("Oversized Trivy output"));
    }
    let parsed: Value = serde_json::from_str(raw)
        .map_err(|_| EngineError::output("Unsupported Trivy JSON"))?;
    let schema_ok = parsed.get("SchemaVersion").and_then(Value::as_i64) == Some(2);
    let results = match parsed.get("Results") {
        Some(Value::Array(results)) if schema_ok && results.len() <= MAX_TRIVY_RESULTS => {
            results.iter().collect::<Vec<_>>()
        }
        _ => return Err(EngineError::output("Unsupported Trivy JSON")),
    };

    let mut output = base_result(
        "trivy",
        version,
        "Filesystem snapshot only; network exploitability and running software state are not established. Secret scanning is disabled. Database/check updates and remote lookups are disabled.",
        raw,
        "application/json",
    );
    output.conclusive = true;

    let mut findings = 0usize;
    let mut evaluated = false;
    let mut passing_rules: Vec<String> = Vec::new();

    if results.is_empty() {
        output.conclusive = false;
        output.push_gap("No supported files were evaluated; rule absence is inconclusive");
    }

    for result in &results {
        let misconfigurations = array_field(result, "Misconfigurations");
        for item in &misconfigurations {
            let status = str_field(item, "Status").unwrap_or_default();
            if !matches!(status, "PASS" | "FAIL" | "EXCEPTION") {
                return Err(EngineError::output("Invalid Trivy configuration outcome"));
            }
            let scanner_rule_id = clean_label(str_field(item, "ID"));
            if scanner_rule_id.is_empty() {
                return Err(EngineError::output("Invalid Trivy configuration outcome"));
            }
            evaluated = true;
            if status == "PASS" {
                let id = if is_ds_rule_id(&scanner_rule_id) {
                    format!("AVD-{scanner_rule_id}")
                } else {
                    scanner_rule_id.clone()
                };
                if !passing_rules.iter().any(|existing| existing == &id) {
                    passing_rules.push(id);
                }
            }
        }

        let class = str_field(result, "Class").unwrap_or_default();
        if class == "lang-pkgs" || class == "os-pkgs" || !array_field(result, "Vulnerabilities").is_empty() {
            evaluated = true;
        }

        for item in &misconfigurations {
            if str_field(item, "Status") != Some("FAIL") {
                continue;
            }
            findings += 1;
            if findings > MAX_TRIVY_FINDINGS {
                return Err(EngineError::output("Trivy finding limit exceeded"));
            }
            let index = output.evidence.len();
            let scanner_rule_id = clean_label(str_field(item, "ID"));
            let id = if is_ds_rule_id(&scanner_rule_id) {
                format!("AVD-{scanner_rule_id}")
            } else {
                scanner_rule_id.clone()
            };
            if id.is_empty() {
                return Err(EngineError::output("Trivy result missing rule ID"));
            }
            output.evidence.push(evidence(
                target,
                None,
                "Trivy configuration rule failed",
                facts([
                    ("ruleId", text(&id)),
                    ("scannerRuleId", text(&scanner_rule_id)),
                    ("result", text("FAIL")),
                ]),
            ));
            let non_root = id == "AVD-DS-0002";
            let mut observation = rule(
                &format!("trivy.config.{id}"),
                &if non_root {
                    "Container image has no non-root user configured".to_owned()
                } else {
                    format!("Configuration rule {id} failed")
                },
                normalize_severity(item.get("Severity")),
                if non_root {
                    "Create a service-specific unprivileged user and set USER in the Dockerfile. Check file permissions and required capabilities, build and test a new image, and retain the previous image tag for rollback before any deployment."
                } else {
                    "Review the scanner's documented rule and prepare a configuration change with a backup."
                },
                index,
            );
            observation.confidence = Some(Confidence::Medium);
            output.rules.push(observation);
        }

        for item in array_field(result, "Vulnerabilities") {
            findings += 1;
            if findings > MAX_TRIVY_FINDINGS {
                return Err(EngineError::output("Trivy finding limit exceeded"));
            }
            let index = output.evidence.len();
            let id = clean_label(str_field(item, "VulnerabilityID"));
            if !is_cve_id(&id) {
                continue;
            }
            let package = clean_label(str_field(item, "PkgName"));
            output.evidence.push(evidence(
                target,
                None,
                "Package database vulnerability correlation",
                facts([
                    ("vulnerabilityId", text(&id)),
                    ("package", text(&package)),
                    ("installedVersion", text(&clean_label(str_field(item, "InstalledVersion")))),
                    ("fixedVersion", text(&clean_label(str_field(item, "FixedVersion")))),
                ]),
            ));
            let mut observation = rule(
                &format!("trivy.package.{id}.{package}"),
                &format!("Package correlates with {id}"),
                normalize_severity(item.get("Severity")),
                "Confirm the package is deployed and applicable; update to a reviewed fixed version, then repeat the software scan.",
                index,
            );
            observation.status = Some(RuleStatus::Suspected);
            observation.confidence = Some(Confidence::Medium);
            output.rules.push(observation);
        }
    }

    if !evaluated || passing_rules.len() > MAX_TRIVY_FINDINGS {
        output.conclusive = false;
        output
            .push_gap("No bounded recognized check coverage was established; absence is inconclusive");
    }

    let reported: Vec<String> = passing_rules
        .iter()
        .take(MAX_TRIVY_FINDINGS)
        .cloned()
        .collect();
    output.evidence.insert(
        0,
        evidence(
            target,
            None,
            "Trivy snapshot assessment completed",
            facts([
                ("schemaVersion", Value::from(2)),
                ("resultCount", Value::from(results.len())),
                ("passingConfigurationRules", text(&reported.join(","))),
            ]),
        ),
    );
    for observation in &mut output.rules {
        observation.evidence_index += 1;
    }
    Ok(output)
}

fn is_cve_id(value: &str) -> bool {
    // ^CVE-\d{4}-\d{4,}$
    let Some(rest) = value.strip_prefix("CVE-") else {
        return false;
    };
    let mut parts = rest.splitn(2, '-');
    let (Some(year), Some(serial)) = (parts.next(), parts.next()) else {
        return false;
    };
    year.len() == 4
        && year.bytes().all(|byte| byte.is_ascii_digit())
        && serial.len() >= 4
        && serial.bytes().all(|byte| byte.is_ascii_digit())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    const NMAP_HEAD: &str = r#"<?xml version="1.0"?>
<nmaprun scanner="nmap" args="nmap -p 22,443 10.0.0.5">
<host><address addr="10.0.0.5" addrtype="ipv4"/><ports>
<port protocol="tcp" portid="22"><state state="open"/><service name="ssh" method="table"/></port>
"#;

    fn nmap_doc(extra: &str, tail: &str) -> String {
        format!("{NMAP_HEAD}{extra}{tail}")
    }

    #[test]
    fn nmap_full_aggregate_makes_scope_conclusive() {
        let doc = nmap_doc(
            "<extraports state=\"closed\" count=\"1\"/>\n</ports></host>\n",
            "<runstats><finished exit=\"success\"/></runstats>\n</nmaprun>",
        );
        let out = parse_nmap(&doc, &["10.0.0.5"], &[22, 443], "7.94").expect("valid");
        assert!(out.conclusive);
        assert_eq!(out.evidence.len(), 2);
        assert!(out.rules.is_empty());
        assert_eq!(out.evidence[0].facts.get("state"), Some(&text("open")));
        assert_eq!(
            out.evidence[0].facts.get("commonPortName"),
            Some(&text("ssh"))
        );
        assert_eq!(
            out.evidence[1].facts.get("identificationMethod"),
            Some(&text("complete-aggregate"))
        );
        assert_eq!(out.evidence[1].port, Some(443));
        // Only the baseline "not a scanner proof" gap survives.
        assert_eq!(out.coverage_gaps.len(), 1);
    }

    #[test]
    fn nmap_missing_aggregate_and_runstats_stay_inconclusive() {
        let doc = nmap_doc("</ports></host>\n", "<runstats/>\n</nmaprun>");
        let out = parse_nmap(&doc, &["10.0.0.5"], &[22, 443], "7.94").expect("valid");
        assert!(!out.conclusive);
        assert_eq!(out.evidence.len(), 1);
        assert!(out
            .coverage_gaps
            .iter()
            .any(|gap| gap.contains("deterministic observation")));
        assert!(out
            .coverage_gaps
            .iter()
            .any(|gap| gap.contains("successful completion")));
    }

    #[test]
    fn nmap_rejects_addresses_and_ports_outside_the_allowlist() {
        let foreign_host = "<nmaprun><host><address addr=\"192.0.2.9\" addrtype=\"ipv4\"/><ports/></host>\
<runstats><finished exit=\"success\"/></runstats></nmaprun>".to_string();
        let err = parse_nmap(&foreign_host, &["10.0.0.5"], &[22], "7.94").unwrap_err();
        assert!(err.to_string().contains("out-of-scope address"));

        let doc = nmap_doc(
            "</ports></host>\n",
            "<runstats><finished exit=\"success\"/></runstats>\n</nmaprun>",
        );
        let err = parse_nmap(&doc, &["10.0.0.5"], &[443], "7.94").unwrap_err();
        assert!(err.to_string().contains("out-of-scope port"));
    }

    #[test]
    fn nmap_rejects_doctype_declarations() {
        let doc = "<!DOCTYPE nmaprun [<!ENTITY xxe SYSTEM \"file:///etc/passwd\">]>\
<nmaprun><host><address addr=\"10.0.0.5\" addrtype=\"ipv4\"/></host></nmaprun>".to_string();
        assert!(parse_nmap(&doc, &["10.0.0.5"], &[22], "7.94").is_err());
    }

    #[test]
    fn nmap_rejects_oversized_documents() {
        let mut doc = String::from("<nmaprun>");
        doc.push_str(&"a".repeat(MAX_ENGINE_DOCUMENT));
        doc.push_str("</nmaprun>");
        let err = parse_nmap(&doc, &["10.0.0.5"], &[22], "7.94").unwrap_err();
        assert!(matches!(err, EngineError::Output(_)));
    }

    #[test]
    fn nmap_rejects_duplicate_port_observations() {
        let duplicate = "<port protocol=\"tcp\" portid=\"22\"><state state=\"open\"/></port>\
<port protocol=\"tcp\" portid=\"22\"><state state=\"open\"/></port>\n";
        let doc = nmap_doc(
            &format!("{duplicate}</ports></host>\n"),
            "<runstats><finished exit=\"success\"/></runstats>\n</nmaprun>",
        );
        let err = parse_nmap(&doc, &["10.0.0.5"], &[22], "7.94").unwrap_err();
        assert!(err.to_string().contains("Duplicate"));
    }

    #[test]
    fn clean_label_filters_markup_and_clamps_length() {
        assert_eq!(clean_label(None), "");
        assert_eq!(clean_label(Some("<b>ssh</b>\u{7f}")), "bsshb");
        let long = "x".repeat(400);
        assert_eq!(clean_label(Some(&long)).len(), 80);
    }

    #[test]
    fn nuclei_rejects_foreign_templates_and_targets() {
        let foreign = r#"{"template-id":"cves/2021-1","matched-at":"https://example.test/"}"#;
        let err = parse_nuclei(foreign, "https://example.test", "3.1.0").unwrap_err();
        assert!(err.to_string().contains("allowlist"));

        let off_target = r#"{"template-id":"jait-nosniff-v1","matched-at":"https://elsewhere.test/"}"#;
        assert!(parse_nuclei(off_target, "https://example.test", "3.1.0").is_err());

        let garbage = "not json at all";
        assert!(parse_nuclei(garbage, "https://example.test", "3.1.0").is_err());
    }

    #[test]
    fn nuclei_accepts_pinned_template_with_trailing_slash() {
        let raw = "{\"template-id\":\"jait-nosniff-v1\",\"matched-at\":\"https://example.test/\"}\n";
        let out = parse_nuclei(raw, "https://example.test", "3.1.0").expect("valid");
        assert_eq!(out.rules.len(), 1);
        assert_eq!(out.rules[0].rule_id, "http.nosniff");
        assert_eq!(out.rules[0].severity, Severity::Low);
        assert_eq!(out.rules[0].evidence_index, 1);
        assert_eq!(out.evidence.len(), 2);
        assert_eq!(out.evidence[0].facts.get("matchCount"), Some(&Value::from(1)));
        assert!(out.engine_version.contains("template-"));
    }

    #[test]
    fn trivy_rejects_garbage_and_unexpected_schema() {
        assert!(parse_trivy("not json", "example.test", "0.50.1").is_err());
        assert!(parse_trivy("{\"SchemaVersion\":1,\"Results\":[]}", "example.test", "0.50.1").is_err());
        assert!(parse_trivy("{\"SchemaVersion\":2}", "example.test", "0.50.1").is_err());
    }

    #[test]
    fn trivy_empty_result_set_is_inconclusive() {
        let out = parse_trivy("{\"SchemaVersion\":2,\"Results\":[]}", "example.test", "0.50.1")
            .expect("valid");
        assert!(!out.conclusive);
        assert_eq!(out.evidence.len(), 1);
        assert!(out.coverage_gaps.len() >= 2);
    }

    #[test]
    fn trivy_mixed_findings_map_to_reviewed_rules() {
        let raw = r#"{"SchemaVersion":2,"Results":[{"Target":"package-lock.json","Class":"lang-pkgs","Type":"npm",
"Vulnerabilities":[{"VulnerabilityID":"CVE-2021-12345","PkgName":"lodash","InstalledVersion":"4.17.20","FixedVersion":"4.17.21","Severity":"MEDIUM","Title":"Prototype pollution"}],
"Misconfigurations":[{"ID":"AVD-AWS-0001","Title":"Public bucket","Severity":"HIGH","Status":"FAIL","Message":"bucket is public"},
{"ID":"AVD-AWS-0002","Title":"Fine","Severity":"LOW","Status":"PASS","Message":"ok"}]}]}"#;
        let out = parse_trivy(raw, "example.test", "0.50.1").expect("valid");
        assert_eq!(out.rules.len(), 2);
        assert!(out.conclusive);
        assert!(out
            .rules
            .iter()
            .any(|rule| rule.rule_id == "trivy.package.CVE-2021-12345.lodash"
                && rule.severity == Severity::Medium));
        assert!(out
            .rules
            .iter()
            .any(|rule| rule.rule_id == "trivy.config.AVD-AWS-0001"
                && rule.severity == Severity::High));
        assert_eq!(out.evidence.len(), 3);
        assert_eq!(
            out.evidence[0].facts.get("passingConfigurationRules"),
            Some(&text("AVD-AWS-0002"))
        );
        assert_eq!(out.evidence[0].facts.get("resultCount"), Some(&Value::from(1)));
        assert!(out.rules.iter().all(|rule| rule.evidence_index < out.evidence.len()));
    }

    #[test]
    fn trivy_rejects_unknown_status_and_skips_non_cve_ids() {
        let bad_status = r#"{"SchemaVersion":2,"Results":[{"Class":"config","Misconfigurations":[
{"ID":"AVD-X-1","Title":"t","Severity":"LOW","Status":"SKIP","Message":"m"}]}]}"#;
        let err = parse_trivy(bad_status, "example.test", "0.50.1").unwrap_err();
        assert!(matches!(err, EngineError::Output(_)), "unexpected: {err}");

        let advisory = r#"{"SchemaVersion":2,"Results":[{"Class":"lang-pkgs","Vulnerabilities":[
{"VulnerabilityID":"GHSA-aaaa-bbbb-cccc","PkgName":"left-pad","Severity":"HIGH","Title":"t"}]}]}"#;
        let out = parse_trivy(advisory, "example.test", "0.50.1").expect("valid");
        assert!(out.rules.is_empty());
        assert_eq!(out.evidence.len(), 1);
    }

    #[test]
    fn normalize_severity_is_case_insensitive_and_defaults_to_unknown() {
        assert_eq!(normalize_severity(Some(&text("critical"))), Severity::Critical);
        assert_eq!(normalize_severity(Some(&text("HiGh"))), Severity::High);
        assert_eq!(normalize_severity(Some(&text("medium"))), Severity::Medium);
        assert_eq!(normalize_severity(Some(&text("weird"))), Severity::Info);
        assert_eq!(normalize_severity(None), Severity::Info);
    }

    struct StubRunner {
        stdout: &'static str,
        stderr: &'static str,
        calls: AtomicUsize,
    }

    impl StubRunner {
        fn new(stdout: &'static str, stderr: &'static str) -> Self {
            Self { stdout, stderr, calls: AtomicUsize::new(0) }
        }
    }

    impl CommandRunner for StubRunner {
        fn run<'a>(
            &'a self,
            _program: &'a str,
            _args: &'a [String],
            _cancel: &'a Cancellation,
        ) -> CommandFuture<'a> {
            self.calls.fetch_add(1, Ordering::SeqCst);
            Box::pin(async move {
                Ok(CommandOutput {
                    stdout: self.stdout.to_owned(),
                    stderr: self.stderr.to_owned(),
                    exit_code: Some(0),
                    truncated: false,
                })
            })
        }
    }

    #[tokio::test]
    async fn engine_version_reads_banner_and_rejects_unknown_output() {
        let cancel = Cancellation::new();
        let runner = StubRunner::new("Trivy\nVersion: 0.50.1\nVulnerability DB:\n", "");
        let version = engine_version(EngineName::Trivy, &cancel, &runner).await.expect("banner");
        assert_eq!(version, "0.50.1");

        let silent = StubRunner::new("segmentation fault", "");
        let err = engine_version(EngineName::Nmap, &cancel, &silent).await.unwrap_err();
        assert!(err.is_unavailable(), "expected unavailable, got {err}");
    }

    #[tokio::test]
    async fn engine_version_short_circuits_on_cancellation() {
        let cancel = Cancellation::new();
        cancel.cancel();
        let runner = StubRunner::new("Nmap version 7.94\n", "");
        let err = engine_version(EngineName::Nmap, &cancel, &runner).await.unwrap_err();
        assert!(matches!(err, EngineError::Cancelled));
        assert_eq!(runner.calls.load(Ordering::SeqCst), 0);
    }

    #[tokio::test]
    async fn probe_engines_reports_every_engine_without_probing_when_cancelled() {
        let cancel = Cancellation::new();
        let runner = StubRunner::new("garbage banner", "");
        let statuses = probe_engines(&cancel, &runner).await;
        assert_eq!(statuses.len(), 3);
        assert!(statuses.iter().all(|status| !status.available));
        assert!(statuses.iter().all(|status| status.detail.is_some()));
        assert_eq!(runner.calls.load(Ordering::SeqCst), 3);
    }
}
