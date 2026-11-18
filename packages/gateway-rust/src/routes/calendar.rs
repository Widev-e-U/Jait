//! Explicitly mounted calendar HTTP API backed by the bounded calendar service.
use super::auth::{self, AuthState, response};
use crate::{
    services::calendar::{oauth::CalendarOAuthCredentials, service::CalendarService},
    text::js_trim,
};
use axum::{
    Router,
    extract::{Request, State},
    http::HeaderMap,
    response::{IntoResponse, Response},
    routing::{delete, get, post},
};
use serde_json::{Value, json};
use std::sync::Arc;

#[derive(Clone)]
pub struct CalendarRoutes {
    pub auth: AuthState,
    pub calendar: Arc<CalendarService>,
    /// Captured at construction so independent gateways do not mutate process environment.
    pub public_base: Option<String>,
}
impl CalendarRoutes {
    pub fn router(self) -> Router {
        Router::new()
            .route("/api/calendar/config", get(handle))
            .route("/api/calendar/config/google", post(handle))
            .route("/api/calendar/accounts", get(handle))
            .route("/api/calendar/accounts/{id}", delete(handle))
            .route("/api/calendar/device/sync", post(handle))
            .route("/api/calendar/connect/google", get(handle))
            .route("/api/calendar/oauth/callback", get(handle))
            .route("/api/calendar/calendars", get(handle))
            .route("/api/calendar/events", get(handle))
            .with_state(self)
    }
    fn redirect_uri(&self, headers: &HeaderMap) -> String {
        if let Some(base) = self
            .public_base
            .as_deref()
            .map(js_trim)
            .map(|s| s.trim_end_matches('/'))
            .filter(|s| !s.is_empty())
        {
            return format!("{base}/api/calendar/oauth/callback");
        }
        let header = |key: &str| headers.get(key).and_then(|v| v.to_str().ok());
        format!(
            "{}://{}/api/calendar/oauth/callback",
            header("x-forwarded-proto").unwrap_or("http"),
            header("x-forwarded-host")
                .or_else(|| header("host"))
                .unwrap_or("undefined")
        )
    }
}
fn escape_html(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}
fn callback_html(message: &str, ok: bool) -> Response {
    let color = if ok { "#34d399" } else { "#f87171" };
    let icon = if ok { "✅" } else { "⚠️" };
    let title = if ok {
        "Calendar connected"
    } else {
        "Connection failed"
    };
    let delay = if ok { 1200 } else { 4000 };
    let message = escape_html(message);
    let html = format!(
        r#"<!doctype html><html><head><meta charset="utf-8"><title>Calendar connection</title>
<style>body{{font-family:system-ui,sans-serif;background:#0b0b0f;color:#e5e7eb;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}}.card{{text-align:center;max-width:380px;padding:24px}}.icon{{font-size:48px}}.msg{{margin-top:12px;color:{color}}}</style></head>
<body><div class="card"><div class="icon">{icon}</div><h2>{title}</h2><p class="msg">{message}</p><p style="color:#9ca3af;font-size:13px">You can close this window.</p></div>
<script>try{{window.opener&&window.opener.postMessage({{type:'jait-calendar-oauth',ok:{ok}}},'*')}}catch(e){{}}setTimeout(function(){{window.close()}},{delay})</script></body></html>"#
    );
    (
        [(axum::http::header::CONTENT_TYPE, "text/html; charset=utf-8")],
        html,
    )
        .into_response()
}
fn parse_int(s: &str) -> Value {
    let s = js_trim(s);
    let (negative, digits) = if let Some(s) = s.strip_prefix('-') {
        (true, s)
    } else {
        (false, s.strip_prefix('+').unwrap_or(s))
    };
    let digits: String = digits.chars().take_while(char::is_ascii_digit).collect();
    match digits.parse::<f64>() {
        Ok(v) if v.is_infinite() => json!(if negative { "-Infinity" } else { "Infinity" }),
        Ok(v) => json!(if negative { -v } else { v }),
        Err(_) => json!("NaN"),
    }
}
fn query_value(query: &str, name: &str) -> Option<String> {
    let values = url::form_urlencoded::parse(query.as_bytes())
        .filter(|(k, _)| k == name)
        .map(|(_, v)| v.into_owned())
        .collect::<Vec<_>>();
    if values.len() == 1 {
        values.into_iter().next()
    } else if values.is_empty() {
        None
    } else {
        Some(values.join(","))
    }
}
fn server_error(message: &str) -> Response {
    response(
        500,
        json!({"statusCode":500,"error":"Internal Server Error","message":message}),
    )
}
fn failure(e: &crate::services::calendar::service::Error) -> Response {
    if let Some(rusqlite::Error::SqliteFailure(code, Some(message))) =
        e.downcast_ref::<rusqlite::Error>()
    {
        let code = match code.extended_code {
            1811 => "SQLITE_CONSTRAINT_TRIGGER",
            1555 => "SQLITE_CONSTRAINT_PRIMARYKEY",
            2067 => "SQLITE_CONSTRAINT_UNIQUE",
            1299 => "SQLITE_CONSTRAINT_NOTNULL",
            787 => "SQLITE_CONSTRAINT_FOREIGNKEY",
            275 => "SQLITE_CONSTRAINT_CHECK",
            19 => "SQLITE_CONSTRAINT",
            1 => "SQLITE_ERROR",
            8 => "SQLITE_READONLY",
            5 => "SQLITE_BUSY",
            6 => "SQLITE_LOCKED",
            10 => "SQLITE_IOERR",
            11 => "SQLITE_CORRUPT",
            13 => "SQLITE_FULL",
            14 => "SQLITE_CANTOPEN",
            _ => return server_error(message),
        };
        return response(
            500,
            json!({"statusCode":500,"code":code,"error":"Internal Server Error","message":message}),
        );
    }
    server_error(&e.to_string())
}
fn trim_error(key: &str) -> Response {
    server_error(&format!(
        "body.{key}?.trim is not a function. (In 'body.{key}?.trim()', 'body.{key}?.trim' is undefined)"
    ))
}
fn field_string<'a>(body: &'a Value, key: &str) -> Result<&'a str, ()> {
    match body.get(key) {
        None | Some(Value::Null) => Ok(""),
        Some(Value::String(v)) => Ok(js_trim(v)),
        _ => Err(()),
    }
}
async fn handle(state: State<CalendarRoutes>, request: Request) -> Response {
    let mut result = dispatch(state, request).await;
    if result
        .headers()
        .get(axum::http::header::CONTENT_TYPE)
        .is_some_and(|v| v == "application/json")
    {
        result.headers_mut().insert(
            axum::http::header::CONTENT_TYPE,
            "application/json; charset=utf-8".parse().unwrap(),
        );
    }
    result
}
async fn dispatch(State(state): State<CalendarRoutes>, request: Request) -> Response {
    let headers = request.headers().clone();
    let path = request.uri().path().to_owned();
    let query = request.uri().query().unwrap_or("").to_owned();
    let q = |name| query_value(&query, name);
    if path == "/api/calendar/oauth/callback" {
        if !state.auth.origin_allowed(&headers) {
            return response(403, json!({"error":"ORIGIN_FORBIDDEN"}));
        }
        if let Some(error) = q("error").filter(|s| !s.is_empty()) {
            return callback_html(&q("error_description").unwrap_or(error), false);
        }
        let code = q("code").filter(|s| !s.is_empty());
        let token = q("state").filter(|s| !s.is_empty());
        let (Some(code), Some(token)) = (code, token) else {
            return callback_html("Missing authorization code.", false);
        };
        return match state.calendar.complete_connect(&code, &token).await {
            Ok(account) => callback_html(
                &format!(
                    "Connected {}.",
                    account["email"].as_str().unwrap_or("undefined")
                ),
                true,
            ),
            Err(e) => callback_html(&e.to_string(), false),
        };
    }
    let user = match auth::require_user(&state.auth, &headers).await {
        Ok(u) => u,
        Err(r) => return *r,
    };
    let body = match auth::parse_body(request.into_body(), &headers).await {
        Ok(v) => v,
        Err(r) => return *r,
    };
    let user = Some(user.id.as_str());
    let result = match path.as_str() {
        "/api/calendar/config" => state.calendar.is_configured(user).await.map(|configured|json!({"providers":{"google":configured},"redirectUri":state.redirect_uri(&headers)})),
        "/api/calendar/config/google" => {
            let Ok(id) = field_string(&body,"clientId") else {return trim_error("clientId")};
            if id.is_empty() {return response(400,json!({"error":"clientId and clientSecret are required"}));}
            let Ok(secret) = field_string(&body,"clientSecret") else {return trim_error("clientSecret")};
            if id.is_empty() || secret.is_empty() {return response(400,json!({"error":"clientId and clientSecret are required"}));}
            state.calendar.save_app_credentials(user,CalendarOAuthCredentials{client_id:id.into(),client_secret:secret.into()}).await.map(|_|json!({"ok":true}))
        }
        "/api/calendar/accounts" => state.calendar.list_accounts(user).await.map(|accounts|json!({"accounts":accounts})),
        "/api/calendar/device/sync" => {
            let Ok(id) = field_string(&body,"deviceId") else {return trim_error("deviceId")};
            let (Some(calendars),Some(events)) = (body["calendars"].as_array(),body["events"].as_array()) else {return response(400,json!({"error":"deviceId, calendars, and events are required"}))};
            if id.is_empty() {return response(400,json!({"error":"deviceId, calendars, and events are required"}));}
            if calendars.len()>500 || events.len()>5000 {return response(400,json!({"error":"Calendar snapshot is too large"}));}
            let Ok(name) = field_string(&body,"deviceName") else {return trim_error("deviceName")};
            state.calendar.sync_device_calendar(user,&json!({"deviceId":id,"deviceName":if name.is_empty(){"Android device"}else{name},"calendars":calendars,"events":events})).await.map(|account|json!({"account":account}))
        }
        "/api/calendar/connect/google" => return match state.calendar.start_connect(user,&state.redirect_uri(&headers)).await {Ok(v)=>response(200,v),Err(e)=>response(400,json!({"error":e.to_string()}))},
        "/api/calendar/calendars" => return match state.calendar.list_calendars(user,q("accountId").as_deref()).await {Ok(v)=>response(200,v),Err(e)=>response(400,json!({"error":e.to_string()}))},
        "/api/calendar/events" => {
            let mut options = json!({});
            for (key,param) in [("calendarId","calendarId"),("timeMin","timeMin"),("timeMax","timeMax"),("query","q")] {
                if let Some(v)=q(param) {options[key]=json!(v);}
            }
            if let Some(v)=q("limit").filter(|s|!s.is_empty()) {
                options["limit"]=json!(parse_int(&v));
            }
            return match state.calendar.list_events(user,q("accountId").as_deref(),&options).await {Ok(v)=>response(200,v),Err(e)=>response(400,json!({"error":e.to_string()}))};
        }
        _ => {
            let id = path.trim_start_matches("/api/calendar/accounts/");
            let id = percent_encoding::percent_decode_str(id).decode_utf8_lossy();
            return match state.calendar.disconnect(user,&id).await {
                Ok(true)=>response(200,json!({"ok":true})),Ok(false)=>response(404,json!({"error":"Account not found"})),Err(e)=>failure(&e)
            };
        }
    };
    match result {
        Ok(v) => response(200, v),
        Err(e) => failure(&e),
    }
}
