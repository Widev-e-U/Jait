//! Native port of `packages/gateway/src/lib/security/host-software.ts`.
//!
//! Read-only host inventory with a strict security posture:
//!
//! * bounded software snapshots (128 files / 1 MiB / 4096 entries / depth 32),
//! * symbolic links are rejected outright,
//! * every captured descriptor is re-validated through `/proc/self/fd` on Linux,
//! * `.env*` files and well-known secret directories never enter a snapshot,
//! * Trivy evidence is imported from a prepared local database only,
//! * telemetry imports are capped (64 KiB, 100 events) and target filtered.

use std::fmt;
use std::fs::{self, File, OpenOptions};
use std::io::{self, Read, Write};
use std::os::unix::fs::{MetadataExt, OpenOptionsExt, PermissionsExt};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

use serde_json::{Map, Value};
use sha2::{Digest, Sha256};

use super::engines::{engine_version, parse_trivy, CommandRunner, EngineError, EngineName};
use super::protocols::{
    evidence, rule, AdapterResult, Cancellation, Confidence, RuleStatus, Severity,
};

/// Directory names that never contribute to a software snapshot.
pub const SKIPPED_DIRECTORIES: &[&str] = &[
    ".git",
    ".jait",
    "node_modules",
    "vendor",
    ".ssh",
    ".gnupg",
    ".aws",
];

/// `MAX_SNAPSHOT_BYTES`.
pub const MAX_SNAPSHOT_BYTES: u64 = 1024 * 1024;
/// `MAX_SNAPSHOT_FILES`.
pub const MAX_SNAPSHOT_FILES: usize = 128;
/// `MAX_SNAPSHOT_ENTRIES`.
pub const MAX_SNAPSHOT_ENTRIES: usize = 4096;
/// Per-directory entry cap applied before recursion.
pub const MAX_SNAPSHOT_DIRECTORY_ENTRIES: usize = 2048;
/// `MAX_SNAPSHOT_DEPTH`.
pub const MAX_SNAPSHOT_DEPTH: usize = 32;
/// `MAX_SSH_CONFIG_BYTES`.
pub const MAX_SSH_CONFIG_BYTES: usize = 32 * 1024;
/// `MAX_TELEMETRY_BYTES`.
pub const MAX_TELEMETRY_BYTES: usize = 64 * 1024;
/// `MAX_TELEMETRY_EVENTS`.
pub const MAX_TELEMETRY_EVENTS: usize = 100;
/// Highest accepted decimal rule identifier (12 digits).
pub const MAX_RULE_ID_DIGITS: usize = 12;
/// `MAX_CACHE_METADATA_BYTES` for the prepared Trivy database metadata.
pub const MAX_CACHE_METADATA_BYTES: u64 = 16 * 1024;
/// Separator used by the remote inventory script for the folded SSH policy.
const SSH_POLICY_SEPARATOR: char = '\u{1e}';

/// Read-only remote inventory performed over an existing authorized key.
///
/// Deliberately free of any write, package manager, or privilege escalation.
const REMOTE_INVENTORY_SCRIPT: &str = "printf 'OS=%s\\nRELEASE=%s\\nUID=%s\\nSSH_POLICY=%s\\n' \"$(uname -s)\" \"$(uname -r)\" \"$(id -u)\" \"$(cat /etc/ssh/sshd_config 2>/dev/null | tr '\\n' '\\036')\"";

/// Errors surfaced by the host software module. Errors are typed so callers can
/// distinguish an unavailable engine from a genuine failure.
#[derive(Debug)]
pub enum HostError {
    /// The engine or prerequisite needed for this operation is not usable.
    EngineUnavailable { engine: String, detail: String },
    /// A path was rejected by the guard, or a descriptor did not match.
    Path(String),
    /// A hard resource limit was exceeded.
    Limit(String),
    /// The caller cancelled the operation.
    Cancelled,
    /// Input could not be interpreted.
    Parse(String),
    /// Local I/O failure.
    Io(io::Error),
}

impl HostError {
    pub fn unavailable(engine: &str, detail: &str) -> Self {
        Self::EngineUnavailable {
            engine: engine.to_owned(),
            detail: detail.to_owned(),
        }
    }

    /// `error instanceof EngineUnavailable`.
    pub fn is_unavailable(&self) -> bool {
        matches!(self, Self::EngineUnavailable { .. })
    }
}

impl fmt::Display for HostError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::EngineUnavailable { engine, detail } => {
                write!(f, "{engine} is unavailable: {detail}")
            }
            Self::Path(message) => write!(f, "path rejected: {message}"),
            Self::Limit(message) => write!(f, "limit exceeded: {message}"),
            Self::Cancelled => write!(f, "operation cancelled"),
            Self::Parse(message) => write!(f, "invalid input: {message}"),
            Self::Io(error) => write!(f, "io error: {error}"),
        }
    }
}

impl std::error::Error for HostError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Io(error) => Some(error),
            _ => None,
        }
    }
}

impl From<io::Error> for HostError {
    fn from(error: io::Error) -> Self {
        Self::Io(error)
    }
}

impl From<EngineError> for HostError {
    fn from(error: EngineError) -> Self {
        match error {
            EngineError::Unavailable { engine, detail } => {
                Self::EngineUnavailable { engine, detail }
            }
            EngineError::Cancelled => Self::Cancelled,
            other => Self::Parse(other.to_string()),
        }
    }
}

fn string_value(value: &str) -> Value {
    Value::String(value.to_owned())
}

