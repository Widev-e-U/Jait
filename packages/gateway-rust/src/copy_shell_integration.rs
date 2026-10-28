//! Packaging core for `scripts/copy-shell-integration.mjs`.
//!
//! The caller explicitly supplies the gateway package root and is responsible
//! for authorizing writes there. Relative paths resolve against the current directory.
//! Path checks and subsequent filesystem operations are not atomic. The caller
//! must also prevent concurrent replacement or mutation of relevant ancestors,
//! source entries, and destination entries for the entire operation. This module
//! does not enforce that isolation and is not safe for an untrusted mutable tree.
use std::{
    fs, io,
    path::{Path, PathBuf},
};

#[derive(Debug)]
pub struct CopyError {
    pub operation: &'static str,
    pub path: PathBuf,
    pub source: io::Error,
}
impl std::fmt::Display for CopyError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{} {}: {}", self.operation, self.path.display(), self.source)
    }
}
impl std::error::Error for CopyError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        Some(&self.source)
    }
}
fn failure(operation: &'static str, path: &Path, source: io::Error) -> CopyError {
    CopyError { operation, path: path.to_owned(), source }
}

/// Copy the shell tree and the three browser assets in the original order.
/// The returned path is the directory named in the success message.
/// Failures are non-transactional, as in the reference script.
pub fn copy_assets(package_root: &Path) -> Result<PathBuf, CopyError> {
    copy_assets_with_progress(package_root, |_| {})
}

/// Notify the caller after the bridge copy and before copying cursor assets.
/// A command-line caller can emit the reference script's success message here.
pub fn copy_assets_with_progress(
    package_root: &Path,
    on_shell_copied: impl FnOnce(&Path),
) -> Result<PathBuf, CopyError> {
    let source = package_root.join("src/surfaces/shell-integration");
    let target = package_root.join("dist/surfaces/shell-integration");
    if !source.exists() {
        return Err(failure("shell integration source directory not found", &source,
            io::Error::new(io::ErrorKind::NotFound, "source does not exist")));
    }
    ensure_directory(&target)?;
    copy_tree(&source, &target)?;
    let src = package_root.join("src/surfaces");
    let dst = package_root.join("dist/surfaces");
    let bridge = src.join("playwright-node-bridge.cjs");
    copy_entry(&bridge, &dst.join("playwright-node-bridge.cjs"))?;
    on_shell_copied(&target);
    for name in ["browser-cursor.cjs", "browser-cursor.d.cts"] {
        let from = src.join(name);
        let to = dst.join(name);
        copy_entry(&from, &to)?;
    }
    Ok(target)
}

fn ensure_directory(path: &Path) -> Result<(), CopyError> {
    match fs::symlink_metadata(path) {
        Ok(meta) if !meta.is_dir() => return Err(failure("mkdir", path,
            io::Error::new(io::ErrorKind::AlreadyExists, "destination is not a directory"))),
        Ok(_) => return Ok(()),
        Err(e) if e.kind() == io::ErrorKind::NotFound => {},
        Err(e) => return Err(failure("stat", path, e)),
    }
    fs::create_dir_all(path).map_err(|e| failure("mkdir", path, e))
}

fn copy_tree(source: &Path, destination: &Path) -> Result<(), CopyError> {
    // cpSync rejects a directory copied onto itself, including through an alias.
    if same_file_checked(source, destination)? {
        return Err(failure("copy", source,
            io::Error::new(io::ErrorKind::InvalidInput, "source and destination are the same directory")));
    }
    // Resolve existing directories so aliases through parent symlinks cannot
    // make the copier descend into the destination it is creating.
    let source_real = fs::canonicalize(source).map_err(|e| failure("resolve source", source, e))?;
    let destination_real = fs::canonicalize(destination)
        .map_err(|e| failure("resolve destination", destination, e))?;
    if destination_real.starts_with(&source_real) {
        return Err(failure("copy", source,
            io::Error::new(io::ErrorKind::InvalidInput, "destination is inside source directory")));
    }
    let entries = fs::read_dir(source).map_err(|e| failure("read directory", source, e))?;
    for entry in entries {
        let entry = entry.map_err(|e| failure("read directory entry", source, e))?;
        copy_entry(&entry.path(), &destination.join(entry.file_name()))?;
    }
    Ok(())
}

