//! Authenticated backend resolution and bounded one-shot completion. No automatic retries.
use super::jait_models::{JaitBackend, decode_jait_model_id, parse_jait_backend_instances};
use super::llm_headers::LlmRequestConfig;
use super::opencode_go_fetch::{Protocol, completion, go_protocol, go_request};
use crate::{execution::process_runner::ProcessCancellation, text::js_trim};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{collections::HashMap, time::Duration};

#[derive(Clone, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct JaitLlmConfig {
    pub openai_api_key: String,
    pub openai_base_url: String,
    pub openai_model: String,
    pub ollama_url: String,
    pub ollama_model: String,
    pub ollama_context_window: f64,
    pub omniroute_base_url: String,
    pub omniroute_api_key: String,
}
impl Default for JaitLlmConfig {
    fn default() -> Self {
        Self {
            openai_api_key: String::new(),
            openai_base_url: "https://api.openai.com/v1".into(),
            openai_model: "gpt-4o".into(),
            ollama_url: "http://localhost:11434".into(),
            ollama_model: "llama3".into(),
            ollama_context_window: 8192.,
            omniroute_base_url: "http://localhost:20128/v1".into(),
            omniroute_api_key: String::new(),
        }
    }
}
// Deliberately no Debug: this object contains an API key.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedJaitLlmConfig {
    pub backend: JaitBackend,
    #[serde(skip_serializing)]
    pub openai_api_key: String,
    pub openai_base_url: String,
    pub openai_model: String,
    pub context_window: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub num_ctx: Option<f64>,
}
pub struct ResolveJaitLlmOptions<'a> {
    pub config: &'a JaitLlmConfig,
    pub api_keys: &'a HashMap<String, String>,
    pub requested_model: Option<&'a str>,
    pub jait_backend: Option<JaitBackend>,
    pub strict_model: bool,
}
fn first<'a>(values: &[Option<&'a str>]) -> &'a str {
    values
        .iter()
        .flatten()
        .copied()
        .find(|v| !v.is_empty())
        .unwrap_or("")
}
pub fn normalize_openrouter_model_id(model: &str) -> String {
    let trimmed = js_trim(model);
    let key = trimmed
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase();
    match key.as_str() {
        "gpt-4o" => "openai/gpt-4o".into(),
        "gpt-4o-mini" => "openai/gpt-4o-mini".into(),
        "gpt-4.1" => "openai/gpt-4.1".into(),
        "gpt-4.1-mini" => "openai/gpt-4.1-mini".into(),
        "gpt-4.1-nano" => "openai/gpt-4.1-nano".into(),
        "o4-mini" => "openai/o4-mini".into(),
        "o3" => "openai/o3".into(),
        "o3-mini" => "openai/o3-mini".into(),
        "deepseek-chat" => "deepseek/deepseek-chat-v3-0324".into(),
        "deepseek-reasoner" => "deepseek/deepseek-r1".into(),
        "mimo v2 pro" => "xiaomi/mimo-v2-pro".into(),
        "mimo-v2-pro" => "xiaomi/mimo-v2-pro".into(),
        "xiaomi mimo v2 pro" => "xiaomi/mimo-v2-pro".into(),
        "xiaomi: mimo-v2-pro" => "xiaomi/mimo-v2-pro".into(),
        "xiaomi/mimo-v2-pro" => "xiaomi/mimo-v2-pro".into(),
        "mimo v3 pro" => "xiaomi/mimo-v2-pro".into(),
        "mimo-v3-pro" => "xiaomi/mimo-v2-pro".into(),
        "xiaomi mimo v3 pro" => "xiaomi/mimo-v2-pro".into(),
        "xiaomi/mimo-v3-pro" => "xiaomi/mimo-v2-pro".into(),
        "hunter-alpha" => "xiaomi/mimo-v2-pro".into(),
        "mimo v2 flash" => "xiaomi/mimo-v2-flash".into(),
        "mimo-v2-flash" => "xiaomi/mimo-v2-flash".into(),
        "xiaomi mimo v2 flash" => "xiaomi/mimo-v2-flash".into(),
        "xiaomi: mimo-v2-flash" => "xiaomi/mimo-v2-flash".into(),
        "xiaomi/mimo-v2-flash" => "xiaomi/mimo-v2-flash".into(),
        "mimo v2 omni" => "xiaomi/mimo-v2-omni".into(),
        "mimo-v2-omni" => "xiaomi/mimo-v2-omni".into(),
        "xiaomi mimo v2 omni" => "xiaomi/mimo-v2-omni".into(),
        "xiaomi: mimo-v2-omni" => "xiaomi/mimo-v2-omni".into(),
        "xiaomi/mimo-v2-omni" => "xiaomi/mimo-v2-omni".into(),
        _ => trimmed.into(),
    }
}
pub fn infer_context_window(model: &str) -> f64 {
    let m = model.to_lowercase();
    if m == "auto" || m.starts_with("auto/") {
        128000.
    } else if m.contains("gpt-5") {
        400000.
    } else if m.contains("gpt-4o") || m.contains("gpt-4.1") || m.contains("gpt-4-turbo") {
        128000.
    } else if m.contains("gpt-4") {
        8192.
    } else if m.contains("gpt-3.5") {
        16385.
    } else if m.contains("claude-3") || m.contains("claude-4") {
        200000.
    } else if m.contains("claude") {
        100000.
    } else if m.contains("gemini") {
        128000.
    } else if ["o1", "o3", "o4"].iter().any(|s| m.contains(s)) {
        200000.
    } else if m.contains("deepseek") {
        64000.
    } else if m.contains("mistral") || m.contains("mixtral") {
        32000.
    } else if m.contains("llama") {
        8192.
    } else {
        128000.
    }
}
// Match parseInt(value, 10): consume an optional sign and the initial digits.
fn parse_context_integer(value: &str) -> Option<f64> {
    let value = js_trim(value);
    let sign = usize::from(value.starts_with(['+', '-']));
    let digits = value[sign..].bytes().take_while(u8::is_ascii_digit).count();
    if digits == 0 {
        return None;
    }
    value[..sign + digits]
        .parse::<f64>()
        .ok()
        .filter(|n| n.is_finite())
}
pub fn resolve_jait_llm_config(
    o: ResolveJaitLlmOptions<'_>,
) -> Result<ResolvedJaitLlmConfig, String> {
    let c = o.config;
    let key = |k: &str| o.api_keys.get(k).map(|v| js_trim(v));
    let requested = o.requested_model.map(js_trim).unwrap_or("");
    let routed = decode_jait_model_id(requested);
    let instances = parse_jait_backend_instances(key("JAIT_BACKEND_INSTANCES"));
    let instance = routed.as_ref().and_then(|r| {
        instances
            .iter()
            .find(|i| i.id == r.instance_id && i.backend == r.backend)
    });
    if let Some(r) = &routed
        && instance.is_none()
    {
        return Err(format!(
            "Jait backend instance \"{}\" is no longer configured. Pick a model from an available backend instance.",
            r.instance_id
        ));
    }
    let explicit = first(&[
        routed.as_ref().map(|r| r.model.as_str()),
        instance.and_then(|i| i.model.as_deref()),
        Some(requested),
    ]);
    if o.strict_model && explicit.is_empty() {
        return Err("No model is selected for this turn. Pick a model in the provider selector and send again — Jait will not fall back to a backend default model.".into());
    }
    let backend = routed
        .as_ref()
        .map(|r| r.backend)
        .or(o.jait_backend)
        .unwrap_or(JaitBackend::OpenAi);
    let model = first(&[Some(explicit), key("OPENAI_MODEL"), Some(&c.openai_model)]);
    if ["default", "fable", "sonnet", "opus", "haiku", "opusplan"]
        .contains(&model.to_lowercase().as_str())
    {
        return Err(format!(
            "Model \"{model}\" is a Claude Code CLI alias and only resolves inside the Claude Code app — it can't be used for sub-agent/swarm delegation, which calls models over HTTP. Pick a concrete API model (not a CLI provider) for swarm work, or run this task without swarm mode."
        ));
    }
    let base = instance.map(|i| i.base_url.as_str());
    let secret = instance.and_then(|i| i.api_key.as_deref());
    let make = |url: &str, api: &str, model: &str, ctx: Option<f64>| ResolvedJaitLlmConfig {
        backend,
        openai_api_key: api.into(),
        openai_base_url: url.into(),
        openai_model: model.into(),
        context_window: ctx.unwrap_or_else(|| infer_context_window(model)),
        num_ctx: ctx,
    };
    if backend == JaitBackend::Ollama {
        let url = first(&[
            base,
            key("OLLAMA_URL"),
            Some(&c.ollama_url),
            Some("http://localhost:11434"),
        ]);
        let model = first(&[
            Some(explicit),
            key("OLLAMA_MODEL"),
            Some(&c.ollama_model),
            Some("llama3"),
        ]);
        let raw = first(&[key("OLLAMA_NUM_CTX"), key("OLLAMA_CONTEXT_LENGTH")]);
        let ctx = instance
            .and_then(|i| i.num_ctx)
            .or_else(|| parse_context_integer(raw).filter(|v| *v != 0.))
            .unwrap_or(c.ollama_context_window);
        return Ok(make(
            &format!("{}/v1", url.trim_end_matches('/')),
            first(&[secret, Some("ollama")]),
            model,
            Some(ctx),
        ));
    }
    if backend == JaitBackend::OmniRoute {
        return Ok(make(
            first(&[
                base,
                key("OMNIROUTE_BASE_URL"),
                Some(&c.omniroute_base_url),
                Some("http://localhost:20128/v1"),
            ])
            .trim_end_matches('/'),
            first(&[
                secret,
                key("OMNIROUTE_API_KEY"),
                Some(&c.omniroute_api_key),
                Some("omniroute"),
            ]),
            first(&[Some(explicit), key("OMNIROUTE_MODEL"), Some("auto")]),
            None,
        ));
    }
    let route = match backend {
        JaitBackend::OpenCodeGo => Some((
            "OPENCODE_GO_API_KEY",
            "OPENCODE_GO_BASE_URL",
            "https://opencode.ai/zen/go/v1",
        )),
        JaitBackend::Gemini => Some((
            "GEMINI_API_KEY",
            "GEMINI_BASE_URL",
            "https://generativelanguage.googleapis.com/v1beta/openai",
        )),
        JaitBackend::Anthropic => Some((
            "ANTHROPIC_API_KEY",
            "ANTHROPIC_BASE_URL",
            "https://api.anthropic.com/v1",
        )),
        JaitBackend::Grok => Some(("XAI_API_KEY", "XAI_BASE_URL", "https://api.x.ai/v1")),
        JaitBackend::Perplexity => Some((
            "PERPLEXITY_API_KEY",
            "PERPLEXITY_BASE_URL",
            "https://api.perplexity.ai",
        )),
        JaitBackend::Moonshot => Some((
            "MOONSHOT_API_KEY",
            "MOONSHOT_BASE_URL",
            "https://api.moonshot.ai/v1",
        )),
        JaitBackend::Kimi => Some((
            "MOONSHOT_API_KEY",
            "KIMI_BASE_URL",
            "https://api.moonshot.ai/v1",
        )),
        _ => None,
    };
    if let Some((api, url, default)) = route {
        let api = first(&[secret, key(api)]);
        if backend == JaitBackend::OpenCodeGo && api.is_empty() {
            return Err(
                "OpenCode Go needs an API key. Add it to the Go backend in Settings → API.".into(),
            );
        }
        return Ok(make(
            first(&[base, key(url), Some(default)]).trim_end_matches('/'),
            api,
            first(&[
                Some(explicit),
                key("OPENAI_MODEL"),
                Some(if backend == JaitBackend::OpenCodeGo {
                    "glm-5.2"
                } else {
                    &c.openai_model
                }),
            ]),
            None,
        ));
    }
    let url = first(&[base, key("OPENAI_BASE_URL"), Some(&c.openai_base_url)]);
    let router_key = first(&[secret, key("OPENROUTER_API_KEY")]);
    let router = backend == JaitBackend::OpenRouter
        || (instance.is_none() && model.contains('/'))
        || url.to_lowercase().contains("openrouter.ai");
    if backend == JaitBackend::OpenRouter && router_key.is_empty() {
        return Err(if instance.is_some() {
            "An API key is required for the selected OpenRouter backend instance"
        } else {
            "OPENROUTER_API_KEY is required when the Jait backend provider is set to OpenRouter"
        }
        .into());
    }
    let api = if backend == JaitBackend::OpenAi && secret.is_some_and(|s| !s.is_empty()) {
        secret.unwrap()
    } else if router && !router_key.is_empty() {
        router_key
    } else {
        first(&[key("OPENAI_API_KEY"), Some(&c.openai_api_key)])
    };
    let effective = if router {
        normalize_openrouter_model_id(model)
    } else {
        model.into()
    };
    Ok(make(
        if instance.is_some() {
            url.trim_end_matches('/')
        } else if router && !router_key.is_empty() {
            "https://openrouter.ai/api/v1"
        } else {
            url
        },
        api,
        &effective,
        None,
    ))
}

