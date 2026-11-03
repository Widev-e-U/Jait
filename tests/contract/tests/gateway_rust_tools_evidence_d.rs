//! Contract evidence for migrated `tools/*` cluster components (part D).
//! Expectations are derived from `packages/gateway/src/tools/*.ts`.

use serde_json::{json, Value};

fn prop_keys(tool: &Value) -> Vec<&str> {
    let mut keys: Vec<&str> = tool["parameters"]["properties"]
        .as_object()
        .expect("properties object")
        .keys()
        .map(String::as_str)
        .collect();
    keys.sort_unstable();
    keys
}

fn required(tool: &Value) -> Vec<&str> {
    tool["parameters"]["required"]
        .as_array()
        .map(|a| a.iter().map(|v| v.as_str().unwrap()).collect())
        .unwrap_or_default()
}

fn names(metadata: &Value) -> Vec<&str> {
    metadata
        .as_array()
        .expect("metadata array")
        .iter()
        .map(|t| t["name"].as_str().expect("tool name"))
        .collect()
}

fn assert_panics_on_unknown(name: &str, f: fn(&str) -> &'static Value) {
    let hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(|_| {}));
    let outcome = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let _ = f(name);
    }));
    std::panic::set_hook(hook);
    assert!(outcome.is_err(), "definition({name}) must refuse unknown tools");
}

// ---------------------------------------------------------------------------
// skill_tools (packages/gateway/src/tools/skill-tools.ts)
// ---------------------------------------------------------------------------
mod skill_tools {
    use super::*;
    use jait_gateway::tools::skill_tools as sk;

    #[test]
    fn metadata_declares_skills_and_extensions_manage() {
        assert_eq!(names(sk::metadata()), vec!["skills.manage", "extensions.manage"]);
        let md = sk::metadata();
        assert_eq!(required(&md[0]), vec!["action"]);
        assert_eq!(required(&md[1]), vec!["action"]);
    }

    #[test]
    fn skills_manage_action_enum_matches_ts_dispatch() {
        let md = sk::metadata();
        assert_eq!(
            md[0]["parameters"]["properties"]["action"]["enum"],
            json!([
                "list",
                "search",
                "install",
                "uninstall",
                "enable",
                "disable",
                "install_tool",
                "create"
            ])
        );
        assert_eq!(
            md[1]["parameters"]["properties"]["action"]["enum"],
            json!(["list", "enable", "disable", "uninstall", "scan", "search"])
        );
    }

    #[test]
    fn skills_manage_exposes_create_payload_while_extensions_does_not() {
        let md = sk::metadata();
        assert_eq!(
            prop_keys(&md[0]),
            vec![
                "action",
                "body",
                "description",
                "id",
                "installId",
                "limit",
                "name",
                "overwrite",
                "query",
                "version",
            ]
        );
        assert_eq!(prop_keys(&md[1]), vec!["action", "id", "limit"]);
    }

    #[test]
    fn definition_is_exact_and_unknown_names_panic() {
        let md = sk::metadata();
        assert_eq!(sk::definition("skills.manage"), &md[0]);
        assert_eq!(sk::definition("extensions.manage"), &md[1]);
        assert_panics_on_unknown("skills.remove", sk::definition);
    }
}

// ---------------------------------------------------------------------------
// thread_tools (packages/gateway/src/tools/thread-tools.ts)
// ---------------------------------------------------------------------------
mod thread_tools {
    use super::*;
    use jait_gateway::tools::thread_tools as th;

    #[test]
    fn metadata_declares_a_single_thread_control_tool() {
        let md = th::metadata();
        assert_eq!(md["name"], json!("thread.control"));
        assert_eq!(required(md), vec!["action"]);
    }

    #[test]
    fn thread_control_action_enum_covers_every_ts_branch() {
        let md = th::metadata();
        assert_eq!(
            md["parameters"]["properties"]["action"]["enum"],
            json!([
                "list",
                "get",
                "create",
                "create_many",
                "update",
                "delete",
                "start",
                "send",
                "stop",
                "interrupt",
                "approve",
                "activities",
                "create_pr"
            ])
        );
    }

    #[test]
    fn secondary_enums_match_the_ts_mode_and_git_unions() {
        let md = th::metadata();
        let props = &md["parameters"]["properties"];
        assert_eq!(props["runtimeMode"]["enum"], json!(["full-access", "supervised"]));
        assert_eq!(props["kind"]["enum"], json!(["delivery", "delegation"]));
        assert_eq!(props["prState"]["enum"], json!(["creating", "open", "closed", "merged"]));
        assert_eq!(
            props["gitAction"]["enum"],
            json!(["commit", "commit_push", "commit_push_pr"])
        );
    }

    #[test]
    fn thread_control_exposes_the_full_payload_key_set() {
        let md = th::metadata();
        assert_eq!(prop_keys(md).len(), 33);
        assert_eq!(
            prop_keys(md),
            vec![
                "action",
                "approved",
                "attachments",
                "autoStopAfterTurn",
                "baseBranch",
                "branch",
                "commitMessage",
                "cwd",
                "detach",
                "featureBranch",
                "gitAction",
                "kind",
                "limit",
                "message",
                "model",
                "personaAgentId",
                "prBaseBranch",
                "prNumber",
                "prState",
                "prTitle",
                "prUrl",
                "prompt",
                "providerId",
                "requestId",
                "runtimeMode",
                "sessionId",
                "skillIds",
                "start",
                "threadId",
                "threads",
                "timeoutMinutes",
                "title",
                "workingDirectory",
            ]
        );
    }
}

