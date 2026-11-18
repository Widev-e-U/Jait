//! Calendar API adapters with injectable native HTTP transport.
pub mod google;
pub mod oauth;
pub mod service;
use futures_util::future::BoxFuture;
use serde::Serialize;
use serde_json::Value;
use std::sync::Arc;
#[derive(Clone, Debug, Serialize)]
pub struct Request {
    pub url: String,
    pub method: String,
    pub headers: serde_json::Map<String, Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body: Option<String>,
}
pub struct Response {
    pub status: u16,
    pub data: Result<Value, String>,
}
pub type Transport =
    Arc<dyn Fn(Request) -> BoxFuture<'static, Result<Response, String>> + Send + Sync>;
pub fn native_transport() -> Result<Transport, String> {
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::limited(20))
        .build()
        .map_err(|e| e.to_string())?;
    Ok(Arc::new(move |request| {
        let client = client.clone();
        Box::pin(async move {
            let method = reqwest::Method::from_bytes(request.method.as_bytes())
                .map_err(|e| e.to_string())?;
            let mut builder = client.request(method, &request.url);
            for (key, value) in request.headers {
                builder = builder.header(key, value.as_str().ok_or("header must be a string")?);
            }
            if let Some(body) = request.body {
                builder = builder.body(body);
            }
            let response = builder.send().await.map_err(|e| e.to_string())?;
            let status = response.status().as_u16();
            let data = response.json::<Value>().await.map_err(|e| e.to_string());
            Ok(Response { status, data })
        })
    }))
}
pub(crate) fn truthy(value: &Value) -> bool {
    match value {
        Value::Null => false,
        Value::Bool(b) => *b,
        Value::Number(n) => n.as_f64().is_some_and(|n| n != 0.0),
        Value::String(s) => !s.is_empty(),
        _ => true,
    }
}
pub(crate) fn nullish(value: Option<&Value>, fallback: Value) -> Value {
    value.filter(|v| !v.is_null()).cloned().unwrap_or(fallback)
}
pub(crate) fn js_text(value: &Value) -> String {
    match value {
        Value::String(s) => s.clone(),
        Value::Null => "null".into(),
        Value::Object(_) => "[object Object]".into(),
        Value::Array(a) => a
            .iter()
            .map(|v| {
                if v.is_null() {
                    String::new()
                } else {
                    js_text(v)
                }
            })
            .collect::<Vec<_>>()
            .join(","),
        Value::Number(n) => ryu_js::Buffer::new()
            .format(n.as_f64().unwrap())
            .to_string(),
        Value::Bool(b) => b.to_string(),
    }
}
pub(crate) fn field<'a>(value: &'a Value, key: &str) -> Option<&'a Value> {
    value.as_object().and_then(|o| o.get(key))
}
pub(crate) fn items(data: &Value) -> Result<&[Value], String> {
    if data.is_null() {
        return Err("Invalid provider response shape".into());
    }
    match field(data, "items").filter(|v| !v.is_null()) {
        None => Ok(&[]),
        Some(Value::Array(a)) => Ok(a),
        _ => Err("Invalid provider response shape".into()),
    }
}

pub mod types;
pub use service::CalendarService;
pub use types::{
    CalendarAccount, CalendarEvent, CalendarInfo, CalendarProvider, CalendarTokens,
    DeviceCalendarSnapshot, ListCalendarEventsOptions,
};
