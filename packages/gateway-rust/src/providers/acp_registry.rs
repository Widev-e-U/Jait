//! Native port of `packages/gateway/src/providers/acp-registry.ts`.
//!
//! Responsibilities mirrored one-for-one: registry URL resolution, process-wide memory cache with
//! TTL, single-flight de-duplication of concurrent loads, real HTTP fetch through `reqwest` with a
//! request timeout and a byte cap, real filesystem cache read/write with the TypeScript modes, the
//! agent validation/normalisation pipeline (npx, uvx and per-platform binary distributions),
//! provider-id aliases, fallback merging and `name.localeCompare` ordering.
//!
//! Deliberate native adaptation 1: the TypeScript module resolves the binary launcher from the
//! module URL (`acp-binary-launcher${extname(import.meta.url)}`) and spawns it with
//! `process.execPath` as the interpreter. A compiled Rust binary is not a script interpreter, so
//! [`RegistryRuntime::from_process`] reports [`LauncherAdapter::Unconfigured`] instead of
//! fabricating a runnable pair: binary distributions are withheld and listed in
//! [`ParseOutcome::unlaunchable`] until a host wires a real launcher component through
//! [`LauncherAdapter::from_module_layout`] or [`LauncherAdapter::configured`]. Environment access,
//! the home directory and the platform/architecture pair are injected through the same struct so
//! tests never mutate global process state.
//!
//! Deliberate native adaptation 2: `name.localeCompare(name)` uses the compiled ICU root collation
//! through [`AcpCollation`] rather than a byte or ASCII-fold approximation.

use futures_util::future::{FutureExt, Shared as SharedFuture};
use icu_collator::{Collator, CollatorBorrowed, options::CollatorOptions};
use serde_json::{Map, Value};
use std::{
    cmp::Ordering,
    collections::{HashMap, HashSet},
    io::Write,
    path::PathBuf,
    sync::{Arc, Mutex, OnceLock},
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use crate::text::js_trim;

pub const ACP_REGISTRY_URL: &str =
    "https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json";
pub const ACP_REGISTRY_CACHE_TTL_MS: u64 = 60 * 60_000;
pub const ACP_REGISTRY_FETCH_TIMEOUT_MS: u64 = 5_000;
pub const ACP_REGISTRY_MAX_BYTES: usize = 2 * 1024 * 1024;
pub const PROVIDER_ID_ALIASES: [(&str, &str); 3] = [
    ("claude-acp", "claude-code"),
    ("codex-acp", "codex"),
    ("pi-acp", "pi"),
];
pub const REGISTRY_UNAVAILABLE_WARNING: &str =
    "ACP registry unavailable; using bundled provider definitions.";

/// How a registry binary distribution is started.
///
/// TypeScript spawns `process.execPath` (Node) with the module-relative `acp-binary-launcher`
/// shim, which then installs and runs the published archive. There is no honest native default for
/// that pair: the gateway executable cannot interpret a script, and no native launcher component is
/// ported yet. [`RegistryRuntime::from_process`] therefore stays [`Self::Unconfigured`] and binary
/// agents are reported as unlaunchable rather than advertised as runnable.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum LauncherAdapter {
    /// No native launcher component is wired: binary distributions cannot be started.
    Unconfigured,
    /// Host-provided launcher executable plus its fixed leading arguments.
    Configured { command: String, args: Vec<String> },
}

impl LauncherAdapter {
    /// Declares the launcher a host has actually installed.
    pub fn configured(command: impl Into<String>, args: Vec<String>) -> Self {
        Self::Configured {
            command: command.into(),
            args,
        }
    }

    /// Reproduces the TypeScript spawn pair: the running executable plus the `acp-binary-launcher`
    /// shim beside it. Select this only once a runnable launcher component exists at that path.
    pub fn from_module_layout() -> Self {
        let launcher_path = std::env::current_exe()
            .ok()
            .and_then(|path| path.parent().map(|dir| dir.join(launcher_file_name())))
            .unwrap_or_else(|| PathBuf::from(launcher_file_name()));
        Self::configured(launcher_path.to_string_lossy().into_owned(), vec![])
    }
}

/// Compiled Unicode collation for `name.localeCompare(name)`.
///
/// The source sorts with `Intl.Collator`'s default configuration (tertiary strength, non-ignorable
/// punctuation, numeric disabled), which for the gateway's `en-US` default is the CLDR root
/// collation built here — the same design as `services/node_state_manager.rs`. Comparison is
/// compiled once and reused; a host configured with another default locale injects a tailored
/// collator through [`AcpCollation::from_collator`].
pub struct AcpCollation {
    collator: CollatorBorrowed<'static>,
}

impl Default for AcpCollation {
    fn default() -> Self {
        Self::from_collator(
            Collator::try_new(Default::default(), CollatorOptions::default())
                .expect("compiled root collation"),
        )
    }
}

impl AcpCollation {
    /// Injection point for a locale-tailored collator built by the host.
    pub fn from_collator(collator: CollatorBorrowed<'static>) -> Self {
        Self { collator }
    }

    /// Tertiary comparison. Collation-equal names compare [`Ordering::Equal`] so the stable sort
    /// preserves input order, matching `Array.prototype.sort` on a zero `localeCompare` result.
    pub fn compare(&self, left: &str, right: &str) -> Ordering {
        self.collator.compare(left, right)
    }
}

