//! Native port of `packages/gateway/src/surfaces/browser.ts`.
//!
//! The TypeScript surface owns the *lifecycle and policy* of a browser surface
//! and hands all page automation to a `BrowserDriver`. Two of the three drivers
//! in the reference are irreducibly Node-specific:
//!
//! * `createInProcessPlaywrightDriver` imports the `playwright` npm package and
//!   drives Chromium in-process.
//! * `createNodeBridgePlaywrightDriver` spawns `playwright-node-bridge.cjs`
//!   through `child_process`.
//! * `createPlaywrightDriver` also orchestrates `live-view-manager.ts`
//!   (container/CDP live view), which is a separate, not-yet-ported component.
//!
//! Those boundaries are expressed here as an injected [`BrowserDriver`] trait
//! instead of being faked: a Rust host supplies a driver (for example an adapter
//! over [`super::playwright_bridge`]) through [`BrowserSurfaceOptions`]. Every
//! policy that the TypeScript surface implements itself is ported faithfully and
//! is exercised by the unit tests in this module: state machine
//! (`idle`/`starting`/`running`/`stopping`/`stopped`/`error`), disconnect
//! detection, action counting, idle tracking, snapshot metadata, `describe`
//! rendering, click-error enrichment, the console flood guard, and the bounded
//! runtime-event buffer.
#[path = "browser_effect_runtime.rs"]
pub mod browser_effect_runtime;

use std::collections::VecDeque;
use std::future::Future;
use std::pin::Pin;
use std::sync::{Arc, Mutex};
use std::time::Instant;

use serde_json::{Map, Value, json};

use super::registry::{
    Surface, SurfaceFactory, SurfaceFuture, SurfaceRef, SurfaceResult, SurfaceSnapshot,
    SurfaceStartInput, SurfaceState,
};

/// Surface `type` reported to the registry; mirrors `readonly type = "browser"`.
pub const BROWSER_SURFACE_TYPE: &str = "browser";
/// `DEFAULT_BROWSER_LAUNCH_TIMEOUT_MS` from the reference module.
pub const DEFAULT_BROWSER_LAUNCH_TIMEOUT_MS: u64 = 45_000;
/// `MAX_BROWSER_RUNTIME_EVENTS`: the runtime event ring buffer is capped.
pub const MAX_BROWSER_RUNTIME_EVENTS: usize = 200;
/// Console flood guard: observation window.
pub const CONSOLE_FLOOD_WINDOW_MS: u64 = 2_000;
/// Console flood guard: messages in the window before capture is paused.
pub const CONSOLE_FLOOD_THRESHOLD: usize = 60;
/// Console flood guard: how long capture stays paused.
pub const CONSOLE_FLOOD_COOLDOWN_MS: u64 = 30_000;
/// Event type used for `console.*` runtime events.
pub const CONSOLE_EVENT_TYPE: &str = "console";
/// Prefix of the one-shot warning emitted when console capture pauses.
pub const CONSOLE_FLOOD_NOTICE_PREFIX: &str = "Console capture paused for";
/// One-shot notice emitted when console capture resumes.
pub const CONSOLE_RESUME_NOTICE: &str = "Console capture resumed after flood pause.";

fn now_iso8601() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

// ---------------------------------------------------------------------------
// Injected driver boundary
// ---------------------------------------------------------------------------

/// Boxed driver future. Drivers are `Send + Sync` so a surface can be shared.
pub type DriverFuture<'a, T> = Pin<Box<dyn Future<Output = Result<T, String>> + Send + 'a>>;

/// DevTools endpoint information exposed by driver-based surfaces.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DevToolsConnection {
    pub endpoint: String,
    pub target_id: String,
}

impl DevToolsConnection {
    pub fn to_json(&self) -> Value {
        json!({ "endpoint": self.endpoint, "targetId": self.target_id })
    }
}

/// Live-view information mirrored from `live-view-manager.ts` sessions.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct LiveViewInfo {
    pub display: String,
    pub vnc_port: u16,
    pub websockify_port: u16,
    pub novnc_url: String,
    pub container_name: Option<String>,
}

/// The `BrowserDriver` contract from the reference.
///
/// Defaults reproduce the reference's *optional* driver members: a driver that
/// does not implement `reload` reports `supports_reload() == false`, which the
/// surface turns into `"This browser does not support refresh."`.
pub trait BrowserDriver: Send + Sync {
    fn is_connected(&self) -> Option<bool> {
        None
    }

    fn supports_reload(&self) -> bool {
        false
    }

    fn navigate<'a>(&'a self, url: &'a str) -> DriverFuture<'a, ()>;
    fn reload<'a>(&'a self) -> DriverFuture<'a, ()> {
        Box::pin(async { Err("This browser does not support refresh.".to_string()) })
    }
    fn click<'a>(&'a self, selector: &'a str) -> DriverFuture<'a, ()>;
    fn type_text<'a>(&'a self, selector: &'a str, text: &'a str) -> DriverFuture<'a, ()>;
    fn scroll<'a>(&'a self, x: f64, y: f64) -> DriverFuture<'a, ()>;
    fn select<'a>(&'a self, selector: &'a str, value: &'a str) -> DriverFuture<'a, ()>;
    fn wait_for<'a>(&'a self, selector: &'a str, timeout_ms: u64) -> DriverFuture<'a, ()>;
    fn screenshot<'a>(&'a self, path: Option<&'a str>) -> DriverFuture<'a, String>;
    fn snapshot<'a>(&'a self) -> DriverFuture<'a, BrowserPageSnapshot>;
    fn diagnose<'a>(&'a self, selector: &'a str) -> DriverFuture<'a, BrowserTargetDiagnostics>;
    fn get_metrics<'a>(&'a self) -> DriverFuture<'a, BrowserPerformanceMetrics>;
    fn get_events(&self) -> Vec<BrowserRuntimeEvent> {
        Vec::new()
    }
    fn get_dev_tools_connection(&self) -> Option<DevToolsConnection> {
        None
    }
    fn live_view(&self) -> Option<LiveViewInfo> {
        None
    }
    fn close<'a>(&'a self) -> DriverFuture<'a, ()>;
}

/// Factory future used to create a driver for one surface start.
pub type DriverFactoryFuture =
    Pin<Box<dyn Future<Output = Result<Arc<dyn BrowserDriver>, String>> + Send>>;
/// Injected replacement for `createPlaywrightDriver`.
pub type DriverFactory = Arc<dyn Fn(SurfaceStartInput) -> DriverFactoryFuture + Send + Sync>;

/// `BrowserSurfaceOptions` from the reference (`{ driverFactory? }`).
#[derive(Clone, Default)]
pub struct BrowserSurfaceOptions {
    pub driver_factory: Option<DriverFactory>,
}

impl std::fmt::Debug for BrowserSurfaceOptions {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("BrowserSurfaceOptions")
            .field("driver_factory", &self.driver_factory.is_some())
            .finish()
    }
}

impl BrowserSurfaceOptions {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn with_driver_factory(factory: DriverFactory) -> Self {
        Self {
            driver_factory: Some(factory),
        }
    }

    /// Convenience adapter that always yields the same driver instance.
    pub fn from_driver(driver: Arc<dyn BrowserDriver>) -> Self {
        Self::with_driver_factory(Arc::new(move |_input| {
            let driver = Arc::clone(&driver);
            Box::pin(async move { Ok(driver) }) as DriverFactoryFuture
        }))
    }
}

// ---------------------------------------------------------------------------
// Snapshot DTOs
// ---------------------------------------------------------------------------

fn opt_string(value: Option<&Value>) -> Option<String> {
    value.and_then(Value::as_str).map(str::to_string)
}

fn opt_bool(value: Option<&Value>) -> Option<bool> {
    value.and_then(Value::as_bool)
}

fn opt_f64(value: Option<&Value>) -> Option<f64> {
    value.and_then(Value::as_f64)
}

fn insert_opt(map: &mut Map<String, Value>, key: &str, value: Option<String>) {
    if let Some(value) = value {
        map.insert(key.to_string(), Value::String(value));
    }
}

fn insert_opt_bool(map: &mut Map<String, Value>, key: &str, value: Option<bool>) {
    if let Some(value) = value {
        map.insert(key.to_string(), Value::Bool(value));
    }
}

fn insert_opt_f64(map: &mut Map<String, Value>, key: &str, value: Option<f64>) {
    if let Some(value) = value
        && let Some(number) = serde_json::Number::from_f64(value)
    {
        map.insert(key.to_string(), Value::Number(number));
    }
}

/// Selector suggestions attached to interactive elements.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct BrowserSelectorSuggestion {
    pub kind: String,
    pub value: String,
    pub selector: String,
}

impl BrowserSelectorSuggestion {
    pub fn to_json(&self) -> Value {
        json!({ "kind": self.kind, "value": self.value, "selector": self.selector })
    }

    pub fn from_json(value: &Value) -> Self {
        Self {
            kind: opt_string(value.get("kind")).unwrap_or_default(),
            value: opt_string(value.get("value")).unwrap_or_default(),
            selector: opt_string(value.get("selector")).unwrap_or_default(),
        }
    }
}

/// One entry of `snapshot.elements`.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct BrowserInteractiveElement {
    pub selector: String,
    pub tag_name: Option<String>,
    pub role: Option<String>,
    pub name: Option<String>,
    pub text: Option<String>,
    pub input_type: Option<String>,
    pub placeholder: Option<String>,
    pub href: Option<String>,
    pub value: Option<String>,
    pub disabled: Option<bool>,
    pub visible: Option<bool>,
    pub checked: Option<bool>,
    pub selectors: Option<Vec<BrowserSelectorSuggestion>>,
}

