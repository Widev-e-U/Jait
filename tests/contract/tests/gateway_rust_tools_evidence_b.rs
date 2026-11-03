//! Consumer-level contract evidence for migrated `packages/gateway/src/tools/*` components.
//!
//! Every expectation below is derived from the TypeScript reference sources
//! (`computer-tools.ts`, `screenshot-tools.ts`) and asserted against the native
//! `jait_gateway` implementation as an external consumer would use it.

use serde_json::{json, Value};

fn v(pairs: &[(&str, Value)]) -> Value {
    let mut map = serde_json::Map::new();
    for (k, val) in pairs {
        map.insert((*k).into(), val.clone());
    }
    Value::Object(map)
}

fn all_digits(text: &str) -> bool {
    !text.is_empty() && text.chars().all(|c| c.is_ascii_digit())
}

// ---------------------------------------------------------------------------
// packages/gateway/src/tools/computer-tools.ts
// ---------------------------------------------------------------------------
mod computer_tools {
    use super::*;
    use jait_gateway::tools::computer_tools as ct;

    fn windows_node(node_id: &str, name: &str, tools: &[&str]) -> Value {
        v(&[
            ("nodeId", json!(node_id)),
            ("name", json!(name)),
            ("role", json!("desktop")),
            ("lifecycle", json!("ready")),
            ("platform", json!("windows")),
            (
                "capabilities",
                json!({ "tools": tools.iter().collect::<Vec<_>>() }),
            ),
        ])
    }

    #[test]
    fn metadata_lists_four_computer_tools_with_required_params() {
        let meta = ct::metadata();
        let tools = meta.as_array().expect("metadata must be an array");
        assert_eq!(tools.len(), 4);
        let names: Vec<&str> = tools.iter().map(|t| t["name"].as_str().unwrap()).collect();
        assert_eq!(
            names,
            vec![
                "computer.targets",
                "computer.session",
                "computer.observe",
                "computer.act"
            ]
        );
        let labels: Vec<&str> = tools
            .iter()
            .map(|t| t["displayName"].as_str().unwrap())
            .collect();
        assert_eq!(
            labels,
            vec![
                "List Computers",
                "Computer Control Session",
                "Observe Computer",
                "Control Computer"
            ]
        );
        // `computer.targets` takes no arguments in the TS schema.
        assert!(tools[0]["parameters"].get("required").is_none());
        assert_eq!(tools[1]["parameters"]["required"], json!(["action"]));
        assert_eq!(tools[2]["parameters"]["required"], json!(["sessionId"]));
        assert_eq!(
            tools[3]["parameters"]["required"],
            json!(["sessionId", "action"])
        );
    }

    #[test]
    fn definition_returns_named_tool_and_panics_on_unknown() {
        let act = ct::definition("computer.act");
        assert_eq!(act["name"], json!("computer.act"));
        assert_eq!(act["displayName"], json!("Control Computer"));
        assert_eq!(
            act["parameters"]["required"],
            json!(["sessionId", "action"])
        );
        assert_eq!(
            ct::definition("computer.observe")["parameters"]["required"],
            json!(["sessionId"])
        );
        let panic = std::panic::catch_unwind(|| ct::definition("computer.nope"));
        let payload = panic.expect_err("unknown tool name must panic");
        let message = payload
            .downcast_ref::<String>()
            .cloned()
            .or_else(|| payload.downcast_ref::<&str>().map(|s| s.to_string()))
            .unwrap_or_default();
        assert!(
            message.contains("computer.nope"),
            "panic should name the unknown tool, got {message:?}"
        );
    }

    #[test]
    fn target_from_node_gates_on_role_and_lifecycle() {
        let gateway_role = v(&[
            ("nodeId", json!("node-a")),
            ("name", json!("Desk")),
            ("role", json!("gateway")),
            ("lifecycle", json!("ready")),
            ("platform", json!("windows")),
        ]);
        assert!(ct::target_from_node(&gateway_role).is_none());

        let offline = v(&[
            ("nodeId", json!("node-a")),
            ("name", json!("Desk")),
            ("role", json!("desktop")),
            ("lifecycle", json!("offline")),
            ("platform", json!("windows")),
        ]);
        assert!(ct::target_from_node(&offline).is_none());

        let missing_lifecycle = v(&[
            ("nodeId", json!("node-a")),
            ("role", json!("desktop")),
            ("platform", json!("windows")),
        ]);
        assert!(ct::target_from_node(&missing_lifecycle).is_none());
    }

