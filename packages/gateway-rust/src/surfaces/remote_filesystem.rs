//! Remote file facade over an explicitly authorized control-plane port.
//! A node ID or prefix comparison grants no authority: the injected transport
//! must enforce node/path scope, deadlines, cancellation and response bounds.
use super::{
    filesystem::{
        FileReply, FileSystemError, FileSystemResult, OutputCallback, StateCallback,
        replace_first_js,
    },
    registry::{
        Surface, SurfaceFactory, SurfaceFuture, SurfaceRef, SurfaceSnapshot, SurfaceStartInput,
        SurfaceState,
    },
};
use futures_util::future::BoxFuture;
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
};

pub trait RemoteFsTransport: Send + Sync {
    fn request<'a>(
        &'a self,
        node: &'a str,
        operation: &'a str,
        input: Value,
    ) -> BoxFuture<'a, FileSystemResult<Value>>;
}
#[derive(Clone, Debug)]
pub enum RemoteOperation {
    Read(String),
    ReadBinary(String),
    Write {
        path: String,
        content: String,
    },
    Patch {
        path: String,
        search: String,
        replace: String,
    },
    Exists(String),
    List(String),
    Stat(String),
    Restore(String),
    SaveExternalBackup(String),
}
struct State {
    phase: SurfaceState,
    session: Option<String>,
    started: Option<String>,
    root: Option<String>,
    node: Option<String>,
    panel: Option<bool>,
    count: u64,
    backups: HashMap<String, Option<String>>,
}
impl Default for State {
    fn default() -> Self {
        Self {
            phase: SurfaceState::Idle,
            session: None,
            started: None,
            root: None,
            node: None,
            panel: None,
            count: 0,
            backups: HashMap::new(),
        }
    }
}
#[derive(Default)]
struct Callbacks {
    output: Option<OutputCallback>,
    state: Option<StateCallback>,
}
#[derive(Clone)]
pub struct RemoteFileSystemSurface {
    id: String,
    transport: Arc<dyn RemoteFsTransport>,
    state: Arc<Mutex<State>>,
    callbacks: Arc<Mutex<Callbacks>>,
    clock: Arc<dyn Fn() -> String + Send + Sync>,
}
impl RemoteFileSystemSurface {
    pub fn new(id: impl Into<String>, transport: Arc<dyn RemoteFsTransport>) -> Self {
        Self {
            id: id.into(),
            transport,
            state: Arc::new(Mutex::new(State::default())),
            callbacks: Arc::new(Mutex::new(Callbacks::default())),
            clock: Arc::new(|| {
                crate::time::iso(chrono::Utc::now().timestamp_millis()).expect("valid wall clock")
            }),
        }
    }
    pub fn with_clock(mut self, clock: Arc<dyn Fn() -> String + Send + Sync>) -> Self {
        self.clock = clock;
        self
    }
    pub fn on_output(&self, callback: Option<OutputCallback>) {
        self.callbacks.lock().unwrap().output = callback;
    }
    pub fn on_state_change(&self, callback: Option<StateCallback>) {
        self.callbacks.lock().unwrap().state = callback;
    }
    fn transition(&self, phase: SurfaceState) -> FileSystemResult<()> {
        self.state.lock().unwrap().phase = phase;
        let callback = self.callbacks.lock().unwrap().state.clone();
        if let Some(callback) = callback {
            callback(phase)?;
        }
        Ok(())
    }
    pub fn start_remote(&self, input: SurfaceStartInput) -> FileSystemResult<()> {
        {
            let mut s = self.state.lock().unwrap();
            s.session = Some(input.session_id);
            s.started = Some((self.clock)());
            s.root = Some(input.project_root);
            s.node = input.node_id;
            s.panel = input.properties.get("panelOpen").and_then(Value::as_bool);
        }
        self.transition(SurfaceState::Running)
    }
    pub fn stop_remote(&self) -> FileSystemResult<()> {
        self.transition(SurfaceState::Stopped)
    }
    pub fn node_id(&self) -> Option<String> {
        self.state.lock().unwrap().node.clone()
    }
    pub fn remote_snapshot(&self) -> SurfaceSnapshot {
        let s = self.state.lock().unwrap();
        SurfaceSnapshot {id:self.id.clone(),kind:"remote-filesystem".into(),state:s.phase,session_id:s.session.clone().unwrap_or_default(),started_at:s.started.clone(),metadata:json!({"projectRoot":s.root,"nodeId":s.node,"panelOpen":s.panel,"operationCount":s.count,"remote":true}).as_object().unwrap().clone()}
    }
    fn ensure_running(&self) -> FileSystemResult<()> {
        let s = self.state.lock().unwrap();
        if s.phase != SurfaceState::Running {
            return Err(FileSystemError::message(
                "Remote FileSystem surface is not running",
            ));
        }
        if s.node.as_ref().is_none_or(|v| v.is_empty()) {
            return Err(FileSystemError::message(
                "Remote FileSystem surface has no nodeId",
            ));
        }
        Ok(())
    }
    fn increment(&self) {
        self.state.lock().unwrap().count += 1;
    }
    async fn proxy(&self, operation: &str, input: Value) -> FileSystemResult<Value> {
        let node = self.node_id().unwrap_or_default();
        self.transport.request(&node, operation, input).await
    }
    fn output(&self, text: String) -> FileSystemResult<()> {
        let callback = self.callbacks.lock().unwrap().output.clone();
        if let Some(callback) = callback {
            callback(&text)?;
        }
        Ok(())
    }
    pub async fn read(&self, path: &str) -> FileSystemResult<String> {
        self.ensure_running()?;
        self.increment();
        let result = self.proxy("read", json!({"path":path})).await?;
        let text = result["content"]
            .as_str()
            .ok_or_else(|| FileSystemError::message("Invalid remote filesystem content"))?
            .to_string();
        self.output(format!(
            "read {path} ({} bytes)",
            text.encode_utf16().count()
        ))?;
        Ok(text)
    }
    pub async fn read_binary(&self, path: &str) -> FileSystemResult<Vec<u8>> {
        self.ensure_running()?;
        self.increment();
        let result = self.proxy("readBinary", json!({"path":path})).await?;
        let encoded = result["content"]
            .as_str()
            .ok_or_else(|| FileSystemError::message("Invalid remote filesystem content"))?;
        let bytes = crate::contracts::lenient_base64::decode_lenient_base64(encoded);
        self.output(format!("read binary {path} ({} bytes)", bytes.len()))?;
        Ok(bytes)
    }
    pub async fn write(&self, path: &str, content: &str) -> FileSystemResult<()> {
        self.ensure_running()?;
        self.increment();
        if !self.has_backup(path) {
            let original = self.read(path).await.ok();
            self.state
                .lock()
                .unwrap()
                .backups
                .insert(path.into(), original);
        }
        self.proxy("write", json!({"path":path,"content":content}))
            .await?;
        self.output(format!(
            "wrote {path} ({} bytes)",
            content.encode_utf16().count()
        ))
    }
    pub async fn patch(
        &self,
        path: &str,
        search: &str,
        replacement: &str,
    ) -> FileSystemResult<bool> {
        self.ensure_running()?;
        self.increment();
        let original = self.read(path).await?;
        let Some(patched) = replace_first_js(&original, search, replacement) else {
            return Ok(false);
        };
        self.state
            .lock()
            .unwrap()
            .backups
            .entry(path.into())
            .or_insert(Some(original));
        self.write(path, &patched).await?;
        self.output(format!("patched {path}"))?;
        Ok(true)
    }
    pub async fn exists(&self, path: &str) -> FileSystemResult<Value> {
        self.ensure_running()?;
        Ok(self
            .proxy("exists", json!({"path":path}))
            .await
            .unwrap_or(json!(false)))
    }
    pub async fn list(&self, path: &str) -> FileSystemResult<Value> {
        self.ensure_running()?;
        self.increment();
        self.proxy("list", json!({"path":path})).await
    }
    pub async fn stat_file(&self, path: &str) -> FileSystemResult<Value> {
        self.ensure_running()?;
        self.proxy("stat", json!({"path":path})).await
    }
    /// Compatibility hint only: the authorized transport must enforce scope.
    pub fn is_path_allowed(&self, path: &str) -> bool {
        let root = self.state.lock().unwrap().root.clone();
        root.filter(|s| !s.is_empty()).is_some_and(|root| {
            path.replace('\\', "/")
                .to_lowercase()
                .starts_with(&root.replace('\\', "/").to_lowercase())
        })
    }
    pub fn has_backup(&self, path: &str) -> bool {
        self.state.lock().unwrap().backups.contains_key(path)
    }
    pub fn backup(&self, path: &str) -> Option<Option<String>> {
        self.state.lock().unwrap().backups.get(path).cloned()
    }
    pub fn clear_backup(&self, path: &str) {
        self.state.lock().unwrap().backups.remove(path);
    }
    pub async fn restore(&self, path: &str) -> FileSystemResult<bool> {
        self.ensure_running()?;
        let backup = self.backup(path);
        let Some(backup) = backup else {
            return Ok(false);
        };
        if let Some(content) = backup {
            self.write(path, &content).await?;
        }
        self.clear_backup(path);
        self.output(format!("restored {path}"))?;
        Ok(true)
    }
    pub async fn save_external_backup(&self, path: &str) -> FileSystemResult<()> {
        self.ensure_running()?;
        if !self.has_backup(path) {
            let original = self.read(path).await.ok();
            self.state
                .lock()
                .unwrap()
                .backups
                .insert(path.into(), original);
        }
        Ok(())
    }
    pub async fn execute(&self, op: RemoteOperation) -> FileSystemResult<FileReply> {
        match op {
            RemoteOperation::Read(p) => self.read(&p).await.map(|v| FileReply::Value(json!(v))),
            RemoteOperation::ReadBinary(p) => self.read_binary(&p).await.map(FileReply::Bytes),
            RemoteOperation::Write { path, content } => self
                .write(&path, &content)
                .await
                .map(|_| FileReply::Undefined),
            RemoteOperation::Patch {
                path,
                search,
                replace,
            } => self
                .patch(&path, &search, &replace)
                .await
                .map(|v| FileReply::Value(json!({"matched":v}))),
            RemoteOperation::Exists(p) => self.exists(&p).await.map(FileReply::Value),
            RemoteOperation::List(p) => self.list(&p).await.map(FileReply::Value),
            RemoteOperation::Stat(p) => self.stat_file(&p).await.map(FileReply::Value),
            RemoteOperation::Restore(p) => {
                self.restore(&p).await.map(|v| FileReply::Value(json!(v)))
            }
            RemoteOperation::SaveExternalBackup(p) => self
                .save_external_backup(&p)
                .await
                .map(|_| FileReply::Undefined),
        }
    }
}
impl Surface for RemoteFileSystemSurface {
    fn id(&self) -> &str {
        &self.id
    }
    fn kind(&self) -> &str {
        "remote-filesystem"
    }
    fn state(&self) -> SurfaceState {
        self.state.lock().unwrap().phase
    }
    fn session_id(&self) -> Option<String> {
        self.state.lock().unwrap().session.clone()
    }
    fn start(&self, input: SurfaceStartInput) -> SurfaceFuture<'_, ()> {
        Box::pin(async move { self.start_remote(input).map_err(|e| e.to_string()) })
    }
    fn stop(&self, _reason: Option<String>) -> SurfaceFuture<'_, ()> {
        Box::pin(async move { self.stop_remote().map_err(|e| e.to_string()) })
    }
    fn snapshot(&self) -> Result<SurfaceSnapshot, String> {
        Ok(self.remote_snapshot())
    }
}
pub struct RemoteFileSystemSurfaceFactory {
    transport: Arc<dyn RemoteFsTransport>,
}
impl RemoteFileSystemSurfaceFactory {
    pub fn new(transport: Arc<dyn RemoteFsTransport>) -> Self {
        Self { transport }
    }
    pub fn create_remote(&self, id: &str) -> RemoteFileSystemSurface {
        RemoteFileSystemSurface::new(id, self.transport.clone())
    }
}
impl SurfaceFactory for RemoteFileSystemSurfaceFactory {
    fn kind(&self) -> &str {
        "remote-filesystem"
    }
    fn create(&self, id: &str) -> Result<SurfaceRef, String> {
        Ok(Arc::new(self.create_remote(id)))
    }
}
