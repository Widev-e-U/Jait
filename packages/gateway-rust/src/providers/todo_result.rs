//! Normalization of native and external provider todo result shapes.
use crate::{services::storage::json_text, text::js_trim};
use serde_json::{Value, json};
fn canonical(value: &Value) -> Value {
    serde_json::from_str(&json_text(value)).expect("finite JSON")
}
fn string(value: &Value) -> Result<String, String> {
    Ok(match value {
        Value::String(s) => s.clone(),
        Value::Null => "null".into(),
        Value::Bool(b) => b.to_string(),
        Value::Number(_) => json_text(value),
        Value::Array(a) => a
            .iter()
            .map(|v| {
                if v.is_null() {
                    Ok(String::new())
                } else {
                    string(v)
                }
            })
            .collect::<Result<Vec<_>, _>>()?
            .join(","),
        Value::Object(m) => {
            if m.contains_key("toString") {
                return Err("No default value".into());
            }
            "[object Object]".into()
        }
    })
}
fn normalize(items: &Value) -> Option<Value> {
    items
        .as_array()?
        .iter()
        .map(|item| {
            if !item["id"].is_number()
                || !item["title"].is_string()
                || !matches!(
                    item["status"].as_str(),
                    Some("not-started" | "in-progress" | "completed")
                )
            {
                return None;
            }
            Some(json!({"id":canonical(&item["id"]),"title":item["title"],"status":item["status"]}))
        })
        .collect::<Option<Vec<_>>>()
        .map(Value::Array)
}
pub fn extract_todo_result_items(
    tool_name: Option<&str>,
    data: &Value,
    args: &Value,
) -> Result<Option<Value>, String> {
    let name = js_trim(tool_name.unwrap_or("")).to_lowercase();
    let todo = name == "todo"
        || name == "todowrite"
        || name.ends_with("__todo")
        || name.ends_with("manage_todo_list");
    if let Some(items) = data.get("items").and_then(normalize) {
        return Ok(Some(items));
    }
    if !todo {
        return Ok(None);
    }
    if let Some(items) = args.get("todoList") {
        return Ok(normalize(items));
    }
    let Some(todos) = args.get("todos") else {
        return Ok(None);
    };
    let Some(todos) = todos.as_array() else {
        return Ok(None);
    };
    let mut mapped = vec![];
    for (index, item) in todos.iter().enumerate() {
        let status = string(
            item.get("status")
                .filter(|v| !v.is_null())
                .unwrap_or(&json!("pending")),
        )?;
        let status = match status.as_str() {
            "completed" => "completed",
            "in_progress" | "in-progress" => "in-progress",
            _ => "not-started",
        };
        let title = item
            .get("content")
            .filter(|v| !v.is_null())
            .or_else(|| item.get("title").filter(|v| !v.is_null()));
        mapped.push(json!({"id":item.get("id").filter(|v|v.is_number()).map(canonical).unwrap_or(json!(index)),
            "title":title.map(string).transpose()?.unwrap_or_default(),"status":status}));
    }
    Ok(normalize(&Value::Array(mapped)))
}
