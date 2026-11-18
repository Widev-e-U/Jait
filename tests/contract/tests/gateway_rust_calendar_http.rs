#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::{
    Gateway,
    config::GatewayConfig,
    db::{self, worker::DatabaseWorker},
    health::HealthState,
    routes::{auth::AuthState, calendar::CalendarRoutes},
    security::http_auth::{self, AuthUser},
    services::{
        calendar::{Response, Transport, service::CalendarService},
        user_secrets::UserSecretService,
    },
};
use rusqlite::{Connection, types::ValueRef};
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    fs,
    num::NonZeroU16,
    path::PathBuf,
    sync::{Arc, Mutex},
    time::Duration,
};
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}
fn rows(db: &Connection, sql: &str) -> rusqlite::Result<Vec<Value>> {
    let mut s = db.prepare(sql)?;
    let names = s
        .column_names()
        .iter()
        .map(|s| s.to_string())
        .collect::<Vec<_>>();
    s.query_map([], |r| {
        let mut o = serde_json::Map::new();
        for (i, k) in names.iter().enumerate() {
            let v = match r.get_ref(i)? {
                ValueRef::Null => Value::Null,
                ValueRef::Integer(n) => json!(n),
                ValueRef::Real(n) => json!(n),
                ValueRef::Text(s) => json!(String::from_utf8_lossy(s)),
                _ => panic!("blob"),
            };
            o.insert(k.clone(), v);
        }
        Ok(Value::Object(o))
    })?
    .collect()
}
fn observe(v: &Value, aliases: &mut HashMap<String, String>) {
    match v {
        Value::Object(m) => {
            if let (Some(id), Some(email), Some(provider)) = (
                v["id"].as_str(),
                v["email"].as_str(),
                v["provider"].as_str(),
            ) {
                aliases.insert(
                    id.into(),
                    format!(
                        "$account:{provider}|{}|{email}",
                        v["userId"].as_str().unwrap_or("")
                    ),
                );
            }
            for x in m.values() {
                observe(x, aliases)
            }
        }
        Value::Array(a) => {
            for x in a {
                observe(x, aliases)
            }
        }
        _ => {}
    }
}
fn normalize(v: &mut Value, aliases: &HashMap<String, String>) {
    match v {
        Value::String(s) => {
            for (id, label) in aliases {
                *s = s.replace(id, label)
            }
        }
        Value::Object(m) => {
            for (k, v) in m {
                if [
                    "createdAt",
                    "updatedAt",
                    "created_at",
                    "updated_at",
                    "synced_at",
                ]
                .contains(&k.as_str())
                {
                    *v = json!("<time>")
                } else {
                    normalize(v, aliases)
                }
            }
        }
        Value::Array(a) => {
            for x in a {
                normalize(x, aliases)
            }
        }
        _ => {}
    }
}
async fn compare(mut call: Value) -> Value {
    call["op"] = json!("nativecalendarhttp.run");
    let dir = root()
        .join(".jait/artifacts/gateway-rust/calendar-http")
        .join(uuid::Uuid::new_v4().to_string());
    fs::create_dir_all(&dir).unwrap();
    let expected =
        internal_driver::call(&root(), &dir, json!({"version":1,"calls":[call]}), &|| {
            false
        })
        .unwrap()[0]
            .clone();
    let path = dir.join("native.db");
    let conn = db::open_database(&path).unwrap();
    db::migrate_database(&conn).unwrap();
    conn.execute_batch("INSERT INTO users(id,username,password_hash,created_at,updated_at)VALUES('owner','alice','fixture','old','old'),('other','bob','fixture','old','old');").unwrap();
    if let Some(seed) = call["seed"].as_str() {
        conn.execute_batch(seed).unwrap();
    }
    let worker = DatabaseWorker::new(conn, NonZeroU16::new(64).unwrap()).unwrap();
    let auth = AuthState::new(
        db::open_database(&path).unwrap(),
        "calendar-http-secret".into(),
    )
    .unwrap();
    let requests = Arc::new(Mutex::new(vec![]));
    let responses = Arc::new(Mutex::new(std::collections::VecDeque::<Value>::new()));
    let transport: Transport = {
        let (req, res) = (requests.clone(), responses.clone());
        Arc::new(move |r| {
            let mut request = json!(r);
            if let Some(body) = request["body"].as_str() {
                let mut u = reqwest::Url::parse("https://fixture.test/").unwrap();
                u.set_query(Some(body));
                let mut pairs = u
                    .query_pairs()
                    .map(|(k, v)| (k.into_owned(), v.into_owned()))
                    .collect::<Vec<_>>();
                for (k, v) in &mut pairs {
                    if k == "code_verifier" {
                        *v = "<verifier>".into();
                    }
                }
                u.set_query(None);
                u.query_pairs_mut().extend_pairs(pairs);
                request["body"] = json!(u.query().unwrap_or(""));
            }
            req.lock().unwrap().push(request);
            let response = res.lock().unwrap().pop_front();
            Box::pin(async move {
                let Some(r) = response else {
                    return Err("unexpected provider request".into());
                };
                if let Some(e) = r["error"].as_str() {
                    return Err(e.into());
                }
                Ok(Response {
                    status: r["status"].as_u64().unwrap_or(200) as u16,
                    data: Ok(r["data"].clone()),
                })
            })
        })
    };
    let service = Arc::new(CalendarService::with_options(
        worker.clone(),
        UserSecretService::new("calendar-http-fixture"),
        transport,
        jait_gateway::time::default_clock(),
        Arc::new(|| None),
    ));
    let gateway = Gateway::bind_authenticated(
        GatewayConfig {
            address: "127.0.0.1:0".parse().unwrap(),
        },
        HealthState::default(),
        auth.clone(),
    )
    .await
    .unwrap()
    .with_calendar(CalendarRoutes {
        auth: auth.clone(),
        calendar: service.clone(),
        public_base: call["publicBase"].as_str().map(String::from),
    });
    let base = format!("http://{}", gateway.local_addr().unwrap());
    let (send, receive) = tokio::sync::oneshot::channel();
    let task = tokio::spawn(gateway.serve(async {
        let _ = receive.await;
    }));
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .build()
        .unwrap();
    let mut aliases = HashMap::<String, String>::new();
    let mut starts = HashMap::<String, String>::new();
    let mut results = vec![];
    for step in call["steps"].as_array().unwrap() {
        if let Some(sql) = step["sql"].as_str() {
            let sql = sql.to_string();
            worker
                .run(move |db| {
                    db.execute_batch(&sql)?;
                    Ok(())
                })
                .await
                .unwrap();
            continue;
        }
        *responses.lock().unwrap() = step["fetches"]
            .as_array()
            .cloned()
            .unwrap_or_default()
            .into();
        let mut path = step["path"].as_str().unwrap().to_string();
        for (name, state) in &starts {
            path = path.replace(&format!("$state:{name}"), state);
        }
        for (id, label) in &aliases {
            path = path.replace(label, id);
        }
        let mut r = client
            .request(
                step["method"].as_str().unwrap().parse().unwrap(),
                format!("{base}{path}"),
            )
            .header("host", "fixture.local")
            .header("connection", "close");
        if let Some(h) = step["headers"].as_object() {
            for (k, v) in h {
                r = r.header(k, v.as_str().unwrap());
            }
        }
        for (field, cookie) in [("user", false), ("cookie", true)] {
            if let Some(id) = step[field].as_str() {
                let token = http_auth::sign_auth_token(
                    &AuthUser {
                        id: id.into(),
                        username: if id == "owner" { "alice" } else { "bob" }.into(),
                    },
                    "calendar-http-secret",
                )
                .unwrap();
                r = if cookie {
                    r.header("cookie", format!("jait_token={token}"))
                } else {
                    r.bearer_auth(token)
                };
            }
        }
        if let Some(raw) = step["raw"].as_str() {
            r = r.body(raw.to_string());
        } else if let Some(body) = step.get("body") {
            r = r.json(body);
        }
        let res = r.send().await.unwrap();
        let status = res.status().as_u16();
        let content_type = res
            .headers()
            .get("content-type")
            .unwrap()
            .to_str()
            .unwrap()
            .to_string();
        let raw = res.text().await.unwrap();
        let mut body = serde_json::from_str::<Value>(&raw).unwrap_or(json!(raw));
        observe(&body, &mut aliases);
        if let (Some(name), Some(url)) = (step["start"].as_str(), body["authUrl"].as_str()) {
            let mut url = reqwest::Url::parse(url).unwrap();
            let mut pairs = url
                .query_pairs()
                .map(|(k, v)| (k.into_owned(), v.into_owned()))
                .collect::<Vec<_>>();
            let valid = |s: &str, n| {
                s.len() == n
                    && s.bytes()
                        .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
            };
            for (k, v) in &mut pairs {
                if k == "state" {
                    starts.insert(name.to_string(), v.clone());
                    body["stateValid"] = json!(valid(v, 32));
                    *v = "<state>".into();
                }
                if k == "code_challenge" {
                    body["challengeValid"] = json!(valid(v, 43));
                    *v = "<challenge>".into();
                }
            }
            url.set_query(None);
            url.query_pairs_mut().extend_pairs(pairs);
            body["authUrl"] = json!(url.as_str());
        }
        results.push(json!({"status":status,"contentType":content_type,"body":body}));
    }
    let tables=worker.run(|db|{
        Ok(json!({"accounts":rows(db,"SELECT * FROM calendar_accounts ORDER BY user_id,email")?,"snapshots":rows(db,"SELECT account_id,user_id,calendars,events FROM device_calendar_snapshots ORDER BY user_id")?}))
    }).await.unwrap();
    for r in tables["accounts"].as_array().unwrap() {
        aliases.insert(
            r["id"].as_str().unwrap().into(),
            format!(
                "$account:{}|{}|{}",
                r["provider"].as_str().unwrap(),
                r["user_id"].as_str().unwrap_or(""),
                r["email"].as_str().unwrap()
            ),
        );
    }
    let mut actual = json!({"results":results,"requests":*requests.lock().unwrap(),"accounts":tables["accounts"],"snapshots":tables["snapshots"]});
    for r in actual["snapshots"].as_array_mut().unwrap() {
        for k in ["calendars", "events"] {
            r[k] = serde_json::from_str(r[k].as_str().unwrap()).unwrap();
        }
    }
    normalize(&mut actual, &aliases);
    send.send(()).unwrap();
    task.await.unwrap().unwrap();
    service.shutdown().await.unwrap();
    auth.shutdown().await.unwrap();
    if actual != expected {
        fs::write(
            dir.join("actual.json"),
            serde_json::to_string_pretty(&actual).unwrap(),
        )
        .unwrap();
        fs::write(
            dir.join("expected.json"),
            serde_json::to_string_pretty(&expected).unwrap(),
        )
        .unwrap();
        panic!("calendar HTTP differential: {}", dir.display());
    }
    actual
}
fn request(method: &str, path: &str) -> Value {
    json!({"method":method,"path":path,"user":"owner"})
}
fn snapshot() -> Value {
    json!({"deviceId":" phone ","deviceName":" Desk ","calendars":[{"id":"work","name":"Work","selected":true}],"events":[{"id":"a","calendarId":"work","title":"Shift","description":"","location":"","start":"2023-11-15T10:00:00.000Z","end":"2023-11-15T11:00:00.000Z"},{"id":"b","calendarId":"work","title":"Later","start":"2023-11-15T12:00:00.000Z","end":"2023-11-15T13:00:00.000Z"}]})
}
#[tokio::test]
async fn authentication_redirect_headers_configuration_and_validation() {
    let mut steps = vec![
        json!({"method":"GET","path":"/api/calendar/config"}),
        request("GET", "/api/calendar/config"),
        json!({"method":"GET","path":"/api/calendar/config","cookie":"owner","headers":{"x-forwarded-proto":"https","x-forwarded-host":"public.test:443"}}),
    ];
    for body in [
        json!({}),
        json!({"clientId":" ","clientSecret":"s"}),
        json!({"clientId":12,"clientSecret":"s"}),
        json!({"clientId":" id ","clientSecret":" secret "}),
    ] {
        steps.push(json!({"method":"POST","path":"/api/calendar/config/google","user":"owner","body":body}));
    }
    steps.extend([request("GET","/api/calendar/config"),json!({"method":"GET","path":"/api/calendar/config","user":"other"}),json!({"method":"GET","path":"/api/calendar/config","user":"missing"}),json!({"method":"GET","path":"/api/calendar/config","cookie":"owner","headers":{"origin":"https://foreign.test"}}),json!({"method":"GET","path":"/api/calendar/config","user":"owner","headers":{"origin":"https://foreign.test"}})]);
    compare(json!({"steps":steps})).await;
    compare(json!({"publicBase":"  https://public.test/prefix///  ","steps":[request("GET","/api/calendar/config")]})).await;
}
#[tokio::test]
async fn device_sync_ownership_filters_deletion_and_limit_parsing() {
    let steps = json!([
        {"method":"POST","path":"/api/calendar/device/sync","cookie":"owner","body":snapshot()},
        {"method":"GET","path":"/api/calendar/accounts","user":"owner"},
        {"method":"GET","path":"/api/calendar/accounts","user":"other"},
        {"method":"DELETE","path":"/api/calendar/accounts/$account:android|owner|device:phone","user":"other"},
        {"method":"GET","path":"/api/calendar/calendars?accountId=$account:android|owner|device:phone","user":"owner"},
        {"method":"GET","path":"/api/calendar/events?timeMin=2023-11-14&timeMax=2023-11-16&q=shift&limit=1tail","user":"owner"},
        {"method":"GET","path":"/api/calendar/events?timeMin=2023-11-14&timeMax=2023-11-16&limit=garbage","user":"owner"},
        {"method":"GET","path":"/api/calendar/events?timeMin=bad","user":"owner"},
        {"method":"GET","path":"/api/calendar/events?accountId=missing","user":"owner"},
        {"method":"DELETE","path":"/api/calendar/accounts/$account:android|owner|device:phone","user":"owner"},
        {"method":"DELETE","path":"/api/calendar/accounts/$account:android|owner|device:phone","user":"owner"},
        {"method":"GET","path":"/api/calendar/calendars","user":"owner"}
    ]);
    compare(json!({"steps":steps})).await;
}
#[tokio::test]
async fn snapshot_validation_size_boundaries_and_failed_storage() {
    let mut steps = vec![];
    for body in [
        Value::Null,
        json!({}),
        json!({"deviceId":1,"calendars":[],"events":[]}),
        json!({"deviceId":"p","calendars":{},"events":[]}),
        json!({"deviceId":"p","calendars":[],"events":[],"deviceName":9}),
    ] {
        steps.push(
            json!({"method":"POST","path":"/api/calendar/device/sync","user":"owner","body":body}),
        );
    }
    for (c, e) in [(501, 0), (0, 5001), (500, 0), (0, 5000)] {
        steps.push(json!({"method":"POST","path":"/api/calendar/device/sync","user":"owner","body":{"deviceId":"boundary","calendars":vec![Value::Null;c],"events":vec![Value::Null;e]}}));
    }
    steps.extend([
        json!({"sql":"CREATE TRIGGER fail_snapshot BEFORE INSERT ON device_calendar_snapshots BEGIN SELECT RAISE(ABORT,'snapshot failure');END;"}),
        json!({"method":"POST","path":"/api/calendar/device/sync","user":"owner","body":snapshot()}),
    ]);
    compare(json!({"steps":steps})).await;
}
#[tokio::test]
async fn oauth_callback_public_html_escapes_errors_and_consumes_state() {
    compare(json!({"steps":[
        request("GET","/api/calendar/connect/google"),
        {"method":"GET","path":"/api/calendar/oauth/callback"},
        {"method":"GET","path":"/api/calendar/oauth/callback?error=denied&error_description=%3Cscript%3E%26%22%27"},
        {"method":"GET","path":"/api/calendar/oauth/callback?code=c&state=unknown"},
        {"method":"POST","path":"/api/calendar/config/google","user":"owner","body":{"clientId":"id","clientSecret":"secret"}},
        {"method":"GET","path":"/api/calendar/connect/google","user":"owner","start":"connect"},
        {"method":"GET","path":"/api/calendar/oauth/callback?code=code&state=$state:connect","fetches":[{"data":{"access_token":"token","refresh_token":"refresh","expires_in":3600}},{"data":{"email":"a@example.test"}}]},
        {"method":"GET","path":"/api/calendar/oauth/callback?code=code&state=$state:connect"},
        {"method":"GET","path":"/api/calendar/accounts","user":"owner"},
        {"method":"GET","path":"/api/calendar/accounts","user":"other"}
    ]})).await;
}
#[tokio::test]
async fn malformed_http_bodies_and_callback_origin_checks() {
    compare(json!({"steps":[
        {"method":"POST","path":"/api/calendar/config/google","user":"owner","raw":"{bad","headers":{"content-type":"application/json"}},
        {"method":"POST","path":"/api/calendar/device/sync","user":"owner","body":{"__proto__":{}}},
        {"method":"GET","path":"/api/calendar/oauth/callback?error=no","headers":{"origin":"https://foreign.test"}},
        {"method":"GET","path":"/api/calendar/events","headers":{"authorization":"Bearer invalid"}},
        {"method":"GET","path":"/api/calendar/config","cookie":"owner","headers":{"authorization":"Bearer invalid"}}
    ]})).await;
}

