//! Native ClawHub GET API and bounded ZIP decoding. No CLI or TS sidecar.
//! Redirects and proxies are disabled; every resolved address is policy checked
//! and pinned for the connection. Hosts supply authenticated effect authority.
use super::skills::{
    SkillResult, cancelled,
    install::{SkillAuthority, SkillEffect},
};
use crate::{execution::process_runner::ProcessCancellation, security::ssrf_guard::SsrfGuard};
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use serde_json::Value;
use std::{
    collections::HashSet,
    io::{Cursor, Read},
    net::SocketAddr,
    sync::Arc,
    time::Duration,
};
use tokio::sync::Semaphore;
use url::Url;

pub const DEFAULT_REGISTRY: &str = "https://clawhub.ai";
pub const MAX_DOWNLOAD_BYTES: usize = 16 * 1024 * 1024;
pub const MAX_API_BYTES: usize = 2 * 1024 * 1024;
pub const MAX_ARCHIVE_BYTES: usize = 32 * 1024 * 1024;
pub const MAX_ARCHIVE_ENTRIES: usize = 1024;
// The TypeScript client uses type assertions, not response schema validation.
// Keep the bounded, untrusted JSON authoritative for forwarding/serialization.
// Public fields are convenience snapshots for native readers: changing a snapshot
// does not change the wire response. Never use them as effect authority. In
// particular, the installer still validates the selected version before download.
#[derive(Clone, Debug, Serialize)]
#[serde(transparent)]
pub struct ClawHubSearchResult {
    raw: Value,
    #[serde(skip)]
    pub slug: Option<String>,
    #[serde(skip)]
    pub display_name: Option<String>,
    #[serde(skip)]
    pub summary: Option<String>,
    #[serde(skip)]
    pub version: Option<String>,
    #[serde(skip)]
    pub score: Option<f64>,
    #[serde(skip)]
    pub updated_at: Option<f64>,
}
#[derive(Deserialize)]
#[serde(try_from = "Value")]
struct SearchResponse {
    results: Option<Vec<ClawHubSearchResult>>,
}
impl TryFrom<Value> for SearchResponse {
    type Error = &'static str;
    fn try_from(raw: Value) -> Result<Self, Self::Error> {
        // JS property access on null throws. Non-null primitives/arrays have no
        // results property and follow the same nullish fallback as empty objects.
        if raw.is_null() {
            return Err("Malformed ClawHub search response");
        }
        let results = match raw.get("results") {
            None | Some(Value::Null) => None,
            Some(Value::Array(items)) => Some(
                items
                    .iter()
                    .cloned()
                    .map(ClawHubSearchResult::from)
                    .collect(),
            ),
            _ => return Err("Malformed ClawHub search results"),
        };
        Ok(Self { results })
    }
}

// The route receives the JavaScript client's nullish fallback without imposing
// the typed native client's array constraint on the registry's results value.
fn decode_store_search_value(raw: Value) -> SkillResult<Value> {
    if raw.is_null() {
        return Err("Malformed ClawHub search response".into());
    }
    Ok(raw
        .get("results")
        .filter(|v| !v.is_null())
        .cloned()
        .unwrap_or_else(|| serde_json::json!([])))
}

#[derive(Clone, Debug, Serialize)]
#[serde(transparent)]
pub struct ClawHubVersion {
    raw: Value,
    // An absent/non-string version has no usable native install version. The raw
    // response retains it exactly; do not coerce remote numbers/objects to strings.
    #[serde(skip)]
    pub version: String,
    #[serde(skip)]
    pub extra: serde_json::Map<String, Value>,
}
#[derive(Clone, Debug, Serialize)]
#[serde(transparent)]
pub struct ClawHubSkillDetail {
    raw: Value,
    #[serde(skip)]
    pub skill: Option<Value>,
    #[serde(skip)]
    pub latest_version: Option<ClawHubVersion>,
    #[serde(skip)]
    pub owner: Option<Value>,
    #[serde(skip)]
    pub extra: serde_json::Map<String, Value>,
}
#[derive(Clone, Debug, Serialize)]
#[serde(transparent)]
pub struct ClawHubSkillList {
    raw: Value,
    #[serde(skip)]
    pub items: Vec<Value>,
    #[serde(skip)]
    pub next_cursor: Option<String>,
    #[serde(skip)]
    pub extra: serde_json::Map<String, Value>,
}

fn string_field(raw: &Value, name: &str) -> Option<String> {
    raw.get(name).and_then(Value::as_str).map(str::to_owned)
}
fn extra_fields(raw: &Value, known: &[&str]) -> serde_json::Map<String, Value> {
    raw.as_object()
        .into_iter()
        .flatten()
        .filter(|(key, _)| !known.contains(&key.as_str()))
        .map(|(key, value)| (key.clone(), value.clone()))
        .collect()
}
// Parsing a response never grants authority or performs effects. Typed snapshots
// deliberately omit incompatible field types while the raw JSON remains intact.
macro_rules! raw_response {
    ($ty:ty, $raw:ident, $projection:expr) => {
        impl<'de> Deserialize<'de> for $ty {
            fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
                Value::deserialize(deserializer).map(Self::from)
            }
        }
        impl From<Value> for $ty {
            fn from($raw: Value) -> Self {
                $projection
            }
        }
        impl $ty {
            pub fn as_json(&self) -> &Value {
                &self.raw
            }
        }
    };
}
raw_response!(
    ClawHubSearchResult,
    raw,
    Self {
        slug: string_field(&raw, "slug"),
        display_name: string_field(&raw, "displayName"),
        summary: string_field(&raw, "summary"),
        version: string_field(&raw, "version"),
        score: raw.get("score").and_then(Value::as_f64),
        updated_at: raw.get("updatedAt").and_then(Value::as_f64),
        raw,
    }
);
raw_response!(
    ClawHubVersion,
    raw,
    Self {
        version: string_field(&raw, "version").unwrap_or_default(),
        extra: extra_fields(&raw, &["version"]),
        raw,
    }
);
raw_response!(
    ClawHubSkillDetail,
    raw,
    Self {
        skill: raw.get("skill").filter(|v| !v.is_null()).cloned(),
        latest_version: raw
            .get("latestVersion")
            .filter(|v| !v.is_null())
            .map(|v| ClawHubVersion::from(v.clone())),
        owner: raw.get("owner").filter(|v| !v.is_null()).cloned(),
        extra: extra_fields(&raw, &["skill", "latestVersion", "owner"]),
        raw,
    }
);
raw_response!(
    ClawHubSkillList,
    raw,
    Self {
        items: raw
            .get("items")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default(),
        next_cursor: string_field(&raw, "nextCursor"),
        extra: extra_fields(&raw, &["items", "nextCursor"]),
        raw,
    }
);
#[derive(Clone, Copy)]
pub enum SkillSort {
    Newest,
    Downloads,
    Installs,
    InstallsAllTime,
    Trending,
}
impl SkillSort {
    fn value(self) -> &'static str {
        match self {
            Self::Newest => "newest",
            Self::Downloads => "downloads",
            Self::Installs => "installs",
            Self::InstallsAllTime => "installsAllTime",
            Self::Trending => "trending",
        }
    }
}
#[derive(Clone)]
pub struct ClawHubClient {
    base: Url,
    permits: Arc<Semaphore>,
}
impl ClawHubClient {
    pub fn new(registry: Option<&str>) -> SkillResult<Self> {
        let base = SsrfGuard::default().validate(registry.unwrap_or(DEFAULT_REGISTRY))?;
        if base.host_str().is_none() || !base.username().is_empty() || base.password().is_some() {
            return Err("ClawHub registry must have a public host and no URL credentials".into());
        }
        Ok(Self {
            base,
            permits: Arc::new(Semaphore::new(4)),
        })
    }
    pub fn registry(&self) -> String {
        self.base.as_str().trim_end_matches('/').to_owned()
    }
    fn endpoint(&self, path: &str) -> SkillResult<Url> {
        self.base.join(path).map_err(|e| e.to_string())
    }
    async fn get_bytes(
        &self,
        url: Url,
        download: bool,
        authority: &dyn SkillAuthority,
        cancel: &ProcessCancellation,
    ) -> SkillResult<Vec<u8>> {
        cancelled(cancel)?;
        let _permit = self
            .permits
            .try_acquire()
            .map_err(|_| "ClawHub request capacity unavailable")?;
        let work = async {
            SsrfGuard::default().validate(url.as_str())?;
            authorize_read(&url, download, authority, cancel)?;
            let host = url
                .host_str()
                .ok_or("ClawHub URL has no host")?
                .trim_matches(['[', ']']);
            let port = url
                .port_or_known_default()
                .ok_or("ClawHub URL has no port")?;
            let addresses: Vec<_> = tokio::net::lookup_host((host, port))
                .await
                .map_err(|_| "ClawHub DNS resolution failed")?
                .take(33)
                .collect();
            validate_addresses(&addresses)?;
            cancelled(cancel)?;
            authorize_read(&url, download, authority, cancel)?;
            let client = reqwest::Client::builder()
                .no_proxy()
                .redirect(reqwest::redirect::Policy::none())
                .resolve_to_addrs(
                    host,
                    &addresses
                        .iter()
                        .map(|a| SocketAddr::new(a.ip(), port))
                        .collect::<Vec<_>>(),
                )
                .connect_timeout(Duration::from_secs(10))
                .timeout(Duration::from_secs(30))
                .build()
                .map_err(|_| "Could not construct ClawHub client")?;
            let mut response = build_request(&client, url.clone(), download)
                .send()
                .await
                .map_err(|_| "ClawHub request failed")?;
            if !response.status().is_success() {
                return Err(response_error(response.status(), &url, download));
            }
            let limit = if download {
                MAX_DOWNLOAD_BYTES
            } else {
                MAX_API_BYTES
            };
            if response.content_length().is_some_and(|n| n > limit as u64) {
                return Err("ClawHub response exceeds byte budget".into());
            }
            let mut body = Vec::new();
            while let Some(chunk) = response
                .chunk()
                .await
                .map_err(|_| "ClawHub response read failed")?
            {
                cancelled(cancel)?;
                if chunk.len() > limit - body.len() {
                    return Err("ClawHub response exceeds byte budget".into());
                }
                body.extend_from_slice(&chunk);
            }
            Ok(body)
        };
        tokio::select! { biased;
            _ = cancel.wait_cancelled() => Err("ClawHub request cancelled".into()),
            result = tokio::time::timeout(Duration::from_secs(30), work) => result.map_err(|_| "ClawHub request timed out")?,
        }
    }
    async fn json<T: DeserializeOwned>(
        &self,
        url: Url,
        authority: &dyn SkillAuthority,
        cancel: &ProcessCancellation,
    ) -> SkillResult<T> {
        let body = self.get_bytes(url, false, authority, cancel).await?;
        decode_api_response(&body)
    }
    pub async fn search_skills(
        &self,
        query: &str,
        limit: Option<u32>,
        authority: &dyn SkillAuthority,
        cancel: &ProcessCancellation,
    ) -> SkillResult<Vec<ClawHubSearchResult>> {
        if query.len() > 4096 {
            return Err("ClawHub search query exceeds budget".into());
        }
        let mut url = self.endpoint("/api/v1/search")?;
        url.query_pairs_mut().append_pair("q", query);
        append_search_limit(&mut url, limit)?;
        Ok(self
            .json::<SearchResponse>(url, authority, cancel)
            .await?
            .results
            .unwrap_or_default())
    }
    // Store routes apply the JavaScript numeric cap themselves. Keep their
    // signed/fractional values on the wire; the transport still enforces its
    // independent concurrency, time, DNS and response-byte budgets.
    async fn search_store_skills(
        &self,
        query: &str,
        limit: f64,
        authority: &dyn SkillAuthority,
        cancel: &ProcessCancellation,
    ) -> SkillResult<Value> {
        if query.len() > 4096 {
            return Err("ClawHub search query exceeds budget".into());
        }
        let mut url = self.endpoint("/api/v1/search")?;
        url.query_pairs_mut()
            .append_pair("q", query)
            .append_pair("limit", &store_limit_string(limit)?);
        decode_store_search_value(self.json(url, authority, cancel).await?)
    }

