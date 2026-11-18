//! Identical Rust-owned contracts against selectable Bun/native observation adapters.
#[path = "../src/migration_driver.rs"]
mod migration_driver;
use serde_json::{Value, json};
use std::{fs, path::PathBuf};
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}
fn call(c: Value) -> Value {
    let dir = root()
        .join(".jait/artifacts/migration-contracts")
        .join(uuid::Uuid::new_v4().to_string());
    fs::create_dir_all(&dir).unwrap();
    let result =
        migration_driver::call(&root(), &dir, json!({"version":1,"calls":[c]}), &|| false).unwrap();
    assert!(
        result[0].get("unsupported").is_none(),
        "missing backend implementation: {}",
        result[0]
    );
    result[0].clone()
}
fn q(s: &str) -> String {
    format!("'{}'", s.replace('\'', "''"))
}
fn act(key: &str, op: &str, fields: Value) -> Value {
    let mut o = fields.as_object().unwrap().clone();
    o.insert("key".into(), json!(key));
    o.insert("op".into(), json!(op));
    Value::Object(o)
}
fn plan(actions: Vec<Value>) -> Value {
    call(json!({"op":"recovery.plan","actions":actions}))
}
fn ok<'a>(r: &'a Value, key: &str) -> &'a Value {
    assert!(r[key].get("error").is_none(), "{key}: {}", r[key]);
    &r[key]["value"]
}
fn corpus() -> Value {
    serde_json::from_str(include_str!("../corpus/current-payloads.json")).unwrap()
}
fn seed(rows: &Value) -> String {
    let mut tables = rows.as_object().unwrap().keys().collect::<Vec<_>>();
    // Actual schema FKs require these parents before their dependent rows.
    tables.sort_by_key(|t| {
        (
            matches!(
                t.as_str(),
                "message_context_metadata" | "device_calendar_snapshots"
            ),
            t.as_str(),
        )
    });
    let mut sql = String::new();
    for t in tables {
        let row = rows[t].as_object().unwrap();
        let cols = row
            .keys()
            .map(|c| format!("\"{c}\""))
            .collect::<Vec<_>>()
            .join(",");
        let vals = row
            .values()
            .map(|v| match v {
                Value::String(s) => q(s),
                Value::Null => "NULL".into(),
                _ => v.to_string(),
            })
            .collect::<Vec<_>>()
            .join(",");
        sql.push_str(&format!("INSERT INTO \"{t}\" ({cols}) VALUES ({vals});\n"));
    }
    sql
}
fn select_actions(rows: &Value, prefix: &str) -> Vec<Value> {
    rows.as_object()
        .unwrap()
        .keys()
        .map(|t| {
            act(
                &format!("{prefix}:{t}"),
                "query",
                json!({"sql":format!("SELECT * FROM \"{t}\"")}),
            )
        })
        .collect()
}
// JavaScript has one number type; SQLite REAL 0.0 and INTEGER 0 are the same JSON value.
fn canonical_json(v: &Value) -> Value {
    match v {
        Value::Number(n)
            if n.as_f64()
                .is_some_and(|v| v.fract() == 0.0 && v.abs() <= 9_007_199_254_740_991.0) =>
        {
            json!(n.as_f64().unwrap() as i64)
        }
        Value::Array(a) => Value::Array(a.iter().map(canonical_json).collect()),
        Value::Object(o) => Value::Object(
            o.iter()
                .map(|(k, v)| (k.clone(), canonical_json(v)))
                .collect(),
        ),
        _ => v.clone(),
    }
}
fn assert_rows(r: &Value, rows: &Value, prefix: &str) {
    for (table, row) in rows.as_object().unwrap() {
        assert_eq!(
            canonical_json(ok(r, &format!("{prefix}:{table}"))),
            canonical_json(&json!([row])),
            "stored payload drift in {prefix}/{table}"
        );
    }
}
#[test]
fn all_current_domain_tables_retain_every_column_on_reopen_migrate_and_restore() {
    let rows = corpus()["rows"].clone();
    let mut a = vec![
        act("open", "open", json!({"file":"populated.db"})),
        act("migrate", "migrate", json!({})),
        act("seed", "exec", json!({"sql":seed(&rows)})),
    ];
    a.extend(select_actions(&rows, "before"));
    a.push(act(
        "fts-before",
        "query",
        json!({"sql":"SELECT message_id FROM messages_fts WHERE messages_fts MATCH 'content'"}),
    ));
    a.push(act("backup", "backup", json!({"file":"snapshot.db"})));
    a.push(act("close", "close", json!({})));
    a.push(act("reopen", "open", json!({"file":"populated.db"})));
    a.push(act("rerun", "migrate", json!({})));
    a.extend(select_actions(&rows, "after"));
    a.push(act(
        "change",
        "exec",
        json!({"sql":"UPDATE messages SET content='after-snapshot'"}),
    ));
    a.push(act("close2", "close", json!({})));
    a.push(act(
        "restore",
        "copy",
        json!({"from":"snapshot.db","to":"restored.db"}),
    ));
    a.push(act("open-restored", "open", json!({"file":"restored.db"})));
    a.extend(select_actions(&rows, "restored"));
    a.push(act(
        "fts-restored",
        "query",
        json!({"sql":"SELECT message_id FROM messages_fts WHERE messages_fts MATCH 'content'"}),
    ));
    a.push(act("fts-integrity","exec",json!({"sql":"INSERT INTO messages_fts(messages_fts) VALUES('integrity-check'); INSERT INTO agent_thread_activities_fts(agent_thread_activities_fts) VALUES('integrity-check');"})));
    a.push(act(
        "integrity",
        "query",
        json!({"sql":"PRAGMA integrity_check"}),
    ));
    a.push(act(
        "fk",
        "query",
        json!({"sql":"PRAGMA foreign_key_check"}),
    ));
    let r = plan(a);
    for key in ["migrate", "seed", "backup", "rerun", "restore"] {
        ok(&r, key);
    }
    for prefix in ["before", "after", "restored"] {
        assert_rows(&r, &rows, prefix);
    }
    assert_eq!(ok(&r, "integrity"), &json!([{"integrity_check":"ok"}]));
    assert_eq!(ok(&r, "fk"), &json!([]));
    for key in ["fts-before", "fts-restored"] {
        assert_eq!(ok(&r, key), &json!([{"message_id":rows["messages"]["id"]}]));
    }
    ok(&r, "fts-integrity");
}
#[test]
fn failed_unique_write_rolls_back_all_populated_domain_tables() {
    let rows = corpus()["rows"].clone();
    let mut a = vec![
        act("open", "open", json!({"file":"rollback.db"})),
        act("migrate", "migrate", json!({})),
        act("seed", "exec", json!({"sql":seed(&rows)})),
    ];
    let mut updates = rows
        .as_object()
        .unwrap()
        .keys()
        .map(|t| format!("DELETE FROM \"{t}\";"))
        .collect::<Vec<_>>();
    // Delete in FK-safe order so the intentional final unique constraint is the failure.
    updates.sort_by_key(|s| {
        !s.contains("message_context_metadata") && !s.contains("device_calendar_snapshots")
    });
    updates.push("INSERT INTO users(id,username,password_hash,created_at,updated_at) VALUES ('collision','duplicate','synthetic','now','now'),('collision','duplicate2','synthetic','now','now');".into());
    a.push(act("transaction", "transaction", json!({"sql":updates})));
    a.extend(select_actions(&rows, "after"));
    let r = plan(a);
    ok(&r, "seed");
    assert!(
        r["transaction"]["error"]
            .as_str()
            .unwrap()
            .contains("UNIQUE constraint failed")
    );
    assert_rows(&r, &rows, "after");
}
#[test]
fn persisted_tool_call_raw_json_retains_overflow_and_utf16_escape_records() {
    for raw in [
        r#"[{"callId":"overflow","startedAt":1e999}]"#,
        r#"[{"callId":"surrogate","message":"\ud800"}]"#,
        r#"[{"callId":"ordinary"},{"callId":"overflow","startedAt":1e999},{"callId":"surrogate","message":"\ud800"}]"#,
    ] {
        assert_eq!(
            call(json!({"op":"toolcalls.serialize","raw":raw})),
            json!(raw),
            "raw tool history lost"
        );
    }
}
#[test]
fn persisted_tool_call_compaction_keeps_mixed_records_and_drops_nonfinite_metadata() {
    let raw = r#"[{"callId":"ordinary","tool":"proof"},{"callId":"overflow","startedAt":1e999},{"callId":"surrogate","message":"\ud800"}]"#;
    let out = call(json!({"op":"toolcalls.serialize","raw":raw,"options":{"forceCompact":true}}));
    let text = out.as_str().unwrap();
    assert!(text.contains(r#""callId":"ordinary""#));
    assert!(text.contains(r#""callId":"overflow""#));
    assert!(text.contains(r#""callId":"surrogate""#));
    assert!(text.contains(r#""message":"\ud800""#));
    assert!(!text.contains("startedAt"));
}
#[test]
fn subagent_persistence_upserts_preserves_created_time_and_zero_metadata() {
    let first = json!([{"data":{"subAgentId":"child","content":"first","rounds":1}}]).to_string();
    let update=json!([{"data":{"subAgentId":"child","content":"α🙂","rounds":0,"durationMs":0,"segments":[],"toolCalls":[]}}]).to_string();
    let r = call(
        json!({"op":"history.persist","steps":[{"session":"s1","message":"m1","raw":first},{"sql":"UPDATE sub_agent_history SET created_at='original-created'"},{"session":"s2","message":"m2","raw":update}]}),
    );
    assert_eq!(
        r,
        json!([{"sub_agent_id":"child","session_id":"s2","message_id":"m2","content":"\"α🙂\"","performative":null,"rounds":0,"duration_ms":0,"segments":"[]","tool_calls":"[]","created_at":"original-created"}])
    );
}
#[test]
fn subagent_best_effort_failure_does_not_drop_later_payload() {
    let raw=json!([{"data":{"subAgentId":"rejected","content":"reject"}},{"data":{"subAgentId":"retained","content":"","rounds":0}}]).to_string();
    let r = call(
        json!({"op":"history.persist","steps":[{"sql":"CREATE TRIGGER reject_one BEFORE INSERT ON sub_agent_history WHEN NEW.sub_agent_id='rejected' BEGIN SELECT RAISE(FAIL,'synthetic rejection'); END;"},{"session":"s","message":"m","raw":raw},{"session":"s","message":"m","raw":"{bad"}]}),
    );
    assert_eq!(r.as_array().unwrap().len(), 1);
    assert_eq!(r[0]["sub_agent_id"], "retained");
    assert_eq!(r[0]["content"], Value::Null);
    assert_eq!(r[0]["rounds"], 0);
}
fn mcp(transport: &str, result: Option<Value>) -> Value {
    let mut input = json!({"op":"mcp.exercise","transport":transport,"tools":[{"name":"echo","description":"Fixture echo","inputSchema":{"type":"object","properties":{"text":{"type":"string"}}}}],"steps":[{"action":"connect"},{"action":"names"},{"action":"call","name":"echo","args":{"text":"α🙂"}},{"action":"call","name":"throw","args":{}},{"action":"disconnect"},{"action":"call","name":"echo","args":{}}]});
    if let Some(result) = result {
        input["result"] = result;
    }
    call(input)
}
fn assert_mcp(r: Value) {
    let o = &r["observations"];
    assert_eq!(o[0]["status"], "connected", "MCP connection failed: {r}");
    assert_eq!(
        o[0]["tools"][0]["inputSchema"]["properties"]["text"]["type"],
        "string"
    );
    assert_eq!(o[1], json!(["mcp.contract-peer.echo"]));
    assert_eq!(o[2]["ok"], true);
    assert_eq!(o[2]["message"], "{\"text\":\"α🙂\"}");
    assert_eq!(o[3]["ok"], false);
    assert!(
        o[3]["message"]
            .as_str()
            .unwrap()
            .contains("synthetic call failure")
    );
    assert_eq!(o[4], json!([]));
    assert_eq!(o[5]["ok"], false);
    assert!(o[5]["message"].as_str().unwrap().contains("not connected"));
    assert_eq!(r["childAlive"], false, "MCP child survived disconnect");
}
#[test]
fn mcp_stdio_tools_errors_and_child_cleanup() {
    assert_mcp(mcp("stdio", None));
}
#[test]
fn mcp_sse_tools_errors_and_socket_cleanup() {
    assert_mcp(mcp("sse", None));
}
#[test]
fn mcp_streamable_http_tools_errors_and_socket_cleanup() {
    assert_mcp(mcp("streamable-http", None));
}
#[test]
fn mcp_structured_error_result_retains_content_and_data() {
    let r = mcp(
        "stdio",
        Some(
            json!({"isError":true,"content":[{"type":"text","text":"denied"},{"type":"text","text":"details"}],"structuredContent":{"reason":"fixture"}}),
        ),
    );
    assert_eq!(
        r["observations"][2],
        json!({"ok":false,"message":"denied\ndetails","data":{"reason":"fixture"}})
    );
}
#[test]
fn mcp_missing_transport_configuration_fails_without_registry_mutation() {
    for transport in ["stdio", "sse", "streamable-http"] {
        let r = call(
            json!({"op":"mcp.exercise","transport":transport,"missing":true,"steps":[{"action":"connect"},{"action":"names"}]}),
        );
        assert_eq!(r["observations"][0]["status"], "error");
        assert_eq!(r["observations"][1], json!([]));
        assert!(
            r["observations"][0]["error"]
                .as_str()
                .unwrap()
                .contains("requires a")
        );
    }
}
#[test]
fn mcp_failed_tool_listing_closes_owned_child() {
    let r = call(
        json!({"op":"mcp.exercise","transport":"stdio","listError":true,"steps":[{"action":"connect"},{"action":"names"}]}),
    );
    assert_eq!(r["observations"][0]["status"], "error");
    assert_eq!(r["observations"][1], json!([]));
    assert_eq!(r["childAlive"], false, "failed tools/list leaked child");
}
// Minimal USTAR fixtures are Rust-authored bytes; the real launcher runs tar and validates them.
fn tar(name: &str, body: &str, link: Option<&str>) -> String {
    let mut h = vec![0u8; 512];
    fn field(h: &mut [u8], at: usize, len: usize, s: &str) {
        assert!(s.len() <= len);
        h[at..at + s.len()].copy_from_slice(s.as_bytes());
    }
    field(&mut h, 0, 100, name);
    field(&mut h, 100, 8, "0000755\0");
    field(&mut h, 108, 8, "0000000\0");
    field(&mut h, 116, 8, "0000000\0");
    field(
        &mut h,
        124,
        12,
        &format!("{:011o}\0", if link.is_some() { 0 } else { body.len() }),
    );
    field(&mut h, 136, 12, "00000000000\0");
    h[148..156].fill(b' ');
    h[156] = if link.is_some() { b'2' } else { b'0' };
    if let Some(link) = link {
        field(&mut h, 157, 100, link);
    }
    field(&mut h, 257, 6, "ustar\0");
    field(&mut h, 263, 2, "00");
    let checksum: u32 = h.iter().map(|n| *n as u32).sum();
    field(&mut h, 148, 8, &format!("{checksum:06o}\0 "));
    if link.is_none() {
        h.extend(body.as_bytes());
        h.resize(h.len().div_ceil(512) * 512, 0);
    }
    h.resize(h.len() + 1024, 0);
    h.iter().map(|b| format!("{b:02x}")).collect()
}
const AGENT: &str = "#!/bin/sh\nprintf '%s\\n' \"$FIXTURE_VALUE\" \"$@\"\n";
#[test]
fn acp_archive_installs_once_and_forwards_literal_argv_and_environment() {
    let r = call(
        json!({"op":"acp.launch","archiveHex":tar("agent",AGENT,None),"args":["configured"],"forwarded":["with spaces","$(touch injected)","; literal"],"env":{"FIXTURE_VALUE":"fixture-env"},"repeat":2,"staleLock":true,"invalidMarker":true}),
    );
    assert_eq!(r["downloads"], 1);
    assert_eq!(r["entries"], json!(["local"]));
    for out in r["results"].as_array().unwrap() {
        assert_eq!(out["exit"], 0, "{out}");
        assert_eq!(
            out["stdout"],
            "fixture-env\nconfigured\nwith spaces\n$(touch injected)\n; literal\n"
        );
    }
    assert_eq!(r["marker"]["cmd"], "agent");
}
#[test]
fn acp_checksum_rejection_cleans_staging_and_lock() {
    let r = call(
        json!({"op":"acp.launch","archiveHex":tar("agent",AGENT,None),"sha256":"00".repeat(32)}),
    );
    assert_eq!(r["results"][0]["exit"], 1);
    assert!(
        r["results"][0]["stderr"]
            .as_str()
            .unwrap()
            .contains("Checksum mismatch")
    );
    assert_eq!(r["entries"], json!([]));
    assert_eq!(r["marker"], Value::Null);
}
#[test]
fn acp_archive_path_escape_is_rejected_before_extraction() {
    for name in ["../escaped", "/absolute"] {
        let r = call(json!({"op":"acp.launch","archiveHex":tar(name,"fixture",None)}));
        assert_ne!(r["results"][0]["exit"], 0);
        assert!(
            r["results"][0]["stderr"]
                .as_str()
                .unwrap()
                .contains("Unsafe path")
        );
        assert_eq!(r["entries"], json!([]));
    }
}
#[test]
fn acp_escaping_binary_symlink_and_unsafe_command_are_rejected() {
    let r = call(json!({"op":"acp.launch","archiveHex":tar("agent","",Some("/bin/sh"))}));
    assert_ne!(r["results"][0]["exit"], 0);
    assert!(
        r["results"][0]["stderr"]
            .as_str()
            .unwrap()
            .contains("escaped its install directory")
    );
    assert_eq!(r["entries"], json!([]));
    let r =
        call(json!({"op":"acp.launch","archiveHex":tar("agent",AGENT,None),"command":"../agent"}));
    assert_ne!(r["results"][0]["exit"], 0);
    assert_eq!(r["downloads"], 0);
}
#[test]
fn acp_download_error_leaves_no_partial_install() {
    let r = call(json!({"op":"acp.launch","archiveHex":"","httpStatus":503}));
    assert_eq!(r["results"][0]["exit"], 1);
    assert!(
        r["results"][0]["stderr"]
            .as_str()
            .unwrap()
            .contains("HTTP 503")
    );
    assert_eq!(r["entries"], json!([]));
}
#[test]
fn messenger_invalid_recovery_keys_do_not_fetch_backup() {
    for key in ["", "invalid0OIl", "1", "1".repeat(101).as_str()] {
        let r = call(json!({"op":"messenger.recover","key":key}));
        assert_eq!(r["error"], "Invalid recovery key.");
        assert_eq!(r["requests"], json!([]));
    }
}
#[test]
fn messenger_wrong_algorithm_and_public_key_stop_before_keys_download() {
    for extra in [
        json!({"algorithm":"unsupported"}),
        json!({"wrongPublicKey":true}),
    ] {
        let mut input = extra.as_object().unwrap().clone();
        input.insert("op".into(), json!("messenger.recover"));
        let r = call(Value::Object(input));
        assert_eq!(r["error"], "Recovery key does not match this backup.");
        assert_eq!(
            r["requests"],
            json!(["/_matrix/client/v3/room_keys/version"])
        );
    }
}
#[test]
fn messenger_recovered_real_encrypted_event_decrypts_and_corruption_fails() {
    let r = call(json!({"op":"messenger.recover"}));
    assert_eq!(r["exportedCount"], 1, "{r}");
    assert_eq!(
        r["decrypted"]["content"]["body"],
        "historical encrypted message"
    );
    let r = call(json!({"op":"messenger.recover","corrupt":true}));
    assert!(r["error"].is_string());
    assert_eq!(r["requests"].as_array().unwrap().len(), 2);
}
#[test]
fn git_stage_unstage_and_discard_restore_real_repository_bytes() {
    let r = call(
        json!({"op":"git.workflow","steps":[{"op":"write","path":"tracked α.txt","content":"modified\n"},{"op":"stage","paths":["tracked α.txt"]},{"op":"porcelain"},{"op":"unstage","paths":["tracked α.txt"]},{"op":"porcelain"},{"op":"discard","paths":["tracked α.txt"]},{"op":"read","path":"tracked α.txt"},{"op":"porcelain"}]}),
    );
    let a = &r["results"];
    assert!(a[2].as_str().unwrap().starts_with("M "), "{r}");
    assert!(a[4].as_str().unwrap().starts_with(" M"), "{r}");
    assert_eq!(a[5]["discardedCount"], 1);
    assert_eq!(a[6], "original\n");
    assert_eq!(a[7], "");
}
#[test]
fn git_routes_authenticate_and_route_explicit_remote_requests() {
    let r = call(
        json!({"op":"git.workflow","steps":[{"op":"route","path":"/api/git/status","anonymous":true},{"op":"route","path":"/api/git/status","remote":true,"body":{"nodeId":"remote"}},{"op":"route","path":"/api/git/checkout","remote":true,"body":{"nodeId":"missing","branch":"main"}}]}),
    );
    assert_eq!(r["results"][0]["status"], 401);
    assert_eq!(r["results"][1]["status"], 200, "{r}");
    assert_eq!(r["results"][2]["status"], 500);
    let proxied = r["proxied"].as_array().unwrap();
    assert!(!proxied.is_empty());
    assert!(proxied.iter().any(|p| p["node"] == "remote"));
    assert!(proxied.iter().any(|p| p["node"] == "missing"));
}
#[test]
fn mcp_manager_reconnect_replaces_old_tool_registration() {
    let r = call(json!({"op":"mcp.manager"}));
    assert_eq!(r[0]["status"], "connected");
    assert_eq!(r[1], json!(["mcp.managed.old"]));
    assert_eq!(r[2]["status"], "connected");
    assert_eq!(
        r[3],
        json!(["mcp.managed.new"]),
        "reconnect retained stale tools"
    );
    assert_eq!(r[4], json!([]));
    assert_eq!(r[5], json!([]));
}
#[test]
fn mcp_remove_during_tool_discovery_does_not_resurrect_connection() {
    let r = call(json!({"op":"mcp.manager","race":true}));
    assert_eq!(
        r[1],
        json!([]),
        "removed connection registered tools after list completed"
    );
    assert_eq!(r[2], json!([]));
}
#[test]
fn acp_launcher_forwards_sigterm_to_installed_child() {
    let agent = "#!/bin/sh\ntrap 'printf terminated; exit 0' TERM\nprintf ready > \"$JAIT_ACP_SIGNAL_READY\"\nwhile :; do sleep 0.1; done\n";
    let r = call(json!({"op":"acp.launch","archiveHex":tar("agent",agent,None),"signal":true}));
    assert_eq!(r["results"][0]["exit"], 0, "{r}");
    assert_eq!(r["results"][0]["stdout"], "terminated");
}
#[test]
fn messenger_backup_recovery_enforces_exact_session_limit() {
    let r = call(json!({"op":"messenger.recover","count":50000,"skipDecrypt":true}));
    assert!(
        r.get("error").is_none(),
        "exact limit should be accepted: {r}"
    );
    assert!(r["exportedCount"].as_u64().unwrap() > 0);
    let r = call(json!({"op":"messenger.recover","count":50001,"skipDecrypt":true}));
    assert_eq!(r["error"], "Backup exceeds the recovery limit.");
}
#[test]
fn sqlite_full_failure_preserves_committed_payload_and_allows_recovery() {
    let r = plan(vec![
        act("open", "open", json!({"file":"full.db"})),
        act("migrate", "migrate", json!({})),
        act(
            "seed",
            "exec",
            json!({"sql":"INSERT INTO sessions(id,created_at,last_active_at) VALUES('s','now','now'); INSERT INTO messages(id,session_id,role,content,created_at) VALUES('m','s','user','retained','now');"}),
        ),
        act("limit", "page-limit", json!({})),
        act(
            "full",
            "exec",
            json!({"sql":"UPDATE messages SET content=hex(zeroblob(1048576)) WHERE id='m'"}),
        ),
        act(
            "retained",
            "query",
            json!({"sql":"SELECT content FROM messages WHERE id='m'"}),
        ),
        act(
            "reset",
            "exec",
            json!({"sql":"PRAGMA max_page_count=2147483646; UPDATE messages SET content='recovered' WHERE id='m'"}),
        ),
        act(
            "recovered",
            "query",
            json!({"sql":"SELECT content FROM messages WHERE id='m'"}),
        ),
    ]);
    ok(&r, "seed");
    ok(&r, "limit");
    assert!(r["full"]["error"].as_str().unwrap().contains("full"), "{r}");
    assert_eq!(ok(&r, "retained"), &json!([{"content":"retained"}]));
    assert_eq!(ok(&r, "recovered"), &json!([{"content":"recovered"}]));
}
#[test]
fn corrupt_snapshot_is_rejected_without_replacing_open_database() {
    let r = plan(vec![
        act("open", "open", json!({"file":"healthy.db"})),
        act("migrate", "migrate", json!({})),
        act(
            "seed",
            "exec",
            json!({"sql":"INSERT INTO sessions(id,name,created_at,last_active_at) VALUES('s','retained','now','now')"}),
        ),
        act(
            "corrupt",
            "corrupt",
            json!({"file":"corrupt.db","bytes":vec![65;128]}),
        ),
        act(
            "bad-open",
            "open",
            json!({"file":"corrupt.db","handle":"candidate"}),
        ),
        act(
            "healthy",
            "query",
            json!({"sql":"SELECT name FROM sessions WHERE id='s'"}),
        ),
    ]);
    assert!(
        r["bad-open"]["error"]
            .as_str()
            .unwrap()
            .contains("not a database")
    );
    assert_eq!(ok(&r, "healthy"), &json!([{"name":"retained"}]));
}
#[cfg(unix)]
#[test]
fn pty_broker_executes_resizes_reports_exit_and_rejects_missing_pty() {
    let r =
        call(json!({"op":"terminal.pty","command":"printf '%s%s\\n' 'pty-' 'proof'; exit 7\n"}));
    assert!(
        r["output"].as_str().unwrap().contains("\r\npty-proof\r\n"),
        "{r}"
    );
    assert_eq!(r["exit"]["code"], 7);
    assert!(r["missingError"].as_str().unwrap().contains("not found"));
}
#[cfg(unix)]
#[test]
fn pty_shutdown_rejects_pending_rpc_and_reaps_child() {
    let r = call(json!({"op":"terminal.pty","stopPending":true}));
    assert_eq!(r["pending"]["error"], "Broker stopping");
    assert_eq!(r["childAlive"], false, "broker stop leaked PTY process");
}
#[cfg(target_os = "linux")]
#[test]
fn filesystem_watcher_preserves_distinct_case_paths_and_ignores_noise() {
    let r = call(json!({"op":"watcher.case"}));
    let mut paths = r
        .as_array()
        .unwrap()
        .iter()
        .map(|e| e["path"].as_str().unwrap())
        .collect::<Vec<_>>();
    paths.sort();
    assert_eq!(
        paths,
        ["A.ts", "a.ts"],
        "distinct case-sensitive filesystem events were merged"
    );
    assert!(r.as_array().unwrap().iter().all(|e| e["type"] == "created"));
}
#[test]
fn forge_create_pr_preserves_request_body_and_remote_result() {
    let input = json!({"title":"Review α🙂","headBranch":"feature/local","baseBranch":"main","body":"line one\nline two"});
    let r = call(
        json!({"op":"forge.workflow","token":"synthetic-token","input":input,"response":{"html_url":"https://forge.invalid/pulls/17","number":17,"base":{"label":"main"},"head":{"label":"feature/local"},"title":"Review α🙂"}}),
    );
    assert_eq!(
        r["result"],
        json!({"status":"created","url":"https://forge.invalid/pulls/17","number":17,"baseBranch":"main","headBranch":"feature/local","title":"Review α🙂"})
    );
    assert_eq!(
        r["requests"],
        json!([{"method":"POST","path":"/api/v1/repos/owner/repository/pulls","authorization":"Bearer synthetic-token","body":{"title":"Review α🙂","head":"feature/local","base":"main","body":"line one\nline two"}}])
    );
}
#[test]
fn forge_api_failure_and_cli_auth_redaction_are_observable() {
    let r = call(
        json!({"op":"forge.workflow","token":"synthetic-token","input":{"title":"fixture","headBranch":"feature","baseBranch":"main","body":"fixture"},"response":{"error":"synthetic failure"},"status":503}),
    );
    assert!(r["error"].as_str().unwrap().contains("503"));
    assert!(r.get("result").is_none());
    let r = call(json!({"op":"forge.workflow","auth":true,"token":"synthetic-token","fail":true}));
    assert_eq!(r["authenticated"], false);
    let error = r["error"].as_str().unwrap();
    assert!(!error.contains("synthetic-token"));
    assert!(error.contains("[REDACTED]"));
    let r = call(json!({"op":"forge.workflow","auth":true,"token":"synthetic-token"}));
    assert_eq!(r, json!({"authenticated":true,"username":"fixture-owner"}));
}
