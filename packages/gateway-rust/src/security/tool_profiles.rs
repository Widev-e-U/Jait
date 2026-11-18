//! Ordered profile maps with shared permission identity, matching JS Map behavior.
//! Selecting a profile is not execution authorization; policy/scope checks still apply.
use super::tool_permissions::ToolPermission;
use serde::{Deserialize, Serialize, Serializer};
use std::sync::{Arc, LazyLock, Mutex};
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ProfileName {
    Minimal,
    Coding,
    Full,
}
impl ProfileName {
    pub fn parse(name: &str) -> Result<Self, String> {
        match name {
            "minimal" => Ok(Self::Minimal),
            "coding" => Ok(Self::Coding),
            "full" => Ok(Self::Full),
            _ => Err(format!("Unknown profile: {name}")),
        }
    }
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Minimal => "minimal",
            Self::Coding => "coding",
            Self::Full => "full",
        }
    }
}
#[derive(Clone, Debug)]
pub struct SharedPermission(pub Arc<Mutex<ToolPermission>>);
impl SharedPermission {
    pub fn new(permission: ToolPermission) -> Self {
        Self(Arc::new(Mutex::new(permission)))
    }
    pub fn snapshot(&self) -> ToolPermission {
        self.0.lock().unwrap().clone()
    }
}
impl Serialize for SharedPermission {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        self.0.lock().unwrap().serialize(serializer)
    }
}
#[derive(Clone, Debug, Default)]
pub struct ProfileMap {
    entries: Vec<(String, SharedPermission)>,
}
impl ProfileMap {
    pub fn entries(&self) -> &[(String, SharedPermission)] {
        &self.entries
    }
    pub fn get(&self, name: &str) -> Option<SharedPermission> {
        self.entries
            .iter()
            .find(|(key, _)| key == name)
            .map(|(_, value)| value.clone())
    }
    pub fn insert(&mut self, name: String, permission: SharedPermission) {
        if let Some((_, entry)) = self.entries.iter_mut().find(|(key, _)| key == &name) {
            *entry = permission;
        } else {
            self.entries.push((name, permission));
        }
    }
    pub fn remove(&mut self, name: &str) -> bool {
        if let Some(index) = self.entries.iter().position(|(key, _)| key == name) {
            self.entries.remove(index);
            true
        } else {
            false
        }
    }
    pub fn values(&self) -> Vec<SharedPermission> {
        self.entries
            .iter()
            .map(|(_, value)| value.clone())
            .collect()
    }
}
#[derive(Serialize)]
pub struct SerializedProfile {
    pub name: ProfileName,
    pub permissions: Vec<SharedPermission>,
}
/// A registry owns static permission identities. `get_profile` creates an independent
/// map whose values still point to those identities. Mutating one value is observable
/// by later lookups, whereas replacing/deleting a map entry is local to that map.
pub struct ProfileRegistry {
    profiles: Vec<(ProfileName, Vec<SharedPermission>)>,
}
impl Default for ProfileRegistry {
    fn default() -> Self {
        let assets: serde_json::Map<String, serde_json::Value> =
            serde_json::from_str(include_str!("tool-profile-assets.json"))
                .expect("reviewed tool profiles");
        Self {
            profiles: list_profiles()
                .into_iter()
                .map(|name| {
                    let permissions: Vec<ToolPermission> =
                        serde_json::from_value(assets[name.as_str()].clone())
                            .expect("typed profile permissions");
                    (
                        name,
                        permissions.into_iter().map(SharedPermission::new).collect(),
                    )
                })
                .collect(),
        }
    }
}
impl ProfileRegistry {
    pub fn get_profile(&self, name: &str) -> Result<ProfileMap, String> {
        let name = ProfileName::parse(name)?;
        let permissions = &self
            .profiles
            .iter()
            .find(|(key, _)| *key == name)
            .expect("profile catalogue")
            .1;
        let mut map = ProfileMap::default();
        for permission in permissions {
            map.insert(permission.snapshot().tool_name, permission.clone());
        }
        Ok(map)
    }
    pub fn extend_profile(
        &self,
        base: &str,
        overrides: &[SharedPermission],
    ) -> Result<ProfileMap, String> {
        let mut map = self.get_profile(base)?;
        for permission in overrides {
            map.insert(permission.snapshot().tool_name, permission.clone());
        }
        Ok(map)
    }
    pub fn serialize_profile(&self, name: &str) -> Result<SerializedProfile, String> {
        Ok(SerializedProfile {
            name: ProfileName::parse(name)?,
            permissions: self.get_profile(name)?.values(),
        })
    }
}
static PROFILES: LazyLock<ProfileRegistry> = LazyLock::new(ProfileRegistry::default);
pub fn list_profiles() -> Vec<ProfileName> {
    vec![ProfileName::Minimal, ProfileName::Coding, ProfileName::Full]
}
pub fn get_profile(name: &str) -> Result<ProfileMap, String> {
    PROFILES.get_profile(name)
}
pub fn extend_profile(base: &str, overrides: &[SharedPermission]) -> Result<ProfileMap, String> {
    PROFILES.extend_profile(base, overrides)
}
pub fn serialize_profile(name: &str) -> Result<SerializedProfile, String> {
    PROFILES.serialize_profile(name)
}
