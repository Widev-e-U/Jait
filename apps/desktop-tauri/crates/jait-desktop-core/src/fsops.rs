//! fsops — port of the `desktop:fs-op` simple operations.
//!
//! Source: apps/desktop/src/electron-main.ts, `ipcMain.handle("desktop:fs-op")`
//! cases: stat, read, readBinary, write, list, exists, mkdir, readdir,
//! reveal-in-explorer.
//!
//! Caps mirror the Electron handlers:
//! - MAX_FS_OP_READ_BYTES = 20 MB (utf-8 reads)
//! - MAX_FS_OP_READ_BINARY_BYTES = 30 MB (base64 reads)
//! - MAX_DIFF_FILE_BYTES = 10 MB (git-file-read working tree side)

use crate::types::*;

pub const MAX_FS_OP_READ_BYTES: u64 = 20 * 1024 * 1024;
pub const MAX_FS_OP_READ_BINARY_BYTES: u64 = 30 * 1024 * 1024;
pub const MAX_DIFF_FILE_BYTES: u64 = 10 * 1024 * 1024;

pub fn stat(path: &std::path::Path) -> Result<StatOut, String> {
    let meta = std::fs::metadata(path).map_err(|e| format!("stat failed: {e}"))?;
    let modified = meta
        .modified()
        .ok()
        .map(|t| chrono::DateTime::<chrono::Utc>::from(t).to_rfc3339())
        .unwrap_or_default();
    Ok(StatOut {
        size: meta.len(),
        is_directory: meta.is_dir(),
        is_file: meta.is_file(),
        modified,
    })
}

pub fn read(path: &std::path::Path) -> Result<FileText, String> {
    assert_readable_size(path, MAX_FS_OP_READ_BYTES)?;
    std::fs::read_to_string(path).map_err(|e| format!("read failed: {e}"))
}

pub fn read_binary(path: &std::path::Path) -> Result<ReadBinaryOut, String> {
    assert_readable_size(path, MAX_FS_OP_READ_BINARY_BYTES)?;
    let bytes = std::fs::read(path).map_err(|e| format!("readBinary failed: {e}"))?;
    use base64::Engine;
    Ok(ReadBinaryOut { base64: base64::engine::general_purpose::STANDARD.encode(&bytes), bytes: bytes.len() as u64 })
}

fn assert_readable_size(path: &std::path::Path, max: u64) -> Result<(), String> {
    let info = stat(path)?;
    if info.size > max {
        return Err(format!(
            "File too large to open remotely: {} is {:.1} MB (limit {} MB)",
            path.display(),
            info.size as f64 / 1_048_576.0,
            max / 1_048_576
        ));
    }
    Ok(())
}

pub fn write(path: &std::path::Path, content: &str) -> Result<WriteOut, String> {
    let bytes = content.as_bytes().len() as u64;
    std::fs::write(path, content).map_err(|e| format!("write failed: {e}"))?;
    Ok(WriteOut { bytes })
}

pub fn list(path: &std::path::Path) -> Result<Vec<FileText>, String> {
    let mut out: Vec<FileText> = Vec::new();
    let rd = std::fs::read_dir(path).map_err(|e| format!("list failed: {e}"))?;
    for e in rd.flatten() {
        out.push(e.path().to_string_lossy().into_owned());
    }
    Ok(out)
}

pub fn exists(path: &std::path::Path) -> bool {
    std::fs::exists(path).unwrap_or(false)
}

pub fn mkdir(path: &std::path::Path) -> Result<MkdirOut, String> {
    std::fs::create_dir_all(path).map_err(|e| format!("mkdir failed: {e}"))?;
    Ok(MkdirOut { ok: true, path: path.to_string_lossy().into_owned() })
}

pub fn read_dir(path: &std::path::Path) -> Result<Vec<DirEntryOut>, String> {
    let rd = std::fs::read_dir(path).map_err(|e| format!("readdir failed: {e}"))?;
    let mut out = Vec::new();
    for e in rd.flatten() {
        let ft = e.file_type().map_err(|e| format!("readdir failed: {e}"))?;
        out.push(DirEntryOut {
            name: e.file_name().to_string_lossy().into_owned(),
            is_directory: ft.is_dir(),
            is_file: Some(ft.is_file()),
        });
    }
    Ok(out)
}

/// Open a file/folder in the platform file manager — mirrors `reveal-in-explorer`.
pub fn reveal_in_explorer(path: &std::path::Path) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer").arg("/select,").arg(path).spawn().map_err(|e| e.to_string())?;
        Ok(())
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open").args(["-R"]).arg(path).spawn().map_err(|e| e.to_string())?;
        Ok(())
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open").arg(path).spawn().map_err(|e| e.to_string())?;
        Ok(())
    }
}

