//! Read-only mount of registered worktree metadata at its original host path.
use std::{
    fs, io,
    path::{Component, Path, PathBuf},
};
fn invalid(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidInput, message)
}
fn resolve(base: &Path, value: &str) -> PathBuf {
    let joined = base.join(value);
    let mut result = PathBuf::new();
    for part in joined.components() {
        match part {
            Component::CurDir => {}
            Component::ParentDir => {
                result.pop();
            }
            part => result.push(part.as_os_str()),
        }
    }
    result
}
pub fn worktree_git_mount_args(root: &Path) -> io::Result<Vec<String>> {
    let root = if root.is_absolute() {
        root.to_path_buf()
    } else {
        std::env::current_dir()?.join(root)
    };
    let marker = root.join(".git");
    // exists() follows links, matching the reference's dangling-link behavior.
    if !marker.exists() {
        return Ok(vec![]);
    }
    let stat = fs::symlink_metadata(&marker)?;
    if stat.is_dir() {
        return Ok(vec![]);
    }
    if stat.file_type().is_symlink() {
        return Err(invalid("Worktree Git marker must not be a symlink."));
    }
    let bytes = fs::read(&marker)?;
    let contents = String::from_utf8_lossy(&bytes);
    let pointer = contents
        .split(['\n', '\r', '\u{2028}', '\u{2029}'])
        .find_map(|line| line.strip_prefix("gitdir: ").filter(|v| !v.is_empty()))
        .ok_or_else(|| {
            invalid(
                "Invalid worktree Git marker. Repair it on the host before running this thread.",
            )
        })?;
    let admin = fs::canonicalize(resolve(&root, crate::text::js_trim(pointer)))?;
    let common_text = fs::read(admin.join("commondir"))?;
    let common = fs::canonicalize(resolve(
        &admin,
        crate::text::js_trim(&String::from_utf8_lossy(&common_text)),
    ))?;
    let backlink_text = fs::read(admin.join("gitdir"))?;
    let backlink = resolve(
        &admin,
        crate::text::js_trim(&String::from_utf8_lossy(&backlink_text)),
    );
    if common.file_name().is_none_or(|name| name != ".git")
        || admin.parent() != Some(common.join("worktrees").as_path())
        || fs::canonicalize(backlink)? != fs::canonicalize(&marker)?
        || common.to_string_lossy().contains(':')
    {
        return Err(invalid(
            "Git metadata does not belong to this registered worktree.",
        ));
    }
    let common = common
        .to_str()
        .ok_or_else(|| invalid("Git path is not UTF-8"))?;
    Ok(vec!["-v".into(), format!("{common}:{common}:ro")])
}
