//! Port of `packages/gateway/src/tools/contracts.ts`.
//!
//! The TypeScript original is a *type-only* module: it declares no runtime
//! functions, no guards with bodies and no constants — every declaration is a
//! type alias or an interface. Consequently this port is mostly type surface,
//! and the first rule is: **do not redefine what the crate already models**.
//!
//! ## Re-used native types (not redefined here)
//!
//! | TS (contracts.ts)    | native home                                                  |
//! |----------------------|--------------------------------------------------------------|
//! | `ToolTier`           | [`crate::plugins::contracts::ToolTier`]                      |
//! | `ToolCategory`       | [`crate::plugins::contracts::ToolCategory`]                  |
//! | `ToolRisk`           | [`crate::security::contracts::Risk`]                         |
//! | `ToolConsentLevel`   | [`crate::security::tool_permissions::ConsentLevel`]          |
//! | `ToolResult`         | [`crate::tools::memory_tools::MemoryToolResult`]             |
//! | `ToolContext`        | [`crate::tools::registry::RegistryContext`]                  |
//! | `ToolDefinition`     | [`crate::tools::registry::RegisteredTool`]                   |
//!
//! The aliases below are re-exports, not new types; they exist so downstream
//! ports can name the TS spelling without importing from five modules.
//!
//! ## Added here (genuinely absent natively)
//!
//! [`ToolOutputStreamMetadata`], [`NestedAgentEvent`], [`ToolOutputChannel`],
//! [`ToolPropertySchema`], [`ToolParametersSchema`], [`ToolSource`],
//! [`ToolSourceMetadata`], [`ToolDiscoveryMetadata`].
//!
//! ## Serialization policy
//!
//! Field names follow the TS side byte-for-byte (`camelCase` on the wire,
//! `snake_case` in Rust). `Option` fields are omitted when `None`, matching TS
//! `?:` semantics for objects that are re-serialized. These structs are for
//! *parsing and inspecting* contract shapes; the authoritative tool metadata
//! used at runtime stays the byte-exact JSON in `src/tools/*-metadata.json`.
//! Property maps use [`BTreeMap`] (no `preserve_order` feature is enabled in
//! this crate, so key order is lexicographic, not TS insertion order).
//!
//! ## `pub mod barrel`
//!
//! [`barrel`] is the port of `packages/gateway/src/tools/index.ts`. It could
//! not live in `src/tools/catalog.rs`: that file is already the native port of
//! `catalog-tools.ts`. The barrel is therefore hosted here as an inline module
//! holding explicit re-export records, the `createToolRegistry()` registration
//! order with its gates, and gap reporting for tools without native ports.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use serde_json::Value;

pub use crate::plugins::contracts::{ToolCategory, ToolTier};
pub use crate::security::contracts::Risk as ToolRisk;
pub use crate::security::tool_permissions::ConsentLevel as ToolConsentLevel;
pub use crate::tools::memory_tools::MemoryToolResult as ToolResult;
pub use crate::tools::registry::{RegisteredTool as ToolDefinition, RegistryContext};

/// TS `ToolContext` — reuse of [`RegistryContext`] under the TS spelling.
pub type ToolContext<C> = RegistryContext<C>;

/// TS `ToolOutputStreamMetadata` — metadata accompanying an output chunk.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolOutputStreamMetadata {
    pub stream_id: String,
    pub seq: u64,
}

/// TS `channel?: "text" | "thinking"` on a nested `tool_output` event.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ToolOutputChannel {
    Text,
    Thinking,
}

/// TS `NestedAgentEvent` — events a tool emits on behalf of work it runs
/// internally (today the `agent` / `agent.spawn` tools running a sub-agent
/// loop), forwarded onto the parent turn's event stream.
///
/// Wire shape is a tagged union on `type` with the exact TS tags
/// `tool_start` / `tool_output` / `tool_result`; the field names are already
/// snake_case in the TS source and are preserved verbatim.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum NestedAgentEvent {
    ToolStart {
        tool: String,
        /// TS `args: unknown` — required but may be `undefined`.
        #[serde(default)]
        args: Value,
        call_id: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        parent_call_id: Option<String>,
    },
    ToolOutput {
        call_id: String,
        content: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        channel: Option<ToolOutputChannel>,
    },
    ToolResult {
        call_id: String,
        tool: String,
        ok: bool,
        message: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        parent_call_id: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        data: Option<Value>,
    },
}

/// TS `type: string | string[]` on a property schema.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum SchemaType {
    One(String),
    Many(Vec<String>),
}

impl SchemaType {
    pub fn as_slice(&self) -> Vec<&str> {
        match self {
            SchemaType::One(s) => vec![s.as_str()],
            SchemaType::Many(v) => v.iter().map(String::as_str).collect(),
        }
    }
}

/// TS `ToolPropertySchema` — JSON Schema for a single tool parameter property.
///
/// `items` is recursive; TS intersects `ToolPropertySchema` with an extra
/// inline `{ properties?, required? }` shape for array-of-object parameters,
/// which this struct already covers through its own `properties`/`required`.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolPropertySchema {
    #[serde(rename = "type")]
    pub schema_type: SchemaType,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(rename = "enum", default, skip_serializing_if = "Option::is_none")]
    pub enum_values: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub min_length: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_length: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pattern: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub min_items: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_items: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub items: Option<Box<ToolPropertySchema>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub properties: Option<BTreeMap<String, ToolPropertySchema>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub required: Option<Vec<String>>,
}

impl ToolPropertySchema {
    /// `{ "type": "string" }` — spelled out field by field because
    /// `ToolPropertySchema` deliberately has no `Default` impl: TS requires
    /// `type` on every property schema, so there is no meaningful "empty" one.
    pub fn string() -> Self {
        Self {
            schema_type: SchemaType::One("string".to_string()),
            description: None,
            enum_values: None,
            min_length: None,
            max_length: None,
            pattern: None,
            min_items: None,
            max_items: None,
            items: None,
            properties: None,
            required: None,
        }
    }
}

/// One branch of `ToolParametersSchema::all_of` (`if` / `then`).
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConditionalSchemaBranch {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub properties: Option<BTreeMap<String, ToolPropertySchema>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub required: Option<Vec<String>>,
}

/// TS `allOf?: Array<{ if: {...}; then: {...} }>` entry.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConditionalRequirement {
    #[serde(rename = "if")]
    pub if_clause: ConditionalSchemaBranch,
    #[serde(rename = "then")]
    pub then_clause: ConditionalSchemaBranch,
    }

/// TS literal `type: "object"` used by [`ToolParametersSchema`].
pub const TOOL_PARAMETERS_SCHEMA_TYPE: &str = "object";

fn object_type() -> String {
    TOOL_PARAMETERS_SCHEMA_TYPE.to_string()
}

