//! Native screen-share state. Capture, signaling, and input remain host effects.

#[cfg(test)]
mod empty_chat_tests {
    use super::*;

    #[test]
    fn node_lookup_uses_insertion_order_and_skips_stopped_sessions() {
        let mut service = ScreenShareService::default();
        service.register_device(json!({"id":"host","name":"host","platform":"desktop","authorized":true,"capabilities":[]}));
        let first = service.start_with_options("host", None, StartOptions { node_id: Some("node".into()), ..Default::default() }).unwrap();
        let second = service.start_with_options("host", None, StartOptions { node_id: Some("node".into()), ..Default::default() }).unwrap();
        assert_eq!(service.node_session("node").unwrap()["id"], first["id"]);
        service.stop_session(first["id"].as_str());
        assert_eq!(service.node_session("node").unwrap()["id"], second["id"]);
    }

    #[test]
    fn pending_join_does_not_approve_or_enable_handoff() {
        let mut service = ScreenShareService::default();
        for id in ["host", "viewer"] {
            service.register_device(json!({"id":id,"name":id,"platform":"desktop","authorized":true,"capabilities":[]}));
        }
        let session = service.start_with_options("host", None, StartOptions {
            chat_id: Some("chat".into()),
            initiated_by_agent: true,
            require_consent: true,
            ..Default::default()
        }).unwrap();
        let id = session["id"].as_str().unwrap();
        let joined = service.add_viewer(id, "viewer").unwrap();
        assert_eq!(joined["pendingApproval"], true);
        assert_eq!(joined["viewers"].as_array().unwrap().len(), 1);
        let again = service.add_viewer(id, "viewer").unwrap();
        assert_eq!(joined, again);
        assert!(service.handoff(id, "agent").is_err());
        let approved = service.approve(id, true).unwrap();
        assert_eq!(approved["pendingApproval"], false);
        assert!(service.handoff(id, "agent").is_ok());
    }

    #[test]
    fn empty_chat_uses_global_active_session() {
        let mut service = ScreenShareService::default();
        service.register_device(json!({"id":"host","name":"host","platform":"desktop","authorized":true,"capabilities":[]}));
        let session = service.start_with_options("host", None, StartOptions {
            chat_id: Some(String::new()),
            ..Default::default()
        }).unwrap();
        assert_eq!(session["chatId"], "");
        assert_eq!(service.state()["activeSession"]["id"], session["id"]);
        assert!(service.chat_session("").is_none());
        assert_eq!(service.stop_session(None)["id"], session["id"]);
    }
}
use serde_json::{Value, json};
use std::collections::HashMap;

#[derive(Default)]
pub struct ScreenShareService {
    devices: Vec<Value>,
    active: Option<Value>,
    sessions: HashMap<String, Value>,
    session_order: Vec<String>,
    chats: HashMap<String, String>,
}

#[derive(Default)]
pub struct StartOptions {
    pub chat_id: Option<String>,
    pub node_id: Option<String>,
    pub initiated_by_agent: bool,
    pub require_consent: bool,
    pub reason: Option<String>,
}

