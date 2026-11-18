//! In-memory connected-node registry. Advertising capabilities grants no permissions.
//! Time and collation are explicit so hosts can match their JS gateway locale.
use icu_collator::{Collator, CollatorBorrowed, options::CollatorOptions};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

pub const NODE_PROTOCOL_VERSION: u32 = 1;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum NodePlatform {
    Windows,
    Macos,
    Linux,
    Android,
    Ios,
    Web,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum NodeRole {
    Gateway,
    Desktop,
    Mobile,
    Browser,
    Remote,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum NodeSurfaceType {
    Terminal,
    Filesystem,
    Browser,
    Computer,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum NodeLifecycle {
    Ready,
    Disconnected,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct NodeCapabilities {
    pub providers: Vec<String>,
    pub surfaces: Vec<NodeSurfaceType>,
    pub tools: Vec<String>,
    pub screen_share: bool,
    pub voice: bool,
    pub preview: bool,
    pub interactive_terminal: bool,
}
#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CapabilityUpdate {
    pub providers: Option<Vec<String>>,
    pub surfaces: Option<Vec<NodeSurfaceType>>,
    pub tools: Option<Vec<String>>,
    pub screen_share: Option<bool>,
    pub voice: Option<bool>,
    pub preview: Option<bool>,
    pub interactive_terminal: Option<bool>,
}
impl CapabilityUpdate {
    fn merge(self, previous: NodeCapabilities) -> NodeCapabilities {
        NodeCapabilities {
            providers: self.providers.unwrap_or(previous.providers),
            surfaces: self.surfaces.unwrap_or(previous.surfaces),
            tools: self.tools.unwrap_or(previous.tools),
            screen_share: self.screen_share.unwrap_or(previous.screen_share),
            voice: self.voice.unwrap_or(previous.voice),
            preview: self.preview.unwrap_or(previous.preview),
            interactive_terminal: self
                .interactive_terminal
                .unwrap_or(previous.interactive_terminal),
        }
    }
}
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertNodeInput {
    pub id: String,
    pub name: String,
    pub platform: NodePlatform,
    pub role: NodeRole,
    pub client_id: String,
    pub is_gateway: Option<bool>,
    pub protocol_version: Option<f64>,
    pub capabilities: Option<CapabilityUpdate>,
}
#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NodeState {
    pub id: String,
    pub name: String,
    pub platform: NodePlatform,
    pub role: NodeRole,
    pub lifecycle: NodeLifecycle,
    pub protocol_version: f64,
    pub capabilities: NodeCapabilities,
    pub connected_at: String,
    pub last_seen_at: String,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeRegistrySnapshot {
    pub version: u32,
    pub server_time: String,
    pub nodes: Vec<NodeState>,
}
struct NodeRecord {
    state: NodeState,
    client_id: String,
    is_gateway: bool,
}
pub struct NodeStateManager<C = fn() -> String> {
    records: HashMap<String, NodeRecord>,
    order: Vec<String>,
    clock: C,
    collator: CollatorBorrowed<'static>,
}
fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}
impl Default for NodeStateManager {
    fn default() -> Self {
        Self::with_clock(now_iso as fn() -> String)
    }
}
impl<C: FnMut() -> String> NodeStateManager<C> {
    /// Compiled root collation matches the reference's en-US default. Supply
    /// a locale-specific collator for gateways configured with another locale.
    pub fn with_clock(clock: C) -> Self {
        Self::with_clock_and_collator(
            clock,
            Collator::try_new(Default::default(), CollatorOptions::default())
                .expect("compiled root collation"),
        )
    }
    pub fn with_clock_and_collator(clock: C, collator: CollatorBorrowed<'static>) -> Self {
        Self {
            records: HashMap::new(),
            order: Vec::new(),
            clock,
            collator,
        }
    }
    pub fn upsert_node(&mut self, input: UpsertNodeInput) -> NodeState {
        let now = (self.clock)();
        let existing = self.records.get(&input.id);
        let state = NodeState {
            id: input.id.clone(),
            name: input.name,
            platform: input.platform,
            role: input.role,
            lifecycle: NodeLifecycle::Ready,
            protocol_version: input
                .protocol_version
                .or_else(|| existing.map(|r| r.state.protocol_version))
                .unwrap_or(f64::from(NODE_PROTOCOL_VERSION)),
            capabilities: input.capabilities.unwrap_or_default().merge(
                existing
                    .map(|r| r.state.capabilities.clone())
                    .unwrap_or_default(),
            ),
            connected_at: existing
                .map(|r| r.state.connected_at.clone())
                .unwrap_or_else(|| now.clone()),
            last_seen_at: now,
        };
        if existing.is_none() {
            self.order.push(input.id.clone());
        }
        self.records.insert(
            input.id,
            NodeRecord {
                state: state.clone(),
                client_id: input.client_id,
                is_gateway: input.is_gateway == Some(true),
            },
        );
        state
    }
    pub fn remove_node(&mut self, id: &str) -> Option<NodeState> {
        let mut record = self.records.remove(id)?;
        self.order.retain(|entry| entry != id);
        record.state.lifecycle = NodeLifecycle::Disconnected;
        record.state.last_seen_at = (self.clock)();
        Some(record.state)
    }
    pub fn remove_nodes_by_client_id(&mut self, client_id: &str) -> Vec<NodeState> {
        let ids: Vec<_> = self
            .order
            .iter()
            .filter(|id| {
                self.records
                    .get(*id)
                    .is_some_and(|r| !r.is_gateway && r.client_id == client_id)
            })
            .cloned()
            .collect();
        ids.iter().filter_map(|id| self.remove_node(id)).collect()
    }
    pub fn get_client_id(&self, id: &str) -> Option<&str> {
        self.records.get(id).map(|r| r.client_id.as_str())
    }
    pub fn get_node(&self, id: &str) -> Option<&NodeState> {
        self.records.get(id).map(|r| &r.state)
    }
    pub fn list_nodes(&self) -> Vec<NodeState> {
        let mut nodes: Vec<_> = self
            .order
            .iter()
            .filter_map(|id| self.get_node(id).cloned())
            .collect();
        nodes.sort_by(|a, b| self.collator.compare(&a.name, &b.name));
        nodes
    }
    pub fn get_snapshot(&mut self) -> NodeRegistrySnapshot {
        NodeRegistrySnapshot {
            version: NODE_PROTOCOL_VERSION,
            server_time: (self.clock)(),
            nodes: self.list_nodes(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{Value, json};
    fn input(id: &str, extra: Value) -> UpsertNodeInput {
        let mut value =
            json!({"id":id,"name":id,"clientId":"client","platform":"linux","role":"remote"});
        value
            .as_object_mut()
            .unwrap()
            .extend(extra.as_object().unwrap().clone());
        serde_json::from_value(value).unwrap()
    }
    #[test]
    fn updates_preserve_connection_and_nullish_fields_but_honor_false_and_empty() {
        let mut counter = 0;
        let mut registry = NodeStateManager::with_clock(|| {
            counter += 1;
            counter.to_string()
        });
        registry.upsert_node(input("node", json!({"protocolVersion":8,"capabilities":{"tools":["x"],"voice":true,"interactiveTerminal":true}})));
        let second=registry.upsert_node(input("node", json!({"protocolVersion":null,"capabilities":{"tools":[],"voice":false,"interactiveTerminal":null}})));
        assert_eq!(second.connected_at, "1");
        assert_eq!(second.last_seen_at, "2");
        assert_eq!(second.protocol_version, 8.0);
        assert_eq!(second.capabilities.tools, Vec::<String>::new());
        assert!(!second.capabilities.voice);
        assert!(second.capabilities.interactive_terminal);
        let zero = registry.upsert_node(input("node", json!({"protocolVersion":0})));
        assert_eq!(zero.protocol_version, 0.0);
        assert_eq!(zero.connected_at, "1");
    }
    #[test]
    fn gateway_protection_is_per_record_and_reset_by_missing_flag() {
        let mut registry = NodeStateManager::with_clock(|| "now".into());
        registry.upsert_node(input("gateway", json!({"isGateway":true})));
        registry.upsert_node(input("node", json!({})));
        registry.upsert_node(input("other", json!({"clientId":"elsewhere"})));
        let removed = registry.remove_nodes_by_client_id("client");
        assert_eq!(
            removed.iter().map(|s| s.id.as_str()).collect::<Vec<_>>(),
            ["node"]
        );
        assert_eq!(removed[0].lifecycle, NodeLifecycle::Disconnected);
        assert!(registry.get_node("gateway").is_some());
        registry.upsert_node(input("gateway", json!({})));
        assert_eq!(registry.remove_nodes_by_client_id("client").len(), 1);
        assert!(registry.get_node("other").is_some());
    }
    #[test]
    fn unicode_sort_and_map_insertion_order_survive_reconnects() {
        let mut registry = NodeStateManager::with_clock(|| "now".into());
        for (id, name) in [("z", "z"), ("one", "é"), ("two", "e\u{301}"), ("a", "a")] {
            registry.upsert_node(input(id, json!({"name":name})));
        }
        registry.upsert_node(input("one", json!({"name":"é"})));
        assert_eq!(
            registry
                .list_nodes()
                .iter()
                .map(|s| s.id.as_str())
                .collect::<Vec<_>>(),
            ["a", "one", "two", "z"]
        );
        registry.remove_node("one");
        registry.upsert_node(input("one", json!({"name":"é"})));
        assert_eq!(
            registry
                .list_nodes()
                .iter()
                .map(|s| s.id.as_str())
                .collect::<Vec<_>>(),
            ["a", "two", "one", "z"]
        );
        assert_eq!(
            registry
                .remove_nodes_by_client_id("client")
                .iter()
                .map(|s| s.id.as_str())
                .collect::<Vec<_>>(),
            ["z", "two", "a", "one"]
        );
    }
    #[test]
    fn no_op_does_not_read_clock_and_returned_snapshots_are_owned() {
        let mut next = 0;
        let mut registry = NodeStateManager::with_clock(|| {
            next += 1;
            next.to_string()
        });
        assert!(registry.remove_node("missing").is_none());
        assert!(registry.remove_nodes_by_client_id("missing").is_empty());
        let original = registry.upsert_node(input("id", json!({})));
        assert_eq!(original.connected_at, "1");
        let removed = registry.remove_node("id").unwrap();
        assert_eq!(removed.last_seen_at, "2");
        assert_eq!(original.lifecycle, NodeLifecycle::Ready);
        let reconnected = registry.upsert_node(input("id", json!({})));
        assert_eq!(reconnected.connected_at, "3");
        let snapshot = registry.get_snapshot();
        assert_eq!(snapshot.server_time, "4");
        assert_eq!(snapshot.version, 1);
        assert_eq!(snapshot.nodes, [reconnected]);
    }
    #[test]
    fn default_clock_returns_millisecond_utc_iso_time() {
        let mut registry = NodeStateManager::default();
        let state = registry.upsert_node(input("node", json!({})));
        assert_eq!(state.last_seen_at.len(), 24);
        assert!(state.last_seen_at.ends_with('Z'));
        assert!(chrono::DateTime::parse_from_rfc3339(&state.last_seen_at).is_ok());
    }
}
