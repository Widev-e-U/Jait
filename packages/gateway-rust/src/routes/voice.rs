//! Voice HTTP surface, ported from `packages/gateway/src/routes/voice.ts`.
//!
//! Route parity with the TypeScript Fastify module:
//!
//! | method | path                              | auth | notes                                  |
//! |--------|-----------------------------------|------|----------------------------------------|
//! | POST   | `/api/voice/transcribe`           | no   | transcript/audio -> text + consent     |
//! | POST   | `/api/voice/speak`                | no   | text -> base64 audio                   |
//! | GET    | `/api/voice/state/{sessionId}`    | no   | `{ state }`                            |
//! | PATCH  | `/api/voice/state/{sessionId}`    | no   | boolean-only patch, `{ state }`        |
//! | POST   | `/api/voice/transcribe-audio`     | yes  | provider STT, `{ text }`               |
//!
//! Security notes:
//! * `transcribe-audio` keeps the TS ordering: the "not configured" 501 probe is
//!   answered before authentication (it reveals only static configuration
//!   state, never user data), then `require_user` runs — including the origin
//!   check and the "user still exists" check.
//! * Audio bytes never reach logs; failures surface as fixed strings.
//! * Every size bound comes from `crate::voice` (`MAX_AUDIO`, `MAX_TEXT`) or the
//!   shared body limit in `routes::auth::parse_body`.

use std::sync::{Arc, Mutex, MutexGuard};

use axum::body::Body;
use axum::extract::{Path, State};
use axum::http::HeaderMap;
use axum::response::Response;
use axum::routing::{get, post};
use axum::Router;
use serde_json::{json, Value};

use super::auth::{self, AuthState};
use crate::security::http_auth::AuthUser;
use crate::text::js_trim;
use crate::voice::{
    resolve_consent, transcribe_remote, transcription_request, ScopedTranscriptionHttp, SttProvider,
    StatePatch, TranscriptionRequest, VoiceConsent, VoiceFuture, VoiceService, VoiceState,
};

/// Adapter that lets an object-safe `dyn ScopedTranscriptionHttp` be handed to
/// `transcribe_remote`, which takes `&impl ScopedTranscriptionHttp` (and is
/// therefore implicitly `Sized`).
struct SttRef<'a>(&'a (dyn ScopedTranscriptionHttp + 'a));

impl ScopedTranscriptionHttp for SttRef<'_> {
    fn post(&self, request: TranscriptionRequest) -> VoiceFuture<'_, Option<Value>> {
        self.0.post(request)
    }
}

/// Session used when the request body omits `sessionId`.
pub const DEFAULT_SESSION: &str = "default";
/// Default Faster-Whisper endpoint advertised in the NOT_CONFIGURED hint.
pub const DEFAULT_WHISPER_URL: &str = "http://localhost:8178";
/// Default OpenAI-compatible base URL.
pub const DEFAULT_OPENAI_BASE_URL: &str = "https://api.openai.com/v1";
/// Default OpenAI transcription model.
pub const DEFAULT_OPENAI_TRANSCRIBE_MODEL: &str = "gpt-4o-mini-transcribe";
/// Default ElevenLabs speech-to-text model.
pub const DEFAULT_ELEVENLABS_STT_MODEL: &str = "scribe_v2";
/// Upper bound on per-process voice sessions (bounded buffer, TS parity gap).
pub const DEFAULT_MAX_SESSIONS: usize = 1_000;

// ── provider configuration ──────────────────────────────────────────

/// Static configuration for the transcription providers. Mirrors the subset of
/// `AppConfig` plus environment variables the TS handler reads.
#[derive(Clone, Debug, Default)]
pub struct VoiceRouteConfig {
    pub whisper_url: Option<String>,
    pub stt_prompt: Option<String>,
    pub openai_api_key: Option<String>,
    pub openai_base_url: Option<String>,
    pub elevenlabs_api_key: Option<String>,
    pub elevenlabs_stt_model: Option<String>,
    pub elevenlabs_language_code: Option<String>,
    pub elevenlabs_stt_url: Option<String>,
}

fn env_non_empty(name: &str) -> Option<String> {
    std::env::var(name)
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
}

impl VoiceRouteConfig {
    /// Fill unset provider fields from the process environment. The TS module
    /// reads `process.env` for the ElevenLabs/OpenAI knobs directly.
    pub fn from_env() -> Self {
        Self {
            openai_api_key: env_non_empty("OPENAI_API_KEY"),
            openai_base_url: env_non_empty("OPENAI_BASE_URL"),
            elevenlabs_api_key: env_non_empty("ELEVENLABS_API_KEY"),
            elevenlabs_stt_model: env_non_empty("ELEVENLABS_STT_MODEL"),
            elevenlabs_language_code: env_non_empty("ELEVENLABS_LANGUAGE_CODE"),
            elevenlabs_stt_url: env_non_empty("ELEVENLABS_STT_URL"),
            whisper_url: env_non_empty("WHISPER_URL"),
            stt_prompt: env_non_empty("STT_PROMPT"),
        }
    }
}