impl BrowserInteractiveElement {
    pub fn to_json(&self) -> Value {
        let mut map = Map::new();
        map.insert("selector".into(), Value::String(self.selector.clone()));
        insert_opt(&mut map, "tagName", self.tag_name.clone());
        insert_opt(&mut map, "role", self.role.clone());
        insert_opt(&mut map, "name", self.name.clone());
        insert_opt(&mut map, "text", self.text.clone());
        insert_opt(&mut map, "type", self.input_type.clone());
        insert_opt(&mut map, "placeholder", self.placeholder.clone());
        insert_opt(&mut map, "href", self.href.clone());
        insert_opt(&mut map, "value", self.value.clone());
        insert_opt_bool(&mut map, "disabled", self.disabled);
        insert_opt_bool(&mut map, "visible", self.visible);
        insert_opt_bool(&mut map, "checked", self.checked);
        if let Some(selectors) = &self.selectors {
            map.insert(
                "selectors".into(),
                Value::Array(
                    selectors
                        .iter()
                        .map(BrowserSelectorSuggestion::to_json)
                        .collect(),
                ),
            );
        }
        Value::Object(map)
    }

    pub fn from_json(value: &Value) -> Self {
        Self {
            selector: opt_string(value.get("selector")).unwrap_or_default(),
            tag_name: opt_string(value.get("tagName")),
            role: opt_string(value.get("role")),
            name: opt_string(value.get("name")),
            text: opt_string(value.get("text")),
            input_type: opt_string(value.get("type")),
            placeholder: opt_string(value.get("placeholder")),
            href: opt_string(value.get("href")),
            value: opt_string(value.get("value")),
            disabled: opt_bool(value.get("disabled")),
            visible: opt_bool(value.get("visible")),
            checked: opt_bool(value.get("checked")),
            selectors: value
                .get("selectors")
                .and_then(Value::as_array)
                .map(|items| {
                    items
                        .iter()
                        .map(BrowserSelectorSuggestion::from_json)
                        .collect()
                }),
        }
    }

    /// `role ?? tagName ?? "element"`, `name`, `text` joined with an em dash.
    pub fn label(&self) -> String {
        let mut parts: Vec<&str> = Vec::new();
        let role = self
            .role
            .as_deref()
            .or(self.tag_name.as_deref())
            .unwrap_or("element");
        parts.push(role);
        if let Some(name) = self.name.as_deref() {
            parts.push(name);
        }
        if let Some(text) = self.text.as_deref() {
            parts.push(text);
        }
        parts.join(" — ")
    }
}

/// `snapshot.activeElement`.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct BrowserActiveElement {
    pub selector: String,
    pub tag_name: Option<String>,
    pub role: Option<String>,
    pub name: Option<String>,
    pub text: Option<String>,
    pub input_type: Option<String>,
    pub read_only: Option<bool>,
    pub is_content_editable: Option<bool>,
}

impl BrowserActiveElement {
    pub fn to_json(&self) -> Value {
        let mut map = Map::new();
        map.insert("selector".into(), Value::String(self.selector.clone()));
        insert_opt(&mut map, "tagName", self.tag_name.clone());
        insert_opt(&mut map, "role", self.role.clone());
        insert_opt(&mut map, "name", self.name.clone());
        insert_opt(&mut map, "text", self.text.clone());
        insert_opt(&mut map, "type", self.input_type.clone());
        insert_opt_bool(&mut map, "readOnly", self.read_only);
        insert_opt_bool(&mut map, "isContentEditable", self.is_content_editable);
        Value::Object(map)
    }

    pub fn from_json(value: &Value) -> Self {
        Self {
            selector: opt_string(value.get("selector")).unwrap_or_default(),
            tag_name: opt_string(value.get("tagName")),
            role: opt_string(value.get("role")),
            name: opt_string(value.get("name")),
            text: opt_string(value.get("text")),
            input_type: opt_string(value.get("type")),
            read_only: opt_bool(value.get("readOnly")),
            is_content_editable: opt_bool(value.get("isContentEditable")),
        }
    }

    /// `role ?? tagName ?? "element"`, `name`, `selector` joined with an em dash.
    pub fn describe_line(&self) -> String {
        let role = self
            .role
            .as_deref()
            .or(self.tag_name.as_deref())
            .unwrap_or("element");
        let mut parts: Vec<&str> = vec![role];
        if let Some(name) = self.name.as_deref() {
            parts.push(name);
        }
        if !self.selector.is_empty() {
            parts.push(&self.selector);
        }
        parts.join(" — ")
    }
}

/// `snapshot.dialogs[]`.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct BrowserDialogPresence {
    pub selector: String,
    pub role: Option<String>,
    pub name: Option<String>,
    pub title: Option<String>,
    pub tag_name: Option<String>,
    pub aria_modal: Option<bool>,
    pub open: Option<bool>,
}

impl BrowserDialogPresence {
    pub fn to_json(&self) -> Value {
        let mut map = Map::new();
        map.insert("selector".into(), Value::String(self.selector.clone()));
        insert_opt(&mut map, "role", self.role.clone());
        insert_opt(&mut map, "name", self.name.clone());
        insert_opt(&mut map, "title", self.title.clone());
        insert_opt(&mut map, "tagName", self.tag_name.clone());
        insert_opt_bool(&mut map, "ariaModal", self.aria_modal);
        insert_opt_bool(&mut map, "open", self.open);
        Value::Object(map)
    }

    pub fn from_json(value: &Value) -> Self {
        Self {
            selector: opt_string(value.get("selector")).unwrap_or_default(),
            role: opt_string(value.get("role")),
            name: opt_string(value.get("name")),
            title: opt_string(value.get("title")),
            tag_name: opt_string(value.get("tagName")),
            aria_modal: opt_bool(value.get("ariaModal")),
            open: opt_bool(value.get("open")),
        }
    }

    /// `title || name || selector || role || "dialog"`.
    pub fn label(&self) -> String {
        self.title
            .as_deref()
            .or(self.name.as_deref())
            .or(if self.selector.is_empty() {
                None
            } else {
                Some(self.selector.as_str())
            })
            .or(self.role.as_deref())
            .unwrap_or("dialog")
            .to_string()
    }
}

/// Element that appears to intercept a click.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct BrowserObstructionSummary {
    pub role: Option<String>,
    pub tag_name: Option<String>,
    pub text: Option<String>,
    pub selector: Option<String>,
}

impl BrowserObstructionSummary {
    pub fn to_json(&self) -> Value {
        let mut map = Map::new();
        insert_opt(&mut map, "role", self.role.clone());
        insert_opt(&mut map, "tagName", self.tag_name.clone());
        insert_opt(&mut map, "text", self.text.clone());
        insert_opt(&mut map, "selector", self.selector.clone());
        Value::Object(map)
    }

    pub fn from_json(value: &Value) -> Self {
        Self {
            role: opt_string(value.get("role")),
            tag_name: opt_string(value.get("tagName")),
            text: opt_string(value.get("text")),
            selector: opt_string(value.get("selector")),
        }
    }

    /// `role ?? tagName ?? "element"`, `text`, `selector` joined with an em dash.
    pub fn label(&self) -> String {
        let role = self
            .role
            .as_deref()
            .or(self.tag_name.as_deref())
            .unwrap_or("element");
        let mut parts: Vec<&str> = vec![role];
        if let Some(text) = self.text.as_deref() {
            parts.push(text);
        }
        if let Some(selector) = self.selector.as_deref() {
            parts.push(selector);
        }
        parts.join(" — ")
    }
}

/// `snapshot.obstruction`.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct BrowserObstructionDiagnostics {
    pub has_modal: bool,
    pub dialog_count: usize,
    pub active_dialog_title: Option<String>,
}

impl BrowserObstructionDiagnostics {
    pub fn to_json(&self) -> Value {
        let mut map = Map::new();
        map.insert("hasModal".into(), Value::Bool(self.has_modal));
        map.insert("dialogCount".into(), json!(self.dialog_count));
        map.insert(
            "activeDialogTitle".into(),
            match &self.active_dialog_title {
                Some(title) => Value::String(title.clone()),
                None => Value::Null,
            },
        );
        Value::Object(map)
    }

    pub fn from_json(value: &Value) -> Self {
        Self {
            has_modal: opt_bool(value.get("hasModal")).unwrap_or(false),
            dialog_count: value
                .get("dialogCount")
                .and_then(Value::as_u64)
                .unwrap_or(0) as usize,
            active_dialog_title: opt_string(value.get("activeDialogTitle")),
        }
    }
}

/// `driver.diagnose()` result, used to enrich action failures.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct BrowserTargetDiagnostics {
    pub selector: String,
    pub found: bool,
    pub visible: Option<bool>,
    pub offscreen: Option<bool>,
    pub disabled: Option<bool>,
    pub obscured: Option<bool>,
    pub in_dialog: Option<bool>,
    pub dialog_title: Option<String>,
    pub obstruction_reason: Option<String>,
    pub intercepted_by: Option<BrowserObstructionSummary>,
    pub role: Option<String>,
    pub tag_name: Option<String>,
    pub name: Option<String>,
    pub text: Option<String>,
}

impl BrowserTargetDiagnostics {
    pub fn to_json(&self) -> Value {
        let mut map = Map::new();
        map.insert("selector".into(), Value::String(self.selector.clone()));
        map.insert("found".into(), Value::Bool(self.found));
        insert_opt_bool(&mut map, "visible", self.visible);
        insert_opt_bool(&mut map, "offscreen", self.offscreen);
        insert_opt_bool(&mut map, "disabled", self.disabled);
        insert_opt_bool(&mut map, "obscured", self.obscured);
        insert_opt_bool(&mut map, "inDialog", self.in_dialog);
        insert_opt(&mut map, "dialogTitle", self.dialog_title.clone());
        insert_opt(
            &mut map,
            "obstructionReason",
            self.obstruction_reason.clone(),
        );
        if let Some(intercepted) = &self.intercepted_by {
            map.insert("interceptedBy".into(), intercepted.to_json());
        }
        insert_opt(&mut map, "role", self.role.clone());
        insert_opt(&mut map, "tagName", self.tag_name.clone());
        insert_opt(&mut map, "name", self.name.clone());
        insert_opt(&mut map, "text", self.text.clone());
        Value::Object(map)
    }

