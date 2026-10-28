//! Build-time asset copier. Set JAIT_GATEWAY_PACKAGE_ROOT to an absolute
//! gateway source package path, or place this executable in its scripts/bin.
use jait_gateway::copy_shell_integration::copy_assets_with_progress;
use std::{env, ffi::OsString, path::{Path, PathBuf}, process::ExitCode};

fn resolve_root(configured: Option<OsString>, exe: &Path) -> Result<PathBuf, &'static str> {
    if let Some(root) = configured {
        let root = PathBuf::from(root);
        return if root.is_absolute() { Ok(root) } else {
            Err("JAIT_GATEWAY_PACKAGE_ROOT must be an absolute path")
        };
    }
    let dir = exe.parent().ok_or("cannot locate executable directory")?;
    if matches!(dir.file_name().and_then(|n| n.to_str()), Some("bin" | "scripts")) {
        Ok(dir.parent().ok_or("cannot locate gateway package root")?.to_path_buf())
    } else {
        Err("set JAIT_GATEWAY_PACKAGE_ROOT to the absolute path of a gateway source package")
    }
}

fn main() -> ExitCode {
    let exe = match env::current_exe() {
        Ok(exe) => exe,
        Err(error) => { eprintln!("{error}"); return ExitCode::FAILURE; }
    };
    let root = match resolve_root(env::var_os("JAIT_GATEWAY_PACKAGE_ROOT"), &exe) {
        Ok(root) => root,
        Err(error) => { eprintln!("{error}"); return ExitCode::FAILURE; }
    };
    match copy_assets_with_progress(&root, |target| {
        println!("Copied shell integration scripts → {}", target.display());
    }) {
        Ok(_) => ExitCode::SUCCESS,
        Err(error) => {
            if error.operation == "shell integration source directory not found" {
                eprintln!("shell integration source directory not found: {}", error.path.display());
            } else {
                eprintln!("{error}");
            }
            ExitCode::FAILURE
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn selects_explicit_absolute_root_or_executable_package() {
        let base = env::current_dir().unwrap();
        let gateway = base.join("gateway");
        let exe = gateway.join("scripts").join("copy");
        let explicit = base.join("explicit");
        assert!(resolve_root(Some("relative".into()), &exe).is_err());
        assert_eq!(resolve_root(Some(explicit.clone().into_os_string()), &exe).unwrap(), explicit);
        assert_eq!(resolve_root(None, &exe).unwrap(), gateway);
        assert!(resolve_root(None, &base.join("elsewhere").join("copy")).is_err());
    }
}
