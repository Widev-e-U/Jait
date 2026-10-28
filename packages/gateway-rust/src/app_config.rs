//! Native port of `packages/gateway/src/config.ts`.
//!
//! This module is a deliberate, line-by-line translation of the TypeScript
//! gateway configuration loader. Every default, every `??` versus
//! `?.trim() ||` distinction, and the `parseInt(..., 10) || fallback` idiom are
//! reproduced verbatim so that a native gateway resolves exactly the same
//! values as the TypeScript one for the same environment.
//!
//! Differences that are forced by the language, and how they were resolved:
//!
//! * **`parseInt` returns `NaN` on garbage.** TypeScript happily stores `NaN`
//!   in a `number` field. Rust's integer types cannot. [`parse_js_int`] returns
//!   `None` where JS yields `NaN` (and where the resulting integer would not
//!   fit `i64`), and every call site then applies the *same* fallback JS would
//!   apply for a falsy value (`|| fallback`). `port`/`ws_port` are the two
//!   fields without a `||` fallback in the TS source: there an absent variable
//!   yields the TS default, while an unparseable or out-of-`u16`-range value
//!   falls back to the same default instead of becoming `NaN` (a `NaN` port is
//!   unusable to Node as well — `server.listen(NaN)` throws `ERR_SOCKET_BAD_PORT`).
//! * **`llm_provider` type.** The TS type is the two-member union
//!   `"ollama" | "openai"`, but the value is produced by an *unchecked cast*
//!   (`process.env["LLM_PROVIDER"] as LlmProvider`), so at runtime any string
//!   survives verbatim — including untrimmed values and typos. A plain
//!   two-variant Rust enum would silently drop that behaviour. [`LlmProvider`]
//!   therefore has a third variant, [`LlmProvider::Other`], carrying the raw
//!   string; `as_str()` always returns the original text, so behaviour for
//!   "openai"/"ollama" is identical to the union and everything else is
//!   preserved instead of being coerced. Convenience predicates
//!   [`LlmProvider::is_openai`] / [`LlmProvider::is_ollama`] replace the TS
//!   string comparisons (`config.llmProvider === "openai"`).
//! * **Generated fallback secrets** use [`std::sync::OnceLock`] instead of the
//!   module-level `let generatedJwtSecret: string | undefined` + `??=`
//!   pattern, which is the same guarantee: one 64-char hex secret per process,
//!   stable across every [`load_with`] call. Randomness comes from the
//!   `getrandom` crate that is already a dependency of this crate; if the OS
//!   entropy source fails we fall back to a time + address seeded xorshift
//!   mixer rather than panicking (the TS version would throw).
//! * **`.trim()`** is JS `String.prototype.trim`, which also strips U+FEFF
//!   (BOM); [`js_trim`] does the same instead of plain [`str::trim`].
//! * **`.toLowerCase()`** for model matching and `JAIT_NODE_ONLY` uses
//!   [`str::to_lowercase`], which agrees with JS for the ASCII inputs involved.
//!
//! The dotenv bootstrapping at the top of the TS file (`if (!process.env
//! ["__JAIT_CLI"]) { ... config({ path: envPath }) }`) is ported as three
//! *side-effect-free* helpers — [`dotenv_candidates`], [`parse_dotenv`] and
//! [`should_load_dotenv`]. Nothing in this module touches the filesystem or the
//! process environment at import time, and [`load_with`] never calls them: the
//! caller decides whether to parse a `.env` file and hands the resulting
//! key/value pairs to its own lookup closure.

use std::fmt;
use std::path::{Component, Path, PathBuf};
use std::sync::OnceLock;

/// LLM backend selection.
///
/// Mirrors `export type LlmProvider = "ollama" | "openai"` while keeping the
/// verbatim pass-through the TS code gets from its unchecked cast; see the
/// module docs. The two canonical values compare and render exactly like the
/// TS string literals.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum LlmProvider {
    Ollama,
    OpenAi,
    /// Any other explicit `LLM_PROVIDER` value, preserved byte-for-byte
    /// (untrimmed, unvalidated) exactly as `as LlmProvider` preserved it.
    Other(String),
}

impl LlmProvider {
    /// Canonical value for the two known providers.
    pub const OLLAMA: &'static str = "ollama";
    /// Canonical value for the two known providers.
    pub const OPENAI: &'static str = "openai";

    /// Interpret an explicit `LLM_PROVIDER` value.
    ///
    /// Exact matches map onto the canonical variants; everything else (typos,
    /// different casing, whitespace, the empty string) is kept verbatim so
    /// `as_str()` reproduces the environment value unchanged.
    pub fn from_explicit(raw: &str) -> Self {
        match raw {
            Self::OPENAI => Self::OpenAi,
            Self::OLLAMA => Self::Ollama,
            other => Self::Other(other.to_string()),
        }
    }

    /// The string this provider corresponds to — always what the environment
    /// supplied for [`LlmProvider::Other`].
    pub fn as_str(&self) -> &str {
        match self {
            Self::Ollama => Self::OLLAMA,
            Self::OpenAi => Self::OPENAI,
            Self::Other(raw) => raw,
        }
    }

    /// Equivalent of `config.llmProvider === "openai"`.
    pub fn is_openai(&self) -> bool {
        matches!(self, Self::OpenAi)
    }

    /// Equivalent of `config.llmProvider === "ollama"`.
    pub fn is_ollama(&self) -> bool {
        matches!(self, Self::Ollama)
    }
}

