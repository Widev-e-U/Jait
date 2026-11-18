//! Native and differential coverage for `packages/gateway-rust/src/services/jait_models.rs`,
//! the port of `packages/gateway/src/services/jait-models.ts`.
//!
//! Two layers:
//!   * **Native** cases drive the port with a scripted [`ModelFetchers`] implementation and
//!     assert routing, ordering, decoration, error isolation and concurrency directly.
//!   * **Differential** cases send the same vectors through `internal_driver` to the real
//!     TypeScript service (`listJaitModels`, with only the `model-fetchers` boundary
//!     replaced by a scripted peer) plus the real `@jait/shared` helpers and the real
//!     `OPENROUTER_MODELS` catalogue, then require deep equality of ordered results and
//!     of the recorded fetch call log (source, args and order).
//!
//! This suite grants no component credit: the HTTP half of `model-fetchers` is a separate
//! component and is only modelled here as a typed adapter.

#[path = "../src/internal_driver.rs"]
mod internal_driver;

use jait_gateway::services::jait_models::{
    DecodedJaitModelId, JaitBackend, JaitBackendInstanceConfig, JaitModelsConfig,
    ListJaitModelsOptions, ModelFetchError, ModelFetchFuture, ModelFetchers, ProviderModelInfo,
    ReasoningEffort, decode_jait_model_id, encode_jait_model_id, list_jait_models,
    normalize_jait_backend_base_url, openrouter_static_models, parse_jait_backend_instances,
};
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{
        Mutex,
        atomic::{AtomicUsize, Ordering},
    },
    time::{SystemTime, UNIX_EPOCH},
};

// ---------------------------------------------------------------------------
// Scripted fetch boundary
// ---------------------------------------------------------------------------

#[derive(Clone, Debug)]
enum Response {
    Models(Vec<ProviderModelInfo>),
    Error(String),
}

impl Response {
    fn into_result(self) -> Result<Vec<ProviderModelInfo>, ModelFetchError> {
        match self {
            Self::Models(models) => Ok(models),
            Self::Error(message) => Err(ModelFetchError::new(message)),
        }
    }
}

/// Records every fetch invocation in order, counts completions, and can suspend one poll so
/// that concurrent start-up is observed rather than merely incidental.
struct ScriptedFetchers {
    script: HashMap<String, Response>,
    calls: Mutex<Vec<Value>>,
    completed: AtomicUsize,
    /// Number of fetches already completed when each fetch started.
    completed_at_start: Mutex<Vec<usize>>,
    suspend: bool,
}

impl ScriptedFetchers {
    fn new(script: HashMap<String, Response>) -> Self {
        Self {
            script,
            calls: Mutex::new(Vec::new()),
            completed: AtomicUsize::new(0),
            completed_at_start: Mutex::new(Vec::new()),
            suspend: false,
        }
    }

    fn suspended(mut self) -> Self {
        self.suspend = true;
        self
    }

    fn respond(&self, source: &str, args: Vec<Value>) -> Response {
        self.completed_at_start
            .lock()
            .unwrap()
            .push(self.completed.load(Ordering::SeqCst));
        self.calls
            .lock()
            .unwrap()
            .push(json!({"source": source, "args": args}));
        // An absent script entry resolves to an empty catalogue, like the peer module.
        self.script
            .get(source)
            .cloned()
            .unwrap_or(Response::Models(Vec::new()))
    }

    fn calls_json(&self) -> Value {
        Value::Array(self.calls.lock().unwrap().clone())
    }

    fn sources(&self) -> Vec<String> {
        self.calls
            .lock()
            .unwrap()
            .iter()
            .map(|call| call["source"].as_str().unwrap_or_default().to_string())
            .collect()
    }

    fn completed_at_start(&self) -> Vec<usize> {
        self.completed_at_start.lock().unwrap().clone()
    }
}

impl ModelFetchers for ScriptedFetchers {
    fn fetch_openai<'a>(&'a self, api_key: &'a str, base_url: &'a str) -> ModelFetchFuture<'a> {
        let response = self.respond("openai", vec![json!(api_key), json!(base_url)]);
        let suspend = self.suspend;
        let completed = &self.completed;
        Box::pin(async move {
            if suspend {
                tokio::task::yield_now().await;
            }
            completed.fetch_add(1, Ordering::SeqCst);
            response.into_result()
        })
    }

    fn fetch_openrouter<'a>(&'a self, api_key: &'a str) -> ModelFetchFuture<'a> {
        let response = self.respond("openrouter", vec![json!(api_key)]);
        let suspend = self.suspend;
        let completed = &self.completed;
        Box::pin(async move {
            if suspend {
                tokio::task::yield_now().await;
            }
            completed.fetch_add(1, Ordering::SeqCst);
            response.into_result()
        })
    }

    fn fetch_ollama<'a>(&'a self, base_url: &'a str) -> ModelFetchFuture<'a> {
        self.fetch_ollama_with(base_url, false)
    }

    fn fetch_ollama_with<'a>(
        &'a self,
        base_url: &'a str,
        include_cloud: bool,
    ) -> ModelFetchFuture<'a> {
        let response = self.respond(
            "ollama",
            vec![json!(base_url), json!({"includeCloud":include_cloud})],
        );
        let suspend = self.suspend;
        let completed = &self.completed;
        Box::pin(async move {
            if suspend {
                tokio::task::yield_now().await;
            }
            completed.fetch_add(1, Ordering::SeqCst);
            response.into_result()
        })
    }

    fn fetch_omniroute<'a>(&'a self, api_key: &'a str, base_url: &'a str) -> ModelFetchFuture<'a> {
        let response = self.respond("omniroute", vec![json!(api_key), json!(base_url)]);
        let suspend = self.suspend;
        let completed = &self.completed;
        Box::pin(async move {
            if suspend {
                tokio::task::yield_now().await;
            }
            completed.fetch_add(1, Ordering::SeqCst);
            response.into_result()
        })
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn config() -> JaitModelsConfig {
    JaitModelsConfig::default()
}

