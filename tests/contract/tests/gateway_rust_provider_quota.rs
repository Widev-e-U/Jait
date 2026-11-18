#[path = "../src/internal_driver.rs"]
mod internal_driver;
use futures_util::future::BoxFuture;
use jait_gateway::services::{ollama_device_auth::*, provider_quota_fetchers::*};
use serde_json::{Value, json};
use std::{borrow::Cow, collections::VecDeque, path::PathBuf, sync::Mutex};
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}
struct Http {
    replies: Mutex<VecDeque<Value>>,
    sent: Mutex<Vec<Value>>,
}
impl OllamaAuthTransport for Http {
    fn send<'a>(
        &'a self,
        request: OllamaAuthRequest,
    ) -> BoxFuture<'a, Result<OllamaAuthResponse, OllamaAuthError>> {
        self.sent.lock().unwrap().push(json!({"url":request.url,"method":request.method,"authorization":request.authorization}));
        let response = self
            .replies
            .lock()
            .unwrap()
            .pop_front()
            .expect("fixture count");
        Box::pin(async move {
            if let Some(error) = response["error"].as_str() {
                return Err(OllamaAuthError::transport(
                    "Error".into(),
                    error.into(),
                    None,
                ));
            }
            let body = if let Some(raw) = response["raw"].as_str() {
                serde_json::from_str(raw).map_err(|_| {
                    OllamaAuthError::transport(
                        "SyntaxError".into(),
                        "Invalid JSON response".into(),
                        None,
                    )
                })
            } else {
                Ok(response["body"].clone())
            };
            Ok(OllamaAuthResponse {
                status: response["status"].as_u64().unwrap_or(200) as u16,
                body,
            })
        })
    }
}
async fn native(call: &Value) -> Value {
    let op = call["op"]
        .as_str()
        .unwrap()
        .trim_start_matches("nativequota.");
    if op == "transport" {
        let transport = ReqwestOllamaAuthTransport::new().unwrap();
        let result = transport
            .send(OllamaAuthRequest {
                url: call["url"].as_str().unwrap().into(),
                method: "GET",
                authorization: Some("fixture-signature".into()),
                accept: None,
                reject_redirects: call["signed"] == true,
                timeout_ms: call["timeout"].as_u64().unwrap_or(10000),
            })
            .await;
        return match result {
            Ok(response) => match response.body {
                Ok(body) => json!({"status":response.status,"body":body}),
                Err(error) => json!({"error":error}),
            },
            Err(error) => json!({"error":error}),
        };
    }
    match op {
  "validate"=>return Value::Array(call["inputs"].as_array().unwrap().iter().map(|v|json!({"codex":is_codex_rate_limits_response(v),"quota":is_ollama_quota_usage_response(v),"usage":is_ollama_usage_response(v)})).collect()),
  "normalize"=>return Value::Array(call["inputs"].as_array().unwrap().iter().map(|v|{let result=normalize_codex_rate_limits(v).unwrap();json!({"same":matches!(&result,Cow::Borrowed(_)),"value":result.as_ref()})}).collect()),
  "gap"=>{let input=&call["input"];return json!(describe_ollama_usage_gap(input["baseUrl"].as_str().unwrap(),input["cloud"].as_bool().unwrap(),&serde_json::from_value(input["probe"].clone()).unwrap()));},
  "codex"=>{return match fetch_codex_rate_limits(&PathBuf::from(call["home"].as_str().unwrap()),&CodexRateLimitOptions{command:call["command"].as_str().unwrap().into(),timeout_ms:call["timeout"].as_u64().unwrap_or(2000)}).await {Ok(value)=>json!({"value":value}),Err(error)=>json!({"error":error})};},
  _=>{}
 }
    if call["real"] == true {
        let transport = ReqwestOllamaAuthTransport::new().unwrap();
        let options = &call["options"];
        let (url, method) = if op == "probe" {
            (
                format!("{}/api/me", options["baseUrl"].as_str().unwrap()),
                "POST",
            )
        } else {
            (
                format!("{}/api/usage", call["base"].as_str().unwrap()),
                "GET",
            )
        };
        let key = if op == "probe" {
            options["apiKey"].as_str()
        } else {
            call["key"].as_str()
        };
        let sent = json!([{"url":url,"method":method,"authorization":key.map(|key|format!("Bearer {key}"))}]);
        if op == "probe" {
            return json!({"value":probe_ollama_account(&transport,options["baseUrl"].as_str().unwrap(),key,options["timeoutMs"].as_u64().unwrap_or(4000)).await,"sent":sent});
        }
        return match fetch_ollama_usage_from(
            &transport,
            call["base"].as_str().unwrap(),
            key,
            call["timeout"].as_u64().unwrap_or(10000),
        )
        .await
        {
            Ok(value) => json!({"value":value,"sent":sent}),
            Err(error) => json!({"error":error,"sent":sent}),
        };
    }
    let transport = Http {
        replies: Mutex::new(call["replies"].as_array().unwrap().clone().into()),
        sent: Mutex::new(vec![]),
    };
    let result = if op == "probe" {
        let options = &call["options"];
        Ok(serde_json::to_value(
            probe_ollama_account(
                &transport,
                options["baseUrl"].as_str().unwrap_or(""),
                options["apiKey"].as_str(),
                options["timeoutMs"].as_u64().unwrap_or(4000),
            )
            .await,
        )
        .unwrap())
    } else if op == "cloud" {
        fetch_ollama_usage(
            &transport,
            call["key"].as_str().unwrap(),
            call["timeout"].as_u64().unwrap_or(10000),
        )
        .await
    } else {
        fetch_ollama_usage_from(
            &transport,
            call["base"].as_str().unwrap(),
            call["key"].as_str(),
            call["timeout"].as_u64().unwrap_or(10000),
        )
        .await
    };
    let sent = transport.sent.lock().unwrap();
    match result {
        Ok(value) => json!({"value":value,"sent":*sent}),
        Err(error) => json!({"error":error,"sent":*sent}),
    }
}
async fn compare(calls: Vec<Value>) {
    for batch in calls.chunks(16) {
        let input = batch.to_vec();
        let repo = root();
        let expected = tokio::task::spawn_blocking(move || {
            internal_driver::call(
                &repo,
                &repo
                    .join(".jait/artifacts/gateway-rust/provider-quota")
                    .join(uuid::Uuid::new_v4().to_string()),
                json!({"version":1,"calls":input}),
                &|| false,
            )
            .unwrap()
        })
        .await
        .unwrap();
        assert_eq!(batch.len(), expected.as_array().unwrap().len());
        for (call, expected) in batch.iter().zip(expected.as_array().unwrap()) {
            assert_eq!(&native(call).await, expected, "call {call}");
        }
    }
}
fn usage() -> Value {
    json!({"limits":{"session":{"usage":0.2,"models":[]}}})
}
fn window() -> Value {
    json!({"usedPercent":42.5,"windowDurationMins":300,"resetsAt":1770000000})
}
#[tokio::test]
async fn structural_validation_covers_null_types_unknown_fields_and_independent_buckets() {
    let mut inputs = vec![
        Value::Null,
        json!(true),
        json!(0),
        json!("text"),
        json!([]),
        json!({}),
        usage(),
    ];
    for value in [
        Value::Null,
        json!(false),
        json!("0"),
        json!(0),
        json!({}),
        json!([]),
        window(),
    ] {
        inputs.push(json!({"rateLimits":value}));
        inputs.push(json!({"rateLimits":{"primary":value}}));
        inputs.push(json!({"rateLimits":{"secondary":value}}));
        for key in [
            "ordinaryUsageAllowed",
            "rateLimitsByLimitId",
            "rateLimitResetCredits",
        ] {
            inputs.push(json!({"rateLimits":{},key:value}));
        }
        inputs.push(json!({"limits":{"weekly":value}}));
        inputs.push(json!({"limits":{"session":{"usage":0.5,"models":[]},"monthly":value}}));
        for key in ["usage", "models"] {
            let mut bucket = json!({"usage":0.5,"models":[]});
            bucket[key] = value.clone();
            inputs.push(json!({"limits":{"monthly":bucket}}));
        }
    }
    for value in [
        Value::Null,
        json!(false),
        json!("10"),
        json!(-1),
        json!(10),
        json!([]),
        json!({}),
    ] {
        inputs.push(json!({"rateLimits":{"primary":window()},"rateLimitResetCredits":{"availableCount":value}}));
        inputs.push(json!({"rateLimits":{},"rateLimitResetCredits":{"credits":[value]}}));
        inputs
            .push(json!({"rateLimits":{"primary":window()},"rateLimitsByLimitId":{"codex":value}}));
    }
    for batch in inputs.chunks(32) {
        compare(vec![json!({"op":"nativequota.validate","inputs":batch})]).await;
    }
}
#[tokio::test]
async fn request_activity_dates_counts_and_quota_precedence_match_reference() {
    let activity = json!({"range":"7d","scope":"self","granularity":"day","from":"2026-09-30T00:00:00Z","until":"2026-10-07T11:29:42Z","totals":{"request_count":10388},"buckets":[]});
    let mut inputs = vec![activity.clone()];
    for date in [
        "invalid",
        "",
        "2026-09-30",
        "2026-02-30",
        "2026-12-01",
        "2026-09-30T24:00:00Z",
        " 2026-09-30T00:00:00Z",
        "2026/09/30",
        "Sep 30 2026",
        "2026-09-30T00:00:00+02:00",
    ] {
        let mut copy = activity.clone();
        copy["from"] = json!(date);
        inputs.push(copy.clone());
        copy["buckets"] = json!([{"from":date,"until":"2026-10-01T00:00:00Z","request_count":2}]);
        inputs.push(copy);
    }
    for count in [
        json!(-1),
        json!(0),
        json!(1.5),
        json!("4"),
        Value::Null,
        json!(9007199254740991_u64),
        json!(9007199254740992_u64),
    ] {
        let mut copy = activity.clone();
        copy["totals"]["request_count"] = count;
        inputs.push(copy);
    }
    for partial in [json!(true), json!(false), Value::Null, json!("true")] {
        let mut copy = activity.clone();
        copy["buckets"] =
            json!([{"from":"2026-09-30","until":"2026-10-01","request_count":0,"partial":partial}]);
        inputs.push(copy);
    }
    let mut both = usage();
    both["totals"] = json!({"request_count":"invalid"});
    inputs.push(both);
    for batch in inputs.chunks(32) {
        compare(vec![json!({"op":"nativequota.validate","inputs":batch})]).await;
    }
}
#[tokio::test]
async fn normalization_retains_identity_and_authoritative_root_account_flags() {
    let mut inputs = vec![
        json!({"rateLimits":{}}),
        json!({"rateLimits":{"primary":window()},"rateLimitsByLimitId":{"codex":{"primary":{ "usedPercent":1}}}}),
        json!({"rateLimits":[],"rateLimitsByLimitId":[{"primary":window()}]}),
    ];
    for root in [
        json!({}),
        json!({"planType":"root","credits":null,"rateLimitReachedType":"root","spendControlReached":false}),
    ] {
        inputs.push(json!({"rateLimits":root,"rateLimitsByLimitId":{"other":{"secondary":window(),"planType":"other"},"codex":{"primary":window(),"planType":"codex","credits":{"balance":"5"},"rateLimitReachedType":"primary","spendControlReached":true}}}));
        inputs.push(json!({"rateLimits":root,"rateLimitsByLimitId":{"9":{"primary":window(),"planType":"nine"},"2":{"secondary":window(),"planType":"two"}}}));
    }
    compare(vec![json!({"op":"nativequota.normalize","inputs":inputs})]).await;
}
#[tokio::test]
async fn usage_account_and_diagnostics_preserve_http_and_field_semantics() {
    let mut calls = vec![];
    for base in [
        "",
        " https://ollama.com/// ",
        "http://localhost:11434/",
        "/",
    ] {
        for response in [
            json!({"body":usage()}),
            json!({"status":404}),
            json!({"body":{}}),
            json!({"error":"network fixture"}),
        ] {
            calls.push(json!({"op":"nativequota.usage","base":base,"key":"fixture-key","replies":[response]}));
        }
    }
    for body in [
        Value::Null,
        json!(true),
        json!([]),
        json!({}),
        json!({"Email":"me@example.com","Name":"Me","Plan":"pro"}),
        json!({"email":false,"Email":"fallback","name":null,"Name":"Name"}),
    ] {
        calls.push(json!({"op":"nativequota.probe","options":{"baseUrl":"http://localhost:11434///","apiKey":"key"},"replies":[{"body":body}]}));
    }
    for response in [
        json!({"status":401}),
        json!({"error":"offline"}),
        json!({"raw":"{"}),
    ] {
        calls.push(json!({"op":"nativequota.probe","replies":[response]}));
    }
    for reachable in [true, false] {
        for cloud in [true, false] {
            for account in [
                Value::Null,
                json!({"email":"","name":"ignored","plan":"pro"}),
                json!({"email":null,"name":"Me","plan":"pro"}),
            ] {
                calls.push(json!({"op":"nativequota.gap","input":{"baseUrl":"http://fixture","cloud":cloud,"probe":{"reachable":reachable,"account":account}}}));
            }
        }
    }
    compare(calls).await;
}

