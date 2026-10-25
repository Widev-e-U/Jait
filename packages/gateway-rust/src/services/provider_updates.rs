//! Provider update policy. Every process, registry, PATH and timer effect is an
//! explicit host port; this module neither discovers credentials nor installs
//! software on its own. The host retains consent, deadlines, output limits,
//! cancellation and supervised task cleanup through completion.
use crate::text::js_trim;
use futures_util::{
    FutureExt,
    future::{BoxFuture, Shared, ready},
};
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    sync::{Arc, LazyLock, Mutex, Weak},
};
use tokio::sync::oneshot;

pub const CHECK_INTERVAL_MS: f64 = 21_600_000.0;
pub const CHECK_TIMEOUT_MS: u64 = 15_000;
pub const UPDATE_TIMEOUT_MS: u64 = 300_000;
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct CommandRequest {
    pub command: String,
    pub args: Vec<String>,
    pub timeout: u64,
    #[serde(rename = "maxBuffer")]
    pub max_buffer: usize,
}
#[derive(Clone, Debug, Default)]
pub struct CommandOutput {
    pub stdout: String,
    pub stderr: String,
}
#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct RegistryRequest {
    pub url: String,
    pub headers: std::collections::BTreeMap<String, String>,
    pub timeout: u64,
}
pub struct RegistryResponse {
    pub status: u16,
    /// Delay JSON decoding until after the HTTP status check, as Response.json does.
    pub json: BoxFuture<'static, Result<serde_json::Value, UpdateError>>,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct UpdateError {
    pub message: String,
    #[serde(default)]
    pub stderr: Option<String>,
    #[serde(default = "true_value")]
    pub is_error: bool,
}
fn true_value() -> bool {
    true
}
impl UpdateError {
    pub fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
            stderr: None,
            is_error: true,
        }
    }
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateStatus {
    pub current_version: String,
    pub latest_version: String,
    pub update_available: bool,
    pub checked_at: String,
}
#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct UpdateResult {
    #[serde(flatten)]
    pub status: UpdateStatus,
    pub ok: bool,
    pub message: String,
}
pub type StatusRequest = Shared<BoxFuture<'static, Result<Option<UpdateStatus>, UpdateError>>>;
pub type CancelTimer = Box<dyn FnOnce() + Send>;
pub trait UpdateHost: Send + Sync {
    fn exec(
        &self,
        request: CommandRequest,
    ) -> BoxFuture<'static, Result<CommandOutput, UpdateError>>;
    fn fetch(
        &self,
        request: RegistryRequest,
    ) -> BoxFuture<'static, Result<RegistryResponse, UpdateError>>;
    fn resolve_path(&self, command: &str) -> Result<Option<String>, UpdateError>;
    fn now(&self) -> i64;
    /// Must supervise the admitted future even after its callers are dropped.
    fn spawn(&self, task: BoxFuture<'static, ()>);
    /// Must not invoke inline. The timer must not keep an idle runtime alive.
    fn interval(&self, millis: f64, callback: Arc<dyn Fn() + Send + Sync>) -> CancelTimer;
    fn windows(&self) -> bool;
}
struct CachedStatus {
    status: UpdateStatus,
    checked_ms: i64,
}
struct State {
    statuses: HashMap<String, CachedStatus>,
    inflight: HashMap<String, StatusRequest>,
    timer: Option<CancelTimer>,
}
impl Drop for State {
    fn drop(&mut self) {
        if let Some(cancel) = self.timer.take() {
            cancel();
        }
    }
}
struct RequestCompletion {
    state: Arc<Mutex<State>>,
    provider: String,
    send: Option<oneshot::Sender<Result<Option<UpdateStatus>, UpdateError>>>,
}
impl RequestCompletion {
    fn finish(mut self, result: Result<Option<UpdateStatus>, UpdateError>) {
        self.state.lock().unwrap().inflight.remove(&self.provider);
        if let Some(send) = self.send.take() {
            let _ = send.send(result);
        }
    }
}
impl Drop for RequestCompletion {
    fn drop(&mut self) {
        if let Some(send) = self.send.take() {
            self.state.lock().unwrap().inflight.remove(&self.provider);
            let _ = send.send(Err(UpdateError::new("Provider update task cancelled")));
        }
    }
}
#[derive(Clone)]
pub struct ProviderUpdateService {
    state: Arc<Mutex<State>>,
    lifecycle: Arc<Mutex<()>>,
    host: Arc<dyn UpdateHost>,
    interval_ms: f64,
}
fn spec(provider: &str) -> Option<(&'static str, &'static str, &'static str)> {
    match provider {
        "codex" => Some(("codex", "@openai/codex", "%40openai%2Fcodex")),
        "claude-code" => Some((
            "claude",
            "@anthropic-ai/claude-code",
            "%40anthropic-ai%2Fclaude-code",
        )),
        _ => None,
    }
}
pub fn is_native_claude_install(path: Option<&str>) -> bool {
    path.is_some_and(|p| {
        let p = p.replace('\\', "/").to_lowercase();
        p.contains("/.local/share/claude/") || p.contains("/.claude/local/")
    })
}
/// PATH iteration is native policy; the host provides platform lexical joining
/// and access(X_OK)+realpath probes. Probe errors continue to the next entry.
pub fn resolve_command_path(
    command: &str,
    path: &str,
    windows: bool,
    join: impl Fn(&str, &str) -> String,
    probe: impl Fn(&str) -> Result<String, UpdateError>,
) -> Option<String> {
    let extensions: &[&str] = if windows {
        &[".exe", ".cmd", ".bat", ""]
    } else {
        &[""]
    };
    for directory in path
        .split(if windows { ';' } else { ':' })
        .filter(|s| !s.is_empty())
    {
        for extension in extensions {
            if let Ok(path) = probe(&join(directory, &format!("{command}{extension}"))) {
                return Some(path);
            }
        }
    }
    None
}
fn parse_version(value: &str) -> Option<String> {
    static VERSION: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new(r"(?-u:\b)v?([0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?)").unwrap()
    });
    VERSION.captures(value).map(|c| c[1].into())
}
fn update_available(current: &str, latest: &str) -> bool {
    let parts = |s: &str| {
        s.split('-')
            .next()
            .unwrap()
            .split('.')
            .map(|p| p.parse::<f64>().unwrap_or(f64::INFINITY))
            .collect::<Vec<_>>()
    };
    for (a, b) in parts(current).into_iter().zip(parts(latest)) {
        let difference = a - b;
        if difference != 0.0 {
            return difference < 0.0;
        }
    }
    false
}
fn supervise<T: Send + 'static>(
    host: &dyn UpdateHost,
    task: BoxFuture<'static, Result<T, UpdateError>>,
) -> BoxFuture<'static, Result<T, UpdateError>> {
    let (send, receive) = oneshot::channel();
    host.spawn(
        async move {
            let _ = send.send(task.await);
        }
        .boxed(),
    );
    async move {
        receive
            .await
            .unwrap_or_else(|_| Err(UpdateError::new("Provider update task cancelled")))
    }
    .boxed()
}
impl ProviderUpdateService {
    pub fn new(host: Arc<dyn UpdateHost>, interval_ms: f64) -> Self {
        Self {
            state: Arc::new(Mutex::new(State {
                statuses: HashMap::new(),
                inflight: HashMap::new(),
                timer: None,
            })),
            lifecycle: Arc::default(),
            host,
            interval_ms,
        }
    }
    pub fn supports(&self, provider: &str) -> bool {
        spec(provider).is_some()
    }
    pub fn start(&self) {
        let _lifecycle = self.lifecycle.lock().unwrap();
        if self.state.lock().unwrap().timer.is_some() {
            return;
        }
        self.refresh_all();
        let state = Arc::downgrade(&self.state);
        let host = Arc::downgrade(&self.host);
        let interval = self.interval_ms;
        let lifecycle = Arc::downgrade(&self.lifecycle);
        let cancel = self.host.interval(
            interval,
            Arc::new(move || {
                if let (Some(state), Some(host), Some(lifecycle)) = (
                    Weak::upgrade(&state),
                    Weak::upgrade(&host),
                    Weak::upgrade(&lifecycle),
                ) {
                    Self {
                        state,
                        lifecycle,
                        host,
                        interval_ms: interval,
                    }
                    .refresh_all();
                }
            }),
        );
        self.state.lock().unwrap().timer = Some(cancel);
    }
    pub fn stop(&self) {
        let _lifecycle = self.lifecycle.lock().unwrap();
        let cancel = self.state.lock().unwrap().timer.take();
        if let Some(cancel) = cancel {
            cancel();
        }
    }
    fn refresh_all(&self) {
        for provider in ["codex", "claude-code"] {
            drop(self.get_status(provider, true));
        }
    }
    pub fn get_status(&self, provider: &str, force: bool) -> StatusRequest {
        let Some((command, _, encoded)) = spec(provider) else {
            return ready(Ok(None)).boxed().shared();
        };
        let mut admission = self.state.lock().unwrap();
        {
            let state = &admission;
            if !force {
                if let Some(status) = state.statuses.get(provider) {
                    let now = self.host.now();
                    if now.unsigned_abs() <= 8_640_000_000_000_000
                        && (now as f64 - status.checked_ms as f64) < self.interval_ms
                    {
                        return ready(Ok(Some(status.status.clone()))).boxed().shared();
                    }
                }
                if let Some(inflight) = state.inflight.get(provider) {
                    return inflight.clone();
                }
            }
        }
        let command_task = self.host.exec(CommandRequest {
            command: command.into(),
            args: vec!["--version".into()],
            timeout: CHECK_TIMEOUT_MS,
            max_buffer: 1024 * 1024,
        });
        let exec = supervise(self.host.as_ref(), command_task);
        let registry_task = self.host.fetch(RegistryRequest {
            url: format!("https://registry.npmjs.org/{encoded}/latest"),
            headers: [
                ("Accept".into(), "application/json".into()),
                ("User-Agent".into(), "Jait provider update checker".into()),
            ]
            .into(),
            timeout: CHECK_TIMEOUT_MS,
        });
        let fetch = supervise(self.host.as_ref(), registry_task);
        let host = self.host.clone();
        let state = self.state.clone();
        let provider = provider.to_owned();
        let (send, receive) = oneshot::channel();
        let request = async move {
            receive
                .await
                .unwrap_or_else(|_| Err(UpdateError::new("Provider update task cancelled")))
        }
        .boxed()
        .shared();
        admission.inflight.insert(provider.clone(), request.clone());
        drop(admission);
        let completion = RequestCompletion {
            state: state.clone(),
            provider: provider.clone(),
            send: Some(send),
        };
        self.host.spawn(
            async move {
                let result = async {
                    let (output, response) = futures_util::try_join!(exec, fetch)?;
                    if !(200..300).contains(&response.status) {
                        return Err(UpdateError::new(format!(
                            "npm registry returned HTTP {}",
                            response.status
                        )));
                    }
                    let current = parse_version(&format!("{}\n{}", output.stdout, output.stderr));
                    let body = response.json.await?;
                    if body.is_null() {
                        return Err(UpdateError::new(
                            "Cannot read properties of null (reading 'version')",
                        ));
                    }
                    let latest = body
                        .get("version")
                        .and_then(|v| v.as_str())
                        .and_then(parse_version);
                    let current = current.ok_or_else(|| {
                        UpdateError::new(format!("Could not read the installed {provider} version"))
                    })?;
                    let latest = latest.ok_or_else(|| {
                        UpdateError::new(format!("Could not read the latest {provider} version"))
                    })?;
                    let checked_ms = host.now();
                    let checked_at = crate::time::iso(checked_ms)
                        .map_err(|_| UpdateError::new("Invalid Date"))?;
                    let status = UpdateStatus {
                        update_available: update_available(&current, &latest),
                        current_version: current,
                        latest_version: latest,
                        checked_at,
                    };
                    state.lock().unwrap().statuses.insert(
                        provider.clone(),
                        CachedStatus {
                            status: status.clone(),
                            checked_ms,
                        },
                    );
                    Ok(Some(status))
                }
                .await;
                // Preserve the reference's unconditional deletion, including forced
                // overlapping requests. It does not fence older completion callbacks.
                completion.finish(result);
            }
            .boxed(),
        );
        request
    }
    pub fn update(&self, provider: &str) -> BoxFuture<'static, Result<UpdateResult, UpdateError>> {
        let Some((command, package, _)) = spec(provider) else {
            return ready(Err(UpdateError::new(format!(
                "Updates are not supported for provider {provider}"
            ))))
            .boxed();
        };
        let native = if provider == "claude-code" {
            match self.host.resolve_path(command) {
                Ok(path) => is_native_claude_install(path.as_deref()),
                Err(error) => return ready(Err(error)).boxed(),
            }
        } else {
            false
        };
        let request = CommandRequest {
            command: if native {
                command
            } else if self.host.windows() {
                "npm.cmd"
            } else {
                "npm"
            }
            .into(),
            args: if native {
                vec!["update".into()]
            } else {
                vec![
                    "install".into(),
                    "--global".into(),
                    format!("{package}@latest"),
                ]
            },
            timeout: UPDATE_TIMEOUT_MS,
            max_buffer: 4 * 1024 * 1024,
        };
        let exec = self.host.exec(request);
        let service = self.clone();
        let provider = provider.to_owned();
        supervise(
            self.host.as_ref(),
            async move {
                if let Err(error) = exec.await {
                    let detail = error.stderr.as_deref().map(js_trim).unwrap_or("");
                    let message = if !detail.is_empty() {
                        detail.into()
                    } else if error.is_error {
                        error.message
                    } else {
                        format!("Failed to update {provider}")
                    };
                    return Err(UpdateError::new(message));
                }
                service.state.lock().unwrap().statuses.remove(&provider);
                let status = service.get_status(&provider, true).await?.ok_or_else(|| {
                    UpdateError::new(format!("Unable to verify the {provider} update"))
                })?;
                if status.update_available {
                    return Err(UpdateError::new(format!(
                        "The {provider} update finished, but {command} still resolves to {}. Check the active executable on PATH.",
                        status.current_version
                    )));
                }
                Ok(UpdateResult {
                    message: format!("{provider} updated to {}.", status.current_version),
                    status,
                    ok: true,
                })
            }
            .boxed(),
        )
    }
}
