//! Partial credential-service candidate. No production mount or component credit.
//! Uses the bounded shared database worker, native encrypted secrets and an
//! explicit outbound effect. Complete host composition remains under review.
use super::{
    agent_github_challenge::{self as challenge, Binding, Owner},
    user_secrets::{SaveSecretParams, UserSecretService},
};
use crate::{
    contracts::bounded_json::Utf16Text,
    db::{
        identifiers::uuidv7,
        worker::{DatabaseError, DatabaseWorker},
    },
    text::js_trim,
    time::{Clock, iso},
};
use base64::{
    Engine, alphabet,
    engine::{
        DecodePaddingMode, GeneralPurpose, GeneralPurposeConfig, general_purpose::URL_SAFE_NO_PAD,
    },
};
use futures_util::future::BoxFuture;
use jsonwebtoken::{Algorithm, EncodingKey, crypto};
use rsa::{
    RsaPrivateKey,
    pkcs1::{DecodeRsaPrivateKey, EncodeRsaPrivateKey},
    pkcs8::DecodePrivateKey,
};
use rusqlite::{Connection, OptionalExtension, Transaction, TransactionBehavior, params};
use serde::Serialize;
use serde_json::{Map, Value, json};
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
    time::Duration,
};
use subtle::ConstantTimeEq;

type Error = Box<dyn std::error::Error + Send + Sync>;
fn database_error(error: DatabaseError) -> Error {
    match error {
        DatabaseError::Operation(error) => error,
        other => Box::new(other),
    }
}
fn fail(message: &str) -> Error {
    std::io::Error::other(message).into()
}
fn truthy(v: &Value) -> bool {
    match v {
        Value::Null => false,
        Value::Bool(v) => *v,
        Value::String(v) => !v.is_empty(),
        Value::Number(v) => v.as_f64().is_some_and(|v| v != 0.0),
        _ => true,
    }
}
fn pem(value: &str) -> String {
    js_trim(&value.replace("\r\n", "\n")).into()
}
fn key(agent: &str) -> String {
    format!("agent:{agent}")
}

