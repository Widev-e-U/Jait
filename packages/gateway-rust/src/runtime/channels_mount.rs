//! Production channel host with no connectors. Telegram and the other chat
//! connectors are network effects that are not ported yet, so the registry is
//! empty: the list is empty, every id is unknown and nothing can be started.
use crate::{
    integrations::channel_contracts::ChannelPairOptions,
    routes::channels::{ChannelError, ChannelFields, ChannelHost, ChannelRecord, ChannelResult},
};
use futures_util::future::BoxFuture;
use serde_json::Value;

pub struct NoConnectors;

fn unavailable<T>() -> ChannelResult<T> {
    Err(ChannelError::Message(
        "No channel connectors are available in the Rust gateway yet".into(),
    ))
}

impl ChannelHost for NoConnectors {
    fn list(&self) -> ChannelResult<Vec<ChannelFields>> {
        Ok(Vec::new())
    }
    fn get(&self, _: &str) -> ChannelResult<Option<ChannelRecord>> {
        Ok(None)
    }
    fn config(&self, _: &str) -> ChannelResult<ChannelFields> {
        unavailable()
    }
    fn set_config(&self, _: &str, _: ChannelFields) -> ChannelResult<ChannelFields> {
        unavailable()
    }
    fn current_qr(&self, _: &str) -> ChannelResult<Value> {
        Ok(Value::Null)
    }
    fn setup(&self, _: String) -> BoxFuture<'_, ChannelResult<Option<Value>>> {
        Box::pin(async { Ok(None) })
    }
    fn start(&self, _: String, _: ChannelPairOptions) -> BoxFuture<'_, ChannelResult<()>> {
        Box::pin(async { unavailable() })
    }
    fn stop(&self, _: String) -> BoxFuture<'_, ChannelResult<()>> {
        Box::pin(async { unavailable() })
    }
    fn pair(&self, _: String, _: ChannelPairOptions) -> BoxFuture<'_, ChannelResult<()>> {
        Box::pin(async { unavailable() })
    }
}

/// Plugin loading executes third-party code, so the Rust gateway lists none and
/// refuses every other operation until a sandboxed loader exists.
pub fn no_plugins() -> crate::routes::plugins::PluginManagerPort {
    use crate::routes::plugins::{PluginError, PluginOperation};
    std::sync::Arc::new(|op| {
        Box::pin(async move {
            match op {
                PluginOperation::List => Ok(serde_json::json!([])),
                PluginOperation::Get(_) => Ok(serde_json::Value::Null),
                _ => Err(PluginError::Message(
                    "Plugins are not available in the Rust gateway yet".to_string(),
                )),
            }
        })
    })
}

/// Network routes on the canonical assessment registry and bounded Docker inventory.
/// The local view is empty until a native platform view exists; scans still require
/// an explicit owner-scoped assessment scope.
pub fn assessment_registry() -> Result<crate::assessments::service::AssessmentRegistry, String> {
    use crate::assessments::service::{AssessmentOptions, AssessmentRegistry};
    let vantage = std::env::var("HOSTNAME")
        .ok()
        .filter(|h| !h.is_empty())
        .unwrap_or_else(|| "gateway".to_string());
    Ok(AssessmentRegistry::new(AssessmentOptions::new(vantage)?))
}

pub fn network_routes(
    auth: &crate::routes::auth::AuthState,
    registry: crate::assessments::service::AssessmentRegistry,
) -> Result<crate::routes::network::NetworkRoutes, String> {
    use crate::{
        routes::network::{LocalNetworkSnapshot, LocalNetworkView, NetworkRoutes},
        services::network_resources::{
            DockerResourceInventory, LocalDockerRunner, SystemDockerHost,
        },
    };
    let local: LocalNetworkView = std::sync::Arc::new(|_| {
        Box::pin(async {
            Ok(LocalNetworkSnapshot {
                interfaces: Vec::new(),
                local_addresses: Vec::new(),
                gateway: serde_json::Value::Null,
                filesystem_nodes: Vec::new(),
                companion_devices: Vec::new(),
            })
        })
    });
    let inventory = std::sync::Arc::new(DockerResourceInventory::new(LocalDockerRunner::new(
        SystemDockerHost::new(),
    )));
    Ok(NetworkRoutes::new(
        auth.clone(),
        registry,
        local,
        inventory,
        crate::time::default_clock(),
    ))
}

