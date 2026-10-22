#[path = "../src/internal_driver.rs"]
mod internal_driver;
use futures_util::future::LocalBoxFuture;
use jait_gateway::{
    contracts::bounded_json::Utf16Text,
    tools::{core_io::HostError, meta_tools::*, registry::*, validate::ToolInput},
};
use serde_json::{Value, json};
use std::{cell::RefCell, path::PathBuf, rc::Rc};
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}
fn reference(call: Value) -> Value {
    internal_driver::call(
        &root(),
        &root().join(".jait/artifacts/gateway-rust/meta-tools/contracts"),
        json!({"version":1,"calls":[call]}),
        &|| false,
    )
    .unwrap()[0]
        .clone()
}
struct Mock {
    test: Value,
    events: RefCell<Vec<Value>>,
}
impl DiscoveryRegistry for Mock {
    fn list_for_mcp(&self) -> Vec<Value> {
        self.events.borrow_mut().push(json!({"op":"mcp"}));
        self.test
            .get("mcpTools")
            .unwrap_or(&self.test["tools"])
            .as_array()
            .unwrap()
            .clone()
    }
    fn list_info(&self) -> Vec<Value> {
        self.events.borrow_mut().push(json!({"op":"info"}));
        self.test["tools"].as_array().unwrap().clone()
    }
    fn rank<'a>(
        &'a self,
        query: &'a str,
        candidates: Option<Vec<Value>>,
        limit: f64,
        keys: Option<&'a Value>,
    ) -> LocalBoxFuture<'a, Result<Vec<DiscoveryMatch>, HostError>> {
        let mut event = json!({"op":"rank","query":query,"limit":limit as u64});
        if let Some(candidates) = candidates {
            event["candidates"] = json!(candidates);
        }
        if let Some(keys) = keys {
            event["keys"] = keys.clone();
        }
        self.events.borrow_mut().push(event);
        Box::pin(async move {
            if let Some(error) = self.test["error"].as_str() {
                return Err(HostError::Error(error.into()));
            }
            Ok(self.test["ranked"]
                .as_array()
                .into_iter()
                .flatten()
                .map(|m| DiscoveryMatch {
                    tool: m["tool"].clone(),
                    score: m["score"].as_f64().unwrap(),
                    matched_terms: m["matchedTerms"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .map(|v| v.as_str().unwrap().into())
                        .collect(),
                })
                .collect())
        })
    }
}
struct Disabled;
impl RegistryRanker<()> for Disabled {
    fn enabled(&self, _: Option<&Value>) -> bool {
        false
    }
    fn rank<'a>(
        &'a self,
        _: Option<&'a Value>,
        _: Utf16Text,
        _: Vec<Rc<RankedToolMatch<()>>>,
    ) -> LocalBoxFuture<'a, Result<RankOutcome<()>, HostError>> {
        Box::pin(async { panic!("disabled ranker must not execute") })
    }
}
async fn compare(cases: Vec<Value>) {
    for batch in cases.chunks(2) {
        let expected = reference(json!({"op":"nativemetatools.run","cases":batch}));
        let mut actual = vec![];
        for test in batch {
            let mock = Mock {
                test: test.clone(),
                events: RefCell::new(vec![]),
            };
            let mut registry = ToolRegistry::new(Rc::new(|| "unused".into()));
            if test["real"] == true {
                for tool in test["tools"].as_array().unwrap() {
                    let port: ExecutePort<()> = Rc::new(|_, _: &mut ToolInput, _| {
                        Box::pin(async { panic!("discovery must not execute tools") })
                    });
                    registry.register(tool.clone(), port);
                }
            }
            let native = NativeDiscovery {
                registry: &registry,
                ranker: &Disabled,
            };
            let discovery: &dyn DiscoveryRegistry =
                if test["real"] == true { &native } else { &mock };
            let context = test.get("context").cloned().unwrap_or(json!({}));
            let outcome = if test["tool"] == "tools.list" {
                Ok(list(discovery, &test["input"], &context))
            } else {
                search(discovery, &test["input"], &context).await
            };
            let row = match outcome {
                Ok(result) => {
                    json!({"result":{"ok":result.ok,"message":result.message.0,"data":result.data},"events":*mock.events.borrow()})
                }
                Err(HostError::Error(error)) => {
                    json!({"error":error,"events":*mock.events.borrow()})
                }
                Err(e) => panic!("unexpected error {e:?}"),
            };
            actual.push(row);
        }
        for (i, (a, e)) in actual.iter().zip(expected.as_array().unwrap()).enumerate() {
            assert_eq!(a, e, "case {i} {:?}", batch[i]);
        }
    }
}
fn tool(name: &str, category: &str, tier: &str) -> Value {
    json!({"name":name,"description":format!("Inspect {name} and return deterministic evidence"),"category":category,"tier":tier,"parameters":{"type":"object","properties":{"target":{"type":"string"}},"required":["target"]}})
}
#[test]
fn both_factory_definitions_match_actual_typescript() {
    assert_eq!(
        metadata(),
        &reference(json!({"op":"nativemetatools.metadata"}))
    );
}
#[tokio::test]
async fn listing_preserves_mcp_visibility_group_order_badges_filters_and_full_catalogue() {
    let tools = vec![
        tool("file.read", "filesystem", "standard"),
        tool("tools.list", "meta", "core"),
        tool("third.party", "external", "external"),
        tool("file.write", "filesystem", "standard"),
        tool("os.query", "os", "core"),
    ];
    let mut cases = vec![];
    for context in [
        json!({}),
        json!({"requestedBy":"mcp-client"}),
        json!({"requestedBy":"MCP-client"}),
    ] {
        for input in [
            json!({}),
            json!({"category":"filesystem"}),
            json!({"category":"external"}),
            json!({"category":"absent"}),
            json!({"category":""}),
        ] {
            cases.push(json!({"tool":"tools.list","tools":tools,"mcpTools":[tools[2],tools[0]],"input":input,"context":context}));
        }
    }
    cases.push(json!({"tool":"tools.list","tools":[],"input":{}}));
    compare(cases).await;
}
#[tokio::test]
async fn previews_clip_utf16_whitespace_and_line_budgets_without_losing_full_data() {
    let mut tools = vec![];
    for i in 0..70 {
        let mut t = tool(
            &format!("long.tool{i}"),
            if i < 35 { "filesystem" } else { "meta" },
            "standard",
        );
        t["description"] = json!(format!(
            "  {}🦀suffix\n\ttext\u{feff}  end  ",
            "x".repeat(118)
        ));
        tools.push(t);
    }
    let ranked = tools
        .iter()
        .take(12)
        .enumerate()
        .map(|(i, t)| json!({"tool":t,"score":i as f64/3.0,"matchedTerms":["long"]}))
        .collect::<Vec<_>>();
    compare(vec![json!({"tool":"tools.list","tools":tools,"input":{}}),json!({"tool":"tools.search","tools":[],"ranked":ranked,"input":{"query":"long","limit":12}})]).await;
}
#[tokio::test]
async fn search_limit_clamps_exact_candidates_keys_no_matches_and_error_boundary_match() {
    let tools = vec![
        tool("visible.tool", "meta", "standard"),
        tool("hidden.tool", "os", "core"),
    ];
    let mut cases = vec![];
    for limit in [
        Value::Null,
        json!(-20),
        json!(0),
        json!(1.99),
        json!(20.9),
        json!(1e100),
    ] {
        for mcp in [true, false] {
            cases.push(json!({"tool":"tools.search","tools":tools,"mcpTools":[tools[0]],"input":{"query":"🦀 find \"tools\"","limit":limit},"context":{"requestedBy":if mcp {"mcp-client"}else{"agent"},"apiKeys":{"fixture":"dummy"}}}));
        }
    }
    cases.push(json!({"tool":"tools.search","tools":[],"input":{"query":""}}));
    cases.push(json!({"tool":"tools.search","tools":[],"input":{"query":"tool"},"error":"ranking service failed"}));
    compare(cases).await;
}
#[tokio::test]
async fn search_schemas_aliases_rounding_defaults_and_order_match() {
    let mut cases = vec![];
    for score in [
        0.0,
        0.004999999999999999,
        0.005,
        0.015,
        -0.005,
        -0.015,
        3.12345,
        123456.125,
        1e21,
    ] {
        let mut a = tool("agent.github.token", "meta", "standard");
        a.as_object_mut().unwrap().shift_remove("tier");
        a.as_object_mut().unwrap().shift_remove("category");
        let mut b = tool("a.b_c", "meta", "core");
        b["tier"] = Value::Null;
        b["category"] = Value::Null;
        cases.push(json!({"tool":"tools.search","tools":[],"ranked":[{"tool":a,"score":score,"matchedTerms":["tool","token"]},{"tool":b,"score":score,"matchedTerms":[]}],"input":{"query":"tool"}}));
    }
    compare(cases).await;
}
#[tokio::test]
async fn factories_integrate_with_real_native_and_reference_registries() {
    let mut external = tool("plugin.tool", "external", "external");
    external["source"] = json!("plugin:fixture");
    let mut mcp = tool("mcp.tool", "external", "external");
    mcp["source"] = json!("mcp");
    let tools = vec![
        tool("tools.list", "meta", "core"),
        tool("os.query", "os", "core"),
        tool("file.read", "filesystem", "standard"),
        tool("memory.save", "memory", "standard"),
        external,
        mcp,
    ];
    let mut cases = vec![];
    for requested in ["mcp-client", "agent"] {
        cases.push(json!({"real":true,"tool":"tools.list","tools":tools,"input":{},"context":{"requestedBy":requested}}));
        for query in ["tool", "files", "remember", "unmatched"] {
            cases.push(json!({"real":true,"tool":"tools.search","tools":tools,"input":{"query":query},"context":{"requestedBy":requested}}));
        }
    }
    compare(cases).await;
}
