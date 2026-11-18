//! Lane contract test: native `providers::acp_registry` against
//! `packages/gateway/src/providers/acp-registry.ts`.
//!
//! Differential cases run the real TypeScript exports through
//! `tests/contract/drivers/nativeacpregistry.ts` against an owned loopback fixture, and run the
//! native port against an equivalent owned loopback fixture on `127.0.0.1:0`. Native-only cases
//! cover branches that cannot be observed differentially without mutating host state
//! (disabled short-circuit, single-flight/TTL-free memory cache, cache-file variants).
#[path = "../src/internal_driver.rs"]
mod internal_driver;

use axum::{
    Router,
    extract::State,
    http::{HeaderMap, StatusCode, Uri, header},
    response::IntoResponse,
    routing::get,
};
use jait_gateway::providers::acp_registry::*;
use serde_json::{Value, json};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::{
        Arc, Mutex,
        atomic::{AtomicUsize, Ordering},
    },
    time::Duration,
};

fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}

fn scratch(tag: &str) -> PathBuf {
    let directory = root()
        .join(".jait/artifacts/gateway-rust/parallel-20261020/acp-registry")
        .join(tag)
        .join(uuid::Uuid::new_v4().to_string());
    fs::create_dir_all(&directory).unwrap();
    directory
}

/// Runs a batch of driver calls, splitting at `batch` so every Bun process stays inside the
/// driver's ten-second deadline.
fn reference(calls: Vec<Value>, tag: &str, batch: usize) -> Vec<Value> {
    let mut results = Vec::new();
    for chunk in calls.chunks(batch) {
        let value = internal_driver::call(
            &root(),
            &scratch(tag),
            json!({"version": 1, "calls": chunk}),
            &|| false,
        )
        .unwrap();
        let items = value.as_array().cloned().unwrap_or_default();
        assert_eq!(items.len(), chunk.len(), "reference batch size for {tag}");
        results.extend(items);
    }
    results
}

/// The registry body both sides serve. Mirrors `OK_REGISTRY` in the lane driver.
fn ok_registry() -> Value {
    json!({
        "schemaVersion": 1,
        "agents": [
            {
                "id": "codex-acp",
                "name": "Zed Codex",
                "version": "1.2.3",
                "description": "Codex agent",
                "icon": "https://icons.test/codex.png",
                "website": "https://codex.test/docs",
                "repository": "http://insecure.test/repo",
                "distribution": {
                    "npx": {
                        "package": " @zed/codex-acp ",
                        "args": ["--stdio", "bad\narg", 7],
                        "env": {"CODEX_HOME": "/x", "1bad": "y", "OK_NUM": 3}
                    }
                }
            },
            {
                "id": "gemini",
                "name": "alpha Gemini",
                "version": " 2.0.0 ",
                "description": " Gemini agent ",
                "distribution": {"uvx": {"package": "gemini-acp", "args": []}}
            }
        ]
    })
}

fn fallback_definitions() -> Vec<Value> {
    vec![
        json!({
            "id": "extra",
            "providerType": "acp",
            "name": "Aardvark",
            "description": "bundled extra",
            "command": "extra-bin",
            "args": [],
            "env": {},
            "auth": "acp"
        }),
        json!({
            "id": "gemini",
            "providerType": "acp",
            "name": "Bundled Gemini",
            "description": "bundled gemini",
            "command": "bundled-gemini",
            "args": ["--stdio"],
            "env": {},
            "auth": "acp"
        }),
    ]
}

/// A fallback list that is deliberately unsorted and keeps an `auth: false` entry: the disabled
/// short-circuit must return it verbatim, without sorting or filtering.
fn unsorted_fallback() -> Vec<Value> {
    vec![
        json!({
            "id": "zzz",
            "providerType": "acp",
            "name": "zzz hidden",
            "description": "hidden",
            "command": "hidden",
            "args": [],
            "env": {},
            "auth": false
        }),
        json!({
            "id": "aaa",
            "providerType": "acp",
            "name": "Aardvark",
            "description": "first",
            "command": "aardvark",
            "args": [],
            "env": {},
            "auth": "acp"
        }),
    ]
}

// ---------------------------------------------------------------------------------------------
// Owned loopback fixture
// ---------------------------------------------------------------------------------------------

#[derive(Clone)]
struct Fixture {
    route: &'static str,
    hits: Arc<AtomicUsize>,
    accept: Arc<Mutex<Option<String>>>,
    user_agent: Arc<Mutex<Option<String>>>,
}

struct Server {
    address: String,
    hits: Arc<AtomicUsize>,
    accept: Arc<Mutex<Option<String>>>,
    user_agent: Arc<Mutex<Option<String>>>,
    handle: tokio::task::JoinHandle<()>,
}

impl Server {
    fn url(&self) -> String {
        format!("http://{}/registry.json", self.address)
    }
    fn requests(&self) -> usize {
        self.hits.load(Ordering::SeqCst)
    }
    fn stop(self) {
        self.handle.abort();
    }
}

async fn start(route: &'static str) -> Server {
    let hits = Arc::new(AtomicUsize::new(0));
    let fixture = Fixture {
        route,
        hits: hits.clone(),
        accept: Arc::new(Mutex::new(None)),
        user_agent: Arc::new(Mutex::new(None)),
    };
    let app = Router::new()
        .route("/registry.json", get(serve))
        .with_state(fixture.clone());
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap().to_string();
    let handle = tokio::spawn(async move {
        let _ = axum::serve(listener, app).await;
    });
    Server {
        address,
        hits,
        accept: fixture.accept,
        user_agent: fixture.user_agent,
        handle,
    }
}

