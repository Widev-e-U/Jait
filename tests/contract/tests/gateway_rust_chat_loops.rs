#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::{
    db,
    services::{
        chat_loops::{self, ChatLoop, ChatLoopService, LoopRuntime},
        sessions::SessionService,
    },
    tools::loop_tools::{self, LoopContext},
};
use serde_json::{Value, json};
use std::{
    path::PathBuf,
    sync::{
        Arc, Mutex,
        atomic::{AtomicI64, AtomicUsize, Ordering},
    },
};
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}
fn units(s: &str) -> Value {
    json!(s.encode_utf16().collect::<Vec<_>>())
}
fn view(v: Value) -> Value {
    match v {
        Value::String(s) => units(&s),
        Value::Array(v) => Value::Array(v.into_iter().map(view).collect()),
        Value::Object(v) => Value::Object(v.into_iter().map(|(k, v)| (k, view(v))).collect()),
        v => v,
    }
}
fn loop_view(s: &ChatLoop) -> Value {
    json!({"id":s.id.0,"goal":s.goal.0,"criteria":s.criteria.iter().map(|s|s.0.clone()).collect::<Vec<_>>(),"status":units(&s.status),"iteration":s.iteration,"revision":s.revision,"checkedIteration":s.checked_iteration,"summary":s.summary.0,"nextMessage":s.next_message.0,"evidence":s.evidence.iter().map(|s|s.0.clone()).collect::<Vec<_>>(),"updatedAt":s.updated_at.0})
}
fn optional(s: Option<ChatLoop>) -> Value {
    s.as_ref().map(loop_view).unwrap_or(Value::Null)
}
fn numeric(v: Value) -> Value {
    match v {
        Value::Number(n) => json!(n.as_f64().unwrap()),
        Value::Array(values) => Value::Array(values.into_iter().map(numeric).collect()),
        Value::Object(values) => {
            Value::Object(values.into_iter().map(|(k, v)| (k, numeric(v))).collect())
        }
        v => v,
    }
}
fn reference(call: Value) -> Value {
    internal_driver::call(
        &root(),
        &root()
            .join(".jait/artifacts/gateway-rust/chat-loops/contracts")
            .join(uuid::Uuid::new_v4().to_string()),
        json!({"version":1,"calls":[call]}),
        &|| false,
    )
    .unwrap()[0]
        .clone()
}
fn string<'a>(v: &'a Value, key: &str) -> Option<&'a str> {
    v.get(key).and_then(Value::as_str)
}
fn compare(mut call: Value) {
    call["op"] = json!("nativechatloops.sequence");
    let expected = reference(call.clone());
    let db = rusqlite::Connection::open_in_memory().unwrap();
    db::migrate_database(&db).unwrap();
    let defaults = vec![json!({"id":"chat","userId":"owner","status":"active","metadata":null})];
    for s in call["sessions"].as_array().unwrap_or(&defaults) {
        db.execute("INSERT INTO sessions(id,user_id,name,status,metadata,created_at,last_active_at,viewed_at) VALUES(?,?,?,?,?,?,?,?)",
            rusqlite::params![s["id"].as_str().unwrap(),s["userId"].as_str(),s["name"].as_str().unwrap_or("Fixture"),s["status"].as_str().unwrap_or("active"),s["metadata"].as_str(),"2026-10-23T00:00:00.000Z","2026-10-23T00:00:00.000Z","2026-10-23T00:00:00.000Z"]).unwrap();
    }
    let now = Arc::new(AtomicI64::new(
        call["now"].as_i64().unwrap_or(1792713600000),
    ));
    let count = Arc::new(AtomicUsize::new(0));
    let events = Arc::new(Mutex::new(vec![]));
    let runtime = LoopRuntime {
        clock: {
            let now = now.clone();
            Arc::new(move || now.load(Ordering::SeqCst))
        },
        ids: {
            let count = count.clone();
            let ids = call["ids"].as_array().cloned().unwrap_or_default();
            Arc::new(move || {
                let i = count.fetch_add(1, Ordering::SeqCst);
                ids.get(i)
                    .and_then(Value::as_str)
                    .map(str::to_owned)
                    .unwrap_or(format!("loop-{i}"))
            })
        },
        wake: Some({
            let events = events.clone();
            let error = string(&call, "wakeError").map(str::to_owned);
            Arc::new(move |id| {
                events
                    .lock()
                    .unwrap()
                    .push(view(json!({"op":"wake","id":id})));
                error.clone().map_or(Ok(()), Err)
            })
        }),
        broadcast: Some({
            let events = events.clone();
            let error = string(&call, "broadcastError").map(str::to_owned);
            Arc::new(move |user, event| {
                events
                    .lock()
                    .unwrap()
                    .push(view(json!({"op":"broadcast","user":user,"event":event})));
                error.clone().map_or(Ok(()), Err)
            })
        }),
    };
    let mut service = ChatLoopService::new(&db, runtime.clone());
    let mut results = vec![];
    for step in call["steps"].as_array().unwrap() {
        let id = string(step, "id").unwrap_or("chat");
        let user = string(step, "user");
        let result = (|| -> Result<Value, String> {
            Ok(match step["op"].as_str().unwrap(){
                "get"=>optional(service.get(id,user)?),
                "goal"=>loop_view(&service.goal(id,step["input"].get("goal"),step["input"].get("criteria"),user)?),
                "control"=>loop_view(&service.control(id,step["action"].as_str().unwrap(),user)?),
                "answer"=>optional(service.resume_after_answer(id,step["requestId"].as_str().unwrap(),user)?),
                "check"=>loop_view(&service.check(id,&step["input"],user)?),
                "finish"=>optional(service.finish_turn(id,string(step,"error"),step["cancelled"]==true)?),
                "running"=>json!(service.running()?.into_iter().map(|s|json!({"sessionId":units(&s.session_id),"loop":loop_view(&s.r#loop)})).collect::<Vec<_>>()),
                "instructions"=>chat_loops::chat_loop_instructions(service.get(id,user)?.as_ref()).map(|v|json!(v.0)).unwrap_or(Value::Null),
                "tool"=>{
                    let c=&step["context"];let context=LoopContext{session_id:string(c,"sessionId").unwrap_or(id).into(),user_id:string(c,"userId").map(str::to_owned),thread_id:string(c,"threadId").map(str::to_owned)};
                    let input=step.get("input").cloned().unwrap_or(json!({}));
                    let result=loop_tools::execute(step["name"].as_str().unwrap(),&input,&context,&service);
                    let mut value=json!({"ok":result.ok,"message":units(&result.message)});
                    if let Some(data)=result.data{value["data"]=optional(data);}
                    value
                }
                "restart"=>{service=ChatLoopService::new(&db,runtime.clone());Value::Null}
                "sql"=>{db.execute_batch(step["sql"].as_str().unwrap()).map_err(|e|e.to_string())?;Value::Null}
                "advance"=>{now.fetch_add(step["ms"].as_i64().unwrap(),Ordering::SeqCst);Value::Null}
                _=>panic!("unknown step"),
            })
        })();
        results.push(match result {
            Ok(value) => json!({"value":value}),
            Err(error) => json!({"error":error}),
        });
    }
    let mut query = db
        .prepare("SELECT id,user_id,status,metadata FROM sessions ORDER BY id")
        .unwrap();
    let sessions:Vec<Value>=query.query_map([],|row|Ok(json!({"id":row.get::<_,String>(0)?,"user_id":row.get::<_,Option<String>>(1)?,"status":row.get::<_,Option<String>>(2)?,"metadata":row.get::<_,Option<String>>(3)?}))).unwrap().map(Result::unwrap).collect();
    let actual = json!({"results":results,"events":*events.lock().unwrap(),"sessions":sessions});
    assert_eq!(numeric(actual), numeric(expected), "fixture: {call}");
}
fn goal() -> Value {
    json!({"op":"goal","user":"owner","input":{"goal":"  Finish work 😀  ","criteria":[" First test "," Second test "]}})
}
#[test]
fn lifecycle_revisions_completion_and_manual_resumption_match_reference() {
    compare(
        json!({"steps":[{"op":"get","user":"owner"},goal(),{"op":"instructions","user":"owner"},{"op":"running"},
        {"op":"check","user":"owner","input":{"revision":1,"outcome":"continue","summary":" Progress ","nextMessage":" Inspect result "}},
        {"op":"finish"},{"op":"get","user":"owner"},{"op":"check","user":"owner","input":{"revision":3,"outcome":"waiting","summary":"Need answer"}},
        {"op":"finish"},{"op":"answer","user":"owner","requestId":"question-\"quoted\""},{"op":"restart"},{"op":"get","user":"owner"},
        {"op":"check","user":"owner","input":{"revision":6,"outcome":"complete","summary":" Verified ","evidence":["first pass","second pass"]}},
        {"op":"running"},{"op":"instructions"},{"op":"control","action":"resume","user":"owner"}]}),
    );
}
#[test]
fn stale_checks_pauses_replacements_failures_and_recovery_match_reference() {
    compare(
        json!({"steps":[goal(),{"op":"control","user":"owner","action":"pause"},{"op":"finish"},
        {"op":"answer","user":"owner","requestId":"ignored"},{"op":"control","user":"owner","action":"resume"},
        {"op":"check","user":"owner","input":{"revision":1,"outcome":"complete","summary":"stale","evidence":["old","old"]}},
        goal(),{"op":"finish","cancelled":true},{"op":"control","user":"owner","action":"resume"},
        {"op":"finish","error":"provider failed"},{"op":"get","user":"owner"},{"op":"running"},
        {"op":"control","action":"resume","user":"owner"},{"op":"finish"},{"op":"get","user":"owner"}]}),
    );
}
#[test]
fn owner_scope_archival_no_goal_and_metadata_legacy_shapes_match_reference() {
    for metadata in [
        Value::Null,
        json!("broken-json"),
        json!("null"),
        json!("17"),
        json!("[\"kept\",3]"),
        json!("\"😀\""),
        json!("{\"kept\":{\"__proto__\":\"data\"}}"),
    ] {
        compare(
            json!({"sessions":[{"id":"chat","userId":"owner","metadata":metadata},{"id":"archived","userId":"owner","status":"archived"},{"id":"foreign","userId":"foreign"}],
            "steps":[{"op":"get","id":"missing"},{"op":"finish","id":"missing"},{"op":"control","id":"missing","action":"resume"},
                {"op":"goal","id":"archived","user":"owner","input":{"goal":"valid","criteria":["pass"]}},
                {"op":"goal","id":"foreign","user":"owner","input":{"goal":"valid","criteria":["pass"]}},goal(),
                {"op":"get","user":"foreign"},{"op":"control","user":"foreign","action":"pause"},
                {"op":"running"},{"op":"get","user":""},{"op":"get","user":"owner"}]}),
        );
    }
}
#[test]
fn invalid_goal_schema_and_completion_evidence_match_reference() {
    let inputs = [
        json!({}),
        json!({"goal":null,"criteria":null}),
        json!({"goal":"  ","criteria":[]}),
        json!({"goal":5,"criteria":["",false]}),
        json!({"goal":"x".repeat(8001),"criteria":vec!["p";21]}),
        json!({"goal":"valid","criteria":["😀".repeat(1001)]}),
    ];
    for input in inputs {
        compare(
            json!({"steps":[{"op":"goal","input":input,"user":"owner"},goal(),{"op":"get","user":"owner"}]}),
        );
    }
    for input in [
        json!({"revision":1,"outcome":"other","summary":"progress"}),
        json!({"revision":1,"outcome":"continue","summary":"  ","nextMessage":"valid"}),
        json!({"revision":1,"outcome":"continue","summary":"ok","nextMessage":"  "}),
        json!({"revision":1,"outcome":"complete","summary":"ok","evidence":["only one"]}),
        json!({"revision":1,"outcome":"complete","summary":"ok","evidence":["one","  "]}),
        json!({"revision":1,"outcome":"waiting","summary":"ok","evidence":null}),
        json!({"revision":1,"outcome":"waiting","summary":"ok","evidence":[17]}),
        json!({"revision":1,"outcome":"waiting","summary":"ok","evidence":{}}),
        json!({"revision":1,"outcome":"waiting","summary":"x".repeat(8001),"nextMessage":"n".repeat(8001),"evidence":["x".repeat(2001)]}),
    ] {
        compare(
            json!({"steps":[goal(),{"op":"check","user":"owner","input":input},{"op":"get","user":"owner"}]}),
        );
    }
}
#[test]
fn callbacks_and_persistence_partial_failures_match_reference() {
    for call in [
        json!({"broadcastError":"broadcast failed","steps":[goal(),{"op":"get","user":"owner"}]}),
        json!({"wakeError":"wake failed","steps":[goal(),{"op":"get","user":"owner"}]}),
        json!({"steps":[{"op":"sql","sql":"CREATE TRIGGER fail_loop BEFORE UPDATE ON sessions BEGIN SELECT RAISE(ABORT, 'write rejected'); END;"},goal(),{"op":"get","user":"owner"}]}),
    ] {
        compare(call);
    }
}
#[test]
fn utf16_error_cut_and_no_check_recovery_preserve_history() {
    compare(
        json!({"steps":[goal(),{"op":"finish","error":format!("{}😀tail","x".repeat(7999))},{"op":"get","user":"owner"},
        {"op":"restart"},{"op":"control","action":"resume","user":"owner"},{"op":"instructions","user":"owner"}]}),
    );
}
#[test]
fn tool_metadata_identity_and_authentication_match_actual_factories() {
    assert_eq!(
        loop_tools::metadata(),
        &reference(json!({"op":"nativechatloops.metadata"}))
    );
    let mut steps = vec![];
    for context in [
        json!({}),
        json!({"userId":""}),
        json!({"userId":"owner","threadId":"worker"}),
        json!({"userId":"foreign"}),
        json!({"userId":"owner","threadId":"chat"}),
        json!({"userId":"owner","threadId":""}),
    ] {
        steps.push(json!({"op":"tool","name":"loop.goal","context":context,"input":{"goal":"Fix","criteria":["Pass"]}}));
        steps.push(json!({"op":"tool","name":"loop.status","context":context}));
    }
    steps.extend([json!({"op":"tool","name":"loop.check","context":{"userId":"owner"},"input":{"revision":2,"outcome":"waiting","summary":"wait"}}),
        json!({"op":"tool","name":"loop.pause","context":{"userId":"owner"}}),json!({"op":"tool","name":"loop.resume","context":{"userId":"owner"}}),
        json!({"op":"tool","name":"loop.goal","context":{"userId":"owner"},"input":{"goal":"","criteria":[]}})]);
    compare(json!({"steps":steps}));
}

#[test]
fn persisted_loop_schema_trims_strips_and_rejects_invalid_fields() {
    let valid = json!({"id":"id","goal":"  goal  ","criteria":[" criterion "],"status":"running",
        "iteration":0,"revision":1,"checkedIteration":-1,"summary":"","nextMessage":"","evidence":[],"updatedAt":"","unknown":"stripped"});
    let mut values = vec![
        Value::Null,
        json!("broken"),
        json!({"loop":valid}),
        json!([valid.clone()]),
        json!({"loop":null}),
        json!({"loop":[valid.clone()]}),
    ];
    for key in [
        "id",
        "goal",
        "criteria",
        "status",
        "iteration",
        "revision",
        "checkedIteration",
        "summary",
        "nextMessage",
        "evidence",
        "updatedAt",
    ] {
        for replacement in [None, Some(Value::Null), Some(json!(false))] {
            let mut state = valid.clone();
            if let Some(value) = replacement {
                state[key] = value;
            } else {
                state.as_object_mut().unwrap().remove(key);
            }
            values.push(json!({"loop":state}));
        }
    }
    for (key, value) in [
        ("id", json!("")),
        ("goal", json!(" \u{feff}\t")),
        ("goal", json!("x".repeat(8001))),
        ("criteria", json!([])),
        ("criteria", json!([""])),
        ("criteria", json!(vec!["pass"; 21])),
        ("iteration", json!(-1)),
        ("iteration", json!(1.1)),
        ("revision", json!(1e20)),
        ("checkedIteration", json!(-2)),
        ("status", json!("other")),
        ("summary", json!("x".repeat(8001))),
        ("evidence", json!([""])),
        ("evidence", json!([17])),
        ("evidence", json!(vec!["x"; 21])),
    ] {
        let mut state = valid.clone();
        state[key] = value;
        values.push(json!({"loop":state}));
    }
    let raw = json!({"loop":valid})
        .to_string()
        .replace("\"summary\":\"\"", "\"summary\":\"\\ud83d\"");
    values.push(json!(raw));
    for batch in values.chunks(4) {
        let expected = reference(json!({"op":"nativechatloops.read","values":batch}));
        let actual = Value::Array(
            batch
                .iter()
                .map(|metadata| {
                    let raw = metadata
                        .as_str()
                        .map(str::to_owned)
                        .unwrap_or_else(|| metadata.to_string());
                    optional(chat_loops::read_chat_loop(Some(&raw)))
                })
                .collect(),
        );
        assert_eq!(numeric(actual), numeric(expected), "{batch:?}");
    }
}
#[tokio::test]
async fn bounded_worker_persists_loop_across_database_close_and_reopen() {
    use jait_gateway::db::worker::DatabaseWorker;
    use jait_gateway::services::sessions::CreateSession;
    use std::num::NonZeroU16;
    let directory = root()
        .join(".jait/artifacts/gateway-rust/chat-loops/reopen")
        .join(uuid::Uuid::new_v4().to_string());
    std::fs::create_dir_all(&directory).unwrap();
    let path = directory.join("state.sqlite");
    let connection = rusqlite::Connection::open(&path).unwrap();
    db::migrate_database(&connection).unwrap();
    let worker = DatabaseWorker::new(connection, NonZeroU16::new(2).unwrap()).unwrap();
    let (session_id, goal_id) = worker
        .run(|db| {
            let session = SessionService::new(db).create(CreateSession {
                user_id: Some("owner".into()),
                ..Default::default()
            })?;
            let service = ChatLoopService::new(db, LoopRuntime::default());
            let state = service
                .goal(
                    &session.id,
                    Some(&json!("durable goal")),
                    Some(&json!(["evidence"])),
                    Some("owner"),
                )
                .map_err(std::io::Error::other)?;
            Ok((session.id, state.id.0))
        })
        .await
        .unwrap();
    worker.shutdown().await.unwrap();
    let connection = rusqlite::Connection::open(path).unwrap();
    let service = ChatLoopService::new(&connection, LoopRuntime::default());
    let restored = service.get(&session_id, Some("owner")).unwrap().unwrap();
    assert_eq!(restored.id.0, goal_id);
    assert_eq!(restored.status, "running");
    assert!(service.get(&session_id, Some("foreign")).unwrap().is_none());
    assert_eq!(service.running().unwrap().len(), 1);
}
