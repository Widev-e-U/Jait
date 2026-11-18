//! Native security boundary against the actual TypeScript authentication functions.
#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::security::{http_auth as auth, ownership};
use serde_json::{Value, json};
use std::{fs, path::PathBuf};

fn observe(calls: Value) -> Value {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap();
    let directory = root
        .join(".jait/artifacts/gateway-rust/native-auth")
        .join(uuid::Uuid::new_v4().to_string());
    fs::create_dir_all(&directory).unwrap();
    internal_driver::call(
        &root,
        &directory,
        json!({"version":1,"calls":calls}),
        &|| false,
    )
    .unwrap()
}
fn user() -> auth::AuthUser {
    auth::AuthUser {
        id: "owner-1".into(),
        username: "資料 🦀".into(),
    }
}
#[test]
fn public_allowlist_and_bearer_parsing_match_reference_exactly() {
    let mut paths = vec![
        "/health",
        "/api/auth/logout",
        "/api/sessions",
        "/api/github-apps",
    ];
    paths.extend([
        "/api/auth/login",
        "/api/auth/register",
        "/api/auth/refresh",
        "/api/mobile/discovery",
        "/api/email/oauth/callback",
        "/api/calendar/oauth/callback",
        "/api/github/apps/callback",
        "/api/github/apps/webhook",
    ]);
    let paths: Vec<String> = paths
        .into_iter()
        .flat_map(|p| {
            [
                p.to_string(),
                format!("{p}/"),
                format!("{p}/extra"),
                format!("/prefix{p}"),
            ]
        })
        .collect();
    let expected = observe(json!(
        paths
            .iter()
            .map(|path| json!({"op":"auth.public","path":path}))
            .collect::<Vec<_>>()
    ));
    for (i, path) in paths.iter().enumerate() {
        assert_eq!(json!(auth::is_public_api_path(path)), expected[i], "{path}");
    }
    let headers = json!([
        null,
        42,
        [],
        {},
        "Bearer abc",
        "bEaReR  abc ",
        " Basic abc",
        "Bearer   ",
        "Bearer\tabc",
        "\u{feff}Bearer abc\u{feff}",
        "\u{85}Bearer abc",
        "bearer 🦀",
        "BEARER x y",
        "ééé abc"
    ]);
    let expected = observe(json!(
        headers
            .as_array()
            .unwrap()
            .iter()
            .map(|header| json!({"op":"auth.bearer","header":header}))
            .collect::<Vec<_>>()
    ));
    for (i, header) in headers.as_array().unwrap().iter().enumerate() {
        assert_eq!(
            json!(auth::extract_bearer_token(header.as_str())),
            expected[i],
            "{header}"
        );
    }
    assert_eq!(auth::AUTH_COOKIE_NAME, "jait_token");
}
#[test]
fn signing_and_verifying_are_bidirectionally_compatible_and_keep_original_secret_bytes() {
    let now = 1_800_000_000;
    for secret in ["secret", "  secret  ", "κλειδί 🦀"] {
        let expected =
            observe(json!([{"op":"nativeauth.sign","now":now,"user":user(),"secret":secret}]));
        let native = auth::sign_auth_token_at(&user(), secret, now).unwrap();
        assert_eq!(
            auth::verify_auth_token_at(expected[0]["token"].as_str().unwrap(), secret, now),
            Some(user())
        );
        assert_eq!(
            observe(json!([{"op":"nativeauth.verify","now":now,"token":native,"secret":secret}]))
                [0],
            json!(user())
        );
        assert_eq!(auth::verify_auth_token_at(&native, "wrong", now), None);
        assert_eq!(
            auth::verify_auth_token_at(&native, secret, now + 604800),
            None
        );
    }
    for secret in ["", " \t\u{feff}"] {
        let expected = observe(json!([{"op":"nativeauth.sign","user":user(),"secret":secret}]));
        assert_eq!(
            expected[0]["error"],
            auth::sign_auth_token(&user(), secret)
                .unwrap_err()
                .to_string()
        );
    }
}
#[test]
fn signed_claim_and_header_matrix_matches_jose_including_expiry_and_purpose() {
    let now = 1_800_000_000u64;
    let base = json!({"sub":"owner-1","username":"資料 🦀"});
    let mut fixtures = vec![(base.clone(), json!({"alg":"HS256"}))];
    for (claim, values) in [
        ("sub", vec![Value::Null, json!(""), json!(4), json!([])]),
        (
            "username",
            vec![Value::Null, json!(""), json!(4), json!({})],
        ),
        (
            "purpose",
            vec![
                Value::Null,
                json!(false),
                json!(0),
                json!(""),
                json!("preview"),
                json!([]),
                json!({}),
                json!(true),
            ],
        ),
        (
            "exp",
            vec![
                json!(now - 1),
                json!(now),
                json!(now + 1),
                json!(now as f64 + 0.5),
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
                json!(now as f64 + 0.5),
                Value::Null,
                json!("past"),
            ],
        ),
        (
            "iat",
            vec![json!(now + 100), json!(0), Value::Null, json!("now")],
        ),
        ("aud", vec![json!("other"), json!(["other"]), json!(42)]),
    ] {
        for value in values {
            let mut payload = base.clone();
            payload[claim] = value;
            fixtures.push((payload, json!({"alg":"HS256","typ":"JWT"})));
        }
    }
    for header in [
        json!({"alg":"HS384"}),
        json!({"alg":"none"}),
        json!({"alg":"HS256","typ":"other"}),
        json!({"alg":"HS256","crit":["unknown"],"unknown":true}),
        json!({"alg":"HS256","crit":[]}),
        json!({"alg":"HS256","crit":["b64"],"b64":true}),
        json!({"alg":"HS256","crit":["b64"],"b64":false}),
        json!({"alg":"HS256","crit":["b64"]}),
        json!({"alg":"HS256","crit":"b64"}),
        json!({"alg":"HS256","b64":false}),
        json!({"alg":"HS256","custom":{"x":true}}),
        json!({"alg":"HS256","crit":["b64","b64"],"b64":true}),
        json!({"alg":"HS256","b64":"bad"}),
    ] {
        fixtures.push((base.clone(), header));
    }
    fixtures.extend(
        [Value::Null, json!([]), json!("text"), json!(42)]
            .into_iter()
            .map(|p| (p, json!({"alg":"HS256"}))),
    );
    for chunk in fixtures.chunks(60) {
        let expected=observe(json!(chunk.iter().map(|(payload,header)|json!({"op":"nativeauth.fixture","now":now,"secret":"test secret","payload":payload,"header":header})).collect::<Vec<_>>()));
        for (i, (payload, header)) in chunk.iter().enumerate() {
            let token = expected[i]["token"].as_str().unwrap();
            assert_eq!(
                json!(auth::verify_auth_token_at(token, "test secret", now)),
                expected[i]["user"],
                "payload {payload}, header {header}"
            );
            let mut corrupt = token.as_bytes().to_vec();
            let end = corrupt.len() - 4;
            corrupt[end] = if corrupt[end] == b'A' { b'B' } else { b'A' };
            assert_eq!(
                auth::verify_auth_token_at(
                    std::str::from_utf8(&corrupt).unwrap(),
                    "test secret",
                    now
                ),
                None
            );
        }
    }
    for token in ["", "abc", "a.b.c", "a.b.c.d", "🦀.e30.x"] {
        assert_eq!(auth::verify_auth_token(token, "secret"), None);
    }
}
#[test]
fn bearer_precedence_cookie_fallback_and_denial_responses_match_reference() {
    let token = auth::sign_auth_token(&user(), "secret").unwrap();
    let fixtures = vec![
        (None, None),
        (Some("Basic ignored".into()), Some(token.clone())),
        (Some("Bearer wrong".into()), Some(token.clone())),
        (Some(format!("Bearer {token}")), Some("wrong".into())),
        (Some("Bearer  ".into()), Some(token.clone())),
        (None, Some(token.clone())),
        (None, Some("".into())),
        (None, Some("wrong".into())),
    ];
    for (authorization, cookie) in fixtures {
        for mode in ["require", "resolve"] {
            let expected = observe(
                json!([{"op":format!("nativeauth.{mode}"),"authorization":authorization,"cookie":cookie,"secret":"secret"}]),
            );
            let native = auth::resolve_auth(authorization.as_deref(), cookie.as_deref(), "secret");
            let result = if mode == "require" {
                match auth::require_auth(authorization.as_deref(), cookie.as_deref(), "secret") {
                    Ok(user) => json!({"user":user,"status":200,"body":null}),
                    Err((status, body)) => json!({"user":null,"status":status,"body":body}),
                }
            } else {
                json!({"user":native,"status":200,"body":null})
            };
            assert_eq!(result, expected[0]);
        }
    }
}
#[test]
fn ownership_hides_missing_null_and_foreign_resources_with_exact_response() {
    for resource in [
        Value::Null,
        json!({"userId":null}),
        json!({"userId":"foreign"}),
        json!({"userId":"owner-1"}),
    ] {
        let expected = observe(
            json!([{"op":"nativeauth.owner","resource":resource,"userId":"owner-1","message":"session not found"}]),
        );
        let owner = resource
            .as_object()
            .map(|r| r.get("userId").and_then(Value::as_str));
        let native = match ownership::assert_ownership(owner, "owner-1", "session not found") {
            Ok(()) => json!({"allowed":true,"status":200,"body":null}),
            Err((status, body)) => json!({"allowed":false,"status":status,"body":body}),
        };
        assert_eq!(native, expected[0]);
    }
}

#[test]
fn signed_base64url_padding_and_ascii_whitespace_match_reference() {
    let now = 1_800_000_000u64;
    for encoding in ["padding", "whitespace"] {
        let reference = observe(
            json!([{"op":"nativeauth.fixture","secret":"secret","now":now,"payload":{"sub":"id","username":"name"},"encoding":encoding}]),
        );
        assert_eq!(
            json!(auth::verify_auth_token_at(
                reference[0]["token"].as_str().unwrap(),
                "secret",
                now
            )),
            reference[0]["user"],
            "{encoding}"
        );
    }
}