#[derive(Serialize)]
pub struct GithubManifest {
    pub name: Utf16Text,
    #[serde(flatten)]
    pub fields: Map<String, Value>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SetupStart {
    pub agent_id: String,
    pub state: String,
    pub post_url: String,
    pub redirect_url: String,
    pub manifest: GithubManifest,
    pub has_credentials: bool,
}
fn encode(value: &str) -> String {
    url::form_urlencoded::byte_serialize(value.as_bytes())
        .collect::<String>()
        .replace('+', "%20")
        .replace("%21", "!")
        .replace("%27", "'")
        .replace("%28", "(")
        .replace("%29", ")")
        .replace("%7E", "~")
}

/// Outbound host capability. No ambient client or production authority is created.
/// The host must stream within `max_response_bytes`, enforce destination policy,
/// disable redirects/proxies, and cancel I/O when this future is dropped.
/// This service enforces an additional deadline and response-size postcondition.
/// Deliberately no Debug implementation: headers can carry credentials.
pub struct GithubRequest {
    pub user: String,
    pub agent: String,
    pub url: String,
    pub method: &'static str,
    pub headers: Vec<(String, String)>,
    pub timeout: Duration,
    pub max_response_bytes: usize,
    pub follow_redirects: bool,
}
pub struct GithubResponse {
    pub status: u16,
    pub body: Vec<u8>,
}
pub type GithubEffect =
    Arc<dyn Fn(GithubRequest) -> BoxFuture<'static, Result<GithubResponse, String>> + Send + Sync>;
const RESPONSE_LIMIT: usize = 1024 * 1024;
const REQUEST_TIMEOUT: Duration = Duration::from_secs(15);
/// Installation tokens are treated as expired this long before GitHub's
/// `expires_at`, matching the reference service's skew.
const TOKEN_SKEW_MS: i64 = 60_000;
/// GitHub issues one-hour installation tokens. When `expires_at` is absent or
/// unparseable the reference caches for 30 minutes; mirror that fallback.
const TOKEN_FALLBACK_MS: i64 = 30 * 60_000;
// Per-service cache budgets include dynamic owner, identity and grant payloads.
// Eviction changes only reuse; a miss follows the existing authorized mint path.
const TOKEN_CACHE_MAX_ENTRIES: usize = 256;
const TOKEN_CACHE_MAX_PAYLOAD_BYTES: usize = 4 * 1024 * 1024;

/// Cached installation token, bound to the credential identity it was minted
/// from so a rotated App or re-installation can never reuse a stale token.
struct CachedToken {
    token: String,
    expires_at: i64,
    app_id: String,
    installation_id: String,
    permissions: Value,
    repository_selection: Value,
    payload_bytes: usize,
}

/// Structured failures retain the reference distinction: 403 is an error,
/// while 401/404 reject credentials. The message suffix also applies to 403.
#[derive(Debug, PartialEq, Eq)]
pub struct GithubFailure {
    pub status: u16,
    pub message: String,
    pub credential_rejected: bool,
}
impl GithubFailure {
    fn transport(message: String) -> Self {
        Self {
            status: 0,
            message: format!("Could not reach GitHub: {message}"),
            credential_rejected: false,
        }
    }
}
/// The shared bounded outbound phase owns its request and never borrows SQLite.
/// Dropping this future drops the host request; no retry or detached work exists.
pub async fn github_request(
    request: GithubRequest,
    effect: &GithubEffect,
) -> Result<Value, GithubFailure> {
    let limit = request.max_response_bytes.min(RESPONSE_LIMIT);
    let response = tokio::time::timeout(request.timeout, effect(request))
        .await
        .map_err(|_| GithubFailure::transport("request timed out".into()))?
        .map_err(GithubFailure::transport)?;
    if response.body.len() > limit {
        return Err(GithubFailure::transport(
            "response exceeds byte limit".into(),
        ));
    }
    // WHATWG Response.text() uses replacement decoding and consumes one UTF-8 BOM.
    let text = String::from_utf8_lossy(&response.body);
    let text = text.strip_prefix('\u{feff}').unwrap_or(&text);
    let data = serde_json::from_str::<Value>(text).unwrap_or(Value::Null);
    if (200..300).contains(&response.status) {
        return Ok(if data.is_null() { json!({}) } else { data });
    }
    let mut message = data
        .as_object()
        .and_then(|o| o.get("message"))
        .map(js_string)
        .unwrap_or_else(|| format!("GitHub returned {}", response.status));
    if matches!(response.status, 401 | 403 | 404) {
        message.push_str(" (GitHub rejected the stored credentials; the App may have been deleted or uninstalled)");
    }
    Err(GithubFailure {
        status: response.status,
        message,
        credential_rejected: matches!(response.status, 401 | 404),
    })
}

// The prepared/completed states are deliberately opaque and do not implement
// Debug: requests, result data and revision snapshots may contain credentials.
enum GithubCallKind {
    Manifest,
    Installation,
    /// Post-installation access-token mint. The response also carries the
    /// permission and repository-selection grants for the installation.
    Token,
    /// Authorised repository listing used by the connection test.
    Repositories {
        minted: Value,
    },
}
struct GithubCallState {
    user: String,
    agent: String,
    stored: Value,
    revision: Value,
    kind: GithubCallKind,
}
pub struct PreparedGithubCall {
    state: GithubCallState,
    request: GithubRequest,
}
pub enum GithubTokenProgress {
    Cached(Value, Value),
    Request(Box<PreparedGithubCall>),
}
/// One state-bound callback journey. Entry adapters parse query admission before
/// constructing this request; signed owner fields are checked again by the service.
#[derive(Clone, Debug)]
pub struct GithubSetupCallback {
    pub user: String,
    pub agent: String,
    pub state: String,
    pub code: Option<String>,
    pub installation: Option<String>,
}
enum PreparedSetupPhase {
    Replay(Value),
    Request(Box<(PreparedGithubCall, challenge::Dispatched)>),
}
pub struct CompletedGithubCall {
    state: GithubCallState,
    result: Result<Value, GithubFailure>,
}
impl PreparedGithubCall {
    /// Network-only phase: the future is Send and does not own a DB connection.
    pub async fn execute(self, effect: &GithubEffect) -> CompletedGithubCall {
        let result = github_request(self.request, effect).await;
        CompletedGithubCall {
            state: self.state,
            result,
        }
    }
}

// Verification retains private state between two sequential requests. Neither
// the state nor the request wrappers expose credentials through Debug.
struct VerificationState {
    user: String,
    agent: String,
    stored: Value,
    revision: Value,
    app: Option<Value>,
}
pub struct PreparedGithubVerification {
    state: VerificationState,
    request: GithubRequest,
}
pub struct CompletedGithubVerification {
    state: VerificationState,
    result: Result<Value, GithubFailure>,
}
pub enum GithubVerificationProgress {
    Request(Box<PreparedGithubVerification>),
    Complete(Value),
}
impl PreparedGithubVerification {
    pub async fn execute(self, effect: &GithubEffect) -> CompletedGithubVerification {
        let result = github_request(self.request, effect).await;
        CompletedGithubVerification {
            state: self.state,
            result,
        }
    }
}

/// RS256 App authentication, backdated 60 seconds and valid for 540 seconds.
pub fn build_app_jwt(app: &str, private_key: &str, now_ms: i64) -> Result<String, Error> {
    #[derive(Serialize)]
    struct Claims<'a> {
        iat: i64,
        exp: i64,
        iss: &'a str,
    }
    let issued = now_ms.div_euclid(1000) - 60;
    let header = URL_SAFE_NO_PAD.encode(br#"{"alg":"RS256","typ":"JWT"}"#);
    let payload = URL_SAFE_NO_PAD.encode(serde_json::to_vec(&Claims {
        iat: issued,
        exp: issued + 540,
        iss: app,
    })?);
    let input = format!("{header}.{payload}");
    let normalized = pem(private_key);
    let key = if normalized.starts_with("-----BEGIN RSA PRIVATE KEY-----") {
        RsaPrivateKey::from_pkcs1_pem(&normalized)?
    } else {
        RsaPrivateKey::from_pkcs8_pem(&normalized)?
    };
    let der = key.to_pkcs1_der()?;
    let signature = crypto::sign(
        input.as_bytes(),
        &EncodingKey::from_rsa_der(der.as_bytes()),
        Algorithm::RS256,
    )?;
    Ok(format!("{input}.{signature}"))
}

pub struct AgentGithubAppService {
    secrets: Option<UserSecretService>,
    state_secret: String,
    clock: Clock,
    public_url: Option<String>,
    api_base: String,
    /// Installation tokens use owner/agent pairs to prevent separator aliasing.
    token_cache: Mutex<HashMap<(String, String), CachedToken>>,
}
impl AgentGithubAppService {
    pub fn new(
        secrets: Option<UserSecretService>,
        state_secret: Option<String>,
        clock: Clock,
    ) -> Self {
        Self {
            secrets,
            state_secret: state_secret.unwrap_or_else(|| "jait-agent-github-app".into()),
            clock,
            public_url: None,
            api_base: "https://api.github.com".into(),
            token_cache: Mutex::new(HashMap::new()),
        }
    }
    /// Enterprise base is host configuration, never request-supplied authority.
    pub fn with_api_base(mut self, base: Option<&str>) -> Self {
        self.api_base = base
            .unwrap_or("https://api.github.com")
            .trim_end_matches('/')
            .into();
        self
    }
    /// Host supplies config and captured JAIT_PUBLIC_URL; explicit blank suppresses env.
    pub fn with_public_url(
        mut self,
        configured: Option<String>,
        environment: Option<String>,
    ) -> Self {
        self.public_url = configured.or(environment);
        self
    }
    pub fn configured_base_url(&self) -> Option<String> {
        self.public_url
            .as_deref()
            .map(js_trim)
            .filter(|v| !v.is_empty())
            .map(|v| v.trim_end_matches('/').into())
    }
    pub fn public_base_url(&self) -> String {
        self.configured_base_url()
            .unwrap_or_else(|| "http://localhost:8787".into())
    }
    /// Prepare a manifest only; this method performs no network effect.
    pub fn begin_setup(
        &self,
        db: &Connection,
        user: &str,
        agent: &str,
        options: &Value,
    ) -> Result<SetupStart, Error> {
        let transaction = Transaction::new_unchecked(db, TransactionBehavior::Immediate)?;
        let db = &transaction;
        let mut stored = self
            .read(db, user, agent)?
            .map(Ok)
            .unwrap_or_else(|| self.blank(agent))?;
        let request_base = options["baseUrl"]
            .as_str()
            .map(js_trim)
            .map(|v| v.trim_end_matches('/'))
            .filter(|v| !v.is_empty());
        let base = self.configured_base_url().unwrap_or_else(|| {
            request_base
                .map(Into::into)
                .unwrap_or_else(|| self.public_base_url())
        });
        let state = self.sign_state(user, agent)?;
        let name: Vec<u16> = js_trim(
            options["appName"]
                .as_str()
                .ok_or_else(|| fail("Invalid appName"))?,
        )
        .encode_utf16()
        .take(34)
        .collect();
        let name = if name.is_empty() {
            let mut text: Vec<u16> = "Jait agent ".encode_utf16().collect();
            text.extend(agent.encode_utf16().take(6));
            text
        } else {
            name
        };
        let text_or = |field: &str, default: &str| {
            options[field]
                .as_str()
                .map(js_trim)
                .filter(|v| !v.is_empty())
                .unwrap_or(default)
                .to_owned()
        };
        let callback = format!("{base}/api/github/apps/callback");
        let fields = json!({
            "url":text_or("homepage", &base),
            "description":text_or("description", "Jait agent identity: commits, pull requests and reviews authored by this agent."),
            "public":false,"redirect_url":callback,"callback_urls":[callback],"setup_url":callback,
            "setup_on_update":true,"request_oauth_on_install":false,
            "hook_attributes":{"url":format!("{base}/api/github/apps/webhook"),"active":true},
            "default_permissions":{"metadata":"read","contents":"write","pull_requests":"write","issues":"write","checks":"read","actions":"read","workflows":"write","statuses":"write"},
            "default_events":["pull_request","pull_request_review","issues","issue_comment","push","check_run","workflow_run"]
        }).as_object().expect("manifest object").clone();
        let has_app = truthy(&stored["appId"]);
        stored["manifestState"] = json!(state);
        stored["lastError"] = Value::Null;
        self.write(db, user, stored)?;
        let has_credentials = has_app
            && self
                .private_key(db, user, agent)?
                .is_some_and(|v| !v.is_empty());
        let org = options["organization"]
            .as_str()
            .map(js_trim)
            .filter(|v| !v.is_empty());
        let post_url = org
            .map(|org| {
                format!(
                    "https://github.com/organizations/{}/settings/apps/new?state={}",
                    encode(org),
                    encode(&state)
                )
            })
            .unwrap_or_else(|| {
                format!(
                    "https://github.com/settings/apps/new?state={}",
                    encode(&state)
                )
            });
        let binding = self.setup_binding(db, user, agent)?;
        challenge::issue(db, Owner { user, agent }, &state, (self.clock)(), &binding)?;
        transaction.commit()?;
        Ok(SetupStart {
            agent_id: agent.into(),
            state,
            post_url,
            redirect_url: callback,
            manifest: GithubManifest {
                name: Utf16Text(name),
                fields,
            },
            has_credentials,
        })
    }
    /// Authenticated browser boundary: starting an installation always issues a
    /// fresh nonce through the same persisted authority as manifest setup. The
    /// transaction binds the URL to the exact current App/key revision. Signed
    /// state is returned to the caller; replay rows store public connections only.
    pub fn begin_installation(
        &self,
        db: &Connection,
        user: &str,
        agent: &str,
    ) -> Result<Value, Error> {
        let transaction = Transaction::new_unchecked(db, TransactionBehavior::Immediate)?;
        let db = &transaction;
        let mut stored = self
            .read(db, user, agent)?
            .ok_or_else(|| fail("GitHub App not configured"))?;
        let app = stored["appId"]
            .as_str()
            .filter(|v| !v.is_empty())
            .ok_or_else(|| fail("GitHub App not configured"))?;
        if !app.bytes().all(|v| v.is_ascii_digit())
            || self
                .private_key(db, user, agent)?
                .is_none_or(|v| v.is_empty())
        {
            return Err(fail("GitHub App credentials unavailable"));
        }
        let slug = stored["appSlug"]
            .as_str()
            .filter(|v| {
                !v.is_empty()
                    && v.len() <= 256
                    && v.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-')
            })
            .ok_or_else(|| fail("GitHub App slug unavailable"))?;
        // App slugs are data, never a host/path authority. Encode as one segment.
        let prefix = format!(
            "https://github.com/apps/{}/installations/new?state=",
            encode(slug)
        );
        let state = self.sign_state(user, agent)?;
        stored["manifestState"] = json!(state);
        stored["lastError"] = Value::Null;
        self.write(db, user, stored)?;
        let binding = self.setup_binding(db, user, agent)?;
        challenge::issue(db, Owner { user, agent }, &state, (self.clock)(), &binding)?;
        let result = json!({"state":state,"installUrl":format!("{prefix}{}",encode(&state))});
        transaction.commit()?;
        Ok(result)
    }
    pub fn webhook_secret(
        &self,
        db: &Connection,
        user: &str,
        agent: &str,
    ) -> Result<Option<String>, Error> {
        self.secrets
            .as_ref()
            .map(|s| {
                s.get_value(
                    db,
                    Some(user),
                    "github-app",
                    &format!("agent:{agent}:webhook"),
                )
            })
            .transpose()
            .map(Option::flatten)
    }
    pub fn installed_agent_ids(&self, db: &Connection, user: &str) -> Result<Value, Error> {
        Ok(Value::Array(
            self.list(db, user)?
                .as_array()
                .expect("connection list")
                .iter()
                .filter(|v| truthy(&v["installationId"]))
                .map(|v| v["agentId"].clone())
                .collect(),
        ))
    }
    pub fn disconnect(&self, db: &Connection, user: &str, agent: &str) -> Result<Value, Error> {
        let transaction = Transaction::new_unchecked(db, TransactionBehavior::Immediate)?;
        let db = &transaction;
        challenge::revoke(db, Owner { user, agent })?;
        let mut removed = false;
        if let Some(secrets) = &self.secrets {
            let webhook = format!("agent:{agent}:webhook");
            for record in secrets
                .list(db, Some(user), Some("github-app"))?
                .into_iter()
                .filter(|r| r.key == key(agent) || r.key == webhook)
            {
                secrets.delete(db, &record.id, Some(user))?;
                removed = true;
            }
        }
        self.invalidate_token(user, agent);
        let rows = db.execute(
            "DELETE FROM agent_github_apps WHERE user_id=? AND agent_id=?",
            params![user, agent],
        )?;
        transaction.commit()?;
        Ok(json!({"disconnected":rows > 0 || removed}))
    }
    /// Runtime maintenance shares the canonical clock and database authority.
    pub(crate) fn expire_setup_challenges(
        &self,
        db: &Connection,
        batch: u16,
    ) -> Result<usize, Error> {
        Ok(challenge::expire_batch(db, (self.clock)(), batch)?)
    }
    fn now(&self) -> Result<String, Error> {
        iso((self.clock)()).map_err(|e| fail(&e))
    }
    fn blank(&self, agent: &str) -> Result<Value, Error> {
        let now = self.now()?;
        Ok(
            json!({"agentId":agent,"appId":null,"appSlug":null,"appName":null,"clientId":null,"installationId":null,"accountLogin":null,"accountType":null,"botLogin":null,"repositorySelection":null,"permissions":null,"status":"awaiting_installation","createdAt":now,"updatedAt":now,"installedAt":null,"lastVerifiedAt":null,"lastError":null,"hasPrivateKey":false,"manifestState":null}),
        )
    }
    fn read(&self, db: &Connection, user: &str, agent: &str) -> Result<Option<Value>, Error> {
        let row: Option<String> = db
            .query_row(
                "SELECT data FROM agent_github_apps WHERE user_id=? AND agent_id=?",
                params![user, agent],
                |r| r.get(0),
            )
            .optional()?;
        row.map(|v| serde_json::from_str(&v).map_err(Into::into))
            .transpose()
    }
    fn write(&self, db: &Connection, user: &str, mut value: Value) -> Result<(), Error> {
        let now = self.now()?;
        value["updatedAt"] = json!(now);
        let agent = value["agentId"]
            .as_str()
            .ok_or_else(|| fail("Missing agentId"))?;
        let status = value["status"]
            .as_str()
            .ok_or_else(|| fail("Missing status"))?;
        let data = serde_json::to_string(&value)?;
        let id: Option<String> = db
            .query_row(
                "SELECT id FROM agent_github_apps WHERE user_id=? AND agent_id=?",
                params![user, agent],
                |r| r.get(0),
            )
            .optional()?;
        if let Some(id) = id {
            db.execute(
                "UPDATE agent_github_apps SET status=?,data=?,updated_at=? WHERE id=?",
                params![status, data, now, id],
            )?;
        } else {
            db.execute("INSERT INTO agent_github_apps(id,user_id,agent_id,status,data,updated_at) VALUES(?,?,?,?,?,?)", params![uuidv7().to_string(),user,agent,status,data,now])?;
        }
        Ok(())
    }
    fn private_key(
        &self,
        db: &Connection,
        user: &str,
        agent: &str,
    ) -> Result<Option<String>, Error> {
        let Some(secrets) = &self.secrets else {
            return Ok(None);
        };
        Ok(secrets
            .get_value(db, Some(user), "github-app", &key(agent))?
            .filter(|v| !v.is_empty())
            .map(|v| pem(&v)))
    }
    fn public(&self, db: &Connection, user: &str, mut value: Value) -> Result<Value, Error> {
        value
            .as_object_mut()
            .ok_or_else(|| fail("Invalid connection"))?
            .remove("manifestState");
        let present = self
            .private_key(db, user, value["agentId"].as_str().unwrap_or_default())?
            .is_some_and(|v| !v.is_empty());
        value["hasPrivateKey"] = json!(present);
        Ok(value)
    }
    pub fn get(&self, db: &Connection, user: &str, agent: &str) -> Result<Value, Error> {
        self.read(db, user, agent)?
            .map(|v| self.public(db, user, v))
            .transpose()
            .map(|v| v.unwrap_or(Value::Null))
    }
    pub fn list(&self, db: &Connection, user: &str) -> Result<Value, Error> {
        let mut stmt = db.prepare("SELECT data FROM agent_github_apps WHERE user_id=?")?;
        let rows = stmt.query_map([user], |r| r.get::<_, String>(0))?;
        rows.map(|v| self.public(db, user, serde_json::from_str(&v?)?))
            .collect::<Result<Vec<_>, _>>()
            .map(Value::Array)
    }
    pub fn find_owner(&self, db: &Connection, field: &str, id: &str) -> Result<Value, Error> {
        // Only metadata selectors; never SQL interpolation or a credential lookup.
        if id.is_empty() {
            return Ok(Value::Null);
        }
        if !matches!(field, "appId" | "installationId") {
            return Err(fail("Invalid owner selector"));
        }
        let mut stmt = db.prepare("SELECT user_id,agent_id,data FROM agent_github_apps")?;
        let rows = stmt.query_map([], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
            ))
        })?;
        for row in rows {
            let (user, agent, data) = row?;
            if let Ok(v) = serde_json::from_str::<Value>(&data)
                && v[field] == json!(id)
            {
                return Ok(json!({"userId":user,"agentId":agent}));
            }
        }
        Ok(Value::Null)
    }
    pub fn save_manual(
        &self,
        db: &Connection,
        user: &str,
        agent: &str,
        options: &Value,
    ) -> Result<Value, Error> {
        let transaction = Transaction::new_unchecked(db, TransactionBehavior::Immediate)?;
        let db = &transaction;
        let secrets = self.secrets.as_ref().ok_or_else(|| {
            fail("Secret store unavailable: cannot store a GitHub App private key.")
        })?;
        let app = js_trim(
            options["appId"]
                .as_str()
                .ok_or_else(|| fail("Invalid appId"))?,
        );
        if app.is_empty() || !app.bytes().all(|v| v.is_ascii_digit()) {
            return Err(fail(
                "GitHub App id must be numeric (see the App settings page).",
            ));
        }
        let private_key = pem(options["privateKey"]
            .as_str()
            .ok_or_else(|| fail("Invalid privateKey"))?);
        if !private_key.contains("PRIVATE KEY") {
            return Err(fail("A GitHub App private key in PEM format is required."));
        }
        // Local challenge revocation and credential writes commit atomically.
        challenge::revoke(db, Owner { user, agent })?;
        // Preserve TS effect order: encrypted key save precedes connection read.
        secrets.save(
            db,
            SaveSecretParams {
                user_id: Some(user.into()),
                r#type: "github-app".into(),
                key: key(agent),
                label: format!("GitHub App key for agent {agent}"),
                value: private_key,
            },
        )?;
        let mut value = self
            .read(db, user, agent)?
            .map(Ok)
            .unwrap_or_else(|| self.blank(agent))?;
        let slug = options["appSlug"]
            .as_str()
            .map(js_trim)
            .filter(|v| !v.is_empty());
        let name = options["appName"]
            .as_str()
            .map(js_trim)
            .filter(|v| !v.is_empty())
            .or(slug);
        value["appId"] = json!(app);
        value["appSlug"] = json!(slug);
        value["appName"] = json!(name);
        value["botLogin"] = json!(slug.map(|v| format!("{v}[bot]")));
        value["status"] = json!(if truthy(&value["installationId"]) {
            "connected"
        } else {
            "awaiting_installation"
        });
        value["manifestState"] = Value::Null;
        value["lastError"] = Value::Null;
        value["hasPrivateKey"] = json!(true);
        self.write(db, user, value)?;
        let result = self.get(db, user, agent)?;
        transaction.commit()?;
        Ok(result)
    }
    pub(crate) fn validate_setup_callback(
        &self,
        callback: &GithubSetupCallback,
    ) -> Result<(), Error> {
        let bounded = |v: &str| !v.is_empty() && v.len() <= 8192;
        if !bounded(&callback.user)
            || !bounded(&callback.agent)
            || !bounded(&callback.state)
            || callback.code.as_deref().is_some_and(|v| !bounded(v))
            || callback
                .installation
                .as_deref()
                .is_some_and(|v| !bounded(v))
        {
            return Err(fail("Invalid GitHub setup callback"));
        }
        let signed = self.read_state(&callback.state);
        if signed["userId"].as_str() != Some(&callback.user)
            || signed["agentId"].as_str() != Some(&callback.agent)
        {
            return Err(fail("Invalid GitHub setup state"));
        }
        if callback.code.is_none() && callback.installation.is_none() {
            return Err(fail("Missing GitHub setup code"));
        }
        Ok(())
    }
    fn setup_binding(&self, db: &Connection, user: &str, agent: &str) -> Result<Binding, Error> {
        let current = self.read(db, user, agent)?.unwrap_or(Value::Null);
        let has_credentials = truthy(&current["appId"])
            && self
                .private_key(db, user, agent)?
                .is_some_and(|v| !v.is_empty());
        Ok(Binding::new(
            &self.revision(db, user, agent)?,
            if has_credentials {
                current["appId"].as_str()
            } else {
                None
            },
        )?)
    }
    /// Compound operation: the shared port holds ONE owner lease across both
    /// phases. The persisted challenge supplies authority across cancellation,
    /// restart and other database connections. No database handle crosses I/O.
    /// The HTTP callback uses this operation; authenticated manual installation
    /// retains its separate owner-authorized path.
    pub async fn complete_callback(
        self: &Arc<Self>,
        worker: &DatabaseWorker,
        callback: GithubSetupCallback,
        effect: &GithubEffect,
    ) -> Result<Value, Error> {
        self.validate_setup_callback(&callback)?;
        let mut result = Value::Null;
        for (phase, input) in [
            (challenge::Phase::Manifest, callback.code.as_deref()),
            (
                challenge::Phase::Installation,
                callback.installation.as_deref(),
            ),
        ] {
            let Some(input) = input else { continue };
            let service = self.clone();
            let (user, agent, state, input) = (
                callback.user.clone(),
                callback.agent.clone(),
                callback.state.clone(),
                input.to_owned(),
            );
            let prepared = worker
                .run(move |db| {
                    let admission = challenge::reserve(
                        db,
                        Owner {
                            user: &user,
                            agent: &agent,
                        },
                        &state,
                        (service.clock)(),
                        phase,
                        &input,
                        |db| service.setup_binding(db, &user, &agent),
                    )?;
                    let reservation = match admission {
                        challenge::Admission::Replay(value) => {
                            return Ok(PreparedSetupPhase::Replay(value));
                        }
                        challenge::Admission::Reserved(reservation) => reservation,
                    };
                    let prepared = match phase {
                        challenge::Phase::Manifest => {
                            service.prepare_setup_exchange(db, &user, &agent, &input)
                        }
                        challenge::Phase::Installation => {
                            service.prepare_installation(db, &user, &agent, &input)
                        }
                    };
                    let prepared = match prepared {
                        Ok(prepared) => prepared,
                        Err(error) => {
                            // Only this still-held pre-dispatch capability may release.
                            reservation.release(db)?;
                            return Err(error);
                        }
                    };
                    let dispatched = reservation.dispatch(db, (service.clock)(), |db| {
                        service.setup_binding(db, &user, &agent)
                    })?;
                    Ok(PreparedSetupPhase::Request(Box::new((
                        prepared, dispatched,
                    ))))
                })
                .await
                .map_err(database_error)?;
            result = match prepared {
                PreparedSetupPhase::Replay(value) => value,
                PreparedSetupPhase::Request(request) => {
                    let (prepared, dispatched) = *request;
                    let completed = prepared.execute(effect).await;
                    let service = self.clone();
                    let (user, agent) = (callback.user.clone(), callback.agent.clone());
                    worker
                        .run(move |db| {
                            dispatched
                                .complete(
                                    db,
                                    (service.clock)(),
                                    |db| service.setup_binding(db, &user, &agent),
                                    |db| {
                                        let value = service.finish_call(db, completed)?;
                                        Ok(match phase {
                                            challenge::Phase::Manifest => {
                                                value["connection"].clone()
                                            }
                                            challenge::Phase::Installation => value,
                                        })
                                    },
                                )
                                .map_err(|error| match error {
                                    challenge::ChallengeError::Apply(error) => error,
                                    error => Box::new(error) as Error,
                                })
                        })
                        .await
                        .map_err(database_error)?
                }
            };
        }
        Ok(result)
    }
    /// Explicit bounded DB phases around an outbound wait. Entry adapters retain
    /// authentication, agent ownership, consent and sequential operation authority.
    pub async fn complete_setup(
        self: &Arc<Self>,
        worker: &DatabaseWorker,
        user: &str,
        agent: &str,
        code: &str,
        effect: &GithubEffect,
    ) -> Result<Value, Error> {
        let service = self.clone();
        let (user, agent, code) = (user.to_owned(), agent.to_owned(), code.to_owned());
        let prepared = worker
            .run(move |db| service.prepare_setup_exchange(db, &user, &agent, &code))
            .await
            .map_err(database_error)?;
        let completed = prepared.execute(effect).await;
        let service = self.clone();
        worker
            .run(move |db| service.finish_call(db, completed))
            .await
            .map_err(database_error)
    }
    pub async fn attach_installation(
        self: &Arc<Self>,
        worker: &DatabaseWorker,
        user: &str,
        agent: &str,
        installation: &str,
        effect: &GithubEffect,
    ) -> Result<Value, Error> {
        let service = self.clone();
        let (user, agent, installation) =
            (user.to_owned(), agent.to_owned(), installation.to_owned());
        let prepared = worker
            .run(move |db| service.prepare_installation(db, &user, &agent, &installation))
            .await
            .map_err(database_error)?;
        let completed = prepared.execute(effect).await;
        let service = self.clone();
        worker
            .run(move |db| service.finish_call(db, completed))
            .await
            .map_err(database_error)
    }
    pub fn prepare_setup_exchange(
        &self,
        db: &Connection,
        user: &str,
        agent: &str,
        code: &str,
    ) -> Result<PreparedGithubCall, Error> {
        let stored = self
            .read(db, user, agent)?
            .map(Ok)
            .unwrap_or_else(|| self.blank(agent))?;
        let request = GithubRequest {
            user: user.into(),
            agent: agent.into(),
            url: format!(
                "{}/app-manifests/{}/conversions",
                self.api_base,
                encode(code)
            ),
            method: "POST",
            headers: vec![
                ("accept".into(), "application/vnd.github+json".into()),
                ("user-agent".into(), "jait-gateway".into()),
                ("x-github-api-version".into(), "2022-11-28".into()),
            ],
            timeout: REQUEST_TIMEOUT,
            max_response_bytes: RESPONSE_LIMIT,
            follow_redirects: false,
        };
        Ok(PreparedGithubCall {
            state: GithubCallState {
                user: user.into(),
                agent: agent.into(),
                stored,
                revision: self.revision(db, user, agent)?,
                kind: GithubCallKind::Manifest,
            },
            request,
        })
    }
    fn revision(&self, db: &Connection, user: &str, agent: &str) -> Result<Value, Error> {
        let mut statement = db.prepare("SELECT key,encrypted_value,iv,auth_tag FROM user_secrets WHERE user_id=? AND type='github-app' AND key IN (?,?) ORDER BY key")?;
        let secrets = statement
            .query_map(
                params![user, key(agent), format!("{}:webhook", key(agent))],
                |r| {
                    Ok((
                        r.get::<_, String>(0)?,
                        r.get::<_, String>(1)?,
                        r.get::<_, String>(2)?,
                        r.get::<_, String>(3)?,
                    ))
                },
            )?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(json!({"connection":self.read(db,user,agent)?,"secrets":secrets}))
    }
    pub fn prepare_installation(
        &self,
        db: &Connection,
        user: &str,
        agent: &str,
        installation: &str,
    ) -> Result<PreparedGithubCall, Error> {
        let stored = self.require_connection(db, user, agent)?;
        let request = self.signed_get(
            db,
            user,
            agent,
            &stored,
            &format!("/app/installations/{}", encode(installation)),
        )?;
        Ok(PreparedGithubCall {
            state: GithubCallState {
                user: user.into(),
                agent: agent.into(),
                stored,
                revision: self.revision(db, user, agent)?,
                kind: GithubCallKind::Installation,
            },
            request,
        })
    }
    fn require_connection(&self, db: &Connection, user: &str, agent: &str) -> Result<Value, Error> {
        let stored = self
            .read(db, user, agent)?
            .ok_or_else(|| fail("This agent has no GitHub App connection yet."))?;
        if !truthy(&stored["appId"]) {
            return Err(fail(
                "This agent's GitHub App registration is incomplete. Finish connecting it first.",
            ));
        }
        if self
            .private_key(db, user, agent)?
            .filter(|v| !v.is_empty())
            .is_none()
        {
            return Err(fail(
                "This agent's GitHub App private key is missing. Reconnect the App.",
            ));
        }
        Ok(stored)
    }
    fn signed_get(
        &self,
        db: &Connection,
        user: &str,
        agent: &str,
        stored: &Value,
        path: &str,
    ) -> Result<GithubRequest, Error> {
        let private_key = self
            .private_key(db, user, agent)?
            .filter(|v| !v.is_empty())
            .ok_or_else(|| {
                fail("This agent's GitHub App private key is missing. Reconnect the App.")
            })?;
        let jwt = build_app_jwt(&js_string(&stored["appId"]), &private_key, (self.clock)())?;
        Ok(GithubRequest {
            user: user.into(),
            agent: agent.into(),
            url: format!("{}{path}", self.api_base),
            method: "GET",
            headers: vec![
                ("accept".into(), "application/vnd.github+json".into()),
                ("user-agent".into(), "jait-gateway".into()),
                ("x-github-api-version".into(), "2022-11-28".into()),
                ("authorization".into(), format!("Bearer {jwt}")),
            ],
            timeout: REQUEST_TIMEOUT,
            max_response_bytes: RESPONSE_LIMIT,
            follow_redirects: false,
        })
    }
    fn check_revision(
        &self,
        db: &Connection,
        user: &str,
        agent: &str,
        revision: &Value,
    ) -> Result<(), Error> {
        if self.revision(db, user, agent)? != *revision {
            return Err(fail(
                "GitHub connection changed while the request was in flight. Retry the operation.",
            ));
        }
        Ok(())
    }
    pub async fn verify(
        self: &Arc<Self>,
        worker: &DatabaseWorker,
        user: &str,
        agent: &str,
        effect: &GithubEffect,
    ) -> Result<Value, Error> {
        let service = self.clone();
        let (user, agent) = (user.to_owned(), agent.to_owned());
        let mut prepared = worker
            .run(move |db| service.prepare_verification(db, &user, &agent))
            .await
            .map_err(database_error)?;
        loop {
            let completed = prepared.execute(effect).await;
            let service = self.clone();
            match worker
                .run(move |db| service.finish_verification(db, completed))
                .await
                .map_err(database_error)?
            {
                GithubVerificationProgress::Request(next) => prepared = *next,
                GithubVerificationProgress::Complete(value) => return Ok(value),
            }
        }
    }
    pub fn prepare_verification(
        &self,
        db: &Connection,
        user: &str,
        agent: &str,
    ) -> Result<PreparedGithubVerification, Error> {
        let stored = self.require_connection(db, user, agent)?;
        let request = self.signed_get(db, user, agent, &stored, "/app")?;
        Ok(PreparedGithubVerification {
            state: VerificationState {
                user: user.into(),
                agent: agent.into(),
                stored,
                revision: self.revision(db, user, agent)?,
                app: None,
            },
            request,
        })
    }
    pub fn finish_verification(
        &self,
        db: &Connection,
        completed: CompletedGithubVerification,
    ) -> Result<GithubVerificationProgress, Error> {
        let CompletedGithubVerification { mut state, result } = completed;
        self.check_revision(db, &state.user, &state.agent, &state.revision)?;
        let data = match result {
            Ok(data) => data,
            Err(failure) => {
                let installation = state.app.is_some();
                state.stored["status"] = json!(if installation || failure.credential_rejected {
                    "revoked"
                } else {
                    "error"
                });
                state.stored["lastError"] = json!(failure.message);
                self.write(db, &state.user, state.stored)?;
                return Err(fail(&if installation {
                    format!("Installation is no longer available: {}", failure.message)
                } else {
                    failure.message
                }));
            }
        };
        if state.app.is_none() {
            let id = data
                .get("id")
                .map(js_string)
                .unwrap_or_else(|| "undefined".into());
            if truthy(&state.stored["appId"]) && id != js_string(&state.stored["appId"]) {
                state.stored["status"] = json!("error");
                state.stored["lastError"] = json!(format!(
                    "Stored App id {} does not match GitHub App {id}",
                    js_string(&state.stored["appId"])
                ));
                self.write(db, &state.user, state.stored)?;
                return Err(fail(
                    "Stored App id does not match the private key on GitHub.",
                ));
            }
            state.stored["appId"] = json!(id);
            for (target, source) in [("appSlug", "slug"), ("appName", "name")] {
                if let Some(value) = data.get(source) {
                    state.stored[target] = value.clone();
                } else {
                    state.stored.as_object_mut().unwrap().remove(target);
                }
            }
            let slug = data
                .get("slug")
                .map(js_string)
                .unwrap_or_else(|| "undefined".into());
            state.stored["botLogin"] = json!(format!("{slug}[bot]"));
            state.app = Some(data);
            if truthy(&state.stored["installationId"]) {
                let path = format!(
                    "/app/installations/{}",
                    encode(&js_string(&state.stored["installationId"]))
                );
                let request =
                    self.signed_get(db, &state.user, &state.agent, &state.stored, &path)?;
                return Ok(GithubVerificationProgress::Request(Box::new(
                    PreparedGithubVerification { state, request },
                )));
            }
        } else {
            for (target, value) in [
                ("accountLogin", &data["account"]["login"]),
                ("accountType", &data["account"]["type"]),
                ("repositorySelection", &data["repository_selection"]),
                ("permissions", &data["permissions"]),
            ] {
                if !value.is_null() {
                    state.stored[target] = value.clone();
                }
            }
            state.stored["status"] = json!("connected");
            if state.stored["installedAt"].is_null() {
                state.stored["installedAt"] = json!(self.now()?);
            }
        }
        state.stored["lastVerifiedAt"] = json!(self.now()?);
        state.stored["lastError"] = Value::Null;
        self.write(db, &state.user, state.stored)?;
        let app = state.app.unwrap();
        let mut result_app = json!({"id": app.get("id").map(js_string).unwrap_or_else(|| "undefined".into()), "owner": app["owner"]["login"]});
        for field in ["slug", "name"] {
            if let Some(value) = app.get(field) {
                result_app[field] = value.clone();
            }
        }
        Ok(GithubVerificationProgress::Complete(
            json!({"connection":self.get(db, &state.user, &state.agent)?, "app":result_app}),
        ))
    }
    /// Installation tokens are re-used across the connection test and the agent
    /// environment resolver. Attach/disconnect explicitly evict them. Manual
    /// key updates retain already minted tokens until expiry, as in TypeScript;
    /// native cache entries additionally bind the App and installation identity.
    fn token_key(user: &str, agent: &str) -> (String, String) {
        (user.to_owned(), agent.to_owned())
    }
    fn token_cache_lock(
        &self,
    ) -> std::sync::MutexGuard<'_, HashMap<(String, String), CachedToken>> {
        self.token_cache
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }
    fn invalidate_token(&self, user: &str, agent: &str) {
        self.token_cache_lock()
            .remove(&Self::token_key(user, agent));
    }
    /// Cache a freshly minted installation token, bound to the App and
    /// installation that produced it.
    fn store_token(
        &self,
        user: &str,
        agent: &str,
        stored: &Value,
        data: &Value,
    ) -> Result<i64, Error> {
        // Validate the whole credential response before admitting any cache entry.
        // TypeScript trusts its generic fetch type at runtime; native consumers
        // must never authorize a follow-up with a coerced or malformed token.
        let token = data
            .get("token")
            .and_then(Value::as_str)
            .filter(|token| {
                !token.is_empty()
                    && token
                        .bytes()
                        .all(|b| b.is_ascii_alphanumeric() || b"-._~+/=".contains(&b))
            })
            .ok_or_else(|| fail("GitHub returned an invalid installation token payload."))?;
        if !data.is_object()
            || data
                .get("expires_at")
                .is_some_and(|v| !v.is_null() && !v.is_string())
            || data.get("permissions").is_some_and(|v| {
                !v.is_null()
                    && !v
                        .as_object()
                        .is_some_and(|m| m.values().all(Value::is_string))
            })
            || data
                .get("repository_selection")
                .is_some_and(|v| !v.is_null() && !v.is_string())
        {
            return Err(fail(
                "GitHub returned an invalid installation token payload.",
            ));
        }
        let now = (self.clock)();
        let expires_at = data["expires_at"]
            .as_str()
            .and_then(crate::services::subscription_usage_fetchers::js_date_parse)
            .unwrap_or(now + TOKEN_FALLBACK_MS);
        let key = Self::token_key(user, agent);
        let mut entry = CachedToken {
            token: token.to_owned(),
            expires_at,
            app_id: js_string(&stored["appId"]),
            installation_id: js_string(&stored["installationId"]),
            permissions: data["permissions"].clone(),
            repository_selection: data["repository_selection"].clone(),
            payload_bytes: 0,
        };
        entry.payload_bytes = key.0.len()
            + key.1.len()
            + entry.token.len()
            + entry.app_id.len()
            + entry.installation_id.len()
            + serde_json::to_vec(&entry.permissions)?.len()
            + serde_json::to_vec(&entry.repository_selection)?.len();
        let mut cache = self.token_cache_lock();
        cache.retain(|_, entry| now < entry.expires_at.saturating_sub(TOKEN_SKEW_MS));
        // Replacement removes the former value even if the new token is too large
        // or already expired. A later lookup must never return the former token.
        cache.remove(&key);
        if entry.payload_bytes > TOKEN_CACHE_MAX_PAYLOAD_BYTES
            || now >= expires_at.saturating_sub(TOKEN_SKEW_MS)
        {
            return Ok(expires_at);
        }
        let mut payload_bytes: usize = cache.values().map(|entry| entry.payload_bytes).sum();
        while cache.len() >= TOKEN_CACHE_MAX_ENTRIES
            || payload_bytes + entry.payload_bytes > TOKEN_CACHE_MAX_PAYLOAD_BYTES
        {
            let oldest = cache
                .iter()
                .min_by(|(left_key, left), (right_key, right)| {
                    left.expires_at
                        .cmp(&right.expires_at)
                        .then_with(|| left_key.cmp(right_key))
                })
                .map(|(key, _)| key.clone());
            let Some(oldest) = oldest else { break };
            if let Some(removed) = cache.remove(&oldest) {
                payload_bytes -= removed.payload_bytes;
            }
        }
        cache.insert(key, entry);
        Ok(expires_at)
    }
    /// A cached token is only usable while it is unexpired (minus skew) and was
    /// minted for the current App/installation pair. Validation and eviction share
    /// one critical section so a stale lookup cannot erase a concurrent refresh.
    fn cached_token(&self, user: &str, agent: &str, stored: &Value) -> Option<Value> {
        let key = Self::token_key(user, agent);
        let mut cache = self.token_cache_lock();
        let now = (self.clock)();
        cache.retain(|_, entry| now < entry.expires_at.saturating_sub(TOKEN_SKEW_MS));
        let entry = cache.get(&key)?;
        let bound = entry.app_id == js_string(&stored["appId"])
            && entry.installation_id == js_string(&stored["installationId"]);
        if !bound {
            cache.remove(&key);
            return None;
        }
        Some(json!({
            "token": entry.token,
            "expiresAt": iso(entry.expires_at).ok()?,
            "permissions": entry.permissions,
            "repositorySelection": entry.repository_selection,
        }))
    }
    /// Build a request authenticated with a short-lived App JWT.
    fn app_request(
        &self,
        db: &Connection,
        user: &str,
        agent: &str,
        stored: &Value,
        method: &'static str,
        path: &str,
    ) -> Result<GithubRequest, Error> {
        let private_key = self
            .private_key(db, user, agent)?
            .filter(|value| !value.is_empty())
            .ok_or_else(|| {
                fail("This agent's GitHub App private key is missing. Reconnect the App.")
            })?;
        let jwt = build_app_jwt(&js_string(&stored["appId"]), &private_key, (self.clock)())?;
        Ok(GithubRequest {
            user: user.into(),
            agent: agent.into(),
            url: format!("{}{path}", self.api_base),
            method,
            headers: vec![
                ("accept".into(), "application/vnd.github+json".into()),
                ("user-agent".into(), "jait-gateway".into()),
                ("x-github-api-version".into(), "2022-11-28".into()),
                ("authorization".into(), format!("Bearer {jwt}")),
            ],
            timeout: REQUEST_TIMEOUT,
            max_response_bytes: RESPONSE_LIMIT,
            follow_redirects: false,
        })
    }
    /// Mint an installation access token for a connected App.
    pub fn prepare_token(
        &self,
        db: &Connection,
        user: &str,
        agent: &str,
    ) -> Result<PreparedGithubCall, Error> {
        let stored = self.require_connection(db, user, agent)?;
        let installation = js_string(&stored["installationId"]);
        if installation.trim().is_empty() {
            return Err(fail(
                "GitHub App is not installed for this agent yet. Install the App on the target account first.",
            ));
        }
        if stored["status"] == "revoked" {
            return Err(fail(
                "This agent's GitHub App connection was revoked. Reconnect it.",
            ));
        }
        let request = self.app_request(
            db,
            user,
            agent,
            &stored,
            "POST",
            &format!("/app/installations/{}/access_tokens", encode(&installation)),
        )?;
        Ok(PreparedGithubCall {
            state: GithubCallState {
                user: user.into(),
                agent: agent.into(),
                stored,
                revision: self.revision(db, user, agent)?,
                kind: GithubCallKind::Token,
            },
            request,
        })
    }
    /// List the installation's repositories with a minted token.
    pub fn prepare_repositories(
        &self,
        db: &Connection,
        user: &str,
        agent: &str,
        minted: &Value,
    ) -> Result<PreparedGithubCall, Error> {
        let stored = self.require_connection(db, user, agent)?;
        let token = js_string(&minted["token"]);
        if token.trim().is_empty() {
            return Err(fail("GitHub did not return an installation token."));
        }
        let request = GithubRequest {
            user: user.into(),
            agent: agent.into(),
            url: format!("{}/installation/repositories?per_page=5", self.api_base),
            method: "GET",
            headers: vec![
                ("accept".into(), "application/vnd.github+json".into()),
                ("user-agent".into(), "jait-gateway".into()),
                ("x-github-api-version".into(), "2022-11-28".into()),
                ("authorization".into(), format!("Bearer {token}")),
            ],
            timeout: REQUEST_TIMEOUT,
            max_response_bytes: RESPONSE_LIMIT,
            follow_redirects: false,
        };
        Ok(PreparedGithubCall {
            state: GithubCallState {
                user: user.into(),
                agent: agent.into(),
                stored,
                revision: self.revision(db, user, agent)?,
                kind: GithubCallKind::Repositories {
                    minted: minted.clone(),
                },
            },
            request,
        })
    }
    /// Cache-aware installation token used by the connection test and the
    /// agent environment resolver.
    pub async fn installation_token(
        self: &Arc<Self>,
        worker: &DatabaseWorker,
        effect: &GithubEffect,
        user: &str,
        agent: &str,
    ) -> Result<Value, Error> {
        Ok(self
            .token_with_revision(worker, effect, user, agent)
            .await?
            .0)
    }
    // Capture the post-completion revision inside the same DB job as the token
    // result. Consumers cannot combine an old token with a newer connection.
    async fn token_with_revision(
        self: &Arc<Self>,
        worker: &DatabaseWorker,
        effect: &GithubEffect,
        user: &str,
        agent: &str,
    ) -> Result<(Value, Value), Error> {
        let service = self.clone();
        let (owner, id) = (user.to_owned(), agent.to_owned());
        let prepared = worker
            .run(move |db| service.prepare_installation_token(db, &owner, &id))
            .await
            .map_err(database_error)?;
        if let GithubTokenProgress::Cached(value, revision) = prepared {
            return Ok((value, revision));
        }
        let GithubTokenProgress::Request(prepared) = prepared else {
            unreachable!()
        };
        let completed = prepared.execute(effect).await;
        let service = self.clone();
        let (owner, id) = (user.to_owned(), agent.to_owned());
        worker
            .run(move |db| {
                let value = service.finish_call(db, completed)?;
                Ok((value, service.revision(db, &owner, &id)?))
            })
            .await
            .map_err(database_error)
    }
    pub fn prepare_installation_token(
        &self,
        db: &Connection,
        user: &str,
        agent: &str,
    ) -> Result<GithubTokenProgress, Error> {
        let stored = self.require_connection(db, user, agent)?;
        if !truthy(&stored["installationId"]) {
            return Err(fail(
                "GitHub App is not installed for this agent yet. Install the App on the target account first.",
            ));
        }
        if stored["status"] == "revoked" {
            return Err(fail(
                "This agent's GitHub App connection was revoked. Reconnect it.",
            ));
        }
        if let Some(cached) = self.cached_token(user, agent, &stored) {
            return Ok(GithubTokenProgress::Cached(
                cached,
                self.revision(db, user, agent)?,
            ));
        }
        Ok(GithubTokenProgress::Request(Box::new(
            self.prepare_token(db, user, agent)?,
        )))
    }
    /// Failed calls mark the connection. Rejected credentials evict the token;
    /// transient failures retain retryable tokens, matching the reference.
    fn apply_failure(
        &self,
        db: &Connection,
        user: &str,
        agent: &str,
        mut stored: Value,
        failure: &GithubFailure,
    ) -> Result<(), Error> {
        stored["status"] = json!(if failure.credential_rejected {
            "revoked"
        } else {
            "error"
        });
        stored["lastError"] = json!(failure.message);
        if failure.credential_rejected {
            self.invalidate_token(user, agent);
        }
        self.write(db, user, stored)
    }
    fn finish_token(
        &self,
        db: &Connection,
        user: &str,
        agent: &str,
        stored: Value,
        result: Result<Value, GithubFailure>,
    ) -> Result<Value, Error> {
        let data = match result {
            Ok(data) => data,
            Err(failure) => {
                self.apply_failure(db, user, agent, stored, &failure)?;
                return Err(fail(&failure.message));
            }
        };
        let expires_at = self.store_token(user, agent, &stored, &data)?;
        let mut stored = stored;
        stored["lastError"] = Value::Null;
        stored["status"] = json!("connected");
        self.write(db, user, stored)?;
        Ok(json!({
            "token": js_string(&data["token"]),
            "expiresAt": iso(expires_at)?,
            "permissions": data.get("permissions").cloned().unwrap_or(Value::Null),
            "repositorySelection": data
                .get("repository_selection")
                .cloned()
                .unwrap_or(Value::Null),
        }))
    }
    fn finish_repositories(
        &self,
        db: &Connection,
        user: &str,
        agent: &str,
        stored: Value,
        minted: &Value,
        result: Result<Value, GithubFailure>,
    ) -> Result<Value, Error> {
        let data = match result {
            Ok(data) => data,
            Err(failure) => {
                self.apply_failure(db, user, agent, stored, &failure)?;
                return Err(fail(&failure.message));
            }
        };
        // Optional repositories are empty, as in the reference. Malformed
        // successful responses are not evidence of a working connection.
        let repositories = match data.get("repositories") {
            None | Some(Value::Null) => Some(vec![]),
            Some(Value::Array(items)) => items
                .iter()
                .map(|item| {
                    item.as_object()?
                        .get("full_name")?
                        .as_str()
                        .map(|name| json!(name))
                })
                .collect::<Option<Vec<_>>>(),
            _ => None,
        };
        // JSON 2, 2.0 and 2e0 are the same JavaScript integer. Normalize the
        // accepted safe integer so native serialization also matches the wire.
        let count = data.get("total_count").and_then(|v| {
            v.as_f64()
                .filter(|n| *n >= 0.0 && *n <= 9_007_199_254_740_991.0 && n.fract() == 0.0)
                .map(|n| n as u64)
        });
        let count_valid = data.get("total_count").is_none() || count.is_some();
        let Some(sample) = repositories.filter(|_| data.is_object() && count_valid) else {
            self.invalidate_token(user, agent);
            return Err(fail("GitHub returned an invalid repository payload."));
        };
        let token = js_string(&minted["token"]);
        let mut summary = json!({
            "ok": true,
            "botLogin": stored.get("botLogin").cloned().unwrap_or(Value::Null),
            "accountLogin": stored.get("accountLogin").cloned().unwrap_or(Value::Null),
            "repositoryCount": count,
            "sampleRepositories": sample,
            "permissions": minted.get("permissions").cloned().unwrap_or(Value::Null),
            "repositorySelection": minted
                .get("repositorySelection")
                .cloned()
                .unwrap_or(Value::Null),
            "tokenExpiresAt": minted.get("expiresAt").cloned().unwrap_or(Value::Null),
            "tokenPrefix": format!("{}…", token.chars().take(4).collect::<String>()),
        });
        if data.get("total_count").is_none() {
            summary
                .as_object_mut()
                .expect("summary object")
                .remove("repositoryCount");
        }
        Ok(summary)
    }
    /// Prove the connection end to end without exposing the installation
    /// token: mint (or reuse) a token, then read a small repository page.
    pub async fn test(
        self: &Arc<Self>,
        worker: &DatabaseWorker,
        effect: &GithubEffect,
        user: &str,
        agent: &str,
    ) -> Result<Value, Error> {
        let (minted, revision) = self
            .token_with_revision(worker, effect, user, agent)
            .await?;
        let service = self.clone();
        let (user, agent) = (user.to_owned(), agent.to_owned());
        let prepared = worker
            .run(move |db| {
                service.check_revision(db, &user, &agent, &revision)?;
                service.prepare_repositories(db, &user, &agent, &minted)
            })
            .await
            .map_err(database_error)?;
        let completed = prepared.execute(effect).await;
        let service = self.clone();
        worker
            .run(move |db| service.finish_call(db, completed))
            .await
            .map_err(database_error)
    }
    /// Environment for one agent execution: the App identity, never the
    /// operator's personal token. `None` when the agent has no usable
    /// connection.
    pub async fn resolve_env(
        self: &Arc<Self>,
        worker: &DatabaseWorker,
        effect: &GithubEffect,
        user: &str,
        agent: &str,
    ) -> Result<Option<Value>, Error> {
        let service = self.clone();
        let (owner, id) = (user.to_owned(), agent.to_owned());
        let usable = worker
            .run(move |db| {
                Ok(service.read(db, &owner, &id)?.is_some_and(|stored| {
                    stored["status"] == "connected"
                        && truthy(&stored["installationId"])
                        && truthy(&stored["appId"])
                }))
            })
            .await
            .map_err(database_error)?;
        if !usable {
            return Ok(None);
        }
        let (minted, revision) = self
            .token_with_revision(worker, effect, user, agent)
            .await?;
        let service = self.clone();
        let (user, agent) = (user.to_owned(), agent.to_owned());
        let stored = worker
            .run(move |db| {
                service.check_revision(db, &user, &agent, &revision)?;
                service.require_connection(db, &user, &agent)
            })
            .await
            .map_err(database_error)?;
        Ok(Some(Self::execution_environment(&stored, &minted)))
    }
    pub fn execution_environment(stored: &Value, minted: &Value) -> Value {
        let app_slug = stored.get("appSlug").cloned().unwrap_or(Value::Null);
        // `botLogin` falls back through `appSlug ?? "jait"`, while the commit
        // e-mail uses `appSlug || "jait"`; empty slugs therefore differ.
        let slug_nullish = if app_slug.is_null() {
            "jait".to_string()
        } else {
            js_string(&app_slug)
        };
        let slug_truthy = if truthy(&app_slug) {
            js_string(&app_slug)
        } else {
            "jait".to_string()
        };
        let bot_login = if truthy(&stored["botLogin"]) {
            js_string(&stored["botLogin"])
        } else {
            format!("{slug_nullish}[bot]")
        };
        let bot_email = format!(
            "{}+{slug_truthy}[bot]@users.noreply.github.com",
            js_string(&stored["appId"])
        );
        json!({
            "GH_TOKEN": js_string(&minted["token"]),
            "GITHUB_TOKEN": js_string(&minted["token"]),
            "GITHUB_APP_ID": js_string(&stored["appId"]),
            "GITHUB_APP_SLUG": if app_slug.is_null() {
                String::new()
            } else {
                js_string(&app_slug)
            },
            "GITHUB_APP_INSTALLATION_ID": js_string(&stored["installationId"]),
            "GITHUB_APP_BOT_LOGIN": bot_login,
            "GIT_AUTHOR_NAME": bot_login,
            "GIT_AUTHOR_EMAIL": bot_email,
            "GIT_COMMITTER_NAME": bot_login,
            "GIT_COMMITTER_EMAIL": bot_email,
            "GIT_TERMINAL_PROMPT": "0",
            "JAIT_GITHUB_IDENTITY": "agent-app",
            "JAIT_GITHUB_TOKEN_EXPIRES_AT": js_string(&minted["expiresAt"]),
        })
    }
    pub fn finish_call(
        &self,
        db: &Connection,
        completed: CompletedGithubCall,
    ) -> Result<Value, Error> {
        let CompletedGithubCall { state, result } = completed;
        let GithubCallState {
            user,
            agent,
            mut stored,
            revision,
            kind,
        } = state;
        // Compatibility decision: stale completion never overwrites a newer setup,
        // disconnect or encrypted-key update, including failures. No retry occurs.
        self.check_revision(db, &user, &agent, &revision)?;
        match kind {
            GithubCallKind::Manifest => {
                self.finish_setup_exchange(db, &user, &agent, stored, result)
            }
            GithubCallKind::Installation => {
                let data = match result {
                    Ok(data) => data,
                    Err(failure) => {
                        self.apply_failure(db, &user, &agent, stored, &failure)?;
                        return Err(fail(&failure.message));
                    }
                };
                if truthy(&data["app_id"])
                    && js_string(&data["app_id"]) != js_string(&stored["appId"])
                {
                    return Err(fail("That installation belongs to a different GitHub App."));
                }
                stored["installationId"] = json!(
                    data.get("id")
                        .map(js_string)
                        .unwrap_or_else(|| "undefined".into())
                );
                let slug = data
                    .get("app_slug")
                    .filter(|v| !v.is_null())
                    .unwrap_or(&stored["appSlug"])
                    .clone();
                if truthy(&slug) {
                    stored["botLogin"] = json!(format!("{}[bot]", js_string(&slug)));
                }
                stored["appSlug"] = slug;
                stored["accountLogin"] = data["account"]["login"].clone();
                stored["accountType"] = data["account"]["type"].clone();
                stored["repositorySelection"] = data["repository_selection"].clone();
                stored["permissions"] = data["permissions"].clone();
                stored["status"] = json!("connected");
                stored["installedAt"] = json!(self.now()?);
                stored["lastError"] = Value::Null;
                self.write(db, &user, stored)?;
                self.invalidate_token(&user, &agent);
                self.get(db, &user, &agent)
            }
            GithubCallKind::Token => self.finish_token(db, &user, &agent, stored, result),
            GithubCallKind::Repositories { minted } => {
                self.finish_repositories(db, &user, &agent, stored, &minted, result)
            }
        }
    }
    fn finish_setup_exchange(
        &self,
        db: &Connection,
        user: &str,
        agent: &str,
        mut stored: Value,
        result: Result<Value, GithubFailure>,
    ) -> Result<Value, Error> {
        let data = match result {
            Ok(data) => data,
            Err(failure) => {
                return self.fail_setup(
                    db,
                    user,
                    stored,
                    &failure.message,
                    "GitHub rejected the App manifest code",
                );
            }
        };
        let Some(secrets) = &self.secrets else {
            return self.fail_setup(
                db,
                user,
                stored,
                "No secret store configured",
                "Secret store unavailable",
            );
        };
        // Match normalizePem's JavaScript diagnostics before any credential write.
        let raw_key = data.get("pem");
        let private_key = match raw_key {
            Some(Value::String(value)) => pem(value),
            None => {
                return Err(fail(
                    "undefined is not an object (evaluating 'value.includes')",
                ));
            }
            Some(Value::Null) => {
                return Err(fail("null is not an object (evaluating 'value.includes')"));
            }
            Some(Value::Array(_)) => {
                return Err(fail(
                    "value.replace is not a function. (In 'value.replace(/\\r\\n/g, `\n`)', 'value.replace' is undefined)",
                ));
            }
            _ => {
                return Err(fail(
                    "value.includes is not a function. (In 'value.includes(\"BEGIN RSA PRIVATE KEY\")', 'value.includes' is undefined)",
                ));
            }
        };
        secrets.save(
            db,
            SaveSecretParams {
                user_id: Some(user.into()),
                r#type: "github-app".into(),
                key: key(agent),
                label: format!("GitHub App key for agent {agent}"),
                value: private_key,
            },
        )?;
        if truthy(&data["webhook_secret"]) {
            secrets.save(
                db,
                SaveSecretParams {
                    user_id: Some(user.into()),
                    r#type: "github-app".into(),
                    key: format!("{}:webhook", key(agent)),
                    label: format!("GitHub App webhook secret for agent {agent}"),
                    value: data["webhook_secret"]
                        .as_str()
                        .ok_or_else(|| fail("Invalid GitHub webhook secret response"))?
                        .into(),
                },
            )?;
        }
        stored["appId"] = json!(
            data.get("id")
                .map(js_string)
                .unwrap_or_else(|| "undefined".into())
        );
        for (target, source) in [("appSlug", "slug"), ("appName", "name")] {
            if let Some(v) = data.get(source) {
                stored[target] = v.clone();
            } else {
                stored.as_object_mut().unwrap().remove(target);
            }
        }
        stored["clientId"] = data["client_id"].clone();
        stored["botLogin"] = if truthy(&data["slug"]) {
            json!(format!("{}[bot]", js_string(&data["slug"])))
        } else {
            Value::Null
        };
        stored["status"] = json!("awaiting_installation");
        stored["manifestState"] = Value::Null;
        stored["lastError"] = Value::Null;
        stored["hasPrivateKey"] = json!(true);
        self.write(db, user, stored)?;
        Ok(
            json!({"connection": self.get(db, user, agent)?, "installUrl": if truthy(&data["slug"]) {
            json!(format!("https://github.com/apps/{}/installations/new", js_string(&data["slug"])))
        } else { Value::Null }}),
        )
    }
    fn fail_setup(
        &self,
        db: &Connection,
        user: &str,
        mut stored: Value,
        message: &str,
        fallback: &str,
    ) -> Result<Value, Error> {
        let message = if message.is_empty() {
            fallback
        } else {
            message
        };
        stored["status"] = json!("error");
        stored["lastError"] = json!(message);
        stored["manifestState"] = Value::Null;
        self.write(db, user, stored)?;
        Err(fail(message))
    }
    /// Nonce injected only by this internal helper; setup uses fresh UUIDv7.
    fn sign_state_nonce(&self, user: &str, agent: &str, nonce: &str) -> Result<String, Error> {
        let body = URL_SAFE_NO_PAD.encode(serde_json::to_vec(
            &json!({"userId":user,"agentId":agent,"nonce":nonce}),
        )?);
        let signature = crypto::sign(
            body.as_bytes(),
            &EncodingKey::from_secret(self.state_secret.as_bytes()),
            Algorithm::HS256,
        )?;
        Ok(format!("{body}.{signature}"))
    }
    pub fn sign_state(&self, user: &str, agent: &str) -> Result<String, Error> {
        self.sign_state_nonce(user, agent, &uuidv7().to_string())
    }
    pub fn read_state(&self, state: &str) -> Value {
        let mut parts = state.split('.');
        let body = parts.next().unwrap_or_default();
        let signature = parts.next().unwrap_or_default();
        if body.is_empty() || signature.is_empty() {
            return Value::Null;
        }
        let Ok(expected) = crypto::sign(
            body.as_bytes(),
            &EncodingKey::from_secret(self.state_secret.as_bytes()),
            Algorithm::HS256,
        ) else {
            return Value::Null;
        };
        if !bool::from(signature.as_bytes().ct_eq(expected.as_bytes())) {
            return Value::Null;
        }
        // Buffer.from(base64) accepts both alphabets, ignores junk and stops at padding.
        let compact: Vec<u8> = body
            .bytes()
            .take_while(|b| *b != b'=')
            .filter_map(|b| match b {
                b'-' => Some(b'+'),
                b'_' => Some(b'/'),
                b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'+' | b'/' => Some(b),
                _ => None,
            })
            .collect();
        let decoder = GeneralPurpose::new(
            &alphabet::STANDARD,
            GeneralPurposeConfig::new()
                .with_decode_padding_mode(DecodePaddingMode::Indifferent)
                .with_decode_allow_trailing_bits(true),
        );
        let Ok(bytes) = decoder.decode(compact) else {
            return Value::Null;
        };
        let Ok(v) = serde_json::from_str::<Value>(&String::from_utf8_lossy(&bytes)) else {
            return Value::Null;
        };
        if !truthy(&v["userId"]) || !truthy(&v["agentId"]) {
            return Value::Null;
        }
        json!({"userId":v["userId"],"agentId":v["agentId"]})
    }
}

