//! Owned provider authentication commands; no login runs until explicitly invoked by a caller.
use crate::{
    contracts::bounded_json::Utf16Text,
    text::{js_trim, js_whitespace},
};
use regex::Regex;
use serde::Serialize;
use std::{
    io,
    num::NonZeroU16,
    path::{Path, PathBuf},
    process::Stdio,
    sync::{Arc, LazyLock},
    time::Duration,
};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    process::{Child, Command},
    sync::{Semaphore, mpsc, watch},
    time::Instant,
};

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
pub struct ProviderAuthCapabilities {
    pub login: bool,
    pub logout: bool,
    #[serde(rename = "deviceCode")]
    pub device_code: bool,
}
pub const NO_PROVIDER_AUTH: ProviderAuthCapabilities = ProviderAuthCapabilities {
    login: false,
    logout: false,
    device_code: false,
};
pub const DEVICE_PROVIDER_AUTH: ProviderAuthCapabilities = ProviderAuthCapabilities {
    login: true,
    logout: true,
    device_code: true,
};
pub const SHADOWED_GITHUB_COPILOT_TOKEN_ENV_VARS: [&str; 3] =
    ["COPILOT_GITHUB_TOKEN", "GH_TOKEN", "GITHUB_TOKEN"];
#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceAuthDetails {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub verification_uri: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_code: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub requires_code_input: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub input_prompt: Option<String>,
}
impl DeviceAuthDetails {
    pub fn complete(&self) -> bool {
        (self.verification_uri.is_some() && self.user_code.is_some())
            || self.requires_code_input == Some(true)
    }
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthResult {
    pub ok: bool,
    pub status: String,
    pub provider_id: String,
    pub message: String,
    #[serde(flatten)]
    pub details: DeviceAuthDetails,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub raw_output: Option<Utf16Text>,
}
fn result(provider: &str, ok: bool, status: &str, message: String) -> AuthResult {
    AuthResult {
        ok,
        status: status.into(),
        provider_id: provider.into(),
        message,
        details: DeviceAuthDetails::default(),
        raw_output: None,
    }
}
pub fn unsupported_login(provider: &str, message: &str) -> AuthResult {
    result(provider, false, "unsupported", message.into())
}
pub fn unsupported_logout(provider: &str, message: &str) -> AuthResult {
    unsupported_login(provider, message)
}
#[derive(Clone, Debug, Serialize)]
pub struct CommandLine {
    pub command: String,
    pub args: Vec<String>,
}
pub fn parse_command_line(line: &str) -> CommandLine {
    let chars = js_trim(line).chars().collect::<Vec<_>>();
    let mut parts = vec![];
    let mut current = String::new();
    let mut quote = None;
    let mut i = 0;
    while i < chars.len() {
        let ch = chars[i];
        let next = chars.get(i + 1).copied();
        if ch == '\\' {
            let escape = match quote {
                Some('\'') => false,
                Some('"') => matches!(next, Some('"') | Some('\\')),
                _ => next.is_some_and(|n| js_whitespace(n) || matches!(n, '\'' | '"' | '\\')),
            };
            if escape {
                current.push(next.unwrap());
                i += 1
            } else {
                current.push(ch)
            }
        } else if let Some(q) = quote {
            if ch == q {
                quote = None
            } else {
                current.push(ch)
            }
        } else if ch == '\'' || ch == '"' {
            quote = Some(ch)
        } else if js_whitespace(ch) {
            if !current.is_empty() {
                parts.push(std::mem::take(&mut current))
            }
        } else {
            current.push(ch)
        }
        i += 1;
    }
    if !current.is_empty() {
        parts.push(current)
    }
    let command = if parts.is_empty() {
        String::new()
    } else {
        parts.remove(0)
    };
    CommandLine {
        command,
        args: parts,
    }
}
pub fn strip_ansi(value: &str) -> String {
    static ANSI: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new(r"\x1B(?:\][^\x07\x1b]*(?:\x07|\x1b\\)|\[[0-?]*[ -/]*[@-~]|[@-Z\\-_])").unwrap()
    });
    ANSI.replace_all(value, "").into_owned()
}
const WS: &str = r"[\x09-\x0d\x20\u{00a0}\u{1680}\u{2000}-\u{200a}\u{2028}\u{2029}\u{202f}\u{205f}\u{3000}\u{feff}]";
fn pattern(p: &str) -> Regex {
    Regex::new(&p.replace(r"\s", WS).replace(r"\b", r"(?-u:\b)")).unwrap()
}
fn normalize_code(v: &str) -> Option<String> {
    static SPACE: LazyLock<Regex> = LazyLock::new(|| pattern(r"\s+"));
    static SHAPE: LazyLock<Regex> =
        LazyLock::new(|| Regex::new(r"^[A-Z0-9]{4,}(?:[- ][A-Z0-9]{3,}){1,4}$").unwrap());
    let candidate = SPACE.replace_all(js_trim(v), "-").to_uppercase();
    let compact = candidate.replace('-', "");
    let blocked = [
        "AUTHORIZATION",
        "AUTHORISATION",
        "AUTHENTICATION",
        "DEVICE",
        "LOGIN",
        "OPENAI",
        "CODE",
        "BROWSER",
        "THIS",
        "ONE",
        "TIME",
        "COMMAND",
        "LINE",
    ];
    if blocked.contains(&compact.as_str()) {
        return None;
    }
    let parts = candidate
        .split('-')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>();
    let count = parts.iter().filter(|s| blocked.contains(s)).count();
    if parts.len() > 1 && (count >= 2 || count == parts.len()) {
        return None;
    }
    let digit = compact.bytes().any(|b| b.is_ascii_digit());
    let uniform = parts.len() > 1 && parts.iter().all(|p| p.len() == parts[0].len());
    if !digit && !uniform && compact.len() > 6 {
        return None;
    }
    SHAPE.is_match(&candidate).then_some(candidate)
}
pub fn extract_device_auth_details(output: &str) -> DeviceAuthDetails {
    let clean = strip_ansi(output);
    let lower = clean.to_ascii_lowercase();
    static URL: LazyLock<Regex> = LazyLock::new(|| pattern(r#"https?://[^\s<>"')]+"#));
    let verification_uri = URL.find(&lower).map(|m| {
        clean[m.range()]
            .trim_end_matches(['.', ',', ';', ':'])
            .to_string()
    });
    let lines = clean
        .split('\n')
        .map(js_trim)
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>();
    static NEXT: LazyLock<Regex> = LazyLock::new(|| pattern(r"enter\s+this\s+one-time\s+code"));
    for pair in lines.windows(2) {
        if NEXT.is_match(&pair[0].to_ascii_lowercase())
            && let Some(code) = normalize_code(pair[1])
        {
            return DeviceAuthDetails {
                verification_uri,
                user_code: Some(code),
                ..Default::default()
            };
        }
    }
    static CODES: LazyLock<Vec<Regex>> = LazyLock::new(|| {
        [
            r"(?:user\s*)?code(?:\s+is)?\s*[:=]?\s*([a-z0-9]{4,}(?:[- ][a-z0-9]{3,}){0,4})",
            r"enter\s+(?:the\s+)?(?:code\s+)?([a-z0-9]{4,}(?:[- ][a-z0-9]{3,}){1,4})",
            r"copy\s+(?:the\s+)?(?:code\s+)?([a-z0-9]{4,}(?:[- ][a-z0-9]{3,}){1,4})",
            r"\b([A-Z0-9]{4,}(?:[- ][A-Z0-9]{4,}){1,4})\b",
        ]
        .iter()
        .map(|p| pattern(p))
        .collect()
    });
    let mut user_code = None;
    for (i, re) in CODES.iter().enumerate() {
        for c in re.captures_iter(if i == 3 { &clean } else { &lower }) {
            let raw = js_trim(c.get(1).unwrap().as_str());
            if raw.eq_ignore_ascii_case("http") || raw.eq_ignore_ascii_case("https") {
                continue;
            }
            if let Some(code) = normalize_code(raw) {
                user_code = Some(code);
                break;
            }
        }
        if user_code.is_some() {
            break;
        }
    }
    let mut details = DeviceAuthDetails {
        verification_uri,
        user_code,
        ..Default::default()
    };
    if details.user_code.is_none() {
        static INPUT: LazyLock<Vec<Regex>> = LazyLock::new(|| {
            [
                r"enter\s+(?:the\s+)?authorization\s+code",
                r"paste\s+(?:the\s+)?(?:authorization\s+|auth\s+)?code",
                r"enter\s+(?:the\s+)?code\s+(?:from|shown|displayed)",
                r"code\s+from\s+(?:your\s+)?browser",
                r"authorization\s+code\s*:",
            ]
            .iter()
            .map(|p| pattern(p))
            .collect()
        });
        for line in lines {
            if INPUT.iter().any(|p| p.is_match(&line.to_ascii_lowercase())) {
                details.requires_code_input = Some(true);
                details.input_prompt =
                    Some(js_trim(line.trim_end_matches(|c| c == ':' || js_whitespace(c))).into());
                break;
            }
        }
    }
    details
}
/// Preserve object insertion order, including PATH spelling and nullish override values.
pub type AuthEnvironment = Vec<(String, Option<String>)>;
pub fn strip_env_vars(env: &mut AuthEnvironment, names: &[String]) {
    env.retain(|(k, _)| !names.contains(k));
}
fn env_set(env: &mut AuthEnvironment, key: &str, value: Option<String>) {
    if let Some((_, v)) = env.iter_mut().find(|(k, _)| k == key) {
        *v = value
    } else {
        env.push((key.into(), value))
    }
}
fn env_value<'a>(env: &'a AuthEnvironment, key: &str) -> Option<&'a str> {
    env.iter()
        .find(|(k, _)| k == key)
        .and_then(|(_, v)| v.as_deref())
}
fn normalized_path(path: &Path) -> String {
    let absolute = path.is_absolute();
    let mut pieces = Vec::new();
    for part in path.components() {
        match part {
            std::path::Component::Normal(p) => pieces.push(p.to_string_lossy().into_owned()),
            std::path::Component::ParentDir => {
                if pieces.last().is_some_and(|p| p != "..") {
                    pieces.pop();
                } else if !absolute {
                    pieces.push("..".into())
                }
            }
            _ => {}
        }
    }
    let joined = pieces.join(std::path::MAIN_SEPARATOR_STR);
    if absolute {
        format!("{}{joined}", std::path::MAIN_SEPARATOR)
    } else if joined.is_empty() {
        ".".into()
    } else {
        joined
    }
}
pub fn build_provider_auth_env(
    inherited: &AuthEnvironment,
    overrides: &AuthEnvironment,
    unset: &[String],
    home: &Path,
) -> AuthEnvironment {
    let mut env = inherited.clone();
    strip_env_vars(&mut env, unset);
    for (key, value) in overrides {
        env_set(&mut env, key, value.clone())
    }
    let path_key = env
        .iter()
        .find(|(k, _)| k.eq_ignore_ascii_case("path"))
        .map(|(k, _)| k.clone())
        .unwrap_or_else(|| "PATH".into());
    let separator = if cfg!(windows) { ';' } else { ':' };
    let mut entries = env_value(&env, &path_key)
        .unwrap_or("")
        .split(separator)
        .filter(|s| !s.is_empty())
        .map(String::from)
        .collect::<Vec<_>>();
    let prefix =
        env_value(&env, "NPM_CONFIG_PREFIX").or_else(|| env_value(&env, "npm_config_prefix"));
    let mut candidates = vec![];
    if let Some(prefix) = prefix.filter(|s| !s.is_empty()) {
        candidates.push(PathBuf::from(prefix).join("bin"))
    }
    candidates.extend([home.join(".npm-global/bin"), home.join(".local/bin")]);
    for candidate in candidates {
        let s = normalized_path(&candidate);
        if !entries.contains(&s) {
            entries.push(s)
        }
    }
    env_set(
        &mut env,
        &path_key,
        Some(entries.join(&separator.to_string())),
    );
    env
}
#[derive(Clone, Debug)]
pub struct AuthCommandOptions {
    pub provider_id: String,
    pub command_line: String,
    pub args: Vec<String>,
    pub env: AuthEnvironment,
    pub unset_env: Vec<String>,
    pub timeout: Option<Duration>,
}
impl AuthCommandOptions {
    pub fn new(provider: impl Into<String>, command: impl Into<String>) -> Self {
        Self {
            provider_id: provider.into(),
            command_line: command.into(),
            args: vec![],
            env: vec![],
            unset_env: vec![],
            timeout: None,
        }
    }
}
#[derive(Clone, Default, Debug)]
struct ProcessSnapshot {
    output: Vec<u16>,
    exit: Option<Option<i32>>,
}
enum Control {
    Input(Vec<u8>),
}
struct ProcessOwner {
    control: mpsc::Sender<Control>,
    kill: watch::Sender<bool>,
    state: watch::Receiver<ProcessSnapshot>,
}
// Dropping the final sender closes controls, forcing kill and reap in observe().
#[derive(Clone)]
pub struct AuthChild {
    owner: Arc<ProcessOwner>,
}
impl AuthChild {
    pub fn kill(&self) {
        self.owner.kill.send_replace(true);
    }
    pub async fn write_input(&self, input: &[u8]) -> io::Result<()> {
        if input.len() > 65_536 {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "auth input exceeds 64 KiB",
            ));
        }
        self.owner
            .control
            .send(Control::Input(input.to_vec()))
            .await
            .map_err(|_| io::Error::new(io::ErrorKind::BrokenPipe, "auth process exited"))
    }
    pub async fn wait_for_exit(&self) -> Option<i32> {
        let mut state = self.owner.state.clone();
        loop {
            if let Some(code) = state.borrow_and_update().exit {
                return code;
            }
            if state.changed().await.is_err() {
                return None;
            }
        }
    }
    pub fn is_running(&self) -> bool {
        self.owner.state.borrow().exit.is_none()
    }
}
pub struct DeviceLogin {
    pub result: AuthResult,
    pub child: Option<AuthChild>,
}
#[derive(Clone)]
pub struct AuthCommandPool {
    permits: Arc<Semaphore>,
    inherited: AuthEnvironment,
    home: PathBuf,
}
impl AuthCommandPool {
    pub fn new(parallelism: NonZeroU16, inherited: AuthEnvironment, home: PathBuf) -> Self {
        Self {
            permits: Arc::new(Semaphore::new(parallelism.get() as usize)),
            inherited,
            home,
        }
    }
    pub fn close(&self) {
        self.permits.close()
    }
    fn spawn(&self, options: &AuthCommandOptions, spec: &CommandLine) -> io::Result<AuthChild> {
        let permit = self.permits.clone().try_acquire_owned().map_err(|_| {
            io::Error::new(
                io::ErrorKind::WouldBlock,
                "auth process capacity unavailable",
            )
        })?;
        let env = build_provider_auth_env(
            &self.inherited,
            &options.env,
            &options.unset_env,
            &self.home,
        );
        let mut cmd = Command::new(&spec.command);
        cmd.args(&spec.args)
            .args(&options.args)
            .env_clear()
            .envs(env.iter().filter_map(|(k, v)| v.as_ref().map(|v| (k, v))))
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);
        // Windows shell-backed CLI launch requires a separate quoting adapter.
        if cfg!(windows) {
            return Err(io::Error::new(
                io::ErrorKind::Unsupported,
                "native provider auth requires Windows launcher integration",
            ));
        }
        let child = cmd.spawn()?;
        let (control, requests) = mpsc::channel(16);
        let (kill, kills) = watch::channel(false);
        let (state, receive) = watch::channel(ProcessSnapshot::default());
        tokio::spawn(async move {
            let _permit = permit;
            observe(child, requests, kills, state).await;
        });
        Ok(AuthChild {
            owner: Arc::new(ProcessOwner {
                control,
                kill,
                state: receive,
            }),
        })
    }
    pub async fn run_auth_command(&self, options: AuthCommandOptions) -> AuthResult {
        let spec = parse_command_line(&options.command_line);
        if spec.command.is_empty() {
            return result(
                &options.provider_id,
                false,
                "error",
                "No command configured".into(),
            );
        }
        let child = match self.spawn(&options, &spec) {
            Ok(c) => c,
            Err(e) => return result(&options.provider_id, false, "error", e.to_string()),
        };
        let deadline = Instant::now() + options.timeout.unwrap_or(Duration::from_secs(20));
        let mut state = child.owner.state.clone();
        loop {
            let snapshot = state.borrow_and_update().clone();
            if let Some(code) = snapshot.exit {
                let mut r = result(
                    &options.provider_id,
                    code == Some(0),
                    if code == Some(0) {
                        "completed"
                    } else {
                        "error"
                    },
                    if code == Some(0) {
                        "Logout completed.".into()
                    } else {
                        format!(
                            "Command exited with code {}.",
                            code.map(|c| c.to_string()).unwrap_or_else(|| "null".into())
                        )
                    },
                );
                r.raw_output = clean_output(&snapshot.output);
                return r;
            }
            tokio::select! {
             _=tokio::time::sleep_until(deadline)=>{
              child.kill();
              let message=js_trim(&format!("Command timed out: {} {}",options.command_line,options.args.join(" "))).to_string();
              let mut r=result(&options.provider_id,false,"error",message);r.raw_output=clean_output(&state.borrow().output);return r;
             }
             changed=state.changed()=>{if changed.is_err(){return result(&options.provider_id,false,"error","Authentication process observer ended".into())}}
            }
        }
    }
    pub async fn start_device_login_command(
        &self,
        options: AuthCommandOptions,
        label: &str,
    ) -> DeviceLogin {
        let spec = parse_command_line(&options.command_line);
        if spec.command.is_empty() {
            return DeviceLogin {
                result: result(
                    &options.provider_id,
                    false,
                    "error",
                    "No command configured".into(),
                ),
                child: None,
            };
        }
        let child = match self.spawn(&options, &spec) {
            Ok(c) => c,
            Err(e) => {
                return DeviceLogin {
                    result: result(&options.provider_id, false, "error", e.to_string()),
                    child: None,
                };
            }
        };
        let deadline = Instant::now() + options.timeout.unwrap_or(Duration::from_secs(30));
        let mut partial = None;
        let mut state = child.owner.state.clone();
        loop {
            let snapshot = state.borrow_and_update().clone();
            let text = String::from_utf16_lossy(&snapshot.output);
            let details = extract_device_auth_details(&text);
            if details.complete() {
                return started(&options, label, child, details, &snapshot.output);
            }
            if let Some(code) = snapshot.exit {
                let mut r = result(
                    &options.provider_id,
                    code == Some(0),
                    if code == Some(0) {
                        "completed"
                    } else {
                        "error"
                    },
                    if code == Some(0) {
                        format!("{label} login completed.")
                    } else {
                        format!(
                            "{label} login exited with code {}.",
                            code.map(|c| c.to_string()).unwrap_or_else(|| "null".into())
                        )
                    },
                );
                r.details = DeviceAuthDetails {
                    verification_uri: details.verification_uri,
                    user_code: details.user_code,
                    ..Default::default()
                };
                r.raw_output = clean_output(&snapshot.output);
                return DeviceLogin {
                    result: r,
                    child: None,
                };
            }
            if partial.is_none()
                && (details.verification_uri.is_some() || details.user_code.is_some())
            {
                partial = Some(Instant::now() + Duration::from_millis(1500))
            }
            let wake = partial.unwrap_or(deadline).min(deadline);
            tokio::select! {
             _=tokio::time::sleep_until(wake)=>{
              let snapshot=state.borrow().clone();let details=extract_device_auth_details(&String::from_utf16_lossy(&snapshot.output));
              if partial.is_some_and(|p|p<=Instant::now())||details.verification_uri.is_some()||details.user_code.is_some(){return started(&options,label,child,details,&snapshot.output)}
              child.kill();let mut r=result(&options.provider_id,false,"error",format!("{label} login did not emit a device code before timeout."));r.raw_output=clean_output(&snapshot.output);return DeviceLogin{result:r,child:None}
             }
             changed=state.changed()=>{if changed.is_err(){return DeviceLogin{result:result(&options.provider_id,false,"error","Authentication process observer ended".into()),child:None}}}
            }
        }
    }
}
fn started(
    options: &AuthCommandOptions,
    label: &str,
    child: AuthChild,
    details: DeviceAuthDetails,
    output: &[u16],
) -> DeviceLogin {
    let mut r = result(
        &options.provider_id,
        true,
        "started",
        format!("{label} login started."),
    );
    r.details = details;
    r.raw_output = clean_output(output);
    DeviceLogin {
        result: r,
        child: Some(child),
    }
}
fn clean_output(output: &[u16]) -> Option<Utf16Text> {
    // Encode every UTF-16 unit independently so slicing can preserve lone surrogates.
    let mapped = output
        .iter()
        .map(|u| {
            char::from_u32(if (0xd800..=0xdfff).contains(u) {
                0xf0000 + u32::from(*u - 0xd800)
            } else {
                u32::from(*u)
            })
            .unwrap()
        })
        .collect::<String>();
    let clean = strip_ansi(&mapped);
    let clean = js_trim(&clean);
    if clean.is_empty() {
        None
    } else {
        Some(Utf16Text(
            clean
                .chars()
                .map(|c| {
                    if (0xf0000..=0xf07ff).contains(&(c as u32)) {
                        (c as u32 - 0xf0000) as u16 + 0xd800
                    } else {
                        c as u16
                    }
                })
                .collect(),
        ))
    }
}
fn append(state: &mut ProcessSnapshot, bytes: &[u8]) {
    state
        .output
        .extend(String::from_utf8_lossy(bytes).encode_utf16());
    if state.output.len() > 8000 {
        state.output.drain(..state.output.len() - 8000);
    }
}
async fn observe(
    mut child: Child,
    mut controls: mpsc::Receiver<Control>,
    mut kills: watch::Receiver<bool>,
    sender: watch::Sender<ProcessSnapshot>,
) {
    let mut stdin = child.stdin.take();
    let mut stdout = child.stdout.take().unwrap();
    let mut stderr = child.stderr.take().unwrap();
    let mut out = vec![0; 65536];
    let mut err = vec![0; 65536];
    let mut out_open = true;
    let mut err_open = true;
    let mut owner = true;
    let mut kill_open = true;
    let mut snapshot = ProcessSnapshot::default();
    let mut exit = None;
    let mut drain_deadline = None;
    loop {
        if exit.is_some()
            && (!out_open && !err_open || drain_deadline.is_some_and(|t| Instant::now() >= t))
        {
            snapshot.exit = exit;
            sender.send_replace(snapshot);
            break;
        }
        let deadline = drain_deadline.unwrap_or(Instant::now() + Duration::from_secs(86400));
        tokio::select! {
         result=stdout.read(&mut out),if out_open=>match result{Ok(0)|Err(_)=>out_open=false,Ok(n)=>{append(&mut snapshot,&out[..n]);sender.send_replace(snapshot.clone());}},
         result=stderr.read(&mut err),if err_open=>match result{Ok(0)|Err(_)=>err_open=false,Ok(n)=>{append(&mut snapshot,&err[..n]);sender.send_replace(snapshot.clone());}},
         status=child.wait(),if exit.is_none()=>{exit=Some(status.ok().and_then(|s|s.code()));stdin.take();drain_deadline=Some(Instant::now()+Duration::from_secs(2));},
         request=controls.recv(),if owner=>match request{
          Some(Control::Input(data))=>if let Some(stdin)=stdin.as_mut(){let _=tokio::time::timeout(Duration::from_secs(2),stdin.write_all(&data)).await;},
          None=>{owner=false;let _=child.start_kill();},
         },
         changed=kills.changed(),if kill_open=>{if changed.is_err(){kill_open=false}else{terminate(&mut child)}},
         _=tokio::time::sleep_until(deadline),if exit.is_some()=>{},
        }
    }
}
fn terminate(child: &mut Child) {
    #[cfg(unix)]
    if let Some(pid) = child.id() {
        unsafe {
            libc::kill(pid as libc::pid_t, libc::SIGTERM);
        }
    }
    #[cfg(not(unix))]
    let _ = child.start_kill();
}
