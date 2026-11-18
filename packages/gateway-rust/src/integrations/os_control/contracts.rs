//! Sandbox desktop contracts only. Implementations retain execution consent.
use crate::contracts::js_number;
use futures_util::future::BoxFuture;
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use std::collections::BTreeMap;
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PngBuffer(pub Vec<u8>);
impl Serialize for PngBuffer {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        #[derive(Serialize)]
        struct Buffer<'a> {
            r#type: &'static str,
            data: &'a [u8],
        }
        Buffer {
            r#type: "Buffer",
            data: &self.0,
        }
        .serialize(serializer)
    }
}
impl<'de> Deserialize<'de> for PngBuffer {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        #[derive(Deserialize)]
        enum Kind {
            Buffer,
        }
        #[derive(Deserialize)]
        struct Buffer {
            r#type: Kind,
            data: Vec<u8>,
        }
        let value = Buffer::deserialize(deserializer)?;
        match value.r#type {
            Kind::Buffer => Ok(Self(value.data)),
        }
    }
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct OsScreenshot {
    pub png: PngBuffer,
    #[serde(with = "js_number")]
    pub width: f64,
    #[serde(with = "js_number")]
    pub height: f64,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MouseButton {
    Left,
    Middle,
    Right,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ScrollDirection {
    Up,
    Down,
    Left,
    Right,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum OsDriverType {
    LinuxDesktop,
    Windows,
}
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct OsClickOptions {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub button: Option<MouseButton>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        with = "js_number::optional"
    )]
    pub clicks: Option<f64>,
}
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OsTypeOptions {
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        with = "js_number::optional"
    )]
    pub delay_ms: Option<f64>,
}
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OsKeyOptions {
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        with = "js_number::optional"
    )]
    pub hold_ms: Option<f64>,
}
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct OsScrollOptions {
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        with = "js_number::optional"
    )]
    pub x: Option<f64>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        with = "js_number::optional"
    )]
    pub y: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub direction: Option<ScrollDirection>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        with = "js_number::optional"
    )]
    pub amount: Option<f64>,
}
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OsExecOptions {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cwd: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub env: Option<BTreeMap<String, String>>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        with = "js_number::optional"
    )]
    pub timeout_ms: Option<f64>,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SandboxRunResult {
    pub ok: bool,
    pub output: String,
    #[serde(default, with = "js_number::optional")]
    pub exit_code: Option<f64>,
    pub timed_out: bool,
    pub container_name: String,
}
pub trait OsControlDriver: Send + Sync {
    type Error;
    fn os_type(&self) -> OsDriverType;
    fn screenshot(&self) -> BoxFuture<'_, Result<OsScreenshot, Self::Error>>;
    fn click(
        &self,
        x: f64,
        y: f64,
        options: Option<OsClickOptions>,
    ) -> BoxFuture<'_, Result<(), Self::Error>>;
    fn mouse_move(&self, x: f64, y: f64) -> BoxFuture<'_, Result<(), Self::Error>>;
    fn r#type<'a>(
        &'a self,
        text: &'a str,
        options: Option<OsTypeOptions>,
    ) -> BoxFuture<'a, Result<(), Self::Error>>;
    fn key<'a>(
        &'a self,
        combo: &'a str,
        options: Option<OsKeyOptions>,
    ) -> BoxFuture<'a, Result<(), Self::Error>>;
    fn scroll(&self, options: Option<OsScrollOptions>) -> BoxFuture<'_, Result<(), Self::Error>>;
    fn exec<'a>(
        &'a self,
        command: &'a str,
        options: Option<OsExecOptions>,
    ) -> BoxFuture<'a, Result<SandboxRunResult, Self::Error>>;
}
pub struct OsDriverBinding<D: OsControlDriver> {
    pub driver: D,
    pub container_name: String,
    pub r#type: OsDriverType,
}
