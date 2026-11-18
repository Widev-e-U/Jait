//! Independent API safety invariants across users, denied writes and abrupt restarts.
#[allow(dead_code)]
#[path = "../src/client.rs"]
mod client;
#[allow(dead_code)]
#[path = "../src/fixture.rs"]
mod fixture;
use anyhow::{Result, ensure};
use serde_json::json;
use std::{fs, path::PathBuf};

#[test]
fn foreign_users_cannot_read_or_mutate_persisted_sessions_across_crashes() -> Result<()> {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()?;
    let directory = root
        .join(".jait/artifacts/tenant-recovery")
        .join(uuid::Uuid::new_v4().to_string());
    fs::create_dir_all(&directory)?;
    let mut gateway = fixture::Gateway::start(&root, &directory, None)?;
    let owner = gateway.api.json(
        "POST",
        "/api/auth/register",
        None,
        Some(json!({"username":"invariant-owner","password":"fixture-password-only"})),
        200,
    )?;
    let token = owner["access_token"].as_str().unwrap().to_owned();
    let invitation = gateway
        .api
        .json("POST", "/api/auth/invitations", Some(&token), None, 200)?;
    let member=gateway.api.json("POST","/api/auth/register",None,Some(json!({"username":"invariant-member","password":"fixture-password-only","invitation":invitation["invitation"]})),200)?;
    let other = member["access_token"].as_str().unwrap().to_owned();
    let mut sessions = Vec::new();
    for (name, auth) in [("owner-private-α🙂", &token), ("member-private-終", &other)] {
        let session = gateway.api.json(
            "POST",
            "/api/sessions",
            Some(auth),
            Some(json!({"name":name})),
            201,
        )?;
        sessions.push((session["id"].as_str().unwrap().to_owned(), name.to_owned()));
    }
    let mut checked = 0;
    for generation in 0..3 {
        for (index, (id, name)) in sessions.iter().enumerate() {
            let auth = if index == 0 { &token } else { &other };
            let stranger = if index == 0 { &other } else { &token };
            let path = format!("/api/sessions/{id}");
            let state = format!("{path}/state");
            let marker = json!({"generation":generation,"owner":index,"text":"α🙂終\nretained", "ordered":[3,1,2],"nested":{"enabled":true,"empty":null}});
            gateway.api.json(
                "PATCH",
                &state,
                Some(auth),
                Some(json!({"proof.checkpoint":marker})),
                200,
            )?;
            let before = gateway.api.json("GET", &path, Some(auth), None, 200)?;
            for (method, suffix, body) in [
                ("GET", "", None),
                (
                    "PATCH",
                    "",
                    Some(json!({"name":"unauthorized replacement"})),
                ),
                ("DELETE", "", None),
                ("POST", "/archive", Some(json!({}))),
                ("POST", "/move", Some(json!({"projectId":null}))),
                ("GET", "/state", None),
                (
                    "PATCH",
                    "/state",
                    Some(json!({"proof.checkpoint":"corrupted"})),
                ),
            ] {
                gateway.api.expect(
                    method,
                    &format!("{path}{suffix}"),
                    Some(stranger),
                    body,
                    404,
                )?;
                checked += 1;
            }
            gateway.api.expect("GET", &path, None, None, 401)?;
            gateway
                .api
                .expect("GET", &state, Some("invalid-token"), None, 401)?;
            checked += 2;
            let after = gateway.api.json("GET", &path, Some(auth), None, 200)?;
            // Compare the complete resource, so denied writes cannot silently change metadata.
            ensure!(
                after == before,
                "denied operation changed an owned resource"
            );
            ensure!(after["name"] == name.as_str(), "name changed");
            let recovered = gateway.api.json("GET", &state, Some(auth), None, 200)?;
            ensure!(
                recovered["proof.checkpoint"] == marker,
                "denied state write changed data"
            );
            let list = gateway
                .api
                .json("GET", "/api/sessions", Some(stranger), None, 200)?;
            ensure!(
                !list["sessions"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .any(|s| s["id"] == id.as_str()),
                "foreign session leaked in list"
            );
        }
        // Gateway::restart kills the owned process group before relaunching on the same DB.
        gateway.restart()?;
        for (index, (id, name)) in sessions.iter().enumerate() {
            let auth = if index == 0 { &token } else { &other };
            let session =
                gateway
                    .api
                    .json("GET", &format!("/api/sessions/{id}"), Some(auth), None, 200)?;
            ensure!(
                session["name"] == name.as_str(),
                "session did not survive restart"
            );
            let state = gateway.api.json(
                "GET",
                &format!("/api/sessions/{id}/state"),
                Some(auth),
                None,
                200,
            )?;
            let expected = json!({"generation":generation,"owner":index,"text":"α🙂終\nretained", "ordered":[3,1,2],"nested":{"enabled":true,"empty":null}});
            ensure!(
                state["proof.checkpoint"] == expected,
                "committed structured checkpoint changed across crash"
            );
        }
    }
    fs::write(
        directory.join("summary.json"),
        serde_json::to_vec_pretty(
            &json!({"success":true,"principals":2,"crash_restarts":3,"denied_requests":checked,"invariants":["foreign reads denied","foreign writes leave complete resources unchanged","foreign session lists isolated","committed state survives abrupt restart"]}),
        )?,
    )?;
    Ok(())
}
