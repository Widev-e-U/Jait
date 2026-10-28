//! Native port of `packages/gateway/src/tools/elevated-tools.ts`.
//!
//! One tool:
//!
//! * `elevated.run` — run a local command with elevated privileges (sudo on Linux/macOS,
//!   UAC or credential based elevation on Windows).
//!
//! Security notes:
//!
//! * The elevation password is **never** part of the tool arguments, the tool result or any log
//!   output. It is obtained from a [`SecretInputPort`] and handed to the [`ElevatedSpawnPort`]
//!   either on stdin (sudo) or through process environment variables (Windows credential mode).
//! * [`ElevatedSpawnRequest`] implements `Debug` manually and redacts both the stdin payload and
//!   every environment value, so an accidental `dbg!`/`tracing` call cannot leak it.
//! * Consent and permission checks are declared in the tool metadata (`risk: "high"`,
//!   `defaultConsentLevel: "always"`); this module never elevates without an explicit
//!   prompt-based password or an explicit Windows UAC prompt.

use std::collections::BTreeMap;
use std::fmt;
use std::sync::{Arc, LazyLock};

use futures_util::future::BoxFuture;
use serde_json::{json, Value};

use crate::tools::core_io::HostError;
use crate::tools::validate::{validate_tool_input, ToolInput};

pub const ELEVATED_RUN: &str = "elevated.run";

/// Default execution timeout, mirroring the TS `input.timeoutMs ?? 30_000`.
const DEFAULT_TIMEOUT_MS: u64 = 30_000;
/// Minimum window for the secret prompt (TS clamps to at least two minutes).
const SECRET_PROMPT_TIMEOUT_MS: u64 = 120_000;
/// Streams are truncated to this many characters, mirroring `truncateOutput`.
const MAX_OUTPUT_CHARS: usize = 200_000;

static METADATA: LazyLock<Value> = LazyLock::new(|| {
    json!([
        {
            "name": ELEVATED_RUN,
            "displayName": "Run Elevated Command",
            "description": "Run a local command with elevated privileges. On Linux and macOS, this uses sudo. On Windows, if no username is provided the native UAC dialog is shown for one-click elevation; if a username is supplied the command runs under that account with credential-based elevation. Passwords (when needed) are requested through a secret prompt and are never sent to the LLM or included in tool arguments.",
            "tier": "standard",
            "category": "os",
            "source": "builtin",
            "risk": "high",
            "defaultConsentLevel": "always",
            "parameters": {
                "type": "object",
                "properties": {
                    "command": { "type": "string", "description": "Shell command to run with elevated privileges" },
                    "username": { "type": "string", "description": "Windows only: administrator account username. When omitted on Windows, the native UAC dialog is shown instead." },
                    "cwd": { "type": "string", "description": "Working directory for the command. Defaults to the project root." },
                    "timeoutMs": { "type": "number", "description": "Execution timeout in milliseconds, default 30000" },
                    "reason": { "type": "string", "description": "Short human-readable reason shown in the password prompt context." }
                },
                "required": ["command"]
            }
        }
    ])
});

/// Tool metadata consumed by the registry (`name`, `parameters`, risk/consent profile, ...).
pub fn metadata() -> &'static Value {
    &METADATA
}

/// Look up a single tool definition by name.
pub fn definition(name: &str) -> Value {
    metadata()
        .as_array()
        .and_then(|tools| tools.iter().find(|tool| tool["name"] == json!(name)))
        .cloned()
        .unwrap_or(Value::Null)
}

/// Target platform of the gateway host (the TS `platform()` result, narrowed to what matters).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Platform {
    Windows,
    Other,
}

impl Platform {
    /// The gateway host platform, resolved once at runtime.
    pub fn current() -> Self {
        if cfg!(windows) {
            Platform::Windows
        } else {
            Platform::Other
        }
    }

    fn is_windows(self) -> bool {
        self == Platform::Windows
    }
}

/// Injected runtime probes (TS `runtime.platform` / `runtime.getuid`), so tests stay hermetic.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct ElevatedRuntime {
    pub platform: Option<Platform>,
    /// Effective uid on Unix; `None` on Windows or when unknown.
    pub uid: Option<u32>,
}

impl ElevatedRuntime {
    fn platform(&self) -> Platform {
        self.platform.unwrap_or_else(Platform::current)
    }

    fn is_elevated_already(&self) -> bool {
        !self.platform().is_windows() && self.uid == Some(0)
    }
}

/// Request handed to the secret prompt service (TS `secretInput.requestSecret`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SecretRequest {
    pub session_id: String,
    pub user_id: String,
    pub title: String,
    pub prompt: String,
    pub requested_by: String,
    pub command: String,
    pub timeout_ms: u64,
}

