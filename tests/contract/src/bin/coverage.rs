//! Audit inventory drift and explicit Rust parity evidence without executing TypeScript.
#[path = "../evidence.rs"]
mod evidence;
use anyhow::{Context, Result, bail, ensure};
use serde_json::{Value, json};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    path::{Component, Path, PathBuf},
};

fn fingerprint(bytes: &[u8]) -> String {
    let hash = bytes.iter().fold(0xcbf29ce484222325_u64, |hash, byte| {
        (hash ^ u64::from(*byte)).wrapping_mul(0x100000001b3)
    });
    format!("{hash:016x}")
}

fn inventory_files(root: &Path, directory: &Path, paths: &mut BTreeSet<String>) -> Result<()> {
    for entry in fs::read_dir(directory)? {
        let entry = entry?;
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if [
            "node_modules",
            "dist",
            "build",
            "web-dist",
            "target",
            ".git",
        ]
        .contains(&name.as_ref())
        {
            continue;
        }
        let kind = entry.file_type()?;
        if kind.is_dir() {
            inventory_files(root, &entry.path(), paths)?;
        } else if kind.is_file()
            && !name.ends_with(".d.ts")
            && ["ts", "tsx", "js", "cjs", "mjs"].contains(
                &entry
                    .path()
                    .extension()
                    .and_then(|v| v.to_str())
                    .unwrap_or(""),
            )
        {
            paths.insert(
                entry
                    .path()
                    .strip_prefix(root)?
                    .to_string_lossy()
                    .replace('\\', "/"),
            );
        }
    }
    Ok(())
}

fn safe_path(root: &Path, relative: &str, prefix: &str) -> Result<PathBuf> {
    let path = Path::new(relative);
    ensure!(
        !path.is_absolute() && path.components().all(|c| matches!(c, Component::Normal(_))),
        "non-project path: {relative}"
    );
    ensure!(
        relative.starts_with(prefix),
        "path outside {prefix}: {relative}"
    );
    let canonical = root
        .join(path)
        .canonicalize()
        .with_context(|| format!("missing {relative}"))?;
    ensure!(
        canonical.starts_with(root.join(prefix).canonicalize()?),
        "path escapes project boundary: {relative}"
    );
    Ok(canonical)
}

fn validate_inventory_file(root: &Path, file: &Value, current: &BTreeSet<String>) -> Result<()> {
    let original = file["path"].as_str().context("missing file path")?;
    let path = if let Some(archive) = file["retained_source"].as_str() {
        ensure!(
            original.starts_with("packages/gateway/")
                && !Path::new(original).is_absolute()
                && Path::new(original)
                    .components()
                    .all(|c| matches!(c, Component::Normal(_))),
            "invalid retained original path"
        );
        ensure!(
            !current.contains(original) && !root.join(original).exists(),
            "retained contract has an active source; reconcile explicitly: {original}"
        );
        ensure!(
            file["retained_reason"]
                .as_str()
                .is_some_and(|s| !s.trim().is_empty()),
            "retained contract needs a reason"
        );
        safe_path(root, archive, "tests/contract/tooling/sources/")?
    } else {
        safe_path(root, original, "packages/gateway/")?
    };
    ensure!(
        file["fingerprint"] == fingerprint(&fs::read(path)?),
        "changed source; refresh behavior inventory: {original}"
    );
    Ok(())
}

fn passing_report(report: &Value, id: &str) -> bool {
    report["backend_label"] == "typescript"
        && report["success"] == true
        && report["cases"].as_array().is_some_and(|cases| {
            cases
                .iter()
                .any(|case| case["id"] == id && case["status"] == "passed")
        })
}

// A declaration batch normally shares a handful of large Rust sources and reports.
// Cache only within this audit, and reject mutation before writing the verdict.
#[derive(Default)]
struct EvidenceCache {
    sources: BTreeMap<PathBuf, String>,
    reports: BTreeMap<PathBuf, BTreeSet<String>>,
    contents: BTreeMap<PathBuf, Vec<u8>>,
}

impl EvidenceCache {
    fn source_contains(&mut self, path: &Path, id: &str) -> Result<bool> {
        if !self.sources.contains_key(path) {
            let bytes = fs::read(path)?;
            self.contents.insert(path.to_owned(), bytes.clone());
            self.sources
                .insert(path.to_owned(), String::from_utf8(bytes)?);
        }
        Ok(self.sources[path].contains(id))
    }

