//! Crypto startup replacement evidence for the Node-only crypto-polyfill.ts.
//! No Rust polyfill is needed: the canonical JWT implementation is ready before
//! the gateway starts, without a Tokio runtime or global initialization call.
use jait_gateway::security::{http_auth, preview_token};

#[test]
fn native_crypto_is_ready_without_gateway_or_runtime_initialization() {
    // Execute on ordinary OS threads to exercise simultaneous first use. The
    // Rust test harness starts a fresh executable for this focused target.
    let workers: Vec<_> = (0..8)
        .map(|index| {
            std::thread::spawn(move || {
                let user = http_auth::AuthUser {
                    id: format!("crypto-startup-{index}"),
                    username: "資料 🦀".into(),
                };
                let secret = format!("private-test-key-{index}");
                let now = 1_700_000_000;
                let token = http_auth::sign_auth_token_at(&user, &secret, now).unwrap();
                let verified = http_auth::verify_auth_token_at(&token, &secret, now)
                    .expect("HS256 available on first use");
                assert_eq!(verified, user);
                assert!(http_auth::verify_auth_token_at(&token, "wrong-key", now).is_none());
                assert!(
                    http_auth::verify_auth_token_at(&token, &secret, now + 366 * 24 * 60 * 60)
                        .is_none()
                );

                let preview =
                    preview_token::sign_preview_token_at(&user.id, "preview:startup", &secret, now)
                        .unwrap();
                assert_eq!(
                    preview_token::verify_preview_token_at(
                        &preview,
                        "preview:startup",
                        &secret,
                        now
                    )
                    .as_deref(),
                    Some(user.id.as_str())
                );
                assert!(
                    preview_token::verify_preview_token_at(
                        &preview,
                        "preview:foreign",
                        &secret,
                        now
                    )
                    .is_none()
                );
                assert!(
                    preview_token::sign_preview_token_at(&user.id, "preview:startup", "", now)
                        .is_err()
                );
            })
        })
        .collect();
    for worker in workers {
        worker
            .join()
            .expect("crypto worker completes without startup dependency");
    }
}

use jait_gateway::runtime::api_contracts as wire;
use serde::{Serialize, de::DeserializeOwned};
use serde_json::{Value, json};

fn round_trip<T: DeserializeOwned + Serialize>(value: Value) {
    let native: T = serde_json::from_value(value.clone()).expect("shared wire fixture decodes");
    assert_eq!(serde_json::to_value(native).unwrap(), value);
}

#[test]
fn shared_api_request_and_response_shapes_preserve_omission_and_null() {
    round_trip::<wire::ProviderInfo>(json!({
        "id":"codex-account","name":"Codex","description":"CLI",
        "available":true,"modes":["supervised","full-access"],
        "auth":{"login":true,"logout":true,"deviceCode":false,"authenticated":null},
        "update":{"currentVersion":"1","latestVersion":"2","updateAvailable":true,"checkedAt":"now"},
        "nodeId":"gateway"
    }));
    round_trip::<wire::ProviderLoginResult>(json!({
        "ok":true,"status":"started","providerId":"codex","message":"Ready",
        "verificationUri":"https://example.invalid","requiresCodeInput":false
    }));
    round_trip::<wire::ProviderLogoutResult>(json!({
        "ok":true,"status":"completed","providerId":"codex","message":"Done"
    }));
    round_trip::<wire::ProviderModelInfo>(json!({
        "id":"model","name":"Model","supportedReasoningEfforts":[
            {"reasoningEffort":"high"},{"reasoningEffort":"low","description":"Fast"}
        ],"pricing":{"promptPerMTok":0.0,"completionPerMTok":2.5}
    }));
    round_trip::<wire::ThreadActivity>(json!({
        "id":"a","threadId":"t","kind":"custom","summary":"summary","payload":null,"createdAt":"now"
    }));
    round_trip::<wire::CreateThreadParams>(json!({
        "title":"Review","providerId":"codex","runtimeMode":"supervised",
        "reasoningEffort":null,"skillIds":null,"prBaseBranch":null
    }));
    round_trip::<wire::UpdateThreadParams>(json!({
        "model":null,"workingDirectory":null,"branch":null,"skillIds":[],
        "status":"blocked","prNumber":12.0,"executionNodeId":null,
        "routingPlan":{"intent":"review","reason":"inspect","suggestedSkillIds":[],
                       "topology":"single","routedAt":"now"}
    }));
    round_trip::<wire::PlanTask>(json!({
        "id":"task","title":"Fix","description":"Fix issue","status":"proposed",
        "dependsOn":[],"skillCandidate":false
    }));
    round_trip::<wire::CreateRepoRequest>(json!({"name":"Repo","localPath":"/owned/repo"}));
    round_trip::<wire::UpdateRepoRequest>(json!({"deviceId":null,"strategy":null,"forgeUrl":""}));
    round_trip::<wire::CreateJaitTodoRequest>(json!({
        "message":"Review","dueDate":null,"sourceThreadId":null,"tags":[],
        "status":"in_progress","priority":"high"
    }));
    round_trip::<wire::UpdateJaitTodoRequest>(json!({"message":"","dueDate":null,"status":"done"}));

    // Canonical auth status is reused directly, not independently mirrored.
    let status = wire::ProviderAuthStatus {
        capabilities: jait_gateway::providers::provider_auth::ProviderAuthCapabilities {
            login: true,
            logout: false,
            device_code: true,
        },
        authenticated: None,
        detail: None,
        username: None,
    };
    assert_eq!(
        serde_json::to_value(status).unwrap(),
        json!({
            "login":true,"logout":false,"deviceCode":true,"authenticated":null
        })
    );
}

#[test]
fn api_contracts_reject_status_confusion_and_nonnullable_fields() {
    assert!(
        serde_json::from_value::<wire::ProviderLogoutResult>(json!({
            "ok":true,"status":"started","providerId":"p","message":""
        }))
        .is_err()
    );
    assert!(
        serde_json::from_value::<wire::CreateRepoRequest>(json!({
            "name":"r","localPath":"/r","deviceId":null
        }))
        .is_err()
    );
    assert!(
        serde_json::from_value::<wire::UpdateThreadParams>(json!({
            "runtimeMode":"guarded"
        }))
        .is_err()
    );
    assert!(
        serde_json::from_value::<wire::ProviderModelInfo>(json!({
            "id":42,"name":"model"
        }))
        .is_err()
    );
    for value in ["draft", "active", "completed", "archived"] {
        round_trip::<wire::PlanStatus>(json!(value));
    }
    for value in ["proposed", "approved", "running", "completed", "skipped"] {
        round_trip::<wire::PlanTaskStatus>(json!(value));
    }
    for value in [
        "idle",
        "running",
        "completed",
        "error",
        "blocked",
        "interrupted",
    ] {
        round_trip::<wire::ThreadStatus>(json!(value));
    }
    assert!(serde_json::from_value::<wire::PlanStatus>(json!("executing")).is_err());
}
