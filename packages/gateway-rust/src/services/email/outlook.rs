//! Microsoft Graph mailbox implementation.
use super::{
    contracts::*,
    inline_images::{embed_inline_images, inline_image_data},
    transport::{self, Transport, array, enc, required, text},
};
use serde_json::{Value, json};
use std::collections::HashMap;
#[derive(Clone)]
pub struct OutlookClient {
    http: Transport,
}
fn recipient(v: &Value) -> String {
    let e = &v["emailAddress"];
    let address = text(e, "address");
    let name = text(e, "name");
    if name.is_empty() {
        address
    } else {
        format!("{name} <{address}>")
    }
}
fn recipients(v: &Value) -> String {
    v.as_array()
        .map(|a| {
            a.iter()
                .map(recipient)
                .filter(|s| !s.is_empty())
                .collect::<Vec<_>>()
                .join(", ")
        })
        .unwrap_or_default()
}
fn to_recipients(s: &str) -> Vec<Value> {
    s.split([',', ';'])
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| json!({"emailAddress":{"address":s}}))
        .collect()
}
fn summary(m: &Value) -> Result<EmailMessageSummary, String> {
    Ok(EmailMessageSummary {
        id: required(m, "id")?,
        thread_id: m["conversationId"].as_str().map(String::from),
        from: recipient(&m["from"]),
        to: recipients(&m["toRecipients"]),
        subject: text(m, "subject"),
        snippet: text(m, "bodyPreview"),
        date: text(m, "receivedDateTime"),
        unread: m["isRead"] == false,
        labels: array(m, "categories")?
            .iter()
            .map(|c| {
                c.as_str()
                    .map(String::from)
                    .ok_or("Invalid Outlook category".into())
            })
            .collect::<Result<_, String>>()?,
        has_attachments: m["hasAttachments"] == true,
    })
}
impl OutlookClient {
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
        transport::api(&self.http, "outlook", token, path, method, body, false).await
    }
    pub async fn list_messages(
        &self,
        token: &str,
        opts: ListMessagesOptions,
    ) -> Result<Vec<EmailMessageSummary>, String> {
        let folder = opts
            .folder
            .as_deref()
            .filter(|s| !s.is_empty() && !s.eq_ignore_ascii_case("all"))
            .unwrap_or("inbox");
        let path = {
            let mut q = url::form_urlencoded::Serializer::new(String::new());
            q.append_pair("$top",&transport::limit(opts.limit,25,50).to_string()).append_pair("$select","id,conversationId,subject,bodyPreview,receivedDateTime,isRead,hasAttachments,categories,from,toRecipients");
            if let Some(query) = opts.query.as_deref().filter(|s| !s.is_empty()) {
                q.append_pair("$search", &format!("\"{}\"", query.replace('"', "")));
            } else {
                q.append_pair("$orderby", "receivedDateTime desc");
            }
            format!("/me/mailFolders/{}/messages?{}", enc(folder), q.finish())
        };
        let data = transport::api(&self.http, "outlook", token, &path, "GET", None, true).await?;
        let items = array(&data, "value")?;
        if items.len() > 50 {
            return Err("Outlook returned too many messages".into());
        }
        items.iter().map(summary).collect()
    }
    pub async fn get_message(&self, token: &str, id: &str) -> Result<EmailMessageFull, String> {
        let m = self
            .request(token, &format!("/me/messages/{}", enc(id)), "GET", None)
            .await?;
        let summary = summary(&m)?;
        let is_html = text(&m["body"], "contentType").eq_ignore_ascii_case("html");
        let mut html = if is_html {
            text(&m["body"], "content")
        } else {
            String::new()
        };
        if html.to_lowercase().contains("cid:") {
            let mut images = HashMap::new();
            // Attachment failures preserve the original readable message, as in the reference.
            if let Ok(data)=self.request(token,&format!("/me/messages/{}/attachments?$select=id,contentId,isInline,contentType,size&$top=20",enc(id)),"GET",None).await
                && let Ok(items)=array(&data,"value") {for a in items.iter().take(20){
                    if images.len()>=12{break;}let cid=text(a,"contentId");let mime=text(a,"contentType");
                    if a["isInline"]!=true || cid.is_empty() || !html.contains(&format!("cid:{cid}")) || inline_image_data(&mime,"AA==").is_none() || a["size"].as_u64().unwrap_or(0)>1024*1024{continue;}
                    let aid=required(a,"id")?;
                    match self.request(token,&format!("/me/messages/{}/attachments/{}?$select=contentBytes",enc(id),enc(&aid)),"GET",None).await{
                        Ok(raw)=>if let Some(data)=raw["contentBytes"].as_str().and_then(|s|inline_image_data(&mime,s)){images.insert(cid,data);},Err(_)=>break,
                    }
                }}
            html = embed_inline_images(&html, &images);
        }
        Ok(EmailMessageFull {
            summary,
            cc: recipients(&m["ccRecipients"]),
            body_text: if is_html {
                String::new()
            } else {
                text(&m["body"], "content")
            },
            body_html: html,
        })
    }
    pub async fn send_message(
        &self,
        token: &str,
        input: SendMessageInput,
    ) -> Result<SentMessage, String> {
        let input = super::connection::provider_send_email(input)?;
        if let Some(id) = input.reply_to_message_id {
            let mut message =
                json!({"ccRecipients":to_recipients(input.cc.as_deref().unwrap_or(""))});
            if !input.to.is_empty() {
                message["toRecipients"] = json!(to_recipients(&input.to));
            }
            self.request(
                token,
                &format!("/me/messages/{}/reply", enc(&id)),
                "POST",
                Some(json!({"message":message,"comment":input.body})),
            )
            .await?;
            return Ok(SentMessage { id });
        }
        self.request(token,"/me/sendMail","POST",Some(json!({"message":{"subject":input.subject,"body":{"contentType":if input.html==Some(true){"HTML"}else{"Text"},"content":input.body},"toRecipients":to_recipients(&input.to),"ccRecipients":to_recipients(input.cc.as_deref().unwrap_or("")),"bccRecipients":to_recipients(input.bcc.as_deref().unwrap_or(""))},"saveToSentItems":true}))).await?;
        Ok(SentMessage { id: String::new() })
    }
    pub async fn tag_message(
        &self,
        token: &str,
        id: &str,
        add: Vec<String>,
        remove: Vec<String>,
    ) -> Result<(), String> {
        if add.len() + remove.len() > 100 {
            return Err("Too many email categories".into());
        }
        let path = format!("/me/messages/{}", enc(id));
        let m = self
            .request(token, &format!("{path}?$select=categories"), "GET", None)
            .await?;
        let mut categories = array(&m, "categories")?
            .iter()
            .map(|c| {
                c.as_str()
                    .map(String::from)
                    .ok_or("Invalid Outlook category")
            })
            .collect::<Result<Vec<_>, _>>()?;
        for c in add {
            if !categories.contains(&c) {
                categories.push(c);
            }
        }
        categories.retain(|c| !remove.contains(c));
        self.request(
            token,
            &path,
            "PATCH",
            Some(json!({"categories":categories})),
        )
        .await?;
        Ok(())
    }
    pub async fn delete_message(&self, token: &str, id: &str) -> Result<(), String> {
        self.request(token, &format!("/me/messages/{}", enc(id)), "DELETE", None)
            .await?;
        Ok(())
    }
    pub async fn list_folders(&self, token: &str) -> Result<Vec<EmailFolder>, String> {
        let data = self
            .request(
                token,
                "/me/mailFolders?$top=50&$select=id,displayName,unreadItemCount",
                "GET",
                None,
            )
            .await?;
        array(&data, "value")?
            .iter()
            .take(50)
            .map(|f| {
                Ok(EmailFolder {
                    id: required(f, "id")?,
                    name: required(f, "displayName")?,
                    unread_count: f["unreadItemCount"].as_f64(),
                })
            })
            .collect()
    }
    pub async fn get_profile_email(&self, token: &str) -> Result<String, String> {
        let m = self
            .request(token, "/me?$select=mail,userPrincipalName", "GET", None)
            .await?;
        Ok(m["mail"]
            .as_str()
            .or_else(|| m["userPrincipalName"].as_str())
            .unwrap_or("")
            .into())
    }
}
super::impl_mailbox_client!(OutlookClient);
