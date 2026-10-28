//! Live-view lifecycle orchestration. Sandbox execution is a typed authorized
//! host port, not an implicit Docker/TypeScript bridge. Not composed into runtime.
use futures_util::future::BoxFuture;
use serde::{Deserialize, Serialize};
use std::{
    collections::VecDeque,
    path::PathBuf,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use tokio::sync::oneshot;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct LiveViewError(pub String);
impl std::fmt::Display for LiveViewError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}
impl std::error::Error for LiveViewError {}
pub type Result<T> = std::result::Result<T, LiveViewError>;
#[derive(Default, Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveViewOptions {
    pub project_root: Option<String>,
    pub prefer_container: Option<bool>,
    pub display_number: Option<f64>,
    pub width: Option<f64>,
    pub height: Option<f64>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserSandboxRequest {
    pub project_root: String,
    pub mount_mode: &'static str,
    pub network_enabled: bool,
    pub host_gateway: bool,
    pub novnc_port: u16,
    pub vnc_port: u16,
    pub cdp_port: u16,
}
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserSandboxSession {
    pub container_name: String,
    pub vnc_port: u16,
    pub novnc_port: u16,
    pub novnc_url: String,
    pub cdp_url: Option<String>,
}
/// start must be cancellation-safe: dropping its future cleans any sandbox
/// not yet transferred in the returned session. Authority is host-constructed.
pub trait BrowserSandboxPort: Send + Sync {
    fn start(&self, request: BrowserSandboxRequest)
    -> BoxFuture<'_, Result<BrowserSandboxSession>>;
    fn stop(&self, container: String) -> BoxFuture<'_, Result<()>>;
}
/// An owned child must terminate and reap on Drop as well as explicit terminate.
/// Implementations must not hand out detached/unowned process identifiers.
pub trait LiveViewProcess: Send {
    fn terminate(&mut self) -> Result<()>;
    fn process_id(&self) -> Option<u32> {
        None
    }
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
pub enum LiveViewCommand {
    Xvfb,
    X11vnc,
    Websockify,
}
impl LiveViewCommand {
    pub fn executable(self) -> &'static str {
        match self {
            Self::Xvfb => "Xvfb",
            Self::X11vnc => "x11vnc",
            Self::Websockify => "websockify",
        }
    }
}
pub trait LiveViewHost: Send + Sync {
    fn cwd(&self) -> Result<String>;
    fn max_container_starts(&self) -> Option<String>;
    fn reserve_port(&self, container: bool) -> BoxFuture<'_, Result<u16>>;
    fn display_exists(&self, display: &str) -> bool;
    fn now_ms(&self) -> u64;
    fn sleep(&self, ms: u64) -> BoxFuture<'_, ()>;
    fn spawn(&self, command: LiveViewCommand, args: &[String]) -> Result<Box<dyn LiveViewProcess>>;
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum LiveViewKind {
    Host,
    Container,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveViewDescription {
    pub kind: LiveViewKind,
    pub display: String,
    pub vnc_port: u16,
    pub websockify_port: u16,
    pub novnc_url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub container_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cdp_url: Option<String>,
}
struct OwnedProcesses(Vec<Box<dyn LiveViewProcess>>);
impl Drop for OwnedProcesses {
    fn drop(&mut self) {
        for p in &mut self.0 {
            let _ = p.terminate();
        }
    }
}
pub struct LiveViewSession {
    pub description: LiveViewDescription,
    processes: OwnedProcesses,
}
impl LiveViewSession {
    pub fn process_count(&self) -> usize {
        self.processes.0.len()
    }
}

#[derive(Default)]
struct AdmissionState {
    active: usize,
    waiting: VecDeque<oneshot::Sender<StartLease>>,
}
struct Admission {
    state: Mutex<AdmissionState>,
    max_waiting: usize,
}
struct StartLease {
    admission: Arc<Admission>,
    armed: bool,
}
impl Drop for StartLease {
    fn drop(&mut self) {
        if !self.armed {
            return;
        }
        let mut state = self.admission.state.lock().unwrap();
        while let Some(next) = state.waiting.pop_front() {
            let lease = StartLease {
                admission: self.admission.clone(),
                armed: true,
            };
            match next.send(lease) {
                Ok(()) => return,
                Err(mut returned) => returned.armed = false,
            }
        }
        state.active -= 1;
    }
}
impl Admission {
    async fn acquire(self: &Arc<Self>, max: f64) -> Result<StartLease> {
        let rx = {
            let mut state = self.state.lock().unwrap();
            state.waiting.retain(|tx| !tx.is_closed());
            if (state.active as f64) < max && state.waiting.is_empty() {
                state.active += 1;
                return Ok(StartLease {
                    admission: self.clone(),
                    armed: true,
                });
            }
            if state.waiting.len() >= self.max_waiting {
                return Err(LiveViewError("Live-view start queue is full".into()));
            }
            let (tx, rx) = oneshot::channel();
            state.waiting.push_back(tx);
            rx
        };
        rx.await
            .map_err(|_| LiveViewError("Live-view start admission closed".into()))
    }
}
/// JS parseInt(raw,10): decimal prefix, optional sign and JS whitespace. Bounds
/// are admission counts, not a claim about supported session capacity.
pub fn read_max_container_starts(raw: Option<&str>) -> f64 {
    let Some(raw) = raw else {
        return 1.;
    };
    let raw = raw.trim_start_matches(|c: char| matches!(c, '\u{0009}'..='\u{000d}' | ' ' | '\u{00a0}' | '\u{1680}' | '\u{2000}'..='\u{200a}' | '\u{2028}' | '\u{2029}' | '\u{202f}' | '\u{205f}' | '\u{3000}' | '\u{feff}'));
    let (negative, digits) = if let Some(s) = raw.strip_prefix('-') {
        (true, s)
    } else {
        (false, raw.strip_prefix('+').unwrap_or(raw))
    };
    let prefix: String = digits.chars().take_while(char::is_ascii_digit).collect();
    let value = prefix.parse::<f64>().unwrap_or(f64::NAN);
    if !negative && value.is_finite() && value > 0. {
        value
    } else {
        1.
    }
}
pub struct LiveViewManager {
    host: Arc<dyn LiveViewHost>,
    sandbox: Arc<dyn BrowserSandboxPort>,
    admission: Arc<Admission>,
}
impl LiveViewManager {
    /// This opt-in manager bounds waiting work. Unlike TS's unbounded queue,
    /// overload is explicit. Construct one shared manager per execution runtime.
    pub fn new(
        host: Arc<dyn LiveViewHost>,
        sandbox: Arc<dyn BrowserSandboxPort>,
        max_waiting: usize,
    ) -> Self {
        Self {
            host,
            sandbox,
            admission: Arc::new(Admission {
                state: Mutex::new(AdmissionState::default()),
                max_waiting,
            }),
        }
    }
    pub async fn start(&self, options: LiveViewOptions) -> Result<LiveViewSession> {
        if options.prefer_container != Some(false) {
            let result = async {
                let _lease = self
                    .admission
                    .acquire(read_max_container_starts(
                        self.host.max_container_starts().as_deref(),
                    ))
                    .await?;
                self.start_container(options).await
            }
            .await;
            return result
                .map_err(|e| LiveViewError(format!("Docker sandbox browser failed: {}", e.0)));
        }
        self.start_host(options).await
    }
    async fn start_container(&self, options: LiveViewOptions) -> Result<LiveViewSession> {
        let project_root = match options.project_root {
            Some(p) => p,
            None => self.host.cwd()?,
        };
        // Construct all independent reservation futures before awaiting, matching
        // Promise.all invocation and first-rejection behavior. Each port owns its
        // socket until closed; dropping a pending future must close that socket.
        let (a, b, c) = futures_util::future::try_join3(
            self.host.reserve_port(true),
            self.host.reserve_port(true),
            self.host.reserve_port(true),
        )
        .await?;
        let request = BrowserSandboxRequest {
            project_root,
            mount_mode: "none",
            network_enabled: true,
            host_gateway: true,
            novnc_port: a,
            vnc_port: b,
            cdp_port: c,
        };
        let session = self.sandbox.start(request).await?;
        Ok(LiveViewSession {
            description: LiveViewDescription {
                kind: LiveViewKind::Container,
                display: format!("container:{}", session.container_name),
                vnc_port: session.vnc_port,
                websockify_port: session.novnc_port,
                novnc_url: session.novnc_url,
                container_name: Some(session.container_name),
                cdp_url: session.cdp_url,
            },
            processes: OwnedProcesses(vec![]),
        })
    }
    async fn start_host(&self, options: LiveViewOptions) -> Result<LiveViewSession> {
        let number = match options.display_number {
            Some(n) => js_number(n),
            None => (99..=199)
                .map(|n| n.to_string())
                .find(|n| !self.host.display_exists(n))
                .ok_or_else(|| {
                    LiveViewError("No available X display found in range :99-:199".into())
                })?,
        };
        let display = format!(":{number}");
        let (vnc, web) = futures_util::future::try_join(
            self.host.reserve_port(false),
            self.host.reserve_port(false),
        )
        .await?;
        let mut processes = OwnedProcesses(vec![]);
        processes.0.push(self.host.spawn(
            LiveViewCommand::Xvfb,
            &[
                display.clone(),
                "-screen".into(),
                "0".into(),
                format!(
                    "{}x{}x24",
                    js_number(options.width.unwrap_or(1280.)),
                    js_number(options.height.unwrap_or(720.))
                ),
            ],
        )?);
        let deadline = self.host.now_ms().saturating_add(5000);
        let mut ready = false;
        while self.host.now_ms() < deadline {
            if self.host.display_exists(&number) {
                ready = true;
                break;
            }
            self.host.sleep(100).await;
        }
        // TS never checks the socket after the deadline (even if it appeared
        // during the final sleep); avoid a final probe changing that boundary.
        if !ready {
            return Err(LiveViewError(format!(
                "Xvfb display :{number} did not become ready within 5000ms"
            )));
        }
        processes.0.push(self.host.spawn(
            LiveViewCommand::X11vnc,
            &[
                "-display".into(),
                display.clone(),
                "-nopw".into(),
                "-listen".into(),
                "127.0.0.1".into(),
                "-xkb".into(),
                "-forever".into(),
                "-shared".into(),
                "-rfbport".into(),
                vnc.to_string(),
            ],
        )?);
        self.host.sleep(300).await;
        processes.0.push(self.host.spawn(
            LiveViewCommand::Websockify,
            &[web.to_string(), format!("127.0.0.1:{vnc}")],
        )?);
        self.host.sleep(200).await;
        Ok(LiveViewSession {
            description: LiveViewDescription {
                kind: LiveViewKind::Host,
                display,
                vnc_port: vnc,
                websockify_port: web,
                novnc_url: format!("ws://127.0.0.1:{web}"),
                container_name: None,
                cdp_url: None,
            },
            processes,
        })
    }
    pub async fn stop(&self, session: &mut LiveViewSession) {
        if session.description.kind == LiveViewKind::Container
            && let Some(name) = session
                .description
                .container_name
                .as_ref()
                .filter(|n| !n.is_empty())
        {
            let _ = self.sandbox.stop(name.clone()).await;
            return;
        }
        for p in session.processes.0.iter_mut().rev() {
            let _ = p.terminate();
        }
        session.processes.0.clear();
    }
}
fn js_number(n: f64) -> String {
    ryu_js::Buffer::new().format(n).to_string()
}

/// Real host process/socket/clock adapter. Binary locations and sandbox authority
/// are supplied by trusted composition, never by model/tool input.
pub struct NativeLiveViewHost {
    pub binaries: [PathBuf; 3],
    started: Instant,
}
impl Default for NativeLiveViewHost {
    fn default() -> Self {
        Self {
            binaries: ["Xvfb".into(), "x11vnc".into(), "websockify".into()],
            started: Instant::now(),
        }
    }
}
pub struct NativeLiveViewProcess {
    child: Option<std::process::Child>,
}
impl LiveViewProcess for NativeLiveViewProcess {
    fn process_id(&self) -> Option<u32> {
        self.child.as_ref().map(std::process::Child::id)
    }
    fn terminate(&mut self) -> Result<()> {
        if let Some(mut child) = self.child.take() {
            #[cfg(unix)]
            {
                // Dedicated process group belongs to this handle. TERM preserves
                // normal stop behavior; bounded escalation also cleans descendants.
                let group = -(child.id() as i32);
                unsafe {
                    libc::kill(group, libc::SIGTERM);
                }
                let deadline = Instant::now() + Duration::from_millis(100);
                while Instant::now() < deadline {
                    match child.try_wait() {
                        Ok(Some(_)) => break,
                        Ok(None) => std::thread::sleep(Duration::from_millis(5)),
                        Err(_) => break,
                    }
                }
                unsafe {
                    libc::kill(group, libc::SIGKILL);
                }
            }
            #[cfg(not(unix))]
            let _ = child.kill();
            child.wait().map_err(|e| LiveViewError(e.to_string()))?;
        }
        Ok(())
    }
}
impl Drop for NativeLiveViewProcess {
    fn drop(&mut self) {
        let _ = self.terminate();
    }
}
impl LiveViewHost for NativeLiveViewHost {
    fn cwd(&self) -> Result<String> {
        std::env::current_dir()
            .map(|p| p.to_string_lossy().into_owned())
            .map_err(|e| LiveViewError(e.to_string()))
    }
    fn max_container_starts(&self) -> Option<String> {
        std::env::var("JAIT_MAX_CONTAINER_LIVE_VIEW_STARTS").ok()
    }
    fn reserve_port(&self, _container: bool) -> BoxFuture<'_, Result<u16>> {
        Box::pin(async {
            let listener = tokio::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0))
                .await
                .map_err(|e| LiveViewError(e.to_string()))?;
            listener
                .local_addr()
                .map(|a| a.port())
                .map_err(|e| LiveViewError(e.to_string()))
        })
    }
    fn display_exists(&self, display: &str) -> bool {
        std::path::Path::new(&format!("/tmp/.X11-unix/X{display}")).exists()
    }
    fn now_ms(&self) -> u64 {
        self.started
            .elapsed()
            .as_millis()
            .try_into()
            .unwrap_or(u64::MAX)
    }
    fn sleep(&self, ms: u64) -> BoxFuture<'_, ()> {
        Box::pin(tokio::time::sleep(Duration::from_millis(ms)))
    }
    fn spawn(&self, command: LiveViewCommand, args: &[String]) -> Result<Box<dyn LiveViewProcess>> {
        let index = match command {
            LiveViewCommand::Xvfb => 0,
            LiveViewCommand::X11vnc => 1,
            LiveViewCommand::Websockify => 2,
        };
        let mut command = std::process::Command::new(&self.binaries[index]);
        command
            .args(args)
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null());
        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt;
            command.process_group(0);
        }
        let child = command.spawn().map_err(|e| LiveViewError(e.to_string()))?;
        Ok(Box::new(NativeLiveViewProcess { child: Some(child) }))
    }
}
