//! Explicit-scope TCP baseline. Only private-field per-dispatch permits reach the
//! native connector. The host supplies identity, storage and bounded adapters.
use super::{
    scope::{ValidatedScopeInput, validate_scope},
    store::AssessmentStore,
};
use crate::{
    runtime::blocking::BlockingLane,
    security::{
        assessment_lease::{AssessmentRelease, claim_assessment_execution},
        path_guard::PathGuard,
    },
    time::{Clock, default_clock, iso},
};
use futures_util::{FutureExt, future::BoxFuture};
use serde::Serialize;
use serde_json::{Value, json};
use std::{
    net::{Ipv4Addr, SocketAddrV4},
    num::NonZeroU16,
    path::Path,
    pin::Pin,
    sync::Arc,
    task::{Context, Poll},
    time::Duration,
};
use tokio::sync::{Mutex, RwLock, watch};
pub const TARGET_LIMIT: usize = 16;
pub const PORT_LIMIT: usize = 16;
pub const PROBE_TIMEOUT_MS: u64 = 750;
pub const INTERVAL_MS: u64 = 200;
pub const DURATION_MS: u64 = 60_000;
pub const ENGINE: &str = "tokio-tcp-connect";
pub const ENGINE_VERSION: &str =
    concat!("jait-native:", env!("CARGO_PKG_VERSION"), "/tcp-connect-v1");
const LIMITATIONS: &[&str] = &[
    "IPv4 TCP connections only; no UDP, IPv6, service identification or vulnerability testing.",
    "LAN observations cannot establish WAN exposure. Open ports are observations, not confirmed vulnerabilities.",
    "Timeouts and network errors are inconclusive; a refused connection does not prove the host is secure.",
];
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ProbeState {
    Open,
    Refused,
    Timeout,
    Error,
}
#[derive(Clone, Copy, PartialEq, Eq)]
enum StopCause {
    None,
    User,
    Budget,
}
/// Cancellation preserves the first stop cause, independently of wall-clock jumps.
#[derive(Clone)]
pub struct AssessmentAbort(watch::Sender<StopCause>);
impl Default for AssessmentAbort {
    fn default() -> Self {
        Self(watch::channel(StopCause::None).0)
    }
}
impl AssessmentAbort {
    pub fn abort(&self) {
        self.stop(StopCause::User);
    }
    fn stop(&self, cause: StopCause) {
        self.0.send_if_modified(|current| {
            if *current == StopCause::None {
                *current = cause;
                true
            } else {
                false
            }
        });
    }
    pub fn aborted(&self) -> bool {
        *self.0.borrow() != StopCause::None
    }
    fn budget_expired(&self) -> bool {
        *self.0.borrow() == StopCause::Budget
    }
    pub async fn cancelled(&self) {
        let mut rx = self.0.subscribe();
        while *rx.borrow_and_update() == StopCause::None {
            if rx.changed().await.is_err() {
                break;
            }
        }
    }
}
/// Immutable authorization for one literal-IP/port dispatch. It cannot be
/// constructed or deserialized outside this module. Reuse still checks expiry.
#[derive(Clone)]
pub struct TcpPermit {
    target: Ipv4Addr,
    port: u16,
    scope_id: String,
    operator_id: String,
    expires: i64,
    clock: Clock,
}
impl TcpPermit {
    pub fn target(&self) -> Ipv4Addr {
        self.target
    }
    pub fn port(&self) -> u16 {
        self.port
    }
    pub fn scope_id(&self) -> &str {
        &self.scope_id
    }
    pub fn operator_id(&self) -> &str {
        &self.operator_id
    }
    pub fn expired(&self) -> bool {
        (self.clock)() >= self.expires
    }
}
pub type Probe = Arc<
    dyn Fn(TcpPermit, AssessmentAbort) -> BoxFuture<'static, Result<ProbeState, String>>
        + Send
        + Sync,
