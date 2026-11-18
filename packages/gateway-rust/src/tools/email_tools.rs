//! Email tool presentation. The runtime supplies authenticated context, consent
//! authorization, cancellation, and optional session-scoped UI delivery.
use crate::{
    contracts::bounded_json::Utf16Text,
    services::email::{EmailService, contracts::ListMessagesOptions, service::Error},
    tools::list_preview::{ellipsize_text, format_ellipsed_list},
};
use futures_util::future::BoxFuture;
use serde_json::{Value, json};
use std::{sync::Arc, time::Duration};
use tokio::sync::watch;
pub struct EmailToolContext {
    pub user_id: Option<String>,
    pub session_id: String,
    pub cancelled: watch::Receiver<bool>,
}
/// Must run the existing authenticated tool policy/consent path. No tool input
/// can assert authority. Read calls also need identity and session authorization.
pub type EmailToolAuthorize = Arc<
    dyn Fn(String, Option<String>, String) -> BoxFuture<'static, Result<(), String>> + Send + Sync,
>;
pub type EmailUiControl = Arc<
    dyn Fn(String, Option<String>, Value) -> BoxFuture<'static, Result<(), String>> + Send + Sync,
>;
pub struct EmailTools {
    pub email: Arc<EmailService>,
    pub authorize: EmailToolAuthorize,
    pub ui: Option<EmailUiControl>,
}
fn failure(message: impl ToString) -> Value {
    json!({"ok":false,"message":message.to_string()})
}
fn success(message: impl ToString) -> Value {
    json!({"ok":true,"message":message.to_string()})
}
fn string<'a>(v: &'a Value, key: &str) -> Option<&'a str> {
    v.get(key).and_then(Value::as_str)
}
fn required<'a>(v: &'a Value, key: &str) -> Result<&'a str, String> {
    string(v, key)
        .filter(|s| {
            !s.is_empty() && s.encode_utf16().count() <= 2048 && !s.contains(['\r', '\n', '\0'])
        })
        .ok_or_else(|| format!("{key} is required"))
}
fn labels(v: &Value, key: &str) -> Result<Vec<String>, String> {
    match v.get(key) {
        None => Ok(vec![]),
        Some(Value::Array(a)) if a.len() <= 100 => a
            .iter()
            .map(|v| {
                v.as_str()
                    .filter(|s| s.len() <= 1024)
                    .map(String::from)
                    .ok_or("Invalid email label".into())
            })
            .collect(),
        _ => Err("Invalid email label list".into()),
    }
}
fn utf16(s: &str) -> Utf16Text {
    Utf16Text(s.encode_utf16().collect())
}
fn render(s: Utf16Text) -> String {
    String::from_utf16_lossy(&s.0)
}
pub fn metadata(has_ui: bool) -> Value {
    let mut result = Vec::new();
    for (name, risk, description, properties, required) in [
        (
            "email_accounts",
            "low",
            "List connected email account ids and addresses. Use accountId when multiple mailboxes are connected.",
            json!({}),
            vec![],
        ),
        (
            "email_list",
            "low",
            "List recent emails from a connected mailbox. Returns message summaries with ids for email_read, email_tag or email_delete.",
            json!({"accountId":{"type":"string"},"folder":{"type":"string"},"query":{"type":"string"},"limit":{"type":"number"}}),
            vec![],
        ),
        (
            "email_read",
            "low",
            "Read the full content (headers + body) of a single email by its message id.",
            json!({"id":{"type":"string"},"accountId":{"type":"string"}}),
            vec!["id"],
        ),
        (
            "email_send",
            "medium",
            "Send an email, or reply to an existing message when replyToMessageId is set. Provide to/subject/body for a new message.",
            json!({"to":{"type":"string"},"subject":{"type":"string"},"body":{"type":"string"},"cc":{"type":"string"},"bcc":{"type":"string"},"replyToMessageId":{"type":"string"},"html":{"type":"boolean"},"includeSignature":{"type":"boolean"},"accountId":{"type":"string"}}),
            vec!["body"],
        ),
        (
            "email_tag",
            "medium",
            "Add or remove labels (Gmail) / categories (Outlook) on a message. New Gmail labels are created automatically.",
            json!({"id":{"type":"string"},"accountId":{"type":"string"},"add":{"type":"array","items":{"type":"string"}},"remove":{"type":"array","items":{"type":"string"}}}),
            vec!["id"],
        ),
        (
            "email_delete",
            "high",
            "Move an email to trash / deleted items by its message id.",
            json!({"id":{"type":"string"},"accountId":{"type":"string"}}),
            vec!["id"],
        ),
        (
            "email_view",
            "low",
            "Display an email as a rendered card with action=open and messageId. Use navigate to open the Email page, compose for a draft, or refresh to reload it.",
            json!({"action":{"type":"string","enum":["navigate","open","compose","refresh"]},"accountId":{"type":"string"},"folder":{"type":"string"},"messageId":{"type":"string"},"to":{"type":"string"},"subject":{"type":"string"},"body":{"type":"string"},"replyToMessageId":{"type":"string"}}),
            vec!["action"],
        ),
    ] {
        if name == "email_view" && !has_ui {
            continue;
        }
        let mut params = json!({"type":"object","properties":properties});
        if !required.is_empty() {
            params["required"] = json!(required);
        }
        result.push(json!({"name":name,"description":description,"tier":"standard","category":"web","source":"builtin","risk":risk,"parameters":params}));
    }
    json!(result)
}
async fn cancelled(mut rx: watch::Receiver<bool>) {
    loop {
        if *rx.borrow() {
            return;
        }
        if rx.changed().await.is_err() {
            std::future::pending::<()>().await;
        }
    }
}
impl EmailTools {
    async fn control(&self, context: &EmailToolContext, data: Value) -> Result<(), String> {
        let ui = self
            .ui
            .as_ref()
            .ok_or("Email page control is not connected")?;
        tokio::time::timeout(
            Duration::from_secs(2),
            ui(context.session_id.clone(), context.user_id.clone(), data),
        )
        .await
        .map_err(|_| "Email page control timed out".to_string())?
    }
    pub async fn execute(&self, name: &str, input: &Value, context: &EmailToolContext) -> Value {
        if *context.cancelled.borrow() {
            return failure("Email operation cancelled");
        }
        if ![
            "email_accounts",
            "email_list",
            "email_read",
            "email_send",
            "email_tag",
            "email_delete",
            "email_view",
        ]
        .contains(&name)
        {
            return failure("Unknown email tool");
        }
        // A trusted no-auth local owner may be represented by None, matching
        // the service; only the host's authorization callback can permit it.
        let work = async {
            (self.authorize)(
                name.into(),
                context.user_id.clone(),
                context.session_id.clone(),
            )
            .await?;
            self.dispatch(name, input, context).await
        };
        tokio::select! {
            biased;
            _=cancelled(context.cancelled.clone())=>failure("Email operation cancelled; any in-flight send may have completed"),
            result=tokio::time::timeout(Duration::from_secs(60),work)=>match result {Ok(Ok(v))=>v,Ok(Err(e))=>failure(e),Err(_)=>failure("Email operation timed out; any in-flight send may have completed")}
        }
    }
    async fn dispatch(
        &self,
        name: &str,
        input: &Value,
        context: &EmailToolContext,
    ) -> Result<Value, Error> {
        if !input.is_object() {
            return Err("Email tool input must be an object".into());
        }
        let user = context.user_id.as_deref();
        let account = string(input, "accountId");
        match name {
            "email_accounts" => {
                let accounts=self.email.list_accounts(user).await?.into_iter().map(|a|json!({"id":a.id,"email":a.email,"provider":a.provider,"displayName":a.display_name,"status":a.status})).collect::<Vec<_>>();
                Ok(
                    json!({"ok":true,"message":format!("{} connected email account(s).",accounts.len()),"data":{"accounts":accounts}}),
                )
            }
            "email_list" => {
                let data = self
                    .email
                    .list_messages(
                        user,
                        account,
                        ListMessagesOptions {
                            folder: string(input, "folder").map(String::from),
                            query: string(input, "query").map(String::from),
                            limit: input["limit"].as_f64(),
                        },
                    )
                    .await?;
                let messages = data["messages"]
                    .as_array()
                    .ok_or("Invalid email list response")?;
                let lines = messages
                    .iter()
                    .map(|m| {
                        let date = string(m, "date").unwrap_or("");
                        let date = if date.contains('T') {
                            date.chars().take(16).collect::<String>().replace('T', " ")
                        } else {
                            date.into()
                        };
                        let subject = string(m, "subject")
                            .filter(|s| !s.is_empty())
                            .or_else(|| string(m, "snippet"))
                            .unwrap_or("");
                        let flags = format!(
                            "{}{}",
                            if m["unread"] == true { " [unread]" } else { "" },
                            if m["hasAttachments"] == true {
                                " [attachments]"
                            } else {
                                ""
                            }
                        );
                        utf16(&format!(
                            "• {date} — {}: {}{flags}",
                            string(m, "from").unwrap_or(""),
                            render(ellipsize_text(
                                &subject.encode_utf16().collect::<Vec<_>>(),
                                None
                            ))
                        ))
                    })
                    .collect::<Vec<_>>();
                let preview = render(format_ellipsed_list(&lines, Some(15.0)));
                let mut message = format!(
                    "{} message(s) from {}",
                    messages.len(),
                    data["account"]["email"].as_str().unwrap_or("")
                );
                if lines.is_empty() {
                    message.push('.');
                } else {
                    message.push_str(":\n");
                    message.push_str(&preview);
                }
                Ok(
                    json!({"ok":true,"message":message,"data":{"account":{"id":data["account"]["id"],"email":data["account"]["email"],"provider":data["account"]["provider"]},"messages":messages}}),
                )
            }
            "email_read" => {
                let id = required(input, "id")?;
                let resolved = self.email.resolve_account(user, account).await?;
                let message = self.email.get_message(user, Some(&resolved.id), id).await?;
                let body = if !message.body_text.is_empty() {
                    message.body_text.clone()
                } else {
                    let plain = regex::Regex::new(r"<[^>]+>")
                        .unwrap()
                        .replace_all(&message.body_html, " ");
                    plain.split_whitespace().collect::<Vec<_>>().join(" ")
                };
                let mut data = serde_json::to_value(&message)?;
                data["body"] = json!(body);
                data["accountId"] = json!(resolved.id);
                Ok(
                    json!({"ok":true,"message":format!("{} — from {}",message.summary.subject,message.summary.from),"data":data}),
                )
            }
            "email_send" => {
                let mut body = serde_json::Map::new();
                for key in [
                    "to",
                    "subject",
                    "body",
                    "cc",
                    "bcc",
                    "replyToMessageId",
                    "html",
                    "includeSignature",
                ] {
                    if let Some(value) = input.get(key) {
                        body.insert(key.into(), value.clone());
                    }
                }
                for key in ["to", "subject"] {
                    body.entry(key.to_string()).or_insert(json!(""));
                }
                self.email
                    .send_message(user, account, Value::Object(body))
                    .await?;
                let _ = self
                    .control(context, json!({"action":"refresh","accountId":account}))
                    .await;
                Ok(success(
                    if string(input, "replyToMessageId").is_some_and(|s| !s.is_empty()) {
                        "Reply sent.".into()
                    } else {
                        format!(
                            "Email sent to {}.",
                            string(input, "to").unwrap_or("undefined")
                        )
                    },
                ))
            }
            "email_tag" => {
                self.email
                    .tag_message(
                        user,
                        account,
                        required(input, "id")?,
                        labels(input, "add")?,
                        labels(input, "remove")?,
                    )
                    .await?;
                let _ = self
                    .control(context, json!({"action":"refresh","accountId":account}))
                    .await;
                Ok(success("Tags updated."))
            }
            "email_delete" => {
                self.email
                    .delete_message(user, account, required(input, "id")?)
                    .await?;
                let _ = self
                    .control(context, json!({"action":"refresh","accountId":account}))
                    .await;
                Ok(success("Message moved to trash."))
            }
            "email_view" => {
                let action = required(input, "action")?;
                if !["navigate", "open", "compose", "refresh"].contains(&action) {
                    return Err("Invalid email view action".into());
                }
                if action == "open" {
                    let id = required(input, "messageId")?;
                    let a = self.email.resolve_account(user, account).await?;
                    let message = self.email.get_message(user, Some(&a.id), id).await?;
                    return Ok(
                        json!({"ok":true,"message":format!("Email: {} — {}",message.summary.subject,message.summary.from),"data":{"accountId":a.id,"message":message}}),
                    );
                }
                if let Some(account) = account
                    && self.email.get_account(user, account).await?.is_none()
                {
                    return Err("Account not found".into());
                }
                let mut data = serde_json::Map::new();
                for key in [
                    "action",
                    "accountId",
                    "folder",
                    "messageId",
                    "to",
                    "subject",
                    "body",
                    "replyToMessageId",
                ] {
                    if let Some(v) = input.get(key) {
                        data.insert(key.into(), v.clone());
                    }
                }
                self.control(context, Value::Object(data)).await?;
                Ok(success(format!("Email page: {action}.")))
            }
            _ => Err("Unknown email tool".into()),
        }
    }
}
