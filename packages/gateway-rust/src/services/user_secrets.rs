//! Encrypted user-secret storage. AES-256-GCM with a 12-byte IV and a 16-byte
//! auth tag, matching the TypeScript service's key derivation and base64 layout.
use crate::{
    db::identifiers::uuidv7,
    text::js_trim,
    time::{Clock, default_clock, iso},
};
use aes_gcm::{
    Aes256Gcm, Nonce,
    aead::{Aead, KeyInit},
};
use base64::{Engine, engine::general_purpose::STANDARD};
use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

type Error = Box<dyn std::error::Error + Send + Sync>;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct UserSecretRecord {
    pub id: String,
    pub user_id: Option<String>,
    pub r#type: String,
    pub key: String,
    pub label: String,
    pub created_at: String,
    pub updated_at: String,
    pub last_used_at: Option<String>,
}

#[derive(Clone)]
pub struct SaveSecretParams {
    pub user_id: Option<String>,
    pub r#type: String,
    pub key: String,
    pub label: String,
    pub value: String,
}

// Callers may include these parameters in diagnostics; never format the secret.
impl std::fmt::Debug for SaveSecretParams {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("SaveSecretParams")
            .field("user_id", &self.user_id)
            .field("type", &self.r#type)
            .field("key", &self.key)
            .field("label", &self.label)
            .field("value", &"[REDACTED]")
            .finish()
    }
}

fn normalize(value: &str) -> String {
    js_trim(value).to_string()
}

fn derive_key(secret: &str) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(format!("jait:user-secrets:{secret}"));
    hasher.finalize().into()
}

fn fail(message: &str) -> Error {
    Box::new(std::io::Error::other(message))
}

pub struct Encrypted {
    pub encrypted_value: String,
    pub iv: String,
    pub auth_tag: String,
}

/// The key is derived once at construction; database work runs on a caller-owned
/// connection so this service stays cheap to clone across worker closures.
#[derive(Clone)]
pub struct UserSecretService {
    key: [u8; 32],
    clock: Clock,
}

impl UserSecretService {
    pub fn new(encryption_secret: &str) -> Self {
        Self::with_clock(encryption_secret, default_clock())
    }

    pub fn with_clock(encryption_secret: &str, clock: Clock) -> Self {
        Self {
            key: derive_key(encryption_secret),
            clock,
        }
    }

    fn now(&self) -> Result<String, Error> {
        iso((self.clock)()).map_err(|message| fail(&message))
    }

    pub fn encrypt(&self, value: &str) -> Encrypted {
        let cipher = Aes256Gcm::new_from_slice(&self.key).expect("fixed 32-byte key");
        let mut nonce_bytes = [0u8; 12];
        getrandom::fill(&mut nonce_bytes).expect("operating-system randomness");
        let nonce = Nonce::from_slice(&nonce_bytes);
        // aes-gcm appends the 16-byte tag to the ciphertext.
        let ciphertext = cipher
            .encrypt(nonce, value.as_bytes())
            .expect("AES-256-GCM encryption");
        let (encrypted, tag) = ciphertext.split_at(ciphertext.len() - 16);
        Encrypted {
            encrypted_value: STANDARD.encode(encrypted),
            iv: STANDARD.encode(nonce_bytes),
            auth_tag: STANDARD.encode(tag),
        }
    }

    pub fn decrypt(
        &self,
        encrypted_value: &str,
        iv: &str,
        auth_tag: &str,
    ) -> Result<String, Error> {
        let cipher = Aes256Gcm::new_from_slice(&self.key).expect("fixed 32-byte key");
        let nonce_bytes = STANDARD.decode(iv).map_err(|_| fail("invalid iv"))?;
        let nonce = Nonce::from_slice(&nonce_bytes);
        let mut ciphertext = STANDARD
            .decode(encrypted_value)
            .map_err(|_| fail("invalid ciphertext"))?;
        ciphertext.extend_from_slice(
            &STANDARD
                .decode(auth_tag)
                .map_err(|_| fail("invalid auth tag"))?,
        );
        let plaintext = cipher
            .decrypt(nonce, ciphertext.as_ref())
            .map_err(|_| fail("secret decryption failed"))?;
        String::from_utf8(plaintext).map_err(|_| fail("secret is not valid UTF-8"))
    }

