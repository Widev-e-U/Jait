//! Explicit Linux evaluation host. No ambient database, environment discovery,
//! default provider/tool authority, or CLI activation. The trusted runtime factory
//! must compose its own authenticated routes and supervise any effects it starts.
use super::{
    HostFuture, IsolatedChildHost,
    database_authority::EvaluationDatabase,
    private_directory::{self, PrivateDirectory},
};
use crate::{
    db::{self, worker::DatabaseWorker},
    evaluation::descriptor_transfer::child_capability::ChildHandoff,
    runtime::Gateway,
    security::http_auth::{self, AuthUser},
    services::users::{UserService, UserSettingsPatch},
};
use serde_json::Value;
use std::{
    ffi::CString,
    fs::File,
    future::Future,
    io,
    num::NonZeroU16,
    os::{
        fd::{AsRawFd, BorrowedFd},
        unix::fs::MetadataExt,
    },
    path::{Path, PathBuf},
    sync::{Arc, Mutex, OnceLock},
    time::Duration,
};
use tokio::{
    sync::{mpsc, watch},
    task::JoinHandle,
};

const CLEANUP_WAIT: Duration = Duration::from_secs(6);
const MAX_SETTINGS_BYTES: usize = 1024 * 1024;
// Handles are retained until shutdown so failures cannot be lost.
const MAX_EFFECTS: usize = 1024;
// Reserve before a handoff can start effects. Unconfirmed cleanup retains the
// slot for this process lifetime, failing closed when the finite pool fills.
const MAX_HANDOFF_FENCES: usize = 256;
static HANDOFF_FENCES: OnceLock<Mutex<Vec<Option<ChildHandoff>>>> = OnceLock::new();

fn handoff_fences() -> &'static Mutex<Vec<Option<ChildHandoff>>> {
    HANDOFF_FENCES.get_or_init(|| Mutex::new(Vec::new()))
}

fn reserve_handoff(handoff: ChildHandoff) -> Result<usize, String> {
    let mut fences = handoff_fences().lock().unwrap_or_else(|e| e.into_inner());
    if let Some(index) = fences.iter().position(Option::is_none) {
        fences[index] = Some(handoff);
        return Ok(index);
    }
    if fences.len() == MAX_HANDOFF_FENCES {
        return Err("Evaluation handoff fence capacity exceeded".into());
    }
    fences.push(Some(handoff));
    Ok(fences.len() - 1)
}

type DbTask = JoinHandle<(Option<EvaluationDatabase>, Result<Option<String>, String>)>;
type WorkerTask = JoinHandle<Result<DatabaseWorker, String>>;
type RemovalTask = JoinHandle<(OwnedState, Result<(), String>)>;

/// Runtime capability backed by the host-supervised database worker.
pub struct PreparedEvaluation {
    worker: DatabaseWorker,
    secret: String,
    effects: EffectRegistry,
    shutdown: watch::Receiver<bool>,
}
impl PreparedEvaluation {
    /// Register every asynchronous effect before it can outlive the factory.
    /// The trusted factory must not spawn unregistered effects. At most
    /// `MAX_EFFECTS` registrations are accepted over the host lifetime; completed
    /// handles remain retained until shutdown so failures cannot be lost.
    pub fn spawn_effect<F>(&self, effect: F) -> Result<(), String>
    where
        F: Future<Output = Result<(), String>> + Send + 'static,
    {
        let mut registry = self
            .effects
            .lock()
            .map_err(|_| "Evaluation effect registry poisoned")?;
        if registry.closed {
            return Err("Evaluation runtime is shutting down".into());
        }
        if registry.tasks.len() >= MAX_EFFECTS {
            return Err("Evaluation effect registry capacity exceeded".into());
        }
        registry.tasks.push(tokio::spawn(effect));
        Ok(())
    }
    pub fn shutdown_signal(&self) -> watch::Receiver<bool> {
        self.shutdown.clone()
    }
    pub fn jwt_secret(&self) -> &str {
        &self.secret
    }
    /// All clones share the host's bounded worker and shutdown lifecycle.
    pub fn database_worker(&self) -> DatabaseWorker {
        self.worker.clone()
    }
}

type EffectRegistry = Arc<Mutex<Effects>>;
#[derive(Default)]
struct Effects {
    closed: bool,
    tasks: Vec<JoinHandle<Result<(), String>>>,
}

pub type GatewayFactory =
    Box<dyn FnOnce(PreparedEvaluation) -> HostFuture<'static, Result<Gateway, String>> + Send>;

/// Native preparation, signing, listener supervision and directory cleanup.
/// Construct on the caller's filesystem lane. `parent_label` is an absolute
/// display/configuration label only; all filesystem effects use `parent`.
/// Same-UID processes and the factory are trusted, as in the directory authority.
/// Readiness is delivered through a bounded channel; the CLI must explicitly
/// forward it to stdout. No child executable is enabled by constructing a host.
pub struct NativeChildHost {
    resources: Option<Resources>,
}
struct Resources {
    handoff: Option<usize>,
    state: Option<OwnedState>,
    db_path: PathBuf,
    secret: String,
    database: Option<EvaluationDatabase>,
    database_task: Option<DbTask>,
    worker_task: Option<WorkerTask>,
    worker: Option<DatabaseWorker>,
    factory: Option<GatewayFactory>,
    starting: Option<JoinHandle<Result<Gateway, String>>>,
    server: Option<JoinHandle<io::Result<()>>>,
    listener_failed: bool,
    startup_unconfirmed: bool,
    effects: EffectRegistry,
    draining_effects: Vec<JoinHandle<Result<(), String>>>,
    effects_failed: bool,
    shutdown: watch::Sender<bool>,
    ready: mpsc::Sender<String>,
    removal: Option<RemovalTask>,
    prepared: bool,
    cleaned: bool,
}
struct OwnedState {
    parent: File,
    name: CString,
    directory: PrivateDirectory,
    data_removed: bool,
    parent_removes: bool,
}

fn clone_directory(dir: &PrivateDirectory) -> io::Result<PrivateDirectory> {
    Ok(PrivateDirectory {
        state: dir.state.try_clone()?,
        data: dir.data.try_clone()?,
    })
}
fn failure(error: impl std::fmt::Display) -> String {
    error.to_string()
}

/// Descriptors supplied by the parent when it adopts a running child host.
/// Grouped so the state/data pairing cannot be confused positionally.
pub struct AdoptedHost<'a> {
    pub parent: File,
    pub parent_label: &'a Path,
    pub name: String,
    pub state: File,
    pub data: File,
    pub secret: String,
    pub factory: GatewayFactory,
    pub ready: mpsc::Sender<String>,
}

/// Host arguments shared by the create and adopt paths.
struct HostSetup<'a> {
    parent: File,
    parent_label: &'a Path,
    name_c: CString,
    secret: String,
    factory: GatewayFactory,
    ready: mpsc::Sender<String>,
}

impl NativeChildHost {
    pub fn create(
        parent: File,
        parent_label: &Path,
        name: &str,
        secret: String,
        factory: GatewayFactory,
        ready: mpsc::Sender<String>,
    ) -> Result<Self, String> {
        if !parent_label.is_absolute() || secret.trim().is_empty() || secret.len() > 4096 {
            return Err("Invalid evaluation host configuration".into());
        }
        // Validates private ownership, name and fresh atomic directory creation.
        let directory = private_directory::create_in(&parent, name).map_err(failure)?;
        let name_c = CString::new(name).map_err(failure)?;
        Self::from_directory(
            HostSetup {
                parent,
                parent_label,
                name_c,
                secret,
                factory,
                ready,
            },
            directory,
            false,
        )
    }