fn js_string(value: &Value) -> String {
    match value {
        Value::String(s) => s.clone(),
        Value::Null => "null".into(),
        Value::Array(a) => a
            .iter()
            .map(|v| {
                if v.is_null() {
                    String::new()
                } else {
                    js_string(v)
                }
            })
            .collect::<Vec<_>>()
            .join(","),
        Value::Object(_) => "[object Object]".into(),
        other => other.to_string(),
    }
}

#[cfg(test)]
mod token_cache_residency_tests {
    use super::*;
    use std::sync::{
        Barrier,
        atomic::{AtomicI64, Ordering},
        mpsc,
    };

    fn service(now: Arc<AtomicI64>) -> AgentGithubAppService {
        AgentGithubAppService::new(None, None, Arc::new(move || now.load(Ordering::SeqCst)))
    }
    fn binding() -> Value {
        json!({"appId":"app","installationId":"installation"})
    }
    fn minted(token: &str, expires_at: i64) -> Value {
        json!({"token":token,"expires_at":iso(expires_at).unwrap(),"permissions":{"contents":"read"}})
    }
    fn assert_bounded(service: &AgentGithubAppService) {
        let cache = service.token_cache_lock();
        assert!(cache.len() <= TOKEN_CACHE_MAX_ENTRIES);
        assert!(
            cache
                .values()
                .map(|entry| entry.payload_bytes)
                .sum::<usize>()
                <= TOKEN_CACHE_MAX_PAYLOAD_BYTES
        );
    }

