//! Provider and provider-account routes through the production binary.
use serde_json::{Value, json};
use std::{
    io::{BufRead, BufReader},
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::{Arc, Mutex, mpsc},
    time::Duration,
};

struct Gateway {
    child: Child,
    directory: PathBuf,
    base: String,
}

impl Gateway {
    fn start() -> Self {
        Self::start_with(&[])
    }

    /// Starts the binary with extra environment entries on top of the isolated base.
    fn start_with(extra: &[(&str, String)]) -> Self {
        let directory = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../.jait/artifacts/binary-providers-tests")
            .join(uuid::Uuid::new_v4().to_string());
        std::fs::create_dir_all(&directory).unwrap();
        let directory = directory.canonicalize().unwrap();
        std::fs::write(directory.join("notes.txt"), "binary-policy-marker").unwrap();
        let mut child = Command::new(env!("CARGO_BIN_EXE_jait-gateway"))
            .env_clear()
            .env("HOME", &directory)
            .env("JAIT_RUST_APPLICATION", "1")
            .env("JAIT_RUST_PORT", "0")
            .env("JAIT_RUST_PROJECT_ROOT", &directory)
            .env("JAIT_RUST_DB", directory.join("gateway.sqlite"))
            .env("JWT_SECRET", "isolated-repos-secret")
            .envs(extra.iter().map(|(key, value)| (*key, value.as_str())))
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()
            .unwrap();
        let stdout = child.stdout.take().unwrap();
        let (tx, rx) = mpsc::channel();
        std::thread::spawn(move || {
            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                if let Ok(value) = serde_json::from_str::<Value>(&line)
                    && value["event"] == "gateway.ready"
                {
                    let _ = tx.send(value["address"].as_str().unwrap_or("").to_owned());
                    return;
                }
            }
        });
        let address = match rx.recv_timeout(Duration::from_secs(30)) {
            Ok(address) => address,
            Err(error) => {
                let _ = child.kill();
                let _ = child.wait();
                panic!("gateway failed to become ready: {error}");
            }
        };
        assert!(address.starts_with("127.0.0.1:"));
        Self {
            child,
            directory,
            base: format!("http://{address}"),
        }
    }
}

