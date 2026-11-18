//! On-demand discovery factories. Visibility, preview budgets and advertised
//! schemas follow the reference. Registration, consent and model ranking stay
//! in the registry and its explicit caller-provided ranker.
use super::{
    core_io::HostError,
    list_preview::{ellipsize_text, summarize_with_preview},
    memory_tools::MemoryToolResult,
    registry::{RegistryRanker, SearchOptions, ToolRegistry},
};
use crate::{contracts::bounded_json::Utf16Text, services::calendar::truthy};
use futures_util::future::LocalBoxFuture;
use serde_json::{Value, json};
use std::{collections::HashSet, sync::LazyLock};

pub fn metadata() -> &'static Value {
    static DATA: LazyLock<Value> = LazyLock::new(|| {
        serde_json::from_str(include_str!("meta-tools-metadata.json")).expect("discovery metadata")
    });
    &DATA
}
#[derive(Clone)]
pub struct DiscoveryMatch {
    pub tool: Value,
    pub score: f64,
    pub matched_terms: Vec<String>,
}
pub trait DiscoveryRegistry {
    fn list_for_mcp(&self) -> Vec<Value>;
    fn list_info(&self) -> Vec<Value>;
    fn rank<'a>(
        &'a self,
        query: &'a str,
        candidates: Option<Vec<Value>>,
        limit: f64,
        keys: Option<&'a Value>,
    ) -> LocalBoxFuture<'a, Result<Vec<DiscoveryMatch>, HostError>>;
}
pub struct NativeDiscovery<'a, C> {
    pub registry: &'a ToolRegistry<C>,
    pub ranker: &'a dyn RegistryRanker<C>,
}
impl<C: Clone> DiscoveryRegistry for NativeDiscovery<'_, C> {
    fn list_for_mcp(&self) -> Vec<Value> {
        self.registry
            .list_for_mcp(&HashSet::new())
            .iter()
            .map(|t| t.definition.clone())
            .collect()
    }
    fn list_info(&self) -> Vec<Value> {
        self.registry.list_info()
    }
    fn rank<'a>(
        &'a self,
        query: &'a str,
        candidates: Option<Vec<Value>>,
        limit: f64,
        keys: Option<&'a Value>,
    ) -> LocalBoxFuture<'a, Result<Vec<DiscoveryMatch>, HostError>> {
        Box::pin(async move {
            let options = SearchOptions {
                candidates: candidates.map(|tools| {
                    tools
                        .iter()
                        .filter_map(|t| t["name"].as_str().and_then(|name| self.registry.get(name)))
                        .collect()
                }),
                limit: Some(limit),
                disabled_tools: HashSet::new(),
            };
            Ok(self
                .registry
                .rank_search_with_system_one(query, &options, keys, self.ranker)
                .await?
                .into_iter()
                .map(|m| DiscoveryMatch {
                    tool: m.tool.definition.clone(),
                    score: m.score.get(),
                    matched_terms: m.matched_terms.clone(),
                })
                .collect())
        })
    }
}
fn text(v: &Value, key: &str) -> String {
    v[key].as_str().unwrap_or("").into()
}
fn units(s: &str) -> Vec<u16> {
    s.encode_utf16().collect()
}
fn line(prefix: &str, description: &str) -> Utf16Text {
    Utf16Text([units(prefix), ellipsize_text(&units(description), None).0].concat())
}
fn result(message: Utf16Text, data: Value) -> MemoryToolResult {
    MemoryToolResult {
        ok: json!(true),
        message,
        data: Some(data),
    }
}
pub fn list(registry: &dyn DiscoveryRegistry, input: &Value, context: &Value) -> MemoryToolResult {
    let visible = (context["requestedBy"] == "mcp-client").then(|| {
        registry
            .list_for_mcp()
            .iter()
            .map(|t| text(t, "name"))
            .collect::<HashSet<_>>()
    });
    let tools = registry
        .list_info()
        .into_iter()
        .filter(|t| {
            visible
                .as_ref()
                .is_none_or(|names| names.contains(&text(t, "name")))
        })
        .filter(|t| !truthy(&input["category"]) || t["category"] == input["category"])
        .collect::<Vec<_>>();
    let mut groups: Vec<(String, Vec<&Value>)> = vec![];
    for tool in &tools {
        let category = text(tool, "category");
        if let Some((_, items)) = groups.iter_mut().find(|(c, _)| c == &category) {
            items.push(tool);
        } else {
            groups.push((category, vec![tool]));
        }
    }
    let mut full = vec![];
    let mut previews = vec![];
    for (category, items) in &groups {
        let header = format!("## {category}");
        full.push(header.clone());
        previews.push(Utf16Text::from(header));
        for tool in items {
            let badge = match tool["tier"].as_str() {
                Some("core") => " [core]",
                Some("external") => " [external]",
                _ => "",
            };
            let prefix = format!("- **{}**{badge}: ", text(tool, "name"));
            let description = text(tool, "description");
            full.push(format!("{prefix}{description}"));
            previews.push(line(&prefix, &description));
        }
        full.push(String::new());
    }
    let summary = format!(
        "Found {} tool(s) across {} category/categories.",
        tools.len(),
        groups.len()
    );
    result(
        summarize_with_preview(&units(&summary), &previews, Some(60.0)),
        json!({"total":tools.len(),"categories":groups.iter().map(|(c,_)|c).collect::<Vec<_>>(),"catalogue":full.join("\n")}),
    )
}
pub async fn search(
    registry: &dyn DiscoveryRegistry,
    input: &Value,
    context: &Value,
) -> Result<MemoryToolResult, HostError> {
    let query = input["query"].as_str().expect("validated discovery query");
    let limit = input["limit"]
        .as_f64()
        .unwrap_or(3.0)
        .floor()
        .clamp(1.0, 20.0);
    let candidates = (context["requestedBy"] == "mcp-client").then(|| registry.list_for_mcp());
    let ranked = registry
        .rank(query, candidates, limit, context.get("apiKeys"))
        .await?;
    if ranked.is_empty() {
        return Ok(result(
            Utf16Text::from(format!(
                "No tools found matching \"{query}\". Try broader keywords or use tools.list to see all available tools."
            )),
            json!({"matches":[]}),
        ));
    }
    // Math.round chooses the greater integer at ties, including negatives.
    // Adding 0.5 first changes values just below a tie through f64 rounding.
    let rounded = ranked
        .iter()
        .map(|m| {
            let n = m.score * 100.0;
            let lower = n.floor();
            (if n - lower < 0.5 { lower } else { lower + 1.0 }) / 100.0
        })
        .collect::<Vec<_>>();
    let schemas = ranked.iter().zip(&rounded).map(|(m, score)| {
        let t=&m.tool;
        let score = if score.is_finite() {
            serde_json::from_str::<Value>(ryu_js::Buffer::new().format(*score)).expect("finite discovery score")
        } else { Value::Null };
        json!({"name":t["name"],"openai_name":text(t,"name").replace('.',"_"),"description":t["description"],"tier":t.get("tier").filter(|v|!v.is_null()).cloned().unwrap_or(json!("standard")),"category":t.get("category").filter(|v|!v.is_null()).cloned().unwrap_or(json!("external")),"score":score,"matched_terms":m.matched_terms,"parameters":t["parameters"]})
    }).collect::<Vec<_>>();
    let summary = format!(
        "Found {} tool(s) matching \"{query}\". You can now call these tools directly.",
        ranked.len()
    );
    let previews = schemas
        .iter()
        .zip(&rounded)
        .map(|(s, score)| {
            let number = ryu_js::Buffer::new().format(*score).to_owned();
            line(
                &format!("• **{}** (score {number}): ", text(s, "name")),
                &text(s, "description"),
            )
        })
        .collect::<Vec<_>>();
    Ok(result(
        summarize_with_preview(&units(&summary), &previews, None),
        json!({"matches":schemas}),
    ))
}
