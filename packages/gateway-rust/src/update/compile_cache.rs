//! Resolve the Node compile cache location used by the JavaScript gateway launcher.
//! Rust does not have a Node module cache; the returned path must be supplied to
//! the child process before Node starts.
//!
//! `packages/gateway/bin/compile-cache.mjs` does three things, in order:
//!
//! 1. `cacheDir = process.env.NODE_COMPILE_CACHE || join(stateDir, 'cache', 'node-compile')`
//!    where `stateDir = process.env.JAIT_STATE_DIR?.trim() || join(homedir(), '.jait')`.
//! 2. `process.env.NODE_COMPILE_CACHE = cacheDir` — this is what the launcher
//!    propagates to every Node child it spawns, so the child can populate the
//!    cache for its own unbundled ESM graph.
//! 3. `nodeModule.enableCompileCache?.(cacheDir)` — an in-process Node API that
//!    turns the cache on for the *calling* process. There is no Rust equivalent
//!    and none is needed: the Rust gateway never interprets JavaScript modules,
//!    it only needs to hand the resolved directory to the Node children it
//!    launches.
//!
//! Step 2 is modelled here as a pure value ([`CompileCacheExport`]) plus the two
//! adapters a launcher needs: [`CompileCacheExport::env_pair`] for an explicit
//! env vector and [`CompileCacheExport::apply_to_command`] for
//! [`std::process::Command`].
use std::{
    ffi::OsString,
    path::{Component, Path, PathBuf},
    process::Command,
};

// ECMAScript String.trim includes BOM but excludes NEL, unlike Rust trim.
fn trim_js_whitespace(value: &str) -> &str {
    value.trim_matches(|c| {
        matches!(c,
            '\u{0009}'..='\u{000d}' | '\u{0020}' | '\u{00a0}' | '\u{1680}' |
            '\u{2000}'..='\u{200a}' | '\u{2028}' | '\u{2029}' | '\u{202f}' |
            '\u{205f}' | '\u{3000}' | '\u{feff}'
        )
    })
}

// Node path.join normalizes dot segments without consulting the filesystem.
fn normalize_joined_path(path: &Path) -> PathBuf {
    let mut result = PathBuf::new();
    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => match result.components().next_back() {
                Some(Component::Normal(_)) => {
                    result.pop();
                }
                Some(Component::RootDir) | Some(Component::Prefix(_)) => {}
                _ => result.push(".."),
            },
            other => result.push(other.as_os_str()),
        }
    }
    result
}

pub fn cache_directory(explicit: Option<&str>, state_dir: Option<&str>, home: &Path) -> PathBuf {
    if let Some(value) = explicit.filter(|value| !value.is_empty()) {
        return PathBuf::from(value);
    }
    let state = state_dir
        .map(trim_js_whitespace)
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| home.join(".jait"));
    normalize_joined_path(&state.join("cache").join("node-compile"))
}

/// The environment variable Node itself honours for its on-disk module cache.
pub const COMPILE_CACHE_VARIABLE: &str = "NODE_COMPILE_CACHE";

/// The launcher-side effect of `bin/compile-cache.mjs` (step 2): the one
/// environment entry that must be present in every spawned Node child.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CompileCacheExport {
    variable: &'static str,
    directory: PathBuf,
}

impl CompileCacheExport {
    /// Resolve the export from the already-decoded inputs of the TypeScript
    /// module. Mirrors `cacheDir` from `bin/compile-cache.mjs`.
    pub fn resolve(explicit: Option<&str>, state_dir: Option<&str>, home: &Path) -> Self {
        Self {
            variable: COMPILE_CACHE_VARIABLE,
            directory: cache_directory(explicit, state_dir, home),
        }
    }

    /// Resolve from a snapshot of the parent environment, exactly as the module
    /// reads `process.env.NODE_COMPILE_CACHE` / `process.env.JAIT_STATE_DIR`.
    ///
    /// Non-UTF-8 values are lossily decoded: Node would have refused to load
    /// such a value into `process.env` as a string anyway, and the directory is
    /// only ever used as an opaque path by the child.
    pub fn resolve_from_environment(
        environment: impl IntoIterator<Item = (OsString, OsString)>,
        home: &Path,
    ) -> Self {
        let mut explicit = None;
        let mut state_dir = None;
        for (key, value) in environment {
            match key.to_str() {
                Some(COMPILE_CACHE_VARIABLE) => {
                    explicit = Some(value.to_string_lossy().into_owned());
                }
                Some("JAIT_STATE_DIR") => state_dir = Some(value.to_string_lossy().into_owned()),
                _ => {}
            }
        }
        Self::resolve(explicit.as_deref(), state_dir.as_deref(), home)
    }

    pub fn variable(&self) -> &'static str {
        self.variable
    }

    /// The directory Node should cache compiled modules in.
    pub fn directory(&self) -> &Path {
        &self.directory
    }

    /// The `(key, value)` pair to append to a child environment.
    pub fn env_pair(&self) -> (OsString, OsString) {
        (
            OsString::from(self.variable),
            self.directory.clone().into_os_string(),
        )
    }

    /// Apply the export to a [`Command`] before spawning. Setting the variable
    /// unconditionally matches the module, which overwrites an inherited value
    /// with the value it just resolved (an explicit value resolves to itself,
    /// so the overwrite is idempotent).
    pub fn apply_to_command<'a>(&self, command: &'a mut Command) -> &'a mut Command {
        command.env(self.variable, &self.directory)
    }
}

