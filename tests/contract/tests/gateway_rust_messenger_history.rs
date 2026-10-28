//! Focused native contract for `services::messenger_history`.
//!
//! The service's two external capabilities (Megolm decryption and the Olm
//! machine) stay behind ports, so this test supplies recording fakes and
//! asserts the decisions the native module owns: validation order, request
//! sequence, backup scoping, merge shape, cancellation, close semantics and
//! the fixed `Untrusted` trust requirement.

use jait_gateway::services::messenger_history::{
    BACKUP_ALGORITHM, BACKUP_MISMATCH, BackupClient, BackupCrypto, BackupRequest, Cancellation,
    ClientFuture, CryptoFuture, DecryptRequest, EncryptedSession, HistoryError, HistoryMachine,
    HistoryMachines, KEYS_PATH, MachineFuture, MessengerHistory, NoCancellation, SESSION_LIMIT,
    TrustRequirement, VERSION_PATH,
};
use serde_json::{Value, json};
use std::{
    collections::VecDeque,
    sync::{
        Arc, Mutex,
        atomic::{AtomicUsize, Ordering},
    },
};

const VALID_KEY: &str = "EsSzykH7LCZx7CaecmKDwcmYJRXiYbtu8iQ3t8EznRwKpUY1";

#[derive(Default)]
struct Log {
    initialized: Mutex<Vec<(String, String)>>,
    imported: Mutex<Vec<String>>,
    decrypts: Mutex<Vec<DecryptRequest>>,
    exports: AtomicUsize,
    closes: AtomicUsize,
}

struct FakeMachine {
    log: Arc<Log>,
    import_error: Option<HistoryError>,
    export: String,
    decrypt: Result<String, HistoryError>,
    close_error: Option<HistoryError>,
}

impl FakeMachine {
    fn new(log: Arc<Log>) -> Self {
        Self {
            log,
            import_error: None,
            export: "EXPORTED".into(),
            decrypt: Ok(r#"{"type":"m.room.message","content":{"body":"hi"}}"#.into()),
            close_error: None,
        }
    }
}

impl HistoryMachine for FakeMachine {
    fn import_room_keys<'a>(&'a mut self, exported: &'a str) -> MachineFuture<'a, ()> {
        Box::pin(async move {
            self.log.imported.lock().unwrap().push(exported.to_owned());
            match &self.import_error {
                Some(error) => Err(error.clone()),
                None => Ok(()),
            }
        })
    }

    fn export_room_keys<'a>(&'a mut self) -> MachineFuture<'a, String> {
        Box::pin(async move {
            self.log.exports.fetch_add(1, Ordering::SeqCst);
            Ok(self.export.clone())
        })
    }

    fn decrypt_room_event<'a>(&'a mut self, request: DecryptRequest) -> MachineFuture<'a, String> {
        Box::pin(async move {
            self.log.decrypts.lock().unwrap().push(request);
            self.decrypt.clone()
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
    log: Arc<Log>,
    machine: FakeMachine,
    initialize_error: Option<HistoryError>,
}

impl HistoryMachines for FakeMachines {
    fn initialize<'a>(
        &'a self,
        user_id: &'a str,
        device_id: &'a str,
    ) -> MachineFuture<'a, Box<dyn HistoryMachine>> {
        Box::pin(async move {
            if let Some(error) = &self.initialize_error {
                return Err(error.clone());
            }
            self.log
                .initialized
                .lock()
                .unwrap()
                .push((user_id.to_owned(), device_id.to_owned()));
            Ok(Box::new(FakeMachine {
                log: Arc::clone(&self.log),
                import_error: self.machine.import_error.clone(),
                export: self.machine.export.clone(),
                decrypt: self.machine.decrypt.clone(),
                close_error: self.machine.close_error.clone(),
            }) as Box<dyn HistoryMachine>)
        })
    }
}

struct FakeClient {
    responses: Mutex<VecDeque<Result<Value, String>>>,
    targets: Mutex<Vec<String>>,
}

impl FakeClient {
    fn new(responses: Vec<Result<Value, String>>) -> Self {
        Self {
            responses: Mutex::new(responses.into()),
            targets: Mutex::new(Vec::new()),
        }
    }

    fn targets(&self) -> Vec<String> {
        self.targets.lock().unwrap().clone()
    }
}

impl BackupClient for FakeClient {
    fn get<'a>(&'a self, request: BackupRequest) -> ClientFuture<'a, Value> {
        self.targets.lock().unwrap().push(request.target());
        let response = self
            .responses
            .lock()
            .unwrap()
            .pop_front()
            .unwrap_or_else(|| Err("unexpected request".into()));
        Box::pin(async move { response })
    }
}