impl fmt::Display for LlmProvider {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

/// Complete gateway configuration — the port of the TS `AppConfig` interface.
///
/// Field names are the TS names in `snake_case`; types follow the TS `number`
/// fields with the narrowest faithful Rust integer (`port`/`ws_port` as `u16`,
/// token counts as `u32`, millisecond budgets as `u64`).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AppConfig {
    pub port: u16,
    pub ws_port: u16,
    pub host: String,
    pub log_level: String,
    pub cors_origin: String,
    pub node_env: String,
    pub jwt_secret: String,
    /// LLM provider selection (`LLM_PROVIDER` / auto-detection).
    pub llm_provider: LlmProvider,
    /// Ollama endpoint.
    pub ollama_url: String,
    /// Ollama model, including the `:tag` Ollama expects.
    pub ollama_model: String,
    /// OpenAI (or OpenAI-compatible) credential; empty when unset.
    pub openai_api_key: String,
    /// OpenAI model used for chat completions.
    pub openai_model: String,
    /// OpenAI (or OpenAI-compatible) API base URL.
    pub openai_base_url: String,
    /// OmniRoute — a locally run OpenAI-compatible router that fans out to many
    /// upstream providers. Defaults to the router's own default port. Running
    /// the gateway in Docker means localhost is the container, not the host, so
    /// this needs an explicit override (e.g. `http://host.docker.internal:20128/v1`).
    pub omniroute_base_url: String,
    /// Optional — OmniRoute serves keyless free-tier providers without one.
    pub omniroute_api_key: String,
    /// Max context window tokens (auto-detected from the model name if unset).
    pub context_window: u32,
    /// Autonomous checkpoint interval for user-facing Jait turns.
    ///
    /// `0` uses the default 64-round interval. The loop continues after each
    /// checkpoint; this legacy setting only controls how often it compacts and
    /// reassesses. Per-user overrides use the `JAIT_MAX_ROUNDS` settings key.
    pub agent_max_rounds: u32,
    /// Context length (`num_ctx`) requested from Ollama via its native
    /// `/api/chat` endpoint. The OpenAI-compat `/v1` endpoint ignores `num_ctx`
    /// and pins models to the server default, so Jait sets this explicitly.
    /// Override per-user with the `OLLAMA_NUM_CTX` setting, or globally with env
    /// `OLLAMA_CONTEXT_LENGTH`.
    pub ollama_context_window: u32,
    pub hook_secret: String,
    pub heartbeat_cron: String,
    /// URL of the local Faster Whisper server (default `http://localhost:8178`).
    pub whisper_url: String,
    /// OpenAI model for the real-time voice assistant (Realtime API).
    pub realtime_model: String,
    /// Speech-to-text model the realtime session uses for its live transcript.
    /// Overridable so a rename on the provider side never needs a code change.
    pub realtime_transcribe_model: String,
    /// Voice used by the real-time assistant (alloy, echo, shimmer, etc.).
    pub realtime_voice: String,
    /// Blocking budget for a spoken escalation answer. When the delegate is
    /// still working after this many milliseconds, the call is promoted to a
    /// background task so the live conversation is not left in silence.
    pub voice_escalation_async_ms: u64,
    /// Delay before speaking a filler acknowledgement while a delegate runs.
    pub voice_escalation_filler_ms: u64,
    /// Hint string passed to the speech-to-text (STT) layer to bias recognition
    /// toward domain-specific proper nouns. This fixes common mishearings such
    /// as "Jait" being transcribed as "Jade". Override with env
    /// `JAIT_STT_PROMPT`.
    pub stt_prompt: String,
    /// URL of an upstream/primary gateway to link to as a filesystem node.
    /// When set, this gateway opens an outbound WS to the primary, registers
    /// itself as a browseable fs-node, and serves browse/roots/op requests from
    /// its local disk. Empty string disables the link (default).
    pub primary_gateway: String,
    /// Bearer token used to authenticate the primary-link WS (optional; not
    /// needed if the primary runs in development mode).
    pub primary_token: String,
    /// Display name advertised to the primary for this node.
    pub node_name: String,
    /// SSH account used by the `os.*` Windows driver to reach the dockur
    /// Windows VM. Override with `WINDOWS_SSH_USERNAME`.
    pub windows_ssh_username: String,
    /// SSH password used by the `os.*` Windows driver. Override with
    /// `WINDOWS_SSH_PASSWORD`.
    pub windows_ssh_password: String,
    /// Run as a headless remote node only. In this mode the process does not
    /// expose the gateway HTTP dashboard/API and only opens the outbound
    /// primary link used for remote filesystem and terminal access.
    pub node_only: bool,
}

/// JS `String.prototype.trim`: Unicode whitespace plus the BOM (U+FEFF).
pub fn js_trim(raw: &str) -> &str {
    raw.trim_matches(|c: char| c.is_whitespace() || c == '\u{feff}')
}

/// JS `parseInt(raw, 10)` restricted to the base-10 case.
///
/// Semantics reproduced:
/// * leading JS whitespace is skipped (`" 42 "` -> `42`);
/// * one optional `+`/`-` sign is consumed, then only decimal digits
///   (`"+7"` -> `7`, `"-5"` -> `-5`);
/// * trailing garbage stops the scan but does not invalidate it
///   (`"12abc"` -> `12`, `"3.9"` -> `3`, `"0x10"` -> `0` because radix 10 makes
///   the `x` terminate the digit run);
/// * no digit at all yields `NaN` -> `None` (`""`, `"abc"`, `"-"`, `" "`);
/// * `"0"` yields `Some(0)` — a real zero, which is falsy for `||` at the call
///   sites.
///
/// A digit run too large for `i64` saturates at [`i64::MAX`] / [`i64::MIN`]
/// instead of becoming an imprecise f64; every consumer in this module then
/// rejects it as out of range for its own integer type.
pub fn parse_js_int(raw: &str) -> Option<i64> {
    let s = raw.trim_start_matches(|c: char| c.is_whitespace() || c == '\u{feff}');
    let (negative, rest) = match s.as_bytes().first() {
        Some(b'-') => (true, &s[1..]),
        Some(b'+') => (false, &s[1..]),
        _ => (false, s),
    };
    let digits_end = rest
        .find(|c: char| !c.is_ascii_digit())
        .unwrap_or(rest.len());
    if digits_end == 0 {
        return None;
    }
    let magnitude: u64 = rest[..digits_end].parse().unwrap_or(u64::MAX);
    if negative {
        if magnitude > (i64::MAX as u64) {
            Some(i64::MIN)
        } else {
            Some(-(magnitude as i64))
        }
    } else if magnitude > i64::MAX as u64 {
        Some(i64::MAX)
    } else {
        Some(magnitude as i64)
    }
}