fn model(id: &str) -> ProviderModelInfo {
    ProviderModelInfo::new(id, format!("{id} name"))
}

fn script(entries: &[(&str, Response)]) -> HashMap<String, Response> {
    entries
        .iter()
        .map(|(source, response)| ((*source).to_string(), response.clone()))
        .collect()
}

fn keys(entries: &[(&str, &str)]) -> HashMap<String, String> {
    entries
        .iter()
        .map(|(key, value)| ((*key).to_string(), (*value).to_string()))
        .collect()
}

fn ids(models: &[ProviderModelInfo]) -> Vec<String> {
    models.iter().map(|model| model.id.clone()).collect()
}

fn groups(models: &[ProviderModelInfo]) -> Vec<String> {
    models
        .iter()
        .map(|model| model.group.clone().unwrap_or_default())
        .collect()
}

fn descriptions(models: &[ProviderModelInfo]) -> Vec<String> {
    models
        .iter()
        .map(|model| model.description.clone().unwrap_or_default())
        .collect()
}

fn instance(
    id: &str,
    backend: JaitBackend,
    name: &str,
    base_url: &str,
) -> JaitBackendInstanceConfig {
    JaitBackendInstanceConfig {
        id: id.to_string(),
        backend,
        name: name.to_string(),
        base_url: base_url.to_string(),
        api_key: None,
        model: None,
        num_ctx: None,
    }
}

/// Enters the configured branch through the public entry point: the instance list is
/// round-tripped through `JAIT_BACKEND_INSTANCES`, exactly as production config supplies it.
async fn configured_models(
    instances: &[JaitBackendInstanceConfig],
    fallback: &[ProviderModelInfo],
    fetchers: &dyn ModelFetchers,
    config: &JaitModelsConfig,
) -> Vec<ProviderModelInfo> {
    let api_keys = keys(&[(
        "JAIT_BACKEND_INSTANCES",
        &serde_json::to_string(instances).expect("instances serialize"),
    )]);
    let options = ListJaitModelsOptions {
        include_cloud: None,
        config,
        api_keys: Some(&api_keys),
        fallback_models: fallback,
    };
    list_jait_models(&options, fetchers).await
}

// ---------------------------------------------------------------------------
// Legacy routing
// ---------------------------------------------------------------------------

#[tokio::test]
async fn legacy_tags_each_source_and_keeps_fixed_source_order() {
    let config = config();
    let fetchers = ScriptedFetchers::new(script(&[
        ("openai", Response::Models(vec![model("gpt-4o")])),
        (
            "openrouter",
            Response::Models(vec![model("openrouter/one"), model("openrouter/two")]),
        ),
        ("ollama", Response::Models(vec![model("qwen3")])),
        ("omniroute", Response::Models(vec![model("route")])),
    ]));
    let api_keys = keys(&[
        ("OPENAI_API_KEY", "sk-openai"),
        ("OPENROUTER_API_KEY", "sk-openrouter"),
        ("OMNIROUTE_API_KEY", "sk-omniroute"),
    ]);
    let fallback: Vec<ProviderModelInfo> = Vec::new();
    let options = ListJaitModelsOptions {
        include_cloud: None,
        config: &config,
        api_keys: Some(&api_keys),
        fallback_models: &fallback,
    };
    let models = list_jait_models(&options, &fetchers).await;

    assert_eq!(
        ids(&models),
        [
            "gpt-4o",
            "openrouter/one",
            "openrouter/two",
            "qwen3",
            "route"
        ]
    );
    assert_eq!(
        groups(&models),
        ["OpenAI", "OpenRouter", "OpenRouter", "Ollama", "OmniRoute"]
    );
    assert_eq!(
        fetchers.sources(),
        ["openai", "openrouter", "ollama", "omniroute"]
    );
    let calls = fetchers.calls_json();
    assert_eq!(
        calls[0]["args"].clone(),
        json!(["sk-openai", "https://api.openai.com/v1"])
    );
    assert_eq!(calls[1]["args"].clone(), json!(["sk-openrouter"]));
    assert_eq!(
        calls[2]["args"].clone(),
        json!(["http://localhost:11434", {"includeCloud":true}])
    );
    assert_eq!(
        calls[3]["args"].clone(),
        json!(["sk-omniroute", "http://localhost:20128/v1"])
    );
}

#[tokio::test]
async fn legacy_trims_overrides_and_skips_sources_without_endpoints() {
    let mut config = config();
    config.ollama_url = String::new();
    config.openai_base_url = String::new();
    config.omniroute_base_url = String::new();
    let fetchers = ScriptedFetchers::new(HashMap::new());
    let api_keys = keys(&[("OPENAI_API_KEY", "  sk-trimmed  ")]);
    let fallback = vec![ProviderModelInfo::new("gpt-4o-mini", "GPT-4o mini")];
    let options = ListJaitModelsOptions {
        include_cloud: None,
        config: &config,
        api_keys: Some(&api_keys),
        fallback_models: &fallback,
    };
    let models = list_jait_models(&options, &fetchers).await;

    // Ollama and OmniRoute are skipped (blank endpoints), OpenRouter is skipped (no key),
    // and the OpenAI fetch returned nothing so the fallback is tagged instead.
    assert_eq!(fetchers.sources(), ["openai"]);
    assert_eq!(
        fetchers.calls_json()[0]["args"].clone(),
        json!(["sk-trimmed", "https://api.openai.com/v1"])
    );
    assert_eq!(ids(&models), ["gpt-4o-mini"]);
    assert_eq!(groups(&models), ["OpenAI"]);
    assert_eq!(models[0].is_default, None);
}

