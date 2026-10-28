//! Native plugin discovery and durable lifecycle. One owner serializes mutations.
//! Executable modules and atomic registry admission are explicit host capabilities;
//! discovering a manifest never authorizes code, tools, channels, or network access.
use super::{contracts::*, manifest::validate_manifest, openclaw_adapter};
use crate::db::worker::DatabaseWorker;
use futures_util::future::BoxFuture;
use rusqlite::params;
use serde_json::{Map, Value};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs::File,
    io::{self, Read},
    path::{Component, Path, PathBuf},
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    time::{Duration, Instant},
};

pub type Result<T> = std::result::Result<T, PluginError>;
fn error(message: impl Into<String>) -> PluginError {
    PluginError::Error(message.into())
}
#[derive(Clone)]
pub struct Operation {
    pub cancelled: Arc<AtomicBool>,
    pub deadline: Instant,
}
impl Operation {
    pub fn new(duration: Duration) -> Self {
        Self {
            cancelled: Arc::new(AtomicBool::new(false)),
            deadline: Instant::now() + duration,
        }
    }
    pub fn check(&self) -> Result<()> {
        if self.cancelled.load(Ordering::Acquire) {
            return Err(error("Plugin operation cancelled"));
        }
        if Instant::now() >= self.deadline {
            return Err(error("Plugin operation deadline exceeded"));
        }
        Ok(())
    }
    pub async fn run<T>(&self, future: impl std::future::Future<Output = Result<T>>) -> Result<T> {
        self.check()?;
        tokio::pin!(future);
        loop {
            tokio::select! {
                biased;
                _ = tokio::time::sleep(Duration::from_millis(10)) => self.check()?,
                result = &mut future => return result,
            }
        }
    }
}
#[derive(Clone)]
pub struct Limits {
    pub entries: usize,
    pub manifest_bytes: usize,
    pub config_bytes: usize,
    pub contributions: usize,
}
impl Default for Limits {
    fn default() -> Self {
        Self {
            entries: 2048,
            manifest_bytes: 262144,
            config_bytes: 262144,
            contributions: 256,
        }
    }
}
#[derive(Clone, Debug)]
pub struct DiscoveredPlugin {
    pub manifest: Value,
    pub directory: PathBuf,
    pub openclaw: bool,
    directory_handle: Arc<File>,
}
impl DiscoveredPlugin {
    pub fn id(&self) -> &str {
        self.manifest["id"].as_str().expect("validated discovery")
    }
    /// Relative entry resolution rejects traversal and every symlink component.
    /// The loader receives an open file, not a path it must re-open unsafely.
    pub fn entry(&self) -> Result<File> {
        let main = self.manifest["main"].as_str().unwrap_or("index.js");
        if self.openclaw {
            for candidate in ["index.ts", "index.js", "index.mjs"] {
                match relative_open(&self.directory_handle, Path::new(candidate), false) {
                    Ok(file) => return Ok(file),
                    Err(e) if e.kind() == io::ErrorKind::NotFound => (),
                    Err(e) => return Err(error(e.to_string())),
                }
            }
            return Err(error("OpenClaw entry not found"));
        }
        let relative = Path::new(main);
        if relative.as_os_str().is_empty()
            || relative
                .components()
                .any(|c| !matches!(c, Component::Normal(_)))
        {
            return Err(error("Plugin entry must be a confined relative path"));
        }
        relative_open(&self.directory_handle, relative, false).map_err(|e| error(e.to_string()))
    }
}
/// Linux directory-handle walking avoids check/open races, ancestor symlinks and
/// FIFO/device hangs. Unsupported platforms fail closed pending native adapters.
#[cfg(target_os = "linux")]
fn confined_open(path: &Path, directory: bool) -> io::Result<File> {
    if !path.is_absolute() {
        return Err(io::Error::other("Plugin roots must be absolute"));
    }
    relative_open(
        &File::open("/")?,
        path.strip_prefix("/").map_err(io::Error::other)?,
        directory,
    )
}
#[cfg(target_os = "linux")]
fn relative_open(parent: &File, path: &Path, directory: bool) -> io::Result<File> {
    use std::{
        ffi::CString,
        os::{
            fd::{AsRawFd, FromRawFd},
            unix::ffi::OsStrExt,
        },
    };
    let mut current = parent.try_clone()?;
    let components: Vec<_> = path.components().collect();
    if components.len() > 64 {
        return Err(io::Error::other("Plugin path depth exceeded"));
    }
    for (index, part) in components.iter().enumerate() {
        let Component::Normal(name) = part else {
            return Err(io::Error::other("Invalid plugin path component"));
        };
        let name = CString::new(name.as_bytes()).map_err(io::Error::other)?;
        let is_dir = index + 1 < components.len() || directory;
        let flags = libc::O_RDONLY
            | libc::O_CLOEXEC
            | libc::O_NOFOLLOW
            | libc::O_NONBLOCK
            | if is_dir { libc::O_DIRECTORY } else { 0 };
        // SAFETY: owned directory fd and NUL-terminated name; transfer exactly once.
        let fd = unsafe { libc::openat(current.as_raw_fd(), name.as_ptr(), flags) };
        if fd < 0 {
            return Err(io::Error::last_os_error());
        }
        current = unsafe { File::from_raw_fd(fd) };
    }
    let metadata = current.metadata()?;
    if (directory && !metadata.is_dir()) || (!directory && !metadata.is_file()) {
        return Err(io::Error::other("Plugin path has wrong file type"));
    }
    Ok(current)
}
#[cfg(not(target_os = "linux"))]
fn confined_open(_: &Path, _: bool) -> io::Result<File> {
    Err(io::Error::other(
        "Confined plugin filesystem adapter unavailable on this platform",
    ))
}

