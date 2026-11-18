#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::{
    db,
    memory::{
        entries::{MemoryBackend, MemoryScope},
        scoring::{Bm25Document, bm25_rank, bm25_tokens},
        sqlite_backend::SqliteMemoryBackend,
    },
};
use serde_json::{Value, json};
use std::{
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
        .join(".jait/artifacts/gateway-rust/native-memory")
        .join(uuid::Uuid::new_v4().to_string());
    fs::create_dir_all(&dir).unwrap();
    internal_driver::call(&root, &dir, json!({"version":1,"calls":[call]}), &|| false).unwrap()[0]
        .clone()
}
fn rows(db: &rusqlite::Connection) -> rusqlite::Result<Value> {
    let mut query = db.prepare("SELECT * FROM memories ORDER BY id")?;
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
                        rusqlite::types::ValueRef::Text(v) => {
                            json!(std::str::from_utf8(v).unwrap())
                        }
                        _ => panic!("unexpected non-text value"),
                    };
                    row.insert(key.clone(), value);
                }
                Ok(Value::Object(row))
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?
    ))
}
fn scenario(seed: &str, steps: Vec<Value>) -> Value {
    let expected =
        observe(json!({"op":"nativememory.backend","now":NOW,"seed":seed,"steps":steps}));
    let db = db::open_database(Path::new(":memory:")).unwrap();
    db::migrate_database(&db).unwrap();
    db.execute_batch(seed).unwrap();
    let backend = SqliteMemoryBackend::with_time(&db, NOW);
    let mut results = vec![];
    for step in steps {
        let value = (|| -> rusqlite::Result<Value> {
            Ok(match step["op"].as_str().unwrap() {
                "save" => {
                    backend.save(&serde_json::from_value(step["data"].clone()).unwrap())?;
                    Value::Null
                }
                "update" => {
                    backend.update(&serde_json::from_value(step["data"].clone()).unwrap())?;
                    Value::Null
                }
                "list" => {
                    let scope: Option<MemoryScope> =
                        serde_json::from_value(step["scope"].clone()).unwrap();
                    json!(backend.list(scope.as_ref())?)
                }
                "forget" => json!(backend.forget(step["id"].as_str().unwrap())?),
                "expire" => json!(backend.forget_expired(step["now"].as_str())?),
                "sql" => {
                    db.execute_batch(step["sql"].as_str().unwrap())?;
                    Value::Null
                }
                _ => panic!("unknown memory step"),
            })
        })();
        results.push(value.unwrap_or_else(|_| json!({"error":true})));
    }
    let actual =
        json!({"results":results,"rows":rows(&db).unwrap_or_else(|_|json!({"error":true}))});
    assert_eq!(actual, expected);
    actual
}
fn memory(id: &str, scope: &str, created: &str, expires: Option<&str>) -> Value {
    let mut value = json!({"id":id,"scope":scope,"content":format!("content for {id} 🦀"),"source":{"type":"tool","id":"fixture-source","surface":"chat"},"createdAt":created,"updatedAt":created});
    if let Some(expires) = expires {
        value["expiresAt"] = json!(expires)
    }
    value
}
#[test]
fn sqlite_memory_preserves_provenance_scopes_nullable_expiry_and_creation_order() {
    let first = memory("first", "project", "2020-01-01T00:00:00.000Z", None);
    let second = memory(
        "second",
        "contact",
        "2021-01-01T00:00:00.000Z",
        Some("2027-01-01T00:00:00.000Z"),
    );
    let mut update = memory("first", "contact", "new creation must be ignored", None);
    update["updatedAt"] = json!(NOW);
    update["source"] = json!({"type":"user","id":"updated-source","surface":"settings"});
    update["content"] = json!("replacement");
    scenario(
        "",
        vec![
            json!({"op":"save","data":second}),
            json!({"op":"save","data":first}),
            json!({"op":"list"}),
            json!({"op":"list","scope":"project"}),
            json!({"op":"list","scope":"contact"}),
            json!({"op":"update","data":update}),
            json!({"op":"list","scope":"contact"}),
            json!({"op":"update","data":memory("missing","project","2020",None)}),
            json!({"op":"list"}),
            json!({"op":"forget","id":"missing"}),
            json!({"op":"forget","id":"first"}),
            json!({"op":"forget","id":"first"}),
            json!({"op":"list"}),
        ],
    );
}
#[test]
fn sqlite_memory_expiry_is_exact_inclusive_and_listing_does_not_delete() {
    let values = [
        memory("past", "project", "2020", Some("2026-10-18T11:59:59.999Z")),
        memory("boundary", "contact", "2020", Some(NOW)),
        memory(
            "future",
            "project",
            "2020",
            Some("2026-10-18T12:00:00.001Z"),
        ),
        memory("forever", "contact", "2020", None),
        memory("empty", "project", "2020", Some("")),
        memory("legacy", "old-scope", "2020", Some("not-a-date")),
    ];
    let mut steps = values
        .into_iter()
        .map(|data| json!({"op":"save","data":data}))
        .collect::<Vec<_>>();
    steps.extend([
        json!({"op":"list"}),
        json!({"op":"list","scope":"project"}),
        json!({"op":"list","scope":""}),
        json!({"op":"list","scope":"old-scope"}),
        json!({"op":"expire"}),
        json!({"op":"expire"}),
        json!({"op":"expire","now":"2026-10-18T12:00:00.001Z"}),
        json!({"op":"list"}),
    ]);
    scenario("", steps);
}
#[test]
fn sqlite_memory_duplicate_and_trigger_failures_do_not_silently_modify_rows() {
    let seed = "CREATE TRIGGER reject_update BEFORE UPDATE ON memories BEGIN SELECT RAISE(ABORT,'fixture'); END; CREATE TRIGGER reject_delete BEFORE DELETE ON memories BEGIN SELECT RAISE(ABORT,'fixture'); END;";
    let entry = memory("one", "project", "2020", Some("2021"));
    scenario(
        seed,
        vec![
            json!({"op":"save","data":entry}),
            json!({"op":"save","data":entry}),
            json!({"op":"update","data":memory("one","contact","changed",None)}),
            json!({"op":"forget","id":"one"}),
            json!({"op":"expire"}),
            json!({"op":"list"}),
        ],
    );
    scenario(
        "DROP TABLE memories;",
        vec![
            json!({"op":"list"}),
            json!({"op":"expire"}),
            json!({"op":"forget","id":"missing"}),
            json!({"op":"save","data":memory("one","project","2020",None)}),
        ],
    );
}
#[test]
fn bm25_tokenization_matches_ascii_boundaries_stop_words_and_plural_folding() {
    for text in [
        "",
        "a I x us is this",
        "US USS SS icons ICON icon_s icon__",
        "Keys İcons ẞ Straße ΣΟΣ",
        "Foo-bar.foo/bar_123 00 1 _ __ s xs xss",
        "Project prefs: Build caches; network findings and ports.",
        "\u{feff}hi\u{85}there\u{a0}word",
    ] {
        assert_eq!(
            json!(bm25_tokens(text)),
            observe(json!({"op":"nativememory.tokens","text":text}))
        );
    }
}
fn ranking(query: &str, documents: Value) {
    let expected = observe(json!({"op":"nativememory.rank","query":query,"documents":documents}));
    let docs: Vec<Bm25Document<Value>> = serde_json::from_value(documents).unwrap();
    let actual = json!(bm25_rank(query, &docs));
    assert_eq!(
        actual.as_array().unwrap().len(),
        expected.as_array().unwrap().len()
    );
    for (actual, expected) in actual
        .as_array()
        .unwrap()
        .iter()
        .zip(expected.as_array().unwrap())
    {
        assert_eq!(actual["item"], expected["item"]);
        let a = actual["score"].as_f64().unwrap();
        let e = expected["score"].as_f64().unwrap();
        assert!(
            (a - e).abs() <= 1e-12 * e.abs().max(1.0),
            "BM25 numeric difference: {a} vs {e}"
        );
    }
}
#[test]
fn bm25_keeps_input_order_zero_scores_query_deduplication_and_document_length_effects() {
    let docs = json!([{"item":{"id":"long"},"text":"ports ports ports ports network network service"},{"item":null,"text":""},{"item":["short"],"text":"ports"},{"item":false,"text":"unrelated"},{"item":5,"text":"network certificate"}]);
    for query in [
        "ports",
        "ports ports ports",
        "certificate network",
        "unknown",
        "what is in this app",
        "a",
        "port service",
    ] {
        ranking(query, docs.clone());
    }
    ranking("port", json!([]));
    ranking(
        "port",
        json!([{"item":"empty","text":""},{"item":"stopwords","text":"the and is"}]),
    );
}
#[test]
fn bm25_idf_counts_each_document_once_and_handles_a_varied_corpus() {
    let docs=(0..100).map(|i|json!({"item":i,"text":format!("document_{} {} {}",i%7,"network ".repeat(i%11),if i%17==0{"rare certificate"}else{"common ports"})})).collect::<Vec<_>>();
    ranking("rare certificates network document_2", json!(docs));
}
