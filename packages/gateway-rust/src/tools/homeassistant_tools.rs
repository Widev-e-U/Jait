//! Native Home Assistant REST tools. Runtime integration must provide authenticated
//! context and the existing tool-policy/consent check through `authorize`.
//! Authorization resolves and approves the configured destination for each request;
//! the resulting addresses are pinned, with redirects and proxies disabled. Private
//! addresses require explicit HA scope; being reachable does not grant authority.
//! There is no process-environment lookup or tool-input credential override: the
//! runtime captures environment credentials and per-user API keys before dispatch.
use crate::{
    contracts::bounded_json::Utf16Text, services::calendar::js_text,
    tools::list_preview::format_ellipsed_list,
};
use futures_util::{StreamExt, future::BoxFuture};
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    net::{IpAddr, SocketAddr},
    sync::Arc,
    time::{Duration, Instant},
};
use tokio::sync::{Semaphore, watch};
use url::Url;

const MAX_BODY: usize = 1_048_576;
const MAX_INPUT: usize = 65_536;
const TIMEOUT: Duration = Duration::from_secs(30);

pub struct HomeAssistantContext {
    pub user_id: String,
    pub session_id: String,
    /// Obtained from authenticated user settings, never from tool arguments.
    pub api_keys: HashMap<String, String>,
    pub cancelled: watch::Receiver<bool>,
}

/// Contains no bearer token. The runtime must check identity/session ownership,
/// tool permission (including mutation consent), target/method scope and expiry,
/// and resolve/approve every returned address. This callback is invoked per call.
#[derive(Clone)]
pub struct AuthorizationRequest {
    pub user_id: String,
    pub session_id: String,
    pub tool_name: String,
    pub base_url: Url,
    /// Exact normalized URL that will receive the bearer token. Authorize this
    /// destination as well as the logical path; base URLs may include a prefix.
    pub url: Url,
    pub method: String,
    pub path: String,
    pub body: Option<Value>,
}

pub struct ApprovedAddresses {
    pub addresses: Vec<SocketAddr>,
    pub expires_at: Instant,
}
pub type HomeAssistantAuthorize = Arc<
    dyn Fn(AuthorizationRequest) -> BoxFuture<'static, Result<ApprovedAddresses, String>>
        + Send
        + Sync,
>;

pub struct HomeAssistantTools {
    /// Captured by the runtime, rather than reading mutable process environment.
    environment: HashMap<String, String>,
    authorize: HomeAssistantAuthorize,
    admission: Semaphore,
}

pub fn metadata() -> Value {
    serde_json::from_str(include_str!("homeassistant-metadata.json"))
        .expect("embedded Home Assistant metadata is valid JSON")
}

fn failure(message: impl Into<String>) -> Value {
    json!({"ok":false,"message":message.into()})
}
fn success(message: impl Into<String>, data: Value) -> Value {
    json!({"ok":true,"message":message.into(),"data":data})
}
fn trim(s: &str) -> &str {
    s.trim_matches(crate::text::js_whitespace)
}
fn field<'a>(v: &'a Value, key: &str) -> &'a str {
    v.get(key).and_then(Value::as_str).map(trim).unwrap_or("")
}
fn encode_segment(s: &str) -> String {
    // JavaScript encodeURIComponent, rather than form/query encoding.
    let mut result = String::new();
    for b in s.bytes() {
        if b.is_ascii_alphanumeric() || b"-_.!~*'()".contains(&b) {
            result.push(b as char);
        } else {
            use std::fmt::Write;
            let _ = write!(result, "%{b:02X}");
        }
    }
    result
}
fn credentials(
    user: &HashMap<String, String>,
    environment: &HashMap<String, String>,
) -> Result<(Url, String), String> {
    let value = |a: &str, b: &str| {
        user.get(a)
            .or_else(|| user.get(b))
            .or_else(|| environment.get(a))
            .or_else(|| environment.get(b))
            .map(|v| trim(v).to_owned())
            .unwrap_or_default()
    };
    let url = value("HA_URL", "HASS_URL");
    let token = value("HA_TOKEN", "HASS_TOKEN");
    if url.is_empty() {
        return Err("Home Assistant URL not configured. Set HA_URL in Settings → API keys.".into());
    }
    if token.is_empty() {
        return Err("Home Assistant token not configured. Create a long-lived access token in HA (Profile → Security) and set HA_TOKEN in Settings → API keys.".into());
    }
    let url = Url::parse(url.trim_end_matches('/')).map_err(|_| "Invalid Home Assistant URL")?;
    if !matches!(url.scheme(), "http" | "https")
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || token.contains(['\r', '\n', '\0'])
    {
        return Err("Invalid Home Assistant URL or token".into());
    }
    Ok((url, token))
}

