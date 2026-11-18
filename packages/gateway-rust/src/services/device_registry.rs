//! Connected-device metadata, preserving first registration time and stable ties.
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
#[derive(Clone, Debug, Deserialize)]
pub struct RegisterDevice {
    pub id: String,
    pub name: String,
    pub platform: String,
    pub capabilities: Vec<String>,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceInfo {
    pub id: String,
    pub name: String,
    pub platform: String,
    pub capabilities: Vec<String>,
    pub connected_at: String,
    pub last_seen: String,
}
#[derive(Default)]
pub struct DeviceRegistry {
    devices: HashMap<String, DeviceInfo>,
    order: Vec<String>,
}
impl DeviceRegistry {
    pub fn register(&mut self, input: RegisterDevice, now: &str) -> DeviceInfo {
        let existing = self.devices.get(&input.id);
        let mut seen = HashSet::new();
        let capabilities = input
            .capabilities
            .into_iter()
            .filter(|v| seen.insert(v.clone()))
            .collect();
        let next = DeviceInfo {
            id: input.id,
            name: input.name,
            platform: input.platform,
            capabilities,
            connected_at: existing
                .map(|v| v.connected_at.clone())
                .unwrap_or_else(|| now.into()),
            last_seen: now.into(),
        };
        if existing.is_none() {
            self.order.push(next.id.clone());
        }
        self.devices.insert(next.id.clone(), next.clone());
        next
    }
    pub fn heartbeat(&mut self, id: &str, now: &str) -> Option<DeviceInfo> {
        let device = self.devices.get_mut(id)?;
        device.last_seen = now.into();
        Some(device.clone())
    }
    pub fn list(&self) -> Vec<DeviceInfo> {
        let mut devices = self
            .order
            .iter()
            .filter_map(|id| self.devices.get(id).cloned())
            .collect::<Vec<_>>();
        devices.sort_by(|a, b| b.last_seen.cmp(&a.last_seen));
        devices
    }
    pub fn count(&self) -> usize {
        self.devices.len()
    }
}
