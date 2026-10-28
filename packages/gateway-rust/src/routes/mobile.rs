//! Native HTTP adapter for packages/gateway/src/routes/mobile.ts.
//!
//! The TypeScript module talks to five collaborators (`DeviceRegistry`,
//! `MobilePushService`, `SchedulerService`, `SessionService`,
//! `ConsentManager` + `ControlAccess`). Two of them have Rust counterparts
//! whose request/response DTOs are route-shaped rather than domain-shaped, so
//! every collaborator is modelled here as a narrow object-safe trait. The
//! composition root (lib.rs) supplies the adapters; this module grants no
//! additional authority and never mutates global state.
use super::auth::{self, AuthState};
use axum::{
    Router,
    extract::{Path, Request, State},
    http::HeaderMap,
    response::Response,
    routing::{delete, get, post, put},
};
use serde_json::{Value, json};
use std::sync::Arc;

pub const INVALID_PAYLOAD: &str = "Invalid device registration payload";
pub const DEVICE_NOT_FOUND: &str = "Device not found";
pub const PUSH_DEVICE_NOT_FOUND: &str = "Push device not found";
pub const PUSH_UNAVAILABLE: &str = "Push notifications unavailable";
pub const NO_PUSH_DEVICES: &str = "No push devices registered for this user";
pub const DEFAULT_TEST_MESSAGE: &str = "This is a test push from Jait.";
pub const SCHEDULER_UNAVAILABLE: &str = "Scheduler unavailable";
pub const INVALID_ROUTINE_KIND: &str = "Invalid routine kind";
pub const INVALID_TIME: &str = "time must be HH:mm";
pub const INVALID_TIME_ZONE: &str = "Invalid timeZone";
pub const CONSENT_NOT_FOUND: &str = "Consent request not found";
pub const MORNING_PROMPT: &str = "Prepare my morning briefing from my calendar, reminders, and relevant memories. Tell me what is planned today, then ask one concise question if something needs clarification.";
pub const EVENING_PROMPT: &str = "Run my evening check-in. Summarize unfinished items and tomorrow, ask what I want to remember, and offer to schedule a wake-up alarm.";

#[derive(Clone, Debug, PartialEq)]
pub struct DeviceRegistration {
    pub id: String,
    pub name: String,
    pub platform: String,
    pub capabilities: Vec<String>,
}

pub trait DeviceStore: Send + Sync {
    fn register(&self, registration: DeviceRegistration) -> Value;
    fn heartbeat(&self, device_id: &str) -> Option<Value>;
    fn list(&self) -> Vec<Value>;
}

pub trait PushDevices: Send + Sync {
    /// Registering a token without an authenticated user never happens: the
    /// route only calls this after `require_user` succeeded.
    fn register(&self, device_id: &str, user_id: &str, token: &str);
    fn list(&self, user_id: &str) -> Vec<String>;
    fn unregister(&self, device_id: &str, user_id: &str) -> bool;
    fn send_attention(&self, payload: Value);
}

pub trait RoutineStore: Send + Sync {
    fn list(&self, user_id: &str) -> Vec<Value>;
    fn update(&self, id: &str, patch: Value, user_id: &str) -> Value;
    fn create(&self, job: Value) -> Value;
}

pub trait SessionList: Send + Sync {
    fn list_active(&self, user_id: &str) -> Vec<Value>;
}

pub trait ConsentStore: Send + Sync {
    fn list_pending(&self) -> Vec<Value>;
    fn approve(&self, id: &str, method: &str, actor: &str) -> bool;
    fn reject(&self, id: &str, method: &str, actor: &str) -> bool;
}

/// Port of `ControlAccess.session` / `ControlAccess.consentRequest`.
pub trait ControlAccessView: Send + Sync {
    fn session(&self, session_id: &str, user_id: &str) -> bool;
    fn consent_request(&self, id: &str, user_id: &str) -> bool;
}

#[derive(Clone)]
pub struct MobileRoutes {
    auth: AuthState,
    devices: Arc<dyn DeviceStore>,
    push: Option<Arc<dyn PushDevices>>,
    routines: Option<Arc<dyn RoutineStore>>,
    sessions: Option<Arc<dyn SessionList>>,
    consent: Arc<dyn ConsentStore>,
    access: Arc<dyn ControlAccessView>,
}

