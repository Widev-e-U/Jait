#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::{
    db, security::trust_engine::TrustEngine, services::node_credentials::NodeCredentialsService,
};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    fs,
    path::{Path, PathBuf},
};
fn observe(call: Value) -> Value {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap();
    let dir = root
        .join(".jait/artifacts/gateway-rust/native-state")
        .join(uuid::Uuid::new_v4().to_string());
    fs::create_dir_all(&dir).unwrap();
    internal_driver::call(&root, &dir, json!({"version":1,"calls":[call]}), &|| false).unwrap()[0]
        .clone()
}
fn trust_scenario(memory: bool, seed: &str, steps: Vec<Value>) {
    let reference =
        observe(json!({"op":"nativestate.trust","memory":memory,"seed":seed,"steps":steps}));
    let connection = db::open_database(Path::new(":memory:")).unwrap();
    db::migrate_database(&connection).unwrap();
    connection.execute_batch(seed).unwrap();
    let database = (!memory).then_some(&connection);
    let mut engine = TrustEngine::new(database);
    let mut results = vec![];
    for step in steps {
        let action = step["action"].as_str().unwrap_or("");
        let value = match step["op"].as_str().unwrap() {
            "state" => json!(engine.get_state(action).unwrap()),
            "level" => json!(engine.get_level(action).unwrap()),
            "approve" => json!(engine.record_approval(action).unwrap()),
            "revert" => json!(engine.record_revert(action).unwrap()),
            "reset" => json!(engine.reset(action)),
            "list" => json!(engine.list_all().unwrap()),
            "reopen" => {
                engine = TrustEngine::new(database);
                Value::Null
            }
            "mutate" => {
                connection
                    .execute_batch(step["sql"].as_str().unwrap())
                    .unwrap();
                Value::Null
            }
            op => panic!("unknown step {op}"),
        };
        results.push(value);
    }
    assert_eq!(json!(results), reference);
}
#[test]
fn trust_thresholds_reverts_resets_and_action_isolation_match_in_memory_and_sqlite() {
    let mut steps = vec![
        json!({"op":"state","action":"terminal.run"}),
        json!({"op":"list"}),
    ];
    for _ in 0..26 {
        steps.push(json!({"op":"approve","action":"terminal.run"}));
    }
    steps.extend([
        json!({"op":"level","action":"terminal.run"}),
        json!({"op":"revert","action":"terminal.run"}),
        json!({"op":"approve","action":"terminal.run"}),
        json!({"op":"approve","action":"file.write"}),
        json!({"op":"revert","action":"file.write"}),
        json!({"op":"revert","action":"file.write"}),
        json!({"op":"state","action":"資料 🦀"}),
        json!({"op":"list"}),
        json!({"op":"reset","action":"terminal.run"}),
        json!({"op":"list"}),
        json!({"op":"reopen"}),
        json!({"op":"state","action":"terminal.run"}),
        json!({"op":"list"}),
    ]);
    for memory in [true, false] {
        trust_scenario(memory, "", steps.clone());
    }
}
#[test]
fn trust_persisted_defaults_clamping_cache_and_nonfatal_write_failures_match_reference() {
    trust_scenario(
        false,
        "INSERT INTO trust_levels VALUES('nulls',NULL,NULL,NULL),('negative',0,0,-4),('excess',26,1,99),('fractional',1,2,1.5)",
        vec![
            json!({"op":"state","action":"nulls"}),
            json!({"op":"state","action":"negative"}),
            json!({"op":"state","action":"excess"}),
            json!({"op":"state","action":"fractional"}),
            json!({"op":"mutate","sql":"UPDATE trust_levels SET approved_count=99,current_level=3 WHERE action_type='nulls'"}),
            json!({"op":"state","action":"nulls"}),
            json!({"op":"list"}),
            json!({"op":"mutate","sql":"CREATE TRIGGER reject_trust_update BEFORE UPDATE ON trust_levels BEGIN SELECT RAISE(FAIL,'read only'); END; CREATE TRIGGER reject_trust_insert BEFORE INSERT ON trust_levels BEGIN SELECT RAISE(FAIL,'read only'); END"}),
            json!({"op":"approve","action":"nulls"}),
            json!({"op":"approve","action":"new"}),
            json!({"op":"state","action":"new"}),
            json!({"op":"list"}),
            json!({"op":"reopen"}),
            json!({"op":"state","action":"new"}),
            json!({"op":"state","action":"nulls"}),
        ],
    );
}
fn normalize_token(value: &mut Value) {
    if let Some(token) = value.as_str() {
        let entropy = token.strip_prefix("jait-node-").expect("node token prefix");
        assert_eq!(entropy.len(), 43);
        assert!(
            entropy
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
        );
        *value = json!("<token>");
    }
}
fn credentials_scenario(memory: bool, seed: &str, steps: Vec<Value>) {
    let mut reference =
        observe(json!({"op":"nativestate.credentials","memory":memory,"seed":seed,"steps":steps}));
    let reference_tokens: Vec<String> = steps
        .iter()
        .zip(reference["results"].as_array().unwrap())
        .filter(|(step, _)| step["op"] == "issue")
        .filter_map(|(_, v)| v.as_str().map(String::from))
        .collect();
    let connection = db::open_database(Path::new(":memory:")).unwrap();
    db::migrate_database(&connection).unwrap();
    connection.execute_batch(seed).unwrap();
    let database = (!memory).then_some(&connection);
    let mut service = NodeCredentialsService::new(database);
    let mut tokens: Vec<Option<String>> = vec![];
    let mut results = vec![];
    for step in &steps {
        let node = step["node"].as_str().unwrap_or("");
        let user = step["user"].as_str().unwrap_or("");
        let value = match step["op"].as_str().unwrap() {
            "owner" => json!(service.owner(node).unwrap()),
            "bind" => json!(service.bind(node, user).unwrap()),
            "issue" => {
                let token = service.issue(node, user).unwrap();
                tokens.push(token.clone());
                json!(token)
            }
            "resolve" => {
                let token = step["token"]
                    .as_str()
                    .or_else(|| {
                        tokens
                            .get(step["slot"].as_u64().unwrap_or(0) as usize)
                            .and_then(|v| v.as_deref())
                    })
                    .unwrap_or("");
                json!(service.resolve(token).unwrap())
            }
            "revoke" => json!(service.revoke(node, user).unwrap()),
            "reopen" => {
                service = NodeCredentialsService::new(database);
                Value::Null
            }
            "mutate" => {
                connection
                    .execute_batch(step["sql"].as_str().unwrap())
                    .unwrap();
                Value::Null
            }
            op => panic!("unknown step {op}"),
        };
        results.push(value);
    }
    for (index, step) in steps.iter().enumerate() {
        if step["op"] == "issue" {
            normalize_token(&mut results[index]);
            normalize_token(&mut reference["results"][index]);
        }
    }
    assert_eq!(json!(results), reference["results"]);
    if !memory {
        let mut statement=connection.prepare("SELECT token_hash,node_id,user_id,created_at FROM node_credentials ORDER BY node_id,user_id").unwrap();
        let rows=statement.query_map([],|r|Ok(json!({"token_hash":r.get::<_,String>(0)?,"node_id":r.get::<_,String>(1)?,"user_id":r.get::<_,String>(2)?,"created_at":r.get::<_,String>(3)?}))).unwrap().collect::<rusqlite::Result<Vec<_>>>().unwrap();
        let mut native = json!(rows);
        for (rows, valid_tokens) in [
            (
                &mut native,
                tokens.iter().flatten().cloned().collect::<Vec<_>>(),
            ),
            (&mut reference["rows"], reference_tokens),
        ] {
            for row in rows.as_array_mut().unwrap() {
                assert!(
                    valid_tokens
                        .iter()
                        .any(|token| hex::encode(Sha256::digest(token.as_bytes()))
                            == row["token_hash"].as_str().unwrap()),
                    "only hashes of issued tokens may be persisted"
                );
                let timestamp = row["created_at"].as_str().unwrap();
                assert!(timestamp.contains('T') && timestamp.ends_with('Z'));
                row["token_hash"] = json!("<hash>");
                row["created_at"] = json!("<timestamp>");
            }
        }
        assert_eq!(native, reference["rows"]);
    }
}
#[test]
fn node_ownership_foreign_claims_credential_resolution_and_revocation_match_both_modes() {
    let steps = vec![
        json!({"op":"owner","node":"n1"}),
        json!({"op":"bind","node":"n1","user":"owner"}),
        json!({"op":"bind","node":"n1","user":"foreign"}),
        json!({"op":"issue","node":"n1","user":"foreign"}),
        json!({"op":"issue","node":"n1","user":"owner"}),
        json!({"op":"issue","node":"n1","user":"owner"}),
        json!({"op":"resolve","slot":1}),
        json!({"op":"resolve","token":"jait-node-wrong"}),
        json!({"op":"revoke","node":"n1","user":"foreign"}),
        json!({"op":"resolve","slot":2}),
        json!({"op":"revoke","node":"n1","user":"owner"}),
        json!({"op":"resolve","slot":1}),
        json!({"op":"resolve","slot":2}),
        json!({"op":"bind","node":"n2","user":"owner"}),
        json!({"op":"issue","node":"n2","user":"owner"}),
        json!({"op":"resolve","slot":3}),
    ];
    let seed = "INSERT INTO nodes(node_id,first_seen_at,last_seen_at,created_at,updated_at) VALUES('n1','now','now','now','now'),('n2','now','now','now','now')";
    for memory in [true, false] {
        credentials_scenario(memory, seed, steps.clone());
    }
}
#[test]
fn persisted_node_credentials_survive_reopen_and_recheck_current_ownership() {
    credentials_scenario(
        false,
        "INSERT INTO nodes(node_id,user_id,first_seen_at,last_seen_at,created_at,updated_at) VALUES('n1','owner','now','now','now','now')",
        vec![
            json!({"op":"issue","node":"n1","user":"owner"}),
            json!({"op":"reopen"}),
            json!({"op":"resolve","slot":0}),
            json!({"op":"mutate","sql":"UPDATE nodes SET user_id='foreign' WHERE node_id='n1'"}),
            json!({"op":"resolve","slot":0}),
            json!({"op":"mutate","sql":"UPDATE nodes SET user_id='owner' WHERE node_id='n1'"}),
            json!({"op":"resolve","slot":0}),
            json!({"op":"bind","node":"missing","user":"owner"}),
            json!({"op":"owner","node":"missing"}),
            json!({"op":"issue","node":"missing","user":"owner"}),
            json!({"op":"issue","node":"n1","user":"owner"}),
        ],
    );
}