async fn serve(State(fixture): State<Fixture>, headers: HeaderMap, uri: Uri) -> impl IntoResponse {
    fixture.hits.fetch_add(1, Ordering::SeqCst);
    if let Some(value) = headers.get("accept").and_then(|value| value.to_str().ok()) {
        *fixture.accept.lock().unwrap() = Some(value.to_string());
    }
    if let Some(value) = headers
        .get("user-agent")
        .and_then(|value| value.to_str().ok())
    {
        *fixture.user_agent.lock().unwrap() = Some(value.to_string());
    }
    if fixture.route == "redirect" {
        let hop = uri
            .query()
            .and_then(|query| query.strip_prefix("hop="))
            .and_then(|value| value.parse::<usize>().ok())
            .unwrap_or(0);
        if hop < 12 {
            return (
                StatusCode::FOUND,
                [(header::LOCATION, format!("/registry.json?hop={}", hop + 1))],
            )
                .into_response();
        }
    }
    if fixture.route == "invalid-oversize" {
        let mut body = serde_json::to_string(&ok_registry()).unwrap().into_bytes();
        body.pop();
        body.extend_from_slice(b",\"pad\":\"");
        body.extend(vec![0xff; 800_000]);
        body.extend_from_slice(b"\"}");
        return (StatusCode::OK, body).into_response();
    }
    if fixture.route == "slow" {
        tokio::time::sleep(Duration::from_millis(300)).await;
    }
    let (status, body) = body_for(fixture.route);
    (
        StatusCode::from_u16(status).unwrap(),
        [(header::CONTENT_TYPE, "application/json")],
        body,
    )
        .into_response()
}

fn body_for(route: &str) -> (u16, String) {
    match route {
        "bom" => (
            200,
            format!("\u{feff}{}", serde_json::to_string(&ok_registry()).unwrap()),
        ),
        "ok" | "slow" | "redirect" => (200, serde_json::to_string(&ok_registry()).unwrap()),
        "http500" => (500, "{\"error\":\"boom\"}".to_string()),
        "http404" => (404, "missing".to_string()),
        "badjson" => (200, "not json at all".to_string()),
        "empty" => (200, "{\"agents\":[]}".to_string()),
        "notobject" => (200, "[1,2,3]".to_string()),
        "oversize" => (
            200,
            format!(
                "{{\"agents\":[],\"pad\":\"{}\"}}",
                "x".repeat(2 * 1024 * 1024)
            ),
        ),
        other => (404, format!("unknown route {other}")),
    }
}

async fn closed_port_url() -> String {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap().to_string();
    drop(listener);
    format!("http://{}/registry.json", address)
}

// ---------------------------------------------------------------------------------------------
// Native harness
// ---------------------------------------------------------------------------------------------

fn runtime_with(
    home: &Path,
    state_dir: Option<String>,
    registry_url: Option<String>,
    disabled: Option<String>,
    timeout: Duration,
) -> RegistryRuntime {
    let mut runtime = RegistryRuntime::from_process();
    runtime.home = home.to_path_buf();
    runtime.state_dir_env = state_dir;
    runtime.registry_url_env = registry_url;
    runtime.disabled_env = disabled;
    runtime.fetch_timeout = timeout;
    runtime
}

#[allow(clippy::type_complexity)]
fn client_for(runtime: RegistryRuntime) -> (AcpRegistry, Arc<Mutex<Vec<(String, String)>>>) {
    let log: Arc<Mutex<Vec<(String, String)>>> = Arc::new(Mutex::new(Vec::new()));
    let sink = log.clone();
    let registry = AcpRegistry::with_warn(
        runtime,
        Arc::new(move |warning: &RegistryWarning| {
            sink.lock()
                .unwrap()
                .push((warning.message.to_string(), warning.detail.clone()));
        }),
    );
    (registry, log)
}

fn warnings(log: &Arc<Mutex<Vec<(String, String)>>>) -> Value {
    let entries = log.lock().unwrap();
    Value::Array(
        entries
            .iter()
            .map(|(message, detail)| {
                json!({
                    "message": message,
                    "detailKind": if detail.starts_with("ACP registry") {
                        detail.clone()
                    } else {
                        "other".to_string()
                    },
                })
            })
            .collect(),
    )
}

fn mode(metadata: &fs::Metadata) -> u64 {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        metadata.permissions().mode() as u64 & 0o777
    }
    #[cfg(not(unix))]
    {
        let _ = metadata;
        0
    }
}

fn cache_info(path: Option<&Path>) -> Value {
    let Some(path) = path else {
        return Value::Null;
    };
    match fs::read_to_string(path) {
        Ok(text) => {
            let file = fs::metadata(path).unwrap();
            let directory = fs::metadata(path.parent().unwrap()).unwrap();
            json!({
                "exists": true,
                "text": text,
                "mode": mode(&file),
                "dirMode": mode(&directory),
            })
        }
        Err(_) => json!({"exists": false}),
    }
}

async fn observe(
    registry: &AcpRegistry,
    options: &LoadAcpRegistryOptions,
    cache_path: Option<&Path>,
    log: &Arc<Mutex<Vec<(String, String)>>>,
    server: Option<&Server>,
    sequential: usize,
    concurrency: usize,
) -> Value {
    let mut results: Vec<Value> = Vec::new();
    if concurrency > 1 {
        let mut handles = Vec::new();
        for _ in 0..concurrency {
            let registry = registry.clone();
            let options = options.clone();
            handles.push(tokio::spawn(async move {
                match registry.load(options).await {
                    Ok(providers) => json!({"ok": providers}),
                    Err(error) => json!({"error": error}),
                }
            }));
        }
        for handle in handles {
            results.push(handle.await.unwrap());
        }
    } else {
        for _ in 0..sequential.max(1) {
            results.push(match registry.load(options.clone()).await {
                Ok(providers) => json!({"ok": providers}),
                Err(error) => json!({"error": error}),
            });
        }
    }
    json!({
        "results": results,
        "warns": warnings(log),
        "requests": server.map(Server::requests).unwrap_or(0),
        "cache": cache_info(cache_path),
        "cachePath": cache_path
            .map(|path| Value::String(path.to_string_lossy().into_owned()))
            .unwrap_or(Value::Null),
    })
}

