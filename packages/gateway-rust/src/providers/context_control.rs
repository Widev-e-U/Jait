//! Native provider compaction contract: only advertised commands are invoked.
//! Local transcript shortening is deliberately not a provider-context operation.
use serde_json::{Value, json};
pub fn native_compaction_command(commands: &[String]) -> Option<String> {
    ["compact", "compress"]
        .into_iter()
        .find(|candidate| commands.iter().any(|command| command == candidate))
        .map(|command| format!("/{command}"))
}
/// The caller executes this command through its native provider transport and
/// completes the attempt after provider confirmation. Never fabricate occupancy.
pub fn begin_compaction(state: &mut Value, now: u64) -> Option<String> {
    let commands: Vec<String> = state["commands"]
        .as_array()?
        .iter()
        .filter_map(|v| v.as_str().map(str::to_owned))
        .collect();
    let command = native_compaction_command(&commands)?;
    if state["compacting"] == true
        || state["usedTokens"].as_u64().is_none()
        || state["contextWindow"].as_u64().is_none()
    {
        return None;
    }
    let budget = crate::services::context_budget::context_budget(&Value::Null);
    let input = json!({"tokens":state["usedTokens"],"contextWindow":state["contextWindow"],"owner":"provider","nativeAvailable":true,"now":now,"lastAttempt":state["lastAttempt"]});
    if crate::services::context_budget::compaction_plan(&input, &budget)["action"] != "native" {
        return None;
    }
    state["lastAttempt"] = json!(now);
    state["compacting"] = json!(true);
    Some(command)
}
pub fn complete_compaction(state: &mut Value, success: bool) {
    if success {
        state
            .as_object_mut()
            .expect("context state")
            .shift_remove("usedTokens");
    }
    state["compacting"] = json!(false);
}
