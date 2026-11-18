//! Stable attention identities and best-effort delivery to authorized transports.
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{future::Future, pin::Pin, sync::Arc};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AttentionKind {
    Consent,
    Question,
}
impl AttentionKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Consent => "consent",
            Self::Question => "question",
        }
    }
}
pub fn attention_key(kind: AttentionKind, request_id: &str) -> String {
    format!("{}:{request_id}", kind.as_str())
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum AttentionActionKind {
    Approve,
    Reject,
    ApproveAll,
    Select,
    Reply,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct AttentionAction {
    pub id: String,
    pub label: String,
    pub kind: AttentionActionKind,
}
pub fn consent_attention_actions() -> Vec<AttentionAction> {
    [
        ("approve", "Approve", AttentionActionKind::Approve),
        ("reject", "Reject", AttentionActionKind::Reject),
        (
            "approve-all",
            "Approve all",
            AttentionActionKind::ApproveAll,
        ),
    ]
    .into_iter()
    .map(|(id, label, kind)| AttentionAction {
        id: id.into(),
        label: label.into(),
        kind,
    })
    .collect()
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AttentionQuestion {
    pub id: String,
    pub options: Option<Vec<QuestionOption>>,
    #[serde(default)]
    pub allow_freeform_input: bool,
    #[serde(default)]
    pub multi_select: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct QuestionOption {
    pub label: String,
}
pub fn attention_actions_for_question(questions: &[AttentionQuestion]) -> Vec<AttentionAction> {
    if questions.len() != 1 {
        return vec![];
    }
    let first = &questions[0];
    if let Some(options) = first
        .options
        .as_ref()
        .filter(|v| !v.is_empty() && !first.multi_select)
    {
        return options
            .iter()
            .take(3)
            .map(|option| AttentionAction {
                id: format!("{}:{}", first.id, option.label),
                label: option.label.clone(),
                kind: AttentionActionKind::Select,
            })
            .collect();
    }
    if first.allow_freeform_input {
        vec![AttentionAction {
            id: first.id.clone(),
            label: "Reply".into(),
            kind: AttentionActionKind::Reply,
        }]
    } else {
        vec![]
    }
}
pub fn should_notify_natively(surface: &str, live_surfaces: &[String]) -> bool {
    surface != "web" || !live_surfaces.iter().any(|s| s == "desktop")
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AttentionData {
    pub kind: AttentionKind,
    pub request_id: String,
    pub session_id: String,
    pub title: String,
    pub body: String,
    pub urgent: bool,
    pub actions: Vec<AttentionAction>,
    pub link: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<Value>,
    pub expires_at: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RaiseInput {
    #[serde(flatten)]
    pub data: AttentionData,
    pub user_id: Option<String>,
    pub created_at: Option<String>,
}
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AttentionItem {
    #[serde(flatten)]
    pub data: AttentionData,
    pub key: String,
    pub user_id: Option<String>,
    pub created_at: String,
}
#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AttentionClearedReason {
    Answered,
    Cancelled,
    Timeout,
    Superseded,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AttentionCleared {
    pub key: String,
    pub kind: AttentionKind,
    pub request_id: String,
    pub session_id: String,
    pub user_id: Option<String>,
    pub reason: AttentionClearedReason,
    pub resolved_by: Option<String>,
    pub cleared_at: String,
}
pub type SinkFuture = Pin<Box<dyn Future<Output = Result<(), String>> + Send>>;
pub type SinkResult = Result<Option<SinkFuture>, String>;
pub trait AttentionSink: Send + Sync {
    fn raised(&self, item: &AttentionItem) -> SinkResult;
    fn cleared(&self, event: &AttentionCleared) -> SinkResult;
}
/// Synchronous methods preserve exception ordering. Implementations enforce the
/// same user/session authorization and surface scoping as the WS control plane.
pub trait AttentionTransport {
    fn live_surfaces(&self, user_id: Option<&str>) -> Result<Vec<String>, String>;
    fn broadcast_by_surface(
        &self,
        user_id: Option<&str>,
        event: &dyn Fn(&str) -> Value,
    ) -> Result<(), String>;
    fn broadcast_to_user(&self, user_id: &str, event: Value) -> Result<(), String>;
    fn broadcast_all(&self, event: Value) -> Result<(), String>;
}
pub type UserResolver = Box<dyn Fn(&str) -> Result<Option<String>, String>>;
pub type SinkSpawner = Box<dyn Fn(SinkFuture)>;
/// Subscription identity matches JS object identity, including duplicate adds.
#[derive(Clone)]
pub struct SinkSubscription(Arc<dyn AttentionSink>);
pub struct AttentionService {
    open: Vec<AttentionItem>,
    sinks: Vec<Arc<dyn AttentionSink>>,
    transport: Box<dyn AttentionTransport>,
    resolve_user_id: Option<UserResolver>,
    now: Box<dyn Fn() -> String>,
    spawn: SinkSpawner,
}
impl AttentionService {
    pub fn new(
        transport: Box<dyn AttentionTransport>,
        resolve_user_id: Option<UserResolver>,
        now: Box<dyn Fn() -> String>,
        spawn: SinkSpawner,
    ) -> Self {
        Self {
            open: vec![],
            sinks: vec![],
            transport,
            resolve_user_id,
            now,
            spawn,
        }
    }
    pub fn add_sink(&mut self, sink: Arc<dyn AttentionSink>) -> SinkSubscription {
        self.sinks.push(sink.clone());
        SinkSubscription(sink)
    }
    pub fn remove_sink(&mut self, subscription: &SinkSubscription) {
        if let Some(index) = self
            .sinks
            .iter()
            .position(|s| Arc::ptr_eq(s, &subscription.0))
        {
            self.sinks.remove(index);
        }
    }
    pub fn list(&self, user_id: Option<&str>) -> Vec<AttentionItem> {
        self.open
            .iter()
            .filter(|item| {
                user_id
                    .filter(|v| !v.is_empty())
                    .is_none_or(|user| item.user_id.as_deref() == Some(user))
            })
            .cloned()
            .collect()
    }
    pub fn get(&self, key: &str) -> Option<&AttentionItem> {
        self.open.iter().find(|item| item.key == key)
    }
    pub fn raise(&mut self, input: RaiseInput) -> Result<AttentionItem, String> {
        let key = attention_key(input.data.kind, &input.data.request_id);
        let item = AttentionItem {
            user_id: match input.user_id {
                Some(user) => Some(user),
                None => match &self.resolve_user_id {
                    Some(resolve) => resolve(&input.data.session_id)?,
                    None => None,
                },
            },
            created_at: input.created_at.unwrap_or_else(|| (self.now)()),
            key,
            data: input.data,
        };
        if let Some(index) = self.open.iter().position(|old| old.key == item.key) {
            self.open[index] = item.clone();
        } else {
            self.open.push(item.clone());
        }
        let live_surfaces = self.transport.live_surfaces(item.user_id.as_deref())?;
        self.transport.broadcast_by_surface(item.user_id.as_deref(), &|surface| {
            let mut payload = serde_json::to_value(&item).expect("typed attention item");
            payload["native"] = Value::Bool(should_notify_natively(surface,&live_surfaces));
            json!({"type":"attention.raised","sessionId":item.data.session_id,"timestamp":item.created_at,"payload":payload})
        })?;
        self.dispatch(|sink| sink.raised(&item));
        Ok(item)
    }
    pub fn clear(
        &mut self,
        kind: AttentionKind,
        request_id: &str,
        reason: AttentionClearedReason,
        resolved_by: Option<&str>,
    ) -> Result<Option<AttentionCleared>, String> {
        let key = attention_key(kind, request_id);
        let Some(index) = self.open.iter().position(|item| item.key == key) else {
            return Ok(None);
        };
        let item = self.open.remove(index);
        let event = AttentionCleared {
            key,
            kind,
            request_id: request_id.into(),
            session_id: item.data.session_id,
            user_id: item.user_id,
            reason,
            resolved_by: resolved_by.map(String::from),
            cleared_at: (self.now)(),
        };
        let message = json!({"type":"attention.cleared","sessionId":event.session_id,"timestamp":event.cleared_at,"payload":event});
        if let Some(user) = event.user_id.as_deref().filter(|v| !v.is_empty()) {
            self.transport.broadcast_to_user(user, message)?;
        } else {
            self.transport.broadcast_all(message)?;
        }
        self.dispatch(|sink| sink.cleared(&event));
        Ok(Some(event))
    }
    fn dispatch(&self, deliver: impl Fn(&dyn AttentionSink) -> SinkResult) {
        for sink in &self.sinks {
            if let Ok(Some(task)) = deliver(sink.as_ref()) {
                (self.spawn)(Box::pin(async move {
                    let _ = task.await;
                    Ok(())
                }));
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{cell::RefCell, rc::Rc, sync::Mutex};
    type Events = Arc<Mutex<Vec<Value>>>;
    struct Transport {
        events: Events,
        fail: bool,
    }
    impl AttentionTransport for Transport {
        fn live_surfaces(&self, _: Option<&str>) -> Result<Vec<String>, String> {
            Ok(vec!["web".into(), "desktop".into()])
        }
        fn broadcast_by_surface(
            &self,
            user: Option<&str>,
            make: &dyn Fn(&str) -> Value,
        ) -> Result<(), String> {
            self.events
                .lock()
                .unwrap()
                .push(json!({"user":user,"web":make("web"),"desktop":make("desktop")}));
            if self.fail {
                Err("offline".into())
            } else {
                Ok(())
            }
        }
        fn broadcast_to_user(&self, user: &str, event: Value) -> Result<(), String> {
            self.events
                .lock()
                .unwrap()
                .push(json!({"user":user,"event":event}));
            Ok(())
        }
        fn broadcast_all(&self, event: Value) -> Result<(), String> {
            self.events.lock().unwrap().push(json!({"global":event}));
            Ok(())
        }
    }
    fn input(kind: AttentionKind, id: &str) -> RaiseInput {
        RaiseInput {
            data: AttentionData {
                kind,
                request_id: id.into(),
                session_id: "session".into(),
                title: "Title".into(),
                body: "Body".into(),
                urgent: false,
                actions: vec![],
                link: "/".into(),
                detail: None,
                expires_at: None,
            },
            user_id: None,
            created_at: None,
        }
    }
    fn service(events: Events, fail: bool) -> AttentionService {
        AttentionService::new(
            Box::new(Transport { events, fail }),
            Some(Box::new(|_| Ok(Some("owner".into())))),
            Box::new(|| "now".into()),
            Box::new(|_| panic!("no async sinks registered")),
        )
    }
    #[test]
    fn identity_replacement_preserves_order_and_isolates_users() {
        let mut service = service(Arc::default(), false);
        service
            .raise(input(AttentionKind::Consent, "same"))
            .unwrap();
        let mut other = input(AttentionKind::Question, "same");
        other.user_id = Some("other".into());
        service.raise(other).unwrap();
        let mut replacement = input(AttentionKind::Consent, "same");
        replacement.data.title = "changed".into();
        service.raise(replacement).unwrap();
        let items = service.list(None);
        assert_eq!(items.len(), 2);
        assert_eq!(items[0].data.title, "changed");
        assert_eq!(items[0].key, "consent:same");
        assert_eq!(items[1].key, "question:same");
        assert_eq!(service.list(Some("owner")).len(), 1);
        assert_eq!(service.list(Some("")).len(), 2);
        assert_eq!(service.get("consent:same").unwrap().data.title, "changed");
        assert!(service.get("missing").is_none());
    }
    #[test]
    fn clear_revokes_once_and_uses_existing_owner_and_device() {
        let events = Events::default();
        let mut service = service(events.clone(), false);
        service.raise(input(AttentionKind::Question, "q")).unwrap();
        let before = events.lock().unwrap().len();
        let cleared = service
            .clear(
                AttentionKind::Question,
                "q",
                AttentionClearedReason::Answered,
                Some("watch"),
            )
            .unwrap()
            .unwrap();
        assert_eq!(cleared.user_id.as_deref(), Some("owner"));
        assert_eq!(cleared.resolved_by.as_deref(), Some("watch"));
        assert!(service.list(None).is_empty());
        assert_eq!(events.lock().unwrap().len(), before + 1);
        assert!(
            service
                .clear(
                    AttentionKind::Question,
                    "q",
                    AttentionClearedReason::Timeout,
                    None
                )
                .unwrap()
                .is_none()
        );
        assert_eq!(events.lock().unwrap().len(), before + 1);
        let events = events.lock().unwrap();
        assert_eq!(events[0]["web"]["payload"]["native"], false);
        assert_eq!(events[0]["desktop"]["payload"]["native"], true);
        assert_eq!(events.last().unwrap()["user"], "owner");
    }
    #[test]
    fn failed_broadcast_keeps_the_raised_item_without_sink_delivery() {
        let mut service = service(Events::default(), true);
        assert!(service.raise(input(AttentionKind::Consent, "r")).is_err());
        assert_eq!(service.list(None).len(), 1);
    }
    struct Sink {
        id: &'static str,
        events: Events,
        mode: &'static str,
    }
    impl Sink {
        fn deliver(&self) -> SinkResult {
            self.events.lock().unwrap().push(json!(self.id));
            match self.mode {
                "throw" => Err("fail".into()),
                "reject" => Ok(Some(Box::pin(async { Err("fail".into()) }))),
                _ => Ok(None),
            }
        }
    }
    impl AttentionSink for Sink {
        fn raised(&self, _: &AttentionItem) -> SinkResult {
            self.deliver()
        }
        fn cleared(&self, _: &AttentionCleared) -> SinkResult {
            self.deliver()
        }
    }
    #[tokio::test]
    async fn failed_sinks_cannot_block_later_delivery_and_duplicates_unsubscribe_by_identity() {
        let events = Events::default();
        let mut service = service(Events::default(), false);
        let pending = Rc::new(RefCell::new(vec![]));
        let shared = pending.clone();
        service.spawn = Box::new(move |future| shared.borrow_mut().push(future));
        service.add_sink(Arc::new(Sink {
            id: "bad",
            events: events.clone(),
            mode: "throw",
        }));
        service.add_sink(Arc::new(Sink {
            id: "async",
            events: events.clone(),
            mode: "reject",
        }));
        let good: Arc<dyn AttentionSink> = Arc::new(Sink {
            id: "good",
            events: events.clone(),
            mode: "ok",
        });
        service.add_sink(good.clone());
        let second = service.add_sink(good);
        service.raise(input(AttentionKind::Consent, "r")).unwrap();
        assert_eq!(
            *events.lock().unwrap(),
            vec![json!("bad"), json!("async"), json!("good"), json!("good")]
        );
        service.remove_sink(&second);
        service.remove_sink(&second);
        service.remove_sink(&second);
        service
            .clear(
                AttentionKind::Consent,
                "r",
                AttentionClearedReason::Cancelled,
                None,
            )
            .unwrap();
        assert_eq!(
            events
                .lock()
                .unwrap()
                .iter()
                .filter(|v| **v == "good")
                .count(),
            2
        );
        let tasks = std::mem::take(&mut *pending.borrow_mut());
        assert_eq!(tasks.len(), 2);
        for future in tasks {
            assert!(future.await.is_ok());
        }
    }
    #[test]
    fn native_surface_policy_and_question_action_limits() {
        assert!(!should_notify_natively("web", &["desktop".into()]));
        assert!(should_notify_natively("watch", &["desktop".into()]));
        assert!(should_notify_natively("web", &[]));
        let mut question = AttentionQuestion {
            id: "q".into(),
            options: Some(
                (0..5)
                    .map(|i| QuestionOption {
                        label: i.to_string(),
                    })
                    .collect(),
            ),
            multi_select: false,
            allow_freeform_input: true,
        };
        let actions = attention_actions_for_question(&[question.clone()]);
        assert_eq!(actions.len(), 3);
        assert_eq!(actions[2].id, "q:2");
        question.multi_select = true;
        assert_eq!(
            attention_actions_for_question(&[question.clone()])[0].kind,
            AttentionActionKind::Reply
        );
        assert!(attention_actions_for_question(&[question.clone(), question]).is_empty());
        assert_eq!(consent_attention_actions()[2].id, "approve-all");
    }
}
