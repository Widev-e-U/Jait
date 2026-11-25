//! Outbound connection probes behind the Settings "Test connection" buttons.
//!
//! `POST /api/providers/omniroute/test` and `POST /api/providers/backend/test` run from the gateway
//! on purpose: the browser may sit on another host, so a client-side fetch would test the wrong
//! network path. Each probe asks an endpoint for its model catalogue and reports reachability,
//! latency and a sample of model ids. An unhealthy endpoint is data (`ok: false` plus the reason),
//! never an error status, because the settings page renders `error` verbatim. The route has already
//! refused every URL that is not http(s) without credentials.
//!
//! Not ported here: the Ollama Cloud usage verification (`verify_ollama_*`), which keeps failing
//! closed through the trait defaults.

use std::{
    error::Error as _,
    time::{Duration, Instant},
};

use futures_util::future::BoxFuture;
use serde_json::{Value, json};

use crate::{
    execution::process_runner::ProcessCancellation,
    routes::providers::{BackendProbe, ProviderProbes},
    services::{
        jait_llm::{ResolvedJaitLlmConfig, call_jait_llm_completion},
        jait_models::JaitBackend,
    },
};

/// `OMNIROUTE_PROBE_TIMEOUT_MS`.
const PROBE_TIMEOUT: Duration = Duration::from_secs(8);
/// A model catalogue is a few hundred KiB at most; anything larger is not one.
const MAX_CATALOGUE_BYTES: usize = 8 * 1024 * 1024;
/// Redirects are followed like `fetch` does; the client drops `Authorization` across hosts.
const MAX_REDIRECTS: usize = 5;
/// OpenCode Go's catalogue is public, so only a real completion proves the subscription key.
const GO_PROBE_PROMPT: &str =
    "This is a coding-agent connection test. Reply with OK only, without analysis.";
const GO_PROBE_MODEL: &str = "glm-5.2";

/// Which settings control asked, because the page words each failure for its own endpoint.
#[derive(Clone, Copy)]
enum Target {
    Router,
    Backend,
}

impl Target {
    fn unreachable_text(self, detail: Option<&str>) -> String {
        let detail = detail.map(|code| format!(" ({code})")).unwrap_or_default();
        match self {
            Self::Router => {
                format!("Could not reach the router — start it, or correct the base URL.{detail}")
            }
            Self::Backend => format!("Could not reach the service.{detail}"),
        }
    }

    fn timeout_text(self, timeout: Duration) -> String {
        let seconds = timeout.as_secs_f64();
        let seconds = if seconds.fract() == 0.0 {
            format!("{}", timeout.as_secs())
        } else {
            format!("{seconds}")
        };
        let what = match self {
            Self::Router => "router",
            Self::Backend => "service",
        };
        format!(
            "No response within {seconds}s. Is the {what} running and reachable from the gateway?"
        )
    }

    fn status_text(self, status: u16, models_url: &str) -> String {
        match (self, status) {
            (Self::Router, 401) => "The router answered 401 — the configured OMNIROUTE_API_KEY was rejected. Clear it to use the keyless free tier.".into(),
            (Self::Router, _) => format!("The router answered HTTP {status}."),
            (Self::Backend, 401 | 403) => {
                "The endpoint answered with an auth error — the API key was rejected or missing."
                    .into()
            }
            (Self::Backend, 404) => format!(
                "The endpoint answered HTTP 404 for {models_url} — no model catalogue there. Self-hosted OpenAI-compatible servers (vLLM, llama.cpp, LM Studio) usually serve it under /v1."
            ),
            (Self::Backend, _) => format!("The endpoint answered HTTP {status}."),
        }
    }
}

enum BodyFault {
    Transport(reqwest::Error),
    Invalid,
    TooLarge,
}

/// `data.map((entry) => entry[key]).filter(Boolean)` over a possibly missing array.
fn names(list: &Value, key: &str) -> Vec<String> {
    list.as_array()
        .into_iter()
        .flatten()
        .filter_map(|entry| entry[key].as_str())
        .filter(|name| !name.is_empty())
        .map(str::to_owned)
        .collect()
}