impl Drop for Gateway {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
        let _ = std::fs::remove_dir_all(&self.directory);
    }
}
#[tokio::test]
async fn provider_routes_through_the_binary() {
    let gateway = Gateway::start();
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .unwrap();
    let url = |path: &str| format!("{}{path}", gateway.base);
    let register = |name: &'static str, invitation: Option<Value>| {
        let client = client.clone();
        let target = url("/api/auth/register");
        async move {
            let mut body = json!({"username":name, "password":"owner-pass-123"});
            if let Some(invitation) = invitation {
                body["invitation"] = invitation;
            }
            let response = client.post(target).json(&body).send().await.unwrap();
            assert_eq!(response.status(), 200);
            response.json::<Value>().await.unwrap()["access_token"]
                .as_str()
                .unwrap()
                .to_owned()
        }
    };
    let owner = register("owner", None).await;
    let invite = client
        .post(url("/api/auth/invitations"))
        .bearer_auth(&owner)
        .json(&json!({}))
        .send()
        .await
        .unwrap()
        .json::<Value>()
        .await
        .unwrap();
    let other = register("other", Some(invite["invitation"].clone())).await;
    let call = |method: reqwest::Method, path: String, token: String, body: Option<Value>| {
        let client = client.clone();
        let target = url(&path);
        async move {
            let mut request = client.request(method, target).bearer_auth(token);
            if let Some(body) = body {
                request = request.json(&body);
            }
            let response = request.send().await.unwrap();
            let status = response.status().as_u16();
            let text = response.text().await.unwrap();
            (
                status,
                serde_json::from_str::<Value>(&text).unwrap_or(Value::String(text)),
            )
        }
    };
    use reqwest::Method as M;

    let o = owner.clone();
    let x = other.clone();

    for (m, p) in [
        (M::GET, "/api/providers"),
        (M::GET, "/api/provider-accounts"),
        (M::GET, "/api/provider-usage"),
        (M::GET, "/api/provider-usage/summary"),
    ] {
        let (st, _) = call(m.clone(), p.into(), String::new(), None).await;
        assert_eq!(st, 401, "{m} {p}");
    }

    let (st, b) = call(M::GET, "/api/providers".into(), o.clone(), None).await;
    assert_eq!(st, 200, "{b}");
    assert!(
        b["providers"].as_array().is_some_and(|a| !a.is_empty()),
        "{b}"
    );
    let (st, b) = call(M::GET, "/api/provider-accounts".into(), o.clone(), None).await;
    assert_eq!(st, 200, "{b}");
    assert_eq!(b["accounts"], json!([]));
    let (st, b) = call(M::GET, "/api/provider-usage".into(), o.clone(), None).await;
    assert!(st == 200 && b["usage"] == json!([]), "{b}");
    let (st, b) = call(
        M::GET,
        "/api/provider-usage/summary".into(),
        o.clone(),
        None,
    )
    .await;
    assert!(st == 200 && b["profiles"] == json!([]), "{b}");

    let (st, _) = call(
        M::POST,
        "/api/provider-accounts".into(),
        o.clone(),
        Some(json!({})),
    )
    .await;
    assert_eq!(st, 400);
    let (st, b) = call(
        M::PATCH,
        "/api/provider-accounts/nope".into(),
        o.clone(),
        Some(json!({"label":""})),
    )
    .await;
    assert_eq!(st, 400, "{b}");
    let (st, b) = call(
        M::PATCH,
        "/api/provider-accounts/nope".into(),
        o.clone(),
        Some(json!({"label":"x"})),
    )
    .await;
    assert_eq!(st, 404, "{b}");
    let (st, _) = call(
        M::DELETE,
        "/api/provider-accounts/nope".into(),
        o.clone(),
        None,
    )
    .await;
    assert_eq!(st, 404);
    let (st, _) = call(
        M::POST,
        "/api/provider-accounts/nope/opencode-go".into(),
        o.clone(),
        Some(json!({})),
    )
    .await;
    assert_eq!(st, 404);
    let (st, b) = call(M::GET, "/api/providers/nope/models".into(), o.clone(), None).await;
    assert_eq!(st, 404, "{b}");
    let (st, b) = call(
        M::GET,
        "/api/providers/nope/auth/status".into(),
        o.clone(),
        None,
    )
    .await;
    assert_eq!(st, 404, "{b}");
    let (st, b) = call(
        M::POST,
        "/api/providers/omniroute/test".into(),
        o.clone(),
        Some(json!({"baseUrl":"file:///x"})),
    )
    .await;
    assert_eq!(st, 400, "{b}");
    let (st, b) = call(
        M::POST,
        "/api/providers/backend/test".into(),
        o.clone(),
        Some(json!({})),
    )
    .await;
    assert_eq!(st, 400, "{b}");
    let (st, b) = call(
        M::POST,
        "/api/providers/nope/auth/logout".into(),
        o.clone(),
        Some(json!({})),
    )
    .await;
    assert_eq!(st, 404, "{b}");
    // Private provider launch is not wired yet: creation must fail closed
    // and leave both users' account lists empty.
    let (st, body) = call(
        M::POST,
        "/api/provider-accounts".into(),
        o.clone(),
        Some(json!({"providerType":"codex", "label":"Original"})),
    )
    .await;
    assert_eq!(st, 400, "{body}");
    assert!(body["error"].as_str().unwrap().contains("not supported"));
    let (st, body) = call(M::GET, "/api/provider-accounts".into(), o.clone(), None).await;
    assert_eq!(st, 200, "{body}");
    assert_eq!(body["accounts"], json!([]));
    // Another user sees an empty account list and cannot touch accounts.
    let (st, b) = call(M::GET, "/api/provider-accounts".into(), x.clone(), None).await;
    assert!(st == 200 && b["accounts"] == json!([]), "{b}");
    let _ = &client;
}

