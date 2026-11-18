#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::{
    assessments::{service::*, store::SqliteAssessmentStore},
    db::worker::DatabaseWorker,
};
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{
        Arc, Mutex,
        atomic::{AtomicI64, AtomicUsize, Ordering},
    },
    time::Duration,
};
static LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());
const NOW: i64 = 1767225600000;
const SCHEMA: &str = "CREATE TABLE security_scopes(id TEXT PRIMARY KEY,operator_id TEXT,created_at TEXT,data TEXT);CREATE TABLE security_assessment_runs(id TEXT PRIMARY KEY,operator_id TEXT,started_at TEXT,data TEXT);";
fn input() -> Value {
    json!({"authorized":true,"targets":["192.0.2.1","192.0.2.2"],"exclusions":["192.0.2.2"],"ports":[443,22],"expiresAt":"2026-01-01T00:10:00.000Z"})
}
fn create() -> Value {
    json!({"op":"create","alias":"scope","input":input()})
}
fn start() -> Value {
    json!({"op":"start","alias":"run","scope":"scope"})
}
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}
fn register(value: &Value, aliases: &mut HashMap<String, String>) {
    match value {
        Value::Object(fields) => {
            if let (Some(observations), Some(id)) = (
                fields.get("observations").and_then(Value::as_array),
                fields.get("id").and_then(Value::as_str),
            ) {
                for (i, observation) in observations.iter().enumerate() {
                    if let Some(evidence) = observation["evidenceId"].as_str() {
                        aliases.insert(
                            evidence.into(),
                            format!(
                                "<evidence:{}:{i}>",
                                aliases.get(id).map(String::as_str).unwrap_or(id)
                            ),
                        );
                    }
                }
            }
            for child in fields.values() {
                register(child, aliases);
            }
        }
        Value::Array(values) => {
            for child in values {
                register(child, aliases)
            }
        }
        _ => {}
    }
}
fn normalize(value: Value, aliases: &HashMap<String, String>) -> Value {
    match value {
        Value::String(s) => json!(aliases.get(&s).unwrap_or(&s)),
        Value::Array(values) => json!(
            values
                .into_iter()
                .map(|v| normalize(v, aliases))
                .collect::<Vec<_>>()
        ),
        Value::Object(fields) => Value::Object(
            fields
                .into_iter()
                .map(|(key, value)| {
                    let value = if key == "vantagePoint" {
                        json!("<execution-host>")
                    } else if key == "engine"
                        && (value == ENGINE || value == "node-net-tcp-connect")
                    {
                        json!("<tcp-engine>")
                    } else if key == "engineVersion"
                        && value.as_str().is_some_and(|v| {
                            v.starts_with("bun:")
                                || v.starts_with("jait-native:")
                                || v.starts_with('v')
                        })
                    {
                        json!("<engine-version>")
                    } else {
                        normalize(value, aliases)
                    };
                    (key, value)
                })
                .collect(),
        ),
        other => other,
    }
}
async fn compare(mut call: Value) {
    call["op"] = json!("nativeassessment.run");
    let _serial = LOCK.lock().await;
    let root = root();
    let expected = internal_driver::call(
        &root,
        &root
            .join(".jait/artifacts/gateway-rust/assessment-draft/service-contracts")
            .join(uuid::Uuid::new_v4().to_string()),
        json!({"version":1,"calls":[call.clone()]}),
        &|| false,
    )
    .unwrap()[0]
        .clone();
    let clock = Arc::new(AtomicI64::new(call["now"].as_i64().unwrap_or(NOW)));
    let calls = Arc::new(Mutex::new(vec![]));
    let index = Arc::new(AtomicUsize::new(0));
    let mut options = AssessmentOptions::new("native-contract-host".into()).unwrap();
    let time = clock.clone();
    options.clock = Arc::new(move || time.load(Ordering::SeqCst));
    options.interval_ms = call["intervalMs"].as_u64().unwrap_or(0);
    options.duration_ms = call["durationMs"].as_u64().unwrap_or(DURATION_MS);
    if call["realTcp"] != true {
        let observed = calls.clone();
        let time = clock.clone();
        let probe = call["probe"].clone();
        options.probe = Arc::new(move |permit, abort| {
            assert!(!permit.scope_id().is_empty());
            assert!(!permit.operator_id().is_empty());
            let n = index.fetch_add(1, Ordering::SeqCst);
            observed
                .lock()
                .unwrap()
                .push(json!({"target":permit.target().to_string(),"port":permit.port()}));
            if probe["advanceAt"].as_u64() == Some(n as u64) {
                time.fetch_add(probe["advanceMs"].as_i64().unwrap(), Ordering::SeqCst);
            }
            let throw = probe["throwAt"].as_u64() == Some(n as u64);
            let block = probe["block"] == true;
            let state = match probe["states"][n].as_str().unwrap_or("open") {
                "open" => ProbeState::Open,
                "refused" => ProbeState::Refused,
                "timeout" => ProbeState::Timeout,
                _ => ProbeState::Error,
            };
            Box::pin(async move {
                if throw {
                    return Err("fixture probe failure".into());
                }
                if block {
                    abort.cancelled().await;
                    return Ok(ProbeState::Error);
                }
                Ok(state)
            })
        });
    }
    let worker = if call["persistent"] == true {
        let db = rusqlite::Connection::open_in_memory().unwrap();
        db.execute_batch(SCHEMA).unwrap();
        if let Some(seed) = call["seed"].as_str() {
            db.execute_batch(seed).unwrap();
        }
        Some(DatabaseWorker::new(db, std::num::NonZeroU16::new(64).unwrap()).unwrap())
    } else {
        None
    };
    let store = worker.as_ref().map(|db| {
        Arc::new(SqliteAssessmentStore::new(db.clone()))
            as Arc<dyn jait_gateway::assessments::store::AssessmentStore>
    });
    let mut service = if let Some(store) = &store {
        AssessmentService::persistent(options.clone(), store.clone())
            .await
            .unwrap()
    } else {
        AssessmentService::memory(options.clone())
    };
    let mut scopes = HashMap::<String, String>::new();
    let mut runs = HashMap::<String, String>::new();
    let mut aliases = HashMap::<String, String>::new();
    let mut signals = HashMap::<String, AssessmentAbort>::new();
    let mut results = vec![];
    for step in call["steps"].as_array().unwrap() {
        let operator = step["operator"].as_str().unwrap_or("owner");
        let alias = step["alias"].as_str().unwrap_or("").to_string();
        let scope = step["scope"].as_str().unwrap_or("");
        let scope = scopes
            .get(scope)
            .map(String::as_str)
            .unwrap_or(scope)
            .to_string();
        let run = step["run"].as_str().unwrap_or("");
        let run = runs.get(run).map(String::as_str).unwrap_or(run).to_string();
        let result = async {
            match step["op"].as_str().unwrap() {
                "create" => {
                    let result = service
                        .create_scope(
                            &step["input"],
                            operator,
                            step["projectRoot"].as_str().map(str::to_string),
                        )
                        .await?;
                    let id = result["id"].as_str().unwrap().to_string();
                    scopes.insert(alias.clone(), id.clone());
                    aliases.insert(id, format!("<scope:{alias}>"));
                    Ok(result)
                }
                "scope" => service.get_scope(&scope, operator).await,
                "start" => {
                    let external = if step["external"] == true {
                        let abort = AssessmentAbort::default();
                        if step["preAborted"] == true {
                            abort.abort();
                        }
                        signals.insert(alias.clone(), abort.clone());
                        Some(abort)
                    } else {
                        None
                    };
                    let result = service
                        .start(
                            &scope,
                            operator,
                            step["node"].as_str().unwrap_or("gateway"),
                            external,
                        )
                        .await?;
                    assert_eq!(result["engine"], ENGINE);
                    assert_eq!(result["engineVersion"], ENGINE_VERSION);
                    let id = result["id"].as_str().unwrap().to_string();
                    runs.insert(alias.clone(), id.clone());
                    aliases.insert(id, format!("<run:{alias}>"));
                    Ok(result)
                }
                "run" => service.get_run(&run, operator).await,
                "cancel" => service.cancel(&run, operator).await.map(|_| Value::Null),
                "externalAbort" => {
                    if let Some(signal) = signals.get(step["run"].as_str().unwrap_or("")) {
                        signal.abort();
                    }
                    Ok(Value::Null)
                }
                "wait" => service.wait(&run, operator).await,
                "history" => service.history(operator).await,
                "clock" => {
                    clock.store(step["now"].as_i64().unwrap(), Ordering::SeqCst);
                    Ok(Value::Null)
                }
                "sql" => {
                    let sql = step["sql"].as_str().unwrap().to_string();
                    worker
                        .as_ref()
                        .unwrap()
                        .run(move |db| Ok(db.execute_batch(&sql)?))
                        .await
                        .map(|_| Value::Null)
                        .map_err(|e| e.to_string())
                }
                "restart" => {
                    if let Some(store) = &store {
                        AssessmentService::persistent(options.clone(), store.clone())
                            .await
                            .map(|new| {
                                service = new;
                                Value::Null
                            })
                    } else {
                        service = AssessmentService::memory(options.clone());
                        Ok(Value::Null)
                    }
                }
                other => panic!("unhandled step {other}"),
            }
        };
        let result = tokio::time::timeout(Duration::from_secs(5), result)
            .await
            .expect("native scenario wedged");
        results.push(result.unwrap_or_else(|error| {
            if step["normalizeError"] == true {
                json!({"failed":true})
            } else {
                json!({"error":error})
            }
        }));
    }
    let captured = calls.lock().unwrap().clone();
    for id in runs.values() {
        let _ = service.cancel(id, "owner").await;
        let _ = service.wait(id, "owner").await;
    }
    if let Some(worker) = worker {
        worker.shutdown().await.unwrap();
    }
    let results = json!(results);
    register(&results, &mut aliases);
    let actual = json!({"results":normalize(results,&aliases),"calls":captured,"limits":{"targets":TARGET_LIMIT,"ports":PORT_LIMIT,"timeoutMs":PROBE_TIMEOUT_MS,"intervalMs":INTERVAL_MS,"durationMs":DURATION_MS}});
    for (i, (a, e)) in actual["results"]
        .as_array()
        .unwrap()
        .iter()
        .zip(expected["results"].as_array().unwrap())
        .enumerate()
    {
        assert_eq!(a, e, "step {}: {}", i, call["steps"][i]);
    }
    assert_eq!(actual["calls"], expected["calls"]);
    assert_eq!(actual["limits"], expected["limits"]);
}
#[tokio::test(flavor = "current_thread")]
async fn memory_lifecycle_owner_boundaries_exclusions_and_snapshot_clones() {
    compare(json!({"now":NOW,"probe":{"states":["open","refused"]},"steps":[create(),{"op":"scope","scope":"scope"},{"op":"scope","scope":"scope","operator":"other"},start(),{"op":"start","scope":"scope","alias":"busy"},{"op":"wait","run":"run"},{"op":"run","run":"run","operator":"other"},{"op":"cancel","run":"run","operator":"other"},{"op":"cancel","run":"missing"},{"op":"history"},{"op":"history","operator":"other"}]})).await;
}
#[tokio::test(flavor = "current_thread")]
async fn cancellation_external_abort_and_preaborted_starts() {
    for external in [false, true] {
        let mut begin = start();
        begin["external"] = json!(external);
        let stop = if external {
            json!({"op":"externalAbort","run":"run"})
        } else {
            json!({"op":"cancel","run":"run"})
        };
        compare(json!({"now":NOW,"probe":{"block":true},"steps":[create(),begin,{"op":"run","run":"run"},stop,{"op":"wait","run":"run"},{"op":"history"}]})).await;
    }
    let mut begin = start();
    begin["external"] = json!(true);
    begin["preAborted"] = json!(true);
    compare(json!({"now":NOW,"steps":[create(),begin,{"op":"wait","run":"run"},{"op":"history"}]}))
        .await;
}
#[tokio::test(flavor = "current_thread")]
async fn probe_failures_clock_expiry_and_duration_have_coverage_gaps() {
    for probe in [
        json!({"throwAt":1}),
        json!({"advanceAt":0,"advanceMs":601000}),
    ] {
        compare(json!({"now":NOW,"probe":probe,"steps":[create(),start(),{"op":"wait","run":"run"},{"op":"history"}]})).await;
    }
    compare(json!({"now":NOW,"durationMs":15,"probe":{"block":true},"steps":[create(),start(),{"op":"wait","run":"run"},{"op":"history"}]})).await;
}
#[tokio::test(flavor = "current_thread")]
async fn persistence_reopen_and_failed_writes_retain_ownership_and_release_execution() {
    let fail_scope = "CREATE TRIGGER scope_failure BEFORE INSERT ON security_scopes BEGIN SELECT RAISE(ABORT,'scope write failed'); END";
    let fail_run = "CREATE TRIGGER run_failure BEFORE INSERT ON security_assessment_runs BEGIN SELECT RAISE(ABORT,'run write failed'); END";
    compare(json!({"now":NOW,"persistent":true,"steps":[{"op":"sql","sql":fail_scope},create(),{"op":"history"},{"op":"sql","sql":"DROP TRIGGER scope_failure"},create(),{"op":"sql","sql":fail_run},start(),{"op":"sql","sql":"DROP TRIGGER run_failure"},start(),{"op":"wait","run":"run"},{"op":"restart"},{"op":"run","run":"run"},{"op":"scope","scope":"scope","operator":"other"},{"op":"history"}]})).await;
}

