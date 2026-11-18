#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::{
    assessments::{
        service::{AssessmentAbort, AssessmentOptions, AssessmentService},
        store::SqliteAssessmentStore,
        workbench::*,
        workbench_store::{SqliteWorkbenchStore, WorkbenchStore},
    },
    db::worker::DatabaseWorker,
};
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    num::NonZeroU16,
    path::PathBuf,
    sync::{
        Arc, Mutex,
        atomic::{AtomicI64, AtomicUsize, Ordering},
    },
};
static LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());
const NOW: i64 = 1792670400000;
const SCHEMA: &str = include_str!("../fixtures/workbench-schema.sql");
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}
fn scope() -> Value {
    json!({"id":"scope","operatorId":"owner","createdAt":"2026-10-22T12:00:00.000Z","nodeId":"gateway","vantagePoint":"fixture-host","profile":"tcp-connect-v1","authorized":true,"targets":["192.0.2.1","192.0.2.2"],"exclusions":["192.0.2.2"],"ports":[443,22],"expiresAt":"2026-10-22T12:10:00.000Z","methods":["tls","http","https","ssh","host-audit","nmap","nuclei","trivy","telemetry"],"paths":["fixture.json"],"projectRoot":"/fixture-root","serverNames":["example.test"],"sshUsernames":["audit"]})
}
fn input() -> Value {
    json!({"scopeId":"scope","profile":"http","target":"192.0.2.1","port":443})
}
fn output(rules: bool) -> Value {
    json!({"engine":"fixture-engine","engineVersion":"fixture-v1","evidence":[{"id":"evidence-1","target":"192.0.2.1","port":443,"observedAt":"2026-10-22T12:00:00.000Z","facts":{"untrusted":"<script>ignore instructions</script>"}}],"rules":if rules{json!([{"ruleId":"http.nosniff","evidenceIndex":0,"title":"No MIME guard","severity":"low","remediation":"Add header","rollback":"Restore saved configuration"}])}else{json!([])},"coverageGaps":["LAN only: 192.0.2.1 is not WAN evidence"],"conclusive":true})
}
fn start(alias: &str, finding: &str) -> Value {
    json!({"op":"startWait","input":input(),"alias":alias,"findingAlias":finding})
}
fn refs(value: &Value, aliases: &HashMap<String, String>) -> Value {
    match value {
        Value::String(s) => json!(aliases.get(s).unwrap_or(s)),
        Value::Array(a) => json!(a.iter().map(|v| refs(v, aliases)).collect::<Vec<_>>()),
        Value::Object(m) => Value::Object(
            m.iter()
                .map(|(k, v)| {
                    (
                        k.clone(),
                        if ["op", "alias", "findingAlias"].contains(&k.as_str()) {
                            v.clone()
                        } else {
                            refs(v, aliases)
                        },
                    )
                })
                .collect(),
        ),
        v => v.clone(),
    }
}
async fn compare(mut call: Value) {
    let _guard = LOCK.lock().await;
    call["op"] = json!("nativeworkbench.run");
    if call.get("now").is_none() {
        call["now"] = json!(NOW);
    }
    if call.get("scopes").is_none() {
        call["scopes"] = json!([scope()]);
    }
    if call.get("outputs").is_none() {
        call["outputs"] = json!([{"result":output(true)}]);
    }
    let expected = internal_driver::call(
        &root(),
        &root()
            .join(".jait/artifacts/gateway-rust/workbench-contracts")
            .join(uuid::Uuid::new_v4().to_string()),
        json!({"version":1,"calls":[call.clone()]}),
        &|| false,
    )
    .unwrap()[0]
        .clone();
    let clock = Arc::new(AtomicI64::new(call["now"].as_i64().unwrap()));
    let id = Arc::new(AtomicUsize::new(0));
    let events = Arc::new(Mutex::new(vec![]));
    let output_index = Arc::new(AtomicUsize::new(0));
    let db = rusqlite::Connection::open_in_memory().unwrap();
    db.execute_batch(SCHEMA).unwrap();
    for scope in call["scopes"].as_array().unwrap() {
        db.execute(
            "INSERT INTO security_scopes VALUES (?,?,?,?)",
            rusqlite::params![
                scope["id"].as_str().unwrap(),
                scope["operatorId"].as_str().unwrap(),
                scope["createdAt"].as_str().unwrap(),
                scope.to_string()
            ],
        )
        .unwrap();
    }
    if let Some(runs) = call["seedRuns"].as_array() {
        for run in runs {
            db.execute(
                "INSERT INTO security_check_runs VALUES (?,?,?,?,?)",
                rusqlite::params![
                    run["id"].as_str().unwrap(),
                    run["operatorId"].as_str().unwrap(),
                    run["scopeId"].as_str().unwrap(),
                    run["startedAt"].as_str().unwrap(),
                    run.to_string()
                ],
            )
            .unwrap();
        }
    }
    if let Some(findings) = call["seedFindings"].as_array() {
        for f in findings {
            db.execute(
                "INSERT INTO security_findings VALUES (?,?,?,?,?)",
                rusqlite::params![
                    f["id"].as_str().unwrap(),
                    call["owner"].as_str().unwrap_or("owner"),
                    f["scopeId"].as_str().unwrap(),
                    f["lastSeen"].as_str().unwrap(),
                    f.to_string()
                ],
            )
            .unwrap();
        }
    }
    if let Some(sql) = call["seedSQL"].as_str() {
        db.execute_batch(sql).unwrap();
    }
    let worker = DatabaseWorker::new(db, NonZeroU16::new(64).unwrap()).unwrap();
    let mut assessment_options = AssessmentOptions::new("fixture-host".into()).unwrap();
    let time = clock.clone();
    assessment_options.clock = Arc::new(move || time.load(Ordering::SeqCst));
    let assessment = AssessmentService::persistent(
        assessment_options,
        Arc::new(SqliteAssessmentStore::new(worker.clone())),
    )
    .await
    .unwrap();
    let adapter: CheckAdapter = {
        let time = clock.clone();
        let events = events.clone();
        let index = output_index.clone();
        let outputs = call["outputs"].as_array().unwrap().clone();
        Arc::new(move |permit, abort| {
            events.lock().unwrap().push(
                json!({"input":permit.input(),"scope":permit.scope(),"aborted":abort.aborted()}),
            );
            assert_eq!(permit.operator(), "owner");
            assert!(
                !permit.targets().is_empty() || matches!(permit.profile(), "trivy" | "telemetry")
            );
            let _ports = permit.ports();
            let n = index.fetch_add(1, Ordering::SeqCst);
            let output = outputs.get(n).or_else(|| outputs.last()).unwrap().clone();
            let time = time.clone();
            Box::pin(async move {
                if output["waitForAbort"] == true {
                    abort.cancelled().await;
                }
                if let Some(ms) = output["advanceMs"].as_i64() {
                    time.fetch_add(ms, Ordering::SeqCst);
                }
                if let Some(error) = output["error"].as_str() {
                    return Err(EngineError::Failed(error.into()));
                }
                if let Some(error) = output["unavailable"].as_str() {
                    return Err(EngineError::Unavailable(error.into()));
                }
                let mut result = output["result"].clone();
                if let Some(n) = output["rawRepeat"].as_u64() {
                    result["raw"] = json!("é".repeat(n as usize));
                }
                Ok(serde_json::from_value(result).unwrap())
            })
        })
    };
    let mut options =
        WorkbenchOptions::new(adapter, Arc::new(|_| Box::pin(async { Ok(json!([])) })));
    let time = clock.clone();
    options.clock = Arc::new(move || time.load(Ordering::SeqCst));
    options.identifier = Arc::new(move || format!("fixture-{}", id.fetch_add(1, Ordering::SeqCst)));
    let store = Arc::new(SqliteWorkbenchStore::new(worker.clone())) as Arc<dyn WorkbenchStore>;
    let mut service = if call["persistent"] == true {
        SecurityWorkbench::persistent(assessment.clone(), options.clone(), store.clone())
            .await
            .unwrap()
    } else {
        SecurityWorkbench::memory(assessment.clone(), options.clone())
    };
    let mut saved_service: Option<SecurityWorkbench> = None;
    let mut aliases = HashMap::new();
    let mut results = vec![];
    for original in call["steps"].as_array().unwrap() {
        let step = refs(original, &aliases);
        let owner = step["owner"].as_str().unwrap_or("owner");
        let node = step["node"].as_str().unwrap_or("gateway");
        let id = step["id"].as_str().unwrap_or("");
        let result:Result<Value,String>=async{match step["op"].as_str().unwrap(){
  "authorize"=>service.authorize(&step["input"],owner,node).await.map(|p|p.scope().clone()),
  "startWait"=>{let started=service.start(&step["input"],owner,node,None).await?;service.wait(started["id"].as_str().unwrap(),owner).await},
  "start"=>{let abort=AssessmentAbort::default();if step["aborted"]==true{abort.abort();}service.start(&step["input"],owner,node,Some(abort)).await},
  "wait"=>service.wait(id,owner).await,
  "cancel"=>service.cancel(id,owner).await.map(|_|Value::Null),
  "get"=>service.get(id,owner).await,
  "finding"=>service.finding(id,owner).await,
  "history"=>service.history(owner).await,
  "decide"=>service.decide(id,owner,step["disposition"].as_str().unwrap_or("")).await,
  "plan"=>service.plan(id,owner).await,
  "verify"=>service.verify(id,owner,node,None).await,
  "compare"=>service.compare(step["before"].as_str().unwrap(),step["after"].as_str().unwrap(),owner).await,
  "report"=>service.report(id,owner).await,
  "delete"=>service.delete_run(id,owner).await.map(|_|Value::Null),
  "forkService"=>{saved_service=Some(service.clone());service=SecurityWorkbench::memory(assessment.clone(),options.clone());Ok(Value::Null)},
  "savedCancel"=>saved_service.as_ref().unwrap().cancel(id,owner).await.map(|_|Value::Null),
  "savedWait"=>saved_service.as_ref().unwrap().wait(id,owner).await,
  "restart"=>{service=if call["persistent"]==true{SecurityWorkbench::persistent(assessment.clone(),options.clone(),store.clone()).await?}else{SecurityWorkbench::memory(assessment.clone(),options.clone())};Ok(Value::Null)},
  "advance"=>{clock.fetch_add(step["ms"].as_i64().unwrap(),Ordering::SeqCst);Ok(Value::Null)},
  "sql"=>{let sql=step["sql"].as_str().unwrap().to_string();worker.run(move|db|{db.execute_batch(&sql)?;Ok(())}).await.map_err(|e|e.to_string())?;Ok(Value::Null)},
  "raw"=>worker.run(|db|{let mut s=db.prepare("SELECT id,run_id,operator_id,sha256,content_type,raw FROM security_artifacts ORDER BY id")?;let rows=s.query_map([],|r|Ok(json!({"id":r.get::<_,String>(0)?,"run_id":r.get::<_,String>(1)?,"operator_id":r.get::<_,String>(2)?,"sha256":r.get::<_,String>(3)?,"content_type":r.get::<_,String>(4)?,"raw":r.get::<_,String>(5)?})))?.collect::<Result<Vec<_>,_>>()?;Ok(json!(rows))}).await.map_err(|e|e.to_string()),
  _=>panic!("unknown fixture step")
 }}.await;
        match result {
            Ok(value) => {
                if let (Some(alias), Some(id)) = (original["alias"].as_str(), value["id"].as_str())
                {
                    aliases.insert(alias.into(), id.into());
                }
                if let (Some(alias), Some(id)) = (
                    original["findingAlias"].as_str(),
                    value["findingIds"][0].as_str(),
                ) {
                    aliases.insert(alias.into(), id.into());
                }
                results.push(json!({"ok":true,"value":value}));
            }
            Err(error) => results.push(json!({"ok":false,"error":error})),
        }
    }
    let actual = json!({"results":results,"events":*events.lock().unwrap(),"outputs":output_index.load(Ordering::SeqCst)});
    worker.shutdown().await.unwrap();
    if actual != expected {
        let dir = root().join(".jait/artifacts/gateway-rust/workbench-diffs");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join(format!("{}.json", uuid::Uuid::new_v4()));
        std::fs::write(
            &path,
            serde_json::to_vec_pretty(&json!({"input":call,"actual":actual,"expected":expected}))
                .unwrap(),
        )
        .unwrap();
        panic!("workbench mismatch: {}", path.display());
    }
}
#[tokio::test]
async fn findings_dispositions_plans_reports_comparisons_and_verify_match() {
    for persistent in [false, true] {
        compare(json!({"persistent":persistent,"outputs":[{"result":output(true)},{"result":output(true)},{"result":output(false)}],"steps":[start("first","finding"),{"op":"decide","id":"finding","disposition":"accepted-risk"},start("second","finding"),{"op":"finding","id":"finding"},{"op":"plan","id":"finding"},{"op":"report","id":"first"},{"op":"compare","before":"first","after":"second"},{"op":"verify","id":"finding"},{"op":"finding","id":"finding"},{"op":"history"},{"op":"get","id":"first","owner":"foreign"},{"op":"finding","id":"finding","owner":"foreign"}]})).await;
    }
}
#[tokio::test]
async fn authorization_checks_scope_owner_gateway_method_target_port_and_optional_selectors() {
    let mut steps = vec![];
    for (key, value) in [
        ("scheme", json!("ftp")),
        ("includePackages", json!("yes")),
        ("profile", json!("tcp")),
        ("target", json!("192.0.2.2")),
        ("target", json!("192.0.2.99")),
        ("target", Value::Null),
        ("port", json!(443.5)),
        ("port", json!("443")),
        ("port", Value::Null),
        ("serverName", json!("evil.test")),
        ("username", json!("root")),
        ("path", json!("../escape")),
    ] {
        let mut i = input();
        i[key] = value;
        steps.push(json!({"op":"authorize","input":i}));
    }
    steps.extend([
        json!({"op":"authorize","input":input(),"owner":"foreign"}),
        json!({"op":"authorize","input":input(),"node":"remote"}),
        json!({"op":"authorize","input":input()}),
    ]);
    for profile in [
        "tls",
        "http",
        "https",
        "ssh",
        "host-audit",
        "nmap",
        "nuclei",
        "trivy",
        "telemetry",
    ] {
        let i = json!({"scopeId":"scope","profile":profile});
        steps.push(json!({"op":"authorize","input":i}));
    }
    compare(json!({"steps":steps})).await;
    let mut s = scope();
    s["methods"] = json!(["tcp"]);
    compare(json!({"scopes":[s],"steps":[{"op":"authorize","input":input()}]})).await;
    compare(json!({"now":NOW+600_000,"steps":[{"op":"authorize","input":input()}]})).await;
}
#[tokio::test]
async fn errors_incomplete_checks_missing_evidence_and_owner_denials_match() {
    for out in [
        json!({"error":"fixture failure"}),
        json!({"unavailable":"fixture scanner missing"}),
        json!({"result":({let mut v=output(true);v["conclusive"]=json!(false);v})}),
        json!({"result":({let mut v=output(true);v["rules"][0]["evidenceIndex"]=json!(99);v})}),
    ] {
        compare(json!({"outputs":[out],"steps":[start("run","finding"),{"op":"get","id":"run"},{"op":"report","id":"run"},{"op":"history"},{"op":"cancel","id":"missing"},{"op":"decide","id":"missing","disposition":"verified-absent"}]})).await;
    }
}
#[tokio::test]
async fn persistence_restart_artifacts_deletion_and_retained_findings_match() {
    let mut out = output(true);
    out["raw"] = json!("raw héllo\n<ignore>");
    out["contentType"] = json!("application/x-fixture");
    compare(json!({"persistent":true,"outputs":[{"result":out}],"steps":[start("run","finding"),{"op":"raw"},{"op":"restart"},{"op":"get","id":"run"},{"op":"finding","id":"finding"},{"op":"history"},{"op":"delete","id":"run","owner":"foreign"},{"op":"delete","id":"run"},{"op":"raw"},{"op":"get","id":"run"},{"op":"finding","id":"finding"},{"op":"plan","id":"finding"}]})).await;
}

