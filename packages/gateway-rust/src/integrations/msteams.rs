//! Microsoft Teams activity normalization and service URL admission.
//! Runtime integration remains pending: the host must supply authenticated HTTP,
//! JWT/JWKS verification, token transport and supervised listener lifecycle.
use super::channel_contracts::InboundMessage;
use regex::Regex;
use serde_json::Value;
use url::Url;

const SERVICE_HOSTS: &[&str] = &[
    "smba.trafficmanager.net",
    "smba.infra.gcc.teams.microsoft.com",
    "smba.infra.gov.teams.microsoft.us",
    "smba.infra.dod.teams.microsoft.us",
    "botframework.azure.cn",
];

pub fn is_allowed_service_url(value: &str) -> bool {
    let Ok(url) = Url::parse(value.trim()) else {
        return false;
    };
    // Stronger than the TypeScript allowlist: these fields can redirect or
    // alter authority when the transport constructs the activities URL.
    if url.scheme() != "https"
        || !url.username().is_empty()
        || url.password().is_some()
        || url.port().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return false;
    }
    let Some(host) = url.host_str() else {
        return false;
    };
    SERVICE_HOSTS.iter().any(|allowed| {
        host == *allowed
            || host
                .strip_suffix(allowed)
                .is_some_and(|prefix| prefix.ends_with('.'))
    })
}

pub fn normalize_conversation_id(value: &str) -> &str {
    value.split(';').next().unwrap_or(value)
}

pub fn html_to_text(value: &str) -> String {
    let mention = Regex::new(r"(?i)<at[^>]*>.*?</at>").unwrap();
    let tags = Regex::new(r"<[^>]*>").unwrap();
    let no_mentions = mention.replace_all(value, "");
    let no_tags = tags.replace_all(no_mentions.trim(), " ");
    let collapsed = no_tags.split_whitespace().collect::<Vec<_>>().join(" ");
    let decoded = collapsed
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&#x27;", "'")
        .replace("&nbsp;", " ")
        .replace("&amp;", "&");
    decoded.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn string<'a>(value: &'a Value, key: &str) -> Option<&'a str> {
    value.get(key).and_then(Value::as_str)
}

