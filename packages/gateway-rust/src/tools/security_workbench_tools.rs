//! Security workbench discovery, presentation and monitor adapters. Every scan
//! remains behind the explicit scope-aware Workbench/Assessment service ports.
use super::{core_io::HostError, memory_tools::MemoryToolResult, security_dispatch::*};
use crate::{
    services::{
        calendar::{js_text, truthy},
        subscription_usage_fetchers::js_date_parse,
    },
    time::Clock,
};
use serde_json::{Value, json};
use std::sync::LazyLock;
pub fn metadata(scheduler: bool) -> &'static Value {
    static DATA: LazyLock<Value> = LazyLock::new(|| {
        serde_json::from_str(include_str!("security-workbench-metadata.json"))
            .expect("security workbench tool metadata")
    });
    &DATA[if scheduler { "scheduled" } else { "base" }]
}
pub struct SecurityWorkbenchTools<C> {
    pub port: SecurityPort<C>,
    pub clock: Clock,
    pub scheduler: bool,
}
impl<C: Send + Sync> SecurityWorkbenchTools<C> {
    pub async fn execute(
        &self,
        name: &str,
        input: &Value,
        context: &SecurityContext<C>,
    ) -> MemoryToolResult {
        match self.inner(name, input, context).await {
            Ok(v) => v,
            Err(HostError::Error(e)) => output(false, e, None),
            Err(HostError::Thrown(_)) => output(false, "Security operation failed", None),
        }
    }
    async fn inner(
        &self,
        name: &str,
        input: &Value,
        c: &SecurityContext<C>,
    ) -> Result<MemoryToolResult, HostError> {
        let owner = owner(&c.fields);
        let node = node(&c.fields);
        let wb =
            |method, args, signal| (self.port)(SecurityService::Workbench, method, args, signal, c);
        let assessment = |method, args, signal| {
            (self.port)(SecurityService::Assessment, method, args, signal, c)
        };
        let scheduler =
            |method, args| (self.port)(SecurityService::Scheduler, method, args, false, c);
        let profile = match name {
            "security.tls.check" => Some("tls"),
            "security.http.check" => Some("http"),
            "security.https.check" => Some("https"),
            "security.ssh.check" => Some("ssh"),
            "security.host.audit" => Some("host-audit"),
            "security.web.scan" => Some("nuclei"),
            "security.software.scan" => Some("trivy"),
            "security.telemetry.ingest" => Some("telemetry"),
            "security.services.nmap" => Some("nmap"),
            _ => None,
        };
        if let Some(profile) = profile {
            let mut body = spread(input);
            body["profile"] = json!(profile);
            let run = wb("start", vec![body, owner.clone(), node], true).await?;
            let result = wb("wait", vec![field(&run, "id"), owner], false).await?;
            let message = format!(
                "{profile} check {}; {} evidence-backed observations. Results appear in the chat card.",
                text(&result, "status"),
                array(&result["findingIds"]).len()
            );
            return Ok(output(
                result["status"] == "completed",
                message,
                Some(result),
            ));
        }
        match name {
            "security.results.show" => {
                let run = match wb("get", vec![field(input, "runId"), owner.clone()], false).await {
                    Ok(v) => v,
                    Err(_) => {
                        assessment("getRun", vec![field(input, "runId"), owner], false).await?
                    }
                };
                Ok(output(
                    true,
                    "Saved assessment evidence; no new checks performed",
                    Some(run),
                ))
            }
            "security.scope.get" => Ok(output(
                true,
                "Authorized scope",
                Some(assessment("getScope", vec![field(input, "scopeId"), owner], false).await?),
            )),
            "security.engines.status" => Ok(output(
                true,
                "Scanner availability",
                Some(wb("engines", vec![], true).await?),
            )),
            "security.assets.discover" => {
                let run = assessment(
                    "start",
                    vec![field(input, "scopeId"), owner.clone(), node],
                    true,
                )
                .await?;
                let result = assessment("wait", vec![field(&run, "id"), owner], false).await?;
                let scope = &result["scope"];
                let excluded = array(&scope["exclusions"]);
                let observations = array(&result["observations"]);
                let assets=array(&scope["targets"]).iter().filter(|target|!excluded.contains(target)).map(|target|json!({"target":target,"status":if observations.iter().any(|o|o["target"]==*target&&(o["state"]=="open"||o["state"]=="refused")){"responsive"}else{"unknown"},"evidenceIds":observations.iter().filter(|o|o["target"]==*target).map(|o|field(o,"evidenceId")).collect::<Vec<_>>()})).collect::<Vec<_>>();
                let mut data = project(&result, &["coverageGaps"]);
                data["runId"] = field(&result, "id");
                data["assets"] = json!(assets);
                if let Some(v) = result.get("completedAt") {
                    data["scannedAt"] = v.clone();
                }
                if let Some(v) = scope.get("vantagePoint") {
                    data["vantagePoint"] = v.clone();
                }
                Ok(output(
                    result["status"] == "completed",
                    format!(
                        "Explicit-target asset discovery {}",
                        text(&result, "status")
                    ),
                    Some(data),
                ))
            }
            "security.findings.list" => {
                let history = wb("history", vec![owner], false).await?;
                Ok(output(
                    true,
                    "Recent findings",
                    Some(json!(
                        array(&history["findings"])
                            .iter()
                            .take(25)
                            .collect::<Vec<_>>()
                    )),
                ))
            }
            "security.findings.explain" => {
                let finding = wb(
                    "finding",
                    vec![field(input, "findingId"), owner.clone()],
                    false,
                )
                .await?;
                let run = wb("get", vec![field(&finding, "runId"), owner], false).await?;
                let mut data = project(&run, &["coverageGaps", "engine", "engineVersion"]);
                data["evidence"] = json!(
                    array(&run["evidence"])
                        .iter()
                        .filter(|e| array(&finding["evidenceIds"]).contains(&e["id"]))
                        .collect::<Vec<_>>()
                );
                let title = text(&finding, "title");
                data["finding"] = finding;
                Ok(output(true, title, Some(data)))
            }
            "security.remediation.plan" => Ok(output(
                true,
                "Reviewable remediation plan",
                Some(wb("plan", vec![field(input, "findingId"), owner], false).await?),
            )),
            "security.verification.run" => {
                let result =
                    wb("verify", vec![field(input, "findingId"), owner, node], true).await?;
                Ok(output(
                    result["status"] != "inconclusive",
                    text(&result, "reason"),
                    Some(result),
                ))
            }
            "security.baseline.compare" => Ok(output(
                true,
                "Baseline comparison",
                Some(
                    wb(
                        "compare",
                        vec![
                            field(input, "beforeRunId"),
                            field(input, "afterRunId"),
                            owner,
                        ],
                        false,
                    )
                    .await?,
                ),
            )),
            "security.report.export" => Ok(output(
                true,
                "Redacted security report; review before sharing",
                Some(wb("report", vec![field(input, "runId"), owner], false).await?),
            )),
            "security.monitor.schedule" if self.scheduler => {
                let minutes = input["minutes"].as_f64();
                if !minutes.is_some_and(|n| [15.0, 30.0, 60.0].contains(&n))
                    || !network_profile(&input["profile"])
                {
                    return Err(HostError::Error(
                        "Unsupported monitoring interval or profile".into(),
                    ));
                }
                wb("authorize", vec![input.clone(), owner.clone(), node], false).await?;
                let mut create = project(&c.fields, &["sessionId", "projectRoot"]);
                create["userId"] = owner.clone();
                create["name"] = json!(format!("Security {} change check", text(input, "profile")));
                create["cron"] = json!(if minutes == Some(60.0) {
                    "0 * * * *".into()
                } else {
                    format!("*/{} * * * *", js_text(&input["minutes"]))
                });
                create["toolName"] = json!("security.monitor.tick");
                create["input"] = input.clone();
                let job = scheduler("create", vec![create]).await?;
                let mut body = spread(input);
                body["monitorJobId"] = field(&job, "id");
                scheduler(
                    "update",
                    vec![field(&job, "id"), json!({"input":body}), owner.clone()],
                )
                .await?;
                let scope =
                    assessment("getScope", vec![field(input, "scopeId"), owner], false).await?;
                let mut data = project(input, &["scopeId"]);
                data["jobId"] = field(&job, "id");
                if let Some(v) = scope.get("expiresAt") {
                    data["expiresAt"] = v.clone();
                }
                Ok(output(
                    true,
                    "Scoped monitor scheduled; it stops when authorization expires",
                    Some(data),
                ))
            }
            "security.monitor.tick" if self.scheduler => {
                let job =
                    scheduler("get", vec![field(input, "monitorJobId"), owner.clone()]).await?;
                if !truthy(&job)
                    || !truthy(&job["enabled"])
                    || job["userId"] != owner
                    || job["toolName"] != "security.monitor.tick"
                {
                    return Err(HostError::Error("Monitor job not found or disabled".into()));
                }
                // Stored input, rather than the caller's replacement, is authoritative.
                let body = &job["input"];
                if !network_profile(&body["profile"]) {
                    return Err(HostError::Error("Unsupported monitoring profile".into()));
                }
                let scope = assessment(
                    "getScope",
                    vec![field(body, "scopeId"), owner.clone()],
                    false,
                )
                .await?;
                if scope["expiresAt"]
                    .as_str()
                    .and_then(js_date_parse)
                    .is_some_and(|expiry| expiry <= (self.clock)())
                {
                    scheduler(
                        "update",
                        vec![field(&job, "id"), json!({"enabled":false}), owner],
                    )
                    .await?;
                    return Ok(output(
                        false,
                        "Scope expired; monitor disabled. New authorization is required.",
                        None,
                    ));
                }
                let history = wb("history", vec![owner.clone()], false).await?;
                let previous = array(&history["runs"]).iter().find(|run| {
                    run["scopeId"] == body["scopeId"]
                        && run["input"]["profile"] == body["profile"]
                        && run["status"] == "completed"
                });
                let run = wb("start", vec![body.clone(), owner.clone(), node], true).await?;
                let result = wb("wait", vec![field(&run, "id"), owner.clone()], false).await?;
                let comparison = if let Some(previous) = previous {
                    wb(
                        "compare",
                        vec![field(previous, "id"), field(&result, "id"), owner],
                        false,
                    )
                    .await?
                } else {
                    Value::Null
                };
                let mut data = project(&result, &["coverageGaps"]);
                data["runId"] = field(&result, "id");
                data["comparison"] = comparison;
                Ok(output(
                    result["status"] == "completed",
                    format!("Scoped monitoring check {}", text(&result, "status")),
                    Some(data),
                ))
            }
            _ => Err(HostError::Error("Unknown security workbench tool".into())),
        }
    }
}
fn network_profile(profile: &Value) -> bool {
    profile
        .as_str()
        .is_some_and(|s| ["tls", "http", "https", "ssh", "nmap"].contains(&s))
}