    #[test]
    fn target_from_node_reports_platform_and_missing_capability_reasons() {
        let mac = v(&[
            ("nodeId", json!("node-mac")),
            ("name", json!("Mac")),
            ("role", json!("desktop")),
            ("lifecycle", json!("ready")),
            ("platform", json!("darwin")),
            (
                "capabilities",
                json!({ "tools": ["computer.session", "computer.observe", "computer.act"] }),
            ),
        ]);
        let target = ct::target_from_node(&mac).expect("desktop+ready node yields a target");
        assert_eq!(target.node_id, "node-mac");
        assert_eq!(target.name, "Mac");
        assert!(!target.available);
        assert_eq!(
            target.reason.as_deref(),
            Some("Computer control is currently available on Windows desktop nodes only")
        );

        let stale = windows_node("node-win", "Win", &["computer.session", "computer.observe"]);
        let target = ct::target_from_node(&stale).expect("node still yields a target entry");
        assert!(!target.available);
        assert_eq!(
            target.reason.as_deref(),
            Some("Desktop update required (computer.act is unavailable)")
        );

        // Only the *first* missing required tool is reported, in schema order.
        let nothing = windows_node("node-win2", "Win2", &[]);
        let target = ct::target_from_node(&nothing).unwrap();
        assert_eq!(
            target.reason.as_deref(),
            Some("Desktop update required (computer.session is unavailable)")
        );
    }

    #[test]
    fn target_from_node_defaults_name_to_node_id() {
        let unnamed = windows_node(
            "node-a",
            "",
            &["computer.session", "computer.observe", "computer.act"],
        );
        let target = ct::target_from_node(&unnamed).unwrap();
        assert_eq!(target.name, "node-a");
        assert!(target.available);
        assert!(target.reason.is_none());
    }

    #[test]
    fn select_target_resolves_explicit_and_implicit_targets() {
        let a = ct::target_from_node(&windows_node(
            "node-a",
            "A",
            &["computer.session", "computer.observe", "computer.act"],
        ))
        .unwrap();
        let b = ct::target_from_node(&windows_node(
            "node-b",
            "B",
            &["computer.session", "computer.observe", "computer.act"],
        ))
        .unwrap();

        // No targets at all.
        assert_eq!(
            ct::select_target(&[], None).unwrap_err(),
            "No controllable Windows desktop is connected"
        );

        // Exactly one available target and no explicit nodeId -> that target.
        assert_eq!(ct::select_target(std::slice::from_ref(&a), None).unwrap().node_id, "node-a");
        // Empty nodeId string behaves like "unspecified".
        assert_eq!(ct::select_target(std::slice::from_ref(&a), Some("")).unwrap().node_id, "node-a");

        // Two available targets require an explicit choice, listed in order.
        assert_eq!(
            ct::select_target(&[a.clone(), b.clone()], None).unwrap_err(),
            "More than one computer is available; choose nodeId: node-a, node-b"
        );

        // Explicit but unknown / disconnected nodeId.
        assert_eq!(
            ct::select_target(&[a.clone()], Some("ghost")).unwrap_err(),
            "Computer target ghost is not connected"
        );

        // Explicit selection of an unavailable target surfaces its reason.
        let stale = ct::target_from_node(&windows_node("node-old", "Old", &[])).unwrap();
        assert_eq!(
            ct::select_target(&[a.clone(), stale], Some("node-old")).unwrap_err(),
            "Desktop update required (computer.session is unavailable)"
        );

        assert_eq!(
            ct::select_target(&[a, b], Some("node-b")).unwrap().name,
            "B"
        );
    }

