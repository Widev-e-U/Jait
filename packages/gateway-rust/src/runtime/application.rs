//! Opt-in persistent account/session composition for the migration runtime.
//! Chat is separately configured; no provider, credentials or tool is discovered.
use crate::{
    config::GatewayConfig,
    db,
    health::{HealthConfig, HealthSnapshot, HealthState},
    routes::{
        architecture::ArchitectureRoutes,
        assistant_profiles::AssistantProfileRoutes,
        auth::AuthState,
        calendar::CalendarRoutes,
        chat::{ChatFactory, ChatRoutes},
        environment::EnvironmentRoutes,
        filesystem::{BrowseEnvironment, FilesystemRoutes},
        git::GitRoutes,
        plans::PlanRoutes,
        project::ProjectRoutes,
        reminders::ReminderRoutes,
        repo_proposals::RepoProposalRoutes,
        repositories::RepositoryRoutes,
        secrets::SecretRoutes,
        sessions::SessionRoutes,
        terminals::TerminalRoutes,
        threads::ThreadRoutes,
        update::UpdateRoutes,
        user_questions::UserQuestionRoutes,
        voice::{VoiceRouteConfig, VoiceRoutes},
    },
    runtime::Gateway,
    services::calendar::service::CalendarService,
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
    /// Built web UI directory served on the gateway port; `None` serves no UI.
    pub web_root: Option<PathBuf>,
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
            web_root: lookup("JAIT_WEB_DIR")
                .filter(|v| !v.is_empty())
                .map(PathBuf::from),
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
        if self
            .web_root
            .as_ref()
            .is_some_and(|root| !root.is_absolute())
        {
            return Err("JAIT_WEB_DIR must be an absolute directory path".into());
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

// Terminal routes are authenticated by the shared account state and fail closed for
// non-default sessions. Unix hosts get the real PTY control; other platforms keep the
// fail-closed default rather than pretending the capability exists.
/// Code graph on the real database worker. The graphify command and its managed
/// runtime live under the state directory beside the database; nothing is
/// provisioned until an index is requested.
fn composed_code_graph_routes(
    auth: AuthState,
    project_root: &std::path::Path,
    state_dir: &std::path::Path,
) -> Result<crate::routes::code_graph::CodeGraphRoutes, ApplicationError> {
    use crate::services::code_graph::{
        engine::native_executor,
        runner::{GraphifyRunner, RunnerOptions},
        runtime::GraphifyRuntime,
        service::CodeGraphService,
    };
    let home = std::env::var("HOME").unwrap_or_default();
    let mut env = std::collections::BTreeMap::new();
    for key in ["PATH", "HOME", "JAIT_GRAPHIFY_COMMAND"] {
        if let Ok(value) = std::env::var(key) {
            env.insert(key.to_owned(), value);
        }
    }
    let execute = native_executor(
        project_root.to_path_buf(),
        std::time::Duration::from_secs(3600),
        2,
    )
    .map_err(|error| ApplicationError::from(error.to_string()))?;
    let runtime = GraphifyRuntime::new(
        state_dir.to_string_lossy().into_owned(),
        env.clone(),
        execute.clone(),
    );
    let runner = GraphifyRunner::new(runtime, RunnerOptions::default());
    let service = Arc::new(CodeGraphService::with_worker(
        auth.worker(),
        state_dir
            .join("data")
            .join("code-graphs")
            .to_string_lossy()
            .into_owned(),
        home,
        CodeGraphService::runner_build(runner),
        CodeGraphService::revision_executor(execute, env),
    ));
    Ok(crate::routes::code_graph::CodeGraphRoutes {
        auth: auth.clone(),
        backend: Arc::new(crate::routes::code_graph::NativeCodeGraphBackend {
            service,
            projects: crate::routes::code_graph::owned_projects_from_auth(auth),
        }),
        cwd: project_root.to_string_lossy().into_owned(),
    })
}
fn composed_terminal_routes(auth: AuthState, project_root: &std::path::Path) -> TerminalRoutes {
    let routes =
        TerminalRoutes::new(auth).with_project_root(project_root.to_string_lossy().into_owned());
    #[cfg(unix)]
    let routes = routes.with_control(crate::surfaces::local_terminal::LocalTerminalControl::new());
    routes
}

// Filesystem browsing is gateway-local; remote nodes register through the WS hub later.
fn composed_filesystem_routes(auth: AuthState, project_root: &std::path::Path) -> FilesystemRoutes {
    let mut buffer = [0u8; 256];
    // SAFETY: the buffer is valid for its length and gethostname NUL-terminates within it.
    let hostname = unsafe {
        libc::gethostname(buffer.as_mut_ptr().cast(), buffer.len() - 1);
        std::ffi::CStr::from_ptr(buffer.as_ptr().cast())
            .to_string_lossy()
            .into_owned()
    };
    let environment = BrowseEnvironment {
        home: std::env::var_os("HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|| project_root.to_path_buf()),
        cwd: project_root.to_path_buf(),
        hostname,
        platform: match std::env::consts::OS {
            "windows" => "win32",
            "macos" => "darwin",
            other => other,
        }
        .to_owned(),
        drives: Arc::new(|| Err("drive discovery is unavailable".to_owned())),
    };
    FilesystemRoutes::new(auth, environment, None, String::new())
}

pub struct Application {
    gateway: Gateway,
    auth: AuthState,
    chat: Option<ChatOwner>,
    _database_owner: Arc<File>,
    store_supervisor: Option<StoreOwner>,
    ws_transport: Option<crate::runtime::ws_transport::WsTransport>,
    consent: Option<crate::security::consent_manager::ConsentManager>,
}

impl Application {
    pub async fn bind(
        listener: GatewayConfig,
        config: ApplicationConfig,
    ) -> Result<Self, ApplicationError> {
        Self::bind_inner(listener, config, None, false).await
    }
    /// Production entry: chat runs on the authenticated user's own saved provider settings.
    pub async fn bind_with_settings_chat(
        listener: GatewayConfig,
        config: ApplicationConfig,
    ) -> Result<Self, ApplicationError> {
        Self::bind_inner(listener, config, None, true).await
    }
    pub async fn bind_with_chat(
        listener: GatewayConfig,
        config: ApplicationConfig,
        factory: Option<Arc<dyn ChatFactory>>,
    ) -> Result<Self, ApplicationError> {
        Self::bind_inner(listener, config, factory, false).await
    }
    async fn bind_inner(
        listener: GatewayConfig,
        config: ApplicationConfig,
        factory: Option<Arc<dyn ChatFactory>>,
        settings_chat: bool,
    ) -> Result<Self, ApplicationError> {
        config.validate()?;
        // Refuse a non-loopback bind before opening or migrating a database.
        if !listener.address.ip().is_loopback() && !listener.allow_non_loopback {
            return Err("migration gateway requires loopback".into());
        }
        let state_dir = config
            .database_path
            .parent()
            .map(std::path::Path::to_path_buf)
            .ok_or("database path must have a parent directory")?;
        let database_path = config.database_path;
        let jwt_secret = config.jwt_secret;
        let secrets_key = jwt_secret.clone();
        let provider_registry = crate::providers::registry::ProviderRegistry::default();
        let acp_definitions = crate::providers::acp_adapter::definitions_from_env(
            std::env::var("JAIT_ACP_PROVIDERS").ok().as_deref(),
        );
        crate::providers::acp_adapter::register_all(&provider_registry, acp_definitions.clone());
        // The native agent loop is always available, as in the Node gateway.
        provider_registry.register(Arc::new(
            crate::providers::jait_provider::JaitProvider::new(NonZeroU16::new(8).unwrap(), 1024)?,
        ));
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
        // The settings page lists the tools this gateway can really run, the same set `/api/tools` offers.
        auth.tools = Some(
            super::chat_tools::project_tool_definitions()
                .map_err(ApplicationError::from)?
                .iter()
                .map(|d| {
                    let text =
                        |key: &str, default: &str| d[key].as_str().unwrap_or(default).to_owned();
                    crate::routes::auth::ToolSettingsInfo {
                        name: text("name", ""),
                        display_name: d["displayName"].as_str().map(str::to_owned),
                        description: text("description", ""),
                        tier: text("tier", "standard"),
                        category: text("category", "general"),
                        source: text("source", "builtin"),
                    }
                })
                .collect(),
        );
        let provider_directory = Arc::new(crate::providers::db_accounts::DbProviderDirectory::new(
            &auth,
            provider_registry.clone(),
            acp_definitions,
            &state_dir,
        )?);
        if let Err(error) =
            super::chat_store::reconcile_startup_owned(&auth, database_owner.clone()).await
        {
            auth.shutdown().await?;
            return Err(error);
        }
        // One queue backs both the chat executor and the consent routes, so an approval
        // reaches the tool call that is waiting on it.
        let consent = crate::security::consent_manager::ConsentManager::default();
        // The settings factory needs the opened auth state, so it is built here on request.
        let factory = match (factory, settings_chat) {
            (Some(factory), _) => Some(factory),
            (None, true) => Some(Arc::new(
                super::chat_settings::SettingsChatFactory::new(
                    auth.clone(),
                    consent.clone(),
                    config.project_root.clone(),
                )
                .with_acp(super::chat_settings::SettingsChatFactory::acp_from_env()),
            ) as Arc<dyn ChatFactory>),
            (None, false) => None,
        };
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
        let terminals = composed_terminal_routes(auth.clone(), &config.project_root);
        // Project roots come from the project records the same store confirms, so the
        // router needs no separately configured root and cannot be pointed elsewhere.
        let projects = ProjectRoutes::new(auth.clone()).with_surfaces(terminals.registry().clone());
        let voice_config = VoiceRouteConfig::from_env();
        let mut voice = VoiceRoutes::new(auth.clone(), voice_config.clone())
            .with_settings(Arc::new(crate::routes::voice::DbVoiceSettings::new(&auth)));
        if let Some(stt) = crate::voice::http::configured_from_env(&voice_config).await {
            voice = voice.with_transcription(Arc::new(stt));
        }
        let assessments =
            super::channels_mount::assessment_registry().map_err(std::io::Error::other)?;
        let mut router = Router::new()
            .route("/health", get(application_health))
            .with_state((auth.clone(), health))
            .merge(auth.clone().router())
            .merge(sessions.router())
            .merge(terminals.router())
            .merge(super::tools_mount::tools_routes(
                &auth,
                consent.clone(),
                config.project_root.clone(),
            ))
            .merge(projects.router())
            .merge(crate::routes::projects::ProjectCollectionRoutes::new(auth.clone()).router())
            .merge(crate::routes::node_credentials::NodeCredentialRoutes { auth: auth.clone() }.router())
            .merge(
                ThreadRoutes::with_provider_check(auth.clone(), {
                    let registry = provider_registry.clone();
                    Arc::new(move |user: &str, provider: &str| {
                        registry.is_visible_to(provider, user)
                    })
                })
                .router(),
            )
            .merge(ReminderRoutes::new(auth.clone()).router())
            .merge(composed_filesystem_routes(auth.clone(), &config.project_root).router())
            .merge(AssistantProfileRoutes { auth: auth.clone() }.router())
            .merge(ArchitectureRoutes { auth: auth.clone() }.router())
            .merge(
                UserQuestionRoutes {
                    auth: auth.clone(),
                    questions: Default::default(),
                }
                .router(),
            )
            .merge(PlanRoutes::new(auth.clone()).router())
            .merge(super::team_chat_mount::TeamChatRoutes { auth: auth.clone() }.router())
            .merge(
                composed_code_graph_routes(auth.clone(), &config.project_root, &state_dir)?
                    .router(),
            )
            .merge(
                UpdateRoutes {
                    auth: auth.clone(),
                    backend: Arc::new(
                        crate::routes::update::ReadOnlyUpdateBackend::new()
                            .map_err(|error| ApplicationError::from(error.detail))?,
                    ),
                    current_version: env!("CARGO_PKG_VERSION").to_owned(),
                    systemd_managed: false,
                }
                .router(),
            )
            .merge(crate::routes::providers::router(
                crate::routes::providers::ProviderRoutes {
                    auth: auth.clone(),
                    directory: Some(provider_directory.clone()),
                    providers: Some(Arc::new(
                        crate::providers::registry_runtime::RegistryRuntime(
                            provider_registry.clone(),
                        ),
                    )),
                    usage: Some(Arc::new(crate::providers::db_accounts::DbUsageStore::new(
                        &auth,
                        provider_directory.accounts(),
                    ))),
                    settings: Some(Arc::new(crate::routes::providers::DbSettingsStore::new(&auth))),
                    probes: None,
                },
            ))
            .merge(RepoProposalRoutes::new(auth.clone()).router())
            .merge(RepositoryRoutes::new(auth.clone()).router())
            .merge(voice.router())
            .merge(
                Router::new()
                    .route("/api/voice-assistant/status", get(voice_assistant_status))
                    .route("/api/sessions/streaming", get(sessions_streaming))
                    .with_state(auth.clone()),
            )
            .merge(
                super::skills_mount::composed_skill_routes(
                    auth.clone(),
                    &config.project_root,
                    &std::env::var_os("HOME")
                        .map(PathBuf::from)
                        .unwrap_or_else(|| config.project_root.clone()),
                    state_dir.to_str(),
                )
                .router(),
            )
            .merge(
                EnvironmentRoutes {
                    auth: auth.clone(),
                    assistants: Some(auth.worker()),
                    projects: Some(auth.worker()),
                    repositories: Some(auth.worker()),
                    network_hosts: Some(auth.worker()),
                    providers: Some(provider_registry.clone()),
                    nodes: None,
                    clock: crate::time::default_clock(),
                }
                .router(),
            )
            .merge(crate::routes::pull_requests::PullRequestRoutes::new(auth.clone()).router())
            .merge(super::channels_mount::screen_share_routes(&auth).router())
            .merge(super::channels_mount::github_app_routes(&auth).router())
            .merge({
                // No registry of running agents exists yet, so a halt reports the stop as
                // failed (a partial result) rather than claiming agents were stopped.
                let mut routes = crate::routes::agent_control::AgentControlRoutes::new(auth.clone());
                routes.stop_running = std::sync::Arc::new(|_| {
                    Box::pin(async {
                        Err("Stopping running agents is not available in the Rust gateway yet".to_string())
                    })
                });
                routes.router()
            })
            .merge(
                crate::routes::trust::TrustRoutes {
                    auth: auth.clone(),
                    trust: crate::security::trust_worker::TrustWorker::from_worker(auth.worker()),
                }
                .router(),
            )
            .merge(super::channels_mount::hook_routes(&auth).router())
            .merge(
                super::channels_mount::email_routes(&auth, &secrets_key)
                    .map_err(std::io::Error::other)?
                    .router(),
            )
            // No preview port is wired yet, so owned sessions answer 503 instead of 404.
            .merge(crate::routes::preview::PreviewRoutes::new(auth.clone()).router())
            .merge(
                super::channels_mount::network_routes(&auth, assessments.clone())
                    .map_err(std::io::Error::other)?
                    .router(),
            )
            .merge(
                super::channels_mount::security_workbench_routes(&auth, &assessments, &config.project_root)
                    .await
                    .router(),
            )
            .merge(
                super::channels_mount::mcp_routes(
                    &auth,
                    consent.clone(),
                    config.project_root.clone(),
                )
                .map_err(std::io::Error::other)?,
            )
            // No browser host or session lookup is wired, so every panel request is refused
            // (404) until the ferridriver-backed browser service supplies a CDP connection.
            .merge(
                crate::routes::browser_devtools::BrowserDevToolsState::new(
                    auth.clone(),
                    secrets_key.clone(),
                )
                .router(),
            )
            .merge(
                crate::routes::security_assessments::SecurityAssessmentRoutes {
                    auth: auth.clone(),
                    assessments,
                    project_database: Some(auth.clone()),
                }
                .router(),
            )
            .merge(
                crate::routes::plugins::PluginRoutes {
                    auth: auth.clone(),
                    manager: super::channels_mount::no_plugins(),
                }
                .router(),
            )
            .merge(
                crate::routes::channels::ChannelRoutes {
                    auth: auth.clone(),
                    host: Arc::new(super::channels_mount::NoConnectors),
                }
                .router(),
            )
            .merge(
                crate::routes::jobs::JobRoutes {
                    auth: auth.clone(),
                    // Scheduled tool execution fails closed until the consent engine
                    // can approve it; job CRUD and run history are served.
                    scheduler: crate::scheduler::service::SchedulerService::new(
                        crate::scheduler::service::SchedulerOptions::new(
                            auth.worker(),
                            config.project_root.to_string_lossy().into_owned(),
                            Arc::new(|_| {
                                Box::pin(async {
                                    Err("Scheduled tool execution is not available in the Rust gateway yet".to_string())
                                })
                            }),
                        ),
                    ),
                    project_root: config.project_root.to_string_lossy().into_owned(),
                    clock: crate::time::default_clock(),
                    providers: Some(provider_registry.clone()),
                    provider_models: Arc::new(|_| Box::pin(async { Ok(Vec::new()) })),
                    jait_models: None,
                }
                .router(),
            )
            .merge(
                crate::routes::maintenance::MaintenanceRoutes {
                    auth: auth.clone(),
                    backend: Arc::new(
                        super::maintenance_mount::ServiceBackend::new(auth.worker())
                            .map_err(ApplicationError::from)?,
                    ),
                    broadcast: None,
                    notifications: None,
                    clock: crate::time::default_clock(),
                }
                .router(),
            )
            .merge(
                CalendarRoutes {
                    auth: auth.clone(),
                    calendar: Arc::new(CalendarService::new(
                        auth.worker(),
                        crate::services::user_secrets::UserSecretService::new(&secrets_key),
                        crate::services::calendar::native_transport()
                            .map_err(ApplicationError::from)?,
                    )),
                    public_base: None,
                }
                .router(),
            )
            .merge(
                GitRoutes::new(auth.clone())
                    .with_authority(super::git_mount::git_authority(&auth))
                    .with_user_secrets(Some(crate::services::user_secrets::UserSecretService::new(
                        &secrets_key,
                    )))
                    .router(),
            )
            .merge(
                SecretRoutes {
                    auth: auth.clone(),
                    secret_input: Default::default(),
                    user_secrets: Some(crate::services::user_secrets::UserSecretService::new(
                        &secrets_key,
                    )),
                }
                .router(),
            );
        if let Some(chat) = &chat {
            router = router.merge(chat.router());
        }
        if settings_chat {
            router = router.merge(
                super::consent_mount::composed_consent_routes(&auth, consent.clone()).router(),
            );
        }
        router = router
            .merge(super::mobile_mount::composed_mobile_routes(&auth, consent.clone()).router());
        if let Some(root) = config
            .web_root
            .as_deref()
            .filter(|r| r.join("index.html").is_file())
        {
            router = router.fallback_service(crate::runtime::web_ui::service(root));
        }
        match Gateway::bind_router(listener, router).await {
            Ok(gateway) => Ok(Self {
                gateway,
                auth,
                chat: chat.map(ChatOwner),
                _database_owner: database_owner,
                store_supervisor: None,
                ws_transport: None,
                consent: settings_chat.then_some(consent),
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

    /// Mount the WebSocket hub using this application's own storage.
    ///
    /// The database-backed authority is installed here rather than taken from the
    /// caller, so a mounted hub can only admit identities that the same store the
    /// authenticated routes use still confirms. Any `user_authority` already present
    /// in `config` is replaced. A hub mounted twice fails closed.
    pub fn mount_websocket(
        &mut self,
        mut config: crate::ws::WsHubConfig,
        max_connections: std::num::NonZeroUsize,
        authority_timeout: std::time::Duration,
    ) -> Result<crate::runtime::ws_transport::WsTransport, ApplicationError> {
        if self.ws_transport.is_some() {
            return Err("websocket hub already mounted".into());
        }
        config.user_authority = Some(Arc::new(crate::ws_user_authority::WsUserAuthority::new(
            self.auth.worker(),
            authority_timeout,
        )));
        // Always verify with the gateway's own signing secret: a hub mounted by the
        // production runtime must not depend on an embedder-supplied token table.
        config.token_verifier = Arc::new(crate::security::ws_verifier::JwtTokenVerifier::new(
            self.auth.signing_secret(),
        ));
        let transport = crate::runtime::ws_transport::WsTransport::new(
            Arc::new(crate::ws::WsHub::new(config)),
            max_connections,
        );
        if let Some(consent) = &self.consent {
            crate::runtime::consent_ws::spawn(consent.clone(), transport.hub());
        }
        self.gateway.mount_websocket(transport.clone());
        self.ws_transport = Some(transport.clone());
        Ok(transport)
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
        let ws = self.ws_transport.clone();
        let shutdown = async move {
            shutdown.await;
            // Refuse new upgrades and wait out live sockets first: their handlers issue
            // bounded reads through the chat and database workers closed below.
            if let Some(transport) = &ws {
                transport.close();
                transport.drain().await;
            }
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
                    allow_non_loopback: false,
                },
                ApplicationConfig {
                    database_path: path.clone(),
                    project_root: path.parent().unwrap().to_path_buf(),
                    jwt_secret: "fixture-secret".into(),
                    cors_origin: String::new(),
                    web_root: None,
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
                allow_non_loopback: false,
            },
            ApplicationConfig {
                database_path: path.clone(),
                project_root: path.parent().unwrap().to_path_buf(),
                jwt_secret: "fixture-secret".into(),
                cors_origin: String::new(),
                web_root: None,
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
                allow_non_loopback: false,
            },
            ApplicationConfig {
                database_path: path,
                project_root: root.clone(),
                jwt_secret: "fixture-secret".into(),
                cors_origin: String::new(),
                web_root: None,
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
        assert_eq!(
            result.err().map(|error| error.to_string()).as_deref(),
            Some("store is closed")
        );
        std::fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test]
    async fn application_mounts_project_routes_into_production_router() {
        use crate::security::http_auth::{self, AuthUser};

        let path = fixture();
        let root = path.parent().unwrap().canonicalize().unwrap();
        let app = Application::bind(
            GatewayConfig {
                address: "127.0.0.1:0".parse().unwrap(),
                allow_non_loopback: false,
            },
            ApplicationConfig {
                database_path: path,
                project_root: root.clone(),
                jwt_secret: "fixture-secret".into(),
                cors_origin: String::new(),
                web_root: None,
                health: None,
            },
        )
        .await
        .unwrap();
        app.auth
            .with_database(|db| {
                db.execute_batch("INSERT INTO users(id,username,password_hash,created_at,updated_at) VALUES('user','user','fixture','old','old')")?;
                Ok(())
            })
            .await
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
        let info = format!("http://{address}/api/project/info");
        // A router that was never merged answers 404; the project router enforces
        // authority before it dispatches.
        assert_eq!(
            client.get(&info).send().await.unwrap().status(),
            reqwest::StatusCode::UNAUTHORIZED
        );
        let user = AuthUser {
            id: "user".into(),
            username: "user".into(),
        };
        let token = http_auth::sign_auth_token(&user, "fixture-secret").unwrap();
        // Authorized traffic reaches the `info` branch: no project record is open.
        let response = client.get(&info).bearer_auth(&token).send().await.unwrap();
        assert_eq!(response.status(), reqwest::StatusCode::NOT_FOUND);
        let body: serde_json::Value = response.json().await.unwrap();
        assert_eq!(body["error"], "NO_PROJECT");
        // Unmapped subpaths still reach the project dispatcher rather than a bare 404,
        // so the merge covers the whole surface instead of one hand-picked path.
        let unknown = format!("http://{address}/api/project/surface-not-registered");
        // An unmerged router answers 404 without consulting authority at all.
        assert_eq!(
            client.get(&unknown).send().await.unwrap().status(),
            reqwest::StatusCode::UNAUTHORIZED
        );
        // Axum's own "no such route" reply carries no body; this envelope proves the
        // native dispatcher ran for a path it does not implement.
        let response = client
            .get(&unknown)
            .bearer_auth(&token)
            .send()
            .await
            .unwrap();
        assert_eq!(response.status(), reqwest::StatusCode::NOT_FOUND);
        let body: serde_json::Value = response.json().await.unwrap();
        assert_eq!(body["error"], "NOT_FOUND");
        assert_eq!(body["message"], "Not found");
        stop.send(()).unwrap();
        tokio::time::timeout(Duration::from_secs(10), task)
            .await
            .unwrap()
            .unwrap()
            .unwrap();
        std::fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test]
    async fn application_serves_owned_project_search_through_production_router() {
        use crate::{
            security::http_auth::{self, AuthUser},
            services::projects::{CreateProject, ProjectService},
        };

        let path = fixture();
        let root = path.parent().unwrap().canonicalize().unwrap();
        let project_dir = root.join("searchable");
        std::fs::create_dir_all(&project_dir).unwrap();
        std::fs::write(
            project_dir.join("needle-file.txt"),
            "hay\nfind the needle here\n",
        )
        .unwrap();
        std::fs::write(project_dir.join("other.txt"), "nothing relevant\n").unwrap();
        let app = Application::bind(
            GatewayConfig {
                address: "127.0.0.1:0".parse().unwrap(),
                allow_non_loopback: false,
            },
            ApplicationConfig {
                database_path: path,
                project_root: root.clone(),
                jwt_secret: "fixture-secret".into(),
                cors_origin: String::new(),
                web_root: None,
                health: None,
            },
        )
        .await
        .unwrap();
        let dir = project_dir.to_string_lossy().into_owned();
        app.auth
            .with_database(move |db| {
                db.execute_batch("INSERT INTO users(id,username,password_hash,created_at,updated_at) VALUES('owner','owner','fixture','old','old'),('other','other','fixture','old','old')")?;
                ProjectService::new(db)
                    .create(CreateProject {
                        user_id: Some("owner".into()),
                        root_path: Some(dir),
                        ..Default::default()
                    })
                    .unwrap();
                Ok(())
            })
            .await
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
        let token = |id: &str| {
            http_auth::sign_auth_token(
                &AuthUser {
                    id: id.into(),
                    username: id.into(),
                },
                "fixture-secret",
            )
            .unwrap()
        };
        let search = |query: &str| format!("http://{address}/api/project/search?{query}");

        assert_eq!(
            client
                .get(search("query=needle"))
                .send()
                .await
                .unwrap()
                .status(),
            reqwest::StatusCode::UNAUTHORIZED
        );

        let files: serde_json::Value = client
            .get(search("query=needle&mode=files"))
            .bearer_auth(token("owner"))
            .send()
            .await
            .unwrap()
            .json()
            .await
            .unwrap();
        assert_eq!(files["files"][0]["path"], "needle-file.txt");

        let content: serde_json::Value = client
            .get(search("query=needle&mode=content"))
            .bearer_auth(token("owner"))
            .send()
            .await
            .unwrap()
            .json()
            .await
            .unwrap();
        assert_eq!(content["matches"][0]["file"], "needle-file.txt");
        assert_eq!(content["matches"][0]["line"], 2);

        // A user who owns no project must not reach another user's root.
        let foreign = client
            .get(search("query=needle&mode=files"))
            .bearer_auth(token("other"))
            .send()
            .await
            .unwrap();
        assert_eq!(foreign.status(), reqwest::StatusCode::NOT_FOUND);

        // An unregistered surface must fail closed, not fall back to the project root.
        let surface = client
            .get(search("query=needle&surfaceId=anything"))
            .bearer_auth(token("owner"))
            .send()
            .await
            .unwrap();
        assert_eq!(surface.status(), reqwest::StatusCode::NOT_FOUND);

        stop.send(()).unwrap();
        tokio::time::timeout(Duration::from_secs(10), task)
            .await
            .unwrap()
            .unwrap()
            .unwrap();
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
                allow_non_loopback: false,
            },
            ApplicationConfig {
                database_path: path,
                project_root: root.clone(),
                jwt_secret: "fixture-secret".into(),
                cors_origin: String::new(),
                web_root: None,
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
                allow_non_loopback: false,
            },
            ApplicationConfig {
                database_path: path,
                project_root: root.clone(),
                jwt_secret: "fixture-secret".into(),
                cors_origin: String::new(),
                web_root: None,
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
        assert_eq!(
            result.err().map(|error| error.to_string()).as_deref(),
            Some("store is closed")
        );
        supervisor.shutdown().await;
        std::fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test]
    async fn cancelled_application_keeps_database_lock_until_job_finishes() {
        let path = fixture();
        let app = Application::bind(
            GatewayConfig {
                address: "127.0.0.1:0".parse().unwrap(),
                allow_non_loopback: false,
            },
            ApplicationConfig {
                database_path: path.clone(),
                project_root: path.parent().unwrap().to_path_buf(),
                jwt_secret: "fixture-secret".into(),
                cors_origin: String::new(),
                web_root: None,
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
            web_root: None,
            health: None,
        };
        let listener = GatewayConfig {
            address: "127.0.0.1:0".parse().unwrap(),
            allow_non_loopback: false,
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

/// Reports whether the realtime voice assistant has an OpenAI key; open like the Node route.
async fn voice_assistant_status() -> axum::response::Response {
    let env = |name: &str, default: &str| {
        std::env::var(name)
            .ok()
            .map(|value| value.trim().to_owned())
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| default.to_owned())
    };
    Json(serde_json::json!({
        "available": !env("OPENAI_API_KEY", "").is_empty(),
        "model": env("OPENAI_REALTIME_MODEL", "gpt-realtime"),
        "voice": std::env::var("OPENAI_REALTIME_VOICE").unwrap_or_else(|_| "alloy".into()),
    }))
    .into_response()
}

/// Sessions generating a reply right now. The native gateway runs no agent turns yet, so the
/// authenticated answer is always empty rather than a guess.
async fn sessions_streaming(
    State(auth): State<AuthState>,
    headers: axum::http::HeaderMap,
) -> axum::response::Response {
    if !auth.origin_allowed(&headers) {
        return (
            axum::http::StatusCode::FORBIDDEN,
            Json(serde_json::json!({"error": "ORIGIN_FORBIDDEN"})),
        )
            .into_response();
    }
    if auth.resolve_user(&headers).is_none() {
        return crate::routes::auth::denied();
    }
    Json(serde_json::json!({"sessionIds": []})).into_response()
}
