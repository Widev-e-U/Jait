#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::services::reminders::*;
use rusqlite::Connection;
use serde_json::{Value, json};
use std::{collections::BTreeMap, path::PathBuf};
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}
fn strings(v: &Value) -> Vec<String> {
    serde_json::from_value(v.clone()).unwrap()
}
fn user(v: &Value) -> Option<&str> {
    v.as_str()
}
fn sql(db: &Connection, sql: &str, args: &Value) {
    let args: Vec<_> = args
        .as_array()
        .into_iter()
        .flatten()
        .map(|v| match v {
            Value::Null => rusqlite::types::Value::Null,
            Value::String(s) => s.clone().into(),
            Value::Number(n) => n.as_i64().unwrap().into(),
            _ => panic!("scalar SQL fixture required"),
        })
        .collect();
    db.execute(sql, rusqlite::params_from_iter(args)).unwrap();
}
fn resolve(v: &Value, aliases: &BTreeMap<String, String>) -> Value {
    match v {
        Value::String(s) => json!(
            aliases
                .iter()
                .find(|(_, alias)| *alias == s)
                .map(|(id, _)| id)
                .unwrap_or(s)
        ),
        Value::Array(a) => json!(a.iter().map(|v| resolve(v, aliases)).collect::<Vec<_>>()),
        Value::Object(o) => Value::Object(
            o.iter()
                .map(|(k, v)| (k.clone(), resolve(v, aliases)))
                .collect(),
        ),
        _ => v.clone(),
    }
}
fn normalize(v: &Value, aliases: &BTreeMap<String, String>) -> Value {
    match v {
        Value::String(s) => {
            let mut s = s.clone();
            for (id, alias) in aliases {
                s = s.replace(id, alias);
            }
            json!(s)
        }
        Value::Array(a) => json!(a.iter().map(|v| normalize(v, aliases)).collect::<Vec<_>>()),
        Value::Object(o) => Value::Object(
            o.iter()
                .map(|(k, v)| (k.clone(), normalize(v, aliases)))
                .collect(),
        ),
        _ => v.clone(),
    }
}
fn packed<T: serde::Serialize>(v: T) -> Result<Value> {
    Ok(serde_json::to_value(v).unwrap())
}
fn run(service: &ReminderService<'_>, s: &Value) -> Result<Option<Value>> {
    let out = match s["op"].as_str().unwrap() {
        "create" => packed(service.create(serde_json::from_value(s["params"].clone()).unwrap())?),
        "update" => {
            return service
                .update(
                    s["id"].as_str().unwrap(),
                    serde_json::from_value(s["params"].clone()).unwrap(),
                    user(&s["user"]),
                )
                .map(|v| v.map(|v| serde_json::to_value(v).unwrap()));
        }
        "get" => {
            return service
                .get_by_id(s["id"].as_str().unwrap(), user(&s["user"]))
                .map(|v| v.map(|v| serde_json::to_value(v).unwrap()));
        }
        "list" => packed(service.list(
            serde_json::from_value(s.get("options").cloned().unwrap_or(json!({}))).unwrap(),
        )?),
        "listByIds" => packed(service.list_by_ids(&strings(&s["ids"]))?),
        "delete" => packed(service.delete(s["id"].as_str().unwrap(), user(&s["user"]))?),
        "retrieved" => packed(service.mark_retrieved(&strings(&s["ids"]), user(&s["user"]))?),
        "export" => packed(service.export_markdown(
            serde_json::from_value(s.get("options").cloned().unwrap_or(json!({}))).unwrap(),
        )?),
        "hygiene" => packed(service.run_hygiene(user(&s["user"]))?),
        "scan" => packed(service.scan_old_chats_for_memory(user(&s["user"]), s["limit"].as_f64())?),
        "counts" => packed(service.count_by_project(s["user"].as_str().unwrap())?),
        _ => panic!("unknown reminder op"),
    };
    out.map(Some)
}
async fn compare(cases: Vec<Value>) {
    let expected = internal_driver::call(
        &root(),
        &root()
            .join(".jait/artifacts/gateway-rust/reminders/contracts")
            .join(uuid::Uuid::new_v4().to_string()),
        json!({"version":1,"calls":[{"op":"nativereminders.cases","cases":cases}]}),
        &|| false,
    )
    .unwrap()[0]
        .clone();
    for (i, test) in cases.iter().enumerate() {
        let db = Connection::open_in_memory().unwrap();
        jait_gateway::db::migrate_database(&db).unwrap();
        for seed in test["seed"].as_array().into_iter().flatten() {
            sql(&db, seed["sql"].as_str().unwrap(), &seed["params"]);
        }
        let now = test["now"].as_str().unwrap_or("2026-10-22T00:00:00.000Z");
        let serial = std::sync::atomic::AtomicU32::new(0);
        let ids = || {
            let mut bytes = [0u8; 16];
            bytes[12..].copy_from_slice(
                &serial
                    .fetch_add(1, std::sync::atomic::Ordering::SeqCst)
                    .to_be_bytes(),
            );
            jait_gateway::db::identifiers::uuidv7_from_parts(0, bytes).to_string()
        };
        let service = ReminderService::with_time_and_ids(&db, now, &ids);
        let mut aliases = BTreeMap::new();
        let mut actual = vec![];
        for (j, raw) in test["ops"].as_array().unwrap().iter().enumerate() {
            let s = resolve(raw, &aliases);
            let result = if s["op"] == "sql" {
                sql(&db, s["sql"].as_str().unwrap(), &s["params"]);
                Ok(Some(json!({"sql":true})))
            } else {
                run(&service, &s)
            };
            let ids: Vec<String> = db
                .prepare("SELECT id FROM reminders ORDER BY rowid")
                .unwrap()
                .query_map([], |r| r.get(0))
                .unwrap()
                .collect::<rusqlite::Result<_>>()
                .unwrap();
            for id in ids {
                if let Ok(uuid) = uuid::Uuid::parse_str(&id) {
                    assert_eq!(uuid.get_version_num(), 7);
                    if !aliases.contains_key(&id) {
                        let n = aliases.len();
                        aliases.insert(id, format!("$r{n}"));
                    }
                }
            }
            let result = match result {
                Ok(Some(v)) => json!({"value":v}),
                Ok(None) => json!({"undefined":true}),
                Err(e) => json!({"error":e.to_string()}),
            };
            let mut row = normalize(
                &json!({"result":result,"rows":service.list(ListReminderOptions{status:Some("all".into()),limit:Some(500.0),..Default::default()}).unwrap()}),
                &aliases,
            );
            if test["summary"] == true {
                fn canonical(mut v: Value) -> Value {
                    match &mut v {
                        Value::Array(a) => {
                            for item in a {
                                *item = canonical(item.take());
                            }
                        }
                        Value::Object(o) => {
                            for item in o.values_mut() {
                                *item = canonical(item.take());
                            }
                            o.sort_keys();
                        }
                        _ => {}
                    }
                    v
                }
                fn digest(v: &Value) -> Value {
                    use sha2::{Digest, Sha256};
                    json!({"count":v.as_array().unwrap().len(),"sha256":format!("{:x}",Sha256::digest(serde_json::to_vec(&canonical(v.clone())).unwrap()))})
                }
                row["rows"] = digest(&row["rows"]);
                if row["result"]["value"].is_array() {
                    row["result"]["value"] = digest(&row["result"]["value"]);
                }
            }
            assert_eq!(row, expected[i][j], "reminder case {i} step {j}: {raw}");
            actual.push(row);
        }
        assert_eq!(json!(actual), expected[i]);
    }
}
#[tokio::test]
async fn lifecycle_ownership_nulls_tags_limits_export_counts_and_retrieval_match() {
    let mut ops = vec![
        json!({"op":"list"}),
        json!({"op":"create","params":{"content":" \u{feff}  "}}),
    ];
    for params in [
        json!({"content":"  first 🦀\nline  ","userId":"owner","projectId":"p","sessionId":"s","sourceType":" user ","sourceId":" id ","sourceSurface":" web ","tags":[" A ","a","B",false,"","\u{feff}C","ΟΣ","İ"]}),
        json!({"content":"second","userId":"other","projectId":"p","status":"archived"}),
        json!({"content":"third","sourceType":" ","sourceId":" ","sourceSurface":" ","tags":(0..25).map(|i|format!("tag{i}")).collect::<Vec<_>>()}),
    ] {
        ops.push(json!({"op":"create","params":params}));
    }
    ops.extend([json!({"op":"get","id":"$r0","user":"other"}),json!({"op":"update","id":"$r0","user":"other","params":{"content":"wrong"}}),json!({"op":"delete","id":"$r0","user":"other"}),json!({"op":"listByIds","ids":["$r2","","$r0","$r0","missing"]}),json!({"op":"listByIds","ids":[]}),json!({"op":"retrieved","ids":["$r0","$r0","$r1","missing"],"user":"owner"}),json!({"op":"retrieved","ids":["$r0"],"user":"owner"}),json!({"op":"update","id":"$r0","user":"owner","params":{"content":" \u{feff} "}}),json!({"op":"update","id":"$r0","user":"owner","params":{"content":" changed ","projectId":null,"sessionId":"","tags":[],"status":"archived"}}),json!({"op":"update","id":"missing","params":{"content":""}}),json!({"op":"update","id":"missing","params":{}}),json!({"op":"update","id":"$r2","params":{}})]);
    for options in [
        json!({}),
        json!({"userId":"owner"}),
        json!({"userId":""}),
        json!({"status":"active"}),
        json!({"status":"archived"}),
        json!({"status":"all","projectId":"p"}),
        json!({"sessionId":"s"}),
        json!({"limit":0}),
        json!({"limit":-5}),
        json!({"limit":1.9}),
        json!({"limit":999}),
    ] {
        ops.push(json!({"op":"list","options":options}));
        ops.push(json!({"op":"export","options":options}));
    }
    ops.extend([
        json!({"op":"counts","user":"owner"}),
        json!({"op":"delete","id":"$r0","user":"owner"}),
        json!({"op":"get","id":"$r0"}),
        json!({"op":"delete","id":"$r0"}),
        json!({"op":"retrieved","ids":[]}),
    ]);
    compare(vec![json!({"ops":ops})]).await;
}
#[tokio::test]
async fn hygiene_age_boundary_invalid_dates_conflicting_subjects_and_malformed_display_tags_match()
{
    let mut seed = vec![];
    for (id, user, content, date, source, usage, tags) in [
        (
            "old",
            "owner",
            "Always use editor font family stable custom alpha",
            "2026-04-25T00:00:00.000Z",
            "agent",
            0,
            "[\"keep\"]",
        ),
        (
            "conflict",
            "owner",
            "Always use editor font family stable custom beta",
            "2026-10-20T00:00:00.000Z",
            "agent",
            0,
            "{bad",
        ),
        (
            "duplicate",
            "owner",
            "  ALWAYS  use editor font family stable custom alpha ",
            "2026-10-20T00:00:00.000Z",
            "agent",
            0,
            "[]",
        ),
        (
            "user",
            "owner",
            "my own old preference is retained",
            "2000-01-01T00:00:00Z",
            "user",
            0,
            "[1,\"raw\",null]",
        ),
        (
            "used",
            "owner",
            "always keep this used preference",
            "2000-01-01",
            "agent",
            1,
            "null",
        ),
        (
            "invalid",
            "owner",
            "always keep this invalid date",
            "not-a-date",
            "agent",
            0,
            "[]",
        ),
        (
            "fresh",
            "owner",
            "always keep the near age boundary",
            "2026-04-25T00:00:00.001Z",
            "agent",
            0,
            "[]",
        ),
        (
            "foreign",
            "other",
            "always use other owner setting",
            "2000-01-01",
            "agent",
            0,
            "[]",
        ),
    ] {
        seed.push(json!({"sql":"INSERT INTO reminders(id,user_id,content,updated_at,created_at,source_type,usage_count,tags) VALUES(?,?,?,?,?,?,?,?)","params":[id,user,content,date,date,source,usage,tags]}));
    }
    compare(vec![json!({"seed":seed,"ops":[{"op":"hygiene","user":"owner"},{"op":"export"},{"op":"hygiene","user":"owner"},{"op":"counts","user":"owner"},{"op":"hygiene"},{"op":"export"}]})]).await;
}
#[tokio::test]
async fn chat_scan_filters_owner_role_join_order_deduplicates_and_clips_utf16() {
    let mut seed = vec![
        json!({"sql":"INSERT INTO sessions(id,user_id,name,created_at,last_active_at) VALUES('s','owner','fixture','2026-01-01','2026-01-01'),('foreign','other','fixture','2026-01-01','2026-01-01')"}),
    ];
    let mut contents = vec![
        "ordinary short".to_owned(),
        "Remember this durable preference".into(),
        "remember  this DURABLE preference".into(),
        "NEVER store this assistant row".into(),
        "Always use the foreign setting".into(),
        "use spaces by default please".into(),
        "remember ".to_owned() + &"a".repeat(269) + "🦀" + &"b".repeat(20),
        "remember ".to_owned() + &"🦀".repeat(300),
        "Remember\u{feff}normalized\nwhite\tspace".into(),
    ];
    contents.extend([
        "xrememberthis boundary is absent".into(),
        "éremember Unicode ASCII boundary accepted".into(),
        "never ".to_owned() + &"a".repeat(594),
        "never ".to_owned() + &"a".repeat(595),
    ]);
    for (i, content) in contents.into_iter().enumerate() {
        seed.push(json!({"sql":"INSERT INTO messages(id,session_id,role,content,created_at) VALUES(?,?,?,?,?)","params":[format!("m{i}"),if i==4{"foreign"}else{"s"},if i==3{"assistant"}else{"user"},content,format!("2026-10-{:02}",i+1)]}));
    }
    compare(vec![json!({"seed":seed,"ops":[{"op":"scan","user":"owner","limit":500},{"op":"scan","user":"owner"},{"op":"export"},{"op":"scan","user":"other","limit":0},{"op":"scan","limit":1.9},{"op":"list","options":{"userId":"other"}}]})]).await;
}

#[tokio::test]
async fn default_floor_and_ceiling_limits_and_null_tag_patch_match() {
    let seed = json!([{"sql":r#"WITH RECURSIVE n(x) AS (SELECT 0 UNION ALL SELECT x+1 FROM n WHERE x<502) INSERT INTO reminders(id,user_id,project_id,content,tags,created_at,updated_at) SELECT printf('fixed-%03d',x),'owner','project',printf('remember durable fixture %d',x),'["keep"]','2026-01-01',printf('2026-01-01T00:00:00.%03dZ',x) FROM n"#}]);
    compare(vec![json!({"summary":true,"seed":seed,"ops":[{"op":"list"},{"op":"list","options":{"limit":-1}},{"op":"list","options":{"limit":1.9}},{"op":"list","options":{"limit":999}},{"op":"update","id":"fixed-000","user":"owner","params":{"tags":null}},{"op":"get","id":"fixed-000"},{"op":"counts","user":"owner"}]})]).await;
}