struct FakeCrypto {
    public_key: String,
    clears: Mutex<VecDeque<Result<String, String>>>,
    seen: Mutex<Vec<EncryptedSession>>,
}

impl FakeCrypto {
    fn new(public_key: &str, clears: Vec<Result<String, String>>) -> Self {
        Self {
            public_key: public_key.into(),
            clears: Mutex::new(clears.into()),
            seen: Mutex::new(Vec::new()),
        }
    }
}

impl BackupCrypto for FakeCrypto {
    fn public_key(
        &self,
        _key: &jait_gateway::services::messenger_history::RecoveryKey,
    ) -> Result<String, String> {
        Ok(self.public_key.clone())
    }

    fn decrypt_session<'a>(
        &'a self,
        _key: &'a jait_gateway::services::messenger_history::RecoveryKey,
        session: &'a EncryptedSession,
    ) -> CryptoFuture<'a, String> {
        self.seen.lock().unwrap().push(session.clone());
        let clear = self
            .clears
            .lock()
            .unwrap()
            .pop_front()
            .unwrap_or_else(|| Err("unexpected decrypt".into()));
        Box::pin(async move { clear })
    }
}

struct AlwaysCancelled;

impl Cancellation for AlwaysCancelled {
    fn is_cancelled(&self) -> bool {
        true
    }
}

fn session_data() -> Value {
    json!({
        "ephemeral": "EPHEMERAL",
        "mac": "MAC",
        "ciphertext": "CIPHERTEXT",
    })
}

fn version(public_key: &str) -> Value {
    json!({
        "version": 7,
        "algorithm": BACKUP_ALGORITHM,
        "auth_data": { "public_key": public_key },
    })
}

fn backup(rooms: Value) -> Value {
    json!({ "rooms": rooms })
}

async fn history(machine: FakeMachine) -> MessengerHistory {
    let log = Arc::clone(&machine.log);
    MessengerHistory::create(
        &FakeMachines {
            log,
            machine,
            initialize_error: None,
        },
        "@alice:example.org",
        "DEVICE",
        None,
    )
    .await
    .expect("history service")
}

