//! Typed boundaries for the staged JavaScript gateway updater.
//! A host must own staging, cancellation and the independent activation controller.
//! Constructing these values does not authorize or launch an update.
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdatePlan {
    pub live: PathBuf,
    pub lock: PathBuf,
    pub stage: PathBuf,
    pub candidate: PathBuf,
    pub new_version: String,
    pub previous_version: String,
    pub backup: PathBuf,
}

/// Same npm tag/version grammar as prepareUpdate; rejects flags and shell syntax.
pub fn valid_version(version: &str) -> bool {
    let Ok(pattern) = regex::Regex::new(
        r"^(?:[A-Za-z][0-9A-Za-z._-]*|[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?)$",
    ) else {
        return false;
    };
    pattern.is_match(version)
}

/// The web route falls back to latest for characters outside its allowlist.
/// prepareUpdate then applies the stricter version grammar.
pub fn web_version(value: Option<&str>) -> &str {
    let value = value.unwrap_or("latest");
    if !value.is_empty()
        && value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"._-".contains(&b))
    {
        value
    } else {
        "latest"
    }
}

/// Structured argv only; callers must not join these arguments into a shell command.
pub fn npm_install_args(stage: &Path, version: &str) -> Result<Vec<std::ffi::OsString>, String> {
    if !valid_version(version) {
        return Err(format!("Invalid gateway version or npm tag: {version}"));
    }
    Ok(vec![
        "install".into(),
        "--global".into(),
        "--prefix".into(),
        stage.as_os_str().into(),
        format!("@jait/gateway@{version}").into(),
        "--no-audit".into(),
        "--no-fund".into(),
        "--ignore-scripts".into(),
    ])
}