    async fn list_store_packages(
        &self,
        limit: f64,
        authority: &dyn SkillAuthority,
        cancel: &ProcessCancellation,
    ) -> SkillResult<Value> {
        let value = store_limit_string(limit)?;
        let mut url = self.endpoint("/api/v1/plugins")?;
        // TypeScript's listPackages omits a falsy zero limit.
        if limit != 0.0 {
            url.query_pairs_mut().append_pair("limit", &value);
        }
        decode_package_value(self.json(url, authority, cancel).await?)
    }

    pub async fn list_skills(
        &self,
        sort: Option<SkillSort>,
        limit: Option<u32>,
        cursor: Option<&str>,
        authority: &dyn SkillAuthority,
        cancel: &ProcessCancellation,
    ) -> SkillResult<ClawHubSkillList> {
        let mut url = self.endpoint("/api/v1/skills")?;
        if let Some(sort) = sort {
            url.query_pairs_mut().append_pair("sort", sort.value());
        }
        append_listing_limit(&mut url, limit)?;
        if let Some(cursor) = cursor.filter(|value| !value.is_empty()) {
            if cursor.len() > 4096 {
                return Err("ClawHub cursor exceeds budget".into());
            }
            url.query_pairs_mut().append_pair("cursor", cursor);
        }
        self.json(url, authority, cancel).await
    }
    pub async fn get_skill(
        &self,
        slug: &str,
        authority: &dyn SkillAuthority,
        cancel: &ProcessCancellation,
    ) -> SkillResult<ClawHubSkillDetail> {
        validate_slug(slug)?;
        let mut url = self.endpoint("/api/v1/skills/")?;
        url.path_segments_mut()
            .map_err(|_| "Invalid ClawHub URL")?
            .pop_if_empty()
            .push(slug);
        self.json(url, authority, cancel).await
    }
    pub async fn download_skill(
        &self,
        slug: &str,
        version: Option<&str>,
        authority: &dyn SkillAuthority,
        cancel: &ProcessCancellation,
    ) -> SkillResult<Vec<u8>> {
        validate_slug(slug)?;
        let version = version.filter(|value| !value.is_empty());
        if version.is_some_and(|v| v.len() > 256 || v.chars().any(char::is_control)) {
            return Err("Invalid ClawHub version".into());
        }
        let mut url = self.endpoint("/api/v1/download")?;
        url.query_pairs_mut().append_pair("slug", slug);
        if let Some(version) = version {
            url.query_pairs_mut().append_pair("version", version);
        }
        self.get_bytes(url, true, authority, cancel).await
    }
    pub async fn list_packages(
        &self,
        limit: Option<u32>,
        authority: &dyn SkillAuthority,
        cancel: &ProcessCancellation,
    ) -> SkillResult<Vec<Value>> {
        let mut url = self.endpoint("/api/v1/plugins")?;
        append_listing_limit(&mut url, limit)?;
        let value: Value = self.json(url, authority, cancel).await?;
        decode_package_list(value)
    }
}

// Keep request construction shared with its offline wire-header contract test.
// The transport remains responsible for authorization, DNS pinning and deadlines.
fn build_request(client: &reqwest::Client, url: Url, download: bool) -> reqwest::RequestBuilder {
    client
        .get(url)
        .header("User-Agent", "Jait/1.0")
        .header("Accept", if download { "*/*" } else { "application/json" })
}

// Keep the parser bounded even when exercised independently of the HTTP reader.
// Serde's default nesting limit remains enabled for untrusted response JSON.
fn decode_api_response<T: DeserializeOwned>(body: &[u8]) -> SkillResult<T> {
    if body.len() > MAX_API_BYTES {
        return Err("ClawHub response exceeds byte budget".into());
    }
    serde_json::from_slice(body).map_err(|_| "Malformed ClawHub API response".into())
}

// The TypeScript client forwards `items` as-is after its nullish fallback.
// Store routes must preserve that value; typed native callers still require an array.
fn decode_package_value(value: Value) -> SkillResult<Value> {
    match value {
        Value::Array(_) => Ok(value),
        Value::Object(mut map) => Ok(match map.remove("items") {
            None | Some(Value::Null) => Value::Array(vec![]),
            Some(items) => items,
        }),
        Value::Null => Err("Malformed ClawHub package list".into()),
        // JS boxes non-null primitives; their missing items property falls
        // back to [] just like an empty object.
        _ => Ok(Value::Array(vec![])),
    }
}

fn decode_package_list(value: Value) -> SkillResult<Vec<Value>> {
    match decode_package_value(value)? {
        Value::Array(items) => Ok(items),
        _ => Err("Malformed ClawHub package list".into()),
    }
}
// Authorization may synchronously cancel the operation (for example when scope
// expires). Recheck before starting DNS and again before constructing the request.
fn authorize_read(
    url: &Url,
    download: bool,
    authority: &dyn SkillAuthority,
    cancel: &ProcessCancellation,
) -> SkillResult<()> {
    cancelled(cancel)?;
    authority.authorize(SkillEffect::RegistryRead { url, download })?;
    cancelled(cancel)
}

fn validate_addresses(addresses: &[SocketAddr]) -> SkillResult<()> {
    if addresses.is_empty() || addresses.len() > 32 {
        return Err("ClawHub DNS address budget exceeded or no addresses".into());
    }
    for address in addresses {
        // Reuse the canonical IP policy. The request host is preserved for TLS.
        let address_url = match address.ip() {
            std::net::IpAddr::V4(ip) => format!("https://{ip}/"),
            std::net::IpAddr::V6(ip) => format!("https://[{ip}]/"),
        };
        SsrfGuard::default().validate(&address_url)?;
    }
    Ok(())
}

fn response_error(status: reqwest::StatusCode, url: &Url, download: bool) -> String {
    if download {
        let slug = url
            .query_pairs()
            .find(|(key, _)| key == "slug")
            .map(|(_, value)| value.into_owned())
            .unwrap_or_default();
        format!("Download failed for '{slug}' (HTTP {})", status.as_u16())
    } else {
        format!("ClawHub API error: {status} ({})", url.path())
    }
}

// The route's Math.min(Number(limit) || 25, 100) can produce any
// negative f64, including -Infinity. NaN and values above 100 cannot come
// from that route; reject them at this adapter boundary.
fn store_limit_string(value: f64) -> SkillResult<String> {
    if value.is_nan() || value > 100.0 {
        return Err("Invalid ClawHub limit".into());
    }
    if value == f64::NEG_INFINITY {
        return Ok("-Infinity".into());
    }
    Ok(ryu_js::Buffer::new().format(value).to_owned())
}

// The TypeScript listing methods omit a falsy zero; search uses a different
// contract and always sends its limit. Keep the native upper bound for listings.
fn append_listing_limit(url: &mut Url, limit: Option<u32>) -> SkillResult<()> {
    if let Some(limit) = limit.filter(|value| *value != 0) {
        url.query_pairs_mut()
            .append_pair("limit", &bounded_limit(Some(limit))?.to_string());
    }
    Ok(())
}

fn append_search_limit(url: &mut Url, limit: Option<u32>) -> SkillResult<()> {
    let n = limit.unwrap_or(20);
    if n > 100 {
        return Err("ClawHub limit must be between 0 and 100".into());
    }
    url.query_pairs_mut().append_pair("limit", &n.to_string());
    Ok(())
}

fn bounded_limit(limit: Option<u32>) -> SkillResult<u32> {
    let n = limit.unwrap_or(20);
    if !(1..=100).contains(&n) {
        Err("ClawHub limit must be between 1 and 100".into())
    } else {
        Ok(n)
    }
}
pub fn validate_slug(slug: &str) -> SkillResult<()> {
    if slug.is_empty()
        || slug.len() > 128
        || slug.starts_with('.')
        || !slug
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
    {
        Err("Invalid ClawHub skill slug".into())
    } else {
        Ok(())
    }
}

