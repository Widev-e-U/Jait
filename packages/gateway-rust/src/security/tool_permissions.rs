//! Native policy lookup, consent rules and reference-compatible command/path matching.
//! These helpers do not authorize execution on their own; the executor owns dispatch.
use crate::security::contracts::Risk;
use regress::Regex;
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    sync::LazyLock,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ConsentLevel {
    None,
    Once,
    Always,
    Dangerous,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum PolicySource {
    Profile,
    UnknownTool,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolPermission {
    pub tool_name: String,
    pub consent_level: ConsentLevel,
    pub risk: Risk,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub allowed_commands: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub denied_commands: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub allowed_paths: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub denied_paths: Option<Vec<String>>,
    pub description: String,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedToolPermission {
    #[serde(flatten)]
    pub permission: ToolPermission,
    pub known_tool: bool,
    pub source: PolicySource,
}
#[derive(Default)]
pub struct ToolPermissionConfig {
    pub permissions: HashMap<String, ToolPermission>,
    pub session_approvals: HashSet<String>,
}
pub fn get_unknown_tool_permission(tool_name: &str) -> ResolvedToolPermission {
    ResolvedToolPermission {
        permission: ToolPermission {
            tool_name:tool_name.into(),consent_level:ConsentLevel::Dangerous,risk:Risk::High,
            allowed_commands:None,denied_commands:None,allowed_paths:None,denied_paths:None,
            description:"Tool is not part of the active security profile and is treated as dangerous until explicitly configured.".into(),
        },known_tool:false,source:PolicySource::UnknownTool,
    }
}
pub fn resolve_tool_permission(
    tool_name: &str,
    permissions: &HashMap<String, ToolPermission>,
) -> ResolvedToolPermission {
    match crate::tools::tool_names::policy_names(tool_name)
        .into_iter()
        .find_map(|name| permissions.get(name))
    {
        Some(permission) => ResolvedToolPermission {
            permission: if crate::tools::tool_names::policy_names(tool_name).len() > 1 {
                ToolPermission {
                    tool_name: tool_name.into(),
                    ..permission.clone()
                }
            } else {
                permission.clone()
            },
            known_tool: true,
            source: PolicySource::Profile,
        },
        None => get_unknown_tool_permission(tool_name),
    }
}
pub fn requires_consent(
    permission: Option<&ToolPermission>,
    trust_level: f64,
    session_approvals: &HashSet<String>,
) -> bool {
    let Some(permission) = permission else {
        return true;
    };
    match permission.consent_level {
        ConsentLevel::None => false,
        ConsentLevel::Once => {
            !(session_approvals.contains(&permission.tool_name) || trust_level >= 2.0)
        }
        ConsentLevel::Always => trust_level.is_nan() || trust_level < 3.0,
        ConsentLevel::Dangerous => true,
    }
}
#[derive(Debug, PartialEq, Eq, Serialize)]
pub struct CommandClassification {
    pub irreversible: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<&'static str>,
}
static IRREVERSIBLE: LazyLock<Vec<(Regex, &'static str)>> = LazyLock::new(|| {
    vec![
        (
            Regex::new(r#"\bgit\s+stash\b(?!\s+list)"#).expect("reviewed command regex"),
            "git stash hides uncommitted work and can be lost on conflict",
        ),
        (
            Regex::new(r#"\bgit\s+checkout\s+--\s"#).expect("reviewed command regex"),
            "git checkout -- discards uncommitted changes",
        ),
        (
            Regex::new(r#"\bgit\s+restore\b(?!.*--staged\b)"#).expect("reviewed command regex"),
            "git restore discards uncommitted changes",
        ),
        (
            Regex::new(r#"\bgit\s+reset\s+--hard\b"#).expect("reviewed command regex"),
            "git reset --hard discards commits and working-tree changes",
        ),
        (
            Regex::new(r#"\bgit\s+clean\s+-[a-z]*f"#).expect("reviewed command regex"),
            "git clean -f deletes untracked files",
        ),
        (
            Regex::new(r#"\bgit\s+rm\b"#).expect("reviewed command regex"),
            "git rm removes files from the working tree or index",
        ),
        (
            Regex::new(r#"\bgit\s+push\b.*(--force\b|--force-with-lease\b|\s-f\b)"#)
                .expect("reviewed command regex"),
            "force push rewrites remote history",
        ),
        (
            Regex::new(r#"\brm\s+-[a-z]*[rf]"#).expect("reviewed command regex"),
            "rm -r/-f deletes files irreversibly",
        ),
        (
            Regex::new(r#"\b(pkill|killall)\b"#).expect("reviewed command regex"),
            "kills processes by pattern and can hit unrelated ones",
        ),
        (
            Regex::new(r#"\b(mkfs|dd)\s"#).expect("reviewed command regex"),
            "writes raw device or filesystem data",
        ),
    ]
});
fn matches(regex: &Regex, value: &str) -> bool {
    regex
        .find_from_ucs2(&value.encode_utf16().collect::<Vec<_>>(), 0)
        .next()
        .is_some()
}
pub fn classify_irreversible_command(command: &str) -> CommandClassification {
    for (pattern, reason) in IRREVERSIBLE.iter() {
        if matches(pattern, command) {
            return CommandClassification {
                irreversible: true,
                reason: Some(reason),
            };
        }
    }
    CommandClassification {
        irreversible: false,
        reason: None,
    }
}
/// Exactly the small reference glob dialect, including its placeholder replacement order.
/// This is not a filesystem scope check; project/path boundaries remain mandatory.
// Legacy ECMAScript `/i` Canonicalize, without Unicode mode: multi-character
// uppercase expansions and non-ASCII -> ASCII mappings retain the original unit.
fn canonicalize_legacy(value: &str) -> String {
    value
        .chars()
        .map(|c| {
            if c.len_utf16() != 1 {
                return c;
            }
            let mut upper = c.to_uppercase();
            let first = upper.next().unwrap();
            if upper.next().is_some()
                || first.len_utf16() != 1
                || (!c.is_ascii() && first.is_ascii())
            {
                c
            } else {
                first
            }
        })
        .collect()
}
pub fn match_glob(value: &str, pattern: &str) -> bool {
    let mut escaped = String::new();
    for c in pattern.chars() {
        if ".+^${}()|[]\\".contains(c) {
            escaped.push('\\');
        }
        escaped.push(c);
    }
    let expression = escaped
        .replace("**", "<<GLOBSTAR>>")
        .replace('*', "[^/]*")
        .replace('?', ".")
        .replace("<<GLOBSTAR>>", ".*");
    matches(
        &Regex::from_unicode(
            canonicalize_legacy(&format!("^{expression}$"))
                .encode_utf16()
                .map(u32::from),
            "",
        )
        .expect("escaped glob"),
        &canonicalize_legacy(value),
    )
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct PermissionCheck {
    pub allowed: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
}
fn allowed_by_lists(
    value: &str,
    allowed: Option<&[String]>,
    denied: Option<&[String]>,
    kind: &str,
) -> PermissionCheck {
    if let Some(pattern) =
        denied.and_then(|list| list.iter().find(|pattern| match_glob(value, pattern)))
    {
        return PermissionCheck {
            allowed: false,
            reason: Some(format!("{kind} matches denied pattern: {pattern}")),
        };
    }
    if let Some(list) = allowed.filter(|list| !list.is_empty())
        && !list.iter().any(|pattern| match_glob(value, pattern))
    {
        return PermissionCheck {
            allowed: false,
            reason: Some(format!("{kind} not in allowed list")),
        };
    }
    PermissionCheck {
        allowed: true,
        reason: None,
    }
}
pub fn is_command_allowed(command: &str, permission: Option<&ToolPermission>) -> PermissionCheck {
    allowed_by_lists(
        command,
        permission.and_then(|p| p.allowed_commands.as_deref()),
        permission.and_then(|p| p.denied_commands.as_deref()),
        "Command",
    )
}
pub fn is_path_allowed_by_permission(
    path: &str,
    permission: Option<&ToolPermission>,
) -> PermissionCheck {
    allowed_by_lists(
        path,
        permission.and_then(|p| p.allowed_paths.as_deref()),
        permission.and_then(|p| p.denied_paths.as_deref()),
        "Path",
    )
}
