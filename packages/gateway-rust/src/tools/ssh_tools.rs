//! Port of `packages/gateway/src/tools/ssh-tools.ts`.
//!
//! Four tools: `ssh.run`, `ssh.session.start`, `ssh.session.run` and
//! `ssh.session.close`. The pure parts (argument building, sudo wrapping,
//! output cleaning, target validation, secret keys) are transcribed verbatim
//! here; the PTY side (spawning `ssh` under a pseudo-terminal, feeding the
//! login/sudo secret, killing on timeout, the session registry) is supplied by
//! the host through [`JaitPort`], exactly as `terminal-tools.ts` keeps it in
//! `node-pty` + a module-level `Map`.
//!
//! # Host port surface
//!
//! | method | args | returns |
//! | --- | --- | --- |
//! | `userSecretGet` | `[userId, secretType, secretKey]` | saved secret string, or nullish |
//! | `secretRequest` | `[request]` | secret string, or nullish when the user did not answer |
//! | `sshRun` | `[spec]` | `{"output": string, "exitCode": number\|null, "timedOut": bool}` |
//! | `sshSessionStart` | `[spec]` | `{"id", "host", "username", "port", "createdAt"}`, or a thrown `HostError` |
//! | `sshSessionRun` | `[sshSessionId, command, timeoutMs]` | `{"output", "exitCode", "timedOut"}` |
//! | `sshSessionClose` | `[sshSessionId]` | ignored |
//!
//! `sshRun`/`sshSessionRun` own the timeout, the SIGTERM kill, the secret
//! redaction of echoed secrets and the `context.onOutputChunk` streaming that
//! the TypeScript module performs inside `runSshInPty` / `runCommandInSshSession`.
//! `sshSessionStart` owns the ready-marker handshake (`SSH session did not
//! become ready within <n>ms`, `SSH process exited before the session became
//! ready`).

use super::core_io::HostError;
use super::core_jait::JaitPort;
use crate::services::calendar::{js_text, truthy};
use serde_json::{Map, Value, json};
use std::sync::LazyLock;

const SSH_PASSWORD_SECRET_TYPE: &str = "ssh-password";
const SSH_SUDO_PASSWORD_SECRET_TYPE: &str = "ssh-sudo-password";
const DEFAULT_PORT: u64 = 22;
const DEFAULT_TIMEOUT_MS: u64 = 30_000;
const MIN_SECRET_TIMEOUT_MS: u64 = 120_000;
const MAX_OUTPUT_CHARS: usize = 200_000;

/// Tool metadata, transcoded verbatim from the TypeScript definitions.
pub fn metadata() -> &'static Value {
    static DATA: LazyLock<Value> = LazyLock::new(|| {
        serde_json::from_str(include_str!("ssh-tools-metadata.json"))
            .expect("ssh-tools-metadata.json must be valid JSON")
    });
    &DATA
}

/// Look up one tool definition inside the shared module metadata array.
pub fn definition(name: &str) -> &'static Value {
    static EMPTY: LazyLock<Value> = LazyLock::new(|| json!({}));
    metadata()
        .as_array()
        .and_then(|tools| tools.iter().find(|tool| tool["name"] == json!(name)))
        .unwrap_or(&EMPTY)
}

fn fail(message: impl Into<String>) -> Value {
    json!({ "ok": false, "message": message.into() })
}

fn success(message: impl Into<String>, data: Value) -> Value {
    json!({ "ok": true, "message": message.into(), "data": data })
}

/// JavaScript `String.prototype.trim()` — unlike Rust's `trim`, U+FEFF counts
/// as whitespace.
pub fn js_trim(value: &str) -> &str {
    value.trim_matches(|c: char| {
        matches!(
            c,
            '\u{9}'..='\u{d}'
                | ' '
                | '\u{a0}'
                | '\u{1680}'
                | '\u{2000}'..='\u{200a}'
                | '\u{2028}'
                | '\u{2029}'
                | '\u{202f}'
                | '\u{205f}'
                | '\u{3000}'
                | '\u{feff}'
        )
    })
}