/// Node reports `error.cause.code`; the closest stable names for the same failures.
fn transport_code(error: &reqwest::Error) -> Option<&'static str> {
    let mut source = error.source();
    while let Some(cause) = source {
        if let Some(io) = cause.downcast_ref::<std::io::Error>() {
            match io.kind() {
                std::io::ErrorKind::ConnectionRefused => return Some("ECONNREFUSED"),
                std::io::ErrorKind::ConnectionReset => return Some("ECONNRESET"),
                std::io::ErrorKind::TimedOut => return Some("ETIMEDOUT"),
                _ => {}
            }
        }
        if cause.to_string().contains("dns error") {
            return Some("ENOTFOUND");
        }
        source = cause.source();
    }
    None
}

async fn read_json(mut response: reqwest::Response) -> Result<Value, BodyFault> {
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(BodyFault::Transport)? {
        if bytes.len() + chunk.len() > MAX_CATALOGUE_BYTES {
            return Err(BodyFault::TooLarge);
        }
        bytes.extend_from_slice(&chunk);
    }
    serde_json::from_slice(&bytes).map_err(|_| BodyFault::Invalid)
}

fn elapsed_ms(started: Instant) -> u64 {
    u64::try_from(started.elapsed().as_millis()).unwrap_or(u64::MAX)
}

fn backend_failure(probe: &BackendProbe, started: Instant, error: String) -> Value {
    json!({
        "ok": false,
        "backend": probe.backend.as_str(),
        "baseUrl": probe.base_url,
        "latencyMs": elapsed_ms(started),
        "error": error,
    })
}

#[derive(Clone)]
pub struct HttpProviderProbes {
    client: reqwest::Client,
    timeout: Duration,
    omniroute_base_url: String,
    omniroute_api_key: String,
}

