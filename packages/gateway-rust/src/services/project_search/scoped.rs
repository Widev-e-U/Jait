//! Authenticated project/surface bindings for the existing native search engine.
//! No caller-provided root or node override is accepted. Remote I/O stays with the
//! runtime's existing node transport: prepare an exact request, then validate the
//! bounded response before returning it. This module does not grant node authority.
use super::{
    Budgets, Cancellation, ContentMatch, Error, FileMatch, ProjectRoot, ProjectSearch, Result,
    SearchMode, SearchOptions, SearchResult, candidate_limit, ranking,
};
use crate::{
    db::worker::DatabaseWorker,
    runtime::blocking::BlockingLane,
    services::{projects::ProjectService, sessions::SessionService},
    surfaces::{
        filesystem::FileSystemSurface,
        registry::{SurfaceRef, SurfaceRegistry, SurfaceState},
        remote_filesystem::RemoteFileSystemSurface,
    },
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{collections::HashSet, path::Path, sync::Arc};

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum SearchTarget {
    Project(String),
    Surface(String),
}

/// Unforgeable outside this module: the binding came from owner-scoped DB and
/// registry lookups, never from request-supplied filesystem metadata.
#[derive(Clone)]
pub struct SearchBinding {
    owner: String,
    target: SearchTarget,
    root: String,
    node: String,
    surface: Option<SurfaceRef>,
    session: Option<String>,
}
impl SearchBinding {
    pub fn target(&self) -> &SearchTarget {
        &self.target
    }
    pub fn owner(&self) -> &str {
        &self.owner
    }
    pub fn node(&self) -> &str {
        &self.node
    }
    pub fn is_local(&self) -> bool {
        self.node == "gateway"
    }
}

/// Only the existing authorized node transport may execute this request. Its
/// destination must enforce the same pinned root and node scope. The host must
/// keep its own admission, timeout, cancellation and frame-byte limits intact.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteSearchRequest {
    pub node_id: String,
    pub operation: &'static str,
    pub args: Value,
    pub timeout_ms: u64,
    pub max_response_bytes: usize,
}

#[derive(Clone)]
pub struct ScopedProjectSearch {
    db: DatabaseWorker,
    surfaces: SurfaceRegistry,
    lane: BlockingLane,
    engine: ProjectSearch,
}
impl ScopedProjectSearch {
    pub fn new(db: DatabaseWorker, surfaces: SurfaceRegistry, lane: BlockingLane) -> Self {
        Self {
            db,
            surfaces,
            engine: ProjectSearch::new(lane.clone()),
            lane,
        }
    }

