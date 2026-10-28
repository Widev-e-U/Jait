//! Build-time shell integration asset generator.
//! JAIT_GATEWAY_PACKAGE_ROOT selects the gateway package containing the assets.
//! Otherwise, discovery works only when the executable is in the package root,
//! or its bin/ or scripts/ directory. Published gateway packages omit src/,
//! so this build-time generator requires a source tree.
#[path = "../embed_shell_integration.rs"]
mod embed_shell_integration;

use embed_shell_integration::{Outcome, run};
use std::{
    env,
    ffi::OsString,
    path::{Path, PathBuf},
    process::ExitCode,
};

fn resolve_root(configured: Option<OsString>, exe: &Path) -> Result<PathBuf, &'static str> {
    if let Some(root) = configured {
        let root = PathBuf::from(root);
        if !root.is_absolute() {
            return Err("JAIT_GATEWAY_PACKAGE_ROOT must be an absolute path");
        }
        return Ok(root);
    }
    let dir = exe.parent().ok_or("cannot locate executable directory")?;
    let candidate = if matches!(
        dir.file_name().and_then(|n| n.to_str()),
        Some("bin" | "scripts")
    ) {
        dir.parent().unwrap_or(dir)
    } else {
        dir
    };
    if candidate.join("src/surfaces/shell-integration").is_dir() {
        Ok(candidate.to_path_buf())
    } else {
        Err("set JAIT_GATEWAY_PACKAGE_ROOT to the absolute path of a gateway source package")
    }
}

fn main() -> ExitCode {
    let exe = match env::current_exe() {
        Ok(path) => path,
        Err(error) => {
            eprintln!("{error}");
            return ExitCode::FAILURE;
        }
    };
    let root = match resolve_root(env::var_os("JAIT_GATEWAY_PACKAGE_ROOT"), &exe) {
        Ok(root) => root,
        Err(error) => {
            eprintln!("{error}");
            return ExitCode::FAILURE;
        }
    };
    let output = root.join("src/surfaces/shell-integration-assets.ts");
    let check = env::args_os().any(|arg| arg == "--check");
    match run(&root, check) {
        Ok(Outcome::Written) => println!("Wrote {}", output.display()),
        Ok(Outcome::UpToDate) => println!("shell-integration-assets.ts is up to date"),
        Ok(Outcome::Missing) => {
            eprintln!(
                "{} is missing — run: node scripts/embed-shell-integration.mjs",
                output.display()
            );
            return ExitCode::FAILURE;
        }
        Ok(Outcome::OutOfDate) => {
            eprintln!(
                "{} is out of date with src/surfaces/shell-integration/* — run: node scripts/embed-shell-integration.mjs",
                output.display()
            );
            return ExitCode::FAILURE;
        }
        Err(error) => {
            eprintln!("{error}");
            return ExitCode::FAILURE;
        }
    }
    ExitCode::SUCCESS
}

#[cfg(test)]
mod cli_tests {
    use super::*;
    #[test]
    fn configured_root_is_absolute_and_overrides_discovery() {
        assert_eq!(
            resolve_root(Some("relative".into()), Path::new("/else/bin/generator")),
            Err("JAIT_GATEWAY_PACKAGE_ROOT must be an absolute path")
        );
        assert_eq!(
            resolve_root(Some("/explicit".into()), Path::new("/else/bin/generator")).unwrap(),
            PathBuf::from("/explicit")
        );
    }
    #[test]
    fn discovers_source_package_next_to_binary() {
        let project = Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap()
            .parent()
            .unwrap();
        let root = project
            .join(".jait/artifacts/gateway-rust")
            .join(format!("embed-root-test-{}", std::process::id()));
        std::fs::create_dir_all(root.join("src/surfaces/shell-integration")).unwrap();
        assert_eq!(
            resolve_root(None, &root.join("scripts/generator")).unwrap(),
            root
        );
        assert!(resolve_root(None, &root.join("elsewhere/generator")).is_err());
        std::fs::remove_dir_all(root).unwrap();
    }
}