#[tokio::test]
async fn legacy_uses_config_openai_key_when_override_absent_or_blank() {
    let mut config = config();
    config.openai_api_key = "sk-config".to_string();
    let fetchers = ScriptedFetchers::new(script(&[(
        "openai",
        Response::Models(vec![model("gpt-5")]),
    )]));
    let api_keys = keys(&[("OPENAI_API_KEY", "   ")]);
    let fallback: Vec<ProviderModelInfo> = Vec::new();
    let options = ListJaitModelsOptions {
        include_cloud: None,
        config: &config,
        api_keys: Some(&api_keys),
        fallback_models: &fallback,
    };
    let models = list_jait_models(&options, &fetchers).await;
    assert_eq!(
        fetchers.calls_json()[0]["args"].clone(),
        json!(["sk-config", "https://api.openai.com/v1"])
    );
    assert_eq!(ids(&models), ["gpt-5"]);
}

#[tokio::test]
async fn legacy_isolates_source_errors_and_uses_static_openrouter_catalogue() {
    let config = config();
    let fetchers = ScriptedFetchers::new(script(&[
        ("openai", Response::Error("openai down".to_string())),
        ("openrouter", Response::Error("openrouter down".to_string())),
        ("ollama", Response::Error("ollama down".to_string())),
        ("omniroute", Response::Error("omniroute down".to_string())),
    ]));
    let api_keys = keys(&[("OPENROUTER_API_KEY", "sk-or")]);
    let fallback = vec![model("fallback-openai")];
    let options = ListJaitModelsOptions {
        include_cloud: None,
        config: &config,
        api_keys: Some(&api_keys),
        fallback_models: &fallback,
    };
    let models = list_jait_models(&options, &fetchers).await;

    // OpenAI degrades to the fallback, OpenRouter to the static catalogue, the other two to
    // nothing at all — and nothing rejects.
    assert_eq!(models.len(), 1 + 16);
    assert_eq!(models[0].id, "fallback-openai");
    assert_eq!(models[0].group.as_deref(), Some("OpenAI"));
    assert_eq!(models[1].id, "anthropic/claude-sonnet-4-20250514");
    assert_eq!(groups(&models)[16], "OpenRouter");
}

#[tokio::test]
async fn legacy_empty_openrouter_catalogue_also_uses_the_static_catalogue() {
    let config = config();
    let fetchers = ScriptedFetchers::new(script(&[("openrouter", Response::Models(Vec::new()))]));
    let api_keys = keys(&[("OPENROUTER_API_KEY", "sk-or")]);
    let fallback: Vec<ProviderModelInfo> = Vec::new();
    let options = ListJaitModelsOptions {
        include_cloud: None,
        config: &config,
        api_keys: Some(&api_keys),
        fallback_models: &fallback,
    };
    let models = list_jait_models(&options, &fetchers).await;
    assert_eq!(models.len(), 16);
    assert!(
        models
            .iter()
            .all(|model| model.group.as_deref() == Some("OpenRouter"))
    );
}

#[tokio::test]
async fn legacy_starts_every_source_before_consuming_any_result() {
    let config = config();
    let fetchers = ScriptedFetchers::new(script(&[
        ("openai", Response::Models(vec![model("a")])),
        ("openrouter", Response::Models(vec![model("b")])),
        ("ollama", Response::Models(vec![model("c")])),
        ("omniroute", Response::Models(vec![model("d")])),
    ]))
    .suspended();
    // The default config carries an empty OpenAI key, and an empty key keeps the OpenAI
    // source out of the batch entirely — a synthetic key is required to observe all four.
    let api_keys = keys(&[
        ("OPENAI_API_KEY", "sk-test"),
        ("OPENROUTER_API_KEY", "sk-or"),
    ]);
    let fallback: Vec<ProviderModelInfo> = Vec::new();
    let options = ListJaitModelsOptions {
        include_cloud: None,
        config: &config,
        api_keys: Some(&api_keys),
        fallback_models: &fallback,
    };
    let models = list_jait_models(&options, &fetchers).await;

    assert_eq!(
        fetchers.sources(),
        ["openai", "openrouter", "ollama", "omniroute"]
    );
    // Sequential awaiting would show earlier completions for the later sources.
    assert_eq!(fetchers.completed_at_start(), [0, 0, 0, 0]);
    assert_eq!(ids(&models), ["a", "b", "c", "d"]);
}

// ---------------------------------------------------------------------------
// Configured routing
// ---------------------------------------------------------------------------

#[tokio::test]
async fn configured_encodes_ids_and_decorates_group_and_description() {
    let config = config();
    let mut lab = instance("gpu/lab", JaitBackend::Ollama, "Lab", "http://box:11434");
    lab.num_ctx = Some(8192.0);
    let instances = vec![
        lab,
        instance("corp", JaitBackend::OpenAi, "Corp", "https://api.corp/v1"),
    ];
    let fetchers = ScriptedFetchers::new(script(&[
        (
            "ollama",
            Response::Models(vec![
                ProviderModelInfo::new("qwen3:32b/latest", "qwen3").with_description("32B"),
                ProviderModelInfo::new("llama3", "llama3"),
            ]),
        ),
        ("openai", Response::Models(vec![model("gpt-4o")])),
    ]));
    let fallback: Vec<ProviderModelInfo> = Vec::new();
    let models = configured_models(&instances, &fallback, &fetchers, &config).await;

    assert_eq!(
        ids(&models),
        [
            "jait://ollama/gpu%2Flab/qwen3%3A32b%2Flatest",
            "jait://ollama/gpu%2Flab/llama3",
            "jait://openai/corp/gpt-4o",
        ]
    );
    assert_eq!(
        groups(&models),
        ["Lab · Ollama", "Lab · Ollama", "Corp · OpenAI"]
    );
    assert_eq!(descriptions(&models), ["Ollama · 32B", "Ollama", "OpenAI"]);
    assert_eq!(fetchers.sources(), ["ollama", "openai"]);
}