fn text_at(value: &Value, path: &[&str]) -> Option<String> {
    let mut current = value;
    for key in path {
        current = current.get(*key)?;
    }
    as_text(Some(current))
}

fn as_text(value: Option<&Value>) -> Option<String> {
    match value? {
        Value::String(text) => Some(text.clone()),
        Value::Number(number) => Some(number.to_string()),
        Value::Bool(flag) => Some(flag.to_string()),
        _ => None,
    }
}

/// Resolve `target` inside `root` and refuse anything that escapes it.
pub fn guarded_real_path(root: &Path, target: &Path) -> Result<PathBuf, HostError> {
    let root_real = fs::canonicalize(root)
        .map_err(|error| HostError::Path(format!("project root is not accessible: {error}")))?;
    let joined = if target.is_absolute() {
        target.to_path_buf()
    } else {
        root_real.join(target)
    };
    let real = fs::canonicalize(&joined)
        .map_err(|error| HostError::Path(format!("path is not accessible: {error}")))?;
    if !real.starts_with(&root_real) {
        return Err(HostError::Path(
            "path escapes the project root".to_owned(),
        ));
    }
    Ok(real)
}

/// `validateSnapshotDescriptor`: the open descriptor must still resolve to the
/// path we asked for and must still be a regular file.
#[cfg(target_os = "linux")]
pub fn validate_snapshot_descriptor(
    root: &Path,
    file: &File,
    expected: &Path,
) -> Result<(), HostError> {
    use std::os::fd::AsRawFd;

    let descriptor = file.as_raw_fd();
    let link = fs::read_link(format!("/proc/self/fd/{descriptor}")).map_err(|error| {
        HostError::Path(format!("snapshot descriptor is not inspectable: {error}"))
    })?;
    let real = guarded_real_path(root, &link)?;
    let want = fs::canonicalize(expected)?;
    if real != want {
        return Err(HostError::Path(
            "snapshot descriptor does not match the requested path".to_owned(),
        ));
    }
    if !file.metadata()?.is_file() {
        return Err(HostError::Path(
            "snapshot descriptor is not a regular file".to_owned(),
        ));
    }
    Ok(())
}

/// Snapshots rely on Linux descriptor inspection; other platforms are refused.
#[cfg(not(target_os = "linux"))]
pub fn validate_snapshot_descriptor(
    _root: &Path,
    _file: &File,
    _expected: &Path,
) -> Result<(), HostError> {
    Err(HostError::unavailable(
        "snapshot",
        "software snapshots require Linux descriptor inspection",
    ))
}

fn open_no_follow(path: &Path) -> io::Result<File> {
    OpenOptions::new()
        .read(true)
        .custom_flags(libc::O_NOFOLLOW)
        .open(path)
}

fn write_private(path: &Path, bytes: &[u8]) -> Result<(), HostError> {
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .mode(0o600)
        .open(path)?;
    file.write_all(bytes)?;
    file.flush()?;
    Ok(())
}

static TEMPORARY_COUNTER: AtomicU64 = AtomicU64::new(0);

/// Create a private (mode 0700) temporary directory below `std::env::temp_dir()`.
pub fn make_temp_dir(prefix: &str) -> Result<PathBuf, HostError> {
    let base = std::env::temp_dir();
    for _ in 0..64 {
        let counter = TEMPORARY_COUNTER.fetch_add(1, Ordering::Relaxed);
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|duration| duration.as_nanos())
            .unwrap_or(0);
        let candidate = base.join(format!(
            "{prefix}-{}-{counter}-{nanos}",
            std::process::id()
        ));
        match fs::create_dir(&candidate) {
            Ok(()) => {
                fs::set_permissions(&candidate, fs::Permissions::from_mode(0o700))?;
                return Ok(candidate);
            }
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(error.into()),
        }
    }
    Err(HostError::Limit(
        "unable to allocate a private temporary directory".to_owned(),
    ))
}

/// An immutable, private copy of the files that will be scanned.
pub struct Snapshot {
    root: PathBuf,
    files: usize,
    bytes: u64,
}

impl Snapshot {
    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn files(&self) -> usize {
        self.files
    }

    pub fn bytes(&self) -> u64 {
        self.bytes
    }

    /// `rm(snapshot.root, { recursive: true, force: true })`.
    pub fn cleanup(&self) {
        let _ = fs::remove_dir_all(&self.root);
    }
}

impl Drop for Snapshot {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.root);
    }
}

impl fmt::Debug for Snapshot {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("Snapshot")
            .field("root", &self.root)
            .field("files", &self.files)
            .field("bytes", &self.bytes)
            .finish()
    }
}

struct Walk<'a> {
    root: &'a Path,
    selected: &'a Path,
    destination: &'a Path,
    files: usize,
    bytes: u64,
    entries: usize,
    cancel: &'a Cancellation,
}