#[cfg(not(target_os = "linux"))]
fn relative_open(_: &File, _: &Path, _: bool) -> io::Result<File> {
    Err(io::Error::other(
        "Confined plugin filesystem adapter unavailable",
    ))
}

/// Synchronous work; prefer discover_admitted from async runtime callers.
/// First root scans native + OpenClaw; additional roots scan OpenClaw only.
/// Malformed manifests are skipped; bounds/cancel fail the entire discovery.
pub fn discover(
    roots: &[PathBuf],
    limits: &Limits,
    op: &Operation,
) -> Result<Vec<DiscoveredPlugin>> {
    op.check()?;
    if limits.entries > 4096 || limits.manifest_bytes > 1048576 {
        return Err(error("Plugin discovery limits exceed hard ceiling"));
    }
    let mut found = BTreeMap::new();
    let mut native = BTreeSet::new();
    let mut scanned = 0usize;
    let mut manifest_bytes_total = 0usize;
    for (root_index, root) in roots.iter().enumerate() {
        op.check()?;
        let handle = match confined_open(root, true) {
            Ok(h) => h,
            Err(e) if e.kind() == io::ErrorKind::NotFound => continue,
            Err(e) => return Err(error(e.to_string())),
        };
        #[cfg(target_os = "linux")]
        let entries = {
            use std::os::fd::AsRawFd;
            std::fs::read_dir(format!("/proc/self/fd/{}", handle.as_raw_fd()))
        };
        #[cfg(not(target_os = "linux"))]
        let entries = std::fs::read_dir(root);
        for entry in entries.map_err(|e| error(e.to_string()))? {
            op.check()?;
            scanned += 1;
            if scanned > limits.entries {
                return Err(error("Plugin discovery entry limit exceeded"));
            }
            let entry = entry.map_err(|e| error(e.to_string()))?;
            // Read via the retained parent handle, including manifest traversal.
            let directory = root.join(entry.file_name());
            let directory_handle = match relative_open(&handle, Path::new(&entry.file_name()), true)
            {
                Ok(file) => Arc::new(file),
                Err(_) => continue,
            };
            for (filename, oc) in [("jait.plugin.json", false), ("openclaw.plugin.json", true)] {
                op.check()?;
                if root_index > 0 && !oc {
                    continue;
                }
                let mut file = match relative_open(&directory_handle, Path::new(filename), false) {
                    Ok(f) => f,
                    Err(_) => continue,
                };
                let mut bytes = Vec::new();
                file.by_ref()
                    .take(limits.manifest_bytes as u64 + 1)
                    .read_to_end(&mut bytes)
                    .map_err(|e| error(e.to_string()))?;
                op.check()?;
                manifest_bytes_total = manifest_bytes_total.saturating_add(bytes.len());
                if manifest_bytes_total > 16 * 1048576 {
                    return Err(error("Plugin aggregate manifest byte limit exceeded"));
                }
                if bytes.len() > limits.manifest_bytes {
                    return Err(error("Plugin manifest byte limit exceeded"));
                }
                let Ok(raw) = serde_json::from_slice::<Value>(&bytes) else {
                    continue;
                };
                let manifest = if oc {
                    match openclaw_adapter::to_jait_manifest(&raw) {
                        Ok(m) => m,
                        Err(_) => continue,
                    }
                } else {
                    if validate_manifest(&raw).is_some() {
                        continue;
                    }
                    raw
                };
                let id = manifest["id"]
                    .as_str()
                    .expect("validated manifest")
                    .to_owned();
                if !oc {
                    native.insert(id.clone());
                }
                if found
                    .get(&id)
                    .is_some_and(|existing: &DiscoveredPlugin| existing.directory != directory)
                {
                    return Err(error("Duplicate plugin identity on scan path"));
                }
                found.entry(id).or_insert(DiscoveredPlugin {
                    manifest,
                    directory: directory.clone(),
                    openclaw: oc,
                    directory_handle: directory_handle.clone(),
                });
            }
        }
    }
    found.retain(|id, plugin| {
        !plugin.openclaw || !native.contains(id.strip_prefix("openclaw:").unwrap_or(id))
    });
    Ok(found.into_values().collect())
}
/// A managed blocking job, with a private cancellation flag on drop. Its shared
/// lane permit stays held until the filesystem loop observes stop/deadline.
pub async fn discover_admitted(
    lane: &crate::runtime::blocking::BlockingLane,
    roots: Vec<PathBuf>,
    limits: Limits,
    op: &Operation,
) -> Result<Vec<DiscoveredPlugin>> {
    struct StopOnDrop(Arc<AtomicBool>);
    impl Drop for StopOnDrop {
        fn drop(&mut self) {
            self.0.store(true, Ordering::Release);
        }
    }
    op.check()?;
    let work = Operation {
        cancelled: Arc::new(AtomicBool::new(false)),
        deadline: op.deadline,
    };
    let _guard = StopOnDrop(work.cancelled.clone());
    op.run(async {
        lane.run(move || discover(&roots, &limits, &work))
            .await
            .map_err(|e| error(e.to_string()))?
    })
    .await
}

