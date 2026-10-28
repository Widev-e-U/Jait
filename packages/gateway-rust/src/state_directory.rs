use std::{
    fmt,
    path::{Path, PathBuf},
};

#[derive(Debug, PartialEq, Eq)]
pub struct StatePathError(pub &'static str);
impl fmt::Display for StatePathError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.0)
    }
}
impl std::error::Error for StatePathError {}

/// Takes the platform home explicitly so callers/tests never mutate global environment.
pub fn state_directory(home: &Path, configured: Option<&str>) -> Result<PathBuf, StatePathError> {
    let value = crate::text::js_trim(configured.unwrap_or_default());
    if value.is_empty() {
        return Ok(home.join(".jait"));
    }
    let path = PathBuf::from(value);
    if !path.is_absolute() {
        return Err(StatePathError("JAIT_STATE_DIR must be an absolute path"));
    }
    Ok(path)
}
pub fn resolve_database_path(
    explicit: Option<&str>,
    lookup: impl Fn(&str) -> Option<String>,
    home: &Path,
) -> Result<PathBuf, StatePathError> {
    if let Some(path) = explicit.filter(|p| !p.is_empty()) {
        return Ok(PathBuf::from(path));
    }
    if let Some(path) = lookup("JAIT_DB_PATH").filter(|p| !crate::text::js_trim(p).is_empty()) {
        return Ok(PathBuf::from(crate::text::js_trim(&path)));
    }
    if lookup("NODE_ENV").as_deref() == Some("test") {
        return Err(StatePathError(
            "Refusing to open the default Jait database in test mode. Pass ':memory:' or set JAIT_DB_PATH.",
        ));
    }
    default_db_path(home, lookup("JAIT_STATE_DIR").as_deref())
}

/// Port of TS `defaultDbPath()`: `join(getStateDirectory(), "data", "jait.db")`.
///
/// The platform home and the configured value are passed in explicitly so callers and
/// tests never mutate process-global environment.
pub fn default_db_path(home: &Path, configured: Option<&str>) -> Result<PathBuf, StatePathError> {
    Ok(state_directory(home, configured)?.join("data/jait.db"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn lookup_of<'a>(
        entries: &'a [(&'a str, &'a str)],
    ) -> impl Fn(&str) -> Option<String> + 'a {
        move |key| {
            entries
                .iter()
                .find(|(name, _)| *name == key)
                .map(|(_, value)| (*value).to_string())
        }
    }

    #[test]
    fn default_db_path_hangs_off_the_default_state_directory() {
        let path = default_db_path(Path::new("/home/me"), None).expect("default");
        assert_eq!(path, PathBuf::from("/home/me/.jait/data/jait.db"));
    }

    #[test]
    fn default_db_path_uses_a_configured_absolute_state_directory() {
        let path = default_db_path(Path::new("/home/me"), Some("  /srv/jait  ")).expect("configured");
        assert_eq!(path, PathBuf::from("/srv/jait/data/jait.db"));
    }

    #[test]
    fn default_db_path_rejects_a_relative_state_directory() {
        let error = default_db_path(Path::new("/home/me"), Some("relative/dir")).expect_err("relative");
        assert_eq!(error.0, "JAIT_STATE_DIR must be an absolute path");
    }

    #[test]
    fn resolve_prefers_the_explicit_path_over_every_lookup() {
        let lookup = lookup_of(&[("JAIT_DB_PATH", "/from/env.db"), ("NODE_ENV", "test")]);
        let resolved = resolve_database_path(Some(":memory:"), lookup, Path::new("/home/me"))
            .expect("explicit path");
        assert_eq!(resolved, PathBuf::from(":memory:"));
    }

    #[test]
    fn resolve_trims_the_configured_database_path() {
        let lookup = lookup_of(&[("JAIT_DB_PATH", "  /from/env.db  "), ("NODE_ENV", "test")]);
        let resolved = resolve_database_path(None, lookup, Path::new("/home/me")).expect("env path");
        assert_eq!(resolved, PathBuf::from("/from/env.db"));
    }

    #[test]
    fn resolve_refuses_the_default_database_in_test_mode_with_the_exact_message() {
        let lookup = lookup_of(&[("JAIT_DB_PATH", "   "), ("NODE_ENV", "test")]);
        let error = resolve_database_path(None, lookup, Path::new("/home/me")).expect_err("test mode");
        assert_eq!(
            error.0,
            "Refusing to open the default Jait database in test mode. Pass ':memory:' or set JAIT_DB_PATH."
        );
    }

    #[test]
    fn resolve_falls_back_to_the_same_path_as_default_db_path() {
        let lookup = lookup_of(&[("JAIT_STATE_DIR", "/srv/jait"), ("NODE_ENV", "production")]);
        let resolved = resolve_database_path(None, lookup, Path::new("/home/me")).expect("fallback");
        assert_eq!(
            resolved,
            default_db_path(Path::new("/home/me"), Some("/srv/jait")).expect("default")
        );
        assert_eq!(resolved, PathBuf::from("/srv/jait/data/jait.db"));
    }

    #[test]
    fn state_directory_ignores_a_blank_configured_value() {
        let path = state_directory(Path::new("/home/me"), Some("   ")).expect("blank");
        assert_eq!(path, PathBuf::from("/home/me/.jait"));
    }
}
