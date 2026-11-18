//! Native port of `packages/gateway/src/services/screen-share-control.ts`.
//!
//! A *viewer control seat* lets one approved viewer drive the desktop that the
//! host is already sharing. Every seat is bound to a computer-control lease, so
//! it dies with the lease, the share, or the node.
//!
//! # What is ported
//!
//! The complete pure authorization / state / lifetime machine:
//!
//! * [`ScreenShareControlCoordinator::start`] — grant a seat (share guard, node
//!   capability guard, single-live-seat guard, capture verification, desktop
//!   geometry verification, atomic grant-or-teardown).
//! * [`ScreenShareControlCoordinator::act`] — validate and forward one input
//!   action under the re-entrancy guard.
//! * [`ScreenShareControlCoordinator::read_clipboard`] /
//!   [`ScreenShareControlCoordinator::write_clipboard`].
//! * [`ScreenShareControlCoordinator::stop`], `stop_for_viewer`,
//!   `stop_for_share`, `stop_for_node`, `node_disconnected` — all teardown
//!   paths, including the swallowed-proxy-error semantics of `stopEntry`.
//! * [`ScreenShareControlCoordinator::cancel`] — cancellation tombstones with
//!   TTL pruning and the bounded tombstone map.
//! * The full error surface, with the reference's exact messages.
//!
//! # The transport seam (NOT ported — deliberately unimplemented)
//!
//! The reference reaches the host desktop through two facilities that have no
//! native equivalent, so they are *injected traits* here rather than faked:
//!
//! * [`ToolProxy`] — the reference's `WsControlPlane.proxyToolOp`, which
//!   forwards a tool op to the host node's agent over the websocket control
//!   plane. Native code has no control-plane proxy, and the desktop tools
//!   (`computer.share.capture`, `computer.session`, `computer.geometry`,
//!   `computer.act`, `computer.clipboard.*`) are implemented by a browser /
//!   display agent that does not exist natively.
//! * [`NodeDirectory`] — the reference's `WsControlPlane.getNodeRegistry()`
//!   lookup of the host node's role / lifecycle / platform / tools.
//! * [`ShareDirectory`] — the reference's `ScreenShareService.session()` and
//!   `getSessionsForNode()`. The native `services::screen_share::
//!   ScreenShareService` can look up a session by id but exposes **no**
//!   enumeration accessor, so the "this node has no other live share" guard
//!   cannot be answered from it. See the note on `ShareDirectory`.
//!
//! [`UnimplementedTransport`] is the honest default implementation: it denies
//! every request with [`TRANSPORT_UNIMPLEMENTED`] (and hides every node, which
//! denies with [`DESKTOP_UNSUPPORTED`]). Nothing here pretends to drive a
//! screen. Wiring a real transport is a separate, unstarted piece of work.
//!
//! # Clock injection
//!
//! The reference's computer-control leases read an injected clock, but the
//! cancellation map reads `Date.now()` directly. Both are driven by the single
//! injected [`Clock`] here, so tests never touch real time. This is an
//! injection change only; the arithmetic and comparisons are identical.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, MutexGuard};

use serde_json::{Map, Value, json};

use crate::services::computer_control::{ComputerControlSession, ComputerControlSessionService};
use crate::time::Clock;

// ---------------------------------------------------------------------------
// Error surface. Messages are byte-identical to the reference so callers that
// match on text keep working.
// ---------------------------------------------------------------------------

/// Returned when the share is not in a state that lets *this* viewer control it,
/// and again whenever a live seat is re-checked against the share.
pub const SHARE_REJECTED: &str = "This viewer cannot control the current screen share.";
/// Returned when the host node is not a ready Windows desktop with the tools the
/// control flow needs.
pub const DESKTOP_UNSUPPORTED: &str = "The desktop does not support approved screen control.";
/// Fallback when the transport reports failure without a message.
pub const REJECTED: &str = "The desktop rejected the control request.";
/// Returned when a seat is no longer the current seat for its share.
pub const ENDED: &str = "Screen control has ended.";
/// Returned when the captured frame is missing or has non-positive dimensions.
pub const CAPTURE_UNVERIFIABLE: &str = "The host cannot verify the captured monitor.";
/// Returned for a missing, empty, non-string or over-long request id.
pub const REQUEST_ID_REQUIRED: &str = "A control request ID is required.";
/// Returned when a cancelled request id is replayed.
pub const CANCELLED: &str = "Screen control was cancelled.";
/// Returned when a seat already exists for the share.
pub const ALREADY_ACTIVE: &str = "Screen control is already active or awaiting approval.";
/// Returned when the desktop does not report exactly one usable monitor.
pub const SINGLE_MONITOR_REQUIRED: &str = "Control requires a verified single-monitor desktop.";
/// Returned when the capture does not match the desktop geometry.
pub const GEOMETRY_MISMATCH: &str = "The captured monitor does not match the desktop geometry.";
/// Returned when the caller does not hold the current active seat.
pub const NOT_ACTIVE: &str = "Screen control is not active for this viewer.";
/// Returned when an action is already in flight for the seat.
pub const BUSY: &str = "A screen-control action is already in progress.";
/// Returned for coordinates outside the normalized 0..1 frame.
pub const POINTER_OUT_OF_RANGE: &str = "Pointer coordinates must be within the captured image.";
/// Returned for a button that is not left/middle/right.
pub const INVALID_BUTTON: &str = "Invalid mouse button.";
/// Returned for a missing or out-of-range key combination.
pub const INVALID_COMBO: &str = "Invalid key combination.";
/// Returned for empty or over-long typed text.
pub const INVALID_TEXT: &str = "Invalid typed text.";
/// Returned for a scroll direction that is not up/down/left/right.
pub const INVALID_DIRECTION: &str = "Invalid scroll direction.";
/// Returned for a scroll amount that is not an integer in 1..=20.
pub const INVALID_AMOUNT: &str = "Invalid scroll amount.";
/// Returned for an unknown action.
pub const INVALID_ACTION: &str = "Invalid screen-control action.";
/// Returned when the clipboard read reply has no usable `data.text`.
pub const INVALID_CLIPBOARD_RESPONSE: &str = "Invalid remote clipboard response.";
/// Returned for clipboard text that is too long or contains a NUL.
pub const INVALID_CLIPBOARD_TEXT: &str = "Invalid clipboard text.";
/// Returned when the cancellation tombstone map is full.
pub const TOO_MANY_CANCELLED: &str = "Too many cancelled control requests.";
/// Returned by `stop_for_node` when another chat owns the node's lease.
pub const OTHER_CHAT: &str = "The computer is controlled by another chat.";
/// The honest transport seam: no native screen-control transport exists.
pub const TRANSPORT_UNIMPLEMENTED: &str =
    "Screen-share control transport is not implemented natively.";

/// Maximum accepted request id length, in UTF-16 code units (JS `.length`).
pub const MAX_REQUEST_ID: usize = 256;
/// Cancellation tombstone lifetime.
pub const CANCELLED_TTL_MS: i64 = 5 * 60_000;
/// Maximum number of cancellation tombstones retained.
pub const MAX_CANCELLED: usize = 1024;
/// Maximum clipboard payload, in UTF-16 code units.
pub const MAX_CLIPBOARD: usize = 262_143;
/// Maximum typed-text length, in UTF-16 code units.
pub const MAX_TEXT: usize = 2048;
/// Maximum key-combination length, in UTF-16 code units.
pub const MAX_COMBO: usize = 100;
/// Maximum scroll amount.
pub const MAX_SCROLL: f64 = 20.0;
/// Maximum accepted monitor dimension.
pub const MAX_DIMENSION: f64 = 16_384.0;
/// Allowed relative error between the captured and reported aspect ratios.
pub const ASPECT_TOLERANCE: f64 = 0.01;
/// Timeout for ordinary desktop tool ops.
pub const DEFAULT_TIMEOUT_MS: i64 = 5_000;
/// Timeout for the `computer.session` start/stop handshake.
pub const START_TIMEOUT_MS: i64 = 180_000;

/// Tools the host desktop must advertise before it may be controlled.
pub const REQUIRED_TOOLS: [&str; 6] = [
    "computer.session",
    "computer.act",
    "computer.geometry",
    "computer.share.capture",
    "computer.clipboard.read",
    "computer.clipboard.write",
];

// ---------------------------------------------------------------------------
// Injected views of the world.
// ---------------------------------------------------------------------------

/// The host node facts read out of the node registry.
#[derive(Clone, Debug, Default)]
pub struct NodeFacts {
    pub id: String,
    pub role: String,
    pub lifecycle: String,
    pub platform: String,
    pub tools: Vec<String>,
}

impl NodeFacts {
    /// The reference's capability gate: a ready Windows desktop advertising every
    /// tool the control flow uses. Anything else must be refused.
    pub fn supports_screen_control(&self) -> bool {
        self.role == "desktop"
            && self.lifecycle == "ready"
            && self.platform == "windows"
            && REQUIRED_TOOLS
                .iter()
                .all(|required| self.tools.iter().any(|tool| tool == required))
    }
}

/// The fields of a shared screen session that the control machine consults.
///
/// Absent values are represented by empty strings, which is equivalent to the
/// reference's `undefined` for every comparison performed here (each one is
/// against a known non-empty expected value, or is a truthiness test).
#[derive(Clone, Debug, Default)]
pub struct ShareView {
    pub id: String,
    pub status: String,
    pub pending_approval: Value,
    pub chat_id: String,
    pub control_owner: String,
    pub node_id: String,
    pub host_device_id: String,
    pub remote_input: bool,
    pub viewers: Vec<String>,
}

impl ShareView {
    /// Adapt the native `ScreenShareService` session JSON into a [`ShareView`].
    ///
    /// Returns `None` when the value is not an object with a string `id`, which
    /// the caller should treat as "no such share" (and therefore as a denial).
    pub fn from_json(value: &Value) -> Option<Self> {
        let object = value.as_object()?;
        let id = object.get("id")?.as_str()?.to_string();
        Some(Self {
            id,
            status: string_field(object, "status"),
            pending_approval: object
                .get("pendingApproval")
                .cloned()
                .unwrap_or(Value::Null),
            chat_id: string_field(object, "chatId"),
            control_owner: string_field(object, "controlOwner"),
            node_id: string_field(object, "nodeId"),
            host_device_id: string_field(object, "hostDeviceId"),
            remote_input: object
                .get("capabilities")
                .and_then(|capabilities| capabilities.get("remoteInput"))
                .and_then(Value::as_bool)
                .unwrap_or(false),
            viewers: object
                .get("viewers")
                .and_then(Value::as_array)
                .map(|viewers| {
                    viewers
                        .iter()
                        .filter_map(|viewer| {
                            viewer
                                .get("deviceId")
                                .and_then(Value::as_str)
                                .map(str::to_string)
                        })
                        .collect()
                })
                .unwrap_or_default(),
        })
    }
}

