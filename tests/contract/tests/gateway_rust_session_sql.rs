#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::services::session_sql::SessionSqlService;
use rusqlite::Connection;
use serde_json::{Value, json};
use std::path::PathBuf;
const SEED: &str = r#"
CREATE TABLE sessions (id TEXT PRIMARY KEY, name TEXT, status TEXT, created_at TEXT);
INSERT INTO sessions VALUES ('s1','first','idle','2026-01-01'),('s2','second','running','2026-01-02'),('s3','third','idle','2026-01-02');
CREATE TABLE agent_threads (id TEXT,session_id TEXT);
INSERT INTO agent_threads VALUES ('t1','s1'),('t2','s1'),('t3','s2');
CREATE TABLE empty (id INTEGER, note TEXT, payload BLOB, value REAL);
CREATE TABLE users (id TEXT,password_hash TEXT);INSERT INTO users VALUES ('fixture','never-expose-fixture');
CREATE TABLE user_secrets (key TEXT);CREATE TABLE user_settings (key TEXT);
CREATE TABLE automation_repositories (token TEXT);CREATE TABLE mobile_push_registrations (token TEXT);
CREATE TABLE consent_log (decision TEXT);INSERT INTO consent_log VALUES ('approved');
CREATE TABLE _migrations (id INTEGER);CREATE TABLE notes_fts_data (id INTEGER);CREATE TABLE notes_fts_idx (id INTEGER);
CREATE VIRTUAL TABLE text_fts USING fts5(content);
CREATE TABLE "escaped name" ("quoted column" TEXT);INSERT INTO "escaped name" VALUES ('value');
ALTER TABLE sessions ADD COLUMN user_id TEXT;
ALTER TABLE sessions ADD COLUMN last_active_at TEXT;
UPDATE sessions SET user_id='owner',last_active_at=created_at;
CREATE TABLE messages (id TEXT,session_id TEXT,role TEXT,content TEXT,created_at TEXT);
INSERT INTO messages VALUES ('m1','s1','user','hello','2026-02-01'),('m2','s1','assistant','response','2026-02-02'),('m3','s2','user','question','2026-02-02');
CREATE TABLE updated_messages (id INTEGER PRIMARY KEY,note TEXT);INSERT INTO updated_messages VALUES (1,'probe');
CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY,data BLOB);INSERT INTO adv_blob_test VALUES (1,x'001122ff');
CREATE TABLE writefile_log (id INTEGER PRIMARY KEY,note TEXT);INSERT INTO writefile_log VALUES(1,'safe');
CREATE TABLE "uſers" (note TEXT);INSERT INTO "uſers" VALUES ('ordinary fixture');
CREATE TABLE "user_ſecrets" (note TEXT);INSERT INTO "user_ſecrets" VALUES ('ordinary fixture');
CREATE TABLE many (n INTEGER);WITH RECURSIVE x(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM x WHERE n<250) INSERT INTO many SELECT n FROM x;
CREATE TABLE adv_big (id INTEGER PRIMARY KEY,filler TEXT);INSERT INTO adv_big SELECT n,'fixture' FROM many;
"#;
fn compare(steps: Vec<Value>) {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap();
    let expected=internal_driver::call(&root,&root.join(".jait/artifacts/gateway-rust/session-sql-engine/contracts").join(uuid::Uuid::new_v4().to_string()),json!({"version":1,"calls":[{"op":"nativesessionsql.run","seed":SEED,"steps":steps.clone()}]}),&||false).unwrap()[0].clone();
    let connection = Connection::open_in_memory().unwrap();
    connection.execute_batch(SEED).unwrap();
    let mut service = SessionSqlService::new(&connection);
    let mut results = vec![];
    for step in &steps {
        let result = match step["op"].as_str() {
            Some("schema") => service.schema(),
            Some("reset") => {
                service = SessionSqlService::new(&connection);
                Value::Null
            }
            Some("exec") => {
                connection
                    .execute_batch(step["sql"].as_str().unwrap())
                    .unwrap();
                Value::Null
            }
            _ => service
                .query(&step["input"])
                .unwrap_or_else(|error| json!({"thrown":error})),
        };
        results.push(result);
    }
    let mut stmt = connection
        .prepare("SELECT id, name FROM sessions ORDER BY id")
        .unwrap();
    let remaining = stmt
        .query_map([], |row| {
            Ok(json!({"id":row.get::<_,String>(0)?,"name":row.get::<_,String>(1)?}))
        })
        .unwrap()
        .collect::<Result<Vec<_>, _>>()
        .unwrap();
    let actual = json!({"results":results,"remaining":remaining});
    for (i, (actual, expected)) in actual["results"]
        .as_array()
        .unwrap()
        .iter()
        .zip(expected["results"].as_array().unwrap())
        .enumerate()
    {
        assert_eq!(actual, expected, "step {}: {}", i, steps[i]);
    }
    assert_eq!(actual["remaining"], expected["remaining"]);
}
fn query(sql: &str) -> Value {
    json!({"input":{"sql":sql}})
}
#[test]
fn real_sql_schema_projection_state_and_json_safe_data() {
    compare(vec![
        json!({"op":"schema"}),
        query("SELECT id, name FROM sessions ORDER BY id"),
        query("WITH x AS (SELECT id FROM sessions) SELECT * FROM x ORDER BY id"),
        query(
            "SELECT substr(created_at,1,10) AS day,COUNT(*) AS n FROM sessions GROUP BY day ORDER BY day",
        ),
        query(
            "SELECT s.id,COUNT(t.id) AS n FROM sessions s LEFT JOIN agent_threads t ON t.session_id=s.id GROUP BY s.id ORDER BY s.id",
        ),
        query("SELECT note AS renamed, id FROM empty"),
        query("SELECT 1 AS duplicate,2 AS duplicate"),
        query("SELECT 1 AS duplicate,2 AS duplicate WHERE 0"),
        query("SELECT 1 AS '20',2 AS '2',3 AS '1',4 AS a"),
        query("SELECT 1 AS '20',2 AS '2',3 AS '1',4 AS a WHERE 0"),
        query("SELECT x'001122' AS bytes,NULL AS absent,1.5 AS value"),
        query("SELECT 9007199254740993 AS large"),
        query("SELECT ? AS parameter"),
        query("SELECT 1 AS __proto__, 2 AS constructor"),
        query("SELECT 'users delete; drop' AS text"),
        query("SELECT * FROM consent_log"),
        query("SELECT * FROM \"escaped name\""),
        json!({"op":"schema"}),
        json!({"op":"exec","sql":"CREATE TABLE new_table (created_at TEXT)"}),
        json!({"op":"reset"}),
        query("SELECT 1 AS after_reset"),
    ]);
}
#[test]
fn mutation_and_sensitive_table_policy_cannot_change_seeded_rows() {
    let mut steps = vec![];
    for sql in [
        "DELETE FROM sessions",
        "UPDATE sessions SET name='bad'",
        "INSERT INTO sessions VALUES ('s4','bad','bad','bad')",
        "DROP TABLE sessions",
        "PRAGMA journal_mode=OFF",
        "ATTACH DATABASE ':memory:' AS other",
        "DETACH other",
        "BEGIN",
        "COMMIT",
        "END",
        "VACUUM",
        "REINDEX",
        "ANALYZE",
        "SAVEPOINT x",
        "RELEASE x",
        "SELECT 1;DELETE FROM sessions",
        "SELECT 1;--comment\nSELECT 2",
        "WITH x AS (SELECT 1) DELETE FROM sessions",
        "WITH x AS (DELETE FROM sessions RETURNING *) SELECT * FROM x",
        "WITH x AS (SELECT 1),y AS (UPDATE sessions SET name='bad' RETURNING *) SELECT * FROM x",
        "SELECT * FROM pragma_table_info('sessions')",
        "SELECT * FROM \"PrAgMa_JoUrNaL_mOdE\"('OFF')",
    ] {
        steps.push(query(sql));
    }
    for table in [
        "users",
        "user_secrets",
        "user_settings",
        "automation_repositories",
        "mobile_push_registrations",
    ] {
        for spelling in [
            table.to_string(),
            table.to_uppercase(),
            format!("\"{table}\""),
            format!("[{table}]"),
            format!("`{table}`"),
        ] {
            steps.push(query(&format!("SELECT * FROM {spelling}")));
            steps.push(query(&format!(
                "WITH x AS (SELECT * FROM {spelling}) SELECT * FROM x"
            )));
        }
        steps.push(query(&format!("SELECT 1 AS {table}")));
        steps.push(query(&format!("SELECT 1 /* {table} */")));
    }
    steps.push(query("SELECT id,name FROM sessions ORDER BY id"));
    compare(steps);
}
#[test]
fn banned_functions_quoted_calls_comments_and_prefixes() {
    let mut steps = vec![];
    for function in [
        "writefile",
        "readfile",
        "fts3_tokenizer",
        "zipfile",
        "sqlar",
        "load_extension",
        "sqlite_load_extension",
    ] {
        for spelling in [
            function.into(),
            function.to_uppercase(),
            format!("\"{function}\""),
            format!("[{function}]"),
            format!("`{function}`"),
        ] {
            steps.push(query(&format!(
                "SELECT {spelling} /* gap */ ('fixture-nonexistent')"
            )));
        }
        steps.push(query(&format!("SELECT '{function}(secret)' AS name")));
        steps.push(query(&format!(
            "WITH {function} AS (SELECT 1 AS n) SELECT n FROM {function}"
        )));
    }
    compare(steps);
}
#[test]
fn row_cap_clamps_limits_retains_truncation_and_handles_errors() {
    let mut steps = vec![];
    for sql in [
        "SELECT n FROM many ORDER BY n",
        "SELECT n FROM many ORDER BY n LIMIT 250",
        "SELECT n FROM many ORDER BY n LIMIT -1",
        "SELECT n FROM many ORDER BY n LIMIT +5",
        "SELECT n FROM many ORDER BY n LIMIT 0",
        "SELECT n FROM many ORDER BY n LIMIT 5 OFFSET 2",
        "WITH x AS (SELECT n FROM many LIMIT 8) SELECT n FROM x",
        "SELECT n FROM many WHERE n<10 UNION ALL SELECT n FROM many WHERE n<3 LIMIT 8",
        "SELECT id FROM sessions;",
        "SELECT id FROM sessions;;;",
        "SELECT * FROM no_such_table",
        "SELECT missing FROM sessions",
        "SELECT 1 +",
        "SELECT 'unterminated",
        "-- comment only",
        "/* comment only */",
        "",
        "\u{feff}\n\t",
    ] {
        for max in [
            json!(1),
            json!(2.9),
            json!(0),
            json!(-1),
            json!(500),
            Value::Null,
            json!("2"),
        ] {
            steps.push(json!({"input":{"sql":sql,"maxRows":max}}));
        }
    }
    // Keep request/output under the isolated actual-source bridge ceilings.
    for chunk in steps.chunks(30) {
        compare(chunk.to_vec());
    }
    compare(vec![
        json!({"input":null}),
        json!({"input":{}}),
        json!({"input":{"sql":false}}),
        json!({"input":{"sql":[]}}),
    ]);
}

