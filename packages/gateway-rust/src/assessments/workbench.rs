//! Expanded security-check orchestration. Engine ports receive a private-field
//! authorization permit, never unvalidated model/tool/HTTP input. This library
//! does not mount routes, load scanners or change the production gateway.
use super::{
    service::{AssessmentAbort, AssessmentService},
    workbench_policy::{AuthorizedCheck, authorize_check, normalize_check_input},
    workbench_store::{RawArtifact, WorkbenchStore},
};
use crate::{
    security::assessment_lease::{AssessmentRelease, claim_assessment_execution},
    services::calendar::{js_text, truthy},
    time::{Clock, default_clock, iso},
};
use futures_util::{FutureExt, future::BoxFuture};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{sync::Arc, time::Duration};
use tokio::sync::{Mutex, RwLock, watch};
const FAILED: &str = "Check failed or was stopped; no successful verification is inferred";
const BUDGET: &str = "Run budget or scope expiry reached; remaining checks were stopped";
const PERSIST: &str = "Completion could not be persisted; evidence may not survive restart";
const REVISION: &str = "security-profiles-v1";
#[derive(Clone, Copy, PartialEq, Eq)]
enum Stop {
    None,
    User,
    Budget,
}
#[derive(Clone)]
pub struct WorkbenchAbort(watch::Sender<Stop>);
impl Default for WorkbenchAbort {
    fn default() -> Self {
        Self(watch::channel(Stop::None).0)
    }
}
impl WorkbenchAbort {
    pub fn abort(&self) {
        self.stop(Stop::User);
    }
    fn stop(&self, cause: Stop) {
        self.0.send_if_modified(|v| {
            if *v == Stop::None {
                *v = cause;
                true
            } else {
                false
            }
        });
    }
    pub fn aborted(&self) -> bool {
        *self.0.borrow() != Stop::None
    }
    fn budget(&self) -> bool {
        *self.0.borrow() == Stop::Budget
    }
    pub async fn cancelled(&self) {
        let mut rx = self.0.subscribe();
        while *rx.borrow_and_update() == Stop::None {
            if rx.changed().await.is_err() {
                break;
            }
        }
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdapterOutput {
    pub engine: String,
    pub engine_version: String,
    pub evidence: Vec<Value>,
    pub rules: Vec<Value>,
    pub coverage_gaps: Vec<String>,
    pub conclusive: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub raw: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub content_type: Option<String>,
}
#[derive(Clone, Debug)]
pub enum EngineError {
    Unavailable(String),
    Failed(String),
}
/// The installed host must bound process/network I/O and honor cancellation.
/// Results are evidence, never executable instructions. Engine implementations
/// are inventoried separately; providing a port grants no scanner credit.
pub type CheckAdapter = Arc<
    dyn Fn(
            AuthorizedCheck,
            WorkbenchAbort,
        ) -> BoxFuture<'static, Result<AdapterOutput, EngineError>>
        + Send
        + Sync,
>;
pub type EngineStatus =
    Arc<dyn Fn(WorkbenchAbort) -> BoxFuture<'static, Result<Value, String>> + Send + Sync>;
#[derive(Clone)]
pub struct WorkbenchOptions {
    pub clock: Clock,
    pub identifier: Arc<dyn Fn() -> String + Send + Sync>,
    pub adapter: CheckAdapter,
    pub engines: EngineStatus,
    pub duration_ms: u64,
    pub engine_dispatch: Option<super::workbench_engines::WorkbenchEngines>,
}
impl WorkbenchOptions {
    pub fn new(adapter: CheckAdapter, engines: EngineStatus) -> Self {
        Self {
            clock: default_clock(),
            identifier: Arc::new(|| uuid::Uuid::new_v4().to_string()),
            adapter,
            engines,
            duration_ms: 60_000,
            engine_dispatch: None,
        }
    }
}
struct Active {
    id: String,
    abort: WorkbenchAbort,
    done: watch::Receiver<bool>,
}
#[derive(Default)]
struct State {
    runs: Vec<Value>,
    findings: Vec<Value>,
    active: Option<Active>,
}
struct Inner {
    state: Mutex<State>,
    assessment: AssessmentService,
    store: Option<Arc<dyn WorkbenchStore>>,
    options: WorkbenchOptions,
}
#[derive(Clone)]
pub struct SecurityWorkbench(Arc<Inner>);
struct Lease(AssessmentRelease);
impl Drop for Lease {
    fn drop(&mut self) {
        self.0.release();
    }
}
fn put(records: &mut Vec<Value>, record: Value) {
    if let Some(v) = records.iter_mut().find(|v| v["id"] == record["id"]) {
        *v = record;
    } else {
        records.push(record);
    }
}
fn cached(records: &[Value], id: &str) -> Option<Value> {
    records.iter().find(|v| v["id"] == id).cloned()
}
fn gaps(run: &mut Value) -> &mut Vec<Value> {
    run["coverageGaps"].as_array_mut().expect("run gaps")
}
fn sha(text: &str) -> String {
    hex::encode(Sha256::digest(text.as_bytes()))
}
fn field<'a>(value: &'a Value, key: &str) -> Result<&'a str, String> {
    value[key]
        .as_str()
        .ok_or_else(|| format!("Invalid security record {key}"))
}
fn wire(value: &Value) -> String {
    crate::contracts::ecmascript_json::JsonDocument::parse(&value.to_string())
        .expect("JSON")
        .stringify()
}
impl SecurityWorkbench {
    pub fn memory(assessment: AssessmentService, options: WorkbenchOptions) -> Self {
        Self(Arc::new(Inner {
            state: Mutex::new(State::default()),
            assessment,
            store: None,
            options,
        }))
    }
    pub async fn persistent(
        assessment: AssessmentService,
        options: WorkbenchOptions,
        store: Arc<dyn WorkbenchStore>,
    ) -> Result<Self, String> {
        let service = Self(Arc::new(Inner {
            state: Mutex::new(State::default()),
            assessment,
            store: Some(store.clone()),
            options,
        }));
        for mut run in store.load().await? {
            if run["status"] == "running" {
                run["status"] = json!("interrupted");
                run["completedAt"] = json!(service.timestamp()?);
                gaps(&mut run).push(json!("Gateway restarted before this check completed"));
                service.save_run(run.clone()).await?;
            }
            put(&mut service.0.state.lock().await.runs, run);
        }
        Ok(service)
    }
    fn now(&self) -> i64 {
        (self.0.options.clock)()
    }
    fn timestamp(&self) -> Result<String, String> {
        iso(self.now())
    }
    async fn save_run(&self, run: Value) -> Result<(), String> {
        if let Some(store) = &self.0.store {
            store.save_run(run).await?;
        }
        Ok(())
    }
    async fn save_finding(&self, finding: Value, owner: &str) -> Result<(), String> {
        put(&mut self.0.state.lock().await.findings, finding.clone());
        if let Some(store) = &self.0.store {
            store.save_finding(finding, owner.into()).await?;
        }
        Ok(())
    }
    pub async fn authorize(
        &self,
        input: &Value,
        operator: &str,
        node: &str,
    ) -> Result<AuthorizedCheck, String> {
        if node != "gateway" {
            return Err("Security checks currently execute on the gateway only".into());
        }
        let id = input["scopeId"].as_str().ok_or("Scope not found")?;
        let scope = self.0.assessment.get_scope(id, operator).await?;
        authorize_check(input, scope, operator, node, self.now())
    }
    pub async fn get(&self, id: &str, operator: &str) -> Result<Value, String> {
        let mut run = cached(&self.0.state.lock().await.runs, id);
        if run.is_none()
            && let Some(store) = &self.0.store
        {
            run = store.run(id.into(), operator.into()).await?;
        }
        run.filter(|r| r["operatorId"] == operator)
            .ok_or_else(|| "Check not found".into())
    }
    pub async fn finding(&self, id: &str, operator: &str) -> Result<Value, String> {
        let mut finding = cached(&self.0.state.lock().await.findings, id);
        if finding.is_none()
            && let Some(store) = &self.0.store
        {
            finding = store.finding(id.into(), operator.into()).await?;
        }
        let finding = finding.ok_or("Finding not found")?;
        self.0
            .assessment
            .get_scope(field(&finding, "scopeId")?, operator)
            .await?;
        Ok(finding)
    }
    pub async fn history(&self, operator: &str) -> Result<Value, String> {
        if let Some(store) = &self.0.store {
            let h = store.history(operator.into()).await?;
            return Ok(json!({"runs":h.runs,"findings":h.findings}));
        }
        let (runs, findings) = {
            let state = self.0.state.lock().await;
            (
                state
                    .runs
                    .iter()
                    .rev()
                    .filter(|v| v["operatorId"] == operator)
                    .take(50)
                    .cloned()
                    .collect::<Vec<_>>(),
                state.findings.clone(),
            )
        };
        let mut owned = vec![];
        for f in findings {
            if let Some(scope) = f["scopeId"].as_str()
                && self.0.assessment.get_scope(scope, operator).await.is_ok()
            {
                owned.push(f);
            }
        }
        Ok(json!({"runs":runs,"findings":owned.into_iter().rev().take(256).collect::<Vec<_>>()}))
    }
    pub async fn engines(&self, signal: WorkbenchAbort) -> Result<Value, String> {
        (self.0.options.engines)(signal).await
    }
    pub async fn cancel(&self, id: &str, operator: &str) -> Result<(), String> {
        self.get(id, operator).await?;
        if let Some(active) = &self.0.state.lock().await.active
            && active.id == id
        {
            active.abort.abort();
        }
        Ok(())
    }
    pub async fn wait(&self, id: &str, operator: &str) -> Result<Value, String> {
        let done = self
            .0
            .state
            .lock()
            .await
            .active
            .as_ref()
            .filter(|a| a.id == id)
            .map(|a| a.done.clone());
        if let Some(mut done) = done {
            while !*done.borrow_and_update() {
                if done.changed().await.is_err() {
                    break;
                }
            }
        }
        self.get(id, operator).await
    }
    pub async fn start(
        &self,
        input: &Value,
        operator: &str,
        node: &str,
        external: Option<AssessmentAbort>,
    ) -> Result<Value, String> {
        let input = normalize_check_input(input)?;
        let authorized = self.authorize(&input, operator, node).await?;
        let mut state = self.0.state.lock().await;
        if state.active.is_some()
            || self.0.assessment.history(operator).await?["runs"]
                .as_array()
                .is_some_and(|r| r.iter().any(|r| r["status"] == "running"))
        {
            return Err("A security assessment is already running".into());
        }
        let id = (self.0.options.identifier)();
        let mut run = json!({"id":id,"scopeId":input["scopeId"],"operatorId":operator,"scope":authorized.scope(),"input":input,"profileRevision":REVISION,"status":"running","startedAt":self.timestamp()?,"completedAt":null,"engine":input["profile"],"engineVersion":"pending","evidence":[],"findingIds":[],"findings":[],"coverageGaps":[]});
        let lease = Lease(claim_assessment_execution(&id).map_err(str::to_string)?);
        self.save_run(run.clone()).await?;
        let abort = WorkbenchAbort::default();
        if external.as_ref().is_some_and(AssessmentAbort::aborted) {
            abort.abort();
        }
        let (completed, done) = watch::channel(false);
        state.active = Some(Active {
            id: id.clone(),
            abort: abort.clone(),
            done,
        });
        // Match the eager pre-abort path: dispatch has no opportunity to run.
        let preaborted = abort.aborted();
        if preaborted {
            run["status"] = json!("cancelled");
            run["completedAt"] = json!(self.timestamp()?);
            gaps(&mut run).push(json!(FAILED));
            if self.save_run(run.clone()).await.is_err() {
                persist_failure(&mut run, self.timestamp()?);
            }
        }
        put(&mut state.runs, run.clone());
        let service = self.clone();
        let task_run = run.clone();
        let execution_service = service.clone();
        let execution_abort = abort.clone();
        let mut work: BoxFuture<'static, ()> = Box::pin(async move {
            if !preaborted {
                execution_service.execute(task_run, execution_abort).await;
            }
        });
        // The reference enters the adapter before returning start(). Prime the
        // owned future once so immediate cancellation cannot erase an admitted
        // dispatch. Pending I/O remains owned by the spawned lifecycle task.
        let mut context = std::task::Context::from_waker(futures_util::task::noop_waker_ref());
        if work.as_mut().poll(&mut context).is_ready() {
            work = Box::pin(std::future::ready(()));
        }
        tokio::spawn(async move {
            let forward = async {
                if let Some(external) = external {
                    external.cancelled().await;
                    abort.abort();
                } else {
                    std::future::pending::<()>().await;
                }
            };
            tokio::pin!(forward);
            tokio::select! {biased;_=&mut forward=>work.await,_=&mut work=>{}}
            let mut state = service.0.state.lock().await;
            if state.active.as_ref().is_some_and(|a| a.id == id) {
                state.active = None;
            }
            drop(state);
            drop(lease);
            let _ = completed.send(true);
        });
        Ok(run)
    }
    async fn execute(&self, mut run: Value, abort: WorkbenchAbort) {
        let remaining = super::scope::validate_scope(&run["scope"], self.now())
            .map(|s| s.expiry_ms().saturating_sub(self.now()).max(1) as u64)
            .unwrap_or(1);
        let timer = tokio::time::sleep(Duration::from_millis(
            self.0.options.duration_ms.min(60_000).min(remaining).max(1),
        ));
        tokio::pin!(timer);
        let result = {
            let work = std::panic::AssertUnwindSafe(async {
                let permit = self
                    .authorize(
                        &run["input"],
                        field(&run, "operatorId").map_err(EngineError::Failed)?,
                        "gateway",
                    )
                    .await
                    .map_err(EngineError::Failed)?;
                if abort.aborted() {
                    return Err(EngineError::Failed("Cancelled before dispatch".into()));
                }
                permit
                    .ensure_live(self.now())
                    .map_err(EngineError::Failed)?;
                if let Some(engines) = &self.0.options.engine_dispatch {
                    super::workbench_engines::dispatch(
                        permit,
                        abort.clone(),
                        engines,
                        &self.0.options.clock,
                    )
                    .await
                } else {
                    (self.0.options.adapter)(permit, abort.clone()).await
                }
            })
            .catch_unwind();
            tokio::pin!(work);
            tokio::select! {biased;_=&mut timer=>{abort.stop(Stop::Budget);work.await},result=&mut work=>result}
        };
        match result {
            Ok(Ok(output)) => {
                if !matches!(
                    std::panic::AssertUnwindSafe(self.apply_output(&mut run, output, &abort))
                        .catch_unwind()
                        .await,
                    Ok(Ok(()))
                ) {
                    fail(&mut run, &abort, None);
                }
            }
            Ok(Err(EngineError::Unavailable(message))) => fail(&mut run, &abort, Some(message)),
            _ => fail(&mut run, &abort, None),
        }
        if abort.budget() {
            gaps(&mut run).push(json!(BUDGET));
        }
        run["completedAt"] = json!(self.timestamp().unwrap_or_default());
        if self.save_run(run.clone()).await.is_err() {
            persist_failure(&mut run, self.timestamp().unwrap_or_default());
        }
        put(&mut self.0.state.lock().await.runs, run);
    }
    async fn apply_output(
        &self,
        run: &mut Value,
        output: AdapterOutput,
        abort: &WorkbenchAbort,
    ) -> Result<(), String> {
        if output.evidence.len() > 256 || output.rules.len() > 256 {
            return Err("Adapter output exceeded its limit".into());
        }
        run["engine"] = json!(output.engine);
        run["engineVersion"] = json!(output.engine_version);
        run["evidence"] = json!(output.evidence);
        run["coverageGaps"] = json!(output.coverage_gaps);
        run["status"] = json!(if abort.aborted() {
            if abort.budget() {
                "partial"
            } else {
                "cancelled"
            }
        } else if output.conclusive {
            "completed"
        } else {
            "partial"
        });
        if let Some(raw) = output
            .raw
            .filter(|s| !s.is_empty() && s.len() <= 512 * 1024)
            && let Some(store) = &self.0.store
        {
            let id = (self.0.options.identifier)();
            let sha256 = sha(&raw);
            let bytes = raw.len();
            let content_type = output.content_type.unwrap_or("text/plain".into());
            store
                .save_artifact(RawArtifact {
                    id: id.clone(),
                    run: field(run, "id")?.into(),
                    owner: field(run, "operatorId")?.into(),
                    sha256: sha256.clone(),
                    content_type: content_type.clone(),
                    raw,
                })
                .await?;
            run["artifact"] =
                json!({"id":id,"sha256":sha256,"bytes":bytes,"contentType":content_type});
        }
        for observation in output.rules {
            let index = observation["evidenceIndex"]
                .as_u64()
                .ok_or("Finding references missing evidence")? as usize;
            let measured = run["evidence"]
                .as_array()
                .and_then(|e| e.get(index))
                .ok_or("Finding references missing evidence")?;
            let target = run["input"]
                .get("target")
                .filter(|v| !v.is_null())
                .unwrap_or(&measured["target"]);
            let port = run["input"]
                .get("port")
                .filter(|v| !v.is_null())
                .or_else(|| measured.get("port").filter(|v| !v.is_null()))
                .map(js_text)
                .unwrap_or_default();
            let id = sha(&format!(
                "{}|{}|{}|{}",
                field(run, "scopeId")?,
                field(&observation, "ruleId")?,
                js_text(target),
                port
            ));
            let existing = self.finding(&id, field(run, "operatorId")?).await.ok();
            let disposition = existing
                .as_ref()
                .map(|f| f["disposition"].clone())
                .filter(|d| d == "accepted-risk" || d == "false-positive")
                .unwrap_or(json!("open"));
            let mut finding = json!({"id":id,"scopeId":run["scopeId"],"runId":run["id"],"ruleId":observation["ruleId"],"target":target,"title":observation["title"],"severity":observation["severity"],"status":observation.get("status").filter(|v|!v.is_null()).unwrap_or(&json!("observed")),"confidence":observation.get("confidence").filter(|v|!v.is_null()).unwrap_or(&json!("high")),"disposition":disposition,"evidenceIds":[measured["id"].clone()],"firstSeen":existing.as_ref().and_then(|f|f.get("firstSeen")).filter(|v|!v.is_null()).unwrap_or(&measured["observedAt"]),"lastSeen":measured["observedAt"],"remediation":observation["remediation"],"rollback":observation["rollback"]});
            if let Some(port) = measured.get("port") {
                finding["port"] = port.clone();
            }
            if let Some(existing) = existing
                && truthy(&existing["decisionBy"])
            {
                finding["decisionBy"] = existing["decisionBy"].clone();
                if let Some(at) = existing.get("decisionAt") {
                    finding["decisionAt"] = at.clone();
                }
            }
            self.save_finding(finding.clone(), field(run, "operatorId")?)
                .await?;
            run["findingIds"].as_array_mut().unwrap().push(json!(id));
            run["findings"].as_array_mut().unwrap().push(finding);
        }
        Ok(())
    }
    pub async fn decide(
        &self,
        id: &str,
        operator: &str,
        disposition: &str,
    ) -> Result<Value, String> {
        if !["open", "accepted-risk", "false-positive"].contains(&disposition) {
            return Err("Unsupported finding decision".into());
        }
        let mut finding = self.finding(id, operator).await?;
        finding["disposition"] = json!(disposition);
        finding["decisionBy"] = json!(operator);
        finding["decisionAt"] = json!(self.timestamp()?);
        self.save_finding(finding.clone(), operator).await?;
        Ok(finding)
    }
    pub async fn plan(&self, id: &str, operator: &str) -> Result<Value, String> {
        let finding = self.finding(id, operator).await?;
        let run = self.get(field(&finding, "runId")?, operator).await?;
        let mut result = json!({"findingId":id,"target":finding["target"],"recommendation":finding["remediation"],"steps":["Review the cited evidence and effective service configuration.","Record a backup, current version and a way to retain legitimate access.",finding["remediation"],"Apply only the reviewed target-specific change through the existing consent-controlled terminal or configuration workflow.","Run the same verification check from this gateway."],"rollback":[finding["rollback"].clone(),json!("Repeat the check after rollback and confirm legitimate access.")],"verificationInput":run["input"],"requiresApproval":true});
        if let Some(port) = finding.get("port") {
            result["port"] = port.clone();
        }
        Ok(result)
    }
    pub async fn verify(
        &self,
        id: &str,
        operator: &str,
        node: &str,
        external: Option<AssessmentAbort>,
    ) -> Result<Value, String> {
        let mut finding = self.finding(id, operator).await?;
        let before = self.get(field(&finding, "runId")?, operator).await?;
        let started = self
            .start(&before["input"], operator, node, external)
            .await?;
        let run = self.wait(field(&started, "id")?, operator).await?;
        let mut rules = vec![];
        for id in run["findingIds"].as_array().ok_or("Invalid finding IDs")? {
            rules.push(
                self.finding(id.as_str().ok_or("Invalid finding ID")?, operator)
                    .await?["ruleId"]
                    .clone(),
            );
        }
        let mut status = "inconclusive";
        let mut reason = "Verification failed, was incomplete, or used a different engine/profile; the finding stays open.";
        if run["status"] == "completed"
            && run["scope"]["vantagePoint"] == before["scope"]["vantagePoint"]
            && run["engine"] == before["engine"]
            && run["engineVersion"] == before["engineVersion"]
            && run["profileRevision"] == before["profileRevision"]
        {
            if rules.contains(&finding["ruleId"]) {
                status = "still-observed";
                reason = "The same rule is still observed by the repeated check.";
            } else {
                let rule = field(&finding, "ruleId")?;
                let evidence = run["evidence"].as_array().ok_or("Invalid evidence")?;
                if matches!(
                    run["input"]["profile"].as_str(),
                    Some("tls" | "http" | "https" | "ssh" | "nuclei" | "trivy")
                ) && !evidence.is_empty()
                    && (!rule.starts_with("trivy.config.")
                        || evidence.iter().any(|e| {
                            js_text(
                                e["facts"]
                                    .get("passingConfigurationRules")
                                    .filter(|v| !v.is_null())
                                    .unwrap_or(&json!("")),
                            )
                            .split(',')
                            .any(|r| r == &rule[13..])
                        }))
                {
                    status = "verified-absent";
                    reason = "The same check completed conclusively from the same gateway and no longer observed this rule.";
                    finding["disposition"] = json!("verified-absent");
                    finding["verifiedByRunId"] = run["id"].clone();
                    self.save_finding(finding, operator).await?;
                } else {
                    reason = "This check did not record the relevant rule passing. Imported alerts and file directives cannot prove a live finding fixed by absence alone.";
                }
            }
        }
        Ok(json!({"findingId":id,"runId":run["id"],"status":status,"reason":reason}))
    }
    pub async fn compare(
        &self,
        before_id: &str,
        after_id: &str,
        operator: &str,
    ) -> Result<Value, String> {
        let before = self.get(before_id, operator).await?;
        let after = self.get(after_id, operator).await?;
        let comparable = before["scopeId"] == after["scopeId"]
            && wire(&normalize_check_input(&before["input"])?)
                == wire(&normalize_check_input(&after["input"])?)
            && before["scope"]["vantagePoint"] == after["scope"]["vantagePoint"]
            && before["engineVersion"] == after["engineVersion"]
            && before["profileRevision"] == after["profileRevision"]
            && before["status"] == "completed"
            && after["status"] == "completed";
        let rules = |run: &Value| -> Result<Vec<Value>, String> {
            Ok(run["findings"]
                .as_array()
                .ok_or("Invalid findings")?
                .iter()
                .map(|f| f["ruleId"].clone())
                .collect())
        };
        let previous = rules(&before)?;
        let current = rules(&after)?;
        Ok(
            json!({"beforeRunId":before_id,"afterRunId":after_id,"comparable":comparable,"addedRules":if comparable{current.iter().filter(|r|!previous.contains(r)).cloned().collect::<Vec<_>>()}else{vec![]},"noLongerObservedRules":if comparable{previous.iter().filter(|r|!current.contains(r)).cloned().collect::<Vec<_>>()}else{vec![]},"coverageGaps":if comparable{after["coverageGaps"].clone()}else{json!(["Runs differ in scope, profile, engine version, vantage point or completion; changes are inconclusive"])}}),
        )
    }
    pub async fn report(&self, id: &str, operator: &str) -> Result<Value, String> {
        let run = self.get(id, operator).await?;
        let mut targets = run["scope"]["targets"]
            .as_array()
            .ok_or("Invalid scope targets")?
            .clone();
        for key in ["evidence", "findings"] {
            for e in run[key].as_array().ok_or("Invalid run results")? {
                if !targets.contains(&e["target"]) {
                    targets.push(e["target"].clone());
                }
            }
        }
        let replace = |v: &Value| {
            json!(
                targets
                    .iter()
                    .position(|t| t == v)
                    .map(|i| format!("asset-{}", i + 1))
                    .unwrap_or("scoped-asset".into())
            )
        };
        let evidence = run["evidence"]
            .as_array()
            .unwrap()
            .iter()
            .map(|e| {
                let mut e = e.clone();
                e["target"] = replace(&e["target"]);
                e
            })
            .collect::<Vec<_>>();
        let findings = run["findings"]
            .as_array()
            .unwrap()
            .iter()
            .map(|f| {
                let mut f = f.clone();
                f["target"] = replace(&f["target"]);
                if truthy(&f["decisionBy"]) {
                    f["decisionBy"] = json!("operator");
                } else {
                    f.as_object_mut().unwrap().remove("decisionBy");
                }
                f
            })
            .collect::<Vec<_>>();
        let address = regex::Regex::new(r"(?:[0-9]{1,3}\.){3}[0-9]{1,3}").expect("static regex");
        let gaps = run["coverageGaps"]
            .as_array()
            .ok_or("Invalid gaps")?
            .iter()
            .map(|g| {
                g.as_str()
                    .map(|s| json!(address.replace_all(s, "[address]").to_string()))
                    .ok_or("Invalid gap")
            })
            .collect::<Result<Vec<_>, _>>()?;
        Ok(
            json!({"format":"jait-security-report-v1","redacted":true,"run":{"id":run["id"],"profile":run["input"]["profile"],"profileRevision":run["profileRevision"],"status":run["status"],"startedAt":run["startedAt"],"completedAt":run["completedAt"],"engine":run["engine"],"engineVersion":run["engineVersion"],"vantagePoint":"authorized-gateway","coverageGaps":gaps,"evidence":evidence},"findings":findings,"notice":"Aliases conceal selected target addresses. Review report content before sharing. No findings is not proof of security."}),
        )
    }
    pub async fn delete_run(&self, id: &str, operator: &str) -> Result<(), String> {
        let run = self.get(id, operator).await?;
        let mut state = self.0.state.lock().await;
        if state.active.as_ref().is_some_and(|a| a.id == id) || run["status"] == "running" {
            return Err("Stop the running assessment before deletion".into());
        }
        if let Some(store) = &self.0.store {
            store.delete_run(id.into(), operator.into()).await?;
        }
        state.runs.retain(|r| r["id"] != id);
        Ok(())
    }
}
fn fail(run: &mut Value, abort: &WorkbenchAbort, unavailable: Option<String>) {
    run["status"] = json!(if unavailable.is_some() {
        "unavailable"
    } else if abort.aborted() && !abort.budget() {
        "cancelled"
    } else {
        "partial"
    });
    gaps(run).push(json!(unavailable.unwrap_or(FAILED.into())));
}
fn persist_failure(run: &mut Value, at: String) {
    run["status"] = json!("partial");
    run["completedAt"] = json!(at);
    gaps(run).push(json!(PERSIST));
}
/// Reconfiguration keeps active tasks and their lease attached to the original
/// service until completion; swapping persistence never authorizes new targets.
#[derive(Clone)]
pub struct WorkbenchRegistry {
    service: Arc<RwLock<SecurityWorkbench>>,
    assessment: AssessmentService,
    options: WorkbenchOptions,
}
impl WorkbenchRegistry {
    pub fn new(assessment: AssessmentService, options: WorkbenchOptions) -> Self {
        Self {
            service: Arc::new(RwLock::new(SecurityWorkbench::memory(
                assessment.clone(),
                options.clone(),
            ))),
            assessment,
            options,
        }
    }
    pub async fn get(&self) -> SecurityWorkbench {
        self.service.read().await.clone()
    }
    pub async fn set_database(&self, store: Arc<dyn WorkbenchStore>) -> Result<(), String> {
        let service =
            SecurityWorkbench::persistent(self.assessment.clone(), self.options.clone(), store)
                .await?;
        *self.service.write().await = service;
        Ok(())
    }
}