/// Uses the existing bounded database worker; never opens live state or creates a
/// second pool. The shared migration owns the plugins table.
#[derive(Clone)]
pub struct PluginStore {
    pub database: DatabaseWorker,
}
impl PluginStore {
    pub async fn list(&self) -> Result<Vec<InstalledPlugin>> {
        self.database.run(|db| {
            let mut statement = db.prepare("SELECT id,display_name,version,description,author,path,status,CASE WHEN length(CAST(config AS BLOB)) <= 262144 THEN config ELSE NULL END,error,installed_at,updated_at FROM plugins ORDER BY display_name")?;
            let rows = statement.query_map([], |row| {
                let status: String = row.get(6)?;
                let config: String = row.get(7)?;
                Ok(InstalledPlugin { id: row.get(0)?, display_name: row.get(1)?, version: row.get(2)?, description: row.get(3)?, author: row.get(4)?, path: row.get(5)?, status: match status.as_str() { "enabled" => PluginStatus::Enabled, "disabled" => PluginStatus::Disabled, "error" => PluginStatus::Error, _ => PluginStatus::Installed }, config: serde_json::from_str(&config).map_err(|e|rusqlite::Error::FromSqlConversionFailure(7,rusqlite::types::Type::Text,Box::new(e)))?, error: row.get(8)?, installed_at: row.get(9)?, updated_at: row.get(10)? })
            })?;
            // Bound corrupt/untrusted database growth before accumulating rows.
            let mut output = Vec::new();
            for row in rows { if output.len() >= 4096 { return Err(io::Error::other("Plugin row limit exceeded").into()); } output.push(row?); }
            Ok(output)
        }).await.map_err(|e| error(e.to_string()))
    }
    pub async fn get(&self, id: &str) -> Result<Option<InstalledPlugin>> {
        Ok(self.list().await?.into_iter().find(|p| p.id == id))
    }
    pub async fn put(&self, p: InstalledPlugin) -> Result<()> {
        self.database.run(move |db| {
            let status = match p.status { PluginStatus::Installed => "installed", PluginStatus::Enabled => "enabled", PluginStatus::Disabled => "disabled", PluginStatus::Error => "error" };
            db.execute("INSERT INTO plugins (id,display_name,version,description,author,path,status,config,error,installed_at,updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11) ON CONFLICT(id) DO UPDATE SET display_name=excluded.display_name,version=excluded.version,description=excluded.description,author=excluded.author,path=excluded.path,status=excluded.status,config=excluded.config,error=excluded.error,updated_at=excluded.updated_at", params![p.id,p.display_name,p.version,p.description,p.author,p.path,status,serde_json::to_string(&p.config)?,p.error,p.installed_at,p.updated_at])?;
            Ok(())
        }).await.map_err(|e| error(e.to_string()))
    }
    async fn set_status(
        &self,
        id: &str,
        status: PluginStatus,
        message: Option<String>,
    ) -> Result<()> {
        let id = id.to_owned();
        let status = match status {
            PluginStatus::Installed => "installed",
            PluginStatus::Enabled => "enabled",
            PluginStatus::Disabled => "disabled",
            PluginStatus::Error => "error",
        };
        self.database
            .run(move |db| {
                if db.execute(
                    "UPDATE plugins SET status=?,error=?,updated_at=? WHERE id=?",
                    params![status, message, now(), id],
                )? == 0
                {
                    return Err(io::Error::other("Plugin not found").into());
                }
                Ok(())
            })
            .await
            .map_err(|e| error(e.to_string()))
    }
    pub async fn remove(&self, id: &str) -> Result<()> {
        let id = id.to_owned();
        self.database
            .run(move |db| {
                db.execute("DELETE FROM plugins WHERE id=?", [id])?;
                Ok(())
            })
            .await
            .map_err(|e| error(e.to_string()))
    }
    pub async fn set_config(
        &self,
        id: &str,
        config: Map<String, Value>,
        max_bytes: usize,
    ) -> Result<()> {
        let encoded = String::from_utf8(openclaw_adapter::bounded_json(
            &Value::Object(config),
            false,
            max_bytes.min(262144),
        )?)
        .map_err(|e| error(e.to_string()))?;
        let id = id.to_owned();
        self.database
            .run(move |db| {
                if db.execute(
                    "UPDATE plugins SET config=?,updated_at=? WHERE id=?",
                    params![encoded, now(), id],
                )? == 0
                {
                    return Err(io::Error::other("Plugin not found").into());
                }
                Ok(())
            })
            .await
            .map_err(|e| error(e.to_string()))
    }
}
fn now() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

