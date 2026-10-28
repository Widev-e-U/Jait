//! Isolated evaluation child bootstrap. Host effects are explicit so that
//! database ownership, token signing, and server startup remain supervised.
use super::isolated_gateway::{HostFuture, ready_line, validate_isolation};
use serde_json::{Map, Value};
use std::path::Path;
use tokio::sync::watch;

/// The host owns a single database connection between open and close.
pub trait IsolatedChildHost: Send {
    fn open_database<'a>(&'a mut self, path: &'a Path) -> HostFuture<'a, Result<(), String>>;
    fn migrate_database(&mut self) -> HostFuture<'_, Result<(), String>>;
    fn create_evaluation_user(&mut self) -> HostFuture<'_, Result<String, String>>;
    fn update_settings<'a>(
        &'a mut self,
        user: &'a str,
        settings: Value,
    ) -> HostFuture<'a, Result<(), String>>;
    fn sign_token<'a>(
        &'a mut self,
        user: &'a str,
        secret: &'a str,
    ) -> HostFuture<'a, Result<String, String>>;
    fn close_database(&mut self) -> HostFuture<'_, Result<(), String>>;
    /// Starts the evaluation gateway and resolves once its listener is ready.
    fn start_evaluation_gateway(&mut self) -> HostFuture<'_, Result<u32, String>>;
    fn emit_ready<'a>(&'a mut self, line: &'a str) -> HostFuture<'a, Result<(), String>>;
    /// Idempotently close any database and stop any listener owned by this host.
    /// Every operation above must leave its effects accessible to this method when
    /// its future is dropped. Implementations must supervise spawned work as well.
    fn cancel_cleanup(&mut self) -> HostFuture<'_, Result<(), String>>;
    /// Resolve when the listener exits, including an error if it failed.
    /// Dropping this wait must not detach or stop the listener.
    fn wait_for_gateway_stop(&mut self) -> HostFuture<'_, Result<(), String>>;
}

/// Project source settings to the user settings keys used by the child.
fn user_settings(settings: &Value) -> Value {
    let mut out = Map::new();
    for (source, dest) in [
        ("api_keys", "apiKeys"),
        ("disabled_tools", "disabledTools"),
        ("jait_backend", "jaitBackend"),
        ("selected_model", "selectedModel"),
        ("reasoning_effort", "reasoningEffort"),
    ] {
        if let Some(value) = settings.get(source) {
            out.insert(dest.to_owned(), value.clone());
        }
    }
    Value::Object(out)
}

/// Bootstrap the private database, then start the server and publish readiness.
/// The database is closed even if preparation fails; the original failure wins
/// if cleanup also fails. No listener is started when preparation fails.
pub async fn bootstrap(
    host: &mut dyn IsolatedChildHost,
    input: &str,
    state_dir: &str,
    db_path: &str,
    jwt_secret: &str,
) -> Result<(), String> {
    let settings: Value = serde_json::from_str(input).map_err(|error| error.to_string())?;
    if settings.is_null() {
        return Err("Invalid evaluation settings".into());
    }
    let db_path = validate_isolation(state_dir, db_path)?;
    host.open_database(&db_path).await?;
    let prepared = async {
        host.migrate_database().await?;
        let user = host.create_evaluation_user().await?;
        host.update_settings(&user, user_settings(&settings))
            .await?;
        host.sign_token(&user, jwt_secret).await
    }
    .await;
    let closed = host.close_database().await;
    let token = prepared?;
    closed?;
    let port = host.start_evaluation_gateway().await?;
    host.emit_ready(&ready_line(port, &token)).await
}

async fn wait_for_cancel(signal: &mut watch::Receiver<bool>) {
    loop {
        if *signal.borrow_and_update() {
            return;
        }
        if signal.changed().await.is_err() {
            // A closed, false channel does not imply cancellation.
            std::future::pending::<()>().await;
        }
    }
}

