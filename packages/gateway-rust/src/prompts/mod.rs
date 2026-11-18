//! Native prompt resolution. Prose is embedded immutable data; all selection,
//! context assembly, filesystem loading and UTF-16 bounds execute in Rust.
use crate::{contracts::bounded_json::Utf16Text, text::js_trim};
use serde::Deserialize;
use serde_json::Value;
use std::{
    path::{Component, Path, PathBuf},
    sync::{Arc, LazyLock},
};

fn assets() -> &'static Value {
    static DATA: LazyLock<Value> = LazyLock::new(|| {
        serde_json::from_str(include_str!("assets.json")).expect("embedded prompt assets")
    });
    &DATA
}
fn text(value: &Value) -> &str {
    value.as_str().unwrap_or("")
}
fn constant(key: &str) -> &'static str {
    text(&assets()["constants"][key])
}
pub fn default_identity() -> &'static str {
    constant("identity")
}
pub fn default_safety() -> &'static str {
    constant("safety")
}
pub fn default_reminder() -> &'static str {
    constant("reminder")
}
pub fn shared(key: &str) -> Option<&'static str> {
    assets()["shared"].get(key).and_then(Value::as_str)
}
pub fn mode_instructions(mode: &str) -> &'static str {
    text(&assets()["modes"][mode])
}
pub fn response_style(style: &str) -> Option<&'static str> {
    assets()["styles"][style].as_str()
}
pub fn is_response_style(style: &str) -> bool {
    ["normal", "simple", "caveman", "caveman-ultra"].contains(&style)
}
#[derive(Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelEndpoint {
    pub model: String,
    pub base_url: String,
    pub backend: Option<String>,
}
pub trait AgentPrompt: Send + Sync {
    fn name(&self) -> &str;
    fn family_prefixes(&self) -> Vec<&str> {
        vec![]
    }
    fn matches_model(&self, _endpoint: &ModelEndpoint) -> bool {
        false
    }
    fn system(&self, mode: &str, endpoint: &ModelEndpoint) -> String;
    fn reminder(&self, _mode: &str, _endpoint: &ModelEndpoint) -> Option<String> {
        None
    }
    fn identity(&self, _endpoint: &ModelEndpoint) -> Option<String> {
        None
    }
    fn safety(&self, _endpoint: &ModelEndpoint) -> Option<String> {
        None
    }
    fn internal(&self) -> bool {
        false
    }
}
pub struct BuiltinPrompt {
    name: String,
}
impl BuiltinPrompt {
    pub fn named(name: &str) -> Option<Self> {
        assets()["resolvers"]
            .as_array()?
            .iter()
            .any(|r| r["name"] == name)
            .then(|| Self { name: name.into() })
    }
    fn data(&self) -> &Value {
        assets()["resolvers"]
            .as_array()
            .unwrap()
            .iter()
            .find(|r| r["name"] == self.name)
            .unwrap()
    }
    fn variant(&self, endpoint: &ModelEndpoint) -> &Value {
        let model = endpoint.model.to_lowercase();
        let variant = match self.name.as_str() {
            "anthropic"
                if ["claude-sonnet-4", "claude-sonnet-4-20250514"].contains(&model.as_str()) =>
            {
                "sonnet4"
            }
            "anthropic" if model.contains("4-5") || model.contains("4.5") => "claude45",
            "gemini" if model.contains("experimental") || model.contains("hidden") => "alternate",
            "gpt5" if model == "gpt-5-mini" => "mini",
            _ => "default",
        };
        &self.data()["variants"][variant]
    }
}
impl AgentPrompt for BuiltinPrompt {
    fn name(&self) -> &str {
        &self.name
    }
    fn family_prefixes(&self) -> Vec<&str> {
        self.data()["prefixes"]
            .as_array()
            .unwrap()
            .iter()
            .filter_map(Value::as_str)
            .collect()
    }
    fn matches_model(&self, endpoint: &ModelEndpoint) -> bool {
        let m = endpoint.model.to_lowercase();
        match self.name.as_str() {
            "deepseek" => {
                static MATCH: LazyLock<regex::Regex> = LazyLock::new(|| {
                    regex::Regex::new(r"(?i-u:(^|/)deepseek(?:[-/:]|$))").unwrap()
                });
                MATCH.is_match(&endpoint.model)
            }
            "qwen-ollama" => endpoint.backend.as_deref() == Some("ollama") && m.contains("qwen"),
            "ollama" => endpoint.backend.as_deref() == Some("ollama"),
            "glm" => m.contains("glm"),
            "gpt5" => {
                (m.starts_with("gpt-5") || m.starts_with("o3") || m.starts_with("o4-"))
                    && !m.contains("codex")
            }
            "gpt5-codex" => m == "gpt-5-codex",
            "gpt52" => m.starts_with("gpt-5.2"),
            "gpt51" => m.starts_with("gpt-5.1") && !m.contains("codex"),
            _ => false,
        }
    }
    fn system(&self, mode: &str, endpoint: &ModelEndpoint) -> String {
        let mut prompt = text(&self.variant(endpoint)["system"]).to_string();
        let mode = mode_instructions(mode);
        if !mode.is_empty() {
            prompt.push('\n');
            prompt.push_str(mode);
        }
        if self.name == "ollama" {
            js_trim(&prompt).into()
        } else {
            prompt
        }
    }
    fn reminder(&self, _mode: &str, endpoint: &ModelEndpoint) -> Option<String> {
        self.variant(endpoint)["reminder"]
            .as_str()
            .map(String::from)
    }
    fn identity(&self, endpoint: &ModelEndpoint) -> Option<String> {
        self.variant(endpoint)["identity"]
            .as_str()
            .map(String::from)
    }
    fn safety(&self, endpoint: &ModelEndpoint) -> Option<String> {
        self.variant(endpoint)["safety"].as_str().map(String::from)
    }
    fn internal(&self) -> bool {
        self.data()["internal"] == true
    }
}
pub struct PromptRegistry {
    resolvers: Vec<Arc<dyn AgentPrompt>>,
}
impl Default for PromptRegistry {
    fn default() -> Self {
        Self::builtin()
    }
}
impl PromptRegistry {
    pub fn builtin() -> Self {
        Self {
            resolvers: assets()["resolvers"]
                .as_array()
                .unwrap()
                .iter()
                .map(|r| {
                    Arc::new(BuiltinPrompt::named(text(&r["name"])).unwrap())
                        as Arc<dyn AgentPrompt>
                })
                .collect(),
        }
    }
    pub fn register(&mut self, resolver: Arc<dyn AgentPrompt>) {
        self.resolvers.insert(0, resolver);
    }
    pub fn list_resolvers(&self) -> Vec<&str> {
        self.resolvers.iter().map(|r| r.name()).collect()
    }
    pub fn resolve(&self, endpoint: &ModelEndpoint) -> Option<&dyn AgentPrompt> {
        if let Some(resolver) = self.resolvers.iter().find(|r| r.matches_model(endpoint)) {
            return Some(resolver.as_ref());
        }
        let model = endpoint.model.to_lowercase();
        self.resolvers
            .iter()
            .find(|r| {
                r.family_prefixes()
                    .iter()
                    .any(|p| model.starts_with(&p.to_lowercase()))
            })
            .or_else(|| self.resolvers.last())
            .map(AsRef::as_ref)
    }
    pub fn reminder(&self, mode: &str, endpoint: &ModelEndpoint) -> Option<String> {
        self.resolve(endpoint).map(|r| {
            r.reminder(mode, endpoint)
                .unwrap_or_else(|| constant("reminder").into())
        })
    }
    pub fn build(
        &self,
        mode: &str,
        endpoint: &ModelEndpoint,
        ctx: &PromptContext,
        global: Option<&Utf16Text>,
    ) -> Option<Utf16Text> {
        let resolver = self.resolve(endpoint)?;
        let local = ctx.backend.as_deref() == Some("ollama")
            || endpoint.backend.as_deref() == Some("ollama");
        let system = resolver.system(mode, endpoint);
        let mut prompt = Vec::new();
        if local {
            append(&mut prompt, &system);
            if let Some(root) = truthy(&ctx.project_root) {
                append(&mut prompt, &format!("\nProject: {root}"));
            }
        } else {
            let identity = resolver
                .identity(endpoint)
                .unwrap_or_else(|| constant("identity").into());
            let safety = resolver
                .safety(endpoint)
                .unwrap_or_else(|| constant("safety").into());
            append(&mut prompt, &format!("{identity}\n\n{safety}\n\n"));
            if !resolver.internal() {
                append(
                    &mut prompt,
                    &format!(
                        "<jaitExternalProvider>\n{}\n</jaitExternalProvider>\n\n",
                        shared("JAIT_EXTERNAL_PROVIDER_INSTRUCTIONS").unwrap()
                    ),
                );
            }
            append(&mut prompt, &system);
            if let Some(root) = truthy(&ctx.project_root) {
                let mut parts = vec![format!("You are working in the project: {root}")];
                if let Some(platform) = truthy(&ctx.platform) {
                    parts.push(format!("OS: {platform}"));
                }
                if let Some(shell) = truthy(&ctx.shell) {
                    parts.push(format!("Shell: {shell} — write commands compatible with this shell. On PowerShell, use PowerShell syntax (e.g. $variable not bash-style). On bash/zsh, use POSIX syntax."));
                }
                if let Some(host) = truthy(&ctx.hostname) {
                    parts.push(format!("Host: {host}"));
                }
                parts.push("All relative file paths and searches default to this directory. Use relative paths when possible. Do not search from the drive root — scope operations to this project.".into());
                append(
                    &mut prompt,
                    &format!(
                        "\n\n<projectContext>\n{}\n</projectContext>",
                        parts.join("\n")
                    ),
                );
            }
            append(&mut prompt, &format_skills(&ctx.skills));
            if let Some(graph) = ctx
                .architecture_graph
                .as_deref()
                .map(js_trim)
                .filter(|s| !s.is_empty())
            {
                append(
                    &mut prompt,
                    "\n\n<projectArchitecture>\nA Mermaid diagram of this project's architecture (modules, dependencies, and data flow). Use it to orient yourself before exploring files.\n\n",
                );
                let units = graph.encode_utf16().collect::<Vec<_>>();
                prompt.extend(units.iter().take(4000));
                if units.len() > 4000 {
                    append(&mut prompt, "\n%% …truncated");
                }
                append(&mut prompt, "\n</projectArchitecture>");
            }
            if let Some(style) = ctx.response_style.as_deref().and_then(response_style) {
                append(
                    &mut prompt,
                    &format!("\n\n<responseStyle>\n{style}\n</responseStyle>"),
                );
            }
        }
        for (needle, tag, key) in [
            (
                "jait.catalog",
                "jaitCapabilities",
                "JAIT_CATALOG_INSTRUCTIONS",
            ),
            (
                "tools.search",
                "toolDiscovery",
                "TOOL_DISCOVERY_INSTRUCTIONS",
            ),
        ] {
            let units = needle.encode_utf16().collect::<Vec<_>>();
            if !prompt.windows(units.len()).any(|w| w == units) {
                append(
                    &mut prompt,
                    &format!("\n\n<{tag}>\n{}\n</{tag}>", shared(key).unwrap()),
                );
            }
        }
        append(
            &mut prompt,
            &format!(
                "\n\n<liveBrowserUpdates>\n{}\n</liveBrowserUpdates>",
                shared("LIVE_BROWSER_UPDATE_INSTRUCTIONS").unwrap()
            ),
        );
        if truthy(&ctx.project_root).is_some() {
            append(
                &mut prompt,
                &format!(
                    "\n\n<projectArtifacts>\n{}\n</projectArtifacts>",
                    shared("PROJECT_ARTIFACT_INSTRUCTIONS").unwrap()
                ),
            );
        }
        if let Some(global) = global.filter(|g| !g.0.is_empty()) {
            append(
                &mut prompt,
                "\n\n<globalJaitInstructions>\nUser-level instructions loaded from the Jait global instruction file. These apply across projects and providers unless a higher-priority instruction conflicts.\n\n",
            );
            prompt.extend(&global.0);
            append(&mut prompt, "\n</globalJaitInstructions>");
        }
        if let Some(instructions) = ctx
            .project_instructions
            .as_deref()
            .map(js_trim)
            .filter(|s| !s.is_empty())
        {
            append(
                &mut prompt,
                &format!(
                    "\n\n<projectInstructions>\nContext and instructions the user attached to this chat's project folder (and any folder above it), ordered from the outermost folder inwards. The innermost entry is the most specific — prefer it when two entries conflict. These outrank the global instruction file.\n\n{instructions}\n</projectInstructions>"
                ),
            );
        }
        if ctx.system_one {
            append(&mut prompt, &format!("\n\n{}", constant("systemOne")));
        }
        Some(Utf16Text(prompt))
    }
}
fn append(output: &mut Vec<u16>, s: &str) {
    output.extend(s.encode_utf16());
}
fn truthy(s: &Option<String>) -> Option<&str> {
    s.as_deref().filter(|s| !s.is_empty())
}
#[derive(Clone, Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct PromptContext {
    pub system_one: bool,
    pub project_root: Option<String>,
    pub skills: Vec<PromptSkill>,
    pub architecture_graph: Option<String>,
    pub response_style: Option<String>,
    pub backend: Option<String>,
    pub platform: Option<String>,
    pub shell: Option<String>,
    pub hostname: Option<String>,
    pub project_instructions: Option<String>,
}
#[derive(Clone, Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct PromptSkill {
    pub name: String,
    pub description: String,
    pub file_path: String,
}
pub const SKILL_DISCOVERY_INSTRUCTIONS: &str = "Skills are available on demand. Discover skills.search and skills.read with tools.search. Search installed skills when specialized instructions could help; load a selected skill before applying it. Resolve an explicit /skill-id with skills.search, then read it. Resolve relative references against the returned baseDirectory. Do not list every installed skill.";