/// Reject paths or malformed names in dependency manifests before joining them.
pub fn valid_dependency_name(name: &str) -> bool {
    fn part(s: &str) -> bool {
        !s.is_empty()
            && s != "."
            && s != ".."
            && s.bytes()
                .all(|b| b.is_ascii_alphanumeric() || b"-._~".contains(&b))
    }
    if let Some(rest) = name.strip_prefix('@') {
        rest.split_once('/')
            .is_some_and(|(scope, package)| part(scope) && part(package))
    } else {
        part(name)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn update_arguments_reject_injection() {
        for version in ["-x", "1.2.3;id", "../x", "1.2", ""] {
            assert!(!valid_version(version));
        }
        assert!(valid_version("1.2.3-beta.1"));
        assert!(valid_version("latest"));
        assert_eq!(web_version(Some("1;id")), "latest");
        let args = npm_install_args(Path::new("/stage name"), "latest").unwrap();
        assert!(args.iter().any(|arg| arg == "--ignore-scripts"));
        assert_eq!(args[3], std::ffi::OsStr::new("/stage name"));
        assert!(valid_dependency_name("@jait/shared"));
        assert!(!valid_dependency_name("@jait/../../secret"));
    }
}

/// Inspect the staged package and its installed dependency manifests. The host
/// must also execute Node's syntax, CLI version, and module graph checks before
/// considering the candidate validated, as in the JavaScript updater.
pub fn inspect_staged_package(root: &Path) -> Result<String, String> {
    fn read_json(path: &Path) -> Result<serde_json::Value, String> {
        use std::io::Read;
        let file = std::fs::File::open(path).map_err(|e| format!("{}: {e}", path.display()))?;
        let mut bytes = Vec::new();
        file.take(2 * 1024 * 1024 + 1)
            .read_to_end(&mut bytes)
            .map_err(|e| e.to_string())?;
        if bytes.len() > 2 * 1024 * 1024 {
            return Err("Staged manifest too large".into());
        }
        serde_json::from_slice(&bytes).map_err(|e| format!("{}: {e}", path.display()))
    }
    let manifest = read_json(&root.join("package.json"))?;
    let version = manifest
        .get("version")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let version_prefix = regex::Regex::new(r"^[0-9]+\.[0-9]+\.[0-9]+").expect("constant regex");
    if manifest.get("name").and_then(|v| v.as_str()) != Some("@jait/gateway")
        || !version_prefix.is_match(version)
    {
        return Err("Invalid staged gateway package".into());
    }
    for entry in ["bin/jait.mjs", "dist/index.js", "web-dist/index.html"] {
        std::fs::metadata(root.join(entry)).map_err(|e| format!("{entry}: {e}"))?;
    }
    if let Some(dependencies) = manifest.get("dependencies").and_then(|v| v.as_object()) {
        for dependency in dependencies.keys() {
            if !valid_dependency_name(dependency) {
                return Err(format!("Invalid installed dependency: {dependency}"));
            }
            let installed = read_json(
                &root
                    .join("node_modules")
                    .join(dependency)
                    .join("package.json"),
            )?;
            if installed.get("name").and_then(|v| v.as_str()) != Some(dependency) {
                return Err(format!("Invalid installed dependency: {dependency}"));
            }
        }
    }
    Ok(version.to_owned())
}

/// Capabilities asserted by a trusted host implementation, not inferred from a
/// process group. All are required before any package or candidate is executed.
#[derive(Clone, Copy, Debug, Default)]
pub struct SandboxCapabilities {
    pub filesystem_isolation: bool,
    pub network_and_resource_limits: bool,
    pub descendant_containment: bool,
    pub durable_cleanup: bool,
}

impl SandboxCapabilities {
    fn sufficient(self) -> bool {
        self.filesystem_isolation
            && self.network_and_resource_limits
            && self.descendant_containment
            && self.durable_cleanup
    }
}

/// An owned lease managed by the host. Dropping the lease must request cleanup;
/// the supervisor must retain durable ownership until cleanup has succeeded or
/// a failure has been recorded for retry. The path is not an activation authority.
pub trait StagedCandidateLease: Send + Sync {
    fn root(&self) -> &Path;
    fn version(&self) -> &str;
    /// Request deletion and report its outcome; failures remain tracked for retry.
    fn cleanup(
        self: Box<Self>,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<(), String>> + Send>>;
}

pub struct StagedCandidate {
    lease: Box<dyn StagedCandidateLease>,
}
impl StagedCandidate {
    pub fn root(&self) -> &Path {
        self.lease.root()
    }
    pub fn version(&self) -> &str {
        self.lease.version()
    }
    pub async fn cleanup(self) -> Result<(), String> {
        self.lease.cleanup().await
    }
}

#[derive(Clone, Debug)]
pub struct StagingRequest {
    pub parent: PathBuf,
    pub version: String,
    pub npm: PathBuf,
    pub node: PathBuf,
}

/// Trusted, independently supervised implementation supplied by the host.
///
/// `stage` must own an isolated private stage, enforce bounded installation and
/// all three Node checks (syntax, CLI version, module graph), and inspect the
/// package. It must disable lifecycle scripts, contain all descendants even if
/// they create sessions, and enforce filesystem, network, time and resource
/// limits. Cancellation, timeout, error, abandoned result, host restart and
/// lease drop must lead to supervised termination and durable cleanup/retry.
/// An error must never transfer a candidate. The implementation must not rely
/// on the caller's task or runtime surviving to complete cleanup. No such host
/// implementation is provided here; process groups alone do not meet this API.
pub type StagingFuture = std::pin::Pin<
    Box<
        dyn std::future::Future<Output = Result<Box<dyn StagedCandidateLease>, String>>
            + Send
            + 'static,
    >,
>;

pub trait SandboxSupervisor: Send + Sync + 'static {
    fn capabilities(&self) -> SandboxCapabilities;
    fn stage(
        &self,
        request: StagingRequest,
        cancel: tokio::sync::oneshot::Receiver<()>,
    ) -> StagingFuture;
}

struct CancelOnDrop(Option<tokio::sync::oneshot::Sender<()>>);
impl Drop for CancelOnDrop {
    fn drop(&mut self) {
        if let Some(cancel) = self.0.take() {
            let _ = cancel.send(());
        }
    }
}

/// Fail closed until a capable, trusted host supervisor is explicitly supplied.
/// This function never performs staging or launches a process by itself.
pub async fn stage_and_validate(
    parent: &Path,
    version: &str,
    npm: &Path,
    node: &Path,
) -> Result<StagedCandidate, String> {
    let _ = (parent, version, npm, node);
    Err("Staging unavailable: capable sandbox supervisor required".into())
}

/// Submit staging to a trusted host. A detached task retains the result on
/// caller cancellation so an abandoned lease is dropped; the supervisor itself
/// remains responsible for cleanup across runtime or process shutdown.
pub async fn stage_with_supervisor(
    supervisor: std::sync::Arc<dyn SandboxSupervisor>,
    request: StagingRequest,
) -> Result<StagedCandidate, String> {
    if !valid_version(&request.version) {
        return Err("Invalid gateway version or npm tag".into());
    }
    if !supervisor.capabilities().sufficient() {
        return Err("Staging unavailable: sandbox supervisor lacks required capabilities".into());
    }
    let (sender, receiver) = tokio::sync::oneshot::channel();
    let mut cancellation = CancelOnDrop(Some(sender));
    let task = tokio::spawn(async move { supervisor.stage(request, receiver).await });
    let result = task
        .await
        .map_err(|e| format!("Staging supervisor failed: {e}"))?;
    cancellation.0.take();
    result.map(|lease| StagedCandidate { lease })
}

// ---------------------------------------------------------------------------
// Native port of `bin/safe-update.mjs` planning: where a staged update lives,
// how its owner record and plan are laid out, and exactly which operations an
// activation performs (and undoes) around the directory swap.
//
// Filesystem effects are performed through `std::fs`/caller-supplied runners so
// that the ordering, the rollback rules and the on-disk records stay testable.
// Nothing here stops, starts or supervises a gateway: the caller owns those.
// ---------------------------------------------------------------------------

/// `prepareUpdate` keeps staging beside the live directory so the renames stay
/// on one filesystem; the pending-update lock is the sibling `<live>.update-lock`.
pub fn update_lock_path(live: &Path) -> PathBuf {
    let mut name = live.as_os_str().to_os_string();
    name.push(".update-lock");
    PathBuf::from(name)
}

pub fn pending_update_message(lock: &Path) -> String {
    format!(
        "An update is already pending. Inspect {} before retrying.",
        lock.display()
    )
}

/// `mkdtemp(join(dirname(live), ".jait-update-"))`: the unique suffix is filled
/// in by [`create_stage_directory`], which mirrors `mkdtemp`'s exclusive create.
pub fn stage_prefix(live: &Path) -> PathBuf {
    live.parent()
        .unwrap_or_else(|| Path::new("."))
        .join(".jait-update-")
}

/// `validatePackage`'s manifest lives at `<stage>/<lib/node_modules|node_modules>/@jait/gateway`.
pub fn candidate_path(stage: &Path, windows: bool) -> PathBuf {
    stage
        .join(if windows {
            "node_modules"
        } else {
            "lib/node_modules"
        })
        .join("@jait/gateway")
}

pub fn npm_executable_name(windows: bool) -> &'static str {
    if windows { "npm.cmd" } else { "npm" }
}

