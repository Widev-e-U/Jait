//! jait-desktop-app — Tauri v2 adapter over the electron-parity glue.
//!
//! Layering (same rule set in `apps/desktop`):
//! - `jait-desktop-core` — raw OS ops, no webview, no IPC surface
//! - `jait-desktop-glue` — the full Electron IPC command surface
//!   (`desktop:fs-op`, `desktop:provider-op`, `desktop:terminal-op`, …)
//! - this crate — Tauri command plumbing + glue→Electron event translation
//!
//! The `shell` feature pulls in the Tauri runtime (needs platform webview
//! dev headers, e.g. webkit2gtk). Everything else — including the pure
//! event-translation layer tested below — compiles and tests on any machine
//! via plain `cargo test` (default features).

#[cfg(feature = "shell")]
pub mod shell;

#[cfg(feature = "shell")]
pub use shell::run;

use serde_json::{json, Value};

/// Translate a glue sink event into the Electron wire shape the renderer
/// consumes. Electron funnels *all* child-process traffic through the single
/// `gateway:event` channel with a flat `type` discriminator, while glue sinks
/// use per-domain channel names. Returns `None` for events that should not be
/// forwarded to the webview (e.g. native notification requests, handled in
/// the shell layer instead).
///
/// Contracts mirrored from `apps/desktop/src/electron-main.ts`:
/// - provider events pass through as-is (glue already camelCases `sessionId`)
/// - terminal output → `{ type: "terminal.output-from-child", terminalId, data }`
/// - terminal exit  → `{ type: "terminal.exit-from-child", terminalId, exitCode, signal }`
/// - background complete → `{ type: "tool.background-complete-from-child", backgroundId, exitCode, output }`
///   where `output` is stdout+stderr concatenated (Electron sent one combined string).
pub fn translate_glue_event(channel: &str, payload: &Value) -> Option<(String, Value)> {
    match channel {
        // Provider events already arrive in Electron wire shape.
        "gateway:event" => Some((channel.to_string(), payload.clone())),

        "terminal:output" => {
            let mut out = payload.clone();
            if let Some(obj) = out.as_object_mut() {
                obj.insert("type".into(), json!("terminal.output-from-child"));
            }
            Some(("gateway:event".into(), out))
        }

        "terminal:exit" => {
            // Electron reported the raw signal; glue reports an error string.
            let mut out = payload.clone();
            if let Some(obj) = out.as_object_mut() {
                obj.insert("type".into(), json!("terminal.exit-from-child"));
                let signal = obj
                    .get("error")
                    .cloned()
                    .unwrap_or(Value::Null);
                obj.remove("error");
                obj.insert("signal".into(), signal);
            }
            Some(("gateway:event".into(), out))
        }

        "background:complete" => {
            let mut out = payload.clone();
            if let Some(obj) = out.as_object_mut() {
                obj.insert(
                    "type".into(),
                    json!("tool.background-complete-from-child"),
                );
                let stdout = obj
                    .get("stdout")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_owned();
                let stderr = obj
                    .get("stderr")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_owned();
                obj.remove("stdout");
                obj.remove("stderr");
                obj.insert("output".into(), json!(format!("{stdout}{stderr}")));
            }
            Some(("gateway:event".into(), out))
        }

        // Native notification request — the shell layer turns this into an
        // OS notification; nothing to forward to the webview.
        "desktop:notify" => None,

        // Unknown/forward-only channels pass through untouched so new glue
        // events surface instead of being silently dropped.
        other => Some((other.to_string(), payload.clone())),
    }
}

