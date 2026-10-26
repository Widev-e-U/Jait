//! Provider registration, ownership visibility and MCP endpoint construction.
//! Adapter process execution is supplied by concrete native adapters.
use super::jait_mcp::{
    JAIT_CORE_MCP_SERVER_NAME, JAIT_DEFERRED_MCP_SERVER_NAME, OMNIROUTE_MCP_SERVER_NAME,
};
use crate::text::js_trim;
use futures_util::{future::BoxFuture, future::join_all};
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
};
pub trait ProviderAdapter: Send + Sync {
    fn id(&self) -> &str;
    fn owner_user_id(&self) -> Option<&str> {
        None
    }
    fn info(&self) -> Value;
    fn check_availability(&self) -> BoxFuture<'static, Result<(), String>>;
    fn dispose(&self) -> BoxFuture<'static, Result<(), String>> {
        Box::pin(async { Ok(()) })
    }
}
#[derive(Clone, Default)]
pub struct ProviderRegistry {
    providers: Arc<Mutex<Vec<Arc<dyn ProviderAdapter>>>>,
}
impl ProviderRegistry {
    pub fn register(&self, adapter: Arc<dyn ProviderAdapter>) {
        let mut providers = self.providers.lock().unwrap();
        if let Some(existing) = providers.iter_mut().find(|p| p.id() == adapter.id()) {
            *existing = adapter;
        } else {
            providers.push(adapter);
        }
    }
    pub fn get(&self, id: &str) -> Option<Arc<dyn ProviderAdapter>> {
        self.providers
            .lock()
            .unwrap()
            .iter()
            .find(|p| p.id() == id)
            .cloned()
    }
    pub fn get_for_user(&self, id: &str, user: &str) -> Option<Arc<dyn ProviderAdapter>> {
        self.get(id).filter(|p| {
            p.owner_user_id()
                .filter(|s| !s.is_empty())
                .is_none_or(|owner| owner == user)
        })
    }
    pub fn is_visible_to(&self, id: &str, user: &str) -> bool {
        self.get_for_user(id, user).is_some()
    }
    pub fn get_or_throw(&self, id: &str) -> Result<Arc<dyn ProviderAdapter>, String> {
        self.get(id)
            .ok_or_else(|| format!("Unknown provider: {id}"))
    }
    pub fn list(&self) -> Vec<Arc<dyn ProviderAdapter>> {
        self.providers.lock().unwrap().clone()
    }
    pub async fn unregister(&self, id: &str) -> Result<bool, String> {
        let provider = {
            let mut providers = self.providers.lock().unwrap();
            providers
                .iter()
                .position(|p| p.id() == id)
                .map(|i| providers.remove(i))
        };
        let Some(provider) = provider else {
            return Ok(false);
        };
        provider.dispose().await?;
        Ok(true)
    }
    pub async fn check_all(&self) -> Vec<Value> {
        self.check_all_with_log(Arc::new(|e| {
            eprintln!("Provider availability check failed: {e}")
        }))
        .await
    }
    pub async fn check_all_with_log(&self, log: Arc<dyn Fn(String) + Send + Sync>) -> Vec<Value> {
        let pending = self
            .list()
            .iter()
            .map(|p| p.check_availability())
            .collect::<Vec<_>>();
        for result in join_all(pending).await {
            if let Err(e) = result {
                log(e);
            }
        }
        self.list().iter().map(|p| p.info()).collect()
    }
}
pub fn build_jait_mcp_server_ref(
    host: &str,
    port: u16,
    base: Option<&str>,
    context: &Value,
) -> Result<Value, String> {
    let host = if host == "0.0.0.0" { "127.0.0.1" } else { host };
    let base = base
        .map(js_trim)
        .map(|s| s.trim_end_matches('/'))
        .filter(|s| !s.is_empty())
        .map(String::from)
        .unwrap_or_else(|| format!("http://{host}:{port}"));
    let base_text = format!("{base}/");
    let mut url = match url::Url::parse(&base_text) {
        Ok(parsed) => parsed
            .join("/mcp")
            .map_err(|_| "\"/mcp\" cannot be parsed as a URL.".to_owned())?,
        Err(_) => {
            return Err(format!(
                "\"/mcp\" cannot be parsed as a URL against {}",
                serde_json::to_string(&base_text).expect("URL text")
            ));
        }
    };
    for name in ["sessionId", "projectRoot", "runtimeMode"] {
        if let Some(v) = context[name].as_str().filter(|s| !s.is_empty()) {
            url.query_pairs_mut().append_pair(name, v);
        }
    }
    Ok(json!({"name":JAIT_DEFERRED_MCP_SERVER_NAME,"transport":"http","url":url.as_str()}))
}
pub fn build_omniroute_mcp_server_ref(env: &HashMap<String, String>) -> Option<Value> {
    if env
        .get("JAIT_OMNIROUTE_MCP")
        .map(|s| js_trim(s).to_lowercase())
        .as_deref()
        != Some("1")
    {
        return None;
    }
    let key = env
        .get("OMNIROUTE_API_KEY")
        .map(|s| js_trim(s))
        .filter(|s| !s.is_empty())?;
    let root = env
        .get("OMNIROUTE_BASE_URL")
        .map(|s| js_trim(s))
        .filter(|s| !s.is_empty())
        .unwrap_or("http://localhost:20128/v1")
        .trim_end_matches('/');
    let root = root.strip_suffix("/v1").unwrap_or(root);
    Some(
        json!({"name":OMNIROUTE_MCP_SERVER_NAME,"transport":"http","url":format!("{root}/api/mcp/stream"),"headers":{"Authorization":format!("Bearer {key}")}}),
    )
}
pub fn build_jait_mcp_server_refs(
    host: &str,
    port: u16,
    base: Option<&str>,
    context: &Value,
    env: &HashMap<String, String>,
) -> Result<Vec<Value>, String> {
    let reference = build_jait_mcp_server_ref(host, port, base, context)?;
    let mut refs = vec![];
    for (name, set) in [
        (JAIT_CORE_MCP_SERVER_NAME, "core"),
        (JAIT_DEFERRED_MCP_SERVER_NAME, "deferred"),
    ] {
        let mut r = reference.clone();
        let mut url =
            url::Url::parse(r["url"].as_str().expect("reference URL")).expect("constructed URL");
        url.query_pairs_mut().append_pair("toolSet", set);
        r["name"] = json!(name);
        r["url"] = json!(url.as_str());
        refs.push(r);
    }
    if let Some(r) = build_omniroute_mcp_server_ref(env) {
        refs.push(r);
    }
    Ok(refs)
}