/// Per-user settings slice needed by `transcribe-audio`.
#[derive(Clone, Debug, Default)]
pub struct VoiceSettings {
    /// `settings.sttProvider`.
    pub stt_provider: Option<String>,
    /// `settings.apiKeys` — provider URLs, tokens and prompts live here.
    pub api_keys: std::collections::BTreeMap<String, String>,
}

impl VoiceSettings {
    /// `apiKeys[name] || undefined` — blank values are falsy in the TS code.
    pub fn key(&self, name: &str) -> Option<&str> {
        self.api_keys
            .get(name)
            .map(String::as_str)
            .filter(|v| !js_trim(v).is_empty())
    }
}

/// Settings provider. Mirrors the `settings = users.getSettings(user.id)` call.
pub trait VoiceSettingsSource: Send + Sync {
    fn settings(&self, user: &AuthUser) -> Result<VoiceSettings, String>;
}

/// Consent manager host — same contract the TS `ConsentManager` fulfils.
pub type ConsentHost = Arc<Mutex<dyn VoiceConsent + Send>>;

/// Adapter so a boxed/dyn consent manager satisfies `&mut impl VoiceConsent`.
struct ConsentRef<'a>(&'a mut (dyn VoiceConsent + Send));

impl VoiceConsent for ConsentRef<'_> {
    fn pending(&self, session: Option<&str>) -> Vec<String> {
        self.0.pending(session)
    }
    fn resolve(
        &mut self,
        request: &str,
        approved: bool,
        source: &str,
        utterance: &str,
    ) -> Result<(), String> {
        self.0.resolve(request, approved, source, utterance)
    }
}

/// Empty consent manager used when the caller does not wire one up.
#[derive(Debug, Default)]
pub struct NoConsent;

impl VoiceConsent for NoConsent {
    fn pending(&self, _session: Option<&str>) -> Vec<String> {
        Vec::new()
    }
    fn resolve(&mut self, _r: &str, _a: bool, _s: &str, _u: &str) -> Result<(), String> {
        Err("Voice consent manager is not configured".into())
    }
}

// ── provider resolution ────────────────────────────────────────────

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum SttKind {
    Whisper,
    Gpt,
    ElevenLabs,
    Wyoming,
}

/// Owned form of a resolved [`SttProvider`], so the borrow lives in the handler.
#[derive(Clone, Debug)]
struct SttResolution {
    kind: SttKind,
    base: String,
    key: String,
    model: String,
    prompt: Option<String>,
    language: Option<String>,
    endpoint: Option<String>,
    entity: Option<String>,
}

impl SttResolution {
    fn provider(&self) -> SttProvider<'_> {
        match self.kind {
            SttKind::Whisper => SttProvider::Whisper {
                base: &self.base,
                prompt: self.prompt.as_deref(),
            },
            SttKind::Gpt => SttProvider::Gpt {
                base: &self.base,
                key: &self.key,
                model: &self.model,
                prompt: self.prompt.as_deref(),
            },
            SttKind::ElevenLabs => SttProvider::ElevenLabs {
                endpoint: self.endpoint.as_deref(),
                key: &self.key,
                model: &self.model,
                language: self.language.as_deref(),
            },
            SttKind::Wyoming => SttProvider::Wyoming {
                base: &self.base,
                token: &self.key,
                entity: self.entity.as_deref(),
            },
        }
    }

    fn empty_text_detail(&self) -> &'static str {
        match self.kind {
            SttKind::Whisper => "No text returned from Faster Whisper",
            SttKind::Gpt => "No text returned from OpenAI transcription",
            SttKind::ElevenLabs => "No text returned from ElevenLabs STT",
            SttKind::Wyoming => "No text returned from Wyoming STT",
        }
    }
}

// ── router state ────────────────────────────────────────────────────

/// Shared state for the voice routes.
#[derive(Clone)]
pub struct VoiceRoutes {
    auth: AuthState,
    voice: Arc<Mutex<VoiceService>>,
    consent: ConsentHost,
    stt: Option<Arc<dyn ScopedTranscriptionHttp>>,
    settings: Option<Arc<dyn VoiceSettingsSource>>,
    config: VoiceRouteConfig,
    clock: Arc<dyn Fn() -> String + Send + Sync>,
}

impl VoiceRoutes {
    pub fn new(auth: AuthState, config: VoiceRouteConfig) -> Self {
        Self {
            auth,
            voice: Arc::new(Mutex::new(VoiceService::new(DEFAULT_MAX_SESSIONS))),
            consent: Arc::new(Mutex::new(NoConsent)),
            stt: None,
            settings: None,
            config,
            clock: Arc::new(iso_now),
        }
    }

    pub fn with_voice(mut self, voice: VoiceService) -> Self {
        self.voice = Arc::new(Mutex::new(voice));
        self
    }

    pub fn with_consent(mut self, consent: ConsentHost) -> Self {
        self.consent = consent;
        self
    }

