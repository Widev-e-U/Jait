//! Native port of `packages/gateway/src/services/messenger-matrix-runtime.ts`.
//!
//! The TypeScript module is a thin runtime boundary: it re-exports the pieces of
//! `matrix-bot-sdk` that the messenger service wires up (`MatrixClient`,
//! `SimpleFsStorageProvider`, `RustSdkCryptoStorageProvider`,
//! `RustSdkCryptoStoreType`, `LogService`, `LogLevel`, `EncryptedRoomEvent`).
//! Because the gateway no longer links a Matrix SDK, this module owns the
//! equivalent native runtime primitives and the event-envelope mapping the
//! messenger service performs around them, keeping the observable behaviour
//! (storage file layout, JSON defaults, log-level ordering, encrypted-event
//! unwrapping) identical to the SDK objects the TypeScript code handed out.
//!
//! Reference vectors for these behaviours were produced by executing the real
//! TypeScript: `.jait/artifacts/gateway-rust/team-chat-w2/probe_matrix.ts`.

use serde_json::{Map, Value, json};
use sha2::{Digest, Sha512};
use std::collections::BTreeSet;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

/// The exact set of runtime bindings `messenger-matrix-runtime.ts` exposed,
/// in the module namespace order Node reports for it.
/// `RustSdkCryptoStoreType` is exported type-only, so it is absent from the
/// runtime namespace even though the native enum below still exists.
pub const RUNTIME_EXPORTS: [&str; 6] = [
    "EncryptedRoomEvent",
    "LogLevel",
    "LogService",
    "MatrixClient",
    "RustSdkCryptoStorageProvider",
    "SimpleFsStorageProvider",
];

// ---------------------------------------------------------------------------
// LogLevel / LogService
// ---------------------------------------------------------------------------

/// Mirror of the SDK's `LogLevel` object: an ordered ladder of named levels.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct LogLevel {
    name: &'static str,
    sequence: i32,
}

impl LogLevel {
    pub const TRACE: LogLevel = LogLevel {
        name: "TRACE",
        sequence: -1,
    };
    pub const DEBUG: LogLevel = LogLevel {
        name: "DEBUG",
        sequence: 0,
    };
    pub const INFO: LogLevel = LogLevel {
        name: "INFO",
        sequence: 1,
    };
    pub const WARN: LogLevel = LogLevel {
        name: "WARN",
        sequence: 2,
    };
    pub const ERROR: LogLevel = LogLevel {
        name: "ERROR",
        sequence: 3,
    };

    /// All levels in SDK declaration order.
    pub const ALL: [LogLevel; 5] = [
        LogLevel::TRACE,
        LogLevel::DEBUG,
        LogLevel::INFO,
        LogLevel::WARN,
        LogLevel::ERROR,
    ];

    pub fn name(&self) -> &'static str {
        self.name
    }

    pub fn sequence(&self) -> i32 {
        self.sequence
    }

    /// `includes(level)` — true when `level` is at least as severe as `self`.
    pub fn includes(&self, level: &LogLevel) -> bool {
        level.sequence >= self.sequence
    }

    /// `LogLevel.fromString(input, defaultLevel)` — case-insensitive; on an
    /// unknown name the *default* is returned.
    pub fn from_string(input: Option<&str>, default_level: Option<LogLevel>) -> LogLevel {
        let raw = input.unwrap_or("").to_ascii_uppercase();
        LogLevel::ALL
            .iter()
            .copied()
            .find(|l| l.name == raw)
            .unwrap_or_else(|| default_level.unwrap_or(LogLevel::DEBUG))
    }

    /// Lookup that ignores the default (returns `None` for unknown names).
    pub fn lookup(input: &str) -> Option<LogLevel> {
        let raw = input.to_ascii_uppercase();
        LogLevel::ALL.iter().copied().find(|l| l.name == raw)
    }
}

struct LogState {
    level: LogLevel,
    muted: BTreeSet<String>,
}

