#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::tools::catalog::{self, CatalogRegistry, CatalogTool};
use serde_json::{Value, json};
use std::{path::PathBuf, sync::Mutex};
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}
fn reference(call: Value) -> Value {
    internal_driver::call(
        &root(),
        &root()
            .join(".jait/artifacts/gateway-rust/catalog/contracts")
            .join(uuid::Uuid::new_v4().to_string()),
        json!({"version":1,"calls":[call]}),
        &|| false,
    )
    .unwrap()[0]
        .clone()
}
fn expand(mut tool: Value) -> Value {
    if let Some(repeat) = tool.get("parameterRepeat") {
        tool["parameters"] = json!({"type":"object","properties":{"text":{"type":"string","description":repeat["unit"].as_str().unwrap().repeat(repeat["count"].as_u64().unwrap()as usize)}}});
    }
    tool.as_object_mut().unwrap().remove("parameterRepeat");
    tool
}
struct Registry {
    test: Value,
    events: Mutex<Vec<Value>>,
}
impl CatalogRegistry for Registry {
    fn list(&self, mcp: bool) -> Vec<Value> {
        self.events
            .lock()
            .unwrap()
            .push(json!({"op":"list","mcp":mcp}));
        let tools = if mcp {
            self.test.get("mcpTools").unwrap_or(&self.test["tools"])
        } else {
            &self.test["tools"]
        };
        tools
            .as_array()
            .unwrap()
            .iter()
            .cloned()
            .map(expand)
            .collect()
    }
    fn search(&self, query: &str, candidates: Vec<Value>, limit: usize) -> Vec<Value> {
        self.events.lock().unwrap().push(json!({"op":"search","query":query,"candidates":candidates.iter().map(|t|t["name"].clone()).collect::<Vec<_>>(),"limit":limit}));
        if let Some(names) = self.test["searchNames"].as_array() {
            names
                .iter()
                .flat_map(|name| candidates.iter().filter(|t| t["name"] == *name).cloned())
                .take(limit)
                .collect()
        } else {
            candidates.into_iter().rev().take(limit).collect()
        }
    }
}
fn tool(name: &str) -> Value {
    json!({"name":name,"description":format!("Operate {name} and inspect its result"),"parameters":{"type":"object","properties":{"value":{"type":"string"}}}})
}
fn tools() -> Vec<Value> {
    let mut tools = vec![];
    let mut names = std::collections::HashSet::new();
    for id in catalog::source_data()["ids"].as_array().unwrap() {
        let page = &catalog::source_data()["pages"][id.as_str().unwrap()];
        for prefix in page["toolPrefixes"].as_array().unwrap() {
            let name = format!("{}fixture", prefix.as_str().unwrap());
            if names.insert(name.clone()) {
                tools.push(tool(&name));
            }
        }
        for f in page["features"].as_array().unwrap() {
            for name in f["toolRefs"].as_array().unwrap() {
                let name = name.as_str().unwrap();
                if names.insert(name.to_owned()) {
                    tools.push(tool(name));
                }
            }
        }
    }
    tools.truncate(40);
    for (category, page) in [
        ("agent", None),
        ("memory", Some("settings")),
        ("external", None),
        ("unknown", None),
    ] {
        let mut t = tool(&format!("custom-{category}"));
        t["category"] = json!(category);
        if let Some(page) = page {
            t["page"] = json!(page);
        }
        tools.push(t);
    }
    tools
}
fn compare(cases: Vec<Value>) {
    for batch in cases.chunks(2) {
        let expected = reference(json!({"op":"nativecatalog.cases","cases":batch}));
        let mut actual = vec![];
        for test in batch {
            let tool = CatalogTool::new(Registry {
                test: test.clone(),
                events: Mutex::new(vec![]),
            });
            let result = tool.execute(
                &test["input"],
                &test.get("context").cloned().unwrap_or(json!({})),
            );
            actual.push(json!({"result":result,"events":*tool.registry.events.lock().unwrap()}));
        }
        assert_eq!(json!(actual), expected, "catalog cases {batch:?}");
    }
}
#[test]
fn source_catalog_pages_and_factory_metadata_match_exactly() {
    assert_eq!(
        catalog::source_data(),
        &reference(json!({"op":"nativecatalog.data"}))
    );
    assert_eq!(catalog::metadata(), &catalog::source_data()["metadata"]);
}
#[test]
fn overview_query_scoring_stopwords_stable_ties_top_three_and_registry_search_match() {
    let tools = tools();
    let mut cases = vec![];
    for query in [
        None,
        Some(""),
        Some("THE jait can you HARNESS"),
        Some("  persistent agents team  "),
        Some("network owned exposure"),
        Some("memory projects sessions"),
        Some("zzznomatchzzz"),
        Some("Scrum team"),
        Some("🦀 tools"),
        Some("  catalog\u{feff}features\u{2028}rooms  "),
        Some("memory memory memory"),
    ] {
        let mut input = json!({});
        if let Some(q) = query {
            input["query"] = json!(q);
        }
        cases.push(json!({"tools":tools,"input":input}));
    }
    compare(cases);
}
#[test]
fn all_page_details_pagination_explicit_refs_prefixes_categories_and_mcp_selection_match() {
    let mut tools = tools();
    for i in 0..20 {
        let mut t = tool(&format!("network.fixture{i}"));
        t["risk"] = json!(if i % 2 == 0 { "high" } else { "low" });
        t["defaultConsentLevel"] = json!(if i % 3 == 0 { "always" } else { "once" });
        tools.push(t);
    }
    let mut cases = vec![];
    for id in catalog::source_data()["ids"]
        .as_array()
        .unwrap()
        .iter()
        .chain([&json!("unknown"), &json!("")])
    {
        for offset in [-1.5, 0.0, 1.9, 15.0, 999999999999999.0] {
            for mcp in [false, true] {
                cases.push(json!({"tools":tools,"mcpTools":tools.iter().step_by(3).cloned().collect::<Vec<_>>(),"input":{"pageId":id,"toolOffset":offset},"context":{"requestedBy":if mcp{"mcp-client"}else{"chat"}}}));
            }
        }
    }
    compare(cases);
}
#[test]
fn exact_schema_lookup_refs_and_utf16_size_budget_remove_only_excess_schemas() {
    let mut cases = vec![];
    for unit in ["a", "🦀", "\"\\\n", "é"] {
        for count in [100, 1800, 4000] {
            let tools: Vec<_> = (0..18)
                .map(|i| {
                    let mut t = tool(&format!("network.fixture{i}"));
                    t["parameterRepeat"] = json!({"unit":unit,"count":count});
                    t
                })
                .collect();
            cases.push(json!({"tools":tools,"input":{"pageId":"network"}}));
            cases.push(json!({"tools":tools,"input":{"query":"network","toolOffset":1},"searchNames":["network.fixture3","network.fixture2","network.fixture0"]}));
        }
    }
    compare(cases);
}

#[test]
fn explicit_feature_refs_override_a_different_page_and_empty_registries_keep_navigation() {
    let mut cases = vec![];
    let mut known = vec![];
    for id in catalog::source_data()["ids"].as_array().unwrap() {
        let id = id.as_str().unwrap();
        if let Some(name) = catalog::source_data()["pages"][id]["features"]
            .as_array()
            .unwrap()
            .iter()
            .flat_map(|f| f["toolRefs"].as_array().unwrap())
            .find_map(Value::as_str)
        {
            let mut t = tool(name);
            t["page"] = json!(if id == "chat" { "settings" } else { "chat" });
            known.push(t);
        }
    }
    for id in catalog::source_data()["ids"].as_array().unwrap() {
        cases.push(json!({"tools":known,"input":{"pageId":id}}));
        cases.push(json!({"tools":[],"input":{"pageId":id,"query":"zzznomatchzzz"}}));
    }
    cases.push(json!({"tools":[],"input":{}}));
    cases.push(json!({"tools":[],"input":{"query":"network"}}));
    compare(cases);
}
