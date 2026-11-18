//! Disk pressure policy with explicit scheduler and notification ownership.
//! The native sampler uses the bounded blocking lane; checks activate no jobs.
use crate::{
    runtime::blocking::BlockingLane,
    services::calendar::truthy,
    time::{Clock, default_clock, iso},
};
use futures_util::future::BoxFuture;
use serde_json::{Value, json};
use std::{collections::HashMap, ffi::CString};
#[derive(Clone, Copy, Debug)]
pub struct DiskSample {
    pub blocks: f64,
    pub bavail: f64,
    pub files: f64,
    pub ffree: f64,
}
#[derive(Debug, Clone)]
pub struct ProbeError {
    pub display: String,
    pub code: Option<String>,
}
pub type DiskProbe =
    Box<dyn Fn(String) -> BoxFuture<'static, Result<DiskSample, ProbeError>> + Send + Sync>;
pub trait Backend: Send {
    fn list(&mut self) -> Result<Vec<Value>, String>;
    fn update(&mut self, id: &Value, patch: Value) -> Result<(), String>;
    fn notify(&mut self, level: &str, title: &str, message: &str) -> Result<(), String>;
}
pub fn is_agent_job(job: &Value) -> bool {
    let input = &job["input"];
    let kind = &input["__jaitJobMeta"]["jobType"];
    kind == "agent_task"
        || kind == "agent_thread_job"
        || job["toolName"] == "agent.spawn"
        || (job["toolName"] == "thread.control" && input["action"] == "create")
}
pub fn sample_native(path: &str) -> Result<DiskSample, ProbeError> {
    #[cfg(unix)]
    {
        let cpath = CString::new(path).map_err(|_| ProbeError {
            display: "Error: Invalid filesystem path".into(),
            code: Some("EINVAL".into()),
        })?;
        let mut stat = std::mem::MaybeUninit::<libc::statvfs>::uninit();
        // statvfs initializes the provided storage only on success; CString owns the input.
        if unsafe { libc::statvfs(cpath.as_ptr(), stat.as_mut_ptr()) } != 0 {
            let e = std::io::Error::last_os_error();
            let (code, detail) = match e.raw_os_error() {
                Some(libc::ENOENT) => ("ENOENT", "no such file or directory"),
                Some(libc::EACCES) => ("EACCES", "permission denied"),
                _ => ("EIO", "filesystem check failed"),
            };
            return Err(ProbeError {
                display: format!("Error: {code}: {detail}, statfs '{path}'"),
                code: Some(code.into()),
            });
        }
        let stat = unsafe { stat.assume_init() };
        Ok(DiskSample {
            blocks: stat.f_blocks as f64,
            bavail: stat.f_bavail as f64,
            files: stat.f_files as f64,
            ffree: stat.f_ffree as f64,
        })
    }
    #[cfg(not(unix))]
    {
        let _ = path;
        Err(ProbeError {
            display: "Error: Native filesystem sampling is unavailable on this platform".into(),
            code: None,
        })
    }
}
pub fn native_probe(lane: BlockingLane) -> DiskProbe {
    Box::new(move |path| {
        let lane = lane.clone();
        Box::pin(async move {
            lane.run(move || sample_native(&path))
                .await
                .map_err(|e| ProbeError {
                    display: format!("Error: {e}"),
                    code: None,
                })?
        })
    })
}
fn fixed_one(value: f64) -> String {
    if value.is_nan() {
        return "NaN".into();
    }
    if value.is_infinite() {
        return if value.is_sign_negative() {
            "-Infinity".into()
        } else {
            "Infinity".into()
        };
    }
    let sign = if value < 0.0 { "-" } else { "" };
    let value = value.abs();
    if value >= 1e21 {
        return format!("{sign}{}", ryu_js::Buffer::new().format(value));
    }
    let bits = value.to_bits();
    let exponent = ((bits >> 52) & 0x7ff) as i32;
    let mantissa = (bits & ((1u64 << 52) - 1)) | if exponent == 0 { 0 } else { 1u64 << 52 };
    let power = if exponent == 0 {
        -1074
    } else {
        exponent - 1023 - 52
    };
    let scaled = u128::from(mantissa) * 10;
    let rounded = if power >= 0 {
        scaled << power
    } else {
        let shift = (-power) as u32;
        if shift >= 128 {
            0
        } else {
            let d = 1u128 << shift;
            scaled / d + u128::from(scaled % d >= d / 2)
        }
    };
    format!("{sign}{}.{}", rounded / 10, rounded % 10)
}
fn spread(value: &Value) -> serde_json::Map<String, Value> {
    value.as_object().cloned().unwrap_or_default()
}
pub struct DiskSpaceWatchdog {
    backend: Box<dyn Backend>,
    probe: DiskProbe,
    paths: Vec<String>,
    last_alert: HashMap<String, String>,
    clock: Clock,
}
impl DiskSpaceWatchdog {
    pub fn new(backend: Box<dyn Backend>, probe: DiskProbe, paths: Vec<String>) -> Self {
        Self::with_clock(backend, probe, paths, default_clock())
    }
    pub fn with_clock(
        backend: Box<dyn Backend>,
        probe: DiskProbe,
        paths: Vec<String>,
        clock: Clock,
    ) -> Self {
        Self {
            backend,
            probe,
            paths,
            last_alert: HashMap::new(),
            clock,
        }
    }
    pub async fn check(&mut self) -> Result<(), String> {
        let agents = self
            .backend
            .list()?
            .into_iter()
            .filter(|j| truthy(&j["enabled"]) && is_agent_job(j))
            .collect::<Vec<_>>();
        let mut paths = self.paths.clone();
        paths.extend(
            agents
                .iter()
                .filter_map(|j| j["projectRoot"].as_str().map(String::from)),
        );
        let mut unique = vec![];
        for path in paths {
            if !unique.contains(&path) {
                unique.push(path);
            }
        }
        let mut critical = vec![];
        for path in unique {
            let attempt: Result<(), ProbeError> = async {
                let disk = (self.probe)(path.clone()).await?;
                if !disk.blocks.is_finite() || disk.blocks <= 0.0 {
                    return Err(ProbeError {
                        display: "Error: Filesystem capacity is unavailable".into(),
                        code: None,
                    });
                }
                let used = 100.0 * (1.0 - disk.bavail / disk.blocks);
                let inodes = if disk.files > 0.0 {
                    100.0 * (1.0 - disk.ffree / disk.files)
                } else {
                    0.0
                };
                let usage = if used.is_nan() || inodes.is_nan() {
                    f64::NAN
                } else {
                    used.max(inodes)
                };
                let level = if usage >= 90.0 {
                    "critical"
                } else if usage >= 80.0 {
                    "warning"
                } else {
                    "healthy"
                };
                if level == "critical" {
                    critical.push(path.clone());
                }
                if level == "healthy" {
                    self.last_alert.remove(&path);
                } else if self.last_alert.get(&path).map(String::as_str) != Some(level) {
                    self.backend
                        .notify(
                            if level == "critical" {
                                "error"
                            } else {
                                "warning"
                            },
                            "Disk space watchdog",
                            &format!(
                                "{path}: {}% disk used, {}% inodes used.",
                                fixed_one(used),
                                fixed_one(inodes)
                            ),
                        )
                        .map_err(|e| ProbeError {
                            display: format!("Error: {e}"),
                            code: None,
                        })?;
                    self.last_alert.insert(path.clone(), level.into());
                }
                Ok(())
            }
            .await;
            if let Err(e) = attempt {
                if e.code.as_deref() == Some("ENOENT") && !self.paths.contains(&path) {
                    continue;
                }
                if self.last_alert.get(&path).map(String::as_str) != Some("unavailable") {
                    self.backend.notify(
                        "warning",
                        "Disk space check failed",
                        &format!("{path}: {}", e.display),
                    )?;
                    self.last_alert.insert(path.clone(), "unavailable".into());
                }
            }
        }
        let storage = critical.iter().any(|p| self.paths.contains(p));
        for job in agents {
            if !storage && !critical.iter().any(|p| job["projectRoot"] == p.as_str()) {
                continue;
            }
            let mut input = spread(&job["input"]);
            let mut meta = spread(&job["input"]["__jaitJobMeta"]);
            meta.insert("diskSpacePausedAt".into(), json!(iso((self.clock)())?));
            input.insert("__jaitJobMeta".into(), Value::Object(meta));
            self.backend
                .update(&job["id"], json!({"enabled":false,"input":input}))?;
            self.backend.notify("error","Agent job paused",&format!("{} paused because disk or inode usage reached 90%. Free space, then enable it in Jobs.",job["name"].as_str().unwrap_or("undefined")))?;
        }
        Ok(())
    }
}
