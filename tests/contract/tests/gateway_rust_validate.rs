#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::tools::validate::{ToolInput, validate_tool_input};
use serde_json::{Value, json};
use std::path::PathBuf;
fn compare(cases: &[Value]) {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap();
    let expected = internal_driver::call(
        &root,
        &root
            .join(".jait/artifacts/gateway-rust/validator-contract")
            .join(uuid::Uuid::new_v4().to_string()),
        json!({"version":1,"calls":[{"op":"nativevalidate.run","cases":cases}]}),
        &|| false,
    )
    .unwrap()[0]
        .clone();
    for (case, expected) in cases.iter().zip(expected.as_array().unwrap()) {
        let mut input = if let Some(text) = case["inputJson"].as_str() {
            ToolInput::parse(text).unwrap()
        } else {
            ToolInput::new(&case["input"])
        };
        if let Some(numbers) = case["nonfinite"].as_array() {
            for number in numbers {
                input.set_number_property(
                    number["key"].as_str().unwrap(),
                    match number["value"].as_str().unwrap() {
                        "NaN" => f64::NAN,
                        "-Infinity" => f64::NEG_INFINITY,
                        _ => f64::INFINITY,
                    },
                );
            }
        }
        let mut actual = match validate_tool_input(&case["schema"], &mut input) {
            Ok(result) => json!({"outcomeJson":serde_json::to_string(&result).unwrap()}),
            Err(error) => json!({"thrown":error}),
        };
        actual["afterJson"] = json!(input.stringify());
        actual["keysJson"] = json!(serde_json::to_string(&input.keys()).unwrap());
        assert_eq!(&actual, expected, "case {}", case["name"]);
    }
}
#[test]
fn reference_schema_coercion_mutation_and_error_matrix() {
    let cases: Vec<Value> =
        serde_json::from_str(include_str!("../vectors/native-validate.json")).unwrap();
    assert!(cases.len() >= 514);
    for chunk in cases.chunks(20) {
        compare(chunk);
    }
}
