mod client;
mod control_contracts;
mod data_contracts;
mod edge_contracts;
mod evidence;
mod fixture;
mod matrix_fixture;
mod messenger_contracts;
mod provider_contracts;
mod provider_fixture;
mod scenarios;
mod security_contracts;
mod sse;

use anyhow::{Context, Result, bail, ensure};
use serde_json::{Value, json};
use std::{
    fs,
    path::PathBuf,
    time::{Instant, SystemTime, UNIX_EPOCH},
};

fn options() -> Result<(Option<String>, String)> {
    let mut args = std::env::args().skip(1);
    let mut base = None;
    let mut disposable = false;
    let mut label = "typescript".to_owned();
    let mut label_supplied = false;
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--base-url" => base = Some(args.next().context("--base-url requires an origin")?),
            "--disposable" => disposable = true,
            "--label" => {
                label = args.next().context("--label requires a name")?;
                label_supplied = true;
            }
            _ => bail!("Usage: jait-contract [--base-url ORIGIN --disposable] [--label NAME]"),
        }
    }
    ensure!(
        base.is_none() || disposable,
        "external testing creates accounts and sessions; supply --disposable only for a fresh test backend"
    );
    ensure!(
        std::env::var_os("JAIT_CONTRACT_BACKEND_ARGV").is_none() || label_supplied,
        "custom backend argv requires an explicit --label to identify the measured backend"
    );
    Ok((base, label))
}

fn execute(results: &mut Vec<Value>, suite: &mut scenarios::Suite, case: scenarios::Scenario) {
    let started = Instant::now();
    let outcome = fixture::check_cancelled().and_then(|()| (case.1)(suite));
    let (status, error) = match outcome {
        Ok(()) => ("passed", Value::Null),
        Err(error) => ("failed", json!(format!("{error:#}"))),
    };
    println!("{status}: {}", case.0);
    if let Some(error) = error.as_str() {
        eprintln!("  {error}");
    }
    results.push(json!({"id":case.0,"status":status,"duration_ms":started.elapsed().as_millis(),"error":error}));
}

fn network_cases() -> Vec<scenarios::Scenario> {
    scenarios::NETWORK_CASES
        .iter()
        .chain(data_contracts::CASES)
        .chain(security_contracts::CASES)
        .chain(control_contracts::CASES)
        .chain(edge_contracts::CASES)
        .chain(messenger_contracts::CASES)
        .chain(provider_contracts::CASES)
        .copied()
        .collect()
}

fn run() -> Result<bool> {
    let (base, label) = options()?;
    ctrlc::set_handler(|| fixture::CANCELLED.store(true, std::sync::atomic::Ordering::SeqCst))?;
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()?;
    let source_fingerprints = evidence::snapshot(&root)?;
    let directory = fixture::run_directory(&root)?;
    let report_path = directory.join("report.json");
    println!("Artifacts: {}", directory.display());
    let started = Instant::now();
    let started_unix_ms = SystemTime::now().duration_since(UNIX_EPOCH)?.as_millis();
    let cases = network_cases();
    let mut results = Vec::new();
    let mut setup_error = None;
    let mut cleanup_error = None;
    let mut launch_profile = None;
    let mut owned_process = None;
    let managed = base.is_none();
    let prepared =
        fixture::Gateway::start(&root, &directory, base.as_deref()).and_then(scenarios::Suite::new);
    match prepared {
        Ok(mut suite) => {
            launch_profile = Some(suite.gateway.launch_profile());
            owned_process = suite.gateway.process_id();
            for &case in &cases {
                execute(&mut results, &mut suite, case);
            }
            if managed {
                execute(&mut results, &mut suite, scenarios::RESTART_CASE);
            }
            if let Err(error) = suite.gateway.stop() {
                cleanup_error = Some(format!("{error:#}"));
            }
        }
        Err(error) => {
            setup_error = Some(format!("{error:#}"));
            eprintln!("Setup failed: {error:#}");
            for (id, _) in &cases {
                results.push(json!({"id":id,"status":"blocked","error":"backend setup failed"}));
            }
            if managed {
                results.push(json!({"id":scenarios::RESTART_CASE.0,"status":"blocked","error":"backend setup failed"}));
            }
        }
    }
    let passed = results.iter().filter(|r| r["status"] == "passed").count();
    let sources_unchanged = source_fingerprints == evidence::snapshot(&root)?;
    let success = setup_error.is_none()
        && cleanup_error.is_none()
        && passed == results.len()
        && sources_unchanged;
    let report = json!({
        "source_fingerprints":source_fingerprints,"sources_unchanged":sources_unchanged,
        "schema_version":1, "contract_version":env!("CARGO_PKG_VERSION"),
        "backend_label":label, "backend_launch":launch_profile, "owned_process_id":owned_process, "profile":if managed {"managed-http-and-restart"} else {"external-http"},
        "started_unix_ms":started_unix_ms, "duration_ms":started.elapsed().as_millis(),
        "success":success, "setup_error":setup_error, "cleanup_error":cleanup_error,
        "summary":{"passed":passed,"required":results.len()}, "cases":results,
        "not_covered":[
            "active model token streaming, Last-Event-ID replay and cancellation",
            "WebSocket events, tools, consent, assessment scope and subprocess cleanup",
            "historical database upgrades and mixed-version rollback",
            "cross-platform behavior, resource budgets and full API surface"
        ],
        "profile_exclusions":if managed {json!([])} else {json!([
            "persistence.abrupt-restart (runner does not own backend process)",
            "messenger.encrypted-shared-device-restart: restart assertions omitted",
            "messenger.encrypted-history-recovery-restart: restart assertions omitted"
        ])}
    });
    fs::write(&report_path, serde_json::to_vec_pretty(&report)?)?;
    println!(
        "{passed}/{} required scenarios passed. Report: {}",
        report["summary"]["required"],
        report_path.display()
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
