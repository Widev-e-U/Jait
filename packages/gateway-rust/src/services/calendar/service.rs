//! Calendar accounts, encrypted credentials, pending OAuth state and device snapshots.
//! SQLite and filesystem work runs on the bounded database worker.
use super::{
    Transport, field,
    google::GoogleCalendarClient,
    js_text,
    oauth::{
        CalendarOAuthClient, CalendarOAuthCredentials, build_calendar_authorize_url,
        create_calendar_pkce, env_calendar_credentials,
    },
    truthy,
};
use crate::{
    db::{
        identifiers::uuidv7,
        worker::{DatabaseError, DatabaseWorker},
    },
    services::{
        provider_reset_windows::parse_iso,
        user_secrets::{SaveSecretParams, UserSecretService},
    },
    text::js_trim,
    time::{Clock, default_clock, iso},
};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use futures_util::{StreamExt, stream::FuturesUnordered};
use rusqlite::{Connection, OptionalExtension, params};
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
};
pub type Error = Box<dyn std::error::Error + Send + Sync>;
pub type CredentialSource = Arc<dyn Fn() -> Option<CalendarOAuthCredentials> + Send + Sync>;
const COLUMNS: &str = "id,user_id,provider,email,display_name,status,error,created_at,updated_at";
struct PendingConnect {
    user_id: Option<String>,
    verifier: String,
    redirect: String,
    created_at: i64,
}
pub struct CalendarService {
    db: DatabaseWorker,
    secrets: UserSecretService,
    http: Transport,
    clock: Clock,
    env: CredentialSource,
    pending: Mutex<HashMap<String, PendingConnect>>,
}
fn fail(message: impl Into<String>) -> Error {
    std::io::Error::other(message.into()).into()
}
fn owner(user: Option<&str>) -> Option<&str> {
    user.filter(|u| !u.is_empty())
}
fn account_row(r: &rusqlite::Row<'_>) -> rusqlite::Result<Value> {
    let provider: String = r.get(2)?;
    let status: String = r.get(5)?;
    Ok(
        json!({"id":r.get::<_,String>(0)?,"userId":r.get::<_,Option<String>>(1)?,
        "provider":if provider=="android"{"android"}else{"google"},"email":r.get::<_,String>(3)?,"displayName":r.get::<_,String>(4)?,
        "status":if status=="error"{"error"}else{"connected"},"error":r.get::<_,Option<String>>(6)?,
        "createdAt":r.get::<_,String>(7)?,"updatedAt":r.get::<_,String>(8)?}),
    )
}
fn get_account(db: &Connection, user: Option<&str>, id: &str) -> rusqlite::Result<Option<Value>> {
    db.query_row(
        &format!("SELECT {COLUMNS} FROM calendar_accounts WHERE id=? AND user_id IS ?"),
        params![id, owner(user)],
        account_row,
    )
    .optional()
}
fn find_account(
    db: &Connection,
    user: Option<&str>,
    provider: &str,
    email: &str,
) -> rusqlite::Result<Option<Value>> {
    db.query_row(
        &format!(
            "SELECT {COLUMNS} FROM calendar_accounts WHERE user_id IS ? AND provider=? AND email=?"
        ),
        params![owner(user), provider, email],
        account_row,
    )
    .optional()
}
fn list_accounts(db: &Connection, user: Option<&str>) -> rusqlite::Result<Vec<Value>> {
    db.prepare(&format!(
        "SELECT {COLUMNS} FROM calendar_accounts WHERE user_id IS ? ORDER BY updated_at DESC"
    ))?
    .query_map([owner(user)], account_row)?
    .collect()
}
fn date(value: Option<&Value>, fallback: i64) -> Result<String, Error> {
    let ms = match value {
        None | Some(Value::Null) => fallback,
        Some(Value::String(s)) if s.is_empty() => fallback,
        Some(Value::String(s)) => parse_iso(s).ok_or_else(|| fail(format!("Invalid date: {s}")))?,
        Some(v) => return Err(fail(format!("Invalid date: {}", js_text(v)))),
    };
    iso(ms).map_err(fail)
}
fn snapshot(db: &Connection, id: &str) -> rusqlite::Result<Value> {
    let row = db
        .query_row(
            "SELECT calendars,events FROM device_calendar_snapshots WHERE account_id=?",
            [id],
            |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)),
        )
        .optional()?;
    let parsed=row.and_then(|(c,e)|Some(json!({"calendars":serde_json::from_str::<Value>(&c).ok()?,"events":serde_json::from_str::<Value>(&e).ok()?})));
    Ok(parsed.unwrap_or(json!({"calendars":[],"events":[]})))
}
impl CalendarService {
    pub fn new(db: DatabaseWorker, secrets: UserSecretService, http: Transport) -> Self {
        Self::with_options(
            db,
            secrets,
            http,
            default_clock(),
            Arc::new(env_calendar_credentials),
        )
    }
    pub fn with_options(
        db: DatabaseWorker,
        secrets: UserSecretService,
        http: Transport,
        clock: Clock,
        env: CredentialSource,
    ) -> Self {
        Self {
            db,
            secrets,
            http,
            clock,
            env,
            pending: Mutex::new(HashMap::new()),
        }
    }
    async fn run<T: Send + 'static>(
        &self,
        operation: impl FnOnce(&Connection) -> Result<T, Error> + Send + 'static,
    ) -> Result<T, Error> {
        self.db.run(operation).await.map_err(|e| match e {
            DatabaseError::Operation(e) => e,
            e => Box::new(e) as Error,
        })
    }
    pub async fn shutdown(&self) -> Result<(), DatabaseError> {
        self.db.shutdown().await
    }
    pub async fn resolve_credentials(
        &self,
        user: Option<&str>,
    ) -> Result<Option<CalendarOAuthCredentials>, Error> {
        let secrets = self.secrets.clone();
        let user = user.map(String::from);
        let own = self
            .run(move |db| {
                let id = secrets.get_value(
                    db,
                    user.as_deref(),
                    "calendar-oauth-app",
                    "google-client-id",
                )?;
                let secret = secrets.get_value(
                    db,
                    user.as_deref(),
                    "calendar-oauth-app",
                    "google-client-secret",
                )?;
                if let Some((id, secret)) = id
                    .zip(secret)
                    .filter(|(a, b)| !a.is_empty() && !b.is_empty())
                {
                    return Ok(Some(CalendarOAuthCredentials {
                        client_id: id,
                        client_secret: secret,
                    }));
                }
                let id =
                    secrets.get_value(db, user.as_deref(), "email-oauth-app", "gmail-client-id")?;
                let secret = secrets.get_value(
                    db,
                    user.as_deref(),
                    "email-oauth-app",
                    "gmail-client-secret",
                )?;
                Ok(id
                    .zip(secret)
                    .filter(|(a, b)| !a.is_empty() && !b.is_empty())
                    .map(|(client_id, client_secret)| CalendarOAuthCredentials {
                        client_id,
                        client_secret,
                    }))
            })
            .await?;
        Ok(own.or_else(|| (self.env)()))
    }
    pub async fn is_configured(&self, user: Option<&str>) -> Result<bool, Error> {
        Ok(self.resolve_credentials(user).await?.is_some())
    }
    pub async fn save_app_credentials(
        &self,
        user: Option<&str>,
        credentials: CalendarOAuthCredentials,
    ) -> Result<(), Error> {
        let user = user.map(String::from);
        let secrets = self.secrets.clone();
        self.run(move |db| {
            for (key, label, value) in [
                (
                    "google-client-id",
                    "Google Calendar OAuth client id",
                    credentials.client_id,
                ),
                (
                    "google-client-secret",
                    "Google Calendar OAuth client secret",
                    credentials.client_secret,
                ),
            ] {
                secrets.save(
                    db,
                    SaveSecretParams {
                        user_id: user.clone(),
                        r#type: "calendar-oauth-app".into(),
                        key: key.into(),
                        label: label.into(),
                        value,
                    },
                )?;
            }
            Ok(())
        })
        .await
    }
    pub async fn start_connect(&self, user: Option<&str>, redirect: &str) -> Result<Value, Error> {
        let credentials=self.resolve_credentials(user).await?.ok_or_else(||fail("Google Calendar is not configured. Add OAuth credentials in Calendar settings or configure Gmail OAuth first."))?;
        let mut entropy = [0u8; 24];
        getrandom::fill(&mut entropy).map_err(|e| fail(e.to_string()))?;
        let state = URL_SAFE_NO_PAD.encode(entropy);
        let pkce = create_calendar_pkce().map_err(fail)?;
        let now = (self.clock)();
        {
            let mut pending = self.pending.lock().unwrap();
            pending.insert(
                state.clone(),
                PendingConnect {
                    user_id: user.map(String::from),
                    verifier: pkce["verifier"].as_str().unwrap().into(),
                    redirect: redirect.into(),
                    created_at: now,
                },
            );
            let cutoff = (self.clock)().saturating_sub(600000);
            pending.retain(|_, p| p.created_at >= cutoff);
        }
        Ok(
            json!({"redirectUri":redirect,"authUrl":build_calendar_authorize_url(&credentials,redirect,&state,pkce["challenge"].as_str().unwrap())}),
        )
    }
    pub async fn complete_connect(&self, code: &str, state: &str) -> Result<Value, Error> {
        let pending =
            self.pending.lock().unwrap().remove(state).ok_or_else(|| {
                fail("OAuth state is invalid or expired. Please retry connecting.")
            })?;
        if pending.created_at < (self.clock)().saturating_sub(600000) {
            return Err(fail(
                "OAuth state is invalid or expired. Please retry connecting.",
            ));
        }
        let credentials = self
            .resolve_credentials(pending.user_id.as_deref())
            .await?
            .ok_or_else(|| fail("Google Calendar OAuth credentials are no longer configured."))?;
        let tokens = CalendarOAuthClient::with_clock(self.http.clone(), self.clock.clone())
            .exchange_code(&credentials, &pending.redirect, code, &pending.verifier)
            .await
            .map_err(fail)?;
        let email = GoogleCalendarClient::new(self.http.clone())
            .get_profile_email(tokens["accessToken"].as_str().unwrap_or(""))
            .await
            .map_err(fail)?;
        if !truthy(&email) {
            return Err(fail("Could not read the Google account email address."));
        }
        let email = email
            .as_str()
            .ok_or_else(|| fail("Invalid provider response shape"))?
            .to_string();
        let now = iso((self.clock)()).map_err(fail)?;
        let user = pending.user_id.clone();
        let account=self.run(move|db|{
            if let Some(mut existing)=find_account(db,user.as_deref(),"google",&email)?{
                db.execute("UPDATE calendar_accounts SET status='connected',error=NULL,updated_at=? WHERE id=?",params![now,existing["id"].as_str()])?;
                existing["status"]=json!("connected");existing["error"]=Value::Null;existing["updatedAt"]=json!(now);
                return Ok(existing);
            }
            let id=uuidv7().to_string();
            db.execute("INSERT INTO calendar_accounts(id,user_id,provider,email,display_name,status,error,created_at,updated_at)VALUES(?,?,'google',?,?,'connected',NULL,?,?)",params![id,user,email,email,now,now])?;
            Ok(json!({"id":id,"userId":user,"provider":"google","email":email,"displayName":email,"status":"connected","error":null,"createdAt":now,"updatedAt":now}))
        }).await?;
        self.store_tokens(
            account["id"].as_str().unwrap(),
            pending.user_id.as_deref(),
            &tokens,
        )
        .await?;
        Ok(account)
    }
    pub async fn list_accounts(&self, user: Option<&str>) -> Result<Vec<Value>, Error> {
        let user = user.map(String::from);
        self.run(move |db| Ok(list_accounts(db, user.as_deref())?))
            .await
    }
    pub async fn get_account(&self, user: Option<&str>, id: &str) -> Result<Option<Value>, Error> {
        let user = user.map(String::from);
        let id = id.to_string();
        self.run(move |db| Ok(get_account(db, user.as_deref(), &id)?))
            .await
    }
    pub async fn resolve_account(
        &self,
        user: Option<&str>,
        id: Option<&str>,
    ) -> Result<Value, Error> {
        if let Some(id) = id.filter(|s| !s.is_empty()) {
            return self
                .get_account(user, id)
                .await?
                .ok_or_else(|| fail(format!("Calendar account {id} not found.")));
        }
        self.list_accounts(user)
            .await?
            .into_iter()
            .next()
            .ok_or_else(|| fail("No calendar account connected. Connect Google Calendar first."))
    }
    pub async fn sync_device_calendar(
        &self,
        user: Option<&str>,
        input: &Value,
    ) -> Result<Value, Error> {
        let user = user.map(String::from);
        let input = input.clone();
        let now = iso((self.clock)()).map_err(fail)?;
        self.run(move|db|{
            let tx = db.unchecked_transaction()?;
            let db = &tx;
            let device=input["deviceId"].as_str().ok_or_else(||fail("deviceId must be a string"))?;
            let email=format!("device:{device}");let existing=find_account(db,user.as_deref(),"android",&email)?;
            let id=existing.as_ref().and_then(|r|r["id"].as_str()).map(String::from).unwrap_or_else(||uuidv7().to_string());
            let created=existing.as_ref().and_then(|r|r["createdAt"].as_str()).unwrap_or(&now);
            let name=input["deviceName"].as_str().filter(|s|!s.is_empty()).unwrap_or("Android device");
            if existing.is_some(){
                db.execute("UPDATE calendar_accounts SET user_id=?,provider='android',email=?,display_name=?,status='connected',error=NULL,created_at=?,updated_at=? WHERE id=?",params![user,email,name,created,now,id])?;
            }else{db.execute("INSERT INTO calendar_accounts(id,user_id,provider,email,display_name,status,error,created_at,updated_at)VALUES(?,?,'android',?,?,'connected',NULL,?,?)",params![id,user,email,name,created,now])?;}
            let calendars=serde_json::to_string(&input["calendars"])?;let events=serde_json::to_string(&input["events"])?;
            db.execute("INSERT INTO device_calendar_snapshots(account_id,user_id,calendars,events,synced_at)VALUES(?,?,?,?,?) ON CONFLICT(account_id)DO UPDATE SET calendars=excluded.calendars,events=excluded.events,synced_at=excluded.synced_at",params![id,user,calendars,events,now])?;
            let account = json!({"id":id,"userId":user,"provider":"android","email":email,"displayName":name,"status":"connected","error":null,"createdAt":created,"updatedAt":now});
            tx.commit()?;
            Ok(account)
        }).await
    }
    pub async fn disconnect(&self, user: Option<&str>, id: &str) -> Result<bool, Error> {
        let user = user.map(String::from);
        let id = id.to_string();
        let secrets = self.secrets.clone();
        self.run(move |db| {
            if get_account(db, user.as_deref(), &id)?.is_none() {
                return Ok(false);
            }
            db.execute(
                "DELETE FROM device_calendar_snapshots WHERE account_id=?",
                [&id],
            )?;
            db.execute("DELETE FROM calendar_accounts WHERE id=?", [&id])?;
            if let Some(secret) = secrets
                .list(db, user.as_deref(), Some("calendar-account"))?
                .into_iter()
                .find(|s| s.key == id)
            {
                secrets.delete(db, &secret.id, user.as_deref())?;
            }
            Ok(true)
        })
        .await
    }
    async fn store_tokens(
        &self,
        id: &str,
        user: Option<&str>,
        tokens: &Value,
    ) -> Result<(), Error> {
        let id = id.to_string();
        let user = user.map(String::from);
        let tokens = serde_json::to_string(tokens)?;
        let secrets = self.secrets.clone();
        self.run(move |db| {
            secrets.save(
                db,
                SaveSecretParams {
                    user_id: user,
                    r#type: "calendar-account".into(),
                    key: id.clone(),
                    label: format!("Calendar tokens ({id})"),
                    value: tokens,
                },
            )?;
            Ok(())
        })
        .await
    }
    async fn valid_access_token(&self, account: &Value) -> Result<String, Error> {
        let user = account["userId"].as_str().map(String::from);
        let id = account["id"].as_str().unwrap().to_string();
        let secrets = self.secrets.clone();
        let tokens = self
            .run(move |db| {
                Ok(secrets
                    .get_value(db, user.as_deref(), "calendar-account", &id)?
                    .and_then(|s| serde_json::from_str::<Value>(&s).ok()))
            })
            .await?
            .filter(truthy)
            .ok_or_else(|| {
                fail("No stored credentials for this calendar account. Reconnect it.")
            })?;
        let expires = tokens["expiresAt"]
            .as_f64()
            .or_else(|| tokens["expiresAt"].as_str().and_then(|s| s.parse().ok()))
            .unwrap_or(f64::NAN);
        if expires - (self.clock)() as f64 > 60000.0 {
            return Ok(tokens["accessToken"].as_str().unwrap_or("").into());
        }
        let refresh = &tokens["refreshToken"];
        if !truthy(refresh) {
            return Err(fail("Calendar access expired. Reconnect the account."));
        }
        let credentials = self
            .resolve_credentials(account["userId"].as_str())
            .await?
            .ok_or_else(|| fail("Google Calendar OAuth credentials are not configured."))?;
        let refreshed = CalendarOAuthClient::with_clock(self.http.clone(), self.clock.clone())
            .refresh_tokens(&credentials, &js_text(refresh))
            .await
            .map_err(fail)?;
        self.store_tokens(
            account["id"].as_str().unwrap(),
            account["userId"].as_str(),
            &refreshed,
        )
        .await?;
        Ok(refreshed["accessToken"].as_str().unwrap_or("").into())
    }
    pub async fn list_calendars(
        &self,
        user: Option<&str>,
        id: Option<&str>,
    ) -> Result<Value, Error> {
        let account = self.resolve_account(user, id).await?;
        let calendars = if account["provider"] == "android" {
            let id = account["id"].as_str().unwrap().to_string();
            self.run(move |db| Ok(snapshot(db, &id)?)).await?["calendars"].clone()
        } else {
            let token = self.valid_access_token(&account).await?;
            GoogleCalendarClient::new(self.http.clone())
                .list_calendars(&token)
                .await
                .map_err(fail)?
        };
        Ok(json!({"account":account,"calendars":calendars}))
    }
    pub async fn list_events(
        &self,
        user: Option<&str>,
        id: Option<&str>,
        options: &Value,
    ) -> Result<Value, Error> {
        let account = self.resolve_account(user, id).await?;
        let android = account["provider"] == "android";
        let token = if android {
            None
        } else {
            Some(self.valid_access_token(&account).await?)
        };
        let now = (self.clock)();
        let min = date(field(options, "timeMin"), now)?;
        let max = date(field(options, "timeMax"), now.saturating_add(604800000))?;
        if max <= min {
            return Err(fail("timeMax must be after timeMin."));
        }
        // Math.min/max preserve NaN; slice(0, NaN) returns no events.
        let limit = field(options, "limit")
            .filter(|v| !v.is_null())
            .map(|v| {
                let n = crate::execution::command_timeout::number(Some(v));
                let text = js_text(v);
                if n.is_infinite()
                    && !matches!(js_trim(&text), "Infinity" | "+Infinity" | "-Infinity")
                {
                    f64::NAN
                } else {
                    n
                }
            })
            .unwrap_or(50.0)
            .clamp(1.0, 250.0);
        let calendar_id = options["calendarId"].as_str().filter(|s| !s.is_empty());
        let mut events = if android {
            let id = account["id"].as_str().unwrap().to_string();
            let data = self.run(move |db| Ok(snapshot(db, &id)?)).await?;
            let query = options["query"]
                .as_str()
                .map(js_trim)
                .unwrap_or("")
                .to_lowercase();
            let events = data["events"]
                .as_array()
                .ok_or_else(|| fail("Invalid device snapshot shape"))?;
            events
                .iter()
                .filter(|e| calendar_id.is_none_or(|id| e["calendarId"] == id))
                .filter(|e| {
                    e["end"].as_str().is_some_and(|end| end >= min.as_str())
                        && e["start"]
                            .as_str()
                            .is_some_and(|start| start <= max.as_str())
                })
                .filter(|e| {
                    query.is_empty()
                        || format!(
                            "{} {} {}",
                            js_text(&e["title"]),
                            js_text(&e["description"]),
                            js_text(&e["location"])
                        )
                        .to_lowercase()
                        .contains(&query)
                })
                .cloned()
                .collect::<Vec<_>>()
        } else {
            let token = token.unwrap();
            let client = GoogleCalendarClient::new(self.http.clone());
            let calendars = client.list_calendars(&token).await.map_err(fail)?;
            let targets = calendars
                .as_array()
                .ok_or_else(|| fail("Invalid provider response shape"))?
                .iter()
                .filter(|c| {
                    if let Some(id) = calendar_id {
                        c["id"] == id
                    } else {
                        truthy(&c["selected"]) || truthy(&c["primary"])
                    }
                })
                .cloned()
                .collect::<Vec<_>>();
            if let Some(id) = calendar_id.filter(|_| targets.is_empty()) {
                return Err(fail(format!("Calendar {id} not found.")));
            }
            let mut pending = FuturesUnordered::new();
            let count = targets.len();
            for (i, calendar) in targets.into_iter().enumerate() {
                let http = self.http.clone();
                let token = token.clone();
                let mut options = options.clone();
                if !options.is_object() {
                    options = json!({});
                }
                options["timeMin"] = json!(min);
                options["timeMax"] = json!(max);
                options["limit"] = if limit.is_nan() {
                    json!("NaN")
                } else {
                    json!(limit)
                };
                pending.push(tokio::spawn(async move {
                    (
                        i,
                        GoogleCalendarClient::new(http)
                            .list_events(&token, &calendar, &options)
                            .await,
                    )
                }));
            }
            let mut batches = vec![Value::Null; count];
            while let Some(task) = pending.next().await {
                let (i, result) = task.map_err(|e| fail(e.to_string()))?;
                batches[i] = result.map_err(fail)?;
            }
            batches
                .into_iter()
                .flat_map(|b| b.as_array().cloned().unwrap_or_default())
                .filter(|e| e["status"] != "cancelled")
                .collect()
        };
        events.sort_by(|a, b| {
            a["start"]
                .as_str()
                .unwrap_or("")
                .cmp(b["start"].as_str().unwrap_or(""))
        });
        events.truncate(limit as usize);
        Ok(json!({"account":account,"events":events}))
    }
}
