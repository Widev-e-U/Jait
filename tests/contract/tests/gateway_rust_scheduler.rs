#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::{
    db::{self, worker::DatabaseWorker},
    scheduler::{
        minute::matches_cron_minute,
        service::{ONE_SHOT_RETENTION_MS, SchedulerOptions, SchedulerService},
    },
};
use serde_json::{Value, json};
use std::{
    collections::{BTreeMap, BTreeSet},
    num::NonZeroU16,
    path::PathBuf,
    sync::{
        Arc, Mutex,
        atomic::{AtomicI64, AtomicUsize, Ordering},
    },
};
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}
fn reference(call: Value) -> Value {
    let root = root();
    internal_driver::call(
        &root,
        &root
            .join(".jait/artifacts/gateway-rust/scheduler/contracts")
            .join(uuid::Uuid::new_v4().to_string()),
        json!({"version":1,"calls":[call]}),
        &|| false,
    )
    .unwrap()[0]
        .clone()
}
fn date(value: &Value) -> Option<i64> {
    match value {
        Value::Null => Some(0),
        Value::Bool(v) => Some(i64::from(*v)),
        Value::Number(n) => n.as_i64(),
        Value::String(s) => chrono::DateTime::parse_from_rfc3339(s)
            .ok()
            .map(|d| d.timestamp_millis())
            .or_else(|| {
                chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d")
                    .ok()
                    .and_then(|d| d.and_hms_opt(0, 0, 0))
                    .map(|d| d.and_utc().timestamp_millis())
            }),
        _ => None,
    }
}
fn normalize(output: Value, known: &BTreeMap<String, String>) -> Value {
    let mut aliases: BTreeMap<String, String> = known
        .iter()
        .map(|(label, id)| (id.clone(), format!("job:{label}")))
        .collect();
    fn collect(value: &Value, known: &BTreeMap<String, String>, ids: &mut Vec<String>) {
        match value {
            Value::Array(values) => {
                for value in values {
                    collect(value, known, ids)
                }
            }
            Value::Object(values) => {
                for (k, v) in values {
                    if matches!(k.as_str(), "id" | "actionId")
                        && let Some(s) = v
                            .as_str()
                            .filter(|s| uuid::Uuid::parse_str(s).is_ok() && !known.contains_key(*s))
                    {
                        assert_eq!(uuid::Uuid::parse_str(s).unwrap().get_version_num(), 7);
                        if !ids.iter().any(|id| id == s) {
                            ids.push(s.into());
                        }
                    }
                    collect(v, known, ids);
                }
            }
            _ => {}
        }
    }
    let mut ids = vec![];
    collect(&output, &aliases, &mut ids);
    for (i, id) in ids.into_iter().enumerate() {
        aliases.insert(id, format!("run:{i}"));
    }
    fn apply(v: Value, aliases: &BTreeMap<String, String>) -> Value {
        match v {
            Value::String(s) => json!(
                aliases
                    .get(&s)
                    .cloned()
                    .or_else(|| s
                        .strip_prefix("Job not found: ")
                        .and_then(|id| aliases.get(id))
                        .map(|id| format!("Job not found: {id}")))
                    .unwrap_or(s)
            ),
            Value::Array(values) => {
                Value::Array(values.into_iter().map(|v| apply(v, aliases)).collect())
            }
            Value::Object(values) => Value::Object(
                values
                    .into_iter()
                    .map(|(k, v)| (k, apply(v, aliases)))
                    .collect(),
            ),
            other => other,
        }
    }
    apply(output, &aliases)
}
struct State {
    step: Mutex<Value>,
    calls: Mutex<Vec<Value>>,
    events: Mutex<Vec<Value>>,
    preflights: AtomicUsize,
}
async fn native(steps: &[Value]) -> Value {
    let db = db::open_database(std::path::Path::new(":memory:")).unwrap();
    db::migrate_database(&db).unwrap();
    let worker = DatabaseWorker::new(db, NonZeroU16::new(128).unwrap()).unwrap();
    let clock = Arc::new(AtomicI64::new(1_790_812_800_000));
    let state = Arc::new(State {
        step: Mutex::new(json!({})),
        calls: Mutex::new(vec![]),
        events: Mutex::new(vec![]),
        preflights: AtomicUsize::new(0),
    });
    let captured = state.clone();
    let mut options = SchedulerOptions::new(
        worker.clone(),
        root().to_string_lossy().into_owned(),
        Arc::new(move |execution| {
            captured.calls.lock().unwrap().push(execution.clone());
            let step = captured.step.lock().unwrap().clone();
            let outcome = step["outcomes"]
                .get(execution["toolName"].as_str().unwrap())
                .unwrap_or(&step)
                .clone();
            Box::pin(async move {
                if let Some(error) = outcome["thrown"].as_str() {
                    Err(error.into())
                } else {
                    Ok(outcome
                        .get("result")
                        .cloned()
                        .unwrap_or_else(|| json!({"ok":true,"message":"done"})))
                }
            })
        }),
    );
    let captured = clock.clone();
    options.clock = Arc::new(move || captured.load(Ordering::SeqCst));
    let captured = state.clone();
    options.before_tick = Some(Arc::new(move || {
        captured.preflights.fetch_add(1, Ordering::SeqCst);
        let error = captured.step.lock().unwrap()["preflightError"]
            .as_str()
            .map(str::to_string);
        Box::pin(async move { error.map_or(Ok(()), Err) })
    }));
    let captured = state.clone();
    options.on_executed = Some(Arc::new(move |event| {
        captured.events.lock().unwrap().push(event.clone());
        captured.step.lock().unwrap()["callbackError"]
            .as_str()
            .map_or(Ok(()), |e| Err(e.into()))
    }));
    options.log = Arc::new(|_| {});
    let service = SchedulerService::new(options);
    let mut known = BTreeMap::<String, String>::new();
    let mut answers = vec![];
    for step in steps {
        *state.step.lock().unwrap() = step.clone();
        if let Some(now) = step.get("now") {
            clock.store(date(now).unwrap(), Ordering::SeqCst);
        }
        let id = step["id"]
            .as_str()
            .map(|s| known.get(s).map(String::as_str).unwrap_or(s))
            .unwrap_or("")
            .to_owned();
        let user = step["user"].as_str().map(str::to_owned);
        let now = step
            .get("runAt")
            .and_then(date)
            .unwrap_or_else(|| clock.load(Ordering::SeqCst));
        let result: Result<Value, String> = match step["op"].as_str().unwrap() {
            "create" => match serde_json::from_value(step["params"].clone()) {
                Ok(params) => service.create(params).await.map(|job| {
                    assert_eq!(uuid::Uuid::parse_str(&job.id).unwrap().get_version_num(), 7);
                    known.insert(step["label"].as_str().unwrap().into(), job.id.clone());
                    json!(job)
                }),
                Err(error) => Err(error.to_string()),
            },
            "list" => service.list(user).await.map(|jobs| json!(jobs)),
            "get" => service.get(id, user).await.map(|job| json!(job)),
            "update" => service
                .update(id, step["patch"].clone(), user)
                .await
                .map(|job| json!(job)),
            "remove" => service.remove(id, user).await.map(|v| json!(v)),
            "runs" => service.list_runs(id).await.map(|v| json!(v)),
            "trigger" => {
                service
                    .trigger(
                        id,
                        user,
                        now,
                        step["trigger"].as_str().unwrap_or("manual").into(),
                    )
                    .await
            }
            "tick" => service.tick(now).await.map(|()| Value::Null),
            "purge" => service
                .purge_spent_one_shots(
                    now,
                    step.get("retentionMs")
                        .map(|v| {
                            if v.is_null() {
                                0.0
                            } else {
                                v.as_f64().unwrap()
                            }
                        })
                        .unwrap_or(ONE_SHOT_RETENTION_MS as f64),
                )
                .await
                .map(|v| json!(v)),
            "once" => Ok(json!(jait_gateway::scheduler::service::is_one_shot_job(
                &step["input"]
            ))),
            "raw" => {
                let sql = step["sql"].as_str().unwrap().to_owned();
                let args: Vec<rusqlite::types::Value> = step["args"]
                    .as_array()
                    .into_iter()
                    .flatten()
                    .map(|v| match v {
                        Value::Null => rusqlite::types::Value::Null,
                        Value::String(s) => {
                            rusqlite::types::Value::Text(known.get(s).unwrap_or(s).clone())
                        }
                        Value::Number(n) => rusqlite::types::Value::Integer(n.as_i64().unwrap()),
                        Value::Bool(v) => rusqlite::types::Value::Integer(i64::from(*v)),
                        _ => panic!("unsupported fixture SQL value"),
                    })
                    .collect();
                service
                    .with_repository(move |r| {
                        r.db.execute(&sql, rusqlite::params_from_iter(args))?;
                        Ok(Value::Null)
                    })
                    .await
            }
            _ => panic!("unknown step {step}"),
        };
        answers.push(match result {
            Ok(value) => json!({"value":value}),
            Err(error) => json!({"error":error}),
        });
    }
    service.stop();
    worker.shutdown().await.unwrap();
    normalize(
        json!({"answers":answers,"calls":state.calls.lock().unwrap().clone(),"events":state.events.lock().unwrap().clone(),
        "preflights":state.preflights.load(Ordering::SeqCst)}),
        &known,
    )
}
async fn compare(steps: Vec<Value>) {
    let expected = reference(json!({"op":"nativescheduler.run","steps":steps}));
    let actual = native(&steps).await;
    if actual != expected {
        let output = root()
            .join(".jait/artifacts/gateway-rust/scheduler/failures")
            .join(uuid::Uuid::new_v4().to_string());
        std::fs::create_dir_all(&output).unwrap();
        std::fs::write(
            output.join("actual.json"),
            serde_json::to_string_pretty(&actual).unwrap(),
        )
        .unwrap();
        std::fs::write(
            output.join("expected.json"),
            serde_json::to_string_pretty(&expected).unwrap(),
        )
        .unwrap();
        panic!("scheduler comparison failed; inspect {}", output.display());
    }
}
fn create(label: &str, user: Option<&str>, input: Value) -> Value {
    let mut params =
        json!({"name":label,"cron":"* * * * *","toolName":"memory_search_more","input":input});
    if let Some(user) = user {
        params["userId"] = json!(user)
    }
    json!({"op":"create","label":label,"params":params,"now":"2026-10-01T00:00:00.000Z"})
}
#[tokio::test]
async fn persistent_crud_owner_filters_defaults_and_corrupt_input_match() {
    let mut steps = vec![
        create("owned", Some("alice"), json!({"x":[1,2]})),
        create("system", None, Value::Null),
        create("foreign", Some("bob"), json!(false)),
    ];
    for user in [Value::Null, json!("alice"), json!("bob"), json!("")] {
        steps.push(json!({"op":"list","user":user}));
        steps.push(json!({"op":"get","id":"owned","user":user}));
        steps.push(json!({"op":"update","id":"owned","user":user,"patch":{"enabled":false,"name":"patched","input":null}}));
    }
    steps.extend([
        json!({"op":"update","id":"owned","patch":{"toolName":" x.y_z ","enabled":true,"input":{"a":3},"cron":"*/5 * * * *"},"now":"2026-10-01T01:00:00Z"}),
        json!({"op":"update","id":"owned","patch":{"cron":"wrong cron"}}),
        json!({"op":"update","id":"missing","patch":{"cron":"wrong cron"}}),
        json!({"op":"raw","sql":"UPDATE scheduled_jobs SET input=?,session_id=NULL,project_root=NULL WHERE id=?","args":["{broken","owned"]}),
        json!({"op":"get","id":"owned"}),
        json!({"op":"remove","id":"owned","user":"bob"}),
        json!({"op":"remove","id":"owned","user":"alice"}),
        json!({"op":"get","id":"owned"}),json!({"op":"remove","id":"owned"}),
        json!({"op":"list","user":"alice"}),
    ]);
    compare(steps).await;
}
#[tokio::test]
async fn scheduled_and_manual_one_shots_preserve_failure_evidence_and_cleanup() {
    for trigger in ["manual", "schedule"] {
        for outcome in [
            json!({"ok":true,"message":"done","data":{"count":2}}),
            json!({"ok":false,"message":"rejected"}),
            json!({"thrown":"execution failed"}),
        ] {
            let once = json!({"__jaitJobMeta":{"once":true,"jobType":"channel_reminder"}});
            let mut run = json!({"op":"trigger","id":"one","trigger":trigger,"runAt":"2026-09-29T00:00:00Z","now":"2026-10-01T00:00:00Z"});
            if outcome.get("thrown").is_some() {
                run["thrown"] = outcome["thrown"].clone()
            } else {
                run["result"] = outcome
            }
            compare(vec![
                create("one", Some("alice"), once),
                run,
                json!({"op":"get","id":"one"}),
                json!({"op":"runs","id":"one"}),
                json!({"op":"purge","runAt":"2026-09-29T01:00:00Z"}),
                json!({"op":"purge","runAt":"2026-10-01T00:00:00Z"}),
                json!({"op":"get","id":"one"}),
                json!({"op":"runs","id":"one"}),
            ])
            .await;
        }
    }
}
#[tokio::test]
async fn scheduled_agent_tasks_rewrite_delivery_context_and_strip_title() {
    for tool in [
        "agent_spawn",
        "thread_control",
        "custom_tool",
        "already.dotted_unchanged",
    ] {
        for job_type in ["agent_task", "agent_thread_job", "other"] {
            let input = json!({"title":"remove this","prompt":"fixture prompt","workingDirectory":"","extra":[1],
                "__jaitJobMeta":{"jobType":job_type,"provider":"provider-fixture","model":"model-fixture"}});
            let mut job = create("agent", Some("owner"), input);
            job["params"]["toolName"] = json!(tool);
            compare(vec![job,json!({"op":"trigger","id":"agent","result":{"ok":true,"message":"done","data":false}}),json!({"op":"runs","id":"agent"})]).await;
        }
    }
}
#[tokio::test]
async fn ticks_deduplicate_minutes_preflight_denials_and_purge_failed_one_shots() {
    compare(vec![
        create("one",Some("alice"),json!({"__jaitJobMeta":{"once":true}})),
        create("recurring",None,json!({})),
        json!({"op":"tick","runAt":"2026-10-01T00:00:00Z","preflightError":"storage unavailable"}),
        json!({"op":"runs","id":"one"}),
        json!({"op":"tick","runAt":"2026-10-01T00:00:00Z","result":{"ok":false,"message":"denied"}}),
        json!({"op":"tick","runAt":"2026-10-01T00:00:30Z"}),
        json!({"op":"runs","id":"one"}),json!({"op":"runs","id":"recurring"}),
        json!({"op":"tick","runAt":"2026-10-01T00:01:00Z"}),
        json!({"op":"tick","runAt":"2026-10-02T01:00:00Z"}),
        json!({"op":"list"}),json!({"op":"runs","id":"one"}),json!({"op":"runs","id":"recurring"}),
    ]).await;
}
#[test]
fn utc_timezone_dst_field_conjunction_and_invalid_dates_match_source() {
    let mut cases = vec![];
    for date in [
        "2026-03-29T00:59:00Z",
        "2026-03-29T01:00:00Z",
        "2026-10-25T00:30:00Z",
        "2026-10-25T01:30:00Z",
        "2026-10-01T00:00:00Z",
        "1969-12-31T23:59:00Z",
        "not-a-date",
    ] {
        for zone in [
            None,
            Some(""),
            Some("UTC"),
            Some("Europe/Vienna"),
            Some("America/New_York"),
            Some("Asia/Kathmandu"),
            Some("Pacific/Apia"),
            Some("europe/vienna"),
            Some("invalid/zone"),
            Some("+05:30"),
        ] {
            for cron in [
                "* * * * *",
                "*/5 * * * *",
                "30 2 * * *",
                "0,30 0-5 1-31 * 0-6",
                "0 0 1 10 4",
                "*/9007199254740991 * * * *",
                "bad cron",
            ] {
                let mut case = json!({"cron":cron,"date":date});
                if let Some(zone) = zone {
                    case["zone"] = json!(zone)
                }
                cases.push(case);
            }
        }
    }
    for stamp in [
        8_640_000_000_000_000i64,
        -8_640_000_000_000_000,
        253_402_300_800_000,
        -62_167_219_200_000,
        -1,
    ] {
        for zone in [
            None,
            Some("UTC"),
            Some("Europe/Vienna"),
            Some("America/New_York"),
            Some("Asia/Kathmandu"),
        ] {
            for cron in ["* * * * *", "0 0 * * *", "0-59 0-23 1-31 1-12 0-6"] {
                let mut case = json!({"cron":cron,"date":stamp});
                if let Some(zone) = zone {
                    case["zone"] = json!(zone)
                }
                cases.push(case);
            }
        }
    }
    for zone in [
        "+😀",
        "-😀",
        "+24:00",
        "+01:00",
        "-0230",
        "Z",
        "  UTC  ",
        "+０1:30",
        "Factory",
        "Etc/Unknown",
        "Asia/Calcutta",
        "Europe/Kyiv",
    ] {
        cases.push(json!({"cron":"* * * * *","date":0,"zone":zone}));
    }
    for batch in cases.chunks(100) {
        let expected = reference(json!({"op":"nativescheduler.minute","cases":batch}));
        let actual: Vec<bool> = batch
            .iter()
            .map(|c| {
                matches_cron_minute(
                    c["cron"].as_str().unwrap(),
                    date(&c["date"]),
                    c["zone"].as_str(),
                )
            })
            .collect();
        for (i, (actual, expected)) in actual.iter().zip(expected.as_array().unwrap()).enumerate() {
            assert_eq!(json!(actual), *expected, "case {}", batch[i]);
        }
    }
}

