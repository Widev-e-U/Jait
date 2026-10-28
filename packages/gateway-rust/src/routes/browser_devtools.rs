//! Browser DevTools routes: CDP panel grants plus the guarded frontend proxy.
//!
//! Ports `packages/gateway/src/routes/browser-devtools.ts`:
//!
//! | method | path                                              | auth                     |
//! |--------|---------------------------------------------------|--------------------------|
//! | POST   | `/api/preview/devtools`                           | bearer/cookie session    |
//! | DELETE | `/api/preview/devtools/{grantId}`                 | bearer/cookie session    |
//! | GET    | `/preview/{previewToken}/devtools/{grantId}/{*asset}` | scoped preview token |
//!
//! Security properties preserved from the TypeScript implementation:
//!
//! * a panel grant is only created for a session the caller owns, and only when
//!   both the session service and the CDP host can vouch for it,
//! * the target id is restricted to `[A-Za-z0-9-]+` and the endpoint must be a
//!   plain `http(s)` origin, so a grant can never be pointed at discovery
//!   endpoints or the filesystem,
//! * at most 64 live grants, each valid for one hour; expired grants are purged
//!   on every create,
//! * asset paths are allow-listed by extension and rejected when they contain
//!   empty, `.` or `..` segments,
//! * proxied assets are capped at 12 MiB and fetched without following
//!   redirects and with a 15 s timeout,
//! * every asset response is served `Cache-Control: no-store`,
//!   `Referrer-Policy: no-referrer` and `X-Content-Type-Options: nosniff`,
//! * nothing about tokens, target ids or asset bodies is ever logged.
//!
//! The upstream `WebSocket` upgrade in the TypeScript source cannot be expressed
//! with the HTTP-only axum feature set this crate compiles against, so
//! `/socket` performs the exact same grant/token/activity checks and then
//! answers `501` with an explicit error body instead of upgrading. See the
//! handoff notes for that approximation.

use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use axum::body::{Body, Bytes};
use axum::extract::{Path, State};
use axum::http::{header, HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{delete, get, post};
use axum::Router;
use futures_util::StreamExt;
use serde_json::{json, Value};

use super::auth::{self, AuthState};
use crate::security::http_auth::AuthUser;
use crate::security::preview_token::{sign_preview_token, verify_preview_token};

/// A panel grant lives for one hour, matching the TypeScript route.
const GRANT_TTL_MS: u64 = 60 * 60 * 1000;
/// At most 64 live panels; the 65th request is answered with `429`.
const MAX_GRANTS: usize = 64;
/// Proxied frontend assets are bounded to 12 MiB.
const ASSET_LIMIT_BYTES: usize = 12 * 1024 * 1024;
/// Upstream asset requests time out after 15 s.
const ASSET_TIMEOUT: Duration = Duration::from_secs(15);
/// Extensions the CDP frontend actually ships.
const ASSET_EXTENSIONS: [&str; 13] = [
    ".html", ".js", ".css", ".json", ".svg", ".png", ".jpg", ".woff", ".woff2", ".ttf", ".wasm",
    ".map", ".ico",
];

/// A CDP target a panel may attach to, as reported by the preview service.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DevToolsConnection {
    pub browser_id: String,
    pub revision: String,
    pub target_id: String,
    pub endpoint: String,
}

/// Identity of a browser control claim, used to re-validate a grant.
pub struct DevToolsActiveQuery<'a> {
    pub session_id: &'a str,
    pub browser_id: &'a str,
    pub revision: &'a str,
}

/// Port of `deps.previewService.getDevToolsConnection` /
/// `deps.previewService.isDevToolsConnectionActive`.
pub trait DevToolsHost: Send + Sync {
    /// `None` when the session has no live browser with DevTools enabled.
    fn connection(&self, session_id: &str) -> Option<DevToolsConnection>;
    /// `false` once the browser control claim moved on (restart, revision bump).
    fn is_active(&self, query: &DevToolsActiveQuery<'_>) -> bool;
}

/// Port of `deps.sessionService.getById(session_id, user.id)`.
pub trait SessionLookup: Send + Sync {
    fn owned(&self, session_id: &str, user_id: &str) -> Result<bool, String>;
}

/// A fetched upstream asset; `status` is passed through for non-2xx replies.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct UpstreamAsset {
    pub status: u16,
    pub content_type: Option<String>,
    pub body: Vec<u8>,
}

