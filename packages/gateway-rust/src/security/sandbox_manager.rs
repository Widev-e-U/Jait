//! Canonical sandbox orchestration. Command/session slice; browser and VM
//! lifecycle is partial and this component earns no coverage credit.
//! Hosts retain consent, path scope, process bounds and shutdown ownership.
use super::sandbox_background_process::{Admission, BackgroundProcess, RunnerResult, Runtime};
use crate::{contracts::bounded_json::Utf16Text, text::js_trim, tools::core_io::HostError};
use futures_util::future::BoxFuture;
use std::sync::Arc;
use tokio::sync::oneshot;

#[path = "sandbox_manager_lifecycle.rs"]
mod lifecycle;
pub use lifecycle::*;

type Result<T> = std::result::Result<T, HostError>;
fn error(message: impl Into<String>) -> HostError {
    HostError::Error(message.into())
}
#[derive(Clone, Copy, Debug)]
pub enum ContainerRuntime {
    Docker,
    Podman,
}
impl ContainerRuntime {
    fn binary(self) -> &'static str {
        match self {
            Self::Docker => "docker",
            Self::Podman => "podman",
        }
    }
}
/// Read-only preflight category. A successful preflight never grants effect
/// authority and is not an atomic reservation across concurrent starts.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SandboxKind {
    Browser,
    LinuxDesktop,
    Windows,
}
impl SandboxKind {
    fn description(self) -> (&'static str, &'static str, &'static str, f64) {
        match self {
            Self::Browser => ("Browser", "jait-browser-sb-", "preview browser", 2.0),
            Self::LinuxDesktop => (
                "Linux desktop",
                "jait-linux-desktop-sb-",
                "desktop sandbox",
                1.0,
            ),
            Self::Windows => ("Windows", "jait-windows-sb-", "Windows VM", 1.0),
        }
    }
    fn image(self) -> &'static str {
        match self {
            Self::Browser => "jait/sandbox-browser:recovery-v3",
            Self::LinuxDesktop => "jait/sandbox-linux-desktop:latest",
            Self::Windows => "jait/windows-sandbox:latest",
        }
    }
    fn dockerfile(self) -> &'static str {
        match self {
            Self::Browser => include_str!("sandbox_browser.dockerfile"),
            Self::LinuxDesktop => include_str!("sandbox_linux_desktop.dockerfile"),
            Self::Windows => include_str!("sandbox_windows.dockerfile"),
        }
    }
    /// Decimal JS parseInt semantics for the host's captured JAIT_MAX_* setting.
    /// No ambient environment lookup; the bootstrap owns configuration scope.
    pub fn max_active(self, setting: Option<&str>) -> f64 {
        let raw = js_trim(setting.unwrap_or(""));
        let raw = raw.strip_prefix('+').unwrap_or(raw);
        let digits: String = raw.chars().take_while(|c| c.is_ascii_digit()).collect();
        digits
            .parse::<f64>()
            .ok()
            .filter(|n| n.is_finite() && *n > 0.0)
            .unwrap_or(self.description().3)
    }
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub enum MountMode {
    None,
    ReadOnly,
    #[default]
    ReadWrite,
}
#[derive(Clone, Debug)]
pub struct CommandOptions {
    pub command: String,
    pub project_root: String,
    pub timeout_ms: u64,
    pub mount_mode: MountMode,
    pub network_enabled: bool,
    pub memory_limit_mb: Option<u64>,
    pub cpu_limit: Option<String>,
}
/// Captured inputs from the authorized host after image preparation. Ports and
/// gateway resolution belong to that host/node, never the gateway process cwd
/// or network. Constructing this value grants no consent or capacity reservation.
#[derive(Clone, Debug)]
pub struct BrowserLaunchInputs {
    pub novnc_port: std::num::NonZeroU16,
    pub vnc_port: std::num::NonZeroU16,
    pub cdp_port: Option<std::num::NonZeroU16>,
    pub host_gateway: Option<BrowserHostGateway>,
    /// Separate clock samples preserve the reference name/label semantics.
    pub name_time_ms: u64,
    pub created_at_ms: u64,
}
#[derive(Clone, Copy, Debug)]
pub enum BrowserHostGateway {
    HostGateway,
    Address(std::net::IpAddr),
}
impl std::fmt::Display for BrowserHostGateway {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::HostGateway => f.write_str("host-gateway"),
            Self::Address(ip) => ip.fmt(f),
        }
    }
}
#[derive(Clone, Debug)]
pub struct BrowserOptions {
    pub project_root: String,
    pub mount_mode: MountMode,
    pub network_enabled: bool,
}
impl BrowserOptions {
    pub fn new(project_root: String) -> Self {
        Self {
            project_root,
            mount_mode: MountMode::ReadOnly,
            network_enabled: true,
        }
    }
}
#[derive(Clone, Debug, Default)]
pub struct SessionLabels {
    pub session_id: Option<String>,
    pub thread_id: Option<String>,
}
#[derive(Clone, Debug)]
pub struct Invocation {
    pub argv: Vec<String>,
    pub container_name: String,
}
#[derive(Debug)]
pub struct RunResult {
    pub ok: bool,
    pub output: Utf16Text,
    pub exit_code: Option<f64>,
    pub timed_out: bool,
    pub container_name: String,
}
/// Supplied by the authorized host, using agent_sandbox_owner's canonical
/// gateway/owner/aliveness and worktree_sandbox's validated read-only Git mount.
/// `run` must enforce bounded output, timeout and cancellation/reaping. The
/// supervisor retains every submitted future through shutdown, observes errors
/// and MUST NOT drop admitted work. No callback may infer consent from a path.
pub trait Host: Send + Sync + 'static {
    fn run(&self, argv: Vec<String>, timeout_ms: u64) -> BoxFuture<'static, Result<RunnerResult>>;
    fn project_root(&self, requested: &str) -> Result<String>;
    fn mkdir_project(&self, authorized_root: &str) -> Result<()>;
    fn worktree_mount_args(&self, authorized_root: &str) -> Result<Vec<String>>;
    fn unique_suffix(&self) -> String;
    fn gateway(&self) -> String;
    fn owner(&self) -> String;
    fn owner_alive(&self, owner: &str) -> bool;
    /// Linux nonroot writable mounts: --user UID:GID and writable HOME. Other
    /// modes never request this. Resolve explicit host-user policy at bootstrap.
    fn host_user_args(&self) -> Vec<String>;
    fn supervise(&self, task: BoxFuture<'static, Result<()>>);
}
/// Fixed visual sandbox build request. The host binds kind, engine and an authorized
/// build context; the manager never chooses an ambient working directory or
/// shells out. No caller-supplied Dockerfile, image tag or build argv is accepted.
#[derive(Clone, Copy, Debug)]
pub struct BrowserImageBuild {
    runtime: ContainerRuntime,
    kind: SandboxKind,
}
impl BrowserImageBuild {
    pub fn kind(self) -> SandboxKind {
        self.kind
    }
    pub fn argv(self) -> Vec<String> {
        vec![
            self.runtime.binary().into(),
            "build".into(),
            "-t".into(),
            self.kind.image().into(),
            "-f".into(),
            "-".into(),
            ".".into(),
        ]
    }
    pub fn dockerfile(self) -> &'static str {
        self.kind.dockerfile()
    }
    pub fn timeout_ms(self) -> u64 {
        600_000
    }
}
/// Separate effect authority, deliberately not implemented by Host::run or by
/// an injected command runner. Bootstrap must bind consent, execution node,
/// engine, scoped build context and bounded output before supplying this port.
/// Implementations must cancel/reap on future drop, or hand admitted work to
/// their shutdown supervisor with the same deadline. Never use ambient spawn,
/// environment, cwd, or shell execution to implement an unbound capability.
pub trait BrowserImageAuthority: Send + Sync {
    fn build(&self, request: BrowserImageBuild) -> BoxFuture<'static, Result<RunnerResult>>;
}
/// Host-bound readiness target. HTTP probes must disable redirects, bound the
/// response/body and close/cancel sockets on drop. Only a successful HTTP status
/// (200..300) is ready; TCP readiness alone cannot substitute for HTTP readiness.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum BrowserProbe {
    Http(String),
    Tcp(std::net::SocketAddr),
}
/// Separate, scoped startup capability. Capture runs AFTER image preparation.
/// Bootstrap binds node/engine/ports/gateway and validates that the timestamp
/// name is available and owned by this attempt before authorize_launch succeeds.
/// A prefix/port match is evidence for conflict discovery, never removal consent.
/// Every future must release its resources on drop; the supervisor owns work
/// through shutdown. No production adapter or ambient network access is provided.
/// Host identity for a writable project bind. UID zero is unrepresentable.
#[derive(Clone, Copy, Debug)]
pub struct WritableMountIdentity {
    pub uid: std::num::NonZeroU32,
    pub gid: u32,
}
pub trait BrowserStartupAuthority: BrowserImageAuthority + Send + Sync + 'static {
    /// Capture the invoking node user's identity only after the host has bound
    /// this capability to that user's project. None keeps writable mode denied.
    fn writable_mount_identity(&self) -> Result<Option<WritableMountIdentity>> {
        Ok(None)
    }
    fn capture_launch_inputs(&self) -> BoxFuture<'static, Result<BrowserLaunchInputs>>;
    fn authorize_launch(&self, invocation: &Invocation) -> Result<()>;
    fn may_remove_conflict(&self, container_name: &str) -> bool;
    fn published_port_host(&self) -> BoxFuture<'static, Result<std::net::IpAddr>>;
    fn probe(&self, target: BrowserProbe, timeout_ms: u64) -> BoxFuture<'static, Result<bool>>;
}
/// Lease must remain with the session owner; dropping it schedules removal.
pub struct OwnedBrowser {
    session: OwnedSession,
    pub novnc_url: String,
    pub vnc_port: std::num::NonZeroU16,
    pub novnc_port: std::num::NonZeroU16,
    pub cdp_url: Option<String>,
}
impl OwnedBrowser {
    pub fn container_name(&self) -> &str {
        self.session.container_name()
    }
    pub async fn stop(self) -> Result<()> {
        self.session.stop().await
    }
}
#[derive(Clone)]
pub struct SandboxManager {
    host: Arc<dyn Host>,
    runtime: ContainerRuntime,
}
impl SandboxManager {
    pub fn new(host: Arc<dyn Host>, runtime: ContainerRuntime) -> Self {
        Self { host, runtime }
    }
    /// Snapshot inputs come from the authorized execution host, including its
    /// /dev/kvm availability. No build, spawn, filesystem write or consent occurs.
    /// Host::run retains process timeout/output/cancellation bounds.
    pub async fn assert_start_allowed(
        &self,
        kind: SandboxKind,
        max_setting: Option<&str>,
        kvm_available: bool,
    ) -> Result<()> {
        let (title, prefix, noun, _) = kind.description();
        if kind == SandboxKind::Windows && !kvm_available {
            return Err(error(
                "Windows sandbox disabled: /dev/kvm is not available on this host. KVM acceleration is required to run a Windows VM (dockur/windows).",
            ));
        }
        let mut argv = self.argv("info");
        argv.extend(["--format".into(), "{{.ServerVersion}}".into()]);
        let health = self.host.run(argv, 3000).await?;
        if health.timed_out || health.exit_code != Some(0.0) {
            let reason = if health.timed_out {
                "timed out".into()
            } else {
                String::from_utf16_lossy(&health.output.0)
            };
            return Err(error(format!(
                "{title} sandbox disabled: container runtime health check failed ({reason})"
            )));
        }
        let mut argv = self.argv("ps");
        argv.extend([
            "--filter".into(),
            format!("name={prefix}"),
            "--format".into(),
            "{{.Names}}".into(),
        ]);
        let list = self.host.run(argv, 3000).await?;
        if list.timed_out || list.exit_code != Some(0.0) {
            let reason = if list.timed_out {
                "timed out".into()
            } else {
                String::from_utf16_lossy(&list.output.0)
            };
            return Err(error(format!(
                "container runtime sandbox listing failed ({reason})"
            )));
        }
        let output = String::from_utf16_lossy(&list.output.0);
        let active = output
            .split('\n')
            .map(js_trim)
            .filter(|s| s.starts_with(prefix))
            .count();
        let max = kind.max_active(max_setting);
        if active as f64 >= max {
            return Err(error(format!(
                "{title} sandbox limit reached ({active} active, max {max}). Refusing to start another {noun}."
            )));
        }
        Ok(())
    }
    /// Browser startup prerequisite only: read-only admission then image
    /// inspection and, if absent, a separately authorized build. This grants no
    /// container startup authority or atomic capacity reservation.
    pub async fn prepare_browser_image(
        &self,
        max_setting: Option<&str>,
        authority: &dyn BrowserImageAuthority,
    ) -> Result<()> {
        self.prepare_browser_image_observed(max_setting, authority, None)
            .await
    }
    async fn prepare_browser_image_observed(
        &self,
        max_setting: Option<&str>,
        authority: &dyn BrowserImageAuthority,
        observer: Option<&oneshot::Sender<Result<OwnedBrowser>>>,
    ) -> Result<()> {
        self.prepare_visual_image_observed(SandboxKind::Browser, max_setting, authority, observer)
            .await
    }
    async fn prepare_visual_image_observed(
        &self,
        kind: SandboxKind,
        max_setting: Option<&str>,
        authority: &dyn BrowserImageAuthority,
        observer: Option<&oneshot::Sender<Result<OwnedBrowser>>>,
    ) -> Result<()> {
        let cancelled = || observer.is_some_and(|send| send.is_closed());
        if cancelled() {
            return Err(error("Browser startup cancelled"));
        }
        self.assert_start_allowed(kind, max_setting, false).await?;
        if cancelled() {
            return Err(error("Browser startup cancelled"));
        }
        let mut argv = self.argv("image");
        argv.extend(["inspect".into(), kind.image().into()]);
        let inspect = self.host.run(argv, 15_000).await?;
        // Preserve the reference's exit-code predicate. Real timeout adapters
        // must report a nonzero/absent exit code when killing the process.
        if inspect.exit_code == Some(0.0) {
            return Ok(());
        }
        if cancelled() {
            return Err(error("Browser startup cancelled"));
        }
        let built = authority
            .build(BrowserImageBuild {
                runtime: self.runtime,
                kind,
            })
            .await?;
        if built.exit_code != Some(0.0) {
            return Err(error(format!(
                "Failed to build sandbox {} image: {}",
                match kind {
                    SandboxKind::Browser => "browser",
                    SandboxKind::LinuxDesktop => "Linux desktop",
                    SandboxKind::Windows => "Windows",
                },
                String::from_utf16_lossy(&built.output.0)
            )));
        }
        Ok(())
    }
    /// Supervised browser startup. Admission/image precede captured host inputs
    /// and mounts; effects stay sequential. A cancelled waiter cannot abandon a
    /// late run, retry or readiness failure. Writable mounts require an explicit
    /// nonzero host UID/GID and isolated writable HOME; adapters remain opt-in.
    pub async fn start_browser_sandbox(
        &self,
        options: BrowserOptions,
        max_setting: Option<String>,
        wait_for_cdp: bool,
        authority: Arc<dyn BrowserStartupAuthority>,
    ) -> Result<OwnedBrowser> {
        self.start_visual_sandbox(
            SandboxKind::Browser,
            options,
            None,
            max_setting,
            wait_for_cdp,
            authority,
        )
        .await
    }
    /// Shares admission, startup ownership, retry and readiness with browser
    /// startup; only the recipe and launch arguments differ.
    pub async fn start_linux_desktop_sandbox(
        &self,
        options: BrowserOptions,
        screen_res: Option<String>,
        max_setting: Option<String>,
        wait_for_cdp: bool,
        authority: Arc<dyn BrowserStartupAuthority>,
    ) -> Result<OwnedBrowser> {
        self.start_visual_sandbox(
            SandboxKind::LinuxDesktop,
            options,
            screen_res,
            max_setting,
            wait_for_cdp,
            authority,
        )
        .await
    }
    async fn start_visual_sandbox(
        &self,
        kind: SandboxKind,
        options: BrowserOptions,
        screen_res: Option<String>,
        max_setting: Option<String>,
        wait_for_cdp: bool,
        authority: Arc<dyn BrowserStartupAuthority>,
    ) -> Result<OwnedBrowser> {
        let writable_identity = if options.mount_mode == MountMode::ReadWrite {
            Some(authority.writable_mount_identity()?.ok_or_else(|| {
                error("Writable browser startup requires a reviewed host UID/HOME policy")
            })?)
        } else {
            None
        };
        let (mut send, receive) = oneshot::channel();
        let manager = self.clone();
        self.host.supervise(Box::pin(async move {
            let startup = async {
                manager
                    .prepare_visual_image_observed(
                        kind,
                        max_setting.as_deref(),
                        authority.as_ref(),
                        Some(&send),
                    )
                    .await?;
                if send.is_closed() {
                    return Err(error("Browser startup cancelled"));
                }
                let inputs = authority.capture_launch_inputs().await?;
                if send.is_closed() {
                    return Err(error("Browser startup cancelled"));
                }
                let mut invocation = manager.visual_launch_invocation(
                    kind,
                    &options,
                    &inputs,
                    screen_res.as_deref(),
                )?;
                if let Some(identity) = writable_identity {
                    Self::apply_writable_identity(&mut invocation, kind, identity);
                }
                authority.authorize_launch(&invocation)?;
                // Own the name before the first engine submission: even failed
                // commands can have created a container before losing their reply.
                let lease = OwnedSession {
                    manager: manager.clone(),
                    container_name: invocation.container_name.clone(),
                    project_root: options.project_root.clone(),
                };
                let mut result = manager.host.run(invocation.argv.clone(), 30_000).await?;
                if send.is_closed() {
                    return Err(error("Browser startup cancelled"));
                }
                if result.exit_code != Some(0.0) && Self::is_port_bind_conflict(&result.output) {
                    manager
                        .cleanup_browser_conflicts(kind, &inputs, authority.as_ref(), &send)
                        .await?;
                    if send.is_closed() {
                        return Err(error("Browser startup cancelled"));
                    }
                    result = manager.host.run(invocation.argv, 30_000).await?;
                }
                if result.exit_code != Some(0.0) || result.timed_out {
                    return Err(error(format!(
                        "Failed to start sandbox {}: {}",
                        match kind {
                            SandboxKind::Browser => "browser",
                            _ => "Linux desktop",
                        },
                        String::from_utf16_lossy(&result.output.0)
                    )));
                }
                let readiness = async {
                    let host = authority.published_port_host().await?;
                    let endpoint = |port, path| {
                        format!("http://{}{path}", std::net::SocketAddr::new(host, port))
                    };
                    let novnc_url = endpoint(inputs.novnc_port.get(), "/vnc_lite.html");
                    Self::wait_browser_ready(
                        authority.as_ref(),
                        BrowserProbe::Http(novnc_url.clone()),
                    )
                    .await?;
                    if let Some(port) = inputs.cdp_port.filter(|_| wait_for_cdp) {
                        Self::wait_browser_ready(
                            authority.as_ref(),
                            BrowserProbe::Tcp(std::net::SocketAddr::new(host, port.get())),
                        )
                        .await?;
                        Self::wait_browser_ready(
                            authority.as_ref(),
                            BrowserProbe::Http(endpoint(port.get(), "/json/version")),
                        )
                        .await?;
                    }
                    Ok(OwnedBrowser {
                        session: lease,
                        novnc_url,
                        vnc_port: inputs.vnc_port,
                        novnc_port: inputs.novnc_port,
                        cdp_url: inputs.cdp_port.map(|p| endpoint(p.get(), "")),
                    })
                };
                tokio::select! {
                    biased;
                    _ = send.closed() => Err(error("Browser startup cancelled")),
                    result = readiness => result,
                }
            }
            .await;
            // Failed ownership transfer drops the lease and schedules cleanup.
            let _ = send.send(startup);
            Ok(())
        }));
        receive
            .await
            .map_err(|_| error("Sandbox supervisor ended before browser ownership transfer"))?
    }
    fn is_port_bind_conflict(output: &Utf16Text) -> bool {
        let output = String::from_utf16_lossy(&output.0);
        regex::Regex::new(
            "(?i)port is already allocated|address already in use|Bind for [^\\r\\n]* failed",
        )
        .expect("static bind conflict expression")
        .is_match(&output)
    }
    async fn cleanup_browser_conflicts(
        &self,
        kind: SandboxKind,
        inputs: &BrowserLaunchInputs,
        authority: &dyn BrowserStartupAuthority,
        observer: &oneshot::Sender<Result<OwnedBrowser>>,
    ) -> Result<()> {
        let mut argv = self.argv("ps");
        argv.extend(["--format".into(), "{{.Names}}\t{{.Ports}}".into()]);
        let list = self.host.run(argv, 15_000).await?;
        if list.exit_code != Some(0.0) || list.timed_out {
            return Ok(());
        }
        let ports: Vec<_> = [
            Some(inputs.novnc_port),
            Some(inputs.vnc_port),
            inputs.cdp_port,
        ]
        .into_iter()
        .flatten()
        .map(|p| regex::Regex::new(&format!("(^|[,: ]){}->", p)).expect("typed port expression"))
        .collect();
        for line in String::from_utf16_lossy(&list.output.0).split('\n') {
            if observer.is_closed() {
                return Err(error("Browser startup cancelled"));
            }
            let mut fields = js_trim(line).split('\t');
            let name = js_trim(fields.next().unwrap_or(""));
            let port_info = fields.next().unwrap_or("");
            if !name.starts_with(kind.description().1)
                || Self::validate_container(name).is_err()
                || !ports.iter().any(|p| p.is_match(port_info))
                || !authority.may_remove_conflict(name)
            {
                continue;
            }
            // Removal failures do not suppress the reference's one retry.
            let _ = self.stop_container(name).await;
        }
        Ok(())
    }
    async fn wait_browser_ready(
        authority: &dyn BrowserStartupAuthority,
        target: BrowserProbe,
    ) -> Result<()> {
        use tokio::time::{Duration, Instant, sleep, timeout_at};
        let deadline = Instant::now() + Duration::from_millis(15_000);
        while Instant::now() < deadline {
            let now = Instant::now();
            let until = deadline.min(now + Duration::from_millis(5_000));
            let attempt = until.saturating_duration_since(now);
            if matches!(
                timeout_at(
                    until,
                    authority.probe(target.clone(), attempt.as_millis() as u64)
                )
                .await,
                Ok(Ok(true))
            ) {
                return Ok(());
            }
            sleep(
                Duration::from_millis(200).min(deadline.saturating_duration_since(Instant::now())),
            )
            .await;
        }
        Err(error(match target {
            BrowserProbe::Http(url) => {
                format!("HTTP endpoint {url} did not become ready within 15000ms")
            }
            BrowserProbe::Tcp(address) => format!(
                "Port {} on {} did not become ready within 15000ms",
                address.port(),
                address.ip()
            ),
        }))
    }
    fn argv(&self, operation: &str) -> Vec<String> {
        vec![self.runtime.binary().into(), operation.into()]
    }
    fn validate_container(name: &str) -> Result<String> {
        let name = js_trim(name);
        if name.is_empty()
            || name.len() > 255
            || !name.as_bytes()[0].is_ascii_alphanumeric()
            || !name
                .bytes()
                .all(|c| c.is_ascii_alphanumeric() || b"_.-".contains(&c))
        {
            return Err(error("Invalid sandbox container name"));
        }
        Ok(name.into())
    }
    /// Construct only; no engine startup, port allocation, gateway probe or
    /// readiness request. The lifecycle must first prepare_browser_image and
    /// obtain these inputs through the authorized host. The public invocation
    /// is reviewable command data and must never be treated as effect authority.
    pub fn browser_launch_invocation(
        &self,
        options: &BrowserOptions,
        inputs: &BrowserLaunchInputs,
    ) -> Result<Invocation> {
        self.visual_launch_invocation(SandboxKind::Browser, options, inputs, None)
    }
    pub fn linux_desktop_launch_invocation(
        &self,
        options: &BrowserOptions,
        inputs: &BrowserLaunchInputs,
        screen_res: Option<&str>,
    ) -> Result<Invocation> {
        self.visual_launch_invocation(SandboxKind::LinuxDesktop, options, inputs, screen_res)
    }
    fn visual_launch_invocation(
        &self,
        kind: SandboxKind,
        options: &BrowserOptions,
        inputs: &BrowserLaunchInputs,
        screen_res: Option<&str>,
    ) -> Result<Invocation> {
        if screen_res.is_some_and(|v| v.len() > 64 || v.contains(['\0', '\n', '\r'])) {
            return Err(error("Invalid desktop screen resolution"));
        }
        let root = self.authorized_project(&options.project_root)?;
        let mut tick = inputs.name_time_ms;
        let mut digits = Vec::new();
        loop {
            digits.push(b"0123456789abcdefghijklmnopqrstuvwxyz"[(tick % 36) as usize] as char);
            tick /= 36;
            if tick == 0 {
                break;
            }
        }
        let suffix: String = digits.into_iter().rev().collect();
        let name = format!("{}{suffix}", kind.description().1);
        let mut cmd = self.argv("run");
        cmd.extend([
            "-d".into(),
            "--rm".into(),
            "--name".into(),
            name.clone(),
            "--label".into(),
            format!(
                "jait.kind={}",
                match kind {
                    SandboxKind::Browser => "browser-sandbox",
                    _ => "linux-desktop-sandbox",
                }
            ),
            "--label".into(),
            format!("jait.createdAt={}", inputs.created_at_ms),
        ]);
        if kind == SandboxKind::LinuxDesktop {
            cmd.extend(["--shm-size".into(), "1gb".into()]);
        }
        if !options.network_enabled {
            cmd.extend(["--network".into(), "none".into()]);
        }
        if let Some(gateway) = inputs.host_gateway {
            cmd.extend([
                "--add-host".into(),
                format!("host.docker.internal:{gateway}"),
            ]);
        }
        cmd.extend(self.mount_args(&root, options.mount_mode));
        if let Some(res) = screen_res.filter(|v| !v.is_empty()) {
            cmd.extend(["-e".into(), format!("SCREEN_RES={res}")]);
        }
        cmd.extend([
            "-p".into(),
            format!("{}:6080", inputs.novnc_port),
            "-p".into(),
            format!("{}:5900", inputs.vnc_port),
        ]);
        if let Some(port) = inputs.cdp_port {
            cmd.extend(["-p".into(), format!("{port}:9223")]);
        }
        cmd.push(kind.image().into());
        Ok(Invocation {
            argv: cmd,
            container_name: name,
        })
    }
    /// Identity is serialized as argv only; no shell, passwd edits or root
    /// container setup runs against a writable host mount. Tmpfs supplies an
    /// isolated writable HOME owned by the invoking UID/GID.
    fn apply_writable_identity(
        invocation: &mut Invocation,
        kind: SandboxKind,
        identity: WritableMountIdentity,
    ) {
        let mut args = vec![
            "--user".into(),
            format!("{}:{}", identity.uid, identity.gid),
            "--env".into(),
            "HOME=/home/jait".into(),
            "--tmpfs".into(),
            format!(
                "/home/jait:rw,nosuid,nodev,uid={},gid={},mode=0700",
                identity.uid, identity.gid
            ),
        ];
        if kind == SandboxKind::LinuxDesktop {
            args.extend([
                "--tmpfs".into(),
                format!(
                    "/run/dbus:rw,nosuid,nodev,uid={},gid={},mode=0755",
                    identity.uid, identity.gid
                ),
            ]);
        }
        let image_index = invocation.argv.len() - 1;
        invocation.argv.splice(image_index..image_index, args);
    }
    fn project(&self, options: &CommandOptions) -> Result<String> {
        self.authorized_project(&options.project_root)
    }
    fn authorized_project(&self, requested: &str) -> Result<String> {
        let root = self.host.project_root(requested)?;
        // Docker -v uses ':' as a separator. Refuse ambiguous mount syntax.
        if !std::path::Path::new(&root).is_absolute() || root.contains([':', '\0', '\n', '\r']) {
            return Err(error("Invalid authorized sandbox project root"));
        }
        self.host.mkdir_project(&root)?;
        Ok(root)
    }
    fn mount_args(&self, root: &str, mode: MountMode) -> Vec<String> {
        match mode {
            MountMode::None => vec![],
            MountMode::ReadOnly => vec!["-v".into(), format!("{root}:/project:ro")],
            MountMode::ReadWrite => vec!["-v".into(), format!("{root}:/project")],
        }
    }
    fn invocation(
        &self,
        options: &CommandOptions,
        labels: Option<&SessionLabels>,
    ) -> Result<(Invocation, String)> {
        let root = self.project(options)?;
        let prefix = if labels.is_some() {
            "jait-agent-sb-"
        } else {
            "jait-sb-"
        };
        let name = Self::validate_container(&format!("{prefix}{}", self.host.unique_suffix()))?;
        let mut cmd = self.argv("run");
        if labels.is_some() {
            cmd.push("-d".into());
        }
        cmd.extend(["--rm".into(), "--name".into(), name.clone()]);
        if let Some(labels) = labels {
            cmd.extend([
                "--label".into(),
                "dev.jait.kind=agent".into(),
                "--label".into(),
                format!("dev.jait.gateway={}", self.host.gateway()),
                "--label".into(),
                format!("dev.jait.owner={}", self.host.owner()),
            ]);
            for (key, value) in [
                ("session", &labels.session_id),
                ("thread", &labels.thread_id),
            ] {
                if let Some(value) = value.as_ref().filter(|v| !v.is_empty()) {
                    cmd.extend(["--label".into(), format!("dev.jait.{key}={value}")]);
                }
            }
        }
        if !options.network_enabled {
            cmd.extend(["--network".into(), "none".into()]);
        }
        if let Some(memory) = options.memory_limit_mb.filter(|n| *n > 0) {
            cmd.extend(["--memory".into(), format!("{memory}m")]);
        }
        if let Some(cpu) = options.cpu_limit.as_ref().filter(|s| !s.is_empty()) {
            cmd.extend(["--cpus".into(), cpu.clone()]);
        }
        cmd.extend(self.mount_args(&root, options.mount_mode));
        if labels.is_some() {
            cmd.extend(self.host.worktree_mount_args(&root)?);
        }
        if options.mount_mode == MountMode::ReadWrite {
            cmd.extend(self.host.host_user_args());
        }
        cmd.extend(["-w".into(), "/project".into(), "jait/sandbox:latest".into()]);
        if labels.is_some() {
            cmd.extend(["tail".into(), "-f".into(), "/dev/null".into()]);
        } else {
            cmd.extend(["bash".into(), "-lc".into(), options.command.clone()]);
        }
        Ok((
            Invocation {
                argv: cmd,
                container_name: name,
            },
            root,
        ))
    }
    pub fn command_invocation(&self, options: &CommandOptions) -> Result<Invocation> {
        Ok(self.invocation(options, None)?.0)
    }
    pub fn exec_invocation(
        &self,
        container: &str,
        command: &str,
        cwd: Option<&str>,
        env: &[(String, String)],
    ) -> Result<Invocation> {
        let name = Self::validate_container(container)?;
        let mut argv = self.argv("exec");
        if let Some(cwd) = cwd.filter(|v| !v.is_empty()) {
            argv.extend(["-w".into(), cwd.into()]);
        }
        for (key, value) in env {
            argv.extend(["--env".into(), format!("{key}={value}")]);
        }
        argv.extend([name.clone(), "bash".into(), "-lc".into(), command.into()]);
        Ok(Invocation {
            argv,
            container_name: name,
        })
    }
    async fn execute(&self, invocation: Invocation, timeout_ms: u64) -> Result<RunResult> {
        let result = self.host.run(invocation.argv, timeout_ms.max(1000)).await?;
        Ok(RunResult {
            ok: !result.timed_out && result.exit_code == Some(0.0),
            output: result.output,
            exit_code: result.exit_code,
            timed_out: result.timed_out,
            container_name: invocation.container_name,
        })
    }
    pub async fn run_command(&self, options: &CommandOptions) -> Result<RunResult> {
        self.execute(self.command_invocation(options)?, options.timeout_ms)
            .await
    }
    pub async fn exec_in_container(
        &self,
        name: &str,
        command: &str,
        timeout_ms: u64,
    ) -> Result<RunResult> {
        self.execute(
            self.exec_invocation(name, command, Some("/project"), &[])?,
            timeout_ms,
        )
        .await
    }
    pub async fn exec_shell(
        &self,
        name: &str,
        command: &str,
        cwd: Option<&str>,
        env: &[(String, String)],
        timeout_ms: Option<u64>,
    ) -> Result<RunResult> {
        self.execute(
            self.exec_invocation(name, command, cwd, env)?,
            timeout_ms.unwrap_or(30_000),
        )
        .await
    }
    /// Run under the host supervisor until ownership transfers to the caller.
    /// A dropped start waiter cannot strand a container after a late success.
    pub async fn start_command_sandbox(
        &self,
        options: &CommandOptions,
        labels: &SessionLabels,
    ) -> Result<OwnedSession> {
        let (invocation, project_root) = self.invocation(options, Some(labels))?;
        let (send, receive) = oneshot::channel();
        let manager = self.clone();
        self.host.supervise(Box::pin(async move {
            let name = invocation.container_name;
            let result = manager.host.run(invocation.argv, 30_000).await;
            let started = match result {
                Ok(result) if result.exit_code == Some(0.0) && !result.timed_out => {
                    Ok(OwnedSession {
                        manager: manager.clone(),
                        container_name: name,
                        project_root,
                    })
                }
                other => {
                    // A timed out/failed runtime may already have created its named
                    // container. Cleanup is owned even if the observer disappeared.
                    manager.stop_container(&name).await?;
                    Err(match other {
                        Err(e) => e,
                        Ok(result) => error(format!(
                            "Failed to start command sandbox: {}",
                            String::from_utf16_lossy(&result.output.0)
                        )),
                    })
                }
            };
            // Failed send drops an OwnedSession, which schedules owned cleanup.
            let _ = send.send(started);
            Ok(())
        }));
        receive
            .await
            .map_err(|_| error("Sandbox supervisor ended before ownership transfer"))?
    }
    pub async fn stop_container(&self, container: &str) -> Result<()> {
        if js_trim(container).is_empty() {
            return Ok(());
        }
        let name = Self::validate_container(container)?;
        let result = self
            .host
            .run(
                vec![
                    self.runtime.binary().into(),
                    "rm".into(),
                    "-f".into(),
                    name.clone(),
                ],
                15_000,
            )
            .await?;
        let output = String::from_utf16_lossy(&result.output.0);
        if (result.exit_code != Some(0.0) || result.timed_out)
            && !output.to_ascii_lowercase().contains("no such container")
        {
            return Err(error(format!("Failed to stop sandbox {name}: {output}")));
        }
        Ok(())
    }
    pub async fn is_command_sandbox_idle(&self, name: &str) -> Result<bool> {
        let name = Self::validate_container(name)?;
        let result = self
            .host
            .run(
                vec![
                    self.runtime.binary().into(),
                    "top".into(),
                    name,
                    "-eo".into(),
                    "pid,args".into(),
                ],
                5000,
            )
            .await?;
        if result.exit_code != Some(0.0) || result.timed_out {
            return Ok(false);
        }
        let output = String::from_utf16_lossy(&result.output.0);
        let lines: Vec<_> = js_trim(&output).split('\n').collect();
        if lines.len() != 2 {
            return Ok(false);
        }
        fn columns(line: &str) -> Option<(&str, &str)> {
            let line = js_trim(line);
            let end = line.find(crate::text::js_whitespace)?;
            Some((
                &line[..end],
                line[end..].trim_start_matches(crate::text::js_whitespace),
            ))
        }
        let Some((header, title)) = columns(lines[0]) else {
            return Ok(false);
        };
        let Some((pid, command)) = columns(lines[1]) else {
            return Ok(false);
        };
        Ok(header == "PID"
            && matches!(title, "COMMAND" | "ARGS")
            && !pid.is_empty()
            && pid.bytes().all(|c| c.is_ascii_digit())
            && command == "tail -f /dev/null")
    }
    pub async fn cleanup_orphaned_command_sandboxes(&self) -> Result<Vec<String>> {
        let result = self
            .host
            .run(
                vec![
                    self.runtime.binary().into(),
                    "ps".into(),
                    "--filter".into(),
                    "label=dev.jait.kind=agent".into(),
                    "--filter".into(),
                    format!("label=dev.jait.gateway={}", self.host.gateway()),
                    "--format".into(),
                    "{\"name\":{{json .Names}},\"owner\":{{json (.Label \"dev.jait.owner\")}}}"
                        .into(),
                ],
                15_000,
            )
            .await?;
        if result.exit_code != Some(0.0) || result.timed_out {
            return Ok(vec![]);
        }
        let mut removed = vec![];
        for line in String::from_utf16_lossy(&result.output.0).split('\n') {
            let Ok(row) = serde_json::from_str::<serde_json::Value>(line) else {
                continue;
            };
            let (Some(name), Some(owner)) = (
                row.get("name").and_then(|v| v.as_str()),
                row.get("owner").and_then(|v| v.as_str()),
            ) else {
                continue;
            };
            if !name.strip_prefix("jait-agent-sb-").is_some_and(|suffix| {
                !suffix.is_empty()
                    && suffix
                        .bytes()
                        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'-')
            }) || owner.is_empty()
                || self.host.owner_alive(owner)
            {
                continue;
            }
            if self.is_command_sandbox_idle(name).await.unwrap_or(false)
                && self.stop_container(name).await.is_ok()
            {
                removed.push(name.into());
            }
        }
        Ok(removed)
    }
    /// Reuses the canonical native process engine and shared admission counter.
    pub fn start_background_command(
        &self,
        options: &CommandOptions,
        runtime: &Runtime,
        admission: &Admission,
    ) -> Result<Arc<BackgroundProcess>> {
        let invocation = self.command_invocation(options)?;
        BackgroundProcess::start(
            runtime.clone(),
            admission,
            &invocation.argv,
            invocation.container_name,
            options.timeout_ms as f64,
            true,
        )
    }
}
/// The caller retains this lease in its session owner; drop schedules cleanup.
/// Explicit stop retries on drop if its waiter is cancelled or removal fails.
pub struct OwnedSession {
    manager: SandboxManager,
    container_name: String,
    project_root: String,
}
impl OwnedSession {
    pub fn container_name(&self) -> &str {
        &self.container_name
    }
    pub fn project_root(&self) -> &str {
        &self.project_root
    }
    pub async fn stop(mut self) -> Result<()> {
        self.manager.stop_container(&self.container_name).await?;
        self.container_name.clear();
        Ok(())
    }
    pub fn sandbox_project_root(&self) -> &'static str {
        "/project"
    }
}
impl Drop for OwnedSession {
    fn drop(&mut self) {
        if self.container_name.is_empty() {
            return;
        }
        let manager = self.manager.clone();
        let name = std::mem::take(&mut self.container_name);
        self.manager
            .host
            .supervise(Box::pin(async move { manager.stop_container(&name).await }));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{Value, json};
    use std::{
        collections::VecDeque,
        sync::{
            Mutex,
            atomic::{AtomicBool, Ordering},
        },
    };
    use tokio::{sync::Notify, task::JoinHandle};
    #[derive(Default)]
    struct Fixture {
        calls: Mutex<Vec<Value>>,
        project_effects: Mutex<Vec<String>>,
        replies: Mutex<VecDeque<Value>>,
        tasks: Mutex<Vec<JoinHandle<Result<()>>>>,
        denied: AtomicBool,
        delayed: AtomicBool,
        release: Notify,
    }
    fn reply(value: &Value) -> Result<RunnerResult> {
        if let Some(message) = value.get("error").and_then(Value::as_str) {
            return Err(error(message));
        }
        Ok(RunnerResult {
            output: Utf16Text(
                value["output"]
                    .as_str()
                    .unwrap_or("")
                    .encode_utf16()
                    .collect(),
            ),
            exit_code: value.get("exitCode").map_or(Some(0.0), Value::as_f64),
            timed_out: value["timedOut"].as_bool().unwrap_or(false),
        })
    }
    impl Host for Fixture {
        fn run(&self, argv: Vec<String>, timeout: u64) -> BoxFuture<'static, Result<RunnerResult>> {
            self.calls.lock().unwrap().push(json!([argv, timeout]));
            let result = reply(
                &self
                    .replies
                    .lock()
                    .unwrap()
                    .pop_front()
                    .unwrap_or(json!({})),
            );
            Box::pin(async move { result })
        }
        fn project_root(&self, root: &str) -> Result<String> {
            if self.denied.load(Ordering::SeqCst) {
                return Err(error("project denied"));
            }
            Ok(root.into())
        }
        fn mkdir_project(&self, root: &str) -> Result<()> {
            self.project_effects.lock().unwrap().push(root.into());
            Ok(())
        }
        fn worktree_mount_args(&self, _: &str) -> Result<Vec<String>> {
            Ok(vec!["-v".into(), "/fixture/git:/fixture/git:ro".into()])
        }
        fn unique_suffix(&self) -> String {
            "fixture-1".into()
        }
        fn gateway(&self) -> String {
            "fixture-gateway".into()
        }
        fn owner(&self) -> String {
            "fixture-owner".into()
        }
        fn owner_alive(&self, owner: &str) -> bool {
            owner != "dead"
        }
        fn host_user_args(&self) -> Vec<String> {
            vec![
                "--user".into(),
                "1001:1002".into(),
                "-e".into(),
                "HOME=/fixture/home".into(),
            ]
        }
        fn supervise(&self, task: BoxFuture<'static, Result<()>>) {
            self.tasks.lock().unwrap().push(tokio::spawn(task));
        }
    }
    #[test]
    fn sandbox_browser_launch_vectors() {
        use std::num::NonZeroU16;
        let mut records = vec![];
        for (mode_name, mode) in [
            ("none", MountMode::None),
            ("read-only", MountMode::ReadOnly),
            ("read-write", MountMode::ReadWrite),
        ] {
            for network in [false, true] {
                for cdp in [None, NonZeroU16::new(65535)] {
                    for gateway in [None, Some(BrowserHostGateway::HostGateway)] {
                        for runtime in [ContainerRuntime::Docker, ContainerRuntime::Podman] {
                            for (tick, suffix) in [
                                (0, "0"),
                                (35, "z"),
                                (36, "10"),
                                (1_793_030_400_000, "mvpg0740"),
                            ] {
                                let host = Arc::new(Fixture::default());
                                let manager = SandboxManager::new(host.clone(), runtime);
                                let mut options =
                                    BrowserOptions::new("/fixture/project space-ü".into());
                                assert_eq!(options.mount_mode, MountMode::ReadOnly);
                                assert!(options.network_enabled);
                                options.mount_mode = mode;
                                options.network_enabled = network;
                                let inputs = BrowserLaunchInputs {
                                    novnc_port: NonZeroU16::new(1).unwrap(),
                                    vnc_port: NonZeroU16::new(5901).unwrap(),
                                    cdp_port: cdp,
                                    host_gateway: gateway,
                                    name_time_ms: tick,
                                    created_at_ms: tick + 1,
                                };
                                let result = manager
                                    .browser_launch_invocation(&options, &inputs)
                                    .unwrap();
                                assert_eq!(
                                    result.container_name,
                                    format!("jait-browser-sb-{suffix}")
                                );
                                assert_eq!(result.argv[0], runtime.binary());
                                assert_eq!(
                                    result.argv.windows(2).any(|a| a == ["--network", "none"]),
                                    !network
                                );
                                let mount = result
                                    .argv
                                    .windows(2)
                                    .find(|a| a[0] == "-v")
                                    .map(|a| a[1].clone());
                                match mode {
                                    MountMode::None => assert!(mount.is_none()),
                                    MountMode::ReadOnly => assert_eq!(
                                        mount.as_deref(),
                                        Some("/fixture/project space-ü:/project:ro")
                                    ),
                                    MountMode::ReadWrite => assert_eq!(
                                        mount.as_deref(),
                                        Some("/fixture/project space-ü:/project")
                                    ),
                                }
                                assert_eq!(
                                    result.argv.iter().any(|a| a == "65535:9223"),
                                    cdp.is_some()
                                );

                                assert_eq!(
                                    result.argv.last().unwrap(),
                                    "jait/sandbox-browser:recovery-v3"
                                );
                                assert_eq!(
                                    *host.project_effects.lock().unwrap(),
                                    vec![options.project_root.clone()]
                                );
                                assert!(host.calls.lock().unwrap().is_empty());
                                assert!(
                                    !result
                                        .argv
                                        .iter()
                                        .any(|a| a == "--user" || a.contains("/fixture/git"))
                                );
                                records.push(json!({"case":{"mode":mode_name,"network":network,"cdp":cdp.map(|v|v.get()),"gateway":gateway.is_some(),"tick":tick,"createdAt":tick+1,"project":options.project_root},"argv":result.argv,"name":result.container_name}));
                            }
                        }
                    }
                }
            }
        }
        assert_eq!(records.len(), 192);
        if std::env::var_os("JAIT_WRITE_NATIVE_VECTORS").is_some() {
            let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../.jait/artifacts/gateway-rust/sandbox-manager-20261026/native-browser-launch-vectors.json");
            std::fs::write(path, serde_json::to_string_pretty(&records).unwrap()).unwrap();
        }
    }
    #[test]
    fn sandbox_browser_launch_scope_guards() {
        use std::num::NonZeroU16;
        let host = Arc::new(Fixture::default());
        let manager = SandboxManager::new(host.clone(), ContainerRuntime::Docker);
        let mut inputs = BrowserLaunchInputs {
            novnc_port: NonZeroU16::new(6080).unwrap(),
            vnc_port: NonZeroU16::new(5900).unwrap(),
            cdp_port: None,
            host_gateway: None,
            name_time_ms: 0,
            created_at_ms: 1,
        };
        for root in [
            "relative",
            "/root:escape",
            "/root\0bad",
            "/root\nbad",
            "/root\rbad",
        ] {
            let error = manager
                .browser_launch_invocation(&BrowserOptions::new(root.into()), &inputs)
                .unwrap_err();
            assert!(
                matches!(error, HostError::Error(message) if message == "Invalid authorized sandbox project root")
            );
        }
        host.denied.store(true, Ordering::SeqCst);
        assert!(
            matches!(manager.browser_launch_invocation(&BrowserOptions::new("/denied".into()), &inputs), Err(HostError::Error(message)) if message == "project denied")
        );
        assert!(host.project_effects.lock().unwrap().is_empty());
        assert!(host.calls.lock().unwrap().is_empty());
        host.denied.store(false, Ordering::SeqCst);
        for ip in ["192.0.2.1", "2001:db8::1"] {
            inputs.host_gateway = Some(BrowserHostGateway::Address(ip.parse().unwrap()));
            let plan = manager
                .browser_launch_invocation(&BrowserOptions::new("/project".into()), &inputs)
                .unwrap();
            assert!(
                plan.argv
                    .windows(2)
                    .any(|a| a == ["--add-host", &format!("host.docker.internal:{ip}")])
            );
        }
        assert!(NonZeroU16::new(0).is_none());
    }
    struct BuildFixture {
        calls: Mutex<Vec<Value>>,
        response: Value,
    }
    impl BrowserImageAuthority for BuildFixture {
        fn build(&self, request: BrowserImageBuild) -> BoxFuture<'static, Result<RunnerResult>> {
            self.calls.lock().unwrap().push(json!({
                "argv":request.argv(), "timeout":request.timeout_ms(), "input":request.dockerfile()
            }));
            let result = reply(&self.response);
            Box::pin(async move { result })
        }
    }
    #[tokio::test]
    async fn sandbox_browser_image_native_vectors() {
        let cases = vec![
            json!({"id":"health-denied","replies":[{"error":"engine denied"}],"error":"engine denied","calls":1}),
            json!({"id":"capacity","replies":[{}, {"output":"jait-browser-sb-a\njait-browser-sb-b"}],
                "error":"Browser sandbox limit reached (2 active, max 2). Refusing to start another preview browser.","calls":2}),
            json!({"id":"listing-denied","replies":[{}, {"error":"list denied"}],"error":"list denied","calls":2}),
            json!({"id":"inspect-denied","replies":[{}, {}, {"error":"inspect denied"}],"error":"inspect denied","calls":3}),
            json!({"id":"present","replies":[{}, {}, {}],"calls":3}),
            json!({"id":"present-podman","podman":true,"replies":[{}, {}, {}],"calls":3}),
            json!({"id":"inspect-exit-predicate","replies":[{}, {}, {"timedOut":true}],"calls":3}),
            json!({"id":"missing-build-ok","replies":[{}, {}, {"exitCode":1}],"build":{},"calls":3}),
            json!({"id":"missing-build-podman","podman":true,"replies":[{}, {}, {"exitCode":1}],"build":{},"calls":3}),
            json!({"id":"inspect-timeout-build-failure","replies":[{}, {}, {"timedOut":true,"exitCode":null}],
                "build":{"output":"build failed","exitCode":2},"error":"Failed to build sandbox browser image: build failed","calls":3}),
            json!({"id":"build-timeout","replies":[{}, {}, {"exitCode":1}],
                "build":{"output":"deadline","exitCode":null,"timedOut":true},"error":"Failed to build sandbox browser image: deadline","calls":3}),
            json!({"id":"build-denied","replies":[{}, {}, {"exitCode":1}],
                "build":{"error":"build denied"},"error":"build denied","calls":3}),
            json!({"id":"build-exit-predicate","replies":[{}, {}, {"exitCode":1}],"build":{"timedOut":true},"calls":3}),
        ];
        let mut records = vec![];
        for case in cases {
            let host = Arc::new(Fixture::default());
            *host.replies.lock().unwrap() = case["replies"]
                .as_array()
                .unwrap()
                .iter()
                .cloned()
                .collect();
            let authority = BuildFixture {
                calls: Mutex::new(vec![]),
                response: case["build"].clone(),
            };
            let binary = if case["podman"] == true {
                "podman"
            } else {
                "docker"
            };
            let runtime = if binary == "podman" {
                ContainerRuntime::Podman
            } else {
                ContainerRuntime::Docker
            };
            let manager = SandboxManager::new(host.clone(), runtime);
            let outcome = match manager.prepare_browser_image(None, &authority).await {
                Ok(()) => json!({"value":null}),
                Err(HostError::Error(e)) => json!({"error":e}),
                Err(e) => panic!("unexpected host error: {e:?}"),
            };
            let expected = case["error"]
                .as_str()
                .map_or(json!({"value":null}), |e| json!({"error":e}));
            assert_eq!(outcome, expected, "{}", case["id"]);
            let calls = host.calls.lock().unwrap().clone();
            assert_eq!(
                calls.len(),
                case["calls"].as_u64().unwrap() as usize,
                "{}",
                case["id"]
            );
            let expected_calls = [
                json!([[binary, "info", "--format", "{{.ServerVersion}}"], 3000]),
                json!([
                    [
                        binary,
                        "ps",
                        "--filter",
                        "name=jait-browser-sb-",
                        "--format",
                        "{{.Names}}"
                    ],
                    3000
                ]),
                json!([
                    [
                        binary,
                        "image",
                        "inspect",
                        "jait/sandbox-browser:recovery-v3"
                    ],
                    15000
                ]),
            ];
            assert_eq!(calls, expected_calls[..calls.len()]);
            let builds = authority.calls.lock().unwrap().clone();
            assert_eq!(
                builds.len(),
                usize::from(case.get("build").is_some()),
                "{}",
                case["id"]
            );
            for build in &builds {
                assert_eq!(
                    build["argv"],
                    json!([
                        binary,
                        "build",
                        "-t",
                        "jait/sandbox-browser:recovery-v3",
                        "-f",
                        "-",
                        "."
                    ])
                );
                assert_eq!(build["timeout"], 600000);
                assert!(
                    build["input"]
                        .as_str()
                        .unwrap()
                        .starts_with("FROM debian:bookworm-slim\n")
                );
            }
            records.push(json!({"case":case,"calls":calls,"builds":builds,"outcome":outcome}));
        }
        if std::env::var_os("JAIT_SANDBOX_EMIT_VECTORS").is_some() {
            let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../.jait/artifacts/gateway-rust/sandbox-manager-20261026/native-browser-image-vectors.json");
            std::fs::write(path, serde_json::to_vec_pretty(&records).unwrap()).unwrap();
        }
    }
    // A separate host delays the actual process result, so cancelling the start
    // observer exercises the production ownership handoff rather than a mock lease.
    struct Delayed(Arc<Fixture>);
    impl Host for Delayed {
        fn run(&self, argv: Vec<String>, timeout: u64) -> BoxFuture<'static, Result<RunnerResult>> {
            let is_start = argv.get(1).is_some_and(|s| s == "run");
            let result = self.0.run(argv, timeout);
            let fixture = self.0.clone();
            Box::pin(async move {
                if is_start {
                    fixture.delayed.store(true, Ordering::SeqCst);
                    fixture.release.notified().await;
                }
                result.await
            })
        }
        fn project_root(&self, s: &str) -> Result<String> {
            self.0.project_root(s)
        }
        fn mkdir_project(&self, s: &str) -> Result<()> {
            self.0.mkdir_project(s)
        }
        fn worktree_mount_args(&self, s: &str) -> Result<Vec<String>> {
            self.0.worktree_mount_args(s)
        }
        fn unique_suffix(&self) -> String {
            self.0.unique_suffix()
        }
        fn gateway(&self) -> String {
            self.0.gateway()
        }
        fn owner(&self) -> String {
            self.0.owner()
        }
        fn owner_alive(&self, s: &str) -> bool {
            self.0.owner_alive(s)
        }
        fn host_user_args(&self) -> Vec<String> {
            self.0.host_user_args()
        }
        fn supervise(&self, task: BoxFuture<'static, Result<()>>) {
            self.0.supervise(task);
        }
    }
    async fn drain(fixture: &Fixture) {
        loop {
            let tasks = std::mem::take(&mut *fixture.tasks.lock().unwrap());
            if tasks.is_empty() {
                break;
            }
            for task in tasks {
                task.await.unwrap().unwrap();
            }
        }
    }
    fn options(mode: MountMode) -> CommandOptions {
        CommandOptions {
            command: "printf '%s' \"a;$(literal)\"".into(),
            project_root: "/fixture/project".into(),
            timeout_ms: 1,
            mount_mode: mode,
            network_enabled: false,
            memory_limit_mb: Some(512),
            cpu_limit: Some("0.5".into()),
        }
    }
    fn result_json(result: RunResult) -> Value {
        json!({"ok": result.ok, "output": String::from_utf16_lossy(&result.output.0), "exitCode": result.exit_code,
            "timedOut": result.timed_out, "containerName": result.container_name})
    }
    #[tokio::test]
    async fn sandbox_command_native_vectors() {
        let corpus = vec![
            json!({"op":"run", "mode":"read-write"}),
            json!({"op":"run", "mode":"read-only"}),
            json!({"op":"run", "mode":"none"}),
            json!({"op":"run", "mode":"read-write", "replies":[{"output":"late", "exitCode":0, "timedOut":true}]}),
            json!({"op":"run", "mode":"read-write", "replies":[{"output":"failure", "exitCode":7}]}),
            json!({"op":"exec"}),
            json!({"op":"shell"}),
            json!({"op":"session"}),
            json!({"op":"idle", "replies":[{"output":"PID ARGS\n1 tail -f /dev/null"}]}),
            json!({"op":"idle", "replies":[{"output":"PID COMMAND\r\n123 tail -f /dev/null\r\n"}]}),
            json!({"op":"idle", "replies":[{"output":"PID ARGS\n1 tail -f /dev/null\n2 bash"}]}),
            json!({"op":"idle", "replies":[{"output":"PID ARGS\n1 tail -f /dev/null --fake"}]}),
            json!({"op":"idle", "replies":[{"output":"PID ARGS\n1 tail -f /dev/null", "timedOut":true}]}),
            json!({"op":"stop", "replies":[{"output":"No such container", "exitCode":1}]}),
            json!({"op":"stop", "replies":[{"output":"denied", "exitCode":1}]}),
            json!({"op":"cleanup", "replies":[{"output": "{\"name\":\"jait-agent-sb-dead\",\"owner\":\"dead\"}\n{\"name\":\"jait-agent-sb-live\",\"owner\":\"alive\"}\n{\"name\":\"jait-agent-sb-busy\",\"owner\":\"dead\"}\nnull\n{bad"}, {"output":"PID ARGS\n1 tail -f /dev/null"}, {}, {"output":"PID ARGS\n1 bash"}]}),
        ];
        let mut corpus = corpus;
        for (output, wanted) in [
            ("PID ARGS\n١ tail -f /dev/null", false),
            ("PID\u{85}ARGS\n1 tail -f /dev/null", false),
            ("PID\u{feff}ARGS\n1 tail -f /dev/null", true),
            ("PID ARGS\n1\u{85}tail -f /dev/null", false),
            ("PID ARGS\n1\u{feff}tail -f /dev/null", true),
            ("PID ARGS\n1 tail -f /dev/null\nextra", false),
            ("PID ARGS\n1 tail  -f /dev/null", false),
            ("PID ARGS\n1 /usr/bin/tail -f /dev/null", false),
        ] {
            corpus.push(json!({"op":"idle", "wanted":wanted, "replies":[{"output":output}]}));
        }
        let mut records = vec![];
        for case in corpus {
            let fixture = Arc::new(Fixture::default());
            if let Some(replies) = case["replies"].as_array() {
                fixture
                    .replies
                    .lock()
                    .unwrap()
                    .extend(replies.iter().cloned());
            }
            let manager = SandboxManager::new(fixture.clone(), ContainerRuntime::Docker);
            let mode = match case["mode"].as_str() {
                Some("none") => MountMode::None,
                Some("read-only") => MountMode::ReadOnly,
                _ => MountMode::ReadWrite,
            };
            let outcome: Result<Value> = match case["op"].as_str().unwrap() {
                "run" => manager.run_command(&options(mode)).await.map(result_json),
                "exec" => manager
                    .exec_in_container(" fixture ", "printf '%s' '$literal;arg'", 2)
                    .await
                    .map(result_json),
                "shell" => manager
                    .exec_shell(
                        " fixture ",
                        "echo test",
                        Some("/a space"),
                        &[
                            ("Z".into(), "a=b;$(literal)".into()),
                            ("A".into(), "雪".into()),
                        ],
                        None,
                    )
                    .await
                    .map(result_json),
                "session" => {
                    let session = manager
                        .start_command_sandbox(
                            &options(mode),
                            &SessionLabels {
                                session_id: Some("session;literal".into()),
                                thread_id: Some("thread one".into()),
                            },
                        )
                        .await
                        .unwrap();
                    let value = json!({"containerName":session.container_name(), "projectRoot":session.project_root(), "sandboxProjectRoot":session.sandbox_project_root()});
                    session.stop().await.unwrap();
                    Ok(value)
                }
                "idle" => manager
                    .is_command_sandbox_idle("fixture")
                    .await
                    .map(|b| json!(b)),
                "stop" => manager
                    .stop_container(" fixture ")
                    .await
                    .map(|_| Value::Null),
                "cleanup" => manager
                    .cleanup_orphaned_command_sandboxes()
                    .await
                    .map(|v| json!(v)),
                _ => unreachable!(),
            };
            drain(&fixture).await;
            let value = match outcome {
                Ok(value) => json!({"value":value}),
                Err(HostError::Error(message)) => json!({"error":message}),
                Err(e) => panic!("{e:?}"),
            };
            records.push(
                json!({"case":case,"outcome":value,"calls":fixture.calls.lock().unwrap().clone()}),
            );
        }
        assert_eq!(records.len(), 24);
        assert!(
            records[0]["calls"][0][0]
                .as_array()
                .unwrap()
                .contains(&json!("1001:1002"))
        );
        assert!(
            !records[1]["calls"][0][0]
                .as_array()
                .unwrap()
                .contains(&json!("--user"))
        );
        assert!(
            !records[2]["calls"][0][0]
                .as_array()
                .unwrap()
                .contains(&json!("-v"))
        );
        assert_eq!(records[0]["outcome"]["value"]["ok"], true);
        assert_eq!(records[3]["outcome"]["value"]["ok"], false);
        assert_eq!(records[8]["outcome"]["value"], true);
        assert_eq!(records[10]["outcome"]["value"], false);
        assert_eq!(
            records[15]["outcome"]["value"],
            json!(["jait-agent-sb-dead"])
        );
        assert_eq!(records[15]["calls"].as_array().unwrap().len(), 4);
        assert!(
            !records[15]["calls"]
                .to_string()
                .contains("jait-agent-sb-live")
        );
        if std::env::var_os("JAIT_SANDBOX_EMIT_VECTORS").is_some() {
            let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../.jait/artifacts/gateway-rust/sandbox-manager-20261026/native-command-vectors.json");
            std::fs::write(path, serde_json::to_vec_pretty(&records).unwrap()).unwrap();
        }
    }
    #[tokio::test]
    async fn sandbox_admission_native_vectors() {
        let mut records = vec![];
        for kind in [
            SandboxKind::Browser,
            SandboxKind::LinuxDesktop,
            SandboxKind::Windows,
        ] {
            let (title, prefix, noun, default_max) = kind.description();
            let cases = vec![
                json!({"id":"empty", "replies":[{}, {}], "ok":true}),
                json!({"id":"kvm-missing", "kvm":false, "ok":kind != SandboxKind::Windows}),
                json!({"id":"health-timeout", "replies":[{"timedOut":true}], "error":format!("{title} sandbox disabled: container runtime health check failed (timed out)")}),
                json!({"id":"health-failure", "replies":[{"exitCode":1,"output":"fixture failure"}], "error":format!("{title} sandbox disabled: container runtime health check failed (fixture failure)")}),
                json!({"id":"health-throw", "replies":[{"error":"host denied"}], "error":"host denied"}),
                json!({"id":"list-timeout", "replies":[{}, {"timedOut":true}], "error":"container runtime sandbox listing failed (timed out)"}),
                json!({"id":"list-failure", "replies":[{}, {"exitCode":1,"output":"fixture failure"}], "error":"container runtime sandbox listing failed (fixture failure)"}),
                json!({"id":"list-throw", "replies":[{}, {"error":"list denied"}], "error":"list denied"}),
                json!({"id":"default-full", "replies":[{}, {"output":(0..default_max as usize).map(|i|format!("{prefix}{i}\r\n")).collect::<String>()}], "error":format!("{title} sandbox limit reached ({default_max} active, max {default_max}). Refusing to start another {noun}.")}),
                json!({"id":"mixed", "max":"1", "replies":[{}, {"output":format!(" unrelated\nother-{prefix}x\n\u{feff}{prefix}x\u{feff}\r\n")}], "error":format!("{title} sandbox limit reached (1 active, max 1). Refusing to start another {noun}.")}),
                json!({"id":"at-custom-limit", "max":"2x", "replies":[{}, {"output":format!("{prefix}a\n{prefix}b")}], "error":format!("{title} sandbox limit reached (2 active, max 2). Refusing to start another {noun}.")}),
                json!({"id":"below-custom-limit", "max":"3", "replies":[{}, {"output":format!("{prefix}a\n{prefix}b")}], "ok":true}),
            ];
            for case in cases {
                let fixture = Arc::new(Fixture::default());
                if let Some(replies) = case["replies"].as_array() {
                    fixture
                        .replies
                        .lock()
                        .unwrap()
                        .extend(replies.iter().cloned());
                }
                let runtime = if case["id"] == "empty" {
                    ContainerRuntime::Podman
                } else {
                    ContainerRuntime::Docker
                };
                let manager = SandboxManager::new(fixture.clone(), runtime);
                let kvm = case["kvm"].as_bool().unwrap_or(true);
                let result = manager
                    .assert_start_allowed(kind, case["max"].as_str(), kvm)
                    .await;
                let expected_error = if !kvm && kind == SandboxKind::Windows {
                    Some(
                        "Windows sandbox disabled: /dev/kvm is not available on this host. KVM acceleration is required to run a Windows VM (dockur/windows).",
                    )
                } else {
                    case["error"].as_str()
                };
                let outcome = match result {
                    Ok(()) => {
                        assert!(case["ok"].as_bool().unwrap_or(false), "{case}");
                        json!({"value":null})
                    }
                    Err(HostError::Error(message)) => {
                        assert_eq!(Some(message.as_str()), expected_error, "{case}");
                        json!({"error":message})
                    }
                    Err(e) => panic!("{e:?}"),
                };
                let calls = fixture.calls.lock().unwrap().clone();
                let expected_calls = if !kvm && kind == SandboxKind::Windows {
                    0
                } else if case["id"].as_str().unwrap().starts_with("health-") {
                    1
                } else {
                    2
                };
                assert_eq!(
                    calls.len(),
                    expected_calls,
                    "no effects after a failed check: {case}"
                );
                for call in &calls {
                    assert_eq!(call[1], 3000);
                }
                if let Some(call) = calls.first() {
                    assert_eq!(call[0][1], "info");
                }
                if let Some(call) = calls.get(1) {
                    assert_eq!(
                        call[0],
                        json!([
                            runtime.binary(),
                            "ps",
                            "--filter",
                            format!("name={prefix}"),
                            "--format",
                            "{{.Names}}"
                        ])
                    );
                }
                records.push(json!({"kind":format!("{kind:?}"),"runtime":runtime.binary(),"case":case,"outcome":outcome,"calls":calls}));
            }
            for (setting, expected) in [
                ("", default_max),
                ("0", default_max),
                ("-2", default_max),
                ("no", default_max),
                ("0x10", default_max),
                ("\u{85}3", default_max),
                ("\u{feff}+03tail", 3.0),
                ("2.9", 2.0),
                ("1e9", 1.0),
                ("999", 999.0),
            ] {
                assert_eq!(kind.max_active(Some(setting)), expected);
                records.push(json!({"kind":format!("{kind:?}"),"config":setting,"max":expected}));
            }
            assert_eq!(kind.max_active(Some(&"9".repeat(400))), default_max);
        }
        if std::env::var_os("JAIT_SANDBOX_EMIT_VECTORS").is_some() {
            let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../.jait/artifacts/gateway-rust/sandbox-manager-20261026/native-admission-vectors.json");
            std::fs::write(path, serde_json::to_vec_pretty(&records).unwrap()).unwrap();
        }
    }
    #[tokio::test]
    async fn sandbox_start_cancel_waiter_reclaims_late_container() {
        let fixture = Arc::new(Fixture::default());
        let manager =
            SandboxManager::new(Arc::new(Delayed(fixture.clone())), ContainerRuntime::Docker);
        let waiter = tokio::spawn(async move {
            manager
                .start_command_sandbox(&options(MountMode::ReadWrite), &SessionLabels::default())
                .await
        });
        while !fixture.delayed.load(Ordering::SeqCst) {
            tokio::task::yield_now().await;
        }
        waiter.abort();
        let _ = waiter.await;
        fixture.release.notify_one();
        drain(&fixture).await;
        let calls = fixture.calls.lock().unwrap();
        assert_eq!(calls.len(), 2);
        assert_eq!(
            calls[1][0],
            json!(["docker", "rm", "-f", "jait-agent-sb-fixture-1"])
        );
    }
    #[tokio::test]
    async fn sandbox_start_failure_and_lease_drop_own_cleanup() {
        for failed in [true, false] {
            let fixture = Arc::new(Fixture::default());
            if failed {
                fixture
                    .replies
                    .lock()
                    .unwrap()
                    .push_back(json!({"exitCode":0,"timedOut":true}));
            }
            let manager = SandboxManager::new(fixture.clone(), ContainerRuntime::Podman);
            let session = manager
                .start_command_sandbox(&options(MountMode::ReadOnly), &SessionLabels::default())
                .await;
            assert_eq!(session.is_err(), failed);
            drop(session);
            drain(&fixture).await;
            let calls = fixture.calls.lock().unwrap();
            assert_eq!(calls.len(), 2);
            assert_eq!(calls[1][0][0], "podman");
            assert_eq!(calls[1][0][1], "rm");
        }
    }
    #[tokio::test]
    async fn sandbox_boundaries_deny_before_process_effects() {
        let fixture = Arc::new(Fixture::default());
        let manager = SandboxManager::new(fixture.clone(), ContainerRuntime::Docker);
        for name in [
            "--privileged",
            "",
            "bad\0name",
            "one two",
            "name;echo",
            "$(bad)",
        ] {
            assert!(manager.exec_in_container(name, "true", 1000).await.is_err());
        }
        let mut args = options(MountMode::ReadWrite);
        args.project_root = "/project:/host".into();
        assert!(manager.run_command(&args).await.is_err());
        fixture.denied.store(true, Ordering::SeqCst);
        assert!(
            manager
                .run_command(&options(MountMode::None))
                .await
                .is_err()
        );
        assert!(fixture.calls.lock().unwrap().is_empty());
    }
}

#[cfg(test)]
#[path = "sandbox_manager_browser_tests.rs"]
mod browser_start_tests;