#[tokio::test]
async fn rejected_owners_callback_errors_flags_and_fractional_retention_match() {
    let mut steps = vec![
        create("owned", Some("alice"), json!({})),
        json!({"op":"trigger","id":"owned","user":"bob"}),
        json!({"op":"runs","id":"owned"}),
        json!({"op":"update","id":"owned","patch":{"enabled":false}}),
        json!({"op":"trigger","id":"owned","user":"alice","callbackError":"callback failed"}),
        json!({"op":"get","id":"owned"}),
        json!({"op":"runs","id":"owned"}),
    ];
    for flag in [
        json!(true),
        json!(false),
        json!(null),
        json!(1),
        json!("true"),
        json!({}),
        json!([]),
    ] {
        steps.push(json!({"op":"once","input":{"__jaitJobMeta":{"once":flag}}}));
    }
    steps.extend([create("spent",None,json!({"__jaitJobMeta":{"once":true}})),
        json!({"op":"trigger","id":"spent","trigger":"schedule","runAt":"2026-10-01T00:00:00.000Z","result":{"ok":false,"message":"failed"}}),
        json!({"op":"purge","runAt":"2026-10-01T00:00:00.001Z","retentionMs":1.5}),json!({"op":"get","id":"spent"}),
        json!({"op":"purge","runAt":"2026-10-01T00:00:00.001Z","retentionMs":1}),json!({"op":"get","id":"spent"}),
        json!({"op":"runs","id":"spent"})]);
    compare(steps).await;
}