fn redact(value: &mut Value, secret: &str) {
    match value {
        Value::String(s) => *s = s.replace(secret, "[REDACTED]"),
        Value::Array(a) => a.iter_mut().for_each(|v| redact(v, secret)),
        Value::Object(o) => {
            let entries = std::mem::take(o);
            for (key, mut v) in entries {
                redact(&mut v, secret);
                o.insert(key.replace(secret, "[REDACTED]"), v);
            }
        }
        _ => {}
    }
}

fn describe_error(status: u16, data: &Value) -> String {
    if status == 401 {
        return "Home Assistant rejected the token (401 Unauthorized). Check HA_TOKEN.".into();
    }
    if status == 404 {
        return "Home Assistant returned 404 Not Found — check the path/entity.".into();
    }
    let detail = data.get("message").map(js_text).unwrap_or_else(|| {
        data.as_str()
            .map(String::from)
            .unwrap_or_else(|| data.to_string())
    });
    format!(
        "Home Assistant request failed (HTTP {status}){}",
        if detail.is_empty() {
            String::new()
        } else {
            format!(": {detail}")
        }
    )
}

struct Request {
    path: String,
    body: Option<Value>,
}

fn request(name: &str, input: &Value) -> Result<Request, String> {
    if !input.is_object() || input.to_string().len() > MAX_INPUT {
        return Err("Invalid or oversized Home Assistant input".into());
    }
    let allowed: &[&str] = match name {
        "homeassistant.states" => &["entity_id"],
        "homeassistant.services" => &["domain"],
        "homeassistant.call_service" => &["domain", "service", "entity_id", "service_data"],
        _ => return Err("Unknown Home Assistant tool".into()),
    };
    for (key, value) in input.as_object().expect("object checked") {
        if !allowed.contains(&key.as_str()) {
            return Err(format!("Unknown Home Assistant input field: {key}"));
        }
        let valid = match key.as_str() {
            "service_data" => value.is_object(),
            "entity_id" if name == "homeassistant.call_service" => {
                value.is_string()
                    || value
                        .as_array()
                        .is_some_and(|a| a.len() <= 256 && a.iter().all(Value::is_string))
            }
            _ => value.is_string(),
        };
        if !valid {
            return Err(format!("Invalid Home Assistant input field: {key}"));
        }
    }
    match name {
        "homeassistant.states" => {
            let entity = field(input, "entity_id");
            if matches!(entity, "." | "..") {
                return Err("Invalid Home Assistant entity id".into());
            }
            Ok(Request {
                path: if entity.is_empty() {
                    "/states".into()
                } else {
                    format!("/states/{}", encode_segment(entity))
                },
                body: None,
            })
        }
        "homeassistant.services" => Ok(Request {
            path: "/services".into(),
            body: None,
        }),
        _ => {
            let domain = field(input, "domain");
            let service = field(input, "service");
            if domain.is_empty() || service.is_empty() {
                return Err("Both 'domain' and 'service' are required.".into());
            }
            if matches!(domain, "." | "..") || matches!(service, "." | "..") {
                return Err("Invalid Home Assistant domain or service".into());
            }
            let mut body = input
                .get("service_data")
                .and_then(Value::as_object)
                .cloned()
                .unwrap_or_default();
            if let Some(entity) = input.get("entity_id") {
                body.insert("entity_id".into(), entity.clone());
            }
            Ok(Request {
                path: format!(
                    "/services/{}/{}",
                    encode_segment(domain),
                    encode_segment(service)
                ),
                body: Some(Value::Object(body)),
            })
        }
    }
}