/// Interactive secret prompt host port (`SecretInputService` in TS).
pub trait SecretInputPort: Send + Sync {
    fn request_secret<'a>(
        &'a self,
        request: SecretRequest,
    ) -> BoxFuture<'a, Result<Option<String>, HostError>>;
}

/// A fully resolved elevation launch plan.
///
/// Environment values and `stdin` may carry credentials, therefore the `Debug` implementation
/// below prints *keys only* — this type must never leak secrets into logs.
#[derive(Clone, PartialEq, Eq)]
pub struct ElevatedSpawnRequest {
    pub command: String,
    pub args: Vec<String>,
    pub cwd: String,
    pub env: BTreeMap<String, String>,
    pub stdin: Option<String>,
    pub timeout_ms: u64,
    pub windows_hide: bool,
}

impl fmt::Debug for ElevatedSpawnRequest {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("ElevatedSpawnRequest")
            .field("command", &self.command)
            .field("args", &self.args)
            .field("cwd", &self.cwd)
            .field("env_keys", &self.env.keys().collect::<Vec<_>>())
            .field("stdin", &self.stdin.as_ref().map(|_| "<redacted>"))
            .field("timeout_ms", &self.timeout_ms)
            .field("windows_hide", &self.windows_hide)
            .finish()
    }
}

/// Outcome of an elevated child process, mirroring the TS `runElevatedCommand` result.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct SpawnOutcome {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: Option<i64>,
    pub signal: Option<String>,
    pub timed_out: bool,
}

/// Process host port (`ElevatedSpawnFactory` plus the timeout/kill handling in TS).
pub trait ElevatedSpawnPort: Send + Sync {
    fn spawn<'a>(
        &'a self,
        request: ElevatedSpawnRequest,
    ) -> BoxFuture<'a, Result<SpawnOutcome, HostError>>;
}

fn fail(message: impl Into<String>) -> Value {
    json!({ "ok": false, "message": message.into() })
}

fn host_error_message(error: HostError) -> String {
    match error {
        HostError::Error(message) => message,
        HostError::Thrown(value) => value
            .get("message")
            .and_then(Value::as_str)
            .map(str::to_owned)
            .unwrap_or_else(|| value.to_string()),
    }
}

fn cancelled(context: &Value) -> bool {
    context["aborted"].as_bool().unwrap_or(false)
        || context["signal"]["aborted"].as_bool().unwrap_or(false)
}

fn cancelled_result() -> Value {
    fail("Elevated command was cancelled.")
}

fn validated(name: &str, input: &Value) -> Result<Value, Value> {
    let mut tool_input = ToolInput::new(input);
    let validation = validate_tool_input(&definition(name)["parameters"], &mut tool_input)
        .expect("static elevated tool schema");
    if validation.valid {
        Ok(tool_input.value())
    } else {
        Err(fail(
            validation
                .errors
                .first()
                .map(|error| String::from_utf16_lossy(&error.0))
                .unwrap_or_else(|| format!("Invalid input for {name}.")),
        ))
    }
}

fn opt_str(value: Option<&Value>) -> Option<&str> {
    value.and_then(Value::as_str)
}

fn non_empty_trimmed(value: Option<&Value>) -> Option<String> {
    opt_str(value)
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .map(str::to_owned)
}

/// `truncateOutput` — keep at most [`MAX_OUTPUT_CHARS`] characters.
fn truncate_output(value: &str) -> String {
    if value.chars().count() <= MAX_OUTPUT_CHARS {
        return value.to_owned();
    }
    let mut truncated: String = value.chars().take(MAX_OUTPUT_CHARS).collect();
    truncated.push_str("\n… [output truncated]");
    truncated
}

fn base64_utf8(text: &str) -> String {
    use base64::Engine as _;
    base64::engine::general_purpose::STANDARD.encode(text.as_bytes())
}

fn base64_utf16le(text: &str) -> String {
    let bytes: Vec<u8> = text.encode_utf16().flat_map(|unit| unit.to_le_bytes()).collect();
    use base64::Engine as _;
    base64::engine::general_purpose::STANDARD.encode(bytes)
}

/// PowerShell wrapper used for credential-based Windows elevation.
fn windows_credential_wrapper_script() -> &'static str {
    r#"$ErrorActionPreference = 'Stop'
$id = [guid]::NewGuid().ToString()
$base = Join-Path $env:TEMP "jait-elev-$id"
$stdoutPath = "${base}-out.txt"
$stderrPath = "${base}-err.txt"
$exitCodePath = "${base}-ec.txt"
$cmdPath = "${base}-cmd.txt"

[System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:JAIT_ELEVATED_COMMAND_B64)) | Set-Content -Path $cmdPath -Encoding UTF8 -NoNewline