impl MobileRoutes {
    pub fn new(
        auth: AuthState,
        devices: Arc<dyn DeviceStore>,
        consent: Arc<dyn ConsentStore>,
        access: Arc<dyn ControlAccessView>,
    ) -> Self {
        Self {
            auth,
            devices,
            push: None,
            routines: None,
            sessions: None,
            consent,
            access,
        }
    }
    pub fn with_push(mut self, push: Arc<dyn PushDevices>) -> Self {
        self.push = Some(push);
        self
    }
    pub fn with_routines(mut self, routines: Arc<dyn RoutineStore>) -> Self {
        self.routines = Some(routines);
        self
    }
    pub fn with_sessions(mut self, sessions: Arc<dyn SessionList>) -> Self {
        self.sessions = Some(sessions);
        self
    }
    pub fn router(self) -> Router {
        Router::new()
            .route("/api/mobile/discovery", get(discovery))
            .route("/api/mobile/devices/register", post(register))
            .route("/api/mobile/devices/{deviceId}/heartbeat", post(heartbeat))
            .route("/api/mobile/devices", get(devices))
            .route("/api/mobile/push-devices", get(push_devices))
            .route("/api/mobile/push-devices/{deviceId}", delete(push_device_delete))
            .route("/api/mobile/push-devices/test", post(push_device_test))
            .route("/api/mobile/routines", get(routines))
            .route("/api/mobile/routines/{kind}", put(routine_put))
            .route("/api/mobile/os-tool/sessions", get(os_tool_sessions))
            .route("/api/mobile/consent/pending", get(consent_pending))
            .route("/api/mobile/consent/{id}/approve", post(consent_approve))
            .route("/api/mobile/consent/{id}/reject", post(consent_reject))
            .with_state(self)
    }
}

fn error(status: u16, message: &str) -> Response {
    auth::response(status, json!({ "error": message }))
}

fn error_body(message: &str) -> Value {
    json!({ "error": message })
}

/// `String(value ?? "")` followed by `String.prototype.trim()`.
fn js_string(value: Option<&Value>) -> String {
    match value {
        None | Some(Value::Null) => String::new(),
        Some(Value::String(s)) => s.clone(),
        Some(Value::Bool(b)) => b.to_string(),
        Some(Value::Number(n)) => match n.as_f64() {
            Some(f) if f.fract() == 0.0 && f.abs() < 1e21 => format!("{}", f as i64),
            _ => n.to_string(),
        },
        Some(Value::Array(items)) => items
            .iter()
            .map(|item| js_string(Some(item)))
            .collect::<Vec<_>>()
            .join(","),
        Some(Value::Object(_)) => "[object Object]".to_string(),
    }
}

/// JavaScript `trim()` also strips the BOM and all Unicode whitespace.
fn trim_js(input: &str) -> String {
    input
        .trim_matches(|c: char| c.is_whitespace() || c == '\u{feff}')
        .to_string()
}

fn field(body: &Value, key: &str) -> String {
    trim_js(&js_string(body.get(key)))
}

fn platform(value: Option<&Value>) -> Option<&'static str> {
    match value.and_then(Value::as_str) {
        Some("mobile") => Some("mobile"),
        Some("desktop") => Some("desktop"),
        Some("browser") => Some("browser"),
        _ => None,
    }
}

fn capabilities(body: &Value) -> Vec<String> {
    match body.get("capabilities") {
        Some(Value::Array(items)) => items
            .iter()
            .map(|item| js_string(Some(item)))
            .collect::<Vec<_>>(),
        _ => Vec::new(),
    }
}

/// Validation order matches the TS guard exactly: id, then name, then platform.
fn device_registration(body: &Value) -> Result<DeviceRegistration, Value> {
    let id = field(body, "id");
    let name = field(body, "name");
    let Some(platform) = platform(body.get("platform")) else {
        return Err(error_body(INVALID_PAYLOAD));
    };
    if id.is_empty() || name.is_empty() {
        return Err(error_body(INVALID_PAYLOAD));
    }
    Ok(DeviceRegistration {
        id,
        name,
        platform: platform.to_string(),
        capabilities: capabilities(body),
    })
}

fn heartbeat_body(device: Option<Value>) -> (u16, Value) {
    match device {
        Some(device) => (200, json!({ "ok": true, "device": device })),
        None => (404, error_body(DEVICE_NOT_FOUND)),
    }
}

fn push_devices_payload(ids: Vec<String>) -> Value {
    json!({
        "devices": ids
            .into_iter()
            .map(|device_id| json!({ "deviceId": device_id }))
            .collect::<Vec<_>>(),
    })
}

fn push_test_message(body: &Value) -> String {
    let message = field(body, "message");
    if message.is_empty() {
        DEFAULT_TEST_MESSAGE.to_string()
    } else {
        message
    }
}

