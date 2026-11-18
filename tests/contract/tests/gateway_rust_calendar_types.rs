#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::services::calendar::*;
use serde::{Serialize, de::DeserializeOwned};
use serde_json::{Value, json};
use std::path::PathBuf;
fn fixtures() -> Value {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap();
    internal_driver::call(&root,&root.join(".jait/artifacts/gateway-rust/parallel-20261020/calendar-types/contracts"),json!({"version":1,"calls":[{"op":"nativecalendartypes.fixtures"},{"op":"nativecalendartypes.exports"}]}),&||false).unwrap()
}
fn check<T: DeserializeOwned + Serialize>(values: &Value) {
    for input in values.as_array().unwrap() {
        let typed: T = serde_json::from_value(input.clone()).unwrap();
        let output: Value = serde_json::from_str(&serde_json::to_string(&typed).unwrap()).unwrap();
        assert_eq!(&output, input);
    }
}
#[test]
fn all_declared_calendar_records_preserve_wire_shape() {
    let fixture = fixtures();
    let fixture = &fixture[0];
    check::<CalendarAccount>(&fixture["accounts"]);
    check::<CalendarTokens>(&fixture["tokens"]);
    check::<CalendarInfo>(&fixture["calendars"]);
    check::<CalendarEvent>(&fixture["events"]);
    check::<ListCalendarEventsOptions>(&fixture["options"]);
    check::<DeviceCalendarSnapshot>(&fixture["snapshots"]);
}
#[test]
fn calendar_entry_point_reexports_the_same_implemented_service() {
    assert_eq!(
        std::any::TypeId::of::<CalendarService>(),
        std::any::TypeId::of::<jait_gateway::services::calendar::service::CalendarService>()
    );
    assert_eq!(
        fixtures()[1],
        json!({"exports":["CalendarService"],"serviceIdentity":true,"typesRuntimeExports":[]})
    );
}
#[test]
fn reference_dto_fixtures_typecheck_against_actual_typescript_interfaces() {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap();
    let script = root.join("node_modules/typescript/bin/tsc");
    // Check the actual TypeScript interfaces; this emits no generated files.
    let result = std::process::Command::new("node")
        .arg(script)
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
        .arg(root.join("tests/contract/drivers/nativecalendartypes.ts"))
        .current_dir(&root)
        .output()
        .unwrap();
    assert!(
        result.status.success(),
        "{}{}",
        String::from_utf8_lossy(&result.stdout),
        String::from_utf8_lossy(&result.stderr)
    );
}