>;
/// No DNS, redirect, URL parsing, shell, callback URL or implicit LAN permission.
pub async fn probe_tcp(permit: TcpPermit, abort: AssessmentAbort) -> Result<ProbeState, String> {
    if abort.aborted() || permit.expired() {
        return Ok(ProbeState::Error);
    }
    let connect = tokio::net::TcpStream::connect(SocketAddrV4::new(permit.target, permit.port));
    Ok(tokio::select! {
        biased;
        _=abort.cancelled()=>ProbeState::Error,
        outcome=tokio::time::timeout(Duration::from_millis(PROBE_TIMEOUT_MS),connect)=>match outcome {
            Err(_)=>ProbeState::Timeout,
            Ok(Ok(stream))=>{drop(stream);ProbeState::Open},
            Ok(Err(error)) if error.kind()==std::io::ErrorKind::ConnectionRefused=>ProbeState::Refused,
            Ok(Err(_))=>ProbeState::Error,
        }
    })
}
#[derive(Clone)]
pub struct AssessmentOptions {
    pub clock: Clock,
    pub identifier: Arc<dyn Fn() -> String + Send + Sync>,
    pub vantage_point: String,
    pub interval_ms: u64,
    pub duration_ms: u64,
    pub probe: Probe,
    paths: BlockingLane,
}
impl AssessmentOptions {
    /// Trusted execution-host identity, never a model/request input. Defaults
    /// retain the source's serial rate, per-connect timeout and run duration.
    pub fn new(vantage_point: String) -> Result<Self, String> {
        if vantage_point.is_empty() {
            return Err("Execution vantage point is required".into());
        }
        Ok(Self {
            clock: default_clock(),
            identifier: Arc::new(|| uuid::Uuid::new_v4().to_string()),
            vantage_point,
            interval_ms: INTERVAL_MS,
            duration_ms: DURATION_MS,
            probe: Arc::new(|permit, abort| Box::pin(probe_tcp(permit, abort))),
            paths: BlockingLane::new(NonZeroU16::new(2).unwrap()),
        })
    }
}
struct Active {
    id: String,
    abort: AssessmentAbort,
    done: watch::Receiver<bool>,
}
#[derive(Default)]
struct State {
    scopes: Vec<Value>,
    runs: Vec<Value>,
    active: Option<Active>,
}
struct Inner {
    state: Mutex<State>,
    store: Option<Arc<dyn AssessmentStore>>,
    options: AssessmentOptions,
}
#[derive(Clone)]
pub struct AssessmentService(Arc<Inner>);
fn put(records: &mut Vec<Value>, record: Value) {
    if let Some(existing) = records.iter_mut().find(|v| v.get("id") == record.get("id")) {
        *existing = record;
    } else {
        records.push(record);
    }
}
fn cached(records: &[Value], id: &str) -> Option<Value> {
    records.iter().find(|v| v["id"] == id).cloned()
}
fn gaps(run: &mut Value) -> &mut Vec<Value> {
    run["coverageGaps"].as_array_mut().expect("native run gaps")
}
struct Lease(AssessmentRelease);
impl Drop for Lease {
    fn drop(&mut self) {
        self.0.release();
    }
}
impl AssessmentService {
    pub fn memory(options: AssessmentOptions) -> Self {
        Self(Arc::new(Inner {
            state: Mutex::new(State::default()),
            store: None,
            options,
        }))
    }
    pub async fn persistent(
        options: AssessmentOptions,
        store: Arc<dyn AssessmentStore>,
    ) -> Result<Self, String> {
        let loaded = store.load().await?;
        let mut state = State::default();
        for scope in loaded.scopes {
            if scope.is_null() {
                return Err("Invalid persisted scope".into());
            }
            put(&mut state.scopes, scope);
        }
        for mut run in loaded.runs {
            if run.is_null() {
                return Err("Invalid persisted assessment".into());
            }
            if run["status"] == "running" {
                run["status"] = json!("interrupted");
                run["completedAt"] = json!(iso((options.clock)())?);
                let coverage = run["coverageGaps"]
                    .as_array_mut()
                    .ok_or("Invalid persisted assessment coverage")?;
                coverage.push(json!("Gateway restarted before the assessment completed"));
                store.save_run(run.clone()).await?;
            }
            put(&mut state.runs, run);
        }
        Ok(Self(Arc::new(Inner {
            state: Mutex::new(state),
            store: Some(store),
            options,
        })))
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
    pub async fn create_scope(
        &self,
        input: &Value,
        operator: &str,
        project_root: Option<String>,
    ) -> Result<Value, String> {
        if operator.is_empty() {
            return Err("Authenticated operator required".into());
        }
        if input.is_null() {
            return Err("null is not an object (evaluating 'input.paths')".into());
        }
        let root = project_root.filter(|s| !s.is_empty());
        let paths = input.get("paths").filter(|v| !v.is_null());
        let has_paths = paths.is_some_and(|v| {
            v.as_array().is_some_and(|v| !v.is_empty()) || v.as_str().is_some_and(|v| !v.is_empty())
        });
        if has_paths && root.is_none() {
            return Err("Filesystem checks require a project-bound scope".into());
        }
        // Bound paths before scheduling any blocking policy work. Valid path
        // lists retain the source's project guard before persistence/dispatch.
        if let Some(raw) = paths.and_then(Value::as_array).filter(|p| p.len() > 4) {
            let _ = raw;
            return validate_scope(input, self.now()).map(|_| unreachable!());
        }
        if let Some(root) = &root {
            let path_values = paths.and_then(Value::as_array).cloned().unwrap_or_default();
            let root = root.clone();
            self.0
                .options
                .paths
                .run(move || -> Result<(), String> {
                    for path in path_values {
                        let path = path
                            .as_str()
                            .ok_or("Invalid scoped paths, server names or SSH users")?;
                        PathGuard::new(Path::new(&root), &[], false)
                            .map_err(|e| e.to_string())?
                            .validate(path)
                            .map_err(|e| e.to_string())?;
                    }
                    Ok(())
                })
                .await
                .map_err(|e| e.to_string())??;
        }
        let input = validate_scope(input, self.now())?;
        let mut scope = input.normalized();
        if let Some(root) = root {
            scope["projectRoot"] = json!(root);
        }
        scope["id"] = json!((self.0.options.identifier)());
        scope["operatorId"] = json!(operator);
        scope["createdAt"] = json!(self.timestamp()?);
        scope["nodeId"] = json!("gateway");
        scope["vantagePoint"] = json!(self.0.options.vantage_point);
        scope["profile"] = json!("tcp-connect-v1");
        if let Some(store) = &self.0.store {
            store.save_scope(scope.clone()).await?;
        }
        put(&mut self.0.state.lock().await.scopes, scope.clone());
        Ok(scope)
    }
    pub async fn get_scope(&self, id: &str, operator: &str) -> Result<Value, String> {
        if let Some(scope) = cached(&self.0.state.lock().await.scopes, id) {
            return if scope["operatorId"] == operator {
                Ok(scope)
            } else {
                Err("Scope not found".into())
            };
        }
        if let Some(store) = &self.0.store
            && let Some(scope) = store.scope(id.into(), operator.into()).await?
            && scope["operatorId"] == operator
        {
            return Ok(scope);
        }
        Err("Scope not found".into())
    }
    pub async fn get_run(&self, id: &str, operator: &str) -> Result<Value, String> {
        if let Some(run) = cached(&self.0.state.lock().await.runs, id) {
            return if run["operatorId"] == operator {
                Ok(run)
            } else {
                Err("Assessment not found".into())
            };
        }
        if let Some(store) = &self.0.store
            && let Some(run) = store.run(id.into(), operator.into()).await?
            && run["operatorId"] == operator
        {
            return Ok(run);
        }
        Err("Assessment not found".into())
    }
    pub async fn history(&self, operator: &str) -> Result<Value, String> {
        self.history_detailed(operator).await.map_err(|e| e.message)
    }
    pub async fn history_detailed(
        &self,
        operator: &str,
    ) -> Result<Value, super::store::HistoryFailure> {
        if let Some(store) = &self.0.store {
            let history = store.history_detailed(operator.into()).await?;
            return Ok(json!({"scopes":history.scopes,"runs":history.runs}));
        }
        let state = self.0.state.lock().await;
        Ok(
            json!({"scopes":state.scopes.iter().rev().filter(|v|v["operatorId"]==operator).take(50).cloned().collect::<Vec<_>>(),"runs":state.runs.iter().rev().filter(|v|v["operatorId"]==operator).take(50).cloned().collect::<Vec<_>>()}),
        )
    }
    pub async fn cancel(&self, id: &str, operator: &str) -> Result<(), String> {
        self.get_run(id, operator).await?;
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
        self.get_run(id, operator).await
    }
    pub async fn start(
        &self,
        scope_id: &str,
        operator: &str,
        node_id: &str,
        external: Option<AssessmentAbort>,
    ) -> Result<Value, String> {
        if node_id != "gateway" {
            return Err("This profile executes on the gateway only".into());
        }
        // Serialize start admission and initial persistence, never hold this
        // lock while waiting for an engine operation or connection attempt.
        let mut state = self.0.state.lock().await;
        if state.active.is_some() {
            return Err("An assessment is already running on this gateway".into());
        }
        let scope = if let Some(scope) = cached(&state.scopes, scope_id) {
            if scope["operatorId"] != operator {
                return Err("Scope not found".into());
            }
            scope
        } else if let Some(store) = &self.0.store {
            store
                .scope(scope_id.into(), operator.into())
                .await?
                .filter(|s| s["operatorId"] == operator)
                .ok_or("Scope not found")?
        } else {
            return Err("Scope not found".into());
        };
        let validated = validate_scope(&scope, self.now())?;
        if !validated.methods.iter().any(|m| m == "tcp") {
            return Err("TCP method is not authorized by this scope".into());
        }
        if scope["nodeId"] != "gateway"
            || scope["profile"] != "tcp-connect-v1"
            || scope["vantagePoint"] != self.0.options.vantage_point
        {
            return Err("Scope execution context does not match this gateway".into());
        }
        let targets = scope["targets"]
            .as_array()
            .expect("validated target array")
            .iter()
            .filter(|ip| !scope["exclusions"].as_array().unwrap().contains(ip))
            .count();
        let planned = targets
            * scope["ports"]
                .as_array()
                .expect("validated port array")
                .len();
        let mut run = json!({"id":(self.0.options.identifier)(),"scopeId":scope_id,"operatorId":operator,"scope":scope,"startedAt":self.timestamp()?,"completedAt":null,"status":"running","engine":ENGINE,"engineVersion":ENGINE_VERSION,"observations":[],"plannedChecks":planned,"coverageGaps":LIMITATIONS});
        let id = run["id"]
            .as_str()
            .ok_or("Invalid generated assessment ID")?
            .to_string();
        let lease = Lease(claim_assessment_execution(&id).map_err(str::to_string)?);
        self.save_run(run.clone()).await?;
        put(&mut state.runs, run.clone());
        let abort = AssessmentAbort::default();
        if external.as_ref().is_some_and(AssessmentAbort::aborted) {
            abort.abort();
        }
        let (completed, done) = watch::channel(false);
        state.active = Some(Active {
            id: id.clone(),
            abort: abort.clone(),
            done,
        });
        let eager_stop = abort.aborted()
            || self.0.options.duration_ms == 0
            || self.now() >= validated.expiry_ms();
        if eager_stop {
            run["status"] = json!(if abort.aborted() {
                "cancelled"
            } else {
                "partial"
            });
            run["completedAt"] = json!(self.timestamp()?);
            gaps(&mut run).push(json!(format!(
                "{planned} checks not performed (cancellation, expiry, deadline or failure)"
            )));
            if self.save_run(run.clone()).await.is_err() {
                persist_failure(&mut run, self.timestamp()?);
            }
            put(&mut state.runs, run.clone());
        }
        let execution_now = self.now();
        let deadline =
            execution_now.saturating_add(self.0.options.duration_ms.min(i64::MAX as u64) as i64);
        let remaining = validated.expiry_ms().saturating_sub(execution_now).max(0) as u64;
        let budget = Box::pin(tokio::time::sleep(Duration::from_millis(
            self.0.options.duration_ms.min(remaining).max(1),
        )));
        let first_probe = if !eager_stop {
            let target = run["scope"]["targets"]
                .as_array()
                .unwrap()
                .iter()
                .filter_map(Value::as_str)
                .map(|ip| ip.parse::<Ipv4Addr>().unwrap())
                .find(|ip| !validated.exclusions.contains(ip))
                .unwrap();
            let port = run["scope"]["ports"][0].as_f64().unwrap() as u16;
            let permit = TcpPermit {
                target,
                port,
                scope_id: scope_id.into(),
                operator_id: operator.into(),
                expires: validated.expiry_ms(),
                clock: self.0.options.clock.clone(),
            };
            let probe = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                (self.0.options.probe)(permit, abort.clone())
            }))
            .unwrap_or_else(|_| Box::pin(async { Err("Probe execution failed".into()) }));
            let mut probe: BoxFuture<'static, Result<ProbeState, String>> = Box::pin(
                std::panic::AssertUnwindSafe(probe)
                    .catch_unwind()
                    .map(|result| result.unwrap_or_else(|_| Err("Probe execution failed".into()))),
            );
            // Start the scoped connector now, retaining pending work and its
            // owned socket until the execution task polls it again or cancels.
            let mut context = Context::from_waker(futures_util::task::noop_waker_ref());
            if let Poll::Ready(result) = probe.as_mut().poll(&mut context) {
                probe = Box::pin(std::future::ready(result));
            }
            Some(probe)
        } else {
            None
        };
        let service = self.clone();
        let task_run = run.clone();
        tokio::spawn(async move {
            let external_wait = async {
                if let Some(external) = external {
                    external.cancelled().await;
                    abort.abort();
                } else {
                    std::future::pending::<()>().await;
                }
            };
            let work = async {
                if !eager_stop {
                    service
                        .execute(
                            task_run,
                            validated,
                            abort.clone(),
                            deadline,
                            budget,
                            first_probe,
                        )
                        .await;
                }
            };
            tokio::pin!(work);
            tokio::pin!(external_wait);
            tokio::select! {biased;_= &mut external_wait=>work.await, _=&mut work=>{}}
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
    async fn execute(
        &self,
        mut run: Value,
        scope: ValidatedScopeInput,
        abort: AssessmentAbort,
        deadline: i64,
        mut budget: Pin<Box<tokio::time::Sleep>>,
        mut first_probe: Option<BoxFuture<'static, Result<ProbeState, String>>>,
    ) {
        let failed = {
            let work=std::panic::AssertUnwindSafe(async {
            let targets=run["scope"]["targets"].as_array().unwrap().clone();let ports=run["scope"]["ports"].as_array().unwrap().clone();
            for target in targets {
                let target=target.as_str().unwrap().parse::<Ipv4Addr>().expect("validated IPv4");
                if scope.exclusions.contains(&target){continue;}
                for port in &ports {
                    if first_probe.is_none() && (abort.aborted()||self.now()>=deadline||self.now()>=scope.expiry_ms()){break;}
                    if !run["observations"].as_array().unwrap().is_empty(){tokio::select!{biased;_=abort.cancelled()=>{},_=tokio::time::sleep(Duration::from_millis(self.0.options.interval_ms))=>{}}}
                    if first_probe.is_none() && (abort.aborted()||self.now()>=scope.expiry_ms()){break;}
                    let port=port.as_f64().unwrap() as u16;
                    if !scope.targets.contains(&target)||!scope.ports.contains(&port){return Err(());}
                    let permit=TcpPermit{target,port,scope_id:run["scopeId"].as_str().unwrap().into(),operator_id:run["operatorId"].as_str().unwrap().into(),expires:scope.expiry_ms(),clock:self.0.options.clock.clone()};
                    let probe=first_probe.take().unwrap_or_else(|| (self.0.options.probe)(permit,abort.clone()));
                    let result=tokio::select!{biased;_=abort.cancelled()=>break,outcome=probe=>outcome.map_err(|_|())?};
                    if abort.aborted(){break;}
                    let observation=json!({"target":target.to_string(),"port":port,"state":result,"observedAt":self.timestamp().map_err(|_|())?,"evidenceId":(self.0.options.identifier)()});
                    run["observations"].as_array_mut().unwrap().push(observation);put(&mut self.0.state.lock().await.runs,run.clone());
                }
            }
            Ok::<(),()>(())
        }).catch_unwind();
            tokio::pin!(work);
            tokio::select! {biased;_=&mut budget=>{abort.stop(StopCause::Budget);!matches!(work.await,Ok(Ok(())))},result=&mut work=>!matches!(result,Ok(Ok(())))}
        };
        let count = run["observations"].as_array().unwrap().len();
        let planned = run["plannedChecks"].as_u64().unwrap() as usize;
        run["status"] = json!(if failed {
            "partial"
        } else if count == planned {
            "completed"
        } else if abort.aborted() && !abort.budget_expired() {
            "cancelled"
        } else {
            "partial"
        });
        if failed {
            gaps(&mut run).push(json!(
                "Probe execution failed; remaining checks were not performed"
            ));
        }
        if abort.budget_expired() {
            gaps(&mut run).push(json!(
                "Run budget or scope expiry reached; remaining checks were stopped"
            ));
        }
        if count < planned {
            gaps(&mut run).push(json!(format!(
                "{} checks not performed (cancellation, expiry, deadline or failure)",
                planned - count
            )));
        }
        run["completedAt"] = json!(self.timestamp().unwrap_or_default());
        if self.save_run(run.clone()).await.is_err() {
            persist_failure(&mut run, self.timestamp().unwrap_or_default());
        }
        put(&mut self.0.state.lock().await.runs, run);
    }
}
fn persist_failure(run: &mut Value, at: String) {
    run["status"] = json!("partial");
    gaps(run).push(json!(
        "Run completion could not be persisted; this result may not survive restart"
    ));
    run["completedAt"] = json!(at);
}
/// Per-gateway registry; replacing a configured store does not erase an existing
/// task's owned state or release its process-wide execution lease prematurely.
#[derive(Clone)]
pub struct AssessmentRegistry {
    service: Arc<RwLock<AssessmentService>>,
    options: AssessmentOptions,
}
impl AssessmentRegistry {
    pub fn new(options: AssessmentOptions) -> Self {
        Self {
            service: Arc::new(RwLock::new(AssessmentService::memory(options.clone()))),
            options,
        }
    }
    pub async fn get(&self) -> AssessmentService {
        self.service.read().await.clone()
    }
    pub async fn set_database(&self, store: Arc<dyn AssessmentStore>) -> Result<(), String> {
        let service = AssessmentService::persistent(self.options.clone(), store).await?;
        *self.service.write().await = service;
        Ok(())
    }
}
