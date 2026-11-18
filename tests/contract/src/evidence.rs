//! Bind reference evidence to the gateway and contract sources present during a run.
use anyhow::Result;
use serde_json::{Value, json};
use std::{collections::BTreeMap, fs, path::Path};

const TRANSLATED_SCOPE: &str = "translated-reference-v1";

// These are separate native component targets, never inputs to tail_static.
// Keep all gateway/shared sources, assertion interpreters, fixtures and manifests.
fn translated_input(relative: &str) -> bool {
    !(relative == "tests/contract/tests/gateway_rust.rs"
        || relative
            .strip_prefix("tests/contract/tests/")
            .is_some_and(|name| {
                name.starts_with("gateway_rust_") && name.ends_with(".rs") && !name.contains('/')
            })
        || relative
            .strip_prefix("tests/contract/drivers/")
            .is_some_and(|name| {
                name.starts_with("native") && name.ends_with(".ts") && !name.contains('/')
            }))
}

fn collect(
    root: &Path,
    directory: &Path,
    files: &mut BTreeMap<String, String>,
    translated: bool,
) -> Result<()> {
    for entry in fs::read_dir(directory)? {
        let entry = entry?;
        if [
            "node_modules",
            "dist",
            "build",
            "web-dist",
            "target",
            ".git",
        ]
        .contains(&entry.file_name().to_string_lossy().as_ref())
        {
            continue;
        }
        let kind = entry.file_type()?;
        let path = entry.path();
        if kind.is_dir() {
            collect(root, &path, files, translated)?;
        } else if kind.is_file()
            && path
                .extension()
                .and_then(|ext| ext.to_str())
                .is_some_and(|ext| {
                    ["rs", "ts", "tsx", "js", "mjs", "cjs", "toml", "lock"].contains(&ext)
                        || (ext == "json"
                            && (path.starts_with(root.join("tests/contract/vectors"))
                                || path.starts_with(root.join("tests/contract/corpus"))
                                || path == root.join("tests/contract/interfaces.json")))
                        || (ext == "txt"
                            && path.starts_with(root.join("tests/contract/tooling/sources")))
                })
        {
            let relative = path
                .strip_prefix(root)?
                .to_string_lossy()
                .replace('\\', "/");
            if translated && !translated_input(&relative) {
                continue;
            }
            let bytes = fs::read(&path)?;
            let hash = bytes.iter().fold(0xcbf29ce484222325_u64, |hash, byte| {
                (hash ^ u64::from(*byte)).wrapping_mul(0x100000001b3)
            });
            files.insert(relative, format!("{hash:016x}"));
        }
    }
    Ok(())
}

fn scoped_snapshot(root: &Path, translated: bool) -> Result<Value> {
    let mut files = BTreeMap::new();
    for relative in [
        "package.json",
        "bun.lock",
        ".github/workflows/ci.yml",
        ".github/workflows/release.yml",
    ] {
        let bytes = fs::read(root.join(relative))?;
        let hash = bytes.iter().fold(0xcbf29ce484222325_u64, |hash, byte| {
            (hash ^ u64::from(*byte)).wrapping_mul(0x100000001b3)
        });
        files.insert(relative.to_owned(), format!("{hash:016x}"));
    }
    collect(root, &root.join("packages/gateway"), &mut files, translated)?;
    collect(
        root,
        &root.join("packages/shared/src"),
        &mut files,
        translated,
    )?;
    collect(root, &root.join("tests/contract"), &mut files, translated)?;
    let mut snapshot = json!({"algorithm":"fnv1a64-by-file", "files":files});
    if translated {
        snapshot["scope"] = json!(TRANSLATED_SCOPE);
    }
    Ok(snapshot)
}

// This module is shared by independent binary targets, each using its own scope.
#[allow(dead_code)]
pub fn snapshot(root: &Path) -> Result<Value> {
    scoped_snapshot(root, false)
}

#[allow(dead_code)]
pub fn translated_snapshot(root: &Path) -> Result<Value> {
    scoped_snapshot(root, true)
}

