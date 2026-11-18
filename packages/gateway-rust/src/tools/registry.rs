//! Owned tool registration, bounded discovery and audited dispatch. Scope and
//! consent belong to the outer executor. Ports never discover credentials or
//! activate tools. Local futures preserve the existing lossless validator input.
use super::tool_names::is_tool_disabled;
use super::{
    catalog,
    core_io::HostError,
    memory_tools::MemoryToolResult,
    validate::{ToolInput, ValidationException, validate_tool_input},
};
use crate::{contracts::bounded_json::Utf16Text, services::calendar::truthy};
use futures_util::future::LocalBoxFuture;
use icu_collator::{Collator, options::CollatorOptions};
use serde_json::{Value, json, value::RawValue};
use std::{
    cell::Cell,
    collections::{HashMap, HashSet},
    rc::Rc,
};
pub const MCP_EXPOSED_CORE_TOOL_NAMES: &[&str] = &[
    "todo",
    "jait.todos",
    "jait.terminal",
    "user.ask",
    "tools.list",
    "tools.search",
    "jait.catalog",
    "jait.link",
];
pub type RegistryResult = MemoryToolResult;
pub type AuditPort = Rc<dyn Fn(&str) -> Result<(), HostError>>;
pub type IdGenerator = Rc<dyn Fn() -> String>;
#[derive(Clone)]
pub struct RegistryContext<C> {
    pub fields: Value,
    pub capabilities: C,
}
pub type ExecutePort<C> = Rc<
    dyn for<'a> Fn(
        &'a Value,
        &'a mut ToolInput,
        &'a RegistryContext<C>,
    ) -> LocalBoxFuture<'a, Result<RegistryResult, HostError>>,