    pub async fn bind(&self, owner: &str, target: SearchTarget) -> Result<SearchBinding> {
        let id = match &target {
            SearchTarget::Project(id) | SearchTarget::Surface(id) => id,
        };
        if owner.is_empty() || owner.len() > 256 || id.is_empty() || id.len() > 256 {
            return Err(Error::Input("owned project or surface is required".into()));
        }
        match &target {
            SearchTarget::Project(id) => {
                let owner_copy = owner.to_string();
                let id = id.clone();
                let resolved = self
                    .db
                    .run(move |db| {
                        let projects = ProjectService::new(db);
                        let mut current = id;
                        let mut seen = HashSet::new();
                        let mut selected_node: Option<String> = None;
                        for _ in 0..64 {
                            if !seen.insert(current.clone()) {
                                return Ok(None);
                            }
                            let Some(record) = projects.get(&current, Some(&owner_copy))? else {
                                return Ok(None);
                            };
                            if record.user_id.as_deref() != Some(owner_copy.as_str())
                                || matches!(record.status.as_deref(), Some("deleted" | "archived"))
                            {
                                return Ok(None);
                            }
                            let node = record.node_id.as_deref().filter(|v| !v.is_empty());
                            if let Some(node) = node {
                                if selected_node.as_deref().is_some_and(|prior| prior != node) {
                                    return Ok(None);
                                }
                                selected_node = Some(node.to_string());
                            }
                            if let Some(root) = record.root_path.filter(|v| !v.trim().is_empty()) {
                                let node = node.unwrap_or("gateway").to_string();
                                if selected_node
                                    .as_ref()
                                    .is_some_and(|selected| selected != &node)
                                {
                                    return Ok(None);
                                }
                                return Ok(Some((root, node)));
                            }
                            let Some(parent) = record.parent_id else {
                                return Ok(None);
                            };
                            current = parent;
                        }
                        Ok(None)
                    })
                    .await
                    .map_err(|_| Error::Input("owned project lookup failed".into()))?;
                let (root, node) = resolved.ok_or_else(|| {
                    Error::Input("owned project has no unambiguous execution root".into())
                })?;
                Ok(SearchBinding {
                    owner: owner.into(),
                    target,
                    root,
                    node,
                    surface: None,
                    session: None,
                })
            }
            SearchTarget::Surface(id) => {
                let (surface, recorded_owner) =
                    self.surfaces.surface_with_owner(id).ok_or_else(|| {
                        Error::Input("owned filesystem surface is unavailable".into())
                    })?;
                if recorded_owner.as_deref() != Some(owner) {
                    return Err(Error::Excluded);
                }
                let snapshot = surface.snapshot().map_err(|_| Error::Excluded)?;
                if snapshot.state != SurfaceState::Running || snapshot.session_id.is_empty() {
                    return Err(Error::Excluded);
                }
                let any = surface.as_ref() as &dyn std::any::Any;
                let local = any.is::<FileSystemSurface>();
                let remote = any.is::<RemoteFileSystemSurface>();
                if !local && !remote {
                    return Err(Error::Unsupported);
                }
                let root = snapshot
                    .metadata
                    .get("projectRoot")
                    .and_then(Value::as_str)
                    .filter(|v| !v.is_empty())
                    .ok_or(Error::Excluded)?
                    .to_string();
                let node = if local {
                    "gateway".to_string()
                } else {
                    snapshot
                        .metadata
                        .get("nodeId")
                        .and_then(Value::as_str)
                        .filter(|v| !v.is_empty() && *v != "gateway")
                        .ok_or(Error::Excluded)?
                        .to_string()
                };
                let session = snapshot.session_id;
                let db_session = session.clone();
                let db_owner = owner.to_string();
                let owned = self
                    .db
                    .run(move |db| {
                        Ok(SessionService::new(db)
                            .get(&db_session, Some(&db_owner))?
                            .is_some_and(|session| {
                                session.user_id.as_deref() == Some(db_owner.as_str())
                                    && session.status.as_deref() != Some("deleted")
                            }))
                    })
                    .await
                    .map_err(|_| Error::Excluded)?;
                if !owned {
                    return Err(Error::Excluded);
                }
                let binding = SearchBinding {
                    owner: owner.into(),
                    target,
                    root,
                    node,
                    surface: Some(surface),
                    session: Some(session),
                };
                self.check_surface(&binding)?;
                Ok(binding)
            }
        }
    }

    fn check_surface(&self, binding: &SearchBinding) -> Result<()> {
        let Some(expected) = &binding.surface else {
            return Ok(());
        };
        let SearchTarget::Surface(id) = &binding.target else {
            return Err(Error::Excluded);
        };
        if !self
            .surfaces
            .surface_with_owner(id)
            .is_some_and(|(current, owner)| {
                Arc::ptr_eq(&current, expected) && owner.as_deref() == Some(binding.owner.as_str())
            })
        {
            return Err(Error::Excluded);
        }
        let snapshot = expected.snapshot().map_err(|_| Error::Excluded)?;
        if snapshot.state != SurfaceState::Running
            || Some(snapshot.session_id.as_str()) != binding.session.as_deref()
            || snapshot.metadata.get("projectRoot").and_then(Value::as_str)
                != Some(binding.root.as_str())
            || (!binding.is_local()
                && snapshot.metadata.get("nodeId").and_then(Value::as_str)
                    != Some(binding.node.as_str()))
        {
            return Err(Error::Excluded);
        }
        Ok(())
    }

