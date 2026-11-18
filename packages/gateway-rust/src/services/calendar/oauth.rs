use super::{Request, Transport, field, js_text, nullish};
use crate::{
    text::js_trim,
    time::{Clock, default_clock},
};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarOAuthCredentials {
    pub client_id: String,
    pub client_secret: String,
}
const TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
pub fn calendar_credentials_from_env(
    env: &HashMap<String, String>,
) -> Option<CalendarOAuthCredentials> {
    let read = |key: &str| {
        env.get(key)
            .map(|s| js_trim(s))
            .filter(|s| !s.is_empty())
            .map(String::from)
    };
    Some(CalendarOAuthCredentials {
        client_id: read("GOOGLE_CALENDAR_OAUTH_CLIENT_ID")
            .or_else(|| read("GMAIL_OAUTH_CLIENT_ID"))?,
        client_secret: read("GOOGLE_CALENDAR_OAUTH_CLIENT_SECRET")
            .or_else(|| read("GMAIL_OAUTH_CLIENT_SECRET"))?,
    })
}
pub fn env_calendar_credentials() -> Option<CalendarOAuthCredentials> {
    calendar_credentials_from_env(&std::env::vars().collect())
}
pub fn calendar_pkce_from_entropy(entropy: [u8; 32]) -> Value {
    let verifier = URL_SAFE_NO_PAD.encode(entropy);
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    json!({"verifier":verifier,"challenge":challenge})
}
pub fn create_calendar_pkce() -> Result<Value, String> {
    let mut entropy = [0u8; 32];
    getrandom::fill(&mut entropy).map_err(|e| e.to_string())?;
    Ok(calendar_pkce_from_entropy(entropy))
}
pub fn build_calendar_authorize_url(
    credentials: &CalendarOAuthCredentials,
    redirect_uri: &str,
    state: &str,
    challenge: &str,
) -> String {
    let mut url =
        url::Url::parse("https://accounts.google.com/o/oauth2/v2/auth").expect("constant URL");
    url.query_pairs_mut().append_pair("client_id",&credentials.client_id).append_pair("redirect_uri",redirect_uri)
        .append_pair("response_type","code").append_pair("scope","https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/userinfo.email")
        .append_pair("state",state).append_pair("code_challenge",challenge).append_pair("code_challenge_method","S256").append_pair("access_type","offline").append_pair("prompt","consent");
    url.to_string()
}
pub struct CalendarOAuthClient {
    transport: Transport,
    clock: Clock,
}
impl CalendarOAuthClient {
    pub fn new(transport: Transport) -> Self {
        Self {
            transport,
            clock: default_clock(),
        }
    }
    pub fn with_clock(transport: Transport, clock: Clock) -> Self {
        Self { transport, clock }
    }
    async fn token_request(
        &self,
        body: &[(&str, &str)],
        fallback_refresh: Option<&str>,
    ) -> Result<Value, String> {
        let encoded = {
            let mut serializer = url::form_urlencoded::Serializer::new(String::new());
            for (key, value) in body {
                serializer.append_pair(key, value);
            }
            serializer.finish()
        };
        let response = (self.transport)(Request {
            url: TOKEN_URL.into(),
            method: "POST".into(),
            headers: json!({"Content-Type":"application/x-www-form-urlencoded"})
                .as_object()
                .unwrap()
                .clone(),
            body: Some(encoded),
        })
        .await?;
        let data = response.data.unwrap_or_else(|_| json!({}));
        if data.is_null() {
            return Err("Invalid provider response shape".into());
        }
        if !(200..300).contains(&response.status) {
            let detail = nullish(
                field(&data, "error_description")
                    .filter(|v| !v.is_null())
                    .or_else(|| field(&data, "error")),
                json!(format!("HTTP {}", response.status)),
            );
            return Err(format!(
                "Calendar OAuth token request failed: {}",
                js_text(&detail)
            ));
        }
        let expires_in = data["expires_in"].as_f64().unwrap_or(3600.0);
        let refresh = data["refresh_token"].as_str().or(fallback_refresh);
        let mut result = json!({"accessToken":js_text(&nullish(field(&data,"access_token"),json!(""))),
            "refreshToken":refresh,"expiresAt":(self.clock)()as f64+expires_in*1000.0});
        if let Some(scope) = data["scope"].as_str() {
            result["scope"] = json!(scope);
        }
        Ok(result)
    }
    pub async fn exchange_code(
        &self,
        credentials: &CalendarOAuthCredentials,
        redirect: &str,
        code: &str,
        verifier: &str,
    ) -> Result<Value, String> {
        self.token_request(
            &[
                ("client_id", &credentials.client_id),
                ("client_secret", &credentials.client_secret),
                ("code", code),
                ("redirect_uri", redirect),
                ("grant_type", "authorization_code"),
                ("code_verifier", verifier),
            ],
            None,
        )
        .await
    }
    pub async fn refresh_tokens(
        &self,
        credentials: &CalendarOAuthCredentials,
        refresh: &str,
    ) -> Result<Value, String> {
        self.token_request(
            &[
                ("client_id", &credentials.client_id),
                ("client_secret", &credentials.client_secret),
                ("refresh_token", refresh),
                ("grant_type", "refresh_token"),
            ],
            Some(refresh),
        )
        .await
    }
}