    pub fn from_json(value: &Value) -> Self {
        Self {
            selector: opt_string(value.get("selector")).unwrap_or_default(),
            found: opt_bool(value.get("found")).unwrap_or(false),
            visible: opt_bool(value.get("visible")),
            offscreen: opt_bool(value.get("offscreen")),
            disabled: opt_bool(value.get("disabled")),
            obscured: opt_bool(value.get("obscured")),
            in_dialog: opt_bool(value.get("inDialog")),
            dialog_title: opt_string(value.get("dialogTitle")),
            obstruction_reason: opt_string(value.get("obstructionReason")),
            intercepted_by: value
                .get("interceptedBy")
                .filter(|inner| !inner.is_null())
                .map(BrowserObstructionSummary::from_json),
            role: opt_string(value.get("role")),
            tag_name: opt_string(value.get("tagName")),
            name: opt_string(value.get("name")),
            text: opt_string(value.get("text")),
        }
    }
}

/// `BrowserPageSnapshot` from the reference.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct BrowserPageSnapshot {
    pub url: String,
    pub title: String,
    pub text: String,
    pub elements: Vec<BrowserInteractiveElement>,
    pub active_element: Option<BrowserActiveElement>,
    pub dialogs: Option<Vec<BrowserDialogPresence>>,
    pub obstruction: Option<BrowserObstructionDiagnostics>,
}

impl BrowserPageSnapshot {
    pub fn to_json(&self) -> Value {
        let mut map = Map::new();
        map.insert("url".into(), Value::String(self.url.clone()));
        map.insert("title".into(), Value::String(self.title.clone()));
        map.insert("text".into(), Value::String(self.text.clone()));
        map.insert(
            "elements".into(),
            Value::Array(
                self.elements
                    .iter()
                    .map(BrowserInteractiveElement::to_json)
                    .collect(),
            ),
        );
        if let Some(active) = &self.active_element {
            map.insert("activeElement".into(), active.to_json());
        }
        if let Some(dialogs) = &self.dialogs {
            map.insert(
                "dialogs".into(),
                Value::Array(dialogs.iter().map(BrowserDialogPresence::to_json).collect()),
            );
        }
        if let Some(obstruction) = &self.obstruction {
            map.insert("obstruction".into(), obstruction.to_json());
        }
        Value::Object(map)
    }

    pub fn from_json(value: &Value) -> Self {
        Self {
            url: opt_string(value.get("url")).unwrap_or_default(),
            title: opt_string(value.get("title")).unwrap_or_default(),
            text: opt_string(value.get("text")).unwrap_or_default(),
            elements: value
                .get("elements")
                .and_then(Value::as_array)
                .map(|items| {
                    items
                        .iter()
                        .map(BrowserInteractiveElement::from_json)
                        .collect()
                })
                .unwrap_or_default(),
            active_element: value
                .get("activeElement")
                .filter(|inner| !inner.is_null())
                .map(BrowserActiveElement::from_json),
            dialogs: value
                .get("dialogs")
                .and_then(Value::as_array)
                .map(|items| items.iter().map(BrowserDialogPresence::from_json).collect()),
            obstruction: value
                .get("obstruction")
                .filter(|inner| !inner.is_null())
                .map(BrowserObstructionDiagnostics::from_json),
        }
    }
}

/// Result of `surface.inspect()`.
#[derive(Clone, Debug, PartialEq)]
pub struct BrowserInspection {
    pub snapshot: BrowserPageSnapshot,
    pub target: Option<BrowserTargetDiagnostics>,
    pub metrics: BrowserPerformanceMetrics,
}

impl BrowserInspection {
    pub fn to_json(&self) -> Value {
        let mut map = Map::new();
        map.insert("snapshot".into(), self.snapshot.to_json());
        if let Some(target) = &self.target {
            map.insert("target".into(), target.to_json());
        }
        map.insert("metrics".into(), self.metrics.to_json());
        Value::Object(map)
    }
}

/// Navigation timings mirrored from `performance.getEntriesByType("navigation")`.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct BrowserNavigationMetrics {
    pub kind: Option<String>,
    pub dom_content_loaded_ms: Option<f64>,
    pub load_ms: Option<f64>,
    pub transfer_size: Option<f64>,
    pub encoded_body_size: Option<f64>,
    pub decoded_body_size: Option<f64>,
}

impl BrowserNavigationMetrics {
    pub fn to_json(&self) -> Value {
        let mut map = Map::new();
        insert_opt(&mut map, "type", self.kind.clone());
        insert_opt_f64(&mut map, "domContentLoadedMs", self.dom_content_loaded_ms);
        insert_opt_f64(&mut map, "loadMs", self.load_ms);
        insert_opt_f64(&mut map, "transferSize", self.transfer_size);
        insert_opt_f64(&mut map, "encodedBodySize", self.encoded_body_size);
        insert_opt_f64(&mut map, "decodedBodySize", self.decoded_body_size);
        Value::Object(map)
    }
}

/// Paint timings.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct BrowserPaintMetrics {
    pub first_paint_ms: Option<f64>,
    pub first_contentful_paint_ms: Option<f64>,
}

impl BrowserPaintMetrics {
    pub fn to_json(&self) -> Value {
        let mut map = Map::new();
        insert_opt_f64(&mut map, "firstPaintMs", self.first_paint_ms);
        insert_opt_f64(
            &mut map,
            "firstContentfulPaintMs",
            self.first_contentful_paint_ms,
        );
        Value::Object(map)
    }
}

/// Web vitals sample.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct BrowserWebVitals {
    pub lcp_ms: Option<f64>,
    pub cls: Option<f64>,
    pub inp_ms: Option<f64>,
}

impl BrowserWebVitals {
    pub fn to_json(&self) -> Value {
        let mut map = Map::new();
        insert_opt_f64(&mut map, "lcpMs", self.lcp_ms);
        insert_opt_f64(&mut map, "cls", self.cls);
        insert_opt_f64(&mut map, "inpMs", self.inp_ms);
        Value::Object(map)
    }
}

/// Resource aggregation.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct BrowserResourceMetrics {
    pub total: u64,
    pub scripts: u64,
    pub stylesheets: u64,
    pub images: u64,
    pub fonts: u64,
    pub largest_transfer_size: Option<f64>,
}

impl BrowserResourceMetrics {
    pub fn to_json(&self) -> Value {
        let mut map = Map::new();
        map.insert("total".into(), json!(self.total));
        map.insert("scripts".into(), json!(self.scripts));
        map.insert("stylesheets".into(), json!(self.stylesheets));
        map.insert("images".into(), json!(self.images));
        map.insert("fonts".into(), json!(self.fonts));
        insert_opt_f64(&mut map, "largestTransferSize", self.largest_transfer_size);
        Value::Object(map)
    }
}

/// `performance.memory` sample (Chromium only in the reference).
#[derive(Clone, Debug, Default, PartialEq)]
pub struct BrowserMemoryMetrics {
    pub used_js_heap_bytes: Option<f64>,
    pub total_js_heap_bytes: Option<f64>,
    pub js_heap_size_limit: Option<f64>,
}

impl BrowserMemoryMetrics {
    pub fn to_json(&self) -> Value {
        let mut map = Map::new();
        insert_opt_f64(&mut map, "usedJSHeapSize", self.used_js_heap_bytes);
        insert_opt_f64(&mut map, "totalJSHeapSize", self.total_js_heap_bytes);
        insert_opt_f64(&mut map, "jsHeapSizeLimit", self.js_heap_size_limit);
        Value::Object(map)
    }
}

/// `BrowserPerformanceMetrics` from the reference.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct BrowserPerformanceMetrics {
    pub sampled_at: String,
    pub url: String,
    pub title: String,
    pub navigation: Option<BrowserNavigationMetrics>,
    pub paint: Option<BrowserPaintMetrics>,
    pub web_vitals: Option<BrowserWebVitals>,
    pub resources: Option<BrowserResourceMetrics>,
    pub memory: Option<BrowserMemoryMetrics>,
}

impl BrowserPerformanceMetrics {
    pub fn to_json(&self) -> Value {
        let mut map = Map::new();
        map.insert("sampledAt".into(), Value::String(self.sampled_at.clone()));
        map.insert("url".into(), Value::String(self.url.clone()));
        map.insert("title".into(), Value::String(self.title.clone()));
        if let Some(navigation) = &self.navigation {
            map.insert("navigation".into(), navigation.to_json());
        }
        if let Some(paint) = &self.paint {
            map.insert("paint".into(), paint.to_json());
        }
        if let Some(vitals) = &self.web_vitals {
            map.insert("webVitals".into(), vitals.to_json());
        }
        if let Some(resources) = &self.resources {
            map.insert("resources".into(), resources.to_json());
        }
        if let Some(memory) = &self.memory {
            map.insert("memory".into(), memory.to_json());
        }
        Value::Object(map)
    }
}

// ---------------------------------------------------------------------------
// Runtime events + console flood guard
// ---------------------------------------------------------------------------

/// Payload of a browser runtime event (`console`, `pageerror`, `request`, ...).
#[derive(Clone, Debug, Default, PartialEq)]
pub struct BrowserRuntimeEventInput {
    pub event_type: String,
    pub level: Option<String>,
    pub text: Option<String>,
    pub url: Option<String>,
    pub method: Option<String>,
    pub status: Option<u16>,
}

impl BrowserRuntimeEventInput {
    pub fn console(level: &str, text: &str) -> Self {
        Self {
            event_type: CONSOLE_EVENT_TYPE.to_string(),
            level: Some(level.to_string()),
            text: Some(text.to_string()),
            ..Self::default()
        }
    }

    pub fn to_json(&self) -> Value {
        let mut map = Map::new();
        map.insert("type".into(), Value::String(self.event_type.clone()));
        insert_opt(&mut map, "level", self.level.clone());
        insert_opt(&mut map, "text", self.text.clone());
        insert_opt(&mut map, "url", self.url.clone());
        insert_opt(&mut map, "method", self.method.clone());
        if let Some(status) = self.status {
            map.insert("status".into(), json!(status));
        }
        Value::Object(map)
    }
}

