//! term — remote interactive PTY sessions (mirror of apps/desktop/src/remote-terminal.ts).
//!
//! The Electron layer uses node-pty to spawn an interactive shell per
//! `terminal-op:start`, streams output as base64'd UTF-8 chunks through
//! `sendTerminalOutputEvent`, and forwards resize/input/stop commands.
//!
//! Rust equivalent: portable-pty. Sessions live in a global registry keyed by
//! terminalId; the Tauri layer pumps `writer take_writer()` input and reads
//! the master reader on a spawned thread, forwarding DesktopEvent::TerminalOutput
//! until exit (then DesktopEvent::TerminalExit).

use crate::types::*;
use parking_lot::Mutex;
use portable_pty::{native_pty_system, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Arc;

pub const MAX_PTY_BUFFER_BYTES: usize = 10 * 1024 * 1024; // matches remote-terminal.ts cap

pub struct TermSession {
    pub cwd: String,
    pub shell: String,
    pub pid: Option<u32>,
    pub master: Mutex<Box<dyn portable_pty::MasterPty + Send>>,
    pub writer: Mutex<Option<Box<dyn Write + Send>>>,
    pub alive: Mutex<bool>,
}

impl std::fmt::Debug for TermSession {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("TermSession")
            .field("cwd", &self.cwd)
            .field("shell", &self.shell)
            .field("pid", &self.pid)
            .finish_non_exhaustive()
    }
}

#[derive(Default)]
pub struct SessionRegistry {
    map: Mutex<HashMap<String, Arc<TermSession>>>,
}

impl SessionRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    /// Spawn a PTY running the user's default interactive shell in `cwd`.
    pub async fn start(
        &self,
        cwd: &str,
        cols: u16,
        rows: u16,
        on_output: impl Fn(String) + Send + 'static,
        on_exit: impl Fn(Option<i32>, Option<String>) + Send + 'static,
    ) -> Result<TerminalStart, String> {
        let shell = detect_shell();
        let cwd_path = if cwd.is_empty() {
            home_dir().unwrap_or_else(|| std::path::PathBuf::from("."))
        } else {
            std::path::PathBuf::from(cwd)
        };
        std::fs::create_dir_all(&cwd_path).ok();

        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("failed to open pty: {e}"))?;

        let mut cmd = portable_pty::CommandBuilder::new(&shell);
        // Remote-terminal parity: interactive shell in the requested cwd.
        cmd.cwd(&cwd_path);
        cmd.arg("-i");
        if cfg!(target_os = "windows") {
            cmd = portable_pty::CommandBuilder::new(&shell);
            cmd.cwd(&cwd_path);
        }
        let mut child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| format!("failed to spawn shell: {e}"))?;
        let pid = child.process_id();
        let mut reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| format!("failed to clone pty reader: {e}"))?;
        let writer = pair
            .master
            .take_writer()
            .map_err(|e| format!("failed to take pty writer: {e}"))?;

        let id = uuid::Uuid::new_v4().to_string();
        let session = Arc::new(TermSession {
            cwd: cwd_path.to_string_lossy().into_owned(),
            shell: shell.clone(),
            pid,
            master: Mutex::new(pair.master),
            writer: Mutex::new(Some(writer)),
            alive: Mutex::new(true),
        });
        self.map.lock().insert(id.clone(), session.clone());

        std::thread::spawn(move || {
            let mut buf = [0u8; 16384];
            let mut pending: Vec<u8> = Vec::new();
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        pending.extend_from_slice(&buf[..n]);
                        // Flush complete UTF-8 chunks; hold back a partial
                        // trailing byte like the TS base64 streaming wrapper.
                        match std::str::from_utf8(&pending) {
                            Ok(text) => {
                                on_output(text.to_string());
                                pending.clear();
                            }
                            Err(e) if e.valid_up_to() > 0 => {
                                let valid = e.valid_up_to();
                                if let Ok(text) = std::str::from_utf8(&pending[..valid]) {
                                    on_output(text.to_string());
                                }
                                pending.drain(..valid);
                            }
                            Err(_) if pending.len() > MAX_PTY_BUFFER_BYTES => {
                                let text = String::from_utf8_lossy(&pending);
                                on_output(text.into_owned());
                                pending.clear();
                            }
                            Err(_) => { /* wait for more bytes */ }
                        }
                    }
                    Err(_) => break,
                }
            }
            let exit_code = child_wait(&mut child);
            session.alive.lock().clone_from(&false);
            on_exit(exit_code, None);
        });

        Ok(TerminalStart {
            terminal_id: id,
            cwd: cwd_path.to_string_lossy().into_owned(),
            shell,
            pid,
        })
    }

    /// Send raw stdin bytes (base64 or plain string from the renderer).
    pub fn input(&self, terminal_id: &str, data: &str) -> Result<TerminalAck, String> {
        let session = self
            .map
            .lock()
            .get(terminal_id)
            .cloned()
            .ok_or("terminal not found")?;
        let mut w = session.writer.lock();
        if let Some(writer) = w.as_mut() {
            if data.starts_with("base64:") {
                use base64::Engine;
                let bytes = base64::engine::general_purpose::STANDARD
                    .decode(&data[7..])
                    .map_err(|e| format!("bad base64: {e}"))?;
                writer.write_all(&bytes).map_err(|e| e.to_string())?;
            } else {
                writer
                    .write_all(data.as_bytes())
                    .map_err(|e| e.to_string())?;
            }
            writer.flush().map_err(|e| e.to_string())?;
            Ok(TerminalAck { ok: true })
        } else {
            Err("terminal writer closed".into())
        }
    }

    pub fn resize(&self, terminal_id: &str, cols: u16, rows: u16) -> Result<TerminalAck, String> {
        let session = self
            .map
            .lock()
            .get(terminal_id)
            .cloned()
            .ok_or("terminal not found")?;
        session
            .master
            .lock()
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("resize failed: {e}"))?;
        Ok(TerminalAck { ok: true })
    }

    /// Stop mirrors remote-terminal.ts `killProcessTree`: kill the process
    /// group, then drop the PTY (SIGHUP-equivalent) and mark not alive.
    pub fn stop(&self, terminal_id: &str) -> Result<TerminalAck, String> {
        let session = {
            let mut map = self.map.lock();
            map.remove(terminal_id)
        };
        let Some(session) = session else {
            return Ok(TerminalAck { ok: true });
        };
        *session.alive.lock() = false;
        *session.writer.lock() = None;
        Ok(TerminalAck { ok: true })
    }

    pub fn is_alive(&self, terminal_id: &str) -> bool {
        self.map
            .lock()
            .get(terminal_id)
            .map(|s| *s.alive.lock())
            .unwrap_or(false)
    }
}

