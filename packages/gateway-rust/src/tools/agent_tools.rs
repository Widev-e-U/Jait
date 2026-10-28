//! Native port of `packages/gateway/src/tools/agent-tools.ts`.
//!
//! TS exposes a single builtin tool, `agent.spawn` (`createAgentSpawnTool`), which
//! launches a sub-agent with its own conversation and tool set, then collapses the
//! run into one result for the parent assistant.
//!
//! Execution is injected through [`AgentSpawnHost`] so the module stays independent of
//! the (not yet ported) agent loop and provider stack:
//!   * `run_acp_turn` — ACP-backed sub-agent (the default in TS when ACP is available),
//!   * `run_subagent_loop` — legacy in-process agent loop fallback.
//!
//! Result shaping reuses [`crate::tools::agent_communication`] so performative tags
//! (`[inform] …`) and render-segment whitespace behave exactly like the TS helpers.

use serde_json::{json, Map, Value};

use crate::text::js_trim;
use crate::tools::agent_communication::{
    is_successful_performative, parse_performative, strip_performative_tag,
};

/// Read-only subset handed to a sub-agent when the caller does not pass `allowedTools`.
pub const DEFAULT_SUBAGENT_TOOLS: &[&str] = &[
    "file.read",
    "file.list",
    "search.files",
    "search.content",
    "web.search",
    "web.fetch",
    "terminal.run",
    "todo.list",
    "todo.add",
    "todo.update",
];

/// Default round budget for the in-process fallback loop.
pub const SUBAGENT_MAX_ROUNDS: u32 = 30;

/// Names declared by this module, matching the TS dotted tool names.
pub const TOOL_NAMES: &[&str] = &["agent.spawn"];

/// Parsed tool metadata, mirroring `TOOL_DEFINITION` in the TS module.
pub fn metadata() -> Vec<Value> {
    serde_json::from_str(include_str!("agent-tools-metadata.json"))
        .expect("agent-tools-metadata.json is valid JSON")
}

pub fn names() -> Vec<&'static str> {
    TOOL_NAMES.to_vec()
}

pub fn definition(name: &str) -> Option<Value> {
    metadata()
        .into_iter()
        .find(|d| d.get("name").and_then(Value::as_str) == Some(name))
}

/// Mirrors `buildSubAgentSystemPrompt`: a task header plus optional context block.
pub fn build_subagent_system_prompt(description: &str, details: Option<&str>) -> String {
    let mut out = String::from(
        "You are a sub-agent launched by the main assistant to complete one delegated task.\n\n",
    );
    out.push_str("Task: ");
    out.push_str(js_trim(description));
    if let Some(details) = details {
        let details = js_trim(details);
        if !details.is_empty() {
            out.push_str("\n\nAdditional context:\n");
            out.push_str(details);
        }
    }
    out.push_str(
        "\n\nWork autonomously with the tools you were given, then report back with a \
concrete summary of what you did and found. Do not ask follow-up questions.",
    );
    out
}

/// Mirrors the TS `allowedTools` normalization: comma split, trim, drop empties.
pub fn parse_allowed_tools(raw: Option<&str>) -> Vec<String> {
    match raw {
        None => DEFAULT_SUBAGENT_TOOLS.iter().map(|s| (*s).to_string()).collect(),
        Some(raw) => raw
            .split(',')
            .map(js_trim)
            .filter(|t| !t.is_empty())
            .map(str::to_string)
            .collect(),
    }
}

/// Rewrites text segments so a leading performative tag is not shown to the parent.
/// Non-text segments and all other keys pass through untouched.
pub fn render_segments(segments: &[Value]) -> Vec<Value> {
    segments
        .iter()
        .map(|segment| {
            let Some(obj) = segment.as_object() else {
                return segment.clone();
            };
            if obj.get("type").and_then(Value::as_str) != Some("text") {
                return segment.clone();
            }
            // MessageSegment text segments carry `content`, not `text`.
            let Some(text) = obj
                .get("content")
                .and_then(Value::as_str)
                .or_else(|| obj.get("text").and_then(Value::as_str))
            else {
                return segment.clone();
            };
            let mut out = obj.clone();
            let key = if obj.contains_key("content") { "content" } else { "text" };
            out.insert(
                key.into(),
                Value::String(strip_performative_tag(text).to_string()),
            );
            Value::Object(out)
        })
        .collect()
}