/// Infer context window size from the model name. Conservative defaults.
///
/// Branch order is significant and mirrors the TS source exactly:
/// `gpt-4-turbo` is tested before the generic `gpt-4` (`8_192`), and
/// `claude-3`/`claude-4` before the generic `claude` (`100_000`). The
/// substring tests that precede the generic ones also swallow the more
/// specific names (`gpt-4o`, `gpt-4.1`, `gpt-3.5`, ...).
pub fn infer_context_window(model: &str) -> u32 {
    let m = model.to_lowercase();
    // OmniRoute routing aliases ("auto", "auto/coding", ...) name a strategy,
    // not a model — the concrete upstream is picked per request and can be a
    // small free model, so stay at the conservative default instead of
    // guessing high.
    if m == "auto" || m.starts_with("auto/") {
        return 128_000;
    }
    if m.contains("gpt-5") {
        return 400_000;
    }
    if m.contains("gpt-4o") || m.contains("gpt-4.1") {
        return 128_000;
    }
    if m.contains("gpt-4-turbo") {
        return 128_000;
    }
    if m.contains("gpt-4") {
        return 8_192;
    }
    if m.contains("gpt-3.5") {
        return 16_385;
    }
    if m.contains("claude-3") || m.contains("claude-4") {
        return 200_000;
    }
    if m.contains("claude") {
        return 100_000;
    }
    if m.contains("gemini") {
        return 128_000;
    }
    if m.contains("o1") || m.contains("o3") || m.contains("o4") {
        return 200_000;
    }
    if m.contains("deepseek") {
        return 64_000;
    }
    if m.contains("mistral") || m.contains("mixtral") {
        return 32_000;
    }
    if m.contains("llama") {
        return 8_192;
    }
    128_000 // safe default
}

/// Process-lifetime generated JWT secret (`generatedJwtSecret ??= ...`).
static GENERATED_JWT_SECRET: OnceLock<String> = OnceLock::new();
/// Process-lifetime generated hook secret (`generatedHookSecret ??= ...`).
static GENERATED_HOOK_SECRET: OnceLock<String> = OnceLock::new();

fn generated_jwt_secret() -> &'static str {
    GENERATED_JWT_SECRET
        .get_or_init(random_hex_secret)
        .as_str()
}

fn generated_hook_secret() -> &'static str {
    GENERATED_HOOK_SECRET
        .get_or_init(random_hex_secret)
        .as_str()
}

/// `randomBytes(32).toString("hex")` — 32 random bytes, 64 lowercase hex chars.
fn random_hex_secret() -> String {
    let mut bytes = [0u8; 32];
    if getrandom::fill(&mut bytes).is_err() {
        // The OS entropy source is unavailable; degrade instead of panicking
        // the way `randomBytes` would. Time + stack-address seeded xorshift.
        fallback_bytes(&mut bytes);
    }
    hex::encode(bytes)
}

fn fallback_bytes(out: &mut [u8; 32]) {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos() as u64)
        .unwrap_or(0);
    let addr = out.as_ptr() as usize as u64;
    let mut state = nanos
        .rotate_left(17)
        .wrapping_mul(0x9E37_79B9_7F4A_7C15)
        ^ addr.wrapping_mul(0xBF58_476D_1CE4_E5B9)
        ^ 0x2545_F491_4F6C_DD1D;
    for chunk in out.chunks_mut(8) {
        state ^= state << 13;
        state ^= state >> 7;
        state ^= state << 17;
        let produced = state.to_le_bytes();
        let take = chunk.len().min(produced.len());
        chunk[..take].copy_from_slice(&produced[..take]);
    }
}

// --- environment lookup helpers (each one mirrors one TS expression) -------

/// `process.env[key] ?? default`
fn string_or<L: Fn(&str) -> Option<String>>(lookup: &L, key: &str, default: &str) -> String {
    lookup(key).unwrap_or_else(|| default.to_string())
}

/// `process.env[key]?.trim() ?? default`
///
/// Note: a whitespace-only value trims to `""`, which is *not* nullish, so the
/// default does **not** apply. That asymmetry with [`trimmed_nonempty_or`] is
/// the TS behaviour and is preserved.
fn trimmed_or<L: Fn(&str) -> Option<String>>(lookup: &L, key: &str, default: &str) -> String {
    match lookup(key) {
        Some(raw) => js_trim(&raw).to_string(),
        None => default.to_string(),
    }
}

/// `process.env[key]?.trim() || default`
fn trimmed_nonempty_or<L: Fn(&str) -> Option<String>>(
    lookup: &L,
    key: &str,
    default: &str,
) -> String {
    match lookup(key) {
        Some(raw) => {
            let trimmed = js_trim(&raw);
            if trimmed.is_empty() {
                default.to_string()
            } else {
                trimmed.to_string()
            }
        }
        None => default.to_string(),
    }
}

/// `parseInt(process.env[key] ?? "0", 10)`
///
/// An absent variable parses the `"0"` literal, hence `Some(0)`.
fn parsed_env<L: Fn(&str) -> Option<String>>(lookup: &L, key: &str) -> Option<i64> {
    match lookup(key) {
        Some(raw) => parse_js_int(&raw),
        None => Some(0),
    }
}

/// `parseInt(process.env[key] ?? "0", 10) || fallback` for a `u32` field.
///
/// `None` stands for JS `NaN`; `NaN` and `0` are both falsy, so both take the
/// fallback. Negative results are truthy in JS but unrepresentable as `u32`;
/// they take the fallback rather than wrapping around.
fn parsed_u32_or<L: Fn(&str) -> Option<String>>(lookup: &L, key: &str, fallback: u32) -> u32 {
    match parsed_env(lookup, key) {
        Some(value) if value != 0 => u32::try_from(value).unwrap_or(fallback),
        _ => fallback,
    }
}

/// `parseInt(process.env[key] ?? "0", 10) || fallback` for a `u64` field.
fn parsed_u64_or<L: Fn(&str) -> Option<String>>(lookup: &L, key: &str, fallback: u64) -> u64 {
    match parsed_env(lookup, key) {
        Some(value) if value != 0 => u64::try_from(value).unwrap_or(fallback),
        _ => fallback,
    }
}

/// `parseInt(process.env[key] ?? "<default>", 10)` for a `u16` port.
///
/// There is no `||` fallback in the TS source for the two ports, so an absent
/// variable must yield the default. `NaN`, negatives and values above
/// `u16::MAX` are not representable and also fall back to the default (see the
/// module docs for why that is the least surprising resolution).
fn port_or<L: Fn(&str) -> Option<String>>(lookup: &L, key: &str, default: u16) -> u16 {
    match lookup(key) {
        None => default,
        Some(raw) => match parse_js_int(&raw) {
            Some(value) => u16::try_from(value).unwrap_or(default),
            None => default,
        },
    }
}

/// Default `JAIT_STT_PROMPT` hint for the speech-to-text layer.
pub const DEFAULT_STT_PROMPT: &str =
    "Jait (the assistant's name, pronounced like 'jate'), Hey Jait";

