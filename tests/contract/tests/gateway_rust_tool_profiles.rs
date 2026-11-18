#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::security::{tool_permissions::ToolPermission, tool_profiles::*};
use serde_json::{Value, json};
use std::{collections::HashMap, path::PathBuf};
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}
fn compare(steps: Value) {
    let expected = internal_driver::call(
        &root(),
        &root()
            .join(".jait/artifacts/gateway-rust/tool-profiles")
            .join(uuid::Uuid::new_v4().to_string()),
        json!({"version":1,"calls":[{"op":"nativetoolprofiles.run","steps":steps.clone()}]}),
        &|| false,
    )
    .unwrap()[0]
        .clone();
    let registry = ProfileRegistry::default();
    let mut maps = HashMap::<String, ProfileMap>::new();
    let mut overrides = HashMap::<String, Vec<SharedPermission>>::new();
    let mut held = HashMap::<String, SerializedProfile>::new();
    let mut results = vec![];
    for step in steps.as_array().unwrap() {
        let alias = step["alias"].as_str().unwrap_or("");
        let name = step["name"].as_str().unwrap_or("");
        let result = (|| -> Result<Value, String> {
            Ok(match step["op"].as_str().unwrap() {
                "names" => json!(list_profiles()),
                "get" => {
                    maps.insert(alias.into(), registry.get_profile(name)?);
                    Value::Null
                }
                "serialize" => json!(registry.serialize_profile(name)?),
                "hold" => {
                    held.insert(alias.into(), registry.serialize_profile(name)?);
                    Value::Null
                }
                "held" => json!(held[alias]),
                "overrides" => {
                    let values: Vec<ToolPermission> =
                        serde_json::from_value(step["permissions"].clone()).unwrap();
                    overrides.insert(
                        alias.into(),
                        values.into_iter().map(SharedPermission::new).collect(),
                    );
                    Value::Null
                }
                "extend" => {
                    maps.insert(
                        alias.into(),
                        registry.extend_profile(
                            name,
                            overrides
                                .get(step["overrides"].as_str().unwrap_or(""))
                                .map(Vec::as_slice)
                                .unwrap_or(&[]),
                        )?,
                    );
                    Value::Null
                }
                "snapshot" => json!(maps[alias].entries()),
                "remove" => json!(
                    maps.get_mut(alias)
                        .unwrap()
                        .remove(step["key"].as_str().unwrap())
                ),
                "mutate" | "mutateOverride" => {
                    let target = if step["op"] == "mutate" {
                        maps[alias].get(step["key"].as_str().unwrap()).unwrap()
                    } else {
                        overrides[alias][step["index"].as_u64().unwrap() as usize].clone()
                    };
                    let mut value = json!(target.snapshot());
                    for (key, field) in step["patch"].as_object().unwrap() {
                        value[key] = field.clone();
                    }
                    *target.0.lock().unwrap() = serde_json::from_value(value).unwrap();
                    Value::Null
                }
                _ => panic!("operation"),
            })
        })();
        results.push(result.unwrap_or_else(|error| json!({"error":error})));
    }
    assert_eq!(json!(results), expected, "steps {steps}");
}
#[test]
fn complete_profile_data_and_order_match_actual_reference() {
    compare(
        json!([{"op":"names"},{"op":"serialize","name":"minimal"},{"op":"serialize","name":"coding"},{"op":"serialize","name":"full"}]),
    );
}
#[test]
fn unknown_and_prototype_profile_names_are_rejected() {
    let mut steps = vec![];
    for name in [
        "",
        "Minimal",
        "unknown",
        "constructor",
        "__proto__",
        "toString",
        "hasOwnProperty",
    ] {
        for op in ["get", "extend", "serialize"] {
            steps.push(json!({"op":op,"alias":"x","name":name}));
        }
    }
    compare(json!(steps));
}
fn permission(name: &str, description: &str) -> Value {
    json!({"toolName":name,"consentLevel":"dangerous","risk":"high","description":description})
}
#[test]
fn overriding_existing_keys_keeps_position_and_last_override_wins() {
    compare(
        json!([{"op":"overrides","alias":"o","permissions":[permission("new","first"),permission("file.read","read override"),permission("new","second")]},
        {"op":"extend","alias":"extended","name":"coding","overrides":"o"},{"op":"snapshot","alias":"extended"},
        {"op":"mutateOverride","alias":"o","index":2,"patch":{"description":"later change"}},{"op":"snapshot","alias":"extended"},
        {"op":"serialize","name":"coding"}]),
    );
}
#[test]
fn map_structure_is_independent_but_permission_values_are_shared() {
    compare(
        json!([{"op":"get","alias":"a","name":"coding"},{"op":"get","alias":"b","name":"coding"},
        {"op":"remove","alias":"a","key":"todo"},{"op":"remove","alias":"a","key":"todo"},
        {"op":"mutate","alias":"a","key":"terminal.run","patch":{"consentLevel":"always","description":"changed","deniedCommands":["blocked **"]}},
        {"op":"snapshot","alias":"b"},{"op":"get","alias":"fresh","name":"coding"},{"op":"snapshot","alias":"fresh"},
        {"op":"get","alias":"minimal","name":"minimal"},{"op":"snapshot","alias":"minimal"}]),
    );
}
#[test]
fn serialized_values_keep_identity_and_future_maps_use_changed_names() {
    compare(
        json!([{"op":"get","alias":"a","name":"minimal"},{"op":"hold","alias":"serialized","name":"minimal"},
        {"op":"mutate","alias":"a","key":"file.read","patch":{"toolName":"renamed.read","description":"updated"}},
        {"op":"held","alias":"serialized"},{"op":"snapshot","alias":"a"},{"op":"get","alias":"fresh","name":"minimal"},{"op":"snapshot","alias":"fresh"}]),
    );
}