/// Normalises observations that legitimately differ between the two runtimes: cache bytes are
/// compared as parsed JSON (serde_json writes sorted object keys), error strings are only compared
/// as "an error", and the per-host driver HTTP headers/cache path are dropped. The driver does not
/// return headers for the native side, so removing the key is a no-op there.
fn comparable(observation: &Value) -> Value {
    let mut value = observation.clone();
    if let Some(object) = value.as_object_mut() {
        object.remove("headers");
        object.remove("cachePath");
        if let Some(results) = object.get_mut("results").and_then(Value::as_array_mut) {
            for entry in results {
                let Some(map) = entry.as_object_mut() else {
                    continue;
                };
                if map.contains_key("error") {
                    map.insert("error".to_string(), Value::String("<error>".to_string()));
                }
            }
        }
        if let Some(cache) = object.get_mut("cache").and_then(Value::as_object_mut) {
            let text = cache
                .get("text")
                .and_then(Value::as_str)
                .map(str::to_string);
            if let Some(text) = text {
                let parsed = serde_json::from_str::<Value>(&text)
                    .unwrap_or_else(|_| Value::String(text.clone()));
                cache.insert("text".to_string(), parsed);
            }
        }
    }
    value
}

// ---------------------------------------------------------------------------------------------
// Differential: loadAcpRegistryProviderConfigs
// ---------------------------------------------------------------------------------------------

