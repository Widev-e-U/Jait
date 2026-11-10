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
pub fn network_routes(
    auth: &crate::routes::auth::AuthState,
) -> Result<crate::routes::network::NetworkRoutes, String> {
    use crate::{
        assessments::service::{AssessmentOptions, AssessmentRegistry},
        routes::network::{LocalNetworkSnapshot, LocalNetworkView, NetworkRoutes},
        services::network_resources::{
            DockerResourceInventory, LocalDockerRunner, SystemDockerHost,
        },
    };
    let vantage = std::env::var("HOSTNAME")
        .ok()
        .filter(|h| !h.is_empty())
        .unwrap_or_else(|| "gateway".to_string());
    let registry = AssessmentRegistry::new(AssessmentOptions::new(vantage)?);
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
        .unwrap_or_else(|| format!("{}{}", uuid::Uuid::new_v4().simple(), uuid::Uuid::new_v4().simple()));
    let unavailable: crate::routes::hooks::HookCallback = std::sync::Arc::new(|_| {
        Box::pin(async { Err("Hook handling is not available in the Rust gateway yet".to_string()) })
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
