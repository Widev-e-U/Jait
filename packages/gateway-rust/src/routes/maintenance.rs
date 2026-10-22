//! Authenticated maintenance presentation over an explicit authorized runner.
//! No shell execution, approval, plan activation or production mount occurs here.
use super::auth::{self, AuthState, response};
use crate::{
    services::calendar::{js_text, truthy},
    text::js_trim,
    time::Clock,
    tools::maintenance::{MaintenanceError, MaintenanceNotification, NotificationSink},
};
use axum::{
    Router,
    extract::{Request, State},
    response::Response,
    routing::{get, post},
};
use futures_util::future::BoxFuture;
use serde_json::{Value, json};
use std::sync::Arc;
pub trait MaintenanceBackend: Send + Sync {
    fn list_runs(
        &self,
        job_id: Option<String>,
        limit: f64,
    ) -> BoxFuture<'_, Result<Vec<Value>, MaintenanceError>>;
    fn get_run(&self, id: String) -> BoxFuture<'_, Result<Option<Value>, MaintenanceError>>;
    fn run_for_repo(
        &self,
        repo_id: String,
        job_id: String,
    ) -> BoxFuture<'_, Result<Value, MaintenanceError>>;
}
pub type Broadcast = Arc<dyn Fn(Value) -> Result<(), MaintenanceError> + Send + Sync>;
#[derive(Clone)]
pub struct MaintenanceRoutes {
    pub auth: AuthState,
    pub backend: Arc<dyn MaintenanceBackend>,
    pub broadcast: Option<Broadcast>,
    pub notifications: Option<NotificationSink>,
    pub clock: Clock,
}
impl MaintenanceRoutes {
    pub fn router(self) -> Router {
        Router::new()
            .route("/api/maintenance/runs", get(handle))
            .route("/api/maintenance/runs/{id}", get(handle))
            .route("/api/maintenance/run", post(handle))
            .with_state(self)
    }
}
fn error_text(e: MaintenanceError) -> String {
    match e {
        MaintenanceError::Message(s) => s,
        MaintenanceError::Thrown(v) => js_text(&v),
    }
}
fn unhandled(e: MaintenanceError) -> Response {
    response(
        500,
        json!({"statusCode":500,"error":"Internal Server Error","message":error_text(e)}),
    )
}
fn query_string(query: &str, key: &str) -> Option<String> {
    let mut values = url::form_urlencoded::parse(query.as_bytes()).filter(|(k, _)| k == key);
    let first = values.next()?.1.into_owned();
    if values.next().is_some() {
        None
    } else {
        Some(first)
    }
}
fn number(text: &str) -> f64 {
    let s = js_trim(text);
    if s.is_empty() {
        return 0.0;
    }
    if let Some((digits, radix)) = s
        .strip_prefix("0x")
        .or_else(|| s.strip_prefix("0X"))
        .map(|s| (s, 16))
        .or_else(|| {
            s.strip_prefix("0b")
                .or_else(|| s.strip_prefix("0B"))
                .map(|s| (s, 2))
        })
        .or_else(|| {
            s.strip_prefix("0o")
                .or_else(|| s.strip_prefix("0O"))
                .map(|s| (s, 8))
        })
    {
        if digits.is_empty() {
            return f64::NAN;
        }
        return digits
            .chars()
            .try_fold(0.0, |v, c| {
                c.to_digit(radix)
                    .map(|d| v * f64::from(radix) + f64::from(d))
            })
            .unwrap_or(f64::NAN);
    }
    if matches!(s, "Infinity" | "+Infinity") {
        return f64::INFINITY;
    }
    if s == "-Infinity" {
        return f64::NEG_INFINITY;
    }
    if s.bytes()
        .any(|b| !b.is_ascii_digit() && !b".eE+-".contains(&b))
    {
        return f64::NAN;
    }
    s.parse::<f64>().unwrap_or(f64::NAN)
}
fn valid_url_component(path: &str) -> bool {
    let bytes = path.as_bytes();
    for (i, byte) in bytes.iter().enumerate() {
        if *byte == b'%'
            && (bytes.get(i + 1).is_none_or(|v| !v.is_ascii_hexdigit())
                || bytes.get(i + 2).is_none_or(|v| !v.is_ascii_hexdigit()))
        {
            return false;
        }
    }
    percent_encoding::percent_decode_str(path)
        .decode_utf8()
        .is_ok()
}
async fn handle(State(state): State<MaintenanceRoutes>, request: Request) -> Response {
    let path = request.uri().path();
    if !valid_url_component(path) {
        return response(
            400,
            json!({"error":"Bad Request","code":"FST_ERR_BAD_URL","message":format!("'{path}' is not a valid url component"),"statusCode":400}),
        );
    }
    let mut response = dispatch(state, request).await;
    if response
        .headers()
        .get(axum::http::header::CONTENT_TYPE)
        .is_some_and(|v| v == "application/json")
    {
        response.headers_mut().insert(
            axum::http::header::CONTENT_TYPE,
            "application/json; charset=utf-8".parse().unwrap(),
        );
    }
    response
}
async fn dispatch(state: MaintenanceRoutes, request: Request) -> Response {
    let headers = request.headers().clone();
    if let Err(r) = auth::require_user(&state.auth, &headers).await {
        return *r;
    }
    let path = request.uri().path().to_owned();
    let query = request.uri().query().unwrap_or("").to_owned();
    let body = match auth::parse_body(request.into_body(), &headers).await {
        Ok(v) => v,
        Err(r) if r.status() == axum::http::StatusCode::UNSUPPORTED_MEDIA_TYPE => {
            return response(
                415,
                json!({"statusCode":415,"code":"FST_ERR_CTP_INVALID_MEDIA_TYPE","error":"Unsupported Media Type","message":"Unsupported Media Type"}),
            );
        }
        Err(r) => return *r,
    };
    if path == "/api/maintenance/runs" {
        let raw = query_string(&query, "limit")
            .map(|s| number(&s))
            .unwrap_or(f64::NAN);
        let limit = if raw.is_nan() || raw == 0.0 {
            50.0
        } else {
            raw.clamp(1.0, 200.0)
        };
        return match state
            .backend
            .list_runs(query_string(&query, "jobId"), limit)
            .await
        {
            Ok(runs) => response(200, json!({"runs":runs})),
            Err(e) => unhandled(e),
        };
    }
    if let Some(id) = path.strip_prefix("/api/maintenance/runs/") {
        let id = percent_encoding::percent_decode_str(id)
            .decode_utf8_lossy()
            .into_owned();
        return match state.backend.get_run(id).await {
            Ok(Some(run)) => response(200, json!({"run":run})),
            Ok(None) => response(404, json!({"error":"Run not found"})),
            Err(e) => unhandled(e),
        };
    }
    let repo = body["repoId"].as_str().unwrap_or("");
    if repo.is_empty() {
        return response(400, json!({"error":"repoId is required"}));
    }
    let result:Result<Value,MaintenanceError>=async {
  let run=state.backend.run_for_repo(repo.into(),format!("manual-{}",(state.clock)())).await?;
  let checks=run["checks"].as_array().ok_or_else(||MaintenanceError::Message("Invalid maintenance checks".into()))?;
  let failed=checks.iter().filter(|c|!truthy(&c["passed"])).count();
  let all_passed=truthy(&run["allPassed"]);
  let repo_name=js_text(&run["repoName"]);
  if let Some(broadcast)=&state.broadcast {
   let mut summary=json!({"id":run["id"],"repoName":run["repoName"],"allPassed":run["allPassed"],"checks":checks.iter().map(|c|json!({"name":c["name"],"passed":c["passed"],"durationMs":c["durationMs"]})).collect::<Vec<_>>()});
   if let Some(plan)=run.get("planId"){summary["planId"]=plan.clone();}
   let timestamp=chrono::DateTime::from_timestamp_millis((state.clock)()).ok_or_else(||MaintenanceError::Message("Invalid time value".into()))?.to_rfc3339_opts(chrono::SecondsFormat::Millis,true);
   broadcast(json!({"type":"plan.created","sessionId":"","timestamp":timestamp,"payload":{"maintenance":true,"run":summary}}))?;
  }
  if let Some(notify)=&state.notifications {
   notify(if all_passed {
    MaintenanceNotification{level:"success",title:"Maintenance passed",body:format!("All checks passed for {repo_name}"),link:None}
   }else{
    MaintenanceNotification{level:"warning",title:"Maintenance: checks failed",body:format!("{failed} check(s) failed in {repo_name} — fix plan created"),link:run.get("planId").filter(|v|truthy(v)).map(|v|format!("/plans/{}",js_text(v)))}
   })?;
  }
  Ok(json!({"run":run,"message":if all_passed{"All checks passed".into()}else{format!("{failed} check(s) failed — review the plan")}}))
 }.await;
    match result {
        Ok(v) => response(200, v),
        Err(e) => response(500, json!({"error":error_text(e)})),
    }
}