    fn report_passes(&mut self, path: &Path, id: &str) -> Result<bool> {
        if !self.reports.contains_key(path) {
            let bytes = fs::read(path)?;
            let report: Value = serde_json::from_slice(&bytes)?;
            let mut passed = BTreeSet::new();
            if report["backend_label"] == "typescript"
                && report["success"] == true
                && let Some(cases) = report["cases"].as_array()
            {
                for case in cases {
                    if case["status"] == "passed"
                        && let Some(id) = case["id"].as_str()
                    {
                        passed.insert(id.to_owned());
                    }
                }
            }
            self.contents.insert(path.to_owned(), bytes.clone());
            self.reports.insert(path.to_owned(), passed);
        }
        Ok(self.reports[path].contains(id))
    }

    fn verify_unchanged(&self) -> Result<()> {
        for (path, before) in &self.contents {
            ensure!(
                fs::read(path)? == *before,
                "parity evidence changed during audit: {}",
                path.display()
            );
        }
        Ok(())
    }
}

fn parity_evidence(
    root: &Path,
    item: &Value,
    reports: Option<&[Value]>,
    cache: &mut EvidenceCache,
) -> Result<()> {
    ensure!(item["status"] == "verified", "status is not verified");
    ensure!(
        item["parity_review"]
            .as_str()
            .is_some_and(|review| !review.trim().is_empty()),
        "missing assertion-equivalence review"
    );
    let cases = item["rust_cases"]
        .as_array()
        .context("missing rust_cases")?;
    ensure!(!cases.is_empty(), "no Rust cases");
    for case in cases {
        let id = case["id"].as_str().context("missing Rust case id")?;
        let source = safe_path(
            root,
            case["source"].as_str().context("missing Rust source")?,
            "tests/contract/",
        )?;
        ensure!(
            source
                .extension()
                .is_some_and(|extension| extension == "rs"),
            "case source must be Rust"
        );
        ensure!(
            cache.source_contains(&source, id)?,
            "Rust source does not contain case id {id}"
        );
        if let Some(reports) = reports {
            ensure!(
                reports.iter().any(|report| passing_report(report, id)),
                "no successful current TypeScript-backend report for {id}"
            );
        } else {
            let report_path = safe_path(
                root,
                case["report"].as_str().context("missing report path")?,
                ".jait/artifacts/",
            )?;
            ensure!(
                cache.report_passes(&report_path, id)?,
                "no successful TypeScript-backend report for {id}"
            );
        }
    }
    Ok(())
}

// CI uses reports generated in the current checkout instead of ignored historical artifacts.
// Only inspect one level of owned run directories; safe_path rejects symlink escapes.
fn current_reports(root: &Path, relative: &str) -> Result<Vec<Value>> {
    let directory = safe_path(root, relative, ".jait/artifacts/")?;
    let mut reports: BTreeMap<String, (std::time::SystemTime, Value)> = BTreeMap::new();
    let expected_sources = evidence::snapshot(root)?;
    let expected_translated_sources = evidence::translated_snapshot(root)?;
    for entry in fs::read_dir(directory)? {
        let entry = entry?;
        if !entry.file_type()?.is_dir() {
            continue;
        }
        let relative_report = format!(
            "{relative}/{}/report.json",
            entry.file_name().to_string_lossy()
        );
        if !root.join(&relative_report).exists() {
            continue;
        }
        let path = safe_path(root, &relative_report, ".jait/artifacts/")?;
        let report: Value = serde_json::from_slice(&fs::read(&path)?)
            .with_context(|| format!("invalid report {}", path.display()))?;
        if report["sources_unchanged"] == true
            && evidence::snapshot_matches(&report, &expected_sources, &expected_translated_sources)
        {
            let modified = fs::metadata(&path)?.modified()?;
            let profile = report["profile"].as_str().unwrap_or("unknown").to_owned();
            if reports
                .get(&profile)
                .is_none_or(|(previous, _)| modified > *previous)
            {
                reports.insert(profile, (modified, report));
            }
        }
    }
    ensure!(
        !reports.is_empty(),
        "no reports matching current gateway and contract sources in {relative}"
    );
    Ok(reports.into_values().map(|(_, report)| report).collect())
}