/// Run bootstrap under an explicit cancellation signal. Dropping an individual
/// host operation on cancellation is safe only when the host implements the
/// cancellation contract on `cancel_cleanup`. The caller must retain this future
/// until completion; dropping it cannot perform asynchronous cleanup.
pub async fn bootstrap_supervised(
    host: &mut dyn IsolatedChildHost,
    input: &str,
    state_dir: &str,
    db_path: &str,
    jwt_secret: &str,
    mut cancelled: watch::Receiver<bool>,
) -> Result<(), String> {
    let result = tokio::select! {
        biased;
        _ = wait_for_cancel(&mut cancelled) => None,
        result = bootstrap(host, input, state_dir, db_path, jwt_secret) => Some(result),
    };
    match result {
        Some(Ok(())) => Ok(()),
        Some(Err(error)) => {
            // This also stops a listener if readiness publication failed.
            match host.cancel_cleanup().await {
                Ok(()) => Err(error),
                Err(cleanup) => Err(format!("{error}; cleanup failed: {cleanup}")),
            }
        }
        None => {
            host.cancel_cleanup()
                .await
                .map_err(|error| format!("Evaluation cancelled; cleanup failed: {error}"))?;
            Err("Evaluation cancelled".into())
        }
    }
}

/// Own the full startup and listener lifetime. The caller must await this
/// future, including cleanup; abrupt task abortion cannot run async cleanup.
pub async fn run_supervised(
    host: &mut dyn IsolatedChildHost,
    input: &str,
    state_dir: &str,
    db_path: &str,
    jwt_secret: &str,
    mut cancelled: watch::Receiver<bool>,
) -> Result<(), String> {
    bootstrap_supervised(
        host,
        input,
        state_dir,
        db_path,
        jwt_secret,
        cancelled.clone(),
    )
    .await?;
    let stopped = tokio::select! {
        biased;
        _ = wait_for_cancel(&mut cancelled) => None,
        result = host.wait_for_gateway_stop() => Some(result),
    };
    let result = match stopped {
        None => Ok(()),
        Some(Ok(())) => Err("Evaluation gateway stopped unexpectedly".into()),
        Some(Err(error)) => Err(error),
    };
    match (result, host.cancel_cleanup().await) {
        (Ok(()), cleanup) => cleanup,
        (Err(error), Ok(())) => Err(error),
        (Err(error), Err(cleanup)) => Err(format!("{error}; cleanup failed: {cleanup}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[derive(Default)]
    struct Host {
        calls: Vec<String>,
        fail: Option<&'static str>,
        settings: Option<Value>,
    }
    impl Host {
        fn step(&mut self, name: &'static str) -> Result<(), String> {
            self.calls.push(name.into());
            if self.fail == Some(name) {
                Err(name.into())
            } else {
                Ok(())
            }
        }
    }
    impl IsolatedChildHost for Host {
        fn open_database<'a>(&'a mut self, _: &'a Path) -> HostFuture<'a, Result<(), String>> {
            Box::pin(async move { self.step("open") })
        }
        fn migrate_database(&mut self) -> HostFuture<'_, Result<(), String>> {
            Box::pin(async move {
                if self.fail == Some("pending_migrate") {
                    self.calls.push("migrate".into());
                    std::future::pending::<()>().await;
                }
                self.step("migrate")
            })
        }
        fn create_evaluation_user(&mut self) -> HostFuture<'_, Result<String, String>> {
            Box::pin(async move {
                self.step("user")?;
                Ok("id".into())
            })
        }
        fn update_settings<'a>(
            &'a mut self,
            _: &'a str,
            settings: Value,
        ) -> HostFuture<'a, Result<(), String>> {
            Box::pin(async move {
                self.settings = Some(settings);
                self.step("settings")
            })
        }
        fn sign_token<'a>(
            &'a mut self,
            _: &'a str,
            _: &'a str,
        ) -> HostFuture<'a, Result<String, String>> {
            Box::pin(async move {
                self.step("sign")?;
                Ok("token".into())
            })
        }
        fn close_database(&mut self) -> HostFuture<'_, Result<(), String>> {
            Box::pin(async move { self.step("close") })
        }
        fn start_evaluation_gateway(&mut self) -> HostFuture<'_, Result<u32, String>> {
            Box::pin(async move {
                self.step("start")?;
                Ok(1234)
            })
        }
        fn emit_ready<'a>(&'a mut self, line: &'a str) -> HostFuture<'a, Result<(), String>> {
            Box::pin(async move {
                self.step("ready")?;
                assert_eq!(line, ready_line(1234, "token"));
                Ok(())
            })
        }
        fn cancel_cleanup(&mut self) -> HostFuture<'_, Result<(), String>> {
            Box::pin(async move { self.step("cleanup") })
        }
        fn wait_for_gateway_stop(&mut self) -> HostFuture<'_, Result<(), String>> {
            Box::pin(async move {
                self.calls.push("wait".into());
                if self.fail == Some("listener") {
                    return Err("listener".into());
                }
                std::future::pending().await
            })
        }
    }
    #[tokio::test]
    async fn bootstraps_in_order_and_only_passes_user_settings() {
        let mut host = Host::default();
        bootstrap(
            &mut host,
            r#"{"api_keys":{"x":"secret"},"jait_backend":"test","ignored":42}"#,
            "/state",
            "/state/data/jait.db",
            "secret",
        )
        .await
        .unwrap();
        assert_eq!(
            host.calls,
            [
                "open", "migrate", "user", "settings", "sign", "close", "start", "ready"
            ]
        );
        assert_eq!(
            host.settings,
            Some(json!({"apiKeys":{"x":"secret"},"jaitBackend":"test"}))
        );
    }
    #[tokio::test]
    async fn preserves_null_and_untyped_settings_values() {
        let mut host = Host::default();
        bootstrap(
            &mut host,
            r#"{"api_keys":null,"jait_backend":42,"selected_model":false}"#,
            "/state",
            "/state/data/jait.db",
            "secret",
        )
        .await
        .unwrap();
        assert_eq!(
            host.settings,
            Some(json!({"apiKeys":null,"jaitBackend":42,"selectedModel":false}))
        );
    }
    #[tokio::test]
    async fn isolation_guard_precedes_database_effects() {
        let mut host = Host::default();
        assert!(
            bootstrap(&mut host, "{}", "/state", "/other/data/jait.db", "secret")
                .await
                .is_err()
        );
        assert!(host.calls.is_empty());
    }
    #[tokio::test]
    async fn preparation_failure_closes_database_without_starting_server() {
        let mut host = Host {
            fail: Some("settings"),
            ..Default::default()
        };
        assert_eq!(
            bootstrap(&mut host, "{}", "/state", "/state/data/jait.db", "secret")
                .await
                .unwrap_err(),
            "settings"
        );
        assert_eq!(host.calls, ["open", "migrate", "user", "settings", "close"]);
    }
    #[tokio::test]
    async fn pre_cancelled_bootstrap_runs_cleanup_without_opening_database() {
        let mut host = Host::default();
        let (_tx, rx) = watch::channel(true);
        assert_eq!(
            bootstrap_supervised(
                &mut host,
                "{}",
                "/state",
                "/state/data/jait.db",
                "secret",
                rx
            )
            .await
            .unwrap_err(),
            "Evaluation cancelled"
        );
        assert_eq!(host.calls, ["cleanup"]);
    }
    #[tokio::test]
    async fn closed_false_signal_does_not_cancel_bootstrap() {
        let mut host = Host::default();
        let (tx, rx) = watch::channel(false);
        drop(tx);
        bootstrap_supervised(
            &mut host,
            "{}",
            "/state",
            "/state/data/jait.db",
            "secret",
            rx,
        )
        .await
        .unwrap();
        assert_eq!(host.calls.last().unwrap(), "ready");
    }

    #[tokio::test]
    async fn cancellation_during_preparation_runs_cleanup() {
        let mut host = Host {
            fail: Some("pending_migrate"),
            ..Default::default()
        };
        let (tx, rx) = watch::channel(false);
        let cancel = async {
            tokio::task::yield_now().await;
            tx.send(true).unwrap();
        };
        let (result, ()) = tokio::join!(
            bootstrap_supervised(
                &mut host,
                "{}",
                "/state",
                "/state/data/jait.db",
                "secret",
                rx
            ),
            cancel
        );
        assert_eq!(result.unwrap_err(), "Evaluation cancelled");
        assert_eq!(host.calls, ["open", "migrate", "cleanup"]);
    }

    #[tokio::test]
    async fn readiness_failure_stops_owned_listener() {
        let mut host = Host {
            fail: Some("ready"),
            ..Default::default()
        };
        let (_tx, rx) = watch::channel(false);
        assert_eq!(
            bootstrap_supervised(
                &mut host,
                "{}",
                "/state",
                "/state/data/jait.db",
                "secret",
                rx
            )
            .await
            .unwrap_err(),
            "ready"
        );
        assert_eq!(
            host.calls,
            [
                "open", "migrate", "user", "settings", "sign", "close", "start", "ready", "cleanup"
            ]
        );
    }

    #[tokio::test]
    async fn cancellation_after_readiness_stops_listener() {
        let mut host = Host::default();
        let (tx, rx) = watch::channel(false);
        let cancel = async {
            tokio::task::yield_now().await;
            tx.send(true).unwrap();
        };
        let (result, ()) = tokio::join!(
            run_supervised(
                &mut host,
                "{}",
                "/state",
                "/state/data/jait.db",
                "secret",
                rx
            ),
            cancel
        );
        result.unwrap();
        assert_eq!(host.calls.last().unwrap(), "cleanup");
        assert!(host.calls.contains(&"wait".to_string()));
    }
    #[tokio::test]
    async fn listener_failure_is_reported_and_cleaned_up() {
        let mut host = Host {
            fail: Some("listener"),
            ..Default::default()
        };
        let (_tx, rx) = watch::channel(false);
        assert_eq!(
            run_supervised(
                &mut host,
                "{}",
                "/state",
                "/state/data/jait.db",
                "secret",
                rx
            )
            .await
            .unwrap_err(),
            "listener"
        );
        assert_eq!(&host.calls[host.calls.len() - 2..], ["wait", "cleanup"]);
    }
}

