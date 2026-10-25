//! PR review-state polling policy over explicitly authorized storage/Git/node ports.
//! Starting this service grants no repository, remote-node or cleanup authority.
use crate::{
    services::calendar::{js_text, truthy},
    text::js_trim,
    time::{Clock, default_clock, iso},
    tools::core_io::HostError,
};
use futures_util::future::BoxFuture;
use serde_json::{Value, json};
use std::sync::{
    Arc, Mutex,
    atomic::{AtomicBool, Ordering},
};

pub const DEFAULT_POLL_INTERVAL_MS: f64 = 30_000.0;
pub const THREAD_REVIEW_SYNC_LIMIT: usize = 100;

#[derive(Clone, Debug)]
pub enum GitQuery {
    BranchRemote(String),
    Remotes,
    RemoteUrl(String),
}
impl GitQuery {
    /// Reference protocol spelling for differential evidence. Execution adapters
    /// must construct argv from the typed variant, never execute this as a shell.
    pub fn reference_arguments(&self) -> String {
        match self {
            Self::BranchRemote(branch) => format!("config --get branch.{branch}.remote"),
            Self::Remotes => "remote".into(),
            Self::RemoteUrl(remote) => format!("remote get-url {remote}"),
        }
    }
}
#[derive(Clone, Debug)]
pub enum ReviewOperation {
    List {
        limit: usize,
    },
    Exists(String),
    PreferredRemote {
        cwd: String,
        branch: String,
    },
    RemoteUrl {
        cwd: String,
        remote: String,
    },
    ParseRemote(String),
    ResolveForge(String),
    GetForge(Value),
    FindPr {
        forge: Value,
        cwd: String,
        remote: Value,
        branch: String,
    },
    Nodes,
    ProxyGit {
        node: String,
        cwd: String,
        query: GitQuery,
        timeout_ms: u64,
    },
    Update {
        id: String,
        patch: Value,
    },
    AddActivity {
        id: String,
        summary: String,
        metadata: Value,
    },
    Broadcast(Value),
    Log(String),
}
pub type ReviewPort =
    Arc<dyn Fn(ReviewOperation) -> BoxFuture<'static, Result<Value, HostError>> + Send + Sync>;
/// The authorized host admits and tracks cleanup independently of polling. It
/// must retain its resource lease until the process/remote effect actually ends.
/// Cleanup failure is intentionally ignored here, matching the reference policy.
#[derive(Clone, Debug)]
pub struct ReviewCleanup {
    pub cwd: String,
    pub branch: String,
    pub preserve_branch: bool,
    pub has_ws: bool,
}
pub type ScheduleCleanup = Arc<dyn Fn(ReviewCleanup) + Send + Sync>;
pub type PollCallback = Arc<dyn Fn() -> BoxFuture<'static, Result<(), HostError>> + Send + Sync>;
pub type CancelInterval = Box<dyn FnOnce() + Send>;
/// The scheduler must not invoke the callback inline during registration. It
/// retains callback errors for supervision; an interval never keeps a process alive.
pub struct IntervalRegistration {
    pub cancel: Option<CancelInterval>,
    pub unref: Option<Box<dyn Fn() -> Result<(), HostError> + Send>>,
}
impl Drop for IntervalRegistration {
    fn drop(&mut self) {
        if let Some(cancel) = self.cancel.take() {
            cancel();
        }
    }
}
pub type RepeatSchedule =
    Arc<dyn Fn(f64, PollCallback) -> Result<IntervalRegistration, HostError> + Send + Sync>;
