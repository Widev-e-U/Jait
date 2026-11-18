//! Bounded Teams JWT verification against an issuer-bound, trusted JWKS.
//! Fetching discovery/JWKS and runtime integration are deliberately separate.
use jsonwebtoken::{Algorithm, DecodingKey, Validation, decode, decode_header};
use serde_json::Value;

const MAX_TOKEN: usize = 16_384;
const MAX_JWKS_BYTES: usize = 256 * 1024;
const MAX_KEYS: usize = 64;

/// Map the three TypeScript-supported issuers to fixed discovery origins.
/// Tenant must be configured by the runtime, not selected by an incoming token.
pub fn discovery_url(issuer: &str, tenant: &str) -> Option<String> {
    if tenant.is_empty()
        || tenant == "."
        || tenant == ".."
        || tenant.len() > 255
        || !tenant
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'.')
    {
        return None;
    }
    if issuer == "https://api.botframework.com" {
        return Some("https://login.botframework.com/v1/.well-known/openidconfiguration".into());
    }
    if issuer == format!("https://sts.windows.net/{tenant}/") {
        return Some(format!(
            "https://login.microsoftonline.com/{tenant}/.well-known/openid-configuration"
        ));
    }
    if issuer == format!("https://login.microsoftonline.com/{tenant}/v2.0") {
        return Some(format!(
            "https://login.microsoftonline.com/{tenant}/v2.0/.well-known/openid-configuration"
        ));
    }
    None
}