/// Folder handed to a second launch via `--open-folder=<path>`, a bare
/// absolute path (macOS Finder "Open With"), or `--open-folder <path>`.
/// Mirrors Electron's second-instance → `renderer:open-folder` hand-off:
/// the path is canonicalized when it exists so the webview receives the
/// real location, and kept as-is when it doesn't (same as electron-main.ts,
/// which ignores unresolvable paths).
///
/// `argv` includes the program name at index 0, exactly like
/// `std::env::args()` and the tauri-plugin-single-instance callback.
pub fn resolve_folder_arg(argv: &[String]) -> Option<std::path::PathBuf> {
    let mut bare: Option<String> = None;
    let mut i = 1; // skip program name
    while i < argv.len() {
        let arg = &argv[i];
        if let Some(rest) = arg.strip_prefix("--open-folder=") {
            if !rest.is_empty() {
                bare = Some(rest.to_string());
            }
        } else if arg == "--open-folder" {
            if let Some(next) = argv.get(i + 1) {
                bare = Some(next.clone());
                i += 1;
            }
        } else if !arg.starts_with('-') {
            // Last non-flag positional arg wins (Finder-style single path).
            bare = Some(arg.clone());
        }
        i += 1;
    }
    let raw = bare?;
    let path = std::path::PathBuf::from(&raw);
    if !path.is_absolute() {
        return None; // same guard electron-main.ts applies
    }
    match std::fs::canonicalize(&path) {
        Ok(resolved) => Some(resolved),
        Err(_) => Some(path), // keep the raw path for new-folder flows
    }
}

/// Launch flags shared with Electron: `--hidden` (also `-hidden`/`--start-hidden`,
/// the electron convention) starts minimized to the tray, `--open-folder`
/// pre-loads a folder into the main window.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct LaunchOptions {
    pub start_hidden: bool,
    pub open_folder: Option<std::path::PathBuf>,
}

