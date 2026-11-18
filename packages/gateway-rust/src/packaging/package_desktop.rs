//! Port of `packages/gateway/scripts/package-desktop.mjs`.
//!
//! The reference stages the lockfile-resolved production dependency graph next
//! to a desktop bundle: it embeds a Node runtime, walks the real (symlink
//! dereferenced) dependency graph of `packages/gateway`, installs it into an
//! output `node_modules` tree with npm-style hoisting, copies workspace
//! packages by their `files` allowlist instead of their whole directory, and
//! writes a `manifest.json` describing platform, arch, Node and gateway
//! versions.
//!
//! Divergences from the reference, all deliberate and documented here:
//!
//! * The reference derives the repo root from `import.meta.url` and always
//!   embeds `process.execPath`. The native port takes both as explicit inputs
//!   ([`PackageOptions::root`], [`PackageOptions::runtime_binary`]) because a
//!   Rust process is not a Node process and cannot supply either implicitly.
//! * The reference deletes and recreates the output directory (`rmSync` with
//!   `recursive`/`force`). Following `bundle_web`'s native convention, this port
//!   refuses to overwrite a non-empty output unless the caller opts in with
//!   [`PackageOptions::replace_existing_output`].
//! * Directory listings are sorted before copying so the staged tree is
//!   reproducible; the reference relies on filesystem order. Copy order does not
//!   affect hoisting, which is driven by `package.json` dependency order.
//! * Recursion is bounded by [`MAX_DEPTH`] and [`MAX_PACKAGES`]; the reference
//!   has no guard and fails only when the filesystem or the stack gives out.
//! * Copied entries must resolve inside their package, with no directory cycle.
//!   The source tree must remain trusted and stable throughout copying; path
//!   checks and file opens are not atomic against concurrent replacement.
//! * Runtime metadata probing limits time and output. On Linux it terminates the
//!   probe process group; descendants that leave that group can survive. Other
//!   Unix systems clean the group only while the leader is running; non-Unix
//!   termination covers only the direct child.
use std::{
    collections::HashMap,
    fs,
    io::{self, Read},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    thread,
    time::{Duration, Instant},
};

#[cfg(not(unix))]
use std::sync::mpsc;

use serde::Serialize;

/// Output directory, relative to the repo root.
pub const OUTPUT_RELATIVE: &str = "apps/desktop/src-tauri/gateway";
/// The package whose dependency graph is staged.
pub const GATEWAY_PACKAGE_RELATIVE: &str = "packages/gateway";
/// Workspace packages directory, relative to the repo root.
pub const PACKAGES_RELATIVE: &str = "packages";
/// Subdirectory holding the embedded runtime.
pub const RUNTIME_DIRECTORY: &str = "runtime";
/// Directory name of the staged dependency tree.
pub const NODE_MODULES: &str = "node_modules";
/// Minimum accepted runtime major version.
pub const MIN_RUNTIME_MAJOR: u64 = 22;
/// Entry copied for workspace packages when `files` is absent.
pub const DEFAULT_WORKSPACE_ENTRY: &str = "dist";
/// Copy entries that never get staged from a published package directory.
const EXCLUDED_PACKAGE_ENTRIES: [&str; 2] = ["node_modules", ".git"];
/// Guard against runaway recursion on a corrupted dependency graph.
pub const MAX_DEPTH: usize = 256;
/// Guard against runaway package counts on a corrupted dependency graph.
pub const MAX_PACKAGES: usize = 100_000;
/// Runtime file mode applied after copying (the reference's `chmodSync`).
#[cfg(unix)]
const RUNTIME_MODE: u32 = 0o755;

/// Refusal emitted when the staged runtime is not a Node 22+ runtime.
pub const UNSUPPORTED_RUNTIME_MESSAGE: &str = "Package with Node 22 or newer on the target OS";

/// Target platform of the desktop bundle.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PackagePlatform {
    Darwin,
    Win32,
    Linux,
}

impl PackagePlatform {
    /// Value written to `manifest.json` and used in the summary line.
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Darwin => "darwin",
            Self::Win32 => "win32",
            Self::Linux => "linux",
        }
    }

    /// Parse the reference's `process.platform` values.
    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "darwin" => Some(Self::Darwin),
            "win32" => Some(Self::Win32),
            "linux" => Some(Self::Linux),
            _ => None,
        }
    }

    /// Platform of the running host.
    pub fn current() -> Option<Self> {
        Self::parse(std::env::consts::OS)
    }

    /// File name of the embedded runtime, mirroring the reference's
    /// `win32 ? "node.exe" : "node"` choice.
    pub fn runtime_file_name(self) -> &'static str {
        match self {
            Self::Win32 => "node.exe",
            Self::Darwin | Self::Linux => "node",
        }
    }
}

/// Identity of the runtime that gets embedded.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RuntimeIdentity {
    /// `process.release.name` counterpart.
    pub release_name: String,
    /// `process.versions.node` counterpart, without a leading `v`.
    pub version: String,
}

impl RuntimeIdentity {
    /// Major version, or `None` when the version is not numeric.
    pub fn major(&self) -> Option<u64> {
        self.version
            .split('.')
            .next()
            .and_then(|segment| segment.parse::<u64>().ok())
    }
}

