//! Differential check: the Rust comparator must reproduce real Vitest verdicts.
//!
//! `tooling/matcher-differential.test.ts` runs the same case ids through real
//! `expect(...)` and writes what Vitest actually decided to
//! `.jait/artifacts/matcher-differential/verdicts-vitest.json`. This test asserts that the
//! committed golden equals *both* that Vitest observation and the Rust
//! `matches` result, so a divergence on either side fails here rather than
//! silently agreeing with the authored expectation.
//!
//! Skipped unless `JAIT_MATCHER_DIFFERENTIAL=1` is set, because it needs the
//! Vitest-generated verdict file. Run it through
//! `node tests/contract/tooling/matcher-differential.mjs`, which produces the
//! verdicts and then invokes this target.
#![allow(dead_code)]

#[path = "support/tail_assertions.rs"]
mod tail_assertions;

use serde_json::Value;
use std::path::PathBuf;

fn corpus_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("corpus/matcher-differential")
}

#[test]
fn rust_comparator_matches_vitest_verdicts() {
    if std::env::var("JAIT_MATCHER_DIFFERENTIAL").as_deref() != Ok("1") {
        eprintln!("matcher differential: skipped (set JAIT_MATCHER_DIFFERENTIAL=1)");
        return;
    }

    let cases: Vec<Value> = serde_json::from_str(
        &std::fs::read_to_string(corpus_dir().join("cases.json")).expect("read cases.json"),
    )
    .expect("cases.json is a JSON array");
    let observed: Value = serde_json::from_str(
        &std::fs::read_to_string(
            PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("../../.jait/artifacts/matcher-differential/verdicts-vitest.json"),
        )
        .expect("read verdicts-vitest.json; run the Vitest matcher-differential spec first"),
    )
    .expect("verdicts-vitest.json is a JSON object");

    assert!(!cases.is_empty(), "differential corpus is empty");

    let mut mismatches = Vec::new();
    for case in &cases {
        let id = case["id"].as_str().expect("case id");
        let golden = case["vitest"].as_bool().expect("case vitest golden");
        let seen = observed[id]
            .as_bool()
            .unwrap_or_else(|| panic!("{id}: no Vitest verdict recorded"));

        assert_eq!(
            golden, seen,
            "{id}: committed golden disagrees with the real Vitest verdict"
        );

        let matches = tail_assertions::matches(&case["wire"]["observation"], &case["wire"]["rule"]);
        let rust = matches != (case["wire"]["rule"]["negate"] == true);
        if rust != golden {
            mismatches.push(format!("{id}: rust={rust} vitest={golden}"));
        }
    }

    assert!(
        mismatches.is_empty(),
        "matcher differential mismatches ({} of {}):\n{}",
        mismatches.len(),
        cases.len(),
        mismatches.join("\n")
    );
}
