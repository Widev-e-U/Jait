//! Consumer-level contract evidence for the NATIVE Rust port of a `(root)`
//! packaging script:
//!
//!   * `packages/gateway/scripts/copy-shell-integration.mjs`
//!         -> `jait_gateway::copy_shell_integration`
//!
//! Assertions pin observable packaging behaviour: the emitted TypeScript module
//! text, the write/check outcome machine, the copy order exposed through the
//! progress hook, and the error operation/path pairs the scripts print.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU32, Ordering};

use jait_gateway::copy_shell_integration;

struct Scratch(PathBuf);

impl Scratch {
    fn new(tag: &str) -> Self {
        static COUNTER: AtomicU32 = AtomicU32::new(0);
        let n = COUNTER.fetch_add(1, Ordering::Relaxed);
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let dir = std::env::temp_dir().join(format!(
            "jait-root-evidence-b-{tag}-{}-{n}-{nanos}",
            std::process::id()
        ));
        std::fs::create_dir_all(&dir).expect("scratch dir");
        Self(dir)
    }

    fn join(&self, rel: &str) -> PathBuf {
        self.0.join(rel)
    }
}

impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

/// Create `<root>/src/surfaces/shell-integration` with the three scripts.
fn write_shell_sources(root: &Path, scripts: [&[u8]; 3]) {
    let dir = root.join("src/surfaces/shell-integration");
    std::fs::create_dir_all(&dir).unwrap();
    for (name, body) in ["bash.sh", "zsh.sh", "pwsh.ps1"].iter().zip(scripts) {
        std::fs::write(dir.join(name), body).unwrap();
    }
}

// ===========================================================================
// (root) scripts/copy-shell-integration.mjs
// ===========================================================================
mod copy_shell_integration_ts {
    use super::*;

    fn write_package(root: &Path) {
        write_shell_sources(root, [b"bash-body", b"zsh-body", b"pwsh-body"]);
        let surfaces = root.join("src/surfaces");
        std::fs::write(surfaces.join("playwright-node-bridge.cjs"), b"bridge").unwrap();
        std::fs::write(surfaces.join("browser-cursor.cjs"), b"cursor").unwrap();
        std::fs::write(surfaces.join("browser-cursor.d.cts"), b"cursor-types").unwrap();
    }

    /// The script copies the shell tree, then the bridge, then cursor assets:
    /// the progress hook fires in between, which is where the CLI prints its
    /// success message. That ordering is the observable contract.
    #[test]
    fn copies_tree_then_bridge_then_cursor_assets() {
        let scratch = Scratch::new("copy-order");
        let root = scratch.join("pkg");
        write_package(&root);

        let mut hook_target = None;
        let mut cursor_present_at_hook = None;
        let target = copy_shell_integration::copy_assets_with_progress(&root, |copied| {
            hook_target = Some(copied.to_owned());
            cursor_present_at_hook = Some(root.join("dist/surfaces/browser-cursor.cjs").exists());
        })
        .expect("copy should succeed");

        let expected = root.join("dist/surfaces/shell-integration");
        assert_eq!(target, expected);
        assert_eq!(hook_target.as_deref(), Some(expected.as_path()));
        // Ordering witness: at hook time the bridge exists but cursor assets don't.
        assert_eq!(cursor_present_at_hook, Some(false));

        assert_eq!(
            std::fs::read(expected.join("bash.sh")).unwrap(),
            b"bash-body"
        );
        assert_eq!(std::fs::read(expected.join("zsh.sh")).unwrap(), b"zsh-body");
        assert_eq!(
            std::fs::read(expected.join("pwsh.ps1")).unwrap(),
            b"pwsh-body"
        );
        assert_eq!(
            std::fs::read(root.join("dist/surfaces/playwright-node-bridge.cjs")).unwrap(),
            b"bridge"
        );
        assert_eq!(
            std::fs::read(root.join("dist/surfaces/browser-cursor.cjs")).unwrap(),
            b"cursor"
        );
        assert_eq!(
            std::fs::read(root.join("dist/surfaces/browser-cursor.d.cts")).unwrap(),
            b"cursor-types"
        );

        // Re-running is idempotent and overwrites identical content.
        std::fs::write(root.join("src/surfaces/shell-integration/bash.sh"), b"v2").unwrap();
        assert_eq!(
            copy_shell_integration::copy_assets(&root).unwrap(),
            expected
        );
        assert_eq!(std::fs::read(expected.join("bash.sh")).unwrap(), b"v2");
    }

    /// A missing `src/surfaces/shell-integration` is reported with the exact
    /// operation string and path, before `dist/` is created.
    #[test]
    fn missing_source_tree_reports_operation_and_path() {
        let scratch = Scratch::new("copy-missing");
        let root = scratch.join("pkg");
        std::fs::create_dir_all(&root).unwrap();

        let err = copy_shell_integration::copy_assets(&root).unwrap_err();
        assert_eq!(
            err.operation,
            "shell integration source directory not found"
        );
        assert_eq!(err.path, root.join("src/surfaces/shell-integration"));
        assert_eq!(err.source.kind(), std::io::ErrorKind::NotFound);
        assert_eq!(
            err.to_string(),
            format!(
                "shell integration source directory not found {}: source does not exist",
                root.join("src/surfaces/shell-integration").display()
            )
        );
        assert!(!root.join("dist").exists(), "no destination may be created");
    }

    /// Partial-failure behaviour: the tree copy succeeds, the missing bridge
    /// aborts the run (non-transactional), and a non-directory destination is
    /// refused with `mkdir`/AlreadyExists.
    #[test]
    fn missing_bridge_aborts_and_file_destination_is_refused() {
        let scratch = Scratch::new("copy-partial");
        let root = scratch.join("pkg");
        write_package(&root);
        std::fs::remove_file(root.join("src/surfaces/playwright-node-bridge.cjs")).unwrap();

        let err = copy_shell_integration::copy_assets(&root).unwrap_err();
        assert_eq!(err.operation, "stat");
        assert_eq!(
            err.path,
            root.join("src/surfaces/playwright-node-bridge.cjs")
        );
        assert_eq!(err.source.kind(), std::io::ErrorKind::NotFound);
        // Non-transactional: the shell tree copy already landed, cursor assets
        // were never copied.
        assert!(
            root.join("dist/surfaces/shell-integration/bash.sh")
                .exists()
        );
        assert!(!root.join("dist/surfaces/browser-cursor.cjs").exists());

        // Destination occupied by a regular file -> mkdir/AlreadyExists.
        let other = scratch.join("pkg2");
        write_package(&other);
        std::fs::create_dir_all(other.join("dist/surfaces")).unwrap();
        std::fs::write(other.join("dist/surfaces/shell-integration"), b"not a dir").unwrap();
        let err = copy_shell_integration::copy_assets(&other).unwrap_err();
        assert_eq!(err.operation, "mkdir");
        assert_eq!(err.path, other.join("dist/surfaces/shell-integration"));
        assert_eq!(err.source.kind(), std::io::ErrorKind::AlreadyExists);
        assert!(err.to_string().contains("destination is not a directory"));
    }
}