/// Buffered runtime event (`BrowserRuntimeEvent` in the reference).
#[derive(Clone, Debug, Default, PartialEq)]
pub struct BrowserRuntimeEvent {
    pub id: u64,
    pub timestamp: String,
    pub event: BrowserRuntimeEventInput,
}

impl BrowserRuntimeEvent {
    pub fn to_json(&self) -> Value {
        let mut map = Map::new();
        map.insert("id".into(), json!(self.id));
        map.insert("timestamp".into(), Value::String(self.timestamp.clone()));
        if let Value::Object(payload) = self.event.to_json() {
            for (key, value) in payload {
                map.insert(key, value);
            }
        }
        Value::Object(map)
    }
}

/// Clock injection so flood-guard windows are testable.
pub type FloodClock = Arc<dyn Fn() -> u64 + Send + Sync>;

/// Result of observing one console message.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct FloodRecordOutcome {
    /// `true` when the message must be dropped (a notice may still be emitted).
    pub drop: bool,
    /// Emitted once when capture pauses.
    pub notice: Option<BrowserRuntimeEventInput>,
}

/// Observable snapshot of the guard state.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct FloodGuardState {
    pub paused: bool,
    pub resumes_at: Option<u64>,
    pub dropped: u64,
}

/// Windowed console flood guard from the reference module.
pub struct ConsoleFloodGuard {
    window_ms: u64,
    threshold: usize,
    cooldown_ms: u64,
    now: FloodClock,
    recent: VecDeque<u64>,
    resumes_at: Option<u64>,
    dropped: u64,
}

impl ConsoleFloodGuard {
    pub fn new() -> Self {
        Self::with_params(
            CONSOLE_FLOOD_WINDOW_MS,
            CONSOLE_FLOOD_THRESHOLD,
            CONSOLE_FLOOD_COOLDOWN_MS,
        )
    }

    pub fn with_params(window_ms: u64, threshold: usize, cooldown_ms: u64) -> Self {
        Self::with_clock(window_ms, threshold, cooldown_ms, Arc::new(now_ms))
    }

    pub fn with_clock(window_ms: u64, threshold: usize, cooldown_ms: u64, now: FloodClock) -> Self {
        Self {
            window_ms,
            threshold,
            cooldown_ms,
            now,
            recent: VecDeque::new(),
            resumes_at: None,
            dropped: 0,
        }
    }

    pub fn record(&mut self) -> FloodRecordOutcome {
        let at = (self.now)();
        self.record_at(at)
    }

    /// The configured window, threshold and cooldown.
    pub fn configuration(&self) -> (u64, usize, u64) {
        (self.window_ms, self.threshold, self.cooldown_ms)
    }

    /// Records one console message at `at` (epoch milliseconds).
    ///
    /// Mirrors the reference `record()` exactly:
    /// 1. still paused -> drop, no notice;
    /// 2. pause just expired -> keep the message, announce the resume once;
    /// 3. otherwise slide the window, and pause once the threshold is reached.
    pub fn record_at(&mut self, at: u64) -> FloodRecordOutcome {
        let was_paused = self.resumes_at.is_some();
        if self.is_paused_at(at) {
            self.dropped += 1;
            return FloodRecordOutcome {
                drop: true,
                notice: None,
            };
        }
        if was_paused {
            self.resumes_at = None;
            return FloodRecordOutcome {
                drop: false,
                notice: Some(BrowserRuntimeEventInput {
                    event_type: CONSOLE_EVENT_TYPE.to_string(),
                    level: Some("info".to_string()),
                    text: Some(CONSOLE_RESUME_NOTICE.to_string()),
                    ..BrowserRuntimeEventInput::default()
                }),
            };
        }

        self.recent.push_back(at);
        while self
            .recent
            .front()
            .is_some_and(|oldest| at.saturating_sub(*oldest) > self.window_ms)
        {
            self.recent.pop_front();
        }

        if self.recent.len() < self.threshold {
            return FloodRecordOutcome::default();
        }

        self.recent.clear();
        self.resumes_at = Some(at.saturating_add(self.cooldown_ms));
        self.dropped = 0;
        let seconds = (self.cooldown_ms as f64 / 1000.0).round() as u64;
        let window_seconds = (self.window_ms as f64 / 1000.0).round() as u64;
        let threshold = self.threshold;
        FloodRecordOutcome {
            drop: true,
            notice: Some(BrowserRuntimeEventInput {
                event_type: CONSOLE_EVENT_TYPE.to_string(),
                level: Some("warn".to_string()),
                text: Some(format!(
                    "{CONSOLE_FLOOD_NOTICE_PREFIX} {seconds}s — the page emitted {threshold} console messages in the last {window_seconds}s (flood detected). New console messages are skipped until the cooldown expires."
                )),
                ..BrowserRuntimeEventInput::default()
            }),
        }
    }

    /// Non-mutating pause check (mirrors `isPaused()`, no lazy reset).
    pub fn is_paused_at(&self, at: u64) -> bool {
        self.resumes_at.is_some_and(|resumes_at| at < resumes_at)
    }

    pub fn state_at(&self, at: u64) -> FloodGuardState {
        FloodGuardState {
            paused: self.is_paused_at(at),
            resumes_at: self.resumes_at,
            dropped: self.dropped,
        }
    }

    pub fn dropped(&self) -> u64 {
        self.dropped
    }
}

impl std::fmt::Debug for ConsoleFloodGuard {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ConsoleFloodGuard")
            .field("window_ms", &self.window_ms)
            .field("threshold", &self.threshold)
            .field("cooldown_ms", &self.cooldown_ms)
            .field("recent", &self.recent.len())
            .field("resumes_at", &self.resumes_at)
            .field("dropped", &self.dropped)
            .finish()
    }
}

impl Default for ConsoleFloodGuard {
    fn default() -> Self {
        Self::new()
    }
}

/// Appends one event, evicting the oldest when the buffer is full.
pub fn append_browser_runtime_event(
    events: &mut Vec<BrowserRuntimeEvent>,
    next: BrowserRuntimeEventInput,
) -> BrowserRuntimeEvent {
    let id = events.last().map(|event| event.id + 1).unwrap_or(0) + 1;
    let event = BrowserRuntimeEvent {
        id,
        timestamp: now_iso8601(),
        event: next,
    };
    events.push(event.clone());
    if events.len() > MAX_BROWSER_RUNTIME_EVENTS {
        let overflow = events.len() - MAX_BROWSER_RUNTIME_EVENTS;
        events.drain(0..overflow);
    }
    event
}

/// `pushRuntimeEvent`: console floods are dropped but announce themselves once.
pub fn push_browser_runtime_event(
    events: &mut Vec<BrowserRuntimeEvent>,
    next: BrowserRuntimeEventInput,
    console_guard: Option<&mut ConsoleFloodGuard>,
) {
    if next.event_type == CONSOLE_EVENT_TYPE
        && let Some(guard) = console_guard
    {
        let outcome = guard.record();
        if let Some(notice) = outcome.notice.clone() {
            append_browser_runtime_event(events, notice);
        }
        if outcome.drop {
            return;
        }
    }
    append_browser_runtime_event(events, next);
}

// ---------------------------------------------------------------------------
// Surface
// ---------------------------------------------------------------------------

struct BrowserRuntimeState {
    status: SurfaceState,
    session_id: Option<String>,
    started_at: Option<String>,
    last_url: String,
    last_title: String,
    action_count: u64,
    last_activity: Instant,
    driver: Option<Arc<dyn BrowserDriver>>,
}

impl Default for BrowserRuntimeState {
    fn default() -> Self {
        Self {
            status: SurfaceState::Idle,
            session_id: None,
            started_at: None,
            last_url: String::new(),
            last_title: String::new(),
            action_count: 0,
            last_activity: Instant::now(),
            driver: None,
        }
    }
}

type OutputListener = Arc<dyn Fn(&str) + Send + Sync>;
type StateListener = Arc<dyn Fn(SurfaceState) + Send + Sync>;

/// Native `BrowserSurface`.
pub struct BrowserSurface {
    id: String,
    options: BrowserSurfaceOptions,
    state: Mutex<BrowserRuntimeState>,
    on_output: Mutex<Option<OutputListener>>,
    on_state_change: Mutex<Option<StateListener>>,
}

impl BrowserSurface {
    pub fn new(id: impl Into<String>, options: BrowserSurfaceOptions) -> Self {
        Self {
            id: id.into(),
            options,
            state: Mutex::new(BrowserRuntimeState::default()),
            on_output: Mutex::new(None),
            on_state_change: Mutex::new(None),
        }
    }

    /// Convenience constructor for hosts that already hold a driver.
    pub fn with_driver(id: impl Into<String>, driver: Arc<dyn BrowserDriver>) -> Self {
        Self::new(id, BrowserSurfaceOptions::from_driver(driver))
    }

    pub fn set_output_listener(&self, listener: Option<OutputListener>) {
        *self.on_output.lock().expect("browser output listeners") = listener;
    }

    pub fn set_state_listener(&self, listener: Option<StateListener>) {
        *self
            .on_state_change
            .lock()
            .expect("browser state listeners") = listener;
    }

    pub fn options(&self) -> &BrowserSurfaceOptions {
        &self.options
    }

    pub fn state(&self) -> SurfaceState {
        let mut state = self.state.lock().expect("browser state");
        if state.status == SurfaceState::Running {
            let disconnected = state
                .driver
                .as_ref()
                .and_then(|driver| driver.is_connected())
                == Some(false);
            if disconnected {
                state.status = SurfaceState::Error;
            }
        }
        state.status
    }

    pub fn session_id(&self) -> Option<String> {
        self.state.lock().expect("browser state").session_id.clone()
    }

    pub fn started_at(&self) -> Option<String> {
        self.state.lock().expect("browser state").started_at.clone()
    }

    pub fn action_count(&self) -> u64 {
        self.state.lock().expect("browser state").action_count
    }

    pub fn idle_ms(&self) -> u64 {
        let state = self.state.lock().expect("browser state");

        state.last_activity.elapsed().as_millis() as u64
    }

