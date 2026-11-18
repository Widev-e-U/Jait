//! Operator-facing npm failure diagnostics. This does not execute updates.
//! The host supplies the thrown value's display text (Error.message or String(value))
//! and an optional string code; arbitrary JS coercion hooks remain at that boundary.
use crate::contracts::bounded_json::Utf16Text;
use serde::Serialize;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
pub enum UpdateFailureCode {
    #[serde(rename = "ETARGET")]
    Target,
    #[serde(rename = "E404")]
    NotFound,
    #[serde(rename = "EACCES")]
    Access,
    #[serde(rename = "ENETWORK")]
    Network,
    #[serde(rename = "EBADENGINE")]
    Engine,
    #[serde(rename = "ETIMEDOUT")]
    Timeout,
    #[serde(rename = "UNKNOWN")]
    Unknown,
}
#[derive(Clone, Debug, Serialize)]
pub struct UpdateFailureDescription {
    pub detail: Utf16Text,
    pub hint: Option<&'static str>,
    pub code: UpdateFailureCode,
}
/// Preserve JavaScript UTF-16 tail slicing, even when a pair is split.
/// Classification always uses the complete untrimmed message.
pub fn describe_update_failure(raw: &Utf16Text, code: Option<&str>) -> UpdateFailureDescription {
    let whitespace =
        |unit: &u16| char::from_u32(u32::from(*unit)).is_some_and(crate::text::js_whitespace);
    let start = raw
        .0
        .iter()
        .position(|v| !whitespace(v))
        .unwrap_or(raw.0.len());
    let end = raw
        .0
        .iter()
        .rposition(|v| !whitespace(v))
        .map_or(start, |i| i + 1);
    let trimmed = &raw.0[start..end];
    let detail = if trimmed.is_empty() {
        Utf16Text::from("npm install failed with no output")
    } else if trimmed.len() > 1200 {
        let mut tail = vec![0x2026];
        tail.extend_from_slice(&trimmed[trimmed.len() - 1200..]);
        Utf16Text(tail)
    } else {
        Utf16Text(trimmed.to_vec())
    };
    let haystack = String::from_utf16_lossy(&raw.0).to_lowercase();
    let code = code.unwrap_or("").to_lowercase();
    let has = |needle: &str| haystack.contains(needle) || code.contains(needle);
    let (code, hint) = if has("etarget") || haystack.contains("no matching version found") {
        (
            UpdateFailureCode::Target,
            Some(
                "This release references a dependency version that is not published on npm, so npm cannot resolve the install. Nothing is wrong with your machine — the release was published incompletely. Retry later once the maintainers re-publish the missing package, or roll back to the previous version.",
            ),
        )
    } else if has("e404")
        || haystack.contains("404 not found")
        || haystack.contains("not in this registry")
    {
        (
            UpdateFailureCode::NotFound,
            Some(
                "npm could not find that package version in the registry. It may not be published yet (the release job can lag behind the version bump) — retry in a few minutes or install the previous version.",
            ),
        )
    } else if has("eacces") || has("eperm") || haystack.contains("permission denied") {
        (
            UpdateFailureCode::Access,
            Some(
                "npm could not write to its global install directory. Run the gateway under the account that owns the npm prefix, or configure a user-writable prefix (`npm config set prefix ~/.npm-global`) and retry.",
            ),
        )
    } else if has("ebadengine")
        || haystack.contains("unsupported engine")
        || haystack.contains("requires node")
    {
        (
            UpdateFailureCode::Engine,
            Some(
                "This release requires a newer Node.js than the one running the gateway. Upgrade Node, then retry the update.",
            ),
        )
    } else if has("etimedout") || haystack.contains("timed out") || haystack.contains("timeout") {
        (
            UpdateFailureCode::Timeout,
            Some(
                "The install timed out — the npm registry was too slow or unreachable (proxy/firewall?). Check connectivity and retry, or raise the timeout.",
            ),
        )
    } else if has("enotfound")
        || has("eai_again")
        || has("econnreset")
        || has("econnrefused")
        || haystack.contains("network")
        || haystack.contains("proxy")
    {
        (
            UpdateFailureCode::Network,
            Some(
                "Could not reach the npm registry. Check this machine's network, DNS and proxy configuration, then retry.",
            ),
        )
    } else {
        (UpdateFailureCode::Unknown, None)
    };
    UpdateFailureDescription { detail, hint, code }
}
