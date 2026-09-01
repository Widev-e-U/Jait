//! Credentials — port of Electron `credential:store/get/clear`.
//!
//! Electron persists one `safeStorage`-encrypted JSON map at
//! `<userData>/credentials.enc`. Here the same single JSON map lives in the
//! OS secret store (keyring, service "jait.desktop"). If the keyring is
//! unavailable (sandboxes, headless CI) we fall back to a base64 file next
//! to the settings file and mark availability=false so callers can warn
//! (documented in PARITY.md).

use once_cell::sync::Lazy;
use parking_lot::Mutex;
use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::Arc;

const SERVICE: &str = "jait.desktop";
const ENTRY: &str = "credentials";

/// File fallback for environments without a usable keyring.
/// Path can be overridden with `JAIT_CREDENTIALS_FILE` (tests / portable mode).
fn fallback_path() -> PathBuf {
    if let Ok(p) = std::env::var("JAIT_CREDENTIALS_FILE") {
        return PathBuf::from(p);
    }
    #[cfg(test)]
    {
        // In tests never touch the real keyring: always isolate to a temp file.
        return std::env::temp_dir().join(format!("jait-credentials-test-{}", std::process::id()));
    }
    #[cfg(not(test))]
    {
        let home = std::env::var("HOME").unwrap_or_else(|_| ".".into());
        PathBuf::from(home).join(".local/share/jait/desktop/credentials.enc.b64")
    }
}

static CREDENTIAL_LOCK: Lazy<Mutex<()>> = Lazy::new(|| Mutex::new(()));
static FILE_MODE: Lazy<Arc<std::sync::atomic::AtomicBool>> = Lazy::new(|| {
    // Start in keyring mode; flip to file mode on first keyring failure.
    Arc::new(false.into())
});

fn file_mode() -> bool {
    FILE_MODE.load(std::sync::atomic::Ordering::Relaxed)
        || std::env::var("JAIT_CREDENTIALS_FILE").is_ok()
}

fn set_file_mode() {
    FILE_MODE.store(true, std::sync::atomic::Ordering::Relaxed);
}

fn encode_file(map: &BTreeMap<String, String>) -> String {
    // Mild obfuscation like safeStorage-at-rest, not real crypto in file mode.
    use base64::Engine;
    base64::engine::general_purpose::STANDARD.encode(serde_json::to_vec(map).unwrap_or_default())
}

fn decode_file(raw: &str) -> Result<BTreeMap<String, String>, String> {
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(raw.trim())
        .map_err(|e| e.to_string())?;
    serde_json::from_slice(&bytes).map_err(|e| e.to_string())
}

fn read_map_from_keyring() -> Result<BTreeMap<String, String>, String> {
    let entry = keyring::Entry::new(SERVICE, ENTRY).map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(raw) => serde_json::from_str(&raw).map_err(|e| e.to_string()),
        Err(keyring::Error::NoEntry) => Ok(BTreeMap::new()),
        Err(e) => Err(e.to_string()),
    }
}

fn write_map_to_keyring(map: &BTreeMap<String, String>) -> Result<(), String> {
    let entry = keyring::Entry::new(SERVICE, ENTRY).map_err(|e| e.to_string())?;
    let raw = serde_json::to_string(map).map_err(|e| e.to_string())?;
    entry.set_password(&raw).map_err(|e| e.to_string())
}

fn read_file_map() -> Result<BTreeMap<String, String>, String> {
    let path = fallback_path();
    let raw = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    decode_file(&raw)
}

fn write_file_map(map: &BTreeMap<String, String>) -> Result<(), String> {
    let path = fallback_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&path, encode_file(map)).map_err(|e| e.to_string())
}

fn read_map() -> Result<BTreeMap<String, String>, String> {
    if file_mode() {
        return read_file_map().or_else(|_| Ok(BTreeMap::new()));
    }
    match read_map_from_keyring() {
        Ok(map) => Ok(map),
        Err(_) => {
            // Degrade to file mode from now on (mirrors `isEncryptionAvailable() == false`).
            set_file_mode();
            read_file_map().or_else(|_| Ok(BTreeMap::new()))
        }
    }
}

fn write_map(map: &BTreeMap<String, String>) -> Result<(), String> {
    if file_mode() {
        return write_file_map(map);
    }
    match write_map_to_keyring(map) {
        Ok(()) => Ok(()),
        Err(_) => {
            set_file_mode();
            write_file_map(map)
        }
    }
}

/// Mirrors `safeStorage.isEncryptionAvailable()` → `credential:available`.
pub fn is_encryption_available() -> bool {
    if file_mode() {
        return false; // file fallback = degraded availability, callers may warn
    }
    let probe = || -> Result<(), keyring::Error> {
        let entry = keyring::Entry::new(SERVICE, ENTRY)?;
        match entry.get_password() {
            Ok(_) => Ok(()),
            Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(e),
        }
    };
    probe().is_ok()
}

/// Mirrors `credential:store` → `{ ok } | { ok:false, error }`.
pub fn store(key: &str, value: &str) -> Result<(), String> {
    let _guard = CREDENTIAL_LOCK.lock();
    let mut map = read_map()?;
    map.insert(key.to_string(), value.to_string());
    write_map(&map)
}

/// Mirrors `credential:get` → `{ value }` (None when missing/unavailable).
pub fn get(key: &str) -> Option<String> {
    let _guard = CREDENTIAL_LOCK.lock();
    read_map().ok()?.remove(key)
}

/// Mirrors `credential:clear` → always ok.
pub fn clear(key: &str) -> Result<(), String> {
    let _guard = CREDENTIAL_LOCK.lock();
    let mut map = read_map()?;
    map.remove(key);
    write_map(&map)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn store_get_clear_roundtrip() {
        // Deterministic: isolated file fallback for the test process.
        std::env::set_var("JAIT_CREDENTIALS_FILE", {
            let p = std::env::temp_dir().join(format!(
                "jait-cred-{}-{}.b64",
                std::process::id(),
                uuid::Uuid::new_v4()
            ));
            p.to_string_lossy().into_owned()
        });
        clear("agent:test").ok();
        store("agent:test", r#"{"token":"t1"}"#).unwrap();
        assert_eq!(get("agent:test").as_deref(), Some(r#"{"token":"t1"}"#));
        clear("agent:test").unwrap();
        assert_eq!(get("agent:test"), None);
    }
}
