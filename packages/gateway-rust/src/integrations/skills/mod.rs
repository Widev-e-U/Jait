//! Native skill discovery and registry. Filesystem entrypoints are synchronous:
//! hosts must admit them through the shared BlockingLane, never a session mutex.
mod filesystem;
pub mod install;

use crate::execution::process_runner::ProcessCancellation;
use crate::tools::skill_discovery::{InstalledSkill, SkillLookup};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::{HashMap, HashSet},
    path::{Path, PathBuf},
};

pub type SkillResult<T> = Result<T, String>;
pub const MAX_SKILL_BYTES: usize = 1024 * 1024;
pub const MAX_SKILLS: usize = 4096;
pub const MAX_REGISTRY_BYTES: usize = 32 * 1024 * 1024;

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct SkillInstallSpec {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kind: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub package: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bins: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillRequirements {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bins: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub any_bins: Option<Vec<String>>,
}
#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum SkillSource {
    Bundled,
    User,
    Project,
    Plugin,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Skill {
    pub id: String,
    pub name: String,
    pub description: String,
    pub file_path: PathBuf,
    pub source: SkillSource,
    pub enabled: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub requires: Option<SkillRequirements>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub install: Option<Vec<SkillInstallSpec>>,
}
#[derive(Clone, Debug, Default, Serialize)]
pub struct SkillFrontmatter {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub homepage: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub requires: Option<SkillRequirements>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub install: Option<Vec<SkillInstallSpec>>,
}
// Conservative token check before YAML deserialization. It deliberately also
// rejects marker-looking tokens inside quoted values: parsing those via the
// scalar fallback is preferable to letting untrusted aliases expand unchecked.
fn has_yaml_alias_or_tag(block: &str) -> bool {
    let mut previous = b' ';
    for b in block.bytes() {
        let boundary = previous.is_ascii_whitespace() || b"[{,]}:?-".contains(&previous);
        if boundary && matches!(b, b'&' | b'*' | b'!') {
            return true;
        }
        previous = b;
    }
    false
}

fn strings(value: &Value) -> Option<Vec<String>> {
    let result: Vec<_> = value
        .as_array()?
        .iter()
        .filter_map(Value::as_str)
        .map(crate::text::js_trim)
        .filter(|s| !s.is_empty())
        .map(str::to_owned)
        .collect();
    (!result.is_empty()).then_some(result)
}
fn tool_metadata(
    value: &Value,
    depth: usize,
) -> (Option<SkillRequirements>, Option<Vec<SkillInstallSpec>>) {
    if depth > 4 {
        return (None, None);
    }
    let mut requires = value.get("requires").and_then(|r| {
        let bins = strings(&r["bins"]);
        let any_bins = strings(&r["anyBins"]);
        (bins.is_some() || any_bins.is_some()).then_some(SkillRequirements { bins, any_bins })
    });
    let mut install = value
        .get("install")
        .and_then(Value::as_array)
        .map(|specs| {
            specs
                .iter()
                .filter(|s| s.is_object() || s.is_array())
                .map(|s| SkillInstallSpec {
                    id: s["id"].as_str().map(str::to_owned),
                    kind: s["kind"].as_str().map(str::to_owned),
                    package: s["package"].as_str().map(str::to_owned),
                    bins: strings(&s["bins"]),
                    label: s["label"].as_str().map(str::to_owned),
                })
                .collect::<Vec<_>>()
        })
        .filter(|s| !s.is_empty());
    let values: Vec<&Value> = match value {
        Value::Object(o) => o.values().collect(),
        Value::Array(a) => a.iter().collect(),
        _ => vec![],
    };
    for nested in values {
        if requires.is_some() && install.is_some() {
            break;
        }
        let (r, i) = tool_metadata(nested, depth + 1);
        if requires.is_none() {
            requires = r;
        }
        if install.is_none() {
            install = i;
        }
    }
    (requires, install)
}
/// Real YAML first, then the reference's top-level scalar fallback. Input and
/// expanded YAML output are bounded; malformed/recursive YAML cannot escape this API.
pub fn parse_frontmatter(content: &str) -> SkillResult<SkillFrontmatter> {
    if content.len() > MAX_SKILL_BYTES {
        return Err("Skill document exceeds byte budget".into());
    }
    let Some(rest) = content
        .strip_prefix("---\r\n")
        .or_else(|| content.strip_prefix("---\n"))
    else {
        return Ok(SkillFrontmatter::default());
    };
    let Some(end) = rest.find("\n---") else {
        return Ok(SkillFrontmatter::default());
    };
    let block = rest[..end].trim_end_matches('\r');
    // YAML alias expansion is not needed for skill metadata. Reject aliases/tags
    // before parsing to avoid expansion work driven by untrusted markdown.
    let restricted = has_yaml_alias_or_tag(block);
    if !restricted && let Ok(parsed) = serde_yaml::from_str::<Value>(block) {
        let (requires, install) = tool_metadata(&parsed, 0);
        let result = SkillFrontmatter {
            name: parsed["name"].as_str().map(str::to_owned),
            description: parsed["description"].as_str().map(str::to_owned),
            homepage: parsed["homepage"].as_str().map(str::to_owned),
            metadata: parsed
                .get("metadata")
                .filter(|v| v.is_object() || v.is_array())
                .cloned(),
            requires,
            install,
        };
        if result.name.as_ref().is_some_and(|s| !s.is_empty())
            && result.description.as_ref().is_some_and(|s| !s.is_empty())
        {
            return Ok(result);
        }
    }
    let re = regex::Regex::new(r#"^(\w+):\s*"?(.+?)"?\s*$"#).map_err(|e| e.to_string())?;
    let mut result = SkillFrontmatter::default();
    for line in block.lines() {
        if let Some(c) = re.captures(line) {
            let v = Some(c[2].to_owned());
            match &c[1] {
                "name" => result.name = v,
                "description" => result.description = v,
                "homepage" => result.homepage = v,
                _ => {}
            }
        }
    }
    Ok(result)
}

pub fn user_skills_dir(home: &Path, configured_state: Option<&str>) -> SkillResult<PathBuf> {
    crate::state_directory::state_directory(home, configured_state)
        .map(|p| p.join("skills"))
        .map_err(|e| e.to_string())
}
pub fn scan_skill_dir(
    root: &Path,
    source: SkillSource,
    cancel: &ProcessCancellation,
) -> SkillResult<Vec<Skill>> {
    cancelled(cancel)?;
    let directory = match filesystem::Directory::open(root) {
        Ok(d) => d,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(vec![]),
        Err(e) => return Err(e.to_string()),
    };
    let mut skills = Vec::new();
    for name in directory.names(MAX_SKILLS).map_err(|e| e.to_string())? {
        cancelled(cancel)?;
        if name.starts_with('.') {
            continue;
        }
        let Ok(child) = directory.child(&name, false) else {
            continue;
        };
        let Ok(content) = child.read("SKILL.md", MAX_SKILL_BYTES) else {
            continue;
        };
        let Ok(content) = std::str::from_utf8(&content) else {
            continue;
        };
        let Ok(fm) = parse_frontmatter(content) else {
            continue;
        };
        let (Some(name_value), Some(description)) = (fm.name, fm.description) else {
            continue;
        };
        if name_value.is_empty() || description.is_empty() {
            continue;
        }
        skills.push(Skill {
            id: name.clone(),
            name: name_value,
            description,
            file_path: root.join(&name).join("SKILL.md"),
            source,
            enabled: true,
            requires: fm.requires,
            install: fm.install,
        });
    }
    Ok(skills)
}
pub(crate) fn cancelled(cancel: &ProcessCancellation) -> SkillResult<()> {
    if cancel.is_cancelled() {
        Err("Skill operation cancelled".into())
    } else {
        Ok(())
    }
}

/// Insertion order is retained when later sources override existing IDs.
#[derive(Clone, Default)]
pub struct SkillRegistry {
    skills: Vec<Skill>,
    bytes: usize,
}
impl SkillRegistry {
    pub fn discover(
        &mut self,
        dirs: &[(PathBuf, SkillSource)],
        cancel: &ProcessCancellation,
    ) -> SkillResult<()> {
        // Publish only a complete scan, so cancellation cannot partially refresh a registry.
        let mut updated = self.clone();
        for (path, source) in dirs {
            for skill in scan_skill_dir(path, *source, cancel)? {
                updated.add(skill)?;
            }
        }
        cancelled(cancel)?;
        *self = updated;
        Ok(())
    }
    pub fn add(&mut self, skill: Skill) -> SkillResult<()> {
        let bytes = skill_weight(&skill)?;
        let index = self.skills.iter().position(|s| s.id == skill.id);
        let replaced = index
            .map(|i| skill_weight(&self.skills[i]))
            .transpose()?
            .unwrap_or(0);
        let updated = self.bytes - replaced + bytes;
        if updated > MAX_REGISTRY_BYTES || (index.is_none() && self.skills.len() == MAX_SKILLS) {
            return Err("Skill registry capacity exceeded".into());
        }
        if let Some(i) = index {
            self.skills[i] = skill;
        } else {
            self.skills.push(skill);
        }
        self.bytes = updated;
        Ok(())
    }
    pub fn list(&self) -> &[Skill] {
        &self.skills
    }
    pub fn list_enabled(&self) -> Vec<&Skill> {
        self.skills.iter().filter(|s| s.enabled).collect()
    }
    pub fn get(&self, id: &str) -> Option<&Skill> {
        self.skills.iter().find(|s| s.id == id)
    }
    pub fn remove(&mut self, id: &str) {
        if let Some(index) = self.skills.iter().position(|s| s.id == id) {
            self.bytes -= skill_weight(&self.skills[index]).unwrap_or(0);
            self.skills.remove(index);
        }
    }
    pub fn set_enabled(&mut self, id: &str, enabled: bool) {
        if let Some(s) = self.skills.iter_mut().find(|s| s.id == id) {
            s.enabled = enabled;
        }
    }
    pub fn apply_allow_list(&mut self, ids: &[String]) {
        let allowed: HashSet<_> = ids.iter().collect();
        for s in &mut self.skills {
            s.enabled = allowed.contains(&s.id);
        }
    }
    pub fn len(&self) -> usize {
        self.skills.len()
    }
    pub fn is_empty(&self) -> bool {
        self.skills.is_empty()
    }
}
fn skill_weight(skill: &Skill) -> SkillResult<usize> {
    if skill.id.is_empty()
        || skill.id.len() > 256
        || skill.file_path.as_os_str().as_encoded_bytes().len() > 8192
    {
        return Err("Skill identity/path budget exceeded".into());
    }
    let mut bytes = skill
        .id
        .len()
        .saturating_add(skill.name.len())
        .saturating_add(skill.description.len())
        .saturating_add(skill.file_path.as_os_str().as_encoded_bytes().len())
        .saturating_add(256);
    let mut list = |items: &Option<Vec<String>>| -> SkillResult<()> {
        if let Some(items) = items {
            if items.len() > 1024 {
                return Err("Skill binary list exceeds budget".into());
            }
            for item in items {
                bytes = bytes.saturating_add(item.len()).saturating_add(32);
            }
        }
        Ok(())
    };
    if let Some(req) = &skill.requires {
        list(&req.bins)?;
        list(&req.any_bins)?;
    }
    if let Some(specs) = &skill.install {
        if specs.len() > 256 {
            return Err("Skill install options exceed budget".into());
        }
        for s in specs {
            list(&s.bins)?;
        }
        for s in specs {
            for field in [&s.id, &s.kind, &s.package, &s.label] {
                bytes = bytes
                    .saturating_add(field.as_ref().map_or(0, String::len))
                    .saturating_add(32);
            }
        }
    }
    if bytes > MAX_SKILL_BYTES {
        Err("Skill metadata exceeds byte budget".into())
    } else {
        Ok(bytes)
    }
}

fn discovery_skill(s: &Skill) -> InstalledSkill {
    InstalledSkill {
        id: s.id.clone(),
        name: s.name.clone(),
        description: s.description.clone(),
        file_path: s.file_path.clone(),
        enabled: s.enabled,
    }
}
impl SkillLookup for SkillRegistry {
    fn list_enabled(&self) -> Vec<InstalledSkill> {
        self.skills
            .iter()
            .filter(|s| s.enabled)
            .map(discovery_skill)
            .collect()
    }
    fn get(&self, id: &str) -> Option<InstalledSkill> {
        SkillRegistry::get(self, id).map(discovery_skill)
    }
}

/// Secure reader for the canonical skills.read tool. Roots are captured from the
/// same authorized discovery inputs, not from markdown or a model-supplied path.
/// The existing tool continues to resolve an enabled registry ID first.
pub struct ScopedSkillFileReader {
    roots: Vec<PathBuf>,
}
impl ScopedSkillFileReader {
    pub fn new(roots: Vec<PathBuf>) -> SkillResult<Self> {
        if roots.len() > 64 || roots.iter().any(|r| !r.is_absolute()) {
            return Err("Invalid skill reader root budget or relative root".into());
        }
        Ok(Self { roots })
    }
}
impl crate::tools::skill_discovery::SkillFileReader for ScopedSkillFileReader {
    fn read_utf8(&self, path: &Path) -> std::io::Result<String> {
        use std::path::Component;
        for root in &self.roots {
            let Ok(relative) = path.strip_prefix(root) else {
                continue;
            };
            let parts: Vec<_> = relative.components().collect();
            if let [Component::Normal(id), Component::Normal(file)] = parts.as_slice()
                && *file == "SKILL.md"
            {
                let id = id
                    .to_str()
                    .ok_or_else(|| std::io::Error::other("Non-UTF8 skill ID"))?;
                let directory = filesystem::Directory::open(root)?.child(id, false)?;
                return String::from_utf8(directory.read("SKILL.md", MAX_SKILL_BYTES)?)
                    .map_err(std::io::Error::other);
            }
        }
        Err(std::io::Error::new(
            std::io::ErrorKind::PermissionDenied,
            "Skill file is outside discovered roots",
        ))
    }
}

/// Captured host PATH/PATHEXT, never process-global mutation. Cache is bounded.
pub struct BinCache {
    path: Vec<PathBuf>,
    extensions: Vec<String>,
    cache: HashMap<String, bool>,
}
impl BinCache {
    pub fn new(path: &std::ffi::OsStr, pathext: Option<&str>) -> Self {
        Self {
            path: std::env::split_paths(path)
                .filter(|p| !p.as_os_str().is_empty())
                .take(512)
                .collect(),
            extensions: if cfg!(windows) {
                pathext
                    .unwrap_or(".EXE;.CMD;.BAT")
                    .split(';')
                    .take(32)
                    .map(str::to_owned)
                    .collect()
            } else {
                vec![String::new()]
            },
            cache: HashMap::new(),
        }
    }
    pub fn invalidate(&mut self, bin: Option<&str>) {
        if let Some(b) = bin {
            self.cache.remove(crate::text::js_trim(b));
        } else {
            self.cache.clear();
        }
    }
    pub fn exists(&mut self, bin: &str) -> bool {
        let name = crate::text::js_trim(bin);
        if name.is_empty() || name.contains(['/', '\\', '\0']) || name.len() > 256 {
            return false;
        }
        if let Some(found) = self.cache.get(name) {
            return *found;
        }
        let found = self.path.iter().any(|d| {
            self.extensions.iter().any(|ext| {
                let path = d.join(format!("{name}{ext}"));
                let Ok(meta) = std::fs::metadata(&path) else {
                    return false;
                };
                if !meta.is_file() {
                    return false;
                }
                #[cfg(unix)]
                {
                    use std::os::unix::ffi::OsStrExt;
                    let Ok(path) = std::ffi::CString::new(path.as_os_str().as_bytes()) else {
                        return false;
                    };
                    // SAFETY: valid C string; access only queries executability.
                    unsafe { libc::access(path.as_ptr(), libc::X_OK) == 0 }
                }
                #[cfg(not(unix))]
                {
                    true
                }
            })
        });
        if self.cache.len() >= MAX_SKILLS {
            self.cache.clear();
        }
        self.cache.insert(name.to_owned(), found);
        found
    }
    pub fn check(&mut self, skill: &Skill) -> SkillToolStatus {
        let mut missing = Vec::new();
        if let Some(req) = &skill.requires {
            for bin in req.bins.iter().flatten() {
                if !self.exists(bin) {
                    missing.push(bin.clone());
                }
            }
            if let Some(any) = &req.any_bins
                && !any.is_empty()
                && !any.iter().any(|b| self.exists(b))
            {
                for b in any {
                    if !missing.contains(b) {
                        missing.push(b.clone());
                    }
                }
            }
        }
        SkillToolStatus {
            satisfied: missing.is_empty(),
            missing,
        }
    }
}
#[derive(Debug, Serialize)]
pub struct SkillToolStatus {
    pub satisfied: bool,
    pub missing: Vec<String>,
}
pub const SKILL_DISCOVERY_INSTRUCTIONS: &str = "Skills are available on demand. Discover skills.search and skills.read with tools.search. Search installed skills when specialized instructions could help; load a selected skill before applying it. Resolve an explicit /skill-id with skills.search, then read it. Resolve relative references against the returned baseDirectory. Do not list every installed skill.";
pub fn format_skills_for_prompt(skills: &[Skill]) -> String {
    if skills.is_empty() {
        String::new()
    } else {
        format!("\n\n<skillDiscovery>\n{SKILL_DISCOVERY_INSTRUCTIONS}\n</skillDiscovery>")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn nested_yaml_and_fallback() {
        let fm = parse_frontmatter("---\nname: Agent\ndescription: |\n  Handle tools.\nmetadata:\n  openclaw:\n    requires:\n      anyBins: [claude, ' codex ', 4]\n    install:\n      - id: cli\n        kind: node\n        package: '@example/cli'\n---\nbody").unwrap();
        assert_eq!(fm.requires.unwrap().any_bins.unwrap(), ["claude", "codex"]);
        assert_eq!(
            fm.install.unwrap()[0].package.as_deref(),
            Some("@example/cli")
        );
        let fm =
            parse_frontmatter("---\nname: Plain\ndescription: A skill\n  : broken\n---").unwrap();
        assert_eq!(fm.name.as_deref(), Some("Plain"));
        assert_eq!(fm.description.as_deref(), Some("A skill"));
    }
    #[test]
    fn budgets_and_empty_prompt() {
        assert!(parse_frontmatter(&"x".repeat(MAX_SKILL_BYTES + 1)).is_err());
        assert!(format_skills_for_prompt(&[]).is_empty());
        assert!(has_yaml_alias_or_tag(
            "name: &anchor name\ndescription: *anchor"
        ));
        assert!(has_yaml_alias_or_tag("metadata: {key: [*anchor]}"));
        assert!(!has_yaml_alias_or_tag(
            "name: Skill\ndescription: Normal skill"
        ));
    }
}
