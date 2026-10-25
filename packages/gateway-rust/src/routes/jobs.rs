//! Protected jobs HTTP adapter backed by the native durable scheduler.
use super::auth::{self, AuthState, response};
use crate::{
    providers::registry::ProviderRegistry,
    scheduler::{
        cron::is_valid_cron_expression,
        service::{CreateJob, ScheduledJobRecord, SchedulerService},
    },
    services::jait_models::{
        self, JaitModelsConfig, ListJaitModelsOptions, ModelFetchers, ProviderModelInfo,
    },
    text::js_trim,
};
use axum::{
    Router,
    extract::{Request, State},
    http::Method,
    response::Response,
    routing::get,
};
use futures_util::future::BoxFuture;
use serde_json::{Map, Value, json};
use std::{collections::HashMap, sync::Arc};

pub type ProviderModels =
    Arc<dyn Fn(String) -> BoxFuture<'static, Result<Vec<ProviderModelInfo>, String>> + Send + Sync>;
pub type UserApiKeys = Arc<
    dyn Fn(String) -> BoxFuture<'static, Result<HashMap<String, String>, String>> + Send + Sync,
>;
#[derive(Clone)]
pub struct JaitModelCatalogue {
    pub config: JaitModelsConfig,
    pub fetchers: Arc<dyn ModelFetchers>,
    pub user_api_keys: UserApiKeys,
}
#[derive(Clone)]
pub struct JobRoutes {
    pub auth: AuthState,
    pub scheduler: SchedulerService,
    pub project_root: String,
    pub clock: crate::time::Clock,
    pub providers: Option<ProviderRegistry>,
    pub provider_models: ProviderModels,
    pub jait_models: Option<JaitModelCatalogue>,
}
impl JobRoutes {
    async fn repository<T: Send + 'static>(
        &self,
        operation: impl FnOnce(
            &crate::scheduler::service::SchedulerRepository<'_>,
        ) -> Result<T, crate::db::worker::OperationError>
        + Send
        + 'static,
    ) -> Result<T, Box<Response>> {
        self.scheduler
            .with_repository(move |repository| {
                Ok(operation(repository).map_err(|error| Box::new(sql_error(&error))))
            })
            .await
            .map_err(|error| Box::new(server_error(&error)))?
    }
    pub fn router(self) -> Router {
        Router::new()
            .route("/api/jobs/providers/available", get(handle))
            .route("/api/jobs", get(handle).post(handle))
            .route("/api/jobs/{id}", get(handle).patch(handle).delete(handle))
            .route("/api/jobs/{id}/trigger", axum::routing::post(handle))
            .route("/api/jobs/{id}/runs", get(handle))
            .with_state(self)
    }
    async fn available_providers(&self, owner: &str) -> Value {
        let mut result = Map::new();
        if let Some(registry) = &self.providers {
            for provider in registry.list() {
                let id = provider.id();
                if !registry.is_visible_to(id, owner) {
                    continue;
                }
                let models = async {
                    let fallback = (self.provider_models)(id.into()).await?;
                    if id == "jait"
                        && let Some(catalogue) = &self.jait_models
                    {
                        let keys = (catalogue.user_api_keys)(owner.into()).await?;
                        return Ok(jait_models::list_jait_models(
                            &ListJaitModelsOptions {
                                config: &catalogue.config,
                                api_keys: Some(&keys),
                                fallback_models: &fallback,
                                include_cloud: Some(true),
                            },
                            catalogue.fetchers.as_ref(),
                        )
                        .await);
                    }
                    Ok::<_, String>(fallback)
                }
                .await
                .unwrap_or_default();
                let name = provider.info().get("name").cloned();
                let mut item =
                    json!({"models":models.into_iter().map(|m|m.id).collect::<Vec<_>>()});
                if let Some(name) = name {
                    item["name"] = name;
                }
                result.insert(id.into(), item);
            }
        }
        json!({"providers":result})
    }
}
fn normalize_tool_name(name: &str) -> String {
    js_trim(name).replacen('_', ".", 1)
}
fn record(value: &Value) -> Map<String, Value> {
    match value {
        Value::Object(map) => map.clone(),
        Value::Array(values) => values
            .iter()
            .enumerate()
            .map(|(i, v)| (i.to_string(), v.clone()))
            .collect(),
        _ => Map::new(),
    }
}
fn optional_string(body: &Value, key: &str) -> Option<String> {
    body.get(key).and_then(Value::as_str).map(str::to_owned)
}
fn prompt(value: Option<&Value>) -> Option<String> {
    value
        .and_then(Value::as_str)
        .map(js_trim)
        .filter(|s| !s.is_empty())
        .map(str::to_owned)
}
fn parse_bool(value: Option<&Value>, fallback: bool) -> bool {
    match value {
        Some(Value::Bool(v)) => *v,
        Some(Value::String(v)) => v.eq_ignore_ascii_case("true"),
        _ => fallback,
    }
}
fn job_meta(input: &Value, tool: &str) -> Value {
    let base = record(input);
    let meta_value = base.get("__jaitJobMeta");
    let has_meta = meta_value.is_some_and(|v| v.is_object() || v.is_array());
    let meta = meta_value.map(record).unwrap_or_default();
    let eligible = matches!(
        normalize_tool_name(tool).as_str(),
        "thread.control" | "agent.spawn"
    );
    let inferred_prompt = base
        .get("prompt")
        .and_then(Value::as_str)
        .filter(|s| !js_trim(s).is_empty());
    let mut result = Map::new();
    let kind = match meta.get("jobType").and_then(Value::as_str) {
        Some("agent_task" | "agent_thread_job") if has_meta => Some("agent_task"),
        Some("system_job") if has_meta => Some("system_job"),
        _ if eligible && inferred_prompt.is_some() => Some("agent_task"),
        _ => None,
    };
    if let Some(kind) = kind {
        result.insert("jobType".into(), json!(kind));
    }
    if has_meta || (eligible && inferred_prompt.is_some()) {
        if let Some(v) = meta.get("description").filter(|v| v.is_string()) {
            result.insert("description".into(), v.clone());
        }
        let inferred_prompt = inferred_prompt.map(|s| json!(s));
        let candidates = [
            ("prompt", inferred_prompt.as_ref()),
            ("provider", base.get("providerId").filter(|_| eligible)),
            ("model", base.get("model").filter(|_| eligible)),
        ];
        for (name, inferred) in candidates {
            if let Some(v) = meta
                .get(name)
                .filter(|v| v.is_string())
                .or(inferred.filter(|v| v.is_string()))
            {
                result.insert(name.into(), v.clone());
            }
        }
    }
    Value::Object(result)
}
fn map_job(job: ScheduledJobRecord) -> Value {
    let meta = job_meta(&job.input, &job.tool_name);
    let kind = meta["jobType"].as_str().unwrap_or("system_job");
    let mut payload = record(&job.input);
    payload.remove("__jaitJobMeta");
    let payload = if kind == "system_job" {
        json!({"command":job.tool_name,"args":payload})
    } else {
        payload.remove("title");
        if payload.is_empty() {
            Value::Null
        } else {
            Value::Object(payload)
        }
    };
    json!({"id":job.id,"user_id":job.user_id,"name":job.name,"description":meta["description"],
        "cron_expression":job.cron,"job_type":kind,"tool_name":job.tool_name,"payload":payload,
        "prompt":meta["prompt"],"provider":meta["provider"],"model":meta["model"],"enabled":job.enabled,
        "temporal_schedule_id":null,"created_at":job.created_at,"updated_at":job.updated_at})
}
fn map_run(run: Value) -> Value {
    json!({"id":run["id"],"job_id":run["jobId"],"status":run["status"],"triggered_by":run["triggeredBy"],
        "started_at":run["startedAt"],"completed_at":run["completedAt"],"result":run["output"],"error":run["error"]})
}
fn query(query: &str) -> HashMap<String, Value> {
    let mut result = HashMap::new();
    for (key, value) in url::form_urlencoded::parse(query.as_bytes()) {
        let value = json!(value);
        match result.entry(key.into_owned()) {
            std::collections::hash_map::Entry::Vacant(entry) => {
                entry.insert(value);
            }
            std::collections::hash_map::Entry::Occupied(mut entry) => {
                if let Value::Array(values) = entry.get_mut() {
                    values.push(value)
                } else {
                    let previous = entry.get().clone();
                    entry.insert(json!([previous, value]));
                }
            }
        }
    }
    result
}
fn parse_integer(value: Option<&Value>, fallback: f64) -> f64 {
    let raw = match value {
        None | Some(Value::Null) => return fallback,
        Some(Value::String(s)) => s.clone(),
        Some(Value::Array(values)) => values
            .iter()
            .map(|v| v.as_str().unwrap_or(""))
            .collect::<Vec<_>>()
            .join(","),
        Some(v) => v.to_string(),
    };
    let raw = js_trim(&raw);
    let (negative, raw) = if let Some(v) = raw.strip_prefix('-') {
        (true, v)
    } else {
        (false, raw.strip_prefix('+').unwrap_or(raw))
    };
    let digits = raw.bytes().take_while(|v| v.is_ascii_digit()).count();
    let number = raw[..digits].parse::<f64>().unwrap_or(f64::NAN);
    let number = if negative { -number } else { number };
    if number.is_nan() || number == 0.0 {
        fallback
    } else {
        number
    }
}
fn js_number(value: f64) -> Value {
    if value >= 0.0 && value < u64::MAX as f64 {
        json!(value as u64)
    } else {
        json!(value)
    }
}
fn page(items: Vec<Value>, query: &HashMap<String, Value>, default_size: f64) -> Value {
    let page = parse_integer(query.get("page"), 1.0).max(1.0);
    let size = parse_integer(query.get("size"), default_size).clamp(1.0, 500.0);
    let start = ((page - 1.0) * size) as usize;
    let total = items.len();
    let items = items
        .into_iter()
        .skip(start)
        .take(size as usize)
        .collect::<Vec<_>>();
    json!({"items":items,"total":total,"page":js_number(page),"size":js_number(size)})
}
fn detail(code: u16, text: &str) -> Response {
    response(code, json!({"detail":text}))
}
fn server_error(error: &str) -> Response {
    response(
        500,
        json!({"statusCode":500,"error":"Internal Server Error","message":error}),
    )
}
fn sql_error(error: &crate::db::worker::OperationError) -> Response {
    if let Some(rusqlite::Error::SqliteFailure(code, Some(message))) =
        error.downcast_ref::<rusqlite::Error>()
    {
        let code = match code.extended_code {
            1 => "SQLITE_ERROR",
            1811 => "SQLITE_CONSTRAINT_TRIGGER",
            1555 => "SQLITE_CONSTRAINT_PRIMARYKEY",
            2067 => "SQLITE_CONSTRAINT_UNIQUE",
            1299 => "SQLITE_CONSTRAINT_NOTNULL",
            787 => "SQLITE_CONSTRAINT_FOREIGNKEY",
            275 => "SQLITE_CONSTRAINT_CHECK",
            19 => "SQLITE_CONSTRAINT",
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
    server_error(&error.to_string())
}
fn agent_payload(mut payload: Map<String, Value>, meta: &Value, root: &str, text: &str) -> Value {
    payload.remove("title");
    for (key, value) in [
        ("action", json!("create")),
        ("kind", json!("delivery")),
        ("prompt", json!(text)),
        ("workingDirectory", json!(root)),
        ("start", json!(true)),
        ("detach", json!(true)),
    ] {
        payload.insert(key.into(), value);
    }
    for (from, to) in [("provider", "providerId"), ("model", "model")] {
        payload.remove(to);
        if let Some(v) = meta.get(from) {
            payload.insert(to.into(), v.clone());
        }
    }
    Value::Object(payload)
}
fn create_request(body: &Value, owner: &str, root: &str) -> Result<CreateJob, Box<Response>> {
    let name = optional_string(body, "name").unwrap_or_default();
    let cron = optional_string(body, "cron_expression").unwrap_or_default();
    let name = js_trim(&name);
    let cron = js_trim(&cron);
    if name.is_empty() || cron.is_empty() {
        return Err(Box::new(detail(
            400,
            "name and cron_expression are required",
        )));
    }
    if !is_valid_cron_expression(cron) {
        return Err(Box::new(detail(
            400,
            "Invalid cron_expression: use five fields with numbers, wildcards, steps, lists or ranges",
        )));
    }
    let kind = body["job_type"]
        .as_str()
        .filter(|v| matches!(*v, "agent_task" | "system_job"))
        .unwrap_or("system_job");
    let mut meta = json!({"jobType":kind});
    for key in ["description", "provider", "model"] {
        if let Some(v) = optional_string(body, key) {
            meta[key] = json!(v)
        }
    }
    if let Some(v) = prompt(body.get("prompt")) {
        meta["prompt"] = json!(v)
    }
    let payload = record(&body["payload"]);
    let (tool, input) = if kind == "agent_task" {
        let Some(text) = meta["prompt"].as_str() else {
            return Err(Box::new(detail(400, "prompt is required for agent_task")));
        };
        (
            "thread.control".into(),
            agent_payload(payload, &meta, root, text),
        )
    } else {
        let command = payload
            .get("command")
            .and_then(Value::as_str)
            .filter(|s| !s.is_empty())
            .or_else(|| body["tool_name"].as_str())
            .unwrap_or("gateway.status");
        (
            normalize_tool_name(command),
            Value::Object(record(payload.get("args").unwrap_or(&Value::Null))),
        )
    };
    let mut input = record(&input);
    input.insert("__jaitJobMeta".into(), meta);
    Ok(CreateJob {
        user_id: Some(owner.into()),
        name: name.into(),
        cron: cron.into(),
        tool_name: tool,
        input: Some(Value::Object(input)),
        session_id: Some("default".into()),
        project_root: Some(root.into()),
        enabled: Some(parse_bool(body.get("enabled"), true)),
    })
}
fn patch_job(body: &Value, job: &ScheduledJobRecord) -> Result<Value, Box<Response>> {
    if let Some(cron) = body.get("cron_expression")
        && !cron.as_str().is_some_and(is_valid_cron_expression)
    {
        return Err(Box::new(detail(400, "Invalid cron_expression")));
    }
    let mut patch = json!({});
    for (from, to) in [("name", "name"), ("cron_expression", "cron")] {
        if let Some(v) = body.get(from).filter(|v| v.is_string()) {
            patch[to] = v.clone()
        }
    }
    if let Some(v) = body.get("enabled").filter(|v| v.is_boolean()) {
        patch["enabled"] = v.clone()
    }
    if ![
        "job_type",
        "tool_name",
        "payload",
        "prompt",
        "description",
        "provider",
        "model",
    ]
    .iter()
    .any(|key| body.get(*key).is_some())
    {
        return Ok(patch);
    }
    let existing = job_meta(&job.input, &job.tool_name);
    let kind = body["job_type"]
        .as_str()
        .filter(|v| matches!(*v, "agent_task" | "system_job"))
        .or_else(|| existing["jobType"].as_str())
        .unwrap_or("system_job");
    let mut meta = json!({"jobType":kind});
    for key in ["description", "provider", "model"] {
        if key == "model" && body.get(key) == Some(&Value::Null) {
            continue;
        }
        if let Some(v) = body
            .get(key)
            .filter(|v| v.is_string())
            .or_else(|| existing.get(key))
        {
            meta[key] = v.clone()
        }
    }
    if let Some(v) = prompt(body.get("prompt"))
        .map(Value::String)
        .or_else(|| existing.get("prompt").cloned())
    {
        meta["prompt"] = v
    }
    let mut payload = record(&job.input);
    payload.remove("__jaitJobMeta");
    let mut tool = job.tool_name.clone();
    if kind == "agent_task" {
        let Some(text) = meta["prompt"].as_str().filter(|s| !s.is_empty()) else {
            return Err(Box::new(detail(400, "prompt is required for agent_task")));
        };
        if body
            .get("payload")
            .is_some_and(|v| v.is_object() || v.is_array())
        {
            payload = record(&body["payload"])
        }
        payload = record(&agent_payload(payload, &meta, &job.project_root, text));
        tool = "thread.control".into();
    } else {
        let requested = record(&body["payload"]);
        if let Some(command) = requested
            .get("command")
            .and_then(Value::as_str)
            .filter(|v| !v.is_empty())
            .or_else(|| body["tool_name"].as_str())
        {
            tool = normalize_tool_name(command)
        }
        if body
            .get("payload")
            .is_some_and(|v| v.is_object() || v.is_array())
        {
            payload = record(requested.get("args").unwrap_or(&Value::Null))
        }
    }
    payload.insert("__jaitJobMeta".into(), meta);
    patch["toolName"] = json!(tool);
    patch["input"] = Value::Object(payload);
    Ok(patch)
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
async fn handle(State(state): State<JobRoutes>, request: Request) -> Response {
    let path = request.uri().path();
    if !valid_url_component(path) {
        return response(
            400,
            json!({"error":"Bad Request","code":"FST_ERR_BAD_URL","message":format!("'{path}' is not a valid url component"),"statusCode":400}),
        );
    }
    let mut result = dispatch(state, request).await;
    if result.status() == axum::http::StatusCode::NO_CONTENT {
        result
            .headers_mut()
            .remove(axum::http::header::CONTENT_TYPE);
    } else if result
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
async fn dispatch(state: JobRoutes, request: Request) -> Response {
    let headers = request.headers().clone();
    let user = match auth::require_user(&state.auth, &headers).await {
        Ok(user) => user,
        Err(response) => return *response,
    };
    let method = request.method().clone();
    let path = request.uri().path().to_owned();
    let query = query(request.uri().query().unwrap_or(""));
    let body = match auth::parse_body(request.into_body(), &headers).await {
        Ok(body) => body,
        Err(error) if error.status() == axum::http::StatusCode::UNSUPPORTED_MEDIA_TYPE => {
            return response(
                415,
                json!({"statusCode":415,"code":"FST_ERR_CTP_INVALID_MEDIA_TYPE","error":"Unsupported Media Type","message":"Unsupported Media Type"}),
            );
        }
        Err(error) => return *error,
    };
    let result: Result<Response, Box<Response>> = async {
        if path == "/api/jobs/providers/available" {
            return Ok(response(200, state.available_providers(&user.id).await));
        }
        if path == "/api/jobs" {
            if method == Method::POST {
                let create = match create_request(&body, &user.id, &state.project_root) {
                    Ok(v) => v,
                    Err(r) => return Ok(*r),
                };
                return Ok(response(
                    201,
                    map_job(state.repository(move |r| r.create(create)).await?),
                ));
            }
            let disabled = parse_bool(query.get("include_disabled"), true);
            let owner = user.id.clone();
            let jobs = state
                .repository(move |r| r.list(Some(&owner)))
                .await?
                .into_iter()
                .filter(|j| disabled || j.enabled)
                .map(map_job)
                .collect();
            return Ok(response(200, page(jobs, &query, 100.0)));
        }
        let suffix = path.strip_prefix("/api/jobs/").unwrap_or("");
        let (id, operation) = suffix.split_once('/').unwrap_or((suffix, ""));
        let id = percent_encoding::percent_decode_str(id)
            .decode_utf8_lossy()
            .into_owned();
        if operation == "trigger" {
            let result: Result<Value, String> = async {
                let execution = state
                    .scheduler
                    .trigger(
                        id.clone(),
                        Some(user.id.clone()),
                        (state.clock)(),
                        "manual".into(),
                    )
                    .await?;
                state
                    .scheduler
                    .list_runs(id)
                    .await?
                    .into_iter()
                    .find(|r| r["id"] == execution["actionId"])
                    .ok_or_else(|| "Job run was not persisted".into())
            }
            .await;
            return Ok(match result {
                Ok(run) => response(200, map_run(run)),
                Err(error) => detail(
                    if error.to_lowercase().contains("job not found") {
                        404
                    } else {
                        500
                    },
                    &error,
                ),
            });
        }
        let owner = user.id.clone();
        let lookup = id.clone();
        let Some(job) = state
            .repository(move |r| r.get(&lookup, Some(&owner)))
            .await?
        else {
            return Ok(detail(404, "Job not found"));
        };
        if operation == "runs" {
            let runs = state
                .repository(move |r| r.list_runs(&id))
                .await?
                .into_iter()
                .map(map_run)
                .collect();
            return Ok(response(200, page(runs, &query, 20.0)));
        }
        Ok(if method == Method::DELETE {
            let owner = user.id;
            if state
                .repository(move |r| r.remove(&id, Some(&owner)))
                .await?
            {
                response(204, Value::Null)
            } else {
                detail(404, "Job not found")
            }
        } else if method == Method::PATCH {
            let patch = match patch_job(&body, &job) {
                Ok(v) => v,
                Err(r) => return Ok(*r),
            };
            let owner = user.id;
            match state
                .repository(move |r| r.update(&id, &patch, Some(&owner)))
                .await?
            {
                Some(job) => response(200, map_job(job)),
                None => detail(404, "Job not found"),
            }
        } else {
            response(200, map_job(job))
        })
    }
    .await;
    result.unwrap_or_else(|error| *error)
}