fn presentation(name: &str, input: &Value, data: Value) -> Value {
    match name {
        "homeassistant.states" => {
            let entity = field(input, "entity_id");
            if !entity.is_empty() {
                return success(
                    format!(
                        "{entity} = {}",
                        data.get("state")
                            .filter(|v| !v.is_null())
                            .map(js_text)
                            .unwrap_or_else(|| "unknown".into())
                    ),
                    data,
                );
            }
            let all = data.as_array().cloned().unwrap_or_default();
            let lines: Vec<Utf16Text> = all
                .iter()
                .filter_map(|e| {
                    let entity = e.get("entity_id")?.as_str()?;
                    let state = e
                        .get("state")
                        .map(|v| format!(" = {}", js_text(v)))
                        .unwrap_or_default();
                    Some(Utf16Text(
                        format!("• {entity}{state}").encode_utf16().collect(),
                    ))
                })
                .collect();
            let preview = String::from_utf16_lossy(&format_ellipsed_list(&lines, None).0);
            success(
                format!(
                    "Fetched {} entities from Home Assistant{}",
                    all.len(),
                    if lines.is_empty() {
                        ".".into()
                    } else {
                        format!(":\n{preview}")
                    }
                ),
                json!(all),
            )
        }
        "homeassistant.call_service" => {
            let count = data.as_array().map_or(0, Vec::len);
            let target = input
                .get("entity_id")
                .map(|v| {
                    if let Some(a) = v.as_array() {
                        format!(
                            " on {}",
                            a.iter().map(js_text).collect::<Vec<_>>().join(", ")
                        )
                    } else if v.as_str().is_some_and(|s| !s.is_empty()) {
                        format!(" on {}", js_text(v))
                    } else {
                        String::new()
                    }
                })
                .unwrap_or_default();
            success(
                format!(
                    "Called {}.{}{target} ({count} state{} changed).",
                    field(input, "domain"),
                    field(input, "service"),
                    if count == 1 { "" } else { "s" }
                ),
                data,
            )
        }
        _ => {
            let all = data.as_array().cloned().unwrap_or_default();
            let domain = field(input, "domain");
            let filtered = all
                .iter()
                .filter(|v| {
                    domain.is_empty() || v.get("domain").and_then(Value::as_str) == Some(domain)
                })
                .cloned()
                .collect::<Vec<_>>();
            if !domain.is_empty() && filtered.is_empty() {
                return failure(format!(
                    "No service domain '{domain}' found in Home Assistant."
                ));
            }
            let message = if domain.is_empty() {
                format!("Home Assistant exposes {} service domains.", all.len())
            } else {
                let count = filtered[0]
                    .get("services")
                    .and_then(Value::as_object)
                    .map_or(0, |s| s.len());
                format!("Domain '{domain}' exposes {count} services.")
            };
            success(message, json!(filtered))
        }
    }
}

impl HomeAssistantTools {
    pub fn new(environment: HashMap<String, String>, authorize: HomeAssistantAuthorize) -> Self {
        Self {
            environment,
            authorize,
            admission: Semaphore::new(4),
        }
    }

    pub async fn execute(
        &self,
        name: &str,
        input: &Value,
        context: &HomeAssistantContext,
    ) -> Value {
        let mut cancelled = context.cancelled.clone();
        if *cancelled.borrow() {
            return failure("Home Assistant request cancelled");
        }
        let work = self.execute_inner(name, input, context);
        tokio::pin!(work);
        tokio::select! {
            biased;
            _ = async {
                loop {
                    if *cancelled.borrow_and_update() { break; }
                    if cancelled.changed().await.is_err() { break; }
                }
            } => failure("Home Assistant request cancelled"),
            result = tokio::time::timeout(TIMEOUT, &mut work) => match result {
                Ok(result) => result,
                Err(_) => failure("Home Assistant request timed out"),
            }
        }
    }

    async fn execute_inner(
        &self,
        name: &str,
        input: &Value,
        context: &HomeAssistantContext,
    ) -> Value {
        match self.perform(name, input, context).await {
            Ok(value) if value.to_string().len() <= MAX_BODY * 2 => value,
            Ok(_) => failure("Home Assistant result exceeds byte limit"),
            Err(message) => failure(message),
        }
    }

