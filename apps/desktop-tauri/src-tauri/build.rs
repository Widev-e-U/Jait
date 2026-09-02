fn main() {
    // tauri_build runs codegen only when the `shell` feature is active; the
    // tauri-free glue build must not depend on webkit2gtk headers.
    #[cfg(feature = "shell")]
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(
            // Without an app manifest tauri-build never emits ACL entries for
            // plain app commands, so `__TAURI_APP__` lookups deny them with
            // "not allowed. Plugin not found" once any capability exists.
            tauri_build::AppManifest::new().commands(&[
                "desktop_ipc",
                "desktop_pick_directory_dialog",
                "window_minimize",
                "window_toggle_maximize",
                "window_close",
                "window_is_maximized",
                "window_start_drag",
                "open_project_window",
                "desktop_get_login_item",
                "desktop_set_login_item",
            ]),
        ),
    )
    .expect("failed to run tauri-build");
}