    /// Adopt descriptors supplied by the parent. The parent must keep exclusive
    /// removal authority until the child exits and must retain its own handles.
    /// The label is only a protocol label, never filesystem authority.
    pub fn adopt(host: AdoptedHost<'_>) -> Result<Self, String> {
        let AdoptedHost {
            parent,
            parent_label,
            name,
            state,
            data,
            secret,
            factory,
            ready,
        } = host;
        if !parent_label.is_absolute()
            || secret.trim().is_empty()
            || secret.len() > 4096
            || name.is_empty()
            || name == "."
            || name == ".."
            || name.contains('/')
        {
            return Err("Invalid evaluation host configuration".into());
        }
        let name_c = CString::new(name).map_err(failure)?;
        for file in [&parent, &state, &data] {
            let metadata = file.metadata().map_err(failure)?;
            if !metadata.is_dir()
                || metadata.uid() != unsafe { libc::geteuid() }
                || metadata.mode() & 0o7777 != 0o700
            {
                return Err("Evaluation directory is not private".into());
            }
        }
        same_entry(&parent, &name_c, &state)?;
        same_entry(&state, c"data", &data)?;
        Self::from_directory(
            HostSetup {
                parent,
                parent_label,
                name_c,
                secret,
                factory,
                ready,
            },
            PrivateDirectory { state, data },
            true,
        )
    }

    /// Adopt a validated handoff and retain its lease with host resources.
    /// Acknowledgement is available through this host only after adoption succeeds.
    /// The dispatcher must retain and supervise this host through cleanup, and the
    /// parent must retain cleanup authority until all child effects have stopped.
    pub fn adopt_handoff(
        handoff: ChildHandoff,
        parent_label: &Path,
        name: &str,
        secret: String,
        factory: GatewayFactory,
        ready: mpsc::Sender<String>,
    ) -> Result<Self, String> {
        let (parent, state, data) = handoff.directories().map_err(failure)?;
        let parent = File::from(parent.try_clone_to_owned().map_err(failure)?);
        let state = File::from(state.try_clone_to_owned().map_err(failure)?);
        let data = File::from(data.try_clone_to_owned().map_err(failure)?);
        let mut host = Self::adopt(AdoptedHost {
            parent,
            parent_label,
            name: name.to_owned(),
            state,
            data,
            secret,
            factory,
            ready,
        })?;
        host.resources()?.handoff = Some(reserve_handoff(handoff)?);
        Ok(host)
    }

    /// Send the capability acknowledgement after successful adoption.
    /// WouldBlock permits retry; this does not prove effect or process exit.
    pub fn acknowledge_handoff(&self, socket: BorrowedFd<'_>) -> io::Result<()> {
        let resources = self
            .resources
            .as_ref()
            .ok_or_else(|| io::Error::other("Evaluation host closed"))?;
        if resources.cleaned {
            return Err(io::Error::other("Evaluation host cleaned"));
        }
        let index = resources
            .handoff
            .ok_or_else(|| io::Error::other("Evaluation handoff unavailable"))?;
        let fences = handoff_fences().lock().unwrap_or_else(|e| e.into_inner());
        fences[index]
            .as_ref()
            .ok_or_else(|| io::Error::other("Evaluation handoff unavailable"))?
            .acknowledge(socket)
    }

    fn from_directory(
        setup: HostSetup<'_>,
        directory: PrivateDirectory,
        parent_removes: bool,
    ) -> Result<Self, String> {
        let HostSetup {
            parent,
            parent_label,
            name_c,
            secret,
            factory,
            ready,
        } = setup;
        let name = name_c.to_str().map_err(failure)?;
        let db_path = parent_label.join(name).join("data/jait.db");
        let (shutdown, _) = watch::channel(false);
        Ok(Self {
            resources: Some(Resources {
                handoff: None,
                state: Some(OwnedState {
                    parent,
                    name: name_c,
                    directory,
                    data_removed: false,
                    parent_removes,
                }),
                db_path,
                secret,
                database: None,
                database_task: None,
                worker_task: None,
                worker: None,
                factory: Some(factory),
                starting: None,
                server: None,
                listener_failed: false,
                startup_unconfirmed: false,
                effects: Arc::new(Mutex::new(Effects::default())),
                draining_effects: Vec::new(),
                effects_failed: false,
                shutdown,
                ready,
                removal: None,
                prepared: false,
                cleaned: false,
            }),
        })
    }
    fn resources(&mut self) -> Result<&mut Resources, String> {
        self.resources
            .as_mut()
            .ok_or_else(|| "Evaluation host closed".into())
    }
}