#[derive(Clone)]
pub struct ReviewSyncConfig {
    pub process_cwd: String,
    pub has_ws: bool,
    pub custom_forge_resolver: bool,
}
pub struct ThreadReviewSyncService {
    port: ReviewPort,
    schedule: RepeatSchedule,
    cleanup: ScheduleCleanup,
    config: ReviewSyncConfig,
    clock: Clock,
    running: AtomicBool,
    timer: Mutex<Option<IntervalRegistration>>,
}
struct Running<'a>(&'a AtomicBool);
impl Drop for Running<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Release);
    }
}
impl ThreadReviewSyncService {
    pub fn new(
        port: ReviewPort,
        schedule: RepeatSchedule,
        cleanup: ScheduleCleanup,
        config: ReviewSyncConfig,
    ) -> Arc<Self> {
        Self::with_clock(port, schedule, cleanup, config, default_clock())
    }
    pub fn with_clock(
        port: ReviewPort,
        schedule: RepeatSchedule,
        cleanup: ScheduleCleanup,
        config: ReviewSyncConfig,
        clock: Clock,
    ) -> Arc<Self> {
        Arc::new(Self {
            port,
            schedule,
            cleanup,
            config,
            clock,
            running: AtomicBool::new(false),
            timer: Mutex::new(None),
        })
    }
    pub fn start(self: &Arc<Self>, interval_ms: Option<f64>) -> Result<(), HostError> {
        let mut timer = self.timer.lock().unwrap();
        if timer.is_some() {
            return Ok(());
        }
        let weak = Arc::downgrade(self);
        let callback: PollCallback = Arc::new(move || {
            let service = weak.upgrade();
            Box::pin(async move {
                if let Some(service) = service {
                    service.tick().await
                } else {
                    Ok(())
                }
            })
        });
        *timer = Some((self.schedule)(
            interval_ms.unwrap_or(DEFAULT_POLL_INTERVAL_MS),
            callback,
        )?);
        if let Some(unref) = timer.as_ref().and_then(|t| t.unref.as_ref()) {
            unref()?;
        }
        Ok(())
    }
    /// Stop future polling, preserving an in-flight synchronization like setInterval.
    pub fn stop(&self) {
        let registration = self.timer.lock().unwrap().take();
        drop(registration);
    }
    pub async fn tick(&self) -> Result<(), HostError> {
        if self
            .running
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .is_err()
        {
            return Ok(());
        }
        let _running = Running(&self.running);
        let rows = (self.port)(ReviewOperation::List {
            limit: THREAD_REVIEW_SYNC_LIMIT,
        })
        .await?;
        let rows = rows
            .as_array()
            .ok_or_else(|| HostError::Error("Thread list port returned a non-array".into()))?;
        for thread in rows.iter().filter(|thread| candidate(thread)) {
            if let Err(error) = self.sync_thread(thread).await {
                let message = match error {
                    HostError::Error(message) => message,
                    HostError::Thrown(value) => js_text(&value),
                };
                (self.port)(ReviewOperation::Log(format!(
                    "[thread-review-sync] Failed to sync thread {}: {message}",
                    text(thread, "id")
                )))
                .await?;
            }
        }
        Ok(())
    }
    async fn sync_thread(&self, thread: &Value) -> Result<(), HostError> {
        let cwd = text(thread, "workingDirectory");
        let branch = text(thread, "branch");
        let local = truthy(&(self.port)(ReviewOperation::Exists(cwd.into())).await?);
        let exec_cwd = if local { cwd } else { &self.config.process_cwd };
        let url = if local {
            let name = (self.port)(ReviewOperation::PreferredRemote {
                cwd: cwd.into(),
                branch: branch.into(),
            })
            .await?;
            if !truthy(&name) {
                return Ok(());
            }
            (self.port)(ReviewOperation::RemoteUrl {
                cwd: cwd.into(),
                remote: name.as_str().unwrap_or("").into(),
            })
            .await?
        } else {
            self.remote_url_via_node(cwd, branch).await?
        };
        if !truthy(&url) {
            return Ok(());
        }
        let url = url.as_str().unwrap_or("");
        let remote = (self.port)(ReviewOperation::ParseRemote(url.into())).await?;
        if !truthy(&remote) {
            return Ok(());
        }
        let forge = if self.config.custom_forge_resolver {
            (self.port)(ReviewOperation::ResolveForge(url.into())).await?
        } else {
            let parsed = (self.port)(ReviewOperation::ParseRemote(url.into())).await?;
            if truthy(&parsed) {
                (self.port)(ReviewOperation::GetForge(parsed["provider"].clone())).await?
            } else {
                Value::Null
            }
        };
        if !truthy(&forge) {
            return Ok(());
        }
        let pr = (self.port)(ReviewOperation::FindPr {
            forge,
            cwd: exec_cwd.into(),
            remote,
            branch: branch.into(),
        })
        .await?;
        if !truthy(&pr) {
            return Ok(());
        }
        let state = nullish(&pr, "state");
        let state_changed = !same(&state, &nullish(thread, "prState"));
        let fields = [
            ("url", "prUrl"),
            ("number", "prNumber"),
            ("title", "prTitle"),
            ("baseBranch", "prBaseBranch"),
        ];
        let metadata_changed = fields
            .iter()
            .any(|(source, target)| !same(&nullish(&pr, source), &nullish(thread, target)));
        if !metadata_changed && !state_changed {
            return Ok(());
        }
        let mut patch = json!({"prState":state});
        for (source, target) in fields {
            patch[target] = fallback(&pr, source, thread, target);
        }
        let id = text(thread, "id");
        let mut updated = (self.port)(ReviewOperation::Update {
            id: id.into(),
            patch,
        })
        .await?;
        if !truthy(&updated) {
            return Ok(());
        }
        if state_changed {
            let url = fallback(&updated, "prUrl", thread, "prUrl");
            if let Some(summary) = summary(&state, &url) {
                let mut metadata = json!({"action":"pr_state_changed","prState":state,"prUrl":url,"syncSource":"gateway_poll"});
                if let Some(previous) = thread.get("prState") {
                    metadata["previousPrState"] = previous.clone();
                }
                let activity = (self.port)(ReviewOperation::AddActivity {
                    id: id.into(),
                    summary,
                    metadata,
                })
                .await?;
                self.broadcast(id, "activity", json!({"activity":activity}))
                    .await?;
            }
            if state == "merged" || state == "closed" {
                let cleared = (self.port)(ReviewOperation::Update {
                    id: id.into(),
                    patch: json!({"providerSessionId":null,"workingDirectory":null}),
                })
                .await?;
                if truthy(&cleared) {
                    updated = cleared;
                }
                (self.cleanup)(ReviewCleanup {
                    cwd: cwd.into(),
                    branch: branch.into(),
                    preserve_branch: true,
                    has_ws: self.config.has_ws,
                });
            }
        }
        self.broadcast(id, "updated", json!({"thread":updated}))
            .await
    }
    async fn remote_url_via_node(&self, cwd: &str, branch: &str) -> Result<Value, HostError> {
        if !self.config.has_ws {
            return Ok(Value::Null);
        }
        let nodes = (self.port)(ReviewOperation::Nodes).await?;
        let windows = cwd.as_bytes().get(..3).is_some_and(|prefix| {
            prefix[0].is_ascii_alphabetic()
                && prefix[1] == b':'
                && matches!(prefix[2], b'/' | b'\\')
        });
        let Some(node) = nodes.as_array().into_iter().flatten().find(|node| {
            !truthy(&node["isGateway"]) && (!windows || node["platform"] == "windows")
        }) else {
            return Ok(Value::Null);
        };
        let node = text(node, "id");
        let configured = self
            .proxy(node, cwd, GitQuery::BranchRemote(branch.into()))
            .await
            .unwrap_or_default();
        let remotes = self
            .proxy(node, cwd, GitQuery::Remotes)
            .await
            .unwrap_or_default();
        let remotes = remotes
            .split('\n')
            .map(js_trim)
            .filter(|s| !s.is_empty())
            .collect::<Vec<_>>();
        let remote = if !configured.is_empty() && remotes.contains(&configured.as_str()) {
            Some(configured.as_str())
        } else if remotes.contains(&"origin") {
            Some("origin")
        } else {
            remotes.first().copied()
        };
        let Some(remote) = remote else {
            return Ok(Value::Null);
        };
        Ok(self
            .proxy(node, cwd, GitQuery::RemoteUrl(remote.into()))
            .await
            .ok()
            .filter(|s| !s.is_empty())
            .map(Value::String)
            .unwrap_or(Value::Null))
    }
    async fn proxy(&self, node: &str, cwd: &str, query: GitQuery) -> Result<String, HostError> {
        let result = (self.port)(ReviewOperation::ProxyGit {
            node: node.into(),
            cwd: cwd.into(),
            query,
            timeout_ms: 15_000,
        })
        .await?;
        result["stdout"]
            .as_str()
            .map(|s| js_trim(s).into())
            .ok_or_else(|| HostError::Error("Invalid proxy stdout".into()))
    }
    async fn broadcast(&self, id: &str, event: &str, mut payload: Value) -> Result<(), HostError> {
        if !self.config.has_ws {
            return Ok(());
        }
        payload["threadId"] = json!(id);
        let timestamp = iso((self.clock)()).map_err(HostError::Error)?;
        (self.port)(ReviewOperation::Broadcast(json!({"type":format!("thread.{event}"),"sessionId":"","timestamp":timestamp,"payload":payload}))).await?;
        Ok(())
    }
}
fn text<'a>(value: &'a Value, key: &str) -> &'a str {
    value[key].as_str().unwrap_or("")
}
fn nullish(value: &Value, key: &str) -> Value {
    value.get(key).cloned().unwrap_or(Value::Null)
}
fn fallback(first: &Value, first_key: &str, second: &Value, second_key: &str) -> Value {
    first
        .get(first_key)
        .filter(|v| !v.is_null())
        .cloned()
        .unwrap_or_else(|| nullish(second, second_key))
}
fn same(a: &Value, b: &Value) -> bool {
    if a.is_number() && b.is_number() {
        a.as_f64() == b.as_f64()
    } else {
        a == b
    }
}
fn candidate(thread: &Value) -> bool {
    thread["kind"] == "delivery"
        && thread["branch"].as_str().is_some_and(|s| !s.is_empty())
        && thread["workingDirectory"]
            .as_str()
            .is_some_and(|s| !s.is_empty())
        && thread["prState"] != "merged"
        && thread["prState"] != "closed"
        && (thread["prState"] == "open"
            || thread["prState"] == "creating"
            || truthy(&thread["prUrl"]))
}
fn summary(state: &Value, url: &Value) -> Option<String> {
    let verb = match state.as_str()? {
        "open" => "created",
        "merged" => "merged",
        "closed" => "closed",
        _ => return None,
    };
    Some(if truthy(url) {
        format!("Pull request {verb}: {}", js_text(url))
    } else {
        format!("Pull request {verb}")
    })
}
