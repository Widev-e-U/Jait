#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::{
    db::{self, worker::DatabaseWorker},
    tools::{core_io::HostError, network_scan::*},
};
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    num::NonZeroU16,
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
    internal_driver::call(
        &root(),
        &root()
            .join(".jait/artifacts/gateway-rust/network-scan-tool")
            .join(uuid::Uuid::new_v4().to_string()),
        json!({"version":1,"calls":[call]}),
        &|| false,
    )
    .unwrap()[0]
        .clone()
}
fn host(n: usize) -> Value {
    json!({"ip":format!("192.0.2.{}",n+1),"mac":null,"hostname":if n.is_multiple_of(2){json!(format!("host-{n}"))}else{Value::Null},"alive":true,"openPorts":[22,443],"sshReachable":n.is_multiple_of(3),"agentStatus":if n.is_multiple_of(4){"running"}else{"not-installed"},"osVersion":null,"lastSeen":"2026-10-22T12:00:00.000Z"})
}
fn data(n: usize) -> Value {
    json!({"subnet":"192.0.2","hosts":(0..n).map(host).collect::<Vec<_>>(),"routerIp":null,"scannedAt":"2026-10-22T12:00:01.000Z","durationMs":42})
}
fn lookup(
    name: &str,
    cache: &NetworkScanCache,
    slots: &HashMap<String, ScanData>,
    held: &HashMap<String, ScanToolResult>,
) -> Option<ScanData> {
    if name == "cache" {
        cache.latest()
    } else {
        slots
            .get(name)
            .cloned()
            .or_else(|| held.get(name).and_then(|r| r.data.clone()))
    }
}
async fn compare(mut call: Value) {
    call["op"] = json!("nativenetworkscantool.sequence");
    if call.get("scans").is_none() {
        call["scans"] = json!([]);
    }
    if call.get("slots").is_none() {
        call["slots"] = json!({"a":data(1)});
    }
    let expected = reference(call.clone());
    let events = Arc::new(Mutex::new(vec![]));
    let cursor = Arc::new(Mutex::new(0usize));
    let slots = call["slots"]
        .as_object()
        .unwrap()
        .iter()
        .map(|(k, v)| (k.clone(), ScanData::new(v.clone())))
        .collect::<HashMap<_, _>>();
    let observed = events.clone();
    let cache = NetworkScanCache::new(Arc::new(move |_| {
        observed
            .lock()
            .unwrap()
            .push(json!({"op":"persistenceError"}))
    }));
    let db = rusqlite::Connection::open_in_memory().unwrap();
    db::migrate_database(&db).unwrap();
    let worker = DatabaseWorker::new(db, NonZeroU16::new(64).unwrap()).unwrap();
    if call["persistent"] == true {
        cache.set_store(Arc::new(SqliteScanStore::new(worker.clone())));
    }
    let token = Arc::new(());
    let port: Scanner<Arc<()>> = {
        let events = events.clone();
        let cursor = cursor.clone();
        let steps = call["scans"].as_array().unwrap().clone();
        let slots = slots.clone();
        let token = token.clone();
        Arc::new(move |options, c| {
            assert!(Arc::ptr_eq(c, &token));
            events
                .lock()
                .unwrap()
                .push(json!({"op":"scan","options":options}));
            let mut index = cursor.lock().unwrap();
            let step = steps.get(*index).unwrap().clone();
            *index += 1;
            let slots = slots.clone();
            Box::pin(async move {
                if let Some(error) = step["error"].as_str() {
                    return Err(HostError::Error(error.into()));
                }
                if let Some(value) = step.get("thrown") {
                    return Err(HostError::Thrown(value.clone()));
                }
                Ok(slots[step["slot"].as_str().unwrap()].clone())
            })
        })
    };
    let tool = NetworkScanTool {
        cache: cache.clone(),
        scanner: port,
    };
    let mut held = HashMap::new();
    let mut results = vec![];
    for step in call["steps"].as_array().unwrap() {
        let value=match step["op"].as_str().unwrap(){
  "get"=>cache.latest().map(|d|d.snapshot()).unwrap_or(Value::Null),
  "set"=>{cache.set_latest(slots[step["slot"].as_str().unwrap()].clone()).await;Value::Null},
  "scan"=>{let result=tool.execute(&step["input"],&token).await;let value=result.snapshot();if let Some(name)=step["hold"].as_str(){held.insert(name.into(),result);}value},
  "same"=>{let a=lookup(step["left"].as_str().unwrap(),&cache,&slots,&held);let b=lookup(step["right"].as_str().unwrap(),&cache,&slots,&held);json!(match(a,b){(Some(a),Some(b))=>a.same(&b),(None,None)=>true,_=>false})},
  "mutate"=>{let data=lookup(step["ref"].as_str().unwrap(),&cache,&slots,&held).unwrap();data.update(|value|{for(k,v)in step["patch"].as_object().unwrap(){value[k]=v.clone();}});Value::Null},
  "sql"=>{let sql=step["sql"].as_str().unwrap().to_string();worker.run(move|db|{db.execute_batch(&sql)?;Ok(())}).await.unwrap();Value::Null},
  "db"=>worker.run(|db|{let mut statement=db.prepare("SELECT ip,mac,hostname,os_version,open_ports,ssh_reachable,agent_status,providers,first_seen_at,last_seen_at,scanned_at FROM network_hosts ORDER BY ip")?;let names=statement.column_names().into_iter().map(str::to_string).collect::<Vec<_>>();let mut rows=statement.query([])?;let mut result=vec![];while let Some(row)=rows.next()?{let mut value=json!({});for(i,name)in names.iter().enumerate(){value[name]=match row.get_ref(i)?{rusqlite::types::ValueRef::Null=>Value::Null,rusqlite::types::ValueRef::Integer(n)=>json!(n),rusqlite::types::ValueRef::Real(n)=>json!(n),rusqlite::types::ValueRef::Text(v)=>json!(std::str::from_utf8(v).unwrap()),_=>panic!("unexpected scan column")};}result.push(value);}Ok(json!(result))}).await.unwrap(),
  _=>panic!("unknown network fixture step")
 };
        results.push(value);
    }
    let actual = json!({"results":results,"events":*events.lock().unwrap(),"cache":cache.latest().map(|d|d.snapshot()),"held":held.iter().map(|(k,v)|(k.clone(),v.snapshot())).collect::<serde_json::Map<String,Value>>(),"consumed":*cursor.lock().unwrap()});
    worker.shutdown().await.unwrap();
    assert_eq!(actual, expected, "scenario {call}");
}
#[test]
fn complete_factory_metadata_matches() {
    assert_eq!(
        metadata(),
        &reference(json!({"op":"nativenetworkscantool.metadata"}))
    );
}
#[tokio::test]
async fn scanner_options_preview_bounds_tags_and_original_capability_match() {
    for n in [0, 1, 8, 9, 10, 11, 20] {
        for input in [
            Value::Null,
            json!({}),
            json!({"deep":false,"includeIps":["192.0.2.1"],"subnet":"192.0.2"}),
            json!({"deep":null,"includeIps":null,"subnet":null}),
        ] {
            compare(json!({"slots":{"a":data(n)},"scans":[{"slot":"a"}],"steps":[{"op":"get"},{"op":"scan","input":input,"hold":"result"},{"op":"get"},{"op":"same","left":"cache","right":"result"}]})).await;
        }
    }
}
#[tokio::test]
async fn result_and_public_cache_keep_identity_and_factory_does_not_persist() {
    compare(json!({"persistent":true,"slots":{"a":data(1),"b":data(1)},"scans":[{"slot":"a"},{"slot":"b"}],"steps":[{"op":"scan","input":{},"hold":"first"},{"op":"db"},{"op":"same","left":"first","right":"cache"},{"op":"mutate","ref":"cache","patch":{"subnet":"changed in place"}},{"op":"get"},{"op":"scan","input":{},"hold":"second"},{"op":"same","left":"cache","right":"first"},{"op":"same","left":"cache","right":"second"},{"op":"set","slot":"a"},{"op":"same","left":"cache","right":"first"},{"op":"db"}]})).await;
}
#[tokio::test]
async fn public_setter_upserts_partial_rows_retains_os_first_seen_and_skips_empty_sets() {
    let mut a = data(1);
    a["hosts"][0]["mac"] = json!("00:00:5e:00:53:01");
    a["hosts"][0]["osVersion"] = json!("fixture-os");
    a["hosts"][0]["providers"] = json!(["local"]);
    let mut b = data(1);
    b["scannedAt"] = json!("2026-10-22T13:00:01.000Z");
    b["hosts"][0]["lastSeen"] = json!("2026-10-22T13:00:00.000Z");
    b["hosts"][0]["providers"] = json!([]);
    b["hosts"][0]["openPorts"] = json!([443]);
    compare(json!({"persistent":true,"slots":{"a":a,"b":b,"empty":data(0)},"steps":[{"op":"set","slot":"a"},{"op":"db"},{"op":"set","slot":"b"},{"op":"db"},{"op":"set","slot":"empty"},{"op":"db"},{"op":"get"}]})).await;
    compare(json!({"persistent":true,"slots":{"a":data(3)},"steps":[{"op":"sql","sql":"CREATE TRIGGER fail_scan BEFORE INSERT ON network_hosts WHEN NEW.ip='192.0.2.2' BEGIN SELECT RAISE(ABORT,'fixture persist'); END;"},{"op":"set","slot":"a"},{"op":"db"},{"op":"get"}]})).await;
}
#[tokio::test]
async fn scanner_failures_keep_previous_cache_and_nonerror_throws_use_fallback() {
    for failure in [
        json!({"error":"fixture scope denied"}),
        json!({"thrown":null}),
        json!({"thrown":{"untrusted":"fixture"}}),
    ] {
        compare(json!({"slots":{"a":data(1)},"scans":[failure],"steps":[{"op":"set","slot":"a"},{"op":"scan","input":{}},{"op":"same","left":"cache","right":"a"},{"op":"get"}]})).await;
    }
}
#[tokio::test]
async fn malformed_scanner_records_fail_without_panicking_or_starting_other_io() {
    let cache = NetworkScanCache::default();
    let scanner: Scanner<()> =
        Arc::new(|_, _| Box::pin(async { Ok(ScanData::new(json!({"hosts":null}))) }));
    let result = NetworkScanTool { cache, scanner }
        .execute(&json!({}), &())
        .await;
    assert!(!result.ok);
    assert!(result.data.is_none());
}
