//! Port of `packages/gateway/src/tools/mcp-bridge.ts`.
//!
//! Bridges Model Context Protocol servers into the native tool registry: it
//! validates transports, maps MCP tool descriptors onto Jait tool definitions,
//! serializes `CallToolResult`s into Jait tool results, and tracks per-server
//! connection state including the connect/disconnect handshake race.
//!
//! ## Host port (unavailable natively)
//!
//! The TS module imports the MCP SDK (`@modelcontextprotocol/sdk`): `Client`,
//! `StdioClientTransport`, `SSEClientTransport`,
//! `StreamableHTTPClientTransport`. None of that exists in this crate and no
//! dependency may be added offline, so every SDK touch sits behind the
//! object-safe [`McpHost`] port: opening a transport/session, listing tools,
//! calling a tool, and closing. The bridge itself is transport-agnostic; a host
//! implementation supplies the wire.
//!
//! ## What is *not* ported
//!
//! `registerMcpTools`/`unregisterMcpTools` mirror the TS registry calls, but the
//! TS `execute` closure (`callMcpTool(serverId, descriptor.name, input)`) cannot
//! be attached to a `Value` definition: the executor is supplied by the caller
//! as an [`ExecutePort`] factory (see [`register_mcp_tools`]) because a native
//! executor needs the registry's context type `C`. [`McpManager`] does not own
//! a `ToolRegistry<C>`; its registered lifecycle methods accept a caller-owned
//! registry and executor. Production wiring and an actual transport are absent.
//!
//! ## Call order (mirrors TS exactly)
//!
//! [`McpBridge::connect_server`]: `validate_transport` (throws on missing
//! `command`/`url` or an unknown transport) → `host.connect` → `host.list_tools`
//! → map descriptors → *supersede check* (`pending[id] != attempt` ⇒ close the
//! fresh session, return the untouched base) → remove and close the previous
//! client → *supersede check again* → install client, clear pending, report
//! `connected`. Any failure in the first three steps clears pending (only if it
//! still owns the attempt) and closes the half-open session, reporting `error`
//! with the original message.
//!
//! `McpManager::connect` repeats the attempt bookkeeping around
//! [`McpBridge::connect_server`] and rejects the result if the *config object*
//! was replaced meanwhile, exactly like the TS `configs.get(id) !== config`
//! identity check.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::tools::contracts::{ToolResult, ToolSource};
use crate::tools::registry::{ExecutePort, ToolRegistry};

/// JSON tag for external tools (`crate::plugins::contracts::ToolTier::External`).
pub const TIER_EXTERNAL: &str = "external";
/// JSON tag for external tools (`crate::plugins::contracts::ToolCategory::External`).
pub const CATEGORY_EXTERNAL: &str = "external";
/// Message used when an MCP result carries no text blocks at all.
pub const NO_TEXT_CONTENT: &str = "MCP tool returned no text content";

/// Error raised while building a transport (`buildTransport` in TS).
///
/// The `Display` output is the TS `Error.message` byte-for-byte.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct McpBridgeError(pub String);

impl std::fmt::Display for McpBridgeError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for McpBridgeError {}

/// TS `McpTransport`.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum McpTransport {
    Stdio,
    Sse,
    #[serde(rename = "streamable-http")]
    StreamableHttp,
}

impl McpTransport {
    /// Wire spelling (`stdio`, `sse`, `streamable-http`).
    pub fn as_str(self) -> &'static str {
        match self {
            McpTransport::Stdio => "stdio",
            McpTransport::Sse => "sse",
            McpTransport::StreamableHttp => "streamable-http",
        }
    }

    /// Parse a transport name, reproducing the TS `default:` branch message.
    pub fn parse(raw: &str) -> Result<Self, McpBridgeError> {
        match raw {
            "stdio" => Ok(McpTransport::Stdio),
            "sse" => Ok(McpTransport::Sse),
            "streamable-http" => Ok(McpTransport::StreamableHttp),
            other => Err(unsupported_transport(other)),
        }
    }
}

/// `throw new Error(\`Unsupported MCP transport: ${transport}\`)`.
///
/// Unreachable through the typed config (the union cannot hold other values),
/// but preserved so deserialization from untrusted JSON fails identically.
pub fn unsupported_transport(transport: &str) -> McpBridgeError {
    McpBridgeError(format!("Unsupported MCP transport: {transport}"))
}

/// TS `McpServerConfig`.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServerConfig {
    pub id: String,
    pub name: String,
    pub transport: Option<McpTransport>,
    /// Required for `stdio`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub command: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub args: Option<Vec<String>>,
    /// Required for `sse` / `streamable-http`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub env: Option<BTreeMap<String, String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cwd: Option<String>,
    /// `enabled?: boolean` — anything but explicit `false` is enabled.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub enabled: Option<bool>,
}

