#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::tools::core::*;
use serde_json::{Value, json};
use std::{path::PathBuf, sync::Arc};
fn reference(call: Value) -> Value {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap();
    internal_driver::call(
        &root,
        &root
            .join(".jait/artifacts/gateway-rust/core-exports/contracts")
            .join(uuid::Uuid::new_v4().to_string()),
        json!({"version":1,"calls":[call]}),
        &|| false,
    )
    .unwrap()[0]
        .clone()
}
#[test]
fn source_barrel_reexports_the_same_ten_actual_implementations() {
    let names = [
        "clearSessionTodos",
        "createAgentTool",
        "createEditTool",
        "createExecuteTool",
        "createJaitTool",
        "createReadTool",
        "createSearchTool",
        "createTodoTool",
        "createWebTool",
        "getSessionTodos",
    ];
    let mut same = json!({});
    for name in names {
        same[name] = json!(true);
    }
    assert_eq!(
        reference(json!({"op":"nativecoreexports.identities"})),
        json!({"exports":names,"same":same})
    );
}
#[tokio::test]
async fn todo_factories_share_exported_session_store_and_clear_removes_only_the_mapping() {
    let session = uuid::Uuid::new_v4().to_string();
    let steps = json!([
    {"input":{"todoList":[{"id":1,"title":"prepare","status":"in-progress"},{"id":2,"title":"review","status":"not-started"}]}},
    {"other":true,"input":{"todoList":[{"id":1,"title":"done","status":"completed"}]}},
    {"clear":true},
    {"input":{"todoList":[{"id":3,"title":"restart","status":"not-started"}]}}
    ]);
    let expected =
        reference(json!({"op":"nativecoreexports.todo","session":session,"steps":steps}));
    clear_session_todos(&session);
    let mut held = None;
    let tool = create_todo_tool();
    let other = create_todo_tool();
    let context = json!({"sessionId":session});
    let mut events = vec![];
    let mut states = vec![];
    for step in steps.as_array().unwrap() {
        if step["clear"] == true {
            clear_session_todos(&session);
        } else {
            let result = if step["other"] == true {
                other.execute(&step["input"], &context).await
            } else {
                tool.execute(&step["input"], &context).await
            };
            assert!(result.ok, "valid todo fixture failed: {}", result.message);
            events.push(result);
            held.get_or_insert_with(|| get_session_todos(&session));
        }
        let current = get_session_todos(&session);
        states.push(json!({"current":*current.lock().unwrap(),"sameHeld":held.as_ref().is_some_and(|h|Arc::ptr_eq(h,&current))}));
    }
    let held = held.unwrap();
    // Serialize after all operations to observe retained result-array identity.
    let current = get_session_todos(&session);
    let actual = json!({"metadata":tool.definition(),"events":events,"held":*held.lock().unwrap(),"states":states,"otherSession":*get_session_todos(&(session.clone()+"-isolated")).lock().unwrap(),"current":*current.lock().unwrap()});
    assert_eq!(actual, expected);
    clear_session_todos(&session);
}
#[test]
fn public_todo_item_type_preserves_source_status_spellings() {
    for status in ["not-started", "in-progress", "completed"] {
        let value = json!({"id":1,"title":"task","status":status});
        let item: TodoItem = serde_json::from_value(value.clone()).unwrap();
        assert_eq!(serde_json::to_value(item).unwrap(), value);
    }
    assert!(
        serde_json::from_value::<TodoItem>(json!({"id":1,"title":"task","status":"pending"}))
            .is_err()
    );
}
