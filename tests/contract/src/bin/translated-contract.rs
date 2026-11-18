//! Source-bound evidence for the existing native Rust translation tests.
//! This runner does not translate, review, or evaluate application assertions.
#[path = "../evidence.rs"]
mod evidence;

use anyhow::{Context, Result, bail, ensure};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs::{self, File},
    io::Read,
    path::{Path, PathBuf},
    process::{Child, Command, ExitStatus, Stdio},
    sync::atomic::{AtomicBool, Ordering},
    thread,
    time::{Duration, Instant},
};

static CANCELLED: AtomicBool = AtomicBool::new(false);
const MAX_LOG_BYTES: u64 = 16 * 1024 * 1024;

struct OwnedChild(Child);
impl Drop for OwnedChild {
    fn drop(&mut self) {
        if self.0.try_wait().ok().flatten().is_some() {
            return;
        }
        // Descendant Bun/Node peers share this child's process group.
        #[cfg(unix)]
        let _ = Command::new("/bin/kill")
            .args(["-TERM", "--", &format!("-{}", self.0.id())])
            .status();
        #[cfg(windows)]
        let _ = Command::new("taskkill")
            .args(["/PID", &self.0.id().to_string(), "/T", "/F"])
            .status();
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}

fn execute(
    mut command: Command,
    directory: &Path,
    label: &str,
    timeout: Duration,
) -> Result<(ExitStatus, String)> {
    let stdout = directory.join(format!("{label}.stdout.log"));
    let stderr = directory.join(format!("{label}.stderr.log"));
    command
        .stdout(Stdio::from(File::create(&stdout)?))
        .stderr(Stdio::from(File::create(&stderr)?));
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }
    let mut child = OwnedChild(command.spawn().with_context(|| format!("start {label}"))?);
    let deadline = Instant::now() + timeout;
    loop {
        ensure!(
            !CANCELLED.load(Ordering::SeqCst),
            "translated run cancelled during {label}"
        );
        ensure!(
            Instant::now() < deadline,
            "translated run deadline exceeded during {label}"
        );
        for path in [&stdout, &stderr] {
            ensure!(
                fs::metadata(path)?.len() <= MAX_LOG_BYTES,
                "{label} log exceeds 16 MiB"
            );
        }
        if let Some(status) = child.0.try_wait()? {
            let mut output = String::new();
            File::open(stdout)?
                .take(MAX_LOG_BYTES + 1)
                .read_to_string(&mut output)?;
            ensure!(
                output.len() as u64 <= MAX_LOG_BYTES,
                "{label} log exceeds 16 MiB"
            );
            return Ok((status, output));
        }
        thread::sleep(Duration::from_millis(50));
    }
}

fn compiled_test(output: &str) -> Result<PathBuf> {
    let mut paths = BTreeSet::new();
    for line in output.lines().filter(|line| !line.trim().is_empty()) {
        let row: Value = serde_json::from_str(line).context("Cargo build output is not JSON")?;
        if row["reason"] == "compiler-artifact"
            && row["target"]["name"] == "tail_static"
            && row["profile"]["test"] == true
            && let Some(executable) = row["executable"].as_str()
        {
            paths.insert(PathBuf::from(executable));
        }
    }
    ensure!(
        paths.len() == 1,
        "expected exactly one tail_static test executable"
    );
    Ok(paths.into_iter().next().unwrap())
}

fn test_inventory(output: &str) -> Result<BTreeSet<String>> {
    let mut ids = BTreeSet::new();
    for line in output.lines() {
        if let Some(id) = line.strip_suffix(": test") {
            ensure!(
                !id.is_empty() && ids.insert(id.to_owned()),
                "empty or duplicate listed test"
            );
        }
    }
    ensure!(!ids.is_empty(), "translated binary listed no tests");
    Ok(ids)
}

