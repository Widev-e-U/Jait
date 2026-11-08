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
    if state["retryAfter"]
        .as_u64()
        .is_some_and(|retry_after| now < retry_after)
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
pub fn complete_compaction(state: &mut Value, success: bool, now: u64) {
    if success {
        state
            .as_object_mut()
            .expect("context state")
            .shift_remove("usedTokens");
        state["failures"] = json!(0);
        state
            .as_object_mut()
            .expect("context state")
            .shift_remove("retryAfter");
    } else {
        let failures = state["failures"]
            .as_u64()
            .unwrap_or(0)
            .saturating_add(1)
            .min(6);
        state["failures"] = json!(failures);
        state["retryAfter"] =
            json!(now.saturating_add((60_000u64 * (1 << (failures - 1))).min(1_800_000)));
    }
    state["compacting"] = json!(false);
}
