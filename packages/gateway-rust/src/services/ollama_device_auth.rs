//! Ollama device authentication. Key paths are operator configuration, never request input.
use crate::services::ollama_usage_setup::{UsageHost, is_local_ollama_url};
use crate::{
    text::js_trim,
    time::{Clock, default_clock},
};
use base64::{Engine, engine::general_purpose::STANDARD};
use ed25519_dalek::{Signer, SigningKey};
use futures_util::future::BoxFuture;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{fmt, path::Path, sync::Arc};
pub const UNSUPPORTED_KEY: &str =
    "Unsupported Ollama device key: expected an unencrypted OpenSSH Ed25519 key.";
pub const UNREADABLE_KEY: &str = "Ollama device key is not readable by Jait. Configure JAIT_OLLAMA_DEVICE_KEY_PATH and grant the gateway user read access, or add an Ollama Cloud API key.";
pub const ACCOUNT_MISMATCH: &str = "Ollama device key belongs to a different or unverified account. Use the matching daemon key or an Ollama Cloud API key.";
#[derive(Clone, Debug, PartialEq, Eq)]
enum AuthErrorKind {
    General,
    UsageHttp,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct OllamaAuthError {
    pub name: String,
    pub message: String,
    pub status: Option<u16>,
    #[serde(skip)]
    kind: AuthErrorKind,
}
impl OllamaAuthError {
    pub fn transport(name: String, message: String, status: Option<u16>) -> Self {
        Self {
            name,
            message,
            status,
            kind: AuthErrorKind::General,
        }
    }
    pub(crate) fn plain(message: impl Into<String>) -> Self {
        Self {
            name: "Error".into(),
            message: message.into(),
            status: None,
            kind: AuthErrorKind::General,
        }
    }
    pub(crate) fn usage(message: String, status: u16) -> Self {
        Self {
            name: "OllamaUsageError".into(),
            message,
            status: Some(status),
            kind: AuthErrorKind::UsageHttp,
        }
    }
}
impl fmt::Display for OllamaAuthError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.message.fmt(f)
    }
}
impl std::error::Error for OllamaAuthError {}
#[derive(Clone)]
pub struct OllamaDeviceKey(SigningKey);
impl fmt::Debug for OllamaDeviceKey {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("OllamaDeviceKey(REDACTED)")
    }
}
fn invalid_key() -> OllamaAuthError {
    OllamaAuthError::plain(UNSUPPORTED_KEY)
}
struct Reader<'a> {
    bytes: &'a [u8],
    offset: usize,
}
impl<'a> Reader<'a> {
    fn uint(&mut self) -> Result<u32, OllamaAuthError> {
        let end = self.offset.checked_add(4).ok_or_else(invalid_key)?;
        let bytes = self.bytes.get(self.offset..end).ok_or_else(invalid_key)?;
        self.offset = end;
        Ok(u32::from_be_bytes(bytes.try_into().unwrap()))
    }
    fn field(&mut self) -> Result<&'a [u8], OllamaAuthError> {
        let length = self.uint()? as usize;
        let end = self.offset.checked_add(length).ok_or_else(invalid_key)?;
        let bytes = self.bytes.get(self.offset..end).ok_or_else(invalid_key)?;
        self.offset = end;
        Ok(bytes)
    }
}
fn ssh_public_key(raw: &[u8]) -> Vec<u8> {
    let mut bytes = vec![0, 0, 0, 11];
    bytes.extend_from_slice(b"ssh-ed25519");
    bytes.extend_from_slice(&32u32.to_be_bytes());
    bytes.extend_from_slice(raw);
    bytes
}
// Buffer.from(base64) accepts omitted padding and ignores trailing pad bits.
fn node_base64(input: &str) -> Vec<u8> {
    let mut bytes = vec![];
    let mut accumulator = 0u32;
    let mut bits = 0u32;
    for byte in input.bytes() {
        let value = match byte {
            b'A'..=b'Z' => byte - b'A',
            b'a'..=b'z' => byte - b'a' + 26,
            b'0'..=b'9' => byte - b'0' + 52,
            b'+' => 62,
            b'/' => 63,
            b'=' => break,
            _ => continue,
        };
        accumulator = (accumulator << 6) | u32::from(value);
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            bytes.push((accumulator >> bits) as u8);
            accumulator &= (1 << bits) - 1;
        }
    }
    bytes
}
pub fn parse_ollama_device_key(pem: &str) -> Result<OllamaDeviceKey, OllamaAuthError> {
    if pem.encode_utf16().count() > 16_384 {
        return Err(invalid_key());
    }
    let text = js_trim(pem);
    let body = text
        .strip_prefix("-----BEGIN OPENSSH PRIVATE KEY-----")
        .and_then(|v| v.strip_suffix("-----END OPENSSH PRIVATE KEY-----"))
        .ok_or_else(invalid_key)?;
    if !body.chars().next().is_some_and(crate::text::js_whitespace)
        || body.is_empty()
        || body.chars().any(|ch| {
            !ch.is_ascii_alphanumeric()
                && !matches!(ch, '+' | '/' | '=')
                && !crate::text::js_whitespace(ch)
        })
    {
        return Err(invalid_key());
    }
    let bytes = node_base64(
        &body
            .chars()
            .filter(|ch| !crate::text::js_whitespace(*ch))
            .collect::<String>(),
    );
    let magic = b"openssh-key-v1\0";
    if !bytes.starts_with(magic) {
        return Err(invalid_key());
    }
    let mut outer = Reader {
        bytes: &bytes,
        offset: magic.len(),
    };
    if outer.field()? != b"none"
        || outer.field()? != b"none"
        || !outer.field()?.is_empty()
        || outer.uint()? != 1
    {
        return Err(invalid_key());
    }
    let public_blob = outer.field()?;
    let mut inner = Reader {
        bytes: outer.field()?,
        offset: 0,
    };
    if inner.uint()? != inner.uint()? || inner.field()? != b"ssh-ed25519" {
        return Err(invalid_key());
    }
    let public = inner.field()?;
    let private = inner.field()?;
    if public.len() != 32 || private.len() != 64 || private[32..] != *public {
        return Err(invalid_key());
    }
    let key = SigningKey::from_bytes(private[..32].try_into().unwrap());
    let derived = key.verifying_key().to_bytes();
    if public != derived || public_blob != ssh_public_key(&derived) {
        return Err(invalid_key());
    }
    Ok(OllamaDeviceKey(key))
}
pub fn sign_ollama_request(
    key: &OllamaDeviceKey,
    method: &str,
    path: &str,
    timestamp: &str,
) -> String {
    let message = format!("{method},{path}?ts={timestamp}");
    let signature = key.0.sign(message.as_bytes());
    format!(
        "{}:{}",
        STANDARD.encode(ssh_public_key(&key.0.verifying_key().to_bytes())),
        STANDARD.encode(signature.to_bytes())
    )
}
pub fn ollama_device_key_paths(host: &UsageHost) -> Vec<String> {
    host.key_paths()
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct OllamaCloudAccount {
    pub email: Option<String>,
    pub name: Option<String>,
    pub plan: Option<String>,
}
#[derive(Clone, Serialize)]
pub struct OllamaAuthRequest {
    pub url: String,
    pub method: &'static str,
    pub authorization: Option<String>,
    pub accept: Option<&'static str>,
    pub reject_redirects: bool,
    pub timeout_ms: u64,
}
impl fmt::Debug for OllamaAuthRequest {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("OllamaAuthRequest")
            .field("method", &self.method)
            .field(
                "authorization",
                &self.authorization.as_ref().map(|_| "REDACTED"),
            )
            .field("reject_redirects", &self.reject_redirects)
            .field("timeout_ms", &self.timeout_ms)
            .finish_non_exhaustive()
    }
}
#[derive(Clone, Debug)]
pub struct OllamaAuthResponse {
    pub status: u16,
    pub body: Result<Value, OllamaAuthError>,
}
pub trait OllamaAuthTransport: Send + Sync {
    fn send<'a>(
        &'a self,
        request: OllamaAuthRequest,
    ) -> BoxFuture<'a, Result<OllamaAuthResponse, OllamaAuthError>>;
}
pub enum DeviceKeyRead {
    Pem(String),
    Invalid,
}
pub trait OllamaDeviceKeyReader: Send + Sync {
    fn read<'a>(&'a self, path: &'a str) -> BoxFuture<'a, Result<DeviceKeyRead, String>>;
}
/// This adapter only reads paths supplied by the operator-owned UsageHost.
pub struct SystemDeviceKeyReader;
impl OllamaDeviceKeyReader for SystemDeviceKeyReader {
    fn read<'a>(&'a self, path: &'a str) -> BoxFuture<'a, Result<DeviceKeyRead, String>> {
        let path = path.to_owned();
        Box::pin(async move {
            tokio::task::spawn_blocking(move || {
                use std::io::Read;
                let file =
                    std::fs::File::open(Path::new(&path)).map_err(|_| "unreadable".to_owned())?;
                let mut bytes = vec![];
                file.take(65_537)
                    .read_to_end(&mut bytes)
                    .map_err(|_| "unreadable".to_owned())?;
                Ok(if bytes.len() > 65_536 {
                    DeviceKeyRead::Invalid
                } else {
                    DeviceKeyRead::Pem(String::from_utf8_lossy(&bytes).into_owned())
                })
            })
            .await
            .map_err(|_| "unreadable".to_owned())?
        })
    }
}
/// Concrete HTTP boundary. Device signatures use a separate client that refuses redirects.
/// The response ceiling is an explicit native resource bound (2 MiB).
pub struct ReqwestOllamaAuthTransport {
    ordinary: reqwest::Client,
    signed: reqwest::Client,
}
impl ReqwestOllamaAuthTransport {
    pub fn new() -> Result<Self, reqwest::Error> {
        Ok(Self {
            ordinary: reqwest::Client::builder()
                .redirect(reqwest::redirect::Policy::limited(20))
                .build()?,
            signed: reqwest::Client::builder()
                .redirect(reqwest::redirect::Policy::none())
                .build()?,
        })
    }
}
fn request_error(error: reqwest::Error, signed: bool) -> OllamaAuthError {
    if error.is_timeout() {
        if signed {
            OllamaAuthError::transport(
                "TimeoutError".into(),
                "The operation timed out.".into(),
                None,
            )
        } else {
            OllamaAuthError::transport(
                "AbortError".into(),
                "The operation was aborted.".into(),
                None,
            )
        }
    } else {
        OllamaAuthError::transport("TypeError".into(), "fetch failed".into(), None)
    }
}
impl OllamaAuthTransport for ReqwestOllamaAuthTransport {
    fn send<'a>(
        &'a self,
        request: OllamaAuthRequest,
    ) -> BoxFuture<'a, Result<OllamaAuthResponse, OllamaAuthError>> {
        Box::pin(async move {
            let client = if request.reject_redirects {
                &self.signed
            } else {
                &self.ordinary
            };
            let method = reqwest::Method::from_bytes(request.method.as_bytes())
                .map_err(|_| OllamaAuthError::plain("Invalid request method"))?;
            let mut url = url::Url::parse(&request.url).map_err(|_| {
                OllamaAuthError::transport("TypeError".into(), "fetch failed".into(), None)
            })?;
            // Bun ignores URL userinfo; reqwest otherwise synthesizes Basic auth.
            // Only the explicit Authorization header may carry credentials.
            let _ = url.set_username("");
            let _ = url.set_password(None);
            let mut builder = client
                .request(method, url)
                .timeout(std::time::Duration::from_millis(request.timeout_ms.max(1)));
            if let Some(value) = request.authorization {
                builder = builder.header(reqwest::header::AUTHORIZATION, value)
            }
            if let Some(value) = request.accept {
                builder = builder.header(reqwest::header::ACCEPT, value)
            }
            let mut response = builder
                .send()
                .await
                .map_err(|error| request_error(error, request.reject_redirects))?;
            let status = response.status().as_u16();
            if request.reject_redirects
                && matches!(status, 301 | 302 | 303 | 307 | 308)
                && response.headers().contains_key(reqwest::header::LOCATION)
            {
                // Match Bun's rejected-redirect error without following the signed request.
                return Err(OllamaAuthError::transport(
                    "TypeError".into(),
                    format!(
                        "UnexpectedRedirect fetching \"{}\". For more information, pass `verbose: true` in the second argument to fetch()",
                        request.url
                    ),
                    None,
                ));
            }
            // Status failures do not consume an error body or allow its content into errors.
            if !(200..300).contains(&status) {
                return Ok(OllamaAuthResponse {
                    status,
                    body: Ok(Value::Null),
                });
            }
            let mut bytes = Vec::new();
            while let Some(chunk) = response
                .chunk()
                .await
                .map_err(|error| request_error(error, request.reject_redirects))?
            {
                if bytes.len() + chunk.len() > 2 * 1024 * 1024 {
                    return Err(OllamaAuthError::plain("Ollama response exceeds 2 MiB"));
                }
                bytes.extend_from_slice(&chunk);
            }
            let body = serde_json::from_slice(&bytes).map_err(|_| {
                OllamaAuthError::transport(
                    "SyntaxError".into(),
                    "Invalid JSON response".into(),
                    None,
                )
            });
            Ok(OllamaAuthResponse { status, body })
        })
    }
}
/// Quota/request-activity schema belongs to the separate quota-fetcher component.
pub type OllamaUsageValidator = Arc<dyn Fn(&Value) -> bool + Send + Sync>;
pub struct OllamaDeviceAuth {
    transport: Arc<dyn OllamaAuthTransport>,
    reader: Arc<dyn OllamaDeviceKeyReader>,
    host: UsageHost,
    clock: Clock,
    validate_usage: OllamaUsageValidator,
}
impl OllamaDeviceAuth {
    pub fn new(
        transport: Arc<dyn OllamaAuthTransport>,
        reader: Arc<dyn OllamaDeviceKeyReader>,
        host: UsageHost,
        validate_usage: OllamaUsageValidator,
    ) -> Self {
        Self {
            transport,
            reader,
            host,
            clock: default_clock(),
            validate_usage,
        }
    }
    pub fn standard(
        transport: Arc<dyn OllamaAuthTransport>,
        reader: Arc<dyn OllamaDeviceKeyReader>,
        host: UsageHost,
    ) -> Self {
        Self::new(
            transport,
            reader,
            host,
            Arc::new(crate::services::provider_quota_fetchers::is_ollama_usage_response),
        )
    }
    pub fn with_clock(mut self, clock: Clock) -> Self {
        self.clock = clock;
        self
    }
    async fn read_key(&self) -> Result<OllamaDeviceKey, OllamaAuthError> {
        for path in ollama_device_key_paths(&self.host) {
            match self.reader.read(&path).await {
                Err(_) => continue,
                Ok(DeviceKeyRead::Pem(pem)) => return parse_ollama_device_key(&pem),
                Ok(DeviceKeyRead::Invalid) => return Err(invalid_key()),
            }
        }
        Err(OllamaAuthError::plain(UNREADABLE_KEY))
    }
    async fn signed_request(
        &self,
        key: &OllamaDeviceKey,
        method: &'static str,
        path: &str,
    ) -> Result<Value, OllamaAuthError> {
        let timestamp = (self.clock)().div_euclid(1000).to_string();
        let request = OllamaAuthRequest {
            url: format!("https://ollama.com{path}?ts={timestamp}"),
            method,
            authorization: Some(sign_ollama_request(key, method, path, &timestamp)),
            accept: Some("application/json"),
            reject_redirects: true,
            timeout_ms: 10_000,
        };
        let response = self.transport.send(request).await?;
        if !(200..300).contains(&response.status) {
            return Err(OllamaAuthError::usage(
                format!(
                    "Ollama device authentication request failed ({})",
                    response.status
                ),
                response.status,
            ));
        }
        response.body
    }
    pub async fn fetch_ollama_device_usage(
        &self,
        account: &OllamaCloudAccount,
        key: Option<&OllamaDeviceKey>,
    ) -> Result<Value, OllamaAuthError> {
        let loaded;
        let key = if let Some(key) = key {
            key
        } else {
            loaded = self.read_key().await?;
            &loaded
        };
        let body = self.signed_request(key, "POST", "/api/me").await?;
        let field = |a: &str, b: &str| body.get(a).filter(|v| !v.is_null()).or_else(|| body.get(b));
        let matches = if let Some(email) = account.email.as_deref().filter(|v| !v.is_empty()) {
            field("email", "Email").and_then(Value::as_str) == Some(email)
        } else {
            account
                .name
                .as_deref()
                .filter(|v| !v.is_empty())
                .is_some_and(|name| field("name", "Name").and_then(Value::as_str) == Some(name))
        };
        if !matches {
            return Err(OllamaAuthError::plain(ACCOUNT_MISMATCH));
        }
        let usage = self.signed_request(key, "GET", "/api/usage").await?;
        if !(self.validate_usage)(&usage) {
            return Err(OllamaAuthError::plain(
                "Ollama returned an unexpected usage response",
            ));
        }
        Ok(usage)
    }
    pub async fn fetch_signed_in_ollama_usage(
        &self,
        base_url: &str,
        account: &OllamaCloudAccount,
    ) -> Result<Value, OllamaAuthError> {
        let base = js_trim(base_url);
        let base = if base.is_empty() {
            "https://ollama.com"
        } else {
            base
        }
        .trim_end_matches('/');
        let request = OllamaAuthRequest {
            url: format!("{base}/api/usage"),
            method: "GET",
            authorization: None,
            accept: None,
            reject_redirects: false,
            timeout_ms: 10_000,
        };
        let initial = match self.transport.send(request).await {
            Ok(response) if (200..300).contains(&response.status) => {
                response.body.and_then(|body| {
                    if (self.validate_usage)(&body) {
                        Ok(body)
                    } else {
                        Err(OllamaAuthError::plain(
                            "Ollama returned an unexpected usage response",
                        ))
                    }
                })
            }
            Ok(response) => Err(OllamaAuthError::usage(
                format!("Ollama usage request failed ({})", response.status),
                response.status,
            )),
            Err(error) => Err(error),
        };
        match initial {
            Err(error)
                if error.kind == AuthErrorKind::UsageHttp
                    && error.status == Some(404)
                    && is_local_ollama_url(base_url) =>
            {
                self.fetch_ollama_device_usage(account, None).await
            }
            other => other,
        }
    }
}
