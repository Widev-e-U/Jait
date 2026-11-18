use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Deserializer, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use subtle::ConstantTimeEq;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct UserRecord {
    pub id: String,
    pub username: String,
    pub created_at: String,
    pub updated_at: String,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct UserSettings {
    pub user_id: String,
    pub theme: String,
    pub api_keys: BTreeMap<String, String>,
    pub disabled_tools: Vec<String>,
    pub stt_provider: String,
    pub chat_streaming_action: String,
    pub chat_provider: String,
    pub jait_backend: String,
    pub recent_models: Vec<String>,
    pub selected_model: Option<String>,
    pub reasoning_effort: Option<String>,
    pub project_picker_path: Option<String>,
    pub project_picker_node_id: Option<String>,
    pub updated_at: String,
}

/// Distinguish an omitted patch field from an explicit JSON null.
#[derive(Debug, Clone, Default)]
pub enum Patch<T> {
    #[default]
    Missing,
    Set(T),
}
impl<'de, T: Deserialize<'de>> Deserialize<'de> for Patch<T> {
    fn deserialize<D: Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        Ok(Self::Set(T::deserialize(d)?))
    }
}
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct UserSettingsPatch {
    pub theme: Option<String>,
    pub api_keys: Option<BTreeMap<String, String>>,
    pub disabled_tools: Option<Vec<String>>,
    pub stt_provider: Option<String>,
    pub chat_streaming_action: Option<String>,
    pub chat_provider: Option<String>,
    pub jait_backend: Option<String>,
    pub recent_models: Option<Vec<String>>,
    pub selected_model: Patch<Option<String>>,
    pub reasoning_effort: Patch<Option<String>>,
    pub project_picker_path: Patch<Option<String>>,
    pub project_picker_node_id: Patch<Option<String>>,
}
fn normalize_username(value: &str) -> String {
    crate::text::js_trim(value).to_lowercase()
}
fn strings(value: Option<String>) -> Vec<String> {
    value
        .and_then(|v| serde_json::from_str::<Value>(&v).ok())
        .and_then(|v| v.as_array().cloned())
        .unwrap_or_default()
        .into_iter()
        .filter_map(|v| v.as_str().map(String::from))
        .collect()
}
fn api_keys(value: Option<String>) -> BTreeMap<String, String> {
    match value.and_then(|v| serde_json::from_str::<Value>(&v).ok()) {
        Some(Value::Object(v)) => v
            .into_iter()
            .filter_map(|(k, v)| v.as_str().map(|v| (k, v.into())))
            .collect(),
        Some(Value::Array(v)) => v
            .into_iter()
            .enumerate()
            .filter_map(|(k, v)| v.as_str().map(|v| (k.to_string(), v.into())))
            .collect(),
        _ => BTreeMap::new(),
    }
}
fn fallback(value: String, default: &str) -> String {
    if value.is_empty() {
        default.into()
    } else {
        value
    }
}
fn row_user(row: &rusqlite::Row<'_>) -> rusqlite::Result<UserRecord> {
    Ok(UserRecord {
        id: row.get(0)?,
        username: row.get(1)?,
        created_at: row.get(2)?,
        updated_at: row.get(3)?,
    })
}
type Error = Box<dyn std::error::Error + Send + Sync>;
fn random<const N: usize>() -> Result<[u8; N], Error> {
    let mut value = [0u8; N];
    getrandom::fill(&mut value)?;
    Ok(value)
}
pub fn hash_password(password: &str) -> Result<String, Error> {
    let salt = hex::encode(random::<16>()?);
    let mut digest = [0u8; 64];
    scrypt::scrypt(
        password.as_bytes(),
        salt.as_bytes(),
        &scrypt::Params::new(14, 8, 1, 64).expect("fixed scrypt parameters"),
        &mut digest,
    )
    .expect("64-byte scrypt output");
    Ok(format!("scrypt${salt}${}", hex::encode(digest)))
}
pub fn verify_password_hash(password: &str, encoded: &str) -> bool {
    let mut fields = encoded.split('$');
    if fields.next() != Some("scrypt") {
        return false;
    }
    let Some(salt) = fields.next().filter(|v| !v.is_empty()) else {
        return false;
    };
    let Some(encoded_digest) = fields.next() else {
        return false;
    };
    // New hashes always contain 64 digest bytes. Reject corrupt imported hashes
    // rather than treating an empty hex decode as a successful zero-byte comparison.
    let Ok(expected) = hex::decode(encoded_digest) else {
        return false;
    };
    if expected.len() != 64 {
        return false;
    }
    let mut actual = [0u8; 64];
    if scrypt::scrypt(
        password.as_bytes(),
        salt.as_bytes(),
        &scrypt::Params::new(14, 8, 1, 64).expect("fixed scrypt parameters"),
        &mut actual,
    )
    .is_err()
    {
        return false;
    }
    bool::from(actual.ct_eq(expected.as_slice()))
}