#[tokio::test]
async fn restore_downloads_scopes_decrypts_merges_and_re_exports() {
    let log = Arc::new(Log::default());
    let client = FakeClient::new(vec![
        Ok(version("PUBLIC")),
        Ok(backup(json!({
            "!alpha:hs": { "sessions": { "SESSION_A": { "session_data": session_data() } } },
            "!beta:hs": { "sessions": { "SESSION_B": { "session_data": session_data() } } },
        }))),
    ]);
    let crypto = FakeCrypto::new(
        "PUBLIC",
        vec![
            Ok(r#"{"sender_key":"SENDER","session_export":"EXPORT"}"#.into()),
            Ok(r#"{"sender_key":"OTHER","session_export":"EXPORT2"}"#.into()),
        ],
    );
    let mut history = history(FakeMachine::new(Arc::clone(&log))).await;

    let exported = history
        .restore(&client, &crypto, VALID_KEY, &NoCancellation)
        .await
        .expect("restore");

    assert_eq!(exported, "EXPORTED");
    assert_eq!(
        client.targets(),
        vec![VERSION_PATH.to_owned(), format!("{KEYS_PATH}?version=7")]
    );
    assert_eq!(
        log.imported.lock().unwrap().as_slice(),
        &[
            r#"[{"sender_key":"SENDER","session_export":"EXPORT","room_id":"!alpha:hs","session_id":"SESSION_A"},{"sender_key":"OTHER","session_export":"EXPORT2","room_id":"!beta:hs","session_id":"SESSION_B"}]"#
        ]
    );
    assert_eq!(
        crypto.seen.lock().unwrap().as_slice(),
        &[
            EncryptedSession {
                ephemeral: "EPHEMERAL".into(),
                mac: "MAC".into(),
                ciphertext: "CIPHERTEXT".into(),
            },
            EncryptedSession {
                ephemeral: "EPHEMERAL".into(),
                mac: "MAC".into(),
                ciphertext: "CIPHERTEXT".into(),
            },
        ]
    );
    assert_eq!(log.exports.load(Ordering::SeqCst), 1);
    let audit = history.audit();
    assert_eq!(audit.requests, client.targets());
    assert_eq!(audit.sessions_read, 2);
    assert_eq!(audit.sessions_imported, 2);
    assert!(audit.key_wiped);
    assert!(audit.completed);
}

#[tokio::test]
async fn an_invalid_recovery_key_stops_before_any_machine_or_network_work() {
    let log = Arc::new(Log::default());
    let client = FakeClient::new(Vec::new());
    let crypto = FakeCrypto::new("PUBLIC", Vec::new());
    let mut history = history(FakeMachine::new(Arc::clone(&log))).await;

    let error = history
        .restore(&client, &crypto, "not-a-recovery-key", &NoCancellation)
        .await
        .expect_err("invalid key");

    assert_eq!(error, HistoryError::InvalidRecoveryKey);
    assert_eq!(error.class(), "invalid-recovery-key");
    assert!(matches!(error, HistoryError::InvalidRecoveryKey));
    assert!(client.targets().is_empty());
    assert!(log.imported.lock().unwrap().is_empty());
    assert!(crypto.seen.lock().unwrap().is_empty());
}

#[tokio::test]
async fn a_version_or_public_key_mismatch_stops_after_the_version_request_and_wipes_the_key() {
    for response in [
        Ok(json!({
            "version": 7,
            "algorithm": "m.megolm_backup.v2",
            "auth_data": { "public_key": "PUBLIC" },
        })),
        Ok(json!({
            "version": 7,
            "algorithm": BACKUP_ALGORITHM,
            "auth_data": { "public_key": "OTHER" },
        })),
        Ok(json!({ "algorithm": BACKUP_ALGORITHM, "auth_data": { "public_key": "PUBLIC" } })),
    ] {
        let log = Arc::new(Log::default());
        let client = FakeClient::new(vec![response]);
        let crypto = FakeCrypto::new("PUBLIC", Vec::new());
        let mut history = history(FakeMachine::new(log)).await;

        let error = history
            .restore(&client, &crypto, VALID_KEY, &NoCancellation)
            .await
            .expect_err("mismatch");

        assert_eq!(error, HistoryError::BackupMismatch);
        assert_eq!(error.message(), BACKUP_MISMATCH);
        assert_eq!(client.targets(), vec![VERSION_PATH.to_owned()]);
        assert!(!history.audit().completed);
        assert!(history.audit().key_wiped);
        assert_eq!(history.audit().sessions_read, 0);
    }
}

#[tokio::test]
async fn cancellation_is_checked_between_observable_steps_and_per_session() {
    let log = Arc::new(Log::default());
    let client = FakeClient::new(vec![
        Ok(version("PUBLIC")),
        Ok(backup(json!({
            "!alpha:hs": { "sessions": { "SESSION_A": { "session_data": session_data() } } },
        }))),
    ]);
    let crypto = FakeCrypto::new("PUBLIC", vec![Ok("{}".into())]);
    let mut history = history(FakeMachine::new(Arc::clone(&log))).await;

    let error = history
        .restore(&client, &crypto, VALID_KEY, &AlwaysCancelled)
        .await
        .expect_err("cancelled");

    assert_eq!(error, HistoryError::Cancelled);
    assert!(client.targets().is_empty());
    assert!(log.imported.lock().unwrap().is_empty());
    assert_eq!(log.exports.load(Ordering::SeqCst), 0);
    assert!(history.audit().key_wiped);
    assert!(!history.audit().completed);
}

#[tokio::test]
async fn a_malformed_session_stops_before_import_and_reports_the_partial_audit() {
    let log = Arc::new(Log::default());
    let client = FakeClient::new(vec![
        Ok(version("PUBLIC")),
        Ok(backup(json!({
            "!alpha:hs": { "sessions": {
                "SESSION_A": { "session_data": session_data() },
                "SESSION_B": { "session_data": { "ephemeral": 3, "mac": "MAC", "ciphertext": "C" } },
            } },
        }))),
    ]);
    let crypto = FakeCrypto::new("PUBLIC", vec![Ok(r#"{"sender_key":"S"}"#.into())]);
    let mut history = history(FakeMachine::new(Arc::clone(&log))).await;

    let error = history
        .restore(&client, &crypto, VALID_KEY, &NoCancellation)
        .await
        .expect_err("malformed session");

    assert_eq!(error.class(), "malformed-backup");
    assert!(log.imported.lock().unwrap().is_empty());
    assert_eq!(log.exports.load(Ordering::SeqCst), 0);
    assert_eq!(history.audit().sessions_read, 1);
    assert_eq!(history.audit().sessions_imported, 0);
    assert!(!history.audit().completed);
    assert!(history.audit().key_wiped);
}

#[tokio::test]
async fn decrypt_validates_the_room_first_and_always_uses_untrusted() {
    let log = Arc::new(Log::default());
    let mut history = history(FakeMachine::new(Arc::clone(&log))).await;

    let error = history
        .decrypt("not-a-room", &json!({ "type": "m.room.encrypted" }))
        .await
        .expect_err("invalid room");
    assert_eq!(error.class(), "matrix-id");
    assert!(log.decrypts.lock().unwrap().is_empty());

    let event = json!({ "type": "m.room.encrypted", "content": { "ciphertext": "C" } });
    let clear = history
        .decrypt("!alpha:hs", &event)
        .await
        .expect("decrypted");
    assert_eq!(clear["content"]["body"], "hi");
    let decrypts = log.decrypts.lock().unwrap();
    assert_eq!(decrypts.len(), 1);
    assert_eq!(decrypts[0].room_id, "!alpha:hs");
    assert_eq!(decrypts[0].trust, TrustRequirement::Untrusted);
    assert_eq!(
        decrypts[0].event,
        r#"{"type":"m.room.encrypted","content":{"ciphertext":"C"}}"#
    );

    history.close().expect("close");
    let error = history
        .decrypt("!alpha:hs", &event)
        .await
        .expect_err("closed");
    assert_eq!(error, HistoryError::Closed);
    let error = history
        .decrypt("bad-room", &event)
        .await
        .expect_err("room id is validated before the closed check");
    assert_eq!(error.class(), "matrix-id");
}

#[tokio::test]
async fn create_imports_only_non_empty_exports_and_closes_the_machine_on_import_failure() {
    let log = Arc::new(Log::default());

    let mut machine = FakeMachine::new(Arc::clone(&log));
    machine.import_error = Some(HistoryError::BackupCrypto("import failed".into()));
    let error = MessengerHistory::create(
        &FakeMachines {
            log: Arc::clone(&log),
            machine,
            initialize_error: None,
        },
        "@alice:example.org",
        "DEVICE",
        Some("EXPORTED"),
    )
    .await
    .err()
    .expect("import failure");
    assert_eq!(error, HistoryError::BackupCrypto("import failed".into()));
    assert_eq!(log.closes.load(Ordering::SeqCst), 1);

    let log = Arc::new(Log::default());
    let empty = MessengerHistory::create(
        &FakeMachines {
            log: Arc::clone(&log),
            machine: FakeMachine::new(Arc::clone(&log)),
            initialize_error: None,
        },
        "@alice:example.org",
        "DEVICE",
        Some(""),
    )
    .await
    .expect("empty export");
    assert!(log.imported.lock().unwrap().is_empty());
    assert_eq!(
        log.initialized.lock().unwrap().as_slice(),
        &[("@alice:example.org".to_owned(), "DEVICE".to_owned())]
    );
    drop(empty);

    let log = Arc::new(Log::default());
    let mut error = MessengerHistory::create(
        &FakeMachines {
            log,
            machine: FakeMachine::new(Arc::new(Log::default())),
            initialize_error: Some(HistoryError::InvalidMatrixId("initialize failed".into())),
        },
        "@alice:example.org",
        "DEVICE",
        None,
    )
    .await
    .err()
    .expect("initialize failure");
    assert_eq!(error.class(), "matrix-id");
    error = HistoryError::BackupRequest("request failed".into());
    assert_eq!(error.class(), "backup-request");
    assert!(
        MessengerHistory::create(
            &FakeMachines {
                log: Arc::new(Log::default()),
                machine: FakeMachine::new(Arc::new(Log::default())),
                initialize_error: None,
            },
            "alice",
            "DEVICE",
            None,
        )
        .await
        .is_err()
    );
}

#[tokio::test]
async fn close_is_single_shot_and_preserves_machine_failures() {
    let log = Arc::new(Log::default());
    let mut machine = FakeMachine::new(Arc::clone(&log));
    machine.close_error = Some(HistoryError::BackupCrypto("close failed".into()));
    let mut history = history(machine).await;

    assert!(!history.is_closed());
    assert_eq!(
        history.close(),
        Err(HistoryError::BackupCrypto("close failed".into()))
    );
    assert!(history.is_closed());
    assert_eq!(history.close(), Err(HistoryError::Closed));
    assert_eq!(log.closes.load(Ordering::SeqCst), 1);
    assert_eq!(SESSION_LIMIT, 50_000);
}
