//! Owner-scoped GitLab, Gitea and Bitbucket Cloud HTTP effects.
//!
//! Uses the existing pinned-destination / secret-authority pattern from HA/STT,
//! SsrfGuard and canonical cancellation. The transport module has no generic
//! scoped client yet; this port authorizes each concrete request, never an origin
//! wildcard. Host composition supplies one shared admission budget and resolves
//! credentials and DNS under existing consent; model input cannot create grants.
use super::git_forge::{ForgePrInput, ForgeProvider, ForgeRepository, bounded_text, branch};
use crate::{execution::process_runner::ProcessCancellation, security::ssrf_guard::SsrfGuard};
use base64::Engine;
use futures_util::future::BoxFuture;
use reqwest::header::{AUTHORIZATION, HeaderValue};
use serde::Serialize;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    net::{IpAddr, SocketAddr},
    sync::Arc,
    time::{Duration, SystemTime},
};
use tokio::{
    sync::{OwnedSemaphorePermit, Semaphore},
    time::Instant,
};
use url::Url;

const PAGE_SIZE: usize = 100;
const MAX_PAGES: usize = 12;
const MAX_REQUESTS: usize = 32;
const MAX_RESPONSE: usize = 4 * 1024 * 1024;
const MAX_TOTAL: usize = 12 * 1024 * 1024;
const MAX_INPUT: usize = 256 * 1024;
const DEADLINE: Duration = Duration::from_secs(30);

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum HttpForgeError {
    InvalidInput,
    Denied,
    Cancelled,
    TimedOut,
    Busy,
    Transport,
    OutputLimit,
    PageLimit,
    MalformedResponse,
    HttpStatus(u16),
    UnsupportedProvider,
    /// Dispatch began: the remote write may have happened. Reconcile, never retry.
    WriteUncertain,
}
pub type Result<T> = std::result::Result<T, HttpForgeError>;
impl std::fmt::Display for HttpForgeError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{self:?}")
    }
}
impl std::error::Error for HttpForgeError {}

/// Authenticated runtime identity, never populated from forge/tool arguments.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ForgeHttpScope {
    pub owner_id: String,
    pub session_id: String,
    pub vantage: String,
}
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ForgeHttpRequest {
    /// Host authority journals this attempt before granting a mutation.
    pub effect_id: String,
    pub scope: ForgeHttpScope,
    pub provider: ForgeProvider,
    pub repository: ForgeRepository,
    pub operation: &'static str,
    pub url: Url,
    pub method: &'static str,
    pub body: Option<Value>,
}
/// Neither Debug nor Serialize. No ambient credential lookup or login writes.
pub enum ForgeHttpCredential {
    Bearer(String),
    Token(String),
    Basic { username: String, password: String },
}
impl ForgeHttpCredential {
    fn header(&self) -> Result<HeaderValue> {
        let valid = |s: &str| {
            !s.trim().is_empty() && s.len() <= 16 * 1024 && !s.chars().any(char::is_control)
        };
        let text = match self {
            Self::Bearer(s) if valid(s) => format!("Bearer {s}"),
            Self::Token(s) if valid(s) => format!("token {s}"),
            Self::Basic { username, password }
                if valid(username) && valid(password) && !username.contains(':') =>
            {
                format!(
                    "Basic {}",
                    base64::engine::general_purpose::STANDARD
                        .encode(format!("{username}:{password}"))
                )
            }
            _ => return Err(HttpForgeError::Denied),
        };
        let mut header = HeaderValue::from_str(&text).map_err(|_| HttpForgeError::Denied)?;
        header.set_sensitive(true);
        Ok(header)
    }
    fn redact(&self, text: &str) -> String {
        let mut output = text.to_owned();
        match self {
            Self::Bearer(s) | Self::Token(s) => output = output.replace(s, "[REDACTED]"),
            Self::Basic { username, password } => {
                output = output.replace(
                    &base64::engine::general_purpose::STANDARD
                        .encode(format!("{username}:{password}")),
                    "[REDACTED]",
                );
                output = output.replace(password, "[REDACTED]");
            }
        }
        output
    }
}
/// Trusted authority returns the exact approved request, resolved unicast addresses
/// (with exact port), credential and expiry after checking revocation/consent.
/// Private addresses need explicit authorization; private IP/reachability is no grant.
/// No deserialization constructor is provided. A grant is consumed once per request.
pub struct ForgeHttpGrant {
    pub request: ForgeHttpRequest,
    pub addresses: Vec<SocketAddr>,
    pub credential: ForgeHttpCredential,
    pub expires_at: Instant,
    pub private_authorized: bool,
    /// Plain HTTP is permitted only when all pins are loopback, for local fixtures.
    pub loopback_http_authorized: bool,
}
pub type ForgeHttpAuthority =
    Arc<dyn Fn(ForgeHttpRequest) -> BoxFuture<'static, Result<ForgeHttpGrant>> + Send + Sync>;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpEvidence {
    pub effect_id: String,
    pub owner_id: String,
    pub session_id: String,
    pub vantage: String,
    pub repository: String,
    pub provider: ForgeProvider,
    pub protocol: &'static str,
    pub operation: &'static str,
    pub method: &'static str,
    pub url: String,
    pub observed_unix_ms: u128,
    pub status: u16,
    pub response_bytes: usize,
    pub request_body_sha256: String,
    pub response_sha256: String,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Observed<T> {
    pub value: T,
    pub evidence: Vec<HttpEvidence>,
    pub coverage_gaps: Vec<String>,
}
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ForgeIdentity {
    pub username: String,
    pub account_id: Option<String>,
}
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct HttpPullRequest {
    pub status: &'static str,
    pub url: String,
    pub number: u64,
    pub base_branch: String,
    pub head_branch: String,
    pub title: String,
    pub state: &'static str,
}
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct HttpPrCheck {
    pub name: String,
    pub state: String,
    pub conclusion: String,
    pub started_at: String,
    pub completed_at: String,
    pub details_url: String,
}
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct HttpDiffStats {
    pub files: u64,
    pub insertions: u64,
    pub deletions: u64,
    pub has_changes: bool,
}
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct HttpFilePatch {
    pub path: String,
    pub previous_path: Option<String>,
    pub status: &'static str,
    /// A patch is not reconstructed full-file content. None means unavailable.
    pub patch: Option<String>,
}
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct HttpFilePatches {
    pub files: Vec<HttpFilePatch>,
    /// Bitbucket exposes the PR's unified patch separately from diffstat metadata.
    pub unified_patch: Option<String>,
}

