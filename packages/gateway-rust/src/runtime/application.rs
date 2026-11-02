//! Opt-in persistent account/session composition for the migration runtime.
//! Chat is separately configured; no provider, credentials or tool is discovered.
use crate::{
    config::GatewayConfig,
    db,
    health::{HealthConfig, HealthSnapshot, HealthState},
    routes::{
        auth::AuthState,
        chat::{ChatFactory, ChatRoutes},
        sessions::SessionRoutes,
    },
    runtime::Gateway,
};
use axum::{Json, Router, extract::State, http::StatusCode, response::IntoResponse, routing::get};
use std::{
    fs::{File, OpenOptions},
    future::Future,
    net::SocketAddr,
    num::NonZeroU16,
    path::PathBuf,
    sync::{Arc, Mutex},
};

pub type ApplicationError = Box<dyn std::error::Error + Send + Sync>;

/// All state locations and credentials are explicit. Never discovers host .env or state.
pub struct ApplicationConfig {
    pub database_path: PathBuf,
    pub project_root: PathBuf,
    pub jwt_secret: String,
    pub cors_origin: String,
    pub health: Option<HealthConfig>,
}

impl ApplicationConfig {
    /// The default executable remains stateless. An invalid opt-in fails closed.
    /// Validate all fields before opening SQLite, including an explicit signing secret.
    pub fn from_lookup(
        lookup: impl Fn(&str) -> Option<String>,
    ) -> Result<Option<Self>, ApplicationError> {
        match lookup("JAIT_RUST_APPLICATION").as_deref() {
            None | Some("") | Some("0") => return Ok(None),
            Some("1") => {}
            _ => return Err("JAIT_RUST_APPLICATION must be 0 or 1".into()),
        }
        let config = Self {
            database_path: required_path(&lookup, "JAIT_RUST_DB")?,
            project_root: required_path(&lookup, "JAIT_RUST_PROJECT_ROOT")?,
            jwt_secret: lookup("JWT_SECRET")
                .map(|value| crate::text::js_trim(&value).to_owned())
                .filter(|value| !value.is_empty())
                .ok_or("JWT_SECRET is required for the Rust application")?,
            cors_origin: lookup("CORS_ORIGIN").unwrap_or_default(),
            // Provider activation is separate; do not imply configured model execution.
            health: None,
        };
        config.validate()?;
        Ok(Some(config))
    }

    fn validate(&self) -> Result<(), ApplicationError> {
        if !self.database_path.is_absolute() {
            return Err("JAIT_RUST_DB must be an absolute file path".into());
        }
        if !self.project_root.is_absolute() {
            return Err("JAIT_RUST_PROJECT_ROOT must be an absolute directory path".into());
        }
        if crate::text::js_trim(&self.jwt_secret).is_empty() {
            return Err("JWT_SECRET is required for the Rust application".into());
        }
        Ok(())
    }
}

fn required_path(
    lookup: &impl Fn(&str) -> Option<String>,
    key: &'static str,
) -> Result<PathBuf, ApplicationError> {
    let value = lookup(key).filter(|value| !value.is_empty()).ok_or(key)?;
    let path = PathBuf::from(value);
    if !path.is_absolute() {
        return Err(format!("{key} must be an absolute path").into());
    }
    Ok(path)
}

// Lock the database inode before opening SQLite or running migrations/recovery. Linux
// flock is independent of SQLite's byte-range locks and is released on process death.
// All participating gateways must honor this advisory lock; never unlink the database
// while a gateway is running. Other platforms fail closed until their locking is reviewed.
fn acquire_database_owner(path: &std::path::Path) -> Result<Arc<File>, ApplicationError> {
    #[cfg(not(target_os = "linux"))]
    {
        let _ = path;
        return Err("Rust gateway database ownership is supported only on Linux".into());
    }
    #[cfg(target_os = "linux")]
    {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let file = OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .open(path)?;
        if !file.metadata()?.is_file() {
            return Err("Gateway database must be a regular file".into());
        }
        file.try_lock()
            .map_err(|_| "Gateway database is already owned or cannot be locked")?;
        Ok(Arc::new(file))
    }
}