#[allow(dead_code)]
pub fn snapshot_matches(report: &Value, full: &Value, translated: &Value) -> bool {
    let recorded = &report["source_fingerprints"];
    match recorded.get("scope") {
        None => recorded == full,
        Some(Value::String(scope)) if scope == TRANSLATED_SCOPE => {
            matches!(
                report["profile"].as_str(),
                Some(
                    "translated-enabled-typescript-reference"
                        | "translated-docker-typescript-reference"
                        | "translated-chromium-typescript-reference"
                        | "translated-scanners-typescript-reference"
                        | "translated-filesystem-typescript-reference"
                        | "translated-ollama-typescript-reference"
                )
            ) && recorded == translated
        }
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn translated_scope_excludes_only_separate_native_component_files() {
        for path in [
            "tests/contract/tests/gateway_rust.rs",
            "tests/contract/tests/gateway_rust_acp_binary_launcher.rs",
            "tests/contract/drivers/nativeacpbinarylauncher.ts",
        ] {
            assert!(!translated_input(path), "{path}");
        }
        for path in [
            "packages/gateway/src/providers/native.ts",
            "tests/contract/tests/tail_static.rs",
            "tests/contract/tests/support/tail_stream.rs",
            "tests/contract/src/bin/translated-contract.rs",
            "tests/contract/src/evidence.rs",
            "tests/contract/drivers/tailstatic.ts",
            "tests/contract/drivers/tail-node-loader.mjs",
            "tests/contract/drivers/tailstatic/fixture-native.ts",
            "tests/contract/drivers/native/fixture.ts",
            "tests/contract/vectors/native.json",
            "tests/contract/Cargo.toml",
            "tests/contract/Cargo.lock",
        ] {
            assert!(translated_input(path), "{path}");
        }
    }

    #[test]
    fn scoped_reports_require_exact_inputs_and_a_known_translated_profile() {
        let full = json!({"algorithm":"fnv1a64-by-file","files":{"a":"one","native":"two"}});
        let translated =
            json!({"algorithm":"fnv1a64-by-file","scope":TRANSLATED_SCOPE,"files":{"a":"one"}});
        let mut report = json!({"profile":"translated-enabled-typescript-reference","source_fingerprints":translated});
        assert!(snapshot_matches(&report, &full, &translated));
        report["source_fingerprints"]["files"]["a"] = json!("changed");
        assert!(!snapshot_matches(&report, &full, &translated));
        report["source_fingerprints"] = translated.clone();
        report["source_fingerprints"]["files"] = json!({});
        assert!(!snapshot_matches(&report, &full, &translated));
        report["source_fingerprints"] = translated.clone();
        report["profile"] = json!("managed-http-and-restart");
        assert!(!snapshot_matches(&report, &full, &translated));
        report["source_fingerprints"]["scope"] = json!("unrecognized");
        assert!(!snapshot_matches(&report, &full, &translated));
        report["source_fingerprints"] = full.clone();
        assert!(snapshot_matches(&report, &full, &translated));
        report["source_fingerprints"]["files"]["native"] = json!("changed");
        assert!(!snapshot_matches(&report, &full, &translated));
    }

    #[test]
    fn snapshots_detect_runtime_fixture_assertion_and_manifest_mutations() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../..")
            .canonicalize()
            .unwrap()
            .join(".jait/artifacts/evidence-scope-tests")
            .join(uuid::Uuid::new_v4().to_string());
        let required = [
            "package.json",
            "bun.lock",
            ".github/workflows/ci.yml",
            ".github/workflows/release.yml",
            "packages/gateway/src/subject.ts",
            "packages/gateway/src/subject.test.ts",
            "packages/shared/src/contract.ts",
            "tests/contract/tests/tail_static.rs",
            "tests/contract/tests/support/tail_stream.rs",
            "tests/contract/src/evidence.rs",
            "tests/contract/src/bin/translated-contract.rs",
            "tests/contract/drivers/tailstatic.ts",
            "tests/contract/drivers/tail-node-loader.mjs",
            "tests/contract/drivers/tailstatic/fixture-native.ts",
            "tests/contract/vectors/sourcereview.json",
            "tests/contract/Cargo.toml",
            "tests/contract/Cargo.lock",
        ];
        let separate = [
            "tests/contract/tests/gateway_rust_acp_binary_launcher.rs",
            "tests/contract/drivers/nativeacpbinarylauncher.ts",
        ];
        for path in required.iter().chain(separate.iter()) {
            let path = root.join(path);
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            fs::write(path, b"original").unwrap();
        }
        let before = translated_snapshot(&root).unwrap();
        for path in required {
            fs::write(root.join(path), b"mutation").unwrap();
            assert_ne!(translated_snapshot(&root).unwrap(), before, "{path}");
            fs::write(root.join(path), b"original").unwrap();
            assert_eq!(translated_snapshot(&root).unwrap(), before, "{path}");
        }
        let full_before = snapshot(&root).unwrap();
        for path in separate {
            fs::write(root.join(path), b"mutation").unwrap();
            assert_eq!(translated_snapshot(&root).unwrap(), before, "{path}");
            assert_ne!(snapshot(&root).unwrap(), full_before, "{path}");
            fs::write(root.join(path), b"original").unwrap();
        }
        fs::write(
            root.join("tests/contract/drivers/tailstatic/new-fixture.ts"),
            b"new",
        )
        .unwrap();
        assert_ne!(translated_snapshot(&root).unwrap(), before);
        fs::remove_dir_all(root).unwrap();
    }
}
