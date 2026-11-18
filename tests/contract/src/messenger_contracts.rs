use crate::matrix_fixture::{MatrixPeer, ROOM};
use crate::{
    client::{Api, equal},
    scenarios::{Scenario, Suite},
};
use anyhow::{Result, bail, ensure};
use serde_json::json;
use std::{
    thread,
    time::{Duration, Instant},
};

pub const CASES: &[Scenario] = &[
    ("messenger.auth-required", auth_required),
    (
        "messenger.encrypted-shared-device-restart",
        encrypted_shared_device,
    ),
    ("messenger.gateway-owned-snapshot", gateway_snapshot),
    ("messenger.invalid-connection-unchanged", invalid_connection),
    (
        "messenger.encrypted-history-recovery-restart",
        history_recovery,
    ),
];

fn auth_required(s: &mut Suite) -> Result<()> {
    for method in ["GET", "POST", "DELETE"] {
        s.gateway
            .api
            .expect(method, "/api/messenger", None, None, 401)?;
    }
    for (method, path) in [
        ("POST", "/api/messenger/command"),
        ("POST", "/api/messenger/keys"),
        ("POST", "/api/messenger/media"),
        ("GET", "/api/messenger/search?query=test"),
    ] {
        s.gateway.api.expect(method, path, None, None, 401)?;
    }
    Ok(())
}

fn gateway_snapshot(s: &mut Suite) -> Result<()> {
    // Independent HTTP clients, with no browser, Matrix login or WebSocket.
    for api in [&s.gateway.api, &Api::new(&s.gateway.api.base)?] {
        let value = api.json("GET", "/api/messenger", Some(&s.owner), None, 200)?;
        equal(
            &value["snapshot"]["status"],
            json!("disconnected"),
            "gateway connection state",
        )?;
        equal(
            &value["snapshot"]["session"],
            json!(null),
            "no Matrix session",
        )?;
        equal(
            &value["snapshot"]["assistantAccess"],
            json!(false),
            "assistant opt-in",
        )?;
        equal(&value["snapshot"]["rooms"], json!([]), "empty rooms")?;
    }
    Ok(())
}

fn invalid_connection(s: &mut Suite) -> Result<()> {
    for body in [
        json!({}),
        json!({"homeserver":"http://192.0.2.4", "username":"alice", "password":"private"}),
        json!({"homeserver":"https://example.org/?token=private","username":"alice","password":"private"}),
    ] {
        s.gateway
            .api
            .expect("POST", "/api/messenger", Some(&s.owner), Some(body), 400)?;
    }
    gateway_snapshot(s)
}