/// The port of `loadConfig()`, driven by an injectable environment lookup.
///
/// Every `process.env[...]` read in the TS source becomes one `lookup(key)`
/// call — `None` meaning "unset" (`undefined`). Tests and alternative
/// front-ends pass a closure instead of mutating the process environment.
pub fn load_with(lookup: impl Fn(&str) -> Option<String>) -> AppConfig {
    let lookup = &lookup;

    // Auto-detect provider: if OPENAI_API_KEY is set, default to openai.
    // `!!process.env[...]` tests presence, not truthiness, and the explicit
    // value is used verbatim (empty string included).
    let has_openai_key = lookup("OPENAI_API_KEY").is_some();
    let explicit_provider = lookup("LLM_PROVIDER");

    // Generated fallback secrets must stay stable for the process lifetime:
    // tests and some entrypoints call loadConfig() more than once, and two
    // different random secrets would make tokens signed with one config
    // unverifiable by a server built with the other.
    let jwt_secret = trimmed_nonempty_or(lookup, "JWT_SECRET", generated_jwt_secret());
    let hook_secret = trimmed_nonempty_or(lookup, "HOOK_SECRET", generated_hook_secret());
    let primary_gateway = trimmed_or(lookup, "JAIT_PRIMARY_GATEWAY", "");
    let node_only_raw = lookup("JAIT_NODE_ONLY").map(|raw| js_trim(&raw).to_lowercase());
    let node_only = match node_only_raw {
        Some(ref raw) if !raw.is_empty() => {
            matches!(raw.as_str(), "1" | "true" | "yes" | "on")
        }
        _ => !primary_gateway.is_empty(),
    };

    // `inferContextWindow` is fed the *raw* `OPENAI_MODEL` (no trimming) and the
    // shared default is `gpt-4o`.
    let openai_model = string_or(lookup, "OPENAI_MODEL", "gpt-4o");
    let context_window = match parsed_env(lookup, "CONTEXT_WINDOW") {
        Some(value) if value != 0 => {
            u32::try_from(value).unwrap_or_else(|_| infer_context_window(&openai_model))
        }
        _ => infer_context_window(&openai_model),
    };

    AppConfig {
        port: port_or(lookup, "PORT", 8000),
        ws_port: port_or(lookup, "WS_PORT", 18789),
        host: string_or(lookup, "HOST", "0.0.0.0"),
        log_level: string_or(lookup, "LOG_LEVEL", "info"),
        cors_origin: string_or(lookup, "CORS_ORIGIN", "http://localhost:3000"),
        node_env: string_or(lookup, "NODE_ENV", "development"),
        jwt_secret,
        llm_provider: match explicit_provider {
            Some(raw) => LlmProvider::from_explicit(&raw),
            None if has_openai_key => LlmProvider::OpenAi,
            None => LlmProvider::Ollama,
        },
        ollama_url: string_or(lookup, "OLLAMA_URL", "http://localhost:11434"),
        ollama_model: string_or(
            lookup,
            "OLLAMA_MODEL",
            "CognitiveComputations/dolphin-mistral-nemo:12b",
        ),
        openai_api_key: string_or(lookup, "OPENAI_API_KEY", ""),
        openai_model,
        openai_base_url: string_or(lookup, "OPENAI_BASE_URL", "https://api.openai.com/v1"),
        omniroute_base_url: string_or(lookup, "OMNIROUTE_BASE_URL", "http://localhost:20128/v1"),
        omniroute_api_key: string_or(lookup, "OMNIROUTE_API_KEY", ""),
        context_window,
        agent_max_rounds: parsed_u32_or(lookup, "JAIT_MAX_ROUNDS", 0),
        ollama_context_window: parsed_u32_or(lookup, "OLLAMA_CONTEXT_LENGTH", 32_768),
        hook_secret,
        heartbeat_cron: string_or(lookup, "HEARTBEAT_CRON", "* * * * *"),
        whisper_url: string_or(lookup, "WHISPER_URL", "http://localhost:8178"),
        // Unversioned alias so the live model always tracks OpenAI's latest GA
        // realtime release instead of a pinned version.
        realtime_model: trimmed_nonempty_or(lookup, "OPENAI_REALTIME_MODEL", "gpt-realtime"),
        realtime_transcribe_model: trimmed_nonempty_or(
            lookup,
            "OPENAI_REALTIME_TRANSCRIBE_MODEL",
            "gpt-4o-transcribe",
        ),
        realtime_voice: string_or(lookup, "OPENAI_REALTIME_VOICE", "alloy"),
        voice_escalation_async_ms: parsed_u64_or(lookup, "JAIT_VOICE_ESCALATION_ASYNC_MS", 12_000),
        voice_escalation_filler_ms: parsed_u64_or(
            lookup,
            "JAIT_VOICE_ESCALATION_FILLER_MS",
            2_500,
        ),
        stt_prompt: trimmed_or(lookup, "JAIT_STT_PROMPT", DEFAULT_STT_PROMPT),
        primary_gateway,
        primary_token: trimmed_or(lookup, "JAIT_PRIMARY_TOKEN", ""),
        node_name: trimmed_or(lookup, "JAIT_NODE_NAME", ""),
        // Windows VM sandbox SSH channel — matches the dockur image defaults
        // (docker/Dockerfile.windows-sandbox) so the os.* Windows driver works
        // out of the box; override when the VM is provisioned with other creds.
        windows_ssh_username: trimmed_or(lookup, "WINDOWS_SSH_USERNAME", "Docker"),
        windows_ssh_password: trimmed_or(lookup, "WINDOWS_SSH_PASSWORD", "admin"),
        node_only,
    }
}

/// [`load_with`] over the real process environment — the direct counterpart of
/// `loadConfig()`.
///
/// `std::env::var` reports non-UTF-8 values as unset, which matches Node's
/// UTF-8-only `process.env` view.
pub fn load() -> AppConfig {
    load_with(|key| std::env::var(key).ok())
}

