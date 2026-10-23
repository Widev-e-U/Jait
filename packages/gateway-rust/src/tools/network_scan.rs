//! Legacy discovery factory/cache over a closed, explicitly supplied scanner
//! port. The host must authorize targets and bound/cancel discovery; this
//! adapter grants no native network-scanner implementation or activation credit.
use super::{core_io::HostError, list_preview::format_ellipsed_list};
use crate::{
    contracts::bounded_json::Utf16Text,
    db::worker::{DatabaseError, DatabaseWorker, OperationError},
    services::calendar::{js_text, truthy},
};
use futures_util::future::BoxFuture;
use serde_json::{Value, json};
use std::sync::{Arc, Mutex, OnceLock};
#[derive(Clone)]
pub struct ScanData(Arc<Mutex<Value>>);
impl ScanData {
    /// The scanner supplies a typed NetworkScanData record. This is not an
    /// untrusted report parser or permission token.
    pub fn new(value: Value) -> Self {
        Self(Arc::new(Mutex::new(value)))
    }
    pub fn snapshot(&self) -> Value {
        self.0.lock().unwrap_or_else(|e| e.into_inner()).clone()
    }
    pub fn update(&self, update: impl FnOnce(&mut Value)) {
        update(&mut self.0.lock().unwrap_or_else(|e| e.into_inner()));
    }
    pub fn same(&self, other: &Self) -> bool {
        Arc::ptr_eq(&self.0, &other.0)
    }
}
pub trait ScanStore: Send + Sync {
    fn save(&self, data: Value) -> BoxFuture<'static, Result<(), String>>;
}
pub type PersistenceError = Arc<dyn Fn(&str) + Send + Sync>;
struct CacheInner {
    latest: Mutex<Option<ScanData>>,
    store: Mutex<Option<Arc<dyn ScanStore>>>,
    writes: tokio::sync::Mutex<()>,
    on_error: PersistenceError,
}
#[derive(Clone)]
pub struct NetworkScanCache(Arc<CacheInner>);
impl Default for NetworkScanCache {
    fn default() -> Self {
        Self::new(Arc::new(|message| {
            eprintln!("Failed to persist network hosts to DB: {message}")
        }))
    }
}
impl NetworkScanCache {
    pub fn new(on_error: PersistenceError) -> Self {
        Self(Arc::new(CacheInner {
            latest: Mutex::new(None),
            store: Mutex::new(None),
            writes: tokio::sync::Mutex::new(()),
            on_error,
        }))
    }
    pub fn set_store(&self, store: Arc<dyn ScanStore>) {
        *self.0.store.lock().unwrap_or_else(|e| e.into_inner()) = Some(store);
    }
    pub fn latest(&self) -> Option<ScanData> {
        self.0
            .latest
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
    }
    /// The source factory updates memory directly and does not call its public
    /// persistence setter. Keep these paths distinct.
    fn remember(&self, data: ScanData) {
        *self.0.latest.lock().unwrap_or_else(|e| e.into_inner()) = Some(data);
    }
    pub async fn set_latest(&self, data: ScanData) {
        let _admission = self.0.writes.lock().await;
        self.remember(data.clone());
        let store = self
            .0
            .store
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone();
        let snapshot = data.snapshot();
        if let Some(store) = store
            && snapshot["hosts"]
                .as_array()
                .is_some_and(|hosts| !hosts.is_empty())
            && let Err(error) = store.save(snapshot).await
        {
            (self.0.on_error)(&error);
        }
    }
}
#[derive(Clone)]
pub struct SqliteScanStore {
    database: DatabaseWorker,
}
impl SqliteScanStore {
    pub fn new(database: DatabaseWorker) -> Self {
        Self { database }
    }
}
fn field<'a>(value: &'a Value, name: &str) -> Result<&'a str, OperationError> {
    value[name]
        .as_str()
        .ok_or_else(|| std::io::Error::other("Invalid network scan record").into())
}
fn optional(value: &Value, name: &str) -> Result<Option<String>, OperationError> {
    match value.get(name) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::String(v)) => Ok(Some(v.clone())),
        _ => Err(std::io::Error::other("Invalid network host text").into()),
    }
}
fn wire(value: &Value) -> String {
    crate::contracts::ecmascript_json::JsonDocument::parse(&value.to_string())
        .expect("JSON scan value")
        .stringify()
}
impl ScanStore for SqliteScanStore {
    fn save(&self, data: Value) -> BoxFuture<'static, Result<(), String>> {
        let database = self.database.clone();
        Box::pin(async move {
            database.run(move|db|{
  let mut upsert=db.prepare("INSERT INTO network_hosts (ip, mac, hostname, os_version, open_ports, ssh_reachable, agent_status, providers, first_seen_at, last_seen_at, scanned_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(ip) DO UPDATE SET mac = excluded.mac, hostname = excluded.hostname, os_version = COALESCE(excluded.os_version, network_hosts.os_version), open_ports = excluded.open_ports, ssh_reachable = excluded.ssh_reachable, agent_status = excluded.agent_status, providers = excluded.providers, last_seen_at = excluded.last_seen_at, scanned_at = excluded.scanned_at")?;
  let hosts=data["hosts"].as_array().ok_or_else(||std::io::Error::other("Invalid network scan hosts"))?;
  for host in hosts{
   let providers=host.get("providers").filter(|v|v.as_array().is_some_and(|v|!v.is_empty())).map(wire);
   upsert.execute(rusqlite::params![field(host,"ip")?,optional(host,"mac")?,optional(host,"hostname")?,optional(host,"osVersion")?,wire(&host["openPorts"]),i64::from(truthy(&host["sshReachable"])),field(host,"agentStatus")?,providers,field(&data,"scannedAt")?,field(host,"lastSeen")?,field(&data,"scannedAt")?])?;
  }Ok(())
 }).await.map_err(|e|match e{DatabaseError::Operation(e)=>e.to_string(),e=>e.to_string()})
        })
    }
}
pub type Scanner<C> =
    Arc<dyn for<'a> Fn(Value, &'a C) -> BoxFuture<'a, Result<ScanData, HostError>> + Send + Sync>;