/// Retain one Arc<HttpForge> per authenticated owner/session/repository. Its lane
/// serializes whole operations, with no waiting queue. Runtime session ownership
/// must also exclude other adapter instances and process-backed repository effects.
/// The shared admission semaphore is supplied by composition (bounded host budget),
/// never constructed from request input. Dropping a call cancels its socket future;
/// the host must reconcile any approved mutation whose completion was abandoned.
pub struct HttpForge {
    provider: ForgeProvider,
    repository: ForgeRepository,
    scope: ForgeHttpScope,
    base: Url,
    authority: ForgeHttpAuthority,
    admission: Arc<Semaphore>,
    owner_lane: Arc<Semaphore>,
}
struct Flow {
    _permit: OwnedSemaphorePermit,
    _owner: OwnedSemaphorePermit,
    cancel: ProcessCancellation,
    deadline: Instant,
    count: usize,
    bytes: usize,
    write_dispatched: bool,
    evidence: Vec<HttpEvidence>,
}
struct Response {
    bytes: Vec<u8>,
    redirect: Option<String>,
}
impl Response {
    fn json(&self) -> Result<Value> {
        serde_json::from_slice(&self.bytes).map_err(|_| HttpForgeError::MalformedResponse)
    }
}
impl Flow {
    fn finish<T>(self, value: T, coverage_gaps: Vec<String>) -> Result<Observed<T>> {
        if self.cancel.is_cancelled() {
            return Err(if self.write_dispatched {
                HttpForgeError::WriteUncertain
            } else {
                HttpForgeError::Cancelled
            });
        }
        if Instant::now() >= self.deadline {
            return Err(if self.write_dispatched {
                HttpForgeError::WriteUncertain
            } else {
                HttpForgeError::TimedOut
            });
        }
        Ok(Observed {
            value,
            evidence: self.evidence,
            coverage_gaps,
        })
    }
}
impl HttpForge {
    /// `api_base` is captured trusted configuration, never a URL supplied by a tool.
    /// Supports explicit ports for self-hosted GitLab/Gitea. No arbitrary base prefix.
    pub fn new(
        provider: ForgeProvider,
        repository: ForgeRepository,
        scope: ForgeHttpScope,
        api_base: &str,
        authority: ForgeHttpAuthority,
        admission: Arc<Semaphore>,
    ) -> Result<Self> {
        let (host, path) = match provider {
            ForgeProvider::Gitlab => (repository.host(), "/api/v4"),
            ForgeProvider::Gitea => (repository.host(), "/api/v1"),
            ForgeProvider::Bitbucket if repository.host() == "bitbucket.org" => {
                ("api.bitbucket.org", "/2.0")
            }
            _ => return Err(HttpForgeError::UnsupportedProvider),
        };
        if [&scope.owner_id, &scope.session_id, &scope.vantage]
            .iter()
            .any(|s| s.trim().is_empty() || s.len() > 512 || s.chars().any(char::is_control))
        {
            return Err(HttpForgeError::InvalidInput);
        }
        let base = Url::parse(api_base).map_err(|_| HttpForgeError::InvalidInput)?;
        if base.host_str() != Some(host)
            || !matches!(base.scheme(), "http" | "https")
            || base.path() != path
            || base.query().is_some()
            || base.fragment().is_some()
            || !base.username().is_empty()
            || base.password().is_some()
            || base.port() == Some(0)
            || api_base.len() > 8192
            || repository
                .target()
                .strip_prefix(&format!("{}/", repository.host()))
                .is_none()
            || (provider != ForgeProvider::Gitlab && repository.target().split('/').count() != 3)
            || (provider != ForgeProvider::Gitlab
                && repository
                    .api_path()
                    .trim_start_matches("repos/")
                    .split('/')
                    .count()
                    != 2)
        {
            return Err(HttpForgeError::InvalidInput);
        }
        Ok(Self {
            provider,
            repository,
            scope,
            base,
            authority,
            admission,
            owner_lane: Arc::new(Semaphore::new(1)),
        })
    }
    fn begin(&self, cancel: ProcessCancellation) -> Result<Flow> {
        if cancel.is_cancelled() {
            return Err(HttpForgeError::Cancelled);
        }
        let permit = self
            .admission
            .clone()
            .try_acquire_owned()
            .map_err(|_| HttpForgeError::Busy)?;
        let owner = self
            .owner_lane
            .clone()
            .try_acquire_owned()
            .map_err(|_| HttpForgeError::Busy)?;
        Ok(Flow {
            _permit: permit,
            _owner: owner,
            cancel,
            deadline: Instant::now() + DEADLINE,
            count: 0,
            bytes: 0,
            write_dispatched: false,
            evidence: vec![],
        })
    }
    fn url(&self, suffix: &[&str]) -> Url {
        let mut url = self.base.clone();
        let target = self.repository.target();
        // Repository was constructed by canonical validation. Strip only exact host.
        let full = target
            .strip_prefix(self.repository.host())
            .unwrap_or("")
            .trim_start_matches('/');
        let mut segments = url.path_segments_mut().expect("validated HTTP URL");
        match self.provider {
            ForgeProvider::Gitlab => {
                segments.push("projects").push(full);
            }
            ForgeProvider::Gitea => {
                segments.push("repos");
                for s in full.split('/') {
                    segments.push(s);
                }
            }
            ForgeProvider::Bitbucket => {
                segments.push("repositories");
                for s in full.split('/') {
                    segments.push(s);
                }
            }
            _ => unreachable!("constructor restricts HTTP providers"),
        }
        segments.extend(suffix.iter().copied());
        drop(segments);
        url
    }
    fn root_url(&self, path: &str) -> Url {
        let mut url = self.base.clone();
        url.path_segments_mut()
            .expect("validated HTTP URL")
            .push(path);
        url
    }
    fn pr_segment(&self) -> &'static str {
        match self.provider {
            ForgeProvider::Gitlab => "merge_requests",
            ForgeProvider::Gitea => "pulls",
            _ => "pullrequests",
        }
    }
    fn protocol(&self) -> &'static str {
        match self.provider {
            ForgeProvider::Gitlab => "gitlab-v4",
            ForgeProvider::Gitea => "gitea-v1",
            _ => "bitbucket-cloud-v2",
        }
    }

    async fn request(
        &self,
        flow: &mut Flow,
        operation: &'static str,
        url: Url,
        body: Option<Value>,
    ) -> Result<Response> {
        if flow.cancel.is_cancelled() {
            return Err(HttpForgeError::Cancelled);
        }
        if flow.count >= MAX_REQUESTS {
            return Err(HttpForgeError::PageLimit);
        }
        if Instant::now() >= flow.deadline {
            return Err(HttpForgeError::TimedOut);
        }
        let payload = body
            .as_ref()
            .map(serde_json::to_vec)
            .transpose()
            .map_err(|_| HttpForgeError::InvalidInput)?
            .unwrap_or_default();
        if payload.len() > MAX_INPUT {
            return Err(HttpForgeError::OutputLimit);
        }
        let request = ForgeHttpRequest {
            effect_id: uuid::Uuid::new_v4().to_string(),
            scope: self.scope.clone(),
            provider: self.provider,
            repository: self.repository.clone(),
            operation,
            url: url.clone(),
            method: if body.is_some() { "POST" } else { "GET" },
            body,
        };
        let approval_deadline = flow.deadline.min(Instant::now() + Duration::from_secs(5));
        let grant = tokio::select! {
            biased;
            _ = flow.cancel.wait_cancelled() => return Err(HttpForgeError::Cancelled),
            result = tokio::time::timeout_at(approval_deadline, (self.authority)(request.clone())) => result.map_err(|_| HttpForgeError::TimedOut)??,
        };
        validate_grant(&request, &grant)?;
        let header = grant.credential.header()?;
        let hostname = url
            .host_str()
            .ok_or(HttpForgeError::Denied)?
            .trim_matches(['[', ']']);
        // Same bounded pinned-client pattern as HA/STT. No fallback resolver, proxy,
        // cookie store, redirect following, decompression or protocol-level retries.
        let client = reqwest::Client::builder()
            .no_proxy()
            .retry(reqwest::retry::never())
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(Duration::from_secs(3))
            .timeout(DEADLINE)
            .pool_max_idle_per_host(0)
            .no_gzip()
            .no_brotli()
            .no_deflate()
            .no_zstd()
            .resolve_to_addrs(hostname, &grant.addresses)
            .build()
            .map_err(|_| HttpForgeError::Transport)?;
        let mut builder = client
            .request(
                if request.body.is_some() {
                    reqwest::Method::POST
                } else {
                    reqwest::Method::GET
                },
                url.clone(),
            )
            .header(AUTHORIZATION, header)
            .header("accept", "application/json");
        if request.body.is_some() {
            builder = builder
                .header("content-type", "application/json")
                .body(payload.clone());
        }
        let deadline = flow.deadline.min(grant.expires_at);
        if flow.cancel.is_cancelled() {
            return Err(HttpForgeError::Cancelled);
        }
        if Instant::now() >= deadline {
            return Err(HttpForgeError::Denied);
        }
        flow.count += 1;
        flow.write_dispatched |= request.body.is_some();
        let remaining = MAX_RESPONSE.min(MAX_TOTAL.saturating_sub(flow.bytes));
        let effect = async {
            let mut response = builder
                .send()
                .await
                .map_err(|_| HttpForgeError::Transport)?;
            let status = response.status().as_u16();
            let redirect = if operation == "patch"
                && self.provider == ForgeProvider::Bitbucket
                && matches!(status, 302 | 303 | 307 | 308)
                && request.body.is_none()
            {
                Some(
                    response
                        .headers()
                        .get(reqwest::header::LOCATION)
                        .and_then(|h| h.to_str().ok())
                        .filter(|s| s.len() <= 8192)
                        .ok_or(HttpForgeError::Denied)?
                        .to_owned(),
                )
            } else {
                None
            };
            if response
                .content_length()
                .is_some_and(|n| n > remaining as u64)
            {
                return Err(HttpForgeError::OutputLimit);
            }
            let mut bytes = Vec::new();
            while let Some(chunk) = response
                .chunk()
                .await
                .map_err(|_| HttpForgeError::Transport)?
            {
                if chunk.len() > remaining.saturating_sub(bytes.len()) {
                    return Err(HttpForgeError::OutputLimit);
                }
                bytes.extend_from_slice(&chunk);
            }
            Ok((status, bytes, redirect))
        };
        let result: Result<(u16, Vec<u8>, Option<String>)> = tokio::select! {
            biased;
            _ = flow.cancel.wait_cancelled() => Err(HttpForgeError::Cancelled),
            result = tokio::time::timeout_at(deadline, effect) => result.unwrap_or(Err(HttpForgeError::TimedOut)),
        };
        let write = request.body.is_some();
        let (status, bytes, redirect) = result.map_err(|e| {
            if write {
                HttpForgeError::WriteUncertain
            } else {
                e
            }
        })?;
        flow.bytes += bytes.len();
        flow.evidence.push(HttpEvidence {
            effect_id: request.effect_id.clone(),
            owner_id: self.scope.owner_id.clone(),
            session_id: self.scope.session_id.clone(),
            vantage: self.scope.vantage.clone(),
            repository: self.repository.target(),
            provider: self.provider,
            protocol: self.protocol(),
            operation,
            method: request.method,
            url: url.to_string(),
            observed_unix_ms: SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis(),
            status,
            response_bytes: bytes.len(),
            request_body_sha256: hex::encode(Sha256::digest(&payload)),
            response_sha256: hex::encode(Sha256::digest(&bytes)),
        });
        if !(200..300).contains(&status) && redirect.is_none() {
            // A POST 5xx/redirect may follow a committed write. Never replay it.
            return Err(if write {
                HttpForgeError::WriteUncertain
            } else {
                HttpForgeError::HttpStatus(status)
            });
        }
        // Raw bytes are transient; errors never include diagnostics or response bodies.
        // Redact decoded values to avoid escaping a secret echoed by an untrusted server.
        let bytes = if let Ok(mut value) = serde_json::from_slice::<Value>(&bytes) {
            redact_json(&mut value, &grant.credential);
            serde_json::to_vec(&value).map_err(|_| HttpForgeError::MalformedResponse)?
        } else {
            grant
                .credential
                .redact(std::str::from_utf8(&bytes).map_err(|_| {
                    if write {
                        HttpForgeError::WriteUncertain
                    } else {
                        HttpForgeError::MalformedResponse
                    }
                })?)
                .into_bytes()
        };
        if bytes.len() > MAX_RESPONSE {
            return Err(if write {
                HttpForgeError::WriteUncertain
            } else {
                HttpForgeError::OutputLimit
            });
        }
        Ok(Response { bytes, redirect })
    }
    async fn json(&self, flow: &mut Flow, op: &'static str, url: Url) -> Result<Value> {
        self.request(flow, op, url, None).await?.json()
    }
    /// Array APIs use explicit numbered pages; opaque links are never fetched.
    /// Bitbucket `next` must equal the next locally constructed URL, including filters.
    async fn page(
        &self,
        flow: &mut Flow,
        op: &'static str,
        base: &Url,
        page: usize,
    ) -> Result<(Vec<Value>, bool)> {
        let mut url = base.clone();
        url.query_pairs_mut()
            .append_pair(
                if self.provider == ForgeProvider::Bitbucket {
                    "pagelen"
                } else if self.provider == ForgeProvider::Gitlab {
                    "per_page"
                } else {
                    "limit"
                },
                &PAGE_SIZE.to_string(),
            )
            .append_pair("page", &page.to_string());
        let data = self.json(flow, op, url.clone()).await?;
        if self.provider == ForgeProvider::Bitbucket {
            let items = data
                .get("values")
                .and_then(Value::as_array)
                .ok_or(HttpForgeError::MalformedResponse)?
                .clone();
            if items.len() > PAGE_SIZE {
                return Err(HttpForgeError::OutputLimit);
            }
            let more = match data.get("next") {
                None | Some(Value::Null) => false,
                Some(Value::String(next)) => {
                    let next = Url::parse(next).map_err(|_| HttpForgeError::Denied)?;
                    let mut expected = base.clone();
                    expected
                        .query_pairs_mut()
                        .append_pair("pagelen", &PAGE_SIZE.to_string())
                        .append_pair("page", &(page + 1).to_string());
                    if !same_page_url(&next, &expected) {
                        return Err(HttpForgeError::Denied);
                    }
                    true
                }
                _ => return Err(HttpForgeError::MalformedResponse),
            };
            Ok((items, more))
        } else {
            let items = data
                .as_array()
                .ok_or(HttpForgeError::MalformedResponse)?
                .clone();
            if items.len() > PAGE_SIZE {
                return Err(HttpForgeError::OutputLimit);
            }
            // Some servers cap page size below the requested limit. Only an empty
            // numbered page proves exhaustion without trusting opaque Link targets.
            let more = !items.is_empty();
            Ok((items, more))
        }
    }
    async fn pages(&self, flow: &mut Flow, op: &'static str, base: Url) -> Result<Vec<Value>> {
        let mut output = vec![];
        for page in 1..=MAX_PAGES {
            let (items, more) = self.page(flow, op, &base, page).await?;
            output.extend(items);
            if !more {
                return Ok(output);
            }
        }
        Err(HttpForgeError::PageLimit)
    }

    pub async fn identity(&self, cancel: ProcessCancellation) -> Result<Observed<ForgeIdentity>> {
        let mut flow = self.begin(cancel)?;
        let data = self
            .json(&mut flow, "identity", self.root_url("user"))
            .await?;
        let username = match self.provider {
            ForgeProvider::Gitlab => text(&data, "/username")?,
            ForgeProvider::Gitea => text(&data, "/login")?,
            _ => data
                .get("username")
                .and_then(Value::as_str)
                .or_else(|| data.get("display_name").and_then(Value::as_str))
                .filter(|s| !s.is_empty())
                .ok_or(HttpForgeError::MalformedResponse)?
                .into(),
        };
        let account_id = data
            .get("uuid")
            .or_else(|| data.get("id"))
            .map(|v| match v {
                Value::String(s) => s.clone(),
                _ => v.to_string(),
            });
        flow.finish(
            ForgeIdentity {
                username,
                account_id,
            },
            vec![],
        )
    }
    pub async fn default_branch(
        &self,
        cancel: ProcessCancellation,
    ) -> Result<Observed<Option<String>>> {
        let mut flow = self.begin(cancel)?;
        let data = self
            .json(&mut flow, "default-branch", self.url(&[]))
            .await?;
        let pointer = if self.provider == ForgeProvider::Bitbucket {
            "/mainbranch/name"
        } else {
            "/default_branch"
        };
        let value = match data.pointer(pointer) {
            None | Some(Value::Null) => None,
            Some(Value::String(s)) => {
                branch(s).map_err(|_| HttpForgeError::MalformedResponse)?;
                Some(s.clone())
            }
            _ => return Err(HttpForgeError::MalformedResponse),
        };
        flow.finish(value, vec![])
    }
    async fn find(&self, flow: &mut Flow, head: &str) -> Result<Option<Value>> {
        branch(head).map_err(|_| HttpForgeError::InvalidInput)?;
        let mut url = self.url(&[self.pr_segment()]);
        match self.provider {
            ForgeProvider::Gitlab => {
                url.query_pairs_mut()
                    .append_pair("source_branch", head)
                    .append_pair("state", "opened");
            }
            ForgeProvider::Gitea => {
                let full = self.repository.api_path();
                let owner = full
                    .strip_prefix("repos/")
                    .and_then(|s| s.split('/').next())
                    .ok_or(HttpForgeError::InvalidInput)?;
                url.query_pairs_mut()
                    .append_pair("state", "open")
                    .append_pair("head", &format!("{owner}:{head}"));
            }
            _ => {
                // Branch quotes/backslashes are escaped for Bitbucket's filter grammar
                // before URL query encoding. Encoding alone does not escape the DSL.
                let quoted = head.replace('\\', "\\\\").replace('"', "\\\"");
                url.query_pairs_mut()
                    .append_pair("q", &format!("source.branch.name=\"{quoted}\""))
                    .append_pair("state", "OPEN");
            }
        }
        for page in 1..=MAX_PAGES {
            let (items, more) = self.page(flow, "find-pr", &url, page).await?;
            for item in items {
                let parsed = self.parse_pr(&item, "opened_existing")?;
                if parsed.head_branch == head && parsed.state == "open" {
                    return Ok(Some(item));
                }
            }
            if !more {
                return Ok(None);
            }
        }
        Err(HttpForgeError::PageLimit)
    }
    pub async fn find_existing_pr(
        &self,
        head: &str,
        cancel: ProcessCancellation,
    ) -> Result<Observed<Option<HttpPullRequest>>> {
        let mut flow = self.begin(cancel)?;
        let value = self
            .find(&mut flow, head)
            .await?
            .map(|v| self.parse_pr(&v, "opened_existing"))
            .transpose()?;
        flow.finish(value, vec![])
    }
    pub async fn create_pr(
        &self,
        input: &ForgePrInput,
        cancel: ProcessCancellation,
    ) -> Result<Observed<HttpPullRequest>> {
        branch(&input.head_branch)
            .and_then(|_| branch(&input.base_branch))
            .and_then(|_| bounded_text(&input.title, 4096))
            .and_then(|_| bounded_text(&input.body, 128 * 1024))
            .map_err(|_| HttpForgeError::InvalidInput)?;
        if input.title.trim().is_empty() {
            return Err(HttpForgeError::InvalidInput);
        }
        let mut flow = self.begin(cancel)?;
        let body = match self.provider {
            ForgeProvider::Gitlab => {
                json!({"title":input.title,"source_branch":input.head_branch,"target_branch":input.base_branch,"description":input.body})
            }
            ForgeProvider::Gitea => {
                json!({"title":input.title,"head":input.head_branch,"base":input.base_branch,"body":input.body})
            }
            _ => {
                json!({"title":input.title,"source":{"branch":{"name":input.head_branch}},"destination":{"branch":{"name":input.base_branch}},"description":input.body})
            }
        };
        let response = self
            .request(
                &mut flow,
                "create-pr",
                self.url(&[self.pr_segment()]),
                Some(body),
            )
            .await?;
        let data = response
            .json()
            .map_err(|_| HttpForgeError::WriteUncertain)?;
        let value = self
            .parse_pr(&data, "created")
            .map_err(|_| HttpForgeError::WriteUncertain)?;
        if value.head_branch != input.head_branch
            || value.base_branch != input.base_branch
            || value.state != "open"
        {
            return Err(HttpForgeError::WriteUncertain);
        }
        flow.finish(value, vec![])
    }
    fn parse_pr(&self, data: &Value, status: &'static str) -> Result<HttpPullRequest> {
        let (id, link, base, head) = match self.provider {
            ForgeProvider::Gitlab => ("/iid", "/web_url", "/target_branch", "/source_branch"),
            ForgeProvider::Gitea => ("/number", "/html_url", "/base/ref", "/head/ref"),
            _ => (
                "/id",
                "/links/html/href",
                "/destination/branch/name",
                "/source/branch/name",
            ),
        };
        let number = positive(data, id)?;
        let url = text(data, link)?;
        let parsed = Url::parse(&url).map_err(|_| HttpForgeError::MalformedResponse)?;
        // Display links are evidence only, never request authority or callbacks.
        if parsed.scheme() != "https"
            || parsed.host_str() != Some(self.repository.host())
            || !parsed.username().is_empty()
            || parsed.password().is_some()
            || parsed.fragment().is_some()
        {
            return Err(HttpForgeError::MalformedResponse);
        }
        let mut expected = Url::parse(&self.repository.web_url())
            .map_err(|_| HttpForgeError::MalformedResponse)?;
        if self.provider != ForgeProvider::Bitbucket {
            expected
                .set_port(self.base.port())
                .map_err(|_| HttpForgeError::MalformedResponse)?;
        }
        let number_text = number.to_string();
        let suffix: Vec<&str> = match self.provider {
            ForgeProvider::Gitlab => vec!["-", "merge_requests", &number_text],
            ForgeProvider::Gitea => vec!["pulls", &number_text],
            _ => vec!["pull-requests", &number_text],
        };
        expected
            .path_segments_mut()
            .map_err(|_| HttpForgeError::MalformedResponse)?
            .extend(suffix);
        if parsed != expected {
            return Err(HttpForgeError::MalformedResponse);
        }
        let base_branch = text(data, base)?;
        let head_branch = text(data, head)?;
        branch(&base_branch)
            .and_then(|_| branch(&head_branch))
            .map_err(|_| HttpForgeError::MalformedResponse)?;
        let state = match data.get("state").and_then(Value::as_str) {
            Some("opened" | "open" | "OPEN") => {
                if data.get("merged").and_then(Value::as_bool) == Some(true) {
                    "merged"
                } else {
                    "open"
                }
            }
            Some("merged" | "MERGED") => "merged",
            Some("closed" | "DECLINED" | "SUPERSEDED") => "closed",
            _ => return Err(HttpForgeError::MalformedResponse),
        };
        Ok(HttpPullRequest {
            status,
            url,
            number,
            base_branch,
            head_branch,
            title: text(data, "/title")?,
            state,
        })
    }
    pub async fn checks(
        &self,
        head: &str,
        cancel: ProcessCancellation,
    ) -> Result<Observed<Option<Vec<HttpPrCheck>>>> {
        let mut flow = self.begin(cancel)?;
        let Some(pr) = self.find(&mut flow, head).await? else {
            return flow.finish(None, vec![]);
        };
        let pointer = match self.provider {
            ForgeProvider::Gitlab => "/sha",
            ForgeProvider::Gitea => "/head/sha",
            _ => "/source/commit/hash",
        };
        let sha = text(&pr, pointer)?;
        if !matches!(sha.len(), 40 | 64) || !sha.bytes().all(|b| b.is_ascii_hexdigit()) {
            return Err(HttpForgeError::MalformedResponse);
        }
        let url = match self.provider {
            ForgeProvider::Gitlab => self.url(&["repository", "commits", &sha, "statuses"]),
            ForgeProvider::Gitea => self.url(&["statuses", &sha]),
            _ => self.url(&["commit", &sha, "statuses"]),
        };
        let statuses = self.pages(&mut flow, "checks", url).await?;
        let mut output = vec![];
        for value in statuses {
            let (name, state, started, ended, details) = match self.provider {
                ForgeProvider::Gitlab => (
                    "/name",
                    "/status",
                    "/started_at",
                    "/finished_at",
                    "/target_url",
                ),
                ForgeProvider::Gitea => (
                    "/context",
                    "/status",
                    "/created_at",
                    "/updated_at",
                    "/target_url",
                ),
                _ => ("/name", "/state", "/created_on", "/updated_on", "/url"),
            };
            let state = text(&value, state)?;
            let conclusion = match state.to_ascii_lowercase().as_str() {
                "success" | "successful" => "success",
                "failed" | "failure" | "error" => "failure",
                "canceled" | "cancelled" | "stopped" => "cancelled",
                "skipped" => "skipped",
                _ => "",
            }
            .to_owned();
            output.push(HttpPrCheck {
                name: text(&value, name)?,
                state,
                conclusion,
                started_at: optional_text(&value, started)?,
                completed_at: optional_text(&value, ended)?,
                details_url: optional_text(&value, details)?,
            });
        }
        flow.finish(Some(output), vec!["Commit statuses only; provider pipeline jobs and external check suites are not enumerated.".into()])
    }
    fn validate_patch_redirect(&self, pr: &Value, next: &Url) -> Result<()> {
        let head = text(pr, "/source/commit/hash")?;
        let base = text(pr, "/destination/commit/hash")?;
        if [&head, &base]
            .iter()
            .any(|s| !matches!(s.len(), 40 | 64) || !s.bytes().all(|b| b.is_ascii_hexdigit()))
        {
            return Err(HttpForgeError::MalformedResponse);
        }
        let pairs: Vec<_> = next.query_pairs().collect();
        let id = self.parse_pr(pr, "opened_existing")?.number.to_string();
        let mut names = std::collections::HashSet::new();
        for (key, value) in pairs {
            if !names.insert(key.to_string())
                || !((key == "from_pullrequest_id" && value == id)
                    || (key == "topic" && value == "true"))
            {
                return Err(HttpForgeError::Denied);
            }
        }
        let mut candidate = next.clone();
        candidate.set_query(None);
        if [format!("{head}..{base}"), format!("{base}..{head}")]
            .iter()
            .any(|spec| candidate == self.url(&["diff", spec]))
        {
            Ok(())
        } else {
            Err(HttpForgeError::Denied)
        }
    }
    async fn changes(&self, flow: &mut Flow, pr: &Value) -> Result<Vec<Value>> {
        let id = self.parse_pr(pr, "opened_existing")?.number.to_string();
        let suffix = match self.provider {
            ForgeProvider::Gitlab => "changes",
            ForgeProvider::Gitea => "files",
            _ => "diffstat",
        };
        let url = self.url(&[self.pr_segment(), &id, suffix]);
        if self.provider == ForgeProvider::Gitlab {
            let data = self.json(flow, "changes", url).await?;
            if data.get("overflow").and_then(Value::as_bool) == Some(true) {
                return Err(HttpForgeError::OutputLimit);
            }
            let changes = data
                .get("changes")
                .and_then(Value::as_array)
                .ok_or(HttpForgeError::MalformedResponse)?;
            if changes.len() > PAGE_SIZE * MAX_PAGES {
                return Err(HttpForgeError::OutputLimit);
            }
            Ok(changes.clone())
        } else {
            self.pages(flow, "changes", url).await
        }
    }
    pub async fn diff_stats(
        &self,
        head: &str,
        cancel: ProcessCancellation,
    ) -> Result<Observed<Option<HttpDiffStats>>> {
        let mut flow = self.begin(cancel)?;
        let Some(pr) = self.find(&mut flow, head).await? else {
            return flow.finish(None, vec![]);
        };
        let mut gaps = vec![];
        let value = if self.provider == ForgeProvider::Gitea {
            let files = nonnegative(&pr, "/changed_files")?;
            HttpDiffStats {
                files,
                insertions: nonnegative(&pr, "/additions")?,
                deletions: nonnegative(&pr, "/deletions")?,
                has_changes: files > 0,
            }
        } else {
            let changes = self.changes(&mut flow, &pr).await?;
            let (mut insertions, mut deletions) = (0u64, 0u64);
            for value in &changes {
                let (added, removed) = if self.provider == ForgeProvider::Gitlab {
                    if value.get("collapsed").and_then(Value::as_bool) == Some(true)
                        || value.get("too_large").and_then(Value::as_bool) == Some(true)
                    {
                        return Err(HttpForgeError::OutputLimit);
                    }
                    let patch = text_allow_empty(value, "/diff")?;
                    patch_counts(&patch)
                } else {
                    (
                        nonnegative(value, "/lines_added")?,
                        nonnegative(value, "/lines_removed")?,
                    )
                };
                insertions = insertions
                    .checked_add(added)
                    .ok_or(HttpForgeError::OutputLimit)?;
                deletions = deletions
                    .checked_add(removed)
                    .ok_or(HttpForgeError::OutputLimit)?;
            }
            if self.provider == ForgeProvider::Gitlab {
                gaps.push(
                    "Line counts reflect available text patches; binary content is not counted."
                        .into(),
                );
            }
            HttpDiffStats {
                files: changes.len() as u64,
                insertions,
                deletions,
                has_changes: !changes.is_empty(),
            }
        };
        flow.finish(Some(value), gaps)
    }
    pub async fn file_patches(
        &self,
        head: &str,
        cancel: ProcessCancellation,
    ) -> Result<Observed<Option<HttpFilePatches>>> {
        let mut flow = self.begin(cancel)?;
        let Some(pr) = self.find(&mut flow, head).await? else {
            return flow.finish(None, vec![]);
        };
        let changes = self.changes(&mut flow, &pr).await?;
        let mut files = vec![];
        let mut gaps = vec![
            "Patches are untrusted text, not complete original/modified file contents.".into(),
        ];
        for value in changes {
            let (path, previous_path, status, patch) = match self.provider {
                ForgeProvider::Gitlab => {
                    if value.get("collapsed").and_then(Value::as_bool) == Some(true)
                        || value.get("too_large").and_then(Value::as_bool) == Some(true)
                    {
                        return Err(HttpForgeError::OutputLimit);
                    }
                    let status = if value.get("new_file").and_then(Value::as_bool) == Some(true) {
                        "A"
                    } else if value.get("deleted_file").and_then(Value::as_bool) == Some(true) {
                        "D"
                    } else if value.get("renamed_file").and_then(Value::as_bool) == Some(true) {
                        "R"
                    } else {
                        "M"
                    };
                    (
                        text(&value, "/new_path")?,
                        value
                            .get("old_path")
                            .and_then(Value::as_str)
                            .map(str::to_owned),
                        status,
                        value.get("diff").and_then(Value::as_str).map(str::to_owned),
                    )
                }
                ForgeProvider::Gitea => (
                    text(&value, "/filename")?,
                    value
                        .get("previous_filename")
                        .and_then(Value::as_str)
                        .map(str::to_owned),
                    change_status(&text(&value, "/status")?)?,
                    value
                        .get("patch")
                        .and_then(Value::as_str)
                        .map(str::to_owned),
                ),
                _ => {
                    let path = value
                        .pointer("/new/path")
                        .and_then(Value::as_str)
                        .or_else(|| value.pointer("/old/path").and_then(Value::as_str))
                        .ok_or(HttpForgeError::MalformedResponse)?
                        .to_owned();
                    (
                        path,
                        value
                            .pointer("/old/path")
                            .and_then(Value::as_str)
                            .map(str::to_owned),
                        change_status(&text(&value, "/status")?)?,
                        None,
                    )
                }
            };
            validate_file_path(&path)?;
            if let Some(old) = &previous_path {
                validate_file_path(old)?;
            }
            if patch.is_none() && self.provider != ForgeProvider::Bitbucket {
                gaps.push(format!(
                    "Patch unavailable for {path}; binary or omitted by provider."
                ));
            }
            files.push(HttpFilePatch {
                path,
                previous_path,
                status,
                patch,
            });
        }
        let unified_patch = if self.provider == ForgeProvider::Bitbucket {
            let id = self.parse_pr(&pr, "opened_existing")?.number.to_string();
            let mut url = self.url(&[self.pr_segment(), &id, "diff"]);
            let mut seen = std::collections::HashSet::new();
            let response = loop {
                if !seen.insert(url.to_string()) || seen.len() > 3 {
                    return Err(HttpForgeError::PageLimit);
                }
                let response = self.request(&mut flow, "patch", url.clone(), None).await?;
                let Some(location) = &response.redirect else {
                    break response;
                };
                // Bitbucket's PR diff endpoint may redirect to a commit comparison.
                // Only this exact repository and the snapshot's two hashes qualify.
                // The next request still needs a NEW secret/DNS/destination grant.
                let next = url.join(location).map_err(|_| HttpForgeError::Denied)?;
                self.validate_patch_redirect(&pr, &next)?;
                url = next;
            };
            gaps.push("Bitbucket supplies one unified patch; individual file patch boundaries are not reconstructed.".into());
            Some(String::from_utf8(response.bytes).map_err(|_| HttpForgeError::MalformedResponse)?)
        } else {
            None
        };
        flow.finish(
            Some(HttpFilePatches {
                files,
                unified_patch,
            }),
            gaps,
        )
    }
}