pub fn format_skills(skills: &[PromptSkill]) -> String {
    if skills.is_empty() {
        String::new()
    } else {
        format!("\n\n<skillDiscovery>\n{SKILL_DISCOVERY_INSTRUCTIONS}\n</skillDiscovery>")
    }
}
/// Explicit file-loading context: never discover credentials or mutate process env.
pub struct GlobalInstructions {
    pub soul_path: Option<String>,
    pub legacy_path: Option<String>,
    pub state_directory: PathBuf,
    pub home: PathBuf,
    pub cwd: PathBuf,
}
impl GlobalInstructions {
    pub fn path(&self) -> PathBuf {
        let raw = self
            .soul_path
            .as_deref()
            .map(js_trim)
            .filter(|s| !s.is_empty())
            .or_else(|| {
                self.legacy_path
                    .as_deref()
                    .map(js_trim)
                    .filter(|s| !s.is_empty())
            });
        let path = match raw {
            Some("~") => self.home.clone(),
            Some(s) if s.starts_with("~/") || s.starts_with("~\\") => {
                let mut path = self.home.as_os_str().to_os_string();
                path.push("/");
                path.push(&s[2..]);
                PathBuf::from(path)
            }
            Some(s) => PathBuf::from(s),
            None => self.state_directory.join("SOUL.md"),
        };
        normalize_path(if path.is_absolute() {
            path
        } else {
            self.cwd.join(path)
        })
    }
    pub fn load(&self) -> Option<Utf16Text> {
        let bytes = std::fs::read(self.path()).ok()?;
        let raw = String::from_utf8_lossy(&bytes);
        let raw = js_trim(&raw);
        if raw.is_empty() {
            return None;
        }
        let mut units = raw.encode_utf16().collect::<Vec<_>>();
        if units.len() > 12_000 {
            units.truncate(12_000);
            append(&mut units, "\n\n[truncated]");
        }
        Some(Utf16Text(units))
    }
}
fn normalize_path(path: PathBuf) -> PathBuf {
    let mut result = PathBuf::new();
    for component in Path::new(&path).components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                result.pop();
            }
            other => result.push(other.as_os_str()),
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    fn endpoint() -> ModelEndpoint {
        ModelEndpoint {
            model: "claude-sonnet-4".into(),
            base_url: String::new(),
            backend: None,
        }
    }

    fn built(ctx: &PromptContext) -> String {
        let text = PromptRegistry::builtin()
            .build("chat", &endpoint(), ctx, None)
            .expect("builtin registry must build a prompt");
        String::from_utf16(&text.0).expect("prompt must be valid UTF-16")
    }

    #[test]
    fn live_browser_updates_block_is_unconditional() {
        let live = shared("LIVE_BROWSER_UPDATE_INSTRUCTIONS").expect("shared live-browser text");
        for ctx in [
            PromptContext::default(),
            PromptContext {
                project_root: Some("/tmp/p".into()),
                ..PromptContext::default()
            },
        ] {
            let prompt = built(&ctx);
            let expected = format!("\n\n<liveBrowserUpdates>\n{live}\n</liveBrowserUpdates>");
            assert_eq!(prompt.matches("<liveBrowserUpdates>").count(), 1);
            assert!(
                prompt.contains(&expected),
                "live-browser block missing or altered"
            );
        }
    }

    #[test]
    fn live_browser_updates_precedes_project_artifacts() {
        let ctx = PromptContext {
            project_root: Some("/tmp/p".into()),
            ..PromptContext::default()
        };
        let prompt = built(&ctx);
        let live = prompt.find("<liveBrowserUpdates>").unwrap();
        let artifacts = prompt.find("<projectArtifacts>").unwrap();
        assert!(
            live < artifacts,
            "live-browser block must precede projectArtifacts"
        );
    }

    #[test]
    fn lite_external_section_ends_with_live_browser_text() {
        let live = shared("LIVE_BROWSER_UPDATE_INSTRUCTIONS").expect("shared live-browser text");
        let lite = shared("JAIT_EXTERNAL_PROVIDER_INSTRUCTIONS_LITE").expect("shared lite text");
        assert!(
            lite.ends_with(&format!("\n{live}")),
            "LITE section must end with the live-browser paragraph"
        );
        // The TS parity contract: the lite variant appends the live-browser paragraph,
        // while the full variant ends at its "blocking condition" sentence and does not.
        let full = shared("JAIT_EXTERNAL_PROVIDER_INSTRUCTIONS").expect("shared full text");
        assert!(
            !full.ends_with(live),
            "full external section must not append the live-browser paragraph"
        );
        assert!(lite.len() < full.len());
    }
}
