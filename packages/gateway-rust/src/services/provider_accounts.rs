//! Account persistence and isolated ACP launch plans. The coordinator supplies
//! the ACP adapter factory; this service never runs a process with ambient HOME.
use crate::{
    db::worker::DatabaseWorker,
    execution::process_runner::ProcessCancellation,
    providers::registry::{ProviderAdapter, ProviderRegistry},
    runtime::blocking::BlockingLane,
    text::js_trim,
};
use chrono::{SecondsFormat, Utc};
use rusqlite::{OptionalExtension, params};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::{Arc, RwLock},
};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderAccountRecord {
    pub id: String,
    pub user_id: String,
    pub provider_type: String,
    pub node_id: String,
    pub label: String,
    pub created_at: String,
    pub updated_at: String,
}
#[derive(Clone)]
pub struct AccountDefinition {
    pub id: String,
    pub name: String,
    pub description: String,
    pub auth: bool,
    pub command: String,
    pub args: Vec<String>,
    pub env: HashMap<String, String>,
    pub registry: Value,
}
// No Debug or Serialize: environments can contain credentials.
pub struct AccountLaunch {
    pub account: ProviderAccountRecord,
    pub name: String,
    pub command: String,
    pub args: Vec<String>,
    pub env: HashMap<String, String>,
    pub auth: bool,
    pub execution_node_id: Option<String>,
}
/// An owning launcher must retain this lease through child cleanup, bind the
/// child home to its descriptor (e.g. a reviewed namespace/mount mechanism), and
/// reject replacement rather than resolving AccountLaunch.env paths afresh.
/// A lease alone does not make a path-based child launcher safe.
pub struct AccountHomeLease(Arc<PrivateHome>);
impl AccountHomeLease {
    pub fn verify(&self) -> Result<(), String> {
        self.0.verify()
    }
    #[cfg(unix)]
    pub fn directory(&self) -> Result<std::fs::File, String> {
        self.0.directory()
    }
}
pub trait AccountAdapterFactory: Send + Sync {
    fn build(&self, launch: AccountLaunch) -> Result<Arc<dyn ProviderAdapter>, String>;
    /// Default is fail closed; never fall back to the ambient path launcher.
    fn build_private(
        &self,
        _launch: AccountLaunch,
        _home: AccountHomeLease,
    ) -> Result<Arc<dyn ProviderAdapter>, String> {
        Err("Descriptor-bound account launcher is not integrated".into())
    }
    /// Fence new sessions/probes, stop and reap every child/descendant for this
    /// account, and release all AccountHomeLeases before returning success.
    /// Must be idempotent; cancellation/error must leave admission fenced.
    /// Registry dispose alone is insufficient (its default is a no-op).
    fn quiesce_private(
        &self,
        _id: &str,
        _cancel: ProcessCancellation,
    ) -> futures_util::future::BoxFuture<'static, Result<(), String>> {
        Box::pin(async { Err("Account process quiescence is not integrated".into()) })
    }
    /// Update an existing adapter's display name without discarding active sessions.
    fn rename(&self, id: &str, name: &str) -> Result<(), String>;
    /// Invalidate model and authentication probes after credential replacement.
    fn reset_models(&self, id: &str) -> Result<(), String>;
}
#[derive(Clone)]
pub struct ProviderAccountService {
    db: DatabaseWorker,
    registry: ProviderRegistry,
    definitions: Arc<RwLock<Vec<AccountDefinition>>>,
    root: PathBuf,
    host_home: PathBuf,
    npm_cache: Option<String>,
    files: BlockingLane,
    factory: Arc<dyn AccountAdapterFactory>,
    lifecycle: Arc<tokio::sync::Mutex<()>>,
    homes: Arc<RwLock<HashMap<String, Arc<PrivateHome>>>>,
    // None: fenced, not moved; Some: pinned quarantine, including partial cleanup.
    deleting: Arc<RwLock<HashMap<String, Option<Arc<PrivateHome>>>>>,
}
fn timestamp() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}
fn label(value: &str) -> Result<String, String> {
    let v = js_trim(value);
    if v.is_empty() {
        Err("Account label is required".into())
    } else if v.encode_utf16().count() > 80 {
        Err("Account label must be 80 characters or fewer".into())
    } else {
        Ok(v.into())
    }
}
fn safe_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 200
        && id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}
fn row(r: &rusqlite::Row<'_>) -> rusqlite::Result<ProviderAccountRecord> {
    Ok(ProviderAccountRecord {
        id: r.get(0)?,
        user_id: r.get(1)?,
        provider_type: r.get(2)?,
        node_id: r.get(3)?,
        label: r.get(4)?,
        created_at: r.get(5)?,
        updated_at: r.get(6)?,
    })
}
const SELECT: &str =
    "SELECT id,user_id,provider_type,node_id,label,created_at,updated_at FROM provider_accounts";