/// Cache-file selector. Mirrors `options.cacheFile` being `undefined`, `null` or a path.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub enum CacheFile {
    /// `cacheFile` omitted: `<state dir>/cache/acp-registry.json`.
    #[default]
    DefaultPath,
    /// `cacheFile: null`: no cache read or write.
    Disabled,
    /// Explicit path.
    Explicit(PathBuf),
}

/// `LoadAcpRegistryOptions`.
#[derive(Clone, Debug, Default)]
pub struct LoadAcpRegistryOptions {
    pub fallback_definitions: Vec<Value>,
    pub registry_url: Option<String>,
    pub cache_file: CacheFile,
    pub force: bool,
    pub prefer_fallback_definitions: bool,
}

/// Injected process/user context (env, home, platform, executable layout).
#[derive(Clone, Debug)]
pub struct RegistryRuntime {
    pub home: PathBuf,
    pub state_dir_env: Option<String>,
    pub registry_url_env: Option<String>,
    pub disabled_env: Option<String>,
    pub launcher: LauncherAdapter,
    /// JavaScript-style platform name (`win32`, `darwin`, `linux`, ...).
    pub platform: String,
    /// JavaScript-style architecture (`x64`, `arm64`, ...); `None` when unknown.
    pub architecture: Option<String>,
    pub fetch_timeout: Duration,
}

impl Default for RegistryRuntime {
    fn default() -> Self {
        Self {
            home: PathBuf::new(),
            state_dir_env: None,
            registry_url_env: None,
            disabled_env: None,
            launcher: LauncherAdapter::Unconfigured,
            platform: "linux".into(),
            architecture: Some("x64".into()),
            fetch_timeout: Duration::from_millis(ACP_REGISTRY_FETCH_TIMEOUT_MS),
        }
    }
}

impl RegistryRuntime {
    /// Reads the real process environment, home directory and platform.
    ///
    /// The launcher stays [`LauncherAdapter::Unconfigured`]: a compiled Rust gateway executable is
    /// not a script interpreter, so no runnable launcher pair can be derived from the process.
    pub fn from_process() -> Self {
        Self {
            home: home_directory(),
            state_dir_env: std::env::var("JAIT_STATE_DIR").ok(),
            registry_url_env: std::env::var("JAIT_ACP_REGISTRY_URL").ok(),
            disabled_env: std::env::var("JAIT_ACP_REGISTRY_DISABLED").ok(),
            launcher: LauncherAdapter::Unconfigured,
            platform: js_platform().into(),
            architecture: js_architecture(),
            fetch_timeout: Duration::from_millis(ACP_REGISTRY_FETCH_TIMEOUT_MS),
        }
    }

    /// Wires the launcher a host has actually installed, enabling binary distributions.
    pub fn with_launcher(mut self, launcher: LauncherAdapter) -> Self {
        self.launcher = launcher;
        self
    }

    pub fn state_directory(&self) -> Result<PathBuf, String> {
        crate::state_directory::state_directory(&self.home, self.state_dir_env.as_deref())
            .map_err(|error| error.to_string())
    }

    fn default_cache_file(&self) -> Result<PathBuf, String> {
        Ok(self
            .state_directory()?
            .join("cache")
            .join("acp-registry.json"))
    }

    fn disabled(&self) -> bool {
        self.disabled_env.as_deref() == Some("1")
    }

    /// `options.registryUrl ?? process.env.JAIT_ACP_REGISTRY_URL?.trim() ?? ACP_REGISTRY_URL`.
    /// An empty-but-present environment value stays empty (`??` is not `||`).
    fn registry_url(&self) -> String {
        match &self.registry_url_env {
            Some(value) => js_trim(value).to_string(),
            None => ACP_REGISTRY_URL.to_string(),
        }
    }
}

fn launcher_file_name() -> &'static str {
    if cfg!(windows) {
        "acp-binary-launcher.exe"
    } else {
        "acp-binary-launcher"
    }
}

fn js_platform() -> &'static str {
    if cfg!(windows) {
        "win32"
    } else if cfg!(target_os = "macos") {
        "darwin"
    } else if cfg!(target_os = "linux") {
        "linux"
    } else if cfg!(target_os = "freebsd") {
        "freebsd"
    } else if cfg!(target_os = "openbsd") {
        "openbsd"
    } else if cfg!(target_os = "android") {
        "android"
    } else {
        "unknown"
    }
}

fn js_architecture() -> Option<String> {
    let arch = if cfg!(target_arch = "x86_64") {
        "x64"
    } else if cfg!(target_arch = "aarch64") {
        "arm64"
    } else if cfg!(target_arch = "x86") {
        "ia32"
    } else if cfg!(target_arch = "arm") {
        "arm"
    } else if cfg!(target_arch = "riscv64") {
        "riscv64"
    } else {
        return None;
    };
    Some(arch.to_string())
}

fn home_directory() -> PathBuf {
    #[cfg(windows)]
    let keys = ["USERPROFILE", "HOME"];
    #[cfg(not(windows))]
    let keys = ["HOME", "USERPROFILE"];
    for key in keys {
        if let Some(value) = std::env::var_os(key)
            && !value.is_empty()
        {
            return PathBuf::from(value);
        }
    }
    PathBuf::new()
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis() as u64)
        .unwrap_or_default()
}

/// Reason a load attempt failed; mirrors the errors thrown inside the TypeScript `try` block.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum LoadFailure {
    Http(u16),
    SizeLimit,
    NoRunnableAgents,
    Transport(String),
    Json(String),
    Parse(String),
    CacheWrite(String),
}

