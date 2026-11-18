//! Rust-owned assertion interpreter for declarative reference vectors.
use crate::internal_driver;
#[path = "source_review_reuse.rs"]
mod source_review_reuse;
use anyhow::{Context, Result, bail, ensure};
use serde::Deserialize;
use serde_json::{Value, value::RawValue};
use std::{fs, path::Path};

/// One reference vector. `calls` stays raw so authored key order reaches the adapter verbatim.
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Case {
    id: String,
    calls: Box<RawValue>,
    assertions: Vec<Value>,
}

impl Case {
    pub fn id(&self) -> &str {
        &self.id
    }

    /// Reviewed declaration whose gated original test this case executes.
    /// The reuse scenario runs the Rust oracle registered for that declaration,
    /// so its registration id is the evidence the declaration actually ran.
    #[allow(dead_code)]
    pub fn reused_declaration(&self) -> Option<String> {
        if !self
            .assertions
            .iter()
            .any(|rule| rule["kind"] == "reused-tail")
        {
            return None;
        }
        let calls: Vec<Value> = serde_json::from_str(self.calls.get()).ok()?;
        calls.first()?.get("test")?.as_str().map(ToOwned::to_owned)
    }
}

// Required registrations for the reviewed token-estimation and validation tests.
// The vectors carry the inputs and predicates; this list makes their removal fail.
const REQUIRED_HELPER_CASE_IDS: &[&str] = &[
    "internal.tailhelpers.plain-and-json-rounding",
    "internal.tailhelpers.unsupported-json",
    "internal.tailhelpers.message-tool-calls",
    "internal.tailhelpers.hidden-thinking",
    "internal.tailhelpers.large-thinking-usage",
    "internal.tailhelpers.history-priming",
    "internal.tailhelpers.usage-categories",
    "internal.tailhelpers.empty-schemas",
    "internal.tailhelpers.usage-summed-categories",
    "internal.tailhelpers.coerce-nested-array",
    "internal.tailhelpers.nested-required-path",
    "internal.tailhelpers.invalid-array-item",
    "internal.tailhelpers.parse-object-then-coerce",
    "internal.tailhelpers.reject-nonfinite",
];

fn validate_required_helper_ids(cases: &[Case]) -> Result<()> {
    for id in REQUIRED_HELPER_CASE_IDS {
        ensure!(
            cases.iter().filter(|case| case.id == *id).count() == 1,
            "required helper case must be registered exactly once: {id}"
        );
    }
    Ok(())
}

// Native differential targets own these documents and their schemas; they are
// not declarative internal-driver vectors. Keep the exceptions exact: every
// other JSON file must still satisfy the reference Case schema, and a new
// `native-*.json` fixture document has to be registered here.
fn is_reference_vector(path: &Path) -> bool {
    path.extension().is_some_and(|ext| ext == "json")
        && !matches!(
            path.file_name().and_then(|name| name.to_str()),
            Some(
                "native-feedback.json"
                    | "native-user-ask.json"
                    | "native-assessment-scopes.json"
                    | "native-session-sql-source-cases.json"
                    | "native-validate.json"
            )
        )
}

pub fn cases(root: &Path) -> Result<Vec<Case>> {
    let vectors = root.join("tests/contract/vectors");
    let mut paths: Vec<_> = fs::read_dir(&vectors)
        .with_context(|| format!("read vectors directory {}", vectors.display()))?
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.path())
        .filter(|path| is_reference_vector(path))
        .collect();
    paths.sort();
    let mut cases = Vec::new();
    for path in paths {
        let source = fs::read_to_string(&path)
            .with_context(|| format!("read vectors {}", path.display()))?;
        let parsed: Vec<Case> = serde_json::from_str(&source)
            .with_context(|| format!("parse vectors {}", path.display()))?;
        for (index, case) in parsed.into_iter().enumerate() {
            let location = format!("{} case {index}", path.display());
            ensure!(
                case.id.starts_with("internal."),
                "invalid vector id at {location}: {}",
                case.id
            );
            ensure!(
                serde_json::from_str::<Vec<Value>>(case.calls.get())
                    .is_ok_and(|calls| !calls.is_empty() && calls.len() <= 64),
                "invalid vector calls at {location}"
            );
            ensure!(
                !case.assertions.is_empty(),
                "vector requires assertions at {location}"
            );
            cases.push(case);
        }
    }
    validate_required_helper_ids(&cases)?;
    for id in [
        "internal.passwords.existing-scrypt-credentials",
        "internal.passwords.malformed-digests",
        "internal.passwords.uppercase-digest",
    ] {
        ensure!(
            cases.iter().filter(|case| case.id == id).count() == 1,
            "required password case must be registered exactly once: {id}"
        );
    }
    Ok(cases)
}