/// `resolve(dirname(modulePath), "..")`: the default live gateway install.
pub fn default_live_directory(module_path: &Path) -> PathBuf {
    module_path
        .parent()
        .and_then(Path::parent)
        .map(Path::to_path_buf)
        .unwrap_or_else(|| PathBuf::from("."))
}

/// `JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() })`.
/// The timestamp is supplied by the caller so this record stays deterministic.
pub fn owner_record(pid: u32, started_at: &str) -> String {
    serde_json::json!({ "pid": pid, "startedAt": started_at }).to_string()
}

/// `new Date(ms).toISOString()` without pulling in a date library: UTC, exactly
/// three fractional digits, same `YYYY-MM-DDTHH:MM:SS.sssZ` shape.
pub fn iso_timestamp(unix_millis: u64) -> String {
    let seconds = unix_millis / 1000;
    let millis = unix_millis % 1000;
    let days = (seconds / 86_400) as i64;
    let second_of_day = seconds % 86_400;
    // Howard Hinnant's civil_from_days: days since 1970-01-01 -> y/m/d.
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = if month <= 2 { y + 1 } else { y };
    format!(
        "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}.{millis:03}Z",
        second_of_day / 3_600,
        (second_of_day % 3_600) / 60,
        second_of_day % 60
    )
}

