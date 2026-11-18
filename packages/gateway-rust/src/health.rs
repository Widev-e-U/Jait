use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::time::Instant;

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Provider {
    #[default]
    Ollama,
    Openai,
}

/// Only the non-secret configuration used by the existing health handler.
#[derive(Clone, Debug, Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct HealthConfig {
    pub llm_provider: Provider,
    pub openai_model: Option<String>,
    pub ollama_model: Option<String>,
    pub ollama_url: Option<String>,
}

/// Read model boundary for future repositories; standalone startup uses empty state.
#[derive(Clone, Debug, Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct HealthSnapshot {
    pub schema_version: u64,
    pub sessions: u64,
    pub surfaces: u64,
    pub devices: u64,
    pub user_count: u64,
}

#[derive(Clone, Debug)]
pub struct HealthState {
    pub config: Option<HealthConfig>,
    pub snapshot: HealthSnapshot,
    started_at: Instant,
}
impl HealthState {
    pub fn new(config: Option<HealthConfig>, snapshot: HealthSnapshot) -> Self {
        Self {
            config,
            snapshot,
            started_at: Instant::now(),
        }
    }
    pub fn response(&self) -> Value {
        let provider = self
            .config
            .as_ref()
            .map(|c| c.llm_provider)
            .unwrap_or_default();
        let mut response = json!({
            "version": crate::VERSION,
            "schemaVersion": self.snapshot.schema_version,
            "uptime": self.started_at.elapsed().as_secs(),
            "sessions": self.snapshot.sessions,
            "surfaces": self.snapshot.surfaces,
            "devices": self.snapshot.devices,
            "hasUsers": self.snapshot.user_count > 0,
            "healthy": true,
            "provider": provider,
            "ollamaUrl": if provider == Provider::Openai { None } else { self.config.as_ref().and_then(|c| c.ollama_url.as_ref()) },
        });
        // JSON.stringify omits an undefined openaiModel; other missing models are null.
        if provider == Provider::Openai {
            if let Some(model) = self.config.as_ref().and_then(|c| c.openai_model.as_ref()) {
                response["model"] = json!(model);
            }
        } else {
            response["model"] = json!(self.config.as_ref().and_then(|c| c.ollama_model.as_ref()));
        }
        response
    }
}
impl Default for HealthState {
    fn default() -> Self {
        Self::new(None, HealthSnapshot::default())
    }
}
