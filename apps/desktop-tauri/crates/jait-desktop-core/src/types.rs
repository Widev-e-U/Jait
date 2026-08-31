//! Shared data shapes used by fsops/gitops/search/term/providers/tools.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

// ── Filesystem ──────────────────────────────────────────────────────────────

/// Result of `fs-op:read` — mirrors `readFile(absPath, "utf-8")` (plain string).
pub type FileText = String;

/// Result of `fs-op:readBinary` — matches `{ base64, bytes }`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReadBinaryOut {
    pub base64: String,
    pub bytes: u64,
}

/// Result of `fs-op:stat` / `file.stat` — matches Node's needed stat subset.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StatOut {
    pub size: u64,
    #[serde(rename = "isDirectory")]
    pub is_directory: bool,
    #[serde(rename = "isFile")]
    pub is_file: bool,
    pub modified: String, // RFC3339 / toISOString equivalent
}

/// Result of `fs-op:mkdir` — matches `{ ok, path }`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MkdirOut {
    pub ok: bool,
    pub path: String,
}

/// Result of `fs-op:write` — matches `{ bytes }`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WriteOut {
    pub bytes: u64,
}

/// Entry of `fs-op:readdir` — `{ name, isDirectory, isFile? }`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DirEntryOut {
    pub name: String,
    #[serde(rename = "isDirectory")]
    pub is_directory: bool,
    #[serde(rename = "isFile", skip_serializing_if = "Option::is_none")]
    pub is_file: Option<bool>,
}

/// `browse-path` entry — `{ name, path, type }` where type is "dir"|"file".
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrowseEntry {
    pub name: String,
    pub path: String,
    #[serde(rename = "type")]
    pub entry_type: String,
}

/// `browse-path` result — `{ path, parent, entries }`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrowseOut {
    pub path: String,
    pub parent: Option<String>,
    pub entries: Vec<BrowseEntry>,
}

/// `get-roots` result — `{ roots: BrowseEntry[] }` (drives on Windows + Home).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RootsOut {
    pub roots: Vec<BrowseEntry>,
}

// ── Search ──────────────────────────────────────────────────────────────────

/// `search-project` request (mirrors search-tools.ts search args).
#[derive(Debug, Clone, Deserialize)]
pub struct SearchRequest {
    pub query: String,
    #[serde(default = "default_search_mode")]
    pub mode: String,
    #[serde(default)]
    pub limit: Option<u64>,
    #[serde(default)]
    pub include: Option<String>,
    #[serde(default)]
    pub is_regexp: Option<bool>,
    #[serde(default)]
    pub include_ignored_files: Option<bool>,
}

fn default_search_mode() -> String { "content".into() }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchMatch {
    pub file: String,
    pub line: u64,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchFile {
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub mode: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub matches: Option<Vec<SearchMatch>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub files: Option<Vec<SearchFile>>,
    pub limited: bool,
}

// ── Git ─────────────────────────────────────────────────────────────────────

/// Result of running git/gh — `{ stdout, stderr, exitCode }` (exitCode always 0 on Ok path).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandOut {
    pub stdout: String,
    pub stderr: String,
    #[serde(rename = "exitCode")]
    pub exit_code: i32,
}

/// Per-file diff row for Monaco — `{ path, original, modified, status }`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileDiff {
    pub path: String,
    pub original: String,
    pub modified: String,
    pub status: String, // A | D | M | R
}

/// `git-status` row — `{ path, x, y, from?, staged? }` mirroring `git status --porcelain=v1 -z`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitStatusEntry {
    pub path: String,
    pub x: String,
    pub y: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub from: Option<String>,
    #[serde(rename = "staged", skip_serializing_if = "Option::is_none")]
    pub staged: Option<String>, // "staged" | "unstaged" marker rows the renderer expects
}

// ── Terminals ───────────────────────────────────────────────────────────────

/// Result of `terminal-op:start` — `{ terminalId, cwd, shell, pid }`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerminalStart {
    #[serde(rename = "terminalId")]
    pub terminal_id: String,
    pub cwd: String,
    pub shell: String,
    pub pid: Option<u32>,
}

/// Result of `terminal-op:input/resize/stop` — `{ ok: true }` (renderer ignores details).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerminalAck {
    pub ok: bool,
}

// ── Providers ───────────────────────────────────────────────────────────────

/// Supported desktop provider ids (mirrors isSupportedDesktopProviderId).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ProviderType {
    #[serde(rename = "codex")]
    Codex,
    #[serde(rename = "claude-code")]
    ClaudeCode,
}

/// Result of `provider-op:start-session`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderStarted {
    #[serde(rename = "providerThreadId")]
    pub provider_thread_id: String,
}

/// Result of `provider-op:auth-status`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthStatus {
    #[serde(rename = "authStatus")]
    pub auth_status: String, // "signed-out" | "signed-in" | "needs-login"
    #[serde(rename = "accountUser", skip_serializing_if = "Option::is_none")]
    pub account_user: Option<String>,
}

/// Result of `provider-op:start-login` — login URL the renderer opens.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoginStarted {
    pub url: String,
}

/// Result of `provider-op:logout` / `delete-account` — `{ ok }`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OkOut {
    pub ok: bool,
}

/// Result of `provider-op:stop-session` — `{ ok, stopped }`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StopOut {
    pub ok: bool,
    pub stopped: bool,
}

/// Result of provider runtime detection — `{ mode: "cli"|"bundled"|"missing", command }`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderRuntime {
    pub mode: String,
    pub command: String,
}

/// `provider-op:start-session` request body (mirrors remote-agent.ts args).
#[derive(Debug, Clone, Deserialize)]
pub struct ProviderSessionRequest {
    pub provider: String,
    #[serde(default)]
    pub model: Option<String>,
    #[serde(default)]
    pub max_turns: Option<u32>,
}

/// Generic desktop-op tool result — `{ ok, message?, data? }`.
#[derive(Debug, Clone, Serialize)]
pub struct ToolResult {
    pub ok: bool,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
}

/// Paths the host layer passes into the core (keeps core free of Tauri APIs).
#[derive(Debug, Clone)]
pub struct AppPaths {
    pub settings_file: PathBuf,
    pub credential_service: String,
    pub home_dir: PathBuf,
}