/// Host must check existing consent/scope for *each* activation (also startup),
/// then load an explicitly supported native/external module from this file handle.
/// No shell, JS sidecar, fallback import, or implicit trust from private paths.
pub trait PluginHost<C, H>: Send + Sync {
    fn authorize<'a>(
        &'a self,
        plugin: &'a DiscoveredPlugin,
        entry: &'a File,
        op: &'a Operation,
    ) -> BoxFuture<'a, Result<()>>;
    /// Must be cancellation-safe, bound file reads, and pin approved content
    /// before interpretation. Never re-open the supplied display path.
    fn load<'a>(
        &'a self,
        plugin: &'a DiscoveredPlugin,
        entry: File,
        op: &'a Operation,
    ) -> BoxFuture<'a, Result<PluginModule<C, H>>>;
    /// All-or-nothing admission; preserve tool provenance, permissions and channel
    /// ownership. A failure must expose no tools/channels. No effects on collision.
    fn register(
        &self,
        plugin: &PluginDescriptor,
        contribution: &PluginContribution<C, H>,
    ) -> Result<()>;
    /// Idempotently revoke dispatch first, then stop *only* this owner's channels.
    /// Must complete/reap effects before returning, including on cancellation.
    fn unregister<'a>(&'a self, id: &'a str) -> BoxFuture<'a, Result<()>>;
}
struct Context {
    store: PluginStore,
    id: String,
    version: String,
    root: String,
    config: std::sync::RwLock<Map<String, Value>>,
    config_write: tokio::sync::Mutex<()>,
    max_bytes: usize,
    log: Arc<dyn PluginLog>,
}
impl PluginContext for Context {
    fn gateway_version(&self) -> &str {
        &self.version
    }
    fn project_root(&self) -> &str {
        &self.root
    }
    fn get_config(&self) -> Result<Value> {
        Ok(Value::Object(
            self.config
                .read()
                .map_err(|_| error("Plugin config lock poisoned"))?
                .clone(),
        ))
    }
    fn set_config(&self, value: Map<String, Value>) -> BoxFuture<'_, Result<()>> {
        Box::pin(async move {
            let _guard = self.config_write.lock().await;
            self.store
                .set_config(&self.id, value.clone(), self.max_bytes)
                .await?;
            *self
                .config
                .write()
                .map_err(|_| error("Plugin config lock poisoned"))? = value;
            Ok(())
        })
    }
    fn log(&self) -> &dyn PluginLog {
        self.log.as_ref()
    }
}
struct Active<C, H> {
    cleanup_pending: bool,
    module: PluginModule<C, H>,
    context: Arc<Context>,
}
pub struct PluginManager<C, H> {
    pub store: PluginStore,
    host: Arc<dyn PluginHost<C, H>>,
    log: Arc<dyn PluginLog>,
    gateway_version: String,
    project_root: String,
    limits: Limits,
    discovered: BTreeMap<String, DiscoveredPlugin>,
    active: BTreeMap<String, Active<C, H>>,
}
impl<C: Send + Sync + 'static, H: Send + Sync + 'static> PluginManager<C, H> {
    pub fn new(
        store: PluginStore,
        host: Arc<dyn PluginHost<C, H>>,
        log: Arc<dyn PluginLog>,
        gateway_version: String,
        project_root: String,
        limits: Limits,
    ) -> Self {
        Self {
            store,
            host,
            log,
            gateway_version,
            project_root,
            limits,
            discovered: BTreeMap::new(),
            active: BTreeMap::new(),
        }
    }
    pub fn loaded_count(&self) -> usize {
        self.active.len()
    }
    /// Discovery is supplied from the admitted blocking lane. No automatic retries.
    pub async fn sync_and_load(
        &mut self,
        discovered: Vec<DiscoveredPlugin>,
        op: &Operation,
    ) -> Result<()> {
        if discovered.len() > self.limits.entries {
            return Err(error("Plugin discovery entry limit exceeded"));
        }
        let mut next = BTreeMap::new();
        for plugin in discovered {
            op.check()?;
            if next.insert(plugin.id().to_owned(), plugin).is_some() {
                return Err(error("Duplicate plugin identity"));
            }
        }
        self.discovered = next;
        let plugins: Vec<_> = self.discovered.values().cloned().collect();
        for plugin in plugins {
            op.check()?;
            let mut row = self
                .store
                .get(plugin.id())
                .await?
                .unwrap_or_else(|| InstalledPlugin {
                    id: plugin.id().into(),
                    display_name: String::new(),
                    version: String::new(),
                    description: None,
                    author: None,
                    path: String::new(),
                    status: PluginStatus::Installed,
                    config: Map::new(),
                    error: None,
                    installed_at: now(),
                    updated_at: now(),
                });
            row.display_name = plugin.manifest["displayName"]
                .as_str()
                .unwrap_or(plugin.id())
                .into();
            row.version = plugin.manifest["version"]
                .as_str()
                .unwrap_or("0.0.0")
                .into();
            row.description = plugin.manifest["description"].as_str().map(str::to_owned);
            row.author = plugin.manifest["author"].as_str().map(str::to_owned);
            row.path = plugin.directory.to_string_lossy().into_owned();
            row.updated_at = now();
            let enabled = row.status == PluginStatus::Enabled;
            op.run(self.store.put(row)).await?;
            if enabled
                && !self.active.contains_key(plugin.id())
                && self.enable(plugin.id(), op).await.is_err()
            {
                op.check()?;
                self.log
                    .warn("Plugin activation failed; see persisted plugin status", &[]);
            }
        }
        Ok(())
    }
    pub async fn enable(&mut self, id: &str, op: &Operation) -> Result<InstalledPlugin> {
        op.check()?;
        let mut row = op
            .run(self.store.get(id))
            .await?
            .ok_or_else(|| error(format!("Plugin '{id}' not found")))?;
        if self.active.contains_key(id) {
            return if row.status == PluginStatus::Enabled && !self.active[id].cleanup_pending {
                Ok(row)
            } else {
                Err(error("Plugin cleanup pending; disable before re-enabling"))
            };
        }
        let result = self.activate(id, &row, op).await;
        row.updated_at = now();
        match result {
            Ok(()) => {
                row.status = PluginStatus::Enabled;
                row.error = None;
                if let Err(e) = self.store.set_status(id, row.status, None).await {
                    self.unload(id).await?;
                    return Err(e);
                }
            }
            Err(e) => {
                row.status = PluginStatus::Error;
                row.error = Some(format_error(&e));
                self.store
                    .set_status(id, row.status, row.error.clone())
                    .await?;
                return Err(e);
            }
        }
        self.store
            .get(id)
            .await?
            .ok_or_else(|| error("Plugin disappeared after activation"))
    }
    async fn activate(&mut self, id: &str, row: &InstalledPlugin, op: &Operation) -> Result<()> {
        let plugin = self
            .discovered
            .get(id)
            .ok_or_else(|| error(format!("Plugin '{id}' is not on this gateway's scan path")))?;
        let entry = plugin.entry()?;
        if entry.metadata().map_err(|e| error(e.to_string()))?.len() > 4 * 1024 * 1024 {
            return Err(error("Plugin entry byte limit exceeded"));
        }
        op.run(self.host.authorize(plugin, &entry, op)).await?;
        let module = op.run(self.host.load(plugin, entry, op)).await?;
        let context = Arc::new(Context {
            store: self.store.clone(),
            id: id.into(),
            version: self.gateway_version.clone(),
            root: self.project_root.clone(),
            config: std::sync::RwLock::new(row.config.clone()),
            config_write: tokio::sync::Mutex::new(()),
            max_bytes: self.limits.config_bytes,
            log: self.log.clone(),
        });
        self.active.insert(
            id.into(),
            Active {
                cleanup_pending: true,
                module,
                context: context.clone(),
            },
        );
        if self.active[id].module.id != id {
            self.unload(id).await?;
            return Err(error("Plugin executable identity does not match manifest"));
        }
        let setup = op
            .run((self.active[id].module.setup)(context.clone()))
            .await;
        let registration = match setup {
            Ok(contribution) => op.check().and_then(|_| {
                if let Some(contribution) = contribution {
                    if contribution.tools.as_ref().map_or(0, Vec::len)
                        + contribution.channels.as_ref().map_or(0, Vec::len)
                        > self.limits.contributions
                    {
                        return Err(error("Plugin contribution limit exceeded"));
                    }
                    self.host.register(
                        &PluginDescriptor {
                            id: id.into(),
                            display_name: row.display_name.clone(),
                        },
                        &contribution,
                    )?;
                }
                Ok(())
            }),
            Err(e) => Err(e),
        };
        if let Err(e) = registration {
            self.unload(id).await?;
            return Err(e);
        }
        self.active
            .get_mut(id)
            .expect("active module")
            .cleanup_pending = false;
        Ok(())
    }
    /// Cleanup deliberately outlives request cancellation. A failure retains the
    /// active module so a later explicit stop can retry; never claim it unloaded.
    async fn cleanup(&self, id: &str, module: &PluginModule<C, H>) -> Result<()> {
        let unregister = tokio::time::timeout(Duration::from_secs(5), self.host.unregister(id))
            .await
            .unwrap_or_else(|_| Err(error("Plugin unregister deadline exceeded")));
        let dispose = tokio::time::timeout(Duration::from_secs(5), (module.dispose)())
            .await
            .unwrap_or_else(|_| Err(error("Plugin dispose deadline exceeded")));
        unregister.and(dispose)
    }
    async fn unload(&mut self, id: &str) -> Result<()> {
        if let Some(active) = self.active.get_mut(id) {
            active.cleanup_pending = true;
        }
        if let Some(active) = self.active.get(id) {
            self.cleanup(id, &active.module).await?;
        }
        self.active.remove(id);
        Ok(())
    }
    pub async fn disable(&mut self, id: &str) -> Result<InstalledPlugin> {
        let mut row = self
            .store
            .get(id)
            .await?
            .ok_or_else(|| error(format!("Plugin '{id}' not found")))?;
        if let Err(e) = self.unload(id).await {
            self.store
                .set_status(id, PluginStatus::Error, Some(format_error(&e)))
                .await?;
            return Err(e);
        }
        row.status = PluginStatus::Disabled;
        row.error = None;
        row.updated_at = now();
        self.store.set_status(id, row.status, None).await?;
        self.store
            .get(id)
            .await?
            .ok_or_else(|| error("Plugin disappeared after disable"))
    }
    pub async fn uninstall(&mut self, id: &str) -> Result<()> {
        self.unload(id).await?;
        self.store.remove(id).await
    }
    pub async fn set_config(&self, id: &str, config: Map<String, Value>) -> Result<()> {
        if let Some(active) = self.active.get(id) {
            active.context.set_config(config).await
        } else {
            self.store
                .set_config(id, config, self.limits.config_bytes)
                .await
        }
    }
    pub async fn dispose_all(&mut self) -> Result<()> {
        let ids: Vec<_> = self.active.keys().cloned().collect();
        let mut first = None;
        for id in ids {
            if let Err(e) = self.unload(&id).await
                && first.is_none()
            {
                first = Some(e);
            }
        }
        first.map_or(Ok(()), Err)
    }
}
fn format_error(e: &PluginError) -> String {
    match e {
        PluginError::Error(s) => s.chars().take(2048).collect(),
        PluginError::Thrown(_) => "Plugin threw a non-string value".into(),
    }
}

