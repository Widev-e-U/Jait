//! Plugin SDK data and lifecycle. Loading packages, permissions, channels and
//! tool dispatch remain host responsibilities; these declarations grant no authority.
use crate::security::{
    contracts::Risk,
    tool_permissions::{ConsentLevel, ToolPermission},
};
use futures_util::future::BoxFuture;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value, json};
use std::sync::Arc;
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginDescriptor {
    pub id: String,
    pub display_name: String,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PluginStatus {
    Installed,
    Enabled,
    Disabled,
    Error,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledPlugin {
    pub id: String,
    pub display_name: String,
    pub version: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub author: Option<String>,
    pub path: String,
    pub status: PluginStatus,
    pub config: Map<String, Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    pub installed_at: String,
    pub updated_at: String,
}
/// The executable handle is copied unchanged. Unknown own metadata survives just
/// like a JavaScript object spread; source and provenance are always overwritten.
#[derive(Clone)]
pub struct PluginToolDeclaration<H> {
    pub name: String,
    pub description: String,
    pub parameters: Value,
    pub tier: ToolTier,
    pub category: ToolCategory,
    pub risk: Risk,
    pub default_consent_level: ConsentLevel,
    /// Seed own metadata in original insertion order; declared fields below
    /// overwrite matching keys without moving them, like object spread.
    pub extra: Map<String, Value>,
    pub execute: H,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ToolTier {
    Core,
    Standard,
    External,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ToolCategory {
    Terminal,
    Filesystem,
    Os,
    Surfaces,
    Scheduler,
    Gateway,
    Screen,
    Browser,
    Web,
    Memory,
    Voice,
    Agent,
    Network,
    Channels,
    Meta,
    External,
}
#[derive(Clone)]
pub struct PluginToolDefinition<H> {
    pub metadata: Map<String, Value>,
    pub execute: H,
}
pub fn build_plugin_tool_source_metadata(plugin: &PluginDescriptor) -> Value {
    json!({"kind":"plugin","pluginId":plugin.id,"pluginDisplayName":plugin.display_name})
}
pub fn to_plugin_tool_definition<H: Clone>(
    plugin: &PluginDescriptor,
    tool: &PluginToolDeclaration<H>,
) -> PluginToolDefinition<H> {
    let mut metadata = tool.extra.clone();
    metadata.extend(serde_json::from_value::<Map<String,Value>>(json!({
        "name":tool.name,"description":tool.description,"parameters":tool.parameters,
        "tier":tool.tier,"category":tool.category,"risk":tool.risk,"defaultConsentLevel":tool.default_consent_level,
        "source":format!("plugin:{}",plugin.id),"sourceMetadata":build_plugin_tool_source_metadata(plugin)
    })).expect("object metadata"));
    PluginToolDefinition {
        metadata,
        execute: tool.execute.clone(),
    }
}
/// Channel and tool implementations are opaque typed handles supplied by their
/// respective host registries, so the SDK cannot accidentally dispatch them.
pub struct PluginContribution<C, H> {
    pub tools: Option<Vec<PluginToolDeclaration<H>>>,
    pub channels: Option<Vec<C>>,
    pub settings_schema: Option<Value>,
    pub permissions: Option<Vec<ToolPermission>>,
}
pub trait PluginLog: Send + Sync {
    fn info(&self, message: &str, args: &[Value]);
    fn warn(&self, message: &str, args: &[Value]);
    fn error(&self, message: &str, args: &[Value]);
}
pub trait PluginContext: Send + Sync {
    fn gateway_version(&self) -> &str;
    fn project_root(&self) -> &str;
    fn get_config(&self) -> Result<Value, PluginError>;
    fn set_config(&self, value: Map<String, Value>) -> BoxFuture<'_, Result<(), PluginError>>;
    fn log(&self) -> &dyn PluginLog;
}
#[derive(Clone, Debug, PartialEq)]
pub enum PluginError {
    Error(String),
    Thrown(Value),
}
pub type Setup<C, H> = Arc<
    dyn Fn(
            Arc<dyn PluginContext>,
        ) -> BoxFuture<'static, Result<Option<PluginContribution<C, H>>, PluginError>>
        + Send
        + Sync,
>;
pub type Dispose = Arc<dyn Fn() -> BoxFuture<'static, Result<(), PluginError>> + Send + Sync>;
pub struct PluginEntry<C, H> {
    pub id: String,
    pub display_name: String,
    pub setup: Setup<C, H>,
    pub dispose: Option<Dispose>,
}
pub struct PluginModule<C, H> {
    pub id: String,
    pub display_name: String,
    pub setup: Setup<C, H>,
    pub dispose: Dispose,
}
/// Construction does not initialize or dispose a module. Preserve callback
/// identity and errors, with an asynchronous no-op only for absent dispose.
pub fn define_plugin<C, H>(entry: PluginEntry<C, H>) -> PluginModule<C, H> {
    PluginModule {
        id: entry.id,
        display_name: entry.display_name,
        setup: entry.setup,
        dispose: entry
            .dispose
            .unwrap_or_else(|| Arc::new(|| Box::pin(async { Ok(()) }))),
    }
}
pub struct LoadedPlugin<C, H> {
    pub manifest: Value,
    pub installed: InstalledPlugin,
    pub module: Option<PluginModule<C, H>>,
    pub contribution: Option<PluginContribution<C, H>>,
}
