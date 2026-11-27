//! Live Messenger snapshot projections; only cached state and transport are fixtures.
#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::{
    services::messenger_service::{MessengerService, MessengerSession, MessengerStatus, Room},
    tools::core_jait::JaitPort,
};
use serde_json::{Value, json};
use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
};

fn room(service: Option<&str>, direct: bool) -> Value {
    let mut summary = json!({
        "id":"!room:test","name":"Contact","membership":"join","timestamp":1,"unread":0
    });
    if let Some(service) = service {
        summary["service"] = json!(service);
    }
    let mut room = json!({
        "summary":summary,"states":[
            {"type":"m.room.member","state_key":"@peer:test","content":{"displayname":"Contact"}},
            {"type":"m.room.member","state_key":"@other:test","content":{"displayname":"Contact"}}
        ],"events":[
            {"event_id":"$peer","type":"m.room.message","sender":"@peer:test","content":{"body":"peer"}},
            {"event_id":"$other","type":"m.room.message","sender":"@other:test","content":{"body":"other"}},
            {"event_id":"$own","type":"m.room.message","sender":"@self:test","content":{"body":"own"}},
            {"event_id":"$anonymous","type":"m.room.message","content":{"body":"anonymous"}},
            {"event_id":"$empty","type":"m.room.message","sender":"","content":{"body":"empty"}}
        ]
    });
    if direct {
        room["peer"] = json!({"userId":"@peer:test","name":"Contact"});
    }
    room
}
fn presence(state: &str) -> Value {
    json!({"events":[
        {"type":"m.presence","sender":"@peer:test","content":{"presence":state,"last_active_ago":50}},
        {"type":"m.presence","sender":"@other:test","content":{"presence":"unavailable"}},
        {"type":"m.presence","sender":"@self:test","content":{"presence":"online"}}
    ]})
}
fn call(service: Option<&str>, direct: bool, steps: Vec<Value>) -> Value {
    json!({"op":"nativemessengerpresence.trace","room":room(service,direct),"steps":steps})
}
fn project(snapshot: Value) -> Value {
    let rooms: Vec<_> = snapshot["rooms"]
        .as_array()
        .unwrap()
        .iter()
        .map(|room| {
            let mut out = json!({"id":room["id"]});
            if let Some(peer) = room.get("peer") {
                out["peer"] = peer.clone();
            }
            out
        })
        .collect();
    let messages: Vec<_> = snapshot["messages"]
        .as_array()
        .unwrap()
        .iter()
        .map(|message| {
            let mut out = json!({"id":message["id"]});
            for key in ["senderId", "senderPresence"] {
                if let Some(value) = message.get(key) {
                    out[key] = value.clone();
                }
            }
            out
        })
        .collect();
    json!({"rooms":rooms,"messages":messages})
}
async fn native(input: &Value, root: &std::path::Path) -> Value {
    let calls = Arc::new(Mutex::new(Vec::<Value>::new()));
    let recorder = calls.clone();
    let port: JaitPort<()> = Arc::new(move |action, args, _| {
        assert_eq!(action, "messenger.presence", "unexpected fixture transport");
        recorder.lock().unwrap().extend(args);
        Box::pin(async { Ok(Some(json!({"state":"online"}))) })
    });
    let service = MessengerService::new(
        root.join(".jait/artifacts/gateway-rust/messenger-presence/native"),
        Some(port),
    );
    let connection = service.connection("owner");
    connection.set_status(MessengerStatus::Ready, None);
    connection.set_session(Some(MessengerSession {
        homeserver: "https://matrix.invalid".into(),
        user_id: "@self:test".into(),
        device_id: "fixture".into(),
        access_token: "fixture-token".into(),
        crypto_store: "fixture-store".into(),
    }));
    let room = &input["room"];
    connection.put_room(
        "!room:test",
        Room {
            summary: room["summary"].clone(),
            events: serde_json::from_value(room["events"].clone()).unwrap(),
            states: serde_json::from_value(room["states"].clone()).unwrap(),
            previous: None,
            receipts: vec![],
            peer: room
                .get("peer")
                .map(|peer| serde_json::from_value(peer.clone()).unwrap()),
        },
    );
    if input["op"] == "nativemessengerpresence.probe" {
        connection.probe_presence("!room:test", &()).await;
        return json!({
            "calls":calls.lock().unwrap().clone(),
            "snapshot":project(json!(connection.snapshot(Some("!room:test"))))
        });
    }
    let mut trace = Vec::new();
    for presence in input["steps"].as_array().unwrap() {
        connection.track_presence(presence);
        trace.push(project(json!(connection.snapshot(Some("!room:test")))));
    }
    json!({
        "trace":trace,
        "other":project(json!(service.connection("other").snapshot(Some("!room:test"))))
    })
}
async fn compare(calls: Vec<Value>) {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap();
    let expected = internal_driver::call(
        &root,
        &root.join(".jait/artifacts/gateway-rust/messenger-presence"),
        json!({"version":1,"calls":calls}),
        &|| false,
    )
    .unwrap();
    let expected = expected.as_array().unwrap();
    for (call, expected) in calls.iter().zip(expected) {
        assert_eq!(
            numeric(native(call, &root).await),
            numeric(expected.clone()),
            "call={call:?}"
        );
    }
}
fn numeric(value: Value) -> Value {
    match value {
        Value::Number(number) => json!(number.as_f64().unwrap()),
        Value::Array(values) => Value::Array(values.into_iter().map(numeric).collect()),
        Value::Object(values) => Value::Object(
            values
                .into_iter()
                .map(|(key, value)| (key, numeric(value)))
                .collect(),
        ),
        value => value,
    }
}

#[tokio::test]
async fn matrix_presence_preserves_sender_identity_and_omits_own_and_missing_presence() {
    compare(
        ["online", "unavailable", "offline"]
            .map(|state| call(Some("Matrix"), true, vec![presence(state)]))
            .into(),
    )
    .await;
}

#[tokio::test]
async fn bridged_offline_is_unknown_for_peers_and_absent_for_senders() {
    compare(
        [
            Some("Teams"),
            Some("WhatsApp"),
            Some("Slack"),
            Some("Discord"),
            None,
        ]
        .map(|service| call(service, true, vec![presence("offline")]))
        .into(),
    )
    .await;
}

#[tokio::test]
async fn positive_signals_remain_visible_in_direct_and_group_bridge_rooms() {
    let mut calls = Vec::new();
    for service in ["Matrix", "Teams", "WhatsApp"] {
        for direct in [true, false] {
            calls.push(call(
                Some(service),
                direct,
                vec![
                    presence("online"),
                    presence("unavailable"),
                    presence("offline"),
                ],
            ));
        }
    }
    compare(calls).await;
}

#[tokio::test]
async fn unknown_and_invalid_updates_do_not_replace_cached_signals_or_leak_to_other_owners() {
    compare(vec![call(
        Some("Matrix"),
        true,
        vec![
            json!({"events":[]}),
            presence("online"),
            presence("unknown"),
            presence("invalid"),
            json!({"events":[
                {"type":"m.presence","sender":"@peer:test","content":{"presence":"offline","last_active_ago":-1}}
            ]}),
        ],
    )])
    .await;
}

#[tokio::test]
async fn presence_probes_only_target_direct_matrix_peers() {
    let mut calls = Vec::new();
    for service in [Some("Matrix"), Some("Teams"), Some("WhatsApp"), None] {
        for direct in [true, false] {
            let mut input = call(service, direct, vec![]);
            input["op"] = json!("nativemessengerpresence.probe");
            calls.push(input);
        }
    }
    compare(calls).await;
}