>;
pub struct RegisteredTool<C> {
    pub definition: Value,
    pub execute: ExecutePort<C>,
}
pub struct RankedToolMatch<C> {
    pub tool: Rc<RegisteredTool<C>>,
    pub score: Cell<f64>,
    pub matched_terms: Vec<String>,
}
impl<C> RankedToolMatch<C> {
    pub fn value(&self) -> Value {
        json!({"tool":self.tool.definition,"score":number(self.score.get()),"matchedTerms":self.matched_terms})
    }
}
pub enum RankOutcome<C> {
    Unchanged,
    Ranked(Vec<Rc<RankedToolMatch<C>>>),
}
pub trait RegistryRanker<C> {
    fn enabled(&self, keys: Option<&Value>) -> bool;
    fn rank<'a>(
        &'a self,
        keys: Option<&'a Value>,
        query: Utf16Text,
        candidates: Vec<Rc<RankedToolMatch<C>>>,
    ) -> LocalBoxFuture<'a, Result<RankOutcome<C>, HostError>>;
}
#[derive(Default)]
pub struct SearchOptions<C> {
    pub candidates: Option<Vec<Rc<RegisteredTool<C>>>>,
    pub disabled_tools: HashSet<String>,
    pub limit: Option<f64>,
}
impl<C> Clone for SearchOptions<C> {
    fn clone(&self) -> Self {
        Self {
            candidates: self.candidates.clone(),
            disabled_tools: self.disabled_tools.clone(),
            limit: self.limit,
        }
    }
}
#[derive(Debug)]
pub enum RegistryError {
    Host(HostError),
    Validation(ValidationException),
}
impl From<HostError> for RegistryError {
    fn from(e: HostError) -> Self {
        Self::Host(e)
    }
}
fn number(n: f64) -> Value {
    if n.is_finite() {
        serde_json::from_str(ryu_js::Buffer::new().format(n)).expect("finite score")
    } else {
        Value::Null
    }
}
fn field<'a>(v: &'a Value, key: &str, default: &'a str) -> &'a str {
    v[key].as_str().unwrap_or(default)
}
fn nonnull<'a>(v: &'a Value, key: &str) -> Option<&'a Value> {
    v.get(key).filter(|v| !v.is_null())
}
fn source_metadata(v: &Value) -> Value {
    if let Some(m) = v.get("sourceMetadata").filter(|v| truthy(v)) {
        return m.clone();
    }
    let source = field(v, "source", "");
    if let Some(id) = source.strip_prefix("plugin:") {
        json!({"kind":"plugin","pluginId":id,"pluginDisplayName":id})
    } else if source == "mcp" {
        json!({"kind":"mcp"})
    } else {
        json!({"kind":"builtin"})
    }
}
fn external(v: &Value) -> bool {
    field(v, "source", "").starts_with("plugin:") || v["source"] == "mcp" || v["tier"] == "external"
}
fn risk(v: &Value) -> &'static str {
    if external(v) {
        return "high";
    }
    match field(v, "name", "") {
        "file.read" | "file.list" | "file.stat" | "surfaces.list" | "network.scan" => "low",
        "file.write" | "file.patch" | "terminal.execution" | "terminal.run" | "terminal.stream"
        | "thread.control" => "medium",
        "os.install" | "gateway.redeploy" => "high",
        _ => match field(v, "category", "") {
            "filesystem" | "meta" | "memory" => "low",
            "terminal" | "browser" | "web" | "screen" | "surfaces" | "agent" => "medium",
            _ => "high",
        },
    }
}
fn consent(v: &Value) -> &'static str {
    if external(v) {
        return "dangerous";
    }
    match field(v, "name", "") {
        "file.read" | "file.list" | "file.stat" | "surfaces.list" | "network.scan" => "none",
        "file.write" | "file.patch" | "terminal.execution" | "terminal.run" | "terminal.stream"
        | "thread.control" => "once",
        "os.install" | "gateway.redeploy" => "always",
        _ => match field(v, "category", "") {
            "filesystem" => {
                if v["risk"] == "high" {
                    "always"
                } else {
                    "once"
                }
            }
            "terminal" | "os" | "agent" | "gateway" | "scheduler" | "network" => {
                if v["risk"] == "low" { "once" } else { "always" }
            }
            "browser" | "web" | "screen" | "surfaces" => "once",
            _ => {
                if v["risk"] == "low" {
                    "none"
                } else {
                    "once"
                }
            }
        },
    }
}
pub fn normalize_tool_definition(tool: &Value) -> Value {
    let mut out = tool.clone();
    if nonnull(tool, "page").is_none() {
        let mut lookup = json!({"name":tool["name"],"category":nonnull(tool,"category").cloned().unwrap_or(json!("external"))});
        lookup.as_object_mut().unwrap().shift_remove("page");
        if let Some(p) = catalog::page_for(&lookup) {
            out["page"] = json!(p);
        } else {
            out.as_object_mut().unwrap().shift_remove("page");
        }
    }
    for (key, default) in [
        ("tier", "standard"),
        ("category", "external"),
        ("source", "builtin"),
    ] {
        if nonnull(tool, key).is_none() {
            out[key] = json!(default);
        }
    }
    out["sourceMetadata"] = source_metadata(tool);
    if nonnull(tool, "risk").is_none() {
        out["risk"] = json!(risk(&out));
    }
    if nonnull(tool, "defaultConsentLevel").is_none() {
        out["defaultConsentLevel"] = json!(consent(&out));
    }
    out
}
fn bounded_units(text: &str, max: usize) -> Utf16Text {
    let units = text.encode_utf16().collect::<Vec<_>>();
    if units.len() <= max {
        return Utf16Text(units);
    }
    let half = max / 2;
    Utf16Text(
        [
            units[..half].to_vec(),
            vec![32],
            units[units.len() - half..].to_vec(),
        ]
        .concat(),
    )
}
fn bounded(text: &str, max: usize) -> String {
    String::from_utf16_lossy(&bounded_units(text, max).0)
}
fn normalize(text: &str) -> String {
    let mut cased = String::new();
    let mut previous = ' ';
    for c in text.chars() {
        if (previous.is_ascii_lowercase() || previous.is_ascii_digit()) && c.is_ascii_uppercase() {
            cased.push(' ');
        }
        cased.push(c);
        previous = c;
    }
    let lower = cased.to_lowercase();
    lower
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { ' ' })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}
const STOP: &[&str] = &[
    "a", "an", "and", "can", "could", "do", "for", "from", "i", "in", "me", "my", "of", "on",
    "please", "the", "to", "use", "want", "with", "you",
];
fn tokens(text: &str) -> Vec<String> {
    normalize(text)
        .split(' ')
        .filter(|s| s.len() > 1 && !STOP.contains(s))
        .map(str::to_owned)
        .collect()
}
fn terms(text: &str, max: usize) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut items = tokens(text)
        .into_iter()
        .filter(|s| seen.insert(s.clone()))
        .collect::<Vec<_>>();
    if items.len() > max {
        let tail = items.split_off(items.len() - max / 2);
        items.truncate(max / 2);
        items.extend(tail);
    }
    items
}
fn synonyms(term: &str) -> &'static [&'static str] {
    match term {
        "app" => &["application", "web", "preview"],
        "ask" => &["question", "clarify", "choice", "decision"],
        "conversation" => &["chat", "session", "history", "message"],
        "deploy" => &["release", "publish", "redeploy"],
        "machine" => &["host", "server", "remote", "ssh"],
        "open" | "show" => {
            if term == "open" {
                &["show", "view", "preview", "display"]
            } else {
                &["open", "view", "preview", "display"]
            }
        }
        "previous" => &["prior", "history", "session", "chat"],
        "remember" => &["memory", "preference", "recall"],
        "site" => &["web", "browser", "preview", "application"],
        _ => &[],
    }
}
fn dice(a: &str, b: &str) -> f64 {
    if a == b {
        return 1.0;
    }
    if a.len() < 3 || b.len() < 3 || a.len() > 32 || b.len() > 32 {
        return 0.0;
    }
    if 2.0 * ((a.len().min(b.len()) - 1) as f64) / ((a.len() + b.len() - 2) as f64) < 0.72 {
        return 0.0;
    }
    let mut pairs = HashMap::new();
    for pair in a.as_bytes().windows(2) {
        *pairs.entry(pair).or_insert(0usize) += 1;
    }
    let mut overlap = 0;
    for pair in b.as_bytes().windows(2) {
        if let Some(n) = pairs.get_mut(pair)
            && *n > 0
        {
            overlap += 1;
            *n -= 1;
        }
    }
    2.0 * (overlap as f64) / ((a.len() + b.len() - 2) as f64)
}
fn fuzzy(term: &str, tokens: &HashSet<String>, cache: &mut HashMap<(String, String), f64>) -> f64 {
    let mut best: f64 = 0.0;
    for token in tokens {
        let key = (term.to_owned(), token.clone());
        let score = cache.get(&key).copied().unwrap_or_else(|| {
            let v = dice(term, token);
            if cache.len() < 8192 {
                cache.insert(key, v);
            }
            v
        });
        best = best.max(score);
    }
    best
}
fn slice<T: Clone>(items: &[T], end: Option<f64>, truthy_limit: bool) -> Vec<T> {
    let Some(n) = end.filter(|n| !truthy_limit || (*n != 0.0 && !n.is_nan())) else {
        return items.to_vec();
    };
    let n = if n.is_nan() { 0.0 } else { n.trunc() };
    let end = if n < 0.0 {
        (items.len() as f64 + n).max(0.0)
    } else {
        n.min(items.len() as f64)
    } as usize;
    items[..end].to_vec()
}
fn fail(message: impl Into<String>) -> RegistryResult {
    RegistryResult {
        ok: json!(false),
        message: Utf16Text::from(message.into()),
        data: None,
    }
}
pub struct ToolRegistry<C> {
    tools: Vec<Rc<RegisteredTool<C>>>,
    compatibility_tools: Vec<Rc<RegisteredTool<C>>>,
    ids: IdGenerator,
}
impl<C: Clone> ToolRegistry<C> {
    pub fn new(ids: IdGenerator) -> Self {
        Self {
            tools: vec![],
            compatibility_tools: vec![],
            ids,
        }
    }
    /// Old clients can execute these definitions; discovery exposes only canonical tools.
    pub fn register_compatibility(&mut self, tool: Value, execute: ExecutePort<C>) {
        let definition = normalize_tool_definition(&tool);
        let name = definition["name"].as_str().expect("typed tool name");
        self.tools.retain(|t| t.definition["name"] != name);
        let slot = self
            .compatibility_tools
            .iter()
            .position(|t| t.definition["name"] == name);
        let tool = Rc::new(RegisteredTool {
            definition,
            execute,
        });
        if let Some(i) = slot {
            self.compatibility_tools[i] = tool;
        } else {
            self.compatibility_tools.push(tool);
        }
    }
    pub fn register(&mut self, tool: Value, execute: ExecutePort<C>) {
        let definition = normalize_tool_definition(&tool);
        let name = definition["name"].as_str().expect("typed tool name");
        self.compatibility_tools
            .retain(|t| t.definition["name"] != name);
        let slot = self.tools.iter().position(|t| t.definition["name"] == name);
        let t = Rc::new(RegisteredTool {
            definition,
            execute,
        });
        if let Some(i) = slot {
            self.tools[i] = t;
        } else {
            self.tools.push(t);
        }
    }
    pub fn unregister(&mut self, name: &str) -> bool {
        if let Some(i) = self.tools.iter().position(|t| t.definition["name"] == name) {
            self.tools.remove(i);
            true
        } else if let Some(i) = self
            .compatibility_tools
            .iter()
            .position(|t| t.definition["name"] == name)
        {
            self.compatibility_tools.remove(i);
            true
        } else {
            false
        }
    }
    pub fn register_plugin_tools(
        &mut self,
        plugin: &crate::plugins::contracts::PluginDescriptor,
        tools: Vec<(Value, ExecutePort<C>)>,
    ) {
        let source_metadata = crate::plugins::contracts::build_plugin_tool_source_metadata(plugin);
        for (mut t, execute) in tools {
            t["source"] = json!(format!("plugin:{}", plugin.id));
            t["sourceMetadata"] = source_metadata.clone();
            self.register(t, execute);
        }
    }
    pub fn get(&self, name: &str) -> Option<Rc<RegisteredTool<C>>> {
        self.tools
            .iter()
            .chain(self.compatibility_tools.iter())
            .find(|t| t.definition["name"] == name)
            .cloned()
    }
    pub fn list(&self) -> Vec<Rc<RegisteredTool<C>>> {
        self.tools.clone()
    }
    pub fn list_names(&self) -> Vec<String> {
        self.tools
            .iter()
            .map(|t| field(&t.definition, "name", "").to_owned())
            .collect()
    }
    pub fn has(&self, name: &str) -> bool {
        self.get(name).is_some()
    }
    pub fn list_by_tier(&self, tier: &str) -> Vec<Rc<RegisteredTool<C>>> {
        self.tools
            .iter()
            .filter(|t| t.definition["tier"] == tier)
            .cloned()
            .collect()
    }
    pub fn list_by_category(&self, category: &str) -> Vec<Rc<RegisteredTool<C>>> {
        self.tools
            .iter()
            .filter(|t| t.definition["category"] == category)
            .cloned()
            .collect()
    }
    pub fn rank_search(
        &self,
        query: &str,
        options: &SearchOptions<C>,
    ) -> Vec<Rc<RankedToolMatch<C>>> {
        let search = bounded(query, 8192);
        let original = terms(&search, 64);
        if original.is_empty() {
            return vec![];
        }
        let normalized = normalize(&search);
        let mut matches = vec![];
        let mut cache = HashMap::new();
        for tool in options.candidates.as_ref().unwrap_or(&self.tools) {
            let d = &tool.definition;
            if is_tool_disabled(field(d, "name", ""), &options.disabled_tools) {
                continue;
            }
            let name: HashSet<_> = tokens(field(d, "name", "")).into_iter().collect();
            let mut metadata = [
                d.get("displayName"),
                d.get("category"),
                d.get("tier"),
                if d["sourceMetadata"]["kind"] == "mcp" {
                    d["sourceMetadata"].get("serverName")
                } else {
                    None
                },
            ]
            .into_iter()
            .flatten()
            .filter_map(Value::as_str)
            .filter(|s| !s.is_empty())
            .map(str::to_owned)
            .collect::<Vec<_>>();
            for key in ["aliases", "capabilities"] {
                metadata.extend(
                    d["discovery"][key]
                        .as_array()
                        .into_iter()
                        .flatten()
                        .filter_map(Value::as_str)
                        .map(str::to_owned),
                );
            }
            let metadata = metadata
                .into_iter()
                .filter(|s| !s.is_empty())
                .collect::<Vec<_>>()
                .join(" ");
            let meta_tokens: HashSet<_> =
                terms(&bounded(&metadata, 16384), 256).into_iter().collect();
            let mut descriptions = vec![field(d, "description", "").to_owned()];
            descriptions.extend(
                d["discovery"]["examples"]
                    .as_array()
                    .into_iter()
                    .flatten()
                    .filter_map(Value::as_str)
                    .map(str::to_owned),
            );
            let description = bounded(&descriptions.join(" "), 16384);
            let desc_tokens: HashSet<_> = terms(&description, 256).into_iter().collect();
            let corpus = normalize(&bounded(
                &format!("{} {metadata} {description}", field(d, "name", "")),
                16384,
            ));
            let mut score = d["discovery"]["priority"].as_f64().unwrap_or(0.0);
            let mut matched = vec![];
            for original in &original {
                let mut best: f64 = 0.0;
                for (index, term) in std::iter::once(original.as_str())
                    .chain(synonyms(original).iter().copied())
                    .enumerate()
                {
                    let weight = if index == 0 { 1.0 } else { 0.55 };
                    let s = if name.contains(term) {
                        24.0
                    } else if meta_tokens.contains(term) {
                        14.0
                    } else if desc_tokens.contains(term) {
                        7.0
                    } else if corpus.contains(term) {
                        4.0
                    } else {
                        let v = fuzzy(term, &name, &mut cache)
                            .max(fuzzy(term, &meta_tokens, &mut cache))
                            .max(fuzzy(term, &desc_tokens, &mut cache));
                        if v >= 0.72 { v * 3.0 } else { 0.0 }
                    };
                    best = best.max(s * weight);
                }
                if best > 0.0 {
                    score += best;
                    matched.push(original.clone());
                }
            }
            if matched.is_empty() {
                continue;
            }
            score += (matched.len() as f64 / original.len() as f64) * 12.0;
            if normalized.len() > 2 && corpus.contains(&normalized) {
                score += 30.0;
            }
            matches.push(Rc::new(RankedToolMatch {
                tool: tool.clone(),
                score: Cell::new(score),
                matched_terms: matched,
            }));
        }
        let collator = Collator::try_new(Default::default(), CollatorOptions::default())
            .expect("compiled collation");
        matches.sort_by(|a, b| {
            b.score.get().total_cmp(&a.score.get()).then_with(|| {
                collator.compare(
                    field(&a.tool.definition, "name", ""),
                    field(&b.tool.definition, "name", ""),
                )
            })
        });
        slice(&matches, options.limit, true)
    }
    pub async fn rank_search_with_system_one(
        &self,
        query: &str,
        options: &SearchOptions<C>,
        keys: Option<&Value>,
        ranker: &dyn RegistryRanker<C>,
    ) -> Result<Vec<Rc<RankedToolMatch<C>>>, HostError> {
        let mut all = options.clone();
        all.limit = None;
        let fallback = self.rank_search(query, &all);
        let limited = slice(&fallback, options.limit, true);
        if !ranker.enabled(keys) {
            return Ok(limited);
        }
        let mut candidates = fallback.iter().take(48).cloned().collect::<Vec<_>>();
        let known = candidates
            .iter()
            .map(|m| field(&m.tool.definition, "name", "").to_owned())
            .collect::<HashSet<_>>();
        for tool in options.candidates.as_ref().unwrap_or(&self.tools) {
            let name = field(&tool.definition, "name", "");
            if !known.contains(name) && !is_tool_disabled(name, &options.disabled_tools) {
                candidates.push(Rc::new(RankedToolMatch {
                    tool: tool.clone(),
                    score: Cell::new(0.0),
                    matched_terms: vec![],
                }));
            }
        }
        candidates.truncate(48);
        match ranker
            .rank(keys, bounded_units(query, 8192), candidates)
            .await?
        {
            RankOutcome::Unchanged => Ok(limited),
            RankOutcome::Ranked(ranked) => Ok(slice(&ranked, options.limit, false)),
        }
    }
    pub fn search(&self, query: &str, options: &SearchOptions<C>) -> Vec<Rc<RegisteredTool<C>>> {
        self.rank_search(query, options)
            .into_iter()
            .map(|m| m.tool.clone())
            .collect()
    }
    pub fn select_for_llm(
        &self,
        query: &str,
        disabled: HashSet<String>,
        limit: f64,
    ) -> Vec<Rc<RegisteredTool<C>>> {
        self.search(
            query,
            &SearchOptions {
                candidates: Some(
                    self.tools
                        .iter()
                        .filter(|t| t.definition["tier"] != "core")
                        .cloned()
                        .collect(),
                ),
                disabled_tools: disabled,
                limit: Some(limit),
            },
        )
    }
    pub fn list_for_mcp(&self, disabled: &HashSet<String>) -> Vec<Rc<RegisteredTool<C>>> {
        self.tools
            .iter()
            .filter(|t| {
                let d = &t.definition;
                let name = field(d, "name", "");
                !is_tool_disabled(name, disabled)
                    && (field(d, "source", "").starts_with("plugin:")
                        || MCP_EXPOSED_CORE_TOOL_NAMES.contains(&name)
                        || (d["source"] == "builtin" && d["tier"] != "core"))
            })
            .cloned()
            .collect()
    }
    pub fn list_for_llm(&self, disabled: &HashSet<String>) -> Vec<Rc<RegisteredTool<C>>> {
        self.tools
            .iter()
            .filter(|t| {
                t.definition["tier"] == "core"
                    && !field(&t.definition, "name", "").starts_with("os.")
                    && !is_tool_disabled(field(&t.definition, "name", ""), disabled)
            })
            .cloned()
            .collect()
    }
    pub fn list_info(&self) -> Vec<Value> {
        self.tools
            .iter()
            .map(|t| {
                let d = &t.definition;
                let mut out = json!({});
                for key in [
                    "name",
                    "displayName",
                    "description",
                    "tier",
                    "category",
                    "source",
                    "sourceMetadata",
                    "risk",
                    "defaultConsentLevel",
                    "discovery",
                ] {
                    if let Some(v) = d.get(key) {
                        out[key] = v.clone();
                    }
                }
                out["parameterCount"] = json!(
                    d["parameters"]["properties"]
                        .as_object()
                        .map_or(0, |v| v.len())
                );
                out
            })
            .collect()
    }
    pub fn list_info_filtered(&self, disabled: &HashSet<String>) -> Vec<Value> {
        self.list_info()
            .into_iter()
            .filter(|t| !is_tool_disabled(field(t, "name", ""), disabled))
            .collect()
    }
    pub fn is_executable(&self, name: &str, disabled: &HashSet<String>) -> bool {
        self.has(name) && !is_tool_disabled(name, disabled)
    }
    fn audit(
        &self,
        audit: Option<&AuditPort>,
        base: Value,
        input: &ToolInput,
        output: Option<String>,
    ) -> Result<(), HostError> {
        if let Some(audit) = audit {
            let mut fields: serde_json::Map<String, Value> = base.as_object().unwrap().clone();
            fields.insert("inputs".into(), Value::Null);
            if output.is_some() {
                fields.insert("outputs".into(), Value::Null);
            }
            let mut map = std::collections::BTreeMap::new();
            for (k, v) in fields {
                map.insert(
                    k,
                    RawValue::from_string(v.to_string()).expect("JSON audit field"),
                );
            }
            map.insert(
                "inputs".into(),
                RawValue::from_string(input.stringify()).expect("validated input wire"),
            );
            if let Some(output) = output {
                map.insert(
                    "outputs".into(),
                    RawValue::from_string(output).expect("JSON audit output"),
                );
            }
            audit(&serde_json::to_string(&map).expect("audit JSON"))?;
        }
        Ok(())
    }
    pub async fn execute(
        &self,
        name: &str,
        input: &mut ToolInput,
        context: &RegistryContext<C>,
        audit: Option<&AuditPort>,
    ) -> Result<RegistryResult, RegistryError> {
        let Some(tool) = self.get(name) else {
            return Ok(fail(format!("Unknown tool: {name}")));
        };
        let action = context
            .fields
            .get("actionId")
            .filter(|v| truthy(v))
            .cloned()
            .unwrap_or_else(|| json!((self.ids)()));
        let validation = validate_tool_input(&tool.definition["parameters"], input)
            .map_err(RegistryError::Validation)?;
        let base = |kind: &str, status: &str, action_id: Value, parent: Option<&Value>| {
            let mut b =
                json!({"actionId":action_id,"actionType":kind,"toolName":name,"status":status});
            if let Some(v) = context.fields.get("sessionId") {
                b["sessionId"] = v.clone();
            }
            if let Some(p) = parent {
                b["parentActionId"] = p.clone();
            }
            b
        };
        if !validation.valid {
            let mut message = "Input validation failed: "
                .encode_utf16()
                .collect::<Vec<_>>();
            for (i, error) in validation.errors.iter().enumerate() {
                if i > 0 {
                    message.extend([59, 32]);
                }
                message.extend(&error.0);
            }
            self.audit(
                audit,
                base("tool.validation_error", "failed", action, None),
                input,
                Some(
                    serde_json::to_string(&json_errors(&validation.errors))
                        .expect("validation JSON"),
                ),
            )?;
            return Ok(RegistryResult {
                ok: json!(false),
                message: Utf16Text(message),
                data: None,
            });
        }
        self.audit(
            audit,
            base("tool.execute", "executing", action.clone(), None),
            input,
            None,
        )?;
        let mut ctx = context.clone();
        ctx.fields["actionId"] = action.clone();
        let result = async {
            let mut result = (tool.execute)(&tool.definition, input, &ctx).await?;
            if let Some(page) = tool.definition["page"].as_str() {
                let attach = match &result.data {
                    None => true,
                    Some(Value::Object(d)) => !d.get("pageLinks").is_some_and(Value::is_array),
                    _ => false,
                };
                if attach {
                    let p = &catalog::source_data()["pages"][page];
                    let data = result.data.get_or_insert_with(|| json!({}));
                    data["pageLinks"] =
                        json!([{"pageId":page,"title":p["title"],"href":p["path"]}]);
                }
            }
            if audit.is_some() {
                let output = result.data.as_ref().map(Value::to_string);
                self.audit(
                    audit,
                    base(
                        "tool.result",
                        if truthy(&result.ok) {
                            "completed"
                        } else {
                            "failed"
                        },
                        json!((self.ids)()),
                        Some(&action),
                    ),
                    input,
                    output,
                )?;
            }
            Ok::<_, HostError>(result)
        }
        .await;
        match result {
            Ok(v) => Ok(v),
            Err(e) => {
                let message = match e {
                    HostError::Error(s) => s,
                    HostError::Thrown(v) => crate::services::calendar::js_text(&v),
                };
                if audit.is_some() {
                    self.audit(
                        audit,
                        base("tool.error", "failed", json!((self.ids)()), Some(&action)),
                        input,
                        Some(json!({"error":message}).to_string()),
                    )?;
                }
                Ok(fail(message))
            }
        }
    }
}
#[derive(serde::Serialize)]
struct Errors<'a> {
    errors: &'a [Utf16Text],
}
fn json_errors(errors: &[Utf16Text]) -> Errors<'_> {
    Errors { errors }
}