impl HttpProviderProbes {
    /// `config.omnirouteBaseUrl` / `config.omnirouteApiKey` come from the environment, as in `loadConfig()`.
    pub fn from_env() -> Result<Self, String> {
        let base_url = std::env::var("OMNIROUTE_BASE_URL")
            .ok()
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| JaitBackend::OmniRoute.default_base_url().to_owned());
        let api_key = std::env::var("OMNIROUTE_API_KEY").unwrap_or_default();
        Self::new(PROBE_TIMEOUT, base_url, api_key)
    }

    pub fn new(
        timeout: Duration,
        omniroute_base_url: String,
        omniroute_api_key: String,
    ) -> Result<Self, String> {
        let client = reqwest::Client::builder()
            .timeout(timeout)
            .connect_timeout(timeout)
            .redirect(reqwest::redirect::Policy::limited(MAX_REDIRECTS))
            .build()
            .map_err(|error| format!("Provider probe client failed to start: {error}"))?;
        Ok(Self {
            client,
            timeout,
            omniroute_base_url,
            omniroute_api_key,
        })
    }

    fn fault(&self, target: Target, error: &reqwest::Error) -> String {
        if error.is_timeout() {
            return target.timeout_text(self.timeout);
        }
        target.unreachable_text(transport_code(error))
    }

    /// GET `{base_url}{path}` and return the JSON body, or the settings-page wording of why not.
    async fn catalogue(
        &self,
        target: Target,
        base_url: &str,
        path: &str,
        api_key: &str,
    ) -> Result<Value, String> {
        // The route validated the URL; a failure here still must not become a request.
        let parsed = url::Url::parse(base_url).map_err(|_| target.unreachable_text(None))?;
        let models_url = format!("{}{path}", parsed.as_str().trim_end_matches('/'));
        let mut request = self.client.get(&models_url);
        if !api_key.is_empty() {
            request = request.bearer_auth(api_key);
        }
        let response = request
            .send()
            .await
            .map_err(|error| self.fault(target, &error))?;
        let status = response.status();
        if !status.is_success() {
            return Err(target.status_text(status.as_u16(), &models_url));
        }
        read_json(response).await.map_err(|fault| match fault {
            BodyFault::Transport(error) => self.fault(target, &error),
            BodyFault::Invalid => target.unreachable_text(Some("invalid JSON response")),
            BodyFault::TooLarge => target.unreachable_text(Some("response too large")),
        })
    }

    async fn omniroute(&self, base_url: String, api_key: String) -> Value {
        let started = Instant::now();
        match self
            .catalogue(Target::Router, &base_url, "/models", &api_key)
            .await
        {
            Ok(data) => {
                let ids = names(&data["data"], "id");
                json!({
                    "ok": true,
                    "baseUrl": base_url,
                    "latencyMs": elapsed_ms(started),
                    "modelCount": ids.len(),
                    "sampleModels": ids.iter().take(3).collect::<Vec<_>>(),
                    "authenticated": !api_key.is_empty(),
                })
            }
            Err(error) => json!({
                "ok": false,
                "baseUrl": base_url,
                "latencyMs": elapsed_ms(started),
                "error": error,
            }),
        }
    }

    async fn backend(&self, probe: BackendProbe) -> Value {
        let started = Instant::now();
        let ollama = probe.backend == JaitBackend::Ollama;
        // Ollama exposes its catalogue at /api/tags, not the OpenAI /models path.
        let (path, list, key) = if ollama {
            ("/api/tags", "models", "name")
        } else {
            ("/models", "data", "id")
        };
        let data = match self
            .catalogue(Target::Backend, &probe.base_url, path, &probe.api_key)
            .await
        {
            Ok(data) => data,
            Err(error) => return backend_failure(&probe, started, error),
        };
        let ids = names(&data[list], key);
        if probe.backend == JaitBackend::OpenCodeGo
            && let Some(refusal) = self.verify_go_inference(&probe, &ids).await
        {
            return refusal.into_body(&probe, started);
        }
        let mut body = json!({
            "ok": true,
            "backend": probe.backend.as_str(),
            "baseUrl": probe.base_url,
            "latencyMs": elapsed_ms(started),
            "modelCount": ids.len(),
            "sampleModels": ids.iter().take(3).collect::<Vec<_>>(),
            "authenticated": !probe.api_key.is_empty(),
        });
        if !probe.model.is_empty() {
            body["modelPresent"] = json!(ids.contains(&probe.model));
        }
        body
    }

    /// `None` when the Go subscription answered a real completion; otherwise why it did not.
    async fn verify_go_inference(&self, probe: &BackendProbe, ids: &[String]) -> Option<Refusal> {
        let model = if !probe.model.is_empty() {
            probe.model.clone()
        } else if ids.iter().any(|id| id == GO_PROBE_MODEL) {
            GO_PROBE_MODEL.to_owned()
        } else if let Some(first) = ids.first() {
            first.clone()
        } else {
            return Some(Refusal::Plain("OpenCode Go returned no models.".into()));
        };
        if !probe.model.is_empty() && !ids.contains(&probe.model) {
            return Some(Refusal::Plain(format!(
                "OpenCode Go does not offer model \"{}\".",
                probe.model
            )));
        }
        let llm = ResolvedJaitLlmConfig {
            backend: JaitBackend::OpenCodeGo,
            openai_api_key: probe.api_key.clone(),
            openai_base_url: probe.base_url.clone(),
            openai_model: model,
            context_window: 128_000.0,
            num_ctx: None,
        };
        let messages = vec![json!({"role": "user", "content": GO_PROBE_PROMPT})];
        let session = uuid::Uuid::new_v4().to_string();
        let attempt = tokio::time::timeout(
            self.timeout,
            call_jait_llm_completion(
                &llm,
                messages,
                Some(512),
                None,
                &session,
                &ProcessCancellation::default(),
            ),
        )
        .await;
        match attempt {
            Ok(Ok(_)) => None,
            Ok(Err(message)) => Some(Refusal::Unreachable(
                Target::Backend.unreachable_text(Some(message.trim_end_matches(['.', '?', '!']))),
            )),
            Err(_) => Some(Refusal::Unreachable(
                Target::Backend.timeout_text(self.timeout),
            )),
        }
    }
}

