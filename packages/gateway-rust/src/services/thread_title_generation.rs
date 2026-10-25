use super::normalize_generated_thread_title;
use crate::{contracts::bounded_json::Utf16Text, text::js_trim, tools::core_io::HostError};
use futures_util::future::BoxFuture;
use serde_json::{Value, json};
use std::{sync::Arc, time::Duration};
use tokio::sync::mpsc;

pub const THREAD_TITLE_PROMPT: &str =
    "Reply with ONLY a short task title (3-8 words). No quotes, bullets, or commentary.";
pub const TITLE_TURN_TIMEOUT: Duration = Duration::from_secs(30);

/// Dropping this subscription unregisters the provider listener, including on
/// timeout, send failure or caller cancellation. The provider owns session scope.
pub struct TitleSubscription {
    pub events: mpsc::UnboundedReceiver<Value>,
    pub unsubscribe: Option<Box<dyn FnOnce() + Send>>,
}
impl Drop for TitleSubscription {
    fn drop(&mut self) {
        if let Some(unsubscribe) = self.unsubscribe.take() {
            unsubscribe();
        }
    }
}
pub trait TitleProvider: Send + Sync {
    fn subscribe(&self) -> Result<TitleSubscription, HostError>;
    fn send_turn(&self, session: &str, prompt: &str) -> BoxFuture<'static, Result<(), HostError>>;
}

pub async fn generate_title_via_turn(
    provider: &dyn TitleProvider,
    session: &str,
    task: &str,
) -> Result<String, HostError> {
    let mut subscription = provider.subscribe()?;
    let mut send = provider.send_turn(
        session,
        &format!("{THREAD_TITLE_PROMPT}\n\n{}", js_trim(task)),
    );
    let deadline = tokio::time::sleep(TITLE_TURN_TIMEOUT);
    tokio::pin!(deadline);
    let mut sent = false;
    let mut send_error = None;
    let mut closed = false;
    let mut text = String::new();
    loop {
        tokio::select! {
            biased;
            _ = &mut deadline => return Err(HostError::Error("Title turn timed out".into())),
            event = subscription.events.recv(), if !closed => {
                let Some(event) = event else { closed=true; continue; };
                if event["sessionId"].as_str()!=Some(session) { continue; }
                match event["type"].as_str() {
                    Some("token") => text.push_str(event["content"].as_str().unwrap_or("")),
                    Some("message") if event["role"]=="assistant" => text=event["content"].as_str().unwrap_or("").into(),
                    Some("turn.completed"|"session.completed") => return Ok(js_trim(&text).into()),
                    Some("session.error") => return Err(HostError::Error(event["error"].as_str().unwrap_or("").into())),
                    _ => {}
                }
            }
            result = &mut send, if !sent => {
                // Provider callbacks may enqueue completion before send_turn
                // rejects. JavaScript settles on that earlier callback; consume
                // already queued events before surfacing the send failure.
                send_error = result.err();
                sent = true;
            }
            _ = std::future::ready(()), if send_error.is_some() => {
                return Err(send_error.take().expect("guarded send error"));
            }
        }
    }
}

#[derive(Clone, Debug)]
pub enum TitleApiOperation {
    /// The existing shared resolver owns backend aliases, model selection and
    /// endpoint configuration. Forward the original config and optional values.
    ResolveLlm(Value),
    CompleteLlm {
        config: Value,
        messages: Value,
        options: Value,
    },
    /// HTTP port returns {status, body}; body is the parsed response JSON.
    /// It owns URL policy, connect/overall deadlines, output limits and cancellation.
    Fetch {
        url: String,
        headers: Value,
        body: Value,
    },
}
pub type TitleApiPort =
    Arc<dyn Fn(TitleApiOperation) -> BoxFuture<'static, Result<Value, HostError>> + Send + Sync>;

#[derive(Debug, Clone, PartialEq)]
pub enum TitleError {
    Host(HostError),
    TypeError(String),
}
impl From<HostError> for TitleError {
    fn from(error: HostError) -> Self {
        Self::Host(error)
    }
}

