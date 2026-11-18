//! Channel declarations only. Transports retain credential and consent policy.
use futures_util::future::BoxFuture;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ChannelStatus {
    Stopped,
    Connecting,
    Qr,
    Connected,
    Error,
}
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelStatusDetail {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub qr: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub link: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelPairing {
    pub sender_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sender_name: Option<String>,
    pub conversation_id: String,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InboundMessage {
    pub channel_id: String,
    pub conversation_id: String,
    pub sender_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sender_name: Option<String>,
    pub text: String,
    #[serde(with = "crate::contracts::js_number")]
    pub timestamp: f64,
    pub from_me: bool,
    pub is_self_chat: bool,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ChannelChoice {
    pub label: String,
    pub value: String,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OutboundMessage {
    pub conversation_id: String,
    pub text: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub choices: Option<Vec<ChannelChoice>>,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ChannelCommandDescriptor {
    pub name: String,
    pub description: String,
}
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelPairOptions {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub return_url: Option<String>,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelSetupGuide {
    pub link: String,
    #[serde(deserialize_with = "required_qr")]
    pub qr: Option<String>,
    pub suggested_name: String,
    pub suggested_username: String,
}
fn required_qr<'de, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> Result<Option<String>, D::Error> {
    Option::<String>::deserialize(deserializer)
}
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelConfig {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub enabled: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub allowed_senders: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub respond_to_all: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tools: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub auto_approve: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub progress: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub notifications: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model_provider: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fallback_model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fallback_model_provider: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub time_zone: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub token: Option<String>,
}
pub type InboundCallback = Arc<dyn Fn(InboundMessage) + Send + Sync>;
pub type StatusCallback = Arc<dyn Fn(ChannelStatus, Option<ChannelStatusDetail>) + Send + Sync>;
pub type PairingCallback = Arc<dyn Fn(ChannelPairing) + Send + Sync>;
#[derive(Clone)]
pub struct ChannelConnectorEvents {
    pub on_inbound: InboundCallback,
    pub on_status: StatusCallback,
    pub on_paired: Option<PairingCallback>,
}
pub type TypingStop = Arc<dyn Fn() + Send + Sync>;
/// None distinguishes an absent optional method from its eventual return value.
pub trait ChannelConnector: Send + Sync {
    type Error;
    fn id(&self) -> &str;
    fn label(&self) -> &str;
    fn supports_choices(&self) -> Option<bool> {
        None
    }
    fn start(
        &self,
        events: Arc<ChannelConnectorEvents>,
        config: Option<ChannelConfig>,
        options: Option<ChannelPairOptions>,
    ) -> BoxFuture<'_, Result<(), Self::Error>>;
    fn stop(&self) -> BoxFuture<'_, Result<(), Self::Error>>;
    fn send(&self, message: OutboundMessage) -> BoxFuture<'_, Result<(), Self::Error>>;
    fn status(&self) -> ChannelStatus;
    fn current_qr(&self) -> Option<String>;
    fn pair(
        &self,
        _options: Option<ChannelPairOptions>,
    ) -> Option<BoxFuture<'_, Result<(), Self::Error>>> {
        None
    }
    fn setup_guide(&self) -> Option<BoxFuture<'_, Result<ChannelSetupGuide, Self::Error>>> {
        None
    }
    fn start_typing(&self, _conversation: &str) -> Option<TypingStop> {
        None
    }
    fn send_live(
        &self,
        _conversation: String,
        _text: String,
    ) -> Option<BoxFuture<'_, Result<Option<String>, Self::Error>>> {
        None
    }
    fn edit_live(
        &self,
        _conversation: String,
        _message: String,
        _text: String,
    ) -> Option<BoxFuture<'_, Result<(), Self::Error>>> {
        None
    }
    fn set_command_menu(
        &self,
        _commands: Vec<ChannelCommandDescriptor>,
    ) -> Option<BoxFuture<'_, Result<(), Self::Error>>> {
        None
    }
}