#[tokio::test]
async fn builtin_provider_models_and_reset_through_the_binary() {
    let gateway = Gateway::start();
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .unwrap();
    let register = client
        .post(format!("{}/api/auth/register", gateway.base))
        .json(&json!({"username":"catalogue-owner","password":"owner-pass-123"}))
        .send()
        .await
        .unwrap();
    assert_eq!(register.status(), 200);
    let token = register.json::<Value>().await.unwrap()["access_token"]
        .as_str()
        .unwrap()
        .to_owned();

    let unauthenticated = client
        .get(format!("{}/api/providers/jait/models", gateway.base))
        .send()
        .await
        .unwrap();
    assert_eq!(unauthenticated.status(), 401);

    // The built-in provider needs no account and serves its static model catalogue.
    let models = client
        .get(format!("{}/api/providers/jait/models", gateway.base))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap();
    assert_eq!(models.status(), 200);
    let models = models.json::<Value>().await.unwrap();
    let default = models["models"]
        .as_array()
        .expect("models array")
        .iter()
        .find(|model| model["id"] == "gpt-4o")
        .unwrap_or_else(|| panic!("gpt-4o missing from {models}"));
    assert_eq!(default["isDefault"], json!(true));

    let reset = client
        .post(format!("{}/api/providers/models/reset", gateway.base))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap();
    assert_eq!(reset.status(), 200);
    assert_eq!(reset.json::<Value>().await.unwrap(), json!({"ok": true}));
}

/// The scope a request was filed under and the bearer token it carried.
type Seen = (String, Option<String>);

/// A local stand-in for the model catalogues the settings page probes. Each request is filed under
/// the first path segment (its "scope") with the bearer token it carried, so a test can tell which
/// configured key reached which endpoint.
#[derive(Clone, Default)]
struct Catalogue {
    seen: Arc<Mutex<Vec<Seen>>>,
}

impl Catalogue {
    fn note(&self, scope: &str, headers: &axum::http::HeaderMap) {
        let bearer = headers
            .get("authorization")
            .and_then(|value| value.to_str().ok())
            .map(str::to_owned);
        self.seen.lock().unwrap().push((scope.to_owned(), bearer));
    }

    fn bearers(&self, scope: &str) -> Vec<Option<String>> {
        self.seen
            .lock()
            .unwrap()
            .iter()
            .filter(|(seen, _)| seen == scope)
            .map(|(_, bearer)| bearer.clone())
            .collect()
    }
}

/// Serves `/{scope}/v1/models` (OpenAI shape), `/{scope}/api/tags` (Ollama) and the OpenCode Go
/// catalogue plus completion under `/{scope}/zen/go/v1`. A bearer of `wrong-key` is refused.
async fn serve_catalogue(catalogue: Catalogue) -> String {
    use axum::{
        Json, Router,
        extract::Path,
        http::{HeaderMap, StatusCode},
        response::{IntoResponse, Response},
        routing::{get, post},
    };
    fn listed(headers: &HeaderMap, body: Value) -> Response {
        let refused = headers
            .get("authorization")
            .and_then(|value| value.to_str().ok())
            == Some("Bearer wrong-key");
        if refused {
            StatusCode::UNAUTHORIZED.into_response()
        } else {
            Json(body).into_response()
        }
    }
    let models = Json(json!({"data": [
        {"id": "auto/coding"}, {"id": "openai/gpt-4o"}, {"id": "x/y"}, {"id": "a/b"}
    ]}));
    let openai = {
        let (catalogue, models) = (catalogue.clone(), models.0.clone());
        move |Path(scope): Path<String>, headers: HeaderMap| {
            catalogue.note(&scope, &headers);
            let models = models.clone();
            async move {
                if scope == "redirect" {
                    return (
                        StatusCode::FOUND,
                        [(axum::http::header::LOCATION, "/destination/v1/models")],
                    )
                        .into_response();
                }
                listed(&headers, models)
            }
        }
    };
    let rooted = {
        let (catalogue, models) = (catalogue.clone(), models.0.clone());
        move |headers: HeaderMap| {
            catalogue.note("root", &headers);
            let models = models.clone();
            async move { listed(&headers, models) }
        }
    };
    let ollama = {
        let catalogue = catalogue.clone();
        move |Path(scope): Path<String>, headers: HeaderMap| {
            catalogue.note(&scope, &headers);
            async move {
                listed(
                    &headers,
                    json!({"models": [{"name": "llama3:8b"}, {"name": "qwen3:4b"}]}),
                )
            }
        }
    };
    let go_models = {
        let catalogue = catalogue.clone();
        move |Path(scope): Path<String>, headers: HeaderMap| {
            catalogue.note(&format!("{scope}-catalogue"), &headers);
            async move {
                listed(
                    &headers,
                    json!({"data": [{"id": "glm-5.2"}, {"id": "kimi-k2"}]}),
                )
            }
        }
    };
    let go_completion = {
        let catalogue = catalogue.clone();
        move |Path(scope): Path<String>, headers: HeaderMap, Json(_): Json<Value>| {
            catalogue.note(&format!("{scope}-completion"), &headers);
            async move { Json(json!({"choices": [{"message": {"content": "OK"}}]})) }
        }
    };
    let router = Router::new()
        .route("/v1/models", get(rooted))
        .route("/{scope}/v1/models", get(openai))
        .route("/{scope}/api/tags", get(ollama))
        .route("/{scope}/zen/go/v1/models", get(go_models))
        .route("/{scope}/zen/go/v1/chat/completions", post(go_completion));
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    tokio::spawn(async move { axum::serve(listener, router).await.unwrap() });
    base
}