impl Resources {
    async fn finish_worker_start(&mut self) -> Result<(), String> {
        let task = self
            .worker_task
            .as_mut()
            .ok_or("No runtime database startup")?;
        let result = task.await;
        self.worker_task = None;
        self.worker = Some(result.map_err(|_| "Evaluation worker startup failed")??);
        Ok(())
    }
    async fn finish_database(&mut self) -> Result<Option<String>, String> {
        let task = self.database_task.as_mut().ok_or("No database operation")?;
        // The JoinHandle stays owned across cancellation of this wait.
        let result = task.await;
        self.database_task = None;
        let (database, result) = result.map_err(|_| "Evaluation database worker failed")?;
        self.database = database;
        result
    }
    async fn database_operation(
        &mut self,
        operation: impl FnOnce(&mut Option<EvaluationDatabase>) -> Result<Option<String>, String>
        + Send
        + 'static,
    ) -> Result<Option<String>, String> {
        if self.cleaned || self.removal.is_some() || self.database_task.is_some() {
            return Err("Evaluation database unavailable".into());
        }
        let mut database = self.database.take();
        self.database_task = Some(tokio::task::spawn_blocking(move || {
            let result = operation(&mut database);
            (database, result)
        }));
        self.finish_database().await
    }
    async fn close_database(&mut self) -> Result<(), String> {
        if self.database.is_none() {
            return if self.prepared {
                Ok(())
            } else {
                Err("Evaluation database closed".into())
            };
        }
        self.database_operation(|db| {
            drop(db.take());
            Ok(None)
        })
        .await?;
        self.prepared = true;
        Ok(())
    }
    async fn cleanup(&mut self) -> Result<(), String> {
        if self.cleaned {
            return Ok(());
        }
        // A cancelled preparation operation may still own SQLite. Never remove
        // its directory before it returns, even when the cleanup deadline expires.
        if self.database_task.is_some() {
            match tokio::time::timeout(CLEANUP_WAIT, self.finish_database()).await {
                Ok(result) => {
                    let _ = result;
                }
                Err(_) => {
                    return Err("Evaluation database cleanup timed out; state retained".into());
                }
            }
        }
        if self.database.is_some() {
            tokio::time::timeout(CLEANUP_WAIT, self.close_database())
                .await
                .map_err(|_| "Evaluation database close timed out; state retained")??;
        }
        // A cancelled blocking startup may still create the worker. Collect it
        // before removing state, even when the initiating future was dropped.
        if self.worker_task.is_some() {
            tokio::time::timeout(CLEANUP_WAIT, self.finish_worker_start())
                .await
                .map_err(|_| "Evaluation worker startup cleanup timed out; state retained")??;
        }
        if let Some(task) = self.starting.as_mut() {
            // Aborting the factory cannot prove that work it spawned has stopped.
            self.startup_unconfirmed = true;
            task.abort();
            // If startup won the race, dropping its Gateway closes the listener.
            let _ = tokio::time::timeout(CLEANUP_WAIT, &mut *task)
                .await
                .map_err(|_| "Evaluation runtime startup cleanup timed out; state retained")?;
            self.starting = None;
        }
        self.shutdown.send_replace(true);
        {
            let mut effects = self
                .effects
                .lock()
                .map_err(|_| "Evaluation effect registry poisoned; state retained")?;
            effects.closed = true;
            self.draining_effects.append(&mut effects.tasks);
        }
        if self.effects_failed {
            return Err("Evaluation effect drain failed; state retained".into());
        }
        // Bound the whole drain, not each handle independently.
        let deadline = tokio::time::Instant::now() + CLEANUP_WAIT;
        while let Some(task) = self.draining_effects.last_mut() {
            let result = tokio::time::timeout_at(deadline, task)
                .await
                .map_err(|_| "Evaluation effect cleanup timed out; state retained")?;
            self.draining_effects.pop();
            if !matches!(result, Ok(Ok(()))) {
                self.effects_failed = true;
                return Err("Evaluation effect drain failed; state retained".into());
            }
        }
        if self.startup_unconfirmed {
            return Err("Evaluation runtime startup drain unconfirmed; state retained".into());
        }
        if self.listener_failed {
            return Err("Evaluation listener drain failed; state retained".into());
        }
        if let Some(task) = self.server.as_mut() {
            // Retain the join handle on timeout so a later cleanup can observe
            // completion. Aborting the listener does not prove requests stopped.
            let result = tokio::time::timeout(CLEANUP_WAIT, &mut *task)
                .await
                .map_err(|_| "Evaluation listener cleanup timed out; state retained")?;
            self.server = None;
            if !matches!(result, Ok(Ok(()))) {
                // A failed drain cannot establish that in-flight effects ended.
                // Keep this failure sticky across later cleanup attempts.
                self.listener_failed = true;
                return Err("Evaluation listener drain failed; state retained".into());
            }
        }
        self.factory = None;
        if let Some(worker) = self.worker.as_ref() {
            tokio::time::timeout(CLEANUP_WAIT, worker.shutdown())
                .await
                .map_err(|_| "Evaluation worker drain timed out; state retained")?
                .map_err(failure)?;
            self.worker = None;
        }
        if self
            .state
            .as_ref()
            .is_some_and(|state| state.parent_removes)
        {
            // The parent's confirmed-exit path owns deletion. Never unlink a
            // transferred directory or its contents in the child.
            self.state.take();
            self.cleaned = true;
            return Ok(());
        }
        if self.removal.is_none() {
            let mut state = self
                .state
                .take()
                .ok_or("Evaluation directory unavailable")?;
            self.removal = Some(tokio::task::spawn_blocking(move || {
                let result = state.remove();
                (state, result)
            }));
        }
        let task = self.removal.as_mut().expect("removal owned");
        let result = tokio::time::timeout(CLEANUP_WAIT, task)
            .await
            .map_err(|_| "Evaluation directory cleanup timed out")?;
        self.removal = None;
        let (state, removed) = result.map_err(|_| "Evaluation directory cleanup worker failed")?;
        if let Err(error) = removed {
            self.state = Some(state);
            return Err(error);
        }
        self.cleaned = true;
        Ok(())
    }
}

impl IsolatedChildHost for NativeChildHost {
    fn open_database<'a>(&'a mut self, path: &'a Path) -> HostFuture<'a, Result<(), String>> {
        Box::pin(async move {
            let r = self.resources()?;
            if path != r.db_path || r.database.is_some() || r.prepared {
                return Err("Evaluation database isolation required".into());
            }
            let dir = clone_directory(
                &r.state
                    .as_ref()
                    .ok_or("Evaluation directory unavailable")?
                    .directory,
            )
            .map_err(failure)?;
            r.database_operation(move |db| {
                let opened = EvaluationDatabase::create(dir)?;
                opened
                    .connection()
                    .busy_timeout(Duration::from_secs(1))
                    .map_err(failure)?;
                *db = Some(opened);
                Ok(None)
            })
            .await?;
            Ok(())
        })
    }
    fn migrate_database(&mut self) -> HostFuture<'_, Result<(), String>> {
        Box::pin(async move {
            self.resources()?
                .database_operation(|db| {
                    db::migrate_database(
                        db.as_ref()
                            .ok_or("Evaluation database closed")?
                            .connection(),
                    )
                    .map_err(failure)?;
                    Ok(None)
                })
                .await?;
            Ok(())
        })
    }
    fn create_evaluation_user(&mut self) -> HostFuture<'_, Result<String, String>> {
        Box::pin(async move {
            self.resources()?
                .database_operation(|db| {
                    let users = UserService::new(
                        db.as_ref()
                            .ok_or("Evaluation database closed")?
                            .connection(),
                    );
                    Ok(Some(
                        users
                            .create_user("evaluation", &uuid::Uuid::new_v4().to_string())
                            .map_err(failure)?
                            .id,
                    ))
                })
                .await?
                .ok_or_else(|| "Evaluation user unavailable".into())
        })
    }
    fn update_settings<'a>(
        &'a mut self,
        user: &'a str,
        settings: Value,
    ) -> HostFuture<'a, Result<(), String>> {
        Box::pin(async move {
            if settings.to_string().len() > MAX_SETTINGS_BYTES {
                return Err("Evaluation settings too large".into());
            }
            let patch: UserSettingsPatch =
                serde_json::from_value(settings).map_err(|_| "Invalid evaluation user settings")?;
            let user = user.to_owned();
            self.resources()?
                .database_operation(move |db| {
                    UserService::new(
                        db.as_ref()
                            .ok_or("Evaluation database closed")?
                            .connection(),
                    )
                    .update_settings(&user, patch)
                    .map_err(failure)?;
                    Ok(None)
                })
                .await?;
            Ok(())
        })
    }
    fn sign_token<'a>(
        &'a mut self,
        user: &'a str,
        secret: &'a str,
    ) -> HostFuture<'a, Result<String, String>> {
        Box::pin(async move {
            let r = self.resources()?;
            if secret != r.secret {
                return Err("Evaluation signing authority mismatch".into());
            }
            let secret = r.secret.clone();
            let user = user.to_owned();
            r.database_operation(move |db| {
                let found = UserService::new(
                    db.as_ref()
                        .ok_or("Evaluation database closed")?
                        .connection(),
                )
                .find_by_id(&user)
                .map_err(failure)?
                .ok_or("Evaluation user unavailable")?;
                Ok(Some(
                    http_auth::sign_auth_token(
                        &AuthUser {
                            id: found.id,
                            username: found.username,
                        },
                        &secret,
                    )
                    .map_err(failure)?,
                ))
            })
            .await?
            .ok_or_else(|| "Evaluation token unavailable".into())
        })
    }
    fn close_database(&mut self) -> HostFuture<'_, Result<(), String>> {
        Box::pin(async move { self.resources()?.close_database().await })
    }
    fn start_evaluation_gateway(&mut self) -> HostFuture<'_, Result<u32, String>> {
        Box::pin(async move {
            let r = self.resources()?;
            if !r.prepared || r.database.is_some() || r.database_task.is_some() || r.cleaned {
                return Err("Evaluation database preparation incomplete".into());
            }
            let factory = r
                .factory
                .take()
                .ok_or("Evaluation runtime already started")?;
            let directory = clone_directory(
                &r.state
                    .as_ref()
                    .ok_or("Evaluation directory unavailable")?
                    .directory,
            )
            .map_err(failure)?;
            r.worker_task = Some(tokio::task::spawn_blocking(move || {
                let database = EvaluationDatabase::reopen(directory)?;
                DatabaseWorker::new_owned(database, NonZeroU16::new(32).unwrap()).map_err(failure)
            }));
            r.finish_worker_start().await?;
            let prepared = PreparedEvaluation {
                worker: r.worker.as_ref().expect("worker owned").clone(),
                secret: r.secret.clone(),
                effects: r.effects.clone(),
                shutdown: r.shutdown.subscribe(),
            };
            r.starting = Some(tokio::spawn(async move { factory(prepared).await }));
            let result = r.starting.as_mut().expect("startup owned").await;
            r.starting = None;
            if !matches!(&result, Ok(Ok(_))) {
                // The factory interface has no drain acknowledgement for effects
                // launched before an error or panic.
                r.startup_unconfirmed = true;
            }
            let gateway = result.map_err(|_| "Evaluation runtime startup failed")??;
            let address = gateway.local_addr().map_err(failure)?;
            // Gateway currently enforces loopback; retain the check at handoff.
            if !address.ip().is_loopback() || address.port() == 0 {
                return Err("Evaluation listener must use loopback".into());
            }
            let mut cancelled = r.shutdown.subscribe();
            r.server = Some(tokio::spawn(gateway.serve(async move {
                let _ = cancelled.wait_for(|cancelled| *cancelled).await;
            })));
            Ok(u32::from(address.port()))
        })
    }
    fn emit_ready<'a>(&'a mut self, line: &'a str) -> HostFuture<'a, Result<(), String>> {
        Box::pin(async move {
            let r = self.resources()?;
            if r.server.is_none() || line.len() > 8192 {
                return Err("Evaluation readiness unavailable".into());
            }
            r.ready
                .send(line.to_owned())
                .await
                .map_err(|_| "Evaluation readiness receiver closed".into())
        })
    }
    fn cancel_cleanup(&mut self) -> HostFuture<'_, Result<(), String>> {
        Box::pin(async move { self.resources()?.cleanup().await })
    }
    fn wait_for_gateway_stop(&mut self) -> HostFuture<'_, Result<(), String>> {
        Box::pin(async move {
            let r = self.resources()?;
            let result = r
                .server
                .as_mut()
                .ok_or("Evaluation listener unavailable")?
                .await;
            r.server = None;
            if !matches!(&result, Ok(Ok(()))) {
                // A failed wait does not establish that in-flight requests ended.
                r.listener_failed = true;
            }
            result
                .map_err(|_| "Evaluation listener worker failed")?
                .map_err(failure)
        })
    }
}

