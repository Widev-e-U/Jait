//! Explicit staging entrypoint; it does not replace or publish web-dist.
use jait_gateway::bundle_web::{BundleResult, stage_web};
use std::{env, path::PathBuf, process::ExitCode};

fn main() -> ExitCode {
    let mut args = env::args_os().skip(1);
    let (Some(source), Some(destination), None) = (args.next(), args.next(), args.next()) else {
        eprintln!("usage: jait-bundle-web <frontend-dist> <fresh-staging-directory>");
        return ExitCode::FAILURE;
    };
    match stage_web(&PathBuf::from(source), &PathBuf::from(destination)) {
        Ok(BundleResult::MissingBuild) => {
            eprintln!("apps/web/dist not found — skipping web bundle");
            ExitCode::SUCCESS
        }
        Ok(BundleResult::Staged) => {
            println!("Staged web frontend; publication is required separately");
            ExitCode::SUCCESS
        }
        Err(error) => {
            eprintln!("web staging failed: {error}");
            ExitCode::FAILURE
        }
    }
}