/// Account and session routes share one bounded SQLite worker and shutdown lifecycle.
// The lock remains held until the worker has drained and closed SQLite, even
// when an application future is cancelled while a blocking job is running.
struct OwnedDatabase {
    connection: rusqlite::Connection,
    _owner: Arc<File>,
}
impl db::worker::ConnectionOwner for OwnedDatabase {
    fn connection(&self) -> &rusqlite::Connection {
        &self.connection
    }
}

// Closing admission is synchronous, including when the application or its
// unpolled serve future is dropped. The retained supervisor can still be drained.
struct StoreOwner(Arc<crate::integrations::clawhub::store_adapter::StoreSupervisor>);
impl Drop for StoreOwner {
    fn drop(&mut self) {
        self.0.close();
    }
}

// Retain synchronous cancellation even if serve is dropped before or during shutdown.
struct ChatOwner(ChatRoutes);
impl Drop for ChatOwner {
    fn drop(&mut self) {
        self.0.close();
    }
}

pub struct Application {
    gateway: Gateway,
    auth: AuthState,
    chat: Option<ChatOwner>,
    _database_owner: Arc<File>,
    store_supervisor: Option<StoreOwner>,
}

impl Application {
    pub async fn bind(
        listener: GatewayConfig,
        config: ApplicationConfig,
    ) -> Result<Self, ApplicationError> {
        Self::bind_with_chat(listener, config, None).await
    }
    pub async fn bind_with_chat(
        listener: GatewayConfig,
        config: ApplicationConfig,
        factory: Option<Arc<dyn ChatFactory>>,
    ) -> Result<Self, ApplicationError> {
        config.validate()?;
        // Refuse a non-loopback bind before opening or migrating a database.
        if !listener.address.ip().is_loopback() {
            return Err("migration gateway requires loopback".into());
        }
        let database_path = config.database_path;
        let jwt_secret = config.jwt_secret;
        let (mut auth, database_owner) = tokio::task::spawn_blocking(move || {
            let owner = acquire_database_owner(&database_path)?;
            let database = db::open_database(&database_path)?;
            db::migrate_database(&database)?;
            let worker = db::worker::DatabaseWorker::new_owned(
                OwnedDatabase {
                    connection: database,
                    _owner: owner.clone(),
                },
                NonZeroU16::new(64).unwrap(),
            )?;
            Ok::<_, ApplicationError>((AuthState::from_worker(worker, jwt_secret)?, owner))
        })
        .await??;
        auth.cors_origin = config.cors_origin;
        if let Err(error) =
            super::chat_store::reconcile_startup_owned(&auth, database_owner.clone()).await
        {
            auth.shutdown().await?;
            return Err(error);
        }
        let chat = factory
            .map(|factory| {
                ChatRoutes::new(
                    auth.clone(),
                    factory,
                    super::chat_sessions::SessionTurnManager::new(NonZeroU16::new(8).unwrap()),
                    config.project_root.clone(),
                )
                .map(|chat| chat.with_database_owner(database_owner.clone()))
            })
            .transpose()?;
        let sessions = SessionRoutes::new(
            auth.clone(),
            config.project_root.to_string_lossy().into_owned(),
        );
        let health = HealthState::new(config.health, HealthSnapshot::default());
        let mut router = Router::new()
            .route("/health", get(application_health))
            .with_state((auth.clone(), health))
            .merge(auth.clone().router())
            .merge(sessions.router());
        if let Some(chat) = &chat {
            router = router.merge(chat.router());
        }
        match Gateway::bind_router(listener, router).await {
            Ok(gateway) => Ok(Self {
                gateway,
                auth,
                chat: chat.map(ChatOwner),
                _database_owner: database_owner,
                store_supervisor: None,
            }),
            Err(error) => {
                auth.shutdown().await?;
                Err(error.into())
            }
        }
    }