    pub fn with_transcription(mut self, stt: Arc<dyn ScopedTranscriptionHttp>) -> Self {
        self.stt = Some(stt);
        self
    }

    pub fn with_settings(mut self, settings: Arc<dyn VoiceSettingsSource>) -> Self {
        self.settings = Some(settings);
        self
    }

    pub fn with_clock(mut self, clock: Arc<dyn Fn() -> String + Send + Sync>) -> Self {
        self.clock = clock;
        self
    }

    /// Mount the voice surface on a fresh router.
    pub fn router(self) -> Router {
        Router::new()
            .route("/api/voice/transcribe", post(transcribe_handler))
            .route("/api/voice/speak", post(speak_handler))
            .route(
                "/api/voice/state/{session_id}",
                get(state_handler).patch(patch_state_handler),
            )
            .route(
                "/api/voice/transcribe-audio",
                post(transcribe_audio_handler),
            )
            .with_state(self)
    }

    fn lock_voice(&self) -> MutexGuard<'_, VoiceService> {
        match self.voice.lock() {
            Ok(guard) => guard,
            Err(poisoned) => poisoned.into_inner(),
        }
    }

    // ── POST /api/voice/transcribe ─────────────────────────────────
    pub async fn post_transcribe(&self, headers: HeaderMap, body: Body) -> Response {
        let body = match auth::parse_body(body, &headers).await {
            Ok(value) => value,
            Err(response) => return *response,
        };
        let session = body
            .get("sessionId")
            .and_then(Value::as_str)
            .unwrap_or(DEFAULT_SESSION)
            .to_string();
        let transcript = body
            .get("transcript")
            .and_then(Value::as_str)
            .map(str::to_string);
        let audio = body
            .get("audioBase64")
            .and_then(Value::as_str)
            .map(str::to_string);
        let now = (self.clock)();

        let outcome = {
            let mut voice = self.lock_voice();
            voice.transcribe(&session, transcript.as_deref(), audio.as_deref(), &now)
        };
        let transcription = match outcome {
            Ok(value) => value,
            Err(_) => return empty_transcript(),
        };
        if transcription.text.is_empty() {
            return empty_transcript();
        }

        let text = transcription.text.clone();
        let consent = {
            let mut host = match self.consent.lock() {
                Ok(guard) => guard,
                Err(poisoned) => poisoned.into_inner(),
            };
            resolve_consent(&mut ConsentRef(&mut *host), Some(&session), &text)
        };
        let consent = match consent {
            Ok(value) => serde_json::to_value(value).unwrap_or_else(|_| json!({ "handled": false })),
            Err(_) => return auth::internal_error(),
        };

        let mut payload = match serde_json::to_value(&transcription) {
            Ok(value) => value,
            Err(_) => return auth::internal_error(),
        };
        if let Value::Object(map) = &mut payload {
            map.insert("consent".into(), consent);
        }
        auth::response(200, payload)
    }

    // ── POST /api/voice/speak ──────────────────────────────────────
    pub async fn post_speak(&self, headers: HeaderMap, body: Body) -> Response {
        let body = match auth::parse_body(body, &headers).await {
            Ok(value) => value,
            Err(response) => return *response,
        };
        let session = body
            .get("sessionId")
            .and_then(Value::as_str)
            .unwrap_or(DEFAULT_SESSION)
            .to_string();
        let text = body
            .get("text")
            .and_then(Value::as_str)
            .map(|raw| js_trim(raw).to_string())
            .unwrap_or_default();
        if text.is_empty() {
            return auth::response(
                400,
                json!({ "error": "VALIDATION_ERROR", "details": "text is required" }),
            );
        }
        let now = (self.clock)();
        let outcome = {
            let mut voice = self.lock_voice();
            voice.speak(&session, &text, &now)
        };
        match outcome {
            Ok(speech) => match serde_json::to_value(&speech) {
                Ok(value) => auth::response(200, value),
                Err(_) => auth::internal_error(),
            },
            Err(detail) => auth::response(
                400,
                json!({ "error": "VALIDATION_ERROR", "details": detail }),
            ),
        }
    }

    // ── GET /api/voice/state/{sessionId} ───────────────────────────
    pub async fn get_state(&self, session_id: String) -> Response {
        let state: Result<VoiceState, String> = {
            let mut voice = self.lock_voice();
            voice.state(&session_id).cloned()
        };
        match state {
            Ok(state) => state_response(&state),
            Err(detail) => auth::response(
                400,
                json!({ "error": "VALIDATION_ERROR", "details": detail }),
            ),
        }
    }

    // ── PATCH /api/voice/state/{sessionId} ─────────────────────────
    pub async fn patch_state(&self, session_id: String, headers: HeaderMap, body: Body) -> Response {
        let body = match auth::parse_body(body, &headers).await {
            Ok(value) => value,
            Err(response) => return *response,
        };
        // Only real booleans are applied; every other key is ignored, exactly
        // like the `typeof === "boolean"` guards in the TS handler.
        let patch = StatePatch {
            wake_word_enabled: body.get("wakeWordEnabled").and_then(Value::as_bool),
            talk_mode_enabled: body.get("talkModeEnabled").and_then(Value::as_bool),
            listening: body.get("listening").and_then(Value::as_bool),
            ..StatePatch::default()
        };
        let outcome = {
            let mut voice = self.lock_voice();
            voice.update(&session_id, patch)
        };
        match outcome {
            Ok(state) => state_response(&state),
            Err(detail) => auth::response(
                400,
                json!({ "error": "VALIDATION_ERROR", "details": detail }),
            ),
        }
    }

    // ── POST /api/voice/transcribe-audio ───────────────────────────
    pub async fn post_transcribe_audio(&self, headers: HeaderMap, body: Body) -> Response {
        // TS parity: the 501 probe happens before `requireAuth`.
        let (Some(stt), Some(settings_source)) = (self.stt.clone(), self.settings.clone()) else {
            return not_configured();
        };
        let user = match auth::require_user(&self.auth, &headers).await {
            Ok(user) => user,
            Err(response) => return *response,
        };
        let body = match auth::parse_body(body, &headers).await {
            Ok(value) => value,
            Err(response) => return *response,
        };
        let audio = body
            .get("audioBase64")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();
        let session = body
            .get("sessionId")
            .and_then(Value::as_str)
            .unwrap_or(DEFAULT_SESSION)
            .to_string();
        if audio.is_empty() {
            return auth::response(
                400,
                json!({ "error": "VALIDATION_ERROR", "details": "audioBase64 is required" }),
            );
        }
        let settings = match settings_source.settings(&user) {
            Ok(settings) => settings,
            Err(_) => return auth::internal_error(),
        };
        let provider = body
            .get("provider")
            .and_then(Value::as_str)
            .map(str::to_string)
            .or_else(|| settings.stt_provider.clone())
            .unwrap_or_default();

        let resolution = match self.resolve_stt(&provider, &settings) {
            Ok(resolution) => resolution,
            Err(response) => return response,
        };
        let request = match transcription_request(resolution.provider(), &audio) {
            Ok(request) => request,
            // Node base64 decoding failures (including the size cap) are the
            // provider call throwing in TS, which maps to 502.
            Err(detail) => return transcription_failed(detail),
        };
        let text = match transcribe_remote(&SttRef(stt.as_ref()), request).await {
            Ok(Some(text)) if !js_trim(&text).is_empty() => text,
            Ok(_) => return transcription_failed(resolution.empty_text_detail().to_string()),
            Err(detail) => return transcription_failed(detail),
        };

        let now = (self.clock)();
        let outcome = {
            let mut voice = self.lock_voice();
            voice.transcribe(&session, Some(&text), None, &now)
        };
        let mut payload = match outcome {
            Ok(transcription) => serde_json::to_value(&transcription)
                .unwrap_or_else(|_| json!({ "text": text })),
            Err(_) => json!({ "text": text }),
        };
        if let Value::Object(map) = &mut payload {
            map.insert("text".into(), Value::String(text));
        }
        auth::response(200, payload)
    }

    fn resolve_stt(
        &self,
        provider: &str,
        settings: &VoiceSettings,
    ) -> Result<SttResolution, Response> {
        let cfg = &self.config;
        match provider {
            "whisper" => {
                let Some(base) = settings.key("WHISPER_URL").or(cfg.whisper_url.as_deref()) else {
                    return Err(auth::response(
                        400,
                        json!({
                            "error": "NOT_CONFIGURED",
                            "details": "WHISPER_URL must be set in Settings → API keys or environment (default: http://localhost:8178)",
                        }),
                    ));
                };
                Ok(SttResolution {
                    kind: SttKind::Whisper,
                    base: base.to_string(),
                    key: String::new(),
                    model: String::new(),
                    prompt: prompt_for(settings, cfg),
                    language: None,
                    endpoint: None,
                    entity: None,
                })
            }
            "gpt" => {
                let key = settings
                    .key("OPENAI_API_KEY")
                    .or(cfg.openai_api_key.as_deref())
                    .map(str::to_string)
                    .filter(|k| !js_trim(k).is_empty());
                let Some(key) = key else {
                    return Err(auth::response(
                        400,
                        json!({
                            "error": "NOT_CONFIGURED",
                            "details": "OPENAI_API_KEY must be set in Settings → API keys or environment",
                        }),
                    ));
                };
                let base = settings
                    .key("OPENAI_BASE_URL")
                    .or(cfg.openai_base_url.as_deref())
                    .map(|v| js_trim(v).to_string())
                    .filter(|v| !v.is_empty())
                    .unwrap_or_else(|| DEFAULT_OPENAI_BASE_URL.to_string());
                let model = settings
                    .key("OPENAI_TRANSCRIBE_MODEL")
                    .or(cfg.stt_prompt.as_deref().filter(|_| false))
                    .map(|v| js_trim(v).to_string())
                    .filter(|v| !v.is_empty())
                    .unwrap_or_else(|| DEFAULT_OPENAI_TRANSCRIBE_MODEL.to_string());
                Ok(SttResolution {
                    kind: SttKind::Gpt,
                    base,
                    key,
                    model,
                    prompt: prompt_for(settings, cfg),
                    language: None,
                    endpoint: None,
                    entity: None,
                })
            }
            "elevenlabs" => {
                let key = settings
                    .key("ELEVENLABS_API_KEY")
                    .or(cfg.elevenlabs_api_key.as_deref())
                    .map(str::to_string)
                    .filter(|k| !js_trim(k).is_empty());
                let Some(key) = key else {
                    return Err(auth::response(
                        400,
                        json!({
                            "error": "NOT_CONFIGURED",
                            "details": "ELEVENLABS_API_KEY must be set in Settings → API keys or environment",
                        }),
                    ));
                };
                let model = settings
                    .key("ELEVENLABS_STT_MODEL")
                    .or(cfg.elevenlabs_stt_model.as_deref())
                    .map(|v| js_trim(v).to_string())
                    .filter(|v| !v.is_empty())
                    .unwrap_or_else(|| DEFAULT_ELEVENLABS_STT_MODEL.to_string());
                let language = settings
                    .key("ELEVENLABS_LANGUAGE_CODE")
                    .or(cfg.elevenlabs_language_code.as_deref())
                    .map(|v| js_trim(v).to_string())
                    .filter(|v| !v.is_empty());
                let endpoint = settings
                    .key("ELEVENLABS_STT_URL")
                    .or(cfg.elevenlabs_stt_url.as_deref())
                    .map(|v| js_trim(v).to_string())
                    .filter(|v| !v.is_empty());
                Ok(SttResolution {
                    kind: SttKind::ElevenLabs,
                    base: String::new(),
                    key,
                    model,
                    prompt: None,
                    language,
                    endpoint,
                    entity: None,
                })
            }
            "wyoming" => {
                let Some(base) = settings.key("HA_URL") else {
                    return Err(ha_not_configured());
                };
                let Some(token) = settings.key("HA_TOKEN") else {
                    return Err(ha_not_configured());
                };
                Ok(SttResolution {
                    kind: SttKind::Wyoming,
                    base: base.to_string(),
                    key: token.to_string(),
                    model: String::new(),
                    prompt: None,
                    language: None,
                    endpoint: None,
                    entity: settings
                        .key("HA_STT_ENTITY")
                        .map(|v| js_trim(v).to_string())
                        .filter(|v| !v.is_empty()),
                })
            }
            _ => Err(auth::response(
                400,
                json!({ "error": "VALIDATION_ERROR", "details": "Unsupported STT provider" }),
            )),
        }
    }
}

