//! Native R10 primitives and migration evidence. No live databases are used.
#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::{db, state_directory};
use serde_json::{Value, json};
use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}
fn directory() -> PathBuf {
    let path = root()
        .join(".jait/artifacts/gateway-rust/native-storage")
        .join(uuid::Uuid::new_v4().to_string());
    fs::create_dir_all(&path).unwrap();
    path
}
fn observe(input: Value) -> Value {
    internal_driver::call(
        &root(),
        &directory(),
        json!({"version":1,"calls":input}),
        &|| false,
    )
    .unwrap()
}
fn query(db: &rusqlite::Connection, sql: &str) -> Value {
    let mut statement = db.prepare(sql).unwrap();
    let names: Vec<String> = statement
        .column_names()
        .iter()
        .map(|n| n.to_string())
        .collect();
    let rows = statement
        .query_map([], |r| {
            let mut object = serde_json::Map::new();
            for (index, name) in names.iter().enumerate() {
                let value = match r.get_ref(index)? {
                    rusqlite::types::ValueRef::Null => Value::Null,
                    rusqlite::types::ValueRef::Integer(n) => json!(n),
                    rusqlite::types::ValueRef::Real(n) => json!(n),
                    rusqlite::types::ValueRef::Text(s) => json!(std::str::from_utf8(s).unwrap()),
                    rusqlite::types::ValueRef::Blob(_) => panic!("unexpected fixture blob"),
                };
                object.insert(name.clone(), value);
            }
            Ok(Value::Object(object))
        })
        .unwrap()
        .collect::<rusqlite::Result<Vec<_>>>()
        .unwrap();
    json!(rows)
}
fn schema(db: &rusqlite::Connection) -> Value {
    query(
        db,
        "SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name",
    )
}
#[test]
fn all_78_current_definition_prefixes_match_typescript_schema_and_preserve_data() {
    let id = uuid::Uuid::new_v4().to_string();
    let versions = (0..=77u32).collect::<Vec<_>>();
    let mut fixtures = Vec::with_capacity(versions.len());
    // Bound file-backed reference generation per driver call. A single call
    // for all 78 prefixes can exceed the unchanged ten-second driver deadline.
    for batch in versions.chunks(8) {
        let calls = observe(json!([{"op":"nativestorage.prefixes","id":id,"versions":batch}]));
        let returned = calls[0].as_array().unwrap();
        assert_eq!(
            returned.len(),
            batch.len(),
            "all requested fixtures returned"
        );
        fixtures.extend(returned.iter().cloned());
    }
    assert_eq!(
        fixtures
            .iter()
            .map(|f| f["version"].as_u64().unwrap() as u32)
            .collect::<Vec<_>>(),
        versions,
        "every prefix exactly once and in order"
    );
    for fixture in &fixtures {
        let version = fixture["version"].as_u64().unwrap();
        let native = db::open_database(Path::new(fixture["native"].as_str().unwrap())).unwrap();
        let reference =
            db::open_database(Path::new(fixture["reference"].as_str().unwrap())).unwrap();
        db::migrate_database(&native).unwrap();
        assert_eq!(db::schema_version(&native), 77, "prefix {version}");
        let native_schema = schema(&native);
        let reference_schema = schema(&reference);
        assert_eq!(
            native_schema.as_array().unwrap().len(),
            reference_schema.as_array().unwrap().len(),
            "schema count prefix {version}"
        );
        for (actual, expected) in native_schema
            .as_array()
            .unwrap()
            .iter()
            .zip(reference_schema.as_array().unwrap())
        {
            assert_eq!(actual, expected, "schema object prefix {version}");
        }
        assert_eq!(
            query(&native, "SELECT id,name FROM _migrations ORDER BY id"),
            query(&reference, "SELECT id,name FROM _migrations ORDER BY id")
        );
        for sql in [
            "SELECT id,user_id,name,project_path,status,created_at,last_active_at FROM sessions ORDER BY id",
            "SELECT id,session_id,role,content,created_at FROM messages ORDER BY id",
            "SELECT session_id,key,value FROM session_state ORDER BY session_id,key",
        ] {
            assert_eq!(
                query(&native, sql),
                query(&reference, sql),
                "rows prefix {version}"
            );
        }
        if version > 0 && version < 21 {
            let sql = "SELECT s.id,p.user_id,p.title,p.root_path,p.node_id FROM sessions s LEFT JOIN projects p ON p.id=s.project_id ORDER BY s.id";
            assert_eq!(
                query(&native, sql),
                query(&reference, sql),
                "backfill prefix {version}"
            );
            assert_eq!(
                native
                    .query_row("SELECT count(DISTINCT project_id) FROM sessions", [], |r| r
                        .get::<_, u32>(0))
                    .unwrap(),
                5
            );
        }
        assert_eq!(
            query(&native, "PRAGMA integrity_check"),
            json!([{"integrity_check":"ok"}])
        );
        assert_eq!(query(&native, "PRAGMA foreign_key_check"), json!([]));
        let before = query(&native, "SELECT * FROM _migrations ORDER BY id");
        db::migrate_database(&native).unwrap();
        assert_eq!(
            before,
            query(&native, "SELECT * FROM _migrations ORDER BY id"),
            "idempotence prefix {version}"
        );
    }
}
#[test]
fn uuidv7_layout_and_boundaries_match_the_real_typescript_generator() {
    let entropy = vec![255u8; 16];
    let timestamps = [
        0,
        1,
        255,
        256,
        65535,
        65536,
        (1u64 << 40) + 123,
        (1u64 << 48) - 1,
        1u64 << 48,
    ];
    let input:Vec<_>=timestamps.iter().map(|t|json!({"op":"nativestorage.identifier","id":"uuid","timestamp":t,"entropy":entropy})).collect();
    let actual = observe(json!(input));
    for (index, timestamp) in timestamps.iter().enumerate() {
        let identifier = db::identifiers::uuidv7_from_parts(*timestamp, [255; 16]).to_string();
        assert_eq!(actual[index]["uuid"], identifier);
        assert_eq!(actual[index]["action"], identifier);
        assert_eq!(identifier.as_bytes()[14], b'7');
        assert_eq!(identifier.as_bytes()[19], b'b');
    }
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis();
    let mut unique = HashSet::new();
    for _ in 0..10_000 {
        let id = db::identifiers::new_action_id();
        assert!(unique.insert(id));
        assert_eq!(id.get_version_num(), 7);
        let stamp = u64::from_be_bytes([
            0,
            0,
            id.as_bytes()[0],
            id.as_bytes()[1],
            id.as_bytes()[2],
            id.as_bytes()[3],
            id.as_bytes()[4],
            id.as_bytes()[5],
        ]);
        assert!(u128::from(stamp) >= now);
    }
}
#[test]
fn explicit_state_and_database_paths_follow_reference_precedence() {
    let dir = directory();
    let settings = json!({"JAIT_STATE_DIR":dir.to_str().unwrap(),"JAIT_DB_PATH":"  fixture.db  "});
    let input = json!([
        {"op":"nativestorage.paths","id":"paths","settings":settings},
        {"op":"nativestorage.paths","id":"paths","settings":settings,"explicit":":memory:"},
        {"op":"nativestorage.paths","id":"paths","settings":{"JAIT_STATE_DIR":"relative"}},
        {"op":"nativestorage.paths","id":"paths","settings":{"NODE_ENV":"test"}}
    ]);
    let reference = observe(input.clone());
    for (index, call) in input.as_array().unwrap().iter().enumerate() {
        let settings = &call["settings"];
        let result = state_directory::state_directory(&dir, settings["JAIT_STATE_DIR"].as_str())
            .and_then(|_| {
                state_directory::resolve_database_path(
                    call["explicit"].as_str(),
                    |key| settings[key].as_str().map(String::from),
                    &dir,
                )
            });
        match result {
            Ok(path) => assert_eq!(reference[index]["database"], path.to_str().unwrap()),
            Err(error) => assert_eq!(reference[index]["error"], error.to_string()),
        }
    }
    assert_eq!(
        state_directory::state_directory(&dir, None).unwrap(),
        dir.join(".jait")
    );
}
#[test]
fn migration_failure_is_not_recorded_and_schema_repairs_are_idempotent() {
    let db = db::open_database(Path::new(":memory:")).unwrap();
    db.execute_batch("CREATE TABLE sessions (id TEXT PRIMARY KEY)")
        .unwrap();
    let error = db::migrate_database(&db).unwrap_err();
    assert_eq!(error.id, 1);
    assert!(error.to_string().contains("not recorded as applied"));
    assert_eq!(db::schema_version(&db), 0);
    db.execute_batch("DROP TABLE sessions").unwrap();
    db::migrate_database(&db).unwrap();
    db.execute_batch("ALTER TABLE agent_threads DROP COLUMN reasoning_effort; ALTER TABLE user_settings DROP COLUMN disabled_tools").unwrap();
    assert_eq!(db::verify_schema(&db).unwrap(), 2);
    assert_eq!(db::verify_schema(&db).unwrap(), 0);
    db::migrate_database(&db).unwrap();
    assert_eq!(db::schema_version(&db), 77);
}
#[test]
fn native_wal_transactions_backup_and_typescript_reopen_preserve_committed_state() {
    let dir = directory();
    let path = dir.join("native.db");
    let backup = dir.join("backup.db");
    let mut db = db::open_database(&path).unwrap();
    db::migrate_database(&db).unwrap();
    assert_eq!(
        query(&db, "PRAGMA journal_mode"),
        json!([{"journal_mode":"wal"}])
    );
    assert_eq!(query(&db, "PRAGMA synchronous"), json!([{"synchronous":1}]));
    assert_eq!(
        query(&db, "PRAGMA foreign_keys"),
        json!([{"foreign_keys":1}])
    );
    db.execute("INSERT INTO sessions(id,name,created_at,last_active_at) VALUES ('kept','保持 🦀','now','now')",[]).unwrap();
    {
        let tx = db.transaction().unwrap();
        tx.execute("INSERT INTO sessions(id,name,created_at,last_active_at) VALUES ('rolled-back','discard','now','now')",[]).unwrap();
    }
    db.backup("main", &backup, None).unwrap();
    drop(db);
    let id = dir.file_name().unwrap().to_str().unwrap();
    let result =
        observe(json!([{"op":"nativestorage.reopen","id":id,"file":path.to_str().unwrap()}]));
    assert_eq!(result[0]["version"], 77);
    assert_eq!(
        result[0]["sessions"],
        json!([{"id":"kept","name":"保持 🦀"}])
    );
    let restored = db::open_database(&backup).unwrap();
    assert_eq!(
        query(&restored, "SELECT id,name FROM sessions ORDER BY id"),
        result[0]["sessions"]
    );
}