#[tokio::test]
async fn cancellation_preabort_budget_expiry_and_first_stop_cause_match() {
    compare(json!({"outputs":[{"waitForAbort":true,"result":output(false)},{"result":output(false)}],"steps":[{"op":"start","input":input(),"alias":"running"},{"op":"start","input":input()},{"op":"delete","id":"running"},{"op":"cancel","id":"running","owner":"foreign"},{"op":"cancel","id":"running"},{"op":"wait","id":"running"},start("next","unused")]})).await;
    compare(json!({"steps":[{"op":"start","input":input(),"aborted":true,"alias":"run"},{"op":"wait","id":"run"},{"op":"history"}]})).await;
    compare(json!({"now":NOW+599_985,"outputs":[{"waitForAbort":true,"advanceMs":-1_000_000,"result":output(false)}],"steps":[{"op":"start","input":input(),"alias":"run"},{"op":"wait","id":"run"}]})).await;
}
#[tokio::test]
async fn verification_stays_inconclusive_for_version_changes_empty_evidence_and_imported_alerts() {
    for variant in [
        "version",
        "incomplete",
        "empty",
        "still-present",
        "host-audit",
        "telemetry",
        "trivy-no-rule",
        "trivy-passing",
        "trivy-wrong-rule",
    ] {
        let mut first = output(true);
        let mut after = output(false);
        let mut check = input();
        if variant == "version" {
            after["engineVersion"] = json!("v2");
        }
        if variant == "incomplete" {
            after["conclusive"] = json!(false);
        }
        if variant == "empty" {
            after["evidence"] = json!([]);
        }
        if variant == "still-present" {
            after = first.clone();
        }
        if ["host-audit", "telemetry"].contains(&variant) {
            check["profile"] = json!(variant);
            if variant == "telemetry" {
                check["path"] = json!("fixture.json");
                check["source"] = json!("wazuh");
            }
        }
        if variant.starts_with("trivy-") {
            check = json!({"scopeId":"scope","profile":"trivy","path":"fixture.json"});
            first["rules"][0]["ruleId"] = json!("trivy.config.CFG-1");
            if variant == "trivy-passing" {
                after["evidence"][0]["facts"]["passingConfigurationRules"] = json!("CFG-1,CFG-2");
            }
            if variant == "trivy-wrong-rule" {
                after["evidence"][0]["facts"]["passingConfigurationRules"] = json!("CFG-10");
            }
        }
        compare(json!({"outputs":[{"result":first},{"result":after}],"steps":[{"op":"startWait","input":check,"alias":"before","findingAlias":"finding"},{"op":"verify","id":"finding"},{"op":"finding","id":"finding"},{"op":"report","id":"before"}]})).await;
    }
}
#[tokio::test]
async fn restart_marks_running_records_interrupted_and_persistence_failure_releases_admission() {
    let run = json!({"id":"seed","operatorId":"owner","scopeId":"scope","startedAt":"2026-10-22T12:00:00.000Z","completedAt":null,"status":"running","coverageGaps":[]});
    compare(json!({"persistent":true,"seedRuns":[run],"steps":[{"op":"get","id":"seed"},{"op":"history"}]})).await;
    compare(json!({"persistent":true,"seedSQL":"CREATE TRIGGER fail_initial BEFORE INSERT ON security_check_runs BEGIN SELECT RAISE(ABORT,'fixture initial'); END;","steps":[{"op":"start","input":input()},{"op":"sql","sql":"DROP TRIGGER fail_initial;"},start("after","finding")]})).await;
    compare(json!({"persistent":true,"seedSQL":"CREATE TRIGGER fail_completion BEFORE UPDATE ON security_check_runs BEGIN SELECT RAISE(ABORT,'fixture completion'); END;","steps":[start("run","finding"),{"op":"get","id":"run"},{"op":"history"}]})).await;
}