#[tokio::test]
async fn configured_openai_instance_falls_back_only_when_its_catalogue_is_empty() {
    let config = config();
    let instances = vec![instance(
        "main",
        JaitBackend::OpenAi,
        "Main",
        "https://api/v1",
    )];
    let fallback = vec![model("gpt-4o-mini")];

    let erroring = ScriptedFetchers::new(script(&[("openai", Response::Error("502".to_string()))]));
    let models = configured_models(&instances, &fallback, &erroring, &config).await;
    assert_eq!(ids(&models), ["jait://openai/main/gpt-4o-mini"]);
    assert_eq!(models[0].group.as_deref(), Some("Main · OpenAI"));

    let empty = ScriptedFetchers::new(HashMap::new());
    let models = configured_models(&instances, &fallback, &empty, &config).await;
    assert_eq!(ids(&models), ["jait://openai/main/gpt-4o-mini"]);

    let healthy = ScriptedFetchers::new(script(&[(
        "openai",
        Response::Models(vec![model("gpt-5")]),
    )]));
    let models = configured_models(&instances, &fallback, &healthy, &config).await;
    assert_eq!(ids(&models), ["jait://openai/main/gpt-5"]);
}

#[tokio::test]
async fn configured_instance_model_override_becomes_the_single_default_entry() {
    let config = config();
    let mut ollama = instance("lab", JaitBackend::Ollama, "Lab", "http://box:11434");
    ollama.model = Some("qwen3:32b".to_string());
    ollama.num_ctx = Some(16384.0);
    let fetchers = ScriptedFetchers::new(HashMap::new());
    let fallback = vec![model("ignored")];
    let models = configured_models(&[ollama], &fallback, &fetchers, &config).await;

    assert_eq!(ids(&models), ["jait://ollama/lab/qwen3%3A32b"]);
    assert_eq!(models[0].name, "qwen3:32b");
    assert_eq!(models[0].is_default, Some(true));
    assert_eq!(models[0].group.as_deref(), Some("Lab · Ollama"));
    assert_eq!(models[0].description.as_deref(), Some("Ollama"));
}

#[tokio::test]
async fn configured_openrouter_uses_static_catalogue_only_for_empty_results() {
    let config = config();
    let instances = vec![instance(
        "router",
        JaitBackend::OpenRouter,
        "Router",
        "https://openrouter.ai/api/v1",
    )];
    let fallback = vec![model("unused")];

    let empty = ScriptedFetchers::new(script(&[("openrouter", Response::Models(Vec::new()))]));
    let models = configured_models(&instances, &fallback, &empty, &config).await;
    assert_eq!(models.len(), 16);
    assert_eq!(
        models[0].id,
        "jait://openrouter/router/anthropic%2Fclaude-sonnet-4-20250514"
    );
    assert_eq!(models[0].group.as_deref(), Some("Router · OpenRouter"));
    assert_eq!(
        models[0].description.as_deref(),
        Some("OpenRouter · Anthropic's latest Sonnet")
    );

    // An error is not an empty catalogue: the reference falls back to the configured model,
    // and an OpenRouter instance without one contributes nothing to the catalogue.
    let erroring = ScriptedFetchers::new(script(&[(
        "openrouter",
        Response::Error("429".to_string()),
    )]));
    let models = configured_models(&instances, &fallback, &erroring, &config).await;
    assert!(models.is_empty());
}

#[tokio::test]
async fn configured_non_openai_errors_contribute_nothing_and_order_is_preserved() {
    let config = config();
    let instances = vec![
        instance("a", JaitBackend::OpenAi, "Alpha", "https://a/v1"),
        instance("b", JaitBackend::OmniRoute, "Omni", "http://omni:20128/v1"),
        instance("c", JaitBackend::OpenAi, "Gamma", "https://c/v1"),
    ];
    let fetchers = ScriptedFetchers::new(script(&[
        ("openai", Response::Error("down".to_string())),
        ("omniroute", Response::Models(vec![model("route")])),
    ]))
    .suspended();
    let fallback = vec![model("fallback")];
    let models = configured_models(&instances, &fallback, &fetchers, &config).await;

    assert_eq!(
        ids(&models),
        [
            "jait://openai/a/fallback",
            "jait://omniroute/b/route",
            "jait://openai/c/fallback",
        ]
    );
    assert_eq!(fetchers.sources(), ["openai", "omniroute", "openai"]);
    assert_eq!(fetchers.completed_at_start(), [0, 0, 0]);
}

