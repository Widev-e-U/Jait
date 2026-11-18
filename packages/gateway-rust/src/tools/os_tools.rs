//! Port of `packages/gateway/src/tools/os-tools.ts` (`os.query`, `os.install`).
//!
//! The TypeScript tools read `node:os`, `process.env` and shelled out through
//! `node:child_process`. The native adapter owns no ambient process/host state, so
//! every host-dependent read is routed through the caller-supplied `JaitPort<C>`:
//!
//! | host method | arguments | expected result |
//! |-------------|-----------|-----------------|
//! | `osInfo`    | `[]` | object with `platform`, `type`, `release`, `hostname`, `arch`, `cpus`, `cpuModel`, `totalMemoryGB`, `freeMemoryGB`, `uptimeHours`, `cwd`, `nodeVersion`, `pid` |
//! | `exec`      | `[{ "command": String, "timeout": u64, "shell"?: String }]` | `{ "stdout": String, "stderr": String, "exitCode": i64 }`; a non-zero exit / timeout is reported as an error |
//! | `env`       | `[["PATH", …]]` (one array of variable names) | object mapping variable names to their values |
//!
//! Only the `platform` override is computed natively (`std::env::consts::OS` spelled
//! the `node:os` way); everything else comes from the host.

use super::core_io::HostError;
use super::core_jait::JaitPort;
use super::validate::{ToolInput, validate_tool_input};
use crate::services::calendar::js_text;
use serde_json::{Map, Value, json};
use std::sync::LazyLock;

static METADATA: LazyLock<Value> = LazyLock::new(|| {
    serde_json::from_str(include_str!("os-tools-metadata.json")).expect("os-tools-metadata.json")
});

pub fn metadata() -> &'static Value {
    &METADATA
}

pub fn definition(name: &str) -> &'static Value {
    METADATA
        .as_array()
        .and_then(|tools| {
            tools
                .iter()
                .find(|tool| tool["name"].as_str() == Some(name))
        })
        .unwrap_or_else(|| panic!("missing tool definition: {name}"))
}

fn success(message: impl Into<String>, data: Value) -> Value {
    json!({ "ok": true, "message": message.into(), "data": data })
}

fn fail(message: impl Into<String>) -> Value {
    json!({ "ok": false, "message": message.into() })
}

/// `err.message` from the TS modules: the host error's message text.
fn error_text(error: &HostError) -> String {
    match error {
        HostError::Error(message) => message.clone(),
        HostError::Thrown(value) => match value {
            Value::String(text) => text.clone(),
            Value::Null => "Host error".into(),
            other => other.to_string(),
        },
    }
}

/// `String.prototype.trim` (Rust trims all Unicode whitespace except U+FEFF).
fn trim_js(value: &str) -> String {
    value
        .trim_matches(|c: char| c.is_whitespace() || c == '\u{feff}')
        .to_string()
}

/// `node:os` `platform()` spelling.
pub fn platform() -> &'static str {
    match std::env::consts::OS {
        "windows" => "win32",
        "macos" => "darwin",
        other => other,
    }
}

fn detect_package_manager() -> &'static str {
    match platform() {
        "win32" => "winget",
        "darwin" => "brew",
        _ => "apt",
    }
}

/// `buildInstallCommand` from the TS module: leading-dash guard plus the
/// `^[\w./@-]+$` package-name whitelist before the manager command is built.
fn build_install_command(manager: &str, package: &str) -> Option<String> {
    if package.starts_with('-') || package.is_empty() {
        return None;
    }
    let safe = package
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '.' | '/' | '@' | '-'));
    if !safe {
        return None;
    }
    Some(match manager {
        "winget" => format!(
            "winget install --accept-package-agreements --accept-source-agreements -e --id {package}"
        ),
        "apt" => format!("sudo apt-get install -y {package}"),
        "brew" => format!("brew install {package}"),
        _ => return None,
    })
}

/// First `\d+` run of a string, as used by the git-status line count parse.
fn first_number(text: &str) -> Option<u64> {
    let mut digits = String::new();
    for ch in text.chars() {
        if ch.is_ascii_digit() {
            digits.push(ch);
        } else if !digits.is_empty() {
            break;
        }
    }
    digits.parse().ok()
}

