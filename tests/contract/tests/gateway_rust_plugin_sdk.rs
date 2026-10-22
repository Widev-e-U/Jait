#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::{
    plugins::contracts::*,
    security::{contracts::Risk, tool_permissions::ConsentLevel},
};
use serde_json::{Map, Value, json};
use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
};
fn reference(calls: Vec<Value>) -> Vec<Value> {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap();
    internal_driver::call(
        &root,
        &root
            .join(".jait/artifacts/gateway-rust/plugin-sdk")
            .join(uuid::Uuid::new_v4().to_string()),
        json!({"version":1,"calls":calls}),
        &|| false,
    )
    .unwrap()
    .as_array()
    .unwrap()
    .clone()
}
type Handler = Arc<dyn Fn(Value, Value) -> Value + Send + Sync>;
fn declaration(v: &Value, handler: Handler) -> PluginToolDeclaration<Handler> {
    let extra = v.as_object().unwrap().clone();
    PluginToolDeclaration {
        name: v["name"].as_str().unwrap().into(),
        description: v["description"].as_str().unwrap().into(),
        parameters: v["parameters"].clone(),
        tier: serde_json::from_value(v["tier"].clone()).unwrap(),
        category: serde_json::from_value(v["category"].clone()).unwrap(),
        risk: serde_json::from_value(v["risk"].clone()).unwrap(),
        default_consent_level: serde_json::from_value(v["defaultConsentLevel"].clone()).unwrap(),
        extra,
        execute: handler,
    }
}
#[test]
fn source_provenance_overrides_spoofing_preserves_metadata_and_execute_identity() {
    let tiers = ["core", "standard", "external"];
    let categories = [
        "terminal",
        "filesystem",
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
    ];
    for id in ["fixture", "@scope/id", "", "a:b/🦀"] {
        let mut calls = vec![];
        for (i, category) in categories.iter().enumerate() {
            calls.push(json!({"op":"nativepluginsdk.metadata","plugin":{"id":id,"displayName":"Extension 🦀"},"tool":{"name":"fixture.run","description":"desc","parameters":{"type":"object","properties":{}},"tier":tiers[i%3],"category":category,"risk":(["low","medium","high"][i%3]),"defaultConsentLevel":(["none","once","always","dangerous"][i%4]),"source":"builtin","sourceMetadata":{"kind":"builtin"},"page":"chat","displayName":"Run fixture","discovery":{"aliases":["go"]},"future":{"enabled":true},"__proto__":{"polluted":true}},"input":{"message":i},"context":{"sessionId":"fixture","actionId":"a","userId":"owner","requestedBy":"test","projectRoot":"/fixture"}}));
        }
        let expected = reference(calls.clone());
        for (call, expected) in calls.iter().zip(expected) {
            let plugin: PluginDescriptor = serde_json::from_value(call["plugin"].clone()).unwrap();
            let handler: Handler = Arc::new(
                |input, context| json!({"ok":true,"message":"fixture","data":{"input":input,"context":context}}),
            );
            let tool = declaration(&call["tool"], handler.clone());
            let unchanged = tool.extra.clone();
            let actual = to_plugin_tool_definition(&plugin, &tool);
            assert_eq!(
                json!({"metadata":build_plugin_tool_source_metadata(&plugin),"definition":actual.metadata,"definitionKeys":actual.metadata.keys().collect::<Vec<_>>(),"identity":Arc::ptr_eq(&handler,&actual.execute),"inputUnchanged":tool.extra==unchanged,"executed":(actual.execute)(call["input"].clone(),call["context"].clone())}),
                expected
            );
        }
    }
}
struct Context {
    config: Mutex<Value>,
    trace: Mutex<Vec<Value>>,
}
impl PluginLog for Context {
    fn info(&self, m: &str, a: &[Value]) {
        self.trace.lock().unwrap().push(json!(["info", m, a]));
    }
    fn warn(&self, m: &str, a: &[Value]) {
        self.trace.lock().unwrap().push(json!(["warn", m, a]));
    }
    fn error(&self, m: &str, a: &[Value]) {
        self.trace.lock().unwrap().push(json!(["error", m, a]));
    }
}
impl PluginContext for Context {
    fn gateway_version(&self) -> &str {
        "fixture"
    }
    fn project_root(&self) -> &str {
        "/fixture"
    }
    fn get_config(&self) -> Result<Value, PluginError> {
        Ok(self.config.lock().unwrap().clone())
    }
    fn set_config(
        &self,
        v: Map<String, Value>,
    ) -> futures_util::future::BoxFuture<'_, Result<(), PluginError>> {
        Box::pin(async move {
            *self.config.lock().unwrap() = Value::Object(v);
            Ok(())
        })
    }
    fn log(&self) -> &dyn PluginLog {
        self
    }
}
#[tokio::test]
async fn construction_is_lazy_callbacks_preserve_identity_errors_and_repeat_dispose() {
    let calls = vec![
        json!({"id":"fixture","displayName":"Fixture","context":{"scope":"fixture"}}),
        json!({"id":"fixture","displayName":"Fixture","context":{"scope":"fixture"},"customDispose":true,"contribution":{"channels":[{"id":"x"}],"settingsSchema":{"type":"object"}}}),
        json!({"id":"fixture","displayName":"Fixture","context":{"scope":"fixture"},"customDispose":true,"setupError":{"reason":"setup rejected"},"disposeError":"dispose rejected"}),
    ];
    let expected = reference(
        calls
            .iter()
            .map(|v| {
                let mut v = v.clone();
                v["op"] = json!("nativepluginsdk.lifecycle");
                v
            })
            .collect(),
    );
    for (call, expected) in calls.into_iter().zip(expected) {
        let trace = Arc::new(Mutex::new(Vec::<Value>::new()));
        let context = Arc::new(Context {
            config: Mutex::new(call["context"].clone()),
            trace: Mutex::new(vec![]),
        });
        let setup: Setup<Value, Handler> = {
            let trace = trace.clone();
            let call = call.clone();
            Arc::new(move |ctx| {
                let trace = trace.clone();
                let call = call.clone();
                Box::pin(async move {
                    trace
                        .lock()
                        .unwrap()
                        .push(json!(["setup", ctx.get_config()?]));
                    if let Some(error) = call.get("setupError") {
                        return Err(PluginError::Thrown(error.clone()));
                    }
                    Ok(call.get("contribution").map(|v| PluginContribution {
                        tools: None,
                        channels: v["channels"].as_array().cloned(),
                        settings_schema: v.get("settingsSchema").cloned(),
                        permissions: None,
                    }))
                })
            })
        };
        let dispose: Dispose = {
            let trace = trace.clone();
            let call = call.clone();
            Arc::new(move || {
                let trace = trace.clone();
                let call = call.clone();
                Box::pin(async move {
                    trace.lock().unwrap().push(json!(["dispose"]));
                    if let Some(error) = call.get("disposeError") {
                        return Err(PluginError::Thrown(error.clone()));
                    }
                    Ok(())
                })
            })
        };
        let custom = call["customDispose"] == true;
        let module = define_plugin(PluginEntry {
            id: call["id"].as_str().unwrap().into(),
            display_name: call["displayName"].as_str().unwrap().into(),
            setup: setup.clone(),
            dispose: custom.then(|| dispose.clone()),
        });
        let mut actual = json!({"id":module.id,"displayName":module.display_name,"keys":["id","displayName","setup","dispose"],"setupIdentity":Arc::ptr_eq(&module.setup,&setup),"disposeIdentity":if custom{json!(Arc::ptr_eq(&module.dispose,&dispose))}else{Value::Null},"initialCalls":*trace.lock().unwrap()});
        match (module.setup)(context.clone()).await {
            Ok(Some(c)) => {
                let mut out = json!({});
                if let Some(channels) = c.channels {
                    out["channels"] = json!(channels);
                }
                if let Some(settings) = c.settings_schema {
                    out["settingsSchema"] = settings;
                }
                actual["contribution"] = out;
            }
            Ok(None) => {}
            Err(PluginError::Thrown(v)) => {
                actual["setupError"] = v;
            }
            Err(e) => panic!("{e:?}"),
        }
        for _ in 0..2 {
            match (module.dispose)().await {
                Ok(()) => {}
                Err(PluginError::Thrown(v)) => {
                    actual["disposeError"] = v;
                }
                Err(e) => panic!("{e:?}"),
            }
        }
        actual["calls"] = json!(*trace.lock().unwrap());
        assert_eq!(actual, expected);
        context
            .set_config(serde_json::from_value(json!({"saved":true})).unwrap())
            .await
            .unwrap();
        assert_eq!(context.get_config().unwrap(), json!({"saved":true}));
        assert_eq!(context.gateway_version(), "fixture");
        assert_eq!(context.project_root(), "/fixture");
        context.log().info("a", &[json!(1)]);
        context.log().warn("b", &[]);
        context.log().error("c", &[json!(null)]);
        assert_eq!(
            *context.trace.lock().unwrap(),
            vec![
                json!(["info", "a", [1]]),
                json!(["warn", "b", []]),
                json!(["error", "c", [null]])
            ]
        );
    }
}
#[test]
fn installed_records_closed_statuses_and_required_policy_fields() {
    let records=["installed","enabled","disabled","error"].map(|status|json!({"id":"fixture","displayName":"Fixture","version":"1.0.0","path":"/fixture","status":status,"config":{"nested":[1,true,null]},"installedAt":"now","updatedAt":"later"}));
    for v in records {
        let typed: InstalledPlugin = serde_json::from_value(v.clone()).unwrap();
        assert_eq!(serde_json::to_value(typed).unwrap(), v);
        let mut full = v;
        full["error"] = json!("failed");
        full["author"] = json!("A");
        full["description"] = json!("");
        let typed: InstalledPlugin = serde_json::from_value(full.clone()).unwrap();
        assert_eq!(serde_json::to_value(typed).unwrap(), full);
    }
    assert!(serde_json::from_value::<PluginStatus>(json!("running")).is_err());
    assert!(serde_json::from_value::<ToolTier>(json!("privileged")).is_err());
    assert!(serde_json::from_value::<ToolCategory>(json!("unknown")).is_err());
    assert_eq!(serde_json::to_value(Risk::High).unwrap(), json!("high"));
    assert_eq!(
        serde_json::to_value(ConsentLevel::Dangerous).unwrap(),
        json!("dangerous")
    );
}