/// Failure modes of the upstream frontend proxy.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum UpstreamFailure {
    /// Transport error, TLS error, timeout or unparsable URL.
    Unavailable,
    /// The asset exceeded [`ASSET_LIMIT_BYTES`].
    TooLarge,
}

pub type AssetFetch<'a> =
    Pin<Box<dyn Future<Output = Result<UpstreamAsset, UpstreamFailure>> + Send + 'a>>;

/// Source of CDP frontend assets. Injected so the proxy can be tested without
/// network access and so deployments can pin an explicit frontend origin.
pub trait DevToolsAssetSource: Send + Sync {
    fn fetch(&self, endpoint: &str, asset: &str) -> AssetFetch<'_>;
}

/// Absolute upstream URL for `asset`, mirroring
/// `new URL("/devtools/" + asset, grant.endpoint)`.
pub fn asset_url(endpoint: &str, asset: &str) -> String {
    format!("{}/devtools/{}", endpoint.trim_end_matches('/'), asset)
}

/// Streaming HTTP asset source: no redirects, 15 s timeout, 12 MiB cap.
pub struct HttpAssetSource {
    client: reqwest::Client,
}

impl Default for HttpAssetSource {
    fn default() -> Self {
        Self::new()
    }
}

impl HttpAssetSource {
    pub fn new() -> Self {
        let client = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .timeout(ASSET_TIMEOUT)
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());
        Self { client }
    }
}

impl DevToolsAssetSource for HttpAssetSource {
    fn fetch(&self, endpoint: &str, asset: &str) -> AssetFetch<'_> {
        let url = asset_url(endpoint, asset);
        Box::pin(async move {
            let response = self
                .client
                .get(&url)
                .send()
                .await
                .map_err(|_| UpstreamFailure::Unavailable)?;
            let status = response.status().as_u16();
            let content_type = response
                .headers()
                .get(header::CONTENT_TYPE)
                .and_then(|value| value.to_str().ok())
                .map(str::to_string);
            if !response.status().is_success() {
                return Ok(UpstreamAsset {
                    status,
                    content_type,
                    body: Vec::new(),
                });
            }
            if response
                .content_length()
                .is_some_and(|length| length > ASSET_LIMIT_BYTES as u64)
            {
                return Err(UpstreamFailure::TooLarge);
            }
            let mut body = Vec::new();
            let mut stream = response.bytes_stream();
            while let Some(chunk) = stream.next().await {
                let chunk: Bytes = chunk.map_err(|_| UpstreamFailure::Unavailable)?;
                if body.len() + chunk.len() > ASSET_LIMIT_BYTES {
                    return Err(UpstreamFailure::TooLarge);
                }
                body.extend_from_slice(&chunk);
            }
            Ok(UpstreamAsset {
                status,
                content_type,
                body,
            })
        })
    }
}

/// A live panel grant. Mirrors the TypeScript `grants` map value.
#[derive(Clone, Debug, PartialEq, Eq)]
struct Grant {
    session_id: String,
    user_id: String,
    browser_id: String,
    revision: String,
    target_id: String,
    endpoint: String,
    expires_at: u64,
}

impl Grant {
    fn active(&self, now: u64) -> bool {
        self.expires_at > now && !self.endpoint.is_empty() && !self.target_id.is_empty()
    }
}

#[derive(Default)]
struct Grants {
    entries: HashMap<String, Grant>,
}

impl Grants {
    fn purge_inactive(&mut self, now: u64) {
        self.entries.retain(|_, grant| grant.active(now));
    }

    fn len(&self) -> usize {
        self.entries.len()
    }
}

type Clock = Arc<dyn Fn() -> u64 + Send + Sync>;

fn system_clock() -> Clock {
    Arc::new(|| {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|elapsed| elapsed.as_millis() as u64)
            .unwrap_or(0)
    })
}

/// `^[a-zA-Z0-9-]+$` — CDP target ids only.
pub fn valid_target_id(target_id: &str) -> bool {
    !target_id.is_empty()
        && target_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
}

/// The grant endpoint is always a plain `http(s)` origin without userinfo,
/// query or fragment, so it can only reach a browser's CDP listener.
pub fn valid_endpoint(endpoint: &str) -> bool {
    let Some(rest) = endpoint
        .strip_prefix("http://")
        .or_else(|| endpoint.strip_prefix("https://"))
    else {
        return false;
    };
    if rest.is_empty() || rest.contains('@') || rest.contains('?') || rest.contains('#') {
        return false;
    }
    let authority = rest.split('/').next().unwrap_or("");
    !authority.is_empty() && !authority.chars().any(char::is_whitespace)
}

