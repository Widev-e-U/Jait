//! Explicitly mounted email API. Runtime composition and disconnect supervision
//! remain host responsibilities; no production router is changed by this module.
use crate::{
    routes::auth::{self, AuthState, response},
    services::email::{
        EmailService, connection,
        contracts::*,
        oauth::OAuthClientCredentials,
        remote_images::{self, ImageResolver, ImageTransport},
    },
    text::js_trim,
};
use axum::{
    Router,
    body::to_bytes,
    extract::{Request, State},
    http::HeaderMap,
    response::{IntoResponse, Response},
    routing::{get, post},
};
use serde_json::{Value, json};
use std::{
    collections::{HashMap, HashSet},
    sync::Arc,
};
#[derive(Clone)]
pub struct EmailRoutes {
    pub auth: AuthState,
    pub email: Arc<EmailService>,
    pub public_base: Option<String>,
    pub image_resolver: ImageResolver,
    pub image_transport: ImageTransport,
}
impl EmailRoutes {
    pub fn router(self) -> Router {
        Router::new()
            .route("/api/email/config", get(handle))
            .route("/api/email/config/{provider}", post(handle))
            .route("/api/email/accounts", get(handle).post(handle))
            .route(
                "/api/email/accounts/{id}",
                axum::routing::patch(handle).delete(handle),
            )
            .route("/api/email/discover", get(handle))
            .route("/api/email/connect/{provider}", get(handle))
            .route("/api/email/oauth/callback", get(handle))
            .route("/api/email/messages", get(handle))
            .route("/api/email/images", post(handle))
            .route("/api/email/messages/{id}", get(handle))
            .route("/api/email/messages/{id}/tag", post(handle))
            .route("/api/email/messages/{id}/delete", post(handle))
            .route("/api/email/send", post(handle))
            .route("/api/email/folders", get(handle))
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
            return format!("{base}/api/email/oauth/callback");
        }
        let h = |k| headers.get(k).and_then(|v| v.to_str().ok());
        format!(
            "{}://{}/api/email/oauth/callback",
            h("x-forwarded-proto").unwrap_or("http"),
            h("x-forwarded-host")
                .or_else(|| h("host"))
                .unwrap_or("undefined")
        )
    }
}
fn error(status: u16, message: impl ToString) -> Response {
    response(status, json!({"error":message.to_string()}))
}
fn provider(s: &str) -> Option<OAuthEmailProvider> {
    match s {
        "gmail" => Some(OAuthEmailProvider::Gmail),
        "outlook" => Some(OAuthEmailProvider::Outlook),
        _ => None,
    }
}
fn callback_html(message: &str, ok: bool) -> Response {
    let message = message
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;");
    let title = if ok {
        "Mailbox connected"
    } else {
        "Connection failed"
    };
    let color = if ok { "#34d399" } else { "#f87171" };
    let icon = if ok { "✅" } else { "⚠️" };
    let delay = if ok { 1200 } else { 4000 };
    ([(axum::http::header::CONTENT_TYPE,"text/html; charset=utf-8")],format!(r#"<!doctype html><html><head><meta charset="utf-8"><title>Email connection</title><style>body{{font-family:system-ui,sans-serif;background:#0b0b0f;color:#e5e7eb;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}}.card{{text-align:center;max-width:360px;padding:24px}}.icon{{font-size:48px}}.msg{{margin-top:12px;color:{color}}}</style></head><body><div class="card"><div class="icon">{icon}</div><h2>{title}</h2><p class="msg">{message}</p><p style="color:#9ca3af;font-size:13px">You can close this window.</p></div><script>try{{window.opener&&window.opener.postMessage({{type:'jait-email-oauth',ok:{ok}}},'*')}}catch(e){{}}setTimeout(function(){{window.close()}},{delay})</script></body></html>"#)).into_response()
}
fn path_segment(s: &str) -> Result<String, String> {
    percent_encoding::percent_decode_str(s)
        .decode_utf8()
        .map(|s| s.into_owned())
        .map_err(|_| "Invalid email path".into())
}
fn labels(body: &Value, key: &str) -> Result<Vec<String>, String> {
    match body.get(key) {
        None | Some(Value::Null) => Ok(vec![]),
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
async fn handle(state: State<EmailRoutes>, request: Request) -> Response {
    match tokio::time::timeout(std::time::Duration::from_secs(60), dispatch(state, request)).await {
        Ok(mut result) => {
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
        Err(_) => error(
            504,
            "Email request timed out; any in-flight send may have completed",
        ),
    }
}
async fn dispatch(State(state): State<EmailRoutes>, request: Request) -> Response {
    let headers = request.headers().clone();
    let path = request.uri().path().to_string();
    let method = request.method().clone();
    let query: HashMap<String, String> =
        url::form_urlencoded::parse(request.uri().query().unwrap_or("").as_bytes())
            .into_owned()
            .collect();
    let q = |key: &str| query.get(key).map(String::as_str);
    if path == "/api/email/oauth/callback" {
        if !state.auth.origin_allowed(&headers) {
            return error(403, "ORIGIN_FORBIDDEN");
        }
        if let Some(e) = q("error").filter(|s| !s.is_empty()) {
            return callback_html(q("error_description").unwrap_or(e), false);
        }
        let (Some(code), Some(token)) = (
            q("code").filter(|s| !s.is_empty()),
            q("state").filter(|s| !s.is_empty()),
        ) else {
            return callback_html("Missing authorization code.", false);
        };
        return match state.email.complete_connect(code, token).await {
            Ok(a) => callback_html(&format!("Connected {}.", a.email), true),
            Err(e) => callback_html(&e.to_string(), false),
        };
    }
    let user = match auth::require_user(&state.auth, &headers).await {
        Ok(u) => u,
        Err(r) => return *r,
    };
    let user = Some(user.id.as_str());
    let body = match to_bytes(request.into_body(), 12 * 1024 * 1024).await {
        Ok(b) if b.is_empty() => json!({}),
        Ok(b) => match serde_json::from_slice::<Value>(&b) {
            Ok(v) => v,
            Err(_) => return error(400, "Invalid JSON body"),
        },
        Err(_) => return error(413, "Email request is too large"),
    };
    let account = body
        .get("accountId")
        .and_then(Value::as_str)
        .or_else(|| q("accountId"));
    let result: Result<Value, crate::services::email::service::Error> = async {
        match path.as_str(){
            "/api/email/config"=>Ok(json!({"providers":state.email.configured_providers(user).await?})),
            "/api/email/accounts" if method==axum::http::Method::GET=>Ok(json!({"accounts":state.email.list_accounts(user).await?})),
            "/api/email/accounts"=>{
                connection::connect_mailbox(body.clone()).map_err(|_| "Valid email, IMAP and SMTP credentials are required (TLS or STARTTLS).")?;
                Ok(json!({"account":state.email.connect_mailbox(user,body.clone()).await?}))
            },
            "/api/email/discover"=>{let _permit = state.email.operation_permit()?; Ok(serde_json::to_value(connection::discover_mail_settings(q("email").ok_or("Email is required")?).await.map_err(|_| "Automatic settings unavailable. Enter your provider's IMAP and SMTP settings.")?)?)},
            "/api/email/messages"=>{
                let limit=q("limit").filter(|s|!s.is_empty()).map(|s|{let s=js_trim(s);let mut prefix=String::new();for(i,c)in s.chars().enumerate(){if c.is_ascii_digit() || i==0 && (c=='-' || c=='+'){prefix.push(c);}else{break;}}prefix.parse::<f64>().unwrap_or(f64::NAN)});
                state.email.list_messages(user,q("accountId"),ListMessagesOptions{folder:q("folder").map(String::from),query:q("q").map(String::from),limit}).await
            },
            "/api/email/images"=>{
                let _permit = state.email.operation_permit()?;
                let id=body["accountId"].as_str().ok_or("Invalid image request")?;
                let urls=body["urls"].as_array().filter(|a|a.len()<=12).ok_or("Invalid image request")?;
                let urls=urls.iter().map(|u|u.as_str().filter(|s|s.encode_utf16().count()<=4096).ok_or("Invalid image request")).collect::<Result<Vec<_>,_>>()?;
                if state.email.get_account(user,id).await?.is_none(){return Err("Account not found".into());}
                let mut seen=HashSet::new();let mut images=serde_json::Map::new();
                for url in urls{if seen.insert(url)&&let Ok(data)=remote_images::load_mail_image_with(url,&state.image_resolver,&state.image_transport).await{images.insert(url.into(),json!(data));}}
                Ok(json!({"images":images}))
            },
            "/api/email/send"=>{
                if body["to"].as_str().unwrap_or("").is_empty() && body["replyToMessageId"].as_str().unwrap_or("").is_empty() { return Err("A recipient is required".into()); }
                let mut input=serde_json::Map::new();
                for key in ["to","subject","body","cc","bcc","replyToMessageId","html","includeSignature"] { if let Some(v)=body.get(key) { input.insert(key.into(),v.clone()); } }
                for key in ["to","subject","body"]{if !input.contains_key(key){input.insert(key.into(),json!(""));}}
                let sent=state.email.send_message(user,account,Value::Object(input)).await?;Ok(json!({"ok":true,"id":sent.id}))
            },
            "/api/email/folders"=>Ok(json!({"folders":state.email.list_folders(user,q("accountId")).await?})),
            _=>{
                if let Some(p)=path.strip_prefix("/api/email/config/"){
                    let p=provider(p).ok_or("Unknown provider")?;
                    let id=body["clientId"].as_str().ok_or("clientId and clientSecret are required")?.trim_matches(crate::text::js_whitespace);let secret=body["clientSecret"].as_str().ok_or("clientId and clientSecret are required")?.trim_matches(crate::text::js_whitespace);
                    if id.is_empty()!=secret.is_empty(){return Err("clientId and clientSecret are required".into());}
                    state.email.save_app_credentials(user,p,OAuthClientCredentials{client_id:id.into(),client_secret:secret.into()}).await?;return Ok(json!({"ok":true}));
                }
                if let Some(p)=path.strip_prefix("/api/email/connect/"){return state.email.start_connect(user,provider(p).ok_or("Unknown provider")?,&state.redirect_uri(&headers)).await;}
                if let Some(id)=path.strip_prefix("/api/email/accounts/"){
                    let id=path_segment(id)?;
                    if method==axum::http::Method::DELETE{if !state.email.disconnect(user,&id).await?{return Err("Account not found".into());}return Ok(json!({"ok":true}));}
                    if state.email.get_account(user,&id).await?.is_none() { return Err("Account not found".into()); }
                    connection::account_settings(body.clone()).map_err(|_| "Invalid account settings")?;
                    return Ok(json!({"account":state.email.update_account(user,&id,body.clone()).await?}));
                }
                if let Some(rest)=path.strip_prefix("/api/email/messages/"){
                    if let Some(id)=rest.strip_suffix("/tag"){state.email.tag_message(user,account,&path_segment(id)?,labels(&body,"add")?,labels(&body,"remove")?).await?;return Ok(json!({"ok":true}));}
                    if let Some(id)=rest.strip_suffix("/delete"){state.email.delete_message(user,account,&path_segment(id)?).await?;return Ok(json!({"ok":true}));}
                    return Ok(json!({"message":state.email.get_message(user,q("accountId"),&path_segment(rest)?).await?}));
                }
                Err("Unknown email route".into())
            }
        }
    }.await;
    match result {
        Ok(data) => response(200, data),
        Err(e) => error(
            if e.to_string() == "Account not found" {
                404
            } else {
                400
            },
            e,
        ),
    }
}
