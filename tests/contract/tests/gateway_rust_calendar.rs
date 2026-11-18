#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::services::calendar::{
    self, Request, Response, Transport, google::GoogleCalendarClient, oauth::*,
};
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    fs,
    path::PathBuf,
    sync::{Arc, Mutex},
};
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}
fn reference(call: Value) -> Value {
    let dir = root()
        .join(".jait/artifacts/gateway-rust/calendar")
        .join(uuid::Uuid::new_v4().to_string());
    fs::create_dir_all(&dir).unwrap();
    internal_driver::call(&root(), &dir, json!({"version":1,"calls":[call]}), &|| {
        false
    })
    .unwrap()[0]
        .clone()
}
fn canonical(v: &mut Value) {
    match v {
        Value::Number(n) => {
            if let Some(f) = n.as_f64()
                && f.fract() == 0.0
                && f >= i64::MIN as f64
                && f < i64::MAX as f64
            {
                *v = json!(f as i64);
            }
        }
        Value::Array(a) => {
            for v in a {
                canonical(v)
            }
        }
        Value::Object(o) => {
            for v in o.values_mut() {
                canonical(v)
            }
        }
        _ => {}
    }
}
#[test]
fn calendar_env_credential_precedence_blank_unicode_and_independent_fallbacks() {
    let values = vec![
        json!({}),
        json!({"GOOGLE_CALENDAR_OAUTH_CLIENT_ID":"a"}),
        json!({"GMAIL_OAUTH_CLIENT_ID":" legacy ","GMAIL_OAUTH_CLIENT_SECRET":" secret "}),
        json!({"GOOGLE_CALENDAR_OAUTH_CLIENT_ID":" \u{feff}primary\n","GOOGLE_CALENDAR_OAUTH_CLIENT_SECRET":" p ","GMAIL_OAUTH_CLIENT_ID":"legacy","GMAIL_OAUTH_CLIENT_SECRET":"s"}),
        json!({"GOOGLE_CALENDAR_OAUTH_CLIENT_ID":"\u{0085}","GOOGLE_CALENDAR_OAUTH_CLIENT_SECRET":" ","GMAIL_OAUTH_CLIENT_SECRET":" legacy secret "}),
        json!({"GOOGLE_CALENDAR_OAUTH_CLIENT_ID":"primary","GMAIL_OAUTH_CLIENT_SECRET":"fallback"}),
        json!({"GMAIL_OAUTH_CLIENT_ID":"fallback","GOOGLE_CALENDAR_OAUTH_CLIENT_SECRET":"primary"}),
    ];
    let actual: Vec<_> = values
        .iter()
        .map(|v| {
            calendar_credentials_from_env(
                &serde_json::from_value::<HashMap<String, String>>(v.clone()).unwrap(),
            )
        })
        .collect();
    assert_eq!(
        json!(actual),
        reference(json!({"op":"nativecalendar.env","values":values}))
    );
}
#[test]
fn calendar_authorization_form_encoding_and_pkce_use_sha256_and_fresh_32_byte_entropy() {
    let values = vec![
        json!({"credentials":{"clientId":"id + &='😀","clientSecret":"not-in-url"},"redirectUri":"http://127.0.0.1:8220/callback?x=1&b=2","state":"state !~()*'","codeChallenge":"challenge-_/+="}),
        json!({"credentials":{"clientId":"","clientSecret":"x"},"redirectUri":"","state":"","codeChallenge":""}),
    ];
    let actual: Vec<_> = values
        .iter()
        .map(|v| {
            build_calendar_authorize_url(
                &serde_json::from_value(v["credentials"].clone()).unwrap(),
                v["redirectUri"].as_str().unwrap(),
                v["state"].as_str().unwrap(),
                v["codeChallenge"].as_str().unwrap(),
            )
        })
        .collect();
    assert_eq!(
        json!(actual),
        reference(json!({"op":"nativecalendar.authorize","values":values}))
    );
    let mut native = vec![];
    for _ in 0..50 {
        native.push(create_calendar_pkce().unwrap());
    }
    native.push(calendar_pkce_from_entropy([0; 32]));
    native.push(calendar_pkce_from_entropy(std::array::from_fn(|i| i as u8)));
    let verifiers: Vec<_> = native.iter().map(|v| v["verifier"].clone()).collect();
    let expected = reference(json!({"op":"nativecalendar.pkce","verifiers":verifiers}));
    for (i, v) in native.iter().enumerate() {
        assert_eq!(v["challenge"], expected["expected"][i]);
    }
    let mut seen = std::collections::HashSet::new();
    for v in native
        .iter()
        .take(50)
        .chain(expected["generated"].as_array().unwrap())
    {
        for key in ["verifier", "challenge"] {
            let s = v[key].as_str().unwrap();
            assert_eq!(s.len(), 43);
            assert!(
                s.bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
            );
        }
        assert!(seen.insert(v["verifier"].as_str().unwrap()));
    }
}
async fn compare(steps: Value) {
    let call = json!({"op":"nativecalendar.http","now":1700000000123i64,"token":" token ","credentials":{"clientId":"client +","clientSecret":"secret&="},"steps":steps});
    let mut expected = reference(call.clone());
    let requests = Arc::new(Mutex::new(vec![]));
    let current = Arc::new(Mutex::new(Value::Null));
    let r = requests.clone();
    let c = current.clone();
    let transport: Transport = Arc::new(move |request| {
        r.lock().unwrap().push(json!(request));
        let step = c.lock().unwrap().clone();
        Box::pin(async move {
            if let Some(error) = step["error"].as_str() {
                return Err(error.into());
            }
            Ok(Response {
                status: step["status"].as_u64().unwrap_or(200) as u16,
                data: if step["invalidJson"] == true {
                    Err("invalid JSON".into())
                } else {
                    Ok(step["data"].clone())
                },
            })
        })
    });
    let google = GoogleCalendarClient::new(transport.clone());
    let oauth = CalendarOAuthClient::with_clock(transport, Arc::new(|| 1700000000123));
    let credentials = serde_json::from_value(call["credentials"].clone()).unwrap();
    let mut results = vec![];
    for s in steps.as_array().unwrap() {
        *current.lock().unwrap() = s.clone();
        let value = match s["op"].as_str().unwrap() {
            "profile" => google.get_profile_email(" token ").await,
            "calendars" => google.list_calendars(" token ").await,
            "events" => {
                google
                    .list_events(" token ", &s["calendar"], &s["options"])
                    .await
            }
            "exchange" => {
                oauth
                    .exchange_code(
                        &credentials,
                        s["redirect"].as_str().unwrap(),
                        s["code"].as_str().unwrap(),
                        s["verifier"].as_str().unwrap(),
                    )
                    .await
            }
            "refresh" => {
                oauth
                    .refresh_tokens(&credentials, s["refresh"].as_str().unwrap())
                    .await
            }
            _ => panic!("bad step"),
        }
        .unwrap_or_else(|error| json!({"error":error}));
        results.push(value);
    }
    let mut actual = json!({"results":results,"requests":*requests.lock().unwrap()});
    canonical(&mut actual);
    canonical(&mut expected);
    assert_eq!(actual, expected);
}
#[tokio::test]
async fn google_calendar_optional_fields_filtering_boolean_defaults_and_provider_failures() {
    compare(json!([
  {"op":"profile","data":{"email":"alice@example.test"}},{"op":"profile","data":{"email":null}},{"op":"profile","data":{}},{"op":"profile","data":null},
  {"op":"calendars","data":{"items":[{},{"id":""},{"id":"hidden","hidden":true},{"id":"c","summary":"Calendar","description":null,"timeZone":"UTC","primary":true,"selected":false,"backgroundColor":"#abc"},{"id":"d","summary":"","primary":1,"selected":null,"accessRole":null,"backgroundColor":null}]}},
  {"op":"calendars","data":{}},{"op":"calendars","data":{"items":null}},{"op":"calendars","invalidJson":true},{"op":"calendars","data":{"items":[null]}},
  {"op":"profile","status":401,"data":{"error":{"message":"access expired"}}},{"op":"calendars","status":503,"data":{}},
  {"op":"calendars","status":400,"invalidJson":true},{"op":"calendars","status":400,"data":null},{"op":"calendars","data":{"items":"invalid"}},{"op":"profile","error":"network failed"}
 ])).await;
}
#[tokio::test]
async fn google_events_encode_calendar_id_query_and_preserve_all_day_organizer_and_attendees() {
    let calendar = json!({"id":"a/b? +😀!~()*'","name":"Name"});
    let options = json!({"timeMin":"2026-10-19T00:00:00+02:00","timeMax":"2026-11-01T23:59:59Z","query":"  spaced + query & 😀\u{feff}","limit":23});
    let events = json!({"items":[{},{"id":""},{"id":"timed","summary":"Title","description":"Desc","location":"Place","start":{"dateTime":"2026-10-19T10:00:00Z","date":"2026-10-19"},"end":{"dateTime":"2026-10-19T11:00:00Z"},"organizer":{"displayName":"Display","email":"o@example.test"},"attendees":[{"displayName":"Person","email":"p@example.test","responseStatus":"accepted"},{"email":"e@example.test"},{}],"htmlLink":"https://calendar.google.com/event"},
 {"id":"all","summary":"","start":{"date":"2026-10-20","dateTime":null},"end":{"date":"2026-10-21"},"organizer":{"email":"fallback@example.test"},"attendees":null},
 {"id":"empty","start":{"date":"2026-10-20","dateTime":""},"status":null,"htmlLink":null}]});
    compare(json!([{"op":"events","calendar":calendar,"options":options,"data":events},
 {"op":"events","calendar":{"id":"default","name":"Default"},"options":{"timeMin":"a","timeMax":"b","limit":0,"query":" "},"data":{}},
 {"op":"events","calendar":calendar,"options":options,"data":{"items":[{"id":"bad","attendees":[null]}]}}])).await;
}
#[tokio::test]
async fn oauth_code_refresh_forms_tokens_expiry_fallback_and_error_details() {
    let mut steps = vec![];
    for data in [
        json!({"access_token":"token","refresh_token":"new","expires_in":30.5,"scope":"a b"}),
        json!({}),
        json!({"access_token":42,"refresh_token":null,"expires_in":0,"scope":false}),
        json!({"access_token":[1,null,"x"],"refresh_token":"","expires_in":-1}),
        json!({"access_token":{},"expires_in":"12"}),
        json!({"access_token":1e20,"expires_in":0.001}),
        json!({"access_token":1e22}),
        json!({"access_token":1e-7}),
        Value::Null,
    ] {
        steps.push(json!({"op":"exchange","redirect":"http://127.0.0.1/cb?a=+","code":" code&=😀","verifier":"verifier-_/+","data":data}));
        steps.push(json!({"op":"refresh","refresh":"old + &","data":data}));
    }
    for (status, data) in [
        (400, json!({"error_description":"Denied","error":"unused"})),
        (401, json!({"error":"invalid_grant"})),
        (502, json!({})),
        (400, json!({"error_description":"","error":"fallback"})),
        (
            400,
            json!({"error_description":null,"error":{"message":"object"}}),
        ),
    ] {
        steps.push(json!({"op":"refresh","refresh":"old","status":status,"data":data}));
    }
    steps.push(json!({"op":"refresh","refresh":"old","invalidJson":true}));
    steps.push(json!({"op":"refresh","refresh":"old","status":500,"invalidJson":true}));
    steps.push(json!({"op":"refresh","refresh":"old","error":"connection failed"}));
    compare(json!(steps)).await;
}
#[tokio::test]
async fn native_http_transport_uses_real_loopback_http_redirects_and_json_errors() {
    use axum::{Json, Router, response::Redirect, routing::get};
    let app = Router::new()
        .route("/ok", get(|| async { Json(json!({"ok":true})) }))
        .route("/redirect", get(|| async { Redirect::temporary("/ok") }))
        .route("/bad", get(|| async { "not JSON" }))
        .route(
            "/gzip",
            get(|| async {
                (
                    [
                        ("content-encoding", "gzip"),
                        ("content-type", "application/json"),
                    ],
                    vec![
                        31, 139, 8, 0, 0, 0, 0, 0, 2, 3, 171, 86, 202, 207, 86, 178, 42, 41, 42,
                        77, 173, 5, 0, 144, 95, 212, 167, 11, 0, 0, 0,
                    ],
                )
            }),
        );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let server = tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });
    let transport = calendar::native_transport().unwrap();
    for path in ["/ok", "/redirect", "/bad", "/gzip"] {
        let response = transport(Request {
            url: format!("http://{addr}{path}"),
            method: "GET".into(),
            headers: Default::default(),
            body: None,
        })
        .await
        .unwrap();
        assert_eq!(response.status, 200);
        if path == "/bad" {
            assert!(response.data.is_err());
        } else {
            assert_eq!(response.data.unwrap(), json!({"ok":true}));
        }
    }
    server.abort();
    let _ = server.await;
}