fn log_state() -> &'static Mutex<LogState> {
    static STATE: OnceLock<Mutex<LogState>> = OnceLock::new();
    STATE.get_or_init(|| {
        Mutex::new(LogState {
            // `LogService.logLevel = LogLevel.INFO` is the SDK's static
            // initialiser; it stays INFO until an explicit `setLevel`.
            level: LogLevel::INFO,
            muted: BTreeSet::new(),
        })
    })
}

/// Mirror of the SDK's `LogService` statics.
pub struct LogService;

impl LogService {
    /// Current global level (`LogService.level`).
    pub fn level() -> LogLevel {
        log_state().lock().expect("log state poisoned").level
    }

    /// `LogService.setLevel(level)` — `null`/absent means DEBUG, as in the SDK.
    pub fn set_level(level: Option<LogLevel>) -> LogLevel {
        let mut state = log_state().lock().expect("log state poisoned");
        state.level = level.unwrap_or(LogLevel::DEBUG);
        state.level
    }

    /// `LogService.muteModule(module)`.
    pub fn mute_module(module: &str) {
        log_state()
            .lock()
            .expect("log state poisoned")
            .muted
            .insert(module.to_string());
    }

    /// `LogService.isModuleMuted(module)`.
    pub fn is_module_muted(module: &str) -> bool {
        log_state()
            .lock()
            .expect("log state poisoned")
            .muted
            .contains(module)
    }

    /// `LogService.shouldLog(level, module)`.
    pub fn should_log(level: &LogLevel, module: &str) -> bool {
        if LogService::is_module_muted(module) {
            return false;
        }
        LogService::level().includes(level)
    }
}

// ---------------------------------------------------------------------------
// Crypto store type
// ---------------------------------------------------------------------------

/// Mirror of the SDK's `RustSdkCryptoStoreType` enum (`0`/`1` on the wire).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CryptoStoreType {
    Legacy = 0,
    Sqlite = 1,
}

impl CryptoStoreType {
    pub fn from_i32(value: i32) -> Option<CryptoStoreType> {
        match value {
            0 => Some(CryptoStoreType::Legacy),
            1 => Some(CryptoStoreType::Sqlite),
            _ => None,
        }
    }
}

// ---------------------------------------------------------------------------
// Storage providers
// ---------------------------------------------------------------------------

fn read_json_file(path: &Path) -> Option<Value> {
    let raw = fs::read_to_string(path).ok()?;
    serde_json::from_str(&raw).ok()
}

fn write_json_file(path: &Path, value: &Value) -> io::Result<()> {
    if let Some(parent) = path.parent()
        && !parent.as_os_str().is_empty()
    {
        fs::create_dir_all(parent)?;
    }
    fs::write(
        path,
        serde_json::to_string(value).expect("serialisable storage"),
    )
}

fn hex_sha512(input: &str) -> String {
    let mut hasher = Sha512::new();
    hasher.update(input.as_bytes());
    let digest = hasher.finalize();
    let mut out = String::with_capacity(digest.len() * 2);
    for byte in digest {
        out.push_str(&format!("{byte:02x}"));
    }
    out
}

/// Native counterpart of `SimpleFsStorageProvider`: a single JSON file holding
/// `{syncToken, filter, appserviceUsers, appserviceTransactions, kvStore}`.
pub struct SimpleFsStorageProvider {
    path: PathBuf,
    storage: Value,
    /// `trackTransactionsInMemory` — when true, txn ids live in RAM only.
    track_transactions_in_memory: bool,
    /// Completed transaction ids kept in memory (SDK caps this list at 20).
    completed_transactions: Vec<String>,
}

/// The SDK keeps at most this many in-memory completed transaction ids.
pub const MAX_IN_MEMORY_TRANSACTIONS: usize = 20;

impl SimpleFsStorageProvider {
    /// Defaults written by the SDK when the file is absent.
    pub fn default_storage() -> Value {
        json!({
            "syncToken": Value::Null,
            "filter": Value::Null,
            "appserviceUsers": Map::new(),
            "appserviceTransactions": Map::new(),
            "kvStore": Map::new(),
        })
    }