pub struct NetworkScanTool<C> {
    pub cache: NetworkScanCache,
    pub scanner: Scanner<C>,
}
pub struct ScanToolResult {
    pub ok: bool,
    pub message: Utf16Text,
    pub data: Option<ScanData>,
}
impl ScanToolResult {
    pub fn snapshot(&self) -> Value {
        let mut value = json!({"ok":self.ok,"message":self.message.0});
        if let Some(data) = &self.data {
            value["data"] = data.snapshot();
        }
        value
    }
}
pub fn metadata() -> &'static Value {
    static META: OnceLock<Value> = OnceLock::new();
    META.get_or_init(|| {
        serde_json::from_str(include_str!("network-scan-metadata.json"))
            .expect("network tool metadata")
    })
}
fn text(value: &Value, name: &str) -> String {
    value.get(name).map(js_text).unwrap_or("undefined".into())
}
impl<C: Send + Sync> NetworkScanTool<C> {
    pub async fn execute(&self, input: &Value, capabilities: &C) -> ScanToolResult {
        let result=async{
   let mut options=json!({"deep":input.get("deep").cloned().unwrap_or(json!(true)),"includeIps":input.get("includeIps").cloned().unwrap_or(json!([]))});if let Some(subnet)=input.get("subnet"){options["subnet"]=subnet.clone();}
   let data=(self.scanner)(options,capabilities).await?;self.cache.remember(data.clone());let record=data.snapshot();
   let hosts=record["hosts"].as_array().filter(|hosts|hosts.iter().all(Value::is_object)).ok_or_else(||HostError::Error("Network scanner returned invalid hosts".into()))?;let gateway_count=hosts.iter().filter(|h|h["agentStatus"]=="running").count();let ssh_count=hosts.iter().filter(|h|truthy(&h["sshReachable"])).count();
   let lines=hosts.iter().take(10).map(|host|{let name=if truthy(&host["hostname"]){format!(" ({})",text(host,"hostname"))}else{String::new()};let tags=if host["agentStatus"]=="running"{" · gateway"}else if truthy(&host["sshReachable"]){" · ssh"}else{""};Utf16Text::from(format!("• {}{name}{tags}",text(host,"ip")))}).collect::<Vec<_>>();
   let mut message=format!("Network scan complete: {} hosts found ({ssh_count} with SSH, {gateway_count} running Jait Gateway)",hosts.len()).encode_utf16().collect::<Vec<_>>();if !lines.is_empty(){message.extend("\nHosts:\n".encode_utf16());message.extend(format_ellipsed_list(&lines,None).0);}
   Ok::<_,HostError>(ScanToolResult{ok:true,message:Utf16Text(message),data:Some(data)})
  }.await;
        match result {
            Ok(value) => value,
            Err(error) => ScanToolResult {
                ok: false,
                message: match error {
                    HostError::Error(message) => message.into(),
                    HostError::Thrown(_) => "Network scan failed".into(),
                },
                data: None,
            },
        }
    }
}