impl Walk<'_> {
    fn visit(&mut self, source: &Path, depth: usize) -> Result<(), HostError> {
        if self.cancel.is_cancelled() {
            return Err(HostError::Cancelled);
        }
        if depth > MAX_SNAPSHOT_DEPTH {
            return Err(HostError::Limit(
                "snapshot traversal depth exceeded".to_owned(),
            ));
        }
        self.entries += 1;
        if self.entries > MAX_SNAPSHOT_ENTRIES {
            return Err(HostError::Limit(
                "snapshot traversal limit exceeded".to_owned(),
            ));
        }
        let name = source
            .file_name()
            .map(|value| value.to_string_lossy().to_string())
            .unwrap_or_default();
        if depth > 0 {
            if name.starts_with(".env") {
                return Ok(());
            }
            if SKIPPED_DIRECTORIES.contains(&name.as_str()) {
                return Ok(());
            }
        }
        let real = guarded_real_path(self.root, source)?;
        let metadata = fs::symlink_metadata(source)?;
        if metadata.file_type().is_symlink() {
            return Err(HostError::Path(
                "symbolic links are not allowed in software snapshots".to_owned(),
            ));
        }
        if metadata.is_dir() {
            let mut children = Vec::new();
            for entry in fs::read_dir(source)? {
                children.push(entry?.path());
            }
            if children.len() > MAX_SNAPSHOT_DIRECTORY_ENTRIES {
                return Err(HostError::Limit(
                    "snapshot directory limit exceeded".to_owned(),
                ));
            }
            children.sort();
            for child in children {
                self.visit(&child, depth + 1)?;
            }
            return Ok(());
        }
        if !metadata.is_file() {
            return Err(HostError::Path(
                "only regular files can be snapshotted".to_owned(),
            ));
        }
        self.files += 1;
        if self.files > MAX_SNAPSHOT_FILES {
            return Err(HostError::Limit(
                "snapshot exceeds 128 files or 1 MiB".to_owned(),
            ));
        }
        if metadata.len() > MAX_SNAPSHOT_BYTES || self.bytes + metadata.len() > MAX_SNAPSHOT_BYTES {
            return Err(HostError::Limit(
                "snapshot exceeds 128 files or 1 MiB".to_owned(),
            ));
        }
        let file = open_no_follow(source)?;
        validate_snapshot_descriptor(self.root, &file, &real)?;
        let current = file.metadata()?;
        if !current.is_file()
            || current.dev() != metadata.dev()
            || current.ino() != metadata.ino()
            || current.len() != metadata.len()
        {
            return Err(HostError::Path(
                "snapshot source changed during capture".to_owned(),
            ));
        }
        let mut buffer = Vec::with_capacity(metadata.len() as usize);
        (&file)
            .take(MAX_SNAPSHOT_BYTES + 1)
            .read_to_end(&mut buffer)?;
        if buffer.len() as u64 > metadata.len() {
            return Err(HostError::Path(
                "snapshot source grew during capture".to_owned(),
            ));
        }
        let suffix: PathBuf = if source == self.selected {
            PathBuf::from(&name)
        } else {
            source
                .strip_prefix(self.selected)
                .map(Path::to_path_buf)
                .unwrap_or_else(|_| PathBuf::from(&name))
        };
        let target = self.destination.join(&suffix);
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent)?;
            let _ = fs::set_permissions(parent, fs::Permissions::from_mode(0o700));
        }
        write_private(&target, &buffer)?;
        self.bytes += metadata.len();
        Ok(())
    }
}

/// Capture a bounded, symlink-free copy of `path` below a private temp root.
pub fn create_snapshot(
    root: &Path,
    path: &Path,
    cancel: &Cancellation,
) -> Result<Snapshot, HostError> {
    if !cfg!(target_os = "linux") {
        return Err(HostError::unavailable(
            "snapshot",
            "software snapshots require Linux descriptor inspection",
        ));
    }
    if cancel.is_cancelled() {
        return Err(HostError::Cancelled);
    }
    let root_real = fs::canonicalize(root)?;
    let selected = guarded_real_path(&root_real, path)?;
    let metadata = fs::symlink_metadata(&selected)?;
    if metadata.file_type().is_symlink() {
        return Err(HostError::Path(
            "symbolic links are not allowed in software snapshots".to_owned(),
        ));
    }
    if !metadata.is_file() && !metadata.is_dir() {
        return Err(HostError::Path(
            "snapshot root must be a regular file or directory".to_owned(),
        ));
    }
    let destination = make_temp_dir("jait-security-snapshot")?;
    let mut walk = Walk {
        root: &root_real,
        selected: &selected,
        destination: &destination,
        files: 0,
        bytes: 0,
        entries: 0,
        cancel,
    };
    if let Err(error) = walk.visit(&selected, 0) {
        let _ = fs::remove_dir_all(&destination);
        return Err(error);
    }
    let files = walk.files;
    let bytes = walk.bytes;
    Ok(Snapshot {
        root: destination,
        files,
        bytes,
    })
}

/// First directive line in `config` (case-insensitive, comments ignored) whose
/// value is one of `allowed`. Later duplicates never win.
fn find_directive(config: &str, directive: &str, allowed: &[&str]) -> Option<String> {
    for line in config.lines() {
        // The TypeScript source anchors the directive at `^\s*`; OpenSSH
        // accepts indented directives, so leading blanks are irrelevant.
        let line = line.trim_start();
        let mut parts = line.splitn(2, char::is_whitespace);
        let name = parts.next().unwrap_or("");
        if !name.eq_ignore_ascii_case(directive) {
            continue;
        }
        let rest = parts.next().unwrap_or("").trim_start();
        if rest.is_empty() || rest.starts_with('#') {
            continue;
        }
        let mut tokens = rest.splitn(2, char::is_whitespace);
        let value = tokens.next().unwrap_or("").to_ascii_lowercase();
        let tail = tokens.next().unwrap_or("").trim_start();
        if !tail.is_empty() && !tail.starts_with('#') {
            continue;
        }
        if !allowed.contains(&value.as_str()) {
            continue;
        }
        return Some(value);
    }
    None
}

