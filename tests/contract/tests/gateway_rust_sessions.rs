#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::{
    db,
    services::sessions::{SessionFilter, SessionService},
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
        .join(".jait/artifacts/gateway-rust/native-sessions")
        .join(uuid::Uuid::new_v4().to_string());
    fs::create_dir_all(&dir).unwrap();
    internal_driver::call(&root, &dir, json!({"version":1,"calls":[call]}), &|| false).unwrap()[0]
        .clone()
}
fn rows(db: &rusqlite::Connection, sql: &str) -> Value {
    let mut statement = db.prepare(sql).unwrap();
    let columns = statement
        .column_names()
        .into_iter()
        .map(String::from)
        .collect::<Vec<_>>();
    json!(
        statement
            .query_map([], |r| {
                let mut row = serde_json::Map::new();
                for (i, key) in columns.iter().enumerate() {
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
            })
            .unwrap()
            .collect::<rusqlite::Result<Vec<_>>>()
            .unwrap()
    )
}
// Preserve lone UTF-16 surrogate evidence while ignoring JSON object key order.
fn lossless_json(raw: &str) -> Value {
    if let Ok(v) = serde_json::from_str::<Value>(raw) {
        return v;
    }
    if let Ok(v) = serde_json::from_str::<BTreeMap<String, Box<serde_json::value::RawValue>>>(raw) {
        return json!(
            v.into_iter()
                .map(|(k, v)| (k, lossless_json(v.get())))
                .collect::<BTreeMap<_, _>>()
        );
    }
    json!({"rawUtf16":raw})
}
fn normalize(value: &mut Value) {
    let mut ids = BTreeMap::new();
    for row in value["sessions"].as_array().unwrap() {
        let id = row["id"].as_str().unwrap();
        if uuid::Uuid::parse_str(id).is_ok() {
            ids.insert(id.to_string(), "<session>".to_string());
        }
    }
    for row in value["messages"].as_array().unwrap() {
        let id = row["id"].as_str().unwrap();
        if uuid::Uuid::parse_str(id).is_ok() {
            ids.insert(
                id.to_string(),
                format!("<message:{}:{}>", row["role"], row["content"]),
            );
        }
    }
    fn visit(value: &mut Value, ids: &BTreeMap<String, String>) {
        match value {
            Value::String(s) => {
                if let Some(id) = ids.get(s) {
                    *s = id.clone()
                }
            }
            Value::Array(values) => {
                for v in values {
                    visit(v, ids)
                }
            }
            Value::Object(values) => {
                if let Some(Value::String(raw)) = values.get("metadata") {
                    values.insert("metadata".into(), lossless_json(raw));
                }
                for v in values.values_mut() {
                    visit(v, ids)
                }
            }
            _ => {}
        }
    }
    visit(value, &ids);
    // Generated UUID entropy may order equal-timestamp messages differently.
    for key in ["sessions", "messages", "context"] {
        value[key]
            .as_array_mut()
            .unwrap()
            .sort_by_key(Value::to_string);
    }
}
fn scenario(seed: &str, steps: Vec<Value>) {
    let mut expected =
        observe(json!({"op":"nativesessions.run","now":NOW,"seed":seed,"steps":steps}));
    let connection = db::open_database(Path::new(":memory:")).unwrap();
    db::migrate_database(&connection).unwrap();
    connection.execute_batch(seed).unwrap();
    let service = SessionService::with_time(&connection, NOW);
    let mut created = String::new();
    let mut results = vec![];
    for step in &steps {
        let id = step["id"].as_str().unwrap_or("");
        let resolved_id = if id == "$created" {
            created.clone()
        } else {
            id.to_owned()
        };
        let id = resolved_id.as_str();
        let user = step["user"].as_str();
        let result = (|| -> rusqlite::Result<Value> {
            Ok(match step["op"].as_str().unwrap() {
                "create" => {
                    let row =
                        service.create(serde_json::from_value(step["data"].clone()).unwrap())?;
                    created = row.id.clone();
                    json!(row)
                }
                "get" => json!(service.get(id, user)?),
                "count" => json!(service.count(step["status"].as_str())?),
                "list" | "projectList" => json!(service.list(SessionFilter {
                    status: step["status"].as_str(),
                    user_id: user,
                    project_id: if step["op"] == "projectList" {
                        step["project"].as_str()
                    } else {
                        None
                    },
                    personal_only: step["personalOnly"].as_bool().unwrap_or(false),
                    limit: step["limit"].as_f64(),
                })?),
                "lastActive" => json!(service.last_active(user)?),
                "touch" => {
                    service.touch(id)?;
                    Value::Null
                }
                "view" => {
                    service.mark_viewed(id, user, step["observed"].as_str())?;
                    Value::Null
                }
                "archive" | "delete" => {
                    service.set_status(
                        id,
                        if step["op"] == "archive" {
                            "archived"
                        } else {
                            "deleted"
                        },
                        user,
                    )?;
                    Value::Null
                }
                "projectStatus" => {
                    service.project_status(
                        step["project"].as_str().unwrap(),
                        step["operation"].as_str().unwrap(),
                        user,
                    )?;
                    Value::Null
                }
                "update" => {
                    service.update(id, step["data"].as_object().unwrap(), user)?;
                    Value::Null
                }
                "move" => json!(service.move_to_project(
                    id,
                    step["project"].as_str(),
                    step["path"].as_str(),
                    user
                )?),
                "selection" => {
                    service.update_chat_selection(id, step["data"].as_object().unwrap(), user)?;
                    Value::Null
                }
                "error" => {
                    service.update_chat_error(id, step["error"].as_str(), user)?;
                    Value::Null
                }
                "fork" => {
                    let live = step
                        .get("live")
                        .map(|v| serde_json::from_value(v.clone()).unwrap());
                    let row = service.fork(id, user.unwrap(), live.as_ref())?;
                    if let Some(row) = &row {
                        created = row.id.clone()
                    };
                    json!(row)
                }
                "sql" => {
                    connection.execute_batch(step["sql"].as_str().unwrap())?;
                    Value::Null
                }
                _ => panic!("unknown operation"),
            })
        })()
        .unwrap_or(json!({"error":true}));
        results.push(result);
    }
    let mut actual = json!({"results":results,"sessions":rows(&connection,"SELECT * FROM sessions ORDER BY id"),"messages":rows(&connection,"SELECT * FROM messages ORDER BY session_id,created_at,id"),"context":rows(&connection,"SELECT * FROM message_context_metadata ORDER BY message_id")});
    normalize(&mut actual);
    normalize(&mut expected);
    for (i, step) in steps.iter().enumerate() {
        assert_eq!(
            actual["results"][i], expected["results"][i],
            "step {i}: {step}"
        );
    }
    assert_eq!(actual, expected, "persisted effects");
}
const SEED:&str="INSERT INTO sessions(id,user_id,project_id,name,project_path,created_at,last_active_at,viewed_at,status,metadata) VALUES
('s1','owner','p','  Parent  ','/project','2026-10-18T10:00:00.000Z','2026-10-18T11:00:00.000Z','2026-10-18T10:00:00.000Z','active','{\"other\":1,\"chat\":{\"model\":\"old\"}}'),
('s2','foreign','p','Other',NULL,'2026-10-18T10:00:00.000Z','2026-10-18T11:30:00.000Z',NULL,'active',NULL),
('s3','owner',NULL,'Personal',NULL,'2026-10-18T10:00:00.000Z','2026-10-18T11:15:00.000Z',NULL,'archived',NULL);";
#[test]
fn session_crud_scope_filters_limits_moves_and_nullable_patches_match_reference() {
    let mut steps = vec![
        json!({"op":"get","id":"s1","user":"foreign"}),
        json!({"op":"get","id":"absent"}),
        json!({"op":"get","id":"s1","user":""}),
        json!({"op":"count"}),
        json!({"op":"count","status":"active"}),
        json!({"op":"list"}),
        json!({"op":"list","user":"owner","limit":1.9}),
        json!({"op":"list","user":"owner","personalOnly":true}),
        json!({"op":"projectList","project":"p","user":"owner"}),
        json!({"op":"lastActive","user":"owner"}),
        json!({"op":"update","id":"s1","data":{"name":"should not change"},"user":"foreign"}),
        json!({"op":"update","id":"s1","data":{},"user":"owner"}),
        json!({"op":"update","id":"s1","data":{"name":"","metadata":{"資料":[1,true]},"projectPath":null},"user":"owner"}),
        json!({"op":"move","id":"s1","project":null,"path":null,"user":"owner"}),
        json!({"op":"projectList","project":"p","user":"owner"}),
        json!({"op":"create","data":{"userId":"owner","name":"","metadata":{},"projectPath":"","projectId":null}}),
        json!({"op":"get","id":"$created","user":"owner"}),
        json!({"op":"archive","id":"$created","user":"foreign"}),
        json!({"op":"get","id":"$created","user":"owner"}),
        json!({"op":"archive","id":"$created","user":"owner"}),
        json!({"op":"delete","id":"s3","user":"owner"}),
        json!({"op":"lastActive","user":"owner"}),
    ];
    for limit in [json!(0), json!(-1), json!(0.5), json!(2), json!(null)] {
        steps.push(json!({"op":"list","user":"owner","limit":limit}));
    }
    scenario(SEED, steps);
}
#[test]
fn session_activity_is_monotonic_and_viewed_acknowledgement_never_exceeds_observed_activity() {
    scenario(
        SEED,
        vec![
            json!({"op":"touch","id":"s1"}),
            json!({"op":"touch","id":"s1"}),
            json!({"op":"get","id":"s1"}),
            json!({"op":"view","id":"s1","user":"foreign"}),
            json!({"op":"get","id":"s1"}),
            json!({"op":"view","id":"s1","user":"owner","observed":"bad date"}),
            json!({"op":"view","id":"s1","user":"owner","observed":"2026-10-18T11:00:00.000Z"}),
            json!({"op":"get","id":"s1"}),
            json!({"op":"view","id":"s1","user":"owner","observed":"2026-10-18T10:00:00.000Z"}),
            json!({"op":"get","id":"s1"}),
            json!({"op":"view","id":"s1","user":"owner","observed":"2027-01-01T00:00:00.000Z"}),
            json!({"op":"get","id":"s1"}),
            json!({"op":"view","id":"s2","user":"foreign"}),
            json!({"op":"get","id":"s2"}),
            json!({"op":"touch","id":"missing"}),
            json!({"op":"view","id":"missing"}),
        ],
    );
}
#[test]
fn session_project_lifecycle_changes_only_authorized_matching_status_rows() {
    scenario(
        SEED,
        vec![
            json!({"op":"projectStatus","project":"p","operation":"archive","user":"owner"}),
            json!({"op":"list"}),
            json!({"op":"projectStatus","project":"p","operation":"restore","user":"foreign"}),
            json!({"op":"list"}),
            json!({"op":"projectStatus","project":"p","operation":"restore","user":"owner"}),
            json!({"op":"list"}),
            json!({"op":"projectStatus","project":"p","operation":"delete","user":"owner"}),
            json!({"op":"list"}),
            json!({"op":"projectStatus","project":"p","operation":"restore","user":"owner"}),
            json!({"op":"list"}),
        ],
    );
}
#[test]
fn session_chat_selection_error_merge_truncation_clearing_and_legacy_metadata_match_reference() {
    let mut steps = vec![
        json!({"op":"selection","id":"s1","user":"foreign","data":{"model":"bad"}}),
        json!({"op":"selection","id":"s1","user":"owner","data":{"provider":"p","model":null,"reasoningEffort":"high","nodeId":"n","ignored":true}}),
        json!({"op":"get","id":"s1"}),
        json!({"op":"error","id":"s1","user":"owner","error":"broken"}),
        json!({"op":"get","id":"s1"}),
        json!({"op":"selection","id":"s1","user":"owner","data":{"model":"new"}}),
        json!({"op":"get","id":"s1"}),
        json!({"op":"error","id":"s1","user":"owner","error":"🦀".repeat(260)}),
        json!({"op":"get","id":"s1"}),
        json!({"op":"error","id":"s1","user":"owner","error":format!("{}🦀","a".repeat(499))}),
        json!({"op":"get","id":"s1"}),
        json!({"op":"error","id":"s1","user":"owner","error":null}),
        json!({"op":"get","id":"s1"}),
    ];
    for metadata in [
        "broken json",
        "null",
        "true",
        "12",
        "[]",
        "[1,2]",
        "{}",
        "{\"chat\":[1,2]}",
        "{\"chat\":false}",
        "{\"chat\":\"abc\"}",
    ] {
        steps.push(json!({"op":"sql","sql":format!("UPDATE sessions SET metadata='{}' WHERE id='s1'",metadata.replace('\'',"''"))}));
        steps.push(json!({"op":"selection","id":"s1","data":{"model":"updated"}}));
        steps.push(json!({"op":"get","id":"s1"}));
    }
    scenario(SEED, steps);
}
fn fork_seed() -> String {
    format!("{SEED} INSERT INTO messages(id,session_id,role,content,tool_calls,segments,context_flow,thinking,persona,created_at) VALUES
    ('m1','s1','user','question',NULL,NULL,NULL,NULL,NULL,'2026-10-18T10:00:01.000Z'),
    ('m2','s1','assistant','checkpoint','[]','[]','{{\"injectedIds\":[\"memory\"]}}','reason','sage','2026-10-18T10:00:02.000Z'),
    ('m3','s1','system','system',NULL,NULL,NULL,NULL,NULL,'2026-10-18T10:00:03.000Z');")
}
#[test]
fn session_fork_freezes_owned_history_context_and_metadata_without_mutating_parent() {
    scenario(
        &fork_seed(),
        vec![
            json!({"op":"fork","id":"s1","user":"foreign"}),
            json!({"op":"fork","id":"missing","user":"owner"}),
            json!({"op":"fork","id":"s1","user":"owner"}),
            json!({"op":"get","id":"$created","user":"owner"}),
            json!({"op":"update","id":"s1","user":"owner","data":{"name":"Changed","metadata":{"changed":true}}}),
            json!({"op":"sql","sql":"UPDATE messages SET content='parent changed' WHERE id='m1'"}),
            json!({"op":"get","id":"$created","user":"owner"}),
        ],
    );
}
#[test]
fn session_live_fork_replaces_only_last_assistant_and_keeps_exact_partial_payload() {
    for live in [
        json!({"content":""}),
        json!({"content":"partial","toolCalls":"[]","segments":"[]","thinking":"thought","persona":"sage"}),
        json!({"content":"","thinking":"reason"}),
    ] {
        scenario(
            &fork_seed(),
            vec![json!({"op":"fork","id":"s1","user":"owner","live":live})],
        );
    }
    let seed = format!(
        "{} UPDATE messages SET role='user' WHERE id='m2';",
        fork_seed()
    );
    scenario(
        &seed,
        vec![json!({"op":"fork","id":"s1","user":"owner","live":{"content":"progress"}})],
    );
}
#[test]
fn session_fork_is_atomic_when_message_copy_fails() {
    let seed = format!(
        "{} CREATE TRIGGER reject_fork BEFORE INSERT ON messages WHEN NEW.id NOT IN ('m1','m2','m3') BEGIN SELECT RAISE(FAIL,'rejected'); END;",
        fork_seed()
    );
    scenario(
        &seed,
        vec![
            json!({"op":"fork","id":"s1","user":"owner"}),
            json!({"op":"count"}),
            json!({"op":"get","id":"s1"}),
        ],
    );
}

#[test]
fn session_nullable_legacy_rows_and_invalid_activity_remain_observable() {
    scenario(
        SEED,
        vec![
            json!({"op":"sql","sql":"UPDATE sessions SET name=NULL,status=NULL WHERE id='s1'"}),
            json!({"op":"get","id":"s1"}),
            json!({"op":"list"}),
            json!({"op":"fork","id":"s1","user":"owner"}),
            json!({"op":"sql","sql":"UPDATE sessions SET last_active_at='invalid date' WHERE id='s1'"}),
            json!({"op":"touch","id":"s1"}),
            json!({"op":"get","id":"s1"}),
        ],
    );
}

#[test]
fn question_fork_drops_parent_loop_state_and_preserves_parent_metadata() {
    for value in [
        json!({"enabled":true,"iteration":4}),
        json!(false),
        json!(null),
    ] {
        scenario(
            &fork_seed(),
            vec![
                json!({"op":"update","id":"s1","user":"owner","data":{"metadata":{"loop":value,"keep":"retained"}}}),
                json!({"op":"fork","id":"s1","user":"owner"}),
                json!({"op":"get","id":"$created","user":"owner"}),
                json!({"op":"get","id":"s1","user":"owner"}),
            ],
        );
    }
}