/// The caller must bind the JWKS bytes to this exact issuer using a pinned,
/// no-redirect discovery and key fetch. This function never fetches URLs.
/// It validates RS256 signature, issuer, audience, expiry and not-before.
pub fn verify_token(
    token: &str,
    audience: &str,
    tenant: &str,
    issuer: &str,
    trusted_jwks: &[u8],
) -> Result<(), String> {
    if token.len() > MAX_TOKEN
        || audience.is_empty()
        || trusted_jwks.len() > MAX_JWKS_BYTES
        || discovery_url(issuer, tenant).is_none()
    {
        return Err("Invalid Teams token configuration".into());
    }
    let header = decode_header(token).map_err(|_| "Invalid Teams token".to_string())?;
    if header.alg != Algorithm::RS256 {
        return Err("Unsupported Teams token algorithm".into());
    }
    let kid = header
        .kid
        .filter(|k| !k.is_empty() && k.len() <= 256)
        .ok_or_else(|| "Missing Teams key ID".to_string())?;
    let jwks: Value =
        serde_json::from_slice(trusted_jwks).map_err(|_| "Invalid Teams key set".to_string())?;
    let keys = jwks
        .get("keys")
        .and_then(Value::as_array)
        .filter(|k| k.len() <= MAX_KEYS)
        .ok_or_else(|| "Invalid Teams key set".to_string())?;
    let matches: Vec<_> = keys
        .iter()
        .filter(|key| key.get("kid").and_then(Value::as_str) == Some(kid.as_str()))
        .collect();
    if matches.len() != 1 {
        return Err("Unknown or ambiguous Teams key ID".into());
    }
    let key = matches[0];
    if key.get("kty").and_then(Value::as_str) != Some("RSA")
        || key
            .get("use")
            .and_then(Value::as_str)
            .is_some_and(|v| v != "sig")
        || key
            .get("alg")
            .and_then(Value::as_str)
            .is_some_and(|v| v != "RS256")
    {
        return Err("Invalid Teams signing key".into());
    }
    let n = key
        .get("n")
        .and_then(Value::as_str)
        .filter(|s| s.len() <= 2048)
        .ok_or_else(|| "Invalid Teams signing key".to_string())?;
    let e = key
        .get("e")
        .and_then(Value::as_str)
        .filter(|s| s.len() <= 16)
        .ok_or_else(|| "Invalid Teams signing key".to_string())?;
    let decoding = DecodingKey::from_rsa_components(n, e)
        .map_err(|_| "Invalid Teams signing key".to_string())?;
    let mut validation = Validation::new(Algorithm::RS256);
    validation.set_required_spec_claims(&["exp", "iss", "aud"]);
    validation.set_audience(&[audience]);
    validation.set_issuer(&[issuer]);
    validation.validate_nbf = true;
    validation.leeway = 0;
    decode::<Value>(token, &decoding, &validation)
        .map_err(|_| "Invalid Teams token".to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn discovery_is_fixed_to_configured_tenant() {
        assert_eq!(
            discovery_url("https://api.botframework.com", "tenant"),
            Some("https://login.botframework.com/v1/.well-known/openidconfiguration".into())
        );
        assert!(discovery_url("https://sts.windows.net/other/", "tenant").is_none());
        assert!(discovery_url("https://api.botframework.com", "../evil").is_none());
    }
    #[test]
    fn rejects_malformed_and_oversized_inputs() {
        assert!(
            verify_token(
                "invalid",
                "app",
                "tenant",
                "https://api.botframework.com",
                b"{}"
            )
            .is_err()
        );
        assert!(
            verify_token(
                &"x".repeat(MAX_TOKEN + 1),
                "app",
                "tenant",
                "https://api.botframework.com",
                b"{}"
            )
            .is_err()
        );
        assert!(verify_token("invalid", "app", "tenant", "https://evil.test", b"{}").is_err());
    }
}

use crate::security::ssrf_guard::SsrfGuard;
use futures_util::future::BoxFuture;
use std::{
    net::{IpAddr, SocketAddr},
    time::Duration,
};
use tokio::sync::watch;
use url::Url;

const FETCH_TIMEOUT: Duration = Duration::from_secs(10);
const DNS_TIMEOUT: Duration = Duration::from_secs(5);
const MAX_DNS_ADDRESSES: usize = 32;
const MAX_DISCOVERY_BYTES: usize = 64 * 1024;

/// Runtime policy must authorize each concrete outbound URL before DNS or HTTP.
/// The grant is scoped to Teams discovery/key retrieval, not general networking.
pub trait TeamsDiscoveryAuthority: Send + Sync {
    fn authorize(&self, url: String) -> BoxFuture<'_, Result<(), String>>;
}

/// Strict JWKS URI policy. Query parameters are allowed for Microsoft key sets,
/// but credentials, nonstandard ports, fragments and non-Microsoft hosts are not.
fn trusted_jwks_url(raw: &str) -> Result<Url, String> {
    if raw.len() > 4096 {
        return Err("Invalid Teams JWKS URL".into());
    }
    let url = SsrfGuard::default()
        .validate(raw)
        .map_err(|_| "Invalid Teams JWKS URL".to_string())?;
    if url.scheme() != "https"
        || url.port().is_some()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.fragment().is_some()
        || !matches!(
            url.host_str(),
            Some("login.botframework.com" | "login.microsoftonline.com")
        )
    {
        return Err("Invalid Teams JWKS URL".into());
    }
    Ok(url)
}

fn public_addresses(addresses: Vec<SocketAddr>) -> Result<Vec<SocketAddr>, String> {
    if addresses.is_empty() || addresses.len() > MAX_DNS_ADDRESSES {
        return Err("Invalid Teams DNS response".into());
    }
    let guard = SsrfGuard::default();
    for address in &addresses {
        let raw = match address.ip() {
            IpAddr::V4(ip) => format!("https://{ip}/"),
            IpAddr::V6(ip) => format!("https://[{ip}]/"),
        };
        guard
            .validate(&raw)
            .map_err(|_| "Blocked Teams DNS address".to_string())?;
        if address.port() != 443 {
            return Err("Invalid Teams DNS port".into());
        }
    }
    Ok(addresses)
}

async fn cancelled(cancel: &mut watch::Receiver<bool>) {
    while !*cancel.borrow_and_update() {
        if cancel.changed().await.is_err() {
            break;
        }
    }
}

async fn pinned_get(
    url: Url,
    limit: usize,
    authority: &dyn TeamsDiscoveryAuthority,
    cancel: &mut watch::Receiver<bool>,
) -> Result<Vec<u8>, String> {
    if *cancel.borrow() {
        return Err("Teams request cancelled".into());
    }
    let hostname = url
        .host_str()
        .ok_or_else(|| "Invalid Teams endpoint".to_string())?
        .to_owned();
    tokio::select! {
        biased;
        _ = cancelled(cancel) => return Err("Teams request cancelled".into()),
        result = tokio::time::timeout(DNS_TIMEOUT, authority.authorize(url.to_string())) => result.map_err(|_| "Teams authorization timed out".to_string())??,
    }
    let addresses: Vec<_> = tokio::select! {
        biased;
        _ = cancelled(cancel) => return Err("Teams request cancelled".into()),
        result = tokio::time::timeout(DNS_TIMEOUT, tokio::net::lookup_host((hostname.as_str(), 443))) => result.map_err(|_| "Teams DNS timed out".to_string())?.map_err(|_| "Teams DNS failed".to_string())?.collect(),
    };
    let addresses = public_addresses(addresses)?;
    let client = reqwest::Client::builder()
        .no_proxy()
        .retry(reqwest::retry::never())
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(3))
        .timeout(FETCH_TIMEOUT)
        .pool_max_idle_per_host(0)
        .no_gzip()
        .no_brotli()
        .no_deflate()
        .no_zstd()
        .resolve_to_addrs(&hostname, &addresses)
        .build()
        .map_err(|_| "Teams client failed".to_string())?;
    let operation = async {
        let mut response = client
            .get(url)
            .send()
            .await
            .map_err(|_| "Teams request failed".to_string())?;
        if !response.status().is_success() {
            return Err("Teams endpoint returned non-success status".into());
        }
        let mut bytes = Vec::new();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|_| "Teams response failed".to_string())?
        {
            if bytes.len().saturating_add(chunk.len()) > limit {
                return Err("Teams response too large".into());
            }
            bytes.extend_from_slice(&chunk);
        }
        Ok(bytes)
    };
    tokio::select! {
        biased;
        _ = cancelled(cancel) => Err("Teams request cancelled".into()),
        result = tokio::time::timeout(FETCH_TIMEOUT, operation) => result.map_err(|_| "Teams request timed out".to_string())?,
    }
}