impl McpServerConfig {
    pub fn is_enabled(&self) -> bool {
        self.enabled != Some(false)
    }

    fn transport_or_stdio(&self) -> McpTransport {
        self.transport.unwrap_or(McpTransport::Stdio)
    }
}

/// `buildTransport()` validation half: the TS throws before touching the SDK.
pub fn validate_transport(config: &McpServerConfig) -> Result<(), McpBridgeError> {
    let transport = config.transport_or_stdio();
    match transport {
        McpTransport::Stdio => {
            if config.command.as_deref().unwrap_or("").is_empty() {
                return Err(McpBridgeError(format!(
                    "MCP server '{}' (stdio) requires a 'command'",
                    config.id
                )));
            }
        }
        McpTransport::Sse | McpTransport::StreamableHttp => {
            if config.url.as_deref().unwrap_or("").is_empty() {
                return Err(McpBridgeError(format!(
                    "MCP server '{}' ({}) requires a 'url'",
                    config.id,
                    transport.as_str()
                )));
            }
        }
    }
    Ok(())
}

/// TS `McpToolDescriptor`.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpToolDescriptor {
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(rename = "inputSchema", default)]
    pub input_schema: crate::tools::contracts::ToolParametersSchema,
}

/// Raw tool as returned by `listTools()` (TS reads `.name`, `.description`,
/// `.inputSchema` off the SDK result).
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpRawTool {
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(rename = "inputSchema", default, skip_serializing_if = "Option::is_none")]
    pub input_schema: Option<crate::tools::contracts::ToolParametersSchema>,
}

/// `descriptor.description ?? ""` / `descriptor.inputSchema ?? {type:"object",properties:{}}`.
pub fn to_mcp_tool_descriptor(raw: &McpRawTool) -> McpToolDescriptor {
    McpToolDescriptor {
        name: raw.name.clone(),
        description: raw.description.clone().unwrap_or_default(),
        input_schema: raw
            .input_schema
            .clone()
            .unwrap_or_else(crate::tools::contracts::ToolParametersSchema::default),
    }
}

/// `mcp.${serverId}.${toolName}`
pub fn mcp_tool_prefix(server_id: &str) -> String {
    format!("mcp.{server_id}.")
}

/// `mcp.${serverId}.${toolName}` — collision-free registry name.
pub fn build_jait_tool_name(server_id: &str, tool_name: &str) -> String {
    format!("{}{}", mcp_tool_prefix(server_id), tool_name)
}

/// `[MCP: ${serverId}] ${description}`
pub fn build_jait_description(server_id: &str, description: &str) -> String {
    format!("[MCP: {server_id}] {description}")
}

/// TS `McpConnection["status"]`.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum McpConnectionStatus {
    Connected,
    Disconnected,
    Error,
}

/// TS `McpConnection`.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpConnection {
    pub server_id: String,
    pub server_name: String,
    pub status: McpConnectionStatus,
    pub tools: Vec<McpToolDescriptor>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

// A present JSON null differs from an absent field, just as null differs from
// undefined in the TypeScript bridge. Serde's default Option deserializer
// otherwise maps both to None.
fn deserialize_present_value<'de, D>(deserializer: D) -> Result<Option<Value>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    Value::deserialize(deserializer).map(Some)
}

/// TS `CallToolResult` subset consumed by `serializeToolResult`.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpCallResult {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub content: Option<Vec<Value>>,
    #[serde(rename = "isError", default, skip_serializing_if = "Option::is_none")]
    pub is_error: Option<bool>,
    #[serde(default, deserialize_with = "deserialize_present_value", skip_serializing_if = "Option::is_none")]
    pub structured_content: Option<Value>,
    /// SDK 1.30+ task-based variant that replaces `content`.
    #[serde(default, deserialize_with = "deserialize_present_value", skip_serializing_if = "Option::is_none")]
    pub tool_result: Option<Value>,
}

fn tool_result_of(ok: bool, message: String, data: Option<Value>) -> ToolResult {
    ToolResult {
        ok: json!(ok),
        message: message.into(),
        data,
    }
}

fn stringify(value: &Value) -> String {
    serde_json::to_string(value).unwrap_or_default()
}