    /// Creates the parent directory like the SDK constructor does, loads an
    /// existing file when present, and otherwise writes the defaults so that a
    /// freshly constructed provider already owns a five-key file on disk.
    pub fn new(path: impl Into<PathBuf>) -> io::Result<SimpleFsStorageProvider> {
        let path = path.into();
        if let Some(parent) = path.parent()
            && !parent.as_os_str().is_empty()
        {
            fs::create_dir_all(parent)?;
        }
        let storage = match read_json_file(&path) {
            Some(existing) => existing,
            None => {
                let defaults = SimpleFsStorageProvider::default_storage();
                write_json_file(&path, &defaults)?;
                defaults
            }
        };
        Ok(SimpleFsStorageProvider {
            path,
            storage,
            track_transactions_in_memory: true,
            completed_transactions: Vec::new(),
        })
    }

    /// `SimpleFsStorageProvider` tracks completed appservice transactions in
    /// memory by default (`trackTransactionsInMemory = true`).
    pub fn new_with_transaction_tracking(
        path: impl Into<PathBuf>,
        track_transactions_in_memory: bool,
    ) -> io::Result<SimpleFsStorageProvider> {
        let mut provider = SimpleFsStorageProvider::new(path)?;
        provider.track_transactions_in_memory = track_transactions_in_memory;
        Ok(provider)
    }

    pub fn file_path(&self) -> &Path {
        &self.path
    }

    pub fn storage(&self) -> &Value {
        &self.storage
    }

    fn persist(&self) -> io::Result<()> {
        write_json_file(&self.path, &self.storage)
    }

    pub fn get_sync_token(&self) -> Option<String> {
        self.storage
            .get("syncToken")
            .and_then(Value::as_str)
            .map(str::to_string)
    }

    pub fn set_sync_token(&mut self, token: Option<&str>) -> io::Result<()> {
        self.storage["syncToken"] = token.map(|t| json!(t)).unwrap_or(Value::Null);
        self.persist()
    }

    pub fn get_filter(&self) -> Option<Value> {
        match self.storage.get("filter") {
            Some(Value::Null) | None => None,
            Some(value) => Some(value.clone()),
        }
    }

    pub fn set_filter(&mut self, filter: Option<Value>) -> io::Result<()> {
        self.storage["filter"] = filter.unwrap_or(Value::Null);
        self.persist()
    }

    /// `storeValue(key, value)`.
    pub fn store_value(&mut self, key: &str, value: Value) -> io::Result<()> {
        self.storage["kvStore"][key] = value;
        self.persist()
    }

    /// `readValue(key)`.
    pub fn read_value(&self, key: &str) -> Option<Value> {
        self.storage.get("kvStore")?.get(key).cloned()
    }

    /// Appservice user bookkeeping keeps the same shape as the SDK: the key is
    /// the lowercase hex SHA-512 of the user id and the value records the id.
    pub fn set_user_record(&mut self, user_id: &str, value: Value) -> io::Result<()> {
        self.storage["appserviceUsers"][hex_sha512(user_id)] = value;
        self.persist()
    }

    pub fn user_record(&self, user_id: &str) -> Option<Value> {
        self.storage
            .get("appserviceUsers")?
            .get(hex_sha512(user_id))
            .cloned()
    }

    /// `addRegisteredUser(userId)`.
    pub fn add_registered_user(&mut self, user_id: &str) -> io::Result<()> {
        self.set_user_record(user_id, json!({ "userId": user_id, "registered": true }))
    }

    /// `isUserRegistered(userId)` — `undefined` in the SDK, i.e. `false` here.
    pub fn is_user_registered(&self, user_id: &str) -> bool {
        self.user_record(user_id)
            .and_then(|v| v.get("registered").and_then(Value::as_bool))
            .unwrap_or(false)
    }