#[derive(Debug)]
pub struct ArchiveFile {
    pub path: Vec<String>,
    pub data: Vec<u8>,
}
/// Decode and validate completely before creating any install files. Run on a
/// shared bounded blocking lane. Executable bits, symlinks, devices and archive
/// metadata never become host effects.
pub fn decode_zip(bytes: &[u8], cancel: &ProcessCancellation) -> SkillResult<Vec<ArchiveFile>> {
    cancelled(cancel)?;
    if bytes.len() > MAX_DOWNLOAD_BYTES {
        return Err("ClawHub archive exceeds compressed byte budget".into());
    }
    let mut archive =
        zip::ZipArchive::new(Cursor::new(bytes)).map_err(|_| "Invalid ClawHub ZIP archive")?;
    if archive.len() > MAX_ARCHIVE_ENTRIES {
        return Err("ClawHub archive entry budget exceeded".into());
    }
    let mut files = Vec::new();
    let mut seen = HashSet::new();
    let mut total = 0;
    for index in 0..archive.len() {
        cancelled(cancel)?;
        let mut entry = archive
            .by_index(index)
            .map_err(|_| "Unsupported or malformed ZIP entry")?;
        let raw = entry.name();
        crate::providers::acp_binary_launcher::validate_archive_entries(raw)
            .map_err(|_| "Unsafe ClawHub archive path")?;
        if raw.len() > 4096 || raw.contains(['\\', ':', '\0']) || raw.chars().any(char::is_control)
        {
            return Err("Unsafe ClawHub archive path".into());
        }
        let is_dir = entry.is_dir();
        let path: Vec<_> = raw
            .trim_end_matches('/')
            .split('/')
            .map(str::to_owned)
            .collect();
        if path.is_empty()
            || path.len() > 16
            || path
                .iter()
                .any(|p| p.is_empty() || p == "." || p == ".." || p.len() > 255)
        {
            return Err("Unsafe ClawHub archive path".into());
        }
        if path[0].eq_ignore_ascii_case(".clawhub") {
            return Err("Archive may not supply origin metadata".into());
        }
        let key = path.join("/").to_lowercase();
        if !seen.insert(key) {
            return Err("Duplicate ClawHub archive path".into());
        }
        let mode = entry.unix_mode().unwrap_or(0) & 0o170000;
        if mode != 0 && mode != if is_dir { 0o040000 } else { 0o100000 } {
            return Err("ClawHub archive contains a link or special file".into());
        }
        if is_dir {
            continue;
        }
        if entry.size() > (MAX_ARCHIVE_BYTES - total) as u64 {
            return Err("ClawHub archive exceeds expanded byte budget".into());
        }
        let mut data = Vec::new();
        let mut buffer = [0u8; 32768];
        loop {
            cancelled(cancel)?;
            let n = entry
                .read(&mut buffer)
                .map_err(|_| "Corrupt ClawHub ZIP data")?;
            if n == 0 {
                break;
            }
            if n > MAX_ARCHIVE_BYTES - total {
                return Err("ClawHub archive exceeds expanded byte budget".into());
            }
            total += n;
            data.extend_from_slice(&buffer[..n]);
        }
        files.push(ArchiveFile { path, data });
    }
    Ok(files)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn reference_get_and_download_request_headers() {
        let client = reqwest::Client::new();
        for (download, expected_accept, target) in [
            (
                false,
                "application/json",
                "https://clawhub.ai/api/v1/search?q=test&limit=20",
            ),
            (true, "*/*", "https://clawhub.ai/api/v1/download?slug=test"),
        ] {
            let request = build_request(&client, Url::parse(target).unwrap(), download)
                .build()
                .unwrap();
            assert_eq!(request.method(), reqwest::Method::GET);
            assert_eq!(request.url().as_str(), target);
            assert_eq!(
                request.headers().get(reqwest::header::USER_AGENT).unwrap(),
                "Jait/1.0"
            );
            assert_eq!(
                request.headers().get(reqwest::header::ACCEPT).unwrap(),
                expected_accept
            );
        }
    }

    #[test]
    fn rejects_private_registry_and_path_slugs() {
        for u in [
            "http://127.0.0.1",
            "https://[::1]",
            "https://localhost",
            "file:///x",
            "https://user:pw@clawhub.ai",
        ] {
            assert!(ClawHubClient::new(Some(u)).is_err());
        }
        for s in ["../x", "a/b", "C:\\x", ".", "", "x%2fy"] {
            assert!(validate_slug(s).is_err());
        }
        assert!(validate_slug("my-skill_2").is_ok());
    }
    #[test]
    fn malformed_and_cancelled_zip_fail() {
        assert!(decode_zip(b"bad", &ProcessCancellation::default()).is_err());
        let c = ProcessCancellation::default();
        c.cancel();
        assert!(decode_zip(b"", &c).unwrap_err().contains("cancelled"));
    }
    #[test]
    fn search_missing_and_null_results_match_reference_fallback() {
        for raw in [r#"{}"#, r#"{"results":null}"#, r#"{"results":[]}"#] {
            let response: SearchResponse = serde_json::from_str(raw).unwrap();
            assert!(response.results.unwrap_or_default().is_empty());
        }
        let response: SearchResponse =
            serde_json::from_str(r#"{"results":[{"slug":"test","score":0.5,"summary":null}]}"#)
                .unwrap();
        let result = response.results.unwrap().pop().unwrap();
        assert_eq!(result.slug.as_deref(), Some("test"));
        assert_eq!(result.score, Some(0.5));
    }

    #[test]
    fn search_zero_limit_is_sent_and_upper_bound_remains_enforced() {
        for (limit, expected) in [
            (None, "limit=20"),
            (Some(0), "limit=0"),
            (Some(100), "limit=100"),
        ] {
            let mut url = Url::parse("https://clawhub.ai/api/v1/search").unwrap();
            append_search_limit(&mut url, limit).unwrap();
            assert_eq!(url.query(), Some(expected));
        }
        let mut url = Url::parse("https://clawhub.ai/api/v1/search").unwrap();
        assert!(append_search_limit(&mut url, Some(101)).is_err());
        assert!(url.query().is_none());
    }

    #[tokio::test]
    async fn zero_limits_reach_authority_with_search_and_listing_semantics() {
        #[derive(Default)]
        struct RecordAndDeny(std::sync::Mutex<Vec<String>>);
        impl SkillAuthority for RecordAndDeny {
            fn authorize(&self, effect: SkillEffect<'_>) -> SkillResult<()> {
                match effect {
                    SkillEffect::RegistryRead { url, .. } => {
                        self.0.lock().unwrap().push(url.to_string());
                        Err("denied for test".into())
                    }
                    _ => panic!("unexpected effect"),
                }
            }
        }
        let client = ClawHubClient::new(None).unwrap();
        let authority = RecordAndDeny::default();
        let cancel = ProcessCancellation::default();
        assert!(
            client
                .search_skills("test", Some(0), &authority, &cancel)
                .await
                .is_err()
        );
        assert!(
            client
                .list_skills(None, Some(0), None, &authority, &cancel)
                .await
                .is_err()
        );
        assert_eq!(
            *authority.0.lock().unwrap(),
            [
                "https://clawhub.ai/api/v1/search?q=test&limit=0",
                "https://clawhub.ai/api/v1/skills"
            ]
        );
    }

    #[tokio::test]
    async fn request_capacity_is_shared_by_clones_and_released() {
        struct Deny(std::sync::atomic::AtomicUsize);
        impl SkillAuthority for Deny {
            fn authorize(&self, _: SkillEffect<'_>) -> SkillResult<()> {
                self.0.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                Err("denied for test".into())
            }
        }
        let client = ClawHubClient::new(None).unwrap();
        let clone = client.clone();
        let permits: Vec<_> = (0..4)
            .map(|_| client.permits.try_acquire().unwrap())
            .collect();
        let authority = Deny(std::sync::atomic::AtomicUsize::new(0));
        let cancel = ProcessCancellation::default();
        let err = clone
            .search_skills("test", None, &authority, &cancel)
            .await
            .unwrap_err();
        assert_eq!(err, "ClawHub request capacity unavailable");
        assert_eq!(authority.0.load(std::sync::atomic::Ordering::SeqCst), 0);
        drop(permits);
        let err = clone
            .search_skills("test", None, &authority, &cancel)
            .await
            .unwrap_err();
        assert_eq!(err, "denied for test");
        assert_eq!(authority.0.load(std::sync::atomic::Ordering::SeqCst), 1);
    }

    #[test]
    fn listing_zero_limit_is_omitted_but_positive_limit_is_sent() {
        for limit in [None, Some(0)] {
            let mut url = Url::parse("https://clawhub.ai/api/v1/skills").unwrap();
            append_listing_limit(&mut url, limit).unwrap();
            assert!(url.query().is_none());
        }
        let mut url = Url::parse("https://clawhub.ai/api/v1/plugins").unwrap();
        append_listing_limit(&mut url, Some(25)).unwrap();
        assert_eq!(url.query(), Some("limit=25"));
        assert!(append_listing_limit(&mut url, Some(101)).is_err());
    }

    #[test]
    fn store_package_response_preserves_non_array_items() {
        let input = serde_json::json!({"items": "future"});
        assert_eq!(decode_package_value(input.clone()).unwrap(), "future");
        assert!(decode_package_list(input).is_err());
        assert_eq!(
            decode_package_value(serde_json::json!({"items": null})).unwrap(),
            serde_json::json!([])
        );
        assert!(decode_package_value(Value::Null).is_err());
    }

    #[test]
    fn store_search_preserves_non_array_results_for_route_validation() {
        let raw = serde_json::json!({"results": {"unexpected": true}});
        assert_eq!(
            decode_store_search_value(raw.clone()).unwrap(),
            raw["results"]
        );
        assert!(SearchResponse::try_from(raw).is_err());
        assert_eq!(
            decode_store_search_value(serde_json::json!({"results": null})).unwrap(),
            serde_json::json!([])
        );
        assert_eq!(
            decode_store_search_value(serde_json::json!({})).unwrap(),
            serde_json::json!([])
        );
        assert!(decode_store_search_value(Value::Null).is_err());
    }

    #[test]
    fn response_shapes_match_actual_typescript_client_fixtures() {
        let cases: Vec<Value> = serde_json::from_str(include_str!(
            "../../tests/fixtures/clawhub-response-cases.json"
        ))
        .unwrap();
        for case in cases {
            let body = serde_json::to_vec(&case["response"]).unwrap();
            let result = match case["method"].as_str().unwrap() {
                "search" => decode_api_response::<SearchResponse>(&body).and_then(|v| {
                    serde_json::to_value(v.results.unwrap_or_default()).map_err(|e| e.to_string())
                }),
                "list" => decode_api_response::<ClawHubSkillList>(&body)
                    .and_then(|v| serde_json::to_value(v).map_err(|e| e.to_string())),
                "detail" => decode_api_response::<ClawHubSkillDetail>(&body)
                    .and_then(|v| serde_json::to_value(v).map_err(|e| e.to_string())),
                "packages" => decode_api_response::<Value>(&body)
                    .and_then(decode_package_list)
                    .map(Value::Array),
                _ => panic!("unknown fixture method"),
            };
            if case["rustError"] == true {
                assert!(result.is_err(), "{}", case["name"]);
            } else {
                assert_eq!(result.unwrap(), case["expected"], "{}", case["name"]);
            }
        }
    }

    #[test]
    fn raw_response_parser_retains_byte_nesting_and_json_limits() {
        // Spaces are valid JSON trailing whitespace: rejection is the byte limit,
        // not schema validation. The exact byte ceiling remains inclusive.
        let mut body = vec![b' '; MAX_API_BYTES];
        body[0] = b'{';
        body[1] = b'}';
        assert!(decode_api_response::<ClawHubSkillDetail>(&body).is_ok());
        body.push(b' ');
        assert_eq!(
            decode_api_response::<ClawHubSkillDetail>(&body).unwrap_err(),
            "ClawHub response exceeds byte budget"
        );
        for body in [
            b"{invalid".to_vec(),
            [vec![b'['; 130], vec![b']'; 130]].concat(),
            b"{\"future\":1e400}".to_vec(),
        ] {
            assert_eq!(
                decode_api_response::<ClawHubSkillDetail>(&body).unwrap_err(),
                "Malformed ClawHub API response"
            );
        }
    }

    #[test]
    fn resolved_address_policy_rejects_mixed_private_answers_and_budgets() {
        let public: SocketAddr = "8.8.8.8:443".parse().unwrap();
        assert!(validate_addresses(&[public]).is_ok());
        assert!(validate_addresses(&[]).is_err());
        assert!(validate_addresses(&vec![public; 33]).is_err());
        assert!(validate_addresses(&vec![public; 32]).is_ok());
        for private in [
            "127.0.0.1:443",
            "10.0.0.1:443",
            "169.254.169.254:80",
            "[::1]:443",
            "[::ffff:127.0.0.1]:443",
            "[fc00::1]:443",
            "[fe80::1]:443",
        ] {
            assert!(
                validate_addresses(&[public, private.parse().unwrap()]).is_err(),
                "{private}"
            );
        }
    }

    #[test]
    fn cancellation_inside_each_authorization_check_stops_the_next_effect() {
        struct CancelOnCall<'a> {
            cancel: &'a ProcessCancellation,
            at: usize,
            calls: std::sync::atomic::AtomicUsize,
        }
        impl SkillAuthority for CancelOnCall<'_> {
            fn authorize(&self, _: SkillEffect<'_>) -> SkillResult<()> {
                let call = self.calls.fetch_add(1, std::sync::atomic::Ordering::SeqCst) + 1;
                if call == self.at {
                    self.cancel.cancel();
                }
                Ok(())
            }
        }
        let url = Url::parse(DEFAULT_REGISTRY).unwrap();
        for at in [1, 2] {
            let cancel = ProcessCancellation::default();
            let authority = CancelOnCall {
                cancel: &cancel,
                at,
                calls: std::sync::atomic::AtomicUsize::new(0),
            };
            if at == 2 {
                authorize_read(&url, false, &authority, &cancel).unwrap();
            }
            assert!(
                authorize_read(&url, false, &authority, &cancel)
                    .unwrap_err()
                    .contains("cancelled")
            );
            assert_eq!(
                authority.calls.load(std::sync::atomic::Ordering::SeqCst),
                at
            );
            assert!(authorize_read(&url, false, &authority, &cancel).is_err());
            assert_eq!(
                authority.calls.load(std::sync::atomic::Ordering::SeqCst),
                at
            );
        }
    }

    #[test]
    fn api_and_download_status_errors_match_reference() {
        let url = Url::parse("https://clawhub.ai/api/v1/download?slug=my-skill").unwrap();
        assert_eq!(
            response_error(reqwest::StatusCode::NOT_FOUND, &url, true),
            "Download failed for 'my-skill' (HTTP 404)"
        );
        assert_eq!(
            response_error(reqwest::StatusCode::NOT_FOUND, &url, false),
            "ClawHub API error: 404 Not Found (/api/v1/download)"
        );
    }

    fn archive(entries: &[(&str, &[u8])]) -> Vec<u8> {
        use std::io::Write;
        let mut writer = zip::ZipWriter::new(Cursor::new(Vec::new()));
        for (name, bytes) in entries {
            writer
                .start_file(*name, zip::write::SimpleFileOptions::default())
                .unwrap();
            writer.write_all(bytes).unwrap();
        }
        writer.finish().unwrap().into_inner()
    }

    #[test]
    fn zip_decodes_valid_content_and_rejects_unsafe_install_paths() {
        let cancel = ProcessCancellation::default();
        let files = decode_zip(&archive(&[("skill/SKILL.md", b"hello")]), &cancel).unwrap();
        assert_eq!(files[0].path, ["skill", "SKILL.md"]);
        assert_eq!(files[0].data, b"hello");
        for path in [
            "../escape",
            "/absolute",
            "a/../escape",
            "a\\escape",
            ".clawhub/origin.json",
            "C:escape",
        ] {
            assert!(
                decode_zip(&archive(&[(path, b"bad")]), &cancel).is_err(),
                "{path}"
            );
        }
        assert!(decode_zip(&archive(&[("A", b"a"), ("a", b"b")]), &cancel).is_err());
    }
}