/// Asset path guard: no empty/`.`/`..` segments, restricted charset and an
/// allow-listed extension. Returns the normalised asset path.
pub fn validate_asset(asset: &str) -> Option<&str> {
    if asset.is_empty() || asset.len() > 512 {
        return None;
    }
    if asset.starts_with('/') || asset.contains('\\') || asset.contains('\0') {
        return None;
    }
    for segment in asset.split('/') {
        if segment.is_empty() || segment == "." || segment == ".." {
            return None;
        }
        if !segment
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'.' | b'-'))
        {
            return None;
        }
    }
    let lower = asset.to_ascii_lowercase();
    if !ASSET_EXTENSIONS
        .iter()
        .any(|extension| lower.ends_with(extension))
    {
        return None;
    }
    Some(asset)
}

/// Shared state for the devtools routes.
#[derive(Clone)]
pub struct BrowserDevToolsState {
    auth: AuthState,
    jwt_secret: Arc<String>,
    sessions: Option<Arc<dyn SessionLookup>>,
    host: Option<Arc<dyn DevToolsHost>>,
    assets: Arc<dyn DevToolsAssetSource>,
    grants: Arc<Mutex<Grants>>,
    clock: Clock,
}

impl BrowserDevToolsState {
    /// Without a session lookup and CDP host every panel request answers
    /// `404`, exactly like the TypeScript route with absent deps.
    pub fn new(auth: AuthState, jwt_secret: impl Into<String>) -> Self {
        Self {
            auth,
            jwt_secret: Arc::new(jwt_secret.into()),
            sessions: None,
            host: None,
            assets: Arc::new(HttpAssetSource::new()),
            grants: Arc::new(Mutex::new(Grants::default())),
            clock: system_clock(),
        }
    }

    pub fn with_sessions(mut self, sessions: Arc<dyn SessionLookup>) -> Self {
        self.sessions = Some(sessions);
        self
    }

    pub fn with_host(mut self, host: Arc<dyn DevToolsHost>) -> Self {
        self.host = Some(host);
        self
    }

    pub fn with_asset_source(mut self, assets: Arc<dyn DevToolsAssetSource>) -> Self {
        self.assets = assets;
        self
    }

    pub fn with_clock(mut self, clock: Clock) -> Self {
        self.clock = clock;
        self
    }

    pub fn router(self) -> Router {
        Router::new()
            .route("/api/preview/devtools", post(Self::create))
            .route("/api/preview/devtools/{grant_id}", delete(Self::revoke))
            .route(
                "/preview/{preview_token}/devtools/{grant_id}/{*asset}",
                get(Self::asset),
            )
            .with_state(self)
    }

    fn now(&self) -> u64 {
        (self.clock)()
    }

    fn grants(&self) -> MutexGuard<'_, Grants> {
        self.grants
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    /// `POST /api/preview/devtools`
    pub async fn create(State(state): State<Self>, headers: HeaderMap, body: Body) -> Response {
        let user = match auth::require_user(&state.auth, &headers).await {
            Ok(user) => user,
            Err(denial) => return *denial,
        };
        let body = match auth::parse_body(body, &headers).await {
            Ok(body) => body,
            Err(denial) => return *denial,
        };
        state.create_for(&user, &body)
    }

    /// Body handling split out so grants can be exercised without a database.
    pub fn create_for(&self, user: &AuthUser, body: &Value) -> Response {
        let Some(session_id) = body.get("sessionId") else {
            return invalid_body("body must have required property 'sessionId'");
        };
        let Some(session_id) = session_id.as_str() else {
            return invalid_body("body/sessionId must be string");
        };
        if session_id.is_empty() {
            return invalid_body("body/sessionId must NOT have fewer than 1 characters");
        }
        let Some(sessions) = self.sessions.as_ref() else {
            return session_not_found();
        };
        match sessions.owned(session_id, &user.id) {
            Ok(true) => {}
            Ok(false) => return session_not_found(),
            Err(_) => return auth::internal_error(),
        }
        let Some(host) = self.host.as_ref() else {
            return devtools_unavailable();
        };
        let Some(connection) = host.connection(session_id) else {
            return devtools_unavailable();
        };
        if !valid_target_id(&connection.target_id) {
            return auth::response(409, json!({"error":"Invalid browser target."}));
        }
        if !valid_endpoint(&connection.endpoint) {
            return auth::response(409, json!({"error":"Invalid browser endpoint."}));
        }
        let now = self.now();
        let id = uuid::Uuid::new_v4().simple().to_string();
        {
            let mut grants = self.grants();
            grants.purge_inactive(now);
            if grants.len() >= MAX_GRANTS {
                return auth::response(
                    429,
                    json!({"error":"Close an existing DevTools panel and try again."}),
                );
            }
            grants.entries.insert(
                id.clone(),
                Grant {
                    session_id: session_id.to_string(),
                    user_id: user.id.clone(),
                    browser_id: connection.browser_id,
                    revision: connection.revision,
                    target_id: connection.target_id,
                    endpoint: connection.endpoint,
                    expires_at: now + GRANT_TTL_MS,
                },
            );
        }
        let resource = format!("devtools:{id}");
        let Ok(token) = sign_preview_token(&user.id, &resource, &self.jwt_secret) else {
            return auth::internal_error();
        };
        let prefix = format!("/preview/{token}/devtools/{id}");
        let body = json!({
            "id": id,
            "url": format!("{prefix}/devtools_app.html"),
            "socketUrl": format!("{prefix}/socket"),
        });
        (StatusCode::OK, [(header::CACHE_CONTROL, "no-store")], axum::Json(body)).into_response()
    }

