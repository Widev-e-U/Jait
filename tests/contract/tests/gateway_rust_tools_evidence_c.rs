//! Contract evidence for migrated `tools/*` cluster components (part C).
//!
//! Every expectation below is derived from the TypeScript reference under
//! `packages/gateway/src/tools/*` and asserted against the NATIVE Rust
//! implementation exposed by `jait-gateway`.

use serde_json::Value;

/// Property keys of a tool definition, sorted (schema consumers compare sets).
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

/// `definition()` must return the *same* entry as `metadata()[i]` and must
/// panic (never silently return a fabricated tool) for an unknown name.
fn assert_definition_panics_on_unknown(name: &str, f: fn(&str) -> &'static Value) {
    let before = std::panic::take_hook();
    std::panic::set_hook(Box::new(|_| {}));
    let outcome = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let _ = f(name);
    }));
    std::panic::set_hook(before);
    assert!(
        outcome.is_err(),
        "definition({name}) must panic on unknown tool"
    );
}

// ---------------------------------------------------------------------------
// contracts (packages/gateway/src/tools/contracts.ts, registry.ts barrel)
// ---------------------------------------------------------------------------
mod contracts_barrel {
    use jait_gateway::tools::contracts::ToolSource;
    use jait_gateway::tools::contracts::barrel;

    #[test]
    fn tool_source_roundtrips_exact_ts_strings() {
        assert_eq!(ToolSource::PLUGIN_PREFIX, "plugin:");
        assert_eq!(ToolSource::Builtin.as_source_str(), "builtin");
        assert_eq!(ToolSource::Mcp.as_source_str(), "mcp");
        assert_eq!(
            ToolSource::Plugin("demo".into()).as_source_str(),
            "plugin:demo"
        );

        assert_eq!(
            ToolSource::from_source_str("builtin"),
            Some(ToolSource::Builtin)
        );
        assert_eq!(ToolSource::from_source_str("mcp"), Some(ToolSource::Mcp));
        assert_eq!(
            ToolSource::from_source_str("plugin:demo"),
            Some(ToolSource::Plugin("demo".into()))
        );
        // Exact prefix match: the empty plugin id is representable in TS.
        assert_eq!(
            ToolSource::from_source_str("plugin:"),
            Some(ToolSource::Plugin(String::new()))
        );
    }

    #[test]
    fn from_source_str_refuses_values_outside_the_ts_union() {
        for bad in [
            "",
            "Builtin",
            "builtin ",
            " plugins:x",
            "plugins:x",
            "plugin",
            "mcp:",
        ] {
            assert_eq!(
                ToolSource::from_source_str(bad),
                None,
                "must reject {bad:?}"
            );
        }
    }

    #[test]
    fn gate_terms_and_satisfaction_follow_ts_dependency_vocabulary() {
        assert!(barrel::gate_terms("").is_empty());
        assert_eq!(barrel::gate_terms("deps.config"), vec!["deps.config"]);
        assert_eq!(
            barrel::gate_terms("deps.config && deps.shutdown"),
            vec!["deps.config", "deps.shutdown"]
        );

        assert!(barrel::gate_satisfied("", &[]));
        assert!(barrel::gate_satisfied("deps.config", &["deps.config"]));
        assert!(!barrel::gate_satisfied("deps.config", &[]));
        assert!(!barrel::gate_satisfied(
            "deps.config && deps.shutdown",
            &["deps.config"]
        ));
        assert!(barrel::gate_satisfied(
            "deps.config && deps.shutdown",
            &["deps.shutdown", "deps.config", "unrelated"]
        ));
    }

    #[test]
    fn registration_plan_lists_ungated_factories_and_respects_gates() {
        let ungated = barrel::registration_plan(&[]);
        assert_eq!(
            ungated.len(),
            57,
            "57 factories declare no service dependency"
        );
        for reg in &ungated {
            assert_eq!(reg.gate, "", "{} must be ungated", reg.factory);
        }

        let with_redeploy = barrel::registration_plan(&["deps.config", "deps.shutdown"]);
        assert!(with_redeploy.len() >= ungated.len());
        assert!(
            with_redeploy
                .iter()
                .any(|r| r.factory == "createRedeployTool"),
            "createRedeployTool requires deps.config && deps.shutdown"
        );
        for reg in &with_redeploy {
            assert!(
                barrel::gate_satisfied(reg.gate, &["deps.config", "deps.shutdown"]),
                "{} was planned without satisfying gate {:?}",
                reg.factory,
                reg.gate
            );
        }
    }

