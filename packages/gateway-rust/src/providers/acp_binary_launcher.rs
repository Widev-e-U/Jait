//! Native port of `packages/gateway/src/providers/acp-binary-launcher.ts`.
//!
//! The TypeScript original is a process entry point, not a module: it has no
//! exports at all. It decodes a base64url launch specification from
//! `process.argv[2]`, installs (or reuses) a checksum-verified agent archive
//! under the Jait state directory, then hands its own stdio to the agent
//! process and adopts that process's exit status or terminating signal.
//!
//! This port therefore exposes the same behaviour as a library entry point
//! ([`run`]) plus every intermediate stage as a separate function, so the
//! parent can wire it to a binary target without re-implementing any of it.
//! Every external boundary is injected:
//!
//! * [`LauncherIo`] — wall clock, sleep, archive download, external archive
//!   tooling (`tar`/`unzip`), and lock mtime.
//! * [`LauncherProcess`] — spawning the installed agent with inherited stdio
//!   and forwarding `SIGINT`/`SIGTERM`.
//!
//! Filesystem mutation is deliberately *not* abstracted: the install, lock,
//! marker and extraction logic under test is real `std::fs` behaviour against
//! caller-owned directories. (`tokio`'s `fs` feature is not enabled for this
//! crate, so all metadata/mutation calls are the blocking `std` ones, which is
//! also what the lock and marker checks require to stay atomic with respect to
//! the surrounding control flow.)
//!
//! # Source fidelity
//!
//! Error strings, ordering, file modes, the marker payload, and the archive
//! tool argv all match the TypeScript source. Four deliberate divergences are
//! documented at their call sites and in
//! `tests/contract/reviews/native-acp-binary-launcher.md`:
//!
//! 1. a malformed specification payload yields a stable
//!    [`LauncherError::InvalidSpec`] instead of V8's engine text,
//! 2. the install scope is validated before any directory is created (the
//!    source joins the unvalidated `version`/`target` fields into the install
//!    path and can therefore be walked out of the binary root),
//! 3. `path.win32` semantics are not replicated; only POSIX path resolution is
//!    implemented,
//! 4. spawning the freshly installed command retries a bounded number of times
//!    while the kernel reports `ETXTBSY` (the source surfaces the first failure
//!    immediately).

use crate::text::js_trim;
use serde_json::{Map, Value};
use sha2::{Digest, Sha256};
use std::{
    ffi::OsString,
    future::Future,
    io,
    path::{Component, Path, PathBuf},
    process::Stdio,
    time::Duration,
};
use tokio::{
    io::{AsyncRead, AsyncReadExt},
    process::Command,
};

/// Environment variable that relocates the whole agent binary root.
pub const AGENT_BINARY_ROOT_ENV: &str = "JAIT_ACP_BINARY_ROOT";
/// Environment variable naming the gateway state directory.
pub const STATE_DIR_ENV: &str = "JAIT_STATE_DIR";
/// Install marker written next to the installed command.
pub const INSTALL_MARKER_FILE: &str = ".jait-acp-install.json";
/// Marker suffix appended to the install directory for the install lock.
pub const INSTALL_LOCK_SUFFIX: &str = ".lock";
/// How long a launcher waits for a competing install to finish.
pub const INSTALL_LOCK_WAIT: Duration = Duration::from_secs(60);
/// Poll interval while waiting for the install lock.
pub const INSTALL_LOCK_POLL: Duration = Duration::from_millis(150);
/// Age after which an abandoned install lock directory is reclaimed.
pub const INSTALL_LOCK_STALE: Duration = Duration::from_secs(5 * 60);
/// Download timeout for the agent archive.
pub const DOWNLOAD_TIMEOUT: Duration = Duration::from_secs(120);
/// `execFile` `maxBuffer` equivalent for archive listings and extractions.
pub const ARCHIVE_TOOL_OUTPUT_LIMIT: usize = 8 * 1024 * 1024;
/// Fixed message for a non-absolute `JAIT_STATE_DIR`.
pub const STATE_DIR_NOT_ABSOLUTE: &str = "JAIT_STATE_DIR must be an absolute path";

/// A decoded ACP binary launch specification (`process.argv[2]`).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct BinarySpec {
    pub id: String,
    pub version: String,
    pub target: String,
    pub archive: String,
    pub cmd: String,
    pub args: Vec<String>,
    pub env: Vec<(String, String)>,
    pub sha256: Option<String>,
}

/// Every failure the launcher can report, with the TypeScript message text.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum LauncherError {
    MissingSpec,
    InvalidSpec,
    InvalidUrl,
    InsecureDownload,
    UnsafeCommand,
    EscapedInstallDir,
    UnsafeArchiveEntry(String),
    ChecksumMismatch(String),
    DownloadFailed(u16),
    InstallTimedOut(String),
    StateDirectoryNotAbsolute,
    Transport(String),
    Tool(String),
    SpawnFailed(String),
    Io(String),
}

impl LauncherError {
    /// The exact text the TypeScript entry point prints to stderr.
    pub fn message(&self) -> String {
        match self {
            Self::MissingSpec => "Missing ACP binary launch specification".into(),
            Self::InvalidSpec => "Invalid ACP binary launch specification".into(),
            Self::InvalidUrl => "Invalid URL".into(),
            Self::InsecureDownload => "ACP binary downloads must use HTTPS".into(),
            Self::UnsafeCommand => "ACP registry supplied an unsafe binary command path".into(),
            Self::EscapedInstallDir => "ACP agent archive escaped its install directory".into(),
            Self::UnsafeArchiveEntry(entry) => {
                format!("Unsafe path in ACP agent archive: {entry}")
            }
            Self::ChecksumMismatch(id) => format!("Checksum mismatch for ACP agent {id}"),
            Self::DownloadFailed(status) => format!("Download failed with HTTP {status}"),
            Self::InstallTimedOut(id) => format!("Timed out installing ACP agent {id}"),
            Self::StateDirectoryNotAbsolute => STATE_DIR_NOT_ABSOLUTE.into(),
            Self::Transport(detail) => detail.clone(),
            Self::Tool(detail) => detail.clone(),
            Self::SpawnFailed(detail) => detail.clone(),
            Self::Io(detail) => detail.clone(),
        }
    }