#[cfg(unix)]
fn codex_fixture(mode: &str) -> (PathBuf, PathBuf) {
    use std::os::unix::fs::PermissionsExt;
    let directory = root()
        .join(".jait/artifacts/gateway-rust/provider-quota/codex")
        .join(uuid::Uuid::new_v4().to_string());
    std::fs::create_dir_all(&directory).unwrap();
    let command = directory.join("codex fixture;$ literal.cjs");
    let text=r##"#!/usr/bin/env node
const fs=require('node:fs'),path=require('node:path');
const mode=MODE;
fs.writeFileSync(path.join(__dirname,'pid'),String(process.pid));
process.on('SIGTERM',()=>{fs.writeFileSync(path.join(__dirname,'terminated'),'yes');process.exit(0);});
const lines=require('node:readline').createInterface({input:process.stdin});let initialize;
lines.on('line',line=>{
 const message=JSON.parse(line);
 if(message.id===1){
  initialize=message;
  if(mode==='exit'){process.stderr.write('  fixture CLI stopped \n',()=>process.exit(7));return;}
  if(mode==='timeout')return;
  if(mode==='oversize'){process.stdout.write('x'.repeat(300000)+'\n');return;}
  process.stdout.write('not-json\n'+JSON.stringify({method:'notice'})+'\n'+JSON.stringify({id:1,result:{}})+'\n');
 }else if(message.id===2){
  const result={rateLimits:{},rateLimitsByLimitId:{codex:{primary:{usedPercent:42.5,windowDurationMins:300,resetsAt:1770000000}}},fixture:{initialize,request:message,argv:process.argv.slice(2),home:process.env.HOME,codexHome:process.env.CODEX_HOME,key:process.env.OPENAI_API_KEY}};
  const envelope=mode==='error'?{id:2,error:{message:'fixture request rejected'}}:mode==='invalid'?{id:2,result:{rateLimits:{primary:{usedPercent:'bad'}}}}:{id:2,result};
  process.stdout.write(JSON.stringify(envelope)+'\n');
 }
});
"##.replace("MODE",&serde_json::to_string(mode).unwrap());
    std::fs::write(&command, text).unwrap();
    std::fs::set_permissions(&command, std::fs::Permissions::from_mode(0o700)).unwrap();
    (directory, command)
}
#[cfg(unix)]
#[tokio::test]
async fn real_codex_protocol_uses_literal_executable_isolates_home_and_reaps_child() {
    for mode in ["success", "error", "invalid", "exit", "timeout"] {
        let (directory, command) = codex_fixture(mode);
        compare(vec![json!({"op":"nativequota.codex","command":command,"home":directory,"timeout":if mode=="timeout"{150}else{2000}})]).await;
        let pid: std::ffi::c_int = std::fs::read_to_string(directory.join("pid"))
            .unwrap()
            .parse()
            .unwrap();
        // kill(pid,0) only observes this freshly launched, owned fixture.
        assert_eq!(
            unsafe { kill(pid, 0) },
            -1,
            "fixture child survived settlement: {pid}"
        );
        if mode != "exit" {
            assert!(
                directory.join("terminated").is_file(),
                "SIGTERM was not delivered"
            )
        }
    }
}
#[cfg(unix)]
#[tokio::test]
async fn codex_output_overflow_and_cancellation_drop_owned_child() {
    let (directory, command) = codex_fixture("oversize");
    let result = fetch_codex_rate_limits(
        &directory,
        &CodexRateLimitOptions {
            command,
            timeout_ms: 2000,
        },
    )
    .await;
    assert_eq!(
        result.unwrap_err(),
        "Codex usage response line exceeds 256 KiB"
    );
    let (directory, command) = codex_fixture("timeout");
    let home = directory.clone();
    let task = tokio::spawn(async move {
        fetch_codex_rate_limits(
            &home,
            &CodexRateLimitOptions {
                command,
                timeout_ms: 10000,
            },
        )
        .await
    });
    let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(2);
    while !directory.join("pid").exists() {
        assert!(tokio::time::Instant::now() < deadline);
        tokio::time::sleep(std::time::Duration::from_millis(10)).await;
    }
    let pid: std::ffi::c_int = std::fs::read_to_string(directory.join("pid"))
        .unwrap()
        .parse()
        .unwrap();
    task.abort();
    let _ = task.await;
    let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(2);
    while unsafe { kill(pid, 0) } == 0 {
        assert!(
            tokio::time::Instant::now() < deadline,
            "cancelled child was not reaped"
        );
        tokio::time::sleep(std::time::Duration::from_millis(10)).await;
    }
}