fn observed_cases(output: &str, expected: &BTreeSet<String>) -> Result<Vec<Value>> {
    let mut observed = BTreeMap::new();
    for line in output.lines() {
        let Some(line) = line.strip_prefix("test ") else {
            continue;
        };
        let Some((id, outcome)) = line.split_once(" ... ") else {
            continue;
        };
        // libtest decorates pretty should-panic results, but --list gives bare IDs.
        // Prefer an exact registered ID and strip only this known suffix once.
        let id = if expected.contains(id) {
            id
        } else if let Some(registered) = id.strip_suffix(" - should panic")
            && expected.contains(registered)
        {
            registered
        } else {
            bail!("unregistered test result: {id}");
        };
        let status = match outcome {
            "ok" => "passed",
            "FAILED" => "failed",
            ignored if ignored == "ignored" || ignored.starts_with("ignored,") => "skipped",
            _ => bail!("unknown result for {id}"),
        };
        ensure!(
            observed.insert(id.to_owned(), status).is_none(),
            "duplicate result: {id}"
        );
    }
    ensure!(
        observed.len() == expected.len(),
        "incomplete test results: {}/{}",
        observed.len(),
        expected.len()
    );
    Ok(observed
        .into_iter()
        .map(|(id, status)| json!({"id":id,"status":status}))
        .collect())
}

fn full_results(cases: &[Value], process_succeeded: bool, sources_unchanged: bool) -> bool {
    process_succeeded
        && sources_unchanged
        && !cases.is_empty()
        && cases.iter().any(|case| case["status"] == "passed")
        && cases
            .iter()
            .all(|case| case["status"] == "passed" || case["status"] == "skipped")
}

const DOCKER_TESTS: [&str; 9] = [
    "tailstatic_packages_gateway_src_security_sandbox_ownership_integration_test_ts_46_3",
    "tailstatic_packages_gateway_src_security_sandbox_ownership_integration_test_ts_56_3",
    "tailstatic_packages_gateway_src_security_sandbox_ownership_integration_test_ts_66_3",
    "tailstatic_packages_gateway_src_security_agent_sandbox_lifecycle_integration_test_ts_9_3",
    "tailstatic_packages_gateway_src_security_worktree_sandbox_test_ts_33_3",
    "tailstatic_packages_gateway_src_tools_terminal_sandbox_background_integration_test_ts_30_3",
    "tailstatic_packages_gateway_src_tools_terminal_sandbox_background_integration_test_ts_60_3",
    "tailstatic_packages_gateway_src_tools_terminal_sandbox_background_integration_test_ts_74_3",
    "tailstatic_packages_gateway_src_tools_terminal_sandbox_background_integration_test_ts_88_3",
];

const SCANNER_TESTS: [&str; 4] = [
    "tailstatic_packages_gateway_src_lib_security_engines_integration_test_ts_12_2",
    "tailstatic_packages_gateway_src_lib_security_engines_integration_test_ts_20_2",
    "tailstatic_packages_gateway_src_lib_security_engines_integration_test_ts_30_2",
    "tailstatic_packages_gateway_src_lib_security_engines_integration_test_ts_40_2",
];

fn scanner_inventory(available: &BTreeSet<String>) -> Result<BTreeSet<String>> {
    let required: BTreeSet<_> = SCANNER_TESTS.iter().map(|id| (*id).to_owned()).collect();
    ensure!(
        required.is_subset(available),
        "required real-scanner integration is absent from the compiled inventory"
    );
    Ok(required)
}

fn docker_inventory(available: &BTreeSet<String>) -> Result<BTreeSet<String>> {
    let required: BTreeSet<_> = DOCKER_TESTS.iter().map(|id| (*id).to_owned()).collect();
    ensure!(
        required.is_subset(available),
        "required Docker integration is absent from the compiled inventory"
    );
    Ok(required)
}

fn chromium_inventory(available: &BTreeSet<String>) -> Result<BTreeSet<String>> {
    let selected: BTreeSet<_> = available
        .iter()
        .filter(|id| {
            id.starts_with(
                "tailstatic_packages_gateway_src_tools_browser_tools_integration_test_ts_",
            )
        })
        .cloned()
        .collect();
    ensure!(
        selected.len() == 33,
        "Chromium profile requires all 33 original three-runtime integration variants"
    );
    Ok(selected)
}

const FILESYSTEM_TESTS: [&str; 1] =
    ["tailstatic_packages_gateway_src_services_disk_janitor_test_ts_153_3"];
