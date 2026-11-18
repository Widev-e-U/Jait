#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::providers::{acp_registry::AcpCollation, model_fetchers::*};
use serde_json::{Value, json};
use std::{
    collections::{HashMap, VecDeque},
    path::PathBuf,
    sync::{
        Arc, Mutex,
        atomic::{AtomicI64, Ordering},
    },
    time::Duration,
};
struct Peer {
    scripts: Mutex<VecDeque<Value>>,
    requests: Mutex<Vec<Value>>,
    holds: Mutex<HashMap<String, Arc<tokio::sync::Notify>>>,
}
impl Peer {
    fn new(scripts: Vec<Value>) -> Self {
        Self {
            scripts: Mutex::new(scripts.into()),
            requests: Mutex::new(Vec::new()),
            holds: Mutex::new(HashMap::new()),
        }
    }
    async fn entered(&self, count: usize) {
        tokio::time::timeout(Duration::from_secs(2), async {
            while self.requests.lock().unwrap().len() < count {
                tokio::task::yield_now().await;
            }
        })
        .await
        .unwrap();
    }
    fn release(&self, id: &str) {
        self.holds
            .lock()
            .unwrap()
            .remove(id)
            .expect("hold entered")
            .notify_one();
    }
}
impl Peer {
    fn respond(&self, method: &str, request: HttpRequest) -> HttpFuture {
        let mut recorded = json!(request);
        recorded["method"] = json!(method);
        self.requests.lock().unwrap().push(recorded);
        let script = self
            .scripts
            .lock()
            .unwrap()
            .pop_front()
            .expect("unscripted request");
        let wait = script["hold"].as_str().map(|id| {
            let notify = Arc::new(tokio::sync::Notify::new());
            self.holds.lock().unwrap().insert(id.into(), notify.clone());
            notify
        });
        Box::pin(async move {
            if let Some(wait) = wait {
                wait.notified().await;
            }
            if let Some(error) = script["error"].as_str() {
                return Err(CatalogueError(error.into()));
            }
            let body = if let Some(bytes) = script["bytes"].as_array() {
                bytes.iter().map(|v| v.as_u64().unwrap() as u8).collect()
            } else if let Some(body) = script["body"].as_str() {
                body.as_bytes().to_vec()
            } else {
                serde_json::to_vec(script.get("json").unwrap_or(&json!({}))).unwrap()
            };
            Ok(HttpResponse {
                status: script["status"].as_u64().unwrap_or(200) as u16,
                body,
            })
        })
    }
}
impl CatalogueHttp for Peer {
    fn get(&self, request: HttpRequest) -> HttpFuture {
        self.respond("GET", request)
    }
    fn post(&self, request: HttpRequest) -> HttpFuture {
        self.respond("POST", request)
    }
}
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}
fn kind(step: &Value) -> CatalogueKind {
    match step["kind"].as_str().unwrap() {
        "openai" => CatalogueKind::OpenAi,
        "openrouter" => CatalogueKind::OpenRouter,
        "ollama" => CatalogueKind::Ollama,
        "omniroute" => CatalogueKind::OmniRoute,
        _ => panic!("kind"),
    }
}
fn wire(result: ModelsResult) -> Value {
    match result {
        Ok(models) => json!({"ok":true,"wire":serde_json::to_string(&models).unwrap()}),
        Err(_) => json!({"ok":false}),
    }
}
async fn fetch(fetchers: &ModelFetchers, step: &Value) -> ModelsResult {
    fetchers
        .fetch_with(
            kind(step),
            step["key"].as_str().unwrap_or(""),
            step["url"].as_str().unwrap_or("http://models.fixture/v1"),
            FetchOptions {
                force: step["force"] == true,
                include_cloud: step["includeCloud"] == true,
            },
        )
        .await
}
async fn settled(fetchers: &ModelFetchers) {
    tokio::time::timeout(Duration::from_secs(2), async {
        while fetchers.inflight_count() != 0 {
            tokio::task::yield_now().await;
        }
    })
    .await
    .unwrap();
}
async fn scenario(mut call: Value) {
    call["op"] = json!("nativemodelfetch.scenario");
    let expected = internal_driver::call(
        &root(),
        &root()
            .join(".jait/artifacts/gateway-rust/model-fetchers")
            .join(uuid::Uuid::new_v4().to_string()),
        json!({"version":1,"calls":[call.clone()]}),
        &|| false,
    )
    .unwrap()[0]
        .clone();
    let peer = Arc::new(Peer::new(
        call["responses"].as_array().cloned().unwrap_or_default(),
    ));
    let clock = Arc::new(AtomicI64::new(call["now"].as_i64().unwrap_or(1_000_000)));
    let time = clock.clone();
    let fetchers = ModelFetchers::with_clock(
        peer.clone(),
        call["cap"].as_str(),
        Arc::new(move || time.load(Ordering::SeqCst)),
    );
    let mut pending: HashMap<String, tokio::task::JoinHandle<ModelsResult>> = HashMap::new();
    let mut results = Vec::new();
    for step in call["steps"].as_array().unwrap() {
        match step["action"].as_str().unwrap_or("fetch") {
            "fetch" => results.push(wire(fetch(&fetchers, step).await)),
            "parallel" => {
                let jobs: Vec<_> = (0..step["count"].as_u64().unwrap())
                    .map(|_| {
                        let models = fetchers.clone();
                        let step = step.clone();
                        tokio::spawn(async move { fetch(&models, &step).await })
                    })
                    .collect();
                let mut values = Vec::new();
                for job in jobs {
                    values.push(wire(job.await.unwrap()));
                }
                results.push(Value::Array(values));
            }
            "begin" => {
                let before = peer.requests.lock().unwrap().len();
                let models = fetchers.clone();
                let step = step.clone();
                let expected_requests = step["expectRequests"]
                    .as_u64()
                    .unwrap_or((before + 1) as u64)
                    as usize;
                let id = step["id"].as_str().unwrap().to_string();
                pending.insert(id, tokio::spawn(async move { fetch(&models, &step).await }));
                peer.entered(expected_requests).await;
                tokio::task::yield_now().await;
                results.push(json!("started"));
            }
            "wait" => results.push(wire(
                pending
                    .remove(step["id"].as_str().unwrap())
                    .unwrap()
                    .await
                    .unwrap(),
            )),
            "release" => {
                peer.release(step["id"].as_str().unwrap());
                results.push(json!("released"));
            }
            "tick" => {
                clock.store(step["now"].as_i64().unwrap(), Ordering::SeqCst);
                results.push(json!("tick"));
            }
            "reset" => {
                fetchers.reset();
                results.push(json!("reset"));
            }
            _ => panic!("action"),
        }
        // Held collections are intentionally left pending; every other refresh settles.
        tokio::task::yield_now().await;
        let held = !peer.holds.lock().unwrap().is_empty();
        if !held && pending.is_empty() {
            settled(&fetchers).await;
        } else {
            tokio::task::yield_now().await;
        }
    }
    settled(&fetchers).await;
    let actual = json!({"results":results,"requests":peer.requests.lock().unwrap().clone()});
    assert_eq!(actual, expected, "scenario {call}");
}
#[tokio::test]
async fn provider_catalogue_mapping_matches_real_reference() {
    let cases = vec![
        (
            "openai",
            json!({"data":[{"id":"gpt-5","owned_by":"openai"},{"id":"claude","owned_by":"anthropic"},{"id":"gpt-image-1"},{"id":"o3-mini"}]}),
        ),
        (
            "openrouter",
            json!({"data":[{"id":"x/free:free"},{"id":"x/grok-3-mini","description":"desc"},{"id":"x/qwen3-thinking","name":"named"},{"id":"x/plain"}]}),
        ),
        (
            "ollama",
            json!({"models":[{"name":"qwen3:8b","details":{"family":"qwen3","parameter_size":"8.2B"}},{"name":"foo"},{"name":"empty","details":{"family":"","parameter_size":null}}]}),
        ),
        (
            "omniroute",
            json!({"data":[{"id":"auto"},{"id":"z/model"},{"id":"a/mimo","owned_by":"X"},{"id":""}]}),
        ),
    ];
    for (kind, data) in cases {
        scenario(json!({"responses":[{"json":data}],"steps":[{"kind":kind}]})).await;
    }
    scenario(json!({"responses":[{"json":{"data":[{"id":"claude"},{"id":"gpt-image-1"},{"id":"gpt-5"},{"id":"o3-mini"}]}}],"steps":[{"kind":"openai","url":"https://API.OpenAI.com/v1/"}]})).await;
}
#[tokio::test]
async fn cache_keys_and_non_ok_retry_match_reference() {
    for kind in ["openai", "openrouter", "ollama", "omniroute"] {
        let response = if kind == "ollama" {
            json!({"models":[{"name":"cached"}]})
        } else {
            json!({"data":[{"id":"cached"}]})
        };
        scenario(json!({"responses":[{"status":403},{"json":response},{"json":response},{"json":response}],"steps":[
            {"kind":kind,"key":"one"},{"kind":kind,"key":"one"},{"kind":kind,"key":"one"},{"kind":kind,"key":"two"},{"kind":kind,"key":"two","url":"models.fixture/second/"}
        ]})).await;
    }
}
#[tokio::test]
async fn stale_refresh_ttl_and_failures_match_reference() {
    for kind in ["openai", "openrouter", "ollama", "omniroute"] {
        let data = if kind == "ollama" { "models" } else { "data" };
        let id = if kind == "ollama" { "name" } else { "id" };
        let first = json!({(data):[{(id):"first"}]});
        let second = json!({(data):[{(id):"second"}]});
        let ttl = if kind == "ollama" { 30_000 } else { 300_000 };
        scenario(json!({"responses":[{"json":first},{"json":second},{"error":"refresh failed"},{"status":500}],"steps":[
            {"kind":kind},{"action":"tick","now":1_000_000+ttl-1},{"kind":kind},
            {"action":"tick","now":1_000_000+ttl},{"kind":kind},{"kind":kind},
            {"action":"tick","now":1_000_000+2*ttl},{"kind":kind},
            {"action":"tick","now":1_000_000+2*ttl+1},{"kind":kind}
        ]})).await;
    }
}
#[tokio::test]
async fn cold_requests_coalesce_and_reset_reloads() {
    scenario(json!({"responses":[{"json":{"data":[{"id":"first"}]}},{"json":{"data":[{"id":"reset"}]}}],"steps":[
        {"kind":"openai","action":"parallel","count":8},{"action":"reset"},{"kind":"openai"}
    ]})).await;
}
#[tokio::test]
async fn malformed_json_and_shapes_obey_provider_failure_rules() {
    for kind in ["openai", "openrouter", "ollama", "omniroute"] {
        for data in [
            json!(null),
            json!({"data":42,"models":42}),
            json!({"data":[null],"models":[null]}),
            json!({}),
        ] {
            scenario(json!({"responses":[{"json":data}],"steps":[{"kind":kind}]})).await;
        }
        scenario(json!({"responses":[{"body":"{"}],"steps":[{"kind":kind}]})).await;
    }
}
#[tokio::test]
async fn limits_filtering_collation_and_utf16_clipping_match() {
    let models: Vec<_> = (0..120)
        .map(|i| json!({"id":format!("m/{i:03}"),"description":format!("{}😀", "x".repeat(79))}))
        .collect();
    scenario(json!({"responses":[{"json":{"data":models}}],"steps":[{"kind":"openrouter"}]})).await;
    for cap in [
        "",
        "0",
        "1",
        "2garbage",
        "+3",
        "-2",
        "garbage",
        "9999999999999999999999999999999999999999",
    ] {
        scenario(json!({"cap":cap,"responses":[{"json":{"data":[{"id":"é"},{"id":"E"},{"id":"e"},{"id":"auto"},{"id":"z"}]}}],"steps":[{"kind":"omniroute"}]})).await;
    }
}
#[test]
fn pure_filters_match_reference() {
    let ids = [
        "",
        "gpt-5",
        "gpt-4o",
        "GPT-5",
        "o1-mini",
        "o4-mini",
        "o20",
        "o2x",
        "O3",
        "gpt-image-1",
        "gpt-4o-audio-preview",
        "gpt-4o:ft-x",
        "embedding",
        "claude-reasoning",
        "DeepSeek-R1",
        "QWEN3-Thinking",
        "X/mimo-v2",
        "grok-3-mini",
        "unrelated",
    ];
    let expected = internal_driver::call(
        &root(),
        &root().join(".jait/artifacts/gateway-rust/model-fetchers/filters"),
        json!({"version":1,"calls":[{"op":"nativemodelfetch.filters","ids":ids}]}),
        &|| false,
    )
    .unwrap()[0]
        .clone();
    let actual:Vec<_>=ids.iter().map(|id|json!({"chat":is_chat_capable_openai_model_id(id),"reasoning":supports_reasoning_effort(id)})).collect();
    assert_eq!(json!(actual), expected);
    assert_eq!(REMOTE_CACHE_TTL_MS, 300_000);
    assert_eq!(OLLAMA_CACHE_TTL_MS, 30_000);
    assert_eq!(FETCH_TIMEOUT_MS, 5000);
    assert!(
        map_catalogue(
            CatalogueKind::OpenRouter,
            &json!({}),
            150.0,
            &AcpCollation::default(),
            false
        )
        .unwrap()
        .is_empty()
    );
}