    #[test]
    fn token_cache_count_bound_evicts_earliest_expiry_with_stable_owner_ties() {
        let service = service(Arc::new(AtomicI64::new(0)));
        for index in 0..TOKEN_CACHE_MAX_ENTRIES {
            service
                .store_token(
                    "u",
                    &format!("agent-{index:03}"),
                    &binding(),
                    &minted("original", 180_000),
                )
                .unwrap();
        }
        service
            .store_token("u", "new", &binding(), &minted("new", 240_000))
            .unwrap();
        assert!(service.cached_token("u", "agent-000", &binding()).is_none());
        assert_eq!(
            service.cached_token("u", "agent-001", &binding()).unwrap()["token"],
            "original"
        );
        assert_eq!(
            service.cached_token("u", "new", &binding()).unwrap()["token"],
            "new"
        );
        assert_bounded(&service);
    }

    #[test]
    fn token_cache_replacement_at_capacity_preserves_other_owners() {
        let service = service(Arc::new(AtomicI64::new(0)));
        for index in 0..TOKEN_CACHE_MAX_ENTRIES {
            service
                .store_token(
                    "u",
                    &format!("a-{index}"),
                    &binding(),
                    &minted("old", 180_000),
                )
                .unwrap();
        }
        service
            .store_token("u", "a-7", &binding(), &minted("replacement", 300_000))
            .unwrap();
        assert_eq!(service.token_cache_lock().len(), TOKEN_CACHE_MAX_ENTRIES);
        assert_eq!(
            service.cached_token("u", "a-7", &binding()).unwrap()["token"],
            "replacement"
        );
        assert!(service.cached_token("u", "a-0", &binding()).is_some());
        assert_bounded(&service);
    }

