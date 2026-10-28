//! Native planning from packages/gateway/src/services/preview-runner.ts.
//! Metadata comes from the host's existing scoped filesystem service. Selecting
//! a command does not grant permission to execute it or connect to its URL.
use serde_json::Value;
use std::{collections::HashSet, path::PathBuf};
use url::Url;
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PackageManager {
    Bun,
    Pnpm,
    Npm,
}
impl PackageManager {
    pub fn name(self) -> &'static str {
        match self {
            Self::Bun => "bun",
            Self::Pnpm => "pnpm",
            Self::Npm => "npm",
        }
    }
    fn exec(self, program: &str, args: &[&str]) -> String {
        let prefix = match self {
            Self::Bun => "bun run",
            Self::Pnpm => "pnpm exec",
            Self::Npm => "npm exec --",
        };
        format!(
            "{prefix} {program}{}",
            if args.is_empty() {
                String::new()
            } else {
                format!(" {}", args.join(" "))
            }
        )
    }
}
#[derive(Clone, Debug)]
pub struct ProjectSnapshot {
    pub root: PathBuf,
    pub package: Option<Value>,
    pub files: HashSet<String>,
    /// Closest directory first, terminating at the approved ancestor boundary.
    pub ancestor_locks: Vec<HashSet<String>>,
    /// Immediate apps/* candidates in filesystem order, each scoped to root.
    pub applications: Vec<ProjectSnapshot>,
}
pub fn detect_package_manager(snapshot: &ProjectSnapshot) -> PackageManager {
    for locks in std::iter::once(&snapshot.files).chain(snapshot.ancestor_locks.iter()) {
        if locks.contains("bun.lock") || locks.contains("bun.lockb") {
            return PackageManager::Bun;
        }
        if locks.contains("pnpm-lock.yaml") {
            return PackageManager::Pnpm;
        }
        if locks.contains("package-lock.json") {
            return PackageManager::Npm;
        }
    }
    PackageManager::Npm
}
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DetectedFramework {
    pub name: &'static str,
    pub dev_command: String,
    pub likely_port: u16,
}
pub fn detect_framework(
    snapshot: &ProjectSnapshot,
    hint: Option<&str>,
) -> Option<DetectedFramework> {
    let pm = detect_package_manager(snapshot);
    let hinted = hint.map(str::to_lowercase);
    let name = match hinted.as_deref() {
        Some("vite") => Some("vite"),
        Some("next" | "nextjs") => Some("next"),
        Some("nuxt" | "nuxtjs") => Some("nuxt"),
        Some("remix") => Some("remix"),
        Some("astro") => Some("astro"),
        _ => None,
    }
    .or_else(|| {
        [
            ("vite", &["vite.config.ts", "vite.config.js"][..]),
            (
                "next",
                &["next.config.ts", "next.config.js", "next.config.mjs"][..],
            ),
            ("nuxt", &["nuxt.config.ts", "nuxt.config.js"][..]),
            ("astro", &["astro.config.mjs", "astro.config.ts"][..]),
        ]
        .into_iter()
        .find(|(_, files)| files.iter().any(|f| snapshot.files.contains(*f)))
        .map(|(name, _)| name)
    })
    .or_else(|| {
        ["vite", "next", "nuxt", "astro", "@remix-run/dev"]
            .into_iter()
            .find(|name| {
                snapshot.package.as_ref().is_some_and(|p| {
                    p["dependencies"].get(*name).is_some()
                        || p["devDependencies"].get(*name).is_some()
                })
            })
            .map(|name| {
                if name == "@remix-run/dev" {
                    "remix"
                } else {
                    name
                }
            })
    })?;
    let dev_command = match name {
        "next" | "nuxt" | "astro" => pm.exec(name, &["dev"]),
        "remix" => format!("{} run dev", pm.name()),
        _ => pm.exec(name, &[]),
    };
    Some(DetectedFramework {
        name,
        dev_command,
        likely_port: match name {
            "vite" => 5173,
            "astro" => 4321,
            _ => 3000,
        },
    })
}
pub fn resolve_preview_project(snapshot: &ProjectSnapshot) -> Result<&ProjectSnapshot, String> {
    if snapshot
        .package
        .as_ref()
        .and_then(|p| p.get("workspaces"))
        .is_none()
        || detect_framework(snapshot, None).is_some()
    {
        return Ok(snapshot);
    }
    let candidates: Vec<_> = snapshot
        .applications
        .iter()
        .filter(|app| {
            app.package
                .as_ref()
                .and_then(|p| p["scripts"].get("dev"))
                .is_some_and(|v| !v.is_null() && v != false && v != "")
                && detect_framework(app, None).is_some()
        })
        .collect();
    match candidates.as_slice() {
        [] => Ok(snapshot),
        [app] => Ok(*app),
        _ => Err(format!(
            "Multiple frontend apps found: {}. Set projectRoot to the app to preview.",
            candidates
                .iter()
                .map(|app| app.root.display().to_string())
                .collect::<Vec<_>>()
                .join(", ")
        )),
    }
}
pub fn detect_preview_command(
    snapshot: &ProjectSnapshot,
    requested: Option<&str>,
    port: u16,
    hint: Option<&str>,
) -> Result<String, String> {
    if let Some(command) = requested.map(str::trim).filter(|v| !v.is_empty()) {
        return Ok(command.into());
    }
    let pm = detect_package_manager(snapshot);
    let number = port.to_string();
    if let Some(framework) = detect_framework(snapshot, hint) {
        return Ok(match framework.name {
            "vite" => pm.exec("vite", &["--host", "0.0.0.0", "--port", &number]),
            "next" => pm.exec("next", &["dev", "--hostname", "0.0.0.0", "--port", &number]),
            "nuxt" | "astro" => pm.exec(
                framework.name,
                &["dev", "--host", "0.0.0.0", "--port", &number],
            ),
            _ => format!("{} run dev", pm.name()),
        });
    }
    let package = snapshot
        .package
        .as_ref()
        .ok_or("No package.json found and no preview command was provided.")?;
    if package["scripts"]
        .get("preview")
        .is_some_and(|v| v.as_str().is_some_and(|s| !s.is_empty()))
    {
        return Ok(format!(
            "{} run preview -- --host 0.0.0.0 --port {port}",
            pm.name()
        ));
    }
    if package["scripts"]
        .get("dev")
        .is_some_and(|v| v.as_str().is_some_and(|s| !s.is_empty()))
    {
        return Ok(format!("{} run dev", pm.name()));
    }
    Err("Unable to detect a preview command. Provide one explicitly.".into())
}
pub fn normalize_target_url(target: &str, port: u16) -> Result<Url, String> {
    let target = target.trim();
    let text = if target.is_empty() {
        format!("http://127.0.0.1:{port}")
    } else if target.bytes().all(|c| c.is_ascii_digit()) {
        format!("http://127.0.0.1:{target}")
    } else if target.contains("://") {
        target.to_string()
    } else {
        format!("http://{target}")
    };
    let mut url = Url::parse(&text).map_err(|_| "Invalid preview URL")?;
    if !matches!(url.scheme(), "http" | "https")
        || !url.username().is_empty()
        || url.password().is_some()
        || url.host_str().is_none()
    {
        return Err("Invalid preview URL".into());
    }
    url.set_fragment(None);
    // Host approval, including DNS resolution and redirects, is separate.
    Ok(url)
}
#[cfg(test)]
mod tests {
    use super::*;
    fn snapshot(package: Value) -> ProjectSnapshot {
        ProjectSnapshot {
            root: "/approved/app".into(),
            package: Some(package),
            files: HashSet::new(),
            ancestor_locks: vec![],
            applications: vec![],
        }
    }
    #[test]
    fn configs_precede_dependencies_and_hints_precede_configs() {
        let mut s = snapshot(serde_json::json!({"dependencies":{"next":"1"}}));
        s.files.insert("vite.config.ts".into());
        assert_eq!(detect_framework(&s, None).unwrap().name, "vite");
        assert_eq!(detect_framework(&s, Some("astro")).unwrap().name, "astro");
        assert_eq!(
            detect_preview_command(&s, None, 5001, None).unwrap(),
            "npm exec -- vite --host 0.0.0.0 --port 5001"
        );
    }
    #[test]
    fn ancestor_locks_stop_at_closest_package_manager() {
        let mut s = snapshot(serde_json::json!({"scripts":{"dev":"x"}}));
        s.ancestor_locks = vec![
            HashSet::from(["pnpm-lock.yaml".into()]),
            HashSet::from(["bun.lock".into()]),
        ];
        assert_eq!(detect_package_manager(&s), PackageManager::Pnpm);
        assert_eq!(
            detect_preview_command(&s, Some("  custom $PORT  "), 4000, None).unwrap(),
            "custom $PORT"
        );
    }
    #[test]
    fn workspace_selection_reports_ambiguity() {
        let mut s = snapshot(serde_json::json!({"workspaces":["apps/*"]}));
        s.applications = vec![snapshot(
            serde_json::json!({"scripts":{"dev":"vite"},"dependencies":{"vite":"1"}}),
        )];
        assert_eq!(
            resolve_preview_project(&s).unwrap().root,
            s.applications[0].root
        );
        s.applications.push(s.applications[0].clone());
        assert!(
            resolve_preview_project(&s)
                .unwrap_err()
                .contains("Multiple frontend apps found")
        );
    }
    #[test]
    fn url_normalization_rejects_credentials_and_protocols() {
        assert_eq!(
            normalize_target_url(" 5173 ", 3000).unwrap().as_str(),
            "http://127.0.0.1:5173/"
        );
        assert!(normalize_target_url("file:///etc/passwd", 3000).is_err());
        assert!(normalize_target_url("https://user:secret@example.test", 3000).is_err());
    }
}
