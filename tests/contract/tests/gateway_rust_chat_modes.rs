#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::{contracts::bounded_json::JsonGraph, tools::chat_modes as modes};
use serde_json::{Value, json};
use std::path::PathBuf;
fn reference(call: Value) -> Value {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap();
    internal_driver::call(
        &root,
        &root.join(".jait/artifacts/gateway-rust/chat-modes"),
        json!({"version":1,"calls":[call]}),
        &|| false,
    )
    .unwrap()[0]
        .clone()
}
#[test]
fn all_tool_policy_sets_and_rosters_match_the_real_source() {
    assert_eq!(
        json!({"modes":modes::CHAT_MODES,"ask":modes::ask_mode_tools(),"mutating":modes::mutating_tools(),"swarm":modes::swarm_orchestration_tools(),"teams":modes::swarm_teams()}),
        reference(json!({"op":"nativechatmodes.policy"}))
    );
}
#[test]
fn mode_validation_and_fallback_prompt_dispatch_are_exact() {
    let values = json!([
        "ask",
        "agent",
        "swarm",
        "plan",
        "Agent",
        "",
        "unknown",
        null,
        false,
        0,
        [],
        {},
        ["ask"]
    ]);
    let valid: Vec<bool> = values
        .as_array()
        .unwrap()
        .iter()
        .map(modes::is_valid_chat_mode)
        .collect();
    assert_eq!(
        json!(valid),
        reference(json!({"op":"nativechatmodes.valid","values":values}))
    );
    let prompts: Vec<&str> = values
        .as_array()
        .unwrap()
        .iter()
        .map(modes::get_system_prompt_for_mode)
        .collect();
    assert_eq!(
        json!(prompts),
        reference(json!({"op":"nativechatmodes.prompts","values":values}))
    );
}
#[test]
fn default_custom_empty_and_unicode_rosters_match_without_normalization() {
    assert_eq!(
        modes::format_swarm_teams_roster(None),
        reference(json!({"op":"nativechatmodes.roster"}))
    );
    for teams in [
        json!([]),
        json!([{"name":"","useWhen":"","roles":[]}]),
        json!([{"name":"安全 😀\n","useWhen":" 分析 ","roles":[{"name":"Verifier","description":"before; after — evidence"},{"name":"","description":""}]}]),
    ] {
        let parsed: Vec<modes::SwarmTeam> = serde_json::from_value(teams.clone()).unwrap();
        assert_eq!(
            modes::format_swarm_teams_roster(Some(&parsed)),
            reference(json!({"op":"nativechatmodes.roster","teams":teams}))
        );
    }
}
#[test]
fn native_plan_contracts_preserve_required_optional_and_status_variants() {
    let contract = reference(json!({"op":"nativechatmodes.contracts"}));
    let fields = |names: &[&str], optional: &[&str]| {
        json!(
            names
                .iter()
                .map(|name| json!({"name":name,"optional":optional.contains(name)}))
                .collect::<Vec<_>>()
        )
    };
    assert_eq!(
        contract["plan"],
        fields(
            &[
                "id",
                "sessionId",
                "summary",
                "actions",
                "status",
                "createdAt",
                "updatedAt"
            ],
            &[]
        )
    );
    assert_eq!(
        contract["action"],
        fields(
            &[
                "id",
                "tool",
                "args",
                "description",
                "order",
                "status",
                "result"
            ],
            &["result"]
        )
    );
    assert_eq!(
        contract["result"],
        fields(&["ok", "message", "data"], &["data"])
    );
    assert_eq!(contract["actionOrder"], "number");
    assert_eq!(contract["actionArgs"], "unknown");
    let plan_status = [
        modes::PlanStatus::Pending,
        modes::PlanStatus::Approved,
        modes::PlanStatus::Partial,
        modes::PlanStatus::Executing,
        modes::PlanStatus::Completed,
        modes::PlanStatus::Rejected,
    ];
    let action_status = [
        modes::PlannedActionStatus::Pending,
        modes::PlannedActionStatus::Approved,
        modes::PlannedActionStatus::Rejected,
        modes::PlannedActionStatus::Executed,
        modes::PlannedActionStatus::Failed,
    ];
    let mode_status = [
        modes::ChatMode::Ask,
        modes::ChatMode::Agent,
        modes::ChatMode::Swarm,
        modes::ChatMode::Plan,
    ];
    fn sorted<T: serde::Serialize>(values: T) -> Value {
        let value = serde_json::to_value(values).unwrap();
        let mut names: Vec<String> = value
            .as_array()
            .unwrap()
            .iter()
            .map(|v| v.as_str().unwrap().to_string())
            .collect();
        names.sort();
        json!(names)
    }
    assert_eq!(sorted(plan_status), contract["planStatuses"]);
    assert_eq!(sorted(action_status), contract["actionStatuses"]);
    assert_eq!(sorted(mode_status), contract["modes"]);
    for result in [
        None,
        Some(json!({"ok":true,"message":"done"})),
        Some(json!({"ok":false,"message":"error","data":null})),
        Some(json!({"ok":true,"message":"done","data":{"nested":[1,null,"😀"]}})),
    ] {
        let mut action = json!({"id":"a","tool":"fixture","args":{"nested":[1,null]},"description":"fixture","order":0,"status":"pending"});
        if let Some(result) = result {
            action["result"] = result;
        }
        let value = json!({"id":"p","sessionId":"s","summary":"Plan","actions":[action],"status":"pending","createdAt":"old","updatedAt":"new"});
        let plan: modes::Plan = serde_json::from_value(value.clone()).unwrap();
        let actual = serde_json::to_value(plan).unwrap();
        let canonical = JsonGraph::from_value(&actual).stringify().unwrap();
        assert_eq!(serde_json::from_str::<Value>(&canonical).unwrap(), value);
    }
    for status in [json!("done"), json!("FAILED"), Value::Null] {
        let value = json!({"id":"p","sessionId":"s","summary":"Plan","actions":[],"status":status,"createdAt":"old","updatedAt":"new"});
        assert!(serde_json::from_value::<modes::Plan>(value).is_err());
    }
}