/// The `plan` object written to `<stage>/plan.json` and handed to the activation
/// controller: candidate, backup and lock paths all derive from live + stage.
pub fn staged_plan(
    live: &Path,
    stage: &Path,
    new_version: String,
    previous_version: String,
) -> UpdatePlan {
    UpdatePlan {
        live: live.to_path_buf(),
        lock: update_lock_path(live),
        stage: stage.to_path_buf(),
        candidate: candidate_path(stage, cfg!(windows)),
        new_version,
        previous_version,
        backup: stage.join("previous"),
    }
}

/// The version currently installed in `live`, as read straight from its manifest.
pub fn live_version(live: &Path) -> Result<String, String> {
    let path = live.join("package.json");
    let bytes = std::fs::read(&path).map_err(|e| format!("{}: {e}", path.display()))?;
    let manifest: serde_json::Value =
        serde_json::from_slice(&bytes).map_err(|e| format!("{}: {e}", path.display()))?;
    manifest
        .get("version")
        .and_then(|v| v.as_str())
        .map(str::to_owned)
        .ok_or_else(|| format!("{}: missing version", path.display()))
}

/// Exclusive `mkdtemp` equivalent: `<parent>/.jait-update-<suffix>`, created with
/// `create_dir` so an existing directory can never be reused as a stage.
pub fn create_stage_directory(live: &Path, suffix: &str) -> Result<PathBuf, String> {
    let mut name = stage_prefix(live).into_os_string();
    name.push(suffix);
    let stage = PathBuf::from(name);
    std::fs::create_dir(&stage).map_err(|e| format!("{}: {e}", stage.display()))?;
    Ok(stage)
}

/// `discardUpdate`: remove the stage, then the lock. Neither is destructive to
/// `live`, and a missing path is not an error.
///
/// Node's `rm(path, { recursive: true, force: true })` also unlinks a plain
/// file, which matters here because the lock may be either a directory or a
/// `*.update-lock` file. `remove_dir_all` on a file fails with `NotADirectory`,
/// so fall back to `remove_file` instead of surfacing a spurious error.
pub fn discard_staged_update(plan: &UpdatePlan) -> Result<(), String> {
    for path in [&plan.stage, &plan.lock] {
        match std::fs::remove_dir_all(path) {
            Ok(()) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(_) => match std::fs::remove_file(path) {
                Ok(()) => {}
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
                Err(e) => return Err(format!("{}: {e}", path.display())),
            },
        }
    }
    Ok(())
}

/// One step of an activation. Each step is an operation the caller performs;
/// ordering and rollback selection are decided here.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ActivationStep {
    Stop,
    MoveLiveToBackup { from: PathBuf, to: PathBuf },
    MoveCandidateToLive { from: PathBuf, to: PathBuf },
    Restart,
    AwaitHealth { version: String, port: u16 },
    WriteResult(String),
    RemoveLock(PathBuf),
}

/// Healthy means: HTTP ok, not explicitly unhealthy, and the expected version.
/// `health.healthy !== false` treats a missing field as healthy.
pub fn health_probe_satisfied(
    status_ok: bool,
    healthy: Option<bool>,
    version: Option<&str>,
    expected: &str,
) -> bool {
    status_ok && healthy != Some(false) && version == Some(expected)
}

pub fn health_timeout_message(port: u16, version: &str) -> String {
    format!("Gateway {version} did not become healthy on port {port}")
}

pub const HEALTH_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(180);
pub const HEALTH_POLL_INTERVAL: std::time::Duration = std::time::Duration::from_secs(1);
pub const HEALTH_PROBE_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(3);

