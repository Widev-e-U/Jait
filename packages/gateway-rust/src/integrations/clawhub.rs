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
            let mut response = client
                .get(url.clone())
                .header("User-Agent", "Jait/1.0")
                .header(
                    "Accept",
                    if download {
                        "application/zip"
                    } else {
                        "application/json"
                    },
                )
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
        url.query_pairs_mut()
            .append_pair("q", query)
            .append_pair("limit", &bounded_limit(limit)?.to_string());
        Ok(self
            .json::<SearchResponse>(url, authority, cancel)
            .await?
            .results
            .unwrap_or_default())
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
        if let Some(limit) = limit {
            url.query_pairs_mut()
                .append_pair("limit", &bounded_limit(Some(limit))?.to_string());
        }
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
        if let Some(limit) = limit {
            url.query_pairs_mut()
                .append_pair("limit", &bounded_limit(Some(limit))?.to_string());
        }
        let value: Value = self.json(url, authority, cancel).await?;
        decode_package_list(value)
    }
}

// Keep the parser bounded even when exercised independently of the HTTP reader.
// Serde's default nesting limit remains enabled for untrusted response JSON.
fn decode_api_response<T: DeserializeOwned>(body: &[u8]) -> SkillResult<T> {
    if body.len() > MAX_API_BYTES {
        return Err("ClawHub response exceeds byte budget".into());
    }
    serde_json::from_slice(body).map_err(|_| "Malformed ClawHub API response".into())
}

fn decode_package_list(value: Value) -> SkillResult<Vec<Value>> {
    match value {
        Value::Array(items) => Ok(items),
        Value::Object(map) => match map.get("items") {
            None | Some(Value::Null) => Ok(vec![]),
            Some(Value::Array(items)) => Ok(items.clone()),
            _ => Err("Malformed ClawHub package list".into()),
        },
        Value::Null => Err("Malformed ClawHub package list".into()),
        // JS boxes non-null primitives; their missing items property falls
        // back to [] just like an empty object.
        _ => Ok(vec![]),
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
