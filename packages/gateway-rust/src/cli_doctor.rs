//! Read-only native doctor. Runtime supplies captured host configuration and exact
//! effect grants. Nothing discovers HOME, loads .env, installs packages or repairs
//! state. Public JSON retains the TypeScript doctor wire shape; observation and
//! remediation facts are native metadata, not extra wire statuses.
use crate::{
    execution::process_runner::{
        CapturedProcessResult, ProcessCancellation, ProcessPool, ProcessRequest,
    },
    runtime::blocking::BlockingLane,
    services::{
        code_graph::{
            engine::{ExecOutput, Executor, GraphError, path_join},
            runtime::{GraphifyRuntime, RuntimeStatus, runtime_paths},
        },
        project_search::{Error as FileError, ProjectRoot},
    },
    text::js_trim,
};
use futures_util::future::BoxFuture;
use serde::Serialize;
use std::{
    collections::{BTreeMap, BTreeSet},
    path::{Component, Path, PathBuf},
    sync::Arc,
    time::Duration,
};
use tokio::time::Instant;

pub const PROCESS_OUTPUT_LIMIT: usize = 4096;
pub const HEALTH_BODY_LIMIT: usize = 65536;
pub const CHECK_TIMEOUT: Duration = Duration::from_secs(3);
pub const REPORT_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum DoctorStatus {
    Pass,
    Warn,
    Fail,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Observation {
    Observed,
    Skipped,
    Unknown,
    Error,
}
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ProbeIssue {
    pub observation: Observation,
    pub code: &'static str,
}
impl ProbeIssue {
    fn skipped(code: &'static str) -> Self {
        Self {
            observation: Observation::Skipped,
            code,
        }
    }
    fn unknown(code: &'static str) -> Self {
        Self {
            observation: Observation::Unknown,
            code,
        }
    }
    fn error(code: &'static str) -> Self {
        Self {
            observation: Observation::Error,
            code,
        }
    }
}
/// Facts for a future separately authorized repair workflow. No executable plan
/// or repair capability is carried by this read-only module.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Remediation {
    pub code: &'static str,
    pub requires_repair_authority: bool,
    pub requires_rollback: bool,
}
#[derive(Clone, Debug, Serialize)]
pub struct DoctorCheck {
    pub id: String,
    pub label: String,
    pub status: DoctorStatus,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fix: Option<String>,
    #[serde(skip)]
    pub observation: Observation,
    #[serde(skip)]
    pub issue_code: Option<&'static str>,
    #[serde(skip)]
    pub remediation: Option<Remediation>,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DoctorResult {
    pub checks: Vec<DoctorCheck>,
    pub ok: bool,
    pub warning_count: usize,
    pub failure_count: usize,
}
#[derive(Clone, Debug, Serialize)]
pub struct DoctorDiagnosticCheck {
    pub id: String,
    pub label: String,
    pub status: DoctorStatus,
    pub summary: String,
    pub details: Vec<String>,
}
#[derive(Clone, Debug, Serialize)]
pub struct DoctorCounts {
    pub pass: usize,
    pub warn: usize,
    pub fail: usize,
}
#[derive(Clone, Debug, Serialize)]
pub struct DoctorDiagnosticReport {
    pub checks: Vec<DoctorDiagnosticCheck>,
    pub ok: bool,
    pub counts: DoctorCounts,
}
impl DoctorResult {
    pub fn diagnostics(&self) -> DoctorDiagnosticReport {
        DoctorDiagnosticReport {
            checks: self
                .checks
                .iter()
                .map(|c| DoctorDiagnosticCheck {
                    id: c.id.clone(),
                    label: c.label.clone(),
                    status: c.status,
                    summary: c.message.clone(),
                    details: c.fix.iter().cloned().collect(),
                })
                .collect(),
            ok: self.ok,
            counts: DoctorCounts {
                pass: self
                    .checks
                    .iter()
                    .filter(|c| c.status == DoctorStatus::Pass)
                    .count(),
                warn: self.warning_count,
                fail: self.failure_count,
            },
        }
    }
    pub fn exit_code(&self) -> i32 {
        if self.ok { 0 } else { 1 }
    }
    /// Banner/config preamble belongs to the shared CLI registration owner.
    pub fn render(&self) -> String {
        let mut output = String::new();
        for check in &self.checks {
            let marker = match check.status {
                DoctorStatus::Pass => "PASS",
                DoctorStatus::Warn => "WARN",
                DoctorStatus::Fail => "FAIL",
            };
            output.push_str(&format!(
                "  [{marker}] {}: {}\n",
                check.label, check.message
            ));
            if let Some(fix) = &check.fix {
                output.push_str(&format!("         {fix}\n"));
            }
        }
        let counts = self.diagnostics().counts;
        output.push_str(&format!(
            "\n  Summary: {} passed, {} warnings, {} failed\n  Result:  {}\n\n",
            counts.pass,
            counts.warn,
            counts.fail,
            if self.ok { "ok" } else { "issues found" }
        ));
        output
    }
}

/// All host defaults are captured by the embedding CLI, never by doctor.
#[derive(Clone, Debug)]
pub struct DoctorConfig {
    pub cwd: PathBuf,
    pub jait_dir: PathBuf,
    pub env_path: Option<PathBuf>,
    pub port: Option<String>,
    pub env_port: Option<String>,
    pub min_node_version: String,
    /// Absolute JS module filename used only for require.resolve's search origin.
    pub module_origin: PathBuf,
    pub windows: bool,
}
impl DoctorConfig {
    pub fn validate(&self) -> Result<(), ProbeIssue> {
        for path in [&self.cwd, &self.jait_dir, &self.module_origin] {
            if !valid_absolute(path) {
                return Err(ProbeIssue::error("invalid-host-path"));
            }
        }
        if self
            .env_path
            .as_ref()
            .is_some_and(|p| p.to_str().is_none_or(|p| !valid_text(p, 4096)))
            || !valid_text(&self.min_node_version, 128)
            || self
                .port
                .iter()
                .chain(self.env_port.iter())
                .any(|v| !valid_text(v, 128))
        {
            return Err(ProbeIssue::error("invalid-host-configuration"));
        }
        Ok(())
    }
    fn port_text(&self) -> &str {
        self.port
            .as_deref()
            .or(self.env_port.as_deref())
            .unwrap_or("8000")
    }
    fn absolute(&self, path: &Path) -> PathBuf {
        if path.is_absolute() {
            PathBuf::from(path_join(&[&path.to_string_lossy()]))
        } else {
            PathBuf::from(path_join(&[
                &self.cwd.to_string_lossy(),
                &path.to_string_lossy(),
            ]))
        }
    }
}
pub fn resolve_doctor_env_candidates(config: &DoctorConfig) -> Vec<PathBuf> {
    config
        .env_path
        .iter()
        .filter(|p| !p.as_os_str().is_empty())
        .cloned()
        .chain([config.cwd.join(".env"), config.jait_dir.join(".env")])
        .collect()
}
fn valid_text(text: &str, limit: usize) -> bool {
    text.len() <= limit && !text.chars().any(char::is_control)
}
fn valid_absolute(path: &Path) -> bool {
    path.is_absolute()
        && path.to_str().is_some_and(|p| valid_text(p, 4096))
        && !path
            .components()
            .any(|c| matches!(c, Component::ParentDir | Component::CurDir))
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum DoctorProbe {
    NodeVersion,
    Bun,
    Playwright,
    Codex,
    Claude,
    GraphifyVersion,
}
#[derive(Clone)]
pub struct ProbeContext {
    pub deadline: Instant,
    pub cancellation: ProcessCancellation,
}
impl ProbeContext {
    fn remaining(&self) -> Result<Duration, ProbeIssue> {
        if self.cancellation.is_cancelled() {
            return Err(ProbeIssue::skipped("cancelled"));
        }
        self.deadline
            .checked_duration_since(Instant::now())
            .filter(|d| !d.is_zero())
            .ok_or_else(|| ProbeIssue::unknown("deadline-exceeded"))
    }
}
/// Implementations must scope effects before execution. Futures may be dropped on
/// cancellation/deadline. Results must not contain environment or raw error text.
pub trait DoctorEffects: Send + Sync {
    fn exists<'a>(
        &'a self,
        path: &'a Path,
        context: ProbeContext,
    ) -> BoxFuture<'a, Result<bool, ProbeIssue>>;
    fn process(
        &self,
        probe: DoctorProbe,
        context: ProbeContext,
    ) -> BoxFuture<'_, Result<CapturedProcessResult, ProbeIssue>>;
    fn graphify(&self, context: ProbeContext) -> BoxFuture<'_, Result<RuntimeStatus, ProbeIssue>>;
    fn health(&self, port: u16, context: ProbeContext) -> BoxFuture<'_, Result<bool, ProbeIssue>>;
}
async fn bounded<T>(
    context: &ProbeContext,
    future: impl std::future::Future<Output = Result<T, ProbeIssue>>,
) -> Result<T, ProbeIssue> {
    let duration = context.remaining()?.min(CHECK_TIMEOUT);
    tokio::select! {
        biased;
        _ = context.cancellation.wait_cancelled() => Err(ProbeIssue::skipped("cancelled")),
        result = tokio::time::timeout(duration, future) => result.unwrap_or_else(|_| Err(ProbeIssue::unknown("deadline-exceeded"))),
    }
}
fn check(
    id: &str,
    label: &str,
    status: DoctorStatus,
    message: String,
    fix: Option<(&'static str, String)>,
) -> DoctorCheck {
    let remediation = fix.as_ref().map(|(code, _)| Remediation {
        code,
        requires_repair_authority: true,
        requires_rollback: true,
    });
    DoctorCheck {
        id: id.into(),
        label: label.into(),
        status,
        message,
        fix: fix.map(|(_, text)| text),
        observation: Observation::Observed,
        issue_code: None,
        remediation,
    }
}
fn incomplete(id: &str, label: &str, issue: ProbeIssue) -> DoctorCheck {
    let mut c = check(
        id,
        label,
        DoctorStatus::Warn,
        format!("{:?}: {}", issue.observation, issue.code),
        None,
    );
    c.observation = issue.observation;
    c.issue_code = Some(issue.code);
    c
}
fn process_output(result: &CapturedProcessResult) -> Result<(), ProbeIssue> {
    if result.cancelled {
        Err(ProbeIssue::skipped("cancelled"))
    } else if result.timed_out {
        Err(ProbeIssue::unknown("process-timeout"))
    } else if result.truncated
        || result.stdout.len().saturating_add(result.stderr.len()) > PROCESS_OUTPUT_LIMIT
    {
        Err(ProbeIssue::unknown("process-output-limit"))
    } else if result.exit_code.is_none() {
        Err(ProbeIssue::error("process-signal"))
    } else {
        Ok(())
    }
}

pub async fn run_doctor(
    config: &DoctorConfig,
    effects: &dyn DoctorEffects,
    cancellation: ProcessCancellation,
) -> Result<DoctorResult, ProbeIssue> {
    config.validate()?;
    let context = ProbeContext {
        deadline: Instant::now() + REPORT_TIMEOUT,
        cancellation,
    };
    let mut checks = Vec::with_capacity(10);
    let mut found = None;
    let mut env_issue = None;
    for candidate in resolve_doctor_env_candidates(config) {
        match bounded(
            &context,
            effects.exists(&config.absolute(&candidate), context.clone()),
        )
        .await
        {
            Ok(true) => {
                found = Some(candidate);
                break;
            }
            Ok(false) => {}
            Err(issue) => {
                env_issue = Some(issue);
                break;
            }
        }
    }
    checks.push(if let Some(path) = found {
        check(
            "env-file",
            "Environment file",
            DoctorStatus::Pass,
            format!("Loaded from {}", path.display()),
            None,
        )
    } else if let Some(issue) = env_issue {
        incomplete("env-file", "Environment file", issue)
    } else if let Some(path) = config
        .env_path
        .as_ref()
        .filter(|p| !p.as_os_str().is_empty())
    {
        check(
            "env-file",
            "Environment file",
            DoctorStatus::Fail,
            format!("Configured env file was not found: {}", path.display()),
            Some((
                "env-configured-missing",
                "Create the specified env file or point --env at the correct location.".into(),
            )),
        )
    } else {
        check(
            "env-file",
            "Environment file",
            DoctorStatus::Warn,
            "No .env file found in the current project or ~/.jait".into(),
            Some((
                "env-missing",
                "Create .env in the project root or ~/.jait/.env.".into(),
            )),
        )
    });

    for (id, label, path, missing, fix, code) in [
        (
            "jait-dir",
            "Jait home",
            config.jait_dir.clone(),
            format!("{} does not exist yet", config.jait_dir.display()),
            "Start Jait once to initialize ~/.jait.",
            "state-directory-missing",
        ),
        (
            "database",
            "Gateway database",
            config.jait_dir.join("data/jait.db"),
            format!(
                "Database not found at {}",
                config.jait_dir.join("data/jait.db").display()
            ),
            "Start the gateway once so it creates ~/.jait/data/jait.db.",
            "database-missing",
        ),
    ] {
        checks.push(
            match bounded(&context, effects.exists(&path, context.clone())).await {
                Ok(true) => check(
                    id,
                    label,
                    DoctorStatus::Pass,
                    format!("Found {}", path.display()),
                    None,
                ),
                Ok(false) => check(
                    id,
                    label,
                    DoctorStatus::Warn,
                    missing,
                    Some((code, fix.into())),
                ),
                Err(issue) => incomplete(id, label, issue),
            },
        );
    }
    checks.push(
        match bounded(
            &context,
            effects.process(DoctorProbe::NodeVersion, context.clone()),
        )
        .await
        {
            Ok(result) => match node_version(&result) {
                Ok(version) => {
                    let pass = compare_semver(&version, &config.min_node_version)
                        != std::cmp::Ordering::Less;
                    check(
                        "node-version",
                        "Node.js version",
                        if pass {
                            DoctorStatus::Pass
                        } else {
                            DoctorStatus::Fail
                        },
                        if pass {
                            format!("{version} satisfies >= {}", config.min_node_version)
                        } else {
                            format!(
                                "{version} is below the required >= {}",
                                config.min_node_version
                            )
                        },
                        if pass {
                            None
                        } else {
                            Some((
                                "node-upgrade",
                                format!("Upgrade Node.js to {} or newer.", config.min_node_version),
                            ))
                        },
                    )
                }
                Err(issue) => incomplete("node-version", "Node.js version", issue),
            },
            Err(issue) if issue.code == "executable-not-found" => check(
                "node-version",
                "Node.js version",
                DoctorStatus::Fail,
                "Node.js is not available at the configured executable".into(),
                Some((
                    "node-install",
                    format!("Install Node.js {} or newer.", config.min_node_version),
                )),
            ),
            Err(issue) => incomplete("node-version", "Node.js version", issue),
        },
    );
    checks.push(
        availability(
            effects,
            &context,
            DoctorProbe::Bun,
            "bun",
            "Bun runtime",
            "bun",
            "Install Bun if you plan to run the monorepo dev workflow locally.",
            "bun-install",
        )
        .await,
    );
    checks.push(
        availability(
            effects,
            &context,
            DoctorProbe::Playwright,
            "playwright",
            "Playwright package",
            "playwright",
            "Run the project install so browser tooling is available.",
            "playwright-install",
        )
        .await,
    );
    checks.push(match bounded(&context, effects.graphify(context.clone())).await {
        Ok(status) => if status.ready {
            check("graphify-runtime", "Graphify runtime", DoctorStatus::Pass, format!("{} at {}", safe_line(status.version.as_deref().unwrap_or("ready")), safe_line(&status.command)), None)
        } else {
            check("graphify-runtime", "Graphify runtime", DoctorStatus::Fail, safe_line(status.error.as_deref().unwrap_or("Graphify is unavailable")), Some(("graphify-provision", "Start Jait to provision Graphify automatically. Python 3.10+ with venv and pip is required.".into())))
        },
        Err(issue) => incomplete("graphify-runtime", "Graphify runtime", issue),
    });
    for (probe, id, command) in [
        (DoctorProbe::Codex, "codex", "codex"),
        (DoctorProbe::Claude, "claude-code", "claude"),
    ] {
        checks.push(
            availability(
                effects,
                &context,
                probe,
                &format!("provider-{id}"),
                &format!("{id} CLI"),
                command,
                &format!("Install and configure {id} if you want to use that provider."),
                if probe == DoctorProbe::Codex {
                    "codex-install"
                } else {
                    "claude-install"
                },
            )
            .await,
        );
    }
    checks.push(if let Some(port) = parse_port(config.port_text()) {
        match bounded(&context, effects.health(port, context.clone())).await {
            Ok(healthy) => check(
                "gateway-health",
                "Gateway health",
                if healthy {
                    DoctorStatus::Pass
                } else {
                    DoctorStatus::Warn
                },
                if healthy {
                    format!("Gateway responded on http://127.0.0.1:{port}/health")
                } else {
                    format!("No gateway responded on http://127.0.0.1:{port}/health")
                },
                if healthy {
                    None
                } else {
                    Some((
                        "gateway-start",
                        "Run `jait start` or check the configured port.".into(),
                    ))
                },
            ),
            Err(issue) => incomplete("gateway-health", "Gateway health", issue),
        }
    } else {
        check(
            "gateway-health",
            "Gateway health",
            DoctorStatus::Fail,
            format!("Invalid port: {}", config.port_text()),
            Some(("port-invalid", "Pass a numeric --port value.".into())),
        )
    });
    let failure_count = checks
        .iter()
        .filter(|c| c.status == DoctorStatus::Fail)
        .count();
    let warning_count = checks
        .iter()
        .filter(|c| c.status == DoctorStatus::Warn)
        .count();
    Ok(DoctorResult {
        checks,
        ok: failure_count == 0,
        failure_count,
        warning_count,
    })
}

pub async fn run_doctor_diagnostics(
    config: &DoctorConfig,
    effects: &dyn DoctorEffects,
    cancellation: ProcessCancellation,
) -> Result<DoctorDiagnosticReport, ProbeIssue> {
    Ok(run_doctor(config, effects, cancellation)
        .await?
        .diagnostics())
}

#[allow(clippy::too_many_arguments)]
async fn availability(
    effects: &dyn DoctorEffects,
    context: &ProbeContext,
    probe: DoctorProbe,
    id: &str,
    label: &str,
    command: &str,
    fix: &str,
    code: &'static str,
) -> DoctorCheck {
    match bounded(context, effects.process(probe, context.clone())).await {
        Ok(result) => {
            if let Err(issue) = process_output(&result) {
                return incomplete(id, label, issue);
            }
            let available = match result.exit_code {
                Some(0) => true,
                Some(1) => false,
                _ => return incomplete(id, label, ProbeIssue::error("probe-exit-error")),
            };
            let message = if probe == DoctorProbe::Playwright {
                if available {
                    "playwright dependency is resolvable".into()
                } else {
                    "playwright dependency is not resolvable".into()
                }
            } else {
                format!(
                    "{command} is {}available on PATH",
                    if available { "" } else { "not " }
                )
            };
            check(
                id,
                label,
                if available {
                    DoctorStatus::Pass
                } else {
                    DoctorStatus::Warn
                },
                message,
                if available {
                    None
                } else {
                    Some((code, fix.into()))
                },
            )
        }
        Err(issue) => incomplete(id, label, issue),
    }
}
fn node_version(result: &CapturedProcessResult) -> Result<String, ProbeIssue> {
    process_output(result)?;
    if result.exit_code != Some(0) {
        return Err(ProbeIssue::error("node-probe-exit"));
    }
    let raw = std::str::from_utf8(&result.stdout)
        .map_err(|_| ProbeIssue::error("node-version-encoding"))?;
    let version = js_trim(raw);
    let core = version.split(['-', '+']).next().unwrap_or("");
    let parts: Vec<_> = core.strip_prefix('v').unwrap_or(core).split('.').collect();
    if version.len() > 256
        || !version
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'-' | b'+'))
        || parts.len() != 3
        || parts
            .iter()
            .any(|p| p.is_empty() || !p.bytes().all(|b| b.is_ascii_digit()))
    {
        return Err(ProbeIssue::unknown("node-version-malformed"));
    }
    Ok(version.into())
}
fn decimal_prefix(text: &str) -> f64 {
    let text = js_trim(text);
    let (sign, rest) = if let Some(s) = text.strip_prefix('-') {
        (-1.0, s)
    } else {
        (1.0, text.strip_prefix('+').unwrap_or(text))
    };
    let mut n = 0.0;
    for digit in rest.bytes().take_while(|b| b.is_ascii_digit()) {
        n = n * 10.0 + f64::from(digit - b'0');
    }
    sign * n
}
fn compare_semver(left: &str, right: &str) -> std::cmp::Ordering {
    let left: Vec<_> = left
        .strip_prefix('v')
        .unwrap_or(left)
        .split('.')
        .map(decimal_prefix)
        .collect();
    let right: Vec<_> = right
        .strip_prefix('v')
        .unwrap_or(right)
        .split('.')
        .map(decimal_prefix)
        .collect();
    for i in 0..left.len().max(right.len()) {
        let order = left
            .get(i)
            .unwrap_or(&0.0)
            .partial_cmp(right.get(i).unwrap_or(&0.0))
            .unwrap_or(std::cmp::Ordering::Equal);
        if order != std::cmp::Ordering::Equal {
            return order;
        }
    }
    std::cmp::Ordering::Equal
}
/// JS parseInt(..., 10) prefix compatibility; network ports additionally require
/// the socket range (the old helper could throw for values above 65535).
fn parse_port(text: &str) -> Option<u16> {
    let n = decimal_prefix(text);
    if n >= 1.0 && n <= u16::MAX as f64 {
        Some(n as u16)
    } else {
        None
    }
}
fn safe_line(text: &str) -> String {
    text.chars().filter(|c| !c.is_control()).take(512).collect()
}

