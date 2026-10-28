//! Network presentation and explicit-scope assessment composition.
//! No interface-derived target expansion, ARP sweep, shell, SSH banner probe or
//! deployment effect is exposed here. Scan admission uses the canonical
//! AssessmentRegistry, including owner/scope/expiry/vantage/rate/cancellation.
//! The runtime supplies a trusted local/control-plane snapshot; this is a read
//! model, not a substitute implementation of platform discovery.
use super::auth::{self, AuthState, response};
use crate::{
    assessments::service::AssessmentRegistry,
    services::{
        calendar::{js_text, truthy},
        network_resources::{Clock as InventoryClock, DockerResourceInventory, DockerRunner},
    },
    time::{Clock, iso},
};
use axum::{
    Router,
    extract::{Request, State},
    http::Method,
    response::Response,
    routing::{get, post},
};
use futures_util::future::BoxFuture;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{
    collections::{BTreeMap, HashSet, VecDeque},
    sync::{Arc, Mutex},
    time::Duration,
};

const MAX_RESULT: usize = 2 * 1024 * 1024;
const MAX_NODES: usize = 4096;
const MAX_OWNER_NODES: usize = 256;
const MAX_RUN_OWNERS: usize = 1024;

#[derive(Clone, Serialize, Deserialize)]
pub struct NetworkInterface {
    pub name: String,
    pub ip: String,
    pub mac: String,
    pub netmask: String,
    pub internal: bool,
}
#[derive(Clone)]
pub struct LocalNetworkSnapshot {
    pub interfaces: Vec<NetworkInterface>,
    /// Includes IPv6, which is omitted from the interfaces UI but excluded from
    /// the host visualization, matching the source's all-address filtering.
    pub local_addresses: Vec<String>,
    pub gateway: Value,
    pub filesystem_nodes: Vec<Value>,
    pub companion_devices: Vec<Value>,
}
/// Runtime-owned native local metadata and connected-device view. The caller
/// supplies the authenticated owner, so a view can enforce device visibility.
pub type LocalNetworkView =
    Arc<dyn Fn(String) -> BoxFuture<'static, Result<LocalNetworkSnapshot, String>> + Send + Sync>;

pub trait NetworkInventory: Send + Sync {
    fn inventory(&self) -> BoxFuture<'_, Result<Value, String>>;
}
/// Reuses the canonical bounded local Docker inventory, including coalescing,
/// TTL, filtered fields and unavailable-state behavior.
impl<R: DockerRunner + 'static, C: InventoryClock + 'static> NetworkInventory
    for DockerResourceInventory<R, C>
{
    fn inventory(&self) -> BoxFuture<'_, Result<Value, String>> {
        Box::pin(async move { serde_json::to_value(self.get().await).map_err(|e| e.to_string()) })
    }
}

#[derive(Default)]
struct NetworkState {
    // Registrations are unverified announcements and are isolated by owner.
    nodes: BTreeMap<(String, String), Value>,
    latest_runs: VecDeque<(String, String)>,
}
#[derive(Clone)]
pub struct NetworkRoutes {
    pub auth: AuthState,
    pub assessments: AssessmentRegistry,
    pub local: LocalNetworkView,
    pub inventory: Arc<dyn NetworkInventory>,
    pub clock: Clock,
    state: Arc<Mutex<NetworkState>>,
}
impl NetworkRoutes {
    pub fn new(
        auth: AuthState,
        assessments: AssessmentRegistry,
        local: LocalNetworkView,
        inventory: Arc<dyn NetworkInventory>,
        clock: Clock,
    ) -> Self {
        Self {
            auth,
            assessments,
            local,
            inventory,
            clock,
            state: Arc::new(Mutex::new(NetworkState::default())),
        }
    }

    pub fn router(self) -> Router {
        Router::new()
            .route("/api/network/interfaces", get(handle))
            .route("/api/network/scan/latest", get(handle))
            .route("/api/network/scan", post(handle))
            .route("/api/network/ssh/enable", post(handle))
            .route("/api/network/nodes", get(handle))
            .route("/api/network/nodes/register", post(handle))
            .route("/api/network/devices", get(handle))
            .route("/api/network/topology", get(handle))
            .with_state(self)
    }

