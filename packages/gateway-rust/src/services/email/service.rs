//! Owned account orchestration on the canonical bounded SQLite worker and secret store.
use super::{
    contracts::*,
    gmail::GmailClient,
    imap::{ImapMailboxClient, MailProtocolHost},
    oauth::{self, EmailOAuthClient, OAuthClientCredentials},
    outlook::OutlookClient,
    remote_images::ImageResolver,
    transport::Transport,
};
use crate::{
    db::{
        identifiers::uuidv7,
        worker::{DatabaseError, DatabaseWorker},
    },
    services::user_secrets::{SaveSecretParams, UserSecretService},
    time::{Clock, default_clock, iso},
};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use rusqlite::{Connection, OptionalExtension, params};
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
};
pub type Error = Box<dyn std::error::Error + Send + Sync>;
pub type CredentialsSource =
    Arc<dyn Fn(OAuthEmailProvider) -> Option<OAuthClientCredentials> + Send + Sync>;
type Client = Arc<dyn MailboxClient<Error = String> + Send + Sync>;
const COLUMNS: &str = "id,user_id,provider,email,display_name,status,error,created_at,updated_at";
const TOKENS: &str = "email-account";
const SETTINGS: &str = "email-account-settings";
const APP: &str = "email-oauth-app";
fn fail(s: impl Into<String>) -> Error {
    std::io::Error::other(s.into()).into()
}
fn pname(p: EmailProvider) -> &'static str {
    match p {
        EmailProvider::Gmail => "gmail",
        EmailProvider::Outlook => "outlook",
        EmailProvider::Imap => "imap",
    }
}
fn oauth_provider(p: OAuthEmailProvider) -> oauth::EmailProvider {
    match p {
        OAuthEmailProvider::Gmail => oauth::EmailProvider::Gmail,
        OAuthEmailProvider::Outlook => oauth::EmailProvider::Outlook,
    }
}
fn name(p: OAuthEmailProvider) -> &'static str {
    match p {
        OAuthEmailProvider::Gmail => "gmail",
        OAuthEmailProvider::Outlook => "outlook",
    }
}
fn provider(p: OAuthEmailProvider) -> EmailProvider {
    match p {
        OAuthEmailProvider::Gmail => EmailProvider::Gmail,
        OAuthEmailProvider::Outlook => EmailProvider::Outlook,
    }
}
fn row(r: &rusqlite::Row<'_>) -> rusqlite::Result<EmailAccount> {
    let p: String = r.get(2)?;
    let status: String = r.get(5)?;
    Ok(EmailAccount {
        id: r.get(0)?,
        user_id: r.get(1)?,
        provider: match p.as_str() {
            "imap" => EmailProvider::Imap,
            "outlook" => EmailProvider::Outlook,
            _ => EmailProvider::Gmail,
        },
        email: r.get(3)?,
        display_name: r.get(4)?,
        signature: None,
        signature_enabled: None,
        status: if status == "error" {
            EmailAccountStatus::Error
        } else {
            EmailAccountStatus::Connected
        },
        error: Some(r.get(6)?),
        created_at: r.get(7)?,
        updated_at: r.get(8)?,
    })
}
fn settings(
    db: &Connection,
    secrets: &UserSecretService,
    mut account: EmailAccount,
) -> Result<EmailAccount, Error> {
    let value = secrets
        .get_value(db, account.user_id.as_deref(), SETTINGS, &account.id)?
        .and_then(|s| serde_json::from_str::<Value>(&s).ok())
        .unwrap_or(json!({}));
    account.signature = Some(value["signature"].as_str().unwrap_or("").into());
    account.signature_enabled = Some(value["signatureEnabled"] != false);
    Ok(account)
}
fn get(
    db: &Connection,
    secrets: &UserSecretService,
    user: Option<&str>,
    id: &str,
) -> Result<Option<EmailAccount>, Error> {
    db.query_row(
        &format!("SELECT {COLUMNS} FROM email_accounts WHERE id=? AND user_id IS ?"),
        params![id, user.filter(|u| !u.is_empty())],
        row,
    )
    .optional()?
    .map(|a| settings(db, secrets, a))
    .transpose()
}
fn save(
    db: &Connection,
    secrets: &UserSecretService,
    user: Option<String>,
    kind: &str,
    key: &str,
    label: &str,
    value: String,
) -> Result<(), Error> {
    secrets.save(
        db,
        SaveSecretParams {
            user_id: user,
            r#type: kind.into(),
            key: key.into(),
            label: label.into(),
            value,
        },
    )?;
    Ok(())
}
fn upsert(
    db: &Connection,
    user: Option<&str>,
    p: EmailProvider,
    email: &str,
    now: &str,
) -> Result<EmailAccount, Error> {
    let existing = db
        .query_row(
            &format!(
                "SELECT {COLUMNS} FROM email_accounts WHERE user_id IS ? AND provider=? AND email=?"
            ),
            params![user, pname(p), email],
            row,
        )
        .optional()?;
    let id = existing
        .as_ref()
        .map(|a| a.id.clone())
        .unwrap_or_else(|| uuidv7().to_string());
    if existing.is_some() {
        db.execute("UPDATE email_accounts SET status='connected',error=NULL,updated_at=? WHERE id=? AND user_id IS ?",params![now,id,user])?;
    } else {
        db.execute("INSERT INTO email_accounts(id,user_id,provider,email,display_name,status,error,created_at,updated_at) VALUES (?,?,?,?,?,'connected',NULL,?,?)",params![id,user,pname(p),email,email,now,now])?;
    }
    Ok(db.query_row(
        &format!("SELECT {COLUMNS} FROM email_accounts WHERE id=? AND user_id IS ?"),
        params![id, user],
        row,
    )?)
}
struct Pending {
    user: Option<String>,
    provider: OAuthEmailProvider,
    verifier: String,
    redirect: String,
    created: i64,
}
pub struct EmailService {
    db: DatabaseWorker,
    secrets: UserSecretService,
    http: Transport,
    clock: Clock,
    env: CredentialsSource,
    pending: Mutex<HashMap<String, Pending>>,
    gmail: Client,
    outlook: Client,
    host: Arc<dyn MailProtocolHost>,
    resolver: ImageResolver,
    effects: Arc<tokio::sync::Semaphore>,
    refresh_gate: tokio::sync::Mutex<()>,
}
impl EmailService {
    pub fn new(
        db: DatabaseWorker,
        secrets: UserSecretService,
        http: Transport,
        host: Arc<dyn MailProtocolHost>,
        resolver: ImageResolver,
    ) -> Self {
        Self::with_sources(
            db,
            secrets,
            http,
            host,
            resolver,
            default_clock(),
            Arc::new(|p| oauth::env_client_credentials(oauth_provider(p))),
        )
    }
    pub fn with_sources(
        db: DatabaseWorker,
        secrets: UserSecretService,
        http: Transport,
        host: Arc<dyn MailProtocolHost>,
        resolver: ImageResolver,
        clock: Clock,
        env: CredentialsSource,
    ) -> Self {
        Self {
            db,
            secrets,
            gmail: Arc::new(GmailClient::new(http.clone())),
            outlook: Arc::new(OutlookClient::new(http.clone())),
            http,
            clock,
            env,
            host,
            resolver,
            pending: Mutex::new(HashMap::new()),
            effects: Arc::new(tokio::sync::Semaphore::new(8)),
            refresh_gate: tokio::sync::Mutex::new(()),
        }
    }
    pub fn operation_permit(&self) -> Result<tokio::sync::OwnedSemaphorePermit, Error> {
        self.effects
            .clone()
            .try_acquire_owned()
            .map_err(|_| fail("Email operation capacity exhausted"))
    }
    async fn sql<T: Send + 'static>(
        &self,
        f: impl FnOnce(&Connection, &UserSecretService) -> Result<T, Error> + Send + 'static,
    ) -> Result<T, Error> {
        let secrets = self.secrets.clone();
        self.db
            .run(move |db| f(db, &secrets))
            .await
            .map_err(|e| match e {
                DatabaseError::Operation(inner) => inner,
                other => Box::new(other) as Error,
            })
    }
    pub async fn resolve_credentials(
        &self,
        p: OAuthEmailProvider,
        user: Option<&str>,
    ) -> Result<Option<OAuthClientCredentials>, Error> {
        let user = user.map(String::from);
        let resolved = self
            .sql(move |db, s| {
                let id =
                    s.get_value(db, user.as_deref(), APP, &format!("{}-client-id", name(p)))?;
                let secret = s.get_value(
                    db,
                    user.as_deref(),
                    APP,
                    &format!("{}-client-secret", name(p)),
                )?;
                Ok(match (id, secret) {
                    (Some(client_id), Some(client_secret))
                        if !client_id.is_empty() && !client_secret.is_empty() =>
                    {
                        Some(OAuthClientCredentials {
                            client_id,
                            client_secret,
                        })
                    }
                    _ => None,
                })
            })
            .await?;
        Ok(resolved.or_else(|| (self.env)(p)))
    }
    pub async fn configured_providers(&self, user: Option<&str>) -> Result<Value, Error> {
        Ok(
            json!({"gmail":self.resolve_credentials(OAuthEmailProvider::Gmail,user).await?.is_some(),"outlook":self.resolve_credentials(OAuthEmailProvider::Outlook,user).await?.is_some()}),
        )
    }
    pub async fn save_app_credentials(
        &self,
        user: Option<&str>,
        p: OAuthEmailProvider,
        c: OAuthClientCredentials,
    ) -> Result<(), Error> {
        let user = user.map(String::from);
        self.sql(move |db, s| {
            let tx = db.unchecked_transaction()?;
            if c.client_id.is_empty() && c.client_secret.is_empty() {
                for record in s.list(&tx, user.as_deref(), Some(APP))? {
                    if [
                        format!("{}-client-id", name(p)),
                        format!("{}-client-secret", name(p)),
                    ]
                    .contains(&record.key)
                    {
                        s.delete(&tx, &record.id, user.as_deref())?;
                    }
                }
            } else {
                if c.client_id.is_empty() || c.client_secret.is_empty() {
                    return Err(fail("clientId and clientSecret are required"));
                }
                for (k, v) in [
                    ("client-id", c.client_id),
                    ("client-secret", c.client_secret),
                ] {
                    save(
                        &tx,
                        s,
                        user.clone(),
                        APP,
                        &format!("{}-{k}", name(p)),
                        &format!("{} OAuth {k}", name(p)),
                        v,
                    )?;
                }
            }
            tx.commit()?;
            Ok(())
        })
        .await
    }
    pub async fn start_connect(
        &self,
        user: Option<&str>,
        p: OAuthEmailProvider,
        redirect: &str,
    ) -> Result<Value, Error> {
        let credentials = self.resolve_credentials(p, user).await?.ok_or_else(|| {
            fail(format!(
                "{} is not configured. Add its OAuth client id/secret in Email settings.",
                name(p)
            ))
        })?;
        let mut entropy = [0u8; 24];
        getrandom::fill(&mut entropy).map_err(|_| fail("OAuth entropy unavailable"))?;
        let state = URL_SAFE_NO_PAD.encode(entropy);
        let pkce = oauth::create_pkce()?;
        let now = (self.clock)();
        {
            let mut pending = self
                .pending
                .lock()
                .map_err(|_| fail("Email connection state unavailable"))?;
            pending.retain(|_, v| v.created >= now - 600_000);
            if pending.len() >= 1024 {
                return Err(fail("Too many pending email connections"));
            }
            pending.insert(
                state.clone(),
                Pending {
                    user: user.map(String::from),
                    provider: p,
                    verifier: pkce["verifier"]
                        .as_str()
                        .ok_or("Invalid PKCE verifier")?
                        .into(),
                    redirect: redirect.into(),
                    created: now,
                },
            );
        }
        Ok(
            json!({"authUrl":oauth::build_authorize_url(oauth_provider(p),&credentials,redirect,&state,pkce["challenge"].as_str().ok_or("Invalid PKCE challenge")?)}),
        )
    }
    pub async fn complete_connect(&self, code: &str, state: &str) -> Result<EmailAccount, Error> {
        let _permit = self.operation_permit()?;
        let pending = self
            .pending
            .lock()
            .map_err(|_| fail("Email connection state unavailable"))?
            .remove(state)
            .filter(|p| p.created >= (self.clock)() - 600_000)
            .ok_or("OAuth state is invalid or expired. Please retry connecting.")?;
        let credentials = self
            .resolve_credentials(pending.provider, pending.user.as_deref())
            .await?
            .ok_or("OAuth credentials are no longer configured.")?;
        let oauth = EmailOAuthClient::with_clock(self.http.clone(), self.clock.clone());
        let tokens = oauth
            .exchange_code(
                oauth_provider(pending.provider),
                &credentials,
                &pending.redirect,
                code,
                &pending.verifier,
            )
            .await?;
        let access = tokens["accessToken"]
            .as_str()
            .filter(|s| !s.is_empty())
            .ok_or("OAuth response missing access token")?;
        let client = match pending.provider {
            OAuthEmailProvider::Gmail => &self.gmail,
            OAuthEmailProvider::Outlook => &self.outlook,
        };
        let email = client.get_profile_email(access).await?;
        if email.is_empty() {
            return Err(fail(
                "Could not read the account email address from the provider.",
            ));
        }
        let now = iso((self.clock)())?;
        self.sql(move |db, s| {
            let tx = db.unchecked_transaction()?;
            let account = upsert(
                &tx,
                pending.user.as_deref(),
                provider(pending.provider),
                &email,
                &now,
            )?;
            save(
                &tx,
                s,
                pending.user,
                TOKENS,
                &account.id,
                &format!("Email tokens ({})", account.id),
                tokens.to_string(),
            )?;
            tx.commit()?;
            Ok(account)
        })
        .await
    }
    pub async fn list_accounts(&self, user: Option<&str>) -> Result<Vec<EmailAccount>, Error> {
        let user = user.map(String::from);
        self.sql(move|db,s|{
        let mut stmt=db.prepare(&format!("SELECT {COLUMNS} FROM email_accounts WHERE user_id IS ? ORDER BY updated_at DESC LIMIT 1001"))?;
        let rows=stmt.query_map([user.as_deref().filter(|u|!u.is_empty())],row)?.collect::<rusqlite::Result<Vec<_>>>()?;
        if rows.len()>1000{return Err(fail("Email account limit exceeded"));}rows.into_iter().map(|a|settings(db,s,a)).collect()
    }).await
    }
    pub async fn get_account(
        &self,
        user: Option<&str>,
        id: &str,
    ) -> Result<Option<EmailAccount>, Error> {
        let user = user.map(String::from);
        let id = id.to_string();
        self.sql(move |db, s| get(db, s, user.as_deref(), &id))
            .await
    }
    pub async fn resolve_account(
        &self,
        user: Option<&str>,
        id: Option<&str>,
    ) -> Result<EmailAccount, Error> {
        if let Some(id) = id.filter(|s| !s.is_empty()) {
            return self
                .get_account(user, id)
                .await?
                .ok_or_else(|| fail(format!("Email account {id} not found.")));
        }
        let mut accounts = self.list_accounts(user).await?;
        if accounts.len() > 1 {
            return Err(fail(
                "Multiple email accounts are connected. Specify accountId (use email_accounts to list them).",
            ));
        }
        accounts.pop().ok_or_else(|| {
            fail("No email account connected. Add a mailbox on the Email page first.")
        })
    }
    pub async fn disconnect(&self, user: Option<&str>, id: &str) -> Result<bool, Error> {
        let user = user.map(String::from);
        let id = id.to_string();
        self.sql(move |db, s| {
            let tx = db.unchecked_transaction()?;
            if get(&tx, s, user.as_deref(), &id)?.is_none() {
                return Ok(false);
            }
            tx.execute(
                "DELETE FROM email_accounts WHERE id=? AND user_id IS ?",
                params![id, user],
            )?;
            for kind in [TOKENS, SETTINGS] {
                for record in s.list(&tx, user.as_deref(), Some(kind))? {
                    if record.key == id {
                        s.delete(&tx, &record.id, user.as_deref())?;
                    }
                }
            }
            tx.commit()?;
            Ok(true)
        })
        .await
    }
    pub async fn connect_mailbox(
        &self,
        user: Option<&str>,
        input: Value,
    ) -> Result<EmailAccount, Error> {
        let _permit = self.operation_permit()?;
        let config = super::connection::connect_mailbox(input)?;
        let client =
            ImapMailboxClient::new(config.clone(), self.host.clone(), self.resolver.clone())?;
        client.verify().await.map_err(|_| {
            fail("Connection failed. Check server names, TLS, username and app password.")
        })?;
        let user = user.map(String::from);
        let now = iso((self.clock)())?;
        self.sql(move |db, s| {
            let tx = db.unchecked_transaction()?;
            let account = upsert(
                &tx,
                user.as_deref(),
                EmailProvider::Imap,
                &config.email.to_lowercase(),
                &now,
            )?;
            save(
                &tx,
                s,
                user.clone(),
                TOKENS,
                &account.id,
                "Mailbox credentials",
                serde_json::to_string(&config)?,
            )?;
            if let Some(display) = config.display_name.filter(|s| !s.is_empty()) {
                tx.execute(
                    "UPDATE email_accounts SET display_name=? WHERE id=? AND user_id IS ?",
                    params![display, account.id, user],
                )?;
            }
            let account = get(&tx, s, user.as_deref(), &account.id)?.ok_or("Account not found")?;
            tx.commit()?;
            Ok(account)
        })
        .await
    }
    pub async fn update_account(
        &self,
        user: Option<&str>,
        id: &str,
        input: Value,
    ) -> Result<EmailAccount, Error> {
        let patch = super::connection::account_settings(input)?;
        let user = user.map(String::from);
        let id = id.to_string();
        self.sql(move|db,s|{
        let tx=db.unchecked_transaction()?;let a=get(&tx,s,user.as_deref(),&id)?.ok_or("Account not found")?;
        save(&tx,s,user.clone(),SETTINGS,&id,"Email signature",json!({"signature":patch.signature.or(a.signature).unwrap_or_default(),"signatureEnabled":patch.signature_enabled.or(a.signature_enabled).unwrap_or(true)}).to_string())?;
        if let Some(display)=patch.display_name{tx.execute("UPDATE email_accounts SET display_name=? WHERE id=? AND user_id IS ?",params![display,id,user])?;}
        let a=get(&tx,s,user.as_deref(),&id)?.ok_or("Account not found")?;tx.commit()?;Ok(a)
    }).await
    }
    async fn mailbox(&self, a: &EmailAccount) -> Result<(Client, String), Error> {
        let _refresh_guard = if a.provider != EmailProvider::Imap {
            Some(self.refresh_gate.lock().await)
        } else {
            None
        };
        let user = a.user_id.clone();
        let id = a.id.clone();
        let raw = self
            .sql(move |db, s| s.get_value(db, user.as_deref(), TOKENS, &id))
            .await?;
        if a.provider == EmailProvider::Imap {
            let raw = raw.ok_or("Reconnect this mailbox to restore its credentials")?;
            let mut config = super::connection::connect_mailbox(serde_json::from_str(&raw)?)?;
            config.display_name = Some(a.display_name.clone());
            return Ok((
                Arc::new(ImapMailboxClient::new(
                    config,
                    self.host.clone(),
                    self.resolver.clone(),
                )?),
                String::new(),
            ));
        }
        let tokens: EmailTokens = raw
            .and_then(|s| serde_json::from_str(&s).ok())
            .ok_or("No stored credentials for this account. Reconnect it.")?;
        let token = if tokens.expires_at - (self.clock)() as f64 > 60_000.0 {
            tokens.access_token
        } else {
            let refresh = tokens
                .refresh_token
                .filter(|s| !s.is_empty())
                .ok_or("Access token expired and no refresh token is available. Reconnect.")?;
            let p = if a.provider == EmailProvider::Gmail {
                OAuthEmailProvider::Gmail
            } else {
                OAuthEmailProvider::Outlook
            };
            let credentials = self
                .resolve_credentials(p, a.user_id.as_deref())
                .await?
                .ok_or("OAuth credentials are not configured.")?;
            let tokens = EmailOAuthClient::with_clock(self.http.clone(), self.clock.clone())
                .refresh_tokens(oauth_provider(p), &credentials, &refresh)
                .await?;
            let token = tokens["accessToken"]
                .as_str()
                .filter(|s| !s.is_empty())
                .ok_or("OAuth response missing access token")?
                .to_string();
            let id = a.id.clone();
            let user = a.user_id.clone();
            self.sql(move |db, s| {
                if get(db, s, user.as_deref(), &id)?.is_none() {
                    return Err(fail("Account not found"));
                }
                save(
                    db,
                    s,
                    user,
                    TOKENS,
                    &id,
                    &format!("Email tokens ({id})"),
                    tokens.to_string(),
                )
            })
            .await?;
            token
        };
        Ok((
            if a.provider == EmailProvider::Gmail {
                self.gmail.clone()
            } else {
                self.outlook.clone()
            },
            token,
        ))
    }
    async fn effect(
        &self,
        user: Option<&str>,
        id: Option<&str>,
    ) -> Result<
        (
            EmailAccount,
            Client,
            String,
            tokio::sync::OwnedSemaphorePermit,
        ),
        Error,
    > {
        let permit = self.operation_permit()?;
        let a = self.resolve_account(user, id).await?;
        let (client, token) = self.mailbox(&a).await?;
        // Recheck ownership after asynchronous token/protocol preparation, at the effect boundary.
        if self.get_account(user, &a.id).await?.is_none() {
            return Err(fail("Account not found"));
        }
        Ok((a, client, token, permit))
    }
    pub async fn list_messages(
        &self,
        user: Option<&str>,
        id: Option<&str>,
        opts: ListMessagesOptions,
    ) -> Result<Value, Error> {
        let (a, c, t, _permit) = self.effect(user, id).await?;
        Ok(json!({"account":a,"messages":c.list_messages(&t,opts).await?}))
    }
    pub async fn get_message(
        &self,
        user: Option<&str>,
        account: Option<&str>,
        id: &str,
    ) -> Result<EmailMessageFull, Error> {
        let (_, c, t, _permit) = self.effect(user, account).await?;
        Ok(c.get_message(&t, id).await?)
    }
    pub async fn send_message(
        &self,
        user: Option<&str>,
        id: Option<&str>,
        input: Value,
    ) -> Result<SentMessage, Error> {
        let mut input = super::connection::send_email(input)?;
        let (a, c, t, _permit) = self.effect(user, id).await?;
        if input.include_signature != Some(false)
            && a.signature_enabled != Some(false)
            && let Some(signature) = a
                .signature
                .as_deref()
                .map(crate::text::js_trim)
                .filter(|s| !s.is_empty())
        {
            if input.html == Some(true) {
                input.body.push_str("<br><br>-- <br>");
                input.body.push_str(
                    &signature
                        .replace('&', "&amp;")
                        .replace('<', "&lt;")
                        .replace('>', "&gt;")
                        .replace('"', "&quot;")
                        .replace("\r\n", "\n")
                        .replace('\n', "<br>"),
                );
            } else {
                input.body.push_str("\n\n-- \n");
                input.body.push_str(signature);
            }
        }
        Ok(c.send_message(&t, input).await?)
    }
    pub async fn tag_message(
        &self,
        user: Option<&str>,
        account: Option<&str>,
        id: &str,
        add: Vec<String>,
        remove: Vec<String>,
    ) -> Result<(), Error> {
        let (_, c, t, _permit) = self.effect(user, account).await?;
        Ok(c.tag_message(&t, id, add, remove).await?)
    }
    pub async fn delete_message(
        &self,
        user: Option<&str>,
        account: Option<&str>,
        id: &str,
    ) -> Result<(), Error> {
        let (_, c, t, _permit) = self.effect(user, account).await?;
        Ok(c.delete_message(&t, id).await?)
    }
    pub async fn list_folders(
        &self,
        user: Option<&str>,
        account: Option<&str>,
    ) -> Result<Vec<EmailFolder>, Error> {
        let (_, c, t, _permit) = self.effect(user, account).await?;
        Ok(c.list_folders(&t).await?)
    }
}
