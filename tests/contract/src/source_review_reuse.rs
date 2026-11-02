//! Reuse reviewed Rust assertion registrations without moving verdicts into TypeScript.
use anyhow::{Context, Result, bail, ensure};
use serde_json::{Value, json};
use std::{fs, path::Path};
#[allow(dead_code)]
#[path = "../tests/support/tail_assertions.rs"]
mod tail_assertions;

fn raw_argument(input: &str) -> Result<(String, &str)> {
    let input = input.trim_start();
    let rest = input
        .strip_prefix('r')
        .context("expected generated Rust raw string")?;
    let hashes = rest.bytes().take_while(|byte| *byte == b'#').count();
    ensure!(
        (1..=16).contains(&hashes),
        "invalid generated raw delimiter"
    );
    let rest = rest[hashes..]
        .strip_prefix('"')
        .context("missing generated raw quote")?;
    let end = format!("\"{}", "#".repeat(hashes));
    let offset = rest
        .find(&end)
        .context("unterminated generated raw argument")?;
    Ok((rest[..offset].to_owned(), &rest[offset + end.len()..]))
}

fn registration(source: &str, name: &str) -> Result<(String, Vec<Value>)> {
    ensure!(
        name.starts_with("tailstatic_")
            && name.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_'),
        "invalid translated registration name"
    );
    let marker = format!("fn {name}() {{");
    ensure!(
        source.matches(&marker).count() == 1,
        "missing or duplicate translated registration"
    );
    let rest = source.split_once(&marker).unwrap().1;
    let body = rest
        .split_once("\n}")
        .context("unterminated generated registration")?
        .0
        .trim();
    let args = body
        .strip_prefix("tail_assertions::check(")
        .context("unsupported registration body")?
        .strip_suffix(");")
        .context("unsupported registration ending")?;
    let (file, rest) = raw_argument(args)?;
    let (registered, rest) = raw_argument(
        rest.trim_start()
            .strip_prefix(',')
            .context("missing case delimiter")?,
    )?;
    ensure!(registered == name, "registration borrowed another case");
    let (rules, rest) = raw_argument(
        rest.trim_start()
            .strip_prefix(',')
            .context("missing rules delimiter")?,
    )?;
    ensure!(
        rest.trim()
            .strip_prefix(',')
            .unwrap_or(rest.trim())
            .trim()
            .is_empty(),
        "extra generated registration arguments"
    );
    let rules: Vec<Value> = serde_json::from_str(&rules).context("invalid Rust assertion rules")?;
    ensure!(
        !rules.is_empty() && rules.iter().any(|rule| rule["matcher"] != "toComplete"),
        "source reuse requires behavioral assertions"
    );
    Ok((file, rules))
}