    /// Mount a store supplied by an authorized host and retain the matching
    /// supervisor. The registry is owned by the store lane and discovery must
    /// use the returned supervisor so it shares that ownership.
    pub fn with_store(
        &mut self,
        client: crate::integrations::clawhub::ClawHubClient,
        registry: crate::integrations::skills::SkillRegistry,
        store: crate::integrations::skills::install::SkillStore,
        parallelism: NonZeroU16,
        authority: crate::integrations::clawhub::store_adapter::RequestAuthority,
        clock: Arc<dyn Fn() -> u64 + Send + Sync>,
    ) -> Result<Arc<crate::integrations::clawhub::store_adapter::StoreSupervisor>, ApplicationError>
    {
        if self.store_supervisor.is_some() {
            return Err("store already mounted".into());
        }
        let (port, supervisor) =
            crate::integrations::clawhub::store_adapter::owned_supervised_store_port(
                client,
                registry,
                store,
                parallelism,
                authority,
                clock,
            );
        let supervisor = Arc::new(supervisor);
        self.gateway.mount_store(crate::routes::store::StoreRoutes {
            auth: self.auth.clone(),
            port,
        });
        self.store_supervisor = Some(StoreOwner(supervisor.clone()));
        Ok(supervisor)
    }

    pub fn local_addr(&self) -> std::io::Result<SocketAddr> {
        self.gateway.local_addr()
    }

    pub async fn serve(
        self,
        shutdown: impl Future<Output = ()> + Send + 'static,
    ) -> Result<(), ApplicationError> {
        let shutdown_error = Arc::new(Mutex::new(None));
        let error_slot = shutdown_error.clone();
        let chat = self.chat;
        let shutdown_chat = chat.as_ref().map(|owner| owner.0.clone());
        let store_close = self.store_supervisor.as_ref().map(|owner| owner.0.clone());
        let shutdown = async move {
            shutdown.await;
            if let Some(supervisor) = store_close {
                supervisor.close();
            }
            if let Some(chat) = shutdown_chat
                && let Err(error) = chat.shutdown().await
            {
                *error_slot.lock().unwrap() = Some(error);
            }
        };
        let result = if let Some(supervisor) = self.store_supervisor {
            self.gateway.serve_with_store(shutdown, &supervisor.0).await
        } else {
            self.gateway.serve(shutdown).await
        };
        drop(chat);
        let cleanup = self.auth.shutdown().await;
        result?;
        cleanup?;
        if let Some(error) = shutdown_error.lock().unwrap().take() {
            return Err(error.into());
        }
        Ok(())
    }
}

async fn application_health(
    State((auth, mut health)): State<(AuthState, HealthState)>,
) -> axum::response::Response {
    let snapshot = auth
        .with_database(|database| {
            let schema_version = u64::from(db::schema_version(database));
            let sessions = database.query_row(
                "SELECT count(*) FROM sessions WHERE status=\'active\'",
                [],
                |row| row.get::<_, i64>(0),
            )? as u64;
            let user_count = database
                .query_row("SELECT count(*) FROM users", [], |row| row.get::<_, i64>(0))?
                as u64;
            Ok(HealthSnapshot {
                schema_version,
                sessions,
                user_count,
                ..HealthSnapshot::default()
            })
        })
        .await;
    match snapshot {
        Ok(snapshot) => {
            health.snapshot = snapshot;
            Json(health.response()).into_response()
        }
        // A broken or saturated storage worker must never advertise healthy readiness.
        Err(_) => (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({"healthy":false})),
        )
            .into_response(),
    }
}

#[cfg(all(test, target_os = "linux"))]
mod ownership_tests {
    use super::*;
    use std::{
        process::{Command, Stdio},
        time::{Duration, Instant},
    };