const OLLAMA_TESTS: [&str; 3] = [
    "tailstatic_packages_gateway_src_routes_chat_ollama_e2e_test_ts_89_3",
    "tailstatic_packages_gateway_src_routes_chat_ollama_e2e_test_ts_123_3",
    "tailstatic_packages_gateway_src_routes_chat_ollama_e2e_test_ts_164_3",
];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Profile {
    Enabled,
    Docker,
    Chromium,
    Scanners,
    Filesystem,
    Ollama,
}

impl Profile {
    fn parse(arguments: &[String]) -> Result<Self> {
        match arguments {
            [] => Ok(Self::Enabled),
            [flag, name] if flag == "--profile" => match name.as_str() {
                "docker" => Ok(Self::Docker),
                "chromium" => Ok(Self::Chromium),
                "scanners" => Ok(Self::Scanners),
                "filesystem" => Ok(Self::Filesystem),
                "ollama" => Ok(Self::Ollama),
                _ => bail!("unknown translated profile: {name}"),
            },
            _ => bail!(
                "Usage: translated-contract [--profile docker|chromium|scanners|filesystem|ollama] (no arbitrary filters)"
            ),
        }
    }

    fn label(self) -> &'static str {
        match self {
            Self::Enabled => "translated-enabled-typescript-reference",
            Self::Docker => "translated-docker-typescript-reference",
            Self::Chromium => "translated-chromium-typescript-reference",
            Self::Scanners => "translated-scanners-typescript-reference",
            Self::Filesystem => "translated-filesystem-typescript-reference",
            Self::Ollama => "translated-ollama-typescript-reference",
        }
    }

    fn inventory(self, available: &BTreeSet<String>) -> Result<BTreeSet<String>> {
        match self {
            Self::Enabled => Ok(available.clone()),
            Self::Docker => docker_inventory(available),
            Self::Chromium => chromium_inventory(available),
            Self::Scanners => scanner_inventory(available),
            Self::Filesystem | Self::Ollama => {
                let required: BTreeSet<_> = match self {
                    Self::Filesystem => FILESYSTEM_TESTS.as_slice(),
                    _ => OLLAMA_TESTS.as_slice(),
                }
                .iter()
                .map(|id| (*id).to_owned())
                .collect();
                ensure!(
                    required.is_subset(available),
                    "required {} integration is absent from the compiled inventory",
                    self.label()
                );
                Ok(required)
            }
        }
    }
}

fn translated_build_target(root: &Path) -> PathBuf {
    let mut identity = root.to_string_lossy().into_owned();
    if !identity.ends_with(std::path::MAIN_SEPARATOR) {
        identity.push(std::path::MAIN_SEPARATOR);
    }
    let key = hex::encode(Sha256::digest(identity.as_bytes()));
    root.join(".jait/artifacts/rust-contract-target")
        .join(format!("contracts-{}", &key[..16]))
}

fn translated_build_command(root: &Path) -> Command {
    let mut build = Command::new(env!("CARGO"));
    build
        .current_dir(root)
        .env("CARGO_TARGET_DIR", translated_build_target(root))
        .args([
            "test",
            "--locked",
            "--manifest-path",
            "tests/contract/Cargo.toml",
            "--test",
            "tail_static",
            "--no-run",
            "--message-format=json",
        ]);
    build
}

fn suite(root: &Path, directory: &Path, profile: Profile) -> Result<(Vec<Value>, bool)> {
    let build = translated_build_command(root);
    let (built, output) = execute(build, directory, "build", Duration::from_secs(300))?;
    ensure!(
        built.success(),
        "translated test build failed; see build logs"
    );
    let executable = compiled_test(&output)?;
    let mut list = Command::new(&executable);
    list.current_dir(root).args(["--list", "--format", "terse"]);
    let (listed, listing) = execute(list, directory, "list", Duration::from_secs(30))?;
    ensure!(listed.success(), "translated test listing failed");
    let available = test_inventory(&listing)?;
    let expected = profile.inventory(&available)?;
    let mut tests = Command::new(executable);
    tests
        .current_dir(root)
        .args(["--format", "pretty", "--color", "never"]);
    if profile != Profile::Enabled {
        tests
            .args(["--include-ignored", "--exact", "--test-threads=1"])
            .args(&expected);
    } else {
        tests.arg("--test-threads=4");
    }
    let (status, output) = execute(tests, directory, "tests", Duration::from_secs(1200))?;
    Ok((observed_cases(&output, &expected)?, status.success()))
}