/// Refusals raised while staging a desktop bundle.
#[derive(Debug)]
pub enum PackageError {
    /// The staged runtime is not Node 22 or newer.
    UnsupportedRuntime {
        release_name: String,
        version: String,
    },
    /// A workspace package has no built `dist/index.js`.
    MissingBuild { package: String },
    /// A required dependency could not be resolved from the package directory.
    MissingDependency { package: String, dependency: String },
    /// `package.json` could not be read, parsed, or lacked a field the walk needs.
    InvalidManifest { path: PathBuf, message: String },
    /// The output directory holds files and the caller did not opt in to replacing it.
    OutputNotEmpty { path: PathBuf },
    /// The caller did not supply a runtime to embed.
    MissingRuntime,
    /// Recursion or package-count guard tripped.
    LimitExceeded { message: String },
    /// Filesystem failure, with the path that failed.
    Io { path: PathBuf, source: io::Error },
}

impl PackageError {
    fn io(path: impl Into<PathBuf>, source: io::Error) -> Self {
        Self::Io {
            path: path.into(),
            source,
        }
    }

    fn manifest(path: impl Into<PathBuf>, message: impl Into<String>) -> Self {
        Self::InvalidManifest {
            path: path.into(),
            message: message.into(),
        }
    }
}

impl std::fmt::Display for PackageError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::UnsupportedRuntime { .. } => formatter.write_str(UNSUPPORTED_RUNTIME_MESSAGE),
            Self::MissingBuild { package } => {
                write!(formatter, "Build {package} before packaging")
            }
            Self::MissingDependency {
                package,
                dependency,
            } => write!(formatter, "Missing dependency {package} -> {dependency}"),
            Self::InvalidManifest { path, message } => {
                write!(
                    formatter,
                    "Invalid package manifest {}: {message}",
                    path.display()
                )
            }
            Self::OutputNotEmpty { path } => write!(
                formatter,
                "Refusing to replace non-empty packaging output {}",
                path.display()
            ),
            Self::MissingRuntime => {
                formatter.write_str("Packaging needs the path of the runtime to embed")
            }
            Self::LimitExceeded { message } => formatter.write_str(message),
            Self::Io { path, source } => {
                write!(formatter, "{}: {source}", path.display())
            }
        }
    }
}

impl std::error::Error for PackageError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Io { source, .. } => Some(source),
            _ => None,
        }
    }
}

/// Inputs for [`package_desktop`].
#[derive(Debug, Clone)]
pub struct PackageOptions {
    /// Repo root, the reference's `resolve(script_dir, "../../..")`.
    pub root: PathBuf,
    /// Runtime binary to embed; `process.execPath` in the reference.
    pub runtime_binary: Option<PathBuf>,
    /// Output directory; defaults to `<root>/apps/desktop/src-tauri/gateway`.
    pub output: Option<PathBuf>,
    /// Permit replacing a non-empty output directory.
    pub replace_existing_output: bool,
}

impl PackageOptions {
    /// Options for `root` that still need a runtime binary.
    pub fn new(root: impl Into<PathBuf>) -> Self {
        Self {
            root: root.into(),
            runtime_binary: None,
            output: None,
            replace_existing_output: false,
        }
    }

    /// Output directory the run will stage into.
    pub fn output_directory(&self) -> PathBuf {
        match &self.output {
            Some(output) => output.clone(),
            None => self.root.join(OUTPUT_RELATIVE),
        }
    }
}

/// Result of a successful packaging run.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct PackageReport {
    /// Number of packages staged, including the gateway package itself.
    pub packages: usize,
    /// Target platform string (`darwin`/`win32`/`linux`).
    pub platform: String,
    /// Target architecture string.
    pub arch: String,
    /// Embedded runtime version (`process.versions.node` counterpart).
    pub runtime_version: String,
    /// Absolute path of the copied runtime binary.
    pub runtime_path: PathBuf,
    /// Absolute path of the staged tree.
    pub output: PathBuf,
    /// Absolute path of the written manifest.
    pub manifest_path: PathBuf,
}

impl PackageReport {
    /// The reference's completion line.
    pub fn summary(&self) -> String {
        format!(
            "Packaged {} production packages and Node {} for {}-{}",
            self.packages, self.runtime_version, self.platform, self.arch
        )
    }
}

/// Body of `manifest.json`, written in the reference's key order.
#[derive(Debug, Serialize)]
struct ManifestBody<'a> {
    platform: &'a str,
    arch: &'a str,
    node: &'a str,
    gateway: &'a str,
}

/// Validate the runtime identity the way the reference's opening guard does.
pub fn validate_runtime(identity: &RuntimeIdentity) -> Result<(), PackageError> {
    let supported = identity.release_name == "node"
        && identity
            .major()
            .is_some_and(|major| major >= MIN_RUNTIME_MAJOR);
    if supported {
        Ok(())
    } else {
        Err(PackageError::UnsupportedRuntime {
            release_name: identity.release_name.clone(),
            version: identity.version.clone(),
        })
    }
}

/// Parse `<runtime> --version` output (`v22.4.0`, `v22`), rejecting anything
/// that is not a Node-shaped version.
pub fn parse_runtime_version(stdout: &str) -> Result<String, PackageError> {
    let trimmed = stdout.trim();
    let version = trimmed.strip_prefix('v').unwrap_or(trimmed);
    let numeric = !version.is_empty()
        && version
            .split('.')
            .all(|segment| !segment.is_empty() && segment.chars().all(|c| c.is_ascii_digit()));
    if numeric {
        Ok(version.to_string())
    } else {
        Err(PackageError::InvalidManifest {
            path: PathBuf::from("<runtime>"),
            message: format!("Runtime version {trimmed:?} is not a Node version"),
        })
    }
}

