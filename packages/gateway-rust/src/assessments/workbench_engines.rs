//! Closed engine requests derived exclusively from an authorized workbench
//! permit. Engine implementations and OS snapshots are separate components.
use super::{
    workbench::{AdapterOutput, EngineError, WorkbenchAbort},
    workbench_policy::AuthorizedCheck,
};
use crate::{services::calendar::truthy, time::Clock};
use futures_util::future::BoxFuture;
use serde_json::{Value, json};
use std::sync::Arc;
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum EngineKind {
    Tls,
    Http,
    Ssh,
    HostAudit,
    Nmap,
    Nuclei,
    Software,
}
impl EngineKind {
    pub fn name(self) -> &'static str {
        match self {
            Self::Tls => "checkTls",
            Self::Http => "checkHttp",
            Self::Ssh => "checkSsh",
            Self::HostAudit => "auditHost",
            Self::Nmap => "scanNmap",
            Self::Nuclei => "scanNuclei",
            Self::Software => "scanSoftware",
        }
    }
}
#[derive(Clone)]
pub struct EngineCall {
    permit: AuthorizedCheck,
    kind: EngineKind,
    args: Vec<Value>,
}
impl EngineCall {
    pub fn permit(&self) -> &AuthorizedCheck {
        &self.permit
    }
    pub fn kind(&self) -> EngineKind {
        self.kind
    }
    pub fn arguments(&self) -> &[Value] {
        &self.args
    }
}
pub type EnginePort = Arc<
    dyn Fn(EngineCall, WorkbenchAbort) -> BoxFuture<'static, Result<AdapterOutput, EngineError>>
        + Send
        + Sync,
>;
/// Implementations retain their owned scoped snapshot, validate file names and
/// bound reads. The opaque handle is never supplied by model/request JSON.
pub trait TelemetrySnapshot: Send + Sync {
    fn entries(&self) -> BoxFuture<'_, Result<Vec<String>, EngineError>>;
    fn read(&self, name: String) -> BoxFuture<'_, Result<String, EngineError>>;
    fn cleanup(&self) -> BoxFuture<'_, Result<(), EngineError>>;
}
pub type SnapshotPort = Arc<
    dyn Fn(
            AuthorizedCheck,
            WorkbenchAbort,
        ) -> BoxFuture<'static, Result<Box<dyn TelemetrySnapshot>, EngineError>>
        + Send
        + Sync,
>;
pub type TelemetryParser =
    Arc<dyn Fn(String, String, Vec<String>) -> Result<AdapterOutput, EngineError> + Send + Sync>;
