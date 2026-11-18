#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::assessments::scope::validate_scope;
use serde_json::{Value, json};
use std::path::PathBuf;
#[test]
fn explicit_authorization_and_scope_limits_match_actual_reference() {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap();
    let vectors: Value =
        serde_json::from_str(include_str!("../vectors/native-assessment-scopes.json")).unwrap();
    let cases = vectors["cases"].as_array().unwrap();
    assert_eq!(cases.len(), 89);
    for chunk in cases.chunks(20) {
        let expected=internal_driver::call(&root,&root.join(".jait/artifacts/gateway-rust/assessment-draft/contracts").join(uuid::Uuid::new_v4().to_string()),json!({"version":1,"calls":[{"op":"nativeassessscope.run","now":vectors["now"],"cases":chunk}]}),&||false).unwrap()[0].clone();
        for (case, expected) in chunk.iter().zip(expected.as_array().unwrap()) {
            let actual = match validate_scope(&case["input"], vectors["now"].as_i64().unwrap()) {
                Ok(scope) => json!({"scope":scope.normalized()}),
                Err(error) => json!({"error":error}),
            };
            assert_eq!(&actual, expected, "case {}", case["name"]);
        }
    }
}
