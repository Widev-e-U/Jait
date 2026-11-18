#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::{
    db::{self, worker::DatabaseWorker},
    services::{
        calendar::{self, Response, Transport, service::CalendarService},
        user_secrets::{SaveSecretParams, UserSecretService},
    },
};
use rusqlite::{Connection, types::ValueRef};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    fs,
    num::NonZeroU16,
    path::PathBuf,
    sync::{
        Arc, Mutex,
        atomic::{AtomicI64, Ordering},
    },
};
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}
fn reference(call: Value) -> Value {
    let dir = root()
        .join(".jait/artifacts/gateway-rust/calendar-service")
        .join(uuid::Uuid::new_v4().to_string());
    fs::create_dir_all(&dir).unwrap();
    internal_driver::call(&root(), &dir, json!({"version":1,"calls":[call]}), &|| {
        false
    })
    .unwrap()[0]
        .clone()
}
fn canonical(v: &mut Value, aliases: &HashMap<String, String>) {
    match v {
        Value::String(s) => {
            for (alias, id) in aliases {
                *s = s.replace(id, &["$", alias].concat());
            }
        }
        Value::Number(n) => {
            if let Some(f) = n.as_f64()
                && f.fract() == 0.0
                && f.abs() < i64::MAX as f64
            {
                *v = json!(f as i64);
            }
        }
        Value::Array(a) => {
            for v in a {
                canonical(v, aliases)
            }
        }
        Value::Object(o) => {
            for v in o.values_mut() {
                canonical(v, aliases)
            }
        }
        _ => {}
    }
}
fn base64url(bytes: &[u8]) -> String {
    const A: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let mut result = String::new();
    let (mut bits, mut count) = (0u32, 0u32);
    for b in bytes {
        bits = (bits << 8) | u32::from(*b);
        count += 8;
        while count >= 6 {
            count -= 6;
            result.push(A[((bits >> count) & 63) as usize] as char);
        }
    }
    if count > 0 {
        result.push(A[((bits << (6 - count)) & 63) as usize] as char);
    }
    result
}
fn rows(db: &Connection, sql: &str) -> rusqlite::Result<Vec<Value>> {
    let mut statement = db.prepare(sql)?;
    let names: Vec<_> = statement
        .column_names()
        .iter()
        .map(|s| s.to_string())
        .collect();
    statement
        .query_map([], |r| {
            let mut o = serde_json::Map::new();
            for (i, name) in names.iter().enumerate() {
                let v = match r.get_ref(i)? {
                    ValueRef::Null => Value::Null,
                    ValueRef::Integer(n) => json!(n),
                    ValueRef::Real(n) => json!(n),
                    ValueRef::Text(s) => json!(String::from_utf8_lossy(s)),
                    _ => panic!("unexpected blob"),
                };
                o.insert(name.clone(), v);
            }
            Ok(Value::Object(o))
        })?
        .collect()
}
fn resolve(v: &Value, aliases: &HashMap<String, String>) -> Option<String> {
    v.as_str().map(|s| {
        s.strip_prefix('$')
            .and_then(|a| aliases.get(a))
            .map(String::as_str)
            .unwrap_or(s)
            .to_string()
    })
}
async fn compare(mut call: Value) -> Value {
    call["op"] = json!("nativecalendarservice.run");
    let mut expected = reference(call.clone());
    let now = Arc::new(AtomicI64::new(call["now"].as_i64().unwrap()));
    let clock = {
        let n = now.clone();
        Arc::new(move || n.load(Ordering::SeqCst)) as jait_gateway::time::Clock
    };
    let path = root()
        .join(".jait/artifacts/gateway-rust/calendar-service")
        .join(uuid::Uuid::new_v4().to_string())
        .join("native.db");
    let conn = db::open_database(&path).unwrap();
    db::migrate_database(&conn).unwrap();
    conn.execute_batch("INSERT INTO users(id,username,password_hash,created_at,updated_at)VALUES('owner','alice','fixture','old','old'),('other','bob','fixture','old','old');").unwrap();
    if let Some(seed) = call["seed"].as_str() {
        conn.execute_batch(seed).unwrap();
    }
    let mut worker = DatabaseWorker::new(conn, NonZeroU16::new(64).unwrap()).unwrap();
    let secrets = UserSecretService::with_clock("calendar-service-fixture", clock.clone());
    let requests = Arc::new(Mutex::new(vec![]));
    let responses = Arc::new(Mutex::new(std::collections::VecDeque::<Value>::new()));
    let challenges = Arc::new(Mutex::new(Vec::<String>::new()));
    let transport: Transport = {
        let (req, res, ch) = (requests.clone(), responses.clone(), challenges.clone());
        Arc::new(move |r| {
            let mut request = json!(r);
            if let Some(body) = request["body"].as_str() {
                let mut u = reqwest::Url::parse("https://fixture.test/").unwrap();
                u.set_query(Some(body));
                let mut pairs = u
                    .query_pairs()
                    .map(|(k, v)| (k.into_owned(), v.into_owned()))
                    .collect::<Vec<_>>();
                if let Some((_, verifier)) = pairs.iter_mut().find(|(k, _)| k == "code_verifier") {
                    request["pkceValid"] = json!(
                        ch.lock()
                            .unwrap()
                            .contains(&base64url(&Sha256::digest(verifier.as_bytes())))
                    );
                    *verifier = "<verifier>".into();
                }
                u.set_query(None);
                u.query_pairs_mut().extend_pairs(pairs);
                request["body"] = json!(u.query().unwrap_or(""));
            }
            req.lock().unwrap().push(request);
            let response = res.lock().unwrap().pop_front();
            Box::pin(async move {
                let Some(response) = response else {
                    return Err("unexpected provider request".into());
                };
                if let Some(error) = response["error"].as_str() {
                    return Err(error.into());
                }
                Ok(Response {
                    status: response["status"].as_u64().unwrap_or(200) as u16,
                    data: if response["invalidJson"] == true {
                        Err("invalid JSON".into())
                    } else {
                        Ok(response["data"].clone())
                    },
                })
            })
        })
    };
    let env = calendar::oauth::calendar_credentials_from_env(
        &serde_json::from_value(
            call["env"]
                .as_object()
                .cloned()
                .map(Value::Object)
                .unwrap_or(json!({})),
        )
        .unwrap(),
    );
    let source = env.clone();
    let mut service = CalendarService::with_options(
        worker.clone(),
        secrets.clone(),
        transport.clone(),
        clock.clone(),
        Arc::new(move || source.clone()),
    );
    let mut aliases = HashMap::<String, String>::new();
    let mut starts = HashMap::<String, String>::new();
    let mut results = vec![];
    for s in call["steps"].as_array().unwrap() {
        *responses.lock().unwrap() = s["fetches"].as_array().cloned().unwrap_or_default().into();
        let id = resolve(&s["id"], &aliases);
        let user = s["user"].as_str();
        let result:Result<Value,calendar::service::Error>=match s["op"].as_str().unwrap(){
   "time"=>{now.store(s["now"].as_i64().unwrap(),Ordering::SeqCst);Ok(Value::Null)},
   "sql"=>{let sql=s["sql"].as_str().unwrap().to_string();worker.run(move|db|{db.execute_batch(&sql)?;Ok(())}).await.unwrap();Ok(Value::Null)},
   "restart"=>{
    service.shutdown().await.unwrap();
    worker=DatabaseWorker::new(db::open_database(&path).unwrap(),NonZeroU16::new(64).unwrap()).unwrap();
    let env=env.clone();
    service=CalendarService::with_options(worker.clone(),secrets.clone(),transport.clone(),clock.clone(),Arc::new(move||env.clone()));Ok(Value::Null)
   },
   "saveApp"=>service.save_app_credentials(user,serde_json::from_value(s["credentials"].clone()).unwrap()).await.map(|_|Value::Null),
   "secret"=>{
    let p=&s["params"];let params=SaveSecretParams{user_id:p["userId"].as_str().map(String::from),r#type:p["type"].as_str().unwrap().into(),key:resolve(&p["key"],&aliases).unwrap(),label:p["label"].as_str().unwrap().into(),value:p["value"].as_str().unwrap().into()};let secrets=secrets.clone();
    worker.run(move|db|{secrets.save(db,params)?;Ok(())}).await.map(|_|Value::Null).map_err(|e|Box::new(e)as calendar::service::Error)
   },
   "credentials"=>service.resolve_credentials(user).await.map(|v|json!(v)),
   "configured"=>service.is_configured(user).await.map(|v|json!(v)),
   "start"=>service.start_connect(user,s["redirect"].as_str().unwrap()).await.map(|v|{
    let mut url=reqwest::Url::parse(v["authUrl"].as_str().unwrap()).unwrap();
    let mut pairs=url.query_pairs().map(|(k,v)|(k.into_owned(),v.into_owned())).collect::<Vec<_>>();
    let state=pairs.iter().find(|(k,_)|k=="state").unwrap().1.clone();let challenge=pairs.iter().find(|(k,_)|k=="code_challenge").unwrap().1.clone();
    starts.insert(s["alias"].as_str().unwrap().into(),state.clone());challenges.lock().unwrap().push(challenge.clone());
    for(k,v)in &mut pairs{if k=="state"{*v="<state>".into()}else if k=="code_challenge"{*v="<challenge>".into()}}
    url.set_query(None);url.query_pairs_mut().extend_pairs(pairs);
    let valid=|s:&str,len|s.len()==len&&s.bytes().all(|b|b.is_ascii_alphanumeric()||b==b'-'||b==b'_');
    json!({"redirectUri":v["redirectUri"],"authUrl":url.as_str(),"stateValid":valid(&state,32),"challengeValid":valid(&challenge,43)})
   }),
   "complete"=>service.complete_connect(s["code"].as_str().unwrap(),starts.get(s["start"].as_str().unwrap_or("")).map(String::as_str).or(s["state"].as_str()).unwrap_or("missing")).await,
   "sync"=>service.sync_device_calendar(user,&s["snapshot"]).await,
   "list"=>service.list_accounts(user).await.map(|v|json!(v)),
   "get"=>service.get_account(user,id.as_deref().unwrap()).await.map(|v|json!(v)),
   "resolve"=>service.resolve_account(user,id.as_deref()).await,
   "disconnect"=>service.disconnect(user,id.as_deref().unwrap()).await.map(|v|json!(v)),
   "calendars"=>service.list_calendars(user,id.as_deref()).await,
   "events"=>service.list_events(user,id.as_deref(),s.get("options").unwrap_or(&json!({}))).await,
   op=>panic!("unknown step: {op}")
  };
        let value=result.unwrap_or_else(|e|json!({"error":if s["sqlError"]==true{"database operation failed".into()}else{e.to_string()}}));
        if let (Some(alias), Some(id)) = (s["alias"].as_str(), value["id"].as_str()) {
            aliases.insert(alias.into(), id.into());
        }
        results.push(value);
    }
    let secret_reader = secrets.clone();
    let tables=worker.run(move|db|{
  let accounts=rows(db,"SELECT * FROM calendar_accounts")?;
  let snapshots=rows(db,"SELECT * FROM device_calendar_snapshots")?;
  let mut secrets=rows(db,"SELECT user_id,type,key,label,encrypted_value,iv,auth_tag,created_at,updated_at,last_used_at FROM user_secrets")?;
  for s in &mut secrets{
   let value=secret_reader.decrypt(s["encrypted_value"].as_str().unwrap(),s["iv"].as_str().unwrap(),s["auth_tag"].as_str().unwrap())?;
   let o=s.as_object_mut().unwrap();for k in ["encrypted_value","iv","auth_tag"]{o.remove(k);}
   o.insert("value".into(),serde_json::from_str(&value).unwrap_or(json!(value)));
  }
  Ok(json!({"accounts":accounts,"snapshots":snapshots,"secrets":secrets}))
 }).await.unwrap();
    let mut actual = json!({"results":results,"requests":*requests.lock().unwrap(),"accounts":tables["accounts"],"snapshots":tables["snapshots"],"secrets":tables["secrets"]});
    for account in tables["accounts"].as_array().unwrap() {
        let id = account["id"].as_str().unwrap();
        if !aliases.values().any(|v| v == id) {
            aliases.insert(
                format!(
                    "account:{}|{}|{}",
                    account["provider"].as_str().unwrap(),
                    account["user_id"].as_str().unwrap_or(""),
                    account["email"].as_str().unwrap()
                ),
                id.into(),
            );
        }
    }
    canonical(&mut actual, &aliases);
    canonical(&mut expected, &HashMap::new());
    for r in actual["snapshots"].as_array_mut().unwrap() {
        for k in ["calendars", "events"] {
            if let Some(s) = r[k].as_str()
                && let Ok(v) = serde_json::from_str::<Value>(s)
            {
                r[k] = v;
            }
        }
    }
    for output in [&mut actual, &mut expected] {
        for k in ["accounts", "snapshots", "secrets"] {
            output[k].as_array_mut().unwrap().sort_by_key(|v| {
                format!(
                    "{}:{}:{}:{}",
                    v["id"], v["account_id"], v["user_id"], v["key"]
                )
            });
        }
    }
    service.shutdown().await.unwrap();
    assert_eq!(actual, expected, "calendar service differential: {call}");
    actual
}
fn device(id: &str, events: Value) -> Value {
    json!({"deviceId":id,"deviceName":"","calendars":[{"id":"work","name":"Work","selected":true}],"events":events})
}
fn secret(user: Value, kind: &str, key: &str, value: Value) -> Value {
    json!({"op":"secret","params":{"userId":user,"type":kind,"key":key,"label":format!("{kind}:{key}"),"value":value.as_str().map(String::from).unwrap_or_else(||serde_json::to_string(&value).unwrap())}})
}
#[tokio::test]
async fn credentials_precedence_owner_isolation_used_timestamps_and_partial_save() {
    let mut steps = vec![
        json!({"op":"configured","user":"owner"}),
        json!({"op":"credentials","user":"owner"}),
    ];
    steps.extend([
        secret(
            json!("owner"),
            "email-oauth-app",
            "gmail-client-id",
            json!("legacy"),
        ),
        secret(
            json!("owner"),
            "email-oauth-app",
            "gmail-client-secret",
            json!("legacy-secret"),
        ),
    ]);
    steps.extend([json!({"op":"credentials","user":"owner"}),json!({"op":"credentials","user":"other"}),json!({"op":"saveApp","user":"owner","credentials":{"clientId":" own ","clientSecret":"own-secret"}}),json!({"op":"credentials","user":"owner"}),json!({"op":"sql","sql":"CREATE TRIGGER fail_secret BEFORE UPDATE ON user_secrets WHEN NEW.key='google-client-secret' BEGIN SELECT RAISE(ABORT,'secret failure');END;"}),json!({"op":"saveApp","user":"owner","credentials":{"clientId":"replacement","clientSecret":"failed"},"sqlError":true}),json!({"op":"credentials","user":"owner"})]);
    compare(json!({"now":1700000000000i64,"env":{"GOOGLE_CALENDAR_OAUTH_CLIENT_ID":"env","GOOGLE_CALENDAR_OAUTH_CLIENT_SECRET":"env-secret"},"steps":steps})).await;
}
#[tokio::test]
async fn device_snapshots_scope_upserts_filter_sort_limits_corrupt_storage_and_restart() {
    let events = json!([
 {"id":"later","calendarId":"work","title":"SHIFT","description":"","location":"Office","start":"2023-11-15T10:00:00.000Z","end":"2023-11-15T11:00:00.000Z"},
 {"id":"edge","calendarId":"work","title":"Edge","description":"","location":"","start":"2023-11-14T00:00:00.000Z","end":"2023-11-14T00:00:00.000Z"},
 {"id":"other","calendarId":"other","title":"Shift","description":"home","location":"","start":"2023-11-15T09:00:00.000Z","end":"2023-11-15T09:00:00.000Z"},
 {"id":"old","calendarId":"work","title":"Old","description":"","location":"","start":"2022-11-15T09:00:00.000Z","end":"2022-11-15T10:00:00.000Z"}]);
    let steps = json!([
    {"op":"resolve","user":"owner"},{"op":"sync","user":"owner","alias":"phone","snapshot":device("phone",events)},
    {"op":"time","now":1700000001000i64},{"op":"sync","user":"other","alias":"foreign","snapshot":device("phone",json!([]))},
    {"op":"sync","alias":"public","snapshot":device("public",json!([]))},
    {"op":"list","user":"owner"},{"op":"list","user":"other"},{"op":"list"},{"op":"get","user":"other","id":"$phone"},{"op":"disconnect","user":"other","id":"$phone"},
    {"op":"calendars","user":"owner","id":"$phone"},{"op":"events","user":"owner","id":"$phone","options":{"timeMin":"2023-11-14","timeMax":"2023-11-16","calendarId":"work","query":" office ","limit":1.9}},
    {"op":"events","user":"owner","id":"$phone","options":{"timeMin":"2023-11-14","timeMax":"2023-11-16","limit":0}},
    {"op":"events","user":"owner","id":"$phone","options":{"timeMin":"bad"}},
    {"op":"events","user":"owner","id":"$phone","options":{"timeMin":"2023-11-16","timeMax":"2023-11-14"}},
    {"op":"restart"},{"op":"calendars","user":"owner","id":"$phone"},
    {"op":"sql","sql":"UPDATE device_calendar_snapshots SET events='broken' WHERE user_id='owner';"},
    {"op":"calendars","user":"owner","id":"$phone"},{"op":"events","user":"owner","id":"$phone"},
    {"op":"sync","user":"owner","alias":"phone","snapshot":device("phone",json!([]))},
    {"op":"disconnect","user":"owner","id":"$phone"},{"op":"disconnect","user":"owner","id":"$phone"}
    ]);
    compare(json!({"now":1700000000000i64,"steps":steps})).await;
}
#[tokio::test]
async fn oauth_single_use_gc_at_boundary_upserts_failure_effects_and_account_refresh() {
    let callback = |start: &str, alias: &str| json!({"op":"complete","start":start,"alias":alias,"code":" code+& ","fetches":[{"data":{"access_token":"token","refresh_token":"refresh","expires_in":3600}},{"data":{"email":"alice@example.test"}}]});
    let steps = json!([
    {"op":"start","alias":"unconfigured","redirect":"http://localhost/cb"},
    {"op":"saveApp","user":"owner","credentials":{"clientId":"id +","clientSecret":"secret&"}},
    {"op":"complete","state":"unknown","code":"code"},
    {"op":"start","user":"owner","alias":"old","redirect":"http://localhost/cb?x=1"},
    {"op":"time","now":1700000600000i64},{"op":"start","user":"owner","alias":"boundary","redirect":"http://localhost/cb"},
    callback("old","google"),callback("old","duplicate"),
    {"op":"time","now":1700001200001i64},{"op":"start","user":"owner","alias":"new","redirect":"http://localhost/cb"},
    callback("boundary","expired"),callback("new","google"),
    {"op":"calendars","user":"owner","id":"$google","fetches":[{"data":{"items":[{"id":"work","summary":"Work","selected":true}]}}]},
    {"op":"events","user":"owner","id":"$google","options":{"timeMin":"2023-11-14","timeMax":"2023-11-16","calendarId":"missing"},"fetches":[{"data":{"items":[]}}]},
    {"op":"time","now":1700005000001i64},
    {"op":"calendars","user":"owner","id":"$google","fetches":[{"data":{"access_token":"renewed","expires_in":3600}},{"data":{"items":[]}}]},
    {"op":"restart"},{"op":"get","user":"other","id":"$google"},{"op":"disconnect","user":"other","id":"$google"},
    {"op":"calendars","user":"owner","id":"$google","fetches":[{"status":503,"data":{"error":{"message":"offline"}}}]},
    {"op":"disconnect","user":"owner","id":"$google"},{"op":"list","user":"owner"}
    ]);
    compare(json!({"now":1700000000000i64,"steps":steps})).await;
}
#[tokio::test]
async fn stored_token_missing_malformed_expired_and_credentials_failure_paths() {
    let seed = "INSERT INTO calendar_accounts(id,user_id,provider,email,display_name,status,error,created_at,updated_at)VALUES('g','owner','google','a@example.test','Display','error','old error','old','old');";
    let mut steps = vec![json!({"op":"calendars","user":"owner","id":"g"})];
    for value in [
        json!("not json"),
        json!({}),
        json!({"accessToken":"token","expiresAt":1700000060000i64}),
        json!({"accessToken":"token","refreshToken":"refresh","expiresAt":1700000060000i64}),
    ] {
        steps.push(secret(json!("owner"), "calendar-account", "g", value));
        steps.push(json!({"op":"calendars","user":"owner","id":"g"}));
    }
    steps.push(json!({"op":"saveApp","user":"owner","credentials":{"clientId":"id","clientSecret":"secret"}}));
    steps.push(json!({"op":"calendars","user":"owner","id":"g","fetches":[{"status":400,"data":{"error_description":"denied"}}]}));
    steps.push(secret(
        json!("owner"),
        "calendar-account",
        "g",
        json!({"accessToken":"token","expiresAt":1700000060001i64}),
    ));
    steps.push(json!({"op":"calendars","user":"owner","id":"g","fetches":[{"data":{"items":[]}}]}));
    compare(json!({"now":1700000000000i64,"seed":seed,"steps":steps})).await;
}

#[tokio::test]
async fn remote_events_selected_calendars_order_cancellation_and_provider_error() {
    let seed = "INSERT INTO calendar_accounts(id,user_id,provider,email,display_name,status,error,created_at,updated_at)VALUES('remote','owner','google','a@example.test','Display','connected',NULL,'old','old');";
    let calendar_data = json!({"items":[{"id":"a","summary":"A","selected":true},{"id":"b","summary":"B","primary":true},{"id":"hidden","selected":false,"primary":false}]});
    let steps = json!([
        secret(json!("owner"),"calendar-account","remote",json!({"accessToken":"token","expiresAt":1700001000000i64})),
        {"op":"events","user":"owner","id":"remote","options":{"timeMin":"2023-11-14","timeMax":"2023-11-16","query":" shift ","limit":2},"fetches":[
            {"data":calendar_data},
            {"data":{"items":[{"id":"late","start":{"dateTime":"2023-11-15T10:00:00Z"},"end":{"dateTime":"2023-11-15T11:00:00Z"}},{"id":"cancel","status":"cancelled"}]}},
            {"data":{"items":[{"id":"early","start":{"dateTime":"2023-11-14T10:00:00Z"},"end":{"dateTime":"2023-11-14T11:00:00Z"}}]}}
        ]},
        {"op":"events","user":"owner","id":"remote","options":{"calendarId":"b"},"fetches":[{"data":calendar_data},{"data":{"items":[]}}]},
        {"op":"events","user":"owner","id":"remote","fetches":[{"data":calendar_data},{"error":"provider offline"},{"data":{"items":[]}}]},
        {"op":"events","user":"owner","id":"remote","fetches":[{"data":{"items":[]}}]}
    ]);
    compare(json!({"now":1700000000000i64,"seed":seed,"steps":steps})).await;
}

#[tokio::test]
async fn oauth_errors_consume_state_and_failed_token_save_retains_account() {
    let steps = json!([
        {"op":"saveApp","user":"owner","credentials":{"clientId":"id","clientSecret":"secret"}},
        {"op":"start","user":"owner","alias":"denied","redirect":"http://localhost/cb"},
        {"op":"complete","start":"denied","code":"code","fetches":[{"status":403,"data":{"error_description":"access denied"}}]},
        {"op":"complete","start":"denied","code":"code"},
        {"op":"start","user":"owner","alias":"empty","redirect":"http://localhost/cb"},
        {"op":"complete","start":"empty","code":"code","fetches":[{"data":{"access_token":"token"}},{"data":{}}]},
        {"op":"start","user":"owner","alias":"lost","redirect":"http://localhost/cb"},
        {"op":"sql","sql":"DELETE FROM user_secrets WHERE type='calendar-oauth-app';"},
        {"op":"complete","start":"lost","code":"code"},
        {"op":"saveApp","user":"owner","credentials":{"clientId":"id","clientSecret":"secret"}},
        {"op":"complete","start":"lost","code":"code"},
        {"op":"start","user":"owner","alias":"partial","redirect":"http://localhost/cb"},
        {"op":"sql","sql":"CREATE TRIGGER fail_tokens BEFORE INSERT ON user_secrets WHEN NEW.type='calendar-account' BEGIN SELECT RAISE(ABORT,'token save failed');END;"},
        {"op":"complete","start":"partial","code":"code","sqlError":true,"fetches":[{"data":{"access_token":"token"}},{"data":{"email":"partial@example.test"}}]},
        {"op":"list","user":"owner"},
        {"op":"complete","start":"partial","code":"code"}
    ]);
    compare(json!({"now":1700000000000i64,"steps":steps})).await;
}

#[tokio::test]
async fn calendar_event_limit_coercion_preserves_nan_and_numeric_input_boundaries() {
    let events = json!([{"id":"event","calendarId":"work","title":"Shift","description":"","location":"","start":"2023-11-15T10:00:00.000Z","end":"2023-11-15T11:00:00.000Z"}]);
    let mut steps =
        vec![json!({"op":"sync","user":"owner","alias":"phone","snapshot":device("phone",events)})];
    for limit in [
        json!("NaN"),
        json!("garbage"),
        json!("1.5"),
        json!("0x10"),
        json!("0b11"),
        json!("0o10"),
        json!("Infinity"),
        json!("-Infinity"),
        json!("inf"),
        json!(true),
        json!(false),
        json!([]),
        json!([1]),
        json!({}),
        Value::Null,
    ] {
        steps.push(json!({"op":"events","user":"owner","id":"$phone","options":{"timeMin":"2023-11-14","timeMax":"2023-11-16","limit":limit}}));
    }
    compare(json!({"now":1700000000000i64,"steps":steps})).await;
}

#[tokio::test]
async fn oauth_callback_enforces_expiry_without_another_start_and_consumes_rejected_state() {
    let invalid = json!({"error":"OAuth state is invalid or expired. Please retry connecting."});
    let output = compare(json!({
        "now":1700000000000i64,
        "steps":[
            {"op":"saveApp","user":"owner","credentials":{"clientId":"fixture-id","clientSecret":"fixture-secret"}},
            {"op":"start","user":"owner","alias":"expired","redirect":"http://fixture.invalid/callback"},
            {"op":"time","now":1700000600001i64},
            {"op":"complete","start":"expired","code":"expired-code"},
            {"op":"time","now":1700000000000i64},
            {"op":"complete","start":"expired","code":"expired-replay"},
            {"op":"start","user":"owner","alias":"boundary","redirect":"http://fixture.invalid/callback"},
            {"op":"time","now":1700000600000i64},
            {"op":"complete","start":"boundary","code":"boundary-code","fetches":[{"status":400,"data":{"error_description":"synthetic_boundary_fixture"}}]},
            {"op":"complete","start":"boundary","code":"boundary-replay"}
        ]
    })).await;
    assert_eq!(output["results"][3], invalid);
    assert_eq!(output["results"][5], invalid);
    assert_eq!(
        output["results"][8],
        json!({"error":"Calendar OAuth token request failed: synthetic_boundary_fixture"})
    );
    assert_eq!(output["results"][9], invalid);
    let requests = output["requests"].as_array().unwrap();
    assert_eq!(
        requests.len(),
        1,
        "only the callback at the existing expiry boundary can exchange a token"
    );
    assert!(
        requests[0]["body"]
            .as_str()
            .unwrap()
            .contains("code=boundary-code")
    );
    assert_eq!(output["accounts"], json!([]));
}