#[tokio::test]
async fn suspended_refresh_returns_stale_and_coalesces() {
    for kind in ["openai", "openrouter", "ollama", "omniroute"] {
        let data = if kind == "ollama" { "models" } else { "data" };
        let id = if kind == "ollama" { "name" } else { "id" };
        scenario(json!({"responses":[{"json":{(data):[{(id):"old"}]}},{"hold":"refresh","json":{(data):[{(id):"new"}]}}],"steps":[
            {"kind":kind},{"action":"tick","now":1_300_000},{"kind":kind},{"kind":kind},
            {"action":"release","id":"refresh"},{"kind":kind}
        ]})).await;
    }
}
#[tokio::test]
async fn cold_waiters_share_the_pending_request() {
    scenario(
        json!({"responses":[{"hold":"cold","json":{"data":[{"id":"shared"}]}}],"steps":[
            {"action":"begin","kind":"openai","id":"a","expectRequests":1},
            {"action":"begin","kind":"openai","id":"b","expectRequests":1},
            {"action":"release","id":"cold"},{"action":"wait","id":"a"},{"action":"wait","id":"b"}
        ]}),
    )
    .await;
}
#[tokio::test]
async fn reset_during_old_and_new_collections_matches_reference() {
    scenario(json!({"responses":[{"hold":"old","json":{"data":[{"id":"old"}]}},{"hold":"new","json":{"data":[{"id":"new"}]}}],"steps":[
        {"action":"begin","kind":"openai","id":"a"},{"action":"reset"},
        {"action":"begin","kind":"openai","id":"b"},
        {"action":"release","id":"old"},{"action":"wait","id":"a"},{"kind":"openai"},
        {"action":"release","id":"new"},{"action":"wait","id":"b"},{"kind":"openai"}
    ]})).await;
}
#[tokio::test]
async fn abandoned_subscriber_does_not_suspend_collection() {
    let peer = Arc::new(Peer::new(vec![
        json!({"hold":"cold","json":{"data":[{"id":"survived"}]}}),
    ]));
    let fetchers = ModelFetchers::new(peer.clone(), None);
    let owner = fetchers.clone();
    let subscriber = tokio::spawn(async move {
        owner
            .fetch(CatalogueKind::OpenAi, "", "http://fixture")
            .await
    });
    peer.entered(1).await;
    subscriber.abort();
    let _ = subscriber.await;
    peer.release("cold");
    settled(&fetchers).await;
    let models = fetchers
        .fetch(CatalogueKind::OpenAi, "", "http://fixture")
        .await
        .unwrap();
    assert_eq!(models[0].id, Some(json!("survived")));
    assert_eq!(peer.requests.lock().unwrap().len(), 1);
}