    async fn perform(
        &self,
        name: &str,
        input: &Value,
        context: &HomeAssistantContext,
    ) -> Result<Value, String> {
        if context.user_id.is_empty() || context.session_id.is_empty() {
            return Err("Authenticated Home Assistant tool context required".into());
        }
        let _permit = self
            .admission
            .acquire()
            .await
            .map_err(|_| "Home Assistant tools unavailable")?;
        let (base_url, token) = credentials(&context.api_keys, &self.environment)?;
        let spec = request(name, input)?;
        let method = if spec.body.is_some() { "POST" } else { "GET" };
        let mut url = base_url.clone();
        url.set_path(&format!(
            "{}/api{}",
            base_url.path().trim_end_matches('/'),
            spec.path
        ));
        let approval = (self.authorize)(AuthorizationRequest {
            user_id: context.user_id.clone(),
            session_id: context.session_id.clone(),
            tool_name: name.into(),
            base_url: base_url.clone(),
            url: url.clone(),
            method: method.into(),
            path: spec.path.clone(),
            body: spec.body.clone(),
        })
        .await
        .map_err(|_| "Home Assistant request not authorized")?;
        let port = base_url
            .port_or_known_default()
            .ok_or("Invalid Home Assistant port")?;
        if approval.expires_at <= Instant::now()
            || approval.addresses.is_empty()
            || approval.addresses.len() > 32
            || approval.addresses.iter().any(|a| a.port() != port)
        {
            return Err("Invalid or expired Home Assistant destination authorization".into());
        }
        let host = base_url.host_str().ok_or("Invalid Home Assistant host")?;
        // Literal hosts bypass reqwest's resolver override, so check them directly.
        if let Ok(ip) = host.trim_matches(['[', ']']).parse::<IpAddr>()
            && approval.addresses.iter().any(|a| a.ip() != ip)
        {
            return Err("Home Assistant address does not match authorization".into());
        }
        let client = reqwest::Client::builder()
            .no_proxy()
            // Never replay device effects, including protocol-level retries.
            .retry(reqwest::retry::never())
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(Duration::from_secs(5))
            .timeout(TIMEOUT)
            .resolve_to_addrs(host, &approval.addresses)
            .build()
            .map_err(|_| "Home Assistant HTTP client unavailable")?;
        let mut req = client
            .request(
                if spec.body.is_some() {
                    reqwest::Method::POST
                } else {
                    reqwest::Method::GET
                },
                url,
            )
            .bearer_auth(&token)
            .header(reqwest::header::CONTENT_TYPE, "application/json");
        if let Some(body) = &spec.body {
            req = req.json(body);
        }
        if approval.expires_at <= Instant::now() {
            return Err("Home Assistant destination authorization expired".into());
        }
        let effect = async {
            let res = req
                .send()
                .await
                .map_err(|_| "Home Assistant request failed")?;
            let status = res.status().as_u16();
            if res.content_length().is_some_and(|n| n > MAX_BODY as u64) {
                return Err("Home Assistant response exceeds byte limit".into());
            }
            let mut stream = res.bytes_stream();
            let mut bytes = Vec::new();
            while let Some(chunk) = stream.next().await {
                let chunk = chunk.map_err(|_| "Home Assistant response failed")?;
                if bytes.len().saturating_add(chunk.len()) > MAX_BODY {
                    return Err("Home Assistant response exceeds byte limit".into());
                }
                bytes.extend_from_slice(&chunk);
            }
            let text = String::from_utf8_lossy(&bytes);
            let mut data = serde_json::from_str::<Value>(&text).unwrap_or_else(|_| json!(text));
            redact(&mut data, &token);
            if !(200..300).contains(&status) {
                return Ok(failure(describe_error(status, &data)));
            }
            let mut result = presentation(name, input, data);
            // Summaries also contain user-supplied entity/service strings.
            redact(&mut result, &token);
            if result.to_string().len() > MAX_BODY * 2 {
                return Err("Home Assistant result exceeds byte limit".into());
            }
            Ok(result)
        };
        tokio::time::timeout_at(tokio::time::Instant::from_std(approval.expires_at), effect)
            .await
            .map_err(|_| "Home Assistant destination authorization expired".to_string())?
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn credential_aliases_preserve_empty_override_and_order() {
        let env = HashMap::from([
            ("HA_URL".into(), "http://ha.local:8123/".into()),
            ("HA_TOKEN".into(), "env-token".into()),
        ]);
        let user = HashMap::from([("HASS_TOKEN".into(), " user-token ".into())]);
        let (url, token) = credentials(&user, &env).unwrap();
        assert_eq!(url.as_str(), "http://ha.local:8123/");
        assert_eq!(token, "user-token");
        let mut user = user;
        user.insert("HA_TOKEN".into(), "".into());
        assert!(
            credentials(&user, &env)
                .unwrap_err()
                .contains("token not configured")
        );
    }

    #[test]
    fn encoded_paths_and_entity_override_match_typescript() {
        let spec = request("homeassistant.call_service", &json!({"domain":" light ","service":"turn/on","entity_id":["light.kitchen"],"service_data":{"entity_id":"ignored","brightness_pct":50}})).unwrap();
        assert_eq!(spec.path, "/services/light/turn%2Fon");
        assert_eq!(
            spec.body.unwrap(),
            json!({"entity_id":["light.kitchen"],"brightness_pct":50})
        );
        assert!(request("homeassistant.states", &json!({"entity_id":".."})).is_err());
        assert!(request("homeassistant.states", &json!({"url":"http://other"})).is_err());
        assert_eq!(encode_segment("a b?#雪"), "a%20b%3F%23%E9%9B%AA");
    }

    #[test]
    fn results_keep_state_payload_and_service_counts() {
        let data =
            json!([{"entity_id":"light.a","state":"on"},{"other":true},{"entity_id":"light.b"}]);
        let result = presentation("homeassistant.states", &json!({}), data.clone());
        assert_eq!(result["data"], data);
        assert_eq!(
            result["message"],
            "Fetched 3 entities from Home Assistant:\n• light.a = on\n• light.b"
        );
        assert_eq!(
            presentation(
                "homeassistant.states",
                &json!({"entity_id":"light.a"}),
                json!({})
            )["message"],
            "light.a = unknown"
        );
        assert_eq!(
            presentation(
                "homeassistant.services",
                &json!({"domain":"light"}),
                json!([{"domain":"light","services":{"on":{},"off":{}}}])
            )["message"],
            "Domain 'light' exposes 2 services."
        );
        assert_eq!(
            presentation(
                "homeassistant.call_service",
                &json!({"domain":"light","service":"turn_on","entity_id":["a","b"]}),
                json!([{}])
            )["message"],
            "Called light.turn_on on a, b (1 state changed)."
        );
    }

    #[test]
    fn remote_secrets_are_redacted_in_values_and_keys() {
        let mut data = json!({"token":{"value":"Bearer token"}});
        redact(&mut data, "token");
        assert_eq!(data, json!({"[REDACTED]":{"value":"Bearer [REDACTED]"}}));
        assert!(describe_error(401, &json!("secret")).contains("401 Unauthorized"));
        assert!(!describe_error(401, &json!("secret")).contains("secret"));
    }
}

#[cfg(test)]
mod transport_tests {
    use super::*;
    use tokio::{
        io::{AsyncReadExt, AsyncWriteExt},
        net::TcpListener,
    };

