//! Temporary voice helper ownership and bounded provider event consumption.
use super::tools::ToolContext;
use crate::voice::VoiceFuture;
use std::time::Duration;
use tokio::sync::{mpsc, watch};

#[derive(Clone, Debug)]
pub struct ProviderSelection {
    pub provider: String,
    pub model: Option<String>,
    pub runtime_mode: String,
}
pub fn resolve_provider(
    requested: Option<&str>,
    registered: &[String],
    defaults: Option<ProviderSelection>,
) -> Result<ProviderSelection, String> {
    let known = ["jait", "codex", "claude-code"];
    let requested = requested
        .map(str::trim)
        .map(str::to_lowercase)
        .filter(|r| known.contains(&r.as_str()));
    if let Some(provider) = requested {
        if !registered.contains(&provider) {
            return Err(format!(
                "Provider '{provider}' is not registered on this gateway."
            ));
        }
        return Ok(ProviderSelection {
            provider,
            model: None,
            runtime_mode: "full-access".into(),
        });
    }
    if let Some(default) = &defaults
        && known.contains(&default.provider.as_str())
        && registered.contains(&default.provider)
    {
        return Ok(default.clone());
    }
    for provider in known {
        if registered.iter().any(|r| r == provider) {
            return Ok(ProviderSelection {
                provider: provider.into(),
                model: None,
                runtime_mode: defaults
                    .as_ref()
                    .map(|d| d.runtime_mode.clone())
                    .unwrap_or_else(|| "full-access".into()),
            });
        }
    }
    Err("No regular agent provider is registered on this gateway.".into())
}
pub fn timeout_ms(value: Option<f64>) -> u64 {
    match value {
        Some(v) if v.is_finite() && v > 0.0 => v.floor().clamp(5000.0, 120000.0) as u64,
        _ => 45000,
    }
}
pub enum HelperEvent {
    Token(String),
    Assistant(String),
    ApprovalRequired(String),
    Error(String),
    Completed,
}
pub struct HelperRequest {
    pub question: String,
    pub working_directory: String,
    pub selection: ProviderSelection,
    pub context: ToolContext,
}
/// Lease Drop MUST synchronously signal stop and supervise process cleanup.
/// create_helper returns only after subscription installation, avoiding lost
/// first events. Host validates directory/user scope and requested runtime mode
/// through existing consent; a voice request never grants full-access authority.
pub trait HelperLease: Send {
    fn send<'a>(&'a mut self, question: &'a str) -> VoiceFuture<'a, ()>;
    fn record_answer<'a>(&'a mut self, answer: &'a str) -> VoiceFuture<'a, ()>;
    fn record_error<'a>(&'a mut self, error: &'a str) -> VoiceFuture<'a, ()>;
    fn stop_and_delete(&mut self) -> VoiceFuture<'_, ()>;
}
pub struct HelperSession {
    pub thread_id: String,
    pub session_id: String,
    pub provider_id: String,
    pub lease: Box<dyn HelperLease>,
    pub events: mpsc::Receiver<HelperEvent>,
}
pub trait DelegationHost: Send + Sync {
    fn create_helper(&self, request: HelperRequest) -> VoiceFuture<'_, HelperSession>;
}
pub fn format_question(question: &str) -> String {
    format!(
        "You are answering a voice assistant that is helping the user in Jait.\nAnswer the user's question directly and clearly.\nPrefer plain text that works well for text-to-speech.\nKeep the answer concise, but include the key explanation the voice assistant is missing.\nIf important context is missing, say exactly what is missing.\n\nUser question: {}",
        question.trim()
    )
}
/// Runs sequentially inside an owned connection supervisor. A watch change is
/// cancellation; dropping this future drops the lease and signals cleanup.
pub async fn ask(
    host: &(impl DelegationHost + ?Sized),
    request: HelperRequest,
    duration_ms: u64,
    mut cancel: watch::Receiver<bool>,
) -> Result<String, String> {
    if request.question.trim().is_empty() {
        return Err("No question provided.".into());
    }
    if request.question.len() > 256 * 1024 || request.working_directory.len() > 8192 {
        return Err("Voice helper input too large".into());
    }
    if *cancel.borrow() {
        return Err("Voice helper cancelled".into());
    }
    let question = format_question(&request.question);
    let deadline =
        tokio::time::Instant::now() + Duration::from_millis(duration_ms.clamp(5000, 120000));
    let helper = tokio::select! {
        _=cancel.changed()=>return Err("Voice helper cancelled".into()),
        result=tokio::time::timeout_at(deadline,host.create_helper(request))=>result.map_err(|_|"Voice helper startup timed out")??,
    };
    run_started(helper, question, deadline, duration_ms, cancel).await
}
pub async fn run_started(
    mut helper: HelperSession,
    question: String,
    deadline: tokio::time::Instant,
    duration_ms: u64,
    mut cancel: watch::Receiver<bool>,
) -> Result<String, String> {
    if helper.events.max_capacity() > 1024 {
        return Err("Voice helper event queue too large".into());
    }
    let result=async {
        tokio::select!{
            _=cancel.changed()=>return Err("Voice helper cancelled".into()),
            result=tokio::time::timeout_at(deadline,helper.lease.send(&question))=>result.map_err(|_|"Voice helper send timed out")??,
        }
        let mut tokens=String::new();
        let mut latest=String::new();
        loop {
            let event=tokio::select! {
                _=cancel.changed()=>return Err("Voice helper cancelled".into()),
                event=tokio::time::timeout_at(deadline,helper.events.recv())=>event.map_err(|_|format!("Timed out after {duration_ms}ms waiting for the agent response."))?,
            };
            match event {
                Some(HelperEvent::Token(token))=>{
                    if tokens.len().saturating_add(token.len())>256*1024{return Err("Voice helper output too large".into());}
                    tokens.push_str(&token);
                }
                Some(HelperEvent::Assistant(message))=>{
                    if message.len()>256*1024{return Err("Voice helper output too large".into());}
                    latest=message.trim().into();
                }
                Some(HelperEvent::ApprovalRequired(tool))=>return Err(format!("Agent requires approval for tool '{tool}', so the voice handoff could not finish automatically.")),
                Some(HelperEvent::Error(error))=>return Err(error),
                Some(HelperEvent::Completed)=>{
                    let answer=if latest.is_empty(){tokens.trim().to_owned()}else{latest};
                    if answer.is_empty(){return Err("The agent completed without returning a usable answer.".into());}
                    tokio::time::timeout_at(deadline,helper.lease.record_answer(&answer)).await.map_err(|_|"Voice helper activity timed out")??;
                    return Ok(answer);
                }
                None=>return Err("Agent event stream ended before completion".into()),
            }
        }
    }.await;
    if let Err(error) = &result {
        let _ =
            tokio::time::timeout(Duration::from_secs(2), helper.lease.record_error(error)).await;
    }
    let _ = tokio::time::timeout(Duration::from_secs(5), helper.lease.stop_and_delete()).await;
    result
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn provider_precedence_and_timeout_bounds() {
        let providers = vec!["jait".into(), "codex".into()];
        let selected = resolve_provider(Some(" CODEX "), &providers, None).unwrap();
        assert_eq!(selected.provider, "codex");
        assert!(resolve_provider(Some("claude-code"), &providers, None).is_err());
        assert_eq!(timeout_ms(Some(1.5)), 5000);
        assert_eq!(timeout_ms(Some(f64::INFINITY)), 45000);
        assert_eq!(timeout_ms(Some(999999.0)), 120000);
    }
}
