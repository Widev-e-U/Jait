//! Native port of `packages/gateway/src/services/network-resources.ts`.
//!
//! Guarantees carried over from the TypeScript service:
//!
//! * only the six selected `docker inspect` fields leave Docker (`id`, `name`,
//!   `image`, `state`, `created`, `networks`); environment, mounts and arbitrary
//!   labels are never requested;
//! * resource parents stay local: a `DOCKER_HOST` that is neither `unix://` nor
//!   `npipe://` fails closed *before* any child process is spawned;
//! * every argv is built without a shell and bounded (8 s, 8 MiB per stream),
//!   mirroring `crate::runtime::command` semantics (errno mapping, stderr in the
//!   failure message, kill + reap on timeout/overflow);
//! * at most [`MAX_CONTAINERS`] containers are inspected, in batches of
//!   [`INSPECT_BATCH`], which also keeps argv under Windows command limits;
//! * a [`TTL_MS`] cache plus in-flight coalescing means concurrent polls share
//!   exactly one collection;
//! * Docker failures degrade to `status: "unavailable"` (never a thrown poll)
//!   and are cached for the same TTL so a broken daemon cannot amplify into a
//!   poll storm.
//!
//! External effects are injected through [`LocalDockerHost`] (environment,
//! platform, home directory, socket probe and the bounded launch) and
//! [`DockerRunner`] (argv → stdout). [`Clock`] is injected for the TTL and for
//! `observedAt`, so tests own time rather than sleeping.

use crate::contracts::bounded_json::Utf16Text;
use std::{
    collections::HashSet,
    future::Future,
    process::Stdio,
    sync::{Arc, Mutex, MutexGuard},
    time::Duration,
};

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use tokio::io::{AsyncRead, AsyncReadExt};

/// Hard cap on inspected containers, matching the TypeScript service.
pub const MAX_CONTAINERS: usize = 512;
/// Containers per `docker inspect` invocation.
pub const INSPECT_BATCH: usize = 32;
/// Cache lifetime for both successful and failed collections.
pub const TTL_MS: i64 = 30_000;
/// Bounded execution deadline for a single Docker invocation.
pub const INSPECT_TIMEOUT_MS: u64 = 8_000;
/// Bounded stdout/stderr budget for a single Docker invocation.
pub const INSPECT_MAX_BUFFER: usize = 8 * 1024 * 1024;
/// Container listing argv (`docker --host <endpoint> ...LIST_ARGV`).
pub const LIST_ARGV: [&str; 5] = ["ps", "--all", "--no-trunc", "--format", "{{.ID}}"];
/// Field projection passed to `docker inspect --format`.
pub const INSPECT_FORMAT: &str = "{\"id\":{{json .Id}},\"name\":{{json .Name}},\"image\":{{json .Config.Image}},\"state\":{{json .State.Status}},\"created\":{{json .Created}},\"networks\":{{json .NetworkSettings.Networks}}}";

// ---------------------------------------------------------------------------
// Shared resource shape (`@jait/shared` `NetworkResource` / inventory)
// ---------------------------------------------------------------------------