#[tokio::test]
async fn configured_keeps_unknown_model_properties() {
    let config = config();
    let instances = vec![instance("x", JaitBackend::OpenAi, "X", "https://x/v1")];
    // `ProviderModelInfo` in `packages/shared/src/types/thread.ts` declares no
    // `contextLength` member, so a fetcher that emits one must survive the
    // reference property-spread untouched. A typed integer field here would have
    // coerced the string form and rejected the fractional and 1e300 forms.
    let mut preserved = ProviderModelInfo::new("gpt-4o", "GPT-4o");
    preserved
        .extra
        .insert("contextLength".to_string(), json!(128_000));
    preserved
        .extra
        .insert("vendorFlag".to_string(), json!({"nested": [1, 2]}));
    preserved.supported_reasoning_efforts = Some(vec![ReasoningEffort {
        reasoning_effort: "high".to_string(),
        description: Some("deep".to_string()),
        extra: Default::default(),
    }]);
    let fetchers = ScriptedFetchers::new(script(&[("openai", Response::Models(vec![preserved]))]));
    let fallback: Vec<ProviderModelInfo> = Vec::new();
    let models = configured_models(&instances, &fallback, &fetchers, &config).await;

    assert_eq!(
        models[0].extra.get("contextLength").cloned(),
        Some(json!(128_000))
    );
    assert_eq!(
        models[0].extra.get("vendorFlag").cloned(),
        Some(json!({"nested": [1, 2]}))
    );
    assert!(models[0].supported_reasoning_efforts.is_some());
    assert_eq!(models[0].id, "jait://openai/x/gpt-4o");
}

// ---------------------------------------------------------------------------
// Shared parsing / ids
// ---------------------------------------------------------------------------

#[tokio::test]
async fn parse_normalizes_dedupes_and_applies_num_ctx_rules() {
    let raw = r#"[
        {"id":" a ","type":"ollama","name":" Lab ","baseUrl":"192.168.1.50:11434/","apiKey":" k ","model":" m ","numCtx":"4096"},
        {"id":"a","type":"openai","name":"duplicate","baseUrl":"http://dup"},
        {"id":"v","type":"vllm","name":"V","baseUrl":"http://h:8000"},
        {"id":"t","type":"telnet","name":"T","baseUrl":"http://t"},
        {"id":"n","type":"ollama","name":"N","baseUrl":"http://n","numCtx":2047},
        {"id":"z","type":"ollama","name":"Z","baseUrl":"http://z","numCtx":1.5},
        {"id":"p","type":"openai","name":"P","baseUrl":"http://p","numCtx":4096}
    ]"#;
    let instances = parse_jait_backend_instances(Some(raw));
    assert_eq!(
        instances.len(),
        5,
        "only the duplicate id and the unknown backend are dropped; malformed numCtx keeps the entry"
    );
    assert_eq!(instances[0].id, "a");
    assert_eq!(instances[0].base_url, "http://192.168.1.50:11434");
    assert_eq!(instances[0].api_key.as_deref(), Some("k"));
    assert_eq!(instances[0].model.as_deref(), Some("m"));
    assert_eq!(instances[0].num_ctx, Some(4096.0));
    assert_eq!(instances[1].base_url, "http://h:8000/v1");
    assert_eq!(instances[2].num_ctx, None, "below the 2048 floor");
    assert_eq!(
        instances[3].num_ctx, None,
        "non-integer numCtx and non-ollama backends never carry numCtx"
    );
}

#[tokio::test]
async fn parse_rejects_malformed_payloads_like_the_reference() {
    for raw in [
        None,
        Some(""),
        Some("   "),
        Some("not json"),
        Some("{\"id\":\"a\"}"),
    ] {
        assert!(parse_jait_backend_instances(raw).is_empty(), "raw: {raw:?}");
    }
    assert!(parse_jait_backend_instances(Some("[1, \"x\", null, []]")).is_empty());
    assert!(
        parse_jait_backend_instances(Some(
            r#"[{"id":5,"type":"openai","name":"n","baseUrl":"u"}]"#
        ))
        .is_empty(),
        "a numeric id is not coerced"
    );
}

#[tokio::test]
async fn encode_uses_encode_uri_component_semantics_and_round_trips() {
    assert_eq!(
        encode_jait_model_id(JaitBackend::Ollama, "gpu/lab", "qwen3:32b/latest"),
        "jait://ollama/gpu%2Flab/qwen3%3A32b%2Flatest"
    );
    // `encodeURIComponent` leaves ! * ' ( ) ~ unescaped; a stricter set would diverge.
    assert_eq!(
        encode_jait_model_id(JaitBackend::Gemini, "a/b c", "my model 1/x !*'()~"),
        "jait://gemini/a%2Fb%20c/my%20model%201%2Fx%20!*'()~"
    );
    assert_eq!(
        encode_jait_model_id(JaitBackend::Moonshot, "üñî", "模型"),
        "jait://moonshot/%C3%BC%C3%B1%C3%AE/%E6%A8%A1%E5%9E%8B"
    );

    let encoded = encode_jait_model_id(JaitBackend::OpenAi, "gpu lab", "gpt/4o");
    assert_eq!(
        decode_jait_model_id(&encoded),
        Some(DecodedJaitModelId {
            backend: JaitBackend::OpenAi,
            instance_id: "gpu lab".to_string(),
            model: "gpt/4o".to_string(),
        })
    );
}

#[tokio::test]
async fn decode_rejects_malformed_ids() {
    for value in [
        "jait://",
        "jait://ollama",
        "jait://ollama/instance",
        "jait://ollama//model",
        "jait://ollama/instance/",
        "jait://telnet/instance/model",
        "not-a-jait-id",
        "jait://ollama/instance/bad%zz",
    ] {
        assert!(decode_jait_model_id(value).is_none(), "value: {value}");
    }
}

