//! Supervised repository checks and proposed fix plans. No check or task runs at construction.
//! Host supplies identity-aware authority, captured environment, shell and bounded pools.
use crate::{
    contracts::bounded_json::limit_utf8,
    db::{identifiers::uuidv7, worker::DatabaseWorker},
    execution::process_runner::{ProcessCancellation, ProcessPool, ProcessRequest},
    runtime::blocking::BlockingLane,
    services::{
        plans::{CreatePlan, PlanService, new_task_id},
        repositories::{RepositoryRecord, RepositoryService},
    },
};
use rusqlite::{OptionalExtension, params};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{
    collections::{HashMap, HashSet},
    path::PathBuf,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use tokio::{
    sync::{Semaphore, oneshot},
    task::JoinHandle,
};
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MaintenanceCheck {
    pub name: String,
    pub command: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct MaintenanceConfig {
    pub checks: Vec<MaintenanceCheck>,
    pub timeout_ms: u64,
    pub preferred_provider: Option<String>,
}
impl Default for MaintenanceConfig {
    fn default() -> Self {
        Self {
            checks: [
                ("Typecheck", "bun run typecheck"),
                ("Tests", "bun run test"),
                ("Lint", "bun run lint"),
            ]
            .into_iter()
            .map(|(name, command)| MaintenanceCheck {
                name: name.into(),
                command: command.into(),
            })
            .collect(),
            timeout_ms: 120_000,
            preferred_provider: None,
        }
    }
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckResult {
    pub name: String,
    pub command: String,
    pub passed: bool,
    pub output: String,
    pub duration_ms: u64,
    pub timed_out: bool,
    pub cancelled: bool,
    pub truncated: bool,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MaintenanceRunResult {
    pub id: String,
    pub job_id: String,
    pub repo_id: String,
    pub repo_name: String,
    pub checks: Vec<CheckResult>,
    pub all_passed: bool,
    pub plan_id: Option<String>,
    pub started_at: String,
    pub completed_at: String,
    pub cancelled: bool,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MaintenanceRunRecord {
    pub id: String,
    pub job_id: String,
    pub status: String,
    pub triggered_by: String,
    pub output: Option<String>,
    pub error: Option<String>,
    pub plan_id: Option<String>,
    pub started_at: String,
    pub completed_at: Option<String>,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MaintenancePlan {
    pub repo: RepositoryRecord,
    pub checks: Vec<MaintenanceCheck>,
    pub timeout_ms: u64,
    pub job_id: String,
}
/// Every method must check current identity/scope/expiry and return an owned lease.
/// Repo lease prevents deletion/retargeting; commands may mutate files and need
/// existing shell consent. Plan permission never implies task execution permission.
pub trait MaintenanceAuthority: Send + Sync {
    fn repository(&self, repo: &RepositoryRecord) -> Result<Arc<dyn Send + Sync>, String>;
    fn check(
        &self,
        repo: &RepositoryRecord,
        check: &MaintenanceCheck,
        request: &ProcessRequest,
    ) -> Result<Arc<dyn Send + Sync>, String>;
    fn propose_plan(
        &self,
        repo: &RepositoryRecord,
        tasks: &[Value],
    ) -> Result<Arc<dyn Send + Sync>, String>;
    fn read_run(&self, run: &MaintenanceRunRecord) -> Result<(), String>;
}
struct Inner {
    db: DatabaseWorker,
    lane: BlockingLane,
    pool: ProcessPool,
    environment: HashMap<String, String>,
    shell: Vec<String>,
    authority: Arc<dyn MaintenanceAuthority>,
    permits: Arc<Semaphore>,
    repos: Mutex<HashSet<String>>,
    tasks: Mutex<Vec<JoinHandle<()>>>,
    stop: ProcessCancellation,
}
#[derive(Clone)]
pub struct MaintenanceService(Arc<Inner>);
struct RepoGuard {
    service: MaintenanceService,
    repo: String,
    _permit: tokio::sync::OwnedSemaphorePermit,
}
impl Drop for RepoGuard {
    fn drop(&mut self) {
        if let Ok(mut repos) = self.service.0.repos.lock() {
            repos.remove(&self.repo);
        }
    }
}
struct CancelOnDrop {
    cancel: ProcessCancellation,
    armed: bool,
}
impl Drop for CancelOnDrop {
    fn drop(&mut self) {
        if self.armed {
            self.cancel.cancel();
        }
    }
}
fn now() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}
impl MaintenanceService {
    /// shell is an explicit argv prefix, e.g. ["/bin/sh","-c"]. Never inferred
    /// from an untrusted repository or process environment. At most four owned runs.
    pub fn new(
        db: DatabaseWorker,
        lane: BlockingLane,
        pool: ProcessPool,
        environment: HashMap<String, String>,
        shell: Vec<String>,
        authority: Arc<dyn MaintenanceAuthority>,
    ) -> Result<Self, String> {
        if shell.is_empty()
            || shell.len() > 8
            || shell.iter().any(|s| s.is_empty() || s.contains('\0'))
        {
            return Err("invalid maintenance shell".into());
        }
        Ok(Self(Arc::new(Inner {
            db,
            lane,
            pool,
            environment,
            shell,
            authority,
            permits: Arc::new(Semaphore::new(4)),
            repos: Mutex::new(HashSet::new()),
            tasks: Mutex::new(vec![]),
            stop: ProcessCancellation::default(),
        })))
    }
    pub async fn plan(
        &self,
        repo_id: &str,
        job_id: &str,
        config: MaintenanceConfig,
    ) -> Result<MaintenancePlan, String> {
        if job_id.is_empty() || job_id.len() > 512 {
            return Err("invalid maintenance job id".into());
        }
        if config.checks.len() > 32
            || config.timeout_ms == 0
            || config.timeout_ms > 600_000
            || config.checks.iter().any(|c| {
                c.name.is_empty()
                    || c.name.len() > 256
                    || c.command.is_empty()
                    || c.command.len() > 16_384
                    || c.command.contains('\0')
            })
        {
            return Err("maintenance configuration exceeds bounds".into());
        }
        let id = repo_id.to_owned();
        let repo = self
            .0
            .db
            .run(move |db| Ok(RepositoryService::new(db).get(&id)?))
            .await
            .map_err(|e| e.to_string())?
            .ok_or_else(|| format!("Repository not found: {repo_id}"))?;
        let _lease = self.0.authority.repository(&repo)?;
        let path = PathBuf::from(&repo.local_path);
        self.0
            .lane
            .run(move || validate_repo_path(&path))
            .await
            .map_err(|e| e.to_string())?
            .map_err(|e| e.to_string())?;
        Ok(MaintenancePlan {
            repo,
            checks: config.checks,
            timeout_ms: config.timeout_ms,
            job_id: job_id.into(),
        })
    }
    pub async fn run_for_repo(
        &self,
        repo_id: &str,
        job_id: &str,
        config: MaintenanceConfig,
        cancel: ProcessCancellation,
    ) -> Result<MaintenanceRunResult, String> {
        if self.0.stop.is_cancelled() || cancel.is_cancelled() {
            return Err("maintenance stopped".into());
        }
        let permit = self
            .0
            .permits
            .clone()
            .try_acquire_owned()
            .map_err(|_| "maintenance capacity unavailable")?;
        let plan = self.plan(repo_id, job_id, config).await?;
        let receive = {
            let mut tasks = self
                .0
                .tasks
                .lock()
                .map_err(|_| "maintenance supervisor unavailable")?;
            tasks.retain(|task| !task.is_finished());
            let mut repos = self
                .0
                .repos
                .lock()
                .map_err(|_| "maintenance supervisor unavailable")?;
            if self.0.stop.is_cancelled() || !repos.insert(repo_id.into()) {
                return Err("maintenance stopped or repository already running".into());
            }
            let guard = Arc::new(RepoGuard {
                service: self.clone(),
                repo: repo_id.into(),
                _permit: permit,
            });
            drop(repos);
            let service = self.clone();
            let child_cancel = cancel.clone();
            let (send, receive) = oneshot::channel();
            let task = tokio::spawn(async move {
                let result = service.execute(plan, child_cancel, guard).await;
                let _ = send.send(result);
            });
            tasks.push(task);
            receive
        };
        // Caller disconnect cancels the child, but the supervisor retains it until
        // process cleanup and durable finalization finish. shutdown() drains it.
        let mut cancel_guard = CancelOnDrop {
            cancel,
            armed: true,
        };
        let result = receive
            .await
            .map_err(|_| "maintenance supervisor task failed".to_owned())?;
        cancel_guard.armed = false;
        result
    }
    async fn execute(
        &self,
        plan: MaintenancePlan,
        cancel: ProcessCancellation,
        guard: Arc<RepoGuard>,
    ) -> Result<MaintenanceRunResult, String> {
        let repo_lease = self.0.authority.repository(&plan.repo)?;
        let db = self
            .0
            .db
            .with_job_guard(Arc::new((guard.clone(), repo_lease.clone())));
        let run_id = uuidv7().to_string();
        let started_at = now();
        let id = run_id.clone();
        let job = plan.job_id.clone();
        let started = started_at.clone();
        let expected = plan.repo.clone();
        let auth = self.0.authority.clone();
        db.run(move|db|{
            let current=RepositoryService::new(db).get(&expected.id)?.ok_or("repository removed before maintenance")?;
            if current.local_path!=expected.local_path||current.user_id!=expected.user_id{return Err("repository changed before maintenance".into());}
            let _lease=auth.repository(&current).map_err(std::io::Error::other)?;
            db.execute("INSERT INTO scheduled_job_runs(id,job_id,status,triggered_by,started_at) VALUES(?,?,'running','maintenance',?)",params![id,job,started])?;Ok(())}).await.map_err(|e|e.to_string())?;
        let deadline = Instant::now() + Duration::from_secs(600);
        let mut results = vec![];
        let mut errors = vec![];
        for check in &plan.checks {
            if cancel.is_cancelled() || self.0.stop.is_cancelled() {
                cancel.cancel();
                break;
            }
            let start = Instant::now();
            let mut argv = self.0.shell.clone();
            argv.push(check.command.clone());
            let mut environment = self.0.environment.clone();
            environment.insert("CI".into(), "true".into());
            environment.insert("FORCE_COLOR".into(), "0".into());
            let remaining = deadline.saturating_duration_since(Instant::now());
            if remaining.is_zero() {
                errors.push("maintenance total duration budget exhausted".into());
                break;
            }
            let request = ProcessRequest {
                argv,
                cwd: PathBuf::from(&plan.repo.local_path),
                environment,
                input: None,
                timeout: Duration::from_millis(plan.timeout_ms).min(remaining),
                output_limit: 1024 * 1024,
            };
            let result=async {
                let _lease=self.0.authority.check(&plan.repo,check,&request)?;
                let path=request.cwd.clone();self.0.lane.run(move||validate_repo_path(&path)).await.map_err(|e|e.to_string())?.map_err(|e|e.to_string())?;
                tokio::select! {
                    result=self.0.pool.run(request,cancel.clone())=>result.map_err(|e|e.to_string()),
                    _=self.0.stop.wait_cancelled()=>{cancel.cancel();Err("maintenance stopped".into())}
                }
            }.await;
            let mut record = CheckResult {
                name: check.name.clone(),
                command: check.command.clone(),
                passed: false,
                output: String::new(),
                duration_ms: start.elapsed().as_millis().min(u64::MAX as u128) as u64,
                timed_out: false,
                cancelled: cancel.is_cancelled(),
                truncated: false,
            };
            match result {
                Ok(out) => {
                    record.passed = out.exit_code == Some(0)
                        && !out.timed_out
                        && !out.cancelled
                        && !out.truncated;
                    record.output = limit_utf8(&out.output, 50_000, Some(""));
                    record.timed_out = out.timed_out;
                    record.cancelled = out.cancelled;
                    record.truncated = out.truncated || out.output.len() > 50_000;
                }
                Err(error) => {
                    record.output = limit_utf8(&error, 50_000, None);
                }
            }
            results.push(record);
        }
        let cancelled = cancel.is_cancelled() || self.0.stop.is_cancelled();
        if cancelled {
            errors.push("maintenance cancelled".into());
        }
        let all_passed = !cancelled
            && errors.is_empty()
            && results.len() == plan.checks.len()
            && results.iter().all(|r| r.passed);
        let completed_at = now();
        let tasks = if cancelled {
            vec![]
        } else {
            fix_tasks(&results)
        };
        // Authorize proposed plan separately. Fail closed but still finalize the run.
        let auth = self.0.authority.clone();
        let id = run_id.clone();
        let completed = completed_at.clone();
        let repo = plan.repo.clone();
        let records = results.clone();
        let final_cancel = cancel.clone();
        let final_stop = self.0.stop.clone();
        let (plan_id,cancelled,all_passed)=db.run(move|db|{
            let final_cancelled=cancelled||final_cancel.is_cancelled()||final_stop.is_cancelled();
            let final_passed=all_passed&&!final_cancelled;
            if final_cancelled&&!cancelled{errors.push("maintenance cancelled during finalization".into());}
            let proposal_lease=if tasks.is_empty()||final_cancelled{None}else{match auth.propose_plan(&repo,&tasks){Ok(lease)=>Some(lease),Err(error)=>{errors.push(format!("fix plan denied: {error}"));None}}};
            let tx=db.unchecked_transaction()?;
            let mut plan_id=None;
            if proposal_lease.is_some() {
                let date=chrono::DateTime::parse_from_rfc3339(&completed)?.format("%Y-%m-%d").to_string();
                match PlanService::with_time(&tx,&completed).create(CreatePlan{repo_id:repo.id.clone(),user_id:repo.user_id.clone(),title:format!("Maintenance: {} check(s) failed — {date}",tasks.len()),tasks:Some(tasks)}) {
                    Ok(plan)=>plan_id=Some(plan.id),Err(_)=>errors.push("fix plan persistence failed".into())
                }
            }
            let output=records.iter().map(|r|format!("{} {} ({}ms)",if r.passed{"✓"}else{"✗"},r.name,r.duration_ms)).collect::<Vec<_>>().join("\n");
            let failure=records.iter().filter(|r|!r.passed).map(|r|format!("{}: {}",r.name,limit_utf8(&r.output,2000,Some("")))).chain(errors).collect::<Vec<_>>().join("\n---\n");
            let changed=tx.execute("UPDATE scheduled_job_runs SET status=?,output=?,error=?,plan_id=?,completed_at=? WHERE id=? AND status='running'",params![if final_passed{"completed"}else{"failed"},output,if final_passed{None}else{Some(limit_utf8(&failure,50_000,Some("")))},plan_id,completed,id])?;
            if changed!=1{return Err("maintenance run ownership changed during finalization".into());}
            tx.commit()?;Ok((plan_id,final_cancelled,final_passed))
        }).await.map_err(|e|format!("maintenance finalization failed; running record requires recovery: {e}"))?;
        Ok(MaintenanceRunResult {
            id: run_id,
            job_id: plan.job_id,
            repo_id: plan.repo.id,
            repo_name: plan.repo.name,
            checks: results,
            all_passed,
            plan_id,
            started_at,
            completed_at,
            cancelled,
        })
    }
    /// Repository discovery is bounded and owner-filtered. Unauthorized repositories
    /// fail per repository and are surfaced to the caller, not silently ignored.
    pub async fn run_all(
        &self,
        user_id: &str,
        job_id: &str,
        config: MaintenanceConfig,
        cancel: ProcessCancellation,
    ) -> Result<Vec<Result<MaintenanceRunResult, String>>, String> {
        let user = user_id.to_owned();
        let ids=self.0.db.run(move|db|{let mut stmt=db.prepare("SELECT id FROM automation_repositories WHERE user_id=? ORDER BY updated_at DESC,id LIMIT 101")?;Ok(stmt.query_map([user],|r|r.get::<_,String>(0))?.collect::<Result<Vec<_>,_>>()?)}).await.map_err(|e|e.to_string())?;
        if ids.len() > 100 {
            return Err("maintenance repository limit exceeded; select a repository".into());
        }
        let mut results = vec![];
        for id in ids {
            if cancel.is_cancelled() || self.0.stop.is_cancelled() {
                break;
            }
            results.push(
                self.run_for_repo(&id, job_id, config.clone(), cancel.clone())
                    .await,
            );
        }
        Ok(results)
    }
    pub async fn list_runs(
        &self,
        job_id: Option<String>,
        limit: usize,
    ) -> Result<Vec<MaintenanceRunRecord>, String> {
        let limit = limit.clamp(1, 100);
        let records=self.0.db.run(move|db|{let mut stmt=db.prepare("SELECT id,job_id,status,triggered_by,output,error,plan_id,started_at,completed_at FROM scheduled_job_runs WHERE (?1 IS NULL OR job_id=?1) ORDER BY started_at DESC,id LIMIT ?2")?;Ok(stmt.query_map(params![job_id,limit as i64],run_record)?.collect::<Result<Vec<_>,_>>()?)}).await.map_err(|e|e.to_string())?;
        for record in &records {
            self.0.authority.read_run(record)?;
        }
        Ok(records)
    }
    pub async fn get_run(&self, id: &str) -> Result<Option<MaintenanceRunRecord>, String> {
        let id = id.to_owned();
        let record=self.0.db.run(move|db|Ok(db.query_row("SELECT id,job_id,status,triggered_by,output,error,plan_id,started_at,completed_at FROM scheduled_job_runs WHERE id=?",[id],run_record).optional()?)).await.map_err(|e|e.to_string())?;
        if let Some(r) = &record {
            self.0.authority.read_run(r)?;
        }
        Ok(record)
    }
    /// Domain supervisor owns all child tasks. No global process pool is closed here.
    pub async fn shutdown(&self) -> Result<(), String> {
        self.0.stop.cancel();
        self.0.permits.close();
        let tasks = std::mem::take(
            &mut *self
                .0
                .tasks
                .lock()
                .map_err(|_| "maintenance supervisor unavailable")?,
        );
        let mut failed = false;
        for task in tasks {
            failed |= task.await.is_err();
        }
        if failed {
            Err("maintenance task panicked; run recovery required".into())
        } else {
            Ok(())
        }
    }
}
fn validate_repo_path(path: &PathBuf) -> std::io::Result<()> {
    if !path.is_absolute() || !path.is_dir() || std::fs::canonicalize(path)? != *path {
        return Err(std::io::Error::other(
            "repository path is inaccessible or non canonical",
        ));
    }
    for ancestor in path.ancestors() {
        if std::fs::symlink_metadata(ancestor)?
            .file_type()
            .is_symlink()
        {
            return Err(std::io::Error::other(
                "repository symlink ancestor excluded",
            ));
        }
    }
    crate::security::path_guard::PathGuard::new(path, &[], true)?
        .validate_with_symlink_check(".")
        .map_err(std::io::Error::other)?;
    Ok(())
}
fn fix_tasks(results: &[CheckResult]) -> Vec<Value> {
    results.iter().filter(|r|!r.passed).map(|r|json!({"id":new_task_id(),"title":format!("Fix {} failures",r.name),"description":format!("The `{}` check failed. Fix the errors below.\n\n```\n{}\n```\n\nRun the same command again after fixing to verify.",r.command,limit_utf8(&r.output,8000,Some(""))),"status":"proposed"})).collect()
}
fn run_record(row: &rusqlite::Row<'_>) -> rusqlite::Result<MaintenanceRunRecord> {
    Ok(MaintenanceRunRecord {
        id: row.get(0)?,
        job_id: row.get(1)?,
        status: row.get(2)?,
        triggered_by: row.get(3)?,
        output: row.get(4)?,
        error: row.get(5)?,
        plan_id: row.get(6)?,
        started_at: row.get(7)?,
        completed_at: row.get(8)?,
    })
}
#[cfg(test)]
#[path = "maintenance_tests.rs"]
mod tests;
