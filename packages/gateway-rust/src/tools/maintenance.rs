//! Maintenance tool presentation. The authorized runner is an explicit service port.
//! This module executes no processes and starts no fix tasks.
use crate::{
    services::{
        calendar::{js_text, truthy},
        notifications::NotificationService,
    },
    time::{Clock, default_clock},
};
use futures_util::future::BoxFuture;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::sync::{Arc, LazyLock};

#[derive(Clone, Debug)]
pub enum MaintenanceError {
    Message(String),
    Thrown(Value),
}
impl MaintenanceError {
    fn message(self) -> String {
        match self {
            Self::Message(message) => message,
            Self::Thrown(value) => js_text(&value),
        }
    }
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckSummary {
    pub name: String,
    pub passed: bool,
    pub duration_ms: f64,
}
/// Only fields consumed by this tool; the runner retains its full output/evidence.
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MaintenanceRun {
    pub id: String,
    pub repo_name: String,
    pub checks: Vec<CheckSummary>,
    pub all_passed: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub plan_id: Option<String>,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MaintenanceRequest {
    /// None means runAll. A present repoId retains the reference's JSON input.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub repo_id: Option<Value>,
    pub job_id: String,
}
pub enum MaintenanceResponse {
    One(MaintenanceRun),
    All(Vec<MaintenanceRun>),
}
pub type Backend = Arc<
    dyn Fn(MaintenanceRequest) -> BoxFuture<'static, Result<MaintenanceResponse, MaintenanceError>>
        + Send
        + Sync,
>;
#[derive(Clone, Debug, Serialize)]
pub struct MaintenanceNotification {
    pub level: &'static str,
    pub title: &'static str,
    pub body: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub link: Option<String>,
}
pub type NotificationSink =
    Arc<dyn Fn(MaintenanceNotification) -> Result<(), MaintenanceError> + Send + Sync>;
pub struct MaintenanceTool {
    backend: Backend,
    notifications: Option<NotificationSink>,
    clock: Clock,
}
pub fn metadata() -> &'static Value {
    static METADATA: LazyLock<Value> = LazyLock::new(|| {
        json!({
            "name":"maintenance.run",
            "description":"Run maintenance checks (typecheck, test, lint) on a repository. Creates a fix plan with proposed tasks if any check fails. If repoId is omitted, checks all accessible repositories.",
            "tier":"standard",
            "parameters":{"type":"object","properties":{"repoId":{"type":"string","description":"ID of the repository to check. Omit to check all repos."}}}
        })
    });
    &METADATA
}
fn symbol(passed: bool) -> &'static str {
    if passed { "✓" } else { "✗" }
}
impl MaintenanceTool {
    pub fn new(backend: Backend) -> Self {
        Self {
            backend,
            notifications: None,
            clock: default_clock(),
        }
    }
    pub fn with_clock(mut self, clock: Clock) -> Self {
        self.clock = clock;
        self
    }
    pub fn with_notification_sink(mut self, sink: NotificationSink) -> Self {
        self.notifications = Some(sink);
        self
    }
    pub fn with_notifications(self, notifications: NotificationService) -> Self {
        self.with_notification_sink(Arc::new(move |notification| {
            notifications
                .notify(
                    notification.level,
                    notification.title,
                    &notification.body,
                    notification.link.as_deref(),
                )
                .map_err(MaintenanceError::Message)
        }))
    }
    fn notify(&self, notification: MaintenanceNotification) -> Result<(), MaintenanceError> {
        if let Some(sink) = &self.notifications {
            sink(notification)?;
        }
        Ok(())
    }
    /// action_id is provided by authenticated tool execution, never input JSON.
    pub async fn execute(&self, input: &Value, action_id: Option<&str>) -> Value {
        let repo_id = input.get("repoId").filter(|value| truthy(value)).cloned();
        let job_id = action_id
            .map(String::from)
            .unwrap_or_else(|| format!("manual-{}", (self.clock)()));
        let request = MaintenanceRequest { repo_id, job_id };
        let single = request.repo_id.is_some();
        let outcome = async {
            match (self.backend)(request).await? {
                MaintenanceResponse::One(result) if single => {
                    let failed = result.checks.iter().filter(|check| !check.passed).count();
                    let summary = result.checks.iter().map(|check| {
                        format!("{} {} ({}ms)", symbol(check.passed), check.name, ryu_js::Buffer::new().format(check.duration_ms))
                    }).collect::<Vec<_>>().join("\n");
                    let message = if result.all_passed { "All checks passed".into() }
                        else { format!("{failed} check(s) failed — fix plan created") };
                    self.notify(if result.all_passed {
                        MaintenanceNotification { level:"success", title:"Maintenance passed", body:format!("All checks passed for {}",result.repo_name), link:None }
                    } else {
                        MaintenanceNotification { level:"warning", title:"Maintenance: checks failed", body:format!("{failed} check(s) failed in {}",result.repo_name),
                            link:result.plan_id.as_ref().filter(|id| !id.is_empty()).map(|id|format!("/plans/{id}")) }
                    })?;
                    let mut data = json!({"runId":result.id,"summary":summary});
                    if let Some(plan_id) = result.plan_id { data["planId"] = json!(plan_id); }
                    Ok(json!({"ok":true,"message":message,"data":data}))
                }
                MaintenanceResponse::All(results) if !single => {
                    if results.is_empty() { return Ok(json!({"ok":true,"message":"No accessible repositories found"})); }
                    let summary = results.iter().map(|result| {
                        let checks = result.checks.iter().map(|check|format!("  {} {}",symbol(check.passed),check.name)).collect::<Vec<_>>().join("\n");
                        format!("{} {}\n{checks}",symbol(result.all_passed),result.repo_name)
                    }).collect::<Vec<_>>().join("\n\n");
                    let failed = results.iter().filter(|result| !result.all_passed).count();
                    let message = if failed == 0 { format!("All {} repo(s) passed",results.len()) }
                        else { format!("{failed}/{} repo(s) have failures — fix plans created",results.len()) };
                    self.notify(MaintenanceNotification {
                        level:if failed == 0 { "success" } else { "warning" },
                        title:if failed == 0 { "Maintenance passed" } else { "Maintenance: failures found" },
                        body:message.clone(), link:None,
                    })?;
                    let repos: Vec<_> = results.into_iter().map(|result| {
                        let mut repo = json!({"repoName":result.repo_name,"allPassed":result.all_passed,"runId":result.id});
                        if let Some(plan_id) = result.plan_id { repo["planId"] = json!(plan_id); }
                        repo
                    }).collect();
                    Ok(json!({"ok":true,"message":message,"data":{"repos":repos,"summary":summary}}))
                }
                _ => Err(MaintenanceError::Message("Maintenance backend response does not match request".into())),
            }
        }.await;
        outcome
            .unwrap_or_else(|error: MaintenanceError| json!({"ok":false,"message":error.message()}))
    }
}
