//! Staging adapter for `scripts/bundle-web.mjs`.
//!
//! The caller supplies an authorized, isolated build tree and a fresh staging
//! destination. The reference deletes and replaces `web-dist` directly; this
//! staging adapter never deletes or replaces a destination. Path checks are not
//! atomic: callers must prevent concurrent mutation of source and destination
//! ancestors. Linux callers may explicitly publish into an absent name in an
//! authorized, isolated directory using `publish_new_web`.
use std::{fs, io, io::Read, path::Path};

const MAX_ENTRIES: usize = 100_000;
const MAX_BYTES: u64 = 1024 * 1024 * 1024;
const MAX_DEPTH: usize = 64;

#[derive(Debug, PartialEq, Eq)]
pub enum BundleResult {
    MissingBuild,
    Staged,
}

/// Stage a frontend tree into a new directory. Errors may leave partial staging
/// output; the caller owns cleanup and must not publish it after an error.
pub fn stage_web(source: &Path, destination: &Path) -> io::Result<BundleResult> {
    match fs::symlink_metadata(source.join("index.html")) {
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            return Ok(BundleResult::MissingBuild);
        }
        Err(error) => return Err(error),
        Ok(meta) if meta.is_file() => {}
        Ok(_) => {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "index.html must be a regular file",
            ));
        }
    }
    let source_meta = fs::symlink_metadata(source)?;
    if !source_meta.is_dir() || source_meta.file_type().is_symlink() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "source must be a real directory",
        ));
    }
    let source_abs = fs::canonicalize(source)?;
    let parent = destination
        .parent()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "destination needs a parent"))?;
    let parent_abs = fs::canonicalize(parent)?;
    if parent_abs.starts_with(&source_abs) {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "destination cannot be inside source",
        ));
    }
    fs::create_dir(destination)?;
    let mut entries = 0;
    let mut bytes = 0;
    copy_tree(source, destination, 0, &mut entries, &mut bytes)?;
    ensure_staged_index(destination)?;
    Ok(BundleResult::Staged)
}

/// Stage and publish into an absent single-component name in `parent` on Linux.
/// The caller must authorize this directory and exclude concurrent mutation of
/// the source, staging tree and their ancestors. The directory descriptor pins
/// the publication parent; it does not itself establish application authority.
/// Existing destinations are never replaced. On error a partial staging directory
/// may remain; its name is returned in the error for caller-controlled cleanup.
///
/// Replacing an existing bundle requires an authorized owner that holds an
/// exclusive parent lock through activation and rollback, records the exchange
/// and both directory identities durably, verifies those identities before a
/// rollback, and recovers interrupted exchanges and cleanup after a crash. An
/// atomic exchange or a directory descriptor alone does not enforce these
/// requirements. This API does not provide that replacement protocol.
#[cfg(target_os = "linux")]
pub fn publish_new_web(
    source: &Path,
    parent: &fs::File,
    name: &std::ffi::OsStr,
) -> io::Result<BundleResult> {
    use std::ffi::CString;
    use std::os::fd::AsRawFd;
    use std::os::unix::ffi::OsStrExt;
    use std::path::Component;

    let mut components = Path::new(name).components();
    if !matches!(components.next(), Some(Component::Normal(_))) || components.next().is_some() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "publication name must be one normal path component",
        ));
    }
    let destination = CString::new(name.as_bytes()).map_err(|_| {
        io::Error::new(io::ErrorKind::InvalidInput, "publication name contains NUL")
    })?;
    if !parent.metadata()?.is_dir() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "publication parent must be a directory",
        ));
    }
    let stage = loop {
        let candidate = format!(".jait-web-stage-{}", uuid::Uuid::new_v4());
        if candidate.as_bytes() != name.as_bytes() {
            break candidate;
        }
    };
    let stage_name = CString::new(stage.as_bytes()).expect("generated stage name contains no NUL");
    let stage_path =
        std::path::PathBuf::from(format!("/proc/self/fd/{}", parent.as_raw_fd())).join(&stage);
    let annotate =
        |error: io::Error| io::Error::new(error.kind(), format!("{error}; staging name: {stage}"));
    match stage_web(source, &stage_path).map_err(annotate)? {
        BundleResult::MissingBuild => return Ok(BundleResult::MissingBuild),
        BundleResult::Staged => {}
    }
    // renameat2 with NOREPLACE fails closed on unsupported filesystems and if a
    // destination appears concurrently. Never fall back to a replacing rename.
    let result = unsafe {
        libc::renameat2(
            parent.as_raw_fd(),
            stage_name.as_ptr(),
            parent.as_raw_fd(),
            destination.as_ptr(),
            libc::RENAME_NOREPLACE,
        )
    };
    if result != 0 {
        return Err(annotate(io::Error::last_os_error()));
    }
    Ok(BundleResult::Staged)
}

