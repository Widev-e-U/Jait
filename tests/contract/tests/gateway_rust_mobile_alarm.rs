#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::tools::mobile_alarm::{MobileAlarmContext, MobileAlarmInput, MobileAlarmTool};
use serde_json::{Value, json};
use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
};
fn case(at: &str) -> Value {
    json!({"now":1767225600000_i64,"input":{"at":at},"context":{"userId":"owner","actionId":"action","sessionId":"session","projectRoot":"/authorized/project","requestedBy":"user"},"devices":1})
}
async fn compare(cases: Vec<Value>) {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap();
    let expected = internal_driver::call(
        &root,
        &root
            .join(".jait/artifacts/gateway-rust/mobile-alarm/contracts")
            .join(uuid::Uuid::new_v4().to_string()),
        json!({"version":1,"calls":[{"op":"nativemobilealarm.run","cases":cases.clone()}]}),
        &|| false,
    )
    .unwrap()[0]
        .clone();
    for (case, expected) in cases.iter().zip(expected.as_array().unwrap()) {
        let scheduled = Arc::new(Mutex::new(vec![]));
        let captured = scheduled.clone();
        let devices = case["devices"].as_u64().unwrap_or(1) as u32;
        let reject = case["reject"].as_str().map(str::to_string);
        let mut tool = MobileAlarmTool::new(Arc::new(move |user, alarm| {
            captured
                .lock()
                .unwrap()
                .push(json!({"user":user,"alarm":alarm}));
            let reject = reject.clone();
            Box::pin(async move {
                if let Some(message) = reject {
                    Err(message)
                } else {
                    Ok(devices)
                }
            })
        }));
        let now = case["now"].as_i64().unwrap();
        tool.clock = Arc::new(move || now);
        let input: MobileAlarmInput = serde_json::from_value(case["input"].clone()).unwrap();
        let context: MobileAlarmContext = serde_json::from_value(case["context"].clone()).unwrap();
        let mut actual = match tool.execute(input, context).await {
            Ok(outcome) => json!({"outcome":outcome}),
            Err(error) => json!({"thrown":error}),
        };
        actual["scheduled"] = json!(*scheduled.lock().unwrap());
        actual["metadata"] = tool.metadata().clone();
        assert_eq!(&actual, expected, "case {case}");
    }
}
#[tokio::test]
async fn future_boundary_invalid_timestamps_and_auth_precede_dispatch() {
    let mut cases = vec![];
    for at in [
        "yesterday",
        "",
        "2025-12-31T23:59:59.999Z",
        "2026-01-01T00:00:00Z",
        "2026-01-01T00:00:00.001Z",
        "2027-02-30T00:00:00Z",
        "2027-13-01",
        "2027-01-01T24:00:00Z",
        "+275760-09-13T00:00:00.000Z",
        "+275760-09-13T00:00:00.001Z",
    ] {
        cases.push(case(at));
        let mut missing = case(at);
        missing["context"]
            .as_object_mut()
            .unwrap()
            .shift_remove("userId");
        cases.push(missing);
        let mut empty = case(at);
        empty["context"]["userId"] = json!("");
        cases.push(empty);
    }
    compare(cases).await;
}
#[tokio::test]
async fn defaults_replacements_trim_device_counts_and_push_failure() {
    let mut cases = vec![];
    for devices in [0, 1, 2, 12345] {
        for input in [
            json!({"at":"2027-01-01T03:04:05.678+02:00"}),
            json!({"at":"2027-01-01T03:04:05.678+02:00","id":" replacement ","title":" briefing ","body":" wake up "}),
            json!({"at":"2027-01-01T03:04:05.678+02:00","id":"\u{feff}\t","title":" \n","body":"\u{00a0}"}),
            json!({"at":"2027-01-01T03:04:05.678+02:00","id":null,"title":null,"body":null}),
        ] {
            let mut c = case("");
            c["devices"] = json!(devices);
            c["input"] = input;
            cases.push(c);
        }
    }
    let mut reject = case("2027-01-01");
    reject["reject"] = json!("push transport failed");
    cases.push(reject);
    compare(cases).await;
}
#[tokio::test]
async fn date_parse_legacy_offsets_fraction_and_iso_normalization() {
    compare(
        [
            "2027",
            "2027-2",
            "2027-2-3",
            "2027-2-3T04:05:06Z",
            "2027-02-3T04:05:06Z",
            "2027-2-03T04:05:06Z",
            "2027-01T04:05:06Z",
            "2027T04:05:06Z",
            "2027-2-3 04:05:06Z",
            "2027-01-01t03:04:05z",
            "2027-01-01T03:04:05.1234567+0230",
            "2027/2/3",
            "2/3/2027",
            "Wed, 03 Feb 2027 12:34:56 GMT",
            "2027-01-01T03:04:05+02",
            "2027-01-01T00:00:00+24:00",
            "2027-01-01T00:00:00.001Z ",
        ]
        .into_iter()
        .map(case)
        .collect(),
    )
    .await;
}