impl LoadFailure {
    pub fn message(&self) -> String {
        match self {
            LoadFailure::Http(status) => format!("ACP registry returned HTTP {status}"),
            LoadFailure::SizeLimit => "ACP registry response exceeded the size limit".into(),
            LoadFailure::NoRunnableAgents => "ACP registry contained no runnable agents".into(),
            LoadFailure::Transport(detail)
            | LoadFailure::Json(detail)
            | LoadFailure::Parse(detail)
            | LoadFailure::CacheWrite(detail) => detail.clone(),
        }
    }
}

/// One `console.warn("ACP registry unavailable; using bundled provider definitions.", error)` call.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RegistryWarning {
    pub message: &'static str,
    pub detail: String,
}

impl RegistryWarning {
    pub fn from_failure(failure: &LoadFailure) -> Self {
        Self {
            message: REGISTRY_UNAVAILABLE_WARNING,
            detail: failure.message(),
        }
    }
    pub fn rendered(&self) -> String {
        format!("{} {}", self.message, self.detail)
    }
}

type LoadFuture =
    std::pin::Pin<Box<dyn std::future::Future<Output = Arc<Vec<Value>>> + Send + 'static>>;
type SharedLoad = SharedFuture<LoadFuture>;

struct MemoryCache {
    registry_url: String,
    loaded_at_ms: u64,
    providers: Arc<Vec<Value>>,
}

#[derive(Default)]
struct LoadState {
    memory: Option<MemoryCache>,
    inflight: Option<SharedLoad>,
}

type WarnPort = Arc<dyn Fn(&RegistryWarning) + Send + Sync>;
type ClockPort = Arc<dyn Fn() -> u64 + Send + Sync>;

/// Native ACP registry client. Holds the module-level cache state of the TypeScript singleton, but
/// per instance so tests stay isolated; [`global_registry`] provides the process singleton.
#[derive(Clone)]
pub struct AcpRegistry {
    runtime: RegistryRuntime,
    http: reqwest::Client,
    state: Arc<Mutex<LoadState>>,
    warn: WarnPort,
    clock: ClockPort,
    collation: Arc<AcpCollation>,
}

impl AcpRegistry {
    pub fn new(runtime: RegistryRuntime) -> Self {
        Self::with_warn(
            runtime,
            Arc::new(|warning: &RegistryWarning| {
                eprintln!("{}", warning.rendered());
            }),
        )
    }

    pub fn with_warn(runtime: RegistryRuntime, warn: WarnPort) -> Self {
        Self::with_ports(
            runtime,
            warn,
            Arc::new(now_ms),
            Arc::new(AcpCollation::default()),
        )
    }

    /// Host clock and locale are explicit so expiry and language sorting can be validated.
    pub fn with_ports(
        runtime: RegistryRuntime,
        warn: WarnPort,
        clock: ClockPort,
        collation: Arc<AcpCollation>,
    ) -> Self {
        let http = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::limited(20))
            .timeout(runtime.fetch_timeout)
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());
        Self {
            runtime,
            http,
            state: Arc::new(Mutex::new(LoadState::default())),
            warn,
            clock,
            collation,
        }
    }

    pub fn runtime(&self) -> &RegistryRuntime {
        &self.runtime
    }

    /// `loadAcpRegistryProviderConfigs`. Rejects only where the TypeScript function rejects
    /// (an unusable `JAIT_STATE_DIR` while resolving the default cache path).
    pub async fn load(&self, options: LoadAcpRegistryOptions) -> Result<Vec<Value>, String> {
        let registry_url = options
            .registry_url
            .clone()
            .unwrap_or_else(|| self.runtime.registry_url());
        let fallback = options.fallback_definitions.clone();
        if self.runtime.disabled() {
            return Ok(fallback);
        }

        // The cache lookup, the in-flight lookup and the publication of a new in-flight future all
        // happen under one lock: the TypeScript singleton assigns `inflightLoad` synchronously
        // before awaiting, so concurrent callers must never both start a fetch.
        let shared = {
            let mut state = self.state.lock().unwrap();
            let fresh = if options.force {
                None
            } else {
                state.memory.as_ref().filter(|memory| {
                    memory.registry_url == registry_url
                        && (self.clock)().saturating_sub(memory.loaded_at_ms)
                            < ACP_REGISTRY_CACHE_TTL_MS
                })
            };
            if let Some(memory) = fresh {
                return Ok(merge_fallback_definitions_with_collation(
                    &memory.providers,
                    &fallback,
                    options.prefer_fallback_definitions,
                    &self.collation,
                ));
            }
            match if options.force {
                None
            } else {
                state.inflight.clone()
            } {
                Some(shared) => shared,
                None => {
                    // Resolve the cache path before publishing the in-flight future, exactly like
                    // the TypeScript function (a state-directory error rejects the call).
                    let cache_file = self.resolve_cache_file(&options.cache_file)?;
                    self.begin_load_locked(&mut state, registry_url, cache_file)
                }
            }
        };

        let providers = shared.await;
        Ok(merge_fallback_definitions_with_collation(
            &providers,
            &fallback,
            options.prefer_fallback_definitions,
            &self.collation,
        ))
    }

    fn resolve_cache_file(&self, selector: &CacheFile) -> Result<Option<PathBuf>, String> {
        match selector {
            CacheFile::DefaultPath => Ok(Some(self.runtime.default_cache_file()?)),
            CacheFile::Disabled => Ok(None),
            CacheFile::Explicit(path) => Ok(Some(path.clone())),
        }
    }

    /// Publishes the in-flight future while the caller still holds the state lock.
    fn begin_load_locked(
        &self,
        state: &mut LoadState,
        registry_url: String,
        cache_file: Option<PathBuf>,
    ) -> SharedLoad {
        let registry = self.clone();
        let future_state = self.state.clone();
        let future = async move {
            let providers = run_load(&registry, &registry_url, cache_file.as_deref()).await;
            future_state.lock().unwrap().inflight = None;
            providers
        }
        .boxed();
        // JavaScript promises keep running after callers stop awaiting them. The task owns
        // collection; the shared handle is only a subscription, never the driver's poll owner.
        let shared = tokio::spawn(future)
            .map(|result| result.unwrap_or_else(|_| Arc::new(Vec::new())))
            .boxed()
            .shared();
        state.inflight = Some(shared.clone());
        shared
    }

    /// Test/diagnostics hook: current memory-cache snapshot `(registry_url, loaded_at_ms)`.
    pub fn memory_cache_snapshot(&self) -> Option<(String, u64)> {
        let state = self.state.lock().unwrap();
        state
            .memory
            .as_ref()
            .map(|memory| (memory.registry_url.clone(), memory.loaded_at_ms))
    }

    pub fn has_inflight_load(&self) -> bool {
        self.state.lock().unwrap().inflight.is_some()
    }
}