pub fn check(
    root: &Path,
    directory: &Path,
    cancelled: &dyn Fn() -> bool,
    case: &Case,
) -> Result<()> {
    if case
        .assertions
        .iter()
        .any(|rule| rule["kind"] == "reused-tail")
    {
        return source_review_reuse::check(root, case.calls.get(), &case.assertions, cancelled);
    }
    let request = format!("{{\"version\":1,\"calls\":{}}}", case.calls.get());
    let actual = internal_driver::call_request(root, directory, &request, cancelled)?;
    validate(&actual, &case.assertions)
}
#[cfg(test)]
mod helper_registration_tests {
    use super::*;

    fn helpers() -> Vec<Case> {
        serde_json::from_str(include_str!("../vectors/tailhelpers.json")).unwrap()
    }

    #[test]
    fn only_named_native_documents_bypass_reference_vector_parsing() {
        assert!(!is_reference_vector(Path::new("native-feedback.json")));
        assert!(!is_reference_vector(Path::new("native-user-ask.json")));
        for native in [
            "native-assessment-scopes.json",
            "native-session-sql-source-cases.json",
            "native-validate.json",
        ] {
            assert!(
                !is_reference_vector(Path::new(native)),
                "{native} is a native fixture document, not a reference vector"
            );
        }
        assert!(is_reference_vector(Path::new("fixtures.json")));
        assert!(is_reference_vector(Path::new("native-other.json")));
        assert!(!is_reference_vector(Path::new("fixtures.txt")));
        assert!(serde_json::from_str::<Vec<Case>>(r#"{"unexpected":[]}"#).is_err());
        assert!(serde_json::from_str::<Vec<Case>>(r#"[{"name":"native-shaped"}]"#).is_err());
    }

    #[test]
    fn native_fixture_documents_do_not_break_reference_registration() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
        assert!(
            root.join("tests/contract/vectors/native-feedback.json")
                .is_file()
        );
        assert!(
            root.join("tests/contract/vectors/native-user-ask.json")
                .is_file()
        );
        let registered = cases(&root).expect("reference vectors must coexist with native fixtures");
        validate_required_helper_ids(&registered).unwrap();
        assert!(
            registered
                .iter()
                .all(|case| case.id.starts_with("internal."))
        );
    }

    #[test]
    fn all_reviewed_helper_vectors_are_registered() {
        validate_required_helper_ids(&helpers()).unwrap();
    }

    #[test]
    fn removing_a_reviewed_helper_is_rejected() {
        let mut cases = helpers();
        let missing = cases.remove(0).id;
        let error = validate_required_helper_ids(&cases).unwrap_err();
        assert!(error.to_string().contains(&missing));
    }

    #[test]
    fn duplicating_a_reviewed_helper_is_rejected() {
        let mut cases = helpers();
        let duplicate = helpers().remove(0);
        let duplicate_id = duplicate.id.clone();
        cases.push(duplicate);
        let error = validate_required_helper_ids(&cases).unwrap_err();
        assert!(error.to_string().contains(&duplicate_id));
    }
}

fn validate(actual: &Value, assertions: &[Value]) -> Result<()> {
    ensure!(!assertions.is_empty(), "case requires assertions");
    for assertion in assertions {
        let pointer = assertion["path"]
            .as_str()
            .context("missing assertion path")?;
        let original = actual.pointer(pointer).context("missing result path")?;
        let parsed;
        let value = if let Some(inner) = assertion["parse"].as_str() {
            parsed =
                serde_json::from_str::<Value>(original.as_str().context("expected JSON text")?)?;
            parsed
                .pointer(inner)
                .context("missing parsed result path")?
        } else {
            original
        };
        match assertion["kind"]
            .as_str()
            .context("missing assertion kind")?
        {
            "eq" => ensure!(
                value == &assertion["value"],
                "equality assertion failed at {pointer}: {value}"
            ),
            "ne" => ensure!(
                value != &assertion["value"],
                "inequality assertion failed at {pointer}"
            ),
            "contains" => ensure!(
                value
                    .as_str()
                    .context("expected text")?
                    .contains(assertion["value"].as_str().context("expected substring")?),
                "substring absent at {pointer}"
            ),
            "array-contains" => {
                let expected = assertion.get("value").context("missing array member")?;
                ensure!(
                    value
                        .as_array()
                        .context("expected array")?
                        .contains(expected),
                    "array member absent at {pointer}"
                );
            }
            "sum-paths-eq" => {
                let paths = assertion["paths"]
                    .as_array()
                    .context("expected sum paths")?;
                ensure!(!paths.is_empty(), "sum requires operands");
                let mut sum = 0.0;
                for path in paths {
                    sum += actual
                        .pointer(path.as_str().context("expected sum path")?)
                        .and_then(Value::as_f64)
                        .context("missing numeric sum operand")?;
                    ensure!(sum.is_finite(), "non-finite sum");
                }
                ensure!(
                    value.as_f64().context("expected total")? == sum,
                    "sum assertion failed at {pointer}"
                );
            }
            "difference-ge" => {
                let other = actual
                    .pointer(assertion["other"].as_str().context("missing other path")?)
                    .and_then(Value::as_f64)
                    .context("missing numeric difference operand")?;
                let difference = value.as_f64().context("expected number")? - other;
                ensure!(
                    difference.is_finite()
                        && difference
                            >= assertion["value"]
                                .as_f64()
                                .context("expected minimum difference")?,
                    "difference assertion failed at {pointer}"
                );
            }
            "not-contains" => ensure!(
                !value
                    .as_str()
                    .context("expected text")?
                    .contains(assertion["value"].as_str().context("expected substring")?),
                "substring present at {pointer}"
            ),
            "bytes-le" => ensure!(
                value.as_str().context("expected text")?.len()
                    <= assertion["value"].as_u64().context("expected limit")? as usize,
                "byte limit exceeded"
            ),
            "length" => ensure!(
                value.as_array().context("expected array")?.len()
                    == assertion["value"].as_u64().context("expected length")? as usize,
                "wrong array length"
            ),
            "gt" => ensure!(
                value.as_f64().context("expected number")?
                    > assertion["value"].as_f64().context("expected comparison")?,
                "numeric bound failed"
            ),
            "gt-path" => {
                let other = actual
                    .pointer(assertion["other"].as_str().context("missing other path")?)
                    .and_then(Value::as_f64)
                    .context("missing comparison score")?;
                ensure!(
                    value.as_f64().context("expected score")?
                        > other * assertion["factor"].as_f64().unwrap_or(1.0),
                    "relative score assertion failed"
                );
            }
            "lt-path" => {
                let other = actual
                    .pointer(assertion["other"].as_str().context("missing other path")?)
                    .and_then(Value::as_f64)
                    .context("missing comparison score")?;
                ensure!(
                    value.as_f64().context("expected score")?
                        < other * assertion["factor"].as_f64().unwrap_or(1.0),
                    "relative score assertion failed"
                );
            }
            "each-fields-absent" => {
                for item in value.as_array().context("expected array")? {
                    for field in assertion["value"].as_array().context("expected fields")? {
                        ensure!(
                            item.as_object()
                                .context("expected object")?
                                .get(field.as_str().context("expected field")?)
                                .is_none(),
                            "field should be absent"
                        );
                    }
                }
            }
            _ => bail!("unknown assertion operation"),
        }
    }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    fn helper_assertions(name: &str) -> Vec<Value> {
        let cases: Vec<Value> =
            serde_json::from_str(include_str!("../vectors/tailhelpers.json")).unwrap();
        cases
            .into_iter()
            .find(|case| case["id"] == format!("internal.tailhelpers.{name}"))
            .unwrap()["assertions"]
            .as_array()
            .unwrap()
            .clone()
    }

    #[test]
    fn helper_relations_accept_alternate_totals_and_reject_broken_sums() {
        let rules = helper_assertions("usage-summed-categories");
        // Deliberately different from today's implementation-derived totals.
        let good = json!([{"system":2,"history":3,"toolResults":4,"tools":5,"total":14,"limit":10,"ratio":1}]);
        assert!(validate(&good, &rules).is_ok());
        for (field, value) in [
            ("total", 15),
            ("system", 0),
            ("history", 2),
            ("toolResults", 0),
            ("tools", 0),
            ("limit", 11),
            ("ratio", 0),
        ] {
            let mut bad = good.clone();
            bad[0][field] = json!(value);
            if ["system", "history", "toolResults", "tools"].contains(&field) {
                bad[0]["total"] = json!(
                    ["system", "history", "toolResults", "tools"]
                        .iter()
                        .map(|key| bad[0][*key].as_i64().unwrap())
                        .sum::<i64>()
                );
            }
            assert!(validate(&bad, &rules).is_err(), "accepted invalid {field}");
        }
    }

    #[test]
    fn helper_thinking_checks_difference_with_unpinned_baseline() {
        let rules = helper_assertions("hidden-thinking");
        for (baseline, thinking) in [(100, 115), (1, 16), (6, 21)] {
            assert!(validate(&json!([baseline, thinking]), &rules).is_ok());
        }
        for actual in [json!([100, 114]), json!([100, 100]), json!([100, 99])] {
            assert!(validate(&actual, &rules).is_err());
        }
    }

    #[test]
    fn helper_errors_allow_additional_members_but_require_exact_message() {
        for name in ["nested-required-path", "invalid-array-item"] {
            let rules = helper_assertions(name);
            let message = rules[1]["value"].as_str().unwrap();
            let good =
                json!([{"result":{"valid":false,"errors":["another error",message,"last error"]}}]);
            assert!(validate(&good, &rules).is_ok());
            for errors in [
                json!([]),
                json!([format!("prefix {message}")]),
                json!(message),
                json!([42]),
            ] {
                let mut bad = good.clone();
                bad[0]["result"]["errors"] = errors;
                assert!(validate(&bad, &rules).is_err());
            }
            let mut bad = good.clone();
            bad[0]["result"]["valid"] = json!(true);
            assert!(validate(&bad, &rules).is_err());
        }
    }

    #[test]
    fn helper_relations_reject_malformed_operands() {
        let actual = json!([10, 25, "10", null]);
        for rule in [
            json!({"path":"/1","kind":"sum-paths-eq","paths":[]}),
            json!({"path":"/1","kind":"sum-paths-eq","paths":["/missing"]}),
            json!({"path":"/1","kind":"sum-paths-eq","paths":["/2"]}),
            json!({"path":"/1","kind":"sum-paths-eq","paths":[null]}),
            json!({"path":"/1","kind":"sum-paths-eq"}),
            json!({"path":"/1","kind":"difference-ge","other":"/missing","value":15}),
            json!({"path":"/1","kind":"difference-ge","other":"/2","value":15}),
            json!({"path":"/2","kind":"difference-ge","other":"/0","value":15}),
            json!({"path":"/1","kind":"difference-ge","other":"/0","value":"15"}),
            json!({"path":"/1","kind":"difference-ge","value":15}),
            json!({"path":"","kind":"array-contains"}),
        ] {
            assert!(
                validate(&actual, std::slice::from_ref(&rule)).is_err(),
                "accepted {rule}"
            );
        }
    }

    #[test]
    fn rejects_mutated_outputs_and_empty_assertions() {
        assert!(
            validate(
                &json!([false]),
                &[json!({"path":"/0","kind":"eq","value":true})]
            )
            .is_err()
        );
        assert!(
            validate(
                &json!(["oversized"]),
                &[json!({"path":"/0","kind":"bytes-le","value":2})]
            )
            .is_err()
        );
        assert!(validate(&json!([]), &[]).is_err());
        assert!(
            validate(
                &json!([null]),
                &[json!({"path":"/0","parse":"","kind":"eq","value":{}})]
            )
            .is_err()
        );
    }
}
// Inputs and expected assertions are compiled from lane-owned vectors; TypeScript supplies actual results only.
