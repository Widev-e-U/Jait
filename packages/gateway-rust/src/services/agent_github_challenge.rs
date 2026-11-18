//! Native-only durable setup authority. Issuance/revocation are used by the
//! canonical credential service and compound HTTP callback. Host cleanup uses
//! the same durable phase authority to fence expired in-flight results.
//!
//! One bounded row per owner retains a monotonically increasing generation even
//! after revocation. Only hashes of state, codes and credential snapshots persist.
//! Reservations survive process loss; dispatch is durably uncertain BEFORE I/O.
//! No transaction or database handle crosses an outbound await.
use rusqlite::{Connection, OptionalExtension, Transaction, TransactionBehavior, params};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{error::Error, fmt};

pub const TTL_MS: i64 = 15 * 60_000;
const MAX_REPLAY_BYTES: usize = 16 * 1024;
type SourceError = Box<dyn Error + Send + Sync>;

#[derive(Debug)]
pub enum ChallengeError {
    Invalid,
    Expired,
    BindingChanged,
    WrongPhase,
    ReplayMismatch,
    Uncertain,
    Stale,
    InvalidReplay,
    Storage(rusqlite::Error),
    Json(serde_json::Error),
    Apply(SourceError),
}
impl fmt::Display for ChallengeError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Self::Invalid => "Invalid GitHub setup challenge",
            Self::Expired => "GitHub setup challenge expired",
            Self::BindingChanged => "GitHub setup credentials changed",
            Self::WrongPhase => "Invalid GitHub setup phase",
            Self::ReplayMismatch => "GitHub setup replay does not match",
            Self::Uncertain => "GitHub setup outcome is uncertain; restart setup",
            Self::Stale => "GitHub setup reservation is stale",
            Self::InvalidReplay => "Invalid GitHub setup replay result",
            Self::Storage(_) | Self::Json(_) | Self::Apply(_) => {
                "GitHub setup storage operation failed"
            }
        })
    }
}
impl Error for ChallengeError {}
impl From<rusqlite::Error> for ChallengeError {
    fn from(v: rusqlite::Error) -> Self {
        Self::Storage(v)
    }
}
impl From<serde_json::Error> for ChallengeError {
    fn from(v: serde_json::Error) -> Self {
        Self::Json(v)
    }
}
#[derive(Clone, Copy)]
pub struct Owner<'a> {
    pub user: &'a str,
    pub agent: &'a str,
}
/// No Debug: callers may construct this from a credential snapshot.
pub struct Binding {
    revision: String,
    app: Option<String>,
}
impl Binding {
    pub fn new(revision: &Value, app: Option<&str>) -> Result<Self, ChallengeError> {
        Ok(Self {
            revision: digest(&serde_json::to_vec(revision)?),
            app: app.map(Into::into),
        })
    }
}
fn digest(v: &[u8]) -> String {
    hex::encode(Sha256::digest(v))
}
#[derive(Clone, Copy)]
pub enum Phase {
    Manifest,
    Installation,
}
impl Phase {
    fn awaiting(self) -> &'static str {
        match self {
            Self::Manifest => "awaiting_manifest",
            Self::Installation => "awaiting_installation",
        }
    }
    fn reserved(self) -> &'static str {
        match self {
            Self::Manifest => "manifest_reserved",
            Self::Installation => "installation_reserved",
        }
    }
    fn uncertain(self) -> &'static str {
        match self {
            Self::Manifest => "manifest_uncertain",
            Self::Installation => "installation_uncertain",
        }
    }
    fn operation_hash(self, input: &str) -> String {
        let mut h = Sha256::new();
        h.update(self.awaiting().as_bytes());
        h.update([0]);
        h.update(input.as_bytes());
        hex::encode(h.finalize())
    }
}
/// Opaque process-held capabilities. Dropping either never releases durable
/// authority. An abandoned reservation requires explicit authenticated restart.
pub struct Reservation {
    user: String,
    agent: String,
    generation: i64,
    id: String,
    phase: Phase,
}
pub struct Dispatched(Reservation);
pub enum Admission {
    Reserved(Reservation),
    Replay(Value),
}
struct Row {
    generation: i64,
    state_hash: Option<String>,
    issued: i64,
    expires: i64,
    phase: String,
    revision: Option<String>,
    app: Option<String>,
    manifest_hash: Option<String>,
    installation_hash: Option<String>,
    manifest_result: Option<String>,
    installation_result: Option<String>,
    reservation: Option<String>,
}
/// Native extension, intentionally outside the shared TypeScript schema-version
/// ledger. It is created only when this unmounted native candidate is invoked.
pub fn ensure_schema(db: &Connection) -> Result<(), ChallengeError> {
    db.execute_batch(
        "CREATE TABLE IF NOT EXISTS native_github_setup_challenges (
        user_id TEXT NOT NULL, agent_id TEXT NOT NULL,
        generation INTEGER NOT NULL CHECK(typeof(generation)='integer' AND generation>0),
        state_hash TEXT, issued_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
        phase TEXT NOT NULL, revision_hash TEXT, app_id TEXT,
        manifest_hash TEXT, installation_hash TEXT,
        manifest_result TEXT, installation_result TEXT, reservation TEXT,
        PRIMARY KEY(user_id,agent_id)
    );
    CREATE INDEX IF NOT EXISTS native_github_setup_expiry
    ON native_github_setup_challenges(expires_at) WHERE phase!='revoked'",
    )?;
    Ok(())
}
fn row(db: &Connection, owner: Owner<'_>) -> Result<Row, ChallengeError> {
    db.query_row("SELECT generation,state_hash,issued_at,expires_at,phase,revision_hash,app_id,manifest_hash,installation_hash,manifest_result,installation_result,reservation FROM native_github_setup_challenges WHERE user_id=? AND agent_id=?", params![owner.user,owner.agent], |r| Ok(Row {
        generation:r.get(0)?,state_hash:r.get(1)?,issued:r.get(2)?,expires:r.get(3)?,phase:r.get(4)?,revision:r.get(5)?,app:r.get(6)?,manifest_hash:r.get(7)?,installation_hash:r.get(8)?,manifest_result:r.get(9)?,installation_result:r.get(10)?,reservation:r.get(11)?,
    })).optional()?.ok_or(ChallengeError::Invalid)
}
fn valid(row: &Row, now: i64, binding: &Binding) -> Result<(), ChallengeError> {
    if row.state_hash.is_none() || row.phase == "revoked" {
        return Err(ChallengeError::Invalid);
    }
    if now < row.issued || now >= row.expires {
        return Err(ChallengeError::Expired);
    }
    if row.revision.as_deref() != Some(binding.revision.as_str()) || row.app != binding.app {
        return Err(ChallengeError::BindingChanged);
    }
    Ok(())
}
/// Caller composes this single SQL upsert with the connection write in one
/// transaction. A new signed nonce is required; reissuing the same state fails.
pub fn issue(
    db: &Transaction<'_>,
    owner: Owner<'_>,
    state: &str,
    now: i64,
    binding: &Binding,
) -> Result<i64, ChallengeError> {
    ensure_schema(db)?;
    if state.is_empty()
        || state.len() > 8192
        || owner.user.is_empty()
        || owner.agent.is_empty()
        || now < 0
    {
        return Err(ChallengeError::Invalid);
    }
    let expires = now.checked_add(TTL_MS).ok_or(ChallengeError::Invalid)?;
    let hash = digest(state.as_bytes());
    match row(db, owner) {
        Ok(old) if old.state_hash.as_deref() == Some(hash.as_str()) => {
            return Err(ChallengeError::Invalid);
        }
        Ok(_) | Err(ChallengeError::Invalid) => {}
        Err(error) => return Err(error),
    }
    let phase = if binding.app.is_some() {
        "awaiting_installation"
    } else {
        "awaiting_manifest"
    };
    db.query_row("INSERT INTO native_github_setup_challenges(user_id,agent_id,generation,state_hash,issued_at,expires_at,phase,revision_hash,app_id) VALUES(?,?,1,?,?,?,?,?,?) ON CONFLICT(user_id,agent_id) DO UPDATE SET generation=generation+1,state_hash=excluded.state_hash,issued_at=excluded.issued_at,expires_at=excluded.expires_at,phase=excluded.phase,revision_hash=excluded.revision_hash,app_id=excluded.app_id,manifest_hash=NULL,installation_hash=NULL,manifest_result=NULL,installation_result=NULL,reservation=NULL RETURNING generation", params![owner.user,owner.agent,hash,now,expires,phase,binding.revision,binding.app], |r| r.get(0)).map_err(Into::into)
}
/// Tombstones keep generations monotonic across disconnect/recreate (setup ABA).
/// Call inside the same transaction as manual save or disconnect.
pub fn revoke(db: &Transaction<'_>, owner: Owner<'_>) -> Result<(), ChallengeError> {
    ensure_schema(db)?;
    db.execute("INSERT INTO native_github_setup_challenges(user_id,agent_id,generation,issued_at,expires_at,phase) VALUES(?,?,1,0,0,'revoked') ON CONFLICT(user_id,agent_id) DO UPDATE SET generation=generation+1,phase='revoked',revision_hash=NULL,app_id=NULL,manifest_hash=NULL,installation_hash=NULL,manifest_result=NULL,installation_result=NULL,reservation=NULL", params![owner.user,owner.agent])?;
    Ok(())
}
/// One bounded maintenance transaction; the partial index avoids scanning revoked
/// tombstones. Retain generations and the last nonce digest to prevent ABA/nonce
/// reissue; erase phase authority and public replay material.
/// Expiry never removes installed credentials or touches the token cache.
pub fn expire_batch(db: &Connection, now: i64, limit: u16) -> Result<usize, ChallengeError> {
    if now < 0 || !(1..=256).contains(&limit) {
        return Err(ChallengeError::Invalid);
    }
    ensure_schema(db)?;
    Ok(db.execute("UPDATE native_github_setup_challenges SET phase='revoked',revision_hash=NULL,app_id=NULL,manifest_hash=NULL,installation_hash=NULL,manifest_result=NULL,installation_result=NULL,reservation=NULL WHERE rowid IN (SELECT rowid FROM native_github_setup_challenges WHERE expires_at<=? AND phase!='revoked' ORDER BY expires_at LIMIT ?)", params![now,limit])?)
}
/// Explicit bounded sweep for existing callers; recurring hosts use expire_batch.
pub fn expire(db: &Connection, now: i64) -> Result<usize, ChallengeError> {
    expire_batch(db, now, 256)
}
fn transaction(db: &Connection) -> Result<Transaction<'_>, ChallengeError> {
    Ok(Transaction::new_unchecked(
        db,
        TransactionBehavior::Immediate,
    )?)
}
/// The binding callback reads credentials INSIDE the same write transaction as
/// reservation, including independent connections/processes. Signature parsing
/// remains a separate pure operation; a signed token without a row fails here.
pub fn reserve(
    db: &Connection,
    owner: Owner<'_>,
    state: &str,
    now: i64,
    phase: Phase,
    input: &str,
    binding: impl FnOnce(&Connection) -> Result<Binding, SourceError>,
) -> Result<Admission, ChallengeError> {
    // Reject external inputs before schema, hashing or SQL work.
    if input.is_empty()
        || input.len() > 8192
        || state.is_empty()
        || state.len() > 8192
        || owner.user.is_empty()
        || owner.user.len() > 8192
        || owner.agent.is_empty()
        || owner.agent.len() > 8192
    {
        return Err(ChallengeError::Invalid);
    }
    ensure_schema(db)?;
    let tx = transaction(db)?;
    let old = row(&tx, owner)?;
    if old.state_hash.as_deref() != Some(digest(state.as_bytes()).as_str()) {
        return Err(ChallengeError::Invalid);
    }
    valid(&old, now, &binding(&tx).map_err(ChallengeError::Apply)?)?;
    let hash = phase.operation_hash(input);
    let (previous, result) = match phase {
        Phase::Manifest => (&old.manifest_hash, &old.manifest_result),
        Phase::Installation => (&old.installation_hash, &old.installation_result),
    };
    if let Some(result) = result {
        if previous.as_deref() != Some(hash.as_str()) {
            return Err(ChallengeError::ReplayMismatch);
        }
        return Ok(Admission::Replay(serde_json::from_str(result)?));
    }
    if old.phase.ends_with("_reserved") || old.phase.ends_with("_uncertain") {
        return Err(ChallengeError::Uncertain);
    }
    if old.phase != phase.awaiting() {
        return Err(ChallengeError::WrongPhase);
    }
    let id = uuid::Uuid::new_v4().to_string();
    let sql = match phase {
        Phase::Manifest => {
            "UPDATE native_github_setup_challenges SET phase=?,manifest_hash=?,reservation=? WHERE user_id=? AND agent_id=? AND generation=?"
        }
        Phase::Installation => {
            "UPDATE native_github_setup_challenges SET phase=?,installation_hash=?,reservation=? WHERE user_id=? AND agent_id=? AND generation=?"
        }
    };
    tx.execute(
        sql,
        params![
            phase.reserved(),
            hash,
            id,
            owner.user,
            owner.agent,
            old.generation
        ],
    )?;
    tx.commit()?;
    Ok(Admission::Reserved(Reservation {
        user: owner.user.into(),
        agent: owner.agent.into(),
        generation: old.generation,
        id,
        phase,
    }))
}
fn reserved_row(
    db: &Connection,
    r: &Reservation,
    phase: &str,
    now: i64,
    binding: &Binding,
) -> Result<(), ChallengeError> {
    let old = row(
        db,
        Owner {
            user: &r.user,
            agent: &r.agent,
        },
    )?;
    if old.generation != r.generation
        || old.reservation.as_deref() != Some(&r.id)
        || old.phase != phase
    {
        return Err(ChallengeError::Stale);
    }
    valid(&old, now, binding)
}
impl Reservation {
    /// Only a still-held PRE-dispatch capability can release for a safe retry.
    pub fn release(self, db: &Connection) -> Result<(), ChallengeError> {
        let sql = match self.phase {
            Phase::Manifest => {
                "UPDATE native_github_setup_challenges SET phase=?,manifest_hash=NULL,reservation=NULL WHERE user_id=? AND agent_id=? AND generation=? AND reservation=? AND phase=?"
            }
            Phase::Installation => {
                "UPDATE native_github_setup_challenges SET phase=?,installation_hash=NULL,reservation=NULL WHERE user_id=? AND agent_id=? AND generation=? AND reservation=? AND phase=?"
            }
        };
        let changed = db.execute(
            sql,
            params![
                self.phase.awaiting(),
                self.user,
                self.agent,
                self.generation,
                self.id,
                self.phase.reserved()
            ],
        )?;
        if changed != 1 {
            return Err(ChallengeError::Stale);
        }
        Ok(())
    }
    /// Persist uncertainty before invoking the host effect. Dropping this future,
    /// shutdown, transport failure and process crash cannot authorize a retry.
    pub fn dispatch(
        self,
        db: &Connection,
        now: i64,
        binding: impl FnOnce(&Connection) -> Result<Binding, SourceError>,
    ) -> Result<Dispatched, ChallengeError> {
        let tx = transaction(db)?;
        reserved_row(
            &tx,
            &self,
            self.phase.reserved(),
            now,
            &binding(&tx).map_err(ChallengeError::Apply)?,
        )?;
        tx.execute("UPDATE native_github_setup_challenges SET phase=? WHERE user_id=? AND agent_id=? AND generation=? AND reservation=?",params![self.phase.uncertain(),self.user,self.agent,self.generation,self.id])?;
        tx.commit()?;
        Ok(Dispatched(self))
    }
}
impl Dispatched {
    /// Commit local effects, post-effect binding and the exact bounded PUBLIC
    /// replay result atomically. Callers must return public data, never secrets.
    /// Failure rolls back local effects while retaining durable uncertainty.
    pub fn complete(
        self,
        db: &Connection,
        now: i64,
        binding: impl Fn(&Connection) -> Result<Binding, SourceError>,
        apply: impl FnOnce(&Connection) -> Result<Value, SourceError>,
    ) -> Result<Value, ChallengeError> {
        let r = self.0;
        let tx = transaction(db)?;
        let before = binding(&tx).map_err(ChallengeError::Apply)?;
        reserved_row(&tx, &r, r.phase.uncertain(), now, &before)?;
        let result = apply(&tx).map_err(ChallengeError::Apply)?;
        let encoded = serde_json::to_string(&result)?;
        if !result.is_object() || encoded.len() > MAX_REPLAY_BYTES {
            return Err(ChallengeError::InvalidReplay);
        }
        let after = binding(&tx).map_err(ChallengeError::Apply)?;
        if after.app.is_none() || matches!(r.phase, Phase::Installation) && after.app != before.app
        {
            return Err(ChallengeError::BindingChanged);
        }
        let (phase, sql) = match r.phase {
            Phase::Manifest => (
                "awaiting_installation",
                "UPDATE native_github_setup_challenges SET phase=?,revision_hash=?,app_id=?,manifest_result=?,reservation=NULL WHERE user_id=? AND agent_id=? AND generation=? AND reservation=?",
            ),
            Phase::Installation => (
                "complete",
                "UPDATE native_github_setup_challenges SET phase=?,revision_hash=?,app_id=?,installation_result=?,reservation=NULL WHERE user_id=? AND agent_id=? AND generation=? AND reservation=?",
            ),
        };
        // The apply closure may call other canonical methods. Revocation/new
        // setup in that closure must still fence this commit, never resurrect it.
        let changed = tx.execute(
            sql,
            params![
                phase,
                after.revision,
                after.app,
                encoded,
                r.user,
                r.agent,
                r.generation,
                r.id
            ],
        )?;
        if changed != 1 {
            return Err(ChallengeError::Stale);
        }
        tx.commit()?;
        Ok(result)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        db,
        services::{agent_github_apps::AgentGithubAppService, user_secrets::UserSecretService},
    };
    use serde_json::json;
    use std::{
        path::PathBuf,
        sync::{Arc, Barrier},
        time::Duration,
    };
    const NOW: i64 = 1_700_000_000_123;
    const OWNER: Owner<'static> = Owner {
        user: "u",
        agent: "a",
    };
    fn database() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch("CREATE TABLE fixture_credential(data TEXT NOT NULL); INSERT INTO fixture_credential VALUES('{\"revision\":1,\"app\":null}')").unwrap();
        c
    }
    fn binding(c: &Connection) -> Result<Binding, SourceError> {
        let raw: String = c.query_row("SELECT data FROM fixture_credential", [], |r| r.get(0))?;
        let v: Value = serde_json::from_str(&raw)?;
        Ok(Binding::new(&v, v["app"].as_str())?)
    }
    fn set(c: &Connection, rev: i64, app: Option<&str>) {
        c.execute(
            "UPDATE fixture_credential SET data=?",
            [json!({"revision":rev,"app":app}).to_string()],
        )
        .unwrap();
    }
    fn issue_at(c: &Connection, state: &str, now: i64) -> i64 {
        let tx = transaction(c).unwrap();
        let generation = issue(&tx, OWNER, state, now, &binding(&tx).unwrap()).unwrap();
        tx.commit().unwrap();
        generation
    }
    fn revoke_owner(c: &Connection) {
        let tx = transaction(c).unwrap();
        revoke(&tx, OWNER).unwrap();
        tx.commit().unwrap();
    }
    fn reserve_phase(
        c: &Connection,
        state: &str,
        now: i64,
        phase: Phase,
        input: &str,
    ) -> Result<Admission, ChallengeError> {
        reserve(c, OWNER, state, now, phase, input, binding)
    }
    fn reservation(c: &Connection, state: &str, phase: Phase, input: &str) -> Reservation {
        match reserve_phase(c, state, NOW, phase, input).unwrap() {
            Admission::Reserved(r) => r,
            Admission::Replay(_) => panic!("expected reservation"),
        }
    }
    fn manifest(c: &Connection, state: &str) -> Value {
        reservation(c,state,Phase::Manifest,"code").dispatch(c,NOW,binding).unwrap().complete(c,NOW,binding,|c| {
            set(c,2,Some("42"));Ok(json!({"connection":{"appId":"42"},"installUrl":"https://github.com/apps/fixture/installations/new"}))
        }).unwrap()
    }
    fn files(label: &str) -> PathBuf {
        let p = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../.jait/artifacts/gateway-rust/agent-github-challenge/unit")
            .join(label)
            .join(uuid::Uuid::new_v4().to_string());
        std::fs::create_dir_all(&p).unwrap();
        p
    }
    #[test]
    fn absolute_ttl_includes_issue_and_excludes_deadline_and_clock_rollback() {
        for (offset, allowed) in [
            (0, true),
            (TTL_MS - 1, true),
            (-1, false),
            (TTL_MS, false),
            (TTL_MS + 1, false),
        ] {
            let c = database();
            issue_at(&c, "state", NOW);
            let result = reserve_phase(&c, "state", NOW + offset, Phase::Manifest, "code");
            if allowed {
                assert!(matches!(result, Ok(Admission::Reserved(_))));
            } else {
                assert!(matches!(result, Err(ChallengeError::Expired)));
            }
        }
        let c = database();
        assert!(
            issue(
                &transaction(&c).unwrap(),
                OWNER,
                "s",
                i64::MAX,
                &binding(&c).unwrap()
            )
            .is_err()
        );
    }
    #[test]
    fn state_owner_and_credential_bindings_fail_before_reservation() {
        let c = database();
        issue_at(&c, "state", NOW);
        assert!(matches!(
            reserve_phase(&c, "legacy-signed-token", NOW, Phase::Manifest, "code"),
            Err(ChallengeError::Invalid)
        ));
        assert!(matches!(
            reserve(
                &c,
                Owner {
                    user: "other",
                    agent: "a"
                },
                "state",
                NOW,
                Phase::Manifest,
                "code",
                binding
            ),
            Err(ChallengeError::Invalid)
        ));
        set(&c, 2, None);
        assert!(matches!(
            reserve_phase(&c, "state", NOW, Phase::Manifest, "code"),
            Err(ChallengeError::BindingChanged)
        ));
        assert_eq!(row(&c, OWNER).unwrap().phase, "awaiting_manifest");
    }
    #[test]
    fn two_stage_exact_replays_are_results_without_apply_and_inputs_are_bound() {
        let c = database();
        issue_at(&c, "state", NOW);
        let converted = manifest(&c, "state");
        assert_eq!(row(&c, OWNER).unwrap().expires, NOW + TTL_MS);
        match reserve_phase(&c, "state", NOW + TTL_MS - 1, Phase::Manifest, "code").unwrap() {
            Admission::Replay(v) => assert_eq!(v, converted),
            _ => panic!("must replay"),
        }
        assert!(matches!(
            reserve_phase(&c, "state", NOW, Phase::Manifest, "different-code"),
            Err(ChallengeError::ReplayMismatch)
        ));
        let attached = reservation(&c, "state", Phase::Installation, "7")
            .dispatch(&c, NOW, binding)
            .unwrap()
            .complete(&c, NOW, binding, |c| {
                set(c, 3, Some("42"));
                Ok(json!({"appId":"42","installationId":"7","status":"connected"}))
            })
            .unwrap();
        match reserve_phase(&c, "state", NOW, Phase::Installation, "7").unwrap() {
            Admission::Replay(v) => assert_eq!(v, attached),
            _ => panic!("must replay"),
        }
        assert!(matches!(
            reserve_phase(&c, "state", NOW, Phase::Installation, "8"),
            Err(ChallengeError::ReplayMismatch)
        ));
        match reserve_phase(&c, "state", NOW, Phase::Manifest, "code").unwrap() {
            Admission::Replay(v) => assert_eq!(v, converted),
            _ => panic!("must replay conversion"),
        }
        assert!(matches!(
            reserve_phase(&c, "state", NOW + TTL_MS, Phase::Installation, "7"),
            Err(ChallengeError::Expired)
        ));
    }
    #[test]
    fn pre_dispatch_release_allows_retry_but_abandoned_or_dispatched_never_does() {
        let c = database();
        issue_at(&c, "state", NOW);
        reservation(&c, "state", Phase::Manifest, "code")
            .release(&c)
            .unwrap();
        let abandoned = reservation(&c, "state", Phase::Manifest, "other-code");
        drop(abandoned);
        assert!(matches!(
            reserve_phase(&c, "state", NOW, Phase::Manifest, "other-code"),
            Err(ChallengeError::Uncertain)
        ));
        issue_at(&c, "state2", NOW);
        let dispatched = reservation(&c, "state2", Phase::Manifest, "code")
            .dispatch(&c, NOW, binding)
            .unwrap();
        drop(dispatched);
        assert_eq!(row(&c, OWNER).unwrap().phase, "manifest_uncertain");
        assert!(matches!(
            reserve_phase(&c, "state2", NOW, Phase::Manifest, "code"),
            Err(ChallengeError::Uncertain)
        ));
    }
    #[test]
    fn dispatch_rechecks_binding_and_generation_before_remote_authority() {
        let c = database();
        issue_at(&c, "state", NOW);
        let r = reservation(&c, "state", Phase::Manifest, "code");
        set(&c, 2, None);
        assert!(matches!(
            r.dispatch(&c, NOW, binding),
            Err(ChallengeError::BindingChanged)
        ));
        set(&c, 1, None);
        issue_at(&c, "state2", NOW);
        let r = reservation(&c, "state2", Phase::Manifest, "code");
        revoke_owner(&c);
        issue_at(&c, "state3", NOW);
        assert!(matches!(
            r.dispatch(&c, NOW, binding),
            Err(ChallengeError::Stale)
        ));
    }
    #[test]
    fn late_commit_after_new_setup_or_revoke_never_runs_local_effect() {
        for replace in [false, true] {
            let c = database();
            issue_at(&c, "state", NOW);
            let r = reservation(&c, "state", Phase::Manifest, "code")
                .dispatch(&c, NOW, binding)
                .unwrap();
            revoke_owner(&c);
            if replace {
                issue_at(&c, "state2", NOW);
            }
            let result = r.complete(&c, NOW, binding, |_| panic!("stale apply must not run"));
            assert!(matches!(result, Err(ChallengeError::Stale)));
            assert_eq!(
                row(&c, OWNER).unwrap().phase,
                if replace {
                    "awaiting_manifest"
                } else {
                    "revoked"
                }
            );
        }
    }
    #[test]
    fn expiry_and_direct_credential_edits_fence_local_completion() {
        for expired in [true, false] {
            let c = database();
            issue_at(&c, "state", NOW);
            let r = reservation(&c, "state", Phase::Manifest, "code")
                .dispatch(&c, NOW, binding)
                .unwrap();
            if !expired {
                set(&c, 2, None);
            }
            let result = r.complete(
                &c,
                if expired { NOW + TTL_MS } else { NOW },
                binding,
                |_| panic!("fenced apply must not run"),
            );
            assert!(matches!(
                result,
                Err(ChallengeError::Expired) | Err(ChallengeError::BindingChanged)
            ));
            assert_eq!(row(&c, OWNER).unwrap().phase, "manifest_uncertain");
        }
    }
    #[test]
    fn failed_local_apply_rolls_back_credentials_and_keeps_uncertain() {
        let c = database();
        issue_at(&c, "state", NOW);
        let r = reservation(&c, "state", Phase::Manifest, "code")
            .dispatch(&c, NOW, binding)
            .unwrap();
        assert!(
            r.complete(&c, NOW, binding, |c| {
                set(c, 2, Some("42"));
                Err(std::io::Error::other("fixture failure").into())
            })
            .is_err()
        );
        assert!(binding(&c).unwrap().app.is_none());
        assert_eq!(row(&c, OWNER).unwrap().phase, "manifest_uncertain");
    }
    #[test]
    fn changed_app_and_oversize_replay_roll_back_installation_commit() {
        for changed_app in [true, false] {
            let c = database();
            issue_at(&c, "state", NOW);
            manifest(&c, "state");
            let r = reservation(&c, "state", Phase::Installation, "7")
                .dispatch(&c, NOW, binding)
                .unwrap();
            let result = r.complete(&c, NOW, binding, |c| {
                set(c, 3, Some(if changed_app { "99" } else { "42" }));
                Ok(if changed_app {
                    json!({"ok":true})
                } else {
                    json!({"large":"x".repeat(MAX_REPLAY_BYTES)})
                })
            });
            assert!(matches!(
                result,
                Err(ChallengeError::BindingChanged) | Err(ChallengeError::InvalidReplay)
            ));
            assert_eq!(binding(&c).unwrap().app.as_deref(), Some("42"));
            assert_eq!(row(&c, OWNER).unwrap().phase, "installation_uncertain");
        }
    }
    #[test]
    fn retained_generation_and_expiry_cleanup_do_not_recreate_authority() {
        let c = database();
        assert_eq!(issue_at(&c, "state", NOW), 1);
        revoke_owner(&c);
        assert!(matches!(
            reserve_phase(&c, "state", NOW, Phase::Manifest, "code"),
            Err(ChallengeError::Invalid)
        ));
        assert!(
            issue(
                &transaction(&c).unwrap(),
                OWNER,
                "state",
                NOW,
                &binding(&c).unwrap()
            )
            .is_err()
        );
        assert_eq!(issue_at(&c, "state2", NOW), 3);
        manifest(&c, "state2");
        assert_eq!(expire(&c, NOW + TTL_MS - 1).unwrap(), 0);
        assert_eq!(expire(&c, NOW + TTL_MS).unwrap(), 1);
        assert_eq!(expire(&c, NOW + TTL_MS).unwrap(), 0);
        let r = row(&c, OWNER).unwrap();
        assert!(r.manifest_result.is_none());
        assert!(r.revision.is_none());
        assert_eq!(r.generation, 3);
        assert!(
            issue(
                &transaction(&c).unwrap(),
                OWNER,
                "state2",
                NOW + TTL_MS,
                &binding(&c).unwrap()
            )
            .is_err()
        );
        assert_eq!(issue_at(&c, "state3", NOW + TTL_MS), 4);
    }
    #[test]
    fn sqlite_rows_do_not_persist_raw_codes_state_or_credential_snapshots() {
        let c = database();
        let raw_state = "sensitive signed token";
        let raw_code = "sensitive manifest code";
        issue_at(&c, raw_state, NOW);
        let _r = reservation(&c, raw_state, Phase::Manifest, raw_code);
        let r = row(&c, OWNER).unwrap();
        assert_ne!(r.state_hash.as_deref(), Some(raw_state));
        assert_ne!(r.manifest_hash.as_deref(), Some(raw_code));
        assert_eq!(
            r.state_hash.as_deref(),
            Some(digest(raw_state.as_bytes()).as_str())
        );
        assert_eq!(r.revision.unwrap().len(), 64);
    }
    #[test]
    fn independent_connections_race_one_reservation_while_other_owner_progresses() {
        let path = files("race").join("authority.sqlite");
        let c = Connection::open(&path).unwrap();
        c.execute_batch("CREATE TABLE fixture_credential(data TEXT NOT NULL);INSERT INTO fixture_credential VALUES('{\"revision\":1,\"app\":null}')").unwrap();
        issue_at(&c, "state", NOW);
        let barrier = Arc::new(Barrier::new(2));
        let mut threads = vec![];
        for _ in 0..2 {
            let path = path.clone();
            let barrier = barrier.clone();
            threads.push(std::thread::spawn(move || {
                let c = Connection::open(path).unwrap();
                c.busy_timeout(Duration::from_secs(3)).unwrap();
                barrier.wait();
                match reserve_phase(&c, "state", NOW, Phase::Manifest, "code") {
                    Ok(Admission::Reserved(_)) => true,
                    Err(ChallengeError::Uncertain) => false,
                    _ => panic!("unexpected race outcome"),
                }
            }));
        }
        assert_eq!(
            threads
                .into_iter()
                .map(|t| usize::from(t.join().unwrap()))
                .sum::<usize>(),
            1
        );
        let other = Owner {
            user: "u",
            agent: "b",
        };
        let tx = transaction(&c).unwrap();
        issue(&tx, other, "other", NOW, &binding(&tx).unwrap()).unwrap();
        tx.commit().unwrap();
        assert!(matches!(
            reserve(&c, other, "other", NOW, Phase::Manifest, "code", binding),
            Ok(Admission::Reserved(_))
        ));
    }
    #[test]
    fn cross_process_reservation_child() {
        let Ok(path) = std::env::var("JAIT_GITHUB_CHALLENGE_TEST_DB") else {
            return;
        };
        let c = Connection::open(path).unwrap();
        assert!(matches!(
            reserve_phase(&c, "state", NOW, Phase::Manifest, "code"),
            Err(ChallengeError::Uncertain)
        ));
    }
    #[test]
    fn restart_and_separate_process_never_retry_an_abandoned_dispatch() {
        let dir = files("restart");
        let path = dir.join("authority.sqlite");
        {
            let c = Connection::open(&path).unwrap();
            c.execute_batch("CREATE TABLE fixture_credential(data TEXT NOT NULL);INSERT INTO fixture_credential VALUES('{\"revision\":1,\"app\":null}')").unwrap();
            issue_at(&c, "state", NOW);
            let _lost = reservation(&c, "state", Phase::Manifest, "code")
                .dispatch(&c, NOW, binding)
                .unwrap();
        }
        let child = std::process::Command::new(std::env::current_exe().unwrap())
            .args([
                "--exact",
                "services::agent_github_challenge::tests::cross_process_reservation_child",
                "--nocapture",
            ])
            .env("JAIT_GITHUB_CHALLENGE_TEST_DB", &path)
            .output()
            .unwrap();
        let stdout = String::from_utf8_lossy(&child.stdout);
        assert!(
            stdout.contains("cross_process_reservation_child ... ok")
                && stdout.contains("1 passed"),
            "child must run the real contract"
        );
        std::fs::write(dir.join("child.log"), [child.stdout, child.stderr].concat()).unwrap();
        assert!(child.status.success());
        let c = Connection::open(path).unwrap();
        assert_eq!(row(&c, OWNER).unwrap().phase, "manifest_uncertain");
    }
    #[test]
    fn replay_write_failure_rolls_back_local_effects_and_retains_uncertain() {
        let c = database();
        issue_at(&c, "state", NOW);
        let r = reservation(&c, "state", Phase::Manifest, "code")
            .dispatch(&c, NOW, binding)
            .unwrap();
        c.execute_batch("CREATE TRIGGER reject_replay BEFORE UPDATE ON native_github_setup_challenges WHEN NEW.phase='awaiting_installation' BEGIN SELECT RAISE(ABORT,'fixture replay write rejected');END").unwrap();
        assert!(
            r.complete(&c, NOW, binding, |c| {
                set(c, 2, Some("42"));
                Ok(json!({"ok":true}))
            })
            .is_err()
        );
        assert!(binding(&c).unwrap().app.is_none());
        assert_eq!(row(&c, OWNER).unwrap().phase, "manifest_uncertain");
    }
    #[test]
    fn generation_overflow_cannot_wrap_or_recreate_revoked_authority() {
        let c = database();
        issue_at(&c, "state", NOW);
        c.execute(
            "UPDATE native_github_setup_challenges SET generation=?",
            [i64::MAX],
        )
        .unwrap();
        let tx = transaction(&c).unwrap();
        assert!(revoke(&tx, OWNER).is_err());
        tx.rollback().unwrap();
        assert_eq!(row(&c, OWNER).unwrap().generation, i64::MAX);
        let tx = transaction(&c).unwrap();
        assert!(issue(&tx, OWNER, "new-state", NOW, &binding(&tx).unwrap()).is_err());
        tx.rollback().unwrap();
        assert_eq!(row(&c, OWNER).unwrap().state_hash, Some(digest(b"state")));
    }
    #[test]
    fn reservation_requires_signed_state_row_not_connection_manifest_projection() {
        let (c, s) = service_database();
        let token = s.sign_state("u", "a").unwrap();
        ensure_schema(&c).unwrap();
        assert_eq!(s.read_state(&token), json!({"userId":"u","agentId":"a"}));
        assert!(matches!(
            reserve(&c, OWNER, &token, NOW, Phase::Manifest, "code", |_| Ok(
                Binding::new(&Value::Null, None)?
            )),
            Err(ChallengeError::Invalid)
        ));
        assert!(s.get(&c, "u", "a").unwrap().is_null());
    }
    fn service_database() -> (Connection, AgentGithubAppService) {
        let c = Connection::open_in_memory().unwrap();
        db::migrate_database(&c).unwrap();
        let service = AgentGithubAppService::new(
            Some(UserSecretService::with_clock("test-key", Arc::new(|| NOW))),
            Some("test-state-key".into()),
            Arc::new(|| NOW),
        );
        (c, service)
    }
    fn begin(c: &Connection, s: &AgentGithubAppService) -> String {
        s.begin_setup(c, "u", "a", &json!({"appName":"fixture"}))
            .unwrap()
            .state
    }
    #[test]
    fn canonical_setup_issues_fresh_owner_bound_generation_and_revokes_on_disconnect() {
        let (c, s) = service_database();
        let one = begin(&c, &s);
        let r = row(&c, OWNER).unwrap();
        assert_eq!(r.generation, 1);
        assert_eq!(r.state_hash, Some(digest(one.as_bytes())));
        assert_eq!(r.issued, NOW);
        assert_eq!(r.expires, NOW + TTL_MS);
        let two = begin(&c, &s);
        assert_ne!(one, two);
        assert_eq!(row(&c, OWNER).unwrap().generation, 2);
        assert!(s.read_state(&one).is_object());
        s.disconnect(&c, "u", "a").unwrap();
        assert_eq!(row(&c, OWNER).unwrap().phase, "revoked");
        assert_eq!(row(&c, OWNER).unwrap().generation, 3);
        assert!(s.get(&c, "u", "a").unwrap().is_null());
        begin(&c, &s);
        assert_eq!(row(&c, OWNER).unwrap().generation, 4);
    }
    #[test]
    fn canonical_manual_save_revokes_and_invalid_manual_save_preserves_authority() {
        let (c, s) = service_database();
        begin(&c, &s);
        assert!(
            s.save_manual(
                &c,
                "u",
                "a",
                &json!({"appId":"bad","privateKey":"PRIVATE KEY"})
            )
            .is_err()
        );
        assert_eq!(row(&c, OWNER).unwrap().generation, 1);
        s.save_manual(
            &c,
            "u",
            "a",
            &json!({"appId":"42","privateKey":"PRIVATE KEY fixture"}),
        )
        .unwrap();
        assert_eq!(row(&c, OWNER).unwrap().phase, "revoked");
        begin(&c, &s);
        assert_eq!(row(&c, OWNER).unwrap().phase, "awaiting_installation");
        assert_eq!(row(&c, OWNER).unwrap().app.as_deref(), Some("42"));
    }
    #[test]
    fn canonical_issue_failure_rolls_back_connection_write() {
        let (c, s) = service_database();
        ensure_schema(&c).unwrap();
        c.execute_batch("CREATE TRIGGER reject_challenge BEFORE INSERT ON native_github_setup_challenges BEGIN SELECT RAISE(ABORT,'fixture issue rejected');END").unwrap();
        assert!(
            s.begin_setup(&c, "u", "a", &json!({"appName":"fixture"}))
                .is_err()
        );
        assert!(s.get(&c, "u", "a").unwrap().is_null());
    }
    #[test]
    fn canonical_credential_failure_rolls_back_secret_and_revocation() {
        let (c, s) = service_database();
        s.save_manual(
            &c,
            "u",
            "a",
            &json!({"appId":"42","privateKey":"PRIVATE KEY original"}),
        )
        .unwrap();
        begin(&c, &s);
        let generation = row(&c, OWNER).unwrap().generation;
        let encrypted: String = c
            .query_row(
                "SELECT encrypted_value FROM user_secrets WHERE key='agent:a'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        c.execute_batch("CREATE TRIGGER reject_connection BEFORE UPDATE ON agent_github_apps BEGIN SELECT RAISE(ABORT,'fixture write rejected');END").unwrap();
        assert!(
            s.save_manual(
                &c,
                "u",
                "a",
                &json!({"appId":"99","privateKey":"PRIVATE KEY replacement"})
            )
            .is_err()
        );
        assert_eq!(row(&c, OWNER).unwrap().generation, generation);
        assert_eq!(row(&c, OWNER).unwrap().phase, "awaiting_installation");
        assert_eq!(s.get(&c, "u", "a").unwrap()["appId"], "42");
        let after: String = c
            .query_row(
                "SELECT encrypted_value FROM user_secrets WHERE key='agent:a'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(encrypted, after);
    }
}
