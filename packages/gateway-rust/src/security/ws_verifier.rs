//! WebSocket token verification backed by the gateway's own JWT secret.
//!
//! The connection transport used to depend on a token table supplied by its embedder,
//! which meant a production hub either denied every client or trusted a hand-written
//! table. This implementation closes that gap by verifying exactly the tokens the HTTP
//! auth routes mint, with the same algorithm, the same `purpose` rejection and the same
//! expiry rule. Admission failures stay generic (`invalid token`) so the hub's public
//! denial message does not leak whether a token merely expired or was never valid.

use std::sync::Arc;

use crate::security::http_auth::{current_timestamp, verify_auth_token_claims_at};
use crate::ws::{TokenVerifier, WsIdentity};

/// Verifies HMAC-SHA256 session tokens against the gateway signing secret.
pub struct JwtTokenVerifier {
    secret: Arc<String>,
}

impl JwtTokenVerifier {
    pub fn new(secret: Arc<String>) -> Self {
        Self { secret }
    }
}

impl TokenVerifier for JwtTokenVerifier {
    fn verify(&self, token: &str) -> Result<WsIdentity, String> {
        // A socket cannot outlive its credential, so the hub needs a trusted expiry:
        // a token that verifies but carries no `exp` is refused instead of admitted.
        let (user, expires_at) =
            verify_auth_token_claims_at(token, &self.secret, current_timestamp())
                .and_then(|(user, expires_at)| expires_at.map(|expires_at| (user, expires_at)))
                .ok_or_else(|| "invalid token".to_string())?;
        Ok(WsIdentity {
            user_id: user.id,
            // Tokens carry no session id; the connection binds to a user, and session
            // lookups remain the hub's business.
            session_id: None,
            expires_at,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::security::http_auth::{AuthUser, sign_auth_token_at, verify_auth_token_at};
    use jsonwebtoken::{Algorithm, EncodingKey, Header, encode};
    use serde_json::json;

    const SECRET: &str = "test-secret-key-that-is-long-enough";

    fn user() -> AuthUser {
        AuthUser {
            id: "user-1".into(),
            username: "alice".into(),
        }
    }

    fn mint(claims: serde_json::Value) -> String {
        encode(
            &Header::new(Algorithm::HS256),
            &claims,
            &EncodingKey::from_secret(SECRET.as_bytes()),
        )
        .expect("mint token")
    }

    fn verifier() -> JwtTokenVerifier {
        JwtTokenVerifier::new(Arc::new(SECRET.to_string()))
    }

    #[test]
    fn accepts_a_token_the_auth_routes_minted() {
        let token = sign_auth_token_at(&user(), SECRET, current_timestamp()).expect("sign");
        let identity = verifier().verify(&token).expect("verified");
        assert_eq!(identity.user_id, "user-1");
        assert_eq!(identity.session_id, None);
        let http = verify_auth_token_at(&token, SECRET, current_timestamp()).expect("http verify");
        assert_eq!(identity.expires_at, current_timestamp() + 7 * 24 * 60 * 60);
        assert_eq!(http.id, identity.user_id);
    }

    #[test]
    fn rejects_tokens_signed_with_another_secret() {
        let token = sign_auth_token_at(&user(), "some-other-secret-entirely", current_timestamp())
            .expect("sign");
        assert_eq!(verifier().verify(&token).unwrap_err(), "invalid token");
    }

    #[test]
    fn rejects_malformed_and_empty_tokens_generically() {
        assert_eq!(verifier().verify("").unwrap_err(), "invalid token");
        assert_eq!(verifier().verify("not a jwt").unwrap_err(), "invalid token");
        assert_eq!(
            verifier().verify("aaa.bbb.ccc").unwrap_err(),
            "invalid token"
        );
    }

    #[test]
    fn rejects_tokens_without_a_trusted_expiry() {
        let now = current_timestamp();
        let token = mint(json!({"sub": "user-1", "username": "alice", "iat": now}));
        assert_eq!(verifier().verify(&token).unwrap_err(), "invalid token");
    }

    #[test]
    fn rejects_non_access_purpose_tokens() {
        let now = current_timestamp();
        let token = mint(json!({
            "sub": "user-1",
            "username": "alice",
            "exp": now + 600,
            "purpose": "refresh",
        }));
        assert_eq!(verifier().verify(&token).unwrap_err(), "invalid token");
    }

    #[test]
    fn expiry_boundary_matches_the_http_helper() {
        let now = current_timestamp();
        // Minted in the past so the token is already at its last valid second.
        let token = mint(json!({"sub": "user-1", "username": "alice", "exp": now + 1}));
        assert!(verifier().verify(&token).is_ok());
        assert_eq!(verifier().verify(&token).unwrap().expires_at, now + 1);
        let expired = mint(json!({"sub": "user-1", "username": "alice", "exp": now}));
        assert_eq!(verifier().verify(&expired).unwrap_err(), "invalid token");
        assert!(verify_auth_token_at(&expired, SECRET, now).is_none());
    }
}
