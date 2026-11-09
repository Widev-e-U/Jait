//! Production skills registry for the composed application.
//!
//! Discovery mirrors the Node scan order (bundled, user, project). Enabled flags are in-memory,
//! as in the Node registry. Tool installation runs a package manager and therefore needs a
//! consent-gated authority that is not wired yet; that route fails closed instead.
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use crate::execution::process_runner::ProcessCancellation;
use crate::integrations::skills::{BinCache, Skill, SkillRegistry, SkillSource, user_skills_dir};
use crate::routes::auth::AuthState;
use crate::routes::skills::{SkillRecord, SkillRoutes, ToolStatus};

fn scan_dirs(project_root: &Path, home: &Path, state: Option<&str>) -> Vec<(PathBuf, SkillSource)> {
    let mut dirs = vec![(
        project_root.join("packages/gateway/skills"),
        SkillSource::Bundled,
    )];
    if let Ok(user) = user_skills_dir(home, state) {
        dirs.push((user, SkillSource::User));
    }
    dirs.push((project_root.join(".jait/skills"), SkillSource::Project));
    dirs.push((project_root.join(".agents/skills"), SkillSource::Project));
    if let Some(extra) = std::env::var_os("OPENCLAW_SKILLS_DIR") {
        dirs.push((PathBuf::from(extra), SkillSource::Bundled));
    }
    dirs
}

pub fn composed_skill_routes(
    auth: AuthState,
    project_root: &Path,
    home: &Path,
    state: Option<&str>,
) -> SkillRoutes {
    let mut registry = SkillRegistry::default();
    if let Err(error) = registry.discover(
        &scan_dirs(project_root, home, state),
        &ProcessCancellation::default(),
    ) {
        eprintln!("skills: discovery failed: {error}");
    }
    let records: Arc<Vec<(String, SkillRecord)>> = Arc::new(
        registry
            .list()
            .iter()
            .filter_map(|skill| {
                serde_json::to_value(skill)
                    .ok()
                    .map(|value| (skill.id.clone(), Arc::new(Mutex::new(value))))
            })
            .collect(),
    );
    let bins = Arc::new(Mutex::new(BinCache::new(
        &std::env::var_os("PATH").unwrap_or_default(),
        std::env::var("PATHEXT").ok().as_deref(),
    )));
    let find = {
        let records = records.clone();
        move |id: &str| {
            records
                .iter()
                .find(|(k, _)| k == id)
                .map(|(_, v)| v.clone())
        }
    };
    SkillRoutes {
        auth,
        list: {
            let records = records.clone();
            Arc::new(move || Ok(records.iter().map(|(_, v)| v.clone()).collect()))
        },
        get: {
            let find = find.clone();
            Arc::new(move |id| Ok(find(id)))
        },
        set_enabled: Arc::new(move |id, enabled| {
            let record = find(id).ok_or("Skill not found")?;
            record.lock().map_err(|_| "Skill record lock poisoned")?["enabled"] =
                serde_json::json!(enabled);
            Ok(())
        }),
        check_tools: Arc::new(move |value| {
            let skill: Skill = serde_json::from_value(value.clone()).map_err(|e| e.to_string())?;
            let status = bins
                .lock()
                .map_err(|_| "Bin cache lock poisoned")?
                .check(&skill);
            Ok(ToolStatus {
                satisfied: status.satisfied,
                missing: status.missing,
            })
        }),
        install_tool: Arc::new(|_, _| {
            Box::pin(async {
                Err("Skill tool installation is not enabled in the Rust gateway; install the required tools manually".into())
            })
        }),
    }
}