fn copy_entry(from: &Path, to: &Path) -> Result<(), CopyError> {
    let kind = fs::symlink_metadata(from).map_err(|e| failure("stat", from, e))?.file_type();
    if kind.is_dir() {
        ensure_directory(to)?;
        copy_tree(from, to)
    } else if kind.is_symlink() {
        copy_symlink(from, to)
    } else if kind.is_file() {
        // cpSync checks identity before replacing an existing destination link.
        if same_file_checked(from, to)? {
            return Err(failure("copy", from,
                io::Error::new(io::ErrorKind::InvalidInput, "source and destination are the same file")));
        }
        match fs::symlink_metadata(to) {
            Ok(meta) if meta.file_type().is_symlink() => remove_destination_link(to, &meta)?,
            // Node cp removes an existing file before copying, preserving any
            // other hard links to its previous contents. This is not race-safe
            // against concurrent replacement of path components.
            Ok(meta) if meta.is_file() => fs::remove_file(to).map_err(|e| failure("remove destination", to, e))?,
            Ok(_) => {},
            Err(e) if e.kind() == io::ErrorKind::NotFound => {},
            Err(e) => return Err(failure("stat", to, e)),
        }
        fs::copy(from, to).map_err(|e| failure("copy", from, e))?;
        Ok(())
    } else {
        Err(failure("copy", from,
            io::Error::new(io::ErrorKind::Unsupported, "unsupported source file type")))
    }
}

#[cfg(unix)]
fn same_file(a: &Path, b: &Path) -> bool {
    use std::os::unix::fs::MetadataExt;
    match (fs::metadata(a), fs::metadata(b)) {
        (Ok(a), Ok(b)) => a.dev() == b.dev() && a.ino() == b.ino(),
        _ => false,
    }
}

#[cfg(not(any(unix, windows)))]
fn same_file(a: &Path, b: &Path) -> bool {
    matches!((fs::canonicalize(a), fs::canonicalize(b)), (Ok(a), Ok(b)) if a == b)
}

// Preserve the existing Unix behavior; Windows must fail closed if identity
// cannot be established before a destination is removed or overwritten.
#[cfg(not(windows))]
fn same_file_checked(a: &Path, b: &Path) -> Result<bool, CopyError> {
    Ok(same_file(a, b))
}

#[cfg(windows)]
fn same_file_checked(a: &Path, b: &Path) -> Result<bool, CopyError> {
    use std::os::windows::{fs::OpenOptionsExt, io::AsRawHandle};
    #[repr(C)]
    struct FileInformation {
        attributes: u32, creation: [u32; 2], access: [u32; 2], write: [u32; 2],
        volume: u32, size_high: u32, size_low: u32, links: u32,
        index_high: u32, index_low: u32,
    }
    #[link(name = "kernel32")]
    unsafe extern "system" {
        fn GetFileInformationByHandle(handle: *mut std::ffi::c_void, info: *mut FileInformation) -> i32;
    }
    fn identity(path: &Path) -> io::Result<(u32, u32, u32)> {
        // Zero desired access allows identity checks without requesting file data;
        // BACKUP_SEMANTICS permits opening directories and follows links.
        let file = fs::OpenOptions::new().access_mode(0).custom_flags(0x02000000).open(path)?;
        let mut info = std::mem::MaybeUninit::<FileInformation>::uninit();
        if unsafe { GetFileInformationByHandle(file.as_raw_handle(), info.as_mut_ptr()) } == 0 {
            return Err(io::Error::last_os_error());
        }
        let info = unsafe { info.assume_init() };
        if info.index_high == 0 && info.index_low == 0 {
            return Err(io::Error::new(io::ErrorKind::Unsupported, "filesystem did not provide a file ID"));
        }
        Ok((info.volume, info.index_high, info.index_low))
    }
    let source = identity(a).map_err(|e| failure("identify source", a, e))?;
    match identity(b) {
        Ok(destination) => Ok(source == destination),
        Err(e) if e.kind() == io::ErrorKind::NotFound => {
            // A dangling destination link has no target identity, but is a
            // distinct directory entry. Other lookup failures remain errors.
            match fs::symlink_metadata(b) {
                Ok(meta) if meta.file_type().is_symlink() => Ok(false),
                Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(false),
                Ok(_) => Err(failure("identify destination", b, e)),
                Err(e) => Err(failure("stat", b, e)),
            }
        }
        Err(e) => Err(failure("identify destination", b, e)),
    }
}