/// Probe the runtime process metadata used by the guard
/// and by `manifest.json`.
#[cfg(not(unix))]
pub fn probe_runtime(binary: &Path) -> Result<RuntimeIdentity, PackageError> {
    // Bound both the child's lifetime and captured output. A pipe reader runs
    // separately so a noisy child cannot block on a full pipe.
    const PROBE_TIMEOUT: Duration = Duration::from_secs(5);
    const MAX_PROBE_BYTES: u64 = 16 * 1024;
    let mut child = Command::new(binary)
        .args([
            "-p",
            "JSON.stringify({release:process.release.name,version:process.versions.node})",
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| PackageError::io(binary, error))?;
    let stdout = child.stdout.take().expect("piped stdout");
    let (sender, receiver) = mpsc::sync_channel(1);
    thread::spawn(move || {
        let mut bytes = Vec::new();
        let result = stdout.take(MAX_PROBE_BYTES + 1).read_to_end(&mut bytes);
        let _ = sender.send(result.map(|_| bytes));
    });
    let deadline = Instant::now() + PROBE_TIMEOUT;
    let status = loop {
        match child
            .try_wait()
            .map_err(|error| PackageError::io(binary, error))?
        {
            Some(status) => break status,
            None if Instant::now() >= deadline => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(PackageError::LimitExceeded {
                    message: "Runtime probe timed out".into(),
                });
            }
            None => thread::sleep(Duration::from_millis(10)),
        }
    };
    if !status.success() {
        return Err(PackageError::InvalidManifest {
            path: binary.to_path_buf(),
            message: format!("Runtime probe exited with {status}"),
        });
    }
    let stdout = receiver
        .recv_timeout(deadline.saturating_duration_since(Instant::now()))
        .map_err(|_| PackageError::LimitExceeded {
            message: "Runtime probe output timed out".into(),
        })?
        .map_err(|error| PackageError::io(binary, error))?;
    if stdout.len() as u64 > MAX_PROBE_BYTES {
        return Err(PackageError::LimitExceeded {
            message: "Runtime probe output too large".into(),
        });
    }
    let metadata: serde_json::Value = serde_json::from_slice(&stdout)
        .map_err(|error| PackageError::manifest(binary, error.to_string()))?;
    let release_name = manifest_string(&metadata, "release")
        .ok_or_else(|| PackageError::manifest(binary, "missing runtime release"))?;
    let version = manifest_string(&metadata, "version")
        .ok_or_else(|| PackageError::manifest(binary, "missing Node version"))?;
    Ok(RuntimeIdentity {
        release_name,
        version: parse_runtime_version(&version)?,
    })
}

#[cfg(unix)]
struct ProbeGuard(std::process::Child, bool, bool);

#[cfg(unix)]
impl Drop for ProbeGuard {
    fn drop(&mut self) {
        // A reaped child no longer reserves its numeric identifiers, whether
        // this guard or another reaper collected it.
        if self.2 {
            return;
        }
        if !self.1 {
            unsafe {
                libc::kill(-(self.0.id() as libc::pid_t), libc::SIGKILL);
            }
        }
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}

#[cfg(target_os = "linux")]
impl ProbeGuard {
    fn signal_group_with(
        &mut self,
        signal: impl FnOnce(libc::pid_t) -> io::Result<()>,
    ) -> io::Result<()> {
        // Consume the group ID before the attempt so Drop cannot retry it.
        self.1 = true;
        signal(self.0.id() as libc::pid_t)
    }

    fn signal_group(&mut self) -> io::Result<()> {
        self.signal_group_with(|id| {
            if unsafe { libc::kill(-id, libc::SIGKILL) } == 0 {
                Ok(())
            } else {
                Err(io::Error::last_os_error())
            }
        })
    }