    fn io(error: io::Error) -> Self {
        Self::Io(error.to_string())
    }
}

/// One invocation of an external archive tool.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ToolInvocation {
    pub program: String,
    pub args: Vec<String>,
    pub max_buffer: usize,
}

/// How the child process that the launcher supervises finished.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ExitOutcome {
    pub code: Option<i32>,
    pub signal: Option<i32>,
}

impl ExitOutcome {
    pub fn code_only(code: i32) -> Self {
        Self {
            code: Some(code),
            signal: None,
        }
    }
}

/// How the launcher itself finishes.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LauncherTermination {
    /// `process.exitCode = code`.
    Exit(i32),
    /// `process.kill(process.pid, signal)`: the launcher dies by the signal it
    /// received rather than translating it into a numeric code.
    Signal(i32),
}

/// Result of one launcher run: the terminating state plus anything that would
/// have been printed to stderr.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct LauncherRun {
    pub termination: LauncherTermination,
    pub stderr: Vec<String>,
}

impl LauncherRun {
    /// Numeric status for callers that cannot re-raise a signal themselves.
    ///
    /// The TypeScript entry point never reaches this path on POSIX: it re-raises
    /// and the shell observes the signal. Shells conventionally report
    /// `128 + signal`, which is what this returns.
    pub fn exit_code(&self) -> i32 {
        match self.termination {
            LauncherTermination::Exit(code) => code,
            LauncherTermination::Signal(signal) => 128 + signal,
        }
    }

    fn failure(error: LauncherError) -> Self {
        Self {
            termination: LauncherTermination::Exit(1),
            stderr: vec![error.message()],
        }
    }
}

/// Injected external boundaries of the install pipeline.
pub trait LauncherIo {
    /// `Date.now()`.
    fn now_ms(&self) -> f64;
    /// `setTimeout` equivalent.
    fn sleep(&self, duration: Duration) -> impl Future<Output = ()>;
    /// Lock directory modification time in milliseconds, or `None` when it
    /// cannot be read (the TypeScript `stat(...).catch(() => null)`).
    fn lock_mtime_ms(&self, path: &Path) -> impl Future<Output = Option<f64>>;
    /// `fetch(spec.archive)` limited to the response body.
    fn download(
        &self,
        url: &str,
        timeout: Duration,
    ) -> impl Future<Output = Result<Vec<u8>, LauncherError>>;
    /// `execFile(program, args)` returning captured stdout.
    fn run_tool(
        &self,
        invocation: ToolInvocation,
    ) -> impl Future<Output = Result<String, LauncherError>>;
}

/// Injected child-process boundary for the run stage.
pub trait LauncherProcess {
    /// Spawn the installed command with inherited stdio, forwarding the
    /// launcher's `SIGINT`/`SIGTERM` to it when `forward_signals` is set.
    fn run_child(
        &self,
        command: &Path,
        args: &[String],
        env: &[(String, String)],
        forward_signals: bool,
    ) -> impl Future<Output = Result<ExitOutcome, LauncherError>>;
}

/// `Date.now()` for the real system clock.
pub fn system_now_ms() -> f64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|elapsed| elapsed.as_secs_f64() * 1000.0)
        .unwrap_or(0.0)
}

/// Read a directory mtime as epoch milliseconds, mirroring `stat().mtimeMs`.
pub async fn file_mtime_ms(path: &Path) -> Option<f64> {
    let metadata = std::fs::metadata(path).ok()?;
    let modified = metadata.modified().ok()?;
    let since_epoch = modified.duration_since(std::time::UNIX_EPOCH).ok()?;
    Some(since_epoch.as_secs_f64() * 1000.0)
}

// ---------------------------------------------------------------------------
// Specification decoding
// ---------------------------------------------------------------------------

/// Node's `Buffer.from(value, "base64url")`: unknown characters are skipped and
/// trailing bits are discarded rather than rejected.
pub fn base64url_decode(input: &str) -> Vec<u8> {
    let mut output = Vec::with_capacity(input.len() * 3 / 4 + 3);
    let mut buffer: u32 = 0;
    let mut bits: u32 = 0;
    for byte in input.bytes() {
        let value = match byte {
            b'A'..=b'Z' => byte - b'A',
            b'a'..=b'z' => byte - b'a' + 26,
            b'0'..=b'9' => byte - b'0' + 52,
            b'-' | b'+' => 62,
            b'_' | b'/' => 63,
            b'=' => break,
            _ => continue,
        };
        buffer = (buffer << 6) | u32::from(value);
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            output.push((buffer >> bits) as u8);
        }
    }
    output
}

fn is_valid_agent_id(id: &str) -> bool {
    let mut chars = id.bytes();
    match chars.next() {
        Some(first) if first.is_ascii_lowercase() => {}
        _ => return false,
    }
    chars.all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
}

fn is_sha256_hex(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

/// Decode and validate `process.argv[2]`.
///
/// Divergence: a payload that is not a JSON object reports
/// [`LauncherError::InvalidSpec`]. The source surfaces the engine's
/// `JSON.parse`/property-access text instead, which is not reproducible without
/// V8 and is not part of any documented contract.
pub fn parse_spec(encoded: Option<&str>) -> Result<BinarySpec, LauncherError> {
    let encoded = encoded
        .filter(|value| !value.is_empty())
        .ok_or(LauncherError::MissingSpec)?;
    let payload = String::from_utf8_lossy(&base64url_decode(encoded)).into_owned();
    let parsed: Value = serde_json::from_str(&payload).map_err(|_| LauncherError::InvalidSpec)?;
    let value: &Map<String, Value> = parsed.as_object().ok_or(LauncherError::InvalidSpec)?;
    let field = |key: &str| value.get(key).and_then(Value::as_str).unwrap_or("");
    let (id, version, target, archive, cmd) = (
        field("id"),
        field("version"),
        field("target"),
        field("archive"),
        field("cmd"),
    );
    if !is_valid_agent_id(id) || version.is_empty() || target.is_empty() || cmd.is_empty() {
        return Err(LauncherError::InvalidSpec);
    }
    let archive_url = url::Url::parse(archive).map_err(|_| LauncherError::InvalidUrl)?;
    if archive_url.scheme() != "https" {
        return Err(LauncherError::InsecureDownload);
    }
    let sha256 = value
        .get("sha256")
        .and_then(Value::as_str)
        .filter(|candidate| is_sha256_hex(candidate))
        .map(str::to_ascii_lowercase);
    let args = value
        .get("args")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.as_str().map(str::to_string))
                .collect()
        })
        .unwrap_or_default();
    let env = value
        .get("env")
        .and_then(Value::as_object)
        .map(|entries| {
            entries
                .iter()
                .filter_map(|(name, item)| {
                    item.as_str().map(|text| (name.clone(), text.to_string()))
                })
                .collect()
        })
        .unwrap_or_default();
    Ok(BinarySpec {
        id: id.to_string(),
        version: version.to_string(),
        target: target.to_string(),
        archive: archive_url.to_string(),
        cmd: cmd.to_string(),
        args,
        env,
        sha256,
    })
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

