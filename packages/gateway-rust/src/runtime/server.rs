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
            listener: bind_loopback(config.address).await?,
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
    /// Explicit filesystem control-plane and environment; no default mount.
    pub fn with_filesystem(mut self, routes: routes::filesystem::FilesystemRoutes) -> Self {
        self.router = self.router.merge(routes.router());
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
    pub fn local_addr(&self) -> io::Result<SocketAddr> {
        self.listener.local_addr()
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
