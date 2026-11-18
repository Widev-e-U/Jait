//! Prerequisite contracts against TypeScript and isolated source-mutation checks.
#[path = "../src/fixture_internal_contracts.rs"]
mod fixture_internal_contracts;
#[path = "../src/internal_driver.rs"]
mod internal_driver;
use serde_json::{Value, json};
use std::{
    fs,
    path::{Path, PathBuf},
};

// Explicit reviewed registration; the test below rejects missing or unreviewed timeout cases.
const REVIEWED_TIMEOUT_CASES: &[&str] = &[
    "internal.boundaries.timeout-fractional-and-numeric-string",
    "internal.boundaries.timeout-exact-cap",
    "internal.boundaries.timeout-over-cap-warning",
    "internal.boundaries.timeout-empty-env",
    "internal.boundaries.timeout-invalid-env-infinite",
    "internal.boundaries.timeout-invalid-env-nan",
    "internal.boundaries.timeout-invalid-env-zero",
    "internal.boundaries.timeout-invalid-env-negative",
    "internal.boundaries.timeout-invalid-env-whitespace",
    "internal.boundaries.timeout-positive-env",
    "internal.boundaries.timeout-cap-lifted-to-default",
    "internal.boundaries.timeout-invalid-inputs",
    "internal.boundaries.timeout-nonfinite-inputs",
    "internal.boundaries.timeout-coercion-inputs",
    "internal.boundaries.timeout-symbol-error",
];

