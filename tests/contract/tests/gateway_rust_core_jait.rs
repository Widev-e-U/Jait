#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::tools::{
    core_io::HostError,
    core_jait::{CoreJait, CoreJaitContext, JaitPort, metadata},
};
use serde_json::{Value, json};
use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
};
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}
fn reference(call: Value) -> Value {
    internal_driver::call(
        &root(),
        &root()
            .join(".jait/artifacts/gateway-rust/core-jait")
            .join(uuid::Uuid::new_v4().to_string()),
        json!({"version":1,"calls":[call]}),
        &|| false,
    )
    .unwrap()[0]
        .clone()
}
fn reply(
    service: &str,
    method: &str,
    args: &[Value],
    test: &Value,
    step: &Value,
) -> Result<Option<Value>, HostError> {
    if let Some(v) = step["replies"].get(format!("{service}.{method}")) {
        if let Some(e) = v["error"].as_str() {
            return Err(HostError::Error(e.into()));
        }
        if let Some(v) = v.get("thrown") {
            return Err(HostError::Thrown(v.clone()));
        }
        if v["undefined"] == true {
            return Ok(None);
        }
        if let Some(v) = v.get("value") {
            return Ok(Some(v.clone()));
        }
    }
    Ok(Some(match (service, method) {
        ("memory", "save") => json!({"id":"mem-saved","scope":args[0]["scope"]}),
        ("memory", "search") => test.get("memories").cloned().unwrap_or(json!([])),
        ("memory", "forget") => step.get("memoryRemoved").cloned().unwrap_or(json!(true)),
        ("reminders", "create") | ("scheduler", "create") => {
            let mut r = args[0].clone();
            r["id"] = json!(if service == "reminders" {
                "rem-saved"
            } else {
                "job-created"
            });
            r
        }
        ("reminders", "list") => test.get("reminders").cloned().unwrap_or(json!([])),
        ("reminders", "update") | ("scheduler", "update") => {
            if step[if service == "reminders" {
                "missingReminder"
            } else {
                "missingJob"
            }] == true
            {
                return Ok(None);
            }
            let mut r = args[1].clone();
            r["id"] = args[0].clone();
            r
        }
        ("reminders", "delete") => step.get("reminderRemoved").cloned().unwrap_or(json!(false)),
        ("scheduler", "list") => test.get("jobs").cloned().unwrap_or(json!([])),
        ("scheduler", "remove") => step.get("jobRemoved").cloned().unwrap_or(json!(true)),
        ("sessions", "list") => test.get("sessions").cloned().unwrap_or(json!([])),
        ("surfaces", "listSurfaces") => test.get("surfaces").cloned().unwrap_or(json!([])),
        ("hooks", "registeredEventTypes") => test.get("hookEvents").cloned().unwrap_or(json!([])),
        ("hooks", "listenerCount") => test.get("listeners").cloned().unwrap_or(json!(0)),
        _ => panic!("unknown fixture port"),
    }))
}
#[test]
fn core_platform_metadata_matches_actual_factory() {
    assert_eq!(
        metadata(),
        &reference(json!({"op":"nativecorejait.metadata"}))
    );
}
#[tokio::test]
async fn all_actions_missing_dependencies_owner_fields_previews_clock_and_errors_match_source() {
    let fixture: Value =
        serde_json::from_str(include_str!("../fixtures/core-jait-cases.json")).unwrap();
    for (i, test) in fixture["cases"].as_array().unwrap().iter().enumerate() {
        let expected = reference(json!({"op":"nativecorejait.cases","cases":[test]}))[0].clone();
        let step = Arc::new(Mutex::new(Value::Null));
        let events = Arc::new(Mutex::new(Vec::<Value>::new()));
        let mut tool: CoreJait<Value> = CoreJait::new(root().to_string_lossy().to_string());
        tool.clock = Arc::new(|| 1790000000123);
        tool.started_at = test["startedAt"].as_f64();
        if let Some(count) = test["devices"].as_u64() {
            tool.client_count = Some(Arc::new(move || count as usize));
        }
        for service in test["available"].as_array().unwrap() {
            let service = service.as_str().unwrap().to_string();
            let name = service.clone();
            let test = test.clone();
            let active = step.clone();
            let log = events.clone();
            let port: JaitPort<Value> = Arc::new(move |method, args, _context| {
                let current = active.lock().unwrap().clone();
                log.lock()
                    .unwrap()
                    .push(json!({"service":name,"method":method,"args":args}));
                let outcome = reply(&name, method, &args, &test, &current);
                Box::pin(async move { outcome })
            });
            match service.as_str() {
                "memory" => tool.memory = Some(port),
                "reminders" => tool.reminders = Some(port),
                "scheduler" => tool.scheduler = Some(port),
                "sessions" => tool.sessions = Some(port),
                "surfaces" => tool.surfaces = Some(port),
                "hooks" => tool.hooks = Some(port),
                _ => unreachable!(),
            }
        }
        let c = CoreJaitContext {
            user_id: if test["noUser"] == true {
                None
            } else {
                Some(test["context"]["userId"].as_str().unwrap_or("owner").into())
            },
            session_id: test["context"]["sessionId"]
                .as_str()
                .unwrap_or("session")
                .into(),
            action_id: test["context"]["actionId"]
                .as_str()
                .unwrap_or("action")
                .into(),
        };
        let tool = jait_gateway::tools::core::create_jait_tool(tool);
        assert_eq!(tool.definition(), metadata());
        let mut host = json!({"sessionId":c.session_id,"actionId":c.action_id});
        if let Some(user) = c.user_id {
            host["userId"] = json!(user);
        }
        let mut results = vec![];
        for s in test["ops"].as_array().unwrap() {
            *step.lock().unwrap() = s.clone();
            let r = tool.execute(&s["input"], &host).await;
            let mut v = json!({"ok":r.ok,"messageUnits":r.message.0});
            if let Some(data) = r.data {
                v["data"] = data;
            }
            results.push(v);
        }
        let actual = json!({"results":results,"events":*events.lock().unwrap()});
        for (j, (a, b)) in actual["results"]
            .as_array()
            .unwrap()
            .iter()
            .zip(expected["results"].as_array().unwrap())
            .enumerate()
        {
            assert_eq!(a, b, "core Jait case {i} step {j}: {}", test["ops"][j]);
        }
        assert_eq!(actual, expected, "core Jait events case {i}");
    }
}