fn snapshot(s: &Suite, api: &Api, token: &str) -> Result<serde_json::Value> {
    let _ = s;
    Ok(api.json(
        "GET",
        "/api/messenger?roomId=!shared%3Afixture",
        Some(token),
        None,
        200,
    )?["snapshot"]
        .clone())
}
fn wait_ready(s: &Suite, api: &Api, message: bool) -> Result<serde_json::Value> {
    let deadline = Instant::now() + Duration::from_secs(15);
    let mut last = json!(null);
    while Instant::now() < deadline {
        last = snapshot(s, api, &s.owner)?;
        if last["status"] == "ready"
            && (!message || last["messages"][0]["body"] == "gateway encrypted roundtrip")
        {
            return Ok(last);
        }
        thread::sleep(Duration::from_millis(100));
    }
    bail!("gateway Matrix state did not become ready: {last}")
}
fn encrypted_shared_device(s: &mut Suite) -> Result<()> {
    let peer = MatrixPeer::start()?;
    let api = Api::new(&s.gateway.api.base)?;
    let login =
        json!({"homeserver":peer.origin,"username":"alice","password":"fixture-only-password"});
    s.gateway.api.json(
        "POST",
        "/api/messenger",
        Some(&s.owner),
        Some(login.clone()),
        200,
    )?;
    let ready = wait_ready(s, &api, false)?;
    equal(
        &ready["session"]["deviceId"],
        json!("JAIT_GATEWAY"),
        "shared Matrix device",
    )?;
    ensure!(
        !ready.to_string().contains("fixture-matrix-token"),
        "Matrix token leaked to browser"
    );
    let other = snapshot(s, &api, &s.member)?;
    equal(&other["session"], json!(null), "account isolation")?;
    // A second browser's connect must reuse the gateway session.
    api.json("POST", "/api/messenger", Some(&s.owner), Some(login), 200)?;
    ensure!(
        peer.logins() == 1,
        "second client minted another Matrix device"
    );
    api.json(
        "POST",
        "/api/messenger/command",
        Some(&s.owner),
        Some(json!({"action":"send","roomId":ROOM,"text":"gateway encrypted roundtrip"})),
        200,
    )?;
    let message = wait_ready(s, &api, true)?;
    equal(
        &message["messages"][0]["encrypted"],
        json!(true),
        "encrypted timeline",
    )?;
    equal(
        &message["messages"][0]["unableToDecrypt"],
        json!(false),
        "decrypted timeline",
    )?;
    peer.assert_encrypted_send()?;
    api.json("POST","/api/messenger/command",Some(&s.owner),Some(json!({"action":"attachment","roomId":ROOM,"name":"qr.png","mime":"image/png","data":"cXItZml4dHVyZS1pbWFnZQ=="})),200)?;
    let deadline = Instant::now() + Duration::from_secs(5);
    let mut attachment = json!(null);
    while Instant::now() < deadline {
        let value = snapshot(s, &api, &s.owner)?;
        if let Some(message) = value["messages"]
            .as_array()
            .and_then(|messages| messages.iter().find(|m| m["attachment"].is_object()))
        {
            attachment = message["attachment"].clone();
            break;
        }
        thread::sleep(Duration::from_millis(50));
    }
    ensure!(
        attachment.is_object(),
        "encrypted attachment never reached timeline"
    );
    let media = api.json(
        "POST",
        "/api/messenger/media",
        Some(&s.owner),
        Some(json!({"url":attachment["url"],"file":attachment["file"]})),
        200,
    )?;
    equal(
        &media["data"],
        json!("cXItZml4dHVyZS1pbWFnZQ=="),
        "encrypted attachment roundtrip",
    )?;
    api.json(
        "POST",
        "/api/messenger/command",
        Some(&s.owner),
        Some(json!({"action":"assistantAccess","enabled":true})),
        200,
    )?;
    equal(
        &snapshot(s, &api, &s.owner)?["assistantAccess"],
        json!(true),
        "assistant opt-in shared with second client",
    )?;
    equal(
        &snapshot(s, &api, &s.member)?["assistantAccess"],
        json!(false),
        "assistant opt-in owner scoped",
    )?;

    // Neither HTTP client has an open browser or a Matrix WebSocket.
    let before = peer.syncs();
    thread::sleep(Duration::from_millis(350));
    ensure!(peer.syncs() > before, "sync stopped without a frontend");
    if s.gateway.managed {
        let syncs = peer.syncs();
        s.gateway.restart()?;
        let deadline = Instant::now() + Duration::from_secs(5);
        while Instant::now() < deadline && peer.syncs() <= syncs {
            thread::sleep(Duration::from_millis(50));
        }
        ensure!(
            peer.syncs() > syncs,
            "gateway did not resume syncing until a frontend request"
        );
        let api = Api::new(&s.gateway.api.base)?;
        let message = wait_ready(s, &api, true)?;
        equal(
            &message["session"]["deviceId"],
            json!("JAIT_GATEWAY"),
            "device persists after restart",
        )?;
        ensure!(
            peer.logins() == 1,
            "gateway restart logged in instead of restoring session"
        );
        equal(
            &message["assistantAccess"],
            json!(false),
            "assistant access resets at restart",
        )?;
    }
    s.gateway
        .api
        .json("DELETE", "/api/messenger", Some(&s.owner), None, 200)?;
    let disconnected = snapshot(s, &s.gateway.api, &s.owner)?;
    equal(
        &disconnected["status"],
        json!("disconnected"),
        "disconnect shared connection",
    )?;
    Ok(())
}

fn history_recovery(s: &mut Suite) -> Result<()> {
    let (peer, key) = MatrixPeer::start_with_history()?;
    s.gateway.api.json(
        "POST",
        "/api/messenger",
        Some(&s.owner),
        Some(json!({"homeserver":peer.origin,"username":"alice","password":"fixture-password"})),
        200,
    )?;
    let before = wait_ready(s, &s.gateway.api, false)?;
    equal(
        &before["messages"][0]["unableToDecrypt"],
        json!(true),
        "historical key initially unavailable",
    )?;
    s.gateway.api.expect(
        "POST",
        "/api/messenger/keys",
        Some(&s.owner),
        Some(json!({"recoveryKey":"invalid"})),
        400,
    )?;
    s.gateway.api.json(
        "POST",
        "/api/messenger/keys",
        Some(&s.owner),
        Some(json!({"recoveryKey":key})),
        200,
    )?;
    let after = snapshot(s, &s.gateway.api, &s.owner)?;
    equal(
        &after["messages"][0]["body"],
        json!("historical encrypted message"),
        "recovered historical message",
    )?;
    equal(
        &after["messages"][0]["unableToDecrypt"],
        json!(false),
        "historical recovery",
    )?;
    if s.gateway.managed {
        s.gateway.restart()?;
        wait_ready(s, &s.gateway.api, false)?;
        let after = snapshot(s, &s.gateway.api, &s.owner)?;
        equal(
            &after["messages"][0]["body"],
            json!("historical encrypted message"),
            "recovered keys persist at restart",
        )?;
    }
    s.gateway
        .api
        .json("DELETE", "/api/messenger", Some(&s.owner), None, 200)?;
    Ok(())
}
