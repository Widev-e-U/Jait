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
            for key in [
                "body",
                "edited",
                "readBy",
                "reactions",
                "senderId",
                "senderPresence",
                "threadRootId",
                "replyTo",
            ] {
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
            receipts: room
                .get("receipts")
                .and_then(Value::as_object)
                .map(|receipts| {
                    receipts
                        .iter()
                        .map(|(event_id, users)| {
                            (
                                event_id.clone(),
                                users
                                    .as_object()
                                    .unwrap()
                                    .iter()
                                    .map(|(user_id, receipt)| {
                                        (
                                            user_id.clone(),
                                            serde_json::from_value(receipt.clone()).unwrap(),
                                        )
                                    })
                                    .collect(),
                            )
                        })
                        .collect()
                })
                .unwrap_or_default(),
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

fn thread_call(relation: Value) -> Value {
    let mut input = call(Some("Teams"), false, vec![presence("online")]);
    input["room"]["events"].as_array_mut().unwrap().push(json!({
        "event_id":"$thread","type":"m.room.message","sender":"@peer:test",
        "origin_server_ts":1,"content":{"body":"thread reply","m.relates_to":relation}
    }));
    input
}

#[tokio::test]
async fn thread_messages_keep_roots_even_when_history_is_missing_and_other_relations_stay_hidden() {
    let mut calls = Vec::new();
    for root in [
        json!("$peer"),
        json!("$unloaded"),
        json!(""),
        Value::Null,
        json!(42),
    ] {
        calls.push(thread_call(json!({"rel_type":"m.thread","event_id":root})));
    }
    for relation in [
        json!({}),
        json!({"rel_type":""}),
        json!({"rel_type":null}),
        json!({"rel_type":false}),
        json!({"rel_type":0}),
        json!({"rel_type":true}),
        json!({"rel_type":1}),
        json!({"rel_type":{}}),
        json!({"rel_type":[]}),
        json!({"rel_type":"m.reference","event_id":"$peer"}),
        json!({"rel_type":"m.annotation","event_id":"$peer"}),
    ] {
        calls.push(thread_call(relation));
    }
    compare(calls).await;
}

#[tokio::test]
async fn thread_fallback_reply_is_suppressed_only_for_literal_true_with_a_nonempty_root() {
    let mut calls = Vec::new();
    for root in [json!("$peer"), json!("$unloaded"), json!(""), Value::Null] {
        for falling_back in [
            json!(true),
            json!(false),
            Value::Null,
            json!("true"),
            json!(1),
        ] {
            calls.push(thread_call(json!({
                "rel_type":"m.thread","event_id":root,"is_falling_back":falling_back,
                "m.in_reply_to":{"event_id":"$peer"}
            })));
        }
    }
    compare(calls).await;
}

#[tokio::test]
async fn thread_edits_keep_original_roots_with_reactions_receipts_and_redacted_parents() {
    let mut input = thread_call(json!({
        "rel_type":"m.thread","event_id":"$peer","m.in_reply_to":{"event_id":"$peer"}
    }));
    input["room"]["events"].as_array_mut().unwrap().extend([
        json!({
            "event_id":"$edit","type":"m.room.message","sender":"@peer:test","origin_server_ts":2,
            "content":{"m.relates_to":{"rel_type":"m.replace","event_id":"$thread"},
                "m.new_content":{"body":"updated","m.relates_to":{"rel_type":"m.thread","event_id":"$wrong-root"}}}
        }),
        json!({
            "event_id":"$forged","type":"m.room.message","sender":"@other:test","origin_server_ts":3,
            "content":{"m.relates_to":{"rel_type":"m.replace","event_id":"$thread"},"m.new_content":{"body":"forged"}}
        }),
        json!({
            "event_id":"$reaction","type":"m.reaction","sender":"@self:test",
            "content":{"m.relates_to":{"rel_type":"m.annotation","event_id":"$thread","key":"+1"}}
        }),
        json!({
            "event_id":"$other-reaction","type":"m.reaction","sender":"@other:test",
            "content":{"m.relates_to":{"rel_type":"m.annotation","event_id":"$thread","key":"+1"}}
        }),
        json!({"event_id":"$redact-reaction","type":"m.room.redaction","redacts":"$reaction","content":{}}),
        json!({
            "event_id":"$child","type":"m.room.message","sender":"@self:test",
            "content":{"body":"child","m.relates_to":{"rel_type":"m.thread","event_id":"$thread",
                "m.in_reply_to":{"event_id":"$thread"}}}
        }),
    ]);
    input["room"]["receipts"] = json!({
        "$thread":{"@reader:test":{"ts":101}},
        "$child":{"@reader:test":{"ts":202}}
    });
    let mut redacted = input.clone();
    redacted["room"]["events"]
        .as_array_mut()
        .unwrap()
        .push(json!({"event_id":"$redact-thread","type":"m.room.redaction","redacts":"$thread","content":{}}));
    compare(vec![input, redacted]).await;
}
