//! Port of `packages/gateway/src/routes/threads.ts` (2396 lines).
//!
//! Ported in this file (DB-only surface):
//!   GET    /api/persona-agents
//!   PUT    /api/persona-agents/{id}
//!   DELETE /api/persona-agents/{id}
//!   GET    /api/threads
//!   GET    /api/threads/{id}
//!   PATCH  /api/threads/{id}
//!   DELETE /api/threads/{id}
//!   GET    /api/threads/{id}/runtime
//!   GET    /api/threads/{id}/activities
//!
//! DEFERRED (see module docs at the bottom of this file for reasons):
//!   POST /api/threads                                   (threads.ts:1039-1101)
//!   provider turn-execution / streaming / attachment / PR handlers
//!                                                       (threads.ts:1248-2365)
//!
//! Note: `ThreadService.addActivity` in TypeScript is called from the PATCH
//! handler on PR-state changes; that path is reproduced here.

use std::collections::HashMap;
use std::sync::Arc;

use axum::Router;
use axum::extract::{Path, Request, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::{get, put};
use rusqlite::types::Value as SqlValue;
use rusqlite::{Connection, OptionalExtension, params, params_from_iter};
use serde_json::{Map, Value, json};

use crate::routes::auth::{self, AuthState};

type Res<T> = Result<T, Box<Response>>;

/// Mirrors `MAX_ACTIVITY_SUMMARY_BYTES` in the TypeScript thread service.
const MAX_ACTIVITY_SUMMARY_BYTES: usize = 2000;

/// Mirrors the drizzle select order of `agentThreads`.
const THREAD_COLUMNS: &str = "id, user_id, session_id, persona_agent_id, title, provider_id, model, \
reasoning_effort, runtime_mode, kind, skill_ids, working_directory, branch, status, \
provider_session_id, error, pr_url, pr_number, pr_title, pr_base_branch, pr_state, \
execution_node_id, execution_node_name, routing_plan, change_files, change_insertions, \
change_deletions, created_at, updated_at, completed_at";

const ACTIVITY_COLUMNS: &str = "id, thread_id, kind, summary, payload, created_at";

/// Provider availability hook. The TypeScript gateway resolves this through
/// `providerRegistry.getForUser()` and the websocket fs-node provider list;
/// neither has a native counterpart yet, so the coordinator can inject it with
/// [`ThreadRoutes::with_provider_check`]. When absent, the existence check is
/// skipped (the requested provider id is still persisted verbatim).
pub type ProviderCheck = Arc<dyn Fn(&str, &str) -> bool + Send + Sync>;

#[derive(Clone)]
pub struct ThreadRoutes {
    auth: AuthState,
    provider_check: Option<ProviderCheck>,
}

impl ThreadRoutes {
    pub fn new(auth: AuthState) -> Self {
        Self {
            auth,
            provider_check: None,
        }
    }

    pub fn with_provider_check(auth: AuthState, check: ProviderCheck) -> Self {
        Self {
            auth,
            provider_check: Some(check),
        }
    }

    pub fn router(self) -> Router {
        Router::new()
            .route("/api/persona-agents", get(list_persona_agents))
            .route(
                "/api/persona-agents/{id}",
                put(save_persona_agent).delete(delete_persona_agent),
            )
            .route("/api/threads", get(list_threads))
            .route(
                "/api/threads/{id}",
                get(get_thread).patch(patch_thread).delete(delete_thread),
            )
            .route("/api/threads/{id}/runtime", get(thread_runtime))
            .route("/api/threads/{id}/activities", get(thread_activities))
            .with_state(self)
    }
}

// ---------------------------------------------------------------------------
// response helpers
// ---------------------------------------------------------------------------

fn json_response(status: u16, body: Value) -> Response {
    (
        StatusCode::from_u16(status).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR),
        axum::Json(body),
    )
        .into_response()
}

/// Fastify `reply.code(n).send({ error })` shape used throughout threads.ts.
fn error_response(status: u16, message: &str) -> Response {
    json_response(status, json!({ "error": message }))
}