/// Process-wide singleton used by production callers (mirrors the module-level cache).
pub fn global_registry() -> &'static AcpRegistry {
    static GLOBAL: OnceLock<AcpRegistry> = OnceLock::new();
    GLOBAL.get_or_init(|| AcpRegistry::new(RegistryRuntime::from_process()))
}

pub async fn load_acp_registry_provider_configs(
    options: LoadAcpRegistryOptions,
) -> Result<Vec<Value>, String> {
    global_registry().load(options).await
}

async fn run_load(
    registry: &AcpRegistry,
    registry_url: &str,
    cache_file: Option<&std::path::Path>,
) -> Arc<Vec<Value>> {
    let AcpRegistry {
        http,
        runtime,
        warn,
        state,
        clock,
        collation,
    } = registry;
    let attempt = match attempt_fetch(http, runtime, collation, registry_url).await {
        Ok((raw, providers)) => match cache_file {
            Some(path) => match write_cache(path, raw.into_bytes()).await {
                Ok(()) => Ok(providers),
                Err(detail) => Err(LoadFailure::CacheWrite(detail)),
            },
            None => Ok(providers),
        },
        Err(failure) => Err(failure),
    };

    match attempt {
        Ok(providers) => {
            let providers = Arc::new(providers);
            state.lock().unwrap().memory = Some(MemoryCache {
                registry_url: registry_url.to_string(),
                loaded_at_ms: clock(),
                providers: providers.clone(),
            });
            providers
        }
        Err(failure) => {
            if let Some(path) = cache_file
                && let Ok(providers) = read_cache(path, runtime, collation).await
                && !providers.is_empty()
            {
                let providers = Arc::new(providers);
                state.lock().unwrap().memory = Some(MemoryCache {
                    registry_url: registry_url.to_string(),
                    loaded_at_ms: clock(),
                    providers: providers.clone(),
                });
                return providers;
            }
            warn(&RegistryWarning::from_failure(&failure));
            Arc::new(Vec::new())
        }
    }
}

async fn attempt_fetch(
    http: &reqwest::Client,
    runtime: &RegistryRuntime,
    collation: &AcpCollation,
    registry_url: &str,
) -> Result<(String, Vec<Value>), LoadFailure> {
    let response = http
        .get(registry_url)
        .header("Accept", "application/json")
        .header("User-Agent", "Jait ACP registry client")
        .send()
        .await
        .map_err(|error| LoadFailure::Transport(error.to_string()))?;
    let status = response.status();
    if !status.is_success() {
        return Err(LoadFailure::Http(status.as_u16()));
    }
    let body = response
        .bytes()
        .await
        .map_err(|error| LoadFailure::Transport(error.to_string()))?;
    // Fetch Response.text() uses replacement decoding and removes one UTF-8 BOM. The
    // source measures re-encoded text bytes, not the undecoded transfer length.
    let decoded = String::from_utf8_lossy(&body);
    let raw = decoded
        .strip_prefix('\u{feff}')
        .unwrap_or(&decoded)
        .to_owned();
    if raw.len() > ACP_REGISTRY_MAX_BYTES {
        return Err(LoadFailure::SizeLimit);
    }
    let value: Value =
        serde_json::from_str(&raw).map_err(|error| LoadFailure::Json(error.to_string()))?;
    let providers = parse_acp_registry_with_collation(&value, runtime, collation)
        .map_err(LoadFailure::Parse)?;
    if providers.is_empty() {
        return Err(LoadFailure::NoRunnableAgents);
    }
    Ok((raw, providers))
}

