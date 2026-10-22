#[path = "../src/internal_driver.rs"]
mod internal_driver;
use futures_util::future::LocalBoxFuture;
use jait_gateway::{
    contracts::bounded_json::Utf16Text,
    plugins::contracts::PluginDescriptor,
    tools::{core_io::HostError, registry::*, validate::ToolInput},
};
use serde_json::{Value, json};
use std::{
    cell::{Cell, RefCell},
    collections::HashSet,
    path::PathBuf,
    rc::Rc,
};
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}
fn fail(step: &Value) -> Result<(), HostError> {
    if let Some(v) = step["error"].as_str() {
        return Err(HostError::Error(v.into()));
    }
    if let Some(v) = step.get("thrown") {
        return Err(HostError::Thrown(v.clone()));
    }
    Ok(())
}
fn error(e: HostError) -> Value {
    match e {
        HostError::Error(s) => json!({"error":s}),
        HostError::Thrown(v) => json!({"value":v}),
    }
}
fn registry_error(e: RegistryError) -> Value {
    match e {
        RegistryError::Host(e) => error(e),
        RegistryError::Validation(e) => json!({"validation":{"name":e.name}}),
    }
}
fn set(v: &Value) -> HashSet<String> {
    v.as_array()
        .into_iter()
        .flatten()
        .map(|v| v.as_str().unwrap().into())
        .collect()
}
fn definitions(tools: Vec<Rc<RegisteredTool<Rc<()>>>>) -> Value {
    json!(
        tools
            .iter()
            .map(|t| t.definition.clone())
            .collect::<Vec<_>>()
    )
}
fn ranked(matches: Vec<Rc<RankedToolMatch<Rc<()>>>>) -> Value {
    json!(matches.iter().map(|m| m.value()).collect::<Vec<_>>())
}
fn result_value(result: RegistryResult) -> Value {
    let mut v = json!({"ok":result.ok,"message":result.message.0});
    if let Some(data) = result.data {
        v["data"] = data;
    }
    v
}
struct Model {
    step: Value,
    events: Rc<RefCell<Vec<Value>>>,
}
impl RegistryRanker<Rc<()>> for Model {
    fn enabled(&self, keys: Option<&Value>) -> bool {
        let mut v = json!({"op":"enabled"});
        if let Some(k) = keys {
            v["keys"] = k.clone();
        }
        self.events.borrow_mut().push(v);
        self.step["enabled"] == true
    }
    fn rank<'a>(
        &'a self,
        keys: Option<&'a Value>,
        query: Utf16Text,
        candidates: Vec<Rc<RankedToolMatch<Rc<()>>>>,
    ) -> LocalBoxFuture<'a, Result<RankOutcome<Rc<()>>, HostError>> {
        let mut event = json!({"op":"rank","queryUnits":query.0,"candidates":candidates.iter().map(|m|m.value()).collect::<Vec<_>>(),"descriptions":candidates.iter().map(|m|format!("{}: {}",m.tool.definition["name"].as_str().unwrap(),m.tool.definition["description"].as_str().unwrap())).collect::<Vec<_>>(),"purpose":"tool","signalAbsent":true,"minimumAbsent":true});
        if let Some(k) = keys {
            event["keys"] = k.clone();
        }
        self.events.borrow_mut().push(event);
        Box::pin(async move {
            fail(&self.step)?;
            for (i, score) in self.step["scores"]
                .as_array()
                .into_iter()
                .flatten()
                .enumerate()
            {
                if let Some(m) = candidates.get(i) {
                    m.score.set(score.as_f64().unwrap());
                }
            }
            if self.step["identity"] == true {
                return Ok(RankOutcome::Unchanged);
            }
            let order = self.step["order"]
                .as_array()
                .map(|v| {
                    v.iter()
                        .map(|v| v.as_u64().unwrap() as usize)
                        .collect::<Vec<_>>()
                })
                .unwrap_or_else(|| (0..candidates.len()).rev().collect());
            Ok(RankOutcome::Ranked(
                order.iter().map(|i| candidates[*i].clone()).collect(),
            ))
        })
    }
}
fn tool(
    item: &Value,
    events: Rc<RefCell<Vec<Value>>>,
    original: Rc<RegistryContext<Rc<()>>>,
) -> (Value, ExecutePort<Rc<()>>) {
    let item = item.clone();
    let metadata = item["definition"].clone();
    let execute: ExecutePort<Rc<()>> = Rc::new(move |definition, input, ctx| {
        events.borrow_mut().push(json!({"op":"tool","handler":item.get("handler").unwrap_or(&item["definition"]["name"]),"definition":definition,"inputWire":input.stringify(),"inputKeys":input.keys().map(|v|v.iter().map(|v|v.0.clone()).collect::<Vec<_>>()),"context":ctx.fields,"sameContext":std::ptr::eq(ctx,original.as_ref()),"sameCapabilities":Rc::ptr_eq(&ctx.capabilities,&original.capabilities)}));
        let item = item.clone();
        Box::pin(async move {
            fail(&item["script"])?;
            if let Some(key) = item["script"]["setNumber"]["key"].as_str() {
                input.set_number_property(
                    key,
                    item["script"]["setNumber"]["value"].as_f64().unwrap(),
                );
            }
            let result = if item["script"]["echoWire"] == true {
                json!({"ok":true,"message":input.stringify()})
            } else {
                item["script"]
                    .get("result")
                    .cloned()
                    .unwrap_or(json!({"ok":true,"message":"result"}))
            };
            Ok(RegistryResult {
                ok: result["ok"].clone(),
                message: Utf16Text::from(result["message"].as_str().unwrap()),
                data: result.get("data").cloned(),
            })
        })
    });
    (metadata, execute)
}
async fn compare(cases: Vec<Value>) {
    for batch in cases.chunks(2) {
        let root = root();
        let expected = internal_driver::call(
            &root,
            &root.join(".jait/artifacts/gateway-rust/registry/contracts"),
            json!({"version":1,"calls":[{"op":"nativetoolregistry.run","cases":batch}]}),
            &|| false,
        )
        .unwrap()[0]
            .clone();
        let mut actual = vec![];
        for test in batch {
            let events = Rc::new(RefCell::new(vec![]));
            let next = Rc::new(Cell::new(0));
            let context = Rc::new(RegistryContext {
                fields: test.get("context").cloned().unwrap_or(json!({})),
                capabilities: Rc::new(()),
            });
            let ids: IdGenerator = {
                let next = next.clone();
                let events = events.clone();
                Rc::new(move || {
                    next.set(next.get() + 1);
                    let id = format!("id-{}", next.get());
                    events.borrow_mut().push(json!({"op":"id","id":id}));
                    id
                })
            };
            let mut registry = ToolRegistry::new(ids);
            let audit_cursor = Rc::new(Cell::new(0usize));
            for item in test["tools"].as_array().into_iter().flatten() {
                let (d, e) = tool(item, events.clone(), context.clone());
                registry.register(d, e);
            }
            let mut outcomes = vec![];
            for op in test["ops"].as_array().unwrap() {
                let options = SearchOptions {
                    candidates: op["options"]["candidates"].as_array().map(|v| {
                        v.iter()
                            .map(|v| registry.get(v.as_str().unwrap()).unwrap())
                            .collect()
                    }),
                    disabled_tools: set(&op["options"]["disabledTools"]),
                    limit: op["options"]["limit"].as_f64(),
                };
                let disabled = set(&op["disabled"]);
                let name = op["name"].as_str().unwrap_or("");
                let outcome: Result<Value, HostError> = match op["op"].as_str().unwrap() {
                    "register" => {
                        let (d, e) = tool(&op["item"], events.clone(), context.clone());
                        registry.register(d, e);
                        Ok(Value::Null)
                    }
                    "plugin" => {
                        registry.register_plugin_tools(
                            &serde_json::from_value::<PluginDescriptor>(op["plugin"].clone())
                                .unwrap(),
                            op["tools"]
                                .as_array()
                                .unwrap()
                                .iter()
                                .map(|i| tool(i, events.clone(), context.clone()))
                                .collect(),
                        );
                        Ok(Value::Null)
                    }
                    "unregister" => Ok(json!(registry.unregister(name))),
                    "get" => Ok(registry
                        .get(name)
                        .map(|t| t.definition.clone())
                        .unwrap_or(Value::Null)),
                    "has" => Ok(json!(registry.has(name))),
                    "names" => Ok(json!(registry.list_names())),
                    "list" => Ok(definitions(registry.list())),
                    "tier" => Ok(definitions(
                        registry.list_by_tier(op["value"].as_str().unwrap()),
                    )),
                    "category" => Ok(definitions(
                        registry.list_by_category(op["value"].as_str().unwrap()),
                    )),
                    "info" => Ok(json!(registry.list_info())),
                    "infoFiltered" => Ok(json!(registry.list_info_filtered(&disabled))),
                    "mcp" => Ok(definitions(registry.list_for_mcp(&disabled))),
                    "llm" => Ok(definitions(registry.list_for_llm(&disabled))),
                    "executable" => Ok(json!(registry.is_executable(name, &disabled))),
                    "rank" => Ok(ranked(
                        registry.rank_search(op["query"].as_str().unwrap(), &options),
                    )),
                    "search" => Ok(definitions(
                        registry.search(op["query"].as_str().unwrap(), &options),
                    )),
                    "select" => Ok(definitions(registry.select_for_llm(
                        op["query"].as_str().unwrap(),
                        disabled,
                        op["limit"].as_f64().unwrap_or(10.0),
                    ))),
                    "model" => registry
                        .rank_search_with_system_one(
                            op["query"].as_str().unwrap(),
                            &options,
                            op.get("keys"),
                            &Model {
                                step: op["model"].clone(),
                                events: events.clone(),
                            },
                        )
                        .await
                        .map(ranked),
                    "execute" => {
                        let mut input = ToolInput::new(&op["input"]);
                        let audit: Option<AuditPort> = if op["audit"] == true {
                            let events = events.clone();
                            let op = op.clone();
                            let cursor = audit_cursor.clone();
                            Some(Rc::new(move |wire| {
                                events.borrow_mut().push(json!({"op":"audit","entry":serde_json::from_str::<Value>(wire).unwrap()}));
                                let i = cursor.get();
                                cursor.set(i + 1);
                                fail(&op["auditSteps"][i])
                            }))
                        } else {
                            None
                        };
                        let result = registry
                            .execute(name, &mut input, &context, audit.as_ref())
                            .await;
                        let mut row = json!({"inputWire":input.stringify()});
                        match result {
                            Ok(v) => row["result"] = result_value(v),
                            Err(e) => row["thrown"] = registry_error(e),
                        }
                        Ok(row)
                    }
                    _ => panic!("unknown registry op"),
                };
                outcomes.push(match outcome {
                    Ok(v) => json!({"value":v}),
                    Err(e) => json!({"thrown":error(e)}),
                });
            }
            actual.push(json!({"outcomes":outcomes,"events":*events.borrow()}));
        }
        for (i, (a, e)) in actual.iter().zip(expected.as_array().unwrap()).enumerate() {
            assert_eq!(a, e, "case {} {:?}", i, batch[i]);
        }
    }
}
fn definition(name: &str, description: &str) -> Value {
    json!({"name":name,"description":description,"parameters":{"type":"object","properties":{}}})
}
fn item(definition: Value) -> Value {
    json!({"definition":definition})
}
#[tokio::test]
async fn normalization_risk_consent_pages_provenance_and_summary_fields_match() {
    let mut cases = vec![];
    for category in [
        "filesystem",
        "terminal",
        "os",
        "surfaces",
        "scheduler",
        "gateway",
        "screen",
        "browser",
        "web",
        "memory",
        "voice",
        "agent",
        "network",
        "channels",
        "meta",
        "external",
    ] {
        let mut tools = vec![];
        for source in [None, Some("builtin"), Some("mcp"), Some("plugin:example")] {
            for tier in [None, Some("core"), Some("external")] {
                let mut d = definition(&format!("generic.tool{}", tools.len()), "description");
                d["category"] = json!(category);
                if let Some(s) = source {
                    d["source"] = json!(s);
                }
                if let Some(s) = tier {
                    d["tier"] = json!(s);
                }
                tools.push(item(d));
            }
        }
        cases.push(json!({"tools":tools,"ops":[{"op":"list"},{"op":"info"},{"op":"category","value":category},{"op":"tier","value":"core"}]}));
    }
    let mut tools = vec![];
    for name in [
        "file.read",
        "file.list",
        "file.stat",
        "surfaces.list",
        "network.scan",
        "file.write",
        "file.patch",
        "terminal.execution",
        "terminal.run",
        "terminal.stream",
        "thread.control",
        "os.install",
        "gateway.redeploy",
        "todo",
        "jait.todos",
        "jait.terminal",
        "user.ask",
        "tools.list",
        "tools.search",
        "jait.catalog",
        "jait.link",
    ] {
        tools.push(item(definition(name, "named inference")));
    }
    cases.push(json!({"tools":tools,"ops":[{"op":"info"}]}));
    let mut d = definition("file.read", "explicit override");
    for (k, v) in [
        ("page", json!("jobs")),
        ("tier", json!("core")),
        ("category", json!("external")),
        ("source", json!("plugin:x")),
        (
            "sourceMetadata",
            json!({"kind":"mcp","serverName":"MCP Server"}),
        ),
        ("risk", json!("medium")),
        ("defaultConsentLevel", json!("none")),
        ("displayName", json!("Display")),
        ("discovery", json!({"aliases":["alias"],"priority":-5})),
    ] {
        d[k] = v;
    }
    cases.push(json!({"tools":[item(d)],"ops":[{"op":"list"},{"op":"info"}]}));
    compare(cases).await;
}
#[tokio::test]
async fn registration_replacement_removal_aliases_and_plugin_metadata_are_exact() {
    let a = item(definition("os.tool", "old"));
    let b = item(definition("os_tool", "alias"));
    let mut plugin = definition("plug.tool", "plugin");
    plugin["tier"] = json!("external");
    plugin["category"] = json!("web");
    plugin["risk"] = json!("low");
    plugin["defaultConsentLevel"] = json!("none");
    plugin["source"] = json!("forged");
    plugin["sourceMetadata"] = json!({"kind":"builtin"});
    compare(vec![json!({"tools":[a,b],"ops":[{"op":"register","item":item(definition("os.tool","new"))},{"op":"names"},{"op":"list"},{"op":"has","name":"os.tool"},{"op":"get","name":"missing"},{"op":"unregister","name":"os.tool"},{"op":"unregister","name":"os.tool"},{"op":"names"},{"op":"register","item":item(definition("os.tool","last"))},{"op":"plugin","plugin":{"id":"p","displayName":"Plugin"},"tools":[item(plugin)]},{"op":"names"},{"op":"info"},{"op":"get","name":"plug.tool"}]})]).await;
}
#[tokio::test]
async fn mcp_initial_llm_and_executable_filters_keep_disabled_and_os_rules() {
    let mut tools = vec![];
    for name in [
        "todo",
        "jait.todos",
        "jait.terminal",
        "user.ask",
        "tools.list",
        "tools.search",
        "jait.catalog",
        "jait.link",
        "os.tool",
        "os_tool",
        "custom",
    ] {
        for source in ["builtin", "mcp", "plugin:p"] {
            for tier in ["core", "standard", "external"] {
                let mut d = definition(&format!("{name}.{source}.{tier}"), "filter");
                d["tier"] = json!(tier);
                d["source"] = json!(source);
                tools.push(item(d));
            }
        }
    }
    // Literal exposed names receive individual overwrite-free fixtures.
    let mut cases = vec![];
    for group in tools.chunks(15) {
        cases.push(json!({"tools":group,"ops":[{"op":"mcp"},{"op":"llm"},{"op":"infoFiltered","disabled":[group[0]["definition"]["name"]]},{"op":"executable","name":group[0]["definition"]["name"],"disabled":[group[0]["definition"]["name"]]},{"op":"executable","name":"absent"}]}));
    }
    for name in MCP_EXPOSED_CORE_TOOL_NAMES {
        for source in ["builtin", "mcp", "plugin:p"] {
            let mut d = definition(name, "exposed");
            d["tier"] = json!("core");
            d["source"] = json!(source);
            cases.push(json!({"tools":[item(d)],"ops":[{"op":"mcp"},{"op":"mcp","disabled":[name]},{"op":"llm"},{"op":"executable","name":name}]}));
        }
    }
    compare(cases).await;
}
#[tokio::test]
async fn lexical_synonym_fuzzy_substring_priorities_ties_and_limits_match() {
    let mut tools = vec![];
    for (name, description) in [
        ("file.read", "Read project files"),
        ("preview.open", "Show application web preview"),
        ("session.search", "Find prior conversation history"),
        ("memory.save", "Store preference for recall"),
        ("terminal.run", "Run on remote host via ssh"),
        ("git.publish", "Release and deploy"),
        ("catalog", "catalogue discovery"),
        ("network.reconnect", "reconnecion reconnection"),
        ("a-B", "duplicate sorting"),
        ("a_b", "duplicate sorting"),
        ("A.b", "duplicate sorting"),
        ("é.tool", "duplicate sorting"),
    ] {
        let mut d = definition(name, description);
        d["discovery"] = json!({"aliases":["browse","inspect"],"capabilities":["visualization"],"examples":["Look at an application"],"priority":if name=="catalog"{-10.5}else{0.25}});
        tools.push(item(d));
    }
    let mut cases = vec![];
    for query in [
        "",
        "please can you do the",
        "file read",
        "FILE.read",
        "open app",
        "previous conversation",
        "remember",
        "machine",
        "deploy site",
        "catalg",
        "reconection",
        "visualizatio",
        "duplica",
        "dupl",
        "tool",
        "ask",
        "toString",
        "constructor",
        "inspect /a-b:FILE",
        "é K İ",
    ] {
        for limit in [None, Some(0.0), Some(-1.0), Some(2.5)] {
            let mut options = json!({});
            if let Some(limit) = limit {
                options["limit"] = json!(limit);
            }
            cases.push(json!({"tools":tools,"ops":[{"op":"rank","query":query,"options":options},{"op":"search","query":query,"options":options},{"op":"select","query":query,"limit":3},{"op":"rank","query":query,"options":{"candidates":["memory.save","file.read","catalog"],"disabledTools":["file.read"]}}]}));
        }
    }
    compare(cases).await;
}
#[tokio::test]
async fn search_budgets_preserve_head_tail_unique_terms_and_long_token_fuzzy_guards() {
    let mut cases = vec![];
    let mut d = definition("target", "before");
    d["discovery"] = json!({"aliases":[format!("head {} tail","x ".repeat(9000))],"examples":[format!("early {} late",(0..400).map(|i|format!("word{i}")).collect::<Vec<_>>().join(" "))]});
    for query in [
        format!("head {} tail", "x".repeat(9000)),
        format!(
            "head {} tail",
            (0..100)
                .map(|i| format!("term{i}"))
                .collect::<Vec<_>>()
                .join(" ")
        ),
        format!("{}target", "z".repeat(64)),
        "x".repeat(32),
        "x".repeat(33),
    ] {
        cases.push(json!({"tools":[item(d.clone()),item(definition("tail","head tail early late"))],"ops":[{"op":"rank","query":query}]}));
    }
    compare(cases).await;
}
#[tokio::test]
async fn system_one_candidate_caps_identity_fallback_scores_zero_limit_and_errors_match() {
    let tools = (0..55)
        .map(|i| {
            item(definition(
                &format!("tool.{i:02}"),
                if i < 3 { "needle" } else { "other" },
            ))
        })
        .collect::<Vec<_>>();
    let mut cases = vec![];
    for query in ["needle", "unmatched", "the", " "] {
        for limit in [None, Some(0.0), Some(-1.0), Some(1.5)] {
            for identity in [true, false] {
                let mut opts = json!({"disabledTools":["tool.01"]});
                if let Some(limit) = limit {
                    opts["limit"] = json!(limit);
                }
                cases.push(json!({"tools":tools,"ops":[{"op":"model","query":query,"options":opts,"keys":{"fake":"fixture"},"model":{"enabled":true,"identity":identity,"scores":[0.1,0.8,0.3]}}]}));
            }
        }
    }
    cases.push(json!({"tools":tools,"ops":[{"op":"model","query":"needle","options":{"limit":0},"model":{"enabled":false}},{"op":"model","query":"needle","model":{"enabled":true,"error":"model failed"}}]}));
    // UTF-16 head slicing splits this otherwise scalar supplementary character.
    let query = format!("{}🦀{}", "a".repeat(4095), "z".repeat(5000));
    cases.push(json!({"tools":[item(definition("a","a"))],"ops":[{"op":"model","query":query,"model":{"enabled":true,"identity":true}}]}));
    compare(cases).await;
}
#[tokio::test]
async fn execution_validation_coercion_audit_context_action_ids_links_and_input_mutation_match() {
    let mut cases = vec![];
    let mut d = definition("custom.tool", "execute");
    d["parameters"] = json!({"type":"object","properties":{"n":{"type":"number"},"b":{"type":"boolean"},"a":{"type":"array","items":{"type":"integer"}},"nested":{"type":"object","properties":{"s":{"type":"string"}}}},"required":["n"]});
    for audit in [false, true] {
        for input in [
            json!({}),
            json!(null),
            json!([]),
            json!("wrong"),
            json!({"n":"2.5","b":"false","a":"[\"1\",2]","nested":"{\"s\":\"text\"}"}),
            json!({"n":"Infinity"}),
            json!({"n":"bad"}),
            json!({"n":0,"unknown":"kept"}),
        ] {
            cases.push(json!({"tools":[item(d.clone())],"context":{"userId":"owner","sessionId":"s"},"ops":[{"op":"execute","name":"custom.tool","input":input,"audit":audit}]}));
        }
    }
    for action in [
        None,
        Some(json!("provided")),
        Some(json!("")),
        Some(Value::Null),
    ] {
        let mut context = json!({"userId":"owner","sessionId":"s"});
        if let Some(action) = action {
            context["actionId"] = action;
        }
        for result in [
            json!({"ok":true,"message":"yes"}),
            json!({"ok":false,"message":"failed","data":null}),
            json!({"ok":true,"message":"array","data":[]}),
            json!({"ok":true,"message":"scalar","data":"text"}),
            json!({"ok":true,"message":"existing","data":{"pageLinks":[],"kept":1}}),
            json!({"ok":true,"message":"replace","data":{"pageLinks":false}}),
        ] {
            cases.push(json!({"tools":[{"definition":definition("file.read","page link"),"script":{"result":result,"setNumber":{"key":"n","value":9}}}],"context":context,"ops":[{"op":"execute","name":"file.read","input":{"n":1},"audit":true}]}));
        }
    }
    cases
        .push(json!({"tools":[],"ops":[{"op":"execute","name":"absent","input":{},"audit":true}]}));
    // Lossless validator output reaches the execution port, including parsed UTF-16.
    let mut d = definition("custom.tool", "wire");
    d["parameters"] = json!({"type":"object","properties":{"nested":{"type":"object"}}});
    cases.push(json!({"tools":[{"definition":d,"script":{"echoWire":true}}],"ops":[{"op":"execute","name":"custom.tool","input":{"nested":"{\"s\":\"\\ud800\"}"}}]}));
    compare(cases).await;
}
#[tokio::test]
async fn execution_errors_and_audit_failure_boundaries_stop_or_record_as_reference() {
    let mut cases = vec![];
    for failure in [
        json!({"error":"port failed"}),
        json!({"thrown":null}),
        json!({"thrown":[null,"x",7]}),
    ] {
        for audit in [false, true] {
            cases.push(json!({"tools":[{"definition":definition("file.read","error"),"script":failure}],"context":{"sessionId":"s"},"ops":[{"op":"execute","name":"file.read","input":{},"audit":audit}]}));
        }
    }
    for steps in [
        json!([{"error":"start audit failed"}]),
        json!([{}, {"error":"result audit failed"}]),
        json!([{}, {"error":"result audit failed"},{"error":"error audit failed"}]),
    ] {
        cases.push(json!({"tools":[item(definition("file.read","audit"))],"ops":[{"op":"execute","name":"file.read","input":{},"audit":true,"auditSteps":steps}]}));
    }
    let mut d = definition("file.read", "enum primitive failure");
    d["parameters"] = json!({"type":"object","properties":{"p":{"type":"object","enum":["x"]}}});
    cases.push(json!({"tools":[item(d)],"ops":[{"op":"execute","name":"file.read","input":{"p":{"toString":1}},"audit":true}]}));
    compare(cases).await;
}