pub fn activation_result_ok(version: &str) -> String {
    serde_json::json!({ "ok": true, "version": version }).to_string()
}

/// `{ ok: false, error: String(error), rolledBack: moved }`
pub fn activation_result_error(error: &str, rolled_back: bool) -> String {
    serde_json::json!({ "ok": false, "error": error, "rolledBack": rolled_back }).to_string()
}

/// Happy path of `activateUpdate`: the working gateway is stopped only after the
/// candidate is staged and validated, then live is swapped for the candidate,
/// the service is restarted and verified, and only then is the lock released.
pub fn activation_sequence(
    plan: &UpdatePlan,
    port: u16,
    stop: bool,
    restart: bool,
) -> Vec<ActivationStep> {
    let mut steps = Vec::with_capacity(8);
    if stop {
        steps.push(ActivationStep::Stop);
    }
    steps.push(ActivationStep::MoveLiveToBackup {
        from: plan.live.clone(),
        to: plan.backup.clone(),
    });
    steps.push(ActivationStep::MoveCandidateToLive {
        from: plan.candidate.clone(),
        to: plan.live.clone(),
    });
    if restart {
        steps.push(ActivationStep::Restart);
        steps.push(ActivationStep::AwaitHealth {
            version: plan.new_version.clone(),
            port,
        });
    }
    steps.push(ActivationStep::WriteResult(activation_result_ok(
        &plan.new_version,
    )));
    // The previous installation is retained in `backup` for manual recovery.
    steps.push(ActivationStep::RemoveLock(plan.lock.clone()));
    steps
}

/// Rollback path of `activateUpdate`'s catch block. A failure before live moved
/// needs no repair; once live moved, the backup is put back and the service is
/// restarted and verified against the previous version. An installed candidate is
/// parked under `<stage>/failed` rather than deleted.
pub fn rollback_sequence(
    plan: &UpdatePlan,
    port: u16,
    stop: bool,
    restart: bool,
    moved: bool,
    installed: bool,
    error: &str,
) -> Vec<ActivationStep> {
    let mut steps = Vec::new();
    if moved {
        if stop {
            steps.push(ActivationStep::Stop);
        }
        if installed {
            steps.push(ActivationStep::MoveLiveToBackup {
                from: plan.live.clone(),
                to: plan.stage.join("failed"),
            });
        }
        steps.push(ActivationStep::MoveCandidateToLive {
            from: plan.backup.clone(),
            to: plan.live.clone(),
        });
        if restart {
            steps.push(ActivationStep::Restart);
            steps.push(ActivationStep::AwaitHealth {
                version: plan.previous_version.clone(),
                port,
            });
        }
    }
    steps.push(ActivationStep::WriteResult(activation_result_error(
        error, moved,
    )));
    steps.push(ActivationStep::RemoveLock(plan.lock.clone()));
    steps
}

