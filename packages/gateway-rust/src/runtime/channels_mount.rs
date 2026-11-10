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