    #[test]
    fn token_cache_payload_budget_and_oversized_replacement_do_not_retain_old_token() {
        let service = service(Arc::new(AtomicI64::new(0)));
        let mut payload = minted("valid", 180_000);
        payload["permissions"]["contents"] = json!("r".repeat(600_000));
        for index in 0..10 {
            service
                .store_token("u", &format!("a-{index}"), &binding(), &payload)
                .unwrap();
        }
        assert!(service.token_cache_lock().len() < 10);
        assert_bounded(&service);
        service
            .store_token("u", "target", &binding(), &minted("old", 180_000))
            .unwrap();
        payload["permissions"]["contents"] = json!("r".repeat(TOKEN_CACHE_MAX_PAYLOAD_BYTES));
        assert_eq!(
            service
                .store_token("u", "target", &binding(), &payload)
                .unwrap(),
            180_000
        );
        assert!(service.cached_token("u", "target", &binding()).is_none());
        assert_bounded(&service);
    }

    #[test]
    fn token_cache_reads_and_writes_prune_idle_owners_at_exact_skew_boundary() {
        let now = Arc::new(AtomicI64::new(0));
        let service = service(Arc::clone(&now));
        service
            .store_token("idle", "a", &binding(), &minted("idle", 120_000))
            .unwrap();
        service
            .store_token("active", "a", &binding(), &minted("active", 240_000))
            .unwrap();
        now.store(59_999, Ordering::SeqCst);
        assert!(service.cached_token("idle", "a", &binding()).is_some());
        now.store(60_000, Ordering::SeqCst);
        assert!(service.cached_token("active", "a", &binding()).is_some());
        assert_eq!(service.token_cache_lock().len(), 1);
        now.store(180_000, Ordering::SeqCst);
        service
            .store_token("new", "a", &binding(), &minted("new", 360_000))
            .unwrap();
        assert_eq!(service.token_cache_lock().len(), 1);
        service
            .store_token("new", "a", &binding(), &minted("expired", 240_000))
            .unwrap();
        assert!(service.token_cache_lock().is_empty());
    }