// ---------------------------------------------------------------------------
// redeploy_tools (packages/gateway/src/tools/redeploy-tools.ts)
// ---------------------------------------------------------------------------
mod redeploy_tools {
    use super::*;
    use jait_gateway::tools::redeploy_tools as rd;

    #[test]
    fn metadata_declares_gateway_redeploy_with_optional_inputs() {
        let md = rd::metadata();
        assert_eq!(names(md), vec!["gateway.redeploy"]);
        assert!(required(&md[0]).is_empty());
        assert!(
            md[0]["parameters"].get("required").map_or(true, Value::is_null),
            "no redeploy input is mandatory"
        );
        assert_eq!(prop_keys(&md[0]), vec!["skipCanary", "version"]);
    }

    #[test]
    fn redeploy_inputs_are_typed_version_and_canary_switch() {
        let md = rd::metadata();
        let props = &md[0]["parameters"]["properties"];
        assert_eq!(props["version"]["type"], json!("string"));
        assert_eq!(props["skipCanary"]["type"], json!("boolean"));
    }

    #[test]
    fn definition_is_exact_and_unknown_names_panic() {
        let md = rd::metadata();
        assert_eq!(rd::definition("gateway.redeploy"), &md[0]);
        assert_panics_on_unknown("gateway.restart", rd::definition);
    }
}

// ---------------------------------------------------------------------------
// project_message (packages/gateway/src/tools/project-message-tool.ts)
// ---------------------------------------------------------------------------
mod project_message {
    use super::*;
    use jait_gateway::tools::project_message as pm;

    #[test]
    fn metadata_declares_project_message_requiring_message_text() {
        let md = pm::metadata();
        assert_eq!(md["name"], json!("project.message"));
        assert_eq!(required(md), vec!["message"]);
        assert_eq!(
            prop_keys(md),
            vec![
                "message",
                "model",
                "projectId",
                "projectRoot",
                "providerId",
                "runtimeMode",
                "title",
            ]
        );
    }

    #[test]
    fn project_scope_is_optional_and_runtime_mode_is_constrained() {
        let md = pm::metadata();
        let props = &md["parameters"]["properties"];
        assert!(!required(md).contains(&"projectId"));
        assert!(!required(md).contains(&"projectRoot"));
        assert_eq!(
            props["runtimeMode"]["enum"],
            json!(["full-access", "supervised"]),
            "runtimeMode reuses the thread-tools union"
        );
        assert_eq!(props["message"]["type"], json!("string"));
    }

    #[test]
    fn metadata_is_deterministic_single_definition() {
        assert_eq!(pm::metadata(), pm::metadata());
        assert!(pm::metadata().is_object());
        assert!(pm::metadata()["description"].as_str().map_or(0, str::len) > 10);
    }
}

// ---------------------------------------------------------------------------
// email_tools (packages/gateway/src/tools/email-tools.ts)
// ---------------------------------------------------------------------------
mod email_tools {
    use super::*;
    use jait_gateway::tools::email_tools as em;

    #[test]
    fn ui_variant_declares_seven_email_tools_in_ts_order() {
        let md = em::metadata(true);
        assert_eq!(
            names(&md),
            vec![
                "email_accounts",
                "email_list",
                "email_read",
                "email_send",
                "email_tag",
                "email_delete",
                "email_view",
            ]
        );
        assert_eq!(required(&md[0]), Vec::<&str>::new());
        assert_eq!(required(&md[1]), Vec::<&str>::new());
        assert_eq!(required(&md[2]), vec!["id"]);
        assert_eq!(required(&md[3]), vec!["body"]);
        assert_eq!(required(&md[4]), vec!["id"]);
        assert_eq!(required(&md[5]), vec!["id"]);
        assert_eq!(required(&md[6]), vec!["action"]);
    }

    #[test]
    fn headless_variant_drops_the_ui_only_email_view_tool() {
        let md = em::metadata(false);
        assert_eq!(names(&md).len(), 6);
        assert!(
            !names(&md).contains(&"email_view"),
            "email_view is gated on has_ui"
        );
        assert_eq!(md, Value::Array(md.as_array().unwrap().clone()));
    }

    #[test]
    fn every_email_tool_is_a_standard_web_builtin_with_risk_tier() {
        let md = em::metadata(true);
        let risks: Vec<&str> = md
            .as_array()
            .unwrap()
            .iter()
            .map(|t| t["risk"].as_str().expect("risk"))
            .collect();
        assert_eq!(
            risks,
            vec!["low", "low", "low", "medium", "medium", "high", "low"],
            "destructive email ops must be escalated"
        );
        for tool in md.as_array().unwrap() {
            assert_eq!(tool["tier"], json!("standard"));
            assert_eq!(tool["category"], json!("web"));
            assert_eq!(tool["source"], json!("builtin"));
        }
    }

    #[test]
    fn send_and_view_expose_the_ts_payload_keys() {
        let md = em::metadata(true);
        assert_eq!(
            prop_keys(&md[3]),
            vec![
                "accountId",
                "bcc",
                "body",
                "cc",
                "html",
                "includeSignature",
                "replyToMessageId",
                "subject",
                "to",
            ]
        );
        assert_eq!(
            md[6]["parameters"]["properties"]["action"]["enum"],
            json!(["navigate", "open", "compose", "refresh"])
        );
        assert_eq!(
            prop_keys(&md[1]),
            vec!["accountId", "folder", "limit", "query"],
            "email_list filters"
        );
        assert_eq!(
            prop_keys(&md[2]),
            vec!["accountId", "id"],
            "email_read looks a message up by id"
        );
        assert_eq!(prop_keys(&md[0]), Vec::<&str>::new());
    }
}