/// Metadata authority is an exact path mapped onto an already-authorized pinned
/// root. Opening roots belongs to runtime's bounded authorization/capture phase.
#[derive(Clone)]
pub struct MetadataGrant {
    pub root: ProjectRoot,
    pub relative: String,
}
#[derive(Clone)]
pub struct ProcessGrant {
    /// Absolute node, which/where, or Graphify executable, depending on probe.
    pub program: PathBuf,
    pub environment: BTreeMap<String, String>,
}
#[derive(Clone, Default)]
pub struct DoctorScope {
    pub metadata: BTreeMap<PathBuf, MetadataGrant>,
    pub processes: BTreeMap<DoctorProbe, ProcessGrant>,
    pub health_ports: BTreeSet<u16>,
}
#[derive(Clone)]
pub struct NativeDoctorEffects {
    config: DoctorConfig,
    scope: DoctorScope,
    processes: ProcessPool,
    files: BlockingLane,
    http: reqwest::Client,
}
impl NativeDoctorEffects {
    /// Shared pools come from runtime; no per-doctor worker/service pool.
    pub fn new(
        config: DoctorConfig,
        scope: DoctorScope,
        processes: ProcessPool,
        files: BlockingLane,
    ) -> Result<Self, ProbeIssue> {
        config.validate()?;
        if config.windows != cfg!(windows) {
            return Err(ProbeIssue::unknown("foreign-platform"));
        }
        if scope.metadata.len() > 5
            || scope.processes.len() > 6
            || scope.health_ports.len() > 1
            || scope.health_ports.contains(&0)
        {
            return Err(ProbeIssue::error("scope-limit"));
        }
        let expected: BTreeSet<_> = resolve_doctor_env_candidates(&config)
            .iter()
            .map(|p| config.absolute(p))
            .chain([
                config.jait_dir.clone(),
                config.jait_dir.join("data/jait.db"),
            ])
            .collect();
        for (path, grant) in &scope.metadata {
            if !expected.contains(path)
                || !valid_absolute(path)
                || grant.relative.len() > 4096
                || Path::new(&grant.relative)
                    .components()
                    .any(|c| !matches!(c, Component::Normal(_)))
                || grant.root.path().join(&grant.relative) != *path
            {
                return Err(ProbeIssue::error("metadata-scope-mismatch"));
            }
        }
        for grant in scope.processes.values() {
            if !valid_absolute(&grant.program)
                || grant.environment.iter().any(|(k, v)| {
                    !matches!(
                        k.as_str(),
                        "PATH" | "PATHEXT" | "SystemRoot" | "SYSTEMROOT" | "WINDIR"
                    ) || !valid_text(v, 16384)
                })
            {
                return Err(ProbeIssue::error("process-scope-invalid"));
            }
        }
        if scope
            .health_ports
            .iter()
            .any(|p| Some(*p) != parse_port(config.port_text()))
        {
            return Err(ProbeIssue::error("health-scope-mismatch"));
        }
        let http = reqwest::Client::builder()
            .no_gzip()
            .no_brotli()
            .no_deflate()
            .no_zstd()
            .no_proxy()
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(CHECK_TIMEOUT)
            .timeout(CHECK_TIMEOUT)
            .build()
            .map_err(|_| ProbeIssue::error("health-client"))?;
        Ok(Self {
            config,
            scope,
            processes,
            files,
            http,
        })
    }
    pub async fn diagnose(
        &self,
        cancellation: ProcessCancellation,
    ) -> Result<DoctorResult, ProbeIssue> {
        run_doctor(&self.config, self, cancellation).await
    }