#[test]
fn bundled_named_zones_match_icu_validity_and_representative_wall_times() {
    // The native gateway must preserve the reference's accepted names and
    // rejection behavior. A newer IANA database is additional test input,
    // never authority to silently broaden the accepted scheduling contract.
    let reference_zones: BTreeSet<String> = reference(json!({"op":"nativescheduler.zones"}))
        .as_array()
        .unwrap()
        .iter()
        .map(|zone| zone.as_str().unwrap().to_owned())
        .collect();
    let bundled_zones: BTreeSet<String> = jiff::tz::db()
        .available()
        .map(|zone| zone.to_string())
        .collect();
    let zones: BTreeSet<String> = reference_zones.union(&bundled_zones).cloned().collect();
    let mut cases = vec![];
    for zone in &zones {
        for date in [0i64, 1_767_225_600_000, 1_782_864_000_000] {
            for cron in [
                "* * * * *",
                "0 * * * *",
                "* 0 * * *",
                "* * 1 * *",
                "* * * 1 *",
                "* * * * 0",
            ] {
                cases.push(json!({"cron":cron,"date":date,"zone":zone.to_string()}));
            }
        }
    }
    assert!(
        reference_zones.len() > 400,
        "reference zone corpus unexpectedly small: {}",
        reference_zones.len()
    );
    assert_eq!(
        cases.len(),
        zones.len() * 3 * 6,
        "corpus must probe every reference and bundled zone across every date and cron"
    );
    for batch in cases.chunks(100) {
        let expected = reference(json!({"op":"nativescheduler.minute","cases":batch}));
        for (case, expected) in batch.iter().zip(expected.as_array().unwrap()) {
            assert_eq!(
                json!(matches_cron_minute(
                    case["cron"].as_str().unwrap(),
                    date(&case["date"]),
                    case["zone"].as_str()
                )),
                *expected,
                "case {case}"
            );
        }
    }
}