#[test]
fn mail_oauth_env_provider_scopes_authorize_encoding_and_pkce_match() {
    use jait_gateway::services::email::oauth as mail;
    let mut values = vec![];
    for provider in ["gmail", "outlook"] {
        for env in [
            json!({}),
            json!({"GMAIL_OAUTH_CLIENT_ID":" g ","GMAIL_OAUTH_CLIENT_SECRET":" gs ","OUTLOOK_OAUTH_CLIENT_ID":" o ","OUTLOOK_OAUTH_CLIENT_SECRET":" os "}),
            json!({"GMAIL_OAUTH_CLIENT_ID":" ","GMAIL_OAUTH_CLIENT_SECRET":"s","OUTLOOK_OAUTH_CLIENT_ID":"\u{feff}id","OUTLOOK_OAUTH_CLIENT_SECRET":"\n"}),
        ] {
            values.push(json!({"provider":provider,"env":env}));
        }
    }
    let actual: Vec<_> = values
        .iter()
        .map(|v| {
            mail::credentials_from_env(
                serde_json::from_value(v["provider"].clone()).unwrap(),
                &serde_json::from_value(v["env"].clone()).unwrap(),
            )
        })
        .collect();
    assert_eq!(
        json!(actual),
        reference(json!({"op":"nativeemailoauth.env","values":values}))
    );
    let mut values = vec![];
    for provider in ["gmail", "outlook"] {
        for text in ["", "spaces + &='😀"] {
            values.push(json!({"provider":provider,"credentials":{"clientId":text,"clientSecret":"never-in-url"},"redirectUri":"http://127.0.0.1/cb?x=+&y=1","state":text,"codeChallenge":text}));
        }
    }
    let actual: Vec<_> = values
        .iter()
        .map(|v| {
            mail::build_authorize_url(
                serde_json::from_value(v["provider"].clone()).unwrap(),
                &serde_json::from_value(v["credentials"].clone()).unwrap(),
                v["redirectUri"].as_str().unwrap(),
                v["state"].as_str().unwrap(),
                v["codeChallenge"].as_str().unwrap(),
            )
        })
        .collect();
    assert_eq!(
        json!(actual),
        reference(json!({"op":"nativeemailoauth.authorize","values":values}))
    );
    let generated: Vec<_> = (0..50)
        .map(|_| mail::create_pkce().unwrap())
        .chain([mail::pkce_from_entropy([0; 32])])
        .collect();
    let verifiers: Vec<_> = generated.iter().map(|v| v["verifier"].clone()).collect();
    let expected = reference(json!({"op":"nativeemailoauth.pkce","verifiers":verifiers}));
    for (i, v) in generated.iter().enumerate() {
        assert_eq!(v["challenge"], expected["expected"][i]);
    }
    let mut seen = std::collections::HashSet::new();
    for v in generated
        .iter()
        .take(50)
        .chain(expected["generated"].as_array().unwrap())
    {
        assert!(seen.insert(v["verifier"].as_str().unwrap()));
        for key in ["verifier", "challenge"] {
            let s = v[key].as_str().unwrap();
            assert_eq!(s.len(), 43);
            assert!(
                s.bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
            );
        }
    }
}
#[tokio::test]
async fn mail_oauth_provider_endpoints_token_forms_and_nullish_refresh_scope_semantics() {
    use jait_gateway::services::email::oauth as mail;
    let mut steps = vec![];
    for provider in ["gmail", "outlook"] {
        for data in [
            json!({}),
            json!({"access_token":"token","refresh_token":"r","expires_in":30.5,"scope":"a b"}),
            json!({"access_token":null,"refresh_token":null,"expires_in":0,"scope":null}),
            json!({"access_token":42,"refresh_token":42,"expires_in":-1,"scope":false}),
            json!({"access_token":[1,null,"x"],"refresh_token":{},"expires_in":"1","scope":[]} ),
            Value::Null,
        ] {
            steps.push(json!({"op":"exchange","provider":provider,"redirect":"http://127.0.0.1/cb?x=1","code":"code + &","verifier":"verifier_-/+","data":data}));
            steps.push(json!({"op":"refresh","provider":provider,"refresh":"old + &","data":data}));
        }
        for (status, data) in [
            (400, json!({"error_description":"Denied","error":"unused"})),
            (401, json!({"error":"invalid_grant"})),
            (500, json!({})),
            (400, json!({"error_description":"","error":"unused"})),
        ] {
            steps.push(json!({"op":"refresh","provider":provider,"refresh":"old","status":status,"data":data}));
        }
        steps.push(json!({"op":"refresh","provider":provider,"refresh":"old","invalidJson":true}));
        steps.push(json!({"op":"refresh","provider":provider,"refresh":"old","status":500,"invalidJson":true}));
        steps.push(
            json!({"op":"refresh","provider":provider,"refresh":"old","error":"connection failed"}),
        );
    }
    let steps = json!(steps);
    let mut expected = reference(
        json!({"op":"nativeemailoauth.http","now":1700000000123i64,"credentials":{"clientId":"id +","clientSecret":"secret&="},"steps":steps}),
    );
    let requests = Arc::new(Mutex::new(vec![]));
    let current = Arc::new(Mutex::new(Value::Null));
    let r = requests.clone();
    let c = current.clone();
    let transport: Transport = Arc::new(move |request| {
        r.lock().unwrap().push(json!(request));
        let step = c.lock().unwrap().clone();
        Box::pin(async move {
            if let Some(e) = step["error"].as_str() {
                return Err(e.into());
            }
            Ok(Response {
                status: step["status"].as_u64().unwrap_or(200) as u16,
                data: if step["invalidJson"] == true {
                    Err("invalid JSON".into())
                } else {
                    Ok(step["data"].clone())
                },
            })
        })
    });
    let client = mail::EmailOAuthClient::with_clock(transport, Arc::new(|| 1700000000123));
    let credentials = mail::OAuthClientCredentials {
        client_id: "id +".into(),
        client_secret: "secret&=".into(),
    };
    let mut results = vec![];
    for step in steps.as_array().unwrap() {
        *current.lock().unwrap() = step.clone();
        let provider = serde_json::from_value(step["provider"].clone()).unwrap();
        let v = if step["op"] == "exchange" {
            client
                .exchange_code(
                    provider,
                    &credentials,
                    step["redirect"].as_str().unwrap(),
                    step["code"].as_str().unwrap(),
                    step["verifier"].as_str().unwrap(),
                )
                .await
        } else {
            client
                .refresh_tokens(provider, &credentials, step["refresh"].as_str().unwrap())
                .await
        };
        results.push(v.unwrap_or_else(|error| json!({"error":error})));
    }
    let mut actual = json!({"results":results,"requests":*requests.lock().unwrap()});
    canonical(&mut actual);
    canonical(&mut expected);
    assert_eq!(actual, expected);
}