/// Screen-share state is tracked in memory. Nothing can reach a host device or capture
/// the screen yet, so every effect except the broadcast bookkeeping fails closed.
pub fn screen_share_routes(
    auth: &crate::routes::auth::AuthState,
) -> crate::routes::screen_share::ScreenShareRoutes {
    use crate::routes::screen_share::{ScreenShareEffect, ScreenShareError};
    crate::routes::screen_share::ScreenShareRoutes {
        auth: auth.clone(),
        service: std::sync::Arc::new(std::sync::Mutex::new(Default::default())),
        port: std::sync::Arc::new(|effect| match effect {
            ScreenShareEffect::Broadcast(_) => Ok(serde_json::Value::Null),
            _ => Err(ScreenShareError::Message(
                "Screen sharing is not available in the Rust gateway yet".into(),
            )),
        }),
    }
}

/// Webhook endpoints behind the `HOOK_SECRET` token (a random per-process secret when
/// unset, which no caller can know). No agent runtime is wired to wake or run yet, so a
/// correctly authenticated hook is acknowledged by the emitter and then fails closed.
pub fn hook_routes(auth: &crate::routes::auth::AuthState) -> crate::routes::hooks::HookRoutes {
    let hook_secret = std::env::var("HOOK_SECRET")
        .ok()
        .map(|s| s.trim().to_owned())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| {
            format!(
                "{}{}",
                uuid::Uuid::new_v4().simple(),
                uuid::Uuid::new_v4().simple()
            )
        });
    let unavailable: crate::routes::hooks::HookCallback = std::sync::Arc::new(|_| {
        Box::pin(async {
            Err("Hook handling is not available in the Rust gateway yet".to_string())
        })
    });
    crate::routes::hooks::HookRoutes {
        auth: auth.clone(),
        hook_secret,
        emit: std::sync::Arc::new(|_, _| Ok(())),
        on_wake: unavailable.clone(),
        on_agent: unavailable,
    }
}

/// IMAP/SMTP needs an owner-bound, consent-gated protocol host that is not composed yet,
/// so those sessions fail closed. Gmail/Outlook OAuth and the config endpoints use the
/// native HTTPS transport.
struct NoMailProtocol;

impl crate::services::email::imap::MailProtocolHost for NoMailProtocol {
    fn imap(
        &self,
        _: crate::services::email::connection::PinnedMailServer,
        _: crate::services::email::imap::ProtocolLimits,
    ) -> BoxFuture<'_, Result<Box<dyn crate::services::email::imap::ImapSession>, String>> {
        Box::pin(async { Err("IMAP is not available in the Rust gateway yet".to_string()) })
    }
    fn smtp(
        &self,
        _: crate::services::email::connection::PinnedMailServer,
        _: crate::services::email::imap::ProtocolLimits,
        _: Option<crate::services::email::imap::SmtpMessage>,
    ) -> BoxFuture<'_, Result<Option<String>, String>> {
        Box::pin(async { Err("SMTP is not available in the Rust gateway yet".to_string()) })
    }
    fn parse_mime(
        &self,
        _: Vec<u8>,
        _: usize,
    ) -> BoxFuture<'_, Result<crate::services::email::imap::ParsedMime, String>> {
        Box::pin(async { Err("Mail parsing is not available in the Rust gateway yet".to_string()) })
    }
}

pub fn email_routes(
    auth: &crate::routes::auth::AuthState,
    secrets_key: &str,
) -> Result<crate::routes::email::EmailRoutes, String> {
    use crate::services::email::{
        EmailService, connection::mail_resolver, remote_images, transport::native_transport,
    };
    let resolver = mail_resolver();
    Ok(crate::routes::email::EmailRoutes {
        auth: auth.clone(),
        email: std::sync::Arc::new(EmailService::new(
            auth.worker(),
            crate::services::user_secrets::UserSecretService::new(secrets_key),
            native_transport()?,
            std::sync::Arc::new(NoMailProtocol),
            resolver.clone(),
        )),
        public_base: None,
        image_resolver: resolver,
        image_transport: remote_images::native_transport(),
    })
}