/// A loopback address nothing listens on.
async fn closed_port() -> u16 {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    listener.local_addr().unwrap().port()
}

async fn probe_call(
    client: &reqwest::Client,
    base: &str,
    token: Option<&str>,
    path: &str,
    body: Value,
) -> (u16, Value) {
    let mut request = client.post(format!("{base}{path}")).json(&body);
    if let Some(token) = token {
        request = request.bearer_auth(token);
    }
    let response = request.send().await.unwrap();
    let status = response.status().as_u16();
    (
        status,
        response.json::<Value>().await.unwrap_or(Value::Null),
    )
}

#[tokio::test]
async fn omniroute_probe_prefers_the_draft_then_saved_settings_then_the_gateway_config() {
    let catalogue = Catalogue::default();
    let mock = serve_catalogue(catalogue.clone()).await;
    let gateway = Gateway::start_with(&[
        ("OMNIROUTE_BASE_URL", format!("{mock}/env/v1")),
        ("OMNIROUTE_API_KEY", "env-key".into()),
    ]);
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .unwrap();
    let registered = client
        .post(format!("{}/api/auth/register", gateway.base))
        .json(&json!({"username": "probe-owner", "password": "owner-pass-123"}))
        .send()
        .await
        .unwrap();
    assert_eq!(registered.status(), 200);
    let token = registered.json::<Value>().await.unwrap()["access_token"]
        .as_str()
        .unwrap()
        .to_owned();
    let path = "/api/providers/omniroute/test";
    // Every response body, so the final check covers all of them and not only the last.
    let mut transcript = String::new();

    let (status, body) = probe_call(&client, &gateway.base, None, path, json!({})).await;
    assert_eq!(
        status, 401,
        "the probe sends the caller's saved keys outward"
    );
    transcript.push_str(&body.to_string());

    // Nothing in the request or the saved settings: the gateway's own configuration answers.
    let (status, body) = probe_call(&client, &gateway.base, Some(&token), path, json!({})).await;
    transcript.push_str(&body.to_string());
    assert_eq!(status, 200, "{body}");
    assert_eq!(body["ok"], true, "{body}");
    assert_eq!(body["modelCount"], 4);
    assert_eq!(
        body["sampleModels"],
        json!(["auto/coding", "openai/gpt-4o", "x/y"])
    );
    assert_eq!(body["authenticated"], true);
    assert_eq!(body["baseUrl"], format!("{mock}/env/v1"));
    assert!(body["latencyMs"].is_u64(), "{body}");
    let env_bearer = Some("Bearer env-key".to_owned());
    assert!(catalogue.bearers("env").contains(&env_bearer));
    let env_requests = catalogue.bearers("env").len();

    // Saved settings beat the gateway configuration.
    let saved = client
        .patch(format!("{}/api/auth/settings", gateway.base))
        .bearer_auth(&token)
        .json(&json!({"api_keys": {
            "OMNIROUTE_BASE_URL": format!("{mock}/saved/v1"),
            "OMNIROUTE_API_KEY": "saved-key",
        }}))
        .send()
        .await
        .unwrap();
    assert_eq!(saved.status(), 200);
    let (status, body) = probe_call(&client, &gateway.base, Some(&token), path, json!({})).await;
    transcript.push_str(&body.to_string());
    assert_eq!((status, &body["ok"]), (200, &json!(true)), "{body}");
    assert_eq!(
        catalogue.bearers("saved"),
        [Some("Bearer saved-key".to_owned())]
    );
    assert_eq!(
        catalogue.bearers("env").len(),
        env_requests,
        "saved settings win"
    );

    // The draft in the request beats both, so a URL can be checked before it is saved.
    let draft = json!({"base_url": format!("{mock}/draft/v1"), "api_key": "draft-key"});
    let (status, body) = probe_call(&client, &gateway.base, Some(&token), path, draft).await;
    transcript.push_str(&body.to_string());
    assert_eq!((status, &body["ok"]), (200, &json!(true)), "{body}");
    assert_eq!(
        catalogue.bearers("draft"),
        [Some("Bearer draft-key".to_owned())]
    );
    assert_eq!(catalogue.bearers("saved").len(), 1, "the draft wins");

    // As in the reference, a blank draft key falls back to the saved key rather than going keyless.
    let blank = json!({"base_url": format!("{mock}/blank/v1"), "api_key": "  "});
    let (_, body) = probe_call(&client, &gateway.base, Some(&token), path, blank).await;
    transcript.push_str(&body.to_string());
    assert_eq!(body["ok"], true, "{body}");
    assert_eq!(body["authenticated"], true);
    assert_eq!(
        catalogue.bearers("blank"),
        [Some("Bearer saved-key".to_owned())]
    );

    // A rejected key is explained rather than echoed as a bare status.
    let wrong = json!({"base_url": format!("{mock}/wrong/v1"), "api_key": "wrong-key"});
    let (status, body) = probe_call(&client, &gateway.base, Some(&token), path, wrong).await;
    transcript.push_str(&body.to_string());
    assert_eq!(
        status, 200,
        "an unhealthy router is data, not an error status"
    );
    assert_eq!(body["ok"], false);
    let error = body["error"].as_str().unwrap();
    assert!(
        error.contains("401") && error.contains("keyless free tier"),
        "{error}"
    );

    // A router that is down names the next step.
    let down = json!({"base_url": format!("http://127.0.0.1:{}/v1", closed_port().await)});
    let (status, body) = probe_call(&client, &gateway.base, Some(&token), path, down).await;
    transcript.push_str(&body.to_string());
    assert_eq!(status, 200);
    assert_eq!(body["ok"], false);
    let error = body["error"].as_str().unwrap();
    assert!(
        error.starts_with("Could not reach the router — start it, or correct the base URL."),
        "{error}"
    );

    // Requests that could never reach a router are refused before any connection.
    for (draft, message) in [
        ("file:///etc/passwd", "Base URL must be an http(s) URL"),
        (
            "http://user:pass@host/v1",
            "Base URL must not contain credentials",
        ),
        ("not a url", "Not a valid URL: http://not a url"),
    ] {
        let (status, body) = probe_call(
            &client,
            &gateway.base,
            Some(&token),
            path,
            json!({"base_url": draft}),
        )
        .await;
        transcript.push_str(&body.to_string());
        assert_eq!(status, 400, "{draft}: {body}");
        assert_eq!(body, json!({"ok": false, "error": message}), "{draft}");
    }

    // No key from any source ever comes back in a response.
    for key in ["env-key", "saved-key", "draft-key", "wrong-key"] {
        assert!(!transcript.contains(key), "{key} leaked into: {transcript}");
    }
}