/// Value of the first `directive` line, whatever the value is.
pub fn parse_ssh_directive(config: &str, directive: &str) -> Option<String> {
    for line in config.lines() {
        // The TypeScript source anchors the directive at `^\s*`; OpenSSH
        // accepts indented directives, so leading blanks are irrelevant.
        let line = line.trim_start();
        let mut parts = line.splitn(2, char::is_whitespace);
        let name = parts.next().unwrap_or("");
        if !name.eq_ignore_ascii_case(directive) {
            continue;
        }
        let rest = parts.next().unwrap_or("").trim_start();
        if rest.is_empty() || rest.starts_with('#') {
            continue;
        }
        let mut tokens = rest.splitn(2, char::is_whitespace);
        let value = tokens.next().unwrap_or("");
        let tail = tokens.next().unwrap_or("").trim_start();
        if !tail.is_empty() && !tail.starts_with('#') {
            continue;
        }
        return Some(value.to_ascii_lowercase());
    }
    None
}

/// First `PermitRootLogin` directive with an OpenSSH-accepted value.
pub fn parse_root_login(config: &str) -> Option<String> {
    find_directive(
        config,
        "PermitRootLogin",
        &[
            "yes",
            "no",
            "prohibit-password",
            "without-password",
            "forced-commands-only",
        ],
    )
}

/// First `PasswordAuthentication` directive with an OpenSSH-accepted value.
pub fn parse_password_authentication(config: &str) -> Option<String> {
    find_directive(config, "PasswordAuthentication", &["yes", "no"])
}

/// `addSshPolicy`: attach the file-directive evidence and derived findings.
pub fn add_ssh_policy(
    output: &mut AdapterResult,
    target: &str,
    port: Option<u16>,
    config: &str,
) {
    if config.len() > MAX_SSH_CONFIG_BYTES {
        output.push_gap("SSH configuration exceeded the audit limit");
        return;
    }
    let root_login = parse_root_login(config);
    let password_authentication = parse_password_authentication(config);
    let mut facts = Map::new();
    facts.insert(
        "permitRootLoginDirective".to_owned(),
        root_login.clone().map_or(Value::Null, Value::String),
    );
    facts.insert(
        "passwordAuthenticationDirective".to_owned(),
        password_authentication.clone().map_or(Value::Null, Value::String),
    );
    facts.insert("effectivePolicyConfirmed".to_owned(), Value::Bool(false));
    output.evidence.push(evidence(
        target,
        port,
        "SSH file directives (effective settings may differ)",
        facts,
    ));
    let index = output.evidence.len() - 1;
    if root_login.as_deref() == Some("yes") {
        let mut observation = rule(
            "host.ssh-root-login",
            "SSH root login is permitted by file configuration",
            Severity::Medium,
            "Set PermitRootLogin to no or prohibit-password",
            index,
        );
        observation.status = Some(RuleStatus::Suspected);
        observation.confidence = Some(Confidence::Medium);
        output.rules.push(observation);
    }
    if password_authentication.as_deref() == Some("yes") {
        let mut observation = rule(
            "host.ssh-password-authentication",
            "SSH password authentication is enabled by file configuration",
            Severity::Low,
            "Prefer public key authentication and disable PasswordAuthentication",
            index,
        );
        observation.status = Some(RuleStatus::Suspected);
        observation.confidence = Some(Confidence::Low);
        output.rules.push(observation);
    }
    if root_login.is_none() || password_authentication.is_none() {
        output.push_gap(
            "Missing directives are unknown; defaults and included configuration were not inferred",
        );
    }
}

fn numeric_rule_id(value: Option<&Value>) -> Result<String, HostError> {
    let text = as_text(value)
        .ok_or_else(|| HostError::Parse("telemetry rule id is missing".to_owned()))?;
    if text.is_empty()
        || text.len() > MAX_RULE_ID_DIGITS
        || !text.bytes().all(|byte| byte.is_ascii_digit())
    {
        return Err(HostError::Parse(
            "telemetry rule id is outside the numeric bounds".to_owned(),
        ));
    }
    Ok(text)
}

fn suricata_severity(value: Option<&Value>) -> Severity {
    match value.and_then(Value::as_i64) {
        Some(1) => Severity::High,
        Some(2) => Severity::Medium,
        Some(3) => Severity::Low,
        _ => Severity::Info,
    }
}

fn wazuh_severity(value: Option<&Value>) -> Severity {
    match value.and_then(Value::as_i64) {
        Some(level) if level >= 12 => Severity::High,
        Some(level) if level >= 8 => Severity::Medium,
        Some(level) if level >= 4 => Severity::Low,
        _ => Severity::Info,
    }
}