/// GitHub App credentials, signed state and installation effects have no native host yet.
/// The listing is empty, every agent is unknown and every other operation is refused,
/// so a webhook can never be verified against a secret and is rejected.
pub fn github_app_routes(
    auth: &crate::routes::auth::AuthState,
) -> crate::routes::agent_github_apps::GithubAppRoutes {
    use crate::{services::agent_github_port::GithubOperation as Op, tools::core_io::HostError};
    crate::routes::agent_github_apps::GithubAppRoutes {
        auth: auth.clone(),
        port: std::sync::Arc::new(|op| {
            Box::pin(async move {
                match op {
                    Op::List(_) => Ok(serde_json::json!([])),
                    Op::PublicBaseUrl => Ok(serde_json::json!("")),
                    _ => Err(HostError::Error(
                        "GitHub Apps are not available in the Rust gateway yet".to_string(),
                    )),
                }
            })
        }),
        agent_exists: Some(std::sync::Arc::new(|_, _| false)),
        on_webhook: None,
        intake: None,
    }
}

/// Security workbench on the shared assessment registry. No scanner engine is ported yet:
/// the engine inventory is empty and every check run is refused as unavailable, so nothing
/// is probed. History, comparison, decision and report endpoints work on the in-memory
/// store. The monitor route is not mounted.
pub async fn security_workbench_routes(
    auth: &crate::routes::auth::AuthState,
    assessments: &crate::assessments::service::AssessmentRegistry,
    project_root: &std::path::Path,
) -> crate::routes::security_workbench::SecurityWorkbenchRoutes {
    use crate::assessments::workbench::{EngineError, WorkbenchOptions, WorkbenchRegistry};
    let adapter: crate::assessments::workbench::CheckAdapter = std::sync::Arc::new(|_, _| {
        Box::pin(async {
            Err(EngineError::Unavailable(
                "No security scanner engines are available in the Rust gateway yet".into(),
            ))
        })
    });
    let engines: crate::assessments::workbench::EngineStatus =
        std::sync::Arc::new(|_| Box::pin(async { Ok(serde_json::json!([])) }));
    let registry = WorkbenchRegistry::new(
        assessments.get().await,
        WorkbenchOptions::new(adapter, engines),
    );
    crate::routes::security_workbench::SecurityWorkbenchRoutes {
        auth: auth.clone(),
        service: crate::routes::security_workbench::registry_port(registry),
        monitor: None,
        project_root: project_root.display().to_string(),
        request_id: std::sync::Arc::new(|| uuid::Uuid::new_v4().to_string()),
    }
}

/// MCP caller resolution on the gateway's own bearer auth and origin policy. Anonymous
/// callers get the standard login error. A session id (`x-jait-session-id` or `sessionId`)
/// is only honored when it names an active session owned by the caller; its stored project
/// path (else the gateway project root) becomes the tool root. Nothing else is trusted.
struct McpBearerAuth {
    auth: crate::routes::auth::AuthState,
    project_root: std::path::PathBuf,
}

impl crate::routes::mcp_server::McpAuthenticator for McpBearerAuth {
    fn resolve<'a>(
        &'a self,
        headers: &'a axum::http::HeaderMap,
        query: &'a std::collections::HashMap<String, String>,
    ) -> BoxFuture<'a, Result<crate::routes::mcp_server::McpToolContext, axum::response::Response>>
    {
        Box::pin(async move {
            let user = crate::routes::auth::require_user(&self.auth, headers)
                .await
                .map_err(|response| *response)?;
            let mut context = crate::routes::mcp_server::McpToolContext {
                user_id: Some(user.id.clone()),
                ..Default::default()
            };
            let requested = headers
                .get("x-jait-session-id")
                .and_then(|v| v.to_str().ok())
                .or_else(|| query.get("sessionId").map(String::as_str))
                .map(str::trim)
                .filter(|s| !s.is_empty() && s.len() <= 256 && !s.chars().any(char::is_control))
                .map(str::to_owned);
            if let Some(session_id) = requested {
                let (owner, lookup) = (user.id, session_id.clone());
                let session = self
                    .auth
                    .with_database(move |db| {
                        Ok(crate::services::sessions::SessionService::new(db)
                            .get(&lookup, Some(&owner))?
                            .filter(|s| s.status.as_deref() == Some("active")))
                    })
                    .await
                    .map_err(|_| crate::routes::auth::internal_error())?
                    .ok_or_else(|| {
                        crate::routes::auth::response(
                            404,
                            serde_json::json!({"error": "Resource not found"}),
                        )
                    })?;
                context.session_id = Some(session_id);
                context.project_root = Some(
                    session
                        .project_path
                        .unwrap_or_else(|| self.project_root.display().to_string()),
                );
            }
            Ok(context)
        })
    }
}