/// Mirrors the TS tool-call projection handed back to the parent.
///
/// TS emits `{callId, tool, args, ok, message, data, startedAt, completedAt}`
/// for every executed call on all exit paths, so a cancelled sub-agent still
/// renders its calls on reload. Inputs shaped as `{id,name,input,...}` (the raw
/// LLM tool-use block) are accepted as aliases.
pub fn render_tool_calls(calls: &[Value]) -> Vec<Value> {
    calls
        .iter()
        .map(|call| {
            let mut out = Map::new();
            let Some(obj) = call.as_object() else {
                return Value::Object(out);
            };
            let pick = |keys: &[&str]| -> Option<Value> {
                keys.iter().find_map(|k| obj.get(*k).cloned())
            };
            out.insert(
                "callId".into(),
                pick(&["callId", "id"]).unwrap_or(Value::Null),
            );
            out.insert("tool".into(), pick(&["tool", "name"]).unwrap_or(Value::Null));
            out.insert(
                "args".into(),
                pick(&["args", "input"]).unwrap_or(Value::Null),
            );
            out.insert("ok".into(), pick(&["ok"]).unwrap_or(Value::Null));
            out.insert("message".into(), pick(&["message"]).unwrap_or(Value::Null));
            out.insert("data".into(), pick(&["data"]).unwrap_or(Value::Null));
            out.insert(
                "startedAt".into(),
                pick(&["startedAt"]).unwrap_or(Value::Null),
            );
            out.insert(
                "completedAt".into(),
                pick(&["completedAt"]).unwrap_or(Value::Null),
            );
            Value::Object(out)
        })
        .collect()
}

/// Everything the host needs to run one delegated task.
#[derive(Debug, Clone, PartialEq)]
pub struct SubAgentRequest {
    pub description: String,
    pub prompt: String,
    pub details: Option<String>,
    pub allowed_tools: Vec<String>,
    pub system_prompt: String,
    pub max_rounds: u32,
}

/// Raw output of a sub-agent run, before parent-facing shaping.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct SubAgentRun {
    pub sub_agent_id: Option<String>,
    /// Final assistant text. This is what TS parses for the performative tag.
    pub content: String,
    pub segments: Vec<Value>,
    pub tool_calls: Vec<Value>,
    pub rounds: u32,
    /// Set when the run stopped because the caller cancelled it.
    pub aborted: bool,
    pub duration_ms: u64,
}

/// Host-side failure. `cancelled` distinguishes cancellation from a hard error.
#[derive(Debug, Clone, PartialEq)]
pub struct SubAgentFailure {
    pub message: String,
    pub cancelled: bool,
}

impl SubAgentFailure {
    pub fn error(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
            cancelled: false,
        }
    }

    pub fn cancelled() -> Self {
        Self {
            message: "Sub-agent was cancelled".into(),
            cancelled: true,
        }
    }
}

/// Per-call context supplied by the tool registry.
#[derive(Debug, Clone, Default)]
pub struct AgentToolContext {
    /// Provider id, used only in the "not available" message.
    pub provider: String,
    /// Optional reason the host cannot delegate at all (no agent loop / no model).
    pub unavailable_reason: Option<String>,
}

/// Runtime services backing `agent.spawn`.
pub trait AgentSpawnHost {
    /// Whether a tool name exists in the child registry.
    fn tool_exists(&self, name: &str) -> bool;
    /// Whether the ACP runner is usable; TS prefers ACP over the in-process loop.
    fn acp_available(&self) -> bool;
    /// ACP-backed sub-agent run.
    fn run_acp_turn(&self, request: &SubAgentRequest) -> Result<SubAgentRun, SubAgentFailure>;
    /// Legacy in-process agent loop.
    fn run_subagent_loop(&self, request: &SubAgentRequest) -> Result<SubAgentRun, SubAgentFailure>;
    /// Cancellation probe, polled before and after the run.
    fn is_cancelled(&self) -> bool {
        false
    }
}

fn err(message: impl Into<String>) -> Value {
    json!({ "ok": false, "message": message.into() })
}

