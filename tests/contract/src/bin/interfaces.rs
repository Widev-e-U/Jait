//! R01 manifest audit. No subprocesses, TypeScript runtime, or shared-crate changes.
use anyhow::{Context, Result, bail, ensure};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    path::{Component, Path, PathBuf},
};

const DIRS: &[&str] = &[
    "packages/gateway/src",
    "packages/shared/src",
    "packages/gateway/bin",
    "packages/gateway/scripts",
];
const EXTRA: &[&str] = &[
    "packages/gateway/package.json",
    "packages/shared/package.json",
];
const KINDS: &[&str] = &[
    "route",
    "schema",
    "tool",
    "ws_event",
    "sse_event",
    "db_table",
    "db_migration",
    "config",
    "cli",
    "dependency",
    "bridge",
    "asset",
    "platform",
];
const OWNERS: &[&str] = &[
    "R07-storage",
    "R04-http",
    "R05-streaming",
    "R06-execution",
    "R01-runtime-and-shared",
];
#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Manifest {
    schema_version: u32,
    fingerprint_algorithm: String,
    policy: String,
    directories: Vec<String>,
    extra_files: Vec<String>,
    categories: Vec<String>,
    category_gaps: Vec<CategoryGap>,
    files: Vec<Source>,
}
#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct CategoryGap {
    kind: String,
    status: String,
    gap: String,
}
#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Source {
    path: String,
    fingerprint: String,
    migration_owner: String,
    status: String,
    required_test_ids: Vec<String>,
    gap: String,
    interface_ids: Vec<String>,
    claims_fingerprint: String,
    claims: Vec<Claim>,
}
#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Claim {
    id: String,
    kind: String,
    name: String,
    start: usize,
    end: usize,
    fingerprint: String,
    details: Value,
    status: String,
    required_test_ids: Vec<String>,
    gap: String,
}
fn fingerprint(bytes: &[u8]) -> String {
    let h = bytes.iter().fold(0xcbf29ce484222325_u64, |h, b| {
        (h ^ u64::from(*b)).wrapping_mul(0x100000001b3)
    });
    format!("{h:016x}")
}
fn nonempty(s: &str) -> bool {
    !s.trim().is_empty()
}
fn pending(status: &str, tests: &[String], gap: &str) -> Result<()> {
    // Schema v1 deliberately cannot grant reviewed/complete status. A future reviewed
    // evidence protocol must define exact executable IDs before allowing such claims.
    ensure!(status == "pending", "unsupported completeness/parity claim");
    ensure!(
        tests.is_empty(),
        "v1 has no reviewed test-ID evidence resolver; use explicit pending gap"
    );
    ensure!(nonempty(gap), "missing explicit pending gap");
    Ok(())
}
fn safe(root: &Path, relative: &str) -> Result<PathBuf> {
    ensure!(
        !relative.contains('\\') && !relative.is_empty(),
        "invalid relative path"
    );
    ensure!(
        Path::new(relative)
            .components()
            .all(|c| matches!(c, Component::Normal(_))),
        "path injection: {relative}"
    );
    let mut current = root.to_path_buf();
    for c in Path::new(relative).components() {
        current.push(c);
        ensure!(
            !fs::symlink_metadata(&current)?.file_type().is_symlink(),
            "symlink: {relative}"
        );
    }
    ensure!(
        current.canonicalize()?.starts_with(root.canonicalize()?),
        "path escape"
    );
    Ok(current)
}
fn walk(root: &Path, rel: &str, out: &mut BTreeSet<String>) -> Result<()> {
    for e in fs::read_dir(safe(root, rel)?)? {
        let e = e?;
        let name = e
            .file_name()
            .into_string()
            .map_err(|_| anyhow::anyhow!("non-UTF8 path"))?;
        if [
            "node_modules",
            "dist",
            "build",
            "web-dist",
            "target",
            ".git",
        ]
        .contains(&name.as_str())
        {
            continue;
        }
        let p = format!("{rel}/{name}");
        let kind = e.file_type()?;
        ensure!(!kind.is_symlink(), "symlink: {p}");
        if kind.is_dir() {
            walk(root, &p, out)?;
        } else if kind.is_file() {
            let stem = name.rsplit_once('.').map(|(s, _)| s).unwrap_or(&name);
            if !(stem.ends_with(".test") || stem.ends_with(".spec")) {
                out.insert(p);
            }
        }
    }
    Ok(())
}
fn same(actual: &[String], expected: &[&str]) -> bool {
    actual
        .iter()
        .map(String::as_str)
        .eq(expected.iter().copied())
}
fn parse(bytes: &[u8]) -> Result<Manifest> {
    ensure!(bytes.len() <= 16 * 1024 * 1024, "oversized manifest");
    serde_json::from_slice(bytes).context("malformed interface manifest")
}
fn audit(root: &Path, m: &Manifest, strict: bool) -> Result<Value> {
    ensure!(
        m.schema_version == 1 && m.fingerprint_algorithm == "fnv1a64-bytes",
        "unsupported manifest format"
    );
    ensure!(nonempty(&m.policy), "missing limitations policy");
    ensure!(
        same(&m.directories, DIRS) && same(&m.extra_files, EXTRA) && same(&m.categories, KINDS),
        "inventory scope/category downgrade"
    );
    let mut gaps = BTreeSet::new();
    for g in &m.category_gaps {
        ensure!(
            KINDS.contains(&g.kind.as_str()) && gaps.insert(g.kind.as_str()),
            "unknown/duplicate category gap"
        );
        pending(&g.status, &[], &g.gap)?;
    }
    ensure!(gaps.len() == KINDS.len(), "missing category gap");
    let mut current = BTreeSet::new();
    for d in DIRS {
        walk(root, d, &mut current)?;
    }
    for p in EXTRA {
        safe(root, p)?;
        current.insert((*p).into());
    }
    let mut seen = BTreeSet::new();
    let mut ids = BTreeSet::new();
    let mut counts = BTreeMap::<String, usize>::new();
    for f in &m.files {
        ensure!(
            current.contains(&f.path) && seen.insert(f.path.clone()),
            "unknown/duplicate file: {}",
            f.path
        );
        ensure!(
            OWNERS.contains(&f.migration_owner.as_str()),
            "unmapped migration owner: {}",
            f.path
        );
        pending(&f.status, &f.required_test_ids, &f.gap)?;
        let bytes = fs::read(safe(root, &f.path)?)?;
        ensure!(
            fingerprint(&bytes) == f.fingerprint,
            "source drift: {}",
            f.path
        );
        ensure!(
            fingerprint(serde_json::to_string(&serde_json::to_value(&f.claims)?)?.as_bytes())
                == f.claims_fingerprint,
            "claim inventory edited without recapture: {}",
            f.path
        );
        let mut local = BTreeSet::new();
        for c in &f.claims {
            ensure!(KINDS.contains(&c.kind.as_str()), "unknown interface kind");
            ensure!(
                c.id.starts_with(&format!("{}#{}:", f.path, c.kind))
                    && ids.insert(c.id.clone())
                    && local.insert(c.id.clone()),
                "invalid/duplicate interface ID"
            );
            pending(&c.status, &c.required_test_ids, &c.gap)?;
            ensure!(
                nonempty(&c.name) && c.details.is_object(),
                "malformed claim"
            );
            ensure!(
                c.start <= c.end && c.end <= bytes.len(),
                "invalid evidence span"
            );
            let evidence = &bytes[c.start..c.end];
            ensure!(
                fingerprint(evidence) == c.fingerprint,
                "claim evidence drift: {}",
                c.id
            );
            // Literal candidate names must occur in their pinned evidence. Dynamic
            // candidates are explicitly unresolved and cannot assert a literal name.
            ensure!(
                (c.kind == "asset" && c.name == f.path)
                    || ["<dynamic>", "<dynamic executable>"].contains(&c.name.as_str())
                    || String::from_utf8_lossy(evidence).contains(&c.name),
                "invented interface name: {}",
                c.id
            );
            *counts.entry(c.kind.clone()).or_default() += 1;
        }
        ensure!(
            f.interface_ids.len() == local.len()
                && f.interface_ids.iter().cloned().collect::<BTreeSet<_>>() == local,
            "unmapped/deleted interface claims: {}",
            f.path
        );
    }
    ensure!(
        seen == current,
        "new or removed runtime files require explicit mapping: {:?}",
        current.symmetric_difference(&seen).collect::<Vec<_>>()
    );
    if strict {
        bail!(
            "R01 pending: {} source mappings, {} interface candidates, {} category gaps",
            seen.len(),
            ids.len(),
            gaps.len()
        );
    }
    Ok(
        json!({"schema_version":1,"result":"inventory-consistent-with-pending-gaps","source_files":seen.len(),"interface_candidates":ids.len(),"category_counts":counts,"pending_source_mappings":seen.len(),"pending_interface_candidates":ids.len(),"pending_category_gaps":gaps.len(),"runtime":"native Rust; no subprocess or Node/Bun dependency","completeness":false}),
    )
}
fn main() -> Result<()> {
    let mut root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
    let mut strict = false;
    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--root" => root = PathBuf::from(args.next().context("--root requires path")?),
            "--require-resolved" => strict = true,
            _ => bail!("unknown argument: {arg}"),
        }
    }
    let root = root.canonicalize()?;
    let p = safe(&root, "tests/contract/interfaces.json")?;
    ensure!(
        fs::metadata(&p)?.len() <= 16 * 1024 * 1024,
        "oversized manifest"
    );
    let report = audit(&root, &parse(&fs::read(p)?)?, strict)?;
    let out = root.join(".jait/artifacts/rust-continuation/interfaces");
    fs::create_dir_all(&out)?;
    fs::write(out.join("audit.json"), serde_json::to_vec_pretty(&report)?)?;
    println!("{}", serde_json::to_string_pretty(&report)?);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    static NEXT: AtomicUsize = AtomicUsize::new(0);
    fn fixture() -> (PathBuf, Value) {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../.jait/artifacts/rust-continuation/interfaces/fixtures")
            .join(format!(
                "{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed)
            ));
        fs::create_dir_all(&root).unwrap();
        for d in DIRS {
            fs::create_dir_all(root.join(d)).unwrap();
        }
        for p in EXTRA {
            fs::write(root.join(p), b"{}").unwrap();
        }
        let p = "packages/gateway/src/a.ts";
        let bytes = b"app.get('/safe', handler);";
        fs::write(root.join(p), bytes).unwrap();
        let files:Vec<Value>=EXTRA.iter().copied().chain([p]).map(|p| {
            let bytes=fs::read(root.join(p)).unwrap();
            json!({"path":p,"fingerprint":fingerprint(&bytes),"migration_owner":"R01-runtime-and-shared","status":"pending","required_test_ids":[],"gap":"Explicit behavior mapping pending","interface_ids":[],"claims_fingerprint":fingerprint(b"[]"),"claims":[]})
        }).collect();
        let mut v = json!({"schema_version":1,"fingerprint_algorithm":"fnv1a64-bytes","policy":"pending candidates only","directories":DIRS,"extra_files":EXTRA,"categories":KINDS,"category_gaps":KINDS.iter().map(|k|json!({"kind":k,"status":"pending","gap":"unresolved registration graph"})).collect::<Vec<_>>(),"files":files});
        let id = format!("{p}#route:0");
        v["files"][2]["interface_ids"] = json!([id]);
        v["files"][2]["claims"] = json!([{"id":id,"kind":"route","name":"/safe","start":0,"end":bytes.len(),"fingerprint":fingerprint(bytes),"details":{"methods":"GET"},"status":"pending","required_test_ids":[],"gap":"schema/activation/test IDs pending"}]);
        v["files"][2]["claims_fingerprint"] = json!(fingerprint(
            serde_json::to_string(&v["files"][2]["claims"])
                .unwrap()
                .as_bytes()
        ));
        (root, v)
    }
    fn run(root: &Path, v: &Value) -> Result<Value> {
        audit(root, &parse(&serde_json::to_vec(v)?)?, false)
    }
    #[test]
    fn deterministic_and_pending_is_not_complete() {
        let (r, v) = fixture();
        let a = run(&r, &v).unwrap();
        assert_eq!(a, run(&r, &v).unwrap());
        assert_eq!(a["completeness"], false);
        assert!(audit(&r, &parse(&serde_json::to_vec(&v).unwrap()).unwrap(), true).is_err());
    }
    #[test]
    fn rejects_changed_new_removed_sources_and_shared_files() {
        for mode in ["changed", "new", "removed", "shared"] {
            let (r, v) = fixture();
            match mode {
                "changed" => fs::write(
                    r.join("packages/gateway/src/a.ts"),
                    "app.post('/injected', handler)",
                )
                .unwrap(),
                "new" => fs::write(r.join("packages/gateway/bin/new.mjs"), "export {}").unwrap(),
                "shared" => fs::write(
                    r.join("packages/shared/src/new.ts"),
                    "export type Wire = string",
                )
                .unwrap(),
                _ => fs::remove_file(r.join("packages/gateway/src/a.ts")).unwrap(),
            }
            assert!(run(&r, &v).is_err(), "{mode}");
        }
    }
    #[test]
    fn rejects_injected_deleted_duplicate_unmapped_claims() {
        for mode in 0..9 {
            let (r, mut v) = fixture();
            match mode {
                0 => v["files"][2]["claims"][0]["name"] = json!("$(touch INJECTED)"),
                1 => v["files"][2]["claims"] = json!([]),
                2 => {
                    let c = v["files"][2]["claims"][0].clone();
                    v["files"][2]["claims"].as_array_mut().unwrap().push(c);
                }
                3 => v["files"][2]["migration_owner"] = json!(""),
                4 => v["files"][2]["gap"] = json!(""),
                5 => v["files"][2]["claims"][0]["status"] = json!("complete"),
                6 => v["files"][2]["claims"][0]["end"] = json!(usize::MAX),
                7 => v["files"][2]["claims"][0]["fingerprint"] = json!("0000000000000000"),
                _ => {
                    v["files"][2]["claims"] = json!([]);
                    v["files"][2]["interface_ids"] = json!([]);
                }
            }
            if mode != 8 {
                v["files"][2]["claims_fingerprint"] = json!(fingerprint(
                    serde_json::to_string(&v["files"][2]["claims"])
                        .unwrap()
                        .as_bytes()
                ));
            }
            assert!(run(&r, &v).is_err(), "mutation {mode}");
            assert!(!r.join("INJECTED").exists());
        }
    }
    #[test]
    fn rejects_path_scope_and_malformed_manifest() {
        for mode in 0..7 {
            let (r, mut v) = fixture();
            match mode {
                0 => v["files"][2]["path"] = json!("../../etc/passwd"),
                1 => v["directories"] = json!([]),
                2 => v["category_gaps"].as_array_mut().unwrap().clear(),
                3 => v["surprise"] = json!(true),
                4 => v["schema_version"] = json!(2),
                5 => v["files"][2]["required_test_ids"] = json!(["invented::passing"]),
                _ => v["files"][2]["claims"][0]["details"] = json!(null),
            }
            assert!(run(&r, &v).is_err(), "mutation {mode}");
        }
        assert!(parse(b"{bad").is_err());
        assert!(parse(b"{\"schema_version\":1,\"schema_version\":1}").is_err());
        assert!(parse(&vec![b' '; 16 * 1024 * 1024 + 1]).is_err());
    }
    #[cfg(unix)]
    #[test]
    fn rejects_symlink_sources() {
        let (r, v) = fixture();
        std::os::unix::fs::symlink(
            r.join("packages/gateway/src/a.ts"),
            r.join("packages/shared/src/link.ts"),
        )
        .unwrap();
        assert!(run(&r, &v).is_err());
    }
}
