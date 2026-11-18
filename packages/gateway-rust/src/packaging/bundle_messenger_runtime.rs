//! Port of `packages/gateway/scripts/bundle-messenger-runtime.mjs`.
//!
//! The reference script resolves the gateway package root from its own module
//! URL, then shells out to `bun build` with a fixed argument vector and
//! inherits stdio. A spawn failure is rethrown; otherwise the child's exit
//! status becomes the script's exit code and a signal-terminated child is
//! reported as `1`.
//!
//! The native port keeps that contract but makes the two environment-dependent
//! inputs explicit: the gateway package root (the reference derives it from
//! `import.meta.url`) and the build program (the reference reads
//! `JAIT_BUILD_BUN`). `plan` is pure and returns the exact planned argv so
//! callers can log or assert it before anything is spawned; `run` executes the
//! plan with inherited stdio and maps the result like the reference.
use std::{
    env,
    ffi::{OsStr, OsString},
    io,
    path::{Path, PathBuf},
    process::{Command, ExitStatus},
};

/// Environment variable the reference honours as the build program override.
pub const BUILD_PROGRAM_ENV: &str = "JAIT_BUILD_BUN";
/// Default build program when [`BUILD_PROGRAM_ENV`] is unset.
pub const DEFAULT_BUILD_PROGRAM: &str = "bun";
/// Entry module compiled into the messenger runtime bundle.
pub const ENTRY_RELATIVE: &str = "src/services/messenger-matrix-runtime.ts";
/// Bundle destination, relative to the gateway package root.
pub const OUTFILE_RELATIVE: &str = "dist/services/messenger-matrix-runtime.js";
/// Native module the bundle must never inline.
pub const EXTERNAL_MODULE: &str = "@matrix-org/matrix-sdk-crypto-nodejs";

/// Exit code reported when the child did not exit normally (signal death), which
/// the reference expresses as `result.status ?? 1`.
pub const SIGNAL_EXIT_CODE: i32 = 1;

/// The complete `bun build` invocation for the messenger runtime.
///
/// Fields mirror what the reference hands to `spawnSync`: program, argv, cwd.
/// `args` is stored verbatim so callers can compare against the reference argv
/// order (entry, `--target`, `--format`, `--external`, module, `--outfile`,
/// destination).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MessengerRuntimeBundlePlan {
    program: OsString,
    args: Vec<OsString>,
    cwd: PathBuf,
}

impl MessengerRuntimeBundlePlan {
    /// Plan the bundle for an absolute gateway package `root`.
    ///
    /// The reference calls `resolve()` on every path it spawns with, so a
    /// relative root is rejected instead of being resolved against the process
    /// working directory: resolving here would produce a plan that silently
    /// depends on ambient state the caller did not supply.
    pub fn new(root: &Path) -> io::Result<Self> {
        Self::with_program(root, build_program_from_env())
    }

    /// Plan the bundle with an explicit build program (bypassing
    /// [`BUILD_PROGRAM_ENV`]).
    pub fn with_program(root: &Path, program: OsString) -> io::Result<Self> {
        if !root.is_absolute() {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "messenger runtime bundling needs an absolute gateway package root",
            ));
        }
        if program.is_empty() {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "messenger runtime bundling needs a build program",
            ));
        }
        let entry = root.join(ENTRY_RELATIVE);
        let outfile = root.join(OUTFILE_RELATIVE);
        let args = vec![
            OsString::from("build"),
            entry.into_os_string(),
            OsString::from("--target=node"),
            OsString::from("--format=esm"),
            OsString::from("--external"),
            OsString::from(EXTERNAL_MODULE),
            OsString::from("--outfile"),
            outfile.into_os_string(),
        ];
        Ok(Self {
            program,
            args,
            cwd: root.to_path_buf(),
        })
    }

    /// Build program to execute ([`BUILD_PROGRAM_ENV`] or `bun`).
    pub fn program(&self) -> &OsStr {
        &self.program
    }

    /// Argument vector, in reference order.
    pub fn args(&self) -> &[OsString] {
        &self.args
    }

    /// Working directory for the child (the gateway package root).
    pub fn cwd(&self) -> &Path {
        &self.cwd
    }

    /// Source entry module compiled by the plan.
    pub fn entry(&self) -> PathBuf {
        self.cwd.join(ENTRY_RELATIVE)
    }

    /// Bundle destination written by the plan.
    pub fn outfile(&self) -> PathBuf {
        self.cwd.join(OUTFILE_RELATIVE)
    }

    /// Lossy rendering of the argv, for logging and diagnostics.
    pub fn display_args(&self) -> Vec<String> {
        self.args
            .iter()
            .map(|arg| arg.to_string_lossy().into_owned())
            .collect()
    }

    /// Configured `Command` with inherited stdio, matching the reference's
    /// `stdio: "inherit"`.
    pub fn command(&self) -> Command {
        let mut command = Command::new(&self.program);
        command.args(&self.args).current_dir(&self.cwd);
        command
    }

    /// Execute the plan and reduce the child status the way the reference does:
    /// an abnormal exit (signal death) reports [`SIGNAL_EXIT_CODE`].
    pub fn run(&self) -> io::Result<i32> {
        Ok(exit_code(self.command().status()?))
    }
}