    fn nodes(&self, owner: &str) -> Vec<Value> {
        self.state
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .nodes
            .iter()
            .filter(|((user, _), _)| user == owner)
            .map(|(_, v)| v.clone())
            .collect()
    }

    fn remember_run(&self, owner: &str, id: &str) {
        let mut state = self.state.lock().unwrap_or_else(|e| e.into_inner());
        state.latest_runs.retain(|(user, _)| user != owner);
        state.latest_runs.push_back((owner.into(), id.into()));
        while state.latest_runs.len() > MAX_RUN_OWNERS {
            state.latest_runs.pop_front();
        }
    }

    async fn latest(&self, owner: &str) -> Result<Option<Value>, String> {
        let id = self
            .state
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .latest_runs
            .iter()
            .find(|(user, _)| user == owner)
            .map(|(_, id)| id.clone());
        if let Some(id) = id {
            return self
                .assessments
                .get()
                .await
                .get_run(&id, owner)
                .await
                .map(Some);
        }
        // Persistent assessment history survives route reconstruction/restart.
        let history = self.assessments.get().await.history(owner).await?;
        Ok(history
            .get("runs")
            .and_then(Value::as_array)
            .and_then(|runs| runs.first())
            .cloned())
    }

    fn register_node(&self, owner: &str, body: &Value) -> Result<Value, String> {
        let value = |key: &str, default: &str| {
            body.get(key)
                .filter(|v| !v.is_null())
                .map(js_text)
                .unwrap_or_else(|| default.into())
        };
        let id = value("id", "");
        let ip = value("ip", "");
        if id.is_empty() || ip.is_empty() {
            return Err("id and ip are required".into());
        }
        if id.len() > 256 || ip.len() > 256 || id.chars().chain(ip.chars()).any(char::is_control) {
            return Err("Invalid node id or address".into());
        }
        let capabilities = body
            .get("capabilities")
            .and_then(Value::as_array)
            .map(|v| v.iter().map(js_text).collect::<Vec<_>>())
            .unwrap_or_default();
        if capabilities.len() > 256 {
            return Err("Too many node capabilities".into());
        }
        let node = json!({
            "id":id,"ip":ip,"hostname":body.get("hostname").cloned().unwrap_or(Value::Null),
            "platform":value("platform","unknown"),"version":value("version","unknown"),
            "status":"online","lastSeen":iso((self.clock)()).map_err(|e| e.to_string())?,
            "capabilities":capabilities,
        });
        let mut state = self.state.lock().unwrap_or_else(|e| e.into_inner());
        let key = (owner.into(), id);
        if !state.nodes.contains_key(&key)
            && (state.nodes.len() >= MAX_NODES
                || state.nodes.keys().filter(|(user, _)| user == owner).count() >= MAX_OWNER_NODES)
        {
            return Err("Network node registry capacity reached".into());
        }
        state.nodes.insert(key, node.clone());
        Ok(node)
    }
}

fn bounded(status: u16, value: Value) -> Response {
    if value.to_string().len() > MAX_RESULT {
        return response(503, json!({"error":"Network result exceeds byte limit"}));
    }
    response(status, value)
}
fn no_scan() -> Value {
    json!({"ok":false,"message":"No scan results yet. Trigger a scan or wait for the scheduled job."})
}

