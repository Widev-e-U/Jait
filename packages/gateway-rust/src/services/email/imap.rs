//! IMAP domain behavior over explicit native protocol ports.
//! No TypeScript sidecar. The runtime must supply a real TLS IMAP/SMTP adapter.
//! Host sessions MUST synchronously initiate socket close in Drop, including on
//! timeout/caller cancellation. STARTTLS is mandatory when `secure` is false;
//! verify certificates using `servername`, connect only to the pinned IP, disable
//! protocol logging, and never load files or URLs while constructing MIME.
use super::{
    connection::{PinnedMailServer, public_mail_server},
    contracts::*,
    remote_images::ImageResolver,
};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use futures_util::future::BoxFuture;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::{sync::Arc, time::Duration};
pub const MAX_MESSAGE_BYTES: usize = 10 * 1024 * 1024;
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct ImapMessageId {
    pub folder: String,
    pub validity: String,
    pub uid: u64,
}
pub fn parse_imap_message_id(id: &str) -> Result<ImapMessageId, String> {
    let parse = || -> Option<ImapMessageId> {
        if id.len() > 2048 {
            return None;
        }
        let bytes = URL_SAFE_NO_PAD.decode(id.trim_end_matches('=')).ok()?;
        let v: serde_json::Value = serde_json::from_slice(&bytes).ok()?;
        let a = v.as_array()?;
        let folder = a.first()?.as_str()?;
        let validity = a.get(1)?.as_str()?;
        let uid_value = a.get(2)?.as_f64()?;
        if !uid_value.is_finite()
            || uid_value.fract() != 0.0
            || !(1.0..=9_007_199_254_740_991.0).contains(&uid_value)
        {
            return None;
        }
        let uid = uid_value as u64;
        if folder.is_empty()
            || folder.encode_utf16().count() > 1024
            || folder.contains(['\r', '\n', '\0'])
            || validity.is_empty()
            || !validity.bytes().all(|b| b.is_ascii_digit())
            || uid == 0
            || uid > 9_007_199_254_740_991
        {
            return None;
        }
        Some(ImapMessageId {
            folder: folder.into(),
            validity: validity.into(),
            uid,
        })
    };
    parse().ok_or("Invalid IMAP message id".into())
}
fn message_id(state: &MailboxState, uid: u64) -> String {
    URL_SAFE_NO_PAD.encode(json!([state.path, state.uid_validity, uid]).to_string())
}
#[derive(Clone, Copy)]
pub struct ProtocolLimits {
    pub connect_ms: u64,
    pub greeting_ms: u64,
    pub socket_ms: u64,
    pub operation_ms: u64,
    pub max_message_bytes: usize,
    pub max_items: usize,
}
impl Default for ProtocolLimits {
    fn default() -> Self {
        Self {
            connect_ms: 8000,
            greeting_ms: 8000,
            socket_ms: 15_000,
            operation_ms: 30_000,
            max_message_bytes: MAX_MESSAGE_BYTES,
            max_items: 200,
        }
    }
}
#[derive(Clone, Debug)]
pub struct MailboxState {
    pub path: String,
    pub uid_validity: String,
    pub exists: u64,
}
#[derive(Clone, Debug)]
pub struct HostFolder {
    pub path: String,
    pub name: String,
    pub special_use: Option<String>,
}
#[derive(Clone, Debug)]
pub struct Envelope {
    pub from: String,
    pub to: String,
    pub subject: String,
    pub date: String,
}
#[derive(Clone, Debug)]
pub struct HostMessage {
    pub uid: u64,
    pub envelope: Envelope,
    pub flags: Vec<String>,
    pub size: Option<usize>,
    pub has_attachments: bool,
    pub source: Option<Vec<u8>>,
}
#[derive(Clone, Debug)]
pub enum FetchRange {
    Uids(Vec<u64>),
    Sequence { start: u64 },
}
#[derive(Clone, Debug)]
pub struct ParsedMime {
    pub cc: String,
    pub text: String,
    pub html: String,
    pub attachment_count: usize,
    pub reply_to: Option<String>,
    pub message_id: Option<String>,
    pub references: Vec<String>,
}
/// All inputs are literal typed protocol data, never command strings. A host
/// must cap FETCH and SEARCH while reading, before allocation, not after return.
pub trait ImapSession: Send {
    fn select<'a>(
        &'a mut self,
        folder: &'a str,
        read_only: bool,
    ) -> BoxFuture<'a, Result<MailboxState, String>>;
    fn folders(&mut self, max: usize) -> BoxFuture<'_, Result<Vec<HostFolder>, String>>;
    fn search_tail<'a>(
        &'a mut self,
        query: &'a str,
        max: usize,
    ) -> BoxFuture<'a, Result<Vec<u64>, String>>;
    fn fetch(
        &mut self,
        range: FetchRange,
        source: bool,
        max_items: usize,
        max_bytes: usize,
    ) -> BoxFuture<'_, Result<Vec<HostMessage>, String>>;
    fn flag<'a>(
        &'a mut self,
        uid: u64,
        flag: &'a str,
        add: bool,
    ) -> BoxFuture<'a, Result<(), String>>;
    fn move_message<'a>(
        &'a mut self,
        uid: u64,
        folder: &'a str,
    ) -> BoxFuture<'a, Result<(), String>>;
}
#[derive(Clone, Debug)]
pub struct SmtpMessage {
    pub from_name: String,
    pub from_address: String,
    pub to: String,
    pub cc: Option<String>,
    pub bcc: Option<String>,
    pub subject: String,
    pub body: String,
    pub html: bool,
    pub in_reply_to: Option<String>,
    pub references: Vec<String>,
}
pub trait MailProtocolHost: Send + Sync {
    fn imap(
        &self,
        server: PinnedMailServer,
        limits: ProtocolLimits,
    ) -> BoxFuture<'_, Result<Box<dyn ImapSession>, String>>;
    /// None verifies SMTP authentication without sending. Some sends exactly once;
    /// failure/timeout after SMTP DATA may mean delivery is unknown. Never retry.
    fn smtp(
        &self,
        server: PinnedMailServer,
        limits: ProtocolLimits,
        message: Option<SmtpMessage>,
    ) -> BoxFuture<'_, Result<Option<String>, String>>;
    fn parse_mime(
        &self,
        source: Vec<u8>,
        max_html_bytes: usize,
    ) -> BoxFuture<'_, Result<ParsedMime, String>>;
}
#[derive(Clone)]
pub struct ImapMailboxClient {
    config: ConnectMailboxInput,
    host: Arc<dyn MailProtocolHost>,
    resolve: ImageResolver,
}
fn summary(state: &MailboxState, m: &HostMessage) -> EmailMessageSummary {
    EmailMessageSummary {
        id: message_id(state, m.uid),
        thread_id: None,
        from: m.envelope.from.clone(),
        to: m.envelope.to.clone(),
        subject: m.envelope.subject.clone(),
        date: m.envelope.date.clone(),
        snippet: String::new(),
        unread: !m.flags.iter().any(|f| f == "\\Seen"),
        labels: m
            .flags
            .iter()
            .map(|f| {
                if f == "\\Flagged" {
                    "STARRED".into()
                } else {
                    f.clone()
                }
            })
            .collect(),
        has_attachments: m.has_attachments,
    }
}
async fn bounded<T>(
    future: impl std::future::Future<Output = Result<T, String>>,
) -> Result<T, String> {
    tokio::time::timeout(Duration::from_secs(30), future)
        .await
        .map_err(|_| "Mailbox operation timed out")?
}
impl ImapMailboxClient {
    pub fn new(
        config: ConnectMailboxInput,
        host: Arc<dyn MailProtocolHost>,
        resolve: ImageResolver,
    ) -> Result<Self, String> {
        let config = super::connection::connect_mailbox(
            serde_json::to_value(config).map_err(|e| e.to_string())?,
        )?;
        Ok(Self {
            config,
            host,
            resolve,
        })
    }
    async fn connect(&self) -> Result<Box<dyn ImapSession>, String> {
        let server = public_mail_server(&self.config.imap, &self.resolve).await?;
        self.host.imap(server, ProtocolLimits::default()).await
    }
    pub async fn verify(&self) -> Result<(), String> {
        bounded(async {
            let session = self.connect().await?;
            drop(session);
            let server = public_mail_server(&self.config.smtp, &self.resolve).await?;
            self.host
                .smtp(server, ProtocolLimits::default(), None)
                .await?;
            Ok(())
        })
        .await
    }
    pub async fn list_messages(
        &self,
        _token: &str,
        opts: ListMessagesOptions,
    ) -> Result<Vec<EmailMessageSummary>, String> {
        bounded(async {
            let mut session = self.connect().await?;
            let folder = opts
                .folder
                .as_deref()
                .filter(|s| !s.is_empty() && !s.eq_ignore_ascii_case("inbox"))
                .unwrap_or("INBOX");
            if folder.encode_utf16().count() > 1024 || folder.contains(['\r', '\n', '\0']) {
                return Err("Invalid mailbox folder".into());
            }
            let state = session.select(folder, true).await?;
            if state.exists == 0 {
                return Ok(vec![]);
            }
            let limit = super::transport::limit(opts.limit, 50, 100);
            let range = if let Some(query) = opts.query.filter(|q| !q.is_empty()) {
                let query: String = query.chars().take(1000).collect();
                let ids = session.search_tail(&query, limit).await?;
                if ids.len() > limit {
                    return Err("IMAP host exceeded search limit".into());
                }
                if ids.is_empty() {
                    return Ok(vec![]);
                }
                FetchRange::Uids(ids)
            } else {
                FetchRange::Sequence {
                    start: state
                        .exists
                        .saturating_sub(limit as u64)
                        .saturating_add(1)
                        .max(1),
                }
            };
            let messages = session
                .fetch(range, false, limit, MAX_MESSAGE_BYTES)
                .await?;
            if messages.len() > limit {
                return Err("IMAP host exceeded message limit".into());
            }
            Ok(messages.iter().rev().map(|m| summary(&state, m)).collect())
        })
        .await
    }
    async fn read(&self, id: &str) -> Result<(EmailMessageFull, ParsedMime), String> {
        let id = parse_imap_message_id(id)?;
        let mut session = self.connect().await?;
        let state = session.select(&id.folder, true).await?;
        if state.uid_validity != id.validity {
            return Err("Mailbox changed. Refresh the message list.".into());
        }
        let mut infos = session
            .fetch(FetchRange::Uids(vec![id.uid]), false, 1, MAX_MESSAGE_BYTES)
            .await?;
        if infos.len() > 1 {
            return Err("IMAP host exceeded message limit".into());
        }
        let info = infos.pop().ok_or("Message no longer exists")?;
        if !info.size.is_some_and(|s| s > 0 && s <= MAX_MESSAGE_BYTES) {
            return Err("Message exceeds the 10 MiB reading limit".into());
        }
        let mut messages = session
            .fetch(FetchRange::Uids(vec![id.uid]), true, 1, MAX_MESSAGE_BYTES)
            .await?;
        if messages.len() > 1 {
            return Err("IMAP host exceeded message limit".into());
        }
        let mut m = messages.pop().ok_or("Message content unavailable")?;
        if m.uid != id.uid {
            return Err("IMAP host returned the wrong message".into());
        }
        let source = m.source.take().ok_or("Message content unavailable")?;
        if source.len() > MAX_MESSAGE_BYTES {
            return Err("Message exceeds the 10 MiB reading limit".into());
        }
        let parsed = self.host.parse_mime(source, MAX_MESSAGE_BYTES).await?;
        if parsed.text.len().saturating_add(parsed.html.len()) > 2 * MAX_MESSAGE_BYTES
            || parsed.references.len() > 1000
        {
            return Err("Parsed message exceeds limits".into());
        }
        let mut summary = summary(&state, &m);
        summary.has_attachments = parsed.attachment_count > 0;
        summary.snippet = parsed.text.chars().take(200).collect();
        Ok((
            EmailMessageFull {
                summary,
                cc: parsed.cc.clone(),
                body_text: parsed.text.clone(),
                body_html: parsed.html.clone(),
            },
            parsed,
        ))
    }
    pub async fn get_message(&self, _token: &str, id: &str) -> Result<EmailMessageFull, String> {
        bounded(async { Ok(self.read(id).await?.0) }).await
    }
    pub async fn send_message(
        &self,
        _token: &str,
        input: SendMessageInput,
    ) -> Result<SentMessage, String> {
        bounded(async {
            let input = super::connection::provider_send_email(input)?;
            let original = if let Some(id) = &input.reply_to_message_id {
                Some(self.read(id).await?)
            } else {
                None
            };
            let to = if !input.to.is_empty() {
                input.to.clone()
            } else {
                original
                    .as_ref()
                    .map(|(f, p)| {
                        p.reply_to
                            .clone()
                            .filter(|s| !s.is_empty())
                            .unwrap_or(f.summary.from.clone())
                    })
                    .unwrap_or_default()
            };
            if to.is_empty() || to.contains(['\r', '\n', '\0']) {
                return Err("Invalid recipient or subject".into());
            }
            let subject = if !input.subject.is_empty() {
                input.subject.clone()
            } else if let Some((full, _)) = &original {
                format!(
                    "Re: {}",
                    regex::Regex::new("(?i)^Re:\\s*")
                        .unwrap()
                        .replace(&full.summary.subject, "")
                )
            } else {
                String::new()
            };
            if subject.contains(['\r', '\n', '\0']) {
                return Err("Invalid recipient or subject".into());
            }
            let (in_reply_to, mut references) = original
                .as_ref()
                .map(|(_, p)| (p.message_id.clone(), p.references.clone()))
                .unwrap_or_default();
            if let Some(id) = &in_reply_to {
                if id.contains(['\r', '\n', '\0'])
                    || references.iter().any(|r| r.contains(['\r', '\n', '\0']))
                {
                    return Err("Invalid message references".into());
                }
                references.push(id.clone());
            }
            let server = public_mail_server(&self.config.smtp, &self.resolve).await?;
            let id = self
                .host
                .smtp(
                    server,
                    ProtocolLimits::default(),
                    Some(SmtpMessage {
                        from_name: self.config.display_name.clone().unwrap_or_default(),
                        from_address: self.config.email.clone(),
                        to,
                        cc: input.cc,
                        bcc: input.bcc,
                        subject,
                        body: input.body,
                        html: input.html == Some(true),
                        in_reply_to,
                        references,
                    }),
                )
                .await?
                .ok_or("SMTP host did not return a message id")?;
            Ok(SentMessage { id })
        })
        .await
    }
    pub async fn tag_message(
        &self,
        _token: &str,
        id: &str,
        add: Vec<String>,
        remove: Vec<String>,
    ) -> Result<(), String> {
        bounded(async {
            let id = parse_imap_message_id(id)?;
            let mut session = self.connect().await?;
            let state = session.select(&id.folder, false).await?;
            if state.uid_validity != id.validity {
                return Err("Mailbox changed. Refresh first.".into());
            }
            for (labels, adding) in [(add, true), (remove, false)] {
                for label in labels.into_iter().take(20) {
                    let upper = label.to_uppercase();
                    let flag = match upper.as_str() {
                        "STARRED" => "\\Flagged",
                        "UNREAD" => "\\Seen",
                        _ => {
                            if label.is_empty()
                                || label.len() > 64
                                || !label
                                    .bytes()
                                    .all(|b| b.is_ascii_alphanumeric() || b"_-".contains(&b))
                            {
                                return Err("Unsupported mailbox label".into());
                            }
                            &label
                        }
                    };
                    session
                        .flag(
                            id.uid,
                            flag,
                            if upper == "UNREAD" { !adding } else { adding },
                        )
                        .await?;
                }
            }
            Ok(())
        })
        .await
    }
    pub async fn delete_message(&self, _token: &str, id: &str) -> Result<(), String> {
        bounded(async {
            let id = parse_imap_message_id(id)?;
            let mut session = self.connect().await?;
            let folders = session.folders(200).await?;
            if folders.len() > 200 {
                return Err("IMAP host exceeded folder limit".into());
            }
            let trash = folders
                .iter()
                .find(|f| f.special_use.as_deref() == Some("\\Trash"))
                .ok_or("No separate Trash folder is available; permanent deletion is disabled.")?;
            if trash.path == id.folder {
                return Err(
                    "No separate Trash folder is available; permanent deletion is disabled.".into(),
                );
            }
            let state = session.select(&id.folder, false).await?;
            if state.uid_validity != id.validity {
                return Err("Mailbox changed. Refresh first.".into());
            }
            session.move_message(id.uid, &trash.path).await
        })
        .await
    }
    pub async fn list_folders(&self, _token: &str) -> Result<Vec<EmailFolder>, String> {
        bounded(async {
            let mut session = self.connect().await?;
            let folders = session.folders(200).await?;
            if folders.len() > 200 {
                return Err("IMAP host exceeded folder limit".into());
            }
            Ok(folders
                .into_iter()
                .map(|f| EmailFolder {
                    id: f.path,
                    name: f.name,
                    unread_count: None,
                })
                .collect())
        })
        .await
    }
    pub async fn get_profile_email(&self, _token: &str) -> Result<String, String> {
        Ok(self.config.email.clone())
    }
}
super::impl_mailbox_client!(ImapMailboxClient);