fn run() -> Result<()> {
    let mut require_parity = false;
    let mut require_declarations = false;
    let mut evidence_directory = None;
    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--require-parity" => require_parity = true,
            "--require-declarations" => require_declarations = true,
            "--evidence-dir" => {
                evidence_directory = Some(
                    args.next()
                        .context("--evidence-dir requires a project-relative directory")?,
                )
            }
            _ => bail!(
                "Usage: coverage [--require-parity] [--require-declarations] [--evidence-dir DIRECTORY]"
            ),
        }
    }
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()?;
    let reports = evidence_directory
        .as_deref()
        .map(|path| current_reports(&root, path))
        .transpose()?;
    let manifest: Value =
        serde_json::from_slice(&fs::read(root.join("tests/contract/coverage.json"))?)?;
    ensure!(
        manifest["schema_version"] == 1,
        "unsupported coverage manifest schema"
    );
    ensure!(
        manifest["fingerprint_algorithm"] == "fnv1a64-utf8",
        "unsupported fingerprint algorithm"
    );
    let mut current = BTreeSet::new();
    inventory_files(&root, &root.join("packages/gateway"), &mut current)?;
    let mut recorded = BTreeSet::new();
    let mut all_recorded = BTreeSet::new();
    let mut declarations = BTreeSet::new();
    let mut errors = Vec::<String>::new();
    let mut pending = Vec::<String>::new();
    let mut verified = 0;
    let mut pending_declarations = 0;
    let test_files = manifest["test_files"]
        .as_array()
        .context("missing test_files")?;
    let source_files = manifest["source_files"]
        .as_array()
        .context("missing source_files")?;
    let retained = manifest["retained_test_files"]
        .as_array()
        .cloned()
        .unwrap_or_default();
    let mut evidence_cache = EvidenceCache::default();
    for file in test_files.iter().chain(source_files).chain(&retained) {
        let path = file["path"].as_str().context("missing file path")?;
        ensure!(
            all_recorded.insert(path.to_owned()),
            "duplicate inventory path {path}"
        );
        if file["retained_source"].is_null() {
            recorded.insert(path.to_owned());
        }
        if let Err(error) = validate_inventory_file(&root, file, &current) {
            errors.push(format!("{error:#}"));
        }
        if let Some(cases) = file["cases"].as_array() {
            if cases.is_empty() {
                pending.push(format!("manual test declaration review: {path}"));
                pending_declarations += 1;
            }
            for case in cases {
                let id = case["id"].as_str().context("missing declaration id")?;
                ensure!(
                    declarations.insert(id.to_owned()),
                    "duplicate test declaration {id}"
                );
                match case["status"].as_str().unwrap_or("pending") {
                    "pending" => {
                        pending_declarations += 1;
                        pending.push(id.to_owned());
                    }
                    "verified" => {
                        match parity_evidence(&root, case, reports.as_deref(), &mut evidence_cache)
                        {
                            Ok(()) => verified += 1,
                            Err(error) => {
                                errors.push(format!("invalid parity claim {id}: {error:#}"))
                            }
                        }
                    }
                    other => errors.push(format!("unknown case status {other}: {id}")),
                }
            }
        } else {
            match file["status"].as_str().unwrap_or("pending") {
                "pending" => pending.push(format!("source coverage review: {path}")),
                "verified" => {
                    if let Err(error) =
                        parity_evidence(&root, file, reports.as_deref(), &mut evidence_cache)
                    {
                        errors.push(format!("invalid source parity {path}: {error:#}"));
                    }
                }
                other => errors.push(format!("unknown source status {other}: {path}")),
            }
        }
    }
    for path in current.difference(&recorded) {
        errors.push(format!("unmapped gateway file: {path}"));
    }
    for path in recorded.difference(&current) {
        errors.push(format!("removed gateway file: {path}"));
    }
    if let Err(error) = evidence_cache.verify_unchanged() {
        errors.push(format!("{error:#}"));
    }
    let output = json!({
        "schema_version":1,"inventory_consistent":errors.is_empty(),
        "parity_complete":errors.is_empty() && pending.is_empty(),
        "declaration_parity_complete":errors.is_empty() && pending_declarations == 0,
        "test_files":test_files.len(),"retained_test_files":retained.len(),"test_declarations":declarations.len(),
        "source_files":source_files.len(),"verified_declarations":verified,
        "pending_requirements":pending.len(),"pending_declarations":pending_declarations,
        "pending_source_reviews":pending.len().saturating_sub(pending_declarations),"errors":errors,"pending":pending,
        "limits":["Source fingerprints detect drift, not behavior coverage.","Declared verified evidence requires assertion review; this audit cannot prove equivalent assertions.","Parameterized and generated tests require explicit expansion review."]
    });
    let report_dir = root.join(".jait/artifacts/gateway-rust-readiness");
    fs::create_dir_all(&report_dir)?;
    let report_path = report_dir.join("coverage-audit.json");
    fs::write(&report_path, serde_json::to_vec_pretty(&output)?)?;
    println!(
        "Inventory: {} test files, {} test declarations, {} source files",
        test_files.len(),
        declarations.len(),
        source_files.len()
    );
    println!(
        "Rust parity: {verified} verified declarations; {} pending requirements",
        pending.len()
    );
    println!("Report: {}", report_path.display());
    if !require_parity && !pending.is_empty() {
        println!(
            "Inventory/claim validation only; full parity is incomplete. Use --require-parity to gate all {} pending requirements.",
            pending.len()
        );
    }
    for error in &errors {
        eprintln!("{error}");
    }
    ensure!(
        errors.is_empty(),
        "coverage inventory is stale or contains invalid parity claims"
    );
    ensure!(
        !require_declarations || pending_declarations == 0,
        "declaration parity gate blocked: {pending_declarations} declarations remain"
    );
    ensure!(
        !require_parity || pending.is_empty(),
        "Rust-first gate blocked: {} requirements remain",
        pending.len()
    );
    Ok(())
}