/// Derive only confirmed port observations. Unknown MAC/hostname/OS/router and
/// gateway installation are not inferred from absence of a TCP response.
pub fn scan_view(run: &Value) -> Value {
    let mut hosts: BTreeMap<String, Value> = BTreeMap::new();
    if let Some(observations) = run.get("observations").and_then(Value::as_array) {
        for observation in observations {
            let Some(ip) = observation.get("target").and_then(Value::as_str) else {
                continue;
            };
            let Some(port) = observation
                .get("port")
                .and_then(Value::as_u64)
                .filter(|p| (1..=65535).contains(p))
            else {
                continue;
            };
            let host = hosts.entry(ip.into()).or_insert_with(|| {
                json!({
                    "ip":ip,"mac":null,"hostname":null,"vendor":null,"isRouter":false,
                    "alive":null,"openPorts":[],"sshReachable":false,"agentStatus":"unknown",
                    "osVersion":null,"providers":[],"lastSeen":observation.get("observedAt"),
                    "evidenceIds":[],
                })
            });
            let state = observation.get("state").and_then(Value::as_str);
            if state == Some("open") {
                let ports = host["openPorts"].as_array_mut().expect("created array");
                if !ports.contains(&json!(port)) {
                    ports.push(json!(port));
                }
                if port == 22 {
                    host["sshReachable"] = json!(true);
                }
            }
            if matches!(state, Some("open" | "refused")) {
                host["alive"] = json!(true);
            }
            host["lastSeen"] = observation
                .get("observedAt")
                .cloned()
                .unwrap_or(Value::Null);
            if let Some(id) = observation.get("evidenceId") {
                host["evidenceIds"]
                    .as_array_mut()
                    .expect("created array")
                    .push(id.clone());
            }
        }
    }
    json!({
        "subnet":"","hosts":hosts.into_values().collect::<Vec<_>>(),"routerIp":null,
        "scannedAt":run.get("startedAt"),"durationMs":null,
        "assessment":run,
        "coverageGaps":["Scoped TCP observations only; ARP, reverse DNS, SSH banners, OS detection, gateway status and provider discovery were not performed."],
    })
}

fn topology(
    snapshot: LocalNetworkSnapshot,
    inventory: Value,
    scan: Option<Value>,
    nodes: Vec<Value>,
) -> Value {
    let mut excluded: HashSet<String> = snapshot.local_addresses.into_iter().collect();
    excluded.extend(snapshot.interfaces.iter().map(|v| v.ip.clone()));
    let resources = inventory
        .get("resources")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    for resource in &resources {
        if let Some(addresses) = resource.get("addresses").and_then(Value::as_array) {
            excluded.extend(addresses.iter().filter_map(Value::as_str).map(String::from));
        }
    }
    let router_ip = scan
        .as_ref()
        .and_then(|s| s.get("routerIp"))
        .cloned()
        .unwrap_or(Value::Null);
    let hosts = scan.as_ref().and_then(|s| s.get("hosts")).and_then(Value::as_array).into_iter().flatten().filter_map(|host| {
        let ip = host.get("ip")?.as_str()?;
        if excluded.contains(ip) { return None; }
        let router = truthy(&host["isRouter"]) || router_ip.as_str() == Some(ip);
        Some(json!({
            "id":format!("host-{ip}"),"type":"host","name":host.get("hostname").filter(|v| !v.is_null()).cloned().unwrap_or_else(|| json!(if router { "Router" } else { ip })),
            "ip":ip,"mac":host.get("mac"),"isRouter":router,"openPorts":host.get("openPorts"),
            "sshReachable":host.get("sshReachable"),"agentStatus":host.get("agentStatus"),
            "osVersion":host.get("osVersion"),"providers":host.get("providers").cloned().unwrap_or(json!([])),
            "online":host.get("alive"),
        }))
    }).collect::<Vec<_>>();
    let devices = snapshot.filesystem_nodes.into_iter().filter(|v| !truthy(&v["isGateway"])).map(|v| {
        let mut result = json!({"id":format!("device-{}",v.get("id").map(js_text).unwrap_or_default()),"type":"device","online":true,"providers":v.get("providers").cloned().unwrap_or(json!([]))});
        for key in ["name","platform","registeredAt"] {
            if let Some(value) = v.get(key) { result[key] = value.clone(); }
        }
        result
    }).collect::<Vec<_>>();
    let mesh = nodes.into_iter().map(|v| json!({
        "id":format!("mesh-{}",v["id"].as_str().unwrap_or("")),"type":"mesh",
        "name":v.get("hostname").filter(|v|!v.is_null()).cloned().unwrap_or_else(||v["ip"].clone()),
        "ip":v["ip"],"platform":v["platform"],"version":v["version"],"status":v["status"],
        "online":v["status"]=="online",
    })).collect::<Vec<_>>();
    json!({
        "gateway":snapshot.gateway,"devices":devices,"hosts":hosts,"meshNodes":mesh,
        "resources":resources,"inventory":{"status":inventory.get("status"),"truncated":inventory.get("truncated").cloned().unwrap_or(json!(false))},
        "routerIp":router_ip,"scannedAt":scan.as_ref().and_then(|s|s.get("scannedAt")),
    })
}