fn root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}
fn vectors() -> Vec<Value> {
    serde_json::from_str(
        &fs::read_to_string(root().join("tests/contract/vectors/boundaries.json")).unwrap(),
    )
    .unwrap()
}
fn artifacts(label: &str) -> PathBuf {
    let path = root()
        .join(".jait/artifacts/rust-boundary-contracts")
        .join(format!("{label}-{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(&path).unwrap();
    path
}

#[test]
fn boundary_vectors_pass_with_rust_assertions() {
    let directory = artifacts("baseline");
    let cases: Vec<_> = fixture_internal_contracts::cases(&root())
        .unwrap()
        .into_iter()
        .filter(|case| case.id().starts_with("internal.boundaries."))
        .collect();
    assert_eq!(cases.len(), vectors().len());
    let registered: std::collections::BTreeSet<_> =
        REVIEWED_TIMEOUT_CASES.iter().copied().collect();
    let observed: std::collections::BTreeSet<_> = cases
        .iter()
        .map(|case| case.id())
        .filter(|id| id.starts_with("internal.boundaries.timeout-"))
        .collect();
    assert_eq!(
        observed, registered,
        "timeout source review and executable vector inventory diverged"
    );
    assert!(!cases.is_empty());
    for case in &cases {
        fixture_internal_contracts::check(&root(), &directory, &|| false, case)
            .unwrap_or_else(|error| panic!("{}: {error:#}", case.id()));
    }
    fs::write(
        directory.join("summary.json"),
        serde_json::to_vec_pretty(&json!({
            "cases":cases.len(),"success":true,"backend":"typescript","assertions":"rust"
        }))
        .unwrap(),
    )
    .unwrap();
}

fn sandbox(directory: &Path, module: &str) -> PathBuf {
    let driver_dir = directory.join("tests/contract/drivers");
    fs::create_dir_all(&driver_dir).unwrap();
    let mut adapter =
        fs::read_to_string(root().join("tests/contract/drivers/boundaries.ts")).unwrap();
    for name in ["bounded-json", "command-timeout"] {
        let original = root().join(format!("packages/gateway/src/lib/{name}.ts"));
        let source = if name == module {
            let copied = directory.join(format!("{name}.ts"));
            fs::copy(&original, &copied).unwrap();
            copied
        } else {
            original
        };
        let specifier = reqwest::Url::from_file_path(source).unwrap().to_string();
        adapter = adapter.replace(
            &format!("'../../../packages/gateway/src/lib/{name}.ts'"),
            &serde_json::to_string(&specifier).unwrap(),
        );
    }
    fs::write(driver_dir.join("boundaries.ts"), adapter).unwrap();
    // The protocol is unchanged; only the module import points at an isolated copy.
    fs::write(
        driver_dir.join("internals.ts"),
        r#"
import { dispatch } from './boundaries.ts';
const request = await Bun.stdin.json();
const results = [];
for (const call of request.calls) results.push(await dispatch(call));
console.log(JSON.stringify({version:1,results}));
"#,
    )
    .unwrap();
    directory.join(format!("{module}.ts"))
}

#[test]
fn boundary_contracts_detect_source_mutations_then_pass_after_restore() {
    let directory = artifacts("mutations");
    let cases: Vec<_> = fixture_internal_contracts::cases(&root())
        .unwrap()
        .into_iter()
        .filter(|case| case.id().starts_with("internal.boundaries."))
        .collect();
    assert_eq!(cases.len(), vectors().len());
    let mutations = [
        (
            "utf8-floor",
            "bounded-json",
            "Math.floor(maxBytes)",
            "Math.ceil(maxBytes)",
            "utf8-empty-and-budget-floor",
        ),
        (
            "utf8-byte-count",
            "bounded-json",
            "bytes += 2;",
            "bytes += 1;",
            "utf8-exact-and-multibyte",
        ),
        (
            "utf8-suffix-reservation",
            "bounded-json",
            "ceiling - byteLength(effectiveSuffix)",
            "ceiling",
            "utf8-default-suffix",
        ),
        (
            "array-limit",
            "bounded-json",
            "maxArrayItems: 100",
            "maxArrayItems: 99",
            "json-array-first-pass",
        ),
        (
            "object-limit",
            "bounded-json",
            "maxObjectEntries: 100",
            "maxObjectEntries: 99",
            "json-object-first-pass",
        ),
        (
            "depth-limit",
            "bounded-json",
            "maxDepth: 8",
            "maxDepth: 7",
            "json-depth-limit",
        ),
        (
            "bigint",
            "bounded-json",
            "return value.toString();",
            "return 0;",
            "json-bigint-and-omitted-types",
        ),
        (
            "original-size",
            "bounded-json",
            "originalBytes: byteLength(original)",
            "originalBytes: byteLength(original) + 1",
            "json-fallback-known-size",
        ),
        (
            "timeout-rounding",
            "command-timeout",
            "Math.ceil(ms)",
            "Math.floor(ms)",
            "timeout-fractional-and-numeric-string",
        ),
        (
            "timeout-cap",
            "command-timeout",
            "return max;",
            "return ms;",
            "timeout-over-cap-warning",
        ),
        (
            "timeout-invalid-env",
            "command-timeout",
            "Number.isFinite(parsed) && parsed > 0",
            "parsed > 0",
            "timeout-invalid-env-infinite",
        ),
        (
            "timeout-cap-floor",
            "command-timeout",
            "Math.max(envNumber(\"JAIT_TERMINAL_TIMEOUT_MAX_MS\", MAX_COMMAND_TIMEOUT_MS), defaultCommandTimeoutMs())",
            "envNumber(\"JAIT_TERMINAL_TIMEOUT_MAX_MS\", MAX_COMMAND_TIMEOUT_MS)",
            "timeout-cap-lifted-to-default",
        ),
        (
            "timeout-cap-equality",
            "command-timeout",
            "if (ms > max)",
            "if (ms >= max)",
            "timeout-exact-cap",
        ),
    ];
    let mut results = Vec::new();
    for (name, module, from, to, case_name) in mutations {
        let work = directory.join(name);
        let source = sandbox(&work, module);
        let original = fs::read_to_string(&source).unwrap();
        assert!(original.contains(from), "mutation no longer matches {name}");
        let case = cases
            .iter()
            .find(|c| c.id() == format!("internal.boundaries.{case_name}"))
            .unwrap();
        fixture_internal_contracts::check(&work, &work, &|| false, case)
            .expect("unmutated sandbox must pass");
        fs::write(&source, original.replacen(from, to, 1)).unwrap();
        let error = fixture_internal_contracts::check(&work, &work, &|| false, case)
            .expect_err("contract must reject mutated behavior");
        assert!(
            error.to_string().contains("equality assertion failed"),
            "mutation must fail an assertion, not fixture setup: {error:#}"
        );
        fs::write(&source, original).unwrap();
        fixture_internal_contracts::check(&work, &work, &|| false, case)
            .expect("restored source must pass");
        results.push(json!({"mutation":name,"case":case.id(),"baseline":"passed","mutated":"assertion-failed","restored":"passed","error":error.to_string()}));
    }
    fs::write(
        directory.join("summary.json"),
        serde_json::to_vec_pretty(&results).unwrap(),
    )
    .unwrap();
}