#[tokio::test(flavor = "current_thread")]
async fn scope_owner_method_node_and_expiry_rejections_precede_dispatch() {
    let mut denied = create();
    denied["operator"] = json!("");
    let mut methods = create();
    methods["input"]["methods"] = json!(["tls"]);
    compare(json!({"now":NOW,"steps":[denied,create(),{"op":"start","scope":"scope","operator":"other"},{"op":"start","scope":"scope","node":"remote"},{"op":"clock","now":NOW+600000},start(),{"op":"history"}]})).await;
    compare(json!({"now":NOW,"steps":[methods,start(),{"op":"history"}]})).await;
}

#[tokio::test(flavor = "current_thread")]
async fn completion_write_failure_keeps_observations_and_releases_lease() {
    let trigger = "CREATE TRIGGER complete_failure BEFORE INSERT ON security_assessment_runs WHEN json_extract(NEW.data,'$.status') != 'running' BEGIN SELECT RAISE(ABORT,'completion write failed'); END";
    compare(json!({"now":NOW,"persistent":true,"steps":[create(),{"op":"sql","sql":trigger},start(),{"op":"wait","run":"run"},{"op":"run","run":"run"},{"op":"sql","sql":"DROP TRIGGER complete_failure"},{"op":"start","scope":"scope","alias":"second"},{"op":"wait","run":"second"}]})).await;
}