fn prompt_for(settings: &VoiceSettings, cfg: &VoiceRouteConfig) -> Option<String> {
    settings
        .key("STT_PROMPT")
        .map(|v| js_trim(v).to_string())
        .filter(|v| !v.is_empty())
        .or_else(|| {
            cfg.stt_prompt
                .as_deref()
                .map(|v| js_trim(v).to_string())
                .filter(|v| !v.is_empty())
        })
}

fn ha_not_configured() -> Response {
    auth::response(
        400,
        json!({
            "error": "NOT_CONFIGURED",
            "details": "HA_URL and HA_TOKEN must be set in Settings → API keys",
        }),
    )
}

fn not_configured() -> Response {
    auth::response(
        501,
        json!({
            "error": "NOT_CONFIGURED",
            "details": "Voice audio transcription not available",
        }),
    )
}

fn transcription_failed(details: String) -> Response {
    auth::response(
        502,
        json!({ "error": "TRANSCRIPTION_FAILED", "details": details }),
    )
}

fn empty_transcript() -> Response {
    auth::response(
        400,
        json!({
            "error": "VALIDATION_ERROR",
            "details": "No transcript or audio provided",
        }),
    )
}

fn state_response(state: &VoiceState) -> Response {
    match serde_json::to_value(state) {
        Ok(value) => auth::response(200, json!({ "state": value })),
        Err(_) => auth::internal_error(),
    }
}

