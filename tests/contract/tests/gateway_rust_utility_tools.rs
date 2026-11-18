#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::tools::{
    links,
    session_todos::{SessionTodos, TodoItems, TodoResult},
};
use serde::{Serialize, Serializer};
use serde_json::{Value, json};
use std::{collections::HashMap, fs, path::PathBuf};
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}
fn reference(call: Value) -> Value {
    let dir = root()
        .join(".jait/artifacts/gateway-rust/utility-tools")
        .join(uuid::Uuid::new_v4().to_string());
    fs::create_dir_all(&dir).unwrap();
    internal_driver::call(&root(), &dir, json!({"version":1,"calls":[call]}), &|| {
        false
    })
    .unwrap()[0]
        .clone()
}
#[test]
fn utility_metadata_matches_entire_reference_definitions() {
    assert_eq!(
        json!([
            jait_gateway::tools::session_todos::metadata(),
            links::metadata()
        ]),
        reference(json!({"op":"nativeutility.metadata"}))
    );
}
fn links(values: Vec<Value>) {
    for chunk in values.chunks(6) {
        let actual:Vec<_>=chunk.iter().map(|v|json!({"safe":links::safe_notification_link(&v["href"]),"parsed":links::parse_jait_rendered_link(v),"result":links::render_link(v)})).collect();
        let expected = reference(json!({"op":"nativeutility.links","values":chunk}));
        for (i, v) in actual.iter().enumerate() {
            assert_eq!(*v, expected[i], "input: {}", chunk[i]);
        }
    }
}
#[test]
fn internal_links_validate_path_label_control_fragment_and_utf16_boundaries() {
    let mut values = vec![
        Value::Null,
        json!(1),
        json!([]),
        json!({}),
        json!({"href":1,"label":"x"}),
    ];
    for href in [
        "/",
        "/chat?sessionId=a",
        "/email",
        "/pull-requests",
        "/agents",
        "/unknown",
        "/agents/detail",
        "https://evil.invalid/agents",
        "//evil.invalid/agents",
        "/\\evil.invalid/agents",
        "/agents#x",
        "/agents#",
        "/agents?",
        "/agents?x=%23",
        "#/agents",
        "/../agents",
        "/agents/../settings",
        " /agents",
        "/AGENTS",
        "/agents%2f",
        "/agents?x=😀",
        "/agents?x=\n",
        "/agents?x=%00",
    ] {
        for label in [
            Value::Null,
            json!(""),
            json!("  "),
            json!(" Label \u{feff}"),
            json!("bad\nlabel"),
            json!("DEL\u{007f}accepted"),
        ] {
            values.push(json!({"href":href,"label":label}));
        }
    }
    for len in [79, 80, 81] {
        values.push(json!({"href":"/","label":"😀".repeat(len)}));
    }
    for len in [4093, 4094, 4095] {
        values.push(json!({"href":format!("/?{}", "x".repeat(len)),"label":"x"}));
    }
    links(values);
}
#[test]
fn link_search_preserves_parameters_replaces_duplicates_and_form_encodes_unicode() {
    let mut values = vec![];
    for path in [
        "/",
        "/chat",
        "/email",
        "/emails",
        "/messenger",
        "/agents",
        "/threads",
        "/todo",
        "/settings",
        "/memory",
        "/calendar",
        "/pulls",
        "/pull-requests",
        "/jobs",
        "/network",
    ] {
        for search in [
            Value::Null,
            json!(1),
            json!(""),
            json!("from:alice + a&b~!*'() 😀"),
            json!(" providers "),
        ] {
            values.push(json!({"href":format!("{path}?x=1&q=first&y=2&q=second&encoded=%FF"),"label":" Search ","search":search}));
        }
    }
    values.push(json!({"href":"/","label":"x","search":"x".repeat(4096)}));
    links(values);
}
#[derive(Clone)]
struct LiveItems(TodoItems);
impl Serialize for LiveItems {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        self.0.lock().unwrap().serialize(s)
    }
}
#[derive(Clone, Serialize)]
#[serde(untagged)]
enum Step {
    Todo(TodoResult),
    Items(LiveItems),
    Other(Value),
}
fn todos(steps: Value) {
    let expected = reference(json!({"op":"nativeutility.todos","steps":steps}));
    let service = SessionTodos::default();
    let mut results = vec![];
    let mut aliases = HashMap::<String, Step>::new();
    for s in steps.as_array().unwrap() {
        let session = s["session"].as_str().unwrap_or("s");
        let v = match s["op"].as_str().unwrap() {
            "execute" => Step::Todo(service.execute(&s["input"], session)),
            "get" => Step::Items(LiveItems(service.get(session))),
            "clear" => {
                service.clear(session);
                Step::Other(Value::Null)
            }
            "observe" => aliases[s["alias"].as_str().unwrap()].clone(),
            "append" => {
                service.get(session).lock().unwrap().push(s["item"].clone());
                Step::Other(Value::Null)
            }
            "mutate" => {
                let items = service.get(session);
                let mut items = items.lock().unwrap();
                let index = s["index"].as_u64().unwrap() as usize;
                for (key, value) in s["patch"].as_object().unwrap() {
                    items[index][key] = value.clone();
                }
                Step::Other(Value::Null)
            }
            _ => panic!("bad step"),
        };
        if let Some(alias) = s["retain"].as_str() {
            aliases.insert(alias.into(), v.clone());
        }
        results.push(v);
    }
    assert_eq!(json!(results), expected);
}
#[test]
fn todos_normalize_full_lists_isolate_sessions_and_preserve_getter_result_identity() {
    todos(json!([
     {"op":"get","retain":"absent"},{"op":"append","item":{"id":99,"title":"Lost","status":"completed"}},{"op":"get"},{"op":"observe","alias":"absent"},
     {"op":"execute","input":{"todoList":[{"id":1,"title":"First","status":"in-progress","ignored":true},{"id":2,"title":"Second","status":"completed"}]},"retain":"first"},
     {"op":"get","retain":"getter"},{"op":"get","session":"other"},
     {"op":"mutate","index":0,"patch":{"title":"Changed","status":"completed"}},{"op":"append","item":{"id":3,"title":"Added","status":"not-started"}},
     {"op":"observe","alias":"first"},{"op":"observe","alias":"getter"},
     {"op":"execute","input":{"todoList":[{"id":4,"title":"Replacement","status":"in-progress"}]},"retain":"replacement"},
     {"op":"clear"},{"op":"observe","alias":"replacement"},{"op":"observe","alias":"first"},{"op":"get"},
     {"op":"execute","session":"other","input":{"todoList":[]}},{"op":"execute","session":"","input":{"todoList":[{"id":1,"title":"Empty session","status":"completed"}]}},{"op":"get","session":""}
    ]));
}
#[test]
fn todo_invalid_updates_leave_prior_state_and_runtime_values_follow_reference_normalization() {
    todos(json!([
     {"op":"execute","input":{"todoList":[{"id":1,"title":"Keep","status":"not-started"}]}},
     {"op":"execute","input":{}},{"op":"get"},{"op":"execute","input":{"todoList":null}},{"op":"get"},
     {"op":"execute","input":{"todoList":42}},{"op":"execute","input":{"todoList":{}}},{"op":"execute","input":{"todoList":"bad"}},
     {"op":"execute","input":{"todoList":[{"id":2,"title":"partial","status":"in-progress"},null]}},{"op":"get"},
     {"op":"execute","input":null},{"op":"get"},
     {"op":"execute","input":{"todoList":[1,false,[],{},{"status":"in-progress"},{"id":1,"status":"in-progress","title":null},{"id":1,"status":"other","title":"duplicate"},{"id":1,"status":"in-progress","title":{"x":1}},{"id":2,"status":"in-progress","title":[1,null,"x"]}]}},
     {"op":"get"},{"op":"clear"},{"op":"get"}
    ]));
}