/// Serialize an MCP `CallToolResult` into a Jait [`ToolResult`].
///
/// Call order matches TS: `toolResult` variant first (string → verbatim,
/// otherwise JSON), then text blocks joined with `\n` (non-text blocks and
/// resources are JSON-stringified), the [`NO_TEXT_CONTENT`] fallback, and
/// `structuredContent` taking precedence for `data`.
pub fn serialize_tool_result(result: &McpCallResult) -> ToolResult {
    if let Some(tool_result) = &result.tool_result {
        let message = match tool_result {
            Value::String(s) => s.clone(),
            other => stringify(other),
        };
        return tool_result_of(
            result.is_error != Some(true),
            message,
            Some(tool_result.clone()),
        );
    }

    let mut text_parts: Vec<String> = Vec::new();
    for block in result.content.as_deref().unwrap_or(&[]) {
        let is_text = block.get("type").and_then(Value::as_str) == Some("text");
        match (is_text, block.get("text").and_then(Value::as_str)) {
            (true, Some(text)) => text_parts.push(text.to_string()),
            _ => text_parts.push(stringify(block)),
        }
    }

    let joined = text_parts.join("\n");
    let message = if joined.is_empty() {
        NO_TEXT_CONTENT.to_string()
    } else {
        joined
    };
    let data = match &result.structured_content {
        Some(value) => Some(value.clone()),
        None if !text_parts.is_empty() => Some(json!(text_parts)),
        None => None,
    };
    tool_result_of(result.is_error != Some(true), message, data)
}

/// Opaque session handle handed out by an [`McpHost`].
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub struct McpSession(pub u64);

/// Object-safe port over the MCP SDK client + transports.
///
/// Errors are `String` because the TS layer only ever surfaces `err.message`.
pub trait McpHost {
    /// Build the transport, construct the client, `connect()`, and return the
    /// session. A failure here must leave nothing to close (or the host must
    /// close internally) — the bridge still calls [`McpHost::close`] only for
    /// sessions it received.
    fn connect(&mut self, config: &McpServerConfig) -> Result<McpSession, String>;
    /// `client.listTools()`.
    fn list_tools(&mut self, session: McpSession) -> Result<Vec<McpRawTool>, String>;
    /// `client.callTool({ name, arguments })`.
    fn call_tool(
        &mut self,
        session: McpSession,
        name: &str,
        arguments: &Value,
    ) -> Result<McpCallResult, String>;
    /// `client.close()`; errors are ignored by the caller, as in TS.
    fn close(&mut self, session: McpSession);
}

/// Per-server session state plus the pending-handshake tokens.
pub struct McpBridge<H: McpHost> {
    host: H,
    clients: BTreeMap<String, McpSession>,
    /// TS `pendingConnections: Map<string, symbol>` — `Symbol(id)` identity is
    /// modelled by a monotonically increasing attempt token, which has the same
    /// supersede semantics.
    pending: BTreeMap<String, u64>,
    attempts: u64,
}

impl<H: McpHost> McpBridge<H> {
    pub fn new(host: H) -> Self {
        Self {
            host,
            clients: BTreeMap::new(),
            pending: BTreeMap::new(),
            attempts: 0,
        }
    }

    pub fn host(&self) -> &H {
        &self.host
    }

    pub fn is_connected(&self, server_id: &str) -> bool {
        self.clients.contains_key(server_id)
    }

    pub fn connected_servers(&self) -> Vec<String> {
        self.clients.keys().cloned().collect()
    }

    /// TS `connectMcpServer(config)` — see the module docs for the exact order.
    pub fn connect_server(&mut self, config: &McpServerConfig) -> McpConnection {
        let base = |status: McpConnectionStatus, error: Option<String>| McpConnection {
            server_id: config.id.clone(),
            server_name: config.name.clone(),
            status,
            tools: Vec::new(),
            error,
        };

        let attempt = self.attempts;
        self.attempts += 1;
        self.pending.insert(config.id.clone(), attempt);

        let mut session: Option<McpSession> = None;
        let outcome: Result<Vec<McpToolDescriptor>, String> = (|| {
            validate_transport(config).map_err(|e| e.0)?;
            let opened = self.host.connect(config)?;
            session = Some(opened);
            let raw = self.host.list_tools(opened)?;
            Ok(raw.iter().map(to_mcp_tool_descriptor).collect())
        })();

        match outcome {
            Ok(descriptors) => {
                let opened = session.expect("session set on success");
                if self.pending.get(&config.id) != Some(&attempt) {
                    self.host.close(opened);
                    return base(McpConnectionStatus::Disconnected, None);
                }
                // Remove the previous owner before awaiting close: a disconnect
                // or newer connect can run during that await and must retain
                // ownership of its state.
                if let Some(previous) = self.clients.remove(&config.id) {
                    self.host.close(previous);
                }
                if self.pending.get(&config.id) != Some(&attempt) {
                    self.host.close(opened);
                    return base(McpConnectionStatus::Disconnected, None);
                }
                self.clients.insert(config.id.clone(), opened);
                self.pending.remove(&config.id);
                McpConnection {
                    status: McpConnectionStatus::Connected,
                    tools: descriptors,
                    ..base(McpConnectionStatus::Connected, None)
                }
            }
            Err(message) => {
                if self.pending.get(&config.id) == Some(&attempt) {
                    self.pending.remove(&config.id);
                }
                // A failed handshake/list still owns its transport and possibly
                // a child; it is not in `clients`, so disconnect cannot clean it.
                if let Some(opened) = session {
                    self.host.close(opened);
                }
                base(McpConnectionStatus::Error, Some(message))
            }
        }
    }