async fn write_cache(path: &std::path::Path, contents: Vec<u8>) -> Result<(), String> {
    let path = path.to_path_buf();
    tokio::task::spawn_blocking(move || -> Result<(), String> {
        if let Some(parent) = path.parent()
            && !parent.as_os_str().is_empty()
        {
            let mut builder = std::fs::DirBuilder::new();
            builder.recursive(true);
            #[cfg(unix)]
            {
                use std::os::unix::fs::DirBuilderExt;
                builder.mode(0o700);
            }
            builder.create(parent).map_err(|error| error.to_string())?;
        }
        let mut options = std::fs::OpenOptions::new();
        options.write(true).create(true).truncate(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options.open(&path).map_err(|error| error.to_string())?;
        file.write_all(&contents).map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}

async fn read_cache(
    path: &std::path::Path,
    runtime: &RegistryRuntime,
    collation: &AcpCollation,
) -> Result<Vec<Value>, LoadFailure> {
    let path = path.to_path_buf();
    let bytes = tokio::task::spawn_blocking(move || std::fs::read(&path))
        .await
        .map_err(|error| LoadFailure::Parse(error.to_string()))?
        .map_err(|error| LoadFailure::Parse(error.to_string()))?;
    let text = String::from_utf8_lossy(&bytes);
    let value: Value =
        serde_json::from_str(&text).map_err(|error| LoadFailure::Parse(error.to_string()))?;
    parse_acp_registry_with_collation(&value, runtime, collation).map_err(LoadFailure::Parse)
}

/// `parseAcpRegistry` with process-derived runtime context.
pub fn parse_acp_registry(value: &Value) -> Result<Vec<Value>, String> {
    parse_acp_registry_with(value, &RegistryRuntime::from_process())
}

/// `parseAcpRegistry`. Returns an error only where the TypeScript function throws (unusable
/// `JAIT_STATE_DIR` while building a binary distribution).
pub fn parse_acp_registry_with(
    value: &Value,
    runtime: &RegistryRuntime,
) -> Result<Vec<Value>, String> {
    Ok(parse_acp_registry_reporting(value, runtime, &AcpCollation::default())?.providers)
}

/// `parseAcpRegistry` with an injected collation, for hosts whose activation locale is not the
/// `en-US` default that the compiled root collation represents.
pub fn parse_acp_registry_with_collation(
    value: &Value,
    runtime: &RegistryRuntime,
    collation: &AcpCollation,
) -> Result<Vec<Value>, String> {
    Ok(parse_acp_registry_reporting(value, runtime, collation)?.providers)
}

/// A successful parse plus the diagnostics a bare `Vec` cannot carry.
#[derive(Clone, Debug, Default)]
pub struct ParseOutcome {
    /// Ordered configs: exactly the TypeScript return value.
    pub providers: Vec<Value>,
    /// Registry ids withheld because their binary distribution needs an unconfigured launcher.
    pub unlaunchable: Vec<String>,
}

/// `parseAcpRegistry`, reporting binary distributions a native launcher cannot start.
pub fn parse_acp_registry_reporting(
    value: &Value,
    runtime: &RegistryRuntime,
    collation: &AcpCollation,
) -> Result<ParseOutcome, String> {
    let agents = match value.as_object().and_then(|object| object.get("agents")) {
        Some(Value::Array(agents)) => agents,
        _ => return Ok(ParseOutcome::default()),
    };
    let mut seen = HashSet::new();
    let mut providers = Vec::new();
    let mut unlaunchable = Vec::new();
    for entry in agents {
        let Some(config) = parse_registry_agent(entry, runtime, &mut unlaunchable)? else {
            continue;
        };
        let id = config
            .get("id")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();
        if !seen.insert(id) {
            continue;
        }
        providers.push(config);
    }
    providers.sort_by(|left, right| {
        collation.compare(
            left.get("name").and_then(Value::as_str).unwrap_or_default(),
            right
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or_default(),
        )
    });
    Ok(ParseOutcome {
        providers,
        unlaunchable,
    })
}

fn parse_registry_agent(
    value: &Value,
    runtime: &RegistryRuntime,
    unlaunchable: &mut Vec<String>,
) -> Result<Option<Value>, String> {
    let Some(object) = value.as_object() else {
        return Ok(None);
    };
    let distribution = match object.get("distribution") {
        Some(distribution @ Value::Object(_)) => distribution,
        _ => return Ok(None),
    };
    let (Some(registry_id), Some(name), Some(version), Some(description)) = (
        read_string(object.get("id")),
        read_string(object.get("name")),
        read_string(object.get("version")),
        read_string(object.get("description")),
    ) else {
        return Ok(None);
    };
    if !is_registry_id(&registry_id) {
        return Ok(None);
    }
    let icon = read_https_url(object.get("icon"));
    let website = read_https_url(object.get("website"));
    let repository = read_https_url(object.get("repository"));

    let mut metadata = Map::new();
    metadata.insert("id".into(), Value::String(registry_id.clone()));
    metadata.insert("version".into(), Value::String(version.clone()));
    for (key, field) in [
        ("icon", icon),
        ("website", website),
        ("repository", repository),
    ] {
        if let Some(url) = field {
            metadata.insert(key.into(), Value::String(url));
        }
    }
    let id = resolve_provider_id(&registry_id);

    if let Some(npx) = parse_package_distribution(distribution.get("npx")) {
        let mut args = vec![Value::String("-y".into()), Value::String(npx.package)];
        args.extend(npx.args);
        metadata.insert("distribution".into(), Value::String("npx".into()));
        let command = if runtime.platform == "win32" {
            "npx.cmd"
        } else {
            "npx"
        };
        return Ok(Some(provider_config(
            &id,
            &name,
            &description,
            command,
            args,
            npx.env,
            metadata,
        )));
    }

    if let Some(uvx) = parse_package_distribution(distribution.get("uvx")) {
        let mut args = vec![Value::String(uvx.package)];
        args.extend(uvx.args);
        metadata.insert("distribution".into(), Value::String("uvx".into()));
        return Ok(Some(provider_config(
            &id,
            &name,
            &description,
            "uvx",
            args,
            uvx.env,
            metadata,
        )));
    }

    let target = current_platform_target(&runtime.platform, runtime.architecture.as_deref());
    let binary = match (&target, distribution.get("binary")) {
        (Some(target), Some(container @ Value::Object(_))) => {
            parse_binary_distribution(container.get(target.as_str()))
        }
        _ => None,
    };
    let (target, binary) = match (target, binary) {
        (Some(target), Some(binary)) => (target, binary),
        _ => return Ok(None),
    };

    let state_directory = runtime.state_directory()?;
    let mut spec = Map::new();
    spec.insert("id".into(), Value::String(registry_id.clone()));
    spec.insert("version".into(), Value::String(version));
    spec.insert("target".into(), Value::String(target));
    spec.insert("archive".into(), Value::String(binary.archive));
    spec.insert("cmd".into(), Value::String(binary.cmd));
    spec.insert("args".into(), Value::Array(binary.args));
    spec.insert("env".into(), Value::Object(binary.env.clone()));
    if let Some(sha256) = binary.sha256 {
        spec.insert("sha256".into(), Value::String(sha256));
    }
    let encoded = serde_json::to_string(&Value::Object(spec)).map_err(|error| error.to_string())?;
    let spec = base64_url(encoded.as_bytes());

    let mut env = binary.env;
    env.insert(
        "JAIT_ACP_BINARY_ROOT".into(),
        Value::String(
            state_directory
                .join("acp-agents")
                .to_string_lossy()
                .into_owned(),
        ),
    );
    metadata.insert("distribution".into(), Value::String("binary".into()));
    // The TypeScript contract spawns `process.execPath` with the launcher shim. Native keeps that
    // shape only for a launcher the host actually wired; otherwise the agent is withheld and
    // reported, never advertised with an argv that cannot run.
    let (command, mut args) = match &runtime.launcher {
        LauncherAdapter::Configured { command, args } => (command.clone(), args.clone()),
        LauncherAdapter::Unconfigured => {
            unlaunchable.push(id.clone());
            return Ok(None);
        }
    };
    args.push(spec);
    Ok(Some(provider_config(
        &id,
        &name,
        &description,
        &command,
        args.into_iter().map(Value::String).collect(),
        env,
        metadata,
    )))
}

fn provider_config(
    id: &str,
    name: &str,
    description: &str,
    command: &str,
    args: Vec<Value>,
    env: Map<String, Value>,
    registry: Map<String, Value>,
) -> Value {
    let mut config = Map::new();
    config.insert("id".into(), Value::String(id.into()));
    config.insert("providerType".into(), Value::String(id.into()));
    config.insert("name".into(), Value::String(name.into()));
    config.insert("description".into(), Value::String(description.into()));
    config.insert("command".into(), Value::String(command.into()));
    config.insert("args".into(), Value::Array(args));
    if !env.is_empty() {
        config.insert("env".into(), Value::Object(env));
    }
    config.insert("auth".into(), Value::String("acp".into()));
    config.insert("registry".into(), Value::Object(registry));
    Value::Object(config)
}

struct PackageDistribution {
    package: String,
    args: Vec<Value>,
    env: Map<String, Value>,
}

fn parse_package_distribution(value: Option<&Value>) -> Option<PackageDistribution> {
    let value = value?;
    if !value.is_object() {
        return None;
    }
    let package = read_string(value.get("package"))?;
    if package.contains(['\r', '\n', '\0']) {
        return None;
    }
    Some(PackageDistribution {
        args: read_string_array(value.get("args")),
        env: read_environment(value.get("env")),
        package,
    })
}

struct BinaryDistribution {
    archive: String,
    cmd: String,
    args: Vec<Value>,
    env: Map<String, Value>,
    sha256: Option<String>,
}

fn parse_binary_distribution(value: Option<&Value>) -> Option<BinaryDistribution> {
    let value = value?;
    if !value.is_object() {
        return None;
    }
    let archive = read_https_url(value.get("archive"));
    let cmd = read_string(value.get("cmd"));
    let sha256 = read_string(value.get("sha256"));
    let cmd = cmd?;
    let normalized = cmd.replace('\\', "/");
    if archive.is_none()
        || cmd.contains(['\r', '\n', '\0'])
        || normalized.is_empty()
        || normalized.starts_with('/')
        || is_drive_absolute(&normalized)
        || normalized.split('/').any(|segment| segment == "..")
    {
        return None;
    }
    if let Some(sha256) = sha256.as_ref()
        && !is_sha256(sha256)
    {
        return None;
    }
    Some(BinaryDistribution {
        archive: archive?,
        cmd,
        args: read_string_array(value.get("args")),
        env: read_environment(value.get("env")),
        sha256: sha256.map(|value| value.to_ascii_lowercase()),
    })
}

/// `mergeFallbackDefinitions`.
pub fn merge_fallback_definitions(
    registry_providers: &[Value],
    fallback_definitions: &[Value],
    prefer_fallback_definitions: bool,
) -> Vec<Value> {
    merge_fallback_definitions_with_collation(
        registry_providers,
        fallback_definitions,
        prefer_fallback_definitions,
        &AcpCollation::default(),
    )
}

/// Ordered fallback merge with an injected collation.
pub fn merge_fallback_definitions_with_collation(
    registry_providers: &[Value],
    fallback_definitions: &[Value],
    prefer_fallback_definitions: bool,
    collation: &AcpCollation,
) -> Vec<Value> {
    let mut merged: Vec<Value> = Vec::new();
    let mut positions: HashMap<String, usize> = HashMap::new();
    for provider in registry_providers {
        let key = merge_key(provider);
        match positions.entry(key) {
            std::collections::hash_map::Entry::Occupied(entry) => {
                merged[*entry.get()] = provider.clone()
            }
            std::collections::hash_map::Entry::Vacant(entry) => {
                entry.insert(merged.len());
                merged.push(provider.clone());
            }
        }
    }
    for fallback in fallback_definitions {
        if fallback.get("auth") == Some(&Value::Bool(false)) {
            continue;
        }
        let key = merge_key(fallback);
        match positions.get(&key).copied() {
            Some(position) if prefer_fallback_definitions => merged[position] = fallback.clone(),
            Some(_) => {}
            None => {
                positions.insert(key, merged.len());
                merged.push(fallback.clone());
            }
        }
    }
    merged.sort_by(|left, right| {
        collation.compare(
            left.get("name").and_then(Value::as_str).unwrap_or_default(),
            right
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or_default(),
        )
    });
    merged
}

fn merge_key(provider: &Value) -> String {
    match provider.get("id") {
        Some(Value::String(id)) => format!("s:{id}"),
        Some(other) => format!("v:{other}"),
        None => "v:null".into(),
    }
}

/// `currentPlatformTarget`.
pub fn current_platform_target(platform: &str, architecture: Option<&str>) -> Option<String> {
    let platform = if platform == "win32" {
        "windows"
    } else {
        platform
    };
    let architecture = match architecture {
        Some("arm64") => "aarch64",
        Some("x64") => "x86_64",
        _ => return None,
    };
    if !["darwin", "linux", "windows"].contains(&platform) {
        return None;
    }
    Some(format!("{platform}-{architecture}"))
}

fn is_registry_id(value: &str) -> bool {
    let mut characters = value.chars();
    match characters.next() {
        Some(first) if first.is_ascii_lowercase() => {}
        _ => return false,
    }
    characters.all(|character| {
        character.is_ascii_lowercase() || character.is_ascii_digit() || character == '-'
    })
}

fn resolve_provider_id(registry_id: &str) -> String {
    PROVIDER_ID_ALIASES
        .iter()
        .find(|(alias, _)| *alias == registry_id)
        .map(|(_, provider)| (*provider).to_string())
        .unwrap_or_else(|| registry_id.to_string())
}

fn is_sha256(value: &str) -> bool {
    value.len() == 64 && value.chars().all(|character| character.is_ascii_hexdigit())
}

fn is_drive_absolute(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.len() >= 3 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':' && bytes[2] == b'/'
}

fn read_string(value: Option<&Value>) -> Option<String> {
    let raw = value?.as_str()?;
    let trimmed = js_trim(raw);
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn read_string_array(value: Option<&Value>) -> Vec<Value> {
    match value {
        Some(Value::Array(items)) => items
            .iter()
            .filter(|item| match item.as_str() {
                Some(text) => !text.contains(['\r', '\n', '\0']),
                None => false,
            })
            .cloned()
            .collect(),
        _ => Vec::new(),
    }
}

fn read_environment(value: Option<&Value>) -> Map<String, Value> {
    let mut environment = Map::new();
    if let Some(Value::Object(entries)) = value {
        for (key, entry) in entries {
            if is_environment_key(key) && entry.is_string() {
                environment.insert(key.clone(), entry.clone());
            }
        }
    }
    environment
}

fn is_environment_key(key: &str) -> bool {
    let mut characters = key.chars();
    match characters.next() {
        Some(first) if first.is_ascii_alphabetic() || first == '_' => {}
        _ => return false,
    }
    characters.all(|character| character.is_ascii_alphanumeric() || character == '_')
}

fn read_https_url(value: Option<&Value>) -> Option<String> {
    let raw = read_string(value)?;
    let url = url::Url::parse(&raw).ok()?;
    if url.scheme() != "https" {
        return None;
    }
    Some(url.to_string())
}

/// Base64url without padding (`Buffer.toString("base64url")`).
fn base64_url(bytes: &[u8]) -> String {
    const ALPHABET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let mut encoded = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let first = chunk[0] as u32;
        let second = *chunk.get(1).unwrap_or(&0) as u32;
        let third = *chunk.get(2).unwrap_or(&0) as u32;
        let bits = (first << 16) | (second << 8) | third;
        encoded.push(ALPHABET[(bits >> 18) as usize & 63] as char);
        encoded.push(ALPHABET[(bits >> 12) as usize & 63] as char);
        if chunk.len() > 1 {
            encoded.push(ALPHABET[(bits >> 6) as usize & 63] as char);
        }
        if chunk.len() > 2 {
            encoded.push(ALPHABET[bits as usize & 63] as char);
        }
    }
    encoded
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn agent(id: &str, name: &str, distribution: Value) -> Value {
        json!({"id":id,"name":name,"version":"1","description":"test","distribution":distribution})
    }

    #[test]
    fn package_validation_aliases_and_argument_filtering() {
        let value = json!({"agents":[
            agent("codex-acp", " Test ", json!({"npx":{"package":" pkg ","args":["", "--stdio", "x\n", 1],"env":{"_OK":"", "1bad":"x", "NUMBER":2}},"uvx":{"package":"ignored"}})),
            agent("codex", "Duplicate alias", json!({"uvx":{"package":"other"}})),
            agent("bad", "Bad package", json!({"npx":{"package":"x\ny"}}))
        ]});
        let rows = parse_acp_registry_with(&value, &RegistryRuntime::default()).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0]["id"], "codex");
        assert_eq!(rows[0]["name"], "Test");
        assert_eq!(rows[0]["args"], json!(["-y", "pkg", "", "--stdio"]));
        assert_eq!(rows[0]["env"], json!({"_OK":""}));
    }

    #[test]
    fn fallback_preference_and_disabled_auth_are_ordered() {
        let registry = vec![
            json!({"id":"b","name":"Zebra"}),
            json!({"id":"a","name":"apple"}),
        ];
        let fallback = vec![
            json!({"id":"b","name":"Banana"}),
            json!({"id":"c","name":"Hidden","auth":false}),
        ];
        let rows = merge_fallback_definitions(&registry, &fallback, false);
        assert_eq!(rows, vec![registry[1].clone(), registry[0].clone()]);
        let rows = merge_fallback_definitions(&registry, &fallback, true);
        assert_eq!(rows, vec![registry[1].clone(), fallback[0].clone()]);
    }

    #[test]
    fn binary_validation_platform_mapping_and_spec() {
        for (platform, arch, expected) in [
            ("linux", "x64", "linux-x86_64"),
            ("darwin", "arm64", "darwin-aarch64"),
            ("win32", "x64", "windows-x86_64"),
        ] {
            assert_eq!(
                current_platform_target(platform, Some(arch)).as_deref(),
                Some(expected)
            );
        }
        assert_eq!(current_platform_target("linux", Some("ia32")), None);
        assert_eq!(current_platform_target("freebsd", Some("x64")), None);
        let mut runtime = RegistryRuntime {
            state_dir_env: Some("/owned-state".into()),
            ..Default::default()
        };
        runtime.launcher = LauncherAdapter::configured("launcher", vec!["--native".into()]);
        let value = json!({"agents":[agent("test", "Binary", json!({"binary":{"linux-x86_64":{"archive":"https://example.test/a.tar.gz","cmd":"./agent","sha256":"A".repeat(64)}}}))]});
        let rows = parse_acp_registry_with(&value, &runtime).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0]["command"], "launcher");
        assert_eq!(rows[0]["args"][0], "--native");
        use base64::Engine;
        let spec = base64::engine::general_purpose::URL_SAFE_NO_PAD
            .decode(rows[0]["args"][1].as_str().unwrap())
            .unwrap();
        let spec: Value = serde_json::from_slice(&spec).unwrap();
        assert_eq!(spec["sha256"], "a".repeat(64));
        assert_eq!(spec["args"], json!([]));
        assert_eq!(
            rows[0]["env"]["JAIT_ACP_BINARY_ROOT"],
            "/owned-state/acp-agents"
        );
        for cmd in ["../agent", "/agent", "C:\\agent", "a/../b", "a\0b"] {
            assert!(
                parse_binary_distribution(Some(
                    &json!({"archive":"https://example.test/a","cmd":cmd})
                ))
                .is_none()
            );
        }
    }

    #[test]
    fn injected_collator_controls_order() {
        let mut preferences = icu_collator::CollatorPreferences::default();
        preferences.case_first = Some(icu_collator::preferences::CollationCaseFirst::Upper);
        let upper_first = AcpCollation::from_collator(
            Collator::try_new(preferences, CollatorOptions::default()).unwrap(),
        );
        let value = json!({"agents":[agent("lower", "ab", json!({"npx":{"package":"a"}})),agent("upper", "AB", json!({"npx":{"package":"z"}}))]});
        let rows =
            parse_acp_registry_with_collation(&value, &RegistryRuntime::default(), &upper_first)
                .unwrap();
        assert_eq!(rows[0]["id"], "upper");
        assert_eq!(
            parse_acp_registry_with(&value, &RegistryRuntime::default()).unwrap()[0]["id"],
            "lower"
        );
    }

    #[test]
    fn constructor_registry_id_remains_text() {
        let value =
            json!({"agents":[agent("constructor", "Constructor", json!({"npx":{"package":"x"}}))]});
        let rows = parse_acp_registry_with(&value, &RegistryRuntime::default()).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0]["id"], "constructor");
        assert_eq!(rows[0]["providerType"], "constructor");
        assert_eq!(rows[0]["registry"]["id"], "constructor");
    }

    #[tokio::test]
    async fn disabled_registry_returns_fallback_before_path_or_url_resolution() {
        let client = AcpRegistry::new(RegistryRuntime {
            state_dir_env: Some("relative".into()),
            registry_url_env: Some("".into()),
            disabled_env: Some("1".into()),
            ..Default::default()
        });
        let fallback = vec![json!({"id":"b","auth":false}), json!({"id":"a"})];
        let rows = client
            .load(LoadAcpRegistryOptions {
                fallback_definitions: fallback.clone(),
                ..Default::default()
            })
            .await
            .unwrap();
        assert_eq!(rows, fallback);
        assert!(!client.has_inflight_load());
        assert!(client.memory_cache_snapshot().is_none());
    }
}
