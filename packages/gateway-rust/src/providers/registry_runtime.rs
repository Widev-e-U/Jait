//! `ProviderRuntime` view over the real provider registry and user model settings.
use super::{model_fetchers::ModelFetchers, registry::ProviderRegistry};
use crate::{
    routes::providers::{ProviderRuntime, SettingsStore},
    services::jait_models::{self, JaitModelsConfig, ListJaitModelsOptions, ProviderModelInfo},
};
use futures_util::future::BoxFuture;
use serde_json::Value;
use std::{collections::HashMap, sync::Arc};

pub struct RegistryRuntime {
    pub registry: ProviderRegistry,
    pub settings: Arc<dyn SettingsStore>,
    pub fetchers: ModelFetchers,
    pub config: JaitModelsConfig,
}

impl ProviderRuntime for RegistryRuntime {
    fn list(&self) -> Vec<Value> {
        self.registry.list().iter().map(|p| p.info()).collect()
    }
    fn is_visible_to(&self, id: &str, user: &str) -> bool {
        self.registry.is_visible_to(id, user)
    }
    fn list_models(&self, id: &str, user: &str) -> BoxFuture<'static, Result<Vec<Value>, String>> {
        let Some(provider) = self.registry.get_for_user(id, user) else {
            return Box::pin(async { Err("Unknown provider".into()) });
        };
        let fallback = provider.catalogue_models();
        let (id, user) = (id.to_owned(), user.to_owned());
        let settings = self.settings.clone();
        let fetchers = self.fetchers.clone();
        let config = self.config.clone();
        Box::pin(async move {
            let models = fallback.await?;
            if id != "jait" {
                return Ok(models);
            }
            let fallback: Vec<ProviderModelInfo> = models
                .into_iter()
                .filter_map(|m| serde_json::from_value(m).ok())
                .collect();
            let keys: HashMap<String, String> = settings
                .api_keys(&user)
                .await
                .into_iter()
                .filter_map(|(k, v)| v.as_str().map(|v| (k, v.to_owned())))
                .collect();
            let models = jait_models::list_jait_models(
                &ListJaitModelsOptions {
                    config: &config,
                    api_keys: Some(&keys),
                    fallback_models: &fallback,
                    include_cloud: Some(true),
                },
                &fetchers,
            )
            .await;
            Ok(models
                .into_iter()
                .filter_map(|m| serde_json::to_value(m).ok())
                .collect())
        })
    }
    fn reset_models(&self, _user: &str) {
        self.fetchers.reset();
    }
    fn info(&self, id: &str, user: &str) -> Option<Value> {
        self.registry.get_for_user(id, user).map(|p| p.info())
    }
}
