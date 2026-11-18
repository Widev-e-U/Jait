#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::{
    db,
    services::{
        json_state::SessionStateService,
        node_permissions::{NodeCapability, NodePermissionsService, is_node_capability},
        thread_defaults::{normalize_reasoning_effort, resolve_thread_selection_defaults},
        users::UserService,
    },
};
use serde_json::{Value, json};
use std::{
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
};
const NOW: &str = "2026-10-18T12:00:00.000Z";
fn observe(call: Value) -> Value {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap();
    let dir = root
        .join(".jait/artifacts/gateway-rust/native-policy-state")
        .join(uuid::Uuid::new_v4().to_string());
    fs::create_dir_all(&dir).unwrap();
    internal_driver::call(&root, &dir, json!({"version":1,"calls":[call]}), &|| false).unwrap()[0]
        .clone()
}
fn rows(db: &rusqlite::Connection, table: &str) -> rusqlite::Result<Value> {
    let mut query = db.prepare(&format!("SELECT * FROM {table}"))?;
    let names = query
        .column_names()
        .into_iter()
        .map(String::from)
        .collect::<Vec<_>>();
    Ok(json!(
        query
            .query_map([], |r| {
                let mut row = serde_json::Map::new();
                for (i, key) in names.iter().enumerate() {
                    let value = match r.get_ref(i)? {
                        rusqlite::types::ValueRef::Null => Value::Null,
                        rusqlite::types::ValueRef::Integer(v) => json!(v),
                        rusqlite::types::ValueRef::Real(v) => json!(v),
                        rusqlite::types::ValueRef::Text(v) => {
                            json!(std::str::from_utf8(v).unwrap())
                        }
                        _ => panic!("unexpected blob"),
                    };
                    row.insert(key.clone(), value);
                }
                Ok(Value::Object(row))
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?
    ))
}
fn normalize(value: &mut Value) {
    fn visit(value: &mut Value, ids: &mut BTreeMap<String, String>) {
        match value {
            Value::String(s) => {
                if let Ok(id) = uuid::Uuid::parse_str(s) {
                    assert_eq!(id.get_version_num(), 7);
                    let next = format!("<id:{}>", ids.len());
                    *s = ids.entry(s.clone()).or_insert(next).clone()
                }
            }
            Value::Array(v) => {
                for value in v {
                    visit(value, ids)
                }
            }
            Value::Object(v) => {
                for value in v.values_mut() {
                    visit(value, ids)
                }
            }
            _ => {}
        }
    }
    let mut ids = BTreeMap::new();
    visit(value, &mut ids);
    for table in value["tables"].as_object_mut().unwrap().values_mut() {
        if let Some(rows) = table.as_array_mut() {
            rows.sort_by_key(Value::to_string);
        }
    }
}
fn scenario(seed: &str, steps: Vec<Value>, no_db: bool) -> Value {
    let mut expected = observe(
        json!({"op":"nativepolicystate.run","now":NOW,"seed":seed,"steps":steps,"noDb":no_db}),
    );
    let db = db::open_database(Path::new(":memory:")).unwrap();
    db::migrate_database(&db).unwrap();
    db.execute_batch(seed).unwrap();
    let nodes = NodePermissionsService::with_time((!no_db).then_some(&db), NOW);
    let users = UserService::with_time(&db, NOW);
    let state = SessionStateService::new(&db);
    let mut results = vec![];
    for step in &steps {
        let node = step["node"].as_str().unwrap_or("");
        let capability = || NodeCapability::parse(step["capability"].as_str().unwrap()).unwrap();
        let value = (|| -> rusqlite::Result<Value> {
            Ok(match step["op"].as_str().unwrap() {
                "seen" => {
                    nodes.ensure_node_seen(
                        &serde_json::from_value(step["hello"].clone()).unwrap(),
                        step["now"].as_str(),
                    );
                    Value::Null
                }
                "granted" => json!(nodes.is_granted(node, capability())),
                "permissions" => json!(nodes.get_permissions(node)),
                "list" => json!(nodes.list_node_permissions()),
                "update" => json!(nodes.update_permissions(
                    node,
                    step["grants"].as_object().unwrap(),
                    step["now"].as_str()
                )),
                "forget" => json!(nodes.forget_node(node)?),
                "deny" => {
                    nodes.log_denied(
                        node,
                        capability(),
                        step["detail"].as_str().unwrap_or("fixture denial"),
                    );
                    Value::Null
                }
                "defaults" => json!(resolve_thread_selection_defaults(
                    step["user"].as_str(),
                    step["session"].as_str(),
                    (step["withUsers"] != false).then_some(&users),
                    (step["withState"] != false).then_some(&state)
                )?),
                "sql" => {
                    db.execute_batch(step["sql"].as_str().unwrap())?;
                    Value::Null
                }
                _ => panic!("unknown policy state step"),
            })
        })();
        results.push(value.unwrap_or_else(|_| json!({"error":true})));
    }
    let tables = [
        "nodes",
        "node_permissions",
        "consent_log",
        "user_settings",
        "session_state",
    ]
    .into_iter()
    .map(|table| {
        (
            table,
            rows(&db, table).unwrap_or_else(|_| json!({"error":true})),
        )
    })
    .collect::<BTreeMap<_, _>>();
    let mut actual = json!({"results":results,"tables":tables});
    normalize(&mut actual);
    normalize(&mut expected);
    assert_eq!(actual, expected);
    actual
}
#[test]
fn capabilities_are_exact_and_new_nodes_deny_every_capability() {
    for value in [
        json!(null),
        json!(true),
        json!(1),
        json!([]),
        json!({}),
        json!("Terminal"),
        json!(" terminal"),
        json!(""),
        json!("agent"),
        json!("input"),
        json!("network"),
    ] {
        assert_eq!(
            json!(is_node_capability(&value)),
            observe(json!({"op":"nativepolicystate.capability","value":value}))
        );
    }
    scenario(
        "",
        vec![
            json!({"op":"permissions","node":"missing"}),
            json!({"op":"seen","hello":{"id":"node","name":"initial","platform":"linux"}}),
            json!({"op":"permissions","node":"node"}),
            json!({"op":"list"}),
            json!({"op":"seen","hello":{"id":"node","name":"changed","platform":"windows","role":"gateway"},"now":"2026-10-19T12:00:00.000Z"}),
            json!({"op":"list"}),
        ],
        false,
    );
}
#[test]
fn no_database_means_denied_and_no_persistence() {
    scenario(
        "",
        vec![
            json!({"op":"seen","hello":{"id":"node"}}),
            json!({"op":"update","node":"node","grants":{"terminal":true,"agent":true}}),
            json!({"op":"granted","node":"node","capability":"terminal"}),
            json!({"op":"list"}),
            json!({"op":"forget","node":"node"}),
            json!({"op":"deny","node":"node","capability":"network"}),
        ],
        true,
    );
}
#[test]
fn explicit_grants_unknown_keys_and_failed_updates_match_persisted_evidence() {
    let seed = "CREATE TRIGGER reject_screen BEFORE INSERT ON node_permissions WHEN NEW.capability='screen' BEGIN SELECT RAISE(ABORT,'fixture'); END;";
    scenario(
        seed,
        vec![
            json!({"op":"seen","hello":{"id":"node'quoted","role":"","name":""}}),
            json!({"op":"update","node":"node'quoted","grants":{"terminal":true,"filesystem":false,"screen":true,"unknown":true,"network":[],"input":{},"voice":0,"camera":"","agent":"false"}}),
            json!({"op":"granted","node":"node'quoted","capability":"screen"}),
            json!({"op":"granted","node":"node'quoted","capability":"network"}),
            json!({"op":"permissions","node":"node'quoted"}),
            json!({"op":"list"}),
            json!({"op":"update","node":"unseen","grants":{"terminal":true}}),
            json!({"op":"permissions","node":"unseen"}),
        ],
        false,
    );
}
#[test]
fn only_integer_one_grants_and_hellos_do_not_regrant_or_backfill_existing_nodes() {
    scenario(
        "",
        vec![
            json!({"op":"seen","hello":{"id":"node"}}),
            json!({"op":"sql","sql":"UPDATE node_permissions SET granted=2 WHERE capability='terminal'; UPDATE node_permissions SET granted=1.5 WHERE capability='input'; UPDATE node_permissions SET granted=1 WHERE capability='voice'; DELETE FROM node_permissions WHERE capability='screen';"}),
            json!({"op":"permissions","node":"node"}),
            json!({"op":"seen","hello":{"id":"node"}}),
            json!({"op":"permissions","node":"node"}),
            json!({"op":"deny","node":"node","capability":"terminal"}),
            json!({"op":"deny","node":"node","capability":"network"}),
        ],
        false,
    );
}
#[test]
fn forgetting_is_transactional_and_revokes_grants() {
    scenario(
        "",
        vec![
            json!({"op":"seen","hello":{"id":"node"}}),
            json!({"op":"update","node":"node","grants":{"terminal":true,"network":true}}),
            json!({"op":"sql","sql":"CREATE TRIGGER cannot_delete BEFORE DELETE ON nodes BEGIN SELECT RAISE(ABORT,'fixture'); END;"}),
            json!({"op":"forget","node":"node"}),
            json!({"op":"permissions","node":"node"}),
            json!({"op":"sql","sql":"DROP TRIGGER cannot_delete;"}),
            json!({"op":"forget","node":"node"}),
            json!({"op":"permissions","node":"node"}),
            json!({"op":"forget","node":"missing"}),
            json!({"op":"list"}),
        ],
        false,
    );
}
#[test]
fn broken_persistence_fails_closed_and_permission_audit_failures_are_nonfatal() {
    scenario(
        "DROP TABLE node_permissions; DROP TABLE consent_log;",
        vec![
            json!({"op":"seen","hello":{"id":"node"}}),
            json!({"op":"update","node":"node","grants":{"terminal":true}}),
            json!({"op":"granted","node":"node","capability":"terminal"}),
            json!({"op":"list"}),
            json!({"op":"forget","node":"node"}),
            json!({"op":"deny","node":"node","capability":"terminal"}),
        ],
        false,
    );
    scenario(
        "DROP TABLE nodes;",
        vec![
            json!({"op":"seen","hello":{"id":"node"}}),
            json!({"op":"list"}),
            json!({"op":"granted","node":"node","capability":"camera"}),
        ],
        false,
    );
}
const USERS: &str = "INSERT INTO users(id,username,password_hash,created_at,updated_at) VALUES('owner','owner','fixture','2020','2020'),('other','other','fixture','2021','2021'); INSERT INTO sessions(id,user_id,created_at,last_active_at) VALUES('s','owner','2020','2020');";
fn state_seed(values: Value) -> String {
    let mut seed = USERS.to_string();
    for (key, value) in values.as_object().unwrap() {
        seed.push_str(&format!("INSERT INTO session_state(session_id,key,value,updated_at) VALUES('s','{}','{}','2020');",key.replace("'","''"),value.to_string().replace("'","''")));
    }
    seed
}
#[test]
fn reasoning_effort_is_shape_checked_without_provider_value_allowlists() {
    let mut values = vec![
        json!(null),
        json!(1),
        json!([]),
        json!({}),
        json!(""),
        json!("HIGH"),
        json!(" xhigh "),
        json!("max._-0"),
        json!("_bad"),
        json!(".bad"),
        json!("bad space"),
        json!("ümlaut"),
        json!("bad\nvalue"),
        json!("\u{feff}high\u{a0}"),
    ];
    values.extend([json!("a".repeat(64)), json!("a".repeat(65))]);
    for value in values {
        assert_eq!(
            json!(normalize_reasoning_effort(&value)),
            observe(json!({"op":"nativepolicystate.effort","value":value}))
        );
    }
}
#[test]
fn defaults_use_only_the_selected_users_provider_and_authorized_session_state() {
    let seed = state_seed(
        json!({"chat.cliModels":{"jait":"  primary 🦀 ","other":"wrong"},"chat.reasoningEffort":" XHIGH ","chat.providerRuntimeMode":"full-access"}),
    );
    scenario(
        &seed,
        vec![
            json!({"op":"defaults","user":" owner ","session":" s "}),
            json!({"op":"defaults","user":"owner"}),
            json!({"op":"defaults","session":"s"}),
            json!({"op":"defaults","user":"owner","session":"s","withState":false}),
            json!({"op":"defaults","user":"owner","session":"s","withUsers":false}),
            json!({"op":"defaults","user":"","session":"s"}),
            json!({"op":"defaults","user":"other","session":"absent"}),
        ],
        false,
    );
}
#[test]
fn defaults_reject_invalid_runtime_and_model_shapes_and_propagate_storage_failures() {
    for (models, mode, effort) in [
        (json!([]), json!("supervised"), json!("high")),
        (
            json!({"jait":true}),
            json!("full-access "),
            json!("bad value"),
        ),
        (json!({"jait":"  "}), json!(null), json!(1)),
        (json!("bad"), json!("supervised"), json!("low")),
    ] {
        let seed = state_seed(
            json!({"chat.cliModels":models,"chat.providerRuntimeMode":mode,"chat.reasoningEffort":effort}),
        );
        scenario(
            &seed,
            vec![json!({"op":"defaults","user":"owner","session":"s"})],
            false,
        );
    }
    scenario(
        &format!("{USERS} DROP TABLE session_state;"),
        vec![json!({"op":"defaults","user":"owner","session":"s"})],
        false,
    );
}