fn guidance(platform: &str) -> Value {
    let key = platform.trim().to_lowercase();
    let instructions = match key.as_str() {
        "windows" => json!({
            "command":"Add-WindowsCapability -Online -Name OpenSSH.Server; Start-Service sshd; Set-Service -Name sshd -StartupType Automatic",
            "steps":["Open PowerShell as Administrator on the target machine","Run: Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0","Run: Start-Service sshd","Run: Set-Service -Name sshd -StartupType Automatic","Run: New-NetFirewallRule -Name \"OpenSSH-Server\" -DisplayName \"OpenSSH Server\" -Enabled True -Direction Inbound -Protocol TCP -Action Allow -LocalPort 22"]
        }),
        "macos" => {
            json!({"command":"sudo systemsetup -setremotelogin on","steps":["Open System Preferences → Sharing → enable Remote Login","Or run: sudo systemsetup -setremotelogin on"]})
        }
        _ => {
            json!({"command":"sudo apt-get install -y openssh-server && sudo systemctl enable --now sshd","steps":["Run: sudo apt-get install -y openssh-server","Run: sudo systemctl enable --now sshd","Run: sudo ufw allow 22/tcp (if UFW is active)"]})
        }
    };
    let mut result = instructions;
    result["platform"] = json!(if key.is_empty() { "linux" } else { &key });
    result
}

