//! Explicit authenticated reminder HTTP API; SQL runs on the bounded auth DB
//! worker. Optional service ports preserve existing ownership and consent policy.
use super::auth::{self, AuthState, response};
use crate::{
    services::{reminders::*, users::Patch},
    text::js_trim,
};
use axum::{
    Router,
    extract::{Request, State},
    http::Method,
    response::Response,
    routing::{get, patch},
};
use futures_util::future::BoxFuture;
use serde_json::{Value, json};
use std::sync::Arc;
pub type ReminderExtraPort = Arc<
    dyn for<'a> Fn(&'a str, Vec<Value>) -> BoxFuture<'a, std::result::Result<Value, String>>
        + Send
        + Sync,
>;
#[derive(Clone)]
pub struct ReminderRoutes {
    pub auth: AuthState,
    pub memory: Option<ReminderExtraPort>,
    pub projects: Option<ReminderExtraPort>,
    pub sessions: Option<ReminderExtraPort>,
    pub threads: Option<ReminderExtraPort>,
    pub time: Option<String>,
}
impl ReminderRoutes {
    pub fn new(auth: AuthState) -> Self {
        Self {
            auth,
            memory: None,
            projects: None,
            sessions: None,
            threads: None,
            time: None,
        }
    }
    pub fn router(self) -> Router {
        Router::new()
            .route("/api/reminders", get(handle).post(handle))
            .route("/api/reminders/export.md", get(handle))
            .route("/api/reminders/{id}", patch(handle).delete(handle))
            .with_state(self)
    }
    async fn store<T: Send + 'static>(
        &self,
        f: impl for<'a> FnOnce(&ReminderService<'a>) -> Result<T> + Send + 'static,
    ) -> std::result::Result<T, Box<Response>> {
        let now = self.time.clone();
        self.auth
            .with_database(move |db| {
                let s = if let Some(now) = &now {
                    ReminderService::with_time(db, now)
                } else {
                    ReminderService::new(db)
                };
                Ok(f(&s)?)
            })
            .await
            .map_err(|e| Box::new(auth::database_failure(&e)))
    }
}
fn failure(message: &str) -> Response {
    response(
        500,
        json!({"statusCode":500,"error":"Internal Server Error","message":message}),
    )
}
async fn extra(
    p: &ReminderExtraPort,
    method: &str,
    args: Vec<Value>,
) -> std::result::Result<Value, Box<Response>> {
    p(method, args).await.map_err(|e| Box::new(failure(&e)))
}
fn trimmed(v: &Value) -> Option<String> {
    v.as_str()
        .map(js_trim)
        .filter(|s| !s.is_empty())
        .map(str::to_owned)
}
fn tags(v: Option<&Value>) -> Option<Vec<Value>> {
    v.map(|v| {
        let mut seen = std::collections::HashSet::new();
        v.as_array()
            .into_iter()
            .flatten()
            .filter_map(|v| v.as_str().map(|s| js_trim(s).to_lowercase()))
            .filter(|s| !s.is_empty() && seen.insert(s.clone()))
            .take(20)
            .map(Value::String)
            .collect()
    })
}
fn query(q: &str, k: &str) -> Option<String> {
    let values: Vec<_> = url::form_urlencoded::parse(q.as_bytes())
        .filter(|(key, _)| key == k)
        .map(|(_, v)| v.into_owned())
        .collect();
    if values.len() == 1 {
        values.into_iter().next()
    } else {
        None
    }
}
fn limit(v: Option<String>, fallback: f64) -> f64 {
    let Some(v) = v else { return fallback };
    let s = js_trim(&v);
    let s = s.strip_prefix('+').unwrap_or(s);
    let (negative, s) = s.strip_prefix('-').map(|s| (true, s)).unwrap_or((false, s));
    let digits: String = s.chars().take_while(char::is_ascii_digit).collect();
    let n = digits.parse::<f64>().unwrap_or(f64::NAN);
    if negative || !n.is_finite() || n < 1.0 {
        fallback
    } else {
        n.min(500.0)
    }
}
fn truthy(v: &Value) -> bool {
    match v {
        Value::Null => false,
        Value::Bool(b) => *b,
        Value::Number(n) => n.as_f64().is_some_and(|n| n != 0.0),
        Value::String(s) => !s.is_empty(),
        _ => true,
    }
}
fn missing(kind: &str) -> Response {
    response(
        404,
        json!({"error":"NOT_FOUND","details":format!("{kind} not found")}),
    )
}
async fn handle(State(s): State<ReminderRoutes>, req: Request) -> Response {
    let mut result = match dispatch(&s, req).await {
        Ok(r) => r,
        Err(r) => *r,
    };
    if result
        .headers()
        .get("content-type")
        .is_some_and(|v| v == "application/json")
    {
        result.headers_mut().insert(
            "content-type",
            "application/json; charset=utf-8".parse().unwrap(),
        );
    }
    result
}
async fn dispatch(
    s: &ReminderRoutes,
    req: Request,
) -> std::result::Result<Response, Box<Response>> {
    let h = req.headers().clone();
    let method = req.method().clone();
    let path = req.uri().path().to_owned();
    let q = req.uri().query().unwrap_or("").to_owned();
    let owner = auth::require_user(&s.auth, &h).await?.id;
    let body = auth::parse_body(req.into_body(), &h).await?;
    if method == Method::GET && path == "/api/reminders" {
        let status = query(&q, "status")
            .filter(|v| matches!(v.as_str(), "active" | "archived" | "all"))
            .unwrap_or_else(|| "active".into());
        let project = query(&q, "projectId").and_then(|v| trimmed(&json!(v)));
        let session = query(&q, "sessionId").and_then(|v| trimmed(&json!(v)));
        let opts = ListReminderOptions {
            user_id: Some(owner.clone()),
            status: Some(status.clone()),
            project_id: project.clone(),
            session_id: session.clone(),
            limit: Some(limit(query(&q, "limit"), 100.0)),
        };
        let rows = s.store(move |store| store.list(opts)).await?;
        let mut records = vec![];
        if status != "archived"
            && project.is_none()
            && session.is_none()
            && let Some(p) = &s.memory
        {
            let entries = extra(p, "list", vec![]).await?;
            let Some(entries) = entries.as_array() else {
                return Err(Box::new(failure("Invalid engine memory list")));
            };
            for e in entries {
                records.push(json!({"id":e["id"],"kind":"engine","userId":null,"projectId":null,"sessionId":if e["source"]["surface"]=="chat"{e["source"]["id"].clone()}else{Value::Null},"content":e["content"],"sourceType":e["source"]["type"],"sourceId":e["source"]["id"],"sourceSurface":e["source"]["surface"],"status":"active","tags":serde_json::to_string(&json!(["engine-memory",format!("scope:{}",e["scope"].as_str().unwrap_or("undefined"))])).unwrap(),"usageCount":0,"lastRetrievedAt":null,"createdAt":e["createdAt"],"updatedAt":e["updatedAt"]}));
            }
        }
        let payload = if let Some(p) = &s.projects {
            extra(
                p,
                "listWithSessions",
                vec![json!(owner), json!("active"), json!(200)],
            )
            .await?
        } else {
            Value::Null
        };
        let uid = owner.clone();
        let counts = s.store(move |store| store.count_by_project(&uid)).await?;
        let mut projects = payload["projects"].as_array().cloned().unwrap_or_default();
        for p in &mut projects {
            p["reminderCount"] = json!(
                counts
                    .get(p["id"].as_str().unwrap_or(""))
                    .copied()
                    .unwrap_or(0)
            );
        }
        let threads = if let Some(p) = &s.threads {
            extra(p, "list", vec![json!(owner), json!(100)]).await?
        } else {
            json!([])
        };
        records.extend(rows.into_iter().map(|r| serde_json::to_value(r).unwrap()));
        return Ok(response(
            200,
            json!({"reminders":records,"projects":projects,"hasMoreProjects":payload.get("hasMore").filter(|v|!v.is_null()).cloned().unwrap_or(json!(false)),"threads":threads}),
        ));
    }
    if method == Method::GET && path == "/api/reminders/export.md" {
        let status = query(&q, "status")
            .filter(|v| matches!(v.as_str(), "active" | "archived" | "all"))
            .unwrap_or_else(|| "all".into());
        let project = query(&q, "projectId").and_then(|v| trimmed(&json!(v)));
        let opts = ListReminderOptions {
            user_id: Some(owner),
            status: Some(status),
            project_id: project,
            limit: Some(limit(query(&q, "limit"), 500.0)),
            ..Default::default()
        };
        let markdown = s.store(move |store| store.export_markdown(opts)).await?;
        use axum::response::IntoResponse;
        return Ok((
            [
                ("content-type", "text/markdown; charset=utf-8"),
                ("content-disposition", "inline; filename=\"jait-memory.md\""),
            ],
            markdown,
        )
            .into_response());
    }
    if method == Method::POST {
        let Some(content) = trimmed(&body["content"]) else {
            return Ok(response(400, json!({"error":"content is required"})));
        };
        let project = trimmed(&body["projectId"]);
        if let (Some(id), Some(p)) = (&project, &s.projects)
            && !truthy(&extra(p, "getById", vec![json!(id), json!(owner)]).await?)
        {
            return Ok(missing("Project"));
        }
        let session = trimmed(&body["sessionId"]);
        if let (Some(id), Some(p)) = (&session, &s.sessions)
            && !truthy(&extra(p, "getById", vec![json!(id), json!(owner)]).await?)
        {
            return Ok(missing("Session"));
        }
        let params = CreateReminderParams {
            user_id: Some(owner),
            project_id: project,
            session_id: session,
            content,
            source_type: Some(body["sourceType"].as_str().unwrap_or("user").into()),
            source_id: body["sourceId"].as_str().map(str::to_owned),
            source_surface: Some(body["sourceSurface"].as_str().unwrap_or("web").into()),
            status: Some(
                body["status"]
                    .as_str()
                    .filter(|v| matches!(*v, "active" | "archived"))
                    .unwrap_or("active")
                    .into(),
            ),
            tags: Some(tags(body.get("tags")).unwrap_or_default()),
        };
        let row = s.store(move |store| store.create(params)).await?;
        return Ok(response(201, json!({"reminder":row})));
    }
    let id = percent_encoding::percent_decode_str(path.trim_start_matches("/api/reminders/"))
        .decode_utf8_lossy()
        .into_owned();
    if method == Method::PATCH {
        let key = id.clone();
        let uid = owner.clone();
        if s.store(move |store| store.get_by_id(&key, Some(&uid)))
            .await?
            .is_none()
        {
            return Ok(missing("Reminder"));
        }
        let content = body["content"].as_str().map(|v| js_trim(v).to_owned());
        if content.as_ref().is_some_and(String::is_empty) {
            return Ok(response(400, json!({"error":"content must not be empty"})));
        }
        if body.get("status").is_some()
            && !matches!(body["status"].as_str(), Some("active" | "archived"))
        {
            return Ok(response(400, json!({"error":"invalid status"})));
        }
        let field = |key: &str| {
            if body.get(key).is_some() {
                Patch::Set(trimmed(&body[key]))
            } else {
                Patch::Missing
            }
        };
        let p = UpdateReminderParams {
            content,
            project_id: field("projectId"),
            session_id: field("sessionId"),
            status: body["status"].as_str().map(str::to_owned),
            tags: tags(body.get("tags"))
                .map(|v| Patch::Set(Some(v)))
                .unwrap_or_default(),
        };
        let row = s
            .store(move |store| store.update(&id, p, Some(&owner)))
            .await?;
        return Ok(response(200, json!({"reminder":row})));
    }
    let key = id.clone();
    let uid = owner;
    let mut removed = s.store(move |store| store.delete(&key, Some(&uid))).await?;
    if !removed && let Some(p) = &s.memory {
        removed = truthy(&extra(p, "forget", vec![json!(id)]).await?);
    }
    Ok(if removed {
        response(200, json!({"ok":true}))
    } else {
        missing("Reminder")
    })
}
