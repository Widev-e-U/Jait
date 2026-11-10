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
