//! Surface tool adapters over the native registry and an authorized browser port.
use super::core_io::{HostError, HostPort};
use crate::contracts::bounded_json::Utf16Text;
use crate::surfaces::registry::{SurfaceRegistry, SurfaceStartInput};
#[derive(serde::Serialize)]
pub struct SurfaceListResult {
    pub ok: bool,
    pub message: Utf16Text,
    pub data: Value,
}
use serde_json::{Value, json};
use std::sync::{Arc, LazyLock};
pub struct SurfaceTools {
    pub registry: SurfaceRegistry,
    browser: Option<HostPort<Value>>,
    new_id: Arc<dyn Fn() -> String + Send + Sync>,
}
fn truthy(v: &Value) -> bool {
    match v {
        Value::Null => false,
        Value::Bool(v) => *v,
        Value::String(v) => !v.is_empty(),
        Value::Number(v) => v.as_f64().is_some_and(|v| v != 0.0),
        _ => true,
    }
}
fn fallback<'a>(a: Option<&'a Value>, b: Option<&'a Value>) -> Option<&'a Value> {
    a.filter(|v| !v.is_null()).or(b)
}
impl SurfaceTools {
    pub fn new(registry: SurfaceRegistry, browser: Option<HostPort<Value>>) -> Self {
        Self {
            registry,
            browser,
            new_id: Arc::new(|| crate::db::identifiers::uuidv7().to_string()),
        }
    }
    pub fn with_id_source(mut self, source: Arc<dyn Fn() -> String + Send + Sync>) -> Self {
        self.new_id = source;
        self
    }
    pub fn list(&self) -> Result<SurfaceListResult, HostError> {
        let snapshots = self.registry.snapshots().map_err(HostError::Error)?;
        let lines = snapshots
            .iter()
            .map(|s| {
                let state = serde_json::to_value(s.state).expect("surface state");
                let mut line = Utf16Text::from(format!(
                    "• {} ({}) — {}",
                    s.id,
                    s.kind,
                    state.as_str().unwrap()
                ));
                if !s.session_id.is_empty() {
                    line.0.extend(" · session ".encode_utf16());
                    line.0.extend(s.session_id.encode_utf16().take(8));
                }
                line
            })
            .collect::<Vec<_>>();
        let mut message = Utf16Text::from(format!("{} active surface(s)", snapshots.len()));
        if lines.is_empty() {
            message.0.push('.' as u16);
        } else {
            message.0.extend(":\n".encode_utf16());
            message
                .0
                .extend(super::list_preview::format_ellipsed_list(&lines, None).0);
        }
        Ok(SurfaceListResult {
            ok: true,
            message,
            data: json!({"surfaces":snapshots,"registeredTypes":self.registry.registered_types()}),
        })
    }
    pub async fn start(&self, input: &Value, context: &Value) -> Value {
        match self.start_inner(input, context).await {
            Ok(v) => v,
            Err(HostError::Error(s)) => json!({"ok":false,"message":s}),
            Err(HostError::Thrown(_)) => json!({"ok":false,"message":"Failed to start surface"}),
        }
    }
    async fn start_inner(&self, input: &Value, context: &Value) -> Result<Value, HostError> {
        let kind = input["type"].as_str().unwrap_or("");
        if kind == "browser" {
            if truthy(&input["sessionId"]) && input["sessionId"] != context["sessionId"] {
                return Err(HostError::Error(
                    "Open a browser in the current chat.".into(),
                ));
            }
            let browser = self.browser.as_ref().ok_or_else(|| {
                HostError::Error("Browser navigation is unavailable".into())
            })?;
            let mut ctx = context.clone();
            if let Some(root) = fallback(input.get("projectRoot"), context.get("projectRoot")) {
                ctx["projectRoot"] = root.clone();
            }
            let url = fallback(input.get("url"), None).cloned().unwrap_or_else(|| json!(""));
            let mut result = browser("navigate", &json!({"url":url}), &ctx).await?;
            let surface = result["data"]["browserId"]
                .as_str()
                .and_then(|id| self.registry.surface(id));
            if !truthy(&result["ok"]) || surface.is_none() {
                return Ok(result);
            }
            let surface = surface.unwrap();
            let mut data = serde_json::to_value(surface.snapshot().map_err(HostError::Error)?)
                .expect("surface snapshot");
            if let Some(extra) = result["data"].as_object() {
                for (k, v) in extra {
                    data[k] = v.clone();
                }
            }
            result["message"] = json!(format!("Browser ready in chat: {}", surface.id()));
            result["data"] = data;
            return Ok(result);
        }
        let id = format!("{kind}-{}", (self.new_id)());
        let session = fallback(input.get("sessionId"), context.get("sessionId"))
            .and_then(Value::as_str)
            .unwrap_or("");
        let root = fallback(input.get("projectRoot"), context.get("projectRoot"))
            .and_then(Value::as_str)
            .unwrap_or("");
        let surface = self
            .registry
            .start_surface(
                kind,
                &id,
                SurfaceStartInput {
                    session_id: session.into(),
                    project_root: root.into(),
                    node_id: None,
                    properties: Default::default(),
                },
            )
            .await
            .map_err(HostError::Error)?;
        Ok(
            json!({"ok":true,"message":format!("Started {kind} surface: {id}"),"data":surface.snapshot().map_err(HostError::Error)?}),
        )
    }
    pub async fn stop(&self, input: &Value) -> Result<Value, HostError> {
        let id = input["surfaceId"].as_str().unwrap_or("");
        let stopped = self
            .registry
            .stop_surface(id, input["reason"].as_str().map(String::from))
            .await
            .map_err(HostError::Error)?;
        Ok(if stopped {
            json!({"ok":true,"message":format!("Stopped surface: {id}"),"data":{"surfaceId":id}})
        } else {
            json!({"ok":false,"message":format!("Surface not found: {id}")})
        })
    }
}
pub fn metadata() -> &'static Value {
    static VALUE: LazyLock<Value> = LazyLock::new(|| {
        serde_json::from_str(include_str!("surface-tools-metadata.json"))
            .expect("surface tool metadata")
    });
    &VALUE
}

#[cfg(test)]
mod drift_tests {
    use super::*;
    use std::sync::Mutex;

    #[tokio::test]
    async fn browser_start_forwards_navigation_url_and_context() {
        let calls = Arc::new(Mutex::new(Vec::new()));
        let seen = calls.clone();
        let browser: HostPort<Value> = Arc::new(move |method, input, context| {
            seen.lock().unwrap().push((method.to_owned(), input.clone(), context.clone()));
            Box::pin(async { Ok(json!({"ok":false,"message":"host rejected"})) })
        });
        let tools = SurfaceTools::new(SurfaceRegistry::default(), Some(browser));
        let result = tools.start(
            &json!({"type":"browser","url":"https://example.com","projectRoot":"/project"}),
            &json!({"sessionId":"chat","projectRoot":"/default"}),
        ).await;
        assert_eq!(result["message"], "host rejected");
        let calls = calls.lock().unwrap();
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].0, "navigate");
        assert_eq!(calls[0].1, json!({"url":"https://example.com"}));
        assert_eq!(calls[0].2["projectRoot"], "/project");
    }

    #[tokio::test]
    async fn browser_without_host_never_starts_a_blank_surface() {
        let tools = SurfaceTools::new(SurfaceRegistry::default(), None);
        let result = tools.start(&json!({"type":"browser"}), &json!({"sessionId":"chat"})).await;
        assert_eq!(result["ok"], false);
        assert_eq!(result["message"], "Browser navigation is unavailable");
    }
}