    fn context() -> (watch::Sender<bool>, HomeAssistantContext) {
        let (tx, cancelled) = watch::channel(false);
        (
            tx,
            HomeAssistantContext {
                user_id: "user".into(),
                session_id: "session".into(),
                api_keys: HashMap::new(),
                cancelled,
            },
        )
    }
    fn tools(address: SocketAddr, authorize: HomeAssistantAuthorize) -> HomeAssistantTools {
        HomeAssistantTools::new(
            HashMap::from([
                (
                    "HA_URL".into(),
                    format!("http://ha.test:{}/prefix/", address.port()),
                ),
                ("HA_TOKEN".into(), "a-secret-token".into()),
            ]),
            authorize,
        )
    }
    fn approval(address: SocketAddr) -> HomeAssistantAuthorize {
        Arc::new(move |req| {
            Box::pin(async move {
                assert_eq!(req.user_id, "user");
                assert_eq!(req.session_id, "session");
                assert_eq!(req.base_url.host_str(), Some("ha.test"));
                Ok(ApprovedAddresses {
                    addresses: vec![address],
                    expires_at: Instant::now() + TIMEOUT,
                })
            })
        })
    }
    async fn server(response: String) -> (SocketAddr, tokio::task::JoinHandle<String>) {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let task = tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut request = vec![0; 8192];
            let n = socket.read(&mut request).await.unwrap();
            let _ = socket.write_all(response.as_bytes()).await;
            String::from_utf8_lossy(&request[..n]).into_owned()
        });
        (address, task)
    }

    #[tokio::test]
    async fn approved_dns_is_pinned_and_state_request_is_native() {
        let body =
            r#"{"entity_id":"light.kitchen","state":"on","attributes":{"token":"a-secret-token"}}"#;
        let (address, task) = server(format!(
            "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
            body.len()
        ))
        .await;
        let tools = tools(address, approval(address));
        let (_sender, context) = context();
        let result = tools
            .execute(
                "homeassistant.states",
                &json!({"entity_id":"light.kitchen"}),
                &context,
            )
            .await;
        assert_eq!(result["ok"], true, "{result}");
        assert_eq!(result["message"], "light.kitchen = on");
        assert_eq!(result["data"]["attributes"]["token"], "[REDACTED]");
        let request = task.await.unwrap();
        assert!(
            request.starts_with("GET /prefix/api/states/light.kitchen HTTP/1.1\r\n"),
            "{request}"
        );
        assert!(
            request
                .to_lowercase()
                .contains("authorization: bearer a-secret-token")
        );
    }

    #[tokio::test]
    async fn service_post_scope_and_body_are_authorized_before_send() {
        let (address, task) =
            server("HTTP/1.1 200 OK\r\nContent-Length: 4\r\nConnection: close\r\n\r\n[{}]".into())
                .await;
        let authorize: HomeAssistantAuthorize = Arc::new(move |req| {
            Box::pin(async move {
                assert_eq!(req.tool_name, "homeassistant.call_service");
                assert_eq!(req.method, "POST");
                assert_eq!(req.path, "/services/light/turn_on");
                assert_eq!(req.url.path(), "/prefix/api/services/light/turn_on");
                assert_eq!(req.url.origin(), req.base_url.origin());
                assert_eq!(
                    req.body,
                    Some(json!({"entity_id":"light.a","brightness_pct":50}))
                );
                Ok(ApprovedAddresses {
                    addresses: vec![address],
                    expires_at: Instant::now() + TIMEOUT,
                })
            })
        });
        let tools = tools(address, authorize);
        let (_sender, context) = context();
        let result = tools.execute("homeassistant.call_service", &json!({"domain":"light","service":"turn_on","entity_id":"light.a","service_data":{"brightness_pct":50}}), &context).await;
        assert_eq!(result["ok"], true, "{result}");
        assert!(
            task.await
                .unwrap()
                .starts_with("POST /prefix/api/services/light/turn_on HTTP/1.1")
        );
    }

    #[tokio::test]
    async fn services_get_filters_remote_domains() {
        let body =
            r#"[{"domain":"light","services":{"turn_on":{}}},{"domain":"switch","services":{}}]"#;
        let (address, task) = server(format!(
            "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
            body.len()
        ))
        .await;
        let (_sender, context) = context();
        let result = tools(address, approval(address))
            .execute(
                "homeassistant.services",
                &json!({"domain":" light "}),
                &context,
            )
            .await;
        assert_eq!(result["message"], "Domain 'light' exposes 1 services.");
        assert_eq!(result["data"].as_array().unwrap().len(), 1);
        assert!(
            task.await
                .unwrap()
                .starts_with("GET /prefix/api/services HTTP/1.1")
        );
    }

    #[tokio::test]
    async fn service_failure_is_single_attempt_and_redacts_summary() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut bytes = [0; 8192];
            assert!(socket.read(&mut bytes).await.unwrap() > 0);
            socket.write_all(b"HTTP/1.1 503 Service Unavailable\r\nContent-Length: 14\r\nConnection: close\r\n\r\na-secret-token").await.unwrap();
            drop(socket);
            assert!(
                tokio::time::timeout(Duration::from_millis(100), listener.accept())
                    .await
                    .is_err()
            );
        });
        let (_sender, context) = context();
        let result = tools(address, approval(address))
            .execute(
                "homeassistant.call_service",
                &json!({"domain":"light","service":"turn_on"}),
                &context,
            )
            .await;
        assert_eq!(result["ok"], false);
        assert_eq!(
            result["message"],
            "Home Assistant request failed (HTTP 503): [REDACTED]"
        );
        server.await.unwrap();

        let (address, server) = server_response_for_redaction().await;
        let result = tools(address, approval(address))
            .execute(
                "homeassistant.states",
                &json!({"entity_id":"a-secret-token"}),
                &context,
            )
            .await;
        assert_eq!(result["message"], "[REDACTED] = on");
        server.await.unwrap();
    }

    async fn server_response_for_redaction() -> (SocketAddr, tokio::task::JoinHandle<String>) {
        let body = r#"{"state":"on"}"#;
        server(format!(
            "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
            body.len()
        ))
        .await
    }

    #[tokio::test]
    async fn denial_and_expiry_produce_no_connection() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let (_sender, context) = context();
        let denied = tools(
            address,
            Arc::new(|_| Box::pin(async { Err("no scope".into()) })),
        );
        assert_eq!(
            denied
                .execute("homeassistant.states", &json!({}), &context)
                .await["message"],
            "Home Assistant request not authorized"
        );
        let expired = tools(
            address,
            Arc::new(move |_| {
                Box::pin(async move {
                    Ok(ApprovedAddresses {
                        addresses: vec![address],
                        expires_at: Instant::now(),
                    })
                })
            }),
        );
        assert_eq!(
            expired
                .execute("homeassistant.states", &json!({}), &context)
                .await["ok"],
            false
        );
        assert!(
            tokio::time::timeout(Duration::from_millis(10), listener.accept())
                .await
                .is_err()
        );
    }

    #[tokio::test]
    async fn redirects_never_follow_and_oversized_responses_are_rejected() {
        let (address, task) = server("HTTP/1.1 302 Found\r\nLocation: http://127.0.0.1:1/leak\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".into()).await;
        let (_sender, context) = context();
        let result = tools(address, approval(address))
            .execute("homeassistant.states", &json!({}), &context)
            .await;
        assert_eq!(result["ok"], false);
        assert!(result["message"].as_str().unwrap().contains("HTTP 302"));
        task.await.unwrap();
        let (address, task) = server(format!(
            "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
            MAX_BODY + 1
        ))
        .await;
        let result = tools(address, approval(address))
            .execute("homeassistant.states", &json!({}), &context)
            .await;
        assert_eq!(
            result["message"],
            "Home Assistant response exceeds byte limit"
        );
        task.await.unwrap();
    }

    #[tokio::test]
    async fn cancellation_drops_pending_authorization() {
        let address = "127.0.0.1:1".parse().unwrap();
        let tools = tools(address, Arc::new(|_| Box::pin(std::future::pending())));
        let (sender, context) = context();
        let input = json!({});
        let work = tools.execute("homeassistant.states", &input, &context);
        let cancel = async {
            tokio::task::yield_now().await;
            sender.send(true).unwrap();
        };
        let (result, _) = tokio::join!(work, cancel);
        assert_eq!(result["message"], "Home Assistant request cancelled");
    }
}