fn string_field(object: &Map<String, Value>, key: &str) -> String {
    object
        .get(key)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

/// The verified desktop geometry. `raw` is forwarded verbatim as
/// `expectedGeometry`, so fields the desktop sent beyond the four validated
/// numbers survive the round trip exactly as in the reference.
#[derive(Clone, Debug, PartialEq)]
pub struct Geometry {
    pub origin_x: f64,
    pub origin_y: f64,
    pub width: f64,
    pub height: f64,
    pub raw: Value,
}

/// The grant handed back to the viewer.
#[derive(Clone, Debug, PartialEq)]
pub struct StartGrant {
    pub control_id: String,
    pub expires_at: String,
}

// ---------------------------------------------------------------------------
// Injected seams. No native transport exists for any of these.
// ---------------------------------------------------------------------------

/// Forward one desktop tool op to the host node (reference:
/// `WsControlPlane.proxyToolOp`).
///
/// A transport that cannot reach the desktop must return `Err`, never a
/// fabricated `Ok`. The default implementation is [`UnimplementedTransport`].
pub trait ToolProxy: Send + Sync {
    fn proxy_tool_op(
        &self,
        node_id: &str,
        tool: &str,
        args: &Map<String, Value>,
        chat_id: &str,
        timeout_ms: i64,
    ) -> Result<Value, String>;
}

/// Look up host node facts (reference: `WsControlPlane.getNodeRegistry()`).
pub trait NodeDirectory: Send + Sync {
    fn node(&self, node_id: &str) -> Option<NodeFacts>;
}

/// Look up shared screen sessions (reference: `ScreenShareService.session()` and
/// `ScreenShareService.getSessionsForNode()`).
///
/// `sessions_for_node` is a seam rather than a call into the native
/// `ScreenShareService` because that service keeps its sessions private and
/// exposes no enumeration accessor, so the reference's "this node must not have
/// another live share" guard cannot currently be answered from it. An adapter
/// with access to the store must implement it; returning an empty vector would
/// silently *widen* authority, so an adapter that cannot answer must instead
/// fail the request (see [`UnimplementedTransport`]).
pub trait ShareDirectory: Send + Sync {
    fn session(&self, share_id: &str) -> Option<ShareView>;
    fn sessions_for_node(&self, node_id: &str) -> Vec<ShareView>;
}

/// The honest default: there is no native screen-control transport.
///
/// Every tool op fails with [`TRANSPORT_UNIMPLEMENTED`] and every node lookup
/// misses, so every grant attempt is denied (`TRANSPORT_UNIMPLEMENTED` for the
/// first capture, `DESKTOP_UNSUPPORTED` for the node check). No state is ever
/// granted and no desktop is ever contacted.
#[derive(Clone, Copy, Debug, Default)]
pub struct UnimplementedTransport;

impl ToolProxy for UnimplementedTransport {
    fn proxy_tool_op(
        &self,
        _node_id: &str,
        _tool: &str,
        _args: &Map<String, Value>,
        _chat_id: &str,
        _timeout_ms: i64,
    ) -> Result<Value, String> {
        Err(TRANSPORT_UNIMPLEMENTED.to_string())
    }
}

impl NodeDirectory for UnimplementedTransport {
    fn node(&self, _node_id: &str) -> Option<NodeFacts> {
        None
    }
}

impl ShareDirectory for UnimplementedTransport {
    fn session(&self, _share_id: &str) -> Option<ShareView> {
        None
    }

    fn sessions_for_node(&self, _node_id: &str) -> Vec<ShareView> {
        // An empty answer here would satisfy the "no other live share" guard,
        // i.e. widen authority, so this adapter denies by reporting a phantom
        // sibling that belongs to no share. Combined with `session() == None`
        // the guard is never reached; this keeps the denial honest even if a
        // future adapter delegates only `session()`.
        vec![ShareView {
            id: "<unimplemented>".to_string(),
            ..ShareView::default()
        }]
    }
}

// ---------------------------------------------------------------------------
// Small JS-semantics helpers. The reference is TypeScript; these keep the
// comparisons byte-for-byte equivalent.
// ---------------------------------------------------------------------------

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

/// JS truthiness for JSON values (`undefined` is modelled as `Value::Null`).
fn js_truthy(value: &Value) -> bool {
    match value {
        Value::Null => false,
        Value::Bool(flag) => *flag,
        Value::Number(number) => number.as_f64().is_some_and(|number| number != 0.0),
        Value::String(text) => !text.is_empty(),
        Value::Array(_) | Value::Object(_) => true,
    }
}

/// `String(value)` for the non-nullish values that can reach an error message.
fn js_display(value: &Value) -> String {
    match value {
        Value::Null => "null".to_string(),
        Value::Bool(flag) => flag.to_string(),
        Value::Number(number) => number.to_string(),
        Value::String(text) => text.clone(),
        Value::Array(items) => items
            .iter()
            .map(|item| match item {
                Value::Null | Value::Array(_) | Value::Object(_) => String::new(),
                other => js_display(other),
            })
            .collect::<Vec<_>>()
            .join(","),
        Value::Object(_) => "[object Object]".to_string(),
    }
}

/// JS `string.length`, i.e. UTF-16 code units.
fn js_len(text: &str) -> usize {
    text.encode_utf16().count()
}

/// JS `Number.isInteger`.
fn is_integer(value: f64) -> bool {
    value.is_finite() && value.fract() == 0.0
}

/// `Math.round`: halves go towards +∞ (Rust's `round` goes away from zero).
/// Every caller passes a non-negative argument, but the difference is kept
/// explicit so it stays correct if that ever changes.
fn js_round(value: f64) -> f64 {
    (value + 0.5).floor()
}

/// JS numbers have no integer/float distinction, so `JSON.stringify` renders an
/// integral value as `800`, never `800.0`. Desktop pixel coordinates must keep
/// that shape because the desktop transport parses them back out.
fn js_number(value: f64) -> Value {
    if is_integer(value) && value.abs() <= 9_007_199_254_740_992.0 {
        json!(value as i64)
    } else {
        json!(value)
    }
}

fn positive_number(data: &Value, key: &str) -> Option<f64> {
    let value = data.get(key)?.as_f64()?;
    if value.is_finite() && value > 0.0 {
        Some(value)
    } else {
        None
    }
}

fn integer_field(data: &Value, key: &str) -> Option<f64> {
    let value = data.get(key)?.as_f64()?;
    if is_integer(value) { Some(value) } else { None }
}

/// Validate the desktop geometry reply. Rejects a missing/multi-monitor desktop,
/// non-integer origins or sizes, and zero/oversized dimensions.
fn parse_geometry(data: Option<&Value>) -> Option<Geometry> {
    let data = data?;
    if data.get("monitorCount")?.as_f64()? != 1.0 {
        return None;
    }
    let origin_x = integer_field(data, "originX")?;
    let origin_y = integer_field(data, "originY")?;
    let width = integer_field(data, "width")?;
    let height = integer_field(data, "height")?;
    if !(width > 0.0 && width <= MAX_DIMENSION) || !(height > 0.0 && height <= MAX_DIMENSION) {
        return None;
    }
    Some(Geometry {
        origin_x,
        origin_y,
        width,
        height,
        raw: data.clone(),
    })
}

/// The reference's cancellation key: `JSON.stringify([shareId, chatId, viewerId,
/// requestId])`.
fn request_key(share_id: &str, chat_id: &str, viewer_id: &str, request_id: &str) -> String {
    Value::Array(vec![
        Value::String(share_id.to_string()),
        Value::String(chat_id.to_string()),
        Value::String(viewer_id.to_string()),
        Value::String(request_id.to_string()),
    ])
    .to_string()
}

/// A live control seat, bound to one computer-control lease.
#[derive(Clone, Debug)]
struct Entry {
    share_id: String,
    chat_id: String,
    viewer_id: String,
    request_id: String,
    node_id: String,
    control_id: String,
    geometry: Option<Geometry>,
    active: bool,
    busy: bool,
    /// Distinguishes this seat from a later seat for the same share, preserving
    /// the reference's identity comparison of the stored entry object.
    generation: u64,
}

// ---------------------------------------------------------------------------
// Coordinator.
// ---------------------------------------------------------------------------

/// Port of the reference `ScreenShareControl` service.
pub struct ScreenShareControlCoordinator<P, N, S>
where
    P: ToolProxy,
    N: NodeDirectory,
    S: ShareDirectory,
{
    shares: S,
    nodes: N,
    proxy: P,
    /// The same lease store the routes use: a seat is only valid while the
    /// computer-control lease it was granted from is live and still owned.
    sessions: Mutex<ComputerControlSessionService>,
    clock: Clock,
    entries: Mutex<HashMap<String, Entry>>,
    cancelled: Mutex<HashMap<String, i64>>,
    generation: AtomicU64,
}

impl<P, N, S> ScreenShareControlCoordinator<P, N, S>
where
    P: ToolProxy,
    N: NodeDirectory,
    S: ShareDirectory,
{
    /// Build a coordinator. `sessions` must be the shared lease store, and
    /// `clock` the same clock it was built with.
    pub fn new(
        shares: S,
        sessions: ComputerControlSessionService,
        proxy: P,
        nodes: N,
        clock: Clock,
    ) -> Self {
        Self {
            shares,
            nodes,
            proxy,
            sessions: Mutex::new(sessions),
            clock,
            entries: Mutex::new(HashMap::new()),
            cancelled: Mutex::new(HashMap::new()),
            generation: AtomicU64::new(1),
        }
    }

    fn now(&self) -> i64 {
        (self.clock)()
    }

    // -- transport ---------------------------------------------------------

    /// Call a tool on the seat's node, stamping `shareSessionId`.
    fn proxy(
        &self,
        entry: &Entry,
        tool: &str,
        mut args: Map<String, Value>,
        timeout_ms: i64,
    ) -> Result<Value, String> {
        args.insert(
            "shareSessionId".to_string(),
            Value::String(entry.share_id.clone()),
        );
        self.remote(&entry.node_id, tool, args, &entry.chat_id, timeout_ms)
    }

    /// Call a tool and require `ok === true`, surfacing the desktop's message
    /// otherwise. A transport-level failure propagates unchanged.
    fn remote(
        &self,
        node_id: &str,
        tool: &str,
        args: Map<String, Value>,
        chat_id: &str,
        timeout_ms: i64,
    ) -> Result<Value, String> {
        let result = self
            .proxy
            .proxy_tool_op(node_id, tool, &args, chat_id, timeout_ms)?;
        if result.get("ok") == Some(&Value::Bool(true)) {
            return Ok(result);
        }
        Err(match result.get("message") {
            Some(Value::Null) | None => REJECTED.to_string(),
            Some(message) => js_display(message),
        })
    }

    // -- authority ---------------------------------------------------------

    /// The share guard. Every clause is a denial condition in the reference.
    fn require_share(
        &self,
        share_id: &str,
        chat_id: &str,
        viewer_id: &str,
    ) -> Result<ShareView, String> {
        let share = self
            .shares
            .session(share_id)
            .ok_or_else(|| SHARE_REJECTED.to_string())?;
        let node_id = share.node_id.clone();
        // `!nodeId || ...every(...)`: an absent node id short-circuits to "only
        // share" and is then rejected outright by the check below.
        let only_share = if node_id.is_empty() {
            true
        } else {
            self.shares
                .sessions_for_node(&node_id)
                .iter()
                .all(|other| other.id == share_id)
        };
        let allowed = share.status == "sharing"
            && !js_truthy(&share.pending_approval)
            && share.chat_id == chat_id
            && share.control_owner == "user"
            && !node_id.is_empty()
            && share.host_device_id == node_id
            && share.remote_input
            && share
                .viewers
                .iter()
                .any(|viewer| viewer.as_str() == viewer_id)
            && only_share;
        if !allowed {
            return Err(SHARE_REJECTED.to_string());
        }
        let node = self
            .nodes
            .node(&node_id)
            .ok_or_else(|| DESKTOP_UNSUPPORTED.to_string())?;
        if !node.supports_screen_control() {
            return Err(DESKTOP_UNSUPPORTED.to_string());
        }
        Ok(share)
    }

    fn is_current(&self, entry: &Entry) -> bool {
        lock(&self.entries)
            .get(&entry.share_id)
            .is_some_and(|stored| stored.generation == entry.generation)
    }

    /// Re-check that the seat is still the live seat, that its lease is still
    /// owned, and that the share still permits control.
    fn current(&self, entry: &Entry) -> Result<(), String> {
        if !self.is_current(entry) {
            return Err(ENDED.to_string());
        }
        {
            let mut sessions = lock(&self.sessions);
            sessions.require_owned(&entry.control_id, &entry.chat_id)?;
        }
        self.require_share(&entry.share_id, &entry.chat_id, &entry.viewer_id)?;
        Ok(())
    }

    /// The caller must hold the active seat for this share.
    fn owned(
        &self,
        share_id: &str,
        chat_id: &str,
        viewer_id: &str,
        control_id: &str,
    ) -> Result<Entry, String> {
        let entry = {
            let entries = lock(&self.entries);
            match entries.get(share_id) {
                Some(entry)
                    if entry.chat_id == chat_id
                        && entry.viewer_id == viewer_id
                        && entry.control_id == control_id
                        && entry.active =>
                {
                    entry.clone()
                }
                _ => return Err(NOT_ACTIVE.to_string()),
            }
        };
        self.current(&entry)?;
        Ok(entry)
    }

    // -- re-entrancy guard -------------------------------------------------

    /// Claim the seat's in-flight flag atomically.
    fn begin(&self, entry: &Entry) -> Result<(), String> {
        let mut entries = lock(&self.entries);
        match entries.get_mut(&entry.share_id) {
            Some(stored) if stored.generation == entry.generation => {
                if stored.busy {
                    return Err(BUSY.to_string());
                }
                stored.busy = true;
                Ok(())
            }
            // The seat was torn down or replaced: refuse without touching the
            // transport.
            _ => Err(ENDED.to_string()),
        }
    }

    fn end(&self, entry: &Entry) {
        if let Some(stored) = lock(&self.entries).get_mut(&entry.share_id)
            && stored.generation == entry.generation
        {
            stored.busy = false;
        }
    }

    // -- capture -----------------------------------------------------------

    /// Force a fresh host capture and verify it is usable. Losing the capture is
    /// a control-ending condition for `run`.
    fn capture(&self, entry: &Entry) -> Result<(f64, f64), String> {
        let result = self.proxy(
            entry,
            "computer.share.capture",
            Map::new(),
            DEFAULT_TIMEOUT_MS,
        )?;
        self.current(entry)?;
        let data = result.get("data").unwrap_or(&Value::Null);
        let width =
            positive_number(data, "width").ok_or_else(|| CAPTURE_UNVERIFIABLE.to_string())?;
        let height =
            positive_number(data, "height").ok_or_else(|| CAPTURE_UNVERIFIABLE.to_string())?;
        Ok((width, height))
    }

    // -- teardown ----------------------------------------------------------

    /// Drop the seat and end its lease. Proxy errors are deliberately swallowed:
    /// teardown must complete locally even when the desktop is gone.
    fn stop_entry(&self, entry: &Entry) {
        {
            let mut entries = lock(&self.entries);
            if entries
                .get(&entry.share_id)
                .is_some_and(|stored| stored.generation == entry.generation)
            {
                entries.remove(&entry.share_id);
            }
        }
        {
            let mut sessions = lock(&self.sessions);
            sessions.stop(&entry.control_id);
        }
        let mut args = Map::new();
        args.insert("action".to_string(), json!("stop"));
        args.insert(
            "sessionId".to_string(),
            Value::String(entry.control_id.clone()),
        );
        let _ = self.remote(
            &entry.node_id,
            "computer.session",
            args,
            &entry.chat_id,
            DEFAULT_TIMEOUT_MS,
        );
    }

    // -- grant -------------------------------------------------------------

    /// Grant a control seat to `viewer_id`.
    pub fn start(
        &self,
        share_id: &str,
        chat_id: &str,
        viewer_id: &str,
        request_id: &str,
    ) -> Result<StartGrant, String> {
        if request_id.is_empty() || js_len(request_id) > MAX_REQUEST_ID {
            return Err(REQUEST_ID_REQUIRED.to_string());
        }
        self.prune_cancelled();
        let key = request_key(share_id, chat_id, viewer_id, request_id);
        if lock(&self.cancelled).contains_key(&key) {
            return Err(CANCELLED.to_string());
        }
        let share = self.require_share(share_id, chat_id, viewer_id)?;
        if lock(&self.entries).contains_key(share_id) {
            return Err(ALREADY_ACTIVE.to_string());
        }
        let node_id = share.node_id.clone();
        let session = {
            let mut sessions = lock(&self.sessions);
            sessions.start(chat_id, &node_id)?
        };
        let entry = Entry {
            share_id: share_id.to_string(),
            chat_id: chat_id.to_string(),
            viewer_id: viewer_id.to_string(),
            request_id: request_id.to_string(),
            node_id,
            control_id: session.id.clone(),
            geometry: None,
            active: false,
            busy: false,
            generation: self.generation.fetch_add(1, Ordering::SeqCst),
        };
        lock(&self.entries).insert(share_id.to_string(), entry.clone());
        match self.start_entry(&entry, &session) {
            Ok(grant) => Ok(grant),
            Err(error) => {
                // Granting is atomic: a half-established seat is torn down.
                self.stop_entry(&entry);
                Err(error)
            }
        }
    }

    fn start_entry(
        &self,
        entry: &Entry,
        session: &ComputerControlSession,
    ) -> Result<StartGrant, String> {
        self.capture(entry)?;
        let mut args = Map::new();
        args.insert("action".to_string(), json!("start"));
        args.insert("sessionId".to_string(), Value::String(session.id.clone()));
        args.insert(
            "expiresAt".to_string(),
            Value::String(session.expires_at.clone()),
        );
        self.proxy(entry, "computer.session", args, START_TIMEOUT_MS)?;
        self.current(entry)?;

        let mut geometry_args = Map::new();
        geometry_args.insert("sessionId".to_string(), Value::String(session.id.clone()));
        let result = self.proxy(
            entry,
            "computer.geometry",
            geometry_args,
            DEFAULT_TIMEOUT_MS,
        )?;
        self.current(entry)?;
        let geometry = parse_geometry(result.get("data"))
            .ok_or_else(|| SINGLE_MONITOR_REQUIRED.to_string())?;

        let (width, height) = self.capture(entry)?;
        if (width / height - geometry.width / geometry.height).abs() > ASPECT_TOLERANCE {
            return Err(GEOMETRY_MISMATCH.to_string());
        }

        if let Some(stored) = lock(&self.entries).get_mut(&entry.share_id)
            && stored.generation == entry.generation
        {
            stored.geometry = Some(geometry);
            stored.active = true;
        }
        Ok(StartGrant {
            control_id: session.id.clone(),
            expires_at: session.expires_at.clone(),
        })
    }

    // -- action runner -----------------------------------------------------

    /// Run one action against a verified capture. Any failure ends the seat.
    fn run<T>(
        &self,
        entry: &Entry,
        effect: impl FnOnce() -> Result<T, String>,
    ) -> Result<T, String> {
        self.begin(entry)?;
        let outcome = (|| -> Result<T, String> {
            self.capture(entry)?;
            self.current(entry)?;
            effect()
        })();
        if outcome.is_err() {
            // Losing the capture, the permission or the desktop ends the lease.
            self.stop_entry(entry);
        }
        self.end(entry);
        outcome
    }

    // -- input -------------------------------------------------------------

    /// Validate and forward one input action.
    ///
    /// Coordinates are normalized to the captured frame (`0.0..=1.0` on both
    /// axes) and converted to desktop pixels against the verified geometry.
    pub fn act(
        &self,
        share_id: &str,
        chat_id: &str,
        viewer_id: &str,
        control_id: &str,
        input: &Map<String, Value>,
    ) -> Result<(), String> {
        let entry = self.owned(share_id, chat_id, viewer_id, control_id)?;
        let geometry = entry
            .geometry
            .clone()
            .ok_or_else(|| NOT_ACTIVE.to_string())?;
        let action = input
            .get("action")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let mut args = Map::new();
        match action {
            "move" | "click" => {
                let x = input.get("x").and_then(Value::as_f64);
                let y = input.get("y").and_then(Value::as_f64);
                let (Some(x), Some(y)) = (x, y) else {
                    return Err(POINTER_OUT_OF_RANGE.to_string());
                };
                if !x.is_finite() || !y.is_finite() || x < 0.0 || x > 1.0 || y < 0.0 || y > 1.0 {
                    return Err(POINTER_OUT_OF_RANGE.to_string());
                }
                if action == "click"
                    && let Some(button) = input.get("button")
                {
                    // `!["left","middle","right"].includes(String(button))`
                    let valid = matches!(button.as_str(), Some("left" | "middle" | "right"));
                    if !valid {
                        return Err(INVALID_BUTTON.to_string());
                    }
                }
                args.insert("action".to_string(), json!(action));
                args.insert(
                    "x".to_string(),
                    js_number(geometry.origin_x + js_round(x * (geometry.width - 1.0))),
                );
                args.insert(
                    "y".to_string(),
                    js_number(geometry.origin_y + js_round(y * (geometry.height - 1.0))),
                );
                if action == "click" {
                    // `input.button ?? "left"`: null and absent both default.
                    let button = input
                        .get("button")
                        .and_then(Value::as_str)
                        .unwrap_or("left");
                    args.insert("button".to_string(), json!(button));
                }
            }
            "key" => {
                let combo = input
                    .get("combo")
                    .and_then(Value::as_str)
                    .ok_or_else(|| INVALID_COMBO.to_string())?;
                let length = js_len(combo);
                if !(1..=MAX_COMBO).contains(&length) {
                    return Err(INVALID_COMBO.to_string());
                }
                args.insert("action".to_string(), json!("key"));
                args.insert("combo".to_string(), json!(combo));
            }
            "type" => {
                let text = input
                    .get("text")
                    .and_then(Value::as_str)
                    .ok_or_else(|| INVALID_TEXT.to_string())?;
                if text.is_empty() || js_len(text) > MAX_TEXT {
                    return Err(INVALID_TEXT.to_string());
                }
                args.insert("action".to_string(), json!("type"));
                args.insert("text".to_string(), json!(text));
            }
            "scroll" => {
                let direction = input
                    .get("direction")
                    .and_then(Value::as_str)
                    .unwrap_or_default();
                if !matches!(direction, "up" | "down" | "left" | "right") {
                    return Err(INVALID_DIRECTION.to_string());
                }
                let amount = match input.get("amount") {
                    None => 1.0,
                    Some(value) => {
                        // `null` reaches the integer check and fails it, exactly
                        // as `Number.isInteger(null)` does.
                        let amount = value.as_f64().unwrap_or(f64::NAN);
                        if !is_integer(amount) || amount < 1.0 || amount > MAX_SCROLL {
                            return Err(INVALID_AMOUNT.to_string());
                        }
                        amount
                    }
                };
                args.insert("action".to_string(), json!("scroll"));
                args.insert("direction".to_string(), json!(direction));
                args.insert("amount".to_string(), js_number(amount));
            }
            _ => return Err(INVALID_ACTION.to_string()),
        }

        let expected_geometry = geometry.raw;
        self.run(&entry, || {
            let mut call = args;
            call.insert(
                "sessionId".to_string(),
                Value::String(control_id.to_string()),
            );
            call.insert("includeScreenshot".to_string(), Value::Bool(false));
            call.insert("expectedGeometry".to_string(), expected_geometry);
            self.proxy(&entry, "computer.act", call, DEFAULT_TIMEOUT_MS)?;
            Ok(())
        })
    }

    /// Read the host clipboard. `None` represents the reference's `null`.
    pub fn read_clipboard(
        &self,
        share_id: &str,
        chat_id: &str,
        viewer_id: &str,
        control_id: &str,
    ) -> Result<Option<String>, String> {
        let entry = self.owned(share_id, chat_id, viewer_id, control_id)?;
        let expected_geometry = entry
            .geometry
            .as_ref()
            .map(|geometry| geometry.raw.clone())
            .unwrap_or(Value::Null);
        self.run(&entry, || {
            let mut args = Map::new();
            args.insert(
                "sessionId".to_string(),
                Value::String(control_id.to_string()),
            );
            args.insert("expectedGeometry".to_string(), expected_geometry);
            let result = self.proxy(&entry, "computer.clipboard.read", args, DEFAULT_TIMEOUT_MS)?;
            match result.get("data").and_then(|data| data.get("text")) {
                Some(Value::Null) => Ok(None),
                Some(Value::String(text)) => Ok(Some(text.clone())),
                // Absent (undefined) and non-string are both rejected.
                _ => Err(INVALID_CLIPBOARD_RESPONSE.to_string()),
            }
        })
    }

    /// Write the host clipboard.
    pub fn write_clipboard(
        &self,
        share_id: &str,
        chat_id: &str,
        viewer_id: &str,
        control_id: &str,
        text: &str,
    ) -> Result<(), String> {
        if js_len(text) > MAX_CLIPBOARD || text.contains('\0') {
            return Err(INVALID_CLIPBOARD_TEXT.to_string());
        }
        let entry = self.owned(share_id, chat_id, viewer_id, control_id)?;
        let expected_geometry = entry
            .geometry
            .as_ref()
            .map(|geometry| geometry.raw.clone())
            .unwrap_or(Value::Null);
        self.run(&entry, || {
            let mut args = Map::new();
            args.insert(
                "sessionId".to_string(),
                Value::String(control_id.to_string()),
            );
            args.insert("expectedGeometry".to_string(), expected_geometry);
            args.insert("text".to_string(), json!(text));
            self.proxy(&entry, "computer.clipboard.write", args, DEFAULT_TIMEOUT_MS)?;
            Ok(())
        })
    }

    // -- teardown entry points --------------------------------------------

    /// The viewer ends its own control. Idempotent and never fails.
    pub fn stop(&self, share_id: &str, chat_id: &str, viewer_id: &str, control_id: &str) {
        let entry = {
            let entries = lock(&self.entries);
            entries
                .get(share_id)
                .filter(|entry| {
                    entry.chat_id == chat_id
                        && entry.viewer_id == viewer_id
                        && entry.control_id == control_id
                })
                .cloned()
        };
        if let Some(entry) = entry {
            self.stop_entry(&entry);
        }
    }

    /// Record a cancellation tombstone and end any matching seat.
    pub fn cancel(
        &self,
        share_id: &str,
        chat_id: &str,
        viewer_id: &str,
        request_id: &str,
    ) -> Result<(), String> {
        if request_id.is_empty() || js_len(request_id) > MAX_REQUEST_ID {
            return Err(REQUEST_ID_REQUIRED.to_string());
        }
        self.prune_cancelled();
        let key = request_key(share_id, chat_id, viewer_id, request_id);
        {
            let mut cancelled = lock(&self.cancelled);
            if !cancelled.contains_key(&key) && cancelled.len() >= MAX_CANCELLED {
                return Err(TOO_MANY_CANCELLED.to_string());
            }
            cancelled.insert(key, self.now() + CANCELLED_TTL_MS);
        }
        let entry = {
            let entries = lock(&self.entries);
            entries
                .values()
                .find(|entry| {
                    entry.chat_id == chat_id
                        && entry.viewer_id == viewer_id
                        && entry.request_id == request_id
                })
                .cloned()
        };
        if let Some(entry) = entry {
            self.stop_entry(&entry);
        }
        Ok(())
    }

    /// Drop every seat held by a device on a share.
    pub fn stop_for_viewer(&self, share_id: &str, viewer_id: &str) {
        let entries = {
            let entries = lock(&self.entries);
            entries
                .values()
                .filter(|entry| entry.share_id == share_id && entry.viewer_id == viewer_id)
                .cloned()
                .collect::<Vec<_>>()
        };
        for entry in entries {
            self.stop_entry(&entry);
        }
    }

    /// Drop every seat on a share.
    pub fn stop_for_share(&self, share_id: &str) {
        let entries = {
            let entries = lock(&self.entries);
            entries
                .values()
                .filter(|entry| entry.share_id == share_id)
                .cloned()
                .collect::<Vec<_>>()
        };
        for entry in entries {
            self.stop_entry(&entry);
        }
    }

    /// A node went away: drop its seats and stop its lease locally.
    pub fn node_disconnected(&self, node_id: &str) {
        let active = {
            let mut sessions = lock(&self.sessions);
            sessions.find_by_node(node_id)
        };
        let Some(active) = active else {
            return;
        };
        let entries = {
            let entries = lock(&self.entries);
            entries
                .values()
                .filter(|entry| entry.control_id == active.id)
                .cloned()
                .collect::<Vec<_>>()
        };
        for entry in entries {
            lock(&self.entries).remove(&entry.share_id);
        }
        let mut sessions = lock(&self.sessions);
        sessions.stop(&active.id);
    }

    /// Stop control on a node from a chat's own view.
    ///
    /// With `strict`, a lease owned by another chat is reported as
    /// [`OTHER_CHAT`] instead of being ignored.
    pub fn stop_for_node(&self, node_id: &str, chat_id: &str, strict: bool) -> Result<(), String> {
        let active = {
            let mut sessions = lock(&self.sessions);
            sessions.find_by_node(node_id)
        };
        let Some(active) = active else {
            return Ok(());
        };
        if active.owner_session_id != chat_id {
            if strict {
                return Err(OTHER_CHAT.to_string());
            }
            return Ok(());
        }
        let viewer = {
            let entries = lock(&self.entries);
            entries
                .values()
                .find(|entry| entry.control_id == active.id)
                .cloned()
        };
        if let Some(entry) = viewer {
            self.stop_entry(&entry);
            return Ok(());
        }
        {
            let mut sessions = lock(&self.sessions);
            sessions.stop(&active.id);
        }
        let mut args = Map::new();
        args.insert("action".to_string(), json!("stop"));
        args.insert("sessionId".to_string(), Value::String(active.id));
        // Best effort, like the reference's swallowed `catch`.
        let _ = self.remote(
            node_id,
            "computer.session",
            args,
            chat_id,
            DEFAULT_TIMEOUT_MS,
        );
        Ok(())
    }

    fn prune_cancelled(&self) {
        let now = self.now();
        lock(&self.cancelled).retain(|_, expires| *expires > now);
    }
}

// ---------------------------------------------------------------------------
// Tests. Fully hermetic: no network, no processes, no real sleeping.
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::computer_control::ComputerControlSessionService;
    use std::sync::Arc;

    const SHARE: &str = "share-1";
    const NODE: &str = "node-1";
    const CHAT: &str = "chat-1";
    const VIEWER: &str = "viewer-1";
    const LEASE_MS: i64 = 60_000;
    const START_MS: i64 = 1_000_000;

    #[derive(Clone, Debug)]
    struct RecordedCall {
        node_id: String,
        tool: String,
        args: Map<String, Value>,
        chat_id: String,
        timeout_ms: i64,
    }

    #[derive(Clone)]
    struct FakeWorld {
        now: Arc<Mutex<i64>>,
        share: Arc<Mutex<Option<ShareView>>>,
        siblings: Arc<Mutex<Vec<ShareView>>>,
        nodes: Arc<Mutex<HashMap<String, NodeFacts>>>,
        calls: Arc<Mutex<Vec<RecordedCall>>>,
        fail_with: Arc<Mutex<Option<String>>>,
        reject_with: Arc<Mutex<Option<String>>>,
        capture: Arc<Mutex<(f64, f64)>>,
        geometry: Arc<Mutex<Value>>,
        clipboard: Arc<Mutex<Value>>,
        clipboard_absent: Arc<Mutex<bool>>,
        revoke_on_capture: Arc<Mutex<bool>>,
    }

    fn sharing_share() -> ShareView {
        ShareView {
            id: SHARE.to_string(),
            status: "sharing".to_string(),
            pending_approval: Value::Null,
            chat_id: CHAT.to_string(),
            control_owner: "user".to_string(),
            node_id: NODE.to_string(),
            host_device_id: NODE.to_string(),
            remote_input: true,
            viewers: vec![VIEWER.to_string()],
        }
    }

    fn desktop_node() -> NodeFacts {
        NodeFacts {
            id: NODE.to_string(),
            role: "desktop".to_string(),
            lifecycle: "ready".to_string(),
            platform: "windows".to_string(),
            tools: REQUIRED_TOOLS.iter().map(|tool| tool.to_string()).collect(),
        }
    }

    fn new_world() -> FakeWorld {
        FakeWorld {
            now: Arc::new(Mutex::new(START_MS)),
            share: Arc::new(Mutex::new(Some(sharing_share()))),
            siblings: Arc::new(Mutex::new(vec![sharing_share()])),
            nodes: Arc::new(Mutex::new(HashMap::from([(
                NODE.to_string(),
                desktop_node(),
            )]))),
            calls: Arc::new(Mutex::new(Vec::new())),
            fail_with: Arc::new(Mutex::new(None)),
            reject_with: Arc::new(Mutex::new(None)),
            capture: Arc::new(Mutex::new((1600.0, 900.0))),
            geometry: Arc::new(Mutex::new(json!({
                "monitorCount": 1,
                "originX": 0,
                "originY": 0,
                "width": 1600,
                "height": 900
            }))),
            clipboard: Arc::new(Mutex::new(Value::Null)),
            clipboard_absent: Arc::new(Mutex::new(false)),
            revoke_on_capture: Arc::new(Mutex::new(false)),
        }
    }

    impl FakeWorld {
        fn advance(&self, ms: i64) {
            *lock(&self.now) += ms;
        }

        fn share_mutate(&self, mutate: impl FnOnce(&mut ShareView)) {
            if let Some(share) = lock(&self.share).as_mut() {
                mutate(share);
            }
        }

        fn calls_for(&self, tool: &str) -> Vec<RecordedCall> {
            lock(&self.calls)
                .iter()
                .filter(|call| call.tool == tool)
                .cloned()
                .collect()
        }

        fn tools(&self) -> Vec<String> {
            lock(&self.calls)
                .iter()
                .map(|call| call.tool.clone())
                .collect()
        }

        fn last_for(&self, tool: &str) -> Option<RecordedCall> {
            self.calls_for(tool).pop()
        }
    }

    impl ToolProxy for FakeWorld {
        fn proxy_tool_op(
            &self,
            node_id: &str,
            tool: &str,
            args: &Map<String, Value>,
            chat_id: &str,
            timeout_ms: i64,
        ) -> Result<Value, String> {
            lock(&self.calls).push(RecordedCall {
                node_id: node_id.to_string(),
                tool: tool.to_string(),
                args: args.clone(),
                chat_id: chat_id.to_string(),
                timeout_ms,
            });
            if let Some(message) = lock(&self.fail_with).clone() {
                return Err(message);
            }
            if *lock(&self.revoke_on_capture) && tool == "computer.share.capture" {
                self.share_mutate(|share| share.status = "idle".to_string());
            }
            if let Some(message) = lock(&self.reject_with).clone() {
                return Ok(json!({ "ok": false, "message": message }));
            }
            let data = match tool {
                "computer.share.capture" => {
                    let (width, height) = *lock(&self.capture);
                    json!({ "width": width, "height": height })
                }
                "computer.geometry" => lock(&self.geometry).clone(),
                "computer.clipboard.read" => {
                    if *lock(&self.clipboard_absent) {
                        json!({})
                    } else {
                        json!({ "text": lock(&self.clipboard).clone() })
                    }
                }
                _ => Value::Null,
            };
            Ok(json!({ "ok": true, "data": data }))
        }
    }

    impl NodeDirectory for FakeWorld {
        fn node(&self, node_id: &str) -> Option<NodeFacts> {
            lock(&self.nodes).get(node_id).cloned()
        }
    }

    impl ShareDirectory for FakeWorld {
        fn session(&self, share_id: &str) -> Option<ShareView> {
            lock(&self.share)
                .clone()
                .filter(|share| share.id == share_id)
        }

        fn sessions_for_node(&self, node_id: &str) -> Vec<ShareView> {
            lock(&self.siblings)
                .iter()
                .filter(|share| share.node_id == node_id)
                .cloned()
                .collect()
        }
    }

    type Coord = ScreenShareControlCoordinator<FakeWorld, FakeWorld, FakeWorld>;

    fn new_coordinator(world: &FakeWorld) -> Coord {
        let now = world.now.clone();
        let clock: Clock = Arc::new(move || *lock(&now));
        let sessions = ComputerControlSessionService::new(clock.clone(), LEASE_MS);
        ScreenShareControlCoordinator::new(
            world.clone(),
            sessions,
            world.clone(),
            world.clone(),
            clock,
        )
    }

    fn granted() -> (FakeWorld, Coord, StartGrant) {
        let world = new_world();
        let coordinator = new_coordinator(&world);
        let grant = coordinator
            .start(SHARE, CHAT, VIEWER, "req-1")
            .expect("grant");
        (world, coordinator, grant)
    }

    fn pointer(x: f64, y: f64) -> Map<String, Value> {
        let mut input = Map::new();
        input.insert("action".to_string(), json!("move"));
        input.insert("x".to_string(), json!(x));
        input.insert("y".to_string(), json!(y));
        input
    }

    // -- grant lifecycle ---------------------------------------------------

    #[test]
    fn grant_establishes_seat_and_forwards_the_expected_ops() {
        let (world, _coordinator, grant) = granted();

        assert!(!grant.control_id.is_empty());
        assert!(!grant.expires_at.is_empty());
        assert_eq!(
            world.tools(),
            vec![
                "computer.share.capture",
                "computer.session",
                "computer.geometry",
                "computer.share.capture",
            ]
        );

        let start = world.last_for("computer.session").expect("start call");
        assert_eq!(start.args["action"], "start");
        assert_eq!(start.args["sessionId"], json!(grant.control_id));
        assert_eq!(start.args["expiresAt"], json!(grant.expires_at));
        assert_eq!(start.args["shareSessionId"], json!(SHARE));
        assert_eq!(start.timeout_ms, START_TIMEOUT_MS);
        assert_eq!(start.node_id, NODE);
        assert_eq!(start.chat_id, CHAT);

        let geometry = world.last_for("computer.geometry").expect("geometry call");
        assert_eq!(geometry.args["sessionId"], json!(grant.control_id));
    }

    #[test]
    fn act_forwards_normalized_coordinates_as_desktop_pixels() {
        let (world, coordinator, grant) = granted();

        coordinator
            .act(SHARE, CHAT, VIEWER, &grant.control_id, &pointer(0.5, 0.5))
            .expect("move");
        let call = world.last_for("computer.act").expect("act call");
        // 0.5 * (1600 - 1) = 799.5 -> Math.round -> 800
        assert_eq!(call.args["x"], json!(800));
        assert_eq!(call.args["y"], json!(450));
        assert_eq!(call.args["action"], json!("move"));
        assert_eq!(call.args["sessionId"], json!(grant.control_id));
        assert_eq!(call.args["includeScreenshot"], json!(false));
        assert_eq!(call.args["expectedGeometry"]["width"], json!(1600));
        assert!(call.args.get("button").is_none());
        assert_eq!(call.timeout_ms, DEFAULT_TIMEOUT_MS);

        coordinator
            .act(SHARE, CHAT, VIEWER, &grant.control_id, &pointer(1.0, 0.0))
            .expect("corner");
        let call = world.last_for("computer.act").expect("act call");
        assert_eq!(call.args["x"], json!(1599));
        assert_eq!(call.args["y"], json!(0));
    }

    #[test]
    fn click_defaults_button_and_rejects_unknown_buttons() {
        let (world, coordinator, grant) = granted();
        let mut input = Map::new();
        input.insert("action".to_string(), json!("click"));
        input.insert("x".to_string(), json!(0.25));
        input.insert("y".to_string(), json!(0.25));
        coordinator
            .act(SHARE, CHAT, VIEWER, &grant.control_id, &input)
            .expect("click");
        let call = world.last_for("computer.act").expect("act call");
        assert_eq!(call.args["button"], json!("left"));
        assert_eq!(call.args["action"], json!("click"));
        // 0.25 * 1599 = 399.75 -> 400
        assert_eq!(call.args["x"], json!(400));

        let mut input = pointer(0.1, 0.1);
        input.insert("action".to_string(), json!("click"));
        input.insert("button".to_string(), json!("side"));
        assert_eq!(
            coordinator
                .act(SHARE, CHAT, VIEWER, &grant.control_id, &input)
                .unwrap_err(),
            INVALID_BUTTON
        );
    }

    #[test]
    fn stop_tears_down_the_seat_and_ends_the_lease() {
        let (world, coordinator, grant) = granted();
        coordinator.stop(SHARE, CHAT, VIEWER, &grant.control_id);

        let stop = world.last_for("computer.session").expect("stop call");
        assert_eq!(stop.args["action"], json!("stop"));
        assert_eq!(stop.args["sessionId"], json!(grant.control_id));
        assert_eq!(
            coordinator
                .act(SHARE, CHAT, VIEWER, &grant.control_id, &pointer(0.5, 0.5))
                .unwrap_err(),
            NOT_ACTIVE
        );
        // Idempotent.
        coordinator.stop(SHARE, CHAT, VIEWER, &grant.control_id);
        // The lease is gone, so a fresh grant is possible again.
        coordinator
            .start(SHARE, CHAT, VIEWER, "req-2")
            .expect("re-grant");
    }

    #[test]
    fn stop_ignores_a_mismatched_viewer_or_control_id() {
        let (_world, coordinator, grant) = granted();
        coordinator.stop(SHARE, CHAT, "viewer-2", &grant.control_id);
        coordinator.stop(SHARE, CHAT, VIEWER, "control-other");
        coordinator
            .act(SHARE, CHAT, VIEWER, &grant.control_id, &pointer(0.5, 0.5))
            .expect("seat must survive a mismatched stop");
    }

    // -- expiry ------------------------------------------------------------

    #[test]
    fn control_survives_until_the_lease_deadline() {
        let (world, coordinator, grant) = granted();
        world.advance(LEASE_MS - 1);
        coordinator
            .act(SHARE, CHAT, VIEWER, &grant.control_id, &pointer(0.5, 0.5))
            .expect("still within the lease");
    }

    #[test]
    fn control_ends_exactly_at_the_lease_deadline() {
        let (world, coordinator, grant) = granted();
        world.advance(LEASE_MS);
        let error = coordinator
            .act(SHARE, CHAT, VIEWER, &grant.control_id, &pointer(0.5, 0.5))
            .unwrap_err();
        assert!(error.contains("is not active"), "unexpected error: {error}");
    }

    #[test]
    fn control_stays_ended_after_the_lease_deadline() {
        let (world, coordinator, grant) = granted();
        world.advance(LEASE_MS + 1);
        assert!(
            coordinator
                .act(SHARE, CHAT, VIEWER, &grant.control_id, &pointer(0.5, 0.5))
                .is_err()
        );
        world.advance(LEASE_MS * 10);
        assert!(
            coordinator
                .read_clipboard(SHARE, CHAT, VIEWER, &grant.control_id)
                .is_err()
        );
    }

    #[test]
    fn an_expired_lease_blocks_a_new_grant_until_the_seat_is_stopped() {
        // The reference has no expiry timer: the seat lingers, so a second grant
        // collides with it. This is authority *narrowing*, and it is preserved.
        let (world, coordinator, grant) = granted();
        world.advance(LEASE_MS);
        assert_eq!(
            coordinator.start(SHARE, CHAT, VIEWER, "req-2").unwrap_err(),
            ALREADY_ACTIVE
        );
        coordinator.stop(SHARE, CHAT, VIEWER, &grant.control_id);
        coordinator
            .start(SHARE, CHAT, VIEWER, "req-3")
            .expect("regrant");
    }

    // -- revocation --------------------------------------------------------

    #[test]
    fn revoking_the_share_revokes_control() {
        let (_world, coordinator, grant) = granted();
        _world.share_mutate(|share| share.status = "idle".to_string());
        assert_eq!(
            coordinator
                .act(SHARE, CHAT, VIEWER, &grant.control_id, &pointer(0.5, 0.5))
                .unwrap_err(),
            SHARE_REJECTED
        );
        assert_eq!(
            coordinator
                .read_clipboard(SHARE, CHAT, VIEWER, &grant.control_id)
                .unwrap_err(),
            SHARE_REJECTED
        );
    }

    #[test]
    fn losing_the_capture_mid_action_tears_the_seat_down() {
        let (world, coordinator, grant) = granted();
        // The host revokes the share while the action's capture is in flight.
        *lock(&world.revoke_on_capture) = true;
        assert_eq!(
            coordinator
                .act(SHARE, CHAT, VIEWER, &grant.control_id, &pointer(0.5, 0.5))
                .unwrap_err(),
            SHARE_REJECTED
        );
        assert_eq!(
            world.last_for("computer.session").expect("stop").args["action"],
            json!("stop")
        );
        *lock(&world.revoke_on_capture) = false;
        world.share_mutate(|share| share.status = "sharing".to_string());
        // The seat was fully torn down, so the control id no longer works.
        assert_eq!(
            coordinator
                .act(SHARE, CHAT, VIEWER, &grant.control_id, &pointer(0.5, 0.5))
                .unwrap_err(),
            NOT_ACTIVE
        );
        coordinator
            .start(SHARE, CHAT, VIEWER, "req-2")
            .expect("regrant");
    }

    #[test]
    fn revoking_the_viewer_revokes_control() {
        let (world, coordinator, grant) = granted();
        world.share_mutate(|share| share.viewers.clear());
        assert_eq!(
            coordinator
                .act(SHARE, CHAT, VIEWER, &grant.control_id, &pointer(0.5, 0.5))
                .unwrap_err(),
            SHARE_REJECTED
        );
    }

    #[test]
    fn transfer_of_control_ownership_revokes_control() {
        let (world, coordinator, grant) = granted();
        world.share_mutate(|share| share.control_owner = "viewer".to_string());
        assert_eq!(
            coordinator
                .act(SHARE, CHAT, VIEWER, &grant.control_id, &pointer(0.5, 0.5))
                .unwrap_err(),
            SHARE_REJECTED
        );
    }

    // -- duplicate / re-entrant grants ------------------------------------

    #[test]
    fn a_second_grant_is_refused_and_does_not_touch_the_desktop() {
        let (world, coordinator, grant) = granted();
        let before = world.tools().len();
        assert_eq!(
            coordinator.start(SHARE, CHAT, VIEWER, "req-2").unwrap_err(),
            ALREADY_ACTIVE
        );
        assert_eq!(world.tools().len(), before);
        // The original seat is untouched.
        coordinator
            .act(SHARE, CHAT, VIEWER, &grant.control_id, &pointer(0.5, 0.5))
            .expect("original seat still valid");
    }

    #[test]
    fn a_duplicate_grant_with_the_same_request_id_is_refused() {
        let (_world, coordinator, _grant) = granted();
        assert_eq!(
            coordinator.start(SHARE, CHAT, VIEWER, "req-1").unwrap_err(),
            ALREADY_ACTIVE
        );
    }

    #[test]
    fn another_viewer_cannot_grant_while_a_seat_is_live() {
        let (world, coordinator, _grant) = granted();
        world.share_mutate(|share| share.viewers.push("viewer-2".to_string()));
        assert_eq!(
            coordinator
                .start(SHARE, CHAT, "viewer-2", "req-2")
                .unwrap_err(),
            ALREADY_ACTIVE
        );
    }

    // -- unauthorized viewers ---------------------------------------------

    #[test]
    fn unauthorized_viewers_and_shares_are_rejected_without_granting() {
        struct Case {
            name: &'static str,
            mutate: fn(&mut ShareView),
            expected: &'static str,
        }
        let cases = [
            Case {
                name: "viewer not in the share",
                mutate: |share| share.viewers = vec!["viewer-9".to_string()],
                expected: SHARE_REJECTED,
            },
            Case {
                name: "no viewers at all",
                mutate: |share| share.viewers.clear(),
                expected: SHARE_REJECTED,
            },
            Case {
                name: "control owned by a viewer",
                mutate: |share| share.control_owner = "viewer".to_string(),
                expected: SHARE_REJECTED,
            },
            Case {
                name: "approval still pending",
                mutate: |share| share.pending_approval = json!({ "id": "approval-1" }),
                expected: SHARE_REJECTED,
            },
            Case {
                name: "share belongs to another chat",
                mutate: |share| share.chat_id = "chat-2".to_string(),
                expected: SHARE_REJECTED,
            },
            Case {
                name: "host device mismatch",
                mutate: |share| share.host_device_id = "node-2".to_string(),
                expected: SHARE_REJECTED,
            },
            Case {
                name: "remote input not granted",
                mutate: |share| share.remote_input = false,
                expected: SHARE_REJECTED,
            },
            Case {
                name: "share has no node",
                mutate: |share| share.node_id = String::new(),
                expected: SHARE_REJECTED,
            },
            Case {
                name: "share is not sharing",
                mutate: |share| share.status = "paused".to_string(),
                expected: SHARE_REJECTED,
            },
        ];
        for case in cases {
            let world = new_world();
            world.share_mutate(case.mutate);
            let coordinator = new_coordinator(&world);
            let error = coordinator
                .start(SHARE, CHAT, VIEWER, "req-1")
                .expect_err(case.name);
            assert_eq!(error, case.expected, "case: {}", case.name);
            assert!(
                world.calls_for("computer.session").is_empty(),
                "case {} must not open a lease",
                case.name
            );
        }
    }

    #[test]
    fn a_second_live_share_on_the_same_node_blocks_the_grant() {
        let world = new_world();
        lock(&world.siblings).push(ShareView {
            id: "share-2".to_string(),
            ..sharing_share()
        });
        let coordinator = new_coordinator(&world);
        assert_eq!(
            coordinator.start(SHARE, CHAT, VIEWER, "req-1").unwrap_err(),
            SHARE_REJECTED
        );
    }

    #[test]
    fn an_unknown_share_is_rejected() {
        let world = new_world();
        *lock(&world.share) = None;
        let coordinator = new_coordinator(&world);
        assert_eq!(
            coordinator
                .start("share-unknown", CHAT, VIEWER, "req-1")
                .unwrap_err(),
            SHARE_REJECTED
        );
    }

    #[test]
    fn unsupported_desktops_are_rejected() {
        struct Case {
            name: &'static str,
            node: Option<NodeFacts>,
        }
        let cases = [
            Case {
                name: "unknown node",
                node: None,
            },
            Case {
                name: "not a desktop",
                node: Some(NodeFacts {
                    role: "viewer".to_string(),
                    ..desktop_node()
                }),
            },
            Case {
                name: "not ready",
                node: Some(NodeFacts {
                    lifecycle: "offline".to_string(),
                    ..desktop_node()
                }),
            },
            Case {
                name: "not windows",
                node: Some(NodeFacts {
                    platform: "darwin".to_string(),
                    ..desktop_node()
                }),
            },
            Case {
                name: "missing a tool",
                node: Some(NodeFacts {
                    tools: REQUIRED_TOOLS[1..].iter().map(|t| t.to_string()).collect(),
                    ..desktop_node()
                }),
            },
        ];
        for case in cases {
            let world = new_world();
            {
                let mut nodes = lock(&world.nodes);
                match case.node {
                    Some(node) => nodes.insert(NODE.to_string(), node),
                    None => nodes.remove(NODE),
                };
            }
            let coordinator = new_coordinator(&world);
            assert_eq!(
                coordinator
                    .start(SHARE, CHAT, VIEWER, "req-1")
                    .expect_err(case.name),
                DESKTOP_UNSUPPORTED,
                "case: {}",
                case.name
            );
            assert!(world.calls_for("computer.session").is_empty());
        }
    }

    #[test]
    fn the_unimplemented_transport_denies_every_grant() {
        let clock: Clock = Arc::new(|| START_MS);
        let sessions = ComputerControlSessionService::new(clock.clone(), LEASE_MS);
        let coordinator: ScreenShareControlCoordinator<
            UnimplementedTransport,
            UnimplementedTransport,
            UnimplementedTransport,
        > = ScreenShareControlCoordinator::new(
            UnimplementedTransport,
            sessions,
            UnimplementedTransport,
            UnimplementedTransport,
            clock,
        );
        assert_eq!(
            coordinator.start(SHARE, CHAT, VIEWER, "req-1").unwrap_err(),
            SHARE_REJECTED
        );

        // With a share visible but no node registry, the denial is explicit.
        struct LyingShare;
        impl ShareDirectory for LyingShare {
            fn session(&self, _share_id: &str) -> Option<ShareView> {
                Some(sharing_share())
            }
            fn sessions_for_node(&self, _node_id: &str) -> Vec<ShareView> {
                vec![sharing_share()]
            }
        }
        let clock: Clock = Arc::new(|| START_MS);
        let sessions = ComputerControlSessionService::new(clock.clone(), LEASE_MS);
        let coordinator: ScreenShareControlCoordinator<
            UnimplementedTransport,
            UnimplementedTransport,
            LyingShare,
        > = ScreenShareControlCoordinator::new(
            LyingShare,
            sessions,
            UnimplementedTransport,
            UnimplementedTransport,
            clock,
        );
        assert_eq!(
            coordinator.start(SHARE, CHAT, VIEWER, "req-1").unwrap_err(),
            DESKTOP_UNSUPPORTED
        );
    }

    // -- cancellation ------------------------------------------------------

    #[test]
    fn a_cancelled_request_id_cannot_be_granted() {
        let world = new_world();
        let coordinator = new_coordinator(&world);
        coordinator
            .cancel(SHARE, CHAT, VIEWER, "req-1")
            .expect("cancel");
        assert_eq!(
            coordinator.start(SHARE, CHAT, VIEWER, "req-1").unwrap_err(),
            CANCELLED
        );
        // A different request id is unaffected.
        coordinator
            .start(SHARE, CHAT, VIEWER, "req-2")
            .expect("grant");
    }

    #[test]
    fn cancellation_is_scoped_to_the_viewer_chat_and_share() {
        let world = new_world();
        let coordinator = new_coordinator(&world);
        coordinator
            .cancel(SHARE, CHAT, "viewer-2", "req-1")
            .expect("cancel");
        coordinator
            .start(SHARE, CHAT, VIEWER, "req-1")
            .expect("grant");
    }

    #[test]
    fn cancelling_an_active_seat_tears_it_down() {
        let (world, coordinator, grant) = granted();
        coordinator
            .cancel(SHARE, CHAT, VIEWER, "req-1")
            .expect("cancel");
        assert_eq!(
            world.last_for("computer.session").expect("stop").args["action"],
            json!("stop")
        );
        assert_eq!(
            coordinator
                .act(SHARE, CHAT, VIEWER, &grant.control_id, &pointer(0.5, 0.5))
                .unwrap_err(),
            NOT_ACTIVE
        );
        assert_eq!(
            coordinator.start(SHARE, CHAT, VIEWER, "req-1").unwrap_err(),
            CANCELLED
        );
    }

    #[test]
    fn cancellation_tombstones_expire_after_the_ttl() {
        let world = new_world();
        let coordinator = new_coordinator(&world);
        coordinator
            .cancel(SHARE, CHAT, VIEWER, "req-1")
            .expect("cancel");
        world.advance(CANCELLED_TTL_MS);
        coordinator
            .start(SHARE, CHAT, VIEWER, "req-1")
            .expect("ttl elapsed");
    }

    #[test]
    fn the_cancellation_map_is_bounded() {
        let world = new_world();
        let coordinator = new_coordinator(&world);
        for index in 0..MAX_CANCELLED {
            coordinator
                .cancel(SHARE, CHAT, VIEWER, &format!("req-{index}"))
                .expect("cancel");
        }
        assert_eq!(
            coordinator
                .cancel(SHARE, CHAT, VIEWER, "req-overflow")
                .unwrap_err(),
            TOO_MANY_CANCELLED
        );
        // A repeat of an existing request id is still accepted at the cap.
        coordinator
            .cancel(SHARE, CHAT, VIEWER, "req-0")
            .expect("repeat");
    }

    // -- teardown fan-out --------------------------------------------------

    #[test]
    fn stop_for_viewer_and_share_end_only_their_own_seats() {
        let (world, coordinator, grant) = granted();
        let before = world.tools().len();
        coordinator.stop_for_viewer(SHARE, "viewer-2");
        assert_eq!(
            world.tools().len(),
            before,
            "an unrelated viewer stop contacts no desktop"
        );
        coordinator
            .act(SHARE, CHAT, VIEWER, &grant.control_id, &pointer(0.5, 0.5))
            .expect("seat survives an unrelated viewer stop");
        coordinator.stop_for_viewer(SHARE, VIEWER);
        assert_eq!(
            coordinator
                .act(SHARE, CHAT, VIEWER, &grant.control_id, &pointer(0.5, 0.5))
                .unwrap_err(),
            NOT_ACTIVE
        );

        let (_world, coordinator, grant) = granted();
        coordinator.stop_for_share(SHARE);
        assert_eq!(
            coordinator
                .read_clipboard(SHARE, CHAT, VIEWER, &grant.control_id)
                .unwrap_err(),
            NOT_ACTIVE
        );
    }

    #[test]
    fn node_disconnect_drops_the_seat_without_contacting_the_desktop() {
        let (world, coordinator, grant) = granted();
        let before = world.tools().len();
        coordinator.node_disconnected(NODE);
        assert_eq!(world.tools().len(), before, "no proxy call on disconnect");
        assert_eq!(
            coordinator
                .act(SHARE, CHAT, VIEWER, &grant.control_id, &pointer(0.5, 0.5))
                .unwrap_err(),
            NOT_ACTIVE
        );
        // The lease is gone too.
        coordinator
            .start(SHARE, CHAT, VIEWER, "req-2")
            .expect("regrant");
        coordinator.node_disconnected("node-unknown");
    }

    #[test]
    fn stop_for_node_respects_lease_ownership() {
        let (world, coordinator, grant) = granted();
        assert_eq!(
            coordinator.stop_for_node(NODE, "chat-2", true).unwrap_err(),
            OTHER_CHAT
        );
        coordinator
            .act(SHARE, CHAT, VIEWER, &grant.control_id, &pointer(0.5, 0.5))
            .expect("strict refusal must not stop the seat");

        // A lenient stop for a foreign chat returns without touching the lease.
        coordinator
            .stop_for_node(NODE, "chat-2", false)
            .expect("lenient stop ignores a foreign chat");
        coordinator
            .act(SHARE, CHAT, VIEWER, &grant.control_id, &pointer(0.5, 0.5))
            .expect("lenient foreign stop must leave the seat usable");
        assert_ne!(
            world.last_for("computer.session").expect("op").args["action"],
            json!("stop")
        );

        // The owning chat ends the seat and the lease.
        coordinator
            .stop_for_node(NODE, CHAT, true)
            .expect("owner stop");
        assert_eq!(
            coordinator
                .act(SHARE, CHAT, VIEWER, &grant.control_id, &pointer(0.5, 0.5))
                .unwrap_err(),
            NOT_ACTIVE
        );
        assert_eq!(
            world.last_for("computer.session").expect("stop").args["action"],
            json!("stop")
        );
        coordinator
            .stop_for_node("node-unknown", CHAT, true)
            .expect("no lease");
    }

    /// The viewer-less path of `stop_for_node` stops the lease directly.
    #[test]
    fn stop_for_node_stops_a_lease_without_a_seat() {
        let world = new_world();
        let clock: Clock = {
            let now = world.now.clone();
            Arc::new(move || *lock(&now))
        };
        let mut sessions = ComputerControlSessionService::new(clock.clone(), LEASE_MS);
        sessions.start(CHAT, NODE).expect("raw lease");
        let coordinator: Coord = ScreenShareControlCoordinator::new(
            world.clone(),
            sessions,
            world.clone(),
            world.clone(),
            clock,
        );
        coordinator.stop_for_node(NODE, CHAT, true).expect("stop");
        assert_eq!(
            world.last_for("computer.session").expect("stop").args["action"],
            json!("stop")
        );
        // The lease is gone, so a grant can now succeed.
        coordinator
            .start(SHARE, CHAT, VIEWER, "req-1")
            .expect("grant");
    }

    // -- malformed input ---------------------------------------------------

    #[test]
    fn malformed_actions_are_rejected() {
        let (_world, coordinator, grant) = granted();
        let control = grant.control_id.clone();
        let act =
            |input: Map<String, Value>| coordinator.act(SHARE, CHAT, VIEWER, &control, &input);

        assert_eq!(act(Map::new()).unwrap_err(), INVALID_ACTION);
        let mut input = Map::new();
        input.insert("action".to_string(), json!("explode"));
        assert_eq!(act(input).unwrap_err(), INVALID_ACTION);
        let mut input = Map::new();
        input.insert("action".to_string(), json!(7));
        assert_eq!(act(input).unwrap_err(), INVALID_ACTION);

        // Pointer bounds are the normalized 0..1 frame.
        assert_eq!(act(pointer(-0.01, 0.5)).unwrap_err(), POINTER_OUT_OF_RANGE);
        assert_eq!(act(pointer(1.01, 0.5)).unwrap_err(), POINTER_OUT_OF_RANGE);
        assert_eq!(act(pointer(0.5, 2.0)).unwrap_err(), POINTER_OUT_OF_RANGE);
        let mut input = Map::new();
        input.insert("action".to_string(), json!("move"));
        input.insert("x".to_string(), json!("0.5"));
        input.insert("y".to_string(), json!(0.5));
        assert_eq!(act(input).unwrap_err(), POINTER_OUT_OF_RANGE);
        let mut input = Map::new();
        input.insert("action".to_string(), json!("move"));
        input.insert("x".to_string(), json!(0.5));
        assert_eq!(act(input).unwrap_err(), POINTER_OUT_OF_RANGE);

        // Key combinations.
        let mut input = Map::new();
        input.insert("action".to_string(), json!("key"));
        assert_eq!(act(input.clone()).unwrap_err(), INVALID_COMBO);
        input.insert("combo".to_string(), json!(""));
        assert_eq!(act(input.clone()).unwrap_err(), INVALID_COMBO);
        input.insert("combo".to_string(), json!("a".repeat(MAX_COMBO + 1)));
        assert_eq!(act(input.clone()).unwrap_err(), INVALID_COMBO);
        input.insert("combo".to_string(), json!(5));
        assert_eq!(act(input).unwrap_err(), INVALID_COMBO);

        // Typed text.
        let mut input = Map::new();
        input.insert("action".to_string(), json!("type"));
        assert_eq!(act(input.clone()).unwrap_err(), INVALID_TEXT);
        input.insert("text".to_string(), json!(""));
        assert_eq!(act(input.clone()).unwrap_err(), INVALID_TEXT);
        input.insert("text".to_string(), json!("a".repeat(MAX_TEXT + 1)));
        assert_eq!(act(input.clone()).unwrap_err(), INVALID_TEXT);
        input.insert("text".to_string(), json!("a".repeat(MAX_TEXT)));
        act(input).expect("max length text is allowed");

        // Scrolling.
        let mut input = Map::new();
        input.insert("action".to_string(), json!("scroll"));
        assert_eq!(act(input.clone()).unwrap_err(), INVALID_DIRECTION);
        input.insert("direction".to_string(), json!("sideways"));
        assert_eq!(act(input.clone()).unwrap_err(), INVALID_DIRECTION);
        input.insert("direction".to_string(), json!("up"));
        input.insert("amount".to_string(), json!(0));
        assert_eq!(act(input.clone()).unwrap_err(), INVALID_AMOUNT);
        input.insert("amount".to_string(), json!(MAX_SCROLL + 1.0));
        assert_eq!(act(input.clone()).unwrap_err(), INVALID_AMOUNT);
        input.insert("amount".to_string(), json!(1.5));
        assert_eq!(act(input.clone()).unwrap_err(), INVALID_AMOUNT);
        input.insert("amount".to_string(), Value::Null);
        assert_eq!(act(input.clone()).unwrap_err(), INVALID_AMOUNT);
        input.insert("amount".to_string(), json!(MAX_SCROLL));
        act(input).expect("max scroll is allowed");
    }

    #[test]
    fn a_bad_action_ends_the_seat_like_a_lost_capture() {
        // Input validation happens before `run`, so it does *not* tear down.
        let (world, coordinator, grant) = granted();
        let mut input = pointer(2.0, 2.0);
        input.insert("action".to_string(), json!("move"));
        coordinator
            .act(SHARE, CHAT, VIEWER, &grant.control_id, &input)
            .unwrap_err();
        assert!(world.calls_for("computer.act").is_empty());
        coordinator
            .act(SHARE, CHAT, VIEWER, &grant.control_id, &pointer(0.5, 0.5))
            .expect("seat still valid");
    }

    #[test]
    fn malformed_request_ids_are_rejected() {
        let world = new_world();
        let coordinator = new_coordinator(&world);
        assert_eq!(
            coordinator.start(SHARE, CHAT, VIEWER, "").unwrap_err(),
            REQUEST_ID_REQUIRED
        );
        assert_eq!(
            coordinator
                .start(SHARE, CHAT, VIEWER, &"a".repeat(MAX_REQUEST_ID + 1))
                .unwrap_err(),
            REQUEST_ID_REQUIRED
        );
        coordinator
            .start(SHARE, CHAT, VIEWER, &"a".repeat(MAX_REQUEST_ID))
            .expect("max length request id is allowed");
        assert_eq!(
            coordinator.cancel(SHARE, CHAT, VIEWER, "").unwrap_err(),
            REQUEST_ID_REQUIRED
        );
        assert_eq!(
            coordinator
                .cancel(SHARE, CHAT, VIEWER, &"a".repeat(MAX_REQUEST_ID + 1))
                .unwrap_err(),
            REQUEST_ID_REQUIRED
        );
    }

    #[test]
    fn a_missing_or_wrong_seat_is_refused() {
        let (_world, coordinator, grant) = granted();
        assert_eq!(
            coordinator
                .act(SHARE, CHAT, VIEWER, "control-other", &pointer(0.5, 0.5))
                .unwrap_err(),
            NOT_ACTIVE
        );
        assert_eq!(
            coordinator
                .act(
                    SHARE,
                    "chat-2",
                    VIEWER,
                    &grant.control_id,
                    &pointer(0.5, 0.5)
                )
                .unwrap_err(),
            NOT_ACTIVE
        );
        assert_eq!(
            coordinator
                .act(
                    SHARE,
                    CHAT,
                    "viewer-2",
                    &grant.control_id,
                    &pointer(0.5, 0.5)
                )
                .unwrap_err(),
            NOT_ACTIVE
        );
        assert_eq!(
            coordinator
                .act(
                    "share-2",
                    CHAT,
                    VIEWER,
                    &grant.control_id,
                    &pointer(0.5, 0.5)
                )
                .unwrap_err(),
            NOT_ACTIVE
        );
    }

    #[test]
    fn malformed_capture_and_geometry_are_rejected() {
        let world = new_world();
        *lock(&world.capture) = (0.0, 900.0);
        let coordinator = new_coordinator(&world);
        assert_eq!(
            coordinator.start(SHARE, CHAT, VIEWER, "req-1").unwrap_err(),
            CAPTURE_UNVERIFIABLE
        );
        // A failed grant must not leave a seat or a lease behind.
        assert_eq!(
            world.last_for("computer.session").expect("stop").args["action"],
            json!("stop")
        );

        let cases: [(Value, &str); 5] = [
            (
                json!({ "monitorCount": 2, "originX": 0, "originY": 0, "width": 1600, "height": 900 }),
                SINGLE_MONITOR_REQUIRED,
            ),
            (
                json!({ "monitorCount": 1, "originX": 0, "originY": 0, "width": 1600.5, "height": 900 }),
                SINGLE_MONITOR_REQUIRED,
            ),
            (
                json!({ "monitorCount": 1, "originX": 0, "originY": 0, "width": 0, "height": 900 }),
                SINGLE_MONITOR_REQUIRED,
            ),
            (
                json!({ "monitorCount": 1, "originX": 0, "originY": 0, "width": 1600, "height": 900.5 }),
                SINGLE_MONITOR_REQUIRED,
            ),
            (
                json!({ "monitorCount": 1, "originX": 0, "originY": 0, "width": 1000, "height": 1000 }),
                GEOMETRY_MISMATCH,
            ),
        ];
        for (geometry, expected) in cases {
            let world = new_world();
            *lock(&world.geometry) = geometry;
            let coordinator = new_coordinator(&world);
            assert_eq!(
                coordinator
                    .start(SHARE, CHAT, VIEWER, "req-1")
                    .expect_err("must reject"),
                expected
            );
        }

        let world = new_world();
        *lock(&world.geometry) = json!({ "monitorCount": 1 });
        let coordinator = new_coordinator(&world);
        assert_eq!(
            coordinator.start(SHARE, CHAT, VIEWER, "req-1").unwrap_err(),
            SINGLE_MONITOR_REQUIRED
        );
    }

    #[test]
    fn desktop_rejections_and_transport_errors_surface() {
        let world = new_world();
        *lock(&world.reject_with) = Some("The desktop rejected the control request.".to_string());
        let coordinator = new_coordinator(&world);
        assert_eq!(
            coordinator.start(SHARE, CHAT, VIEWER, "req-1").unwrap_err(),
            "The desktop rejected the control request."
        );

        // A rejection without a message falls back to the generic error.
        let world = new_world();
        *lock(&world.reject_with) = Some(String::new());
        let coordinator = new_coordinator(&world);
        assert_eq!(
            coordinator.start(SHARE, CHAT, VIEWER, "req-1").unwrap_err(),
            ""
        );

        // A transport-level failure propagates unchanged.
        let world = new_world();
        *lock(&world.fail_with) = Some("control plane offline".to_string());
        let coordinator = new_coordinator(&world);
        assert_eq!(
            coordinator.start(SHARE, CHAT, VIEWER, "req-1").unwrap_err(),
            "control plane offline"
        );
    }

    #[test]
    fn clipboard_read_shapes() {
        let (world, coordinator, grant) = granted();
        *lock(&world.clipboard) = Value::Null;
        assert_eq!(
            coordinator
                .read_clipboard(SHARE, CHAT, VIEWER, &grant.control_id)
                .expect("read"),
            None
        );

        *lock(&world.clipboard) = json!("copied text");
        assert_eq!(
            coordinator
                .read_clipboard(SHARE, CHAT, VIEWER, &grant.control_id)
                .expect("read"),
            Some("copied text".to_string())
        );

        *lock(&world.clipboard) = json!(42);
        assert_eq!(
            coordinator
                .read_clipboard(SHARE, CHAT, VIEWER, &grant.control_id)
                .unwrap_err(),
            INVALID_CLIPBOARD_RESPONSE
        );

        let (world, coordinator, grant) = granted();
        *lock(&world.clipboard_absent) = true;
        assert_eq!(
            coordinator
                .read_clipboard(SHARE, CHAT, VIEWER, &grant.control_id)
                .unwrap_err(),
            INVALID_CLIPBOARD_RESPONSE
        );
    }

    #[test]
    fn clipboard_write_validates_before_checking_the_seat() {
        let (_world, coordinator, grant) = granted();
        assert_eq!(
            coordinator
                .write_clipboard(
                    SHARE,
                    CHAT,
                    VIEWER,
                    &grant.control_id,
                    &"a".repeat(MAX_CLIPBOARD + 1)
                )
                .unwrap_err(),
            INVALID_CLIPBOARD_TEXT
        );
        assert_eq!(
            coordinator
                .write_clipboard(SHARE, CHAT, VIEWER, &grant.control_id, "nul\0inside")
                .unwrap_err(),
            INVALID_CLIPBOARD_TEXT
        );
        // Text validation wins over seat validation.
        assert_eq!(
            coordinator
                .write_clipboard(
                    SHARE,
                    CHAT,
                    VIEWER,
                    "control-other",
                    &"a".repeat(MAX_CLIPBOARD + 1)
                )
                .unwrap_err(),
            INVALID_CLIPBOARD_TEXT
        );
        coordinator
            .write_clipboard(SHARE, CHAT, VIEWER, &grant.control_id, "hello")
            .expect("write");
        let call = _world.last_for("computer.clipboard.write").expect("call");
        assert_eq!(call.args["text"], json!("hello"));
        assert_eq!(call.args["sessionId"], json!(grant.control_id));
    }

    #[test]
    fn malformed_share_json_does_not_deserialize_into_a_grantable_share() {
        assert!(ShareView::from_json(&json!(null)).is_none());
        assert!(ShareView::from_json(&json!({ "status": "sharing" })).is_none());
        let view = ShareView::from_json(&json!({
            "id": "share-1",
            "status": "sharing",
            "chatId": "chat-1",
            "controlOwner": "user",
            "nodeId": "node-1",
            "hostDeviceId": "node-1",
            "capabilities": { "remoteInput": true },
            "viewers": [{ "deviceId": "viewer-1" }, { "nope": true }]
        }))
        .expect("valid share");
        assert_eq!(view.viewers, vec!["viewer-1".to_string()]);
        assert!(view.remote_input);
    }
}
