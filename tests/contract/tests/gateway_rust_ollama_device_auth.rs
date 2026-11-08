#[path = "../src/internal_driver.rs"]
mod internal_driver;
use base64::{Engine, engine::general_purpose::STANDARD};
use ed25519_dalek::SigningKey;
use futures_util::future::BoxFuture;
use jait_gateway::services::ollama_device_auth::*;
use jait_gateway::services::ollama_usage_setup::{UsageHost, is_local_ollama_url};
use serde_json::{Value, json};
use std::{
    collections::VecDeque,
    path::PathBuf,
    sync::{Arc, Mutex},
};
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}
fn host(call: &Value) -> UsageHost {
    UsageHost {
        host: "fixture".into(),
        platform: call["platform"].as_str().unwrap_or("linux").into(),
        gateway_user: "fixture".into(),
        uid: 1,
        home_dir: call["home"].as_str().unwrap_or("/fixture/home").into(),
        configured_key_path: call["configured"].as_str().map(str::to_owned),
    }
}
fn uint(value: u32) -> Vec<u8> {
    value.to_be_bytes().to_vec()
}
fn field(bytes: &[u8]) -> Vec<u8> {
    [uint(bytes.len() as u32), bytes.to_vec()].concat()
}
fn ssh(raw: &[u8]) -> Vec<u8> {
    [field(b"ssh-ed25519"), field(raw)].concat()
}
fn raw_key(seed: u8) -> Vec<u8> {
    let public = SigningKey::from_bytes(&[seed; 32])
        .verifying_key()
        .to_bytes();
    let private = [vec![seed; 32], public.to_vec()].concat();
    let inner = [
        uint(42),
        uint(42),
        field(b"ssh-ed25519"),
        field(&public),
        field(&private),
        field(b"fixture"),
        vec![1, 2, 3, 4],
    ]
    .concat();
    [
        b"openssh-key-v1\0".to_vec(),
        field(b"none"),
        field(b"none"),
        field(b""),
        uint(1),
        field(&ssh(&public)),
        field(&inner),
    ]
    .concat()
}
fn pem(raw: &[u8]) -> String {
    format!(
        "-----BEGIN OPENSSH PRIVATE KEY-----\n{}\n-----END OPENSSH PRIVATE KEY-----",
        STANDARD.encode(raw)
    )
}
fn key(seed: u8) -> String {
    pem(&raw_key(seed))
}
fn usage() -> Value {
    json!({"limits":{"session":{"usage":0.5,"models":[]},"weekly":{"usage":0.1,"models":["model"]}}})
}
fn activity() -> Value {
    json!({"range":"7d","scope":"self","granularity":"day","from":"2026-09-30T00:00:00Z","until":"2026-10-07T11:29:42Z","totals":{"request_count":10388},"buckets":[]})
}

