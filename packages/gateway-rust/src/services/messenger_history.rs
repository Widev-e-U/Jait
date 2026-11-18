//! Native port of `packages/gateway/src/services/messenger-history.ts`.
//!
//! The TypeScript service owns a Matrix Olm machine (real Megolm/curve25519
//! crypto behind `@matrix-org/matrix-sdk-crypto-wasm`) and downloads a room-key
//! backup through `matrix-bot-sdk`. Everything the module itself decides is
//! ported here: recovery-key decoding, Matrix-id validation, backup scoping and
//! request order, the 50 000-session ceiling, per-session merge semantics,
//! close/double-close behaviour and recovery-key zeroization.
//!
//! The two external capabilities stay behind explicit ports because the Rust
//! gateway has no Megolm implementation and must not grow a second HTTP stack
//! per service:
//!
//! * [`BackupCrypto`] performs `BackupDecryptionKey` derivation and V1 session
//!   decryption. No Rust dependency provides it, so the host supplies it (or
//!   keeps the existing TypeScript service for the cryptographic step until a
//!   reviewed native crypto crate is adopted).
//! * [`HistoryMachine`] is the Olm machine handle: import/export of room keys
//!   and single-event decryption with a fixed untrusted trust requirement.
//! * [`BackupClient`] is the authenticated `GET` transport. The bundled
//!   [`MatrixBackupHttpClient`] is a real `reqwest` implementation with an
//!   owned response ceiling; it is exercised against a loopback listener in the
//!   contract test.
//!
//! Deliberate behavioural differences from the TypeScript service are marked
//! `PARITY:` and are limited to the two cases the SDK shape makes unavoidable:
//! typed errors instead of wasm exceptions, and closing the machine when key
//! import fails inside `create` (TypeScript leaks that handle).

use crate::contracts::bounded_json::JsonGraph;
use serde_json::{Map, Value};
use std::fmt;
use std::future::Future;
use std::pin::Pin;
use std::time::Duration;

pub const BACKUP_ALGORITHM: &str = "m.megolm_backup.v1.curve25519-aes-sha2";
pub const SESSION_LIMIT: usize = 50_000;
pub const VERSION_PATH: &str = "/_matrix/client/v3/room_keys/version";
pub const KEYS_PATH: &str = "/_matrix/client/v3/room_keys/keys";
pub const INVALID_RECOVERY_KEY: &str = "Invalid recovery key.";
pub const BACKUP_MISMATCH: &str = "Recovery key does not match this backup.";
pub const RECOVERY_LIMIT_EXCEEDED: &str = "Backup exceeds the recovery limit.";
pub const CLOSED_MACHINE: &str = "null pointer passed to rust";
pub const CANCELLED: &str = "history recovery cancelled";
pub const SIGIL_MESSAGE: &str = "leading sigil is incorrect or missing";
pub const COLON_MESSAGE: &str = "required colon is missing";
pub const SERVER_MESSAGE: &str = "server name is not a valid IP address or domain name";
pub const MAX_RECOVERY_KEY_UNITS: usize = 100;

const RECOVERY_ALPHABET: &[u8] = b"123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const RECOVERY_BYTES: usize = 35;
const RECOVERY_PREFIX: [u8; 2] = [0x8b, 1];

pub type MachineFuture<'a, T> = Pin<Box<dyn Future<Output = Result<T, HistoryError>> + Send + 'a>>;
pub type CryptoFuture<'a, T> = Pin<Box<dyn Future<Output = Result<T, String>> + Send + 'a>>;
pub type ClientFuture<'a, T> = Pin<Box<dyn Future<Output = Result<T, String>> + Send + 'a>>;

/// Typed replacement for the exceptions the TypeScript service throws.
///
/// [`HistoryError::class`] is a stable differential label: it lets a contract
/// test compare native and TypeScript outcomes without depending on provider or
/// wasm wording.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum HistoryError {
    InvalidRecoveryKey,
    BackupMismatch,
    RecoveryLimit,
    /// `UserId`/`RoomId` parse failure, message taken from the wasm boundary.
    InvalidMatrixId(&'static str),
    /// Backup `GET` failed: transport failure or Matrix `errcode`/`error` reply.
    BackupRequest(String),
    /// Recovery-key material could not be turned into a backup key.
    BackupCrypto(String),
    /// The downloaded payload has a shape the TypeScript service rejects with a
    /// `TypeError` before reaching wasm.
    MalformedBackup(String),
    /// Session decryption failed inside the SDK (`MegolmDecryptionError`).
    UndecodableSession(String),
    /// `JSON.parse` of a decrypted session or decrypted event failed.
    UnreadablePayload(String),
    /// Event decryption failed; TypeScript's `MegolmDecryptionError` has no
    /// message, so [`HistoryError::message`] is empty for this variant.
    DecryptFailed,
    Closed,
    Cancelled,
}

impl HistoryError {
    pub fn class(&self) -> &'static str {
        match self {
            Self::InvalidRecoveryKey => "invalid-recovery-key",
            Self::BackupMismatch => "backup-mismatch",
            Self::RecoveryLimit => "recovery-limit",
            Self::InvalidMatrixId(_) => "matrix-id",
            Self::BackupRequest(_) => "backup-request",
            Self::BackupCrypto(_) => "backup-crypto",
            Self::MalformedBackup(_) => "malformed-backup",
            Self::UndecodableSession(_) => "undecodable-session",
            Self::UnreadablePayload(_) => "unreadable-payload",
            Self::DecryptFailed => "decrypt-failed",
            Self::Closed => "closed",
            Self::Cancelled => "cancelled",
        }
    }

    pub fn message(&self) -> &str {
        match self {
            Self::InvalidRecoveryKey => INVALID_RECOVERY_KEY,
            Self::BackupMismatch => BACKUP_MISMATCH,
            Self::RecoveryLimit => RECOVERY_LIMIT_EXCEEDED,
            Self::InvalidMatrixId(message) => message,
            Self::BackupRequest(message)
            | Self::BackupCrypto(message)
            | Self::MalformedBackup(message)
            | Self::UndecodableSession(message)
            | Self::UnreadablePayload(message) => message,
            Self::DecryptFailed => "",
            Self::Closed => CLOSED_MACHINE,
            Self::Cancelled => CANCELLED,
        }
    }
}

impl fmt::Display for HistoryError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.message())
    }
}

impl std::error::Error for HistoryError {}

/// A decoded 35-byte backup recovery key: `0x8b`, version `1`, 32 key bytes and
/// a trailing XOR checksum byte.
///
/// The key material is zeroized by [`RecoveryKey::wipe`] and by `Drop`, so the
/// `finally { key.fill(0) }` guarantee of the TypeScript service also holds on
/// every early-return path.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RecoveryKey {
    bytes: [u8; 32],
    wiped: bool,
}

impl RecoveryKey {
    /// Decodes the base58check-style string accepted by the TypeScript module.
    ///
    /// Rejects, in order: empty or over-long input (JS `String.length`, i.e.
    /// UTF-16 units, must stay at or below 100), any character outside the
    /// Bitcoin base58 alphabet, a big-integer that cannot fit the fixed
    /// accumulator, and any payload that is not exactly 35 bytes with the
    /// `0x8b 0x01` prefix and a matching XOR checksum.
    pub fn decode(input: &str) -> Result<Self, HistoryError> {
        let value: String = input.chars().filter(|ch| !js_whitespace(*ch)).collect();
        if value.is_empty() || value.encode_utf16().count() > MAX_RECOVERY_KEY_UNITS {
            return Err(HistoryError::InvalidRecoveryKey);
        }
        // 100 base58 digits need at most 74 bytes; 128 leaves headroom so the
        // accumulator can never wrap before the length check rejects the value.
        let mut accumulator = [0_u8; 128];
        for ch in value.chars() {
            let Some(digit) = RECOVERY_ALPHABET
                .iter()
                .position(|candidate| *candidate as char == ch)
            else {
                accumulator.fill(0);
                return Err(HistoryError::InvalidRecoveryKey);
            };
            let mut carry = digit as u32;
            for slot in accumulator.iter_mut().rev() {
                let total = (*slot as u32) * 58 + carry;
                *slot = (total & 0xff) as u8;
                carry = total >> 8;
            }
            if carry != 0 {
                accumulator.fill(0);
                return Err(HistoryError::InvalidRecoveryKey);
            }
        }
        let start = accumulator
            .iter()
            .position(|byte| *byte != 0)
            .unwrap_or(accumulator.len());
        let mut data = accumulator[start..].to_vec();
        accumulator.fill(0);
        // `decodeRecoveryKey` unshifts one zero byte for every leading `1`.
        for ch in value.chars() {
            if ch != '1' {
                break;
            }
            data.insert(0, 0);
        }
        let valid = data.len() == RECOVERY_BYTES
            && data[0] == RECOVERY_PREFIX[0]
            && data[1] == RECOVERY_PREFIX[1]
            && data.iter().fold(0_u8, |acc, byte| acc ^ byte) == 0;
        if !valid {
            data.fill(0);
            return Err(HistoryError::InvalidRecoveryKey);
        }
        let mut bytes = [0_u8; 32];
        bytes.copy_from_slice(&data[2..RECOVERY_BYTES - 1]);
        data.fill(0);
        Ok(Self {
            bytes,
            wiped: false,
        })
    }

    pub fn bytes(&self) -> &[u8; 32] {
        &self.bytes
    }

    pub fn is_wiped(&self) -> bool {
        self.wiped
    }

    /// Overwrites the key bytes. Idempotent; reads after a wipe see zeros.
    pub fn wipe(&mut self) {
        self.bytes.fill(0);
        self.wiped = true;
    }
}

impl Drop for RecoveryKey {
    fn drop(&mut self) {
        self.wipe();
    }
}

