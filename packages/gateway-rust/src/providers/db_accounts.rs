//! Database-backed `/api/provider-accounts` and `/api/provider-usage` stores.
//!
//! Account launchers fail closed: the descriptor-bound launcher the account
//! service requires is not integrated yet, so accounts can be listed, renamed
//! and deleted, but registering a new isolated adapter is refused rather than
//! falling back to an ambient-path launch.

use std::{num::NonZeroU16, path::PathBuf, sync::Arc};

use futures_util::future::BoxFuture;
use serde_json::{Map, Value, json};

use crate::{

    providers::{
        acp_adapter::AcpDefinition,
        registry::{ProviderAdapter, ProviderRegistry},
    },
    routes::{auth::AuthState, providers::{ProviderDirectory, StoreError, UsageStore}},
    runtime::blocking::BlockingLane,
    services::{
        provider_accounts::{
            AccountAdapterFactory, AccountDefinition, AccountLaunch, ProviderAccountService,
        },
        provider_usage::ProviderUsageService,
    },
};

struct FailClosedFactory;

impl AccountAdapterFactory for FailClosedFactory {
    fn build(&self, _launch: AccountLaunch) -> Result<Arc<dyn ProviderAdapter>, String> {
        Err("Account launcher is not integrated".into())
    }
    fn rename(&self, _id: &str, _name: &str) -> Result<(), String> {
        Ok(())
    }
    fn reset_models(&self, _id: &str) -> Result<(), String> {
        Ok(())
    }
}

/// Account types are the ACP definitions; none advertise account support
/// (`auth: false`) until the private launcher exists.
fn definitions(acp: Vec<AcpDefinition>) -> Vec<AccountDefinition> {
    acp.into_iter()
        .map(|d| AccountDefinition {
            id: d.config.id,
            name: d.name,
            description: d.description,
            auth: false,
            command: d.config.command,
            args: d.config.args,
            env: Default::default(),
            registry: Value::Null,
        })
        .collect()
}

pub struct DbProviderDirectory {
    service: ProviderAccountService,
}

impl DbProviderDirectory {
    /// The shared account service, so usage summaries read the same rows.
    pub fn accounts(&self) -> ProviderAccountService {
        self.service.clone()
    }

    pub fn new(
        auth: &AuthState,
        registry: ProviderRegistry,
        acp: Vec<AcpDefinition>,
        state_dir: &std::path::Path,
    ) -> Result<Self, String> {
        let host_home = std::env::var_os("HOME")
            .map(PathBuf::from)
            .filter(|p| p.is_absolute())
            .ok_or("HOME must be an absolute path")?;
        let service = ProviderAccountService::new(
            auth.worker(),
            registry,
            definitions(acp),
            state_dir.join("provider-accounts"),
            host_home,
            None,
            BlockingLane::new(NonZeroU16::new(2).unwrap()),
            Arc::new(FailClosedFactory),
        )?;
        Ok(Self { service })
    }
}

fn store_error(message: String) -> StoreError {
    if message.contains("not supported") || message.contains("required") {
        StoreError::Invalid(message)
    } else if message.contains("busy") || message.contains("pending") {
        StoreError::Conflict(message)
    } else {
        StoreError::Failed(message)
    }
}

fn record(value: impl serde::Serialize) -> Value {
    serde_json::to_value(value).unwrap_or(Value::Null)
}

impl ProviderDirectory for DbProviderDirectory {
    fn refresh_types(&self) -> Vec<Value> {
        self.service.list_types()
    }
    fn list_accounts(&self, user: &str) -> BoxFuture<'static, Result<Vec<Value>, StoreError>> {
        let (service, user) = (self.service.clone(), user.to_owned());
        Box::pin(async move {
            service
                .list(user)
                .await
                .map(|rows| rows.into_iter().map(record).collect())
                .map_err(store_error)
        })
    }
    fn get_account(&self, id: &str, user: &str) -> BoxFuture<'static, Option<Value>> {
        let (service, id, user) = (self.service.clone(), id.to_owned(), user.to_owned());
        Box::pin(async move { service.get(id, user).await.ok().flatten().map(record) })
    }
    fn create_account(
        &self,
        user: &str,
        body: &Map<String, Value>,
    ) -> BoxFuture<'static, Result<Value, StoreError>> {
        let service = self.service.clone();
        let user = user.to_owned();
        let provider = body
            .get("providerType")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_owned();
        let label = body
            .get("label")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_owned();
        let node = body.get("nodeId").and_then(Value::as_str).map(str::to_owned);
        Box::pin(async move {
            service
                .create(user, provider, &label, node.as_deref())
                .await
                .map(record)
                .map_err(store_error)
        })
    }
    fn rename_account(
        &self,
        id: &str,
        user: &str,
        label: &str,
    ) -> BoxFuture<'static, Result<Value, StoreError>> {
        let (service, id, user, label) = (
            self.service.clone(),
            id.to_owned(),
            user.to_owned(),
            label.to_owned(),
        );
        Box::pin(async move {
            match service.rename(id, user, &label).await {
                Ok(Some(account)) => Ok(record(account)),
                Ok(None) => Err(StoreError::NotFound("Provider account not found".into())),
                Err(message) => Err(store_error(message)),
            }
        })
    }
    fn delete_account(&self, id: &str, user: &str) -> BoxFuture<'static, Result<bool, StoreError>> {
        let (service, id, user) = (self.service.clone(), id.to_owned(), user.to_owned());
        Box::pin(async move { service.delete(id, user).await.map_err(store_error) })
    }
}

/// Usage rows for the authenticated user's accounts.
pub struct DbUsageStore {
    service: ProviderUsageService,
    accounts: ProviderAccountService,
}

impl DbUsageStore {
    pub fn new(auth: &AuthState, accounts: ProviderAccountService) -> Self {
        Self {
            service: ProviderUsageService::new(auth.worker(), None),
            accounts,
        }
    }
}

impl UsageStore for DbUsageStore {
    fn list_for_user(&self, user: &str, account_ids: &[String]) -> BoxFuture<'static, Vec<Value>> {
        let (service, user, ids) = (self.service.clone(), user.to_owned(), account_ids.to_vec());
        Box::pin(async move { service.list_for_user(user, ids).await.unwrap_or_default() })
    }

    /// TS `readUsageSummary` over locally observed quotas. Live provider
    /// refreshes (Ollama, OpenCode Go) need the outbound quota fetchers, which
    /// are not ported, so a refresh reports the same stored observations.
    fn summary(&self, user: &str, _refresh: bool) -> BoxFuture<'static, Result<Value, String>> {
        let (usage, accounts, user) = (self.service.clone(), self.accounts.clone(), user.to_owned());
        Box::pin(async move {
            let rows: Vec<Value> = accounts
                .list(user.clone())
                .await?
                .into_iter()
                .map(record)
                .collect();
            let ids: Vec<String> = rows
                .iter()
                .filter_map(|row| row["id"].as_str().map(str::to_owned))
                .collect();
            let quotas = usage.list_for_user(user, ids).await?;
            let now = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
            Ok(crate::services::usage_summary::summarize_provider_usage(
                &rows,
                &quotas,
                &json!({}),
                &now,
            ))
        })
    }
}