fn main() {
    if let Err(error) = run() {
        eprintln!("{error:#}");
        std::process::exit(1);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn shared_evidence_fixture() -> (PathBuf, Value) {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../.jait/artifacts/coverage-cache")
            .join(uuid::Uuid::new_v4().to_string());
        fs::create_dir_all(root.join("tests/contract")).unwrap();
        fs::create_dir_all(root.join(".jait/artifacts")).unwrap();
        fs::write(
            root.join("tests/contract/checks.rs"),
            "fn first_case() {} fn second_case() {} fn missing_case() {}",
        )
        .unwrap();
        fs::write(root.join(".jait/artifacts/report.json"), json!({
            "backend_label":"typescript", "success":true,
            "cases":[{"id":"first_case","status":"passed"},{"id":"second_case","status":"passed"}]
        }).to_string()).unwrap();
        let item = json!({"status":"verified","parity_review":"two independently passing cases",
        "rust_cases":[
            {"id":"first_case","source":"tests/contract/checks.rs","report":".jait/artifacts/report.json"},
            {"id":"second_case","source":"tests/contract/checks.rs","report":".jait/artifacts/report.json"}
        ]});
        (root, item)
    }

    #[test]
    fn shared_reports_keep_case_membership_and_failure_checks() {
        let (root, mut item) = shared_evidence_fixture();
        let mut cache = EvidenceCache::default();
        parity_evidence(&root, &item, None, &mut cache).unwrap();
        item["rust_cases"][1]["id"] = json!("missing_case");
        assert!(parity_evidence(&root, &item, None, &mut cache).is_err());
        cache.verify_unchanged().unwrap();
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn report_edits_during_an_audit_fail_closed() {
        let (root, item) = shared_evidence_fixture();
        let mut cache = EvidenceCache::default();
        parity_evidence(&root, &item, None, &mut cache).unwrap();
        fs::write(root.join(".jait/artifacts/report.json"), json!({
            "backend_label":"typescript","success":false,
            "cases":[{"id":"first_case","status":"passed"},{"id":"second_case","status":"passed"}]
        }).to_string()).unwrap();
        assert!(cache.verify_unchanged().is_err());
        assert!(parity_evidence(&root, &item, None, &mut EvidenceCache::default()).is_err());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rust_source_edits_during_an_audit_fail_closed() {
        let (root, item) = shared_evidence_fixture();
        let mut cache = EvidenceCache::default();
        parity_evidence(&root, &item, None, &mut cache).unwrap();
        fs::write(
            root.join("tests/contract/checks.rs"),
            "fn unrelated_case() {}",
        )
        .unwrap();
        assert!(cache.verify_unchanged().is_err());
        assert!(parity_evidence(&root, &item, None, &mut EvidenceCache::default()).is_err());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn retained_contracts_require_unchanged_bounded_archives_and_absent_originals() {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../..")
            .canonicalize()
            .unwrap();
        let fixture = root
            .join(".jait/artifacts")
            .join(format!("retained-audit-{}", uuid::Uuid::new_v4()));
        let archive = "tests/contract/tooling/sources/deleted.test.ts.txt";
        fs::create_dir_all(fixture.join("tests/contract/tooling/sources")).unwrap();
        fs::create_dir_all(fixture.join("packages/gateway/src")).unwrap();
        fs::write(fixture.join(archive), b"original assertions").unwrap();
        let mut file = json!({"path":"packages/gateway/src/deleted.test.ts", "retained_source":archive,
            "retained_reason":"Deleted contract still requires review", "fingerprint":fingerprint(b"original assertions")});
        assert!(validate_inventory_file(&fixture, &file, &BTreeSet::new()).is_ok());
        fs::write(fixture.join(archive), b"weakened assertions").unwrap();
        assert!(validate_inventory_file(&fixture, &file, &BTreeSet::new()).is_err());
        fs::write(fixture.join(archive), b"original assertions").unwrap();
        let active = BTreeSet::from(["packages/gateway/src/deleted.test.ts".to_owned()]);
        assert!(validate_inventory_file(&fixture, &file, &active).is_err());
        file["retained_reason"] = json!("");
        assert!(validate_inventory_file(&fixture, &file, &BTreeSet::new()).is_err());
        file["retained_reason"] = json!("preserve");
        file["retained_source"] = json!("tests/contract/tooling/sources/../../../../package.json");
        assert!(validate_inventory_file(&fixture, &file, &BTreeSet::new()).is_err());
        fs::remove_dir_all(fixture).unwrap();
    }

    #[test]
    fn fingerprints_detect_source_edits() {
        assert_eq!(fingerprint(b""), "cbf29ce484222325");
        assert_eq!(fingerprint(b"hello"), "a430d84680aabd0b");
        assert_ne!(
            fingerprint(b"it('rejects', fn)"),
            fingerprint(b"it.skip('rejects', fn)")
        );
    }

    #[test]
    fn parity_requires_successful_case_on_typescript() {
        let valid = json!({"backend_label":"typescript","success":true,"cases":[{"id":"auth.denied","status":"passed"}]});
        assert!(passing_report(&valid, "auth.denied"));
        assert!(!passing_report(&valid, "missing"));
        let mut failed = valid.clone();
        failed["success"] = json!(false);
        assert!(!passing_report(&failed, "auth.denied"));
        let mut rust = valid.clone();
        rust["backend_label"] = json!("rust");
        assert!(!passing_report(&rust, "auth.denied"));
        let mut skipped = valid;
        skipped["cases"][0]["status"] = json!("skipped");
        assert!(!passing_report(&skipped, "auth.denied"));
    }

    #[test]
    fn evidence_paths_reject_traversal_before_reading() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR"));
        assert!(safe_path(root, "../secret", "tests/contract/").is_err());
        assert!(safe_path(root, "/etc/passwd", "tests/contract/").is_err());
        assert!(safe_path(root, "packages/gateway/config.ts", "tests/contract/").is_err());
    }
    #[test]
    fn current_evidence_replaces_historical_paths_without_falling_back() {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../..")
            .canonicalize()
            .unwrap();
        let item = json!({
            "status":"verified", "parity_review":"fixture assertion review",
            "rust_cases":[{
                "id":"coverage.fixture-case", "source":"tests/contract/src/bin/coverage.rs",
                "report":".jait/artifacts/absent-historical-report.json"
            }]
        });
        let passed = json!({"backend_label":"typescript","success":true,
            "cases":[{"id":"coverage.fixture-case","status":"passed"}]});
        assert!(
            parity_evidence(&root, &item, Some(&[passed]), &mut EvidenceCache::default()).is_ok()
        );
        assert!(parity_evidence(&root, &item, Some(&[]), &mut EvidenceCache::default()).is_err());
        assert!(parity_evidence(&root, &item, None, &mut EvidenceCache::default()).is_err());
    }

    #[test]
    fn evidence_directory_requires_reports_within_project_artifacts() {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../..")
            .canonicalize()
            .unwrap();
        assert!(current_reports(&root, "tests/contract").is_err());
        assert!(current_reports(&root, ".jait/artifacts/../secret").is_err());
        let relative = format!(".jait/artifacts/coverage-test-{}", uuid::Uuid::new_v4());
        let run = root.join(&relative).join("run");
        fs::create_dir_all(&run).unwrap();
        assert!(current_reports(&root, &relative).is_err());
        fs::write(run.join("report.json"), b"{bad-json").unwrap();
        assert!(current_reports(&root, &relative).is_err());
        fs::write(run.join("report.json"), b"{}").unwrap();
        assert!(current_reports(&root, &relative).is_err());
        let report = json!({"sources_unchanged":true, "source_fingerprints":evidence::snapshot(&root).unwrap()});
        fs::write(
            run.join("report.json"),
            serde_json::to_vec(&report).unwrap(),
        )
        .unwrap();
        assert_eq!(current_reports(&root, &relative).unwrap().len(), 1);
        fs::remove_dir_all(root.join(relative)).unwrap();
    }
    #[test]
    fn translated_evidence_uses_its_exact_scope_and_still_rejects_runtime_drift() {
        let project = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../..")
            .canonicalize()
            .unwrap();
        let root = project
            .join(".jait/artifacts/coverage-scoped")
            .join(uuid::Uuid::new_v4().to_string());
        for directory in [
            "packages/gateway/src",
            "packages/shared/src",
            "tests/contract/tests",
            "tests/contract/drivers",
            ".github/workflows",
            ".jait/artifacts/reports/run",
        ] {
            fs::create_dir_all(root.join(directory)).unwrap();
        }
        for path in [
            "package.json",
            "bun.lock",
            ".github/workflows/ci.yml",
            ".github/workflows/release.yml",
            "packages/gateway/src/subject.ts",
            "tests/contract/tests/gateway_rust_subject.rs",
            "tests/contract/drivers/nativesubject.ts",
        ] {
            fs::write(root.join(path), b"original").unwrap();
        }
        let fingerprint = evidence::translated_snapshot(&root).unwrap();
        let mut report = json!({
            "profile":"translated-enabled-typescript-reference", "backend_label":"typescript",
            "success":true, "sources_unchanged":true, "source_fingerprints":fingerprint,
            "cases":[{"id":"scope-case","status":"passed"}]
        });
        let report_path = root.join(".jait/artifacts/reports/run/report.json");
        let write =
            |report: &Value| fs::write(&report_path, serde_json::to_vec(report).unwrap()).unwrap();
        write(&report);
        assert_eq!(
            current_reports(&root, ".jait/artifacts/reports")
                .unwrap()
                .len(),
            1
        );
        for path in [
            "tests/contract/tests/gateway_rust_subject.rs",
            "tests/contract/drivers/nativesubject.ts",
        ] {
            fs::write(root.join(path), b"native mutation").unwrap();
        }
        assert_eq!(
            current_reports(&root, ".jait/artifacts/reports")
                .unwrap()
                .len(),
            1
        );
        fs::write(
            root.join("packages/gateway/src/subject.ts"),
            b"runtime mutation",
        )
        .unwrap();
        assert!(current_reports(&root, ".jait/artifacts/reports").is_err());
        fs::write(root.join("packages/gateway/src/subject.ts"), b"original").unwrap();
        report["source_fingerprints"]["files"] = json!({});
        write(&report);
        assert!(current_reports(&root, ".jait/artifacts/reports").is_err());
        report["source_fingerprints"] = fingerprint.clone();
        report["profile"] = json!("managed-http-and-restart");
        write(&report);
        assert!(current_reports(&root, ".jait/artifacts/reports").is_err());
        report["profile"] = json!("translated-enabled-typescript-reference");
        report["success"] = json!(false);
        report["cases"][0]["status"] = json!("failed");
        write(&report);
        let reports = current_reports(&root, ".jait/artifacts/reports").unwrap();
        assert!(!passing_report(&reports[0], "scope-case"));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn latest_report_for_same_profile_cannot_be_masked_by_an_earlier_pass() {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../..")
            .canonicalize()
            .unwrap();
        let relative = format!(".jait/artifacts/coverage-test-{}", uuid::Uuid::new_v4());
        let sources = evidence::snapshot(&root).unwrap();
        for (run, success, seconds) in [("old", true, 1), ("new", false, 2)] {
            let directory = root.join(&relative).join(run);
            fs::create_dir_all(&directory).unwrap();
            let report = json!({"profile":"managed-http-and-restart","backend_label":"typescript",
                "success":success,"sources_unchanged":true,"source_fingerprints":sources,
                "cases":[{"id":"test-case","status":if success {"passed"} else {"failed"}}]});
            let path = directory.join("report.json");
            fs::write(&path, serde_json::to_vec(&report).unwrap()).unwrap();
            fs::File::open(path)
                .unwrap()
                .set_times(
                    fs::FileTimes::new().set_modified(
                        std::time::UNIX_EPOCH + std::time::Duration::from_secs(seconds),
                    ),
                )
                .unwrap();
        }
        let reports = current_reports(&root, &relative).unwrap();
        assert_eq!(reports.len(), 1);
        assert!(!passing_report(&reports[0], "test-case"));
        fs::remove_dir_all(root.join(relative)).unwrap();
    }
}