    /// TS `callMcpTool(serverId, toolName, args)`.
    pub fn call_mcp_tool(&mut self, server_id: &str, tool_name: &str, args: &Value) -> ToolResult {
        let Some(session) = self.clients.get(server_id).copied() else {
            return tool_result_of(
                false,
                format!("MCP server '{server_id}' is not connected"),
                None,
            );
        };
        let arguments = match args {
            Value::Null => Value::Object(Default::default()),
            other => other.clone(),
        };
        match self.host.call_tool(session, tool_name, &arguments) {
            Ok(result) => serialize_tool_result(&result),
            Err(message) => tool_result_of(false, message, None),
        }
    }

    /// TS `disconnectMcpServer(serverId)` — clears pending, then closes.
    pub fn disconnect_server(&mut self, server_id: &str) {
        self.pending.remove(server_id);
        if let Some(session) = self.clients.remove(server_id) {
            self.host.close(session);
        }
    }
}

/// Wrap an MCP descriptor as a Jait tool definition `Value`.
///
/// Keys and values are exactly the TS object literal: `name`, `description`,
/// `parameters`, `tier`, `category`, `source`, `sourceMetadata`, `discovery`.
/// The TS `execute` method has no `Value` representation — see
/// [`register_mcp_tools`] for the executor half.
pub fn wrap_mcp_tool(server_id: &str, descriptor: &McpToolDescriptor) -> Value {
    json!({
        "name": build_jait_tool_name(server_id, &descriptor.name),
        "description": build_jait_description(server_id, &descriptor.description),
        "parameters": descriptor.input_schema,
        "tier": TIER_EXTERNAL,
        "category": CATEGORY_EXTERNAL,
        "source": ToolSource::Mcp.as_source_str(),
        "sourceMetadata": {
            "kind": "mcp",
            "serverId": server_id,
            "serverName": server_id,
        },
        "discovery": {
            "aliases": [descriptor.name, server_id],
            "capabilities": [descriptor.description],
        },
    })
}

/// TS `registerMcpTools(registry, connection)` — returns the count registered.
///
/// `executor` supplies the native [`ExecutePort`] for each wrapped tool (the
/// caller closes over the bridge to reach [`McpBridge::call_mcp_tool`]).
pub fn register_mcp_tools<C, F>(
    registry: &mut ToolRegistry<C>,
    connection: &McpConnection,
    mut executor: F,
) -> usize
where
    F: FnMut(&str, &str) -> ExecutePort<C>,
    C: Clone,
{
    let mut count = 0;
    for descriptor in &connection.tools {
        let tool = wrap_mcp_tool(&connection.server_id, descriptor);
        let execute = executor(&connection.server_id, &descriptor.name);
        registry.register(tool, execute);
        count += 1;
    }
    count
}

/// Names to drop for a server: everything under `mcp.<serverId>.`.
pub fn names_with_prefix(names: &[String], server_id: &str) -> Vec<String> {
    let prefix = mcp_tool_prefix(server_id);
    names
        .iter()
        .filter(|name| name.starts_with(&prefix))
        .cloned()
        .collect()
}

/// TS `unregisterMcpTools(registry, serverId)` — returns the count removed.
pub fn unregister_mcp_tools<C: Clone>(registry: &mut ToolRegistry<C>, server_id: &str) -> usize {
    let to_remove = names_with_prefix(&registry.list_names(), server_id);
    for name in &to_remove {
        registry.unregister(name);
    }
    to_remove.len()
}

/// TS `McpManager.getStatus()` row.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServerStatus {
    pub id: String,
    pub name: String,
    pub status: McpConnectionStatus,
    pub tool_count: usize,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// TS `McpManager` — configs, connection snapshots and connect-all policy.
///
/// Registry ownership is delegated to the caller (see module docs): after
/// [`McpManager::connect`] the caller runs [`unregister_mcp_tools`] then
/// [`register_mcp_tools`] when the connection is `connected`, which is the
/// order the TS class uses internally.
pub struct McpManager<H: McpHost> {
    bridge: McpBridge<H>,
    configs: BTreeMap<String, McpServerConfig>,
    connections: BTreeMap<String, McpConnection>,
    /// TS `pending: Map<string, symbol>` for the config-identity check.
    pending: BTreeMap<String, u64>,
    attempts: u64,
    /// TS `configs: Map` key order — `addServer` appends, re-adding keeps place.
    order: Vec<String>,
}

impl<H: McpHost> McpManager<H> {
    pub fn new(host: H) -> Self {
        Self {
            bridge: McpBridge::new(host),
            configs: BTreeMap::new(),
            connections: BTreeMap::new(),
            pending: BTreeMap::new(),
            attempts: 0,
            order: Vec::new(),
        }
    }

    pub fn bridge(&self) -> &McpBridge<H> {
        &self.bridge
    }

