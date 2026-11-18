//! R07: Rust owns corpus vectors, expected outcomes, and the negative control.
use serde_json::{Value, json};
use std::{
    fs,
    io::Write,
    path::PathBuf,
    process::{Command, Stdio},
};

fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}
fn metadata() -> Value {
    serde_json::from_str(include_str!("../corpus/versioned-metadata.json")).unwrap()
}
fn action(actions: &mut Vec<Value>, key: &str, op: &str, fields: Value) {
    let mut a = fields.as_object().unwrap().clone();
    a.insert("key".into(), json!(key));
    a.insert("op".into(), json!(op));
    actions.push(Value::Object(a));
}
fn exec(actions: &mut Vec<Value>, key: &str, sql: &str) {
    action(actions, key, "exec", json!({"sql":sql}));
}
fn query(actions: &mut Vec<Value>, key: &str, sql: &str) {
    action(actions, key, "query", json!({"sql":sql}));
}
fn run(name: &str, actions: Vec<Value>, allowed_errors: &[&str]) -> Value {
    let root = root();
    let dir = root.join(".jait/artifacts/rust-continuation/recovery");
    fs::create_dir_all(&dir).unwrap();
    let evidence = if std::env::var("R07_MUTATION").is_ok() {
        format!("negative-{name}")
    } else {
        name.to_owned()
    };
    let name = evidence.as_str();
    let plan = json!({"evidence":name,"actions":actions});
    fs::write(
        dir.join(format!("{name}-plan.json")),
        serde_json::to_vec_pretty(&plan).unwrap(),
    )
    .unwrap();
    for name in ["home", "tmp", "state"] {
        fs::create_dir_all(dir.join(name)).unwrap();
    }
    let mut child =
        Command::new(std::env::var("JAIT_CONTRACT_BUN").unwrap_or_else(|_| "bun".into()))
            .arg("--no-env-file")
            .arg(root.join("tests/contract/drivers/recovery-corpus.ts"))
            .current_dir(&root)
            .env_clear()
            .env("PATH", std::env::var_os("PATH").unwrap_or_default())
            .env("HOME", dir.join("home"))
            .env("USERPROFILE", dir.join("home"))
            .env("TMPDIR", dir.join("tmp"))
            .env("TEMP", dir.join("tmp"))
            .env("TMP", dir.join("tmp"))
            .env("JAIT_STATE_DIR", dir.join("state"))
            .env("__JAIT_CLI", "1")
            .env("NODE_ENV", "test")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .unwrap();
    child
        .stdin
        .take()
        .unwrap()
        .write_all(serde_json::to_string(&plan).unwrap().as_bytes())
        .unwrap();
    let out = child.wait_with_output().unwrap();
    fs::write(dir.join(format!("{name}-stderr.log")), &out.stderr).unwrap();
    assert!(
        out.status.success(),
        "{name}: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    let result: Value = serde_json::from_slice(&out.stdout).expect("bridge observations");
    for (key, observation) in result.as_object().unwrap() {
        assert!(
            observation.get("error").is_none() || allowed_errors.contains(&key.as_str()),
            "{name}/{key}: {observation}"
        );
    }
    result
}
fn value<'a>(r: &'a Value, key: &str) -> &'a Value {
    &r[key]["value"]
}
fn file(stem: &str) -> String {
    format!("{stem}-{}.db", uuid::Uuid::new_v4())
}
fn open(a: &mut Vec<Value>, key: &str, file: &str) {
    action(a, key, "open", json!({"file":file}));
}
fn close(a: &mut Vec<Value>, key: &str) {
    action(a, key, "close", json!({}));
}
fn migrate(a: &mut Vec<Value>, key: &str) {
    action(a, key, "migrate", json!({}));
}
fn health(a: &mut Vec<Value>) {
    query(a, "integrity", "PRAGMA integrity_check");
    query(a, "fk-check", "PRAGMA foreign_key_check");
    query(a, "fk-enabled", "PRAGMA foreign_keys");
    query(a, "journal", "PRAGMA journal_mode");
}
fn assert_health(r: &Value) {
    assert_eq!(value(r, "integrity"), &json!([{"integrity_check":"ok"}]));
    assert_eq!(value(r, "fk-check"), &json!([]));
    assert_eq!(value(r, "fk-enabled"), &json!([{"foreign_keys":1}]));
    assert_eq!(value(r, "journal"), &json!([{"journal_mode":"wal"}]));
}
// No account credentials, network paths, model calls, jobs, or messages leave these synthetic DBs.
fn seeds(version: u64) -> String {
    if version == 0 {
        return String::new();
    }
    let mut sql = String::from("INSERT INTO sessions(id,name,created_at,last_active_at) VALUES ('s','synthetic-session','2026-01-01','2026-01-01');
INSERT INTO messages(id,session_id,role,content,tool_calls,created_at) VALUES ('m','s','user','synthetic-message','[]','2026-01-01');
INSERT INTO audit_log(id,timestamp,session_id,action_type,inputs) VALUES ('a','2026-01-01','s','fixture.read','{}');
INSERT INTO scheduled_jobs(id,name,cron,tool_name,input,enabled,created_at,updated_at) VALUES ('j','synthetic-disabled','0 0 * * *','fixture.noop','{}',0,'2026-01-01','2026-01-01');
INSERT INTO user_settings(user_id,theme,updated_at) VALUES ('synthetic-owner','dark','2026-01-01');\n");
    let embedding = if version == 54 || version == 55 {
        ""
    } else {
        ",embedding"
    };
    let vector = if embedding.is_empty() {
        ""
    } else {
        ",'[0.25,0.75]'"
    };
    sql.push_str(&format!("INSERT INTO memories(id,scope,content,source_type,source_id,source_surface,created_at,updated_at{embedding}) VALUES ('mem','global','synthetic-memory','fixture','s','chat','2026-01-01','2026-01-01'{vector});\n"));
    if version >= 73 {
        sql.push_str("UPDATE user_settings SET chat_streaming_action='queue' WHERE user_id='synthetic-owner';\n");
    }
    if version >= 4 {
        sql.push_str("INSERT INTO session_state VALUES ('s','fixture','{\"retained\":true}','2026-01-01');\n");
    }
    if version >= 7 {
        sql.push_str("INSERT INTO agent_threads(id,title,provider_id,created_at,updated_at) VALUES ('t','synthetic-thread','fixture-never-run','2026-01-01','2026-01-01');\n");
    }
    if version >= 68 {
        sql.push_str("INSERT INTO security_findings VALUES ('finding','synthetic-owner','scope','2026-01-01','{\"synthetic\":true}');\n");
    }
    if version >= 70 {
        sql.push_str("INSERT INTO thread_recovery VALUES ('t',2,1,'synthetic-stale');\n");
    }
    if version >= 75 {
        sql.push_str(
            "INSERT INTO agent_control VALUES ('synthetic-owner',1,'fixture',NULL,'2026-01-01');\n",
        );
    }
    sql
}
const DATA: &str = "SELECT 'session' AS domain,id,name AS payload FROM sessions WHERE id='s' UNION ALL SELECT 'message',id,content FROM messages WHERE id='m' UNION ALL SELECT 'memory',id,content FROM memories WHERE id='mem' UNION ALL SELECT 'audit',id,inputs FROM audit_log WHERE id='a' UNION ALL SELECT 'job',id,input FROM scheduled_jobs WHERE id='j' ORDER BY domain";
fn expected_data() -> Value {
    json!([
        {"domain":"audit","id":"a","payload":"{}"},
        {"domain":"job","id":"j","payload":"{}"},
        {"domain":"memory","id":"mem","payload":"synthetic-memory"},
        {"domain":"message","id":"m","payload":"synthetic-message"},
        {"domain":"session","id":"s","payload":"synthetic-session"}
    ])
}

#[test]
fn every_current_migration_prefix_upgrades_and_restores() {
    let meta = metadata();
    let mut a = vec![];
    action(&mut a, "inventory", "inventory", json!({}));
    open(&mut a, "open", &file("canonical"));
    migrate(&mut a, "migrate");
    action(&mut a, "schema", "schema", json!({}));
    health(&mut a);
    let reference = run("canonical", a, &[]);
    assert_health(&reference);
    assert_eq!(
        value(&reference, "inventory")["migrations"],
        meta["migrations"],
        "numbered migration inventory drift requires corpus review"
    );
    assert_eq!(
        value(&reference, "inventory")["sources"],
        meta["sourceSha256"],
        "source anchors drift requires corpus review"
    );
    assert_eq!(value(&reference, "migrate"), &meta["latest"]);
    assert_eq!(value(&reference, "open")["backend"], "bun:sqlite");
    let schema = value(&reference, "schema");
    assert_eq!(
        schema["tables"]
            .as_object()
            .unwrap()
            .keys()
            .collect::<Vec<_>>(),
        meta["tableCoverage"]
            .as_object()
            .unwrap()
            .keys()
            .collect::<Vec<_>>(),
        "persisted table coverage inventory drift"
    );
    assert_eq!(
        schema["tables"]["message_context_metadata"]["foreignKeys"][0]["table"],
        "messages"
    );
    assert_eq!(
        schema["tables"]["message_context_metadata"]["foreignKeys"][0]["on_delete"],
        "CASCADE"
    );
    for table in meta["requiredTables"].as_array().unwrap() {
        assert!(
            schema["tables"].get(table.as_str().unwrap()).is_some(),
            "missing table {table}"
        );
    }
    for index in meta["requiredIndexes"].as_array().unwrap() {
        assert!(
            schema["objects"]
                .as_array()
                .unwrap()
                .iter()
                .any(|o| o["type"] == "index" && o["name"] == *index),
            "missing index {index}"
        );
    }
    for prefix in 0..=meta["latest"].as_u64().unwrap() {
        let source = file(&format!("prefix-{prefix}"));
        let backup = file(&format!("backup-{prefix}"));
        let restored = file(&format!("restored-{prefix}"));
        let mut a = vec![];
        open(&mut a, "open", &source);
        action(&mut a, "prefix", "prefix", json!({"version":prefix}));
        if prefix > 0 {
            exec(&mut a, "seed", &seeds(prefix));
        }
        query(
            &mut a,
            "before-ledger",
            "SELECT id,name,applied_at FROM _migrations ORDER BY id",
        );
        if prefix > 0 {
            query(&mut a, "before-data", DATA);
        }
        action(&mut a, "before-schema", "schema", json!({}));
        action(&mut a, "backup", "backup", json!({"file":backup}));
        close(&mut a, "close-prefix");
        open(&mut a, "reopen", &source);
        migrate(&mut a, "upgrade");
        if prefix > 0 {
            query(
                &mut a,
                "message-fields",
                "SELECT session_id,role,tool_calls,created_at FROM messages WHERE id='m'",
            );
            query(
                &mut a,
                "memory-fields",
                "SELECT scope,source_type,source_id,source_surface,embedding FROM memories WHERE id='mem'",
            );
            query(
                &mut a,
                "job-fields",
                "SELECT cron,tool_name,enabled FROM scheduled_jobs WHERE id='j'",
            );
            query(
                &mut a,
                "audit-fields",
                "SELECT session_id,action_type FROM audit_log WHERE id='a'",
            );
        }
        if std::env::var("R07_MUTATION").as_deref() == Ok("drop-message") && prefix == 1 {
            exec(&mut a, "mutation", "DELETE FROM messages WHERE id='m'");
        }
        if prefix > 0 {
            query(&mut a, "after-data", DATA);
            query(
                &mut a,
                "settings",
                "SELECT theme,chat_streaming_action FROM user_settings WHERE user_id='synthetic-owner'",
            );
            if prefix >= 4 {
                query(
                    &mut a,
                    "state",
                    "SELECT value FROM session_state WHERE session_id='s'",
                );
            }
            if prefix >= 7 {
                query(
                    &mut a,
                    "thread",
                    "SELECT title,provider_id FROM agent_threads WHERE id='t'",
                );
            }
            if prefix >= 68 {
                query(
                    &mut a,
                    "security",
                    "SELECT data FROM security_findings WHERE id='finding'",
                );
            }
            if prefix >= 70 {
                query(
                    &mut a,
                    "recovery",
                    "SELECT attempts,pending,stale_provider_session_id FROM thread_recovery WHERE thread_id='t'",
                );
            }
            if prefix >= 75 {
                query(
                    &mut a,
                    "control",
                    "SELECT halted FROM agent_control WHERE user_id='synthetic-owner'",
                );
            }
        }
        query(
            &mut a,
            "ledger",
            "SELECT id,name FROM _migrations ORDER BY id",
        );
        query(
            &mut a,
            "timestamps",
            "SELECT id,applied_at FROM _migrations ORDER BY id",
        );
        action(&mut a, "schema", "schema", json!({}));
        migrate(&mut a, "idempotent");
        query(
            &mut a,
            "timestamps-again",
            "SELECT id,applied_at FROM _migrations ORDER BY id",
        );
        action(&mut a, "schema-again", "schema", json!({}));
        health(&mut a);
        close(&mut a, "close-upgraded");
        action(
            &mut a,
            "restore-copy",
            "copy",
            json!({"from":backup,"to":restored}),
        );
        open(&mut a, "restore-open", &restored);
        action(&mut a, "restore-version", "version", json!({}));
        action(&mut a, "restore-schema", "schema", json!({}));
        query(
            &mut a,
            "restore-ledger",
            "SELECT id,name,applied_at FROM _migrations ORDER BY id",
        );
        query(&mut a, "restore-integrity", "PRAGMA integrity_check");
        if prefix > 0 {
            query(&mut a, "restore-data", DATA);
            if prefix != 54 && prefix != 55 {
                query(
                    &mut a,
                    "restore-embedding",
                    "SELECT embedding FROM memories WHERE id='mem'",
                );
            }
        }
        let r = run(&format!("prefix-{prefix}"), a, &[]);
        assert_eq!(value(&r, "prefix"), &json!(prefix));
        assert_eq!(value(&r, "upgrade"), &meta["latest"]);
        assert_eq!(value(&r, "ledger"), &meta["migrations"]);
        assert!(
            value(&r, "schema") == schema,
            "schema/index/FK drift at prefix {prefix}; compare canonical.json and prefix-{prefix}.json"
        );
        assert!(
            value(&r, "schema-again") == schema,
            "idempotent schema drift at prefix {prefix}"
        );
        assert_eq!(
            value(&r, "timestamps"),
            value(&r, "timestamps-again"),
            "rerun rewrote migration ledger"
        );
        assert_health(&r);
        if prefix > 0 {
            assert_eq!(value(&r, "before-data"), &expected_data());
            assert_eq!(
                value(&r, "after-data"),
                &expected_data(),
                "R07 retained persisted data at prefix {prefix}"
            );
            assert_eq!(value(&r, "restore-data"), &expected_data());
            assert_eq!(
                value(&r, "message-fields"),
                &json!([{"session_id":"s","role":"user","tool_calls":"[]","created_at":"2026-01-01"}])
            );
            let embedding = if prefix < 56 { "{}" } else { "[0.25,0.75]" };
            assert_eq!(
                value(&r, "memory-fields"),
                &json!([{"scope":"global","source_type":"fixture","source_id":"s","source_surface":"chat","embedding":embedding}])
            );
            if prefix != 54 && prefix != 55 {
                assert_eq!(
                    value(&r, "restore-embedding"),
                    &json!([{"embedding":"[0.25,0.75]"}]),
                    "pre-upgrade restore must recover even intentionally dropped data"
                );
            }
            assert_eq!(
                value(&r, "job-fields"),
                &json!([{"cron":"0 0 * * *","tool_name":"fixture.noop","enabled":0}])
            );
            assert_eq!(
                value(&r, "audit-fields"),
                &json!([{"session_id":"s","action_type":"fixture.read"}])
            );
            assert_eq!(
                value(&r, "settings"),
                &json!([{"theme":"dark","chat_streaming_action":"queue"}])
            );
            if prefix >= 4 {
                assert_eq!(
                    value(&r, "state"),
                    &json!([{"value":"{\"retained\":true}"}])
                );
            }
            if prefix >= 7 {
                assert_eq!(
                    value(&r, "thread"),
                    &json!([{"title":"synthetic-thread","provider_id":"fixture-never-run"}])
                );
            }
            if prefix >= 68 {
                assert_eq!(
                    value(&r, "security"),
                    &json!([{"data":"{\"synthetic\":true}"}])
                );
            }
            if prefix >= 70 {
                assert_eq!(
                    value(&r, "recovery"),
                    &json!([{"attempts":2,"pending":1,"stale_provider_session_id":"synthetic-stale"}])
                );
            }
            if prefix >= 75 {
                assert_eq!(value(&r, "control"), &json!([{"halted":1}]));
            }
        }
        assert_eq!(
            value(&r, "restore-version"),
            &json!(prefix),
            "rollback must restore original schema version"
        );
        assert!(
            value(&r, "restore-schema") == value(&r, "before-schema"),
            "restored schema differs at prefix {prefix}"
        );
        assert_eq!(value(&r, "restore-ledger"), value(&r, "before-ledger"));
        assert_eq!(
            value(&r, "restore-integrity"),
            &json!([{"integrity_check":"ok"}])
        );
    }
}

#[test]
fn transactions_foreign_keys_concurrent_writers_and_sigkill_recovery() {
    let f = file("recovery");
    let backup = file("wal-backup");
    let restored = file("wal-restored");
    let mut a = vec![];
    open(&mut a, "open", &f);
    migrate(&mut a, "migrate");
    exec(&mut a, "seed", &seeds(75));
    exec(
        &mut a,
        "timeout",
        "PRAGMA busy_timeout=50; PRAGMA wal_autocheckpoint=0",
    );
    action(
        &mut a,
        "rollback",
        "transaction",
        json!({"sql":["UPDATE messages SET content='must-rollback' WHERE id='m'", "INSERT INTO messages(id,session_id,role,content,created_at) VALUES ('m','s','user','duplicate','2026-01-01')"]}),
    );
    query(
        &mut a,
        "after-rollback",
        "SELECT content FROM messages WHERE id='m'",
    );
    exec(
        &mut a,
        "orphan",
        "INSERT INTO message_context_metadata VALUES ('absent',1)",
    );
    exec(
        &mut a,
        "child-row",
        "INSERT INTO message_context_metadata VALUES ('m',1)",
    );
    action(
        &mut a,
        "cascade-rollback",
        "transaction",
        json!({"sql":["DELETE FROM messages WHERE id='m'","INSERT INTO message_context_metadata VALUES ('absent',1)"]}),
    );
    query(
        &mut a,
        "cascade-rolled-back",
        "SELECT message_id FROM message_context_metadata",
    );
    exec(&mut a, "cascade", "DELETE FROM messages WHERE id='m'");
    query(
        &mut a,
        "cascade-empty",
        "SELECT * FROM message_context_metadata",
    );
    exec(
        &mut a,
        "reseed-message",
        "INSERT INTO messages(id,session_id,role,content,created_at) VALUES ('m','s','user','synthetic-message','2026-01-01')",
    );
    exec(
        &mut a,
        "writer-lock",
        "BEGIN IMMEDIATE; UPDATE messages SET content='uncommitted-parent' WHERE id='m'",
    );
    action(
        &mut a,
        "reader",
        "child",
        json!({"file":f,"sql":["PRAGMA busy_timeout=50", "CREATE TEMP TABLE observed AS SELECT content FROM messages WHERE id='m'"],"crash":false}),
    );
    // Independent process returns SELECT observations through a query action below as well.
    action(
        &mut a,
        "reader-open",
        "open",
        json!({"file":f,"handle":"reader"}),
    );
    action(
        &mut a,
        "reader-value",
        "query",
        json!({"handle":"reader","sql":"SELECT content FROM messages WHERE id='m'"}),
    );
    action(&mut a, "reader-close", "close", json!({"handle":"reader"}));
    action(
        &mut a,
        "contender",
        "child",
        json!({"file":f,"sql":["PRAGMA busy_timeout=50","BEGIN IMMEDIATE", "UPDATE messages SET content='contender' WHERE id='m'", "COMMIT"],"crash":false}),
    );
    exec(&mut a, "release", "ROLLBACK");
    action(
        &mut a,
        "retry",
        "child",
        json!({"file":f,"sql":["PRAGMA busy_timeout=50","BEGIN IMMEDIATE","UPDATE messages SET content='committed-child' WHERE id='m'","COMMIT"],"crash":false}),
    );
    close(&mut a, "close-before-crash");
    action(
        &mut a,
        "crash",
        "child",
        json!({"file":f,"sql":["PRAGMA wal_autocheckpoint=0", "BEGIN IMMEDIATE","UPDATE messages SET content='durable-before-kill' WHERE id='m'","COMMIT", "BEGIN IMMEDIATE", "UPDATE messages SET content='uncommitted-killed' WHERE id='m'"],"crash":true}),
    );
    action(&mut a, "crash-files", "files", json!({"file":f}));
    open(&mut a, "reopen", &f);
    migrate(&mut a, "remigrate");
    query(
        &mut a,
        "after-crash",
        "SELECT content FROM messages WHERE id='m'",
    );
    action(&mut a, "backup", "backup", json!({"file":backup}));
    exec(
        &mut a,
        "after-backup-write",
        "UPDATE messages SET content='new-after-snapshot' WHERE id='m'",
    );
    close(&mut a, "close-source");
    action(
        &mut a,
        "restore",
        "copy",
        json!({"from":backup,"to":restored}),
    );
    open(&mut a, "restore-open", &restored);
    query(
        &mut a,
        "restored",
        "SELECT content FROM messages WHERE id='m'",
    );
    health(&mut a);
    let r = run("recovery", a, &["rollback", "orphan", "cascade-rollback"]);
    for key in ["rollback", "orphan", "cascade-rollback"] {
        assert!(r[key]["error"].is_string(), "{key} must fail");
    }
    assert!(r["rollback"]["error"].as_str().unwrap().contains("UNIQUE"));
    assert!(
        r["orphan"]["error"]
            .as_str()
            .unwrap()
            .contains("FOREIGN KEY")
    );
    assert_eq!(
        value(&r, "after-rollback"),
        &json!([{"content":"synthetic-message"}])
    );
    assert_eq!(
        value(&r, "cascade-rolled-back"),
        &json!([{"message_id":"m"}])
    );
    assert_eq!(value(&r, "cascade-empty"), &json!([]));
    assert_eq!(
        value(&r, "reader-value"),
        &json!([{"content":"synthetic-message"}])
    );
    for key in ["reader", "retry"] {
        assert_eq!(value(&r, key)["exit"], 0);
        let child: Value =
            serde_json::from_str(value(&r, key)["stdout"].as_str().unwrap()).unwrap();
        assert!(child.get("error").is_none(), "{key}: {child}");
    }
    let contender: Value =
        serde_json::from_str(value(&r, "contender")["stdout"].as_str().unwrap()).unwrap();
    assert!(
        contender["error"].as_str().unwrap().contains("locked"),
        "contending writer must be rejected: {contender}"
    );
    assert_eq!(value(&r, "crash")["signal"], "SIGKILL");
    let crash: Value =
        serde_json::from_str(value(&r, "crash")["stdout"].as_str().unwrap()).unwrap();
    assert_eq!(
        crash["executed"], 6,
        "crash must happen after uncommitted write, not from timeout"
    );
    assert!(
        value(&r, "crash-files")["-wal"].as_u64().unwrap() > 32,
        "reopen must recover surviving WAL"
    );
    assert_eq!(
        value(&r, "after-crash"),
        &json!([{"content":"durable-before-kill"}])
    );
    assert_eq!(value(&r, "restored"), value(&r, "after-crash"));
    assert_health(&r);
}

#[test]
fn interrupted_migration_is_unrecorded_and_requires_repair_or_backup() {
    let mut a = vec![];
    open(&mut a, "open", &file("migration-failure"));
    action(&mut a, "prefix", "prefix", json!({"version":73}));
    exec(
        &mut a,
        "malformed-existing-table",
        "CREATE TABLE agent_github_apps (id TEXT PRIMARY KEY)",
    );
    migrate(&mut a, "failed");
    query(
        &mut a,
        "ledger-after-failure",
        "SELECT MAX(id) AS version FROM _migrations",
    );
    query(
        &mut a,
        "partial-ddl",
        "PRAGMA table_info(agent_github_apps)",
    );
    exec(
        &mut a,
        "repair-fixture-only",
        "DROP TABLE agent_github_apps",
    );
    migrate(&mut a, "retry");
    health(&mut a);
    let r = run("migration-failure", a, &["failed"]);
    assert!(
        r["failed"]["error"]
            .as_str()
            .unwrap()
            .contains("Database migration 74")
    );
    assert!(
        r["failed"]["error"]
            .as_str()
            .unwrap()
            .contains("not recorded as applied")
    );
    assert_eq!(value(&r, "ledger-after-failure"), &json!([{"version":73}]));
    assert_eq!(
        value(&r, "partial-ddl").as_array().unwrap().len(),
        1,
        "failure does not magically roll back DDL"
    );
    assert_eq!(value(&r, "retry"), &metadata()["latest"]);
    assert_health(&r);
}
