//! Explicit Linux evaluation host. No ambient database, environment discovery,
//! default provider/tool authority, or CLI activation. The trusted runtime factory
//! must compose its own authenticated routes and supervise any effects it starts.
use super::{
    HostFuture, IsolatedChildHost,
    database_authority::EvaluationDatabase,
    private_directory::{self, PrivateDirectory},
};
use crate::{
    db,
    runtime::Gateway,
    security::http_auth::{self, AuthUser},
    services::users::{UserService, UserSettingsPatch},
};
use serde_json::Value;
use std::{
    ffi::CString,
    fs::File,
    io,
    os::{fd::AsRawFd, unix::fs::MetadataExt},
    path::{Path, PathBuf},
    time::Duration,
};
use tokio::{
    sync::{mpsc, watch},
    task::JoinHandle,
};

const CLEANUP_WAIT: Duration = Duration::from_secs(6);
const MAX_SETTINGS_BYTES: usize = 1024 * 1024;
type DbTask = JoinHandle<(Option<EvaluationDatabase>, Result<Option<String>, String>)>;
type RemovalTask = JoinHandle<(OwnedState, Result<(), String>)>;

/// Capability handed to the explicitly selected runtime factory after the
/// preparation connection has closed. Reopening stays on the owned directory.
/// Retain the returned database owner for the entire lifetime of all SQL work;
/// transferring just its connection or reopening an ambient path loses authority.
pub struct PreparedEvaluation {
    directory: PrivateDirectory,
    secret: String,
}
impl PreparedEvaluation {
    pub fn jwt_secret(&self) -> &str {
        &self.secret
    }
    /// Synchronous SQLite work belongs on a supervised blocking lane.
    pub fn open_database(self) -> Result<EvaluationDatabase, String> {
        EvaluationDatabase::reopen(self.directory)
    }
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
    state: Option<OwnedState>,
    db_path: PathBuf,
    secret: String,
    database: Option<EvaluationDatabase>,
    database_task: Option<DbTask>,
    factory: Option<GatewayFactory>,
    starting: Option<JoinHandle<Result<Gateway, String>>>,
    server: Option<JoinHandle<io::Result<()>>>,
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
        let (shutdown, _) = watch::channel(false);
        Ok(Self {
            resources: Some(Resources {
                state: Some(OwnedState {
                    parent,
                    name: name_c,
                    directory,
                    data_removed: false,
                }),
                db_path: parent_label.join(name).join("data/jait.db"),
                secret,
                database: None,
                database_task: None,
                factory: Some(factory),
                starting: None,
                server: None,
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
        if let Some(task) = self.starting.as_mut() {
            task.abort();
            // If startup won the race, dropping its Gateway closes the listener.
            let _ = tokio::time::timeout(CLEANUP_WAIT, &mut *task)
                .await
                .map_err(|_| "Evaluation runtime startup cleanup timed out; state retained")?;
            self.starting = None;
        }
        self.shutdown.send_replace(true);
        if let Some(task) = self.server.as_mut() {
            if tokio::time::timeout(CLEANUP_WAIT, &mut *task)
                .await
                .is_err()
            {
                task.abort();
                let _ = tokio::time::timeout(CLEANUP_WAIT, &mut *task)
                    .await
                    .map_err(|_| "Evaluation listener cleanup timed out; state retained")?;
            }
            self.server = None;
        }
        self.factory = None;
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
            let prepared = PreparedEvaluation {
                directory,
                secret: r.secret.clone(),
            };
            r.starting = Some(tokio::spawn(async move { factory(prepared).await }));
            let result = r.starting.as_mut().expect("startup owned").await;
            r.starting = None;
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
            result
                .map_err(|_| "Evaluation listener worker failed")?
                .map_err(failure)
        })
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

    #[tokio::test]
    async fn real_preparation_reopens_settings_signs_token_and_stops_listener() {
        let fixture = Fixture::new();
        let (captured, result) = oneshot::channel();
        let (ready, mut readiness) = mpsc::channel(1);
        let factory: GatewayFactory = Box::new(move |prepared| {
            Box::pin(async move {
                assert_eq!(prepared.jwt_secret(), SECRET);
                let settings = tokio::task::spawn_blocking(move || {
                    let db = prepared.open_database().unwrap();
                    let user = UserService::new(db.connection())
                        .find_by_username("evaluation")
                        .unwrap()
                        .unwrap();
                    let settings = UserService::new(db.connection())
                        .get_settings(&user.id)
                        .unwrap();
                    (user.id, settings)
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
        let factory: GatewayFactory = Box::new(move |capability| {
            Box::pin(async move {
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
        let address = tokio::time::timeout(Duration::from_secs(10), address)
            .await
            .unwrap()
            .unwrap();
        cancel.send_replace(true);
        let (mut host, result) = task.await.unwrap();
        assert_eq!(result.unwrap_err(), "Evaluation cancelled");
        host.cancel_cleanup().await.unwrap();
        assert!(!fixture.0.join("state").exists());
        assert_port_released(address);
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