fn round1(value: f64) -> f64 {
    (value * 10.0).round() / 10.0
}

fn validation_failure(name: &str, input: &Value) -> Result<Value, Value> {
    let mut validated = ToolInput::new(input);
    let validation = validate_tool_input(&definition(name)["parameters"], &mut validated)
        .expect("static os tool schema");
    if validation.valid {
        Ok(validated.value())
    } else {
        Err(fail(format!(
            "Input validation failed: {}",
            validation
                .errors
                .iter()
                .map(|s| String::from_utf16_lossy(&s.0))
                .collect::<Vec<_>>()
                .join("; ")
        )))
    }
}

struct ExecOutput {
    stdout: String,
    stderr: String,
}

pub struct OsTools<C> {
    pub host: JaitPort<C>,
}

impl<C: Send + Sync> OsTools<C> {
    async fn exec(
        &self,
        command: &str,
        timeout_ms: u64,
        shell: Option<&str>,
        host: &C,
    ) -> Result<ExecOutput, HostError> {
        let mut request = Map::new();
        request.insert("command".to_string(), json!(command));
        request.insert("timeout".to_string(), json!(timeout_ms));
        if let Some(shell) = shell {
            request.insert("shell".to_string(), json!(shell));
        }
        let response = (self.host)("exec", vec![Value::Object(request)], host).await?;
        let response = response.unwrap_or(Value::Null);
        Ok(ExecOutput {
            stdout: response.get("stdout").map(js_text).unwrap_or_default(),
            stderr: response.get("stderr").map(js_text).unwrap_or_default(),
        })
    }

    /// Best-effort variant used by the `info` extras (TS `Promise.allSettled`).
    async fn exec_text(
        &self,
        command: &str,
        timeout_ms: u64,
        shell: Option<&str>,
        host: &C,
    ) -> Option<String> {
        self.exec(command, timeout_ms, shell, host)
            .await
            .ok()
            .map(|output| trim_js(&output.stdout))
    }

    async fn info(&self, host: &C) -> Result<Value, HostError> {
        let mut data = match (self.host)("osInfo", Vec::new(), host).await? {
            Some(Value::Object(map)) => map,
            _ => Map::new(),
        };
        data.insert("platform".to_string(), json!(platform()));

        if let Some(bun) = self.exec_text("bun --version", 5_000, None, host).await {
            data.insert("bunVersion".to_string(), json!(bun));
        }

        if let Some(branch) = self
            .exec_text("git rev-parse --abbrev-ref HEAD", 5_000, None, host)
            .await
        {
            data.insert("gitBranch".to_string(), json!(branch));
            if let Some(status) = self
                .exec_text(
                    "git status --porcelain | measure-object -line",
                    5_000,
                    None,
                    host,
                )
                .await
            {
                data.insert(
                    "gitDirtyFiles".to_string(),
                    json!(first_number(&status).unwrap_or(0)),
                );
            }
        }

        if platform() == "win32"
            && let Some(edition) = self
                .exec_text(
                    "(Get-CimInstance Win32_OperatingSystem).Caption",
                    5_000,
                    Some("powershell.exe"),
                    host,
                )
                .await
        {
            data.insert("osEdition".to_string(), json!(edition));
        }

        if platform() == "win32" {
            let command = "powershell -NoProfile -c \"(Get-PSDrive (Get-Location).Drive.Name) | Select-Object Used,Free | ConvertTo-Json\"";
            if let Some(raw) = self.exec_text(command, 5_000, None, host).await
                && let Ok(parsed) = serde_json::from_str::<Value>(&raw)
            {
                let gigabytes = |key: &str| {
                    parsed
                        .get(key)
                        .and_then(Value::as_f64)
                        .map(|bytes| round1(bytes / 1_073_741_824.0))
                };
                if let Some(used) = gigabytes("Used") {
                    data.insert("diskUsedGB".to_string(), json!(used));
                }
                if let Some(free) = gigabytes("Free") {
                    data.insert("diskFreeGB".to_string(), json!(free));
                }
            }
        } else if let Some(raw) = self
            .exec_text(
                "df -BG --output=used,avail / 2>/dev/null | tail -1",
                5_000,
                None,
                host,
            )
            .await
        {
            let mut parts = raw.split_whitespace();
            let used = parts.next().and_then(|value| value.parse::<i64>().ok());
            let avail = parts.next().and_then(|value| value.parse::<i64>().ok());
            data.insert(
                "diskUsedGB".to_string(),
                used.map(|value| json!(value)).unwrap_or(Value::Null),
            );
            data.insert(
                "diskFreeGB".to_string(),
                avail.map(|value| json!(value)).unwrap_or(Value::Null),
            );
        }

        if let Some(user) = self.exec_text("whoami", 3_000, None, host).await {
            data.insert("user".to_string(), json!(user));
        }

        if platform() == "win32" {
            if let Some(version) = self
                .exec_text(
                    "powershell -NoProfile -c \"$PSVersionTable.PSVersion.ToString()\"",
                    5_000,
                    None,
                    host,
                )
                .await
            {
                data.insert(
                    "shellVersion".to_string(),
                    json!(format!("PowerShell {version}")),
                );
            }
        } else if let Some(version) = self
            .exec_text(
                "$SHELL --version 2>/dev/null | head -1 || echo $SHELL",
                3_000,
                None,
                host,
            )
            .await
        {
            data.insert("shellVersion".to_string(), json!(version));
        }

        Ok(Value::Object(data))
    }