fn routine_kind(kind: &str) -> Option<&'static str> {
    match kind {
        "morning" => Some("morning"),
        "evening" => Some("evening"),
        _ => None,
    }
}

/// `/^(\d{2}):(\d{2})$/` plus the range check that follows it.
fn parse_hhmm(time: &str) -> Option<(String, String)> {
    let bytes = time.as_bytes();
    if bytes.len() != 5 || bytes[2] != b':' {
        return None;
    }
    let digits = [bytes[0], bytes[1], bytes[3], bytes[4]];
    if !digits.iter().all(u8::is_ascii_digit) {
        return None;
    }
    let hour: u32 = time[0..2].parse().ok()?;
    let minute: u32 = time[3..5].parse().ok()?;
    if hour > 23 || minute > 59 {
        return None;
    }
    Some((time[0..2].to_string(), time[3..5].to_string()))
}

fn routine_time(kind: &str, body: &Value) -> String {
    match body.get("time").and_then(Value::as_str) {
        Some(time) => time.to_string(),
        None if kind == "morning" => "07:00".to_string(),
        None => "21:00".to_string(),
    }
}

/// IANA zone validation. `Intl.DateTimeFormat` consults the tz database; the
/// closest safe equivalent without a new dependency is a validated lookup in
/// the system zoneinfo tree. Traversal segments are rejected before any probe.
fn valid_time_zone(zone: &str) -> bool {
    if zone.is_empty() || zone.len() > 255 {
        return false;
    }
    if zone.eq_ignore_ascii_case("UTC") {
        return true;
    }
    let segments_valid = zone.split('/').all(|segment| {
        !segment.is_empty()
            && segment != "."
            && segment != ".."
            && segment
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '-' | '+'))
    });
    if !segments_valid {
        return false;
    }
    ["/usr/share/zoneinfo", "/usr/lib/zoneinfo", "/etc/zoneinfo"]
        .iter()
        .any(|root| std::path::Path::new(root).join(zone).is_file())
}

fn routine_time_zone(body: &Value) -> String {
    match body.get("timeZone").and_then(Value::as_str) {
        Some(zone) => zone.to_string(),
        None => "UTC".to_string(),
    }
}

fn routine_prompt(kind: &str, body: &Value) -> String {
    let prompt = field(body, "prompt");
    if !prompt.is_empty() {
        return prompt;
    }
    if kind == "morning" {
        MORNING_PROMPT.to_string()
    } else {
        EVENING_PROMPT.to_string()
    }
}

fn routine_enabled(body: &Value) -> bool {
    body.get("enabled") != Some(&Value::Bool(false))
}

fn routine_cron(hour: &str, minute: &str) -> String {
    format!("{minute} {hour} * * *")
}

fn routine_input(kind: &str, prompt: &str, time_zone: &str, working_directory: &str) -> Value {
    json!({
        "action": "create",
        "kind": "delivery",
        "prompt": prompt,
        "workingDirectory": working_directory,
        "start": true,
        "detach": true,
        "__jaitJobMeta": {
            "jobType": "agent_task",
            "routineKind": kind,
            "timeZone": time_zone,
            "prompt": prompt,
            "description": format!("{kind} daily routine"),
        },
    })
}

fn routine_patch(
    kind: &str,
    cron: &str,
    input: Value,
    enabled: bool,
) -> Value {
    json!({
        "name": format!("Daily {kind} routine"),
        "cron": cron,
        "toolName": "thread.control",
        "input": input,
        "enabled": enabled,
    })
}

fn routine_meta_kind(job: &Value) -> Option<String> {
    let input = job.get("input")?.as_object()?;
    let meta = input.get("__jaitJobMeta")?.as_object()?;
    meta.get("routineKind")?.as_str().map(str::to_string)
}

fn is_routine(job: &Value) -> bool {
    matches!(routine_meta_kind(job).as_deref(), Some("morning") | Some("evening"))
}

fn routine_matches_kind(job: &Value, kind: &str, user_id: &str) -> bool {
    routine_meta_kind(job).as_deref() == Some(kind)
        && job.get("userId").and_then(Value::as_str) == Some(user_id)
}

fn iso_now() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

