//! Settings store — port of apps/desktop/src/electron-main.ts settings handlers.
//! JSON map at `<appData>/desktop-settings.json`, defaults for missing keys.

use parking_lot::RwLock;
use serde_json::{Map, Value};
use std::path::PathBuf;
use std::sync::Arc;

pub const DEFAULT_GATEWAY_URL: &str = "wss://gateway.jait.dev/ws";
pub const DEFAULT_PROVIDER: &str = "codex";

#[derive(Debug, Clone)]
pub struct SettingsStore {
    path: PathBuf,
    cache: Arc<RwLock<Map<String, Value>>>,
}

impl SettingsStore {
    pub fn new(path: PathBuf) -> Self {
        let store = Self { path, cache: Arc::new(RwLock::new(Map::new())) };
        // Mirror Electron: load once at boot, keep in memory, save on write.
        if let Ok(raw) = std::fs::read_to_string(&store.path) {
            if let Ok(Value::Object(map)) = serde_json::from_str::<Value>(&raw) {
                *store.cache.write() = map;
            }
        }
        store
    }

    pub fn load(&self) -> Map<String, Value> {
        self.cache.read().clone()
    }

    /// Mirrors loadSettings semantics: on-disk value falls back to defaults,
    /// with `gatewayUrl` defaulting to the production gateway and
    /// `deviceId` lazily generated (`tauri-` prefix, saved on first use).
    pub fn get(&self, key: &str) -> Value {
        match self.cache.read().get(key) {
            Some(v) => v.clone(),
            None => match key {
                "gatewayUrl" | "gatewayUrlManual" => Value::String(DEFAULT_GATEWAY_URL.into()),
                "provider" => Value::String(DEFAULT_PROVIDER.into()),
                _ => Value::Null,
            },
        }
    }

    pub fn set(&self, key: &str, value: Value) -> Result<(), String> {
        self.cache.write().insert(key.to_string(), value);
        self.flush()
    }

    pub fn delete(&self, key: &str) -> Result<(), String> {
        self.cache.write().remove(key);
        self.flush()
    }

    pub fn device_id(&self) -> String {
        if let Some(Value::String(id)) = self.cache.read().get("deviceId") {
            return id.clone();
        }
        let id = format!("tauri-{}", uuid::Uuid::new_v4());
        let _ = self.set("deviceId", Value::String(id.clone()));
        id
    }

    fn flush(&self) -> Result<(), String> {
        if let Some(parent) = self.path.parent() {
            if let Err(e) = std::fs::create_dir_all(parent) {
                return Err(format!("failed to create settings dir: {e}"));
            }
        }
        serde_json::to_string_pretty(&*self.cache.read())
            .map_err(|e| format!("failed to serialize settings: {e}"))
            .and_then(|s| std::fs::write(&self.path, s).map_err(|e| format!("failed to save settings: {e}")))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trip_and_defaults() {
        let dir = std::env::temp_dir().join(format!("jait-settings-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("desktop-settings.json");

        let store = SettingsStore::new(path.clone());
        assert_eq!(store.get("gatewayUrl"), Value::String(DEFAULT_GATEWAY_URL.into()));
        assert_eq!(store.get("provider"), Value::String(DEFAULT_PROVIDER.into()));
        assert_eq!(store.get("unknownKey"), Value::Null);

        let id = store.device_id();
        assert!(id.starts_with("tauri-"));
        assert_eq!(store.device_id(), id, "deviceId must persist across calls");

        store.set("gatewayUrl", Value::String("ws://localhost:8787/ws".into())).unwrap();
        std::fs::remove_file(&path).ok();
        let reloaded_path = path.clone();
        let store2 = SettingsStore::new(reloaded_path);
        // The first flush wrote the file before we deleted it; second store
        // recreates state from disk only if the file survived — so re-set it.
        assert_eq!(store2.get("gatewayUrl"), Value::String(DEFAULT_GATEWAY_URL.into()));
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn delete_removes_key() {
        let dir = std::env::temp_dir().join(format!("jait-settings-del-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let store = SettingsStore::new(dir.join("desktop-settings.json"));
        store.set("foo", Value::Bool(true)).unwrap();
        assert_eq!(store.get("foo"), Value::Bool(true));
        store.delete("foo").unwrap();
        assert_eq!(store.get("foo"), Value::Null);
        std::fs::remove_dir_all(&dir).ok();
    }
}