#[tokio::test]
async fn coercion_and_empty_join_wire_cases_match_reference() {
    for (kind, data) in [
        (
            "ollama",
            json!({"models":[{"name":"empty-array","details":{"family":[]}},{"name":"object","details":{"family":{},"parameter_size":7}},{"name":"null","details":null}]}),
        ),
        (
            "openrouter",
            json!({"data":[{"id":"x","name":42,"description":""}]}),
        ),
        ("openai", json!({"data":[{"id":null}]})),
        (
            "openai",
            json!({"data":[{"id":"x","owned_by":["a",null,"b"]}]}),
        ),
        (
            "openai",
            json!({"data":[{"id":"x","owned_by":{"toString":false}}]}),
        ),
    ] {
        scenario(json!({"responses":[{"json":data}],"steps":[{"kind":kind}]})).await;
    }
}

#[tokio::test]
async fn actual_http_mapping_headers_bom_and_invalid_utf8_match_reference() {
    use axum::{Router, body::Body, extract::Request, response::Response};
    let requests = Arc::new(Mutex::new(Vec::<(String, Option<String>)>::new()));
    let captured = requests.clone();
    let app=Router::new().fallback(move|req:Request|{let captured=captured.clone();async move {
        let path=req.uri().path().to_string();
        captured.lock().unwrap().push((path.clone(),req.headers().get("authorization").map(|v|v.to_str().unwrap().to_string())));
        if path.contains("reject") {return Response::builder().status(503).body(Body::from("not JSON")).unwrap();}
        let body=if path.ends_with("/api/tags") {
            serde_json::to_vec(&json!({"models":[{"name":"qwen3:8b","details":{"family":"qwen3","parameter_size":"8B"}}]})).unwrap()
        } else if path.contains("bad-bytes") {b"{\"data\":[{\"id\":\"invalid\",\"owned_by\":\"\xff\"}]}".to_vec()}
        else {serde_json::to_vec(&json!({"data":[{"id":"gpt-5","owned_by":"fixture"},{"id":"claude"},{"id":"gpt-image-1"}]})).unwrap()};
        let body=if path.contains("bom"){[vec![0xef,0xbb,0xbf],body].concat()}else{body};
        Response::builder().header("content-type","application/json").body(Body::from(body)).unwrap()
    }});
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let server = tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    let fetchers = ModelFetchers::new(
        Arc::new(SystemCatalogueHttp::with_client(
            reqwest::Client::builder().no_proxy().build().unwrap(),
        )),
        None,
    );
    let steps = json!([
        {"kind":"openai","key":"fixture-key","url":format!("http://{address}/api.openai.com/v1")},
        {"kind":"openai","key":"fixture-key","url":format!("http://{address}/compatible/v1")},
        {"kind":"ollama","url":format!("http://{address}")},
        {"kind":"omniroute","url":format!("http://{address}/router/v1")},
        {"kind":"openai","key":"fixture-key","url":format!("http://{address}/bom/v1")},
        {"kind":"openai","key":"fixture-key","url":format!("http://{address}/bad-bytes/v1")},
        {"kind":"openai","key":"fixture-key","url":format!("http://{address}/reject/v1")}
    ]);
    let mut actual = Vec::new();
    for step in steps.as_array().unwrap() {
        actual.push(wire(fetch(&fetchers, step).await));
    }
    let reference_root = root();
    let expected = tokio::task::spawn_blocking(move || {
        internal_driver::call(
            &reference_root,
            &reference_root
                .join(".jait/artifacts/gateway-rust/model-fetchers/live")
                .join(uuid::Uuid::new_v4().to_string()),
            json!({"version":1,"calls":[{"op":"nativemodelfetch.live","steps":steps}]}),
            &|| false,
        )
        .unwrap()[0]
            .clone()
    })
    .await
    .unwrap();
    assert_eq!(json!(actual), expected);
    let requests = requests.lock().unwrap().clone();
    assert_eq!(requests.len(), 14);
    for (path, authorization) in requests {
        if path.ends_with("/api/tags") || path.contains("/router/") {
            assert_eq!(authorization, None);
        } else {
            assert_eq!(authorization.as_deref(), Some("Bearer fixture-key"));
        }
    }
    server.abort();
    let _ = server.await;
}
#[tokio::test]
async fn system_transport_enforces_the_supplied_whole_request_deadline() {
    use axum::{Router, routing::get};
    let app = Router::new().route(
        "/slow",
        get(|| async {
            tokio::time::sleep(Duration::from_secs(10)).await;
            "{}"
        }),
    );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let server = tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    let transport =
        SystemCatalogueHttp::with_client(reqwest::Client::builder().no_proxy().build().unwrap());
    let started = std::time::Instant::now();
    let response = transport
        .get(HttpRequest {
            url: format!("http://{address}/slow"),
            authorization: None,
            timeout_ms: 30,
        })
        .await;
    assert!(response.is_err());
    assert!(started.elapsed() < Duration::from_secs(1));
    server.abort();
    let _ = server.await;
}