/// Composition primitives for the store host. The host supplies request-scoped
/// authority and cancellation and owns the registry; no ambient authority is
/// captured in a route closure. Disk mutations must run in the shared blocking
/// lane with exclusive access to the same registry used by skill tools.
pub mod store_adapter {
    use super::*;
    use crate::integrations::skills::{
        SkillRegistry,
        install::{DownloadedSkill, SkillStore, download_clawhub_skill},
    };
    use crate::routes::store::StoreOperation;

    /// Shared registry ownership for store operations. All consumers of this
    /// registry must use this owner; a separate registry copy cannot be coherent.
    #[derive(Clone)]
    pub struct SharedStore {
        registry: std::sync::Arc<std::sync::Mutex<SkillRegistry>>,
        store: std::sync::Arc<SkillStore>,
        lane: crate::runtime::blocking::BlockingLane,
    }

    /// Host-owned shutdown handle for a lane dedicated to one shared store.
    /// The host must first stop admission and cancel/await all store requests,
    /// including asynchronous authorization and downloads, before draining it.
    pub struct StoreLaneOwner {
        lane: crate::runtime::blocking::BlockingLane,
    }

    impl StoreLaneOwner {
        pub async fn close_and_drain(&self) {
            self.lane.close_and_drain().await;
        }
    }

    impl SharedStore {
        /// Create a dedicated lane and retain its shutdown authority in the host.
        pub fn with_owned_lane(
            registry: SkillRegistry,
            store: SkillStore,
            parallelism: std::num::NonZeroU16,
        ) -> (Self, StoreLaneOwner) {
            let lane = crate::runtime::blocking::BlockingLane::new(parallelism);
            let owner = StoreLaneOwner { lane: lane.clone() };
            (Self::new(registry, store, lane), owner)
        }

        /// The caller owns the supplied lane and its shutdown lifecycle.
        pub fn new(
            registry: SkillRegistry,
            store: SkillStore,
            lane: crate::runtime::blocking::BlockingLane,
        ) -> Self {
            Self {
                registry: std::sync::Arc::new(std::sync::Mutex::new(registry)),
                store: std::sync::Arc::new(store),
                lane,
            }
        }

        /// A point-in-time discovery view from the same registry used by commits.
        /// The host must authorize discovery before calling this method. The
        /// snapshot must not be used as authority for later filesystem effects.
        pub async fn discovery_snapshot(&self) -> SkillResult<SkillRegistry> {
            let registry = self.registry.clone();
            self.lane
                .run(move || {
                    registry
                        .lock()
                        .map(|registry| registry.clone())
                        .map_err(|_| "Skill registry lock poisoned".to_owned())
                })
                .await
                .map_err(|error| error.to_string())?
        }

        pub async fn installed(&self) -> SkillResult<Vec<String>> {
            let registry = self.registry.clone();
            self.lane
                .run(move || {
                    let registry = registry
                        .lock()
                        .map_err(|_| "Skill registry lock poisoned".to_owned())?;
                    Ok(registry
                        .list()
                        .iter()
                        .map(|skill| skill.id.clone())
                        .collect())
                })
                .await
                .map_err(|e| e.to_string())?
        }

        /// Blocking work retains lane and registry ownership even if the caller
        /// drops its future. The supplied authority must remain request-scoped.
        pub async fn commit(
            &self,
            prepared: PreparedStoreOperation,
            installed_at: u64,
            authority: std::sync::Arc<dyn SkillAuthority>,
            cancel: ProcessCancellation,
        ) -> SkillResult<Value> {
            let registry = self.registry.clone();
            let store = self.store.clone();
            self.lane
                .run(move || {
                    let mut registry = registry
                        .lock()
                        .map_err(|_| "Skill registry lock poisoned".to_owned())?;
                    commit(
                        prepared,
                        &store,
                        &mut registry,
                        installed_at,
                        authority.as_ref(),
                        &cancel,
                    )
                })
                .await
                .map_err(|e| e.to_string())?
        }
    }

    /// The host must authorize each request, including local registry reads.
    /// Identity alone is not an effect grant; no permissive factory is supplied.
    pub type RequestAuthority = std::sync::Arc<
        dyn Fn(
                crate::routes::store::StoreContext,
                StoreOperation,
            ) -> futures_util::future::BoxFuture<
                'static,
                SkillResult<std::sync::Arc<dyn SkillAuthority>>,
            > + Send
            + Sync,
    >;

    struct CancelOnAbandon(Option<ProcessCancellation>);
    impl Drop for CancelOnAbandon {
        fn drop(&mut self) {
            if let Some(cancel) = self.0.take() {
                cancel.cancel();
            }
        }
    }

    /// Compose an opt-in route port. The host owns the registry, lane, clock and
    /// request-bound authority lifecycle; constructing this port performs no I/O.
    pub fn store_port(
        client: ClawHubClient,
        shared: SharedStore,
        authority: RequestAuthority,
        clock: std::sync::Arc<dyn Fn() -> u64 + Send + Sync>,
    ) -> crate::routes::store::StorePort {
        std::sync::Arc::new(move |context, operation| {
            let client = client.clone();
            let shared = shared.clone();
            let authority = authority.clone();
            let clock = clock.clone();
            Box::pin(async move {
                let mut on_abandon = CancelOnAbandon(Some(context.cancellation.clone()));
                let result = async {
                    cancelled(&context.cancellation)?;
                    let grant = tokio::select! {
                        biased;
                        _ = context.cancellation.wait_cancelled() => return Err("store request cancelled".into()),
                        result = authority(context.clone(), operation.clone()) => result?,
                    };
                    cancelled(&context.cancellation)?;
                    let installed = shared.installed().await?;
                    let prepared = prepare(
                        &client,
                        operation,
                        &installed,
                        grant.as_ref(),
                        &context.cancellation,
                    )
                    .await?;
                    shared
                        .commit(prepared, clock(), grant, context.cancellation)
                        .await
                }
                .await;
                on_abandon.0 = None;
                result.map_err(crate::routes::store::StoreError::Message)
            })
        })
    }

    struct RequestState {
        closed: bool,
        requests: std::collections::HashMap<uuid::Uuid, ProcessCancellation>,
    }