/// `input.x ?? fallback` for numeric optionals.
fn number_or(record: &Value, key: &str, fallback: u64) -> u64 {
    record
        .get(key)
        .and_then(Value::as_f64)
        .filter(|value| value.is_finite() && *value >= 0.0)
        .map(|value| value as u64)
        .unwrap_or(fallback)
}

/// `input.x ?? true` for boolean optionals.
fn bool_or(record: &Value, key: &str, fallback: bool) -> bool {
    match record.get(key) {
        Some(value) if !value.is_null() => truthy(value),
        _ => fallback,
    }
}

/// `input.x ?? ""` for string optionals.
fn string_or_empty(record: &Value, key: &str) -> String {
    match record.get(key) {
        Some(Value::String(text)) => text.clone(),
        Some(value) if !value.is_null() => js_text(value),
        _ => String::new(),
    }
}

/// `shellSingleQuote` — wrap a value as a single POSIX `sh` token.
pub fn shell_single_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

/// `buildSudoCommand` — `sudo -S -k -p <marker> [-u user] -- sh -lc <command>`.
pub fn build_sudo_command(command: &str, marker: &str, sudo_user: Option<&str>) -> String {
    let trimmed = sudo_user.map(js_trim).unwrap_or("");
    let target = if trimmed.is_empty() {
        String::new()
    } else {
        format!("-u {} ", shell_single_quote(trimmed))
    };
    format!(
        "sudo -S -k -p {} {}-- sh -lc {}",
        shell_single_quote(marker),
        target,
        shell_single_quote(command)
    )
}

/// `stripAnsi` — the ANSI/OSC escape sequences the module clears before
/// inspecting or returning PTY output.
pub fn strip_ansi(value: &str) -> String {
    let chars: Vec<char> = value.chars().collect();
    let mut out = String::with_capacity(value.len());
    let mut index = 0usize;
    while index < chars.len() {
        let ch = chars[index];
        if ch != '\u{1b}' {
            out.push(ch);
            index += 1;
            continue;
        }
        let next = chars.get(index + 1).copied();
        match next {
            // CSI: ESC [ param* intermediate* final
            Some('[') => {
                let mut cursor = index + 2;
                while cursor < chars.len() && ('\u{20}'..='\u{3f}').contains(&chars[cursor]) {
                    cursor += 1;
                }
                while cursor < chars.len() && ('\u{20}'..='\u{2f}').contains(&chars[cursor]) {
                    cursor += 1;
                }
                if cursor < chars.len() && ('\u{40}'..='\u{7e}').contains(&chars[cursor]) {
                    cursor += 1;
                }
                index = cursor;
            }
            // OSC: ESC ] ... BEL | ESC \
            Some(']') => {
                let mut cursor = index + 2;
                let mut end = chars.len();
                while cursor < chars.len() {
                    if chars[cursor] == '\u{7}' {
                        end = cursor + 1;
                        break;
                    }
                    if chars[cursor] == '\u{1b}' && chars.get(cursor + 1) == Some(&'\\') {
                        end = cursor + 2;
                        break;
                    }
                    cursor += 1;
                }
                index = end;
            }
            // Two-character escape (ESC @ .. ESC _, ESC \ .. ESC -).
            Some(other)
                if ('\u{40}'..='\u{5f}').contains(&other) || ('@'..='_').contains(&other) =>
            {
                index += 2;
            }
            _ => {
                out.push(ch);
                index += 1;
            }
        }
    }
    out
}