#[cfg(test)]
mod sandbox_boundary_focused_tests {
    use super::*;
    use std::sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    };

    struct Incapable(Arc<AtomicBool>);
    impl SandboxSupervisor for Incapable {
        fn capabilities(&self) -> SandboxCapabilities {
            SandboxCapabilities::default()
        }
        fn stage(
            &self,
            _: StagingRequest,
            _: tokio::sync::oneshot::Receiver<()>,
        ) -> std::pin::Pin<
            Box<
                dyn std::future::Future<Output = Result<Box<dyn StagedCandidateLease>, String>>
                    + Send,
            >,
        > {
            self.0.store(true, Ordering::SeqCst);
            Box::pin(async { Err("unexpected".into()) })
        }
    }
    #[tokio::test]
    async fn staging_fails_before_execution_without_capabilities() {
        assert!(
            stage_and_validate(
                Path::new("."),
                "latest",
                Path::new("npm"),
                Path::new("node")
            )
            .await
            .is_err()
        );
        let called = Arc::new(AtomicBool::new(false));
        let result = stage_with_supervisor(
            Arc::new(Incapable(called.clone())),
            StagingRequest {
                parent: ".".into(),
                version: "latest".into(),
                npm: "npm".into(),
                node: "node".into(),
            },
        )
        .await;
        assert!(result.is_err());
        assert!(!called.load(Ordering::SeqCst));
    }
    struct CancellationSupervisor {
        started: std::sync::Mutex<Option<tokio::sync::oneshot::Sender<()>>>,
        cancelled: std::sync::Mutex<Option<tokio::sync::oneshot::Sender<()>>>,
    }
    impl SandboxSupervisor for CancellationSupervisor {
        fn capabilities(&self) -> SandboxCapabilities {
            SandboxCapabilities {
                filesystem_isolation: true,
                network_and_resource_limits: true,
                descendant_containment: true,
                durable_cleanup: true,
            }
        }
        fn stage(
            &self,
            _: StagingRequest,
            cancel: tokio::sync::oneshot::Receiver<()>,
        ) -> std::pin::Pin<
            Box<
                dyn std::future::Future<Output = Result<Box<dyn StagedCandidateLease>, String>>
                    + Send,
            >,
        > {
            let started = self.started.lock().unwrap().take().unwrap();
            let cancelled = self.cancelled.lock().unwrap().take().unwrap();
            Box::pin(async move {
                let _ = started.send(());
                let _ = cancel.await;
                let _ = cancelled.send(());
                Err("cancelled".into())
            })
        }
    }
    #[tokio::test]
    async fn caller_cancellation_reaches_supervisor() {
        let (started_tx, started_rx) = tokio::sync::oneshot::channel();
        let (cancelled_tx, cancelled_rx) = tokio::sync::oneshot::channel();
        let supervisor = Arc::new(CancellationSupervisor {
            started: std::sync::Mutex::new(Some(started_tx)),
            cancelled: std::sync::Mutex::new(Some(cancelled_tx)),
        });
        let handle = tokio::spawn(stage_with_supervisor(
            supervisor,
            StagingRequest {
                parent: ".".into(),
                version: "latest".into(),
                npm: "npm".into(),
                node: "node".into(),
            },
        ));
        started_rx.await.unwrap();
        handle.abort();
        tokio::time::timeout(std::time::Duration::from_secs(1), cancelled_rx)
            .await
            .unwrap()
            .unwrap();
    }
}

#[cfg(test)]
mod staged_update_focused_tests {
    use super::*;

    fn plan() -> UpdatePlan {
        staged_plan(
            Path::new("/opt/jait/gateway"),
            Path::new("/opt/jait/.jait-update-abc123"),
            "1.4.0".into(),
            "1.3.0".into(),
        )
    }

    #[test]
    fn lock_and_stage_paths_sit_beside_the_live_directory() {
        let live = Path::new("/opt/jait/gateway");
        assert_eq!(
            update_lock_path(live),
            PathBuf::from("/opt/jait/gateway.update-lock")
        );
        assert_eq!(stage_prefix(live), PathBuf::from("/opt/jait/.jait-update-"));
        assert_eq!(
            pending_update_message(&update_lock_path(live)),
            "An update is already pending. Inspect /opt/jait/gateway.update-lock before retrying."
        );
    }

    #[test]
    fn candidate_path_follows_platform_layout() {
        let stage = Path::new("/opt/jait/.jait-update-abc123");
        assert_eq!(
            candidate_path(stage, false),
            PathBuf::from("/opt/jait/.jait-update-abc123/lib/node_modules/@jait/gateway")
        );
        assert_eq!(
            candidate_path(stage, true),
            PathBuf::from("/opt/jait/.jait-update-abc123/node_modules/@jait/gateway")
        );
        assert_eq!(npm_executable_name(false), "npm");
        assert_eq!(npm_executable_name(true), "npm.cmd");
    }

    #[test]
    fn default_live_directory_is_the_package_root_of_the_controller() {
        assert_eq!(
            default_live_directory(Path::new("/opt/jait/gateway/bin/safe-update.mjs")),
            PathBuf::from("/opt/jait/gateway")
        );
    }

