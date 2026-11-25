//! Connection probes against local stand-ins for the endpoints the settings page tests. They drive
//! the public `ProviderProbes` trait, the entry the routes use. The mock routers live here, not in
//! `src/`, so their `.route(...)` fixtures stay out of the route inventory.
use axum::{
    Json, Router,
    http::{HeaderMap, StatusCode},
    routing::{get, post},
};
use jait_gateway::{
    providers::http_probes::HttpProviderProbes,
    routes::providers::{BackendProbe, ProviderProbes},
    services::jait_models::JaitBackend,
};
use serde_json::{Value, json};
use std::{
    sync::{Arc, Mutex},
    time::Duration,
};

const GO_PROMPT: &str =
    "This is a coding-agent connection test. Reply with OK only, without analysis.";

async fn serve(router: Router) -> String {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    tokio::spawn(async move { axum::serve(listener, router).await.unwrap() });
    base
}

fn probes(timeout: Duration) -> HttpProviderProbes {
    HttpProviderProbes::new(timeout, "http://localhost:20128/v1".into(), String::new()).unwrap()
}

fn backend_probe(
    backend: JaitBackend,
    base_url: String,
    api_key: &str,
    model: &str,
) -> BackendProbe {
    BackendProbe {
        backend,
        base_url,
        api_key: api_key.into(),
        model: model.into(),
    }
}

async fn omniroute(probes: &HttpProviderProbes, base_url: String, api_key: &str) -> Value {
    probes
        .probe_omniroute(&base_url, api_key)
        .await
        .expect("the probe ran")
}

async fn backend(probes: &HttpProviderProbes, probe: BackendProbe) -> Value {
    probes.probe_backend(probe).await.expect("the probe ran")
}

fn bearer(headers: &HeaderMap) -> Option<String> {
    headers
        .get("authorization")
        .and_then(|value| value.to_str().ok())
        .map(str::to_owned)
}

#[tokio::test]
async fn omniroute_reports_the_catalogue_and_whether_a_key_was_sent() {
    let seen = Arc::new(Mutex::new(Vec::<Option<String>>::new()));
    let recorder = seen.clone();
    let router = Router::new().route(
        "/v1/models",
        get(move |headers: HeaderMap| {
            let recorder = recorder.clone();
            async move {
                recorder.lock().unwrap().push(bearer(&headers));
                Json(json!({"data": [
                    {"id": "auto/coding"}, {"id": "openai/gpt-4o"}, {"id": "x/y"},
                    {"id": "a/b"}, {"name": "no id"}
                ]}))
            }
        }),
    );
    let base = format!("{}/v1", serve(router).await);
    let probes = probes(Duration::from_secs(5));

    let keyless = omniroute(&probes, base.clone(), "").await;
    assert_eq!(keyless["ok"], true, "{keyless}");
    assert_eq!(keyless["modelCount"], 4);
    assert_eq!(
        keyless["sampleModels"],
        json!(["auto/coding", "openai/gpt-4o", "x/y"])
    );
    assert_eq!(keyless["authenticated"], false);
    assert_eq!(keyless["baseUrl"], base);
    assert!(keyless["latencyMs"].is_u64());

    let keyed = omniroute(&probes, base, "router-key").await;
    assert_eq!(keyed["authenticated"], true);
    assert_eq!(
        *seen.lock().unwrap(),
        vec![None, Some("Bearer router-key".to_owned())]
    );
    assert!(!keyed.to_string().contains("router-key"));
}

#[tokio::test]
async fn omniroute_explains_a_rejected_key_instead_of_echoing_the_status() {
    let router = Router::new().route("/v1/models", get(|| async { StatusCode::UNAUTHORIZED }));
    let base = format!("{}/v1", serve(router).await);
    let body = omniroute(&probes(Duration::from_secs(5)), base, "wrong").await;
    assert_eq!(body["ok"], false);
    let error = body["error"].as_str().unwrap();
    assert!(
        error.contains("401") && error.contains("keyless free tier"),
        "{error}"
    );
}

#[tokio::test]
async fn an_unreachable_router_is_an_actionable_message() {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    drop(listener);
    let body = omniroute(
        &probes(Duration::from_secs(5)),
        format!("http://127.0.0.1:{port}/v1"),
        "",
    )
    .await;
    assert_eq!(body["ok"], false);
    let error = body["error"].as_str().unwrap();
    assert!(
        error.starts_with("Could not reach the router — start it, or correct the base URL."),
        "{error}"
    );
    assert!(error.contains("ECONNREFUSED"), "{error}");
}

