//! Installed enabled skill discovery. File ownership stays in the trusted registry.
use crate::{contracts::bounded_json::Utf16Text, text::js_trim};
use icu_collator::{Collator, CollatorBorrowed, options::CollatorOptions};
use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    io,
    path::{Path, PathBuf},
    sync::LazyLock,
};

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledSkill {
    pub id: String,
    pub name: String,
    pub description: String,
    pub file_path: PathBuf,
    pub enabled: bool,
}
#[derive(Clone, Debug, Serialize)]
pub struct SkillMatch {
    pub id: String,
    pub name: String,
    pub description: Utf16Text,
}
pub fn metadata() -> &'static Value {
    static META: LazyLock<Value> = LazyLock::new(|| {
        serde_json::from_str(include_str!("skill-discovery-metadata.json")).expect("tool metadata")
    });
    &META
}
pub fn search_installed_skills(
    skills: &[InstalledSkill],
    query: &str,
    limit: Option<f64>,
) -> Vec<SkillMatch> {
    let collator = Collator::try_new(Default::default(), CollatorOptions::default())
        .expect("compiled collation");
    search_with_collator(skills, query, limit, &collator)
}
pub fn search_with_collator(
    skills: &[InstalledSkill],
    query: &str,
    limit: Option<f64>,
    collator: &CollatorBorrowed<'_>,
) -> Vec<SkillMatch> {
    static WORDS: LazyLock<Regex> =
        LazyLock::new(|| Regex::new(r"[^\p{L}\p{N}]+").expect("Unicode word splitter"));
    let trimmed = js_trim(query);
    let normalized = trimmed.strip_prefix('/').unwrap_or(trimmed).to_lowercase();
    let words: Vec<_> = WORDS.split(&normalized).filter(|w| !w.is_empty()).collect();
    let mut found: Vec<_> = skills
        .iter()
        .filter(|s| s.enabled)
        .map(|skill| {
            let exact =
                skill.id.to_lowercase() == normalized || skill.name.to_lowercase() == normalized;
            let text = format!("{} {} {}", skill.id, skill.name, skill.description).to_lowercase();
            let score = if exact {
                10000
            } else {
                words.iter().filter(|w| text.contains(**w)).count()
            };
            (skill, score)
        })
        .filter(|(_, score)| *score > 0)
        .collect();
    found.sort_by(|(a, sa), (b, sb)| sb.cmp(sa).then_with(|| collator.compare(&a.id, &b.id)));
    let floored = limit.unwrap_or(3.0).floor();
    let floored = if floored == 0.0 || floored.is_nan() {
        3.0
    } else {
        floored
    };
    found
        .into_iter()
        .take(floored.clamp(1.0, 10.0) as usize)
        .map(|(skill, _)| SkillMatch {
            id: skill.id.clone(),
            name: skill.name.clone(),
            description: Utf16Text(skill.description.encode_utf16().take(180).collect()),
        })
        .collect()
}
/// Implement on the existing registry. The input ID is never interpreted as a path.
pub trait SkillLookup {
    fn list_enabled(&self) -> Vec<InstalledSkill>;
    fn get(&self, id: &str) -> Option<InstalledSkill>;
}
pub trait SkillFileReader {
    fn read_utf8(&self, path: &Path) -> io::Result<String>;
}
pub struct SystemSkillFileReader;
impl SkillFileReader for SystemSkillFileReader {
    fn read_utf8(&self, path: &Path) -> io::Result<String> {
        std::fs::read(path).map(|bytes| String::from_utf8_lossy(&bytes).into_owned())
    }
}
#[derive(Debug, Serialize)]
pub struct SkillSearchData {
    pub matches: Vec<SkillMatch>,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillReadData {
    pub id: String,
    pub base_directory: String,
    pub content: String,
}
#[derive(Debug, Serialize)]
pub struct ToolResult<T> {
    pub ok: bool,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<T>,
}
pub fn search_tool(
    registry: &dyn SkillLookup,
    query: &str,
    limit: Option<f64>,
) -> ToolResult<SkillSearchData> {
    let matches = search_installed_skills(&registry.list_enabled(), query, limit);
    ToolResult {
        ok: true,
        message: format!(
            "{} installed skill matches. Use skills.read with an id.",
            matches.len()
        ),
        data: Some(SkillSearchData { matches }),
    }
}
/// Schedule the real reader on a blocking-work pool when used by an async gateway.
pub fn read_tool(
    registry: &dyn SkillLookup,
    id: &str,
    reader: &dyn SkillFileReader,
) -> ToolResult<SkillReadData> {
    let Some(skill) = registry.get(id).filter(|s| s.enabled) else {
        return ToolResult {
            ok: false,
            message: "Installed enabled skill not found.".into(),
            data: None,
        };
    };
    match reader.read_utf8(&skill.file_path) {
        Ok(content) => ToolResult {
            ok: true,
            message: format!("Loaded skill: {}", skill.name),
            data: Some(SkillReadData {
                id: skill.id,
                base_directory: source_dirname(&skill.file_path),
                content,
            }),
        },
        Err(_) => ToolResult {
            ok: false,
            message: "Unable to read the installed skill.".into(),
            data: None,
        },
    }
}
fn source_dirname(path: &Path) -> String {
    #[cfg(windows)]
    {
        return path
            .parent()
            .filter(|p| !p.as_os_str().is_empty())
            .unwrap_or_else(|| Path::new("."))
            .to_string_lossy()
            .into_owned();
    }
    #[cfg(not(windows))]
    {
        let text = path.to_string_lossy();
        let bytes = text.as_bytes();
        if bytes.is_empty() {
            return ".".into();
        }
        let has_root = bytes[0] == b'/';
        let mut matched_slash = true;
        for i in (1..bytes.len()).rev() {
            if bytes[i] == b'/' {
                if !matched_slash {
                    return if has_root && i == 1 {
                        "//".into()
                    } else {
                        text[..i].into()
                    };
                }
            } else {
                matched_slash = false;
            }
        }
        if has_root { "/".into() } else { ".".into() }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::Cell;
    fn skill(id: &str, name: &str, description: &str) -> InstalledSkill {
        InstalledSkill {
            id: id.into(),
            name: name.into(),
            description: description.into(),
            file_path: PathBuf::from("/owned/SKILL.md"),
            enabled: true,
        }
    }
    struct Registry(Vec<InstalledSkill>);
    impl SkillLookup for Registry {
        fn list_enabled(&self) -> Vec<InstalledSkill> {
            self.0.iter().filter(|s| s.enabled).cloned().collect()
        }
        fn get(&self, id: &str) -> Option<InstalledSkill> {
            self.0.iter().find(|s| s.id == id).cloned()
        }
    }
    struct Reader {
        calls: Cell<usize>,
        fail: bool,
    }
    impl SkillFileReader for Reader {
        fn read_utf8(&self, path: &Path) -> io::Result<String> {
            self.calls.set(self.calls.get() + 1);
            assert_eq!(path, Path::new("/owned/SKILL.md"));
            if self.fail {
                Err(io::Error::other("private filesystem detail"))
            } else {
                Ok("untrusted instructions".into())
            }
        }
    }
    #[test]
    fn exact_match_precedes_token_scores_and_disabled_entries_never_appear() {
        let mut disabled = skill("hidden", "network", "network");
        disabled.enabled = false;
        let skills = vec![
            skill("aaa", "other", "network"),
            skill("zzz", "NETWORK", ""),
            disabled,
        ];
        let matches = search_installed_skills(&skills, " /network ", None);
        assert_eq!(
            matches.iter().map(|s| s.id.as_str()).collect::<Vec<_>>(),
            ["zzz", "aaa"]
        );
    }
    #[test]
    fn score_repeated_tokens_and_collation_ties_stably() {
        let skills = vec![
            skill("z", "", "network"),
            skill("é", "", "network security"),
            skill("e\u{301}", "", "network security"),
            skill("a", "", "security"),
        ];
        let matches = search_installed_skills(&skills, "network network security", None);
        assert_eq!(
            matches.iter().map(|s| s.id.as_str()).collect::<Vec<_>>(),
            ["é", "e\u{301}", "z"]
        );
    }
    #[test]
    fn result_limits_floor_then_default_and_clamp() {
        let skills: Vec<_> = (0..15)
            .map(|i| skill(&format!("id{i}"), "word", ""))
            .collect();
        for (limit, expected) in [
            (None, 3),
            (Some(0.4), 3),
            (Some(-0.1), 1),
            (Some(4.9), 4),
            (Some(20.0), 10),
            (Some(f64::NAN), 3),
            (Some(f64::INFINITY), 10),
        ] {
            assert_eq!(
                search_installed_skills(&skills, "word", limit).len(),
                expected
            );
        }
    }
    #[test]
    fn description_preview_preserves_exact_utf16_boundary() {
        let matches = search_installed_skills(
            &[skill("id", "name", &format!("{}😀", "x".repeat(179)))],
            "id",
            None,
        );
        assert_eq!(matches[0].description.0.len(), 180);
        assert_eq!(matches[0].description.0[179], 0xd83d);
        assert!(serde_json::to_string(&matches).unwrap().contains("\\ud83d"));
    }
    #[test]
    fn dirname_preserves_repeated_separators_and_parent_components() {
        for (path, expected) in [
            ("/owned//SKILL.md", "/owned/"),
            ("/owned/../SKILL.md", "/owned/.."),
            ("SKILL.md", "."),
            ("//SKILL.md", "//"),
            ("/SKILL.md", "/"),
        ] {
            assert_eq!(source_dirname(Path::new(path)), expected);
        }
    }
    #[test]
    fn read_resolves_enabled_registry_ids_and_masks_file_errors() {
        let mut disabled = skill("disabled", "Disabled", "");
        disabled.enabled = false;
        let registry = Registry(vec![skill("installed", "Installed", ""), disabled]);
        let reader = Reader {
            calls: Cell::new(0),
            fail: false,
        };
        for id in ["disabled", "/owned/SKILL.md", "../installed"] {
            let result = read_tool(&registry, id, &reader);
            assert!(!result.ok);
            assert_eq!(result.message, "Installed enabled skill not found.");
            assert!(result.data.is_none());
        }
        assert_eq!(reader.calls.get(), 0);
        let result = read_tool(&registry, "installed", &reader);
        assert!(result.ok);
        let data = result.data.unwrap();
        assert_eq!(data.base_directory, "/owned");
        assert_eq!(data.content, "untrusted instructions");
        let failed = read_tool(
            &registry,
            "installed",
            &Reader {
                calls: Cell::new(0),
                fail: true,
            },
        );
        assert!(!failed.ok);
        assert_eq!(failed.message, "Unable to read the installed skill.");
        assert!(failed.data.is_none());
    }
}