    /// `DELETE /api/preview/devtools/:grantId`
    pub async fn revoke(
        State(state): State<Self>,
        headers: HeaderMap,
        Path(grant_id): Path<String>,
    ) -> Response {
        let user = match auth::require_user(&state.auth, &headers).await {
            Ok(user) => user,
            Err(denial) => return *denial,
        };
        state.revoke_for(&user, &grant_id)
    }

    pub fn revoke_for(&self, user: &AuthUser, grant_id: &str) -> Response {
        let mut grants = self.grants();
        let owned = grants
            .entries
            .get(grant_id)
            .is_some_and(|grant| grant.user_id == user.id);
        if !owned {
            return auth::response(404, json!({"error":"DevTools panel not found"}));
        }
        grants.entries.remove(grant_id);
        StatusCode::NO_CONTENT.into_response()
    }

    /// `GET /preview/:previewToken/devtools/:grantId/*`
    pub async fn asset(
        State(state): State<Self>,
        Path((preview_token, grant_id, asset)): Path<(String, String, String)>,
    ) -> Response {
        state.serve(&preview_token, &grant_id, &asset).await
    }

    /// Token + grant + activity check, mirroring `authorized()` in TypeScript.
    fn authorized(&self, grant_id: &str, preview_token: &str) -> Option<Grant> {
        let resource = format!("devtools:{grant_id}");
        let user_id = verify_preview_token(preview_token, &resource, &self.jwt_secret)?;
        let grant = {
            let grants = self.grants();
            grants.entries.get(grant_id)?.clone()
        };
        if grant.user_id != user_id || !grant.active(self.now()) {
            return None;
        }
        let host = self.host.as_ref()?;
        let query = DevToolsActiveQuery {
            session_id: &grant.session_id,
            browser_id: &grant.browser_id,
            revision: &grant.revision,
        };
        if !host.is_active(&query) {
            return None;
        }
        Some(grant)
    }

    pub async fn serve(&self, preview_token: &str, grant_id: &str, asset: &str) -> Response {
        let Some(grant) = self.authorized(grant_id, preview_token) else {
            return auth::response(
                403,
                json!({"error":"DevTools access expired or browser control changed."}),
            );
        };
        // The socket upgrade shares the guarded prefix but is checked first so a
        // panel can never trade an asset request for a browser-control channel.
        if asset == "socket" {
            return auth::response(
                501,
                json!({"error":"DevTools socket proxy is not available in this build."}),
            );
        }
        // Never proxy discovery endpoints, arbitrary URLs or traversal segments.
        let Some(asset) = validate_asset(asset) else {
            return asset_not_found(404);
        };
        let upstream = self.assets.fetch(&grant.endpoint, asset).await;
        match upstream {
            Err(UpstreamFailure::TooLarge) => {
                auth::response(502, json!({"error":"DevTools asset too large"}))
            }
            Err(UpstreamFailure::Unavailable) => {
                auth::response(502, json!({"error":"DevTools frontend unavailable."}))
            }
            Ok(UpstreamAsset { status, .. }) if !(200..300).contains(&status) => {
                asset_not_found(status)
            }
            Ok(asset_response) => {
                // The browser control claim can move while the asset is in flight.
                let query = DevToolsActiveQuery {
                    session_id: &grant.session_id,
                    browser_id: &grant.browser_id,
                    revision: &grant.revision,
                };
                let still_active = self
                    .host
                    .as_ref()
                    .is_some_and(|host| host.is_active(&query));
                if !still_active {
                    return auth::response(403, json!({"error":"Browser control changed."}));
                }
                let content_type = asset_response
                    .content_type
                    .as_deref()
                    .and_then(sanitise_content_type)
                    .unwrap_or_else(|| "application/octet-stream".to_string());
                let mut response = Response::new(Body::from(asset_response.body));
                *response.status_mut() =
                    StatusCode::from_u16(asset_response.status).unwrap_or(StatusCode::OK);
                let headers = response.headers_mut();
                headers.insert(
                    header::CONTENT_TYPE,
                    header::HeaderValue::from_str(&content_type)
                        .unwrap_or_else(|_| header::HeaderValue::from_static("application/octet-stream")),
                );
                headers.insert(header::CACHE_CONTROL, header::HeaderValue::from_static("no-store"));
                headers.insert(header::REFERRER_POLICY, header::HeaderValue::from_static("no-referrer"));
                headers.insert(
                    header::X_CONTENT_TYPE_OPTIONS,
                    header::HeaderValue::from_static("nosniff"),
                );
                response
            }
        }
    }
}