$secure = ConvertTo-SecureString $env:JAIT_ELEVATED_PASSWORD -AsPlainText -Force
$credential = New-Object System.Management.Automation.PSCredential($env:JAIT_ELEVATED_USERNAME, $secure)

try {
  $proc = Start-Process -Credential $credential -LoadUserProfile -WorkingDirectory $env:JAIT_ELEVATED_CWD -FilePath 'powershell.exe' -ArgumentList @('-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', $cmdPath) -Wait -PassThru -WindowStyle Hidden -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath
  $stdout = if (Test-Path $stdoutPath) { Get-Content -Raw $stdoutPath } else { '' }
  $stderr = if (Test-Path $stderrPath) { Get-Content -Raw $stderrPath } else { '' }
  [pscustomobject]@{ exitCode = $proc.ExitCode; stdout = $stdout; stderr = $stderr } | ConvertTo-Json -Compress
} finally {
  Remove-Item -Path "${base}*" -Force -ErrorAction SilentlyContinue
}
"#
}

/// PowerShell wrapper used for one-click Windows UAC elevation.
fn windows_uac_wrapper_script() -> &'static str {
    r#"$ErrorActionPreference = 'Stop'
$id = [guid]::NewGuid().ToString()
$base = Join-Path $env:TEMP "jait-uac-$id"
$stdoutPath = "${base}-out.txt"
$stderrPath = "${base}-err.txt"
$exitCodePath = "${base}-ec.txt"
$cmdPath = "${base}-cmd.txt"
$scriptPath = "${base}.ps1"

[System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:JAIT_ELEVATED_COMMAND_B64)) | Set-Content -Path $cmdPath -Encoding UTF8 -NoNewline

$cwd = $env:JAIT_ELEVATED_CWD -replace "'", "''"
$cmdEscaped = $cmdPath -replace "'", "''"
$stdoutEscaped = $stdoutPath -replace "'", "''"
$stderrEscaped = $stderrPath -replace "'", "''"
$exitCodeEscaped = $exitCodePath -replace "'", "''"
$lines = @(
  "`$ErrorActionPreference = 'Continue'"
  "Set-Location -LiteralPath '" + $cwd + "'"
  "`$cmd = Get-Content -Path '" + $cmdEscaped + "' -Raw"
  'try {'
  "  `$output = Invoke-Expression `$cmd 2>'" + $stderrEscaped + "'"
  "  `$output | Out-File -FilePath '" + $stdoutEscaped + "' -Encoding utf8"
  "  if (`$null -eq `$LASTEXITCODE) { 0 } else { `$LASTEXITCODE } | Out-File -FilePath '" + $exitCodeEscaped + "' -Encoding utf8"
  '} catch {'
  "  `$_.Exception.Message | Out-File -FilePath '" + $stderrEscaped + "' -Encoding utf8 -Append"
  "  1 | Out-File -FilePath '" + $exitCodeEscaped + "' -Encoding utf8"
  '}'
)
$lines | Set-Content -Path $scriptPath -Encoding UTF8

try {
  $proc = Start-Process -Verb RunAs -FilePath 'powershell.exe' -ArgumentList @('-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', $scriptPath) -Wait -PassThru -WindowStyle Hidden
  $stdout = if (Test-Path $stdoutPath) { Get-Content -Raw $stdoutPath } else { '' }
  $stderr = if (Test-Path $stderrPath) { Get-Content -Raw $stderrPath } else { '' }
  $ec = if (Test-Path $exitCodePath) { (Get-Content -Raw $exitCodePath).Trim() -as [int] } else { $null }
  if ($null -eq $ec) { $ec = $proc.ExitCode }
  [pscustomobject]@{ exitCode = $ec; stdout = $stdout; stderr = $stderr } | ConvertTo-Json -Compress
} finally {
  Remove-Item -Path "${base}*" -Force -ErrorAction SilentlyContinue
}
"#
}

/// `buildWindowsUacSpawn` — one-click elevation through the native UAC dialog.
pub fn windows_uac_spawn(command: &str, cwd: &str) -> ElevatedSpawnRequest {
    let script = windows_uac_wrapper_script();
    let mut env = BTreeMap::new();
    env.insert("JAIT_ELEVATED_COMMAND_B64".to_owned(), base64_utf8(command));
    env.insert("JAIT_ELEVATED_CWD".to_owned(), cwd.to_owned());
    ElevatedSpawnRequest {
        command: "powershell.exe".to_owned(),
        args: vec![
            "-NoProfile".to_owned(),
            "-NonInteractive".to_owned(),
            "-EncodedCommand".to_owned(),
            base64_utf16le(script),
        ],
        cwd: cwd.to_owned(),
        env,
        stdin: None,
        timeout_ms: DEFAULT_TIMEOUT_MS,
        windows_hide: true,
    }
}