    pub fn list(
        &self,
        db: &Connection,
        user_id: Option<&str>,
        type_filter: Option<&str>,
    ) -> rusqlite::Result<Vec<UserSecretRecord>> {
        let mut sql = String::from(
            "SELECT id,user_id,type,key,label,created_at,updated_at,last_used_at \
             FROM user_secrets WHERE 1=1",
        );
        let user_owned = user_id.map(str::to_string);
        let type_owned = type_filter.map(str::to_string);
        let mut args: Vec<&dyn rusqlite::ToSql> = Vec::new();
        match &user_owned {
            Some(value) => {
                sql.push_str(" AND user_id=?");
                args.push(value);
            }
            None => sql.push_str(" AND user_id IS NULL"),
        }
        if let Some(value) = &type_owned {
            sql.push_str(" AND type=?");
            args.push(value);
        }
        sql.push_str(" ORDER BY updated_at DESC");
        let mut statement = db.prepare(&sql)?;
        statement
            .query_map(args.as_slice(), row_user_secret)?
            .collect()
    }

    pub fn get_value(
        &self,
        db: &Connection,
        user_id: Option<&str>,
        type_filter: &str,
        key: &str,
    ) -> Result<Option<String>, Error> {
        let row = match user_id {
            Some(user) => db
                .query_row(
                    "SELECT id,encrypted_value,iv,auth_tag FROM user_secrets \
                     WHERE user_id=? AND type=? AND key=?",
                    params![user, type_filter, key],
                    |r| {
                        Ok((
                            r.get::<_, String>(0)?,
                            r.get::<_, String>(1)?,
                            r.get::<_, String>(2)?,
                            r.get::<_, String>(3)?,
                        ))
                    },
                )
                .optional()?,
            None => db
                .query_row(
                    "SELECT id,encrypted_value,iv,auth_tag FROM user_secrets \
                     WHERE user_id IS NULL AND type=? AND key=?",
                    params![type_filter, key],
                    |r| {
                        Ok((
                            r.get::<_, String>(0)?,
                            r.get::<_, String>(1)?,
                            r.get::<_, String>(2)?,
                            r.get::<_, String>(3)?,
                        ))
                    },
                )
                .optional()?,
        };
        let Some((id, encrypted_value, iv, auth_tag)) = row else {
            return Ok(None);
        };
        self.mark_used(db, &id, user_id)?;
        Ok(Some(self.decrypt(&encrypted_value, &iv, &auth_tag)?))
    }