/// `path.posix.resolve`.
pub fn resolve_path(base: &Path, segments: &[&str]) -> PathBuf {
    let mut combined = if base.is_absolute() {
        base.to_path_buf()
    } else {
        std::env::current_dir()
            .unwrap_or_else(|_| PathBuf::from("/"))
            .join(base)
    };
    for segment in segments {
        combined.push(segment);
    }
    normalize_lexically(&combined)
}

fn normalize_lexically(path: &Path) -> PathBuf {
    let mut parts: Vec<OsString> = Vec::new();
    let mut rooted = false;
    for component in path.components() {
        match component {
            Component::RootDir => {
                rooted = true;
                parts.clear();
            }
            Component::CurDir => {}
            Component::ParentDir => {
                parts.pop();
            }
            Component::Normal(part) => parts.push(part.to_os_string()),
            Component::Prefix(prefix) => parts.push(prefix.as_os_str().to_os_string()),
        }
    }
    let mut resolved = PathBuf::new();
    if rooted {
        resolved.push("/");
    }
    for part in parts {
        resolved.push(part);
    }
    if resolved.as_os_str().is_empty() {
        resolved.push(".");
    }
    resolved
}

/// `path.posix.relative`.
pub fn relative_path(from: &Path, to: &Path) -> PathBuf {
    let from = normalize_lexically(from);
    let to = normalize_lexically(to);
    let from_parts: Vec<Component> = from.components().collect();
    let to_parts: Vec<Component> = to.components().collect();
    let mut shared = 0;
    while shared < from_parts.len()
        && shared < to_parts.len()
        && from_parts[shared] == to_parts[shared]
    {
        shared += 1;
    }
    let mut result = PathBuf::new();
    for _ in shared..from_parts.len() {
        result.push("..");
    }
    for component in &to_parts[shared..] {
        result.push(component.as_os_str());
    }
    if result.as_os_str().is_empty() {
        result.push("");
    }
    result
}

/// `assertInside`: reject a candidate outside `root` without touching symlinks.
pub fn assert_inside(root: &Path, candidate: &Path) -> Result<(), LauncherError> {
    let path_from_root = relative_path(&resolve_path(root, &[]), &resolve_path(candidate, &[]));
    let escaped = path_from_root.as_os_str() == ".."
        || path_from_root.starts_with("../")
        || path_from_root.is_absolute();
    if escaped {
        return Err(LauncherError::EscapedInstallDir);
    }
    Ok(())
}

/// `resolveArchiveCommand`: normalize the registry-supplied command and prove it
/// stays inside `root`.
pub fn resolve_archive_command(root: &Path, command: &str) -> Result<PathBuf, LauncherError> {
    let normalized = command.replace('\\', "/");
    let normalized = normalized.strip_prefix("./").unwrap_or(&normalized);
    if normalized.is_empty()
        || normalized.starts_with('/')
        || normalized.split('/').any(|segment| segment == "..")
    {
        return Err(LauncherError::UnsafeCommand);
    }
    let segments: Vec<&str> = normalized.split('/').collect();
    let resolved = resolve_path(root, &segments);
    assert_inside(root, &resolved)?;
    Ok(resolved)
}

/// Reject an install path assembled from unvalidated registry fields.
///
/// Divergence from the source, which joins `id`/`version`/`target` directly:
/// `version` and `target` are not constrained by the registry contract, so a
/// value containing `..` or an absolute component escapes the binary root
/// before any lock or marker check runs. The native port refuses that
/// composition instead of writing outside the root.
pub fn install_directory(root: &Path, spec: &BinarySpec) -> Result<PathBuf, LauncherError> {
    for segment in [&spec.id, &spec.version, &spec.target] {
        let mut components = Path::new(segment).components();
        let single =
            matches!(components.next(), Some(Component::Normal(_))) && components.next().is_none();
        if !single || segment.contains('/') || segment.contains('\\') {
            return Err(LauncherError::EscapedInstallDir);
        }
    }
    let directory = resolve_path(
        root,
        &[
            spec.id.as_str(),
            spec.version.as_str(),
            spec.target.as_str(),
        ],
    );
    assert_inside(root, &directory)?;
    Ok(directory)
}

/// `archiveFileName`: last path segment of the archive URL, or a fixed fallback.
pub fn archive_file_name(url: &str) -> String {
    let Ok(parsed) = url::Url::parse(url) else {
        return "agent-archive".into();
    };
    let trimmed = parsed.path().trim_end_matches('/');
    match trimmed.rsplit('/').next() {
        Some(name) if !name.is_empty() => name.to_string(),
        _ => "agent-archive".into(),
    }
}

/// `getStateDirectory`.
pub fn state_directory<E>(env: &E, home: &Path) -> Result<PathBuf, LauncherError>
where
    E: Fn(&str) -> Option<String> + ?Sized,
{
    match env(STATE_DIR_ENV) {
        Some(configured) => {
            let configured = js_trim(&configured);
            if configured.is_empty() {
                return Ok(home.join(".jait"));
            }
            if !configured.starts_with('/') {
                return Err(LauncherError::StateDirectoryNotAbsolute);
            }
            Ok(PathBuf::from(configured))
        }
        None => Ok(home.join(".jait")),
    }
}