#[tokio::test]
async fn nullable_ids_in_compatible_catalogue_sort_like_reference() {
    for ids in [
        vec![json!(null), json!("a")],
        vec![json!("a"), json!(null)],
        vec![json!(0), json!("z")],
        vec![json!(false), json!("z")],
        vec![json!(null), json!("z"), json!("a")],
    ] {
        let data: Vec<_> = ids.iter().map(|id| json!({"id":id})).collect();
        scenario(json!({"responses":[{"json":{"data":data}}],"steps":[{"kind":"openai"}]})).await;
    }
}

#[tokio::test]
async fn cloud_options_do_not_contaminate_the_local_cache() {
    let local = json!({"json":{"models":[{"name":"local"}]}});
    let signed = json!({"json":{"plan":"pro"}});
    let cloud =
        json!({"json":{"models":[{"name":"remote-cloud","capabilities":["completion","tools"]}]}});
    scenario(
        json!({"responses":[local.clone(),signed.clone(),cloud.clone()], "steps":[
            {"kind":"ollama"},{"kind":"ollama","includeCloud":true},{"kind":"ollama"},
            {"kind":"ollama","includeCloud":true}
        ]}),
    )
    .await;
}
#[tokio::test]
async fn cloud_probe_runs_after_a_non_ok_local_catalogue() {
    scenario(json!({"responses":[{"status":503},{"json":{"plan":"pro"}},
        {"json":{"models":[{"model":" hosted:cloud "}]}}],"steps":[{"kind":"ollama","includeCloud":true}]})).await;
}
#[tokio::test]
async fn cloud_mapping_matches_permissive_reference_values() {
    for tags in [
        json!([null,{}, {"name":" "},{"model":" fallback "},{"name":"fallback"}]),
        json!([{"name":false}]),
        json!([{"name":"cap","capabilities":[0,1,true,"completion",null,{},["tools"]]}]),
        json!([{"name":"empty","details":{"family":[],"parameter_size":[]},"capabilities":["tools"]}]),
        json!([{"name":"bad","capabilities":{}}]),
        json!([{"name":"x","details":null}]),
    ] {
        let expected = internal_driver::call(
            &root(),
            &root()
                .join(".jait/artifacts/gateway-rust/model-fetchers")
                .join(uuid::Uuid::new_v4().to_string()),
            json!({"version":1,"calls":[{"op":"nativemodelfetch.cloudmap","tags":tags.clone()}]}),
            &|| false,
        )
        .unwrap()[0]
            .clone();
        assert_eq!(
            wire(map_ollama_cloud_catalogue(&json!({"models":tags.clone()}))),
            expected,
            "tags {tags}"
        );
    }
}