    #[test]
    fn validate_act_input_enforces_action_contract() {
        // move/click need finite coordinates.
        assert_eq!(
            ct::validate_act_input(&json!({ "action": "move" })).unwrap_err(),
            "move requires finite x and y coordinates"
        );
        assert_eq!(
            ct::validate_act_input(&json!({ "action": "click", "x": 1 })).unwrap_err(),
            "click requires finite x and y coordinates"
        );
        assert!(ct::validate_act_input(&json!({ "action": "click", "x": 1, "y": 2 })).is_ok());
        // Negative coordinates are legitimate (multi-monitor layouts).
        assert!(ct::validate_act_input(&json!({ "action": "move", "x": -10, "y": -20 })).is_ok());

        // Click count is limited to 1..=3 whole numbers.
        for bad in [json!(0), json!(4), json!(1.5)] {
            assert_eq!(
                ct::validate_act_input(&json!({ "action": "click", "x": 1, "y": 2, "clicks": bad }))
                    .unwrap_err(),
                "clicks must be an integer from 1 to 3",
                "clicks={bad} must be rejected"
            );
        }
        assert!(ct::validate_act_input(&json!({"action":"click","x":1,"y":2,"clicks":3})).is_ok());

        // type needs non-empty text.
        assert_eq!(
            ct::validate_act_input(&json!({ "action": "type", "text": "" })).unwrap_err(),
            "type requires non-empty text"
        );
        assert_eq!(
            ct::validate_act_input(&json!({ "action": "type" })).unwrap_err(),
            "type requires non-empty text"
        );
        assert!(ct::validate_act_input(&json!({"action":"type","text":"hi"})).is_ok());

        // key needs a combo, and whitespace-only combos do not count.
        assert_eq!(
            ct::validate_act_input(&json!({ "action": "key" })).unwrap_err(),
            "key requires a key combo such as win+r or ctrl+l"
        );
        assert_eq!(
            ct::validate_act_input(&json!({ "action": "key", "combo": "   " })).unwrap_err(),
            "key requires a key combo such as win+r or ctrl+l"
        );
        assert!(ct::validate_act_input(&json!({"action":"key","combo":"ctrl+l"})).is_ok());

        // scroll needs a direction.
        assert_eq!(
            ct::validate_act_input(&json!({ "action": "scroll" })).unwrap_err(),
            "scroll requires a direction"
        );
        assert!(
            ct::validate_act_input(&json!({"action":"scroll","direction":"down","amount":3})).is_ok()
        );

        // scroll amount must be positive when supplied.
        assert_eq!(
            ct::validate_act_input(&json!({ "action": "scroll", "direction": "down", "amount": 0 }))
                .unwrap_err(),
            "amount must be a positive number"
        );

        // waitAfterMs is bounded to 0..=10000.
        assert_eq!(
            ct::validate_act_input(&json!({ "action": "wait", "waitAfterMs": 10001 })).unwrap_err(),
            "waitAfterMs must be between 0 and 10000"
        );
        assert_eq!(
            ct::validate_act_input(&json!({ "action": "wait", "waitAfterMs": -1 })).unwrap_err(),
            "waitAfterMs must be between 0 and 10000"
        );
        assert!(ct::validate_act_input(&json!({"action":"wait","waitAfterMs":10000})).is_ok());
        assert!(ct::validate_act_input(&json!({"action":"wait","waitAfterMs":0})).is_ok());
    }

    #[test]
    fn as_remote_tool_result_passthrough_and_wrap() {
        let structured = json!({
            "ok": false,
            "message": "boom",
            "data": { "code": 7 },
            "extra": "dropped"
        });
        assert_eq!(
            ct::as_remote_tool_result(&structured, "ignored"),
            json!({ "ok": false, "message": "boom", "data": { "code": 7 } })
        );

        // Structured results without `data` do not gain one.
        assert_eq!(
            ct::as_remote_tool_result(&json!({ "ok": true, "message": "m" }), "ignored"),
            json!({ "ok": true, "message": "m" })
        );

        // Opaque payloads are wrapped under the caller's fallback message.
        assert_eq!(
            ct::as_remote_tool_result(&json!({ "foo": 1 }), "Command completed"),
            json!({ "ok": true, "message": "Command completed", "data": { "foo": 1 } })
        );
        // `ok`/`message` of the wrong type is not a structured result.
        assert_eq!(
            ct::as_remote_tool_result(&json!({ "ok": "yes", "message": "m" }), "wrapped"),
            json!({ "ok": true, "message": "wrapped", "data": { "ok": "yes", "message": "m" } })
        );
    }

