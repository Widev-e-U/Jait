#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::services::disk_space_watchdog::*;
use serde_json::{Value, json};
use std::{
    fs,
    path::PathBuf,
    sync::{Arc, Mutex},
};
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}
fn reference(call: Value) -> Value {
    let dir = root()
        .join(".jait/artifacts/gateway-rust/watchdog")
        .join(uuid::Uuid::new_v4().to_string());
    fs::create_dir_all(&dir).unwrap();
    internal_driver::call(&root(), &dir, json!({"version":1,"calls":[call]}), &|| {
        false
    })
    .unwrap()[0]
        .clone()
}
struct State {
    jobs: Vec<Value>,
    active: Value,
    calls: Vec<Value>,
}
struct Adapter(Arc<Mutex<State>>);
impl Backend for Adapter {
    fn list(&mut self) -> Result<Vec<Value>, String> {
        let mut s = self.0.lock().unwrap();
        s.calls.push(json!({"op":"list"}));
        if let Some(e) = s.active["listError"].as_str() {
            Err(e.into())
        } else {
            Ok(s.jobs.clone())
        }
    }
    fn update(&mut self, id: &Value, patch: Value) -> Result<(), String> {
        let mut s = self.0.lock().unwrap();
        s.calls.push(json!({"op":"update","id":id,"patch":patch}));
        if let Some(e) = s.active["updateError"].as_str() {
            return Err(e.into());
        }
        if let Some(j) = s.jobs.iter_mut().find(|j| j["id"] == *id) {
            for (k, v) in patch.as_object().unwrap() {
                j[k] = v.clone();
            }
        }
        Ok(())
    }
    fn notify(&mut self, level: &str, title: &str, message: &str) -> Result<(), String> {
        let mut s = self.0.lock().unwrap();
        s.calls
            .push(json!({"op":"notify","level":level,"title":title,"message":message}));
        if s.active["notifyError"]["title"] == title {
            Err(s.active["notifyError"]["message"].as_str().unwrap().into())
        } else {
            Ok(())
        }
    }
}
fn number(v: &Value) -> f64 {
    v.as_f64()
        .or_else(|| v.as_str().and_then(|s| s.parse().ok()))
        .unwrap_or(f64::NAN)
}
async fn compare(mut call: Value) {
    call["op"] = json!("nativewatchdog.check");
    call["now"] = json!(1700000000000i64);
    let expected = reference(call.clone());
    let state = Arc::new(Mutex::new(State {
        jobs: call["jobs"].as_array().unwrap().clone(),
        active: Value::Null,
        calls: vec![],
    }));
    let probe: DiskProbe = {
        let state = state.clone();
        Box::new(move |path| {
            let mut s = state.lock().unwrap();
            s.calls.push(json!({"op":"probe","path":path}));
            let d = s.active["disks"][&path].clone();
            Box::pin(async move {
                if let Some(error) = d["error"].as_str() {
                    return Err(ProbeError {
                        display: format!("Error: {error}"),
                        code: d["code"].as_str().map(String::from),
                    });
                }
                if d.is_null() {
                    return Err(ProbeError {
                        display: "Error: missing fixture sample".into(),
                        code: None,
                    });
                }
                Ok(DiskSample {
                    blocks: number(&d["blocks"]),
                    bavail: number(&d["bavail"]),
                    files: number(&d["files"]),
                    ffree: number(&d["ffree"]),
                })
            })
        })
    };
    let now = call["now"].as_i64().unwrap_or(1700000000000);
    let mut watchdog = DiskSpaceWatchdog::with_clock(
        Box::new(Adapter(state.clone())),
        probe,
        serde_json::from_value(call["paths"].clone()).unwrap(),
        Arc::new(move || now),
    );
    let mut results = vec![];
    for step in call["checks"].as_array().unwrap() {
        {
            let mut state = state.lock().unwrap();
            state.active = step.clone();
            if let Some(j) = step["replaceJobs"].as_array() {
                state.jobs = j.clone();
            }
        }
        results.push(match watchdog.check().await {
            Ok(()) => Value::Null,
            Err(e) => json!({"error":e}),
        });
    }
    let s = state.lock().unwrap();
    assert_eq!(
        json!({"results":results,"calls":s.calls,"jobs":s.jobs}),
        expected
    );
}
fn sample(used: f64, inodes: f64) -> Value {
    json!({"blocks":10000,"bavail":10000.0-used*100.0,"files":10000,"ffree":10000.0-inodes*100.0})
}
fn job(id: &str, path: &str, input: Value, tool: &str, enabled: bool) -> Value {
    json!({"id":id,"name":format!("Job {id}"),"projectRoot":path,"input":input,"toolName":tool,"enabled":enabled})
}
fn jobs() -> Value {
    json!([
        job(
            "a",
            "/a",
            json!({"__jaitJobMeta":{"jobType":"agent_task","keep":true},"payload":"keep"}),
            "tool",
            true
        ),
        job(
            "b",
            "/b",
            json!({"action":"create"}),
            "thread.control",
            true
        ),
        job("c", "/a", Value::Null, "agent.spawn", true),
        job("disabled", "/c", Value::Null, "agent.spawn", false),
        job("normal", "/c", Value::Null, "other", true)
    ])
}
#[test]
fn agent_job_classification_matches_all_trigger_shapes() {
    let mut jobs = vec![];
    for input in [
        Value::Null,
        json!({}),
        json!({"action":"create"}),
        json!({"action":"CREATE"}),
        json!({"__jaitJobMeta":{"jobType":"agent_task"}}),
        json!({"__jaitJobMeta":{"jobType":"agent_thread_job"}}),
        json!({"__jaitJobMeta":{"jobType":"other"}}),
    ] {
        for tool in ["agent.spawn", "thread.control", "other"] {
            jobs.push(json!({"input":input,"toolName":tool}));
        }
    }
    let actual: Vec<_> = jobs.iter().map(is_agent_job).collect();
    assert_eq!(
        json!(actual),
        reference(json!({"op":"nativewatchdog.jobs","jobs":jobs}))
    );
}
#[tokio::test]
async fn alert_thresholds_dedup_recovery_and_manual_disable_are_preserved() {
    compare(json!({"jobs":jobs(),"paths":["/state","/tmp","/state"],"checks":[
 {"disks":{"/state":sample(80.25,0.0),"/tmp":sample(0.0,0.0),"/a":sample(0.0,0.0),"/b":sample(0.0,0.0)}},
 {"disks":{"/state":sample(89.0,0.0),"/tmp":sample(0.0,0.0),"/a":sample(0.0,0.0),"/b":sample(0.0,0.0)}},
 {"disks":{"/state":sample(90.0,0.0),"/tmp":sample(0.0,0.0),"/a":sample(0.0,0.0),"/b":sample(0.0,0.0)}},
 {"disks":{"/state":sample(90.0,0.0),"/tmp":sample(0.0,0.0)}},
 {"disks":{"/state":sample(0.0,0.0),"/tmp":sample(0.0,0.0)}},
 {"disks":{"/state":sample(81.0,0.0),"/tmp":sample(0.0,0.0)}}
 ]})).await;
}
#[tokio::test]
async fn project_pressure_only_pauses_matching_agents_and_local_storage_is_global() {
    compare(json!({"jobs":jobs(),"paths":["/state"],"checks":[
    {"disks":{"/state":sample(0.0,0.0),"/a":sample(0.0,95.0),"/b":sample(0.0,0.0)}},
    {"disks":{"/state":sample(0.0,95.0),"/b":sample(0.0,0.0)}}
    ]}))
    .await;
}
#[tokio::test]
async fn unavailable_capacity_missing_remote_paths_and_notification_update_errors() {
    let checks = json!([
    {"disks":{"/state":{"blocks":0},"/a":{"error":"missing remote","code":"ENOENT"},"/b":{"error":"denied","code":"EACCES"}}},
    {"disks":{"/state":{"blocks":-1},"/a":{"error":"missing remote","code":"ENOENT"},"/b":{"error":"denied","code":"EACCES"}}},
    {"disks":{"/state":{"blocks":"NaN"},"/a":sample(0.0,0.0),"/b":sample(0.0,0.0)}},
    {"disks":{"/state":sample(0.0,0.0),"/a":sample(0.0,0.0),"/b":sample(0.0,0.0)}},
    {"disks":{"/state":{"error":"gone","code":"ENOENT"},"/a":sample(0.0,0.0),"/b":sample(0.0,0.0)}},
    {"disks":{"/state":sample(95.0,0.0),"/a":sample(0.0,0.0),"/b":sample(0.0,0.0)},"notifyError":{"title":"Disk space watchdog","message":"notify failed"},"updateError":"cannot update"},
    {"listError":"cannot list"}
    ]);
    compare(json!({"jobs":jobs(),"paths":["/state"],"checks":checks})).await;
}
#[tokio::test]
async fn inode_zero_nonfinite_free_counts_and_rounding_preserve_javascript_thresholds() {
    let jobs = json!([]);
    let mut checks = vec![];
    for sample in [
        sample(80.25, 81.25),
        sample(89.95, 0.0),
        sample(-0.25, 0.0),
        sample(1e22, 0.0),
        json!({"blocks":100,"bavail":"NaN","files":0,"ffree":0}),
        json!({"blocks":100,"bavail":0,"files":0,"ffree":0}),
        json!({"blocks":100,"bavail":"-Infinity","files":1,"ffree":1}),
    ] {
        checks.push(json!({"disks":{"/state":sample}}));
        checks.push(json!({"disks":{"/state":{"blocks":100,"bavail":100,"files":0,"ffree":0}}}));
    }
    compare(json!({"jobs":jobs,"paths":["/state"],"checks":checks})).await;
}
#[tokio::test]
async fn native_sampler_uses_real_filesystem_and_bounded_admission() {
    use jait_gateway::runtime::blocking::BlockingLane;
    use std::num::NonZeroU16;
    let path = root().join(".jait/artifacts/gateway-rust/watchdog");
    fs::create_dir_all(&path).unwrap();
    let sample = sample_native(path.to_str().unwrap()).unwrap();
    let reference = reference(json!({"op":"nativewatchdog.stat","path":path}));
    assert_eq!(sample.blocks, reference["blocks"].as_f64().unwrap());
    assert!(sample.bavail.is_finite());
    assert!(sample.files >= 0.0);
    assert!(sample.ffree >= 0.0);
    let lane = BlockingLane::new(NonZeroU16::new(1).unwrap());
    let probe = native_probe(lane.clone());
    assert!(probe(path.to_string_lossy().into_owned()).await.is_ok());
    lane.close();
    assert!(
        probe(path.to_string_lossy().into_owned())
            .await
            .unwrap_err()
            .display
            .contains("blocking lane is closed")
    );
}