#[tokio::test]
async fn cloud_cache_expires_independently_of_local_refresh() {
    scenario(json!({"responses":[
        {"json":{"models":[{"name":"local"}]}},{"json":{"plan":"pro"}},{"json":{"models":[{"name":"cloud"}]}},
        {"json":{"models":[{"name":"new-local"}]}},
        {"json":{"models":[{"name":"latest-local"}]}},{"status":401}
    ],"steps":[{"kind":"ollama","includeCloud":true},
        {"action":"tick","now":1030000},{"kind":"ollama","includeCloud":true},
        {"action":"tick","now":1300000},{"kind":"ollama","includeCloud":true},
        {"kind":"ollama"}]})).await;
}
#[tokio::test]
async fn forced_cloud_refresh_uses_fallback_then_caches_signed_out() {
    scenario(json!({"responses":[
        {"json":{"models":[{"name":"local"}]}},{"json":{"plan":"pro"}},{"json":{"models":[{"name":"cloud"}]}},
        {"status":503},{"json":{"plan":"pro"}},{"status":503},
        {"json":{"models":[]}},{"error":"account offline"}
    ],"steps":[{"kind":"ollama","includeCloud":true},
        {"kind":"ollama","force":true,"includeCloud":true},
        {"kind":"ollama","force":true,"includeCloud":true},{"kind":"ollama","includeCloud":true}]})).await;
}
#[tokio::test]
async fn cloud_account_malformed_and_catalogue_failure_rules_match() {
    for account in [
        json!({}),
        json!({"plan":""}),
        json!({"plan":4}),
        json!(null),
        json!({"plan":" "}),
    ] {
        scenario(
            json!({"responses":[{"json":{"models":[]}},{"json":account},{"body":"invalid"}],
            "steps":[{"kind":"ollama","includeCloud":true},{"kind":"ollama"}]}),
        )
        .await;
    }
}
#[tokio::test]
async fn default_fetch_does_not_probe_cloud() {
    let peer = Arc::new(Peer::new(vec![
        json!({"json":{"models":[{"name":"local"}]}}),
    ]));
    let fetchers = ModelFetchers::new(peer.clone(), None);
    assert_eq!(
        fetchers
            .fetch(CatalogueKind::Ollama, "", "http://models.fixture")
            .await
            .unwrap()
            .len(),
        1
    );
    assert_eq!(peer.requests.lock().unwrap().len(), 1);
}

