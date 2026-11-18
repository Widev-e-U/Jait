#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::{
    contracts::bounded_json::Utf16Text,
    prompts::{
        self, AgentPrompt, BuiltinPrompt, GlobalInstructions, ModelEndpoint, PromptContext,
        PromptRegistry,
    },
};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{fs, path::PathBuf, sync::Arc};
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}
fn directory() -> PathBuf {
    let p = root()
        .join(".jait/artifacts/gateway-rust/native-prompts")
        .join(uuid::Uuid::new_v4().to_string());
    fs::create_dir_all(&p).unwrap();
    p
}
fn reference(call: Value, dir: &std::path::Path) -> Value {
    internal_driver::call(&root(), dir, json!({"version":1,"calls":[call]}), &|| false).unwrap()[0]
        .clone()
}
fn snap(units: &[u16]) -> Value {
    let bytes = units
        .iter()
        .flat_map(|n| n.to_le_bytes())
        .collect::<Vec<_>>();
    json!({"length":units.len(),"sha256":hex::encode(Sha256::digest(bytes))})
}
fn string(s: &str) -> Value {
    snap(&s.encode_utf16().collect::<Vec<_>>())
}
fn optional(s: Option<String>) -> Value {
    s.map(|s| string(&s)).unwrap_or(Value::Null)
}
fn loader(call: &Value, dir: &std::path::Path) -> GlobalInstructions {
    let project = root();
    let state = dir.join("state");
    let home = dir.join("home");
    fs::create_dir_all(&state).unwrap();
    fs::create_dir_all(&home).unwrap();
    if let Some(global) = call["global"].as_str() {
        fs::write(state.join("SOUL.md"), global).unwrap();
    }
    for file in call["files"].as_array().into_iter().flatten() {
        let base = match file["scope"].as_str() {
            Some("home") => &home,
            Some("state") => &state,
            _ => &project,
        };
        let path = base.join(file["path"].as_str().unwrap());
        if file["directory"] == true {
            fs::create_dir_all(&path).unwrap();
            continue;
        }
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        if let Some(bytes) = file["bytes"].as_array() {
            fs::write(
                &path,
                bytes
                    .iter()
                    .map(|n| n.as_u64().unwrap() as u8)
                    .collect::<Vec<_>>(),
            )
            .unwrap();
        } else {
            fs::write(&path, file["content"].as_str().unwrap()).unwrap();
        }
    }
    GlobalInstructions {
        soul_path: call["soulPath"].as_str().map(String::from),
        legacy_path: call["legacyPath"].as_str().map(String::from),
        state_directory: state,
        home,
        cwd: root(),
    }
}
struct Custom(Value);
impl AgentPrompt for Custom {
    fn name(&self) -> &str {
        self.0["name"].as_str().unwrap()
    }
    fn family_prefixes(&self) -> Vec<&str> {
        self.0["prefixes"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(Value::as_str)
            .collect()
    }
    fn matches_model(&self, e: &ModelEndpoint) -> bool {
        self.0["matcher"]
            .as_str()
            .is_some_and(|s| e.model.contains(s))
    }
    fn system(&self, _mode: &str, _e: &ModelEndpoint) -> String {
        self.0["system"].as_str().unwrap_or("").into()
    }
    fn reminder(&self, _mode: &str, _e: &ModelEndpoint) -> Option<String> {
        self.0["reminder"].as_str().map(String::from)
    }
    fn identity(&self, _e: &ModelEndpoint) -> Option<String> {
        self.0["identity"].as_str().map(String::from)
    }
    fn safety(&self, _e: &ModelEndpoint) -> Option<String> {
        self.0["safety"].as_str().map(String::from)
    }
    fn internal(&self) -> bool {
        self.0["internal"] == true
    }
}
fn render(mut call: Value) -> Value {
    call["op"] = json!("nativeprompts.render");
    let dir = directory();
    let global = loader(&call, &dir).load();
    let expected = reference(call.clone(), &dir);
    let mut registry = PromptRegistry::builtin();
    for custom in call["custom"].as_array().into_iter().flatten() {
        registry.register(Arc::new(Custom(custom.clone())));
    }
    let cases=call["cases"].as_array().unwrap().iter().map(|c|{
        let endpoint=ModelEndpoint{model:c["model"].as_str().unwrap().into(),base_url:c["baseUrl"].as_str().unwrap_or("https://fixture.invalid/v1").into(),backend:c["backend"].as_str().map(String::from)};
        let mode=c["mode"].as_str().unwrap();
        if let Some(name)=c["direct"].as_str(){
            let r=BuiltinPrompt::named(name).unwrap();
            return json!({"resolver":r.name(),"matched":r.matches_model(&endpoint),"prefixes":r.family_prefixes(),"internal":r.internal(),"raw":string(&r.system(mode,&endpoint)),"reminder":optional(r.reminder(mode,&endpoint))});
        }
        let context=c.get("context").or_else(||call.get("context"));
        let context:PromptContext=context.filter(|v|!v.is_null()).map(|v|serde_json::from_value(v.clone()).unwrap()).unwrap_or_default();
        let r=registry.resolve(&endpoint).unwrap();
        json!({"resolver":r.name(),"raw":string(&r.system(mode,&endpoint)),
            "reminder":optional(registry.reminder(mode,&endpoint)),
            "system":snap(&registry.build(mode,&endpoint,&context,global.as_ref()).unwrap().0)})
    }).collect::<Vec<_>>();
    let actual = json!({"order":registry.list_resolvers(),"cases":cases});
    assert_eq!(actual, expected, "prompt call: {call}");
    actual
}
#[test]
fn every_model_resolver_and_branch_has_exact_prompt_and_reminder_text() {
    let cases = [
        ("default", "unknown"),
        ("anthropic", "claude-sonnet-4"),
        ("anthropic", "claude-sonnet-4-20250514"),
        ("anthropic", "claude-4.5"),
        ("anthropic", "claude-4-5"),
        ("anthropic", "claude-4.6"),
        ("gemini", "gemini"),
        ("gemini", "gemini-experimental"),
        ("gemini", "GEMINI-HIDDEN"),
        ("default-openai", "gpt-4o"),
        ("gpt51", "gpt-5.1"),
        ("gpt52", "gpt-5.2"),
        ("gpt5-codex", "gpt-5-codex"),
        ("gpt5", "gpt-5-mini"),
        ("gpt5", "gpt-5"),
        ("xai", "grok"),
        ("glm", "glm"),
        ("ollama", "local"),
        ("qwen-ollama", "qwen"),
        ("deepseek", "deepseek"),
    ]
    .into_iter()
    .flat_map(|(name, model)| {
        ["agent", "ask", "plan", "swarm", "unknown"]
            .map(|mode| json!({"direct":name,"model":model,"mode":mode}))
    })
    .collect::<Vec<_>>();
    render(json!({"cases":cases}));
}
#[test]
fn model_selection_preserves_matcher_prefix_and_registration_precedence() {
    let models = [
        "unknown",
        "CLAUDE-sonnet-4",
        "Anthropic/example",
        "gemini-hidden",
        "GEMINI-experimental",
        "gpt-4o",
        "gpt-5.1",
        "gpt-5.2",
        "gpt-5-codex",
        "GPT-5-CODEX-max",
        "gpt-5-mini",
        "o3",
        "o3-mini",
        "o4-x",
        "OpenAI-model",
        "grok-code",
        "GLM",
        "prefix-glm-suffix",
        "qwen",
        "DeepSeek",
        "provider/deepseek-v3",
        "provider/deepseek/model",
        "xdeepseek",
        "deepseek2",
        "deepseeK",
        "o4-mini",
    ];
    let cases = models
        .into_iter()
        .flat_map(|model| {
            [None, Some("ollama"), Some("other")]
                .map(|backend| json!({"model":model,"backend":backend,"mode":"agent"}))
        })
        .collect::<Vec<_>>();
    let v = render(json!({"cases":cases}));
    assert_eq!(v["cases"][18]["resolver"], "gpt5");
}
#[test]
fn full_context_building_preserves_global_folder_skill_style_and_environment_order() {
    let context = json!({"projectRoot":"C:/fixture/project","platform":"Windows","shell":"PowerShell","hostname":"fixture-host",
        "skills":[{"name":"<&\"'","description":"description & <data>","filePath":"C:/skills/a/SKILL.md","enabled":false}],
        "architectureGraph":" \u{feff}graph TD; A --> B \u{2029}","responseStyle":"caveman","projectInstructions":" \u{feff}folder rules \n","systemOne":true});
    let cases = [
        "gpt-4o",
        "glm",
        "deepseek",
        "claude-4.6",
        "unknown",
        "qwen:32b",
    ]
    .into_iter()
    .flat_map(|model| {
        ["agent", "ask", "plan", "swarm"].map(|mode| json!({"model":model,"mode":mode}))
    })
    .collect::<Vec<_>>();
    render(json!({"cases":cases,"context":context,"global":" \u{feff}global rules \n"}));
}
#[test]
fn local_backend_context_and_missing_or_empty_optional_fields_match() {
    let contexts = [
        json!({}),
        json!({"projectRoot":"","platform":"ignored","shell":"ignored","hostname":"ignored","responseStyle":"normal"}),
        json!({"projectRoot":"  ","backend":"ollama","projectInstructions":"folder"}),
        json!({"projectRoot":"/fixture","backend":"ollama","skills":[{"name":"skip","description":"skip","filePath":"skip"}],"architectureGraph":"skip","responseStyle":"simple"}),
        json!({"responseStyle":"caveman-ultra","projectInstructions":"\u{0085}"}),
    ];
    let cases = contexts
        .into_iter()
        .flat_map(|context| {
            ["gpt-4o", "qwen"].map(|model| json!({"model":model,"mode":"ask","context":context}))
        })
        .collect::<Vec<_>>();
    render(json!({"cases":cases}));
}
#[test]
fn utf16_graph_and_global_limits_preserve_a_split_surrogate() {
    let graph = "a".repeat(3999) + "😀" + "rest";
    let global = "g".repeat(11999) + "😀" + "tail";
    render(
        json!({"cases":[{"model":"gpt-4o","mode":"agent"}],"context":{"architectureGraph":graph},"global":global}),
    );
}
#[test]
fn custom_registry_resolution_and_nullish_identity_reminder_rules_match() {
    let custom = json!([
        {"name":"first","prefixes":["custom"],"system":"first"},
        {"name":"specific","matcher":"exact","system":"jait.catalog tools.search","reminder":"","identity":"","safety":"","internal":true},
        {"name":"last","prefixes":["custom"],"system":"last","reminder":null}
    ]);
    render(json!({"custom":custom,"cases":[
        {"model":"custom/exact","mode":"agent"},{"model":"custom/name","mode":"agent"},{"model":"unknown","mode":"plan"},
        {"model":"exact","mode":"ask","context":{"projectRoot":"/fixture"}}]}));
}
#[test]
fn shared_sections_modes_and_styles_are_exact() {
    let call = json!({"op":"nativeprompts.shared","modes":["agent","ask","plan","swarm","unknown"],"styles":["normal","simple","caveman","caveman-ultra","unknown",null]});
    let expected = reference(call.clone(), &directory());
    let data: Value = serde_json::from_str(include_str!(
        "../../../packages/gateway-rust/src/prompts/assets.json"
    ))
    .unwrap();
    let strings = data["shared"]
        .as_object()
        .unwrap()
        .keys()
        .map(|key| (key.clone(), string(prompts::shared(key).unwrap())))
        .collect::<serde_json::Map<_, _>>();
    let modes = call["modes"]
        .as_array()
        .unwrap()
        .iter()
        .map(|v| string(prompts::mode_instructions(v.as_str().unwrap())))
        .collect::<Vec<_>>();
    let styles=call["styles"].as_array().unwrap().iter().map(|v|{
        let style=v.as_str().unwrap_or("");
        json!({"valid":prompts::is_response_style(style),"text":prompts::response_style(style).map(string)})
    }).collect::<Vec<_>>();
    assert_eq!(
        json!({"strings":strings,"modes":modes,"styles":styles,"defaults":[string(prompts::default_identity()),string(prompts::default_safety()),string(prompts::default_reminder())]}),
        expected
    );
}
#[test]
fn global_instruction_file_precedence_tilde_errors_and_utf8_match() {
    let calls = [
        json!({"global":" \u{feff} default \u{0085} "}),
        json!({"global":"\u{feff}\r\n"}),
        json!({"soulPath":"~"}),
        json!({"soulPath":"~/input.md","files":[{"scope":"home","path":"input.md","content":"HOME"}]}),
        json!({"soulPath":"~//nested/input.md","files":[{"scope":"home","path":"nested/input.md","content":"nested"}]}),
        json!({"soulPath":"~\\input.md","files":[{"scope":"home","path":"input.md","content":"backslash"}]}),
        json!({"soulPath":"\u{feff} ","legacyPath":"~/legacy.md","files":[{"scope":"home","path":"legacy.md","content":"legacy"}]}),
        json!({"soulPath":"~/input.md","legacyPath":"~/legacy.md","files":[{"scope":"home","path":"input.md","bytes":[239,187,191,97,195,40,226,130]}]}),
        json!({"soulPath":"~/absent","global":"do not fall back after missing override"}),
        json!({"soulPath":"~/directory","files":[{"scope":"home","path":"directory","directory":true}]}),
    ];
    for mut call in calls {
        call["op"] = json!("nativeprompts.load");
        let dir = directory();
        let expected = reference(call.clone(), &dir);
        let actual = loader(&call, &dir)
            .load()
            .map(|Utf16Text(units)| snap(&units))
            .unwrap_or(Value::Null);
        assert_eq!(actual, expected, "{call}");
    }
    let dir = directory();
    let mut config = loader(&json!({}), &dir);
    config.soul_path = Some("./sub/../input".into());
    assert_eq!(config.path(), root().join("input"));
}