#[cfg(test)]
mod expiry_test {
    use super::*;
    use tokio::{io::AsyncReadExt, net::TcpListener};

    #[tokio::test]
    async fn authorization_expiry_cancels_in_flight_response() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let (connected, ready) = tokio::sync::oneshot::channel();
        let server = tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut bytes = [0; 1024];
            let n = socket.read(&mut bytes).await.unwrap();
            assert!(n > 0);
            connected.send(()).unwrap();
            // No response: expiry must close this in-flight request.
            loop {
                match socket.read(&mut bytes).await {
                    Ok(0) | Err(_) => break,
                    Ok(_) => {}
                }
            }
        });
        let authorize: HomeAssistantAuthorize = Arc::new(move |_| {
            Box::pin(async move {
                Ok(ApprovedAddresses {
                    addresses: vec![address],
                    expires_at: Instant::now() + Duration::from_millis(500),
                })
            })
        });
        let tools = HomeAssistantTools::new(
            HashMap::from([
                (
                    "HA_URL".into(),
                    format!("http://ha.test:{}", address.port()),
                ),
                ("HA_TOKEN".into(), "token".into()),
            ]),
            authorize,
        );
        let (_sender, cancelled) = watch::channel(false);
        let context = HomeAssistantContext {
            user_id: "u".into(),
            session_id: "s".into(),
            api_keys: HashMap::new(),
            cancelled,
        };
        let input = json!({});
        let (result, ready) = tokio::time::timeout(Duration::from_secs(2), async {
            tokio::join!(
                tools.execute("homeassistant.states", &input, &context),
                ready
            )
        })
        .await
        .unwrap();
        ready.unwrap();
        assert_eq!(
            result["message"],
            "Home Assistant destination authorization expired"
        );
        tokio::time::timeout(Duration::from_secs(1), server)
            .await
            .unwrap()
            .unwrap();
    }
}
