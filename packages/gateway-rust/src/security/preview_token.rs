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

#[cfg(test)]
mod tests {
    use super::*;

    const SECRET: &str = "preview-secret";
    const ISSUED: u64 = 1_700_000_000;

    #[test]
    fn round_trip_returns_subject_for_matching_resource() {
        let token = sign_preview_token_at("user-1", "devtools:grant-1", SECRET, ISSUED).unwrap();
        assert_eq!(
            verify_preview_token_at(&token, "devtools:grant-1", SECRET, ISSUED + 10).as_deref(),
            Some("user-1")
        );
    }

    #[test]
    fn resource_mismatch_wrong_secret_and_garbage_are_rejected() {
        let token = sign_preview_token_at("user-1", "devtools:grant-1", SECRET, ISSUED).unwrap();
        assert!(verify_preview_token_at(&token, "devtools:grant-2", SECRET, ISSUED).is_none());
        assert!(verify_preview_token_at(&token, "devtools:grant-1", "other", ISSUED).is_none());
        assert!(verify_preview_token_at("not-a-jwt", "devtools:grant-1", SECRET, ISSUED).is_none());
    }

    #[test]
    fn token_stops_verifying_after_one_hour() {
        let token = sign_preview_token_at("user-1", "r", SECRET, ISSUED).unwrap();
        assert!(verify_preview_token_at(&token, "r", SECRET, ISSUED + 3599).is_some());
        assert!(verify_preview_token_at(&token, "r", SECRET, ISSUED + 3601).is_none());
    }

    #[test]
    fn empty_secret_is_rejected() {
        assert!(sign_preview_token_at("u", "r", "", ISSUED).is_err());
    }
}