/// `cleanOutput` — strip escapes/CRs, drop the pending marker and echoed
/// command line, trim, and keep only the tail of oversized output.
pub fn clean_output(value: &str, command: &str, strip_marker: Option<&str>) -> String {
    let mut output = strip_ansi(value).replace('\r', "");
    if let Some(marker) = strip_marker {
        output = output.split(marker).collect::<Vec<_>>().join("");
    }
    let trimmed_command = js_trim(command);
    output = output
        .split('\n')
        .filter(|line| js_trim(line) != trimmed_command)
        .collect::<Vec<_>>()
        .join("\n");
    output = js_trim(&output).to_string();
    if output.chars().count() > MAX_OUTPUT_CHARS {
        let tail: String = output
            .chars()
            .rev()
            .take(MAX_OUTPUT_CHARS)
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .collect();
        output = format!("…(truncated)\n{tail}");
    }
    if output.is_empty() {
        "(no output)".to_string()
    } else {
        output
    }
}

/// `cleanSessionCommandOutput` — the persistent-session variant: everything
/// after the exit marker is dropped, echoed command lines and the `printf`
/// probe are filtered out.
pub fn clean_session_command_output(value: &str, command: &str, marker: &str) -> String {
    let mut output = strip_ansi(value).replace('\r', "");
    if let Some(index) = output.find(marker) {
        output = output[..index].to_string();
    }
    let command_lines: Vec<String> = js_trim(command)
        .split('\n')
        .map(|line| js_trim(line).to_string())
        .filter(|line| !line.is_empty())
        .collect();
    output = output
        .split('\n')
        .map(|line| line.trim_end().to_string())
        .filter(|line| {
            let trimmed = js_trim(line);
            if trimmed.is_empty() {
                return true;
            }
            if command_lines.iter().any(|expected| expected == trimmed) {
                return false;
            }
            if trimmed.starts_with("printf ") && trimmed.contains(marker) {
                return false;
            }
            true
        })
        .collect::<Vec<_>>()
        .join("\n");
    output = js_trim(&output).to_string();
    if output.chars().count() > MAX_OUTPUT_CHARS {
        let tail: String = output
            .chars()
            .rev()
            .take(MAX_OUTPUT_CHARS)
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .collect();
        output = format!("…(truncated)\n{tail}");
    }
    if output.is_empty() {
        "(no output)".to_string()
    } else {
        output
    }
}

/// `validateTargetPart` — blank is required, and `host`/`username` may not
/// contain whitespace, quotes or `@`.
pub fn validate_target_part(value: &str, label: &str) -> Option<String> {
    if js_trim(value).is_empty() {
        return Some(format!("{label} is required"));
    }
    if value
        .chars()
        .any(|c| c.is_whitespace() || matches!(c, '\'' | '"' | '@'))
    {
        return Some(format!("{label} cannot contain whitespace, quotes, or @"));
    }
    None
}

/// `sshPasswordSecretKey` — `username@host:port`.
pub fn ssh_password_secret_key(username: &str, host: &str, port: u64) -> String {
    format!("{username}@{host}:{port}")
}

/// `buildSshArgs` — the exact OpenSSH argument vector, including the
/// `UserKnownHostsFile=/dev/null` and password-auth insertions.
pub fn build_ssh_args(
    host: &str,
    username: &str,
    port: u64,
    password: Option<&str>,
    strict_host_key_checking: bool,
    command: Option<&str>,
) -> Vec<String> {
    let mut args: Vec<String> = vec![
        "-p".to_string(),
        port.to_string(),
        "-o".to_string(),
        format!(
            "StrictHostKeyChecking={}",
            if strict_host_key_checking {
                "yes"
            } else {
                "no"
            }
        ),
        "-o".to_string(),
        "LogLevel=ERROR".to_string(),
        "-o".to_string(),
        "NumberOfPasswordPrompts=1".to_string(),
        "-o".to_string(),
        if password.is_some() {
            "BatchMode=no".to_string()
        } else {
            "BatchMode=yes".to_string()
        },
        format!("{username}@{host}"),
    ];
    if !strict_host_key_checking {
        args.splice(
            4..4,
            ["-o".to_string(), "UserKnownHostsFile=/dev/null".to_string()],
        );
    }
    if password.is_some() {
        args.splice(
            0..0,
            [
                "-o".to_string(),
                "PreferredAuthentications=password,keyboard-interactive".to_string(),
                "-o".to_string(),
                "PubkeyAuthentication=no".to_string(),
            ],
        );
    }
    if let Some(command) = command {
        args.push(command.to_string());
    }
    args
}