#[tokio::test]
async fn backend_probe_reads_each_backend_catalogue_through_the_binary() {
    let catalogue = Catalogue::default();
    let mock = serve_catalogue(catalogue.clone()).await;
    let gateway = Gateway::start();
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .unwrap();
    let registered = client
        .post(format!("{}/api/auth/register", gateway.base))
        .json(&json!({"username": "backend-owner", "password": "owner-pass-123"}))
        .send()
        .await
        .unwrap();
    assert_eq!(registered.status(), 200);
    let token = registered.json::<Value>().await.unwrap()["access_token"]
        .as_str()
        .unwrap()
        .to_owned();
    let path = "/api/providers/backend/test";
    let call = |body: Value| {
        let (client, base, token) = (client.clone(), gateway.base.clone(), token.clone());
        async move { probe_call(&client, &base, Some(&token), path, body).await }
    };

    let (status, _) = probe_call(&client, &gateway.base, None, path, json!({})).await;
    assert_eq!(status, 401);

    // The settings page sends `backend`, and an unknown or missing one is named.
    for (body, message) in [
        (json!({"backend": "nope"}), "Unknown backend type: nope"),
        (json!({}), "Unknown backend type: (empty)"),
        (json!({"backend": 7}), "Unknown backend type: (empty)"),
    ] {
        let (status, answer) = call(body.clone()).await;
        assert_eq!(status, 400, "{body}");
        assert_eq!(answer, json!({"ok": false, "error": message}), "{body}");
    }

    // An OpenAI-compatible backend: the key is sent as a bearer and the default model is checked.
    let openai = json!({
        "backend": "openai", "base_url": format!("{mock}/openai/v1"),
        "api_key": "openai-secret", "model": "x/y",
    });
    let (status, body) = call(openai).await;
    assert_eq!(status, 200, "{body}");
    assert_eq!(body["ok"], true, "{body}");
    assert_eq!(body["backend"], "openai");
    assert_eq!(body["baseUrl"], format!("{mock}/openai/v1"));
    assert_eq!(body["modelCount"], 4);
    assert_eq!(body["authenticated"], true);
    assert_eq!(body["modelPresent"], true);
    assert_eq!(
        catalogue.bearers("openai"),
        [Some("Bearer openai-secret".to_owned())]
    );
    assert!(!body.to_string().contains("openai-secret"));
    let absent =
        json!({"backend": "openai", "base_url": format!("{mock}/openai/v1"), "model": "gone"});
    let (_, body) = call(absent).await;
    assert_eq!(
        (body["ok"].clone(), body["modelPresent"].clone()),
        (json!(true), json!(false))
    );
    assert_eq!(body["authenticated"], false);

    // Ollama lists its models at /api/tags by name.
    let (_, body) = call(json!({"backend": "ollama", "base_url": format!("{mock}/ollama")})).await;
    assert_eq!(body["ok"], true, "{body}");
    assert_eq!(body["sampleModels"], json!(["llama3:8b", "qwen3:4b"]));
    assert_eq!(body["modelCount"], 2);

    // A bare host is given a scheme, and a vLLM root gets its /v1 suffix.
    let bare = mock.trim_start_matches("http://").to_owned();
    let (_, body) = call(json!({"backend": "vllm", "base_url": bare})).await;
    assert_eq!(body["ok"], true, "{body}");
    assert_eq!(body["baseUrl"], format!("{mock}/v1"));

    // A wrong key and a missing catalogue each say what to fix.
    let (_, body) = call(json!({"backend": "openai", "base_url": format!("{mock}/wrong/v1"), "api_key": "wrong-key"})).await;
    assert_eq!(body["ok"], false);
    assert_eq!(
        body["error"],
        "The endpoint answered with an auth error — the API key was rejected or missing."
    );
    let (_, body) = call(json!({"backend": "openai", "base_url": format!("{mock}/nowhere")})).await;
    assert_eq!(body["ok"], false);
    let error = body["error"].as_str().unwrap();
    assert!(
        error.contains(&format!("HTTP 404 for {mock}/nowhere/models")),
        "{error}"
    );
    assert!(error.contains("usually serve it under /v1"), "{error}");
    let down = format!("http://127.0.0.1:{}/v1", closed_port().await);
    let (status, body) = call(json!({"backend": "openai", "base_url": down})).await;
    assert_eq!(status, 200);
    assert!(
        body["error"]
            .as_str()
            .unwrap()
            .starts_with("Could not reach the service."),
        "{body}"
    );

    // Requests that could never reach a service are refused before any connection.
    let (status, body) = call(json!({"backend": "openai", "base_url": "file:///etc/passwd"})).await;
    assert_eq!(status, 400);
    assert_eq!(
        body,
        json!({"ok": false, "error": "Base URL must be an http(s) URL"})
    );

    // OpenCode Go needs a key, and the key is proven by a real completion, not the public catalogue.
    let go = format!("{mock}/go/zen/go/v1");
    let (status, body) = call(json!({"backend": "opencode-go", "base_url": go})).await;
    assert_eq!(status, 400);
    assert_eq!(
        body,
        json!({"ok": false, "error": "Enter your OpenCode Go API key before testing."})
    );
    assert!(
        catalogue.bearers("go-catalogue").is_empty(),
        "no request without a key"
    );
    let (status, body) =
        call(json!({"backend": "opencode-go", "base_url": go, "api_key": "go-key"})).await;
    assert_eq!(status, 200, "{body}");
    assert_eq!(body["ok"], true, "{body}");
    assert_eq!(body["authenticated"], true);
    assert_eq!(body["modelCount"], 2);
    assert_eq!(
        catalogue.bearers("go-catalogue"),
        [Some("Bearer go-key".to_owned())]
    );
    assert_eq!(
        catalogue.bearers("go-completion"),
        [Some("Bearer go-key".to_owned())]
    );
    assert!(!body.to_string().contains("go-key"));
    let missing =
        json!({"backend": "opencode-go", "base_url": go, "api_key": "go-key", "model": "nope"});
    let (_, body) = call(missing).await;
    assert_eq!(
        body,
        json!({"ok": false, "error": "OpenCode Go does not offer model \"nope\"."})
    );
    assert_eq!(
        catalogue.bearers("go-completion").len(),
        1,
        "a model the service does not offer costs no completion"
    );
}

