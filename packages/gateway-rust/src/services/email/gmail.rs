//! Gmail REST mailbox. Provider I/O is bounded and sequential; no account calls at construction.
use super::{
    contracts::*,
    inline_images::{embed_inline_images, inline_image_data},
    transport::{self, Transport, array, enc, required, text},
};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use serde_json::{Value, json};
use std::collections::{HashMap, VecDeque};
#[derive(Clone)]
pub struct GmailClient {
    http: Transport,
}
fn header(part: &Value, name: &str) -> String {
    part["headers"]
        .as_array()
        .and_then(|h| {
            h.iter().find(|h| {
                h["name"]
                    .as_str()
                    .is_some_and(|s| s.eq_ignore_ascii_case(name))
            })
        })
        .map(|h| text(h, "value"))
        .unwrap_or_default()
}
fn decode(s: &str) -> String {
    let normalized = s.replace('-', "+").replace('_', "/");
    String::from_utf8_lossy(
        &base64::engine::general_purpose::STANDARD_NO_PAD
            .decode(normalized.trim_end_matches('='))
            .unwrap_or_default(),
    )
    .into_owned()
}

fn label_id(s: &str) -> String {
    match s.to_ascii_lowercase().as_str() {
        "inbox" => "INBOX",
        "sent" => "SENT",
        "draft" | "drafts" => "DRAFT",
        "spam" => "SPAM",
        "trash" => "TRASH",
        "starred" => "STARRED",
        "important" => "IMPORTANT",
        "unread" => "UNREAD",
        _ => s,
    }
    .into()
}
fn summary(m: &Value, labels: &HashMap<String, String>) -> Result<EmailMessageSummary, String> {
    let ids = array(m, "labelIds")?;
    Ok(EmailMessageSummary {
        id: required(m, "id")?,
        thread_id: m["threadId"].as_str().map(String::from),
        from: header(&m["payload"], "From"),
        to: header(&m["payload"], "To"),
        subject: header(&m["payload"], "Subject"),
        date: header(&m["payload"], "Date"),
        snippet: text(m, "snippet"),
        unread: ids.iter().any(|s| s == "UNREAD"),
        labels: ids
            .iter()
            .filter_map(|s| s.as_str())
            .filter(|s| !s.starts_with("CATEGORY_"))
            .map(|s| labels.get(s).cloned().unwrap_or(s.into()))
            .collect(),
        has_attachments: false,
    })
}
impl GmailClient {
    pub fn new(http: Transport) -> Self {
        Self { http }
    }
    async fn request(
        &self,
        token: &str,
        path: &str,
        method: &str,
        body: Option<Value>,
    ) -> Result<Value, String> {
        transport::api(&self.http, "gmail", token, path, method, body, false).await
    }
    async fn labels(
        &self,
        token: &str,
    ) -> Result<(HashMap<String, String>, HashMap<String, String>), String> {
        let data = self.request(token, "/labels", "GET", None).await?;
        let mut ids = HashMap::new();
        let mut names = HashMap::new();
        for l in array(&data, "labels")? {
            let id = required(l, "id")?;
            let name = required(l, "name")?;
            names.insert(name.to_lowercase(), id.clone());
            ids.insert(id, name);
        }
        Ok((ids, names))
    }
    pub async fn list_messages(
        &self,
        token: &str,
        opts: ListMessagesOptions,
    ) -> Result<Vec<EmailMessageSummary>, String> {
        let path = {
            let mut q = url::form_urlencoded::Serializer::new(String::new());
            q.append_pair(
                "maxResults",
                &transport::limit(opts.limit, 25, 50).to_string(),
            );
            if let Some(query) = opts.query.as_deref().filter(|s| !s.is_empty()) {
                q.append_pair("q", query);
            }
            if let Some(folder) = opts
                .folder
                .as_deref()
                .filter(|s| !s.is_empty() && !s.eq_ignore_ascii_case("all"))
            {
                q.append_pair("labelIds", &label_id(folder));
            }
            format!("/messages?{}", q.finish())
        };
        let data = self.request(token, &path, "GET", None).await?;
        let messages = array(&data, "messages")?;
        if messages.is_empty() {
            return Ok(vec![]);
        }
        if messages.len() > 50 {
            return Err("Gmail returned too many messages".into());
        }
        let (labels, _) = self.labels(token).await?;
        let mut result = Vec::new();
        for m in messages {
            let id = required(m, "id")?;
            let data=self.request(token,&format!("/messages/{}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date",enc(&id)),"GET",None).await?;
            result.push(summary(&data, &labels)?);
        }
        Ok(result)
    }
    pub async fn get_message(&self, token: &str, id: &str) -> Result<EmailMessageFull, String> {
        let m = self
            .request(
                token,
                &format!("/messages/{}?format=full", enc(id)),
                "GET",
                None,
            )
            .await?;
        let (labels, _) = self.labels(token).await?;
        let mut summary = summary(&m, &labels)?;
        let mut body_text = String::new();
        let mut html = String::new();
        let mut stack = vec![&m["payload"]];
        let mut parts = Vec::new();
        while let Some(part) = stack.pop() {
            if parts.len() >= 1000 {
                return Err("Gmail MIME tree is too large".into());
            }
            parts.push(part);
            if !text(part, "filename").is_empty() {
                summary.has_attachments = true;
            }
            match part["mimeType"].as_str().unwrap_or("") {
                "text/plain" if body_text.is_empty() => {
                    body_text = decode(part["body"]["data"].as_str().unwrap_or(""))
                }
                "text/html" if html.is_empty() => {
                    html = decode(part["body"]["data"].as_str().unwrap_or(""))
                }
                _ => {}
            }
            for child in array(part, "parts")?.iter().rev() {
                stack.push(child);
            }
        }
        if html.to_lowercase().contains("cid:") {
            let mut images = HashMap::new();
            let mut queue = VecDeque::from([&m["payload"]]);
            let mut visited = 0;
            while let Some(part) = queue.pop_front() {
                visited += 1;
                if visited > 1000 || images.len() >= 12 {
                    break;
                }
                queue.extend(array(part, "parts")?);
                let cid = header(part, "Content-ID")
                    .trim_start_matches('<')
                    .trim_end_matches('>')
                    .to_string();
                let mime = text(part, "mimeType");
                if cid.is_empty()
                    || !html.contains(&format!("cid:{cid}"))
                    || inline_image_data(&mime, "AA==").is_none()
                    || part["body"]["size"].as_u64().unwrap_or(0) > 1024 * 1024
                {
                    continue;
                }
                let data =
                    if let Some(raw) = part["body"]["data"].as_str().filter(|s| !s.is_empty()) {
                        Some(raw.to_string())
                    } else if let Some(aid) = part["body"]["attachmentId"].as_str() {
                        self.request(
                            token,
                            &format!("/messages/{}/attachments/{}", enc(id), enc(aid)),
                            "GET",
                            None,
                        )
                        .await
                        .ok()
                        .and_then(|v| v["data"].as_str().map(String::from))
                    } else {
                        None
                    };
                if let Some(data) = data.and_then(|s| inline_image_data(&mime, &s)) {
                    images.insert(cid, data);
                }
            }
            html = embed_inline_images(&html, &images);
        }
        Ok(EmailMessageFull {
            summary,
            cc: header(&m["payload"], "Cc"),
            body_text,
            body_html: html,
        })
    }
    pub async fn send_message(
        &self,
        token: &str,
        input: SendMessageInput,
    ) -> Result<SentMessage, String> {
        let input = super::connection::provider_send_email(input)?;
        let mut lines = vec![format!("To: {}", input.to)];
        for (name, value) in [("Cc", input.cc.as_deref()), ("Bcc", input.bcc.as_deref())] {
            if let Some(value) = value.filter(|s| !s.is_empty()) {
                lines.push(format!("{name}: {value}"));
            }
        }
        lines.extend([
            format!("Subject: {}", input.subject),
            "MIME-Version: 1.0".into(),
            format!(
                "Content-Type: {}; charset=UTF-8",
                if input.html == Some(true) {
                    "text/html"
                } else {
                    "text/plain"
                }
            ),
            String::new(),
            input.body,
        ]);
        let mut body = json!({"raw":URL_SAFE_NO_PAD.encode(lines.join("\r\n"))});
        if let Some(id) = input.reply_to_message_id {
            let m = self
                .request(
                    token,
                    &format!("/messages/{}?format=metadata", enc(&id)),
                    "GET",
                    None,
                )
                .await?;
            if let Some(t) = m
                .get("threadId")
                .filter(|v| v.as_str().is_some_and(|s| !s.is_empty()))
            {
                body["threadId"] = t.clone();
            }
        }
        let sent = self
            .request(token, "/messages/send", "POST", Some(body))
            .await?;
        Ok(SentMessage {
            id: required(&sent, "id")?,
        })
    }
    pub async fn tag_message(
        &self,
        token: &str,
        id: &str,
        add: Vec<String>,
        remove: Vec<String>,
    ) -> Result<(), String> {
        if add.len() + remove.len() > 100 {
            return Err("Too many email labels".into());
        }
        let (_, mut names) = self.labels(token).await?;
        let mut resolved = Vec::new();
        for labels in [add, remove] {
            let mut ids = Vec::new();
            for name in labels {
                let builtin = name.to_uppercase();
                let key = name.to_lowercase();
                let id = if ["INBOX", "UNREAD", "STARRED", "IMPORTANT", "SPAM", "TRASH"]
                    .contains(&builtin.as_str())
                {
                    builtin
                } else if let Some(id) = names.get(&key) {
                    id.clone()
                } else {
                    let created=self.request(token,"/labels","POST",Some(json!({"name":name,"labelListVisibility":"labelShow","messageListVisibility":"show"}))).await?;
                    let id = required(&created, "id")?;
                    names.insert(key, id.clone());
                    id
                };
                ids.push(id);
            }
            resolved.push(ids);
        }
        self.request(
            token,
            &format!("/messages/{}/modify", enc(id)),
            "POST",
            Some(json!({"addLabelIds":resolved[0],"removeLabelIds":resolved[1]})),
        )
        .await?;
        Ok(())
    }
    pub async fn delete_message(&self, token: &str, id: &str) -> Result<(), String> {
        self.request(token, &format!("/messages/{}/trash", enc(id)), "POST", None)
            .await?;
        Ok(())
    }
    pub async fn list_folders(&self, token: &str) -> Result<Vec<EmailFolder>, String> {
        let data = self.request(token, "/labels", "GET", None).await?;
        array(&data, "labels")?
            .iter()
            .filter(|l| !text(l, "id").starts_with("CATEGORY_"))
            .map(|l| {
                Ok(EmailFolder {
                    id: required(l, "id")?,
                    name: required(l, "name")?,
                    unread_count: None,
                })
            })
            .collect()
    }
    pub async fn get_profile_email(&self, token: &str) -> Result<String, String> {
        Ok(text(
            &self.request(token, "/profile", "GET", None).await?,
            "emailAddress",
        ))
    }
}
super::impl_mailbox_client!(GmailClient);