/// Reduce an [`ExitStatus`] to the reference's `status ?? 1`.
pub fn exit_code(status: ExitStatus) -> i32 {
    status.code().unwrap_or(SIGNAL_EXIT_CODE)
}

/// Resolve the build program: `JAIT_BUILD_BUN` when it holds a non-empty value,
/// otherwise `bun`. An empty override is treated as unset so a stray empty
/// variable cannot turn into a spawn of `""`.
pub fn build_program_from_env() -> OsString {
    let override_value = env::var_os(BUILD_PROGRAM_ENV);
    resolve_build_program(override_value.as_deref())
}

/// Pure form of [`build_program_from_env`].
pub fn resolve_build_program(override_value: Option<&OsStr>) -> OsString {
    match override_value {
        Some(value) if !value.is_empty() => value.to_os_string(),
        _ => OsString::from(DEFAULT_BUILD_PROGRAM),
    }
}

/// Plan and execute the messenger runtime bundle, returning the process exit
/// code the reference would exit with.
pub fn bundle_messenger_runtime(root: &Path) -> io::Result<i32> {
    MessengerRuntimeBundlePlan::new(root)?.run()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plan_matches_reference_argv_order() {
        let plan = MessengerRuntimeBundlePlan::with_program(
            Path::new("/repo/packages/gateway"),
            OsString::from("bun"),
        )
        .expect("plan");
        assert_eq!(
            plan.display_args(),
            vec![
                "build",
                "/repo/packages/gateway/src/services/messenger-matrix-runtime.ts",
                "--target=node",
                "--format=esm",
                "--external",
                "@matrix-org/matrix-sdk-crypto-nodejs",
                "--outfile",
                "/repo/packages/gateway/dist/services/messenger-matrix-runtime.js",
            ]
        );
        assert_eq!(plan.cwd(), Path::new("/repo/packages/gateway"));
        assert_eq!(
            plan.outfile(),
            Path::new("/repo/packages/gateway/dist/services/messenger-matrix-runtime.js")
        );
    }

    #[test]
    fn relative_root_is_rejected() {
        let error = MessengerRuntimeBundlePlan::with_program(
            Path::new("packages/gateway"),
            OsString::from("bun"),
        )
        .expect_err("relative root");
        assert_eq!(error.kind(), io::ErrorKind::InvalidInput);
    }

    #[test]
    fn build_program_override_precedence() {
        assert_eq!(resolve_build_program(None), OsString::from("bun"));
        assert_eq!(
            resolve_build_program(Some(OsStr::new(""))),
            OsString::from("bun")
        );
        assert_eq!(
            resolve_build_program(Some(OsStr::new("/opt/bun-nightly"))),
            OsString::from("/opt/bun-nightly")
        );
    }

    #[test]
    fn signal_exit_maps_to_one() {
        assert_eq!(SIGNAL_EXIT_CODE, 1);
    }
}
