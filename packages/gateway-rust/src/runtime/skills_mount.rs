//! Production skills registry for the composed application.
//!
//! Discovery mirrors the Node scan order (bundled, user, project) and is repeated on demand
//! (throttled), so skills added or removed on disk need no restart. Enabled flags are in-memory,
//! as in the Node registry, and survive rescans. Tool installation runs a package manager and therefore needs a
//! consent-gated authority that is not wired yet; that route fails closed instead.
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

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
    // Match the gateway's optional sibling OpenClaw scan and source precedence.
    // The existing scanner still enforces its no-follow and size boundaries.
    if let Some(parent) = project_root.parent() {
        let openclaw = parent.join("openclaw");
        let sibling = openclaw.join("skills");
        let real_directory = |path: &Path| {
            std::fs::symlink_metadata(path).is_ok_and(|metadata| metadata.file_type().is_dir())
        };
        if real_directory(&openclaw) && real_directory(&sibling) {
            dirs.push((sibling, SkillSource::Bundled));
        }
    }
    if let Some(extra) = std::env::var_os("OPENCLAW_SKILLS_DIR").filter(|value| !value.is_empty()) {
        dirs.push((PathBuf::from(extra), SkillSource::Bundled));
    }
    dirs
}

/// Minimum time between filesystem rescans, so a burst of API calls costs one scan.
const RESCAN_INTERVAL: Duration = Duration::from_secs(2);

/// Live view of the skills directories. Every read first refreshes a stale snapshot, so skills
/// added, edited or removed on disk appear without a gateway restart. Explicit enable/disable
/// choices survive rescans.
struct LiveSkills {
    dirs: Vec<(PathBuf, SkillSource)>,
    records: Vec<(String, SkillRecord)>,
    enabled: HashMap<String, bool>,
    scanned: Option<Instant>,
}

impl LiveSkills {
    fn refresh_if_stale(&mut self) {
        if self
            .scanned
            .is_some_and(|at| at.elapsed() < RESCAN_INTERVAL)
        {
            return;
        }
        let mut registry = SkillRegistry::default();
        if let Err(error) = registry.discover(&self.dirs, &ProcessCancellation::default()) {
            // Keep serving the last complete snapshot rather than an empty list.
            eprintln!("skills: discovery failed: {error}");
            self.scanned = Some(Instant::now());
            return;
        }
        self.records = registry
            .list()
            .iter()
            .filter_map(|skill| {
                let mut value = serde_json::to_value(skill).ok()?;
                if let Some(enabled) = self.enabled.get(&skill.id) {
                    value["enabled"] = serde_json::json!(enabled);
                }
                Some((skill.id.clone(), Arc::new(Mutex::new(value))))
            })
            .collect();
        self.scanned = Some(Instant::now());
    }

    fn find(&mut self, id: &str) -> Option<SkillRecord> {
        self.refresh_if_stale();
        self.records
            .iter()
            .find(|(k, _)| k == id)
            .map(|(_, v)| v.clone())
    }
}

pub fn composed_skill_routes(
    auth: AuthState,
    project_root: &Path,
    home: &Path,
    state: Option<&str>,
) -> SkillRoutes {
    let live = Arc::new(Mutex::new(LiveSkills {
        dirs: scan_dirs(project_root, home, state),
        records: Vec::new(),
        enabled: HashMap::new(),
        scanned: None,
    }));
    let bins = Arc::new(Mutex::new(BinCache::new(
        &std::env::var_os("PATH").unwrap_or_default(),
        std::env::var("PATHEXT").ok().as_deref(),
    )));
    let find = {
        let live = live.clone();
        move |id: &str| live.lock().ok().and_then(|mut live| live.find(id))
    };
    let set_enabled_live = live.clone();
    SkillRoutes {
        auth,
        list: {
            let live = live.clone();
            Arc::new(move || {
                let mut live = live.lock().map_err(|_| "Skill registry lock poisoned")?;
                live.refresh_if_stale();
                Ok(live.records.iter().map(|(_, v)| v.clone()).collect())
            })
        },
        get: {
            let find = find.clone();
            Arc::new(move |id| Ok(find(id)))
        },
        set_enabled: Arc::new(move |id, enabled| {
            let mut live = set_enabled_live
                .lock()
                .map_err(|_| "Skill registry lock poisoned")?;
            let record = live.find(id).ok_or("Skill not found")?;
            record.lock().map_err(|_| "Skill record lock poisoned")?["enabled"] =
                serde_json::json!(enabled);
            live.enabled.insert(id.to_string(), enabled);
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
