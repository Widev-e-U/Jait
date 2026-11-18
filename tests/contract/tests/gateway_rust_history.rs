#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::{
    db,
    services::chat_traces::{ChatTracesOptions, ChatTracesService},
};
use serde_json::{Value, json};
use std::{
    fs,
    path::{Path, PathBuf},
};
fn observe(seed: &str, options: &[Value]) -> Value {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap();
    let dir = root
        .join(".jait/artifacts/gateway-rust/native-history")
        .join(uuid::Uuid::new_v4().to_string());
    fs::create_dir_all(&dir).unwrap();
    internal_driver::call(
        &root,
        &dir,
        json!({"version":1,"calls":[{"op":"nativehistory.traces","seed":seed,"options":options}]}),
        &|| false,
    )
    .unwrap()[0]
        .clone()
}
fn scenario(seed: &str, options: Vec<Value>) -> Value {
    let expected = observe(seed, &options);
    let db = db::open_database(Path::new(":memory:")).unwrap();
    db::migrate_database(&db).unwrap();
    db.execute_batch(seed).unwrap();
    let service = ChatTracesService::new(&db);
    let actual = json!(
        options
            .into_iter()
            .map(|v| service
                .traces(&serde_json::from_value::<ChatTracesOptions>(v).unwrap())
                .unwrap_or_else(|_| json!({"error":true})))
            .collect::<Vec<_>>()
    );
    assert_same(&actual, &expected, "root");
    actual
}
fn seed() -> String {
    let mut s = "INSERT INTO sessions(id,user_id,name,created_at,last_active_at) VALUES ('chat','owner','Chat','2026-01-01','2026-01-06'),('foreign','other','Foreign','2026-01-01','2026-01-06'),('unowned',NULL,NULL,'2026-01-01','2026-01-06');".to_string();
    for (id, user, session, created) in [
        ("t1", "'owner'", "chat", "01"),
        ("t2", "'owner'", "chat", "02"),
        ("t3", "'other'", "chat", "03"),
        ("t4", "NULL", "chat", "04"),
        ("t5", "'other'", "foreign", "05"),
    ] {
        s.push_str(&format!("INSERT INTO agent_threads(id,user_id,session_id,title,provider_id,created_at,updated_at) VALUES('{id}',{user},'{session}','Title {id}','fixture','2026-01-{created}','2026-01-06');"));
        for n in 1..=4 {
            s.push_str(&format!("INSERT INTO agent_thread_activities(id,thread_id,kind,summary,payload,created_at) VALUES('{id}-a{n}','{id}','message','Activity {n}','{{\"n\":{n}}}','2026-02-0{n}');"));
        }
    }
    for n in 1..=5 {
        s.push_str(&format!("INSERT INTO messages(id,session_id,role,content,tool_calls,segments,context_flow,thinking,created_at) VALUES('m{n}','chat','assistant','Message {n}','[{{\"n\":{n}}}]','[\"segment\"]','{{\"round\":{n}}}','reasoning','2026-01-0{n}');"));
    }
    s
}
#[test]
fn traces_enforce_session_and_thread_owner_filters_and_report_missing_chat_uniformly() {
    let out = scenario(
        &seed(),
        vec![
            json!({"chatId":"chat","userId":"owner"}),
            json!({"chatId":"chat"}),
            json!({"chatId":"foreign","userId":"owner"}),
            json!({"chatId":"missing","userId":"owner"}),
            json!({"chatId":"unowned","userId":"owner"}),
            json!({"chatId":"unowned"}),
            json!({"chatId":"chat","userId":""}),
        ],
    );
    assert_eq!(
        out[0]["counts"],
        json!({"messages":5,"threads":2,"threadActivities":8})
    );
    assert_eq!(out[1]["counts"]["threads"], 4);
    for n in [2, 3, 4, 6] {
        assert_eq!(out[n]["found"], false);
        assert_eq!(
            out[n]["counts"],
            json!({"messages":0,"threads":0,"threadActivities":0})
        );
    }
    assert_eq!(out[5]["found"], true);
}
#[test]
fn traces_return_recent_messages_and_per_thread_activities_in_chronological_order() {
    let out = scenario(
        &seed(),
        vec![
            json!({"chatId":"chat","userId":"owner","messageLimit":2,"activityLimit":2}),
            json!({"chatId":"chat","messageLimit":0.9,"activityLimit":0.9}),
        ],
    );
    assert_eq!(out[0]["messages"][0]["id"], "m4");
    assert_eq!(out[0]["messages"][1]["id"], "m5");
    assert_eq!(out[0]["threads"][0]["activities"][0]["id"], "t1-a3");
    assert_eq!(out[0]["threads"][0]["id"], "t1");
    assert_eq!(out[1]["counts"]["messages"], 0);
    assert_eq!(out[1]["counts"]["threadActivities"], 0);
}
#[test]
fn traces_preserve_omitted_nullable_and_parsed_optional_fields() {
    let mut s = seed();
    s.push_str("UPDATE messages SET tool_calls='malformed',segments='null',context_flow='false',thinking=NULL WHERE id='m1'; UPDATE messages SET tool_calls='0',segments='\"text\"',context_flow='{}' WHERE id='m2'; UPDATE messages SET tool_calls=NULL,segments='',context_flow='broken' WHERE id='m3'; UPDATE agent_thread_activities SET payload='null' WHERE id='t1-a1'; UPDATE agent_thread_activities SET payload='bad' WHERE id='t1-a2';");
    let out = scenario(
        &s,
        vec![
            json!({"chatId":"chat"}),
            json!({"chatId":"chat","includeThinking":true,"includeContextFlow":true}),
            json!({"chatId":"chat","includeToolCalls":false,"includeThreads":false}),
            json!({"chatId":"chat","includeMessages":false}),
        ],
    );
    assert!(out[0]["messages"][0].get("toolCalls").is_none());
    assert!(out[0]["messages"][0].get("thinking").is_none());
    assert!(out[0]["messages"][0].get("contextFlow").is_none());
    assert_eq!(out[0]["messages"][0]["segments"], Value::Null);
    assert_eq!(out[0]["messages"][1]["toolCalls"], 0);
    assert_eq!(out[1]["messages"][0]["thinking"], Value::Null);
    assert_eq!(out[1]["messages"][0]["contextFlow"], false);
    assert!(out[1]["messages"][2].get("contextFlow").is_none());
    assert!(out[2]["messages"][1].get("segments").is_none());
    assert_eq!(out[2]["counts"]["threads"], 0);
    assert_eq!(out[3]["counts"]["messages"], 0);
}
#[test]
fn trace_limits_default_floor_and_cap_real_database_reads() {
    let s = "INSERT INTO sessions(id,created_at,last_active_at) VALUES('chat','0','0');WITH RECURSIVE n(x) AS (VALUES(0) UNION ALL SELECT x+1 FROM n WHERE x<1002) INSERT INTO messages(id,session_id,role,content,created_at) SELECT printf('m%04d',x),'chat','user','text',printf('%04d',x) FROM n;";
    for (limit, count) in [
        (json!(0), 200),
        (json!(-2), 200),
        (json!(1.9), 1),
        (json!(10000), 1000),
    ] {
        let out = scenario(
            s,
            vec![json!({"chatId":"chat","messageLimit":limit,"includeThreads":false})],
        );
        assert_eq!(out[0]["counts"]["messages"], count);
    }
}
#[test]
fn trace_activity_limit_caps_and_optional_branches_avoid_unrelated_failures() {
    let mut s = seed();
    s.push_str("WITH RECURSIVE n(x) AS (VALUES(0) UNION ALL SELECT x+1 FROM n WHERE x<2000) INSERT INTO agent_thread_activities(id,thread_id,kind,summary,created_at) SELECT printf('extra%04d',x),'t1','message','a',printf('2027-%04d',x) FROM n;");
    let out = scenario(
        &s,
        vec![
            json!({"chatId":"chat","userId":"owner","includeMessages":false,"activityLimit":9999}),
        ],
    );
    assert_eq!(
        out[0]["threads"][0]["activities"].as_array().unwrap().len(),
        2000
    );
    let broken = format!("{}DROP TABLE agent_thread_activities;", seed());
    let out = scenario(
        &broken,
        vec![
            json!({"chatId":"missing"}),
            json!({"chatId":"chat","includeThreads":false}),
            json!({"chatId":"chat"}),
        ],
    );
    assert_eq!(out[0]["found"], false);
    assert_eq!(out[1]["found"], true);
    assert_eq!(out[2], json!({"error":true}));
}