/// TS `ToolParametersSchema` — JSON Schema in OpenAI function-calling format.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolParametersSchema {
    #[serde(rename = "type", default = "object_type")]
    pub schema_type: String,
    #[serde(default)]
    pub properties: BTreeMap<String, ToolPropertySchema>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub required: Option<Vec<String>>,
    /// Conditional requirements for action-based tools.
    #[serde(rename = "allOf", default, skip_serializing_if = "Option::is_none")]
    pub all_of: Option<Vec<ConditionalRequirement>>,
}

impl Default for ToolParametersSchema {
    fn default() -> Self {
        Self {
            schema_type: object_type(),
            properties: BTreeMap::new(),
            required: None,
            all_of: None,
        }
    }
}

/// TS `ToolSource` — `"builtin" | "mcp" | \`plugin:${string}\``.
#[derive(Clone, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub enum ToolSource {
    Builtin,
    Mcp,
    Plugin(String),
}

impl ToolSource {
    /// TS template-literal prefix for plugin sources.
    pub const PLUGIN_PREFIX: &'static str = "plugin:";

    /// The exact TS string for this source.
    pub fn as_source_str(&self) -> String {
        match self {
            ToolSource::Builtin => "builtin".to_string(),
            ToolSource::Mcp => "mcp".to_string(),
            ToolSource::Plugin(id) => format!("{}{}", Self::PLUGIN_PREFIX, id),
        }
    }

    /// Inverse of [`ToolSource::as_source_str`].
    ///
    /// Returns `None` for strings outside the TS union. The TS side cannot
    /// express such a value (it is a literal union), so there is no TS error
    /// string to match here.
    pub fn from_source_str(s: &str) -> Option<Self> {
        match s {
            "builtin" => Some(ToolSource::Builtin),
            "mcp" => Some(ToolSource::Mcp),
            other => other
                .strip_prefix(ToolSource::PLUGIN_PREFIX)
                .map(|id| ToolSource::Plugin(id.to_string())),
        }
    }
}

impl Serialize for ToolSource {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.as_source_str())
    }
}

impl<'de> Deserialize<'de> for ToolSource {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        let raw = String::deserialize(d)?;
        ToolSource::from_source_str(&raw).ok_or_else(|| {
            serde::de::Error::custom(format!("invalid tool source: {raw}"))
        })
    }
}

/// TS `ToolSourceMetadata` — structured provenance, tagged on `kind`.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ToolSourceMetadata {
    Builtin,
    Mcp {
        #[serde(rename = "serverId", default, skip_serializing_if = "Option::is_none")]
        server_id: Option<String>,
        #[serde(
            rename = "serverName",
            default,
            skip_serializing_if = "Option::is_none"
        )]
        server_name: Option<String>,
    },
    Plugin {
        #[serde(rename = "pluginId")]
        plugin_id: String,
        #[serde(rename = "pluginDisplayName")]
        plugin_display_name: String,
    },
}

/// TS `ToolDiscoveryMetadata` — discovery hints kept out of every LLM schema.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolDiscoveryMetadata {
    /// Alternative user-facing terms that should retrieve this tool.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub aliases: Option<Vec<String>>,
    /// Short capability phrases, such as "inspect a live web app".
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub capabilities: Option<Vec<String>>,
    /// Example user requests that should make this tool relevant.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub examples: Option<Vec<String>>,
    /// Additive ranking boost for especially important deferred tools.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub priority: Option<i64>,
}

// ─────────────────────────────────────────────────────────────────────────

/// Port of `packages/gateway/src/tools/index.ts` — the tools barrel.
///
/// The TS barrel does two things:
///
/// 1. it re-exports every tool factory, contract type and helper from the
///    individual `tools/*.ts` modules ([`REEXPORTS`]);
/// 2. it exposes `createToolRegistry(deps)`, which registers the enabled tool
///    families on a `ToolRegistry` in a fixed order, each family behind a gate
///    on the injected service dependencies ([`REGISTRATIONS`]).
///
/// In Rust the barrel is not a re-export list of functions but a table plus a
/// registration helper: `src/tools/registry.rs::ToolRegistry` is already the
/// native registry, and each family is a native module. Neither table invents
/// tools: [`REEXPORTS`] is the literal symbol set of the TS barrel (in TS source
/// order) and [`REGISTRATIONS`] is the literal `createToolRegistry()` call
/// order. `native` names the `src/tools/<module>.rs` file whose source mentions
/// the family's tool names; `None` means no native port is known yet and the
/// gap is reported by [`missing_native`].
///
/// ## Call order
///
/// `registration_plan(deps)` walks [`REGISTRATIONS`] in order, keeps the
/// entries whose [`Registration::gate`] is satisfied by the provided
/// dependency names, and returns them. The TS body performs exactly the same
/// walk, so the resulting registry has the same insertion order — which is
/// observable because registry order drives schema emission.
pub mod barrel {
    /// One symbol re-exported by `tools/index.ts`.
    #[derive(Debug, Clone, Copy, PartialEq, Eq)]
    pub struct Reexport {
        /// Exported symbol name, exactly as written in TS.
        pub symbol: &'static str,
        /// TS module the symbol comes from (`tools/index.ts` for locals).
        pub ts_module: &'static str,
        /// Native module that ports this surface, when one exists.
        pub native: Option<&'static str>,
    }

