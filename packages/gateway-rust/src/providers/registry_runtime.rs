//! `ProviderRuntime` view over the real [`ProviderRegistry`] for `/api/providers`.
use super::registry::ProviderRegistry;
use crate::routes::providers::ProviderRuntime;
use futures_util::future::BoxFuture;
use serde_json::Value;

pub struct RegistryRuntime(pub ProviderRegistry);

impl ProviderRuntime for RegistryRuntime {
    fn list(&self) -> Vec<Value> {
        self.0.list().iter().map(|p| p.info()).collect()
    }
    fn is_visible_to(&self, id: &str, user: &str) -> bool {
        self.0.is_visible_to(id, user)
    }
    fn list_models(&self, id: &str, user: &str) -> BoxFuture<'static, Result<Vec<Value>, String>> {
        match self.0.get_for_user(id, user) {
            Some(provider) => provider.catalogue_models(),
            None => Box::pin(async { Err("Unknown provider".into()) }),
        }
    }
    fn info(&self, id: &str, user: &str) -> Option<Value> {
        self.0.get_for_user(id, user).map(|p| p.info())
    }
}