/// Parse an authenticated activity. The host must authenticate and bound the body first.
pub fn activity_to_inbound(activity: &Value, now_ms: f64) -> Option<InboundMessage> {
    if string(activity, "type") != Some("message") {
        return None;
    }
    let text = html_to_text(string(activity, "text").unwrap_or_default());
    if text.is_empty() {
        return None;
    }
    let conversation = activity.get("conversation").unwrap_or(&Value::Null);
    let conversation_id = normalize_conversation_id(string(conversation, "id").unwrap_or_default());
    if conversation_id.is_empty() {
        return None;
    }
    let from = activity.get("from").unwrap_or(&Value::Null);
    let recipient = activity.get("recipient").unwrap_or(&Value::Null);
    let sender_id = string(from, "aadObjectId")
        .or_else(|| string(from, "id"))
        .unwrap_or(conversation_id);
    let from_me =
        string(from, "id").is_some_and(|id| !id.is_empty() && Some(id) == string(recipient, "id"));
    let timestamp = string(activity, "timestamp")
        .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
        .map(|d| d.timestamp_millis() as f64)
        .unwrap_or(now_ms);
    Some(InboundMessage {
        channel_id: "msteams".into(),
        conversation_id: conversation_id.into(),
        sender_id: sender_id.into(),
        sender_name: string(from, "name").map(str::to_owned),
        text,
        timestamp,
        from_me,
        is_self_chat: false,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn allowlist_rejects_suffix_confusion_and_insecure_urls() {
        assert!(is_allowed_service_url(
            "https://region.botframework.azure.cn/teams/"
        ));
        assert!(is_allowed_service_url(
            "https://smba.trafficmanager.net/emea/"
        ));
        assert!(!is_allowed_service_url("http://smba.trafficmanager.net/"));
        assert!(!is_allowed_service_url(
            "https://smba.trafficmanager.net.evil.test/"
        ));
        assert!(!is_allowed_service_url(
            "https://evilsmba.trafficmanager.net/"
        ));
    }
    #[test]
    fn service_url_rejects_credentials_ports_queries_and_fragments() {
        assert!(!is_allowed_service_url(
            "https://user:pass@smba.trafficmanager.net/"
        ));
        assert!(!is_allowed_service_url(
            "https://smba.trafficmanager.net:444/"
        ));
        assert!(!is_allowed_service_url(
            "https://smba.trafficmanager.net/?x=y"
        ));
        assert!(!is_allowed_service_url(
            "https://smba.trafficmanager.net/#fragment"
        ));
    }
    #[test]
    fn inbound_normalizes_message_and_sender() {
        let activity = json!({"type":"message", "text":"<at>Jait</at> hello&nbsp; there", "conversation":{"id":"19:abc;messageid=root"}, "from":{"id":"user", "aadObjectId":"aad", "name":"Alice"}, "recipient":{"id":"bot"}});
        let msg = activity_to_inbound(&activity, 42.0).unwrap();
        assert_eq!(msg.conversation_id, "19:abc");
        assert_eq!(msg.sender_id, "aad");
        assert_eq!(msg.text, "hello there");
        assert_eq!(msg.timestamp, 42.0);
        assert!(!msg.from_me);
    }
    #[test]
    fn rejects_empty_or_non_message_activity() {
        assert!(
            activity_to_inbound(
                &json!({"type":"message", "text":"<at>bot</at>", "conversation":{"id":"a"}}),
                0.0
            )
            .is_none()
        );
        assert!(
            activity_to_inbound(
                &json!({"type":"typing", "text":"hi", "conversation":{"id":"a"}}),
                0.0
            )
            .is_none()
        );
    }
}

use futures_util::future::BoxFuture;
use std::{collections::HashMap, sync::Arc, time::Duration};

const MAX_BODY: usize = 256 * 1024;
const MAX_REFERENCES: usize = 256;
const MAX_TEXT: usize = 65_536;
const MAX_AUTHORIZATION: usize = 16_384;
const EFFECT_TIMEOUT: Duration = Duration::from_secs(30);

/// Runtime-owned effects. Implementations must verify the bearer token's issuer,
/// audience, exact permitted issuer, signature and expiry using trusted discovery/JWKS;
/// credentials, audience and tenant are fixed by runtime configuration, never by
/// the request. Redirects and JWKS destinations must
/// not escape the configured Microsoft endpoints. All futures must be
/// cancellation-safe, clean up late or cancelled startup, and must not include credentials in errors.
pub trait TeamsHost: Send + Sync {
    /// Validate all required configured credentials and enforce owner/node consent
    /// before opening a listener. A cancelled or timed-out start must close it.
    fn start(&self) -> BoxFuture<'_, Result<(), String>>;
    fn stop(&self) -> BoxFuture<'_, Result<(), String>>;
    fn verify(&self, authorization: String) -> BoxFuture<'_, Result<(), String>>;
    /// Enforce the existing owner/node and recipient consent policy.
    fn authorize_send(
        &self,
        conversation: String,
        text: String,
    ) -> BoxFuture<'_, Result<(), String>>;
    /// The host obtains and caches its configured Bot Framework credential, and
    /// sends only to this already-admitted service URL without redirects.
    fn send(
        &self,
        service_url: String,
        conversation: String,
        activity: Value,
    ) -> BoxFuture<'_, Result<(), String>>;
}

#[derive(Clone, Debug)]
struct Reference {
    service_url: String,
    conversation: Value,
    user: Option<Value>,
    bot: Option<Value>,
    tenant_id: Option<String>,
    locale: Option<Value>,
}

/// Serialized connector state. Runtime routing must not let requests select the
/// host, credentials or authority implementation. Stop clears all references.
pub struct TeamsConnector {
    host: Arc<dyn TeamsHost>,
    running: bool,
    references: HashMap<String, Reference>,
    app_id: String,
}

impl TeamsConnector {
    pub fn new(host: Arc<dyn TeamsHost>, app_id: String) -> Self {
        Self {
            host,
            running: false,
            references: HashMap::new(),
            app_id,
        }
    }

    pub fn running(&self) -> bool {
        self.running
    }

    pub async fn start(&mut self) -> Result<(), String> {
        if self.running {
            return Ok(());
        }
        if self.app_id.is_empty() {
            return Err("Microsoft Teams credentials are not configured".into());
        }
        tokio::time::timeout(EFFECT_TIMEOUT, self.host.start())
            .await
            .map_err(|_| "Microsoft Teams start timed out".to_string())??;
        self.running = true;
        Ok(())
    }

    pub async fn stop(&mut self) -> Result<(), String> {
        self.running = false;
        self.references.clear();
        tokio::time::timeout(EFFECT_TIMEOUT, self.host.stop())
            .await
            .map_err(|_| "Microsoft Teams stop timed out".to_string())?
    }

    /// Handle a webhook only after enforcing body limits and authentication.
    /// The HTTP adapter is responsible for method/path checks and status codes.
    pub async fn receive(
        &mut self,
        authorization: &str,
        body: &[u8],
        now_ms: f64,
    ) -> Result<Option<InboundMessage>, String> {
        if !self.running {
            return Err("Microsoft Teams connector is stopped".into());
        }
        if body.len() > MAX_BODY {
            return Err("Payload too large".into());
        }
        if authorization.len() > MAX_AUTHORIZATION || !authorization.starts_with("Bearer ") {
            return Err("Unauthorized".into());
        }
        let activity: Value =
            serde_json::from_slice(body).map_err(|_| "Invalid JSON".to_string())?;
        tokio::time::timeout(EFFECT_TIMEOUT, self.host.verify(authorization.to_owned()))
            .await
            .map_err(|_| "Microsoft Teams authentication timed out".to_string())??;
        let conversation = activity.get("conversation").unwrap_or(&Value::Null);
        let id = normalize_conversation_id(string(conversation, "id").unwrap_or_default());
        if !id.is_empty() {
            if let Some(service_url) = string(&activity, "serviceUrl") {
                if !is_allowed_service_url(service_url) {
                    return Err("Blocked Microsoft Teams serviceUrl host".into());
                }
                if !self.references.contains_key(id) && self.references.len() >= MAX_REFERENCES {
                    return Err("Microsoft Teams reference limit reached".into());
                }
                let tenant = activity
                    .pointer("/channelData/tenant/id")
                    .and_then(Value::as_str)
                    .or_else(|| string(conversation, "tenantId"))
                    .map(str::to_owned);
                let mut normalized = serde_json::Map::new();
                normalized.insert("id".into(), Value::String(id.into()));
                if let Some(v) = conversation.get("conversationType") {
                    normalized.insert("conversationType".into(), v.clone());
                }
                if let Some(ref v) = tenant {
                    normalized.insert("tenantId".into(), Value::String(v.clone()));
                }
                self.references.insert(
                    id.into(),
                    Reference {
                        service_url: service_url.trim().trim_end_matches('/').into(),
                        conversation: Value::Object(normalized),
                        user: activity.get("from").cloned(),
                        bot: activity.get("recipient").cloned(),
                        tenant_id: tenant,
                        locale: activity.get("locale").cloned(),
                    },
                );
            }
        }
        Ok(activity_to_inbound(&activity, now_ms))
    }

    pub async fn send(&self, conversation: &str, text: &str) -> Result<(), String> {
        if !self.running {
            return Err("Microsoft Teams connector is stopped".into());
        }
        if text.len() > MAX_TEXT {
            return Err("Microsoft Teams message too large".into());
        }
        let id = normalize_conversation_id(conversation);
        let reference = self
            .references
            .get(id)
            .ok_or_else(|| "No Microsoft Teams conversation reference".to_string())?;
        tokio::time::timeout(
            EFFECT_TIMEOUT,
            self.host.authorize_send(id.into(), text.into()),
        )
        .await
        .map_err(|_| "Microsoft Teams authorization timed out".to_string())??;
        let mut activity = serde_json::Map::new();
        activity.insert("type".into(), "message".into());
        activity.insert("text".into(), text.into());
        activity.insert("channelId".into(), "msteams".into());
        activity.insert(
            "from".into(),
            reference
                .bot
                .clone()
                .unwrap_or_else(|| serde_json::json!({"id":self.app_id, "role":"bot"})),
        );
        if let Some(user) = &reference.user {
            activity.insert("recipient".into(), user.clone());
        }
        activity.insert("conversation".into(), reference.conversation.clone());
        activity.insert("serviceUrl".into(), reference.service_url.clone().into());
        if let Some(locale) = &reference.locale {
            activity.insert("locale".into(), locale.clone());
        }
        if let Some(tenant) = &reference.tenant_id {
            activity.insert(
                "channelData".into(),
                serde_json::json!({"tenant":{"id":tenant}}),
            );
        }
        tokio::time::timeout(
            EFFECT_TIMEOUT,
            self.host.send(
                reference.service_url.clone(),
                id.into(),
                Value::Object(activity),
            ),
        )
        .await
        .map_err(|_| "Microsoft Teams send timed out".to_string())?
    }
}

/// Grants one concrete Teams outbound operation under the runtime's existing
/// owner/node and recipient consent policy. Tokens are never passed to policy.
pub trait TeamsOutboundAuthority: Send + Sync {
    fn authorize(&self, url: String, conversation: String) -> BoxFuture<'_, Result<(), String>>;
}

fn outbound_url(service_url: &str, conversation: &str) -> Result<Url, String> {
    if !is_allowed_service_url(service_url)
        || conversation.is_empty()
        || conversation.len() > 4096
        || matches!(conversation, "." | "..")
    {
        return Err("Invalid Teams outbound destination".into());
    }
    let base = service_url.trim().trim_end_matches('/');
    let encoded: String = url::form_urlencoded::byte_serialize(conversation.as_bytes())
        .collect::<String>()
        .replace('+', "%20");
    let raw = format!("{base}/v3/conversations/{encoded}/activities");
    let url = crate::security::ssrf_guard::SsrfGuard::default()
        .validate(&raw)
        .map_err(|_| "Invalid Teams outbound destination".to_string())?;
    if !is_allowed_service_url(url.as_str()) {
        return Err("Invalid Teams outbound destination".into());
    }
    Ok(url)
}

fn validate_outbound_addresses(addresses: &[std::net::SocketAddr]) -> Result<(), String> {
    use crate::security::ssrf_guard::SsrfGuard;
    use std::net::IpAddr;
    if addresses.is_empty() || addresses.len() > 32 {
        return Err("Invalid Teams DNS response".into());
    }
    for address in addresses {
        let raw = match address.ip() {
            IpAddr::V4(ip) => format!("https://{ip}/"),
            IpAddr::V6(ip) => format!("https://[{ip}]/"),
        };
        SsrfGuard::default()
            .validate(&raw)
            .map_err(|_| "Blocked Teams DNS address".to_string())?;
        if address.port() != 443 {
            return Err("Invalid Teams DNS port".into());
        }
    }
    Ok(())
}

fn outbound_client(
    host: &str,
    addresses: &[std::net::SocketAddr],
    deadline: Duration,
) -> Result<reqwest::Client, String> {
    outbound_client_builder(host, addresses, deadline)
        .build()
        .map_err(|_| "Teams client failed".to_string())
}

fn outbound_client_builder(
    host: &str,
    addresses: &[std::net::SocketAddr],
    deadline: Duration,
) -> reqwest::ClientBuilder {
    reqwest::Client::builder()
        .no_proxy()
        .retry(reqwest::retry::never())
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(3))
        .timeout(deadline)
        .pool_max_idle_per_host(0)
        .no_gzip()
        .no_brotli()
        .no_deflate()
        .no_zstd()
        .resolve_to_addrs(host, addresses)
}

async fn outbound_post(
    client: reqwest::Client,
    url: Url,
    body: Vec<u8>,
    token: &str,
) -> Result<(), String> {
    let response = client
        .post(url)
        .bearer_auth(token)
        .header(reqwest::header::CONTENT_TYPE, "application/json")
        .body(body)
        .send()
        .await
        .map_err(|_| "Teams send failed".to_string())?;
    if !response.status().is_success() {
        return Err(format!(
            "Teams send failed (HTTP {})",
            response.status().as_u16()
        ));
    }
    Ok(())
}

async fn outbound_with_cancellation<F: std::future::Future<Output = Result<(), String>>>(
    operation: F,
    mut cancel: tokio::sync::watch::Receiver<bool>,
    deadline: Duration,
) -> Result<(), String> {
    tokio::select! {
        biased;
        _ = listener_cancelled(&mut cancel) => Err("Teams send cancelled".into()),
        result = tokio::time::timeout(deadline, operation) => result.map_err(|_| "Teams send timed out".to_string())?,
    }
}

/// Deliver a prepared activity with a runtime-provided Bot Framework token.
/// The runtime must acquire and keep the token under its own credential policy.
/// Every call checks outbound authority, pins only public DNS answers, disables
/// redirects/proxies/retries, bounds the operation and never exposes response
/// bodies or credentials through errors. Dropping or cancelling the future stops it.
pub async fn send_authorized_activity(
    service_url: &str,
    conversation: &str,
    activity: &Value,
    token: &str,
    authority: &dyn TeamsOutboundAuthority,
    cancel: tokio::sync::watch::Receiver<bool>,
) -> Result<(), String> {
    const DEADLINE: Duration = Duration::from_secs(10);
    if token.is_empty() || token.len() > 16384 || token.chars().any(char::is_control) {
        return Err("Invalid Teams credential".into());
    }
    let body = serde_json::to_vec(activity).map_err(|_| "Invalid Teams activity".to_string())?;
    if body.len() > MAX_BODY {
        return Err("Teams activity too large".into());
    }
    let url = outbound_url(service_url, conversation)?;
    let host = url
        .host_str()
        .ok_or_else(|| "Invalid Teams endpoint".to_string())?
        .to_owned();
    let operation = async {
        authority
            .authorize(url.to_string(), conversation.to_owned())
            .await
            .map_err(|_| "Teams outbound authorization denied".to_string())?;
        let addresses: Vec<_> = tokio::net::lookup_host((host.as_str(), 443))
            .await
            .map_err(|_| "Teams DNS failed".to_string())?
            .take(33)
            .collect();
        validate_outbound_addresses(&addresses)?;
        let client = outbound_client(&host, &addresses, DEADLINE)?;
        outbound_post(client, url, body, token).await
    };
    outbound_with_cancellation(operation, cancel, DEADLINE).await
}

async fn listener_cancelled(cancel: &mut tokio::sync::watch::Receiver<bool>) {
    while !*cancel.borrow_and_update() {
        if cancel.changed().await.is_err() {
            break;
        }
    }
}

/// Owned HTTP listener for an already-started connector. The runtime must obtain
/// listener consent before starting the connector and must supervise this handle.
/// A full inbound queue returns 503 instead of silently dropping a message.
pub struct TeamsListener {
    shutdown: Option<tokio::sync::oneshot::Sender<()>>,
    cancel: tokio::sync::watch::Sender<bool>,
    task: tokio::task::JoinHandle<Result<(), String>>,
    pub local_addr: std::net::SocketAddr,
}

impl TeamsListener {
    pub async fn bind(
        address: std::net::SocketAddr,
        path: &str,
        connector: Arc<tokio::sync::Mutex<TeamsConnector>>,
        inbound: tokio::sync::mpsc::Sender<InboundMessage>,
    ) -> Result<Self, String> {
        use axum::{
            Router,
            body::{Body, to_bytes},
            http::{Request, StatusCode},
            response::IntoResponse,
        };
        if !path.starts_with('/')
            || path.contains(['?', '#'])
            || path.len() > 1024
            || path.parse::<axum::http::Uri>().is_err()
        {
            return Err("Invalid Teams listener path".into());
        }
        if !connector.lock().await.running() {
            return Err("Microsoft Teams connector is stopped".into());
        }
        let listener = tokio::net::TcpListener::bind(address)
            .await
            .map_err(|_| "Microsoft Teams listener bind failed".to_string())?;
        let local_addr = listener
            .local_addr()
            .map_err(|_| "Microsoft Teams listener address failed".to_string())?;
        let (cancel, cancel_rx) = tokio::sync::watch::channel(false);
        let capacity = Arc::new(tokio::sync::Semaphore::new(64));
        let expected_path = path.to_owned();
        let route = move |request: Request<Body>| {
            let mut cancel_rx = cancel_rx.clone();
            let capacity = capacity.clone();
            let expected_path = expected_path.clone();
            let connector = connector.clone();
            let inbound = inbound.clone();
            async move {
                let Ok(_permit) = capacity.try_acquire_owned() else {
                    return (StatusCode::SERVICE_UNAVAILABLE, "Listener busy").into_response();
                };
                if request.method() != axum::http::Method::POST
                    || request.uri().path() != expected_path
                {
                    return (StatusCode::NOT_FOUND, "Not found").into_response();
                }
                let auth = request
                    .headers()
                    .get(axum::http::header::AUTHORIZATION)
                    .and_then(|v| v.to_str().ok())
                    .unwrap_or("")
                    .to_owned();
                if auth.len() > MAX_AUTHORIZATION || !auth.starts_with("Bearer ") {
                    return (StatusCode::UNAUTHORIZED, "Unauthorized").into_response();
                }
                let body_result = tokio::select! {
                    biased;
                    _ = listener_cancelled(&mut cancel_rx) => return (StatusCode::SERVICE_UNAVAILABLE, "Listener stopping").into_response(),
                    result = tokio::time::timeout(EFFECT_TIMEOUT, to_bytes(request.into_body(), MAX_BODY)) => result,
                };
                let body = match body_result {
                    Ok(Ok(body)) => body,
                    Ok(Err(_)) => {
                        return (StatusCode::PAYLOAD_TOO_LARGE, "Payload too large")
                            .into_response();
                    }
                    Err(_) => {
                        return (StatusCode::REQUEST_TIMEOUT, "Request timed out").into_response();
                    }
                };
                // Serialize state changes, but do not allow an indefinitely stalled
                // authentication operation to hold requests or shutdown open.
                let operation = async {
                    let mut guard = connector.lock().await;
                    let now = chrono::Utc::now().timestamp_millis() as f64;
                    guard.receive(&auth, &body, now).await
                };
                let result = tokio::select! {
                    biased;
                    _ = listener_cancelled(&mut cancel_rx) => return (StatusCode::SERVICE_UNAVAILABLE, "Listener stopping").into_response(),
                    result = tokio::time::timeout(EFFECT_TIMEOUT, operation) => result,
                };
                match result {
                    Ok(Ok(Some(message))) => match inbound.try_send(message) {
                        Ok(()) => (StatusCode::ACCEPTED, "Accepted").into_response(),
                        Err(_) => (StatusCode::SERVICE_UNAVAILABLE, "Inbound queue unavailable")
                            .into_response(),
                    },
                    Ok(Ok(None)) => (StatusCode::ACCEPTED, "Accepted").into_response(),
                    Ok(Err(error))
                        if error.to_ascii_lowercase().contains("token")
                            || error.to_ascii_lowercase().contains("issuer")
                            || error == "Unauthorized" =>
                    {
                        (StatusCode::UNAUTHORIZED, "Unauthorized").into_response()
                    }
                    Ok(Err(_)) => (StatusCode::BAD_REQUEST, "Invalid activity").into_response(),
                    Err(_) => {
                        (StatusCode::SERVICE_UNAVAILABLE, "Request timed out").into_response()
                    }
                }
            }
        };
        // Register a fallback rather than interpolating configuration into
        // Axum route syntax; braces and other path characters are literal.
        let router = Router::new().fallback(route);
        let (shutdown, receiver) = tokio::sync::oneshot::channel();
        let task = tokio::spawn(async move {
            axum::serve(listener, router)
                .with_graceful_shutdown(async {
                    let _ = receiver.await;
                })
                .await
                .map_err(|_| "Microsoft Teams listener failed".to_string())
        });
        Ok(Self {
            shutdown: Some(shutdown),
            cancel,
            task,
            local_addr,
        })
    }

    pub async fn stop(mut self) -> Result<(), String> {
        let _ = self.cancel.send(true);
        if let Some(shutdown) = self.shutdown.take() {
            let _ = shutdown.send(());
        }
        match tokio::time::timeout(EFFECT_TIMEOUT, &mut self.task).await {
            Ok(Ok(result)) => result,
            Ok(Err(_)) => Err("Microsoft Teams listener task failed".into()),
            Err(_) => {
                self.task.abort();
                let _ = (&mut self.task).await;
                Err("Microsoft Teams listener shutdown timed out".into())
            }
        }
    }
}

impl Drop for TeamsListener {
    fn drop(&mut self) {
        let _ = self.cancel.send(true);
        if let Some(shutdown) = self.shutdown.take() {
            let _ = shutdown.send(());
        }
        self.task.abort();
    }
}

#[cfg(test)]
mod lifecycle_tests {
    use super::*;
    use std::sync::Mutex;
    struct Host {
        verified: bool,
        allow_send: bool,
        sent: Mutex<Vec<Value>>,
    }
    impl TeamsHost for Host {
        fn start(&self) -> BoxFuture<'_, Result<(), String>> {
            Box::pin(async { Ok(()) })
        }
        fn stop(&self) -> BoxFuture<'_, Result<(), String>> {
            Box::pin(async { Ok(()) })
        }
        fn verify(&self, _: String) -> BoxFuture<'_, Result<(), String>> {
            Box::pin(async move {
                if self.verified {
                    Ok(())
                } else {
                    Err("invalid token".into())
                }
            })
        }
        fn authorize_send(&self, _: String, _: String) -> BoxFuture<'_, Result<(), String>> {
            Box::pin(async move {
                if self.allow_send {
                    Ok(())
                } else {
                    Err("denied".into())
                }
            })
        }
        fn send(&self, _: String, _: String, activity: Value) -> BoxFuture<'_, Result<(), String>> {
            Box::pin(async move {
                self.sent.lock().unwrap().push(activity);
                Ok(())
            })
        }
    }
    fn host(verified: bool) -> Arc<Host> {
        Arc::new(Host {
            verified,
            allow_send: true,
            sent: Mutex::new(Vec::new()),
        })
    }
    fn body() -> Vec<u8> {
        serde_json::to_vec(&serde_json::json!({"type":"message", "text":"hi", "serviceUrl":"https://smba.trafficmanager.net/emea/", "conversation":{"id":"abc;root"}, "from":{"id":"user"}})).unwrap()
    }
    #[tokio::test]
    async fn authenticated_reference_allows_send_and_stop_clears_it() {
        let h = host(true);
        let mut connector = TeamsConnector::new(h.clone(), "bot".into());
        connector.start().await.unwrap();
        assert!(
            connector
                .receive("Bearer token", &body(), 0.0)
                .await
                .unwrap()
                .is_some()
        );
        connector.send("abc", "reply").await.unwrap();
        assert_eq!(h.sent.lock().unwrap()[0]["text"], "reply");
        connector.stop().await.unwrap();
        connector.start().await.unwrap();
        assert!(connector.send("abc", "reply").await.is_err());
    }
    #[tokio::test]
    async fn listener_routes_limits_and_shuts_down() {
        let mut connector = TeamsConnector::new(host(true), "bot".into());
        connector.start().await.unwrap();
        let connector = Arc::new(tokio::sync::Mutex::new(connector));
        let (tx, mut rx) = tokio::sync::mpsc::channel(1);
        let listener = TeamsListener::bind(
            "127.0.0.1:0".parse().unwrap(),
            "/api/messages",
            connector,
            tx,
        )
        .await
        .unwrap();
        let base = format!("http://{}", listener.local_addr);
        let client = reqwest::Client::new();
        assert_eq!(
            client
                .get(format!("{base}/api/messages"))
                .send()
                .await
                .unwrap()
                .status(),
            404
        );
        assert_eq!(
            client
                .post(format!("{base}/api/messages"))
                .body(body())
                .send()
                .await
                .unwrap()
                .status(),
            401
        );
        assert_eq!(
            client
                .post(format!("{base}/api/messages"))
                .bearer_auth("test")
                .body(vec![0; MAX_BODY + 1])
                .send()
                .await
                .unwrap()
                .status(),
            413
        );
        assert_eq!(
            client
                .post(format!("{base}/api/messages"))
                .bearer_auth("test")
                .body(body())
                .send()
                .await
                .unwrap()
                .status(),
            202
        );
        assert!(rx.recv().await.is_some());
        listener.stop().await.unwrap();
        assert!(
            client
                .post(format!("{base}/api/messages"))
                .send()
                .await
                .is_err()
        );
    }
    #[tokio::test]
    async fn listener_handles_literal_routes_and_stalled_clients_on_stop() {
        use tokio::io::AsyncWriteExt;
        let mut connector = TeamsConnector::new(host(true), "bot".into());
        connector.start().await.unwrap();
        let connector = Arc::new(tokio::sync::Mutex::new(connector));
        let (tx, _rx) = tokio::sync::mpsc::channel(1);
        let listener =
            TeamsListener::bind("127.0.0.1:0".parse().unwrap(), "/:literal", connector, tx)
                .await
                .unwrap();
        let base = format!("http://{}", listener.local_addr);
        let client = reqwest::Client::new();
        assert_eq!(
            client
                .post(format!("{base}/other"))
                .bearer_auth("test")
                .body(body())
                .send()
                .await
                .unwrap()
                .status(),
            404
        );
        assert_eq!(
            client
                .post(format!("{base}/:literal"))
                .bearer_auth("test")
                .body(body())
                .send()
                .await
                .unwrap()
                .status(),
            202
        );
        let mut stalled = tokio::net::TcpStream::connect(listener.local_addr)
            .await
            .unwrap();
        stalled.write_all(b"POST /:literal HTTP/1.1\r\nHost: local\r\nContent-Length: 100\r\nAuthorization: Bearer test\r\n\r\n{").await.unwrap();
        tokio::task::yield_now().await;
        tokio::time::timeout(std::time::Duration::from_secs(2), listener.stop())
            .await
            .unwrap()
            .unwrap();
    }
    #[tokio::test]
    async fn listener_stop_cancels_inflight_authentication() {
        use std::sync::atomic::{AtomicBool, Ordering};
        struct Guard(Arc<AtomicBool>);
        impl Drop for Guard {
            fn drop(&mut self) {
                self.0.store(true, Ordering::SeqCst);
            }
        }
        struct PendingHost {
            entered: tokio::sync::Notify,
            dropped: Arc<AtomicBool>,
        }
        impl TeamsHost for PendingHost {
            fn start(&self) -> BoxFuture<'_, Result<(), String>> {
                Box::pin(async { Ok(()) })
            }
            fn stop(&self) -> BoxFuture<'_, Result<(), String>> {
                Box::pin(async { Ok(()) })
            }
            fn verify(&self, _: String) -> BoxFuture<'_, Result<(), String>> {
                Box::pin(async move {
                    let _guard = Guard(self.dropped.clone());
                    self.entered.notify_one();
                    std::future::pending().await
                })
            }
            fn authorize_send(&self, _: String, _: String) -> BoxFuture<'_, Result<(), String>> {
                Box::pin(async { Err("denied".into()) })
            }
            fn send(&self, _: String, _: String, _: Value) -> BoxFuture<'_, Result<(), String>> {
                Box::pin(async { Err("denied".into()) })
            }
        }
        let host = Arc::new(PendingHost {
            entered: tokio::sync::Notify::new(),
            dropped: Arc::new(AtomicBool::new(false)),
        });
        let mut connector = TeamsConnector::new(host.clone(), "bot".into());
        connector.start().await.unwrap();
        let (tx, _rx) = tokio::sync::mpsc::channel(1);
        let listener = TeamsListener::bind(
            "127.0.0.1:0".parse().unwrap(),
            "/api/messages",
            Arc::new(tokio::sync::Mutex::new(connector)),
            tx,
        )
        .await
        .unwrap();
        let url = format!("http://{}/api/messages", listener.local_addr);
        let request = tokio::spawn(async move {
            reqwest::Client::new()
                .post(url)
                .bearer_auth("test")
                .body(body())
                .send()
                .await
        });
        tokio::time::timeout(std::time::Duration::from_secs(2), host.entered.notified())
            .await
            .unwrap();
        tokio::time::timeout(std::time::Duration::from_secs(2), listener.stop())
            .await
            .unwrap()
            .unwrap();
        assert!(host.dropped.load(Ordering::SeqCst));
        let _ = request.await;
    }
    #[tokio::test]
    async fn outbound_validates_destination_and_denies_before_dns() {
        struct Deny;
        impl TeamsOutboundAuthority for Deny {
            fn authorize(&self, _: String, _: String) -> BoxFuture<'_, Result<(), String>> {
                Box::pin(async { Err("denied".into()) })
            }
        }
        let url = outbound_url("https://smba.trafficmanager.net/emea/", "a/b?c%2f").unwrap();
        assert_eq!(
            url.path(),
            "/emea/v3/conversations/a%2Fb%3Fc%252f/activities"
        );
        for id in ["", ".", ".."] {
            assert!(outbound_url("https://smba.trafficmanager.net", id).is_err());
        }
        assert!(outbound_url("https://smba.trafficmanager.net.evil.test", "x").is_err());
        assert!(outbound_url("https://smba.trafficmanager.net:8443", "x").is_err());
        assert!(
            outbound_url("https://smba.trafficmanager.net", "%2e%2e")
                .unwrap()
                .path()
                .contains("%252e%252e")
        );
        assert!(
            outbound_url("https://smba.trafficmanager.net", "a b")
                .unwrap()
                .path()
                .contains("a%20b")
        );
        let (_tx, rx) = tokio::sync::watch::channel(false);
        assert_eq!(
            send_authorized_activity(
                "https://smba.trafficmanager.net",
                "x",
                &serde_json::json!({}),
                "token",
                &Deny,
                rx
            )
            .await
            .unwrap_err(),
            "Teams outbound authorization denied"
        );
        let (tx, rx) = tokio::sync::watch::channel(true);
        assert_eq!(
            send_authorized_activity(
                "https://smba.trafficmanager.net",
                "x",
                &serde_json::json!({}),
                "token",
                &Deny,
                rx
            )
            .await
            .unwrap_err(),
            "Teams send cancelled"
        );
        drop(tx);
    }
    #[tokio::test]
    async fn outbound_transport_pins_address_and_rejects_redirects() {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        let server = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = server.local_addr().unwrap();
        let server_task = tokio::spawn(async move {
            let (mut stream, _) = server.accept().await.unwrap();
            let mut bytes = vec![0; 8192];
            let n = stream.read(&mut bytes).await.unwrap();
            let request = String::from_utf8_lossy(&bytes[..n]).to_ascii_lowercase();
            assert!(request.starts_with("post /activity "));
            assert!(request.contains("authorization: bearer test-token"));
            stream.write_all(b"HTTP/1.1 302 Found\r\nLocation: /leak\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").await.unwrap();
            assert!(
                tokio::time::timeout(Duration::from_millis(200), server.accept())
                    .await
                    .is_err()
            );
        });
        let client = outbound_client("teams.invalid", &[addr], Duration::from_secs(2)).unwrap();
        let url = Url::parse(&format!("http://teams.invalid:{}/activity", addr.port())).unwrap();
        let result = outbound_post(client, url, b"{}".to_vec(), "test-token").await;
        assert_eq!(result.unwrap_err(), "Teams send failed (HTTP 302)");
        server_task.await.unwrap();
    }
    #[tokio::test]
    async fn outbound_transport_cancels_waiting_response() {
        use tokio::io::AsyncReadExt;
        let server = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = server.local_addr().unwrap();
        let (started, ready) = tokio::sync::oneshot::channel();
        let server_task = tokio::spawn(async move {
            let (mut stream, _) = server.accept().await.unwrap();
            let mut buffer = [0; 8192];
            assert!(stream.read(&mut buffer).await.unwrap() > 0);
            let _ = started.send(());
            tokio::time::timeout(Duration::from_secs(2), stream.read(&mut buffer))
                .await
                .unwrap()
                .unwrap()
        });
        let client = outbound_client("teams.invalid", &[addr], Duration::from_secs(5)).unwrap();
        let url = Url::parse(&format!("http://teams.invalid:{}/activity", addr.port())).unwrap();
        let (cancel, rx) = tokio::sync::watch::channel(false);
        let task = tokio::spawn(async move {
            outbound_with_cancellation(
                outbound_post(client, url, b"{}".to_vec(), "token"),
                rx,
                Duration::from_secs(5),
            )
            .await
        });
        tokio::time::timeout(Duration::from_secs(2), ready)
            .await
            .unwrap()
            .unwrap();
        cancel.send(true).unwrap();
        assert_eq!(
            tokio::time::timeout(Duration::from_secs(2), task)
                .await
                .unwrap()
                .unwrap()
                .unwrap_err(),
            "Teams send cancelled"
        );
        assert_eq!(server_task.await.unwrap(), 0);
    }
    #[test]
    fn outbound_dns_rejects_mixed_private_and_invalid_answers() {
        let public = "8.8.8.8:443".parse().unwrap();
        assert!(validate_outbound_addresses(&[public]).is_ok());
        assert!(validate_outbound_addresses(&[]).is_err());
        assert!(validate_outbound_addresses(&[public, "127.0.0.1:443".parse().unwrap()]).is_err());
        assert!(validate_outbound_addresses(&["[::ffff:127.0.0.1]:443".parse().unwrap()]).is_err());
        assert!(validate_outbound_addresses(&["8.8.8.8:8443".parse().unwrap()]).is_err());
        assert!(validate_outbound_addresses(&vec![public; 33]).is_err());
    }
    #[tokio::test]
    async fn outbound_cancels_and_drops_pending_authority() {
        use std::sync::atomic::{AtomicBool, Ordering};
        struct Guard(Arc<AtomicBool>);
        impl Drop for Guard {
            fn drop(&mut self) {
                self.0.store(true, Ordering::SeqCst);
            }
        }
        struct Pending {
            entered: tokio::sync::Notify,
            dropped: Arc<AtomicBool>,
        }
        impl TeamsOutboundAuthority for Pending {
            fn authorize(&self, _: String, _: String) -> BoxFuture<'_, Result<(), String>> {
                Box::pin(async move {
                    let _guard = Guard(self.dropped.clone());
                    self.entered.notify_one();
                    std::future::pending().await
                })
            }
        }
        let authority = Arc::new(Pending {
            entered: tokio::sync::Notify::new(),
            dropped: Arc::new(AtomicBool::new(false)),
        });
        let (tx, rx) = tokio::sync::watch::channel(false);
        let other = authority.clone();
        let task = tokio::spawn(async move {
            send_authorized_activity(
                "https://smba.trafficmanager.net",
                "x",
                &serde_json::json!({}),
                "token",
                other.as_ref(),
                rx,
            )
            .await
        });
        tokio::time::timeout(Duration::from_secs(2), authority.entered.notified())
            .await
            .unwrap();
        tx.send(true).unwrap();
        assert_eq!(
            tokio::time::timeout(Duration::from_secs(2), task)
                .await
                .unwrap()
                .unwrap()
                .unwrap_err(),
            "Teams send cancelled"
        );
        assert!(authority.dropped.load(Ordering::SeqCst));
    }
    #[tokio::test]
    async fn denied_send_never_delivers() {
        let h = Arc::new(Host {
            verified: true,
            allow_send: false,
            sent: Mutex::new(Vec::new()),
        });
        let mut connector = TeamsConnector::new(h.clone(), "bot".into());
        connector.start().await.unwrap();
        connector
            .receive("Bearer token", &body(), 0.0)
            .await
            .unwrap();
        assert!(connector.send("abc", "reply").await.is_err());
        assert!(h.sent.lock().unwrap().is_empty());
    }
    #[tokio::test]
    async fn rejected_auth_does_not_create_reference() {
        let h = host(false);
        let mut connector = TeamsConnector::new(h, "bot".into());
        connector.start().await.unwrap();
        assert!(connector.receive("Bearer bad", &body(), 0.0).await.is_err());
        assert!(connector.send("abc", "reply").await.is_err());
        assert!(
            connector
                .receive("Bearer bad", &vec![0; MAX_BODY + 1], 0.0)
                .await
                .is_err()
        );
    }
}

#[cfg(test)]
#[path = "msteams_tls_tests.rs"]
mod tls_tests;