    fn observe_exit(&mut self) -> io::Result<bool> {
        let mut info: libc::siginfo_t = unsafe { std::mem::zeroed() };
        let result = unsafe {
            libc::waitid(
                libc::P_PID,
                self.0.id() as libc::id_t,
                &mut info,
                libc::WEXITED | libc::WNOHANG | libc::WNOWAIT,
            )
        };
        if result < 0 {
            let error = io::Error::last_os_error();
            return probe_observation_error(error, &mut self.2);
        }
        Ok(unsafe { info.si_pid() } != 0)
    }
}

#[cfg(target_os = "linux")]
fn probe_observation_error(error: io::Error, ownership_lost: &mut bool) -> io::Result<bool> {
    if error.kind() == io::ErrorKind::Interrupted {
        // Let the outer loop check its deadline before trying again.
        return Ok(false);
    }
    if error.raw_os_error() == Some(libc::ECHILD) {
        *ownership_lost = true;
    }
    Err(error)
}

// A competing reaper may also claim the child between observation and wait.
#[cfg(unix)]
fn probe_wait_result<T>(result: io::Result<T>, ownership_lost: &mut bool) -> io::Result<T> {
    if matches!(&result, Err(error) if error.raw_os_error() == Some(libc::ECHILD)) {
        *ownership_lost = true;
    }
    result
}

// Yield to the probe loop after an interrupt so it can enforce its deadline.
#[cfg(unix)]
fn read_probe_chunk(reader: &mut impl Read, buffer: &mut [u8]) -> io::Result<usize> {
    match reader.read(buffer) {
        Err(error) if error.kind() == io::ErrorKind::Interrupted => {
            Err(io::ErrorKind::WouldBlock.into())
        }
        result => result,
    }
}

/// Probe with a nonblocking pipe and a dedicated process group on Unix.
/// Linux cleans the group when the leader exits; other Unix systems clean it
/// only while the leader remains unreaped. Escaped descendants can survive,
/// and failed cleanup can still delay this function beyond its deadline.
#[cfg(unix)]
pub fn probe_runtime(binary: &Path) -> Result<RuntimeIdentity, PackageError> {
    use std::os::{fd::AsRawFd, unix::process::CommandExt};

    const TIMEOUT: Duration = Duration::from_secs(5);
    const MAX_BYTES: usize = 16 * 1024;
    let child = Command::new(binary)
        .args([
            "-p",
            "JSON.stringify({release:process.release.name,version:process.versions.node})",
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .process_group(0)
        .spawn()
        .map_err(|error| PackageError::io(binary, error))?;

    let mut child = ProbeGuard(child, false, false);
    let mut stdout = child.0.stdout.take().expect("piped stdout");
    let fd = stdout.as_raw_fd();
    let flags = unsafe { libc::fcntl(fd, libc::F_GETFL) };
    if flags < 0 || unsafe { libc::fcntl(fd, libc::F_SETFL, flags | libc::O_NONBLOCK) } < 0 {
        return Err(PackageError::io(binary, io::Error::last_os_error()));
    }
    let deadline = Instant::now() + TIMEOUT;
    let mut bytes = Vec::new();
    let mut status = None;
    let mut eof = false;
    loop {
        let mut buffer = [0; 4096];
        loop {
            match read_probe_chunk(&mut stdout, &mut buffer) {
                Ok(0) => {
                    eof = true;
                    break;
                }
                Ok(n) => {
                    if bytes.len() + n > MAX_BYTES {
                        return Err(PackageError::LimitExceeded {
                            message: "Runtime probe output too large".into(),
                        });
                    }
                    bytes.extend_from_slice(&buffer[..n]);
                }
                Err(error) if error.kind() == io::ErrorKind::WouldBlock => break,
                Err(error) => return Err(PackageError::io(binary, error)),
            }
            if Instant::now() >= deadline {
                break;
            }
        }
        if status.is_none() {
            #[cfg(target_os = "linux")]
            {
                // Observe without reaping. This only protects the group ID if
                // no other thread or process-wide handler reaps the child.
                if child
                    .observe_exit()
                    .map_err(|error| PackageError::io(binary, error))?
                {
                    child
                        .signal_group()
                        .map_err(|error| PackageError::io(binary, error))?;
                    let exit = probe_wait_result(child.0.wait(), &mut child.2)
                        .map_err(|error| PackageError::io(binary, error))?;
                    // Reaping relinquishes ownership of the numeric child ID.
                    child.2 = true;
                    status = Some(exit);
                }
            }
            #[cfg(not(target_os = "linux"))]
            {
                status = probe_wait_result(child.0.try_wait(), &mut child.2)
                    .map_err(|error| PackageError::io(binary, error))?;
                if status.is_some() {
                    // The leader has been reaped; do not signal a potentially
                    // recycled group ID. The pipe deadline remains enforced.
                    child.1 = true;
                    child.2 = true;
                }
            }
        }
        if let Some(exit) = status {
            if !exit.success() {
                return Err(PackageError::InvalidManifest {
                    path: binary.to_path_buf(),
                    message: format!("Runtime probe exited with {exit}"),
                });
            }
            if eof {
                break;
            }
        }
        if Instant::now() >= deadline {
            return Err(PackageError::LimitExceeded {
                message: "Runtime probe timed out".into(),
            });
        }
        thread::sleep(Duration::from_millis(10));
    }
    let metadata: serde_json::Value = serde_json::from_slice(&bytes)
        .map_err(|error| PackageError::manifest(binary, error.to_string()))?;
    let release_name = manifest_string(&metadata, "release")
        .ok_or_else(|| PackageError::manifest(binary, "missing runtime release"))?;
    let version = manifest_string(&metadata, "version")
        .ok_or_else(|| PackageError::manifest(binary, "missing Node version"))?;
    Ok(RuntimeIdentity {
        release_name,
        version: parse_runtime_version(&version)?,
    })
}

/// Stage the production dependency graph of `packages/gateway` plus the runtime
/// binary into the desktop bundle output directory.
pub fn package_desktop(options: &PackageOptions) -> Result<PackageReport, PackageError> {
    let root_path =
        fs::canonicalize(&options.root).map_err(|error| PackageError::io(&options.root, error))?;
    let root = root_path.as_path();
    let runtime_binary = options
        .runtime_binary
        .as_deref()
        .ok_or(PackageError::MissingRuntime)?;
    let identity = probe_runtime(runtime_binary)?;
    validate_runtime(&identity)?;

    let platform = PackagePlatform::current().ok_or_else(|| PackageError::InvalidManifest {
        path: root.to_path_buf(),
        message: format!("Unsupported host platform {}", std::env::consts::OS),
    })?;
    let output = options.output_directory();
    prepare_output(&output, options.replace_existing_output)?;

    let runtime_path = output
        .join(RUNTIME_DIRECTORY)
        .join(platform.runtime_file_name());
    if let Some(parent) = runtime_path.parent() {
        fs::create_dir_all(parent).map_err(|error| PackageError::io(parent, error))?;
    }
    fs::copy(runtime_binary, &runtime_path)
        .map_err(|error| PackageError::io(runtime_binary, error))?;
    set_runtime_mode(&runtime_path)?;

    let gateway_package = root.join(GATEWAY_PACKAGE_RELATIVE);
    let gateway_manifest = read_manifest(&gateway_package.join("package.json"))?;
    let gateway_version = manifest_string(&gateway_manifest, "version").ok_or_else(|| {
        PackageError::manifest(gateway_package.join("package.json"), "missing version")
    })?;

    let mut installer = Installer::new(root, output.join(NODE_MODULES));
    installer.install(&gateway_package, &installer_root_modules(&output), None, 0)?;

    let manifest_path = output.join("manifest.json");
    let body = ManifestBody {
        platform: platform.as_str(),
        arch: node_arch(),
        node: &identity.version,
        gateway: &gateway_version,
    };
    let body =
        serde_json::to_string_pretty(&body).map_err(|error| PackageError::InvalidManifest {
            path: manifest_path.clone(),
            message: error.to_string(),
        })?;
    fs::write(&manifest_path, body).map_err(|error| PackageError::io(&manifest_path, error))?;

    Ok(PackageReport {
        packages: installer.count,
        platform: platform.as_str().to_string(),
        arch: node_arch().to_string(),
        runtime_version: identity.version,
        runtime_path,
        output,
        manifest_path,
    })
}

fn node_arch() -> &'static str {
    match std::env::consts::ARCH {
        "x86_64" => "x64",
        "x86" => "ia32",
        "aarch64" => "arm64",
        other => other,
    }
}

fn installer_root_modules(output: &Path) -> PathBuf {
    output.join(NODE_MODULES)
}

fn set_runtime_mode(path: &Path) -> Result<(), PackageError> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let permissions = fs::Permissions::from_mode(RUNTIME_MODE);
        fs::set_permissions(path, permissions).map_err(|error| PackageError::io(path, error))?;
    }
    #[cfg(not(unix))]
    {
        let _ = path;
    }
    Ok(())
}

