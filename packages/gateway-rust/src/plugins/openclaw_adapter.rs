//! OpenClaw manifest and contribution compatibility, without pretending to execute
//! JavaScript. Native/external executable handles are supplied by an authorized
//! host; unsupported registrations are explicit bounded diagnostics.
use super::{
    contracts::*,
    manager::{Operation, Result},
};
use crate::security::{contracts::Risk, tool_permissions::ConsentLevel};
use futures_util::future::BoxFuture;
use serde_json::{Map, Value, json};
use std::sync::Arc;
fn error(s: impl Into<String>) -> PluginError {
    PluginError::Error(s.into())
}

/// Serde writes into a capped buffer instead of allocating an unbounded JSON
/// string and checking its length afterwards.
pub(super) fn bounded_json(value: &Value, pretty: bool, limit: usize) -> Result<Vec<u8>> {
    struct Buffer {
        bytes: Vec<u8>,
        limit: usize,
    }
    impl std::io::Write for Buffer {
        fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
            if bytes.len() > self.limit.saturating_sub(self.bytes.len()) {
                return Err(std::io::Error::other("OpenClaw JSON byte limit exceeded"));
            }
            self.bytes.extend_from_slice(bytes);
            Ok(bytes.len())
        }
        fn flush(&mut self) -> std::io::Result<()> {
            Ok(())
        }
    }
    let mut buffer = Buffer {
        bytes: vec![],
        limit,
    };
    if pretty {
        serde_json::to_writer_pretty(&mut buffer, value)
    } else {
        serde_json::to_writer(&mut buffer, value)
    }
    .map_err(|e| error(e.to_string()))?;
    Ok(buffer.bytes)
}