#[tokio::test]
async fn normalize_defaults_bare_hosts_and_vllm_paths() {
    assert_eq!(
        normalize_jait_backend_base_url(" 192.168.1.50:11434// ", None),
        "http://192.168.1.50:11434"
    );
    assert_eq!(
        normalize_jait_backend_base_url("https://api.openai.com/v1/", None),
        "https://api.openai.com/v1"
    );
    assert_eq!(
        normalize_jait_backend_base_url("http://h:8000", Some(JaitBackend::Vllm)),
        "http://h:8000/v1"
    );
    assert_eq!(
        normalize_jait_backend_base_url("http://h:8000/v1", Some(JaitBackend::Vllm)),
        "http://h:8000/v1"
    );
    // Only vLLM gains the suffix.
    assert_eq!(
        normalize_jait_backend_base_url("http://h:8000", Some(JaitBackend::Ollama)),
        "http://h:8000"
    );
    assert_eq!(
        normalize_jait_backend_base_url("http://h:8000/", Some(JaitBackend::Vllm)),
        "http://h:8000/v1"
    );
    assert_eq!(normalize_jait_backend_base_url("   ", None), "");
    assert_eq!(normalize_jait_backend_base_url("//", None), "");

    // Malformed inputs. These are not "left alone": the reference strips trailing slashes
    // *before* the scheme test, so `http://` collapses to `http:` and is then treated as a
    // bare host. Every expectation below was probed against the real
    // `normalizeJaitBackendBaseUrl`, not inferred.
    for (raw, backend, expected) in [
        ("http://", Some(JaitBackend::Vllm), "http://http:/v1"),
        ("http://", None, "http://http:"),
        ("http:///", Some(JaitBackend::Vllm), "http://http:/v1"),
        ("HTTP://H:8000", Some(JaitBackend::Vllm), "HTTP://H:8000/v1"),
        ("ftp://x", Some(JaitBackend::Vllm), "ftp://x/v1"),
        ("h:8000/", Some(JaitBackend::Vllm), "http://h:8000/v1"),
        // `new URL("http://:")` throws, so the vLLM suffix is never applied.
        ("http://:", Some(JaitBackend::Vllm), "http://:"),
        ("ws://h:9000/", None, "ws://h:9000"),
    ] {
        assert_eq!(
            normalize_jait_backend_base_url(raw, backend),
            expected,
            "raw={raw:?}"
        );
    }
}

#[tokio::test]
async fn static_catalogue_is_complete_and_truthful() {
    let models = openrouter_static_models();
    assert_eq!(models.len(), 16);
    assert_eq!(models[7].id, "deepseek/deepseek-r1");
    assert_eq!(models[7].reasoning_effort_supported, Some(true));
    assert_eq!(models[15].id, "x-ai/grok-3-mini-beta");
    assert_eq!(models[15].reasoning_effort_supported, Some(true));
    assert_eq!(
        models
            .iter()
            .filter(|model| model.reasoning_effort_supported == Some(true))
            .count(),
        2
    );
    let mut unique: Vec<&str> = models.iter().map(|model| model.id.as_str()).collect();
    unique.sort_unstable();
    unique.dedup();
    assert_eq!(unique.len(), 16);
}

// ---------------------------------------------------------------------------
// Differential coverage against the real TypeScript module
// ---------------------------------------------------------------------------

fn repository_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..")
}

static NEXT_DIR: AtomicUsize = AtomicUsize::new(0);

fn driver_directory() -> PathBuf {
    let unique = NEXT_DIR.fetch_add(1, Ordering::SeqCst);
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis())
        .unwrap_or_default();
    let directory = repository_root().join(format!(
        ".jait/artifacts/gateway-rust/parallel-20261020/jait-models/driver/{stamp}-{unique}-{}",
        std::process::id()
    ));
    std::fs::create_dir_all(&directory).expect("driver directory");
    directory
}

fn run_driver(calls: Vec<Value>) -> Vec<Value> {
    let request = json!({"version": 1, "calls": calls});
    let cancelled = || false;
    let results =
        internal_driver::call(&repository_root(), &driver_directory(), request, &cancelled)
            .expect("jait-models reference driver must succeed");
    results
        .as_array()
        .expect("driver returns a results array")
        .clone()
}

fn op(name: &str, payload: Value) -> Value {
    json!({"op": format!("nativejaitmodels.{name}"), "payload": payload})
}

fn native_inputs(
    payload: &Value,
) -> (
    JaitModelsConfig,
    Option<HashMap<String, String>>,
    Vec<ProviderModelInfo>,
) {
    let config: JaitModelsConfig =
        serde_json::from_value(payload.get("config").cloned().unwrap_or_else(|| json!({})))
            .expect("config vector must deserialize");
    let api_keys: Option<HashMap<String, String>> = payload
        .get("apiKeys")
        .and_then(Value::as_object)
        .map(|object| {
            object
                .iter()
                .filter_map(|(key, value)| {
                    value.as_str().map(|value| (key.clone(), value.to_string()))
                })
                .collect()
        });
    let fallback: Vec<ProviderModelInfo> = payload
        .get("fallbackModels")
        .and_then(Value::as_array)
        .map(|models| {
            models
                .iter()
                .filter_map(|model| serde_json::from_value(model.clone()).ok())
                .collect()
        })
        .unwrap_or_default();
    (config, api_keys, fallback)
}

fn native_script(script: &Value) -> HashMap<String, Response> {
    script
        .as_object()
        .map(|object| {
            object
                .iter()
                .map(|(source, entry)| {
                    let response = match entry.get("error").and_then(Value::as_str) {
                        Some(message) => Response::Error(message.to_string()),
                        None => Response::Models(
                            entry
                                .get("models")
                                .and_then(Value::as_array)
                                .map(|models| {
                                    models
                                        .iter()
                                        .filter_map(|model| {
                                            serde_json::from_value::<ProviderModelInfo>(
                                                model.clone(),
                                            )
                                            .ok()
                                        })
                                        .collect()
                                })
                                .unwrap_or_default(),
                        ),
                    };
                    (source.clone(), response)
                })
                .collect()
        })
        .unwrap_or_default()
}