pub fn launch_options_from_argv(argv: &[String]) -> LaunchOptions {
    let start_hidden = argv
        .iter()
        .skip(1)
        .any(|a| a == "--hidden" || a == "-hidden" || a == "--start-hidden");
    LaunchOptions {
        start_hidden,
        open_folder: resolve_folder_arg(argv),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn launch_options_parse_hidden_and_folder() {
        let argv: Vec<String> = ["/usr/bin/jait", "--hidden", "--open-folder=/tmp"]
            .iter()
            .map(|s| s.to_string())
            .collect();
        let opts = launch_options_from_argv(&argv);
        assert!(opts.start_hidden);
        assert_eq!(opts.open_folder, Some(std::path::PathBuf::from("/tmp")));
    }

    #[test]
    fn launch_options_electron_hidden_aliases() {
        for flag in ["-hidden", "--hidden", "--start-hidden"] {
            let argv: Vec<String> = ["/usr/bin/jait", flag]
                .iter()
                .map(|s| s.to_string())
                .collect();
            assert!(launch_options_from_argv(&argv).start_hidden, "{flag}");
        }
        let argv: Vec<String> = ["/usr/bin/jait", "--hidden-mode"]
            .iter()
            .map(|s| s.to_string())
            .collect();
        assert!(!launch_options_from_argv(&argv).start_hidden);
    }

    #[test]
    fn launch_options_space_separated_folder() {
        let argv: Vec<String> = ["/usr/bin/jait", "--open-folder", "/tmp"]
            .iter()
            .map(|s| s.to_string())
            .collect();
        let opts = launch_options_from_argv(&argv);
        assert!(!opts.start_hidden);
        assert_eq!(opts.open_folder, Some(std::path::PathBuf::from("/tmp")));
    }

    #[test]
    fn launch_options_bare_absolute_path_wins() {
        let argv: Vec<String> = ["/usr/bin/jait", "/tmp"]
            .iter()
            .map(|s| s.to_string())
            .collect();
        let opts = launch_options_from_argv(&argv);
        assert_eq!(opts.open_folder, Some(std::path::PathBuf::from("/tmp")));
        assert!(!opts.start_hidden);
    }

    #[test]
    fn launch_options_relative_paths_ignored() {
        let argv: Vec<String> = ["/usr/bin/jait", "sub/dir"]
            .iter()
            .map(|s| s.to_string())
            .collect();
        assert!(launch_options_from_argv(&argv).open_folder.is_none());
        let empty: Vec<String> = vec!["/usr/bin/jait".to_string()];
        let opts = launch_options_from_argv(&empty);
        assert!(!opts.start_hidden);
        assert!(opts.open_folder.is_none());
    }

    #[test]
    fn resolve_folder_canonicalizes_existing_paths() {
        let dir = tempfile::tempdir().expect("tempdir");
        let nested = dir.path().join("link-target");
        std::fs::create_dir_all(&nested).expect("mkdir");
        let argv: Vec<String> = vec![
            "/usr/bin/jait".to_string(),
            format!(
                "--open-folder={}",
                dir.path().join("link-target").display()
            ),
        ];
        let resolved = resolve_folder_arg(&argv).expect("folder resolved");
        assert_eq!(resolved, nested);
    }

    #[test]
    fn resolve_folder_keeps_nonexistent_absolute_paths() {
        let argv: Vec<String> = vec![
            "/usr/bin/jait".to_string(),
            "--open-folder=/definitely/not/here".to_string(),
        ];
        assert_eq!(
            resolve_folder_arg(&argv),
            Some(std::path::PathBuf::from("/definitely/not/here"))
        );
    }

    #[test]
    fn provider_events_pass_through() {
        let payload = json!({
            "type": "provider.event-from-child",
            "sessionId": "s1",
            "notification": { "kind": "output" },
        });
        let (name, out) =
            translate_glue_event("gateway:event", &payload).expect("provider event forwarded");
        assert_eq!(name, "gateway:event");
        assert_eq!(out, payload);
    }

    #[test]
    fn terminal_output_gets_electron_type() {
        let payload = json!({ "terminalId": "t1", "data": "hello\n" });
        let (name, out) =
            translate_glue_event("terminal:output", &payload).expect("terminal output forwarded");
        assert_eq!(name, "gateway:event");
        assert_eq!(out["type"], "terminal.output-from-child");
        assert_eq!(out["terminalId"], "t1");
        assert_eq!(out["data"], "hello\n");
        assert!(out.get("session_id").is_none());
    }

    #[test]
    fn terminal_exit_maps_error_to_signal() {
        let payload = json!({ "terminalId": "t1", "exitCode": null, "error": "spawn failed" });
        let (name, out) =
            translate_glue_event("terminal:exit", &payload).expect("terminal exit forwarded");
        assert_eq!(name, "gateway:event");
        assert_eq!(out["type"], "terminal.exit-from-child");
        assert_eq!(out["exitCode"], Value::Null);
        assert_eq!(out["signal"], "spawn failed");
        assert!(out.get("error").is_none());
    }

    #[test]
    fn terminal_exit_without_error_has_null_signal() {
        let payload = json!({ "terminalId": "t2", "exitCode": 0, "error": Value::Null });
        let (_, out) = translate_glue_event("terminal:exit", &payload).unwrap();
        assert_eq!(out["signal"], Value::Null);
        assert_eq!(out["exitCode"], 0);
    }

    #[test]
    fn background_complete_merges_output() {
        let payload = json!({
            "backgroundId": "bg1",
            "exitCode": 0,
            "stdout": "out\n",
            "stderr": "warn\n",
        });
        let (name, out) = translate_glue_event("background:complete", &payload)
            .expect("background complete forwarded");
        assert_eq!(name, "gateway:event");
        assert_eq!(out["type"], "tool.background-complete-from-child");
        assert_eq!(out["backgroundId"], "bg1");
        assert_eq!(out["exitCode"], 0);
        assert_eq!(out["output"], "out\nwarn\n");
        assert!(out.get("stdout").is_none());
        assert!(out.get("stderr").is_none());
    }

    #[test]
    fn notify_events_are_not_forwarded() {
        let payload = json!({ "title": "Jait", "body": "hi" });
        assert!(translate_glue_event("desktop:notify", &payload).is_none());
    }

    #[test]
    fn unknown_channels_pass_through_untouched() {
        let payload = json!({ "x": 1 });
        let (name, out) = translate_glue_event("some:new-event", &payload).unwrap();
        assert_eq!(name, "some:new-event");
        assert_eq!(out, payload);
    }
}