/// Effective agent binary root.
///
/// `JAIT_STATE_DIR` is only consulted when `JAIT_ACP_BINARY_ROOT` is unset or
/// blank, matching the source's short-circuiting `||`.
pub fn binary_root<E>(env: &E, home: &Path) -> Result<PathBuf, LauncherError>
where
    E: Fn(&str) -> Option<String> + ?Sized,
{
    if let Some(configured) = env(AGENT_BINARY_ROOT_ENV) {
        let configured = js_trim(&configured);
        if !configured.is_empty() {
            return Ok(PathBuf::from(configured));
        }
    }
    Ok(state_directory(env, home)?.join("acp-agents"))
}

/// `mkdir(lockDir)` target for an install directory.
pub fn lock_path(install_dir: &Path) -> PathBuf {
    let mut name = install_dir.as_os_str().to_os_string();
    name.push(INSTALL_LOCK_SUFFIX);
    PathBuf::from(name)
}

// ---------------------------------------------------------------------------
// Archive validation
// ---------------------------------------------------------------------------

/// JavaScript `String.prototype.split(/\r?\n/)`.
fn split_js_lines(text: &str) -> Vec<&str> {
    let mut lines = Vec::new();
    let mut rest = text;
    loop {
        match rest.find('\n') {
            Some(index) => {
                let line = &rest[..index];
                lines.push(line.strip_suffix('\r').unwrap_or(line));
                rest = &rest[index + 1..];
            }
            None => {
                lines.push(rest);
                break;
            }
        }
    }
    lines
}

/// `validateArchiveEntries`: reject absolute, drive-qualified and parent-escaping
/// archive members before extraction.
pub fn validate_archive_entries(listing: &str) -> Result<(), LauncherError> {
    for entry in split_js_lines(listing) {
        if entry.is_empty() {
            continue;
        }
        let normalized = entry.replace('\\', "/");
        let drive_qualified = {
            let bytes = normalized.as_bytes();
            bytes.len() >= 3
                && bytes[0].is_ascii_alphabetic()
                && bytes[1] == b':'
                && bytes[2] == b'/'
        };
        if normalized.starts_with('/')
            || drive_qualified
            || normalized.split('/').any(|segment| segment == "..")
        {
            return Err(LauncherError::UnsafeArchiveEntry(entry.to_string()));
        }
    }
    Ok(())
}

fn is_zip_archive(archive: &Path) -> bool {
    archive.to_string_lossy().to_lowercase().ends_with(".zip")
}

/// `unzip` is only used for `.zip` archives away from Windows.
fn prefers_unzip(archive: &Path) -> bool {
    is_zip_archive(archive) && !cfg!(windows)
}

/// `execFile("unzip"|"tar", ["-Z1"|"-tf", archive])`.
pub fn archive_listing_command(archive: &Path) -> ToolInvocation {
    if prefers_unzip(archive) {
        ToolInvocation {
            max_buffer: ARCHIVE_TOOL_OUTPUT_LIMIT,
            program: "unzip".into(),
            args: vec!["-Z1".into(), archive.to_string_lossy().into_owned()],
        }
    } else {
        ToolInvocation {
            max_buffer: ARCHIVE_TOOL_OUTPUT_LIMIT,
            program: "tar".into(),
            args: vec!["-tf".into(), archive.to_string_lossy().into_owned()],
        }
    }
}

/// `execFile("unzip"|"tar", ["-q"|"-xf", archive, "-d"|"-C", destination])`.
pub fn archive_extract_command(archive: &Path, destination: &Path) -> ToolInvocation {
    if prefers_unzip(archive) {
        ToolInvocation {
            max_buffer: 1024 * 1024,
            program: "unzip".into(),
            args: vec![
                "-q".into(),
                archive.to_string_lossy().into_owned(),
                "-d".into(),
                destination.to_string_lossy().into_owned(),
            ],
        }
    } else {
        ToolInvocation {
            max_buffer: 1024 * 1024,
            program: "tar".into(),
            args: vec![
                "-xf".into(),
                archive.to_string_lossy().into_owned(),
                "-C".into(),
                destination.to_string_lossy().into_owned(),
            ],
        }
    }
}

// ---------------------------------------------------------------------------
// Marker
// ---------------------------------------------------------------------------

/// The exact `JSON.stringify({ archive, sha256, cmd })` payload.
pub fn marker_payload(spec: &BinarySpec) -> String {
    let mut object = Map::new();
    object.insert("archive".into(), Value::String(spec.archive.clone()));
    object.insert(
        "sha256".into(),
        match &spec.sha256 {
            Some(digest) => Value::String(digest.clone()),
            None => Value::Null,
        },
    );
    object.insert("cmd".into(), Value::String(spec.cmd.clone()));
    Value::Object(object).to_string()
}

/// `isCurrentInstall` after the marker and command have been read.
pub fn marker_is_current(marker_payload: &str, command_present: bool, spec: &BinarySpec) -> bool {
    if !command_present {
        return false;
    }
    let Ok(parsed) = serde_json::from_str::<Value>(marker_payload) else {
        return false;
    };
    let Some(stored) = parsed.as_object() else {
        return false;
    };
    let archive_matches =
        stored.get("archive").and_then(Value::as_str) == Some(spec.archive.as_str());
    let digest_matches = match &spec.sha256 {
        Some(expected) => stored.get("sha256").and_then(Value::as_str) == Some(expected.as_str()),
        None => matches!(stored.get("sha256"), Some(Value::Null)),
    };
    let cmd_matches = stored.get("cmd").and_then(Value::as_str) == Some(spec.cmd.as_str());
    archive_matches && digest_matches && cmd_matches
}