async fn json_body(request: Request) -> Res<Value> {
    let bytes = axum::body::to_bytes(request.into_body(), 8 * 1024 * 1024)
        .await
        .map_err(|_| -> Box<Response> { Box::new(error_response(400, "Invalid request body")) })?;
    if bytes.is_empty() {
        return Ok(Value::Null);
    }
    serde_json::from_slice(&bytes)
        .map_err(|_| -> Box<Response> { Box::new(error_response(400, "Invalid request body")) })
}

async fn run<T, F>(state: &ThreadRoutes, operation: F) -> Res<T>
where
    T: Send + 'static,
    F: FnOnce(&Connection) -> rusqlite::Result<T> + Send + 'static,
{
    match state
        .auth
        .with_database(move |db| {
            Ok::<rusqlite::Result<T>, Box<dyn std::error::Error + Send + Sync>>(operation(db))
        })
        .await
    {
        Ok(Ok(value)) => Ok(value),
        Ok(Err(_)) | Err(_) => Err(Box::new(error_response(500, "Internal Server Error"))),
    }
}

// ---------------------------------------------------------------------------
// small helpers (port of thread-defaults.ts / threads.ts helpers)
// ---------------------------------------------------------------------------

/// `parseThreadListLimit` (threads.ts:859): integer >= 1, capped at 100.
fn parse_thread_list_limit(value: Option<&str>) -> Option<i64> {
    let raw = value?;
    let parsed: i64 = raw.trim().parse().ok()?;
    if parsed < 1 {
        return None;
    }
    Some(parsed.min(100))
}

fn percent_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'+' => {
                out.push(b' ');
                i += 1;
            }
            b'%' if i + 2 < bytes.len() => {
                let hi = (bytes[i + 1] as char).to_digit(16);
                let lo = (bytes[i + 2] as char).to_digit(16);
                match (hi, lo) {
                    (Some(hi), Some(lo)) => {
                        out.push((hi * 16 + lo) as u8);
                        i += 3;
                    }
                    _ => {
                        out.push(bytes[i]);
                        i += 1;
                    }
                }
            }
            byte => {
                out.push(byte);
                i += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn parse_query(query: Option<&str>) -> HashMap<String, String> {
    let mut out = HashMap::new();
    let Some(query) = query else { return out };
    for pair in query.split('&') {
        if pair.is_empty() {
            continue;
        }
        let mut parts = pair.splitn(2, '=');
        let key = percent_decode(parts.next().unwrap_or(""));
        let value = percent_decode(parts.next().unwrap_or(""));
        out.insert(key, value);
    }
    out
}

fn now_iso() -> String {
    let elapsed = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    let secs = elapsed.as_secs() as i64;
    let millis = elapsed.subsec_millis();
    let days = secs.div_euclid(86_400);
    let rem = secs.rem_euclid(86_400);
    let (year, month, day) = civil_from_days(days);
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}.{:03}Z",
        year,
        month,
        day,
        rem / 3600,
        (rem % 3600) / 60,
        rem % 60,
        millis
    )
}

fn civil_from_days(days: i64) -> (i64, u32, u32) {
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let month = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if month <= 2 { y + 1 } else { y }, month, day)
}

fn limit_utf8(value: &str, max_bytes: usize) -> String {
    if value.len() <= max_bytes {
        return value.to_string();
    }
    let mut end = max_bytes;
    while end > 0 && !value.is_char_boundary(end) {
        end -= 1;
    }
    value[..end].to_string()
}

fn parse_json_text(value: Option<String>) -> Value {
    match value {
        Some(text) if !text.trim().is_empty() => serde_json::from_str(&text).unwrap_or(Value::Null),
        _ => Value::Null,
    }
}

fn string_list(value: &Value) -> Option<SqlValue> {
    match value {
        Value::Null => Some(SqlValue::Null),
        Value::Array(items) => {
            let values: Vec<String> = items
                .iter()
                .filter_map(|item| item.as_str().map(|s| s.to_string()))
                .collect();
            Some(SqlValue::Text(
                serde_json::to_string(&values).unwrap_or_else(|_| "[]".to_string()),
            ))
        }
        _ => None,
    }
}

