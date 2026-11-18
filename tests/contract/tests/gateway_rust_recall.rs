#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::{
    db,
    memory::{
        engine::{MemoryEngine, MemoryTime, SaveMemoryInput},
        entries::{MemoryBackend, MemoryEntry, MemoryScope},
        sqlite_backend::SqliteMemoryBackend,
    },
};
use serde_json::{Value, json};
use std::{
    collections::{HashMap, HashSet},
    fs,
    path::PathBuf,
};
const NOW: &str = "2026-10-18T12:00:00.000Z";
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}
fn fixture() -> PathBuf {
    let dir = root()
        .join(".jait/artifacts/gateway-rust/native-recall")
        .join(uuid::Uuid::new_v4().to_string());
    fs::create_dir_all(&dir).unwrap();
    dir
}
fn canonical(
    id: &str,
    initial: &HashSet<String>,
    ids: &mut HashMap<String, String>,
    serial: &mut usize,
) -> String {
    if initial.contains(id) {
        return id.into();
    }
    assert_eq!(id.len(), 21);
    assert!(
        id.bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'_' || c == b'-')
    );
    ids.entry(id.into())
        .or_insert_with(|| {
            *serial += 1;
            format!("memory-{serial}")
        })
        .clone()
}
fn normalize(
    value: Value,
    initial: &HashSet<String>,
    ids: &mut HashMap<String, String>,
    serial: &mut usize,
) -> Value {
    match value {
        Value::Array(values) => Value::Array(
            values
                .into_iter()
                .map(|v| normalize(v, initial, ids, serial))
                .collect(),
        ),
        Value::Object(mut value)
            if value.contains_key("createdAt") && value.contains_key("content") =>
        {
            let id = canonical(value["id"].as_str().unwrap(), initial, ids, serial);
            value.insert("id".into(), json!(id));
            Value::Object(value)
        }
        value => value,
    }
}
fn scenario(mut input: Value) -> Value {
    let dir = fixture();
    let log_enabled = input["logs"] == true;
    if log_enabled {
        input["logDir"] = json!(dir.join("reference/daily"));
    }
    input["op"] = json!("nativerecall.engine");
    input["now"] = json!(NOW);
    let expected = internal_driver::call(
        &root(),
        &dir,
        json!({"version":1,"calls":[input.clone()]}),
        &|| false,
    )
    .unwrap()[0]
        .clone();
    let db = db::open_database(std::path::Path::new(":memory:")).unwrap();
    db::migrate_database(&db).unwrap();
    let backend = SqliteMemoryBackend::with_time(&db, NOW);
    let entries: Vec<MemoryEntry> =
        serde_json::from_value(input.get("entries").cloned().unwrap_or(json!([]))).unwrap();
    let initial = entries.iter().map(|v| v.id.clone()).collect::<HashSet<_>>();
    for entry in entries {
        backend.save(&entry).unwrap();
    }
    if let Some(sql) = input["sql"].as_str() {
        db.execute_batch(sql).unwrap();
    }
    let log_dir = dir.join("native/daily");
    if log_enabled && input["blockLog"] == true {
        fs::create_dir_all(log_dir.parent().unwrap()).unwrap();
        fs::write(&log_dir, "blocked").unwrap();
    }
    if log_enabled && let Some(curated) = input["curated"].as_str() {
        fs::create_dir_all(log_dir.parent().unwrap()).unwrap();
        fs::write(log_dir.parent().unwrap().join("MEMORY.md"), curated).unwrap();
    }
    let engine =
        MemoryEngine::new(backend, log_enabled.then_some(log_dir.clone())).with_clock(|| {
            MemoryTime {
                iso: NOW.into(),
                millis: 1792324800000,
            }
        });
    let mut ids: HashMap<String, String> = HashMap::new();
    let mut serial = 0;
    let mut results = vec![];
    for step in input["steps"].as_array().unwrap() {
        let scope: Option<MemoryScope> = serde_json::from_value(step["scope"].clone()).unwrap();
        let result: Result<Value, ()> = match step["op"].as_str().unwrap() {
            "save" => engine
                .save(serde_json::from_value::<SaveMemoryInput>(step["data"].clone()).unwrap())
                .map(|v| json!(v))
                .map_err(|_| ()),
            "search" => engine
                .search(
                    step["query"].as_str().unwrap(),
                    step["limit"].as_f64(),
                    scope.as_ref(),
                )
                .map(|v| json!(v))
                .map_err(|_| ()),
            "list" => engine
                .list(scope.as_ref())
                .map(|v| json!(v))
                .map_err(|_| ()),
            "forget" => {
                let key = step["id"].as_str().unwrap();
                let id = ids
                    .iter()
                    .find(|(_, v)| v.as_str() == key)
                    .map(|(k, _)| k.as_str())
                    .unwrap_or(key);
                engine.forget(id).map(|v| json!(v)).map_err(|_| ())
            }
            "expire" => engine
                .forget_expired(step["now"].as_str())
                .map(|v| json!(v))
                .map_err(|_| ()),
            "flush" => engine
                .flush_pre_compaction(
                    step["sessionId"].as_str().unwrap(),
                    &serde_json::from_value::<Vec<String>>(step["snippets"].clone()).unwrap(),
                )
                .map(|v| json!(v))
                .map_err(|_| ()),
            "sql" => db
                .execute_batch(step["sql"].as_str().unwrap())
                .map(|_| Value::Null)
                .map_err(|_| ()),
            _ => panic!("unknown recall step"),
        };
        results.push(normalize(
            result.unwrap_or_else(|_| json!({"error":true})),
            &initial,
            &mut ids,
            &mut serial,
        ));
    }
    let rows=(||->rusqlite::Result<Value>{
        let mut statement=db.prepare("SELECT id,scope,content,source_type,source_id,source_surface,created_at,updated_at,expires_at,embedding FROM memories ORDER BY rowid")?;
        let rows=statement.query_map([],|r|Ok(json!({"id":r.get::<_,String>(0)?,"scope":r.get::<_,String>(1)?,"content":r.get::<_,String>(2)?,"source_type":r.get::<_,String>(3)?,"source_id":r.get::<_,String>(4)?,"source_surface":r.get::<_,String>(5)?,"created_at":r.get::<_,String>(6)?,"updated_at":r.get::<_,String>(7)?,"expires_at":r.get::<_,Option<String>>(8)?,"embedding":r.get::<_,String>(9)?})))?.collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(json!(rows.into_iter().map(|mut row|{row["id"]=json!(canonical(row["id"].as_str().unwrap(),&initial,&mut ids,&mut serial));row}).collect::<Vec<_>>()))
    })().unwrap_or_else(|_|json!({"error":true}));
    let mut files = serde_json::Map::new();
    if log_enabled {
        if log_dir.is_dir() {
            for file in fs::read_dir(&log_dir).unwrap() {
                let file = file.unwrap();
                files.insert(
                    file.file_name().to_str().unwrap().into(),
                    json!(fs::read_to_string(file.path()).unwrap()),
                );
            }
        }
        let curated = log_dir.parent().unwrap().join("MEMORY.md");
        if curated.exists() {
            files.insert(
                "../MEMORY.md".into(),
                json!(fs::read_to_string(curated).unwrap()),
            );
        }
    }
    let actual = json!({"results":results,"rows":rows,"files":files});
    assert_eq!(actual, expected, "fixture: {}", dir.display());
    actual
}
fn save(content: &str, kind: &str, id: &str, scope: &str) -> Value {
    json!({"op":"save","data":{"content":content,"scope":scope,"source":{"type":kind,"id":id,"surface":"chat"}}})
}
fn entry(id: &str, content: &str, scope: &str, updated: &str) -> Value {
    json!({"id":id,"scope":scope,"content":content,"source":{"type":"tool","id":format!("source-{id}"),"surface":"chat"},"createdAt":"2020-01-01T00:00:00.000Z","updatedAt":updated})
}
#[test]
fn replacements_preserve_identity_creation_scope_and_source_precedence() {
    let mut expiry = save("completely different content", "user", "same", "project");
    expiry["data"]["expiresAt"] = json!("2027-01-01T00:00:00.000Z");
    let result = scenario(
        json!({"entries":[entry("old","Original memory content","project","2020-01-01T00:00:00.000Z")],"steps":[
            save("Original memory content","user","same","project"),
            save(" ORIGINAL  MEMORY\tCONTENT ","user","other","project"),
            expiry,
            save("completely different content","user","same","contact"),
            save("genuinely distinct durable instruction","pre_compaction","s","project"),
            save("separate stable configuration fact","pre_compaction","s","project"),
            {"op":"list"},{"op":"list","scope":"contact"}
        ]}),
    );
    assert_eq!(result["rows"].as_array().unwrap().len(), 5);
    assert_eq!(
        result["results"][0]["createdAt"],
        "2020-01-01T00:00:00.000Z"
    );
    assert_ne!(result["results"][2]["id"], "old");
}
#[test]
fn lexical_replacement_threshold_and_empty_or_unicode_content() {
    let base = "alpha bravo charlie delta echo foxtrot golf hotel india juliet";
    let result = scenario(json!({"steps":[
        save(base,"pre_compaction","s","project"),
        save("alpha bravo charlie delta echo foxtrot golf hotel india kilo","pre_compaction","s","project"),
        save("alpha bravo charlie delta echo foxtrot golf lima mike kilo","pre_compaction","s","project"),
        save("","tool","same","project"),save("   ","tool","same","project"),
        save("US USS SS ports port","pre_compaction","s","contact"),
        save("us uss ss ports port","pre_compaction","s","contact"),
        save("\u{feff}Straße\u{a0}İcon\u{85}name","tool","unicode1","project"),
        save("straße i̇con\u{85}name","tool","unicode2","project"),
        {"op":"list"}
    ]}));
    assert_eq!(result["results"][0]["id"], result["results"][1]["id"]);
    assert_ne!(result["results"][1]["id"], result["results"][2]["id"]);
}
#[test]
fn lexical_best_match_is_stable_but_matching_source_takes_priority() {
    let mut one = entry("first", "alpha beta gamma delta epsilon", "project", NOW);
    let mut two = entry(
        "second",
        "alpha beta gamma delta epsilon zeta",
        "project",
        NOW,
    );
    one["source"] = json!({"type":"tool","id":"a","surface":"chat"});
    two["source"] = json!({"type":"tool","id":"b","surface":"chat"});
    scenario(json!({"entries":[one,two],"steps":[
        save("alpha beta gamma delta epsilon","tool","b","project"),
        save("alpha beta gamma delta epsilon","pre_compaction","x","project"),
        save("alpha beta gamma delta epsilon","pre_compaction","y","contact"),{"op":"list"}
    ]}));
}
#[test]
fn retrieval_uses_relative_cutoff_stable_order_freshness_scope_and_js_slice() {
    let entries = vec![
        entry(
            "old",
            "gateway Rust migration native contracts",
            "project",
            "2020-01-01T00:00:00.000Z",
        ),
        entry(
            "new",
            "gateway Rust migration native contracts",
            "project",
            NOW,
        ),
        entry(
            "contact",
            "gateway Rust migration native contracts",
            "contact",
            NOW,
        ),
        entry(
            "broad",
            "gateway app usage UI state colors settings",
            "project",
            NOW,
        ),
        entry(
            "future",
            "gateway Rust migration native contracts",
            "project",
            "2027-01-01T00:00:00.000Z",
        ),
        entry(
            "invalid",
            "gateway Rust migration native contracts",
            "project",
            "not-a-date",
        ),
    ];
    let mut steps = vec![];
    for limit in [
        json!(null),
        json!(0),
        json!(1),
        json!(2.9),
        json!(-1),
        json!(-20),
        json!(100),
    ] {
        let mut step = json!({"op":"search","query":"gateway Rust migration native contracts","scope":"project"});
        if !limit.is_null() {
            step["limit"] = limit;
        }
        steps.push(step);
    }
    steps.extend([
        json!({"op":"search","query":"gateway Rust migration native contracts","scope":"contact"}),
        json!({"op":"search","query":"unmatched"}),
        json!({"op":"search","query":"the and is"}),
    ]);
    let result = scenario(json!({"entries":entries,"steps":steps}));
    assert_eq!(result["results"][0][0]["id"], "new");
    assert_eq!(result["results"][0][1]["id"], "future");
    assert_eq!(result["results"][0].as_array().unwrap().len(), 4);
}
#[test]
fn expiry_list_forget_and_explicit_purge_match_inclusive_boundaries() {
    let mut expired = entry("expired", "stable native memory", "project", NOW);
    expired["expiresAt"] = json!(NOW);
    scenario(json!({"entries":[expired],"steps":[
        {"op":"list"},save("stable native memory","tool","live","project"),
        {"op":"search","query":"native"},{"op":"forget","id":"memory-1"},{"op":"forget","id":"memory-1"},
        {"op":"expire"},{"op":"list"}
    ]}));
}
#[test]
fn precompaction_extracts_durable_facts_and_preserves_twenty_fact_limit() {
    let snippets = vec![
        "[USER] Remember that The gateway always runs on the configured home server.",
        "the GATEWAY always runs on the configured home server.",
        "[assistant] I think we should update the service now.",
        "Please always write durable test output files in the project.",
        "Run the configured workflow for this app.",
        "The build should use the configured local cache?",
        "This process should be completed today.",
        "Native fixtures must save artifacts under the project root.",
        "The system is configured to store durable files locally.",
        "Remember: Project instructions live in the repository root.",
        "Configuration belongs in the user settings database.",
        "Store the changes and continue.",
        "[tool] remember that memory key should be stable across refresh.",
        "Konfiguration should use Unicode-safe word matching.",
    ];
    let result = scenario(
        json!({"steps":[{"op":"flush","sessionId":"s","snippets":snippets},{"op":"flush","sessionId":"t","snippets":snippets},{"op":"list"}]}),
    );
    assert_eq!(result["results"][0], 7);
    let snippets = (0..30)
        .map(|i| {
            format!("Each independent native setting_{i} always belongs in configuration_{i}.")
        })
        .collect::<Vec<_>>();
    let result =
        scenario(json!({"steps":[{"op":"flush","sessionId":"limit","snippets":snippets}]}));
    assert_eq!(result["results"][0], 20);
}
#[test]
fn memory_logs_use_original_creation_day_and_suppress_normalized_or_curated_duplicates() {
    scenario(
        json!({"logs":true,"entries":[entry("old","Original durable memory content","project","2020-01-01T00:00:00.000Z")],"steps":[
            save("Original durable memory content","tool","source-old","project"),
            save("ORIGINAL\tDURABLE memory content","tool","source-old","project"),
            save("replacement stable memory content","tool","source-old","project"),
            save("replacement stable memory content","tool","source-old","project"),
            save("brand new distinct personal preference","user","new","contact"),
            save("Original durable memory content","tool","source-old","project")
        ]}),
    );
    scenario(
        json!({"logs":true,"curated":"# Custom curated file\n- [project] New memory (source=user:seed@chat)\n","steps":[save("New memory","user","seed","project")]}),
    );
}
#[test]
fn backend_and_log_failures_expose_durable_partial_effects_without_fake_success() {
    for sql in [
        "CREATE TRIGGER refuse BEFORE INSERT ON memories BEGIN SELECT RAISE(ABORT,'fixture'); END;",
        "DROP TABLE memories;",
        "CREATE TRIGGER refuse BEFORE UPDATE ON memories BEGIN SELECT RAISE(ABORT,'fixture'); END;",
    ] {
        scenario(
            json!({"entries":[entry("old","Original durable memory content","project",NOW)],"sql":sql,"logs":true,"steps":[
                save("replacement stable memory content","tool","source-old","project"),
                save("a completely different lasting fact","user","new","contact"),{"op":"list"}
            ]}),
        );
    }
    scenario(
        json!({"logs":true,"blockLog":true,"steps":[save("a stable durable persisted instruction","user","new","project"),{"op":"list"}]}),
    );
}
