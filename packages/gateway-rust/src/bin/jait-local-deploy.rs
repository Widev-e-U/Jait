//! Host preparation remains in scripts/local-deploy.mjs; this executable owns all gates and activation.
#[cfg(unix)]
use jait_gateway::execution::local_deploy::*;
#[cfg(unix)]
use std::{fs, path::PathBuf, time::Duration};

#[cfg(unix)]
async fn execute() -> Result<()> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.first().map(String::as_str) == Some("--verify")
        && args.len() >= 3
        && args[3..]
            .iter()
            .all(|arg| matches!(arg.as_str(), "--skip-e2e" | "--skip-tests"))
    {
        let root = fs::canonicalize(&args[1]).map_err(|e| e.to_string())?;
        let logs = fs::canonicalize(&args[2]).map_err(|e| e.to_string())?;
        match fs::remove_file(logs.join("proof.json")) {
            Ok(()) => (),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => (),
            Err(error) => return Err(error.to_string()),
        }
        let steps = verification_steps_with_policy(
            &root,
            args[3..].iter().any(|arg| arg == "--skip-e2e"),
            args[3..].iter().any(|arg| arg == "--skip-tests"),
        )?;
        let mut host = FilesystemVerificationHost::new(root.clone(), logs.clone(), &steps);
        host.enable_resume();
        let result = verify(&mut host, &steps).await;
        if let Err(error) = host.save_passes() {
            eprintln!("[local-deploy] Could not save verification passes: {error}");
        }
        let proof = result?;
        write_private(
            &logs.join("proof.json"),
            &serde_json::to_vec_pretty(&proof).map_err(|e| e.to_string())?,
        )?;
        return Ok(());
    }
    if args.len() != 2 || !["--activate", "--restore", "--rollback"].contains(&args[0].as_str()) {
        return Err("Usage: jait-local-deploy --verify WORKSPACE LOG_DIRECTORY [--skip-e2e] [--skip-tests] | --activate|--rollback|--restore PLAN".into());
    }
    let plan_path = PathBuf::from(&args[1]);
    let plan: Plan = serde_json::from_slice(&fs::read(&plan_path).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    let home = PathBuf::from(std::env::var("HOME").map_err(|e| e.to_string())?);
    validate_plan(&plan, &plan_path, &home)?;
    let run = plan_path.parent().unwrap().to_owned();
    let lock = plan.artifact_root.join("lock");
    let mut host = SystemdActivationHost {
        plan: plan.clone(),
        run: run.clone(),
    };
    if args[0] == "--rollback" {
        let activation: serde_json::Value = serde_json::from_slice(
            &fs::read(run.join("activation.json")).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
        if activation["passed"] != true {
            return Err("Only a completed local deployment can be rolled back".into());
        }
        fs::create_dir(&lock).map_err(|e| e.to_string())?;
        let result = run_logged(
            "systemd-run",
            &[
                "--user".into(),
                "--collect".into(),
                format!("--unit=jait-local-rollback-{}", uuid::Uuid::new_v4()),
                "--property=Type=exec".into(),
                std::env::current_exe()
                    .map_err(|e| e.to_string())?
                    .to_string_lossy()
                    .into_owned(),
                "--restore".into(),
                plan_path.to_string_lossy().into_owned(),
            ],
            &run,
            &run.join("rollback-handoff.log"),
            Duration::from_secs(30),
        )
        .await;
        if result.is_err() {
            let _ = fs::remove_dir_all(&lock);
        }
        return result;
    }
    let result = async {
        if args[0] == "--restore" {
            use jait_gateway::execution::local_deploy::ActivationHost;
            if host.read_override().await?.as_deref() != Some(&plan.unit_text) {
                return Err(
                    "Local override changed; refusing to replace a newer deployment".into(),
                );
            }
            let backup: serde_json::Value = serde_json::from_slice(
                &fs::read(run.join("rollback.json")).map_err(|e| e.to_string())?,
            )
            .map_err(|e| e.to_string())?;
            let previous = match backup.get("override") {
                Some(serde_json::Value::Null) => None,
                Some(serde_json::Value::String(value)) => Some(value.as_str()),
                _ => return Err("Malformed local deployment backup".into()),
            };
            restore(&mut host, previous, &plan.previous_version).await?;
        } else {
            current_service_matches(&plan, &run).await?;
            if tree_digest(&plan.runtime)? != plan.runtime_hash {
                return Err("Staged runtime changed after verification".into());
            }
            activate(&mut host, &plan).await?;
        }
        Ok(())
    }
    .await;
    let filename = if args[0] == "--restore" {
        "rollback-result.json"
    } else {
        "activation.json"
    };
    let evidence = serde_json::json!({"passed":result.is_ok(),"buildId":plan.build_id,"error":result.as_ref().err()});
    let evidence_result = write_private(
        &run.join(filename),
        &serde_json::to_vec_pretty(&evidence).map_err(|e| e.to_string())?,
    );
    let cleanup = fs::remove_dir_all(lock).map_err(|e| e.to_string());
    result.and(evidence_result).and(cleanup)
}
#[cfg(unix)]
#[tokio::main]
async fn main() {
    if let Err(error) = execute().await {
        eprintln!("[local-deploy] {error}");
        std::process::exit(1);
    }
}
#[cfg(not(unix))]
fn main() {
    eprintln!("Local deployment currently supports Linux/systemd");
    std::process::exit(1);
}