fn ensure_staged_index(destination: &Path) -> io::Result<()> {
    if !fs::symlink_metadata(destination.join("index.html"))?.is_file() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "staged index.html is not a regular file",
        ));
    }
    Ok(())
}

fn copy_tree(
    source: &Path,
    destination: &Path,
    depth: usize,
    entries: &mut usize,
    bytes: &mut u64,
) -> io::Result<()> {
    if depth > MAX_DEPTH {
        return Err(io::Error::other("frontend nesting budget exceeded"));
    }
    for entry in fs::read_dir(source)? {
        let entry = entry?;
        *entries += 1;
        if *entries > MAX_ENTRIES {
            return Err(io::Error::other("frontend entry budget exceeded"));
        }
        let meta = fs::symlink_metadata(entry.path())?;
        let target = destination.join(entry.file_name());
        if meta.is_dir() {
            fs::create_dir(&target)?;
            copy_tree(&entry.path(), &target, depth + 1, entries, bytes)?;
        } else if meta.is_file() {
            *bytes = bytes
                .checked_add(meta.len())
                .ok_or_else(|| io::Error::other("frontend byte budget exceeded"))?;
            if *bytes > MAX_BYTES {
                return Err(io::Error::other("frontend byte budget exceeded"));
            }
            let mut options = fs::OpenOptions::new();
            options.read(true);
            // Prevent a leaf replaced with a symlink between inspection and open.
            #[cfg(unix)]
            {
                use std::os::unix::fs::OpenOptionsExt;
                options.custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK);
            }
            let input = options.open(entry.path())?;
            let opened = input.metadata()?;
            if !opened.is_file() || !same_file_snapshot(&meta, &opened) {
                return Err(io::Error::other("frontend file changed before copying"));
            }
            let mut output = fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(target)?;
            let copied = io::copy(&mut (&input).take(meta.len() + 1), &mut output)?;
            if copied != meta.len() || !same_file_snapshot(&opened, &input.metadata()?) {
                return Err(io::Error::other("frontend file changed while copying"));
            }
        } else {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "frontend contains a link or special file",
            ));
        }
    }
    Ok(())
}

