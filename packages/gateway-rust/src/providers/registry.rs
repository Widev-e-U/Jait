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
    /// Optional model discovery used by scheduled-job preflight.
    fn preflight_list_models(&self) -> Option<BoxFuture<'static, Result<(), String>>> {
        None
    }
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
    /// Check an accessible provider before any scheduled threads are created.
    pub async fn scheduled_preflight(&self, id: &str, user: &str) -> Value {
        let Some(provider) = self.get_for_user(id, user) else {
            return json!({"ok": false, "message": format!("Provider '{id}' is not registered on this gateway.")});
        };
        if let Err(reason) = provider.check_availability().await {
            return json!({"ok": false, "message": format!("Provider '{id}' is not available: {reason}")});
        }
        if let Some(list_models) = provider.preflight_list_models()
            && let Err(reason) = list_models.await
        {
            return json!({"ok": false, "message": format!("Provider '{id}' did not pass scheduled job preflight before thread creation: {reason}")});
        }
        json!({"ok": true})
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
    // Bun reports a failed `/mcp` resolution as a JSON-quoted sentence: it keeps
    // the `against "<base>"` clause for unparsable and hierarchical bases but
    // omits it when the base cannot-be-a-base (`mailto:`), e.g.
    // `"\"/mcp\" cannot be parsed as a URL against \"invalid/\""`.
    let parsed = url::Url::parse(&base_text);
    let mut url = match parsed
        .as_ref()
        .ok()
        .and_then(|base_url| base_url.join("/mcp").ok())
    {
        Some(url) => url,
        None => {
            let sentence = match &parsed {
                Ok(base_url) if base_url.cannot_be_a_base() => {
                    "\"/mcp\" cannot be parsed as a URL.".to_owned()
                }
                _ => format!("\"/mcp\" cannot be parsed as a URL against \"{base_text}\"."),
            };
            return Err(serde_json::to_string(&sentence).unwrap_or(sentence));
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

#[cfg(test)]
mod scheduled_preflight_tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    struct Adapter {
        owner: Option<&'static str>,
        available: bool,
        list_ok: Option<bool>,
        calls: Arc<AtomicUsize>,
    }
    impl ProviderAdapter for Adapter {
        fn id(&self) -> &str {
            "p"
        }
        fn owner_user_id(&self) -> Option<&str> {
            self.owner
        }
        fn info(&self) -> Value {
            json!({})
        }
        fn check_availability(&self) -> BoxFuture<'static, Result<(), String>> {
            let available = self.available;
            Box::pin(async move {
                if available {
                    Ok(())
                } else {
                    Err("offline".into())
                }
            })
        }
        fn preflight_list_models(&self) -> Option<BoxFuture<'static, Result<(), String>>> {
            let result = self.list_ok?;
            self.calls.fetch_add(1, Ordering::SeqCst);
            Some(Box::pin(async move {
                if result {
                    Ok(())
                } else {
                    Err("models failed".into())
                }
            }))
        }
    }
    #[tokio::test]
    async fn ownership_availability_and_model_listing_are_enforced() {
        let registry = ProviderRegistry::default();
        let calls = Arc::new(AtomicUsize::new(0));
        registry.register(Arc::new(Adapter {
            owner: Some("alice"),
            available: false,
            list_ok: Some(true),
            calls: calls.clone(),
        }));
        assert_eq!(registry.scheduled_preflight("p", "bob").await["ok"], false);
        assert_eq!(
            registry.scheduled_preflight("p", "alice").await["ok"],
            false
        );
        assert_eq!(calls.load(Ordering::SeqCst), 0);
        registry.register(Arc::new(Adapter {
            owner: Some("alice"),
            available: true,
            list_ok: Some(false),
            calls: calls.clone(),
        }));
        assert!(
            registry.scheduled_preflight("p", "alice").await["message"]
                .as_str()
                .unwrap()
                .contains("models failed")
        );
        assert_eq!(calls.load(Ordering::SeqCst), 1);
        registry.register(Arc::new(Adapter {
            owner: None,
            available: true,
            list_ok: None,
            calls,
        }));
        assert_eq!(registry.scheduled_preflight("p", "alice").await["ok"], true);
    }
}