/// `normalizeReasoningEffort` equivalent.
fn normalize_reasoning_effort(value: &Value) -> Option<SqlValue> {
    match value {
        Value::Null => Some(SqlValue::Null),
        Value::String(raw) => {
            let normalized = raw.trim().to_ascii_lowercase();
            const ALLOWED: [&str; 6] = ["none", "low", "medium", "high", "xhigh", "max"];
            if ALLOWED.contains(&normalized.as_str()) {
                Some(SqlValue::Text(normalized))
            } else {
                None
            }
        }
        _ => None,
    }
}

// ---------------------------------------------------------------------------
// row mapping
// ---------------------------------------------------------------------------

fn thread_json(row: &rusqlite::Row<'_>) -> rusqlite::Result<Value> {
    Ok(json!({
        "id": row.get::<_, String>(0)?,
        "userId": row.get::<_, Option<String>>(1)?,
        "sessionId": row.get::<_, Option<String>>(2)?,
        "personaAgentId": row.get::<_, Option<String>>(3)?,
        "title": row.get::<_, Option<String>>(4)?,
        "providerId": row.get::<_, Option<String>>(5)?,
        "model": row.get::<_, Option<String>>(6)?,
        "reasoningEffort": row.get::<_, Option<String>>(7)?,
        "runtimeMode": row.get::<_, Option<String>>(8)?,
        "kind": row.get::<_, Option<String>>(9)?,
        "skillIds": parse_json_text(row.get::<_, Option<String>>(10)?),
        "workingDirectory": row.get::<_, Option<String>>(11)?,
        "branch": row.get::<_, Option<String>>(12)?,
        "status": row.get::<_, Option<String>>(13)?,
        "providerSessionId": row.get::<_, Option<String>>(14)?,
        "error": row.get::<_, Option<String>>(15)?,
        "prUrl": row.get::<_, Option<String>>(16)?,
        "prNumber": row.get::<_, Option<i64>>(17)?,
        "prTitle": row.get::<_, Option<String>>(18)?,
        "prBaseBranch": row.get::<_, Option<String>>(19)?,
        "prState": row.get::<_, Option<String>>(20)?,
        "executionNodeId": row.get::<_, Option<String>>(21)?,
        "executionNodeName": row.get::<_, Option<String>>(22)?,
        "routingPlan": parse_json_text(row.get::<_, Option<String>>(23)?),
        "changeFiles": row.get::<_, Option<i64>>(24)?,
        "changeInsertions": row.get::<_, Option<i64>>(25)?,
        "changeDeletions": row.get::<_, Option<i64>>(26)?,
        "createdAt": row.get::<_, Option<String>>(27)?,
        "updatedAt": row.get::<_, Option<String>>(28)?,
        "completedAt": row.get::<_, Option<String>>(29)?,
    }))
}

fn activity_json(row: &rusqlite::Row<'_>) -> rusqlite::Result<Value> {
    Ok(json!({
        "id": row.get::<_, String>(0)?,
        "threadId": row.get::<_, String>(1)?,
        "kind": row.get::<_, String>(2)?,
        "summary": row.get::<_, String>(3)?,
        "payload": parse_json_text(row.get::<_, Option<String>>(4)?),
        "createdAt": row.get::<_, String>(5)?,
    }))
}

fn persona_agent_json(row: &rusqlite::Row<'_>) -> rusqlite::Result<Value> {
    let id: String = row.get(0)?;
    let user_id: String = row.get(1)?;
    let data: String = row.get(2)?;
    let updated_at: Option<String> = row.get(3)?;
    let mut object = match serde_json::from_str::<Value>(&data) {
        Ok(Value::Object(map)) => map,
        _ => Map::new(),
    };
    object.insert("id".to_string(), Value::String(id));
    object.insert("userId".to_string(), Value::String(user_id));
    object.insert(
        "updatedAt".to_string(),
        updated_at.map(Value::String).unwrap_or(Value::Null),
    );
    Ok(Value::Object(object))
}

// ---------------------------------------------------------------------------
// database helpers
// ---------------------------------------------------------------------------

fn select_thread(conn: &Connection, id: &str) -> rusqlite::Result<Option<Value>> {
    let sql = format!("SELECT {} FROM agent_threads WHERE id = ?1", THREAD_COLUMNS);
    conn.query_row(&sql, params![id], thread_json).optional()
}