pub fn to_jait_manifest(oc: &Value) -> Result<Value> {
    bounded_json(oc, false, 262144)?;
    let id = oc["id"]
        .as_str()
        .filter(|s| !s.is_empty())
        .ok_or_else(|| error("OpenClaw manifest must have a non-empty id"))?;
    // OpenClaw ids cannot escape paths or forge a Jait namespace. Reuse the
    // existing native validator on the base id, before adding openclaw:.
    let base = json!({"id":id,"displayName":id,"version":"0.0.0"});
    if let Some(message) = super::manifest::validate_manifest(&base) {
        return Err(error(message));
    }
    for field in ["name", "version", "description"] {
        if oc
            .get(field)
            .is_some_and(|v| !v.is_null() && !v.is_string())
        {
            return Err(error(format!("OpenClaw {field} must be a string")));
        }
    }
    let tools = string_list(oc.get("contracts").and_then(|v| v.get("tools")))?;
    let channels = string_list(oc.get("channels"))?;
    let name = oc["name"].as_str().unwrap_or(id);
    let mut manifest = json!({
        "id":format!("openclaw:{id}"),"displayName":name,
        "version":oc["version"].as_str().unwrap_or("0.0.0"),"author":"OpenClaw",
        "main":"index.ts","categories":["openclaw"],
        "contributes":{
            "tools":tools.iter().map(|name|json!({"name":name,"description":name})).collect::<Vec<_>>(),
            "channels":channels.iter().map(|id| { let mut c=json!({"id":id,"displayName":oc["name"].as_str().unwrap_or(id)}); if let Some(d)=oc.get("description") { c["description"]=d.clone(); } c }).collect::<Vec<_>>()
        }
    });
    for field in ["description", "configSchema"] {
        if let Some(value) = oc.get(field) {
            manifest[field] = value.clone();
        }
    }
    Ok(manifest)
}
fn string_list(value: Option<&Value>) -> Result<Vec<String>> {
    match value {
        None | Some(Value::Null) => Ok(vec![]),
        Some(Value::Array(items)) if items.len() <= 256 => items
            .iter()
            .map(|v| {
                v.as_str()
                    .map(str::to_owned)
                    .ok_or_else(|| error("OpenClaw contribution must be a string"))
            })
            .collect(),
        _ => Err(error(
            "OpenClaw contributions must be bounded string arrays",
        )),
    }
}
#[derive(Clone)]
pub struct OpenClawTool<H> {
    pub name: String,
    pub label: Option<String>,
    pub description: Option<String>,
    pub parameters: Option<Value>,
    pub execute: H,
}
pub fn convert_tool<H>(tool: OpenClawTool<H>) -> Result<PluginToolDeclaration<H>> {
    if tool.name.is_empty() || tool.name.len() > 256 {
        return Err(error("Invalid OpenClaw tool name"));
    }
    let parameters = tool
        .parameters
        .unwrap_or_else(|| json!({"type":"object","properties":{}}));
    bounded_json(&parameters, false, 262144)?;
    if tool
        .description
        .as_ref()
        .or(tool.label.as_ref())
        .is_some_and(|s| s.len() > 16384)
    {
        return Err(error("OpenClaw description byte limit exceeded"));
    }
    if !parameters.is_object() {
        return Err(error(
            "OpenClaw tool parameters must be a JSON schema object",
        ));
    }
    Ok(PluginToolDeclaration {
        description: tool
            .description
            .or(tool.label)
            .unwrap_or_else(|| tool.name.clone()),
        name: tool.name,
        parameters,
        tier: ToolTier::External,
        category: ToolCategory::External,
        risk: Risk::High,
        default_consent_level: ConsentLevel::Dangerous,
        extra: Map::new(),
        execute: tool.execute,
    })
}
/// Collection does not register effects. The manager's host admits the entire
/// resulting contribution atomically under its plugin identity.
pub struct OpenClawRegistrations<C, H> {
    tools: Vec<PluginToolDeclaration<H>>,
    channels: Vec<(String, C)>,
    unsupported: Vec<String>,
    limit: usize,
}
impl<C, H> OpenClawRegistrations<C, H> {
    pub fn new(limit: usize) -> Self {
        Self {
            tools: vec![],
            channels: Vec::new(),
            unsupported: vec![],
            limit,
        }
    }
    fn capacity(&self) -> Result<()> {
        if self.tools.len() + self.channels.len() + self.unsupported.len() >= self.limit {
            Err(error("OpenClaw registration limit exceeded"))
        } else {
            Ok(())
        }
    }
    pub fn register_tool(&mut self, tool: OpenClawTool<H>) -> Result<()> {
        self.capacity()?;
        let tool = convert_tool(tool)?;
        if self.tools.iter().any(|t| t.name == tool.name) {
            return Err(error("Duplicate OpenClaw tool name"));
        }
        self.tools.push(tool);
        Ok(())
    }
    pub fn register_channel(&mut self, id: String, channel: C) -> Result<()> {
        if !self.channels.iter().any(|(existing, _)| existing == &id) {
            self.capacity()?;
        }
        if id.is_empty() || id.len() > 256 {
            return Err(error("Invalid channel id"));
        }
        if let Some((_, existing)) = self
            .channels
            .iter_mut()
            .find(|(existing, _)| existing == &id)
        {
            *existing = channel;
        } else {
            self.channels.push((id, channel));
        }
        Ok(())
    }
    /// Equivalent to TS diagnostic collection, but never retain unknown argument
    /// values (which may contain tokens or large payloads).
    pub fn unsupported(&mut self, method: &str) -> Result<()> {
        self.capacity()?;
        self.unsupported.push(method.chars().take(128).collect());
        Ok(())
    }
    pub fn finish(self) -> (PluginContribution<C, H>, Vec<String>) {
        (
            PluginContribution {
                tools: Some(self.tools),
                channels: Some(
                    self.channels
                        .into_iter()
                        .map(|(_, channel)| channel)
                        .collect(),
                ),
                settings_schema: None,
                permissions: None,
            },
            self.unsupported,
        )
    }
}
/// Explicit tool execution boundary. The supplied implementation must preserve the
/// admitted tool context, scope and effect cancellation; this adapter forwards
/// the exact borrowed context without synthesizing or weakening authority.
pub trait OpenClawExecutor<Q: Sync>: Send + Sync {
    fn execute<'a>(
        &'a self,
        call_id: String,
        params: Value,
        context: &'a Q,
        op: &'a Operation,
    ) -> BoxFuture<'a, Result<Value>>;
}
pub struct OpenClawToolHandle<Q: Sync> {
    pub executor: Arc<dyn OpenClawExecutor<Q>>,
    pub max_input_bytes: usize,
    pub max_output_bytes: usize,
}
impl<Q: Sync> OpenClawToolHandle<Q> {
    pub async fn execute(&self, input: Value, context: &Q, op: &Operation) -> Result<Value> {
        op.check()?;
        let params = if input.is_object() || input.is_array() {
            input
        } else {
            json!({})
        };
        bounded_json(&params, false, self.max_input_bytes.min(1048576))?;
        let call_id = format!("jait-{}", chrono::Utc::now().timestamp_millis());
        let result = op
            .run(self.executor.execute(call_id, params, context, op))
            .await;
        match result {
            Ok(value) => {
                let message = match value {
                    Value::String(text) => text,
                    other => String::from_utf8(bounded_json(
                        &other,
                        true,
                        self.max_output_bytes.min(4 * 1048576),
                    )?)
                    .map_err(|e| error(e.to_string()))?,
                };
                if message.len() > self.max_output_bytes.min(4 * 1048576) {
                    return Err(error("OpenClaw tool output byte limit exceeded"));
                }
                Ok(json!({"ok":true,"message":message}))
            }
            Err(e) => {
                op.check()?;
                let message = match e {
                    PluginError::Error(text) => text,
                    PluginError::Thrown(_) => "Plugin threw a non-string value".into(),
                };
                if message.len().saturating_add(7) > self.max_output_bytes.min(4 * 1048576) {
                    return Err(error("OpenClaw tool output byte limit exceeded"));
                }
                let message = format!("Error: {message}");
                Ok(json!({"ok":false,"message":message}))
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{sync::atomic::Ordering, time::Duration};
    #[test]
    fn manifest_conversion_keeps_contributions_and_rejects_namespace_forgery() {
        let m=to_jait_manifest(&json!({"id":"test","name":"Test","channels":["telegram"],"contracts":{"tools":["hello"]},"configSchema":{"type":"object"}})).unwrap();
        assert_eq!(m["id"], "openclaw:test");
        assert_eq!(m["version"], "0.0.0");
        assert_eq!(m["contributes"]["tools"][0]["name"], "hello");
        assert_eq!(m["configSchema"]["type"], "object");
        for id in ["../escape", "openclaw:forged", ""] {
            assert!(to_jait_manifest(&json!({"id":id})).is_err());
        }
        assert!(to_jait_manifest(&json!({"id":"test","channels":[1]})).is_err());
    }
    #[test]
    fn registration_is_bounded_and_retains_dangerous_consent() {
        let mut r = OpenClawRegistrations::<(), usize>::new(2);
        r.register_tool(OpenClawTool {
            name: "tool".into(),
            label: Some("Label".into()),
            description: None,
            parameters: None,
            execute: 7,
        })
        .unwrap();
        r.unsupported("registerHttpRoute").unwrap();
        assert!(r.unsupported("registerHook").is_err());
        let (c, diagnostics) = r.finish();
        let t = &c.tools.unwrap()[0];
        assert_eq!(t.execute, 7);
        assert_eq!(t.description, "Label");
        assert_eq!(t.risk, Risk::High);
        assert_eq!(t.default_consent_level, ConsentLevel::Dangerous);
        assert_eq!(diagnostics, ["registerHttpRoute"]);
    }
    #[test]
    fn channel_replacement_matches_dedupe() {
        let mut r = OpenClawRegistrations::<usize, ()>::new(1);
        r.register_channel("telegram".into(), 1).unwrap();
        r.register_channel("telegram".into(), 2).unwrap();
        assert!(r.register_channel("teams".into(), 3).is_err());
        assert_eq!(r.finish().0.channels.unwrap(), [2]);
    }
    struct Executor;
    impl OpenClawExecutor<()> for Executor {
        fn execute<'a>(
            &'a self,
            id: String,
            input: Value,
            _: &'a (),
            _: &'a Operation,
        ) -> BoxFuture<'a, Result<Value>> {
            Box::pin(async move {
                assert!(id.starts_with("jait-"));
                assert!(input.is_object());
                Ok(json!({"answer":42}))
            })
        }
    }
    #[tokio::test]
    async fn execution_formats_output_and_enforces_limits_cancel() {
        let op = Operation::new(Duration::from_secs(1));
        let h = OpenClawToolHandle {
            executor: Arc::new(Executor),
            max_input_bytes: 32,
            max_output_bytes: 128,
        };
        assert_eq!(
            h.execute(Value::Null, &(), &op).await.unwrap(),
            json!({"ok":true,"message":"{\n  \"answer\": 42\n}"})
        );
        assert!(
            h.execute(json!({"long":"x".repeat(100)}), &(), &op)
                .await
                .is_err()
        );
        op.cancelled.store(true, Ordering::Release);
        assert!(h.execute(json!({}), &(), &op).await.is_err());
    }
    struct Failing;
    impl OpenClawExecutor<()> for Failing {
        fn execute<'a>(
            &'a self,
            _: String,
            _: Value,
            _: &'a (),
            _: &'a Operation,
        ) -> BoxFuture<'a, Result<Value>> {
            Box::pin(async { Err(PluginError::Error("failure".into())) })
        }
    }
    #[tokio::test]
    async fn execution_errors_are_tool_results_and_large_json_is_bounded() {
        let op = Operation::new(Duration::from_secs(1));
        let h = OpenClawToolHandle {
            executor: Arc::new(Failing),
            max_input_bytes: 32,
            max_output_bytes: 128,
        };
        assert_eq!(
            h.execute(json!({}), &(), &op).await.unwrap(),
            json!({"ok":false,"message":"Error: failure"})
        );
        let h = OpenClawToolHandle {
            executor: Arc::new(Executor),
            max_input_bytes: 32,
            max_output_bytes: 4,
        };
        assert!(h.execute(json!({}), &(), &op).await.is_err());
        assert!(bounded_json(&json!({"large":"x".repeat(1000)}), true, 10).is_err());
    }
    #[test]
    fn channel_dedupe_preserves_first_insertion_order() {
        let mut r = OpenClawRegistrations::<usize, ()>::new(3);
        r.register_channel("z".into(), 1).unwrap();
        r.register_channel("a".into(), 2).unwrap();
        r.register_channel("z".into(), 3).unwrap();
        assert_eq!(r.finish().0.channels.unwrap(), [3, 2]);
    }
    struct ContextExecutor;
    impl OpenClawExecutor<usize> for ContextExecutor {
        fn execute<'a>(
            &'a self,
            _: String,
            _: Value,
            context: &'a usize,
            _: &'a Operation,
        ) -> BoxFuture<'a, Result<Value>> {
            Box::pin(async move { Ok(json!(context)) })
        }
    }
    #[tokio::test]
    async fn executor_receives_the_callers_context_unchanged() {
        let h = OpenClawToolHandle {
            executor: Arc::new(ContextExecutor),
            max_input_bytes: 32,
            max_output_bytes: 32,
        };
        assert_eq!(
            h.execute(json!({}), &77, &Operation::new(Duration::from_secs(1)))
                .await
                .unwrap(),
            json!({"ok":true,"message":"77"})
        );
    }
}