fn iso_after(now: chrono::DateTime<chrono::Utc>, minutes: i64) -> String {
    (now + chrono::Duration::minutes(minutes)).to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

fn discovery_payload(host: &str, protocol: &str, discovered_at: &str) -> Value {
    let websocket = if protocol == "https" { "wss" } else { "ws" };
    json!({
        "name": "jait-gateway",
        "discoveredAt": discovered_at,
        "baseUrl": format!("{protocol}://{host}"),
        "wsUrl": format!("{websocket}://{host}/ws"),
    })
}

fn hostname(headers: &HeaderMap, request: &Request) -> String {
    let raw = headers
        .get(axum::http::header::HOST)
        .and_then(|value| value.to_str().ok())
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .or_else(|| request.uri().authority().map(|authority| authority.to_string()))
        .unwrap_or_else(|| "localhost".to_string());
    if let Some(rest) = raw.strip_prefix('[') {
        // IPv6 literal: hostname excludes the port that follows the bracket.
        if let Some(end) = rest.find(']') {
            return rest[..end].to_string();
        }
        return raw;
    }
    raw.rsplit_once(':')
        .filter(|(host, port)| !host.is_empty() && port.chars().all(|c| c.is_ascii_digit()))
        .map(|(host, _)| host.to_string())
        .unwrap_or(raw)
}

fn protocol(request: &Request) -> &'static str {
    match request.uri().scheme_str() {
        Some("https") => "https",
        _ => "http",
    }
}

fn working_directory() -> String {
    std::env::current_dir()
        .map(|path| path.to_string_lossy().into_owned())
        .unwrap_or_default()
}

async fn body_of(request: Request) -> Result<Value, Box<Response>> {
    let headers = request.headers().clone();
    let body = auth::parse_body(request.into_body(), &headers).await?;
    Ok(if body.is_null() { json!({}) } else { body })
}

async fn discovery(State(_state): State<MobileRoutes>, request: Request) -> Response {
    let host = hostname(request.headers(), &request);
    let protocol = protocol(&request);
    auth::response(
        200,
        discovery_payload(&host, protocol, &iso_now()),
    )
}

async fn register(State(state): State<MobileRoutes>, request: Request) -> Response {
    // Fastify parses the body before the handler runs, so a malformed JSON
    // body yields 400 ahead of the conditional push-token auth check.
    let headers = request.headers().clone();
    let body = match body_of(request).await {
        Ok(body) => body,
        Err(response) => return *response,
    };
    let registration = match device_registration(&body) {
        Ok(registration) => registration,
        Err(body) => return auth::response(400, body),
    };
    let push_token = field(&body, "pushToken");
    let device = state.devices.register(registration.clone());
    if !push_token.is_empty() {
        let user = match auth::require_user(&state.auth, &headers).await {
            Ok(user) => user,
            Err(response) => return *response,
        };
        if let Some(push) = &state.push {
            push.register(&registration.id, &user.id, &push_token);
        }
    }
    auth::response(200, json!({ "ok": true, "device": device }))
}

async fn heartbeat(
    State(state): State<MobileRoutes>,
    Path(device_id): Path<String>,
) -> Response {
    let (status, body) = heartbeat_body(state.devices.heartbeat(&device_id));
    auth::response(status, body)
}

async fn devices(State(state): State<MobileRoutes>) -> Response {
    auth::response(200, json!({ "devices": state.devices.list() }))
}

async fn push_devices(State(state): State<MobileRoutes>, request: Request) -> Response {
    let user = match auth::require_user(&state.auth, request.headers()).await {
        Ok(user) => user,
        Err(response) => return *response,
    };
    let ids = state
        .push
        .as_ref()
        .map(|push| push.list(&user.id))
        .unwrap_or_default();
    auth::response(200, push_devices_payload(ids))
}

async fn push_device_delete(
    State(state): State<MobileRoutes>,
    Path(device_id): Path<String>,
    request: Request,
) -> Response {
    let user = match auth::require_user(&state.auth, request.headers()).await {
        Ok(user) => user,
        Err(response) => return *response,
    };
    // `!deps.mobilePush?.unregister(...)` is true when the service is absent,
    // so a missing service fails closed with the same 404.
    let removed = state
        .push
        .as_ref()
        .is_some_and(|push| push.unregister(&device_id, &user.id));
    if !removed {
        return error(404, PUSH_DEVICE_NOT_FOUND);
    }
    auth::response(200, json!({ "ok": true }))
}