#[derive(Clone)]
pub struct WorkbenchEngines {
    pub call: EnginePort,
    pub snapshot: SnapshotPort,
    pub parse_telemetry: TelemetryParser,
}
async fn call(
    engines: &WorkbenchEngines,
    permit: &AuthorizedCheck,
    abort: &WorkbenchAbort,
    clock: &Clock,
    kind: EngineKind,
    args: Vec<Value>,
) -> Result<AdapterOutput, EngineError> {
    permit.ensure_live(clock()).map_err(EngineError::Failed)?;
    (engines.call)(
        EngineCall {
            permit: permit.clone(),
            kind,
            args,
        },
        abort.clone(),
    )
    .await
}
pub async fn dispatch(
    permit: AuthorizedCheck,
    abort: WorkbenchAbort,
    engines: &WorkbenchEngines,
    clock: &Clock,
) -> Result<AdapterOutput, EngineError> {
    let input = permit.input();
    let scope = permit.scope();
    let target = input["target"].clone();
    let port = input["port"].clone();
    match permit.profile() {
        "tls" => {
            call(
                engines,
                &permit,
                &abort,
                clock,
                EngineKind::Tls,
                vec![target, port, input["serverName"].clone()],
            )
            .await
        }
        "http" | "https" => {
            call(
                engines,
                &permit,
                &abort,
                clock,
                EngineKind::Http,
                vec![target, port, json!(permit.profile() == "https")],
            )
            .await
        }
        "ssh" => {
            call(
                engines,
                &permit,
                &abort,
                clock,
                EngineKind::Ssh,
                vec![target, port],
            )
            .await
        }
        "host-audit" => {
            call(
                engines,
                &permit,
                &abort,
                clock,
                EngineKind::HostAudit,
                vec![
                    target,
                    input
                        .get("port")
                        .filter(|v| !v.is_null())
                        .cloned()
                        .unwrap_or(json!(22)),
                    input["username"].clone(),
                ],
            )
            .await
        }
        "nmap" => {
            // Preserve authorized input order, including any legacy duplicates.
            let targets = if truthy(&target) {
                vec![target]
            } else {
                scope["targets"].as_array().expect("scope targets").clone()
            };
            let targets = targets
                .into_iter()
                .filter(|v| {
                    !scope["exclusions"]
                        .as_array()
                        .expect("scope exclusions")
                        .contains(v)
                })
                .collect::<Vec<_>>();
            let ports = if input.get("port").is_none() {
                scope["ports"].clone()
            } else {
                json!([port])
            };
            call(
                engines,
                &permit,
                &abort,
                clock,
                EngineKind::Nmap,
                vec![json!(targets), ports],
            )
            .await
        }
        "nuclei" => {
            let scheme = input["scheme"].as_str().unwrap_or("http");
            let url = format!(
                "{scheme}://{}:{}",
                target.as_str().expect("target"),
                port.as_f64().expect("port")
            );
            let mut output = call(
                engines,
                &permit,
                &abort,
                clock,
                EngineKind::Nuclei,
                vec![json!(url)],
            )
            .await?;
            if abort.aborted() {
                return Ok(output);
            }
            let response = call(
                engines,
                &permit,
                &abort,
                clock,
                EngineKind::Http,
                vec![target, port, json!(scheme == "https")],
            )
            .await?;
            let native_rule = response
                .rules
                .iter()
                .find(|r| r["ruleId"] == "http.nosniff")
                .cloned();
            if let Some(evidence) = response.evidence.first() {
                let index = output.evidence.len();
                output.evidence.push(evidence.clone());
                if let Some(mut rule) = native_rule {
                    rule["evidenceIndex"] = json!(index);
                    output.rules = vec![rule];
                }
            }
            output.conclusive = response.conclusive
                && !output
                    .coverage_gaps
                    .iter()
                    .any(|g| g.contains("exited unsuccessfully"));
            output.coverage_gaps.extend(response.coverage_gaps);
            Ok(output)
        }
        "trivy" => {
            call(
                engines,
                &permit,
                &abort,
                clock,
                EngineKind::Software,
                vec![
                    scope["projectRoot"].clone(),
                    input["path"].clone(),
                    input
                        .get("includePackages")
                        .filter(|v| !v.is_null())
                        .cloned()
                        .unwrap_or(json!(false)),
                ],
            )
            .await
        }
        "telemetry" => {
            permit.ensure_live(clock()).map_err(EngineError::Failed)?;
            let snapshot = (engines.snapshot)(permit.clone(), abort.clone()).await?;
            let result = async {
                let files = snapshot.entries().await?;
                if files.len() != 1 {
                    return Err(EngineError::Failed(
                        "Telemetry import requires one file".into(),
                    ));
                }
                let raw = snapshot.read(files[0].clone()).await?;
                (engines.parse_telemetry)(
                    raw,
                    input["source"].as_str().expect("telemetry source").into(),
                    permit.targets().iter().map(ToString::to_string).collect(),
                )
            }
            .await;
            // Match finally: cleanup runs for list/read/parser failures, and a cleanup
            // failure replaces the earlier result. No report ever contains raw bytes.
            snapshot.cleanup().await?;
            result
        }
        _ => Err(EngineError::Failed("Unsupported security profile".into())),
    }
}