/// `authMethod ?? "key"`.
fn auth_method(input: &Value) -> String {
    match input.get("authMethod") {
        Some(Value::String(value)) => value.clone(),
        Some(value) if !value.is_null() => js_text(value),
        _ => "key".to_string(),
    }
}

/// Secret prompt timeout: `timeoutMs > 120_000 ? timeoutMs : 120_000`.
fn secret_timeout_ms(input: &Value) -> u64 {
    let timeout = number_or(input, "timeoutMs", 0);
    if timeout > MIN_SECRET_TIMEOUT_MS {
        timeout
    } else {
        MIN_SECRET_TIMEOUT_MS
    }
}

pub struct SshTools<C> {
    pub service: JaitPort<C>,
}

impl<C: Send + Sync> SshTools<C> {
    /// One host port call; `None` becomes JSON `null`.
    async fn call(&self, method: &str, args: Vec<Value>, host: &C) -> Result<Value, HostError> {
        Ok((self.service)(method, args, host)
            .await?
            .unwrap_or(Value::Null))
    }

    /// `userSecrets.getValue(userId, secretType, secretKey)` — nullish when no
    /// secret is remembered for that user.
    async fn saved_secret(
        &self,
        user_id: &Value,
        secret_type: &str,
        secret_key: &str,
        host: &C,
    ) -> Result<Option<String>, HostError> {
        let value = self
            .call(
                "userSecretGet",
                vec![user_id.clone(), json!(secret_type), json!(secret_key)],
                host,
            )
            .await?;
        Ok(match value {
            Value::String(text) if !text.is_empty() => Some(text),
            _ => None,
        })
    }

    /// `secretInput.requestSecret({...})`.
    async fn request_secret(
        &self,
        request: Map<String, Value>,
        host: &C,
    ) -> Result<Option<String>, HostError> {
        let value = self
            .call("secretRequest", vec![Value::Object(request)], host)
            .await?;
        Ok(match value {
            Value::String(text) if !text.is_empty() => Some(text),
            _ => None,
        })
    }

    /// `getPasswordIfNeeded` — `None` means the secret service is unavailable,
    /// `Some(None)` means key auth (or an unanswered prompt).
    async fn password_if_needed(
        &self,
        input: &Value,
        context: &Value,
        requested_by: &str,
        host: &C,
    ) -> Result<Option<Option<String>>, HostError> {
        if auth_method(input) != "password" {
            return Ok(Some(None));
        }
        let host_name = string_or_empty(input, "host");
        let username = string_or_empty(input, "username");
        let port = number_or(input, "port", DEFAULT_PORT);
        let secret_key = ssh_password_secret_key(&username, &host_name, port);
        let user_id = context.get("userId").cloned().unwrap_or(Value::Null);
        if let Some(saved) = self
            .saved_secret(&user_id, SSH_PASSWORD_SECRET_TYPE, &secret_key, host)
            .await?
        {
            return Ok(Some(Some(saved)));
        }
        let mut request = Map::new();
        request.insert(
            "sessionId".into(),
            context.get("sessionId").cloned().unwrap_or(Value::Null),
        );
        request.insert("userId".into(), user_id);
        request.insert("title".into(), json!("SSH password"));
        request.insert(
            "prompt".into(),
            json!(format!("Password for {username}@{host_name}")),
        );
        request.insert("requestedBy".into(), json!(requested_by));
        if let Some(command) = input.get("command").filter(|value| !value.is_null()) {
            request.insert("command".into(), command.clone());
        }
        request.insert("rememberable".into(), json!(true));
        request.insert(
            "rememberLabel".into(),
            json!(format!("SSH password for {username}@{host_name}")),
        );
        request.insert("secretType".into(), json!(SSH_PASSWORD_SECRET_TYPE));
        request.insert("secretKey".into(), json!(secret_key));
        request.insert("timeoutMs".into(), json!(secret_timeout_ms(input)));
        let password = self.request_secret(request, host).await?;
        Ok(Some(password))
    }

