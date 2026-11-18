//! Project/repository assignment on the database worker. Git probing and event
//! delivery are injected boundaries; metadata checks use the real filesystem.
use super::{
    projects::{ProjectRecord, ProjectService, repository_id},
    repositories::{CreateRepository, RepositoryPatch, RepositoryRecord, RepositoryService},
    users::Patch,
};
use crate::text::js_trim;
use serde::Serialize;
use std::path::Path;

pub trait RepositoryGit {
    fn status(&mut self, root: &str) -> Result<(Option<String>, Option<String>), String>;
    fn preferred_remote(
        &mut self,
        root: &str,
        branch: Option<&str>,
    ) -> Result<Option<String>, String>;
    fn remote_url(&mut self, root: &str, remote: &str) -> Result<Option<String>, String>;
    fn default_branch(&mut self, root: &str, remote: Option<&str>) -> Result<String, String>;
}
#[derive(Debug)]
pub enum AssignmentError {
    Rejected(&'static str, &'static str),
    Database(rusqlite::Error),
}
impl From<rusqlite::Error> for AssignmentError {
    fn from(error: rusqlite::Error) -> Self {
        Self::Database(error)
    }
}
#[derive(Serialize)]
pub struct Assignment {
    pub project: ProjectRecord,
    pub repo: RepositoryRecord,
    pub assigned: bool,
    pub skipped: bool,
    pub created: bool,
}
pub fn project_has_git_metadata(root: Option<&str>) -> bool {
    root.map(js_trim)
        .filter(|s| !s.is_empty())
        .is_some_and(|root| {
            std::fs::metadata(Path::new(root).join(".git")).is_ok_and(|m| m.is_dir() || m.is_file())
        })
}
pub fn should_auto_claim_repository_for_node(path: &str, platform: &str) -> bool {
    if Path::new(path).exists() {
        return false;
    }
    let p = path.as_bytes();
    let windows =
        p.len() >= 3 && p[0].is_ascii_alphabetic() && p[1] == b':' && matches!(p[2], b'/' | b'\\');
    windows == (platform == "windows")
}
pub struct ProjectRepositoryAssignments<'a, G, E> {
    pub projects: &'a ProjectService<'a>,
    pub repositories: &'a RepositoryService<'a>,
    pub git: G,
    /// Called at the same points as the reference's broadcastAll. The transport
    /// owns envelope timestamps and serialization; this boundary owns order.
    pub emit: E,
}
impl<G: RepositoryGit, E: FnMut(&str, &RepositoryRecord)> ProjectRepositoryAssignments<'_, G, E> {
    fn reconcile(
        &mut self,
        project: &ProjectRecord,
        repo: RepositoryRecord,
    ) -> Result<RepositoryRecord, AssignmentError> {
        if project.node_id.as_deref() != Some("gateway")
            || repo.device_id.is_none()
            || Some(repo.local_path.as_str()) != project.root_path.as_deref().map(js_trim)
            || !project_has_git_metadata(project.root_path.as_deref())
        {
            return Ok(repo);
        }
        let updated = self
            .repositories
            .update(
                &repo.id,
                RepositoryPatch {
                    device_id: Patch::Set(None),
                    ..Default::default()
                },
            )?
            .unwrap_or(repo);
        (self.emit)("updated", &updated);
        Ok(updated)
    }
    pub fn assign(
        &mut self,
        project_id: &str,
        user: Option<&str>,
        requested_repo: Option<&str>,
    ) -> Result<Assignment, AssignmentError> {
        let project = self
            .projects
            .get(project_id, user)?
            .ok_or(AssignmentError::Rejected(
                "PROJECT_NOT_FOUND",
                "Project not found.",
            ))?;
        let requested = requested_repo.map(js_trim).filter(|s| !s.is_empty());
        if let Some(id) = requested {
            let repo = self
                .repositories
                .get(id)?
                .filter(|r| {
                    user.filter(|s| !s.is_empty())
                        .is_none_or(|u| r.user_id.as_deref() == Some(u))
                })
                .ok_or(AssignmentError::Rejected(
                    "REPOSITORY_NOT_FOUND",
                    "Repository not found.",
                ))?;
            let repo = self.reconcile(&project, repo)?;
            if repository_id(Some(&project)).as_deref() == Some(&repo.id) {
                return Ok(Assignment {
                    project,
                    repo,
                    assigned: false,
                    skipped: true,
                    created: false,
                });
            }
            let updated = self
                .projects
                .assign_repository(&project.id, &repo.id, user)?
                .ok_or(AssignmentError::Rejected(
                    "PROJECT_NOT_FOUND",
                    "Project not found.",
                ))?;
            (self.emit)("updated", &repo);
            return Ok(Assignment {
                project: updated,
                repo,
                assigned: true,
                skipped: false,
                created: false,
            });
        }
        let root = project
            .root_path
            .as_deref()
            .map(js_trim)
            .filter(|s| !s.is_empty())
            .ok_or(AssignmentError::Rejected(
                "PROJECT_HAS_NO_ROOT",
                "Project has no folder path.",
            ))?;
        if let Some(id) = repository_id(Some(&project))
            && let Some(repo) = self.repositories.get(&id)?.filter(|r| {
                user.filter(|s| !s.is_empty())
                    .is_none_or(|u| r.user_id.as_deref() == Some(u))
            })
        {
            let repo = self.reconcile(&project, repo)?;
            return Ok(Assignment {
                project,
                repo,
                assigned: false,
                skipped: true,
                created: false,
            });
        }
        if !project_has_git_metadata(Some(root)) {
            return Err(AssignmentError::Rejected(
                "PROJECT_NOT_GIT",
                "Project folder does not contain .git.",
            ));
        }
        let owner = project.user_id.as_deref().or(user);
        let existing = self.repositories.find_by_path(root, owner)?;
        let created = existing.is_none();
        let repo = if let Some(repo) = existing {
            self.reconcile(&project, repo)?
        } else {
            let (branch, mut remote) = self.git.status(root).unwrap_or_default();
            if let Ok(Some(name)) = self.git.preferred_remote(root, branch.as_deref())
                && !name.is_empty()
                && let Ok(url) = self.git.remote_url(root, &name)
            {
                remote = url;
            }
            let default_branch = self
                .git
                .default_branch(root, remote.as_deref())
                .unwrap_or_else(|_| branch.unwrap_or_else(|| "main".into()));
            let stripped = root.trim_end_matches(['/', '\\']);
            let folder = stripped
                .rsplit('/')
                .next()
                .filter(|s| !s.is_empty())
                .unwrap_or(root);
            let repo = self.repositories.create(CreateRepository {
                name: project
                    .title
                    .as_deref()
                    .map(js_trim)
                    .filter(|s| !s.is_empty())
                    .unwrap_or(folder)
                    .into(),
                local_path: root.into(),
                user_id: owner.map(str::to_string),
                device_id: project
                    .node_id
                    .as_deref()
                    .filter(|s| !s.is_empty() && *s != "gateway")
                    .map(str::to_string),
                default_branch: Some(default_branch),
                github_url: remote.filter(|s| !s.is_empty()),
                forge_url: None,
            })?;
            (self.emit)("created", &repo);
            repo
        };
        let updated = self
            .projects
            .assign_repository(&project.id, &repo.id, user)?
            .ok_or(AssignmentError::Rejected(
                "PROJECT_NOT_FOUND",
                "Project not found.",
            ))?;
        if !created {
            (self.emit)("updated", &repo);
        }
        Ok(Assignment {
            project: updated,
            repo,
            assigned: true,
            skipped: false,
            created,
        })
    }
    pub fn auto_assign(&mut self, user: Option<&str>) -> Result<Vec<Assignment>, AssignmentError> {
        let mut assignments = Vec::new();
        for project in self.projects.list(Some("active"), user, None)? {
            let owner = project.user_id.as_deref().or(user);
            if let Some(id) = repository_id(Some(&project))
                && let Some(repo) = self.repositories.get(&id)?
                && owner
                    .filter(|s| !s.is_empty())
                    .is_none_or(|u| repo.user_id.as_deref() == Some(u))
            {
                if let Ok(assignment) = self.assign(&project.id, owner, None) {
                    assignments.push(assignment);
                }
                continue;
            }
            if project_has_git_metadata(project.root_path.as_deref())
                && let Ok(assignment) = self.assign(&project.id, owner, None)
            {
                assignments.push(assignment);
            }
        }
        Ok(assignments)
    }
}