// --- dotenv bootstrapping (side-effect free) --------------------------------
//
// The TS module runs this at import time:
//
// ```js
// if (!process.env["__JAIT_CLI"]) {
//   const candidates = [
//     resolve(process.cwd(), ".env"),
//     resolve(STATE_DIR, ".env"),
//     resolve(__dirname, "../../../.env"),
//   ];
//   const envPath = candidates.find((p) => existsSync(p));
//   if (envPath) {
//     config({ path: envPath, override: false, quiet: true });
//   }
// }
// ```
//
// Here the pieces are exposed separately and nothing happens implicitly: no
// filesystem access at module init, and [`load_with`] never calls them. The
// caller decides whether (and when) to load a `.env` file, parses it with
// [`parse_dotenv`], and folds the pairs into its own lookup closure.

/// The three `.env` locations the TS module probes, in priority order:
/// `cwd/.env`, `STATE_DIR/.env`, and `<module dir>/../../../.env` (the monorepo
/// root reached from `packages/gateway/src`).
///
/// `cwd` and `module_dir` are taken as already-resolved (the caller passes
/// `std::env::current_dir()` and `CARGO_MANIFEST_DIR`-style paths); the last
/// candidate is lexically normalized exactly like Node's `path.resolve`, so
/// `..` segments collapse without touching the filesystem. The caller is
/// expected to pick the first candidate that exists — this function performs
/// no I/O.
pub fn dotenv_candidates(cwd: &Path, state_dir: &Path, module_dir: &Path) -> Vec<PathBuf> {
    vec![
        resolve_path(cwd, ".env"),
        resolve_path(state_dir, ".env"),
        resolve_path(module_dir, "../../../.env"),
    ]
}

fn resolve_path(base: &Path, relative: &str) -> PathBuf {
    normalize_lexically(&base.join(relative))
}

/// Lexical `path.resolve` normalization: drop `.` segments, fold `..` into the
/// preceding normal segment, and never walk above an absolute root. No
/// filesystem access (symlinks are therefore not resolved, which `path.resolve`
/// does not do either).
fn normalize_lexically(path: &Path) -> PathBuf {
    let absolute = path.is_absolute();
    let mut out = PathBuf::new();
    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                let can_pop =
                    matches!(out.components().next_back(), Some(Component::Normal(_)));
                if can_pop {
                    out.pop();
                } else if !absolute {
                    out.push("..");
                }
            }
            other => out.push(other.as_os_str()),
        }
    }
    if out.as_os_str().is_empty() {
        out.push(if absolute { "/" } else { "." });
    }
    out
}

/// Parse a dotenv file body into ordered key/value pairs.
///
/// # Deliberately matches `dot env.config()`
/// * blank lines and full-line `#` comments (optionally indented) are skipped;
/// * a value keeps everything after the first `=`, so `KEY=a=b` stays `a=b`;
/// * one pair of matching surrounding quotes (`'...'` or `"..."`) is stripped;
/// * `KEY=` yields an empty value;
/// * **no variable expansion** — `KEY=${OTHER}` is stored literally, which is
///   what `dotenv` does when it expands *against the already-loaded*
///   environment rather than in-file; this port never expands at all;
/// * whitespace around key and unquoted value is trimmed;
/// * duplicates are all returned in file order, so a consumer that inserts in
///   order gets `dotenv`'s last-wins result.
///
/// # Deliberately stricter / narrower
/// * inline comments are *not* stripped (`KEY=value # note` keeps ` # note`),
///   matching modern `dotenv`, but multi-line quoted values (literal newlines
///   inside `"..."`) are rejected: such a line becomes a pair whose value is
///   the unterminated remainder instead of being joined with following lines;
/// * `\n`, `\r`, `\\` escapes inside double quotes are not decoded;
/// * `export KEY=value` is tolerated (some shells write it) — plain `dotenv`
///   skips such lines; a key containing spaces is still rejected;
/// * lines without `=` or with an empty key are skipped rather than erroring;
/// * the input must already be decoded UTF-8 text (no BOM handling beyond what
///   the key trim absorbs).
pub fn parse_dotenv(contents: &str) -> Vec<(String, String)> {
    let mut pairs = Vec::new();
    for raw_line in contents.split('\n') {
        let line = raw_line.strip_suffix('\r').unwrap_or(raw_line);
        let line = js_trim(line);
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let line = match line.strip_prefix("export") {
            Some(rest) if rest.starts_with(|c: char| c.is_whitespace()) => js_trim(rest),
            _ => line,
        };
        let Some((raw_key, raw_value)) = line.split_once('=') else {
            continue;
        };
        let key = js_trim(raw_key);
        if key.is_empty() {
            continue;
        }
        pairs.push((key.to_string(), unquote_value(js_trim(raw_value))));
    }
    pairs
}

/// Strip one pair of matching surrounding quotes, keeping the inner text
/// verbatim (no escape processing, no expansion).
fn unquote_value(value: &str) -> String {
    let bytes = value.as_bytes();
    if bytes.len() >= 2 {
        let first = bytes[0];
        let last = bytes[bytes.len() - 1];
        if (first == b'"' && last == b'"') || (first == b'\'' && last == b'\'') {
            return value[1..value.len() - 1].to_string();
        }
    }
    value.to_string()
}

