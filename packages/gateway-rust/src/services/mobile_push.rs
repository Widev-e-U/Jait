//! Firebase mobile notification service. Explicit account/DB/clock/lane inputs;
//! no ambient environment, live credentials, runtime registration or coverage credit.
use super::attention::{AttentionCleared, AttentionItem};
use crate::{db::worker::DatabaseWorker, runtime::blocking::BlockingLane};
use futures_util::{StreamExt, future::BoxFuture};
use rusqlite::params;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value, json};
use std::{collections::BTreeMap, sync::Arc, time::Duration};
use tokio::sync::{Mutex, Semaphore};
type Result<T> = std::result::Result<T, String>;
#[cfg(test)]
#[path = "mobile_push_tests.rs"]
mod tests;
const MAX_RESPONSE: usize = 64 * 1024;
const MAX_DEVICES: usize = 256;
#[derive(Clone, Deserialize)]
pub struct FirebaseServiceAccount {
    pub project_id: String,
    pub client_email: String,
    pub private_key: String,
}
impl FirebaseServiceAccount {
    /// Parse the bootstrap's captured environment value without logging secrets.
    pub fn from_environment_value(raw: Option<&str>) -> Option<Self> {
        let raw = raw.map(crate::text::js_trim).filter(|s| !s.is_empty())?;
        if raw.len() > MAX_RESPONSE {
            return None;
        }
        let value: Self = serde_json::from_str(raw).ok()?;
        if value.project_id.is_empty()
            || value.client_email.is_empty()
            || value.private_key.is_empty()
        {
            return None;
        }
        Some(value)
    }
}
#[derive(Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PushRegistration {
    pub device_id: String,
    pub user_id: String,
    pub token: String,
}
pub fn attention_revoke_targets(
    registrations: Vec<PushRegistration>,
    resolved_by: Option<&str>,
) -> Vec<PushRegistration> {
    registrations
        .into_iter()
        .filter(|r| Some(r.device_id.as_str()) != resolved_by)
        .collect()
}
pub enum PushEndpoint {
    OAuth,
    Fcm { project_id: String },
}
/// No arbitrary destinations: production transport accepts only fixed Firebase
/// origins. The token/assertion is never included in Debug or error messages.
pub struct PushRequest {
    pub endpoint: PushEndpoint,
    pub bearer: Option<String>,
    pub body: String,
}
pub struct PushResponse {
    pub status: u16,
    pub body: Value,
}
pub type PushTransport =
    Arc<dyn Fn(PushRequest) -> BoxFuture<'static, Result<PushResponse>> + Send + Sync>;