/// `parseTelemetry`: NDJSON import bounded by size, event count and scope.
pub fn parse_telemetry(
    raw: &str,
    source: &str,
    allowed_targets: &[String],
) -> Result<AdapterResult, HostError> {
    if raw.len() > MAX_TELEMETRY_BYTES {
        return Err(HostError::Limit(
            "telemetry import exceeds 65536 bytes".to_owned(),
        ));
    }
    let mut output = AdapterResult {
        engine: format!("{source}-import"),
        engine_version: "reported-version-unknown".to_owned(),
        evidence: Vec::new(),
        rules: Vec::new(),
        coverage_gaps: Vec::new(),
        conclusive: true,
        raw: Some(raw.to_owned()),
        content_type: Some("application/x-ndjson".to_owned()),
    };
    let mut skipped = 0usize;
    let lines = raw
        .split('\n')
        .filter(|line| !line.is_empty())
        .take(MAX_TELEMETRY_EVENTS);
    for line in lines {
        let event: Value = serde_json::from_str(line)
            .map_err(|_| HostError::Parse("telemetry event is not valid JSON".to_owned()))?;
        let candidates: Vec<Option<String>> = match source {
            "suricata" => vec![
                text_at(&event, &["dest_ip"]),
                text_at(&event, &["src_ip"]),
            ],
            "wazuh" => vec![text_at(&event, &["agent", "ip"])],
            other => {
                return Err(HostError::Parse(format!(
                    "unsupported telemetry source {other}"
                )))
            }
        };
        let address = candidates
            .into_iter()
            .flatten()
            .find(|candidate| allowed_targets.iter().any(|target| target == candidate));
        let address = match address {
            Some(address) => address,
            None => {
                skipped += 1;
                continue;
            }
        };
        let (id, title, severity, event_type) = if source == "suricata" {
            if text_at(&event, &["event_type"]).as_deref() != Some("alert") {
                skipped += 1;
                continue;
            }
            let alert = event.get("alert");
            let id = numeric_rule_id(alert.and_then(|value| value.get("signature_id")))?;
            let title = text_at(&event, &["alert", "signature"])
                .unwrap_or_else(|| format!("Suricata alert {id}"));
            let severity = suricata_severity(alert.and_then(|value| value.get("severity")));
            (id, title, severity, "alert".to_owned())
        } else {
            let rule_node = event.get("rule");
            let id = numeric_rule_id(rule_node.and_then(|value| value.get("id")))?;
            let title = text_at(&event, &["rule", "description"])
                .unwrap_or_else(|| format!("Wazuh rule {id}"));
            let severity = wazuh_severity(rule_node.and_then(|value| value.get("level")));
            let event_type = text_at(&event, &["rule", "description"])
                .map(|_| "alert".to_owned())
                .unwrap_or_else(|| "alert".to_owned());
            (id, title, severity, event_type)
        };
        let mut facts = Map::new();
        facts.insert("source".to_owned(), string_value(source));
        facts.insert("ruleId".to_owned(), string_value(&id));
        facts.insert("title".to_owned(), string_value(&title));
        facts.insert("eventType".to_owned(), string_value(&event_type));
        output.evidence.push(evidence(
            &address,
            None,
            &format!("Imported {source} event"),
            facts,
        ));
        let index = output.evidence.len() - 1;
        let mut observation = rule(
            &format!("{source}.{id}"),
            &title,
            severity,
            "Review the upstream detection and correlate it with local exposure",
            index,
        );
        observation.status = Some(RuleStatus::Suspected);
        observation.confidence = Some(Confidence::Low);
        output.rules.push(observation);
    }
    if skipped > 0 {
        output.push_gap(&format!(
            "{skipped} telemetry events were skipped as out of scope or non-alerting"
        ));
    }
    Ok(output)
}

/// Options accepted by [`scan_software`].
#[derive(Debug, Clone)]
pub struct SoftwareScanOptions {
    /// Import the prepared vulnerability database instead of skipping it.
    pub include_packages: bool,
    /// Directory holding a prepared Trivy cache (`db/metadata.json`).
    pub database_cache: PathBuf,
}

impl SoftwareScanOptions {
    pub fn new(database_cache: impl Into<PathBuf>) -> Self {
        Self {
            include_packages: false,
            database_cache: database_cache.into(),
        }
    }
}

fn read_cache_version(database_cache: &Path) -> Result<String, HostError> {
    let metadata_path = database_cache.join("db").join("metadata.json");
    let metadata = fs::symlink_metadata(&metadata_path).map_err(|_| {
        HostError::unavailable(
            "trivy",
            "a prepared local Trivy vulnerability database is required; no database was downloaded",
        )
    })?;
    if !metadata.file_type().is_file() || metadata.len() > MAX_CACHE_METADATA_BYTES {
        return Err(HostError::unavailable(
            "trivy",
            "a prepared local Trivy vulnerability database is required; no database was downloaded",
        ));
    }
    let text = fs::read_to_string(&metadata_path).map_err(|_| {
        HostError::unavailable("trivy", "prepared Trivy database metadata is unreadable")
    })?;
    let parsed: Value = serde_json::from_str(&text).map_err(|_| {
        HostError::unavailable("trivy", "prepared Trivy database metadata is not valid JSON")
    })?;
    if parsed.get("Version").and_then(Value::as_u64) != Some(2) {
        return Err(HostError::unavailable(
            "trivy",
            "prepared Trivy database metadata has an unsupported version",
        ));
    }
    let digest = Sha256::digest(text.as_bytes());
    let hex = format!("{digest:x}");
    Ok(format!("db-{}", &hex[..16]))
}