#[cfg(all(test, target_os = "linux"))]
mod tests {
    use super::*;
    use serde_json::json;
    use std::{num::NonZeroU16, sync::atomic::AtomicUsize};
    struct Fixture {
        root: PathBuf,
    }
    impl Fixture {
        fn new() -> Self {
            let root = Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("../../.jait/artifacts/gateway-rust/parallel-implementation/plugin-tests")
                .join(uuid::Uuid::new_v4().to_string());
            std::fs::create_dir_all(&root).unwrap();
            Self {
                root: root.canonicalize().unwrap(),
            }
        }
        fn plugin(&self, name: &str, id: &str, oc: bool) -> PathBuf {
            let dir = self.root.join(name);
            std::fs::create_dir_all(&dir).unwrap();
            std::fs::write(
                dir.join(if oc {
                    "openclaw.plugin.json"
                } else {
                    "jait.plugin.json"
                }),
                serde_json::to_vec(&json!({"id":id,"displayName":id,"version":"1.0.0"})).unwrap(),
            )
            .unwrap();
            std::fs::write(dir.join("index.js"), "native fixture entry").unwrap();
            dir
        }
        fn scan(&self) -> Vec<DiscoveredPlugin> {
            discover(
                std::slice::from_ref(&self.root),
                &Limits::default(),
                &Operation::new(Duration::from_secs(5)),
            )
            .unwrap()
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.root);
        }
    }
    struct Log;
    impl PluginLog for Log {
        fn info(&self, _: &str, _: &[Value]) {}
        fn warn(&self, _: &str, _: &[Value]) {}
        fn error(&self, _: &str, _: &[Value]) {}
    }
    struct Host {
        denied: AtomicBool,
        fail_register: AtomicBool,
        fail_unregister: AtomicBool,
        setup_pending: AtomicBool,
        setup_config: AtomicBool,
        loads: AtomicUsize,
        setups: Arc<AtomicUsize>,
        disposes: Arc<AtomicUsize>,
        registrations: AtomicUsize,
        revocations: AtomicUsize,
    }
    impl Default for Host {
        fn default() -> Self {
            Self {
                denied: AtomicBool::new(false),
                fail_register: AtomicBool::new(false),
                fail_unregister: AtomicBool::new(false),
                setup_pending: AtomicBool::new(false),
                setup_config: AtomicBool::new(false),
                loads: AtomicUsize::new(0),
                setups: Arc::new(AtomicUsize::new(0)),
                disposes: Arc::new(AtomicUsize::new(0)),
                registrations: AtomicUsize::new(0),
                revocations: AtomicUsize::new(0),
            }
        }
    }
    impl PluginHost<(), ()> for Host {
        fn authorize<'a>(
            &'a self,
            _: &'a DiscoveredPlugin,
            _: &'a File,
            _: &'a Operation,
        ) -> BoxFuture<'a, Result<()>> {
            Box::pin(async move {
                if self.denied.load(Ordering::Acquire) {
                    Err(error("denied"))
                } else {
                    Ok(())
                }
            })
        }
        fn load<'a>(
            &'a self,
            p: &'a DiscoveredPlugin,
            mut entry: File,
            _: &'a Operation,
        ) -> BoxFuture<'a, Result<PluginModule<(), ()>>> {
            Box::pin(async move {
                let mut bytes = String::new();
                entry.read_to_string(&mut bytes).unwrap();
                assert_eq!(bytes, "native fixture entry");
                self.loads.fetch_add(1, Ordering::SeqCst);
                let setups = self.setups.clone();
                let disposes = self.disposes.clone();
                let pending = self.setup_pending.load(Ordering::Acquire);
                let write_config = self.setup_config.load(Ordering::Acquire);
                Ok(PluginModule {
                    id: p.id().into(),
                    display_name: p.id().into(),
                    setup: Arc::new(move |ctx| {
                        let setups = setups.clone();
                        Box::pin(async move {
                            setups.fetch_add(1, Ordering::SeqCst);
                            assert!(ctx.get_config()?.is_object());
                            if write_config {
                                ctx.set_config(
                                    serde_json::from_value(json!({"fromSetup":true})).unwrap(),
                                )
                                .await?;
                            }
                            if pending {
                                std::future::pending::<()>().await;
                            }
                            Ok(Some(PluginContribution {
                                tools: Some(vec![]),
                                channels: Some(vec![]),
                                settings_schema: None,
                                permissions: None,
                            }))
                        })
                    }),
                    dispose: Arc::new(move || {
                        let disposes = disposes.clone();
                        Box::pin(async move {
                            disposes.fetch_add(1, Ordering::SeqCst);
                            Ok(())
                        })
                    }),
                })
            })
        }
        fn register(&self, _: &PluginDescriptor, _: &PluginContribution<(), ()>) -> Result<()> {
            if self.fail_register.load(Ordering::Acquire) {
                return Err(error("registry collision"));
            }
            self.registrations.fetch_add(1, Ordering::SeqCst);
            Ok(())
        }
        fn unregister<'a>(&'a self, _: &'a str) -> BoxFuture<'a, Result<()>> {
            Box::pin(async move {
                self.revocations.fetch_add(1, Ordering::SeqCst);
                if self.fail_unregister.load(Ordering::Acquire) {
                    Err(error("stop failed"))
                } else {
                    Ok(())
                }
            })
        }
    }
    fn manager(host: Arc<Host>) -> PluginManager<(), ()> {
        let db = rusqlite::Connection::open_in_memory().unwrap();
        db.execute_batch("CREATE TABLE plugins(id TEXT PRIMARY KEY,display_name TEXT NOT NULL,version TEXT NOT NULL,description TEXT,author TEXT,path TEXT NOT NULL,status TEXT NOT NULL,config TEXT NOT NULL,error TEXT,installed_at TEXT NOT NULL,updated_at TEXT NOT NULL);").unwrap();
        let store = PluginStore {
            database: DatabaseWorker::new(db, NonZeroU16::new(8).unwrap()).unwrap(),
        };
        PluginManager::new(
            store,
            host,
            Arc::new(Log),
            "test".into(),
            "/authorized/project".into(),
            Limits::default(),
        )
    }
    #[test]
    fn discovery_is_disabled_by_design_deduplicates_native_and_is_bounded() {
        let f = Fixture::new();
        f.plugin("native", "demo", false);
        f.plugin("oc", "demo", true);
        let plugins = f.scan();
        assert_eq!(plugins.len(), 1);
        assert!(!plugins[0].openclaw);
        let limits = Limits {
            entries: 1,
            ..Default::default()
        };
        assert!(
            discover(
                std::slice::from_ref(&f.root),
                &limits,
                &Operation::new(Duration::from_secs(1))
            )
            .is_err()
        );
        let limits = Limits {
            entries: 10,
            manifest_bytes: 2,
            ..Default::default()
        };
        assert!(
            discover(
                std::slice::from_ref(&f.root),
                &limits,
                &Operation::new(Duration::from_secs(1))
            )
            .is_err()
        );
    }
    #[test]
    fn filesystem_rejects_symlinks_traversal_and_fifo() {
        use std::os::unix::fs::symlink;
        let f = Fixture::new();
        let directory = f.plugin("native", "demo", false);
        symlink(&directory, f.root.join("linked")).unwrap();
        assert_eq!(f.scan().len(), 1);
        let mut plugin = f.scan().remove(0);
        plugin.manifest["main"] = json!("../outside.js");
        assert!(plugin.entry().is_err());
        std::fs::remove_file(directory.join("index.js")).unwrap();
        symlink("/etc/passwd", directory.join("index.js")).unwrap();
        plugin.manifest["main"] = json!("index.js");
        assert!(plugin.entry().is_err());
        std::fs::remove_file(directory.join("index.js")).unwrap();
        use std::{ffi::CString, os::unix::ffi::OsStrExt};
        let name = CString::new(directory.join("index.js").as_os_str().as_bytes()).unwrap();
        assert_eq!(unsafe { libc::mkfifo(name.as_ptr(), 0o600) }, 0);
        assert!(plugin.entry().is_err());
    }
    #[test]
    fn retained_directory_handle_resists_replacement_after_discovery() {
        let f = Fixture::new();
        let dir = f.plugin("native", "demo", false);
        let plugin = f.scan().remove(0);
        std::fs::rename(&dir, f.root.join("moved")).unwrap();
        std::fs::create_dir(&dir).unwrap();
        std::fs::write(dir.join("index.js"), "replacement").unwrap();
        let mut text = String::new();
        plugin.entry().unwrap().read_to_string(&mut text).unwrap();
        assert_eq!(text, "native fixture entry");
    }
    #[tokio::test]
    async fn lifecycle_persists_disabled_default_config_enable_and_uninstall() {
        let f = Fixture::new();
        f.plugin("native", "demo", false);
        let host = Arc::new(Host::default());
        let mut m = manager(host.clone());
        let op = Operation::new(Duration::from_secs(5));
        m.sync_and_load(f.scan(), &op).await.unwrap();
        assert_eq!(
            m.store.get("demo").await.unwrap().unwrap().status,
            PluginStatus::Installed
        );
        assert_eq!(host.loads.load(Ordering::SeqCst), 0);
        m.set_config(
            "demo",
            serde_json::from_value(json!({"token":"private"})).unwrap(),
        )
        .await
        .unwrap();
        m.enable("demo", &op).await.unwrap();
        m.enable("demo", &op).await.unwrap();
        assert_eq!(host.loads.load(Ordering::SeqCst), 1);
        m.set_config("demo", serde_json::from_value(json!({"new":true})).unwrap())
            .await
            .unwrap();
        assert_eq!(
            m.active["demo"].context.get_config().unwrap(),
            json!({"new":true})
        );
        m.disable("demo").await.unwrap();
        assert_eq!(m.loaded_count(), 0);
        assert_eq!(host.disposes.load(Ordering::SeqCst), 1);
        m.uninstall("demo").await.unwrap();
        assert!(m.store.get("demo").await.unwrap().is_none());
        assert!(f.root.join("native/index.js").exists());
    }
    #[tokio::test]
    async fn consent_denial_has_no_setup_or_registry_effect() {
        let f = Fixture::new();
        f.plugin("native", "demo", false);
        let host = Arc::new(Host::default());
        host.denied.store(true, Ordering::Release);
        let mut m = manager(host.clone());
        let op = Operation::new(Duration::from_secs(2));
        m.sync_and_load(f.scan(), &op).await.unwrap();
        assert!(m.enable("demo", &op).await.is_err());
        assert_eq!(host.loads.load(Ordering::SeqCst), 0);
        assert_eq!(host.registrations.load(Ordering::SeqCst), 0);
        assert_eq!(
            m.store.get("demo").await.unwrap().unwrap().status,
            PluginStatus::Error
        );
    }
    #[tokio::test]
    async fn registry_failure_disposes_setup_and_records_error() {
        let f = Fixture::new();
        f.plugin("native", "demo", false);
        let host = Arc::new(Host::default());
        host.fail_register.store(true, Ordering::Release);
        let mut m = manager(host.clone());
        let op = Operation::new(Duration::from_secs(2));
        m.sync_and_load(f.scan(), &op).await.unwrap();
        assert!(m.enable("demo", &op).await.is_err());
        assert_eq!(host.setups.load(Ordering::SeqCst), 1);
        assert_eq!(host.disposes.load(Ordering::SeqCst), 1);
        assert_eq!(m.loaded_count(), 0);
        assert_eq!(
            m.store.get("demo").await.unwrap().unwrap().status,
            PluginStatus::Error
        );
    }
    #[tokio::test]
    async fn setup_deadline_runs_cleanup_and_leaves_no_registration() {
        let f = Fixture::new();
        f.plugin("native", "demo", false);
        let host = Arc::new(Host::default());
        host.setup_pending.store(true, Ordering::Release);
        let mut m = manager(host.clone());
        m.sync_and_load(f.scan(), &Operation::new(Duration::from_secs(1)))
            .await
            .unwrap();
        assert!(
            m.enable("demo", &Operation::new(Duration::from_millis(30)))
                .await
                .is_err()
        );
        assert_eq!(host.disposes.load(Ordering::SeqCst), 1);
        assert_eq!(host.registrations.load(Ordering::SeqCst), 0);
        assert_eq!(m.loaded_count(), 0);
    }
    #[tokio::test]
    async fn failed_cleanup_retains_module_for_explicit_retry() {
        let f = Fixture::new();
        f.plugin("native", "demo", false);
        let host = Arc::new(Host::default());
        let mut m = manager(host.clone());
        let op = Operation::new(Duration::from_secs(2));
        m.sync_and_load(f.scan(), &op).await.unwrap();
        m.enable("demo", &op).await.unwrap();
        host.fail_unregister.store(true, Ordering::Release);
        assert!(m.disable("demo").await.is_err());
        assert_eq!(m.loaded_count(), 1);
        assert!(m.enable("demo", &op).await.is_err());
        host.fail_unregister.store(false, Ordering::Release);
        m.disable("demo").await.unwrap();
        assert_eq!(m.loaded_count(), 0);
    }
    #[tokio::test]
    async fn missing_scan_and_config_limits_surface_errors() {
        let f = Fixture::new();
        f.plugin("native", "demo", false);
        let mut m = manager(Arc::new(Host::default()));
        let op = Operation::new(Duration::from_secs(2));
        m.sync_and_load(f.scan(), &op).await.unwrap();
        m.sync_and_load(vec![], &op).await.unwrap();
        assert!(m.enable("demo", &op).await.is_err());
        assert_eq!(
            m.store.get("demo").await.unwrap().unwrap().status,
            PluginStatus::Error
        );
        m.limits.config_bytes = 1;
        assert!(m.set_config("demo", Map::new()).await.is_err());
        assert!(m.set_config("unknown", Map::new()).await.is_err());
    }
    #[test]
    fn cancelled_discovery_has_no_results() {
        let f = Fixture::new();
        f.plugin("native", "demo", false);
        let op = Operation::new(Duration::from_secs(1));
        op.cancelled.store(true, Ordering::Release);
        assert!(discover(std::slice::from_ref(&f.root), &Limits::default(), &op).is_err());
    }
    #[tokio::test]
    async fn cancellation_during_setup_disposes_before_return() {
        let f = Fixture::new();
        f.plugin("native", "demo", false);
        let host = Arc::new(Host::default());
        host.setup_pending.store(true, Ordering::Release);
        let mut m = manager(host.clone());
        m.sync_and_load(f.scan(), &Operation::new(Duration::from_secs(2)))
            .await
            .unwrap();
        let op = Operation::new(Duration::from_secs(2));
        let cancel = async {
            tokio::time::sleep(Duration::from_millis(20)).await;
            op.cancelled.store(true, Ordering::Release);
        };
        let (result, ()) = tokio::join!(m.enable("demo", &op), cancel);
        assert!(result.is_err());
        assert_eq!(m.loaded_count(), 0);
        assert_eq!(host.disposes.load(Ordering::SeqCst), 1);
    }
    #[tokio::test]
    async fn setup_config_write_is_not_overwritten_by_enabled_status() {
        let f = Fixture::new();
        f.plugin("native", "demo", false);
        let host = Arc::new(Host::default());
        host.setup_config.store(true, Ordering::Release);
        let mut m = manager(host);
        let op = Operation::new(Duration::from_secs(2));
        m.sync_and_load(f.scan(), &op).await.unwrap();
        let installed = m.enable("demo", &op).await.unwrap();
        assert_eq!(installed.config["fromSetup"], true);
        assert_eq!(
            m.store.get("demo").await.unwrap().unwrap().config["fromSetup"],
            true
        );
        m.dispose_all().await.unwrap();
    }
    #[tokio::test]
    async fn admitted_discovery_uses_shared_lane_and_checks_stop() {
        let f = Fixture::new();
        f.plugin("native", "demo", false);
        let lane = crate::runtime::blocking::BlockingLane::new(NonZeroU16::new(1).unwrap());
        let op = Operation::new(Duration::from_secs(2));
        assert_eq!(
            discover_admitted(&lane, vec![f.root.clone()], Limits::default(), &op)
                .await
                .unwrap()
                .len(),
            1
        );
        op.cancelled.store(true, Ordering::Release);
        assert!(
            discover_admitted(&lane, vec![f.root.clone()], Limits::default(), &op)
                .await
                .is_err()
        );
    }
    #[test]
    fn duplicate_id_and_extra_native_scan_roots_are_not_accepted() {
        let f = Fixture::new();
        f.plugin("one", "duplicate", false);
        f.plugin("two", "duplicate", false);
        assert!(
            discover(
                std::slice::from_ref(&f.root),
                &Limits::default(),
                &Operation::new(Duration::from_secs(1))
            )
            .is_err()
        );
        let base = Fixture::new();
        let extra = Fixture::new();
        extra.plugin("native", "other", false);
        extra.plugin("oc", "external", true);
        let found = discover(
            &[base.root.clone(), extra.root.clone()],
            &Limits::default(),
            &Operation::new(Duration::from_secs(1)),
        )
        .unwrap();
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].id(), "openclaw:external");
    }
}
