//! Completion-notification identity and read state. Preview text is never retained.
use super::json_state::SessionStateService;
use serde_json::{Value, json};

const KEY: &str = "notification.completion";
pub struct ChatNotificationsService<'a> {
    storage: Option<SessionStateService<'a>>,
    fallback: Vec<(String, Value)>,
}
fn parse(value: &Value, session: &str) -> Option<Value> {
    let user = value["userId"].as_str().filter(|s| !s.is_empty())?;
    let state = &value["state"];
    let id = state["id"]
        .as_str()
        .filter(|s| !s.is_empty() && s.encode_utf16().count() <= 512)?;
    if state["sessionId"].as_str() != Some(session)
        || state["replaceId"].as_str() != Some(format!("chat-complete:{session}").as_str())
    {
        return None;
    }
    let read = state["read"].as_bool()?;
    Some(json!({"userId":user,"state":{"id":id,"sessionId":session,
        "replaceId":format!("chat-complete:{session}"),"read":read}}))
}
impl<'a> ChatNotificationsService<'a> {
    pub fn new(storage: Option<SessionStateService<'a>>) -> Self {
        Self {
            storage,
            fallback: vec![],
        }
    }
    pub fn get(&self, session: &str) -> rusqlite::Result<Option<Value>> {
        match &self.storage {
            Some(storage) => {
                let entries = storage.get(session, Some(&[KEY.into()]))?;
                Ok(entries.get(KEY).and_then(|v| parse(v, session)))
            }
            None => Ok(self
                .fallback
                .iter()
                .find(|(id, _)| id == session)
                .map(|(_, v)| v.clone())),
        }
    }
    pub fn list(&self, user: &str) -> rusqlite::Result<Vec<Value>> {
        let entries = match &self.storage {
            Some(storage) => storage
                .get_by_key(KEY)?
                .into_iter()
                .filter_map(|row| parse(&row["value"], row["sessionId"].as_str()?))
                .collect(),
            None => self
                .fallback
                .iter()
                .map(|(_, v)| v.clone())
                .collect::<Vec<_>>(),
        };
        Ok(entries
            .into_iter()
            .filter(|entry| entry["userId"].as_str() == Some(user))
            .map(|entry| entry["state"].clone())
            .collect())
    }
    pub fn set(&mut self, user: &str, state: &Value) -> rusqlite::Result<()> {
        let Some(session) = state["sessionId"].as_str() else {
            return Ok(());
        };
        let Some(entry) = parse(&json!({"userId":user,"state":state}), session) else {
            return Ok(());
        };
        if let Some(storage) = &self.storage {
            storage.set(session, json!({KEY:entry}).as_object().unwrap())?;
        } else {
            self.fallback.retain(|(id, _)| id != session);
            self.fallback.push((session.into(), entry));
            if self.fallback.len() > 2048 {
                self.fallback.remove(0);
            }
        }
        Ok(())
    }
}
