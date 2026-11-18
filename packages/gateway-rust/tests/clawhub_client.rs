//! Focused checks for the dedicated client entry point; no network is used.
pub use jait_gateway::integrations;
#[path = "../src/clawhub/client.rs"]
#[allow(unused_imports)]
mod client;

use client::{ClawHubClient, decode_zip, validate_slug};
use jait_gateway::execution::process_runner::ProcessCancellation;
use jait_gateway::integrations::skills::{
    SkillResult,
    install::{SkillAuthority, SkillEffect},
};

struct Deny;
impl SkillAuthority for Deny {
    fn authorize(&self, _: SkillEffect<'_>) -> SkillResult<()> {
        panic!("cancelled requests must not reach authorization")
    }
}

#[test]
fn rejects_private_registries_and_unsafe_slugs() {
    for registry in [
        "http://127.0.0.1",
        "https://[::1]",
        "https://localhost",
        "file:///x",
        "https://user:pw@clawhub.ai",
    ] {
        assert!(ClawHubClient::new(Some(registry)).is_err(), "{registry}");
    }
    for slug in ["../x", "a/b", "x%2fy", ".", ""] {
        assert!(validate_slug(slug).is_err(), "{slug}");
    }
    assert!(validate_slug("my-skill_2").is_ok());
}

#[tokio::test]
async fn cancelled_operations_stop_before_network_or_authority() {
    let client = ClawHubClient::new(None).unwrap();
    let cancel = ProcessCancellation::default();
    cancel.cancel();
    assert!(
        client
            .search_skills("test", None, &Deny, &cancel)
            .await
            .unwrap_err()
            .contains("cancelled")
    );
    assert!(
        client
            .list_skills(None, None, None, &Deny, &cancel)
            .await
            .unwrap_err()
            .contains("cancelled")
    );
    assert!(
        client
            .get_skill("test", &Deny, &cancel)
            .await
            .unwrap_err()
            .contains("cancelled")
    );
    assert!(
        client
            .download_skill("test", None, &Deny, &cancel)
            .await
            .unwrap_err()
            .contains("cancelled")
    );
    assert!(
        client
            .list_packages(None, &Deny, &cancel)
            .await
            .unwrap_err()
            .contains("cancelled")
    );
    assert!(
        decode_zip(b"bad", &cancel)
            .unwrap_err()
            .contains("cancelled")
    );
}

#[derive(Default)]
struct RecordAndDeny(std::sync::Mutex<Vec<(String, bool)>>);
impl SkillAuthority for RecordAndDeny {
    fn authorize(&self, effect: SkillEffect<'_>) -> SkillResult<()> {
        match effect {
            SkillEffect::RegistryRead { url, download } => {
                self.0.lock().unwrap().push((url.to_string(), download));
                Err("denied for test".into())
            }
            _ => panic!("unexpected effect"),
        }
    }
}

#[tokio::test]
async fn requests_authorize_the_exact_url_before_dns() {
    let client = ClawHubClient::new(Some("https://clawhub.ai/prefix/")).unwrap();
    let cancel = ProcessCancellation::default();
    let authority = RecordAndDeny::default();
    assert!(
        client
            .search_skills("a & b", None, &authority, &cancel)
            .await
            .is_err()
    );
    assert!(
        client
            .list_skills(
                Some(client::SkillSort::InstallsAllTime),
                Some(7),
                Some("a+b"),
                &authority,
                &cancel
            )
            .await
            .is_err()
    );
    assert!(
        client
            .get_skill("my-skill", &authority, &cancel)
            .await
            .is_err()
    );
    assert!(
        client
            .download_skill("my-skill", Some("1+2"), &authority, &cancel)
            .await
            .is_err()
    );
    assert!(
        client
            .list_packages(Some(9), &authority, &cancel)
            .await
            .is_err()
    );
    assert_eq!(
        *authority.0.lock().unwrap(),
        vec![
            (
                "https://clawhub.ai/api/v1/search?q=a+%26+b&limit=20".into(),
                false
            ),
            (
                "https://clawhub.ai/api/v1/skills?sort=installsAllTime&limit=7&cursor=a%2Bb".into(),
                false
            ),
            ("https://clawhub.ai/api/v1/skills/my-skill".into(), false),
            (
                "https://clawhub.ai/api/v1/download?slug=my-skill&version=1%2B2".into(),
                true
            ),
            ("https://clawhub.ai/api/v1/plugins?limit=9".into(), false),
        ]
    );
}

