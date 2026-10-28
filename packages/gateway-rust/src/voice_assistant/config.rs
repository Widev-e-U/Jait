//! Trusted configuration, separate from model-supplied events.
use super::tools::ToolSchema;
use serde_json::{Value, json};
use std::collections::BTreeMap;
pub struct SessionConfig {
    pub model: String,
    pub voice: String,
    pub stt_prompt: String,
    pub server_api_key: String,
    pub locale: String,
    pub environment: BTreeMap<String, String>,
}
pub struct Identity {
    pub id: String,
    pub username: String,
}
/// Credentials deliberately have neither Debug nor Serialize.
pub struct AuthorizedConnection {
    pub user: Identity,
    pub provider_url: String,
    pub api_key: String,
    pub session_update: Value,
    pub user_keys: BTreeMap<String, String>,
}
pub fn authorize(
    user: Option<Identity>,
    user_keys: BTreeMap<String, String>,
    config: &SessionConfig,
    tools: &[ToolSchema],
) -> Result<AuthorizedConnection, (u16, &'static str)> {
    let user = user.ok_or((4001, "Unauthorized"))?;
    let api_key = user_keys
        .get("OPENAI_API_KEY")
        .map(|k| k.trim())
        .filter(|k| !k.is_empty())
        .unwrap_or(&config.server_api_key)
        .to_owned();
    if api_key.is_empty() {
        return Err((
            4002,
            "OpenAI API key not configured. Set it in Settings → API Keys.",
        ));
    }
    let prompt = user_keys
        .get("STT_PROMPT")
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .unwrap_or(&config.stt_prompt);
    let mut url = url::Url::parse("wss://api.openai.com/v1/realtime").expect("static URL");
    url.query_pairs_mut().append_pair("model", &config.model);
    let instructions = include_str!("instructions.txt")
        .replace("${username}", &user.username)
        .replace("${locale}", &config.locale);
    let update = json!({"type":"session.update","session":{"type":"realtime","instructions":instructions,"voice":config.voice,"turn_detection":turn_detection(&config.environment),"tools":tools,"tool_choice":"auto","input_audio_transcription":{"model":"gpt-4o-transcribe","prompt":prompt}}});
    Ok(AuthorizedConnection {
        user,
        provider_url: url.into(),
        api_key,
        session_update: update,
        user_keys,
    })
}
pub fn turn_detection(env: &BTreeMap<String, String>) -> Value {
    let mode = env
        .get("OPENAI_REALTIME_TURN_DETECTION")
        .map(|s| s.trim())
        .unwrap_or("semantic_vad");
    if ["disabled", "none", "manual"].contains(&mode) {
        return Value::Null;
    }
    if mode == "semantic_vad" {
        let raw = env
            .get("OPENAI_REALTIME_SEMANTIC_EAGERNESS")
            .map(String::as_str)
            .unwrap_or("auto");
        let eagerness = if ["low", "medium", "high", "auto"].contains(&raw) {
            raw
        } else {
            "auto"
        };
        return json!({"type":"semantic_vad","eagerness":eagerness,"create_response":true,"interrupt_response":true});
    }
    let number = |key: &str, fallback: f64| {
        env.get(key)
            .filter(|s| !s.is_empty())
            .map(|s| {
                if s.trim().is_empty() {
                    0.0
                } else {
                    s.trim().parse::<f64>().unwrap_or(fallback)
                }
            })
            .filter(|v| v.is_finite())
            .unwrap_or(fallback)
    };
    json!({"type":"server_vad","threshold":number("OPENAI_REALTIME_VAD_THRESHOLD",0.5),"prefix_padding_ms":(number("OPENAI_REALTIME_PREFIX_PADDING_MS",300.0)+0.5).floor(),"silence_duration_ms":(number("OPENAI_REALTIME_SILENCE_DURATION_MS",450.0)+0.5).floor(),"create_response":true,"interrupt_response":true})
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn user_key_and_prompt_override_server_and_auth_fails_closed() {
        let config = SessionConfig {
            model: "m".into(),
            voice: "v".into(),
            stt_prompt: "server".into(),
            server_api_key: "fallback".into(),
            locale: "en".into(),
            environment: BTreeMap::new(),
        };
        assert!(authorize(None, BTreeMap::new(), &config, &[]).is_err());
        let keys = BTreeMap::from([
            ("OPENAI_API_KEY".into(), " user ".into()),
            ("STT_PROMPT".into(), " prompt ".into()),
        ]);
        let connection = authorize(
            Some(Identity {
                id: "u".into(),
                username: "User".into(),
            }),
            keys,
            &config,
            &[],
        )
        .ok()
        .unwrap();
        assert_eq!(connection.api_key, "user");
        assert_eq!(
            connection
                .session_update
                .pointer("/session/input_audio_transcription/prompt")
                .unwrap(),
            "prompt"
        );
    }
}
