//! Session-local full-list todo updates with retained array identity.
use serde::{Serialize, Serializer};
use serde_json::{Map, Value, json};
use std::{
    collections::HashMap,
    sync::LazyLock,
    sync::{Arc, Mutex},
};
pub type TodoItems = Arc<Mutex<Vec<Value>>>;
#[derive(Clone)]
pub struct TodoData(TodoItems);
impl Serialize for TodoData {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        json!({"items":*self.0.lock().unwrap()}).serialize(serializer)
    }
}
#[derive(Clone, Serialize)]
pub struct TodoResult {
    pub ok: bool,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<TodoData>,
}
pub fn metadata() -> &'static Value {
    static VALUE: LazyLock<Value> = LazyLock::new(|| {
        serde_json::from_str(include_str!("session-todos-metadata.json"))
            .expect("embedded todo definition")
    });
    &VALUE
}
#[derive(Default)]
pub struct SessionTodos {
    sessions: Mutex<HashMap<String, TodoItems>>,
}
fn js_text(value: Option<&Value>) -> String {
    match value {
        None => "undefined".into(),
        Some(Value::Null) => "null".into(),
        Some(Value::String(s)) => s.clone(),
        Some(Value::Array(a)) => a
            .iter()
            .map(|v| {
                if v.is_null() {
                    String::new()
                } else {
                    js_text(Some(v))
                }
            })
            .collect::<Vec<_>>()
            .join(","),
        Some(Value::Object(_)) => "[object Object]".into(),
        Some(v) => v.to_string(),
    }
}
impl SessionTodos {
    pub fn get(&self, session: &str) -> TodoItems {
        self.sessions
            .lock()
            .unwrap()
            .get(session)
            .cloned()
            .unwrap_or_else(|| Arc::new(Mutex::new(vec![])))
    }
    pub fn clear(&self, session: &str) {
        self.sessions.lock().unwrap().remove(session);
    }
    pub fn execute(&self, input: &Value, session: &str) -> TodoResult {
        let result = (|| -> Result<TodoResult, String> {
            // Preserve the reference Bun runtime's caught TypeError text at
            // invalid JSON boundaries; valid calls never depend on these strings.
            if input.is_null() {
                return Err("null is not an object (evaluating 'input.todoList')".into());
            }
            let items = match input.get("todoList") {
                None => return Err("undefined is not an object (evaluating 'input.todoList.map')".into()),
                Some(Value::Null) => return Err("null is not an object (evaluating 'input.todoList.map')".into()),
                Some(Value::Array(items)) => items,
                _ => return Err("input.todoList.map is not a function. (In 'input.todoList.map((t) => ({\n          id: t.id,\n          title: t.title,\n          status: t.status\n        }))', 'input.todoList.map' is undefined)".into()),
            };
            let normalized: Vec<Value> = items
                .iter()
                .map(|item| {
                    if item.is_null() {
                        return Err("null is not an object (evaluating 't.id')".to_string());
                    }
                    let mut output = Map::new();
                    for key in ["id", "title", "status"] {
                        if let Some(value) = item.get(key) {
                            output.insert(key.into(), value.clone());
                        }
                    }
                    Ok(Value::Object(output))
                })
                .collect::<Result<_, _>>()?;
            let items = Arc::new(Mutex::new(normalized));
            self.sessions
                .lock()
                .unwrap()
                .insert(session.into(), items.clone());
            let values = items.lock().unwrap();
            let completed = values.iter().filter(|t| t["status"] == "completed").count();
            let titles = values
                .iter()
                .filter(|t| t["status"] == "in-progress")
                .map(|t| format!("\"{}\"", js_text(t.get("title"))))
                .collect::<Vec<_>>()
                .join(", ");
            let message = format!(
                "Todo list updated ({}/{} done).{}",
                completed,
                values.len(),
                if titles.is_empty() {
                    String::new()
                } else {
                    format!(" Working on: {titles}")
                }
            );
            drop(values);
            Ok(TodoResult {
                ok: true,
                message,
                data: Some(TodoData(items)),
            })
        })();
        result.unwrap_or_else(|message| TodoResult {
            ok: false,
            message,
            data: None,
        })
    }
}
