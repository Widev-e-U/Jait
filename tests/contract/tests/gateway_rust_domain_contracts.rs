#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::{scheduler::contracts as scheduler, security::contracts as security};
use serde::{Serialize, de::DeserializeOwned};
use serde_json::{Value, json};
use std::{path::PathBuf, process::Command};
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}
fn fixtures() -> Value {
    let root = root();
    internal_driver::call(&root,&root.join(".jait/artifacts/gateway-rust/parallel-20261020/domain-contracts/contracts"),json!({"version":1,"calls":[{"op":"nativedomaincontracts.fixtures"},{"op":"nativedomaincontracts.exports"}]}),&||false).unwrap()
}
fn roundtrip<T: DeserializeOwned + Serialize>(input: &Value) {
    for value in input.as_array().unwrap() {
        let typed: T = serde_json::from_value(value.clone()).unwrap();
        assert_eq!(serde_json::to_value(typed).unwrap(), *value);
    }
}
#[test]
fn public_security_and_scheduler_records_match_the_typed_reference() {
    let values = fixtures();
    let values = &values[0];
    roundtrip::<security::TrustLevel>(&values["trust"]);
    roundtrip::<security::ConsentRequest>(&values["requests"]);
    roundtrip::<security::ConsentDecision>(&values["decisions"]);
    roundtrip::<security::AuditRecord>(&values["audit"]);
    roundtrip::<scheduler::ScheduledJob>(&values["jobs"]);
    roundtrip::<scheduler::CreateScheduledJob>(&values["create"]);
}
#[test]
fn declared_interfaces_are_type_only_and_fixtures_typecheck() {
    assert_eq!(fixtures()[1], json!({"security":[],"scheduler":[]}));
    let root = root();
    let result = Command::new("node")
        .arg(root.join("node_modules/typescript/bin/tsc"))
        .args([
            "--noEmit",
            "--strict",
            "--target",
            "ES2022",
            "--module",
            "ESNext",
            "--moduleResolution",
            "bundler",
            "--skipLibCheck",
        ])
        .arg(root.join("tests/contract/drivers/nativedomaincontracts.ts"))
        .current_dir(root)
        .output()
        .unwrap();
    assert!(
        result.status.success(),
        "{}{}",
        String::from_utf8_lossy(&result.stdout),
        String::from_utf8_lossy(&result.stderr)
    );
}
#[test]
fn native_service_traits_preserve_async_arguments_and_result_types() {
    fn signatures<S: security::SecurityService, C: scheduler::SchedulerService>(
        security: &mut S,
        scheduler: &mut C,
    ) {
        let request = security::ConsentRequest {
            action_id: "".into(),
            tool_name: "".into(),
            summary: "".into(),
            risk: security::Risk::Low,
            created_at: "".into(),
            expires_at: None,
        };
        let _: futures_placeholder::SecurityConsent<'_, S::Error> =
            security.request_consent(request);
        // Each temporary is dropped before the next mutable borrow, like sequential source calls.
        drop(security.record_audit(security::AuditRecord {
            action_id: "".into(),
            session_id: "".into(),
            tool_name: "".into(),
            status: security::AuditStatus::Started,
            input: "".into(),
            output: None,
            timestamp: "".into(),
        }));
        let _: futures_placeholder::Future<'_, Result<security::TrustLevel, S::Error>> =
            security.get_trust_level("operator");
        let _: futures_placeholder::Future<'_, Result<scheduler::ScheduledJob, C::Error>> =
            scheduler.create(scheduler::CreateScheduledJob {
                name: "".into(),
                cron: "".into(),
                enabled: true,
            });
        let _: futures_placeholder::Future<'_, Result<Vec<scheduler::ScheduledJob>, C::Error>> =
            scheduler.list();
        let _: futures_placeholder::Future<'_, Result<bool, C::Error>> = scheduler.remove("id");
        let _: futures_placeholder::Future<'_, Result<(), C::Error>> = scheduler.trigger("id");
    }
    // A generic typecheck is sufficient: this module adds no engine implementation to execute.
    struct NoEngine;
    impl security::SecurityService for NoEngine {
        type Error = String;
        fn request_consent(
            &mut self,
            _: security::ConsentRequest,
        ) -> futures_placeholder::SecurityConsent<'_, String> {
            unreachable!()
        }
        fn record_audit(
            &mut self,
            _: security::AuditRecord,
        ) -> futures_placeholder::Future<'_, Result<(), String>> {
            unreachable!()
        }
        fn get_trust_level<'a>(
            &'a mut self,
            _: &'a str,
        ) -> futures_placeholder::Future<'a, Result<security::TrustLevel, String>> {
            unreachable!()
        }
    }
    impl scheduler::SchedulerService for NoEngine {
        type Error = String;
        fn create(
            &mut self,
            _: scheduler::CreateScheduledJob,
        ) -> futures_placeholder::Future<'_, Result<scheduler::ScheduledJob, String>> {
            unreachable!()
        }
        fn list(
            &mut self,
        ) -> futures_placeholder::Future<'_, Result<Vec<scheduler::ScheduledJob>, String>> {
            unreachable!()
        }
        fn remove<'a>(
            &'a mut self,
            _: &'a str,
        ) -> futures_placeholder::Future<'a, Result<bool, String>> {
            unreachable!()
        }
        fn trigger<'a>(
            &'a mut self,
            _: &'a str,
        ) -> futures_placeholder::Future<'a, Result<(), String>> {
            unreachable!()
        }
    }
    let _checked = signatures::<NoEngine, NoEngine>;
}
mod futures_placeholder {
    pub type Future<'a, T> = std::pin::Pin<Box<dyn std::future::Future<Output = T> + Send + 'a>>;
    pub type SecurityConsent<'a, E> =
        Future<'a, Result<Option<jait_gateway::security::contracts::ConsentDecision>, E>>;
}