/// `isCurrentInstall` against the real filesystem; any read failure is `false`.
pub async fn is_current_install(marker: &Path, command: &Path, spec: &BinarySpec) -> bool {
    let Ok(bytes) = std::fs::read(marker) else {
        return false;
    };
    let payload = String::from_utf8_lossy(&bytes).into_owned();
    let command_present = std::fs::metadata(command).is_ok();
    marker_is_current(&payload, command_present, spec)
}

// ---------------------------------------------------------------------------
// Filesystem helpers
// ---------------------------------------------------------------------------

// The crate does not enable tokio's `fs` feature and this lane may not edit
// Cargo, so the small, bounded metadata operations stay on `std::fs`. They are
// kept `async` so call sites and the injected-runtime seam do not change if a
// blocking pool is introduced later.
async fn create_directory(path: &Path) -> Result<(), LauncherError> {
    let mut builder = std::fs::DirBuilder::new();
    builder.recursive(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::DirBuilderExt;
        builder.mode(0o700);
    }
    builder.create(path).map_err(LauncherError::io)
}

async fn write_owner_only(path: &Path, contents: &[u8]) -> Result<(), LauncherError> {
    use std::io::Write;
    let mut options = std::fs::OpenOptions::new();
    options.write(true).create(true).truncate(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options.open(path).map_err(LauncherError::io)?;
    file.write_all(contents).map_err(LauncherError::io)?;
    file.flush().map_err(LauncherError::io)
}

async fn remove_tree(path: &Path) -> Result<(), LauncherError> {
    match std::fs::remove_dir_all(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        // `rm(path, { recursive: true, force: true })` also accepts a plain file.
        Err(_) => match std::fs::remove_file(path) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(LauncherError::io(error)),
        },
    }
}

async fn set_executable(path: &Path) -> Result<(), LauncherError> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let permissions = std::fs::Permissions::from_mode(0o755);
        std::fs::set_permissions(path, permissions).map_err(LauncherError::io)?;
    }
    #[cfg(not(unix))]
    {
        // Gap: Windows has no executable bit; the source skips chmod there too.
        let _ = path;
    }
    Ok(())
}

/// Best-effort removal of a directory tree when the value is dropped.
///
/// The pipeline removes the lock and the scratch tree explicitly so that a
/// failing `rm` is reported to the caller in the same order as the source. A
/// future that is dropped mid-install (cancellation, `timeout`, runtime
/// shutdown) never reaches those statements, so the same trees are also armed
/// here and released once the explicit removal succeeded.
struct ScopedTree {
    path: PathBuf,
    armed: bool,
}

impl ScopedTree {
    fn new(path: PathBuf) -> Self {
        Self { path, armed: true }
    }

    /// The explicit removal ran; stop tracking the path.
    fn release(&mut self) {
        self.armed = false;
    }
}

impl Drop for ScopedTree {
    fn drop(&mut self) {
        if !self.armed {
            return;
        }
        match std::fs::symlink_metadata(&self.path) {
            Ok(metadata) if metadata.is_dir() => {
                let _ = std::fs::remove_dir_all(&self.path);
            }
            Ok(_) => {
                let _ = std::fs::remove_file(&self.path);
            }
            Err(_) => {}
        }
    }
}

async fn create_temporary_root(parent: &Path) -> Result<PathBuf, LauncherError> {
    for _ in 0..16 {
        let candidate = parent.join(format!(".install-{}", uuid::Uuid::new_v4().simple()));
        match std::fs::create_dir(&candidate) {
            Ok(()) => return Ok(candidate),
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(LauncherError::io(error)),
        }
    }
    Err(LauncherError::Io(
        "could not create ACP install scratch directory".into(),
    ))
}

// ---------------------------------------------------------------------------
// Lock
// ---------------------------------------------------------------------------

/// `acquireLock`: claim the install lock directory, reclaiming it when the
/// holder is more than [`INSTALL_LOCK_STALE`] old.
///
/// Returns `false` when [`INSTALL_LOCK_WAIT`] elapses without the lock, which is
/// exactly when the source reports a timeout.
pub async fn acquire_lock<I>(io: &I, lock_dir: &Path) -> Result<bool, LauncherError>
where
    I: LauncherIo,
{
    let wait_ms = INSTALL_LOCK_WAIT.as_secs_f64() * 1000.0;
    let stale_ms = INSTALL_LOCK_STALE.as_secs_f64() * 1000.0;
    let started_at = io.now_ms();
    while io.now_ms() - started_at < wait_ms {
        match std::fs::create_dir(lock_dir) {
            Ok(()) => return Ok(true),
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {
                if let Some(modified) = io.lock_mtime_ms(lock_dir).await
                    && io.now_ms() - modified > stale_ms
                {
                    remove_tree(lock_dir).await?;
                    continue;
                }
                io.sleep(INSTALL_LOCK_POLL).await;
            }
            Err(error) => return Err(LauncherError::io(error)),
        }
    }
    Ok(false)
}

// ---------------------------------------------------------------------------
// Install
// ---------------------------------------------------------------------------

/// `ensureInstalled`.
///
/// Order is the contract: marker check without creating anything, then parent
/// `mkdir`, then lock, then two more marker checks, then a scratch install.
pub async fn ensure_installed<I>(
    io: &I,
    spec: &BinarySpec,
    root: &Path,
) -> Result<PathBuf, LauncherError>
where
    I: LauncherIo,
{
    let install_dir = install_directory(root, spec)?;
    let command = resolve_archive_command(&install_dir, &spec.cmd)?;
    let marker = install_dir.join(INSTALL_MARKER_FILE);
    if is_current_install(&marker, &command, spec).await {
        return Ok(command);
    }

    let parent = install_dir
        .parent()
        .ok_or(LauncherError::EscapedInstallDir)?
        .to_path_buf();
    create_directory(&parent).await?;

    let lock_dir = lock_path(&install_dir);
    if !acquire_lock(io, &lock_dir).await? {
        if is_current_install(&marker, &command, spec).await {
            return Ok(command);
        }
        return Err(LauncherError::InstallTimedOut(spec.id.clone()));
    }
    // The lock is ours from here on. If this future is dropped, the guard keeps
    // the lock from outliving the run and blocking every later attempt.
    let mut lock = ScopedTree::new(lock_dir.clone());

    let installed = install_under_lock(io, spec, &install_dir, &parent, &marker, &command).await;
    let released = remove_tree(&lock_dir).await;
    if released.is_ok() {
        lock.release();
    }
    match installed {
        Ok(()) => {
            released?;
            Ok(command)
        }
        Err(error) => Err(error),
    }
}