/// Validates the `UserId` grammar the TypeScript service accepts.
///
/// The sigil, colon and server-name rules match `ruma`'s `UserId` parser as
/// observed through the wasm boundary (see the lane review for the exact
/// accepted/rejected matrix). The local part is intentionally unchecked, as in
/// `ruma`, and a device id has no grammar at all.
pub fn validate_user_id(value: &str) -> Result<(), HistoryError> {
    let Some(rest) = value.strip_prefix('@') else {
        return Err(HistoryError::InvalidMatrixId(SIGIL_MESSAGE));
    };
    let Some((_, server)) = rest.split_once(':') else {
        return Err(HistoryError::InvalidMatrixId(COLON_MESSAGE));
    };
    if !valid_server_name(server) {
        return Err(HistoryError::InvalidMatrixId(SERVER_MESSAGE));
    }
    Ok(())
}

/// Validates the `RoomId` grammar: only the `!` sigil is enforced.
pub fn validate_room_id(value: &str) -> Result<(), HistoryError> {
    if value.starts_with('!') {
        Ok(())
    } else {
        Err(HistoryError::InvalidMatrixId(SIGIL_MESSAGE))
    }
}

fn valid_server_name(text: &str) -> bool {
    if text.is_empty() {
        return false;
    }
    if let Some(rest) = text.strip_prefix('[') {
        let Some((inside, after)) = rest.split_once(']') else {
            return false;
        };
        let literal = !inside.is_empty()
            && inside
                .bytes()
                .all(|byte| byte.is_ascii_hexdigit() || byte == b':' || byte == b'.');
        return literal && (after.is_empty() || after.strip_prefix(':').is_some_and(valid_port));
    }
    let (host, port) = match text.split_once(':') {
        Some((host, port)) => (host, Some(port)),
        None => (text, None),
    };
    if let Some(port) = port
        && !valid_port(port)
    {
        return false;
    }
    !host.is_empty()
        && host
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'-' | b'_'))
}

fn valid_port(text: &str) -> bool {
    !text.is_empty()
        && text.len() <= 5
        && text.bytes().all(|byte| byte.is_ascii_digit())
        && text.parse::<u16>().is_ok()
}

/// One encrypted Megolm session as read out of the backup payload.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct EncryptedSession {
    pub ephemeral: String,
    pub mac: String,
    pub ciphertext: String,
}

/// `BackupDecryptionKey` derivation and V1 session decryption.
pub trait BackupCrypto: Send + Sync {
    /// Public key for the recovered key material, base64 encoded. Must match
    /// `auth_data.public_key` of the backup version or the restore is refused
    /// before the keys are downloaded.
    fn public_key(&self, key: &RecoveryKey) -> Result<String, String>;
    /// Decrypts one session blob into the clear-session JSON document.
    fn decrypt_session<'a>(
        &'a self,
        key: &'a RecoveryKey,
        session: &'a EncryptedSession,
    ) -> CryptoFuture<'a, String>;
}

/// Trust requirement passed to `decryptRoomEvent`. The TypeScript service always
/// uses `Untrusted`; the enum makes that choice explicit and greppable.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TrustRequirement {
    Untrusted,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DecryptRequest {
    pub event: String,
    pub room_id: String,
    pub trust: TrustRequirement,
}

/// The Olm machine handle owned by one history service.
pub trait HistoryMachine: Send {
    fn import_room_keys<'a>(&'a mut self, exported: &'a str) -> MachineFuture<'a, ()>;
    fn export_room_keys<'a>(&'a mut self) -> MachineFuture<'a, String>;
    fn decrypt_room_event<'a>(&'a mut self, request: DecryptRequest) -> MachineFuture<'a, String>;
    /// Releases the handle. Calling it twice must fail, mirroring the wasm
    /// "null pointer passed to rust" throw; the service enforces that state
    /// itself so a port cannot silently succeed twice.
    fn close(&mut self) -> Result<(), HistoryError>;
}

/// Creates the machine for a validated user/device pair.
pub trait HistoryMachines: Send + Sync {
    fn initialize<'a>(
        &'a self,
        user_id: &'a str,
        device_id: &'a str,
    ) -> MachineFuture<'a, Box<dyn HistoryMachine>>;
}

/// One authenticated backup `GET`. The query value is already serialized with
/// JavaScript `String()` semantics, matching what `matrix-bot-sdk` puts on the
/// wire (`?version=1`, and an empty value for a non-scalar version).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct BackupRequest {
    pub path: &'static str,
    pub query: Vec<(String, String)>,
}

impl BackupRequest {
    pub fn new(path: &'static str) -> Self {
        Self {
            path,
            query: Vec::new(),
        }
    }

    pub fn query(mut self, key: &str, value: impl Into<String>) -> Self {
        self.query.push((key.to_owned(), value.into()));
        self
    }

    /// Wire form of the request, used both for the URL and for audit entries so
    /// native request order can be compared with the TypeScript server log.
    pub fn target(&self) -> String {
        let mut target = self.path.to_owned();
        if !self.query.is_empty() {
            target.push('?');
            for (index, (key, value)) in self.query.iter().enumerate() {
                if index > 0 {
                    target.push('&');
                }
                target.push_str(&encode_query(key));
                target.push('=');
                target.push_str(&encode_query(value));
            }
        }
        target
    }
}

/// Authenticated Matrix backup transport.
pub trait BackupClient: Send + Sync {
    fn get<'a>(&'a self, request: BackupRequest) -> ClientFuture<'a, Value>;
}

/// Cooperative cancellation, checked between observable steps and per session.
pub trait Cancellation: Send + Sync {
    fn is_cancelled(&self) -> bool;
}

pub struct NoCancellation;

impl Cancellation for NoCancellation {
    fn is_cancelled(&self) -> bool {
        false
    }
}

fn checkpoint(cancel: &dyn Cancellation) -> Result<(), HistoryError> {
    if cancel.is_cancelled() {
        Err(HistoryError::Cancelled)
    } else {
        Ok(())
    }
}

/// Observable summary of one restore attempt, populated even on failure.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct RestoreAudit {
    /// Request targets attempted, in order.
    pub requests: Vec<String>,
    /// Sessions decrypted successfully before the attempt stopped.
    pub sessions_read: usize,
    /// Sessions handed to `import_room_keys`.
    pub sessions_imported: usize,
    /// Whether the decoded recovery key was wiped when the attempt finished.
    pub key_wiped: bool,
    /// Whether the download, import and re-export all completed.
    pub completed: bool,
}

/// Native counterpart of the exported `MessengerHistory` class.
pub struct MessengerHistory {
    machine: Option<Box<dyn HistoryMachine>>,
    closed: bool,
    audit: RestoreAudit,
}

impl MessengerHistory {
    /// Validates the user id, creates the machine, and imports previously
    /// exported sessions when the argument is non-empty.
    ///
    /// PARITY: when `import_room_keys` fails the machine is closed before the
    /// error is returned. The TypeScript `create` has no `finally` and leaks the
    /// Olm machine handle in that case.
    pub async fn create(
        machines: &dyn HistoryMachines,
        user_id: &str,
        device_id: &str,
        exported: Option<&str>,
    ) -> Result<Self, HistoryError> {
        validate_user_id(user_id)?;
        let mut machine = machines.initialize(user_id, device_id).await?;
        if let Some(payload) = exported.filter(|value| !value.is_empty())
            && let Err(error) = machine.import_room_keys(payload).await
        {
            let _ = machine.close();
            return Err(error);
        }
        Ok(Self {
            machine: Some(machine),
            closed: false,
            audit: RestoreAudit::default(),
        })
    }

    /// Downloads the backup, decrypts every session and returns the re-exported
    /// key document as a JSON *string*, exactly like the TypeScript service.
    ///
    /// Invalid recovery keys are rejected before any request is made, a version
    /// mismatch stops after the version request, and the 50 000-session ceiling
    /// is checked before each session is decrypted. The decoded key is wiped on
    /// every exit path.
    pub async fn restore(
        &mut self,
        client: &dyn BackupClient,
        crypto: &dyn BackupCrypto,
        recovery_key: &str,
        cancel: &dyn Cancellation,
    ) -> Result<String, HistoryError> {
        let mut key = RecoveryKey::decode(recovery_key)?;
        self.audit = RestoreAudit::default();
        let outcome = self.restore_decoded(client, crypto, &key, cancel).await;
        key.wipe();
        self.audit.key_wiped = key.is_wiped();
        outcome
    }