/// `buildWindowsCredentialSpawn` — elevation running as another Windows account.
pub fn windows_credential_spawn(
    command: &str,
    cwd: &str,
    username: &str,
    password: &str,
) -> ElevatedSpawnRequest {
    let script = windows_credential_wrapper_script();
    let mut env = BTreeMap::new();
    env.insert("JAIT_ELEVATED_COMMAND_B64".to_owned(), base64_utf8(command));
    env.insert("JAIT_ELEVATED_CWD".to_owned(), cwd.to_owned());
    env.insert("JAIT_ELEVATED_USERNAME".to_owned(), username.to_owned());
    env.insert("JAIT_ELEVATED_PASSWORD".to_owned(), password.to_owned());
    ElevatedSpawnRequest {
        command: "powershell.exe".to_owned(),
        args: vec![
            "-NoProfile".to_owned(),
            "-NonInteractive".to_owned(),
            "-EncodedCommand".to_owned(),
            base64_utf16le(script),
        ],
        cwd: cwd.to_owned(),
        env,
        stdin: None,
        timeout_ms: DEFAULT_TIMEOUT_MS,
        windows_hide: true,
    }
}

/// `elevated.run` implementation, sharing the host ports injected into [`ElevatedTools`].
#[derive(Clone)]
pub struct ElevatedTools {
    secret_input: Option<Arc<dyn SecretInputPort>>,
    spawn: Arc<dyn ElevatedSpawnPort>,
    runtime: ElevatedRuntime,
}

impl ElevatedTools {
    pub fn new(spawn: Arc<dyn ElevatedSpawnPort>) -> Self {
        Self {
            secret_input: None,
            spawn,
            runtime: ElevatedRuntime::default(),
        }
    }

    /// Attach the secret prompt service used to collect the elevation password.
    pub fn with_secret_input(mut self, secret_input: Arc<dyn SecretInputPort>) -> Self {
        self.secret_input = Some(secret_input);
        self
    }

    /// Override the platform / uid probes (tests and non-standard hosts).
    pub fn with_runtime(mut self, runtime: ElevatedRuntime) -> Self {
        self.runtime = runtime;
        self
    }

    pub fn runtime(&self) -> ElevatedRuntime {
        self.runtime
    }

    /// Dispatch a tool call by name, returning a structured tool result.
    pub async fn call(&self, name: &str, input: &Value, context: &Value) -> Value {
        if name == ELEVATED_RUN {
            return self.elevated_run(input, context).await;
        }
        fail(format!("Unknown tool: {name}"))
    }

    pub async fn elevated_run(&self, input: &Value, context: &Value) -> Value {
        match self.elevated_run_inner(input, context).await {
            Ok(result) => result,
            Err(message) => fail(message),
        }
    }