#[tokio::test]
async fn provider_errors_remote_event_queries_and_replayed_failed_oauth() {
    let mut steps = vec![
        json!({"method":"POST","path":"/api/calendar/config/google","user":"owner","body":{"clientId":"id","clientSecret":"secret"}}),
        json!({"method":"GET","path":"/api/calendar/connect/google","user":"owner","start":"denied"}),
        json!({"method":"GET","path":"/api/calendar/oauth/callback?code=code&state=$state:denied","fetches":[{"status":403,"data":{"error_description":"denied <&>"}}]}),
        json!({"method":"GET","path":"/api/calendar/oauth/callback?code=code&state=$state:denied"}),
        json!({"method":"GET","path":"/api/calendar/connect/google","user":"owner","start":"good"}),
        json!({"method":"GET","path":"/api/calendar/oauth/callback?code=code&state=$state:good","fetches":[{"data":{"access_token":"token","expires_in":3600}},{"data":{"email":"remote@example.test"}}]}),
        json!({"method":"GET","path":"/api/calendar/calendars","user":"owner","fetches":[{"status":503,"data":{"error":{"message":"provider offline"}}}]}),
        json!({"method":"GET","path":"/api/calendar/calendars","user":"other"}),
    ];
    for limit in [
        "2tail",
        "-2",
        "0x10",
        "garbage",
        "",
        "  +2tail",
        &"9".repeat(400),
    ] {
        let mut url = reqwest::Url::parse("http://fixture.test/api/calendar/events").unwrap();
        url.query_pairs_mut().extend_pairs([
            ("timeMin", "2023-11-14"),
            ("timeMax", "2023-11-16"),
            ("q", " shift "),
            ("limit", limit),
        ]);
        steps.push(json!({"method":"GET","path":format!("{}?{}",url.path(),url.query().unwrap()),"user":"owner","fetches":[{"data":{"items":[{"id":"work","summary":"Work","selected":true}]}},{"data":{"items":[{"id":"event","summary":"Shift","start":{"dateTime":"2023-11-15T10:00:00Z"},"end":{"dateTime":"2023-11-15T11:00:00Z"}}]}}]}));
    }
    compare(json!({"steps":steps})).await;
}
