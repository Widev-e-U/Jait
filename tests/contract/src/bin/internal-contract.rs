#[path = "../evidence.rs"]
mod evidence;
// Runs reference implementation checks separately from backend-neutral HTTP contracts.
#[path = "../fixture_internal_contracts.rs"]
mod fixture_internal_contracts;
#[path = "../internal_contracts.rs"]
mod internal_contracts;
#[path = "../internal_driver.rs"]
mod internal_driver;
#[path = "../security_internal_contracts.rs"]
mod security_internal_contracts;

use anyhow::Result;
use serde_json::{Value, json};
use std::{
    fs,
    path::PathBuf,
    sync::atomic::{AtomicBool, Ordering},
    time::Instant,
};
static CANCELLED: AtomicBool = AtomicBool::new(false);
fn run() -> Result<bool> {
    ctrlc::set_handler(|| CANCELLED.store(true, Ordering::SeqCst))?;
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()?;
    let directory = root
        .join(".jait/artifacts/contracts")
        .join(uuid::Uuid::new_v4().to_string());
    fs::create_dir_all(&directory)?;
    println!("Artifacts: {}", directory.display());
    let source_fingerprints = evidence::snapshot(&root)?;
    let started = Instant::now();
    let mut cases: Vec<Value> = Vec::new();
    let vector_cases = fixture_internal_contracts::cases(&root)?;
    let static_cases = internal_contracts::CASES
        .iter()
        .chain(security_internal_contracts::CASES.iter());
    let mut ids = std::collections::BTreeSet::new();
    for id in static_cases
        .clone()
        .map(|(id, _)| *id)
        .chain(vector_cases.iter().map(|case| case.id()))
    {
        anyhow::ensure!(
            ids.insert(id.to_owned()),
            "duplicate internal scenario id: {id}"
        );
    }
    for (id, check) in static_cases {
        let before = Instant::now();
        let result = check(&root, &directory, &|| CANCELLED.load(Ordering::SeqCst));
        let (status, error) = match result {
            Ok(()) => ("passed", Value::Null),
            Err(error) => ("failed", json!(format!("{error:#}"))),
        };
        println!("{status}: {id}");
        if error != Value::Null {
            eprintln!("{error}");
        }
        cases.push(json!({"id":id,"status":status,"error":error,"duration_ms":before.elapsed().as_millis()}));
    }
    for case in &vector_cases {
        let before = Instant::now();
        let result = fixture_internal_contracts::check(
            &root,
            &directory,
            &|| CANCELLED.load(Ordering::SeqCst),
            case,
        );
        let (status, error) = match result {
            Ok(()) => ("passed", Value::Null),
            Err(error) => ("failed", json!(format!("{error:#}"))),
        };
        let id = case.id();
        println!("{status}: {id}");
        if error != Value::Null {
            eprintln!("{error}");
        }
        cases.push(json!({"id":id,"status":status,"error":error,"duration_ms":before.elapsed().as_millis()}));
        // A gated original test still runs its reviewed Rust oracle through the reuse
        // scenario. Record that registration under its own id so the audit reads the
        // execution that happened instead of an unlabelled gap.
        if status == "passed"
            && let Some(declaration) = case.reused_declaration()
            && ids.insert(declaration.clone())
        {
            cases.push(json!({"id":declaration,"status":"passed","error":Value::Null,"duration_ms":before.elapsed().as_millis()}));
        }
    }
    let passed = cases
        .iter()
        .filter(|case| case["status"] == "passed")
        .count();
    let sources_unchanged = source_fingerprints == evidence::snapshot(&root)?;
    let success = passed == cases.len() && sources_unchanged;
    let report = json!({
        "source_fingerprints":source_fingerprints,"sources_unchanged":sources_unchanged,
        "schema_version":1,"contract_version":env!("CARGO_PKG_VERSION"),"backend_label":"typescript",
        "profile":"typescript-internal-reference","success":success,"duration_ms":started.elapsed().as_millis(),
        "summary":{"passed":passed,"required":cases.len()},"cases":cases,
        "not_covered":["Rust gateway runtime parity","HTTP routing, consent execution, scanner execution","provider streams and database recovery"],
        "limitations":["Requires Bun and current TypeScript source; test-only adapters invoke production functions; Rust owns inputs and expected outcomes","Each call has a fresh process and project-local home; 64 KiB input, 256 KiB per output stream, 10 second timeout"]
    });
    let path = directory.join("report.json");
    fs::write(&path, serde_json::to_vec_pretty(&report)?)?;
    println!(
        "{passed}/{} required scenarios passed. Report: {}",
        cases.len(),
        path.display()
    );
    Ok(success)
}
fn main() -> std::process::ExitCode {
    match run() {
        Ok(true) => std::process::ExitCode::SUCCESS,
        Ok(false) => std::process::ExitCode::FAILURE,
        Err(error) => {
            eprintln!("{error:#}");
            std::process::ExitCode::from(2)
        }
    }
}