    async fn restore_decoded(
        &mut self,
        client: &dyn BackupClient,
        crypto: &dyn BackupCrypto,
        key: &RecoveryKey,
        cancel: &dyn Cancellation,
    ) -> Result<String, HistoryError> {
        let public_key = crypto.public_key(key).map_err(HistoryError::BackupCrypto)?;
        checkpoint(cancel)?;
        let version = self
            .request(client, BackupRequest::new(VERSION_PATH))
            .await?;
        let version_value = version.get("version").filter(|value| js_truthy(value));
        let algorithm_ok =
            version.get("algorithm").and_then(Value::as_str) == Some(BACKUP_ALGORITHM);
        let public_key_ok = version
            .get("auth_data")
            .and_then(|auth_data| auth_data.get("public_key"))
            .and_then(Value::as_str)
            == Some(public_key.as_str());
        let Some(version_value) = version_value else {
            return Err(HistoryError::BackupMismatch);
        };
        if !algorithm_ok || !public_key_ok {
            return Err(HistoryError::BackupMismatch);
        }
        checkpoint(cancel)?;
        let scoped = self
            .request(
                client,
                BackupRequest::new(KEYS_PATH).query("version", js_query_string(version_value)),
            )
            .await?;
        if scoped.is_null() {
            return Err(HistoryError::MalformedBackup(
                "null is not an object (evaluating 'response.rooms')".into(),
            ));
        }
        let rooms = scoped.get("rooms").cloned().unwrap_or(Value::Null);
        let mut recovered: Vec<Value> = Vec::new();
        for (room_id, room) in js_entries(&rooms) {
            if room.value().is_null() {
                return Err(HistoryError::MalformedBackup(
                    "null is not an object (evaluating 'room.sessions')".into(),
                ));
            }
            let sessions = match room.value().get("sessions") {
                Some(sessions) if !sessions.is_null() => sessions.clone(),
                _ => Value::Null,
            };
            for (session_id, session) in js_entries(&sessions) {
                if recovered.len() >= SESSION_LIMIT {
                    return Err(HistoryError::RecoveryLimit);
                }
                checkpoint(cancel)?;
                if session.value().is_null() {
                    return Err(HistoryError::MalformedBackup(
                        "null is not an object (evaluating 'session.session_data')".into(),
                    ));
                }
                let Some(session_data) = session.value().get("session_data") else {
                    return Err(HistoryError::MalformedBackup(
                        "undefined is not an object (evaluating 'encrypted.ephemeral')".into(),
                    ));
                };
                if session_data.is_null() {
                    return Err(HistoryError::MalformedBackup(
                        "null is not an object (evaluating 'encrypted.ephemeral')".into(),
                    ));
                }
                let encrypted = EncryptedSession {
                    ephemeral: string_argument(session_data, "ephemeral")?,
                    mac: string_argument(session_data, "mac")?,
                    ciphertext: string_argument(session_data, "ciphertext")?,
                };
                let clear = crypto
                    .decrypt_session(key, &encrypted)
                    .await
                    .map_err(HistoryError::UndecodableSession)?;
                let clear: Value = serde_json::from_str(&clear).map_err(|error| {
                    HistoryError::UnreadablePayload(format!("JSON Parse error: {error}"))
                })?;
                self.audit.sessions_read += 1;
                recovered.push(merge_session(&clear, &room_id, &session_id));
            }
        }
        self.audit.sessions_imported = recovered.len();
        let payload = JsonGraph::from_value(&Value::Array(recovered))
            .stringify()
            .ok_or_else(|| {
                HistoryError::MalformedBackup("session payload is not JSON-serializable".into())
            })?;
        checkpoint(cancel)?;
        let exported = {
            let machine = self.machine_mut()?;
            machine.import_room_keys(&payload).await?;
            machine.export_room_keys().await?
        };
        self.audit.completed = true;
        Ok(exported)
    }

    /// Decrypts one historical event with `TrustRequirement::Untrusted`.
    ///
    /// A closed service still validates the room id first, then fails at the
    /// machine boundary, matching the TypeScript statement order.
    pub async fn decrypt(&mut self, room_id: &str, event: &Value) -> Result<Value, HistoryError> {
        validate_room_id(room_id)?;
        let request = DecryptRequest {
            event: JsonGraph::from_value(event)
                .stringify()
                .unwrap_or_else(|| "null".to_owned()),
            room_id: room_id.to_owned(),
            trust: TrustRequirement::Untrusted,
        };
        let decrypted = self.machine_mut()?.decrypt_room_event(request).await?;
        serde_json::from_str(&decrypted)
            .map_err(|error| HistoryError::UnreadablePayload(format!("JSON parse: {error}")))
    }

    /// Releases the machine. A second close fails with [`HistoryError::Closed`],
    /// like the wasm null-pointer throw, and leaves the service closed.
    pub fn close(&mut self) -> Result<(), HistoryError> {
        if self.closed {
            return Err(HistoryError::Closed);
        }
        let Some(mut machine) = self.machine.take() else {
            return Err(HistoryError::Closed);
        };
        self.closed = true;
        machine.close()
    }

    pub fn audit(&self) -> &RestoreAudit {
        &self.audit
    }

    pub fn is_closed(&self) -> bool {
        self.closed
    }

    async fn request(
        &mut self,
        client: &dyn BackupClient,
        request: BackupRequest,
    ) -> Result<Value, HistoryError> {
        self.audit.requests.push(request.target());
        client
            .get(request)
            .await
            .map_err(HistoryError::BackupRequest)
    }

    fn machine_mut(&mut self) -> Result<&mut Box<dyn HistoryMachine>, HistoryError> {
        if self.closed {
            return Err(HistoryError::Closed);
        }
        self.machine.as_mut().ok_or(HistoryError::Closed)
    }
}

/// Real `reqwest` transport for the Matrix backup endpoints.
pub struct MatrixBackupHttpClient {
    client: reqwest::Client,
    base_url: String,
    access_token: String,
    max_response_bytes: usize,
    timeout: Duration,
}

impl MatrixBackupHttpClient {
    pub fn new(
        base_url: &str,
        access_token: &str,
        max_response_bytes: usize,
        timeout: Duration,
    ) -> Result<Self, reqwest::Error> {
        Ok(Self {
            client: reqwest::Client::builder()
                .redirect(reqwest::redirect::Policy::none())
                .build()?,
            base_url: base_url.trim_end_matches('/').to_owned(),
            access_token: access_token.to_owned(),
            max_response_bytes,
            timeout,
        })
    }
}

impl BackupClient for MatrixBackupHttpClient {
    fn get<'a>(&'a self, request: BackupRequest) -> ClientFuture<'a, Value> {
        Box::pin(async move {
            let response = self
                .client
                .get(format!("{}{}", self.base_url, request.target()))
                .bearer_auth(&self.access_token)
                .timeout(self.timeout)
                .send()
                .await
                .map_err(|error| error.to_string())?;
            let status = response.status();
            let bytes = response.bytes().await.map_err(|error| error.to_string())?;
            if bytes.len() > self.max_response_bytes {
                return Err("matrix backup response exceeds the size ceiling".into());
            }
            let value: Value = serde_json::from_slice(&bytes)
                .map_err(|error| format!("matrix backup response is not JSON: {error}"))?;
            if !status.is_success() {
                return Err(
                    match (
                        value.get("errcode").and_then(Value::as_str),
                        value.get("error").and_then(Value::as_str),
                    ) {
                        (Some(errcode), Some(message)) => format!("{errcode}: {message}"),
                        // PARITY: a non-JSON error body yields an SDK
                        // `IncomingMessage` whose text is `[object Object]`;
                        // the native transport reports the status instead.
                        _ => format!("HTTP {}", status.as_u16()),
                    },
                );
            }
            Ok(value)
        })
    }
}

fn encode_query(value: &str) -> String {
    let mut encoded = String::with_capacity(value.len());
    for byte in value.bytes() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b'~') {
            encoded.push(byte as char);
        } else {
            encoded.push_str(&format!("%{byte:02X}"));
        }
    }
    encoded
}

fn js_whitespace(ch: char) -> bool {
    matches!(
        ch,
        '\u{0009}'..='\u{000d}'
            | '\u{0020}'
            | '\u{00a0}'
            | '\u{1680}'
            | '\u{2000}'..='\u{200a}'
            | '\u{2028}'
            | '\u{2029}'
            | '\u{202f}'
            | '\u{205f}'
            | '\u{3000}'
            | '\u{feff}'
    )
}

fn js_truthy(value: &Value) -> bool {
    match value {
        Value::Null => false,
        Value::Bool(value) => *value,
        Value::Number(number) => number.as_f64().is_some_and(|value| value != 0.0),
        Value::String(value) => !value.is_empty(),
        Value::Array(_) | Value::Object(_) => true,
    }
}

/// JavaScript `String(value)` for the `version` query parameter.
///
/// Non-scalars produce an empty value, which is what `matrix-bot-sdk` put on the
/// wire for an object version (`?version=`). Floats fall back to `serde_json`'s
/// shortest round-trip form; integral values never take that path.
fn js_query_string(value: &Value) -> String {
    match value {
        Value::String(value) => value.clone(),
        Value::Number(number) => {
            if let Some(value) = number.as_u64() {
                value.to_string()
            } else if let Some(value) = number.as_i64() {
                value.to_string()
            } else {
                serde_json::to_string(&number.as_f64().unwrap_or_default())
                    .unwrap_or_else(|_| "0".to_owned())
            }
        }
        Value::Bool(value) => value.to_string(),
        _ => String::new(),
    }
}

enum EntryValue<'a> {
    Ref(&'a Value),
    Owned(Value),
}

impl EntryValue<'_> {
    fn value(&self) -> &Value {
        match self {
            Self::Ref(value) => value,
            Self::Owned(value) => value,
        }
    }
}

fn array_index(key: &str) -> Option<u32> {
    key.parse::<u32>()
        .ok()
        .filter(|index| *index != u32::MAX && index.to_string() == key)
}

/// `Object.entries` semantics, including integer-key ordering and the
/// index-keyed views JavaScript builds for arrays and strings.
fn js_entries(value: &Value) -> Vec<(String, EntryValue<'_>)> {
    match value {
        Value::Object(map) => {
            let mut entries: Vec<(String, EntryValue<'_>)> = map
                .iter()
                .map(|(key, value)| (key.clone(), EntryValue::Ref(value)))
                .collect();
            entries.sort_by(|(left, _), (right, _)| {
                match (array_index(left), array_index(right)) {
                    (Some(left), Some(right)) => left.cmp(&right),
                    (Some(_), None) => std::cmp::Ordering::Less,
                    (None, Some(_)) => std::cmp::Ordering::Greater,
                    (None, None) => std::cmp::Ordering::Equal,
                }
            });
            entries
        }
        Value::Array(values) => values
            .iter()
            .enumerate()
            .map(|(index, value)| (index.to_string(), EntryValue::Ref(value)))
            .collect(),
        Value::String(text) => text
            .encode_utf16()
            .map(|unit| {
                let value = String::from_utf16(&[unit])
                    .map(Value::String)
                    .unwrap_or_else(|_| Value::String("\u{fffd}".into()));
                (String::new(), EntryValue::Owned(value))
            })
            .enumerate()
            .map(|(index, (_, value))| (index.to_string(), value))
            .collect(),
        _ => Vec::new(),
    }
}

/// JavaScript object spread followed by the two overrides.
///
/// `{...clear, room_id, session_id}` keeps an existing property position, so the
/// clear session's own field order survives; `serde_json`'s `preserve_order` map
/// has the same insert-or-keep-position behaviour.
fn merge_session(clear: &Value, room_id: &str, session_id: &str) -> Value {
    let mut merged = Map::new();
    for (key, value) in js_entries(clear) {
        merged.insert(key, value.value().clone());
    }
    merged.insert("room_id".into(), Value::String(room_id.to_owned()));
    merged.insert("session_id".into(), Value::String(session_id.to_owned()));
    Value::Object(merged)
}

fn js_type_name(value: &Value) -> &'static str {
    match value {
        Value::Null => "Null",
        Value::Bool(_) => "Boolean",
        Value::Number(_) => "Number",
        Value::String(_) => "String",
        Value::Array(_) => "Array",
        Value::Object(_) => "Object",
    }
}