    #[test]
    fn act_validation_clamps_wait_and_requires_positive_amount() {
        // `waitAfterMs` is bounded 0..=10_000 inclusive; both edges are legal.
        assert!(ct::validate_act_input(&json!({ "action": "move", "x": 1, "y": 2, "waitAfterMs": 0 })).is_ok());
        assert!(ct::validate_act_input(&json!({ "action": "move", "x": 1, "y": 2, "waitAfterMs": 10_000 })).is_ok());
        assert_eq!(
            ct::validate_act_input(&json!({ "action": "move", "x": 1, "y": 2, "waitAfterMs": 10_001 }))
                .unwrap_err(),
            "waitAfterMs must be between 0 and 10000"
        );
        // `amount` must be strictly positive for every action that carries it.
        assert_eq!(
            ct::validate_act_input(&json!({ "action": "scroll", "direction": "down", "amount": 0 })).unwrap_err(),
            "amount must be a positive number"
        );
        // `clicks` must be an integer in 1..=3.
        assert_eq!(
            ct::validate_act_input(&json!({ "action": "click", "x": 1, "y": 2, "clicks": 1.5 })).unwrap_err(),
            "clicks must be an integer from 1 to 3"
        );
        assert_eq!(
            ct::validate_act_input(&json!({ "action": "click", "x": 1, "y": 2, "clicks": 4 })).unwrap_err(),
            "clicks must be an integer from 1 to 3"
        );
        // Non-finite coordinates are rejected as missing.
        assert_eq!(
            ct::validate_act_input(&json!({ "action": "move", "x": 1 })).unwrap_err(),
            "move requires finite x and y coordinates"
        );
        assert_eq!(
            ct::validate_act_input(&json!({ "action": "type", "text": "" })).unwrap_err(),
            "type requires non-empty text"
        );
        assert_eq!(
            ct::validate_act_input(&json!({ "action": "key", "combo": "  " })).unwrap_err(),
            "key requires a key combo such as win+r or ctrl+l"
        );
    }
}

// ---------------------------------------------------------------------------
// packages/gateway/src/tools/screenshot-tools.ts
// ---------------------------------------------------------------------------
mod screenshot_tools {
    use super::*;
    use jait_gateway::tools::screenshot_tools as st;
    use std::path::{Path, PathBuf};

    #[test]
    fn metadata_declares_single_capture_tool() {
        let meta = st::metadata();
        let tools = meta.as_array().expect("metadata must be an array");
        assert_eq!(tools.len(), 1);
        assert_eq!(tools[0]["name"], json!("screenshot.capture"));
        assert_eq!(tools[0]["parameters"]["required"], json!(["target"]));
        let mut props: Vec<&str> = tools[0]["parameters"]["properties"]
            .as_object()
            .unwrap()
            .keys()
            .map(String::as_str)
            .collect();
        props.sort_unstable();
        assert_eq!(
            props,
            vec![
                "click",
                "dark",
                "fill",
                "fullPage",
                "height",
                "mobile",
                "path",
                "selector",
                "target",
                "waitForSelector",
                "waitMs",
                "width"
            ]
        );
        assert_eq!(st::definition("screenshot.capture")["name"], json!("screenshot.capture"));
    }

    #[test]
    fn definition_panics_on_unknown_tool() {
        let panic = std::panic::catch_unwind(|| st::definition("screenshot.nope"));
        let payload = panic.expect_err("unknown tool name must panic");
        let message = payload
            .downcast_ref::<String>()
            .cloned()
            .or_else(|| payload.downcast_ref::<&str>().map(|s| s.to_string()))
            .unwrap_or_default();
        assert!(
            message.contains("screenshot.nope"),
            "panic should name the unknown tool, got {message:?}"
        );
    }

