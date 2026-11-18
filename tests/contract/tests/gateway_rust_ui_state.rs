#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::{
    db,
    services::json_state::{ProjectStateService, SessionStateService},
};
use serde_json::{Value, json};
use std::{
    fs,
    path::{Path, PathBuf},
};
const NOW: &str = "2026-10-18T12:00:00.000Z";
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}
fn directory() -> PathBuf {
    let path = root()
        .join(".jait/artifacts/gateway-rust/native-ui-state")
        .join(uuid::Uuid::new_v4().to_string());
    fs::create_dir_all(&path).unwrap();
    path
}
fn scenario(scope: &str, seed: &str, steps: Value) -> Value {
    let expected=internal_driver::call(&root(),&directory(),json!({"version":1,"calls":[{"op":"nativeuistate.run","scope":scope,"seed":seed,"steps":steps,"now":NOW}]}),&||false).unwrap()[0].clone();
    let db = db::open_database(Path::new(":memory:")).unwrap();
    db::migrate_database(&db).unwrap();
    db.execute_batch(seed).unwrap();
    let session = SessionStateService::with_time(&db, NOW);
    let project = ProjectStateService::with_time(&db, NOW);
    let mut results = vec![];
    for step in steps.as_array().unwrap() {
        let id = step["id"].as_str().unwrap_or("");
        let result: rusqlite::Result<Value> = (|| match step["op"].as_str().unwrap_or("get") {
            "sql" => {
                db.execute_batch(step["sql"].as_str().unwrap())?;
                Ok(Value::Null)
            }
            "set" => {
                let entries = step["entries"].as_object().unwrap();
                if scope == "session" {
                    session.set(id, entries)?
                } else {
                    project.set(id, entries)?
                };
                Ok(Value::Null)
            }
            "delete" => {
                session.delete_all(id)?;
                Ok(Value::Null)
            }
            "key" => Ok(json!(session.get_by_key(step["key"].as_str().unwrap())?)),
            _ => {
                let keys = step.get("keys").map(|v| {
                    v.as_array()
                        .unwrap()
                        .iter()
                        .map(|k| k.as_str().unwrap().to_string())
                        .collect::<Vec<_>>()
                });
                Ok(json!(if scope == "session" {
                    session.get(id, keys.as_deref())?
                } else {
                    project.get(id, keys.as_deref())?
                }))
            }
        })();
        results.push(result.unwrap_or(json!({"error":true})));
    }
    let column = if scope == "session" {
        "session_id"
    } else {
        "project_id"
    };
    let mut q = db
        .prepare(&format!(
            "SELECT {column},key,value,updated_at FROM {scope}_state ORDER BY rowid"
        ))
        .unwrap();
    let rows=q.query_map([],|r|Ok(json!({column:r.get::<_,String>(0)?,"key":r.get::<_,String>(1)?,"value":r.get::<_,Option<String>>(2)?,"updated_at":r.get::<_,String>(3)?}))).unwrap().collect::<rusqlite::Result<Vec<_>>>().unwrap();
    let actual = json!({"results":results,"rows":rows});
    assert_eq!(actual, expected, "{scope}: {steps}");
    actual
}
fn raw(scope: &str, id: &str, key: &str, value: Option<&str>) -> String {
    let quote = |s: &str| format!("'{}'", s.replace('\'', "''"));
    format!(
        "INSERT INTO {scope}_state({scope}_id,key,value,updated_at)VALUES({},{},{},'old');",
        quote(id),
        quote(key),
        value.map(quote).unwrap_or("NULL".into())
    )
}
#[test]
fn session_crud_filters_and_cross_session_lookup_use_real_storage() {
    let v = scenario(
        "session",
        "",
        json!([
            {"op":"set","id":"a","entries":{"project.panel":{"open":true},"terminal.visible":false,"n":1,"s":""}},
            {"op":"set","id":"b","entries":{"n":[1,2]}},
            {"id":"a"},{"id":"a","keys":[]},{"id":"a","keys":["n","missing","n"]},
            {"op":"key","key":"n"},{"op":"key","key":"absent"},
            {"op":"set","id":"a","entries":{"n":2,"s":null,"absent":null}},
            {"id":"a"},{"op":"delete","id":"a"},{"id":"a"},{"id":"b"},{"op":"delete","id":"absent"}
        ]),
    );
    assert_eq!(v["results"][4], json!({"n":1}));
    assert_eq!(v["results"][10], json!({}));
    assert_eq!(v["rows"].as_array().unwrap().len(), 1);
}
#[test]
fn legacy_null_invalid_json_scalars_and_updates_match_reference() {
    let mut seed = String::new();
    for (k, v) in [
        ("null", None),
        ("empty", Some("")),
        ("bad", Some("{bad")),
        ("valid", Some("[null,0,false,\"x\"]")),
        ("dup", Some("1")),
        ("quoted", Some("\"hello\"")),
    ] {
        seed += &raw("session", "a", k, v);
    }
    let v = scenario(
        "session",
        &seed,
        json!([{"id":"a"},{"op":"key","key":"dup"},{"op":"set","id":"a","entries":{"dup":3}},{"id":"a"},{"op":"set","id":"a","entries":{"dup":null}},{"id":"a"}]),
    );
    assert_eq!(v["results"][0]["bad"], "{bad");
    assert_eq!(v["results"][0]["dup"], 1);
    assert_eq!(v["results"][3]["dup"], 3);
}
#[test]
fn state_values_use_javascript_json_serialization_and_numeric_key_order() {
    scenario(
        "session",
        "",
        json!([{"op":"set","id":"quote' OR 1=1--","entries":{"z":{"value":1e-7,"negativeZero":-0.0,"big":1e21,"newline":"\n😀"},"10":10,"2":2,"01":1,"0":0,"4294967295":9,"constructor":true,"toString":"own"}},{"id":"quote' OR 1=1--"},{"op":"key","key":"constructor"}]),
    );
}
#[test]
fn prototype_named_keys_follow_json_visible_ordinary_object_behavior() {
    let seed = raw("session", "a", "__proto__", Some("{\"inherited\":1}"))
        + &raw("session", "a", "constructor", Some("false"));
    scenario(
        "session",
        &seed,
        json!([{"id":"a"},{"op":"key","key":"__proto__"},{"op":"set","id":"a","entries":{"__proto__":{"next":true}}},{"id":"a"}]),
    );
    let seed = raw("session", "a", "__proto__", Some("{\"__proto__\":1}"));
    scenario("session", &seed, json!([{"id":"a"}]));
}
#[test]
fn failed_batch_keeps_prior_writes_and_errors_are_visible() {
    for scope in ["session", "project"] {
        let seed = format!(
            "CREATE TRIGGER reject_key BEFORE INSERT ON {scope}_state WHEN NEW.key='bad' BEGIN SELECT RAISE(FAIL,'fixture'); END;"
        );
        let v = scenario(
            scope,
            &seed,
            json!([{"op":"set","id":"a","entries":{"first":true,"bad":1,"last":2}},{"id":"a"}]),
        );
        assert_eq!(v["results"][0], json!({"error":true}));
        assert_eq!(v["results"][1], json!({"first":true}));
        scenario(
            scope,
            "",
            json!([{"op":"sql","sql":format!("DROP TABLE {scope}_state")},{"id":"a"},{"op":"set","id":"a","entries":{"x":1}},{"op":"sql","sql":format!("CREATE TABLE {scope}_state({scope}_id TEXT,key TEXT,value TEXT,updated_at TEXT)")} ]),
        );
    }
}
#[test]
fn project_legacy_migration_preserves_first_read_then_removes_fragment_rows() {
    let seed = raw("project", "a", "project.panel", Some("{\"open\":true}"))
        + &raw("project", "a", "project.tabs", Some("[1,2]"))
        + &raw(
            "project",
            "a",
            "project.layout.mobile",
            Some("{\"mobile\":true}"),
        )
        + &raw("project", "a", "terminal.panel", None)
        + &raw("project", "a", "dev-preview.panel", Some("false"))
        + &raw("project", "other", "project.panel", Some("123"));
    let v = scenario(
        "project",
        &seed,
        json!([{"id":"a"},{"id":"a"},{"id":"other","keys":["unrelated"]}]),
    );
    assert_eq!(v["results"][0]["project.panel"], json!({"open":true}));
    assert!(v["results"][1].get("project.panel").is_none());
    assert_eq!(
        v["results"][0]["project.ui"]["layout"],
        json!({"mobile":true})
    );
    assert_eq!(v["rows"].as_array().unwrap().len(), 2);
}
#[test]
fn project_empty_key_filter_reads_all_but_does_not_trigger_migration() {
    let seed = raw("project", "a", "project.panel", Some("1"));
    let v = scenario(
        "project",
        &seed,
        json!([{"id":"a","keys":[]},{"id":"a","keys":["x"]},{"id":"a","keys":["project.ui"]},{"id":"a"}]),
    );
    assert!(v["results"][0].get("project.ui").is_none());
    assert_eq!(v["results"][1], json!({}));
    assert_eq!(
        v["results"][2],
        json!({"project.ui":{"panel":1,"tabs":null,"layout":null,"terminal":null,"preview":null}})
    );
}
#[test]
fn project_ui_truthiness_and_layout_nullish_fallback_match_javascript() {
    for ui in [
        "null",
        "false",
        "0",
        "\"\"",
        "[]",
        "{}",
        "1",
        "\"configured\"",
    ] {
        let seed = raw("project", "a", "project.ui", Some(ui))
            + &raw("project", "a", "project.layout", Some("false"))
            + &raw("project", "a", "project.layout.mobile", Some("42"));
        scenario("project", &seed, json!([{"id":"a"},{"id":"a"}]));
    }
    scenario(
        "project",
        &raw("project", "a", "project.layout", Some("null")),
        json!([{"id":"a","keys":["project.ui"]}]),
    );
}
#[test]
fn project_legacy_migration_can_read_inherited_data_without_polluting_rust_objects() {
    let seed = raw(
        "project",
        "a",
        "__proto__",
        Some("{\"project.panel\":{\"inherited\":true},\"project.layout.mobile\":4}"),
    );
    let v = scenario("project", &seed, json!([{"id":"a"},{"id":"a"}]));
    assert_eq!(
        v["results"][0]["project.ui"]["panel"],
        json!({"inherited":true})
    );
    let seed = raw(
        "project",
        "a",
        "__proto__",
        Some("{\"project.ui\":true,\"project.panel\":1}"),
    );
    scenario("project", &seed, json!([{"id":"a"}]));
}
#[test]
fn failed_legacy_cleanup_retains_created_unified_state_and_earlier_deletions() {
    let seed = raw("project", "a", "project.panel", Some("1"))
        + &raw("project", "a", "project.tabs", Some("2"))
        + "CREATE TRIGGER reject_delete BEFORE DELETE ON project_state WHEN OLD.key='project.tabs' BEGIN SELECT RAISE(FAIL,'fixture'); END;";
    let v = scenario("project", &seed, json!([{"id":"a"},{"id":"a"}]));
    assert_eq!(v["results"][0], json!({"error":true}));
    assert!(v["results"][1].get("project.ui").is_some());
    assert!(v["results"][1].get("project.panel").is_none());
}
#[test]
fn project_upserts_and_null_deletion_keep_other_projects_untouched() {
    scenario(
        "project",
        "",
        json!([{"op":"set","id":"a","entries":{"x":1,"y":false}},{"op":"set","id":"b","entries":{"x":"other"}},{"op":"set","id":"a","entries":{"x":2,"y":null}},{"id":"a"},{"id":"b"}]),
    );
}
#[test]
fn state_survives_reopening_real_database() {
    let path = directory().join("state.sqlite");
    {
        let db = db::open_database(&path).unwrap();
        db::migrate_database(&db).unwrap();
        SessionStateService::new(&db)
            .set("a", json!({"x":1}).as_object().unwrap())
            .unwrap();
        ProjectStateService::new(&db)
            .set(
                "p",
                json!({"project.panel":{"open":true}}).as_object().unwrap(),
            )
            .unwrap();
    }
    let db = db::open_database(&path).unwrap();
    assert_eq!(
        SessionStateService::new(&db).get("a", None).unwrap()["x"],
        1
    );
    assert_eq!(
        ProjectStateService::with_time(&db, NOW)
            .get("p", None)
            .unwrap()["project.ui"]["panel"]["open"],
        true
    );
    drop(db);
    let db = db::open_database(&path).unwrap();
    assert!(
        ProjectStateService::new(&db)
            .get("p", None)
            .unwrap()
            .get("project.panel")
            .is_none()
    );
}
#[test]
fn existing_project_store_migrates_inherited_legacy_data() {
    let db = db::open_database(Path::new(":memory:")).unwrap();
    db::migrate_database(&db).unwrap();
    db.execute_batch(&raw(
        "project",
        "a",
        "__proto__",
        Some("{\"project.panel\":{\"inherited\":true}}"),
    ))
    .unwrap();
    let actual = jait_gateway::services::json_state::ProjectStateService::new(&db)
        .get("a", None)
        .unwrap();
    let expected=internal_driver::call(&root(),&directory(),json!({"version":1,"calls":[{"op":"nativeuistate.run","scope":"project","seed":raw("project","a","__proto__",Some("{\"project.panel\":{\"inherited\":true}}")),"steps":[{"id":"a"}],"now":NOW}]}),&||false).unwrap();
    assert_eq!(
        actual.get("project.ui"),
        expected[0]["results"][0].get("project.ui")
    );
}
