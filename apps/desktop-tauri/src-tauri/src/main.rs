//! jait-desktop-app (Tauri v2 adapter over the electron-main-parity core).
//!
//! Real setup lives in `jait_desktop_app::run()` so tests exercise the glue
//! without spawning a window. Build the shell with `--features shell`.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    #[cfg(feature = "shell")]
    jait_desktop_app::run();

    #[cfg(not(feature = "shell"))]
    eprintln!("jait-desktop-app built without the `shell` feature — nothing to launch (cargo build --features shell)");
}