    #[test]
    fn native_factories_point_at_real_native_modules() {
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../packages/gateway-rust/src/tools");
        let mut checked = 0usize;
        for reg in barrel::registration_plan(&["deps.config", "deps.shutdown"]) {
            if let Some(native) = reg.native {
                let path = root.join(format!("{native}.rs"));
                assert!(
                    path.is_file(),
                    "{} -> missing native module {path:?}",
                    reg.factory
                );
                checked += 1;
            }
            assert!(
                reg.ts_module.ends_with(".ts"),
                "{} has bogus ts_module",
                reg.factory
            );
        }
        assert!(
            checked >= 40,
            "expected >=40 native-backed factories, saw {checked}"
        );
    }

    #[test]
    fn missing_native_is_sorted_unique_gap_list() {
        let missing = barrel::missing_native();
        assert!(
            !missing.is_empty(),
            "TS gap list must be explicit, not empty"
        );
        let mut sorted = missing.clone();
        sorted.sort_unstable();
        sorted.dedup();
        assert_eq!(missing, sorted, "gap list must be sorted and de-duplicated");
        assert!(
            missing.contains(&"createReadTool"),
            "core/index.ts read tool is not ported"
        );
        assert!(
            !missing.contains(&"createContextReadTool"),
            "createContextReadTool has a native port and must not be listed"
        );
    }

    #[test]
    fn reexports_for_module_preserve_ts_barrel_order() {
        assert_eq!(
            barrel::reexports_for_module("terminal-tools.ts"),
            vec![
                "createTerminalRunTool",
                "createJaitTerminalTool",
                "createTerminalStreamTool",
                "type AgentEnvResolver",
            ]
        );
        assert!(barrel::reexports_for_module("no-such-module.ts").is_empty());
        let gap = barrel::reexports_without_native();
        assert_eq!(
            gap.len(),
            13,
            "13 re-exported symbols still lack a native port"
        );
        assert!(!gap.iter().any(|s| s.is_empty()));
    }
}

// ---------------------------------------------------------------------------
// os_tools (packages/gateway/src/tools/os-tools.ts)
// ---------------------------------------------------------------------------
mod os_tools {
    use super::*;
    use jait_gateway::tools::os_tools as os;

    #[test]
    fn metadata_declares_query_and_install_with_ts_enums() {
        let md = os::metadata();
        assert_eq!(names(md), vec!["os.query", "os.install"]);
        assert_eq!(required(&md[0]), vec!["query"]);
        assert_eq!(required(&md[1]), vec!["package"]);
        assert_eq!(prop_keys(&md[0]), vec!["query"]);
        assert_eq!(prop_keys(&md[1]), vec!["manager", "package"]);
        assert_eq!(
            md[0]["parameters"]["properties"]["query"]["enum"],
            serde_json::json!(["info", "processes", "disk", "env"])
        );
        assert_eq!(
            md[1]["parameters"]["properties"]["manager"]["enum"],
            serde_json::json!(["winget", "apt", "brew", "auto"])
        );
    }

    #[test]
    fn every_property_is_documented_for_schema_consumers() {
        for tool in os::metadata().as_array().unwrap() {
            for (key, prop) in tool["parameters"]["properties"].as_object().unwrap() {
                assert!(prop["type"].is_string(), "{key} lacks a JSON type");
                assert!(
                    prop["description"].as_str().map_or(0, str::len) > 10,
                    "{key} needs a real description"
                );
            }
        }
    }

    #[test]
    fn definition_matches_metadata_and_refuses_unknown_names() {
        let md = os::metadata();
        assert_eq!(os::definition("os.install"), &md[1]);
        assert_eq!(os::definition("os.query"), &md[0]);
        assert_definition_panics_on_unknown("os.remove", os::definition);
    }