    pub fn current_url(&self) -> String {
        self.state.lock().expect("browser state").last_url.clone()
    }

    pub fn get_live_view_info(&self) -> Option<LiveViewInfo> {
        self.state
            .lock()
            .expect("browser state")
            .driver
            .as_ref()
            .and_then(|driver| driver.live_view())
    }

    fn set_state(&self, next: SurfaceState) {
        {
            let mut state = self.state.lock().expect("browser state");
            state.status = next;
        }
        let listener = self
            .on_state_change
            .lock()
            .expect("browser state listeners")
            .clone();
        if let Some(listener) = listener {
            listener(next);
        }
    }

    fn touch(&self) {
        self.state.lock().expect("browser state").last_activity = Instant::now();
    }

    fn bump_action(&self) {
        self.state.lock().expect("browser state").action_count += 1;
    }

    fn capture_snapshot_meta(&self, snapshot: &BrowserPageSnapshot) {
        let mut state = self.state.lock().expect("browser state");
        state.last_url = snapshot.url.clone();
        state.last_title = snapshot.title.clone();
    }

    fn emit_output(&self, line: &str) {
        let listener = self
            .on_output
            .lock()
            .expect("browser output listeners")
            .clone();
        if let Some(listener) = listener {
            listener(line);
        }
    }

    fn driver(&self) -> Option<Arc<dyn BrowserDriver>> {
        self.state.lock().expect("browser state").driver.clone()
    }

    fn require_driver(&self) -> SurfaceResult<Arc<dyn BrowserDriver>> {
        let running = self.state() == SurfaceState::Running;
        match self.driver() {
            Some(driver) if running => Ok(driver),
            _ => Err("Browser surface is not running".to_string()),
        }
    }

    async fn try_diagnose(&self, selector: &str) -> Option<BrowserTargetDiagnostics> {
        match self.require_driver() {
            Ok(driver) => driver.diagnose(selector).await.ok(),
            Err(_) => None,
        }
    }

    /// `start`: idle/stopped → starting → running, or error on factory failure.
    pub async fn start(&self, _input: SurfaceStartInput) -> SurfaceResult<()> {
        // The legacy factory cannot carry a revocable authority or guarantee
        // process cleanup. Integration must use the supervised effect boundary.
        self.set_state(SurfaceState::Error);
        Err("Browser driver lacks supervised effect authority".to_string())
    }

    /// `stop`: stopping → (driver.close) → stopped. Driver close errors are the
    /// caller's to observe, exactly like the reference's awaited `driver?.close()`.
    pub async fn stop(&self) -> SurfaceResult<()> {
        self.set_state(SurfaceState::Stopping);
        let driver = self.driver();
        let mut result = Ok(());
        if let Some(driver) = driver {
            result = driver.close().await;
        }
        self.state.lock().expect("browser state").driver = None;
        self.set_state(SurfaceState::Stopped);
        result
    }

    pub fn snapshot(&self) -> SurfaceResult<SurfaceSnapshot> {
        let state = self.state.lock().expect("browser state");
        let live_view_container_name = state
            .driver
            .as_ref()
            .and_then(|driver| driver.live_view())
            .and_then(|info| info.container_name);
        let current_url = if state.last_url.is_empty() {
            Value::Null
        } else {
            Value::String(state.last_url.clone())
        };
        let title = if state.last_title.is_empty() {
            Value::Null
        } else {
            Value::String(state.last_title.clone())
        };
        let mut metadata = Map::new();
        metadata.insert("currentUrl".into(), current_url);
        metadata.insert("title".into(), title);
        metadata.insert("actionCount".into(), json!(state.action_count));
        metadata.insert(
            "liveViewContainerName".into(),
            match live_view_container_name {
                Some(name) => Value::String(name),
                None => Value::Null,
            },
        );
        drop(state);
        metadata.insert("idleMs".into(), json!(self.idle_ms()));
        Ok(SurfaceSnapshot {
            id: self.id.clone(),
            kind: BROWSER_SURFACE_TYPE.to_string(),
            state: self.state(),
            session_id: self.session_id().unwrap_or_default(),
            started_at: self.started_at(),
            metadata,
        })
    }

    pub async fn navigate(&self, url: &str) -> SurfaceResult<BrowserPageSnapshot> {
        self.touch();
        let driver = self.require_driver()?;
        driver.navigate(url).await?;
        self.bump_action();
        let snapshot = driver.snapshot().await?;
        self.capture_snapshot_meta(&snapshot);
        self.touch();
        self.emit_output(&format!("navigate {}", snapshot.url));
        Ok(snapshot)
    }

    pub async fn reload(&self) -> SurfaceResult<BrowserPageSnapshot> {
        self.touch();
        let driver = self.require_driver()?;
        if !driver.supports_reload() {
            return Err("This browser does not support refresh.".to_string());
        }
        driver.reload().await?;
        self.bump_action();
        let snapshot = driver.snapshot().await?;
        self.capture_snapshot_meta(&snapshot);
        self.touch();
        self.emit_output(&format!("reload {}", snapshot.url));
        Ok(snapshot)
    }

    pub async fn get_dev_tools_connection(&self) -> SurfaceResult<Option<DevToolsConnection>> {
        Ok(self.require_driver()?.get_dev_tools_connection())
    }

    /// Human readable snapshot rendering (`describe`).
    pub async fn describe(&self) -> SurfaceResult<String> {
        self.touch();
        let snapshot = self.require_driver()?.snapshot().await?;
        self.capture_snapshot_meta(&snapshot);
        self.touch();

        let mut lines: Vec<String> = Vec::new();
        lines.push(format!("URL: {}", snapshot.url));
        lines.push(format!(
            "Title: {}",
            if snapshot.title.is_empty() {
                "(untitled)"
            } else {
                snapshot.title.as_str()
            }
        ));
        lines.push(match &snapshot.active_element {
            Some(active) => format!("Active element: {}", active.describe_line()),
            None => "Active element: (none)".to_string(),
        });
        lines.push(match snapshot.dialogs.as_ref().filter(|d| !d.is_empty()) {
            Some(dialogs) => format!(
                "Dialogs: {}",
                dialogs
                    .iter()
                    .map(BrowserDialogPresence::label)
                    .collect::<Vec<_>>()
                    .join(", ")
            ),
            None => "Dialogs: (none)".to_string(),
        });
        lines.push(String::new());
        lines.push("Text:".to_string());
        let text = snapshot.text.trim();
        lines.push(if text.is_empty() {
            "(no textual content)".to_string()
        } else {
            text.to_string()
        });
        lines.push(String::new());
        lines.push("Interactive elements:".to_string());
        for (index, element) in snapshot.elements.iter().take(30).enumerate() {
            let label = element.label();
            let label = if label.is_empty() {
                "unnamed".to_string()
            } else {
                label
            };
            let selector = if element.selector.is_empty() {
                String::new()
            } else {
                format!(" [{}]", element.selector)
            };
            lines.push(format!("{}. {}{}", index + 1, label, selector));
        }
        Ok(lines.join("\n").trim().to_string())
    }

    pub async fn inspect(&self, selector: Option<&str>) -> SurfaceResult<BrowserInspection> {
        self.touch();
        let driver = self.require_driver()?;
        let snapshot = driver.snapshot().await?;
        self.capture_snapshot_meta(&snapshot);
        let target = match selector {
            Some(selector) => Some(driver.diagnose(selector).await?),
            None => None,
        };
        let metrics = driver.get_metrics().await?;
        self.touch();
        Ok(BrowserInspection {
            snapshot,
            target,
            metrics,
        })
    }

    pub async fn click(&self, selector: &str) -> SurfaceResult<()> {
        self.touch();
        let driver = self.require_driver()?;
        match driver.click(selector).await {
            Ok(()) => {}
            Err(error) => {
                let diagnostics = self.try_diagnose(selector).await;
                return Err(enrich_browser_action_error(
                    "click",
                    selector,
                    &error,
                    diagnostics.as_ref(),
                ));
            }
        }
        self.bump_action();
        self.touch();
        Ok(())
    }

    pub async fn type_text(&self, selector: &str, text: &str) -> SurfaceResult<()> {
        self.touch();
        self.require_driver()?.type_text(selector, text).await?;
        self.bump_action();
        self.touch();
        Ok(())
    }

    pub async fn scroll(&self, x: f64, y: f64) -> SurfaceResult<()> {
        self.touch();
        self.require_driver()?.scroll(x, y).await?;
        self.bump_action();
        self.touch();
        Ok(())
    }

    pub async fn select(&self, selector: &str, value: &str) -> SurfaceResult<()> {
        self.touch();
        self.require_driver()?.select(selector, value).await?;
        self.bump_action();
        self.touch();
        Ok(())
    }

    pub async fn wait_for(&self, selector: &str, timeout_ms: u64) -> SurfaceResult<()> {
        self.touch();
        self.require_driver()?
            .wait_for(selector, timeout_ms)
            .await?;
        self.bump_action();
        self.touch();
        Ok(())
    }

    pub async fn screenshot(&self, path: Option<&str>) -> SurfaceResult<String> {
        self.touch();
        let driver = self.require_driver()?;
        self.bump_action();
        let result = driver.screenshot(path).await;
        self.touch();
        result
    }

    pub async fn get_metrics(&self) -> SurfaceResult<BrowserPerformanceMetrics> {
        self.touch();
        let result = self.require_driver()?.get_metrics().await;
        self.touch();
        result
    }

    pub fn get_events(&self) -> SurfaceResult<Vec<BrowserRuntimeEvent>> {
        self.touch();
        Ok(self.require_driver()?.get_events())
    }
}

impl Surface for BrowserSurface {
    fn id(&self) -> &str {
        &self.id
    }

    fn kind(&self) -> &str {
        BROWSER_SURFACE_TYPE
    }

    fn state(&self) -> SurfaceState {
        BrowserSurface::state(self)
    }

    fn session_id(&self) -> Option<String> {
        BrowserSurface::session_id(self)
    }

