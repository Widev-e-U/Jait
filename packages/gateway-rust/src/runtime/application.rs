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

/// Account and session routes share one bounded SQLite worker and shutdown lifecycle.
pub struct Application {
    gateway: Gateway,
    auth: AuthState,
    chat: Option<ChatRoutes>,
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
        let mut auth = tokio::task::spawn_blocking(move || {
            let database = db::open_database(&database_path)?;
            db::migrate_database(&database)?;
            AuthState::new(database, jwt_secret)
        })
        .await??;
        auth.cors_origin = config.cors_origin;
        let chat = factory
            .map(|factory| {
                ChatRoutes::new(
                    auth.clone(),
                    factory,
                    super::chat_sessions::SessionTurnManager::new(NonZeroU16::new(8).unwrap()),
                    config.project_root.clone(),
                )
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
                chat,
            }),
            Err(error) => {
                auth.shutdown().await?;
                Err(error.into())
            }
        }
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
        let result = self
            .gateway
            .serve(async move {
                shutdown.await;
                if let Some(chat) = chat
                    && let Err(error) = chat.shutdown().await
                {
                    *error_slot.lock().unwrap() = Some(error);
                }
            })
            .await;
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