fn string<'a>(value: &'a Value, key: &str) -> &'a str {
    value[key].as_str().unwrap_or("")
}
fn nonempty_key<'a>(keys: &'a Value, key: &str) -> Option<&'a str> {
    keys[key].as_str().map(js_trim).filter(|s| !s.is_empty())
}
fn truthy(value: &Value) -> bool {
    match value {
        Value::Null => false,
        Value::Bool(v) => *v,
        Value::String(v) => !v.is_empty(),
        Value::Number(v) => v.as_f64().is_some_and(|n| n != 0.0),
        _ => true,
    }
}
pub async fn generate_title_via_api(
    options: &Value,
    port: &TitleApiPort,
) -> Result<Utf16Text, TitleError> {
    let raw = call_llm(options, port).await?;
    let title = normalize_generated_thread_title(&raw, "");
    if title.0.is_empty() {
        return Err(HostError::Error("Title generation returned no usable title".into()).into());
    }
    Ok(title)
}
async fn call_llm(options: &Value, port: &TitleApiPort) -> Result<String, TitleError> {
    let empty = json!({});
    let keys = options
        .get("apiKeys")
        .filter(|v| !v.is_null())
        .unwrap_or(&empty);
    let config = &options["config"];
    let messages = json!([
        {"role":"system","content":THREAD_TITLE_PROMPT},
        {"role":"user","content":js_trim(string(options,"task"))}
    ]);
    if truthy(&options["jaitBackend"]) {
        let mut input =
            json!({"config":config,"apiKeys":keys,"jaitBackend":options["jaitBackend"]});
        if let Some(model) = options.get("model") {
            input["requestedModel"] = model.clone();
        }
        let llm = port(TitleApiOperation::ResolveLlm(input)).await?;
        if !truthy(&llm["openaiApiKey"]) {
            return Err(HostError::Error(format!(
                "{} API key is not configured",
                string(&llm, "backend").to_uppercase()
            ))
            .into());
        }
        return port(TitleApiOperation::CompleteLlm {
            config: llm,
            messages,
            options: json!({"maxTokens":512,"temperature":0.2}),
        })
        .await?
        .as_str()
        .map(str::to_owned)
        .ok_or_else(|| {
            TitleError::from(HostError::Error(
                "Title generation returned no usable title".into(),
            ))
        });
    }
    let openai =
        nonempty_key(keys, "OPENAI_API_KEY").is_some() || config["llmProvider"] == "openai";
    let (url, headers, body) = if openai {
        let key =
            nonempty_key(keys, "OPENAI_API_KEY").unwrap_or_else(|| string(config, "openaiApiKey"));
        if key.is_empty() {
            return Err(HostError::Error("OPENAI_API_KEY is not configured".into()).into());
        }
        let base = nonempty_key(keys, "OPENAI_BASE_URL")
            .unwrap_or_else(|| string(config, "openaiBaseUrl"));
        let model = nonempty_key(keys, "OPENAI_MODEL")
            .or_else(|| options["model"].as_str().filter(|s| !s.is_empty()))
            .unwrap_or_else(|| string(config, "openaiModel"));
        (
            format!("{}/chat/completions", base.trim_end_matches('/')),
            json!({"Content-Type":"application/json","Authorization":format!("Bearer {key}")}),
            json!({"model":model,"temperature":0.2,"max_tokens":512,"messages":messages}),
        )
    } else {
        (
            format!(
                "{}/api/chat",
                string(config, "ollamaUrl").trim_end_matches('/')
            ),
            json!({"Content-Type":"application/json"}),
            json!({"model":config["ollamaModel"],"stream":false,"messages":messages}),
        )
    };
    let response = port(TitleApiOperation::Fetch { url, headers, body }).await?;
    let status = response["status"].as_u64().unwrap_or(0);
    let backend = if openai { "OpenAI" } else { "Ollama" };
    if !(200..300).contains(&status) {
        return Err(
            HostError::Error(format!("{backend} title generation failed: {status}")).into(),
        );
    }
    let data = &response["body"];
    if data.is_null() {
        let field = if openai { "choices" } else { "message" };
        return Err(TitleError::TypeError(format!(
            "Cannot read properties of null (reading '{field}')"
        )));
    }
    if openai {
        let choices = &data["choices"];
        let first = if choices.is_object() {
            &choices["0"]
        } else {
            &choices[0]
        };
        let content = &first["message"]["content"];
        if let Some(content) = content.as_str() {
            return Ok(content.into());
        }
        if let Some(parts) = content.as_array() {
            let text = parts
                .iter()
                .filter(|p| p["type"] == "text")
                .map(|p| {
                    if p["text"].is_null() {
                        String::new()
                    } else {
                        crate::services::calendar::js_text(&p["text"])
                    }
                })
                .collect::<String>();
            return Ok(js_trim(&text).into());
        }
    } else if !data["message"]["content"].is_null() && !data["message"]["content"].is_string() {
        return Err(TitleError::TypeError(
            "Title response content.trim is not a function".into(),
        ));
    } else if let Some(content) = data["message"]["content"]
        .as_str()
        .map(js_trim)
        .filter(|s| !s.is_empty())
    {
        return Ok(content.into());
    }
    Err(HostError::Error(format!("{backend} title generation returned no content")).into())
}