fn prepare_output(output: &Path, replace: bool) -> Result<(), PackageError> {
    match fs::read_dir(output) {
        Ok(mut entries) => {
            if entries.next().is_some() {
                if !replace {
                    return Err(PackageError::OutputNotEmpty {
                        path: output.to_path_buf(),
                    });
                }
                fs::remove_dir_all(output).map_err(|error| PackageError::io(output, error))?;
                fs::create_dir_all(output).map_err(|error| PackageError::io(output, error))?;
            }
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            fs::create_dir_all(output).map_err(|error| PackageError::io(output, error))?;
        }
        Err(error) => return Err(PackageError::io(output, error)),
    }
    Ok(())
}

fn read_manifest(path: &Path) -> Result<serde_json::Value, PackageError> {
    let raw = fs::read_to_string(path).map_err(|error| PackageError::io(path, error))?;
    let value: serde_json::Value = serde_json::from_str(&raw)
        .map_err(|error| PackageError::manifest(path, error.to_string()))?;
    if !value.is_object() {
        return Err(PackageError::manifest(path, "manifest is not an object"));
    }
    Ok(value)
}

fn manifest_string(manifest: &serde_json::Value, key: &str) -> Option<String> {
    manifest
        .get(key)
        .and_then(|value| value.as_str())
        .map(str::to_string)
}

fn manifest_object<'a>(
    manifest: &'a serde_json::Value,
    key: &str,
) -> Option<&'a serde_json::Map<String, serde_json::Value>> {
    manifest.get(key).and_then(|value| value.as_object())
}

/// Dependency names in the reference's spread order: peer, then dependencies,
/// then optional dependencies, each keeping its first appearance position.
fn dependency_names(manifest: &serde_json::Value) -> Vec<String> {
    let mut names: Vec<String> = Vec::new();
    for key in ["peerDependencies", "dependencies", "optionalDependencies"] {
        if let Some(object) = manifest_object(manifest, key) {
            for name in object.keys() {
                if !names.iter().any(|existing| existing == name) {
                    names.push(name.clone());
                }
            }
        }
    }
    names
}

fn is_optional_dependency(manifest: &serde_json::Value, name: &str) -> bool {
    let optional = manifest_object(manifest, "optionalDependencies")
        .is_some_and(|object| object.contains_key(name));
    let peer_optional = manifest_object(manifest, "peerDependenciesMeta")
        .and_then(|object| object.get(name))
        .and_then(|meta| meta.get("optional"))
        .and_then(serde_json::Value::as_bool)
        .unwrap_or(false);
    optional || peer_optional
}

/// Entries copied for a workspace package: `package.json` plus its `files`
/// allowlist (defaulting to `dist`).
fn workspace_entries(manifest: &serde_json::Value) -> Vec<String> {
    let mut entries = vec!["package.json".to_string()];
    match manifest.get("files").and_then(|value| value.as_array()) {
        Some(files) => {
            for entry in files {
                if let Some(name) = entry.as_str() {
                    entries.push(name.to_string());
                }
            }
        }
        None => entries.push(DEFAULT_WORKSPACE_ENTRY.to_string()),
    }
    entries
}

fn safe_relative_path(value: &str) -> bool {
    use std::path::Component;
    !value.is_empty()
        && !value.contains('\\')
        && Path::new(value)
            .components()
            .all(|part| matches!(part, Component::Normal(_)))
}

fn valid_package_name(name: &str) -> bool {
    let parts: Vec<_> = name.split('/').collect();
    let component =
        |s: &str| !s.is_empty() && s != "." && s != ".." && !s.contains('\\') && !s.contains(':');
    match parts.as_slice() {
        [single] => component(single) && !single.starts_with('@'),
        [scope, package] => {
            scope.starts_with('@') && scope.len() > 1 && component(scope) && component(package)
        }
        _ => false,
    }
}