    #[test]
    fn platform_maps_to_node_process_platform() {
        let p = os::platform();
        assert!(
            ["linux", "win32", "darwin"].contains(&p),
            "unexpected platform {p:?}"
        );
        if cfg!(target_os = "linux") {
            assert_eq!(p, "linux");
        }
    }
}

// ---------------------------------------------------------------------------
// sandbox_tools (packages/gateway/src/tools/sandbox-tools.ts)
// ---------------------------------------------------------------------------
mod sandbox_tools {
    use super::*;
    use jait_gateway::tools::sandbox_tools as sb;

    #[test]
    fn metadata_declares_four_sandbox_tools_in_ts_order() {
        assert_eq!(
            names(sb::metadata()),
            vec![
                "windows.sandbox.start",
                "windows.sandbox.stop",
                "linux.desktop.sandbox.start",
                "linux.desktop.sandbox.stop",
            ]
        );
    }

    #[test]
    fn start_tools_are_option_only_and_stop_tools_require_container_name() {
        let md = sb::metadata();
        assert!(required(&md[0]).is_empty());
        assert_eq!(required(&md[1]), vec!["containerName"]);
        assert!(required(&md[2]).is_empty());
        assert_eq!(required(&md[3]), vec!["containerName"]);
        assert_eq!(
            prop_keys(&md[1]),
            vec!["containerName", "removeStorage"],
            "windows.sandbox.stop exposes removeStorage"
        );
        assert_eq!(prop_keys(&md[3]), vec!["containerName"]);
    }

    #[test]
    fn tuning_options_match_the_ts_payload_keys() {
        let md = sb::metadata();
        assert_eq!(
            prop_keys(&md[0]),
            vec![
                "cpuCores",
                "diskSize",
                "password",
                "ramSize",
                "rdpPort",
                "sshPort",
                "username",
                "waitForWebViewer",
                "webViewerPort",
                "windowsVersion",
            ]
        );
        assert_eq!(
            prop_keys(&md[2]),
            vec![
                "cdpPort",
                "hostGateway",
                "mountMode",
                "networkEnabled",
                "novncPort",
                "screenRes",
                "vncPort",
                "waitForCdp",
            ]
        );
    }

    #[test]
    fn definition_is_exact_and_unknown_names_panic() {
        let md = sb::metadata();
        assert_eq!(sb::definition("linux.desktop.sandbox.stop"), &md[3]);
        assert_definition_panics_on_unknown("macos.sandbox.start", sb::definition);
    }
}

// ---------------------------------------------------------------------------
// screen_share_tools (packages/gateway/src/tools/screen-share-tools.ts)
// ---------------------------------------------------------------------------
mod screen_share_tools {
    use super::*;
    use jait_gateway::tools::screen_share_tools as ss;

    #[test]
    fn metadata_declares_share_capture_and_record() {
        assert_eq!(
            names(ss::metadata()),
            vec!["screen.share", "screen.capture", "screen.record"]
        );
    }

    #[test]
    fn share_requires_action_while_capture_and_record_take_no_arguments() {
        let md = ss::metadata();
        assert_eq!(required(&md[0]), vec!["action"]);
        assert_eq!(prop_keys(&md[0]), vec!["action", "targetDeviceId"]);
        assert_eq!(
            md[0]["parameters"]["properties"]["action"]["enum"],
            serde_json::json!(["connect", "disconnect", "list-devices", "start"])
        );
        assert_eq!(
            md[0]["parameters"]["properties"]["action"]["type"],
            serde_json::json!("string")
        );
        for tool in [&md[1], &md[2]] {
            assert!(
                prop_keys(tool).is_empty(),
                "{} takes no parameters",
                tool["name"]
            );
            assert!(
                tool["parameters"]
                    .get("required")
                    .is_none_or(Value::is_null),
                "{} must not declare required args",
                tool["name"]
            );
        }
    }

    #[test]
    fn definition_refuses_unknown_screen_tools() {
        let md = ss::metadata();
        assert_eq!(ss::definition("screen.record"), &md[2]);
        assert_definition_panics_on_unknown("screen.stop", ss::definition);
    }
}

