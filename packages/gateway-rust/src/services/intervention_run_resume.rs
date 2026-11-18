//! Identity-safe, asynchronous chat/thread continuation callbacks.
use futures_util::future::BoxFuture;
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    sync::{Arc, Mutex, Weak},
};
pub type ResumeHandler =
    Arc<dyn Fn(String) -> BoxFuture<'static, Result<Value, String>> + Send + Sync>;
#[derive(Clone, Debug, Default, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
pub struct ChatResumeOptions {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub hidden: Option<bool>,
}
pub type ChatResumeHandler = Arc<
    dyn Fn(String, Option<ChatResumeOptions>) -> BoxFuture<'static, Result<Value, String>>
        + Send
        + Sync,
>;
#[derive(Clone)]
enum Callback {
    Plain(ResumeHandler),
    Chat(ChatResumeHandler),
}
impl Callback {
    fn same_identity(&self, other: &Self) -> bool {
        match (self, other) {
            (Self::Plain(a), Self::Plain(b)) => Arc::ptr_eq(a, b),
            (Self::Chat(a), Self::Chat(b)) => Arc::ptr_eq(a, b),
            _ => false,
        }
    }
}
#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub enum ResumeKind {
    Chat,
    Thread,
}
type Handlers = HashMap<(ResumeKind, String), Callback>;
#[derive(Clone, Default)]
pub struct InterventionRunResumeRegistry {
    handlers: Arc<Mutex<Handlers>>,
}
pub struct ResumeSubscription {
    handlers: Weak<Mutex<Handlers>>,
    kind: ResumeKind,
    id: String,
    handler: Callback,
}
impl ResumeSubscription {
    pub fn unsubscribe(&self) {
        if let Some(handlers) = self.handlers.upgrade() {
            let mut handlers = handlers.lock().unwrap();
            let key = (self.kind, self.id.clone());
            if handlers
                .get(&key)
                .is_some_and(|h| h.same_identity(&self.handler))
            {
                handlers.remove(&key);
            }
        }
    }
}
impl InterventionRunResumeRegistry {
    pub fn register(
        &self,
        kind: ResumeKind,
        id: &str,
        handler: ResumeHandler,
    ) -> ResumeSubscription {
        self.register_callback(kind, id, Callback::Plain(handler))
    }
    pub fn register_chat_session(
        &self,
        id: &str,
        handler: ChatResumeHandler,
    ) -> ResumeSubscription {
        self.register_callback(ResumeKind::Chat, id, Callback::Chat(handler))
    }
    fn register_callback(
        &self,
        kind: ResumeKind,
        id: &str,
        handler: Callback,
    ) -> ResumeSubscription {
        self.handlers
            .lock()
            .unwrap()
            .insert((kind, id.into()), handler.clone());
        ResumeSubscription {
            handlers: Arc::downgrade(&self.handlers),
            kind,
            id: id.into(),
            handler,
        }
    }
    pub async fn resume(&self, kind: ResumeKind, id: &str, message: &str) -> Value {
        self.resume_inner(kind, id, message, None).await
    }
    pub async fn resume_chat_session(
        &self,
        id: &str,
        message: &str,
        options: Option<ChatResumeOptions>,
    ) -> Value {
        self.resume_inner(ResumeKind::Chat, id, message, options)
            .await
    }
    async fn resume_inner(
        &self,
        kind: ResumeKind,
        id: &str,
        message: &str,
        options: Option<ChatResumeOptions>,
    ) -> Value {
        let handler = self
            .handlers
            .lock()
            .unwrap()
            .get(&(kind, id.into()))
            .cloned();
        let Some(handler) = handler else {
            return json!({"status":"not-running"});
        };
        let result = match handler {
            Callback::Plain(handler) => handler(message.into()).await,
            Callback::Chat(handler) => handler(message.into(), options).await,
        };
        match result {
            Ok(value) => value,
            Err(error) => json!({"status":"error","error":error}),
        }
    }
    pub fn clear(&self) {
        self.handlers.lock().unwrap().clear();
    }
}