#[test]
fn positive_negative_sdk_declarations_compile_against_typescript_source() {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap();
    let mut roots = std::fs::read_dir(root.join("node_modules/.bun"))
        .unwrap()
        .flatten()
        .filter(|p| p.file_name().to_string_lossy().starts_with("@types+node@"))
        .map(|p| p.path().join("node_modules/@types"))
        .filter(|p| p.join("node/index.d.ts").is_file())
        .collect::<Vec<_>>();
    roots.sort();
    let output = std::process::Command::new("node")
        .arg(root.join("node_modules/typescript/bin/tsc"))
        .args([
            "--noEmit",
            "--strict",
            "--target",
            "ES2022",
            "--module",
            "ESNext",
            "--moduleResolution",
            "bundler",
            "--skipLibCheck",
            "--allowImportingTsExtensions",
            "--types",
            "node",
            "--typeRoots",
        ])
        .arg(roots.last().unwrap())
        .arg(root.join("tests/contract/drivers/nativepluginsdk.ts"))
        .current_dir(root)
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "{}{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    let records = reference(vec![json!({"op":"nativepluginsdk.records"})]);
    for value in records[0].as_array().unwrap() {
        let typed: InstalledPlugin = serde_json::from_value(value.clone()).unwrap();
        assert_eq!(serde_json::to_value(typed).unwrap(), *value);
    }
}
