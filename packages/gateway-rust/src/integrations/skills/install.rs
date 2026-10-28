//! Native skill mutation transactions. The caller supplies current authenticated
//! authority for the exact effect, a captured clock/config and shared admission.
//! Download and disk commit are separate phases so no registry lock spans I/O.
use super::{
    BinCache, MAX_SKILL_BYTES, Skill, SkillRegistry, SkillResult, SkillSource, cancelled,
    filesystem::Directory, parse_frontmatter,
};
use crate::{
    execution::process_runner::{ProcessCancellation, ProcessPool, ProcessRequest},
    integrations::clawhub::{ClawHubClient, decode_zip, validate_slug},
};
use serde::{Deserialize, Serialize};
use std::{
    path::{Path, PathBuf},
    time::Duration,
};
use url::Url;

/// Hosts implement this using their canonical consent/ownership executor. No
/// permissive implementation is provided. Check identity, expiry and exact
/// resource/arguments every time; markdown and origin files are untrusted.
pub trait SkillAuthority: Send + Sync {
    fn authorize(&self, effect: SkillEffect<'_>) -> SkillResult<()>;
}
#[derive(Debug)]
pub enum SkillEffect<'a> {
    RegistryRead {
        url: &'a Url,
        download: bool,
    },
    Install {
        root: &'a Path,
        slug: &'a str,
        version: &'a str,
    },
    Uninstall {
        root: &'a Path,
        slug: &'a str,
    },
    Write {
        root: &'a Path,
        id: &'a str,
        overwrite: bool,
    },
    InstallTool {
        skill_id: &'a str,
        request: &'a ProcessRequest,
    },
}
#[derive(Debug)]
pub struct DownloadedSkill {
    pub slug: String,
    pub version: String,
    pub registry: String,
    pub zip: Vec<u8>,
}
pub async fn download_clawhub_skill(
    client: &ClawHubClient,
    slug: &str,
    version: Option<&str>,
    authority: &dyn SkillAuthority,
    cancel: &ProcessCancellation,
) -> SkillResult<DownloadedSkill> {
    validate_slug(slug)?;
    let detail = client.get_skill(slug, authority, cancel).await?;
    let version = version
        .map(str::to_owned)
        .or_else(|| detail.latest_version.map(|v| v.version))
        .filter(|v| !v.is_empty())
        .ok_or_else(|| format!("No version found for skill '{slug}'"))?;
    let zip = client
        .download_skill(slug, Some(&version), authority, cancel)
        .await?;
    Ok(DownloadedSkill {
        slug: slug.to_owned(),
        version,
        registry: client.registry(),
        zip,
    })
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledSkillSummary {
    pub id: String,
    pub name: String,
    pub description: String,
    pub source: SkillSource,
    pub enabled: bool,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WrittenSkillSummary {
    pub id: String,
    pub name: String,
    pub file_path: PathBuf,
    pub created: bool,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UninstalledSkillSummary {
    pub removed: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cleanup_error: Option<String>,
}
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Origin {
    pub slug: String,
    pub version: String,
    pub registry: String,
    pub installed_at: u64,
}

pub struct SkillStore {
    root: PathBuf,
    directory: Directory,
}
struct Stage<'a> {
    root: &'a Directory,
    name: String,
    directory: Directory,
    published: bool,
}
struct TemporaryFile<'a> {
    directory: &'a Directory,
    name: String,
}
impl Drop for TemporaryFile<'_> {
    fn drop(&mut self) {
        let _ = self.directory.remove_file(&self.name);
    }
}
impl Drop for Stage<'_> {
    fn drop(&mut self) {
        if !self.published {
            let _ = self.root.remove_tree(&self.name, &mut 20000, 0);
        }
    }
}
impl<'a> Stage<'a> {
    fn new(root: &'a Directory) -> SkillResult<Self> {
        let name = format!(".jait-install-{}", uuid::Uuid::new_v4());
        let directory = root.create_child(&name).map_err(|e| e.to_string())?;
        Ok(Self {
            root,
            name,
            directory,
            published: false,
        })
    }
}
impl SkillStore {
    /// Host provisions the state/skills root under its existing consent path.
    /// Opening this object never creates paths or changes live configuration.
    pub fn open(root: PathBuf) -> SkillResult<Self> {
        let directory = Directory::open(&root).map_err(|e| e.to_string())?;
        directory.ensure_owned().map_err(|e| e.to_string())?;
        Ok(Self { root, directory })
    }
    pub fn root(&self) -> &Path {
        &self.root
    }
    /// Run under shared BlockingLane admission with exclusive registry ownership.
    /// Existing destinations are preserved; an update requires an explicit
    /// uninstall/reinstall until reviewed backup/replacement semantics exist.
    pub fn install_clawhub_skill(
        &self,
        registry: &mut SkillRegistry,
        downloaded: DownloadedSkill,
        installed_at: u64,
        authority: &dyn SkillAuthority,
        cancel: &ProcessCancellation,
    ) -> SkillResult<InstalledSkillSummary> {
        let DownloadedSkill {
            slug,
            version,
            registry: registry_url,
            zip,
        } = downloaded;
        validate_slug(&slug)?;
        if version.is_empty() || version.len() > 256 || version.chars().any(char::is_control) {
            return Err("Invalid ClawHub version".into());
        }
        ClawHubClient::new(Some(&registry_url))?;
        cancelled(cancel)?;
        authority.authorize(SkillEffect::Install {
            root: &self.root,
            slug: &slug,
            version: &version,
        })?;
        if self.directory.exists(&slug).map_err(|e| e.to_string())? {
            return Err(format!(
                "Skill '{slug}' already exists; refusing to overwrite"
            ));
        }
        let files = decode_zip(&zip, cancel)?;
        let document = files
            .iter()
            .find(|f| f.path == ["SKILL.md"])
            .ok_or("Archive does not contain a root SKILL.md")?;
        let content = std::str::from_utf8(&document.data).map_err(|_| "SKILL.md is not UTF-8")?;
        let skill = self.skill_from_content(&slug, content)?;
        // Ensure registry admission can succeed before disk publication.
        let mut updated = registry.clone();
        updated.add(skill.clone())?;
        cancelled(cancel)?;
        authority.authorize(SkillEffect::Install {
            root: &self.root,
            slug: &slug,
            version: &version,
        })?;
        let mut stage = Stage::new(&self.directory)?;
        for file in files {
            cancelled(cancel)?;
            authority.authorize(SkillEffect::Install {
                root: &self.root,
                slug: &slug,
                version: &version,
            })?;
            let (leaf, parents) = file.path.split_last().ok_or("Empty archive path")?;
            let mut nested: Option<Directory> = None;
            for parent in parents {
                nested = Some(
                    nested
                        .as_ref()
                        .unwrap_or(&stage.directory)
                        .child(parent, true)
                        .map_err(|e| e.to_string())?,
                );
            }
            nested
                .as_ref()
                .unwrap_or(&stage.directory)
                .write_new(leaf, &file.data)
                .map_err(|e| e.to_string())?;
        }
        cancelled(cancel)?;
        let origin = Origin {
            slug: slug.clone(),
            version: version.clone(),
            registry: registry_url,
            installed_at,
        };
        authority.authorize(SkillEffect::Install {
            root: &self.root,
            slug: &slug,
            version: &version,
        })?;
        let meta = stage
            .directory
            .create_child(".clawhub")
            .map_err(|e| e.to_string())?;
        meta.write_new(
            "origin.json",
            &serde_json::to_vec_pretty(&origin).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
        cancelled(cancel)?;
        authority.authorize(SkillEffect::Install {
            root: &self.root,
            slug: &slug,
            version: &version,
        })?;
        self.directory
            .rename(&stage.name, &self.directory, &slug, false)
            .map_err(|e| e.to_string())?;
        stage.published = true;
        *registry = updated;
        // Cancellation after atomic publication cannot undo a completed install.
        Ok(InstalledSkillSummary {
            id: skill.id,
            name: skill.name,
            description: skill.description,
            source: skill.source,
            enabled: skill.enabled,
        })
    }
    fn skill_from_content(&self, id: &str, content: &str) -> SkillResult<Skill> {
        let fm = parse_frontmatter(content)?;
        let name = fm
            .name
            .filter(|s| !s.is_empty())
            .ok_or("Skill has no frontmatter name")?;
        let description = fm
            .description
            .filter(|s| !s.is_empty())
            .ok_or("Skill has no frontmatter description")?;
        Ok(Skill {
            id: id.into(),
            name,
            description,
            file_path: self.root.join(id).join("SKILL.md"),
            source: SkillSource::User,
            enabled: true,
            requires: fm.requires,
            install: fm.install,
        })
    }
    pub fn uninstall_clawhub_skill(
        &self,
        registry: &mut SkillRegistry,
        slug: &str,
        authority: &dyn SkillAuthority,
        cancel: &ProcessCancellation,
    ) -> SkillResult<UninstalledSkillSummary> {
        validate_slug(slug)?;
        cancelled(cancel)?;
        authority.authorize(SkillEffect::Uninstall {
            root: &self.root,
            slug,
        })?;
        let skill = self
            .directory
            .child(slug, false)
            .map_err(|e| e.to_string())?;
        skill.ensure_owned().map_err(|e| e.to_string())?;
        let meta = skill
            .child(".clawhub", false)
            .map_err(|_| "Skill is not a ClawHub-installed skill (no origin metadata)")?;
        let origin: Origin = serde_json::from_slice(
            &meta
                .read("origin.json", 16384)
                .map_err(|_| "Skill has no valid origin metadata")?,
        )
        .map_err(|_| "Invalid ClawHub origin metadata")?;
        if origin.slug != slug || origin.version.is_empty() || origin.version.len() > 256 {
            return Err("ClawHub origin does not match installed skill".into());
        }
        ClawHubClient::new(Some(&origin.registry))?;
        cancelled(cancel)?;
        authority.authorize(SkillEffect::Uninstall {
            root: &self.root,
            slug,
        })?;
        let tombstone = format!(".jait-remove-{}", uuid::Uuid::new_v4());
        self.directory
            .rename(slug, &self.directory, &tombstone, false)
            .map_err(|e| e.to_string())?;
        let moved = self
            .directory
            .child(&tombstone, false)
            .map_err(|e| e.to_string())?;
        if !skill.same_as(&moved).map_err(|e| e.to_string())? {
            let restore = self
                .directory
                .rename(&tombstone, &self.directory, slug, false);
            return Err(format!(
                "Skill changed during uninstall; no files deleted (restore: {restore:?})"
            ));
        }
        registry.remove(slug);
        let cleanup_error = self
            .directory
            .remove_tree(&tombstone, &mut 20000, 0)
            .err()
            .map(|e| format!("Skill removed; retained cleanup directory {tombstone}: {e}"));
        Ok(UninstalledSkillSummary {
            removed: true,
            cleanup_error,
        })
    }
    pub fn write_user_skill(
        &self,
        registry: &mut SkillRegistry,
        params: WriteSkill<'_>,
        authority: &dyn SkillAuthority,
        cancel: &ProcessCancellation,
    ) -> SkillResult<WrittenSkillSummary> {
        let id = slugify_skill_id(params.id);
        if id.is_empty() {
            return Err(format!("'{}' does not make a usable skill id", params.id));
        }
        let content = render_skill_markdown(params.name, params.description, params.body)?;
        let skill = self.skill_from_content(&id, &content)?;
        let mut updated = registry.clone();
        updated.add(skill)?;
        cancelled(cancel)?;
        authority.authorize(SkillEffect::Write {
            root: &self.root,
            id: &id,
            overwrite: params.overwrite,
        })?;
        let exists = self.directory.exists(&id).map_err(|e| e.to_string())?;
        let created = if exists {
            let directory = self
                .directory
                .child(&id, false)
                .map_err(|e| e.to_string())?;
            directory.ensure_owned().map_err(|e| e.to_string())?;
            let existed = directory.exists("SKILL.md").map_err(|e| e.to_string())?;
            if existed && !params.overwrite {
                return Err(format!(
                    "Skill '{id}' already exists — pass overwrite to replace it"
                ));
            }
            if existed {
                directory
                    .read("SKILL.md", MAX_SKILL_BYTES)
                    .map_err(|e| e.to_string())?;
            }
            let temp = format!(".jait-write-{}", uuid::Uuid::new_v4());
            let _cleanup = TemporaryFile {
                directory: &directory,
                name: temp.clone(),
            };
            directory
                .write_new(&temp, content.as_bytes())
                .map_err(|e| e.to_string())?;
            let commit = (|| {
                cancelled(cancel)?;
                authority.authorize(SkillEffect::Write {
                    root: &self.root,
                    id: &id,
                    overwrite: params.overwrite,
                })?;
                directory
                    .rename(&temp, &directory, "SKILL.md", params.overwrite)
                    .map_err(|e| e.to_string())
            })();
            if commit.is_err() {
                let _ = directory.remove_file(&temp);
            }
            commit?;
            !existed
        } else {
            let mut stage = Stage::new(&self.directory)?;
            stage
                .directory
                .write_new("SKILL.md", content.as_bytes())
                .map_err(|e| e.to_string())?;
            cancelled(cancel)?;
            authority.authorize(SkillEffect::Write {
                root: &self.root,
                id: &id,
                overwrite: params.overwrite,
            })?;
            self.directory
                .rename(&stage.name, &self.directory, &id, false)
                .map_err(|e| e.to_string())?;
            stage.published = true;
            true
        };
        *registry = updated;
        Ok(WrittenSkillSummary {
            id: id.clone(),
            name: params.name.to_owned(),
            file_path: self.root.join(id).join("SKILL.md"),
            created,
        })
    }
}
pub struct WriteSkill<'a> {
    pub id: &'a str,
    pub name: &'a str,
    pub description: &'a str,
    pub body: &'a str,
    pub overwrite: bool,
}
pub fn slugify_skill_id(raw: &str) -> String {
    let mut out = String::new();
    let mut separator = false;
    for c in raw.to_lowercase().chars() {
        if c.is_ascii_alphanumeric() {
            if separator && !out.is_empty() {
                out.push('-');
            }
            out.push(c);
            separator = false;
        } else {
            separator = true;
        }
    }
    out.truncate(64);
    out
}
pub fn render_skill_markdown(name: &str, description: &str, body: &str) -> SkillResult<String> {
    if name
        .len()
        .saturating_add(description.len())
        .saturating_add(body.len())
        > MAX_SKILL_BYTES - 256
    {
        return Err("Skill document exceeds byte budget".into());
    }
    let scalar = |s: &str| -> SkillResult<String> {
        let words: Vec<_> = s
            .split(|c: char| crate::text::js_whitespace(c))
            .filter(|s| !s.is_empty())
            .collect();
        serde_json::to_string(&words.join(" ")).map_err(|e| e.to_string())
    };
    let content = format!(
        "---\nname: {}\ndescription: {}\n---\n\n{}\n",
        scalar(name)?,
        scalar(description)?,
        crate::text::js_trim(body)
    );
    if content.len() > MAX_SKILL_BYTES {
        Err("Skill document exceeds byte budget".into())
    } else {
        Ok(content)
    }
}