fn list_vectors() -> Vec<Value> {
    let mut vectors = vec![
        // Every key/URL overridden through `apiKeys`; all four sources healthy.
        json!({
            "config": {"openaiApiKey": "cfg", "openaiBaseUrl": "https://cfg/v1"},
            "apiKeys": {
                "OPENAI_API_KEY": "  sk-openai  ",
                "OPENAI_BASE_URL": " http://peer:9000/v1/ ",
                "OPENROUTER_API_KEY": "sk-or",
                "OLLAMA_URL": " http://ollama:11434 ",
                "OMNIROUTE_API_KEY": "sk-omni",
                "OMNIROUTE_BASE_URL": "http://omni:20128/v1"
            },
            "fallbackModels": [{"id": "gpt-4o-mini", "name": "GPT-4o mini"}],
            "script": {
                "openai": {"models": [{"id": "gpt-4o", "name": "GPT-4o", "contextLength": 128000}]},
                "openrouter": {"models": [{"id": "or/one", "name": "One"}]},
                "ollama": {"models": [{"id": "qwen3", "name": "qwen3"}, {"id":"hosted-cloud", "name":"Cloud", "group":"Ollama Cloud"}, {"id":"blank-group", "name":"Blank", "group":""}]},
                "omniroute": {"models": [{"id": "route", "name": "Route", "isDefault": true}]}
            }
        }),
        // Blank keys/endpoints: sources are skipped, OpenAI falls back.
        json!({
            "config": {"openaiApiKey": "", "openaiBaseUrl": "", "ollamaUrl": "  ", "omnirouteBaseUrl": ""},
            "apiKeys": {"OPENAI_API_KEY": "   ", "OMNIROUTE_API_KEY": "  "},
            "fallbackModels": [{"id": "gpt-4o-mini", "name": "GPT-4o mini"}],
            "script": {"openai": {"models": []}}
        }),
        // Every source throws: per-source isolation, static catalogue, OpenAI fallback.
        json!({
            "config": {},
            "apiKeys": {"OPENROUTER_API_KEY": "sk-or"},
            "fallbackModels": [{"id": "fallback", "name": "Fallback"}],
            "script": {
                "openai": {"error": "500"},
                "openrouter": {"error": "502"},
                "ollama": {"error": "down"},
                "omniroute": {"error": "down"}
            }
        }),
        // Empty (not failing) OpenRouter catalogue also selects the static catalogue.
        json!({
            "config": {},
            "apiKeys": {"OPENROUTER_API_KEY": "sk-or"},
            "fallbackModels": [],
            "script": {"openrouter": {"models": []}, "ollama": {"models": []}}
        }),
        // Configured instances: mixed backends, encoding, decoration, fallback and property
        // preservation including an unknown key and reasoning efforts.
        json!({
            "config": {},
            "apiKeys": {"JAIT_BACKEND_INSTANCES": "[{\"id\":\"gpu/lab\",\"type\":\"ollama\",\"name\":\"Lab\",\"baseUrl\":\"192.168.1.50:11434/\",\"model\":\"qwen3:32b\",\"numCtx\":4096},{\"id\":\"corp\",\"type\":\"openai\",\"name\":\"Corp\",\"baseUrl\":\"https://api.corp/v1\",\"apiKey\":\" k \"},{\"id\":\"router\",\"type\":\"openrouter\",\"name\":\"Router\",\"baseUrl\":\"https://openrouter.ai/api/v1\"},{\"id\":\"dead\",\"type\":\"openai\",\"name\":\"Dead\",\"baseUrl\":\"https://dead/v1\"}]"},
            "fallbackModels": [{"id": "gpt-4o-mini", "name": "GPT-4o mini"}],
            "script": {
                "ollama": {"models": [{"id": "qwen3:32b", "name": "qwen3", "description": "32B"}, {"id":"hosted-cloud", "name":"Hosted", "group":"Ollama Cloud"}, {"id":"empty-group", "name":"Empty", "group":""}]},
                "openai": {"models": [{"id": "gpt-4o", "name": "GPT-4o", "vendorFlag": {"nested": [1, 2]}, "supportedReasoningEfforts": [{"reasoningEffort": "high", "description": "deep"}]}]},
                "openrouter": {"error": "429"}
            }
        }),
        // Duplicate/invalid instance entries drop out before routing; vLLM gains /v1.
        json!({
            "config": {},
            "apiKeys": {"JAIT_BACKEND_INSTANCES": "[{\"id\":\"v\",\"type\":\"vllm\",\"name\":\"V\",\"baseUrl\":\"http://h:8000\"},{\"id\":\"v\",\"type\":\"openai\",\"name\":\"dup\",\"baseUrl\":\"http://dup\"},{\"id\":\"bad\",\"type\":\"telnet\",\"name\":\"T\",\"baseUrl\":\"http://t\"}]"},
            "fallbackModels": [],
            "script": {"openai": {"models": [{"id": "served", "name": "Served"}]}}
        }),
    ];
    for index in [0usize, 4] {
        let mut disabled = vectors[index].clone();
        disabled["includeCloud"] = json!(false);
        vectors.push(disabled);
    }
    vectors
}

fn assert_same(label: &str, reference: &Value, native: &Value) {
    assert_eq!(
        reference, native,
        "differential mismatch for {label}\nreference: {reference}\nnative:    {native}"
    );
}

#[tokio::test]
async fn differential_list_routing_matches_typescript() {
    let vectors = list_vectors();
    let calls: Vec<Value> = vectors
        .iter()
        .map(|payload| op("list", payload.clone()))
        .collect();
    let results = run_driver(calls);

    for (index, payload) in vectors.iter().enumerate() {
        let (config, api_keys, fallback) = native_inputs(payload);
        let script_value = payload.get("script").cloned().unwrap_or(Value::Null);
        let fetchers = ScriptedFetchers::new(native_script(&script_value));
        let options = ListJaitModelsOptions {
            include_cloud: payload["includeCloud"].as_bool(),
            config: &config,
            api_keys: api_keys.as_ref(),
            fallback_models: &fallback,
        };
        let models = list_jait_models(&options, &fetchers).await;
        let native = json!({"models": models, "calls": fetchers.calls_json()});
        assert_same(&format!("list vector {index}"), &results[index], &native);
    }
}

