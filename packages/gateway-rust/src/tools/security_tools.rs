//! Authorized TCP assessment tool factories over an explicit scoped service.
use super::{core_io::HostError, memory_tools::MemoryToolResult, security_dispatch::*};
use crate::services::calendar::truthy;
use serde_json::{Value, json};
use std::sync::LazyLock;
pub fn metadata() -> &'static Value {
    static DATA: LazyLock<Value> = LazyLock::new(|| {
        serde_json::from_str(include_str!("security-tools-metadata.json"))
            .expect("assessment tool metadata")
    });
    &DATA
}
pub struct SecurityTools<C> {
    pub port: SecurityPort<C>,
}
impl<C: Send + Sync> SecurityTools<C> {
    pub async fn execute(
        &self,
        name: &str,
        input: &Value,
        context: &SecurityContext<C>,
    ) -> MemoryToolResult {
        match self.inner(name, input, context).await {
            Ok(v) => v,
            Err(HostError::Error(s)) => output(false, s, None),
            Err(HostError::Thrown(_)) => output(false, "Assessment failed", None),
        }
    }
    async fn inner(
        &self,
        name: &str,
        input: &Value,
        c: &SecurityContext<C>,
    ) -> Result<MemoryToolResult, HostError> {
        let owner = owner(&c.fields);
        let call = |method, args, signal| {
            (self.port)(SecurityService::Assessment, method, args, signal, c)
        };
        match name {
            "security.scope.create" => {
                let execution = &c.fields["executionNodeId"];
                if truthy(execution) && execution != "gateway" {
                    return Ok(output(
                        false,
                        "Assessments currently execute on the gateway only",
                        None,
                    ));
                }
                let scope = call(
                    "createScope",
                    vec![input.clone(), owner, field(&c.fields, "projectRoot")],
                    false,
                )
                .await?;
                Ok(output(
                    true,
                    "Authorized TCP scope recorded; no checks performed yet",
                    Some(scope),
                ))
            }
            "security.services.scan" => {
                let run = call(
                    "start",
                    vec![field(input, "scopeId"), owner.clone(), node(&c.fields)],
                    true,
                )
                .await?;
                let result = call("wait", vec![field(&run, "id"), owner], false).await?;
                let observations = array(&result["observations"]);
                let message = format!(
                    "Assessment {}: {}/{} TCP checks; {} reachable ports. Evidence appears in the chat card.",
                    text(&result, "status"),
                    observations.len(),
                    text(&result, "plannedChecks"),
                    observations.iter().filter(|o| o["state"] == "open").count()
                );
                Ok(output(
                    result["status"] == "completed",
                    message,
                    Some(result),
                ))
            }
            "security.assessments.list" => {
                let history = call("history", vec![owner], false).await?;
                let runs = array(&history["runs"])
                    .iter()
                    .take(10)
                    .map(|run| {
                        let mut out = project(
                            run,
                            &[
                                "id",
                                "scopeId",
                                "startedAt",
                                "completedAt",
                                "status",
                                "engine",
                                "engineVersion",
                                "plannedChecks",
                                "coverageGaps",
                            ],
                        );
                        for key in ["vantagePoint", "profile"] {
                            if let Some(v) = run["scope"].get(key) {
                                out[key] = v.clone();
                            }
                        }
                        let observations = array(&run["observations"]);
                        out["performedChecks"] = json!(observations.len());
                        out["reachablePorts"] =
                            json!(observations.iter().filter(|o| o["state"] == "open").count());
                        out["inconclusiveChecks"] = json!(
                            observations
                                .iter()
                                .filter(|o| o["state"] == "timeout" || o["state"] == "error")
                                .count()
                        );
                        out
                    })
                    .collect::<Vec<_>>();
                Ok(output(
                    true,
                    "Recent assessment summaries; use security.assessments.get for individual evidence",
                    Some(
                        json!({"scopes":array(&history["scopes"]).iter().take(10).collect::<Vec<_>>(),"runs":runs}),
                    ),
                ))
            }
            "security.assessments.get" => Ok(output(
                true,
                "Assessment evidence",
                Some(call("getRun", vec![field(input, "runId"), owner], false).await?),
            )),
            "security.assessments.cancel" => {
                call("cancel", vec![field(input, "runId"), owner], false).await?;
                Ok(output(
                    true,
                    "Cancellation requested; completed observations retained",
                    None,
                ))
            }
            _ => Err(HostError::Error("Unknown assessment tool".into())),
        }
    }
}
