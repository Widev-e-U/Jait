//! Resource-scoped one-hour tokens. They cannot authenticate an application session.
use super::http_auth::{current_timestamp, verify_hs256_claims_at};
use jsonwebtoken::{Algorithm, EncodingKey, Header, encode};
use serde_json::json;
type Error = Box<dyn std::error::Error + Send + Sync>;

pub fn sign_preview_token(user_id: &str, resource: &str, secret: &str) -> Result<String, Error> {
    sign_preview_token_at(user_id, resource, secret, current_timestamp())
}
pub fn sign_preview_token_at(
    user_id: &str,
    resource: &str,
    secret: &str,
    now: u64,
) -> Result<String, Error> {
    if secret.is_empty() {
        return Err("Zero-length key is not supported".into());
    }
    let mut header = Header::new(Algorithm::HS256);
    header.typ = None;
    Ok(encode(
        &header,
        &json!({"purpose":"preview","resource":resource,"sub":user_id,"iat":now,"exp":now+3600}),
        &EncodingKey::from_secret(secret.as_bytes()),
    )?)
}
pub fn verify_preview_token(token: &str, resource: &str, secret: &str) -> Option<String> {
    verify_preview_token_at(token, resource, secret, current_timestamp())
}
pub fn verify_preview_token_at(
    token: &str,
    resource: &str,
    secret: &str,
    now: u64,
) -> Option<String> {
    let claims = verify_hs256_claims_at(token, secret.as_bytes(), now)?;
    if claims.get("purpose")?.as_str()? != "preview"
        || claims.get("resource")?.as_str()? != resource
    {
        return None;
    }
    Some(claims.get("sub")?.as_str()?.to_owned())
}
