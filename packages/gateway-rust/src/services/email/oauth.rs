//! Gmail/Outlook OAuth flows; token shape differences from calendar are preserved.
pub use crate::services::calendar::oauth::CalendarOAuthCredentials as OAuthClientCredentials;
use crate::{
    services::calendar::{
        Request, Transport, field, js_text, nullish,
        oauth::{calendar_pkce_from_entropy, create_calendar_pkce},
    },
    text::js_trim,
    time::{Clock, default_clock},
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::HashMap;
#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EmailProvider {
    Gmail,
    Outlook,
}
impl EmailProvider {
    fn token_url(self) -> &'static str {
        match self {
            Self::Gmail => "https://oauth2.googleapis.com/token",
            Self::Outlook => "https://login.microsoftonline.com/common/oauth2/v2.0/token",
        }
    }
}
pub fn credentials_from_env(
    provider: EmailProvider,
    env: &HashMap<String, String>,
) -> Option<OAuthClientCredentials> {
    let prefix = match provider {
        EmailProvider::Gmail => "GMAIL",
        EmailProvider::Outlook => "OUTLOOK",
    };
    let read = |suffix| {
        env.get(&format!("{prefix}_OAUTH_{suffix}"))
            .map(|s| js_trim(s))
            .filter(|s| !s.is_empty())
            .map(String::from)
    };
    Some(OAuthClientCredentials {
        client_id: read("CLIENT_ID")?,
        client_secret: read("CLIENT_SECRET")?,
    })
}
pub fn env_client_credentials(provider: EmailProvider) -> Option<OAuthClientCredentials> {
    credentials_from_env(provider, &std::env::vars().collect())
}
pub fn create_pkce() -> Result<Value, String> {
    create_calendar_pkce()
}
pub fn pkce_from_entropy(entropy: [u8; 32]) -> Value {
    calendar_pkce_from_entropy(entropy)
}
pub fn build_authorize_url(
    provider: EmailProvider,
    credentials: &OAuthClientCredentials,
    redirect: &str,
    state: &str,
    challenge: &str,
) -> String {
    let (base, scope, extras) = match provider {
        EmailProvider::Gmail => (
            "https://accounts.google.com/o/oauth2/v2/auth",
            "https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.send",
            [
                ("access_type", "offline"),
                ("prompt", "consent select_account"),
            ],
        ),
        EmailProvider::Outlook => (
            "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
            "offline_access https://graph.microsoft.com/Mail.ReadWrite https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/User.Read",
            [("response_mode", "query"), ("prompt", "select_account")],
        ),
    };
    let mut url = url::Url::parse(base).expect("constant URL");
    {
        let mut query = url.query_pairs_mut();
        query
            .append_pair("client_id", &credentials.client_id)
            .append_pair("redirect_uri", redirect)
            .append_pair("response_type", "code")
            .append_pair("scope", scope)
            .append_pair("state", state)
            .append_pair("code_challenge", challenge)
            .append_pair("code_challenge_method", "S256");
        for (key, value) in extras {
            query.append_pair(key, value);
        }
    }
    url.to_string()
}
pub struct EmailOAuthClient {
    transport: Transport,
    clock: Clock,
}
impl EmailOAuthClient {
    pub fn new(transport: Transport) -> Self {
        Self {
            transport,
            clock: default_clock(),
        }
    }
    pub fn with_clock(transport: Transport, clock: Clock) -> Self {
        Self { transport, clock }
    }
    async fn post_token(
        &self,
        provider: EmailProvider,
        body: &[(&str, &str)],
        fallback: Option<&str>,
    ) -> Result<Value, String> {
        let encoded = {
            let mut serializer = url::form_urlencoded::Serializer::new(String::new());
            for (key, value) in body {
                serializer.append_pair(key, value);
            }
            serializer.finish()
        };
        let response = (self.transport)(Request {
            url: provider.token_url().into(),
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
            return Err(format!("OAuth token request failed: {}", js_text(&detail)));
        }
        let expiry = data["expires_in"].as_f64().unwrap_or(3600.0);
        let refresh = nullish(
            field(&data, "refresh_token"),
            fallback.map(|s| json!(s)).unwrap_or(Value::Null),
        );
        let mut result = json!({"accessToken":js_text(&nullish(field(&data,"access_token"),json!(""))),"refreshToken":refresh,"expiresAt":(self.clock)()as f64+expiry*1000.0});
        if let Some(scope) = field(&data, "scope") {
            result["scope"] = scope.clone();
        }
        Ok(result)
    }
    pub async fn exchange_code(
        &self,
        provider: EmailProvider,
        credentials: &OAuthClientCredentials,
        redirect: &str,
        code: &str,
        verifier: &str,
    ) -> Result<Value, String> {
        self.post_token(
            provider,
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
        provider: EmailProvider,
        credentials: &OAuthClientCredentials,
        refresh: &str,
    ) -> Result<Value, String> {
        self.post_token(
            provider,
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