#[derive(Clone, Copy, PartialEq, Eq)]
enum Fallback {
    None,
    Bundled,
    Unsorted,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Seed {
    None,
    Registry,
    EmptyAgents,
    Corrupt,
}

#[derive(Clone, Copy)]
struct Spec {
    label: &'static str,
    route: &'static str,
    cache: &'static str,
    fallback: Fallback,
    prefer: bool,
    force: bool,
    sequential: usize,
    concurrency: usize,
    disabled: bool,
    url_from_env: bool,
    seed: Seed,
    state_relative: bool,
}

const fn spec(label: &'static str, route: &'static str) -> Spec {
    Spec {
        label,
        route,
        cache: "default",
        fallback: Fallback::None,
        prefer: false,
        force: false,
        sequential: 1,
        concurrency: 0,
        disabled: false,
        url_from_env: false,
        seed: Seed::None,
        state_relative: false,
    }
}

fn specs() -> Vec<Spec> {
    vec![
        Spec {
            cache: "explicit",
            ..spec("ok-explicit", "ok")
        },
        spec("ok-default", "ok"),
        spec("twelve-redirects", "redirect"),
        spec("decoded-size-ceiling", "invalid-oversize"),
        Spec {
            cache: "explicit",
            ..spec("bom", "bom")
        },
        Spec {
            cache: "explicit",
            ..spec("http500", "http500")
        },
        Spec {
            cache: "explicit",
            fallback: Fallback::Bundled,
            ..spec("http500-fallback", "http500")
        },
        spec("http404", "http404"),
        spec("badjson", "badjson"),
        spec("empty", "empty"),
        spec("notobject", "notobject"),
        spec("oversize", "oversize"),
        spec("refused", "refused"),
        Spec {
            cache: "explicit",
            fallback: Fallback::Bundled,
            ..spec("fallback-merge", "ok")
        },
        Spec {
            cache: "explicit",
            fallback: Fallback::Bundled,
            prefer: true,
            ..spec("fallback-preferred", "ok")
        },
        Spec {
            cache: "explicit",
            fallback: Fallback::Unsorted,
            disabled: true,
            ..spec("disabled", "ok")
        },
        Spec {
            cache: "explicit",
            sequential: 2,
            ..spec("sequential-cache", "ok")
        },
        Spec {
            cache: "explicit",
            sequential: 2,
            force: true,
            ..spec("sequential-force", "ok")
        },
        Spec {
            cache: "explicit",
            concurrency: 3,
            ..spec("concurrent", "ok")
        },
        Spec {
            cache: "explicit",
            seed: Seed::Registry,
            ..spec("stale-cache-fallback", "http500")
        },
        Spec {
            cache: "explicit",
            seed: Seed::EmptyAgents,
            ..spec("empty-cache-fallback", "empty")
        },
        Spec {
            cache: "explicit",
            seed: Seed::Corrupt,
            ..spec("corrupt-cache", "ok")
        },
        Spec {
            url_from_env: true,
            ..spec("url-env-empty", "ok")
        },
        Spec {
            cache: "null",
            ..spec("cache-null", "ok")
        },
        Spec {
            state_relative: true,
            ..spec("state-relative", "ok")
        },
    ]
}

fn fallback_for(kind: Fallback) -> Vec<Value> {
    match kind {
        Fallback::None => Vec::new(),
        Fallback::Bundled => fallback_definitions(),
        Fallback::Unsorted => unsorted_fallback(),
    }
}

fn seed_text(kind: Seed) -> Option<String> {
    match kind {
        Seed::None => None,
        Seed::Registry => Some(serde_json::to_string(&ok_registry()).unwrap()),
        Seed::EmptyAgents => Some("{\"agents\":[]}".to_string()),
        Seed::Corrupt => Some("not json at all".to_string()),
    }
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn load_matches_typescript_across_http_cache_and_merge_scenarios() {
    let base = scratch("load");
    let specs = specs();
    let mut cases: Vec<(Spec, Value, String)> = Vec::new();
    for (index, spec) in specs.into_iter().enumerate() {
        let directory = base.join(format!("case-{index}"));
        fs::create_dir_all(&directory).unwrap();
        let explicit = spec.cache == "explicit";
        let driver_cache = explicit.then(|| directory.join("driver-cache.json"));
        if let (Some(path), Some(text)) = (&driver_cache, seed_text(spec.seed)) {
            fs::write(path, text).unwrap();
        }
        let mut scenario = json!({
            "route": spec.route,
            "cache": spec.cache,
            "fallback": fallback_for(spec.fallback),
            "prefer": spec.prefer,
            "force": spec.force,
            "sequential": spec.sequential,
            "concurrency": spec.concurrency,
        });
        if let Some(path) = &driver_cache {
            scenario["cachePath"] = json!(path.to_string_lossy());
        }
        scenario["env"] =
            json!({"JAIT_STATE_DIR": directory.join("driver-state").to_string_lossy()});
        if spec.disabled {
            scenario["env"]["JAIT_ACP_REGISTRY_DISABLED"] = json!("1");
        }
        if spec.url_from_env {
            scenario["registryUrlMode"] = json!("env");
            scenario["env"]["JAIT_ACP_REGISTRY_URL"] = json!("");
        }
        if spec.state_relative {
            scenario["env"]["JAIT_STATE_DIR"] = json!("relative/state");
        }
        cases.push((spec, scenario, directory.to_string_lossy().into_owned()));
    }

    let expected = reference(
        cases
            .iter()
            .map(|(_, scenario, _)| json!({"op": "nativeacpregistry.load", "scenario": scenario}))
            .collect(),
        "load",
        1,
    );
    assert_eq!(expected.len(), cases.len());

    for (index, (spec, _, directory)) in cases.iter().enumerate() {
        let directory = PathBuf::from(directory);
        let server = if spec.route == "refused" {
            None
        } else {
            Some(start(spec.route).await)
        };
        let url = match &server {
            Some(server) => server.url(),
            None => closed_port_url().await,
        };
        let native_cache = (spec.cache == "explicit").then(|| directory.join("native-cache.json"));
        if let (Some(path), Some(text)) = (&native_cache, seed_text(spec.seed)) {
            fs::write(path, text).unwrap();
        }
        let state_dir = if spec.state_relative {
            Some("relative/state".to_string())
        } else {
            Some(directory.join("state").to_string_lossy().into_owned())
        };
        let runtime = runtime_with(
            &directory.join("home"),
            state_dir,
            spec.url_from_env.then(String::new),
            spec.disabled.then(|| "1".to_string()),
            Duration::from_millis(5_000),
        );
        let (client, log) = client_for(runtime);
        let options = LoadAcpRegistryOptions {
            fallback_definitions: fallback_for(spec.fallback),
            registry_url: (!spec.url_from_env).then(|| url.clone()),
            cache_file: match native_cache.as_ref() {
                Some(path) => CacheFile::Explicit(path.clone()),
                None if spec.cache == "null" => CacheFile::Disabled,
                None => CacheFile::DefaultPath,
            },
            force: spec.force,
            prefer_fallback_definitions: spec.prefer,
        };
        let actual = observe(
            &client,
            &options,
            native_cache.as_deref(),
            &log,
            server.as_ref(),
            spec.sequential,
            spec.concurrency,
        )
        .await;
        if let Some(server) = server {
            server.stop();
        }
        assert_eq!(
            comparable(&actual),
            comparable(&expected[index]),
            "reference case {}",
            spec.label
        );
    }
}

// ---------------------------------------------------------------------------------------------
// Differential: parseAcpRegistry
// ---------------------------------------------------------------------------------------------

fn parse_values() -> Vec<Value> {
    let mut values = vec![
        ok_registry(),
        json!({"schemaVersion": 2, "agents": [
            {"id": "solo", "name": "Solo", "version": 7, "distribution": {"uvx": {"package": "solo-acp"}}}
        ]}),
        json!({"agents": []}),
        json!({"agents": "nope"}),
        json!({"agents": {}}),
        json!([1, 2, 3]),
        json!(null),
        json!({"agents": [{"name": "No id", "distribution": {"npx": {"package": "x"}}}]}),
        json!({"agents": [{"id": "off", "name": "Disabled", "auth": false, "distribution": {"npx": {"package": "x"}}}]}),
        json!({"agents": [
            {"id": "dup", "name": "Dup one", "distribution": {"npx": {"package": "one"}}},
            {"id": "dup", "name": "Dup two", "distribution": {"npx": {"package": "two"}}}
        ]}),
        json!({"agents": [{"id": "nothing", "name": "Nothing"}]}),
        json!({"agents": [{"id": "emptydist", "name": "Empty dist", "distribution": {}}]}),
        json!({"agents": [{"id": "escape", "name": "Escape", "distribution": {"npx": {"package": "../evil"}}}]}),
        json!({"agents": [{"id": "abs", "name": "Absolute", "distribution": {"uvx": {"package": "/usr/bin/evil"}}}]}),
        json!({"agents": [
            {"id": "unicode-a", "name": "\u{00c4} first", "distribution": {"npx": {"package": "a"}}},
            {"id": "unicode-b", "name": "b lower", "distribution": {"npx": {"package": "b"}}},
            {"id": "unicode-c", "name": "B upper", "distribution": {"npx": {"package": "c"}}}
        ]}),
        json!({"agents": [{"id": "both", "name": "Both", "distribution": {
            "npx": {"package": "npx-package"},
            "uvx": {"package": "uvx-package"}
        }}]}),
        json!({"agents": [{"id": 5, "name": "Numeric id", "distribution": {"npx": {"package": "x"}}}]}),
        json!({"agents": [null, 3, "text"]}),
        // Collation vector: every pair here separates ICU from byte or case-fold ordering, and
        // `tie-a`/`tie-b` are canonically equivalent, so the expected order is only reachable with
        // real `localeCompare` plus a stable sort.
        json!({"agents": [
            {"id": "c-zebra", "name": "Zebra", "distribution": {"npx": {"package": "z"}}},
            {"id": "c-apple", "name": "apple", "distribution": {"npx": {"package": "a"}}},
            {"id": "c-aepfel", "name": "\u{00c4}pfel", "distribution": {"npx": {"package": "ae"}}},
            {"id": "c-uber", "name": "Uber", "distribution": {"npx": {"package": "u"}}},
            {"id": "c-ueber", "name": "\u{00dc}ber", "distribution": {"npx": {"package": "ue"}}},
            {"id": "c-coop-hyphen", "name": "co-op", "distribution": {"npx": {"package": "c1"}}},
            {"id": "c-coop", "name": "coop", "distribution": {"npx": {"package": "c2"}}},
            {"id": "c-agent10", "name": "agent10", "distribution": {"npx": {"package": "n1"}}},
            {"id": "c-agent2", "name": "agent2", "distribution": {"npx": {"package": "n2"}}},
            {"id": "tie-a", "name": "caf\u{00e9}", "distribution": {"npx": {"package": "t1"}}},
            {"id": "tie-b", "name": "cafe\u{0301}", "distribution": {"npx": {"package": "t2"}}}
        ]}),
    ];
    // Supply valid common fields so these vectors reach the distribution and sort paths.
    // Required-field rejection is tested separately below.
    for value in &mut values {
        if let Some(agents) = value.get_mut("agents").and_then(Value::as_array_mut) {
            for agent in agents {
                if let Some(object) = agent.as_object_mut() {
                    object.entry("version").or_insert(json!("1.0.0"));
                    object
                        .entry("description")
                        .or_insert(json!("Registry test agent"));
                }
            }
        }
    }
    let valid = ok_registry()["agents"][0].clone();
    for field in ["id", "name", "version", "description", "distribution"] {
        for invalid in [Value::Null, json!(""), json!(" "), json!(7), json!([])] {
            let mut agent = valid.clone();
            agent[field] = invalid;
            values.push(json!({"agents": [agent]}));
        }
        let mut agent = valid.clone();
        agent.as_object_mut().unwrap().remove(field);
        values.push(json!({"agents": [agent]}));
    }
    for id in [
        "Upper",
        "1first",
        "a_b",
        "a.b",
        "a/b",
        "-prefix",
        "a\ninside",
    ] {
        let mut agent = valid.clone();
        agent["id"] = json!(id);
        values.push(json!({"agents": [agent]}));
    }
    let target = current_platform_target(
        &RegistryRuntime::from_process().platform,
        RegistryRuntime::from_process().architecture.as_deref(),
    )
    .unwrap();
    for cmd in [
        "./agent",
        "dir\\agent",
        "../escape",
        "dir/../escape",
        "/absolute",
        "C:/absolute",
        "C:relative",
        "dir\\..\\escape",
        "agent\narg",
    ] {
        for checksum in [
            json!(null),
            json!(""),
            json!("a".repeat(64)),
            json!("A".repeat(64)),
            json!("bad"),
            json!(7),
        ] {
            let mut agent = valid.clone();
            agent["distribution"] = json!({"binary": {target.clone(): {"archive": "https://download.test:443/a b.tar.gz", "cmd": cmd, "args": ["", "--stdio", 1, "bad\narg"], "env": {"GOOD": "x", "1bad": "bad", "EMPTY": "", "__proto__": "kept"}, "sha256": checksum}}});
            values.push(json!({"agents": [agent]}));
        }
    }
    for id in ["constructor", "claude-acp", "codex-acp", "pi-acp"] {
        let mut agent = valid.clone();
        agent["id"] = json!(id);
        values.push(json!({"agents": [agent.clone(), agent]}));
    }
    values
}

#[test]
fn parse_matches_typescript_for_valid_and_adversarial_registries() {
    let values = parse_values();
    let directory = scratch("parse-state");
    let mut runtime = RegistryRuntime::from_process();
    runtime.state_dir_env = Some(directory.to_string_lossy().into_owned());
    runtime.launcher = LauncherAdapter::configured("test-launcher", vec![]);
    let expected = reference(
        vec![
            json!({"op": "nativeacpregistry.parse", "values": values, "launchProjection": true, "env": {"JAIT_STATE_DIR": directory.to_string_lossy()}}),
        ],
        "parse",
        1,
    );
    let expected = expected[0].as_array().cloned().unwrap();
    assert_eq!(expected.len(), values.len());
    assert_eq!(expected[0]["ok"].as_array().unwrap().len(), 2);
    assert_eq!(expected[18]["ok"].as_array().unwrap().len(), 11);
    assert!(expected.iter().any(|v| {
        v["ok"]
            .as_array()
            .is_some_and(|a| a.iter().any(|p| p["registry"]["distribution"] == "binary"))
    }));

    for (index, value) in values.iter().enumerate() {
        let actual = match parse_acp_registry_with(value, &runtime) {
            Ok(providers) => json!({"ok": providers}),
            Err(error) => json!({"error": error}),
        };
        assert_eq!(
            comparable(&actual),
            comparable(&expected[index]),
            "parse value {index}: {value}"
        );
    }
}

// ---------------------------------------------------------------------------------------------
// Native-only coverage
// ---------------------------------------------------------------------------------------------

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn disabled_short_circuits_without_network_or_filtering() {
    let directory = scratch("disabled-native");
    let server = start("ok").await;
    let runtime = runtime_with(
        &directory.join("home"),
        Some(directory.join("state").to_string_lossy().into_owned()),
        Some(server.url()),
        Some("1".to_string()),
        Duration::from_millis(5_000),
    );
    let (client, log) = client_for(runtime);
    let options = LoadAcpRegistryOptions {
        fallback_definitions: unsorted_fallback(),
        registry_url: Some(server.url()),
        cache_file: CacheFile::Explicit(directory.join("cache.json")),
        force: true,
        prefer_fallback_definitions: true,
    };
    let providers = client.load(options).await.unwrap();
    assert_eq!(
        providers,
        unsorted_fallback(),
        "disabled returns the fallback verbatim"
    );
    assert_eq!(server.requests(), 0, "disabled must not touch the network");
    assert!(log.lock().unwrap().is_empty(), "disabled must not warn");
    assert!(
        !directory.join("cache.json").exists(),
        "disabled must not write a cache"
    );
    server.stop();
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn memory_cache_is_single_flight_and_force_refetches() {
    let directory = scratch("cache-native");
    let server = start("ok").await;
    let url = server.url();
    let runtime = runtime_with(
        &directory.join("home"),
        Some(directory.join("state").to_string_lossy().into_owned()),
        Some(url.clone()),
        None,
        Duration::from_millis(5_000),
    );
    let (client, log) = client_for(runtime);
    let cache = directory.join("cache").join("acp-registry.json");
    let options = LoadAcpRegistryOptions {
        fallback_definitions: Vec::new(),
        registry_url: Some(url.clone()),
        cache_file: CacheFile::Explicit(cache.clone()),
        force: false,
        prefer_fallback_definitions: false,
    };

    let first = client.load(options.clone()).await.unwrap();
    assert!(!first.is_empty(), "ok registry yields providers");
    assert_eq!(server.requests(), 1);
    assert!(cache.exists(), "explicit cache file is written");
    let cached = fs::read_to_string(&cache).unwrap();
    assert_eq!(
        serde_json::from_str::<Value>(&cached).unwrap(),
        ok_registry(),
        "cache stores the raw response body"
    );

    let second = client.load(options.clone()).await.unwrap();
    assert_eq!(second, first);
    assert_eq!(
        server.requests(),
        1,
        "a warm memory cache avoids a second request"
    );

    let forced = client
        .load(LoadAcpRegistryOptions {
            force: true,
            ..options.clone()
        })
        .await
        .unwrap();
    assert_eq!(forced, first);
    assert_eq!(server.requests(), 2, "force bypasses the memory cache");

    let uncached = client
        .load(LoadAcpRegistryOptions {
            force: true,
            cache_file: CacheFile::Disabled,
            ..options
        })
        .await
        .unwrap();
    assert_eq!(uncached, first);
    assert_eq!(server.requests(), 3);
    assert!(
        log.lock().unwrap().is_empty(),
        "a healthy registry never warns"
    );

    let (concurrent, concurrent_log) = client_for(runtime_with(
        &directory.join("home"),
        Some(directory.join("state").to_string_lossy().into_owned()),
        Some(url.clone()),
        None,
        Duration::from_millis(5_000),
    ));
    let mut handles = Vec::new();
    for _ in 0..3 {
        let concurrent = concurrent.clone();
        let target = url.clone();
        handles.push(tokio::spawn(async move {
            concurrent
                .load(LoadAcpRegistryOptions {
                    force: false,
                    cache_file: CacheFile::Disabled,
                    registry_url: Some(target),
                    fallback_definitions: Vec::new(),
                    prefer_fallback_definitions: false,
                })
                .await
                .unwrap()
        }));
    }
    let mut joined = Vec::new();
    for handle in handles {
        joined.push(handle.await.unwrap());
    }
    assert_eq!(
        server.requests(),
        4,
        "concurrent loads share one in-flight request"
    );
    for providers in &joined {
        assert_eq!(providers, &first);
    }
    assert!(concurrent_log.lock().unwrap().is_empty());
    server.stop();
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn stale_cache_survives_a_failing_registry_and_corruption_is_reported() {
    let directory = scratch("stale-native");
    let cache = directory.join("cache.json");
    fs::write(&cache, serde_json::to_string(&ok_registry()).unwrap()).unwrap();
    let server = start("http500").await;
    let runtime = runtime_with(
        &directory.join("home"),
        Some(directory.join("state").to_string_lossy().into_owned()),
        Some(server.url()),
        None,
        Duration::from_millis(5_000),
    );
    let (client, log) = client_for(runtime);
    let options = LoadAcpRegistryOptions {
        fallback_definitions: Vec::new(),
        registry_url: Some(server.url()),
        cache_file: CacheFile::Explicit(cache.clone()),
        force: true,
        prefer_fallback_definitions: false,
    };
    let providers = client.load(options.clone()).await.unwrap();
    assert_eq!(
        providers.len(),
        2,
        "a readable non-empty cache is served when the registry fails"
    );
    assert!(
        log.lock().unwrap().is_empty(),
        "cache fallback does not warn"
    );

    let corrupt = directory.join("corrupt.json");
    fs::write(&corrupt, "<not json>").unwrap();
    let (client, log) = client_for(runtime_with(
        &directory.join("home"),
        Some(directory.join("state").to_string_lossy().into_owned()),
        Some(server.url()),
        None,
        Duration::from_millis(5_000),
    ));
    let providers = client
        .load(LoadAcpRegistryOptions {
            cache_file: CacheFile::Explicit(corrupt),
            ..options
        })
        .await
        .unwrap();
    assert!(providers.is_empty(), "a corrupt cache is ignored");
    assert_eq!(
        warnings(&log),
        json!([{
            "message": REGISTRY_UNAVAILABLE_WARNING,
            "detailKind": "ACP registry returned HTTP 500",
        }]),
        "an unusable cache falls through to the registry warning"
    );
    server.stop();
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn fetch_timeout_is_reported_as_a_transport_warning() {
    let directory = scratch("timeout-native");
    let server = start("slow").await;
    let runtime = runtime_with(
        &directory.join("home"),
        Some(directory.join("state").to_string_lossy().into_owned()),
        Some(server.url()),
        None,
        Duration::from_millis(1),
    );
    let (client, log) = client_for(runtime);
    let started = std::time::Instant::now();
    let providers = client
        .load(LoadAcpRegistryOptions {
            fallback_definitions: Vec::new(),
            registry_url: Some(server.url()),
            cache_file: CacheFile::Disabled,
            force: true,
            prefer_fallback_definitions: false,
        })
        .await
        .unwrap();
    assert!(providers.is_empty());
    assert!(
        started.elapsed() < Duration::from_secs(5),
        "the injected fetch timeout bounds the request"
    );
    assert_eq!(
        warnings(&log),
        json!([{"message": REGISTRY_UNAVAILABLE_WARNING, "detailKind": "other"}])
    );
    server.stop();
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn requests_carry_an_accept_and_user_agent_header() {
    let directory = scratch("headers-native");
    let server = start("ok").await;
    let runtime = runtime_with(
        &directory.join("home"),
        Some(directory.join("state").to_string_lossy().into_owned()),
        Some(server.url()),
        None,
        Duration::from_millis(5_000),
    );
    let (client, _) = client_for(runtime);
    client
        .load(LoadAcpRegistryOptions {
            registry_url: Some(server.url()),
            cache_file: CacheFile::Disabled,
            ..LoadAcpRegistryOptions::default()
        })
        .await
        .unwrap();
    assert_eq!(
        server.accept.lock().unwrap().as_deref(),
        Some("application/json")
    );
    assert!(
        server
            .user_agent
            .lock()
            .unwrap()
            .as_deref()
            .is_some_and(|value| !value.is_empty())
    );
    server.stop();
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn default_cache_path_uses_the_state_directory_and_rejects_relative_paths() {
    let directory = scratch("state-native");
    let server = start("ok").await;
    let state = directory.join("state");
    let runtime = runtime_with(
        &directory.join("home"),
        Some(state.to_string_lossy().into_owned()),
        Some(server.url()),
        None,
        Duration::from_millis(5_000),
    );
    let (client, _) = client_for(runtime);
    client
        .load(LoadAcpRegistryOptions {
            registry_url: Some(server.url()),
            force: true,
            ..LoadAcpRegistryOptions::default()
        })
        .await
        .unwrap();
    let cache = state.join("cache").join("acp-registry.json");
    assert!(
        cache.exists(),
        "the default cache path lives under the state dir"
    );
    let text = fs::read_to_string(&cache).unwrap();
    assert!(serde_json::from_str::<Value>(&text).is_ok());

    let relative = runtime_with(
        &directory.join("home"),
        Some("relative/state".to_string()),
        Some(server.url()),
        None,
        Duration::from_millis(5_000),
    );
    let (client, _) = client_for(relative);
    let error = client
        .load(LoadAcpRegistryOptions {
            registry_url: Some(server.url()),
            ..LoadAcpRegistryOptions::default()
        })
        .await
        .unwrap_err();
    assert!(
        !error.is_empty(),
        "a relative state dir must reject the load"
    );
    server.stop();
}

// ---------------------------------------------------------------------------------------------
// ICU collation: `name.localeCompare(name)`
// ---------------------------------------------------------------------------------------------

/// Pairwise relations that a byte or case-fold comparator answers differently. These assert the
/// compiled ICU collation directly instead of relaxing the contract to approximate ordering.
#[test]
fn icu_collation_orders_unicode_case_and_punctuation() {
    let collation = AcpCollation::default();
    let pairs = [
        // Case: byte order puts 'Z' (0x5A) before 'a' (0x61).
        ("apple", "Zebra"),
        // Accent folding at the primary level: '\u{00c4}' (0xC4) is greater than 'Z' as bytes.
        ("\u{00c4}pfel", "Zebra"),
        // Secondary level: the unaccented name sorts first.
        ("Uber", "\u{00dc}ber"),
        // Punctuation carries a primary weight below letters (non-ignorable).
        ("co-op", "coop"),
        // `numeric` is disabled, so this is a plain character comparison.
        ("agent10", "agent2"),
        ("a", "ab"),
    ];
    for (left, right) in pairs {
        assert_eq!(
            collation.compare(left, right),
            std::cmp::Ordering::Less,
            "expected {left:?} < {right:?}"
        );
        assert_eq!(
            collation.compare(right, left),
            std::cmp::Ordering::Greater,
            "expected {right:?} > {left:?}"
        );
        assert_eq!(
            collation.compare(left, left),
            std::cmp::Ordering::Equal,
            "collation must be reflexive for {left:?}"
        );
    }

    // Canonically equivalent names compare equal at every level; the stable sort must therefore
    // preserve insertion order, exactly like `Array.prototype.sort` on a zero result.
    assert_eq!(
        collation.compare("caf\u{00e9}", "cafe\u{0301}"),
        std::cmp::Ordering::Equal
    );

    let value = json!({"agents": [
        {"id": "precomposed", "version": "1", "description": "test", "name": "caf\u{00e9}", "distribution": {"npx": {"package": "a"}}},
        {"id": "decomposed", "version": "1", "description": "test", "name": "cafe\u{0301}", "distribution": {"npx": {"package": "b"}}}
    ]});
    let providers = parse_acp_registry(&value).unwrap();
    let ids: Vec<&str> = providers
        .iter()
        .filter_map(|provider| provider["id"].as_str())
        .collect();
    assert_eq!(
        ids,
        ["precomposed", "decomposed"],
        "collation-equal names keep registry order"
    );

    // The fallback merge sorts through the same collator, so the byte-ordered answer is impossible.
    let registry = vec![json!({"id": "z", "name": "Zebra", "auth": "acp"})];
    let fallback = vec![json!({"id": "a", "name": "apple", "auth": true})];
    let merged = merge_fallback_definitions(&registry, &fallback, false);
    let names: Vec<&str> = merged
        .iter()
        .filter_map(|provider| provider["name"].as_str())
        .collect();
    assert_eq!(names, ["apple", "Zebra"]);

    // An injected collator is what the ordered paths actually consult.
    let injected = AcpCollation::default();
    assert_eq!(injected.compare("apple", "Zebra"), std::cmp::Ordering::Less);
}

// ---------------------------------------------------------------------------------------------
// Binary distribution launcher adapter
// ---------------------------------------------------------------------------------------------

/// A Rust gateway executable cannot interpret the TypeScript launcher shim, so the default runtime
/// must withhold binary agents instead of advertising an argv that cannot run.
#[test]
fn binary_distributions_require_a_configured_launcher() {
    let target = current_platform_target("linux", Some("x64")).expect("linux/x64 target key");
    let mut binary = serde_json::Map::new();
    binary.insert(
        target,
        json!({
            "archive": "https://registry.test/agent.tar.gz",
            "cmd": "./agent",
            "args": ["--stdio"],
            "env": {"AGENT_HOME": "/agent"},
            "sha256": "ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789"
        }),
    );
    let value = json!({"agents": [{
        "id": "binary-agent",
        "name": "Binary Agent",
        "description": "Binary test agent",
        "version": "1.0.0",
        "distribution": {"binary": Value::Object(binary)}
    }]});

    let runtime = RegistryRuntime {
        home: PathBuf::from("/nonexistent-home"),
        state_dir_env: Some("/nonexistent-state".to_string()),
        platform: "linux".to_string(),
        architecture: Some("x64".to_string()),
        ..RegistryRuntime::default()
    };

    let outcome = parse_acp_registry_reporting(&value, &runtime, &AcpCollation::default()).unwrap();
    assert!(
        outcome.providers.is_empty(),
        "the default runtime must not fabricate a runnable launcher pair"
    );
    assert_eq!(outcome.unlaunchable, ["binary-agent"]);
    assert_eq!(
        RegistryRuntime::from_process().launcher,
        LauncherAdapter::Unconfigured
    );
    assert_eq!(
        parse_acp_registry(&value).unwrap(),
        Vec::<Value>::new(),
        "the exported default withholds binary agents"
    );

    let configured = runtime.with_launcher(LauncherAdapter::configured(
        "/opt/jait-acp-launcher",
        vec!["--wrap".to_string()],
    ));
    let providers = parse_acp_registry_with(&value, &configured).unwrap();
    assert_eq!(providers.len(), 1, "a wired launcher restores the agent");
    assert_eq!(providers[0]["command"], json!("/opt/jait-acp-launcher"));
    assert_eq!(providers[0]["args"][0], json!("--wrap"));
    let spec = providers[0]["args"][1].as_str().expect("spec argument");
    assert!(!spec.is_empty(), "args[1] carries the base64url spec");
    assert_eq!(providers[0]["registry"]["distribution"], json!("binary"));
    assert_eq!(
        providers[0]["env"]["JAIT_ACP_BINARY_ROOT"],
        json!("/nonexistent-state/acp-agents")
    );
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn dropped_subscribers_do_not_pause_the_shared_fetch() {
    let directory = scratch("cancel");
    let server = start("slow").await;
    let runtime = runtime_with(&directory, None, None, None, Duration::from_secs(2));
    let (client, log) = client_for(runtime);
    let options = LoadAcpRegistryOptions {
        registry_url: Some(server.url()),
        cache_file: CacheFile::Disabled,
        ..Default::default()
    };
    let leader = tokio::spawn({
        let client = client.clone();
        let options = options.clone();
        async move { client.load(options).await }
    });
    tokio::time::timeout(Duration::from_secs(1), async {
        while server.requests() == 0 {
            tokio::task::yield_now().await;
        }
    })
    .await
    .unwrap();
    let waiter = tokio::spawn({
        let client = client.clone();
        let options = options.clone();
        async move { client.load(options).await }
    });
    tokio::task::yield_now().await;
    waiter.abort();
    leader.abort();
    let _ = waiter.await;
    let _ = leader.await;
    tokio::time::sleep(Duration::from_millis(500)).await;
    assert!(
        client.memory_cache_snapshot().is_some(),
        "background fetch must finish after every subscriber is dropped"
    );
    assert!(!client.has_inflight_load());
    let result = client.load(options).await.unwrap();
    assert_eq!(result.len(), 2);
    assert_eq!(server.requests(), 1);
    assert!(log.lock().unwrap().is_empty());
    server.stop();
}

#[cfg(unix)]
#[tokio::test]
async fn newly_created_cache_directories_are_private_and_existing_modes_are_preserved() {
    let directory = scratch("permissions");
    let server = start("ok").await;
    let runtime = runtime_with(&directory, None, None, None, Duration::from_secs(2));
    let (client, _) = client_for(runtime);
    let cache = directory.join("new-parent/child/registry.json");
    client
        .load(LoadAcpRegistryOptions {
            registry_url: Some(server.url()),
            cache_file: CacheFile::Explicit(cache.clone()),
            ..Default::default()
        })
        .await
        .unwrap();
    assert_eq!(mode(&fs::metadata(&cache).unwrap()), 0o600);
    assert_eq!(mode(&fs::metadata(cache.parent().unwrap()).unwrap()), 0o700);
    assert_eq!(
        mode(&fs::metadata(directory.join("new-parent")).unwrap()),
        0o700
    );
    // mkdir recursive must not chmod an existing parent.
    assert_eq!(
        mode(&fs::metadata(&directory).unwrap()),
        mode(&fs::metadata(directory.parent().unwrap()).unwrap())
    );
    server.stop();
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn cache_expiry_matches_typescript_at_the_exact_ttl_boundary() {
    use std::sync::atomic::AtomicU64;
    let times = [
        1000,
        ACP_REGISTRY_CACHE_TTL_MS + 999,
        ACP_REGISTRY_CACHE_TTL_MS + 1000,
    ];
    let expected = reference(
        vec![
            json!({"op":"nativeacpregistry.load","scenario":{"route":"ok","cache":"null","sequential":3,"clockTimes":times}}),
        ],
        "clock",
        1,
    );
    assert_eq!(expected[0]["requests"], 2);
    let directory = scratch("clock-native");
    let server = start("ok").await;
    let now = Arc::new(AtomicU64::new(times[0]));
    let clock = now.clone();
    let client = AcpRegistry::with_ports(
        runtime_with(&directory, None, None, None, Duration::from_secs(2)),
        Arc::new(|_| {}),
        Arc::new(move || clock.load(Ordering::SeqCst)),
        Arc::new(AcpCollation::default()),
    );
    let options = LoadAcpRegistryOptions {
        registry_url: Some(server.url()),
        cache_file: CacheFile::Disabled,
        ..Default::default()
    };
    let mut results = vec![];
    for time in times {
        now.store(time, Ordering::SeqCst);
        results.push(json!({"ok":client.load(options.clone()).await.unwrap()}));
    }
    assert_eq!(json!(results), expected[0]["results"]);
    assert_eq!(server.requests(), 2);
    assert_eq!(client.memory_cache_snapshot().unwrap().1, times[2]);
    server.stop();
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn cache_replacement_decoding_matches_typescript() {
    let directory = scratch("cache-decoding");
    let mut bytes = serde_json::to_vec(&ok_registry()).unwrap();
    bytes.pop();
    bytes.extend_from_slice(b",\"ignored\":\"");
    bytes.push(0xff);
    bytes.extend_from_slice(b"\"}");
    let cache = directory.join("cache.json");
    fs::write(&cache, bytes).unwrap();
    let expected = reference(
        vec![
            json!({"op":"nativeacpregistry.load","scenario":{"route":"http500","cache":"explicit","cachePath":cache.to_string_lossy()}}),
        ],
        "cache-decoding-reference",
        1,
    );
    assert!(expected[0]["warns"].as_array().unwrap().is_empty());
    let server = start("http500").await;
    let (client, log) = client_for(runtime_with(
        &directory,
        None,
        None,
        None,
        Duration::from_secs(2),
    ));
    let rows = client
        .load(LoadAcpRegistryOptions {
            registry_url: Some(server.url()),
            cache_file: CacheFile::Explicit(cache),
            ..Default::default()
        })
        .await
        .unwrap();
    assert_eq!(json!([{"ok":rows}]), expected[0]["results"]);
    assert!(log.lock().unwrap().is_empty());
    server.stop();
}