    #[test]
    fn staged_plan_records_backup_and_camel_case_wire_shape() {
        let plan = plan();
        assert_eq!(plan.lock, PathBuf::from("/opt/jait/gateway.update-lock"));
        assert_eq!(
            plan.backup,
            PathBuf::from("/opt/jait/.jait-update-abc123/previous")
        );
        assert_eq!(plan.new_version, "1.4.0");
        assert_eq!(plan.previous_version, "1.3.0");
        let json: serde_json::Value =
            serde_json::from_str(&serde_json::to_string(&plan).unwrap()).unwrap();
        assert_eq!(json["newVersion"], "1.4.0");
        assert_eq!(json["previousVersion"], "1.3.0");
        assert_eq!(json["candidate"], plan.candidate.to_str().unwrap());
    }

    #[test]
    fn owner_record_serializes_pid_and_iso_start_time() {
        let record: serde_json::Value =
            serde_json::from_str(&owner_record(4242, &iso_timestamp(1_700_000_000_123))).unwrap();
        assert_eq!(record["pid"], 4242);
        assert_eq!(record["startedAt"], "2023-11-14T22:13:20.123Z");
    }

    #[test]
    fn iso_timestamp_matches_javascript_toisoformat() {
        assert_eq!(iso_timestamp(0), "1970-01-01T00:00:00.000Z");
        assert_eq!(iso_timestamp(1), "1970-01-01T00:00:00.001Z");
        assert_eq!(iso_timestamp(951_782_400_000), "2000-02-29T00:00:00.000Z");
        assert_eq!(iso_timestamp(1_717_200_000_000), "2024-06-01T00:00:00.000Z");
        // 2024-06-01T00:00:00Z + 2h40m, i.e. a non-midnight time of day.
        assert_eq!(iso_timestamp(1_717_209_600_123), "2024-06-01T02:40:00.123Z");
    }