/// The tools the gateway can really run, executed through the same `ConsentAwareExecutor`
/// as chat, so consent, path confinement and cancellation are unchanged. Execution needs a
/// caller-owned session; there is no default session and no caller-chosen root.
struct ProjectMcpTools {
    consent: crate::security::consent_manager::ConsentManager,
    descriptors: Vec<crate::routes::mcp_server::McpToolDescriptor>,
}

impl ProjectMcpTools {
    fn new(consent: crate::security::consent_manager::ConsentManager) -> Result<Self, String> {
        let descriptors = super::chat_tools::project_tool_definitions()?
            .iter()
            .map(|d| {
                let name = d["name"].as_str().unwrap_or_default();
                let risk = match name {
                    "file.read" | "file.list" => "read",
                    "terminal.run" => "execute",
                    _ => "write",
                };
                crate::routes::mcp_server::McpToolDescriptor::from_registry_entry(
                    name,
                    d["displayName"].as_str().unwrap_or(name),
                    d["description"].as_str().unwrap_or_default(),
                    d["parameters"].clone(),
                    risk,
                    d["category"].as_str().unwrap_or("core"),
                    true,
                )
            })
            .collect();
        Ok(Self {
            consent,
            descriptors,
        })
    }
}

impl crate::routes::mcp_server::McpToolSource for ProjectMcpTools {
    fn list(&self) -> Vec<crate::routes::mcp_server::McpToolDescriptor> {
        self.descriptors.clone()
    }
    fn get(&self, name: &str) -> Option<crate::routes::mcp_server::McpToolDescriptor> {
        self.descriptors.iter().find(|d| d.name == name).cloned()
    }
    fn execute<'a>(
        &'a self,
        name: &'a str,
        args: Value,
        ctx: crate::routes::mcp_server::McpToolContext,
    ) -> BoxFuture<'a, Result<crate::routes::mcp_server::McpToolOutcome, String>> {
        Box::pin(async move {
            if self.get(name).is_none() {
                return Err(format!("Unknown tool: {name}"));
            }
            let (Some(user_id), Some(session_id), Some(root)) =
                (ctx.user_id, ctx.session_id, ctx.project_root)
            else {
                return Err("An owned session is required (x-jait-session-id)".into());
            };
            let project_root = std::path::PathBuf::from(root);
            if !project_root.is_absolute() {
                return Err("Session project root is invalid".into());
            }
            let (_, executor) =
                super::chat_tools::project_tools(&user_id, &session_id, self.consent.clone())?;
            let context = crate::security::consent_executor::ToolExecutionContext {
                user_id,
                session_id,
                action_id: ctx.action_id,
                project_root,
                origin: crate::security::consent_executor::ExecutionOrigin::Agent,
                runtime_mode: crate::security::consent_executor::RuntimeMode::Guarded,
                cancellation: Default::default(),
                on_output: None,
            };
            let result = executor
                .execute(
                    name,
                    &args,
                    &context,
                    crate::security::consent_executor::ExecuteOptions::default(),
                )
                .await?;
            let text = serde_json::to_string(&result).map_err(|e| e.to_string())?;
            Ok(crate::routes::mcp_server::McpToolOutcome {
                ok: result.ok,
                content: vec![serde_json::json!({"type": "text", "text": text})],
            })
        })
    }
}

/// `/mcp*` for authenticated callers, exposing the native project tools behind consent.
pub fn mcp_routes(
    auth: &crate::routes::auth::AuthState,
    consent: crate::security::consent_manager::ConsentManager,
    project_root: std::path::PathBuf,
) -> Result<axum::Router, String> {
    Ok(crate::routes::mcp_server::router(
        crate::routes::mcp_server::McpRoutes::new()
            .with_tools(std::sync::Arc::new(ProjectMcpTools::new(consent)?))
            .with_auth(std::sync::Arc::new(McpBearerAuth {
                auth: auth.clone(),
                project_root,
            })),
    ))
}