    pub fn save(
        &self,
        db: &Connection,
        params: SaveSecretParams,
    ) -> Result<UserSecretRecord, Error> {
        let type_filter = normalize(&params.r#type);
        let key = normalize(&params.key);
        let label = normalize(&params.label);
        let value = params.value;
        if type_filter.is_empty() {
            return Err(fail("Secret type is required"));
        }
        if key.is_empty() {
            return Err(fail("Secret key is required"));
        }
        if label.is_empty() {
            return Err(fail("Secret label is required"));
        }
        if value.is_empty() {
            return Err(fail("Secret value is required"));
        }

        let existing = match params.user_id.as_deref() {
            Some(user) => db
                .query_row(
                    "SELECT id FROM user_secrets WHERE user_id=? AND type=? AND key=?",
                    params![user, type_filter, key],
                    |r| r.get::<_, String>(0),
                )
                .optional()?,
            None => db
                .query_row(
                    "SELECT id FROM user_secrets WHERE user_id IS NULL AND type=? AND key=?",
                    params![type_filter, key],
                    |r| r.get::<_, String>(0),
                )
                .optional()?,
        };

        let encrypted = self.encrypt(&value);
        let now = self.now()?;
        if let Some(existing) = existing {
            db.execute(
                "UPDATE user_secrets SET label=?,encrypted_value=?,iv=?,auth_tag=?,updated_at=? \
                 WHERE id=?",
                params![
                    label,
                    encrypted.encrypted_value,
                    encrypted.iv,
                    encrypted.auth_tag,
                    now,
                    existing,
                ],
            )?;
            return Ok(self
                .get_by_id(db, &existing, params.user_id.as_deref())?
                .expect("updated secret exists"));
        }

        let id = uuidv7().to_string();
        db.execute(
            "INSERT INTO user_secrets(id,user_id,type,key,label,encrypted_value,iv,auth_tag,created_at,updated_at,last_used_at) \
             VALUES(?,?,?,?,?,?,?,?,?,?,NULL)",
            params![
                id,
                params.user_id,
                type_filter,
                key,
                label,
                encrypted.encrypted_value,
                encrypted.iv,
                encrypted.auth_tag,
                now,
                now,
            ],
        )?;
        Ok(self
            .get_by_id(db, &id, params.user_id.as_deref())?
            .expect("inserted secret exists"))
    }

    pub fn delete(
        &self,
        db: &Connection,
        id: &str,
        user_id: Option<&str>,
    ) -> rusqlite::Result<bool> {
        if self.get_by_id(db, id, user_id)?.is_none() {
            return Ok(false);
        }
        db.execute("DELETE FROM user_secrets WHERE id=?", [id])?;
        Ok(true)
    }

    fn get_by_id(
        &self,
        db: &Connection,
        id: &str,
        user_id: Option<&str>,
    ) -> rusqlite::Result<Option<UserSecretRecord>> {
        Ok(self
            .list(db, user_id, None)?
            .into_iter()
            .find(|secret| secret.id == id))
    }

    fn mark_used(&self, db: &Connection, id: &str, user_id: Option<&str>) -> Result<(), Error> {
        let now = self.now()?;
        match user_id {
            Some(user) => db.execute(
                "UPDATE user_secrets SET last_used_at=? WHERE id=? AND user_id=?",
                params![now, id, user],
            )?,
            None => db.execute(
                "UPDATE user_secrets SET last_used_at=? WHERE id=?",
                params![now, id],
            )?,
        };
        Ok(())
    }
}

fn row_user_secret(row: &rusqlite::Row<'_>) -> rusqlite::Result<UserSecretRecord> {
    Ok(UserSecretRecord {
        id: row.get(0)?,
        user_id: row.get(1)?,
        r#type: row.get(2)?,
        key: row.get(3)?,
        label: row.get(4)?,
        created_at: row.get(5)?,
        updated_at: row.get(6)?,
        last_used_at: row.get(7)?,
    })
}

#[cfg(test)]
mod secret_debug_tests {
    use super::SaveSecretParams;

    #[tokio::test]
    async fn database_worker_keeps_forge_tokens_owner_scoped_and_encrypted() {
        use super::UserSecretService;
        use crate::routes::auth::AuthState;
        use crate::services::users::UserService;

        let db = rusqlite::Connection::open_in_memory().unwrap();
        crate::db::migrate_database(&db).unwrap();
        let users = UserService::new(&db);
        let alice = users
            .create_user_with_hash("secret-alice", "hash")
            .unwrap()
            .id;
        let bob = users
            .create_user_with_hash("secret-bob", "hash")
            .unwrap()
            .id;
        let auth = AuthState::new(db, "secret-storage-test-key-at-least-32-bytes".into()).unwrap();
        let secrets = UserSecretService::new("encryption-key");
        let owner = alice.clone();
        let writer = secrets.clone();
        auth.with_database(move |db| {
            writer.save(
                db,
                SaveSecretParams {
                    user_id: Some(owner),
                    r#type: "forge-token".into(),
                    key: "github.com".into(),
                    label: "GitHub personal access token".into(),
                    value: "alice-private-token".into(),
                },
            )?;
            let stored: String =
                db.query_row("SELECT encrypted_value FROM user_secrets", [], |row| {
                    row.get(0)
                })?;
            assert!(!stored.contains("alice-private-token"));
            Ok(())
        })
        .await
        .unwrap();
        auth.with_database(move |db| {
            assert_eq!(
                secrets
                    .get_value(db, Some(&alice), "forge-token", "github.com")?
                    .as_deref(),
                Some("alice-private-token")
            );
            assert_eq!(
                secrets.get_value(db, Some(&bob), "forge-token", "github.com")?,
                None
            );
            assert_eq!(
                secrets.get_value(db, None, "forge-token", "github.com")?,
                None
            );
            Ok(())
        })
        .await
        .unwrap();
        auth.shutdown().await.unwrap();
    }

    #[test]
    fn save_secret_debug_redacts_plaintext() {
        let params = SaveSecretParams {
            user_id: Some("owner".into()),
            r#type: "forge-token".into(),
            key: "github.com".into(),
            label: "GitHub token".into(),
            value: "sensitive-token-value".into(),
        };
        let output = format!("{params:?}");
        assert!(!output.contains(&params.value));
        assert!(output.contains("[REDACTED]"));
    }
}
