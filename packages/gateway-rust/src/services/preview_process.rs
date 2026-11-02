//! Scoped local execution for the canonical preview runner. Process ownership,
//! captured environment, bounded output and process-group cleanup reuse ProcessPool.
use super::preview_runner::{
    ProjectSnapshot, detect_preview_command, normalize_target_url, resolve_preview_project,
};
use crate::execution::process_runner::{
    ProcessCancellation, ProcessPool, ProcessRequest, ProcessResult,
};
use std::{
    future::Future,
    net::SocketAddr,
    path::PathBuf,
    pin::Pin,
    sync::Arc,
    time::{Duration, Instant},
};
use tokio::{sync::Semaphore, task::JoinHandle};
use url::Url;

#[derive(Clone, Debug)]
pub struct PreviewLaunch {
    pub owner_id: String,
    pub session_id: String,
    pub root: PathBuf,
    pub command: String,
    pub url: Url,
    pub port: u16,
}
/// Only trusted host code constructs grants after checking the exact root,
/// command, captured environment, consent and destination. Never deserialize.
pub struct ApprovedPreviewLaunch {
    pub process: ProcessRequest,
    pub addresses: Vec<SocketAddr>,
    pub expires_at: Instant,
}
pub type LaunchAuthority = Arc<
    dyn Fn(
            PreviewLaunch,
        ) -> Pin<Box<dyn Future<Output = Result<ApprovedPreviewLaunch, String>> + Send>>
        + Send
        + Sync,
>;
pub struct PreviewStartInput<'a> {
    pub owner_id: &'a str,
    pub session_id: &'a str,
    pub project: &'a ProjectSnapshot,
    pub command: Option<&'a str>,
    pub target: &'a str,
    pub port: Option<u16>,
    pub framework_hint: Option<&'a str>,
}
/// Whether a failed start has released its process ownership.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PreviewStartError {
    /// The process was never started, or its cleanup completed successfully.
    NoProcess(String),
    /// Process cleanup could not be confirmed; retain the host capacity lease.
    CleanupUnconfirmed(String),
}
impl From<String> for PreviewStartError {
    fn from(message: String) -> Self {
        Self::NoProcess(message)
    }
}
impl From<&str> for PreviewStartError {
    fn from(message: &str) -> Self {
        Self::NoProcess(message.to_owned())
    }
}