fn remove_destination_link(path: &Path, meta: &fs::Metadata) -> Result<(), CopyError> {
    #[cfg(windows)]
    {
        use std::os::windows::fs::FileTypeExt;
        if meta.file_type().is_symlink_dir() {
            return fs::remove_dir(path).map_err(|e| failure("remove destination", path, e));
        }
    }
    #[cfg(not(windows))]
    let _ = meta;
    fs::remove_file(path).map_err(|e| failure("remove destination", path, e))
}

#[cfg(unix)]
fn copy_symlink(source: &Path, destination: &Path) -> Result<(), CopyError> {
    use std::os::unix::fs::symlink;
    let link = fs::read_link(source).map_err(|e| failure("read link", source, e))?;
    // Node's default cpSync resolves a relative link against its source parent.
    let resolved = if link.is_absolute() {
        link
    } else {
        let path = source.parent().unwrap_or(Path::new("")).join(link);
        std::path::absolute(&path).map_err(|e| failure("resolve link", &path, e))?
    };
    match fs::symlink_metadata(destination) {
        Ok(meta) if meta.file_type().is_symlink() && fs::metadata(destination).is_ok() => {
            if same_file(source, destination) {
                return Err(failure("copy link", destination,
                    io::Error::new(io::ErrorKind::InvalidInput, "source and destination refer to the same file")));
            }
            fs::remove_file(destination)
                .map_err(|e| failure("remove destination", destination, e))?
        }
        Ok(_) => return Err(failure("copy link", destination,
            io::Error::new(io::ErrorKind::AlreadyExists, "destination already exists"))),
        Err(e) if e.kind() == io::ErrorKind::NotFound => {}
        Err(e) => return Err(failure("stat", destination, e)),
    }
    symlink(&resolved, destination).map_err(|e| failure("copy link", destination, e))
}

#[cfg(windows)]
fn copy_symlink(source: &Path, destination: &Path) -> Result<(), CopyError> {
    use std::os::windows::fs::{symlink_dir, symlink_file};
    let link = fs::read_link(source).map_err(|e| failure("read link", source, e))?;
    let resolved = if link.is_absolute() {
        link
    } else {
        // Drive-relative and root-relative paths need Windows path.resolve
        // semantics that are not established here.
        if link.has_root() || link.components().any(|c| matches!(c, std::path::Component::Prefix(_))) {
            return Err(failure("resolve link", source,
                io::Error::new(io::ErrorKind::Unsupported, "ambiguous Windows link target")));
        }
        let path = source.parent().unwrap_or(Path::new("")).join(link);
        std::path::absolute(&path).map_err(|e| failure("resolve link", &path, e))?
    };
    // Existing link replacement has additional Node subdirectory checks. Do
    // not unlink anything until those Windows cases have been verified.
    match fs::symlink_metadata(destination) {
        Ok(_) => return Err(failure("copy link", destination,
            io::Error::new(io::ErrorKind::AlreadyExists, "destination already exists"))),
        Err(e) if e.kind() == io::ErrorKind::NotFound => {},
        Err(e) => return Err(failure("stat", destination, e)),
    }
    // Node auto-detects directory targets; missing targets use a file link.
    let is_dir = match fs::metadata(&resolved) {
        Ok(meta) => meta.is_dir(),
        Err(e) if e.kind() == io::ErrorKind::NotFound => false,
        Err(e) => return Err(failure("stat link target", &resolved, e)),
    };
    let result = if is_dir { symlink_dir(&resolved, destination) } else { symlink_file(&resolved, destination) };
    result.map_err(|e| failure("copy link", destination, e))
}