/// Node-style dependency lookup: walk from `from` upwards looking for
/// `<base>/node_modules/<name>/package.json`, returning the real path.
fn dependency_path(from: &Path, name: &str) -> Option<PathBuf> {
    let mut base = Some(from);
    while let Some(current) = base {
        let candidate = current.join(NODE_MODULES).join(name);
        if candidate.join("package.json").exists() {
            return fs::canonicalize(&candidate).ok();
        }
        base = current.parent();
    }
    None
}

fn copy_entry(source: &Path, destination: &Path, boundary: &Path) -> Result<(), PackageError> {
    fn copy(
        source: &Path,
        destination: &Path,
        boundary: &Path,
        ancestors: &mut Vec<PathBuf>,
    ) -> Result<(), PackageError> {
        let resolved = fs::canonicalize(source).map_err(|error| PackageError::io(source, error))?;
        if !resolved.starts_with(boundary) {
            return Err(PackageError::manifest(
                source,
                "copy source escapes package boundary",
            ));
        }
        let metadata = fs::metadata(&resolved).map_err(|error| PackageError::io(source, error))?;
        if metadata.is_dir() {
            if ancestors.len() >= MAX_DEPTH || ancestors.contains(&resolved) {
                return Err(PackageError::LimitExceeded {
                    message: format!(
                        "Copy directory cycle or depth limit at {}",
                        source.display()
                    ),
                });
            }
            ancestors.push(resolved);
            fs::create_dir_all(destination)
                .map_err(|error| PackageError::io(destination, error))?;
            let mut children: Vec<PathBuf> = fs::read_dir(source)
                .map_err(|error| PackageError::io(source, error))?
                .map(|entry| entry.map(|entry| entry.path()))
                .collect::<Result<_, _>>()
                .map_err(|error| PackageError::io(source, error))?;
            children.sort();
            for child in children {
                let name = child
                    .file_name()
                    .ok_or_else(|| PackageError::manifest(source, "entry without a file name"))?;
                copy(&child, &destination.join(name), boundary, ancestors)?;
            }
            ancestors.pop();
        } else if metadata.is_file() {
            if let Some(parent) = destination.parent() {
                fs::create_dir_all(parent).map_err(|error| PackageError::io(parent, error))?;
            }
            fs::copy(source, destination).map_err(|error| PackageError::io(source, error))?;
        } else {
            return Err(PackageError::manifest(
                source,
                "unsupported copy source type",
            ));
        }
        Ok(())
    }
    copy(source, destination, boundary, &mut Vec::new())
}

/// Dependency graph walker mirroring the reference's `install` closure.
struct Installer {
    packages_root: PathBuf,
    root_modules: PathBuf,
    hoisted: HashMap<String, PathBuf>,
    count: usize,
}

impl Installer {
    fn new(root: &Path, root_modules: PathBuf) -> Self {
        Self {
            packages_root: root.join(PACKAGES_RELATIVE),
            root_modules,
            hoisted: HashMap::new(),
            count: 0,
        }
    }