pub struct UserService<'a> {
    db: &'a Connection,
    fixed_time: Option<&'a str>,
}
impl<'a> UserService<'a> {
    pub fn new(db: &'a Connection) -> Self {
        Self {
            db,
            fixed_time: None,
        }
    }
    pub fn with_time(db: &'a Connection, now: &'a str) -> Self {
        Self {
            db,
            fixed_time: Some(now),
        }
    }
    fn now(&self) -> rusqlite::Result<String> {
        self.fixed_time
            .map(|v| Ok(v.to_string()))
            .unwrap_or_else(|| {
                self.db
                    .query_row("SELECT strftime('%Y-%m-%dT%H:%M:%fZ','now')", [], |r| {
                        r.get(0)
                    })
            })
    }
    pub fn is_owner(&self, user_id: &str) -> rusqlite::Result<bool> {
        Ok(self
            .db
            .query_row(
                "SELECT id FROM users ORDER BY created_at ASC,id ASC LIMIT 1",
                [],
                |r| r.get::<_, String>(0),
            )
            .optional()?
            .as_deref()
            == Some(user_id))
    }
    pub fn count_users(&self) -> rusqlite::Result<u64> {
        self.db.query_row("SELECT count(*) FROM users", [], |r| {
            r.get::<_, i64>(0).map(|n| n as u64)
        })
    }
    pub fn find_by_id(&self, id: &str) -> rusqlite::Result<Option<UserRecord>> {
        self.db
            .query_row(
                "SELECT id,username,created_at,updated_at FROM users WHERE id=?",
                [id],
                row_user,
            )
            .optional()
    }
    pub fn find_by_username(&self, name: &str) -> rusqlite::Result<Option<UserRecord>> {
        self.db
            .query_row(
                "SELECT id,username,created_at,updated_at FROM users WHERE username=?",
                [normalize_username(name)],
                row_user,
            )
            .optional()
    }
    pub fn create_user(&self, username: &str, password: &str) -> Result<UserRecord, Error> {
        self.create_user_with_hash(username, &hash_password(password)?)
    }
    /// Hash derivation belongs on the bounded CPU lane before this database operation.
    pub(crate) fn create_user_with_hash(
        &self,
        username: &str,
        password_hash: &str,
    ) -> Result<UserRecord, Error> {
        let username = normalize_username(username);
        let now = self.now()?;
        let id = crate::db::identifiers::uuidv7().to_string();
        self.db.execute(
            "INSERT INTO users(id,username,password_hash,created_at,updated_at) VALUES(?,?,?,?,?)",
            params![id, username, password_hash, now, now],
        )?;
        self.db.execute("INSERT INTO user_settings(user_id,theme,api_keys,stt_provider,chat_streaming_action,chat_provider,jait_backend,project_picker_path,project_picker_node_id,updated_at) VALUES(?,'system','{}','whisper','steer','jait','openai',NULL,NULL,?)",params![id,now])?;
        Ok(UserRecord {
            id,
            username,
            created_at: now.clone(),
            updated_at: now,
        })
    }
    pub fn verify_credentials(
        &self,
        username: &str,
        password: &str,
    ) -> rusqlite::Result<Option<UserRecord>> {
        let Some(user) = self.find_by_username(username)? else {
            return Ok(None);
        };
        let encoded: String = self.db.query_row(
            "SELECT password_hash FROM users WHERE id=?",
            [&user.id],
            |r| r.get(0),
        )?;
        Ok(verify_password_hash(password, &encoded).then_some(user))
    }
    pub fn create_invitation(&self, user_id: &str) -> Result<Option<String>, Error> {
        if !self.is_owner(user_id)? {
            return Ok(None);
        }
        let token = URL_SAFE_NO_PAD.encode(random::<24>()?);
        let hash = hex::encode(Sha256::digest(token.as_bytes()));
        let expiry: String = self.db.query_row(
            "SELECT strftime('%Y-%m-%dT%H:%M:%fZ',?,'+24 hours')",
            [self.now()?],
            |r| r.get(0),
        )?;
        self.db.execute(
            "INSERT INTO account_invitations(token_hash,created_by,expires_at) VALUES(?,?,?)",
            params![hash, user_id, expiry],
        )?;
        Ok(Some(token))
    }
    pub fn consume_invitation(&self, token: &str) -> rusqlite::Result<bool> {
        let hash = hex::encode(Sha256::digest(token.as_bytes()));
        Ok(self.db.execute(
            "DELETE FROM account_invitations WHERE token_hash=? AND expires_at>?",
            params![hash, self.now()?],
        )? > 0)
    }
    pub fn get_settings(&self, user_id: &str) -> rusqlite::Result<UserSettings> {
        let row=self.db.query_row("SELECT theme,api_keys,disabled_tools,stt_provider,chat_streaming_action,chat_provider,jait_backend,recent_models,selected_model,reasoning_effort,project_picker_path,project_picker_node_id,updated_at FROM user_settings WHERE user_id=?",[user_id],|r|{
            let stt:String=r.get(3)?;
            let action:String=r.get(4)?;
            let reasoning:Option<String>=r.get(9)?;
            Ok(UserSettings{user_id:user_id.into(),theme:fallback(r.get(0)?,"system"),api_keys:api_keys(r.get(1)?),
                disabled_tools:strings(r.get(2)?),stt_provider:if ["gpt","elevenlabs","wyoming"].contains(&stt.as_str()){stt}else{"whisper".into()},
                chat_streaming_action:if ["steer","queue","thread"].contains(&action.as_str()){action}else{"steer".into()},
                chat_provider:fallback(r.get(5)?,"jait"),jait_backend:fallback(r.get(6)?,"openai"),recent_models:strings(r.get(7)?),
                selected_model:r.get(8)?,reasoning_effort:reasoning.filter(|s|["minimal","low","medium","high"].contains(&s.as_str())),
                project_picker_path:r.get(10)?,project_picker_node_id:r.get(11)?,updated_at:r.get(12)?})
        }).optional()?;
        if let Some(row) = row {
            return Ok(row);
        }
        let now = self.now()?;
        self.db.execute("INSERT INTO user_settings(user_id,theme,api_keys,disabled_tools,stt_provider,chat_streaming_action,chat_provider,jait_backend,recent_models,updated_at) VALUES(?,'system','{}','[]','whisper','steer','jait','openai','[]',?)",params![user_id,now])?;
        self.get_settings(user_id)
    }
    pub fn update_settings(
        &self,
        user_id: &str,
        patch: UserSettingsPatch,
    ) -> rusqlite::Result<UserSettings> {
        let mut s = self.get_settings(user_id)?;
        macro_rules! update {
            ($($field:ident),*)=>{$(if let Some(v)=patch.$field {s.$field=v;})*};
        }
        update!(
            theme,
            api_keys,
            disabled_tools,
            stt_provider,
            chat_streaming_action,
            chat_provider,
            jait_backend,
            recent_models
        );
        macro_rules! nullable {
            ($($field:ident),*)=>{$(if let Patch::Set(v)=patch.$field {s.$field=v;})*};
        }
        nullable!(
            selected_model,
            reasoning_effort,
            project_picker_path,
            project_picker_node_id
        );
        self.db.execute("UPDATE user_settings SET theme=?,api_keys=?,disabled_tools=?,stt_provider=?,chat_streaming_action=?,chat_provider=?,jait_backend=?,recent_models=?,selected_model=?,reasoning_effort=?,project_picker_path=?,project_picker_node_id=?,updated_at=? WHERE user_id=?",
            params![s.theme,serde_json::to_string(&s.api_keys).expect("JSON string map"),serde_json::to_string(&s.disabled_tools).expect("JSON strings"),s.stt_provider,s.chat_streaming_action,s.chat_provider,s.jait_backend,serde_json::to_string(&s.recent_models).expect("JSON strings"),s.selected_model,s.reasoning_effort,s.project_picker_path,s.project_picker_node_id,self.now()?,user_id])?;
        self.get_settings(user_id)
    }
    pub fn get_last_selection(
        &self,
        user_id: &str,
    ) -> rusqlite::Result<(Option<String>, Option<String>)> {
        Ok(self.db.query_row("SELECT last_selected_project_id,last_selected_session_id FROM user_settings WHERE user_id=?",[user_id],|r|Ok((r.get(0)?,r.get(1)?))).optional()?.unwrap_or_default())
    }
    pub fn set_last_selection(
        &self,
        user_id: &str,
        project: Option<&str>,
        session: Option<&str>,
    ) -> rusqlite::Result<()> {
        self.get_settings(user_id)?;
        self.db.execute("UPDATE user_settings SET last_selected_project_id=?,last_selected_session_id=?,last_selected_at=? WHERE user_id=?",params![project,session,self.now()?,user_id])?;
        Ok(())
    }
    /// Internal repository operation; route ownership must be checked before binding.
    pub fn bind_session_to_user(&self, user_id: &str, session_id: &str) -> rusqlite::Result<bool> {
        Ok(self.db.execute(
            "UPDATE sessions SET user_id=? WHERE id=? AND (user_id IS NULL OR user_id=?)",
            params![user_id, session_id, user_id],
        )? > 0)
    }
    pub fn clear_archived_sessions(&self, user_id: &str) -> rusqlite::Result<usize> {
        let ids: Vec<String> = self
            .db
            .prepare("SELECT id FROM sessions WHERE user_id=? AND status='archived'")?
            .query_map([user_id], |r| r.get(0))?
            .collect::<rusqlite::Result<_>>()?;
        for id in &ids {
            self.db
                .execute("DELETE FROM messages WHERE session_id=?", [id])?;
            self.db.execute(
                "DELETE FROM sessions WHERE id=? AND user_id=?",
                params![id, user_id],
            )?;
        }
        Ok(ids.len())
    }
}