/// `getOwnedThread` + `assertOwnership(reply, thread, userId, "Thread not found")`.
fn select_owned_thread(
    conn: &Connection,
    id: &str,
    user_id: &str,
) -> rusqlite::Result<Option<Value>> {
    let thread = select_thread(conn, id)?;
    Ok(thread.filter(|value| {
        value
            .get("userId")
            .and_then(Value::as_str)
            .map(|owner| owner == user_id)
            .unwrap_or(false)
    }))
}

fn select_persona_agent(
    conn: &Connection,
    id: &str,
    user_id: &str,
) -> rusqlite::Result<Option<Value>> {
    conn.query_row(
        "SELECT id, user_id, data, updated_at FROM persona_agents WHERE id = ?1 AND user_id = ?2",
        params![id, user_id],
        persona_agent_json,
    )
    .optional()
}

fn add_activity(
    conn: &Connection,
    thread_id: &str,
    kind: &str,
    summary: &str,
    payload: Option<Value>,
) -> rusqlite::Result<()> {
    let id = crate::identifiers::uuidv7();
    let now = now_iso();
    let summary = limit_utf8(summary, MAX_ACTIVITY_SUMMARY_BYTES);
    let payload_text = payload.and_then(|value| serde_json::to_string(&value).ok());
    conn.execute(
        "INSERT INTO agent_thread_activities (id, thread_id, kind, summary, payload, created_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![id, thread_id, kind, summary, payload_text, now],
    )?;
    Ok(())
}