    /// `createSshRunTool(...).execute`.
    pub async fn run(&self, input: &Value, context: &Value, host: &C) -> Value {
        match self.run_inner(input, context, host).await {
            Ok(value) => value,
            Err(HostError::Error(message)) => fail(message),
            Err(HostError::Thrown(value)) => fail(match value.as_str() {
                Some(message) => message.to_string(),
                None => "Failed to run SSH command".to_string(),
            }),
        }
    }

    async fn run_inner(
        &self,
        input: &Value,
        context: &Value,
        host: &C,
    ) -> Result<Value, HostError> {
        let host_name = string_or_empty(input, "host");
        let username = string_or_empty(input, "username");
        let command = string_or_empty(input, "command");
        let port = number_or(input, "port", DEFAULT_PORT);
        let timeout_ms = number_or(input, "timeoutMs", DEFAULT_TIMEOUT_MS);
        let user_id = context.get("userId").cloned().unwrap_or(Value::Null);
        let secret_key = ssh_password_secret_key(&username, &host_name, port);

        let mut password: Option<String> = None;
        if auth_method(input) == "password" {
            match self
                .saved_secret(&user_id, SSH_PASSWORD_SECRET_TYPE, &secret_key, host)
                .await?
            {
                Some(saved) => password = Some(saved),
                None => {
                    let mut request = Map::new();
                    request.insert(
                        "sessionId".into(),
                        context.get("sessionId").cloned().unwrap_or(Value::Null),
                    );
                    request.insert("userId".into(), user_id.clone());
                    request.insert("title".into(), json!("SSH password"));
                    request.insert(
                        "prompt".into(),
                        json!(format!("Password for {username}@{host_name}")),
                    );
                    request.insert("requestedBy".into(), json!("ssh.run"));
                    request.insert("command".into(), json!(command));
                    request.insert("rememberable".into(), json!(true));
                    request.insert(
                        "rememberLabel".into(),
                        json!(format!("SSH password for {username}@{host_name}")),
                    );
                    request.insert("secretType".into(), json!(SSH_PASSWORD_SECRET_TYPE));
                    request.insert("secretKey".into(), json!(secret_key));
                    request.insert("timeoutMs".into(), json!(secret_timeout_ms(input)));
                    password = self.request_secret(request, host).await?;
                }
            }
            if password.is_none() {
                return Ok(fail("SSH password was not provided"));
            }
        }

        let mut sudo_password: Option<String> = None;
        let mut sudo_marker: Option<String> = None;
        let mut remote_command = command.clone();
        if truthy(input.get("sudo").unwrap_or(&Value::Null)) {
            let sudo_key = ssh_password_secret_key(&username, &host_name, port);
            match self
                .saved_secret(&user_id, SSH_SUDO_PASSWORD_SECRET_TYPE, &sudo_key, host)
                .await?
            {
                Some(saved) => sudo_password = Some(saved),
                None => {
                    let mut request = Map::new();
                    request.insert(
                        "sessionId".into(),
                        context.get("sessionId").cloned().unwrap_or(Value::Null),
                    );
                    request.insert("userId".into(), user_id.clone());
                    request.insert("title".into(), json!("sudo password"));
                    request.insert(
                        "prompt".into(),
                        json!(format!("sudo password for {username}@{host_name}")),
                    );
                    request.insert("requestedBy".into(), json!("ssh.run"));
                    request.insert("command".into(), json!(command));
                    request.insert("rememberable".into(), json!(true));
                    request.insert(
                        "rememberLabel".into(),
                        json!(format!("sudo password for {username}@{host_name}")),
                    );
                    request.insert("secretType".into(), json!(SSH_SUDO_PASSWORD_SECRET_TYPE));
                    request.insert("secretKey".into(), json!(sudo_key));
                    request.insert("timeoutMs".into(), json!(secret_timeout_ms(input)));
                    sudo_password = self.request_secret(request, host).await?;
                }
            }
            if sudo_password.is_none() {
                return Ok(fail("sudo password was not provided"));
            }
            let marker = format!(
                "__JAIT_SUDO_{}__:",
                uuid::Uuid::new_v4().to_string().replace('-', "_")
            );
            let sudo_user: Option<String> = match input.get("sudoUser") {
                Some(Value::String(value)) => Some(value.clone()),
                Some(value) if !value.is_null() => Some(js_text(value)),
                _ => None,
            };
            remote_command = build_sudo_command(&command, &marker, sudo_user.as_deref());
            sudo_marker = Some(marker);
        }

        let mut spec = Map::new();
        spec.insert("host".into(), json!(host_name));
        spec.insert("username".into(), json!(username));
        spec.insert("command".into(), json!(remote_command));
        spec.insert("port".into(), json!(port));
        spec.insert("password".into(), json!(password));
        spec.insert("sudoPassword".into(), json!(sudo_password));
        spec.insert("sudoMarker".into(), json!(sudo_marker));
        spec.insert("timeoutMs".into(), json!(timeout_ms));
        spec.insert(
            "strictHostKeyChecking".into(),
            json!(bool_or(input, "strictHostKeyChecking", true)),
        );
        spec.insert(
            "projectRoot".into(),
            context.get("projectRoot").cloned().unwrap_or(Value::Null),
        );
        spec.insert(
            "sessionId".into(),
            context.get("sessionId").cloned().unwrap_or(Value::Null),
        );
        let result = self.call("sshRun", vec![Value::Object(spec)], host).await?;

        let timed_out = truthy(result.get("timedOut").unwrap_or(&Value::Null));
        let exit_code = result.get("exitCode").cloned().unwrap_or(Value::Null);
        let message = if timed_out {
            format!("SSH command timed out after {timeout_ms}ms")
        } else {
            format!(
                "SSH command exited with code {}",
                if exit_code.is_null() {
                    "unknown".to_string()
                } else {
                    js_text(&exit_code)
                }
            )
        };
        let data = json!({
            "output": result.get("output").cloned().unwrap_or_else(|| json!("(no output)")),
            "exitCode": exit_code,
            "timedOut": timed_out,
            "host": host_name,
            "username": username,
            "port": port,
        });
        Ok(if !timed_out && is_zero(&data["exitCode"]) {
            success(message, data)
        } else {
            json!({ "ok": false, "message": message, "data": data })
        })
    }