// ---------------------------------------------------------------------------
// channel_tools (packages/gateway/src/tools/channel-tools.ts)
// ---------------------------------------------------------------------------
mod channel_tools {
    use super::*;
    use jait_gateway::tools::channel_tools as ch;

    #[test]
    fn metadata_declares_send_and_remind() {
        assert_eq!(
            names(ch::metadata()),
            vec!["channel.send", "channel.remind"]
        );
    }

    #[test]
    fn both_channel_tools_are_fully_optional() {
        let md = ch::metadata();
        for tool in md.as_array().unwrap() {
            assert!(
                required(tool).is_empty(),
                "{} must have no required fields (prompt/text are alternatives)",
                tool["name"]
            );
        }
        assert_eq!(
            prop_keys(&md[0]),
            vec!["channelId", "conversationId", "prompt", "text"]
        );
        assert_eq!(
            prop_keys(&md[1]),
            vec![
                "at",
                "channelId",
                "conversationId",
                "cron",
                "name",
                "prompt",
                "text",
                "timeZone",
            ]
        );
    }

    #[test]
    fn remind_exposes_scheduling_keys_but_send_does_not() {
        let md = ch::metadata();
        let send = prop_keys(&md[0]);
        let remind = prop_keys(&md[1]);
        for key in ["at", "cron", "timeZone", "name"] {
            assert!(!send.contains(&key), "channel.send must not expose {key}");
            assert!(remind.contains(&key), "channel.remind must expose {key}");
        }
    }

    #[test]
    fn properties_are_typed_and_documented() {
        for tool in ch::metadata().as_array().unwrap() {
            for (key, prop) in tool["parameters"]["properties"].as_object().unwrap() {
                assert!(prop["type"].is_string(), "{key} lacks a type");
                assert!(
                    prop["description"].as_str().is_some(),
                    "{key} lacks a description"
                );
            }
        }
    }
}

// ---------------------------------------------------------------------------
// homeassistant_tools (packages/gateway/src/tools/homeassistant-tools.ts)
// ---------------------------------------------------------------------------
mod homeassistant_tools {
    use super::*;
    use jait_gateway::tools::homeassistant_tools as ha;

    #[test]
    fn metadata_declares_states_services_and_call_service() {
        assert_eq!(
            names(&ha::metadata()),
            vec![
                "homeassistant.states",
                "homeassistant.call_service",
                "homeassistant.services",
            ]
        );
    }

    #[test]
    fn call_service_requires_domain_and_service_only() {
        let md = ha::metadata();
        assert_eq!(required(&md[1]), vec!["domain", "service"]);
        assert_eq!(
            prop_keys(&md[1]),
            vec!["domain", "entity_id", "service", "service_data"]
        );
        assert_eq!(prop_keys(&md[0]), vec!["entity_id"]);
        assert_eq!(prop_keys(&md[2]), vec!["domain"]);
        assert!(required(&md[0]).is_empty());
        assert!(required(&md[2]).is_empty());
    }

    #[test]
    fn service_data_is_a_free_form_object() {
        let md = ha::metadata();
        let sd = &md[1]["parameters"]["properties"]["service_data"];
        assert_eq!(sd["type"], serde_json::json!("object"));
        assert!(
            sd["properties"]
                .as_object()
                .is_none_or(serde_json::Map::is_empty),
            "service_data must stay free-form (no fixed properties)"
        );
    }

    #[test]
    fn metadata_is_deterministic_and_every_tool_is_documented() {
        // homeassistant_tools exposes metadata() only (definitions are served
        // from the embedded JSON), so the contract we can pin is the shape:
        // stable output, unique names, real descriptions.
        assert_eq!(ha::metadata(), ha::metadata());
        let md = ha::metadata();
        let mut seen: Vec<&str> = Vec::new();
        for tool in md.as_array().unwrap() {
            let name = tool["name"].as_str().unwrap();
            assert!(!seen.contains(&name), "duplicate tool definition {name}");
            seen.push(name);
            assert!(
                tool["description"].as_str().map_or(0, str::len) > 10,
                "{name} needs a real description"
            );
        }
        assert_eq!(seen.len(), 3);
    }
}
