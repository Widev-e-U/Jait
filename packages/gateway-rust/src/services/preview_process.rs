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
    ) -> Result<PreviewProcess, String> {
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
            _=cancel.wait_cancelled()=>return Err("Preview start cancelled".into()),
            result=tokio::time::timeout(Duration::from_secs(30),(self.authority)(launch))=>result.map_err(|_|"Preview authorization timed out")??,
        };
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
            tokio::select! {
                result=pool.run(request,task_cancel.clone())=>result.map_err(|_|"Preview process failed".to_string()),
                _=tokio::time::sleep_until(tokio::time::Instant::from_std(expiry))=>{
                    task_cancel.cancel();Err("Preview launch authority expired".into())
                }
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
            let _ = process.stop().await;
            return Err(error);
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
    pub fn is_finished(&self) -> bool {
        self.task.as_ref().is_none_or(|t| t.is_finished())
    }
    pub async fn stop(&mut self) -> Result<Option<ProcessResult>, String> {
        self.cancel.cancel();
        let Some(mut task) = self.task.take() else {
            return Ok(None);
        };
        match tokio::time::timeout(Duration::from_secs(5), &mut task).await {
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
        assert!(matches!(result,Err(message) if message=="denied by scope"));
    }
}
