#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::security::{http_auth, preview_token, ssrf_guard::SsrfGuard};
use serde_json::{Value, json};
use std::{fs, path::PathBuf};

fn observe(calls: &[Value]) -> Vec<Value> {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap();
    let dir = root
        .join(".jait/artifacts/gateway-rust/native-security")
        .join(uuid::Uuid::new_v4().to_string());
    fs::create_dir_all(&dir).unwrap();
    internal_driver::call(&root, &dir, json!({"version":1,"calls":calls}), &|| false)
        .unwrap()
        .as_array()
        .unwrap()
        .clone()
}
#[test]
fn outbound_url_policy_matches_protocol_allowlist_and_all_private_address_boundaries() {
    let mut urls: Vec<String> = [
        "",
        "bad url",
        "/relative",
        "file:///etc/passwd",
        "ftp://example.org/a",
        "data:text/plain,hello",
        "https://example.org",
        "http://EXAMPLE.org:80/path?q=one#two",
        "http://user:pass@example.org",
        "http://資料.example",
        "http://localhost",
        "http://sub.LOCALHOST",
        "http://localhost.",
        "http://127.1",
        "http://2130706433",
        "http://0x7f000001",
        "http://[::]",
        "http://[::1]",
        "http://[fc00::1]",
        "http://[fdff::1]",
        "http://[fe7f::1]",
        "http://[fe80::1]",
        "http://[febf::1]",
        "http://[fec0::1]",
        "http://[ff02::1]",
        "http://[2001:db8::1]",
        "http://[2001:db9::1]",
        "http://[2606:4700:4700::1111]",
        "http://[::ffff:127.0.0.1]",
        "http://[::ffff:8.8.8.8]",
        "http://[::127.0.0.1]",
        "https://8.8.8.8",
        "https://example.org:443/",
    ]
    .into_iter()
    .map(String::from)
    .collect();
    for (network, prefix) in [
        ([0, 0, 0, 0], 8),
        ([10, 0, 0, 0], 8),
        ([127, 0, 0, 0], 8),
        ([100, 64, 0, 0], 10),
        ([169, 254, 0, 0], 16),
        ([172, 16, 0, 0], 12),
        ([192, 0, 0, 0], 24),
        ([192, 0, 2, 0], 24),
        ([192, 168, 0, 0], 16),
        ([198, 18, 0, 0], 15),
        ([198, 51, 100, 0], 24),
        ([203, 0, 113, 0], 24),
        ([224, 0, 0, 0], 4),
        ([240, 0, 0, 0], 4),
    ] {
        let base = u32::from(std::net::Ipv4Addr::from(network));
        let end = base | (u32::MAX >> prefix);
        for value in [base.saturating_sub(1), base, end, end.saturating_add(1)] {
            let ip = std::net::Ipv4Addr::from(value);
            urls.push(format!("http://{ip}"));
            urls.push(format!("https://[::ffff:{ip}]/a"));
        }
    }
    let mut calls = Vec::new();
    for (allow, hosts) in [
        (false, vec![]),
        (true, vec![]),
        (
            false,
            vec!["EXAMPLE.ORG".to_string(), "8.8.8.8".into(), "::1".into()],
        ),
        (true, vec!["localhost".into()]),
    ] {
        for raw in &urls {
            calls.push(json!({"op":"nativesecurity.url","raw":raw,"allowPrivateHosts":allow,"allowedHosts":hosts}));
        }
    }
    for chunk in calls.chunks(60) {
        let expected = observe(chunk);
        for (call, expected) in chunk.iter().zip(expected) {
            let guard = SsrfGuard {
                allow_private_hosts: call["allowPrivateHosts"].as_bool().unwrap(),
                allowed_hosts: serde_json::from_value(call["allowedHosts"].clone()).unwrap(),
            };
            let actual = match guard.validate(call["raw"].as_str().unwrap()) {
                Ok(url) => json!({"url":url.as_str()}),
                Err(error) => json!({"error":error}),
            };
            assert_eq!(actual, expected, "{call}");
        }
    }
}
#[test]
fn preview_tokens_cross_verify_and_remain_resource_scoped_and_separate_from_sessions() {
    let now = 1_800_000_000;
    for secret in ["secret", "  secret  ", "κλειδί 🦀"] {
        for user_id in ["owner", ""] {
            let call = json!({"op":"nativesecurity.previewSign","secret":secret,"now":now,"userId":user_id,"resource":"terminal:資料"});
            let signed = observe(&[call]);
            let token = signed[0]["token"].as_str().unwrap();
            assert_eq!(
                preview_token::verify_preview_token_at(token, "terminal:資料", secret, now),
                Some(user_id.into())
            );
            assert_eq!(
                preview_token::verify_preview_token_at(token, "terminal:other", secret, now),
                None
            );
            assert_eq!(
                preview_token::verify_preview_token_at(token, "terminal:資料", "wrong", now),
                None
            );
            assert_eq!(
                preview_token::verify_preview_token_at(token, "terminal:資料", secret, now + 3600),
                None
            );
            assert_eq!(http_auth::verify_auth_token_at(token, secret, now), None);
            let token = preview_token::sign_preview_token_at(user_id, "terminal:資料", secret, now)
                .unwrap();
            assert_eq!(
                observe(&[
                    json!({"op":"nativesecurity.previewVerify","secret":secret,"now":now,"token":token,"resource":"terminal:資料"})
                ])[0],
                json!(user_id)
            );
        }
    }
    let session = http_auth::sign_auth_token_at(
        &http_auth::AuthUser {
            id: "owner".into(),
            username: "alice".into(),
        },
        "secret",
        now,
    )
    .unwrap();
    assert_eq!(
        preview_token::verify_preview_token_at(&session, "terminal:資料", "secret", now),
        None
    );
}
#[test]
fn preview_claim_types_expiry_and_critical_headers_match_jose() {
    let now = 1_800_000_000;
    let base = json!({"purpose":"preview","resource":"surface:1","sub":"owner"});
    let mut calls = Vec::new();
    for (key, values) in [
        (
            "purpose",
            vec![Value::Null, json!("session"), json!(true), json!([])],
        ),
        (
            "resource",
            vec![Value::Null, json!("surface:2"), json!(false), json!(1)],
        ),
        ("sub", vec![Value::Null, json!(""), json!(42), json!({})]),
        (
            "exp",
            vec![
                json!(now - 1),
                json!(now),
                json!(now + 1),
                Value::Null,
                json!("future"),
            ],
        ),
        (
            "nbf",
            vec![
                json!(now - 1),
                json!(now),
                json!(now + 1),
                Value::Null,
                json!("past"),
            ],
        ),
        ("iat", vec![json!(now + 1), Value::Null, json!("now")]),
    ] {
        for value in values {
            let mut payload = base.clone();
            payload[key] = value;
            calls.push(json!({"op":"nativesecurity.previewFixture","secret":"secret","now":now,"payload":payload,"resource":"surface:1"}));
        }
    }
    for header in [
        json!({"alg":"HS256"}),
        json!({"alg":"HS384"}),
        json!({"alg":"none"}),
        json!({"alg":"HS256","crit":["unknown"],"unknown":true}),
        json!({"alg":"HS256","crit":[]}),
        json!({"alg":"HS256","crit":["b64"],"b64":true}),
        json!({"alg":"HS256","crit":["b64"],"b64":false}),
        json!({"alg":"HS256","crit":["b64","b64"],"b64":true}),
    ] {
        calls.push(json!({"op":"nativesecurity.previewFixture","secret":"secret","now":now,"payload":base,"header":header,"resource":"surface:1"}));
    }
    for payload in [Value::Null, json!([]), json!("text"), json!(42)] {
        calls.push(json!({"op":"nativesecurity.previewFixture","secret":"secret","now":now,"payload":payload,"resource":"surface:1"}));
    }
    for chunk in calls.chunks(60) {
        for reference in observe(chunk) {
            assert_eq!(
                json!(preview_token::verify_preview_token_at(
                    reference["token"].as_str().unwrap(),
                    "surface:1",
                    "secret",
                    now
                )),
                reference["userId"]
            );
        }
    }
}

#[test]
fn preview_empty_signing_key_is_rejected_like_jose() {
    let now = 1_800_000_000;
    let reference = observe(&[
        json!({"op":"nativesecurity.previewSign","secret":"","now":now,"userId":"owner","resource":"surface:1"}),
    ]);
    let error = preview_token::sign_preview_token_at("owner", "surface:1", "", now).unwrap_err();
    assert_eq!(json!(error.to_string()), reference[0]["error"]);
    let reference = observe(&[
        json!({"op":"nativesecurity.previewFixture","secret":"","now":now,"payload":{"purpose":"preview","resource":"surface:1","sub":"owner"},"resource":"surface:1"}),
    ]);
    assert_eq!(reference[0]["userId"], Value::Null);
    assert_eq!(
        preview_token::verify_preview_token_at(
            reference[0]["token"].as_str().unwrap(),
            "surface:1",
            "",
            now
        ),
        None
    );
}