#[tokio::test]
async fn empty_optional_query_values_are_omitted_like_typescript() {
    let client = ClawHubClient::new(None).unwrap();
    let authority = RecordAndDeny::default();
    let cancel = ProcessCancellation::default();
    assert!(
        client
            .list_skills(None, None, Some(""), &authority, &cancel)
            .await
            .is_err()
    );
    assert!(
        client
            .download_skill("my-skill", Some(""), &authority, &cancel)
            .await
            .is_err()
    );
    assert_eq!(
        *authority.0.lock().unwrap(),
        vec![
            ("https://clawhub.ai/api/v1/skills".into(), false),
            (
                "https://clawhub.ai/api/v1/download?slug=my-skill".into(),
                true
            ),
        ]
    );
}

#[test]
fn response_dtos_preserve_missing_null_unknown_and_drifted_fields() {
    use client::{ClawHubSearchResult, ClawHubSkillDetail, ClawHubSkillList};
    use serde_json::Value;
    let cases: Vec<Value> =
        serde_json::from_str(include_str!("fixtures/clawhub-response-cases.json")).unwrap();
    for case in cases {
        let raw = case["response"].clone();
        let roundtrip = match case["method"].as_str().unwrap() {
            "search" => {
                let Some(items) = raw.get("results").and_then(Value::as_array) else {
                    continue;
                };
                let parsed: Vec<ClawHubSearchResult> =
                    serde_json::from_value(Value::Array(items.clone())).unwrap();
                for (item, original) in parsed.iter().zip(items) {
                    assert_eq!(item.as_json(), original, "{}", case["name"]);
                }
                serde_json::to_value(parsed).unwrap()
            }
            "detail" => {
                let parsed: ClawHubSkillDetail = serde_json::from_value(raw.clone()).unwrap();
                assert_eq!(parsed.as_json(), &raw);
                if let Some(version) = &parsed.latest_version {
                    assert_eq!(version.as_json(), &raw["latestVersion"]);
                }
                serde_json::to_value(parsed).unwrap()
            }
            "list" => {
                let parsed: ClawHubSkillList = serde_json::from_value(raw.clone()).unwrap();
                assert_eq!(parsed.as_json(), &raw);
                serde_json::to_value(parsed).unwrap()
            }
            "packages" => continue, // Canonical decoder fixture test covers unwrapped arrays.
            _ => panic!("unknown fixture method"),
        };
        assert_eq!(roundtrip, case["expected"], "{}", case["name"]);
    }
}

#[tokio::test]
async fn drifted_detail_versions_never_become_unvalidated_download_inputs() {
    use client::ClawHubSkillDetail;
    use serde_json::json;
    // Match the existing installer's selection expression without changing that
    // consumer. Missing/non-string projections have no usable version.
    for raw in [
        json!({}),
        json!({"latestVersion": null}),
        json!({"latestVersion": {}}),
        json!({"latestVersion": {"version": null}}),
        json!({"latestVersion": {"version": 42}}),
        json!({"latestVersion": {"version": false}}),
        json!({"latestVersion": "remote"}),
    ] {
        let detail: ClawHubSkillDetail = serde_json::from_value(raw.clone()).unwrap();
        let selected = detail
            .latest_version
            .map(|v| v.version)
            .filter(|v| !v.is_empty());
        assert_eq!(selected, None, "{raw}");
    }
    let client = ClawHubClient::new(None).unwrap();
    let authority = RecordAndDeny::default();
    let cancel = ProcessCancellation::default();
    for version in ["bad\nversion".to_owned(), "v".repeat(257)] {
        let detail: ClawHubSkillDetail = serde_json::from_value(json!({
            "latestVersion": {"version": version, "futureField": true}
        }))
        .unwrap();
        let version = detail.latest_version.unwrap().version;
        assert_eq!(
            client
                .download_skill("safe", Some(&version), &authority, &cancel)
                .await
                .unwrap_err(),
            "Invalid ClawHub version"
        );
    }
    assert!(
        authority.0.lock().unwrap().is_empty(),
        "invalid versions must stop before authorization/DNS"
    );
}