fn search_observe(seed: &str, options: &[Value]) -> Value {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap();
    let dir = root
        .join(".jait/artifacts/gateway-rust/native-history")
        .join(uuid::Uuid::new_v4().to_string());
    fs::create_dir_all(&dir).unwrap();
    internal_driver::call(
        &root,
        &dir,
        json!({"version":1,"calls":[{"op":"nativehistory.search","seed":seed,"options":options}]}),
        &|| false,
    )
    .unwrap()[0]
        .clone()
}
fn search(seed: &str, options: Vec<Value>) -> Value {
    use jait_gateway::services::session_search::{
        SessionSearchOptions, SessionSearchService, Utf16Text,
    };
    let expected = search_observe(seed, &options);
    let db = db::open_database(Path::new(":memory:")).unwrap();
    db::migrate_database(&db).unwrap();
    db.execute_batch(seed).unwrap();
    let service = SessionSearchService::new(&db);
    let results = options
        .into_iter()
        .map(|o| {
            service
                .search(&serde_json::from_value::<SessionSearchOptions>(o).unwrap())
                .map(|rows| {
                    json!(
                        rows.into_iter()
                            .map(|mut r| {
                                // JSON transport cannot parse lone surrogates into Rust strings.
                                // Compare every code unit to the production String.charCodeAt result.
                                let content = std::mem::take(&mut r.content.0);
                                let snippet = std::mem::take(&mut r.snippet.0);
                                r.content = Utf16Text(vec![]);
                                r.snippet = Utf16Text(vec![]);
                                let mut value = serde_json::to_value(r).unwrap();
                                value["content"] = json!(content);
                                value["snippet"] = json!(snippet);
                                value
                            })
                            .collect::<Vec<_>>()
                    )
                })
                .unwrap_or_else(|_| json!({"error":true}))
        })
        .collect::<Vec<_>>();
    let actual = json!(results);
    assert_same(&actual, &expected, "root");
    actual
}
fn search_seed() -> String {
    let mut s = seed();
    s.push_str("UPDATE messages SET content='migration result';UPDATE agent_thread_activities SET summary='migration result';INSERT INTO messages(id,session_id,role,content,created_at) VALUES('secret','foreign','user','migration secret','2026-08-01');INSERT INTO agent_threads(id,user_id,title,provider_id,created_at,updated_at) VALUES('detached','owner','Detached','fixture','2026-01-01','2026-01-01');INSERT INTO agent_thread_activities(id,thread_id,kind,summary,created_at) VALUES('detached-a','detached','error','migration result','2026-03-01');");
    s
}
#[test]
fn search_fts_query_quotes_terms_deduplicates_after_term_budget_and_ignores_syntax() {
    use jait_gateway::services::session_search::build_fts_query;
    let queries = vec![
        "",
        "a x !",
        "東京 ÖÄ",
        "Foo OR bar* NEAR \"quoted\" -x #_id",
        "ab ab ab ab ab ab ab ab ab ab ab ab skipped",
        "KELVIN İD 123 _x",
        "first\nsecond\tFIRST",
    ];
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap();
    let dir = root
        .join(".jait/artifacts/gateway-rust/native-history")
        .join(uuid::Uuid::new_v4().to_string());
    let expected = internal_driver::call(
        &root,
        &dir,
        json!({"version":1,"calls":[{"op":"nativehistory.query","queries":queries}]}),
        &|| false,
    )
    .unwrap()[0]
        .clone();
    assert_eq!(
        json!(
            queries
                .iter()
                .map(|s| build_fts_query(s))
                .collect::<Vec<_>>()
        ),
        expected
    );
    assert_eq!(expected[4], "\"ab\"");
}
#[test]
fn search_owner_session_thread_filters_and_independent_source_flags_match() {
    let out = search(
        &search_seed(),
        vec![
            json!({"query":"migration","userId":"owner","limit":50}),
            json!({"query":"migration","userId":"other","limit":50}),
            json!({"query":"migration","userId":"","limit":50}),
            json!({"query":"migration","userId":"owner","sessionId":"foreign"}),
            json!({"query":"migration","userId":"owner","threadId":"detached"}),
            json!({"query":"migration","userId":"owner","includeMessages":false}),
            json!({"query":"migration","userId":"owner","includeThreadActivities":false}),
            json!({"query":"migration","includeMessages":false,"includeThreadActivities":false}),
        ],
    );
    assert!(
        out[0]
            .as_array()
            .unwrap()
            .iter()
            .all(|r| r["id"] != "secret")
    );
    assert_eq!(out[2], json!([]));
    assert_eq!(out[3], json!([]));
    assert_eq!(out[7], json!([]));
    assert_eq!(
        out[4]
            .as_array()
            .unwrap()
            .iter()
            .filter(|r| r["source"] == "thread_activity")
            .count(),
        1
    );
    assert!(
        out[5]
            .as_array()
            .unwrap()
            .iter()
            .all(|r| r["source"] == "thread_activity")
    );
    assert!(
        out[6]
            .as_array()
            .unwrap()
            .iter()
            .all(|r| r["source"] == "message")
    );
}
#[test]
fn search_fuses_index_ranks_and_uses_recent_timestamp_then_stable_source_ties() {
    let mut s = search_seed();
    s.push_str("UPDATE agent_thread_activities SET created_at='2026-09-01',summary='migration migration migration' WHERE id='t1-a1';UPDATE messages SET created_at='2026-09-01',content='migration migration migration' WHERE id='m1';");
    let out = search(
        &s,
        vec![
            json!({"query":"migration","userId":"owner","limit":50}),
            json!({"query":"migration","userId":"owner","limit":1}),
            json!({"query":"migration","userId":"owner","limit":1.9}),
        ],
    );
    assert_eq!(out[0][0]["source"], "message");
    assert_eq!(out[0][1]["source"], "thread_activity");
    assert_eq!(out[0][0]["score"], json!(1.0 / 61.0));
    assert_eq!(out[0][1]["score"], json!(1.0 / 61.0));
    assert_eq!(out[1], out[2]);
}
#[test]
fn search_limits_and_fts_triggers_follow_inserts_updates_deletes() {
    let s = "INSERT INTO sessions(id,user_id,created_at,last_active_at) VALUES('chat','owner','0','0');WITH RECURSIVE n(x) AS (VALUES(0) UNION ALL SELECT x+1 FROM n WHERE x<70) INSERT INTO messages(id,session_id,role,content,created_at) SELECT printf('m%04d',x),'chat','user','matching text',printf('2026-%04d',x) FROM n;DELETE FROM messages WHERE id='m0070';UPDATE messages SET content='absent' WHERE id='m0069';";
    for (limit, count) in [
        (json!(0), 10),
        (json!(-1), 10),
        (json!(0.9), 0),
        (json!(2.9), 2),
        (json!(999), 50),
    ] {
        let out = search(s, vec![json!({"query":"matching","limit":limit})]);
        assert_eq!(out[0].as_array().unwrap().len(), count);
        assert!(
            out[0]
                .as_array()
                .unwrap()
                .iter()
                .all(|r| r["id"] != "m0070" && r["id"] != "m0069")
        );
    }
}
#[test]
fn search_content_and_snippets_preserve_ecmascript_whitespace_and_utf16_boundary() {
    let mut s = search_seed();
    let content = format!("  migration\n\t{}🦀 end\u{0085}\u{feff} ", "x".repeat(1986));
    s.push_str(&format!("UPDATE messages SET content='{content}' WHERE id='m1';UPDATE agent_thread_activities SET summary='  migration\n\tresult  ',payload=' {{\"evidence\":\"🦀\"}} ' WHERE id='t1-a1';"));
    let out = search(
        &s,
        vec![
            json!({"query":"migration","userId":"owner","includeThreadActivities":false,"limit":50}),
            json!({"query":"evidence","userId":"owner","includeMessages":false}),
        ],
    );
    let row = out[0]
        .as_array()
        .unwrap()
        .iter()
        .find(|r| r["id"] == "m1")
        .unwrap();
    let units = row["content"].as_array().unwrap();
    assert_eq!(units.len(), 2000);
    assert_eq!(units[1996], 0xd83e);
    assert_eq!(units[1997], 46);
    // Verify native wire serialization itself accepts the retained lone unit.
    let encoded = serde_json::to_string(&jait_gateway::services::session_search::Utf16Text(vec![
        0xd83e, 46, 46, 46,
    ]))
    .unwrap();
    assert_eq!(encoded, "\"\\ud83e...\"");
    assert!(!out[1].as_array().unwrap().is_empty());
}
#[test]
fn search_activity_kind_whitelist_and_database_failures_are_visible() {
    let mut s = search_seed();
    s.push_str("UPDATE agent_thread_activities SET kind='tool.call' WHERE id='t1-a1';UPDATE agent_thread_activities SET kind='tool.result' WHERE id='t1-a2';UPDATE agent_thread_activities SET kind='tool.error' WHERE id='t1-a3';UPDATE agent_thread_activities SET kind='error',payload='malformed migration' WHERE id='t1-a4';");
    let out = search(
        &s,
        vec![json!({"query":"migration","userId":"owner","includeMessages":false,"limit":50})],
    );
    assert!(
        out[0]
            .as_array()
            .unwrap()
            .iter()
            .all(|r| r["id"] != "t1-a1")
    );
    let s = format!("{s}DROP TABLE messages_fts;");
    let out = search(
        &s,
        vec![
            json!({"query":"a !"}),
            json!({"query":"migration"}),
            json!({"query":"migration","includeMessages":false}),
        ],
    );
    assert_eq!(out[0], json!([]));
    assert_eq!(out[1], json!({"error":true}));
    assert!(out[2].is_array());
}

fn assert_same(actual: &Value, expected: &Value, path: &str) {
    match (actual, expected) {
        (Value::Array(a), Value::Array(b)) => {
            assert_eq!(a.len(), b.len(), "{path}: array length");
            for (i, (a, b)) in a.iter().zip(b).enumerate() {
                assert_same(a, b, &format!("{path}[{i}]"));
            }
        }
        (Value::Object(a), Value::Object(b)) => {
            assert_eq!(a.len(), b.len(), "{path}: field count");
            for (k, a) in a {
                let b = b.get(k).unwrap_or_else(|| panic!("{path}: missing {k}"));
                assert_same(a, b, &format!("{path}.{k}"));
            }
        }
        _ => assert_eq!(actual, expected, "{path}"),
    }
}