fn run() -> Result<bool> {
    let arguments: Vec<_> = std::env::args().skip(1).collect();
    let profile = Profile::parse(&arguments)?;
    ctrlc::set_handler(|| CANCELLED.store(true, Ordering::SeqCst))?;
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()?;
    let directory = root
        .join(".jait/artifacts/contracts")
        .join(uuid::Uuid::new_v4().to_string());
    fs::create_dir_all(&directory)?;
    println!("Artifacts: {}", directory.display());
    let source_fingerprints = evidence::translated_snapshot(&root)?;
    let started = Instant::now();
    let result = suite(&root, &directory, profile);
    let (cases, process_succeeded, error) = match result {
        Ok((cases, succeeded)) => (cases, succeeded, Value::Null),
        Err(error) => (Vec::new(), false, json!(format!("{error:#}"))),
    };
    let sources_unchanged = source_fingerprints == evidence::translated_snapshot(&root)?;
    let success = full_results(&cases, process_succeeded, sources_unchanged)
        && (profile == Profile::Enabled || cases.iter().all(|case| case["status"] == "passed"));
    let passed = cases
        .iter()
        .filter(|case| case["status"] == "passed")
        .count();
    let failed = cases
        .iter()
        .filter(|case| case["status"] == "failed")
        .count();
    let skipped: Vec<_> = cases
        .iter()
        .filter(|case| case["status"] == "skipped")
        .map(|case| case["id"].clone())
        .collect();
    let report = json!({
        "schema_version":1,"contract_version":env!("CARGO_PKG_VERSION"),
        "profile":profile.label(),"backend_label":"typescript",
        "success":success,"sources_unchanged":sources_unchanged,"source_fingerprints":source_fingerprints,
        "duration_ms":started.elapsed().as_millis(),"summary":{"passed":passed,"failed":failed,"skipped":skipped.len(),"total":cases.len()},
        "cases":cases,"not_covered":skipped,"error":error,
        "limitations":["Reference TypeScript implementation executed through test-only Bun/Node peers; no Rust runtime parity claim.","Skipped source/environment gates receive no passing evidence.","Execution does not establish assertion equivalence; each credited declaration requires a separate parity review."]
    });
    let report_path = directory.join("report.json");
    fs::write(&report_path, serde_json::to_vec_pretty(&report)?)?;
    println!(
        "{passed} passed; {failed} failed; {} skipped. Report: {}",
        skipped.len(),
        report_path.display()
    );
    if !success {
        eprintln!("Translated evidence failed: {}", report["error"]);
    }
    Ok(success)
}