    pub async fn revalidate(&self, binding: &SearchBinding) -> Result<()> {
        let current = self.bind(&binding.owner, binding.target.clone()).await?;
        if current.root != binding.root
            || current.node != binding.node
            || current.session != binding.session
            || match (&binding.surface, &current.surface) {
                (Some(a), Some(b)) => !Arc::ptr_eq(a, b),
                (None, None) => false,
                _ => true,
            }
        {
            return Err(Error::Excluded);
        }
        Ok(())
    }

    /// Open on the shared blocking lane and retain the same concrete surface
    /// instance and path policy at every traversal/read, including ignore files.
    pub async fn open_local(&self, binding: &SearchBinding) -> Result<ProjectRoot> {
        self.revalidate(binding).await?;
        if !binding.is_local() {
            return Err(Error::Unsupported);
        }
        let binding = binding.clone();
        let registry = self.surfaces.clone();
        self.lane
            .run(move || {
                let mut root = ProjectRoot::open(Path::new(&binding.root))?;
                if let Some(surface) = binding.surface {
                    let SearchTarget::Surface(id) = binding.target else {
                        return Err(Error::Excluded);
                    };
                    let owner = binding.owner;
                    let expected_session = binding.session;
                    let expected_root = binding.root;
                    root = root.with_access(Arc::new(move |path| {
                        let same = registry.surface_with_owner(&id).is_some_and(
                            |(current, actual_owner)| {
                                Arc::ptr_eq(&current, &surface)
                                    && actual_owner.as_deref() == Some(owner.as_str())
                            },
                        );
                        if !same {
                            return false;
                        }
                        let Ok(snapshot) = surface.snapshot() else {
                            return false;
                        };
                        if snapshot.state != SurfaceState::Running
                            || Some(snapshot.session_id.as_str()) != expected_session.as_deref()
                            || snapshot.metadata.get("projectRoot").and_then(Value::as_str)
                                != Some(expected_root.as_str())
                        {
                            return false;
                        }
                        let any = surface.as_ref() as &dyn std::any::Any;
                        any.downcast_ref::<FileSystemSurface>().is_some_and(|fs| {
                            path.to_str().is_some_and(|path| fs.is_path_allowed(path))
                        })
                    }));
                }
                root.check_identity()?;
                Ok(root)
            })
            .await
            .map_err(Error::Io)?
    }

    pub async fn search_local(
        &self,
        binding: &SearchBinding,
        options: SearchOptions,
        budgets: Budgets,
        cancel: Cancellation,
    ) -> Result<SearchResult> {
        if cancel.is_cancelled() {
            return Err(Error::Cancelled);
        }
        super::validate(&options, &budgets)?;
        let root = self.open_local(binding).await?;
        let result = self
            .engine
            .search(root, options, budgets, cancel.clone())
            .await?;
        if cancel.is_cancelled() {
            return Err(Error::Cancelled);
        }
        self.revalidate(binding).await?;
        Ok(result)
    }

    pub async fn remote_request(
        &self,
        binding: &SearchBinding,
        options: &SearchOptions,
        budgets: &Budgets,
    ) -> Result<RemoteSearchRequest> {
        let limit = super::validate(options, budgets)?;
        self.revalidate(binding).await?;
        if binding.is_local() {
            return Err(Error::Input("remote execution binding is required".into()));
        }
        if binding.root.len() > 4096 || binding.root.contains('\0') || binding.node.len() > 256 {
            return Err(Error::Excluded);
        }
        Ok(RemoteSearchRequest {
            node_id: binding.node.clone(),
            operation: "search-project",
            args: json!({"path":binding.root,"query":options.query,"mode":options.mode,
                "limit":candidate_limit(limit),"include":options.include,"isRegexp":options.is_regexp,
                "includeIgnoredFiles":options.include_ignored_files}),
            timeout_ms: budgets.duration.as_millis() as u64,
            max_response_bytes: budgets.max_output_bytes,
        })
    }