    /// `createSshSessionStartTool(...).execute`.
    pub async fn session_start(&self, input: &Value, context: &Value, host: &C) -> Value {
        match self.session_start_inner(input, context, host).await {
            Ok(value) => value,
            Err(HostError::Error(message)) => fail(message),
            Err(HostError::Thrown(value)) => fail(match value.as_str() {
                Some(message) => message.to_string(),
                None => "Failed to start SSH session".to_string(),
            }),
        }
    }

    async fn session_start_inner(
        &self,
        input: &Value,
        context: &Value,
        host: &C,
    ) -> Result<Value, HostError> {
        let host_name = string_or_empty(input, "host");
        let username = string_or_empty(input, "username");
        if let Some(message) = validate_target_part(&host_name, "host") {
            return Ok(fail(message));
        }
        if let Some(message) = validate_target_part(&username, "username") {
            return Ok(fail(message));
        }

        let password = match self
            .password_if_needed(input, context, "ssh.session.start", host)
            .await?
        {
            Some(password) => password,
            None => return Ok(fail("Secret input service is unavailable")),
        };
        if auth_method(input) == "password" && password.is_none() {
            return Ok(fail("SSH password was not provided"));
        }

        let spec = json!({
            "host": host_name,
            "username": username,
            "port": number_or(input, "port", DEFAULT_PORT),
            "password": password,
            "timeoutMs": number_or(input, "timeoutMs", DEFAULT_TIMEOUT_MS),
            "strictHostKeyChecking": bool_or(input, "strictHostKeyChecking", true),
            "projectRoot": context.get("projectRoot").cloned().unwrap_or(Value::Null),
        });
        let session = self.call("sshSessionStart", vec![spec], host).await?;
        let id = session.get("id").cloned().unwrap_or(Value::Null);
        Ok(success(
            format!("SSH session started: {}", js_text(&id)),
            json!({
                "sshSessionId": id,
                "host": session.get("host").cloned().unwrap_or(Value::Null),
                "username": session.get("username").cloned().unwrap_or(Value::Null),
                "port": session.get("port").cloned().unwrap_or(Value::Null),
                "createdAt": session.get("createdAt").cloned().unwrap_or(Value::Null),
            }),
        ))
    }