#[cfg(unix)]
unsafe extern "C" {
    fn kill(pid: std::ffi::c_int, signal: std::ffi::c_int) -> std::ffi::c_int;
}

#[tokio::test]
async fn real_http_usage_account_redirect_and_deadline_match_owned_loopback() {
    use axum::{
        Json, Router,
        http::{HeaderMap, StatusCode},
        response::IntoResponse,
        routing::{get, post},
    };
    let app = Router::new()
        .route(
            "/api/usage",
            get(|headers: HeaderMap| async move {
                let mut value = usage();
                value["header"] = json!(headers.get("authorization").and_then(|v| v.to_str().ok()));
                Json(value)
            }),
        )
        .route(
            "/api/me",
            post(|| async {
                Json(json!({"Email":"fixture@example.com","Name":"Fixture","Plan":"pro"}))
            }),
        )
        .route(
            "/redirect/api/usage",
            get(|| async { (StatusCode::FOUND, [("location", "/api/usage")], "").into_response() }),
        )
        .route(
            "/slow/api/usage",
            get(|| async {
                tokio::time::sleep(std::time::Duration::from_millis(200)).await;
                Json(usage())
            }),
        );
    let app = app.route(
        "/trickle/api/usage",
        get(|| async {
            use futures_util::StreamExt;
            let first = futures_util::stream::once(async {
                Ok::<_, std::io::Error>(axum::body::Bytes::from_static(b"{"))
            });
            let tail = futures_util::stream::once(async {
                tokio::time::sleep(std::time::Duration::from_millis(200)).await;
                Ok::<_, std::io::Error>(axum::body::Bytes::from_static(
                    b"\"limits\":{\"session\":{\"usage\":0.2,\"models\":[]}}}",
                ))
            });
            axum::body::Body::from_stream(first.chain(tail))
        }),
    );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    struct Server(tokio::task::JoinHandle<()>);
    impl Drop for Server {
        fn drop(&mut self) {
            self.0.abort();
        }
    }
    let _server = Server(tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    }));
    let base = format!("http://{address}");
    compare(vec![json!({"op":"nativequota.usage","real":true,"base":base,"key":"fixture-key"}),json!({"op":"nativequota.usage","real":true,"base":base.replace("http://","http://fixture-user:fixture-password@")}),json!({"op":"nativequota.usage","real":true,"base":format!("{base}/redirect"),"key":"fixture-key"}),json!({"op":"nativequota.probe","real":true,"options":{"baseUrl":base,"apiKey":"fixture-key"}}),json!({"op":"nativequota.usage","real":true,"base":format!("{base}/slow"),"timeout":50}),json!({"op":"nativequota.usage","real":true,"base":format!("{base}/trickle"),"timeout":50})]).await;
}