// Compare the identity and mutation metadata as well as the size. This catches
// same-size replacements and ordinary in-place writes while copying; the caller
// must still exclude concurrent mutation of the tree and its ancestors.
fn same_file_snapshot(before: &fs::Metadata, after: &fs::Metadata) -> bool {
    if before.len() != after.len() || !before.is_file() || !after.is_file() {
        return false;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        before.dev() == after.dev()
            && before.ino() == after.ino()
            && before.mtime() == after.mtime()
            && before.mtime_nsec() == after.mtime_nsec()
            && before.ctime() == after.ctime()
            && before.ctime_nsec() == after.ctime_nsec()
    }
    #[cfg(not(unix))]
    {
        before
            .modified()
            .ok()
            .zip(after.modified().ok())
            .is_some_and(|(a, b)| a == b)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    struct Fixture(PathBuf);
    impl Fixture {
        fn new() -> Self {
            let root = Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("../../.jait/artifacts/gateway-rust/bundle-web")
                .join(uuid::Uuid::new_v4().to_string());
            fs::create_dir_all(&root).unwrap();
            Self(root)
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }
    #[cfg(unix)]
    #[test]
    fn detects_same_size_replacement() {
        let f = Fixture::new();
        let original = f.0.join("original");
        let replacement = f.0.join("replacement");
        fs::write(&original, b"same").unwrap();
        fs::write(&replacement, b"size").unwrap();
        assert!(!same_file_snapshot(
            &fs::metadata(original).unwrap(),
            &fs::metadata(replacement).unwrap(),
        ));
    }
    #[cfg(target_os = "linux")]
    #[test]
    fn publication_never_replaces_existing_destination() {
        let f = Fixture::new();
        let source = f.0.join("source");
        let target = f.0.join("published");
        fs::create_dir(&source).unwrap();
        fs::write(source.join("index.html"), b"new").unwrap();
        fs::create_dir(&target).unwrap();
        fs::write(target.join("index.html"), b"old").unwrap();
        let parent = fs::File::open(&f.0).unwrap();
        assert_eq!(
            publish_new_web(&source, &parent, "published".as_ref())
                .unwrap_err()
                .kind(),
            io::ErrorKind::AlreadyExists
        );
        assert_eq!(fs::read(target.join("index.html")).unwrap(), b"old");
        assert!(publish_new_web(&source, &parent, "../escape".as_ref()).is_err());
        assert_eq!(
            publish_new_web(&source, &parent, "fresh".as_ref()).unwrap(),
            BundleResult::Staged
        );
        assert_eq!(fs::read(f.0.join("fresh/index.html")).unwrap(), b"new");
    }
    #[test]
    fn skip_stage_and_refuse_clobber() {
        let f = Fixture::new();
        let src = f.0.join("source");
        let dst = f.0.join("stage");
        fs::create_dir(&src).unwrap();
        assert_eq!(stage_web(&src, &dst).unwrap(), BundleResult::MissingBuild);
        assert!(!dst.exists());
        fs::write(src.join("index.html"), b"index").unwrap();
        fs::create_dir(src.join("assets")).unwrap();
        fs::write(src.join("assets/app.js"), b"app").unwrap();
        assert_eq!(stage_web(&src, &dst).unwrap(), BundleResult::Staged);
        assert_eq!(fs::read(dst.join("assets/app.js")).unwrap(), b"app");
        assert_eq!(
            stage_web(&src, &dst).unwrap_err().kind(),
            io::ErrorKind::AlreadyExists
        );
        assert_eq!(fs::read(dst.join("index.html")).unwrap(), b"index");
        assert!(stage_web(&src, &src.join("nested")).is_err());
    }
    #[test]
    fn rejects_missing_or_non_file_staged_index() {
        let f = Fixture::new();
        assert!(ensure_staged_index(&f.0).is_err());
        fs::create_dir(f.0.join("index.html")).unwrap();
        assert!(ensure_staged_index(&f.0).is_err());
        fs::remove_dir(f.0.join("index.html")).unwrap();
        fs::write(f.0.join("index.html"), b"index").unwrap();
        assert!(ensure_staged_index(&f.0).is_ok());
    }
    #[test]
    fn rejects_directory_index_without_creating_stage() {
        let f = Fixture::new();
        let src = f.0.join("source");
        fs::create_dir_all(src.join("index.html")).unwrap();
        let dst = f.0.join("stage");
        assert_eq!(
            stage_web(&src, &dst).unwrap_err().kind(),
            io::ErrorKind::InvalidInput
        );
        assert!(!dst.exists());
    }
    #[cfg(unix)]
    #[test]
    fn rejects_source_symlinks() {
        use std::os::unix::fs::symlink;
        let f = Fixture::new();
        let src = f.0.join("source");
        fs::create_dir(&src).unwrap();
        fs::write(src.join("index.html"), b"index").unwrap();
        symlink("index.html", src.join("link")).unwrap();
        assert!(stage_web(&src, &f.0.join("stage")).is_err());
    }
}
