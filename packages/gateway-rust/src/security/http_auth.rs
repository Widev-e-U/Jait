use base64::{
    Engine, alphabet,
    engine::{
        DecodePaddingMode, GeneralPurpose, GeneralPurposeConfig, general_purpose::URL_SAFE_NO_PAD,
    },
};

// jose uses the forgiving base64url decoder: optional padding, ASCII whitespace,
// and unused low bits. The signed message is never normalized.
fn decode_base64url(value: &str) -> Option<Vec<u8>> {
    let decoder = GeneralPurpose::new(
        &alphabet::URL_SAFE,
        GeneralPurposeConfig::new()
            .with_decode_padding_mode(DecodePaddingMode::Indifferent)
            .with_decode_allow_trailing_bits(true),
    );
    let compact: Vec<u8> = value
        .bytes()
        .filter(|b| !matches!(b, b' ' | b'\t' | b'\n' | b'\r' | 0x0c))
        .collect();
    decoder.decode(compact).ok()
}
use jsonwebtoken::{Algorithm, DecodingKey, EncodingKey, Header, crypto, encode};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::time::{SystemTime, UNIX_EPOCH};

pub const AUTH_COOKIE_NAME: &str = "jait_token";

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct AuthUser {
    pub id: String,
    pub username: String,
}

pub fn is_public_api_path(path: &str) -> bool {
    matches!(
        path,
        "/api/auth/login"
            | "/api/auth/register"
            | "/api/auth/refresh"
            | "/api/mobile/discovery"
            | "/api/email/oauth/callback"
            | "/api/calendar/oauth/callback"
            | "/api/github/apps/callback"
            | "/api/github/apps/webhook"
    )
}

pub fn extract_bearer_token(header: Option<&str>) -> Option<&str> {
    let header = crate::text::js_trim(header?);
    if !header.get(..7)?.eq_ignore_ascii_case("bearer ") {
        return None;
    }
    let token = crate::text::js_trim(&header[7..]);
    (!token.is_empty()).then_some(token)
}

#[derive(Debug)]
pub struct SecretError;
impl std::fmt::Display for SecretError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("JWT secret is not configured")
    }
}
impl std::error::Error for SecretError {}

fn secret_bytes(secret: &str) -> Result<&[u8], SecretError> {
    if crate::text::js_trim(secret).is_empty() {
        Err(SecretError)
    } else {
        // Use the original bytes; trimming only checks whether the key is empty.
        Ok(secret.as_bytes())
    }
}

pub fn current_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

pub fn sign_auth_token(
    user: &AuthUser,
    secret: &str,
) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
    sign_auth_token_at(user, secret, current_timestamp())
}

pub fn sign_auth_token_at(
    user: &AuthUser,
    secret: &str,
    now: u64,
) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
    Ok(encode(
        &Header::new(Algorithm::HS256),
        &json!({"sub": user.id, "username": user.username, "iat": now, "exp": now + 7 * 24 * 60 * 60}),
        &EncodingKey::from_secret(secret_bytes(secret)?),
    )?)
}

/// Truthiness follows the existing JavaScript purpose check, including objects/arrays.
fn truthy(value: &Value) -> bool {
    match value {
        Value::Null => false,
        Value::Bool(v) => *v,
        Value::Number(v) => v.as_f64().is_some_and(|v| v != 0.0),
        Value::String(v) => !v.is_empty(),
        _ => true,
    }
}

pub fn verify_auth_token(token: &str, secret: &str) -> Option<AuthUser> {
    verify_auth_token_at(token, secret, current_timestamp())
}

pub(crate) fn verify_hs256_claims_at(token: &str, key: &[u8], now: u64) -> Option<Value> {
    if key.is_empty() {
        return None;
    }
    let mut parts = token.split('.');
    let encoded_header = parts.next()?;
    let encoded_payload = parts.next()?;
    let signature = parts.next()?;
    if parts.next().is_some() {
        return None;
    }
    let header: Value = serde_json::from_slice(&decode_base64url(encoded_header)?).ok()?;
    let header = header.as_object()?;
    if header.get("alg")?.as_str()? != "HS256" {
        return None;
    }
    // jose accepts the registered b64 critical extension, but JWT requires an encoded
    // payload. No other critical extensions are supported by this gateway.
    if let Some(crit) = header.get("crit") {
        let crit = crit.as_array()?;
        if crit.is_empty() || crit.iter().any(|v| v.as_str() != Some("b64")) {
            return None;
        }
        if !header.get("b64")?.as_bool()? {
            return None;
        }
    }
    // Verify the ORIGINAL compact signing input with the vetted crypto provider.
    // jsonwebtoken's typed Header flattens unknown values to String, rejecting
    // jose-supported boolean b64 and arbitrary noncritical JSON header fields.
    // Keeping JOSE parsing here preserves those inputs without rewriting signatures.
    let message = token.rsplit_once('.')?.0;
    if !crypto::verify(
        &URL_SAFE_NO_PAD.encode(decode_base64url(signature)?),
        message.as_bytes(),
        &DecodingKey::from_secret(key),
        Algorithm::HS256,
    )
    .ok()?
    {
        return None;
    }
    // jose: optional exp, equality expires, zero leeway, fractional NumericDates;
    // iat is type checked, and aud is unconstrained without an audience option.
    let claims: Value = serde_json::from_slice(&decode_base64url(encoded_payload)?).ok()?;
    let object = claims.as_object()?;
    for name in ["iat", "nbf", "exp"] {
        if let Some(value) = object.get(name) {
            let value = value.as_f64()?;
            if (name == "exp" && value <= now as f64) || (name == "nbf" && value > now as f64) {
                return None;
            }
        }
    }
    Some(claims)
}

pub fn verify_auth_token_at(token: &str, secret: &str, now: u64) -> Option<AuthUser> {
    verify_auth_token_claims_at(token, secret, now).map(|(user, _)| user)
}

/// Verified identity plus the absolute `exp` second the token carries, if any.
///
/// Acceptance is identical to [`verify_auth_token_at`]. The expiry is returned so
/// connection transports can fence an identity against the clock without parsing
/// the token a second time. jose compares the fractional NumericDate directly, so
/// rounding the boundary up keeps whole-second clocks on the same side of it.
pub fn verify_auth_token_claims_at(
    token: &str,
    secret: &str,
    now: u64,
) -> Option<(AuthUser, Option<u64>)> {
    let claims = verify_hs256_claims_at(token, secret_bytes(secret).ok()?, now)?;
    let object = claims.as_object()?;
    let id = object.get("sub")?.as_str()?;
    let username = object.get("username")?.as_str()?;
    if id.is_empty() || username.is_empty() || object.get("purpose").is_some_and(truthy) {
        return None;
    }
    let expires_at = match object.get("exp") {
        Some(value) => Some(value.as_f64()?.max(0.0).ceil() as u64),
        None => None,
    };
    Some((
        AuthUser {
            id: id.into(),
            username: username.into(),
        },
        expires_at,
    ))
}

pub fn resolve_auth(
    authorization: Option<&str>,
    cookie: Option<&str>,
    secret: &str,
) -> Option<AuthUser> {
    let token = extract_bearer_token(authorization).or_else(|| cookie.filter(|v| !v.is_empty()))?;
    verify_auth_token(token, secret)
}

pub fn require_auth(
    authorization: Option<&str>,
    cookie: Option<&str>,
    secret: &str,
) -> Result<AuthUser, (u16, Value)> {
    resolve_auth(authorization, cookie, secret).ok_or((401, json!({"detail": "login_required"})))
}
