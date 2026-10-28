//! Discovery and age-based cleanup shared by all three OS sandbox kinds.
//! Listing data never grants removal authority. This module is unverified.
use super::*;
use std::{collections::HashSet, sync::OnceLock};

#[derive(Clone, Debug, serde::Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum OsSandboxType {
    LinuxDesktop,
    Windows,
}
#[derive(Clone, Debug, serde::Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct OsSandboxInfo {
    pub container_name: String,
    #[serde(rename = "type")]
    pub kind: OsSandboxType,
    pub running: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub vnc_port: Option<u16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub novnc_port: Option<u16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rdp_port: Option<u16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub web_viewer_port: Option<u16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ssh_port: Option<u16>,
}
#[derive(Clone, Debug, Default)]
pub struct SandboxCleanupOptions {
    pub exclude_names: Vec<String>,
    pub max_age_ms: Option<f64>,
}
/// Must be bound to authorized names on the execution host/node. It must
/// recheck current ownership/consent/expiry for EACH removal; prefix matching,
/// a published port and container listing labels are not sufficient authority.
pub trait SandboxCleanupAuthority: Send + Sync + 'static {
    fn now_ms(&self) -> f64;
    fn authorize_remove(&self, kind: SandboxKind, container_name: &str) -> Result<()>;
}
#[derive(Clone, Debug, Default)]
pub struct SandboxCleanupReport {
    pub removed: Vec<String>,
    pub denied: Vec<String>,
    pub failed: Vec<String>,
    /// Names left untouched when the 60-second admission window expires. An
    /// in-flight removal retains its 15-second process bound before settling.
    pub deferred: Vec<String>,
}
fn published_port(ports: &str, container_port: u16) -> Option<u16> {
    // Docker ps may publish IPv4/IPv6 or duplicate mappings. Preserve first
    // match semantics, rejecting values outside the real TCP/UDP port range.
    let suffix = format!("->{container_port}/tcp");
    let offset = ports.find(&suffix)?;
    let digits = ports[..offset]
        .bytes()
        .rev()
        .take_while(u8::is_ascii_digit)
        .count();
    if digits == 0 {
        return None;
    }
    ports[offset - digits..offset]
        .parse::<u16>()
        .ok()
        .filter(|p| *p != 0)
}
fn created_at_ms(raw: &str, labels: &str) -> Option<f64> {
    // Last duplicate label wins, matching Map.set in the reference.
    let label = labels
        .split(',')
        .filter_map(|part| part.split_once('='))
        .filter(|(key, _)| js_trim(key) == "jait.createdAt")
        .map(|(_, value)| js_trim(value))
        .next_back();
    if let Some(label) = label.filter(|s| !s.is_empty()) {
        let unsigned = label.strip_prefix(['+', '-']).unwrap_or(label);
        let count = unsigned.bytes().take_while(u8::is_ascii_digit).count();
        if count != 0 {
            let sign_len = label.len() - unsigned.len();
            if let Ok(value) = label[..sign_len + count].parse::<f64>()
                && value.is_finite()
            {
                return Some(value);
            }
        }
    }
    static DOCKER_DATE: OnceLock<regex::Regex> = OnceLock::new();
    let expression = DOCKER_DATE.get_or_init(|| {
        regex::Regex::new(r"^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})\s+([+-])(\d{2})(\d{2})")
            .expect("fixed Docker timestamp expression")
    });
    if let Some(parts) = expression.captures(raw) {
        let iso = format!(
            "{}T{}{}{}:{}",
            &parts[1], &parts[2], &parts[3], &parts[4], &parts[5]
        );
        return chrono::DateTime::parse_from_rfc3339(&iso)
            .ok()
            .map(|t| t.timestamp_millis() as f64);
    }
    // Engine timestamps are RFC3339, RFC2822 or Docker's explicit numeric
    // timezone. Ambiguous host-local dates are intentionally not guessed.
    chrono::DateTime::parse_from_rfc3339(raw)
        .or_else(|_| chrono::DateTime::parse_from_rfc2822(raw))
        .ok()
        .map(|t| t.timestamp_millis() as f64)
}
impl SandboxManager {
    pub async fn list_running_os_sandboxes(&self) -> Result<Vec<OsSandboxInfo>> {
        let mut argv = self.argv("ps");
        argv.extend([
            "--format".into(),
            "{{.Names}}\t{{.Image}}\t{{.Ports}}".into(),
        ]);
        let result = self.host.run(argv, 15_000).await?;
        if result.exit_code != Some(0.0) || result.timed_out {
            return Err(error("Container runtime OS sandbox discovery failed"));
        }
        let output = String::from_utf16_lossy(&result.output.0);
        let mut found = Vec::new();
        for line in output.lines().map(js_trim).filter(|s| !s.is_empty()) {
            if found.len() >= 512 {
                return Err(error("OS sandbox discovery result limit exceeded"));
            }
            let mut columns = line.split('\t');
            let name = js_trim(columns.next().unwrap_or(""));
            let _image = columns.next();
            let ports = columns.next().unwrap_or("");
            let kind = if name.starts_with("jait-linux-desktop-sb-") {
                OsSandboxType::LinuxDesktop
            } else if name.starts_with("jait-windows-sb-") {
                OsSandboxType::Windows
            } else {
                continue;
            };
            let name = Self::validate_container(name)?;
            let linux = kind == OsSandboxType::LinuxDesktop;
            found.push(OsSandboxInfo {
                container_name: name,
                kind,
                running: true,
                vnc_port: if linux {
                    published_port(ports, 5900)
                } else {
                    None
                },
                novnc_port: if linux {
                    published_port(ports, 6080)
                } else {
                    None
                },
                rdp_port: if !linux {
                    published_port(ports, 3389)
                } else {
                    None
                },
                web_viewer_port: if !linux {
                    published_port(ports, 8006)
                } else {
                    None
                },
                ssh_port: if !linux {
                    published_port(ports, 22)
                } else {
                    None
                },
            });
        }
        Ok(found)
    }
    /// Owned task finishes the current admitted removal on caller cancellation,
    /// then stops before the next effect. Returns only confirmed removals, unlike
    /// the reference's list of attempted names. Per-name failures remain visible.
    pub async fn cleanup_sandboxes(
        &self,
        kind: SandboxKind,
        options: SandboxCleanupOptions,
        authority: Arc<dyn SandboxCleanupAuthority>,
    ) -> Result<SandboxCleanupReport> {
        if options
            .max_age_ms
            .is_some_and(|age| !age.is_finite() || age < 0.0)
        {
            return Err(error("Sandbox cleanup age must be finite and nonnegative"));
        }
        if options.exclude_names.len() > 512 {
            return Err(error("Sandbox cleanup exclusion limit exceeded"));
        }
        let (send, receive) = oneshot::channel();
        let manager = self.clone();
        self.host.supervise(Box::pin(async move {
            let result = manager
                .cleanup_sandboxes_observed(kind, options, authority.as_ref(), &send)
                .await;
            let _ = send.send(result);
            Ok(())
        }));
        receive
            .await
            .map_err(|_| error("Sandbox cleanup supervisor ended before completion"))?
    }
    async fn cleanup_sandboxes_observed(
        &self,
        kind: SandboxKind,
        options: SandboxCleanupOptions,
        authority: &dyn SandboxCleanupAuthority,
        observer: &oneshot::Sender<Result<SandboxCleanupReport>>,
    ) -> Result<SandboxCleanupReport> {
        if observer.is_closed() {
            return Err(error("Sandbox cleanup cancelled"));
        }
        let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(60);
        let prefix = kind.description().1;
        let mut argv = self.argv("ps");
        argv.extend([
            "--filter".into(),
            format!("name={prefix}"),
            "--format".into(),
            "{{.Names}}\t{{.CreatedAt}}\t{{.Labels}}".into(),
        ]);
        let list = self.host.run(argv, 15_000).await?;
        if list.exit_code != Some(0.0) || list.timed_out {
            return Err(error("Container runtime sandbox cleanup listing failed"));
        }
        let now = authority.now_ms();
        if !now.is_finite() {
            return Err(error("Invalid sandbox cleanup clock"));
        }
        let excluded: HashSet<_> = options.exclude_names.iter().map(|n| js_trim(n)).collect();
        let output = String::from_utf16_lossy(&list.output.0);
        let mut candidates = Vec::new();
        let mut seen = HashSet::new();
        for line in output.lines().map(js_trim).filter(|s| !s.is_empty()) {
            let mut parts = line.split('\t');
            let name = js_trim(parts.next().unwrap_or(""));
            if !name.starts_with(prefix) || excluded.contains(name) || !seen.insert(name) {
                continue;
            }
            let name = Self::validate_container(name)?;
            let created = created_at_ms(parts.next().unwrap_or(""), parts.next().unwrap_or(""));
            if options
                .max_age_ms
                .is_some_and(|age| created.is_some_and(|created| now - created < age))
            {
                continue;
            }
            candidates.push(name);
            // Validate the WHOLE listing before any removal, never silently
            // truncate a large assessment or perform a partly admitted batch.
            if candidates.len() > 256 {
                return Err(error("Sandbox cleanup candidate limit exceeded"));
            }
        }
        let mut report = SandboxCleanupReport::default();
        for name in candidates {
            if tokio::time::Instant::now() >= deadline {
                report.deferred.push(name);
                continue;
            }
            if observer.is_closed() {
                return Err(error("Sandbox cleanup cancelled"));
            }
            if authority.authorize_remove(kind, &name).is_err() {
                report.denied.push(name);
                continue;
            }
            match self.stop_container(&name).await {
                Ok(()) => report.removed.push(name),
                Err(_) => report.failed.push(name),
            }
        }
        Ok(report)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn timestamps_use_last_label_then_engine_numeric_timezone() {
        assert_eq!(
            created_at_ms("invalid", "jait.createdAt=17,jait.createdAt=+42tail"),
            Some(42.0)
        );
        assert_eq!(
            created_at_ms("1970-01-01 02:00:01 +0200 EET", ""),
            Some(1000.0)
        );
        assert_eq!(
            created_at_ms("1970-01-01T00:00:02Z", "jait.createdAt=invalid"),
            Some(2000.0)
        );
        assert_eq!(created_at_ms("untrusted", "jait.createdAt=--20"), None);
    }
    #[test]
    fn published_ports_reject_invalid_and_keep_first_mapping() {
        assert_eq!(
            published_port("[::]:2222->22/tcp, 0.0.0.0:3333->22/tcp", 22),
            Some(2222)
        );
        assert_eq!(published_port("0.0.0.0:2222->22/udp", 22), None);
        assert_eq!(published_port("0.0.0.0:999999->22/tcp", 22), None);
    }
}