#[derive(Debug, Serialize)]
pub struct SkillToolInstallResult {
    pub ok: bool,
    pub package: String,
    pub output: String,
}
/// Package names are metadata, not shell syntax. Reject npm options, URL/file/git
/// sources and aliases; authority sees the complete captured process request.
pub fn tool_install_request(
    skill: &Skill,
    install_id: Option<&str>,
    mut host: ProcessRequest,
) -> SkillResult<(String, ProcessRequest)> {
    let spec = skill
        .install
        .as_deref()
        .unwrap_or_default()
        .iter()
        .find(|s| install_id.is_none_or(|id| s.id.as_deref() == Some(id)))
        .ok_or("No matching install option for this skill")?;
    if spec.kind.as_deref() != Some("node") || spec.package.as_ref().is_none_or(|s| s.is_empty()) {
        return Err(format!(
            "Unsupported install kind \"{}\". Install required tools manually: {}",
            spec.kind.as_deref().unwrap_or("unknown"),
            spec.bins
                .as_ref()
                .filter(|b| !b.is_empty())
                .map(|b| b.join(", "))
                .or_else(|| spec.package.clone())
                .unwrap_or_else(|| "see skill docs".into())
        ));
    }
    let package = spec.package.as_deref().ok_or("Missing package")?;
    let package_pattern = regex::Regex::new(
        r"^(?:@[a-z0-9][a-z0-9._-]*/)?[a-z0-9][a-z0-9._-]*(?:@[A-Za-z0-9*^~][A-Za-z0-9._+*^~-]*)?$",
    )
    .map_err(|e| e.to_string())?;
    if package.len() > 256 || !package_pattern.is_match(package) {
        return Err("Invalid or unsupported npm package specifier".into());
    }
    // The executable is host-captured. Never resolve an npm from skill metadata.
    if host.argv.len() != 1
        || !Path::new(&host.argv[0]).is_absolute()
        || host.input.is_some()
        || !host.cwd.is_absolute()
    {
        return Err("Host must supply an absolute npm executable/cwd and no stdin".into());
    }
    host.argv
        .extend(["install".into(), "-g".into(), "--".into(), package.into()]);
    host.timeout = Duration::from_secs(180);
    host.output_limit = 64 * 1024;
    Ok((package.into(), host))
}
pub async fn install_skill_tool(
    skill: &Skill,
    install_id: Option<&str>,
    host: ProcessRequest,
    pool: &ProcessPool,
    cache: &mut BinCache,
    authority: &dyn SkillAuthority,
    cancel: &ProcessCancellation,
) -> SkillResult<SkillToolInstallResult> {
    let (package, request) = tool_install_request(skill, install_id, host)?;
    cancelled(cancel)?;
    authority.authorize(SkillEffect::InstallTool {
        skill_id: &skill.id,
        request: &request,
    })?;
    let result = pool
        .run(request, cancel.clone())
        .await
        .map_err(|e| e.to_string())?;
    // Even a partial npm failure can change bins; never retain stale availability.
    cache.invalidate(None);
    if result.cancelled {
        return Err("npm install cancelled".into());
    }
    if result.timed_out {
        return Err("npm install timed out after 180s".into());
    }
    if result.exit_code != Some(0) {
        return Err(format!(
            "npm install exited with code {:?}\n{}",
            result.exit_code,
            tail(&result.output, 2000)
        ));
    }
    Ok(SkillToolInstallResult {
        ok: true,
        package,
        output: tail(&result.output, 4000),
    })
}
fn tail(value: &str, limit: usize) -> String {
    value
        .chars()
        .rev()
        .take(limit)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn markdown_round_trip_and_slugging() {
        assert_eq!(slugify_skill_id("../../etc/SSH tricks!"), "etc-ssh-tricks");
        let content =
            render_skill_markdown("A \"tool\"", "Use this: now\nwith help", " body ").unwrap();
        let fm = parse_frontmatter(&content).unwrap();
        assert_eq!(fm.name.as_deref(), Some("A \"tool\""));
        assert_eq!(fm.description.as_deref(), Some("Use this: now with help"));
        assert!(content.ends_with("\nbody\n"));
    }
    #[test]
    fn npm_options_and_local_sources_are_not_packages() {
        let mut skill = Skill {
            id: "s".into(),
            name: "S".into(),
            description: "D".into(),
            file_path: "/s/SKILL.md".into(),
            source: SkillSource::User,
            enabled: true,
            requires: None,
            install: None,
        };
        for p in [
            "--prefix=/outside",
            "file:/outside",
            "https://x/pkg",
            "git+ssh://x",
            "a;evil",
            "../x",
        ] {
            skill.install = Some(vec![super::super::SkillInstallSpec {
                kind: Some("node".into()),
                package: Some(p.into()),
                ..Default::default()
            }]);
            let host = ProcessRequest {
                argv: vec!["/host/npm".into()],
                cwd: "/host".into(),
                environment: Default::default(),
                input: None,
                timeout: Duration::from_secs(1),
                output_limit: 1,
            };
            assert!(tool_install_request(&skill, None, host).is_err(), "{p}");
        }
    }
    #[cfg(unix)]
    struct TestAuthority;
    #[cfg(unix)]
    impl SkillAuthority for TestAuthority {
        fn authorize(&self, _: SkillEffect<'_>) -> SkillResult<()> {
            Ok(())
        }
    }
    #[cfg(unix)]
    struct Deny;
    #[cfg(unix)]
    impl SkillAuthority for Deny {
        fn authorize(&self, _: SkillEffect<'_>) -> SkillResult<()> {
            Err("denied".into())
        }
    }
    #[cfg(unix)]
    struct TestRoot(PathBuf);
    #[cfg(unix)]
    impl TestRoot {
        fn new() -> Self {
            use std::os::unix::fs::PermissionsExt;
            let file = PathBuf::from(file!());
            let source = if file.is_absolute() {
                file
            } else {
                Path::new(env!("CARGO_MANIFEST_DIR")).join(file)
            };
            let root = source
                .ancestors()
                .nth(6)
                .unwrap()
                .join(".jait/artifacts/gateway-rust/parallel-implementation/skills-tests")
                .join(uuid::Uuid::new_v4().to_string());
            std::fs::create_dir_all(&root).unwrap();
            std::fs::set_permissions(&root, std::fs::Permissions::from_mode(0o700)).unwrap();
            Self(root)
        }
    }
    #[cfg(unix)]
    impl Drop for TestRoot {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }
    #[cfg(unix)]
    fn archive(entries: &[(&str, &[u8])]) -> Vec<u8> {
        use std::io::{Cursor, Write};
        let mut writer = zip::ZipWriter::new(Cursor::new(Vec::new()));
        for (name, bytes) in entries {
            writer
                .start_file(*name, zip::write::SimpleFileOptions::default())
                .unwrap();
            writer.write_all(bytes).unwrap();
        }
        writer.finish().unwrap().into_inner()
    }
    #[cfg(target_os = "linux")]
    #[test]
    fn disk_install_origin_uninstall_and_user_write_are_real_transactions() {
        let root = TestRoot::new();
        let store = SkillStore::open(root.0.clone()).unwrap();
        let mut registry = SkillRegistry::default();
        let cancel = ProcessCancellation::default();
        let content = b"---\nname: Example\ndescription: Do a thing\n---\nbody";
        let zip = archive(&[("SKILL.md", content), ("scripts/help.txt", b"asset")]);
        let download = DownloadedSkill {
            slug: "example".into(),
            version: "1.0.0".into(),
            registry: "https://clawhub.ai".into(),
            zip,
        };
        let summary = store
            .install_clawhub_skill(&mut registry, download, 1234, &TestAuthority, &cancel)
            .unwrap();
        assert_eq!(summary.name, "Example");
        assert_eq!(
            std::fs::read(root.0.join("example/scripts/help.txt")).unwrap(),
            b"asset"
        );
        let origin: Origin = serde_json::from_slice(
            &std::fs::read(root.0.join("example/.clawhub/origin.json")).unwrap(),
        )
        .unwrap();
        assert_eq!(origin.installed_at, 1234);
        assert_eq!(registry.get("example").unwrap().description, "Do a thing");
        let removed = store
            .uninstall_clawhub_skill(&mut registry, "example", &TestAuthority, &cancel)
            .unwrap();
        assert!(removed.removed && removed.cleanup_error.is_none());
        assert!(!root.0.join("example").exists());
        assert!(registry.is_empty());
        let params = || WriteSkill {
            id: "Notes",
            name: "Notes",
            description: "How to take notes:",
            body: "Use paper.",
            overwrite: false,
        };
        assert!(
            store
                .write_user_skill(&mut registry, params(), &TestAuthority, &cancel)
                .unwrap()
                .created
        );
        assert!(
            store
                .write_user_skill(&mut registry, params(), &TestAuthority, &cancel)
                .is_err()
        );
        assert!(
            store
                .uninstall_clawhub_skill(&mut registry, "notes", &TestAuthority, &cancel)
                .is_err()
        );
        use crate::tools::skill_discovery::SkillFileReader;
        let reader = super::super::ScopedSkillFileReader::new(vec![root.0.clone()]).unwrap();
        assert!(
            reader
                .read_utf8(&root.0.join("notes/SKILL.md"))
                .unwrap()
                .contains("Use paper.")
        );
        assert!(reader.read_utf8(&root.0.join("notes/../SKILL.md")).is_err());
        let scanned = super::super::scan_skill_dir(&root.0, SkillSource::User, &cancel).unwrap();
        assert_eq!(scanned.len(), 1);
        assert_eq!(scanned[0].name, "Notes");
    }
    #[cfg(target_os = "linux")]
    #[test]
    fn deny_cancel_and_unsafe_archives_have_no_publication() {
        let root = TestRoot::new();
        let store = SkillStore::open(root.0.clone()).unwrap();
        let mut registry = SkillRegistry::default();
        let cancel = ProcessCancellation::default();
        let params = || WriteSkill {
            id: "new",
            name: "New",
            description: "D",
            body: "Body",
            overwrite: false,
        };
        assert_eq!(
            store
                .write_user_skill(&mut registry, params(), &Deny, &cancel)
                .unwrap_err(),
            "denied"
        );
        cancel.cancel();
        assert!(
            store
                .write_user_skill(&mut registry, params(), &TestAuthority, &cancel)
                .is_err()
        );
        assert!(std::fs::read_dir(&root.0).unwrap().next().is_none());
        let good = b"---\nname: Example\ndescription: D\n---\nbody";
        for extra in [
            "../escape",
            "/escape",
            "C:/escape",
            "dir/../../escape",
            ".clawhub/origin.json",
            "skill.md",
        ] {
            let zip = archive(&[("SKILL.md", good), (extra, b"bad")]);
            let download = DownloadedSkill {
                slug: "new".into(),
                version: "1".into(),
                registry: "https://clawhub.ai".into(),
                zip,
            };
            assert!(
                store
                    .install_clawhub_skill(
                        &mut registry,
                        download,
                        1,
                        &TestAuthority,
                        &ProcessCancellation::default()
                    )
                    .is_err(),
                "{extra}"
            );
        }
        assert!(registry.is_empty());
        assert!(std::fs::read_dir(&root.0).unwrap().next().is_none());
    }
    #[cfg(target_os = "linux")]
    #[test]
    fn ancestor_and_skill_symlinks_never_escape_the_store() {
        use std::os::unix::fs::symlink;
        let root = TestRoot::new();
        let outside = TestRoot::new();
        std::fs::write(outside.0.join("SKILL.md"), b"original").unwrap();
        symlink(&outside.0, root.0.join("link")).unwrap();
        assert!(SkillStore::open(root.0.join("link")).is_err());
        let store = SkillStore::open(root.0.clone()).unwrap();
        let mut registry = SkillRegistry::default();
        let params = WriteSkill {
            id: "link",
            name: "New",
            description: "D",
            body: "Body",
            overwrite: true,
        };
        assert!(
            store
                .write_user_skill(
                    &mut registry,
                    params,
                    &TestAuthority,
                    &ProcessCancellation::default()
                )
                .is_err()
        );
        assert_eq!(
            std::fs::read(outside.0.join("SKILL.md")).unwrap(),
            b"original"
        );
        assert!(
            super::super::scan_skill_dir(
                &root.0,
                SkillSource::User,
                &ProcessCancellation::default()
            )
            .unwrap()
            .is_empty()
        );
    }
}