#[tokio::test(flavor = "current_thread")]
async fn actual_tcp_connector_compares_only_on_contract_owned_loopback_port() {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    let mut scope = create();
    scope["input"]["targets"] = json!(["127.0.0.1"]);
    scope["input"]["exclusions"] = json!([]);
    scope["input"]["ports"] = json!([port]);
    compare(json!({"now":NOW,"realTcp":true,"allowedLoopbackPort":port,"steps":[scope,start(),{"op":"wait","run":"run"}]})).await;
    drop(listener);
}

#[tokio::test(flavor = "current_thread")]
async fn histories_retain_fifty_records_per_owner_in_reverse_creation_order() {
    let mut steps = vec![];
    for n in 0..55 {
        let mut scope = create();
        scope["alias"] = json!(format!("scope-{n}"));
        steps.push(scope);
        steps.push(json!({"op":"clock","now":NOW+n+1}));
    }
    steps.push(json!({"op":"history"}));
    steps.push(json!({"op":"history","operator":"other"}));
    compare(json!({"now":NOW,"steps":steps})).await;
}

#[tokio::test(flavor = "current_thread")]
async fn monotonic_budget_survives_a_backwards_wall_clock_jump() {
    compare(json!({"now":NOW,"durationMs":15,"probe":{"advanceAt":0,"advanceMs":-3600000,"block":true},"steps":[create(),start(),{"op":"wait","run":"run"},{"op":"history"}]})).await;
}