#[tokio::test]
async fn signed_transport_refuses_redirects_and_enforces_response_deadline() {
    use axum::{Json, Router, http::StatusCode, response::IntoResponse, routing::get};
    use std::sync::atomic::{AtomicUsize, Ordering};
    let visited = std::sync::Arc::new(AtomicUsize::new(0));
    let seen = visited.clone();
    let app = Router::new()
        .route(
            "/redirect",
            get(|| async {
                (StatusCode::FOUND, [("location", "/destination")], "").into_response()
            }),
        )
        .route(
            "/destination",
            get(move || {
                let seen = seen.clone();
                async move {
                    seen.fetch_add(1, Ordering::SeqCst);
                    Json(usage())
                }
            }),
        )
        .route(
            "/slow",
            get(|| async {
                tokio::time::sleep(std::time::Duration::from_millis(200)).await;
                Json(usage())
            }),
        );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    struct Server(tokio::task::JoinHandle<()>);
    impl Drop for Server {
        fn drop(&mut self) {
            self.0.abort();
        }
    }
    let _server = Server(tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    }));
    compare(vec![json!({"op":"nativequota.transport","url":format!("{base}/redirect"),"signed":true}),json!({"op":"nativequota.transport","url":format!("{base}/slow"),"signed":true,"timeout":50})]).await;
    assert_eq!(
        visited.load(Ordering::SeqCst),
        0,
        "a redirect forwarded the signature"
    );
}

#[tokio::test]
async fn native_http_body_ceiling_and_debug_redaction_are_enforced() {
    use axum::{Router, routing::get};
    let app = Router::new().route(
        "/large",
        get(|| async { format!("{{\"data\":\"{}\"}}", "x".repeat(2 * 1024 * 1024)) }),
    );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!(
        "http://fixture-user:fixture-password@{}/large",
        listener.local_addr().unwrap()
    );
    struct Server(tokio::task::JoinHandle<()>);
    impl Drop for Server {
        fn drop(&mut self) {
            self.0.abort();
        }
    }
    let _server = Server(tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    }));
    let request = OllamaAuthRequest {
        url,
        method: "GET",
        authorization: Some("fixture-signature".into()),
        accept: None,
        reject_redirects: true,
        timeout_ms: 2000,
    };
    let debug = format!("{request:?}");
    for secret in ["fixture-signature", "fixture-password", "fixture-user"] {
        assert!(!debug.contains(secret));
    }
    let result = ReqwestOllamaAuthTransport::new()
        .unwrap()
        .send(request)
        .await;
    assert_eq!(result.unwrap_err().message, "Ollama response exceeds 2 MiB");
}
