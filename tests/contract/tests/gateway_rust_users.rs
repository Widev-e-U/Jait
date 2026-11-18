#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::{
    db,
    services::users::{UserService, UserSettingsPatch, hash_password, verify_password_hash},
};
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
};

fn observe(calls: Value) -> Value {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap();
    let dir = root
        .join(".jait/artifacts/gateway-rust/native-users")
        .join(uuid::Uuid::new_v4().to_string());
    fs::create_dir_all(&dir).unwrap();
    internal_driver::call(&root, &dir, json!({"version":1,"calls":calls}), &|| false).unwrap()
}
fn scenario(seed: &str, steps: Value) -> Value {
    let id = uuid::Uuid::new_v4().to_string();
    let reference =
        observe(json!([{"op":"nativeusers.sequence","id":id,"seed":seed,"steps":steps}]))[0]
            .clone();
    let database = db::open_database(Path::new(reference["native"].as_str().unwrap())).unwrap();
    let users = UserService::with_time(&database, reference["now"].as_str().unwrap());
    let mut invitations = HashMap::new();
    for (i, step) in steps.as_array().unwrap().iter().enumerate() {
        let user = step["user"].as_str().unwrap_or("");
        let result = match step["kind"].as_str().unwrap() {
            "count" => json!(users.count_users().unwrap()),
            "owner" => json!(users.is_owner(user).unwrap()),
            "find" => json!(
                users
                    .find_by_username(step["username"].as_str().unwrap())
                    .unwrap()
            ),
            "id" => json!(users.find_by_id(user).unwrap()),
            "verify" => json!(
                users
                    .verify_credentials(
                        step["username"].as_str().unwrap(),
                        step["password"].as_str().unwrap()
                    )
                    .unwrap()
            ),
            "settings" => json!(users.get_settings(user).unwrap()),
            "patch" => json!(
                users
                    .update_settings(
                        user,
                        serde_json::from_value::<UserSettingsPatch>(step["patch"].clone()).unwrap()
                    )
                    .unwrap()
            ),
            "selection" => {
                let (p, s) = users.get_last_selection(user).unwrap();
                json!({"projectId":p,"sessionId":s})
            }
            "select" => {
                users
                    .set_last_selection(user, step["project"].as_str(), step["session"].as_str())
                    .unwrap();
                Value::Null
            }
            "bind" => json!(
                users
                    .bind_session_to_user(user, step["session"].as_str().unwrap())
                    .unwrap()
            ),
            "archive" => json!(users.clear_archived_sessions(user).unwrap()),
            "invite" => {
                if let Some(token) = users.create_invitation(user).unwrap() {
                    let row:(String,String)=database.query_row("SELECT created_by,expires_at FROM account_invitations ORDER BY rowid DESC LIMIT 1",[],|r|Ok((r.get(0)?,r.get(1)?))).unwrap();
                    invitations.insert(step["key"].as_str().unwrap().to_string(), token.clone());
                    json!({"length":token.len(),"urlSafe":token.bytes().all(|c|c.is_ascii_alphanumeric()||c==b'-'||c==b'_'),"hashed":!database.query_row("SELECT EXISTS(SELECT 1 FROM account_invitations WHERE token_hash=?)",[&token],|r|r.get::<_,bool>(0)).unwrap(),"creator":row.0,"expiry":row.1})
                } else {
                    Value::Null
                }
            }
            "consume" => json!(
                users
                    .consume_invitation(
                        invitations
                            .get(step["key"].as_str().unwrap_or(""))
                            .map(String::as_str)
                            .or_else(|| step["token"].as_str())
                            .unwrap_or("")
                    )
                    .unwrap()
            ),
            other => panic!("unknown step {other}"),
        };
        assert_eq!(result, reference["results"][i], "step {i}: {step}");
    }
    reference
}
#[test]
fn native_users_settings_and_selection_match_reference_with_unicode_and_null_patches() {
    let reference = scenario(
        "",
        json!([
            {"kind":"count"},{"kind":"owner","user":"owner"},{"kind":"owner","user":"other"},{"kind":"owner","user":"missing"},
            {"kind":"find","username":" \u{feff}ALICE "},{"kind":"find","username":"missing"},{"kind":"id","user":"other"},{"kind":"id","user":"missing"},
            {"kind":"verify","username":" Alice ","password":"password 🦀"},{"kind":"verify","username":"ALICE","password":"wrong"},{"kind":"verify","username":"missing","password":"password 🦀"},
            {"kind":"selection","user":"owner"},{"kind":"settings","user":"owner"},{"kind":"settings","user":"other"},
            {"kind":"patch","user":"owner","patch":{"theme":"dark","apiKeys":{"test":" fixture "},"disabledTools":["terminal","terminal"],"sttProvider":"gpt","chatStreamingAction":"queue","chatProvider":"fixture","jaitBackend":"ollama","recentModels":["a","a","b"],"selectedModel":"m","reasoningEffort":"high","projectPickerPath":"/資料","projectPickerNodeId":"node"}},
            {"kind":"settings","user":"other"},
            {"kind":"patch","user":"owner","patch":{"selectedModel":null,"reasoningEffort":null,"projectPickerPath":null,"projectPickerNodeId":null}},
            {"kind":"patch","user":"owner","patch":{}},
            {"kind":"select","user":"owner","project":"p","session":"s"},{"kind":"selection","user":"owner"},{"kind":"selection","user":"other"},
            {"kind":"select","user":"owner","project":null,"session":null},{"kind":"selection","user":"owner"}
        ]),
    );
    assert_eq!(reference["results"][0], 2);
    assert_eq!(reference["results"][2], false);
    assert_eq!(reference["results"][9], Value::Null);
}
#[test]
fn settings_recover_malformed_json_and_normalize_legacy_values() {
    let seed = r#"INSERT INTO user_settings(user_id,theme,api_keys,disabled_tools,stt_provider,chat_streaming_action,chat_provider,jait_backend,recent_models,reasoning_effort,updated_at) VALUES
('owner','','{"good":"kept","bad":3}','["kept",3,null,"also"]','simulated','invalid','','','broken','invalid','2026-01-01'),
('other','dark','["one",4,"three"]','{}','wyoming','thread','jait','openai','["one",3,"three"]','low','2026-01-01');"#;
    scenario(
        seed,
        json!([{"kind":"settings","user":"owner"},{"kind":"settings","user":"other"},{"kind":"settings","user":"missing"},{"kind":"settings","user":"missing"}]),
    );
}
#[test]
fn invitations_are_owner_only_hashed_single_use_and_expire_at_the_boundary() {
    let expiry_hash = "fa64ea1e82e1206f828ab2a02917c7e92accb98e3b95881a1b4ad52b914b66e3";
    let seed = format!(
        "INSERT INTO account_invitations VALUES ('{expiry_hash}','owner','2026-10-18T12:00:00.000Z');"
    );
    let reference = scenario(
        &seed,
        json!([
            {"kind":"invite","user":"other","key":"denied"},{"kind":"invite","user":"missing","key":"missing"},
            {"kind":"invite","user":"owner","key":"fresh"},{"kind":"consume","key":"fresh"},{"kind":"consume","key":"fresh"},{"kind":"consume","token":"wrong"},{"kind":"consume","token":"expired"}
        ]),
    );
    assert_eq!(reference["results"][0], Value::Null);
    assert_eq!(reference["results"][3], true);
    assert_eq!(reference["results"][4], false);
}
#[test]
fn archive_cleanup_removes_only_owned_archives_and_internal_binding_matches_reference() {
    let seed = r#"INSERT INTO sessions(id,user_id,name,status,created_at,last_active_at) VALUES
('mine','owner','mine','archived','now','now'),
('active','owner','active','active','now','now'),
('theirs','other','theirs','archived','now','now'),
('orphan',NULL,'orphan','active','now','now');
INSERT INTO messages(id,session_id,role,content,created_at) VALUES ('m','mine','user','保持','now'),('t','theirs','user','kept','now');"#;
    let reference = scenario(
        seed,
        json!([{"kind":"archive","user":"owner"},{"kind":"archive","user":"owner"},{"kind":"bind","user":"owner","session":"missing"},{"kind":"bind","user":"owner","session":"orphan"},{"kind":"archive","user":"nobody"},{"kind":"bind","user":"owner","session":"theirs"},{"kind":"bind","user":"other","session":"theirs"}]),
    );
    assert_eq!(
        reference["results"],
        json!([1, 0, false, true, 0, false, true])
    );
    let database = db::open_database(Path::new(reference["native"].as_str().unwrap())).unwrap();
    let rows: i64 = database
        .query_row("SELECT count(*) FROM messages WHERE id='t'", [], |r| {
            r.get(0)
        })
        .unwrap();
    assert_eq!(rows, 1);
    assert_eq!(
        database
            .query_row("SELECT user_id FROM sessions WHERE id='orphan'", [], |r| {
                r.get::<_, String>(0)
            })
            .unwrap(),
        "owner"
    );
}
#[test]
fn rust_created_password_hashes_and_default_settings_reopen_in_typescript() {
    let reference = scenario("", json!([]));
    let database = db::open_database(Path::new(reference["native"].as_str().unwrap())).unwrap();
    let users = UserService::new(&database);
    let created = users.create_user(" ΟΣ 🦀 ", "new password 🦀").unwrap();
    assert_eq!(created.username, "ος 🦀");
    assert_eq!(created.id.as_bytes()[14], b'7');
    assert!(users.create_user(" ΟΣ 🦀 ", "duplicate").is_err());
    assert_eq!(
        users
            .verify_credentials("ΟΣ 🦀", "new password 🦀")
            .unwrap(),
        Some(created.clone())
    );
    let settings = users.get_settings(&created.id).unwrap();
    drop(database);
    let path = Path::new(reference["native"].as_str().unwrap());
    let id = path
        .parent()
        .unwrap()
        .file_name()
        .unwrap()
        .to_str()
        .unwrap();
    let reopened = observe(
        json!([{"op":"nativeusers.reopen","id":id,"file":path.to_str().unwrap(),"username":"ΟΣ 🦀","password":"new password 🦀"}]),
    );
    assert_eq!(reopened[0]["username"], created.username);
    assert_eq!(reopened[0]["settings"], json!(settings));
    let hash = hash_password("").unwrap();
    assert!(verify_password_hash("", &hash));
    assert!(!verify_password_hash("wrong", &hash));
    for corrupt in [
        "",
        "scrypt",
        "scrypt$salt$zz",
        "scrypt$salt$",
        "bcrypt$salt$0000",
        "scrypt$$abcd",
    ] {
        assert!(!verify_password_hash("any", corrupt));
    }
}

#[test]
fn corrupt_password_digests_cannot_authenticate() {
    scenario(
        "UPDATE users SET password_hash='scrypt$salt$zz' WHERE id='owner';",
        json!([{"kind":"verify","username":"alice","password":"any password"}]),
    );
}
