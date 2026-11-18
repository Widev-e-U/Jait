//! Rust owns verdicts over the production TypeScript cache and authenticated route.
#[path = "../src/internal_driver.rs"]
mod internal_driver;
use serde_json::{Value, json};
use std::{fs, path::PathBuf};

fn observe(call: Value) -> Value {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
    let directory = root
        .join(".jait/artifacts/usage-refresh-contracts")
        .join(uuid::Uuid::new_v4().to_string());
    fs::create_dir_all(&directory).unwrap();
    internal_driver::call(
        &root,
        &directory,
        json!({"version":1,"calls":[call]}),
        &|| false,
    )
    .unwrap()[0]
        .clone()
}

#[test]
fn five_minute_freshness_has_exact_boundaries_and_manual_refresh_always_reloads() {
    let result = observe(json!({"op":"usagerefresh.steps","steps":[
        {"key":"alice","at":0,"value":10},
        {"key":"alice","at":29999,"force":true,"value":20},
        {"key":"alice","at":30000,"force":true,"value":30},
        {"key":"alice","at":329999,"value":40},
        {"key":"alice","at":330000,"value":50}
    ]}));
    assert_eq!(
        result,
        json!([
            {"loads":1,"value":10,"failed":false}, {"loads":2,"value":20,"failed":false},
            {"loads":3,"value":30,"failed":false}, {"loads":3,"value":30,"failed":false},
            {"loads":4,"value":50,"failed":false}
        ])
    );
}

#[test]
fn concurrent_requests_share_work_even_when_one_is_forced() {
    let result = observe(json!({"op":"usagerefresh.concurrent","value":{"quota":42}}));
    assert_eq!(
        result,
        json!({"before":1,"loads":1,"results":[{"quota":42},{"quota":42}]})
    );
}

#[test]
fn automatic_failure_backoff_has_exact_boundaries_and_users_are_independent() {
    let result = observe(json!({"op":"usagerefresh.steps","steps":[
        {"key":"alice","at":0,"failure":"payload","value":10},
        {"key":"alice","at":599999,"value":20},
        {"key":"bob","at":599999,"value":30},
        {"key":"alice","at":600000,"failure":"throw"},
        {"key":"alice","at":1799999,"value":40},
        {"key":"alice","at":1800000,"value":50}
    ]}));
    assert_eq!(
        result,
        json!([
            {"loads":1,"value":10,"failed":true}, {"loads":1,"value":10,"failed":true},
            {"loads":2,"value":30,"failed":false}, {"loads":3,"error":"provider unavailable"},
            {"loads":3,"error":"provider unavailable"}, {"loads":4,"value":50,"failed":false}
        ])
    );
}

#[test]
fn manual_refresh_retries_payload_and_thrown_failures_without_a_cooldown() {
    let result = observe(json!({"op":"usagerefresh.steps","steps":[
        {"key":"alice","at":0,"failure":"payload","value":10},
        {"key":"alice","at":1,"force":true,"failure":"throw"},
        {"key":"alice","at":2,"value":20},
        {"key":"alice","at":2,"force":true,"failure":"payload","value":30},
        {"key":"alice","at":3,"force":true,"value":40},
        {"key":"alice","at":4,"value":50}
    ]}));
    assert_eq!(
        result,
        json!([
            {"loads":1,"value":10,"failed":true}, {"loads":2,"error":"provider unavailable"},
            {"loads":2,"error":"provider unavailable"}, {"loads":3,"value":30,"failed":true},
            {"loads":4,"value":40,"failed":false}, {"loads":4,"value":40,"failed":false}
        ])
    );
}

#[test]
fn authenticated_route_shares_refresh_and_keeps_newer_passive_quotas() {
    let result = observe(json!({"op":"usagerefresh.route",
        "html":"<div data-usage-meter><div data-usage-track aria-label=\"Session usage: 40%\"></div></div><div data-time=\"2026-10-09T12:00:00Z\"></div><div data-usage-meter><div data-usage-track aria-label=\"Weekly usage: 80%\"></div></div>",
        "quota":{"accountId":"jait-backend:alice:ollama","providerType":"ollama","rateLimitType":"five_hour","utilization":0.51,"updatedAt":"2026-10-17T22:00:00Z","models":[]}
    }));
    assert_eq!(result["anonymous"], 401);
    assert_eq!(result["snapshotStatus"], 200);
    assert_eq!(result["during"], 1);
    assert_eq!(result["statuses"], json!([200, 200]));
    assert_eq!(
        result["afterReopen"], 2,
        "manual refresh reloads after a cached reopen"
    );
    assert_eq!(
        result["reopened"]["profiles"][0]["quotas"][0]["utilization"],
        0.51
    );
    assert_eq!(result["bob"]["profiles"][0]["quotas"], json!([]));
    assert_eq!(
        result["loads"], 4,
        "manual refresh, another user and changed credentials each load independently"
    );
    assert_eq!(
        result["records"], 4,
        "cached reads must not rewrite observation timestamps"
    );
    assert!(!result.to_string().contains("fixture-cookie"));
}