    /// One `createToolRegistry()` registration, in TS call order.
    #[derive(Debug, Clone, Copy, PartialEq, Eq)]
    pub struct Registration {
        /// TS factory name, exactly as written (`createReadTool`, …).
        pub factory: &'static str,
        /// Enclosing `if (...)` gate from the TS body; empty when unconditional.
        /// Multiple conditions are joined with ` && ` exactly as in TS.
        pub gate: &'static str,
        /// TS module defining the factory.
        pub ts_module: &'static str,
        /// Native module implementing the family, when one exists.
        pub native: Option<&'static str>,
    }

/// Every symbol `packages/gateway/src/tools/index.ts` re-exports, in TS source order.
///
/// `native` is a conservative lower bound: `Some(module)` is only set where the
/// family was verified against a native `crate::tools::<module>` port, so `None`
/// means "no verified native port yet", not "definitely missing". The gap report
/// below is therefore a lower bound on the real coverage gap.
pub const REEXPORTS: &[Reexport] = &[
    Reexport { symbol: "ToolRegistry", ts_module: "registry.ts", native: Some("registry") },
    Reexport { symbol: "createTerminalRunTool", ts_module: "terminal-tools.ts", native: Some("terminal_tools") },
    Reexport { symbol: "createJaitTerminalTool", ts_module: "terminal-tools.ts", native: Some("terminal_tools") },
    Reexport { symbol: "createTerminalStreamTool", ts_module: "terminal-tools.ts", native: Some("terminal_tools") },
    Reexport { symbol: "type AgentEnvResolver", ts_module: "terminal-tools.ts", native: Some("terminal_tools") },
    Reexport { symbol: "createFileReadTool", ts_module: "file-tools.ts", native: Some("file_tools") },
    Reexport { symbol: "createFileWriteTool", ts_module: "file-tools.ts", native: Some("file_tools") },
    Reexport { symbol: "createFilePatchTool", ts_module: "file-tools.ts", native: Some("file_tools") },
    Reexport { symbol: "createFileListTool", ts_module: "file-tools.ts", native: Some("file_tools") },
    Reexport { symbol: "createFileStatTool", ts_module: "file-tools.ts", native: Some("file_tools") },
    Reexport { symbol: "createImageViewTool", ts_module: "file-tools.ts", native: Some("file_tools") },
    Reexport { symbol: "createOsQueryTool", ts_module: "os-tools.ts", native: Some("os_tools") },
    Reexport { symbol: "createOsInstallTool", ts_module: "os-tools.ts", native: Some("os_tools") },
    Reexport { symbol: "createOsControlToolset", ts_module: "os-control-tools.ts", native: Some("os_control_tools") },
    Reexport { symbol: "createComputerTools", ts_module: "computer-tools.ts", native: Some("computer_tools") },
    Reexport { symbol: "createSurfacesListTool", ts_module: "surface-tools.ts", native: Some("browser_tools") },
    Reexport { symbol: "createSurfacesStartTool", ts_module: "surface-tools.ts", native: Some("browser_tools") },
    Reexport { symbol: "createSurfacesStopTool", ts_module: "surface-tools.ts", native: Some("browser_tools") },
    Reexport { symbol: "createCronAddTool", ts_module: "cron-tools.ts", native: Some("core_jait") },
    Reexport { symbol: "createCronListTool", ts_module: "cron-tools.ts", native: Some("core_jait") },
    Reexport { symbol: "createCronRemoveTool", ts_module: "cron-tools.ts", native: Some("core_jait") },
    Reexport { symbol: "createCronUpdateTool", ts_module: "cron-tools.ts", native: Some("core_jait") },
    Reexport { symbol: "createGatewayStatusTool", ts_module: "gateway-tools.ts", native: Some("redeploy_tools") },
    Reexport { symbol: "createProjectAssignRepositoryTool", ts_module: "project-tools.ts", native: Some("project_tools") },
    Reexport { symbol: "createProjectCreateTool", ts_module: "project-tools.ts", native: Some("project_tools") },
    Reexport { symbol: "createProjectMoveTool", ts_module: "project-tools.ts", native: Some("project_tools") },
    Reexport { symbol: "createProjectTransferTool", ts_module: "project-tools.ts", native: Some("project_tools") },
    Reexport { symbol: "createProjectMessageTool", ts_module: "project-message-tool.ts", native: Some("project_message") },
    Reexport { symbol: "createProjectEditorOpenTool", ts_module: "project-editor-tools.ts", native: Some("runtime_tools") },
    Reexport { symbol: "createJaitTodosTool", ts_module: "repo-proposal-tools.ts", native: None },
    Reexport { symbol: "createUserAskTool", ts_module: "user-question-tools.ts", native: None },
    Reexport { symbol: "createScreenShareTool", ts_module: "screen-share-tools.ts", native: Some("screen_share_tools") },
    Reexport { symbol: "createScreenCaptureTool", ts_module: "screen-share-tools.ts", native: Some("screen_share_tools") },
    Reexport { symbol: "createScreenRecordTool", ts_module: "screen-share-tools.ts", native: Some("screen_share_tools") },
    Reexport { symbol: "createOsTool", ts_module: "screen-share-tools.ts", native: Some("screen_share_tools") },
    Reexport { symbol: "createBrowserNavigateTool", ts_module: "browser-tools.ts", native: Some("browser_tools") },
    Reexport { symbol: "createBrowserSnapshotTool", ts_module: "browser-tools.ts", native: Some("browser_tools") },
    Reexport { symbol: "createBrowserInspectTool", ts_module: "browser-tools.ts", native: Some("browser_tools") },
    Reexport { symbol: "createBrowserInteractionTools", ts_module: "browser-tools.ts", native: Some("browser_tools") },
    Reexport { symbol: "createWebFetchTool", ts_module: "browser-tools.ts", native: Some("browser_tools") },
    Reexport { symbol: "createWebSearchTool", ts_module: "browser-tools.ts", native: Some("browser_tools") },
    Reexport { symbol: "createBrowserSandboxStartTool", ts_module: "browser-tools.ts", native: Some("browser_tools") },
    Reexport { symbol: "createScreenshotCaptureTool", ts_module: "screenshot-tools.ts", native: Some("screenshot_tools") },
    Reexport { symbol: "createWindowsSandboxStartTool", ts_module: "sandbox-tools.ts", native: Some("sandbox_tools") },
    Reexport { symbol: "createWindowsSandboxStopTool", ts_module: "sandbox-tools.ts", native: Some("sandbox_tools") },
    Reexport { symbol: "createLinuxDesktopSandboxStartTool", ts_module: "sandbox-tools.ts", native: Some("sandbox_tools") },
    Reexport { symbol: "createLinuxDesktopSandboxStopTool", ts_module: "sandbox-tools.ts", native: Some("sandbox_tools") },
    Reexport { symbol: "createMemorySaveTool", ts_module: "memory-tools.ts", native: Some("core_jait") },
    Reexport { symbol: "createMemorySearchTool", ts_module: "memory-tools.ts", native: Some("core_jait") },
    Reexport { symbol: "createMemoryForgetTool", ts_module: "memory-tools.ts", native: Some("core_jait") },
    Reexport { symbol: "createMemoryHygieneTool", ts_module: "memory-tools.ts", native: Some("core_jait") },
    Reexport { symbol: "createMemoryListTool", ts_module: "memory-tools.ts", native: Some("core_jait") },
    Reexport { symbol: "createMemoryReviewChatsTool", ts_module: "memory-tools.ts", native: Some("core_jait") },
    Reexport { symbol: "createMemoryUpdateTool", ts_module: "memory-tools.ts", native: Some("core_jait") },
    Reexport { symbol: "createSessionSearchTool", ts_module: "session-search-tools.ts", native: None },
    Reexport { symbol: "createSessionSqlTool", ts_module: "session-sql-tools.ts", native: Some("session_sql") },
    Reexport { symbol: "createChatTracesTool", ts_module: "chat-traces-tools.ts", native: None },
    Reexport { symbol: "createVoiceSpeakTool", ts_module: "voice-tools.ts", native: None },
    Reexport { symbol: "createAgentSpawnTool", ts_module: "agent-tools.ts", native: Some("agent_communication") },
    Reexport { symbol: "createAgentMessageTool", ts_module: "agent-message-tool.ts", native: Some("agent_communication") },
    Reexport { symbol: "createThreadControlTool", ts_module: "thread-tools.ts", native: Some("thread_tools") },
    Reexport { symbol: "createNetworkScanTool", ts_module: "network-tools.ts", native: Some("network_scan") },
    Reexport { symbol: "getLatestNetworkScan", ts_module: "network-tools.ts", native: Some("network_scan") },
    Reexport { symbol: "setLatestNetworkScan", ts_module: "network-tools.ts", native: Some("network_scan") },
    Reexport { symbol: "createEmailTools", ts_module: "email-tools.ts", native: Some("email_tools") },
    Reexport { symbol: "createCalendarTools", ts_module: "calendar-tools.ts", native: Some("calendar") },
    Reexport { symbol: "createHomeAssistantCallServiceTool", ts_module: "homeassistant-tools.ts", native: Some("homeassistant_tools") },
    Reexport { symbol: "createHomeAssistantServicesTool", ts_module: "homeassistant-tools.ts", native: Some("homeassistant_tools") },
    Reexport { symbol: "createHomeAssistantStatesTool", ts_module: "homeassistant-tools.ts", native: Some("homeassistant_tools") },
    Reexport { symbol: "createSshRunTool", ts_module: "ssh-tools.ts", native: Some("ssh_tools") },
    Reexport { symbol: "createSshSessionStartTool", ts_module: "ssh-tools.ts", native: Some("ssh_tools") },
    Reexport { symbol: "createSshSessionRunTool", ts_module: "ssh-tools.ts", native: Some("ssh_tools") },
    Reexport { symbol: "createSshSessionCloseTool", ts_module: "ssh-tools.ts", native: Some("ssh_tools") },
    Reexport { symbol: "createElevatedRunTool", ts_module: "elevated-tools.ts", native: Some("elevated_tools") },
    Reexport { symbol: "createRedeployTool", ts_module: "redeploy-tools.ts", native: Some("redeploy_tools") },
    Reexport { symbol: "createMaintenanceRunTool", ts_module: "maintenance-tools.ts", native: Some("maintenance") },
    Reexport { symbol: "createArchitectureTool", ts_module: "architecture-tools.ts", native: Some("diagrams") },
    Reexport { symbol: "createCodeGraphTools", ts_module: "code-graph-tools.ts", native: Some("code_graph") },
    Reexport { symbol: "createPreviewOpenTool", ts_module: "preview-tools.ts", native: Some("preview_tools") },
    Reexport { symbol: "createPreviewStopTool", ts_module: "preview-tools.ts", native: Some("preview_tools") },
    Reexport { symbol: "createPreviewRestartTool", ts_module: "preview-tools.ts", native: Some("preview_tools") },
    Reexport { symbol: "createPreviewStatusTool", ts_module: "preview-tools.ts", native: Some("preview_tools") },
    Reexport { symbol: "createPreviewLogsTool", ts_module: "preview-tools.ts", native: Some("preview_tools") },
    Reexport { symbol: "createPreviewInspectTool", ts_module: "preview-tools.ts", native: Some("preview_tools") },
    Reexport { symbol: "createToolsListTool", ts_module: "meta-tools.ts", native: Some("meta_tools") },
    Reexport { symbol: "createToolsSearchTool", ts_module: "meta-tools.ts", native: Some("meta_tools") },
    Reexport { symbol: "createSkillsManageTool", ts_module: "skill-tools.ts", native: Some("skill_tools") },
    Reexport { symbol: "createExtensionsManageTool", ts_module: "skill-tools.ts", native: Some("skill_tools") },
    Reexport { symbol: "McpManager", ts_module: "mcp-bridge.ts", native: Some("mcp_bridge") },
    Reexport { symbol: "wrapMcpTool", ts_module: "mcp-bridge.ts", native: Some("mcp_bridge") },
    Reexport { symbol: "registerMcpTools", ts_module: "mcp-bridge.ts", native: Some("mcp_bridge") },
    Reexport { symbol: "unregisterMcpTools", ts_module: "mcp-bridge.ts", native: Some("mcp_bridge") },
    Reexport { symbol: "type McpServerConfig", ts_module: "mcp-bridge.ts", native: Some("mcp_bridge") },
    Reexport { symbol: "type McpConnection", ts_module: "mcp-bridge.ts", native: Some("mcp_bridge") },
    Reexport { symbol: "ToolName", ts_module: "tool-names.ts", native: Some("tool_names") },
    Reexport { symbol: "type ToolNameValue", ts_module: "tool-names.ts", native: Some("tool_names") },
    Reexport { symbol: "validateToolInput", ts_module: "validate.ts", native: Some("validate") },
    Reexport { symbol: "type ValidationResult", ts_module: "validate.ts", native: Some("validate") },
    Reexport { symbol: "type ChatMode", ts_module: "chat-modes.ts", native: Some("chat_modes") },
    Reexport { symbol: "CHAT_MODES", ts_module: "chat-modes.ts", native: Some("chat_modes") },
    Reexport { symbol: "isValidChatMode", ts_module: "chat-modes.ts", native: Some("chat_modes") },
    Reexport { symbol: "ASK_MODE_TOOLS", ts_module: "chat-modes.ts", native: Some("chat_modes") },
    Reexport { symbol: "MUTATING_TOOLS", ts_module: "chat-modes.ts", native: Some("chat_modes") },
    Reexport { symbol: "getSystemPromptForMode", ts_module: "chat-modes.ts", native: Some("chat_modes") },
    Reexport { symbol: "type PlannedAction", ts_module: "chat-modes.ts", native: Some("chat_modes") },
    Reexport { symbol: "type Plan", ts_module: "chat-modes.ts", native: Some("chat_modes") },
    Reexport { symbol: "buildSystemPrompt", ts_module: "index.ts", native: None },
    Reexport { symbol: "getReminderInstructions", ts_module: "index.ts", native: None },
    Reexport { symbol: "promptRegistry", ts_module: "index.ts", native: None },
    Reexport { symbol: "type ModelEndpoint", ts_module: "index.ts", native: None },
    Reexport { symbol: "type IAgentPrompt", ts_module: "index.ts", native: None },
    Reexport { symbol: "type PromptContext", ts_module: "index.ts", native: None },
    Reexport { symbol: "runAgentLoop", ts_module: "agent-loop.ts", native: Some("loop_tools") },
    Reexport { symbol: "retryToolCall", ts_module: "agent-loop.ts", native: Some("loop_tools") },
    Reexport { symbol: "pruneHistory", ts_module: "agent-loop.ts", native: Some("loop_tools") },
    Reexport { symbol: "repairToolCallHistory", ts_module: "agent-loop.ts", native: Some("loop_tools") },
    Reexport { symbol: "generateLLMConversationSummary", ts_module: "agent-loop.ts", native: Some("loop_tools") },
    Reexport { symbol: "CONTEXT_COMPACT_TRIGGER_RATIO", ts_module: "agent-loop.ts", native: Some("loop_tools") },
    Reexport { symbol: "buildToolSchemas", ts_module: "agent-loop.ts", native: Some("loop_tools") },
    Reexport { symbol: "buildTieredToolSchemas", ts_module: "agent-loop.ts", native: Some("loop_tools") },
    Reexport { symbol: "buildSystemOneToolSchemas", ts_module: "agent-loop.ts", native: Some("loop_tools") },
    Reexport { symbol: "toolDefsToSchemas", ts_module: "agent-loop.ts", native: Some("loop_tools") },
    Reexport { symbol: "parseOpenAIStream", ts_module: "agent-loop.ts", native: Some("loop_tools") },
    Reexport { symbol: "serializeMessages", ts_module: "agent-loop.ts", native: Some("loop_tools") },
    Reexport { symbol: "toOpenAIName", ts_module: "agent-loop.ts", native: Some("loop_tools") },
    Reexport { symbol: "fromOpenAIName", ts_module: "agent-loop.ts", native: Some("loop_tools") },
    Reexport { symbol: "SteeringController", ts_module: "agent-loop.ts", native: Some("loop_tools") },
    Reexport { symbol: "ToolCallQueue", ts_module: "agent-loop.ts", native: Some("loop_tools") },
    Reexport { symbol: "ToolCallPriority", ts_module: "agent-loop.ts", native: Some("loop_tools") },
    Reexport { symbol: "type AgentLoopOptions", ts_module: "agent-loop.ts", native: Some("loop_tools") },
    Reexport { symbol: "type AgentLoopResult", ts_module: "agent-loop.ts", native: Some("loop_tools") },
    Reexport { symbol: "type AgentLoopEvent", ts_module: "agent-loop.ts", native: Some("loop_tools") },
    Reexport { symbol: "type AgentMessage", ts_module: "agent-loop.ts", native: Some("loop_tools") },
    Reexport { symbol: "type OpenAIToolCall", ts_module: "agent-loop.ts", native: Some("loop_tools") },
    Reexport { symbol: "type OpenAIToolSchema", ts_module: "agent-loop.ts", native: Some("loop_tools") },
    Reexport { symbol: "type LLMConfig", ts_module: "agent-loop.ts", native: Some("loop_tools") },
    Reexport { symbol: "type LlmContextFlowRound", ts_module: "agent-loop.ts", native: Some("loop_tools") },
    Reexport { symbol: "type ExecutedToolCall", ts_module: "agent-loop.ts", native: Some("loop_tools") },
    Reexport { symbol: "type ToolExecutor", ts_module: "agent-loop.ts", native: Some("loop_tools") },
    Reexport { symbol: "computeContextUsage", ts_module: "token-estimator.ts", native: Some("token_estimator") },
    Reexport { symbol: "type ContextUsage", ts_module: "token-estimator.ts", native: Some("token_estimator") },
    Reexport { symbol: "ToolRegistryDeps", ts_module: "index.ts", native: None },
    Reexport { symbol: "createToolRegistry", ts_module: "index.ts", native: None },
];

/// `createToolRegistry()` registration order (TS call order), with each call's enclosing gate.
pub const REGISTRATIONS: &[Registration] = &[
    Registration { factory: "createContextReadTool", gate: "", ts_module: "context-evidence.ts", native: Some("context_evidence") },
    Registration { factory: "createReadTool", gate: "", ts_module: "core/index.ts", native: None },
    Registration { factory: "createEditTool", gate: "", ts_module: "core/index.ts", native: None },
    Registration { factory: "createExecuteTool", gate: "", ts_module: "core/index.ts", native: None },
    Registration { factory: "createSearchTool", gate: "", ts_module: "core/index.ts", native: None },
    Registration { factory: "createWebTool", gate: "", ts_module: "core/index.ts", native: None },
    Registration { factory: "createTodoTool", gate: "", ts_module: "core/index.ts", native: None },
    Registration { factory: "createLoopTools", gate: "", ts_module: "loop-tools.ts", native: Some("loop_tools") },
    Registration { factory: "createJaitTool", gate: "", ts_module: "core/index.ts", native: None },
    Registration { factory: "createTerminalExecutionTool", gate: "", ts_module: "terminal-execution.ts", native: Some("terminal_execution") },
    Registration { factory: "createTerminalRunTool", gate: "", ts_module: "terminal-tools.ts", native: Some("terminal_tools") },
    Registration { factory: "createJaitTerminalTool", gate: "", ts_module: "terminal-tools.ts", native: Some("terminal_tools") },
    Registration { factory: "createTerminalStreamTool", gate: "", ts_module: "terminal-tools.ts", native: Some("terminal_tools") },
    Registration { factory: "createFileReadTool", gate: "", ts_module: "file-tools.ts", native: Some("file_tools") },
    Registration { factory: "createFileWriteTool", gate: "", ts_module: "file-tools.ts", native: Some("file_tools") },
    Registration { factory: "createFilePatchTool", gate: "", ts_module: "file-tools.ts", native: Some("file_tools") },
    Registration { factory: "createFileListTool", gate: "", ts_module: "file-tools.ts", native: Some("file_tools") },
    Registration { factory: "createFileStatTool", gate: "", ts_module: "file-tools.ts", native: Some("file_tools") },
    Registration { factory: "createImageViewTool", gate: "", ts_module: "file-tools.ts", native: Some("file_tools") },
    Registration { factory: "createOsQueryTool", gate: "", ts_module: "os-tools.ts", native: Some("os_tools") },
    Registration { factory: "createOsInstallTool", gate: "", ts_module: "os-tools.ts", native: Some("os_tools") },
    Registration { factory: "createComputerTools", gate: "deps.ws", ts_module: "computer-tools.ts", native: Some("computer_tools") },
    Registration { factory: "createSurfacesListTool", gate: "", ts_module: "surface-tools.ts", native: Some("browser_tools") },
    Registration { factory: "createSurfacesStartTool", gate: "", ts_module: "surface-tools.ts", native: Some("browser_tools") },
    Registration { factory: "createSurfacesStopTool", gate: "", ts_module: "surface-tools.ts", native: Some("browser_tools") },
    Registration { factory: "createCronAddTool", gate: "deps.scheduler", ts_module: "cron-tools.ts", native: Some("core_jait") },
    Registration { factory: "createCronListTool", gate: "deps.scheduler", ts_module: "cron-tools.ts", native: Some("core_jait") },
    Registration { factory: "createCronRemoveTool", gate: "deps.scheduler", ts_module: "cron-tools.ts", native: Some("core_jait") },
    Registration { factory: "createCronUpdateTool", gate: "deps.scheduler", ts_module: "cron-tools.ts", native: Some("core_jait") },
    Registration { factory: "createGatewayStatusTool", gate: "deps.sessionService && deps.ws", ts_module: "gateway-tools.ts", native: Some("redeploy_tools") },
    Registration { factory: "createProjectCreateTool", gate: "deps.projectService && deps.repoService", ts_module: "project-tools.ts", native: Some("project_tools") },
    Registration { factory: "createProjectAssignRepositoryTool", gate: "deps.projectService && deps.repoService", ts_module: "project-tools.ts", native: Some("project_tools") },
    Registration { factory: "createProjectMoveTool", gate: "deps.projectService && deps.repoService", ts_module: "project-tools.ts", native: Some("project_tools") },
    Registration { factory: "createProjectTransferTool", gate: "deps.projectService && deps.repoService", ts_module: "project-tools.ts", native: Some("project_tools") },
    Registration { factory: "createProjectEditorOpenTool", gate: "", ts_module: "project-editor-tools.ts", native: Some("runtime_tools") },
    Registration { factory: "createJaitTodosTool", gate: "deps.repoService && deps.repoProposalService", ts_module: "repo-proposal-tools.ts", native: None },
    Registration { factory: "createUserAskTool", gate: "deps.userQuestionService", ts_module: "user-question-tools.ts", native: None },
    Registration { factory: "createBrowserHandoffTool", gate: "deps.userQuestionService", ts_module: "browser-handoff.ts", native: Some("browser_tools") },
    Registration { factory: "createRedeployTool", gate: "deps.config && deps.shutdown", ts_module: "redeploy-tools.ts", native: Some("redeploy_tools") },
    Registration { factory: "createMemorySaveTool", gate: "deps.memoryService", ts_module: "memory-tools.ts", native: Some("core_jait") },
    Registration { factory: "createMemorySearchTool", gate: "deps.memoryService", ts_module: "memory-tools.ts", native: Some("core_jait") },
    Registration { factory: "createMemoryForgetTool", gate: "deps.memoryService", ts_module: "memory-tools.ts", native: Some("core_jait") },
    Registration { factory: "createMemoryListTool", gate: "deps.reminderService", ts_module: "memory-tools.ts", native: Some("core_jait") },
    Registration { factory: "createMemoryUpdateTool", gate: "deps.reminderService", ts_module: "memory-tools.ts", native: Some("core_jait") },
    Registration { factory: "createMemoryHygieneTool", gate: "deps.reminderService", ts_module: "memory-tools.ts", native: Some("core_jait") },
    Registration { factory: "createMemoryReviewChatsTool", gate: "deps.reminderService", ts_module: "memory-tools.ts", native: Some("core_jait") },
    Registration { factory: "createSessionSearchTool", gate: "deps.sessionSearchService", ts_module: "session-search-tools.ts", native: None },
    Registration { factory: "createChatTracesTool", gate: "deps.chatTracesService", ts_module: "chat-traces-tools.ts", native: None },
    Registration { factory: "createSessionSqlTool", gate: "deps.sessionSqlService", ts_module: "session-sql-tools.ts", native: Some("session_sql") },
    Registration { factory: "createVoiceSpeakTool", gate: "deps.voiceService", ts_module: "voice-tools.ts", native: None },
    Registration { factory: "createPersonaAgentInspectTool", gate: "deps.threadService && deps.providerRegistry", ts_module: "persona-agent-tools.ts", native: None },
    Registration { factory: "createPersonaAgentTool", gate: "deps.threadService && deps.providerRegistry", ts_module: "persona-agent-tools.ts", native: None },
    Registration { factory: "createThreadControlTool", gate: "deps.threadService && deps.providerRegistry", ts_module: "thread-tools.ts", native: Some("thread_tools") },
    Registration { factory: "createAgentGithubTools", gate: "deps.agentGithubAppService", ts_module: "agent-github-tools.ts", native: Some("agent_github") },
    Registration { factory: "createProjectMessageTool", gate: "deps.threadService && deps.providerRegistry && deps.projectService && deps.sessionService", ts_module: "project-message-tool.ts", native: Some("project_message") },
    Registration { factory: "createScreenShareTool", gate: "deps.screenShare", ts_module: "screen-share-tools.ts", native: Some("screen_share_tools") },
    Registration { factory: "createScreenCaptureTool", gate: "deps.screenShare", ts_module: "screen-share-tools.ts", native: Some("screen_share_tools") },
    Registration { factory: "createScreenRecordTool", gate: "deps.screenShare", ts_module: "screen-share-tools.ts", native: Some("screen_share_tools") },
    Registration { factory: "createOsTool", gate: "deps.screenShare", ts_module: "screen-share-tools.ts", native: Some("screen_share_tools") },
    Registration { factory: "createJaitCatalogTool", gate: "", ts_module: "catalog-tools.ts", native: Some("catalog") },
    Registration { factory: "createToolsListTool", gate: "", ts_module: "meta-tools.ts", native: Some("meta_tools") },
    Registration { factory: "createToolsSearchTool", gate: "", ts_module: "meta-tools.ts", native: Some("meta_tools") },
    Registration { factory: "createDecisionEvaluateTool", gate: "", ts_module: "decision.ts", native: Some("decision") },
    Registration { factory: "createBrowserNavigateTool", gate: "", ts_module: "browser-tools.ts", native: Some("browser_tools") },
    Registration { factory: "createBrowserSnapshotTool", gate: "", ts_module: "browser-tools.ts", native: Some("browser_tools") },
    Registration { factory: "createBrowserInspectTool", gate: "", ts_module: "browser-tools.ts", native: Some("browser_tools") },
    Registration { factory: "createBrowserInteractionTools", gate: "", ts_module: "browser-tools.ts", native: Some("browser_tools") },
    Registration { factory: "createPreviewOpenTool", gate: "", ts_module: "preview-tools.ts", native: Some("preview_tools") },
    Registration { factory: "createPreviewStopTool", gate: "", ts_module: "preview-tools.ts", native: Some("preview_tools") },
    Registration { factory: "createPreviewRestartTool", gate: "", ts_module: "preview-tools.ts", native: Some("preview_tools") },
    Registration { factory: "createPreviewStatusTool", gate: "", ts_module: "preview-tools.ts", native: Some("preview_tools") },
    Registration { factory: "createPreviewLogsTool", gate: "", ts_module: "preview-tools.ts", native: Some("preview_tools") },
    Registration { factory: "createPreviewInspectTool", gate: "", ts_module: "preview-tools.ts", native: Some("preview_tools") },
    Registration { factory: "createWebFetchTool", gate: "", ts_module: "browser-tools.ts", native: Some("browser_tools") },
    Registration { factory: "createWebSearchTool", gate: "", ts_module: "browser-tools.ts", native: Some("browser_tools") },
    Registration { factory: "createBrowserSandboxStartTool", gate: "", ts_module: "browser-tools.ts", native: Some("browser_tools") },
    Registration { factory: "createWindowsSandboxStartTool", gate: "", ts_module: "sandbox-tools.ts", native: Some("sandbox_tools") },
    Registration { factory: "createWindowsSandboxStopTool", gate: "", ts_module: "sandbox-tools.ts", native: Some("sandbox_tools") },
    Registration { factory: "createLinuxDesktopSandboxStartTool", gate: "", ts_module: "sandbox-tools.ts", native: Some("sandbox_tools") },
    Registration { factory: "createLinuxDesktopSandboxStopTool", gate: "", ts_module: "sandbox-tools.ts", native: Some("sandbox_tools") },
    Registration { factory: "createScreenshotCaptureTool", gate: "", ts_module: "screenshot-tools.ts", native: Some("screenshot_tools") },
    Registration { factory: "createEmailTools", gate: "deps.emailService", ts_module: "email-tools.ts", native: Some("email_tools") },
    Registration { factory: "createCalendarTools", gate: "deps.calendarService", ts_module: "calendar-tools.ts", native: Some("calendar") },
    Registration { factory: "createHomeAssistantStatesTool", gate: "", ts_module: "homeassistant-tools.ts", native: Some("homeassistant_tools") },
    Registration { factory: "createHomeAssistantServicesTool", gate: "", ts_module: "homeassistant-tools.ts", native: Some("homeassistant_tools") },
    Registration { factory: "createHomeAssistantCallServiceTool", gate: "", ts_module: "homeassistant-tools.ts", native: Some("homeassistant_tools") },
    Registration { factory: "createNetworkScanTool", gate: "", ts_module: "network-tools.ts", native: Some("network_scan") },
    Registration { factory: "createSecurityTools", gate: "", ts_module: "security-tools.ts", native: Some("security_tools") },
    Registration { factory: "createSecurityWorkbenchTools", gate: "", ts_module: "security-workbench-tools.ts", native: Some("security_workbench_tools") },
    Registration { factory: "createElevatedRunTool", gate: "", ts_module: "elevated-tools.ts", native: Some("elevated_tools") },
    Registration { factory: "createSshRunTool", gate: "", ts_module: "ssh-tools.ts", native: Some("ssh_tools") },
    Registration { factory: "createDiagramTool", gate: "", ts_module: "diagram-tools.ts", native: Some("diagrams") },
    Registration { factory: "createArchitectureTool", gate: "", ts_module: "architecture-tools.ts", native: Some("diagrams") },
    Registration { factory: "createCodeGraphTools", gate: "deps.codeGraphService", ts_module: "code-graph-tools.ts", native: Some("code_graph") },
    Registration { factory: "createMaintenanceRunTool", gate: "deps.maintenanceService", ts_module: "maintenance-tools.ts", native: Some("maintenance") },
    Registration { factory: "createMobileAlarmScheduleTool", gate: "deps.mobilePush", ts_module: "mobile-tools.ts", native: None },
    Registration { factory: "createAgentTool", gate: "deps.config", ts_module: "core/index.ts", native: None },
    Registration { factory: "createAgentSpawnTool", gate: "deps.config", ts_module: "agent-tools.ts", native: Some("agent_communication") },
    Registration { factory: "createAgentMessageTool", gate: "deps.config", ts_module: "agent-message-tool.ts", native: Some("agent_communication") },
];

