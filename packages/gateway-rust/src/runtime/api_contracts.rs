//! Typed wire boundary for the 17 assertions in gateway/src/api-contracts.ts.
//! These DTOs describe shared API shapes, rather than internal storage records.
//! RuntimeMode and ProviderAuthStatus reuse canonical native definitions. Wider
//! catalogue/AuthResult/storage types must be explicitly converted at consumers;
//! merely defining this boundary does not establish runtime adoption or parity.
pub use crate::providers::contracts::{ProviderAuthStatus, RuntimeMode};
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use serde_json::Value;

/// Omission is distinct from explicit null. Nullable TS fields use
/// OptionalField<Option<T>>, while non-null optional fields reject null.
#[derive(Clone, Debug, PartialEq, Default)]
pub enum OptionalField<T> {
    #[default]
    Missing,
    Present(T),
}
impl<T> OptionalField<T> {
    pub fn is_missing(&self) -> bool {
        matches!(self, Self::Missing)
    }
}
impl<'de, T: Deserialize<'de>> Deserialize<'de> for OptionalField<T> {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        T::deserialize(deserializer).map(Self::Present)
    }
}
impl<T: Serialize> Serialize for OptionalField<T> {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        match self {
            Self::Present(value) => value.serialize(serializer),
            Self::Missing => Err(serde::ser::Error::custom("omitted field must be skipped")),
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum LoginStatus {
    #[serde(rename = "started")]
    Started,
    #[serde(rename = "completed")]
    Completed,
    #[serde(rename = "unsupported")]
    Unsupported,
    #[serde(rename = "error")]
    Error,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum LogoutStatus {
    #[serde(rename = "completed")]
    Completed,
    #[serde(rename = "unsupported")]
    Unsupported,
    #[serde(rename = "error")]
    Error,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum ThreadStatus {
    #[serde(rename = "idle")]
    Idle,
    #[serde(rename = "running")]
    Running,
    #[serde(rename = "completed")]
    Completed,
    #[serde(rename = "error")]
    Error,
    #[serde(rename = "blocked")]
    Blocked,
    #[serde(rename = "interrupted")]
    Interrupted,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum ThreadKind {
    #[serde(rename = "delivery")]
    Delivery,
    #[serde(rename = "delegation")]
    Delegation,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum ThreadIntent {
    #[serde(rename = "coding")]
    Coding,
    #[serde(rename = "debugging")]
    Debugging,
    #[serde(rename = "research")]
    Research,
    #[serde(rename = "review")]
    Review,
    #[serde(rename = "planning")]
    Planning,
    #[serde(rename = "devops")]
    Devops,
    #[serde(rename = "data")]
    Data,
    #[serde(rename = "general")]
    General,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum ExecutionTopology {
    #[serde(rename = "single")]
    Single,
    #[serde(rename = "delegated")]
    Delegated,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum PullRequestState {
    #[serde(rename = "creating")]
    Creating,
    #[serde(rename = "open")]
    Open,
    #[serde(rename = "closed")]
    Closed,
    #[serde(rename = "merged")]
    Merged,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum PlanStatus {
    #[serde(rename = "draft")]
    Draft,
    #[serde(rename = "active")]
    Active,
    #[serde(rename = "completed")]
    Completed,
    #[serde(rename = "archived")]
    Archived,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum PlanTaskStatus {
    #[serde(rename = "proposed")]
    Proposed,
    #[serde(rename = "approved")]
    Approved,
    #[serde(rename = "running")]
    Running,
    #[serde(rename = "completed")]
    Completed,
    #[serde(rename = "skipped")]
    Skipped,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum JaitTodoStatus {
    #[serde(rename = "open")]
    Open,
    #[serde(rename = "in_progress")]
    InProgress,
    #[serde(rename = "done")]
    Done,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum JaitTodoPriority {
    #[serde(rename = "low")]
    Low,
    #[serde(rename = "normal")]
    Normal,
    #[serde(rename = "high")]
    High,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderUpdateInfo {
    pub current_version: String,
    pub latest_version: String,
    pub update_available: bool,
    pub checked_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderAuthInfo {
    pub login: bool,
    pub logout: bool,
    pub device_code: bool,
    #[serde(default, skip_serializing_if = "OptionalField::is_missing")]
    pub authenticated: OptionalField<Option<bool>>,
    #[serde(default, skip_serializing_if = "OptionalField::is_missing")]
    pub detail: OptionalField<String>,
    #[serde(default, skip_serializing_if = "OptionalField::is_missing")]
    pub username: OptionalField<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderInfo {
    pub id: String,
    #[serde(default, skip_serializing_if = "OptionalField::is_missing")]
    pub provider_type: OptionalField<String>,
    pub name: String,
    pub description: String,
    #[serde(default, skip_serializing_if = "OptionalField::is_missing")]
    pub installed: OptionalField<bool>,
    pub available: bool,
    #[serde(default, skip_serializing_if = "OptionalField::is_missing")]
    pub unavailable_reason: OptionalField<String>,
    pub modes: Vec<RuntimeMode>,
    #[serde(default, skip_serializing_if = "OptionalField::is_missing")]
    pub auth: OptionalField<ProviderAuthInfo>,
    #[serde(default, skip_serializing_if = "OptionalField::is_missing")]
    pub update: OptionalField<ProviderUpdateInfo>,
    #[serde(default, skip_serializing_if = "OptionalField::is_missing")]
    pub icon: OptionalField<String>,
    #[serde(default, skip_serializing_if = "OptionalField::is_missing")]
    pub node_id: OptionalField<String>,
    #[serde(default, skip_serializing_if = "OptionalField::is_missing")]
    pub node_name: OptionalField<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderLoginResult {
    pub ok: bool,
    pub status: LoginStatus,
    pub provider_id: String,
    pub message: String,
    #[serde(default, skip_serializing_if = "OptionalField::is_missing")]
    pub verification_uri: OptionalField<String>,
    #[serde(default, skip_serializing_if = "OptionalField::is_missing")]
    pub user_code: OptionalField<String>,
    #[serde(default, skip_serializing_if = "OptionalField::is_missing")]
    pub raw_output: OptionalField<String>,
    #[serde(default, skip_serializing_if = "OptionalField::is_missing")]
    pub requires_code_input: OptionalField<bool>,
    #[serde(default, skip_serializing_if = "OptionalField::is_missing")]
    pub input_prompt: OptionalField<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderLogoutResult {
    pub ok: bool,
    pub status: LogoutStatus,
    pub provider_id: String,
    pub message: String,
    #[serde(default, skip_serializing_if = "OptionalField::is_missing")]
    pub raw_output: OptionalField<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReasoningEffort {
    pub reasoning_effort: String,
    #[serde(default, skip_serializing_if = "OptionalField::is_missing")]
    pub description: OptionalField<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelPricing {
    #[serde(default, skip_serializing_if = "OptionalField::is_missing")]
    pub prompt_per_m_tok: OptionalField<f64>,
    #[serde(default, skip_serializing_if = "OptionalField::is_missing")]
    pub completion_per_m_tok: OptionalField<f64>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderModelInfo {
    pub id: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "OptionalField::is_missing")]
    pub description: OptionalField<String>,
    #[serde(default, skip_serializing_if = "OptionalField::is_missing")]
    pub is_default: OptionalField<bool>,
    #[serde(default, skip_serializing_if = "OptionalField::is_missing")]
    pub group: OptionalField<String>,
    #[serde(default, skip_serializing_if = "OptionalField::is_missing")]
    pub reasoning_effort_supported: OptionalField<bool>,
    #[serde(default, skip_serializing_if = "OptionalField::is_missing")]
    pub supported_reasoning_efforts: OptionalField<Vec<ReasoningEffort>>,
    #[serde(default, skip_serializing_if = "OptionalField::is_missing")]
    pub pricing: OptionalField<ModelPricing>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadActivity {
    pub id: String,
    pub thread_id: String,
    pub kind: String,
    pub summary: String,
    #[serde(default, skip_serializing_if = "OptionalField::is_missing")]
    pub payload: OptionalField<Value>,
    pub created_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RoutingPlan {
    pub intent: ThreadIntent,
    pub reason: String,
    pub suggested_skill_ids: Vec<String>,
    pub topology: ExecutionTopology,
    #[serde(default, skip_serializing_if = "OptionalField::is_missing")]
    pub subtasks: OptionalField<Vec<String>>,
    pub routed_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateThreadParams {
    #[serde(default, skip_serializing_if = "OptionalField::is_missing")]
    pub session_id: OptionalField<String>,
    #[serde(default, skip_serializing_if = "OptionalField::is_missing")]
    pub persona_agent_id: OptionalField<String>,
    pub title: String,
    pub provider_id: String,
    #[serde(default, skip_serializing_if = "OptionalField::is_missing")]
    pub model: OptionalField<String>,
    #[serde(default, skip_serializing_if = "OptionalField::is_missing")]
    pub reasoning_effort: OptionalField<Option<String>>,
    #[serde(default, skip_serializing_if = "OptionalField::is_missing")]
    pub runtime_mode: OptionalField<RuntimeMode>,
    #[serde(default, skip_serializing_if = "OptionalField::is_missing")]
    pub kind: OptionalField<ThreadKind>,
    #[serde(default, skip_serializing_if = "OptionalField::is_missing")]
    pub skill_ids: OptionalField<Option<Vec<String>>>,
    #[serde(default, skip_serializing_if = "OptionalField::is_missing")]
    pub working_directory: OptionalField<String>,
    #[serde(default, skip_serializing_if = "OptionalField::is_missing")]
    pub branch: OptionalField<String>,
    #[serde(default, skip_serializing_if = "OptionalField::is_missing")]
    pub pr_base_branch: OptionalField<Option<String>>,
    #[serde(default, skip_serializing_if = "OptionalField::is_missing")]
    pub user_id: OptionalField<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateThreadParams {
    #[serde(default, skip_serializing_if = "OptionalField::is_missing")]
    pub persona_agent_id: OptionalField<Option<String>>,
    #[serde(default, skip_serializing_if = "OptionalField::is_missing")]
    pub title: OptionalField<String>,
    #[serde(default, skip_serializing_if = "OptionalField::is_missing")]
    pub model: OptionalField<Option<String>>,
    #[serde(default, skip_serializing_if = "OptionalField::is_missing")]
    pub reasoning_effort: OptionalField<Option<String>>,
    #[serde(default, skip_serializing_if = "OptionalField::is_missing")]
    pub runtime_mode: OptionalField<RuntimeMode>,
    #[serde(default, skip_serializing_if = "OptionalField::is_missing")]
    pub kind: OptionalField<ThreadKind>,
    #[serde(default, skip_serializing_if = "OptionalField::is_missing")]
    pub skill_ids: OptionalField<Option<Vec<String>>>,
    #[serde(default, skip_serializing_if = "OptionalField::is_missing")]
    pub working_directory: OptionalField<Option<String>>,
    #[serde(default, skip_serializing_if = "OptionalField::is_missing")]
    pub branch: OptionalField<Option<String>>,
    #[serde(default, skip_serializing_if = "OptionalField::is_missing")]
    pub pr_url: OptionalField<Option<String>>,
    #[serde(default, skip_serializing_if = "OptionalField::is_missing")]
    pub pr_number: OptionalField<Option<f64>>,
    #[serde(default, skip_serializing_if = "OptionalField::is_missing")]
    pub pr_title: OptionalField<Option<String>>,
    #[serde(default, skip_serializing_if = "OptionalField::is_missing")]
    pub pr_base_branch: OptionalField<Option<String>>,
    #[serde(default, skip_serializing_if = "OptionalField::is_missing")]
    pub pr_state: OptionalField<Option<PullRequestState>>,
    #[serde(default, skip_serializing_if = "OptionalField::is_missing")]
    pub provider_id: OptionalField<String>,
    #[serde(default, skip_serializing_if = "OptionalField::is_missing")]
    pub status: OptionalField<ThreadStatus>,
    #[serde(default, skip_serializing_if = "OptionalField::is_missing")]
    pub provider_session_id: OptionalField<Option<String>>,
    #[serde(default, skip_serializing_if = "OptionalField::is_missing")]
    pub error: OptionalField<Option<String>>,
    #[serde(default, skip_serializing_if = "OptionalField::is_missing")]
    pub completed_at: OptionalField<Option<String>>,
    #[serde(default, skip_serializing_if = "OptionalField::is_missing")]
    pub execution_node_id: OptionalField<Option<String>>,
    #[serde(default, skip_serializing_if = "OptionalField::is_missing")]
    pub execution_node_name: OptionalField<Option<String>>,
    #[serde(default, skip_serializing_if = "OptionalField::is_missing")]
    pub routing_plan: OptionalField<Option<RoutingPlan>>,
    #[serde(default, skip_serializing_if = "OptionalField::is_missing")]
    pub change_files: OptionalField<Option<f64>>,
    #[serde(default, skip_serializing_if = "OptionalField::is_missing")]
    pub change_insertions: OptionalField<Option<f64>>,
    #[serde(default, skip_serializing_if = "OptionalField::is_missing")]
    pub change_deletions: OptionalField<Option<f64>>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanTask {
    pub id: String,
    pub title: String,
    pub description: String,
    pub status: PlanTaskStatus,
    #[serde(default, skip_serializing_if = "OptionalField::is_missing")]
    pub skill_candidate: OptionalField<bool>,
    #[serde(default, skip_serializing_if = "OptionalField::is_missing")]
    pub skill_title: OptionalField<String>,
    #[serde(default, skip_serializing_if = "OptionalField::is_missing")]
    pub skill_rationale: OptionalField<String>,
    #[serde(default, skip_serializing_if = "OptionalField::is_missing")]
    pub thread_id: OptionalField<String>,
    #[serde(default, skip_serializing_if = "OptionalField::is_missing")]
    pub depends_on: OptionalField<Vec<String>>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateRepoRequest {
    pub name: String,
    #[serde(default, skip_serializing_if = "OptionalField::is_missing")]
    pub default_branch: OptionalField<String>,
    pub local_path: String,
    #[serde(default, skip_serializing_if = "OptionalField::is_missing")]
    pub device_id: OptionalField<String>,
    #[serde(default, skip_serializing_if = "OptionalField::is_missing")]
    pub forge_url: OptionalField<String>,
    #[serde(default, skip_serializing_if = "OptionalField::is_missing")]
    pub github_url: OptionalField<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateRepoRequest {
    #[serde(default, skip_serializing_if = "OptionalField::is_missing")]
    pub name: OptionalField<String>,
    #[serde(default, skip_serializing_if = "OptionalField::is_missing")]
    pub default_branch: OptionalField<String>,
    #[serde(default, skip_serializing_if = "OptionalField::is_missing")]
    pub local_path: OptionalField<String>,
    #[serde(default, skip_serializing_if = "OptionalField::is_missing")]
    pub device_id: OptionalField<Option<String>>,
    #[serde(default, skip_serializing_if = "OptionalField::is_missing")]
    pub forge_url: OptionalField<String>,
    #[serde(default, skip_serializing_if = "OptionalField::is_missing")]
    pub github_url: OptionalField<String>,
    #[serde(default, skip_serializing_if = "OptionalField::is_missing")]
    pub strategy: OptionalField<Option<String>>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateJaitTodoRequest {
    pub message: String,
    #[serde(default, skip_serializing_if = "OptionalField::is_missing")]
    pub status: OptionalField<JaitTodoStatus>,
    #[serde(default, skip_serializing_if = "OptionalField::is_missing")]
    pub priority: OptionalField<JaitTodoPriority>,
    #[serde(default, skip_serializing_if = "OptionalField::is_missing")]
    pub due_date: OptionalField<Option<String>>,
    #[serde(default, skip_serializing_if = "OptionalField::is_missing")]
    pub tags: OptionalField<Vec<String>>,
    #[serde(default, skip_serializing_if = "OptionalField::is_missing")]
    pub source_thread_id: OptionalField<Option<String>>,
    #[serde(default, skip_serializing_if = "OptionalField::is_missing")]
    pub source_thread_title: OptionalField<Option<String>>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateJaitTodoRequest {
    #[serde(default, skip_serializing_if = "OptionalField::is_missing")]
    pub message: OptionalField<String>,
    #[serde(default, skip_serializing_if = "OptionalField::is_missing")]
    pub status: OptionalField<JaitTodoStatus>,
    #[serde(default, skip_serializing_if = "OptionalField::is_missing")]
    pub priority: OptionalField<JaitTodoPriority>,
    #[serde(default, skip_serializing_if = "OptionalField::is_missing")]
    pub due_date: OptionalField<Option<String>>,
    #[serde(default, skip_serializing_if = "OptionalField::is_missing")]
    pub tags: OptionalField<Vec<String>>,
}
