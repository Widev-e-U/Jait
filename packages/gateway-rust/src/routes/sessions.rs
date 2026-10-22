//! Authenticated session HTTP routes. Storage runs on the bounded database worker;
//! live chat, device transport, hooks and title generation use explicit adapters.
use super::auth::{self, AuthState, Error, response};
use crate::{
    security::http_auth::AuthUser,
    services::{
        audit::{AuditEntry, AuditWriter},
        json_state::SessionStateService,
        projects::{CreateProject, ProjectService},
        sessions::{CreateSession, SessionFilter, SessionRecord, SessionService},
        thread_title::normalize_generated_thread_title,
        users::{UserService, UserSettings},
    },
};
use axum::{
    Router,
    extract::{Request, State},
    http::Method,
    response::Response,
    routing::{any, get, post},
};
use serde_json::{Map, Value, json};
use std::{collections::BTreeMap, future::Future, pin::Pin, sync::Arc};
#[derive(Clone, Debug)]
pub struct SessionNode {
    pub id: String,
    pub is_gateway: bool,
}
pub struct TitleRequest {
    pub prompt: String,
    pub model: Option<String>,
    pub settings: Option<UserSettings>,
}
pub type TitleFuture<'a> = Pin<Box<dyn Future<Output = Result<String, String>> + Send + 'a>>;
/// Callbacks must not block. Title transport runs outside the database worker.
/// The title adapter returns a normalized title (the TypeScript API contract).
pub trait SessionRuntime: Send + Sync {
    fn turn_active(&self, _session: &str) -> bool {
        false
    }
    fn nodes(&self) -> Vec<SessionNode> {
        vec![]
    }
    fn can_access_node(&self, _node: &str, _user: &str) -> bool {
        false
    }
    fn broadcast(&self, _user: &str, _event: Value) {}
    fn hook(&self, _event: &str, _data: Value) {}
    fn title(&self, _request: TitleRequest) -> TitleFuture<'_> {
        Box::pin(async { Err("Title transport unavailable".into()) })
    }
    fn title_warning(&self, _session: &str, _model: Option<&str>, _error: &str) {}
}
struct NoRuntime;
impl SessionRuntime for NoRuntime {}
#[derive(Clone)]
pub struct SessionRoutes {
    pub auth: AuthState,
    pub runtime: Arc<dyn SessionRuntime>,
    pub projects: bool,
    pub session_state: bool,
    pub user_settings: bool,
    /// Explicit fallback; no implicit filesystem or credential discovery.
    pub project_root: String,
    pub time: Option<String>,
}
impl SessionRoutes {
    pub fn new(auth: AuthState, project_root: String) -> Self {
        Self {
            auth,
            runtime: Arc::new(NoRuntime),
            projects: true,
            session_state: true,
            user_settings: true,
            project_root,
            time: None,
        }
    }
    pub fn router(self) -> Router {
        let state = self.session_state;
        let mut router = Router::new()
            .route("/api/sessions", get(handle).post(handle))
            .route("/api/sessions/last-active", get(handle))
            .route(
                "/api/sessions/{id}",
                get(handle).patch(handle).delete(handle),
            )
            .route("/api/sessions/{id}/archive", post(handle))
            .route("/api/sessions/{id}/viewed", post(handle))
            .route("/api/sessions/{id}/move", post(handle))
            .route("/api/sessions/{id}/generate-title", post(handle))
            .route("/api/tools/sessions.list", get(handle))
            .route("/api/tools/sessions.status", get(handle));
        router = router.route(
            "/api/sessions/{id}/state",
            if state {
                get(handle).patch(handle)
            } else {
                any(not_found)
            },
        );
        router
            .route("/api/sessions/{id}/{*rest}", any(not_found))
            .method_not_allowed_fallback(not_found)
            .with_state(self)
    }
    fn event(&self, user: &str, event: &str, data: Value, now: &str) {
        self.runtime.broadcast(
            user,
            json!({"type":format!("chat.{event}"),"sessionId":"","timestamp":now,"payload":data}),
        );
    }
}
fn parser_error(error: Response) -> Response {
    if error.status() == 415 {
        response(
            415,
            json!({"statusCode":415,"code":"FST_ERR_CTP_INVALID_MEDIA_TYPE","error":"Unsupported Media Type","message":"Unsupported Media Type"}),
        )
    } else {
        error
    }
}
async fn not_found(State(state): State<SessionRoutes>, request: Request) -> Response {
    if let Err(error) = auth::require_user(&state.auth, request.headers()).await {
        return *error;
    }
    let headers = request.headers().clone();
    if let Err(error) = auth::parse_body(request.into_body(), &headers).await {
        return parser_error(*error);
    }
    response(404, json!({"error":"Not Found"}))
}
#[derive(Default)]
struct Query(BTreeMap<String, Vec<String>>);
impl Query {
    fn parse(raw: &str) -> Self {
        let mut result = Self::default();
        for (k, v) in url::form_urlencoded::parse(raw.as_bytes()) {
            result
                .0
                .entry(k.into_owned())
                .or_default()
                .push(v.into_owned());
        }
        result
    }
    fn get(&self, key: &str) -> Option<&str> {
        self.0
            .get(key)
            .filter(|v| v.len() == 1)
            .map(|v| v[0].as_str())
    }
}
fn now(db: &rusqlite::Connection, state: &SessionRoutes) -> Result<String, Error> {
    Ok(match &state.time {
        Some(now) => now.clone(),
        None => db.query_row("SELECT strftime('%Y-%m-%dT%H:%M:%fZ','now')", [], |r| {
            r.get(0)
        })?,
    })
}
fn missing(thing: &str) -> Response {
    response(
        404,
        json!({"error":"NOT_FOUND","details":format!("{thing} not found")}),
    )
}
fn truthy_id(id: Option<&str>) -> Option<&str> {
    id.filter(|v| !v.is_empty())
}
fn value_string(body: &Value, key: &str) -> Option<String> {
    body[key].as_str().map(String::from)
}
fn new_audit(db: &rusqlite::Connection, now: &str, id: &str, kind: &str) -> Result<(), Error> {
    AuditWriter::with_time(db, now).write(AuditEntry {
        session_id: Some(id.into()),
        action_id: crate::db::identifiers::uuidv7().to_string(),
        action_type: format!("session.{kind}"),
        status: "executed".into(),
        consent_method: Some("auto".into()),
        ..Default::default()
    })?;
    Ok(())
}
async fn handle(State(state): State<SessionRoutes>, request: Request) -> Response {
    let headers = request.headers().clone();
    if !state.auth.origin_allowed(&headers) {
        return response(403, json!({"error":"ORIGIN_FORBIDDEN"}));
    }
    let Some(user) = state.auth.resolve_user(&headers) else {
        return auth::denied();
    };
    let owner = user.id.clone();
    match state
        .auth
        .with_database(move |db| Ok(UserService::new(db).find_by_id(&owner)?.is_some()))
        .await
    {
        Ok(true) => {}
        Ok(false) => return auth::denied(),
        Err(e) => return auth::database_failure(&e),
    }
    let method = if request.method() == Method::HEAD {
        Method::GET
    } else {
        request.method().clone()
    };
    let path = request.uri().path().to_string();
    let query = Query::parse(request.uri().query().unwrap_or(""));
    let body = match auth::parse_body(request.into_body(), &headers).await {
        Ok(v) => v,
        Err(r) => return parser_error(*r),
    };
    if path.ends_with("/generate-title") {
        let encoded = path
            .trim_start_matches("/api/sessions/")
            .trim_end_matches("/generate-title");
        let id = percent_encoding::percent_decode_str(encoded)
            .decode_utf8_lossy()
            .into_owned();
        return title(state, user, id, body).await;
    }
    let worker = state.clone();
    match state
        .auth
        .with_database(move |db| dispatch(&worker, db, &user, method, &path, query, body))
        .await
    {
        Ok(r) => r,
        Err(e) => session_error(&e),
    }
}
fn dispatch(
    state: &SessionRoutes,
    db: &rusqlite::Connection,
    user: &AuthUser,
    method: Method,
    path: &str,
    query: Query,
    body: Value,
) -> Result<Response, Error> {
    let now = now(db, state)?;
    let sessions = SessionService::with_time(db, &now);
    let projects = ProjectService::with_time(db, &now);
    let owner = Some(user.id.as_str());
    if path == "/api/tools/sessions.list" {
        return Ok(response(
            200,
            json!({"sessions":sessions.list(SessionFilter{status:Some("active"),..Default::default()})?}),
        ));
    }
    if path == "/api/tools/sessions.status" {
        let Some(id) = truthy_id(query.get("sessionId")) else {
            return Ok(response(
                400,
                json!({"error":"VALIDATION_ERROR","details":"sessionId query param required"}),
            ));
        };
        return Ok(match sessions.get(id, None)? {
            Some(s) => response(200, json!(s)),
            None => missing("Session"),
        });
    }
    if path == "/api/sessions" {
        if method == Method::GET {
            let limit = query.get("limit").and_then(parse_limit);
            let mut list = sessions.list(SessionFilter {
                status: query.get("status"),
                user_id: owner,
                personal_only: query.get("personal") == Some("true"),
                limit: limit.map(|v| (v + 1) as f64),
                ..Default::default()
            })?;
            let more = limit.is_some_and(|v| list.len() > v);
            if let Some(limit) = limit {
                list.truncate(limit);
            }
            return Ok(response(200, json!({"sessions":list,"hasMore":more})));
        }
        let mut project_id = value_string(&body, "projectId");
        if let Some(id) = truthy_id(project_id.as_deref()) {
            if !state.projects || projects.get(id, owner)?.is_none() {
                return Ok(missing("Project"));
            }
        } else if state.projects
            && body["projectPath"]
                .as_str()
                .is_some_and(|v| !crate::text::js_trim(v).is_empty())
        {
            let p = projects.get_or_create_for_root(CreateProject {
                user_id: Some(user.id.clone()),
                title: value_string(&body, "projectTitle"),
                root_path: value_string(&body, "projectPath"),
                node_id: Some(value_string(&body, "nodeId").unwrap_or("gateway".into())),
                ..Default::default()
            })?;
            project_id = Some(p.id);
        }
        let s = sessions.create(CreateSession {
            user_id: Some(user.id.clone()),
            project_id,
            name: value_string(&body, "name"),
            project_path: value_string(&body, "projectPath"),
            ..Default::default()
        })?;
        new_audit(db, &now, &s.id, "create")?;
        state.runtime.hook("session.start",json!({"sessionId":s.id,"projectRoot":s.project_path.as_deref().unwrap_or(&state.project_root)}));
        if let Some(id) = truthy_id(s.project_id.as_deref()).filter(|_| state.projects) {
            projects.touch(id)?;
        }
        state.event(
            &user.id,
            "created",
            json!({"projectId":s.project_id,"session":s}),
            &now,
        );
        return Ok(response(201, json!(s)));
    }
    if path == "/api/sessions/last-active" {
        return Ok(response(
            200,
            json!({"session":sessions.last_active(owner)?}),
        ));
    }
    let remainder = path.trim_start_matches("/api/sessions/");
    let (encoded, operation) = remainder.split_once('/').unwrap_or((remainder, ""));
    let id = percent_encoding::percent_decode_str(encoded).decode_utf8_lossy();
    if id == "messages" && operation.is_empty() && method == Method::GET {
        return Ok(response(404, json!({"error":"Not Found"})));
    }
    if operation == "move" && !matches!(body.get("projectId"), Some(Value::Null | Value::String(_)))
    {
        return Ok(response(
            400,
            json!({"error":"VALIDATION_ERROR","details":"projectId must be a project id or null"}),
        ));
    }
    let Some(session) = sessions.get(&id, owner)? else {
        return Ok(missing("Session"));
    };
    Ok(match (method.as_str(), operation) {
        ("GET", "") => response(200, json!(session)),
        ("PATCH", "") => {
            if !matches!(body, Value::Null | Value::Object(_) | Value::Array(_)) {
                return Ok(response(
                    500,
                    json!({"statusCode":500,"error":"Internal Server Error","message":"body is not an Object. (evaluating '\"nodeId\" in body')"}),
                ));
            }
            if body.get("nodeId").is_some() {
                if state.runtime.turn_active(&id) {
                    return Ok(response(
                        409,
                        json!({"error":"CHAT_BUSY","details":"Wait for the current turn to finish before changing devices"}),
                    ));
                }
                if truthy_id(session.project_id.as_deref()).is_some() {
                    return Ok(response(
                        400,
                        json!({"error":"PROJECT_NODE_FIXED","details":"Project chats use the project's location"}),
                    ));
                }
                let Some(node) = body["nodeId"].as_str().filter(|v| {
                    !crate::text::js_trim(v).is_empty() && v.encode_utf16().count() <= 200
                }) else {
                    return Ok(response(400, json!({"error":"INVALID_NODE"})));
                };
                let node = crate::text::js_trim(node);
                if node != "gateway"
                    && !state
                        .runtime
                        .nodes()
                        .iter()
                        .any(|v| v.id == node && !v.is_gateway)
                {
                    return Ok(response(
                        400,
                        json!({"error":"NODE_UNAVAILABLE","details":"The selected node is not connected"}),
                    ));
                }
                if node != "gateway" && !state.runtime.can_access_node(node, &user.id) {
                    return Ok(response(
                        403,
                        json!({"error":"NODE_FORBIDDEN","details":"The selected node does not belong to this user"}),
                    ));
                }
                sessions.update_chat_selection(
                    &id,
                    json!({"nodeId":node}).as_object().unwrap(),
                    owner,
                )?;
            }
            let mut patch = Map::new();
            if let Some(name) = body["name"].as_str() {
                patch.insert("name".into(), json!(name));
            }
            sessions.update(&id, &patch, owner)?;
            if ["provider", "model", "reasoningEffort"]
                .iter()
                .any(|k| body.get(*k).is_some())
            {
                let mut selection = Map::new();
                for key in ["provider", "model", "reasoningEffort"] {
                    if let Some(v @ (Value::Null | Value::String(_))) = body.get(key) {
                        selection.insert(key.into(), v.clone());
                    }
                }
                sessions.update_chat_selection(&id, &selection, owner)?;
            }
            let updated = sessions.get(&id, owner)?;
            state.event(
                &user.id,
                "updated",
                json!({"projectId":session.project_id,"session":updated}),
                &now,
            );
            response(200, json!(updated))
        }
        ("POST", "viewed") => {
            if let Some(observed) = body.get("lastActiveAt") {
                let valid = observed.as_str().is_some_and(|s| {
                    crate::services::subscription_usage_fetchers::js_date_parse(s).is_some()
                });
                if !valid {
                    return Ok(response(400, json!({"error":"INVALID_TIMESTAMP"})));
                }
            }
            sessions.mark_viewed(&id, owner, body["lastActiveAt"].as_str())?;
            let updated = sessions.get(&id, owner)?;
            if updated.as_ref().and_then(|v| v.viewed_at.as_ref()) != session.viewed_at.as_ref() {
                state.event(&user.id, "updated", json!({"session":updated}), &now);
            }
            response(200, json!({"ok":true,"session":updated}))
        }
        ("DELETE", "") => {
            sessions.set_status(&id, "deleted", owner)?;
            new_audit(db, &now, &id, "delete")?;
            state.event(
                &user.id,
                "deleted",
                json!({"projectId":session.project_id,"sessionId":id}),
                &now,
            );
            response(200, json!({"ok":true}))
        }
        ("POST", "archive") => {
            sessions.set_status(&id, "archived", owner)?;
            state.runtime.hook("session.end", json!({"sessionId":id}));
            state.event(
                &user.id,
                "archived",
                json!({"projectId":session.project_id,"sessionId":id}),
                &now,
            );
            response(200, json!(sessions.get(&id, owner)?))
        }
        ("POST", "move") => {
            let target = truthy_id(body["projectId"].as_str());
            let target_project = if let Some(target) = target {
                let p = if state.projects {
                    projects.get(target, owner)?
                } else {
                    None
                };
                if p.is_none() {
                    return Ok(missing("Project"));
                }
                p
            } else {
                None
            };
            let from = session.project_id.as_deref();
            if from == target {
                return Ok(response(
                    200,
                    json!({"ok":true,"moved":false,"session":session,"fromProjectId":from,"toProjectId":target}),
                ));
            }
            let updated = sessions.move_to_project(
                &id,
                target,
                target_project.as_ref().and_then(|p| p.root_path.as_deref()),
                owner,
            )?;
            if let Some(target) = target {
                projects.touch(target)?;
            }
            new_audit(db, &now, &id, "move")?;
            state.event(&user.id,"moved",json!({"fromProjectId":from,"toProjectId":target,"projectId":target,"sessionId":id,"session":updated}),&now);
            response(
                200,
                json!({"ok":true,"moved":true,"session":updated,"fromProjectId":from,"toProjectId":target}),
            )
        }
        ("GET", "state") => {
            let keys = query.get("keys").filter(|v| !v.is_empty()).map(|v| {
                v.split(',')
                    .map(crate::text::js_trim)
                    .filter(|v| !v.is_empty())
                    .map(String::from)
                    .collect::<Vec<_>>()
            });
            response(
                200,
                json!(SessionStateService::with_time(db, &now).get(&id, keys.as_deref())?),
            )
        }
        ("PATCH", "state") => {
            let empty = Map::new();
            let entries = if body.is_null() {
                &empty
            } else {
                let Some(entries) = body.as_object() else {
                    return Ok(response(
                        400,
                        json!({"error":"VALIDATION_ERROR","details":"Body must be a JSON object of key→value pairs"}),
                    ));
                };
                entries
            };
            SessionStateService::with_time(db, &now).set(&id, entries)?;
            response(200, json!({"ok":true}))
        }
        _ => response(404, json!({"error":"Not Found"})),
    })
}
fn parse_limit(value: &str) -> Option<usize> {
    let s = crate::text::js_trim(value);
    let (negative, remaining) = if let Some(s) = s.strip_prefix('-') {
        (true, s)
    } else {
        (false, s.strip_prefix('+').unwrap_or(s))
    };
    let count = remaining.bytes().take_while(u8::is_ascii_digit).count();
    if negative || count == 0 {
        return None;
    }
    let n = remaining[..count].parse::<f64>().ok()?;
    if !n.is_finite() || n < 1.0 {
        None
    } else {
        Some(n.min(100.0) as usize)
    }
}
fn user_named(s: &SessionRecord) -> bool {
    let n = crate::text::js_trim(s.name.as_deref().unwrap_or(""));
    !n.is_empty() && n != "New Chat" && !n.starts_with("Session ")
}
async fn title(state: SessionRoutes, user: AuthUser, id: String, body: Value) -> Response {
    let prompt = crate::text::js_trim(body["prompt"].as_str().unwrap_or("")).to_string();
    if prompt.is_empty() {
        return response(
            400,
            json!({"error":"VALIDATION_ERROR","details":"prompt is required"}),
        );
    }
    let owner = user.id.clone();
    let key = id.clone();
    let settings_enabled = state.user_settings;
    let initial = state
        .auth
        .with_database(move |db| {
            let s = SessionService::new(db).get(&key, Some(&owner))?;
            let settings = if s.as_ref().is_some_and(|s| !user_named(s)) && settings_enabled {
                Some(UserService::new(db).get_settings(&owner)?)
            } else {
                None
            };
            Ok((s, settings))
        })
        .await;
    let (session, settings) = match initial {
        Ok((Some(s), settings)) => (s, settings),
        Ok(_) => return missing("Session"),
        Err(e) => return auth::database_failure(&e),
    };
    if user_named(&session) {
        return response(200, json!({"session":session,"generated":false}));
    }
    let model = value_string(&body, "model");
    let (name, generated) = match state
        .runtime
        .title(TitleRequest {
            prompt: prompt.clone(),
            model: model.clone(),
            settings,
        })
        .await
    {
        Ok(title) => (title, true),
        Err(e) => {
            state.runtime.title_warning(&id, model.as_deref(), &e);
            (
                String::from_utf16_lossy(&normalize_generated_thread_title(&prompt, "New Chat").0),
                false,
            )
        }
    };
    let worker = state.clone();
    match state
        .auth
        .with_database(move |db| {
            let now = now(db, &worker)?;
            let sessions = SessionService::with_time(db, &now);
            let latest = sessions.get(&id, Some(&user.id))?;
            if latest.as_ref().is_none_or(user_named) {
                return Ok(response(
                    200,
                    json!({"session":latest.unwrap_or(session),"generated":false}),
                ));
            }
            sessions.update(
                &id,
                json!({"name":name}).as_object().unwrap(),
                Some(&user.id),
            )?;
            let updated = sessions.get(&id, Some(&user.id))?;
            worker.event(
                &user.id,
                "updated",
                json!({"projectId":session.project_id,"session":updated}),
                &now,
            );
            Ok(response(
                200,
                json!({"session":updated,"generated":generated}),
            ))
        })
        .await
    {
        Ok(r) => r,
        Err(e) => session_error(&e),
    }
}