    struct RequestGuard {
        id: uuid::Uuid,
        state: std::sync::Arc<std::sync::Mutex<RequestState>>,
        active: tokio::sync::watch::Sender<usize>,
        cancel: Option<ProcessCancellation>,
    }
    impl Drop for RequestGuard {
        fn drop(&mut self) {
            if let Some(cancel) = self.cancel.take() {
                cancel.cancel();
            }
            let mut state = self.state.lock().unwrap_or_else(|e| e.into_inner());
            state.requests.remove(&self.id);
            self.active.send_replace(state.requests.len());
        }
    }

    /// Owns admission and shutdown for a store port and its dedicated lane.
    pub struct StoreSupervisor {
        state: std::sync::Arc<std::sync::Mutex<RequestState>>,
        active: tokio::sync::watch::Sender<usize>,
        lane: StoreLaneOwner,
        discovery_store: Option<SharedStore>,
    }
    impl StoreSupervisor {
        /// Authorize and obtain a snapshot under the same admission and shutdown
        /// lifecycle as store requests. Authority must bind the caller and request.
        pub async fn discovery_snapshot(
            &self,
            context: crate::routes::store::StoreContext,
            authorize: impl FnOnce(
                crate::routes::store::StoreContext,
            )
                -> futures_util::future::BoxFuture<'static, SkillResult<()>>,
        ) -> SkillResult<SkillRegistry> {
            let shared = self
                .discovery_store
                .clone()
                .ok_or("discovery unavailable")?;
            let parent = context.cancellation.clone();
            let cancel = ProcessCancellation::default();
            let context = crate::routes::store::StoreContext {
                cancellation: cancel.clone(),
                ..context
            };
            let mut guard = {
                let mut state = self.state.lock().unwrap_or_else(|e| e.into_inner());
                if state.closed {
                    return Err("store is closed".into());
                }
                let id = uuid::Uuid::new_v4();
                state.requests.insert(id, cancel.clone());
                self.active.send_replace(state.requests.len());
                RequestGuard {
                    id,
                    state: self.state.clone(),
                    active: self.active.clone(),
                    cancel: Some(cancel.clone()),
                }
            };
            let result = tokio::select! {
                biased;
                _ = parent.wait_cancelled() => { cancel.cancel(); Err("store request cancelled".into()) },
                _ = cancel.wait_cancelled() => Err("store request cancelled".into()),
                result = async {
                    authorize(context).await?;
                    cancelled(&cancel)?;
                    shared.discovery_snapshot().await
                } => result,
            };
            guard.cancel = None;
            drop(guard);
            result
        }

        /// Close request admission and signal active requests synchronously.
        /// The owner must still await `shutdown` to drain admitted work.
        pub fn close(&self) {
            let mut state = self.state.lock().unwrap_or_else(|e| e.into_inner());
            state.closed = true;
            for cancel in state.requests.values() {
                cancel.cancel();
            }
        }

        /// Cancel and await admitted request futures before draining blocking work.
        /// A blocking closure must still finish on its own. Admitted request
        /// futures must continue to be polled or dropped for shutdown to finish.
        /// The host retains this handle and can retry if its shutdown wait is cancelled.
        pub async fn shutdown(&self) {
            let mut active = self.active.subscribe();
            self.close();
            while *active.borrow_and_update() != 0 {
                if active.changed().await.is_err() {
                    break;
                }
            }
            self.lane.close_and_drain().await;
        }
    }

    impl Drop for StoreSupervisor {
        fn drop(&mut self) {
            // Dropping cannot await blocking work; the host must call shutdown to drain it.
            self.close();
        }
    }

    /// Construct a store port and supervisor over the same dedicated lane.
    /// Discovery is exposed through the supervisor so it shares admission and shutdown.
    pub fn owned_supervised_store_port(
        client: ClawHubClient,
        registry: SkillRegistry,
        store: SkillStore,
        parallelism: std::num::NonZeroU16,
        authority: RequestAuthority,
        clock: std::sync::Arc<dyn Fn() -> u64 + Send + Sync>,
    ) -> (crate::routes::store::StorePort, StoreSupervisor) {
        let (shared, lane) = SharedStore::with_owned_lane(registry, store, parallelism);
        let port = store_port(client, shared.clone(), authority, clock);
        let (port, mut supervisor) = supervised_store_port(port, lane);
        supervisor.discovery_store = Some(shared);
        (port, supervisor)
    }

    /// Wrap a port whose blocking work uses the supplied dedicated lane.
    fn supervised_store_port(
        port: crate::routes::store::StorePort,
        lane: StoreLaneOwner,
    ) -> (crate::routes::store::StorePort, StoreSupervisor) {
        let state = std::sync::Arc::new(std::sync::Mutex::new(RequestState {
            closed: false,
            requests: std::collections::HashMap::new(),
        }));
        let (active, _) = tokio::sync::watch::channel(0);
        let supervisor = StoreSupervisor {
            state: state.clone(),
            active: active.clone(),
            lane,
            discovery_store: None,
        };
        let wrapped = std::sync::Arc::new(
            move |context: crate::routes::store::StoreContext, operation| {
                let state = state.clone();
                let active = active.clone();
                let port = port.clone();
                Box::pin(async move {
                    // Each operation owns its cancellation token. Abandoning one
                    // detail lookup must not cancel sibling operations in the request.
                    let parent_cancel = context.cancellation.clone();
                    let cancel = ProcessCancellation::default();
                    let context = crate::routes::store::StoreContext {
                        cancellation: cancel.clone(),
                        ..context
                    };
                    let mut guard = {
                        let mut locked = state.lock().unwrap_or_else(|e| e.into_inner());
                        if locked.closed {
                            return Err(crate::routes::store::StoreError::Message(
                                "store is closed".into(),
                            ));
                        }
                        let id = uuid::Uuid::new_v4();
                        locked.requests.insert(id, cancel.clone());
                        active.send_replace(locked.requests.len());
                        RequestGuard {
                            id,
                            state: state.clone(),
                            active: active.clone(),
                            cancel: Some(cancel.clone()),
                        }
                    };
                    let result = tokio::select! {
                        biased;
                        _ = parent_cancel.wait_cancelled() => {
                            cancel.cancel();
                            Err(crate::routes::store::StoreError::Message("store request cancelled".into()))
                        },
                        _ = cancel.wait_cancelled() => Err(crate::routes::store::StoreError::Message("store request cancelled".into())),
                        result = port(context, operation) => result,
                    };
                    guard.cancel = None;
                    drop(guard);
                    result
                }) as futures_util::future::BoxFuture<'static, _>
            },
        );
        (wrapped, supervisor)
    }

    /// Network work completes before a mutation is submitted to the blocking
    /// lane. A prepared download is untrusted and is revalidated by SkillStore.
    pub enum PreparedStoreOperation {
        Value(Value),
        Install(DownloadedSkill),
        Uninstall(String),
    }

    /// Prepare an operation without disk access. The local snapshot must come
    /// from the host's authoritative skill registry, not from registry metadata.
    pub async fn prepare(
        client: &ClawHubClient,
        operation: StoreOperation,
        installed: &[String],
        authority: &dyn SkillAuthority,
        cancel: &ProcessCancellation,
    ) -> SkillResult<PreparedStoreOperation> {
        cancelled(cancel)?;
        let value = match operation {
            StoreOperation::ListInstalled => Value::Array(
                installed
                    .iter()
                    .map(|id| serde_json::json!({"id": id}))
                    .collect(),
            ),
            StoreOperation::IsInstalled(slug) => {
                // Registry IDs can originate outside ClawHub and need not obey
                // its download path rules. This is a read-only exact lookup.
                Value::Bool(installed.iter().any(|id| id == &slug))
            }
            StoreOperation::Search { query, limit: n } => {
                // Repeated query parameters are arrays in the route parser;
                // URLSearchParams coerces those string arrays by joining commas.
                let query = match query {
                    Value::String(value) => value,
                    Value::Array(values) if values.iter().all(Value::is_string) => {
                        let length = values
                            .iter()
                            .try_fold(values.len().saturating_sub(1), |length, value| {
                                length.checked_add(value.as_str().unwrap().len())
                            });
                        let length = length
                            .filter(|length| *length <= 4096)
                            .ok_or("ClawHub search query exceeds budget")?;
                        let mut joined = String::with_capacity(length);
                        for (index, value) in values.iter().enumerate() {
                            if index > 0 {
                                joined.push(',');
                            }
                            joined.push_str(value.as_str().unwrap());
                        }
                        joined
                    }
                    _ => return Err("Invalid ClawHub search query".into()),
                };
                serde_json::to_value(
                    client
                        .search_store_skills(&query, n, authority, cancel)
                        .await?,
                )
                .map_err(|e| e.to_string())?
            }
            StoreOperation::GetSkill(slug) => {
                serde_json::to_value(client.get_skill(&slug, authority, cancel).await?)
                    .map_err(|e| e.to_string())?
            }
            StoreOperation::ListPackages { limit: n } => {
                client.list_store_packages(n, authority, cancel).await?
            }
            StoreOperation::Install { slug, version } => {
                let version = match version {
                    None | Some(Value::Null) => None,
                    Some(Value::String(v)) if !v.is_empty() => Some(v),
                    Some(Value::String(_)) => None,
                    _ => return Err("Invalid ClawHub version".into()),
                };
                let download =
                    download_clawhub_skill(client, &slug, version.as_deref(), authority, cancel)
                        .await?;
                cancelled(cancel)?;
                return Ok(PreparedStoreOperation::Install(download));
            }
            StoreOperation::Uninstall(slug) => {
                validate_slug(&slug)?;
                return Ok(PreparedStoreOperation::Uninstall(slug));
            }
        };
        cancelled(cancel)?;
        Ok(PreparedStoreOperation::Value(value))
    }

    /// Run only after shared blocking-lane admission, holding exclusive registry
    /// ownership. Dropping an async waiter must cancel its token and supervise the
    /// blocking task until it finishes; it must never retry a mutation implicitly.
    pub fn commit(
        prepared: PreparedStoreOperation,
        store: &SkillStore,
        registry: &mut SkillRegistry,
        installed_at: u64,
        authority: &dyn SkillAuthority,
        cancel: &ProcessCancellation,
    ) -> SkillResult<Value> {
        cancelled(cancel)?;
        match prepared {
            PreparedStoreOperation::Value(value) => Ok(value),
            PreparedStoreOperation::Install(download) => serde_json::to_value(
                store.install_clawhub_skill(registry, download, installed_at, authority, cancel)?,
            )
            .map_err(|e| e.to_string()),
            PreparedStoreOperation::Uninstall(slug) => serde_json::to_value(
                store.uninstall_clawhub_skill(registry, &slug, authority, cancel)?,
            )
            .map_err(|e| e.to_string()),
        }
    }