    #[test]
    fn token_cache_binding_separates_owner_pairs_and_app_installation_identity() {
        let service = service(Arc::new(AtomicI64::new(0)));
        service
            .store_token("u::x", "a", &binding(), &minted("first", 180_000))
            .unwrap();
        service
            .store_token("u", "x::a", &binding(), &minted("second", 180_000))
            .unwrap();
        assert_eq!(
            service.cached_token("u::x", "a", &binding()).unwrap()["token"],
            "first"
        );
        assert_eq!(
            service.cached_token("u", "x::a", &binding()).unwrap()["token"],
            "second"
        );
        let different_app = json!({"appId":"other","installationId":"installation"});
        assert!(service.cached_token("u::x", "a", &different_app).is_none());
        assert!(service.cached_token("u::x", "a", &binding()).is_none());
        let different_installation = json!({"appId":"app","installationId":"other"});
        assert!(
            service
                .cached_token("u", "x::a", &different_installation)
                .is_none()
        );
        assert!(service.token_cache_lock().is_empty());
    }

    #[test]
    fn token_cache_stale_lookup_cannot_erase_concurrent_refresh() {
        let (entered_tx, entered_rx) = mpsc::channel();
        let (release_tx, release_rx) = mpsc::channel();
        let release_rx = Mutex::new(release_rx);
        let now = Arc::new(AtomicI64::new(0));
        let current = Arc::clone(&now);
        let service = Arc::new(AgentGithubAppService::new(
            None,
            None,
            Arc::new(move || {
                if std::thread::current().name() == Some("stale-cache-lookup") {
                    entered_tx.send(()).unwrap();
                    release_rx
                        .lock()
                        .unwrap()
                        .recv_timeout(Duration::from_secs(5))
                        .unwrap();
                }
                current.load(Ordering::SeqCst)
            }),
        ));
        service
            .store_token("u", "a", &binding(), &minted("old", 120_000))
            .unwrap();
        now.store(60_000, Ordering::SeqCst);
        let reader_service = Arc::clone(&service);
        let reader = std::thread::Builder::new()
            .name("stale-cache-lookup".into())
            .spawn(move || reader_service.cached_token("u", "a", &binding()))
            .unwrap();
        entered_rx.recv_timeout(Duration::from_secs(5)).unwrap();
        // Freshness and removal are protected by one mutex. In the former
        // split-lock implementation a stale reader paused here allowed a writer
        // to replace the token, then erased that fresh replacement by key.
        assert!(service.token_cache.try_lock().is_err());
        let writer_service = Arc::clone(&service);
        let writer = std::thread::spawn(move || {
            writer_service
                .store_token("u", "a", &binding(), &minted("refreshed", 360_000))
                .unwrap();
        });
        release_tx.send(()).unwrap();
        assert!(reader.join().unwrap().is_none());
        writer.join().unwrap();
        assert_eq!(
            service.cached_token("u", "a", &binding()).unwrap()["token"],
            "refreshed"
        );
    }

    #[test]
    fn token_cache_concurrent_admission_keeps_budgets_and_admits_latest_owners() {
        let service = Arc::new(service(Arc::new(AtomicI64::new(0))));
        let barrier = Arc::new(Barrier::new(8));
        let mut threads = Vec::new();
        for writer in 0..8 {
            let service = Arc::clone(&service);
            let barrier = Arc::clone(&barrier);
            threads.push(std::thread::spawn(move || {
                barrier.wait();
                for index in 0..80 {
                    service
                        .store_token(
                            &format!("u-{writer}"),
                            &format!("a-{index}"),
                            &binding(),
                            &minted("valid", 180_000 + index * 1000),
                        )
                        .unwrap();
                    assert_bounded(&service);
                }
            }));
        }
        for thread in threads {
            thread.join().unwrap();
        }
        assert_bounded(&service);
        for writer in 0..8 {
            assert!(
                service
                    .cached_token(&format!("u-{writer}"), "a-79", &binding())
                    .is_some()
            );
        }
    }
}