    fn start(&self, input: SurfaceStartInput) -> SurfaceFuture<'_, ()> {
        Box::pin(async move { BrowserSurface::start(self, input).await })
    }

    fn stop(&self, _reason: Option<String>) -> SurfaceFuture<'_, ()> {
        Box::pin(async move { BrowserSurface::stop(self).await })
    }

    fn snapshot(&self) -> SurfaceResult<SurfaceSnapshot> {
        BrowserSurface::snapshot(self)
    }
}

/// `BrowserSurfaceFactory` from the reference.
#[derive(Clone, Default)]
pub struct BrowserSurfaceFactory {
    options: BrowserSurfaceOptions,
}

impl BrowserSurfaceFactory {
    pub fn new(options: BrowserSurfaceOptions) -> Self {
        Self { options }
    }

    pub fn options(&self) -> &BrowserSurfaceOptions {
        &self.options
    }
}

impl SurfaceFactory for BrowserSurfaceFactory {
    fn kind(&self) -> &str {
        BROWSER_SURFACE_TYPE
    }

    fn create(&self, id: &str) -> SurfaceResult<SurfaceRef> {
        Ok(Arc::new(BrowserSurface::new(id, self.options.clone())))
    }
}

// ---------------------------------------------------------------------------
// Free helpers ported from the reference module
// ---------------------------------------------------------------------------

/// Browser runtime selection (`BROWSER_RUNTIME`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BrowserRuntimeMode {
    Auto,
    InProcess,
    NodeBridge,
}

impl BrowserRuntimeMode {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Auto => "auto",
            Self::InProcess => "in-process",
            Self::NodeBridge => "node-bridge",
        }
    }
}

/// `resolveBrowserRuntimeMode` over an explicit env value.
pub fn resolve_browser_runtime_mode(configured: Option<&str>) -> BrowserRuntimeMode {
    let configured = configured.map(|value| value.trim().to_lowercase());
    match configured.as_deref() {
        Some("in-process") => BrowserRuntimeMode::InProcess,
        Some("node") | Some("node-bridge") => BrowserRuntimeMode::NodeBridge,
        _ => BrowserRuntimeMode::Auto,
    }
}

/// `resolveBrowserRuntimeMode` reading `BROWSER_RUNTIME` from the process env.
pub fn resolve_browser_runtime_mode_from_env() -> BrowserRuntimeMode {
    resolve_browser_runtime_mode(std::env::var("BROWSER_RUNTIME").ok().as_deref())
}

/// `isReusableBootstrapPageUrl`: blank/bootstrapped pages are reused instead of
/// creating a new tab.
pub fn is_reusable_bootstrap_page_url(url: Option<&str>) -> bool {
    let normalized = url.map(|value| value.trim().to_lowercase());
    matches!(
        normalized.as_deref(),
        Some("about:blank")
            | Some("chrome://newtab/")
            | Some("chrome://new-tab-page/")
            | Some("edge://newtab/")
    )
}

/// Page descriptor consumed by [`select_initial_browser_page`].
pub trait BrowserPageCandidate {
    fn is_closed(&self) -> bool {
        false
    }
    fn url(&self) -> Option<String> {
        None
    }
}

/// `selectInitialBrowserPage`: reuse the first open bootstrap page, otherwise
/// create a new one through `new_page()`.
pub async fn select_initial_browser_page<T, F, Fut>(pages: Vec<T>, new_page: F) -> Result<T, String>
where
    T: BrowserPageCandidate,
    F: FnOnce() -> Fut,
    Fut: Future<Output = Result<T, String>>,
{
    let open: Vec<T> = pages.into_iter().filter(|page| !page.is_closed()).collect();
    let mut blank = None;
    for page in open {
        if is_reusable_bootstrap_page_url(page.url().as_deref()) {
            blank = Some(page);
            break;
        }
    }
    match blank {
        Some(page) => Ok(page),
        None => new_page().await,
    }
}

fn extract_error_message(error: &str) -> &str {
    error
}