    #[test]
    fn shots_dir_is_dot_jait_shots_under_project_root() {
        assert_eq!(
            st::shots_dir("/home/u/proj"),
            PathBuf::from("/home/u/proj/.jait/shots")
        );
        // Trailing slash in the project root does not duplicate the separator.
        assert_eq!(
            st::shots_dir("/home/u/proj/"),
            PathBuf::from("/home/u/proj/.jait/shots")
        );
        assert!(st::shots_dir("/tmp/x").ends_with(Path::new(".jait/shots")));
    }

    #[test]
    fn resolve_out_path_defaults_to_timestamped_png_in_shots_dir() {
        let out = st::resolve_out_path("", "/home/u/proj");
        assert_eq!(out.parent().unwrap(), Path::new("/home/u/proj/.jait/shots"));
        let name = out.file_name().unwrap().to_str().unwrap();
        let stamp = name
            .strip_prefix("screenshot-")
            .and_then(|rest| rest.strip_suffix(".png"))
            .unwrap_or_else(|| panic!("unexpected default name {name}"));
        assert!(all_digits(stamp), "timestamp should be numeric, got {stamp:?}");
        // Whitespace-only `path` is treated as omitted.
        assert_eq!(
            st::resolve_out_path("   ", "/home/u/proj").parent().unwrap(),
            Path::new("/home/u/proj/.jait/shots")
        );
    }

    #[test]
    fn resolve_out_path_makes_explicit_paths_absolute_and_png() {
        assert_eq!(
            st::resolve_out_path("shots/a.png", "/home/u/proj"),
            PathBuf::from("/home/u/proj/shots/a.png")
        );
        // Missing extension gets `.png` appended, not replaced.
        assert_eq!(
            st::resolve_out_path("shots/a", "/home/u/proj"),
            PathBuf::from("/home/u/proj/shots/a.png")
        );
        assert_eq!(
            st::resolve_out_path("  shots/b.jpg  ", "/home/u/proj"),
            PathBuf::from("/home/u/proj/shots/b.jpg.png")
        );
        assert_eq!(
            st::resolve_out_path("/var/tmp/c.png", "/home/u/proj"),
            PathBuf::from("/var/tmp/c.png")
        );
    }

    #[test]
    fn resolve_target_passes_urls_and_resolves_existing_paths() {
        // Absolute and scheme-qualified targets pass through untouched.
        assert_eq!(
            st::resolve_target("https://example.com/x", "/home/u/proj").unwrap(),
            "https://example.com/x"
        );
        assert_eq!(
            st::resolve_target("HTTP://Example.com/X", "/home/u/proj").unwrap(),
            "HTTP://Example.com/X"
        );
        assert_eq!(
            st::resolve_target("  file:///tmp/a.png  ", "/home/u/proj").unwrap(),
            "file:///tmp/a.png"
        );

        // Existing on-disk targets become file:// URLs.
        let dir = std::env::temp_dir().join(format!("jait-shot-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let page = dir.join("page.html");
        std::fs::write(&page, b"<html></html>").unwrap();
        let root = dir.to_str().unwrap();
        assert_eq!(
            st::resolve_target("page.html", root).unwrap(),
            format!("file://{}", page.to_string_lossy())
        );
        assert_eq!(
            st::resolve_target(page.to_str().unwrap(), root).unwrap(),
            format!("file://{}", page.to_string_lossy())
        );
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn resolve_target_reports_missing_path() {
        assert_eq!(
            st::resolve_target("missing.html", "/tmp/jait-nope-root").unwrap_err(),
            "target not found: missing.html (resolved /tmp/jait-nope-root/missing.html)"
        );
        assert_eq!(
            st::resolve_target("/tmp/jait-nope-abs.html", "/tmp/jait-nope-root").unwrap_err(),
            "target not found: /tmp/jait-nope-abs.html (resolved /tmp/jait-nope-abs.html)"
        );
    }
}