    /// Accept bytes only after the transport's own bounded frame reader. Limits
    /// are checked before JSON decoding; paths and fields remain untrusted.
    pub async fn accept_remote(
        &self,
        binding: &SearchBinding,
        options: &SearchOptions,
        budgets: &Budgets,
        bytes: &[u8],
        cancel: &Cancellation,
    ) -> Result<SearchResult> {
        let limit = super::validate(options, budgets)?;
        if cancel.is_cancelled() {
            return Err(Error::Cancelled);
        }
        self.revalidate(binding).await?;
        if binding.is_local() || bytes.len() > budgets.max_output_bytes {
            return Err(Error::Excluded);
        }
        #[derive(Deserialize)]
        struct HitFile {
            path: String,
        }
        #[derive(Deserialize)]
        struct HitContent {
            file: String,
            line: usize,
            content: String,
        }
        #[derive(Deserialize)]
        struct Reply {
            #[serde(default)]
            limited: bool,
            #[serde(default)]
            files: Vec<HitFile>,
            #[serde(default)]
            matches: Vec<HitContent>,
        }
        let reply: Reply = serde_json::from_slice(bytes)
            .map_err(|_| Error::Input("invalid remote search response".into()))?;
        if reply.files.len().saturating_add(reply.matches.len()) > candidate_limit(limit) {
            return Err(Error::Input(
                "remote search candidate limit exceeded".into(),
            ));
        }
        let path = |value: String| -> Result<String> {
            let value = value.replace('\\', "/");
            if value.is_empty()
                || value.len() > 4096
                || value.contains(':')
                || value.chars().any(char::is_control)
                || value.starts_with('/')
                || value
                    .split('/')
                    .any(|c| c.is_empty() || c == "." || c == "..")
            {
                return Err(Error::Excluded);
            }
            Ok(value)
        };
        let operation = super::Operation::new(budgets.duration, cancel);
        let mut result = match options.mode {
            SearchMode::Files => {
                if !reply.matches.is_empty() {
                    return Err(Error::Input("unexpected remote content results".into()));
                }
                let mut paths = Vec::new();
                for hit in reply.files {
                    operation.check()?;
                    paths.push(path(hit.path)?);
                }
                let limited = reply.limited || paths.len() > limit;
                SearchResult::Files {
                    query: options.query.clone(),
                    limited,
                    files: ranking::rank_file_paths(
                        &paths,
                        options.query.trim(),
                        limit,
                        options.is_regexp,
                    )
                    .into_iter()
                    .map(|hit| FileMatch {
                        path: hit.relative_path.clone(),
                        name: hit
                            .relative_path
                            .rsplit('/')
                            .next()
                            .unwrap_or_default()
                            .to_string(),
                        relative_path: hit.relative_path,
                        score: hit.score,
                    })
                    .collect(),
                }
            }
            SearchMode::Content => {
                if !reply.files.is_empty() {
                    return Err(Error::Input("unexpected remote file results".into()));
                }
                let mut matches = Vec::new();
                for hit in reply.matches {
                    operation.check()?;
                    if hit.line == 0 || hit.line > u32::MAX as usize {
                        return Err(Error::Input("invalid remote line".into()));
                    }
                    let relative_path = path(hit.file)?;
                    matches.push(ContentMatch {
                        file: relative_path.clone(),
                        relative_path,
                        line: hit.line,
                        content: ranking::truncate_content(&hit.content),
                        score: 0,
                    });
                }
                let limited = reply.limited || matches.len() > limit;
                ranking::rank_content_matches(&mut matches, options.query.trim(), limit);
                SearchResult::Content {
                    query: options.query.clone(),
                    matches,
                    limited,
                }
            }
        };
        result.bound_output(budgets.max_output_bytes, &operation)?;
        operation.check()?;
        self.revalidate(binding).await?;
        if cancel.is_cancelled() {
            return Err(Error::Cancelled);
        }
        Ok(result)
    }
}