async fn install_under_lock<I>(
    io: &I,
    spec: &BinarySpec,
    install_dir: &Path,
    parent: &Path,
    marker: &Path,
    command: &Path,
) -> Result<(), LauncherError>
where
    I: LauncherIo,
{
    if is_current_install(marker, command, spec).await {
        return Ok(());
    }
    let temporary_root = create_temporary_root(parent).await?;
    let mut scratch = ScopedTree::new(temporary_root.clone());
    let installed = install_into_scratch(io, spec, install_dir, &temporary_root, marker).await;
    let cleaned = remove_tree(&temporary_root).await;
    if cleaned.is_ok() {
        scratch.release();
    }
    match installed {
        Ok(()) => cleaned,
        Err(error) => Err(error),
    }
}

async fn install_into_scratch<I>(
    io: &I,
    spec: &BinarySpec,
    install_dir: &Path,
    temporary_root: &Path,
    marker: &Path,
) -> Result<(), LauncherError>
where
    I: LauncherIo,
{
    let archive_path = temporary_root.join(archive_file_name(&spec.archive));
    let extract_dir = temporary_root.join("files");
    create_directory(&extract_dir).await?;

    let archive = io.download(&spec.archive, DOWNLOAD_TIMEOUT).await?;
    if let Some(expected) = &spec.sha256 {
        let digest = hex::encode(Sha256::digest(&archive));
        if &digest != expected {
            return Err(LauncherError::ChecksumMismatch(spec.id.clone()));
        }
    }
    write_owner_only(&archive_path, &archive).await?;

    let listing = io.run_tool(archive_listing_command(&archive_path)).await?;
    validate_archive_entries(&listing)?;
    io.run_tool(archive_extract_command(&archive_path, &extract_dir))
        .await?;

    let extracted_command = resolve_archive_command(&extract_dir, &spec.cmd)?;
    let real_command = std::fs::canonicalize(&extracted_command).map_err(LauncherError::io)?;
    assert_inside(&extract_dir, &real_command)?;
    set_executable(&real_command).await?;

    remove_tree(install_dir).await?;
    std::fs::rename(&extract_dir, install_dir).map_err(LauncherError::io)?;
    write_owner_only(marker, marker_payload(spec).as_bytes()).await
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

/// Launcher entry point, equivalent to `main()` plus its `.catch` handler.
///
/// `argv` uses the script layout the TypeScript file sees:
/// `argv[0]` is the interpreter, `argv[1]` is the encoded specification, and
/// `argv[2..]` are forwarded to the agent unchanged.
pub async fn run<I, P, E>(argv: &[String], env: &E, home: &Path, io: &I, process: &P) -> LauncherRun
where
    I: LauncherIo,
    P: LauncherProcess,
    E: Fn(&str) -> Option<String> + ?Sized,
{
    let spec = match parse_spec(argv.get(1).map(String::as_str)) {
        Ok(spec) => spec,
        Err(error) => return LauncherRun::failure(error),
    };
    let root = match binary_root(env, home) {
        Ok(root) => root,
        Err(error) => return LauncherRun::failure(error),
    };
    let command = match ensure_installed(io, &spec, &root).await {
        Ok(command) => command,
        Err(error) => return LauncherRun::failure(error),
    };
    let mut args = spec.args.clone();
    args.extend(argv.iter().skip(2).cloned());
    match process.run_child(&command, &args, &spec.env, true).await {
        Ok(outcome) => match outcome.signal {
            Some(signal) => LauncherRun {
                termination: LauncherTermination::Signal(signal),
                stderr: Vec::new(),
            },
            None => LauncherRun {
                termination: LauncherTermination::Exit(outcome.code.unwrap_or(1)),
                stderr: Vec::new(),
            },
        },
        Err(error) => LauncherRun::failure(error),
    }
}

/// Re-raise `signal` in the current process, matching
/// `process.kill(process.pid, signal)`.
///
/// Only for a real binary entry point; never called by the library or tests.
#[cfg(unix)]
pub fn terminate_with_signal(signal: i32) {
    // SAFETY: `signal` and `raise` are async-signal-safe and only affect this
    // process. The default disposition is restored first: this launcher may
    // have installed a handler for the same signal (the forwarding listener in
    // [`SystemProcess`]), and a handled `raise` would return normally and let
    // the process exit 0. Node installs no such handler for its own exit path,
    // so `process.kill(process.pid, signal)` always terminates by signal and the
    // caller observes `128 + signal`.
    unsafe {
        libc::signal(signal, libc::SIG_DFL);
        libc::raise(signal);
    }
}

// ---------------------------------------------------------------------------
// System adapters
// ---------------------------------------------------------------------------

/// Production [`LauncherIo`]: real HTTP downloads and real `tar`/`unzip`.
pub struct SystemLauncher {
    client: reqwest::Client,
}

impl SystemLauncher {
    pub fn new() -> Result<Self, LauncherError> {
        Self::with_builder(reqwest::Client::builder())
    }

    /// Preserve fetch's twenty-redirect budget while allowing an explicit CA.
    pub fn with_builder(builder: reqwest::ClientBuilder) -> Result<Self, LauncherError> {
        let client = builder
            .redirect(reqwest::redirect::Policy::limited(20))
            .build()
            .map_err(|error| LauncherError::Transport(error.to_string()))?;
        Ok(Self { client })
    }

    /// Use a caller-configured client, for example one that trusts a
    /// self-hosted mirror's certificate authority.
    pub fn with_client(client: reqwest::Client) -> Self {
        Self { client }
    }
}

impl LauncherIo for SystemLauncher {
    fn now_ms(&self) -> f64 {
        system_now_ms()
    }

    async fn sleep(&self, duration: Duration) {
        tokio::time::sleep(duration).await;
    }

    async fn lock_mtime_ms(&self, path: &Path) -> Option<f64> {
        file_mtime_ms(path).await
    }

    async fn download(&self, url: &str, timeout: Duration) -> Result<Vec<u8>, LauncherError> {
        let response = self
            .client
            .get(url)
            .timeout(timeout)
            .send()
            .await
            .map_err(|error| LauncherError::Transport(error.to_string()))?;
        if !response.status().is_success() {
            return Err(LauncherError::DownloadFailed(response.status().as_u16()));
        }
        let body = response
            .bytes()
            .await
            .map_err(|error| LauncherError::Transport(error.to_string()))?;
        Ok(body.to_vec())
    }

    async fn run_tool(&self, invocation: ToolInvocation) -> Result<String, LauncherError> {
        let mut command = Command::new(&invocation.program);
        command
            .args(&invocation.args)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);
        let mut child = command
            .spawn()
            .map_err(|error| LauncherError::Tool(format!("{}: {error}", invocation.program)))?;
        let stdout = child.stdout.take().expect("piped stdout");
        let stderr = child.stderr.take().expect("piped stderr");
        let (stdout, stderr, status) = tokio::try_join!(
            read_archive_output(stdout, invocation.max_buffer, &invocation.program),
            read_archive_output(stderr, invocation.max_buffer, &invocation.program),
            async {
                child.wait().await.map_err(|error| {
                    LauncherError::Tool(format!("{}: {error}", invocation.program))
                })
            }
        )?;
        if !status.success() {
            return Err(LauncherError::Tool(format!(
                "{} failed: {}",
                invocation.program,
                String::from_utf8_lossy(&stderr).trim()
            )));
        }
        Ok(String::from_utf8_lossy(&stdout).into_owned())
    }
}