    /// `createSshSessionRunTool().execute`.
    pub async fn session_run(&self, input: &Value, _context: &Value, host: &C) -> Value {
        let session_id = string_or_empty(input, "sshSessionId");
        let command = string_or_empty(input, "command");
        let timeout_ms = number_or(input, "timeoutMs", DEFAULT_TIMEOUT_MS);
        let result = match self
            .call(
                "sshSessionRun",
                vec![json!(session_id), json!(command), json!(timeout_ms)],
                host,
            )
            .await
        {
            Ok(result) => result,
            Err(HostError::Error(message)) => return fail(message),
            Err(HostError::Thrown(value)) => {
                return fail(match value.as_str() {
                    Some(message) => message.to_string(),
                    None => "Failed to run SSH session command".to_string(),
                });
            }
        };
        if result.is_null() {
            return fail(format!("SSH session not found: {session_id}"));
        }
        let timed_out = truthy(result.get("timedOut").unwrap_or(&Value::Null));
        let exit_code = result.get("exitCode").cloned().unwrap_or(Value::Null);
        let message = if timed_out {
            format!("SSH session command timed out after {timeout_ms}ms")
        } else {
            format!(
                "SSH session command exited with code {}",
                if exit_code.is_null() {
                    "unknown".to_string()
                } else {
                    js_text(&exit_code)
                }
            )
        };
        let data = json!({
            "output": result.get("output").cloned().unwrap_or_else(|| json!("(no output)")),
            "exitCode": exit_code,
            "timedOut": timed_out,
            "sshSessionId": session_id,
            "host": result.get("host").cloned().unwrap_or(Value::Null),
            "username": result.get("username").cloned().unwrap_or(Value::Null),
            "port": result.get("port").cloned().unwrap_or(Value::Null),
        });
        if !timed_out && is_zero(&data["exitCode"]) {
            success(message, data)
        } else {
            json!({ "ok": false, "message": message, "data": data })
        }
    }

    /// `createSshSessionCloseTool().execute`.
    pub async fn session_close(&self, input: &Value, context: &Value, host: &C) -> Value {
        let _ = context;
        let session_id = string_or_empty(input, "sshSessionId");
        match self
            .call("sshSessionClose", vec![json!(session_id)], host)
            .await
        {
            Ok(result) if !result.is_null() => success(
                format!("SSH session closed: {session_id}"),
                json!({ "sshSessionId": session_id }),
            ),
            Ok(_) => fail(format!("SSH session not found: {session_id}")),
            Err(HostError::Error(message)) => fail(message),
            Err(HostError::Thrown(value)) => fail(match value.as_str() {
                Some(message) => message.to_string(),
                None => "Failed to close SSH session".to_string(),
            }),
        }
    }
}

/// `result.exitCode === 0`.
fn is_zero(value: &Value) -> bool {
    matches!(value, Value::Number(number) if number.as_f64() == Some(0.0))
}