fn update_thread(
    conn: &Connection,
    id: &str,
    assignments: &[(&'static str, SqlValue)],
) -> rusqlite::Result<Option<Value>> {
    if assignments.is_empty() {
        return select_thread(conn, id);
    }
    let mut sets: Vec<String> = assignments
        .iter()
        .map(|(column, _)| format!("{} = ?", column))
        .collect();
    sets.push("updated_at = ?".to_string());
    let sql = format!("UPDATE agent_threads SET {} WHERE id = ?", sets.join(", "));
    let mut values: Vec<SqlValue> = assignments.iter().map(|(_, value)| value.clone()).collect();
    values.push(SqlValue::Text(now_iso()));
    values.push(SqlValue::Text(id.to_string()));
    conn.execute(&sql, params_from_iter(values.iter()))?;
    select_thread(conn, id)
}

/// `ThreadService.getRunStartedAt`.
fn run_started_at(conn: &Connection, thread_id: &str) -> rusqlite::Result<Option<String>> {
    conn.query_row(
        "SELECT created_at FROM agent_thread_activities \
         WHERE thread_id = ?1 AND kind = 'message' \
           AND json_extract(payload, '$.role') = 'user' \
         ORDER BY created_at DESC, rowid DESC LIMIT 1",
        params![thread_id],
        |row| row.get::<_, String>(0),
    )
    .optional()
}

// ---------------------------------------------------------------------------
// persona agents
// ---------------------------------------------------------------------------

async fn list_persona_agents(State(state): State<ThreadRoutes>, request: Request) -> Response {
    let headers = request.headers().clone();
    let user = match auth::require_user(&state.auth, &headers).await {
        Ok(user) => user,
        Err(response) => return *response,
    };
    let user_id = user.id.clone();
    let agents = match run(&state, move |conn| {
        let mut stmt = conn.prepare(
            "SELECT id, user_id, data, updated_at FROM persona_agents WHERE user_id = ?1 \
             ORDER BY updated_at DESC",
        )?;
        let rows = stmt.query_map(params![user_id], persona_agent_json)?;
        let mut agents = Vec::new();
        for row in rows {
            agents.push(row?);
        }
        Ok(agents)
    })
    .await
    {
        Ok(agents) => agents,
        Err(response) => return *response,
    };

    // The TypeScript route decorates each profile with live task/stream state
    // from the runtime hook; no native hook exists yet, so those are null.
    let agents: Vec<Value> = agents
        .into_iter()
        .map(|mut agent| {
            if let Value::Object(map) = &mut agent {
                map.insert("activeTasks".to_string(), Value::Null);
                map.insert("liveState".to_string(), Value::Null);
            }
            agent
        })
        .collect();

    json_response(200, json!({ "agents": agents }))
}

async fn save_persona_agent(
    Path(id): Path<String>,
    State(state): State<ThreadRoutes>,
    request: Request,
) -> Response {
    let headers = request.headers().clone();
    let user = match auth::require_user(&state.auth, &headers).await {
        Ok(user) => user,
        Err(response) => return *response,
    };
    let user_id = user.id.clone();
    let body = match json_body(request).await {
        Ok(body) => body,
        Err(response) => return *response,
    };
    let Some(body) = body.as_object().cloned() else {
        return error_response(400, "Invalid request body");
    };

    let saved = run(&state, move |conn| {
        let existing = conn
            .query_row(
                "SELECT data FROM persona_agents WHERE id = ?1 AND user_id = ?2",
                params![id, user_id],
                |row| row.get::<_, String>(0),
            )
            .optional()?;
        let mut data = match existing {
            Some(text) => match serde_json::from_str::<Value>(&text) {
                Ok(Value::Object(map)) => map,
                _ => Map::new(),
            },
            None => Map::new(),
        };
        for (key, value) in body.iter() {
            if key == "id" {
                continue;
            }
            data.insert(key.clone(), value.clone());
        }
        data.insert("id".to_string(), Value::String(id.clone()));
        let now = now_iso();
        let text = Value::Object(data).to_string();
        conn.execute(
            "INSERT INTO persona_agents (id, user_id, data, updated_at) VALUES (?1, ?2, ?3, ?4) \
             ON CONFLICT(id) DO UPDATE SET user_id = excluded.user_id, data = excluded.data, \
             updated_at = excluded.updated_at",
            params![id, user_id, text, now],
        )?;
        select_persona_agent(conn, &id, &user_id)
    })
    .await;

    match saved {
        Ok(Some(agent)) => json_response(200, agent),
        Ok(None) => error_response(400, "Failed to save agent profile"),
        Err(response) => *response,
    }
}

async fn delete_persona_agent(
    Path(id): Path<String>,
    State(state): State<ThreadRoutes>,
    request: Request,
) -> Response {
    let headers = request.headers().clone();
    let user = match auth::require_user(&state.auth, &headers).await {
        Ok(user) => user,
        Err(response) => return *response,
    };
    let user_id = user.id.clone();
    let deleted = run(&state, move |conn| {
        conn.execute(
            "DELETE FROM persona_agents WHERE id = ?1 AND user_id = ?2",
            params![id, user_id],
        )?;
        Ok(())
    })
    .await;
    if let Err(response) = deleted {
        return *response;
    }
    json_response(200, json!({ "ok": true }))
}

// ---------------------------------------------------------------------------
// threads
// ---------------------------------------------------------------------------

async fn list_threads(State(state): State<ThreadRoutes>, request: Request) -> Response {
    let headers = request.headers().clone();
    let user = match auth::require_user(&state.auth, &headers).await {
        Ok(user) => user,
        Err(response) => return *response,
    };
    let query = parse_query(request.uri().query());
    let limit = parse_thread_list_limit(query.get("limit").map(String::as_str));
    let session_id = query
        .get("sessionId")
        .filter(|value| !value.is_empty())
        .cloned();
    let user_id = user.id.clone();

    let threads = match run(&state, move |conn| match session_id {
        Some(session) => {
            let sql = format!(
                "SELECT {} FROM agent_threads WHERE session_id = ?1 \
                     ORDER BY updated_at DESC{}",
                THREAD_COLUMNS,
                if limit.is_some() { " LIMIT ?2" } else { "" }
            );
            let mut stmt = conn.prepare(&sql)?;
            let rows = match limit {
                Some(limit) => stmt.query_map(params![session, limit], thread_json)?,
                None => stmt.query_map(params![session], thread_json)?,
            };
            let mut threads = Vec::new();
            for row in rows {
                threads.push(row?);
            }
            Ok(threads)
        }
        None => {
            let sql = format!(
                "SELECT {} FROM agent_threads WHERE user_id = ?1 \
                     ORDER BY updated_at DESC{}",
                THREAD_COLUMNS,
                if limit.is_some() { " LIMIT ?2" } else { "" }
            );
            let mut stmt = conn.prepare(&sql)?;
            let rows = match limit {
                Some(limit) => stmt.query_map(params![user_id, limit], thread_json)?,
                None => stmt.query_map(params![user_id], thread_json)?,
            };
            let mut threads = Vec::new();
            for row in rows {
                threads.push(row?);
            }
            Ok(threads)
        }
    })
    .await
    {
        Ok(threads) => threads,
        Err(response) => return *response,
    };

    json_response(200, json!({ "threads": threads }))
}

async fn get_thread(
    Path(id): Path<String>,
    State(state): State<ThreadRoutes>,
    request: Request,
) -> Response {
    let headers = request.headers().clone();
    let user = match auth::require_user(&state.auth, &headers).await {
        Ok(user) => user,
        Err(response) => return *response,
    };
    let user_id = user.id.clone();
    let thread = match run(&state, move |conn| select_owned_thread(conn, &id, &user_id)).await {
        Ok(thread) => thread,
        Err(response) => return *response,
    };
    match thread {
        Some(thread) => json_response(200, thread),
        None => error_response(404, "Thread not found"),
    }
}

async fn patch_thread(
    Path(id): Path<String>,
    State(state): State<ThreadRoutes>,
    request: Request,
) -> Response {
    let headers = request.headers().clone();
    let user = match auth::require_user(&state.auth, &headers).await {
        Ok(user) => user,
        Err(response) => return *response,
    };
    let user_id = user.id.clone();

    let existing = match run(&state, {
        let id = id.clone();
        let user_id = user_id.clone();
        move |conn| select_owned_thread(conn, &id, &user_id)
    })
    .await
    {
        Ok(existing) => existing,
        Err(response) => return *response,
    };
    let Some(existing) = existing else {
        return error_response(404, "Thread not found");
    };

    let body = match json_body(request).await {
        Ok(body) => body,
        Err(response) => return *response,
    };
    let Some(body) = body.as_object().cloned() else {
        return error_response(400, "Invalid request body");
    };

    let mut assignments: Vec<(&'static str, SqlValue)> = Vec::new();

    if let Some(value) = body.get("title") {
        match value {
            Value::Null => assignments.push(("title", SqlValue::Null)),
            Value::String(title) => assignments.push(("title", SqlValue::Text(title.clone()))),
            _ => {}
        }
    }

    if let Some(value) = body.get("personaAgentId") {
        match value {
            Value::Null => assignments.push(("persona_agent_id", SqlValue::Null)),
            Value::String(persona_agent_id) => {
                let checked = persona_agent_id.clone();
                let owner = user_id.clone();
                let found = run(&state, move |conn| {
                    conn.query_row(
                        "SELECT 1 FROM persona_agents WHERE id = ?1 AND user_id = ?2",
                        params![&checked, &owner],
                        |_row| Ok(()),
                    )
                    .optional()
                })
                .await;
                match found {
                    Ok(Some(())) => assignments.push((
                        "persona_agent_id",
                        SqlValue::Text(persona_agent_id.to_string()),
                    )),
                    Ok(None) => return error_response(400, "Agent profile not found"),
                    Err(response) => return *response,
                }
            }
            _ => return error_response(400, "Agent profile not found"),
        }
    }

    if let Some(value) = body.get("providerId") {
        let requested = match value {
            Value::Null => None,
            Value::String(raw) if !raw.trim().is_empty() => Some(raw.trim().to_string()),
            _ => None,
        };
        let Some(provider_id) = requested else {
            return error_response(400, "No provider available");
        };
        if let Some(check) = state.provider_check.as_ref()
            && !check(&user_id, &provider_id)
        {
            return error_response(
                400,
                &format!("Provider '{}' is not available for this user", provider_id),
            );
        }
        assignments.push(("provider_id", SqlValue::Text(provider_id)));
    }

    if let Some(value) = body.get("model") {
        match value {
            Value::Null => assignments.push(("model", SqlValue::Null)),
            Value::String(model) => assignments.push(("model", SqlValue::Text(model.clone()))),
            _ => {}
        }
    }

    if let Some(value) = body.get("reasoningEffort")
        && let Some(effort) = normalize_reasoning_effort(value)
    {
        assignments.push(("reasoning_effort", effort));
    }

    if let Some(value) = body.get("runtimeMode") {
        match value {
            Value::String(mode) if mode == "supervised" || mode == "full-access" => {
                assignments.push(("runtime_mode", SqlValue::Text(mode.clone())))
            }
            Value::String(_) => return error_response(400, "Invalid runtime mode"),
            Value::Null => assignments.push(("runtime_mode", SqlValue::Null)),
            _ => return error_response(400, "Invalid runtime mode"),
        }
    }

    if let Some(value) = body.get("kind") {
        match value {
            Value::Null => assignments.push(("kind", SqlValue::Null)),
            Value::String(kind) => assignments.push(("kind", SqlValue::Text(kind.clone()))),
            _ => {}
        }
    }

    if let Some(value) = body.get("skillIds") {
        match string_list(value) {
            Some(list) => assignments.push(("skill_ids", list)),
            None => return error_response(400, "Invalid skill ids"),
        }
    }

    if let Some(value) = body.get("workingDirectory") {
        match value {
            Value::Null => assignments.push(("working_directory", SqlValue::Null)),
            Value::String(path) => {
                assignments.push(("working_directory", SqlValue::Text(path.clone())))
            }
            _ => {}
        }
    }

    if let Some(value) = body.get("branch") {
        match value {
            Value::Null => assignments.push(("branch", SqlValue::Null)),
            Value::String(branch) => assignments.push(("branch", SqlValue::Text(branch.clone()))),
            _ => {}
        }
    }

    if let Some(value) = body.get("prTitle") {
        match value {
            Value::Null => assignments.push(("pr_title", SqlValue::Null)),
            Value::String(title) => assignments.push(("pr_title", SqlValue::Text(title.clone()))),
            _ => {}
        }
    }

    if let Some(value) = body.get("prBaseBranch") {
        match value {
            Value::Null => assignments.push(("pr_base_branch", SqlValue::Null)),
            Value::String(branch) => {
                assignments.push(("pr_base_branch", SqlValue::Text(branch.clone())))
            }
            _ => {}
        }
    }

    let mut pr_state_change: Option<String> = None;
    if let Some(value) = body.get("prState") {
        match value {
            Value::Null => assignments.push(("pr_state", SqlValue::Null)),
            Value::String(state_value) => {
                let previous = existing.get("prState").and_then(Value::as_str);
                if previous != Some(state_value.as_str()) {
                    pr_state_change = Some(state_value.clone());
                }
                assignments.push(("pr_state", SqlValue::Text(state_value.clone())));
            }
            _ => {}
        }
    }

    let updated = run(&state, move |conn| {
        let updated = update_thread(conn, &id, &assignments)?;
        if let Some(pr_state) = pr_state_change {
            // Port of the PR-state branch: activity + provider session reset.
            add_activity(
                conn,
                &id,
                "pr_state",
                &format!("PR state changed to {}", pr_state),
                None,
            )?;
            conn.execute(
                "UPDATE agent_threads SET provider_session_id = NULL, working_directory = NULL, \
                 updated_at = ?2 WHERE id = ?1",
                params![id, now_iso()],
            )?;
        }
        Ok(updated)
    })
    .await;

    match updated {
        Ok(Some(thread)) => json_response(200, thread),
        Ok(None) => error_response(404, "Thread not found"),
        Err(response) => *response,
    }
}

async fn delete_thread(
    Path(id): Path<String>,
    State(state): State<ThreadRoutes>,
    request: Request,
) -> Response {
    let headers = request.headers().clone();
    let user = match auth::require_user(&state.auth, &headers).await {
        Ok(user) => user,
        Err(response) => return *response,
    };
    let user_id = user.id.clone();

    let existing = match run(&state, {
        let id = id.clone();
        let user_id = user_id.clone();
        move |conn| select_owned_thread(conn, &id, &user_id)
    })
    .await
    {
        Ok(existing) => existing,
        Err(response) => return *response,
    };
    if existing.is_none() {
        return error_response(404, "Thread not found");
    }

    // Deferred relative to threads.ts: stopping the provider subscription and
    // removing the git worktree require services that have no native port yet.
    let removed = run(&state, move |conn| {
        conn.execute(
            "DELETE FROM agent_thread_activities WHERE thread_id = ?1",
            params![id],
        )?;
        conn.execute("DELETE FROM agent_threads WHERE id = ?1", params![id])?;
        Ok(())
    })
    .await;
    if let Err(response) = removed {
        return *response;
    }

    StatusCode::NO_CONTENT.into_response()
}

async fn thread_runtime(
    Path(id): Path<String>,
    State(state): State<ThreadRoutes>,
    request: Request,
) -> Response {
    let headers = request.headers().clone();
    let user = match auth::require_user(&state.auth, &headers).await {
        Ok(user) => user,
        Err(response) => return *response,
    };
    let user_id = user.id.clone();

    let result = run(&state, move |conn| {
        if select_owned_thread(conn, &id, &user_id)?.is_none() {
            return Ok(None);
        }
        let started_at = run_started_at(conn, &id)?;
        Ok(Some(started_at))
    })
    .await;

    match result {
        Ok(Some(started_at)) => json_response(
            200,
            json!({ "startedAt": started_at, "liveState": Value::Null }),
        ),
        Ok(None) => error_response(404, "Thread not found"),
        Err(response) => *response,
    }
}

async fn thread_activities(
    Path(id): Path<String>,
    State(state): State<ThreadRoutes>,
    request: Request,
) -> Response {
    let headers = request.headers().clone();
    let user = match auth::require_user(&state.auth, &headers).await {
        Ok(user) => user,
        Err(response) => return *response,
    };
    let query = parse_query(request.uri().query());
    let limit = parse_thread_list_limit(query.get("limit").map(String::as_str));
    let after = query
        .get("after")
        .filter(|value| !value.is_empty())
        .cloned();
    let user_id = user.id.clone();

    let result = run(&state, move |conn| {
        if select_owned_thread(conn, &id, &user_id)?.is_none() {
            return Ok(None);
        }
        let mut sql = format!(
            "SELECT {} FROM agent_thread_activities WHERE thread_id = ?1",
            ACTIVITY_COLUMNS
        );
        if after.is_some() {
            sql.push_str(" AND created_at > ?2");
        }
        sql.push_str(" ORDER BY created_at DESC, rowid DESC");
        if limit.is_some() {
            sql.push_str(if after.is_some() {
                " LIMIT ?3"
            } else {
                " LIMIT ?2"
            });
        }
        let mut stmt = conn.prepare(&sql)?;
        let rows = match (after, limit) {
            (Some(after), Some(limit)) => {
                stmt.query_map(params![id, after, limit], activity_json)?
            }
            (Some(after), None) => stmt.query_map(params![id, after], activity_json)?,
            (None, Some(limit)) => stmt.query_map(params![id, limit], activity_json)?,
            (None, None) => stmt.query_map(params![id], activity_json)?,
        };
        let mut activities = Vec::new();
        for row in rows {
            activities.push(row?);
        }
        Ok(Some(activities))
    })
    .await;

    match result {
        Ok(Some(activities)) => json_response(200, json!({ "activities": activities })),
        Ok(None) => error_response(404, "Thread not found"),
        Err(response) => *response,
    }
}

// ---------------------------------------------------------------------------
// Deferred TypeScript handlers (threads.ts)
// ---------------------------------------------------------------------------
//
// The DB-backed thread/persona-agent surface is ported above. The remaining
// handlers are deferred because they depend on native services that do not
// exist yet in `gateway-rust`:
//
// * `POST /api/threads` (threads.ts:1039-1101) — create thread. Requires the
//   provider/model bootstrap resolution (`providerRegistry.getForUser()` /
//   default-model selection) and `ThreadService.create`'s initial activity +
//   session rows; no native provider bootstrap path exists, and
//   `ThreadRoutes::with_provider_check` is the injection point prepared for it.
// * Provider turn execution / streaming / cancellation handlers
//   (threads.ts:1248-2365) — these read the live websocket session registry and
//   `providerRegistry` subscription objects, which have no native counterpart.
//   Deferred rather than stubbed so no permission or cancellation semantics are
//   weakened.
// * Attachment upload/download handlers (same range) — depend on the fs-node /
//   worktree services, not yet ported.
// * GitHub PR handlers (same range) — depend on the agent-github integration
//   service wiring; only the DB-side PR-state transition is reproduced here in
//   `patch_thread` (activity append + session reset).
// * `DELETE /api/threads/{id}` ported the DB deletion only: stopping a live
//   provider subscription and removing the git worktree require the unported
//   services above.