    /// `setTransactionCompleted(txnId, completed = true)`.
    ///
    /// With the default in-memory tracking the id only lives in RAM and is
    /// lost as soon as the provider is rebuilt (which is what the reference
    /// run observes); with disk tracking the record is stored under the
    /// lower-case hex SHA-512 of the transaction id.
    pub fn set_transaction_completed(&mut self, txn_id: &str, completed: bool) -> io::Result<()> {
        if self.track_transactions_in_memory {
            let known = self
                .completed_transactions
                .iter()
                .position(|id| id == txn_id);
            match (completed, known) {
                (true, None) => self.completed_transactions.push(txn_id.to_string()),
                (false, Some(index)) => {
                    self.completed_transactions.remove(index);
                }
                _ => {}
            }
            while self.completed_transactions.len() > MAX_IN_MEMORY_TRANSACTIONS {
                self.completed_transactions.remove(0);
            }
            return Ok(());
        }
        self.storage["appserviceTransactions"][hex_sha512(txn_id)] = json!({
            "txnId": txn_id,
            "completed": completed,
        });
        self.persist()
    }

    /// `isTransactionCompleted(txnId)`.
    pub fn is_transaction_completed(&self, txn_id: &str) -> bool {
        if self.track_transactions_in_memory {
            return self.completed_transactions.iter().any(|id| id == txn_id);
        }
        self.storage
            .get("appserviceTransactions")
            .and_then(|txns| txns.get(hex_sha512(txn_id)))
            .and_then(|record| record.get("completed"))
            .and_then(Value::as_bool)
            .unwrap_or(false)
    }

    /// `storageForUser(userId)` — the SDK hands back the same file behind a
    /// namespacing wrapper, so keys are prefixed per user.
    pub fn storage_for_user(&self, user_id: &str) -> NamespacedStorage<'_> {
        NamespacedStorage {
            inner: self,
            prefix: format!("_u_{user_id}"),
        }
    }
}

/// Mirror of the SDK's `NamespacedStorage`: the same backing file, but every
/// key is prefixed with the owning user id, so `storeValue("k", v)` lands in
/// `kvStore["_u_<userId>k"]`.
pub struct NamespacedStorage<'a> {
    inner: &'a SimpleFsStorageProvider,
    prefix: String,
}

impl NamespacedStorage<'_> {
    pub fn user_prefix(&self) -> &str {
        &self.prefix
    }

    pub fn key(&self, key: &str) -> String {
        format!("{}{}", self.prefix, key)
    }

    pub fn read_value(&self, key: &str) -> Option<Value> {
        self.inner.read_value(&self.key(key))
    }

    pub fn get_sync_token(&self) -> Option<String> {
        self.inner
            .read_value(&self.key("_int_syncToken"))
            .and_then(|v| v.as_str().map(str::to_string))
    }

    pub fn get_filter(&self) -> Option<Value> {
        match self.inner.read_value(&self.key("_int_filter")) {
            Some(Value::Null) | None => None,
            Some(value) => Some(value),
        }
    }
}

/// Native counterpart of `RustSdkCryptoStorageProvider`: one `bot-sdk.json`
/// inside the configured directory plus one `<sha512(roomId)>.json` per room.
pub struct RustSdkCryptoStorageProvider {
    path: PathBuf,
    store_type: CryptoStoreType,
    storage: Value,
}

impl RustSdkCryptoStorageProvider {
    /// The SDK's lowdb `FileSync` store starts as an empty object; `deviceId`
    /// and `rooms` only appear once they are written.
    pub fn default_storage() -> Value {
        Value::Object(Map::new())
    }

    pub fn new(path: impl Into<PathBuf>, store_type: CryptoStoreType) -> io::Result<Self> {
        let path = path.into();
        fs::create_dir_all(&path)?;
        let store_file = path.join("bot-sdk.json");
        let storage = read_json_file(&store_file).unwrap_or_else(Self::default_storage);
        Ok(RustSdkCryptoStorageProvider {
            path,
            store_type,
            storage,
        })
    }