impl Drop for Resources {
    fn drop(&mut self) {
        if self.cleaned
            && let Some(index) = self.handoff.take()
        {
            let mut fences = handoff_fences().lock().unwrap_or_else(|e| e.into_inner());
            fences[index] = None;
        }
        // If cleanup was interrupted or failed, the pre-reserved slot retains
        // the lease even when an async cleanup task is cancelled by its runtime.
    }
}

impl Drop for NativeChildHost {
    fn drop(&mut self) {
        if let Some(mut r) = self.resources.take() {
            r.shutdown.send_replace(true);
            if let Some(starting) = &r.starting {
                starting.abort();
            }
            if let Ok(runtime) = tokio::runtime::Handle::try_current() {
                // Explicit run_supervised/cancel_cleanup must still be awaited for
                // evidence. Runtime shutdown cannot guarantee async Drop cleanup.
                runtime.spawn(async move {
                    let _ = r.cleanup().await;
                });
            } else if let Some(server) = &r.server {
                server.abort();
            }
        }
    }
}

impl OwnedState {
    fn remove(&mut self) -> Result<(), String> {
        // Compare descriptor identities before deleting names. Replacement or
        // renaming fails closed; never recursively walk an ambient state path.
        same_entry(&self.parent, &self.name, &self.directory.state)?;
        if !self.data_removed {
            same_entry(&self.directory.state, c"data", &self.directory.data)?;
            for name in [
                c"jait.db",
                c"jait.db-wal",
                c"jait.db-shm",
                c"jait.db-journal",
            ] {
                let rc =
                    unsafe { libc::unlinkat(self.directory.data.as_raw_fd(), name.as_ptr(), 0) };
                if rc != 0 && io::Error::last_os_error().kind() != io::ErrorKind::NotFound {
                    return Err(failure(io::Error::last_os_error()));
                }
            }
            unlink_dir(&self.directory.state, c"data")?;
            self.data_removed = true;
        }
        unlink_dir(&self.parent, &self.name)
    }
}
fn same_entry(parent: &File, name: &std::ffi::CStr, held: &File) -> Result<(), String> {
    let mut entry = std::mem::MaybeUninit::<libc::stat>::uninit();
    if unsafe {
        libc::fstatat(
            parent.as_raw_fd(),
            name.as_ptr(),
            entry.as_mut_ptr(),
            libc::AT_SYMLINK_NOFOLLOW,
        )
    } != 0
    {
        return Err("Evaluation directory identity unavailable; state retained".into());
    }
    let entry = unsafe { entry.assume_init() };
    let held = held.metadata().map_err(failure)?;
    if entry.st_dev != held.dev()
        || entry.st_ino != held.ino()
        || entry.st_mode & libc::S_IFMT != libc::S_IFDIR
    {
        return Err("Evaluation directory replaced; state retained".into());
    }
    Ok(())
}
fn unlink_dir(parent: &File, name: &std::ffi::CStr) -> Result<(), String> {
    if unsafe { libc::unlinkat(parent.as_raw_fd(), name.as_ptr(), libc::AT_REMOVEDIR) } != 0 {
        return Err(failure(io::Error::last_os_error()));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        config::GatewayConfig,
        evaluation::isolated_gateway::{ReadyLine, parse_ready_line},
        evaluation::isolated_gateway_child::{bootstrap_supervised, run_supervised},
        health::{HealthSnapshot, HealthState},
    };
    use std::{
        fs,
        net::SocketAddr,
        os::unix::fs::{PermissionsExt, symlink},
    };
    use tokio::sync::oneshot;

    const SECRET: &str = "evaluation-host-fixture-secret";
    struct Fixture(PathBuf);
    impl Fixture {
        fn new() -> Self {
            let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("../../.jait/artifacts/gateway-rust/evaluation-child-host/fixtures");
            fs::create_dir_all(&root).unwrap();
            let path = root.join(uuid::Uuid::new_v4().to_string());
            fs::create_dir(&path).unwrap();
            fs::set_permissions(&path, fs::Permissions::from_mode(0o700)).unwrap();
            Self(path)
        }
        fn host(&self, factory: GatewayFactory, ready: mpsc::Sender<String>) -> NativeChildHost {
            NativeChildHost::create(
                File::open(&self.0).unwrap(),
                &self.0,
                "state",
                SECRET.into(),
                factory,
                ready,
            )
            .unwrap()
        }
        fn labels(&self) -> (String, String) {
            let state = self.0.join("state");
            (
                state.to_str().unwrap().into(),
                state.join("data/jait.db").to_str().unwrap().into(),
            )
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            fs::remove_dir_all(&self.0).unwrap();
        }
    }
    fn handoff_fixture(fixture: &Fixture) -> (NativeChildHost, File, usize) {
        use crate::evaluation::{descriptor_transfer, recovery::RecoveryLease};
        use std::os::fd::{AsFd, FromRawFd, OwnedFd};

        let parent = File::open(&fixture.0).unwrap();
        let directory = private_directory::create_in(&parent, "state").unwrap();
        let lease = RecoveryLease::create_for(&parent, "lease", "state").unwrap();
        let child_lease = lease.duplicate_for_child().unwrap();
        let mut fds = [-1; 2];
        assert_eq!(
            unsafe {
                libc::socketpair(
                    libc::AF_UNIX,
                    libc::SOCK_SEQPACKET | libc::SOCK_CLOEXEC,
                    0,
                    fds.as_mut_ptr(),
                )
            },
            0
        );
        let (sender, receiver) =
            unsafe { (OwnedFd::from_raw_fd(fds[0]), OwnedFd::from_raw_fd(fds[1])) };
        let mut handoff = ChildHandoff::new("state").unwrap();
        for (index, dir) in [&parent, &directory.state, &directory.data]
            .iter()
            .enumerate()
        {
            descriptor_transfer::try_send_directory_with_lease(
                sender.as_fd(),
                dir.as_fd(),
                child_lease.as_fd(),
            )
            .unwrap();
            assert_eq!(handoff.step(receiver.as_fd()).unwrap(), index == 2);
        }
        let (ready, _) = mpsc::channel(1);
        let host = NativeChildHost::adopt_handoff(
            handoff,
            &fixture.0,
            "state",
            SECRET.into(),
            unused_factory(),
            ready,
        )
        .unwrap();
        let index = host.resources.as_ref().unwrap().handoff.unwrap();
        drop(child_lease);
        drop(lease);
        (host, parent, index)
    }

    #[test]
    fn dropped_unconfirmed_host_retains_recovery_lease() {
        use crate::evaluation::recovery::RecoveryLease;
        let fixture = Fixture::new();
        let (host, parent, index) = handoff_fixture(&fixture);
        drop(host);
        assert!(RecoveryLease::recover(&parent, "lease").is_err());
        // A test-only explicit release confirms that the retained fence, rather
        // than an unrelated descriptor, prevented recovery.
        handoff_fences().lock().unwrap()[index] = None;
        assert!(RecoveryLease::recover(&parent, "lease").is_ok());
    }

    #[tokio::test]
    async fn successful_handoff_fence_released_after_drop() {
        use crate::evaluation::recovery::RecoveryLease;
        let fixture = Fixture::new();
        let (mut host, parent, _index) = handoff_fixture(&fixture);
        host.cancel_cleanup().await.unwrap();
        assert!(RecoveryLease::recover(&parent, "lease").is_err());
        drop(host);
        tokio::task::yield_now().await;
        assert!(RecoveryLease::recover(&parent, "lease").is_ok());
    }

    #[test]
    fn runtime_cancellation_retains_handoff_fence() {
        use crate::evaluation::recovery::RecoveryLease;
        let fixture = Fixture::new();
        let (mut host, parent, index) = handoff_fixture(&fixture);
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        runtime.block_on(async {
            let effect = tokio::spawn(std::future::pending::<Result<(), String>>());
            host.resources()
                .unwrap()
                .effects
                .lock()
                .unwrap()
                .tasks
                .push(effect);
            let effects = host.resources().unwrap().effects.clone();
            drop(host);
            // Confirm cleanup reached the effect drain before runtime shutdown.
            tokio::task::yield_now().await;
            assert!(effects.lock().unwrap().closed);
        });
        drop(runtime);
        assert!(RecoveryLease::recover(&parent, "lease").is_err());
        handoff_fences().lock().unwrap()[index] = None;
        assert!(RecoveryLease::recover(&parent, "lease").is_ok());
    }

    #[tokio::test]
    async fn adopted_directory_is_retained_for_parent_after_cleanup() {
        let fixture = Fixture::new();
        let parent = File::open(&fixture.0).unwrap();
        let directory = private_directory::create_in(&parent, "state").unwrap();
        let (ready, _) = mpsc::channel(1);
        let mut host = NativeChildHost::adopt(AdoptedHost {
            parent,
            parent_label: &fixture.0,
            name: "state".into(),
            state: directory.state,
            data: directory.data,
            secret: SECRET.into(),
            factory: unused_factory(),
            ready,
        })
        .unwrap();
        host.cancel_cleanup().await.unwrap();
        assert!(fixture.0.join("state/data").is_dir());
        host.cancel_cleanup().await.unwrap();
    }

    #[test]
    fn adopted_directory_rejects_replacement_and_nonprivate_modes() {
        let fixture = Fixture::new();
        let parent = File::open(&fixture.0).unwrap();
        let directory = private_directory::create_in(&parent, "state").unwrap();
        fs::rename(fixture.0.join("state"), fixture.0.join("original")).unwrap();
        symlink("original", fixture.0.join("state")).unwrap();
        let (ready, _) = mpsc::channel(1);
        assert!(
            NativeChildHost::adopt(AdoptedHost {
                parent: parent.try_clone().unwrap(),
                parent_label: &fixture.0,
                name: "state".into(),
                state: directory.state.try_clone().unwrap(),
                data: directory.data.try_clone().unwrap(),
                secret: SECRET.into(),
                factory: unused_factory(),
                ready,
            })
            .is_err()
        );
        fs::remove_file(fixture.0.join("state")).unwrap();
        fs::rename(fixture.0.join("original"), fixture.0.join("state")).unwrap();
        fs::set_permissions(
            fixture.0.join("state/data"),
            fs::Permissions::from_mode(0o755),
        )
        .unwrap();
        let (ready, _) = mpsc::channel(1);
        assert!(
            NativeChildHost::adopt(AdoptedHost {
                parent,
                parent_label: &fixture.0,
                name: "state".into(),
                state: directory.state,
                data: directory.data,
                secret: SECRET.into(),
                factory: unused_factory(),
                ready,
            })
            .is_err()
        );
        assert!(fixture.0.join("state/data").is_dir());
    }

    #[tokio::test]
    async fn adopted_directory_unconfirmed_startup_retains_parent_state() {
        let fixture = Fixture::new();
        let parent = File::open(&fixture.0).unwrap();
        let directory = private_directory::create_in(&parent, "state").unwrap();
        let (ready, _) = mpsc::channel(1);
        let mut host = NativeChildHost::adopt(AdoptedHost {
            parent,
            parent_label: &fixture.0,
            name: "state".into(),
            state: directory.state,
            data: directory.data,
            secret: SECRET.into(),
            factory: unused_factory(),
            ready,
        })
        .unwrap();
        host.resources().unwrap().startup_unconfirmed = true;
        assert!(
            host.cancel_cleanup()
                .await
                .unwrap_err()
                .contains("startup drain unconfirmed")
        );
        assert!(
            host.cancel_cleanup()
                .await
                .unwrap_err()
                .contains("startup drain unconfirmed")
        );
        assert!(fixture.0.join("state/data").is_dir());
    }

    #[test]
    fn adopted_directory_rejects_unrelated_data_handle() {
        let fixture = Fixture::new();
        let parent = File::open(&fixture.0).unwrap();
        let directory = private_directory::create_in(&parent, "state").unwrap();
        let other = private_directory::create_in(&parent, "other").unwrap();
        let (ready, _) = mpsc::channel(1);
        assert!(
            NativeChildHost::adopt(AdoptedHost {
                parent,
                parent_label: &fixture.0,
                name: "state".into(),
                state: directory.state,
                data: other.data,
                secret: SECRET.into(),
                factory: unused_factory(),
                ready,
            })
            .is_err()
        );
        assert!(fixture.0.join("state/data").is_dir());
        assert!(fixture.0.join("other/data").is_dir());
    }

    async fn listener() -> Gateway {
        Gateway::bind(
            GatewayConfig {
                address: "127.0.0.1:0".parse().unwrap(),
            },
            HealthState::new(None, HealthSnapshot::default()),
        )
        .await
        .unwrap()
    }
    fn unused_factory() -> GatewayFactory {
        Box::new(|_| Box::pin(async { panic!("runtime must not start") }))
    }
    fn assert_port_released(address: SocketAddr) {
        drop(std::net::TcpListener::bind(address).expect("listener must be closed"));
    }

    #[tokio::test(start_paused = true)]
    async fn listener_timeout_retains_state_until_successful_drain() {
        let fixture = Fixture::new();
        let (ready, _receiver) = mpsc::channel(1);
        let mut host = fixture.host(unused_factory(), ready);
        let (release, released) = oneshot::channel();
        let resources = host.resources().unwrap();
        resources.server = Some(tokio::spawn(async move {
            released.await.map_err(io::Error::other)?;
            Ok(())
        }));
        assert!(
            resources
                .cleanup()
                .await
                .unwrap_err()
                .contains("listener cleanup timed out")
        );
        assert!(resources.server.is_some());
        assert!(fixture.0.join("state/data").is_dir());
        release.send(()).unwrap();
        resources.cleanup().await.unwrap();
        assert!(!fixture.0.join("state").exists());
    }

    #[tokio::test(start_paused = true)]
    async fn registered_effect_timeout_retains_state_until_drain() {
        let fixture = Fixture::new();
        let (ready, _receiver) = mpsc::channel(1);
        let mut host = fixture.host(unused_factory(), ready);
        let resources = host.resources().unwrap();
        let mut shutdown = resources.shutdown.subscribe();
        let (release, released) = oneshot::channel();
        resources
            .effects
            .lock()
            .unwrap()
            .tasks
            .push(tokio::spawn(async move {
                shutdown.wait_for(|value| *value).await.map_err(failure)?;
                released.await.map_err(failure)?;
                Ok(())
            }));
        assert!(
            resources
                .cleanup()
                .await
                .unwrap_err()
                .contains("effect cleanup timed out")
        );
        assert!(fixture.0.join("state/data").is_dir());
        assert_eq!(resources.draining_effects.len(), 1);
        release.send(()).unwrap();
        resources.cleanup().await.unwrap();
        assert!(!fixture.0.join("state").exists());
    }

    #[tokio::test(start_paused = true)]
    async fn effect_drain_uses_one_deadline_and_retains_unfinished_work() {
        let fixture = Fixture::new();
        let (ready, _receiver) = mpsc::channel(1);
        let mut host = fixture.host(unused_factory(), ready);
        let resources = host.resources().unwrap();
        let (first_finished, first_done) = oneshot::channel();
        {
            let mut effects = resources.effects.lock().unwrap();
            effects.tasks.push(tokio::spawn(async move {
                first_done.await.map_err(failure)?;
                tokio::time::sleep(Duration::from_secs(4)).await;
                Ok(())
            }));
            effects.tasks.push(tokio::spawn(async move {
                tokio::time::sleep(Duration::from_secs(4)).await;
                first_finished
                    .send(())
                    .map_err(|_| "receiver dropped".to_owned())?;
                Ok(())
            }));
        }
        let started = tokio::time::Instant::now();
        assert!(
            resources
                .cleanup()
                .await
                .unwrap_err()
                .contains("effect cleanup timed out")
        );
        assert_eq!(started.elapsed(), CLEANUP_WAIT);
        assert_eq!(resources.draining_effects.len(), 1);
        assert!(fixture.0.join("state/data").is_dir());
        resources.cleanup().await.unwrap();
        assert!(!fixture.0.join("state").exists());
    }

    #[tokio::test]
    async fn registered_effect_failure_retains_state_on_retry() {
        let fixture = Fixture::new();
        let (ready, _receiver) = mpsc::channel(1);
        let mut host = fixture.host(unused_factory(), ready);
        let resources = host.resources().unwrap();
        resources
            .effects
            .lock()
            .unwrap()
            .tasks
            .push(tokio::spawn(async { Err("effect failed".to_owned()) }));
        assert!(
            resources
                .cleanup()
                .await
                .unwrap_err()
                .contains("effect drain failed")
        );
        assert!(
            resources
                .cleanup()
                .await
                .unwrap_err()
                .contains("effect drain failed")
        );
        assert!(fixture.0.join("state/data").is_dir());
    }

    #[tokio::test]
    async fn failed_listener_wait_retains_state_during_cleanup() {
        let fixture = Fixture::new();
        let (ready, _receiver) = mpsc::channel(1);
        let mut host = fixture.host(unused_factory(), ready);
        host.resources().unwrap().server = Some(tokio::spawn(async {
            Err(io::Error::other("listener failed"))
        }));
        assert!(host.wait_for_gateway_stop().await.is_err());
        assert!(host.cancel_cleanup().await.is_err());
        assert!(fixture.0.join("state/data").is_dir());
    }

    #[tokio::test]
    async fn failed_listener_drain_never_removes_state_on_retry() {
        let fixture = Fixture::new();
        let (ready, _receiver) = mpsc::channel(1);
        let mut host = fixture.host(unused_factory(), ready);
        let resources = host.resources().unwrap();
        resources.server = Some(tokio::spawn(async {
            Err(io::Error::new(io::ErrorKind::TimedOut, "drain failed"))
        }));
        assert!(resources.cleanup().await.is_err());
        assert!(fixture.0.join("state/data").is_dir());
        assert!(resources.cleanup().await.is_err());
        assert!(fixture.0.join("state/data").is_dir());
    }

    #[tokio::test]
    async fn real_preparation_reopens_settings_signs_token_and_stops_listener() {
        let fixture = Fixture::new();
        let (captured, result) = oneshot::channel();
        let (effect_stopped, stopped) = oneshot::channel();
        let (ready, mut readiness) = mpsc::channel(1);
        let factory: GatewayFactory = Box::new(move |prepared| {
            Box::pin(async move {
                assert_eq!(prepared.jwt_secret(), SECRET);
                let mut shutdown = prepared.shutdown_signal();
                prepared
                    .spawn_effect(async move {
                        shutdown.wait_for(|value| *value).await.map_err(failure)?;
                        effect_stopped
                            .send(())
                            .map_err(|_| "effect observer dropped".to_owned())?;
                        Ok(())
                    })
                    .unwrap();
                let settings = prepared
                    .database_worker()
                    .run(|db| {
                        let user = UserService::new(db)
                            .find_by_username("evaluation")?
                            .expect("evaluation user");
                        let settings = UserService::new(db).get_settings(&user.id)?;
                        Ok((user.id, settings))
                    })
                    .await
                    .unwrap();
                captured.send(settings).unwrap();
                Ok(listener().await)
            })
        });
        let mut host = fixture.host(factory, ready);
        let (state, db) = fixture.labels();
        let (_cancel, signal) = watch::channel(false);
        bootstrap_supervised(&mut host,
            r#"{"api_keys":{"fixture":"key"},"disabled_tools":["terminal"],"jait_backend":"openai","selected_model":null,"reasoning_effort":"high","ignored":"x"}"#,
            &state, &db, SECRET, signal).await.unwrap();
        let (user, settings) = result.await.unwrap();
        assert_eq!(settings.api_keys.get("fixture").unwrap(), "key");
        assert_eq!(settings.disabled_tools, ["terminal"]);
        assert_eq!(settings.selected_model, None);
        assert_eq!(settings.reasoning_effort.as_deref(), Some("high"));
        let ReadyLine::Ready(info) = parse_ready_line(&readiness.recv().await.unwrap()) else {
            panic!()
        };
        assert_eq!(
            http_auth::verify_auth_token(&info.token, SECRET)
                .unwrap()
                .id,
            user
        );
        assert!(http_auth::verify_auth_token(&info.token, "different-secret").is_none());
        let address: SocketAddr = format!("127.0.0.1:{}", info.port).parse().unwrap();
        let response = reqwest::Client::builder()
            .no_proxy()
            .build()
            .unwrap()
            .get(format!("http://{address}/health"))
            .send()
            .await
            .unwrap();
        assert!(response.status().is_success());
        drop(response);
        host.cancel_cleanup().await.unwrap();
        stopped.await.unwrap();
        host.cancel_cleanup().await.unwrap();
        assert!(!Path::new(&state).exists());
        assert_port_released(address);
    }

    #[tokio::test]
    async fn cancellation_joins_inflight_database_before_directory_removal() {
        let fixture = Fixture::new();
        let (ready, _receiver) = mpsc::channel(1);
        let mut host = fixture.host(unused_factory(), ready);
        let (state, db) = fixture.labels();
        host.open_database(Path::new(&db)).await.unwrap();
        let (entered, entry) = oneshot::channel();
        let (release, released) = std::sync::mpsc::sync_channel(1);
        {
            let operation = host.resources().unwrap().database_operation(move |db| {
                entered.send(()).unwrap();
                released.recv_timeout(Duration::from_secs(3)).unwrap();
                db.as_ref()
                    .unwrap()
                    .connection()
                    .execute_batch("CREATE TABLE completed (id);")
                    .unwrap();
                Ok(None)
            });
            tokio::pin!(operation);
            tokio::select! { result = &mut operation => panic!("unexpected completion: {result:?}"), _ = entry => {} }
            // Drop the waiter while its blocking operation still owns SQLite.
        }
        assert!(Path::new(&db).exists());
        let unblock = tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(25)).await;
            release.send(()).unwrap();
        });
        host.cancel_cleanup().await.unwrap();
        unblock.await.unwrap();
        assert!(!Path::new(&state).exists());
    }

    #[tokio::test]
    async fn cancellation_during_factory_startup_releases_bound_listener() {
        let fixture = Fixture::new();
        let (bound, address) = oneshot::channel();
        let stopped = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let rejected_ran = Arc::new(std::sync::atomic::AtomicBool::new(false));
        let factory_stopped = stopped.clone();
        let factory_rejected = rejected_ran.clone();
        let factory: GatewayFactory = Box::new(move |capability| {
            Box::pin(async move {
                for _ in 0..MAX_EFFECTS {
                    let mut shutdown = capability.shutdown_signal();
                    let stopped = factory_stopped.clone();
                    capability
                        .spawn_effect(async move {
                            shutdown.wait_for(|value| *value).await.map_err(failure)?;
                            stopped.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                            Ok(())
                        })
                        .unwrap();
                }
                let rejected = capability.spawn_effect(async move {
                    factory_rejected.store(true, std::sync::atomic::Ordering::SeqCst);
                    Ok(())
                });
                assert!(rejected.unwrap_err().contains("capacity exceeded"));
                let gateway = listener().await;
                bound.send(gateway.local_addr().unwrap()).unwrap();
                std::future::pending::<()>().await;
                drop(capability);
                Ok(gateway)
            })
        });
        let (ready, _receiver) = mpsc::channel(1);
        let mut host = fixture.host(factory, ready);
        let (state, db) = fixture.labels();
        let (cancel, signal) = watch::channel(false);
        let task = tokio::spawn(async move {
            let result = run_supervised(&mut host, "{}", &state, &db, SECRET, signal).await;
            (host, result)
        });
        // Guard only: the host may be starved while the rest of the suite runs
        // in parallel, so allow ample headroom before declaring a hang.
        let address = tokio::time::timeout(Duration::from_secs(60), address)
            .await
            .unwrap()
            .unwrap();
        cancel.send_replace(true);
        let (mut host, result) = task.await.unwrap();
        assert!(result.unwrap_err().contains("startup drain unconfirmed"));
        assert!(
            host.cancel_cleanup()
                .await
                .unwrap_err()
                .contains("startup drain unconfirmed")
        );
        assert!(fixture.0.join("state").exists());
        assert_eq!(
            stopped.load(std::sync::atomic::Ordering::SeqCst),
            MAX_EFFECTS
        );
        assert!(!rejected_ran.load(std::sync::atomic::Ordering::SeqCst));
        assert_port_released(address);
    }

    #[tokio::test]
    async fn failed_factory_startup_retains_state_on_cleanup_retry() {
        let fixture = Fixture::new();
        let factory: GatewayFactory =
            Box::new(|_| Box::pin(async { Err("factory failed".into()) }));
        let (ready, _receiver) = mpsc::channel(1);
        let mut host = fixture.host(factory, ready);
        let (state, db) = fixture.labels();
        let (_cancel, signal) = watch::channel(false);
        let error = bootstrap_supervised(&mut host, "{}", &state, &db, SECRET, signal)
            .await
            .unwrap_err();
        assert!(error.contains("factory failed"));
        assert!(error.contains("startup drain unconfirmed"));
        assert!(host.cancel_cleanup().await.is_err());
        assert!(fixture.0.join("state/data").is_dir());
    }

    #[tokio::test]
    async fn failed_ready_publication_stops_listener_and_removes_state() {
        let fixture = Fixture::new();
        let (bound, address) = oneshot::channel();
        let factory: GatewayFactory = Box::new(move |_| {
            Box::pin(async move {
                let gateway = listener().await;
                bound.send(gateway.local_addr().unwrap()).unwrap();
                Ok(gateway)
            })
        });
        let (ready, receiver) = mpsc::channel(1);
        drop(receiver);
        let mut host = fixture.host(factory, ready);
        let (state, db) = fixture.labels();
        let (_cancel, signal) = watch::channel(false);
        assert_eq!(
            bootstrap_supervised(&mut host, "{}", &state, &db, SECRET, signal)
                .await
                .unwrap_err(),
            "Evaluation readiness receiver closed"
        );
        assert!(!Path::new(&state).exists());
        assert_port_released(address.await.unwrap());
    }

    #[tokio::test]
    async fn cleanup_refuses_replaced_directory_and_preserves_external_data() {
        let fixture = Fixture::new();
        let (ready, _receiver) = mpsc::channel(1);
        let mut host = fixture.host(unused_factory(), ready);
        let (_, db) = fixture.labels();
        host.open_database(Path::new(&db)).await.unwrap();
        fs::rename(fixture.0.join("state"), fixture.0.join("held")).unwrap();
        fs::create_dir_all(fixture.0.join("external/data")).unwrap();
        let sentinel = fixture.0.join("external/data/jait.db");
        fs::write(&sentinel, b"untouched").unwrap();
        symlink(fixture.0.join("external"), fixture.0.join("state")).unwrap();
        assert!(
            host.cancel_cleanup()
                .await
                .unwrap_err()
                .contains("replaced")
        );
        assert_eq!(fs::read(&sentinel).unwrap(), b"untouched");
        assert!(fixture.0.join("held/data/jait.db").exists());
        fs::remove_file(fixture.0.join("state")).unwrap();
        fs::rename(fixture.0.join("held"), fixture.0.join("state")).unwrap();
        host.cancel_cleanup().await.unwrap();
    }

    #[tokio::test]
    async fn cleanup_does_not_recursively_delete_unknown_files_and_can_retry() {
        let fixture = Fixture::new();
        let (ready, _receiver) = mpsc::channel(1);
        let mut host = fixture.host(unused_factory(), ready);
        let marker = fixture.0.join("state/data/unknown");
        fs::write(&marker, b"keep").unwrap();
        assert!(host.cancel_cleanup().await.is_err());
        assert_eq!(fs::read(&marker).unwrap(), b"keep");
        fs::remove_file(&marker).unwrap();
        host.cancel_cleanup().await.unwrap();
        assert!(!fixture.0.join("state").exists());
    }

    #[tokio::test]
    async fn reopen_rejects_missing_symlink_and_fifo_without_blocking() {
        let fixture = Fixture::new();
        let (ready, _receiver) = mpsc::channel(1);
        let mut host = fixture.host(unused_factory(), ready);
        let directory = &host.resources().unwrap().state.as_ref().unwrap().directory;
        assert!(EvaluationDatabase::reopen(clone_directory(directory).unwrap()).is_err());
        let target = fixture.0.join("target");
        fs::write(&target, b"keep").unwrap();
        let db = fixture.0.join("state/data/jait.db");
        symlink(&target, &db).unwrap();
        assert!(EvaluationDatabase::reopen(clone_directory(directory).unwrap()).is_err());
        assert_eq!(fs::read(&target).unwrap(), b"keep");
        fs::remove_file(&db).unwrap();
        let fifo = CString::new(db.to_str().unwrap()).unwrap();
        assert_eq!(unsafe { libc::mkfifo(fifo.as_ptr(), 0o600) }, 0);
        assert!(EvaluationDatabase::reopen(clone_directory(directory).unwrap()).is_err());
        host.cancel_cleanup().await.unwrap();
    }
    #[tokio::test]
    async fn cleanup_can_retry_after_data_removed_but_state_still_nonempty() {
        let fixture = Fixture::new();
        let (ready, _receiver) = mpsc::channel(1);
        let mut host = fixture.host(unused_factory(), ready);
        let marker = fixture.0.join("state/unknown");
        fs::write(&marker, b"keep").unwrap();
        assert!(host.cancel_cleanup().await.is_err());
        assert_eq!(fs::read(&marker).unwrap(), b"keep");
        assert!(!fixture.0.join("state/data").exists());
        fs::remove_file(&marker).unwrap();
        host.cancel_cleanup().await.unwrap();
        assert!(!fixture.0.join("state").exists());
    }

    #[tokio::test]
    async fn cleanup_retains_worker_and_directory_until_started_job_drains() {
        let fixture = Fixture::new();
        let (worker_tx, worker_rx) = oneshot::channel();
        let factory: GatewayFactory = Box::new(move |prepared| {
            Box::pin(async move {
                worker_tx.send(prepared.database_worker()).ok().unwrap();
                Ok(listener().await)
            })
        });
        let (ready, _receiver) = mpsc::channel(1);
        let mut host = fixture.host(factory, ready);
        let (state, db) = fixture.labels();
        let (_cancel, signal) = watch::channel(false);
        bootstrap_supervised(&mut host, "{}", &state, &db, SECRET, signal)
            .await
            .unwrap();
        let worker = worker_rx.await.unwrap();
        let (entered, entry) = oneshot::channel();
        let (release, released) = std::sync::mpsc::sync_channel(1);
        let job = tokio::spawn(async move {
            worker
                .run(move |db| {
                    entered.send(()).unwrap();
                    released.recv_timeout(Duration::from_secs(30)).unwrap();
                    db.execute_batch("CREATE TABLE drained_job (id)")?;
                    Ok(())
                })
                .await
        });
        entry.await.unwrap();
        job.abort();
        let cleanup = host.cancel_cleanup().await;
        assert!(cleanup.unwrap_err().contains("worker drain timed out"));
        assert!(Path::new(&db).exists());
        assert!(host.resources().unwrap().worker.is_some());
        release.send(()).unwrap();
        host.cancel_cleanup().await.unwrap();
        assert!(!Path::new(&state).exists());
    }

    #[tokio::test(start_paused = true)]
    async fn cleanup_timeout_retains_inflight_database_and_authority_for_retry() {
        let fixture = Fixture::new();
        let (ready, _receiver) = mpsc::channel(1);
        let mut host = fixture.host(unused_factory(), ready);
        let (_, db) = fixture.labels();
        host.open_database(Path::new(&db)).await.unwrap();
        let (entered, entry) = oneshot::channel();
        let (release, released) = std::sync::mpsc::sync_channel(1);
        {
            let operation = host.resources().unwrap().database_operation(move |_| {
                entered.send(()).unwrap();
                released.recv_timeout(Duration::from_secs(30)).unwrap();
                Ok(None)
            });
            tokio::pin!(operation);
            tokio::select! { _ = &mut operation => panic!("operation must remain in flight"), _ = entry => {} }
        }
        let (cleanup, ()) = tokio::join!(host.cancel_cleanup(), async {
            tokio::task::yield_now().await;
            tokio::time::advance(CLEANUP_WAIT + Duration::from_secs(1)).await;
        });
        assert!(cleanup.unwrap_err().contains("timed out"));
        assert!(Path::new(&db).exists());
        assert!(host.resources().unwrap().database_task.is_some());
        release.send(()).unwrap();
        tokio::time::resume();
        host.cancel_cleanup().await.unwrap();
        assert!(!fixture.0.join("state").exists());
    }
}