async fn push_device_test(State(state): State<MobileRoutes>, request: Request) -> Response {
    let user = match auth::require_user(&state.auth, request.headers()).await {
        Ok(user) => user,
        Err(response) => return *response,
    };
    let Some(push) = state.push.clone() else {
        return error(503, PUSH_UNAVAILABLE);
    };
    let device_count = push.list(&user.id).len();
    if device_count == 0 {
        return error(404, NO_PUSH_DEVICES);
    }
    let body = match body_of(request).await {
        Ok(body) => body,
        Err(response) => return *response,
    };
    let message = push_test_message(&body);
    let now = chrono::Utc::now();
    let request_id = crate::identifiers::uuidv7();
    push.send_attention(json!({
        "key": crate::services::attention::attention_key(
            crate::services::attention::AttentionKind::Question,
            &request_id,
        ),
        "kind": "question",
        "requestId": request_id,
        "sessionId": "test",
        "userId": user.id,
        "title": "Jait test notification",
        "body": message,
        "urgent": true,
        "actions": [],
        "link": "/",
        "createdAt": now.to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
        "expiresAt": iso_after(now, 5),
    }));
    auth::response(200, json!({ "ok": true, "devices": device_count }))
}

async fn routines(State(state): State<MobileRoutes>, request: Request) -> Response {
    let user = match auth::require_user(&state.auth, request.headers()).await {
        Ok(user) => user,
        Err(response) => return *response,
    };
    let jobs = state
        .routines
        .as_ref()
        .map(|store| store.list(&user.id))
        .unwrap_or_default();
    let routines = jobs.into_iter().filter(is_routine).collect::<Vec<_>>();
    auth::response(200, json!({ "routines": routines }))
}

async fn routine_put(
    State(state): State<MobileRoutes>,
    Path(kind): Path<String>,
    request: Request,
) -> Response {
    let user = match auth::require_user(&state.auth, request.headers()).await {
        Ok(user) => user,
        Err(response) => return *response,
    };
    let Some(store) = state.routines.clone() else {
        return error(503, SCHEDULER_UNAVAILABLE);
    };
    let Some(kind) = routine_kind(&kind) else {
        return error(400, INVALID_ROUTINE_KIND);
    };
    let body = match body_of(request).await {
        Ok(body) => body,
        Err(response) => return *response,
    };
    let time = routine_time(kind, &body);
    let Some((hour, minute)) = parse_hhmm(&time) else {
        return error(400, INVALID_TIME);
    };
    let time_zone = routine_time_zone(&body);
    if !valid_time_zone(&time_zone) {
        return error(400, INVALID_TIME_ZONE);
    }
    let prompt = routine_prompt(kind, &body);
    let input = routine_input(kind, &prompt, &time_zone, &working_directory());
    let patch = routine_patch(kind, &routine_cron(&hour, &minute), input, routine_enabled(&body));
    let existing = store
        .list(&user.id)
        .into_iter()
        .find(|job| routine_matches_kind(job, kind, &user.id));
    let routine = match existing
        .and_then(|job| job.get("id").and_then(Value::as_str).map(str::to_string))
    {
        Some(id) => store.update(&id, patch, &user.id),
        None => {
            let mut job = match patch {
                Value::Object(map) => map,
                _ => serde_json::Map::new(),
            };
            job.insert("userId".to_string(), json!(user.id));
            job.insert("sessionId".to_string(), json!("default"));
            job.insert("projectRoot".to_string(), json!(working_directory()));
            store.create(Value::Object(job))
        }
    };
    auth::response(200, json!({ "routine": routine }))
}

async fn os_tool_sessions(State(state): State<MobileRoutes>, request: Request) -> Response {
    let user = match auth::require_user(&state.auth, request.headers()).await {
        Ok(user) => user,
        Err(response) => return *response,
    };
    let sessions = state
        .sessions
        .as_ref()
        .map(|list| list.list_active(&user.id))
        .unwrap_or_default();
    auth::response(200, json!({ "sessions": sessions }))
}

async fn consent_pending(State(state): State<MobileRoutes>, request: Request) -> Response {
    let user = match auth::require_user(&state.auth, request.headers()).await {
        Ok(user) => user,
        Err(response) => return *response,
    };
    let pending = state
        .consent
        .list_pending()
        .into_iter()
        .filter(|entry| {
            entry
                .get("sessionId")
                .and_then(Value::as_str)
                .is_some_and(|session| state.access.session(session, &user.id))
        })
        .collect::<Vec<_>>();
    auth::response(200, json!({ "requests": pending }))
}

async fn consent_approve(
    State(state): State<MobileRoutes>,
    Path(id): Path<String>,
    request: Request,
) -> Response {
    let user = match auth::require_user(&state.auth, request.headers()).await {
        Ok(user) => user,
        Err(response) => return *response,
    };
    if !state.access.consent_request(&id, &user.id) {
        return error(404, CONSENT_NOT_FOUND);
    }
    if !state.consent.approve(&id, "click", "mobile.approve") {
        return error(404, CONSENT_NOT_FOUND);
    }
    auth::response(200, json!({ "ok": true }))
}

