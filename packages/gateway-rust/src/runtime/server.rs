use crate::{config::GatewayConfig, health::HealthState, routes};
use axum::{Json, Router, extract::State, routing::get};
use std::{
    future::{Future, IntoFuture},
    io,
    net::SocketAddr,
    time::Duration,
};
use tokio::net::{TcpListener, TcpSocket};

/// Binds the loopback listener with `SO_REUSEADDR` so a restarted gateway can
/// reclaim its address while connections from the previous instance are still
/// draining. A concurrent listener on the same address still conflicts, because
/// `SO_REUSEADDR` never overrides a listening socket.
async fn bind_loopback(address: SocketAddr) -> io::Result<TcpListener> {
    let socket = match address {
        SocketAddr::V4(_) => TcpSocket::new_v4()?,
        SocketAddr::V6(_) => TcpSocket::new_v6()?,
    };
    socket.set_reuseaddr(true)?;
    socket.bind(address)?;
    socket.listen(1024)
}

// Match the TypeScript redeploy handoff: attempt immediately, then retry only
// address conflicts at 500 ms intervals for up to 20 seconds. The deadline is
// checked after a failed attempt, so the last sleep may cross it.
async fn retry_address_in_use<T, F, Fut>(mut attempt: F, max_wait: Duration) -> io::Result<T>
where
    F: FnMut() -> Fut,
    Fut: Future<Output = io::Result<T>>,
{
    let start = tokio::time::Instant::now();
    loop {
        match attempt().await {
            Ok(value) => return Ok(value),
            Err(error)
                if error.kind() == io::ErrorKind::AddrInUse && start.elapsed() < max_wait =>
            {
                tokio::time::sleep(Duration::from_millis(500)).await;
            }
            Err(error) => return Err(error),
        }
    }
}