impl ProviderAccountService {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        db: DatabaseWorker,
        registry: ProviderRegistry,
        definitions: Vec<AccountDefinition>,
        root: PathBuf,
        host_home: PathBuf,
        npm_cache: Option<String>,
        files: BlockingLane,
        factory: Arc<dyn AccountAdapterFactory>,
    ) -> Result<Self, String> {
        if !root.is_absolute() || !host_home.is_absolute() {
            return Err("Account storage paths must be absolute".into());
        }
        Ok(Self {
            db,
            registry,
            definitions: Arc::new(RwLock::new(definitions)),
            root,
            host_home,
            npm_cache,
            files,
            factory,
            lifecycle: Arc::new(tokio::sync::Mutex::new(())),
            homes: Default::default(),
            deleting: Default::default(),
        })
    }
    pub fn list_types(&self) -> Vec<Value> {
        self.definitions
            .read()
            .unwrap()
            .iter()
            .filter(|d| d.auth)
            .map(|d| {
                let mut v = json!({"providerType":d.id,"name":d.name,"description":d.description});
                for k in ["version", "distribution", "icon", "website", "repository"] {
                    if let Some(s) = d.registry[k].as_str().filter(|s| !s.is_empty()) {
                        v[k] = json!(s);
                    }
                }
                v
            })
            .collect()
    }
    pub fn refresh_types(&self, definitions: Vec<AccountDefinition>) -> Vec<Value> {
        if !definitions.is_empty() {
            *self.definitions.write().unwrap() = definitions;
        }
        self.list_types()
    }
    pub async fn list(&self, user: String) -> Result<Vec<ProviderAccountRecord>, String> {
        self.db
            .run(move |db| {
                let mut stmt = db.prepare(&format!("{SELECT} WHERE user_id=?1"))?;
                Ok(stmt
                    .query_map([user], row)?
                    .collect::<Result<Vec<_>, _>>()?)
            })
            .await
            .map_err(|e| e.to_string())
    }
    pub async fn get(
        &self,
        id: String,
        user: String,
    ) -> Result<Option<ProviderAccountRecord>, String> {
        self.db
            .run(move |db| {
                Ok(db
                    .query_row(
                        &format!("{SELECT} WHERE id=?1 AND user_id=?2"),
                        params![id, user],
                        row,
                    )
                    .optional()?)
            })
            .await
            .map_err(|e| e.to_string())
    }
    fn account_home(&self, id: &str) -> Result<PathBuf, String> {
        if !safe_id(id) {
            return Err("Invalid provider account id".into());
        }
        Ok(self.root.join(id))
    }
    // Cache directory identities for this service lifetime. Never silently adopt a
    // replacement home after credentials or a child have used the original.
    async fn private_home(&self, id: &str) -> Result<Arc<PrivateHome>, String> {
        if self
            .deleting
            .read()
            .map_err(|_| "Account storage unavailable")?
            .contains_key(id)
        {
            return Err("Account deletion is pending; retry deletion before reuse".into());
        }
        let path = self.account_home(id)?;
        let homes = self.homes.clone();
        let deleting = self.deleting.clone();
        let id = id.to_string();
        self.files
            .run(move || {
                let mut homes = homes.write().map_err(|_| "Account storage unavailable")?;
                if let Some(home) = homes.get(&id) {
                    home.verify()?;
                    return Ok(home.clone());
                }
                // Retained descriptors are a bounded service resource. Do not
                // evict identities and silently adopt replacement directories.
                let retained: usize = homes
                    .values()
                    .map(|home| home.descriptor_count())
                    .sum::<usize>()
                    + deleting
                        .read()
                        .map_err(|_| "Account storage unavailable")?
                        .values()
                        .filter_map(Option::as_ref)
                        .map(|home| home.descriptor_count())
                        .sum::<usize>();
                if retained.saturating_add(path.components().count()) > 256 {
                    return Err("Account directory descriptor capacity reached".into());
                }
                let home = Arc::new(PrivateHome::open(&path)?);
                homes.insert(id, home.clone());
                Ok(home)
            })
            .await
            .map_err(|_| "Account filesystem worker unavailable")?
    }
    /// A remote account receives no local filesystem paths or inherited secrets.
    pub fn launch_plan(
        &self,
        account: &ProviderAccountRecord,
    ) -> Result<Option<AccountLaunch>, String> {
        let definition = self
            .definitions
            .read()
            .unwrap()
            .iter()
            .find(|d| d.id == account.provider_type)
            .cloned();
        let Some(d) = definition else { return Ok(None) };
        let local = account.node_id == "gateway";
        let home = self.account_home(&account.id)?;
        let mut env = if local { d.env.clone() } else { HashMap::new() };
        if local {
            for (k, v) in [
                ("HOME", home.clone()),
                ("USERPROFILE", home.clone()),
                ("XDG_CONFIG_HOME", home.join(".config")),
                ("XDG_DATA_HOME", home.join(".local/share")),
                ("XDG_CACHE_HOME", home.join(".cache")),
            ] {
                env.insert(k.into(), v.to_string_lossy().into_owned());
            }
            env.entry("NPM_CONFIG_CACHE".into()).or_insert_with(|| {
                self.npm_cache
                    .clone()
                    .unwrap_or_else(|| self.host_home.join(".npm").to_string_lossy().into_owned())
            });
            if account.provider_type == "codex" {
                env.insert("CODEX_HOME".into(), home.to_string_lossy().into_owned());
                env.insert("OPENAI_API_KEY".into(), String::new());
            }
            if account.provider_type == "claude-code" {
                env.insert(
                    "CLAUDE_CONFIG_DIR".into(),
                    home.join(".claude").to_string_lossy().into_owned(),
                );
                env.insert("ANTHROPIC_API_KEY".into(), String::new());
            }
        }
        Ok(Some(AccountLaunch {
            account: account.clone(),
            name: format!("{} — {}", d.name, account.label),
            command: d.command,
            args: d.args,
            env,
            auth: local && d.auth,
            execution_node_id: (!local).then(|| account.node_id.clone()),
        }))
    }
    async fn register(&self, account: &ProviderAccountRecord) -> Result<(), String> {
        if self
            .deleting
            .read()
            .map_err(|_| "Account storage unavailable")?
            .contains_key(&account.id)
        {
            return Err("Account deletion is pending".into());
        }
        let Some(plan) = self.launch_plan(account)? else {
            return Ok(());
        };
        let adapter = if account.node_id == "gateway" {
            let home = self.private_home(&account.id).await?;
            self.factory.build_private(plan, AccountHomeLease(home))
        } else {
            self.factory.build(plan)
        }
        .map_err(|_| "Account adapter registration failed (private launcher required locally)")?;
        if adapter.id() != account.id || adapter.owner_user_id() != Some(account.user_id.as_str()) {
            // A factory may already own child resources; reject and reap them.
            let _ = adapter.dispose().await;
            return Err("Account adapter ownership mismatch".into());
        }
        if let Some(existing) = self.registry.get(&account.id) {
            if existing.owner_user_id() != Some(account.user_id.as_str()) {
                let _ = adapter.dispose().await;
                return Err("Account adapter ownership mismatch".into());
            }
            if self.registry.unregister(&account.id).await.is_err() {
                let _ = adapter.dispose().await;
                return Err("Previous account adapter cleanup failed".into());
            }
        }
        self.registry.register(adapter);
        Ok(())
    }
    pub async fn load(&self) -> Result<(), String> {
        let _guard = self
            .lifecycle
            .try_lock()
            .map_err(|_| "Provider accounts are busy")?;
        let accounts = self
            .db
            .run(|db| {
                let mut stmt = db.prepare(SELECT)?;
                Ok(stmt.query_map([], row)?.collect::<Result<Vec<_>, _>>()?)
            })
            .await
            .map_err(|e| e.to_string())?;
        for account in accounts {
            self.register(&account).await?;
        }
        Ok(())
    }
    pub async fn create(
        &self,
        user: String,
        provider: String,
        value: &str,
        node: Option<&str>,
    ) -> Result<ProviderAccountRecord, String> {
        let _guard = self
            .lifecycle
            .try_lock()
            .map_err(|_| "Provider accounts are busy")?;
        if !safe_id(&provider)
            || !self
                .definitions
                .read()
                .unwrap()
                .iter()
                .any(|d| d.id == provider && d.auth)
        {
            return Err(format!(
                "Provider accounts are not supported for {provider}"
            ));
        }
        if user.is_empty() {
            return Err("Authenticated owner is required".into());
        }
        let label = label(value)?;
        let now = timestamp();
        let account = ProviderAccountRecord {
            id: format!("{}-{}", provider, uuid::Uuid::new_v4()),
            user_id: user,
            provider_type: provider,
            node_id: node
                .map(js_trim)
                .filter(|s| !s.is_empty())
                .unwrap_or("gateway")
                .into(),
            label,
            created_at: now.clone(),
            updated_at: now,
        };
        let saved = account.clone();
        self.db.run(move|db|{db.execute("INSERT INTO provider_accounts(id,user_id,provider_type,node_id,label,created_at,updated_at) VALUES(?1,?2,?3,?4,?5,?6,?7)",params![saved.id,saved.user_id,saved.provider_type,saved.node_id,saved.label,saved.created_at,saved.updated_at])?;Ok(())}).await.map_err(|e|e.to_string())?;
        self.register(&account).await?;
        Ok(account)
    }
    pub async fn rename(
        &self,
        id: String,
        user: String,
        value: &str,
    ) -> Result<Option<ProviderAccountRecord>, String> {
        let _guard = self
            .lifecycle
            .try_lock()
            .map_err(|_| "Provider accounts are busy")?;
        let Some(mut account) = self.get(id.clone(), user.clone()).await? else {
            return Ok(None);
        };
        if self
            .deleting
            .read()
            .map_err(|_| "Account storage unavailable")?
            .contains_key(&id)
        {
            return Err("Account deletion is pending".into());
        }
        account.label = label(value)?;
        account.updated_at = timestamp();
        let saved = account.clone();
        self.db.run(move|db|{db.execute("UPDATE provider_accounts SET label=?1,updated_at=?2 WHERE id=?3 AND user_id=?4",params![saved.label,saved.updated_at,id,user])?;Ok(())}).await.map_err(|e|e.to_string())?;
        if self
            .registry
            .get_for_user(&account.id, &account.user_id)
            .is_some()
            && let Some(plan) = self.launch_plan(&account)?
        {
            self.factory
                .rename(&account.id, &plan.name)
                .map_err(|_| "Account display name update failed")?;
        }
        Ok(Some(account))
    }
    pub async fn delete(&self, id: String, user: String) -> Result<bool, String> {
        self.delete_cancellable(id, user, ProcessCancellation::default())
            .await
    }
    /// Caller drop requests cancellation; the admitted supervisor keeps lifecycle
    /// ownership until blocking cleanup has settled. Never abort spawn_blocking.
    pub async fn delete_cancellable(
        &self,
        id: String,
        user: String,
        cancel: ProcessCancellation,
    ) -> Result<bool, String> {
        let guard = self
            .lifecycle
            .clone()
            .try_lock_owned()
            .map_err(|_| "Provider accounts are busy")?;
        struct CancelOnDrop {
            token: ProcessCancellation,
            armed: bool,
        }
        impl Drop for CancelOnDrop {
            fn drop(&mut self) {
                if self.armed {
                    self.token.cancel();
                }
            }
        }
        let mut on_drop = CancelOnDrop {
            token: cancel.clone(),
            armed: true,
        };
        let service = self.clone();
        let task = tokio::spawn(async move {
            let _guard = guard;
            service.delete_owned(id, user, cancel).await
        });
        let result = task
            .await
            .map_err(|_| "Account deletion supervisor failed")?;
        on_drop.armed = false;
        result
    }
    async fn delete_owned(
        &self,
        id: String,
        user: String,
        cancel: ProcessCancellation,
    ) -> Result<bool, String> {
        let Some(account) = self.get(id.clone(), user.clone()).await? else {
            return Ok(false);
        };
        if cancel.is_cancelled() {
            return Err("Account deletion cancelled".into());
        }
        if self
            .registry
            .get(&id)
            .is_some_and(|p| p.owner_user_id() != Some(user.as_str()))
        {
            return Err("Account adapter ownership mismatch".into());
        }
        if account.node_id == "gateway" {
            let pending = self
                .deleting
                .read()
                .map_err(|_| "Account storage unavailable")?
                .get(&id)
                .cloned();
            let original = if pending.is_none() {
                Some(self.private_home(&id).await?)
            } else {
                None
            };
            {
                let mut states = self
                    .deleting
                    .write()
                    .map_err(|_| "Account storage unavailable")?;
                if states.len() >= 64 && !states.contains_key(&id) {
                    return Err("Account deletion capacity reached".into());
                }
                states.entry(id.clone()).or_insert(None);
            }
            // Success promises process-tree settlement, not merely cancellation.
            tokio::time::timeout(
                std::time::Duration::from_secs(10),
                self.factory.quiesce_private(&id, cancel.clone()),
            )
            .await
            .map_err(|_| "Account quiescence timed out; deletion remains pending")?
            .map_err(|_| "Account quiescence failed; deletion remains pending")?;
            if cancel.is_cancelled() {
                return Err("Account deletion cancelled; deletion remains pending".into());
            }
            let home = match pending.flatten() {
                Some(home) => home,
                None => {
                    let home = match original {
                        Some(home) => home,
                        None => self
                            .homes
                            .read()
                            .map_err(|_| "Account storage unavailable")?
                            .get(&id)
                            .cloned()
                            .ok_or("Pending account directory identity unavailable")?,
                    };
                    let retained = self
                        .homes
                        .read()
                        .map_err(|_| "Account storage unavailable")?
                        .values()
                        .map(|h| h.descriptor_count())
                        .sum::<usize>()
                        + self
                            .deleting
                            .read()
                            .map_err(|_| "Account storage unavailable")?
                            .values()
                            .filter_map(Option::as_ref)
                            .map(|h| h.descriptor_count())
                            .sum::<usize>();
                    if retained.saturating_add(home.descriptor_count() + 1) > 512 {
                        return Err("Account deletion descriptor capacity reached; retry after other cleanup".into());
                    }
                    // Cache + this owner only. A retained child/probe lease prevents cleanup.
                    if Arc::strong_count(&home) != 2 {
                        return Err("Account home is still leased; deletion remains pending".into());
                    }
                    let states = self.deleting.clone();
                    let key = id.clone();
                    let token = cancel.clone();
                    self.files
                        .run(move || {
                            if token.is_cancelled() {
                                return Err("Account deletion cancelled".into());
                            }
                            let moved = Arc::new(home.quarantine()?);
                            states
                                .write()
                                .map_err(|_| "Account storage unavailable")?
                                .insert(key, Some(moved.clone()));
                            Ok::<_, String>(moved)
                        })
                        .await
                        .map_err(|_| "Account filesystem worker unavailable")??
                }
            };
            let token = cancel.clone();
            self.files
                .run(move || home.cleanup(&token))
                .await
                .map_err(|_| "Account filesystem worker unavailable")??;
        }
        if cancel.is_cancelled() {
            return Err("Account deletion cancelled; row retained".into());
        }
        // Quiescence was established before local data cleanup. Registry removal
        // still runs its adapter-specific disposal; failure retains the DB row.
        tokio::time::timeout(
            std::time::Duration::from_secs(10),
            self.registry.unregister(&id),
        )
        .await
        .map_err(|_| "Account adapter cleanup timed out; row retained")?
        .map_err(|_| "Account adapter cleanup failed; row retained")?;
        let key = id.clone();
        self.db
            .run(move |db| {
                db.execute(
                    "DELETE FROM provider_accounts WHERE id=?1 AND user_id=?2",
                    params![key, user],
                )?;
                Ok(())
            })
            .await
            .map_err(|_| "Account row deletion failed; retry deletion")?;
        let quarantine = self
            .deleting
            .read()
            .map_err(|_| "Account storage unavailable")?
            .get(&id)
            .cloned()
            .flatten();
        if let Some(home) = quarantine {
            self.files.run(move || home.finish_cleanup()).await
                .map_err(|_| "Account row removed; empty tombstone cleanup worker unavailable")?
                .map_err(|_| "Account row removed; empty tombstone cleanup failed; operator recovery required")?;
        }
        self.homes
            .write()
            .map_err(|_| "Account storage unavailable")?
            .remove(&id);
        self.deleting
            .write()
            .map_err(|_| "Account storage unavailable")?
            .remove(&id);
        Ok(true)
    }
    pub async fn connect_opencode_go(
        &self,
        id: String,
        user: String,
        key: String,
    ) -> Result<bool, String> {
        let _guard = self
            .lifecycle
            .try_lock()
            .map_err(|_| "Provider accounts are busy")?;
        let Some(account) = self.get(id.clone(), user).await? else {
            return Ok(false);
        };
        if account.provider_type != "opencode" {
            return Err("Choose an OpenCode account.".into());
        }
        if account.node_id != "gateway" {
            return Err("Connect Go on the account's owning device.".into());
        }
        let home = self.private_home(&id).await?;
        self.files
            .run(move || home.write_go(&key))
            .await
            .map_err(|_| "Account filesystem worker unavailable")??;
        if let Some(adapter) = self.registry.get(&id) {
            if adapter.owner_user_id() != Some(account.user_id.as_str()) {
                return Err("Account adapter ownership mismatch".into());
            }
            self.factory
                .reset_models(&id)
                .map_err(|_| "Account probe reset failed")?;
        } else {
            self.register(&account).await?;
        }
        Ok(true)
    }
}
impl ProviderAccountService {
    /// Feed persisted ACP usage activities through the account's authenticated
    /// owner, rather than allowing event payloads to select another account.
    pub async fn record_activity(
        &self,
        id: String,
        user: String,
        event: &Value,
        usage: &super::provider_usage::ProviderUsageService,
    ) -> Result<bool, String> {
        let _guard = self
            .lifecycle
            .try_lock()
            .map_err(|_| "Provider accounts are busy")?;
        let Some(account) = self.get(id, user).await? else {
            return Ok(false);
        };
        if self
            .deleting
            .read()
            .map_err(|_| "Account storage unavailable")?
            .contains_key(&account.id)
        {
            return Ok(false);
        }
        if event["type"] != "activity" || event["kind"] != "usage_update" {
            return Ok(false);
        }
        let Some(info) = event["payload"]["_meta"]
            .get("_claude/rateLimit")
            .filter(|v| v.is_object())
        else {
            return Ok(false);
        };
        usage
            .record_claude_rate_limit(account.id, account.provider_type, info.clone())
            .await?;
        Ok(true)
    }
    /// Refresh only local account homes. Probes run sequentially and are never
    /// retried. Cancellation stops new probes; an already-started bounded probe
    /// is allowed to settle/reap before returning, and its snapshot is discarded.
    pub async fn refresh_usage(
        &self,
        user: String,
        usage: &super::provider_usage::ProviderUsageService,
        codex: &super::provider_quota_fetchers::CodexRateLimitOptions,
        transport: &super::subscription_usage_fetchers::UsageTransport,
        cancel: &crate::execution::process_runner::ProcessCancellation,
    ) -> Result<std::collections::BTreeMap<String, String>, String> {
        let _guard = self
            .lifecycle
            .try_lock()
            .map_err(|_| "Provider accounts are busy")?;
        if codex.timeout_ms == 0 || codex.timeout_ms > 30_000 {
            return Err("Invalid quota probe deadline".into());
        }
        let mut errors = std::collections::BTreeMap::new();
        for account in self.list(user).await? {
            if cancel.is_cancelled() {
                return Err("Usage refresh cancelled".into());
            }
            if account.node_id != "gateway"
                || !matches!(account.provider_type.as_str(), "codex" | "opencode")
            {
                continue;
            }
            let result: Result<(), String> = async {
                let home = self.private_home(&account.id).await?;
                if cancel.is_cancelled() {
                    return Err("Usage refresh cancelled".into());
                }

                if account.provider_type == "codex" {
                    // The canonical probe only accepts a pathname and spawns a
                    // child after this check. It needs a pinned-home API first.
                    Err("Codex quota probe requires a descriptor-bound account home".into())
                } else {
                    let key = self
                        .files
                        .run(move || home.read_go())
                        .await
                        .map_err(|_| "Account filesystem worker unavailable")?;
                    if cancel.is_cancelled() {
                        return Err("Usage refresh cancelled".into());
                    }
                    match key {
                        Ok(Some(key)) => {
                            // Enforce the deadline even for an injected transport.
                            let response = tokio::time::timeout(
                                std::time::Duration::from_secs(10),
                                super::subscription_usage_fetchers::fetch_open_code_go_usage(
                                    transport, &key,
                                ),
                            )
                            .await
                            .map_err(|_| "OpenCode Go usage refresh timed out".to_string())
                            .and_then(|r| r);
                            if cancel.is_cancelled() {
                                return Err("Usage refresh cancelled".into());
                            }
                            match response {
                                Ok(response) => {
                                    usage
                                        .record_opencode_go_usage(account.id.clone(), response)
                                        .await
                                }
                                Err(_) => Err("OpenCode Go usage refresh failed".into()),
                            }
                        }
                        Ok(None) => Ok(()),
                        Err(_) => Err("OpenCode Go credentials could not be read".into()),
                    }
                }
            }
            .await;
            if cancel.is_cancelled() {
                return Err("Usage refresh cancelled".into());
            }
            if result.is_err() {
                errors.insert(
                    account.id,
                    if account.provider_type == "codex" {
                        "Codex usage refresh failed"
                    } else {
                        "OpenCode Go usage refresh failed"
                    }
                    .into(),
                );
            }
        }
        Ok(errors)
    }
}