    /// Split a TS gate expression into its individual dependency names.
    pub fn gate_terms(gate: &str) -> Vec<&str> {
        if gate.is_empty() {
            return Vec::new();
        }
        gate.split(" && ").map(str::trim).filter(|s| !s.is_empty()).collect()
    }

    /// `true` when every dependency named in `gate` is in `provided`.
    pub fn gate_satisfied(gate: &str, provided: &[&str]) -> bool {
        gate_terms(gate)
            .iter()
            .all(|term| provided.contains(term))
    }

    /// The registrations `createToolRegistry()` would perform for `provided`
    /// dependency names, in TS call order.
    pub fn registration_plan(provided: &[&str]) -> Vec<&'static Registration> {
        REGISTRATIONS
            .iter()
            .filter(|r| gate_satisfied(r.gate, provided))
            .collect()
    }

    /// Factories with no known native implementation, sorted and de-duplicated.
    ///
    /// This is the explicit gap list: every name here corresponds to TS tool
    /// metadata that has not been ported yet. Nothing is fabricated for them.
    pub fn missing_native() -> Vec<&'static str> {
        let mut out: Vec<&'static str> = REGISTRATIONS
            .iter()
            .filter(|r| r.native.is_none())
            .map(|r| r.factory)
            .collect();
        out.sort_unstable();
        out.dedup();
        out
    }

    /// Re-exported symbols without a known native home, sorted and de-duplicated.
    pub fn reexports_without_native() -> Vec<&'static str> {
        let mut out: Vec<&'static str> = REEXPORTS
            .iter()
            .filter(|r| r.native.is_none())
            .map(|r| r.symbol)
            .collect();
        out.sort_unstable();
        out.dedup();
        out
    }

    /// All re-exported symbols contributed by one TS module.
    pub fn reexports_for_module(ts_module: &str) -> Vec<&'static str> {
        REEXPORTS
            .iter()
            .filter(|r| r.ts_module == ts_module)
            .map(|r| r.symbol)
            .collect()
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        #[test]
        fn reexport_table_matches_ts_barrel_size() {
            assert_eq!(REEXPORTS.len(), 143);
            // Every row carries a TS module and a symbol.
            for r in REEXPORTS {
                assert!(!r.symbol.is_empty());
                assert!(r.ts_module.ends_with(".ts"), "{}", r.ts_module);
            }
            let names: Vec<&str> = REEXPORTS.iter().map(|r| r.symbol).collect();
            let mut sorted = names.clone();
            sorted.sort_unstable();
            sorted.dedup();
            assert_eq!(sorted.len(), names.len(), "duplicate re-export symbols");
        }

        #[test]
        fn registration_table_matches_ts_call_order() {
            assert_eq!(REGISTRATIONS.len(), 99);
            // Families are registered by factory names, never twice in a row.
            for r in REGISTRATIONS {
                assert!(r.factory.starts_with("create"), "{}", r.factory);
                assert!(r.ts_module.ends_with(".ts"), "{}", r.ts_module);
            }
        }

        #[test]
        fn ungated_registrations_are_always_planned() {
            let bare = registration_plan(&[]);
            let expected: Vec<&str> = REGISTRATIONS
                .iter()
                .filter(|r| r.gate.is_empty())
                .map(|r| r.factory)
                .collect();
            let got: Vec<&str> = bare.iter().map(|r| r.factory).collect();
            assert_eq!(got, expected);
        }

        #[test]
        fn gates_select_and_preserve_order() {
            // Pick a real gated registration out of the table, then satisfy it.
            let gated = REGISTRATIONS
                .iter()
                .find(|r| !r.gate.is_empty())
                .expect("table has at least one gated registration");
            let terms = gate_terms(gated.gate);
            assert!(!terms.is_empty());
            assert!(!gate_satisfied(gated.gate, &[]), "gate {} ignored deps", gated.gate);
            let plan = registration_plan(&terms);
            assert!(plan.iter().any(|r| r.factory == gated.factory));
            // Plan is always a subsequence of the table order.
            let order: Vec<usize> = plan
                .iter()
                .map(|r| REGISTRATIONS.iter().position(|x| x.factory == r.factory).unwrap())
                .collect();
            assert!(order.windows(2).all(|w| w[0] < w[1]), "order drifted");
        }

        #[test]
        fn partial_gate_fails_the_whole_gate() {
            let gated = REGISTRATIONS
                .iter()
                .find(|r| gate_terms(r.gate).len() > 1)
                .expect("table has a multi-term gate");
            let terms = gate_terms(gated.gate);
            assert!(!gate_satisfied(gated.gate, &terms[..1]));
            assert!(gate_satisfied(gated.gate, &terms));
        }

        #[test]
        fn gap_lists_only_report_missing_natives() {
            for name in missing_native() {
                let row = REGISTRATIONS.iter().find(|r| r.factory == name).unwrap();
                assert!(row.native.is_none(), "{name} actually has a native port");
            }
            for r in REGISTRATIONS.iter().filter(|r| r.native.is_none()) {
                assert!(missing_native().contains(&r.factory));
            }
        }

        #[test]
        fn reexports_for_module_filters() {
            let module = REGISTRATIONS
                .iter()
                .filter(|r| r.native.is_some())
                .map(|r| r.ts_module)
                .find(|m| !reexports_for_module(m).is_empty())
                .expect("some ported family is also re-exported");
            assert!(!reexports_for_module(module).is_empty());
            assert!(reexports_for_module("does-not-exist.ts").is_empty());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn output_stream_metadata_uses_camel_case() {
        let m = ToolOutputStreamMetadata {
            stream_id: "s1".to_string(),
            seq: 7,
        };
        assert_eq!(
            serde_json::to_value(&m).unwrap(),
            json!({"streamId": "s1", "seq": 7})
        );
    }

    #[test]
    fn nested_agent_event_tool_start_wire_shape() {
        let e = NestedAgentEvent::ToolStart {
            tool: "read".to_string(),
            args: json!({"path": "a"}),
            call_id: "c1".to_string(),
            parent_call_id: None,
        };
        assert_eq!(
            serde_json::to_value(&e).unwrap(),
            json!({"type": "tool_start", "tool": "read", "args": {"path": "a"}, "call_id": "c1"})
        );
    }

    #[test]
    fn nested_agent_event_tool_output_channel_is_lowercase() {
        let e = NestedAgentEvent::ToolOutput {
            call_id: "c1".to_string(),
            content: "hi".to_string(),
            channel: Some(ToolOutputChannel::Thinking),
        };
        assert_eq!(
            serde_json::to_value(&e).unwrap(),
            json!({"type": "tool_output", "call_id": "c1", "content": "hi", "channel": "thinking"})
        );
    }

    #[test]
    fn nested_agent_event_tool_result_omits_absent_optionals() {
        let e = NestedAgentEvent::ToolResult {
            call_id: "c1".to_string(),
            tool: "read".to_string(),
            ok: true,
            message: "done".to_string(),
            parent_call_id: Some("p1".to_string()),
            data: None,
        };
        let v = serde_json::to_value(&e).unwrap();
        assert_eq!(v["type"], json!("tool_result"));
        assert_eq!(v["parent_call_id"], json!("p1"));
        assert!(v.get("data").is_none());
        let back: NestedAgentEvent = serde_json::from_value(v).unwrap();
        assert_eq!(back, e);
    }

    #[test]
    fn tool_source_roundtrips_all_three_union_members() {
        for s in ["builtin", "mcp", "plugin:acme"] {
            let parsed = ToolSource::from_source_str(s).expect(s);
            assert_eq!(parsed.as_source_str(), s);
            assert_eq!(serde_json::to_value(&parsed).unwrap(), json!(s));
        }
        assert!(ToolSource::from_source_str("Plugin:acme").is_none());
        assert_eq!(
            ToolSource::Plugin("acme".to_string()).as_source_str(),
            "plugin:acme"
        );
    }

    #[test]
    fn tool_source_metadata_kinds_match_ts_tags() {
        assert_eq!(
            serde_json::to_value(ToolSourceMetadata::Builtin).unwrap(),
            json!({"kind": "builtin"})
        );
        assert_eq!(
            serde_json::to_value(ToolSourceMetadata::Mcp {
                server_id: None,
                server_name: None
            })
            .unwrap(),
            json!({"kind": "mcp"})
        );
        assert_eq!(
            serde_json::to_value(ToolSourceMetadata::Plugin {
                plugin_id: "p".to_string(),
                plugin_display_name: "P".to_string()
            })
            .unwrap(),
            json!({"kind": "plugin", "pluginId": "p", "pluginDisplayName": "P"})
        );
        let parsed: ToolSourceMetadata =
            serde_json::from_value(json!({"kind": "mcp", "serverId": "s", "serverName": "S"}))
                .unwrap();
        assert_eq!(
            parsed,
            ToolSourceMetadata::Mcp {
                server_id: Some("s".to_string()),
                server_name: Some("S".to_string())
            }
        );
    }

    #[test]
    fn parameters_schema_roundtrips_type_union_nested_items_and_all_of() {
        let v = json!({
            "type": "object",
            "properties": {
                "path": {"type": "string", "minLength": 1},
                "mode": {"type": ["string", "null"], "enum": ["a", "b"]},
                "files": {"type": "array", "items": {"type": "string"}, "maxItems": 5}
            },
            "required": ["path"],
            "allOf": [{
                "if": {"properties": {"mode": {"type": "string"}}, "required": ["mode"]},
                "then": {"properties": {"path": {"type": "string"}}}
            }]
        });
        let p: ToolParametersSchema = serde_json::from_value(v).unwrap();
        assert_eq!(p.schema_type, "object");
        assert_eq!(p.properties["mode"].schema_type.as_slice(), vec!["string", "null"]);
        assert_eq!(p.properties["files"].max_items, Some(5));
        assert_eq!(p.required, Some(vec!["path".to_string()]));
        let back = serde_json::to_value(&p).unwrap();
        assert_eq!(back["allOf"][0]["if"]["required"], json!(["mode"]));
        assert_eq!(back["properties"]["path"]["minLength"], json!(1));
        assert_eq!(back["properties"]["mode"]["enum"], json!(["a", "b"]));
    }

    #[test]
    fn parameters_schema_defaults_type_to_object() {
        let p: ToolParametersSchema = serde_json::from_value(json!({"properties": {}})).unwrap();
        assert_eq!(p.schema_type, TOOL_PARAMETERS_SCHEMA_TYPE);
        assert_eq!(serde_json::to_value(&p).unwrap()["type"], json!("object"));
    }

    #[test]
    fn discovery_metadata_omits_none_and_keeps_priority() {
        let d = ToolDiscoveryMetadata {
            aliases: Some(vec!["shell".to_string()]),
            capabilities: None,
            examples: None,
            priority: Some(3),
        };
        assert_eq!(
            serde_json::to_value(&d).unwrap(),
            json!({"aliases": ["shell"], "priority": 3})
        );
        assert_eq!(
            serde_json::to_value(ToolDiscoveryMetadata::default()).unwrap(),
            json!({})
        );
    }
}