#[tokio::test]
async fn ollama_is_probed_through_api_tags_by_model_name() {
    let router = Router::new().route(
        "/api/tags",
        get(|| async { Json(json!({"models": [{"name": "llama3:8b"}, {"name": "qwen3:4b"}]})) }),
    );
    let base = serve(router).await;
    let probes = probes(Duration::from_secs(5));

    let present = backend(
        &probes,
        backend_probe(JaitBackend::Ollama, base.clone(), "", "qwen3:4b"),
    )
    .await;
    assert_eq!(present["ok"], true, "{present}");
    assert_eq!(present["backend"], "ollama");
    assert_eq!(present["modelCount"], 2);
    assert_eq!(present["sampleModels"], json!(["llama3:8b", "qwen3:4b"]));
    assert_eq!(present["modelPresent"], true);
    assert_eq!(present["authenticated"], false);

    let absent = backend(
        &probes,
        backend_probe(JaitBackend::Ollama, base.clone(), "", "missing"),
    )
    .await;
    assert_eq!(absent["modelPresent"], false);
    let unnamed = backend(&probes, backend_probe(JaitBackend::Ollama, base, "", "")).await;
    assert!(unnamed.get("modelPresent").is_none(), "{unnamed}");
}

#[tokio::test]
async fn a_missing_catalogue_names_the_url_and_the_v1_hint() {
    let base = serve(Router::new()).await;
    let body = backend(
        &probes(Duration::from_secs(5)),
        backend_probe(JaitBackend::Vllm, base.clone(), "", ""),
    )
    .await;
    assert_eq!(body["ok"], false);
    let error = body["error"].as_str().unwrap();
    assert!(
        error.contains(&format!("HTTP 404 for {base}/models")),
        "{error}"
    );
    assert!(error.contains("usually serve it under /v1"), "{error}");
    assert_eq!(body["backend"], "vllm");
}

#[tokio::test]
async fn backend_auth_errors_and_other_statuses_have_their_own_wording() {
    let router = Router::new()
        .route("/forbidden/models", get(|| async { StatusCode::FORBIDDEN }))
        .route("/broken/models", get(|| async { StatusCode::BAD_GATEWAY }));
    let base = serve(router).await;
    let probes = probes(Duration::from_secs(5));
    let forbidden = backend(
        &probes,
        backend_probe(JaitBackend::OpenAi, format!("{base}/forbidden"), "k", ""),
    )
    .await;
    assert_eq!(
        forbidden["error"],
        "The endpoint answered with an auth error — the API key was rejected or missing."
    );
    let broken = backend(
        &probes,
        backend_probe(JaitBackend::OpenAi, format!("{base}/broken"), "", ""),
    )
    .await;
    assert_eq!(broken["error"], "The endpoint answered HTTP 502.");
}

#[tokio::test]
async fn a_slow_endpoint_is_reported_as_no_response() {
    let router = Router::new().route(
        "/models",
        get(|| async {
            tokio::time::sleep(Duration::from_secs(5)).await;
            Json(json!({"data": []}))
        }),
    );
    let base = serve(router).await;
    let body = backend(
        &probes(Duration::from_millis(200)),
        backend_probe(JaitBackend::OpenAi, base, "", ""),
    )
    .await;
    assert_eq!(body["ok"], false);
    assert_eq!(
        body["error"],
        "No response within 0.2s. Is the service running and reachable from the gateway?"
    );
}

#[tokio::test]
async fn a_catalogue_that_is_not_json_is_unreachable_not_empty() {
    let router = Router::new().route("/models", get(|| async { "<html>sign in</html>" }));
    let base = serve(router).await;
    let body = backend(
        &probes(Duration::from_secs(5)),
        backend_probe(JaitBackend::OpenAi, base, "", ""),
    )
    .await;
    assert_eq!(body["ok"], false);
    assert_eq!(
        body["error"],
        "Could not reach the service. (invalid JSON response)"
    );
}

#[tokio::test]
async fn an_oversized_catalogue_is_refused_rather_than_buffered() {
    let router = Router::new().route(
        "/models",
        get(|| async { Json(json!({"data": [], "pad": "x".repeat(9 * 1024 * 1024)})) }),
    );
    let base = serve(router).await;
    let body = backend(
        &probes(Duration::from_secs(20)),
        backend_probe(JaitBackend::OpenAi, base, "", ""),
    )
    .await;
    assert_eq!(body["ok"], false);
    assert_eq!(
        body["error"],
        "Could not reach the service. (response too large)"
    );
}

#[tokio::test]
async fn a_redirect_to_another_host_does_not_carry_the_key() {
    let seen = Arc::new(Mutex::new(Vec::<Option<String>>::new()));
    let recorder = seen.clone();
    let elsewhere = serve(Router::new().route(
        "/v1/models",
        get(move |headers: HeaderMap| {
            let recorder = recorder.clone();
            async move {
                recorder.lock().unwrap().push(bearer(&headers));
                Json(json!({"data": [{"id": "relocated"}]}))
            }
        }),
    ))
    .await;
    let target = format!("{elsewhere}/v1/models");
    let origin = serve(Router::new().route(
        "/v1/models",
        get(move || {
            let target = target.clone();
            async move { (StatusCode::FOUND, [("location", target)]) }
        }),
    ))
    .await;
    let body = omniroute(
        &probes(Duration::from_secs(5)),
        format!("{origin}/v1"),
        "secret-router-key",
    )
    .await;
    assert_eq!(
        body["ok"], true,
        "the redirect is followed like fetch does: {body}"
    );
    assert_eq!(body["sampleModels"], json!(["relocated"]));
    assert_eq!(
        *seen.lock().unwrap(),
        vec![None],
        "the key must not reach a different origin"
    );
}