    #[test]
    fn stage_directory_creation_is_exclusive() {
        let parent = std::env::temp_dir().join(format!("jait-stage-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&parent);
        std::fs::create_dir_all(&parent).unwrap();
        let live = parent.join("gateway");
        let stage = create_stage_directory(&live, "unique1").unwrap();
        assert_eq!(stage, parent.join(".jait-update-unique1"));
        assert!(stage.is_dir());
        // mkdtemp never reuses a name that already exists.
        assert!(create_stage_directory(&live, "unique1").is_err());
        let plan = staged_plan(&live, &stage, "2.0.0".into(), "1.0.0".into());
        std::fs::write(&plan.lock, b"owner").unwrap();
        discard_staged_update(&plan).unwrap();
        assert!(!stage.exists());
        assert!(!plan.lock.exists());
        // Discarding twice is not an error, matching rm({force:true}).
        discard_staged_update(&plan).unwrap();
        let _ = std::fs::remove_dir_all(&parent);
    }

    #[test]
    fn live_version_is_read_from_the_installed_manifest() {
        let dir = std::env::temp_dir().join(format!("jait-live-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(
            dir.join("package.json"),
            br#"{"name":"@jait/gateway","version":"1.2.3"}"#,
        )
        .unwrap();
        assert_eq!(live_version(&dir).unwrap(), "1.2.3");
        std::fs::write(dir.join("package.json"), br#"{"name":"@jait/gateway"}"#).unwrap();
        assert!(live_version(&dir).is_err());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn activation_stops_only_after_staging_and_swaps_before_restart() {
        let plan = plan();
        let steps = activation_sequence(&plan, 8787, true, true);
        assert_eq!(
            steps,
            vec![
                ActivationStep::Stop,
                ActivationStep::MoveLiveToBackup {
                    from: plan.live.clone(),
                    to: plan.backup.clone()
                },
                ActivationStep::MoveCandidateToLive {
                    from: plan.candidate.clone(),
                    to: plan.live.clone()
                },
                ActivationStep::Restart,
                ActivationStep::AwaitHealth {
                    version: "1.4.0".into(),
                    port: 8787
                },
                ActivationStep::WriteResult(activation_result_ok("1.4.0")),
                ActivationStep::RemoveLock(plan.lock.clone()),
            ]
        );
        // A systemd-owned gateway is not stopped or restarted by the controller.
        let steps = activation_sequence(&plan, 8787, false, false);
        assert!(!steps.contains(&ActivationStep::Stop));
        assert!(!steps.contains(&ActivationStep::Restart));
        assert!(steps.contains(&ActivationStep::WriteResult(activation_result_ok("1.4.0"))));
    }

    #[test]
    fn rollback_restores_the_previous_install_and_parks_the_failed_candidate() {
        let plan = plan();
        let steps = rollback_sequence(&plan, 8787, true, true, true, true, "boom");
        // `if (moved) { if (stop) await stop(); ... }` — the service is stopped
        // again before the swap because the restart may have left it running.
        assert_eq!(steps[0], ActivationStep::Stop);
        assert_eq!(
            steps[1],
            ActivationStep::MoveLiveToBackup {
                from: plan.live.clone(),
                to: plan.stage.join("failed")
            }
        );
        assert_eq!(
            steps[2],
            ActivationStep::MoveCandidateToLive {
                from: plan.backup.clone(),
                to: plan.live.clone()
            }
        );
        assert_eq!(steps[3], ActivationStep::Restart);
        assert_eq!(
            steps[4],
            ActivationStep::AwaitHealth {
                version: "1.3.0".into(),
                port: 8787
            }
        );
        assert_eq!(
            steps.last(),
            Some(&ActivationStep::RemoveLock(plan.lock.clone()))
        );
        assert_eq!(
            steps[steps.len() - 2],
            ActivationStep::WriteResult(activation_result_error("boom", true))
        );
        // Failure before live moved needs no directory repair at all.
        let steps = rollback_sequence(&plan, 8787, true, true, false, false, "boom");
        assert_eq!(
            steps,
            vec![
                ActivationStep::WriteResult(activation_result_error("boom", false)),
                ActivationStep::RemoveLock(plan.lock.clone()),
            ]
        );
        // Moved but not installed: previous install goes straight back.
        let steps = rollback_sequence(&plan, 8787, false, false, true, false, "x");
        assert_eq!(
            steps[0],
            ActivationStep::MoveCandidateToLive {
                from: plan.backup.clone(),
                to: plan.live.clone()
            }
        );
    }

    #[test]
    fn health_probe_requires_ok_healthy_and_expected_version() {
        assert!(health_probe_satisfied(
            true,
            Some(true),
            Some("1.4.0"),
            "1.4.0"
        ));
        assert!(health_probe_satisfied(true, None, Some("1.4.0"), "1.4.0"));
        assert!(!health_probe_satisfied(
            true,
            Some(false),
            Some("1.4.0"),
            "1.4.0"
        ));
        assert!(!health_probe_satisfied(
            false,
            Some(true),
            Some("1.4.0"),
            "1.4.0"
        ));
        assert!(!health_probe_satisfied(
            true,
            Some(true),
            Some("1.3.0"),
            "1.4.0"
        ));
        assert!(!health_probe_satisfied(true, Some(true), None, "1.4.0"));
        assert_eq!(
            health_timeout_message(8787, "1.4.0"),
            "Gateway 1.4.0 did not become healthy on port 8787"
        );
        assert_eq!(HEALTH_TIMEOUT.as_secs(), 180);
        assert_eq!(HEALTH_POLL_INTERVAL.as_millis(), 1_000);
        assert_eq!(HEALTH_PROBE_TIMEOUT.as_secs(), 3);
    }

    #[test]
    fn activation_results_report_ok_version_and_rollback_state() {
        let ok: serde_json::Value = serde_json::from_str(&activation_result_ok("1.4.0")).unwrap();
        assert_eq!(ok["ok"], true);
        assert_eq!(ok["version"], "1.4.0");
        let failed: serde_json::Value =
            serde_json::from_str(&activation_result_error("disk full", true)).unwrap();
        assert_eq!(failed["ok"], false);
        assert_eq!(failed["error"], "disk full");
        assert_eq!(failed["rolledBack"], true);
    }
}
