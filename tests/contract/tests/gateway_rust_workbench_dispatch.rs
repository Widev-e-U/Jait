#[path = "../src/internal_driver.rs"]
mod internal_driver;
use futures_util::future::BoxFuture;
use jait_gateway::{
    assessments::{workbench::*, workbench_engines::*, workbench_policy::authorize_check},
    time::Clock,
};
use serde_json::{Value, json};
use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
};
const NOW: i64 = 1792670400000;
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}
fn output() -> Value {
    json!({"engine":"fixture","engineVersion":"v1","evidence":[{"id":"measure","target":"192.0.2.1","port":443,"facts":{}}],"rules":[{"ruleId":"http.nosniff","evidenceIndex":0}],"coverageGaps":[],"conclusive":true})
}
#[derive(Clone)]
struct Script {
    steps: Vec<Value>,
    cursor: Arc<Mutex<usize>>,
    events: Arc<Mutex<Vec<Value>>>,
    abort: WorkbenchAbort,
}
impl Script {
    fn run(
        &self,
        name: &str,
        args: Vec<Value>,
        signal: bool,
        runner: bool,
    ) -> Result<Value, EngineError> {
        self.events.lock().unwrap().push(json!({"name":name,"args":args,"signal":signal,"runner":runner,"aborted":self.abort.aborted()}));
        let mut cursor = self.cursor.lock().unwrap();
        let step = self
            .steps
            .get(*cursor)
            .unwrap_or_else(|| panic!("unexpected {name}"))
            .clone();
        *cursor += 1;
        assert_eq!(step["name"], name);
        if step["abort"] == true {
            self.abort.abort();
        }
        if let Some(error) = step["error"].as_str() {
            Err(EngineError::Failed(error.into()))
        } else {
            Ok(step["value"].clone())
        }
    }
}
struct Snapshot(Script);
impl TelemetrySnapshot for Snapshot {
    fn entries(&self) -> BoxFuture<'_, Result<Vec<String>, EngineError>> {
        Box::pin(async {
            Ok(serde_json::from_value(self.0.run(
                "readdir",
                vec![json!("snapshot")],
                false,
                false,
            )?)
            .unwrap())
        })
    }
    fn read(&self, name: String) -> BoxFuture<'_, Result<String, EngineError>> {
        Box::pin(async move {
            Ok(self
                .0
                .run(
                    "readFile",
                    vec![json!(format!("snapshot/{name}")), json!("utf8")],
                    false,
                    false,
                )?
                .as_str()
                .unwrap()
                .into())
        })
    }
    fn cleanup(&self) -> BoxFuture<'_, Result<(), EngineError>> {
        Box::pin(async {
            self.0.run("cleanup", vec![], false, false)?;
            Ok(())
        })
    }
}
async fn compare(profile: &str, patch: Value, steps: Vec<Value>) {
    let scope = json!({"id":"scope","operatorId":"owner","authorized":true,"targets":["192.0.2.1","192.0.2.2"],"exclusions":["192.0.2.2"],"ports":[443,22],"expiresAt":"2026-10-22T12:10:00.000Z","methods":[profile],"paths":["fixture.json"],"projectRoot":"/fixture","serverNames":["example.test"],"sshUsernames":["audit"]});
    let mut input = json!({"scopeId":"scope","profile":profile});
    if !["nmap", "trivy", "telemetry"].contains(&profile) {
        input["target"] = json!("192.0.2.1");
    }
    if ["tls", "http", "https", "ssh", "nuclei"].contains(&profile) {
        input["port"] = json!(443);
    }
    if ["trivy", "telemetry"].contains(&profile) {
        input["path"] = json!("fixture.json");
    }
    if profile == "telemetry" {
        input["source"] = json!("suricata");
    }
    for (k, v) in patch.as_object().unwrap() {
        input[k] = v.clone();
    }
    let call =
        json!({"op":"nativeworkbenchdispatch.run","scope":scope,"input":input,"engineSteps":steps});
    let expected = internal_driver::call(
        &root(),
        &root()
            .join(".jait/artifacts/gateway-rust/workbench-dispatch-contracts")
            .join(uuid::Uuid::new_v4().to_string()),
        json!({"version":1,"calls":[call]}),
        &|| false,
    )
    .unwrap()[0]
        .clone();
    let abort = WorkbenchAbort::default();
    let script = Script {
        steps,
        cursor: Arc::new(Mutex::new(0)),
        events: Arc::new(Mutex::new(vec![])),
        abort: abort.clone(),
    };
    let run = script.clone();
    let snapshot = script.clone();
    let parse = script.clone();
    let engines = WorkbenchEngines {
        call: Arc::new(move |call, abort| {
            assert_eq!(abort.aborted(), run.abort.aborted());
            assert_eq!(call.permit().operator(), "owner");
            let result = run.run(
                call.kind().name(),
                call.arguments().to_vec(),
                true,
                matches!(
                    call.kind(),
                    EngineKind::HostAudit
                        | EngineKind::Nmap
                        | EngineKind::Nuclei
                        | EngineKind::Software
                ),
            );
            Box::pin(async move { result.map(|v| serde_json::from_value(v).unwrap()) })
        }),
        snapshot: Arc::new(move |permit, abort| {
            let script = snapshot.clone();
            let result = script.run(
                "createSnapshot",
                vec![
                    permit.scope()["projectRoot"].clone(),
                    permit.input()["path"].clone(),
                ],
                true,
                false,
            );
            assert_eq!(abort.aborted(), script.abort.aborted());
            Box::pin(async move {
                result?;
                Ok(Box::new(Snapshot(script)) as Box<dyn TelemetrySnapshot>)
            })
        }),
        parse_telemetry: Arc::new(move |raw, source, targets| {
            parse
                .run(
                    "parseTelemetry",
                    vec![json!(raw), json!(source), json!(targets)],
                    false,
                    false,
                )
                .map(|v| serde_json::from_value(v).unwrap())
        }),
    };
    let permit = authorize_check(&input, scope, "owner", "gateway", NOW).unwrap();
    let clock: Clock = Arc::new(|| NOW);
    let result = dispatch(permit, abort, &engines, &clock).await;
    let mut actual = match result {
        Ok(value) => json!({"ok":true,"value":value}),
        Err(EngineError::Failed(error) | EngineError::Unavailable(error)) => {
            json!({"ok":false,"error":error})
        }
    };
    actual["events"] = json!(*script.events.lock().unwrap());
    actual["consumed"] = json!(*script.cursor.lock().unwrap());
    assert_eq!(actual, expected, "profile {profile}");
}
#[tokio::test]
async fn every_profile_forwards_only_scoped_targets_ports_and_options() {
    for (profile, name) in [
        ("tls", "checkTls"),
        ("http", "checkHttp"),
        ("https", "checkHttp"),
        ("ssh", "checkSsh"),
        ("host-audit", "auditHost"),
        ("nmap", "scanNmap"),
        ("trivy", "scanSoftware"),
    ] {
        compare(
            profile,
            json!({}),
            vec![json!({"name":name,"value":output()})],
        )
        .await;
    }
    compare(
        "tls",
        json!({"serverName":"example.test"}),
        vec![json!({"name":"checkTls","value":output()})],
    )
    .await;
    compare(
        "host-audit",
        json!({"port":22,"username":"audit"}),
        vec![json!({"name":"auditHost","value":output()})],
    )
    .await;
    compare(
        "nmap",
        json!({"target":"192.0.2.1","port":22}),
        vec![json!({"name":"scanNmap","value":output()})],
    )
    .await;
    compare(
        "trivy",
        json!({"includePackages":true}),
        vec![json!({"name":"scanSoftware","value":output()})],
    )
    .await;
}
#[tokio::test]
async fn nuclei_merges_deterministic_http_evidence_and_never_infers_success_from_failure() {
    for https in [false, true] {
        for variant in [
            "observed",
            "absent",
            "no-evidence",
            "failed-engine",
            "partial-http",
            "cancelled",
        ] {
            let mut scanner = output();
            scanner["engine"] = json!("nuclei");
            scanner["rules"] = json!([{"ruleId":"template.rule","evidenceIndex":0}]);
            if variant == "failed-engine" {
                scanner["coverageGaps"] = json!(["scanner exited unsuccessfully"]);
            }
            let mut http = output();
            if variant == "absent" {
                http["rules"] = json!([]);
            }
            if variant == "no-evidence" {
                http["evidence"] = json!([]);
            }
            if variant == "partial-http" {
                http["conclusive"] = json!(false);
            }
            let mut steps =
                vec![json!({"name":"scanNuclei","value":scanner,"abort":variant=="cancelled"})];
            if variant != "cancelled" {
                steps.push(json!({"name":"checkHttp","value":http}));
            }
            compare(
                "nuclei",
                json!({"scheme":if https{"https"}else{"http"}}),
                steps,
            )
            .await;
        }
    }
}
#[tokio::test]
async fn telemetry_snapshot_cleanup_runs_after_enumeration_read_and_parser_failures() {
    for failure in ["none", "entries", "count", "read", "parse", "cleanup"] {
        let mut steps = vec![
            json!({"name":"createSnapshot","value":null}),
            json!({"name":"readdir","value":if failure=="count"{json!([])}else{json!(["alerts.json"])} }),
        ];
        if failure == "entries" {
            steps[1]["error"] = json!("fixture entries");
        } else if failure != "count" {
            steps.push(json!({"name":"readFile","value":"raw untrusted alerts"}));
            if failure == "read" {
                steps.last_mut().unwrap()["error"] = json!("fixture read");
            } else {
                steps.push(json!({"name":"parseTelemetry","value":output()}));
                if failure == "parse" {
                    steps.last_mut().unwrap()["error"] = json!("fixture parse");
                }
            }
        }
        steps.push(json!({"name":"cleanup","value":null}));
        if failure == "cleanup" {
            steps.last_mut().unwrap()["error"] = json!("fixture cleanup");
        }
        compare("telemetry", json!({}), steps).await;
    }
}