/// Fetch a trusted issuer-bound key set. Runtime must supervise cancellation and
/// provide authority; neither issuer nor tenant may come from the incoming token.
pub async fn fetch_trusted_jwks(
    issuer: &str,
    tenant: &str,
    authority: &dyn TeamsDiscoveryAuthority,
    mut cancel: watch::Receiver<bool>,
) -> Result<Vec<u8>, String> {
    let endpoint =
        discovery_url(issuer, tenant).ok_or_else(|| "Invalid Teams issuer".to_string())?;
    let discovery = Url::parse(&endpoint).map_err(|_| "Invalid Teams discovery URL".to_string())?;
    let body = pinned_get(discovery, MAX_DISCOVERY_BYTES, authority, &mut cancel).await?;
    let value: Value = serde_json::from_slice(&body)
        .map_err(|_| "Invalid Teams discovery document".to_string())?;
    let raw = value
        .get("jwks_uri")
        .and_then(Value::as_str)
        .ok_or_else(|| "Missing Teams JWKS URL".to_string())?;
    let jwks_url = trusted_jwks_url(raw)?;
    pinned_get(jwks_url, MAX_JWKS_BYTES, authority, &mut cancel).await
}

#[cfg(test)]
mod transport_tests {
    use super::*;
    #[test]
    fn rejects_host_and_authority_escapes() {
        assert!(
            trusted_jwks_url("https://login.microsoftonline.com/common/discovery/keys?appid=x")
                .is_ok()
        );
        for raw in [
            "http://login.microsoftonline.com/keys",
            "https://login.microsoftonline.com.evil.test/keys",
            "https://user@login.microsoftonline.com/keys",
            "https://login.microsoftonline.com:8443/keys",
            "https://login.microsoftonline.com/keys#x",
            "https://127.0.0.1/keys",
        ] {
            assert!(trusted_jwks_url(raw).is_err(), "{raw}");
        }
    }
    #[test]
    fn rejects_mixed_private_and_public_dns_answers() {
        assert!(public_addresses(vec!["8.8.8.8:443".parse().unwrap()]).is_ok());
        assert!(
            public_addresses(vec![
                "8.8.8.8:443".parse().unwrap(),
                "127.0.0.1:443".parse().unwrap()
            ])
            .is_err()
        );
        assert!(public_addresses(vec!["[::ffff:127.0.0.1]:443".parse().unwrap()]).is_err());
    }
}
