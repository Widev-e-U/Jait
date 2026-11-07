//! Matrix Docker operation planning and initialization coordination. Neither
//! planning nor coordination grants execution, filesystem, network, or consent
//! authority. An effect owner must authorize each effect and pin project-local
//! data against replacement. This module supplies no concrete effect host and
//! does not read credentials, invoke Docker, or activate a service.
//!
//! Remaining work: a concrete authorized initialization host and runtime wiring,
//! project-root scoped storage and exclusive bridge registration, credential-safe interactive I/O,
//! Docker and loopback execution with per-effect consent, cancellation and child
//! supervision, daemon identity and existence revalidation, actual-source
//! differential contracts, and supported-platform evidence. The planner rejects
//! unpinned settings, root ownership and mismatched namespaces deliberately;
//! these stricter choices require client compatibility review. Its path checks
//! are lexical and do not establish symlink or rename safety. No component
//! completeness or production-readiness claim follows from this planning slice.
use sha2::{Digest, Sha256};
use std::path::{Component, Path};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Config {
    pub server_name: String,
    pub port: u16,
    pub image: String,
    pub container: String,
    pub network: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct HostOwner {
    pub uid: u32,
    pub gid: u32,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Command {
    Start {
        container_exists: bool,
        network_exists: bool,
    },
    Stop,
    Restart,
    Logs,
    Status,
    Register,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Effect {
    Docker {
        argv: Vec<String>,
        interactive: bool,
        capture: bool,
    },
    /// Must create beneath an already-authorized, pinned directory; an existing
    /// initialization must be preserved atomically by the effect owner.
    PrepareDataDirectory,
    /// Must copy without replacement using pinned project and destination roots.
    /// Registration contents are secret and must never enter logs or model output.
    CopyBridgeExclusive {
        source_relative: String,
        bridge_id: String,
    },
    /// Must atomically create private settings only after successful generation.
    WriteSettingsExclusive { config: Config },
    /// The effect owner must restrict this probe to loopback, disable redirects
    /// and ambient proxy settings, and enforce the given overall timeout.
    LoopbackReadiness {
        port: u16,
        path: &'static str,
        timeout_ms: u64,
    },
}

fn err(message: &'static str) -> String {
    message.into()
}

/// Derive the reference container/network name from the data directory string.
/// Inputs must already be normalized and backed by a separately authorized scope.
pub fn runtime_name(data_dir: &str) -> Result<String, String> {
    let canonical = canonical_data_dir(data_dir)?;
    Ok(format!(
        "jait-matrix-{}",
        &hex::encode(Sha256::digest(canonical.as_bytes()))[..10]
    ))
}

/// Canonical spelling of the mount source: `/` plus each normal segment.
///
/// The reference implementation hashes the resolved directory, so `/data/`
/// and `/data/./matrix` must name the same runtime as `/data` and
/// `/data/matrix`. Hashing the raw string would give one directory several
/// container names, and therefore several containers mounting it at once.
fn canonical_data_dir(data_dir: &str) -> Result<String, String> {
    validate_data_dir(data_dir)?;
    let mut canonical = String::new();
    for part in Path::new(data_dir).components() {
        if let Component::Normal(segment) = part {
            canonical.push('/');
            canonical.push_str(&segment.to_string_lossy());
        }
    }
    if canonical.is_empty() {
        canonical.push('/');
    }
    Ok(canonical)
}

fn validate_data_dir(data_dir: &str) -> Result<(), String> {
    let path = Path::new(data_dir);
    if !path.is_absolute()
        || path
            .components()
            .any(|part| !matches!(part, Component::RootDir | Component::Normal(_)))
        || data_dir.contains([',', '\0', '\n', '\r'])
    {
        return Err(err(
            "Matrix data directory must be a normalized absolute mount path",
        ));
    }
    Ok(())
}

fn validate(config: &Config, data_dir: &str, owner: HostOwner) -> Result<(), String> {
    validate_data_dir(data_dir)?;
    if owner.uid == 0 {
        return Err(err("Matrix containers require a non-root host user"));
    }
    if config.port < 1024 {
        return Err(err("Port must be between 1024 and 65535"));
    }
    let mut chars = config.server_name.chars();
    if !chars.next().is_some_and(|c| c.is_ascii_alphanumeric())
        || !chars.all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-'))
    {
        return Err(err("Use a stable DNS hostname as the server name"));
    }
    let expected = runtime_name(data_dir)?;
    if config.container != expected || config.network != expected {
        return Err(err(
            "Matrix container and network do not match the authorized data directory",
        ));
    }
    // The script persists the first registry digest after pull. Tighten the
    // untrusted-settings boundary: reject options and unpinned image names.
    let Some((name, digest)) = config.image.rsplit_once("@sha256:") else {
        return Err(err("A pinned image digest is required"));
    };
    if name.is_empty()
        || name.starts_with('-')
        || name.chars().any(|c| c.is_whitespace() || c.is_control())
        || digest.len() != 64
        || !digest.bytes().all(|b| b.is_ascii_hexdigit())
    {
        return Err(err("Invalid pinned image digest"));
    }
    Ok(())
}

/// Decode untrusted runtime settings after the host has opened the file through
/// a pinned, authorized directory. The host must impose the same byte limit
/// during the read and reject non-regular files; this parser grants no scope or
/// execution authority. Unknown fields are ignored like the JavaScript reader.
pub fn parse_settings(bytes: &[u8], data_dir: &str, owner: HostOwner) -> Result<Config, String> {
    const MAX_SETTINGS_BYTES: usize = 64 * 1024;
    if bytes.len() > MAX_SETTINGS_BYTES {
        return Err(err("Matrix settings exceed the size limit"));
    }
    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct StoredConfig {
        server_name: String,
        port: u16,
        image: String,
        container: String,
        network: String,
    }
    let stored: StoredConfig =
        serde_json::from_slice(bytes).map_err(|_| err("Invalid Matrix runtime settings"))?;
    let config = Config {
        server_name: stored.server_name,
        port: stored.port,
        image: stored.image,
        container: stored.container,
        network: stored.network,
    };
    validate(&config, data_dir, owner)?;
    Ok(config)
}

#[derive(Debug, PartialEq, Eq)]
pub struct StatusReport {
    pub container_status: String,
    pub client_api_ready: bool,
}

/// Interpret successful Docker inspection and a completed loopback probe. The
/// host must enforce the loopback-only/no-redirect/no-proxy probe contract in
/// `Effect`; `None` represents a network error or timeout. A non-2xx HTTP status
/// is not ready. Docker's untrusted output is bounded and control characters
/// rejected before it is displayed. Rejecting such output is stricter than the
/// reference, which prints the trimmed output directly.
pub fn status_report(
    inspect_stdout: &[u8],
    http_status: Option<u16>,
) -> Result<StatusReport, String> {
    if inspect_stdout.len() > 4096 {
        return Err(err("Docker status output exceeds limit"));
    }
    let text = String::from_utf8_lossy(inspect_stdout);
    let status = text.trim();
    if status.chars().any(char::is_control) {
        return Err(err("Invalid Docker status output"));
    }
    Ok(StatusReport {
        container_status: status.to_owned(),
        client_api_ready: http_status.is_some_and(|code| (200..300).contains(&code)),
    })
}

/// Output for a status command after a successful Docker inspection and probe.
/// The CLI owner must emit stdout before stderr and use `exit_code` as the
/// process status. Inspection failures must stop before probing and are handled
/// by the effect owner, not this renderer.
#[derive(Debug, PartialEq, Eq)]
pub struct StatusCliOutcome {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
}

pub fn render_status_cli(
    inspect_stdout: &[u8],
    http_status: Option<u16>,
) -> Result<StatusCliOutcome, String> {
    let report = status_report(inspect_stdout, http_status)?;
    let mut stdout = format!("{}\n", report.container_status);
    if report.client_api_ready {
        stdout.push_str("Matrix client API is ready.\n");
        Ok(StatusCliOutcome {
            stdout,
            stderr: String::new(),
            exit_code: 0,
        })
    } else {
        Ok(StatusCliOutcome {
            stdout,
            stderr: "Matrix client API is not ready yet. Inspect logs.\n".into(),
            exit_code: 1,
        })
    }
}

/// A future effect host must bind the lease to an authorized Docker daemon and
/// project scope. Inspection and probing must enforce their respective output,
/// loopback, timeout and cancellation limits before returning. A probe returns
/// `None` for transport failure; denied authority is an error, not a probe result.
/// Every method must revalidate lease authority at its effect boundary, honor
/// cancellation, and return only after supervised work has stopped. Output
/// methods must flush before returning and never interpret terminal controls.
// Staged host trait; its future bounds will be chosen with its runtime owner.
#[allow(async_fn_in_trait)]
pub trait StatusHost {
    type Lease;
    async fn inspect(
        &mut self,
        lease: &mut Self::Lease,
        effect: &Effect,
        cancellation: &mut tokio::sync::watch::Receiver<bool>,
    ) -> Result<Vec<u8>, ()>;
    async fn probe(
        &mut self,
        lease: &mut Self::Lease,
        effect: &Effect,
        cancellation: &mut tokio::sync::watch::Receiver<bool>,
    ) -> Result<Option<u16>, ()>;
    async fn stdout(
        &mut self,
        lease: &mut Self::Lease,
        text: &str,
        cancellation: &mut tokio::sync::watch::Receiver<bool>,
    ) -> Result<(), ()>;
    async fn stderr(
        &mut self,
        lease: &mut Self::Lease,
        text: &str,
        cancellation: &mut tokio::sync::watch::Receiver<bool>,
    ) -> Result<(), ()>;
}

#[derive(Debug, PartialEq, Eq)]
pub enum StatusError {
    InvalidPlan,
    Cancelled,
    EffectFailed,
    InvalidOutput,
}

/// Preserve the CLI's observable order: inspect, print status, then probe and
/// print readiness. The caller supplies an already-authorized lease; this function
/// neither creates authority nor provides a concrete process or network host.
pub async fn execute_status<H: StatusHost>(
    host: &mut H,
    lease: &mut H::Lease,
    config: &Config,
    data_dir: &str,
    owner: HostOwner,
    cancellation: &mut tokio::sync::watch::Receiver<bool>,
) -> Result<i32, StatusError> {
    let effects =
        plan(Command::Status, config, data_dir, owner).map_err(|_| StatusError::InvalidPlan)?;
    if *cancellation.borrow() {
        return Err(StatusError::Cancelled);
    }
    let inspected = host
        .inspect(lease, &effects[0], cancellation)
        .await
        .map_err(|_| {
            if *cancellation.borrow() {
                StatusError::Cancelled
            } else {
                StatusError::EffectFailed
            }
        })?;
    let report = status_report(&inspected, None).map_err(|_| StatusError::InvalidOutput)?;
    if *cancellation.borrow() {
        return Err(StatusError::Cancelled);
    }
    host.stdout(
        lease,
        &format!("{}\n", report.container_status),
        cancellation,
    )
    .await
    .map_err(|_| {
        if *cancellation.borrow() {
            StatusError::Cancelled
        } else {
            StatusError::EffectFailed
        }
    })?;
    if *cancellation.borrow() {
        return Err(StatusError::Cancelled);
    }
    let probe = host
        .probe(lease, &effects[1], cancellation)
        .await
        .map_err(|_| {
            if *cancellation.borrow() {
                StatusError::Cancelled
            } else {
                StatusError::EffectFailed
            }
        })?;
    if *cancellation.borrow() {
        return Err(StatusError::Cancelled);
    }
    let outcome = render_status_cli(&inspected, probe).map_err(|_| StatusError::InvalidOutput)?;
    if outcome.exit_code == 0 {
        host.stdout(lease, "Matrix client API is ready.\n", cancellation)
            .await
            .map_err(|_| {
                if *cancellation.borrow() {
                    StatusError::Cancelled
                } else {
                    StatusError::EffectFailed
                }
            })?;
    } else {
        host.stderr(lease, &outcome.stderr, cancellation)
            .await
            .map_err(|_| {
                if *cancellation.borrow() {
                    StatusError::Cancelled
                } else {
                    StatusError::EffectFailed
                }
            })?;
    }
    if *cancellation.borrow() {
        return Err(StatusError::Cancelled);
    }
    Ok(outcome.exit_code)
}

#[derive(Debug, PartialEq, Eq)]
pub enum ReadinessProbeError {
    Cancelled,
    InvalidPort,
}

/// A single direct HTTP/1.1 request to IPv4 loopback. This primitive grants no
/// network authority: the host must authorize this exact effect at dispatch.
/// It never consults DNS or proxy settings, follows no redirects, reads no body,
/// and bounds both the response headers and total elapsed time. Transport,
/// malformed-response and timeout failures are reported as an unavailable API.
/// The cumulative 16 KiB header limit, no redirects, and HTTP/1-only parsing
/// are intentional compatibility limits relative to the reference fetch.
pub async fn probe_loopback_readiness(
    port: u16,
    cancellation: &mut tokio::sync::watch::Receiver<bool>,
) -> Result<Option<u16>, ReadinessProbeError> {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    if port == 0 {
        return Err(ReadinessProbeError::InvalidPort);
    }
    if *cancellation.borrow() {
        return Err(ReadinessProbeError::Cancelled);
    }
    let request = async {
        let mut socket = tokio::net::TcpStream::connect((std::net::Ipv4Addr::LOCALHOST, port))
            .await
            .ok()?;
        let bytes = format!(
            "GET /_matrix/client/versions HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n"
        );
        socket.write_all(bytes.as_bytes()).await.ok()?;
        let mut total = 0usize;
        loop {
            let mut headers = Vec::new();
            while total < 16 * 1024 {
                let mut byte = [0u8; 1];
                if socket.read(&mut byte).await.ok()? == 0 {
                    return None;
                }
                total += 1;
                headers.push(byte[0]);
                if headers.ends_with(b"\r\n\r\n") {
                    break;
                }
            }
            if !headers.ends_with(b"\r\n\r\n") {
                return None;
            }
            let mut lines = headers.split(|b| *b == b'\n');
            let status_line = lines.next()?.strip_suffix(b"\r")?;
            for header in lines {
                if header.is_empty() || header == b"\r" {
                    continue;
                }
                let header = header.strip_suffix(b"\r")?;
                let colon = header.iter().position(|b| *b == b':')?;
                let (name, value) = header.split_at(colon);
                if name.is_empty()
                    || !name
                        .iter()
                        .all(|b| b.is_ascii_alphanumeric() || b"!#$%&'*+-.^_`|~".contains(b))
                    || value[1..]
                        .iter()
                        .any(|b| *b < 32 && *b != b'\t' || *b == 127)
                {
                    return None;
                }
            }
            let rest = status_line
                .strip_prefix(b"HTTP/1.1 ")
                .or_else(|| status_line.strip_prefix(b"HTTP/1.0 "))?;
            if rest.len() < 3
                || !rest[..3].iter().all(u8::is_ascii_digit)
                || (rest.len() > 3 && rest[3] != b' ')
            {
                return None;
            }
            let status = u16::from(rest[0] - b'0') * 100
                + u16::from(rest[1] - b'0') * 10
                + u16::from(rest[2] - b'0');
            if !(100..=599).contains(&status) || status == 101 {
                return None;
            }
            if status >= 200 {
                return Some(status);
            }
        }
    };
    tokio::select! {
        biased;
        _ = async {
            loop {
                if *cancellation.borrow() { break; }
                if cancellation.changed().await.is_err() { break; }
            }
        } => Err(ReadinessProbeError::Cancelled),
        result = tokio::time::timeout(std::time::Duration::from_secs(5), request) => Ok(result.unwrap_or(None)),
    }
}

fn docker(args: Vec<String>, interactive: bool, capture: bool) -> Effect {
    Effect::Docker {
        argv: args,
        interactive,
        capture,
    }
}
fn words(values: &[&str]) -> Vec<String> {
    values.iter().map(|s| (*s).to_owned()).collect()
}

/// Parse the captured `docker image inspect` RepoDigests result. The first
/// entry is selected like the reference; malformed or oversized output must
/// never reach a subsequent Docker invocation. Capture itself must be bounded
/// by the effect owner, which also binds this result to the authorized daemon.
pub fn resolve_image_digest(output: &[u8]) -> Result<String, String> {
    const MAX_INSPECT_BYTES: usize = 64 * 1024;
    if output.len() > MAX_INSPECT_BYTES {
        return Err(err("Docker image inspection output exceeds limit"));
    }
    let digests: Vec<String> = serde_json::from_slice(output)
        .map_err(|_| err("Could not resolve a pinned image digest"))?;
    let digest = digests
        .first()
        .ok_or_else(|| err("Could not resolve a pinned image digest"))?;
    let Some((name, hash)) = digest.rsplit_once("@sha256:") else {
        return Err(err("Invalid pinned image digest"));
    };
    if name.is_empty()
        || name.starts_with('-')
        || name.chars().any(|c| c.is_control() || c.is_whitespace())
        || hash.len() != 64
        || !hash.bytes().all(|b| b.is_ascii_hexdigit())
    {
        return Err(err("Invalid pinned image digest"));
    }
    Ok(digest.clone())
}

/// The host owns scope, consent, pinned directories, process supervision and
/// daemon binding. `begin_authorized` must atomically acquire an exclusive
/// initialization lease and reject existing settings or homeserver data before
/// returning. The lease must retain the pinned directory, daemon capability and
/// exclusivity until dropped. Each effect must revalidate authorization at its
/// boundary and bind Docker results to that same daemon. Capture must be limited
/// to 64 KiB while reading, not merely truncated after allocation. Interactive
/// data must not be captured. Cancellation must stop and reap child processes
/// before a host future returns; dropping a future is not sufficient cleanup.
// Staged host trait; its future bounds will be chosen with its runtime owner.
#[allow(async_fn_in_trait)]
pub trait InitializationHost {
    type Daemon;
    type Lease;
    async fn begin_authorized(
        &mut self,
        daemon: &Self::Daemon,
        data_dir: &str,
        cancellation: &mut tokio::sync::watch::Receiver<bool>,
    ) -> Result<Self::Lease, ()>;
    async fn execute_authorized(
        &mut self,
        lease: &mut Self::Lease,
        effect: &Effect,
        cancellation: &mut tokio::sync::watch::Receiver<bool>,
    ) -> Result<Vec<u8>, ()>;
}

#[derive(Debug, PartialEq, Eq)]
pub enum InitializationError {
    InvalidPlan,
    Cancelled,
    EffectFailed,
    InvalidInspectOutput,
}

/// Execute initialization in order against one host-owned daemon capability.
/// The host must reject an existing initialization before any effects occur.
/// Partial effects are deliberately retained on failure, like the reference;
/// retries must recheck the directory and must not overwrite existing data.
/// This coordinator confers no authority and is not a concrete Docker host.
pub async fn execute_initialization<H: InitializationHost>(
    host: &mut H,
    daemon: &H::Daemon,
    image: &str,
    mut config: Config,
    data_dir: &str,
    owner: HostOwner,
    cancellation: &mut tokio::sync::watch::Receiver<bool>,
) -> Result<Config, InitializationError> {
    let initial =
        plan_init_pull(image, data_dir, owner).map_err(|_| InitializationError::InvalidPlan)?;
    // Check all user-controlled settings before pulling or preparing anything.
    let mut preflight = config.clone();
    preflight.image = format!("preflight@sha256:{}", "0".repeat(64));
    plan_init_generate(&preflight, data_dir, owner)
        .map_err(|_| InitializationError::InvalidPlan)?;
    if *cancellation.borrow() {
        return Err(InitializationError::Cancelled);
    }
    let mut lease = host
        .begin_authorized(daemon, data_dir, cancellation)
        .await
        .map_err(|_| {
            if *cancellation.borrow() {
                InitializationError::Cancelled
            } else {
                InitializationError::EffectFailed
            }
        })?;
    let mut inspect = Vec::new();
    for (index, effect) in initial.iter().enumerate() {
        if *cancellation.borrow() {
            return Err(InitializationError::Cancelled);
        }
        let output = host
            .execute_authorized(&mut lease, effect, cancellation)
            .await
            .map_err(|_| {
                if *cancellation.borrow() {
                    InitializationError::Cancelled
                } else {
                    InitializationError::EffectFailed
                }
            })?;
        if output.len() > 64 * 1024 {
            return Err(InitializationError::InvalidInspectOutput);
        }
        if index == initial.len() - 1 {
            inspect = output;
        }
    }
    if *cancellation.borrow() {
        return Err(InitializationError::Cancelled);
    }
    config.image =
        resolve_image_digest(&inspect).map_err(|_| InitializationError::InvalidInspectOutput)?;
    let generate = plan_init_generate(&config, data_dir, owner)
        .map_err(|_| InitializationError::InvalidPlan)?;
    for effect in &generate {
        if *cancellation.borrow() {
            return Err(InitializationError::Cancelled);
        }
        let output = host
            .execute_authorized(&mut lease, effect, cancellation)
            .await
            .map_err(|_| {
                if *cancellation.borrow() {
                    InitializationError::Cancelled
                } else {
                    InitializationError::EffectFailed
                }
            })?;
        if output.len() > 64 * 1024 {
            return Err(InitializationError::EffectFailed);
        }
    }
    // Once the final settings write succeeds, report success even if a late
    // cancellation arrives: the initialization has already committed.
    Ok(config)
}

/// First initialization stage. The caller must authorize the project root,
/// pin its data directory, and atomically reject existing settings/homeserver
/// before executing any returned effects. Resolve the first image digest from
/// the inspect result; do not execute stage two if resolution fails.
pub fn plan_init_pull(
    image: &str,
    data_dir: &str,
    owner: HostOwner,
) -> Result<Vec<Effect>, String> {
    validate_data_dir(data_dir)?;
    if owner.uid == 0 {
        return Err(err("Matrix containers require a non-root host user"));
    }
    if image.is_empty()
        || image.starts_with('-')
        || image.chars().any(|c| c.is_control() || c.is_whitespace())
    {
        return Err(err("Invalid image reference"));
    }
    Ok(vec![
        Effect::PrepareDataDirectory,
        docker(vec!["pull".into(), image.into()], false, false),
        docker(
            vec![
                "image".into(),
                "inspect".into(),
                image.into(),
                "--format".into(),
                "{{json .RepoDigests}}".into(),
            ],
            false,
            true,
        ),
    ])
}

fn run_container(config: &Config, data_dir: &str, owner: HostOwner, tail: &[&str]) -> Effect {
    let mut args = words(&["run", "--rm", "--user"]);
    args.push(format!("{}:{}", owner.uid, owner.gid));
    args.extend(words(&["--env", "HOME=/data", "--mount"]));
    args.push(format!("type=bind,src={data_dir},dst=/data"));
    args.push(config.image.clone());
    args.extend(words(tail));
    docker(args, false, false)
}
fn configure(config: &Config, data_dir: &str, owner: HostOwner, script: String) -> Effect {
    let mut args = words(&["run", "--rm", "--user"]);
    args.push(format!("{}:{}", owner.uid, owner.gid));
    args.extend(words(&["--env", "HOME=/data", "--mount"]));
    args.push(format!("type=bind,src={data_dir},dst=/data"));
    args.extend(words(&["--entrypoint", "python"]));
    args.push(config.image.clone());
    args.push("-c".into());
    args.push(script);
    docker(args, false, false)
}

/// Second initialization stage after a verified digest has been resolved. The
/// effect owner must retain exclusive initialization ownership across stages,
/// stop on failure, supervise child exit, and leave partial state observable.
pub fn plan_init_generate(
    config: &Config,
    data_dir: &str,
    owner: HostOwner,
) -> Result<Vec<Effect>, String> {
    validate(config, data_dir, owner)?;
    let mut generate = match run_container(config, data_dir, owner, &["generate"]) {
        Effect::Docker { argv, .. } => argv,
        _ => unreachable!(),
    };
    let position = generate
        .iter()
        .position(|v| v == "--mount")
        .expect("fixed argv");
    generate.splice(
        position..position,
        [
            "--env".into(),
            format!("SYNAPSE_SERVER_NAME={}", config.server_name),
            "--env".into(),
            "SYNAPSE_REPORT_STATS=no".into(),
        ],
    );
    let script = format!(
        "from pathlib import Path\nimport yaml\np = Path(\"/data/homeserver.yaml\")\nc = yaml.safe_load(p.read_text())\nc.update({{\"enable_registration\": False, \"report_stats\": False, \"public_baseurl\": \"http://localhost:{}/\", \"federation_domain_whitelist\": [], \"max_upload_size\": \"20M\"}})\nc[\"listeners\"] = [{{\"port\": 8008, \"tls\": False, \"type\": \"http\", \"x_forwarded\": True, \"bind_addresses\": [\"0.0.0.0\"], \"resources\": [{{\"names\": [\"client\"], \"compress\": False}}]}}]\nc[\"app_service_config_files\"] = []\np.write_text(yaml.safe_dump(c, sort_keys=False))",
        config.port
    );
    Ok(vec![
        docker(generate, false, false),
        configure(config, data_dir, owner, script),
        Effect::WriteSettingsExclusive {
            config: config.clone(),
        },
    ])
}

/// Plan bridge registration without reading or exposing registration contents.
/// The executor must enforce a pinned project root, exclusive destination,
/// no symlink/rename escape and serialized configuration updates. A failure
/// after copying leaves the file in place as in the reference; report partial
/// completion and never silently replace it on retry.
pub fn plan_bridge(
    config: &Config,
    data_dir: &str,
    owner: HostOwner,
    bridge_id: &str,
    source_relative: &str,
) -> Result<Vec<Effect>, String> {
    validate(config, data_dir, owner)?;
    if bridge_id.is_empty()
        || !bridge_id
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
    {
        return Err(err("Invalid bridge id"));
    }
    let source = Path::new(source_relative);
    if source_relative.is_empty()
        || source.is_absolute()
        || source
            .components()
            .any(|c| !matches!(c, Component::Normal(_)))
        || source_relative.contains(['\0', '\\'])
    {
        return Err(err("Bridge registration must be a project-relative path"));
    }
    let script = format!(
        "from pathlib import Path\nimport yaml\np = Path(\"/data/homeserver.yaml\")\nc = yaml.safe_load(p.read_text())\nregistration = \"/data/appservices/{}.yaml\"\nr = yaml.safe_load(Path(registration).read_text())\nassert all(k in r for k in [\"id\", \"url\", \"as_token\", \"hs_token\", \"sender_localpart\", \"namespaces\"]), \"Invalid appservice registration\"\nc.setdefault(\"app_service_config_files\", []).append(registration)\np.write_text(yaml.safe_dump(c, sort_keys=False))",
        bridge_id
    );
    Ok(vec![
        Effect::CopyBridgeExclusive {
            source_relative: source_relative.into(),
            bridge_id: bridge_id.into(),
        },
        configure(config, data_dir, owner, script),
    ])
}

/// Plans only a single authorized operation. Existence observations must be
/// fresh and bound to the same Docker daemon by the effect owner; this is not a
/// transaction and must not be treated as authority to mutate a different daemon.
pub fn plan(
    command: Command,
    config: &Config,
    data_dir: &str,
    owner: HostOwner,
) -> Result<Vec<Effect>, String> {
    validate(config, data_dir, owner)?;
    let owner_arg = format!("{}:{}", owner.uid, owner.gid);
    let mount = format!("type=bind,src={data_dir},dst=/data");
    let mut out = Vec::new();
    match command {
        Command::Start {
            container_exists: true,
            ..
        } => out.push(docker(
            vec!["start".into(), config.container.clone()],
            false,
            false,
        )),
        Command::Start {
            container_exists: false,
            network_exists,
        } => {
            if !network_exists {
                out.push(docker(
                    vec!["network".into(), "create".into(), config.network.clone()],
                    false,
                    true,
                ));
            }
            let mut args = words(&["run", "-d", "--name"]);
            args.push(config.container.clone());
            args.extend(words(&["--restart", "unless-stopped", "--network"]));
            args.push(config.network.clone());
            args.extend(words(&["--network-alias", "synapse", "-p"]));
            args.push(format!("127.0.0.1:{}:8008", config.port));
            args.extend(words(&["--user"]));
            args.push(owner_arg);
            args.extend(words(&["--env", "HOME=/data", "--mount"]));
            args.push(mount);
            args.push(config.image.clone());
            out.push(docker(args, false, false));
        }
        Command::Stop | Command::Restart | Command::Logs => {
            let mut args = match command {
                Command::Stop => words(&["stop"]),
                Command::Restart => words(&["restart"]),
                _ => words(&["logs", "--tail", "100"]),
            };
            args.push(config.container.clone());
            out.push(docker(args, false, false));
        }
        Command::Status => {
            out.push(docker(
                vec![
                    "inspect".into(),
                    config.container.clone(),
                    "--format".into(),
                    "{{.State.Status}}".into(),
                ],
                false,
                true,
            ));
            out.push(Effect::LoopbackReadiness {
                port: config.port,
                path: "/_matrix/client/versions",
                timeout_ms: 5000,
            });
        }
        Command::Register => {
            let mut args = words(&["exec", "-it", "--user"]);
            args.push(owner_arg);
            args.push(config.container.clone());
            args.extend(words(&[
                "register_new_matrix_user",
                "-c",
                "/data/homeserver.yaml",
                "http://localhost:8008",
            ]));
            out.push(docker(args, true, false));
        }
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn config() -> Config {
        let name = runtime_name("/project/.jait/artifacts/matrix").unwrap();
        Config {
            server_name: "jait.local".into(),
            port: 8008,
            image: format!("synapse@sha256:{}", "a".repeat(64)),
            container: name.clone(),
            network: name,
        }
    }
    #[test]
    fn start_preserves_owner_and_loopback_binding() {
        let effects = plan(
            Command::Start {
                container_exists: false,
                network_exists: false,
            },
            &config(),
            "/project/.jait/artifacts/matrix",
            HostOwner {
                uid: 1000,
                gid: 1001,
            },
        )
        .unwrap();
        assert_eq!(effects.len(), 2);
        let Effect::Docker { argv, .. } = &effects[1] else {
            panic!()
        };
        assert!(argv.windows(2).any(|v| v == ["--user", "1000:1001"]));
        assert!(argv.windows(2).any(|v| v == ["-p", "127.0.0.1:8008:8008"]));
        assert!(!argv.iter().any(|v| v == "--rm"));
    }
    #[test]
    fn rejects_untrusted_settings_and_unsafe_mounts() {
        let dir = "/project/.jait/artifacts/matrix";
        let owner = HostOwner {
            uid: 1000,
            gid: 1000,
        };
        let mut c = config();
        c.container = "--privileged".into();
        assert!(plan(Command::Stop, &c, dir, owner).is_err());
        let mut c = config();
        c.image = "synapse:latest".into();
        assert!(plan(Command::Stop, &c, dir, owner).is_err());
        assert!(plan(Command::Stop, &config(), dir, HostOwner { uid: 0, gid: 0 }).is_err());
        assert!(runtime_name("/project/a,readonly").is_err());
        assert!(runtime_name("/project/../outside").is_err());
    }
    #[test]
    fn status_and_interactive_register_are_explicit() {
        let c = config();
        let dir = "/project/.jait/artifacts/matrix";
        let owner = HostOwner {
            uid: 1000,
            gid: 1000,
        };
        let status = plan(Command::Status, &c, dir, owner).unwrap();
        assert!(matches!(
            status[1],
            Effect::LoopbackReadiness {
                port: 8008,
                timeout_ms: 5000,
                ..
            }
        ));
        let register = plan(Command::Register, &c, dir, owner).unwrap();
        assert!(matches!(
            &register[0],
            Effect::Docker {
                interactive: true,
                capture: false,
                ..
            }
        ));
    }
    #[test]
    fn initialization_requires_pinned_digest_and_preserves_sequence() {
        let dir = "/project/.jait/artifacts/matrix";
        let owner = HostOwner {
            uid: 1000,
            gid: 1000,
        };
        let pull = plan_init_pull("synapse:latest", dir, owner).unwrap();
        assert!(matches!(pull[0], Effect::PrepareDataDirectory));
        assert!(plan_init_pull("--privileged", dir, owner).is_err());
        let generate = plan_init_generate(&config(), dir, owner).unwrap();
        let Effect::Docker { argv, .. } = &generate[0] else {
            panic!()
        };
        assert!(
            argv.windows(2)
                .any(|v| v == ["--env", "SYNAPSE_SERVER_NAME=jait.local"])
        );
        assert_eq!(argv.last().unwrap(), "generate");
        assert!(matches!(generate[2], Effect::WriteSettingsExclusive { .. }));
    }

    #[test]
    fn image_inspect_selects_first_validated_digest_and_rejects_bad_output() {
        let first = format!("registry.example/synapse@sha256:{}", "a".repeat(64));
        let second = format!("registry.example/other@sha256:{}", "b".repeat(64));
        let output = serde_json::to_vec(&[&first, &second]).unwrap();
        assert_eq!(resolve_image_digest(&output).unwrap(), first);
        for bad in [
            b"null".as_slice(),
            b"[]",
            b"[1]",
            b"not json",
            b"[\"--option\"]",
        ] {
            assert!(resolve_image_digest(bad).is_err());
        }
        assert!(resolve_image_digest(&vec![b' '; 65_537]).is_err());
        let bad_first = serde_json::to_vec(&["invalid", &second]).unwrap();
        assert!(resolve_image_digest(&bad_first).is_err());
    }

    #[test]
    fn settings_parser_checks_namespace_and_untrusted_json() {
        let dir = "/project/.jait/artifacts/matrix";
        let owner = HostOwner {
            uid: 1000,
            gid: 1000,
        };
        let config = config();
        let mut stored = serde_json::json!({
            "serverName": &config.server_name, "port": config.port,
            "image": &config.image, "container": &config.container,
            "network": &config.network, "futureField": true
        });
        let bytes = serde_json::to_vec(&stored).unwrap();
        assert_eq!(parse_settings(&bytes, dir, owner).unwrap(), config);
        stored["container"] = serde_json::json!("--privileged");
        assert!(parse_settings(&serde_json::to_vec(&stored).unwrap(), dir, owner).is_err());
        assert!(parse_settings(&bytes, "/other/matrix", owner).is_err());
        assert!(parse_settings(b"{", dir, owner).is_err());
        assert!(parse_settings(b"null", dir, owner).is_err());
        assert!(parse_settings(&vec![b' '; 65_537], dir, owner).is_err());
    }

    #[test]
    fn status_interprets_probe_and_rejects_unsafe_output() {
        let ready = status_report(b" running\n", Some(200)).unwrap();
        assert_eq!(ready.container_status, "running");
        assert!(ready.client_api_ready);
        for status in [None, Some(199), Some(300), Some(503)] {
            assert!(!status_report(b"exited\n", status).unwrap().client_api_ready);
        }
        assert!(status_report(b"run\x1b[31ming", Some(200)).is_err());
        assert!(status_report(&vec![b'x'; 4097], Some(200)).is_err());
    }

    #[test]
    fn status_cli_preserves_reference_output_and_failure_status() {
        assert_eq!(
            render_status_cli(b" running\n", Some(204)).unwrap(),
            StatusCliOutcome {
                stdout: "running\nMatrix client API is ready.\n".into(),
                stderr: String::new(),
                exit_code: 0,
            }
        );
        for probe in [None, Some(302), Some(503)] {
            assert_eq!(
                render_status_cli(b"exited\n", probe).unwrap(),
                StatusCliOutcome {
                    stdout: "exited\n".into(),
                    stderr: "Matrix client API is not ready yet. Inspect logs.\n".into(),
                    exit_code: 1,
                }
            );
        }
    }

    #[tokio::test]
    async fn status_dispatch_orders_output_and_stops_on_inspect_failure() {
        struct Host {
            events: Vec<String>,
            fail_inspect: bool,
        }
        impl StatusHost for Host {
            type Lease = ();
            async fn inspect(
                &mut self,
                _: &mut (),
                _: &Effect,
                _: &mut tokio::sync::watch::Receiver<bool>,
            ) -> Result<Vec<u8>, ()> {
                self.events.push("inspect".into());
                if self.fail_inspect {
                    Err(())
                } else {
                    Ok(b"running\n".to_vec())
                }
            }
            async fn probe(
                &mut self,
                _: &mut (),
                _: &Effect,
                _: &mut tokio::sync::watch::Receiver<bool>,
            ) -> Result<Option<u16>, ()> {
                self.events.push("probe".into());
                Ok(None)
            }
            async fn stdout(
                &mut self,
                _: &mut (),
                text: &str,
                _: &mut tokio::sync::watch::Receiver<bool>,
            ) -> Result<(), ()> {
                self.events.push(format!("out:{text}"));
                Ok(())
            }
            async fn stderr(
                &mut self,
                _: &mut (),
                text: &str,
                _: &mut tokio::sync::watch::Receiver<bool>,
            ) -> Result<(), ()> {
                self.events.push(format!("err:{text}"));
                Ok(())
            }
        }
        let (_tx, mut cancel) = tokio::sync::watch::channel(false);
        let owner = HostOwner {
            uid: 1000,
            gid: 1000,
        };
        let dir = "/project/.jait/artifacts/matrix";
        let mut host = Host {
            events: vec![],
            fail_inspect: false,
        };
        assert_eq!(
            execute_status(&mut host, &mut (), &config(), dir, owner, &mut cancel).await,
            Ok(1)
        );
        assert_eq!(
            host.events,
            [
                "inspect",
                "out:running\n",
                "probe",
                "err:Matrix client API is not ready yet. Inspect logs.\n"
            ]
        );
        let mut host = Host {
            events: vec![],
            fail_inspect: true,
        };
        assert_eq!(
            execute_status(&mut host, &mut (), &config(), dir, owner, &mut cancel).await,
            Err(StatusError::EffectFailed)
        );
        assert_eq!(host.events, ["inspect"]);
    }

    #[tokio::test]
    async fn status_dispatch_stops_on_invalid_output_cancellation_and_denial() {
        struct Host {
            events: Vec<&'static str>,
            inspection: Vec<u8>,
            cancel_at: Option<&'static str>,
            tx: tokio::sync::watch::Sender<bool>,
        }
        impl Host {
            fn step(&mut self, name: &'static str) {
                self.events.push(name);
                if self.cancel_at == Some(name) {
                    self.tx.send_replace(true);
                }
            }
        }
        impl StatusHost for Host {
            type Lease = ();
            async fn inspect(
                &mut self,
                _: &mut (),
                _: &Effect,
                _: &mut tokio::sync::watch::Receiver<bool>,
            ) -> Result<Vec<u8>, ()> {
                self.step("inspect");
                Ok(self.inspection.clone())
            }
            async fn probe(
                &mut self,
                _: &mut (),
                _: &Effect,
                _: &mut tokio::sync::watch::Receiver<bool>,
            ) -> Result<Option<u16>, ()> {
                self.step("probe");
                Err(())
            }
            async fn stdout(
                &mut self,
                _: &mut (),
                _: &str,
                _: &mut tokio::sync::watch::Receiver<bool>,
            ) -> Result<(), ()> {
                self.step("stdout");
                Ok(())
            }
            async fn stderr(
                &mut self,
                _: &mut (),
                _: &str,
                _: &mut tokio::sync::watch::Receiver<bool>,
            ) -> Result<(), ()> {
                self.step("stderr");
                Ok(())
            }
        }
        let owner = HostOwner {
            uid: 1000,
            gid: 1000,
        };
        let dir = "/project/.jait/artifacts/matrix";
        let (tx, mut cancel) = tokio::sync::watch::channel(false);
        let mut host = Host {
            events: vec![],
            inspection: b"bad\x1b[31m".to_vec(),
            cancel_at: None,
            tx: tx.clone(),
        };
        assert_eq!(
            execute_status(&mut host, &mut (), &config(), dir, owner, &mut cancel).await,
            Err(StatusError::InvalidOutput)
        );
        assert_eq!(host.events, ["inspect"]);
        for (point, expected) in [
            ("inspect", vec!["inspect"]),
            ("stdout", vec!["inspect", "stdout"]),
        ] {
            tx.send_replace(false);
            let mut host = Host {
                events: vec![],
                inspection: b"running".to_vec(),
                cancel_at: Some(point),
                tx: tx.clone(),
            };
            assert_eq!(
                execute_status(&mut host, &mut (), &config(), dir, owner, &mut cancel).await,
                Err(StatusError::Cancelled)
            );
            assert_eq!(host.events, expected);
        }
        tx.send_replace(false);
        let mut host = Host {
            events: vec![],
            inspection: b"running".to_vec(),
            cancel_at: None,
            tx,
        };
        assert_eq!(
            execute_status(&mut host, &mut (), &config(), dir, owner, &mut cancel).await,
            Err(StatusError::EffectFailed)
        );
        assert_eq!(host.events, ["inspect", "stdout", "probe"]);
    }

    #[tokio::test]
    async fn loopback_probe_bounds_and_cancellation() {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        for (response, expected) in [
            (
                b"HTTP/1.1 100 Continue\r\n\r\nHTTP/1.1 200 OK\r\nX-Opaque: \xff\r\n\r\n"
                    .as_slice(),
                Some(200),
            ),
            (
                b"HTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n".as_slice(),
                Some(200),
            ),
            (
                b"HTTP/1.1 302 Found\r\nLocation: http://example.com/\r\n\r\n".as_slice(),
                Some(302),
            ),
            (
                b"HTTP/1.1 200 OK\r\ninvalid header\r\n\r\n".as_slice(),
                None,
            ),
            (b"HTTP/1.1 200 OK\r\n".as_slice(), None),
        ] {
            let listener = tokio::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0))
                .await
                .unwrap();
            let port = listener.local_addr().unwrap().port();
            let response = response.to_vec();
            let server = tokio::spawn(async move {
                let (mut stream, peer) = listener.accept().await.unwrap();
                assert!(peer.ip().is_loopback());
                let mut request = [0; 512];
                let n = stream.read(&mut request).await.unwrap();
                assert!(request[..n].starts_with(b"GET /_matrix/client/versions HTTP/1.1\r\n"));
                stream.write_all(&response).await.unwrap();
            });
            let (_tx, mut cancel) = tokio::sync::watch::channel(false);
            assert_eq!(
                probe_loopback_readiness(port, &mut cancel).await,
                Ok(expected)
            );
            server.await.unwrap();
        }
        let (tx, mut cancel) = tokio::sync::watch::channel(true);
        assert_eq!(
            probe_loopback_readiness(12345, &mut cancel).await,
            Err(ReadinessProbeError::Cancelled)
        );
        tx.send_replace(false);
        assert_eq!(
            probe_loopback_readiness(0, &mut cancel).await,
            Err(ReadinessProbeError::InvalidPort)
        );
    }

    #[tokio::test]
    async fn initialization_stops_after_denial_and_uses_one_daemon() {
        struct Host {
            calls: usize,
            fail_at: Option<usize>,
            existing: bool,
        }
        impl InitializationHost for Host {
            type Daemon = u8;
            type Lease = u8;
            async fn begin_authorized(
                &mut self,
                daemon: &u8,
                _: &str,
                _: &mut tokio::sync::watch::Receiver<bool>,
            ) -> Result<u8, ()> {
                if self.existing {
                    return Err(());
                }
                Ok(*daemon)
            }
            async fn execute_authorized(
                &mut self,
                lease: &mut u8,
                effect: &Effect,
                _: &mut tokio::sync::watch::Receiver<bool>,
            ) -> Result<Vec<u8>, ()> {
                assert_eq!(*lease, 42);
                self.calls += 1;
                if self.fail_at == Some(self.calls) {
                    return Err(());
                }
                if matches!(effect, Effect::Docker { capture: true, .. }) {
                    return Ok(
                        serde_json::to_vec(&[format!("synapse@sha256:{}", "a".repeat(64))])
                            .unwrap(),
                    );
                }
                Ok(Vec::new())
            }
        }
        let dir = "/project/.jait/artifacts/matrix";
        let owner = HostOwner {
            uid: 1000,
            gid: 1000,
        };
        let (_tx, mut rx) = tokio::sync::watch::channel(false);
        let mut host = Host {
            calls: 0,
            fail_at: Some(2),
            existing: false,
        };
        assert_eq!(
            execute_initialization(
                &mut host,
                &42,
                "synapse:latest",
                config(),
                dir,
                owner,
                &mut rx
            )
            .await,
            Err(InitializationError::EffectFailed)
        );
        assert_eq!(host.calls, 2);
        let mut host = Host {
            calls: 0,
            fail_at: None,
            existing: false,
        };
        let result = execute_initialization(
            &mut host,
            &42,
            "synapse:latest",
            config(),
            dir,
            owner,
            &mut rx,
        )
        .await
        .unwrap();
        assert!(result.image.starts_with("synapse@sha256:"));
        assert_eq!(host.calls, 6);
        let mut host = Host {
            calls: 0,
            fail_at: None,
            existing: false,
        };
        let mut bad = config();
        bad.container = "other".into();
        assert_eq!(
            execute_initialization(&mut host, &42, "synapse:latest", bad, dir, owner, &mut rx)
                .await,
            Err(InitializationError::InvalidPlan)
        );
        assert_eq!(host.calls, 0);
        host.existing = true;
        assert_eq!(
            execute_initialization(
                &mut host,
                &42,
                "synapse:latest",
                config(),
                dir,
                owner,
                &mut rx
            )
            .await,
            Err(InitializationError::EffectFailed)
        );
        assert_eq!(host.calls, 0);
        let (tx, mut cancelled) = tokio::sync::watch::channel(false);
        tx.send(true).unwrap();
        assert_eq!(
            execute_initialization(
                &mut host,
                &42,
                "synapse:latest",
                config(),
                dir,
                owner,
                &mut cancelled
            )
            .await,
            Err(InitializationError::Cancelled)
        );
        assert_eq!(host.calls, 0);
    }

    #[tokio::test]
    async fn cancellation_stops_dispatch_and_releases_lease() {
        use std::sync::{
            Arc,
            atomic::{AtomicBool, Ordering},
        };
        struct Lease(Arc<AtomicBool>);
        impl Drop for Lease {
            fn drop(&mut self) {
                self.0.store(true, Ordering::SeqCst);
            }
        }
        struct Host {
            calls: usize,
            tx: tokio::sync::watch::Sender<bool>,
            released: Arc<AtomicBool>,
        }
        impl InitializationHost for Host {
            type Daemon = ();
            type Lease = Lease;
            async fn begin_authorized(
                &mut self,
                _: &(),
                _: &str,
                _: &mut tokio::sync::watch::Receiver<bool>,
            ) -> Result<Lease, ()> {
                Ok(Lease(self.released.clone()))
            }
            async fn execute_authorized(
                &mut self,
                _: &mut Lease,
                _: &Effect,
                _: &mut tokio::sync::watch::Receiver<bool>,
            ) -> Result<Vec<u8>, ()> {
                self.calls += 1;
                self.tx.send(true).unwrap();
                Ok(Vec::new())
            }
        }
        let (tx, mut rx) = tokio::sync::watch::channel(false);
        let released = Arc::new(AtomicBool::new(false));
        let mut host = Host {
            calls: 0,
            tx,
            released: released.clone(),
        };
        let owner = HostOwner {
            uid: 1000,
            gid: 1000,
        };
        assert_eq!(
            execute_initialization(
                &mut host,
                &(),
                "synapse:latest",
                config(),
                "/project/.jait/artifacts/matrix",
                owner,
                &mut rx
            )
            .await,
            Err(InitializationError::Cancelled)
        );
        assert_eq!(host.calls, 1);
        assert!(released.load(Ordering::SeqCst));
    }

    #[test]
    fn bridge_plan_rejects_escapes_and_keeps_content_out_of_plan() {
        let dir = "/project/.jait/artifacts/matrix";
        let owner = HostOwner {
            uid: 1000,
            gid: 1000,
        };
        for id in ["../x", "x\";evil", "UPPER"] {
            assert!(plan_bridge(&config(), dir, owner, id, "bridge.yaml").is_err());
        }
        for source in ["../secret", "/outside", "dir/../../escape", "a\\b"] {
            assert!(plan_bridge(&config(), dir, owner, "bridge-1", source).is_err());
        }
        let effects =
            plan_bridge(&config(), dir, owner, "bridge-1", "configs/bridge.yaml").unwrap();
        assert!(
            matches!(&effects[0], Effect::CopyBridgeExclusive { bridge_id, .. } if bridge_id == "bridge-1")
        );
        let Effect::Docker { argv, .. } = &effects[1] else {
            panic!()
        };
        assert!(
            argv.last()
                .unwrap()
                .contains("/data/appservices/bridge-1.yaml")
        );
        assert!(!argv.iter().any(|v| v.contains("configs/bridge.yaml")));
    }
}
