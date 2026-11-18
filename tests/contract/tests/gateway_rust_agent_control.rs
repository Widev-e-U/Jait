//! Real SQLite plus deterministic hooks against the TypeScript emergency-stop service.
#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::services::agent_control::*;
use rusqlite::Connection;
use serde_json::{Value, json};
use std::{cell::RefCell, path::PathBuf};

fn database() -> Connection {
    let db = Connection::open_in_memory().unwrap();
    db.execute_batch("CREATE TABLE agent_control(user_id TEXT PRIMARY KEY,halted INTEGER NOT NULL DEFAULT 0,reason TEXT,halted_at TEXT,updated_at TEXT NOT NULL)").unwrap();
    db
}
fn wire(value: impl serde::Serialize) -> Value {
    serde_json::from_str(&serde_json::to_string(&value).unwrap()).unwrap()
}
struct Hooks<'a> {
    db: &'a Connection,
    clock: &'a dyn Fn() -> String,
    events: Vec<Value>,
    step: Value,
    disabled: bool,
}
impl AgentControlHooks for Hooks<'_> {
    fn stop_running<'a>(&'a mut self, user: &'a str) -> StopFuture<'a> {
        Box::pin(async move {
            if self.disabled {
                return Ok(AgentStopResult::Count(0.0));
            }
            let service = AgentControlService::new(self.db, self.clock);
            self.events
                .push(json!({"op":"stop","user":user,"state":service.get_state(user).unwrap()}));
            tokio::task::yield_now().await;
            if self.step["interleaveResume"] == true {
                service.resume(user, &mut NoHooks).unwrap();
            }
            if let Some(message) = self.step.get("stopThrow") {
                return Err(message.as_str().unwrap().into());
            }
            let result = self.step.get("stopResult").cloned().unwrap_or(json!(0));
            if let Some(value) = result.as_f64() {
                Ok(AgentStopResult::Count(value))
            } else {
                Ok(AgentStopResult::Details {
                    stopped: result["stopped"].as_f64().unwrap(),
                    errors: result["errors"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .map(|s| s.as_str().unwrap().into())
                        .collect(),
                })
            }
        })
    }
    fn on_change(&mut self, user: &str, state: &AgentControlState) -> Result<(), String> {
        if self.disabled {
            return Ok(());
        }
        self.events
            .push(json!({"op":"change","user":user,"state":state}));
        self.step["changeThrow"]
            .as_str()
            .filter(|s| !s.is_empty())
            .map_or(Ok(()), |s| Err(s.into()))
    }
}
fn error_value(error: AgentControlError) -> Value {
    match error {
        AgentControlError::Halted(error) => json!({"error":error}),
        other => json!({"error":{"name":"Error","message":other.to_string()}}),
    }
}
async fn trace(call: &Value) -> Value {
    let db = database();
    if let Some(sql) = call["sql"].as_str() {
        db.execute_batch(sql).unwrap();
    }
    let time = RefCell::new("2026-10-20T06:00:00.000Z".to_owned());
    let clock = || time.borrow().clone();
    let service = AgentControlService::new(&db, &clock);
    let mut hooks = Hooks {
        db: &db,
        clock: &clock,
        events: vec![],
        step: Value::Null,
        disabled: call["noHooks"] == true,
    };
    let mut results = vec![];
    for step in call["steps"].as_array().unwrap() {
        if let Some(now) = step["now"].as_str() {
            *time.borrow_mut() = now.into();
        }
        hooks.step = step.clone();
        let user = step["user"].as_str().unwrap_or("");
        let action = step["action"].as_str();
        let result: Result<Value, AgentControlError> = match step["op"].as_str().unwrap() {
            "state" => service.get_state(user).map(wire).map_err(Into::into),
            "isHalted" => service.is_halted(user).map(Value::Bool).map_err(Into::into),
            "assert" => service.assert_can_run(user, action).map(|_| Value::Null),
            "halt" => service
                .halt(user, step["reason"].as_str(), &mut hooks)
                .await
                .map(wire),
            "resume" => service.resume(user, &mut hooks).map(wire),
            "body" => Ok(wire(agent_halted_body(
                &service.get_state(user).unwrap(),
                action,
            ))),
            _ => panic!("unknown trace step"),
        };
        results.push(result.unwrap_or_else(error_value));
    }
    let mut statement = db
        .prepare(
            "SELECT user_id,halted,reason,halted_at,updated_at FROM agent_control ORDER BY user_id",
        )
        .unwrap();
    let rows: Vec<Value> = statement.query_map([], |row| Ok(json!({"user_id":row.get::<_,String>(0)?,"halted":row.get::<_,i64>(1)?,"reason":row.get_ref(2)?.as_bytes_or_null().unwrap().map(|bytes|String::from_utf8_lossy(bytes).into_owned()),"halted_at":row.get::<_,Option<String>>(3)?,"updated_at":row.get::<_,String>(4)?}))).unwrap().map(Result::unwrap).collect();
    json!({"results":results,"events":hooks.events,"rows":rows})
}
async fn compare(calls: Vec<Value>) {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap();
    let reference = internal_driver::call(
        &root,
        &root.join(".jait/artifacts/gateway-rust/parallel-20261020/agent-control/contracts"),
        json!({"version":1,"calls":calls}),
        &|| false,
    )
    .unwrap();
    for (index, call) in calls.iter().enumerate() {
        assert_eq!(trace(call).await, reference[index], "case {index}: {call}");
    }
}
fn call(steps: Vec<Value>) -> Value {
    json!({"op":"nativeagentcontrol.trace","steps":steps})
}
#[tokio::test]
async fn missing_empty_users_and_unusual_owner_ids() {
    compare(vec![call(vec![
        json!({"op":"state","user":"fresh"}),
        json!({"op":"state","user":""}),
        json!({"op":"isHalted","user":""}),
        json!({"op":"assert","user":"missing"}),
        json!({"op":"halt","user":""}),
        json!({"op":"resume","user":""}),
        json!({"op":"halt","user":" u' OR 1=1 -- ","reason":"one"}),
        json!({"op":"state","user":"fresh"}),
    ])])
    .await;
}
#[tokio::test]
async fn halt_repeat_reason_and_owner_isolation() {
    compare(vec![call(vec![json!({"op":"halt","user":"a","reason":"  runaway loop  ","stopResult":3}),json!({"op":"assert","user":"a","action":"start-thread"}),json!({"op":"isHalted","user":"a"}),json!({"op":"assert","user":"b"}),json!({"op":"halt","user":"a","now":"2026-10-20T07:00:00.000Z","reason":"new","stopResult":{"stopped":2,"errors":["one","two"]}}),json!({"op":"body","user":"a","action":""}),json!({"op":"resume","user":"a","now":"2026-10-20T08:00:00.000Z"}),json!({"op":"assert","user":"a"}),json!({"op":"halt","user":"a","now":"2026-10-20T09:00:00.000Z"})])]).await;
}
#[tokio::test]
async fn hook_failures_and_interleaved_resume_are_observed() {
    compare(vec![call(vec![
        json!({"op":"halt","user":"u","stopThrow":"cannot stop"}),
        json!({"op":"state","user":"u"}),
        json!({"op":"halt","user":"u","stopThrow":"string error","throwString":true}),
        json!({"op":"halt","user":"u","changeThrow":"broadcast failed"}),
        json!({"op":"state","user":"u"}),
        json!({"op":"resume","user":"u","changeThrow":"resume broadcast"}),
        json!({"op":"state","user":"u"}),
        json!({"op":"halt","user":"u","interleaveResume":true,"stopResult":-1.5}),
    ])])
    .await;
}
#[tokio::test]
async fn unicode_reason_slicing_and_nullish_cases() {
    let reasons = vec![
        Value::Null,
        json!(""),
        json!("\u{feff}\u{2000}\n"),
        json!("é".repeat(510)),
        json!(format!("{}😀tail", "a".repeat(499))),
        json!("\0control\u{200b}"),
        json!("😀".repeat(260)),
    ];
    compare(
        reasons
            .into_iter()
            .map(|reason| {
                call(vec![
                    json!({"op":"halt","user":"u","reason":reason}),
                    json!({"op":"body","user":"u"}),
                    json!({"op":"assert","user":"u"}),
                ])
            })
            .collect(),
    )
    .await;
}
#[tokio::test]
async fn dormant_rows_and_no_hooks_preserve_database_semantics() {
    let mut c = call(vec![
        json!({"op":"state","user":"u"}),
        json!({"op":"isHalted","user":"u"}),
        json!({"op":"halt","user":"u"}),
        json!({"op":"resume","user":"u"}),
    ]);
    c["noHooks"] = json!(true);
    c["sql"] = json!(
        "INSERT INTO agent_control VALUES('u',0,'stale','old','time'); INSERT INTO agent_control VALUES('two',2,'bad','older','time')"
    );
    let mut d = c.clone();
    d["steps"] = json!([{"op":"state","user":"two"},{"op":"isHalted","user":"two"},{"op":"halt","user":"two"}]);
    compare(vec![c, d]).await;
}
#[test]
fn error_helpers_and_structural_recognition_match() {
    let values = vec![
        Value::Null,
        json!({}),
        json!({"code":"agent_halted"}),
        json!({"code":"other"}),
        json!("agent_halted"),
        json!(["agent_halted"]),
        json!({"code":42}),
    ];
    let construct = vec![
        json!({}),
        json!({"message":"","action":""}),
        json!({"message":"custom","action":"send"}),
    ];
    let bodies = vec![
        json!({"state":{"halted":false,"reason":null,"haltedAt":null,"updatedAt":null}}),
        json!({"state":{"halted":true,"reason":"","haltedAt":"t","updatedAt":"u"},"action":""}),
        json!({"state":{"halted":true,"reason":"cost spike","haltedAt":"t","updatedAt":"u"},"action":"go"}),
    ];
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap();
    let reference = internal_driver::call(&root, &root.join(".jait/artifacts/gateway-rust/parallel-20261020/agent-control/helpers"), json!({"version":1,"calls":[{"op":"nativeagentcontrol.errors","values":values,"construct":construct,"bodies":bodies}]}), &||false).unwrap();
    let native = json!({"code":AGENT_HALTED_CODE,"running":AgentControlState::default(),"errors":values.iter().map(is_agent_halted_error).collect::<Vec<_>>(),"made":construct.iter().map(|v| wire(AgentHaltedError::new(v["message"].as_str(),v["action"].as_str()))).collect::<Vec<_>>(),"bodies":bodies.iter().map(|v| wire(agent_halted_body(&AgentControlState {halted:v["state"]["halted"]==true,reason:v["state"]["reason"].as_str().map(String::from),halted_at:v["state"]["haltedAt"].as_str().map(String::from),updated_at:v["state"]["updatedAt"].as_str().map(String::from)},v["action"].as_str()))).collect::<Vec<_>>()});
    assert_eq!(native, reference[0]);
}
