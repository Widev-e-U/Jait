//! Native chat-mode policies, roster formatting, prompt dispatch and plan contracts.
//! Embedded prose/metadata is immutable build-time data, never JavaScript execution.
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{collections::BTreeMap, sync::LazyLock};

pub const CHAT_MODES: [&str; 4] = ["ask", "agent", "swarm", "plan"];
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ChatMode {
    Ask,
    Agent,
    Swarm,
    Plan,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct SwarmTeamRole {
    pub name: String,
    pub description: String,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SwarmTeam {
    pub name: String,
    pub use_when: String,
    pub roles: Vec<SwarmTeamRole>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Assets {
    modes: Vec<String>,
    ask_tools: Vec<String>,
    mutating_tools: Vec<String>,
    swarm_tools: Vec<String>,
    teams: Vec<SwarmTeam>,
    prompts: BTreeMap<String, String>,
}
fn assets() -> &'static Assets {
    static ASSETS: LazyLock<Assets> = LazyLock::new(|| {
        let assets: Assets =
            serde_json::from_str(include_str!("chat-modes-assets.json")).expect("chat mode assets");
        assert_eq!(assets.modes, CHAT_MODES);
        assets
    });
    &ASSETS
}
pub fn is_valid_chat_mode(value: &Value) -> bool {
    value.as_str().is_some_and(|s| CHAT_MODES.contains(&s))
}
pub fn ask_mode_tools() -> &'static [String] {
    &assets().ask_tools
}
pub fn mutating_tools() -> &'static [String] {
    &assets().mutating_tools
}
pub fn swarm_orchestration_tools() -> &'static [String] {
    &assets().swarm_tools
}
pub fn swarm_teams() -> &'static [SwarmTeam] {
    &assets().teams
}
pub fn get_system_prompt_for_mode(mode: &Value) -> &'static str {
    let key = match mode.as_str() {
        Some("ask") => "ask",
        Some("swarm") => "swarm",
        Some("plan") => "plan",
        _ => "agent",
    };
    assets().prompts.get(key).expect("mode prompt")
}
pub fn format_swarm_teams_roster(teams: Option<&[SwarmTeam]>) -> String {
    teams
        .unwrap_or_else(|| swarm_teams())
        .iter()
        .map(|team| {
            let roles = team
                .roles
                .iter()
                .map(|role| format!("{} — {}", role.name, role.description))
                .collect::<Vec<_>>()
                .join("; ");
            format!("- {} (use for {}): {}", team.name, team.use_when, roles)
        })
        .collect::<Vec<_>>()
        .join("\n")
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PlannedActionStatus {
    Pending,
    Approved,
    Rejected,
    Executed,
    Failed,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PlanStatus {
    Pending,
    Approved,
    Partial,
    Executing,
    Completed,
    Rejected,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ActionResult {
    pub ok: bool,
    pub message: String,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "present_json"
    )]
    pub data: Option<Value>,
}
fn present_json<'de, D: serde::Deserializer<'de>>(d: D) -> Result<Option<Value>, D::Error> {
    Value::deserialize(d).map(Some)
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PlannedAction {
    pub id: String,
    pub tool: String,
    pub args: Value,
    pub description: String,
    pub order: f64,
    pub status: PlannedActionStatus,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub result: Option<ActionResult>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Plan {
    pub id: String,
    pub session_id: String,
    pub summary: String,
    pub actions: Vec<PlannedAction>,
    pub status: PlanStatus,
    pub created_at: String,
    pub updated_at: String,
}