    pub fn store_type(&self) -> CryptoStoreType {
        self.store_type
    }

    pub fn store_file(&self) -> PathBuf {
        self.path.join("bot-sdk.json")
    }

    pub fn device_id(&self) -> Option<String> {
        self.storage
            .get("deviceId")
            .and_then(Value::as_str)
            .map(str::to_string)
    }

    pub fn set_device_id(&mut self, device_id: Option<&str>) -> io::Result<()> {
        self.storage["deviceId"] = device_id.map(|d| json!(d)).unwrap_or(Value::Null);
        self.persist()
    }

    /// Deterministic per-room key: lowercase hex SHA-512 of the room id.
    pub fn room_key(room_id: &str) -> String {
        hex_sha512(room_id)
    }

    pub fn room_file(&self, room_id: &str) -> PathBuf {
        self.path.join(format!("{}.json", Self::room_key(room_id)))
    }

    pub fn get_room(&self, room_id: &str) -> Option<Value> {
        self.storage
            .get("rooms")?
            .get(Self::room_key(room_id))
            .cloned()
    }

    pub fn store_room(&mut self, room_id: &str, data: Value) -> io::Result<()> {
        self.storage["rooms"][Self::room_key(room_id)] = data;
        self.persist()
    }

    fn persist(&self) -> io::Result<()> {
        write_json_file(&self.store_file(), &self.storage)
    }
}

// ---------------------------------------------------------------------------
// Encrypted room events
// ---------------------------------------------------------------------------

/// Native counterpart of `EncryptedRoomEvent`, the wrapper the messenger service
/// constructs around every inbound `m.room.encrypted` event.
#[derive(Clone, Debug)]
pub struct EncryptedRoomEvent {
    event: Value,
}

impl EncryptedRoomEvent {
    pub fn new(event: Value) -> Result<EncryptedRoomEvent, String> {
        if !event.is_object() {
            return Err("Event must be an object".to_string());
        }
        Ok(EncryptedRoomEvent { event })
    }

    pub fn event(&self) -> &Value {
        &self.event
    }

    pub fn is_encrypted(&self) -> bool {
        self.event.get("type").and_then(Value::as_str) == Some("m.room.encrypted")
    }

    pub fn algorithm(&self) -> Option<&str> {
        self.event.get("content")?.get("algorithm")?.as_str()
    }
}

/// Decryption hook supplied by whatever crypto backend the runtime is given.
pub trait CryptoBackend {
    fn decrypt_room_event(
        &self,
        event: &EncryptedRoomEvent,
        room_id: &str,
    ) -> Result<Value, String>;
}

/// History lookup the messenger service falls back to for keys it no longer has.
pub trait HistoryLookup {
    fn decrypt(&self, room_id: &str, event: &EncryptedRoomEvent) -> Result<Value, String>;
}

/// Mirror of the messenger service's inbound event normalisation.
///
/// * plain events pass through with `unsigned.jaitEncrypted = false`,
/// * a successful crypto decrypt wins and returns the clear event with
///   `unsigned.jaitEncrypted = true`,
/// * otherwise a history decryption is merged *over* the original event while
///   `unsigned` still comes from the original event,
/// * if both paths fail the original event is returned untouched.
pub fn decrypt_messenger_event(
    backend: Option<&dyn CryptoBackend>,
    history: Option<&dyn HistoryLookup>,
    room_id: &str,
    event: Value,
) -> Value {
    let encrypted = match EncryptedRoomEvent::new(event.clone()) {
        Ok(encrypted) => encrypted,
        Err(_) => return with_encrypted_flag(event, false),
    };
    if !encrypted.is_encrypted() {
        return with_encrypted_flag(event, false);
    }
    if let Some(backend) = backend
        && let Ok(decrypted) = backend.decrypt_room_event(&encrypted, room_id)
    {
        return with_encrypted_flag(decrypted, true);
    }
    if let Some(history) = history
        && let Ok(clear) = history.decrypt(room_id, &encrypted)
    {
        return merge_history_clear(event, clear);
    }
    event
}