pub fn check(
    root: &Path,
    calls: &str,
    assertions: &[Value],
    cancelled: &dyn Fn() -> bool,
) -> Result<()> {
    ensure!(!cancelled(), "source reuse cancelled");
    ensure!(
        assertions == [json!({"path":"","kind":"reused-tail"})],
        "reused source case requires the exact Rust oracle marker"
    );
    let calls: Vec<Value> = serde_json::from_str(calls)?;
    ensure!(calls.len() == 1, "reused source case requires one call");
    let call = &calls[0];
    ensure!(
        call["op"] == "sourcereview.reused",
        "wrong source reuse operation"
    );
    let name = call["test"].as_str().context("missing reused test")?;
    // Environment-gated real engines and Node-only process fixtures need their
    // dedicated reviewed boundary; this path never turns a skipped test on.
    // Browser DevTools retains its existing Node peer, now with a bounded copy loader.
    ensure!(
        !name.contains("_integration_")
            && !name.contains("_ollama_e2e_")
            && !name.contains("_cli_start_")
            && !name.contains("_cli_update_"),
        "reused fixture requires a dedicated execution boundary"
    );
    let source = call["source"].as_str().context("missing reused source")?;
    ensure!(
        source.starts_with("packages/gateway/")
            && !source.split('/').any(|p| p == ".." || p.is_empty()),
        "source reuse path escapes gateway"
    );
    let project = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()?;
    let original = project.join(source).canonicalize()?;
    ensure!(
        original.starts_with(project.join("packages/gateway")),
        "source resolves outside gateway"
    );
    let root = root.canonicalize()?;
    let copy = if root == project {
        original.clone()
    } else {
        ensure!(
            root.starts_with(project.join(".jait/artifacts/source-review")),
            "source copy root escapes artifact boundary"
        );
        let copy = root.join("subject.ts").canonicalize()?;
        ensure!(copy.starts_with(&root), "source copy escapes review root");
        copy
    };
    let test_file = call["source_test"]
        .as_str()
        .context("missing original test source")?;
    let inventory: Value =
        serde_json::from_slice(&fs::read(project.join("tests/contract/coverage.json"))?)?;
    let test = inventory["test_files"]
        .as_array()
        .context("missing declaration inventory")?
        .iter()
        .find(|file| file["path"] == test_file)
        .context("original test is not inventoried")?;
    let bytes = fs::read(project.join(test_file))?;
    let fingerprint = bytes.iter().fold(0xcbf29ce484222325_u64, |hash, byte| {
        (hash ^ u64::from(*byte)).wrapping_mul(0x100000001b3)
    });
    ensure!(
        test["fingerprint"] == format!("{fingerprint:016x}"),
        "original test source fingerprint drift"
    );
    ensure!(
        test["cases"]
            .as_array()
            .context("missing original declarations")?
            .iter()
            .any(|case| case["status"] == "verified"
                && case["rust_cases"]
                    .as_array()
                    .is_some_and(|cases| cases.iter().any(|case| case["id"] == name))),
        "reused test requires an existing reviewed declaration"
    );
    let table = fs::read_to_string(project.join("tests/contract/tests/tail_static.rs"))?;
    let (file, rules) = registration(&table, name)?;
    ensure!(
        call["fixture"] == file,
        "fixture differs from Rust registration"
    );
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        tail_assertions::check_source(&project, &file, name, &rules, &original, &copy, cancelled);
    }));
    if let Err(error) = result {
        let text = error
            .downcast_ref::<String>()
            .map(String::as_str)
            .or_else(|| error.downcast_ref::<&str>().copied())
            .unwrap_or("unknown fixture panic");
        if text.contains("Rust assertion failed:")
            || text.contains("final observation failed at assertion")
        {
            bail!("source behavior assertion failed: {text}");
        }
        bail!("reused source fixture setup failed: {text}");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    const VALID: &str = "fn tailstatic_fixture() {\n    tail_assertions::check(r#\"fixture\"#,r#\"tailstatic_fixture\"#,r##\"[{\"matcher\":\"toBe\",\"expected\":true}]\"##,);\n}";
    #[test]
    fn reads_only_exact_generated_registration() {
        let (file, rules) = registration(VALID, "tailstatic_fixture").unwrap();
        assert_eq!(file, "fixture");
        assert_eq!(rules, vec![json!({"matcher":"toBe","expected":true})]);
    }
    #[test]
    fn rejects_absent_duplicate_borrowed_and_nonbehavioral_oracles() {
        for source in [
            String::new(),
            format!("{VALID}\n{VALID}"),
            VALID.replace("r#\"tailstatic_fixture\"#", "r#\"another\"#"),
            VALID.replace("toBe", "toComplete"),
        ] {
            assert!(registration(&source, "tailstatic_fixture").is_err());
        }
        assert!(registration(VALID, "../../escape").is_err());
    }
    #[test]
    fn cancelled_reuse_does_not_parse_or_spawn() {
        let error = check(
            Path::new("."),
            "invalid",
            &[json!({"path":"","kind":"reused-tail"})],
            &|| true,
        )
        .unwrap_err();
        assert!(error.to_string().contains("cancelled"));
    }

    #[test]
    fn copied_defining_sources_reject_changes_and_restore() {
        let project = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../..")
            .canonicalize()
            .unwrap();
        for (source, original_test, fixture, test, from, to) in [
            (
                "packages/gateway/src/skills/install.ts",
                "packages/gateway/src/skills/install.test.ts",
                "gateway-src-skills-install-test-b8c54d90",
                "tailstatic_packages_gateway_src_skills_install_test_ts_9_3",
                ".toLowerCase()",
                ".toUpperCase()",
            ),
            (
                "packages/gateway/src/tools/repo-proposal-tools.ts",
                "packages/gateway/src/tools/repo-proposal-tools.test.ts",
                "gateway-src-tools-repo-proposal-tools-test-e17a49aa",
                "tailstatic_packages_gateway_src_tools_repo_proposal_tools_test_ts_49_3",
                "name: \"jait.todos\"",
                "name: \"jait.changed\"",
            ),
            (
                "packages/gateway/src/surfaces/filesystem.ts",
                "packages/gateway/src/sprint3.test.ts",
                "gateway-src-sprint3-test-cfd617fc",
                "tailstatic_packages_gateway_src_sprint3_test_ts_136_3",
                "const patched = original.replace(search, replace);",
                "const patched = original;",
            ),
        ] {
            let directory = project
                .join(".jait/artifacts/source-review")
                .join(format!("reuse-probe-{}", uuid::Uuid::new_v4()));
            fs::create_dir_all(&directory).unwrap();
            let path = project.join(source);
            let parent = path.parent().unwrap();
            let mut copied = fs::read_to_string(&path).unwrap();
            for prefix in ["./", "../", "../../"] {
                copied = copied.replace(
                    &format!("from \"{prefix}"),
                    &format!(
                        "from \"{}/",
                        parent.join(prefix).canonicalize().unwrap().display()
                    ),
                );
            }
            let subject = directory.join("subject.ts");
            fs::write(&subject, &copied).unwrap();
            let calls = json!([{"op":"sourcereview.reused","source":source,"source_test":original_test,"fixture":fixture,"test":test}]).to_string();
            let rules = [json!({"path":"","kind":"reused-tail"})];
            check(&directory, &calls, &rules, &|| false).unwrap();
            assert!(copied.contains(from));
            fs::write(&subject, copied.replacen(from, to, 1)).unwrap();
            let error = match check(&directory, &calls, &rules, &|| false) {
                Err(error) => error,
                Ok(()) => panic!("mutation survived for {source}: {from} -> {to}"),
            };
            assert!(
                error
                    .to_string()
                    .contains("source behavior assertion failed"),
                "{error:#}"
            );
            fs::write(&subject, &copied).unwrap();
            check(&directory, &calls, &rules, &|| false).unwrap();
            fs::remove_dir_all(directory).unwrap();
        }
    }

    #[test]
    fn rejects_extra_calls_and_fake_expected_marker_before_execution() {
        assert!(
            check(
                Path::new("."),
                "[]",
                &[json!({"path":"","kind":"reused-tail"})],
                &|| false
            )
            .is_err()
        );
        assert!(
            check(
                Path::new("."),
                "[]",
                &[json!({"path":"","kind":"eq","value":true})],
                &|| false
            )
            .is_err()
        );
    }
}
