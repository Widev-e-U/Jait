#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::{
    security::assessment_lease::{AssessmentRelease, claim_assessment_execution},
    services::{
        computer_control::ComputerControlSessionService,
        email::inline_images::{embed_inline_images, inline_image_data},
    },
    time::Clock,
    tools::swarm_mailbox::{Messages, SwarmMailbox},
};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    fs,
    path::PathBuf,
    sync::{
        Arc,
        atomic::{AtomicI64, Ordering},
    },
};
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}
fn reference(call: Value) -> Value {
    let dir = root()
        .join(".jait/artifacts/gateway-rust/ephemeral")
        .join(uuid::Uuid::new_v4().to_string());
    fs::create_dir_all(&dir).unwrap();
    internal_driver::call(&root(), &dir, json!({"version":1,"calls":[call]}), &|| {
        false
    })
    .unwrap()[0]
        .clone()
}
fn clock(now: i64) -> (Arc<AtomicI64>, Clock) {
    let current = Arc::new(AtomicI64::new(now));
    let copy = current.clone();
    (current, Arc::new(move || copy.load(Ordering::SeqCst)))
}
fn computer(mut call: Value) {
    call["op"] = json!("nativeephemeral.computer");
    let expected = reference(call.clone());
    let (now, clock) = clock(call["now"].as_i64().unwrap());
    let mut service =
        ComputerControlSessionService::new(clock, call["leaseMs"].as_i64().unwrap_or(1800000));
    let mut ids = HashMap::<String, String>::new();
    let mut results = vec![];
    for s in call["steps"].as_array().unwrap() {
        let id = s["id"].as_str().unwrap_or("");
        let id = ids.get(id).map(String::as_str).unwrap_or(id);
        let owner = s["owner"].as_str().unwrap_or("");
        let value: Result<Value, String> = match s["op"].as_str().unwrap() {
            "time" => {
                now.store(s["now"].as_i64().unwrap(), Ordering::SeqCst);
                Ok(Value::Null)
            }
            "start" => service
                .start(owner, s["node"].as_str().unwrap())
                .map(|s| json!(s)),
            "get" => Ok(json!(service.get(id))),
            "owned" => service.require_owned(id, owner).map(|s| json!(s)),
            "stop" => Ok(json!(service.stop(id))),
            "list" => Ok(json!(service.list_for_owner(owner))),
            _ => panic!("bad step"),
        };
        let value = value.unwrap_or_else(|e| json!({"error":e}));
        if let Some(alias) = s["alias"].as_str() {
            ids.insert(alias.into(), value["id"].as_str().unwrap().into());
        }
        results.push(value);
    }
    let mut text = serde_json::to_string(&results).unwrap();
    for (alias, id) in ids {
        text = text.replace(&id, &format!("<{alias}>"));
    }
    let actual: Value = serde_json::from_str(&text).unwrap();
    assert_eq!(actual, expected);
}
#[test]
fn computer_ownership_exclusivity_and_expiry_boundaries() {
    computer(json!({"now":1700000000000i64,"leaseMs":1000,"steps":[
     {"op":"get","id":"missing"},{"op":"owned","id":"missing","owner":"a"},
     {"op":"start","node":"n1","owner":"a","alias":"first"},
     {"op":"start","node":"n1","owner":"a"},{"op":"start","node":"n1","owner":"b"},
     {"op":"owned","id":"first","owner":"b"},{"op":"owned","id":"first","owner":"a"},
     {"op":"start","node":"n2","owner":"a","alias":"second"},
     {"op":"list","owner":"a"},{"op":"list","owner":"b"},
     {"op":"time","now":1700000000999i64},{"op":"get","id":"first"},
     {"op":"time","now":1700000001000i64},{"op":"stop","id":"second"},{"op":"get","id":"first"},
     {"op":"start","node":"n1","owner":"b","alias":"third"},{"op":"stop","id":"first"},
     {"op":"list","owner":"b"},{"op":"stop","id":"third"},{"op":"get","id":"third"}
    ]}));
    computer(
        json!({"now":0,"leaseMs":0,"steps":[{"op":"start","node":"","owner":"","alias":"zero"},{"op":"stop","id":"zero"},{"op":"start","node":"n","owner":"","alias":"new"},{"op":"get","id":"new"}]}),
    );
}
#[test]
fn one_assessment_owner_repeat_release_id_reuse_and_concurrent_claims() {
    let steps = json!([
     {"op":"claim","id":"a","alias":"a"},{"op":"claim","id":"b","alias":"b"},
     {"op":"release","alias":"a"},{"op":"claim","id":"b","alias":"b"},
     {"op":"release","alias":"a"},{"op":"claim","id":"c","alias":"c"},
     {"op":"release","alias":"b"},{"op":"claim","id":"a","alias":"again"},
     {"op":"release","alias":"a"},{"op":"claim","id":"","alias":"empty"},
     {"op":"claim","id":"x","alias":"x"},{"op":"release","alias":"empty"},{"op":"release","alias":"x"}
    ]);
    let expected = reference(json!({"op":"nativeephemeral.lease","steps":steps}));
    let mut releases = HashMap::<String, AssessmentRelease>::new();
    let mut results = vec![];
    for s in steps.as_array().unwrap() {
        if s["op"] == "claim" {
            match claim_assessment_execution(s["id"].as_str().unwrap()) {
                Ok(release) => {
                    releases.insert(s["alias"].as_str().unwrap().into(), release);
                    results.push(json!(true));
                }
                Err(e) => results.push(json!({"error":e})),
            }
        } else {
            releases[s["alias"].as_str().unwrap()].release();
            results.push(Value::Null);
        }
    }
    for release in releases.values() {
        release.release();
    }
    assert_eq!(json!(results), expected);
    let barrier = Arc::new(std::sync::Barrier::new(12));
    let handles = (0..12)
        .map(|n| {
            let b = barrier.clone();
            std::thread::spawn(move || {
                b.wait();
                claim_assessment_execution(&format!("thread-{n}")).ok()
            })
        })
        .collect::<Vec<_>>();
    let winners = handles
        .into_iter()
        .filter_map(|h| h.join().unwrap())
        .collect::<Vec<_>>();
    assert_eq!(winners.len(), 1);
    winners[0].release();
}
#[test]
fn swarm_rounds_share_live_arrays_and_retained_handles_survive_round_replacement() {
    let steps = json!([
     {"op":"post","id":"missing","from":"x","content":"lost","retain":"missing"},{"op":"count","id":"missing"},
     {"op":"create","id":"a","count":2},{"op":"create","id":"b","count":1},
     {"op":"peek","id":"a","retain":"old"},{"op":"post","id":"a","from":"one","content":"hello","retain":"posted"},
     {"op":"time","now":1235},{"op":"post","id":"a","from":"two","content":"你好"},
     {"op":"observe","alias":"old"},{"op":"observe","alias":"posted"},{"op":"peek","id":"b"},
     {"op":"count","id":"a"},{"op":"end","id":"a"},{"op":"post","id":"a","from":"no","content":"lost"},
     {"op":"observe","alias":"old"},{"op":"create","id":"a","count":0},{"op":"peek","id":"a"},
     {"op":"observe","alias":"old"},{"op":"observe","alias":"missing"}
    ]);
    let expected = reference(json!({"op":"nativeephemeral.swarm","now":1234,"steps":steps}));
    let (now, clock) = clock(1234);
    let service = SwarmMailbox::new(clock);
    let mut retained = HashMap::<String, Messages>::new();
    let mut results = vec![];
    for s in steps.as_array().unwrap() {
        let id = s["id"].as_str().unwrap_or("");
        let mut messages = None;
        let value = match s["op"].as_str().unwrap() {
            "time" => {
                now.store(s["now"].as_i64().unwrap(), Ordering::SeqCst);
                Value::Null
            }
            "create" => {
                service.create_round(id, s["count"].as_u64().unwrap() as usize);
                Value::Null
            }
            "end" => {
                service.end_round(id);
                Value::Null
            }
            "count" => json!(service.participant_count(id)),
            "post" => {
                messages = Some(service.post(
                    id,
                    s["from"].as_str().unwrap(),
                    s["content"].as_str().unwrap(),
                ));
                Value::Null
            }
            "peek" => {
                messages = Some(service.peek(id));
                Value::Null
            }
            "observe" => {
                messages = Some(retained[s["alias"].as_str().unwrap()].clone());
                Value::Null
            }
            _ => panic!("bad step"),
        };
        let value = if let Some(messages) = messages {
            if let Some(alias) = s["retain"].as_str() {
                retained.insert(alias.into(), messages.clone());
            }
            json!(*messages.lock().unwrap())
        } else {
            value
        };
        results.push(value);
    }
    assert_eq!(json!(results), expected);
}
fn inline(cases: Vec<Value>) {
    let expected = reference(json!({"op":"nativeephemeral.inline","cases":cases}));
    let actual=cases.iter().map(|c|{
  let value=if let Some(html)=c["html"].as_str(){
   let images=c["images"].as_object().map(|o|o.iter().map(|(k,v)|(k.clone(),v.as_str().unwrap().into())).collect()).unwrap_or_default();
   Some(embed_inline_images(html,&images))
  }else{inline_image_data(c["type"].as_str().unwrap(),&c["data"].as_str().unwrap().repeat(c["repeat"].as_u64().unwrap_or(1)as usize))};
  match value{Some(value)if value.len()>200=>json!({"length":value.encode_utf16().count(),"sha256":hex::encode(Sha256::digest(value.as_bytes()))}),v=>json!(v)}
 }).collect::<Vec<_>>();
    assert_eq!(json!(actual), expected);
}
#[test]
fn inline_raster_mimes_node_base64_decoding_and_size_limits() {
    let mut cases = vec![];
    for kind in [
        "image/png",
        "IMAGE/JPEG",
        "image/gif",
        "image/webp",
        "image/avif",
        "image/svg+xml",
        "image/png; charset=utf8",
        " image/png",
        "image/PNG\n",
    ] {
        for data in [
            "aGVsbG8=", "-_8=", "a", "ab", "abc", "abcd", "====", "ab=cde", "a b", "", "é",
            "AA-_==",
        ] {
            cases.push(json!({"type":kind,"data":data}));
        }
    }
    for chunk in cases.chunks(40) {
        inline(chunk.to_vec());
    }
    inline(vec![
        json!({"type":"image/png","data":"A","repeat":1398100}),
        json!({"type":"image/png","data":"A","repeat":1398104}),
        json!({"type":"image/png","data":"A","repeat":1500000}),
        json!({"type":"image/png","data":"A","repeat":1500001}),
    ]);
}
#[test]
fn inline_cid_decoding_preserves_missing_invalid_and_empty_replacements() {
    inline(vec![
        json!({"html":"<img src=\"CID:one\"> cid:%3Cone%3E cid:a%2Bb cid:%F0%9F%98%80 cid:empty","images":{"one":"data:png","a+b":"plus","😀":"emoji","empty":""}}),
        json!({"html":"cid:%GG cid:%ff cid:%E2%82 cid:% cid:unknown cid:one\u{feff}cid:two\u{0085}tail","images":{"one":"one","two\u{0085}tail":"two"}}),
        json!({"html":"cid:%3C%3Ckey%3E%3E cid:key> cid:key' cid:key\nCID:key","images":{"<key>":"nested","key":"ok"}}),
    ]);
}