struct FakeHttp {
    replies: Mutex<VecDeque<Value>>,
    sent: Mutex<Vec<Value>>,
}
impl OllamaAuthTransport for FakeHttp {
    fn send<'a>(
        &'a self,
        request: OllamaAuthRequest,
    ) -> BoxFuture<'a, Result<OllamaAuthResponse, OllamaAuthError>> {
        self.sent
            .lock()
            .unwrap()
            .push(serde_json::to_value(request).unwrap());
        let reply = self
            .replies
            .lock()
            .unwrap()
            .pop_front()
            .expect("fixture request count");
        Box::pin(async move {
            if let Some(error) = reply["error"].as_str() {
                return Err(OllamaAuthError::transport(
                    reply["name"].as_str().unwrap_or("Error").into(),
                    error.into(),
                    reply["status"].as_u64().map(|s| s as u16),
                ));
            }
            Ok(OllamaAuthResponse {
                status: reply["status"].as_u64().unwrap_or(200) as u16,
                body: Ok(reply["body"].clone()),
            })
        })
    }
}
struct FakeReader {
    replies: Mutex<VecDeque<Value>>,
    reads: Mutex<Vec<String>>,
}
impl OllamaDeviceKeyReader for FakeReader {
    fn read<'a>(&'a self, path: &'a str) -> BoxFuture<'a, Result<DeviceKeyRead, String>> {
        self.reads.lock().unwrap().push(path.into());
        let reply = self.replies.lock().unwrap().pop_front();
        Box::pin(async move {
            match reply {
                Some(reply) if reply["error"] != true => {
                    Ok(DeviceKeyRead::Pem(reply["pem"].as_str().unwrap().into()))
                }
                _ => Err("EACCES private path must not escape".into()),
            }
        })
    }
}
async fn native(call: &Value) -> Value {
    let http = Arc::new(FakeHttp {
        replies: Mutex::new(
            call["replies"]
                .as_array()
                .cloned()
                .unwrap_or_default()
                .into(),
        ),
        sent: Mutex::new(vec![]),
    });
    let reader = Arc::new(FakeReader {
        replies: Mutex::new(call["reads"].as_array().cloned().unwrap_or_default().into()),
        reads: Mutex::new(vec![]),
    });
    let clock = call["now"].as_i64().unwrap_or(1234567);
    let service = OllamaDeviceAuth::standard(http.clone(), reader.clone(), host(call))
        .with_clock(Arc::new(move || clock));
    let result=match call["op"].as_str().unwrap(){
  "local"=>Ok(json!(call["urls"].as_array().unwrap().iter().map(|url|is_local_ollama_url(url.as_str().unwrap())).collect::<Vec<_>>())),
  "paths"=>Ok(json!(ollama_device_key_paths(&host(call)))),
  "parse"=>parse_ollama_device_key(call["pem"].as_str().unwrap()).map(|key|json!({"signature":sign_ollama_request(&key,call["method"].as_str().unwrap_or("GET"),call["path"].as_str().unwrap_or("/api/usage"),call["timestamp"].as_str().unwrap_or("123"))})),
  "device"=>{
   let account:OllamaCloudAccount=serde_json::from_value(call["account"].clone()).unwrap();
   match call["pem"].as_str().map(parse_ollama_device_key).transpose(){Ok(key)=>service.fetch_ollama_device_usage(&account,key.as_ref()).await,Err(error)=>Err(error)}
  }
  "signed"=>service.fetch_signed_in_ollama_usage(call["base"].as_str().unwrap(),&serde_json::from_value(call["account"].clone()).unwrap()).await,
  _=>panic!("unknown operation"),
 };
    let sent = http.sent.lock().unwrap().clone();
    let reads = reader.reads.lock().unwrap().clone();
    match result {
        Ok(value) => json!({"value":value,"sent":sent,"reads":reads}),
        Err(error) => json!({"error":error,"sent":sent,"reads":reads}),
    }
}
async fn compare(calls: Vec<Value>) {
    for batch in calls.chunks(16) {
        let input = batch.to_vec();
        let directory = root();
        let expected = tokio::task::spawn_blocking(move || {
            internal_driver::call(
                &directory,
                &directory
                    .join(".jait/artifacts/gateway-rust/ollama-device-auth/reference")
                    .join(uuid::Uuid::new_v4().to_string()),
                json!({"version":1,"calls":input.into_iter().map(|mut call|{let operation=call["op"].as_str().unwrap().to_owned();call["op"]=json!(format!("nativeollamaauth.{operation}"));call}).collect::<Vec<_>>()}),
                &|| false,
            )
            .unwrap()
        })
        .await
        .unwrap();
        assert_eq!(expected.as_array().unwrap().len(), batch.len());
        for (call, expected) in batch.iter().zip(expected.as_array().unwrap()) {
            let actual = native(call).await;
            if &actual != expected {
                let file = root()
                    .join(".jait/artifacts/gateway-rust/ollama-device-auth")
                    .join(format!("mismatch-{}.json", uuid::Uuid::new_v4()));
                std::fs::write(
                    &file,
                    serde_json::to_vec_pretty(
                        &json!({"call":call,"actual":actual,"expected":expected}),
                    )
                    .unwrap(),
                )
                .unwrap();
                panic!("auth mismatch: {}", file.display());
            }
        }
    }
}
fn account() -> Value {
    json!({"email":"me@example.com","name":"me","plan":"pro"})
}
fn signed(base: &str, replies: Vec<Value>) -> Value {
    json!({"op":"signed","base":base,"account":account(),"configured":"/fixture/operator-key","reads":[{"pem":key(7)}],"replies":replies})
}
#[tokio::test]
async fn scope_and_operator_key_paths_match_real_exports() {
    let mut calls = vec![
        json!({"op":"local","urls":["http://localhost:11434","https://localhost","http://127.1","http://2130706433","http://0x7f000001","https://[::1]:123/","http://remote:11434","http://localhost.evil","http://localhost./","http://127.0.0.2","file:///tmp/key","http://user@localhost","http://:x@localhost","http://localhost/path","http://localhost/?x=1","http://localhost/#x","http://localhost?#"," http://LOCALHOST/ ","bad"]}),
    ];
    for platform in ["linux", "darwin", "win32"] {
        for configured in [
            Value::Null,
            json!(""),
            json!("\u{feff} /fixture/custom.key \n"),
        ] {
            calls.push(json!({"op":"paths","platform":platform,"home":"/fixture/home/../user","configured":configured}));
        }
    }
    compare(calls).await;
}
#[tokio::test]
async fn ed25519_import_and_signature_bytes_match_node_crypto() {
    let mut calls = vec![];
    for seed in [0, 7, 255] {
        for (method, path, timestamp) in [
            ("GET", "/api/usage", "123"),
            ("POST", "/api/me", "0"),
            ("POST", "/api/me?x=1", "-1"),
            ("a,b", "/unicode/😀\n", "text"),
        ] {
            calls.push(json!({"op":"parse","pem":key(seed),"method":method,"path":path,"timestamp":timestamp}));
        }
    }
    compare(calls).await;
}
#[tokio::test]
async fn malformed_and_truncated_wire_keys_fail_without_panics() {
    let raw = raw_key(7);
    let mut calls = vec![];
    for length in (0..raw.len()).step_by(3) {
        calls.push(json!({"op":"parse","pem":pem(&raw[..length])}));
    }
    for index in [0, 14, 18, 22, 26, 31, 35, 45, 65, 85, 120, 150, 180, 200] {
        if index < raw.len() {
            let mut changed = raw.clone();
            changed[index] ^= 1;
            calls.push(json!({"op":"parse","pem":pem(&changed)}));
        }
    }
    calls.extend([
        json!({"op":"parse","pem":"not a key"}),
        json!({"op":"parse","pem":format!("{}{}"," ".repeat(16385),key(7))}),
    ]);
    compare(calls).await;
}
#[tokio::test]
async fn allowed_padding_whitespace_comments_and_trailing_bytes_match() {
    let normal = key(7);
    let mut trailing = raw_key(7);
    trailing.extend_from_slice(&[0, 1, 255]);
    let mut calls = vec![];
    for value in [
        normal.clone(),
        format!("\u{feff}\n{normal}\n "),
        normal.replace('=', ""),
        normal.replace("\n", "\n\u{2003}"),
        pem(&trailing),
        normal.replace("\n-----END", "===ignored\n-----END"),
    ] {
        calls.push(json!({"op":"parse","pem":value}));
    }
    compare(calls).await;
}
#[tokio::test]
async fn local_404_is_the_only_credential_fallback() {
    let mut calls = vec![
        signed("http://localhost:11434", vec![json!({"body":usage()})]),
        signed(
            "http://localhost:11434",
            vec![
                json!({"status":404}),
                json!({"body":account()}),
                json!({"body":usage()}),
            ],
        ),
        signed(
            "http://127.1",
            vec![
                json!({"status":404}),
                json!({"body":account()}),
                json!({"body":activity()}),
            ],
        ),
    ];
    for (base, status) in [
        ("http://remote:11434", 404),
        ("http://localhost:11434", 401),
        ("http://localhost:11434", 500),
        ("http://localhost/path", 404),
    ] {
        calls.push(signed(
            base,
            vec![
                json!({"status":status}),
                json!({"body":account()}),
                json!({"body":usage()}),
            ],
        ));
    }
    calls.push(signed(
        "http://localhost:11434",
        vec![json!({"error":"synthetic network failure","name":"OllamaUsageError","status":404})],
    ));
    compare(calls).await;
}
#[tokio::test]
async fn account_identity_and_usage_rejections_precede_further_requests() {
    let mut calls = vec![];
    for response in [
        Value::Null,
        json!({}),
        json!({"email":"someone@example.com","name":"me"}),
        json!({"email":false,"Email":"me@example.com"}),
        json!({"Email":"me@example.com"}),
        json!({"email":null,"Email":"me@example.com"}),
    ] {
        calls.push(json!({"op":"device","pem":key(7),"account":account(),"replies":[{"body":response},{"body":usage()}]}));
    }
    for name in [Value::Null, json!(""), json!("me")] {
        calls.push(json!({"op":"device","pem":key(7),"account":{"email":null,"name":name,"plan":null},"replies":[{"body":{"Name":"me"}},{"body":usage()}]}));
    }
    calls.push(json!({"op":"device","pem":key(7),"account":account(),"replies":[{"body":account()},{"body":{"limits":{}}}]}));
    for status in [301, 401, 429, 500] {
        calls.push(
            json!({"op":"device","pem":key(7),"account":account(),"replies":[{"status":status}]}),
        );
    }
    compare(calls).await;
}
#[tokio::test]
async fn balance_and_legacy_fallback_match_reference() {
    let balance = json!({"included":{"allowance_usd":20,"balance_usd":5,"period":{"until":"2026-12-01T00:00:00Z"},"session":{"remaining_percent":75,"resets_at":"2026-11-08T00:00:00Z"}},"purchased":{"balance_usd":3}});
    compare(vec![
        json!({"op":"device","pem":key(7),"account":account(),"replies":[{"body":account()},{"body":balance}]}),
        json!({"op":"device","pem":key(7),"account":account(),"replies":[{"body":account()},{"status":404},{"body":usage()}]}),
        json!({"op":"device","pem":key(7),"account":account(),"replies":[{"body":account()},{"body":{"included":{"allowance_usd":1,"balance_usd":1,"period":{"until":"invalid"}}}}]}),
    ]).await;
}
#[tokio::test]
async fn key_read_failures_are_redacted_and_first_readable_invalid_key_stops() {
    let mut calls = vec![];
    for reads in [
        json!([{"error":true},{"error":true}]),
        json!([{"error":true},{"pem":key(7)}]),
        json!([{"pem":"bad"},{"pem":key(7)}]),
    ] {
        calls.push(json!({"op":"device","account":account(),"reads":reads,"replies":[{"body":account()},{"body":usage()}]}));
    }
    let mut configured = signed("http://localhost", vec![json!({"status":404})]);
    configured["reads"] = json!([{"error":true}]);
    calls.push(configured);
    compare(calls).await;
}

#[tokio::test]
async fn system_reader_bounds_operator_key_files_and_redacts_read_failures() {
    let directory = root()
        .join(".jait/artifacts/gateway-rust/ollama-device-auth/reader")
        .join(uuid::Uuid::new_v4().to_string());
    std::fs::create_dir_all(&directory).unwrap();
    let reader = SystemDeviceKeyReader;
    let valid = directory.join("operator.key");
    std::fs::write(&valid, key(7)).unwrap();
    let DeviceKeyRead::Pem(text) = reader.read(valid.to_str().unwrap()).await.unwrap() else {
        panic!("expected key text")
    };
    let parsed = parse_ollama_device_key(&text).unwrap();
    assert_eq!(format!("{parsed:?}"), "OllamaDeviceKey(REDACTED)");
    std::fs::write(&valid, vec![b'a'; 65_537]).unwrap();
    assert!(matches!(
        reader.read(valid.to_str().unwrap()).await.unwrap(),
        DeviceKeyRead::Invalid
    ));
    let missing = directory.join("secret-operator-identifier");
    assert_eq!(
        reader
            .read(missing.to_str().unwrap())
            .await
            .err()
            .as_deref(),
        Some("unreadable")
    );
    std::fs::remove_dir_all(directory).unwrap();
}