fn now() -> String {
    crate::time::iso(chrono::Utc::now().timestamp_millis()).expect("current timestamp")
}
impl ScreenShareService {
    pub fn register_device(&mut self, mut device: Value) -> Value {
        let timestamp = now();
        let old = self.devices.iter().position(|d| d["id"] == device["id"]);
        device["connectedAt"] = old
            .map(|i| self.devices[i]["connectedAt"].clone())
            .unwrap_or(json!(timestamp));
        device["lastSeenAt"] = json!(timestamp);
        if let Some(index) = old {
            self.devices[index] = device.clone();
        } else {
            self.devices.push(device.clone());
        }
        device
    }
    pub fn state(&self) -> Value {
        json!({"devices":self.devices,"activeSession":self.active})
    }
    pub fn session(&self, id: &str) -> Option<Value> {
        self.sessions.get(id).cloned()
    }
    pub fn chat_session(&self, chat: &str) -> Option<Value> {
        self.chats
            .get(chat)
            .and_then(|id| self.sessions.get(id))
            .filter(|s| s["status"] != "idle")
            .cloned()
    }
    /// Find the earliest still-live share for a node, matching the reference
    /// Map's insertion order when multiple shares belong to the same node.
    pub fn node_session(&self, node: &str) -> Option<Value> {
        self.session_order.iter()
            .filter_map(|id| self.sessions.get(id))
            .find(|session| session["nodeId"] == node && session["status"] != "idle")
            .cloned()
    }
    fn save(&mut self, session: Value) -> Value {
        let id = session["id"].as_str().expect("native id").to_owned();
        if self.active.as_ref().is_some_and(|s| s["id"] == id) {
            self.active = Some(session.clone());
        }
        self.sessions.insert(id, session.clone());
        session
    }
    pub fn start(&mut self, host: &str, viewers: Option<&[String]>) -> Result<Value, String> {
        self.start_with_options(host, viewers, StartOptions::default())
    }
    pub fn start_with_options(
        &mut self,
        host: &str,
        viewers: Option<&[String]>,
        options: StartOptions,
    ) -> Result<Value, String> {
        let device = self
            .devices
            .iter()
            .find(|d| d["id"] == host && d["authorized"] == true)
            .ok_or("Host device is not registered or authorized.")?;
        let remote_input = device["capabilities"]
            .as_array()
            .is_some_and(|caps| caps.iter().any(|cap| cap == "remote-input"));
        let host = device["id"].clone();
        let viewers: Vec<Value> = viewers.unwrap_or_default().iter().filter_map(|id| {
            self.devices.iter().find(|d| d["id"] == *id && d["authorized"] == true).map(|d|
                json!({"deviceId":d["id"],"connectedAt":now(),"canControl":d["platform"]!="web","transportMode":"p2p","latencyMs":45}))
        }).collect();
        let controller = viewers
            .iter()
            .find(|v| v["canControl"] == true)
            .map(|v| v["deviceId"].clone())
            .unwrap_or(Value::Null);
        if let Some(chat) = options.chat_id.as_deref().filter(|chat| !chat.is_empty())
            && let Some(id) = self.chats.get(chat).cloned()
            && let Some(mut old) = self.session(&id)
        {
            old["status"] = json!("idle");
            old["updatedAt"] = json!(now());
            self.save(old);
        }
        let session = json!({"id":uuid::Uuid::new_v4().to_string(),"status":"sharing","hostDeviceId":host,"controllerDeviceId":controller,"viewers":viewers,
            "capabilities":{"remoteInput":remote_input,"recording":true,"turnRelay":true,"adaptiveStreaming":true},
            "transport":{"iceConnectionState":if viewers.is_empty(){"checking"}else{"connected"},"routeMode":"p2p","avgLatencyMs":if viewers.is_empty(){0}else{45},"relayActive":false},"updatedAt":now(),
            "chatId":options.chat_id,"nodeId":options.node_id,"initiatedBy":if options.initiated_by_agent {"agent"} else {"user"},
            "controlOwner":if options.initiated_by_agent {"agent"} else {"user"},
            "pendingApproval":options.require_consent,"reason":options.reason});
        let id = session["id"].as_str().expect("native id").to_owned();
        if let Some(chat) = session["chatId"].as_str().filter(|chat| !chat.is_empty()) {
            self.chats.insert(chat.to_owned(), id.clone());
        } else {
            self.active = Some(session.clone());
        }
        self.session_order.push(id.clone());
        self.sessions.insert(id, session.clone());
        Ok(session)
    }
    pub fn add_viewer(&mut self, id: &str, device_id: &str) -> Result<Value, String> {
        let mut session = self.session(id).ok_or("Unknown share session.")?;
        if session["status"] == "idle" {
            return Err("This share has already ended.".into());
        }
        if session["hostDeviceId"] == device_id {
            return Err("The sharing device cannot also join as a viewer.".into());
        }
        let device = self
            .devices
            .iter()
            .find(|d| d["id"] == device_id && d["authorized"] == true)
            .ok_or("Viewer device is not registered or authorized.")?;
        let viewers = session["viewers"].as_array_mut().expect("native viewers");
        if viewers.iter().any(|v| v["deviceId"] == device_id) {
            return Ok(session);
        }
        viewers.push(json!({"deviceId":device_id,"connectedAt":now(),"canControl":device["platform"]!="web","transportMode":"p2p","latencyMs":45}));
        session["transport"]["iceConnectionState"] = json!("connected");
        session["updatedAt"] = json!(now());
        // The TS service updates the session map, not its legacy global state, here.
        self.sessions.insert(id.to_owned(), session.clone());
        Ok(session)
    }
    /// Remove one viewer while keeping the host capture and other peers alive.
    pub fn remove_viewer(&mut self, id: &str, device_id: &str) -> Result<Value, String> {
        let mut session = self.session(id).ok_or("Unknown active share session.")?;
        if session["status"] == "idle" {
            return Err("Unknown active share session.".into());
        }
        if session["hostDeviceId"] == device_id {
            return Err("The host cannot leave as a viewer.".into());
        }
        let viewers = session["viewers"].as_array_mut().expect("native viewers");
        if !viewers.iter().any(|viewer| viewer["deviceId"] == device_id) {
            return Ok(session);
        }
        viewers.retain(|viewer| viewer["deviceId"] != device_id);
        if session["controllerDeviceId"] == device_id {
            session["controllerDeviceId"] = Value::Null;
        }
        session["updatedAt"] = json!(now());
        Ok(self.save(session))
    }
    pub fn stop(&mut self) -> Value {
        self.stop_session(None)
    }
    pub fn stop_session(&mut self, id: Option<&str>) -> Value {
        let Some(mut session) = id.and_then(|id| self.session(id)).or_else(|| {
            if id.is_none() {
                self.active.clone()
            } else {
                None
            }
        }) else {
            return Value::Null;
        };
        session["status"] = json!("idle");
        session["updatedAt"] = json!(now());
        if let Some(chat) = session["chatId"].as_str()
            && self.chats.get(chat).is_some_and(|id| session["id"] == *id)
        {
            self.chats.remove(chat);
        }
        self.save(session)
    }
    pub fn approve(&mut self, id: &str, approved: bool) -> Result<Value, String> {
        let mut session = self.session(id).ok_or("Unknown share session.")?;
        if session["status"] != "sharing" || (!approved && session["pendingApproval"] != true) {
            return Err("Screen share approval is no longer pending.".into());
        }
        session["pendingApproval"] = json!(false);
        session["status"] = json!(if approved { "sharing" } else { "idle" });
        session["updatedAt"] = json!(now());
        if !approved
            && let Some(chat) = session["chatId"].as_str()
            && self.chats.get(chat).is_some_and(|current| current == id)
        {
            self.chats.remove(chat);
        }
        Ok(self.save(session))
    }
    pub fn handoff(&mut self, id: &str, owner: &str) -> Result<Value, String> {
        let mut session = self.session(id).ok_or("Unknown share session.")?;
        if session["status"] != "sharing" || session["pendingApproval"] == true {
            return Err("Screen share is not active and approved.".into());
        }
        session["controlOwner"] = json!(owner);
        if owner == "user" {
            session["controllerDeviceId"] = Value::Null;
        }
        session["updatedAt"] = json!(now());
        Ok(self.save(session))
    }
    pub fn transfer(&mut self, device: &str) -> Result<Value, String> {
        self.transfer_session(device, None)
    }
    pub fn transfer_session(&mut self, device: &str, id: Option<&str>) -> Result<Value, String> {
        let mut session = id
            .and_then(|id| self.session(id))
            .or_else(|| {
                if id.is_none() {
                    self.active.clone()
                } else {
                    None
                }
            })
            .filter(|s| s["status"] != "idle")
            .ok_or("No active share session.")?;
        if !session["viewers"]
            .as_array()
            .expect("native viewers")
            .iter()
            .any(|v| v["deviceId"] == device && v["canControl"] == true)
        {
            return Err("Target device is not an authorized controller for this session.".into());
        }
        session["controllerDeviceId"] = json!(device);
        session["controlOwner"] = json!("agent");
        session["updatedAt"] = json!(now());
        Ok(self.save(session))
    }
}