// Keep the implementation local until the canonical credential store exposes
// descriptor-relative APIs. Do not pass /proc/self/fd paths to path-based writers:
// they can reopen untrusted descendants and are not a portable ownership lease.
#[cfg(unix)]
use private_storage::PrivateHome;
#[cfg(unix)]
mod private_storage {
    use super::*;
    use std::{
        ffi::CString,
        fs::File,
        io::{Read, Write},
        os::{
            fd::{AsRawFd, FromRawFd},
            unix::{ffi::OsStrExt, fs::MetadataExt},
        },
        path::Component,
    };
    const ERROR: &str = "Account storage identity, ownership or permissions are unsafe";
    const MAX_AUTH: u64 = 1024 * 1024;
    pub(super) struct PrivateHome {
        // dirs[0] is '/'; names[i] binds dirs[i+1] to dirs[i]. All
        // subsequent IO uses these handles, never the original pathname.
        dirs: Vec<File>,
        names: Vec<CString>,
        private_from: usize,
    }
    fn opened(fd: libc::c_int) -> Result<File, String> {
        if fd < 0 {
            Err(ERROR.into())
        } else {
            // SAFETY: successful open/openat transfers a fresh owned descriptor.
            Ok(unsafe { File::from_raw_fd(fd) })
        }
    }
    fn name(value: &str) -> CString {
        CString::new(value).expect("constant basename")
    }
    fn trusted(dir: &File, private: bool) -> Result<(), String> {
        let m = dir.metadata().map_err(|_| ERROR)?;
        // SAFETY: geteuid has no preconditions.
        let uid = unsafe { libc::geteuid() };
        if !m.is_dir() || (m.uid() != uid && (private || m.uid() != 0)) || m.mode() & 0o022 != 0 {
            return Err(ERROR.into());
        }
        if private {
            // Restrict the opened inode, never chmod a separately resolved path.
            if unsafe { libc::fchmod(dir.as_raw_fd(), 0o700) } != 0 {
                return Err(ERROR.into());
            }
        }
        Ok(())
    }
    impl PrivateHome {
        pub(super) fn open(path: &Path) -> Result<Self, String> {
            if !path.is_absolute() {
                return Err(ERROR.into());
            }
            let components = path.components().collect::<Vec<_>>();
            if components.len() < 3 || components.len() > 128 {
                return Err(ERROR.into());
            }
            let root = name("/");
            let root = opened(unsafe {
                libc::open(
                    root.as_ptr(),
                    libc::O_RDONLY | libc::O_DIRECTORY | libc::O_NOFOLLOW | libc::O_CLOEXEC,
                )
            })?;
            Self::open_components(root, &components)
        }
        // The caller owns the starting directory descriptor. Absolute runtime
        // opens always start at /; tests inject an owned private fixture boundary
        // into this same traversal, without trusting writable checkout ancestors.
        fn open_components(root: File, components: &[Component<'_>]) -> Result<Self, String> {
            if components.len() < 3 || components.len() > 128 {
                return Err(ERROR.into());
            }
            let mut result = Self {
                dirs: vec![root],
                names: vec![],
                private_from: components.len() - 2,
            };
            for (index, component) in components.iter().enumerate().skip(1) {
                let Component::Normal(part) = component else {
                    return Err(ERROR.into());
                };
                let part = CString::new(part.as_bytes()).map_err(|_| ERROR)?;
                let parent = result.dirs.last().unwrap();
                trusted(parent, false)?;
                if index + 1 == components.len() {
                    let tombstone =
                        CString::new([b".deleting-".as_slice(), part.as_bytes()].concat())
                            .map_err(|_| ERROR)?;
                    let mut stat = std::mem::MaybeUninit::<libc::stat>::uninit();
                    if unsafe {
                        libc::fstatat(
                            parent.as_raw_fd(),
                            tombstone.as_ptr(),
                            stat.as_mut_ptr(),
                            libc::AT_SYMLINK_NOFOLLOW,
                        )
                    } == 0
                        || std::io::Error::last_os_error().kind() != std::io::ErrorKind::NotFound
                    {
                        return Err(
                            "Account deletion recovery required; refusing to recreate home".into(),
                        );
                    }
                }
                let flags = libc::O_RDONLY | libc::O_DIRECTORY | libc::O_NOFOLLOW | libc::O_CLOEXEC;
                let mut fd = unsafe { libc::openat(parent.as_raw_fd(), part.as_ptr(), flags) };
                if fd < 0 && std::io::Error::last_os_error().kind() == std::io::ErrorKind::NotFound
                {
                    if unsafe { libc::mkdirat(parent.as_raw_fd(), part.as_ptr(), 0o700) } != 0
                        && std::io::Error::last_os_error().kind()
                            != std::io::ErrorKind::AlreadyExists
                    {
                        return Err(ERROR.into());
                    }
                    fd = unsafe { libc::openat(parent.as_raw_fd(), part.as_ptr(), flags) };
                }
                let dir = opened(fd)?;
                // Both the configured owner root and the account home are private.
                trusted(&dir, index + 2 >= components.len())?;
                result.names.push(part);
                result.dirs.push(dir);
            }
            result.verify()?;
            Ok(result)
        }
        pub(super) fn descriptor_count(&self) -> usize {
            self.dirs.len()
        }
        pub(super) fn directory(&self) -> Result<File, String> {
            self.verify()?;
            self.dirs
                .last()
                .unwrap()
                .try_clone()
                .map_err(|_| ERROR.into())
        }
        pub(super) fn verify(&self) -> Result<(), String> {
            for (index, part) in self.names.iter().enumerate() {
                let child = &self.dirs[index + 1];
                let actual = child.metadata().map_err(|_| ERROR)?;
                let mut binding = std::mem::MaybeUninit::<libc::stat>::uninit();
                if unsafe {
                    libc::fstatat(
                        self.dirs[index].as_raw_fd(),
                        part.as_ptr(),
                        binding.as_mut_ptr(),
                        libc::AT_SYMLINK_NOFOLLOW,
                    )
                } != 0
                {
                    return Err(ERROR.into());
                }
                let binding = unsafe { binding.assume_init() };
                if binding.st_dev != actual.dev()
                    || binding.st_ino != actual.ino()
                    || binding.st_mode & libc::S_IFMT != libc::S_IFDIR
                {
                    return Err(ERROR.into());
                }
                // Verification must not mutate permissions. Parent changes fail closed.
                let uid = unsafe { libc::geteuid() };
                let private = index + 1 >= self.private_from;
                if (actual.uid() != uid && (private || actual.uid() != 0))
                    || actual.mode() & if private { 0o077 } else { 0o022 } != 0
                {
                    return Err(ERROR.into());
                }
            }
            Ok(())
        }
        fn prefix(&self, count: usize) -> Result<Self, String> {
            Ok(Self {
                dirs: self.dirs[..count]
                    .iter()
                    .map(File::try_clone)
                    .collect::<Result<_, _>>()
                    .map_err(|_| ERROR)?,
                names: self.names[..count - 1].to_vec(),
                private_from: self.private_from,
            })
        }
        /// Move the verified home into a fresh private sibling before traversal.
        /// A replacement between verification and rename is detected after rename;
        /// it is never traversed or restored over a live account pathname.
        pub(super) fn quarantine(&self) -> Result<Self, String> {
            #[cfg(target_os = "linux")]
            {
                cleanup_child(self.dirs.last().unwrap().as_raw_fd(), &name("."))?;
                self.quarantine_before_move(|| {})
            }
            #[cfg(not(target_os = "linux"))]
            {
                Err(
                    "Account recursive deletion requires mount-confined Linux openat2 support"
                        .into(),
                )
            }
        }
        fn quarantine_before_move(&self, before_move: impl FnOnce()) -> Result<Self, String> {
            self.verify()?;
            let parent = self.dirs[self.dirs.len() - 2].as_raw_fd();
            let stage_name = CString::new(
                [
                    b".deleting-".as_slice(),
                    self.names.last().unwrap().as_bytes(),
                ]
                .concat(),
            )
            .map_err(|_| ERROR)?;
            if unsafe { libc::mkdirat(parent, stage_name.as_ptr(), 0o700) } != 0 {
                return Err(ERROR.into());
            }
            let stage = opened(unsafe {
                libc::openat(
                    parent,
                    stage_name.as_ptr(),
                    libc::O_RDONLY | libc::O_DIRECTORY | libc::O_NOFOLLOW | libc::O_CLOEXEC,
                )
            })?;
            trusted(&stage, true)?;
            let mut moved = self.prefix(self.dirs.len() - 1)?;
            moved.names.push(stage_name);
            moved.dirs.push(stage);
            moved.verify()?;
            moved
                .dirs
                .last()
                .unwrap()
                .sync_all()
                .map_err(|_| "Account quarantine marker sync failed; row retained")?;
            self.dirs[self.dirs.len() - 2]
                .sync_all()
                .map_err(|_| "Account quarantine parent sync failed; row retained")?;
            self.verify()?;
            before_move();
            if unsafe {
                libc::renameat(
                    parent,
                    self.names.last().unwrap().as_ptr(),
                    moved.dirs.last().unwrap().as_raw_fd(),
                    name("home").as_ptr(),
                )
            } != 0
            {
                return Err("Account quarantine move failed; row retained".into());
            }
            moved.names.push(name("home"));
            moved
                .dirs
                .push(self.dirs.last().unwrap().try_clone().map_err(|_| ERROR)?);
            moved.verify().map_err(|_| "Account replaced during quarantine; no cleanup performed; operator recovery required")?;
            moved.dirs[moved.dirs.len() - 2]
                .sync_all()
                .map_err(|_| "Account quarantine move sync failed; row retained")?;
            self.dirs[self.dirs.len() - 2]
                .sync_all()
                .map_err(|_| "Account quarantine parent sync failed; row retained")?;
            Ok(moved)
        }
        pub(super) fn cleanup(&self, cancel: &ProcessCancellation) -> Result<(), String> {
            self.cleanup_with_limits(cancel, 4096, 32)
        }
        #[cfg(not(target_os = "linux"))]
        fn cleanup_with_limits(
            &self,
            _: &ProcessCancellation,
            _: usize,
            _: usize,
        ) -> Result<(), String> {
            Err("Account recursive deletion requires mount-confined Linux openat2 support".into())
        }
        #[cfg(target_os = "linux")]
        fn cleanup_with_limits(
            &self,
            cancel: &ProcessCancellation,
            entries: usize,
            depth: usize,
        ) -> Result<(), String> {
            let mut budget = CleanupBudget {
                remaining: entries,
                depth,
                deadline: std::time::Instant::now() + std::time::Duration::from_secs(3),
                cancel,
            };
            budget.check()?;
            // Retry after filesystem success / DB or registry failure. Never
            // recreate or adopt a directory to make a retry succeed.
            if self
                .dirs
                .last()
                .unwrap()
                .metadata()
                .map_err(|_| ERROR)?
                .nlink()
                != 0
            {
                self.verify()?;
                clean_directory(self, &mut Vec::new(), &mut budget)?;
                budget.check()?;
                self.verify()?;
                unlink_directory(
                    self.dirs[self.dirs.len() - 2].as_raw_fd(),
                    self.names.last().unwrap(),
                )?;
                if self
                    .dirs
                    .last()
                    .unwrap()
                    .metadata()
                    .map_err(|_| ERROR)?
                    .nlink()
                    != 0
                {
                    return Err(ERROR.into());
                }
            }
            // Keep the empty tombstone until the DB row is committed absent.
            // A restart must fail closed instead of recreating a partial home.
            let stage = self.prefix(self.dirs.len() - 1)?;
            stage.verify()?;
            stage
                .dirs
                .last()
                .unwrap()
                .sync_all()
                .map_err(|_| "Account cleanup sync failed; row retained")?;
            Ok(())
        }
        #[cfg(target_os = "linux")]
        pub(super) fn finish_cleanup(&self) -> Result<(), String> {
            if self
                .dirs
                .last()
                .unwrap()
                .metadata()
                .map_err(|_| ERROR)?
                .nlink()
                != 0
            {
                return Err(ERROR.into());
            }
            let stage = self.prefix(self.dirs.len() - 1)?;
            let owner = self.prefix(self.dirs.len() - 2)?;
            owner.verify()?;
            stage.verify()?;
            unlink_directory(
                owner.dirs.last().unwrap().as_raw_fd(),
                stage.names.last().unwrap(),
            )?;
            if stage
                .dirs
                .last()
                .unwrap()
                .metadata()
                .map_err(|_| ERROR)?
                .nlink()
                != 0
            {
                return Err(ERROR.into());
            }
            owner.verify()?;
            owner
                .dirs
                .last()
                .unwrap()
                .sync_all()
                .map_err(|_| "Account tombstone cleanup sync failed")?;
            Ok(())
        }
        #[cfg(not(target_os = "linux"))]
        pub(super) fn finish_cleanup(&self) -> Result<(), String> {
            Err("Private account deletion unsupported on this platform".into())
        }
        fn credentials(&self) -> Result<Self, String> {
            self.verify()?;
            let mut chain = Self {
                dirs: self
                    .dirs
                    .iter()
                    .map(|d| d.try_clone().map_err(|_| ERROR.to_string()))
                    .collect::<Result<_, _>>()?,
                names: self.names.clone(),
                private_from: self.private_from,
            };
            for part in [".local", "share", "opencode"] {
                chain.verify()?;
                let part = name(part);
                let parent = chain.dirs.last().unwrap();
                let rc = unsafe { libc::mkdirat(parent.as_raw_fd(), part.as_ptr(), 0o700) };
                if rc != 0
                    && std::io::Error::last_os_error().kind() != std::io::ErrorKind::AlreadyExists
                {
                    return Err(ERROR.into());
                }
                let dir = opened(unsafe {
                    libc::openat(
                        parent.as_raw_fd(),
                        part.as_ptr(),
                        libc::O_RDONLY | libc::O_DIRECTORY | libc::O_NOFOLLOW | libc::O_CLOEXEC,
                    )
                })?;
                trusted(&dir, true)?;
                chain.names.push(part);
                chain.dirs.push(dir);
            }
            chain.verify()?;
            Ok(chain)
        }
        fn auth(&self) -> Result<Value, String> {
            self.verify()?;
            let part = name("auth.json");
            // NONBLOCK avoids hanging on attacker-supplied FIFOs before fstat.
            let fd = unsafe {
                libc::openat(
                    self.dirs.last().unwrap().as_raw_fd(),
                    part.as_ptr(),
                    libc::O_RDONLY | libc::O_NOFOLLOW | libc::O_CLOEXEC | libc::O_NONBLOCK,
                )
            };
            if fd < 0 && std::io::Error::last_os_error().kind() == std::io::ErrorKind::NotFound {
                return Ok(json!({}));
            }
            let file = opened(fd)?;
            let meta = file.metadata().map_err(|_| ERROR)?;
            if !meta.is_file()
                || meta.uid() != unsafe { libc::geteuid() }
                || meta.nlink() != 1
                || meta.mode() & 0o077 != 0
                || meta.len() > MAX_AUTH
            {
                return Err(ERROR.into());
            }
            let mut bytes = Vec::new();
            file.take(MAX_AUTH + 1)
                .read_to_end(&mut bytes)
                .map_err(|_| ERROR)?;
            if bytes.len() as u64 > MAX_AUTH {
                return Err(ERROR.into());
            }
            let auth: Value = serde_json::from_slice(&bytes).map_err(
                |_| "Account credentials could not be read; existing credentials preserved",
            )?;
            self.verify()?;
            if !auth.is_object() {
                return Err("Account credentials must be an object".into());
            }
            Ok(auth)
        }
        pub(super) fn read_go(&self) -> Result<Option<String>, String> {
            let directory = self.credentials()?;
            let auth = directory.auth()?;
            let item = &auth["opencode-go"];
            Ok((item["type"] == "api")
                .then(|| {
                    item["key"]
                        .as_str()
                        .map(js_trim)
                        .filter(|v| !v.is_empty())
                        .map(str::to_string)
                })
                .flatten())
        }
        pub(super) fn write_go(&self, key: &str) -> Result<(), String> {
            let directory = self.credentials()?;
            let mut auth = directory.auth()?;
            // Match the canonical writer's JSON mutation and formatting exactly.
            auth.as_object_mut()
                .unwrap()
                .insert("opencode-go".into(), json!({"type":"api","key":key}));
            let bytes = crate::services::storage::json_text(&auth);
            if bytes.len() as u64 > MAX_AUTH {
                return Err("Account credentials exceed storage limit".into());
            }
            directory.verify()?;
            let parent = directory.dirs.last().unwrap().as_raw_fd();
            let temp = name(&format!("auth.json.{}.tmp", uuid::Uuid::new_v4()));
            let mut file = opened(unsafe {
                libc::openat(
                    parent,
                    temp.as_ptr(),
                    libc::O_WRONLY
                        | libc::O_CREAT
                        | libc::O_EXCL
                        | libc::O_NOFOLLOW
                        | libc::O_CLOEXEC,
                    0o600,
                )
            })?;
            let result = (|| {
                file.write_all(bytes.as_bytes()).map_err(|_| ERROR)?;
                file.sync_all().map_err(|_| ERROR)?;
                directory.verify()?;
                // Verify the temp name still binds our fresh inode before commit.
                let check = opened(unsafe {
                    libc::openat(
                        parent,
                        temp.as_ptr(),
                        libc::O_RDONLY | libc::O_NOFOLLOW | libc::O_CLOEXEC | libc::O_NONBLOCK,
                    )
                })?;
                let a = file.metadata().map_err(|_| ERROR)?;
                let b = check.metadata().map_err(|_| ERROR)?;
                if a.dev() != b.dev() || a.ino() != b.ino() || a.nlink() != 1 {
                    return Err(ERROR.into());
                }
                if unsafe {
                    libc::renameat(parent, temp.as_ptr(), parent, name("auth.json").as_ptr())
                } != 0
                {
                    return Err(ERROR.into());
                }
                directory.verify()?;
                // Detect substitution of the temporary source or destination;
                // all writes above still target the original private inode.
                let committed = opened(unsafe {
                    libc::openat(
                        parent,
                        name("auth.json").as_ptr(),
                        libc::O_RDONLY | libc::O_NOFOLLOW | libc::O_CLOEXEC | libc::O_NONBLOCK,
                    )
                })?;
                let meta = committed.metadata().map_err(|_| ERROR)?;
                if meta.dev() != a.dev() || meta.ino() != a.ino() || meta.nlink() != 1 {
                    return Err(ERROR.into());
                }
                Ok(())
            })();
            // Never recurse or resolve the temporary name through a pathname.
            // unlinkat cannot follow a symlink or remove an arbitrary directory.
            let cleanup = unsafe { libc::unlinkat(parent, temp.as_ptr(), 0) };
            if cleanup != 0
                && std::io::Error::last_os_error().kind() != std::io::ErrorKind::NotFound
            {
                return Err("Account credential temporary cleanup failed".into());
            }
            result
        }
    }
    #[cfg(target_os = "linux")]
    struct CleanupBudget<'a> {
        remaining: usize,
        depth: usize,
        deadline: std::time::Instant,
        cancel: &'a ProcessCancellation,
    }
    #[cfg(target_os = "linux")]
    impl CleanupBudget<'_> {
        fn check(&self) -> Result<(), String> {
            if self.cancel.is_cancelled() {
                return Err(
                    "Account cleanup cancelled; partial data and row retained for retry".into(),
                );
            }
            if std::time::Instant::now() >= self.deadline {
                return Err("Account cleanup deadline reached; row retained for retry".into());
            }
            Ok(())
        }
    }
    #[cfg(target_os = "linux")]
    fn unlink_directory(parent: libc::c_int, part: &CString) -> Result<(), String> {
        if unsafe { libc::unlinkat(parent, part.as_ptr(), libc::AT_REMOVEDIR) } != 0 {
            return Err("Account directory cleanup failed; row retained for retry".into());
        }
        Ok(())
    }
    #[cfg(target_os = "linux")]
    fn binding(parent: libc::c_int, part: &CString) -> Result<libc::stat, String> {
        let mut stat = std::mem::MaybeUninit::uninit();
        if unsafe {
            libc::fstatat(
                parent,
                part.as_ptr(),
                stat.as_mut_ptr(),
                libc::AT_SYMLINK_NOFOLLOW,
            )
        } != 0
        {
            return Err(ERROR.into());
        }
        Ok(unsafe { stat.assume_init() })
    }
    #[cfg(target_os = "linux")]
    fn same_binding(parent: libc::c_int, part: &CString, file: &File) -> Result<(), String> {
        let b = binding(parent, part)?;
        let a = file.metadata().map_err(|_| ERROR)?;
        if b.st_dev != a.dev() || b.st_ino != a.ino() || b.st_mode & libc::S_IFMT != libc::S_IFDIR {
            return Err(ERROR.into());
        }
        Ok(())
    }
    #[cfg(target_os = "linux")]
    fn verify_cleanup_chain(home: &PrivateHome, chain: &[(CString, File)]) -> Result<(), String> {
        home.verify()?;
        let mut parent = home.dirs.last().unwrap().as_raw_fd();
        for (part, dir) in chain {
            same_binding(parent, part, dir)?;
            let m = dir.metadata().map_err(|_| ERROR)?;
            if m.uid() != unsafe { libc::geteuid() } || m.mode() & 0o022 != 0 {
                return Err(ERROR.into());
            }
            parent = dir.as_raw_fd();
        }
        Ok(())
    }
    #[cfg(target_os = "linux")]
    fn cleanup_child(parent: libc::c_int, part: &CString) -> Result<File, String> {
        #[repr(C)]
        struct OpenHow {
            flags: u64,
            mode: u64,
            resolve: u64,
        }
        // RESOLVE_NO_XDEV | NO_MAGICLINKS | NO_SYMLINKS | BENEATH.
        let how = OpenHow {
            flags: (libc::O_RDONLY | libc::O_DIRECTORY | libc::O_NOFOLLOW | libc::O_CLOEXEC) as u64,
            mode: 0,
            resolve: 0x01 | 0x02 | 0x04 | 0x08,
        };
        opened(unsafe {
            libc::syscall(
                libc::SYS_openat2,
                parent,
                part.as_ptr(),
                &how,
                std::mem::size_of::<OpenHow>(),
            )
        } as libc::c_int)
    }
    #[cfg(target_os = "linux")]
    fn clean_directory(
        home: &PrivateHome,
        chain: &mut Vec<(CString, File)>,
        budget: &mut CleanupBudget<'_>,
    ) -> Result<(), String> {
        budget.check()?;
        verify_cleanup_chain(home, chain)?;
        let parent = chain
            .last()
            .map(|(_, f)| f)
            .unwrap_or_else(|| home.dirs.last().unwrap())
            .as_raw_fd();
        // Independent directory stream (dup shares offsets). RAII closes on all exits.
        let stream_fd = opened(unsafe {
            libc::openat(
                parent,
                name(".").as_ptr(),
                libc::O_RDONLY | libc::O_DIRECTORY | libc::O_CLOEXEC | libc::O_NOFOLLOW,
            )
        })?;
        use std::os::fd::IntoRawFd;
        let raw = stream_fd.into_raw_fd();
        let stream = unsafe { libc::fdopendir(raw) };
        if stream.is_null() {
            unsafe {
                libc::close(raw);
            }
            return Err(ERROR.into());
        }
        struct Stream(*mut libc::DIR);
        impl Drop for Stream {
            fn drop(&mut self) {
                unsafe {
                    libc::closedir(self.0);
                }
            }
        }
        let stream = Stream(stream);
        loop {
            budget.check()?;
            unsafe {
                *libc::__errno_location() = 0;
            }
            let entry = unsafe { libc::readdir(stream.0) };
            if entry.is_null() {
                if unsafe { *libc::__errno_location() } != 0 {
                    return Err(ERROR.into());
                }
                break;
            }
            let part = unsafe { std::ffi::CStr::from_ptr((*entry).d_name.as_ptr()) }.to_owned();
            if part.as_bytes() == b"." || part.as_bytes() == b".." {
                continue;
            }
            if budget.remaining == 0 {
                return Err("Account cleanup entry limit reached; row retained for retry".into());
            }
            budget.remaining -= 1;
            verify_cleanup_chain(home, chain)?;
            let observed = binding(parent, &part)?;
            if observed.st_mode & libc::S_IFMT == libc::S_IFDIR {
                if chain.len() >= budget.depth {
                    return Err(
                        "Account cleanup depth limit reached; row retained for retry".into(),
                    );
                }
                // Linux openat2 confines each opened descendant to this mount;
                // same-device bind mounts are rejected too. No openat fallback.
                let child = cleanup_child(parent, &part)?;
                let m = child.metadata().map_err(|_| ERROR)?;
                if m.dev() != observed.st_dev as u64 || m.ino() != observed.st_ino as u64 {
                    return Err(ERROR.into());
                }
                chain.push((part.clone(), child));
                clean_directory(home, chain, budget)?;
                budget.check()?;
                verify_cleanup_chain(home, chain)?;
                // rmdir cannot follow a substituted symlink or remove a nonempty
                // replacement. Check the opened inode is actually unlinked too.
                unlink_directory(parent, &part)?;
                if chain
                    .last()
                    .unwrap()
                    .1
                    .metadata()
                    .map_err(|_| ERROR)?
                    .nlink()
                    != 0
                {
                    return Err(ERROR.into());
                }
                chain.pop();
            } else {
                // Unlink directory entries only: symlinks, FIFOs, sockets, device
                // nodes and hardlinks are never opened, read, or followed.
                budget.check()?;
                verify_cleanup_chain(home, chain)?;
                let current = binding(parent, &part)?;
                if current.st_dev != observed.st_dev
                    || current.st_ino != observed.st_ino
                    || current.st_mode != observed.st_mode
                {
                    return Err(ERROR.into());
                }
                if unsafe { libc::unlinkat(parent, part.as_ptr(), 0) } != 0 {
                    return Err("Account entry cleanup failed; row retained for retry".into());
                }
            }
        }
        Ok(())
    }
    #[cfg(test)]
    mod tests {
        use super::*;
        use std::os::unix::fs::{PermissionsExt, symlink};
        fn create_private_dir(path: impl AsRef<Path>) -> std::io::Result<()> {
            use std::os::unix::fs::DirBuilderExt;
            std::fs::DirBuilder::new().mode(0o700).create(path)
        }
        struct Fixture(PathBuf);
        impl Fixture {
            fn new() -> Self {
                use std::os::unix::fs::DirBuilderExt;
                let base = Path::new(env!("CARGO_MANIFEST_DIR"))
                    .join("../../.jait/artifacts/gateway-rust/parallel-implementation");
                let path = base
                    .join("jait-account-tests")
                    .join(format!("account-race-{}", uuid::Uuid::new_v4()));
                std::fs::DirBuilder::new()
                    .recursive(true)
                    .mode(0o700)
                    .create(&path)
                    .unwrap();
                std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o700)).unwrap();
                Self(path)
            }
            fn home(&self) -> PathBuf {
                self.0.join("accounts/account-1")
            }
            fn open(&self) -> Result<PrivateHome, String> {
                let directory = CString::new(self.0.as_os_str().as_bytes()).unwrap();
                let root = opened(unsafe {
                    libc::open(
                        directory.as_ptr(),
                        libc::O_RDONLY | libc::O_DIRECTORY | libc::O_NOFOLLOW | libc::O_CLOEXEC,
                    )
                })?;
                let relative = Path::new("/accounts/account-1");
                PrivateHome::open_components(root, &relative.components().collect::<Vec<_>>())
            }
            fn bind(&self, service: &ProviderAccountService) {
                service
                    .homes
                    .write()
                    .unwrap()
                    .insert("account-1".into(), Arc::new(self.open().unwrap()));
            }
        }
        impl Drop for Fixture {
            fn drop(&mut self) {
                // Test-only owned fixtures; replacement operations are completed
                // synchronously before this cleanup. No runtime cleanup uses this.
                std::fs::remove_dir_all(&self.0).unwrap();
            }
        }
        #[cfg(target_os = "linux")]
        #[test]
        fn provider_account_cleanup_unlinks_links_fifo_and_preserves_external_data() {
            let f = Fixture::new();
            let home = f.open().unwrap();
            let external = f.0.join("external");
            create_private_dir(&external).unwrap();
            std::fs::write(external.join("keep"), "outside").unwrap();
            create_private_dir(f.home().join("nested")).unwrap();
            std::fs::write(f.home().join("nested/inside"), "inside").unwrap();
            symlink(&external, f.home().join("escape")).unwrap();
            std::fs::hard_link(external.join("keep"), f.home().join("hardlink")).unwrap();
            let fifo = CString::new(f.home().join("pipe").as_os_str().as_bytes()).unwrap();
            assert_eq!(unsafe { libc::mkfifo(fifo.as_ptr(), 0o600) }, 0);
            let moved = home.quarantine().unwrap();
            assert!(!f.home().exists());
            // The durable marker prohibits startup from silently recreating a home.
            assert!(f.open().is_err());
            moved.cleanup(&ProcessCancellation::default()).unwrap();
            assert_eq!(
                std::fs::read_to_string(external.join("keep")).unwrap(),
                "outside"
            );
            assert_eq!(std::fs::metadata(external.join("keep")).unwrap().nlink(), 1);
            assert!(f.0.join("accounts/.deleting-account-1").is_dir());
            moved.cleanup(&ProcessCancellation::default()).unwrap(); // idempotent before DB commit
            moved.finish_cleanup().unwrap();
            assert!(!f.0.join("accounts/.deleting-account-1").exists());
        }
        #[cfg(target_os = "linux")]
        #[test]
        fn provider_account_cleanup_replacement_at_quarantine_is_never_traversed() {
            let f = Fixture::new();
            let home = f.open().unwrap();
            std::fs::write(f.home().join("original"), "keep original").unwrap();
            let result = home.quarantine_before_move(|| {
                std::fs::rename(f.home(), f.0.join("retired")).unwrap();
                create_private_dir(f.home()).unwrap();
                std::fs::write(f.home().join("replacement"), "keep replacement").unwrap();
            });
            assert!(result.is_err());
            assert_eq!(
                std::fs::read_to_string(f.0.join("retired/original")).unwrap(),
                "keep original"
            );
            assert_eq!(
                std::fs::read_to_string(f.0.join("accounts/.deleting-account-1/home/replacement"))
                    .unwrap(),
                "keep replacement"
            );
            assert!(f.open().is_err());
        }
        #[cfg(target_os = "linux")]
        #[test]
        fn provider_account_cleanup_rejects_replaced_quarantine_root_and_descendant() {
            let f = Fixture::new();
            let home = f.open().unwrap();
            create_private_dir(f.home().join("nested")).unwrap();
            std::fs::write(f.home().join("nested/keep"), "original").unwrap();
            let moved = home.quarantine().unwrap();
            let root = f.0.join("accounts/.deleting-account-1/home");
            let part = name("nested");
            let file = opened(unsafe {
                libc::openat(
                    moved.dirs.last().unwrap().as_raw_fd(),
                    part.as_ptr(),
                    libc::O_RDONLY | libc::O_DIRECTORY | libc::O_NOFOLLOW | libc::O_CLOEXEC,
                )
            })
            .unwrap();
            let mut chain = vec![(part, file)];
            std::fs::rename(root.join("nested"), root.join("old")).unwrap();
            create_private_dir(root.join("nested")).unwrap();
            std::fs::write(root.join("nested/keep"), "replacement").unwrap();
            let cancel = ProcessCancellation::default();
            let mut budget = CleanupBudget {
                remaining: 32,
                depth: 4,
                deadline: std::time::Instant::now() + std::time::Duration::from_secs(3),
                cancel: &cancel,
            };
            assert!(clean_directory(&moved, &mut chain, &mut budget).is_err());
            assert_eq!(
                std::fs::read_to_string(root.join("old/keep")).unwrap(),
                "original"
            );
            assert_eq!(
                std::fs::read_to_string(root.join("nested/keep")).unwrap(),
                "replacement"
            );
            std::fs::rename(f.0.join("accounts"), f.0.join("retired-root")).unwrap();
            create_private_dir(f.0.join("accounts")).unwrap();
            assert!(moved.cleanup(&cancel).is_err());
            assert_eq!(
                std::fs::read_to_string(f.0.join("retired-root/.deleting-account-1/home/old/keep"))
                    .unwrap(),
                "original"
            );
        }
        #[cfg(target_os = "linux")]
        #[test]
        fn provider_account_cleanup_cancel_limits_and_partial_retry() {
            let f = Fixture::new();
            let home = f.open().unwrap();
            for i in 0..3 {
                std::fs::write(f.home().join(format!("file-{i}")), "data").unwrap();
            }
            let moved = home.quarantine().unwrap();
            let cancel = ProcessCancellation::default();
            cancel.cancel();
            assert!(moved.cleanup(&cancel).unwrap_err().contains("cancelled"));
            let dir = f.0.join("accounts/.deleting-account-1/home");
            assert_eq!(std::fs::read_dir(&dir).unwrap().count(), 3);
            assert!(
                moved
                    .cleanup_with_limits(&ProcessCancellation::default(), 1, 32)
                    .unwrap_err()
                    .contains("entry limit")
            );
            assert_eq!(std::fs::read_dir(&dir).unwrap().count(), 2);
            create_private_dir(dir.join("nested")).unwrap();
            assert!(
                moved
                    .cleanup_with_limits(&ProcessCancellation::default(), 10, 0)
                    .unwrap_err()
                    .contains("depth limit")
            );
            moved.cleanup(&ProcessCancellation::default()).unwrap();
            moved.finish_cleanup().unwrap();
        }
        #[cfg(target_os = "linux")]
        #[test]
        fn provider_account_cleanup_deadline_and_mount_boundaries() {
            let f = Fixture::new();
            let home = f.open().unwrap();
            create_private_dir(f.home().join("child")).unwrap();
            std::fs::write(f.home().join("keep"), "data").unwrap();
            let moved = home.quarantine().unwrap();
            let cancel = ProcessCancellation::default();
            let mut budget = CleanupBudget {
                remaining: 100,
                depth: 32,
                deadline: std::time::Instant::now(),
                cancel: &cancel,
            };
            assert!(
                clean_directory(&moved, &mut Vec::new(), &mut budget)
                    .unwrap_err()
                    .contains("deadline")
            );
            assert_eq!(
                std::fs::read_to_string(f.0.join("accounts/.deleting-account-1/home/keep"))
                    .unwrap(),
                "data"
            );
            // Positive control exercises the exact native traversal primitive.
            cleanup_child(moved.dirs.last().unwrap().as_raw_fd(), &name("child")).unwrap();
            let root = opened(unsafe {
                libc::open(
                    name("/").as_ptr(),
                    libc::O_RDONLY | libc::O_DIRECTORY | libc::O_CLOEXEC,
                )
            })
            .unwrap();
            // Linux /proc is a separate filesystem; no mount privileges needed.
            assert_ne!(
                root.metadata().unwrap().dev(),
                std::fs::metadata("/proc").unwrap().dev()
            );
            assert!(cleanup_child(root.as_raw_fd(), &name("proc")).is_err());
        }
        #[cfg(target_os = "linux")]
        #[derive(Default)]
        struct CleanupFactory {
            fail: std::sync::atomic::AtomicBool,
            calls: std::sync::atomic::AtomicUsize,
            gate: Option<Arc<tokio::sync::Notify>>,
            entered: Option<Arc<tokio::sync::Notify>>,
        }
        #[cfg(target_os = "linux")]
        impl AccountAdapterFactory for CleanupFactory {
            fn build(&self, _: AccountLaunch) -> Result<Arc<dyn ProviderAdapter>, String> {
                panic!("raw launch forbidden")
            }
            fn rename(&self, _: &str, _: &str) -> Result<(), String> {
                Ok(())
            }
            fn reset_models(&self, _: &str) -> Result<(), String> {
                Ok(())
            }
            fn quiesce_private(
                &self,
                _: &str,
                cancel: ProcessCancellation,
            ) -> futures_util::future::BoxFuture<'static, Result<(), String>> {
                use std::sync::atomic::Ordering;
                self.calls.fetch_add(1, Ordering::SeqCst);
                let fail = self.fail.load(Ordering::SeqCst);
                let gate = self.gate.clone();
                let entered = self.entered.clone();
                Box::pin(async move {
                    if let Some(entered) = entered {
                        entered.notify_one();
                    }
                    if let Some(gate) = gate {
                        gate.notified().await;
                    }
                    if fail || cancel.is_cancelled() {
                        Err("not quiescent".into())
                    } else {
                        Ok(())
                    }
                })
            }
        }
        #[cfg(target_os = "linux")]
        fn cleanup_service(
            f: &Fixture,
            factory: Arc<CleanupFactory>,
        ) -> (ProviderAccountService, DatabaseWorker) {
            use std::num::NonZeroU16;
            let connection = rusqlite::Connection::open_in_memory().unwrap();
            connection.execute_batch("CREATE TABLE provider_accounts(id TEXT PRIMARY KEY,user_id TEXT,provider_type TEXT,node_id TEXT,label TEXT,created_at TEXT,updated_at TEXT); INSERT INTO provider_accounts VALUES('account-1','owner','opencode','gateway','Work','now','now');").unwrap();
            let db = DatabaseWorker::new(connection, NonZeroU16::new(4).unwrap()).unwrap();
            let service = ProviderAccountService::new(
                db.clone(),
                ProviderRegistry::default(),
                vec![],
                f.0.join("accounts"),
                f.0.clone(),
                None,
                BlockingLane::new(NonZeroU16::new(1).unwrap()),
                factory,
            )
            .unwrap();
            f.bind(&service);
            (service, db)
        }
        #[cfg(target_os = "linux")]
        #[tokio::test]
        async fn provider_account_delete_owner_quiescence_and_lease_fences() {
            use std::sync::atomic::Ordering;
            let f = Fixture::new();
            let factory = Arc::new(CleanupFactory::default());
            let (service, db) = cleanup_service(&f, factory.clone());
            let held = service.private_home("account-1").await.unwrap();
            held.write_go("secret").unwrap();
            assert!(
                !service
                    .delete("account-1".into(), "foreign".into())
                    .await
                    .unwrap()
            );
            assert_eq!(factory.calls.load(Ordering::SeqCst), 0);
            struct ForeignAdapter;
            impl ProviderAdapter for ForeignAdapter {
                fn id(&self) -> &str {
                    "account-1"
                }
                fn owner_user_id(&self) -> Option<&str> {
                    Some("foreign")
                }
                fn info(&self) -> Value {
                    json!({})
                }
                fn check_availability(
                    &self,
                ) -> futures_util::future::BoxFuture<'static, Result<(), String>> {
                    Box::pin(async { Ok(()) })
                }
            }
            service.registry.register(Arc::new(ForeignAdapter));
            assert!(
                service
                    .delete("account-1".into(), "owner".into())
                    .await
                    .unwrap_err()
                    .contains("ownership mismatch")
            );
            assert_eq!(factory.calls.load(Ordering::SeqCst), 0);
            assert_eq!(held.read_go().unwrap().as_deref(), Some("secret"));
            service.registry.unregister("account-1").await.unwrap();
            factory.fail.store(true, Ordering::SeqCst);
            assert!(
                service
                    .delete("account-1".into(), "owner".into())
                    .await
                    .unwrap_err()
                    .contains("quiescence")
            );
            assert_eq!(held.read_go().unwrap().as_deref(), Some("secret"));
            assert!(service.private_home("account-1").await.is_err());
            factory.fail.store(false, Ordering::SeqCst);
            assert!(
                service
                    .delete("account-1".into(), "owner".into())
                    .await
                    .unwrap_err()
                    .contains("leased")
            );
            drop(held);
            assert!(
                service
                    .delete("account-1".into(), "owner".into())
                    .await
                    .unwrap()
            );
            assert!(
                service
                    .get("account-1".into(), "owner".into())
                    .await
                    .unwrap()
                    .is_none()
            );
            assert!(!f.home().exists());
            assert!(!f.0.join("accounts/.deleting-account-1").exists());
            db.shutdown().await.unwrap();
        }
        #[cfg(target_os = "linux")]
        #[tokio::test]
        async fn provider_account_delete_db_failure_retains_tombstone_and_retries() {
            let f = Fixture::new();
            let (service, db) = cleanup_service(&f, Arc::new(CleanupFactory::default()));
            drop(service.private_home("account-1").await.unwrap());
            db.run(|db| { db.execute_batch("CREATE TRIGGER fail_delete BEFORE DELETE ON provider_accounts BEGIN SELECT RAISE(ABORT, 'injected failure'); END;")?; Ok(()) }).await.unwrap();
            assert!(
                service
                    .delete("account-1".into(), "owner".into())
                    .await
                    .unwrap_err()
                    .contains("row deletion failed")
            );
            assert!(
                service
                    .get("account-1".into(), "owner".into())
                    .await
                    .unwrap()
                    .is_some()
            );
            assert!(f.0.join("accounts/.deleting-account-1").is_dir());
            assert!(f.open().is_err());
            db.run(|db| {
                db.execute_batch("DROP TRIGGER fail_delete")?;
                Ok(())
            })
            .await
            .unwrap();
            assert!(
                service
                    .delete("account-1".into(), "owner".into())
                    .await
                    .unwrap()
            );
            assert!(!f.0.join("accounts/.deleting-account-1").exists());
            db.shutdown().await.unwrap();
        }
        #[cfg(target_os = "linux")]
        #[tokio::test]
        async fn provider_account_delete_dropped_caller_keeps_lifecycle_until_settled() {
            let f = Fixture::new();
            let gate = Arc::new(tokio::sync::Notify::new());
            let entered = Arc::new(tokio::sync::Notify::new());
            let factory = Arc::new(CleanupFactory {
                gate: Some(gate.clone()),
                entered: Some(entered.clone()),
                ..Default::default()
            });
            let (service, db) = cleanup_service(&f, factory);
            let caller_service = service.clone();
            let caller = tokio::spawn(async move {
                caller_service
                    .delete("account-1".into(), "owner".into())
                    .await
            });
            tokio::time::timeout(std::time::Duration::from_secs(2), entered.notified())
                .await
                .unwrap();
            caller.abort();
            let _ = caller.await;
            assert!(
                service
                    .rename("account-1".into(), "owner".into(), "changed")
                    .await
                    .unwrap_err()
                    .contains("busy")
            );
            assert!(f.home().is_dir());
            gate.notify_one();
            // Acquire only after the deletion supervisor settles, with a bounded wait.
            let settled =
                tokio::time::timeout(std::time::Duration::from_secs(2), service.lifecycle.lock())
                    .await
                    .unwrap();
            drop(settled);
            assert!(
                service
                    .get("account-1".into(), "owner".into())
                    .await
                    .unwrap()
                    .is_some()
            );
            assert!(service.private_home("account-1").await.is_err());
            assert!(f.home().is_dir());
            db.shutdown().await.unwrap();
        }
        #[tokio::test]
        async fn provider_orchestration_private_launcher_and_delete_fail_closed() {
            use std::num::NonZeroU16;
            struct NoRawFactory;
            impl AccountAdapterFactory for NoRawFactory {
                fn build(&self, _: AccountLaunch) -> Result<Arc<dyn ProviderAdapter>, String> {
                    panic!("local launch must never fall back to raw factory")
                }
                fn rename(&self, _: &str, _: &str) -> Result<(), String> {
                    Ok(())
                }
                fn reset_models(&self, _: &str) -> Result<(), String> {
                    Ok(())
                }
            }
            let f = Fixture::new();
            let connection = rusqlite::Connection::open_in_memory().unwrap();
            connection.execute_batch("CREATE TABLE provider_accounts(id TEXT PRIMARY KEY,user_id TEXT,provider_type TEXT,node_id TEXT,label TEXT,created_at TEXT,updated_at TEXT);
                INSERT INTO provider_accounts VALUES('account-1','owner','opencode','gateway','Work','now','now');").unwrap();
            let db = DatabaseWorker::new(connection, NonZeroU16::new(4).unwrap()).unwrap();
            let service = ProviderAccountService::new(
                db.clone(),
                ProviderRegistry::default(),
                vec![AccountDefinition {
                    id: "opencode".into(),
                    name: "OpenCode".into(),
                    description: String::new(),
                    auth: true,
                    command: "never-run".into(),
                    args: vec![],
                    env: HashMap::new(),
                    registry: json!({}),
                }],
                f.0.join("accounts"),
                f.0.clone(),
                None,
                BlockingLane::new(NonZeroU16::new(1).unwrap()),
                Arc::new(NoRawFactory),
            )
            .unwrap();
            f.bind(&service);
            let account = service
                .get("account-1".into(), "owner".into())
                .await
                .unwrap()
                .unwrap();
            assert!(service.register(&account).await.is_err());
            let held = service.private_home("account-1").await.unwrap();
            held.write_go("original").unwrap();
            assert!(
                !service
                    .delete("account-1".into(), "other".into())
                    .await
                    .unwrap()
            );
            let error = service
                .delete("account-1".into(), "owner".into())
                .await
                .unwrap_err();
            assert!(error.contains("quiescence"));
            assert!(
                service
                    .get("account-1".into(), "owner".into())
                    .await
                    .unwrap()
                    .is_some()
            );
            assert_eq!(held.read_go().unwrap().as_deref(), Some("original"));
            // Even an owner-controlled regular replacement cannot be adopted
            // by a later service request using the same account ID.
            std::fs::rename(f.home(), f.0.join("retired")).unwrap();
            create_private_dir(f.home()).unwrap();
            assert!(service.private_home("account-1").await.is_err());
            db.shutdown().await.unwrap();
        }
        #[test]
        fn provider_orchestration_creation_rejects_preexisting_links_and_writable_roots() {
            let f = Fixture::new();
            let outside = f.0.join("outside");
            create_private_dir(&outside).unwrap();
            symlink(&outside, f.0.join("accounts")).unwrap();
            assert!(f.open().is_err());
            assert!(!outside.join("account-1").exists());
            std::fs::remove_file(f.0.join("accounts")).unwrap();
            create_private_dir(f.0.join("accounts")).unwrap();
            std::fs::set_permissions(f.0.join("accounts"), std::fs::Permissions::from_mode(0o777))
                .unwrap();
            assert!(f.open().is_err());
            assert!(!f.home().exists());
        }
        #[test]
        fn provider_orchestration_account_home_replacement_rejected() {
            for linked in [false, true] {
                let fixture = Fixture::new();
                let path = fixture.home();
                let home = fixture.open().unwrap();
                home.write_go("original").unwrap();
                let old = fixture.0.join("retired");
                std::fs::rename(&path, &old).unwrap();
                let outside = fixture.0.join("outside");
                create_private_dir(&outside).unwrap();
                std::fs::write(outside.join("sentinel"), "unchanged").unwrap();
                if linked {
                    symlink(&outside, &path).unwrap();
                } else {
                    create_private_dir(&path).unwrap();
                }
                assert!(home.verify().is_err());
                assert!(home.write_go("must-not-escape").is_err());
                assert!(home.read_go().is_err());
                assert_eq!(
                    std::fs::read_to_string(outside.join("sentinel")).unwrap(),
                    "unchanged"
                );
                assert!(!outside.join(".local").exists());
                assert!(
                    std::fs::read_to_string(old.join(".local/share/opencode/auth.json"))
                        .unwrap()
                        .contains("original")
                );
            }
        }
        #[test]
        fn provider_orchestration_owner_root_replacement_rejected() {
            let f = Fixture::new();
            let home = f.open().unwrap();
            std::fs::rename(f.0.join("accounts"), f.0.join("retired-root")).unwrap();
            create_private_dir(f.0.join("accounts")).unwrap();
            assert!(home.write_go("secret").is_err());
            assert!(!f.0.join("accounts/account-1").exists());
        }
        #[test]
        fn provider_orchestration_nested_replacement_after_directory_open() {
            let f = Fixture::new();
            let home = f.open().unwrap();
            home.write_go("original").unwrap();
            let held = home.credentials().unwrap();
            let base = f.home().join(".local/share");
            std::fs::rename(base.join("opencode"), base.join("retired")).unwrap();
            let outside = f.0.join("outside");
            create_private_dir(&outside).unwrap();
            std::fs::write(outside.join("auth.json"), "unchanged").unwrap();
            symlink(&outside, base.join("opencode")).unwrap();
            assert!(held.auth().is_err());
            assert!(home.write_go("secret").is_err());
            assert_eq!(
                std::fs::read_to_string(outside.join("auth.json")).unwrap(),
                "unchanged"
            );
        }
        #[test]
        fn provider_orchestration_credentials_reject_links_special_files_and_malformed_data() {
            let f = Fixture::new();
            let home = f.open().unwrap();
            home.write_go("original").unwrap();
            let auth = f.home().join(".local/share/opencode/auth.json");
            let outside = f.0.join("outside");
            std::fs::write(&outside, "sentinel").unwrap();
            std::fs::remove_file(&auth).unwrap();
            symlink(&outside, &auth).unwrap();
            assert!(home.write_go("secret").is_err());
            std::fs::remove_file(&auth).unwrap();
            std::fs::hard_link(&outside, &auth).unwrap();
            assert!(home.write_go("secret").is_err());
            std::fs::remove_file(&auth).unwrap();
            let fifo = CString::new(auth.as_os_str().as_bytes()).unwrap();
            assert_eq!(unsafe { libc::mkfifo(fifo.as_ptr(), 0o600) }, 0);
            assert!(home.write_go("secret").is_err());
            std::fs::remove_file(&auth).unwrap();
            std::fs::write(&auth, "broken-json").unwrap();
            std::fs::set_permissions(&auth, std::fs::Permissions::from_mode(0o600)).unwrap();
            assert!(home.write_go("secret").is_err());
            assert_eq!(std::fs::read_to_string(&auth).unwrap(), "broken-json");
            assert_eq!(std::fs::read_to_string(&outside).unwrap(), "sentinel");
        }
        #[test]
        fn provider_orchestration_private_modes_and_credential_preservation() {
            let f = Fixture::new();
            let home = f.open().unwrap();
            let dir = home.credentials().unwrap();
            let auth = f.home().join(".local/share/opencode/auth.json");
            std::fs::write(&auth, r#"{"other":{"key":"keep"}}"#).unwrap();
            std::fs::set_permissions(&auth, std::fs::Permissions::from_mode(0o600)).unwrap();
            home.write_go("new").unwrap();
            assert_eq!(home.read_go().unwrap().as_deref(), Some("new"));
            assert_eq!(dir.auth().unwrap()["other"]["key"], "keep");
            assert_eq!(std::fs::metadata(auth).unwrap().mode() & 0o777, 0o600);
            assert_eq!(
                home.directory().unwrap().metadata().unwrap().mode() & 0o777,
                0o700
            );
            assert!(super::super::label(&"😀".repeat(41)).is_err());
            assert!(!super::super::safe_id("../another-account"));
        }
    }
}
#[cfg(not(unix))]
struct PrivateHome;
#[cfg(not(unix))]
impl PrivateHome {
    fn finish_cleanup(&self) -> Result<(), String> {
        Err("Private account deletion unsupported".into())
    }
    fn quarantine(&self) -> Result<Self, String> {
        Err("Private account deletion requires Unix descriptor support".into())
    }
    fn cleanup(&self, _: &ProcessCancellation) -> Result<(), String> {
        Err("Private account deletion requires Unix descriptor support".into())
    }
    fn descriptor_count(&self) -> usize {
        0
    }
    fn open(_: &Path) -> Result<Self, String> {
        Err("Private account filesystem requires Unix descriptor support".into())
    }
    fn verify(&self) -> Result<(), String> {
        Err("Private account filesystem unsupported".into())
    }
    fn write_go(&self, _: &str) -> Result<(), String> {
        self.verify()
    }
    fn read_go(&self) -> Result<Option<String>, String> {
        Err("Private account filesystem unsupported".into())
    }
}