#[cfg(not(any(unix, windows)))]
fn copy_symlink(source: &Path, _destination: &Path) -> Result<(), CopyError> {
    Err(failure("copy link", source,
        io::Error::new(io::ErrorKind::Unsupported, "copying symlinks is unavailable on this platform")))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    #[test]
    fn rejects_copying_directory_into_its_descendant() {
        let fixture = Fixture::new();
        let source = fixture.0.join("source");
        let destination = source.join("nested");
        fs::create_dir_all(&destination).unwrap();
        let error = copy_tree(&source, &destination).unwrap_err();
        assert_eq!(error.source.kind(), io::ErrorKind::InvalidInput);
    }

    #[cfg(unix)]
    #[test]
    fn rejects_descendant_through_parent_symlink() {
        use std::os::unix::fs::symlink;
        let fixture = Fixture::new();
        let source = fixture.0.join("source");
        fs::create_dir_all(source.join("nested")).unwrap();
        symlink(&source, fixture.0.join("alias")).unwrap();
        let destination = fixture.0.join("alias/nested");
        let error = copy_tree(&source, &destination).unwrap_err();
        assert_eq!(error.source.kind(), io::ErrorKind::InvalidInput);
    }

    static NEXT: AtomicUsize = AtomicUsize::new(0);
    struct Fixture(PathBuf);
    impl Fixture {
        fn new() -> Self {
            let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../.jait/artifacts/gateway-rust")
                .join(format!("copy-shell-{}-{}", std::process::id(), NEXT.fetch_add(1, Ordering::Relaxed)));
            fs::create_dir_all(&root).unwrap();
            Self(root)
        }
        fn write(&self, path: &str, bytes: &[u8]) {
            let path = self.0.join(path);
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            fs::write(path, bytes).unwrap();
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) { let _ = fs::remove_dir_all(&self.0); }
    }
    #[test]
    fn replacement_preserves_other_destination_hard_links() {
        let f = Fixture::new();
        f.write("source", b"new");
        f.write("destination", b"old");
        fs::hard_link(f.0.join("destination"), f.0.join("alias")).unwrap();
        copy_entry(&f.0.join("source"), &f.0.join("destination")).unwrap();
        assert_eq!(fs::read(f.0.join("destination")).unwrap(), b"new");
        assert_eq!(fs::read(f.0.join("alias")).unwrap(), b"old");
    }

    #[cfg(windows)]
    #[test]
    fn windows_hard_link_identity_prevents_overwrite() {
        let f = Fixture::new();
        f.write("source", b"keep");
        fs::hard_link(f.0.join("source"), f.0.join("destination")).unwrap();
        let error = copy_entry(&f.0.join("source"), &f.0.join("destination")).unwrap_err();
        assert_eq!(error.source.kind(), io::ErrorKind::InvalidInput);
        assert_eq!(fs::read(f.0.join("source")).unwrap(), b"keep");
    }

    #[cfg(windows)]
    #[test]
    fn windows_copies_new_file_and_directory_links() {
        use std::os::windows::fs::{symlink_dir, symlink_file};
        let f = Fixture::new();
        f.write("target", b"content");
        fs::create_dir(f.0.join("directory")).unwrap();
        symlink_file("target", f.0.join("file-link")).unwrap();
        symlink_dir("directory", f.0.join("directory-link")).unwrap();
        copy_symlink(&f.0.join("file-link"), &f.0.join("new-file-link")).unwrap();
        copy_symlink(&f.0.join("directory-link"), &f.0.join("new-directory-link")).unwrap();
        assert_eq!(fs::read(f.0.join("new-file-link")).unwrap(), b"content");
        assert!(fs::metadata(f.0.join("new-directory-link")).unwrap().is_dir());
        assert_eq!(copy_symlink(&f.0.join("file-link"), &f.0.join("new-file-link"))
            .unwrap_err().source.kind(), io::ErrorKind::AlreadyExists);
    }

    #[cfg(unix)]
    #[test]
    fn regular_file_replaces_destination_link_without_overwriting_target() {
        use std::os::unix::fs::symlink;
        let f = Fixture::new();
        f.write("source", b"new");
        f.write("target", b"old");
        symlink("target", f.0.join("destination")).unwrap();
        copy_entry(&f.0.join("source"), &f.0.join("destination")).unwrap();
        assert!(!fs::symlink_metadata(f.0.join("destination")).unwrap().file_type().is_symlink());
        assert_eq!(fs::read(f.0.join("destination")).unwrap(), b"new");
        assert_eq!(fs::read(f.0.join("target")).unwrap(), b"old");
    }

    #[cfg(unix)]
    #[test]
    fn directory_cannot_copy_through_destination_link() {
        use std::os::unix::fs::symlink;
        let f = Fixture::new();
        f.write("source/a", b"new");
        fs::create_dir_all(f.0.join("target")).unwrap();
        symlink("target", f.0.join("destination")).unwrap();
        assert!(copy_entry(&f.0.join("source"), &f.0.join("destination")).is_err());
        assert!(!f.0.join("target/a").exists());
    }

    #[cfg(unix)]
    #[test]
    fn same_file_and_same_symlink_target_are_not_replaced() {
        use std::os::unix::fs::symlink;
        let f = Fixture::new();
        f.write("target", b"keep");
        symlink("target", f.0.join("source")).unwrap();
        symlink("target", f.0.join("destination")).unwrap();
        assert!(copy_entry(&f.0.join("source"), &f.0.join("destination")).is_err());
        assert!(copy_entry(&f.0.join("target"), &f.0.join("destination")).is_err());
        fs::hard_link(f.0.join("target"), f.0.join("hardlink")).unwrap();
        assert!(copy_entry(&f.0.join("target"), &f.0.join("hardlink")).is_err());
        assert_eq!(fs::read(f.0.join("target")).unwrap(), b"keep");
    }

    #[test]
    fn rejects_copying_empty_directory_onto_itself() {
        let f = Fixture::new();
        fs::create_dir(f.0.join("source")).unwrap();
        let source = f.0.join("source");
        assert_eq!(copy_tree(&source, &source).unwrap_err().source.kind(), io::ErrorKind::InvalidInput);
    }

    #[cfg(unix)]
    #[test]
    fn rejects_directory_identity_through_parent_alias() {
        use std::os::unix::fs::symlink;
        let f = Fixture::new();
        fs::create_dir_all(f.0.join("real/source")).unwrap();
        symlink("real", f.0.join("alias")).unwrap();
        assert_eq!(copy_tree(&f.0.join("real/source"), &f.0.join("alias/source"))
            .unwrap_err().source.kind(), io::ErrorKind::InvalidInput);
    }

    #[test]
    fn copies_nested_tree_and_all_packaged_browser_assets() {
        let f = Fixture::new();
        f.write("src/surfaces/shell-integration/nested/script.sh", b"new");
        f.write("dist/surfaces/shell-integration/nested/script.sh", b"old");
        for name in ["playwright-node-bridge.cjs", "browser-cursor.cjs", "browser-cursor.d.cts"] {
            f.write(&format!("src/surfaces/{name}"), name.as_bytes());
        }
        let target = copy_assets(&f.0).unwrap();
        assert_eq!(fs::read(target.join("nested/script.sh")).unwrap(), b"new");
        assert_eq!(fs::read(f.0.join("dist/surfaces/browser-cursor.d.cts")).unwrap(), b"browser-cursor.d.cts");
        assert_eq!(fs::read(f.0.join("dist/surfaces/playwright-node-bridge.cjs")).unwrap(), b"playwright-node-bridge.cjs");
    }
    #[test]
    fn progress_is_reported_before_cursor_copy_failure() {
        let f = Fixture::new();
        f.write("src/surfaces/shell-integration/a.sh", b"a");
        f.write("src/surfaces/playwright-node-bridge.cjs", b"bridge");
        let mut reported = None;
        let result = copy_assets_with_progress(&f.0, |target| reported = Some(target.to_owned()));
        assert_eq!(result.unwrap_err().source.kind(), io::ErrorKind::NotFound);
        assert_eq!(reported, Some(f.0.join("dist/surfaces/shell-integration")));
        assert_eq!(fs::read(f.0.join("dist/surfaces/playwright-node-bridge.cjs")).unwrap(), b"bridge");
    }

    #[test]
    fn missing_source_and_bridge_fail_without_hiding_partial_work() {
        let f = Fixture::new();
        assert_eq!(copy_assets(&f.0).unwrap_err().source.kind(), io::ErrorKind::NotFound);
        assert!(!f.0.join("dist").exists());
        f.write("src/surfaces/shell-integration/a.sh", b"copied");
        assert_eq!(copy_assets(&f.0).unwrap_err().source.kind(), io::ErrorKind::NotFound);
        assert_eq!(fs::read(f.0.join("dist/surfaces/shell-integration/a.sh")).unwrap(), b"copied");
    }
    #[cfg(unix)]
    #[test]
    fn relative_package_root_keeps_symlink_pointing_to_source() {
        use std::os::unix::fs::symlink;
        let f = Fixture::new();
        f.write("src/surfaces/shell-integration/a.sh", b"source");
        symlink("a.sh", f.0.join("src/surfaces/shell-integration/link.sh")).unwrap();
        for name in ["playwright-node-bridge.cjs", "browser-cursor.cjs", "browser-cursor.d.cts"] {
            f.write(&format!("src/surfaces/{name}"), b"");
        }
        let cwd = std::env::current_dir().unwrap();
        let common = cwd.ancestors().find(|ancestor| f.0.starts_with(ancestor)).unwrap();
        let mut relative = PathBuf::new();
        for _ in cwd.strip_prefix(common).unwrap().components() {
            relative.push("..");
        }
        relative.push(f.0.strip_prefix(common).unwrap());
        assert!(!relative.is_absolute());
        let target = copy_assets(&relative).unwrap();
        assert!(fs::read_link(target.join("link.sh")).unwrap().is_absolute());
        assert_eq!(fs::read(target.join("link.sh")).unwrap(), b"source");
    }

    #[cfg(unix)]
    #[test]
    fn symlink_does_not_replace_existing_file_or_dangling_link() {
        use std::os::unix::fs::symlink;
        let f = Fixture::new();
        let source = f.0.join("source-link");
        let destination = f.0.join("destination");
        symlink("target", &source).unwrap();
        fs::write(&destination, b"keep").unwrap();
        assert_eq!(copy_symlink(&source, &destination).unwrap_err().source.kind(), io::ErrorKind::AlreadyExists);
        assert_eq!(fs::read(&destination).unwrap(), b"keep");
        fs::remove_file(&destination).unwrap();
        symlink("missing", &destination).unwrap();
        assert_eq!(copy_symlink(&source, &destination).unwrap_err().source.kind(), io::ErrorKind::AlreadyExists);
        assert_eq!(fs::read_link(&destination).unwrap(), Path::new("missing"));
    }

    #[cfg(unix)]
    #[test]
    fn copies_relative_symlink_as_source_resolved_link() {
        use std::os::unix::fs::symlink;
        let f = Fixture::new();
        f.write("src/surfaces/shell-integration/a.sh", b"a");
        let src = f.0.join("src/surfaces/shell-integration");
        symlink("a.sh", src.join("link.sh")).unwrap();
        for name in ["playwright-node-bridge.cjs", "browser-cursor.cjs", "browser-cursor.d.cts"] {
            f.write(&format!("src/surfaces/{name}"), b"");
        }
        let target = copy_assets(&f.0).unwrap();
        assert_eq!(fs::read_link(target.join("link.sh")).unwrap(), src.join("a.sh"));
    }
}