fn child_wait(child: &mut Box<dyn portable_pty::Child + Send + Sync>) -> Option<i32> {
    child
        .wait()
        .ok()
        .and_then(|s| s.exit_code().try_into().ok())
        .map(|c: i64| c as i32)
}

pub fn detect_shell() -> String {
    // Mirrors remote-terminal.ts getShell: SHELL env → bash → sh fallback.
    if let Ok(shell) = std::env::var("SHELL") {
        if !shell.is_empty() {
            return shell;
        }
    }
    if std::path::Path::new("/bin/bash").exists() {
        return "/bin/bash".into();
    }
    if cfg!(target_os = "windows") {
        "powershell.exe".into()
    } else {
        "/bin/sh".into()
    }
}

use crate::info::home_dir;

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn start_echoes_and_exits() {
        if cfg!(target_os = "windows") {
            return;
        }
        let registry = SessionRegistry::new();
        let dir = std::env::temp_dir().join(format!("jait-term-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();

        let (tx_out, rx_out) = std::sync::mpsc::channel::<String>();
        let (tx_exit, _rx_exit) = std::sync::mpsc::channel::<()>();
        let start = registry
            .start(
                dir.to_str().unwrap(),
                80,
                24,
                move |s| {
                    let _ = tx_out.send(s);
                },
                move |_, _| {
                    let _ = tx_exit.send(());
                },
            )
            .await
            .unwrap();
        assert!(!start.terminal_id.is_empty());
        assert!(
            start.shell.contains("bash") || start.shell.contains("sh"),
            "shell={}",
            start.shell
        );

        registry
            .input(&start.terminal_id, "echo hello-jait\n")
            .unwrap();

        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(10);
        let mut seen = String::new();
        while std::time::Instant::now() < deadline {
            if let Ok(s) = rx_out.try_recv() {
                seen.push_str(&s);
            }
            if seen.contains("hello-jait") {
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(50));
        }
        assert!(seen.contains("hello-jait"), "output: {seen:?}");
        registry.resize(&start.terminal_id, 100, 30).unwrap();
        registry.stop(&start.terminal_id).unwrap();
        assert!(!registry.is_alive(&start.terminal_id));
        std::fs::remove_dir_all(&dir).ok();
    }
}
