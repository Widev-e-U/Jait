//! Public email records and mailbox interface. No transport or credential behavior.
use crate::contracts::js_number;
use futures_util::future::BoxFuture;
use serde::{Deserialize, Serialize};
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum OAuthEmailProvider {
    Gmail,
    Outlook,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EmailProvider {
    Gmail,
    Outlook,
    Imap,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EmailAccountStatus {
    Connected,
    Error,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EmailAccount {
    pub id: String,
    pub user_id: Option<String>,
    pub provider: EmailProvider,
    pub email: String,
    pub display_name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub signature: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub signature_enabled: Option<bool>,
    pub status: EmailAccountStatus,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "optional_nullable_string"
    )]
    pub error: Option<Option<String>>,
    pub created_at: String,
    pub updated_at: String,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EmailTokens {
    pub access_token: String,
    pub refresh_token: Option<String>,
    #[serde(with = "js_number")]
    pub expires_at: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scope: Option<String>,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EmailMessageSummary {
    pub id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub thread_id: Option<String>,
    pub from: String,
    pub to: String,
    pub subject: String,
    pub snippet: String,
    pub date: String,
    pub unread: bool,
    pub labels: Vec<String>,
    pub has_attachments: bool,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EmailMessageFull {
    #[serde(flatten)]
    pub summary: EmailMessageSummary,
    pub cc: String,
    pub body_text: String,
    pub body_html: String,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EmailFolder {
    pub id: String,
    pub name: String,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        with = "js_number::optional"
    )]
    pub unread_count: Option<f64>,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ListMessagesOptions {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub folder: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub query: Option<String>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        with = "js_number::optional"
    )]
    pub limit: Option<f64>,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendMessageInput {
    pub to: String,
    pub subject: String,
    pub body: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cc: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bcc: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reply_to_message_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub html: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub include_signature: Option<bool>,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct MailServerConfig {
    pub host: String,
    #[serde(with = "js_number")]
    pub port: f64,
    pub secure: bool,
    pub user: String,
    pub password: String,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct PublicMailServerConfig {
    pub host: String,
    #[serde(with = "js_number")]
    pub port: f64,
    pub secure: bool,
    pub user: String,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectMailboxInput {
    pub email: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,
    pub imap: MailServerConfig,
    pub smtp: MailServerConfig,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EmailAccountSettings {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub signature: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub signature_enabled: Option<bool>,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct DiscoveredMailSettings {
    pub name: String,
    pub imap: PublicMailServerConfig,
    pub smtp: PublicMailServerConfig,
}
fn optional_nullable_string<'de, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> Result<Option<Option<String>>, D::Error> {
    Option::<String>::deserialize(deserializer).map(Some)
}
pub trait MailboxClient {
    type Error;
    fn list_messages<'a>(
        &'a self,
        access_token: &'a str,
        options: ListMessagesOptions,
    ) -> BoxFuture<'a, Result<Vec<EmailMessageSummary>, Self::Error>>;
    fn get_message<'a>(
        &'a self,
        access_token: &'a str,
        id: &'a str,
    ) -> BoxFuture<'a, Result<EmailMessageFull, Self::Error>>;
    fn send_message<'a>(
        &'a self,
        access_token: &'a str,
        input: SendMessageInput,
    ) -> BoxFuture<'a, Result<SentMessage, Self::Error>>;
    fn tag_message<'a>(
        &'a self,
        access_token: &'a str,
        id: &'a str,
        add: Vec<String>,
        remove: Vec<String>,
    ) -> BoxFuture<'a, Result<(), Self::Error>>;
    fn delete_message<'a>(
        &'a self,
        access_token: &'a str,
        id: &'a str,
    ) -> BoxFuture<'a, Result<(), Self::Error>>;
    fn list_folders<'a>(
        &'a self,
        access_token: &'a str,
    ) -> BoxFuture<'a, Result<Vec<EmailFolder>, Self::Error>>;
    fn get_profile_email<'a>(
        &'a self,
        access_token: &'a str,
    ) -> BoxFuture<'a, Result<String, Self::Error>>;
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct SentMessage {
    pub id: String,
}