    async fn elevated_run_inner(&self, input: &Value, context: &Value) -> Result<Value, String> {
        if cancelled(context) {
            return Ok(cancelled_result());
        }
        let input = if input.is_object() {
            validated(ELEVATED_RUN, input).map_err(|result| {
                result["message"]
                    .as_str()
                    .unwrap_or("Invalid input.")
                    .to_owned()
            })?
        } else {
            validated(ELEVATED_RUN, input).map_err(|result| {
                result["message"]
                    .as_str()
                    .unwrap_or("Invalid input.")
                    .to_owned()
            })?
        };

        let shell_command = match non_empty_trimmed(input.get("command")) {
            Some(command) => command,
            None => return Ok(fail("command is required")),
        };

        let platform = self.runtime.platform();
        let is_elevated_already = self.runtime.is_elevated_already();
        let windows_username = non_empty_trimmed(input.get("username"));
        let use_uac = platform.is_windows() && windows_username.is_none();

        let cwd = non_empty_trimmed(input.get("cwd")).unwrap_or_else(|| {
            context["projectRoot"]
                .as_str()
                .unwrap_or_default()
                .to_owned()
        });
        let timeout_ms = input
            .get("timeoutMs")
            .and_then(Value::as_f64)
            .filter(|value| value.is_finite() && *value > 0.0)
            .map(|value| value as u64)
            .unwrap_or(DEFAULT_TIMEOUT_MS);

        let mut password: Option<String> = None;
        if !is_elevated_already && !use_uac {
            let secret_input = match &self.secret_input {
                Some(port) => port,
                None => return Ok(fail("Secret input service is unavailable")),
            };
            let reason = non_empty_trimmed(input.get("reason"));
            let username = windows_username.clone().unwrap_or_default();
            let prompt = if platform.is_windows() {
                match &reason {
                    Some(reason) => format!(
                        "Password for {username} to run an elevated command: {reason}"
                    ),
                    None => format!("Password for {username} to run an elevated command"),
                }
            } else {
                match &reason {
                    Some(reason) => format!("Password to run an elevated command: {reason}"),
                    None => "Password to run an elevated command with sudo".to_owned(),
                }
            };
            let request = SecretRequest {
                session_id: context["sessionId"].as_str().unwrap_or_default().to_owned(),
                user_id: context["userId"].as_str().unwrap_or_default().to_owned(),
                title: "Administrator password".to_owned(),
                prompt,
                requested_by: ELEVATED_RUN.to_owned(),
                command: shell_command.clone(),
                timeout_ms: if timeout_ms > SECRET_PROMPT_TIMEOUT_MS {
                    timeout_ms
                } else {
                    SECRET_PROMPT_TIMEOUT_MS
                },
            };
            match secret_input.request_secret(request).await {
                Ok(Some(secret)) if !secret.is_empty() => password = Some(secret),
                Ok(_) => return Ok(fail("Administrator password was not provided")),
                Err(error) => return Ok(fail(host_error_message(error))),
            }
            if cancelled(context) {
                return Ok(cancelled_result());
            }
        }

        let mut spawn_request = if platform.is_windows() {
            if use_uac {
                windows_uac_spawn(&shell_command, &cwd)
            } else {
                windows_credential_spawn(
                    &shell_command,
                    &cwd,
                    windows_username.as_deref().unwrap_or_default(),
                    password.as_deref().unwrap_or_default(),
                )
            }
        } else if is_elevated_already {
            ElevatedSpawnRequest {
                command: "sh".to_owned(),
                args: vec!["-lc".to_owned(), shell_command.clone()],
                cwd: cwd.clone(),
                env: BTreeMap::new(),
                stdin: None,
                timeout_ms,
                windows_hide: true,
            }
        } else {
            ElevatedSpawnRequest {
                command: "sudo".to_owned(),
                args: vec![
                    "-S".to_owned(),
                    "-k".to_owned(),
                    "-p".to_owned(),
                    String::new(),
                    "--".to_owned(),
                    "sh".to_owned(),
                    "-lc".to_owned(),
                    shell_command.clone(),
                ],
                cwd: cwd.clone(),
                env: BTreeMap::new(),
                stdin: password.as_ref().map(|secret| format!("{secret}\n")),
                timeout_ms,
                windows_hide: true,
            }
        };
        spawn_request.timeout_ms = timeout_ms;

        let outcome = match self.spawn.spawn(spawn_request).await {
            Ok(outcome) => outcome,
            Err(error) => return Ok(fail(host_error_message(error))),
        };
        if cancelled(context) && !outcome.timed_out {
            return Ok(cancelled_result());
        }

        let mut stdout = truncate_output(&outcome.stdout).trim().to_owned();
        let mut stderr = truncate_output(&outcome.stderr).trim().to_owned();
        let mut exit_code = outcome.exit_code;
        if platform.is_windows() && !stdout.is_empty()
            && let Ok(parsed) = serde_json::from_str::<Value>(&stdout) {
                if let Some(value) = parsed.get("stdout").and_then(Value::as_str) {
                    stdout = value.trim().to_owned();
                }
                if let Some(value) = parsed.get("stderr").and_then(Value::as_str) {
                    stderr = value.trim().to_owned();
                }
                if let Some(value) = parsed.get("exitCode").and_then(Value::as_i64) {
                    exit_code = Some(value);
                }
            }
        let combined = [stdout.as_str(), stderr.as_str()]
            .into_iter()
            .filter(|part| !part.is_empty())
            .collect::<Vec<_>>()
            .join("\n");
        let message = if outcome.timed_out {
            format!(
                "Elevated command timed out after {}ms",
                input
                    .get("timeoutMs")
                    .and_then(Value::as_f64)
                    .map(|value| value as u64)
                    .unwrap_or(DEFAULT_TIMEOUT_MS)
            )
        } else {
            format!(
                "Elevated command exited with code {}",
                exit_code
                    .map(|code| code.to_string())
                    .unwrap_or_else(|| "unknown".to_owned())
            )
        };
        let result = json!({
            "ok": !outcome.timed_out && exit_code == Some(0),
            "message": message,
            "data": {
                "output": if combined.is_empty() { "(no output)".to_owned() } else { combined },
                "stdout": stdout,
                "stderr": stderr,
                "exitCode": exit_code,
                "signal": outcome.signal,
                "timedOut": outcome.timed_out,
                "cwd": cwd,
                "elevated": !is_elevated_already,
            }
        });
        Ok(result)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    struct FakeSecret {
        answers: Mutex<Vec<Option<String>>>,
        requests: Mutex<Vec<SecretRequest>>,
    }

    impl FakeSecret {
        fn returning(answers: Vec<Option<&str>>) -> Arc<Self> {
            Arc::new(Self {
                answers: Mutex::new(
                    answers
                        .into_iter()
                        .map(|answer| answer.map(str::to_owned))
                        .collect(),
                ),
                requests: Mutex::new(Vec::new()),
            })
        }
    }

    impl SecretInputPort for FakeSecret {
        fn request_secret<'a>(
            &'a self,
            request: SecretRequest,
        ) -> BoxFuture<'a, Result<Option<String>, HostError>> {
            Box::pin(async move {
                self.requests.lock().unwrap().push(request);
                let mut answers = self.answers.lock().unwrap();
                if answers.is_empty() {
                    Ok(None)
                } else {
                    Ok(answers.remove(0))
                }
            })
        }
    }

    struct FakeSpawn {
        outcome: Mutex<Option<Result<SpawnOutcome, HostError>>>,
        requests: Mutex<Vec<ElevatedSpawnRequest>>,
    }

    impl FakeSpawn {
        fn returning(outcome: SpawnOutcome) -> Arc<Self> {
            Arc::new(Self {
                outcome: Mutex::new(Some(Ok(outcome))),
                requests: Mutex::new(Vec::new()),
            })
        }

        fn failing(message: &str) -> Arc<Self> {
            Arc::new(Self {
                outcome: Mutex::new(Some(Err(HostError::Error(message.to_owned())))),
                requests: Mutex::new(Vec::new()),
            })
        }

        fn calls(&self) -> usize {
            self.requests.lock().unwrap().len()
        }

        fn last(&self) -> ElevatedSpawnRequest {
            self.requests.lock().unwrap().last().cloned().expect("spawned")
        }
    }

    impl ElevatedSpawnPort for FakeSpawn {
        fn spawn<'a>(
            &'a self,
            request: ElevatedSpawnRequest,
        ) -> BoxFuture<'a, Result<SpawnOutcome, HostError>> {
            Box::pin(async move {
                self.requests.lock().unwrap().push(request);
                self.outcome
                    .lock()
                    .unwrap()
                    .take()
                    .unwrap_or_else(|| Ok(SpawnOutcome::default()))
            })
        }
    }

    fn unix_tools(secret: Option<Arc<FakeSecret>>, spawn: Arc<FakeSpawn>) -> ElevatedTools {
        let tools = ElevatedTools::new(spawn).with_runtime(ElevatedRuntime {
            platform: Some(Platform::Other),
            uid: Some(1000),
        });
        match secret {
            Some(secret) => tools.with_secret_input(secret),
            None => tools,
        }
    }

    fn windows_tools(secret: Option<Arc<FakeSecret>>, spawn: Arc<FakeSpawn>) -> ElevatedTools {
        let tools = ElevatedTools::new(spawn).with_runtime(ElevatedRuntime {
            platform: Some(Platform::Windows),
            uid: None,
        });
        match secret {
            Some(secret) => tools.with_secret_input(secret),
            None => tools,
        }
    }

    fn context() -> Value {
        json!({ "sessionId": "s-1", "userId": "u-1", "projectRoot": "/tmp/project" })
    }

    #[test]
    fn metadata_describes_elevated_run_with_high_risk_consent() {
        let tools = metadata().as_array().expect("array");
        assert_eq!(tools.len(), 1);
        let tool = definition(ELEVATED_RUN);
        assert_eq!(tool["name"], json!(ELEVATED_RUN));
        assert_eq!(tool["tier"], json!("standard"));
        assert_eq!(tool["category"], json!("os"));
        assert_eq!(tool["source"], json!("builtin"));
        assert_eq!(tool["risk"], json!("high"));
        assert_eq!(tool["defaultConsentLevel"], json!("always"));
        assert_eq!(tool["parameters"]["required"], json!(["command"]));
        assert!(tool["description"].as_str().unwrap_or_default().len() > 40);
        assert!(definition("elevated.missing").is_null());
    }

    #[tokio::test]
    async fn unknown_tool_is_reported() {
        let spawn = FakeSpawn::returning(SpawnOutcome::default());
        let result = unix_tools(None, spawn).call("elevated.other", &json!({}), &context()).await;
        assert_eq!(result["ok"], json!(false));
        assert_eq!(result["message"], json!("Unknown tool: elevated.other"));
    }

    #[tokio::test]
    async fn missing_command_fails_schema_validation() {
        let spawn = FakeSpawn::returning(SpawnOutcome::default());
        let result = unix_tools(None, spawn.clone())
            .call(ELEVATED_RUN, &json!({}), &context())
            .await;
        assert_eq!(result["ok"], json!(false));
        assert!(result["message"].as_str().unwrap_or_default().contains("command"));
        assert_eq!(spawn.calls(), 0);
    }

    #[tokio::test]
    async fn blank_command_is_rejected_before_prompting() {
        let secret = FakeSecret::returning(vec![Some("pw")]);
        let spawn = FakeSpawn::returning(SpawnOutcome::default());
        let result = unix_tools(Some(secret.clone()), spawn.clone())
            .call(ELEVATED_RUN, &json!({ "command": "   " }), &context())
            .await;
        assert_eq!(result["ok"], json!(false));
        assert_eq!(result["message"], json!("command is required"));
        assert!(secret.requests.lock().unwrap().is_empty());
        assert_eq!(spawn.calls(), 0);
    }

    #[tokio::test]
    async fn missing_secret_service_is_an_explicit_denial() {
        let spawn = FakeSpawn::returning(SpawnOutcome::default());
        let result = unix_tools(None, spawn.clone())
            .call(ELEVATED_RUN, &json!({ "command": "id" }), &context())
            .await;
        assert_eq!(result["ok"], json!(false));
        assert_eq!(result["message"], json!("Secret input service is unavailable"));
        assert_eq!(spawn.calls(), 0);
    }

    #[tokio::test]
    async fn declined_password_aborts_before_spawning() {
        let secret = FakeSecret::returning(vec![None]);
        let spawn = FakeSpawn::returning(SpawnOutcome::default());
        let result = unix_tools(Some(secret.clone()), spawn.clone())
            .call(ELEVATED_RUN, &json!({ "command": "id" }), &context())
            .await;
        assert_eq!(result["ok"], json!(false));
        assert_eq!(result["message"], json!("Administrator password was not provided"));
        let requests = secret.requests.lock().unwrap();
        assert_eq!(requests.len(), 1);
        assert_eq!(requests[0].requested_by, ELEVATED_RUN);
        assert_eq!(requests[0].prompt, "Password to run an elevated command with sudo");
        assert_eq!(requests[0].timeout_ms, SECRET_PROMPT_TIMEOUT_MS);
        assert_eq!(spawn.calls(), 0);
    }

    #[tokio::test]
    async fn unix_sudo_run_forwards_password_on_stdin() {
        let secret = FakeSecret::returning(vec![Some("s3cret")]);
        let spawn = FakeSpawn::returning(SpawnOutcome {
            stdout: "uid=0(root)\n".to_owned(),
            stderr: String::new(),
            exit_code: Some(0),
            signal: None,
            timed_out: false,
        });
        let result = unix_tools(Some(secret), spawn.clone())
            .call(
                ELEVATED_RUN,
                &json!({ "command": "id -u", "reason": "install package" }),
                &context(),
            )
            .await;
        assert_eq!(result["ok"], json!(true));
        assert_eq!(result["message"], json!("Elevated command exited with code 0"));
        assert_eq!(result["data"]["output"], json!("uid=0(root)"));
        assert_eq!(result["data"]["elevated"], json!(true));
        assert_eq!(result["data"]["cwd"], json!("/tmp/project"));
        let request = spawn.last();
        assert_eq!(request.command, "sudo");
        assert_eq!(request.args[0], "-S");
        assert_eq!(request.args[5], "sh");
        assert_eq!(request.stdin.as_deref(), Some("s3cret\n"));
        assert_eq!(request.timeout_ms, DEFAULT_TIMEOUT_MS);
        // The password must never appear in the tool result.
        assert!(!result.to_string().contains("s3cret"));
    }

    #[tokio::test]
    async fn already_root_runs_sh_without_prompting() {
        let spawn = FakeSpawn::returning(SpawnOutcome {
            stdout: "ok".to_owned(),
            exit_code: Some(0),
            ..SpawnOutcome::default()
        });
        let tools = ElevatedTools::new(spawn.clone()).with_runtime(ElevatedRuntime {
            platform: Some(Platform::Other),
            uid: Some(0),
        });
        let result = tools
            .call(ELEVATED_RUN, &json!({ "command": "id", "cwd": "/srv" }), &context())
            .await;
        assert_eq!(result["ok"], json!(true));
        assert_eq!(result["data"]["elevated"], json!(false));
        let request = spawn.last();
        assert_eq!(request.command, "sh");
        assert_eq!(request.args, vec!["-lc".to_owned(), "id".to_owned()]);
        assert!(request.stdin.is_none());
        assert_eq!(request.cwd, "/srv");
    }

    #[tokio::test]
    async fn windows_without_username_uses_uac_wrapper() {
        let spawn = FakeSpawn::returning(SpawnOutcome {
            stdout: "  done  ".to_owned(),
            exit_code: Some(0),
            ..SpawnOutcome::default()
        });
        let result = windows_tools(None, spawn.clone())
            .call(ELEVATED_RUN, &json!({ "command": "whoami" }), &context())
            .await;
        assert_eq!(result["ok"], json!(true));
        let request = spawn.last();
        assert_eq!(request.command, "powershell.exe");
        assert_eq!(request.args[2], "-EncodedCommand");
        assert_eq!(request.env["JAIT_ELEVATED_CWD"], "/tmp/project");
        assert!(request.env.contains_key("JAIT_ELEVATED_COMMAND_B64"));
        assert!(!request.env.contains_key("JAIT_ELEVATED_PASSWORD"));
        assert!(request.stdin.is_none());
        assert_eq!(request.timeout_ms, DEFAULT_TIMEOUT_MS);
    }

    #[tokio::test]
    async fn windows_with_username_prompts_and_uses_credential_wrapper() {
        let secret = FakeSecret::returning(vec![Some("pw")]);
        let spawn = FakeSpawn::returning(SpawnOutcome {
            stdout: String::new(),
            exit_code: Some(0),
            ..SpawnOutcome::default()
        });
        let result = windows_tools(Some(secret.clone()), spawn.clone())
            .call(
                ELEVATED_RUN,
                &json!({ "command": "whoami", "username": " Administrator ", "reason": "service restart" }),
                &context(),
            )
            .await;
        assert_eq!(result["ok"], json!(true));
        let requests = secret.requests.lock().unwrap();
        assert_eq!(
            requests[0].prompt,
            "Password for Administrator to run an elevated command: service restart"
        );
        let request = spawn.last();
        assert_eq!(request.env["JAIT_ELEVATED_USERNAME"], "Administrator");
        assert_eq!(request.env["JAIT_ELEVATED_PASSWORD"], "pw");
        // Redacted debug output must not leak the credential.
        assert!(!format!("{request:?}").contains("pw"));
    }

    #[tokio::test]
    async fn windows_json_wrapper_output_is_unwrapped() {
        let spawn = FakeSpawn::returning(SpawnOutcome {
            stdout: json!({ "exitCode": 3, "stdout": " partial ", "stderr": "boom" }).to_string(),
            exit_code: Some(0),
            ..SpawnOutcome::default()
        });
        let result = windows_tools(None, spawn)
            .call(ELEVATED_RUN, &json!({ "command": "whoami" }), &context())
            .await;
        assert_eq!(result["ok"], json!(false));
        assert_eq!(result["message"], json!("Elevated command exited with code 3"));
        assert_eq!(result["data"]["exitCode"], json!(3));
        assert_eq!(result["data"]["stdout"], json!("partial"));
        assert_eq!(result["data"]["stderr"], json!("boom"));
        assert_eq!(result["data"]["output"], json!("partial\nboom"));
    }

    #[tokio::test]
    async fn timeout_reports_dedicated_message_and_no_output_fallback() {
        let spawn = FakeSpawn::returning(SpawnOutcome {
            timed_out: true,
            exit_code: None,
            ..SpawnOutcome::default()
        });
        let tools = ElevatedTools::new(spawn).with_runtime(ElevatedRuntime {
            platform: Some(Platform::Other),
            uid: Some(0),
        });
        let result = tools
            .call(ELEVATED_RUN, &json!({ "command": "sleep 10", "timeoutMs": 1500.0 }), &context())
            .await;
        assert_eq!(result["ok"], json!(false));
        assert_eq!(result["message"], json!("Elevated command timed out after 1500ms"));
        assert_eq!(result["data"]["timedOut"], json!(true));
        assert_eq!(result["data"]["output"], json!("(no output)"));
    }

    #[tokio::test]
    async fn spawn_errors_are_reported_as_failures() {
        let spawn = FakeSpawn::failing("spawn sudo ENOENT");
        let secret = FakeSecret::returning(vec![Some("pw")]);
        let result = unix_tools(Some(secret), spawn)
            .call(ELEVATED_RUN, &json!({ "command": "id" }), &context())
            .await;
        assert_eq!(result["ok"], json!(false));
        assert_eq!(result["message"], json!("spawn sudo ENOENT"));
    }

    #[tokio::test]
    async fn cancellation_short_circuits_before_any_port_call() {
        let secret = FakeSecret::returning(vec![Some("pw")]);
        let spawn = FakeSpawn::returning(SpawnOutcome::default());
        let result = unix_tools(Some(secret.clone()), spawn.clone())
            .call(
                ELEVATED_RUN,
                &json!({ "command": "id" }),
                &json!({ "sessionId": "s-1", "aborted": true }),
            )
            .await;
        assert_eq!(result["ok"], json!(false));
        assert_eq!(result["message"], json!("Elevated command was cancelled."));
        assert!(secret.requests.lock().unwrap().is_empty());
        assert_eq!(spawn.calls(), 0);
    }

}
