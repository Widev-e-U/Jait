//! Resolve local/remote filesystem capabilities using the native registry.
//! Selection is not authorization. Existing scope/consent ports remain mandatory;
//! local surfaces continue to enforce PathGuard, including after rescoping.
use crate::{
    runtime::blocking::BlockingLane,
    surfaces::{
        filesystem::FileSystemSurface,
        registry::{SurfaceRef, SurfaceRegistry, SurfaceStartInput, SurfaceState},
        remote_filesystem::RemoteFileSystemSurface,
    },
};
use std::{
    any::Any,
    path::{Component, Path, PathBuf},
};
fn local(s: &SurfaceRef) -> Option<&FileSystemSurface> {
    (s.as_ref() as &dyn Any).downcast_ref()
}
fn remote(s: &SurfaceRef) -> Option<&RemoteFileSystemSurface> {
    (s.as_ref() as &dyn Any).downcast_ref()
}
fn running(s: &SurfaceRef) -> bool {
    s.state() == SurfaceState::Running
}
fn normalized(s: &str) -> String {
    s.replace('\\', "/").trim_end_matches('/').to_lowercase()
}
fn surface_root(s: &SurfaceRef) -> Result<Option<String>, String> {
    Ok(s.snapshot()?
        .metadata
        .get("projectRoot")
        .and_then(serde_json::Value::as_str)
        .map(str::to_string))
}
fn allowed(s: &SurfaceRef, path: &str) -> Result<bool, String> {
    if let Some(fs) = local(s) {
        return Ok(fs.is_path_allowed(path));
    }
    if let Some(fs) = remote(s) {
        return Ok(fs.is_path_allowed(path));
    }
    Err("Filesystem surface does not implement path checks".into())
}
fn most_specific(
    surfaces: &[SurfaceRef],
    target: &str,
    manual_fallback: bool,
) -> Result<Option<SurfaceRef>, String> {
    let mut best = None;
    let mut best_len = None;
    let norm_target = normalized(target);
    for s in surfaces {
        let mut covered = allowed(s, target).unwrap_or(false);
        if !covered
            && manual_fallback
            && let Some(root) = surface_root(s)?
        {
            let norm_root = normalized(&root);
            covered = !norm_root.is_empty()
                && (norm_target == norm_root || norm_target.starts_with(&(norm_root + "/")));
        }
        if !covered {
            continue;
        }
        let len = surface_root(s)?
            .map(|s| s.encode_utf16().count())
            .unwrap_or(0);
        if best_len.is_none_or(|old| len > old) {
            best = Some(s.clone());
            best_len = Some(len);
        }
    }
    Ok(best)
}
fn absolute(cwd: &Path, base: &Path, target: &Path) -> PathBuf {
    let raw = cwd.join(base).join(target);
    let mut out = PathBuf::new();
    for c in raw.components() {
        match c {
            Component::CurDir => {}
            Component::ParentDir => {
                out.pop();
            }
            other => out.push(other.as_os_str()),
        }
    }
    out
}
pub fn is_foreign_platform_path(path: &str, windows_gateway: bool) -> bool {
    let b = path.as_bytes();
    let win =
        b.len() >= 3 && b[0].is_ascii_alphabetic() && b[1] == b':' && matches!(b[2], b'/' | b'\\');
    if windows_gateway {
        path.starts_with('/') && !win
    } else {
        win
    }
}
fn platform() -> &'static str {
    match std::env::consts::OS {
        "windows" => "win32",
        "macos" => "darwin",
        other => other,
    }
}
pub struct FileSystemContext<'a> {
    pub session_id: &'a str,
    pub project_root: &'a str,
}
#[derive(Clone)]
pub struct FileSystemResolver {
    cwd: PathBuf,
    lane: BlockingLane,
}
impl FileSystemResolver {
    pub fn new(cwd: PathBuf, lane: BlockingLane) -> Result<Self, String> {
        if !cwd.is_absolute() {
            return Err(
                "Filesystem resolver requires an explicit absolute working directory".into(),
            );
        }
        Ok(Self { cwd, lane })
    }
    pub async fn is_gateway_local_path_outside_project(
        &self,
        target: &str,
        project_root: Option<&str>,
    ) -> Result<bool, String> {
        if !Path::new(target).is_absolute() || is_foreign_platform_path(target, cfg!(windows)) {
            return Ok(false);
        }
        let path = target.to_string();
        let exists = self
            .lane
            .run(move || std::fs::metadata(path).is_ok())
            .await
            .map_err(|e| e.to_string())?;
        if !exists {
            return Ok(false);
        }
        let Some(root) = project_root.filter(|s| !s.is_empty()) else {
            return Ok(true);
        };
        let target = normalized(target);
        let root = normalized(root);
        Ok(target != root && !target.starts_with(&(root + "/")))
    }
    async fn derive_root(&self, target: PathBuf) -> Result<PathBuf, String> {
        self.lane
            .run(move || {
                if std::fs::metadata(&target).is_ok_and(|i| i.is_dir()) {
                    target
                } else {
                    target.parent().unwrap_or(&target).to_path_buf()
                }
            })
            .await
            .map_err(|e| e.to_string())
    }
    pub async fn get_fs(
        &self,
        registry: &SurfaceRegistry,
        context: &FileSystemContext<'_>,
        target: Option<&str>,
    ) -> Result<SurfaceRef, String> {
        let target = target.filter(|s| !s.is_empty());
        let fs_id = format!("fs-{}", context.session_id);
        let remote_surfaces: Vec<_> = registry
            .by_session(context.session_id)
            .into_iter()
            .filter(|s| remote(s).is_some() && running(s))
            .collect();
        if !remote_surfaces.is_empty()
            && !(if let Some(target) = target {
                self.is_gateway_local_path_outside_project(target, Some(context.project_root))
                    .await?
            } else {
                false
            })
        {
            if let Some(target) = target
                && let Some(covered) = most_specific(&remote_surfaces, target, true)?
            {
                return Ok(covered);
            }
            return Ok(remote_surfaces
                .iter()
                .find(|s| s.id() == fs_id)
                .unwrap_or(&remote_surfaces[0])
                .clone());
        }
        if let Some(target) = target
            && is_foreign_platform_path(target, cfg!(windows))
        {
            return Err(format!(
                "Path \"{target}\" belongs to a different platform than the gateway ({}) and no remote node surface is available for this session. Open the project on its device first via /api/project/open.",
                platform()
            ));
        }
        if let Some(target) = target {
            let abs_target = absolute(
                &self.cwd,
                Path::new(context.project_root),
                Path::new(target),
            );
            let conventional = registry.surface(&fs_id);
            let mut candidates: Vec<_> = conventional
                .iter()
                .filter(|s| running(s))
                .cloned()
                .collect();
            for s in registry.by_session(context.session_id) {
                if local(&s).is_some()
                    && running(&s)
                    && conventional
                        .as_ref()
                        .is_none_or(|c| !std::sync::Arc::ptr_eq(c, &s))
                {
                    candidates.push(s);
                }
            }
            if let Some(best) = most_specific(&candidates, &abs_target.to_string_lossy(), false)? {
                return Ok(best);
            }
            if Path::new(target).is_absolute() {
                let root = self.derive_root(abs_target).await?;
                let safe = root
                    .to_string_lossy()
                    .replace([':', '\\', '/'], "_")
                    .trim_end_matches('_')
                    .to_lowercase();
                let id = format!("fs-{}-{safe}", context.session_id);
                if let Some(existing) = registry.surface(&id)
                    && running(&existing)
                {
                    return Ok(existing);
                }
                return registry
                    .start_surface(
                        "filesystem",
                        &id,
                        SurfaceStartInput {
                            session_id: context.session_id.into(),
                            project_root: root.to_string_lossy().to_string(),
                            node_id: None,
                            properties: Default::default(),
                        },
                    )
                    .await;
            }
        }
        if let Some(conventional) = registry.surface(&fs_id)
            && running(&conventional)
        {
            return Ok(conventional);
        }
        if let Some(existing) = registry
            .by_session(context.session_id)
            .into_iter()
            .find(|s| local(s).is_some() && running(s))
        {
            return Ok(existing);
        }
        registry
            .start_surface(
                "filesystem",
                &fs_id,
                SurfaceStartInput {
                    session_id: context.session_id.into(),
                    project_root: context.project_root.into(),
                    node_id: None,
                    properties: Default::default(),
                },
            )
            .await
    }
    pub fn resolve_project_root(
        &self,
        registry: &SurfaceRegistry,
        session: &str,
        fallback: Option<&str>,
    ) -> Result<String, String> {
        let surfaces = registry.by_session(session);
        let has_remote = surfaces.iter().any(|s| remote(s).is_some() && running(s));
        let mut best = None;
        let mut best_len = None;
        for s in surfaces {
            if has_remote && remote(&s).is_none() {
                continue;
            }
            if (local(&s).is_some() || remote(&s).is_some())
                && running(&s)
                && let Some(root) = surface_root(&s)?
                && !root.is_empty()
            {
                let len = root.encode_utf16().count();
                if best_len.is_none_or(|old| len > old) {
                    best = Some(root);
                    best_len = Some(len);
                }
            }
        }
        Ok(best.unwrap_or_else(|| {
            fallback
                .map(crate::text::js_trim)
                .map(str::to_string)
                .unwrap_or_else(|| self.cwd.to_string_lossy().to_string())
        }))
    }
}
