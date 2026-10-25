//! Persisted chat goals over the existing session repository. Run database work
//! on DatabaseWorker. Trusted callers supply session/user identity; goals confer
//! no tool permissions and do not execute or schedule work on their own.
use crate::{
    contracts::{
        bounded_json::Utf16Text,
        ecmascript_json::{JsonDocument, JsonValue},
    },
    services::sessions::{SessionFilter, SessionService},
    text::js_whitespace,
    time::{Clock, default_clock, iso},
};
use rusqlite::{Connection, params};
use serde::Serialize;
use serde_json::{Value, json};
use std::sync::Arc;

pub type IdGenerator = Arc<dyn Fn() -> String + Send + Sync>;
pub type Wake = Arc<dyn Fn(&str) -> Result<(), String> + Send + Sync>;
pub type Broadcast = Arc<dyn Fn(&str, Value) -> Result<(), String> + Send + Sync>;
#[derive(Clone)]
pub struct LoopRuntime {
    pub clock: Clock,
    pub ids: IdGenerator,
    pub wake: Option<Wake>,
    pub broadcast: Option<Broadcast>,
}
impl Default for LoopRuntime {
    fn default() -> Self {
        Self {
            clock: default_clock(),
            ids: Arc::new(|| uuid::Uuid::new_v4().to_string()),
            wake: None,
            broadcast: None,
        }
    }
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoopMonitor {
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<Utf16Text>,
    pub reviewed_revision: f64,
    pub reviewed_at: Utf16Text,
    pub criteria_passed: Vec<bool>,
    pub progress: String,
    pub reason: Utf16Text,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatLoop {
    pub id: Utf16Text,
    pub goal: Utf16Text,
    pub criteria: Vec<Utf16Text>,
    pub status: String,
    pub iteration: f64,
    pub revision: f64,
    pub checked_iteration: f64,
    pub summary: Utf16Text,
    pub next_message: Utf16Text,
    pub evidence: Vec<Utf16Text>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub budget_start_iteration: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stalled_checks: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub unchecked_turns: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub monitor: Option<LoopMonitor>,
    pub updated_at: Utf16Text,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunningLoop {
    pub session_id: String,
    pub r#loop: ChatLoop,
}

fn clean(text: &[u16]) -> Vec<u16> {
    let white = |u: &u16| char::from_u32(u32::from(*u)).is_some_and(js_whitespace);
    let start = text.iter().position(|v| !white(v)).unwrap_or(text.len());
    let end = text
        .iter()
        .rposition(|v| !white(v))
        .map_or(start, |n| n + 1);
    text[start..end].to_vec()
}
fn field(doc: &JsonDocument, object: usize, key: &str) -> Option<usize> {
    let JsonValue::Object(fields) = &doc.nodes[object] else {
        return None;
    };
    let key: Vec<u16> = key.encode_utf16().collect();
    fields.iter().find(|(k, _)| k == &key).map(|(_, id)| *id)
}
fn text(
    doc: &JsonDocument,
    id: usize,
    minimum: usize,
    maximum: usize,
    trim: bool,
) -> Option<Utf16Text> {
    let JsonValue::String(value) = &doc.nodes[id] else {
        return None;
    };
    let value = if trim {
        clean(&value.0)
    } else {
        value.0.clone()
    };
    (value.len() >= minimum && value.len() <= maximum).then_some(Utf16Text(value))
}
#[allow(clippy::too_many_arguments)]
fn texts(
    doc: &JsonDocument,
    id: usize,
    min: usize,
    max: usize,
    item_min: usize,
    item_max: usize,
    trim: bool,
) -> Option<Vec<Utf16Text>> {
    let JsonValue::Array(values) = &doc.nodes[id] else {
        return None;
    };
    if values.len() < min || values.len() > max {
        return None;
    }
    values
        .iter()
        .map(|id| text(doc, *id, item_min, item_max, trim))
        .collect()
}
fn integer(doc: &JsonDocument, id: usize, minimum: f64) -> Option<f64> {
    let JsonValue::Number(n) = doc.nodes[id] else {
        return None;
    };
    (n.is_finite() && n.fract() == 0.0 && n >= minimum).then_some(n)
}
fn parse_monitor(doc: &JsonDocument, id: usize) -> Option<LoopMonitor> {
    let get = |key| field(doc, id, key);
    let status = String::from_utf16(&text(doc, get("status")?, 0, 20, false)?.0).ok()?;
    let progress = String::from_utf16(&text(doc, get("progress")?, 0, 20, false)?.0).ok()?;
    if !["accepted", "rejected", "unavailable", "disabled"].contains(&status.as_str())
        || !["progress", "stalled", "unknown"].contains(&progress.as_str())
    {
        return None;
    }
    let JsonValue::Array(values) = &doc.nodes[get("criteriaPassed")?] else {
        return None;
    };
    if values.len() > 20 {
        return None;
    }
    let criteria_passed = values
        .iter()
        .map(|id| match doc.nodes[*id] {
            JsonValue::Boolean(value) => Some(value),
            _ => None,
        })
        .collect::<Option<Vec<_>>>()?;
    Some(LoopMonitor {
        status,
        progress,
        criteria_passed,
        model: match get("model") {
            Some(id) => Some(text(doc, id, 0, 200, false)?),
            None => None,
        },
        reviewed_revision: integer(doc, get("reviewedRevision")?, 0.0)?,
        reviewed_at: text(doc, get("reviewedAt")?, 0, usize::MAX, false)?,
        reason: text(doc, get("reason")?, 0, 2000, false)?,
    })
}
fn parse_at(doc: &JsonDocument, id: usize) -> Option<ChatLoop> {
    let get = |key| field(doc, id, key);
    let status = text(doc, get("status")?, 0, usize::MAX, false)?;
    let status = String::from_utf16(&status.0).ok()?;
    if !["running", "paused", "waiting", "completed", "error"].contains(&status.as_str()) {
        return None;
    }
    Some(ChatLoop {
        id: text(doc, get("id")?, 1, usize::MAX, false)?,
        goal: text(doc, get("goal")?, 1, 8000, true)?,
        criteria: texts(doc, get("criteria")?, 1, 20, 1, 2000, true)?,
        status,
        iteration: integer(doc, get("iteration")?, 0.0)?,
        revision: integer(doc, get("revision")?, 0.0)?,
        checked_iteration: integer(doc, get("checkedIteration")?, -1.0)?,
        summary: text(doc, get("summary")?, 0, 8000, false)?,
        next_message: text(doc, get("nextMessage")?, 0, 8000, false)?,
        evidence: texts(doc, get("evidence")?, 0, 20, 0, 2000, false)?,
        budget_start_iteration: match get("budgetStartIteration") {
            Some(id) => Some(integer(doc, id, 0.0)?),
            None => None,
        },
        stalled_checks: match get("stalledChecks") {
            Some(id) => Some(integer(doc, id, 0.0)?),
            None => None,
        },
        unchecked_turns: match get("uncheckedTurns") {
            Some(id) => Some(integer(doc, id, 0.0)?),
            None => None,
        },
        monitor: match get("monitor") {
            Some(id) => Some(parse_monitor(doc, id)?),
            None => None,
        },
        updated_at: text(doc, get("updatedAt")?, 0, usize::MAX, false)?,
    })
}
pub fn read_chat_loop(metadata: Option<&str>) -> Option<ChatLoop> {
    let doc = JsonDocument::parse(metadata?).ok()?;
    parse_at(&doc, field(&doc, doc.root, "loop")?)
}
fn type_name(value: Option<&Value>) -> &'static str {
    match value {
        None => "undefined",
        Some(Value::Null) => "null",
        Some(Value::Bool(_)) => "boolean",
        Some(Value::Number(_)) => "number",
        Some(Value::String(_)) => "string",
        Some(Value::Array(_)) => "array",
        Some(Value::Object(_)) => "object",
    }
}
fn type_issue(expected: &str, value: Option<&Value>, path: Vec<Value>) -> Value {
    let received = type_name(value);
    json!({"code":"invalid_type","expected":expected,"received":received,"path":path,
        "message":if received=="undefined"{"Required".to_owned()}else{format!("Expected {expected}, received {received}")}})
}
fn size_issue(kind: &str, minimum: bool, bound: usize, path: Vec<Value>) -> Value {
    let relation = if minimum { "at least" } else { "at most" };
    let what = if kind == "string" {
        format!("String must contain {relation} {bound} character(s)")
    } else {
        format!("Array must contain {relation} {bound} element(s)")
    };
    let mut issue = json!({"code":if minimum{"too_small"}else{"too_big"}});
    issue[if minimum { "minimum" } else { "maximum" }] = json!(bound);
    issue["type"] = json!(kind);
    issue["inclusive"] = json!(true);
    issue["exact"] = json!(false);
    issue["message"] = json!(what);
    issue["path"] = json!(path);
    issue
}
fn string_input(
    value: Option<&Value>,
    path: Vec<Value>,
    min: usize,
    max: usize,
    trim: bool,
    issues: &mut Vec<Value>,
) -> Utf16Text {
    let Some(value) = value.and_then(Value::as_str) else {
        issues.push(type_issue("string", value, path));
        return Utf16Text(vec![]);
    };
    let units: Vec<u16> = value.encode_utf16().collect();
    let units = if trim { clean(&units) } else { units };
    if units.len() < min {
        issues.push(size_issue("string", true, min, path.clone()))
    }
    if units.len() > max {
        issues.push(size_issue("string", false, max, path))
    }
    Utf16Text(units)
}
#[allow(clippy::too_many_arguments)]
fn array_input(
    value: Option<&Value>,
    key: &str,
    min: usize,
    max: usize,
    item_min: usize,
    item_max: usize,
    trim: bool,
    issues: &mut Vec<Value>,
) -> Vec<Utf16Text> {
    let Some(values) = value.and_then(Value::as_array) else {
        issues.push(type_issue("array", value, vec![json!(key)]));
        return vec![];
    };
    if values.len() < min {
        issues.push(size_issue("array", true, min, vec![json!(key)]))
    }
    if values.len() > max {
        issues.push(size_issue("array", false, max, vec![json!(key)]))
    }
    values
        .iter()
        .enumerate()
        .map(|(i, v)| {
            string_input(
                Some(v),
                vec![json!(key), json!(i)],
                item_min,
                item_max,
                trim,
                issues,
            )
        })
        .collect()
}
fn schema_result(issues: Vec<Value>) -> Result<(), String> {
    if issues.is_empty() {
        Ok(())
    } else {
        Err(serde_json::to_string_pretty(&issues).expect("schema issues"))
    }
}
fn wire<T: Serialize>(value: &T) -> String {
    JsonDocument::parse(&serde_json::to_string(value).expect("serializable loop data"))
        .expect("valid loop JSON")
        .stringify()
}
fn merge_metadata(metadata: Option<&str>, saved: &ChatLoop) -> String {
    let mut fields: Vec<(Utf16Text, String)> = vec![];
    if let Some(doc) = metadata.and_then(|v| JsonDocument::parse(v).ok()) {
        match &doc.nodes[doc.root] {
            JsonValue::Object(values) => {
                for (key, id) in values {
                    let mut sub = doc.clone();
                    sub.root = *id;
                    fields.push((Utf16Text(key.clone()), sub.stringify()));
                }
            }
            JsonValue::Array(values) => {
                for (i, id) in values.iter().enumerate() {
                    let mut sub = doc.clone();
                    sub.root = *id;
                    fields.push((Utf16Text::from(i.to_string()), sub.stringify()));
                }
            }
            JsonValue::String(value) => {
                for (i, unit) in value.0.iter().enumerate() {
                    fields.push((
                        Utf16Text::from(i.to_string()),
                        wire(&Utf16Text(vec![*unit])),
                    ));
                }
            }
            _ => {}
        }
    }
    let key = Utf16Text::from("loop");
    let saved = wire(saved);
    if let Some((_, value)) = fields.iter_mut().find(|(k, _)| k == &key) {
        *value = saved
    } else {
        fields.push((key, saved))
    }
    let raw = format!(
        "{{{}}}",
        fields
            .iter()
            .map(|(key, value)| format!("{}:{value}", wire(key)))
            .collect::<Vec<_>>()
            .join(",")
    );
    JsonDocument::parse(&raw)
        .expect("valid metadata")
        .stringify()
}
pub struct ChatLoopService<'a> {
    db: &'a Connection,
    runtime: LoopRuntime,
}
impl<'a> ChatLoopService<'a> {
    pub fn new(db: &'a Connection, runtime: LoopRuntime) -> Self {
        Self { db, runtime }
    }
    pub fn get(&self, id: &str, user: Option<&str>) -> Result<Option<ChatLoop>, String> {
        Ok(SessionService::new(self.db)
            .get(id, user)
            .map_err(|e| e.to_string())?
            .and_then(|s| read_chat_loop(s.metadata.as_deref())))
    }
    fn save(&self, id: &str, mut state: ChatLoop, user: Option<&str>) -> Result<ChatLoop, String> {
        let sessions = SessionService::new(self.db);
        let session = sessions
            .get(id, user)
            .map_err(|e| e.to_string())?
            .filter(|s| s.status.as_deref() == Some("active"))
            .ok_or("Active chat not found")?;
        state.revision += 1.0;
        state.updated_at = Utf16Text::from(iso((self.runtime.clock)())?);
        let mut issues = vec![];
        for (key, value, limit) in [
            ("summary", &state.summary, 8000),
            ("nextMessage", &state.next_message, 8000),
        ] {
            if value.0.len() > limit {
                issues.push(size_issue("string", false, limit, vec![json!(key)]))
            }
        }
        if state.evidence.len() > 20 {
            issues.push(size_issue("array", false, 20, vec![json!("evidence")]))
        }
        for (index, value) in state.evidence.iter().enumerate() {
            if value.0.len() > 2000 {
                issues.push(size_issue(
                    "string",
                    false,
                    2000,
                    vec![json!("evidence"), json!(index)],
                ))
            }
        }
        schema_result(issues)?;
        let metadata = merge_metadata(session.metadata.as_deref(), &state);
        let user = user.filter(|s| !s.is_empty());
        self.db
            .execute(
                "UPDATE sessions SET metadata=?1 WHERE id=?2 AND (?3 IS NULL OR user_id=?3)",
                params![metadata, id, user],
            )
            .map_err(|e| e.to_string())?;
        let updated = sessions
            .get(id, None)
            .map_err(|e| e.to_string())?
            .ok_or("Active chat not found")?;
        if let Some(user) = updated.user_id.as_deref().filter(|s| !s.is_empty())
            && let Some(broadcast) = &self.runtime.broadcast
        {
            broadcast(
                user,
                json!({"type":"chat.updated","sessionId":id,"timestamp":state.updated_at,"payload":{"session":updated}}),
            )?;
        }
        if state.status == "running"
            && let Some(wake) = &self.runtime.wake
        {
            wake(id)?;
        }
        Ok(state)
    }
    pub fn goal(
        &self,
        id: &str,
        goal: Option<&Value>,
        criteria: Option<&Value>,
        user: Option<&str>,
    ) -> Result<ChatLoop, String> {
        // Generate identity in the same order as the reference, including failures.
        let key = (self.runtime.ids)();
        let old = self.get(id, user)?;
        let mut issues = vec![];
        let goal = string_input(goal, vec![json!("goal")], 1, 8000, true, &mut issues);
        let criteria = array_input(criteria, "criteria", 1, 20, 1, 2000, true, &mut issues);
        schema_result(issues)?;
        self.save(
            id,
            ChatLoop {
                id: Utf16Text::from(key),
                goal,
                criteria,
                status: "running".into(),
                iteration: 0.0,
                revision: old.map_or(0.0, |s| s.revision),
                checked_iteration: -1.0,
                summary: Utf16Text(vec![]),
                next_message: Utf16Text(vec![]),
                evidence: vec![],
                budget_start_iteration: None,
                stalled_checks: None,
                unchecked_turns: None,
                monitor: None,
                updated_at: Utf16Text::from(iso((self.runtime.clock)())?),
            },
            user,
        )
    }
    pub fn control(&self, id: &str, action: &str, user: Option<&str>) -> Result<ChatLoop, String> {
        let mut state = self.get(id, user)?.ok_or("This chat has no loop goal")?;
        if state.status == "completed" {
            return Err("Set a new goal to start another loop".into());
        }
        state.status = if action == "resume" {
            "running"
        } else {
            "paused"
        }
        .into();
        state.checked_iteration = -1.0;
        if action == "resume" {
            state.budget_start_iteration = Some(state.iteration);
            state.stalled_checks = Some(0.0);
            state.unchecked_turns = Some(0.0);
        }
        self.save(id, state, user)
    }
    pub fn resume_after_answer(
        &self,
        id: &str,
        request: &str,
        user: Option<&str>,
    ) -> Result<Option<ChatLoop>, String> {
        let Some(mut state) = self.get(id, user)? else {
            return Ok(None);
        };
        if state.status != "waiting" {
            return Ok(Some(state));
        }
        state.status = "running".into();
        state.checked_iteration = -1.0;
        state.next_message = Utf16Text::from(format!(
            "The user submitted an answer. Retrieve it with user.ask using requestId={} before taking dependent actions, then continue the goal.",
            wire(&request)
        ));
        self.save(id, state, user).map(Some)
    }
    pub fn check(&self, id: &str, input: &Value, user: Option<&str>) -> Result<ChatLoop, String> {
        self.check_inner(id, input, user, false)
    }
    /// Only the unconfigured monitor path is reconstructed here. Configured
    /// model review remains pending native host composition in the coverage ledger.
    pub fn check_unmonitored(
        &self,
        id: &str,
        input: &Value,
        user: Option<&str>,
    ) -> Result<ChatLoop, String> {
        self.check_inner(id, input, user, true)
    }
    fn check_inner(
        &self,
        id: &str,
        input: &Value,
        user: Option<&str>,
        monitored: bool,
    ) -> Result<ChatLoop, String> {
        let mut state = self
            .get(id, user)?
            .filter(|s| s.status == "running" && Some(s.revision) == input["revision"].as_f64())
            .ok_or("Loop changed or is stopped. Read loop.status before checking again.")?;
        let outcome = input["outcome"].as_str().unwrap_or("");
        if !["continue", "complete", "waiting"].contains(&outcome) {
            return Err("Invalid loop outcome".into());
        }
        let summary = input["summary"]
            .as_str()
            .map(crate::text::js_trim)
            .filter(|s| !s.is_empty())
            .ok_or("A progress summary is required")?;
        let read_next = || -> Result<&str, String> {
            match input.get("nextMessage") {
                None | Some(Value::Null) => Ok(""),
                Some(Value::String(s)) => Ok(crate::text::js_trim(s)),
                _ => Err("input.nextMessage?.trim is not a function. (In 'input.nextMessage?.trim()', 'input.nextMessage?.trim' is undefined)".into()),
            }
        };
        if outcome == "continue" && read_next()?.is_empty() {
            return Err("Define the next message before continuing".into());
        }
        let empty = vec![];
        let evidence = input.get("evidence").filter(|v| !v.is_null());
        if outcome == "complete"
            && !evidence.and_then(Value::as_array).is_some_and(|e| {
                e.len() == state.criteria.len()
                    && e.iter().all(|v| {
                        v.as_str()
                            .is_some_and(|s| !crate::text::js_trim(s).is_empty())
                    })
            })
        {
            return Err("Completion needs one nonblank piece of verification evidence per acceptance criterion, in order".into());
        }
        // The reference builds nextMessage after checking completion evidence,
        // but before schema validation of the newly assembled state.
        let next = input
            .get("nextMessage")
            .and_then(Value::as_str)
            .map(crate::text::js_trim)
            .unwrap_or("");
        let mut issues = vec![];
        if let Some(value) = input
            .get("nextMessage")
            .filter(|v| !v.is_null() && !v.is_string())
        {
            issues.push(type_issue(
                "string",
                Some(value),
                vec![json!("nextMessage")],
            ));
        }
        if input["summary"]
            .as_str()
            .unwrap_or("")
            .encode_utf16()
            .count()
            > 8000
        {
            issues.push(size_issue("string", false, 8000, vec![json!("summary")]))
        }
        if input["nextMessage"]
            .as_str()
            .unwrap_or("")
            .encode_utf16()
            .count()
            > 8000
        {
            issues.push(size_issue(
                "string",
                false,
                8000,
                vec![json!("nextMessage")],
            ))
        }
        let values = match evidence {
            None => &empty,
            Some(Value::Array(v)) => v,
            other => {
                issues.push(type_issue("array", other, vec![json!("evidence")]));
                &empty
            }
        };
        if values.len() > 20 {
            issues.push(size_issue("array", false, 20, vec![json!("evidence")]))
        }
        let evidence = values
            .iter()
            .enumerate()
            .map(|(i, v)| {
                string_input(
                    Some(v),
                    vec![json!("evidence"), json!(i)],
                    0,
                    2000,
                    false,
                    &mut issues,
                )
            })
            .collect();
        schema_result(issues)?;
        if monitored && outcome != "waiting" {
            let repeated = state.checked_iteration < state.iteration
                && state.summary.0 == summary.encode_utf16().collect::<Vec<_>>()
                && wire(&state.evidence) == wire(&evidence);
            let stalled = if repeated {
                state.stalled_checks.unwrap_or(0.0) + 1.0
            } else {
                0.0
            };
            state.stalled_checks = Some(stalled);
            state.monitor = Some(LoopMonitor {
                status: "disabled".into(),
                model: None,
                reviewed_revision: state.revision,
                reviewed_at: Utf16Text::from(iso((self.runtime.clock)())?),
                criteria_passed: vec![],
                progress: "unknown".into(),
                reason: Utf16Text::from(
                    "System One is not configured; using agent evidence checks.",
                ),
            });
            if outcome != "complete" && stalled >= 3.0 {
                let reason = "Loop paused after three stalled checkpoints. Review the goal and explicitly resume.";
                state.status = "paused".into();
                state.checked_iteration = state.iteration;
                state.summary = Utf16Text(
                    format!("{reason} Last checkpoint: {summary}")
                        .encode_utf16()
                        .take(8000)
                        .collect(),
                );
                state.next_message = Utf16Text::from(reason);
                state.evidence = evidence;
                return self.save(id, state, user);
            }
        }
        state.status = match outcome {
            "complete" => "completed",
            "waiting" => "waiting",
            _ => "running",
        }
        .into();
        state.checked_iteration = state.iteration;
        state.summary = Utf16Text::from(summary);
        state.next_message = Utf16Text::from(next);
        state.evidence = evidence;
        self.save(id, state, user)
    }
    pub fn finish_turn(
        &self,
        id: &str,
        error: Option<&str>,
        cancelled: bool,
    ) -> Result<Option<ChatLoop>, String> {
        let Some(mut state) = self.get(id, None)? else {
            return Ok(None);
        };
        let checked = state.checked_iteration == state.iteration;
        let unchecked = if checked {
            0.0
        } else {
            state.unchecked_turns.unwrap_or(0.0) + 1.0
        };
        state.unchecked_turns = Some(unchecked);
        state.iteration += 1.0;
        if state.status == "running"
            && (state.iteration - state.budget_start_iteration.unwrap_or(0.0) >= 50.0
                || unchecked >= 3.0)
        {
            state.status = "paused".into();
            state.summary = Utf16Text::from(
                "Loop paused at its turn/checkpoint limit. Review progress and explicitly resume to renew the budget.",
            );
        }
        if let Some(error) = error.filter(|s| !s.is_empty()) {
            state.status = "error".into();
            state.summary = Utf16Text(error.encode_utf16().take(8000).collect());
        } else if cancelled {
            state.status = "paused".into()
        }
        if !checked {
            state.next_message = Utf16Text::from(
                "Review progress against every acceptance criterion. Verify completed work before repeating actions. Decide the next concrete step and continue the goal.",
            );
        }
        self.save(id, state, None).map(Some)
    }
    pub fn running(&self) -> Result<Vec<RunningLoop>, String> {
        Ok(SessionService::new(self.db)
            .list(SessionFilter {
                status: Some("active"),
                ..Default::default()
            })
            .map_err(|e| e.to_string())?
            .into_iter()
            .filter_map(|s| {
                read_chat_loop(s.metadata.as_deref())
                    .filter(|v| v.status == "running")
                    .map(|r#loop| RunningLoop {
                        session_id: s.id,
                        r#loop,
                    })
            })
            .collect())
    }
}
pub fn chat_loop_instructions(state: Option<&ChatLoop>) -> Option<Utf16Text> {
    let s = state.filter(|s| s.status != "completed")?;
    if s.status != "running" {
        let lines = [
            Utf16Text::from(
                "A saved user-authorized chat goal loop is stopped. Automatic continuation is inactive.",
            ),
            Utf16Text::from(format!("Goal: {}", wire(&s.goal))),
            Utf16Text::from(format!("Acceptance criteria: {}", wire(&s.criteria))),
            Utf16Text::from(format!(
                "Loop status: {}; revision: {}; completed turns: {}.",
                s.status,
                ryu_js::Buffer::new().format(s.revision),
                ryu_js::Buffer::new().format(s.iteration)
            )),
            Utf16Text::from(format!("Last checkpoint or error: {}", wire(&s.summary))),
            Utf16Text::from(
                "Do not silently continue this goal while leaving its loop stopped. If the latest user instruction explicitly asks to resume or continue this saved goal, discover and call loop.status, then loop.resume before working on it. After resuming, call loop.check before ending the turn; continue until every criterion is verified. Otherwise explain the saved status when relevant and leave it stopped. Background notifications and unrelated messages do not authorize resumption. Never retry provider errors automatically or bypass pending questions, approvals, security scope or tool limits.",
            ),
        ];
        return Some(Utf16Text(
            lines.into_iter().map(|s| s.0).collect::<Vec<_>>().join(&10),
        ));
    }
    let mut lines = vec![
        Utf16Text::from(
            "An explicit user-authorized chat goal loop is active. Work towards this goal across turns.",
        ),
        Utf16Text::from(format!("Goal: {}", wire(&s.goal))),
        Utf16Text::from(format!("Acceptance criteria: {}", wire(&s.criteria))),
        Utf16Text::from(format!(
            "Loop revision: {}; completed turns: {}.",
            ryu_js::Buffer::new().format(s.revision),
            ryu_js::Buffer::new().format(s.iteration)
        )),
        Utf16Text::from(format!("Progress: {}", wire(&s.summary))),
        Utf16Text::from(format!(
            "Gateway monitor: {}. At most 50 turns per explicit resume; three stalled checkpoints or unchecked turns pause continuation. System One reviews reported evidence when configured and can reject completion or pause on review failure.",
            wire(&s.monitor)
        )),
    ];
    lines.push(Utf16Text::from("Before ending this turn, discover and call loop.check. Read loop.status for the current revision first. Check every criterion against actual evidence; use outcome=complete only after all criteria have passed, supplying one verification evidence entry per criterion. Otherwise use outcome=continue and write the next concrete message to yourself. If a user answer is required, use user.ask; if the turn must end awaiting input, use outcome=waiting and describe the question. Never treat missing approval as permission. Existing consent, assessment scopes, exclusions and tool limits still apply. Do not start additional agents unless the user authorized them."));
    Some(Utf16Text(
        lines.into_iter().map(|s| s.0).collect::<Vec<_>>().join(&10),
    ))
}