    pub async fn query(&self, input: &Value, _context: &Value, host: &C) -> Value {
        let input = match validation_failure("os.query", input) {
            Ok(input) => input,
            Err(error) => return error,
        };
        match input
            .get("query")
            .and_then(Value::as_str)
            .unwrap_or_default()
        {
            "info" => match self.info(host).await {
                Ok(data) => success("System info", data),
                Err(error) => fail(error_text(&error)),
            },
            "processes" => {
                let command = if platform() == "win32" {
                    "tasklist /FO CSV /NH | Select-Object -First 25"
                } else {
                    "ps aux --sort=-%mem | head -25"
                };
                match self.exec(command, 10_000, None, host).await {
                    Ok(output) => success(
                        "Top processes",
                        json!({ "output": trim_js(&output.stdout) }),
                    ),
                    Err(error) => fail(error_text(&error)),
                }
            }
            "disk" => {
                let command = if platform() == "win32" {
                    "wmic logicaldisk get size,freespace,caption /format:csv"
                } else {
                    "df -h"
                };
                match self.exec(command, 10_000, None, host).await {
                    Ok(output) => {
                        success("Disk usage", json!({ "output": trim_js(&output.stdout) }))
                    }
                    Err(error) => fail(error_text(&error)),
                }
            }
            "env" => {
                const SAFE: [&str; 7] = [
                    "PATH",
                    "HOME",
                    "USERPROFILE",
                    "SHELL",
                    "TERM",
                    "LANG",
                    "NODE_ENV",
                ];
                let mut variables = Map::new();
                if let Ok(Some(Value::Object(values))) =
                    (self.host)("env", vec![json!(SAFE)], host).await
                {
                    for key in SAFE {
                        if let Some(value) = values.get(key).and_then(Value::as_str)
                            && !value.is_empty()
                        {
                            variables.insert(key.to_string(), json!(value));
                        }
                    }
                }
                success(
                    "Environment variables (safe subset)",
                    Value::Object(variables),
                )
            }
            other => fail(format!("Unknown query: {other}")),
        }
    }

    pub async fn install(&self, input: &Value, _context: &Value, host: &C) -> Value {
        let input = match validation_failure("os.install", input) {
            Ok(input) => input,
            Err(error) => return error,
        };
        let package = input
            .get("package")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();
        let manager = match input.get("manager").and_then(Value::as_str) {
            None | Some("auto") => detect_package_manager().to_string(),
            Some(other) => other.to_string(),
        };
        let Some(command) = build_install_command(&manager, &package) else {
            return fail(format!(
                "No package manager available for platform {}",
                platform()
            ));
        };
        match self.exec(&command, 120_000, None, host).await {
            Ok(output) => success(
                format!("Installed {package} via {manager}"),
                json!({
                    "stdout": trim_js(&output.stdout),
                    "stderr": trim_js(&output.stderr),
                    "manager": manager,
                }),
            ),
            Err(error) => fail(error_text(&error)),
        }
    }
}