/// Executes `agent.spawn` with TS-compatible argument parsing and result shaping.
pub fn execute(input: &Value, ctx: &AgentToolContext, host: &dyn AgentSpawnHost) -> Value {
    let prompt = input
        .get("prompt")
        .and_then(Value::as_str)
        .map(js_trim)
        .unwrap_or_default();
    if prompt.is_empty() {
        return err("prompt is required");
    }

    let description = input
        .get("description")
        .and_then(Value::as_str)
        .map(js_trim)
        .filter(|d| !d.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| prompt.chars().take(60).collect::<String>());

    let details = input
        .get("details")
        .and_then(Value::as_str)
        .map(js_trim)
        .filter(|d| !d.is_empty())
        .map(str::to_string);

    let allowed_tools = parse_allowed_tools(input.get("allowedTools").and_then(Value::as_str));
    let unknown: Vec<&str> = allowed_tools
        .iter()
        .map(String::as_str)
        .filter(|name| !host.tool_exists(name))
        .collect();
    if !unknown.is_empty() {
        return err(format!(
            "Sub-agent requested unknown tools: {}",
            unknown.join(", ")
        ));
    }
    if allowed_tools.is_empty() {
        return err("Sub-agent needs at least one allowed tool");
    }

    if host.is_cancelled() {
        return err("Cancelled before sub-agent started");
    }
    if let Some(reason) = ctx.unavailable_reason.as_deref() {
        return err(format!(
            "Sub-agent delegation isn't available for provider \"{}\": {}",
            ctx.provider, reason
        ));
    }

    let request = SubAgentRequest {
        description: description.clone(),
        prompt: prompt.to_string(),
        system_prompt: build_subagent_system_prompt(&description, details.as_deref()),
        details,
        allowed_tools,
        max_rounds: SUBAGENT_MAX_ROUNDS,
    };

    let run = if host.acp_available() {
        host.run_acp_turn(&request)
    } else {
        host.run_subagent_loop(&request)
    };

    let run = match run {
        Ok(run) => run,
        Err(failure) if failure.cancelled => return err(failure.message),
        Err(failure) => return err(format!("Sub-agent failed: {}", failure.message)),
    };

    let segments = render_segments(&run.segments);
    let tool_calls = render_tool_calls(&run.tool_calls);

    // TS checks `result.aborted` (the sub-loop sets it when its abort signal
    // fired). The native host trait exposes a cancellation probe instead, so a
    // probe that trips after the run is treated as the same aborted outcome.
    let aborted = run.aborted || host.is_cancelled();
    if aborted {
        return json!({
            "ok": false,
            "message": "Sub-agent was cancelled",
            "data": {
                "subAgentId": run.sub_agent_id,
                "partialContent": run.content,
                "segments": segments,
                "rounds": run.rounds,
                "toolCalls": tool_calls,
                "durationMs": run.duration_ms,
            }
        });
    }

    // TS parses `result.content`. Runtimes that only hand back structured
    // segments leave `content` empty, so fall back to joined text segments.
    let text = if js_trim(&run.content).is_empty() {
        segments
            .iter()
            .filter(|s| s.get("type").and_then(Value::as_str) == Some("text"))
            .filter_map(|s| {
                s.get("content")
                    .and_then(Value::as_str)
                    .or_else(|| s.get("text").and_then(Value::as_str))
            })
            .map(js_trim)
            .filter(|t| !t.is_empty())
            .collect::<Vec<_>>()
            .join("\n")
    } else {
        run.content.clone()
    };

    // [REFUSE]/[FAILURE]/[QUERY] mean the delegated task did not succeed even
    // though the loop ran: TS reports ok:false, it does not raise.
    let parsed = parse_performative(&text);
    let ok = is_successful_performative(parsed.performative);
    let message = if !parsed.content.is_empty() {
        parsed.content.clone()
    } else if ok {
        "Sub-agent completed with no output".to_string()
    } else {
        format!("Sub-agent {}: no details given", parsed.performative)
    };

    json!({
        "ok": ok,
        "message": message,
        "data": {
            "subAgentId": run.sub_agent_id,
            "content": parsed.content,
            "performative": parsed.performative,
            "segments": segments,
            "rounds": run.rounds,
            "toolCalls": tool_calls,
            "durationMs": run.duration_ms,
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;

    #[derive(Default)]
    struct FakeHost {
        known: Vec<&'static str>,
        acp: bool,
        cancelled: bool,
        run: Option<SubAgentRun>,
        failure: Option<SubAgentFailure>,
        used: RefCell<Vec<&'static str>>,
        descriptions: RefCell<Vec<String>>,
    }

    impl FakeHost {
        fn permissive() -> Self {
            Self {
                known: DEFAULT_SUBAGENT_TOOLS.to_vec(),
                ..Default::default()
            }
        }
    }

    impl AgentSpawnHost for FakeHost {
        fn tool_exists(&self, name: &str) -> bool {
            self.known.contains(&name)
        }
        fn acp_available(&self) -> bool {
            self.acp
        }
        fn run_acp_turn(&self, r: &SubAgentRequest) -> Result<SubAgentRun, SubAgentFailure> {
            self.used.borrow_mut().push("acp");
            self.descriptions.borrow_mut().push(r.description.clone());
            match (&self.run, &self.failure) {
                (_, Some(f)) => Err(f.clone()),
                (Some(r), _) => Ok(r.clone()),
                (None, None) => Ok(SubAgentRun::default()),
            }
        }
        fn run_subagent_loop(&self, r: &SubAgentRequest) -> Result<SubAgentRun, SubAgentFailure> {
            self.used.borrow_mut().push("loop");
            self.descriptions.borrow_mut().push(r.description.clone());
            match (&self.run, &self.failure) {
                (_, Some(f)) => Err(f.clone()),
                (Some(r), _) => Ok(r.clone()),
                (None, None) => Ok(SubAgentRun::default()),
            }
        }
        fn is_cancelled(&self) -> bool {
            self.cancelled
        }
    }

    fn inform_run(text: &str) -> SubAgentRun {
        SubAgentRun {
            sub_agent_id: Some("sa_1".into()),
            content: text.to_string(),
            segments: vec![json!({ "type": "text", "content": text })],
            tool_calls: vec![json!({
                "callId": "c1",
                "tool": "file.read",
                "args": { "path": "a" },
                "ok": true,
                "message": "read a",
                "data": { "bytes": 3 },
                "startedAt": 1,
                "completedAt": 2,
            })],
            rounds: 3,
            aborted: false,
            duration_ms: 42,
        }
    }

    #[test]
    fn metadata_declares_single_dotted_tool() {
        let meta = metadata();
        assert_eq!(meta.len(), 1);
        assert_eq!(meta[0]["name"], "agent.spawn");
        assert_eq!(names(), vec!["agent.spawn"]);
        let req = meta[0]["parameters"]["required"].as_array().unwrap();
        assert_eq!(req, &vec![json!("prompt"), json!("description")]);
        assert!(definition("agent.spawn").is_some());
        assert!(definition("agent.list").is_none());
    }

    #[test]
    fn prompt_includes_task_and_optional_details() {
        let plain = build_subagent_system_prompt("scan repo", None);
        assert!(plain.contains("Task: scan repo"));
        assert!(!plain.contains("Additional context"));

        let with = build_subagent_system_prompt("scan repo", Some("  only src  "));
        assert!(with.contains("Additional context:\nonly src"));
        assert!(!with.contains("only src  \n"));

        let blank = build_subagent_system_prompt("scan repo", Some("   "));
        assert!(!blank.contains("Additional context"));
    }

    #[test]
    fn allowed_tools_default_and_normalization() {
        let defaults = parse_allowed_tools(None);
        assert_eq!(defaults.len(), DEFAULT_SUBAGENT_TOOLS.len());
        assert_eq!(defaults[0], "file.read");

        let parsed = parse_allowed_tools(Some(" file.read, ,web.search ,"));
        assert_eq!(parsed, vec!["file.read", "web.search"]);
        assert!(parse_allowed_tools(Some("  ,  ")).is_empty());
    }

    #[test]
    fn unknown_tools_are_rejected_before_running() {
        let host = FakeHost::permissive();
        let ctx = AgentToolContext::default();
        let out = execute(
            &json!({ "prompt": "p", "description": "d", "allowedTools": "file.read,teleport.run" }),
            &ctx,
            &host,
        );
        assert_eq!(out["ok"], false);
        assert_eq!(
            out["message"],
            "Sub-agent requested unknown tools: teleport.run"
        );
        assert!(host.used.borrow().is_empty());
    }

    #[test]
    fn prompt_is_required() {
        let host = FakeHost::permissive();
        let out = execute(
            &json!({ "prompt": "   ", "description": "d" }),
            &AgentToolContext::default(),
            &host,
        );
        assert_eq!(out["message"], "prompt is required");
    }

    #[test]
    fn description_defaults_to_first_sixty_chars() {
        let host = FakeHost {
            run: Some(inform_run("[inform] done")),
            ..FakeHost::permissive()
        };
        let long = "x".repeat(80);
        let out = execute(
            &json!({ "prompt": long }),
            &AgentToolContext::default(),
            &host,
        );
        assert_eq!(out["ok"], true);
        // TS derives the description for the sub-agent request; the parent
        // payload carries no `description` field at all.
        assert!(!out["data"].as_object().unwrap().contains_key("description"));
        let seen = host.descriptions.borrow();
        assert_eq!(seen.as_slice(), &["x".repeat(60)]);
    }

    #[test]
    fn cancellation_before_start_short_circuits() {
        let host = FakeHost {
            cancelled: true,
            ..FakeHost::permissive()
        };
        let out = execute(
            &json!({ "prompt": "p", "description": "d" }),
            &AgentToolContext::default(),
            &host,
        );
        assert_eq!(out["message"], "Cancelled before sub-agent started");
        assert!(host.used.borrow().is_empty());
    }

    #[test]
    fn unavailable_host_reports_provider() {
        let host = FakeHost::permissive();
        let ctx = AgentToolContext {
            provider: "openai".into(),
            unavailable_reason: Some("no provider registry".into()),
        };
        let out = execute(&json!({ "prompt": "p", "description": "d" }), &ctx, &host);
        assert_eq!(
            out["message"],
            "Sub-agent delegation isn't available for provider \"openai\": no provider registry"
        );
    }

    #[test]
    fn acp_is_preferred_over_loop() {
        let host = FakeHost {
            acp: true,
            run: Some(inform_run("[inform] ok")),
            ..FakeHost::permissive()
        };
        execute(
            &json!({ "prompt": "p", "description": "d" }),
            &AgentToolContext::default(),
            &host,
        );
        assert_eq!(*host.used.borrow(), vec!["acp"]);

        let loop_host = FakeHost {
            acp: false,
            run: Some(inform_run("[inform] ok")),
            ..FakeHost::permissive()
        };
        execute(
            &json!({ "prompt": "p", "description": "d" }),
            &AgentToolContext::default(),
            &loop_host,
        );
        assert_eq!(*loop_host.used.borrow(), vec!["loop"]);
    }

    #[test]
    fn successful_run_shapes_parent_payload() {
        let host = FakeHost {
            run: Some(inform_run("  [inform] found 3 hits  ")),
            ..FakeHost::permissive()
        };
        let out = execute(
            &json!({ "prompt": "p", "description": "d" }),
            &AgentToolContext::default(),
            &host,
        );
        assert_eq!(out["ok"], true);
        assert_eq!(out["message"], "found 3 hits");
        assert_eq!(out["data"]["subAgentId"], "sa_1");
        assert_eq!(out["data"]["content"], "found 3 hits");
        assert_eq!(out["data"]["rounds"], 3);
        assert_eq!(out["data"]["durationMs"], 42);
        assert_eq!(out["data"]["performative"], "inform");
        assert_eq!(out["data"]["segments"][0]["content"], "found 3 hits  ");
        assert_eq!(out["data"]["toolCalls"][0]["callId"], "c1");
        assert_eq!(out["data"]["toolCalls"][0]["tool"], "file.read");
        assert_eq!(out["data"]["toolCalls"][0]["args"]["path"], "a");
        assert_eq!(out["data"]["toolCalls"][0]["ok"], true);
        assert_eq!(out["data"]["toolCalls"][0]["message"], "read a");
        assert!(out["data"]["toolCalls"][0].as_object().unwrap().contains_key("data"));
        assert_eq!(out["data"]["toolCalls"][0]["startedAt"], 1);
        assert_eq!(out["data"]["toolCalls"][0]["completedAt"], 2);
    }

    #[test]
    fn failing_performative_is_not_ok_but_still_returns_payload() {
        let host = FakeHost {
            run: Some(inform_run("[refuse]   ")),
            ..FakeHost::permissive()
        };
        let out = execute(
            &json!({ "prompt": "p", "description": "d" }),
            &AgentToolContext::default(),
            &host,
        );
        // TS reports these as ok:false results rather than raising, so the
        // parent sees the sub-agent's own refusal text and segments.
        assert_eq!(out["ok"], false);
        assert_eq!(out["message"], "Sub-agent refuse: no details given");
        assert_eq!(out["data"]["performative"], "refuse");
        assert_eq!(out["data"]["segments"][0]["content"], "");
    }

    #[test]
    fn aborted_run_returns_partial_content() {
        let mut run = inform_run("[inform] half done");
        run.aborted = true;
        let host = FakeHost {
            run: Some(run),
            ..FakeHost::permissive()
        };
        let out = execute(
            &json!({ "prompt": "p", "description": "d" }),
            &AgentToolContext::default(),
            &host,
        );
        assert_eq!(out["ok"], false);
        assert_eq!(out["message"], "Sub-agent was cancelled");
        assert_eq!(out["data"]["partialContent"], "[inform] half done");
        assert_eq!(out["data"]["rounds"], 3);
    }

    #[test]
    fn host_failure_and_cancellation_map_to_messages() {
        let failing = FakeHost {
            failure: Some(SubAgentFailure::error("boom")),
            ..FakeHost::permissive()
        };
        let out = execute(
            &json!({ "prompt": "p", "description": "d" }),
            &AgentToolContext::default(),
            &failing,
        );
        assert_eq!(out["message"], "Sub-agent failed: boom");

        let cancelled = FakeHost {
            failure: Some(SubAgentFailure::cancelled()),
            ..FakeHost::permissive()
        };
        let out = execute(
            &json!({ "prompt": "p", "description": "d" }),
            &AgentToolContext::default(),
            &cancelled,
        );
        assert_eq!(out["message"], "Sub-agent was cancelled");
    }

    #[test]
    fn empty_run_reports_no_output() {
        let host = FakeHost::permissive();
        let out = execute(
            &json!({ "prompt": "p", "description": "d" }),
            &AgentToolContext::default(),
            &host,
        );
        // parsePerformative("") has no tag, so it reads as a successful
        // "inform" with empty content: ok stays true, the parent is told the
        // sub-agent produced nothing.
        assert_eq!(out["ok"], true);
        assert_eq!(out["message"], "Sub-agent completed with no output");
        assert_eq!(out["data"]["content"], "");
        assert_eq!(out["data"]["performative"], "inform");
    }

    #[test]
    fn render_segments_only_strips_text_tags() {
        let segments = vec![
            json!({ "type": "text", "content": "[propose]  keep  spacing " }),
            json!({ "type": "tool_use", "id": "t1", "name": "file.read" }),
        ];
        let out = render_segments(&segments);
        assert_eq!(out[0]["content"], "keep  spacing ");
        assert_eq!(out[1], segments[1]);
        assert!(!out[0].as_object().unwrap().contains_key("text"));
    }

    #[test]
    fn render_tool_calls_projects_known_keys() {
        // Raw LLM tool-use blocks ({id,name,input}) are accepted as aliases
        // but reported back under the TS field names only.
        let calls = vec![json!({ "id": "1", "name": "x", "input": { "a": 1 }, "extra": true })];
        let out = render_tool_calls(&calls);
        assert_eq!(out[0]["callId"], "1");
        assert_eq!(out[0]["tool"], "x");
        assert_eq!(out[0]["args"], json!({ "a": 1 }));
        assert_eq!(out[0]["ok"], Value::Null);
        assert_eq!(out[0]["message"], Value::Null);
        assert_eq!(out[0]["data"], Value::Null);
        assert_eq!(out[0]["startedAt"], Value::Null);
        assert_eq!(out[0]["completedAt"], Value::Null);
        let keys: Vec<&String> = out[0].as_object().unwrap().keys().collect();
        assert_eq!(keys.len(), 8, "unexpected keys: {keys:?}");
    }
}