#[test]
fn queries_from_original_normal_and_adversarial_suites_match_actual_service() {
    let cases: Vec<Value> = serde_json::from_str(include_str!(
        "../vectors/native-session-sql-source-cases.json"
    ))
    .unwrap();
    assert_eq!(cases.len(), 195);
    for chunk in cases.chunks(20) {
        compare(
            chunk
                .iter()
                .map(|c| query(c["sql"].as_str().unwrap()))
                .collect(),
        );
    }
}

#[test]
fn failures_after_the_visible_row_cap_are_not_masked_and_queries_recover() {
    compare(vec![
        query("SELECT * FROM users"),
        query("SELECT * FROM missing"),
        json!({"op":"schema"}),
        json!({"input":{"sql":"SELECT CASE WHEN n>3 THEN json('invalid') ELSE n END AS x FROM many LIMIT -1","maxRows":1}}),
        query("SELECT 1 AS recovered"),
        query("SELECT * FROM text_fts"),
        json!({"input":{"sql":"SELECT n FROM many ORDER BY n LIMIT 5, 250","maxRows":2}}),
        json!({"input":{"sql":"SELECT n FROM many ORDER BY n /* LIMIT 999 */ LIMIT 999","maxRows":2}}),
    ]);
}

#[tokio::test]
async fn real_native_tool_dispatches_through_bounded_sqlite_worker() {
    use jait_gateway::{
        db::worker::DatabaseWorker, services::session_sql::SessionSqlWorker,
        tools::session_sql::SessionSqlTool,
    };
    let steps = vec![
        json!({"op":"tool","input":{"mode":"schema","sql":"DELETE FROM sessions"}}),
        json!({"op":"tool","input":{"sql":"SELECT n FROM many ORDER BY n LIMIT -1","max_rows":2}}),
        json!({"op":"tool","input":{"sql":"SELECT name FROM sessions ORDER BY id"}}),
        json!({"op":"tool","input":{"sql":"SELECT * FROM users"}}),
        json!({"op":"tool","input":{"sql":"DELETE FROM sessions"}}),
        json!({"op":"tool","input":{"sql":"SELECT 1 +"}}),
        json!({"op":"tool","input":{}}),
    ];
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap();
    let expected=internal_driver::call(&root,&root.join(".jait/artifacts/gateway-rust/session-sql-engine/worker-contract").join(uuid::Uuid::new_v4().to_string()),json!({"version":1,"calls":[{"op":"nativesessionsql.run","seed":SEED,"steps":steps.clone()}]}),&||false).unwrap()[0].clone();
    let connection = Connection::open_in_memory().unwrap();
    connection.execute_batch(SEED).unwrap();
    let worker = DatabaseWorker::new(connection, std::num::NonZeroU16::new(2).unwrap()).unwrap();
    let tool = SessionSqlTool::with_service(SessionSqlWorker::new(worker.clone()));
    for (step, expected) in steps.iter().zip(expected["results"].as_array().unwrap()) {
        assert_eq!(
            &tool.execute(&step["input"]).await.unwrap(),
            expected,
            "{step}"
        );
    }
    let remaining =
        worker
            .run(|connection| {
                Ok(connection
                    .query_row("SELECT count(*) FROM sessions", [], |r| r.get::<_, i64>(0))?)
            })
            .await
            .unwrap();
    assert_eq!(remaining, 3);
    worker.shutdown().await.unwrap();
}
#[tokio::test(flavor = "current_thread")]
async fn cancellation_before_worker_dispatch_keeps_first_success_state() {
    use jait_gateway::{
        db::worker::DatabaseWorker, services::session_sql::SessionSqlWorker,
        tools::session_sql::SessionSqlTool,
    };
    use std::{
        sync::{Arc, mpsc},
        time::Duration,
    };
    let connection = Connection::open_in_memory().unwrap();
    connection.execute_batch(SEED).unwrap();
    let worker = DatabaseWorker::new(connection, std::num::NonZeroU16::new(2).unwrap()).unwrap();
    let (started, start) = tokio::sync::oneshot::channel();
    let (release, wait) = mpsc::channel();
    struct Release(mpsc::Sender<()>);
    impl Drop for Release {
        fn drop(&mut self) {
            let _ = self.0.send(());
        }
    }
    let release = Release(release);
    let blocked = worker.clone();
    let task = tokio::spawn(async move {
        blocked
            .run(move |_| {
                let _ = started.send(());
                wait.recv().unwrap();
                Ok(())
            })
            .await
    });
    start.await.unwrap();
    let service = SessionSqlWorker::new(worker.clone());
    let tool = Arc::new(SessionSqlTool::with_service(service.clone()));
    let queued = tool.clone();
    let mut cancelled = tokio::spawn(async move {
        queued
            .execute(&json!({"sql":"SELECT 1 AS cancelled"}))
            .await
    });
    assert!(
        tokio::time::timeout(Duration::from_millis(25), &mut cancelled)
            .await
            .is_err()
    );
    cancelled.abort();
    assert!(cancelled.await.unwrap_err().is_cancelled());
    drop(release);
    task.await.unwrap().unwrap();
    let first = service
        .query(json!({"sql":"SELECT 2 AS first"}))
        .await
        .unwrap();
    assert!(first["data"].get("tables").is_some());
    let second = service
        .query(json!({"sql":"SELECT 3 AS second"}))
        .await
        .unwrap();
    assert!(second["data"].get("tables").is_none());
    worker.shutdown().await.unwrap();
    assert!(service.query(json!({"sql":"SELECT 4"})).await.is_err());
}

#[test]
fn legacy_ascii_case_folding_keeps_distinct_unicode_identifiers() {
    compare(vec![
        query("SELECT * FROM \"uſers\""),
        query("SELECT * FROM \"user_ſecrets\""),
        query("SELECT 1 AS uſers"),
        query("SELECT * FROM USERS"),
        query("SELECT * FROM USER_SECRETS"),
    ]);
}

#[test]
fn first_keyword_and_literal_only_inputs_keep_exact_failures() {
    compare(
        [
            "VALUES(1)",
            "EXPLAIN SELECT 1",
            "42",
            ";",
            "'literal'",
            "[select]",
            "/* allowed leading comment */ SELECT 1",
        ]
        .into_iter()
        .map(query)
        .collect(),
    );
}