fn validate_grant(request: &ForgeHttpRequest, grant: &ForgeHttpGrant) -> Result<()> {
    let port = request
        .url
        .port_or_known_default()
        .ok_or(HttpForgeError::Denied)?;
    if grant.request != *request
        || grant.expires_at <= Instant::now()
        || grant.addresses.is_empty()
        || grant.addresses.len() > 16
        || grant
            .addresses
            .iter()
            .any(|a| a.port() != port || a.ip().is_unspecified() || a.ip().is_multicast())
    {
        return Err(HttpForgeError::Denied);
    }
    let host = request
        .url
        .host_str()
        .ok_or(HttpForgeError::Denied)?
        .trim_matches(['[', ']']);
    if let Ok(literal) = host.parse::<IpAddr>()
        && grant.addresses.iter().any(|a| a.ip() != literal)
    {
        return Err(HttpForgeError::Denied);
    }
    if request.url.scheme() != "https"
        && !(request.url.scheme() == "http"
            && grant.loopback_http_authorized
            && grant.addresses.iter().all(|a| a.ip().is_loopback()))
    {
        return Err(HttpForgeError::Denied);
    }
    let guard = SsrfGuard {
        allow_private_hosts: grant.private_authorized,
        allowed_hosts: vec![],
    };
    guard
        .validate(request.url.as_str())
        .map_err(|_| HttpForgeError::Denied)?;
    for address in &grant.addresses {
        guard
            .validate(&format!("https://{address}/"))
            .map_err(|_| HttpForgeError::Denied)?;
    }
    Ok(())
}
fn same_page_url(actual: &Url, expected: &Url) -> bool {
    let mut a: Vec<_> = actual
        .query_pairs()
        .map(|(k, v)| (k.into_owned(), v.into_owned()))
        .collect();
    let mut b: Vec<_> = expected
        .query_pairs()
        .map(|(k, v)| (k.into_owned(), v.into_owned()))
        .collect();
    a.sort();
    b.sort();
    let mut origin = actual.clone();
    origin.set_query(None);
    let mut target = expected.clone();
    target.set_query(None);
    origin == target && a == b
}
fn redact_json(value: &mut Value, credential: &ForgeHttpCredential) {
    match value {
        Value::String(s) => *s = credential.redact(s),
        Value::Array(a) => {
            for v in a {
                redact_json(v, credential);
            }
        }
        Value::Object(o) => {
            for v in o.values_mut() {
                redact_json(v, credential);
            }
        }
        _ => (),
    }
}
fn text_allow_empty(value: &Value, pointer: &str) -> Result<String> {
    value
        .pointer(pointer)
        .and_then(Value::as_str)
        .map(str::to_owned)
        .ok_or(HttpForgeError::MalformedResponse)
}
fn text(value: &Value, pointer: &str) -> Result<String> {
    let text = text_allow_empty(value, pointer)?;
    if text.is_empty() {
        return Err(HttpForgeError::MalformedResponse);
    }
    Ok(text)
}
fn optional_text(value: &Value, pointer: &str) -> Result<String> {
    match value.pointer(pointer) {
        None | Some(Value::Null) => Ok(String::new()),
        _ => text_allow_empty(value, pointer),
    }
}
fn nonnegative(value: &Value, pointer: &str) -> Result<u64> {
    value
        .pointer(pointer)
        .and_then(Value::as_u64)
        .ok_or(HttpForgeError::MalformedResponse)
}
fn positive(value: &Value, pointer: &str) -> Result<u64> {
    nonnegative(value, pointer).and_then(|n| {
        if n > 0 {
            Ok(n)
        } else {
            Err(HttpForgeError::MalformedResponse)
        }
    })
}
fn change_status(s: &str) -> Result<&'static str> {
    match s {
        "added" => Ok("A"),
        "removed" | "deleted" => Ok("D"),
        "renamed" => Ok("R"),
        "modified" | "changed" | "copied" => Ok("M"),
        _ => Err(HttpForgeError::MalformedResponse),
    }
}
fn validate_file_path(path: &str) -> Result<()> {
    if path.is_empty()
        || path.len() > 4096
        || path.starts_with('/')
        || path.contains('\\')
        || path.contains(':')
        || path.chars().any(char::is_control)
        || path
            .split('/')
            .any(|p| matches!(p, "" | "." | "..") || p.eq_ignore_ascii_case(".git"))
    {
        return Err(HttpForgeError::MalformedResponse);
    }
    Ok(())
}
fn patch_counts(patch: &str) -> (u64, u64) {
    // Count only hunk lines, so +++/--- content within a hunk is counted correctly.
    let (mut add, mut delete, mut hunk) = (0, 0, false);
    for line in patch.lines() {
        if line.starts_with("@@ ") {
            hunk = true;
            continue;
        }
        if line.starts_with("diff --git ") {
            hunk = false;
        }
        if hunk && line.starts_with('+') {
            add += 1;
        } else if hunk && line.starts_with('-') {
            delete += 1;
        }
    }
    (add, delete)
}

#[cfg(test)]
#[path = "git_forge_http_tests.rs"]
mod tests;
