//! Calendar tool presentation and explicit integration with the native account service.
use crate::{
    services::calendar::{js_text, service::CalendarService, truthy},
    tools::list_preview::format_ellipsed_list,
};
use futures_util::future::BoxFuture;
use serde_json::{Value, json};
use std::sync::{Arc, LazyLock};
#[derive(Debug, Clone)]
pub enum ToolError {
    Message(String),
    NonError,
}
pub type Backend = Arc<dyn Fn(Value) -> BoxFuture<'static, Result<Value, ToolError>> + Send + Sync>;
pub struct CalendarTools {
    backend: Backend,
}
pub fn metadata() -> &'static Value {
    static METADATA: LazyLock<Value> = LazyLock::new(|| {
        serde_json::from_str(include_str!("calendar-metadata.json"))
            .expect("embedded calendar tool metadata")
    });
    &METADATA
}
fn projected(account: &Value) -> Value {
    let mut result = json!({});
    for k in ["id", "email", "provider"] {
        if let Some(v) = account.get(k) {
            result[k] = v.clone();
        }
    }
    result
}
fn js_field(value: &Value, key: &str) -> String {
    value
        .get(key)
        .map(js_text)
        .unwrap_or_else(|| "undefined".into())
}
fn slice_utf16(s: &str, max: usize) -> String {
    String::from_utf16_lossy(&s.encode_utf16().take(max).collect::<Vec<_>>())
}
fn format(kind: &str, data: Value) -> Result<Value, ToolError> {
    let account = &data["account"];
    let field = if kind == "calendar_list" {
        "calendars"
    } else {
        "events"
    };
    let items = data[field]
        .as_array()
        .ok_or_else(|| ToolError::Message("Invalid calendar service result".into()))?;
    let lines = items
        .iter()
        .map(|v| -> Result<String, ToolError> {
            if kind == "calendar_list" {
                Ok(format!(
                    "• {}{}{} — {}",
                    js_field(v, "name"),
                    if truthy(&v["primary"]) {
                        " [primary]"
                    } else {
                        ""
                    },
                    if truthy(&v["selected"]) {
                        ""
                    } else {
                        " [unselected]"
                    },
                    js_field(v, "timeZone")
                ))
            } else {
                let start = v["start"]
                    .as_str()
                    .ok_or_else(|| ToolError::Message("Invalid calendar event start".into()))?;
                let when = if start.contains('T') {
                    slice_utf16(start, 16).replacen('T', " ", 1)
                } else {
                    slice_utf16(start, 10)
                };
                Ok::<_, ToolError>(format!(
                    "• {} — {} ({}){}",
                    when,
                    js_field(v, "title"),
                    js_field(v, "calendarName"),
                    if truthy(&v["location"]) {
                        format!(" — {}", js_field(v, "location"))
                    } else {
                        String::new()
                    }
                ))
            }
        })
        .collect::<Result<Vec<_>, ToolError>>();
    // Build the lines with the fallible branch retained for malformed service values.
    let lines = lines?;
    let noun = if kind == "calendar_list" {
        "calendar"
    } else {
        "event"
    };
    let suffix = if lines.is_empty() {
        ".".into()
    } else {
        format!(
            ":\n{}",
            String::from_utf16_lossy(
                &format_ellipsed_list(
                    &lines
                        .iter()
                        .map(|s| crate::contracts::bounded_json::Utf16Text(
                            s.encode_utf16().collect()
                        ))
                        .collect::<Vec<_>>(),
                    Some(20.0)
                )
                .0
            )
        )
    };
    let mut out = json!({"ok":true,"message":format!("{} {noun}(s) from {}{suffix}",items.len(),js_field(account,"email")),"data":{"account":projected(account)}});
    out["data"][field] = data[field].clone();
    Ok(out)
}
impl CalendarTools {
    pub fn with_backend(backend: Backend) -> Self {
        Self { backend }
    }
    pub fn new(calendar: Arc<CalendarService>) -> Self {
        Self::with_backend(Arc::new(move |call| {
            let calendar = calendar.clone();
            Box::pin(async move {
                let user = call["userId"].as_str();
                let account = call["accountId"].as_str();
                let result = if call["method"] == "listCalendars" {
                    calendar.list_calendars(user, account).await
                } else {
                    calendar.list_events(user, account, &call["options"]).await
                };
                result.map_err(|e| ToolError::Message(e.to_string()))
            })
        }))
    }
    pub async fn execute(&self, name: &str, input: &Value, user: Option<&str>) -> Value {
        let is_list = name == "calendar_list";
        if !is_list && name != "calendar_events" {
            return json!({"ok":false,"message":"Unknown calendar tool"});
        }
        let mut call =
            json!({"method":if is_list{"listCalendars"}else{"listEvents"},"userId":user});
        if let Some(v) = input.get("accountId") {
            call["accountId"] = v.clone();
        }
        if !is_list {
            let mut options = json!({});
            for k in ["calendarId", "timeMin", "timeMax", "query", "limit"] {
                if let Some(v) = input.get(k) {
                    options[k] = v.clone();
                }
            }
            call["options"] = options;
        }
        let result = match (self.backend)(call).await {
            Ok(v) => format(name, v),
            Err(e) => Err(e),
        };
        result.unwrap_or_else(|e|json!({"ok":false,"message":match e{ToolError::Message(s)=>s,ToolError::NonError=>if is_list{"Failed to list calendars".into()}else{"Failed to list calendar events".into()}}}))
    }
}
