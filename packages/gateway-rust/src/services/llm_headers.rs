//! Per-configuration conversation identity for LLM request routing and cache continuity.
use serde::Deserialize;
use std::{collections::BTreeMap, sync::OnceLock};
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmRequestConfig {
    pub openai_api_key: String,
    pub openai_base_url: String,
    pub backend: Option<String>,
    pub session_id: Option<String>,
    #[serde(skip)]
    generated_session: OnceLock<String>,
}
impl LlmRequestConfig {
    pub fn headers(&self, session: Option<&str>) -> BTreeMap<String, String> {
        let mut headers = BTreeMap::from([
            ("Content-Type".into(), "application/json".into()),
            (
                "Authorization".into(),
                format!("Bearer {}", self.openai_api_key),
            ),
        ]);
        let go = self.backend.as_deref() == Some("opencode-go")
            || url::Url::parse(&self.openai_base_url).is_ok_and(|url| {
                url.host_str() == Some("opencode.ai") && url.path().starts_with("/zen/go/")
            });
        if go {
            let session = session
                .filter(|v| !v.is_empty())
                .or_else(|| self.session_id.as_deref().filter(|v| !v.is_empty()))
                .unwrap_or_else(|| {
                    self.generated_session
                        .get_or_init(|| uuid::Uuid::new_v4().to_string())
                });
            headers.insert("User-Agent".into(), "jait/1.0".into());
            headers.insert("x-opencode-session".into(), session.into());
        }
        headers
    }
}