#[tokio::test]
async fn evidence_and_raw_byte_budgets_enforce_exact_boundaries() {
    for n in [256, 257] {
        let mut out = output(false);
        out["evidence"] = json!(vec![
            json!({"id":"measurement","target":"192.0.2.1","facts":{}});
            n
        ]);
        compare(json!({"outputs":[{"result":out}],"steps":[start("run","unused")]})).await;
    }
    for n in [0, 262144, 262145] {
        compare(json!({"persistent":true,"outputs":[{"result":output(false),"rawRepeat":n}],"steps":[start("run","unused"),{"op":"restart"},{"op":"get","id":"run"}]})).await;
    }
}

#[tokio::test]
async fn replacing_service_keeps_global_lease_until_original_execution_finishes() {
    compare(json!({"outputs":[{"waitForAbort":true,"result":output(false)},{"result":output(false)}],"steps":[{"op":"start","input":input(),"alias":"running"},{"op":"forkService"},{"op":"start","input":input()},{"op":"savedCancel","id":"running"},{"op":"savedWait","id":"running"},start("after","unused")]})).await;
}

#[tokio::test]
async fn authenticated_http_native_dispatch_evidence_plan_and_verification_work_together() {
    use jait_gateway::{
        assessments::workbench_engines::*,
        routes::{auth::AuthState, security_workbench::*},
        security::http_auth::{self, AuthUser},
        time,
    };
    let _guard = LOCK.lock().await;
    let now = (time::default_clock())();
    let mut settings = AssessmentOptions::new("owned-loopback-fixture".into()).unwrap();
    settings.identifier = Arc::new(|| "scope".into());
    let assessment = AssessmentService::memory(settings);
    let scope=assessment.create_scope(&json!({"authorized":true,"targets":["127.0.0.1"],"exclusions":[],"ports":[443],"expiresAt":time::iso(now+600_000).unwrap(),"methods":["http"]}),"owner",None).await.unwrap();
    let count = Arc::new(AtomicUsize::new(0));
    let calls = count.clone();
    let mut options = WorkbenchOptions::new(
        Arc::new(|_, _| panic!("explicit engine dispatch must be selected")),
        Arc::new(|_| Box::pin(async { Ok(json!([])) })),
    );
    options.engine_dispatch = Some(WorkbenchEngines {
        call: Arc::new(move |call, _abort| {
            assert_eq!(call.kind(), EngineKind::Http);
            assert_eq!(
                call.arguments(),
                &[json!("127.0.0.1"), json!(443), json!(false)]
            );
            assert_eq!(call.permit().operator(), "owner");
            let index = calls.fetch_add(1, Ordering::SeqCst);
            let mut out = output(index == 0);
            out["evidence"][0]["target"] = json!("127.0.0.1");
            Box::pin(async move { Ok(serde_json::from_value(out).unwrap()) })
        }),
        snapshot: Arc::new(|_, _| {
            Box::pin(async { Err(EngineError::Failed("unexpected snapshot".into())) })
        }),
        parse_telemetry: Arc::new(|_, _, _| Err(EngineError::Failed("unexpected parser".into()))),
    });
    let registry = WorkbenchRegistry::new(assessment, options);
    let db = rusqlite::Connection::open_in_memory().unwrap();
    jait_gateway::db::migrate_database(&db).unwrap();
    db.execute_batch("INSERT INTO users(id,username,password_hash,created_at,updated_at)VALUES('owner','alice','fixture','old','old'),('other','bob','fixture','old','old')").unwrap();
    let auth = AuthState::new(db, "integrated-workbench".into()).unwrap();
    let token = http_auth::sign_auth_token(
        &AuthUser {
            id: "owner".into(),
            username: "alice".into(),
        },
        "integrated-workbench",
    )
    .unwrap();
    let foreign = http_auth::sign_auth_token(
        &AuthUser {
            id: "other".into(),
            username: "bob".into(),
        },
        "integrated-workbench",
    )
    .unwrap();
    let router = SecurityWorkbenchRoutes {
        auth: auth.clone(),
        service: registry_port(registry.clone()),
        monitor: None,
        project_root: root().to_string_lossy().into_owned(),
        request_id: Arc::new(|| uuid::Uuid::new_v4().to_string()),
    }
    .router();
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    let (send, receive) = tokio::sync::oneshot::channel();
    let server = tokio::spawn(async move {
        axum::serve(listener, router)
            .with_graceful_shutdown(async {
                let _ = receive.await;
            })
            .await
            .unwrap()
    });
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(8))
        .build()
        .unwrap();
    let response = client
        .post(format!("{base}/api/security/checks"))
        .bearer_auth(&token)
        .json(&json!({"scopeId":scope["id"],"profile":"http","target":"127.0.0.1","port":443}))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 202);
    let started: Value = response.json().await.unwrap();
    let id = started["id"].as_str().unwrap();
    let run = registry.get().await.wait(id, "owner").await.unwrap();
    assert_eq!(run["status"], "completed");
    let finding = run["findingIds"][0].as_str().unwrap();
    let response = client
        .get(format!("{base}/api/security/checks/{id}/report"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    let report: Value = response.json().await.unwrap();
    assert_eq!(report["run"]["evidence"][0]["target"], "asset-1");
    let response = client
        .get(format!("{base}/api/security/findings/{finding}/plan"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    let plan: Value = response.json().await.unwrap();
    assert_eq!(plan["requiresApproval"], true);
    assert!(!plan["rollback"].as_array().unwrap().is_empty());
    let response = client
        .post(format!("{base}/api/security/findings/{finding}/verify"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    let verified: Value = response.json().await.unwrap();
    assert_eq!(verified["status"], "verified-absent");
    assert_eq!(
        registry
            .get()
            .await
            .finding(finding, "owner")
            .await
            .unwrap()["disposition"],
        "verified-absent"
    );
    let response = client
        .get(format!("{base}/api/security/checks/{id}"))
        .bearer_auth(&foreign)
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 404);
    let response = client
        .post(format!("{base}/api/security/findings/{finding}/verify"))
        .bearer_auth(&foreign)
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 400);
    assert_eq!(count.load(Ordering::SeqCst), 2);
    let response = client
        .delete(format!("{base}/api/security/checks/{id}"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    assert!(registry.get().await.finding(finding, "owner").await.is_ok());
    let _ = send.send(());
    server.await.unwrap();
    auth.shutdown().await.unwrap();
}