async fn read_archive_output(
    stream: impl AsyncRead + Unpin,
    limit: usize,
    program: &str,
) -> Result<Vec<u8>, LauncherError> {
    let mut bytes = Vec::new();
    stream
        .take(limit.saturating_add(1) as u64)
        .read_to_end(&mut bytes)
        .await
        .map_err(|error| LauncherError::Tool(format!("{program}: {error}")))?;
    if bytes.len() > limit {
        return Err(LauncherError::Tool(format!(
            "{program} exceeded {limit} bytes of output"
        )));
    }
    Ok(bytes)
}

/// Production [`LauncherProcess`]: inherited stdio, signal forwarding, and
/// signal-shaped exit statuses.
///
/// Divergence from the source: the child is killed when this future is dropped
/// (`kill_on_drop`). Node's launcher exits only after `child.on('exit')`, so an
/// abandoned child was never observed there either; the native guard makes the
/// bound explicit so a cancelled run cannot leave an agent behind.
pub struct SystemProcess;

impl LauncherProcess for SystemProcess {
    async fn run_child(
        &self,
        command: &Path,
        args: &[String],
        env: &[(String, String)],
        forward_signals: bool,
    ) -> Result<ExitOutcome, LauncherError> {
        let mut child = Command::new(command);
        child
            .args(args)
            .stdin(Stdio::inherit())
            .stdout(Stdio::inherit())
            .stderr(Stdio::inherit())
            .kill_on_drop(true);
        for (name, value) in env {
            child.env(name, value);
        }
        let mut child = spawn_surviving_executable_busy(&mut child).await?;

        let forwarder = if forward_signals {
            forward_signals_to(child.id())
        } else {
            None
        };
        // Own the forwarder across cancellation and wait errors as well as success.
        let forwarder = forwarder.map(SignalForwarder);
        let status = child
            .wait()
            .await
            .map_err(|error| LauncherError::SpawnFailed(error.to_string()));
        drop(forwarder);
        let status = status?;
        #[cfg(unix)]
        {
            use std::os::unix::process::ExitStatusExt;
            if let Some(signal) = status.signal() {
                return Ok(ExitOutcome {
                    code: None,
                    signal: Some(signal),
                });
            }
        }
        Ok(ExitOutcome {
            code: status.code(),
            signal: None,
        })
    }
}

/// Total spawn attempts made while `execve` reports `ETXTBSY`.
const EXECUTABLE_BUSY_ATTEMPTS: usize = 10;
/// Pause between those attempts.
const EXECUTABLE_BUSY_BACKOFF: Duration = Duration::from_millis(10);

/// Spawn the installed command, retrying a bounded number of times while the
/// kernel reports `ETXTBSY`.
///
/// The installer writes the agent binary and this process immediately execs it,
/// so the very file being spawned was, moments earlier, open for writing. On
/// Linux `execve` fails with `ETXTBSY` ("Text file busy") whenever *any*
/// process still holds that inode open for writing, including a `fork` in
/// another thread that inherited the installer's descriptor and has not reached
/// `exec` yet. The window is sub-millisecond, so retrying is the remedy Cargo
/// applies to its own freshly built tools; the bound keeps a permanently busy
/// file an honest [`LauncherError::SpawnFailed`].
///
/// Divergence from the source: Node's `spawn` surfaces the first `ETXTBSY`
/// immediately instead of retrying. Only that one errno is retried, so every
/// other spawn failure (missing file, permissions, bad format) is reported on
/// the first attempt as before.
async fn spawn_surviving_executable_busy(
    command: &mut Command,
) -> Result<tokio::process::Child, LauncherError> {
    retry_executable_busy(|| command.spawn())
        .await
        .map_err(|error| LauncherError::SpawnFailed(error.to_string()))
}

/// Attempt `spawn` until it stops reporting `ETXTBSY`, up to
/// [`EXECUTABLE_BUSY_ATTEMPTS`] times, then surface the last error unchanged.
async fn retry_executable_busy<T>(mut spawn: impl FnMut() -> io::Result<T>) -> io::Result<T> {
    let mut attempt = 1;
    loop {
        match spawn() {
            Ok(value) => return Ok(value),
            Err(error) if is_executable_busy(&error) && attempt < EXECUTABLE_BUSY_ATTEMPTS => {
                attempt += 1;
                tokio::time::sleep(EXECUTABLE_BUSY_BACKOFF).await;
            }
            Err(error) => return Err(error),
        }
    }
}