#[tokio::test]
async fn jait_models_include_the_authenticated_users_configured_instance() {
    let catalogue = Catalogue::default();
    let mock = serve_catalogue(catalogue.clone()).await;
    let gateway = Gateway::start();
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .unwrap();
    let registered = client
        .post(format!("{}/api/auth/register", gateway.base))
        .json(&json!({"username":"catalogue-owner", "password":"owner-pass-123"}))
        .send()
        .await
        .unwrap();
    assert_eq!(registered.status(), 200);
    let token = registered.json::<Value>().await.unwrap()["access_token"]
        .as_str()
        .unwrap()
        .to_owned();
    let instances = json!([
        { "id":"smoke", "type":"openai", "name":"Local model", "baseUrl":format!("{mock}/openai/v1"), "apiKey":"catalogue-secret", "model":"x/y" },
        { "id":"redirect", "type":"openai", "name":"Redirecting model", "baseUrl":format!("{mock}/redirect/v1"), "apiKey":"redirect-secret" }
    ]).to_string();
    let saved = client
        .patch(format!("{}/api/auth/settings", gateway.base))
        .bearer_auth(&token)
        .json(&json!({"api_keys":{"JAIT_BACKEND_INSTANCES":instances}}))
        .send()
        .await
        .unwrap();
    assert_eq!(saved.status(), 200);
    let response = client
        .get(format!("{}/api/providers/jait/models", gateway.base))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    assert_eq!(
        response.headers()[reqwest::header::CACHE_CONTROL],
        "no-store"
    );
    let body = response.json::<Value>().await.unwrap();
    let ids: Vec<&str> = body["models"]
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|m| m["id"].as_str())
        .collect();
    assert!(
        ids.contains(&"jait://openai/smoke/x%2Fy"),
        "configured model missing; actual ids: {ids:?}"
    );
    assert!(!body.to_string().contains("catalogue-secret"));
    assert!(!body.to_string().contains("redirect-secret"));
    assert_eq!(
        catalogue.bearers("redirect"),
        vec![Some("Bearer redirect-secret".to_owned())]
    );
    assert!(
        catalogue.bearers("destination").is_empty(),
        "catalogue redirects must not be followed"
    );
    assert!(
        catalogue
            .bearers("openai")
            .contains(&Some("Bearer catalogue-secret".to_owned()))
    );

    let invitation = client
        .post(format!("{}/api/auth/invitations", gateway.base))
        .bearer_auth(&token)
        .json(&json!({}))
        .send()
        .await
        .unwrap();
    assert_eq!(invitation.status(), 200);
    let invitation = invitation.json::<Value>().await.unwrap()["invitation"].clone();
    let other = client
        .post(format!("{}/api/auth/register", gateway.base))
        .json(&json!({"username":"catalogue-other", "password":"owner-pass-123", "invitation":invitation}))
        .send()
        .await
        .unwrap();
    assert_eq!(other.status(), 200);
    let other_token = other.json::<Value>().await.unwrap()["access_token"]
        .as_str()
        .unwrap()
        .to_owned();
    let other_models = client
        .get(format!("{}/api/providers/jait/models", gateway.base))
        .bearer_auth(other_token)
        .send()
        .await
        .unwrap();
    assert_eq!(other_models.status(), 200);
    let other_body = other_models.json::<Value>().await.unwrap();
    assert!(
        !other_body.to_string().contains("jait://openai/smoke/x%2Fy"),
        "another user must not see the owner's configured instance"
    );
    assert!(!other_body.to_string().contains("catalogue-secret"));
}
