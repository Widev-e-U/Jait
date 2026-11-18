//! Rust assertions exercise real authenticated gateway WebSockets through a bounded Bun transport fixture.
use serde_json::Value;
use std::{path::PathBuf, process::Command};

fn events<'a>(messages: &'a Value, kind: &str) -> Vec<&'a Value> {
    messages
        .as_array()
        .unwrap()
        .iter()
        .filter(|e| e["type"] == kind)
        .collect()
}

#[test]
fn reading_chat_revokes_only_its_owners_exact_notification_over_websocket() {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
    let output = Command::new(std::env::var("JAIT_CONTRACT_BUN").unwrap_or_else(|_| "bun".into()))
        .arg(root.join("tests/contract/drivers/notification-sync.ts"))
        .current_dir(&root)
        .output()
        .expect("start bounded WebSocket fixture");
    assert!(
        output.status.success(),
        "fixture failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    let result: Value = serde_json::from_slice(&output.stdout).expect("fixture JSON");
    let cleared = events(&result["afterRead"]["phone"], "notification.cleared");
    assert_eq!(
        cleared.len(),
        1,
        "reading on desktop must revoke the phone notification"
    );
    assert_eq!(cleared[0]["sessionId"], "owned-chat");
    assert_eq!(cleared[0]["payload"]["id"], "completion-1");
    assert_eq!(
        cleared[0]["payload"]["replaceId"],
        "chat-complete:owned-chat"
    );
    assert_eq!(
        events(&result["afterRead"]["other"], "notification.cleared").len(),
        0
    );
    assert_eq!(
        events(&result["afterRead"]["other"], "notification").len(),
        0
    );
    assert_eq!(result["afterRead"]["pushes"].as_array().unwrap().len(), 1);
    assert_eq!(result["afterRead"]["pushes"][0]["user"], "owner");
    assert_eq!(
        result["afterStale"]["pushes"].as_array().unwrap().len(),
        1,
        "stale reads must not clear a new reply"
    );
    let snapshot = events(&result["resumed"], "notification.snapshot");
    assert_eq!(snapshot.len(), 1);
    assert_eq!(
        snapshot[0]["payload"]["notifications"][0]["id"],
        "completion-2"
    );
    assert_eq!(snapshot[0]["payload"]["notifications"][0]["read"], false);
    assert_eq!(
        result["pushes"].as_array().unwrap().len(),
        2,
        "duplicate reads must be idempotent"
    );
    assert_eq!(events(&result["final"], "notification.cleared").len(), 2);
    let snapshot = events(&result["reconnect"], "notification.snapshot");
    assert_eq!(
        snapshot[0]["payload"]["notifications"][0]["read"], true,
        "reconnect must reconcile a missed dismissal"
    );
    assert_eq!(
        events(&result["anonymous"], "error")[0]["payload"]["code"],
        "UNAUTHORIZED"
    );
}