    pub fn bridge_mut(&mut self) -> &mut McpBridge<H> {
        &mut self.bridge
    }

    /// TS `addServer(config)`.
    pub fn add_server(&mut self, config: McpServerConfig) {
        if !self.configs.contains_key(&config.id) {
            self.order.push(config.id.clone());
        }
        self.configs.insert(config.id.clone(), config);
    }

    /// TS `removeServer(serverId)` — disconnect first, then forget the config.
    pub fn remove_server(&mut self, server_id: &str) {
        self.disconnect(server_id);
        self.configs.remove(server_id);
        self.order.retain(|id| id != server_id);
    }

    /// TS `connect(serverId)`.
    pub fn connect(&mut self, server_id: &str) -> McpConnection {
        let Some(config) = self.configs.get(server_id).cloned() else {
            return McpConnection {
                server_id: server_id.to_string(),
                server_name: server_id.to_string(),
                status: McpConnectionStatus::Error,
                tools: Vec::new(),
                error: Some(format!("No config found for MCP server '{server_id}'")),
            };
        };

        let attempt = self.attempts;
        self.attempts += 1;
        self.pending.insert(server_id.to_string(), attempt);

        let connection = self.bridge.connect_server(&config);
        if self.pending.get(server_id) != Some(&attempt)
            || self.configs.get(server_id).map(|c| c.id.as_str()) != Some(server_id)
        {
            return connection;
        }
        self.pending.remove(server_id);
        self.connections
            .insert(server_id.to_string(), connection.clone());
        connection
    }

    /// Connect and synchronize a caller-owned registry in the same operation.
    /// The supplied executor retains the caller's authority and dispatch policy.
    /// Failed connections leave existing registered tools unchanged, as in TS.
    pub fn connect_registered<C: Clone, F>(
        &mut self,
        server_id: &str,
        registry: &mut ToolRegistry<C>,
        executor: F,
    ) -> McpConnection
    where
        F: FnMut(&str, &str) -> ExecutePort<C>,
    {
        let connection = self.connect(server_id);
        if connection.status == McpConnectionStatus::Connected {
            unregister_mcp_tools(registry, server_id);
            register_mcp_tools(registry, &connection, executor);
        }
        connection
    }

    /// Unregister before closing the host session, matching TS disconnect order.
    pub fn disconnect_registered<C: Clone>(
        &mut self,
        server_id: &str,
        registry: &mut ToolRegistry<C>,
    ) {
        unregister_mcp_tools(registry, server_id);
        self.disconnect(server_id);
    }

    /// Remove a server and its registered tools together.
    pub fn remove_server_registered<C: Clone>(
        &mut self,
        server_id: &str,
        registry: &mut ToolRegistry<C>,
    ) {
        self.disconnect_registered(server_id, registry);
        self.configs.remove(server_id);
        self.order.retain(|id| id != server_id);
    }

    /// TS `disconnect(serverId)`.
    pub fn disconnect(&mut self, server_id: &str) {
        self.pending.remove(server_id);
        self.connections.remove(server_id);
        self.bridge.disconnect_server(server_id);
    }

    /// TS `connectAll()` — skips configs with `enabled === false`.
    pub fn connect_all(&mut self) -> Vec<McpConnection> {
        let ids: Vec<String> = self
            .order
            .iter()
            .filter_map(|id| self.configs.get(id))
            .filter(|config| config.is_enabled())
            .map(|config| config.id.clone())
            .collect();
        let mut results = Vec::new();
        for id in ids {
            results.push(self.connect(&id));
        }
        results
    }

    /// TS `getStatus()`.
    pub fn get_status(&self) -> Vec<McpServerStatus> {
        self.order
            .iter()
            .filter_map(|id| self.configs.get(id))
            .map(|config| {
                let connection = self.connections.get(&config.id);
                McpServerStatus {
                    id: config.id.clone(),
                    name: config.name.clone(),
                    status: connection
                        .map(|c| c.status)
                        .unwrap_or(McpConnectionStatus::Disconnected),
                    tool_count: connection.map(|c| c.tools.len()).unwrap_or(0),
                    error: connection.and_then(|c| c.error.clone()),
                }
            })
            .collect()
    }