fn session_error(error: &Error) -> Response {
    use crate::db::worker::DatabaseError;
    let cause = match error.downcast_ref::<DatabaseError>() {
        Some(DatabaseError::Operation(cause)) => cause.as_ref(),
        _ => return auth::database_failure(error),
    };
    if let Some(rusqlite::Error::SqliteFailure(code, Some(message))) =
        cause.downcast_ref::<rusqlite::Error>()
    {
        let name = match code.extended_code {
            rusqlite::ffi::SQLITE_CONSTRAINT_TRIGGER => "SQLITE_CONSTRAINT_TRIGGER",
            rusqlite::ffi::SQLITE_CONSTRAINT_PRIMARYKEY => "SQLITE_CONSTRAINT_PRIMARYKEY",
            rusqlite::ffi::SQLITE_CONSTRAINT_UNIQUE => "SQLITE_CONSTRAINT_UNIQUE",
            rusqlite::ffi::SQLITE_CONSTRAINT_NOTNULL => "SQLITE_CONSTRAINT_NOTNULL",
            rusqlite::ffi::SQLITE_CONSTRAINT_FOREIGNKEY => "SQLITE_CONSTRAINT_FOREIGNKEY",
            rusqlite::ffi::SQLITE_ERROR => "SQLITE_ERROR",
            _ => return auth::internal_error(),
        };
        return response(
            500,
            json!({"statusCode":500,"code":name,"error":"Internal Server Error","message":message}),
        );
    }
    auth::database_failure(error)
}