const DUPLICATE_REPOSITORIES: &str = r#"
INSERT INTO automation_repositories (id,user_id,name,local_path,created_at,updated_at) VALUES
('keep',NULL,'oldest','/same','2026-01-01','now'),
('duplicate','','newer','/same','2026-01-02','now'),
('foreign','other','different owner','/same','2026-01-03','now');
INSERT INTO automation_plans(id,repo_id,title,created_at,updated_at) VALUES ('plan','duplicate','plan','now','now');
INSERT INTO automation_repo_proposals(id,repo_id,message,created_at,updated_at) VALUES ('proposal','duplicate','task','now','now');
INSERT INTO code_graph_indexes(id,repository_id,project_root,created_at,updated_at) VALUES ('graph','duplicate','/graph','now','now');
INSERT INTO projects(id,title,created_at,last_active_at,metadata) VALUES ('p','project','now','now','{"repositoryId":" duplicate ","repoId":"duplicate","nested":{"retained":true}}');
INSERT INTO projects(id,title,created_at,last_active_at,metadata) VALUES ('bad','untrusted','now','now','not-json');
"#;
#[test]
fn populated_repository_dedup_redirects_references_and_enforces_owner_path_uniqueness() {
    let calls = observe(
        json!([{"op":"nativestorage.prefixes","id":uuid::Uuid::new_v4().to_string(),"versions":[61],"seed":DUPLICATE_REPOSITORIES}]),
    );
    let fixture = &calls[0][0];
    let native = db::open_database(Path::new(fixture["native"].as_str().unwrap())).unwrap();
    let reference = db::open_database(Path::new(fixture["reference"].as_str().unwrap())).unwrap();
    db::migrate_database(&native).unwrap();
    for sql in [
        "SELECT id,user_id,local_path FROM automation_repositories ORDER BY id",
        "SELECT id,repo_id FROM automation_plans",
        "SELECT id,repo_id FROM automation_repo_proposals",
        "SELECT id,repository_id FROM code_graph_indexes",
    ] {
        assert_eq!(query(&native, sql), query(&reference, sql));
    }
    assert_eq!(
        query(
            &native,
            "SELECT id FROM automation_repositories ORDER BY id"
        ),
        json!([{"id":"foreign"},{"id":"keep"}])
    );
    let metadata = |db: &rusqlite::Connection| -> Value {
        serde_json::from_str(
            &db.query_row("SELECT metadata FROM projects WHERE id='p'", [], |r| {
                r.get::<_, String>(0)
            })
            .unwrap(),
        )
        .unwrap()
    };
    assert_eq!(metadata(&native), metadata(&reference));
    assert_eq!(metadata(&native)["repositoryId"], "keep");
    assert_eq!(metadata(&native)["repoId"], "keep");
    assert_eq!(
        native
            .query_row("SELECT metadata FROM projects WHERE id='bad'", [], |r| {
                r.get::<_, String>(0)
            })
            .unwrap(),
        "not-json"
    );
    assert!(native.execute("INSERT INTO automation_repositories (id,user_id,name,local_path,created_at,updated_at) VALUES ('blocked',NULL,'duplicate','/same','now','now')",[]).is_err());
}
#[test]
fn reference_null_metadata_failure_is_preserved_without_marking_migration_applied() {
    let seed = format!(
        "{DUPLICATE_REPOSITORIES} INSERT INTO projects(id,title,created_at,last_active_at,metadata) VALUES ('null','null','now','now','null');"
    );
    let calls = observe(
        json!([{"op":"nativestorage.prefixes","id":uuid::Uuid::new_v4().to_string(),"versions":[61],"seed":seed,"expectedFailure":true}]),
    );
    let fixture = &calls[0][0];
    assert!(
        fixture["migrationError"]
            .as_str()
            .unwrap()
            .contains("Database migration 62")
    );
    let native = db::open_database(Path::new(fixture["native"].as_str().unwrap())).unwrap();
    assert_eq!(db::migrate_database(&native).unwrap_err().id, 62);
    assert_eq!(db::schema_version(&native), 61);
}
#[test]
fn ecmascript_path_whitespace_preserves_bom_and_nel_reference_behavior() {
    let home = directory();
    let calls = observe(json!([
        {"op":"nativestorage.paths","id":"bom","settings":{"JAIT_STATE_DIR":format!("\u{feff}{}\u{feff}",home.display()),"JAIT_DB_PATH":"\u{feff}fixture.db\u{feff}"}},
        {"op":"nativestorage.paths","id":"nel","settings":{"JAIT_STATE_DIR":"\u{85}/fixture\u{85}"}}
    ]));
    assert_eq!(
        state_directory::state_directory(
            &home,
            Some(&format!("\u{feff}{}\u{feff}", home.display()))
        )
        .unwrap(),
        home
    );
    assert_eq!(calls[0]["database"], "fixture.db");
    assert_eq!(
        calls[1]["error"],
        state_directory::state_directory(&home, Some("\u{85}/fixture\u{85}"))
            .unwrap_err()
            .to_string()
    );
}