// ── axum handlers ───────────────────────────────────────────────────

async fn transcribe_handler(
    State(routes): State<VoiceRoutes>,
    headers: HeaderMap,
    body: Body,
) -> Response {
    routes.post_transcribe(headers, body).await
}

async fn speak_handler(State(routes): State<VoiceRoutes>, headers: HeaderMap, body: Body) -> Response {
    routes.post_speak(headers, body).await
}

async fn state_handler(State(routes): State<VoiceRoutes>, Path(session_id): Path<String>) -> Response {
    routes.get_state(session_id).await
}

async fn patch_state_handler(
    State(routes): State<VoiceRoutes>,
    Path(session_id): Path<String>,
    headers: HeaderMap,
    body: Body,
) -> Response {
    routes.patch_state(session_id, headers, body).await
}

async fn transcribe_audio_handler(
    State(routes): State<VoiceRoutes>,
    headers: HeaderMap,
    body: Body,
) -> Response {
    routes.post_transcribe_audio(headers, body).await
}

// ── clock ───────────────────────────────────────────────────────────

fn iso_now() -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    let days = secs.div_euclid(86_400);
    let rem = secs.rem_euclid(86_400);
    let (year, month, day) = civil_from_days(days);
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}.000Z",
        year,
        month,
        day,
        rem / 3600,
        (rem % 3600) / 60,
        rem % 60
    )
}