    fn install(
        &mut self,
        source: &Path,
        parent_modules: &Path,
        ancestors: Option<&HashMap<String, PathBuf>>,
        depth: usize,
    ) -> Result<(), PackageError> {
        if depth > MAX_DEPTH {
            return Err(PackageError::LimitExceeded {
                message: format!("Dependency graph deeper than {MAX_DEPTH} levels"),
            });
        }
        if self.count >= MAX_PACKAGES {
            return Err(PackageError::LimitExceeded {
                message: format!("Dependency graph holds more than {MAX_PACKAGES} packages"),
            });
        }
        let src = fs::canonicalize(source).map_err(|error| PackageError::io(source, error))?;
        let manifest_path = src.join("package.json");
        let manifest = read_manifest(&manifest_path)?;
        let name = manifest_string(&manifest, "name")
            .ok_or_else(|| PackageError::manifest(&manifest_path, "missing name"))?;

        let empty = HashMap::new();
        let chain = ancestors.unwrap_or(&empty);
        if chain.get(&name) == Some(&src) {
            return Ok(());
        }
        if !chain.contains_key(&name) && self.hoisted.get(&name) == Some(&src) {
            return Ok(());
        }

        let hoist_here = !self.hoisted.contains_key(&name);
        let modules = if hoist_here {
            self.root_modules.clone()
        } else {
            parent_modules.to_path_buf()
        };
        if !valid_package_name(&name) {
            return Err(PackageError::manifest(
                &manifest_path,
                "invalid package name",
            ));
        }
        let dest = modules.join(&name);
        if hoist_here && modules == self.root_modules {
            self.hoisted.insert(name.clone(), src.clone());
        }
        fs::create_dir_all(&dest).map_err(|error| PackageError::io(&dest, error))?;

        let workspace = src.starts_with(&self.packages_root);
        if workspace {
            for entry in workspace_entries(&manifest) {
                if !safe_relative_path(&entry) {
                    return Err(PackageError::manifest(
                        &manifest_path,
                        "invalid workspace file path",
                    ));
                }
                let from = src.join(&entry);
                if from.exists() {
                    copy_entry(&from, &dest.join(&entry), &src)?;
                }
            }
            if !dest.join("dist/index.js").exists() {
                return Err(PackageError::MissingBuild { package: name });
            }
        } else {
            let mut entries: Vec<PathBuf> = fs::read_dir(&src)
                .map_err(|error| PackageError::io(&src, error))?
                .map(|entry| entry.map(|entry| entry.path()))
                .collect::<Result<_, _>>()
                .map_err(|error| PackageError::io(&src, error))?;
            entries.sort();
            for entry in entries {
                let file_name = entry
                    .file_name()
                    .map(|name| name.to_string_lossy().into_owned())
                    .unwrap_or_default();
                if EXCLUDED_PACKAGE_ENTRIES.contains(&file_name.as_str()) || !entry.exists() {
                    continue;
                }
                let dest_entry = dest.join(&file_name);
                copy_entry(&entry, &dest_entry, &src)?;
            }
        }

        let mut next_chain = chain.clone();
        next_chain.insert(name.clone(), src.clone());
        let nested_modules = dest.join(NODE_MODULES);
        for dependency in dependency_names(&manifest) {
            if !valid_package_name(&dependency) {
                return Err(PackageError::manifest(
                    &manifest_path,
                    "invalid dependency name",
                ));
            }
            match dependency_path(&src, &dependency) {
                Some(resolved) => {
                    self.install(&resolved, &nested_modules, Some(&next_chain), depth + 1)?;
                }
                None => {
                    if is_optional_dependency(&manifest, &dependency) {
                        continue;
                    }
                    return Err(PackageError::MissingDependency {
                        package: name,
                        dependency,
                    });
                }
            }
        }

        self.count += 1;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    #[cfg(target_os = "linux")]
    #[test]
    fn interrupted_probe_observation_yields_without_losing_ownership() {
        let mut lost = false;
        assert!(
            !super::probe_observation_error(
                std::io::Error::from_raw_os_error(libc::EINTR),
                &mut lost,
            )
            .unwrap()
        );
        assert!(!lost);
        let error = super::probe_observation_error(
            std::io::Error::from_raw_os_error(libc::ECHILD),
            &mut lost,
        )
        .unwrap_err();
        assert_eq!(error.raw_os_error(), Some(libc::ECHILD));
        assert!(lost);
    }
    #[cfg(unix)]
    #[test]
    fn interrupted_probe_read_yields_and_can_resume() {
        struct InterruptedOnce(bool);
        impl std::io::Read for InterruptedOnce {
            fn read(&mut self, buffer: &mut [u8]) -> std::io::Result<usize> {
                if !self.0 {
                    self.0 = true;
                    return Err(std::io::ErrorKind::Interrupted.into());
                }
                buffer[0] = b'x';
                Ok(1)
            }
        }
        let mut reader = InterruptedOnce(false);
        let mut buffer = [0; 1];
        assert_eq!(
            super::read_probe_chunk(&mut reader, &mut buffer)
                .unwrap_err()
                .kind(),
            std::io::ErrorKind::WouldBlock
        );
        assert_eq!(
            super::read_probe_chunk(&mut reader, &mut buffer).unwrap(),
            1
        );
        assert_eq!(buffer, *b"x");
    }
    #[cfg(target_os = "linux")]
    #[test]
    fn probe_group_signal_error_is_returned_and_not_retried() {
        let child = std::process::Command::new("/bin/sleep")
            .arg("30")
            .spawn()
            .unwrap();
        let mut guard = super::ProbeGuard(child, false, false);
        let error = guard
            .signal_group_with(|_| Err(std::io::Error::from_raw_os_error(libc::EPERM)))
            .unwrap_err();
        assert_eq!(error.raw_os_error(), Some(libc::EPERM));
        assert!(guard.1, "failed signal must not be retried by Drop");
    }

    #[cfg(unix)]
    #[test]
    fn probe_wait_echild_disarms_stale_identifiers() {
        let child = std::process::Command::new("/bin/true").spawn().unwrap();
        let pid = child.id() as libc::pid_t;
        let mut guard = super::ProbeGuard(child, false, false);
        let mut status = 0;
        assert_eq!(unsafe { libc::waitpid(pid, &mut status, 0) }, pid);
        let error = super::probe_wait_result(guard.0.wait(), &mut guard.2).unwrap_err();
        assert_eq!(error.raw_os_error(), Some(libc::ECHILD));
        assert!(guard.2, "failed wait must disarm saved identifiers");
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn externally_reaped_probe_disarms_stale_identifiers() {
        let child = std::process::Command::new("/bin/true").spawn().unwrap();
        let pid = child.id() as libc::pid_t;
        let mut guard = super::ProbeGuard(child, false, false);
        let mut status = 0;
        assert_eq!(unsafe { libc::waitpid(pid, &mut status, 0) }, pid);
        let error = guard.observe_exit().unwrap_err();
        assert_eq!(error.raw_os_error(), Some(libc::ECHILD));
        assert!(guard.2, "lost ownership must disarm cleanup signals");
    }
    use super::*;

    #[cfg(target_os = "linux")]
    #[test]
    fn packaging_probe_cleans_descendant_holding_stdout() {
        use std::os::unix::fs::PermissionsExt;
        let base = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join(".jait/artifacts/packaging-probe-descendant-focused");
        fs::create_dir_all(&base).unwrap();
        let marker = base.join("survived");
        let _ = fs::remove_file(&marker);
        let binary = base.join("runtime");
        fs::write(&binary, format!("#!/bin/sh\n(sleep 1; touch '{}') &\nprintf '%s' '{{\"release\":\"node\",\"version\":\"22.0.0\"}}'\n", marker.display())).unwrap();
        fs::set_permissions(&binary, fs::Permissions::from_mode(0o755)).unwrap();
        let start = Instant::now();
        assert_eq!(probe_runtime(&binary).unwrap().version, "22.0.0");
        assert!(start.elapsed() < Duration::from_secs(4));
        thread::sleep(Duration::from_millis(1300));
        assert!(!marker.exists(), "descendant survived probe cleanup");
        fs::remove_dir_all(base).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn packaging_runtime_probe_stops_hung_process() {
        use std::os::unix::fs::PermissionsExt;
        let base =
            Path::new(env!("CARGO_MANIFEST_DIR")).join(".jait/artifacts/packaging-probe-timeout");
        fs::create_dir_all(&base).unwrap();
        let binary = base.join("runtime");
        fs::write(&binary, "#!/bin/sh\nexec sleep 30\n").unwrap();
        fs::set_permissions(&binary, fs::Permissions::from_mode(0o755)).unwrap();
        let start = Instant::now();
        assert!(matches!(
            probe_runtime(&binary),
            Err(PackageError::LimitExceeded { .. })
        ));
        assert!(start.elapsed() < Duration::from_secs(10));
        fs::remove_dir_all(base).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn packaging_copy_rejects_symlink_cycles_and_escapes() {
        use std::os::unix::fs::symlink;
        let base =
            Path::new(env!("CARGO_MANIFEST_DIR")).join(".jait/artifacts/packaging-copy-boundaries");
        let _ = fs::remove_dir_all(&base);
        let source = base.join("source");
        fs::create_dir_all(source.join("dir")).unwrap();
        fs::write(source.join("dir/file"), "ok").unwrap();
        fs::write(base.join("secret"), "secret").unwrap();
        let boundary = fs::canonicalize(&source).unwrap();
        symlink("..", source.join("dir/cycle")).unwrap();
        assert!(copy_entry(&source.join("dir"), &base.join("out"), &boundary).is_err());
        fs::remove_file(source.join("dir/cycle")).unwrap();
        symlink("../../secret", source.join("dir/escape")).unwrap();
        assert!(copy_entry(&source.join("dir"), &base.join("out2"), &boundary).is_err());
        fs::remove_file(source.join("dir/escape")).unwrap();
        symlink("file", source.join("dir/alias")).unwrap();
        copy_entry(&source.join("dir"), &base.join("out3"), &boundary).unwrap();
        assert_eq!(fs::read_to_string(base.join("out3/alias")).unwrap(), "ok");
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn rejects_manifest_path_escapes() {
        for name in [
            "../escape",
            "/absolute",
            "@scope/../../escape",
            "a\\b",
            "C:escape",
        ] {
            assert!(!valid_package_name(name), "{name}");
        }
        assert!(valid_package_name("@jait/gateway"));
        assert!(valid_package_name("fastify"));
        for path in ["../outside", "/absolute", "a/../outside", "a\\b"] {
            assert!(!safe_relative_path(path), "{path}");
        }
        assert!(safe_relative_path("dist/index.js"));
    }

    #[test]
    fn runtime_guard_requires_node_22() {
        let ok = RuntimeIdentity {
            release_name: "node".into(),
            version: "22.0.0".into(),
        };
        assert!(validate_runtime(&ok).is_ok());
        let old = RuntimeIdentity {
            release_name: "node".into(),
            version: "21.9.0".into(),
        };
        assert_eq!(
            validate_runtime(&old).unwrap_err().to_string(),
            UNSUPPORTED_RUNTIME_MESSAGE
        );
        let other = RuntimeIdentity {
            release_name: "bun".into(),
            version: "22.1.0".into(),
        };
        assert_eq!(
            validate_runtime(&other).unwrap_err().to_string(),
            UNSUPPORTED_RUNTIME_MESSAGE
        );
    }

    #[test]
    fn version_parsing_strips_v_prefix() {
        assert_eq!(parse_runtime_version("v22.4.1\n").unwrap(), "22.4.1");
        assert_eq!(parse_runtime_version("22\n").unwrap(), "22");
        assert!(parse_runtime_version("bun 1.2").is_err());
    }

    #[test]
    fn workspace_entries_default_to_dist() {
        let manifest = serde_json::json!({ "name": "@jait/x" });
        assert_eq!(workspace_entries(&manifest), vec!["package.json", "dist"]);
        let listed = serde_json::json!({ "files": ["dist", "README.md"] });
        assert_eq!(
            workspace_entries(&listed),
            vec!["package.json", "dist", "README.md"]
        );
    }

    #[test]
    fn dependency_names_follow_spread_order() {
        let manifest = serde_json::json!({
            "peerDependencies": { "peer": "1" },
            "dependencies": { "direct": "1", "peer": "2" },
            "optionalDependencies": { "optional": "1", "direct": "3" },
        });
        assert_eq!(
            dependency_names(&manifest),
            vec!["peer", "direct", "optional"]
        );
    }

    #[test]
    fn optional_peer_metadata_is_honoured() {
        let manifest = serde_json::json!({
            "optionalDependencies": { "native": "1" },
            "peerDependencies": { "opt": "1", "required": "1" },
            "peerDependenciesMeta": { "opt": { "optional": true } },
        });
        assert!(is_optional_dependency(&manifest, "native"));
        assert!(is_optional_dependency(&manifest, "opt"));
        assert!(!is_optional_dependency(&manifest, "required"));
    }

    #[test]
    fn runtime_file_name_follows_platform() {
        assert_eq!(PackagePlatform::Win32.runtime_file_name(), "node.exe");
        assert_eq!(PackagePlatform::Linux.runtime_file_name(), "node");
        assert_eq!(PackagePlatform::Darwin.as_str(), "darwin");
        assert!(PackagePlatform::parse("freebsd").is_none());
    }
}