pub fn native_push_transport() -> Result<PushTransport> {
    let client = reqwest::Client::builder()
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(8))
        .timeout(Duration::from_secs(30))
        .pool_max_idle_per_host(4)
        .build()
        .map_err(|_| "Cannot initialize mobile push transport")?;
    Ok(Arc::new(move |request| {
        let client = client.clone();
        Box::pin(async move {
            if request.body.len() > MAX_RESPONSE {
                return Err("Mobile push request exceeds byte limit".into());
            }
            let (url, content_type) = match request.endpoint {
                PushEndpoint::OAuth => (
                    "https://oauth2.googleapis.com/token".to_owned(),
                    "application/x-www-form-urlencoded",
                ),
                PushEndpoint::Fcm { project_id } => {
                    let encoded = percent_encoding::utf8_percent_encode(
                        &project_id,
                        percent_encoding::NON_ALPHANUMERIC,
                    );
                    (
                        format!("https://fcm.googleapis.com/v1/projects/{encoded}/messages:send"),
                        "application/json",
                    )
                }
            };
            let mut pending = client
                .post(url)
                .header("Content-Type", content_type)
                .body(request.body);
            if let Some(token) = request.bearer {
                pending = pending.bearer_auth(token);
            }
            let response = pending
                .send()
                .await
                .map_err(|_| "Mobile push request failed")?;
            let status = response.status().as_u16();
            if response
                .content_length()
                .is_some_and(|n| n > MAX_RESPONSE as u64)
            {
                return Err("Mobile push response exceeds byte limit".into());
            }
            let mut stream = response.bytes_stream();
            let mut body = Vec::new();
            while let Some(chunk) = stream.next().await {
                let chunk = chunk.map_err(|_| "Mobile push response failed")?;
                if body.len().saturating_add(chunk.len()) > MAX_RESPONSE {
                    return Err("Mobile push response exceeds byte limit".into());
                }
                body.extend_from_slice(&chunk);
            }
            // Failed provider bodies may contain identifiers or credentials;
            // never return/log their arbitrary text through a tool diagnostic.
            let body = if (200..300).contains(&status) && !body.is_empty() {
                serde_json::from_slice(&body).map_err(|_| "Invalid mobile push JSON")?
            } else {
                Value::Null
            };
            Ok(PushResponse { status, body })
        })
    }))
}
struct AccessToken {
    value: String,
    expires_at: i64,
}
pub struct MobilePushService {
    database: DatabaseWorker,
    account: Option<FirebaseServiceAccount>,
    transport: PushTransport,
    clock: Arc<dyn Fn() -> i64 + Send + Sync>,
    signing_lane: BlockingLane,
    token: Mutex<Option<AccessToken>>,
    sends: Semaphore,
}
/// Optional typed adapter for the existing attention supervisor. It creates no
/// background task: the caller retains each future and cancellation ownership.
pub struct MobilePushAttentionSink(pub Arc<MobilePushService>);
impl super::attention::AttentionSink for MobilePushAttentionSink {
    fn raised(&self, item: &AttentionItem) -> super::attention::SinkResult {
        let service = self.0.clone();
        let item = item.clone();
        Ok(Some(Box::pin(async move {
            service.send_attention(&item).await
        })))
    }
    fn cleared(&self, event: &AttentionCleared) -> super::attention::SinkResult {
        let service = self.0.clone();
        let event = event.clone();
        Ok(Some(Box::pin(async move {
            service.send_attention_cleared(&event).await
        })))
    }
}
impl MobilePushService {
    pub fn new(
        database: DatabaseWorker,
        account: Option<FirebaseServiceAccount>,
        transport: PushTransport,
        clock: Arc<dyn Fn() -> i64 + Send + Sync>,
        signing_lane: BlockingLane,
    ) -> Self {
        Self {
            database,
            account,
            transport,
            clock,
            signing_lane,
            token: Mutex::new(None),
            sends: Semaphore::new(8),
        }
    }
    /// The authenticated device-pairing route must authorize device/user binding
    /// before calling this method. The service is not an authentication adapter.
    pub async fn register(
        &self,
        device_id: &str,
        user_id: &str,
        token: &str,
    ) -> Result<PushRegistration> {
        for value in [device_id, user_id, token] {
            if value.is_empty() || value.len() > 16_384 || value.contains('\0') {
                return Err("Invalid push registration".into());
            }
        }
        let registration = PushRegistration {
            device_id: device_id.into(),
            user_id: user_id.into(),
            token: token.into(),
        };
        let row = registration.clone();
        let now = chrono::DateTime::from_timestamp_millis((self.clock)())
            .ok_or("Invalid push clock")?
            .to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
        self.database.run(move |db| {
            let transaction=db.unchecked_transaction()?;
            transaction.execute("DELETE FROM mobile_push_registrations WHERE token=?1",[&row.token])?;
            transaction.execute("INSERT INTO mobile_push_registrations (device_id,user_id,token,platform,enabled,created_at,updated_at,last_seen_at) VALUES (?1,?2,?3,'android',1,?4,?4,?4) ON CONFLICT(device_id) DO UPDATE SET user_id=excluded.user_id,token=excluded.token,enabled=1,updated_at=excluded.updated_at,last_seen_at=excluded.last_seen_at",
                params![row.device_id,row.user_id,row.token,now])?;
            transaction.commit()?;Ok(())
        }).await.map_err(|e|e.to_string())?;
        Ok(registration)
    }
    pub async fn unregister(&self, device_id: &str, user_id: &str) -> Result<bool> {
        let (device, user) = (device_id.to_owned(), user_id.to_owned());
        self.database
            .run(move |db| {
                Ok(db.execute(
                    "DELETE FROM mobile_push_registrations WHERE device_id=?1 AND user_id=?2",
                    params![device, user],
                )? > 0)
            })
            .await
            .map_err(|e| e.to_string())
    }
    pub async fn list(&self, user_id: &str) -> Result<Vec<PushRegistration>> {
        let user = user_id.to_owned();
        self.database.run(move |db| {
            let mut statement=db.prepare("SELECT device_id,user_id,token FROM mobile_push_registrations WHERE user_id=?1 AND enabled=1 LIMIT 257")?;
            let rows=statement.query_map([user],|r| Ok(PushRegistration{device_id:r.get(0)?,user_id:r.get(1)?,token:r.get(2)?}))?.collect::<std::result::Result<Vec<_>,_>>()?;
            if rows.len()>MAX_DEVICES { return Err(std::io::Error::other("Mobile push device limit exceeded").into()); }
            Ok(rows)
        }).await.map_err(|e|e.to_string())
    }
    async fn request(&self, request: PushRequest) -> Result<PushResponse> {
        if request.body.len() > MAX_RESPONSE {
            return Err("Mobile push request exceeds byte limit".into());
        }
        tokio::time::timeout(Duration::from_secs(30), (self.transport)(request))
            .await
            .map_err(|_| "Mobile push request timed out".to_string())?
    }
    async fn access_token(&self, account: &FirebaseServiceAccount) -> Result<String> {
        // One refresh per account, with a bounded wait; dropping a caller releases
        // network futures and lock ownership. Signing uses the shared CPU lane.
        let mut cached = tokio::time::timeout(Duration::from_secs(35), self.token.lock())
            .await
            .map_err(|_| "Mobile push token refresh busy")?;
        let now = (self.clock)();
        if let Some(token) = cached
            .as_ref()
            .filter(|t| t.expires_at > now.saturating_add(60_000))
        {
            return Ok(token.value.clone());
        }
        let account = account.clone();
        let seconds = now.div_euclid(1000);
        let assertion=self.signing_lane.run(move || {
            use rsa::{pkcs1::EncodeRsaPrivateKey, pkcs8::DecodePrivateKey};
            if account.private_key.len() > MAX_RESPONSE { return Err("Firebase signing key exceeds byte limit".to_string()); }
            let parsed = rsa::RsaPrivateKey::from_pkcs8_pem(&account.private_key).map_err(|_|"Invalid Firebase signing key".to_string())?;
            let der = parsed.to_pkcs1_der().map_err(|_|"Invalid Firebase signing key".to_string())?;
            let key=jsonwebtoken::EncodingKey::from_rsa_der(der.as_bytes());
            jsonwebtoken::encode(&jsonwebtoken::Header::new(jsonwebtoken::Algorithm::RS256),
                &json!({"scope":"https://www.googleapis.com/auth/firebase.messaging","iss":account.client_email,
                    "sub":account.client_email,"aud":"https://oauth2.googleapis.com/token","iat":seconds,"exp":seconds.saturating_add(3600)}),&key)
                .map_err(|_|"Firebase assertion signing failed".to_string())
        }).await.map_err(|e|e.to_string())??;
        let body = url::form_urlencoded::Serializer::new(String::new())
            .append_pair("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer")
            .append_pair("assertion", &assertion)
            .finish();
        let response = self
            .request(PushRequest {
                endpoint: PushEndpoint::OAuth,
                bearer: None,
                body,
            })
            .await?;
        if !(200..300).contains(&response.status) {
            return Err(format!("Firebase OAuth failed ({})", response.status));
        }
        let value = response.body["access_token"]
            .as_str()
            .filter(|v| !v.is_empty() && v.len() <= 16_384)
            .ok_or("Invalid Firebase access token")?
            .to_owned();
        let expires = response
            .body
            .get("expires_in")
            .and_then(Value::as_f64)
            .unwrap_or(3600.0);
        if !expires.is_finite() || !(0.0..=86_400.0).contains(&expires) {
            return Err("Invalid Firebase token expiry".into());
        }
        *cached = Some(AccessToken {
            value: value.clone(),
            expires_at: (self.clock)().saturating_add((expires * 1000.0) as i64),
        });
        Ok(value)
    }
    async fn send_data(
        &self,
        registration: &PushRegistration,
        data: BTreeMap<String, String>,
        ttl: Option<&str>,
        alarm: bool,
    ) -> Result<()> {
        let Some(account) = &self.account else {
            return Ok(());
        };
        let _permit = self
            .sends
            .try_acquire()
            .map_err(|_| "Mobile push capacity exhausted")?;
        let token = self.access_token(account).await?;
        let mut android = json!({"priority":"high"});
        if let Some(ttl) = ttl {
            android["ttl"] = json!(ttl);
        }
        let body = json!({"message":{"token":registration.token,"data":data,"android":android}})
            .to_string();
        let response = self
            .request(PushRequest {
                endpoint: PushEndpoint::Fcm {
                    project_id: account.project_id.clone(),
                },
                bearer: Some(token),
                body,
            })
            .await?;
        if (200..300).contains(&response.status) {
            return Ok(());
        }
        if !alarm && matches!(response.status, 400 | 404) {
            let row = registration.clone();
            // An old failed delivery must not remove a freshly rotated token or
            // the registration now owned by a different authenticated user.
            self.database.run(move |db| {db.execute("DELETE FROM mobile_push_registrations WHERE device_id=?1 AND user_id=?2 AND token=?3",params![row.device_id,row.user_id,row.token])?;Ok(())}).await.map_err(|e|e.to_string())?;
        }
        Err(format!(
            "FCM {}send failed ({})",
            if alarm { "alarm " } else { "" },
            response.status
        ))
    }
    async fn deliver(
        &self,
        registrations: Vec<PushRegistration>,
        data: BTreeMap<String, String>,
        ttl: Option<String>,
        best_effort: bool,
        alarm: bool,
    ) -> Result<usize> {
        let count = registrations.len();
        if count > MAX_DEVICES
            || data
                .iter()
                .try_fold(0_usize, |sum, (key, value)| {
                    sum.checked_add(key.len())?.checked_add(value.len())
                })
                .is_none_or(|bytes| bytes > MAX_RESPONSE)
        {
            return Err("Mobile push delivery exceeds batch/payload budget".into());
        }
        // Own each registration across its future. Type erasure avoids holding
        // a borrowed iterator closure across an AttentionSink Send boundary.
        // At most 256 bounded payloads and eight network effects are resident.
        let tasks: Vec<BoxFuture<'_, Result<()>>> = registrations
            .into_iter()
            .map(|registration| {
                let data = data.clone();
                let ttl = ttl.clone();
                Box::pin(async move {
                    self.send_data(&registration, data, ttl.as_deref(), alarm)
                        .await
                }) as BoxFuture<'_, Result<()>>
            })
            .collect();
        let results = futures_util::stream::iter(tasks)
            .buffered(8)
            .collect::<Vec<_>>()
            .await;
        if !best_effort {
            for result in results {
                result?;
            }
        }
        Ok(count)
    }
    pub async fn schedule_alarm(
        &self,
        user: &str,
        id: &str,
        at: f64,
        title: &str,
        body: &str,
    ) -> Result<usize> {
        if self.account.is_none() {
            return Ok(0);
        }
        let data = BTreeMap::from([
            ("type".into(), "alarm.schedule".into()),
            ("id".into(), id.into()),
            ("at".into(), ryu_js::Buffer::new().format(at).to_owned()),
            ("title".into(), title.into()),
            ("body".into(), body.into()),
        ]);
        self.deliver(
            self.list(user).await?,
            data,
            Some("86400s".into()),
            false,
            true,
        )
        .await
    }
    pub async fn send_attention(&self, item: &AttentionItem) -> Result<()> {
        let Some(user) = item.user_id.as_deref().filter(|u| !u.is_empty()) else {
            return Ok(());
        };
        if self.account.is_none() {
            return Ok(());
        }
        let ttl = item
            .data
            .expires_at
            .as_deref()
            .map(|s| {
                chrono::DateTime::parse_from_rfc3339(s)
                    .map(|d| {
                        format!(
                            "{}s",
                            ((d.timestamp_millis().saturating_sub((self.clock)())) as f64 / 1000.0)
                                .floor()
                                .max(0.0)
                        )
                    })
                    .map_err(|_| "Invalid attention expiry".to_string())
            })
            .transpose()?;
        let data = BTreeMap::from([
            ("type".into(), "attention.raised".into()),
            ("key".into(), item.key.clone()),
            (
                "item".into(),
                serde_json::to_string(item).map_err(|_| "Cannot serialize attention item")?,
            ),
        ]);
        self.deliver(self.list(user).await?, data, ttl, false, false)
            .await?;
        Ok(())
    }
    pub async fn send_attention_cleared(&self, event: &AttentionCleared) -> Result<()> {
        let Some(user) = event.user_id.as_deref().filter(|u| !u.is_empty()) else {
            return Ok(());
        };
        if self.account.is_none() {
            return Ok(());
        }
        let kind =
            serde_json::to_value(event.kind).map_err(|_| "Cannot serialize attention kind")?;
        let reason =
            serde_json::to_value(event.reason).map_err(|_| "Cannot serialize attention reason")?;
        let data = BTreeMap::from([
            ("type".into(), "attention.cleared".into()),
            ("key".into(), event.key.clone()),
            ("kind".into(), kind.as_str().unwrap_or("").into()),
            ("requestId".into(), event.request_id.clone()),
            ("reason".into(), reason.as_str().unwrap_or("").into()),
        ]);
        self.deliver(
            attention_revoke_targets(self.list(user).await?, event.resolved_by.as_deref()),
            data,
            Some("60s".into()),
            false,
            false,
        )
        .await?;
        Ok(())
    }
    pub async fn send_chat_completed(
        &self,
        user: &str,
        notification: &Map<String, Value>,
    ) -> Result<usize> {
        if self.account.is_none() {
            return Ok(0);
        }
        let mut data = BTreeMap::from([("type".into(), "chat.completed".into())]);
        for key in ["id", "title", "body"] {
            data.insert(
                key.into(),
                notification
                    .get(key)
                    .and_then(Value::as_str)
                    .ok_or("Invalid chat notification")?
                    .into(),
            );
        }
        for key in ["link", "replaceId", "sessionId"] {
            if let Some(value) = notification
                .get(key)
                .and_then(Value::as_str)
                .filter(|v| !v.is_empty())
            {
                data.insert(key.into(), value.into());
            }
        }
        self.deliver(
            self.list(user).await?,
            data,
            Some("3600s".into()),
            true,
            false,
        )
        .await
    }
    pub async fn send_chat_notification_read(
        &self,
        user: &str,
        id: &str,
        session_id: &str,
        replace_id: &str,
    ) -> Result<()> {
        if self.account.is_none() {
            return Ok(());
        }
        let data = BTreeMap::from([
            ("type".into(), "chat.notification-read".into()),
            ("id".into(), id.into()),
            ("sessionId".into(), session_id.into()),
            ("replaceId".into(), replace_id.into()),
        ]);
        self.deliver(
            self.list(user).await?,
            data,
            Some("3600s".into()),
            true,
            false,
        )
        .await?;
        Ok(())
    }
}