/// Counterpart of `if (!process.env["__JAIT_CLI"])` — should the gateway load
/// `.env` files at all?
///
/// `None` (marker unset) returns `true`. A present-but-empty marker is falsy in
/// JS, so it also returns `true`; only a non-empty marker suppresses loading.
pub fn should_load_dotenv(cli_marker: Option<&str>) -> bool {
    match cli_marker {
        None => true,
        Some(value) => value.is_empty(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn load_pairs(pairs: &[(&str, &str)]) -> AppConfig {
        let map: HashMap<String, String> = pairs
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect();
        load_with(|key| map.get(key).cloned())
    }

    fn load_empty() -> AppConfig {
        load_with(|_| None)
    }

    fn is_hex64(value: &str) -> bool {
        value.len() == 64 && value.bytes().all(|b| b.is_ascii_hexdigit())
    }

    #[test]
    fn defaults_match_typescript() {
        let config = load_empty();
        assert_eq!(config.port, 8000);
        assert_eq!(config.ws_port, 18789);
        assert_eq!(config.host, "0.0.0.0");
        assert_eq!(config.log_level, "info");
        assert_eq!(config.cors_origin, "http://localhost:3000");
        assert_eq!(config.node_env, "development");
        assert!(!config.jwt_secret.is_empty());
        assert!(is_hex64(&config.jwt_secret), "jwt secret: {}", config.jwt_secret);
        assert!(!config.hook_secret.is_empty());
        assert!(is_hex64(&config.hook_secret), "hook secret: {}", config.hook_secret);
        assert_eq!(config.llm_provider, LlmProvider::Ollama);
        assert_eq!(config.llm_provider.as_str(), "ollama");
        assert_eq!(config.ollama_url, "http://localhost:11434");
        assert_eq!(
            config.ollama_model,
            "CognitiveComputations/dolphin-mistral-nemo:12b"
        );
        assert_eq!(config.openai_api_key, "");
        assert_eq!(config.openai_model, "gpt-4o");
        assert_eq!(config.openai_base_url, "https://api.openai.com/v1");
        assert_eq!(config.omniroute_base_url, "http://localhost:20128/v1");
        assert_eq!(config.omniroute_api_key, "");
        // gpt-4o infers 128_000.
        assert_eq!(config.context_window, 128_000);
        assert_eq!(config.agent_max_rounds, 0);
        assert_eq!(config.ollama_context_window, 32_768);
        assert_eq!(config.heartbeat_cron, "* * * * *");
        assert_eq!(config.whisper_url, "http://localhost:8178");
        assert_eq!(config.realtime_model, "gpt-realtime");
        assert_eq!(config.realtime_transcribe_model, "gpt-4o-transcribe");
        assert_eq!(config.realtime_voice, "alloy");
        assert_eq!(config.voice_escalation_async_ms, 12_000);
        assert_eq!(config.voice_escalation_filler_ms, 2_500);
        assert_eq!(config.stt_prompt, DEFAULT_STT_PROMPT);
        assert_eq!(config.primary_gateway, "");
        assert_eq!(config.primary_token, "");
        assert_eq!(config.node_name, "");
        assert_eq!(config.windows_ssh_username, "Docker");
        assert_eq!(config.windows_ssh_password, "admin");
        assert!(!config.node_only);
    }

    #[test]
    fn generated_secrets_are_stable_across_loads() {
        let first = load_empty();
        let second = load_empty();
        assert_eq!(first.jwt_secret, second.jwt_secret);
        assert_eq!(first.hook_secret, second.hook_secret);
        assert_eq!(first.jwt_secret, generated_jwt_secret());
        assert_eq!(first.hook_secret, generated_hook_secret());
        // Distinct statics, distinct values.
        assert_ne!(first.jwt_secret, first.hook_secret);
    }

    #[test]
    fn explicit_secrets_are_honoured_and_whitespace_falls_back() {
        let explicit = load_pairs(&[("JWT_SECRET", "  jwt-abc  "), ("HOOK_SECRET", "\thook-xyz\n")]);
        assert_eq!(explicit.jwt_secret, "jwt-abc");
        assert_eq!(explicit.hook_secret, "hook-xyz");

        let blank = load_pairs(&[("JWT_SECRET", "   "), ("HOOK_SECRET", "\t\n ")]);
        assert_eq!(blank.jwt_secret, generated_jwt_secret());
        assert_eq!(blank.hook_secret, generated_hook_secret());

        let empty = load_pairs(&[("JWT_SECRET", ""), ("HOOK_SECRET", "")]);
        assert_eq!(empty.jwt_secret, generated_jwt_secret());
        assert_eq!(empty.hook_secret, generated_hook_secret());
    }

    #[test]
    fn llm_provider_selection() {
        assert_eq!(
            load_pairs(&[("LLM_PROVIDER", "openai")]).llm_provider,
            LlmProvider::OpenAi
        );
        assert_eq!(
            load_pairs(&[("LLM_PROVIDER", "ollama")]).llm_provider,
            LlmProvider::Ollama
        );
        // Explicit values are verbatim, untrimmed and unvalidated.
        let other = load_pairs(&[("LLM_PROVIDER", "azure-gpt4")]).llm_provider;
        assert_eq!(other, LlmProvider::Other("azure-gpt4".into()));
        assert_eq!(other.as_str(), "azure-gpt4");
        assert!(!other.is_openai() && !other.is_ollama());
        let spaced = load_pairs(&[("LLM_PROVIDER", " OpenAI ")]).llm_provider;
        assert_eq!(spaced.as_str(), " OpenAI ");

        // Explicit provider wins over the presence of an OpenAI key.
        let both = load_pairs(&[("LLM_PROVIDER", "ollama"), ("OPENAI_API_KEY", "sk-x")]);
        assert_eq!(both.llm_provider, LlmProvider::Ollama);

        // Presence, not truthiness: an empty OPENAI_API_KEY still selects openai.
        let present_empty = load_pairs(&[("OPENAI_API_KEY", "")]);
        assert_eq!(present_empty.llm_provider, LlmProvider::OpenAi);
        assert_eq!(present_empty.openai_api_key, "");
        let present = load_pairs(&[("OPENAI_API_KEY", "sk-test")]);
        assert_eq!(present.llm_provider, LlmProvider::OpenAi);

        // Absent -> ollama.
        assert_eq!(load_empty().llm_provider, LlmProvider::Ollama);
    }

    #[test]
    fn node_only_derivation() {
        assert!(load_pairs(&[("JAIT_PRIMARY_GATEWAY", "ws://primary:8000")]).node_only);
        assert!(!load_pairs(&[("JAIT_PRIMARY_GATEWAY", "")]).node_only);
        assert!(!load_empty().node_only);

        for truthy in ["1", "TRUE", " yes ", "On", " YES "] {
            assert!(
                load_pairs(&[("JAIT_NODE_ONLY", truthy)]).node_only,
                "{truthy:?} should enable node_only"
            );
        }
        for falsy in ["0", "false", "no", "off", "", "   ", "2", "yes please"] {
            assert!(
                !load_pairs(&[("JAIT_NODE_ONLY", falsy)]).node_only,
                "{falsy:?} should disable node_only"
            );
        }

        // Explicitly present-but-falsy wins over a configured primary gateway.
        assert!(
            !load_pairs(&[
                ("JAIT_PRIMARY_GATEWAY", "ws://primary:8000"),
                ("JAIT_NODE_ONLY", "0"),
            ])
            .node_only
        );
        // ... while an explicitly empty marker (falsy -> "absent") defers to the
        // gateway check, exactly like the JS ternary on a falsy string.
        assert!(
            load_pairs(&[
                ("JAIT_PRIMARY_GATEWAY", "ws://primary:8000"),
                ("JAIT_NODE_ONLY", "   "),
            ])
            .node_only
        );
    }

    #[test]
    fn context_window_inference_branches() {
        assert_eq!(infer_context_window("auto"), 128_000);
        assert_eq!(infer_context_window("auto/coding"), 128_000);
        assert_eq!(infer_context_window("auto/vision"), 128_000);
        assert_eq!(infer_context_window("gpt-5"), 400_000);
        assert_eq!(infer_context_window("gpt-5-mini"), 400_000);
        assert_eq!(infer_context_window("gpt-4o"), 128_000);
        assert_eq!(infer_context_window("gpt-4o-mini"), 128_000);
        assert_eq!(infer_context_window("gpt-4.1"), 128_000);
        assert_eq!(infer_context_window("gpt-4-turbo"), 128_000);
        assert_eq!(infer_context_window("gpt-4-turbo-preview"), 128_000);
        assert_eq!(infer_context_window("gpt-4"), 8_192);
        assert_eq!(infer_context_window("gpt-3.5-turbo"), 16_385);
        assert_eq!(infer_context_window("claude-3-opus"), 200_000);
        assert_eq!(infer_context_window("claude-3-5-sonnet-latest"), 200_000);
        assert_eq!(infer_context_window("claude-4-sonnet"), 200_000);
        assert_eq!(infer_context_window("claude-2.1"), 100_000);
        assert_eq!(infer_context_window("claude-instant"), 100_000);
        assert_eq!(infer_context_window("gemini-2.0-flash"), 128_000);
        assert_eq!(infer_context_window("o1-preview"), 200_000);
        assert_eq!(infer_context_window("o3-mini"), 200_000);
        assert_eq!(infer_context_window("o4-mini"), 200_000);
        assert_eq!(infer_context_window("deepseek-chat"), 64_000);
        assert_eq!(infer_context_window("mistral-large"), 32_000);
        assert_eq!(infer_context_window("mixtral-8x7b"), 32_000);
        assert_eq!(infer_context_window("llama-3.1-8b"), 8_192);
        assert_eq!(infer_context_window(""), 128_000);
        assert_eq!(infer_context_window("some-unknown-model"), 128_000);
        // Case-insensitive.
        assert_eq!(infer_context_window("GPT-4O"), 128_000);
        assert_eq!(infer_context_window("Claude-3-Opus"), 200_000);
        assert_eq!(infer_context_window("MiStRaL"), 32_000);
        // Precedence: gpt-4-turbo must be tested before the generic gpt-4.
        assert_ne!(infer_context_window("gpt-4-turbo"), 8_192);
        // Precedence: claude-3/claude-4 before the generic claude.
        assert_ne!(infer_context_window("claude-3-opus"), 100_000);
    }

    #[test]
    fn context_window_parsing_and_fallback() {
        // Explicit value wins.
        assert_eq!(
            load_pairs(&[("CONTEXT_WINDOW", "100000")]).context_window,
            100_000
        );
        assert_eq!(load_pairs(&[("CONTEXT_WINDOW", "8192")]).context_window, 8_192);
        // "0" and NaN-ish garbage are falsy -> inference.
        assert_eq!(load_pairs(&[("CONTEXT_WINDOW", "0")]).context_window, 128_000);
        assert_eq!(load_pairs(&[("CONTEXT_WINDOW", "abc")]).context_window, 128_000);
        // Empty string: no digits -> NaN -> inference.
        assert_eq!(load_pairs(&[("CONTEXT_WINDOW", "")]).context_window, 128_000);
        // The inference target is OPENAI_MODEL (never CONTEXT_WINDOW).
        assert_eq!(
            load_pairs(&[("OPENAI_MODEL", "gpt-5")]).context_window,
            400_000
        );
        assert_eq!(
            load_pairs(&[("OPENAI_MODEL", "gpt-4-turbo")]).context_window,
            128_000
        );
        assert_eq!(
            load_pairs(&[("OPENAI_MODEL", "gpt-4")]).context_window,
            8_192
        );
        assert_eq!(
            load_pairs(&[("CONTEXT_WINDOW", "0"), ("OPENAI_MODEL", "claude-3-opus")])
                .context_window,
            200_000
        );
    }

    #[test]
    fn numeric_fallbacks() {
        assert_eq!(load_pairs(&[("OLLAMA_CONTEXT_LENGTH", "0")]).ollama_context_window, 32_768);
        assert_eq!(load_pairs(&[("OLLAMA_CONTEXT_LENGTH", "16000")]).ollama_context_window, 16_000);
        assert_eq!(load_empty().ollama_context_window, 32_768);

        assert_eq!(load_pairs(&[("JAIT_MAX_ROUNDS", "0")]).agent_max_rounds, 0);
        assert_eq!(load_pairs(&[("JAIT_MAX_ROUNDS", "64")]).agent_max_rounds, 64);
        assert_eq!(load_empty().agent_max_rounds, 0);

        let zero_voice = load_pairs(&[
            ("JAIT_VOICE_ESCALATION_ASYNC_MS", "0"),
            ("JAIT_VOICE_ESCALATION_FILLER_MS", "0"),
        ]);
        assert_eq!(zero_voice.voice_escalation_async_ms, 12_000);
        assert_eq!(zero_voice.voice_escalation_filler_ms, 2_500);
        let explicit_voice = load_pairs(&[
            ("JAIT_VOICE_ESCALATION_ASYNC_MS", "5000"),
            ("JAIT_VOICE_ESCALATION_FILLER_MS", "700"),
        ]);
        assert_eq!(explicit_voice.voice_escalation_async_ms, 5_000);
        assert_eq!(explicit_voice.voice_escalation_filler_ms, 700);

        let ports = load_pairs(&[("PORT", "9000"), ("WS_PORT", "19000")]);
        assert_eq!(ports.port, 9_000);
        assert_eq!(ports.ws_port, 19_000);
        // Garbage/out-of-range ports stay at the TS defaults (see module docs).
        let bad_ports = load_pairs(&[("PORT", "abc"), ("WS_PORT", "70000")]);
        assert_eq!(bad_ports.port, 8_000);
        assert_eq!(bad_ports.ws_port, 18_789);
    }

    #[test]
    fn parse_js_int_matches_javascript() {
        assert_eq!(parse_js_int(""), None);
        assert_eq!(parse_js_int("abc"), None);
        assert_eq!(parse_js_int("0"), Some(0));
        assert_eq!(parse_js_int("12abc"), Some(12));
        assert_eq!(parse_js_int("-5"), Some(-5));
        assert_eq!(parse_js_int(" 42 "), Some(42));
        assert_eq!(parse_js_int("3.9"), Some(3));
        // Extra JS corner cases.
        assert_eq!(parse_js_int("+7"), Some(7));
        assert_eq!(parse_js_int("-"), None);
        assert_eq!(parse_js_int("   "), None);
        assert_eq!(parse_js_int("0x10"), Some(0));
        assert_eq!(parse_js_int("\t\n 8"), Some(8));
        assert_eq!(parse_js_int("-0"), Some(0));
    }

    #[test]
    fn trimmed_empty_strings_fall_back() {
        let blank_models = load_pairs(&[
            ("OPENAI_REALTIME_MODEL", "   "),
            ("OPENAI_REALTIME_TRANSCRIBE_MODEL", "\t\n"),
        ]);
        assert_eq!(blank_models.realtime_model, "gpt-realtime");
        assert_eq!(blank_models.realtime_transcribe_model, "gpt-4o-transcribe");

        let trimmed = load_pairs(&[
            ("OPENAI_REALTIME_MODEL", "  gpt-realtime-mini "),
            ("OPENAI_REALTIME_TRANSCRIBE_MODEL", " whisper-1 "),
        ]);
        assert_eq!(trimmed.realtime_model, "gpt-realtime-mini");
        assert_eq!(trimmed.realtime_transcribe_model, "whisper-1");

        // `sttPrompt` uses `?.trim() ?? default` — a whitespace-only value trims
        // to "" which is NOT nullish, so the default does not apply. That is the
        // TS behaviour and is preserved here (see the work log for why the
        // original test brief disagreed).
        assert_eq!(load_pairs(&[("JAIT_STT_PROMPT", "   ")]).stt_prompt, "");
        assert_eq!(
            load_pairs(&[("JAIT_STT_PROMPT", "  Custom prompt  ")]).stt_prompt,
            "Custom prompt"
        );
        assert_eq!(load_empty().stt_prompt, DEFAULT_STT_PROMPT);

        // Same `??` semantics for the primary-link fields.
        let blanks = load_pairs(&[
            ("JAIT_PRIMARY_GATEWAY", "  "),
            ("JAIT_PRIMARY_TOKEN", "  "),
            ("JAIT_NODE_NAME", "  "),
        ]);
        assert_eq!(blanks.primary_gateway, "");
        assert_eq!(blanks.primary_token, "");
        assert_eq!(blanks.node_name, "");
        assert!(!blanks.node_only);
    }

    #[test]
    fn dotenv_parsing() {
        let contents = concat!(
            "# leading comment\n",
            "\n",
            "   \n",
            "   # indented comment\n",
            "PLAIN=value\n",
            "SPACED = padded value \n",
            "DOUBLE=\"quoted value\"\n",
            "SINGLE='single quoted'\n",
            "MISMATCHED=\"unbalanced\n",
            "EMPTY=\n",
            "EQUALS=abc=def=ghi\n",
            "export EXPORTED=from-export\n",
            "export\tTABBED=tab-separated\n",
            "NOT_A_PAIR\n",
            "=no-key\n",
            "HASH_IN_VALUE=abc#def\n",
            "NO_EXPANSION=${PLAIN}\n",
            "CRLF=windows\r\n",
        );
        let pairs = parse_dotenv(contents);
        let map: HashMap<&str, &str> = pairs
            .iter()
            .map(|(k, v)| (k.as_str(), v.as_str()))
            .collect();

        assert_eq!(map.get("PLAIN"), Some(&"value"));
        assert_eq!(map.get("SPACED"), Some(&"padded value"));
        assert_eq!(map.get("DOUBLE"), Some(&"quoted value"));
        assert_eq!(map.get("SINGLE"), Some(&"single quoted"));
        // Unterminated quote is kept verbatim rather than dropped.
        assert_eq!(map.get("MISMATCHED"), Some(&"\"unbalanced"));
        assert_eq!(map.get("EMPTY"), Some(&""));
        // Everything after the first '=' survives untouched.
        assert_eq!(map.get("EQUALS"), Some(&"abc=def=ghi"));
        assert_eq!(map.get("EXPORTED"), Some(&"from-export"));
        assert_eq!(map.get("TABBED"), Some(&"tab-separated"));
        assert_eq!(map.get("HASH_IN_VALUE"), Some(&"abc#def"));
        // No variable expansion, ever.
        assert_eq!(map.get("NO_EXPANSION"), Some(&"${PLAIN}"));
        assert_eq!(map.get("CRLF"), Some(&"windows"));

        // Comments/blanks never become keys; malformed lines are skipped.
        assert!(!map.keys().any(|k| k.starts_with('#') || k.is_empty()));
        assert!(!map.contains_key("NOT_A_PAIR"));
        assert!(!map.contains_key("export"));
        // PLAIN, SPACED, DOUBLE, SINGLE, MISMATCHED, EMPTY, EQUALS, EXPORTED,
        // TABBED, HASH_IN_VALUE, NO_EXPANSION, CRLF
        assert_eq!(pairs.len(), 12);

        // Duplicates are returned in order (last wins for an inserting consumer).
        let dupes = parse_dotenv("A=1\nA=2\n");
        assert_eq!(
            dupes,
            vec![
                ("A".to_string(), "1".to_string()),
                ("A".to_string(), "2".to_string())
            ]
        );
    }

    #[test]
    fn dotenv_candidates_priority_and_resolution() {
        let candidates = dotenv_candidates(
            Path::new("/work/app"),
            Path::new("/home/user/.jait"),
            Path::new("/home/user/jait/packages/gateway/src"),
        );
        assert_eq!(
            candidates,
            vec![
                PathBuf::from("/work/app/.env"),
                PathBuf::from("/home/user/.jait/.env"),
                PathBuf::from("/home/user/jait/.env"),
            ]
        );
        // Normalization never escapes an absolute root.
        assert_eq!(
            normalize_lexically(Path::new("/a/../../.env")),
            PathBuf::from("/.env")
        );
        assert_eq!(
            normalize_lexically(Path::new("x/./y/../z/.env")),
            PathBuf::from("x/z/.env")
        );
    }

    #[test]
    fn cli_marker_guard() {
        assert!(should_load_dotenv(None));
        assert!(should_load_dotenv(Some("")));
        assert!(!should_load_dotenv(Some("1")));
        assert!(!should_load_dotenv(Some("true")));
    }
}
