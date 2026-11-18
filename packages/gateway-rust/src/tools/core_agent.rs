//! Core agent presentation and exact forwarding to the host's authorized spawn
//! adapter. No worker is created and no execution privileges are inferred here.
use futures_util::future::BoxFuture;
use serde_json::Value;
use std::sync::{Arc, LazyLock};
#[derive(Debug, PartialEq)]
pub enum AgentError {
    Error(String),
    Thrown(Value),
}
pub type SpawnPort<C> =
    Arc<dyn for<'a> Fn(&'a Value, &'a C) -> BoxFuture<'a, Result<Value, AgentError>> + Send + Sync>;
pub struct AgentTool<C> {
    inner: SpawnPort<C>,
}
impl<C: Send + Sync> AgentTool<C> {
    /// Construct the inner adapter once and preserve construction errors. The
    /// host retains consent, provider selection and nested-worker policy.
    pub fn new(
        factory: impl FnOnce() -> Result<SpawnPort<C>, AgentError>,
    ) -> Result<Self, AgentError> {
        Ok(Self { inner: factory()? })
    }
    pub async fn execute(&self, input: &Value, context: &C) -> Result<Value, AgentError> {
        (self.inner)(input, context).await
    }
}
pub fn metadata() -> &'static Value {
    static VALUE: LazyLock<Value> = LazyLock::new(|| {
        serde_json::from_str(include_str!("core-agent-metadata.json")).expect("core agent metadata")
    });
    &VALUE
}