/// A Go check that failed after the catalogue loaded.
enum Refusal {
    /// The reference answers these with only `{ ok, error }`.
    Plain(String),
    /// A transport-style failure, reported with the backend identity like any other.
    Unreachable(String),
}

impl Refusal {
    fn into_body(self, probe: &BackendProbe, started: Instant) -> Value {
        match self {
            Self::Plain(error) => json!({ "ok": false, "error": error }),
            Self::Unreachable(error) => backend_failure(probe, started, error),
        }
    }
}

impl ProviderProbes for HttpProviderProbes {
    /// Ollama Cloud usage verification is not ported, so a session is never accepted.
    fn verify_ollama_session(&self, _session: &str) -> BoxFuture<'static, Result<(), String>> {
        Box::pin(async {
            Err("Could not verify this session. Your saved session has not changed.".into())
        })
    }

    fn omniroute_defaults(&self) -> (String, String) {
        (
            self.omniroute_base_url.clone(),
            self.omniroute_api_key.clone(),
        )
    }

    fn probe_omniroute(
        &self,
        base_url: &str,
        api_key: &str,
    ) -> BoxFuture<'static, Result<Value, String>> {
        let probes = self.clone();
        let (base_url, api_key) = (base_url.to_owned(), api_key.to_owned());
        Box::pin(async move { Ok(probes.omniroute(base_url, api_key).await) })
    }

    fn probe_backend(&self, probe: BackendProbe) -> BoxFuture<'static, Result<Value, String>> {
        let probes = self.clone();
        Box::pin(async move { Ok(probes.backend(probe).await) })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // The mock-endpoint tests live in `tests/provider_probes.rs`: they drive the public trait
    // against local servers, and keeping their `.route(...)` fixtures out of `src/` keeps them
    // out of the route inventory.

    #[test]
    fn omniroute_defaults_are_the_configured_endpoint() {
        let probes = HttpProviderProbes::new(
            Duration::from_secs(1),
            "http://router.internal:20128/v1".into(),
            "configured-key".into(),
        )
        .unwrap();
        assert_eq!(
            probes.omniroute_defaults(),
            (
                "http://router.internal:20128/v1".to_owned(),
                "configured-key".to_owned()
            )
        );
    }

    #[test]
    fn timeouts_read_naturally() {
        assert_eq!(
            Target::Router.timeout_text(Duration::from_secs(8)),
            "No response within 8s. Is the router running and reachable from the gateway?"
        );
        assert_eq!(
            Target::Backend.timeout_text(Duration::from_millis(200)),
            "No response within 0.2s. Is the service running and reachable from the gateway?"
        );
    }

    #[test]
    fn failures_are_worded_for_the_endpoint_that_was_asked() {
        assert_eq!(
            Target::Router.status_text(500, "http://x/models"),
            "The router answered HTTP 500."
        );
        assert_eq!(
            Target::Backend.status_text(500, "http://x/models"),
            "The endpoint answered HTTP 500."
        );
        assert_eq!(
            Target::Backend.unreachable_text(None),
            "Could not reach the service."
        );
        assert_eq!(
            Target::Router.unreachable_text(Some("ECONNREFUSED")),
            "Could not reach the router — start it, or correct the base URL. (ECONNREFUSED)"
        );
    }

    #[test]
    fn a_catalogue_lists_only_named_entries() {
        let list = json!([{"id": "a"}, {"id": ""}, {"name": "no id"}, {"id": 3}, {"id": "b"}]);
        assert_eq!(names(&list, "id"), ["a", "b"]);
        assert!(names(&json!(null), "id").is_empty());
    }
}
