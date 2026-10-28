//! Bounded socket relay supervisor. Concrete sockets implement RelayIo; this
//! module does not grant authentication or network destination authority.
use super::{Effect, RealtimeSession};
use crate::voice::VoiceFuture;
use serde_json::Value;
use std::{collections::VecDeque, time::Duration};
pub enum Input {
    Client(Vec<u8>),
    Provider(Vec<u8>),
    ClientClosed,
    ProviderClosed,
    TransportError(String),
}
/// Adapter bounds its incoming channel and applies backpressure; next cancellation
/// must not discard a frame. close synchronously signals both owned sockets and
/// their supervised cleanup, including during Drop or a failed write.
pub trait RelayIo: Send {
    fn next(&mut self) -> VoiceFuture<'_, Input>;
    fn client(&mut self, message: Value) -> VoiceFuture<'_, ()>;
    fn provider(&mut self, message: Value) -> VoiceFuture<'_, ()>;
    fn close(&mut self, code: u16, reason: &str);
}
pub struct ToolCall {
    pub call_id: String,
    pub name: String,
    pub arguments: Value,
}
pub trait RelayTools: Send + Sync {
    /// Drain bounded background completions from the connection supervisor.
    fn announcements(&self) -> Vec<String>;
    fn cancel_all(&self);
    /// Uses per-connection authenticated identity/project/consent. Future Drop
    /// cancels the owned execution; no detached mutations may remain.
    fn execute(&self, call: ToolCall) -> VoiceFuture<'_, String>;
}
struct OwnedTools<'a, T: RelayTools>(&'a T);
impl<T: RelayTools> Drop for OwnedTools<'_, T> {
    fn drop(&mut self) {
        self.0.cancel_all();
    }
}
struct OwnedIo<'a, T: RelayIo>(&'a mut T);
impl<T: RelayIo> Drop for OwnedIo<'_, T> {
    fn drop(&mut self) {
        self.0.close(1000, "Voice relay ended");
    }
}
pub async fn run(
    io: &mut impl RelayIo,
    tools: &impl RelayTools,
    session_update: Value,
) -> Result<(), String> {
    let owner = OwnedIo(io);
    let _tool_owner = OwnedTools(tools);
    let mut tick = tokio::time::interval(Duration::from_millis(100));
    tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    let mut state = RealtimeSession::default();
    let mut effects: VecDeque<Effect> = state.opened(session_update).into();
    let mut queued: VecDeque<ToolCall> = VecDeque::new();
    let mut active = None;
    let mut active_id = String::new();
    let mut active_name = String::new();
    let deadline = tokio::time::Instant::now() + Duration::from_secs(4 * 60 * 60);
    loop {
        while let Some(effect) = effects.pop_front() {
            match effect {
                Effect::Provider(v) => {
                    tokio::time::timeout(Duration::from_secs(5), owner.0.provider(v))
                        .await
                        .map_err(|_| "Slow voice provider")??;
                }
                Effect::Client(v) => {
                    tokio::time::timeout(Duration::from_secs(5), owner.0.client(v))
                        .await
                        .map_err(|_| "Slow voice consumer")??;
                }
                Effect::Close { code, reason } => {
                    owner.0.close(code, reason);
                    return Ok(());
                }
                Effect::Tool {
                    call_id,
                    name,
                    arguments,
                } => {
                    if queued.len() >= 16 {
                        return Err("Voice tool queue capacity reached".into());
                    }
                    queued.push_back(ToolCall {
                        call_id,
                        name,
                        arguments,
                    });
                }
            }
        }
        if active.is_none()
            && let Some(call) = queued.pop_front()
        {
            active_id = call.call_id.clone();
            active_name = call.name.clone();
            active = Some(tools.execute(call));
        }
        enum Ready {
            Frame(Result<Input, String>),
            Tool(Result<String, String>),
            Tick,
        }
        let ready = tokio::select! {
            _=tokio::time::sleep_until(deadline)=>return Err("Voice connection duration limit reached".into()),
            input=owner.0.next()=>Ready::Frame(input),
            _=tick.tick()=>Ready::Tick,
            result=async{active.as_mut().expect("guarded active tool").await},if active.is_some()=>Ready::Tool(result),
        };
        match ready {
            Ready::Tick => {
                let announcements = tools.announcements();
                if announcements.len() > 32 {
                    return Err("Background announcement capacity reached".into());
                }
                for text in announcements {
                    effects
                        .extend(state.client(&serde_json::json!({"type":"announce","text":text}))?);
                }
            }
            Ready::Tool(result) => {
                active = None;
                let text = match result {
                    Ok(s) => s,
                    Err(e) => format!("Tool error: {e}"),
                };
                effects.extend(state.tool_completed(&active_id, &active_name, &text)?);
            }
            Ready::Frame(input) => {
                match input? {
                    Input::Client(raw) | Input::Provider(raw) if raw.len() > 1024 * 1024 => {
                        return Err("Voice frame too large".into());
                    }
                    Input::Client(raw) => {
                        if let Ok(event) = serde_json::from_slice::<Value>(&raw) {
                            effects.extend(state.client(&event)?);
                        }
                    }
                    Input::Provider(raw) => {
                        if let Ok(event) = serde_json::from_slice::<Value>(&raw) {
                            effects.extend(state.provider(&event)?);
                        }
                    }
                    Input::ClientClosed => {
                        state.close("Client disconnected");
                        return Ok(());
                    }
                    Input::ProviderClosed => {
                        tokio::time::timeout(Duration::from_secs(5),owner.0.client(serde_json::json!({"type":"error","message":"OpenAI session ended"}))).await.map_err(|_|"Slow voice consumer")??;
                        return Ok(());
                    }
                    Input::TransportError(error) => return Err(error),
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    };
    struct Io {
        inputs: VecDeque<Input>,
        closes: usize,
    }
    impl RelayIo for Io {
        fn next(&mut self) -> VoiceFuture<'_, Input> {
            Box::pin(async move { Ok(self.inputs.pop_front().unwrap_or(Input::ClientClosed)) })
        }
        fn client(&mut self, _: Value) -> VoiceFuture<'_, ()> {
            Box::pin(async { Ok(()) })
        }
        fn provider(&mut self, _: Value) -> VoiceFuture<'_, ()> {
            Box::pin(async { Ok(()) })
        }
        fn close(&mut self, _: u16, _: &str) {
            self.closes += 1;
        }
    }
    struct Guard(Arc<AtomicUsize>);
    impl Drop for Guard {
        fn drop(&mut self) {
            self.0.fetch_add(1, Ordering::SeqCst);
        }
    }
    struct Tools(Arc<AtomicUsize>);
    impl RelayTools for Tools {
        fn announcements(&self) -> Vec<String> {
            vec![]
        }
        fn cancel_all(&self) {}
        fn execute(&self, _: ToolCall) -> VoiceFuture<'_, String> {
            let guard = Guard(self.0.clone());
            Box::pin(async move {
                let _guard = guard;
                std::future::pending::<()>().await;
                Ok(String::new())
            })
        }
    }
    #[tokio::test]
    async fn disconnect_drops_owned_inflight_tool_and_closes_socket_pair() {
        let count = Arc::new(AtomicUsize::new(0));
        let tools = Tools(count.clone());
        let call = serde_json::json!({"type":"response.function_call_arguments.done","call_id":"c","name":"pending","arguments":"{}"});
        let mut io = Io {
            inputs: VecDeque::from([
                Input::Provider(call.to_string().into_bytes()),
                Input::ClientClosed,
            ]),
            closes: 0,
        };
        run(&mut io, &tools, serde_json::json!({})).await.unwrap();
        assert_eq!(count.load(Ordering::SeqCst), 1);
        assert!(io.closes >= 1);
    }
}
