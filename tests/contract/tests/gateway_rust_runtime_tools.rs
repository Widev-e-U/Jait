#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::tools::{
    agent_communication::*, runtime_tools::*, swarm_mailbox::SwarmMailbox, tool_names::*,
};
use serde::Serialize;
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    fs,
    path::PathBuf,
    sync::{
        Arc, Mutex,
        atomic::{AtomicI64, Ordering},
    },
};
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}
fn reference(call: Value) -> Value {
    let dir = root()
        .join(".jait/artifacts/gateway-rust/runtime-tools")
        .join(uuid::Uuid::new_v4().to_string());
    fs::create_dir_all(&dir).unwrap();
    internal_driver::call(&root(), &dir, json!({"version":1,"calls":[call]}), &|| {
        false
    })
    .unwrap()[0]
        .clone()
}
#[test]
fn canonical_names_and_runtime_metadata_match_reference_without_duplicate_names() {
    assert_eq!(
        *metadata(),
        reference(json!({"op":"nativeruntime.metadata"}))
    );
    let names: serde_json::Map<String, Value> = ALL_TOOL_NAMES
        .iter()
        .map(|n| (n.key().into(), json!(n.as_str())))
        .collect();
    assert_eq!(json!(names), reference(json!({"op":"nativeruntime.names"})));
    let unique: std::collections::HashSet<_> = ALL_TOOL_NAMES.iter().map(|n| n.as_str()).collect();
    assert_eq!(unique.len(), ALL_TOOL_NAMES.len());
    for name in ALL_TOOL_NAMES {
        assert_eq!(ToolName::from_name(name.as_str()), Some(*name));
    }
    for unknown in ["", "TerminalRun", "terminal.run ", "TERMINAL.RUN"] {
        assert_eq!(ToolName::from_name(unknown), None);
    }
}
#[test]
fn communication_intent_tags_whitespace_unknown_tags_descriptions_and_success() {
    let mut values = vec![
        "raw without tag".to_string(),
        "  no tag  \n".into(),
        "".into(),
        "[REFUSE extra] stays".into(),
        "[UNKNOWN] stays".into(),
        "prefix [FAILURE] stays".into(),
        "[INFORM".into(),
        "[ınform] stays".into(),
        "\u{0085}[AGREE] stays".into(),
    ];
    for tag in PERFORMATIVES {
        for prefix in ["", " \n\t", "\u{feff}"] {
            values.push(format!(
                "{prefix}[{}] \n  content 😀  \n",
                tag.to_uppercase()
            ));
            values.push(format!("{prefix}[{tag}]"));
            values.push(format!("{prefix}[{tag}] [REFUSE] second"));
        }
    }
    let kinds = vec![
        "inform", "propose", "refuse", "failure", "query", "agree", "UNKNOWN", "Refuse", "",
    ];
    let actual = json!({"performatives":PERFORMATIVES,
        "values":values.iter().map(|raw|json!({"parsed":parse_performative(raw),"stripped":strip_performative_tag(raw)})).collect::<Vec<_>>(),
        "kinds":kinds.iter().map(|kind|json!({"successful":is_successful_performative(kind),"description":describe_performative(kind)})).collect::<Vec<_>>()});
    assert_eq!(
        actual,
        reference(json!({"op":"nativeruntime.intents","values":values,"kinds":kinds}))
    );
}
fn editor(mut call: Value) {
    call["op"] = json!("nativeruntime.editor");
    let expected = reference(call.clone());
    let mut events = vec![];
    let mut sink = |command: Value, session: &str| -> Result<(), String> {
        events.push(json!({"command":command,"session":session}));
        if call["error"] == true {
            Err("sink failed".into())
        } else {
            Ok(())
        }
    };
    let result = project_editor_open(
        call["context"]["sessionId"].as_str(),
        call["context"]["projectRoot"].as_str(),
        if call["ws"] == true {
            Some(&mut sink)
        } else {
            None
        },
    )
    .unwrap_or_else(|_| json!({"error":true}));
    assert_eq!(json!({"result":result,"events":events}), expected);
}
#[test]
fn editor_requires_trimmed_session_project_and_ui_channel_and_propagates_sink_error() {
    editor(json!({"input":{},"ws":true}));
    editor(json!({"input":{},"ws":true,"context":{"sessionId":" \n"}}));
    editor(json!({"input":{},"ws":true,"context":{"sessionId":"s","projectRoot":" "}}));
    editor(json!({"input":{},"context":{"sessionId":"s","projectRoot":"/project"}}));
    editor(
        json!({"input":{"sessionId":"injected","projectRoot":"/other"},"ws":true,"context":{"sessionId":" \u{feff}s \n","projectRoot":" /project \n"}}),
    );
    editor(
        json!({"input":{},"ws":true,"context":{"sessionId":"s","projectRoot":"/project"},"error":true}),
    );
}
fn voice(mut call: Value) {
    call["op"] = json!("nativeruntime.voice");
    let expected = reference(call.clone());
    let mut events = vec![];
    let mut speak = |request: Value| -> Result<Value, String> {
        events.push(request);
        if call["error"] == true {
            Err("speak failed".into())
        } else {
            Ok(call["spoken"].clone())
        }
    };
    let result = voice_speak(
        &call["input"],
        call["context"]["sessionId"].as_str(),
        &mut speak,
    )
    .unwrap_or_else(|_| json!({"error":true}));
    assert_eq!(json!({"result":result,"events":events}), expected);
}
#[test]
fn voice_validates_before_service_preserves_context_and_counts_audio_utf16_units() {
    for input in [
        Value::Null,
        json!({}),
        json!({"text":false}),
        json!({"text":null}),
        json!({"text":""}),
        json!({"text":"  "}),
    ] {
        voice(json!({"input":input}));
    }
    for spoken in [
        json!({"mimeType":"audio/wav","audioBase64":"aGVsbG8="}),
        json!({"audioBase64":"😀"}),
        json!({"mimeType":null,"audioBase64":""}),
        json!({}),
        json!({"audioBase64":null}),
    ] {
        voice(
            json!({"input":{"text":"\u{feff} hello \n","sessionId":"injected"},"context":{"sessionId":" s "},"spoken":spoken}),
        );
    }
    voice(
        json!({"input":{"text":"speak without session"},"spoken":{"mimeType":"audio/mpeg","audioBase64":"abc"}}),
    );
    voice(json!({"input":{"text":"fail"},"error":true}));
}
struct Sources {
    call: Value,
    events: Arc<Mutex<Vec<Value>>>,
}
impl Sources {
    fn record(&self, name: &str) -> Result<(), String> {
        self.events.lock().unwrap().push(json!(name));
        if self.call["error"] == name {
            Err("source failed".into())
        } else {
            Ok(())
        }
    }
}
impl StatusSources for Sources {
    fn active_session_count(&mut self) -> Result<usize, String> {
        self.events.lock().unwrap().push(json!({"status":"active"}));
        self.record("sessions")?;
        Ok(self.call["sessions"].as_array().map(Vec::len).unwrap_or(0))
    }
    fn surface_count(&mut self) -> Result<usize, String> {
        self.record("surfaces")?;
        Ok(self.call["surfaces"].as_array().map(Vec::len).unwrap_or(0))
    }
    fn device_count(&mut self) -> Result<usize, String> {
        self.record("devices")?;
        Ok(self.call["devices"].as_u64().unwrap_or(0) as usize)
    }
    fn jobs(&mut self) -> Result<Option<Vec<Value>>, String> {
        if self.call.get("jobs").is_some() {
            self.record("jobs")?;
        }
        Ok(self.call["jobs"].as_array().cloned())
    }
    fn hook_event_types(&mut self) -> Result<Option<Vec<String>>, String> {
        if self.call.get("hooks").is_none() {
            return Ok(None);
        }
        self.record("types")?;
        Ok(Some(
            self.call["hooks"]["types"]
                .as_array()
                .unwrap()
                .iter()
                .map(|v| v.as_str().unwrap().into())
                .collect(),
        ))
    }
    fn hook_listener_count(&mut self) -> Result<Option<usize>, String> {
        if self.call.get("hooks").is_none() {
            return Ok(None);
        }
        self.record("listeners")?;
        Ok(self.call["hooks"]["listeners"].as_u64().map(|n| n as usize))
    }
}
fn status(mut call: Value) {
    call["op"] = json!("nativeruntime.status");
    let expected = reference(call.clone());
    let events = Arc::new(Mutex::new(vec![]));
    let e = events.clone();
    let now = call["now"].as_i64().unwrap();
    let mut sources = Sources {
        call: call.clone(),
        events: events.clone(),
    };
    let result = gateway_status(
        &mut sources,
        call["startedAt"].as_f64().unwrap(),
        Some(Arc::new(move || {
            e.lock().unwrap().push(json!("now"));
            now
        })),
    )
    .unwrap_or_else(|_| json!({"error":true}));
    assert_eq!(
        json!({"result":result,"events":*events.lock().unwrap()}),
        expected
    );
}
#[test]
fn gateway_status_optional_services_uptime_floor_filters_and_source_failure_order() {
    for started in [0, 1, 999, 1000, 1001, 2001, 100000] {
        status(json!({"now":2000,"startedAt":started}));
    }
    let call = json!({"now":1700000000123i64,"startedAt":1699999999124i64,"sessions":[1,2],"surfaces":[1],"devices":3,
        "jobs":[{"enabled":true},{"enabled":false},{"enabled":null},{"enabled":1},{"enabled":""},{"enabled":[]}],
        "hooks":{"types":["x","x","y"],"listeners":7}});
    status(call.clone());
    for error in [
        "sessions",
        "surfaces",
        "devices",
        "jobs",
        "types",
        "listeners",
    ] {
        let mut c = call.clone();
        c["error"] = json!(error);
        status(c);
    }
    status(json!({"now":0,"startedAt":1,"jobs":null}));
}
#[derive(Clone, Serialize)]
#[serde(untagged)]
enum StepResult {
    Message(AgentMessageResult),
    Other(Value),
}
#[test]
fn agent_messages_keep_live_arrays_only_for_nonempty_results_across_round_replacement() {
    let steps = json!([
        {"op":"execute","input":{"note":"ignored"}},{"op":"execute","round":""},
        {"op":"execute","round":"missing","input":{"note":"lost"}},
        {"op":"create","id":"r","count":3},{"op":"create","id":"other","count":1},
        {"op":"execute","round":"r","retain":"empty"},{"op":"execute","round":"other"},
        {"op":"execute","round":"r","from":" \u{feff}Alice \n","input":{"note":" hello \n"},"retain":"first"},
        {"op":"time","now":1001},{"op":"execute","round":"r","from":" ","input":{"note":"😀 next"}},
        {"op":"execute","round":"r","input":{"note":" "}},{"op":"observe","alias":"first"},{"op":"observe","alias":"empty"},
        {"op":"execute","round":"r","input":{"note":42}},{"op":"execute","round":"r","input":{"note":null}},
        {"op":"end","id":"r"},{"op":"execute","round":"r","input":{"note":"dropped"}},
        {"op":"create","id":"r","count":2},{"op":"execute","round":"r"},{"op":"execute","round":"r","input":{"note":"new round"}},
        {"op":"observe","alias":"first"},{"op":"create","id":"r","count":0},{"op":"execute","round":"r"}
    ]);
    let expected = reference(json!({"op":"nativeruntime.swarm","now":1000,"steps":steps}));
    let now = Arc::new(AtomicI64::new(1000));
    let clock = now.clone();
    let mailbox = SwarmMailbox::new(Arc::new(move || clock.load(Ordering::SeqCst)));
    let mut results = vec![];
    let mut aliases = HashMap::<String, StepResult>::new();
    for s in steps.as_array().unwrap() {
        let mut v = StepResult::Other(Value::Null);
        match s["op"].as_str().unwrap() {
            "create" => mailbox.create_round(
                s["id"].as_str().unwrap(),
                s["count"].as_u64().unwrap() as usize,
            ),
            "end" => mailbox.end_round(s["id"].as_str().unwrap()),
            "time" => now.store(s["now"].as_i64().unwrap(), Ordering::SeqCst),
            "execute" => {
                v = agent_message(
                    s.get("input").unwrap_or(&json!({})),
                    s["round"].as_str(),
                    s["from"].as_str(),
                    &mailbox,
                )
                .map(StepResult::Message)
                .unwrap_or_else(|_| StepResult::Other(json!({"error":true})))
            }
            "observe" => v = aliases[s["alias"].as_str().unwrap()].clone(),
            _ => panic!("bad step"),
        }
        if let Some(alias) = s["retain"].as_str() {
            aliases.insert(alias.into(), v.clone());
        }
        results.push(v);
    }
    assert_eq!(json!(results), expected);
}
