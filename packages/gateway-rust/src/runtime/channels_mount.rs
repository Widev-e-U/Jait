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