    #[cfg(test)]
    mod tests {
        use super::*;
        use crate::integrations::skills::install::SkillEffect;

        struct Deny;
        impl SkillAuthority for Deny {
            fn authorize(&self, _: SkillEffect<'_>) -> SkillResult<()> {
                Err("denied".into())
            }
        }

        #[cfg(unix)]
        #[tokio::test]
        async fn dedicated_store_owner_closes_all_store_clones() {
            use std::{num::NonZeroU16, os::unix::fs::PermissionsExt};
            let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                .parent()
                .unwrap()
                .parent()
                .unwrap()
                .join(".jait/artifacts/gateway-rust/clawhub-store-tests")
                .join(uuid::Uuid::new_v4().to_string());
            std::fs::create_dir_all(&root).unwrap();
            std::fs::set_permissions(&root, std::fs::Permissions::from_mode(0o700)).unwrap();
            let (shared, owner) = SharedStore::with_owned_lane(
                SkillRegistry::default(),
                SkillStore::open(root.clone()).unwrap(),
                NonZeroU16::new(1).unwrap(),
            );
            let clone = shared.clone();
            assert!(shared.installed().await.unwrap().is_empty());
            owner.close_and_drain().await;
            assert!(clone.installed().await.unwrap_err().contains("closed"));
            std::fs::remove_dir_all(root).unwrap();
        }

        #[tokio::test]
        async fn supervisor_success_preserves_shared_cancellation() {
            use crate::routes::store::{StoreContext, StorePort};
            use crate::security::http_auth::AuthUser;
            use std::{num::NonZeroU16, sync::Arc};
            let lane = crate::runtime::blocking::BlockingLane::new(NonZeroU16::new(1).unwrap());
            let inner: StorePort = Arc::new(|_, _| Box::pin(async { Ok(serde_json::json!(true)) }));
            let (port, supervisor) = supervised_store_port(inner, StoreLaneOwner { lane });
            let context = StoreContext {
                user: AuthUser {
                    id: "alice".into(),
                    username: "alice".into(),
                },
                cancellation: ProcessCancellation::default(),
            };
            assert!(
                port(context.clone(), StoreOperation::ListInstalled)
                    .await
                    .is_ok()
            );
            assert!(!context.cancellation.is_cancelled());
            assert!(
                port(context.clone(), StoreOperation::ListInstalled)
                    .await
                    .is_ok()
            );
            assert!(!context.cancellation.is_cancelled());
            supervisor.shutdown().await;
        }

        #[tokio::test]
        async fn abandoned_operation_does_not_cancel_sibling() {
            use crate::routes::store::{StoreContext, StoreError, StorePort};
            use crate::security::http_auth::AuthUser;
            use std::{num::NonZeroU16, sync::Arc};
            let lane = crate::runtime::blocking::BlockingLane::new(NonZeroU16::new(1).unwrap());
            let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel();
            let inner: StorePort = Arc::new(move |context, _| {
                let tx = tx.clone();
                Box::pin(async move {
                    tx.send(context.cancellation).unwrap();
                    std::future::pending::<Result<Value, StoreError>>().await
                })
            });
            let (port, supervisor) = supervised_store_port(inner, StoreLaneOwner { lane });
            let context = StoreContext {
                user: AuthUser {
                    id: "alice".into(),
                    username: "alice".into(),
                },
                cancellation: ProcessCancellation::default(),
            };
            let first = tokio::spawn(port(context.clone(), StoreOperation::ListInstalled));
            let first_token = rx.recv().await.unwrap();
            let second = tokio::spawn(port(context.clone(), StoreOperation::ListInstalled));
            let second_token = rx.recv().await.unwrap();
            first.abort();
            let _ = first.await;
            assert!(first_token.is_cancelled());
            assert!(!second_token.is_cancelled());
            assert!(!context.cancellation.is_cancelled());
            context.cancellation.cancel();
            assert!(second.await.unwrap().is_err());
            assert!(second_token.is_cancelled());
            supervisor.shutdown().await;
        }

        #[tokio::test]
        async fn dropping_supervisor_closes_admission_and_cancels_requests() {
            use crate::routes::store::{StoreContext, StoreError, StorePort};
            use crate::security::http_auth::AuthUser;
            use std::{num::NonZeroU16, sync::Arc};
            let lane = crate::runtime::blocking::BlockingLane::new(NonZeroU16::new(1).unwrap());
            let (tx, rx) = tokio::sync::oneshot::channel();
            let tx = Arc::new(std::sync::Mutex::new(Some(tx)));
            let inner: StorePort = Arc::new(move |context, _| {
                let tx = tx.clone();
                Box::pin(async move {
                    assert!(
                        tx.lock()
                            .unwrap()
                            .take()
                            .unwrap()
                            .send(context.cancellation)
                            .is_ok()
                    );
                    std::future::pending::<Result<Value, StoreError>>().await
                })
            });
            let (port, supervisor) = supervised_store_port(inner, StoreLaneOwner { lane });
            let context = StoreContext {
                user: AuthUser {
                    id: "alice".into(),
                    username: "alice".into(),
                },
                cancellation: ProcessCancellation::default(),
            };
            let request = tokio::spawn(port(context.clone(), StoreOperation::ListInstalled));
            let cancellation = rx.await.unwrap();
            drop(supervisor);
            assert!(cancellation.is_cancelled());
            assert!(request.await.unwrap().is_err());
            assert!(port(context, StoreOperation::ListInstalled).await.is_err());
        }

        #[tokio::test]
        async fn supervisor_shutdown_can_be_retried_after_cancellation() {
            use crate::routes::store::StorePort;
            use std::{num::NonZeroU16, sync::Arc, time::Duration};
            let lane = crate::runtime::blocking::BlockingLane::new(NonZeroU16::new(1).unwrap());
            let (entered, started) = tokio::sync::oneshot::channel();
            let (release, wait) = std::sync::mpsc::channel();
            let worker_lane = lane.clone();
            let worker = tokio::spawn(async move {
                worker_lane
                    .run(move || {
                        entered.send(()).unwrap();
                        wait.recv().unwrap();
                    })
                    .await
            });
            started.await.unwrap();
            worker.abort();
            let _ = worker.await;
            let inner: StorePort = Arc::new(|_, _| Box::pin(async { Ok(serde_json::json!(true)) }));
            let (_, supervisor) =
                supervised_store_port(inner, StoreLaneOwner { lane: lane.clone() });
            {
                let first = supervisor.shutdown();
                tokio::pin!(first);
                assert!(futures_util::poll!(first.as_mut()).is_pending());
            }
            let retry = supervisor.shutdown();
            tokio::pin!(retry);
            assert!(futures_util::poll!(retry.as_mut()).is_pending());
            release.send(()).unwrap();
            tokio::time::timeout(Duration::from_secs(5), retry)
                .await
                .unwrap();
            assert!(lane.run(|| ()).await.is_err());
        }

        #[tokio::test]
        async fn supervisor_cancels_pending_and_drains_abandoned_work() {
            use crate::routes::store::{StoreContext, StoreError, StorePort};
            use crate::security::http_auth::AuthUser;
            use std::{num::NonZeroU16, sync::Arc, time::Duration};
            let lane = crate::runtime::blocking::BlockingLane::new(NonZeroU16::new(1).unwrap());
            let owner = StoreLaneOwner { lane: lane.clone() };
            let (entered, started) = tokio::sync::oneshot::channel();
            let (release, wait) = std::sync::mpsc::channel();
            let worker_lane = lane.clone();
            let worker = tokio::spawn(async move {
                worker_lane
                    .run(move || {
                        entered.send(()).unwrap();
                        wait.recv().unwrap();
                    })
                    .await
            });
            started.await.unwrap();
            worker.abort();
            let _ = worker.await;
            let (tx, rx) = tokio::sync::oneshot::channel();
            let tx = Arc::new(std::sync::Mutex::new(Some(tx)));
            let inner: StorePort = Arc::new(move |context, _| {
                let tx = tx.clone();
                Box::pin(async move {
                    assert!(
                        tx.lock()
                            .unwrap()
                            .take()
                            .unwrap()
                            .send(context.cancellation)
                            .is_ok()
                    );
                    std::future::pending::<Result<Value, StoreError>>().await
                })
            });
            let (port, supervisor) = supervised_store_port(inner, owner);
            let context = || StoreContext {
                user: AuthUser {
                    id: "alice".into(),
                    username: "alice".into(),
                },
                cancellation: ProcessCancellation::default(),
            };
            let token = context();
            let cancel = token.cancellation.clone();
            let request_port = port.clone();
            let request =
                tokio::spawn(
                    async move { request_port(token, StoreOperation::ListInstalled).await },
                );
            let operation_cancel = rx.await.unwrap();
            supervisor.close();
            assert!(operation_cancel.is_cancelled());
            assert!(
                port(context(), StoreOperation::ListInstalled)
                    .await
                    .is_err()
            );
            let shutdown = tokio::spawn(async move { supervisor.shutdown().await });
            assert!(
                tokio::time::timeout(Duration::from_secs(5), request)
                    .await
                    .unwrap()
                    .unwrap()
                    .is_err()
            );
            assert!(operation_cancel.is_cancelled());
            assert!(!cancel.is_cancelled());
            assert!(
                port(context(), StoreOperation::ListInstalled)
                    .await
                    .is_err()
            );
            assert!(!shutdown.is_finished());
            release.send(()).unwrap();
            tokio::time::timeout(Duration::from_secs(5), shutdown)
                .await
                .unwrap()
                .unwrap();
            assert!(lane.run(|| ()).await.is_err());
        }