fn jsonstate_scenario(project: bool, seed: &str, steps: Vec<Value>) {
    use jait_gateway::services::json_state::{ProjectStateService, SessionStateService};
    let mut reference =
        observe(json!({"op":"nativestate.jsonstate","project":project,"seed":seed,"steps":steps}));
    let connection = db::open_database(Path::new(":memory:")).unwrap();
    db::migrate_database(&connection).unwrap();
    connection.execute_batch(seed).unwrap();
    let session = SessionStateService::new(&connection);
    let workspace = ProjectStateService::new(&connection);
    let mut results = vec![];
    for step in &steps {
        let id = step["id"].as_str().unwrap_or("");
        let keys = step
            .get("keys")
            .map(|keys| serde_json::from_value::<Vec<String>>(keys.clone()).unwrap());
        let result = match step["op"].as_str().unwrap() {
            "get" => json!(if project {
                workspace.get(id, keys.as_deref()).unwrap()
            } else {
                session.get(id, keys.as_deref()).unwrap()
            }),
            "set" => {
                if project {
                    workspace
                        .set(id, step["entries"].as_object().unwrap())
                        .unwrap()
                } else {
                    session
                        .set(id, step["entries"].as_object().unwrap())
                        .unwrap()
                };
                Value::Null
            }
            "byKey" => json!(session.get_by_key(step["key"].as_str().unwrap()).unwrap()),
            "deleteAll" => {
                session.delete_all(id).unwrap();
                Value::Null
            }
            "mutate" => {
                connection
                    .execute_batch(step["sql"].as_str().unwrap())
                    .unwrap();
                Value::Null
            }
            op => panic!("unknown step {op}"),
        };
        assert_eq!(result, reference["results"][results.len()], "step {step}");
        results.push(result);
    }
    let (table, owner) = if project {
        ("project_state", "project_id")
    } else {
        ("session_state", "session_id")
    };
    let mut statement = connection
        .prepare(&format!(
            "SELECT {owner},key,value,updated_at FROM {table} ORDER BY {owner},key"
        ))
        .unwrap();
    let rows=statement.query_map([],|r|Ok(json!({owner:r.get::<_,String>(0)?,"key":r.get::<_,String>(1)?,"value":r.get::<_,Option<String>>(2)?,"updated_at":r.get::<_,String>(3)?}))).unwrap().collect::<rusqlite::Result<Vec<_>>>().unwrap();
    let mut actual = json!(rows);
    for rows in [&mut actual, &mut reference["rows"]] {
        for row in rows.as_array_mut().unwrap() {
            if row["updated_at"] != "seed" {
                let time = row["updated_at"].as_str().unwrap();
                assert!(time.contains('T') && time.ends_with('Z'));
                row["updated_at"] = json!("<time>");
            }
            if let Some(value) = row["value"].as_str()
                && let Ok(parsed) = serde_json::from_str::<Value>(value)
            {
                row["value"] = parsed;
            }
        }
    }
    assert_eq!(
        actual, reference["rows"],
        "durable rows after reads, updates and migration"
    );
}
#[test]
fn session_json_state_roundtrips_filters_deletes_and_recovers_malformed_legacy_values() {
    jsonstate_scenario(
        false,
        "INSERT INTO session_state VALUES('s1','broken','bad json','seed'),('s1','empty','','seed'),('s1','null',NULL,'seed'),('s1','__proto__','{\"inherited\":true}','seed')",
        vec![
            json!({"op":"get","id":"missing"}),
            json!({"op":"get","id":"s1"}),
            json!({"op":"set","id":"s1","entries":{"nested":{"資料":[1,true,"🦀"]},"false":false,"zero":0,"string":"","emptyArray":[],"":1}}),
            json!({"op":"set","id":"s2","entries":{"nested":{"other":1}}}),
            json!({"op":"byKey","key":"nested"}),
            json!({"op":"get","id":"s1","keys":["nested","missing"]}),
            json!({"op":"get","id":"s1","keys":[]}),
            json!({"op":"set","id":"s1","entries":{"nested":{"updated":true},"false":null,"missing":null}}),
            json!({"op":"get","id":"s1"}),
            json!({"op":"get","id":"s2"}),
            json!({"op":"deleteAll","id":"s1"}),
            json!({"op":"get","id":"s1"}),
            json!({"op":"byKey","key":"nested"}),
        ],
    );
}
#[test]
fn project_json_state_migration_preserves_legacy_response_and_has_precise_filter_triggers() {
    let seed = r#"INSERT INTO project_state VALUES('p1','project.panel','{"open":true}','seed'),('p1','project.tabs','["one","two"]','seed'),('p1','project.layout.mobile','{"mobile":1}','seed'),('p1','terminal.panel','false','seed'),('p1','dev-preview.panel','bad json','seed'),('p2','project.panel','{"other":true}','seed')"#;
    jsonstate_scenario(
        true,
        seed,
        vec![
            json!({"op":"get","id":"p1","keys":[]}),
            json!({"op":"get","id":"p1","keys":["project.panel"]}),
            json!({"op":"get","id":"p1","keys":["unrelated"]}),
            json!({"op":"get","id":"p1"}),
            json!({"op":"get","id":"p1"}),
            json!({"op":"get","id":"p2","keys":["project.ui"]}),
            json!({"op":"set","id":"p1","entries":{"project.ui":null}}),
            json!({"op":"get","id":"p1"}),
        ],
    );
}
#[test]
fn project_json_state_migration_uses_nullish_layout_precedence_and_existing_ui_truthiness() {
    for ui in ["null", "false", "0", "\"\"", "{}", "[]"] {
        let seed = format!(
            "INSERT INTO project_state VALUES('p','project.ui','{ui}','seed'),('p','project.layout','false','seed'),('p','project.layout.mobile','{{\"fallback\":true}}','seed'),('p','project.panel','null','seed')"
        );
        jsonstate_scenario(
            true,
            &seed,
            vec![
                json!({"op":"get","id":"p","keys":["project.ui"]}),
                json!({"op":"get","id":"p"}),
            ],
        );
    }
}