fn parse_payloads() -> Vec<Value> {
    vec![
        json!({"raw": null}),
        json!({"raw": "   "}),
        json!({"raw": "not json"}),
        json!({"raw": "{\"id\":\"a\"}"}),
        json!({"raw": "[{\"id\":\" a \",\"type\":\"ollama\",\"name\":\" Lab \",\"baseUrl\":\"192.168.1.50:11434/\",\"apiKey\":\" k \",\"model\":\" m \",\"numCtx\":\"4096\"},{\"id\":\"a\",\"type\":\"openai\",\"name\":\"dup\",\"baseUrl\":\"http://dup\"},{\"id\":\"v\",\"type\":\"vllm\",\"name\":\"V\",\"baseUrl\":\"http://h:8000\"},{\"id\":\"t\",\"type\":\"telnet\",\"name\":\"T\",\"baseUrl\":\"http://t\"},{\"id\":\"n\",\"type\":\"ollama\",\"name\":\"N\",\"baseUrl\":\"http://n\",\"numCtx\":2047},{\"id\":\"z\",\"type\":\"ollama\",\"name\":\"Z\",\"baseUrl\":\"http://z\",\"numCtx\":1.5},{\"id\":\"h\",\"type\":\"ollama\",\"name\":\"H\",\"baseUrl\":\"http://h\",\"numCtx\":\"0x800\"}]"}),
        json!({"raw": "[1, \"x\", null, [], {\"id\":5,\"type\":\"openai\",\"name\":\"n\",\"baseUrl\":\"u\"}]"}),
    ]
}

fn normalize_payloads() -> Vec<Value> {
    vec![
        json!({"raw": " 192.168.1.50:11434// ", "backend": "ollama"}),
        json!({"raw": "http://h:8000", "backend": "vllm"}),
        json!({"raw": "http://h:8000/", "backend": "vllm"}),
        json!({"raw": "http://h:8000/v1", "backend": "vllm"}),
        json!({"raw": "https://api.openai.com/v1/", "backend": null}),
        json!({"raw": "   ", "backend": null}),
        json!({"raw": "http://", "backend": "vllm"}),
        json!({"raw": "ws://h:9000/", "backend": null}),
    ]
}

fn encode_payloads() -> Vec<Value> {
    vec![
        json!({"backend": "ollama", "instanceId": "gpu/lab", "model": "qwen3:32b/latest"}),
        json!({"backend": "gemini", "instanceId": "a/b c", "model": "my model 1/x !*'()~"}),
        json!({"backend": "moonshot", "instanceId": "üñî", "model": "模型"}),
        json!({"backend": "opencode-go", "instanceId": "", "model": ""}),
    ]
}

fn decode_payloads() -> Vec<Value> {
    vec![
        json!({"value": "jait://ollama/gpu%2Flab/qwen3%3A32b%2Flatest"}),
        json!({"value": "jait://gemini/a%2Fb%20c/my%20model%201%2Fx%20!*'()~"}),
        json!({"value": "jait://ollama/gpu%2Flab/bad%zz"}),
        json!({"value": "jait://ollama/instance"}),
        json!({"value": "not-a-jait-id"}),
    ]
}

#[tokio::test]
async fn differential_shared_helpers_match_typescript() {
    let (parse, normalize, encode, decode) = (
        parse_payloads(),
        normalize_payloads(),
        encode_payloads(),
        decode_payloads(),
    );

    let mut calls = Vec::new();
    calls.extend(parse.iter().map(|payload| op("parse", payload.clone())));
    calls.extend(
        normalize
            .iter()
            .map(|payload| op("normalize", payload.clone())),
    );
    calls.extend(encode.iter().map(|payload| op("encode", payload.clone())));
    calls.extend(decode.iter().map(|payload| op("decode", payload.clone())));
    calls.push(op("catalogue", json!({})));

    let results = run_driver(calls);
    let mut cursor = 0;

    for payload in &parse {
        let raw = payload.get("raw").and_then(Value::as_str);
        let native = json!({"instances": parse_jait_backend_instances(raw)});
        assert_same("parse", &results[cursor], &native);
        cursor += 1;
    }
    for payload in &normalize {
        let raw = payload
            .get("raw")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let backend = payload
            .get("backend")
            .and_then(Value::as_str)
            .and_then(JaitBackend::parse);
        let native = json!({"baseUrl": normalize_jait_backend_base_url(raw, backend)});
        assert_same("normalize", &results[cursor], &native);
        cursor += 1;
    }
    for payload in &encode {
        let backend = payload
            .get("backend")
            .and_then(Value::as_str)
            .and_then(JaitBackend::parse)
            .expect("vector backend");
        let native = json!({"id": encode_jait_model_id(
            backend,
            payload.get("instanceId").and_then(Value::as_str).unwrap_or_default(),
            payload.get("model").and_then(Value::as_str).unwrap_or_default(),
        )});
        assert_same("encode", &results[cursor], &native);
        cursor += 1;
    }
    for payload in &decode {
        let value = payload
            .get("value")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let native = json!({"decoded": decode_jait_model_id(value)});
        assert_same("decode", &results[cursor], &native);
        cursor += 1;
    }
    let native = json!({"models": openrouter_static_models()});
    assert_same("openrouter static catalogue", &results[cursor], &native);
}