async fn consent_reject(
    State(state): State<MobileRoutes>,
    Path(id): Path<String>,
    request: Request,
) -> Response {
    let user = match auth::require_user(&state.auth, request.headers()).await {
        Ok(user) => user,
        Err(response) => return *response,
    };
    if !state.access.consent_request(&id, &user.id) {
        return error(404, CONSENT_NOT_FOUND);
    }
    if !state.consent.reject(&id, "click", "mobile.reject") {
        return error(404, CONSENT_NOT_FOUND);
    }
    auth::response(200, json!({ "ok": true }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn discovery_payload_shape_and_scheme_switch() {
        let http = discovery_payload("host:1234", "http", "2024-01-01T00:00:00.000Z");
        assert_eq!(http["name"], "jait-gateway");
        assert_eq!(http["baseUrl"], "http://host:1234");
        assert_eq!(http["wsUrl"], "ws://host:1234/ws");
        assert_eq!(http["discoveredAt"], "2024-01-01T00:00:00.000Z");
        let https = discovery_payload("gateway.local", "https", "2024-01-01T00:00:00.000Z");
        assert_eq!(https["baseUrl"], "https://gateway.local");
        assert_eq!(https["wsUrl"], "wss://gateway.local/ws");
    }

    #[test]
    fn js_string_matches_javascript_coercion() {
        assert_eq!(js_string(None), "");
        assert_eq!(js_string(Some(&Value::Null)), "");
        assert_eq!(js_string(Some(&json!("x"))), "x");
        assert_eq!(js_string(Some(&json!(12))), "12");
        assert_eq!(js_string(Some(&json!(1.5))), "1.5");
        assert_eq!(js_string(Some(&json!(true))), "true");
        assert_eq!(js_string(Some(&json!([1, "a"]))), "1,a");
        assert_eq!(js_string(Some(&json!({"a": 1}))), "[object Object]");
    }

    #[test]
    fn trim_js_strips_unicode_whitespace_and_bom() {
        assert_eq!(trim_js("  phone \n"), "phone");
        assert_eq!(trim_js("\u{feff}bom\u{feff}"), "bom");
        assert_eq!(trim_js("\t\u{a0}id\u{a0}"), "id");
    }

    #[test]
    fn registration_trims_and_defaults_capabilities() {
        let body = json!({
            "id": "  dev-1 ",
            "name": " Pixel ",
            "platform": "mobile",
            "capabilities": ["camera", 7],
            "pushToken": " tok ",
        });
        let registration = device_registration(&body).expect("valid");
        assert_eq!(registration.id, "dev-1");
        assert_eq!(registration.name, "Pixel");
        assert_eq!(registration.platform, "mobile");
        assert_eq!(registration.capabilities, vec!["camera", "7"]);
        assert_eq!(field(&body, "pushToken"), "tok");
        let no_caps = json!({"id": "a", "name": "b", "platform": "desktop", "capabilities": "x"});
        assert!(device_registration(&no_caps).expect("valid").capabilities.is_empty());
    }

    #[test]
    fn registration_rejects_each_missing_field_with_400() {
        let missing_id = json!({"name": "n", "platform": "browser"});
        assert_eq!(
            device_registration(&missing_id),
            Err(error_body(INVALID_PAYLOAD))
        );
        let missing_name = json!({"id": "i", "platform": "browser"});
        assert_eq!(
            device_registration(&missing_name),
            Err(error_body(INVALID_PAYLOAD))
        );
        let blank_id = json!({"id": "   ", "name": "n", "platform": "browser"});
        assert_eq!(device_registration(&blank_id), Err(error_body(INVALID_PAYLOAD)));
        assert_eq!(
            error_body( INVALID_PAYLOAD)["error"],
            "Invalid device registration payload"
        );
        assert_eq!(error(400, INVALID_PAYLOAD).status(), 400);
        assert_eq!(error(404, DEVICE_NOT_FOUND).status(), 404);
    }

    #[test]
    fn registration_rejects_unknown_platform_even_when_id_and_name_present() {
        for platform in ["tablet", "MOBILE", "", "1"] {
            let body = json!({"id": "i", "name": "n", "platform": platform});
            assert_eq!(device_registration(&body), Err(error_body(INVALID_PAYLOAD)));
        }
        for platform in ["mobile", "desktop", "browser"] {
            let body = json!({"id": "i", "name": "n", "platform": platform});
            assert!(device_registration(&body).is_ok());
        }
    }

    #[test]
    fn heartbeat_maps_missing_device_to_404_and_present_to_ok() {
        let (status, body) = heartbeat_body(None);
        assert_eq!(status, 404);
        assert_eq!(body, json!({"error": "Device not found"}));
        let (status, body) = heartbeat_body(Some(json!({"id": "d1"})));
        assert_eq!(status, 200);
        assert_eq!(body, json!({"ok": true, "device": {"id": "d1"}}));
    }

    #[test]
    fn push_devices_payload_exposes_only_device_id() {
        let payload = push_devices_payload(vec!["a".to_string(), "b".to_string()]);
        assert_eq!(
            payload,
            json!({"devices": [{"deviceId": "a"}, {"deviceId": "b"}]})
        );
        assert_eq!(payload["devices"][0].as_object().expect("object").len(), 1);
        assert_eq!(push_devices_payload(Vec::new()), json!({"devices": []}));
    }

    #[test]
    fn push_test_message_defaults_and_trims() {
        assert_eq!(push_test_message(&json!({})), DEFAULT_TEST_MESSAGE);
        assert_eq!(
            push_test_message(&json!({"message": "   "})),
            DEFAULT_TEST_MESSAGE
        );
        assert_eq!(
            push_test_message(&json!({"message": 42})),
            "42"
        );
        assert_eq!(
            push_test_message(&json!({"message": " hi "})),
            "hi"
        );
        assert_eq!(DEFAULT_TEST_MESSAGE, "This is a test push from Jait.");
    }

    #[test]
    fn routine_kind_is_closed_set() {
        assert_eq!(routine_kind("morning"), Some("morning"));
        assert_eq!(routine_kind("evening"), Some("evening"));
        assert_eq!(routine_kind("MORNING"), None);
        assert_eq!(routine_kind(""), None);
        assert_eq!(
            error_body(INVALID_ROUTINE_KIND)["error"],
            "Invalid routine kind"
        );
    }

    #[test]
    fn hhmm_requires_exactly_two_digits_and_in_range() {
        assert_eq!(
            parse_hhmm("07:05"),
            Some(("07".to_string(), "05".to_string()))
        );
        assert_eq!(parse_hhmm("23:59"), Some(("23".to_string(), "59".to_string())));
        assert_eq!(parse_hhmm("24:00"), None);
        assert_eq!(parse_hhmm("00:60"), None);
        assert_eq!(parse_hhmm("7:05"), None);
        assert_eq!(parse_hhmm("07:5"), None);
        assert_eq!(parse_hhmm("0705"), None);
        assert_eq!(parse_hhmm("07-05"), None);
        assert_eq!(parse_hhmm("-1:05"), None);
        assert_eq!(parse_hhmm(""), None);
        assert_eq!(error_body(INVALID_TIME)["error"], "time must be HH:mm");
    }

    #[test]
    fn routine_defaults_follow_kind() {
        assert_eq!(routine_time("morning", &json!({})), "07:00");
        assert_eq!(routine_time("evening", &json!({})), "21:00");
        assert_eq!(routine_time("morning", &json!({"time": "09:30"})), "09:30");
        assert_eq!(routine_time("evening", &json!({"time": 9})), "21:00");
        assert_eq!(routine_time_zone(&json!({})), "UTC");
        assert_eq!(routine_time_zone(&json!({"timeZone": "Europe/Berlin"})), "Europe/Berlin");
        assert_eq!(routine_time_zone(&json!({"timeZone": null})), "UTC");
    }

    #[test]
    fn routine_prompt_prefers_trimmed_body_then_kind_default() {
        assert_eq!(routine_prompt("morning", &json!({})), MORNING_PROMPT);
        assert_eq!(routine_prompt("evening", &json!({})), EVENING_PROMPT);
        assert_eq!(
            routine_prompt("morning", &json!({"prompt": "  custom  "})),
            "custom"
        );
        assert_eq!(routine_prompt("evening", &json!({"prompt": "   "})), EVENING_PROMPT);
    }

    #[test]
    fn routine_patch_and_input_match_typescript_shape() {
        let input = routine_input("morning", "p", "Europe/Berlin", "/work");
        assert_eq!(input["action"], "create");
        assert_eq!(input["kind"], "delivery");
        assert_eq!(input["prompt"], "p");
        assert_eq!(input["workingDirectory"], "/work");
        assert_eq!(input["start"], true);
        assert_eq!(input["detach"], true);
        let meta = &input["__jaitJobMeta"];
        assert_eq!(meta["jobType"], "agent_task");
        assert_eq!(meta["routineKind"], "morning");
        assert_eq!(meta["timeZone"], "Europe/Berlin");
        assert_eq!(meta["prompt"], "p");
        assert_eq!(meta["description"], "morning daily routine");
        let patch = routine_patch("morning", &routine_cron("07", "00"), input, true);
        assert_eq!(patch["name"], "Daily morning routine");
        assert_eq!(patch["cron"], "00 07 * * *");
        assert_eq!(patch["toolName"], "thread.control");
        assert_eq!(patch["enabled"], true);
        assert_eq!(routine_cron("21", "05"), "05 21 * * *");
    }

    #[test]
    fn routine_enabled_only_disables_on_explicit_false() {
        assert!(routine_enabled(&json!({})));
        assert!(routine_enabled(&json!({"enabled": true})));
        assert!(routine_enabled(&json!({"enabled": 0})));
        assert!(!routine_enabled(&json!({"enabled": false})));
    }

    #[test]
    fn routines_are_filtered_by_meta_kind() {
        let morning = json!({"id": "1", "input": {"__jaitJobMeta": {"routineKind": "morning"}}});
        let evening = json!({"id": "2", "input": {"__jaitJobMeta": {"routineKind": "evening"}}});
        let other = json!({"id": "3", "input": {"__jaitJobMeta": {"routineKind": "cleanup"}}});
        let no_meta = json!({"id": "4", "input": {}});
        let no_input = json!({"id": "5"});
        let kept = [morning.clone(), evening.clone(), other, no_meta, no_input]
            .into_iter()
            .filter(is_routine)
            .collect::<Vec<_>>();
        assert_eq!(kept.len(), 2);
        assert_eq!(kept[0]["id"], "1");
        assert_eq!(kept[1]["id"], "2");
        assert!(!routine_matches_kind(&morning, "morning", "u1"));
        let mut owned = morning;
        owned["userId"] = json!("u1");
        assert!(routine_matches_kind(&owned, "morning", "u1"));
        assert!(!routine_matches_kind(&owned, "evening", "u1"));
        assert!(!routine_matches_kind(&owned, "morning", "u2"));
    }

    #[test]
    fn time_zone_validation_rejects_traversal_and_accepts_utc() {
        assert!(valid_time_zone("UTC"));
        assert!(valid_time_zone("utc"));
        assert!(!valid_time_zone(""));
        assert!(!valid_time_zone("../etc/passwd"));
        assert!(!valid_time_zone("/etc/passwd"));
        assert!(!valid_time_zone("Europe/../../etc/passwd"));
        assert!(!valid_time_zone("Europe//Berlin"));
        assert!(!valid_time_zone("Not/AZone"));
        assert_eq!(error_body(INVALID_TIME_ZONE)["error"], "Invalid timeZone");
    }

    #[test]
    fn error_statuses_match_typescript_branches() {
        for (status, message) in [
            (503, PUSH_UNAVAILABLE),
            (404, NO_PUSH_DEVICES),
            (503, SCHEDULER_UNAVAILABLE),
            (404, PUSH_DEVICE_NOT_FOUND),
            (404, CONSENT_NOT_FOUND),
        ] {
            let response = error(status, message);
            assert_eq!(response.status(), status);
            assert_eq!(error_body(message)["error"], message);
        }
        assert_eq!(PUSH_UNAVAILABLE, "Push notifications unavailable");
        assert_eq!(NO_PUSH_DEVICES, "No push devices registered for this user");
        assert_eq!(SCHEDULER_UNAVAILABLE, "Scheduler unavailable");
        assert_eq!(PUSH_DEVICE_NOT_FOUND, "Push device not found");
        assert_eq!(CONSENT_NOT_FOUND, "Consent request not found");
    }

    #[test]
    fn hostname_strips_port_and_keeps_ipv6_literal() {
        use axum::body::Body;
        use axum::http::Request as HttpRequest;
        let request = HttpRequest::builder()
            .uri("/api/mobile/discovery")
            .body(Body::empty())
            .expect("request");
        let mut headers = HeaderMap::new();
        headers.insert(axum::http::header::HOST, "phone.local:8443".parse().expect("host"));
        assert_eq!(hostname(&headers, &request), "phone.local");
        headers.insert(axum::http::header::HOST, "[::1]:8443".parse().expect("host"));
        assert_eq!(hostname(&headers, &request), "::1");
        headers.remove(axum::http::header::HOST);
        assert_eq!(hostname(&headers, &request), "localhost");
        assert_eq!(protocol(&request), "http");
    }
}