fn worker_at(path: &std::path::Path) -> DatabaseWorker {
    let connection = db::open_database(path).unwrap();
    db::migrate_database(&connection).unwrap();
    DatabaseWorker::new(connection, NonZeroU16::new(128).unwrap()).unwrap()
}
fn request(name: &str, cron: &str, tool: &str) -> jait_gateway::scheduler::service::CreateJob {
    serde_json::from_value(json!({"name":name,"cron":cron,"toolName":tool,"userId":"alice","projectRoot":"/owned/fixture"})).unwrap()
}
#[tokio::test]
async fn simultaneous_jobs_and_later_ticks_progress_while_same_job_is_guarded() {
    use std::time::Duration;
    let worker = worker_at(std::path::Path::new(":memory:"));
    let calls = Arc::new(Mutex::new(Vec::<String>::new()));
    let entered = Arc::new(tokio::sync::Semaphore::new(0));
    let release = Arc::new(tokio::sync::Semaphore::new(0));
    let captured = calls.clone();
    let notify = entered.clone();
    let gate = release.clone();
    let mut options = SchedulerOptions::new(
        worker.clone(),
        "/fixture".into(),
        Arc::new(move |execution| {
            let tool = execution["toolName"].as_str().unwrap().to_owned();
            captured.lock().unwrap().push(tool.clone());
            notify.add_permits(1);
            let gate = gate.clone();
            Box::pin(async move {
                if tool == "slow.tool" {
                    let permit = gate.acquire().await.unwrap();
                    permit.forget();
                }
                Ok(json!({"ok":true,"message":"done"}))
            })
        }),
    );
    options.log = Arc::new(|_| {});
    let service = SchedulerService::new(options);
    service
        .create(request("slow", "* * * * *", "slow.tool"))
        .await
        .unwrap();
    service
        .create(request("fast", "* * * * *", "fast.tool"))
        .await
        .unwrap();
    service
        .create(request("later", "1 * * * *", "later.tool"))
        .await
        .unwrap();
    let active = service.clone();
    let first_ms = date(&json!("2026-10-01T00:00:00Z")).unwrap();
    let first = tokio::spawn(async move { active.tick(first_ms).await.unwrap() });
    tokio::time::timeout(Duration::from_secs(5), entered.acquire_many(2))
        .await
        .unwrap()
        .unwrap()
        .forget();
    // The first tick keeps `fast` guarded until its own run record settles, so a later tick
    // may legitimately skip it. Retry across successive minutes: `slow` stays guarded for the
    // whole window, and some later tick must still make progress on the unguarded jobs.
    for minute in 1..=5i64 {
        tokio::time::timeout(
            Duration::from_secs(5),
            service.tick(first_ms + minute * 60_000),
        )
        .await
        .unwrap()
        .unwrap();
        let progressed = calls
            .lock()
            .unwrap()
            .iter()
            .filter(|tool| tool.as_str() == "fast.tool")
            .count()
            >= 2;
        if progressed {
            break;
        }
    }
    {
        let calls = calls.lock().unwrap();
        assert_eq!(
            calls.iter().filter(|s| s.as_str() == "slow.tool").count(),
            1
        );
        assert_eq!(
            calls.iter().filter(|s| s.as_str() == "fast.tool").count(),
            2
        );
        assert_eq!(
            calls.iter().filter(|s| s.as_str() == "later.tool").count(),
            1
        );
    }
    release.add_permits(1);
    tokio::time::timeout(Duration::from_secs(5), first)
        .await
        .unwrap()
        .unwrap();
    service.stop();
    worker.shutdown().await.unwrap();
}
#[tokio::test]
async fn real_database_restart_preserves_runs_and_minute_deduplication_through_cron_adapter() {
    use jait_gateway::tools::cron::{self, CronContext};
    let directory = root()
        .join(".jait/artifacts/gateway-rust/scheduler/restart")
        .join(uuid::Uuid::new_v4().to_string());
    std::fs::create_dir_all(&directory).unwrap();
    let path = directory.join("scheduler.db");
    let worker = worker_at(&path);
    let calls = Arc::new(AtomicUsize::new(0));
    let captured = calls.clone();
    let at = date(&json!("2026-10-01T00:00:00Z")).unwrap();
    let mut options = SchedulerOptions::new(
        worker.clone(),
        "/owned/fixture".into(),
        Arc::new(move |_| {
            captured.fetch_add(1, Ordering::SeqCst);
            Box::pin(async { Ok(json!({"ok":true,"message":"done","data":{"fixture":[1,2]}})) })
        }),
    );
    options.clock = Arc::new(move || at);
    options.log = Arc::new(|_| {});
    let service = SchedulerService::new(options);
    let created=service.with_repository(|repository|{
        Ok(cron::execute(repository,"add",&json!({"name":"restart","cron":"* * * * *","toolName":"fixture_execute","input":{"version":1}}),
            CronContext{user_id:Some("alice"),project_root:repository.project_root})?)
    }).await.unwrap();
    let id = created["data"]["id"].as_str().unwrap().to_owned();
    service
        .trigger(id.clone(), Some("alice".into()), at, "schedule".into())
        .await
        .unwrap();
    assert_eq!(calls.load(Ordering::SeqCst), 1);
    service.stop();
    worker.shutdown().await.unwrap();

    let worker = worker_at(&path);
    let captured = calls.clone();
    let mut options = SchedulerOptions::new(
        worker.clone(),
        "/owned/fixture".into(),
        Arc::new(move |_| {
            captured.fetch_add(1, Ordering::SeqCst);
            Box::pin(async { Ok(json!({"ok":true,"message":"restarted"})) })
        }),
    );
    options.clock = Arc::new(move || at + 60_000);
    options.log = Arc::new(|_| {});
    let service = SchedulerService::new(options);
    let job = service
        .get(id.clone(), Some("alice".into()))
        .await
        .unwrap()
        .unwrap();
    assert_eq!(job.input, json!({"version":1}));
    assert_eq!(job.tool_name, "fixture.execute");
    assert!(
        service
            .get(id.clone(), Some("bob".into()))
            .await
            .unwrap()
            .is_none()
    );
    let runs = service.list_runs(id.clone()).await.unwrap();
    assert_eq!(runs.len(), 1);
    assert_eq!(runs[0]["status"], "completed");
    assert_eq!(runs[0]["output"], "{\"fixture\":[1,2]}");
    service.tick(at + 30_000).await.unwrap();
    assert_eq!(calls.load(Ordering::SeqCst), 1);
    service.tick(at + 60_000).await.unwrap();
    assert_eq!(calls.load(Ordering::SeqCst), 2);
    assert_eq!(service.list_runs(id).await.unwrap().len(), 2);
    service.stop();
    worker.shutdown().await.unwrap();
}

#[tokio::test]
async fn failed_disarm_write_preserves_the_reference_single_statement_boundary() {
    compare(vec![
        create("once", Some("alice"), json!({"__jaitJobMeta":{"once":true}})),
        json!({"op":"raw","sql":"CREATE TRIGGER reject_disarm BEFORE UPDATE OF enabled ON scheduled_jobs BEGIN SELECT RAISE(FAIL, 'disarm refused'); END"}),
        json!({"op":"trigger","id":"once","trigger":"schedule","runAt":"2026-10-01T00:00:00.000Z","result":{"ok":false,"message":"delivery failed"}}),
        json!({"op":"get","id":"once"}),
        json!({"op":"runs","id":"once"}),
    ]).await;
}