pub struct LocalPreviewRunner {
    pool: ProcessPool,
    authority: LaunchAuthority,
    starts: Arc<Semaphore>,
}
impl LocalPreviewRunner {
    pub fn new(pool: ProcessPool, authority: LaunchAuthority) -> Self {
        Self {
            pool,
            authority,
            starts: Arc::new(Semaphore::new(4)),
        }
    }
    /// Project metadata must come from the existing authorized filesystem path.
    /// No network request or process starts before approval of the exact launch.
    pub async fn start(
        &self,
        input: PreviewStartInput<'_>,
        cancel: ProcessCancellation,
    ) -> Result<PreviewProcess, PreviewStartError> {
        if input.owner_id.is_empty() || input.session_id.is_empty() || cancel.is_cancelled() {
            return Err("Preview start cancelled or missing owner".into());
        }
        let _permit = self
            .starts
            .clone()
            .try_acquire_owned()
            .map_err(|_| "Preview start capacity unavailable")?;
        let project = if input.command.is_some_and(|s| !s.is_empty())
            || input.framework_hint.is_some_and(|s| !s.is_empty())
        {
            input.project
        } else {
            resolve_preview_project(input.project)?
        };
        if !project.root.is_absolute() {
            return Err("Preview project root must be absolute".into());
        }
        let port = match input.port.filter(|p| *p > 0) {
            Some(p) => p,
            None => {
                let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
                    .await
                    .map_err(|_| "Failed to allocate preview port")?;
                listener
                    .local_addr()
                    .map_err(|_| "Failed to allocate preview port")?
                    .port()
            }
        };
        let command = detect_preview_command(project, input.command, port, input.framework_hint)?;
        if command.len() > 64 * 1024 {
            return Err("Preview command exceeds byte limit".into());
        }
        let url = normalize_target_url(input.target, port)?;
        let launch = PreviewLaunch {
            owner_id: input.owner_id.into(),
            session_id: input.session_id.into(),
            root: project.root.clone(),
            command: command.clone(),
            url: url.clone(),
            port,
        };
        let approval = tokio::select! {
            biased;
            _=cancel.wait_cancelled()=>return Err("Preview start cancelled".into()),
            result=tokio::time::timeout(Duration::from_secs(30),(self.authority)(launch))=>result.map_err(|_|"Preview authorization timed out")??,
        };
        // Authorization may complete in the same poll that cancellation fires.
        // Recheck before admitting any process or readiness work.
        if cancel.is_cancelled() {
            return Err("Preview start cancelled".into());
        }
        if approval.expires_at <= Instant::now()
            || approval.addresses.is_empty()
            || approval.addresses.len() > 16
            || approval.addresses.iter().any(|a| {
                a.port() != url.port_or_known_default().unwrap_or(0)
                    || a.ip().is_unspecified()
                    || a.ip().is_multicast()
            })
            || approval.process.cwd != project.root
            || approval.process.timeout > Duration::from_secs(4 * 3600)
            || approval.process.timeout.is_zero()
            || approval.process.output_limit == 0
            || approval.process.output_limit > 4 * 1024 * 1024
        {
            return Err("Invalid or expired preview launch authority".into());
        }
        let host = url.host_str().ok_or("Invalid preview URL")?;
        let client = reqwest::Client::builder()
            .no_proxy()
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(Duration::from_secs(3))
            .timeout(Duration::from_secs(3))
            .resolve_to_addrs(host, &approval.addresses)
            .build()
            .map_err(|_| "Preview readiness client unavailable")?;
        let expiry = approval.expires_at;
        let owned_cancel = ProcessCancellation::default();
        let task_cancel = owned_cancel.clone();
        let pool = self.pool.clone();
        let request = approval.process;
        let task = tokio::spawn(async move {
            let revalidate = |_: &ProcessRequest| {
                if Instant::now() >= expiry {
                    Err(std::io::Error::new(
                        std::io::ErrorKind::PermissionDenied,
                        "Preview launch authority expired",
                    ))
                } else {
                    Ok(())
                }
            };
            let run = pool.run_revalidated(request, task_cancel.clone(), &revalidate);
            tokio::pin!(run);
            tokio::select! {
                biased;
                _=tokio::time::sleep_until(tokio::time::Instant::from_std(expiry))=>{
                    task_cancel.cancel();
                    // Keep the pool future alive to kill and reap an admitted child
                    // before its permit is released. The host's stop deadline still
                    // bounds this wait and reports unconfirmed cleanup on timeout.
                    run.await.map_err(|_| "Preview process cleanup failed".to_string())
                },
                result=&mut run=>result.map_err(|_|"Preview process failed".to_string()),
            }
        });
        let mut process = PreviewProcess {
            port,
            command,
            url: url.to_string(),
            cancel: owned_cancel,
            task: Some(task),
        };
        let ready = async {
            loop {
                if process.task.as_ref().is_some_and(|t| t.is_finished()) {
                    return Err("Preview command exited before the server was ready".to_string());
                }
                // Scope is pinned. Redirects neither prove readiness nor inherit authority.
                if let Ok(response) = client.get(url.clone()).send().await {
                    let status = response.status();
                    if !status.is_redirection() && status.as_u16() < 500 {
                        return Ok(());
                    }
                }
                tokio::time::sleep(Duration::from_millis(250)).await;
            }
        };
        let result = tokio::select! {
            _=cancel.wait_cancelled()=>Err("Preview start cancelled".into()),
            _=tokio::time::sleep_until(tokio::time::Instant::from_std(expiry))=>Err("Preview launch authority expired".into()),
            result=tokio::time::timeout(Duration::from_secs(45),ready)=>result.unwrap_or_else(|_|Err("Preview server did not become ready".into())),
        };
        if let Err(error) = result {
            return Err(match process.stop().await {
                Ok(_) => PreviewStartError::NoProcess(error),
                Err(_) => PreviewStartError::CleanupUnconfirmed(error),
            });
        }
        Ok(process)
    }
}
/// Owns the process future and its process-group cleanup. Supervised shutdown
/// calls stop and awaits cleanup. A dropped lease aborts its owned future and
/// the canonical ProcessPool guard kills the child/process group.
pub struct PreviewProcess {
    pub port: u16,
    pub command: String,
    pub url: String,
    cancel: ProcessCancellation,
    task: Option<JoinHandle<Result<ProcessResult, String>>>,
}
impl PreviewProcess {
    #[cfg(test)]
    #[allow(dead_code)] // Kept as the test constructor; not every suite uses it.
    pub(super) fn for_test(task: JoinHandle<Result<ProcessResult, String>>) -> Self {
        Self {
            port: 1,
            command: String::new(),
            url: String::new(),
            cancel: ProcessCancellation::default(),
            task: Some(task),
        }
    }
    pub fn is_finished(&self) -> bool {
        self.task.as_ref().is_none_or(|t| t.is_finished())
    }
    pub async fn stop(&mut self) -> Result<Option<ProcessResult>, String> {
        self.cancel.cancel();
        let Some(task) = self.task.as_mut() else {
            return Ok(None);
        };
        let result = tokio::time::timeout(Duration::from_secs(5), task).await;
        // Keep ownership in self across the await: cancelling this future must
        // leave Drop able to abort the process task.
        let task = self.task.take().expect("process task retained during stop");
        match result {
            Ok(Ok(result)) => result.map(Some),
            Ok(Err(_)) => Err("Preview process owner failed".into()),
            Err(_) => {
                task.abort();
                let _ = task.await;
                Err("Preview process cleanup timed out".into())
            }
        }
    }
}
impl Drop for PreviewProcess {
    fn drop(&mut self) {
        self.cancel.cancel();
        if let Some(task) = self.task.take() {
            task.abort();
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        collections::HashSet,
        num::NonZeroU16,
        sync::atomic::{AtomicUsize, Ordering},
    };
    fn project() -> ProjectSnapshot {
        ProjectSnapshot {
            root: "/approved/app".into(),
            package: Some(serde_json::json!({"scripts":{"dev":"x"}})),
            files: HashSet::new(),
            ancestor_locks: vec![],
            applications: vec![],
        }
    }
    #[tokio::test]
    async fn cancellation_never_requests_launch_authority() {
        let calls = Arc::new(AtomicUsize::new(0));
        let count = calls.clone();
        let runner = LocalPreviewRunner::new(
            ProcessPool::new(NonZeroU16::new(1).unwrap()),
            Arc::new(move |_| {
                count.fetch_add(1, Ordering::SeqCst);
                Box::pin(async { Err("denied".into()) })
            }),
        );
        let cancel = ProcessCancellation::default();
        cancel.cancel();
        let p = project();
        let result = runner
            .start(
                PreviewStartInput {
                    owner_id: "u",
                    session_id: "s",
                    project: &p,
                    command: None,
                    target: "",
                    port: Some(5173),
                    framework_hint: None,
                },
                cancel,
            )
            .await;
        assert!(result.is_err());
        assert_eq!(calls.load(Ordering::SeqCst), 0);
    }
    #[tokio::test]
    async fn cancellation_during_authorization_rejects_ready_grant() {
        let cancel = ProcessCancellation::default();
        let authority_cancel = cancel.clone();
        let runner = LocalPreviewRunner::new(
            ProcessPool::new(NonZeroU16::new(1).unwrap()),
            Arc::new(move |_| {
                let cancel = authority_cancel.clone();
                Box::pin(async move {
                    cancel.cancel();
                    Ok(ApprovedPreviewLaunch {
                        process: ProcessRequest {
                            argv: vec!["should-not-run".into()],
                            cwd: "/approved/app".into(),
                            environment: Default::default(),
                            input: None,
                            timeout: Duration::from_secs(10),
                            output_limit: 1024,
                        },
                        addresses: vec!["127.0.0.1:5173".parse().unwrap()],
                        expires_at: Instant::now() + Duration::from_secs(10),
                    })
                })
            }),
        );
        let p = project();
        let result = runner
            .start(
                PreviewStartInput {
                    owner_id: "u",
                    session_id: "s",
                    project: &p,
                    command: None,
                    target: "",
                    port: Some(5173),
                    framework_hint: None,
                },
                cancel,
            )
            .await;
        assert!(
            matches!(result, Err(PreviewStartError::NoProcess(message)) if message == "Preview start cancelled")
        );
    }
    #[tokio::test]
    async fn denied_authority_never_spawns_a_process() {
        let runner = LocalPreviewRunner::new(
            ProcessPool::new(NonZeroU16::new(1).unwrap()),
            Arc::new(|launch| {
                assert_eq!(launch.command, "npm run dev");
                assert_eq!(launch.root, PathBuf::from("/approved/app"));
                Box::pin(async { Err("denied by scope".into()) })
            }),
        );
        let p = project();
        let result = runner
            .start(
                PreviewStartInput {
                    owner_id: "u",
                    session_id: "s",
                    project: &p,
                    command: None,
                    target: "",
                    port: Some(5173),
                    framework_hint: None,
                },
                ProcessCancellation::default(),
            )
            .await;
        assert!(
            matches!(result,Err(PreviewStartError::NoProcess(message)) if message=="denied by scope")
        );
    }
}

#[cfg(all(test, unix))]
mod expiry_queue_tests {
    use super::*;
    use std::{
        collections::{HashMap, HashSet},
        num::NonZeroU16,
    };