pub fn completion_text(data: &Value, model: &str) -> Result<String, String> {
    let choice = &data["choices"][0];
    let message = &choice["message"];
    let text: String = if let Some(s) = message["content"].as_str() {
        s.into()
    } else {
        message["content"]
            .as_array()
            .map(|a| {
                a.iter()
                    .filter(|p| p["type"] == "text")
                    .filter_map(|p| p["text"].as_str())
                    .collect::<String>()
            })
            .unwrap_or_default()
    };
    if !js_trim(&text).is_empty() {
        return Ok(js_trim(&text).into());
    }
    let reasoning = message
        .get("reasoning")
        .filter(|v| !v.is_null())
        .unwrap_or(&message["reasoning_content"]);
    if reasoning.as_str().is_some_and(|s| !js_trim(s).is_empty()) {
        return Err(if choice["finish_reason"] == "length" {
            format!(
                "LLM spent its whole token budget reasoning and returned no answer (finish_reason=length, model: {model}) — increase max_tokens"
            )
        } else {
            format!("LLM returned only reasoning and no answer content (model: {model})")
        });
    }
    Err(format!(
        "LLM returned no content (finish_reason: {}, model: {model})",
        choice["finish_reason"].as_str().unwrap_or("unknown")
    ))
}
/// Only server-resolved configuration may reach this effect boundary.
pub async fn call_jait_llm_completion(
    llm: &ResolvedJaitLlmConfig,
    messages: Vec<Value>,
    max_tokens: Option<u32>,
    temperature: Option<f64>,
    session_id: &str,
    cancel: &ProcessCancellation,
) -> Result<String, String> {
    let url =
        url::Url::parse(&llm.openai_base_url).map_err(|_| "Invalid configured model endpoint")?;
    if !matches!(url.scheme(), "http" | "https")
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err("Invalid configured model endpoint".into());
    }
    let config:LlmRequestConfig=serde_json::from_value(json!({"backend":llm.backend,"openaiApiKey":llm.openai_api_key,"openaiBaseUrl":llm.openai_base_url})).map_err(|_|"Invalid LLM configuration")?;
    let protocol = if llm.backend == JaitBackend::OpenCodeGo
        || (url.host_str() == Some("opencode.ai") && url.path().starts_with("/zen/go/"))
    {
        go_protocol(&llm.openai_model)
    } else {
        Protocol::ChatCompletions
    };
    let body = json!({"model":llm.openai_model,"messages":messages,"max_tokens":max_tokens.unwrap_or(256),"temperature":temperature.unwrap_or(0.3),"stream":false});
    let body = go_request(&body, protocol).map_err(|_| "Invalid completion request")?;
    if serde_json::to_vec(&body)
        .map_err(|_| "Invalid completion request")?
        .len()
        > 2 * 1024 * 1024
    {
        return Err("LLM request exceeded byte limit".into());
    }
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(120))
        .connect_timeout(Duration::from_secs(10))
        .build()
        .map_err(|_| "LLM client initialization failed")?;
    let operation = async {
        let mut headers = config.headers(Some(session_id));
        if protocol == Protocol::Messages {
            headers.insert("x-api-key".into(), llm.openai_api_key.clone());
            headers.insert("anthropic-version".into(), "2023-06-01".into());
        }
        let request = headers
            .iter()
            .fold(
                client.post(format!(
                    "{}/{}",
                    llm.openai_base_url.trim_end_matches('/'),
                    protocol.path()
                )),
                |r, (k, v)| r.header(k, v),
            )
            .json(&body);
        let mut response = request
            .send()
            .await
            .map_err(|_| "LLM transport failed".to_string())?;
        let status = response.status();
        let mut bytes = Vec::new();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|_| "LLM response failed".to_string())?
        {
            if bytes.len() + chunk.len() > 2 * 1024 * 1024 {
                return Err("LLM response exceeded byte limit".into());
            }
            bytes.extend_from_slice(&chunk);
        }
        let data: Value = serde_json::from_slice(&bytes)
            .map_err(|_| format!("Invalid LLM response ({})", status.as_u16()))?;
        if !status.is_success() {
            return Err(format!("LLM request failed ({})", status.as_u16()));
        }
        let data = completion(&data, protocol).map_err(|_| "Invalid LLM completion".to_string())?;
        completion_text(&data, &llm.openai_model)
    };
    tokio::select! {biased; _=cancel.wait_cancelled()=>Err("LLM request cancelled".into()), result=operation=>result}
}