/// Linux-only building block for creating an evaluation state directory under
/// a caller-owned directory handle. This is not an SQLite path authority: a
/// future host must retain these handles and arrange race-resistant database
/// opening and cleanup. Same-UID processes are within the trust boundary.
#[cfg(target_os = "linux")]
pub mod private_directory {
    use std::{
        ffi::CString,
        fs::File,
        io,
        os::fd::{AsRawFd, FromRawFd},
        os::unix::fs::MetadataExt,
    };

    pub struct PrivateDirectory {
        pub(super) state: File,
        pub(super) data: File,
    }

    /// The parent must already be opened and exclusively writable by this UID.
    /// A single fresh name is created atomically; existing entries are rejected.
    pub fn create_in(parent: &File, name: &str) -> io::Result<PrivateDirectory> {
        if name.is_empty() || name == "." || name == ".." || name.contains('/') {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "invalid state directory name",
            ));
        }
        let name = CString::new(name).map_err(|_| {
            io::Error::new(io::ErrorKind::InvalidInput, "invalid state directory name")
        })?;
        let meta = parent.metadata()?;
        if !meta.is_dir()
            || meta.uid() != unsafe { libc::geteuid() }
            || meta.mode() & 0o077 != 0
            || meta.mode() & 0o700 != 0o700
        {
            return Err(io::Error::new(
                io::ErrorKind::PermissionDenied,
                "parent must be private and owned by the current user",
            ));
        }
        let parent_fd = parent.as_raw_fd();
        // mkdirat is atomic and fails if an entry, including a symlink, exists.
        if unsafe { libc::mkdirat(parent_fd, name.as_ptr(), 0o700) } != 0 {
            return Err(io::Error::last_os_error());
        }
        let result = (|| {
            let state = open_dir(parent_fd, &name)?;
            verify_private(&state)?;
            let data_name = c"data";
            if unsafe { libc::mkdirat(state.as_raw_fd(), data_name.as_ptr(), 0o700) } != 0 {
                return Err(io::Error::last_os_error());
            }
            let data = match open_dir(state.as_raw_fd(), data_name) {
                Ok(data) => data,
                Err(error) => {
                    unsafe {
                        libc::unlinkat(state.as_raw_fd(), data_name.as_ptr(), libc::AT_REMOVEDIR);
                    }
                    return Err(error);
                }
            };
            if let Err(error) = verify_private(&data) {
                unsafe {
                    libc::unlinkat(state.as_raw_fd(), data_name.as_ptr(), libc::AT_REMOVEDIR);
                }
                return Err(error);
            }
            Ok(PrivateDirectory { state, data })
        })();
        if result.is_err() {
            unsafe {
                libc::unlinkat(parent_fd, name.as_ptr(), libc::AT_REMOVEDIR);
            }
        }
        result
    }

    fn open_dir(parent: libc::c_int, name: &std::ffi::CStr) -> io::Result<File> {
        let fd = unsafe {
            libc::openat(
                parent,
                name.as_ptr(),
                libc::O_RDONLY | libc::O_DIRECTORY | libc::O_NOFOLLOW | libc::O_CLOEXEC,
            )
        };
        if fd < 0 {
            return Err(io::Error::last_os_error());
        }
        Ok(unsafe { File::from_raw_fd(fd) })
    }
    fn verify_private(file: &File) -> io::Result<()> {
        let meta = file.metadata()?;
        if !meta.is_dir()
            || meta.uid() != unsafe { libc::geteuid() }
            || meta.mode() & 0o777 != 0o700
        {
            return Err(io::Error::new(
                io::ErrorKind::PermissionDenied,
                "state directory is not private",
            ));
        }
        Ok(())
    }
}