pub struct Gateway {
    listener: TcpListener,
    router: Router,
}
impl Gateway {
    pub async fn bind(config: GatewayConfig, health: HealthState) -> io::Result<Self> {
        let router = Router::new()
            .route("/health", get(health_response))
            .with_state(health);
        Self::bind_router(config, router).await
    }
    pub(super) async fn bind_router(config: GatewayConfig, router: Router) -> io::Result<Self> {
        if !config.address.ip().is_loopback() {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "migration gateway requires loopback",
            ));
        }
        Ok(Self {
            listener: retry_address_in_use(
                || bind_loopback(config.address),
                Duration::from_secs(20),
            )
            .await?,
            router,
        })
    }
    pub async fn bind_authenticated(
        config: GatewayConfig,
        health: HealthState,
        auth: routes::auth::AuthState,
    ) -> io::Result<Self> {
        let mut gateway = Self::bind(config, health).await?;
        gateway.router = gateway.router.merge(auth.router());
        Ok(gateway)
    }
    /// Explicit opt-in session API; production activation remains separately gated.
    pub fn with_sessions(mut self, sessions: routes::sessions::SessionRoutes) -> Self {
        self.router = self.router.merge(sessions.router());
        self
    }
    /// Explicit opt-in for the currently implemented thread routes. Execution,
    /// streaming and the remaining thread endpoints are not provided by this mount.
    pub fn with_threads(mut self, threads: routes::threads::ThreadRoutes) -> Self {
        self.router = self.router.merge(threads.router());
        self
    }
    /// Explicit filesystem control-plane and environment; no default mount.
    pub fn with_filesystem(mut self, routes: routes::filesystem::FilesystemRoutes) -> Self {
        self.router = self.router.merge(routes.router());
        self
    }
    /// Mount the explicitly authorized store port. The caller retains its
    /// supervisor and must use `serve_with_store` to close and drain it.
    pub fn with_store(mut self, routes: routes::store::StoreRoutes) -> Self {
        self.mount_store(routes);
        self
    }
    pub(crate) fn mount_store(&mut self, routes: routes::store::StoreRoutes) {
        self.router = std::mem::take(&mut self.router).merge(routes.router());
    }
    /// Mount the opt-in WebSocket transport at the path configured on its hub.
    /// The caller retains the handle so it can close and drain accepted sockets
    /// before shutting down the workers the hub reads from.
    /// Mount the opt-in WebSocket transport at the path configured on its hub.
    /// The caller retains the handle so it can close and drain accepted sockets
    /// before shutting down the workers the hub reads from.
    pub fn mount_websocket(&mut self, transport: crate::runtime::ws_transport::WsTransport) {
        self.router = std::mem::take(&mut self.router).merge(transport.router());
    }

    pub fn with_websocket(mut self, transport: crate::runtime::ws_transport::WsTransport) -> Self {
        self.router = self.router.merge(transport.router());
        self
    }

    /// Supervision only; command execution remains a separately authorized host port.
    pub fn with_maintenance(mut self, routes: routes::maintenance::MaintenanceRoutes) -> Self {
        self.router = self.router.merge(routes.router());
        self
    }
    /// Opt-in immutable asset hook. Full frontend/static fallback serving is separate.
    pub fn with_static_asset_cache(
        mut self,
        cache: crate::services::static_asset_cache::StaticAssetCache,
    ) -> Self {
        self.router = self.router.layer(axum::middleware::from_fn_with_state(
            cache,
            crate::services::static_asset_cache::serve,
        ));
        self
    }
    /// Explicit opt-in user input routes; production mounting is separately gated.
    pub fn with_user_questions(
        mut self,
        routes: routes::user_questions::UserQuestionRoutes,
    ) -> Self {
        self.router = self.router.merge(routes.router());
        self
    }
    /// Webhooks retain their independent shared-secret authorization boundary.
    pub fn with_hooks(mut self, routes: routes::hooks::HookRoutes) -> Self {
        self.router = self.router.merge(routes.router());
        self
    }
    pub fn with_trust(mut self, routes: routes::trust::TrustRoutes) -> Self {
        self.router = self.router.merge(routes.router());
        self
    }
    /// Explicit opt-in secret input and encrypted-secret storage routes.
    pub fn with_secrets(mut self, routes: routes::secrets::SecretRoutes) -> Self {
        self.router = self.router.merge(routes.router());
        self
    }
    pub fn with_assistant_profiles(
        mut self,
        routes: routes::assistant_profiles::AssistantProfileRoutes,
    ) -> Self {
        self.router = self.router.merge(routes.router());
        self
    }
    pub fn with_architecture(mut self, routes: routes::architecture::ArchitectureRoutes) -> Self {
        self.router = self.router.merge(routes.router());
        self
    }
    /// Explicit jobs API; starting the scheduler timer and authorizing its executor are separate.
    pub fn with_jobs(mut self, routes: routes::jobs::JobRoutes) -> Self {
        self.router = self.router.merge(routes.router());
        self
    }
    /// Read-only environment composition over explicitly supplied native stores.
    pub fn with_environment(mut self, routes: routes::environment::EnvironmentRoutes) -> Self {
        self.router = self.router.merge(routes.router());
        self
    }
    pub fn with_calendar(mut self, routes: routes::calendar::CalendarRoutes) -> Self {
        self.router = self.router.merge(routes.router());
        self
    }
    /// Opt-in owner control routes remain available while agents are halted.
    pub fn with_agent_control(mut self, routes: routes::agent_control::AgentControlRoutes) -> Self {
        self.router = self.router.merge(routes.router());
        self
    }
    /// Explicit registry/checker/installer adapters; no automatic tool installs.
    pub fn with_skills(mut self, routes: routes::skills::SkillRoutes) -> Self {
        self.router = self.router.merge(routes.router());
        self
    }
    /// Explicitly mounted scope and TCP assessment API.
    pub fn with_security_assessments(
        mut self,
        routes: routes::security_assessments::SecurityAssessmentRoutes,
    ) -> Self {
        self.router = self.router.merge(routes.router());
        self
    }
    /// Explicit screen-share lifecycle composition; does not start media capture.
    pub fn with_screen_share(mut self, routes: routes::screen_share::ScreenShareRoutes) -> Self {
        self.router = self.router.merge(routes.router());
        self
    }
    /// Terminal control routes; the supplied control adapter owns process spawning policy.
    pub fn with_terminals(mut self, routes: routes::terminals::TerminalRoutes) -> Self {
        self.router = self.router.merge(routes.router());
        self
    }
    /// Preview devtools routes; requires an explicit asset source, no implicit bundle reads.
    pub fn with_browser_devtools(
        mut self,
        routes: routes::browser_devtools::BrowserDevToolsState,
    ) -> Self {
        self.router = self.router.merge(routes.router());
        self
    }
    /// Voice session routes; transcription HTTP and settings remain explicit adapters.
    pub fn with_voice(mut self, routes: routes::voice::VoiceRoutes) -> Self {
        self.router = self.router.merge(routes.router());
        self
    }
    /// Provider account/usage routes over explicitly supplied provider adapters.
    pub fn with_providers(mut self, routes: routes::providers::ProviderRoutes) -> Self {
        self.router = self.router.merge(routes::providers::router(routes));
        self
    }
    /// MCP server routes; tool exposure and authentication stay caller-controlled.
    pub fn with_mcp_server(mut self, routes: routes::mcp_server::McpRoutes) -> Self {
        self.router = self.router.merge(routes::mcp_server::router(routes));
        self
    }
    pub fn local_addr(&self) -> io::Result<SocketAddr> {
        self.listener.local_addr()
    }
    /// Serve with an explicitly retained store owner. The caller must retain the
    /// supervisor and retry its shutdown if this future is cancelled while draining.
    pub async fn serve_with_store(
        self,
        shutdown: impl Future<Output = ()> + Send + 'static,
        supervisor: &std::sync::Arc<crate::integrations::clawhub::store_adapter::StoreSupervisor>,
    ) -> io::Result<()> {
        struct CloseOnDrop<'a>(&'a crate::integrations::clawhub::store_adapter::StoreSupervisor);
        impl Drop for CloseOnDrop<'_> {
            fn drop(&mut self) {
                self.0.close();
            }
        }
        let _guard = CloseOnDrop(supervisor);
        let trigger = supervisor.clone();
        let result = self
            .serve(async move {
                shutdown.await;
                trigger.close();
            })
            .await;
        supervisor.shutdown().await;
        result
    }

    pub async fn serve(
        self,
        shutdown: impl Future<Output = ()> + Send + 'static,
    ) -> io::Result<()> {
        let (draining, mut drain_started) = tokio::sync::oneshot::channel();
        let server = axum::serve(self.listener, self.router)
            .with_graceful_shutdown(async move {
                shutdown.await;
                let _ = draining.send(());
            })
            .into_future();
        tokio::pin!(server);
        // Graceful drain has a ceiling so idle keepalives cannot wedge shutdown.
        tokio::select! {
            result = &mut server => result,
            _ = &mut drain_started => {
                tokio::time::timeout(Duration::from_secs(5), &mut server).await
                    .map_err(|_| io::Error::new(io::ErrorKind::TimedOut, "gateway drain exceeded five seconds"))?
            }
        }
    }
}
async fn health_response(State(health): State<HealthState>) -> Json<serde_json::Value> {
    Json(health.response())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    };

    #[tokio::test]
    async fn opt_in_thread_routes_preserve_authentication() {
        use tower::ServiceExt;
        let db = rusqlite::Connection::open_in_memory().unwrap();
        crate::db::migrate_database(&db).unwrap();
        let auth = routes::auth::AuthState::new(db, "thread-mount-test".into()).unwrap();
        let gateway = Gateway::bind_router(
            GatewayConfig {
                address: "127.0.0.1:0".parse().unwrap(),
            },
            Router::new(),
        )
        .await
        .unwrap()
        .with_threads(routes::threads::ThreadRoutes::new(auth.clone()));
        let response = gateway
            .router
            .oneshot(
                axum::http::Request::builder()
                    .uri("/api/threads")
                    .body(axum::body::Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), axum::http::StatusCode::UNAUTHORIZED);
        auth.shutdown().await.unwrap();
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn dropping_store_server_closes_admission_and_allows_retryable_drain() {
        use crate::{
            execution::process_runner::ProcessCancellation,
            integrations::{
                clawhub::{
                    ClawHubClient,
                    store_adapter::{RequestAuthority, owned_supervised_store_port},
                },
                skills::{SkillRegistry, install::SkillStore},
            },
            routes::store::{StoreContext, StoreOperation, StoreRoutes},
            security::http_auth::{self, AuthUser},
        };
        use std::{num::NonZeroU16, os::unix::fs::PermissionsExt};
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap()
            .parent()
            .unwrap()
            .join(".jait/artifacts/gateway-rust/server-store-tests")
            .join(uuid::Uuid::new_v4().to_string());
        std::fs::create_dir_all(&root).unwrap();
        std::fs::set_permissions(&root, std::fs::Permissions::from_mode(0o700)).unwrap();
        let authority: RequestAuthority = Arc::new(|_, _| Box::pin(async { Err("denied".into()) }));
        let (port, supervisor) = owned_supervised_store_port(
            ClawHubClient::new(None).unwrap(),
            SkillRegistry::default(),
            SkillStore::open(root.clone()).unwrap(),
            NonZeroU16::new(1).unwrap(),
            authority,
            Arc::new(|| 0),
        );
        let supervisor = Arc::new(supervisor);
        let db = rusqlite::Connection::open_in_memory().unwrap();
        crate::db::migrate_database(&db).unwrap();
        db.execute_batch("INSERT INTO users(id,username,password_hash,created_at,updated_at) VALUES('user','user','fixture','old','old')").unwrap();
        let auth = routes::auth::AuthState::new(db, "store-server-test".into()).unwrap();
        let gateway = Gateway::bind_router(
            GatewayConfig {
                address: "127.0.0.1:0".parse().unwrap(),
            },
            Router::new(),
        )
        .await
        .unwrap()
        .with_store(StoreRoutes {
            auth: auth.clone(),
            port: port.clone(),
        });
        let address = gateway.local_addr().unwrap();
        let (started, waiting) = tokio::sync::oneshot::channel();
        let owner = supervisor.clone();
        let task = tokio::spawn(async move {
            gateway
                .serve_with_store(
                    async move {
                        let _ = started.send(());
                        std::future::pending::<()>().await;
                    },
                    &owner,
                )
                .await
        });
        waiting.await.unwrap();
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(5))
            .build()
            .unwrap();
        let url = format!("http://{address}/api/store/skills");
        assert_eq!(
            client.get(&url).send().await.unwrap().status(),
            reqwest::StatusCode::UNAUTHORIZED
        );
        let token = http_auth::sign_auth_token(
            &AuthUser {
                id: "user".into(),
                username: "user".into(),
            },
            "store-server-test",
        )
        .unwrap();
        let response = client.get(&url).bearer_auth(token).send().await.unwrap();
        assert_eq!(
            response.status(),
            reqwest::StatusCode::INTERNAL_SERVER_ERROR
        );
        assert_eq!(
            response.json::<serde_json::Value>().await.unwrap()["message"],
            "denied"
        );
        task.abort();
        let _ = task.await;
        let context = StoreContext {
            user: AuthUser {
                id: "user".into(),
                username: "user".into(),
            },
            cancellation: ProcessCancellation::default(),
        };
        assert!(matches!(
            port(context, StoreOperation::ListInstalled).await,
            Err(crate::routes::store::StoreError::Message(message)) if message == "store is closed"
        ));
        supervisor.shutdown().await;
        auth.shutdown().await.unwrap();
        std::fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test(start_paused = true)]
    async fn retries_conflicts_until_success_at_reference_interval() {
        let attempts = AtomicUsize::new(0);
        let start = tokio::time::Instant::now();
        let result = retry_address_in_use(
            || {
                let attempt = attempts.fetch_add(1, Ordering::SeqCst);
                async move {
                    if attempt < 2 {
                        Err(io::Error::new(io::ErrorKind::AddrInUse, "occupied"))
                    } else {
                        Ok(42)
                    }
                }
            },
            Duration::from_secs(20),
        )
        .await
        .unwrap();
        assert_eq!(result, 42);
        assert_eq!(attempts.load(Ordering::SeqCst), 3);
        assert_eq!(start.elapsed(), Duration::from_secs(1));
    }

    #[tokio::test(start_paused = true)]
    async fn returns_last_conflict_after_deadline_and_other_errors_immediately() {
        let attempts = AtomicUsize::new(0);
        let start = tokio::time::Instant::now();
        let error = retry_address_in_use(
            || {
                let attempt = attempts.fetch_add(1, Ordering::SeqCst);
                async move {
                    Err::<(), _>(io::Error::new(
                        io::ErrorKind::AddrInUse,
                        format!("conflict {attempt}"),
                    ))
                }
            },
            Duration::from_millis(750),
        )
        .await
        .unwrap_err();
        assert_eq!(attempts.load(Ordering::SeqCst), 3);
        assert_eq!(start.elapsed(), Duration::from_secs(1));
        assert_eq!(error.to_string(), "conflict 2");

        let start = tokio::time::Instant::now();
        let error = retry_address_in_use(
            || async { Err::<(), _>(io::Error::new(io::ErrorKind::PermissionDenied, "denied")) },
            Duration::from_secs(20),
        )
        .await
        .unwrap_err();
        assert_eq!(error.kind(), io::ErrorKind::PermissionDenied);
        assert_eq!(start.elapsed(), Duration::ZERO);
    }

    #[tokio::test(start_paused = true)]
    async fn dropping_retry_cancels_future_attempts() {
        let attempts = Arc::new(AtomicUsize::new(0));
        let task_attempts = attempts.clone();
        let task = tokio::spawn(async move {
            retry_address_in_use(
                || {
                    task_attempts.fetch_add(1, Ordering::SeqCst);
                    async { Err::<(), _>(io::Error::new(io::ErrorKind::AddrInUse, "occupied")) }
                },
                Duration::from_secs(20),
            )
            .await
        });
        tokio::task::yield_now().await;
        assert_eq!(attempts.load(Ordering::SeqCst), 1);
        task.abort();
        assert!(task.await.unwrap_err().is_cancelled());
        tokio::time::advance(Duration::from_secs(21)).await;
        assert_eq!(attempts.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn listener_retries_until_occupied_loopback_port_is_released() {
        let occupied = bind_loopback("127.0.0.1:0".parse().unwrap()).await.unwrap();
        let address = occupied.local_addr().unwrap();
        let task = tokio::spawn(async move {
            retry_address_in_use(|| bind_loopback(address), Duration::from_secs(20)).await
        });
        tokio::task::yield_now().await;
        assert!(!task.is_finished());
        drop(occupied);
        let listener = tokio::time::timeout(Duration::from_secs(3), task)
            .await
            .unwrap()
            .unwrap()
            .unwrap();
        assert_eq!(listener.local_addr().unwrap(), address);
    }
}