        #[cfg(unix)]
        #[tokio::test]
        async fn owned_supervised_port_enforces_authority_and_closes_shared_store() {
            use crate::routes::store::StoreContext;
            use crate::security::http_auth::AuthUser;
            use std::{num::NonZeroU16, os::unix::fs::PermissionsExt, sync::Arc};
            let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                .parent()
                .unwrap()
                .parent()
                .unwrap()
                .join(".jait/artifacts/gateway-rust/clawhub-store-tests")
                .join(uuid::Uuid::new_v4().to_string());
            std::fs::create_dir_all(&root).unwrap();
            std::fs::set_permissions(&root, std::fs::Permissions::from_mode(0o700)).unwrap();
            let authority: RequestAuthority = Arc::new(|context, operation| {
                Box::pin(async move {
                    if context.user.id != "alice"
                        || !matches!(operation, StoreOperation::ListInstalled)
                    {
                        return Err("request denied".into());
                    }
                    Ok(Arc::new(Deny) as Arc<dyn SkillAuthority>)
                })
            });
            let (port, supervisor) = owned_supervised_store_port(
                ClawHubClient::new(None).unwrap(),
                SkillRegistry::default(),
                SkillStore::open(root.clone()).unwrap(),
                NonZeroU16::new(1).unwrap(),
                authority,
                Arc::new(|| 0),
            );
            let context = |id: &str| StoreContext {
                user: AuthUser {
                    id: id.into(),
                    username: id.into(),
                },
                cancellation: ProcessCancellation::default(),
            };
            assert!(
                supervisor
                    .discovery_snapshot(context("alice"), |ctx| Box::pin(async move {
                        if ctx.user.id == "alice" {
                            Ok(())
                        } else {
                            Err("denied".into())
                        }
                    }))
                    .await
                    .unwrap()
                    .list()
                    .is_empty()
            );
            assert!(
                supervisor
                    .discovery_snapshot(context("bob"), |_| Box::pin(async {
                        Err("denied".into())
                    }))
                    .await
                    .is_err()
            );
            let cancelled_discovery = context("alice");
            cancelled_discovery.cancellation.cancel();
            assert!(
                supervisor
                    .discovery_snapshot(cancelled_discovery, |_| Box::pin(async {
                        panic!("cancelled discovery must not authorize")
                    }))
                    .await
                    .is_err()
            );
            assert_eq!(
                port(context("alice"), StoreOperation::ListInstalled)
                    .await
                    .unwrap(),
                serde_json::json!([])
            );
            assert!(
                port(context("bob"), StoreOperation::ListInstalled)
                    .await
                    .is_err()
            );
            let cancelled = context("alice");
            cancelled.cancellation.cancel();
            assert!(
                port(cancelled, StoreOperation::Uninstall("example".into()))
                    .await
                    .is_err()
            );
            let abandoned_parent = context("alice");
            let abandoned_parent_cancel = abandoned_parent.cancellation.clone();
            let (entered, started) = tokio::sync::oneshot::channel();
            let abandoned_token = {
                let abandoned = supervisor.discovery_snapshot(abandoned_parent, |ctx| {
                    Box::pin(async move {
                        assert!(entered.send(ctx.cancellation).is_ok());
                        std::future::pending::<SkillResult<()>>().await
                    })
                });
                tokio::pin!(abandoned);
                assert!(futures_util::poll!(abandoned.as_mut()).is_pending());
                started
                    .await
                    .unwrap_or_else(|_| panic!("discovery did not start"))
            };
            assert!(abandoned_token.is_cancelled());
            assert!(!abandoned_parent_cancel.is_cancelled());
            let parent = context("alice");
            let parent_cancel = parent.cancellation.clone();
            let (entered, started) = tokio::sync::oneshot::channel();
            let discovery = supervisor.discovery_snapshot(parent, |ctx| {
                Box::pin(async move {
                    assert!(entered.send(ctx.cancellation).is_ok());
                    std::future::pending::<SkillResult<()>>().await
                })
            });
            tokio::pin!(discovery);
            assert!(futures_util::poll!(discovery.as_mut()).is_pending());
            let operation_cancel = started
                .await
                .unwrap_or_else(|_| panic!("discovery did not start"));
            let (result, ()) = tokio::join!(discovery, supervisor.shutdown());
            assert!(result.is_err());
            assert!(operation_cancel.is_cancelled());
            assert!(!parent_cancel.is_cancelled());
            assert!(
                supervisor
                    .discovery_snapshot(context("alice"), |_| Box::pin(async {
                        panic!("closed discovery must not authorize")
                    }))
                    .await
                    .is_err()
            );
            assert!(
                port(context("alice"), StoreOperation::ListInstalled)
                    .await
                    .is_err()
            );
            std::fs::remove_dir_all(root).unwrap();
        }

        #[cfg(unix)]
        #[tokio::test]
        async fn abandoned_port_cancels_request_during_authority() {
            use crate::routes::store::StoreContext;
            use crate::security::http_auth::AuthUser;
            use std::{num::NonZeroU16, os::unix::fs::PermissionsExt, sync::Arc};
            let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                .parent()
                .unwrap()
                .parent()
                .unwrap()
                .join(".jait/artifacts/gateway-rust/clawhub-store-tests")
                .join(uuid::Uuid::new_v4().to_string());
            std::fs::create_dir_all(&root).unwrap();
            std::fs::set_permissions(&root, std::fs::Permissions::from_mode(0o700)).unwrap();
            let lane = crate::runtime::blocking::BlockingLane::new(NonZeroU16::new(1).unwrap());
            let shared = SharedStore::new(
                SkillRegistry::default(),
                SkillStore::open(root.clone()).unwrap(),
                lane,
            );
            let (entered, ready) = tokio::sync::oneshot::channel();
            let entered = Arc::new(std::sync::Mutex::new(Some(entered)));
            let authority: RequestAuthority = Arc::new(move |_, _| {
                let entered = entered.clone();
                Box::pin(async move {
                    entered.lock().unwrap().take().unwrap().send(()).unwrap();
                    std::future::pending().await
                })
            });
            let port = store_port(
                ClawHubClient::new(None).unwrap(),
                shared,
                authority,
                Arc::new(|| 0),
            );
            let cancel = ProcessCancellation::default();
            let context = StoreContext {
                user: AuthUser {
                    id: "alice".into(),
                    username: "alice".into(),
                },
                cancellation: cancel.clone(),
            };
            let task = tokio::spawn(port(context, StoreOperation::Uninstall("example".into())));
            tokio::time::timeout(std::time::Duration::from_secs(5), ready)
                .await
                .unwrap()
                .unwrap();
            task.abort();
            let _ = task.await;
            assert!(cancel.is_cancelled());
            std::fs::remove_dir_all(root).unwrap();
        }

        #[cfg(unix)]
        #[tokio::test]
        async fn cancelling_port_interrupts_pending_authority() {
            use crate::routes::store::{StoreContext, StoreError};
            use crate::security::http_auth::AuthUser;
            use std::{num::NonZeroU16, os::unix::fs::PermissionsExt, sync::Arc};
            let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                .parent()
                .unwrap()
                .parent()
                .unwrap()
                .join(".jait/artifacts/gateway-rust/clawhub-store-tests")
                .join(uuid::Uuid::new_v4().to_string());
            std::fs::create_dir_all(&root).unwrap();
            std::fs::set_permissions(&root, std::fs::Permissions::from_mode(0o700)).unwrap();
            let lane = crate::runtime::blocking::BlockingLane::new(NonZeroU16::new(1).unwrap());
            let shared = SharedStore::new(
                SkillRegistry::default(),
                SkillStore::open(root.clone()).unwrap(),
                lane,
            );
            let (entered, ready) = tokio::sync::oneshot::channel();
            let entered = Arc::new(std::sync::Mutex::new(Some(entered)));
            let authority: RequestAuthority = Arc::new(move |_, _| {
                let entered = entered.clone();
                Box::pin(async move {
                    entered.lock().unwrap().take().unwrap().send(()).unwrap();
                    std::future::pending().await
                })
            });
            let port = store_port(
                ClawHubClient::new(None).unwrap(),
                shared,
                authority,
                Arc::new(|| 0),
            );
            let cancellation = ProcessCancellation::default();
            let context = StoreContext {
                user: AuthUser {
                    id: "alice".into(),
                    username: "alice".into(),
                },
                cancellation: cancellation.clone(),
            };
            let task = tokio::spawn(port(context, StoreOperation::ListInstalled));
            tokio::time::timeout(std::time::Duration::from_secs(5), ready)
                .await
                .unwrap()
                .unwrap();
            cancellation.cancel();
            let result = tokio::time::timeout(std::time::Duration::from_secs(5), task)
                .await
                .unwrap()
                .unwrap();
            assert!(
                matches!(result, Err(StoreError::Message(message)) if message == "store request cancelled")
            );
            std::fs::remove_dir_all(root).unwrap();
        }