#[tokio::test(start_paused = true)]
async fn cloud_account_and_catalogue_share_one_deadline() {
    struct SlowCloud {
        elapsed: Arc<Mutex<Vec<String>>>,
    }
    impl CatalogueHttp for SlowCloud {
        fn get(&self, request: HttpRequest) -> HttpFuture {
            let cloud = request.url == OLLAMA_CLOUD_CATALOGUE_URL;
            let elapsed = self.elapsed.clone();
            Box::pin(async move {
                if cloud {
                    tokio::time::sleep(Duration::from_millis(3000)).await;
                }
                elapsed.lock().unwrap().push(request.url);
                Ok(HttpResponse {
                    status: 200,
                    body: br#"{"models":[{"name":"slow"}]}"#.to_vec(),
                })
            })
        }
        fn post(&self, request: HttpRequest) -> HttpFuture {
            let elapsed = self.elapsed.clone();
            Box::pin(async move {
                tokio::time::sleep(Duration::from_millis(3000)).await;
                elapsed.lock().unwrap().push(request.url);
                Ok(HttpResponse {
                    status: 200,
                    body: br#"{"plan":"pro"}"#.to_vec(),
                })
            })
        }
    }
    let elapsed = Arc::new(Mutex::new(Vec::new()));
    let fetchers = ModelFetchers::new(
        Arc::new(SlowCloud {
            elapsed: elapsed.clone(),
        }),
        None,
    );
    let start = tokio::time::Instant::now();
    let models = fetchers
        .fetch_with(
            CatalogueKind::Ollama,
            "",
            "http://models.fixture",
            FetchOptions {
                force: false,
                include_cloud: true,
            },
        )
        .await
        .unwrap();
    assert_eq!(
        tokio::time::Instant::now() - start,
        Duration::from_millis(4000)
    );
    assert_eq!(models.len(), 1);
    assert_eq!(
        elapsed.lock().unwrap().len(),
        2,
        "catalogue must be cancelled before finishing"
    );
}