/// wasm-bindgen's string-argument check for `ephemeral`, `mac` and `ciphertext`.
fn string_argument(session_data: &Value, name: &str) -> Result<String, HistoryError> {
    match session_data.get(name) {
        Some(Value::String(value)) => Ok(value.clone()),
        Some(other) => Err(HistoryError::MalformedBackup(format!(
            "Expect value to be String, but received {}",
            js_type_name(other)
        ))),
        None => Err(HistoryError::MalformedBackup(
            "Expect value to be String, but received Undefined".into(),
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{Map, Value, json};
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::{Arc, Mutex, MutexGuard};

    /// Payload `0x8b 0x01 || 0x00..=0x1f || 0x8a` (35 bytes) in base58.
    const VALID_KEY: &str = "EsSzykH7LCZx7CaecmKDwcmYJRXiYbtu8iQ3t8EznRwKpUY1";
    /// Same payload with a corrupted trailing checksum byte (`0xae`).
    const BAD_CHECKSUM_KEY: &str = "EsSzykH7LCZx7CaecmKDwcmYJRXiYbtu8iQ3t8EznRwKpUYd";
    /// Same payload with prefix byte `0x8c` instead of `0x8b`.
    const BAD_PREFIX_KEY: &str = "EyEfEjpWiVSgGFz7XJCFKX2xwug1bnXRKexBVotJFHXp6oGx";
    /// Valid checksum and prefix but 36 payload bytes.
    const WRONG_LENGTH_KEY: &str = "24DfkuU26wk4SEN7X2rbS84sb9uGaNV2573ijiexn3X4n4YMNH";

    fn key_material() -> Vec<u8> {
        (0..32).collect()
    }

    fn lock<T>(cell: &Mutex<T>) -> MutexGuard<'_, T> {
        cell.lock().expect("history test double lock")
    }

    #[derive(Default)]
    struct MachineLog {
        imported: Mutex<Vec<String>>,
        decrypted: Mutex<Vec<DecryptRequest>>,
        closes: AtomicUsize,
    }

    struct FakeMachine {
        log: Arc<MachineLog>,
        import_error: Option<HistoryError>,
        export: String,
        decrypt_reply: Result<String, HistoryError>,
        close_error: Option<HistoryError>,
    }

    impl FakeMachine {
        fn new() -> Self {
            Self {
                log: Arc::new(MachineLog::default()),
                import_error: None,
                export: "EXPORTED".into(),
                decrypt_reply: Ok(r#"{"type":"m.room.message"}"#.into()),
                close_error: None,
            }
        }
    }

    impl HistoryMachine for FakeMachine {
        fn import_room_keys<'a>(&'a mut self, exported: &'a str) -> MachineFuture<'a, ()> {
            let log = self.log.clone();
            let error = self.import_error.clone();
            let payload = exported.to_owned();
            Box::pin(async move {
                lock(&log.imported).push(payload);
                match error {
                    Some(error) => Err(error),
                    None => Ok(()),
                }
            })
        }

        fn export_room_keys<'a>(&'a mut self) -> MachineFuture<'a, String> {
            let exported = self.export.clone();
            Box::pin(async move { Ok(exported) })
        }

        fn decrypt_room_event<'a>(
            &'a mut self,
            request: DecryptRequest,
        ) -> MachineFuture<'a, String> {
            let log = self.log.clone();
            let reply = self.decrypt_reply.clone();
            Box::pin(async move {
                lock(&log.decrypted).push(request);
                reply
            })
        }

        fn close(&mut self) -> Result<(), HistoryError> {
            self.log.closes.fetch_add(1, Ordering::SeqCst);
            match &self.close_error {
                Some(error) => Err(error.clone()),
                None => Ok(()),
            }
        }
    }

    struct FakeMachines {
        ids: Mutex<Vec<(String, String)>>,
        initializations: AtomicUsize,
        machine: Mutex<Option<FakeMachine>>,
        error: Option<HistoryError>,
    }

    fn fake_machines(machine: FakeMachine) -> (Arc<MachineLog>, FakeMachines) {
        let log = machine.log.clone();
        (
            log,
            FakeMachines {
                ids: Mutex::new(Vec::new()),
                initializations: AtomicUsize::new(0),
                machine: Mutex::new(Some(machine)),
                error: None,
            },
        )
    }

    impl HistoryMachines for FakeMachines {
        fn initialize<'a>(
            &'a self,
            user_id: &'a str,
            device_id: &'a str,
        ) -> MachineFuture<'a, Box<dyn HistoryMachine>> {
            self.initializations.fetch_add(1, Ordering::SeqCst);
            lock(&self.ids).push((user_id.to_owned(), device_id.to_owned()));
            let machine = lock(&self.machine).take();
            let error = self.error.clone();
            Box::pin(async move {
                // An injected failure wins, so a test can model `initialize`
                // rejecting without draining the queued machine first.
                match (error, machine) {
                    (Some(error), _) => Err(error),
                    (None, Some(machine)) => Ok(Box::new(machine) as Box<dyn HistoryMachine>),
                    (None, None) => Err(HistoryError::Closed),
                }
            })
        }
    }

    struct FakeClient {
        responses: Mutex<Vec<Result<Value, String>>>,
        requests: Mutex<Vec<BackupRequest>>,
    }

    impl FakeClient {
        fn new(responses: Vec<Result<Value, String>>) -> Self {
            Self {
                responses: Mutex::new(responses),
                requests: Mutex::new(Vec::new()),
            }
        }

        fn targets(&self) -> Vec<String> {
            lock(&self.requests)
                .iter()
                .map(BackupRequest::target)
                .collect()
        }
    }

    impl BackupClient for FakeClient {
        fn get<'a>(&'a self, request: BackupRequest) -> ClientFuture<'a, Value> {
            let target = request.target();
            lock(&self.requests).push(request);
            let mut responses = lock(&self.responses);
            let response = if responses.is_empty() {
                Err(format!("unexpected backup request {target}"))
            } else {
                responses.remove(0)
            };
            drop(responses);
            Box::pin(async move { response })
        }
    }

    #[derive(Default)]
    struct FakeCrypto {
        public_key: String,
        clears: Mutex<Vec<Result<String, String>>>,
        /// Used once `clears` is exhausted, so bulk tests stay cheap.
        fallback: Option<String>,
        sessions: Mutex<Vec<EncryptedSession>>,
        key_states: Mutex<Vec<(Vec<u8>, bool)>>,
    }

    impl BackupCrypto for FakeCrypto {
        fn public_key(&self, _key: &RecoveryKey) -> Result<String, String> {
            Ok(self.public_key.clone())
        }

        fn decrypt_session<'a>(
            &'a self,
            key: &'a RecoveryKey,
            session: &'a EncryptedSession,
        ) -> CryptoFuture<'a, String> {
            lock(&self.key_states).push((key.bytes().to_vec(), key.is_wiped()));
            lock(&self.sessions).push(session.clone());
            let mut clears = lock(&self.clears);
            let reply = if clears.is_empty() {
                match &self.fallback {
                    Some(clear) => Ok(clear.clone()),
                    None => Err("crypto double has no scripted clear session".to_owned()),
                }
            } else {
                clears.remove(0)
            };
            drop(clears);
            Box::pin(async move { reply })
        }
    }

    struct NeverCancelled;

    impl Cancellation for NeverCancelled {
        fn is_cancelled(&self) -> bool {
            false
        }
    }

    struct CancelledAfter {
        checks: AtomicUsize,
        cancel_at: usize,
    }

    impl CancelledAfter {
        fn new(cancel_at: usize) -> Self {
            Self {
                checks: AtomicUsize::new(0),
                cancel_at,
            }
        }
    }

    impl Cancellation for CancelledAfter {
        fn is_cancelled(&self) -> bool {
            self.checks.fetch_add(1, Ordering::SeqCst) + 1 >= self.cancel_at
        }
    }

    fn version_response(public_key: &str, version: Value) -> Value {
        json!({
            "algorithm": BACKUP_ALGORITHM,
            "version": version,
            "auth_data": { "public_key": public_key },
        })
    }

    fn encrypted_session() -> Value {
        json!({
            "session_data": { "ephemeral": "EPHEMERAL", "mac": "MAC", "ciphertext": "CIPHERTEXT" },
        })
    }

    fn backup(rooms: Value) -> Value {
        json!({ "rooms": rooms })
    }

    #[test]
    fn history_error_classes_and_messages_match_the_differential_contract() {
        let cases = [
            (
                HistoryError::InvalidRecoveryKey,
                "invalid-recovery-key",
                INVALID_RECOVERY_KEY,
            ),
            (
                HistoryError::BackupMismatch,
                "backup-mismatch",
                BACKUP_MISMATCH,
            ),
            (
                HistoryError::RecoveryLimit,
                "recovery-limit",
                RECOVERY_LIMIT_EXCEEDED,
            ),
            (
                HistoryError::InvalidMatrixId(SIGIL_MESSAGE),
                "matrix-id",
                SIGIL_MESSAGE,
            ),
            (
                HistoryError::BackupRequest("boom".into()),
                "backup-request",
                "boom",
            ),
            (
                HistoryError::BackupCrypto("boom".into()),
                "backup-crypto",
                "boom",
            ),
            (
                HistoryError::MalformedBackup("boom".into()),
                "malformed-backup",
                "boom",
            ),
            (
                HistoryError::UndecodableSession("boom".into()),
                "undecodable-session",
                "boom",
            ),
            (
                HistoryError::UnreadablePayload("boom".into()),
                "unreadable-payload",
                "boom",
            ),
            (HistoryError::DecryptFailed, "decrypt-failed", ""),
            (HistoryError::Closed, "closed", CLOSED_MACHINE),
            (HistoryError::Cancelled, "cancelled", CANCELLED),
        ];
        for (error, class, message) in cases {
            assert_eq!(error.class(), class, "class of {error:?}");
            assert_eq!(error.message(), message, "message of {error:?}");
            assert_eq!(error.to_string(), message, "display of {error:?}");
        }
    }

    #[test]
    fn constants_match_the_typescript_service() {
        assert_eq!(BACKUP_ALGORITHM, "m.megolm_backup.v1.curve25519-aes-sha2");
        assert_eq!(VERSION_PATH, "/_matrix/client/v3/room_keys/version");
        assert_eq!(KEYS_PATH, "/_matrix/client/v3/room_keys/keys");
        assert_eq!(SESSION_LIMIT, 50_000);
        assert_eq!(MAX_RECOVERY_KEY_UNITS, 100);
    }

    #[test]
    fn recovery_key_decodes_the_documented_payload_shape() {
        let key = RecoveryKey::decode(VALID_KEY).expect("valid recovery key");
        assert_eq!(key.bytes().to_vec(), key_material());
        assert_eq!(key.bytes()[0], 0x00);
        assert_eq!(key.bytes()[31], 0x1f);
        assert!(!key.is_wiped());
    }

    #[test]
    fn recovery_key_strips_javascript_whitespace_anywhere_in_the_value() {
        let spaced = VALID_KEY
            .chars()
            .enumerate()
            .flat_map(|(index, ch)| {
                if index > 0 && index % 8 == 0 {
                    vec![' ', ch]
                } else {
                    vec![ch]
                }
            })
            .collect::<String>();
        let padded = format!("\u{feff}\t {spaced}\r\n\u{00a0}");
        let key = RecoveryKey::decode(&padded).expect("whitespace-padded key");
        assert_eq!(key.bytes()[0], 0x00);
        assert_eq!(key.bytes()[31], 0x1f);
    }

    #[test]
    fn recovery_key_ceiling_is_measured_after_stripping_javascript_whitespace() {
        // 48 units of key plus 60 ideographic spaces: 108 raw UTF-16 units, but
        // `decode` strips `\s` before the ceiling check, so it sees 48 and the
        // key is accepted.
        let padded = format!("{VALID_KEY}{}", "\u{3000}".repeat(60));
        assert_eq!(padded.encode_utf16().count(), 108);
        assert!(RecoveryKey::decode(&padded).is_ok());
        // Whitespace cannot smuggle a key past the ceiling: 101 surviving units
        // are rejected before the alphabet is even checked.
        let long = format!("{VALID_KEY}{}", "z".repeat(53));
        assert_eq!(long.encode_utf16().count(), 101);
        assert_eq!(
            RecoveryKey::decode(&long),
            Err(HistoryError::InvalidRecoveryKey)
        );
    }

    #[test]
    fn recovery_key_rejects_empty_long_and_non_base58_input() {
        let repeated = VALID_KEY.repeat(3);
        let rejected: [&str; 4] = ["", " ", "\u{3000}\u{feff}", repeated.as_str()];
        for value in rejected {
            assert_eq!(
                RecoveryKey::decode(value),
                Err(HistoryError::InvalidRecoveryKey),
                "{value:?}"
            );
        }
        // Every character outside the Bitcoin base58 alphabet is rejected, in
        // particular the digits/letters the alphabet intentionally skips.
        for replacement in ['0', 'O', 'I', 'l', '+', '/', '!'] {
            let mut value = VALID_KEY.to_owned();
            value.replace_range(0..1, &replacement.to_string());
            assert_eq!(
                RecoveryKey::decode(&value),
                Err(HistoryError::InvalidRecoveryKey),
                "{replacement}"
            );
        }
        assert_eq!(
            RecoveryKey::decode("0"),
            Err(HistoryError::InvalidRecoveryKey)
        );
    }

    #[test]
    fn recovery_key_rejects_a_corrupted_checksum_prefix_or_length() {
        for value in [BAD_CHECKSUM_KEY, BAD_PREFIX_KEY, WRONG_LENGTH_KEY] {
            assert_eq!(
                RecoveryKey::decode(value),
                Err(HistoryError::InvalidRecoveryKey),
                "{value}"
            );
        }
    }

    #[test]
    fn recovery_key_rejects_a_leading_one_because_it_shifts_the_payload() {
        // `decodeRecoveryKey` unshifts a zero byte per leading `1`, so the
        // payload becomes 36 bytes even though the big integer is unchanged.
        assert_eq!(
            RecoveryKey::decode(&format!("1{VALID_KEY}")),
            Err(HistoryError::InvalidRecoveryKey)
        );
    }

    #[test]
    fn recovery_key_wipe_zeroes_and_is_idempotent() {
        let mut key = RecoveryKey::decode(VALID_KEY).expect("valid recovery key");
        key.wipe();
        assert!(key.is_wiped());
        assert_eq!(key.bytes(), &[0_u8; 32]);
        key.wipe();
        assert!(key.is_wiped());
        assert_eq!(key.bytes(), &[0_u8; 32]);
    }

    #[test]
    fn user_id_grammar_matches_the_wasm_boundary() {
        let accepted = [
            "@alice:example.org",
            "@alice:example.org:8448",
            "@:example.org",
            "@a:b",
            "@a:example.org:0",
            "@a:example.org:65535",
            "@a:sub-domain.example.org",
            "@a:under_score.example",
            "@a:127.0.0.1",
            "@a:[::1]",
            "@a:[::1]:8448",
            "@a:[2001:db8::1]",
        ];
        for value in accepted {
            assert_eq!(validate_user_id(value), Ok(()), "{value}");
        }
        // Each failure mode is reported by the first rule that trips.
        for value in ["", "alice:example.org", "example.org"] {
            assert_eq!(
                validate_user_id(value),
                Err(HistoryError::InvalidMatrixId(SIGIL_MESSAGE)),
                "{value}"
            );
        }
        for value in ["@", "@alice"] {
            assert_eq!(
                validate_user_id(value),
                Err(HistoryError::InvalidMatrixId(COLON_MESSAGE)),
                "{value}"
            );
        }
        // Sigil and colon present: only the server-name grammar can reject.
        let rejected = [
            "@alice:",
            "@alice:example.org:",
            "@alice:example.org:65536",
            "@alice:example.org:99999",
            "@alice:example.org:123456",
            "@alice:example.org:-1",
            "@alice:exa mple.org",
            "@alice:[::1",
            "@alice:[]",
            "@alice:[::1]x",
            "@alice:[::1]:",
        ];
        for value in rejected {
            assert_eq!(
                validate_user_id(value),
                Err(HistoryError::InvalidMatrixId(SERVER_MESSAGE)),
                "{value}"
            );
        }
        let error = validate_user_id("@alice:").expect_err("empty server name");
        assert_eq!(error.class(), "matrix-id");
    }

    #[test]
    fn room_id_grammar_only_enforces_the_sigil() {
        for value in ["!abc:example.org", "!", "!x", "! ", "!a:b:c"] {
            assert_eq!(validate_room_id(value), Ok(()), "{value}");
        }
        for value in ["", "shared", "@alice:example.org", "abc"] {
            assert_eq!(
                validate_room_id(value),
                Err(HistoryError::InvalidMatrixId(SIGIL_MESSAGE)),
                "{value}"
            );
        }
    }

    #[test]
    fn backup_request_builds_wire_targets_with_javascript_escaping() {
        assert_eq!(BackupRequest::new(KEYS_PATH).target(), KEYS_PATH);
        assert_eq!(
            BackupRequest::new(KEYS_PATH).query("version", "1").target(),
            "/_matrix/client/v3/room_keys/keys?version=1"
        );
        assert_eq!(
            BackupRequest::new(KEYS_PATH)
                .query("a b", "c/d:e")
                .query("z", "é")
                .target(),
            "/_matrix/client/v3/room_keys/keys?a%20b=c%2Fd%3Ae&z=%C3%A9"
        );
        assert_eq!(
            BackupRequest::new("/p").query("k", "~-._*!").target(),
            "/p?k=~-._%2A%21"
        );
        // `query` only accepts wire strings; the JavaScript `String(value)`
        // coercion for non-scalars is covered by the coercion table below.
        assert_eq!(
            BackupRequest::new("/p").query("k", "null").target(),
            "/p?k=null"
        );
    }

    #[test]
    fn entries_follow_javascript_ordering() {
        let object = json!({ "b": 1, "10": 2, "a": 3, "2": 4 });
        let keys = js_entries(&object)
            .into_iter()
            .map(|(key, _)| key)
            .collect::<Vec<_>>();
        assert_eq!(keys, vec!["2", "10", "b", "a"]);

        let values = json!(["x", "y"]);
        let array = js_entries(&values);
        assert_eq!(
            array
                .iter()
                .map(|(key, value)| (key.as_str(), value.value().clone()))
                .collect::<Vec<_>>(),
            vec![("0", json!("x")), ("1", json!("y"))]
        );

        let text_value = Value::String("ab".into());
        let text = js_entries(&text_value);
        assert_eq!(
            text.iter()
                .map(|(key, value)| (key.as_str(), value.value().clone()))
                .collect::<Vec<_>>(),
            vec![("0", json!("a")), ("1", json!("b"))]
        );

        assert!(js_entries(&Value::Null).is_empty());
        assert!(js_entries(&json!(7)).is_empty());
    }

    #[test]
    fn array_index_ignores_leading_zeros_and_overflow() {
        assert_eq!(array_index("0"), Some(0));
        assert_eq!(array_index("42"), Some(42));
        assert_eq!(array_index("01"), None);
        assert_eq!(array_index("-1"), None);
        assert_eq!(array_index("4294967295"), None);
        assert_eq!(array_index("4294967296"), None);
        assert_eq!(array_index("a"), None);
    }

    #[test]
    fn merge_session_keeps_clear_field_order_and_overrides_ids() {
        let merged = merge_session(
            &json!({ "sender_key": "SENDER", "session_export": "EXPORT" }),
            "!room:example.org",
            "SESSION",
        );
        assert_eq!(
            JsonGraph::from_value(&merged)
                .stringify()
                .expect("serializable session"),
            r#"{"sender_key":"SENDER","session_export":"EXPORT","room_id":"!room:example.org","session_id":"SESSION"}"#
        );
        // A non-object clear session spreads like `{...'ab'}`: index keys first.
        let spread = merge_session(&json!("ab"), "!r:hs", "S");
        assert_eq!(
            JsonGraph::from_value(&spread)
                .stringify()
                .expect("serializable session"),
            r#"{"0":"a","1":"b","room_id":"!r:hs","session_id":"S"}"#
        );
    }

    #[test]
    fn string_argument_reports_the_javascript_type_name() {
        let cases = [
            (json!(1), "Number"),
            (json!(null), "Null"),
            (json!(true), "Boolean"),
            (json!([]), "Array"),
            (json!({}), "Object"),
        ];
        for (value, name) in cases {
            let error = string_argument(&json!({ "ephemeral": value }), "ephemeral")
                .expect_err("non-string argument");
            assert_eq!(
                error,
                HistoryError::MalformedBackup(format!(
                    "Expect value to be String, but received {name}"
                ))
            );
        }
        assert_eq!(
            string_argument(&json!({}), "ephemeral"),
            Err(HistoryError::MalformedBackup(
                "Expect value to be String, but received Undefined".into()
            ))
        );
        assert_eq!(
            string_argument(&json!({ "ephemeral": "E" }), "ephemeral"),
            Ok("E".to_owned())
        );
    }

    #[test]
    fn javascript_truthiness_and_string_coercion_helpers() {
        for value in [json!(null), json!(false), json!(0), json!(0.0), json!("")] {
            assert!(!js_truthy(&value), "{value}");
        }
        for value in [json!(true), json!(1), json!("0"), json!([]), json!({})] {
            assert!(js_truthy(&value), "{value}");
        }

        let coercions = [
            (json!("7"), "7"),
            (json!(7), "7"),
            (json!(7.5), "7.5"),
            (json!(-7), "-7"),
            (json!(true), "true"),
            (json!(false), "false"),
            (json!(null), ""),
            (json!({}), ""),
            (json!([]), ""),
        ];
        for (value, expected) in coercions {
            assert_eq!(js_query_string(&value), expected, "{value}");
        }
    }

    #[tokio::test]
    async fn create_validates_the_user_id_before_touching_the_machine() {
        let (log, machines) = fake_machines(FakeMachine::new());
        // `MessengerHistory` implements neither `Debug` nor `PartialEq`, so the
        // error has to be destructured rather than compared as a `Result`.
        let Err(error) =
            MessengerHistory::create(&machines, "alice:example.org", "DEVICE", None).await
        else {
            panic!("an invalid user id was accepted");
        };
        assert_eq!(error, HistoryError::InvalidMatrixId(SIGIL_MESSAGE));
        assert_eq!(machines.initializations.load(Ordering::SeqCst), 0);
        assert!(lock(&machines.ids).is_empty());
        assert_eq!(log.closes.load(Ordering::SeqCst), 0);
    }

    #[tokio::test]
    async fn create_skips_an_empty_exported_payload() {
        for exported in [None, Some("")] {
            let (log, machines) = fake_machines(FakeMachine::new());
            let history =
                MessengerHistory::create(&machines, "@alice:example.org", "DEVICE", exported)
                    .await
                    .expect("history service");
            assert!(!history.is_closed());
            assert!(lock(&log.imported).is_empty());
            let ids = lock(&machines.ids);
            assert_eq!(ids.len(), 1);
            assert_eq!(
                ids[0],
                ("@alice:example.org".to_owned(), "DEVICE".to_owned())
            );
            assert_eq!(machines.initializations.load(Ordering::SeqCst), 1);
        }
    }

    #[tokio::test]
    async fn create_imports_a_non_empty_exported_payload() {
        let (log, machines) = fake_machines(FakeMachine::new());
        MessengerHistory::create(&machines, "@alice:example.org", "PHONE", Some("[]"))
            .await
            .expect("history service");
        let imported = lock(&log.imported);
        assert_eq!(imported.len(), 1);
        assert_eq!(imported[0], "[]");
    }

    #[tokio::test]
    async fn create_closes_the_machine_when_the_import_fails() {
        let mut machine = FakeMachine::new();
        machine.import_error = Some(HistoryError::BackupCrypto("import exploded".into()));
        let (log, machines) = fake_machines(machine);
        let Err(error) =
            MessengerHistory::create(&machines, "@alice:example.org", "DEVICE", Some("[]")).await
        else {
            panic!("an import failure was swallowed");
        };
        assert_eq!(error, HistoryError::BackupCrypto("import exploded".into()));
        assert_eq!(lock(&log.imported).len(), 1);
        // PARITY: the TypeScript `create` leaks the Olm machine here.
        assert_eq!(log.closes.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn create_reports_a_machine_initialization_failure() {
        let (_, mut machines) = fake_machines(FakeMachine::new());
        machines.error = Some(HistoryError::Closed);
        let Err(error) =
            MessengerHistory::create(&machines, "@alice:example.org", "DEVICE", None).await
        else {
            panic!("a machine initialization failure was swallowed");
        };
        assert_eq!(error, HistoryError::Closed);
    }

    #[tokio::test]
    async fn close_is_single_shot_and_reports_closed_on_a_second_call() {
        let (log, machines) = fake_machines(FakeMachine::new());
        let mut history = MessengerHistory::create(&machines, "@alice:example.org", "DEVICE", None)
            .await
            .expect("history service");
        assert!(!history.is_closed());
        assert_eq!(history.close(), Ok(()));
        assert!(history.is_closed());
        assert_eq!(history.close(), Err(HistoryError::Closed));
        assert_eq!(log.closes.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn close_propagates_a_machine_failure_and_stays_closed() {
        let mut machine = FakeMachine::new();
        machine.close_error = Some(HistoryError::BackupCrypto("close failed".into()));
        let (log, machines) = fake_machines(machine);
        let mut history = MessengerHistory::create(&machines, "@alice:example.org", "DEVICE", None)
            .await
            .expect("history service");
        assert_eq!(
            history.close(),
            Err(HistoryError::BackupCrypto("close failed".into()))
        );
        assert!(history.is_closed());
        assert_eq!(history.close(), Err(HistoryError::Closed));
        assert_eq!(log.closes.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn restore_round_trips_sessions_into_the_machine() {
        let (log, machines) = fake_machines(FakeMachine::new());
        let client = FakeClient::new(vec![
            Ok(version_response("PUBLIC", json!(7))),
            Ok(backup(json!({
                "!alpha:hs": { "sessions": { "SESSION_A": encrypted_session() } },
                "!beta:hs": { "sessions": { "SESSION_B": encrypted_session() } },
            }))),
        ]);
        let crypto = FakeCrypto {
            public_key: "PUBLIC".into(),
            clears: Mutex::new(vec![
                Ok(r#"{"sender_key":"SENDER","session_export":"EXPORT"}"#.into()),
                Ok(r#"{"sender_key":"OTHER","session_export":"EXPORT2"}"#.into()),
            ]),
            ..Default::default()
        };
        let mut history = MessengerHistory::create(&machines, "@alice:example.org", "DEVICE", None)
            .await
            .expect("history service");

        let exported = history
            .restore(&client, &crypto, VALID_KEY, &NeverCancelled)
            .await
            .expect("restore");
        assert_eq!(exported, "EXPORTED");

        assert_eq!(
            client.targets(),
            vec![VERSION_PATH.to_owned(), format!("{KEYS_PATH}?version=7"),]
        );
        let sessions = lock(&crypto.sessions);
        assert_eq!(sessions.len(), 2);
        assert_eq!(sessions[0].ephemeral, "EPHEMERAL");
        assert_eq!(sessions[0].mac, "MAC");
        assert_eq!(sessions[0].ciphertext, "CIPHERTEXT");
        drop(sessions);
        // The key material is intact while sessions are decrypted and wiped after.
        let key_states = lock(&crypto.key_states);
        assert_eq!(key_states.len(), 2);
        assert!(
            key_states
                .iter()
                .all(|(bytes, wiped)| bytes == &key_material() && !wiped)
        );
        drop(key_states);

        let imported = lock(&log.imported);
        assert_eq!(imported.len(), 1);
        assert_eq!(
            imported[0],
            r#"[{"sender_key":"SENDER","session_export":"EXPORT","room_id":"!alpha:hs","session_id":"SESSION_A"},{"sender_key":"OTHER","session_export":"EXPORT2","room_id":"!beta:hs","session_id":"SESSION_B"}]"#
        );
        drop(imported);
        let audit = history.audit();
        assert_eq!(audit.sessions_read, 2);
        assert_eq!(audit.sessions_imported, 2);
        assert!(audit.completed);
        assert!(audit.key_wiped);
    }

    #[tokio::test]
    async fn restore_rejects_an_undecodable_key_before_any_request() {
        let (_, machines) = fake_machines(FakeMachine::new());
        let mut history = MessengerHistory::create(&machines, "@alice:example.org", "DEVICE", None)
            .await
            .expect("history service");
        let client = FakeClient::new(Vec::new());
        let crypto = FakeCrypto {
            public_key: "PUBLIC".into(),
            ..Default::default()
        };

        let error = history
            .restore(&client, &crypto, BAD_CHECKSUM_KEY, &NeverCancelled)
            .await
            .expect_err("invalid recovery key");
        assert_eq!(error, HistoryError::InvalidRecoveryKey);
        assert_eq!(error.class(), "invalid-recovery-key");
        assert!(client.targets().is_empty());
        assert!(history.audit().requests.is_empty());
        assert!(!history.audit().completed);
    }

    #[tokio::test]
    async fn restore_keeps_the_previous_audit_when_the_key_is_undecodable() {
        // `restore` decodes before it resets the audit, so a rejected key leaves
        // the last attempt's summary readable instead of blanking it.
        let (_, machines) = fake_machines(FakeMachine::new());
        let client = FakeClient::new(vec![
            Ok(version_response("PUBLIC", json!("7"))),
            Ok(backup(json!({}))),
        ]);
        let crypto = FakeCrypto {
            public_key: "PUBLIC".into(),
            ..Default::default()
        };
        let mut history = MessengerHistory::create(&machines, "@alice:example.org", "DEVICE", None)
            .await
            .expect("history service");
        history
            .restore(&client, &crypto, VALID_KEY, &NeverCancelled)
            .await
            .expect("restore");
        assert!(history.audit().completed);

        let error = history
            .restore(&client, &crypto, "not-a-key", &NeverCancelled)
            .await
            .expect_err("invalid recovery key");
        assert_eq!(error, HistoryError::InvalidRecoveryKey);
        assert!(history.audit().completed);
        assert_eq!(history.audit().requests.len(), 2);
    }

    #[tokio::test]
    async fn restore_stops_after_the_version_request_on_a_backup_mismatch() {
        let mismatches = [
            // Different algorithm.
            json!({ "algorithm": "m.megolm_backup.v1", "version": "7", "auth_data": { "public_key": "PUBLIC" } }),
            // Different backup public key.
            json!({ "algorithm": BACKUP_ALGORITHM, "version": "7", "auth_data": { "public_key": "OTHER" } }),
            // Missing auth data.
            json!({ "algorithm": BACKUP_ALGORITHM, "version": "7" }),
            // Falsy versions are reported as a mismatch, not as a format error.
            json!({ "algorithm": BACKUP_ALGORITHM, "version": 0, "auth_data": { "public_key": "PUBLIC" } }),
            json!({ "algorithm": BACKUP_ALGORITHM, "version": "", "auth_data": { "public_key": "PUBLIC" } }),
            json!({ "algorithm": BACKUP_ALGORITHM, "version": null, "auth_data": { "public_key": "PUBLIC" } }),
            json!({ "algorithm": BACKUP_ALGORITHM, "auth_data": { "public_key": "PUBLIC" } }),
        ];
        for version in mismatches {
            let (_, machines) = fake_machines(FakeMachine::new());
            let client = FakeClient::new(vec![Ok(version.clone())]);
            let crypto = FakeCrypto {
                public_key: "PUBLIC".into(),
                ..Default::default()
            };
            let mut history =
                MessengerHistory::create(&machines, "@alice:example.org", "DEVICE", None)
                    .await
                    .expect("history service");
            let error = history
                .restore(&client, &crypto, VALID_KEY, &NeverCancelled)
                .await
                .expect_err("backup mismatch");
            assert_eq!(error, HistoryError::BackupMismatch, "{version}");
            assert_eq!(client.targets(), vec![VERSION_PATH.to_owned()], "{version}");
            assert!(history.audit().key_wiped, "{version}");
            assert!(!history.audit().completed, "{version}");
        }
    }

    #[tokio::test]
    async fn restore_sends_an_empty_query_for_a_non_scalar_version() {
        let (_, machines) = fake_machines(FakeMachine::new());
        let client = FakeClient::new(vec![
            Ok(version_response("PUBLIC", json!({ "nested": 1 }))),
            Ok(backup(json!({}))),
        ]);
        let crypto = FakeCrypto {
            public_key: "PUBLIC".into(),
            ..Default::default()
        };
        let mut history = MessengerHistory::create(&machines, "@alice:example.org", "DEVICE", None)
            .await
            .expect("history service");
        history
            .restore(&client, &crypto, VALID_KEY, &NeverCancelled)
            .await
            .expect("restore");

        assert_eq!(
            client.targets(),
            vec![VERSION_PATH.to_owned(), format!("{KEYS_PATH}?version=")]
        );
    }

    #[tokio::test]
    async fn restore_reports_a_transport_failure_as_a_backup_request_error() {
        let (_, machines) = fake_machines(FakeMachine::new());
        let client = FakeClient::new(vec![Err("socket closed".into())]);
        let crypto = FakeCrypto {
            public_key: "PUBLIC".into(),
            ..Default::default()
        };
        let mut history = MessengerHistory::create(&machines, "@alice:example.org", "DEVICE", None)
            .await
            .expect("history service");
        let error = history
            .restore(&client, &crypto, VALID_KEY, &NeverCancelled)
            .await
            .expect_err("transport failure");
        assert_eq!(error, HistoryError::BackupRequest("socket closed".into()));
        assert_eq!(error.class(), "backup-request");
        assert!(history.audit().key_wiped);
    }

    #[tokio::test]
    async fn restore_fails_at_the_machine_boundary_once_closed() {
        let (_, machines) = fake_machines(FakeMachine::new());
        let client = FakeClient::new(vec![
            Ok(version_response("PUBLIC", json!("7"))),
            Ok(backup(json!({}))),
        ]);
        let crypto = FakeCrypto {
            public_key: "PUBLIC".into(),
            ..Default::default()
        };
        let mut history = MessengerHistory::create(&machines, "@alice:example.org", "DEVICE", None)
            .await
            .expect("history service");
        assert_eq!(history.close(), Ok(()));

        let error = history
            .restore(&client, &crypto, VALID_KEY, &NeverCancelled)
            .await
            .expect_err("closed service");
        assert_eq!(error, HistoryError::Closed);
        // The download still happened before the machine handle was needed.
        assert_eq!(history.audit().requests.len(), 2);
        assert!(!history.audit().completed);
        assert!(history.audit().key_wiped);
    }

    #[tokio::test]
    async fn restore_rejects_malformed_backup_shapes() {
        let cases: Vec<(Value, &str)> = vec![
            (
                Value::Null,
                "null is not an object (evaluating 'response.rooms')",
            ),
            (
                json!({ "rooms": { "!r:hs": null } }),
                "null is not an object (evaluating 'room.sessions')",
            ),
            (
                json!({ "rooms": { "!r:hs": { "sessions": { "S": null } } } }),
                "null is not an object (evaluating 'session.session_data')",
            ),
            (
                json!({ "rooms": { "!r:hs": { "sessions": { "S": {} } } } }),
                "undefined is not an object (evaluating 'encrypted.ephemeral')",
            ),
            (
                json!({ "rooms": { "!r:hs": { "sessions": { "S": { "session_data": null } } } } }),
                "null is not an object (evaluating 'encrypted.ephemeral')",
            ),
            (
                json!({ "rooms": { "!r:hs": { "sessions": { "S": { "session_data": { "ephemeral": 7 } } } } } }),
                "Expect value to be String, but received Number",
            ),
        ];
        let crypto = FakeCrypto {
            public_key: "PUBLIC".into(),
            ..Default::default()
        };
        for (payload, message) in cases {
            let (_, machines) = fake_machines(FakeMachine::new());
            let client = FakeClient::new(vec![
                Ok(version_response("PUBLIC", json!("7"))),
                Ok(payload.clone()),
            ]);
            let mut history =
                MessengerHistory::create(&machines, "@alice:example.org", "DEVICE", None)
                    .await
                    .expect("history service");
            let error = history
                .restore(&client, &crypto, VALID_KEY, &NeverCancelled)
                .await
                .expect_err("malformed backup");
            assert_eq!(
                error,
                HistoryError::MalformedBackup(message.to_owned()),
                "{payload}"
            );
            assert_eq!(error.class(), "malformed-backup");
            assert!(history.audit().key_wiped);
        }
    }

    #[tokio::test]
    async fn restore_stops_at_the_session_ceiling_before_decrypting_the_next_session() {
        let mut sessions = Map::new();
        for index in 0..=SESSION_LIMIT {
            sessions.insert(format!("S{index:05}"), encrypted_session());
        }
        let (_, machines) = fake_machines(FakeMachine::new());
        let client = FakeClient::new(vec![
            Ok(version_response("PUBLIC", json!("7"))),
            Ok(backup(json!({ "!big:hs": { "sessions": sessions } }))),
        ]);
        let crypto = FakeCrypto {
            public_key: "PUBLIC".into(),
            fallback: Some("{}".into()),
            ..Default::default()
        };
        let mut history = MessengerHistory::create(&machines, "@alice:example.org", "DEVICE", None)
            .await
            .expect("history service");

        let error = history
            .restore(&client, &crypto, VALID_KEY, &NeverCancelled)
            .await
            .expect_err("session ceiling");
        assert_eq!(error, HistoryError::RecoveryLimit);
        // The ceiling is checked before `decryptV1`, so exactly 50 000 sessions
        // were decrypted and the 50 001st never reached the crypto layer.
        assert_eq!(history.audit().sessions_read, SESSION_LIMIT);
        assert_eq!(lock(&crypto.sessions).len(), SESSION_LIMIT);
        assert_eq!(history.audit().sessions_imported, 0);
        assert!(!history.audit().completed);
        assert!(history.audit().key_wiped);
    }

    #[tokio::test]
    async fn restore_wipes_the_key_when_decryption_fails() {
        let (_, machines) = fake_machines(FakeMachine::new());
        let client = FakeClient::new(vec![
            Ok(version_response("PUBLIC", json!("7"))),
            Ok(backup(
                json!({ "!r:hs": { "sessions": { "S": encrypted_session() } } }),
            )),
        ]);
        let crypto = FakeCrypto {
            public_key: "PUBLIC".into(),
            clears: Mutex::new(vec![Err("bad mac".into())]),
            ..Default::default()
        };
        let mut history = MessengerHistory::create(&machines, "@alice:example.org", "DEVICE", None)
            .await
            .expect("history service");
        let error = history
            .restore(&client, &crypto, VALID_KEY, &NeverCancelled)
            .await
            .expect_err("undecodable session");
        assert_eq!(error, HistoryError::UndecodableSession("bad mac".into()));
        assert_eq!(history.audit().sessions_read, 0);
        assert!(history.audit().key_wiped);
    }

    #[tokio::test]
    async fn restore_reports_unreadable_cleartext_sessions() {
        let (_, machines) = fake_machines(FakeMachine::new());
        let client = FakeClient::new(vec![
            Ok(version_response("PUBLIC", json!("7"))),
            Ok(backup(
                json!({ "!r:hs": { "sessions": { "S": encrypted_session() } } }),
            )),
        ]);
        let crypto = FakeCrypto {
            public_key: "PUBLIC".into(),
            clears: Mutex::new(vec![Ok("not json".into())]),
            ..Default::default()
        };
        let mut history = MessengerHistory::create(&machines, "@alice:example.org", "DEVICE", None)
            .await
            .expect("history service");
        let error = history
            .restore(&client, &crypto, VALID_KEY, &NeverCancelled)
            .await
            .expect_err("unreadable session");
        assert_eq!(error.class(), "unreadable-payload");
        assert!(error.message().starts_with("JSON Parse error: "), "{error}");
        assert_eq!(history.audit().sessions_read, 0);
    }

    #[tokio::test]
    async fn restore_rejects_a_recovery_key_that_yields_no_public_key() {
        let (_, machines) = fake_machines(FakeMachine::new());
        let client = FakeClient::new(Vec::new());
        let crypto = NeverPublicKey;
        let mut history = MessengerHistory::create(&machines, "@alice:example.org", "DEVICE", None)
            .await
            .expect("history service");
        let error = history
            .restore(&client, &crypto, VALID_KEY, &NeverCancelled)
            .await
            .expect_err("key derivation failure");
        assert_eq!(error, HistoryError::BackupCrypto("no public key".into()));
        assert!(client.targets().is_empty());
        assert!(history.audit().key_wiped);
    }

    #[tokio::test]
    async fn restore_honours_cancellation_before_each_request() {
        let crypto = FakeCrypto {
            public_key: "PUBLIC".into(),
            ..Default::default()
        };

        let (_, machines) = fake_machines(FakeMachine::new());
        let client = FakeClient::new(vec![Ok(version_response("PUBLIC", json!("7")))]);
        let mut history = MessengerHistory::create(&machines, "@alice:example.org", "DEVICE", None)
            .await
            .expect("history service");
        let error = history
            .restore(&client, &crypto, VALID_KEY, &CancelledAfter::new(1))
            .await
            .expect_err("cancelled before the version request");
        assert_eq!(error, HistoryError::Cancelled);
        assert!(client.targets().is_empty());
        assert!(history.audit().key_wiped);

        let (_, machines) = fake_machines(FakeMachine::new());
        let client = FakeClient::new(vec![Ok(version_response("PUBLIC", json!("7")))]);
        let mut history = MessengerHistory::create(&machines, "@alice:example.org", "DEVICE", None)
            .await
            .expect("history service");
        let error = history
            .restore(&client, &crypto, VALID_KEY, &CancelledAfter::new(2))
            .await
            .expect_err("cancelled before the keys request");
        assert_eq!(error, HistoryError::Cancelled);
        assert_eq!(client.targets(), vec![VERSION_PATH.to_owned()]);
        assert!(!history.audit().completed);
    }

    struct NeverPublicKey;

    impl BackupCrypto for NeverPublicKey {
        fn public_key(&self, _key: &RecoveryKey) -> Result<String, String> {
            Err("no public key".to_owned())
        }

        fn decrypt_session<'a>(
            &'a self,
            _key: &'a RecoveryKey,
            _session: &'a EncryptedSession,
        ) -> CryptoFuture<'a, String> {
            Box::pin(async move { Err("unreachable".to_owned()) })
        }
    }

    #[tokio::test]
    async fn decrypt_serializes_the_event_and_passes_untrusted_trust() {
        let (log, machines) = fake_machines(FakeMachine::new());
        let mut history = MessengerHistory::create(&machines, "@alice:example.org", "DEVICE", None)
            .await
            .expect("history service");
        let decrypted = history
            .decrypt(
                "!room:example.org",
                &json!({ "b": 1, "a": [1, 2], "n": null }),
            )
            .await
            .expect("decrypted event");
        assert_eq!(decrypted, json!({ "type": "m.room.message" }));

        let requests = lock(&log.decrypted);
        assert_eq!(requests.len(), 1);
        assert_eq!(requests[0].event, r#"{"b":1,"a":[1,2],"n":null}"#);
        assert_eq!(requests[0].room_id, "!room:example.org");
        assert_eq!(requests[0].trust, TrustRequirement::Untrusted);
    }

    #[tokio::test]
    async fn decrypt_validates_the_room_id_before_the_machine() {
        let (_, machines) = fake_machines(FakeMachine::new());
        let mut history = MessengerHistory::create(&machines, "@alice:example.org", "DEVICE", None)
            .await
            .expect("history service");
        assert_eq!(history.close(), Ok(()));
        assert_eq!(
            history.decrypt("shared", &json!({})).await,
            Err(HistoryError::InvalidMatrixId(SIGIL_MESSAGE))
        );
        assert_eq!(
            history.decrypt("!room:example.org", &json!({})).await,
            Err(HistoryError::Closed)
        );
    }

    #[tokio::test]
    async fn decrypt_reports_unreadable_cleartext_events() {
        let mut machine = FakeMachine::new();
        machine.decrypt_reply = Ok("not json".into());
        let (_, machines) = fake_machines(machine);
        let mut history = MessengerHistory::create(&machines, "@alice:example.org", "DEVICE", None)
            .await
            .expect("history service");
        let error = history
            .decrypt("!room:example.org", &json!({}))
            .await
            .expect_err("unreadable event");
        assert_eq!(error.class(), "unreadable-payload");
        assert!(error.message().starts_with("JSON parse: "), "{error}");
    }

    #[test]
    fn http_client_trims_trailing_slashes_from_the_base_url() {
        for (base_url, expected) in [
            ("https://hs.example", "https://hs.example"),
            ("https://hs.example/", "https://hs.example"),
            ("https://hs.example//", "https://hs.example"),
            ("https://hs.example///", "https://hs.example"),
        ] {
            let client =
                MatrixBackupHttpClient::new(base_url, "TOKEN", 1024, Duration::from_secs(5))
                    .expect("http client");
            assert_eq!(client.base_url, expected, "{base_url}");
            assert_eq!(client.access_token, "TOKEN");
            assert_eq!(client.max_response_bytes, 1024);
            assert_eq!(client.timeout, Duration::from_secs(5));
        }
    }

    fn http_response(status: u16, reason: &str, body: &str) -> String {
        format!(
            "HTTP/1.1 {status} {reason}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
            body.len()
        )
    }

    /// Serves one canned response per connection and reports the request heads.
    fn serve_once(responses: Vec<String>) -> (String, std::thread::JoinHandle<Vec<String>>) {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind http fixture");
        let address = listener.local_addr().expect("fixture address");
        let server = std::thread::spawn(move || {
            let mut heads = Vec::new();
            for response in responses {
                let (mut stream, _) = listener.accept().expect("accept fixture connection");
                let mut head = Vec::new();
                let mut byte = [0_u8; 1];
                loop {
                    if stream.read(&mut byte).expect("read fixture request") == 0 {
                        break;
                    }
                    head.push(byte[0]);
                    if head.ends_with(b"\r\n\r\n") {
                        break;
                    }
                }
                heads.push(String::from_utf8_lossy(&head).into_owned());
                stream
                    .write_all(response.as_bytes())
                    .expect("write fixture response");
                stream.flush().expect("flush fixture response");
            }
            heads
        });
        (format!("http://{address}"), server)
    }

    #[tokio::test]
    async fn http_transport_reads_json_and_reports_matrix_errors() {
        let responses = vec![
            http_response(
                200,
                "OK",
                r#"{"version":"7","algorithm":"m.megolm_backup.v1.curve25519-aes-sha2"}"#,
            ),
            http_response(
                403,
                "Forbidden",
                r#"{"errcode":"M_FORBIDDEN","error":"nope"}"#,
            ),
            http_response(500, "Internal Server Error", "<html>nope</html>"),
            http_response(200, "OK", r#"{"version":"7"}"#),
        ];
        let (base_url, server) = serve_once(responses);
        let client = MatrixBackupHttpClient::new(&base_url, "SECRET", 4096, Duration::from_secs(5))
            .expect("http client");
        let capped = MatrixBackupHttpClient::new(&base_url, "SECRET", 8, Duration::from_secs(5))
            .expect("capped http client");

        tokio::time::timeout(Duration::from_secs(30), async move {
            let version = client
                .get(BackupRequest::new(VERSION_PATH))
                .await
                .expect("version response");
            assert_eq!(version.get("version").and_then(Value::as_str), Some("7"));
            assert_eq!(
                version.get("algorithm").and_then(Value::as_str),
                Some(BACKUP_ALGORITHM)
            );

            let error = client
                .get(BackupRequest::new(KEYS_PATH).query("version", "7"))
                .await
                .expect_err("matrix error reply");
            assert_eq!(error, "M_FORBIDDEN: nope");

            let error = client
                .get(BackupRequest::new(VERSION_PATH))
                .await
                .expect_err("non-json body");
            assert!(
                error.starts_with("matrix backup response is not JSON"),
                "{error}"
            );

            let error = capped
                .get(BackupRequest::new(VERSION_PATH))
                .await
                .expect_err("size ceiling");
            assert_eq!(error, "matrix backup response exceeds the size ceiling");

            let heads = server.join().expect("http fixture thread");
            assert_eq!(heads.len(), 4);
            assert!(
                heads[0].starts_with("GET /_matrix/client/v3/room_keys/version HTTP/1.1\r\n"),
                "{}",
                heads[0]
            );
            assert!(
                heads[0]
                    .to_lowercase()
                    .contains("authorization: bearer secret"),
                "{}",
                heads[0]
            );
            assert!(
                heads[1]
                    .starts_with("GET /_matrix/client/v3/room_keys/keys?version=7 HTTP/1.1\r\n"),
                "{}",
                heads[1]
            );
        })
        .await
        .expect("http transport test timed out");
    }
}