#[cfg(all(test, target_os = "linux"))]
mod private_directory_tests {
    use super::private_directory::create_in;
    use std::{
        fs::{self, File},
        os::unix::fs::{PermissionsExt, symlink},
        path::PathBuf,
    };

    struct Fixture(PathBuf);
    impl Fixture {
        fn new() -> Self {
            let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../.jait/artifacts");
            fs::create_dir_all(&root).unwrap();
            let path = root.join(format!("eval-private-{}", crate::db::identifiers::uuidv7()));
            fs::create_dir(&path).unwrap();
            fs::set_permissions(&path, fs::Permissions::from_mode(0o700)).unwrap();
            Self(path)
        }
        fn parent(&self) -> File {
            File::open(&self.0).unwrap()
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            fs::remove_dir_all(&self.0).unwrap();
        }
    }

    #[test]
    fn creates_private_directories_and_rejects_existing_or_unsafe_names() {
        let fixture = Fixture::new();
        let parent = fixture.parent();
        let created = create_in(&parent, "state").unwrap();
        assert_eq!(
            created.state.metadata().unwrap().permissions().mode() & 0o777,
            0o700
        );
        assert_eq!(
            created.data.metadata().unwrap().permissions().mode() & 0o777,
            0o700
        );
        assert!(create_in(&parent, "state").is_err());
        for name in ["", ".", "..", "../escape", "a/b", "nul\0byte"] {
            assert!(create_in(&parent, name).is_err());
        }
    }
    #[test]
    fn rejects_symlink_collision_and_nonprivate_parent() {
        let fixture = Fixture::new();
        let parent = fixture.parent();
        symlink("/", fixture.0.join("state")).unwrap();
        assert!(create_in(&parent, "state").is_err());
        fs::set_permissions(&fixture.0, fs::Permissions::from_mode(0o777)).unwrap();
        assert_eq!(
            create_in(&parent, "other").err().unwrap().kind(),
            std::io::ErrorKind::PermissionDenied
        );
        assert!(!fixture.0.join("other").exists());
    }
}

#[cfg(target_os = "linux")]
#[path = "database_authority.rs"]
pub mod database_authority;

/// Concrete Linux host; CLI activation and runtime composition remain explicit.
#[cfg(target_os = "linux")]
#[path = "child_host.rs"]
pub mod host;
