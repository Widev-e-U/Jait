//! Real HTTP provider connection probes. Active token streaming remains separate.
use crate::{
    client::{equal, string},
    provider_fixture::{LocalProvider, RecordedRequest, Reply},
    scenarios::{Scenario, Suite},
};
use anyhow::{Context, Result, ensure};
use serde_json::{Value, json};

const KEY: &str = "contract-synthetic-provider-key";
const OMNI: &str = "/api/providers/omniroute/test";
const BACKEND: &str = "/api/providers/backend/test";

fn request(request: &RecordedRequest, method: &str, path: &str, key: Option<&str>) -> Result<()> {
    ensure!(
        request.method == method && request.path == path,
        "provider method/path mismatch"
    );
    let authorization = request.headers.get("authorization").map(String::as_str);
    let expected = key.map(|key| format!("Bearer {key}"));
    ensure!(
        authorization == expected.as_deref(),
        "provider authorization mismatch"
    );
    Ok(())
}
fn probe(s: &Suite, route: &str, body: Value) -> Result<Value> {
    let result = s
        .gateway
        .api
        .json("POST", route, Some(&s.owner), Some(body), 200)?;
    ensure!(
        !result.to_string().contains(KEY),
        "provider probe exposed synthetic API key"
    );
    Ok(result)
}
fn catalogue() -> Reply {
    Reply::json(
        200,
        json!({"data":[{"id":"auto/coding"},{"id":"openai/gpt-4o"},{"id":"x/y"},{"id":"a/b"}]}),
    )
}
fn omni_catalogue(s: &mut Suite) -> Result<()> {
    let peer = LocalProvider::start(vec![catalogue()])?;
    let url = format!("{}/v1", peer.base_url());
    let result = probe(s, OMNI, json!({"base_url":format!(" {url}/// ")}))?;
    for (key, expected) in [
        ("ok", json!(true)),
        ("modelCount", json!(4)),
        (
            "sampleModels",
            json!(["auto/coding", "openai/gpt-4o", "x/y"]),
        ),
        ("authenticated", json!(false)),
        ("baseUrl", json!(url)),
    ] {
        equal(&result[key], expected, key)?;
    }
    ensure!(
        result["latencyMs"].as_u64().is_some(),
        "missing numeric latency"
    );
    let requests = peer.finish()?;
    request(&requests[0], "GET", "/v1/models", None)?;
    ensure!(requests[0].body.is_empty(), "catalogue GET had a body");
    Ok(())
}
fn omni_rejected_key(s: &mut Suite) -> Result<()> {
    let peer = LocalProvider::start(vec![Reply::json(401, json!({"secret":KEY}))])?;
    let result = probe(s, OMNI, json!({"base_url":peer.base_url(),"api_key":KEY}))?;
    equal(&result["ok"], json!(false), "401 failure")?;
    let error = string(&result, "error")?;
    ensure!(
        error.contains("401") && error.contains("keyless free tier"),
        "401 explanation missing"
    );
    request(&peer.finish()?[0], "GET", "/models", Some(KEY))
}
fn omni_malformed(s: &mut Suite) -> Result<()> {
    let peer = LocalProvider::start(vec![Reply::malformed()])?;
    let result = probe(s, OMNI, json!({"base_url":peer.base_url()}))?;
    equal(&result["ok"], json!(false), "invalid provider JSON")?;
    ensure!(
        string(&result, "error")?.contains("Could not reach the router"),
        "missing malformed response diagnostic"
    );
    request(&peer.finish()?[0], "GET", "/models", None)
}
fn omni_no_fetch(s: &mut Suite) -> Result<()> {
    let peer = LocalProvider::start(vec![])?;
    s.gateway.api.expect(
        "POST",
        OMNI,
        None,
        Some(json!({"base_url":peer.base_url()})),
        401,
    )?;
    s.gateway.api.expect(
        "POST",
        OMNI,
        Some(&s.owner),
        Some(json!({"base_url":"not a url"})),
        400,
    )?;
    peer.finish()?;
    Ok(())
}
fn backend_catalogues(s: &mut Suite) -> Result<()> {
    for (backend, reply, path, expected, present) in [
        (
            "openai",
            catalogue(),
            "/v1/models",
            json!(["auto/coding", "openai/gpt-4o", "x/y"]),
            false,
        ),
        (
            "vllm",
            catalogue(),
            "/v1/models",
            json!(["auto/coding", "openai/gpt-4o", "x/y"]),
            false,
        ),
        (
            "ollama",
            Reply::json(
                200,
                json!({"models":[{"name":"llama3"},{"name":"qwen3"},{"name":""},{}]}),
            ),
            "/api/tags",
            json!(["llama3", "qwen3"]),
            true,
        ),
    ] {
        let peer = LocalProvider::start(vec![reply])?;
        let url = if backend == "openai" {
            format!("{}/v1", peer.base_url())
        } else {
            peer.base_url().into()
        };
        let result = probe(
            s,
            BACKEND,
            json!({"backend":backend,"base_url":url,"api_key":KEY,"model":"qwen3"}),
        )?;
        equal(&result["ok"], json!(true), "backend reachable")?;
        equal(&result["sampleModels"], expected, "backend models")?;
        equal(
            &result["modelPresent"],
            json!(present),
            "requested model membership",
        )?;
        equal(&result["authenticated"], json!(true), "key indicator")?;
        equal(
            &result["modelCount"],
            json!(if backend == "ollama" { 2 } else { 4 }),
            "catalogue count",
        )?;
        request(&peer.finish()?[0], "GET", path, Some(KEY))?;
    }
    Ok(())
}
fn backend_errors(s: &mut Suite) -> Result<()> {
    for (status, hint) in [
        (401, "auth error"),
        (403, "auth error"),
        (404, "usually serve it under /v1"),
        (503, "HTTP 503"),
    ] {
        let peer = LocalProvider::start(vec![Reply::json(status, json!({"error":KEY}))])?;
        let result = probe(
            s,
            BACKEND,
            json!({"backend":"openai","base_url":peer.base_url(),"api_key":KEY}),
        )?;
        equal(&result["ok"], json!(false), "provider status failure")?;
        ensure!(
            string(&result, "error")?.contains(hint),
            "provider error hint missing"
        );
        request(&peer.finish()?[0], "GET", "/models", Some(KEY))?;
    }
    Ok(())
}
fn backend_no_fetch(s: &mut Suite) -> Result<()> {
    let peer = LocalProvider::start(vec![])?;
    for (backend, url) in [
        ("unknown", peer.base_url()),
        ("openai", "not a url"),
        ("opencode-go", peer.base_url()),
    ] {
        s.gateway.api.expect(
            "POST",
            BACKEND,
            Some(&s.owner),
            Some(json!({"backend":backend,"base_url":url})),
            400,
        )?;
    }
    s.gateway.api.expect(
        "POST",
        BACKEND,
        None,
        Some(json!({"backend":"openai","base_url":peer.base_url()})),
        401,
    )?;
    peer.finish()?;
    Ok(())
}
fn go_inference(s: &mut Suite) -> Result<()> {
    let peer = LocalProvider::start(vec![
        Reply::json(200, json!({"data":[{"id":"glm-5.2"}]})),
        Reply::json(200, json!({"choices":[{"message":{"content":"OK"}}]})),
    ])?;
    let result = probe(
        s,
        BACKEND,
        json!({"backend":"opencode-go","base_url":format!("{}/v1",peer.base_url()),"api_key":KEY}),
    )?;
    for (key, expected) in [
        ("ok", json!(true)),
        ("authenticated", json!(true)),
        ("modelCount", json!(1)),
    ] {
        equal(&result[key], expected, key)?;
    }
    let requests = peer.finish()?;
    request(&requests[0], "GET", "/v1/models", Some(KEY))?;
    request(&requests[1], "POST", "/v1/chat/completions", Some(KEY))?;
    ensure!(
        requests[1]
            .headers
            .get("x-opencode-session")
            .is_some_and(|value| !value.is_empty()),
        "missing Go session header"
    );
    let body: Value = serde_json::from_slice(&requests[1].body)?;
    for (key, expected) in [
        ("model", json!("glm-5.2")),
        ("stream", json!(false)),
        ("max_tokens", json!(512)),
    ] {
        equal(&body[key], expected, key)?;
    }
    let messages = body["messages"]
        .as_array()
        .context("missing completion messages")?;
    ensure!(
        messages.len() == 1 && messages[0]["role"] == "user",
        "probe message shape differs"
    );
    ensure!(
        string(&messages[0], "content")?.contains("Reply with OK only"),
        "wrong probe prompt"
    );
    Ok(())
}
fn go_rejected_inference(s: &mut Suite) -> Result<()> {
    let peer = LocalProvider::start(vec![
        Reply::json(200, json!({"data":[{"id":"glm-5.2"}]})),
        Reply::json(401, json!({"error":{"message":"Invalid Go API key"}})),
    ])?;
    let result = probe(
        s,
        BACKEND,
        json!({"backend":"opencode-go","base_url":peer.base_url(),"api_key":KEY}),
    )?;
    equal(&result["ok"], json!(false), "inference must authenticate")?;
    ensure!(
        string(&result, "error")?.contains("Invalid Go API key"),
        "missing inference rejection"
    );
    let requests = peer.finish()?;
    request(&requests[0], "GET", "/models", Some(KEY))?;
    request(&requests[1], "POST", "/chat/completions", Some(KEY))
}
fn go_model_guard(s: &mut Suite) -> Result<()> {
    for (data, model, hint) in [
        (json!([]), "", "returned no models"),
        (
            json!([{"id":"glm-5.2"}]),
            "missing-model",
            "does not offer model",
        ),
    ] {
        let peer = LocalProvider::start(vec![Reply::json(200, json!({"data":data}))])?;
        let result = probe(
            s,
            BACKEND,
            json!({"backend":"opencode-go","base_url":peer.base_url(),"api_key":KEY,"model":model}),
        )?;
        equal(&result["ok"], json!(false), "catalogue guard")?;
        ensure!(
            string(&result, "error")?.contains(hint),
            "missing model guard explanation"
        );
        request(&peer.finish()?[0], "GET", "/models", Some(KEY))?;
    }
    Ok(())
}

pub const CASES: &[Scenario] = &[
    ("provider.omniroute-catalogue", omni_catalogue),
    ("provider.omniroute-rejected-key", omni_rejected_key),
    ("provider.omniroute-malformed-json", omni_malformed),
    ("provider.omniroute-auth-validation-no-fetch", omni_no_fetch),
    ("provider.backend-catalogue-protocols", backend_catalogues),
    ("provider.backend-status-diagnostics", backend_errors),
    (
        "provider.backend-auth-validation-no-fetch",
        backend_no_fetch,
    ),
    ("provider.go-inference-authentication", go_inference),
    ("provider.go-rejected-inference", go_rejected_inference),
    ("provider.go-catalogue-guards", go_model_guard),
];