#[tokio::test(flavor = "current_thread")]
async fn restart_marks_persisted_running_records_interrupted() {
    let record = json!({"id":"old-run","operatorId":"owner","startedAt":"2026-01-01T00:00:00.000Z","status":"running","coverageGaps":[]});
    let seed = format!(
        "INSERT INTO security_assessment_runs VALUES ('old-run','owner','2026-01-01T00:00:00.000Z','{}')",
        record
    );
    compare(json!({"now":NOW,"persistent":true,"seed":seed,"steps":[{"op":"run","run":"old-run"},{"op":"history"},{"op":"restart"},{"op":"run","run":"old-run"},{"op":"run","run":"old-run","operator":"other"}]})).await;
}

#[tokio::test(flavor = "current_thread")]
async fn independent_instances_share_execution_lease_and_release_after_cancel() {
    let _serial = LOCK.lock().await;
    let mut options = AssessmentOptions::new("contract-host".into()).unwrap();
    options.clock = Arc::new(|| NOW);
    options.probe = Arc::new(|_, abort| {
        Box::pin(async move {
            abort.cancelled().await;
            Ok(ProbeState::Error)
        })
    });
    let first = AssessmentService::memory(options.clone());
    let second = AssessmentService::memory(options);
    let a = first.create_scope(&input(), "owner", None).await.unwrap();
    let b = second.create_scope(&input(), "owner", None).await.unwrap();
    let a = a["id"].as_str().unwrap();
    let b = b["id"].as_str().unwrap();
    let run = first.start(a, "owner", "gateway", None).await.unwrap();
    assert!(second.start(b, "owner", "gateway", None).await.is_err());
    let id = run["id"].as_str().unwrap();
    first.cancel(id, "owner").await.unwrap();
    let run = first.wait(id, "owner").await.unwrap();
    assert_eq!(run["status"], "cancelled");
    assert_eq!(run["observations"], json!([]));
    let run = second.start(b, "owner", "gateway", None).await.unwrap();
    let id = run["id"].as_str().unwrap();
    second.cancel(id, "owner").await.unwrap();
    assert_eq!(
        second.wait(id, "owner").await.unwrap()["status"],
        "cancelled"
    );
}

#[tokio::test(flavor = "current_thread")]
async fn null_scope_creation_preserves_authentication_before_property_error() {
    compare(json!({"now":NOW,"steps":[{"op":"create","input":null,"operator":""},{"op":"create","input":null}]})).await;
}
