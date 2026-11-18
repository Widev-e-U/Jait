//! Repeatable Linux resource measurements of an owned, disposable backend only.
#![allow(dead_code)]
#[path = "../client.rs"]
mod client;
#[path = "../evidence.rs"]
mod evidence;
#[path = "../fixture.rs"]
mod fixture;

use anyhow::{Context, Result, ensure};
use serde_json::{Value, json};
use std::{
    collections::BTreeSet,
    fs,
    path::{Path, PathBuf},
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

#[derive(Clone, Default)]
struct Resources {
    rss_kib: u64,
    high_water_kib: u64,
    file_descriptors: u64,
    descendants: u64,
}
impl Resources {
    fn json(&self) -> Value {
        json!({"rss_kib":self.rss_kib,"sum_process_high_water_kib":self.high_water_kib,"file_descriptors":self.file_descriptors,"descendants":self.descendants})
    }
    fn maxima(&mut self, sample: &Self) {
        self.rss_kib = self.rss_kib.max(sample.rss_kib);
        self.high_water_kib = self.high_water_kib.max(sample.high_water_kib);
        self.file_descriptors = self.file_descriptors.max(sample.file_descriptors);
        self.descendants = self.descendants.max(sample.descendants);
    }
}
fn memory(status: &str, name: &str) -> Result<u64> {
    let line = status
        .lines()
        .find_map(|line| line.strip_prefix(name))
        .context("process memory metric unavailable")?;
    let mut fields = line.split_whitespace();
    let value = fields.next().context("missing memory value")?.parse()?;
    ensure!(
        fields.next() == Some("kB"),
        "unexpected process memory unit"
    );
    Ok(value)
}
fn owned_tree(root: &Path, pid: u32) -> Result<Resources> {
    let mut seen = BTreeSet::new();
    let mut pending = vec![pid];
    let mut result = Resources::default();
    while let Some(current) = pending.pop() {
        ensure!(
            seen.len() < 256,
            "owned process tree exceeded 256 processes"
        );
        if !seen.insert(current) {
            continue;
        }
        let process = root.join(current.to_string());
        let status = match fs::read_to_string(process.join("status")) {
            Ok(status) => status,
            Err(error) if current != pid && error.kind() == std::io::ErrorKind::NotFound => {
                continue;
            }
            Err(error) => return Err(error.into()),
        };
        result.rss_kib += memory(&status, "VmRSS:")?;
        result.high_water_kib += memory(&status, "VmHWM:")?;
        result.file_descriptors += fs::read_dir(process.join("fd"))?.count() as u64;
        if current != pid {
            result.descendants += 1;
        }
        let children = fs::read_to_string(process.join(format!("task/{current}/children")))?;
        for child in children.split_whitespace() {
            pending.push(child.parse()?);
        }
    }
    Ok(result)
}
fn percentile(samples: &[f64], fraction: f64) -> f64 {
    let mut sorted = samples.to_vec();
    sorted.sort_by(f64::total_cmp);
    sorted[((sorted.len() as f64 * fraction).ceil() as usize)
        .saturating_sub(1)
        .min(sorted.len() - 1)]
}
fn workload(gateway: &fixture::Gateway, token: &str, mode: &str) -> Result<Vec<f64>> {
    let mut latencies = Vec::new();
    fixture::check_cancelled()?;
    if mode == "session-crud" {
        for _ in 0..20 {
            fixture::check_cancelled()?;
            let start = Instant::now();
            let session = gateway.api.json(
                "POST",
                "/api/sessions",
                Some(token),
                Some(json!({"name":"resource-baseline"})),
                201,
            )?;
            let id = client::string(&session, "id")?;
            gateway.api.json(
                "GET",
                &format!("/api/sessions/{id}"),
                Some(token),
                None,
                200,
            )?;
            gateway.api.json(
                "DELETE",
                &format!("/api/sessions/{id}"),
                Some(token),
                None,
                200,
            )?;
            latencies.push(start.elapsed().as_secs_f64() * 1000.0);
        }
    } else {
        let concurrent = if mode == "health-concurrent" { 4 } else { 1 };
        thread::scope(|scope| -> Result<()> {
            let handles: Vec<_> = (0..concurrent)
                .map(|_| {
                    let api = gateway.api.clone();
                    scope.spawn(move || -> Result<Vec<f64>> {
                        let mut samples = Vec::new();
                        for _ in 0..50 {
                            fixture::check_cancelled()?;
                            let start = Instant::now();
                            let response = api.expect("GET", "/health", None, None, 200)?;
                            let _ = client::bounded_body(response)?;
                            samples.push(start.elapsed().as_secs_f64() * 1000.0);
                        }
                        Ok(samples)
                    })
                })
                .collect();
            for handle in handles {
                latencies.extend(handle.join().expect("health workload worker")?);
            }
            Ok(())
        })?;
    }
    Ok(latencies)
}
fn run() -> Result<()> {
    ctrlc::set_handler(|| fixture::CANCELLED.store(true, Ordering::SeqCst))?;
    ensure!(
        cfg!(target_os = "linux"),
        "resource baseline requires Linux /proc; other platforms remain unexecuted"
    );
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()?;
    let directory = root
        .join(".jait/artifacts/resource-baselines")
        .join(uuid::Uuid::new_v4().to_string());
    fs::create_dir_all(&directory)?;
    println!("Artifacts: {}", directory.display());
    fs::write(
        directory.join("report.json"),
        serde_json::to_vec_pretty(
            &json!({"schema_version":1,"success":false,"error":"measurement did not complete; inspect runner output","coverage_gaps":["incomplete measurement"]}),
        )?,
    )?;
    let started_unix_ms = SystemTime::now().duration_since(UNIX_EPOCH)?.as_millis();
    let source_fingerprints = evidence::snapshot(&root)?;
    let startup = Instant::now();
    let mut gateway = fixture::Gateway::start(&root, &directory, None)?;
    let startup_ms = startup.elapsed().as_secs_f64() * 1000.0;
    let pid = gateway
        .process_id()
        .context("benchmark requires an owned backend process")?;
    let startup_resources = owned_tree(Path::new("/proc"), pid)?;
    let mut idle_peak = Resources::default();
    let idle_started = Instant::now();
    for _ in 0..100 {
        fixture::check_cancelled()?;
        idle_peak.maxima(&owned_tree(Path::new("/proc"), pid)?);
        thread::sleep(Duration::from_millis(50));
    }
    let idle_duration_ms = idle_started.elapsed().as_millis();
    let owner = gateway.api.json("POST", "/api/auth/register", None, Some(json!({"username":"resource-baseline-owner","password":"fixture-password-no-live-credentials"})), 200)?;
    let token = client::string(&owner, "access_token")?;
    let mut workloads = Vec::new();
    for mode in ["health-sequential", "session-crud", "health-concurrent"] {
        let done = Arc::new(AtomicBool::new(false));
        let monitor_done = done.clone();
        let monitor = thread::spawn(move || -> Result<(Resources, usize)> {
            let mut peak = Resources::default();
            let mut samples = 0;
            loop {
                peak.maxima(&owned_tree(Path::new("/proc"), pid)?);
                samples += 1;
                if monitor_done.load(Ordering::SeqCst) {
                    return Ok((peak, samples));
                }
                thread::sleep(Duration::from_millis(10));
            }
        });
        let start = Instant::now();
        let result = workload(&gateway, &token, mode);
        let seconds = start.elapsed().as_secs_f64();
        done.store(true, Ordering::SeqCst);
        let (peak, samples) = monitor.join().expect("resource monitor")?;
        let latencies = result?;
        workloads.push(json!({"id":mode,"operations":latencies.len(),"requests_per_operation":if mode=="session-crud" {3} else {1},"duration_seconds":seconds,"operations_per_second":latencies.len() as f64/seconds,"latency_ms":{"p50":percentile(&latencies,0.5),"p95":percentile(&latencies,0.95),"max":percentile(&latencies,1.0)},"sample_count":samples,"peak":peak.json()}));
    }
    let backend_launch = gateway.launch_profile();
    gateway.stop()?;
    let sources_unchanged = source_fingerprints == evidence::snapshot(&root)?;
    let report = json!({"schema_version":1,"workload_version":1,"profile":"linux-owned-resource-baseline","backend_launch":backend_launch,"started_unix_ms":started_unix_ms,"os":std::env::consts::OS,"arch":std::env::consts::ARCH,"kernel_release":fs::read_to_string("/proc/sys/kernel/osrelease").ok().map(|value| value.trim().to_owned()),"host_load_average":fs::read_to_string("/proc/loadavg").ok().map(|value| value.split_whitespace().take(3).collect::<Vec<_>>().join(" ")),"source_fingerprints":source_fingerprints,"sources_unchanged":sources_unchanged,"success":sources_unchanged,"startup_ms":startup_ms,"startup_resources":startup_resources.json(),"idle":{"duration_ms":idle_duration_ms,"sample_interval_ms":50,"sample_count":100,"peak":idle_peak.json()},"workloads":workloads,"coverage_gaps":["macOS and Windows execution","other CPU architectures","active model stream and tool execution workloads","real PTY/browser/scanner resource workloads"],"measurement_limits":["10 ms workload sampling can miss short RSS/FD/process-count peaks","sum_process_high_water_kib sums separate process high-water marks; it is not a simultaneous tree peak","startup_ms includes readiness polling with up to 100 ms granularity","HTTP measurements use loopback, fixed sequential/4-client workloads and disposable state"]});
    let path = directory.join("report.json");
    fs::write(&path, serde_json::to_vec_pretty(&report)?)?;
    println!("{}", path.display());
    ensure!(
        sources_unchanged,
        "sources changed during measurement; evidence invalidated"
    );
    Ok(())
}
fn main() {
    if let Err(error) = run() {
        eprintln!("{error:#}");
        std::process::exit(1);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn memory_units_and_missing_metrics_fail_closed() {
        assert_eq!(
            memory("VmRSS:\t42 kB\nVmHWM:\t84 kB\n", "VmRSS:").unwrap(),
            42
        );
        assert!(memory("VmRSS: 42 MB", "VmRSS:").is_err());
        assert!(memory("VmHWM: 42 kB", "VmRSS:").is_err());
        assert!(memory("VmRSS: nope kB", "VmRSS:").is_err());
    }
    #[test]
    fn latency_percentiles_use_bounded_nearest_rank() {
        assert_eq!(percentile(&[10.0, 1.0, 5.0, 2.0], 0.5), 2.0);
        assert_eq!(percentile(&[10.0, 1.0, 5.0, 2.0], 0.95), 10.0);
    }
}
