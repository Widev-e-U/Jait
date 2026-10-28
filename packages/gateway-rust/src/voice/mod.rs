//! Voice state and transcription request construction. Network authority belongs
//! to the injected scoped HTTP host; this module grants no private-network access.
pub mod http;
use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{collections::BTreeMap, future::Future, pin::Pin, time::Duration};

const MAX_TEXT: usize = 256 * 1024;
const MAX_AUDIO: usize = 16 * 1024 * 1024;
pub type VoiceFuture<'a, T> = Pin<Box<dyn Future<Output = Result<T, String>> + Send + 'a>>;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct VoiceState {
    pub session_id: String,
    pub wake_word_enabled: bool,
    pub talk_mode_enabled: bool,
    pub listening: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_transcript_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_spoken_at: Option<String>,
}
#[derive(Default)]
pub struct StatePatch {
    pub wake_word_enabled: Option<bool>,
    pub talk_mode_enabled: Option<bool>,
    pub listening: Option<bool>,
    pub last_transcript_at: Option<String>,
    pub last_spoken_at: Option<String>,
}
#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Transcription {
    pub text: String,
    pub wake_word_detected: bool,
    pub sent_to_agent: bool,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Speech {
    pub ok: bool,
    pub audio_base64: String,
    pub mime_type: &'static str,
}
pub struct VoiceService {
    states: BTreeMap<String, VoiceState>,
    max_sessions: usize,
}
impl Default for VoiceService {
    fn default() -> Self {
        Self::new(4096)
    }
}
impl VoiceService {
    pub fn new(max_sessions: usize) -> Self {
        Self {
            states: BTreeMap::new(),
            max_sessions,
        }
    }
    pub fn remove(&mut self, session: &str) {
        self.states.remove(session);
    }
    pub fn state(&mut self, session: &str) -> Result<&VoiceState, String> {
        if session.len() > 512 {
            return Err("Voice session id too long".into());
        }
        if !self.states.contains_key(session) {
            if self.states.len() >= self.max_sessions {
                return Err("Voice session capacity reached".into());
            }
            self.states.insert(
                session.into(),
                VoiceState {
                    session_id: session.into(),
                    wake_word_enabled: true,
                    talk_mode_enabled: false,
                    listening: false,
                    last_transcript_at: None,
                    last_spoken_at: None,
                },
            );
        }
        Ok(&self.states[session])
    }
    pub fn update(&mut self, session: &str, patch: StatePatch) -> Result<VoiceState, String> {
        self.state(session)?;
        let s = self.states.get_mut(session).expect("state was inserted");
        if let Some(v) = patch.wake_word_enabled {
            s.wake_word_enabled = v;
        }
        if let Some(v) = patch.talk_mode_enabled {
            s.talk_mode_enabled = v;
        }
        if let Some(v) = patch.listening {
            s.listening = v;
        }
        if let Some(v) = patch.last_transcript_at {
            s.last_transcript_at = Some(v);
        }
        if let Some(v) = patch.last_spoken_at {
            s.last_spoken_at = Some(v);
        }
        Ok(s.clone())
    }
    pub fn transcribe(
        &mut self,
        session: &str,
        transcript: Option<&str>,
        audio: Option<&str>,
        now: &str,
    ) -> Result<Transcription, String> {
        let decoded;
        let raw = if let Some(t) = transcript {
            t
        } else {
            decoded = audio
                .map(decode_node_base64)
                .transpose()?
                .map(|b| String::from_utf8_lossy(&b).into_owned())
                .unwrap_or_default();
            &decoded
        };
        if raw.len() > MAX_TEXT {
            return Err("Voice transcript too large".into());
        }
        let text = normalize_transcript(js_trim(raw));
        let wake_word_detected = regex::Regex::new(r"(?i)(?-u:\b)hey[\t\n\x0B\x0C\r \u{A0}\u{1680}\u{2000}-\u{200A}\u{2028}\u{2029}\u{202F}\u{205F}\u{3000}\u{FEFF}]+jait(?-u:\b)").expect("static regex").is_match(&text);
        let listen = wake_word_detected && self.state(session)?.wake_word_enabled;
        self.update(
            session,
            StatePatch {
                listening: listen.then_some(true),
                last_transcript_at: (!text.is_empty()).then(|| now.into()),
                ..StatePatch::default()
            },
        )?;
        Ok(Transcription {
            sent_to_agent: !text.is_empty(),
            text,
            wake_word_detected,
        })
    }
    pub fn speak(&mut self, session: &str, text: &str, now: &str) -> Result<Speech, String> {
        if text.len() > MAX_TEXT {
            return Err("Voice speech too large".into());
        }
        self.update(
            session,
            StatePatch {
                last_spoken_at: Some(now.into()),
                ..StatePatch::default()
            },
        )?;
        Ok(Speech {
            ok: true,
            audio_base64: base64::engine::general_purpose::STANDARD.encode(text),
            mime_type: "text/plain;base64",
        })
    }
}
use crate::text::js_trim;
pub fn normalize_transcript(text: &str) -> String {
    regex::Regex::new(r"(?i)(?-u:\b)(jade|jaid|jate|jayd)(?-u:\b)")
        .expect("static regex")
        .replace_all(text, |c: &regex::Captures<'_>| {
            if c[0] == c[0].to_uppercase() {
                "JAIT"
            } else {
                "Jait"
            }
        })
        .into_owned()
}
/// Node Buffer.from(base64) accepts URL alphabet, whitespace and missing padding.
pub fn decode_node_base64(raw: &str) -> Result<Vec<u8>, String> {
    if raw.len() > MAX_AUDIO * 2 {
        return Err("Voice audio too large".into());
    }
    let mut clean = String::new();
    for b in raw.bytes() {
        match b {
            b'=' => break,
            b'-' => clean.push('+'),
            b'_' => clean.push('/'),
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'+' | b'/' => clean.push(b as char),
            _ => {}
        }
    }
    if clean.len() % 4 == 1 {
        clean.pop();
    }
    let engine = base64::engine::general_purpose::GeneralPurpose::new(
        &base64::alphabet::STANDARD,
        base64::engine::general_purpose::GeneralPurposeConfig::new()
            .with_decode_padding_mode(base64::engine::DecodePaddingMode::Indifferent)
            .with_decode_allow_trailing_bits(true),
    );
    let bytes = engine
        .decode(clean)
        .map_err(|_| "Invalid voice audio".to_string())?;
    if bytes.len() > MAX_AUDIO {
        return Err("Voice audio too large".into());
    }
    Ok(bytes)
}
pub trait VoiceConsent {
    /// Existing consent manager must filter pending requests by this session.
    fn pending(&self, session: Option<&str>) -> Vec<String>;
    fn resolve(
        &mut self,
        request: &str,
        approved: bool,
        source: &str,
        utterance: &str,
    ) -> Result<(), String>;
}
#[derive(Debug, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ConsentResolution {
    pub handled: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub approved: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub request_id: Option<String>,
}
pub fn resolve_consent(
    host: &mut impl VoiceConsent,
    session: Option<&str>,
    text: &str,
) -> Result<ConsentResolution, String> {
    let normalized = js_trim(text).to_lowercase();
    let Some(id) = host.pending(session).into_iter().next() else {
        return Ok(ConsentResolution::default());
    };
    let approval = regex::Regex::new(r"(?-u:^yes\b)")
        .expect("static regex")
        .is_match(&normalized);
    let rejection = regex::Regex::new(r"(?-u:^(no|stop)\b)")
        .expect("static regex")
        .is_match(&normalized);
    if !approval && !rejection {
        return Ok(ConsentResolution::default());
    }
    host.resolve(&id, approval, "voice", text)?;
    Ok(ConsentResolution {
        handled: true,
        approved: Some(approval),
        request_id: Some(id),
    })
}
/// Sensitive header contents deliberately do not implement Debug.
pub struct TranscriptionRequest {
    pub url: String,
    pub headers: Vec<(String, String)>,
    pub audio: Vec<u8>,
    pub fields: Vec<(String, String)>,
    pub multipart: bool,
    pub file_field: &'static str,
    pub wyoming: bool,
}
pub enum SttProvider<'a> {
    Whisper {
        base: &'a str,
        prompt: Option<&'a str>,
    },
    Gpt {
        base: &'a str,
        key: &'a str,
        model: &'a str,
        prompt: Option<&'a str>,
    },
    ElevenLabs {
        endpoint: Option<&'a str>,
        key: &'a str,
        model: &'a str,
        language: Option<&'a str>,
    },
    Wyoming {
        base: &'a str,
        token: &'a str,
        entity: Option<&'a str>,
    },
}
pub fn transcription_request(
    provider: SttProvider<'_>,
    audio_base64: &str,
) -> Result<TranscriptionRequest, String> {
    let audio = decode_node_base64(audio_base64)?;
    let mut request = TranscriptionRequest {
        url: String::new(),
        headers: vec![],
        audio,
        fields: vec![],
        multipart: false,
        file_field: "file",
        wyoming: false,
    };
    let prompt_field = |p: Option<&str>| {
        p.map(str::trim)
            .filter(|p| !p.is_empty())
            .map(|p| ("prompt".into(), p.into()))
    };
    match provider {
        SttProvider::Whisper { base, prompt } => {
            request.url = format!("{}/transcribe", base.trim_end_matches('/'));
            request.file_field = "audio";
            if let Some(p) = prompt_field(prompt) {
                request.fields.push(p);
                request.multipart = true;
            } else {
                request
                    .headers
                    .push(("Content-Type".into(), "audio/wav".into()));
            }
        }
        SttProvider::Gpt {
            base,
            key,
            model,
            prompt,
        } => {
            request.url = format!("{}/audio/transcriptions", base.trim_end_matches('/'));
            request.multipart = true;
            request
                .headers
                .push(("Authorization".into(), format!("Bearer {key}")));
            request.fields.push(("model".into(), model.into()));
            if let Some(p) = prompt_field(prompt) {
                request.fields.push(p);
            }
        }
        SttProvider::ElevenLabs {
            endpoint,
            key,
            model,
            language,
        } => {
            request.url = endpoint
                .filter(|s| !s.is_empty())
                .unwrap_or("https://api.elevenlabs.io/v1/speech-to-text")
                .trim_end_matches('/')
                .into();
            request.multipart = true;
            request.headers.push(("xi-api-key".into(), key.into()));
            request.fields.push(("model_id".into(), model.into()));
            if let Some(l) = language.filter(|l| !l.is_empty()) {
                request.fields.push(("language_code".into(), l.into()));
            }
        }
        SttProvider::Wyoming {
            base,
            token,
            entity,
        } => {
            request.url = format!(
                "{}/api/stt/{}",
                base.trim_end_matches('/'),
                entity
                    .filter(|e| !e.is_empty())
                    .unwrap_or("stt.faster_whisper")
            );
            request.wyoming = true;
            request.headers = vec![
                ("Authorization".into(), format!("Bearer {token}")),
                ("Content-Type".into(), "audio/wav".into()),
                (
                    "X-Speech-Content".into(),
                    "language=de, format=wav, codec=pcm, bit_rate=16, sample_rate=16000, channel=1"
                        .into(),
                ),
            ];
        }
    }
    Ok(request)
}
/// Must enforce configured destination authority, DNS/redirect policy, response
/// bytes <= 256KiB, no credential logging and cancellation on dropped future.
/// Multipart file field is file, filename audio.wav, content type audio/wav.
pub trait ScopedTranscriptionHttp: Send + Sync {
    fn post(&self, request: TranscriptionRequest) -> VoiceFuture<'_, Option<Value>>;
}
pub async fn transcribe_remote(
    host: &impl ScopedTranscriptionHttp,
    request: TranscriptionRequest,
) -> Result<Option<String>, String> {
    let wyoming = request.wyoming;
    let response = tokio::time::timeout(Duration::from_secs(30), host.post(request))
        .await
        .map_err(|_| "Transcription timed out")??;
    if response
        .as_ref()
        .is_some_and(|v| v.to_string().len() > MAX_TEXT)
    {
        return Err("Transcription response too large".into());
    }
    Ok(response.and_then(|v| {
        if wyoming && v.get("result").and_then(Value::as_str) != Some("success") {
            return None;
        }
        v.get("text")
            .and_then(Value::as_str)
            .filter(|s| !wyoming || !s.is_empty())
            .map(str::to_owned)
    }))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn normalization_and_state() {
        let mut voice = VoiceService::new(1);
        let result = voice
            .transcribe("a", Some("Hey JADE, jadeite jaid"), None, "now")
            .unwrap();
        assert_eq!(result.text, "Hey JAIT, jadeite Jait");
        assert!(result.wake_word_detected);
        assert!(voice.state("a").unwrap().listening);
        assert!(voice.state("b").is_err());
        assert_eq!(decode_node_base64("aGk").unwrap(), b"hi");
    }
    #[test]
    fn remote_request_shapes() {
        let r = transcription_request(
            SttProvider::Whisper {
                base: "http://localhost/",
                prompt: Some(" Jait "),
            },
            "",
        )
        .unwrap();
        assert_eq!(r.url, "http://localhost/transcribe");
        assert!(r.multipart);
        assert_eq!(r.fields, vec![("prompt".into(), "Jait".into())]);
        let r = transcription_request(
            SttProvider::Wyoming {
                base: "http://ha",
                token: "secret",
                entity: None,
            },
            "",
        )
        .unwrap();
        assert!(r.wyoming);
        assert_eq!(r.url, "http://ha/api/stt/stt.faster_whisper");
    }
}