/// Literal discriminant of every inventory resource.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum NodeType {
    Resource,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ResourceKind {
    Container,
    Group,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ResourceIcon {
    Docker,
    Jait,
    Nginx,
    Redis,
    Postgresql,
    Homeassistant,
    /// Legacy JS inherited functions disappear when this field is serialized.
    InheritedFunction,
    #[serde(untagged)]
    ObjectPrototype {},
}
impl ResourceIcon {
    fn is_omitted(&self) -> bool {
        matches!(self, Self::InheritedFunction)
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ResourceCategory {
    Sandbox,
    Application,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum InventoryStatus {
    Available,
    Unavailable,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ResourceFact {
    pub label: String,
    pub value: Utf16Text,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkResource {
    pub id: String,
    #[serde(rename = "type")]
    pub node_type: NodeType,
    pub kind: ResourceKind,
    pub name: Utf16Text,
    pub parent_id: String,
    #[serde(skip_serializing_if = "ResourceIcon::is_omitted")]
    pub icon: ResourceIcon,
    pub online: bool,
    pub status: String,
    pub source: String,
    pub observed_at: String,
    pub addresses: Vec<String>,
    pub category: ResourceCategory,
    pub facts: Vec<ResourceFact>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkResourceInventory {
    pub status: InventoryStatus,
    pub resources: Vec<NetworkResource>,
    /// Present only for `available` results, exactly like the TypeScript union.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub truncated: Option<bool>,
}

impl NetworkResourceInventory {
    pub fn available(resources: Vec<NetworkResource>, truncated: bool) -> Self {
        Self {
            status: InventoryStatus::Available,
            resources,
            truncated: Some(truncated),
        }
    }

    pub fn unavailable() -> Self {
        Self {
            status: InventoryStatus::Unavailable,
            resources: Vec::new(),
            truncated: None,
        }
    }
}

// ---------------------------------------------------------------------------
// JavaScript semantics helpers
// ---------------------------------------------------------------------------

fn is_js_whitespace(value: char) -> bool {
    matches!(
        value,
        '\u{0009}'..='\u{000d}'
            | '\u{0020}'
            | '\u{00a0}'
            | '\u{1680}'
            | '\u{2000}'..='\u{200a}'
            | '\u{2028}'
            | '\u{2029}'
            | '\u{202f}'
            | '\u{205f}'
            | '\u{3000}'
            | '\u{feff}'
    )
}

fn is_js_line_terminator(value: char) -> bool {
    matches!(value, '\n' | '\r' | '\u{2028}' | '\u{2029}')
}

/// `String.prototype.trim`.
fn js_trim(value: &str) -> &str {
    value.trim_matches(is_js_whitespace)
}

/// `value.split(/\r?\n/)`.
fn js_lines(value: &str) -> Vec<&str> {
    let bytes = value.as_bytes();
    let mut lines = Vec::new();
    let mut start = 0;
    for (index, byte) in bytes.iter().enumerate() {
        if *byte != b'\n' {
            continue;
        }
        let mut end = index;
        if end > start && bytes[end - 1] == b'\r' {
            end -= 1;
        }
        lines.push(&value[start..end]);
        start = index + 1;
    }
    lines.push(&value[start..]);
    lines
}

/// JavaScript slices keep lone UTF-16 code units; serialize them as escapes.
fn js_utf16_prefix(value: &str, max_units: usize) -> Utf16Text {
    Utf16Text(value.encode_utf16().take(max_units).collect())
}

/// `/^[a-f0-9]{12,64}$/`.
fn is_container_id(value: &str) -> bool {
    (12..=64).contains(&value.len())
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

/// `/^[a-f0-9]{64}$/` — the listing filter, which is stricter than the row
/// mapper's `/^[a-f0-9]{12,64}$/`.
fn is_full_container_id(value: &str) -> bool {
    value.len() == 64 && is_container_id(value)
}

/// `/\d{1,3}(?:\.\d{1,3}){3}/` anchored, with ASCII digits only.
fn is_ipv4_literal(value: &str) -> bool {
    let mut parts = 0;
    for part in value.split('.') {
        parts += 1;
        if part.is_empty() || part.len() > 3 || !part.bytes().all(|byte| byte.is_ascii_digit()) {
            return false;
        }
    }
    parts == 4
}

/// `Object.keys` ordering: array-index keys ascending, then insertion order.
fn is_array_index(key: &str) -> Option<u32> {
    if key.is_empty() || key.len() > 10 {
        return None;
    }
    if key.len() > 1 && key.starts_with('0') {
        return None;
    }
    if !key.bytes().all(|byte| byte.is_ascii_digit()) {
        return None;
    }
    let value: u64 = key.parse().ok()?;
    (value < 4_294_967_295).then_some(value as u32)
}

fn javascript_object_entries(map: &Map<String, Value>) -> Vec<(&String, &Value)> {
    let mut indexed: Vec<(u32, &String, &Value)> = Vec::new();
    let mut named: Vec<(&String, &Value)> = Vec::new();
    for (key, value) in map {
        match is_array_index(key) {
            Some(index) => indexed.push((index, key, value)),
            None => named.push((key, value)),
        }
    }
    indexed.sort_by_key(|(index, _, _)| *index);
    let mut ordered: Vec<(&String, &Value)> = indexed
        .into_iter()
        .map(|(_, key, value)| (key, value))
        .collect();
    ordered.extend(named);
    ordered
}

/// `image.replace(/@.*$/, '')` leftmost-match semantics.
fn first_at_without_line_terminator(value: &str) -> Option<usize> {
    for (index, character) in value.char_indices() {
        if character == '@'
            && !value[index + character.len_utf8()..]
                .chars()
                .any(is_js_line_terminator)
        {
            return Some(index);
        }
    }
    None
}

/// `value.replace(/:[^/]*$/, '')` leftmost-match semantics.
fn first_colon_without_slash(value: &str) -> Option<usize> {
    for (index, character) in value.char_indices() {
        if character == ':' && !value[index + character.len_utf8()..].contains('/') {
            return Some(index);
        }
    }
    None
}

/// Repository derived exactly as the TypeScript icon lookup derives it.
fn docker_repository(image: &str) -> String {
    let mut repository = image;
    if let Some(index) = first_at_without_line_terminator(repository) {
        repository = &repository[..index];
    }
    if let Some(index) = first_colon_without_slash(repository) {
        repository = &repository[..index];
    }
    if let Some(rest) = repository.strip_prefix("docker.io/library/") {
        repository = rest;
    } else if let Some(rest) = repository.strip_prefix("docker.io/") {
        repository = rest;
    }
    repository.to_string()
}

fn icon_for_repository(repository: &str) -> ResourceIcon {
    match repository {
        "nginx" => ResourceIcon::Nginx,
        "redis" => ResourceIcon::Redis,
        "postgres" => ResourceIcon::Postgresql,
        "ghcr.io/home-assistant/home-assistant" | "homeassistant/home-assistant" => {
            ResourceIcon::Homeassistant
        }
        "__proto__" => ResourceIcon::ObjectPrototype {},
        "constructor"
        | "toString"
        | "valueOf"
        | "hasOwnProperty"
        | "isPrototypeOf"
        | "propertyIsEnumerable"
        | "toLocaleString"
        | "__defineGetter__"
        | "__defineSetter__"
        | "__lookupGetter__"
        | "__lookupSetter__" => ResourceIcon::InheritedFunction,
        _ => ResourceIcon::Docker,
    }
}

// ---------------------------------------------------------------------------
// `containerResource`
// ---------------------------------------------------------------------------

/// Project one `docker inspect` row into a [`NetworkResource`].
///
/// Returns `None` for every shape the TypeScript mapper rejects, including a
/// container id outside `[a-f0-9]{12,64}` and non-string metadata fields.
pub fn container_resource(value: &Value, observed_at: &str) -> Option<NetworkResource> {
    let Value::Object(row) = value else {
        return None;
    };
    let id = row.get("id")?.as_str()?;
    if !is_container_id(id) {
        return None;
    }
    let raw_name = row.get("name")?.as_str()?;
    let raw_image = row.get("image")?.as_str()?;
    let state = row.get("state")?.as_str()?;
    let name = js_utf16_prefix(raw_name.strip_prefix('/').unwrap_or(raw_name), 256);
    let image = js_utf16_prefix(raw_image, 512);
    let name_text = String::from_utf16_lossy(&name.0);
    let image_text = String::from_utf16_lossy(&image.0);
    let sandbox = (name_text.starts_with("jait-sb-") || name_text.starts_with("jait-agent-sb-"))
        && image_text.starts_with("jait/");
    let repository = docker_repository(&image_text);
    let icon = if sandbox {
        ResourceIcon::Jait
    } else {
        icon_for_repository(&repository)
    };
    // `Object.values(networks)` over an object or array; anything else is `{}`.
    let network_entries: Vec<(String, &Value)> = match row.get("networks") {
        Some(Value::Object(map)) => javascript_object_entries(map)
            .into_iter()
            .map(|(key, value)| (key.clone(), value))
            .collect(),
        Some(Value::Array(items)) => items
            .iter()
            .enumerate()
            .map(|(index, value)| (index.to_string(), value))
            .collect(),
        _ => Vec::new(),
    };
    let mut addresses: Vec<String> = Vec::new();
    let mut seen: HashSet<&str> = HashSet::new();
    for (_, network) in &network_entries {
        let ip = match network {
            Value::Object(fields) => fields.get("IPAddress").and_then(Value::as_str),
            _ => None,
        };
        if let Some(ip) = ip
            && is_ipv4_literal(ip)
            && seen.insert(ip)
        {
            addresses.push(ip.to_string());
        }
    }
    let networks = network_entries
        .iter()
        .map(|(key, _)| key.as_str())
        .collect::<Vec<_>>()
        .join(", ");
    let mut facts = vec![
        ResourceFact {
            label: "Image".into(),
            value: image.clone(),
        },
        ResourceFact {
            label: "Container ID".into(),
            value: id.into(),
        },
    ];
    if sandbox {
        facts.push(ResourceFact {
            label: "Owner".into(),
            value: "Not recorded".into(),
        });
    }
    facts.push(ResourceFact {
        label: "Networks".into(),
        value: if networks.is_empty() {
            "None".into()
        } else {
            networks.into()
        },
    });
    if let Some(created) = row.get("created").and_then(Value::as_str) {
        facts.push(ResourceFact {
            label: "Created".into(),
            value: created.into(),
        });
    }
    facts.push(ResourceFact {
        label: "Access".into(),
        value: "Metadata available".into(),
    });
    Some(NetworkResource {
        id: format!("docker-{id}"),
        node_type: NodeType::Resource,
        kind: ResourceKind::Container,
        name,
        parent_id: "gateway".into(),
        icon,
        online: state == "running",
        status: state.to_string(),
        source: "Local Docker inventory".into(),
        observed_at: observed_at.to_string(),
        addresses,
        category: if sandbox {
            ResourceCategory::Sandbox
        } else {
            ResourceCategory::Application
        },
        facts,
    })
}

// ---------------------------------------------------------------------------
// Failures
// ---------------------------------------------------------------------------

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum DockerErrorKind {
    /// `DOCKER_HOST` points at a remote context; no child was spawned.
    NonLocalEndpoint,
    /// `execFile` rejected before the child existed (errno code preserved).
    Spawn { code: String },
    /// The child exited non-zero.
    Exit { code: i32 },
    /// The child was killed by a signal.
    Signaled,
    /// The bounded deadline elapsed; the child was killed and reaped.
    Timeout,
    /// A stream exceeded [`INSPECT_MAX_BUFFER`].
    MaxBuffer,
    /// `docker inspect` produced a line that is not JSON.
    Decode,
    /// An argument could not be passed to `execFile`.
    InvalidArgument,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DockerError {
    pub kind: DockerErrorKind,
    pub message: String,
}

impl DockerError {
    pub fn new(kind: DockerErrorKind, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
        }
    }
}

impl std::fmt::Display for DockerError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl std::error::Error for DockerError {}

/// Symbolic code for the errno values Node surfaces from a failed `execFile`.
///
/// Kept dependency free (no `libc`) so this module compiles unchanged inside the
/// contract crate, which does not declare `libc`.
#[cfg(all(unix, target_os = "linux"))]
const ERRNO_CODES: &[(i32, &str)] = &[
    (1, "EPERM"),
    (2, "ENOENT"),
    (7, "E2BIG"),
    (8, "ENOEXEC"),
    (12, "ENOMEM"),
    (13, "EACCES"),
    (20, "ENOTDIR"),
    (23, "ENFILE"),
    (24, "EMFILE"),
    (26, "ETXTBSY"),
    (36, "ENAMETOOLONG"),
    (40, "ELOOP"),
];

#[cfg(all(unix, not(target_os = "linux")))]
const ERRNO_CODES: &[(i32, &str)] = &[
    (1, "EPERM"),
    (2, "ENOENT"),
    (7, "E2BIG"),
    (8, "ENOEXEC"),
    (12, "ENOMEM"),
    (13, "EACCES"),
    (20, "ENOTDIR"),
    (23, "ENFILE"),
    (24, "EMFILE"),
    (26, "ETXTBSY"),
    (63, "ENAMETOOLONG"),
    (62, "ELOOP"),
];

/// errno → symbolic code, mirroring `crate::runtime::command`'s mapping.
pub fn spawn_error_code(error: &std::io::Error) -> String {
    if let Some(raw) = error.raw_os_error() {
        #[cfg(unix)]
        if let Some((_, code)) = ERRNO_CODES.iter().find(|(value, _)| *value == raw) {
            return (*code).into();
        }
        let _ = raw;
    }
    match error.kind() {
        std::io::ErrorKind::NotFound => "ENOENT".into(),
        std::io::ErrorKind::PermissionDenied => "EACCES".into(),
        std::io::ErrorKind::OutOfMemory => "ENOMEM".into(),
        _ => error.to_string(),
    }
}

// ---------------------------------------------------------------------------
// Bounded local execution (mirrors `runtime::command`)
// ---------------------------------------------------------------------------

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CommandOutput {
    pub stdout: String,
    pub stderr: String,
}

fn command_line(program: &str, argv: &[String]) -> String {
    std::iter::once(program)
        .chain(argv.iter().map(String::as_str))
        .collect::<Vec<_>>()
        .join(" ")
}

async fn read_pipe(
    mut pipe: impl AsyncRead + Unpin,
    limit: usize,
    name: &str,
    bytes: &mut Vec<u8>,
) -> Result<(), DockerError> {
    let mut chunk = [0u8; 8192];
    loop {
        let read = pipe.read(&mut chunk).await.map_err(|error| {
            DockerError::new(
                DockerErrorKind::Spawn { code: "EIO".into() },
                error.to_string(),
            )
        })?;
        if read == 0 {
            return Ok(());
        }
        if read > limit.saturating_sub(bytes.len()) {
            return Err(DockerError::new(
                DockerErrorKind::MaxBuffer,
                format!("{name} maxBuffer length exceeded"),
            ));
        }
        bytes.extend_from_slice(&chunk[..read]);
    }
}

/// Run one bounded, shell-free child process and return its decoded streams.
///
/// Semantics intentionally match `crate::runtime::command`: piped stdin closed,
/// independent per-stream buffer limits, kill + reap on timeout, errno mapping
/// and a `Command failed: <argv>` message carrying stderr.
pub async fn exec_bounded(
    program: &str,
    argv: &[String],
    timeout_ms: u64,
    max_buffer: usize,
) -> Result<CommandOutput, DockerError> {
    if let Some(index) = argv.iter().position(|argument| argument.contains('\0')) {
        return Err(DockerError::new(
            DockerErrorKind::InvalidArgument,
            format!("The argument 'args[{index}]' must be a string without null bytes"),
        ));
    }
    if program.contains('\0') {
        return Err(DockerError::new(
            DockerErrorKind::InvalidArgument,
            "The program must be a string without null bytes",
        ));
    }
    let mut builder = tokio::process::Command::new(program);
    builder
        .args(argv)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    let mut child = builder.spawn().map_err(|error| {
        let code = spawn_error_code(&error);
        DockerError::new(
            DockerErrorKind::Spawn { code: code.clone() },
            format!("spawn {program} {code}"),
        )
    })?;
    let stdout = child.stdout.take().expect("piped stdout");
    let stderr = child.stderr.take().expect("piped stderr");
    let mut stdout_bytes = Vec::new();
    let mut stderr_bytes = Vec::new();
    let completed = tokio::time::timeout(Duration::from_millis(timeout_ms), async {
        tokio::try_join!(
            read_pipe(stdout, max_buffer, "stdout", &mut stdout_bytes),
            read_pipe(stderr, max_buffer, "stderr", &mut stderr_bytes),
            async {
                child.wait().await.map_err(|error| {
                    DockerError::new(
                        DockerErrorKind::Spawn { code: "EIO".into() },
                        error.to_string(),
                    )
                })
            }
        )
    })
    .await;
    let status = match completed {
        Ok(Ok((_, _, status))) => status,
        Ok(Err(failure)) => {
            let _ = child.start_kill();
            let _ = child.wait().await;
            return Err(failure);
        }
        Err(_elapsed) => {
            let _ = child.start_kill();
            let _ = child.wait().await;
            let stderr = String::from_utf8_lossy(&stderr_bytes);
            return Err(DockerError::new(
                DockerErrorKind::Timeout,
                if stderr.is_empty() {
                    format!("Command failed: {} (timeout)", command_line(program, argv))
                } else {
                    format!(
                        "Command failed: {} (timeout)\n{stderr}",
                        command_line(program, argv)
                    )
                },
            ));
        }
    };
    let stdout = String::from_utf8_lossy(&stdout_bytes).into_owned();
    let stderr = String::from_utf8_lossy(&stderr_bytes).into_owned();
    if !status.success() {
        let command = command_line(program, argv);
        let message = if stderr.is_empty() {
            format!("Command failed: {command}")
        } else {
            format!("Command failed: {command}\n{stderr}")
        };
        return Err(DockerError::new(
            match status.code() {
                Some(code) => DockerErrorKind::Exit { code },
                None => DockerErrorKind::Signaled,
            },
            message,
        ));
    }
    Ok(CommandOutput { stdout, stderr })
}

// ---------------------------------------------------------------------------
// Injected boundaries
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DockerPlatform {
    Linux,
    Darwin,
    Win32,
    Other,
}

impl DockerPlatform {
    /// Node's `process.platform` value.
    pub fn from_name(value: &str) -> Self {
        match value {
            "linux" => Self::Linux,
            "darwin" => Self::Darwin,
            "win32" => Self::Win32,
            _ => Self::Other,
        }
    }

    pub fn is_windows(self) -> bool {
        matches!(self, Self::Win32)
    }
}

/// Everything the default runner needs from its host: Node's `process.env`,
/// `platform()`, `homedir()`, `existsSync` and `execFile`.
pub trait LocalDockerHost: Send + Sync {
    fn docker_host(&self) -> Option<String>;
    fn platform(&self) -> DockerPlatform;
    fn home_dir(&self) -> String;
    fn socket_exists(&self, path: &str) -> bool;
    fn launch(
        &self,
        program: &str,
        argv: &[String],
    ) -> impl Future<Output = Result<CommandOutput, DockerError>> + Send;
}

pub trait DockerRunner: Send + Sync {
    /// Equivalent of the injected `run(args)` adapter: resolves argv to stdout.
    fn run(&self, args: &[String]) -> impl Future<Output = Result<String, DockerError>> + Send;
}

impl<R: DockerRunner + ?Sized> DockerRunner for Arc<R> {
    async fn run(&self, args: &[String]) -> Result<String, DockerError> {
        (**self).run(args).await
    }
}

pub trait Clock: Send + Sync {
    fn now_ms(&self) -> i64;
}

#[derive(Clone, Copy, Debug, Default)]
pub struct SystemClock;

impl Clock for SystemClock {
    fn now_ms(&self) -> i64 {
        chrono::Utc::now().timestamp_millis()
    }
}

/// `new Date(ms).toISOString()` for representable milliseconds.
pub fn js_iso_timestamp(now_ms: i64) -> String {
    chrono::DateTime::from_timestamp_millis(now_ms)
        .map(|timestamp| timestamp.format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string())
        .unwrap_or_else(|| "1970-01-01T00:00:00.000Z".to_string())
}

/// Real host boundary: inherited environment, real socket probe, bounded
/// `docker` child process.
#[derive(Clone, Debug)]
pub struct SystemDockerHost {
    timeout_ms: u64,
    max_buffer: usize,
}

impl Default for SystemDockerHost {
    fn default() -> Self {
        Self::new()
    }
}

impl SystemDockerHost {
    pub fn new() -> Self {
        Self::with_limits(INSPECT_TIMEOUT_MS, INSPECT_MAX_BUFFER)
    }

    pub fn with_limits(timeout_ms: u64, max_buffer: usize) -> Self {
        Self {
            timeout_ms,
            max_buffer,
        }
    }
}

impl LocalDockerHost for SystemDockerHost {
    fn docker_host(&self) -> Option<String> {
        std::env::var("DOCKER_HOST").ok()
    }

    fn platform(&self) -> DockerPlatform {
        DockerPlatform::from_name(std::env::consts::OS)
    }

    fn home_dir(&self) -> String {
        // Node falls back to the passwd entry when HOME is unset; the native
        // port uses an empty home (documented platform gap).
        std::env::var("HOME").unwrap_or_default()
    }

    fn socket_exists(&self, path: &str) -> bool {
        std::path::Path::new(path).exists()
    }

    fn launch(
        &self,
        program: &str,
        argv: &[String],
    ) -> impl Future<Output = Result<CommandOutput, DockerError>> + Send {
        let program = program.to_string();
        let argv = argv.to_vec();
        let timeout_ms = self.timeout_ms;
        let max_buffer = self.max_buffer;
        async move { exec_bounded(&program, &argv, timeout_ms, max_buffer).await }
    }
}

/// Resolve the local Docker endpoint, failing closed for remote contexts.
pub fn resolve_endpoint(host: &impl LocalDockerHost) -> Result<String, DockerError> {
    let configured = host.docker_host();
    if let Some(value) = configured.as_deref()
        && !value.is_empty()
        && !value.starts_with("unix://")
        && !value.starts_with("npipe://")
    {
        return Err(DockerError::new(
            DockerErrorKind::NonLocalEndpoint,
            "Non-local Docker endpoint",
        ));
    }
    // `configured ?? default`: an empty DOCKER_HOST stays empty (the TS service
    // passes `--host ''` rather than falling back), so it is preserved here.
    if let Some(value) = configured {
        return Ok(value);
    }
    if host.platform().is_windows() {
        return Ok("npipe:////./pipe/docker_engine".to_string());
    }
    let socket = format!("{}/.docker/run/docker.sock", host.home_dir());
    if host.socket_exists(&socket) {
        Ok(format!("unix://{socket}"))
    } else {
        Ok("unix:///var/run/docker.sock".to_string())
    }
}

/// Default `run` adapter: guard, endpoint, `--host` argv, bounded launch.
pub struct LocalDockerRunner<H: LocalDockerHost> {
    host: H,
    program: String,
}

impl<H: LocalDockerHost> LocalDockerRunner<H> {
    pub fn new(host: H) -> Self {
        Self::with_program(host, "docker")
    }

    pub fn with_program(host: H, program: impl Into<String>) -> Self {
        Self {
            host,
            program: program.into(),
        }
    }
}

impl<H: LocalDockerHost> DockerRunner for LocalDockerRunner<H> {
    async fn run(&self, args: &[String]) -> Result<String, DockerError> {
        let endpoint = resolve_endpoint(&self.host)?;
        let mut argv = Vec::with_capacity(args.len() + 2);
        argv.push("--host".to_string());
        argv.push(endpoint);
        argv.extend_from_slice(args);
        let output = self.host.launch(&self.program, &argv).await?;
        Ok(output.stdout)
    }
}

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------

struct CacheEntry {
    at_ms: i64,
    value: NetworkResourceInventory,
}

struct Pending {
    sender: tokio::sync::watch::Sender<Option<NetworkResourceInventory>>,
    receiver: tokio::sync::watch::Receiver<Option<NetworkResourceInventory>>,
}

impl Pending {
    fn new() -> Self {
        let (sender, receiver) = tokio::sync::watch::channel(None);
        Self { sender, receiver }
    }

    async fn wait(&self) -> NetworkResourceInventory {
        let mut receiver = self.receiver.clone();
        loop {
            let current = {
                let borrowed = receiver.borrow_and_update();
                borrowed.clone()
            };
            if let Some(value) = current {
                return value;
            }
            if receiver.changed().await.is_err() {
                return NetworkResourceInventory::unavailable();
            }
        }
    }
}

#[derive(Default)]
struct State {
    cached: Option<CacheEntry>,
    pending: Option<Arc<Pending>>,
}

enum Decision {
    Collect(Arc<Pending>),
    Await(Arc<Pending>),
}

/// Port of the TypeScript `DockerResourceInventory` class.
pub struct DockerResourceInventory<R: DockerRunner, C: Clock = SystemClock> {
    runner: Arc<R>,
    clock: Arc<C>,
    state: Arc<Mutex<State>>,
}

impl<R: DockerRunner + 'static> DockerResourceInventory<R, SystemClock> {
    pub fn new(runner: R) -> Self {
        Self::with_clock(runner, SystemClock)
    }
}

impl<R: DockerRunner + 'static, C: Clock + 'static> DockerResourceInventory<R, C> {
    pub fn with_clock(runner: R, clock: C) -> Self {
        Self {
            runner: Arc::new(runner),
            clock: Arc::new(clock),
            state: Arc::new(Mutex::new(State::default())),
        }
    }

    fn state(&self) -> MutexGuard<'_, State> {
        self.state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    /// Cached collection when fresh, the in-flight collection when one exists,
    /// otherwise a new collection shared with every concurrent caller.
    pub async fn get(&self) -> NetworkResourceInventory {
        let decision = {
            let mut state = self.state();
            if let Some(entry) = state.cached.as_ref()
                && self.clock.now_ms() - entry.at_ms < TTL_MS
            {
                return entry.value.clone();
            }
            match state.pending.clone() {
                Some(pending) => Decision::Await(pending),
                None => {
                    let pending = Arc::new(Pending::new());
                    state.pending = Some(pending.clone());
                    Decision::Collect(pending)
                }
            }
        };
        match decision {
            Decision::Await(pending) => pending.wait().await,
            Decision::Collect(pending) => {
                // The shared operation outlives any one subscriber, as the TS
                // Promise does. Dropping the initiating poll must not strand it.
                let runner = self.runner.clone();
                let clock = self.clock.clone();
                let state = self.state.clone();
                let publisher = pending.clone();
                tokio::spawn(async move {
                    let value = collect(runner.as_ref(), clock.as_ref())
                        .await
                        .unwrap_or_else(|_| NetworkResourceInventory::unavailable());
                    {
                        let mut state = state.lock().unwrap_or_else(|e| e.into_inner());
                        state.cached = Some(CacheEntry {
                            at_ms: clock.now_ms(),
                            value: value.clone(),
                        });
                        state.pending = None;
                    }
                    let _ = publisher.sender.send(Some(value));
                });
                pending.wait().await
            }
        }
    }
}

async fn collect<R: DockerRunner>(
    runner: &R,
    clock: &impl Clock,
) -> Result<NetworkResourceInventory, DockerError> {
    let listing = runner.run(&LIST_ARGV.map(str::to_string)).await?;
    let ids: Vec<String> = js_lines(js_trim(&listing))
        .into_iter()
        .filter(|line| is_full_container_id(line))
        .map(str::to_string)
        .collect();
    let truncated = ids.len() > MAX_CONTAINERS;
    let observed_at = js_iso_timestamp(clock.now_ms());
    let mut resources = Vec::new();
    for chunk in ids[..ids.len().min(MAX_CONTAINERS)].chunks(INSPECT_BATCH) {
        let mut args: Vec<String> = vec![
            "inspect".to_string(),
            "--type".to_string(),
            "container".to_string(),
            "--format".to_string(),
            INSPECT_FORMAT.to_string(),
        ];
        args.extend(chunk.iter().cloned());
        let output = runner.run(&args).await?;
        for line in js_lines(js_trim(&output)) {
            if line.is_empty() {
                continue;
            }
            let value: Value = serde_json::from_str(line).map_err(|error| {
                DockerError::new(
                    DockerErrorKind::Decode,
                    format!("invalid docker inspect JSON: {error}"),
                )
            })?;
            if let Some(resource) = container_resource(&value, &observed_at) {
                resources.push(resource);
            }
        }
    }
    Ok(NetworkResourceInventory::available(resources, truncated))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::collections::VecDeque;
    use std::path::{Path, PathBuf};
    use std::sync::atomic::{AtomicBool, Ordering};

    const ID_A: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    const ID_B: &str = "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";
    const OBSERVED: &str = "2026-10-20T06:30:00.000Z";

    fn artifact_root() -> PathBuf {
        if let Ok(path) = std::env::var("JAIT_NETWORK_RESOURCES_ARTIFACTS") {
            return PathBuf::from(path);
        }
        let mut directory = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        loop {
            if directory
                .join("packages/gateway-rust/src/services")
                .is_dir()
            {
                return directory
                    .join(".jait/artifacts/gateway-rust/parallel-20261020/network-resources");
            }
            if !directory.pop() {
                panic!("cannot locate the repository root for owned fixtures");
            }
        }
    }

    fn owned_directory(name: &str) -> PathBuf {
        let directory = artifact_root()
            .join("native-tests")
            .join(format!("{name}-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&directory).unwrap();
        directory
    }

    fn row(id: &str, name: &str, image: &str, state: &str) -> Value {
        json!({
            "id": id, "name": name, "image": image, "state": state,
            "created": "2026-10-20T06:00:00.000000000Z",
            "networks": {"bridge": {"IPAddress": "172.17.0.2"}},
        })
    }

    fn listing(ids: &[&str]) -> String {
        let mut text = ids.join("\n");
        text.push('\n');
        text
    }

    fn inspect(rows: &[Value]) -> String {
        rows.iter()
            .map(|row| row.to_string())
            .collect::<Vec<_>>()
            .join("\n")
    }

    fn hex_id(seed: u64) -> String {
        format!("{seed:064x}")
    }

    #[derive(Clone, Default)]
    struct ManualClock {
        now: Arc<Mutex<i64>>,
    }

    impl ManualClock {
        fn new(now_ms: i64) -> Self {
            Self {
                now: Arc::new(Mutex::new(now_ms)),
            }
        }

        fn advance(&self, delta_ms: i64) {
            *self.now.lock().unwrap() += delta_ms;
        }
    }

    impl Clock for ManualClock {
        fn now_ms(&self) -> i64 {
            *self.now.lock().unwrap()
        }
    }

    #[derive(Clone, Default)]
    struct FakeRunner {
        responses: Arc<Mutex<VecDeque<Result<String, DockerError>>>>,
        calls: Arc<Mutex<Vec<Vec<String>>>>,
        opened: Option<Arc<AtomicBool>>,
    }

    impl FakeRunner {
        fn new(responses: Vec<Result<String, DockerError>>) -> Self {
            Self {
                responses: Arc::new(Mutex::new(responses.into())),
                calls: Arc::new(Mutex::new(Vec::new())),
                opened: None,
            }
        }

        fn gated(responses: Vec<Result<String, DockerError>>, opened: Arc<AtomicBool>) -> Self {
            Self {
                opened: Some(opened),
                ..Self::new(responses)
            }
        }

        fn calls(&self) -> Vec<Vec<String>> {
            self.calls.lock().unwrap().clone()
        }
    }

    impl DockerRunner for FakeRunner {
        fn run(&self, args: &[String]) -> impl Future<Output = Result<String, DockerError>> + Send {
            let calls = self.calls.clone();
            let responses = self.responses.clone();
            let opened = self.opened.clone();
            let args = args.to_vec();
            async move {
                calls.lock().unwrap().push(args);
                if let Some(opened) = opened {
                    while !opened.load(Ordering::SeqCst) {
                        tokio::time::sleep(Duration::from_millis(1)).await;
                    }
                }
                responses
                    .lock()
                    .unwrap()
                    .pop_front()
                    .unwrap_or_else(|| Ok(String::new()))
            }
        }
    }

    #[derive(Clone)]
    struct FakeHost {
        docker_host: Option<String>,
        platform: DockerPlatform,
        home: String,
        sockets: Vec<String>,
        responses: Arc<Mutex<VecDeque<Result<CommandOutput, DockerError>>>>,
        calls: HostCalls,
    }

    impl FakeHost {
        fn new(docker_host: Option<&str>) -> Self {
            Self {
                docker_host: docker_host.map(str::to_string),
                platform: DockerPlatform::Linux,
                home: "/owned/home".into(),
                sockets: Vec::new(),
                responses: Arc::new(Mutex::new(VecDeque::new())),
                calls: Arc::new(Mutex::new(Vec::new())),
            }
        }

        fn with_socket(mut self, socket: &str) -> Self {
            self.sockets.push(socket.to_string());
            self
        }

        fn with_platform(mut self, platform: DockerPlatform) -> Self {
            self.platform = platform;
            self
        }

        fn respond(self, value: Result<CommandOutput, DockerError>) -> Self {
            self.responses.lock().unwrap().push_back(value);
            self
        }

        fn calls(&self) -> Vec<(String, Vec<String>)> {
            self.calls.lock().unwrap().clone()
        }
    }

    impl LocalDockerHost for FakeHost {
        fn docker_host(&self) -> Option<String> {
            self.docker_host.clone()
        }

        fn platform(&self) -> DockerPlatform {
            self.platform
        }

        fn home_dir(&self) -> String {
            self.home.clone()
        }

        fn socket_exists(&self, path: &str) -> bool {
            self.sockets.iter().any(|socket| socket == path)
        }

        fn launch(
            &self,
            program: &str,
            argv: &[String],
        ) -> impl Future<Output = Result<CommandOutput, DockerError>> + Send {
            self.calls
                .lock()
                .unwrap()
                .push((program.to_string(), argv.to_vec()));
            let responses = self.responses.clone();
            async move {
                responses.lock().unwrap().pop_front().unwrap_or_else(|| {
                    Ok(CommandOutput {
                        stdout: String::new(),
                        stderr: String::new(),
                    })
                })
            }
        }
    }

    fn stdout_inventory() -> Result<CommandOutput, DockerError> {
        Ok(CommandOutput {
            stdout: listing(&[ID_A, ID_B]),
            stderr: String::new(),
        })
    }

    type HostCalls = Arc<Mutex<Vec<(String, Vec<String>)>>>;
    // -- container_resource -------------------------------------------------

    #[test]
    fn container_resource_projects_only_selected_metadata_in_source_order() {
        let value = json!({
            "id": ID_A,
            "name": "/jait-sb-api",
            "image": "jait/api:1.2.3",
            "state": "running",
            "created": "2026-10-20T06:00:00.000000000Z",
            "networks": {
                "bridge": {"IPAddress": "172.17.0.2"},
                "host": {"IPAddress": "172.17.0.2"},
                "none": {"IPAddress": "not-an-ip"},
                "bridge6": {"IPAddress": "::1"},
            },
        });
        let resource = container_resource(&value, OBSERVED).unwrap();
        assert_eq!(
            serde_json::to_string(&resource).unwrap(),
            concat!(
                r#"{"id":"docker-0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef","#,
                r#""type":"resource","kind":"container","name":"jait-sb-api","parentId":"gateway","#,
                r#""icon":"jait","online":true,"status":"running","source":"Local Docker inventory","#,
                r#""observedAt":"2026-10-20T06:30:00.000Z","addresses":["172.17.0.2"],"#,
                r#""category":"sandbox","facts":[{"label":"Image","value":"jait/api:1.2.3"},"#,
                r#"{"label":"Container ID","value":"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"},"#,
                r#"{"label":"Owner","value":"Not recorded"},"#,
                r#"{"label":"Networks","value":"bridge, host, none, bridge6"},"#,
                r#"{"label":"Created","value":"2026-10-20T06:00:00.000000000Z"},"#,
                r#"{"label":"Access","value":"Metadata available"}]}"#
            )
        );
    }

    #[test]
    fn container_resource_rejects_every_unsupported_shape() {
        for value in [
            json!(null),
            json!(0),
            json!("row"),
            json!(true),
            json!([]),
            json!({}),
            json!({"id": ID_A}),
            json!({"id": "abc", "name": "c", "image": "i", "state": "s"}),
            json!({"id": &ID_A[..11], "name": "c", "image": "i", "state": "s"}),
            json!({"id": format!("{ID_A}0"), "name": "c", "image": "i", "state": "s"}),
            json!({"id": ID_A.to_uppercase(), "name": "c", "image": "i", "state": "s"}),
            json!({"id": ID_A, "name": 1, "image": "i", "state": "s"}),
            json!({"id": ID_A, "name": "c", "image": null, "state": "s"}),
            json!({"id": ID_A, "name": "c", "image": "i", "state": 0}),
            json!({"id": format!("{}g", &ID_A[..63]), "name": "c", "image": "i", "state": "s"}),
        ] {
            assert!(
                container_resource(&value, OBSERVED).is_none(),
                "unexpected projection for {value}"
            );
        }
        for id in [&ID_A[..12], &ID_A[..63], &ID_A[..64]] {
            assert!(
                container_resource(&row(id, "c", "image", "exited"), OBSERVED).is_some(),
                "id length {} must be accepted",
                id.len()
            );
        }
    }

    #[test]
    fn name_and_image_are_truncated_at_javascript_utf16_limits() {
        let long_name = format!("/{}", "n".repeat(400));
        let long_image = format!("{}{}", "i".repeat(500), "🦀".repeat(10));
        let resource =
            container_resource(&row(ID_A, &long_name, &long_image, "running"), OBSERVED).unwrap();
        assert_eq!(resource.name.0.len(), 256);
        assert_eq!(resource.facts[0].value.0.len(), 512);
        assert_eq!(
            String::from_utf16(&resource.facts[0].value.0)
                .unwrap()
                .chars()
                .count(),
            506
        );
        assert_eq!(resource.facts[0].value.0.len(), 512);
        // A split pair retains its high surrogate on the JSON wire.
        let split = format!("{}🦀", "x".repeat(511));
        let resource = container_resource(&row(ID_A, "c", &split, "running"), OBSERVED).unwrap();
        assert_eq!(resource.facts[0].value.0.len(), 512);
        assert_eq!(resource.facts[0].value.0.last(), Some(&0xd83e));
        // Only one leading slash is stripped, as `replace(/^\//, '')` implies.
        let resource =
            container_resource(&row(ID_A, "//double", "image", "running"), OBSERVED).unwrap();
        assert_eq!(resource.name, Utf16Text::from("/double"));
    }

    #[test]
    fn repository_derivation_matches_javascript_regex_leftmost_matches() {
        assert_eq!(docker_repository("nginx"), "nginx");
        assert_eq!(docker_repository("nginx:1.25"), "nginx");
        assert_eq!(docker_repository("a:b:c"), "a");
        assert_eq!(docker_repository("a:b/c:d"), "a:b/c");
        assert_eq!(
            docker_repository("localhost:5000/nginx"),
            "localhost:5000/nginx"
        );
        assert_eq!(
            docker_repository("registry.example/redis:6"),
            "registry.example/redis"
        );
        assert_eq!(
            docker_repository("docker.io/library/postgres:16"),
            "postgres"
        );
        assert_eq!(docker_repository("docker.io/redis"), "redis");
        assert_eq!(docker_repository("nginx@sha256:abc"), "nginx");
        assert_eq!(docker_repository("x@a\nb@c"), "x@a\nb");
        assert_eq!(docker_repository("a\nb"), "a\nb");
        assert_eq!(docker_repository(""), "");
    }

    #[test]
    fn icons_follow_complete_known_repositories_only() {
        let icon = |image: &str| {
            container_resource(&row(ID_A, "c", image, "exited"), OBSERVED)
                .unwrap()
                .icon
        };
        assert_eq!(icon("nginx"), ResourceIcon::Nginx);
        assert_eq!(icon("nginx:1.25"), ResourceIcon::Nginx);
        assert_eq!(icon("docker.io/library/redis"), ResourceIcon::Redis);
        assert_eq!(icon("postgres:16"), ResourceIcon::Postgresql);
        assert_eq!(
            icon("ghcr.io/home-assistant/home-assistant:2026.1"),
            ResourceIcon::Homeassistant
        );
        assert_eq!(
            icon("homeassistant/home-assistant"),
            ResourceIcon::Homeassistant
        );
        assert_eq!(icon("ghcr.io/other/home-assistant"), ResourceIcon::Docker);
        assert_eq!(icon("registry.example/nginx"), ResourceIcon::Docker);
        assert_eq!(icon("mynginx"), ResourceIcon::Docker);
        assert_eq!(icon("redis-sentinel"), ResourceIcon::Docker);
    }

    #[test]
    fn sandbox_classification_requires_both_the_name_prefix_and_a_jait_image() {
        let category = |name: &str, image: &str| {
            let resource =
                container_resource(&row(ID_A, name, image, "running"), OBSERVED).unwrap();
            (resource.category, resource.icon)
        };
        assert_eq!(
            category("jait-sb-api", "jait/api"),
            (ResourceCategory::Sandbox, ResourceIcon::Jait)
        );
        assert_eq!(
            category("/jait-agent-sb-worker", "jait/worker:1"),
            (ResourceCategory::Sandbox, ResourceIcon::Jait)
        );
        assert_eq!(
            category("jait-sb-api", "docker.io/jait/api"),
            (ResourceCategory::Application, ResourceIcon::Docker)
        );
        assert_eq!(
            category("xjait-sb-api", "jait/api"),
            (ResourceCategory::Application, ResourceIcon::Docker)
        );
        assert_eq!(
            category("jait-sbx", "jait/api"),
            (ResourceCategory::Application, ResourceIcon::Docker)
        );
        let resource =
            container_resource(&row(ID_A, "jait-sb-api", "jait/api", "running"), OBSERVED).unwrap();
        assert_eq!(resource.facts[2].label, "Owner");
        assert_eq!(resource.facts[2].value, "Not recorded".into());
    }

    #[test]
    fn networks_keep_javascript_object_order_and_addresses_dedupe_in_place() {
        let value = json!({
            "id": ID_A, "name": "c", "image": "image", "state": "running",
            "networks": {
                "10": {"IPAddress": "10.0.0.10"},
                "2": {"IPAddress": "10.0.0.2"},
                "b": {"IPAddress": "10.0.0.10"},
                "a": {"IPAddress": "172.17.0.3"},
                "01": {"IPAddress": "999.999.999.999"},
                "c": {"IPAddress": "1.2.3"},
                "d": {"IPAddress": 5},
                "e": "172.17.0.4",
                "f": null,
            },
        });
        let resource = container_resource(&value, OBSERVED).unwrap();
        assert_eq!(
            resource.addresses,
            vec!["10.0.0.2", "10.0.0.10", "172.17.0.3", "999.999.999.999"]
        );
        assert_eq!(
            resource
                .facts
                .iter()
                .find(|fact| fact.label == "Networks")
                .unwrap()
                .value,
            "2, 10, b, a, 01, c, d, e, f".into()
        );
        let array = json!({
            "id": ID_A, "name": "c", "image": "image", "state": "running",
            "networks": [{"IPAddress": "10.0.0.1"}, {"IPAddress": "10.0.0.2"}],
        });
        let resource = container_resource(&array, OBSERVED).unwrap();
        assert_eq!(resource.addresses, vec!["10.0.0.1", "10.0.0.2"]);
        assert_eq!(
            resource
                .facts
                .iter()
                .find(|fact| fact.label == "Networks")
                .unwrap()
                .value,
            "0, 1".into()
        );
        for networks in [
            json!({}),
            json!("bridge"),
            json!(7),
            json!(null),
            json!(false),
        ] {
            let mut value = row(ID_A, "c", "image", "running");
            value["networks"] = networks.clone();
            let resource = container_resource(&value, OBSERVED).unwrap();
            assert!(resource.addresses.is_empty(), "networks={networks}");
            assert_eq!(
                resource
                    .facts
                    .iter()
                    .find(|fact| fact.label == "Networks")
                    .unwrap()
                    .value,
                "None".into()
            );
        }
        let mut without = row(ID_A, "c", "image", "running");
        without.as_object_mut().unwrap().remove("networks");
        assert_eq!(
            container_resource(&without, OBSERVED)
                .unwrap()
                .facts
                .iter()
                .find(|fact| fact.label == "Networks")
                .unwrap()
                .value,
            "None".into()
        );
    }

    #[test]
    fn created_and_online_reflect_only_string_created_and_running_state() {
        for (created, expected) in [
            (json!("2026-10-20T06:00:00Z"), Some("2026-10-20T06:00:00Z")),
            (json!(5), None),
            (json!(null), None),
        ] {
            let mut value = row(ID_A, "c", "image", "exited");
            value["created"] = created;
            let resource = container_resource(&value, OBSERVED).unwrap();
            assert_eq!(
                resource
                    .facts
                    .iter()
                    .find(|fact| fact.label == "Created")
                    .map(|fact| fact.value.clone()),
                expected.map(Utf16Text::from)
            );
            assert!(!resource.online);
            assert_eq!(resource.status, "exited");
        }
        assert!(
            container_resource(&row(ID_A, "c", "image", "running"), OBSERVED)
                .unwrap()
                .online
        );
    }

    #[test]
    fn iso_timestamps_match_to_iso_string() {
        assert_eq!(js_iso_timestamp(0), "1970-01-01T00:00:00.000Z");
        assert_eq!(
            js_iso_timestamp(1_700_000_000_000),
            "2023-11-14T22:13:20.000Z"
        );
        assert_eq!(
            js_iso_timestamp(1_700_000_000_999),
            "2023-11-14T22:13:20.999Z"
        );
    }

    // -- endpoint guard and argv -------------------------------------------

    #[tokio::test]
    async fn endpoint_guard_rejects_remote_contexts_before_spawning() {
        for configured in [
            "tcp://127.0.0.1:2375",
            "http://127.0.0.1:2375",
            "ssh://user@host",
            "NPIPE://./pipe/docker_engine",
            "docker context name",
        ] {
            let host = FakeHost::new(Some(configured));
            let error = resolve_endpoint(&host).unwrap_err();
            assert_eq!(error.kind, DockerErrorKind::NonLocalEndpoint);
            assert_eq!(error.message, "Non-local Docker endpoint");
            let runner = LocalDockerRunner::new(host.clone());
            assert_eq!(
                runner
                    .run(&LIST_ARGV.map(str::to_string))
                    .await
                    .unwrap_err()
                    .kind,
                DockerErrorKind::NonLocalEndpoint
            );
            assert!(
                host.calls().is_empty(),
                "guard must not spawn for {configured}"
            );
        }
        for configured in [
            "unix:///var/run/docker.sock",
            "npipe:////./pipe/docker_engine",
        ] {
            assert_eq!(
                resolve_endpoint(&FakeHost::new(Some(configured))).unwrap(),
                configured
            );
        }
    }

    #[test]
    fn endpoint_defaults_prefer_the_user_socket_then_the_system_socket() {
        assert_eq!(
            resolve_endpoint(&FakeHost::new(None)).unwrap(),
            "unix:///var/run/docker.sock"
        );
        assert_eq!(
            resolve_endpoint(
                &FakeHost::new(None).with_socket("/owned/home/.docker/run/docker.sock")
            )
            .unwrap(),
            "unix:///owned/home/.docker/run/docker.sock"
        );
        assert_eq!(
            resolve_endpoint(&FakeHost::new(None).with_platform(DockerPlatform::Win32)).unwrap(),
            "npipe:////./pipe/docker_engine"
        );
        assert_eq!(
            resolve_endpoint(
                &FakeHost::new(None)
                    .with_platform(DockerPlatform::Win32)
                    .with_socket("/owned/home/.docker/run/docker.sock")
            )
            .unwrap(),
            "npipe:////./pipe/docker_engine"
        );
        // `configured ?? default`: an empty DOCKER_HOST is not nullish.
        assert_eq!(resolve_endpoint(&FakeHost::new(Some(""))).unwrap(), "");
    }

    #[tokio::test]
    async fn inventory_argv_uses_the_local_endpoint_and_preserves_argument_order() {
        for (configured, endpoint) in [
            (None, "unix:///var/run/docker.sock"),
            (
                Some("unix:///run/user/1000/docker.sock"),
                "unix:///run/user/1000/docker.sock",
            ),
            (Some(""), ""),
        ] {
            let host = FakeHost::new(configured)
                .respond(stdout_inventory())
                .respond(Ok(CommandOutput {
                    stdout: inspect(&[row(ID_A, "api", "nginx", "running")]),
                    stderr: String::new(),
                }));
            let inventory = DockerResourceInventory::with_clock(
                LocalDockerRunner::new(host.clone()),
                ManualClock::new(1_700_000_000_000),
            );
            assert_eq!(inventory.get().await.resources.len(), 1);
            let calls = host.calls();
            assert_eq!(calls.len(), 2);
            assert_eq!(calls[0].0, "docker");
            assert_eq!(
                calls[0].1,
                vec![
                    "--host",
                    endpoint,
                    "ps",
                    "--all",
                    "--no-trunc",
                    "--format",
                    "{{.ID}}"
                ]
            );
            assert_eq!(
                calls[1].1[..5],
                ["--host", endpoint, "inspect", "--type", "container"]
            );
            assert_eq!(calls[1].1[6], INSPECT_FORMAT);
            assert_eq!(calls[1].1[7..], [ID_A.to_string(), ID_B.to_string()]);
        }
    }

    #[tokio::test]
    async fn remote_endpoint_inventory_degrades_without_spawning() {
        let host = FakeHost::new(Some("tcp://192.0.2.10:2375"));
        let inventory = DockerResourceInventory::with_clock(
            LocalDockerRunner::new(host.clone()),
            ManualClock::new(0),
        );
        let value = inventory.get().await;
        assert_eq!(value.status, InventoryStatus::Unavailable);
        assert!(value.resources.is_empty());
        assert_eq!(
            serde_json::to_value(&value).unwrap(),
            json!({"status":"unavailable","resources":[]})
        );
        assert!(host.calls().is_empty());
    }

    // -- batching, limits and parsing --------------------------------------

    #[tokio::test]
    async fn inspect_calls_are_batched_by_thirty_two_and_invalid_ids_filtered() {
        let ids: Vec<String> = (0..70).map(|i| hex_id(i as u64)).collect();
        let mut listed: Vec<String> = ids.clone();
        listed.push("ABC".into());
        listed.push(ID_A.to_uppercase());
        listed.push("short".into());
        let mut responses = vec![Ok(listing(
            &listed.iter().map(String::as_str).collect::<Vec<_>>(),
        ))];
        for chunk in [&ids[..32], &ids[32..64], &ids[64..]] {
            responses.push(Ok(inspect(
                &chunk
                    .iter()
                    .map(|id| row(id, "api", "nginx", "running"))
                    .collect::<Vec<_>>(),
            )));
        }
        let runner = FakeRunner::new(responses);
        let inventory = DockerResourceInventory::with_clock(runner.clone(), ManualClock::new(0));
        let value = inventory.get().await;
        assert_eq!(value.status, InventoryStatus::Available);
        assert_eq!(value.resources.len(), 70);
        assert_eq!(value.truncated, Some(false));
        let calls = runner.calls();
        assert_eq!(calls.len(), 4);
        assert_eq!(calls[0], LIST_ARGV.map(str::to_string).to_vec());
        for (index, call) in calls[1..].iter().enumerate() {
            assert_eq!(
                &call[..5],
                ["inspect", "--type", "container", "--format", INSPECT_FORMAT]
            );
            let expected = &ids[index * 32..(index * 32 + 32).min(ids.len())];
            assert_eq!(&call[5..], expected);
        }
    }

    #[tokio::test]
    async fn collection_caps_resources_and_reports_truncation() {
        let ids: Vec<String> = (0..MAX_CONTAINERS + 1).map(|i| hex_id(i as u64)).collect();
        let listed = listing(&ids.iter().map(String::as_str).collect::<Vec<_>>());
        let mut responses = vec![Ok(listed)];
        for chunk in ids[..MAX_CONTAINERS].chunks(INSPECT_BATCH) {
            responses.push(Ok(inspect(
                &chunk
                    .iter()
                    .map(|id| row(id, "api", "nginx", "running"))
                    .collect::<Vec<_>>(),
            )));
        }
        let runner = FakeRunner::new(responses);
        let inventory = DockerResourceInventory::with_clock(runner.clone(), ManualClock::new(0));
        let value = inventory.get().await;
        assert_eq!(value.resources.len(), MAX_CONTAINERS);
        assert_eq!(value.truncated, Some(true));
        assert_eq!(runner.calls().len(), 1 + MAX_CONTAINERS / INSPECT_BATCH);
        assert_eq!(
            value.resources[MAX_CONTAINERS - 1].id,
            format!("docker-{}", ids[MAX_CONTAINERS - 1])
        );

        let exact: Vec<String> = (0..MAX_CONTAINERS).map(|i| hex_id(i as u64)).collect();
        let mut responses = vec![Ok(listing(
            &exact.iter().map(String::as_str).collect::<Vec<_>>(),
        ))];
        for _chunk in exact.chunks(INSPECT_BATCH) {
            responses.push(Ok(String::new()));
        }
        let inventory =
            DockerResourceInventory::with_clock(FakeRunner::new(responses), ManualClock::new(0));
        assert_eq!(inventory.get().await.truncated, Some(false));
    }

    #[tokio::test]
    async fn inspect_output_is_newline_delimited_json_and_unusable_rows_are_skipped() {
        let output = format!(
            "\r\n{}\r\n{}\r\n\r\n{}\r\n",
            row(ID_A, "api", "nginx", "running"),
            row("0123456789ab", "short-id", "redis", "exited"),
            row(ID_B, "worker", "postgres", "paused"),
        );
        let runner = FakeRunner::new(vec![
            Ok(format!("\u{feff}  {}  \u{a0}\n", listing(&[ID_A, ID_B]))),
            Ok(output),
        ]);
        let inventory = DockerResourceInventory::with_clock(runner, ManualClock::new(0));
        let value = inventory.get().await;
        assert_eq!(value.status, InventoryStatus::Available);
        assert_eq!(
            value
                .resources
                .iter()
                .map(|resource| resource.id.as_str())
                .collect::<Vec<_>>(),
            vec![
                format!("docker-{ID_A}"),
                "docker-0123456789ab".into(),
                format!("docker-{ID_B}")
            ]
        );
        assert_eq!(value.resources[2].status, "paused");
    }

    #[tokio::test]
    async fn malformed_json_and_empty_listings_are_distinguished() {
        let runner = FakeRunner::new(vec![Ok(listing(&[ID_A])), Ok("{".to_string())]);
        let inventory = DockerResourceInventory::with_clock(runner, ManualClock::new(0));
        let value = inventory.get().await;
        assert_eq!(value.status, InventoryStatus::Unavailable);
        assert_eq!(
            serde_json::to_value(&value).unwrap(),
            json!({"status":"unavailable","resources":[]})
        );
        // Parseable rows that are not containers are dropped, not treated as errors.
        for output in ["null\n", "\"text\"\n", "7\n", "[]\n"] {
            let runner = FakeRunner::new(vec![Ok(listing(&[ID_A])), Ok(output.to_string())]);
            let inventory = DockerResourceInventory::with_clock(runner, ManualClock::new(0));
            let value = inventory.get().await;
            assert_eq!(value.status, InventoryStatus::Available, "output={output}");
            assert!(value.resources.is_empty());
        }
        for listing_text in ["", " \n\t\r\n", "\u{feff}"] {
            let runner = FakeRunner::new(vec![Ok(listing_text.to_string())]);
            let inventory =
                DockerResourceInventory::with_clock(runner.clone(), ManualClock::new(0));
            let value = inventory.get().await;
            assert_eq!(value.status, InventoryStatus::Available);
            assert!(value.resources.is_empty());
            assert_eq!(value.truncated, Some(false));
            assert_eq!(
                serde_json::to_value(&value).unwrap(),
                json!({"status":"available","resources":[],"truncated":false})
            );
            assert_eq!(runner.calls().len(), 1);
        }
    }

    // -- TTL, cached failures and coalescing -------------------------------

    #[tokio::test]
    async fn successful_results_are_cached_until_the_ttl_expires() {
        let runner = FakeRunner::new(vec![
            Ok(listing(&[ID_A])),
            Ok(inspect(&[row(ID_A, "api", "nginx", "running")])),
            Ok(listing(&[ID_A, ID_B])),
            Ok(inspect(&[
                row(ID_A, "api", "nginx", "running"),
                row(ID_B, "w", "redis", "exited"),
            ])),
        ]);
        let clock = ManualClock::new(1_700_000_000_000);
        let inventory = DockerResourceInventory::with_clock(runner.clone(), clock.clone());
        let first = inventory.get().await;
        assert_eq!(first.resources.len(), 1);
        assert_eq!(
            first.resources[0].observed_at,
            js_iso_timestamp(1_700_000_000_000)
        );
        clock.advance(TTL_MS - 1);
        assert_eq!(inventory.get().await, first);
        assert_eq!(runner.calls().len(), 2);
        clock.advance(1);
        let refreshed = inventory.get().await;
        assert_eq!(refreshed.resources.len(), 2);
        assert_eq!(
            refreshed.resources[0].observed_at,
            js_iso_timestamp(1_700_000_000_000 + TTL_MS)
        );
        assert_eq!(runner.calls().len(), 4);
    }

    #[tokio::test]
    async fn failures_are_cached_for_the_ttl_and_retried_afterwards() {
        let runner = FakeRunner::new(vec![
            Err(DockerError::new(
                DockerErrorKind::Spawn {
                    code: "ENOENT".into(),
                },
                "spawn docker ENOENT",
            )),
            Ok(listing(&[ID_A])),
            Ok(inspect(&[row(ID_A, "api", "nginx", "running")])),
        ]);
        let clock = ManualClock::new(0);
        let inventory = DockerResourceInventory::with_clock(runner.clone(), clock.clone());
        assert_eq!(inventory.get().await.status, InventoryStatus::Unavailable);
        assert_eq!(inventory.get().await.status, InventoryStatus::Unavailable);
        assert_eq!(runner.calls().len(), 1, "cached failure must not re-spawn");
        clock.advance(TTL_MS - 1);
        assert_eq!(inventory.get().await.status, InventoryStatus::Unavailable);
        assert_eq!(runner.calls().len(), 1);
        clock.advance(1);
        assert_eq!(inventory.get().await.status, InventoryStatus::Available);
        assert_eq!(runner.calls().len(), 3);
        assert_eq!(inventory.get().await.status, InventoryStatus::Available);
        assert_eq!(runner.calls().len(), 3);
    }

    #[tokio::test]
    async fn failing_inspect_batch_discards_partial_results_and_caches_the_failure() {
        let ids: Vec<_> = (0..33).map(hex_id).collect();
        let runner = FakeRunner::new(vec![
            Ok(listing(&ids.iter().map(String::as_str).collect::<Vec<_>>())),
            Ok(inspect(&[row(ID_A, "api", "nginx", "running")])),
            Err(DockerError::new(
                DockerErrorKind::Exit { code: 3 },
                "Command failed: docker inspect",
            )),
        ]);
        let clock = ManualClock::new(0);
        let inventory = DockerResourceInventory::with_clock(runner.clone(), clock.clone());
        assert_eq!(inventory.get().await.status, InventoryStatus::Unavailable);
        assert_eq!(runner.calls().len(), 3);
        assert_eq!(inventory.get().await.status, InventoryStatus::Unavailable);
        assert_eq!(runner.calls().len(), 3);
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    async fn concurrent_gets_coalesce_into_one_collection() {
        let opened = Arc::new(AtomicBool::new(false));
        let runner = FakeRunner::gated(
            vec![
                Ok(listing(&[ID_A])),
                Ok(inspect(&[row(ID_A, "api", "nginx", "running")])),
            ],
            opened.clone(),
        );
        let inventory = Arc::new(DockerResourceInventory::with_clock(
            runner.clone(),
            ManualClock::new(0),
        ));
        let workers: Vec<_> = (0..4)
            .map(|_| {
                let inventory = inventory.clone();
                tokio::spawn(async move { inventory.get().await })
            })
            .collect();
        while runner.calls().is_empty() {
            tokio::time::sleep(Duration::from_millis(1)).await;
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
        opened.store(true, Ordering::SeqCst);
        let mut results = Vec::new();
        for worker in workers {
            results.push(worker.await.unwrap());
        }
        assert_eq!(
            runner.calls().len(),
            2,
            "one listing and one inspect for four callers"
        );
        for result in &results {
            assert_eq!(result, &results[0]);
        }
        assert_eq!(results[0].resources.len(), 1);
    }

    #[tokio::test]
    async fn a_second_get_after_completion_uses_the_cache_not_the_in_flight_slot() {
        let runner = FakeRunner::new(vec![
            Ok(listing(&[ID_A])),
            Ok(inspect(&[row(ID_A, "api", "nginx", "running")])),
        ]);
        let inventory = DockerResourceInventory::with_clock(runner.clone(), ManualClock::new(0));
        assert_eq!(inventory.get().await.resources.len(), 1);
        assert_eq!(inventory.get().await.resources.len(), 1);
        assert_eq!(runner.calls().len(), 2);
    }

    // -- real owned process fixtures ---------------------------------------

    #[cfg(unix)]
    #[derive(Clone)]
    struct FixtureHost {
        timeout_ms: u64,
        max_buffer: usize,
        calls: HostCalls,
        home: String,
    }

    #[cfg(unix)]
    impl LocalDockerHost for FixtureHost {
        fn docker_host(&self) -> Option<String> {
            None
        }

        fn platform(&self) -> DockerPlatform {
            DockerPlatform::Linux
        }

        fn home_dir(&self) -> String {
            self.home.clone()
        }

        fn socket_exists(&self, path: &str) -> bool {
            std::path::Path::new(path).exists()
        }

        fn launch(
            &self,
            program: &str,
            argv: &[String],
        ) -> impl Future<Output = Result<CommandOutput, DockerError>> + Send {
            self.calls
                .lock()
                .unwrap()
                .push((program.to_string(), argv.to_vec()));
            let program = program.to_string();
            let argv = argv.to_vec();
            let timeout_ms = self.timeout_ms;
            let max_buffer = self.max_buffer;
            async move { exec_bounded(&program, &argv, timeout_ms, max_buffer).await }
        }
    }

    #[cfg(unix)]
    fn write_script(directory: &Path, name: &str, body: &str) -> PathBuf {
        use std::os::unix::fs::PermissionsExt;
        let path = directory.join(name);
        std::fs::write(&path, body).unwrap();
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o700)).unwrap();
        path
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn real_fixture_peer_receives_the_guarded_argv_and_feeds_the_inventory() {
        let directory = owned_directory("peer");
        let ps = directory.join("ps.txt");
        let inspected = directory.join("inspect.txt");
        let log = directory.join("argv.log");
        std::fs::write(&ps, listing(&[ID_A, ID_B])).unwrap();
        std::fs::write(
            &inspected,
            inspect(&[
                row(ID_A, "/jait-sb-api", "jait/api:1", "running"),
                row(ID_B, "web", "nginx:1.25", "exited"),
            ]),
        )
        .unwrap();
        let script = write_script(
            &directory,
            "docker-peer.sh",
            &format!(
                "#!/bin/sh\nprintf '%s\\n' \"$*\" >> '{log}'\ncase \"$3\" in\nps) cat '{ps}' ;;\ninspect) cat '{inspected}' ;;\nesac\n",
                log = log.display(),
                ps = ps.display(),
                inspected = inspected.display(),
            ),
        );
        let host = FixtureHost {
            timeout_ms: INSPECT_TIMEOUT_MS,
            max_buffer: INSPECT_MAX_BUFFER,
            calls: Arc::new(Mutex::new(Vec::new())),
            home: directory.join("home").to_string_lossy().into_owned(),
        };
        let clock = ManualClock::new(1_700_000_000_123);
        let inventory = DockerResourceInventory::with_clock(
            LocalDockerRunner::with_program(host.clone(), script.to_string_lossy().into_owned()),
            clock,
        );
        let value = inventory.get().await;
        assert_eq!(value.status, InventoryStatus::Available);
        assert_eq!(value.resources.len(), 2);
        assert_eq!(value.resources[0].icon, ResourceIcon::Jait);
        assert_eq!(value.resources[1].icon, ResourceIcon::Nginx);
        assert_eq!(
            value.resources[0].observed_at,
            js_iso_timestamp(1_700_000_000_123)
        );
        let recorded = std::fs::read_to_string(&log).unwrap();
        let lines: Vec<&str> = recorded.lines().collect();
        assert_eq!(lines.len(), 2, "{recorded}");
        assert_eq!(
            lines[0],
            "--host unix:///var/run/docker.sock ps --all --no-trunc --format {{.ID}}"
        );
        assert!(
            lines[1].starts_with(
                &"--host unix:///var/run/docker.sock inspect --type container --format "
                    .to_string()
            ),
            "{recorded}"
        );
        assert!(lines[1].ends_with(&format!("{ID_A} {ID_B}")), "{recorded}");
        let calls = host.calls.lock().unwrap().clone();
        assert_eq!(calls.len(), 2);
        assert_eq!(calls[0].0, script.to_string_lossy());
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn real_fixture_peer_failure_degrades_to_unavailable() {
        let directory = owned_directory("peer-failure");
        let script = write_script(
            &directory,
            "docker-peer.sh",
            "#!/bin/sh\nprintf 'daemon exploded\\n' >&2\nexit 1\n",
        );
        let host = FixtureHost {
            timeout_ms: INSPECT_TIMEOUT_MS,
            max_buffer: INSPECT_MAX_BUFFER,
            calls: Arc::new(Mutex::new(Vec::new())),
            home: directory.to_string_lossy().into_owned(),
        };
        let inventory = DockerResourceInventory::new(LocalDockerRunner::with_program(
            host,
            script.to_string_lossy().into_owned(),
        ));
        let value = inventory.get().await;
        assert_eq!(value.status, InventoryStatus::Unavailable);
        // The bounded failure itself keeps stderr and the exit code.
        let error = exec_bounded(
            &script.to_string_lossy(),
            &["ps".to_string()],
            INSPECT_TIMEOUT_MS,
            INSPECT_MAX_BUFFER,
        )
        .await
        .unwrap_err();
        assert_eq!(error.kind, DockerErrorKind::Exit { code: 1 });
        assert!(
            error.message.ends_with("daemon exploded\n"),
            "{}",
            error.message
        );
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn bounded_execution_enforces_timeout_buffer_missing_binary_and_null_arguments() {
        let directory = owned_directory("bounded");
        let slow = write_script(&directory, "slow.sh", "#!/bin/sh\nexec sleep 5\n");
        let started = std::time::Instant::now();
        let error = exec_bounded(
            "/bin/sh",
            &[slow.to_string_lossy().into_owned()],
            150,
            INSPECT_MAX_BUFFER,
        )
        .await
        .unwrap_err();
        assert_eq!(error.kind, DockerErrorKind::Timeout);
        assert!(started.elapsed() < Duration::from_secs(3));

        let loud = write_script(&directory, "loud.sh", "#!/bin/sh\nprintf '%0200d' 0\n");
        let error = exec_bounded(
            "/bin/sh",
            &[loud.to_string_lossy().into_owned()],
            INSPECT_TIMEOUT_MS,
            16,
        )
        .await
        .unwrap_err();
        assert_eq!(error.kind, DockerErrorKind::MaxBuffer);
        assert_eq!(error.message, "stdout maxBuffer length exceeded");

        let absent = directory.join("absent-docker");
        let error = exec_bounded(&absent.to_string_lossy(), &[], INSPECT_TIMEOUT_MS, 16)
            .await
            .unwrap_err();
        assert_eq!(
            error.kind,
            DockerErrorKind::Spawn {
                code: "ENOENT".into()
            }
        );

        let ok = write_script(&directory, "ok.sh", "#!/bin/sh\nprintf '%s' \"$1\"\n");
        let error = exec_bounded(
            "/bin/sh",
            &[ok.to_string_lossy().into_owned(), "a\0b".to_string()],
            INSPECT_TIMEOUT_MS,
            16,
        )
        .await
        .unwrap_err();
        assert_eq!(error.kind, DockerErrorKind::InvalidArgument);
        let output = exec_bounded(
            "/bin/sh",
            &[ok.to_string_lossy().into_owned(), "plain".to_string()],
            INSPECT_TIMEOUT_MS,
            16,
        )
        .await
        .unwrap();
        assert_eq!(output.stdout, "plain");
        assert!(output.stderr.is_empty());
    }

    #[test]
    fn error_messages_and_frozen_wire_constants_are_stable() {
        assert_eq!(
            INSPECT_FORMAT,
            "{\"id\":{{json .Id}},\"name\":{{json .Name}},\"image\":{{json .Config.Image}},\"state\":{{json .State.Status}},\"created\":{{json .Created}},\"networks\":{{json .NetworkSettings.Networks}}}"
        );
        assert_eq!(
            LIST_ARGV,
            ["ps", "--all", "--no-trunc", "--format", "{{.ID}}"]
        );
        assert_eq!(MAX_CONTAINERS, 512);
        assert_eq!(INSPECT_BATCH, 32);
        assert_eq!(TTL_MS, 30_000);
        assert_eq!(INSPECT_TIMEOUT_MS, 8_000);
        assert_eq!(INSPECT_MAX_BUFFER, 8 * 1024 * 1024);
        let error = DockerError::new(
            DockerErrorKind::NonLocalEndpoint,
            "Non-local Docker endpoint",
        );
        assert_eq!(error.to_string(), "Non-local Docker endpoint");
    }
}