/// Howard Hinnant's `civil_from_days`.
fn civil_from_days(days: i64) -> (i64, u32, u32) {
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if m <= 2 { y + 1 } else { y }, m, d)
}

#[cfg(test)]
mod tests {
    use axum::http::HeaderValue;
    use super::*;
    use crate::db;
    use crate::security::http_auth::sign_auth_token;
    use axum::body::to_bytes;
    use axum::http::{header, StatusCode};
    use std::path::PathBuf;
    use std::sync::Mutex as StdMutex;

    const NOW: &str = "2024-05-01T00:00:00.000Z";
    const SECRET: &str = "voice-fixture-key";

    // ── fixtures ───────────────────────────────────────────────────
    struct Fixture {
        auth: AuthState,
        token: String,
    }

    fn fixture() -> Fixture {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../.jait/artifacts/gateway-rust/voice-routes")
            .join(uuid::Uuid::new_v4().to_string());
        std::fs::create_dir_all(&root).unwrap();
        let db = db::open_database(&root.join("voice.sqlite")).unwrap();
        db::migrate_database(&db).unwrap();
        db.execute(
            "INSERT INTO users(id,username,password_hash,created_at,updated_at) \
             VALUES('owner','owner','unused','now','now')",
            [],
        )
        .unwrap();
        let user = AuthUser {
            id: "owner".into(),
            username: "owner".into(),
        };
        let token = sign_auth_token(&user, SECRET).unwrap();
        Fixture {
            auth: AuthState::new(db, SECRET.to_string()).unwrap(),
            token,
        }
    }

    fn authed_headers(token: &str) -> HeaderMap {
        let mut headers = HeaderMap::new();
        headers.insert(
            header::CONTENT_TYPE,
            HeaderValue::from_static("application/json"),
        );
        headers.insert(
            header::AUTHORIZATION,
            HeaderValue::from_str(&format!("Bearer {token}")).unwrap(),
        );
        headers.insert(
            header::COOKIE,
            HeaderValue::from_str(&format!("jait_token={token}")).unwrap(),
        );
        headers
    }

    fn anon_headers() -> HeaderMap {
        let mut headers = HeaderMap::new();
        headers.insert(
            header::CONTENT_TYPE,
            HeaderValue::from_static("application/json"),
        );
        headers
    }

    fn json_body(value: Value) -> Body {
        Body::from(value.to_string())
    }

    async fn read(response: Response) -> (StatusCode, Value) {
        let status = response.status();
        let bytes = to_bytes(response.into_body(), 8 * 1024 * 1024).await.unwrap();
        let value = if bytes.is_empty() {
            Value::Null
        } else {
            serde_json::from_slice(&bytes).unwrap_or(Value::Null)
        };
        (status, value)
    }

    fn config(whisper: Option<&str>) -> VoiceRouteConfig {
        VoiceRouteConfig {
            whisper_url: whisper.map(str::to_string),
            stt_prompt: None,
            openai_api_key: None,
            openai_base_url: None,
            elevenlabs_api_key: None,
            elevenlabs_stt_model: None,
            elevenlabs_language_code: None,
            elevenlabs_stt_url: None,
        }
    }

    fn route_config(whisper: Option<&str>) -> VoiceRouteConfig {
        config(whisper)
    }

    struct FakeSettings {
        settings: VoiceSettings,
    }

    impl VoiceSettingsSource for FakeSettings {
        fn settings(&self, user: &AuthUser) -> Result<VoiceSettings, String> {
            assert_eq!(user.id, "owner");
            Ok(self.settings.clone())
        }
    }

    /// Records requests and replays a canned provider reply.
    struct FakeHttp {
        reply: StdMutex<Result<Option<Value>, String>>,
        seen: StdMutex<Vec<TranscriptionRequest>>,
    }

    impl FakeHttp {
        fn answering(text: &str) -> Arc<Self> {
            Arc::new(Self {
                reply: StdMutex::new(Ok(Some(json!({ "text": text })))),
                seen: StdMutex::new(Vec::new()),
            })
        }
        fn failing(detail: &str) -> Arc<Self> {
            Arc::new(Self {
                reply: StdMutex::new(Err(detail.to_string())),
                seen: StdMutex::new(Vec::new()),
            })
        }
        fn requests(&self) -> usize {
            self.seen.lock().unwrap().len()
        }
        fn last_url(&self) -> Option<String> {
            self.seen.lock().unwrap().last().map(|r| r.url.clone())
        }
    }