    fn request(
        &self,
        probe: DoctorProbe,
        context: &ProbeContext,
    ) -> Result<ProcessRequest, ProbeIssue> {
        let grant = self
            .scope
            .processes
            .get(&probe)
            .ok_or_else(|| ProbeIssue::skipped("process-not-authorized"))?;
        let args: Vec<String> = match probe {
            DoctorProbe::NodeVersion | DoctorProbe::GraphifyVersion => vec!["--version".into()],
            DoctorProbe::Bun => vec!["bun".into()],
            DoctorProbe::Codex => vec!["codex".into()],
            DoctorProbe::Claude => vec!["claude".into()],
            DoctorProbe::Playwright => vec!["--input-type=commonjs".into(), "-e".into(),
                "try { require('node:module').createRequire(process.argv[1]).resolve('playwright'); } catch (e) { process.exitCode = e.code === 'MODULE_NOT_FOUND' ? 1 : 2; }".into(),
                self.config.module_origin.to_string_lossy().into_owned()],
        };
        Ok(ProcessRequest {
            argv: std::iter::once(grant.program.to_string_lossy().into_owned())
                .chain(args)
                .collect(),
            cwd: self.config.cwd.clone(),
            environment: grant.environment.clone().into_iter().collect(),
            input: None,
            timeout: context.remaining()?.min(CHECK_TIMEOUT),
            output_limit: PROCESS_OUTPUT_LIMIT,
        })
    }
}
impl DoctorEffects for NativeDoctorEffects {
    fn exists<'a>(
        &'a self,
        path: &'a Path,
        context: ProbeContext,
    ) -> BoxFuture<'a, Result<bool, ProbeIssue>> {
        Box::pin(async move {
            context.remaining()?;
            let grant = self
                .scope
                .metadata
                .get(path)
                .cloned()
                .ok_or_else(|| ProbeIssue::skipped("metadata-not-authorized"))?;
            // The canonical descriptor-relative reader denies symlink ancestors,
            // pins the root identity and uses nonblocking opens for special files.
            let work = self.files.run(move || {
                grant.root.check_identity()?;
                grant.root.metadata(&grant.relative)
            });
            let result = bounded(&context, async {
                work.await
                    .map_err(|_| ProbeIssue::unknown("filesystem-capacity"))
            })
            .await?;
            match result {
                Ok(metadata) if metadata.is_file() || metadata.is_dir() => Ok(true),
                Ok(_) => Err(ProbeIssue::unknown("special-file")),
                Err(FileError::Io(e)) if e.kind() == std::io::ErrorKind::NotFound => Ok(false),
                Err(FileError::Unsupported) => {
                    Err(ProbeIssue::unknown("filesystem-platform-unsupported"))
                }
                Err(FileError::Io(e)) if e.kind() == std::io::ErrorKind::Unsupported => {
                    Err(ProbeIssue::unknown("filesystem-platform-unsupported"))
                }
                Err(FileError::RootChanged) => Err(ProbeIssue::error("filesystem-root-changed")),
                Err(_) => Err(ProbeIssue::error("filesystem-check-error")),
            }
        })
    }
    fn process(
        &self,
        probe: DoctorProbe,
        context: ProbeContext,
    ) -> BoxFuture<'_, Result<CapturedProcessResult, ProbeIssue>> {
        Box::pin(async move {
            let request = self.request(probe, &context)?;
            self.processes
                .run_captured(request, context.cancellation)
                .await
                .map_err(|e| match e.kind() {
                    std::io::ErrorKind::NotFound => ProbeIssue::unknown("executable-not-found"),
                    std::io::ErrorKind::WouldBlock => ProbeIssue::unknown("process-capacity"),
                    _ => ProbeIssue::error("process-execution-error"),
                })
        })
    }
    fn graphify(&self, context: ProbeContext) -> BoxFuture<'_, Result<RuntimeStatus, ProbeIssue>> {
        Box::pin(async move {
            let grant = self
                .scope
                .processes
                .get(&DoctorProbe::GraphifyVersion)
                .ok_or_else(|| ProbeIssue::skipped("process-not-authorized"))?;
            let command = grant.program.to_string_lossy().into_owned();
            let managed_path =
                runtime_paths(&self.config.jait_dir.to_string_lossy(), self.config.windows)
                    .command_path;
            let result = match self.process(DoctorProbe::GraphifyVersion, context).await {
                Ok(result) => result,
                Err(issue) if issue.code == "executable-not-found" => {
                    return Ok(RuntimeStatus {
                        ready: false,
                        managed: command == managed_path,
                        command,
                        version: None,
                        expected_version: crate::services::code_graph::runtime::PACKAGE_VERSION
                            .into(),
                        error: Some("Graphify is unavailable".into()),
                    });
                }
                Err(issue) => return Err(issue),
            };
            process_output(&result)?;
            let stdout = std::str::from_utf8(&result.stdout)
                .map_err(|_| ProbeIssue::unknown("graphify-version-encoding"))?
                .to_owned();
            let stderr = std::str::from_utf8(&result.stderr)
                .map_err(|_| ProbeIssue::unknown("graphify-version-encoding"))?
                .to_owned();
            let mut env = BTreeMap::new();
            if command != managed_path {
                env.insert("JAIT_GRAPHIFY_COMMAND".into(), command.clone());
            }
            // Reuse canonical pinned-version interpretation. This adapter can only
            // replay this one read-only probe, never provision or invoke ensure.
            let execute: Executor = Arc::new(move |request| {
                let result = result.clone();
                let command = command.clone();
                let stdout = stdout.clone();
                let stderr = stderr.clone();
                Box::pin(async move {
                    if request.command != command
                        || request.args != ["--version"]
                        || result.exit_code != Some(0)
                    {
                        return Err(GraphError::error("Graphify version probe failed"));
                    }
                    Ok(ExecOutput { stdout, stderr })
                })
            });
            let mut runtime = GraphifyRuntime::new(
                self.config.jait_dir.to_string_lossy().into_owned(),
                env,
                execute,
            );
            runtime.windows = self.config.windows;
            Ok(runtime.inspect().await)
        })
    }
    fn health(&self, port: u16, context: ProbeContext) -> BoxFuture<'_, Result<bool, ProbeIssue>> {
        Box::pin(async move {
            bounded(&context, async {
                context.remaining()?;
                if !self.scope.health_ports.contains(&port) {
                    return Err(ProbeIssue::skipped("health-not-authorized"));
                }
                let request = self
                    .http
                    .get(format!("http://127.0.0.1:{port}/health"))
                    .timeout(context.remaining()?.min(CHECK_TIMEOUT));
                let mut response = match request.send().await {
                    Ok(response) => response,
                    Err(e) if e.is_connect() => return Ok(false),
                    Err(e) if e.is_timeout() => return Err(ProbeIssue::unknown("health-timeout")),
                    Err(_) => return Err(ProbeIssue::error("health-transport-error")),
                };
                // Never follow a redirect, including to another loopback port.
                if response.status().is_redirection() {
                    return Err(ProbeIssue::unknown("health-redirect"));
                }
                if response
                    .content_length()
                    .is_some_and(|n| n > HEALTH_BODY_LIMIT as u64)
                {
                    return Err(ProbeIssue::unknown("health-body-limit"));
                }
                let mut body = Vec::new();
                while let Some(chunk) = response
                    .chunk()
                    .await
                    .map_err(|_| ProbeIssue::error("health-body-error"))?
                {
                    if chunk.len() > HEALTH_BODY_LIMIT - body.len() {
                        return Err(ProbeIssue::unknown("health-body-limit"));
                    }
                    body.extend_from_slice(&chunk);
                }
                let value: serde_json::Value = serde_json::from_slice(&body)
                    .map_err(|_| ProbeIssue::unknown("health-invalid-json"))?;
                // Original CLI tests JSON truthiness, not HTTP status or {ok:true}.
                Ok(match value {
                    serde_json::Value::Null => false,
                    serde_json::Value::Bool(v) => v,
                    serde_json::Value::Number(n) => n.as_f64().is_some_and(|n| n != 0.0),
                    serde_json::Value::String(s) => !s.is_empty(),
                    _ => true,
                })
            })
            .await
        })
    }
}

#[cfg(test)]
#[path = "cli_doctor_tests.rs"]
mod tests;