    /// TS `getConfigs()`.
    pub fn get_configs(&self) -> Vec<McpServerConfig> {
        self.order
            .iter()
            .filter_map(|id| self.configs.get(id).cloned())
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn text_of(result: &ToolResult) -> String {
        String::from_utf16(&result.message.0).unwrap_or_default()
    }

    fn stdio_config(id: &str) -> McpServerConfig {
        McpServerConfig {
            id: id.to_string(),
            name: id.to_string(),
            transport: Some(McpTransport::Stdio),
            command: Some("npx".to_string()),
            ..Default::default()
        }
    }

    fn descriptor(name: &str, description: &str) -> McpToolDescriptor {
        McpToolDescriptor {
            name: name.to_string(),
            description: description.to_string(),
            input_schema: Default::default(),
        }
    }

    #[derive(Default)]
    struct FakeHost {
        next: u64,
        fail_connect: Option<String>,
        tools: Vec<McpRawTool>,
        call_result: Option<McpCallResult>,
        calls: Vec<(String, Value)>,
        closed: Vec<u64>,
    }

    impl McpHost for FakeHost {
        fn connect(&mut self, _config: &McpServerConfig) -> Result<McpSession, String> {
            if let Some(message) = &self.fail_connect {
                return Err(message.clone());
            }
            self.next += 1;
            Ok(McpSession(self.next))
        }

        fn list_tools(&mut self, _session: McpSession) -> Result<Vec<McpRawTool>, String> {
            Ok(self.tools.clone())
        }

        fn call_tool(
            &mut self,
            session: McpSession,
            name: &str,
            arguments: &Value,
        ) -> Result<McpCallResult, String> {
            self.calls
                .push((format!("{}:{}", session.0, name), arguments.clone()));
            Ok(self.call_result.clone().unwrap_or_default())
        }

        fn close(&mut self, session: McpSession) {
            self.closed.push(session.0);
        }
    }

    #[test]
    fn explicit_null_results_differ_from_absent_fields() {
        let task: McpCallResult = serde_json::from_value(json!({
            "toolResult": null,
            "content": [{"type": "text", "text": "ignored"}]
        })).unwrap();
        assert_eq!(task.tool_result, Some(Value::Null));
        assert_eq!(serde_json::to_value(&task).unwrap()["toolResult"], Value::Null);
        let result = serialize_tool_result(&task);
        assert_eq!(text_of(&result), "null");
        assert_eq!(result.data, Some(Value::Null));

        let structured: McpCallResult = serde_json::from_value(json!({
            "structuredContent": null,
            "content": [{"type": "text", "text": "visible"}]
        })).unwrap();
        assert_eq!(structured.structured_content, Some(Value::Null));
        let result = serialize_tool_result(&structured);
        assert_eq!(text_of(&result), "visible");
        assert_eq!(result.data, Some(Value::Null));

        let absent: McpCallResult = serde_json::from_value(json!({
            "content": [{"type": "text", "text": "visible"}]
        })).unwrap();
        assert_eq!(absent.tool_result, None);
        assert_eq!(absent.structured_content, None);
        assert_eq!(serialize_tool_result(&absent).data, Some(json!(["visible"])));
        assert!(serde_json::to_value(absent).unwrap().get("toolResult").is_none());
    }

    #[test]
    fn registered_lifecycle_replaces_and_removes_only_server_tools() {
        use std::rc::Rc;
        fn executor(_: &str, _: &str) -> ExecutePort<()> {
            Rc::new(|_, _, _| Box::pin(async { Ok(tool_result_of(true, String::new(), None)) }))
        }
        let host = FakeHost {
            tools: vec![McpRawTool { name: "old".into(), ..Default::default() }],
            ..Default::default()
        };
        let mut manager = McpManager::new(host);
        let mut registry = ToolRegistry::new(Rc::new(|| "id".to_string()));
        manager.add_server(stdio_config("srv"));
        manager.connect_registered("srv", &mut registry, executor);
        assert_eq!(registry.list_names(), vec!["mcp.srv.old".to_string()]);

        manager.bridge.host.tools = vec![McpRawTool { name: "new".into(), ..Default::default() }];
        manager.connect_registered("srv", &mut registry, executor);
        assert_eq!(registry.list_names(), vec!["mcp.srv.new".to_string()]);
        manager.add_server(stdio_config("other"));
        manager.connect_registered("other", &mut registry, executor);
        manager.bridge.host.fail_connect = Some("failed".into());
        assert_eq!(manager.connect_registered("srv", &mut registry, executor).status, McpConnectionStatus::Error);
        assert!(registry.list_names().contains(&"mcp.srv.new".to_string()));
        manager.remove_server_registered("srv", &mut registry);
        assert_eq!(registry.list_names(), vec!["mcp.other.new".to_string()]);
        assert!(!manager.bridge().is_connected("srv"));
    }

    #[test]
    fn connection_preserves_configured_server_name_on_success_and_failure() {
        let mut config = stdio_config("srv");
        config.name = "Friendly name".to_string();
        let mut bridge = McpBridge::new(FakeHost::default());
        assert_eq!(bridge.connect_server(&config).server_name, "Friendly name");
        config.command = None;
        assert_eq!(bridge.connect_server(&config).server_name, "Friendly name");
    }

    #[test]
    fn transport_validation_messages_match_ts() {
        let mut config = stdio_config("srv");
        config.command = None;
        assert_eq!(
            validate_transport(&config).unwrap_err().0,
            "MCP server 'srv' (stdio) requires a 'command'"
        );

        let mut sse = stdio_config("srv");
        sse.transport = Some(McpTransport::Sse);
        sse.command = None;
        assert_eq!(
            validate_transport(&sse).unwrap_err().0,
            "MCP server 'srv' (sse) requires a 'url'"
        );

        let mut http = sse.clone();
        http.transport = Some(McpTransport::StreamableHttp);
        http.url = Some("http://localhost:1/mcp".to_string());
        assert!(validate_transport(&http).is_ok());
        http.url = None;
        assert_eq!(
            validate_transport(&http).unwrap_err().0,
            "MCP server 'srv' (streamable-http) requires a 'url'"
        );

        assert_eq!(
            unsupported_transport("websocket").0,
            "Unsupported MCP transport: websocket"
        );
        assert_eq!(
            McpTransport::parse("streamable-http").unwrap().as_str(),
            "streamable-http"
        );
    }

    #[test]
    fn descriptor_defaults_description_and_empty_schema() {
        let raw = McpRawTool {
            name: "create_issue".to_string(),
            ..Default::default()
        };
        let descriptor = to_mcp_tool_descriptor(&raw);
        assert_eq!(descriptor.description, "");
        let schema = serde_json::to_value(&descriptor.input_schema).unwrap();
        assert_eq!(schema, json!({"type": "object", "properties": {}}));
    }

    #[test]
    fn wrapped_tool_metadata_is_camel_case_and_prefixed() {
        let tool = wrap_mcp_tool("github", &descriptor("create_issue", "Open an issue"));
        assert_eq!(tool["name"], json!("mcp.github.create_issue"));
        assert_eq!(tool["description"], json!("[MCP: github] Open an issue"));
        assert_eq!(tool["tier"], json!("external"));
        assert_eq!(tool["category"], json!("external"));
        assert_eq!(tool["source"], json!("mcp"));
        assert_eq!(
            tool["sourceMetadata"],
            json!({"kind": "mcp", "serverId": "github", "serverName": "github"})
        );
        assert_eq!(
            tool["discovery"],
            json!({"aliases": ["create_issue", "github"], "capabilities": ["Open an issue"]})
        );
        assert_eq!(
            build_jait_tool_name("github", "create_issue"),
            "mcp.github.create_issue"
        );
    }

    #[test]
    fn serialize_text_blocks_joins_and_lists_parts_as_data() {
        let result = McpCallResult {
            content: Some(vec![
                json!({"type": "text", "text": "first"}),
                json!({"type": "resource", "uri": "file:///a"}),
            ]),
            ..Default::default()
        };
        let out = serialize_tool_result(&result);
        assert_eq!(out.ok, json!(true));
        assert_eq!(text_of(&out), "first\n{\"type\":\"resource\",\"uri\":\"file:///a\"}");
        assert_eq!(out.data.unwrap().as_array().unwrap().len(), 2);
    }

    #[test]
    fn serialize_without_content_uses_fallback_message() {
        let out = serialize_tool_result(&McpCallResult::default());
        assert_eq!(text_of(&out), NO_TEXT_CONTENT);
        assert!(out.data.is_none());
        assert_eq!(out.ok, json!(true));
    }

    #[test]
    fn serialize_prefers_structured_content_and_honours_is_error() {
        let result = McpCallResult {
            content: Some(vec![json!({"type": "text", "text": "ignored for data"})]),
            is_error: Some(true),
            structured_content: Some(json!({"count": 2})),
            tool_result: None,
        };
        let out = serialize_tool_result(&result);
        assert_eq!(out.ok, json!(false));
        assert_eq!(out.data, Some(json!({"count": 2})));
        assert_eq!(text_of(&out), "ignored for data");
    }

    #[test]
    fn serialize_tool_result_variant_string_and_object() {
        let text = McpCallResult {
            tool_result: Some(json!("task done")),
            ..Default::default()
        };
        let out = serialize_tool_result(&text);
        assert_eq!(text_of(&out), "task done");
        assert_eq!(out.data, Some(json!("task done")));

        let object = McpCallResult {
            tool_result: Some(json!({"taskId": "t1"})),
            is_error: Some(true),
            ..Default::default()
        };
        let out = serialize_tool_result(&object);
        assert_eq!(text_of(&out), "{\"taskId\":\"t1\"}");
        assert_eq!(out.ok, json!(false));
    }

    #[test]
    fn connect_maps_tools_and_closes_previous_session() {
        let host = FakeHost {
            tools: vec![
                McpRawTool {
                    name: "a".to_string(),
                    description: Some("A".to_string()),
                    input_schema: None,
                },
                McpRawTool {
                    name: "b".to_string(),
                    ..Default::default()
                },
            ],
            ..Default::default()
        };
        let mut bridge = McpBridge::new(host);
        let first = bridge.connect_server(&stdio_config("srv"));
        assert_eq!(first.status, McpConnectionStatus::Connected);
        assert_eq!(first.tools.len(), 2);
        assert_eq!(first.tools[0].name, "a");

        let second = bridge.connect_server(&stdio_config("srv"));
        assert_eq!(second.status, McpConnectionStatus::Connected);
        assert_eq!(bridge.host().closed, vec![1], "previous session closed");
        assert_eq!(bridge.connected_servers(), vec!["srv".to_string()]);
    }

    #[test]
    fn failed_connect_reports_message_and_keeps_previous_client() {
        let host = FakeHost {
            tools: vec![],
            ..Default::default()
        };
        let mut bridge = McpBridge::new(host);
        assert_eq!(
            bridge.connect_server(&stdio_config("srv")).status,
            McpConnectionStatus::Connected
        );

        bridge.host.fail_connect = Some("handshake refused".to_string());
        let failed = bridge.connect_server(&stdio_config("srv"));
        assert_eq!(failed.status, McpConnectionStatus::Error);
        assert_eq!(failed.error.as_deref(), Some("handshake refused"));
        assert!(bridge.is_connected("srv"), "previous client retained");
    }

    #[test]
    fn connect_without_command_fails_before_host_is_called() {
        let mut bridge = McpBridge::new(FakeHost::default());
        let mut config = stdio_config("srv");
        config.command = None;
        let connection = bridge.connect_server(&config);
        assert_eq!(connection.status, McpConnectionStatus::Error);
        assert_eq!(
            connection.error.as_deref(),
            Some("MCP server 'srv' (stdio) requires a 'command'")
        );
        assert_eq!(bridge.host().next, 0, "host never connected");
        assert!(bridge.host().closed.is_empty());
    }

    #[test]
    fn call_tool_requires_connection_and_defaults_null_args() {
        let mut bridge = McpBridge::new(FakeHost::default());
        let missing = bridge.call_mcp_tool("srv", "a", &json!({}));
        assert_eq!(missing.ok, json!(false));
        assert_eq!(text_of(&missing), "MCP server 'srv' is not connected");

        bridge.connect_server(&stdio_config("srv"));
        let out = bridge.call_mcp_tool("srv", "a", &Value::Null);
        assert_eq!(out.ok, json!(true));
        assert_eq!(bridge.host().calls.len(), 1);
        assert_eq!(bridge.host().calls[0].0, "1:a");
        assert_eq!(bridge.host().calls[0].1, json!({}));
    }

    #[test]
    fn unregister_prefix_matches_only_that_server() {
        let names = vec![
            "mcp.github.a".to_string(),
            "mcp.github.b".to_string(),
            "mcp.gitlab.a".to_string(),
            "mcp.githu".to_string(),
            "read".to_string(),
        ];
        assert_eq!(
            names_with_prefix(&names, "github"),
            vec!["mcp.github.a".to_string(), "mcp.github.b".to_string()]
        );
        assert!(names_with_prefix(&names, "git").is_empty());
    }

    #[test]
    fn manager_status_and_connect_all_respect_enabled_flag() {
        let host = FakeHost {
            tools: vec![McpRawTool {
                name: "a".to_string(),
                ..Default::default()
            }],
            ..Default::default()
        };
        let mut manager = McpManager::new(host);
        let mut disabled = stdio_config("off");
        disabled.enabled = Some(false);
        manager.add_server(stdio_config("on"));
        manager.add_server(disabled);

        let status = manager.get_status();
        assert_eq!(status.len(), 2);
        assert_eq!(status[0].status, McpConnectionStatus::Disconnected);
        assert_eq!(status[0].tool_count, 0);

        let results = manager.connect_all();
        assert_eq!(results.len(), 1, "disabled server skipped");
        assert_eq!(results[0].server_id, "on");
        assert_eq!(results[0].tools.len(), 1);
        assert_eq!(manager.get_status()[0].tool_count, 1);
        assert_eq!(
            manager.get_status()[1].status,
            McpConnectionStatus::Disconnected
        );
        assert_eq!(manager.get_configs().len(), 2);
    }

    #[test]
    fn manager_connect_without_config_reports_error() {
        let mut manager = McpManager::new(FakeHost::default());
        let connection = manager.connect("ghost");
        assert_eq!(connection.status, McpConnectionStatus::Error);
        assert_eq!(
            connection.error.as_deref(),
            Some("No config found for MCP server 'ghost'")
        );
    }

    #[test]
    fn manager_remove_server_disconnects_and_forgets_config() {
        let host = FakeHost::default();
        let mut manager = McpManager::new(host);
        manager.add_server(stdio_config("srv"));
        manager.connect("srv");
        assert!(manager.bridge().is_connected("srv"));

        manager.remove_server("srv");
        assert!(!manager.bridge().is_connected("srv"));
        assert!(manager.get_configs().is_empty());
        assert!(manager.get_status().is_empty());
        assert_eq!(manager.bridge().host().closed, vec![1]);
    }
}
