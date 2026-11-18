//! Real production SSH/SCP orchestration against local process peers, never a network.
#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::{
    runtime::command::CommandPool,
    services::project_transfer::{ProjectTransferInput, transfer_plan, transfer_project_with_scp},
};
use serde_json::{Value, json};
use std::{collections::HashMap, num::NonZeroU16, path::PathBuf};
fn input() -> Value {
    json!({"sourcePath":"/owned/source/","destinationPath":"/owned/destination","sshHost":"host.invalid","sshUser":"owner"})
}
async fn compare(input: Value, plan: Value) {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap();
    let results = internal_driver::call(
        &root,
        &root.join(".jait/artifacts/gateway-rust/project-transfer"),
        json!({"version":1,"calls":[{"op":"nativetransfer.run","input":input,"plan":plan}]}),
        &|| false,
    )
    .unwrap();
    let expected = &results[0];
    let environment =
        serde_json::from_value::<HashMap<String, String>>(expected["env"].clone()).unwrap();
    let log = PathBuf::from(environment.get("JAIT_TRANSFER_LOG").unwrap());
    std::fs::write(&log, "").unwrap();
    let pool = CommandPool::new(NonZeroU16::new(2).unwrap(), environment);
    let parsed = serde_json::from_value::<ProjectTransferInput>(input.clone()).unwrap();
    let result = match transfer_project_with_scp(&parsed, &pool).await {
        Ok(value) => json!({"ok":true,"value":value}),
        Err(e) => json!({"ok":false,"message":e.message}),
    };
    assert_eq!(result, expected["result"], "input={input},plan={plan}");
    let peer_calls: Vec<Value> = std::fs::read_to_string(log)
        .unwrap()
        .lines()
        .map(|s| serde_json::from_str(s).unwrap())
        .collect();
    assert_eq!(
        json!(peer_calls),
        expected["peerCalls"],
        "actual process argv and ordering"
    );
    if let Ok(plans) = transfer_plan(&parsed) {
        for (index, actual) in expected["calls"].as_array().unwrap().iter().enumerate() {
            assert_eq!(
                serde_json::to_value(&plans[index]).unwrap(),
                *actual,
                "execution options"
            );
        }
    } else {
        assert_eq!(expected["calls"], json!([]));
    }
}
#[tokio::test]
async fn creates_remote_directory_then_copies_contents_and_combines_output() {
    compare(input(),json!({"ssh":{"stdout":" prepared\n","stderr":"prepare warning"},"scp":{"stdout":"copied\n","stderr":"copy warning\u{feff} "}})).await;
    compare(input(), json!({})).await;
}
#[tokio::test]
async fn argv_is_literal_and_remote_single_quotes_are_escaped() {
    for (source, destination) in [
        ("/owned/a b///", "/owned/a'b; $(touch forbidden) `true`"),
        ("C:\\owned\\source\\\\", "-dash ' \" \\ tab\t🦀"),
        ("/", ""),
        ("", "-remote"),
        ("-source", "/remote"),
    ] {
        let mut i = input();
        i["sourcePath"] = json!(source);
        i["destinationPath"] = json!(destination);
        compare(i, json!({"ssh":{"stdout":"a"},"scp":{"stderr":"b"}})).await;
    }
}
#[tokio::test]
async fn validates_hosts_users_and_destinations_before_any_process() {
    for (field, value) in [
        ("sshHost", ""),
        ("sshHost", " \t"),
        ("sshHost", "\u{feff}"),
        ("sshHost", "host;echo"),
        ("sshHost", "host\n"),
        ("sshHost", "host name"),
        ("sshHost", "höst"),
        ("sshUser", ""),
        ("sshUser", "a@b"),
        ("sshUser", "$(id)"),
        ("sshUser", "user/name"),
        ("destinationPath", "bad\0path"),
        ("destinationPath", "bad\rpath"),
        ("destinationPath", "bad\npath"),
    ] {
        let mut i = input();
        i[field] = json!(value);
        compare(i, json!({})).await;
    }
}
#[tokio::test]
async fn optional_ports_distinguish_missing_null_and_numeric_boundaries() {
    for port in [
        json!(null),
        json!(false),
        json!("22"),
        json!([]),
        json!({}),
        json!(0),
        json!(-1),
        json!(1.5),
        json!(65536),
        json!(1),
        json!(65535),
        json!(2222.0),
    ] {
        let mut i = input();
        i["sshPort"] = port;
        compare(i, json!({})).await;
    }
    let mut i = input();
    i["sshHost"] = json!("2001:db8::1");
    i["sshUser"] = json!("user.name-1");
    compare(i, json!({})).await;
}
#[tokio::test]
async fn prepare_failures_stop_copy_and_copy_failures_return_the_actual_error() {
    compare(input(),json!({"ssh":{"code":7,"stdout":"partial prepare","stderr":"permission denied\n"},"scp":{"stdout":"must not run"}})).await;
    compare(input(),json!({"ssh":{"stdout":"prepared"},"scp":{"code":3,"stdout":"partial copy","stderr":"write failed\n"}})).await;
    compare(input(), json!({"ssh":{"code":1}})).await;
}
#[tokio::test]
async fn source_nul_rejection_occurs_after_prepare_without_spawning_scp() {
    for source in [
        "source\0path/",
        "source\0\n\t\r\u{8}\u{c}\u{b}\u{1}\u{1f}\u{7f}path/",
        "single'\0path/",
        "both'\"`\\\0path/",
        "\u{85}\u{a0}\u{200b}\u{2028}\u{2029}\u{feff}\0🦀/",
        "source\x00123/",
    ] {
        let mut i = input();
        i["sourcePath"] = json!(source);
        compare(i, json!({})).await;
    }
}
#[tokio::test]
async fn validation_order_and_output_trim_match_reference() {
    let mut i = input();
    i["sshHost"] = json!("");
    i["sshUser"] = json!("");
    i["sshPort"] = json!(null);
    i["destinationPath"] = json!("\n");
    compare(i, json!({})).await;
    compare(input(),json!({"ssh":{"stdout":"\u{feff}\u{a0}start","stderr":" "},"scp":{"stdout":"\n","stderr":"end\u{feff}\u{a0}"}})).await;
}

#[tokio::test]
async fn per_stream_limits_fail_the_responsible_stage_without_copying_after_prepare_overflow() {
    compare(
        input(),
        json!({"ssh":{"stdout":"x","stdoutRepeat":1048577}}),
    )
    .await;
    compare(
        input(),
        json!({"ssh":{"stderr":"x","stderrRepeat":1048577}}),
    )
    .await;
    compare(
        input(),
        json!({"scp":{"stdout":"x","stdoutRepeat":10485761}}),
    )
    .await;
    compare(
        input(),
        json!({"scp":{"stderr":"x","stderrRepeat":10485761}}),
    )
    .await;
}

#[tokio::test]
async fn missing_or_nonexecutable_binaries_fail_at_the_actual_stage() {
    for program in ["ssh", "scp"] {
        for fault in ["missing", "denied"] {
            let mut plan = json!({});
            plan[program] = json!({fault:true});
            compare(input(), plan).await;
        }
    }
}