/// `{...event, unsigned: {...event.unsigned, jaitEncrypted: flag}}` — a spread
/// of a non-object source contributes nothing, exactly like JS.
fn with_encrypted_flag(event: Value, encrypted: bool) -> Value {
    let unsigned = event
        .get("unsigned")
        .filter(|value| value.is_object())
        .cloned()
        .unwrap_or_else(|| json!({}));
    let mut merged = match event {
        Value::Object(map) => Value::Object(map),
        _ => json!({}),
    };
    merged["unsigned"] = unsigned;
    merged["unsigned"]["jaitEncrypted"] = json!(encrypted);
    merged
}

/// `{...event, ...clear, unsigned: {...event.unsigned, jaitEncrypted: true}}`.
fn merge_history_clear(event: Value, clear: Value) -> Value {
    let unsigned = event
        .get("unsigned")
        .filter(|value| value.is_object())
        .cloned()
        .unwrap_or_else(|| json!({}));
    let mut merged = match event {
        Value::Object(map) => Value::Object(map),
        _ => json!({}),
    };
    if let Value::Object(clear_map) = clear {
        for (key, value) in clear_map {
            merged[key] = value;
        }
    }
    merged["unsigned"] = unsigned;
    merged["unsigned"]["jaitEncrypted"] = json!(true);
    merged
}

// ---------------------------------------------------------------------------
// Session wiring
// ---------------------------------------------------------------------------

/// The subset of the persisted Matrix session the runtime needs.
#[derive(Clone, Debug)]
pub struct MatrixSession {
    pub homeserver_url: String,
    pub access_token: String,
    pub user_id: Option<String>,
    pub crypto_store_type: CryptoStoreType,
}

/// Paths the runtime materialises for a session.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RuntimePaths {
    pub directory: PathBuf,
    pub crypto_path: PathBuf,
    pub sync_file: PathBuf,
}

/// Creates the session directory (`0700`), the crypto store and the sync file
/// path the service hands to `SimpleFsStorageProvider`, and applies the
/// service's `LogService.setLevel(LogLevel.ERROR)` bootstrap.
pub fn prepare_runtime(directory: &Path, session: &MatrixSession) -> io::Result<RuntimePaths> {
    // The TS provider creates the directory with plain `mkdirp` (umask-default
    // permissions), so no explicit chmod here.
    fs::create_dir_all(directory)?;
    let crypto_path = directory.to_path_buf();
    RustSdkCryptoStorageProvider::new(&crypto_path, session.crypto_store_type)?;
    let sync_file = crypto_path.join("sync.json");
    SimpleFsStorageProvider::new(&sync_file)?;
    LogService::set_level(Some(LogLevel::ERROR));
    Ok(RuntimePaths {
        directory: directory.to_path_buf(),
        crypto_path,
        sync_file,
    })
}

/// The runtime's client binding: what `new MatrixClient(...)` receives in the
/// TypeScript service (`homeserverUrl`, `accessToken`, storage, crypto store).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MatrixClient {
    pub homeserver_url: String,
    pub access_token: String,
    pub sync_file: PathBuf,
    pub crypto_path: PathBuf,
    pub crypto_store_type: CryptoStoreType,
}

impl MatrixClient {
    pub fn from_session(
        session: &MatrixSession,
        storage: &SimpleFsStorageProvider,
        crypto: &RustSdkCryptoStorageProvider,
    ) -> MatrixClient {
        MatrixClient {
            homeserver_url: session.homeserver_url.clone(),
            access_token: session.access_token.clone(),
            sync_file: storage.file_path().to_path_buf(),
            crypto_path: crypto.store_file(),
            crypto_store_type: crypto.store_type(),
        }
    }

    /// `userId` is derived from the access token subject by the SDK; the gateway
    /// keeps the value the sync response reported, so it is echoed here.
    pub fn user_id(&self, session: &MatrixSession) -> Option<String> {
        session.user_id.clone()
    }
}