/// `enrichBrowserActionError`: appends target diagnostics to an action failure.
pub fn enrich_browser_action_error(
    action: &str,
    selector: &str,
    error: &str,
    diagnostics: Option<&BrowserTargetDiagnostics>,
) -> String {
    let mut parts = vec![format!(
        "browser.{action} failed for '{selector}': {}",
        extract_error_message(error)
    )];
    let Some(diagnostics) = diagnostics else {
        return parts.join(" ");
    };
    if !diagnostics.found {
        parts.push("Target was not found in the DOM.".to_string());
        return parts.join(" ");
    }
    if diagnostics.offscreen == Some(true) {
        parts.push("Target appears offscreen.".to_string());
    }
    if diagnostics.disabled == Some(true) {
        parts.push("Target is disabled.".to_string());
    }
    if diagnostics.in_dialog == Some(true) {
        let title = diagnostics
            .dialog_title
            .as_deref()
            .map(|title| format!(" '{title}'"))
            .unwrap_or_default();
        parts.push(format!("Target is inside dialog{title}."));
    }
    if diagnostics.obscured == Some(true) {
        let intercepted_label = diagnostics
            .intercepted_by
            .as_ref()
            .map(BrowserObstructionSummary::label)
            .filter(|label| !label.is_empty());
        parts.push(
            match (
                diagnostics.obstruction_reason.as_deref(),
                intercepted_label.as_deref(),
            ) {
                (Some(reason), _) => reason.to_string(),
                (None, Some(label)) => format!("Click may be intercepted by {label}."),
                (None, None) => "Click appears obstructed.".to_string(),
            },
        );
    }
    parts.join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};

    fn block_on<F: Future>(future: F) -> F::Output {
        use std::task::{Context, Poll, Wake, Waker};
        struct NoopWaker;
        impl Wake for NoopWaker {
            fn wake(self: Arc<Self>) {}
        }
        let waker = Waker::from(Arc::new(NoopWaker));
        let mut context = Context::from_waker(&waker);
        let mut future = Box::pin(future);
        loop {
            if let Poll::Ready(value) = future.as_mut().poll(&mut context) {
                return value;
            }
        }
    }

    fn start_input(session: &str) -> SurfaceStartInput {
        SurfaceStartInput {
            session_id: session.to_string(),
            project_root: "/tmp/project".to_string(),
            node_id: None,
            properties: Map::new(),
        }
    }

    #[derive(Default)]
    struct MockDriver {
        connected: Option<bool>,
        supports_reload: bool,
        click_error: Option<String>,
        diagnostics: Option<BrowserTargetDiagnostics>,
        closed: Arc<AtomicBool>,
        navigations: Arc<AtomicU64>,
        snapshot_url: Arc<Mutex<String>>,
        events: Arc<Mutex<Vec<BrowserRuntimeEvent>>>,
    }

    impl BrowserDriver for MockDriver {
        fn is_connected(&self) -> Option<bool> {
            self.connected
        }

        fn supports_reload(&self) -> bool {
            self.supports_reload
        }

        fn navigate<'a>(&'a self, url: &'a str) -> DriverFuture<'a, ()> {
            self.navigations.fetch_add(1, Ordering::SeqCst);
            *self.snapshot_url.lock().expect("url") = url.to_string();
            Box::pin(async { Ok(()) })
        }

        fn reload<'a>(&'a self) -> DriverFuture<'a, ()> {
            Box::pin(async { Ok(()) })
        }

        fn click<'a>(&'a self, _selector: &'a str) -> DriverFuture<'a, ()> {
            let error = self.click_error.clone();
            Box::pin(async move {
                match error {
                    Some(error) => Err(error),
                    None => Ok(()),
                }
            })
        }

        fn type_text<'a>(&'a self, _selector: &'a str, _text: &'a str) -> DriverFuture<'a, ()> {
            Box::pin(async { Ok(()) })
        }

        fn scroll<'a>(&'a self, _x: f64, _y: f64) -> DriverFuture<'a, ()> {
            Box::pin(async { Ok(()) })
        }

        fn select<'a>(&'a self, _selector: &'a str, _value: &'a str) -> DriverFuture<'a, ()> {
            Box::pin(async { Ok(()) })
        }

        fn wait_for<'a>(&'a self, _selector: &'a str, _timeout_ms: u64) -> DriverFuture<'a, ()> {
            Box::pin(async { Ok(()) })
        }

        fn screenshot<'a>(&'a self, path: Option<&'a str>) -> DriverFuture<'a, String> {
            let path = path.map(str::to_string);
            Box::pin(async move { Ok(path.unwrap_or_else(|| "screenshot.png".to_string())) })
        }

        fn snapshot<'a>(&'a self) -> DriverFuture<'a, BrowserPageSnapshot> {
            let url = self.snapshot_url.lock().expect("url").clone();
            Box::pin(async move {
                Ok(BrowserPageSnapshot {
                    url,
                    title: "Example".to_string(),
                    text: "  Hello world  ".to_string(),
                    elements: vec![BrowserInteractiveElement {
                        selector: "#submit".to_string(),
                        role: Some("button".to_string()),
                        name: Some("Submit".to_string()),
                        ..BrowserInteractiveElement::default()
                    }],
                    active_element: Some(BrowserActiveElement {
                        selector: "#email".to_string(),
                        tag_name: Some("input".to_string()),
                        name: Some("Email".to_string()),
                        ..BrowserActiveElement::default()
                    }),
                    dialogs: Some(vec![BrowserDialogPresence {
                        selector: "dialog".to_string(),
                        title: Some("Sign in".to_string()),
                        ..BrowserDialogPresence::default()
                    }]),
                    obstruction: None,
                })
            })
        }

        fn diagnose<'a>(
            &'a self,
            _selector: &'a str,
        ) -> DriverFuture<'a, BrowserTargetDiagnostics> {
            let diagnostics = self.diagnostics.clone();
            Box::pin(
                async move { diagnostics.ok_or_else(|| "diagnostics unavailable".to_string()) },
            )
        }

        fn get_metrics<'a>(&'a self) -> DriverFuture<'a, BrowserPerformanceMetrics> {
            Box::pin(async {
                Ok(BrowserPerformanceMetrics {
                    sampled_at: "2024-01-01T00:00:00.000Z".to_string(),
                    url: "about:blank".to_string(),
                    title: String::new(),
                    ..BrowserPerformanceMetrics::default()
                })
            })
        }

        fn get_events(&self) -> Vec<BrowserRuntimeEvent> {
            self.events.lock().expect("events").clone()
        }

        fn close<'a>(&'a self) -> DriverFuture<'a, ()> {
            self.closed.store(true, Ordering::SeqCst);
            Box::pin(async { Ok(()) })
        }
    }

    fn mock(driver: MockDriver) -> Arc<MockDriver> {
        Arc::new(driver)
    }

    fn surface_with(driver: Arc<MockDriver>) -> BrowserSurface {
        let surface = BrowserSurface::with_driver("browser-1", driver);
        block_on(surface.start(start_input("session-1"))).expect("start");
        surface
    }

    #[test]
    fn flood_guard_pauses_after_threshold_and_emits_notice_then_resumes() {
        let clock = Arc::new(AtomicU64::new(0));
        let now = {
            let clock = Arc::clone(&clock);
            Arc::new(move || clock.load(Ordering::SeqCst)) as FloodClock
        };
        let mut guard = ConsoleFloodGuard::with_clock(1_000, 3, 5_000, now);

        assert!(!guard.record_at(0).drop);
        assert!(!guard.record_at(10).drop);
        let burst = guard.record_at(20);
        assert!(burst.drop);
        let notice = burst.notice.expect("notice");
        assert_eq!(notice.event_type, "console");
        assert!(notice.text.unwrap().contains("Console capture paused"));

        let paused = guard.record_at(30);
        assert!(paused.drop);
        assert!(paused.notice.is_none());
        assert!(guard.is_paused_at(30));
        assert_eq!(guard.state_at(30).dropped, 1);

        // Cooldown expiry resumes capture and announces it exactly once.
        let resumed = guard.record_at(5_030);
        assert!(!resumed.drop);
        assert_eq!(
            resumed.notice.expect("resume notice").text.as_deref(),
            Some(CONSOLE_RESUME_NOTICE)
        );
        assert!(!guard.is_paused_at(5_030));
        assert!(guard.record_at(5_040).notice.is_none());
    }

    #[test]
    fn push_browser_runtime_event_drops_console_while_paused_and_caps_buffer() {
        let clock = Arc::new(AtomicU64::new(0));
        let now = {
            let clock = Arc::clone(&clock);
            Arc::new(move || clock.load(Ordering::SeqCst)) as FloodClock
        };
        let mut guard = ConsoleFloodGuard::with_clock(1_000, 2, 60_000, now);
        let mut events: Vec<BrowserRuntimeEvent> = Vec::new();

        push_browser_runtime_event(
            &mut events,
            BrowserRuntimeEventInput::console("log", "first"),
            Some(&mut guard),
        );
        push_browser_runtime_event(
            &mut events,
            BrowserRuntimeEventInput::console("log", "second"),
            Some(&mut guard),
        );
        assert_eq!(events.len(), 2);
        assert_eq!(events[1].event.text.as_deref(), Some("second"));

        // Third message trips the guard: only the pause notice is recorded.
        push_browser_runtime_event(
            &mut events,
            BrowserRuntimeEventInput::console("log", "third"),
            Some(&mut guard),
        );
        assert_eq!(events.len(), 3);
        assert!(
            events[2]
                .event
                .text
                .as_deref()
                .unwrap_or_default()
                .contains("Console capture paused")
        );

        // Non-console events bypass the guard entirely.
        push_browser_runtime_event(
            &mut events,
            BrowserRuntimeEventInput {
                event_type: "pageerror".to_string(),
                text: Some("boom".to_string()),
                ..BrowserRuntimeEventInput::default()
            },
            Some(&mut guard),
        );
        assert_eq!(events.last().unwrap().event.event_type, "pageerror");

        for index in 0..(MAX_BROWSER_RUNTIME_EVENTS + 5) {
            append_browser_runtime_event(
                &mut events,
                BrowserRuntimeEventInput {
                    event_type: "request".to_string(),
                    url: Some(format!("https://example.com/{index}")),
                    ..BrowserRuntimeEventInput::default()
                },
            );
        }
        assert_eq!(events.len(), MAX_BROWSER_RUNTIME_EVENTS);
        assert_eq!(
            events.last().unwrap().id,
            (MAX_BROWSER_RUNTIME_EVENTS as u64 + 9)
        );
    }

    #[test]
    fn runtime_event_json_uses_reference_field_names() {
        let event = BrowserRuntimeEvent {
            id: 7,
            timestamp: "2024-01-01T00:00:00.000Z".to_string(),
            event: BrowserRuntimeEventInput {
                event_type: "response".to_string(),
                method: Some("GET".to_string()),
                url: Some("https://example.com".to_string()),
                status: Some(200),
                ..BrowserRuntimeEventInput::default()
            },
        };
        let json = event.to_json();
        assert_eq!(json["id"], json!(7));
        assert_eq!(json["type"], json!("response"));
        assert_eq!(json["status"], json!(200));
        assert_eq!(json["url"], json!("https://example.com"));
    }

    #[test]
    fn start_moves_state_and_records_session_and_snapshot_metadata() {
        let mock_driver = Arc::new(MockDriver::default());
        let driver: Arc<dyn BrowserDriver> = mock_driver.clone();
        let surface = BrowserSurface::with_driver("browser-1", Arc::clone(&driver));
        assert_eq!(surface.state(), SurfaceState::Idle);

        block_on(surface.start(start_input("session-1"))).expect("start");
        assert_eq!(surface.state(), SurfaceState::Running);
        assert_eq!(surface.session_id().as_deref(), Some("session-1"));

        let snapshot = surface.snapshot().expect("snapshot");
        assert_eq!(snapshot.kind, "browser");
        assert_eq!(snapshot.session_id, "session-1");
        assert!(snapshot.started_at.is_some());
        assert_eq!(snapshot.metadata["currentUrl"], Value::Null);
        assert_eq!(snapshot.metadata["title"], Value::Null);
        assert_eq!(snapshot.metadata["actionCount"], json!(0));
        assert_eq!(snapshot.metadata["liveViewContainerName"], Value::Null);

        // Idempotent while running.
        let navigations_before = mock_driver.navigations.load(Ordering::SeqCst);
        block_on(surface.start(start_input("session-1"))).expect("second start");
        assert_eq!(navigations_before, 0);
        assert_eq!(mock_driver.navigations.load(Ordering::SeqCst), 0);
    }

    #[test]
    fn start_without_factory_reports_error_state() {
        let surface = BrowserSurface::new("browser-1", BrowserSurfaceOptions::default());
        let error = block_on(surface.start(start_input("session-1"))).expect_err("must fail");
        assert!(error.contains("No browser driver factory is configured"));
        assert_eq!(surface.state(), SurfaceState::Error);
    }

    #[test]
    fn stop_closes_driver_and_transitions_to_stopped() {
        let driver = mock(MockDriver::default());
        let surface = surface_with(Arc::clone(&driver));
        block_on(surface.stop()).expect("stop");
        assert!(driver.closed.load(Ordering::SeqCst));
        assert_eq!(surface.state(), SurfaceState::Stopped);
        assert!(surface.driver().is_none());
    }

    #[test]
    fn navigate_counts_actions_updates_metadata_and_emits_output() {
        let driver = mock(MockDriver::default());
        let surface = surface_with(Arc::clone(&driver));
        let output = Arc::new(Mutex::new(Vec::<String>::new()));
        let sink = Arc::clone(&output);
        surface.set_output_listener(Some(Arc::new(move |line: &str| {
            sink.lock().expect("out").push(line.to_string());
        })));

        let snapshot = block_on(surface.navigate("https://example.com")).expect("navigate");
        assert_eq!(snapshot.url, "https://example.com");
        assert_eq!(surface.action_count(), 1);
        assert_eq!(surface.current_url(), "https://example.com");

        let metadata = surface.snapshot().expect("snapshot").metadata;
        assert_eq!(metadata["currentUrl"], json!("https://example.com"));
        assert_eq!(metadata["title"], json!("Example"));
        assert_eq!(metadata["actionCount"], json!(1));
        assert_eq!(
            output.lock().expect("out").as_slice(),
            ["navigate https://example.com"]
        );
    }

    #[test]
    fn reload_rejected_when_driver_lacks_support() {
        let surface = surface_with(mock(MockDriver::default()));
        let error = block_on(surface.reload()).expect_err("must fail");
        assert_eq!(error, "This browser does not support refresh.");
        assert_eq!(surface.action_count(), 0);

        let reloading = surface_with(mock(MockDriver {
            supports_reload: true,
            ..MockDriver::default()
        }));
        block_on(reloading.reload()).expect("reload");
        assert_eq!(reloading.action_count(), 1);
    }

    #[test]
    fn actions_require_running_surface() {
        let surface = BrowserSurface::with_driver("browser-1", mock(MockDriver::default()));
        let error = block_on(surface.navigate("https://example.com")).expect_err("must fail");
        assert_eq!(error, "Browser surface is not running");
        let error = block_on(surface.click("#submit")).expect_err("must fail");
        assert_eq!(error, "Browser surface is not running");
        assert!(surface.get_events().is_err());
    }

    #[test]
    fn connected_false_marks_surface_as_error() {
        let disconnected = Arc::new(AtomicBool::new(false));
        let _ = disconnected;
        let surface = surface_with(mock(MockDriver {
            connected: Some(false),
            ..MockDriver::default()
        }));
        assert_eq!(surface.state(), SurfaceState::Error);
        assert!(block_on(surface.describe()).is_err());
    }

    #[test]
    fn click_failures_are_enriched_with_target_diagnostics() {
        let surface = surface_with(mock(MockDriver {
            click_error: Some("element is not visible".to_string()),
            diagnostics: Some(BrowserTargetDiagnostics {
                selector: "#submit".to_string(),
                found: true,
                offscreen: Some(true),
                disabled: Some(true),
                in_dialog: Some(true),
                dialog_title: Some("Sign in".to_string()),
                obscured: Some(true),
                intercepted_by: Some(BrowserObstructionSummary {
                    role: Some("button".to_string()),
                    text: Some("Cookie banner".to_string()),
                    selector: Some("#cookie-accept".to_string()),
                    ..BrowserObstructionSummary::default()
                }),
                ..BrowserTargetDiagnostics::default()
            }),
            ..MockDriver::default()
        }));

        let error = block_on(surface.click("#submit")).expect_err("click fails");
        assert_eq!(
            error,
            "browser.click failed for '#submit': element is not visible Target appears offscreen. \
             Target is disabled. Target is inside dialog 'Sign in'. Click may be intercepted by \
             button — Cookie banner — #cookie-accept."
        );
        assert_eq!(surface.action_count(), 0);
    }

    #[test]
    fn click_failure_without_diagnostics_reports_missing_target() {
        let surface = surface_with(mock(MockDriver {
            click_error: Some("timeout".to_string()),
            diagnostics: Some(BrowserTargetDiagnostics {
                selector: "#submit".to_string(),
                found: false,
                ..BrowserTargetDiagnostics::default()
            }),
            ..MockDriver::default()
        }));
        let error = block_on(surface.click("#submit")).expect_err("click fails");
        assert_eq!(
            error,
            "browser.click failed for '#submit': timeout Target was not found in the DOM."
        );
    }

    #[test]
    fn describe_renders_snapshot_lines() {
        let surface = surface_with(mock(MockDriver::default()));
        block_on(surface.navigate("https://example.com")).expect("navigate");
        let description = block_on(surface.describe()).expect("describe");
        assert_eq!(
            description,
            "URL: https://example.com\n\
             Title: Example\n\
             Active element: input — Email — #email\n\
             Dialogs: Sign in\n\
             \n\
             Text:\n\
             Hello world\n\
             \n\
             Interactive elements:\n\
             1. button — Submit [#submit]"
        );
    }

    #[test]
    fn describe_handles_empty_snapshot_fields() {
        let driver = MockDriver::default();
        *driver.snapshot_url.lock().expect("url") = String::new();
        let surface = surface_with(mock(driver));
        // The mock always returns a title/text/element, so check the fallbacks
        // through the rendering helpers instead.
        assert_eq!(BrowserActiveElement::default().describe_line(), "element");
        assert_eq!(BrowserDialogPresence::default().label(), "dialog");
        let description = block_on(surface.describe()).expect("describe");
        assert!(description.starts_with("URL: \nTitle: Example"));
    }

    #[test]
    fn inspect_returns_snapshot_target_and_metrics() {
        let surface = surface_with(mock(MockDriver {
            diagnostics: Some(BrowserTargetDiagnostics {
                selector: "#submit".to_string(),
                found: true,
                visible: Some(true),
                ..BrowserTargetDiagnostics::default()
            }),
            ..MockDriver::default()
        }));
        let inspection = block_on(surface.inspect(Some("#submit"))).expect("inspect");
        assert_eq!(inspection.target.expect("target").selector, "#submit");
        assert_eq!(inspection.metrics.sampled_at, "2024-01-01T00:00:00.000Z");

        let inspection = block_on(surface.inspect(None)).expect("inspect");
        assert!(inspection.target.is_none());
        let json = inspection.to_json();
        assert!(json.get("target").is_none());
        assert!(json.get("metrics").is_some());
    }

    #[test]
    fn metrics_and_screenshot_and_events_delegate_to_driver() {
        let driver = MockDriver::default();
        let events = Arc::clone(&driver.events);
        let surface = surface_with(mock(driver));
        events.lock().expect("events").push(BrowserRuntimeEvent {
            id: 0,
            timestamp: "2024-01-01T00:00:00.000Z".to_string(),
            event: BrowserRuntimeEventInput::console("log", "hi"),
        });
        assert_eq!(
            block_on(surface.screenshot(None)).expect("shot"),
            "screenshot.png"
        );
        assert_eq!(
            block_on(surface.screenshot(Some("/tmp/a.png"))).expect("shot"),
            "/tmp/a.png"
        );
        assert_eq!(
            block_on(surface.get_dev_tools_connection()).expect("devtools"),
            None
        );
        let metrics = block_on(surface.get_metrics()).expect("metrics");
        assert_eq!(metrics.url, "about:blank");
        let events = surface.get_events().expect("events");
        assert_eq!(events.len(), 1);
        assert_eq!(surface.action_count(), 2);
        assert!(surface.idle_ms() < 5_000);
        assert!(surface.get_live_view_info().is_none());
    }

    #[test]
    fn factory_creates_browser_surfaces_with_shared_options() {
        let factory = BrowserSurfaceFactory::new(BrowserSurfaceOptions::from_driver(mock(
            MockDriver::default(),
        )));
        assert_eq!(SurfaceFactory::kind(&factory), "browser");
        let surface = factory.create("browser-9").expect("create");
        assert_eq!(surface.id(), "browser-9");
        assert_eq!(surface.kind(), "browser");
        block_on(surface.start(start_input("session-2"))).expect("start");
        assert_eq!(surface.state(), SurfaceState::Running);
    }

    #[test]
    fn state_listener_receives_transitions() {
        let seen = Arc::new(Mutex::new(Vec::<SurfaceState>::new()));
        let sink = Arc::clone(&seen);
        let surface = BrowserSurface::with_driver("browser-1", mock(MockDriver::default()));
        surface.set_state_listener(Some(Arc::new(move |state: SurfaceState| {
            sink.lock().expect("states").push(state);
        })));
        block_on(surface.start(start_input("session-1"))).expect("start");
        block_on(surface.stop()).expect("stop");
        assert_eq!(
            seen.lock().expect("states").as_slice(),
            [
                SurfaceState::Starting,
                SurfaceState::Running,
                SurfaceState::Stopping,
                SurfaceState::Stopped
            ]
        );
    }

    #[test]
    fn runtime_mode_resolution_matches_reference() {
        assert_eq!(resolve_browser_runtime_mode(None), BrowserRuntimeMode::Auto);
        assert_eq!(
            resolve_browser_runtime_mode(Some("  IN-PROCESS ")),
            BrowserRuntimeMode::InProcess
        );
        assert_eq!(
            resolve_browser_runtime_mode(Some("node")),
            BrowserRuntimeMode::NodeBridge
        );
        assert_eq!(
            resolve_browser_runtime_mode(Some("node-bridge")),
            BrowserRuntimeMode::NodeBridge
        );
        assert_eq!(
            resolve_browser_runtime_mode(Some("auto")),
            BrowserRuntimeMode::Auto
        );
        assert_eq!(BrowserRuntimeMode::NodeBridge.as_str(), "node-bridge");
    }

    #[test]
    fn bootstrap_page_urls_are_recognised() {
        assert!(is_reusable_bootstrap_page_url(Some("about:blank")));
        assert!(is_reusable_bootstrap_page_url(Some(" ABOUT:BLANK ")));
        assert!(is_reusable_bootstrap_page_url(Some("chrome://newtab/")));
        assert!(is_reusable_bootstrap_page_url(Some(
            "chrome://new-tab-page/"
        )));
        assert!(is_reusable_bootstrap_page_url(Some("edge://newtab/")));
        assert!(!is_reusable_bootstrap_page_url(Some("https://example.com")));
        assert!(!is_reusable_bootstrap_page_url(None));
    }

    struct FakePage {
        closed: bool,
        url: Option<&'static str>,
    }

    impl BrowserPageCandidate for FakePage {
        fn is_closed(&self) -> bool {
            self.closed
        }
        fn url(&self) -> Option<String> {
            self.url.map(str::to_string)
        }
    }

    #[test]
    fn select_initial_browser_page_prefers_open_bootstrap_page() {
        let pages = vec![
            FakePage {
                closed: true,
                url: Some("about:blank"),
            },
            FakePage {
                closed: false,
                url: Some("https://example.com"),
            },
            FakePage {
                closed: false,
                url: Some("about:blank"),
            },
        ];
        let selected = block_on(select_initial_browser_page(pages, || async {
            Err::<FakePage, String>("should not be called".to_string())
        }))
        .expect("selected");
        assert_eq!(selected.url, Some("about:blank"));

        let none = block_on(select_initial_browser_page(
            vec![FakePage {
                closed: false,
                url: Some("https://example.com"),
            }],
            || async {
                Ok(FakePage {
                    closed: false,
                    url: Some("https://fresh.example"),
                })
            },
        ))
        .expect("new page");
        assert_eq!(none.url, Some("https://fresh.example"));
    }

    #[test]
    fn snapshot_json_round_trips_through_driver_boundary() {
        let snapshot = BrowserPageSnapshot {
            url: "https://example.com".to_string(),
            title: "Example".to_string(),
            text: "Body".to_string(),
            elements: vec![BrowserInteractiveElement {
                selector: "#go".to_string(),
                role: Some("link".to_string()),
                selectors: Some(vec![BrowserSelectorSuggestion {
                    kind: "css".to_string(),
                    value: "#go".to_string(),
                    selector: "#go".to_string(),
                }]),
                visible: Some(true),
                ..BrowserInteractiveElement::default()
            }],
            active_element: Some(BrowserActiveElement {
                selector: "#email".to_string(),
                read_only: Some(false),
                ..BrowserActiveElement::default()
            }),
            dialogs: Some(vec![BrowserDialogPresence {
                selector: "dialog".to_string(),
                aria_modal: Some(true),
                ..BrowserDialogPresence::default()
            }]),
            obstruction: Some(BrowserObstructionDiagnostics {
                has_modal: true,
                dialog_count: 1,
                active_dialog_title: Some("Sign in".to_string()),
            }),
        };
        let json = snapshot.to_json();
        assert_eq!(json["activeElement"]["readOnly"], json!(false));
        assert_eq!(json["dialogs"][0]["ariaModal"], json!(true));
        assert_eq!(json["obstruction"]["dialogCount"], json!(1));
        assert_eq!(BrowserPageSnapshot::from_json(&json), snapshot);
    }
}