    fn fixture() -> PathBuf {
        let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../.jait/artifacts/gateway-rust/database-ownership")
            .join(uuid::Uuid::new_v4().to_string());
        std::fs::create_dir_all(&dir).unwrap();
        dir.join("gateway.sqlite")
    }

    #[tokio::test]
    async fn application_chat_owner_closes_on_unpolled_and_cancelled_serve() {
        use crate::{
            routes::chat::PreparedChat, security::http_auth::AuthUser,
            services::sessions::SessionRecord,
        };
        struct UnusedFactory;
        impl ChatFactory for UnusedFactory {
            fn prepare(
                &self,
                _: AuthUser,
                _: SessionRecord,
            ) -> futures_util::future::BoxFuture<'_, Result<PreparedChat, String>> {
                Box::pin(async { Err("unused".into()) })
            }
        }
        for poll in [false, true] {
            let path = fixture();
            let app = Application::bind_with_chat(
                GatewayConfig {
                    address: "127.0.0.1:0".parse().unwrap(),
                },
                ApplicationConfig {
                    database_path: path.clone(),
                    project_root: path.parent().unwrap().to_path_buf(),
                    jwt_secret: "fixture-secret".into(),
                    cors_origin: String::new(),
                    health: None,
                },
                Some(Arc::new(UnusedFactory)),
            )
            .await
            .unwrap();
            let chat = app.chat.as_ref().unwrap().0.clone();
            assert!(!chat.is_closed());
            if poll {
                let task = tokio::spawn(app.serve(std::future::pending()));
                tokio::task::yield_now().await;
                task.abort();
                let _ = task.await;
            } else {
                drop(app.serve(std::future::pending()));
            }
            assert!(chat.is_closed());
            chat.shutdown().await.unwrap();
            drop(chat);
            std::fs::remove_dir_all(path.parent().unwrap()).unwrap();
        }
    }

    #[tokio::test]
    async fn abort_during_chat_drain_keeps_cancellation_and_allows_retry() {
        use crate::{
            routes::chat::PreparedChat, security::http_auth::AuthUser,
            services::sessions::SessionRecord,
        };
        struct UnusedFactory;
        impl ChatFactory for UnusedFactory {
            fn prepare(
                &self,
                _: AuthUser,
                _: SessionRecord,
            ) -> futures_util::future::BoxFuture<'_, Result<PreparedChat, String>> {
                Box::pin(async { Err("unused".into()) })
            }
        }
        let path = fixture();
        let app = Application::bind_with_chat(
            GatewayConfig {
                address: "127.0.0.1:0".parse().unwrap(),
            },
            ApplicationConfig {
                database_path: path.clone(),
                project_root: path.parent().unwrap().to_path_buf(),
                jwt_secret: "fixture-secret".into(),
                cors_origin: String::new(),
                health: None,
            },
            Some(Arc::new(UnusedFactory)),
        )
        .await
        .unwrap();
        let chat = app.chat.as_ref().unwrap().0.clone();
        let (lease, cancellation) = chat.test_admit();
        let (signal, shutdown) = tokio::sync::oneshot::channel::<()>();
        let task = tokio::spawn(app.serve(async {
            let _ = shutdown.await;
        }));
        signal.send(()).unwrap();
        tokio::time::timeout(Duration::from_secs(2), async {
            while !cancellation.is_cancelled() {
                tokio::task::yield_now().await;
            }
        })
        .await
        .unwrap();
        assert!(
            !task.is_finished(),
            "active turn should hold the chat drain"
        );
        task.abort();
        assert!(task.await.unwrap_err().is_cancelled());
        assert!(chat.is_closed());
        drop(lease);
        tokio::time::timeout(Duration::from_secs(2), chat.shutdown())
            .await
            .unwrap()
            .unwrap();
        drop(chat);
        std::fs::remove_dir_all(path.parent().unwrap()).unwrap();
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn application_store_auth_authority_and_shutdown() {
        use crate::{
            execution::process_runner::ProcessCancellation,
            integrations::{
                clawhub::{ClawHubClient, store_adapter::RequestAuthority},
                skills::{SkillRegistry, install::SkillStore},
            },
            routes::store::StoreContext,
            security::http_auth::{self, AuthUser},
        };
        use std::time::Duration;
        let path = fixture();
        let root = path.parent().unwrap().canonicalize().unwrap();
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&root, std::fs::Permissions::from_mode(0o700)).unwrap();
        let mut app = Application::bind(
            GatewayConfig {
                address: "127.0.0.1:0".parse().unwrap(),
            },
            ApplicationConfig {
                database_path: path,
                project_root: root.clone(),
                jwt_secret: "fixture-secret".into(),
                cors_origin: String::new(),
                health: None,
            },
        )
        .await
        .unwrap();
        app.auth.with_database(|db| {
            db.execute_batch("INSERT INTO users(id,username,password_hash,created_at,updated_at) VALUES('user','user','fixture','old','old')")?;
            Ok(())
        }).await.unwrap();
        let calls = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let observed = calls.clone();
        let authority: RequestAuthority = Arc::new(move |_, _| {
            observed.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
            Box::pin(async { Err("denied by host".into()) })
        });
        let supervisor = app
            .with_store(
                ClawHubClient::new(None).unwrap(),
                SkillRegistry::default(),
                SkillStore::open(root.clone()).unwrap(),
                NonZeroU16::new(1).unwrap(),
                authority,
                Arc::new(|| 0),
            )
            .unwrap();
        let address = app.local_addr().unwrap();
        let (stop, stopped) = tokio::sync::oneshot::channel();
        let task = tokio::spawn(app.serve(async move {
            let _ = stopped.await;
        }));
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(5))
            .build()
            .unwrap();
        let url = format!("http://{address}/api/store/skills");
        assert_eq!(
            client.get(&url).send().await.unwrap().status(),
            reqwest::StatusCode::UNAUTHORIZED
        );
        assert_eq!(calls.load(std::sync::atomic::Ordering::SeqCst), 0);
        let user = AuthUser {
            id: "user".into(),
            username: "user".into(),
        };
        let token = http_auth::sign_auth_token(&user, "fixture-secret").unwrap();
        let response = client.get(&url).bearer_auth(token).send().await.unwrap();
        assert_eq!(
            response.status(),
            reqwest::StatusCode::INTERNAL_SERVER_ERROR
        );
        assert_eq!(
            response.json::<serde_json::Value>().await.unwrap()["message"],
            "denied by host"
        );
        assert_eq!(calls.load(std::sync::atomic::Ordering::SeqCst), 1);
        stop.send(()).unwrap();
        tokio::time::timeout(Duration::from_secs(10), task)
            .await
            .unwrap()
            .unwrap()
            .unwrap();
        let context = StoreContext {
            user,
            cancellation: ProcessCancellation::default(),
        };
        let result = supervisor
            .discovery_snapshot(context, |_| Box::pin(async { Ok(()) }))
            .await;
        assert!(matches!(result, Err(error) if error.to_string() == "store is closed"));
        std::fs::remove_dir_all(root).unwrap();
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn application_store_rejects_duplicate_mount() {
        use crate::integrations::{
            clawhub::{ClawHubClient, store_adapter::RequestAuthority},
            skills::{SkillRegistry, install::SkillStore},
        };
        let path = fixture();
        let root = path.parent().unwrap().canonicalize().unwrap();
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&root, std::fs::Permissions::from_mode(0o700)).unwrap();
        let mut app = Application::bind(
            GatewayConfig {
                address: "127.0.0.1:0".parse().unwrap(),
            },
            ApplicationConfig {
                database_path: path,
                project_root: root.clone(),
                jwt_secret: "fixture-secret".into(),
                cors_origin: String::new(),
                health: None,
            },
        )
        .await
        .unwrap();
        let authority: RequestAuthority = Arc::new(|_, _| Box::pin(async { Err("denied".into()) }));
        let supervisor = app
            .with_store(
                ClawHubClient::new(None).unwrap(),
                SkillRegistry::default(),
                SkillStore::open(root.clone()).unwrap(),
                NonZeroU16::new(1).unwrap(),
                authority.clone(),
                Arc::new(|| 0),
            )
            .unwrap();
        let result = app.with_store(
            ClawHubClient::new(None).unwrap(),
            SkillRegistry::default(),
            SkillStore::open(root.clone()).unwrap(),
            NonZeroU16::new(1).unwrap(),
            authority,
            Arc::new(|| 0),
        );
        assert!(matches!(result, Err(error) if error.to_string() == "store already mounted"));
        assert!(app.local_addr().is_ok());
        app.serve(async {}).await.unwrap();
        supervisor.shutdown().await;
        std::fs::remove_dir_all(root).unwrap();
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn unpolled_application_store_future_closes_admission() {
        use crate::integrations::{
            clawhub::{ClawHubClient, store_adapter::RequestAuthority},
            skills::{SkillRegistry, install::SkillStore},
        };
        use crate::{
            execution::process_runner::ProcessCancellation, routes::store::StoreContext,
            security::http_auth::AuthUser,
        };
        use std::os::unix::fs::PermissionsExt;
        let path = fixture();
        let root = path.parent().unwrap().canonicalize().unwrap();
        std::fs::set_permissions(&root, std::fs::Permissions::from_mode(0o700)).unwrap();
        let mut app = Application::bind(
            GatewayConfig {
                address: "127.0.0.1:0".parse().unwrap(),
            },
            ApplicationConfig {
                database_path: path,
                project_root: root.clone(),
                jwt_secret: "fixture-secret".into(),
                cors_origin: String::new(),
                health: None,
            },
        )
        .await
        .unwrap();
        let authority: RequestAuthority = Arc::new(|_, _| Box::pin(async { Err("denied".into()) }));
        let supervisor = app
            .with_store(
                ClawHubClient::new(None).unwrap(),
                SkillRegistry::default(),
                SkillStore::open(root.clone()).unwrap(),
                NonZeroU16::new(1).unwrap(),
                authority,
                Arc::new(|| 0),
            )
            .unwrap();
        drop(app.serve(std::future::pending()));
        let context = StoreContext {
            user: AuthUser {
                id: "user".into(),
                username: "user".into(),
            },
            cancellation: ProcessCancellation::default(),
        };
        let result = supervisor
            .discovery_snapshot(context, |_| Box::pin(async { Ok(()) }))
            .await;
        assert!(matches!(result, Err(error) if error.to_string() == "store is closed"));
        supervisor.shutdown().await;
        std::fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test]
    async fn cancelled_application_keeps_database_lock_until_job_finishes() {
        let path = fixture();
        let app = Application::bind(
            GatewayConfig {
                address: "127.0.0.1:0".parse().unwrap(),
            },
            ApplicationConfig {
                database_path: path.clone(),
                project_root: path.parent().unwrap().to_path_buf(),
                jwt_secret: "fixture-secret".into(),
                cors_origin: String::new(),
                health: None,
            },
        )
        .await
        .unwrap();
        let auth = app.auth.clone();
        let (started, ready) = tokio::sync::oneshot::channel();
        let (release, wait) = std::sync::mpsc::channel::<()>();
        let job = tokio::spawn(async move {
            auth.with_database(move |_| {
                let _ = started.send(());
                let _ = wait.recv();
                Ok(())
            })
            .await
        });
        ready.await.unwrap();
        let server = tokio::spawn(app.serve(std::future::pending()));
        tokio::task::yield_now().await;
        server.abort();
        let _ = server.await;
        job.abort();
        let _ = job.await;
        assert!(acquire_database_owner(&path).is_err());
        release.send(()).unwrap();
        tokio::time::timeout(Duration::from_secs(5), async {
            loop {
                if let Ok(owner) = acquire_database_owner(&path) {
                    drop(owner);
                    break;
                }
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
        })
        .await
        .expect("database lock was not released after the worker drained");
        std::fs::remove_dir_all(path.parent().unwrap()).unwrap();
    }

    // Invoked in a separate test process by the parent test.
    #[test]
    fn ownership_child() {
        let Some(path) = std::env::var_os("JAIT_TEST_OWNERSHIP_CHILD") else {
            return;
        };
        let path = PathBuf::from(path);
        let _owner = acquire_database_owner(&path).unwrap();
        std::fs::write(path.with_extension("ready"), b"ready").unwrap();
        std::thread::sleep(Duration::from_secs(15));
    }

    #[tokio::test]
    async fn second_application_cannot_reconcile_a_live_turn() {
        use crate::runtime::{
            chat_store::SqliteTurnStore,
            chat_turn::{TurnEvent, TurnPersistence},
        };
        let path = fixture();
        let config = || ApplicationConfig {
            database_path: path.clone(),
            project_root: path.parent().unwrap().to_path_buf(),
            jwt_secret: "fixture-secret".into(),
            cors_origin: String::new(),
            health: None,
        };
        let listener = GatewayConfig {
            address: "127.0.0.1:0".parse().unwrap(),
        };
        let first = Application::bind(listener.clone(), config()).await.unwrap();
        first.auth.with_database(|db| {
            db.execute("INSERT INTO sessions(id,user_id,created_at,last_active_at,status) VALUES('session','owner','2026-10-21T00:00:00Z','2026-10-21T00:00:00Z','active')", [])?;
            Ok(())
        }).await.unwrap();
        let turn = SqliteTurnStore::new(first.auth.clone(), "owner".into(), "session".into())
            .unwrap()
            .with_turn();
        turn.append(TurnEvent::User {
            content: "live".into(),
        })
        .await
        .unwrap();
        assert!(Application::bind(listener.clone(), config()).await.is_err());
        let state: String = first
            .auth
            .with_database(|db| {
                Ok(db.query_row("SELECT state FROM rust_chat_turns", [], |row| row.get(0))?)
            })
            .await
            .unwrap();
        assert_eq!(state, "started");
        drop(turn);
        first.auth.shutdown().await.unwrap();
        drop(first);
        let restarted = Application::bind(listener, config()).await.unwrap();
        let state: String = restarted
            .auth
            .with_database(|db| {
                Ok(db.query_row("SELECT state FROM rust_chat_turns", [], |row| row.get(0))?)
            })
            .await
            .unwrap();
        assert_eq!(state, "interrupted");
        restarted.auth.shutdown().await.unwrap();
    }

    #[test]
    fn separate_process_excludes_startup_and_crash_releases_lock() {
        let path = fixture();
        let mut child = Command::new(std::env::current_exe().unwrap())
            .args([
                "--exact",
                "runtime::application::ownership_tests::ownership_child",
            ])
            .env("JAIT_TEST_OWNERSHIP_CHILD", &path)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .unwrap();
        let deadline = Instant::now() + Duration::from_secs(5);
        while !path.with_extension("ready").exists() && Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(10));
        }
        let ready = path.with_extension("ready").exists();
        let competing = if ready {
            Some(acquire_database_owner(&path))
        } else {
            None
        };
        child.kill().unwrap();
        child.wait().unwrap();
        assert!(ready, "child did not acquire the database lock");
        assert!(competing.unwrap().is_err());
        let owner = acquire_database_owner(&path).unwrap();
        assert!(acquire_database_owner(&path).is_err());
        drop(owner);
        assert!(acquire_database_owner(&path).is_ok());
    }
}