#[tokio::test]
async fn a_redirect_loop_ends_instead_of_hanging() {
    let router = Router::new().route(
        "/loop/models",
        get(|| async { (StatusCode::FOUND, [("location", "/loop/models")]) }),
    );
    let base = serve(router).await;
    let body = backend(
        &probes(Duration::from_secs(5)),
        backend_probe(JaitBackend::OpenAi, format!("{base}/loop"), "", ""),
    )
    .await;
    assert_eq!(body["ok"], false);
    assert!(
        body["error"]
            .as_str()
            .unwrap()
            .starts_with("Could not reach the service."),
        "{body}"
    );
}

/// The Go catalogue is public, so a key is only proven by a real completion.
type GoRequest = (Option<String>, bool, Value);

fn go_router(requests: Arc<Mutex<Vec<GoRequest>>>, reject: bool) -> Router {
    Router::new()
        .route(
            "/zen/go/v1/models",
            get(|| async { Json(json!({"data": [{"id": "glm-5.2"}, {"id": "kimi-k2"}]})) }),
        )
        .route(
            "/zen/go/v1/chat/completions",
            post(move |headers: HeaderMap, Json(body): Json<Value>| {
                let requests = requests.clone();
                async move {
                    requests.lock().unwrap().push((
                        bearer(&headers),
                        headers.contains_key("x-opencode-session"),
                        body,
                    ));
                    if reject {
                        (
                            StatusCode::UNAUTHORIZED,
                            Json(json!({"error": {"message": "Invalid Go API key"}})),
                        )
                    } else {
                        (
                            StatusCode::OK,
                            Json(json!({"choices": [{"message": {"content": "OK"}}]})),
                        )
                    }
                }
            }),
        )
}

#[tokio::test]
async fn opencode_go_is_connected_only_after_a_completion_succeeds() {
    let requests = Arc::new(Mutex::new(Vec::new()));
    let base = format!(
        "{}/zen/go/v1",
        serve(go_router(requests.clone(), false)).await
    );
    let body = backend(
        &probes(Duration::from_secs(5)),
        backend_probe(JaitBackend::OpenCodeGo, base, "go-key", ""),
    )
    .await;
    assert_eq!(body["ok"], true, "{body}");
    assert_eq!(body["authenticated"], true);
    assert_eq!(body["modelCount"], 2);
    let requests = requests.lock().unwrap();
    assert_eq!(requests.len(), 1);
    let (authorization, has_session, sent) = &requests[0];
    assert_eq!(authorization.as_deref(), Some("Bearer go-key"));
    assert!(has_session, "the Go service needs its session header");
    assert_eq!(sent["model"], "glm-5.2");
    assert_eq!(sent["max_tokens"], 512);
    assert_eq!(sent["stream"], false);
    assert_eq!(sent["messages"][0]["content"], GO_PROMPT);
}

#[tokio::test]
async fn opencode_go_reports_a_rejected_key_even_when_the_catalogue_loads() {
    let requests = Arc::new(Mutex::new(Vec::new()));
    let base = format!(
        "{}/zen/go/v1",
        serve(go_router(requests.clone(), true)).await
    );
    let body = backend(
        &probes(Duration::from_secs(5)),
        backend_probe(JaitBackend::OpenCodeGo, base, "go-secret-key", ""),
    )
    .await;
    assert_eq!(body["ok"], false, "{body}");
    assert_eq!(body["backend"], "opencode-go");
    let error = body["error"].as_str().unwrap();
    assert!(error.starts_with("Could not reach the service."), "{error}");
    assert!(error.contains("401"), "{error}");
    assert!(
        !body.to_string().contains("go-secret-key"),
        "the key must not be echoed: {body}"
    );
}

#[tokio::test]
async fn opencode_go_refuses_a_model_it_does_not_offer_without_a_completion() {
    let requests = Arc::new(Mutex::new(Vec::new()));
    let base = format!(
        "{}/zen/go/v1",
        serve(go_router(requests.clone(), false)).await
    );
    let body = backend(
        &probes(Duration::from_secs(5)),
        backend_probe(JaitBackend::OpenCodeGo, base, "go-key", "nope"),
    )
    .await;
    assert_eq!(
        body,
        json!({"ok": false, "error": "OpenCode Go does not offer model \"nope\"."})
    );
    assert!(requests.lock().unwrap().is_empty());
}