/// `browse-path` handler — mirrors desktop:browse-path (skip dotfiles, dirs first).
pub fn browse_path(dir_path: &str) -> Result<BrowseOut, String> {
    let resolved = std::fs::canonicalize(dir_path).map_err(|e| format!("browse failed: {e}"))?;
    let mut entries: Vec<BrowseEntry> = Vec::new();
    for e in std::fs::read_dir(&resolved).map_err(|e| format!("browse failed: {e}"))?.flatten() {
        let name = e.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') {
            continue;
        }
        let ft = e.file_type().map_err(|e| format!("browse failed: {e}"))?;
        let kind = if ft.is_dir() { "dir" } else if ft.is_file() { "file" } else { continue };
        entries.push(BrowseEntry {
            name,
            path: e.path().to_string_lossy().into_owned(),
            entry_type: kind.to_string(),
        });
    }
    entries.sort_by(|a, b| {
        (b.entry_type == "dir").cmp(&(a.entry_type == "dir")).then_with(|| a.name.cmp(&b.name))
    });
    let path_str = resolved.to_string_lossy().into_owned();
    let parent = resolved
        .parent()
        .filter(|p| p != &resolved)
        .map(|p| p.to_string_lossy().into_owned());
    Ok(BrowseOut { path: path_str, parent, entries })
}

/// `get-roots` handler — mirrors desktop:get-roots (drives on Windows + Home).
pub fn get_roots() -> RootsOut {
    let mut roots: Vec<BrowseEntry> = Vec::new();
    #[cfg(target_os = "windows")]
    {
        roots.push(BrowseEntry { name: "C:".into(), path: "C:\\".into(), entry_type: "dir".into() });
        // Additional drives are enumerated best-effort via wmic in Electron;
        // PowerShell `Get-Volume` handles the same listing here.
        if let Ok(out) = std::process::Command::new("powershell.exe")
            .args(["-NoProfile", "-Command", "(Get-Volume | Where-Object DriveLetter).DriveLetter"])
            .output()
        {
            if let Ok(text) = String::from_utf8(out.stdout) {
                for l in text.lines() {
                    let l = l.trim();
                    if l.len() == 1 && l.chars().next().map(|c| c.is_ascii_alphabetic()).unwrap_or(false) {
                        let upper = l.to_uppercase();
                        if roots.iter().any(|r| r.name == upper) { continue; }
                        roots.push(BrowseEntry {
                            name: upper.clone(),
                            path: format!("{upper}\\"),
                            entry_type: "dir".into(),
                        });
                    }
                }
            }
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        roots.push(BrowseEntry { name: "/".into(), path: "/".into(), entry_type: "dir".into() });
    }
    if let Some(home) = home_dir() {
        roots.push(BrowseEntry {
            name: "Home".into(),
            path: home.to_string_lossy().into_owned(),
            entry_type: "dir".into(),
        });
    }
    RootsOut { roots }
}

use crate::info::home_dir;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn write_read_stat_roundtrip() {
        let dir = std::env::temp_dir().join(format!("jait-fs-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let f = dir.join("hello.txt");
        let w = write(&f, "hello world").unwrap();
        assert_eq!(w.bytes, 11);
        assert_eq!(read(&f).unwrap(), "hello world");
        let s = stat(&f).unwrap();
        assert_eq!(s.size, 11);
        assert!(!s.is_directory);
        assert!(exists(&f));
        let rd = read_dir(&dir).unwrap();
        assert_eq!(rd.len(), 1);
        assert_eq!(rd[0].name, "hello.txt");
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn read_rejects_oversized_files() {
        let dir = std::env::temp_dir().join(format!("jait-fs-big-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let f = dir.join("big.bin");
        let big = vec![0u8; (MAX_FS_OP_READ_BYTES + 1) as usize];
        std::fs::write(&f, &big).unwrap();
        let err = read(&f).unwrap_err();
        assert!(err.contains("too large"), "got: {err}");
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn browse_skips_hidden_and_sorts_dirs_first() {
        let dir = std::env::temp_dir().join(format!("jait-fs-browse-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(dir.join(".hidden")).unwrap();
        std::fs::create_dir_all(dir.join("zdir")).unwrap();
        std::fs::write(dir.join("afile.txt"), "x").unwrap();
        let out = browse_path(dir.to_str().unwrap()).unwrap();
        assert_eq!(out.entries.len(), 2);
        assert_eq!(out.entries[0].entry_type, "dir");
        assert_eq!(out.entries[0].name, "zdir");
        assert_eq!(out.entries[1].name, "afile.txt");
        std::fs::remove_dir_all(&dir).ok();
    }
}