        #[cfg(unix)]
        #[tokio::test]
        async fn committed_uninstall_updates_later_discovery_snapshot() {
            use crate::integrations::skills::{Skill, SkillSource};
            use std::{num::NonZeroU16, os::unix::fs::PermissionsExt, sync::Arc};
            struct Allow;
            impl SkillAuthority for Allow {
                fn authorize(&self, _: SkillEffect<'_>) -> SkillResult<()> {
                    Ok(())
                }
            }
            let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                .parent()
                .unwrap()
                .parent()
                .unwrap()
                .join(".jait/artifacts/gateway-rust/clawhub-store-tests")
                .join(uuid::Uuid::new_v4().to_string());
            std::fs::create_dir_all(root.join("example/.clawhub")).unwrap();
            std::fs::set_permissions(&root, std::fs::Permissions::from_mode(0o700)).unwrap();
            std::fs::set_permissions(root.join("example"), std::fs::Permissions::from_mode(0o700))
                .unwrap();
            std::fs::write(root.join("example/.clawhub/origin.json"), br#"{"slug":"example","version":"1","registry":"https://clawhub.ai","installedAt":0}"#).unwrap();
            std::fs::write(root.join("example/SKILL.md"), "existing content").unwrap();
            let mut registry = SkillRegistry::default();
            registry
                .add(Skill {
                    id: "example".into(),
                    name: "Example".into(),
                    description: String::new(),
                    file_path: root.join("example/SKILL.md"),
                    source: SkillSource::User,
                    enabled: true,
                    requires: None,
                    install: None,
                })
                .unwrap();
            let shared = SharedStore::new(
                registry,
                SkillStore::open(root.clone()).unwrap(),
                crate::runtime::blocking::BlockingLane::new(NonZeroU16::new(1).unwrap()),
            );
            let before = shared.discovery_snapshot().await.unwrap();
            assert_eq!(before.list().len(), 1);
            shared
                .commit(
                    PreparedStoreOperation::Uninstall("example".into()),
                    0,
                    Arc::new(Allow),
                    ProcessCancellation::default(),
                )
                .await
                .unwrap();
            assert!(shared.discovery_snapshot().await.unwrap().list().is_empty());
            assert_eq!(before.list()[0].id, "example");
            assert!(!root.join("example").exists());
            std::fs::remove_dir_all(root).unwrap();
        }

        #[cfg(unix)]
        #[tokio::test]
        async fn uninstall_denial_and_abandonment_preserve_installed_files() {
            use crate::routes::store::StoreContext;
            use crate::security::http_auth::AuthUser;
            use std::{
                num::NonZeroU16,
                os::unix::fs::PermissionsExt,
                sync::{
                    Arc,
                    atomic::{AtomicUsize, Ordering},
                },
            };
            struct PauseSecond {
                count: AtomicUsize,
                entered: std::sync::Mutex<Option<tokio::sync::oneshot::Sender<()>>>,
                release: std::sync::Mutex<std::sync::mpsc::Receiver<()>>,
            }
            impl SkillAuthority for PauseSecond {
                fn authorize(&self, _: SkillEffect<'_>) -> SkillResult<()> {
                    if self.count.fetch_add(1, Ordering::SeqCst) == 1 {
                        self.entered
                            .lock()
                            .unwrap()
                            .take()
                            .unwrap()
                            .send(())
                            .unwrap();
                        self.release
                            .lock()
                            .unwrap()
                            .recv_timeout(std::time::Duration::from_secs(5))
                            .unwrap();
                    }
                    Ok(())
                }
            }
            let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                .parent()
                .unwrap()
                .parent()
                .unwrap()
                .join(".jait/artifacts/gateway-rust/clawhub-store-tests")
                .join(uuid::Uuid::new_v4().to_string());
            std::fs::create_dir_all(root.join("example/.clawhub")).unwrap();
            std::fs::set_permissions(&root, std::fs::Permissions::from_mode(0o700)).unwrap();
            std::fs::set_permissions(root.join("example"), std::fs::Permissions::from_mode(0o700))
                .unwrap();
            std::fs::write(root.join("example/.clawhub/origin.json"), br#"{"slug":"example","version":"1","registry":"https://clawhub.ai","installedAt":0}"#).unwrap();
            std::fs::write(root.join("example/SKILL.md"), "existing content").unwrap();
            let lane = crate::runtime::blocking::BlockingLane::new(NonZeroU16::new(1).unwrap());
            let shared = SharedStore::new(
                SkillRegistry::default(),
                SkillStore::open(root.clone()).unwrap(),
                lane,
            );
            let context = || StoreContext {
                user: AuthUser {
                    id: "alice".into(),
                    username: "alice".into(),
                },
                cancellation: ProcessCancellation::default(),
            };
            let denied: RequestAuthority =
                Arc::new(|_, _| Box::pin(async { Ok(Arc::new(Deny) as Arc<dyn SkillAuthority>) }));
            let client = ClawHubClient::new(None).unwrap();
            let port = store_port(client.clone(), shared.clone(), denied, Arc::new(|| 0));
            assert!(
                port(context(), StoreOperation::Uninstall("example".into()))
                    .await
                    .is_err()
            );
            assert_eq!(
                std::fs::read_to_string(root.join("example/SKILL.md")).unwrap(),
                "existing content"
            );
            let (entered, ready) = tokio::sync::oneshot::channel();
            let (release, receiver) = std::sync::mpsc::channel();
            let grant = Arc::new(PauseSecond {
                count: AtomicUsize::new(0),
                entered: std::sync::Mutex::new(Some(entered)),
                release: std::sync::Mutex::new(receiver),
            });
            let authority: RequestAuthority = Arc::new(move |_, _| {
                let grant = grant.clone();
                Box::pin(async move { Ok(grant as Arc<dyn SkillAuthority>) })
            });
            let port = store_port(client, shared.clone(), authority, Arc::new(|| 0));
            let request = context();
            let token = request.cancellation.clone();
            let mut task = tokio::spawn(port(request, StoreOperation::Uninstall("example".into())));
            tokio::select! {
                result = ready => result.expect("authorization signal"),
                result = &mut task => panic!("uninstall finished before second authorization: {result:?}"),
                _ = tokio::time::sleep(std::time::Duration::from_secs(5)) => panic!("authorization timed out"),
            }
            task.abort();
            let _ = task.await;
            assert!(token.is_cancelled());
            release.send(()).unwrap();
            tokio::time::timeout(std::time::Duration::from_secs(5), async {
                while shared.installed().await.is_err() {
                    tokio::task::yield_now().await;
                }
            })
            .await
            .unwrap();
            assert_eq!(
                std::fs::read_to_string(root.join("example/SKILL.md")).unwrap(),
                "existing content"
            );
            assert_eq!(std::fs::read_dir(&root).unwrap().count(), 1);
            std::fs::remove_dir_all(root).unwrap();
        }

        #[tokio::test]
        async fn invalid_inputs_and_cancellation_stop_before_network() {
            let client = ClawHubClient::new(None).unwrap();
            let cancel = ProcessCancellation::default();
            assert!(
                prepare(
                    &client,
                    StoreOperation::Search {
                        query: Value::Bool(true),
                        limit: 1.0
                    },
                    &[],
                    &Deny,
                    &cancel
                )
                .await
                .is_err()
            );
            assert!(
                prepare(
                    &client,
                    StoreOperation::ListPackages { limit: f64::NAN },
                    &[],
                    &Deny,
                    &cancel
                )
                .await
                .is_err()
            );
            assert!(
                prepare(
                    &client,
                    StoreOperation::Uninstall("../bad".into()),
                    &[],
                    &Deny,
                    &cancel
                )
                .await
                .is_err()
            );
            cancel.cancel();
            assert!(
                prepare(&client, StoreOperation::ListInstalled, &[], &Deny, &cancel)
                    .await
                    .is_err()
            );
        }

        #[tokio::test]
        async fn repeated_search_query_reaches_authority_as_comma_joined_value() {
            struct Capture(std::sync::Mutex<Vec<Url>>);
            impl SkillAuthority for Capture {
                fn authorize(&self, effect: SkillEffect<'_>) -> SkillResult<()> {
                    if let SkillEffect::RegistryRead { url, .. } = effect {
                        self.0.lock().unwrap().push(url.clone());
                    }
                    Err("denied".into())
                }
            }
            let client = ClawHubClient::new(None).unwrap();
            let cancel = ProcessCancellation::default();
            let authority = Capture(std::sync::Mutex::new(Vec::new()));
            let operation = StoreOperation::Search {
                query: serde_json::json!(["first word", "", "a&b"]),
                limit: 25.0,
            };
            assert!(
                matches!(prepare(&client, operation, &[], &authority, &cancel).await, Err(ref error) if error == "denied")
            );
            let url = authority.0.lock().unwrap().pop().unwrap();
            assert_eq!(
                url.query_pairs().find(|(key, _)| key == "q").unwrap().1,
                "first word,,a&b"
            );
            let oversized = StoreOperation::Search {
                query: serde_json::json!(["x".repeat(4096), "x"]),
                limit: 25.0,
            };
            assert!(
                prepare(&client, oversized, &[], &authority, &cancel)
                    .await
                    .is_err()
            );
            assert!(authority.0.lock().unwrap().is_empty());
            let commas_at_limit = StoreOperation::Search {
                query: serde_json::json!(vec![""; 4097]),
                limit: 25.0,
            };
            assert!(
                matches!(prepare(&client, commas_at_limit, &[], &authority, &cancel).await, Err(ref error) if error == "denied")
            );
            let url = authority.0.lock().unwrap().pop().unwrap();
            assert_eq!(
                url.query_pairs()
                    .find(|(key, _)| key == "q")
                    .unwrap()
                    .1
                    .len(),
                4096
            );
            let commas_over_limit = StoreOperation::Search {
                query: serde_json::json!(vec![""; 4098]),
                limit: 25.0,
            };
            assert!(
                matches!(prepare(&client, commas_over_limit, &[], &authority, &cancel).await, Err(ref error) if error == "ClawHub search query exceeds budget")
            );
            assert!(authority.0.lock().unwrap().is_empty());
        }

        #[tokio::test]
        async fn store_limits_reach_authority_with_javascript_wire_values() {
            struct Capture(std::sync::Mutex<Vec<Url>>);
            impl SkillAuthority for Capture {
                fn authorize(&self, effect: SkillEffect<'_>) -> SkillResult<()> {
                    if let SkillEffect::RegistryRead { url, .. } = effect {
                        self.0.lock().unwrap().push(url.clone());
                    }
                    Err("denied".into())
                }
            }
            let client = ClawHubClient::new(None).unwrap();
            let cancel = ProcessCancellation::default();
            let authority = Capture(std::sync::Mutex::new(Vec::new()));
            for (number, expected) in [
                (-1.0, "-1"),
                (-0.25, "-0.25"),
                (0.5, "0.5"),
                (1e-7, "1e-7"),
                (f64::NEG_INFINITY, "-Infinity"),
                (100.0, "100"),
            ] {
                for operation in [
                    StoreOperation::Search {
                        query: Value::String("test".into()),
                        limit: number,
                    },
                    StoreOperation::ListPackages { limit: number },
                ] {
                    assert!(
                        matches!(prepare(&client, operation, &[], &authority, &cancel).await, Err(ref error) if error == "denied")
                    );
                    let url = authority.0.lock().unwrap().pop().unwrap();
                    assert_eq!(
                        url.query_pairs().find(|(key, _)| key == "limit").unwrap().1,
                        expected
                    );
                }
            }
            // Direct adapter callers can supply zero: search sends it, while
            // listPackages follows the client's falsy-option omission.
            for (operation, expected) in [
                (
                    StoreOperation::Search {
                        query: Value::String("test".into()),
                        limit: -0.0,
                    },
                    Some("0"),
                ),
                (StoreOperation::ListPackages { limit: 0.0 }, None),
            ] {
                assert!(
                    prepare(&client, operation, &[], &authority, &cancel)
                        .await
                        .is_err()
                );
                let url = authority.0.lock().unwrap().pop().unwrap();
                assert_eq!(
                    url.query_pairs()
                        .find(|(key, _)| key == "limit")
                        .map(|(_, v)| v.into_owned())
                        .as_deref(),
                    expected
                );
            }
            for number in [f64::NAN, f64::INFINITY, 101.0] {
                assert!(
                    prepare(
                        &client,
                        StoreOperation::ListPackages { limit: number },
                        &[],
                        &authority,
                        &cancel
                    )
                    .await
                    .is_err()
                );
                assert!(authority.0.lock().unwrap().is_empty());
            }
            cancel.cancel();
            assert!(
                prepare(
                    &client,
                    StoreOperation::ListPackages { limit: -1.0 },
                    &[],
                    &authority,
                    &cancel
                )
                .await
                .is_err()
            );
            assert!(authority.0.lock().unwrap().is_empty());
        }

        #[tokio::test]
        async fn installed_state_comes_from_host_snapshot() {
            let client = ClawHubClient::new(None).unwrap();
            let cancel = ProcessCancellation::default();
            let installed = vec!["example".to_owned(), "local.skill".to_owned()];
            for (id, expected) in [
                ("example", true),
                ("local.skill", true),
                ("../missing", false),
            ] {
                let result = prepare(
                    &client,
                    StoreOperation::IsInstalled(id.into()),
                    &installed,
                    &Deny,
                    &cancel,
                )
                .await
                .unwrap();
                assert!(
                    matches!(result, PreparedStoreOperation::Value(Value::Bool(value)) if value == expected)
                );
            }
        }
    }
}
