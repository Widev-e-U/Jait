//! Live capability catalog over an explicit registry port. Search ranking and
//! MCP exposure belong to the registry; this adapter never activates a tool.
use crate::text::{js_trim, js_whitespace};
use serde_json::{Value, json};
use std::{collections::HashSet, sync::LazyLock};
pub fn source_data() -> &'static Value {
    static DATA: LazyLock<Value> = LazyLock::new(|| {
        serde_json::from_str(include_str!("catalog-data.json")).expect("catalog source data")
    });
    &DATA
}
pub fn metadata() -> &'static Value {
    &source_data()["metadata"]
}
fn ids() -> impl Iterator<Item = &'static str> {
    source_data()["ids"]
        .as_array()
        .expect("page ids")
        .iter()
        .map(|v| v.as_str().unwrap())
}
fn feature_ref(page: &Value, name: &str) -> bool {
    page["features"]
        .as_array()
        .unwrap()
        .iter()
        .any(|f| f["toolRefs"].as_array().unwrap().iter().any(|n| n == name))
}
fn name(tool: &Value) -> &str {
    tool["name"].as_str().expect("typed tool name")
}
pub(crate) fn page_for(tool: &Value) -> Option<&str> {
    if let Some(page) = tool["page"].as_str() {
        return Some(page);
    }
    let name = name(tool);
    let mut matched = None;
    let mut length = 0;
    for id in ids() {
        for prefix in source_data()["pages"][id]["toolPrefixes"]
            .as_array()
            .unwrap()
        {
            let prefix = prefix.as_str().unwrap();
            if name.starts_with(prefix) && (matched.is_none() || prefix.len() > length) {
                matched = Some(id);
                length = prefix.len();
            }
        }
    }
    if matched.is_some() {
        return matched;
    }
    for id in ids() {
        if feature_ref(&source_data()["pages"][id], name) {
            return Some(id);
        }
    }
    match tool["category"].as_str()? {
        "terminal" | "filesystem" | "surfaces" | "screen" | "browser" | "web" | "voice" => {
            Some("chat")
        }
        "agent" => Some("threads"),
        "scheduler" => Some("jobs"),
        "memory" => Some("memory"),
        "network" => Some("network"),
        "channels" | "gateway" | "os" | "meta" | "external" => Some("settings"),
        _ => None,
    }
}
fn is_page_tool(tool: &Value, id: &str) -> bool {
    page_for(tool) == Some(id) || feature_ref(&source_data()["pages"][id], name(tool))
}
pub trait CatalogRegistry: Send + Sync {
    fn list(&self, mcp: bool) -> Vec<Value>;
    fn search(&self, query: &str, candidates: Vec<Value>, limit: usize) -> Vec<Value>;
}
pub struct CatalogTool<R> {
    pub registry: R,
}
impl<R: CatalogRegistry> CatalogTool<R> {
    pub fn new(registry: R) -> Self {
        Self { registry }
    }
    pub fn execute(&self, input: &Value, context: &Value) -> Value {
        let tools = self.registry.list(context["requestedBy"] == "mcp-client");
        let offset = input["toolOffset"].as_f64().unwrap_or(0.0).floor().max(0.0) as usize;
        let query = input["query"].as_str().unwrap_or("").to_lowercase();
        let query = js_trim(&query);
        let words: Vec<_> = query
            .split(js_whitespace)
            .filter(|s| {
                s.encode_utf16().count() > 2
                    && !["the", "for", "with", "jait", "can", "you", "harness"].contains(s)
            })
            .collect();
        let page_id = input["pageId"].as_str().filter(|s| !s.is_empty());
        let all_names: HashSet<_> = tools.iter().map(name).collect();
        let mut detailed = vec![];
        for id in ids().filter(|id| page_id.is_none_or(|wanted| wanted == *id)) {
            let page = &source_data()["pages"][id];
            let resolved: Vec<_> = tools.iter().filter(|t| is_page_tool(t, id)).collect();
            let mut text = vec![
                id.to_string(),
                page["title"].as_str().unwrap().into(),
                page["description"].as_str().unwrap().into(),
            ];
            text.extend(
                page["examples"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .map(|v| v.as_str().unwrap().to_owned()),
            );
            if let Some(parameters) = page["queryParameters"].as_object() {
                text.extend(parameters.values().map(|v| v.as_str().unwrap().to_owned()));
            }
            text.extend(
                page["features"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .map(|f| f["description"].as_str().unwrap().to_owned()),
            );
            text.extend(
                resolved
                    .iter()
                    .map(|t| t["description"].as_str().unwrap().to_owned()),
            );
            let text = text.join(" ").to_lowercase();
            let score = words.iter().filter(|word| text.contains(**word)).count();
            if !words.is_empty() && score == 0 {
                continue;
            }
            let features: Vec<_> = page["features"]
                .as_array()
                .unwrap()
                .iter()
                .map(|f| {
                    let mut feature = f.clone();
                    let refs = f["toolRefs"].as_array().unwrap();
                    feature["availableToolRefs"] = json!(
                        refs.iter()
                            .filter(|n| all_names.contains(n.as_str().unwrap()))
                            .collect::<Vec<_>>()
                    );
                    feature["missingToolRefs"] = json!(
                        refs.iter()
                            .filter(|n| !all_names.contains(n.as_str().unwrap()))
                            .collect::<Vec<_>>()
                    );
                    feature
                })
                .collect();
            let listed:Vec<_>=resolved.iter().skip(offset).take(15).map(|t|json!({"name":t["name"],"risk":t.get("risk").filter(|v|!v.is_null()).cloned().unwrap_or(json!("low")),"consent":t.get("defaultConsentLevel").filter(|v|!v.is_null()).cloned().unwrap_or(json!("none"))})).collect();
            let mut out = json!({"id":id,"title":page["title"],"description":page["description"],"examples":page["examples"],"link":{"pageId":id,"title":page["title"],"href":page["path"]},"features":features,"toolCount":resolved.len(),"hasMoreTools":resolved.len()>offset.saturating_add(15),"tools":listed,"score":score});
            if let Some(parameters) = page.get("queryParameters") {
                out["queryParameters"] = parameters.clone();
            }
            detailed.push(out);
        }
        detailed.sort_by(|a, b| b["score"].as_u64().cmp(&a["score"].as_u64()));
        if !words.is_empty() && page_id.is_none() {
            detailed.truncate(3);
        }
        let pages:Vec<_>=detailed.iter().map(|page|if page_id.is_some(){page.clone()}else{json!({"id":page["id"],"title":page["title"],"description":page["description"],"link":page["link"],"toolCount":page["toolCount"]})}).collect();
        let candidates: Vec<_> = tools
            .iter()
            .filter(|tool| {
                pages
                    .iter()
                    .any(|page| is_page_tool(tool, page["id"].as_str().unwrap()))
            })
            .cloned()
            .collect();
        let selected = if page_id.is_some() {
            candidates.into_iter().skip(offset).take(3).collect()
        } else if !words.is_empty() {
            self.registry.search(query, candidates, 3)
        } else {
            vec![]
        };
        let matches:Vec<_>=selected.iter().map(|tool|json!({"name":tool["name"],"description":tool["description"],"parameters":tool["parameters"],"openai_name":name(tool).replace('.',"_")})).collect();
        let covered: HashSet<_> = tools
            .iter()
            .filter(|t| ids().any(|id| is_page_tool(t, id)))
            .map(name)
            .collect();
        let required: Vec<_> = if page_id.is_some() {
            detailed
                .iter()
                .flat_map(|p| p["tools"].as_array().unwrap())
                .filter(|t| !matches.iter().any(|m| m["name"] == t["name"]))
                .map(|t| t["name"].clone())
                .collect()
        } else {
            vec![]
        };
        let count = pages.len();
        let links: Vec<_> = pages.iter().map(|p| p["link"].clone()).collect();
        let mut data = json!({"version":1,"pages":pages,"matches":matches,"pageLinks":links,"uncataloguedTools":tools.iter().filter(|t|!covered.contains(name(t))).map(|t|json!({"name":t["name"]})).collect::<Vec<_>>(),"schemaLookupRequired":required});
        while !data["matches"].as_array().unwrap().is_empty()
            && crate::contracts::bounded_json::JsonGraph::from_value(&data)
                .stringify()
                .unwrap()
                .encode_utf16()
                .count()
                > 10_000
        {
            let removed = data["matches"].as_array_mut().unwrap().pop().unwrap();
            data["schemaLookupRequired"]
                .as_array_mut()
                .unwrap()
                .push(removed["name"].clone());
        }
        json!({"ok":true,"message":if count>0{format!("{count} Jait page(s). Use pageId for details and tools.search for exact tool schemas.")}else{"No matching Jait capability. Try a broader query or omit it to inspect all pages.".into()},"data":data})
    }
}
