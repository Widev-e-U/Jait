//! Synchronous wait registry. Callback delivery follows committed state changes.
use crate::contracts::bounded_json::Utf16Text;
use icu_collator::{Collator, CollatorBorrowed, options::CollatorOptions};
use serde::{Deserialize, Serialize};
use std::{cell::RefCell, rc::Rc};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SessionWaitKind {
    Question,
    Consent,
    Secret,
    Browser,
    Terminal,
    Background,
}
pub fn session_wait_label(kind: SessionWaitKind) -> &'static str {
    match kind {
        SessionWaitKind::Question => "Waiting for your answer",
        SessionWaitKind::Consent => "Waiting for approval",
        SessionWaitKind::Secret => "Waiting for a secret",
        SessionWaitKind::Browser => "Paused — you have browser control",
        SessionWaitKind::Terminal => "Waiting for terminal input",
        SessionWaitKind::Background => "Waiting for a background command",
    }
}
pub const BLOCKING_SESSION_WAIT_KINDS: [SessionWaitKind; 5] = [
    SessionWaitKind::Question,
    SessionWaitKind::Consent,
    SessionWaitKind::Secret,
    SessionWaitKind::Browser,
    SessionWaitKind::Terminal,
];
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionWait {
    pub key: Utf16Text,
    pub kind: SessionWaitKind,
    pub session_id: Utf16Text,
    pub label: Utf16Text,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<Utf16Text>,
    pub blocking: bool,
}
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RaiseSessionWaitInput {
    pub key: Utf16Text,
    pub kind: SessionWaitKind,
    pub session_id: Utf16Text,
    pub label: Option<Utf16Text>,
    pub detail: Option<Utf16Text>,
    pub blocking: Option<bool>,
}
/// Returned records retain identity, as do the reference's get/list/snapshot APIs.
pub type WaitHandle = Rc<RefCell<SessionWait>>;
#[derive(Clone)]
pub struct SessionWaitChange {
    pub session_id: Utf16Text,
    pub waits: Vec<WaitHandle>,
}
pub type SessionWaitChangeHandle = Rc<RefCell<SessionWaitChange>>;
pub type SessionWaitBroadcaster = Rc<dyn Fn(SessionWaitChangeHandle) -> Result<(), String>>;
pub type SessionWaitUnsubscribe = Rc<dyn Fn()>;
#[derive(Default)]
struct Listeners {
    entries: Vec<Option<SessionWaitBroadcaster>>,
    emissions: usize,
}
struct Emission(Rc<RefCell<Listeners>>);
impl Drop for Emission {
    fn drop(&mut self) {
        let mut state = self.0.borrow_mut();
        state.emissions -= 1;
        if state.emissions == 0 {
            state.entries.retain(Option::is_some);
        }
    }
}
/// Use on the gateway event loop. The broadcaster can reenter after mutation.
pub struct SessionWaitService {
    waits: RefCell<Vec<(Utf16Text, WaitHandle)>>,
    broadcaster: RefCell<Option<SessionWaitBroadcaster>>,
    listeners: Rc<RefCell<Listeners>>,
    collator: CollatorBorrowed<'static>,
}
impl Default for SessionWaitService {
    fn default() -> Self {
        Self::new()
    }
}
impl SessionWaitService {
    pub fn new() -> Self {
        Self {
            waits: RefCell::new(vec![]),
            broadcaster: RefCell::new(None),
            listeners: Rc::new(RefCell::new(Listeners::default())),
            collator: Collator::try_new(Default::default(), CollatorOptions::default())
                .expect("compiled collation"),
        }
    }
    /// Matches Set callback identity, including duplicate registrations and an
    /// older unsubscribe removing a later registration of the same callback.
    pub fn subscribe(&self, listener: SessionWaitBroadcaster) -> SessionWaitUnsubscribe {
        let mut state = self.listeners.borrow_mut();
        if !state
            .entries
            .iter()
            .flatten()
            .any(|current| Rc::ptr_eq(current, &listener))
        {
            state.entries.push(Some(listener.clone()));
        }
        let listeners = self.listeners.clone();
        Rc::new(move || {
            let mut state = listeners.borrow_mut();
            for entry in &mut state.entries {
                if entry
                    .as_ref()
                    .is_some_and(|current| Rc::ptr_eq(current, &listener))
                {
                    *entry = None;
                }
            }
            if state.emissions == 0 {
                state.entries.retain(Option::is_some);
            }
        })
    }
    pub fn set_broadcaster(&self, broadcaster: Option<SessionWaitBroadcaster>) {
        *self.broadcaster.borrow_mut() = broadcaster;
    }
    pub fn raise(&self, input: RaiseSessionWaitInput) -> Result<WaitHandle, String> {
        let next = Rc::new(RefCell::new(SessionWait {
            key: input.key,
            kind: input.kind,
            session_id: input.session_id,
            label: input
                .label
                .unwrap_or_else(|| session_wait_label(input.kind).into()),
            detail: input.detail.filter(|text| !text.0.is_empty()),
            blocking: input.blocking.unwrap_or(true),
        }));
        let changed = {
            let mut waits = self.waits.borrow_mut();
            if let Some((_, previous)) = waits.iter_mut().find(|(key, _)| *key == next.borrow().key)
            {
                // sameWait does not compare key: callers may mutate a returned record.
                let old = previous.borrow();
                let new = next.borrow();
                let changed = old.kind != new.kind
                    || old.session_id != new.session_id
                    || old.label != new.label
                    || old.detail != new.detail
                    || old.blocking != new.blocking;
                drop(old);
                drop(new);
                *previous = next.clone();
                changed
            } else {
                waits.push((next.borrow().key.clone(), next.clone()));
                true
            }
        };
        if changed {
            let session_id = next.borrow().session_id.clone();
            self.emit(&session_id)?;
        }
        Ok(next)
    }
    pub fn clear(&self, key: &Utf16Text) -> Result<bool, String> {
        let existing = {
            let mut waits = self.waits.borrow_mut();
            waits
                .iter()
                .position(|(stored, _)| stored == key)
                .map(|index| waits.remove(index).1)
        };
        if let Some(existing) = existing {
            let session_id = existing.borrow().session_id.clone();
            self.emit(&session_id)?;
            Ok(true)
        } else {
            Ok(false)
        }
    }
    pub fn clear_session(&self, session_id: &Utf16Text) -> Result<(), String> {
        let changed = {
            let mut waits = self.waits.borrow_mut();
            let before = waits.len();
            waits.retain(|(_, wait)| wait.borrow().session_id != *session_id);
            waits.len() != before
        };
        if changed {
            self.emit(session_id)?;
        }
        Ok(())
    }
    fn sorted(&self, mut waits: Vec<WaitHandle>) -> Vec<WaitHandle> {
        waits.sort_by(|a, b| {
            let a = a.borrow();
            let b = b.borrow();
            b.blocking.cmp(&a.blocking).then_with(|| {
                if a.session_id != b.session_id {
                    self.collator
                        .compare_utf16(&a.session_id.0, &b.session_id.0)
                } else {
                    self.collator.compare_utf16(&a.key.0, &b.key.0)
                }
            })
        });
        waits
    }
    pub fn list(&self, session_id: &Utf16Text) -> Vec<WaitHandle> {
        self.sorted(
            self.waits
                .borrow()
                .iter()
                .filter(|(_, wait)| wait.borrow().session_id == *session_id)
                .map(|(_, wait)| wait.clone())
                .collect(),
        )
    }
    pub fn snapshot(&self) -> Vec<WaitHandle> {
        self.sorted(
            self.waits
                .borrow()
                .iter()
                .map(|(_, wait)| wait.clone())
                .collect(),
        )
    }
    pub fn get(&self, key: &Utf16Text) -> Option<WaitHandle> {
        self.waits
            .borrow()
            .iter()
            .find(|(stored, _)| stored == key)
            .map(|(_, wait)| wait.clone())
    }
    pub fn clear_for_tests(&self) {
        self.waits.borrow_mut().clear();
        self.broadcaster.borrow_mut().take();
    }
    fn emit(&self, session_id: &Utf16Text) -> Result<(), String> {
        let change = Rc::new(RefCell::new(SessionWaitChange {
            session_id: session_id.clone(),
            waits: self.list(session_id),
        }));
        self.listeners.borrow_mut().emissions += 1;
        let _emission = Emission(self.listeners.clone());
        let broadcaster = self.broadcaster.borrow().clone();
        if let Some(broadcaster) = broadcaster {
            broadcaster(change.clone())?;
        }
        // Live Set traversal: additions are visited, deletions are skipped and
        // reentrant emissions keep outer traversal indices stable.
        let mut index = 0;
        loop {
            let next = {
                let state = self.listeners.borrow();
                if index >= state.entries.len() {
                    break;
                }
                state.entries[index].clone()
            };
            index += 1;
            if let Some(listener) = next {
                listener(change.clone())?;
            }
        }
        Ok(())
    }
}
fn prefixed_key(prefix: &str, id: &Utf16Text) -> Utf16Text {
    Utf16Text(prefix.encode_utf16().chain(id.0.iter().copied()).collect())
}
pub fn terminal_wait_key(id: &Utf16Text) -> Utf16Text {
    prefixed_key("terminal:", id)
}
pub fn browser_wait_key(id: &Utf16Text) -> Utf16Text {
    prefixed_key("browser:", id)
}
pub fn background_wait_key(id: &Utf16Text) -> Utf16Text {
    prefixed_key("background:", id)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn input(key: &str, session: &str) -> RaiseSessionWaitInput {
        RaiseSessionWaitInput {
            key: key.into(),
            kind: SessionWaitKind::Question,
            session_id: session.into(),
            label: None,
            detail: None,
            blocking: None,
        }
    }
    #[test]
    fn returned_handles_keep_identity_but_each_raise_replaces_it() {
        let service = SessionWaitService::new();
        let first = service.raise(input("key", "chat")).unwrap();
        assert!(Rc::ptr_eq(&first, &service.get(&"key".into()).unwrap()));
        assert!(Rc::ptr_eq(&first, &service.snapshot()[0]));
        first.borrow_mut().key = "mutated".into();
        assert!(service.get(&"mutated".into()).is_none());
        assert!(service.get(&"key".into()).is_some());
        let second = service.raise(input("key", "chat")).unwrap();
        assert!(!Rc::ptr_eq(&first, &second));
    }
    #[test]
    fn callbacks_reenter_committed_state_and_failure_does_not_roll_it_back() {
        let service = Rc::new(SessionWaitService::new());
        let weak = Rc::downgrade(&service);
        service.set_broadcaster(Some(Rc::new(move |change| {
            let change = change.borrow();
            let service = weak.upgrade().unwrap();
            assert_eq!(service.list(&change.session_id).len(), 1);
            change.waits[0].borrow_mut().label = "changed during callback".into();
            service.set_broadcaster(None);
            service.clear(&"key".into()).unwrap();
            Err("delivery failed".into())
        })));
        assert_eq!(
            service.raise(input("key", "chat")).unwrap_err(),
            "delivery failed"
        );
        assert!(service.snapshot().is_empty());
        service.set_broadcaster(Some(Rc::new(|_| Err("delivery failed".into()))));
        assert!(service.raise(input("key", "chat")).is_err());
        assert!(service.get(&"key".into()).is_some());
        assert!(service.clear(&"key".into()).is_err());
        assert!(service.snapshot().is_empty());
    }
    #[test]
    fn utf16_keys_survive_helpers_and_records() {
        let id = Utf16Text(vec![0xd800]);
        assert_eq!(terminal_wait_key(&id).0.last(), Some(&0xd800));
        let service = SessionWaitService::new();
        let mut call = input("key", "chat");
        call.key = id.clone();
        call.label = Some(id.clone());
        let wait = service.raise(call).unwrap();
        let wire = serde_json::to_string(&*wait.borrow()).unwrap();
        assert!(wire.contains("\\ud800"));
        assert!(service.clear(&id).unwrap());
    }
}