    #[tokio::test]
    async fn expiry_while_waiting_for_process_capacity_does_not_spawn() {
        let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let root = manifest
            .ancestors()
            .find(|path| path.join("packages/gateway-rust/Cargo.toml").is_file())
            .expect("project root")
            .to_path_buf();
        let dir = root
            .join(".jait/artifacts/gateway-rust/preview-expiry-test")
            .join(format!("{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let holder_marker = dir.join("holder-started");
        let preview_marker = dir.join("preview-started");
        let pool = ProcessPool::new(NonZeroU16::new(1).unwrap());
        let request = |script: String| ProcessRequest {
            argv: vec!["/bin/sh".into(), "-c".into(), script],
            cwd: root.clone(),
            environment: HashMap::new(),
            input: None,
            timeout: Duration::from_secs(10),
            output_limit: 1024,
        };
        let holder_cancel = ProcessCancellation::default();
        let holder = tokio::spawn({
            let pool = pool.clone();
            let cancel = holder_cancel.clone();
            let req = request(format!(
                "printf x > '{}'; exec /bin/sleep 8",
                holder_marker.display()
            ));
            async move { pool.run(req, cancel).await }
        });
        tokio::time::timeout(Duration::from_secs(3), async {
            while !holder_marker.exists() {
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
        })
        .await
        .expect("capacity holder did not start");
        let process = request(format!("printf x > '{}'", preview_marker.display()));
        let authority: LaunchAuthority = Arc::new(move |_| {
            let process = process.clone();
            Box::pin(async move {
                Ok(ApprovedPreviewLaunch {
                    process,
                    addresses: vec!["127.0.0.1:5173".parse().unwrap()],
                    expires_at: Instant::now() + Duration::from_millis(500),
                })
            })
        });
        let runner = LocalPreviewRunner::new(pool, authority);
        let project = ProjectSnapshot {
            root,
            package: None,
            files: HashSet::new(),
            ancestor_locks: vec![],
            applications: vec![],
        };
        let result = tokio::time::timeout(
            Duration::from_secs(3),
            runner.start(
                PreviewStartInput {
                    owner_id: "owner",
                    session_id: "session",
                    project: &project,
                    command: Some("irrelevant"),
                    target: "http://127.0.0.1:5173",
                    port: Some(5173),
                    framework_hint: None,
                },
                ProcessCancellation::default(),
            ),
        )
        .await
        .expect("preview did not expire");
        assert!(result.is_err());
        assert!(
            !holder.is_finished(),
            "holder must retain capacity until grant expiry"
        );
        holder_cancel.cancel();
        holder.await.unwrap().unwrap();
        tokio::time::sleep(Duration::from_millis(50)).await;
        assert!(!preview_marker.exists(), "expired preview command ran");
        std::fs::remove_dir_all(dir).unwrap();
    }
    #[tokio::test]
    async fn expiry_reaps_running_child_before_releasing_process_capacity() {
        let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let root = manifest
            .ancestors()
            .find(|path| path.join("packages/gateway-rust/Cargo.toml").is_file())
            .expect("project root")
            .to_path_buf();
        let dir = root
            .join(".jait/artifacts/gateway-rust/preview-expiry-test")
            .join(format!("running-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let pid_file = dir.join("pid");
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        drop(listener);
        let pool = ProcessPool::new(NonZeroU16::new(1).unwrap());
        let request = ProcessRequest {
            argv: vec![
                "/bin/sh".into(),
                "-c".into(),
                format!("printf %s $$ > '{}'; exec /bin/sleep 8", pid_file.display()),
            ],
            cwd: root.clone(),
            environment: HashMap::new(),
            input: None,
            timeout: Duration::from_secs(10),
            output_limit: 1024,
        };
        let authority: LaunchAuthority = Arc::new(move |_| {
            let process = request.clone();
            Box::pin(async move {
                Ok(ApprovedPreviewLaunch {
                    process,
                    addresses: vec![format!("127.0.0.1:{port}").parse().unwrap()],
                    expires_at: Instant::now() + Duration::from_millis(900),
                })
            })
        });
        let runner = LocalPreviewRunner::new(pool.clone(), authority);
        let project = ProjectSnapshot {
            root: root.clone(),
            package: None,
            files: HashSet::new(),
            ancestor_locks: vec![],
            applications: vec![],
        };
        let start = tokio::spawn(async move {
            runner
                .start(
                    PreviewStartInput {
                        owner_id: "owner",
                        session_id: "session",
                        project: &project,
                        command: Some("irrelevant"),
                        target: "",
                        port: Some(port),
                        framework_hint: None,
                    },
                    ProcessCancellation::default(),
                )
                .await
        });
        tokio::time::timeout(Duration::from_secs(3), async {
            while !pid_file.exists() {
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
        })
        .await
        .expect("preview child did not start");
        let pid: u32 = std::fs::read_to_string(&pid_file).unwrap().parse().unwrap();
        let follower = tokio::spawn(async move {
            pool.run(
                ProcessRequest {
                    argv: vec![
                        "/bin/sh".into(),
                        "-c".into(),
                        format!("if kill -0 {pid} 2>/dev/null; then exit 1; else exit 0; fi"),
                    ],
                    cwd: root,
                    environment: HashMap::new(),
                    input: None,
                    timeout: Duration::from_secs(5),
                    output_limit: 1024,
                },
                ProcessCancellation::default(),
            )
            .await
        });
        tokio::time::sleep(Duration::from_millis(100)).await;
        assert!(
            !follower.is_finished(),
            "follower must wait for the preview permit"
        );
        let result = tokio::time::timeout(Duration::from_secs(5), start)
            .await
            .unwrap()
            .unwrap();
        assert!(
            matches!(result, Err(PreviewStartError::NoProcess(_))),
            "expiry should confirm process cleanup"
        );
        let result = tokio::time::timeout(Duration::from_secs(5), follower)
            .await
            .unwrap()
            .unwrap()
            .unwrap();
        assert_eq!(
            result.exit_code,
            Some(0),
            "capacity released before child was reaped"
        );
        std::fs::remove_dir_all(dir).unwrap();
    }
}