/// `scanSoftware`: snapshot, run Trivy without network access, import evidence.
pub async fn scan_software(
    project_root: &Path,
    path: &Path,
    options: &SoftwareScanOptions,
    cancel: &Cancellation,
    runner: &dyn CommandRunner,
) -> Result<AdapterResult, HostError> {
    let mut version = engine_version(EngineName::Trivy, cancel, runner).await?;
    if options.include_packages {
        version = format!("{version}/{}", read_cache_version(&options.database_cache)?);
    }
    let snapshot = create_snapshot(project_root, path, cancel)?;
    let config_path = snapshot.root().join(".jait-trivy-config.yaml");
    write_private(&config_path, b"{}\n")?;
    let temporary_cache = if options.include_packages {
        None
    } else {
        Some(make_temp_dir("jait-trivy-cache")?)
    };
    let cache = temporary_cache
        .clone()
        .unwrap_or_else(|| options.database_cache.clone());
    let target_label = path.to_string_lossy().to_string();
    let args: Vec<String> = vec![
        "fs".to_owned(),
        "--format".to_owned(),
        "json".to_owned(),
        "--quiet".to_owned(),
        "--scanners".to_owned(),
        "vuln,secret,misconfig".to_owned(),
        "--skip-db-update".to_owned(),
        "--cache-dir".to_owned(),
        cache.to_string_lossy().to_string(),
        "--config".to_owned(),
        config_path.to_string_lossy().to_string(),
        snapshot.root().to_string_lossy().to_string(),
    ];
    let result = runner.run("trivy", &args, cancel).await;
    if let Some(cache) = temporary_cache {
        let _ = fs::remove_dir_all(cache);
    }
    let result = result?;
    let mut output = parse_trivy(&result.stdout, &target_label, &version)?;
    if let Some(first) = output.evidence.first_mut() {
        first
            .facts
            .insert("snapshotFiles".to_owned(), Value::from(snapshot.files()));
    }
    if snapshot.files() == 0 {
        output.conclusive = false;
    }
    output.push_gap("Snapshot limits: 128 files, 1 MiB total, depth 32, links rejected");
    output.push_gap("Package inventory reflects the prepared vulnerability database only");
    if result.exit_code != Some(0) || result.truncated {
        output.conclusive = false;
        output.push_gap("Trivy did not complete successfully");
    }
    snapshot.cleanup();
    Ok(output)
}

/// `isGatewayAddress`: loopback or one of the addresses configured locally.
pub fn is_gateway_address(target: &str, local_addresses: &[String]) -> bool {
    if matches!(target, "127.0.0.1" | "::1" | "localhost") {
        return true;
    }
    local_addresses.iter().any(|address| address == target)
}

fn local_release() -> Option<String> {
    if cfg!(target_os = "linux") {
        fs::read_to_string("/proc/sys/kernel/osrelease")
            .ok()
            .map(|value| value.trim().to_owned())
            .filter(|value| !value.is_empty())
    } else {
        None
    }
}

fn ssh_policy_from(stdout: &str) -> String {
    for line in stdout.lines() {
        if let Some(rest) = line.strip_prefix("SSH_POLICY=") {
            return rest.replace(SSH_POLICY_SEPARATOR, "\n");
        }
    }
    String::new()
}