/// Convenience adapter for launchers that build a child environment as a
/// vector rather than through [`Command`].
pub fn child_env_additions(
    explicit: Option<&str>,
    state_dir: Option<&str>,
    home: &Path,
) -> Vec<(OsString, OsString)> {
    vec![CompileCacheExport::resolve(explicit, state_dir, home).env_pair()]
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn state_directory_normalizes_dot_segments_like_node_join() {
        let home = Path::new("/home/test");
        assert_eq!(
            cache_directory(None, Some("/state/a/../b/."), home),
            PathBuf::from("/state/b/cache/node-compile")
        );
        assert_eq!(
            cache_directory(None, Some("../../state/../x"), home),
            PathBuf::from("../../x/cache/node-compile")
        );
        assert_eq!(
            cache_directory(Some("/a/../explicit"), None, home),
            PathBuf::from("/a/../explicit")
        );
    }

    #[test]
    fn state_directory_uses_ecmascript_trim() {
        let home = Path::new("/home/test");
        assert_eq!(
            cache_directory(None, Some("\u{feff}/state\u{feff}"), home),
            PathBuf::from("/state/cache/node-compile")
        );
        assert_eq!(
            cache_directory(None, Some("\u{0085}"), home),
            PathBuf::from("\u{0085}/cache/node-compile")
        );
        assert_eq!(
            cache_directory(None, Some("\u{feff}"), home),
            PathBuf::from("/home/test/.jait/cache/node-compile")
        );
    }

    #[test]
    fn update_compile_cache_precedence_and_whitespace() {
        let home = Path::new("/home/test");
        assert_eq!(
            cache_directory(Some("  "), Some(" /state "), home),
            PathBuf::from("  ")
        );
        assert_eq!(
            cache_directory(Some(""), Some(" /state "), home),
            PathBuf::from("/state/cache/node-compile")
        );
        assert_eq!(
            cache_directory(None, Some("  "), home),
            PathBuf::from("/home/test/.jait/cache/node-compile")
        );
    }

    #[test]
    fn launcher_export_sets_node_compile_cache_for_the_spawned_child() {
        let home = Path::new("/home/test");
        let export = CompileCacheExport::resolve(None, Some("/state"), home);
        assert_eq!(
            export.env_pair(),
            (
                OsString::from("NODE_COMPILE_CACHE"),
                OsString::from("/state/cache/node-compile")
            )
        );
        assert_eq!(export.variable(), COMPILE_CACHE_VARIABLE);
        assert_eq!(
            child_env_additions(None, Some("/state"), home),
            vec![export.env_pair()]
        );
    }

    #[test]
    fn launcher_export_keeps_an_explicit_cache_directory_verbatim() {
        let home = Path::new("/home/test");
        let export = CompileCacheExport::resolve(Some("/managed/../cache"), Some("/state"), home);
        assert_eq!(
            export.directory(),
            Path::new("/managed/../cache"),
            "an explicit cache location still wins and is never normalized"
        );
        assert_eq!(export.env_pair().1, OsString::from("/managed/../cache"));
    }

    #[test]
    fn launcher_export_falls_back_to_the_home_state_directory() {
        let home = Path::new("/home/test");
        let export = CompileCacheExport::resolve(None, None, home);
        assert_eq!(
            export.directory(),
            Path::new("/home/test/.jait/cache/node-compile")
        );
        // Whitespace-only JAIT_STATE_DIR trims to empty and therefore falls back.
        assert_eq!(
            CompileCacheExport::resolve(None, Some("   "), home).directory(),
            Path::new("/home/test/.jait/cache/node-compile")
        );
    }

    #[test]
    fn launcher_export_reads_the_parent_environment_like_the_module() {
        let home = Path::new("/home/test");
        let environment = vec![
            (OsString::from("PATH"), OsString::from("/usr/bin")),
            (OsString::from("JAIT_STATE_DIR"), OsString::from(" /state ")),
        ];
        assert_eq!(
            CompileCacheExport::resolve_from_environment(environment, home).directory(),
            Path::new("/state/cache/node-compile")
        );

        // An explicit inherited NODE_COMPILE_CACHE wins over JAIT_STATE_DIR, and
        // is re-exported unchanged (the module reassigns the same value).
        let environment = vec![
            (
                OsString::from("NODE_COMPILE_CACHE"),
                OsString::from("/managed"),
            ),
            (OsString::from("JAIT_STATE_DIR"), OsString::from("/state")),
        ];
        assert_eq!(
            CompileCacheExport::resolve_from_environment(environment, home).directory(),
            Path::new("/managed")
        );

        // An empty inherited value is falsy in JavaScript and falls through.
        let environment = vec![(OsString::from("NODE_COMPILE_CACHE"), OsString::from(""))];
        assert_eq!(
            CompileCacheExport::resolve_from_environment(environment, home).directory(),
            Path::new("/home/test/.jait/cache/node-compile")
        );
    }

    #[test]
    fn launcher_export_reaches_a_spawned_command_environment() {
        let home = Path::new("/home/test");
        let export = CompileCacheExport::resolve(None, Some("/state"), home);
        let mut command = Command::new("node");
        // An inherited value is replaced by the resolved one, like the module's
        // `process.env.NODE_COMPILE_CACHE = cacheDir` assignment.
        command.env("NODE_COMPILE_CACHE", "/stale");
        export.apply_to_command(&mut command);
        let applied: Vec<_> = command
            .get_envs()
            .filter(|(key, _)| *key == "NODE_COMPILE_CACHE")
            .map(|(key, value)| (key.to_owned(), value.map(|value| value.to_owned())))
            .collect();
        assert_eq!(
            applied,
            vec![(
                OsString::from("NODE_COMPILE_CACHE"),
                Some(OsString::from("/state/cache/node-compile"))
            )]
        );
    }
}
