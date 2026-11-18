//! Provider quota parsing and read-only requests. Process and HTTP dependencies are explicit.
use super::ollama_device_auth::{
    OllamaAuthError, OllamaAuthRequest, OllamaAuthTransport, OllamaCloudAccount,
};
use super::subscription_usage_fetchers::js_date_parse;
use crate::text::js_trim;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::borrow::Cow;

fn object(value: &Value) -> bool {
    value.is_object() || value.is_array()
}
fn nullish(value: Option<&Value>) -> bool {
    value.is_none_or(Value::is_null)
}
fn optional(value: &Value, key: &str, check: impl Fn(&Value) -> bool) -> bool {
    nullish(value.get(key)) || check(&value[key])
}
fn truthy(value: &Value) -> bool {
    match value {
        Value::Null => false,
        Value::Bool(v) => *v,
        Value::String(v) => !v.is_empty(),
        Value::Number(v) => v.as_f64().is_some_and(|v| v != 0.0),
        _ => true,
    }
}
fn values(value: &Value) -> Vec<&Value> {
    match value {
        Value::Array(values) => values.iter().collect(),
        Value::Object(values) => {
            let mut keys: Vec<_> = values.keys().collect();
            let index = |key: &&String| {
                key.parse::<u32>()
                    .ok()
                    .filter(|n| *n != u32::MAX && n.to_string() == **key)
            };
            keys.sort_by_key(|key| index(key).map_or((1, 0), |n| (0, n)));
            keys.into_iter().map(|key| &values[key]).collect()
        }
        _ => vec![],
    }
}
fn window(value: &Value) -> bool {
    object(value)
        && value["usedPercent"].is_number()
        && optional(value, "windowDurationMins", Value::is_number)
        && optional(value, "resetsAt", Value::is_number)
}
fn snapshot(value: &Value) -> bool {
    object(value) && optional(value, "primary", window) && optional(value, "secondary", window)
}
fn credit(value: &Value) -> bool {
    object(value)
        && optional(value, "grantedAt", Value::is_number)
        && optional(value, "expiresAt", Value::is_number)
}
fn credits(value: &Value) -> bool {
    object(value)
        && optional(value, "availableCount", Value::is_number)
        && optional(value, "credits", |v| {
            v.as_array().is_some_and(|values| values.iter().all(credit))
        })
}
pub fn is_codex_rate_limits_response(value: &Value) -> bool {
    object(value)
        && snapshot(&value["rateLimits"])
        && optional(value, "ordinaryUsageAllowed", Value::is_boolean)
        && optional(value, "rateLimitResetCredits", credits)
        && optional(value, "rateLimitsByLimitId", |v| {
            object(v) && values(v).into_iter().all(snapshot)
        })
}
fn spread(value: &Value) -> serde_json::Map<String, Value> {
    match value {
        Value::Object(v) => v.clone(),
        Value::Array(v) => v
            .iter()
            .enumerate()
            .map(|(i, v)| (i.to_string(), v.clone()))
            .collect(),
        _ => serde_json::Map::new(),
    }
}
/// Borrowed means the original response identity is retained, as in the reference.
pub fn normalize_codex_rate_limits(response: &Value) -> Result<Cow<'_, Value>, String> {
    if !is_codex_rate_limits_response(response) {
        return Err("Codex returned an unexpected usage response".into());
    }
    let root = &response["rateLimits"];
    if truthy(&root["primary"]) || truthy(&root["secondary"]) {
        return Ok(Cow::Borrowed(response));
    }
    let by_id = &response["rateLimitsByLimitId"];
    let candidate = std::iter::once(&by_id["codex"])
        .chain(values(by_id))
        .find(|v| truthy(&v["primary"]) || truthy(&v["secondary"]));
    let Some(candidate) = candidate else {
        return Ok(Cow::Borrowed(response));
    };
    let mut promoted = spread(root);
    promoted.extend(spread(candidate));
    for key in [
        "planType",
        "credits",
        "rateLimitReachedType",
        "spendControlReached",
    ] {
        match root
            .get(key)
            .filter(|v| !v.is_null())
            .or_else(|| candidate.get(key))
        {
            Some(value) => {
                promoted.insert(key.into(), value.clone());
            }
            None => {
                promoted.remove(key);
            }
        }
    }
    let mut result = spread(response);
    result.insert("rateLimits".into(), Value::Object(promoted));
    Ok(Cow::Owned(Value::Object(result)))
}
fn usage_limit(value: &Value) -> bool {
    object(value) && value["usage"].is_number() && value["models"].is_array()
}
pub fn is_ollama_quota_usage_response(value: &Value) -> bool {
    if !object(value) || !value["limits"].is_object() {
        return false;
    }
    let limits = &value["limits"];
    let names = ["session", "weekly", "monthly"];
    names.iter().any(|name| usage_limit(&limits[*name]))
        && names
            .iter()
            .all(|name| limits.get(*name).is_none_or(usage_limit))
}
fn count(value: &Value) -> bool {
    value
        .as_f64()
        .is_some_and(|n| (0.0..=9_007_199_254_740_991.0).contains(&n) && n.fract() == 0.0)
}
fn date_range(value: &Value) -> bool {
    match (
        value["from"].as_str().and_then(js_date_parse),
        value["until"].as_str().and_then(js_date_parse),
    ) {
        (Some(from), Some(until)) => from <= until,
        _ => false,
    }
}
pub fn is_ollama_usage_response(value: &Value) -> bool {
    if !object(value) {
        return false;
    }
    if is_ollama_quota_usage_response(value) {
        return true;
    }
    value.get("totals").is_some()
        && ["range", "scope", "granularity"]
            .iter()
            .all(|key| value[*key].is_string())
        && date_range(value)
        && count(&value["totals"]["request_count"])
        && value["buckets"].as_array().is_some_and(|buckets| {
            buckets.iter().all(|bucket| {
                date_range(bucket)
                    && count(&bucket["request_count"])
                    && bucket.get("partial").is_none_or(Value::is_boolean)
            })
        })
}
fn base_url(base: &str) -> &str {
    let base = js_trim(base);
    if base.is_empty() {
        "https://ollama.com"
    } else {
        base
    }
    .trim_end_matches('/')
}
pub async fn fetch_ollama_usage_from(
    transport: &dyn OllamaAuthTransport,
    base: &str,
    api_key: Option<&str>,
    timeout_ms: u64,
) -> Result<Value, OllamaAuthError> {
    let response = transport
        .send(OllamaAuthRequest {
            url: format!("{}/api/usage", base_url(base)),
            method: "GET",
            authorization: api_key
                .filter(|v| !v.is_empty())
                .map(|v| format!("Bearer {v}")),
            accept: None,
            reject_redirects: false,
            timeout_ms,
        })
        .await?;
    if !(200..300).contains(&response.status) {
        return Err(OllamaAuthError::usage(
            format!("Ollama usage request failed ({})", response.status),
            response.status,
        ));
    }
    let body = response.body?;
    if !is_ollama_usage_response(&body) {
        return Err(OllamaAuthError::plain(
            "Ollama returned an unexpected usage response",
        ));
    }
    Ok(body)
}
pub async fn fetch_ollama_usage(
    transport: &dyn OllamaAuthTransport,
    api_key: &str,
    timeout_ms: u64,
) -> Result<Value, OllamaAuthError> {
    fetch_ollama_usage_from(transport, "https://ollama.com", Some(api_key), timeout_ms).await
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct OllamaAccountProbe {
    pub reachable: bool,
    pub account: Option<OllamaCloudAccount>,
}
pub async fn probe_ollama_account(
    transport: &dyn OllamaAuthTransport,
    base: &str,
    api_key: Option<&str>,
    timeout_ms: u64,
) -> OllamaAccountProbe {
    let result = async {
        let response = transport
            .send(OllamaAuthRequest {
                url: format!("{}/api/me", base_url(base)),
                method: "POST",
                authorization: api_key
                    .filter(|v| !v.is_empty())
                    .map(|v| format!("Bearer {v}")),
                accept: None,
                reject_redirects: false,
                timeout_ms,
            })
            .await?;
        if !(200..300).contains(&response.status) {
            return Ok(None);
        }
        let body = response.body?;
        if !object(&body) {
            return Ok(None);
        }
        let field = |a, b| {
            body.get(a)
                .filter(|v| !v.is_null())
                .or_else(|| body.get(b))
                .and_then(Value::as_str)
                .map(str::to_owned)
        };
        Ok::<_, OllamaAuthError>(Some(OllamaCloudAccount {
            email: field("email", "Email"),
            name: field("name", "Name"),
            plan: field("plan", "Plan"),
        }))
    }
    .await;
    match result {
        Ok(account) => OllamaAccountProbe {
            reachable: true,
            account,
        },
        Err(_) => OllamaAccountProbe {
            reachable: false,
            account: None,
        },
    }
}
pub fn describe_ollama_usage_gap(base: &str, cloud: bool, probe: &OllamaAccountProbe) -> String {
    if !probe.reachable {
        return format!(
            "Ollama at {base} did not respond. Subscription usage needs a running server."
        );
    }
    if cloud {
        return "Add an Ollama Cloud API key to this Jait backend to load subscription usage."
            .into();
    }
    if let Some(account) = &probe.account
        && let Some(name) = account
            .email
            .as_ref()
            .or(account.name.as_ref())
            .filter(|v| !v.is_empty())
    {
        let plan = account
            .plan
            .as_ref()
            .filter(|v| !v.is_empty())
            .map_or(String::new(), |v| format!(" ({v})"));
        return format!(
            "Signed in to Ollama Cloud as {name}{plan}, but this Ollama server does not report subscription usage. Add an Ollama Cloud API key to see quota."
        );
    }
    "This Ollama instance is not signed in to Ollama Cloud, so there is no subscription usage to report.".into()
}

#[derive(Clone, Debug)]
pub struct CodexRateLimitOptions {
    /// Operator-selected executable. Passed as a literal executable, never through a shell.
    pub command: std::path::PathBuf,
    pub timeout_ms: u64,
}
impl Default for CodexRateLimitOptions {
    fn default() -> Self {
        Self {
            command: "codex".into(),
            timeout_ms: 12_000,
        }
    }
}
/// Read account usage without starting a model turn. The child is owned and reaped on settlement.
/// Malformed JSON lines are ignored; protocol line memory is bounded at 256 KiB.
pub async fn fetch_codex_rate_limits(
    account_home: &std::path::Path,
    options: &CodexRateLimitOptions,
) -> Result<Value, String> {
    use std::{
        process::Stdio,
        sync::{Arc, Mutex},
        time::Duration,
    };
    use tokio::{
        io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader},
        process::Command,
    };
    let mut child = Command::new(&options.command)
        .args(["app-server", "--stdio"])
        .env("HOME", account_home)
        .env("CODEX_HOME", account_home)
        .env("OPENAI_API_KEY", "")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .map_err(|error| error.to_string())?;
    let mut input = child.stdin.take().unwrap();
    let mut output = BufReader::new(child.stdout.take().unwrap());
    let mut errors = child.stderr.take().unwrap();
    let stderr = Arc::new(Mutex::new(String::new()));
    let buffer = stderr.clone();
    let reader = tokio::spawn(async move {
        let mut chunk = [0u8; 4096];
        loop {
            match errors.read(&mut chunk).await {
                Ok(0) | Err(_) => break,
                Ok(length) => {
                    let mut text = buffer.lock().unwrap_or_else(|e| e.into_inner());
                    if text.encode_utf16().count() < 2000 {
                        text.push_str(&String::from_utf8_lossy(&chunk[..length]));
                    }
                }
            }
        }
    });
    // Abort the stderr task even if this operation's future is cancelled.
    struct ReaderGuard(tokio::task::JoinHandle<()>);
    impl Drop for ReaderGuard {
        fn drop(&mut self) {
            self.0.abort();
        }
    }
    let mut reader = ReaderGuard(reader);
    let result=tokio::time::timeout(Duration::from_millis(options.timeout_ms),async {
        let mut initialize=serde_json::to_vec(&json!({"id":1,"method":"initialize","params":{"clientInfo":{"name":"jait","version":"1.0.0"},"capabilities":{"experimentalApi":true}}})).unwrap();initialize.push(b'\n');
        input.write_all(&initialize).await.map_err(|e|e.to_string())?;
        let mut line=Vec::new();
        loop {
            line.clear();
            // fill_buf avoids allocating an unbounded line before checking its length.
            loop {
                let bytes=output.fill_buf().await.map_err(|e|e.to_string())?;
                if bytes.is_empty(){break}
                let length=bytes.iter().position(|byte|*byte==b'\n').map_or(bytes.len(),|n|n+1);
                if line.len()+length>262_144{return Err("Codex usage response line exceeds 256 KiB".into())}
                let complete=bytes[length-1]==b'\n';line.extend_from_slice(&bytes[..length]);output.consume(length);if complete{break}
            }
            if line.is_empty(){
                let status=child.wait().await.map_err(|e|e.to_string())?;
                // Give already-buffered stderr its final drain before reading the diagnostic.
                let _=tokio::time::timeout(Duration::from_millis(100), &mut reader.0).await;
                let text=stderr.lock().unwrap_or_else(|e|e.into_inner());let text=js_trim(&text);
                return Err(if text.is_empty(){format!("Codex app server exited with code {}",status.code().map_or("unknown".into(),|c|c.to_string()))}else{text.to_owned()})
            }
            let Ok(message)=serde_json::from_slice::<Value>(&line)else{continue};
            if message["id"]==json!(1) {
                input.write_all(b"{\"id\":2,\"method\":\"account/rateLimits/read\",\"params\":{}}\n").await.map_err(|e|e.to_string())?;
            } else if message["id"]==json!(2) {
                if truthy(&message["error"]) {
                    return Err(message["error"]["message"].as_str().filter(|s|!s.is_empty()).unwrap_or("Codex usage request failed").into())
                }
                if !is_codex_rate_limits_response(&message["result"]) {return Err("Codex returned an unexpected usage response".into())}
                return Ok(normalize_codex_rate_limits(&message["result"] )?.into_owned())
            }
        }
    }).await.unwrap_or_else(|_|Err("Codex usage request timed out".into()));
    #[cfg(unix)]
    if let Some(pid) = child.id() {
        // The unreaped Child owns this PID; no unrelated process is signalled.
        unsafe {
            libc::kill(pid as libc::pid_t, libc::SIGTERM);
        }
    }
    #[cfg(not(unix))]
    let _ = child.start_kill();
    if tokio::time::timeout(Duration::from_millis(250), child.wait())
        .await
        .is_err()
    {
        let _ = child.start_kill();
        let _ = child.wait().await;
    }
    drop(reader);
    result
}
