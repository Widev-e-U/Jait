#[path = "../src/internal_driver.rs"]
mod internal_driver;
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use hmac::{Hmac, Mac};
use jait_gateway::{
    db,
    services::{
        agent_github_apps::{
            AgentGithubAppService, GithubEffect, GithubRequest, GithubResponse,
            GithubTokenProgress, GithubVerificationProgress, build_app_jwt, github_request,
        },
        user_secrets::{SaveSecretParams, UserSecretService},
    },
};
use serde_json::{Value, json};
use sha2::Sha256;
use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
};
const NOW: i64 = 1_700_000_000_123;
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}
fn reference(call: Value) -> Value {
    internal_driver::call(
        &root(),
        &root()
            .join(".jait/artifacts/gateway-rust/agent-github-store/contracts")
            .join(uuid::Uuid::new_v4().to_string()),
        json!({"version":1,"calls":[call]}),
        &|| false,
    )
    .unwrap()[0]
        .clone()
}
async fn fixture_call(
    service: &AgentGithubAppService,
    db: &rusqlite::Connection,
    user: &str,
    agent: &str,
    step: &Value,
    effect: &GithubEffect,
) -> Result<Value, Box<dyn std::error::Error + Send + Sync>> {
    if ["token", "test", "env"].contains(&step["op"].as_str().unwrap_or("")) {
        let stored = service.get(db, user, agent)?;
        if step["op"] == "env"
            && (stored.is_null()
                || stored["status"] != "connected"
                || stored["installationId"].is_null())
        {
            return Ok(Value::Null);
        }
        let minted = match service.prepare_installation_token(db, user, agent)? {
            GithubTokenProgress::Cached(value, _) => value,
            GithubTokenProgress::Request(prepared) => {
                service.finish_call(db, prepared.execute(effect).await)?
            }
        };
        if step["op"] == "token" {
            return Ok(minted);
        }
        if step["op"] == "env" {
            return Ok(AgentGithubAppService::execution_environment(
                &stored, &minted,
            ));
        }
        let prepared = service.prepare_repositories(db, user, agent, &minted)?;
        return service.finish_call(db, prepared.execute(effect).await);
    }
    if step["op"] == "verify" {
        let mut prepared = service.prepare_verification(db, user, agent)?;
        loop {
            let completed = prepared.execute(effect).await;
            match service.finish_verification(db, completed)? {
                GithubVerificationProgress::Request(next) => prepared = *next,
                GithubVerificationProgress::Complete(value) => return Ok(value),
            }
        }
    }
    let prepared = if step["op"] == "attach" {
        service.prepare_installation(db, user, agent, step["installation"].as_str().unwrap())?
    } else {
        service.prepare_setup_exchange(db, user, agent, step["code"].as_str().unwrap())?
    };
    let completed = prepared.execute(effect).await;
    service.finish_call(db, completed)
}
fn run(call: &Value) -> Value {
    let db = db::open_database(std::path::Path::new(":memory:")).unwrap();
    db::migrate_database(&db).unwrap();
    if let Some(seed) = call["seed"].as_str() {
        db.execute_batch(seed).unwrap()
    }
    let secrets = (!call["noSecrets"].as_bool().unwrap_or(false))
        .then(|| UserSecretService::with_clock("github-storage-fixture", Arc::new(|| NOW)));
    let clock = Arc::new(std::sync::atomic::AtomicI64::new(NOW));
    let read_clock = clock.clone();
    let service = AgentGithubAppService::new(
        secrets.clone(),
        call["secret"].as_str().map(Into::into),
        Arc::new(move || read_clock.load(std::sync::atomic::Ordering::SeqCst)),
    )
    .with_api_base(call["apiBase"].as_str())
    .with_public_url(
        call["publicUrl"].as_str().map(Into::into),
        call["environment"].as_str().map(Into::into),
    );
    let effects = Arc::new(Mutex::new(vec![]));
    let mut results = vec![];
    for s in call["steps"].as_array().unwrap() {
        let u = s["user"].as_str().unwrap_or_default();
        let a = s["agent"].as_str().unwrap_or_default();
        let r = match s["op"].as_str().unwrap() {
            "advance" => {
                clock.fetch_add(
                    s["ms"].as_i64().unwrap(),
                    std::sync::atomic::Ordering::SeqCst,
                );
                Ok(Value::Null)
            }
            "complete" | "attach" | "verify" | "token" | "test" | "env" => {
                let responses = Arc::new(Mutex::new(std::collections::VecDeque::from(
                    s["responses"]
                        .as_array()
                        .cloned()
                        .unwrap_or_else(|| vec![s["response"].clone()]),
                )));
                let recorded = effects.clone();
                let owner = u.to_owned();
                let agent = a.to_owned();
                let effect: GithubEffect = Arc::new(move |request| {
                    assert_eq!(request.user, owner);
                    assert_eq!(request.agent, agent);
                    assert_eq!(request.timeout, std::time::Duration::from_secs(15));
                    assert_eq!(request.max_response_bytes, 1024 * 1024);
                    assert!(!request.follow_redirects);
                    recorded.lock().unwrap().push(json!({"url":request.url,"method":request.method,"headers":request.headers,"body":null}));
                    let response = responses
                        .lock()
                        .unwrap()
                        .pop_front()
                        .expect("unexpected network request");
                    Box::pin(async move {
                        if let Some(error) = response["error"].as_str() {
                            return Err(error.into());
                        }
                        let body = if response["textError"] == true {
                            String::new()
                        } else {
                            response["body"]
                                .as_str()
                                .map(Into::into)
                                .unwrap_or_else(|| response["data"].to_string())
                        };
                        Ok(GithubResponse {
                            status: response["status"].as_u64().unwrap() as u16,
                            body: response["bytes"]
                                .as_array()
                                .map(|v| v.iter().map(|n| n.as_u64().unwrap() as u8).collect())
                                .unwrap_or_else(|| body.into_bytes()),
                        })
                    })
                });
                tokio::runtime::Builder::new_current_thread()
                    .enable_time()
                    .build()
                    .unwrap()
                    .block_on(fixture_call(&service, &db, u, a, s, &effect))
            }
            "begin" => service
                .begin_setup(&db, u, a, &s["options"])
                .map(|mut start| {
                    let token = start.state.clone();
                    let name = std::mem::take(&mut start.manifest.name.0);
                    let mut value = serde_json::to_value(start).unwrap();
                    value["state"] = service.read_state(&token);
                    value["postUrl"] = json!(
                        value["postUrl"]
                            .as_str()
                            .unwrap()
                            .replace(&token, "<state>")
                    );
                    value["manifest"]["name"] = json!(name);
                    value
                }),
            "base" => Ok(
                json!({"configured":service.configured_base_url(),"public":service.public_base_url()}),
            ),
            "disconnect" => service.disconnect(&db, u, a),
            "installed" => service.installed_agent_ids(&db, u),
            "webhook" => service.webhook_secret(&db, u, a).map(|s| json!(s)),
            "secret" => secrets
                .as_ref()
                .unwrap()
                .save(
                    &db,
                    SaveSecretParams {
                        user_id: Some(u.into()),
                        r#type: s["type"].as_str().unwrap_or("github-app").into(),
                        key: s["key"].as_str().unwrap().into(),
                        label: "fixture".into(),
                        value: s["value"].as_str().unwrap().into(),
                    },
                )
                .map(|_| Value::Null),
            "save" => service.save_manual(&db, u, a, &s["options"]),
            "get" => service.get(&db, u, a),
            "list" => service.list(&db, u),
            "findApp" => service.find_owner(&db, "appId", s["id"].as_str().unwrap()),
            "findInstallation" => {
                service.find_owner(&db, "installationId", s["id"].as_str().unwrap())
            }
            "state" => Ok(service.read_state(s["state"].as_str().unwrap())),
            "sql" => db
                .execute_batch(s["sql"].as_str().unwrap())
                .map(|_| Value::Null)
                .map_err(Into::into),
            _ => panic!("unhandled test step"),
        };
        results.push(r.unwrap_or_else(|e| json!({"error":e.to_string()})));
    }
    let mut stmt = db
        .prepare(
            "SELECT user_id,agent_id,status,data FROM agent_github_apps ORDER BY user_id,agent_id",
        )
        .unwrap();
    let mut rows:Vec<Value>=stmt.query_map([],|r|Ok(json!({"user_id":r.get::<_,String>(0)?,"agent_id":r.get::<_,String>(1)?,"status":r.get::<_,String>(2)?,"data":serde_json::from_str::<Value>(&r.get::<_,String>(3)?).unwrap()}))).unwrap().map(Result::unwrap).collect();
    for row in &mut rows {
        if let Some(state) = row["data"]["manifestState"].as_str()
            && !service.read_state(state).is_null()
        {
            row["data"]["manifestState"] = json!("<state>");
        }
    }
    let mut stmt = db
        .prepare(
            "SELECT user_id,type,key,label,encrypted_value FROM user_secrets ORDER BY user_id,key",
        )
        .unwrap();
    let encrypted:Vec<Value>=stmt.query_map([],|r|{
  let user:String=r.get(0)?;let t:String=r.get(1)?;let key:String=r.get(2)?;let label:String=r.get(3)?;let ciphertext:String=r.get(4)?;
  let value=secrets.as_ref().unwrap().get_value(&db,Some(&user),&t,&key).unwrap().unwrap();
  Ok(json!({"user":user,"type":t,"key":key,"label":label,"encrypted":ciphertext!=value&&!ciphertext.contains("PRIVATE KEY"),"value":value}))
 }).unwrap().map(Result::unwrap).collect();
    json!({"results":results,"rows":rows,"secrets":encrypted,"effects":*effects.lock().unwrap()})
}
fn compare(steps: Value, no_secrets: bool) {
    let call = json!({"op":"nativegithubstore.run","now":NOW,"steps":steps,"noSecrets":no_secrets,"secret":"state-fixture"});
    let actual = run(&call);
    let expected = reference(call);
    fn mismatch(path: String, a: &Value, b: &Value) -> Option<String> {
        if a == b {
            return None;
        }
        if let (Some(a), Some(b)) = (a.as_object(), b.as_object()) {
            for key in a.keys().chain(b.keys()) {
                if let Some(found) = mismatch(
                    format!("{path}/{key}"),
                    a.get(key).unwrap_or(&Value::Null),
                    b.get(key).unwrap_or(&Value::Null),
                ) {
                    return Some(found);
                }
            }
        } else if let (Some(a), Some(b)) = (a.as_array(), b.as_array()) {
            if a.len() != b.len() {
                return Some(format!("{path}: array lengths {} != {}", a.len(), b.len()));
            }
            for (i, (a, b)) in a.iter().zip(b).enumerate() {
                if let Some(found) = mismatch(format!("{path}/{i}"), a, b) {
                    return Some(found);
                }
            }
        }
        Some(format!("{path}: {a} != {b}"))
    }
    if let Some(difference) = mismatch(String::new(), &actual, &expected) {
        panic!("native/reference difference: {difference}");
    }
    assert_eq!(actual, expected);
}
fn save(user: &str, agent: &str, id: &str, key: &str) -> Value {
    json!({"op":"save","user":user,"agent":agent,"options":{"appId":id,"privateKey":key,"appSlug":" robot ","appName":" Friendly bot "}})
}
#[test]
fn owner_agent_isolation_and_encrypted_metadata() {
    compare(
        json!([
         save("owner","a"," 123 "," \r\n-----BEGIN PRIVATE KEY-----\r\nfixture-a\r\n "),
         save("other","a","456","PRIVATE KEY other"),save("owner","b","789","PRIVATE KEY b"),
         {"op":"get","user":"stranger","agent":"a"},{"op":"get","user":"owner","agent":"missing"},
         {"op":"get","user":"owner","agent":"a"},{"op":"list","user":"owner"},{"op":"list","user":"other"},
         {"op":"findApp","id":"123"},{"op":"findApp","id":"456"},{"op":"findApp","id":""},{"op":"findInstallation","id":"missing"}
        ]),
        false,
    );
}
#[test]
fn manual_validation_before_persistence() {
    compare(
        json!([save("u","a","12x","PRIVATE KEY"),save("u","a","","PRIVATE KEY"),save("u","a","١٢","PRIVATE KEY"),save("u","a","12","no key"),{"op":"list","user":"u"}]),
        false,
    );
    compare(
        json!([save("u","a","12x","bad"),{"op":"get","user":"u","agent":"a"}]),
        true,
    );
}
#[test]
fn update_preserves_creation_installation_and_omits_manifest_state() {
    let sql = "UPDATE agent_github_apps SET data=json_set(data,'$.installationId','99','$.createdAt','old','$.manifestState','secret-state','$.lastError','old-error') WHERE user_id='u' AND agent_id='a'";
    compare(
        json!([save("u","a","1","PRIVATE KEY old"),{"op":"sql","sql":sql},save("u","a","2","PRIVATE KEY new"),{"op":"get","user":"u","agent":"a"},{"op":"findInstallation","id":"99"}]),
        false,
    );
}
#[test]
fn public_key_presence_uses_live_encrypted_store() {
    compare(
        json!([save("u","a","1","PRIVATE KEY old"),{"op":"sql","sql":"DELETE FROM user_secrets WHERE user_id='u'"},{"op":"get","user":"u","agent":"a"},{"op":"list","user":"u"}]),
        false,
    );
}
fn signed(body: &str, secret: &str) -> String {
    let mut mac = Hmac::<Sha256>::new_from_slice(secret.as_bytes()).unwrap();
    mac.update(body.as_bytes());
    format!(
        "{body}.{}",
        URL_SAFE_NO_PAD.encode(mac.finalize().into_bytes())
    )
}
#[test]
fn state_authenticity_shape_and_forgiving_decode() {
    let body = URL_SAFE_NO_PAD.encode(br#"{"userId":"owner","agentId":"a","nonce":"fixture"}"#);
    let good = signed(&body, "state-fixture");
    let mut steps = vec![
        json!({"op":"state","state":good}),
        json!({"op":"state","state":format!("{good}.extra")}),
        json!({"op":"state","state":signed(&body,"wrong")}),
    ];
    for body in [
        body.clone() + "=",
        format!("{}\n!{}", &body[..4], &body[4..]),
        URL_SAFE_NO_PAD.encode(br#"{"userId":12,"agentId":true}"#),
        URL_SAFE_NO_PAD.encode(br#"{"userId":[],"agentId":{}}"#),
        URL_SAFE_NO_PAD.encode(br#"{"userId":"","agentId":"a"}"#),
        URL_SAFE_NO_PAD.encode(b"null"),
        URL_SAFE_NO_PAD.encode(b"{invalid"),
        "%%%".into(),
    ] {
        steps.push(json!({"op":"state","state":signed(&body,"state-fixture")}));
    }
    for state in ["", "a", ".abc", "abc.", "abc.abc", "a.b.c"] {
        steps.push(json!({"op":"state","state":state}));
    }
    compare(Value::Array(steps), false);
}
#[test]
fn native_and_reference_signed_states_cross_validate() {
    let service = AgentGithubAppService::new(None, Some("state-fixture".into()), Arc::new(|| NOW));
    let native = service.sign_state("u", "a").unwrap();
    let native2 = service.sign_state("u", "a").unwrap();
    assert_ne!(native, native2);
    let response = reference(
        json!({"op":"nativegithubstore.run","now":NOW,"secret":"state-fixture","steps":[{"op":"state","state":native},{"op":"sign","user":"u","agent":"a"}]}),
    );
    assert_eq!(response["results"][0], json!({"userId":"u","agentId":"a"}));
    assert_eq!(
        service.read_state(response["results"][1].as_str().unwrap()),
        json!({"userId":"u","agentId":"a"})
    );
    let body = URL_SAFE_NO_PAD
        .decode(native.split('.').next().unwrap())
        .unwrap();
    let claims: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(claims["userId"], "u");
    assert_eq!(claims["agentId"], "a");
    assert_eq!(claims["nonce"].as_str().unwrap().len(), 36);
}

#[test]
fn setup_manifest_names_permissions_and_owner_credentials() {
    compare(
        json!([
            {"op":"base"},
            {"op":"begin","user":"u","agent":"abcdefghi","options":{"appName":" ","organization":" "}},
            {"op":"get","user":"u","agent":"abcdefghi"},
            save("other","a","1","PRIVATE KEY other"),
            {"op":"begin","user":"u","agent":"a","options":{"appName":"  Friendly bot  ","organization":"  org /?!'()~é  ","homepage":" https://home.example/a ","description":" description ","baseUrl":" https://request.example/// "}},
            save("u","a","2","PRIVATE KEY own"),
            {"op":"begin","user":"u","agent":"a","options":{"appName":"second","description":" ","homepage":" "}},
            {"op":"get","user":"other","agent":"a"},
            {"op":"get","user":"u","agent":"a"}
        ]),
        false,
    );
    compare(
        json!([{"op":"begin","user":"u","agent":"😀😀😀😀","options":{"appName":" "}},
        {"op":"begin","user":"u","agent":"a","options":{"appName":format!("{}😀tail","x".repeat(33))}}]),
        true,
    );
}
#[test]
fn configured_public_url_precedence_and_explicit_blank() {
    for (configured, environment) in [
        (
            Some(" https://configured.example/// "),
            Some("https://env.example/"),
        ),
        (None, Some(" https://env.example/// ")),
        (Some("  "), Some("https://env.example")),
        (Some("///"), None),
        (None, None),
    ] {
        let call = json!({"op":"nativegithubstore.run","now":NOW,"publicUrl":configured,"environment":environment,"steps":[{"op":"base"},{"op":"begin","user":"u","agent":"a","options":{"appName":"test","baseUrl":"https://untrusted-request.example/"}}]});
        assert_eq!(run(&call), reference(call));
    }
}
#[test]
fn setup_serializes_split_utf16_without_replacement() {
    let db = db::open_database(std::path::Path::new(":memory:")).unwrap();
    db::migrate_database(&db).unwrap();
    let service = AgentGithubAppService::new(None, None, Arc::new(|| NOW));
    let setup = service
        .begin_setup(
            &db,
            "u",
            "a",
            &json!({"appName":format!("{}😀","x".repeat(33))}),
        )
        .unwrap();
    let wire = serde_json::to_string(&setup).unwrap();
    assert!(wire.contains("\\ud83d"));
    assert!(!wire.contains('�'));
    assert_eq!(
        service.read_state(&setup.state),
        json!({"userId":"u","agentId":"a"})
    );
}
#[test]
fn disconnect_removes_only_owner_agent_credentials_and_is_idempotent() {
    compare(
        json!([
            save("u","a","1","PRIVATE KEY own"),save("other","a","2","PRIVATE KEY other"),save("u","b","3","PRIVATE KEY b"),
            {"op":"secret","user":"u","key":"agent:a:webhook","value":"webhook-a"},
            {"op":"secret","user":"other","key":"agent:a:webhook","value":"webhook-other"},
            {"op":"secret","user":"u","key":"agent:a:extra","value":"retain-extra"},
            {"op":"secret","user":"u","key":"agent:a","type":"different","value":"retain-other-type"},
            {"op":"webhook","user":"u","agent":"a"},{"op":"webhook","user":"stranger","agent":"a"},
            {"op":"sql","sql":"UPDATE agent_github_apps SET data=json_set(data,'$.installationId','99') WHERE user_id='u' AND agent_id='a'"},
            {"op":"installed","user":"u"},{"op":"installed","user":"other"},
            {"op":"disconnect","user":"stranger","agent":"a"},{"op":"disconnect","user":"u","agent":"a"},
            {"op":"disconnect","user":"u","agent":"a"},{"op":"get","user":"other","agent":"a"},
            {"op":"get","user":"u","agent":"b"},{"op":"get","user":"u","agent":"a"},
            {"op":"webhook","user":"other","agent":"a"},{"op":"installed","user":"u"}
        ]),
        false,
    );
    compare(
        json!([{"op":"secret","user":"u","key":"agent:a:webhook","value":"orphan-webhook"},
        {"op":"disconnect","user":"u","agent":"a"},{"op":"disconnect","user":"u","agent":"a"}]),
        false,
    );
    compare(
        json!([{"op":"begin","user":"u","agent":"a","options":{"appName":"test"}},
        {"op":"disconnect","user":"u","agent":"a"},{"op":"disconnect","user":"u","agent":"a"},{"op":"webhook","user":"u","agent":"a"}]),
        true,
    );
}

fn exchange(user: &str, agent: &str, code: &str, response: Value) -> Value {
    json!({"op":"complete","user":user,"agent":agent,"code":code,"response":response})
}
fn credentials() -> Value {
    json!({"id":12345,"slug":"agent-bot","name":"Agent Bot","client_id":"Iv-fixture","client_secret":"never-persist-client-secret","pem":" \r\nPRIVATE KEY manifest-fixture\r\n ","webhook_secret":"fixture-webhook","html_url":"https://github.com/apps/agent-bot"})
}
#[test]
fn manifest_exchange_success_encrypts_secrets_and_preserves_owner_isolation() {
    compare(
        json!([
            save("other","a","88","PRIVATE KEY other"), save("u","b","99","PRIVATE KEY b"),
            {"op":"begin","user":"u","agent":"a","options":{"appName":"Fixture"}},
            exchange("u","a","code",json!({"status":201,"data":credentials()})),
            {"op":"get","user":"u","agent":"a"},{"op":"get","user":"other","agent":"a"},
            {"op":"get","user":"u","agent":"b"},{"op":"webhook","user":"u","agent":"a"},
            {"op":"webhook","user":"other","agent":"a"}, {"op":"findApp","id":"12345"}
        ]),
        false,
    );
}
#[test]
fn manifest_exchange_failure_matrix_persists_error_and_clears_state() {
    for (status, message) in [
        (401, json!("Bad credentials")),
        (403, json!("Forbidden")),
        (404, json!("Missing")),
        (422, json!("")),
        (500, json!({"detail":"opaque"})),
        (400, Value::Null),
        (429, json!(["rate", null, "limited"])),
        (503, json!(false)),
    ] {
        compare(
            json!([
                {"op":"begin","user":"u","agent":"a","options":{"appName":"Fixture"}},
                exchange("u","a","code",json!({"status":status,"data":{"message":message}})),
                {"op":"get","user":"u","agent":"a"},{"op":"get","user":"other","agent":"a"}
            ]),
            false,
        );
    }
}
#[test]
fn manifest_network_and_malformed_error_response_preserve_existing_credentials() {
    for response in [
        json!({"error":"offline"}),
        json!({"status":502,"body":"<html>failure</html>"}),
        json!({"status":401,"textError":true}),
        json!({"status":400,"data":[]} ),
    ] {
        compare(
            json!([save("u","a","1","PRIVATE KEY before"),
                {"op":"sql","sql":"UPDATE agent_github_apps SET data=json_set(data,'$.installationId','42','$.manifestState','prior-state')"},
                exchange("u","a","code",response),{"op":"get","user":"u","agent":"a"}
            ]),
            false,
        );
    }
}
#[test]
fn manifest_exchange_requires_secret_store_after_success_and_uses_network_error_first() {
    for response in [
        json!({"status":200,"data":credentials()}),
        json!({"status":404,"data":{"message":"Unknown code"}}),
    ] {
        compare(
            json!([exchange("u","a","code",response),{"op":"get","user":"u","agent":"a"}]),
            true,
        );
    }
}
#[test]
fn manifest_exchange_replaces_registration_and_retains_absent_webhook() {
    let mut second = credentials();
    second["id"] = json!(678);
    second["slug"] = Value::Null;
    second["name"] = json!("Replacement");
    second.as_object_mut().unwrap().remove("webhook_secret");
    second.as_object_mut().unwrap().remove("client_id");
    compare(
        json!([
            exchange("u","a","code",json!({"status":201,"data":credentials()})),
            {"op":"sql","sql":"UPDATE agent_github_apps SET data=json_set(data,'$.installationId','42','$.installedAt','prior-date')"},
            exchange("u","a","second",json!({"status":200,"data":second})),
            {"op":"webhook","user":"u","agent":"a"},{"op":"get","user":"u","agent":"a"}
        ]),
        false,
    );
}
#[test]
fn manifest_code_encoding_and_enterprise_base_are_reference_compatible() {
    for base in [
        Value::Null,
        json!("https://github.enterprise.example/api/v3///"),
    ] {
        let call = json!({"op":"nativegithubstore.run","now":NOW,"apiBase":base,"steps":[
            exchange("u","a","../x/y?# %😀!'()*",json!({"status":200,"data":credentials()}))
        ]});
        assert_eq!(run(&call), reference(call));
    }
}
const RSA_KEY: &str = include_str!("../fixtures/github-app/test-only-key.pem");
const PKCS1_KEY: &str = include_str!("../fixtures/github-app/test-only-pkcs1.pem");
#[test]
fn rs256_jwt_matches_reference_claims_encoding_and_independent_signature_verification() {
    for key in [
        RSA_KEY.to_owned(),
        PKCS1_KEY.to_owned(),
        format!(" \r\n{}\r\n ", RSA_KEY.replace('\n', "\r\n")),
    ] {
        for (app, now) in [("12345", NOW), ("unicode-😀", 0), ("negative-time", -1)] {
            let token = build_app_jwt(app, &key, now).unwrap();
            let expected = reference(
                json!({"op":"nativegithubstore.run","mode":"jwt","key":key,"app":app,"now":now}),
            );
            assert_eq!(token, expected["token"]);
            assert_eq!(expected["header"], json!({"alg":"RS256","typ":"JWT"}));
            assert_eq!(
                expected["claims"],
                json!({"iat":now.div_euclid(1000)-60,"exp":now.div_euclid(1000)+480,"iss":app})
            );
            assert_eq!(expected["verified"], true);
            let verified = reference(
                json!({"op":"nativegithubstore.run","mode":"jwt","key":key,"verifyJwt":token}),
            );
            assert_eq!(verified["verified"], true);
        }
    }
}
#[test]
fn jwt_signature_covers_claims_and_rejects_invalid_keys() {
    let token = build_app_jwt("123", RSA_KEY, NOW).unwrap();
    let mut parts: Vec<_> = token.split('.').map(str::to_owned).collect();
    parts[1] = URL_SAFE_NO_PAD.encode(br#"{"iat":1,"exp":9999999999,"iss":"different"}"#);
    let check = reference(
        json!({"op":"nativegithubstore.run","mode":"jwt","key":RSA_KEY,"verifyJwt":parts.join(".")}),
    );
    assert_eq!(check["verified"], false);
    for key in [
        "",
        "PRIVATE KEY",
        "-----BEGIN RSA PRIVATE KEY-----\nAQID\n-----END RSA PRIVATE KEY-----",
    ] {
        assert!(build_app_jwt("123", key, NOW).is_err());
    }
}
struct DropMarker(Arc<std::sync::atomic::AtomicBool>);
impl Drop for DropMarker {
    fn drop(&mut self) {
        self.0.store(true, std::sync::atomic::Ordering::SeqCst);
    }
}
fn pending_effect(dropped: Arc<std::sync::atomic::AtomicBool>) -> GithubEffect {
    Arc::new(move |_| {
        let marker = DropMarker(dropped.clone());
        Box::pin(async move {
            let _marker = marker;
            std::future::pending::<Result<GithubResponse, String>>().await
        })
    })
}
#[tokio::test(start_paused = true)]
async fn outbound_deadline_drops_effect_and_records_setup_failure() {
    let db = db::open_database(std::path::Path::new(":memory:")).unwrap();
    db::migrate_database(&db).unwrap();
    let service = AgentGithubAppService::new(None, None, Arc::new(|| NOW));
    let dropped = Arc::new(std::sync::atomic::AtomicBool::new(false));
    let effect = pending_effect(dropped.clone());
    let start = tokio::time::Instant::now();
    let completed = service
        .prepare_setup_exchange(&db, "u", "a", "code")
        .unwrap()
        .execute(&effect)
        .await;
    let error = service.finish_call(&db, completed).unwrap_err();
    assert_eq!(
        tokio::time::Instant::now() - start,
        std::time::Duration::from_secs(15)
    );
    assert!(dropped.load(std::sync::atomic::Ordering::SeqCst));
    assert_eq!(
        error.to_string(),
        "Could not reach GitHub: request timed out"
    );
    let record = service.get(&db, "u", "a").unwrap();
    assert_eq!(record["status"], "error");
    assert_eq!(record["lastError"], error.to_string());
}
#[tokio::test]
async fn cancelled_exchange_drops_effect_without_persisting_a_completion() {
    let db = db::open_database(std::path::Path::new(":memory:")).unwrap();
    db::migrate_database(&db).unwrap();
    let service = AgentGithubAppService::new(None, None, Arc::new(|| NOW));
    let dropped = Arc::new(std::sync::atomic::AtomicBool::new(false));
    let effect = pending_effect(dropped.clone());
    let prepared = service
        .prepare_setup_exchange(&db, "u", "a", "code")
        .unwrap();
    let mut operation = Box::pin(prepared.execute(&effect));
    assert!(futures_util::poll!(&mut operation).is_pending());
    drop(operation);
    assert!(dropped.load(std::sync::atomic::Ordering::SeqCst));
    assert_eq!(service.get(&db, "u", "a").unwrap(), Value::Null);
}
#[tokio::test]
async fn oversized_response_is_rejected_before_secret_or_connection_success() {
    let db = db::open_database(std::path::Path::new(":memory:")).unwrap();
    db::migrate_database(&db).unwrap();
    let service = AgentGithubAppService::new(None, None, Arc::new(|| NOW));
    let effect: GithubEffect = Arc::new(|_| {
        Box::pin(async {
            Ok(GithubResponse {
                status: 201,
                body: vec![b'x'; 1024 * 1024 + 1],
            })
        })
    });
    let completed = service
        .prepare_setup_exchange(&db, "u", "a", "code")
        .unwrap()
        .execute(&effect)
        .await;
    let error = service.finish_call(&db, completed).unwrap_err();
    assert_eq!(
        error.to_string(),
        "Could not reach GitHub: response exceeds byte limit"
    );
    assert_eq!(service.get(&db, "u", "a").unwrap()["status"], "error");
}

#[test]
fn malformed_success_matches_reference_errors_without_partial_key_writes() {
    for data in [
        json!({}),
        json!({"pem":null}),
        json!({"pem":42}),
        json!({"pem":true}),
        json!({"pem":[]}),
        json!({"pem":{}}),
        json!([]),
        json!(false),
        json!("string"),
        Value::Null,
    ] {
        compare(
            json!([
                {"op":"begin","user":"u","agent":"a","options":{"appName":"fixture"}},
                exchange("u","a","code",json!({"status":200,"data":data})),
                {"op":"get","user":"u","agent":"a"}
            ]),
            false,
        );
    }
}
fn native_request(response: &Value) -> Value {
    let status = response["status"].clone();
    let response = response.clone();
    let effect: GithubEffect = Arc::new(move |_| {
        let response = response.clone();
        Box::pin(async move {
            if let Some(error) = response["error"].as_str() {
                return Err(error.into());
            }
            Ok(GithubResponse {
                status: response["status"].as_u64().unwrap() as u16,
                body: response["bytes"]
                    .as_array()
                    .map(|v| v.iter().map(|n| n.as_u64().unwrap() as u8).collect())
                    .unwrap_or_else(|| {
                        response["body"]
                            .as_str()
                            .map(Into::into)
                            .unwrap_or_else(|| response["data"].to_string())
                            .into_bytes()
                    }),
            })
        })
    });
    let request = GithubRequest {
        user: "u".into(),
        agent: "a".into(),
        url: "https://fixture.invalid/probe".into(),
        method: "GET",
        headers: vec![],
        timeout: std::time::Duration::from_secs(15),
        max_response_bytes: 1024 * 1024,
        follow_redirects: false,
    };
    let result = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap()
        .block_on(github_request(request, &effect));
    match result {
        Ok(data) => json!({"ok":true,"status":status,"data":data}),
        Err(e) => {
            json!({"ok":false,"status":e.status,"message":e.message,"credentialRejected":e.credential_rejected})
        }
    }
}
#[test]
fn structured_http_classification_and_replacement_decoding_match_reference() {
    let mut responses = vec![json!({"error":"socket reset"})];
    for status in [200, 201, 204, 299, 300, 401, 403, 404, 422, 429, 500] {
        for data in [
            json!({"message":"fixture"}),
            json!({"message":null}),
            json!({"message":[1,"two"]}),
            json!({"message":{}}),
            json!({}),
            Value::Null,
            json!(false),
            json!(42),
            json!([1, 2]),
        ] {
            responses.push(json!({"status":status,"data":data}));
        }
        responses.push(json!({"status":status,"body":"invalid JSON"}));
        responses.push(json!({"status":status,"body":""}));
        for bytes in [
            b"{\"message\":\"bad \xff\"}".to_vec(),
            [vec![0xef, 0xbb, 0xbf], b"{\"message\":\"BOM\"}".to_vec()].concat(),
            b"{\"message\":\"\xf0\x28\x8c\x28\"}".to_vec(),
        ] {
            responses.push(json!({"status":status,"bytes":bytes}));
        }
    }
    for response in responses {
        let expected = reference(
            json!({"op":"nativegithubstore.run","mode":"request","now":NOW,"response":response}),
        );
        assert_eq!(native_request(&response), expected, "response: {response}");
    }
}
#[test]
fn manifest_exchange_decodes_utf8_with_replacement_and_bom_before_persisting_errors() {
    for bytes in [
        b"{\"message\":\"bad \xff\"}".to_vec(),
        [vec![0xef, 0xbb, 0xbf], b"{\"message\":\"BOM\"}".to_vec()].concat(),
    ] {
        compare(
            json!([exchange(
                "u",
                "a",
                "code",
                json!({"status":403,"bytes":bytes})
            )]),
            false,
        );
    }
}

fn attach(user: &str, agent: &str, response: Value) -> Value {
    json!({"op":"attach","user":user,"agent":agent,"installation":"../42/?# 😀","response":response})
}
#[test]
fn installation_binding_is_signed_scoped_and_preserves_reference_metadata() {
    for data in [
        json!({"id":42,"app_id":123,"app_slug":"fresh","account":{"login":"owner","type":"Organization"},"repository_selection":"selected","permissions":{"contents":"write"}}),
        json!({"id":"43","app_id":"123","app_slug":null,"account":null}),
        json!({"id":44,"app_slug":""}),
        json!({}),
        json!({"app_id":999}),
    ] {
        compare(
            json!([
                save("u","a","123",RSA_KEY),save("other","a","123",RSA_KEY),save("u","other","123",RSA_KEY),
                attach("u","a",json!({"status":200,"data":data})),
                {"op":"installed","user":"u"},{"op":"get","user":"u","agent":"a"}
            ]),
            false,
        );
    }
}
#[test]
fn installation_rejection_distinguishes_revoked_from_forbidden_and_network_errors() {
    for response in [
        json!({"error":"network down"}),
        json!({"status":401,"data":{"message":"bad key"}}),
        json!({"status":403,"data":{"message":"forbidden"}}),
        json!({"status":404,"data":{}}),
        json!({"status":422,"data":{"message":"bad id"}}),
    ] {
        compare(
            json!([save("u","a","123",RSA_KEY),attach("u","a",response),{"op":"get","user":"u","agent":"a"}]),
            false,
        );
    }
}
#[test]
fn installation_missing_registration_or_key_has_no_network_effect() {
    compare(
        json!([attach("u", "a", json!({"status":200,"data":{}}))]),
        false,
    );
    compare(
        json!([
            {"op":"begin","user":"u","agent":"a","options":{"appName":"fixture"}},
            attach("u","a",json!({"status":200,"data":{}})),
            save("u","a","123",RSA_KEY),
            {"op":"sql","sql":"DELETE FROM user_secrets"},
            attach("u","a",json!({"status":200,"data":{}}))
        ]),
        false,
    );
}
fn worker_fixture() -> (Arc<AgentGithubAppService>, db::worker::DatabaseWorker) {
    let connection = db::open_database(std::path::Path::new(":memory:")).unwrap();
    db::migrate_database(&connection).unwrap();
    let service = Arc::new(AgentGithubAppService::new(
        Some(UserSecretService::with_clock(
            "github-storage-fixture",
            Arc::new(|| NOW),
        )),
        None,
        Arc::new(|| NOW),
    ));
    service
        .begin_setup(&connection, "u", "a", &json!({"appName":"fixture"}))
        .unwrap();
    let worker =
        db::worker::DatabaseWorker::new(connection, std::num::NonZeroU16::new(4).unwrap()).unwrap();
    (service, worker)
}
#[tokio::test]
async fn send_capable_exchange_releases_database_and_rejects_stale_success_and_failure() {
    for change in ["disconnect", "key", "setup", "unrelated"] {
        for status in [201, 403] {
            let (service, worker) = worker_fixture();
            let started = Arc::new(tokio::sync::Notify::new());
            let release = Arc::new(tokio::sync::Notify::new());
            let (signal, wait) = (started.clone(), release.clone());
            let effect: GithubEffect = Arc::new(move |_| {
                let (signal, wait) = (signal.clone(), wait.clone());
                Box::pin(async move {
                    signal.notify_one();
                    wait.notified().await;
                    Ok(GithubResponse {
                        status,
                        body: if status == 201 {
                            credentials().to_string().into_bytes()
                        } else {
                            br#"{"message":"forbidden"}"#.to_vec()
                        },
                    })
                })
            });
            let (active, store) = (service.clone(), worker.clone());
            // tokio::spawn requires Send; compilation checks the complete DB/network composition.
            let task = tokio::spawn(async move {
                active
                    .complete_setup(&store, "u", "a", "code", &effect)
                    .await
            });
            tokio::time::timeout(std::time::Duration::from_secs(3), started.notified())
                .await
                .unwrap();
            let modify = service.clone();
            let before = tokio::time::timeout(
                std::time::Duration::from_secs(3),
                worker.run(move |db| {
                    match change {
                        "disconnect" => {
                            modify.disconnect(db, "u", "a")?;
                        }
                        "key" => {
                            modify.save_manual(
                                db,
                                "u",
                                "a",
                                &save("u", "a", "123", RSA_KEY)["options"],
                            )?;
                        }
                        "setup" => {
                            modify.begin_setup(db, "u", "a", &json!({"appName":"new setup"}))?;
                        }
                        _ => {
                            modify.save_manual(
                                db,
                                "other",
                                "a",
                                &save("other", "a", "456", RSA_KEY)["options"],
                            )?;
                        }
                    }
                    modify.get(db, "u", "a")
                }),
            )
            .await
            .unwrap()
            .unwrap();
            release.notify_one();
            let result = task.await.unwrap();
            let check = service.clone();
            let after = worker.run(move |db| check.get(db, "u", "a")).await.unwrap();
            if change == "unrelated" {
                if status == 201 {
                    assert!(result.is_ok());
                    assert_eq!(after["appId"], "12345");
                } else {
                    assert!(result.unwrap_err().to_string().starts_with("forbidden"));
                    assert_eq!(after["status"], "error");
                }
            } else {
                assert_eq!(
                    result.unwrap_err().to_string(),
                    "GitHub connection changed while the request was in flight. Retry the operation."
                );
                assert_eq!(before, after);
            }
            worker.shutdown().await.unwrap();
        }
    }
}
#[tokio::test]
async fn cancelled_worker_exchange_drops_network_and_leaves_prepared_state() {
    let (service, worker) = worker_fixture();
    let started = Arc::new(tokio::sync::Notify::new());
    let signal = started.clone();
    let dropped = Arc::new(std::sync::atomic::AtomicBool::new(false));
    let marker = dropped.clone();
    let effect: GithubEffect = Arc::new(move |_| {
        let (signal, marker) = (signal.clone(), DropMarker(marker.clone()));
        Box::pin(async move {
            let _marker = marker;
            signal.notify_one();
            std::future::pending().await
        })
    });
    let read = service.clone();
    let before = worker.run(move |db| read.get(db, "u", "a")).await.unwrap();
    let (active, store) = (service.clone(), worker.clone());
    let task = tokio::spawn(async move {
        active
            .complete_setup(&store, "u", "a", "code", &effect)
            .await
    });
    tokio::time::timeout(std::time::Duration::from_secs(3), started.notified())
        .await
        .unwrap();
    task.abort();
    assert!(task.await.unwrap_err().is_cancelled());
    assert!(dropped.load(std::sync::atomic::Ordering::SeqCst));
    let after = worker
        .run(move |db| service.get(db, "u", "a"))
        .await
        .unwrap();
    assert_eq!(before, after);
    worker.shutdown().await.unwrap();
}
#[tokio::test]
async fn send_capable_installation_completes_through_worker() {
    let (service, worker) = worker_fixture();
    let prepare = service.clone();
    worker
        .run(move |db| {
            prepare.save_manual(db, "u", "a", &save("u", "a", "123", RSA_KEY)["options"])
        })
        .await
        .unwrap();
    let effect: GithubEffect = Arc::new(|request| {
        assert_eq!(request.method, "GET");
        assert!(request.url.ends_with("/app/installations/42"));
        assert!(
            request
                .headers
                .iter()
                .any(|(k, v)| k == "authorization" && v.starts_with("Bearer ey"))
        );
        Box::pin(async {
            Ok(GithubResponse {
                status: 200,
                body: br#"{"id":42,"app_id":123}"#.to_vec(),
            })
        })
    });
    let store = worker.clone();
    let task = tokio::spawn(async move {
        service
            .attach_installation(&store, "u", "a", "42", &effect)
            .await
    });
    let connection = task.await.unwrap().unwrap();
    assert_eq!(connection["installationId"], "42");
    assert_eq!(connection["status"], "connected");
    worker.shutdown().await.unwrap();
}

#[tokio::test]
async fn stale_installation_cannot_recreate_disconnected_registration() {
    let connection = db::open_database(std::path::Path::new(":memory:")).unwrap();
    db::migrate_database(&connection).unwrap();
    let service = AgentGithubAppService::new(
        Some(UserSecretService::with_clock(
            "github-storage-fixture",
            Arc::new(|| NOW),
        )),
        None,
        Arc::new(|| NOW),
    );
    service
        .save_manual(
            &connection,
            "u",
            "a",
            &save("u", "a", "123", RSA_KEY)["options"],
        )
        .unwrap();
    let prepared = service
        .prepare_installation(&connection, "u", "a", "42")
        .unwrap();
    let effect: GithubEffect = Arc::new(|_| {
        Box::pin(async {
            Ok(GithubResponse {
                status: 200,
                body: br#"{"id":42,"app_id":123}"#.to_vec(),
            })
        })
    });
    service.disconnect(&connection, "u", "a").unwrap();
    let completed = prepared.execute(&effect).await;
    assert_eq!(
        service
            .finish_call(&connection, completed)
            .unwrap_err()
            .to_string(),
        "GitHub connection changed while the request was in flight. Retry the operation."
    );
    assert_eq!(service.get(&connection, "u", "a").unwrap(), Value::Null);
}

fn verify_step(responses: Vec<Value>) -> Value {
    json!({"op":"verify","user":"u","agent":"a","responses":responses})
}
fn app_response() -> Value {
    json!({"status":200,"data":{"id":123,"slug":"verified","name":"Verified App","owner":{"login":"app-owner"}}})
}
fn bound_installation() -> Value {
    attach(
        "u",
        "a",
        json!({"status":200,"data":{"id":"../42/?# 😀","app_id":123,"account":{"login":"original","type":"User"},"permissions":{"contents":"read"},"repository_selection":"selected"}}),
    )
}
#[test]
fn verification_refreshes_metadata_without_crossing_owner_or_installation_boundaries() {
    for installation in [
        None,
        Some(json!({})),
        Some(json!({"account":null,"permissions":null,"repository_selection":null})),
        Some(
            json!({"account":{"login":"fresh","type":"Organization"},"permissions":{"contents":"write"},"repository_selection":"all"}),
        ),
    ] {
        let mut steps = vec![
            save("u", "a", "123", RSA_KEY),
            save("other", "a", "123", RSA_KEY),
            save("u", "other", "123", RSA_KEY),
        ];
        let mut responses = vec![app_response()];
        if let Some(data) = installation {
            steps.push(bound_installation());
            responses.push(json!({"status":200,"data":data}));
        }
        steps.push(verify_step(responses));
        steps.push(json!({"op":"list","user":"u"}));
        steps.push(json!({"op":"list","user":"other"}));
        compare(json!(steps), false);
    }
}
#[test]
fn verification_app_failures_and_mismatches_preserve_reference_status_and_diagnostics() {
    for response in [
        json!({"error":"network down"}),
        json!({"status":401,"data":{"message":"bad key"}}),
        json!({"status":403,"data":{"message":"forbidden"}}),
        json!({"status":404,"data":{}}),
        json!({"status":500,"data":{}}),
        json!({"status":200,"data":{"id":999}}),
        json!({"status":200,"data":{}}),
    ] {
        compare(
            json!([save("u","a","123",RSA_KEY),bound_installation(),verify_step(vec![response]),{"op":"get","user":"u","agent":"a"}]),
            false,
        );
    }
}
#[test]
fn verification_installation_failures_revoke_even_forbidden_and_network_errors() {
    for response in [
        json!({"error":"network down"}),
        json!({"status":401,"data":{"message":"bad key"}}),
        json!({"status":403,"data":{"message":"forbidden"}}),
        json!({"status":404,"data":{}}),
        json!({"status":422,"data":{"message":"bad id"}}),
        json!({"status":500,"data":{}}),
    ] {
        compare(
            json!([save("u","a","123",RSA_KEY),bound_installation(),verify_step(vec![app_response(),response]),{"op":"get","user":"u","agent":"a"}]),
            false,
        );
    }
}
#[test]
fn verification_requires_registration_and_key_without_network_or_mutation() {
    compare(
        json!([verify_step(vec![]),{"op":"begin","user":"u","agent":"a","options":{"appName":"fixture"}},verify_step(vec![]),save("u","a","123",RSA_KEY),{"op":"sql","sql":"DELETE FROM user_secrets"},verify_step(vec![])]),
        false,
    );
}
#[test]
fn verification_sparse_app_success_matches_missing_null_and_empty_metadata() {
    for data in [
        json!({"id":123}),
        json!({"id":"123","slug":null,"name":null,"owner":null}),
        json!({"id":123,"slug":"","name":"","owner":{"login":""}}),
    ] {
        compare(
            json!([
                save("u", "a", "123", RSA_KEY),
                verify_step(vec![json!({"status":200,"data":data})])
            ]),
            false,
        );
    }
}
#[test]
fn verification_uses_configured_enterprise_api_for_both_signed_requests() {
    let call = json!({"op":"nativegithubstore.run","now":NOW,"apiBase":"https://enterprise.invalid/api/v3///","steps":[save("u","a","123",RSA_KEY),bound_installation(),verify_step(vec![app_response(),json!({"status":200,"data":{}})])]});
    assert_eq!(run(&call), reference(call));
}

async fn verification_worker_fixture() -> (Arc<AgentGithubAppService>, db::worker::DatabaseWorker) {
    let (service, worker) = worker_fixture();
    let prepare = service.clone();
    worker.run(move |db| {
        prepare.save_manual(db, "u", "a", &save("u", "a", "123", RSA_KEY)["options"])?;
        db.execute("UPDATE agent_github_apps SET data=json_set(data,'$.installationId','42','$.status','connected') WHERE user_id='u' AND agent_id='a'", [])?;
        Ok(())
    }).await.unwrap();
    (service, worker)
}

#[tokio::test]
async fn verification_worker_rejects_stale_results_at_both_network_boundaries() {
    use std::sync::atomic::{AtomicUsize, Ordering};
    for stage in [0, 1] {
        for status in [200, 403] {
            for change in ["disconnect", "key", "setup", "unrelated"] {
                let (service, worker) = verification_worker_fixture().await;
                let started = Arc::new(tokio::sync::Notify::new());
                let release = Arc::new(tokio::sync::Notify::new());
                let calls = Arc::new(AtomicUsize::new(0));
                let (signal, wait, observed) = (started.clone(), release.clone(), calls.clone());
                let effect: GithubEffect = Arc::new(move |request| {
                    let index = observed.fetch_add(1, Ordering::SeqCst);
                    assert!(index <= 1, "unexpected third verification request");
                    assert!(request.url.ends_with(if index == 0 {
                        "/app"
                    } else {
                        "/app/installations/42"
                    }));
                    assert_eq!(request.method, "GET");
                    assert_eq!(request.timeout, std::time::Duration::from_secs(15));
                    assert_eq!(request.max_response_bytes, 1024 * 1024);
                    assert!(!request.follow_redirects);
                    assert!(
                        request
                            .headers
                            .iter()
                            .any(|(k, v)| k == "authorization" && v.starts_with("Bearer ey"))
                    );
                    let (signal, wait) = (signal.clone(), wait.clone());
                    Box::pin(async move {
                        if index == stage {
                            signal.notify_one();
                            wait.notified().await;
                        }
                        Ok(GithubResponse {
                            status: if index == stage { status } else { 200 },
                            body: if index == stage && status != 200 {
                                br#"{"message":"fixture forbidden"}"#.to_vec()
                            } else if index == 0 {
                                br#"{"id":123,"slug":"verified","name":"Verified App"}"#.to_vec()
                            } else {
                                br#"{"account":{"login":"fresh"}}"#.to_vec()
                            },
                        })
                    })
                });
                let (active, store) = (service.clone(), worker.clone());
                let task =
                    tokio::spawn(async move { active.verify(&store, "u", "a", &effect).await });
                tokio::time::timeout(std::time::Duration::from_secs(3), started.notified())
                    .await
                    .unwrap();
                assert_eq!(calls.load(Ordering::SeqCst), stage + 1);
                // Every DB job must progress while either outbound request waits.
                let modify = service.clone();
                let before = tokio::time::timeout(
                    std::time::Duration::from_secs(3),
                    worker.run(move |db| {
                        match change {
                            "disconnect" => {
                                modify.disconnect(db, "u", "a")?;
                            }
                            "key" => {
                                modify.save_manual(
                                    db,
                                    "u",
                                    "a",
                                    &save("u", "a", "123", PKCS1_KEY)["options"],
                                )?;
                            }
                            "setup" => {
                                modify.begin_setup(
                                    db,
                                    "u",
                                    "a",
                                    &json!({"appName":"new setup"}),
                                )?;
                            }
                            "unrelated" => {
                                modify.save_manual(
                                    db,
                                    "other",
                                    "a",
                                    &save("other", "a", "123", RSA_KEY)["options"],
                                )?;
                            }
                            _ => unreachable!(),
                        }
                        modify.get(db, "u", "a")
                    }),
                )
                .await
                .unwrap()
                .unwrap();
                release.notify_one();
                let result = tokio::time::timeout(std::time::Duration::from_secs(3), task)
                    .await
                    .unwrap()
                    .unwrap();
                if change == "unrelated" {
                    if status == 200 {
                        let result = result.unwrap();
                        assert_eq!(result["connection"]["accountLogin"], "fresh");
                        assert_eq!(calls.load(Ordering::SeqCst), 2);
                    } else {
                        assert!(
                            result
                                .unwrap_err()
                                .to_string()
                                .contains("fixture forbidden")
                        );
                        let read = service.clone();
                        let connection =
                            worker.run(move |db| read.get(db, "u", "a")).await.unwrap();
                        assert_eq!(
                            connection["status"],
                            if stage == 0 { "error" } else { "revoked" }
                        );
                    }
                    let read = service.clone();
                    assert_eq!(
                        worker
                            .run(move |db| read.get(db, "other", "a"))
                            .await
                            .unwrap()["appId"],
                        "123"
                    );
                } else {
                    assert_eq!(
                        result.unwrap_err().to_string(),
                        "GitHub connection changed while the request was in flight. Retry the operation."
                    );
                    let read = service.clone();
                    assert_eq!(
                        worker.run(move |db| read.get(db, "u", "a")).await.unwrap(),
                        before
                    );
                    assert_eq!(calls.load(Ordering::SeqCst), stage + 1);
                }
                worker.shutdown().await.unwrap();
            }
        }
    }
}

#[tokio::test]
async fn cancellation_at_either_verification_request_drops_effect_without_persistence() {
    use std::sync::atomic::{AtomicUsize, Ordering};
    for stage in [0, 1] {
        let (service, worker) = verification_worker_fixture().await;
        let read = service.clone();
        let before = worker.run(move |db| read.get(db, "u", "a")).await.unwrap();
        let started = Arc::new(tokio::sync::Notify::new());
        let dropped = Arc::new(std::sync::atomic::AtomicBool::new(false));
        let calls = Arc::new(AtomicUsize::new(0));
        let (signal, marker, observed) = (started.clone(), dropped.clone(), calls.clone());
        let effect: GithubEffect = Arc::new(move |_| {
            let index = observed.fetch_add(1, Ordering::SeqCst);
            let (signal, marker) = (signal.clone(), marker.clone());
            Box::pin(async move {
                if index == stage {
                    let _marker = DropMarker(marker);
                    signal.notify_one();
                    std::future::pending::<()>().await;
                    unreachable!()
                }
                Ok(GithubResponse {
                    status: 200,
                    body: br#"{"id":123,"slug":"verified"}"#.to_vec(),
                })
            })
        });
        let (active, store) = (service.clone(), worker.clone());
        let task = tokio::spawn(async move { active.verify(&store, "u", "a", &effect).await });
        tokio::time::timeout(std::time::Duration::from_secs(3), started.notified())
            .await
            .unwrap();
        task.abort();
        assert!(task.await.unwrap_err().is_cancelled());
        assert!(dropped.load(Ordering::SeqCst));
        assert_eq!(calls.load(Ordering::SeqCst), stage + 1);
        assert_eq!(
            worker
                .run(move |db| service.get(db, "u", "a"))
                .await
                .unwrap(),
            before
        );
        worker.shutdown().await.unwrap();
    }
}

#[tokio::test(start_paused = true)]
async fn verification_deadline_drops_each_request_and_persists_its_failure_phase() {
    for stage in [0, 1] {
        let db = db::open_database(std::path::Path::new(":memory:")).unwrap();
        db::migrate_database(&db).unwrap();
        let service = AgentGithubAppService::new(
            Some(UserSecretService::with_clock(
                "github-storage-fixture",
                Arc::new(|| NOW),
            )),
            None,
            Arc::new(|| NOW),
        );
        service
            .save_manual(&db, "u", "a", &save("u", "a", "123", RSA_KEY)["options"])
            .unwrap();
        db.execute("UPDATE agent_github_apps SET data=json_set(data,'$.installationId','42','$.status','connected') WHERE user_id='u' AND agent_id='a'",[]).unwrap();
        let mut prepared = service.prepare_verification(&db, "u", "a").unwrap();
        if stage == 1 {
            let effect: GithubEffect = Arc::new(|_| {
                Box::pin(async {
                    Ok(GithubResponse {
                        status: 200,
                        body: br#"{"id":123,"slug":"verified","name":"Verified App"}"#.to_vec(),
                    })
                })
            });
            let completed = prepared.execute(&effect).await;
            prepared = match service.finish_verification(&db, completed).unwrap() {
                GithubVerificationProgress::Request(next) => *next,
                GithubVerificationProgress::Complete(_) => {
                    panic!("installation verification was skipped")
                }
            };
            assert_ne!(service.get(&db, "u", "a").unwrap()["appSlug"], "verified");
        }
        let dropped = Arc::new(std::sync::atomic::AtomicBool::new(false));
        let start = tokio::time::Instant::now();
        let completed = prepared.execute(&pending_effect(dropped.clone())).await;
        let error = service
            .finish_verification(&db, completed)
            .err()
            .expect("deadline must fail");
        assert_eq!(
            tokio::time::Instant::now() - start,
            std::time::Duration::from_secs(15)
        );
        assert!(dropped.load(std::sync::atomic::Ordering::SeqCst));
        assert_eq!(
            error.to_string(),
            if stage == 0 {
                "Could not reach GitHub: request timed out"
            } else {
                "Installation is no longer available: Could not reach GitHub: request timed out"
            }
        );
        let stored = service.get(&db, "u", "a").unwrap();
        assert_eq!(
            stored["status"],
            if stage == 0 { "error" } else { "revoked" }
        );
        assert_eq!(
            stored["lastError"],
            "Could not reach GitHub: request timed out"
        );
        if stage == 1 {
            assert_eq!(stored["appSlug"], "verified");
        }
    }
}

fn token_step(op: &str, responses: Vec<Value>) -> Value {
    json!({"op":op,"user":"u","agent":"a","responses":responses})
}
fn token_response(token: &str) -> Value {
    json!({"status":201,"data":{"token":token,"expires_at":"2023-11-14T23:13:20.123Z","permissions":{"contents":"read"},"repository_selection":"selected"}})
}
#[test]
fn installation_token_cache_reuses_until_exact_skew_boundary_then_refreshes() {
    compare(
        json!([save("u","a","123",RSA_KEY),bound_installation(),
            token_step("token",vec![token_response("fixture-first")]),
            token_step("token",vec![]),
            {"op":"advance","ms":3_539_999}, token_step("token",vec![]),
            {"op":"advance","ms":1}, token_step("token",vec![token_response("fixture-second")])
        ]),
        false,
    );
}
#[test]
fn installation_token_fallback_expiry_missing_installation_and_revoked_preconditions() {
    compare(
        json!([token_step("token",vec![]),save("u","a","123",RSA_KEY),
            token_step("token",vec![]),bound_installation(),
            token_step("token",vec![json!({"status":201,"data":{"token":"fallback","expires_at":"invalid"}})]),
            token_step("token",vec![]),
            {"op":"sql","sql":"UPDATE agent_github_apps SET data=json_set(data,'$.status','revoked')"},
            token_step("token",vec![])
        ]),
        false,
    );
}
#[test]
fn installation_token_failures_persist_status_and_retry_after_noncredential_errors() {
    for response in [
        json!({"error":"network down"}),
        json!({"status":401,"data":{"message":"invalid key"}}),
        json!({"status":403,"data":{"message":"forbidden"}}),
        json!({"status":404,"data":{}}),
        json!({"status":500,"data":{}}),
    ] {
        compare(
            json!([save("u","a","123",RSA_KEY),bound_installation(),
            token_step("token",vec![response]),{"op":"get","user":"u","agent":"a"},
            token_step("token",vec![token_response("retry")])]),
            false,
        );
    }
}
#[test]
fn installation_token_manual_save_preserves_cache_attach_disconnect_invalidate() {
    compare(
        json!([save("u","a","123",RSA_KEY),bound_installation(),
            token_step("token",vec![token_response("first")]),save("u","a","123",RSA_KEY),
            token_step("token",vec![token_response("new-key")]),bound_installation(),
            token_step("token",vec![token_response("new-installation")]),
            {"op":"disconnect","user":"u","agent":"a"},token_step("token",vec![])
        ]),
        false,
    );
}
#[test]
fn repository_test_and_execution_environment_share_agent_token_and_bot_identity() {
    compare(
        json!([
            save("u", "a", "123", RSA_KEY),
            bound_installation(),
            token_step("env", vec![token_response("fixture-agent-only")]),
            token_step(
                "test",
                vec![
                    json!({"status":200,"data":{"total_count":7,"repositories":[{"full_name":"owned/repo"}]}})
                ]
            ),
            token_step("env", vec![])
        ]),
        false,
    );
}
#[test]
fn execution_environment_missing_and_unusable_connections_have_no_network_effect() {
    compare(
        json!([token_step("env",vec![]),save("u","a","123",RSA_KEY),
            token_step("env",vec![]),bound_installation(),
            {"op":"sql","sql":"UPDATE agent_github_apps SET data=json_set(data,'$.status','error')"},
            token_step("env",vec![])
        ]),
        false,
    );
}

#[tokio::test]
async fn token_consumers_release_database_and_reject_stale_success_and_failure() {
    use std::sync::atomic::{AtomicUsize, Ordering};
    for operation in ["token", "test", "env"] {
        let stages = if operation == "test" { 2 } else { 1 };
        for stage in 0..stages {
            for status in [200, 403] {
                for change in ["disconnect", "key", "setup", "unrelated"] {
                    let (service, worker) = verification_worker_fixture().await;
                    let started = Arc::new(tokio::sync::Notify::new());
                    let release = Arc::new(tokio::sync::Notify::new());
                    let calls = Arc::new(AtomicUsize::new(0));
                    let (signal, wait, observed) =
                        (started.clone(), release.clone(), calls.clone());
                    let effect: GithubEffect = Arc::new(move |request| {
                        let index = observed.fetch_add(1, Ordering::SeqCst);
                        assert!(
                            index <= stage
                                || (operation == "test"
                                    && change == "unrelated"
                                    && status == 200
                                    && index == 1),
                            "unexpected request after stale completion"
                        );
                        assert_eq!(request.user, "u");
                        assert_eq!(request.agent, "a");
                        assert_eq!(request.method, if index == 0 { "POST" } else { "GET" });
                        assert_eq!(request.timeout, std::time::Duration::from_secs(15));
                        assert!(!request.follow_redirects);
                        assert_eq!(request.max_response_bytes, 1024 * 1024);
                        let (signal, wait) = (signal.clone(), wait.clone());
                        Box::pin(async move {
                            if index == stage {
                                signal.notify_one();
                                wait.notified().await;
                            }
                            Ok(GithubResponse {
                                status: if index == stage { status } else { 200 },
                                body: if index == stage && status != 200 {
                                    br#"{"message":"fixture forbidden"}"#.to_vec()
                                } else if index == 0 {
                                    token_response("fixture-worker")["data"]
                                        .to_string()
                                        .into_bytes()
                                } else {
                                    br#"{"total_count":1,"repositories":[{"full_name":"owned/repo"}]}"#.to_vec()
                                },
                            })
                        })
                    });
                    let (active, store) = (service.clone(), worker.clone());
                    let task = tokio::spawn(async move {
                        match operation {
                            "token" => active.installation_token(&store, &effect, "u", "a").await,
                            "test" => active.test(&store, &effect, "u", "a").await,
                            _ => active
                                .resolve_env(&store, &effect, "u", "a")
                                .await
                                .map(|v| v.unwrap()),
                        }
                    });
                    tokio::time::timeout(std::time::Duration::from_secs(3), started.notified())
                        .await
                        .unwrap();
                    let modify = service.clone();
                    let before = tokio::time::timeout(
                        std::time::Duration::from_secs(3),
                        worker.run(move |db| {
                            match change {
                                "disconnect" => {
                                    modify.disconnect(db, "u", "a")?;
                                }
                                "key" => {
                                    modify.save_manual(
                                        db,
                                        "u",
                                        "a",
                                        &save("u", "a", "123", PKCS1_KEY)["options"],
                                    )?;
                                }
                                "setup" => {
                                    modify.begin_setup(
                                        db,
                                        "u",
                                        "a",
                                        &json!({"appName":"new setup"}),
                                    )?;
                                }
                                _ => {
                                    modify.save_manual(
                                        db,
                                        "other",
                                        "a",
                                        &save("other", "a", "123", RSA_KEY)["options"],
                                    )?;
                                }
                            }
                            modify.get(db, "u", "a")
                        }),
                    )
                    .await
                    .unwrap()
                    .unwrap();
                    release.notify_one();
                    let result = tokio::time::timeout(std::time::Duration::from_secs(3), task)
                        .await
                        .unwrap()
                        .unwrap();
                    if change == "unrelated" {
                        assert_eq!(result.is_ok(), status == 200);
                    } else {
                        assert_eq!(
                            result.unwrap_err().to_string(),
                            "GitHub connection changed while the request was in flight. Retry the operation."
                        );
                        let inspect = service.clone();
                        let after = worker
                            .run(move |db| inspect.get(db, "u", "a"))
                            .await
                            .unwrap();
                        assert_eq!(before, after);
                        // Reject a stale first mint before it fills the cache.
                        // A token minted before a manual key update is retained,
                        // matching the reference until attach/disconnect/expiry.
                        if change == "key" && stage == 0 {
                            let inspect = service.clone();
                            assert!(
                                worker
                                    .run(move |db| Ok(matches!(
                                        inspect.prepare_installation_token(db, "u", "a")?,
                                        GithubTokenProgress::Request(_)
                                    )))
                                    .await
                                    .unwrap()
                            );
                        }
                    }
                    assert_eq!(
                        calls.load(Ordering::SeqCst),
                        if operation == "test" && change == "unrelated" && status == 200 {
                            2
                        } else {
                            stage + 1
                        }
                    );
                }
            }
        }
    }
}

#[tokio::test]
async fn cancelled_token_consumers_drop_effect_and_leave_pending_phase_unchanged() {
    for operation in ["token", "test", "env"] {
        for stage in 0..if operation == "test" { 2 } else { 1 } {
            let (service, worker) = verification_worker_fixture().await;
            let started = Arc::new(tokio::sync::Notify::new());
            let dropped = Arc::new(std::sync::atomic::AtomicBool::new(false));
            let index = Arc::new(std::sync::atomic::AtomicUsize::new(0));
            let (signal, flag, count) = (started.clone(), dropped.clone(), index.clone());
            let effect: GithubEffect = Arc::new(move |_| {
                let current = count.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                let (signal, flag) = (signal.clone(), flag.clone());
                Box::pin(async move {
                    if current == stage {
                        let _drop = DropMarker(flag);
                        signal.notify_one();
                        std::future::pending::<()>().await;
                    }
                    Ok(GithubResponse {
                        status: 200,
                        body: token_response("before-repository-wait")["data"]
                            .to_string()
                            .into_bytes(),
                    })
                })
            });
            let (active, store) = (service.clone(), worker.clone());
            let task = tokio::spawn(async move {
                match operation {
                    "token" => active.installation_token(&store, &effect, "u", "a").await,
                    "test" => active.test(&store, &effect, "u", "a").await,
                    _ => active
                        .resolve_env(&store, &effect, "u", "a")
                        .await
                        .map(|v| v.unwrap()),
                }
            });
            tokio::time::timeout(std::time::Duration::from_secs(3), started.notified())
                .await
                .unwrap();
            let read = service.clone();
            let before = worker.run(move |db| read.get(db, "u", "a")).await.unwrap();
            task.abort();
            assert!(task.await.unwrap_err().is_cancelled());
            assert!(dropped.load(std::sync::atomic::Ordering::SeqCst));
            let read = service.clone();
            let after = worker.run(move |db| read.get(db, "u", "a")).await.unwrap();
            assert_eq!(before, after);
            assert_eq!(index.load(std::sync::atomic::Ordering::SeqCst), stage + 1);
        }
    }
}

#[tokio::test(start_paused = true)]
async fn token_timeout_drops_effect_and_records_error_without_cached_success() {
    let (service, worker) = verification_worker_fixture().await;
    let dropped = Arc::new(std::sync::atomic::AtomicBool::new(false));
    let effect = pending_effect(dropped.clone());
    let result = service.installation_token(&worker, &effect, "u", "a").await;
    assert!(result.is_err());
    assert!(dropped.load(std::sync::atomic::Ordering::SeqCst));
    let read = service.clone();
    worker
        .run(move |db| {
            let connection = read.get(db, "u", "a")?;
            assert_eq!(connection["status"], "error");
            assert!(matches!(
                read.prepare_installation_token(db, "u", "a")?,
                GithubTokenProgress::Request(_)
            ));
            Ok(())
        })
        .await
        .unwrap();
}

#[test]
fn repository_failures_preserve_reference_status_and_cached_retry_behavior() {
    for response in [
        json!({"error":"network down"}),
        json!({"status":401,"data":{"message":"invalid token"}}),
        json!({"status":403,"data":{"message":"forbidden"}}),
        json!({"status":404,"data":{}}),
        json!({"status":500,"data":{}}),
    ] {
        compare(
            json!([
                save("u", "a", "123", RSA_KEY),
                bound_installation(),
                token_step("test", vec![token_response("cached-agent-token"), response]),
                token_step("env", vec![]),
                token_step("token", vec![])
            ]),
            false,
        );
    }
}
#[tokio::test]
async fn cache_identity_pairs_do_not_alias_on_separator() {
    let (service, worker) = worker_fixture();
    for (user, agent) in [("u::x", "a"), ("u", "x::a")] {
        let initialize = service.clone();
        worker.run(move |db| {
            initialize.save_manual(db,user,agent,&save(user,agent,"123",RSA_KEY)["options"])?;
            db.execute("UPDATE agent_github_apps SET data=json_set(data,'$.installationId','42','$.status','connected') WHERE user_id=? AND agent_id=?",[user,agent])?;
            Ok(())
        }).await.unwrap();
    }
    let count = Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let observed = count.clone();
    let effect: GithubEffect = Arc::new(move |request| {
        observed.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        Box::pin(async move {
            Ok(GithubResponse {
                status: 201,
                body: token_response(&format!("fixture-{}", URL_SAFE_NO_PAD.encode(request.user)))
                    ["data"]
                    .to_string()
                    .into_bytes(),
            })
        })
    });
    let first = service
        .installation_token(&worker, &effect, "u::x", "a")
        .await
        .unwrap();
    let second = service
        .installation_token(&worker, &effect, "u", "x::a")
        .await
        .unwrap();
    assert_ne!(first["token"], second["token"]);
    assert_eq!(
        service
            .installation_token(&worker, &effect, "u::x", "a")
            .await
            .unwrap(),
        first
    );
    assert_eq!(
        service
            .installation_token(&worker, &effect, "u", "x::a")
            .await
            .unwrap(),
        second
    );
    assert_eq!(count.load(std::sync::atomic::Ordering::SeqCst), 2);
}
#[tokio::test(start_paused = true)]
async fn repository_timeout_drops_effect_and_preserves_retryable_cached_token() {
    let (service, worker) = verification_worker_fixture().await;
    let count = Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let dropped = Arc::new(std::sync::atomic::AtomicBool::new(false));
    let (observed, flag) = (count.clone(), dropped.clone());
    let effect: GithubEffect = Arc::new(move |_| {
        let index = observed.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        let flag = flag.clone();
        Box::pin(async move {
            if index == 1 {
                let _drop = DropMarker(flag);
                std::future::pending::<()>().await;
            }
            Ok(GithubResponse {
                status: 201,
                body: token_response("cached-before-timeout")["data"]
                    .to_string()
                    .into_bytes(),
            })
        })
    });
    assert!(service.test(&worker, &effect, "u", "a").await.is_err());
    assert!(dropped.load(std::sync::atomic::Ordering::SeqCst));
    let inspect = service.clone();
    worker
        .run(move |db| {
            assert_eq!(inspect.get(db, "u", "a")?["status"], "error");
            assert!(matches!(
                inspect.prepare_installation_token(db, "u", "a")?,
                GithubTokenProgress::Cached(_, _)
            ));
            Ok(())
        })
        .await
        .unwrap();
    assert_eq!(count.load(std::sync::atomic::Ordering::SeqCst), 2);
}

// Runtime payload contracts: the reference generic fetch types are not validators.
// Native credential admission deliberately rejects malformed success payloads.
#[test]
fn payload_valid_optional_fields_match_actual_typescript_and_exact_omission() {
    for data in [
        json!({"token":"ghs_fixture-._~+/=token"}),
        json!({"token":"ghs_fixture","expires_at":null,"permissions":null,"repository_selection":null}),
        json!({"token":"ghs_fixture","expires_at":"bad-date","permissions":{},"repository_selection":""}),
        token_response("ghs_fixture")["data"].clone(),
    ] {
        for repos in [
            json!({}),
            json!({"repositories":null}),
            json!({"total_count":0,"repositories":[]}),
            json!({"total_count":2.0,"repositories":[]}),
            json!({"total_count":-0.0,"repositories":[]}),
            json!({"total_count":2,"repositories":[{"full_name":"owner/😀"},{"full_name":"owner/second"}]}),
        ] {
            let steps = json!([
                save("u", "a", "123", RSA_KEY),
                bound_installation(),
                token_step(
                    "test",
                    vec![
                        json!({"status":201,"data":data}),
                        json!({"status":200,"data":repos})
                    ]
                ),
                token_step("token", vec![]),
                token_step("env", vec![])
            ]);
            let call = json!({"op":"nativegithubstore.run","now":NOW,"steps":steps,"secret":"state-fixture"});
            let actual = run(&call);
            assert_eq!(actual, reference(call), "data={data} repositories={repos}");
            assert_eq!(
                actual["results"][2].get("repositoryCount").is_some(),
                repos.get("total_count").is_some()
            );
            assert_eq!(actual["effects"].as_array().unwrap().len(), 3);
        }
    }
}

#[test]
fn payload_malformed_credentials_never_cache_or_authorize_followup() {
    let mut malformed = vec![Value::Null, json!([]), json!({}), json!({"token":null})];
    for token in [
        json!(0),
        json!(true),
        json!([]),
        json!({}),
        json!(""),
        json!(" "),
        json!("bad\r\nheader"),
        json!("abc😀tail"),
        json!("😀abtail"),
    ] {
        malformed.push(json!({"token":token}));
    }
    for (field, values) in [
        (
            "expires_at",
            vec![json!(1), json!(true), json!([]), json!({})],
        ),
        (
            "permissions",
            vec![
                json!("write"),
                json!(1),
                json!([]),
                json!({"contents":true}),
                json!({"contents":null}),
            ],
        ),
        (
            "repository_selection",
            vec![json!(1), json!(true), json!([]), json!({})],
        ),
    ] {
        for value in values {
            let mut data = token_response("ghs_fixture")["data"].clone();
            data[field] = value;
            malformed.push(data);
        }
    }
    for data in malformed {
        let steps = json!([
            save("u", "a", "123", RSA_KEY),
            bound_installation(),
            token_step(
                "test",
                vec![
                    json!({"status":201,"data":data}),
                    json!({"status":200,"data":{"total_count":0}})
                ]
            ),
            token_step("env", vec![token_response("ghs_recovered")]),
            token_step("token", vec![])
        ]);
        let call = json!({"op":"nativegithubstore.run","now":NOW,"steps":steps,"secret":"state-fixture","tokenPrefixUnits":true});
        let actual = run(&call);
        assert_eq!(
            actual["results"][2],
            json!({"error":"GitHub returned an invalid installation token payload."}),
            "{data}"
        );
        assert_eq!(
            actual["effects"].as_array().unwrap().len(),
            3,
            "must remint after rejection: {data}"
        );
        for effect in actual["effects"].as_array().unwrap() {
            assert!(
                !effect["url"]
                    .as_str()
                    .unwrap()
                    .contains("/installation/repositories")
            );
        }
        assert_eq!(actual["results"][3]["GH_TOKEN"], "ghs_recovered");
        assert_eq!(actual["results"][4]["token"], "ghs_recovered");
        // Record and exercise the actual reference behavior rather than assuming
        // its erased TypeScript type validates data. Native divergence is reviewed.
        let expected = reference(call);
        if data["token"] == "abc😀tail" {
            assert_eq!(
                expected["results"][2]["tokenPrefix"],
                json!([97, 98, 99, 0xd83d, 0x2026])
            );
        }
        if data["token"] == "😀abtail" {
            assert_eq!(
                expected["results"][2]["tokenPrefix"],
                json!([0xd83d, 0xde00, 97, 98, 0x2026])
            );
        }
        assert_ne!(
            actual["results"][2], expected["results"][2],
            "intentional rejection: {data}"
        );
    }
}

#[test]
fn payload_malformed_repositories_reject_without_reusing_cached_credential() {
    for repos in [
        json!([]),
        json!({"total_count":null}),
        json!({"total_count":"2"}),
        json!({"total_count":-1}),
        json!({"total_count":1.5}),
        json!({"repositories":{}}),
        json!({"repositories":"bad"}),
        json!({"repositories":[null]}),
        json!({"repositories":[{}]}),
        json!({"repositories":[{"full_name":null}]}),
        json!({"repositories":[{"full_name":5}]}),
        json!({"repositories":[{"full_name":true}]}),
    ] {
        let call = json!({"op":"nativegithubstore.run","now":NOW,"secret":"state-fixture","steps":[
            save("u","a","123",RSA_KEY),bound_installation(),
            token_step("test",vec![token_response("ghs_first"),json!({"status":200,"data":repos})]),
            token_step("env",vec![token_response("ghs_recovered")]),token_step("token",vec![])]});
        let actual = run(&call);
        assert_eq!(
            actual["results"][2],
            json!({"error":"GitHub returned an invalid repository payload."}),
            "{repos}"
        );
        assert_eq!(actual["results"][3]["GH_TOKEN"], "ghs_recovered");
        assert_eq!(
            actual["effects"].as_array().unwrap().len(),
            4,
            "must evict after rejection: {repos}"
        );
        let expected = reference(call);
        assert_ne!(
            actual["results"][2], expected["results"][2],
            "intentional rejection: {repos}"
        );
    }
}

/// The fixture must set its zone explicitly: internal_driver clears the ambient
/// environment. Native zone changes are isolated to child processes, following
/// the existing subscription-usage date contracts instead of mutating TZ while
/// other tests may be running.
fn github_expiry_timezone_child(test: &str) -> Option<String> {
    if let Ok(timezone) = std::env::var("JAIT_GITHUB_EXPIRY_TEST_TZ") {
        assert_eq!(std::env::var("TZ").unwrap(), timezone);
        return Some(timezone);
    }
    for timezone in ["UTC", "America/New_York", "Europe/Berlin", "Pacific/Apia"] {
        let output = std::process::Command::new(std::env::current_exe().expect("test binary"))
            .args(["--exact", test, "--nocapture"])
            .env("TZ", timezone)
            .env("JAIT_GITHUB_EXPIRY_TEST_TZ", timezone)
            .output()
            .expect("timezone subprocess");
        assert!(
            output.status.success(),
            "timezone {timezone}: {} {}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        );
        println!("GitHub expiry timezone {timezone}: {test} passed");
    }
    None
}

#[test]
fn installation_token_date_parse_forms_match_actual_reference() {
    let Some(timezone) =
        github_expiry_timezone_child("installation_token_date_parse_forms_match_actual_reference")
    else {
        return;
    };
    let mut expiries: Vec<Value> = [
        "2026-01-05T06:00:00Z",
        "2026-01-05T06:00:00+05:30",
        "2026-01-05T06:00:00+0530",
        "2026-01-05t06:00:00.123456789z",
        "2026-01-05T24:00:00Z",
        "Mon, 05 Jan 2026 06:00:00 GMT",
        "January 5, 2026 06:30:00 GMT",
        "Jan 5 2026",
        "2026/01/05",
        "05-01-2026",
        "2026-02-30",
        "2026-01-05T06:00:00",
        "2026-03-08T02:30:00",
        "2026-11-01T01:30:00",
        "2026-03-29T02:30:00",
        "2026-10-25T02:30:00",
        "2011-12-30T12:00:00",
        "2026-01-05",
        "not-a-date",
        " 2026-01-05T06:00:00Z",
        "2026-01-05T06:00:00Z ",
        "2026-13-05",
        "2026-01-32",
        "2026-01-05T24:01:00Z",
        "",
    ]
    .into_iter()
    .map(|value| json!(value))
    .collect();
    expiries.push(Value::Null);
    for (index, expiry) in expiries.into_iter().enumerate() {
        let call = json!({"op":"nativegithubstore.run","now":NOW,"timezone":timezone,"secret":"state-fixture","steps":[
            save("u","a","123",RSA_KEY),bound_installation(),
            token_step("token",vec![json!({"status":201,"data":{"token":"parsed-first","expires_at":expiry}})])
        ]});
        let actual = run(&call);
        let expected = reference(call);
        assert!(
            expected["results"][2]["expiresAt"].is_string(),
            "reference expiry {expiry}: {expected}"
        );
        assert_eq!(
            actual, expected,
            "case {index}: expiry={expiry}, timezone={timezone}"
        );
    }
    // Missing expiry retains the same reference fallback as null/invalid values.
    let call = json!({"op":"nativegithubstore.run","now":NOW,"timezone":timezone,"secret":"state-fixture","steps":[
        save("u","a","123",RSA_KEY),bound_installation(),
        token_step("token",vec![json!({"status":201,"data":{"token":"missing-expiry"}})])
    ]});
    assert_eq!(run(&call), reference(call), "missing expiry in {timezone}");
    println!("GitHub expiry forms: 27 scenarios in {timezone}");
}

#[test]
fn installation_token_legacy_local_and_invalid_expiry_reuses_until_exact_skew() {
    let Some(timezone) = github_expiry_timezone_child(
        "installation_token_legacy_local_and_invalid_expiry_reuses_until_exact_skew",
    ) else {
        return;
    };
    for expiry in [
        "Mon, 05 Jan 2026 06:00:00 GMT",
        "2026-01-05T06:00:00+0530",
        "2026-01-05t06:00:00.123456789z",
        "2026-01-05T06:00:00",
        "2026-03-08T02:30:00",
        "2026-11-01T01:30:00",
        "2026-03-29T02:30:00",
        "2026-10-25T02:30:00",
        "not-a-date",
    ] {
        let first_response =
            json!({"status":201,"data":{"token":"parsed-first","expires_at":expiry}});
        let mut steps = vec![
            save("u", "a", "123", RSA_KEY),
            bound_installation(),
            token_step("token", vec![first_response]),
        ];
        let first_call = json!({"op":"nativegithubstore.run","now":NOW,"timezone":timezone,"secret":"state-fixture","steps":steps});
        // Derive the clock boundary from the actual service's returned UTC wire
        // value, not from the native helper under test.
        let expected_first = reference(first_call);
        let expires_at = expected_first["results"][2]["expiresAt"]
            .as_str()
            .expect("reference ISO expiry");
        let expires_ms = chrono::DateTime::parse_from_rfc3339(expires_at)
            .unwrap()
            .timestamp_millis();
        let before_skew = expires_ms - 60_000 - NOW - 1;
        assert!(
            before_skew > 0,
            "future fixture expiry {expiry}: {expires_at}"
        );
        steps.extend([
            json!({"op":"advance","ms":before_skew}),
            token_step("token",vec![]),
            json!({"op":"advance","ms":1}),
            token_step("token",vec![json!({"status":201,"data":{"token":"refreshed","expires_at":jait_gateway::time::iso(expires_ms+3_600_000).unwrap()}})]),
        ]);
        let call = json!({"op":"nativegithubstore.run","now":NOW,"timezone":timezone,"secret":"state-fixture","steps":steps});
        let actual = run(&call);
        assert_eq!(actual["results"][2]["token"], "parsed-first");
        assert_eq!(actual["results"][4]["token"], "parsed-first");
        assert_eq!(actual["results"][6]["token"], "refreshed");
        assert_eq!(actual["effects"].as_array().unwrap().len(), 3);
        assert_eq!(
            actual,
            reference(call),
            "expiry={expiry}, timezone={timezone}"
        );
    }
    println!("GitHub expiry exact-skew: 9 scenarios in {timezone}");
}