/// `auditHost`: local gateway inventory, or a read-only remote inventory over an
/// already authorised SSH key.
pub async fn audit_host(
    target: &str,
    port: u16,
    username: Option<&str>,
    local_addresses: &[String],
    cancel: &Cancellation,
    runner: &dyn CommandRunner,
) -> Result<AdapterResult, HostError> {
    let mut output = AdapterResult {
        engine: if username.is_some() {
            "openssh-readonly-audit".to_owned()
        } else {
            "gateway-readonly-audit".to_owned()
        },
        engine_version: format!("gateway-rust/{}", env!("CARGO_PKG_VERSION")),
        evidence: Vec::new(),
        rules: Vec::new(),
        coverage_gaps: vec![
            "Read-only inventory; effective firewall rules, full package inventory, include/Match resolution and WAN reachability are not established".to_owned(),
        ],
        conclusive: false,
        raw: None,
        content_type: None,
    };
    let user = match username {
        Some(name) => name,
        None => {
            if !is_gateway_address(target, local_addresses) {
                return Err(HostError::Parse(
                    "local audit target must be an address of this gateway".to_owned(),
                ));
            }
            let os = std::env::consts::OS;
            let release = local_release();
            let mut facts = Map::new();
            facts.insert("os".to_owned(), string_value(os));
            facts.insert(
                "release".to_owned(),
                release.clone().map_or(Value::Null, Value::String),
            );
            output.evidence.push(evidence(
                target,
                Some(port),
                "Gateway operating-system inventory",
                facts,
            ));
            output.conclusive = true;
            if os == "linux" {
                match fs::read_to_string("/etc/ssh/sshd_config") {
                    Ok(config) => add_ssh_policy(&mut output, target, Some(port), &config),
                    Err(_) => output
                        .push_gap("SSH configuration was unavailable to the gateway user"),
                }
            } else {
                output.push_gap("SSH configuration audit currently supports Linux only");
            }
            return Ok(output);
        }
    };
    let client_args = vec!["-V".to_owned()];
    let client = runner.run("ssh", &client_args, cancel).await?;
    if !client.succeeded() {
        output.push_gap(
            "Authenticated audit failed; trusted SSH host keys and an existing authorized key are required",
        );
        return Ok(output);
    }
    let banner = format!("{}{}", client.stdout, client.stderr);
    let client_version = banner
        .split("OpenSSH_")
        .nth(1)
        .map(|rest| {
            rest.chars()
                .take_while(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '+' | '-'))
                .take(32)
                .collect::<String>()
        })
        .filter(|value| !value.is_empty());
    let client_version = match client_version {
        Some(version) => version,
        None => {
            output.push_gap(
                "Authenticated audit failed; trusted SSH host keys and an existing authorized key are required",
            );
            return Ok(output);
        }
    };
    let remote_args = vec![
        "-o".to_owned(),
        "BatchMode=yes".to_owned(),
        "-o".to_owned(),
        "StrictHostKeyChecking=yes".to_owned(),
        "-o".to_owned(),
        "ConnectTimeout=5".to_owned(),
        "-p".to_owned(),
        port.to_string(),
        format!("{user}@{target}"),
        REMOTE_INVENTORY_SCRIPT.to_owned(),
    ];
    let remote = runner.run("ssh", &remote_args, cancel).await?;
    if !remote.succeeded() || remote.truncated {
        output.push_gap(
            "Authenticated audit failed; trusted SSH host keys and an existing authorized key are required",
        );
        return Ok(output);
    }
    let mut os: Option<String> = None;
    let mut release: Option<String> = None;
    let mut privileged = false;
    for line in remote.stdout.lines() {
        if let Some(value) = line.strip_prefix("OS=") {
            os = Some(value.trim().to_owned());
        } else if let Some(value) = line.strip_prefix("RELEASE=") {
            release = Some(value.trim().to_owned());
        } else if let Some(value) = line.strip_prefix("UID=") {
            privileged = value.trim() == "0";
        }
    }
    output.engine_version = format!("openssh:{client_version}");
    let mut facts = Map::new();
    facts.insert("os".to_owned(), os.clone().map_or(Value::Null, Value::String));
    facts.insert(
        "release".to_owned(),
        release.clone().map_or(Value::Null, Value::String),
    );
    facts.insert("privileged".to_owned(), Value::Bool(privileged));
    output.evidence.push(evidence(
        target,
        Some(port),
        "Authenticated host inventory",
        facts,
    ));
    output.conclusive = os.is_some();
    let policy = ssh_policy_from(&remote.stdout);
    add_ssh_policy(&mut output, target, Some(port), &policy);
    Ok(output)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::os::unix::fs::symlink;

    struct Sandbox {
        path: PathBuf,
    }

    impl Sandbox {
        fn new(label: &str) -> Self {
            let path = make_temp_dir(&format!("jait-test-{label}")).expect("temp dir");
            Self { path }
        }

        fn join(&self, name: &str) -> PathBuf {
            self.path.join(name)
        }

        fn file(&self, name: &str, contents: &[u8]) -> PathBuf {
            let path = self.join(name);
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent).expect("parent");
            }
            fs::write(&path, contents).expect("write");
            path
        }
    }

    impl Drop for Sandbox {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    fn signal() -> Cancellation {
        Cancellation::new()
    }

    #[test]
    fn snapshot_skips_env_files_and_noisy_directories() {
        let sandbox = Sandbox::new("skip");
        sandbox.file("src/main.rs", b"fn main() {}\n");
        sandbox.file(".env", b"SECRET=1\n");
        sandbox.file(".env.local", b"SECRET=2\n");
        sandbox.file("node_modules/left-pad/index.js", b"module.exports=1\n");
        sandbox.file(".git/config", b"[core]\n");
        let snapshot = create_snapshot(&sandbox.path, &sandbox.path, &signal()).expect("snapshot");
        assert_eq!(snapshot.files(), 1);
        assert!(snapshot.root().join("src/main.rs").is_file());
        assert!(!snapshot.root().join(".env").exists());
        assert!(!snapshot.root().join("node_modules").exists());
    }

    #[test]
    fn snapshot_rejects_symbolic_links() {
        let sandbox = Sandbox::new("symlink");
        let real = sandbox.file("real.txt", b"secret\n");
        symlink(&real, sandbox.join("link.txt")).expect("symlink");
        let error = create_snapshot(&sandbox.path, &sandbox.path, &signal()).expect_err("reject");
        assert!(matches!(error, HostError::Path(_)));
        assert!(error.to_string().contains("symbolic links"));
    }

    #[test]
    fn snapshot_rejects_excessive_file_counts() {
        let sandbox = Sandbox::new("count");
        for index in 0..(MAX_SNAPSHOT_FILES + 1) {
            sandbox.file(&format!("f{index}.txt"), b"x");
        }
        let error = create_snapshot(&sandbox.path, &sandbox.path, &signal()).expect_err("reject");
        assert!(matches!(error, HostError::Limit(_)));
    }

    #[test]
    fn snapshot_rejects_oversized_payloads() {
        let sandbox = Sandbox::new("bytes");
        sandbox.file("big.bin", &vec![b'a'; MAX_SNAPSHOT_BYTES as usize + 1]);
        let error = create_snapshot(&sandbox.path, &sandbox.path, &signal()).expect_err("reject");
        assert!(matches!(error, HostError::Limit(_)));
    }

    #[test]
    fn snapshot_rejects_overly_deep_trees() {
        let sandbox = Sandbox::new("depth");
        let mut current = sandbox.path.clone();
        for _ in 0..(MAX_SNAPSHOT_DEPTH + 2) {
            current = current.join("d");
            fs::create_dir(&current).expect("dir");
        }
        fs::write(current.join("leaf.txt"), b"x").expect("leaf");
        let error = create_snapshot(&sandbox.path, &sandbox.path, &signal()).expect_err("reject");
        assert!(matches!(error, HostError::Limit(_)));
    }

    #[test]
    fn snapshot_blocks_path_traversal() {
        let sandbox = Sandbox::new("traversal");
        sandbox.file("inside.txt", b"x");
        let error = create_snapshot(&sandbox.path, Path::new("../outside.txt"), &signal())
            .expect_err("reject");
        assert!(matches!(error, HostError::Path(_)));
    }

    #[test]
    fn ssh_directives_use_the_first_match_case_insensitively() {
        let config = "# comment\npermitrootlogin no\nPermitRootLogin yes\n";
        assert_eq!(parse_root_login(config), Some("no".to_owned()));
        let config = "PasswordAuthentication NO # trailing\nPasswordAuthentication yes\n";
        assert_eq!(parse_password_authentication(config), Some("no".to_owned()));
        let config = "  PermitRootLogin prohibit-password\n";
        assert_eq!(parse_root_login(config), Some("prohibit-password".to_owned()));
        let config = "PermitRootLogin yes extra-token\nPermitRootLogin no\n";
        assert_eq!(parse_root_login(config), Some("no".to_owned()));
    }

    #[test]
    fn ssh_policy_flags_risky_directives() {
        let mut output = crate::security::protocols::result("gateway-readonly-audit");
        add_ssh_policy(
            &mut output,
            "10.0.0.5",
            Some(22),
            "PermitRootLogin yes\nPasswordAuthentication yes\n",
        );
        assert_eq!(output.rules.len(), 2);
        assert_eq!(output.rules[0].rule_id, "host.ssh-root-login");
        assert_eq!(output.rules[0].status, Some(RuleStatus::Suspected));
        assert!(output
            .coverage_gaps
            .iter()
            .all(|gap| !gap.contains("Missing directives")));
    }

    #[test]
    fn ssh_policy_reports_missing_directives_and_oversized_configs() {
        let mut output = crate::security::protocols::result("gateway-readonly-audit");
        add_ssh_policy(&mut output, "10.0.0.5", None, "# empty\n");
        assert!(output.rules.is_empty());
        assert!(output
            .coverage_gaps
            .iter()
            .any(|gap| gap.contains("Missing directives")));

        let mut output = crate::security::protocols::result("gateway-readonly-audit");
        let oversized = "#".repeat(MAX_SSH_CONFIG_BYTES + 1);
        add_ssh_policy(&mut output, "10.0.0.5", None, &oversized);
        assert!(output.evidence.is_empty());
        assert!(output
            .coverage_gaps
            .iter()
            .any(|gap| gap.contains("exceeded the audit limit")));
    }

    fn suricata_alert(dest: &str, signature_id: &str) -> String {
        format!(
            r#"{{"event_type":"alert","dest_ip":"{dest}","src_ip":"192.0.2.9","alert":{{"signature_id":{signature_id},"signature":"ET SCAN","severity":2}}}}"#
        )
    }

    #[test]
    fn telemetry_filters_targets_and_counts_skips() {
        let allowed = vec!["10.0.0.5".to_owned()];
        let raw = [
            suricata_alert("10.0.0.5", "2000001"),
            r#"{"event_type":"flow","dest_ip":"10.0.0.5"}"#.to_owned(),
            suricata_alert("203.0.113.7", "2000002"),
        ]
        .join("\n");
        let output = parse_telemetry(&raw, "suricata", &allowed).expect("import");
        assert_eq!(output.rules.len(), 1);
        assert_eq!(output.rules[0].rule_id, "suricata.2000001");
        assert_eq!(output.evidence.len(), 1);
        assert!(output
            .coverage_gaps
            .iter()
            .any(|gap| gap.starts_with('2') && gap.contains("skipped")));
    }

    #[test]
    fn telemetry_rejects_non_numeric_rule_ids() {
        let allowed = vec!["10.0.0.5".to_owned()];
        let raw = suricata_alert("10.0.0.5", "\"abc\"");
        let error = parse_telemetry(&raw, "suricata", &allowed).expect_err("reject");
        assert!(matches!(error, HostError::Parse(_)));

        let raw = suricata_alert("10.0.0.5", "1234567890123");
        let error = parse_telemetry(&raw, "suricata", &allowed).expect_err("reject");
        assert!(matches!(error, HostError::Parse(_)));
    }

    #[test]
    fn telemetry_enforces_event_and_size_caps() {
        let allowed = vec!["10.0.0.5".to_owned()];
        let events: Vec<String> = (0..150)
            .map(|index| suricata_alert("10.0.0.5", &format!("20000{index}")))
            .collect();
        let raw = events.join("\n");
        let output = parse_telemetry(&raw, "suricata", &allowed).expect("import");
        assert_eq!(output.rules.len(), MAX_TELEMETRY_EVENTS);

        let oversized = "x".repeat(MAX_TELEMETRY_BYTES + 1);
        let error = parse_telemetry(&oversized, "suricata", &allowed).expect_err("reject");
        assert!(matches!(error, HostError::Limit(_)));
    }

    #[test]
    fn telemetry_rejects_garbage_lines() {
        let allowed = vec!["10.0.0.5".to_owned()];
        let error = parse_telemetry("not json", "suricata", &allowed).expect_err("reject");
        assert!(matches!(error, HostError::Parse(_)));
        let output = parse_telemetry("", "suricata", &allowed).expect("empty import");
        assert!(output.rules.is_empty());
        assert!(output.coverage_gaps.is_empty());
    }

    #[test]
    fn gateway_addresses_accept_loopback_and_configured_addresses() {
        let local = vec!["10.0.0.5".to_owned()];
        assert!(is_gateway_address("127.0.0.1", &local));
        assert!(is_gateway_address("::1", &local));
        assert!(is_gateway_address("10.0.0.5", &local));
        assert!(!is_gateway_address("203.0.113.7", &local));
    }

    #[test]
    fn cache_metadata_must_be_a_prepared_database() {
        let sandbox = Sandbox::new("cache");
        fs::create_dir_all(sandbox.join("db")).expect("db dir");
        let error = read_cache_version(&sandbox.path).expect_err("missing metadata");
        assert!(error.is_unavailable());

        sandbox.file("db/metadata.json", b"{\"Version\":1}");
        let error = read_cache_version(&sandbox.path).expect_err("old metadata");
        assert!(error.is_unavailable());

        sandbox.file("db/metadata.json", b"{\"Version\":2}");
        let version = read_cache_version(&sandbox.path).expect("metadata");
        assert_eq!(version.len(), "db-".len() + 16);
    }
}