fn main() {
    match run() {
        Ok(true) => {}
        Ok(false) => std::process::exit(1),
        Err(error) => {
            eprintln!("{error:#}");
            std::process::exit(2);
        }
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn chromium_profile_requires_the_complete_runtime_matrix() {
        let mut inventory: BTreeSet<_> = (0..33)
            .map(|i| {
                format!(
                    "tailstatic_packages_gateway_src_tools_browser_tools_integration_test_ts_{i}"
                )
            })
            .collect();
        inventory.insert("unrelated_paid_provider_case".into());
        assert_eq!(chromium_inventory(&inventory).unwrap().len(), 33);
        inventory
            .remove("tailstatic_packages_gateway_src_tools_browser_tools_integration_test_ts_0");
        assert!(chromium_inventory(&inventory).is_err());
    }

    #[test]
    fn scanner_profile_requires_all_four_real_checks_and_excludes_other_cases() {
        let mut available: BTreeSet<String> =
            SCANNER_TESTS.iter().map(|id| (*id).to_owned()).collect();
        available.insert("unrelated_network_or_paid_provider_case".into());
        let selected = scanner_inventory(&available).unwrap();
        assert_eq!(selected.len(), 4);
        assert!(!selected.contains("unrelated_network_or_paid_provider_case"));
        for id in SCANNER_TESTS {
            available.remove(id);
            assert!(scanner_inventory(&available).is_err());
            available.insert(id.to_owned());
        }
    }

    #[test]
    fn docker_profile_requires_every_declared_integration_and_excludes_other_cases() {
        let mut available: BTreeSet<String> =
            DOCKER_TESTS.iter().map(|id| (*id).to_owned()).collect();
        available.insert("unrelated_paid_provider_case".into());
        let selected = docker_inventory(&available).unwrap();
        assert_eq!(selected.len(), 9);
        assert!(!selected.contains("unrelated_paid_provider_case"));
        available.remove(DOCKER_TESTS[0]);
        assert!(docker_inventory(&available).is_err());
    }

    use super::*;
    fn expected() -> BTreeSet<String> {
        BTreeSet::from(["one".into(), "two".into()])
    }
    #[test]
    fn cargo_artifact_requires_unique_named_test_executable() {
        let artifact = json!({"reason":"compiler-artifact","target":{"name":"tail_static"},"profile":{"test":true},"executable":"/build/tests"});
        assert_eq!(
            compiled_test(&artifact.to_string()).unwrap(),
            PathBuf::from("/build/tests")
        );
        assert!(compiled_test("{}").is_err());
        assert!(compiled_test("not-json").is_err());
        let mut second = artifact.clone();
        second["executable"] = json!("/another/tests");
        assert!(compiled_test(&format!("{artifact}\n{second}")).is_err());
    }
    #[test]
    #[cfg(unix)]
    fn inner_builds_do_not_reuse_a_different_source_roots_test_binary() {
        let project = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
        let base = project
            .join(".jait/artifacts/translated-build-root-tests")
            .join(uuid::Uuid::new_v4().to_string());
        let cache = base.join("shared-cache");
        fs::create_dir_all(&cache).unwrap();
        let mut physical = Vec::new();
        for name in ["first", "second"] {
            let root = base.join(name);
            fs::create_dir_all(root.join(".jait/artifacts")).unwrap();
            std::os::unix::fs::symlink(&cache, root.join(".jait/artifacts/rust-contract-target"))
                .unwrap();
            let command = translated_build_command(&root);
            let target = command
                .get_envs()
                .find(|(name, _)| *name == "CARGO_TARGET_DIR")
                .and_then(|(_, value)| value)
                .unwrap();
            fs::create_dir_all(target).unwrap();
            physical.push(fs::canonicalize(target).unwrap());
            assert_eq!(translated_build_target(&root), PathBuf::from(target));
        }
        assert_ne!(
            physical[0], physical[1],
            "embedded source roots cannot share an inner build"
        );
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn listing_rejects_duplicates_and_empty_suites() {
        assert_eq!(
            test_inventory("one: test\ntwo: test\n2 tests, 0 benchmarks").unwrap(),
            expected()
        );
        assert!(test_inventory("one: test\none: test").is_err());
        assert!(test_inventory("0 tests").is_err());
    }
    #[test]
    fn results_require_every_registered_test_once() {
        assert!(observed_cases("test one ... ok\n", &expected()).is_err());
        assert!(
            observed_cases(
                "test one ... ok\ntest one ... ok\ntest two ... ok",
                &expected()
            )
            .is_err()
        );
        assert!(observed_cases("test other ... ok\ntest two ... ok", &expected()).is_err());
        assert!(observed_cases("test one ... unknown\ntest two ... ok", &expected()).is_err());
    }
    #[test]
    fn standard_should_panic_result_uses_registered_identity() {
        let id = "tail_assertions::tests::identity_without_reference_metadata_is_rejected";
        let expected = test_inventory(&format!("{id}: test\none: test")).unwrap();
        let cases = observed_cases(
            &format!("running 2 tests\ntest {id} - should panic ... ok\ntest one ... ok\n\ntest result: ok. 2 passed; 0 failed"),
            &expected,
        )
        .unwrap();
        assert_eq!(
            cases,
            vec![
                json!({"id":"one","status":"passed"}),
                json!({"id":id,"status":"passed"})
            ]
        );
        assert!(full_results(&cases, true, true));
    }

    #[test]
    fn should_panic_failure_reason_does_not_turn_failure_into_pass() {
        let cases = observed_cases(
            "test one - should panic ... FAILED\ntest two ... ok\n\nfailures:\n\n---- one stdout ----\nnote: test did not panic as expected at source.rs:1:1\n\nfailures:\n    one\n\ntest result: FAILED. 1 passed; 1 failed",
            &expected(),
        )
        .unwrap();
        assert_eq!(cases[0], json!({"id":"one","status":"failed"}));
        assert!(!full_results(&cases, false, true));
        assert!(!full_results(&cases, true, true));
    }

    #[test]
    fn result_decorations_are_exact_and_must_resolve_to_registered_ids() {
        for id in [
            "other - should panic",
            "one - unknown",
            "one - should panic extra",
            "one - should panic - should panic",
            "one - should panic ",
        ] {
            let error = observed_cases(&format!("test {id} ... ok\ntest two ... ok"), &expected())
                .unwrap_err();
            assert_eq!(error.to_string(), format!("unregistered test result: {id}"));
        }
        assert!(
            observed_cases(
                "test one - should panic ... ok extra\ntest two ... ok",
                &expected(),
            )
            .is_err()
        );
    }

    #[test]
    fn registered_ids_are_matched_before_suffix_normalization() {
        let expected = BTreeSet::from(["one".into(), "one - should panic".into()]);
        let cases = observed_cases(
            "test one ... ok\ntest one - should panic ... FAILED",
            &expected,
        )
        .unwrap();
        assert_eq!(cases[0], json!({"id":"one","status":"passed"}));
        assert_eq!(
            cases[1],
            json!({"id":"one - should panic","status":"failed"})
        );
    }

    #[test]
    fn decorated_results_reject_duplicate_and_incomplete_runs() {
        for results in [
            "test one ... ok\ntest one - should panic ... ok\ntest two ... ok",
            "test one - should panic ... ok\ntest one ... ok\ntest two ... ok",
            "test one - should panic ... ok\ntest one - should panic ... FAILED\ntest two ... ok",
        ] {
            assert_eq!(
                observed_cases(results, &expected())
                    .unwrap_err()
                    .to_string(),
                "duplicate result: one"
            );
        }
        assert_eq!(
            observed_cases("test one - should panic ... ok", &expected())
                .unwrap_err()
                .to_string(),
            "incomplete test results: 1/2"
        );
    }

    #[test]
    fn ignored_and_failed_results_cannot_be_reported_as_passed() {
        let cases = observed_cases(
            "test one ... ok\ntest two ... ignored, source gate",
            &expected(),
        )
        .unwrap();
        assert_eq!(cases[1]["status"], "skipped");
        assert!(full_results(&cases, true, true));
        assert!(!full_results(&cases, false, true));
        assert!(!full_results(&cases, true, false));
        let failed = observed_cases("test one ... ok\ntest two ... FAILED", &expected()).unwrap();
        assert!(!full_results(&failed, true, true));
        assert!(!full_results(&[json!({"status":"skipped"})], true, true));
    }
    #[test]
    fn bounded_profiles_require_the_complete_named_corpus() {
        for (profile, ids) in [
            (Profile::Filesystem, FILESYSTEM_TESTS.as_slice()),
            (Profile::Ollama, OLLAMA_TESTS.as_slice()),
        ] {
            let inventory: BTreeSet<String> = ids
                .iter()
                .map(|id| (*id).to_owned())
                .chain(["unrelated-test".to_owned()])
                .collect();
            assert_eq!(profile.inventory(&inventory).unwrap().len(), ids.len());
            for id in ids {
                let mut missing = inventory.clone();
                missing.remove(*id);
                assert!(profile.inventory(&missing).is_err());
            }
        }
    }

    #[test]
    fn profile_parser_rejects_arbitrary_filters_and_unknown_profiles() {
        assert_eq!(Profile::parse(&[]).unwrap(), Profile::Enabled);
        for name in ["docker", "chromium", "scanners", "filesystem", "ollama"] {
            assert!(Profile::parse(&["--profile".into(), name.into()]).is_ok());
        }
        for arguments in [
            vec!["--profile".into(), "unknown".into()],
            vec![
                "--profile".into(),
                "ollama".into(),
                "--skip".into(),
                "cleanup".into(),
            ],
            vec!["some-test".into()],
        ] {
            assert!(Profile::parse(&arguments).is_err());
        }
    }
}