#[cfg(test)]
mod orchestration_tests {
    use super::*;
    #[tokio::test]
    async fn provider_orchestration_completion_cancels_body_and_go_headers() {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let (ready_tx, ready_rx) = tokio::sync::oneshot::channel();
        let server = tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut request = Vec::new();
            let mut bytes = [0; 1024];
            while !request.windows(4).any(|w| w == b"\r\n\r\n") {
                let count = socket.read(&mut bytes).await.unwrap();
                assert!(count > 0 && request.len() < 8192);
                request.extend_from_slice(&bytes[..count]);
            }
            let headers = String::from_utf8_lossy(&request).to_lowercase();
            assert!(headers.starts_with("post /v1/messages "));
            assert!(headers.contains("x-api-key: private-key"));
            assert!(headers.contains("anthropic-version: 2023-06-01"));
            socket
                .write_all(b"HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n1\r\n{\r\n")
                .await
                .unwrap();
            ready_tx.send(()).unwrap();
            // The client must close the incomplete response when cancelled.
            loop {
                match socket.read(&mut bytes).await {
                    Ok(0) | Err(_) => break,
                    Ok(_) => (),
                }
            }
        });
        struct AbortOnDrop(tokio::task::AbortHandle);
        impl Drop for AbortOnDrop {
            fn drop(&mut self) {
                self.0.abort();
            }
        }
        let _server_cleanup = AbortOnDrop(server.abort_handle());
        let llm = ResolvedJaitLlmConfig {
            backend: JaitBackend::OpenCodeGo,
            openai_api_key: "private-key".into(),
            openai_base_url: format!("http://{address}/v1"),
            openai_model: "claude-sonnet-4".into(),
            context_window: 200000.,
            num_ctx: None,
        };
        let cancel = ProcessCancellation::default();
        let call = call_jait_llm_completion(
            &llm,
            vec![json!({"role":"user","content":"hello"})],
            None,
            None,
            "session",
            &cancel,
        );
        tokio::pin!(call);
        tokio::time::timeout(Duration::from_secs(3), async {
            tokio::select! {
                result = &mut call => panic!("completion ended before cancellation: {result:?}"),
                ready = ready_rx => ready.unwrap(),
            }
            cancel.cancel();
            assert_eq!(call.await.unwrap_err(), "LLM request cancelled");
            server.await.unwrap();
        })
        .await
        .unwrap();
    }
    #[test]
    fn provider_orchestration_context_integer_and_secret_projection() {
        assert_eq!(parse_context_integer("  +8192tokens"), Some(8192.));
        assert_eq!(parse_context_integer("1-2"), Some(1.));
        assert_eq!(parse_context_integer("--2"), None);
        assert_eq!(parse_context_integer(""), None);
        let config = JaitLlmConfig {
            openai_api_key: "private-key".into(),
            ..Default::default()
        };
        let resolved = resolve_jait_llm_config(ResolveJaitLlmOptions {
            config: &config,
            api_keys: &HashMap::new(),
            requested_model: Some("gpt-4o"),
            jait_backend: None,
            strict_model: true,
        })
        .unwrap();
        assert!(
            !serde_json::to_string(&resolved)
                .unwrap()
                .contains("private-key")
        );
    }
}