    // FakeHttp must satisfy the async trait object; implement on the Arc
    // wrapper via an inner type so `Arc<FakeHttp>` can be coerced.
    impl ScopedTranscriptionHttp for FakeHttp {
        fn post(&self, request: TranscriptionRequest) -> VoiceFuture<'_, Option<Value>> {
            self.seen.lock().unwrap().push(request);
            let reply = self.reply.lock().unwrap().clone();
            Box::pin(async move { reply })
        }
    }

    fn settings_with(provider: Option<&str>, keys: &[(&str, &str)]) -> VoiceSettings {
        let mut api_keys = std::collections::BTreeMap::new();
        for (name, value) in keys {
            api_keys.insert((*name).to_string(), (*value).to_string());
        }
        VoiceSettings {
            stt_provider: provider.map(str::to_string),
            api_keys,
        }
    }

    fn wired(
        fix: Fixture,
        cfg: VoiceRouteConfig,
        settings: VoiceSettings,
        http: Arc<FakeHttp>,
    ) -> VoiceRoutes {
        VoiceRoutes::new(fix.auth, cfg)
            .with_transcription(http)
            .with_settings(Arc::new(FakeSettings { settings }))
            .with_clock(Arc::new(|| NOW.to_string()))
    }

    // ── 1. POST /api/voice/transcribe ──────────────────────────────

    #[tokio::test]
    async fn transcribe_without_transcript_or_audio_is_a_validation_error() {
        let fix = fixture();
        let routes = VoiceRoutes::new(fix.auth, route_config(None));
        let (status, body) = read(
            routes
                .post_transcribe(anon_headers(), json_body(json!({})))
                .await,
        )
        .await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_eq!(body["error"], "VALIDATION_ERROR");
        assert_eq!(body["details"], "No transcript or audio provided");
    }

    #[tokio::test]
    async fn transcribe_rejects_a_malformed_json_body() {
        let fix = fixture();
        let routes = VoiceRoutes::new(fix.auth, route_config(None));
        let (status, body) =
            read(routes.post_transcribe(anon_headers(), Body::from("{not-json")).await).await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert!(body.get("error").is_some(), "expected an error envelope: {body}");
    }

    #[tokio::test]
    async fn transcribe_echoes_the_transcript_and_reports_consent() {
        let fix = fixture();
        let routes = VoiceRoutes::new(fix.auth, route_config(None));
        let (status, body) = read(
            routes
                .post_transcribe(
                    anon_headers(),
                    json_body(json!({ "sessionId": "s1", "transcript": "hello there" })),
                )
                .await,
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(body["text"], "hello there");
        assert!(
            body.get("consent").is_some(),
            "consent envelope missing: {body}"
        );
        assert!(!body.to_string().contains("hello there\",\"consent"), "leak check");
    }

    // ── 2. POST /api/voice/transcribe-audio ────────────────────────

    #[tokio::test]
    async fn transcribe_audio_is_501_before_auth_when_not_wired() {
        let fix = fixture();
        let routes = VoiceRoutes::new(fix.auth, route_config(Some("http://127.0.0.1:8178")));
        // No credentials at all: the NOT_CONFIGURED probe must win.
        let (status, body) = read(
            routes
                .post_transcribe_audio(anon_headers(), json_body(json!({ "audioBase64": "AAAA" })))
                .await,
        )
        .await;
        assert_eq!(status, StatusCode::NOT_IMPLEMENTED);
        assert_eq!(body["error"], "NOT_CONFIGURED");
        assert_eq!(body["details"], "Voice audio transcription not available");
    }

    #[tokio::test]
    async fn transcribe_audio_requires_a_session_once_configured() {
        let fix = fixture();
        let http = FakeHttp::answering("ignored");
        let routes = wired(
            fix,
            route_config(Some("http://127.0.0.1:8178")),
            settings_with(Some("whisper"), &[]),
            http.clone(),
        );
        let (status, _body) = read(
            routes
                .post_transcribe_audio(anon_headers(), json_body(json!({ "audioBase64": "AAAA" })))
                .await,
        )
        .await;
        assert_eq!(status, StatusCode::UNAUTHORIZED);
        assert_eq!(http.requests(), 0, "no upstream call before auth");
    }

    #[tokio::test]
    async fn transcribe_audio_rejects_an_empty_payload() {
        let fix = fixture();
        let token = fix.token.clone();
        let http = FakeHttp::answering("ignored");
        let routes = wired(
            fix,
            route_config(Some("http://127.0.0.1:8178")),
            settings_with(Some("whisper"), &[]),
            http.clone(),
        );
        let (status, body) = read(
            routes
                .post_transcribe_audio(authed_headers(&token), json_body(json!({ "sessionId": "s1" })))
                .await,
        )
        .await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_eq!(body["error"], "VALIDATION_ERROR");
        assert_eq!(body["details"], "audioBase64 is required");
        assert_eq!(http.requests(), 0);
    }

    #[tokio::test]
    async fn transcribe_audio_requires_a_whisper_url() {
        let fix = fixture();
        let token = fix.token.clone();
        let http = FakeHttp::answering("ignored");
        let routes = wired(
            fix,
            route_config(None),
            settings_with(Some("whisper"), &[]),
            http.clone(),
        );
        let (status, body) = read(
            routes
                .post_transcribe_audio(authed_headers(&token), json_body(json!({ "audioBase64": "AAAA" })))
                .await,
        )
        .await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_eq!(body["error"], "NOT_CONFIGURED");
        let details = body["details"].as_str().unwrap_or_default();
        assert!(
            details.contains("WHISPER_URL must be set"),
            "unexpected details: {details}"
        );
        assert_eq!(http.requests(), 0);
    }

    #[tokio::test]
    async fn transcribe_audio_maps_provider_failures_to_502() {
        let fix = fixture();
        let token = fix.token.clone();
        let http = FakeHttp::failing("Transcription timed out after 15000ms");
        let routes = wired(
            fix,
            route_config(Some("http://127.0.0.1:8178")),
            settings_with(Some("whisper"), &[]),
            http.clone(),
        );
        let (status, body) = read(
            routes
                .post_transcribe_audio(authed_headers(&token), json_body(json!({ "audioBase64": "AAAA" })))
                .await,
        )
        .await;
        assert_eq!(status, StatusCode::BAD_GATEWAY);
        assert_eq!(body["error"], "TRANSCRIPTION_FAILED");
        assert_eq!(body["details"], "Transcription timed out after 15000ms");
        assert_eq!(http.requests(), 1);
    }

    #[tokio::test]
    async fn transcribe_audio_returns_the_transcript_from_the_provider() {
        let fix = fixture();
        let token = fix.token.clone();
        let http = FakeHttp::answering("  hi from whisper  ");
        let routes = wired(
            fix,
            route_config(Some("http://127.0.0.1:8178")),
            settings_with(Some("whisper"), &[]),
            http.clone(),
        );
        let (status, body) = read(
            routes
                .post_transcribe_audio(authed_headers(&token), json_body(json!({ "audioBase64": "AAAA" })))
                .await,
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(http.requests(), 1);
        let url = http.last_url().expect("provider request recorded");
        assert!(
            url.starts_with("http://127.0.0.1:8178"),
            "unexpected upstream url: {url}"
        );
        assert_eq!(body["text"], "  hi from whisper  ");
    }

    #[tokio::test]
    async fn transcribe_audio_prefers_the_settings_whisper_url() {
        let fix = fixture();
        let token = fix.token.clone();
        let http = FakeHttp::answering("ok");
        let routes = wired(
            fix,
            route_config(Some("http://127.0.0.1:8178")),
            settings_with(Some("whisper"), &[("WHISPER_URL", "http://127.0.0.1:9999")]),
            http.clone(),
        );
        let (status, _body) = read(
            routes
                .post_transcribe_audio(authed_headers(&token), json_body(json!({ "audioBase64": "AAAA" })))
                .await,
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        let url = http.last_url().expect("provider request recorded");
        assert!(
            url.starts_with("http://127.0.0.1:9999"),
            "settings URL should win: {url}"
        );
    }

    #[tokio::test]
    async fn transcription_requests_are_bounded_in_size() {
        // 23M base64 chars decode to ~17.25 MiB, past the 16 MiB cap.
        let oversized = "A".repeat(23_000_000);
        let err = crate::voice::transcription_request(
            crate::voice::SttProvider::Whisper {
                base: "http://127.0.0.1:8178",
                prompt: None,
            },
            &oversized,
        )
        .err().expect("oversized audio must be rejected");
        assert!(
            err.to_lowercase().contains("too large"),
            "unexpected error: {err}"
        );
    }

    // ── 3. POST /api/voice/speak + PATCH /api/voice/state ──────────

    #[tokio::test]
    async fn speak_rejects_blank_text() {
        let fix = fixture();
        let routes = VoiceRoutes::new(fix.auth, route_config(None));
        let (status, body) =
            read(routes.post_speak(anon_headers(), json_body(json!({ "text": "   " }))).await).await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_eq!(body["error"], "VALIDATION_ERROR");
    }

    #[tokio::test]
    async fn patch_state_only_applies_boolean_toggles() {
        let fix = fixture();
        let routes = VoiceRoutes::new(fix.auth, route_config(None));
        let (status, body) = read(
            routes
                .patch_state(
                    "s1".to_string(),
                    anon_headers(),
                    json_body(json!({
                        "wakeWordEnabled": false,
                        "listening": true,
                        "bogus": "nope",
                        "sessionId": "other"
                    })),
                )
                .await,
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        let encoded = body.to_string();
        assert!(encoded.contains("wakeWordEnabled"), "missing state: {encoded}");
        assert!(encoded.contains("listening"), "missing state: {encoded}");
        assert!(!encoded.contains("bogus"), "unknown keys must be ignored");
    }
}
