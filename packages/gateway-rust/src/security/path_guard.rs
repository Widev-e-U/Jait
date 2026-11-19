//! Reference path policy. Run filesystem checks on a bounded blocking worker.
//! Like the reference, the optional symlink check resolves every existing component.
use std::{
    fmt, fs, io,
    path::{Component, Path, PathBuf},
};
const DENIED: &[&str] = &[
    "C:\\Windows",
    "C:\\Program Files",
    "C:\\Program Files (x86)",
    "/etc",
    "/usr",
    "/bin",
    "/sbin",
    "/boot",
    "/proc",
    "/sys",
    "/dev",
    ".ssh",
    ".gnupg",
    ".aws",
    ".azure",
];
#[derive(Debug)]
pub struct PathTraversalError {
    pub message: String,
    pub path: String,
    pub boundary: PathBuf,
}
impl PathTraversalError {
    pub const CODE: &str = "PATH_TRAVERSAL";
}
impl fmt::Display for PathTraversalError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.message)
    }
}
impl std::error::Error for PathTraversalError {}
pub type PathError = Box<dyn std::error::Error + Send + Sync>;
fn resolve(base: &Path, target: &Path) -> PathBuf {
    let joined = base.join(target);
    let mut out = PathBuf::new();
    for c in joined.components() {
        match c {
            Component::CurDir => {}
            Component::ParentDir => {
                out.pop();
            }
            c => out.push(c.as_os_str()),
        }
    }
    out
}
/// True when `path` is not below `root`. It compares components, so a name such as `..notes.md`
/// is an ordinary file rather than a parent reference.
fn escapes(root: &Path, path: &Path) -> bool {
    path.strip_prefix(root).is_err()
}
pub struct PathGuard {
    root: PathBuf,
    denied: Vec<String>,
    check_symlinks: bool,
}
impl PathGuard {
    pub fn new(root: &Path, denied: &[String], check_symlinks: bool) -> io::Result<Self> {
        let root = resolve(&std::env::current_dir()?, root);
        Ok(Self {
            root,
            denied: DENIED
                .iter()
                .map(|s| (*s).to_string())
                .chain(denied.iter().cloned())
                .collect(),
            check_symlinks,
        })
    }
    pub fn project_root(&self) -> &Path {
        &self.root
    }
    fn error(&self, target: &str, message: String) -> PathError {
        Box::new(PathTraversalError {
            message,
            path: target.into(),
            boundary: self.root.clone(),
        })
    }
    pub fn validate(&self, target: &str) -> Result<PathBuf, PathError> {
        let norm = resolve(&self.root, Path::new(target));
        if escapes(&self.root, &norm) {
            return Err(self.error(target, format!("Path escapes project boundary: {target}")));
        }
        if target.contains('\0') {
            return Err(self.error(target, format!("Path contains null byte: {target}")));
        }
        let text = norm.to_string_lossy().to_lowercase();
        for denied in &self.denied {
            let denied_abs = resolve(&self.root, Path::new(denied));
            let denied_text = denied_abs.to_string_lossy().to_lowercase();
            if text == denied_text || text.starts_with(&(denied_text + "/")) {
                return Err(self.error(
                    target,
                    format!("Access denied: path matches denied entry '{denied}'"),
                ));
            }
        }
        Ok(norm)
    }
    pub fn is_allowed(&self, target: &str) -> bool {
        self.validate(target).is_ok()
    }
    pub fn validate_with_symlink_check(&self, target: &str) -> Result<PathBuf, PathError> {
        let norm = self.validate(target)?;
        if !self.check_symlinks {
            return Ok(norm);
        }
        let Ok(relative_path) = norm.strip_prefix(&self.root) else {
            return Ok(norm);
        };
        // Mirror the reference: every existing component is resolved, not only the final
        // entry, so an intermediate symlink cannot redirect a later write outside the root.
        let real_root = match fs::canonicalize(&self.root) {
            Ok(real) => real,
            Err(error) if error.kind() == io::ErrorKind::NotFound => self.root.clone(),
            Err(error) => return Err(error.into()),
        };
        let mut current = self.root.clone();
        for part in relative_path.components() {
            current.push(part);
            let info = match fs::symlink_metadata(&current) {
                Ok(info) => info,
                // A missing component ends the walk: no later component can exist.
                Err(error) if error.kind() == io::ErrorKind::NotFound => break,
                Err(error) => return Err(error.into()),
            };
            if !info.file_type().is_symlink() {
                continue;
            }
            // A dangling symlink fails here with NotFound: a later write could follow it.
            let real = fs::canonicalize(&current)?;
            let Ok(inside) = real.strip_prefix(&real_root) else {
                return Err(self.error(
                    target,
                    format!(
                        "Symlink escapes project boundary: {target} -> {}",
                        real.display()
                    ),
                ));
            };
            // A symlink must not reach paths explicitly denied inside the project.
            self.validate(&self.root.join(inside).to_string_lossy())?;
        }
        Ok(norm)
    }
}

#[cfg(test)]
mod tests {
    use super::PathGuard;
    use std::path::{Path, PathBuf};

    #[test]
    fn denied_names_and_outside_paths_are_refused_but_dotdot_names_are_ordinary() {
        let guard = PathGuard::new(Path::new("/srv/project"), &[], false).unwrap();
        assert!(guard.validate(".aws/credentials").is_err());
        assert!(guard.validate(".ssh").is_err());
        assert!(guard.validate("../secret").is_err());
        assert!(guard.validate("/etc/passwd").is_err());
        assert_eq!(
            guard.validate("..notes.md").unwrap(),
            PathBuf::from("/srv/project/..notes.md")
        );
        assert_eq!(
            guard.validate("docs/.aws-notes.md").unwrap(),
            PathBuf::from("/srv/project/docs/.aws-notes.md")
        );
    }
}