/// Only plain, parameter-free MIME types are echoed back to the panel.
fn sanitise_content_type(value: &str) -> Option<String> {
    let value = value.trim();
    if value.is_empty() || value.len() > 128 {
        return None;
    }
    if !value
        .bytes()
        .all(|byte| byte.is_ascii_graphic() || byte == b' ' || byte == b'/')
    {
        return None;
    }
    Some(value.to_string())
}

fn invalid_body(message: &str) -> Response {
    auth::response(
        400,
        json!({"statusCode":400,"code":"FST_ERR_VALIDATION","error":"Bad Request","message":message}),
    )
}

fn session_not_found() -> Response {
    auth::response(404, json!({"error":"Session not found"}))
}

fn devtools_unavailable() -> Response {
    auth::response(404, json!({"error":"Chrome DevTools is unavailable for this browser."}))
}

fn asset_not_found(status: u16) -> Response {
    let status = if (400..600).contains(&status) { status } else { 404 };
    auth::response(status, json!({"error":"DevTools asset not found"}))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    use rusqlite::Connection;

    const SECRET: &str = "test-secret-with-enough-entropy-for-hmac";

    fn user() -> AuthUser {
        AuthUser {
            id: "user-1".into(),
            username: "owner".into(),
        }
    }

    struct FakeSessions {
        owner: Option<String>,
    }

    impl SessionLookup for FakeSessions {
        fn owned(&self, _session_id: &str, user_id: &str) -> Result<bool, String> {
            Ok(self.owner.as_deref() == Some(user_id))
        }
    }

    struct FakeHost {
        connection: Option<DevToolsConnection>,
        active: bool,
    }

    impl DevToolsHost for FakeHost {
        fn connection(&self, _session_id: &str) -> Option<DevToolsConnection> {
            self.connection.clone()
        }

        fn is_active(&self, _query: &DevToolsActiveQuery<'_>) -> bool {
            self.active
        }
    }

    #[derive(Default)]
    struct FakeAssets {
        calls: AtomicUsize,
        reply: Option<Result<UpstreamAsset, UpstreamFailure>>,
    }

    impl FakeAssets {
        fn with(reply: Result<UpstreamAsset, UpstreamFailure>) -> Arc<Self> {
            Arc::new(Self {
                calls: AtomicUsize::new(0),
                reply: Some(reply),
            })
        }

        fn calls(&self) -> usize {
            self.calls.load(Ordering::SeqCst)
        }
    }

    impl DevToolsAssetSource for FakeAssets {
        fn fetch(&self, _endpoint: &str, _asset: &str) -> AssetFetch<'_> {
            self.calls.fetch_add(1, Ordering::SeqCst);
            let reply = self.reply.clone().unwrap_or(Err(UpstreamFailure::Unavailable));
            Box::pin(async move { reply })
        }
    }

    fn connection() -> DevToolsConnection {
        DevToolsConnection {
            browser_id: "browser-1".into(),
            revision: "17".into(),
            target_id: "AB12-cd34".into(),
            endpoint: "http://127.0.0.1:9222".into(),
        }
    }

    fn state(assets: Arc<dyn DevToolsAssetSource>) -> BrowserDevToolsState {
        let auth = AuthState::new(Connection::open_in_memory().unwrap(), SECRET.to_string()).unwrap();
        BrowserDevToolsState::new(auth, SECRET)
            .with_sessions(Arc::new(FakeSessions {
                owner: Some("user-1".into()),
            }))
            .with_host(Arc::new(FakeHost {
                connection: Some(connection()),
                active: true,
            }))
            .with_asset_source(assets)
            .with_clock(Arc::new(|| 1_000))
    }

    fn insert_grant(state: &BrowserDevToolsState) -> String {
        let id = "grant-1".to_string();
        state.grants().entries.insert(
            id.clone(),
            Grant {
                session_id: "session-1".into(),
                user_id: "user-1".into(),
                browser_id: "browser-1".into(),
                revision: "17".into(),
                target_id: "AB12-cd34".into(),
                endpoint: "http://127.0.0.1:9222".into(),
                expires_at: 1_000 + GRANT_TTL_MS,
            },
        );
        id
    }

    fn token_for(grant_id: &str) -> String {
        sign_preview_token(&user().id, &format!("devtools:{grant_id}"), SECRET).unwrap()
    }

    async fn body_bytes(response: Response) -> String {
        let bytes = axum::body::to_bytes(response.into_body(), 1 << 20)
            .await
            .unwrap();
        String::from_utf8_lossy(&bytes).to_string()
    }

    // 1
    #[tokio::test]
    async fn create_without_credentials_is_denied() {
        let state = state(Arc::new(FakeAssets::default()));
        let response = BrowserDevToolsState::create(
            State(state),
            HeaderMap::new(),
            Body::from(r#"{"sessionId":"session-1"}"#),
        )
        .await;
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
        assert!(body_bytes(response).await.contains("login_required"));
    }

    // 2
    #[tokio::test]
    async fn revoke_without_credentials_is_denied() {
        let state = state(Arc::new(FakeAssets::default()));
        let response = BrowserDevToolsState::revoke(
            State(state),
            HeaderMap::new(),
            Path("grant-1".to_string()),
        )
        .await;
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    // 3
    #[tokio::test]
    async fn create_rejects_missing_and_empty_session_id() {
        let state = state(Arc::new(FakeAssets::default()));
        let missing = state.create_for(&user(), &json!({}));
        assert_eq!(missing.status(), StatusCode::BAD_REQUEST);
        assert!(body_bytes(missing).await.contains("required property 'sessionId'"));
        let empty = state.create_for(&user(), &json!({"sessionId": ""}));
        assert_eq!(empty.status(), StatusCode::BAD_REQUEST);
    }

    // 4
    #[tokio::test]
    async fn create_rejects_unknown_session() {
        let auth = AuthState::new(Connection::open_in_memory().unwrap(), SECRET.to_string()).unwrap();
        let state = BrowserDevToolsState::new(auth, SECRET)
            .with_sessions(Arc::new(FakeSessions { owner: None }))
            .with_host(Arc::new(FakeHost {
                connection: Some(connection()),
                active: true,
            }));
        let response = state.create_for(&user(), &json!({"sessionId": "session-1"}));
        assert_eq!(response.status(), StatusCode::NOT_FOUND);
        assert!(body_bytes(response).await.contains("Session not found"));
    }

    // 5
    #[tokio::test]
    async fn create_returns_not_found_when_cdp_host_is_missing() {
        let auth = AuthState::new(Connection::open_in_memory().unwrap(), SECRET.to_string()).unwrap();
        let state = BrowserDevToolsState::new(auth, SECRET).with_sessions(Arc::new(FakeSessions {
            owner: Some("user-1".into()),
        }));
        let response = state.create_for(&user(), &json!({"sessionId": "session-1"}));
        assert_eq!(response.status(), StatusCode::NOT_FOUND);
        assert!(body_bytes(response).await.contains("Chrome DevTools is unavailable"));
    }

    // 6
    #[tokio::test]
    async fn create_rejects_unsafe_target_id_and_endpoint() {
        let auth = AuthState::new(Connection::open_in_memory().unwrap(), SECRET.to_string()).unwrap();
        for connection in [
            DevToolsConnection {
                target_id: "../etc/passwd".into(),
                ..connection()
            },
            DevToolsConnection {
                target_id: String::new(),
                ..connection()
            },
            DevToolsConnection {
                endpoint: "file:///etc/passwd".into(),
                ..connection()
            },
            DevToolsConnection {
                endpoint: "http://user:pw@127.0.0.1:9222".into(),
                ..connection()
            },
        ] {
            let state = BrowserDevToolsState::new(auth.clone(), SECRET)
                .with_sessions(Arc::new(FakeSessions {
                    owner: Some("user-1".into()),
                }))
                .with_host(Arc::new(FakeHost {
                    connection: Some(connection),
                    active: true,
                }));
            let response = state.create_for(&user(), &json!({"sessionId": "session-1"}));
            assert_eq!(response.status(), StatusCode::CONFLICT);
        }
    }

    // 7
    #[tokio::test]
    async fn create_issues_urls_and_enforces_grant_cap() {
        let state = state(Arc::new(FakeAssets::default()));
        let response = state.create_for(&user(), &json!({"sessionId": "session-1"}));
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response.headers().get(header::CACHE_CONTROL).unwrap(),
            "no-store"
        );
        let body = body_bytes(response).await;
        assert!(body.contains("\"url\":\"/preview/"));
        assert!(body.contains("/devtools_app.html\""));
        assert!(body.contains("\"socketUrl\":\"/preview/"));
        assert_eq!(state.grants().len(), 1);

        let template = state.grants().entries.values().next().unwrap().clone();
        {
            let mut grants = state.grants();
            for index in 0..(MAX_GRANTS - 1) {
                grants.entries.insert(
                    format!("filler-{index}"),
                    Grant {
                        expires_at: 5_000,
                        ..template.clone()
                    },
                );
            }
        }
        let capped = state.create_for(&user(), &json!({"sessionId": "session-1"}));
        assert_eq!(capped.status(), StatusCode::TOO_MANY_REQUESTS);
        assert!(body_bytes(capped).await.contains("Close an existing DevTools panel"));
    }

    // 8
    #[tokio::test]
    async fn revoke_only_deletes_owned_grants() {
        let state = state(Arc::new(FakeAssets::default()));
        let grant_id = insert_grant(&state);
        let stranger = AuthUser {
            id: "user-2".into(),
            username: "stranger".into(),
        };
        let denied = state.revoke_for(&stranger, &grant_id);
        assert_eq!(denied.status(), StatusCode::NOT_FOUND);
        assert_eq!(state.grants().len(), 1);
        let removed = state.revoke_for(&user(), &grant_id);
        assert_eq!(removed.status(), StatusCode::NO_CONTENT);
        assert_eq!(state.grants().len(), 0);
    }

    // 9
    #[tokio::test]
    async fn asset_requires_matching_preview_token() {
        let state = state(Arc::new(FakeAssets::default()));
        let grant_id = insert_grant(&state);
        let no_token = state.serve("", &grant_id, "devtools_app.html").await;
        assert_eq!(no_token.status(), StatusCode::FORBIDDEN);
        assert!(body_bytes(no_token).await.contains("DevTools access expired"));

        let other = sign_preview_token(&user().id, "devtools:other-grant", SECRET).unwrap();
        let foreign = state.serve(&other, &grant_id, "devtools_app.html").await;
        assert_eq!(foreign.status(), StatusCode::FORBIDDEN);

        let other_user = sign_preview_token("user-2", &format!("devtools:{grant_id}"), SECRET).unwrap();
        let stolen = state.serve(&other_user, &grant_id, "devtools_app.html").await;
        assert_eq!(stolen.status(), StatusCode::FORBIDDEN);
    }

    // 10
    #[tokio::test]
    async fn asset_denies_expired_grant_and_changed_browser_control() {
        let state = state(Arc::new(FakeAssets::default()));
        let grant_id = insert_grant(&state);
        let token = token_for(&grant_id);

        {
            let mut grants = state.grants();
            grants.entries.get_mut(&grant_id).unwrap().expires_at = 999;
        }
        let expired = state.serve(&token, &grant_id, "devtools_app.html").await;
        assert_eq!(expired.status(), StatusCode::FORBIDDEN);

        let stale = BrowserDevToolsState::new(
            AuthState::new(Connection::open_in_memory().unwrap(), SECRET.to_string()).unwrap(),
            SECRET,
        )
        .with_host(Arc::new(FakeHost {
            connection: Some(connection()),
            active: false,
        }))
        .with_clock(Arc::new(|| 1_000));
        let grant_id = insert_grant(&stale);
        let token = token_for(&grant_id);
        let changed = stale.serve(&token, &grant_id, "devtools_app.html").await;
        assert_eq!(changed.status(), StatusCode::FORBIDDEN);
    }

    // 11
    #[tokio::test]
    async fn asset_rejects_traversal_and_disallowed_extensions() {
        let assets = FakeAssets::with(Ok(UpstreamAsset {
            status: 200,
            content_type: Some("text/html".into()),
            body: b"<html></html>".to_vec(),
        }));
        let state = state(assets.clone());
        let grant_id = insert_grant(&state);
        let token = token_for(&grant_id);
        for asset in [
            "../../etc/passwd",
            "..%2fsecret.html",
            "devtools_app.html/../../x",
            "/absolute.html",
            "notes.txt",
            "empty//x.html",
            "..",
        ] {
            let response = state.serve(&token, &grant_id, asset).await;
            assert_eq!(response.status(), StatusCode::NOT_FOUND, "asset {asset}");
        }
        assert_eq!(assets.calls(), 0, "guarded paths must never reach upstream");
    }

    // 12
    #[tokio::test]
    async fn asset_streams_allowed_asset_with_hardening_headers() {
        let assets = FakeAssets::with(Ok(UpstreamAsset {
            status: 200,
            content_type: Some("text/html; charset=utf-8".into()),
            body: b"<!doctype html>".to_vec(),
        }));
        let state = state(assets);
        let grant_id = insert_grant(&state);
        let token = token_for(&grant_id);
        let response = state.serve(&token, &grant_id, "devtools_app.html").await;
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response.headers().get(header::CONTENT_TYPE).unwrap(),
            "text/html; charset=utf-8"
        );
        assert_eq!(
            response.headers().get(header::CACHE_CONTROL).unwrap(),
            "no-store"
        );
        assert_eq!(
            response.headers().get(header::REFERRER_POLICY).unwrap(),
            "no-referrer"
        );
        assert_eq!(
            response.headers().get(header::X_CONTENT_TYPE_OPTIONS).unwrap(),
            "nosniff"
        );
        assert_eq!(body_bytes(response).await, "<!doctype html>");
    }

    // 13
    #[tokio::test]
    async fn asset_maps_upstream_failures() {
        let not_found = FakeAssets::with(Ok(UpstreamAsset {
            status: 404,
            content_type: None,
            body: Vec::new(),
        }));
        let svc = state(not_found);
        let grant_id = insert_grant(&svc);
        let token = token_for(&grant_id);
        let response = svc.serve(&token, &grant_id, "inspector.html").await;
        assert_eq!(response.status(), StatusCode::NOT_FOUND);
        assert!(body_bytes(response).await.contains("DevTools asset not found"));

        for (failure, message) in [
            (UpstreamFailure::TooLarge, "DevTools asset too large"),
            (UpstreamFailure::Unavailable, "DevTools frontend unavailable."),
        ] {
            let svc = state(FakeAssets::with(Err(failure)));
            let grant_id = insert_grant(&svc);
            let token = token_for(&grant_id);
            let response = svc.serve(&token, &grant_id, "inspector.html").await;
            assert_eq!(response.status(), StatusCode::BAD_GATEWAY);
            assert!(body_bytes(response).await.contains(message));
        }
    }

    // 14
    #[tokio::test]
    async fn socket_upgrade_requires_a_live_grant() {
        let state = state(Arc::new(FakeAssets::default()));
        let grant_id = insert_grant(&state);
        let denied = state.serve("bogus", &grant_id, "socket").await;
        assert_eq!(denied.status(), StatusCode::FORBIDDEN);
        let token = token_for(&grant_id);
        let guarded = state.serve(&token, &grant_id, "socket").await;
        assert_eq!(guarded.status(), StatusCode::NOT_IMPLEMENTED);
        assert!(body_bytes(guarded).await.contains("socket proxy is not available"));
    }

    // 15
    #[tokio::test]
    async fn target_and_endpoint_validators_reject_unsafe_input() {
        assert!(valid_target_id("AB12-cd34"));
        assert!(!valid_target_id(""));
        assert!(!valid_target_id("a/b"));
        assert!(!valid_target_id("a b"));
        assert!(valid_endpoint("http://127.0.0.1:9222"));
        assert!(valid_endpoint("https://browser.internal:9222/"));
        assert!(!valid_endpoint("ws://127.0.0.1:9222"));
        assert!(!valid_endpoint("http://"));
        assert!(!valid_endpoint("http://host?x=1"));
        assert!(validate_asset("devtools_app.js").is_some());
        assert!(validate_asset("panels/console/console.js").is_some());
        assert!(validate_asset("../escape.js").is_none());
        assert!(validate_asset("shell.bin").is_none());
    }
}