async fn handle(State(state): State<NetworkRoutes>, request: Request) -> Response {
    let headers = request.headers().clone();
    let user = match auth::require_user(&state.auth, &headers).await {
        Ok(user) => user,
        Err(error) => return *error,
    };
    let method = request.method().clone();
    let path = request.uri().path().to_string();
    let body = match auth::parse_body(request.into_body(), &headers).await {
        Ok(body) => body,
        Err(error) => return *error,
    };
    if body.to_string().len() > 65_536 {
        return response(413, json!({"error":"Network request exceeds byte limit"}));
    }
    let work = async {
        match (method, path.as_str()) {
            (Method::POST, "/api/network/scan") => {
                // The legacy subnet/deep/includeIps contract cannot assert scope.
                if !body
                    .as_object()
                    .is_some_and(|o| o.len() == 1 && o.contains_key("scopeId"))
                {
                    return response(
                        400,
                        json!({"error":"An existing explicitly authorized scopeId is required; subnet discovery is not authorized by this route"}),
                    );
                }
                let Some(scope_id) = body["scopeId"]
                    .as_str()
                    .filter(|s| !s.is_empty() && s.len() <= 256)
                else {
                    return response(400, json!({"error":"scopeId required"}));
                };
                match state
                    .assessments
                    .get()
                    .await
                    .start(scope_id, &user.id, "gateway", None)
                    .await
                {
                    Ok(run) => {
                        if let Some(id) = run["id"].as_str() {
                            state.remember_run(&user.id, id);
                        }
                        bounded(202, run)
                    }
                    Err(error) => response(400, json!({"error":error})),
                }
            }
            (Method::GET, "/api/network/scan/latest") => match state.latest(&user.id).await {
                Ok(Some(run)) => bounded(200, scan_view(&run)),
                Ok(None) => response(200, no_scan()),
                Err(error) => response(500, json!({"error":error})),
            },
            (Method::POST, "/api/network/ssh/enable") => bounded(
                200,
                guidance(&body.get("platform").map(js_text).unwrap_or_default()),
            ),
            (Method::POST, "/api/network/nodes/register") => {
                match state.register_node(&user.id, &body) {
                    Ok(node) => bounded(200, json!({"ok":true,"node":node})),
                    Err(error) => response(400, json!({"error":error})),
                }
            }
            (Method::GET, "/api/network/nodes") => {
                bounded(200, json!({"nodes":state.nodes(&user.id)}))
            }
            (
                Method::GET,
                "/api/network/interfaces" | "/api/network/devices" | "/api/network/topology",
            ) => {
                let snapshot = match (state.local)(user.id.clone()).await {
                    Ok(value) => value,
                    Err(error) => return response(503, json!({"error":error})),
                };
                if snapshot.interfaces.len() > 1024
                    || snapshot.local_addresses.len() > 4096
                    || snapshot.filesystem_nodes.len() > 4096
                    || snapshot.companion_devices.len() > 4096
                {
                    return response(
                        503,
                        json!({"error":"Local network snapshot exceeds item limit"}),
                    );
                }
                if path.ends_with("/interfaces") {
                    return bounded(200, json!({"interfaces":snapshot.interfaces}));
                }
                if path.ends_with("/devices") {
                    return bounded(200, json!({"devices":snapshot.companion_devices}));
                }
                let inventory = match state.inventory.inventory().await {
                    Ok(value) => value,
                    Err(error) => return response(503, json!({"error":error})),
                };
                let scan = match state.latest(&user.id).await {
                    Ok(run) => run.as_ref().map(scan_view),
                    Err(error) => return response(500, json!({"error":error})),
                };
                bounded(
                    200,
                    topology(snapshot, inventory, scan, state.nodes(&user.id)),
                )
            }
            _ => response(404, json!({"error":"Not Found"})),
        }
    };
    match tokio::time::timeout(Duration::from_secs(10), work).await {
        Ok(result) => result,
        Err(_) => response(503, json!({"error":"Network route timed out"})),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn snapshot() -> LocalNetworkSnapshot {
        LocalNetworkSnapshot {
            interfaces: vec![],
            local_addresses: vec!["192.0.2.1".into()],
            gateway: json!({"id":"gateway"}),
            filesystem_nodes: vec![
                json!({"id":"gateway","isGateway":true}),
                json!({"id":"laptop","name":"Laptop","platform":"linux"}),
            ],
            companion_devices: vec![json!({"id":"phone"})],
        }
    }

    #[test]
    fn observations_keep_unknowns_and_deterministic_evidence() {
        let scan = scan_view(&json!({"startedAt":"2026-10-26","observations":[
            {"target":"192.0.2.2","port":22,"state":"open","evidenceId":"e1","observedAt":"t1"},
            {"target":"192.0.2.2","port":80,"state":"timeout","evidenceId":"e2","observedAt":"t2"},
            {"target":"192.0.2.3","port":22,"state":"error","evidenceId":"e3","observedAt":"t3"}
        ]}));
        assert_eq!(scan["hosts"][0]["openPorts"], json!([22]));
        assert_eq!(scan["hosts"][0]["sshReachable"], true);
        assert_eq!(scan["hosts"][0]["agentStatus"], "unknown");
        assert_eq!(scan["hosts"][0]["evidenceIds"], json!(["e1", "e2"]));
        assert_eq!(scan["hosts"][1]["alive"], Value::Null);
        assert!(scan["assessment"]["observations"].is_array());
    }

    #[test]
    fn topology_excludes_local_and_container_ips_and_keeps_devices() {
        let result = topology(
            snapshot(),
            json!({"status":"ok","resources":[{"addresses":["192.0.2.5"]}]}),
            Some(json!({"hosts":[
            {"ip":"192.0.2.1"},{"ip":"192.0.2.5"},{"ip":"192.0.2.8","hostname":"Router","isRouter":true,"alive":true}
        ],"routerIp":"192.0.2.8","scannedAt":"t"})),
            vec![],
        );
        assert_eq!(result["hosts"].as_array().unwrap().len(), 1);
        assert_eq!(result["hosts"][0]["isRouter"], true);
        assert_eq!(result["devices"][0]["id"], "device-laptop");
        assert_eq!(result["inventory"]["truncated"], false);
    }

    #[test]
    fn ssh_enable_is_instruction_data_only() {
        assert_eq!(guidance(" WINDOWS ")["platform"], "windows");
        assert_eq!(
            guidance("macos")["command"],
            "sudo systemsetup -setremotelogin on"
        );
        assert_eq!(guidance("")["platform"], "linux");
        assert!(
            guidance("other")["command"]
                .as_str()
                .unwrap()
                .contains("apt-get")
        );
    }
}