#[cfg(unix)]
fn is_executable_busy(error: &io::Error) -> bool {
    error.raw_os_error() == Some(libc::ETXTBSY)
}

#[cfg(not(unix))]
fn is_executable_busy(_error: &io::Error) -> bool {
    false
}

struct SignalForwarder(tokio::task::JoinHandle<()>);
impl Drop for SignalForwarder {
    fn drop(&mut self) {
        self.0.abort();
    }
}

/// Forward the launcher's `SIGINT`/`SIGTERM` to `pid`, as the source does with
/// `child.kill(signal)`.
#[cfg(unix)]
fn forward_signals_to(pid: Option<u32>) -> Option<tokio::task::JoinHandle<()>> {
    use tokio::signal::unix::{SignalKind, signal};
    let pid = pid?;
    // Registration happens here, before the forwarding task is spawned, so a
    // signal delivered immediately after the child starts is queued for
    // forwarding instead of taking the launcher's default action. The source's
    // `process.on('SIGINT'|'SIGTERM', …)` is equally synchronous.
    let mut interrupt = signal(SignalKind::interrupt()).ok()?;
    let mut terminate = signal(SignalKind::terminate()).ok()?;
    Some(tokio::spawn(async move {
        loop {
            let forwarded = tokio::select! {
                received = interrupt.recv() => received.map(|_| libc::SIGINT),
                received = terminate.recv() => received.map(|_| libc::SIGTERM),
            };
            let Some(signal) = forwarded else {
                return;
            };
            // SAFETY: delivering a signal to a known child pid.
            unsafe {
                libc::kill(pid as libc::pid_t, signal);
            }
        }
    }))
}

#[cfg(not(unix))]
fn forward_signals_to(_pid: Option<u32>) -> Option<tokio::task::JoinHandle<()>> {
    // Gap: Windows has no POSIX signal forwarding; `windowsHide` and child
    // termination need a Job Object, which the source does not implement either.
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        pin::Pin,
        sync::{
            Arc,
            atomic::{AtomicUsize, Ordering},
        },
        task::{Context, Poll},
    };
    struct Probe {
        read: Arc<AtomicUsize>,
        remaining: usize,
    }
    impl AsyncRead for Probe {
        fn poll_read(
            mut self: Pin<&mut Self>,
            _cx: &mut Context<'_>,
            output: &mut tokio::io::ReadBuf<'_>,
        ) -> Poll<io::Result<()>> {
            let size = output.remaining().min(self.remaining);
            output.put_slice(&vec![b'x'; size]);
            self.remaining -= size;
            self.read.fetch_add(size, Ordering::SeqCst);
            Poll::Ready(Ok(()))
        }
    }
    #[tokio::test]
    async fn archive_reader_stops_after_limit_plus_detection_byte() {
        let read = Arc::new(AtomicUsize::new(0));
        let error = read_archive_output(
            Probe {
                read: read.clone(),
                remaining: 4096,
            },
            1024,
            "fixture",
        )
        .await
        .unwrap_err();
        assert!(error.message().contains("1024 bytes"));
        assert_eq!(read.load(Ordering::SeqCst), 1025);
    }
    fn executable_busy() -> io::Error {
        io::Error::from_raw_os_error(26)
    }
    #[tokio::test]
    async fn retry_executable_busy_spawns_once_the_executable_is_released() {
        let attempts = Arc::new(AtomicUsize::new(0));
        let result = retry_executable_busy(|| {
            let attempt = attempts.fetch_add(1, Ordering::SeqCst) + 1;
            if attempt <= 3 {
                Err(executable_busy())
            } else {
                Ok(format!("spawned after {attempt} attempts"))
            }
        })
        .await;
        assert_eq!(result.unwrap(), "spawned after 4 attempts");
        assert_eq!(attempts.load(Ordering::SeqCst), 4);
    }
    #[tokio::test]
    async fn retry_executable_busy_surfaces_other_spawn_errors_immediately() {
        let attempts = Arc::new(AtomicUsize::new(0));
        let error = retry_executable_busy::<()>(|| {
            attempts.fetch_add(1, Ordering::SeqCst);
            Err(io::Error::from_raw_os_error(13))
        })
        .await
        .unwrap_err();
        assert_eq!(attempts.load(Ordering::SeqCst), 1);
        assert_eq!(error.raw_os_error(), Some(13));
    }
    #[tokio::test]
    async fn retry_executable_busy_gives_up_after_the_attempt_budget() {
        let attempts = Arc::new(AtomicUsize::new(0));
        let error = retry_executable_busy::<()>(|| {
            attempts.fetch_add(1, Ordering::SeqCst);
            Err(executable_busy())
        })
        .await
        .unwrap_err();
        assert_eq!(attempts.load(Ordering::SeqCst), EXECUTABLE_BUSY_ATTEMPTS);
        assert_eq!(error.raw_os_error(), Some(26));
    }
    #[cfg(unix)]
    #[tokio::test]
    async fn spawn_waits_out_a_text_file_busy_install() {
        use std::os::unix::fs::PermissionsExt;
        let root = std::env::temp_dir().join(format!(
            "jait-acp-etxtbsy-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&root).unwrap();
        let script = root.join("agent.sh");
        std::fs::write(&script, "#!/bin/sh\nprintf installed\n").unwrap();
        std::fs::set_permissions(&script, std::fs::Permissions::from_mode(0o755)).unwrap();
        // An open writer anywhere makes execve fail with ETXTBSY, exactly as it
        // does while the installer's descriptor is still live.
        let writer = std::fs::OpenOptions::new()
            .append(true)
            .open(&script)
            .unwrap();
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(40)).await;
            drop(writer);
        });
        let mut command = Command::new(&script);
        command.stdout(Stdio::piped());
        let child = spawn_surviving_executable_busy(&mut command)
            .await
            .expect("the released executable spawns");
        let output = child.wait_with_output().await.unwrap();
        assert_eq!(String::from_utf8_lossy(&output.stdout), "installed");
        let _ = std::fs::remove_dir_all(&root);
    }
}
