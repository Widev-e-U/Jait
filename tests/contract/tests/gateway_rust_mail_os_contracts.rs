#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::{
    integrations::os_control::contracts as os, services::email::contracts as email,
};
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
    internal_driver::call(&root,&root.join(".jait/artifacts/gateway-rust/mail-os-contracts").join(uuid::Uuid::new_v4().to_string()),json!({"version":1,"calls":[{"op":"nativemailoscontracts.fixtures"},{"op":"nativemailoscontracts.exports"}]}),&||false).unwrap()
}
fn roundtrip<T: Serialize + DeserializeOwned>(values: &Value) {
    for value in values.as_array().unwrap() {
        let typed: T = serde_json::from_value(value.clone()).unwrap();
        assert_eq!(serde_json::to_value(typed).unwrap(), *value);
    }
}
#[test]
fn email_records_and_optional_nullable_fields_match_compiler_bound_source() {
    let f = fixtures();
    let f = &f[0];
    roundtrip::<email::EmailProvider>(&f["providers"]);
    roundtrip::<email::OAuthEmailProvider>(&f["oauth"]);
    roundtrip::<email::EmailAccount>(&f["accounts"]);
    roundtrip::<email::EmailTokens>(&f["tokens"]);
    roundtrip::<email::EmailMessageSummary>(&f["summaries"]);
    roundtrip::<email::EmailMessageFull>(&f["full"]);
    roundtrip::<email::EmailFolder>(&f["folders"]);
    roundtrip::<email::ListMessagesOptions>(&f["list"]);
    roundtrip::<email::SendMessageInput>(&f["send"]);
    roundtrip::<email::MailServerConfig>(&f["servers"]);
    roundtrip::<email::ConnectMailboxInput>(&f["connect"]);
    roundtrip::<email::EmailAccountSettings>(&f["settings"]);
    roundtrip::<email::DiscoveredMailSettings>(&f["discovered"]);
    assert!(serde_json::from_value::<email::OAuthEmailProvider>(json!("imap")).is_err());
    assert!(serde_json::from_value::<email::EmailProvider>(json!("unknown")).is_err());
    let mut invalid = f["accounts"][0].clone();
    invalid["error"] = json!(42);
    assert!(serde_json::from_value::<email::EmailAccount>(invalid).is_err());
}
#[test]
fn os_options_buffer_encoding_and_nonfinite_number_wire_forms_match() {
    let f = fixtures();
    let f = &f[0];
    roundtrip::<os::OsDriverType>(&f["os"]);
    roundtrip::<os::OsScreenshot>(&f["screenshots"]);
    roundtrip::<os::OsClickOptions>(&f["click"]);
    roundtrip::<os::OsTypeOptions>(&f["type"]);
    roundtrip::<os::OsKeyOptions>(&f["key"]);
    roundtrip::<os::OsScrollOptions>(&f["scroll"]);
    roundtrip::<os::OsExecOptions>(&f["exec"]);
    roundtrip::<os::SandboxRunResult>(&f["result"]);
    for invalid in [
        json!({"type":"Uint8Array","data":[1]}),
        json!({"type":"Buffer","data":[256]}),
        json!({"type":"Buffer","data":[-1]}),
    ] {
        assert!(serde_json::from_value::<os::PngBuffer>(invalid).is_err());
    }
    assert!(serde_json::from_value::<os::OsClickOptions>(json!({"button":"secondary"})).is_err());
    let value = os::OsScreenshot {
        png: os::PngBuffer(vec![]),
        width: f64::INFINITY,
        height: -0.0,
    };
    assert_eq!(
        serde_json::to_value(value).unwrap(),
        json!({"png":{"type":"Buffer","data":[]},"width":null,"height":0})
    );
}
#[test]
fn actual_type_modules_export_no_runtime_values_and_positive_negative_fixtures_compile() {
    assert_eq!(fixtures()[1], json!({"email":[],"os":[]}));
    let root = root();
    let cache = root.join("node_modules/.bun");
    let mut type_roots = std::fs::read_dir(cache)
        .unwrap()
        .flatten()
        .filter(|p| p.file_name().to_string_lossy().starts_with("@types+node@"))
        .map(|p| p.path().join("node_modules/@types"))
        .filter(|p| p.join("node/index.d.ts").is_file())
        .collect::<Vec<_>>();
    type_roots.sort();
    let node_types = type_roots
        .last()
        .expect("installed Node type package is required for Buffer and process contracts");
    let output = Command::new("node")
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
            "--allowImportingTsExtensions",
        ])
        .args(["--types", "node", "--typeRoots"])
        .arg(node_types)
        .arg(root.join("tests/contract/drivers/nativemailoscontracts.ts"))
        .current_dir(root)
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "{}{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
}
#[test]
fn native_mailbox_desktop_driver_signatures_and_binding_fields_are_checked() {
    fn _mail<M: email::MailboxClient>(mail: &M) {
        let _: futures_util::future::BoxFuture<
            '_,
            Result<Vec<email::EmailMessageSummary>, M::Error>,
        > = mail.list_messages(
            "test-only",
            email::ListMessagesOptions {
                folder: None,
                query: None,
                limit: Some(f64::NAN),
            },
        );
        let _: futures_util::future::BoxFuture<'_, Result<email::EmailMessageFull, M::Error>> =
            mail.get_message("test-only", "id");
        let _: futures_util::future::BoxFuture<'_, Result<email::SentMessage, M::Error>> = mail
            .send_message(
                "test-only",
                email::SendMessageInput {
                    to: "".into(),
                    subject: "".into(),
                    body: "".into(),
                    cc: None,
                    bcc: None,
                    reply_to_message_id: None,
                    html: None,
                    include_signature: None,
                },
            );
        let _: futures_util::future::BoxFuture<'_, Result<(), M::Error>> =
            mail.tag_message("test-only", "id", vec![], vec![]);
        let _: futures_util::future::BoxFuture<'_, Result<(), M::Error>> =
            mail.delete_message("test-only", "id");
        let _: futures_util::future::BoxFuture<'_, Result<Vec<email::EmailFolder>, M::Error>> =
            mail.list_folders("test-only");
        let _: futures_util::future::BoxFuture<'_, Result<String, M::Error>> =
            mail.get_profile_email("test-only");
    }
    fn _os<D: os::OsControlDriver>(driver: &D, binding: &os::OsDriverBinding<D>) {
        let _: os::OsDriverType = driver.os_type();
        let _: futures_util::future::BoxFuture<'_, Result<os::OsScreenshot, D::Error>> =
            driver.screenshot();
        let _: futures_util::future::BoxFuture<'_, Result<(), D::Error>> =
            driver.click(f64::NAN, f64::INFINITY, None);
        let _: futures_util::future::BoxFuture<'_, Result<(), D::Error>> =
            driver.mouse_move(1.0, 2.0);
        let _: futures_util::future::BoxFuture<'_, Result<(), D::Error>> =
            driver.r#type("text", None);
        let _: futures_util::future::BoxFuture<'_, Result<(), D::Error>> =
            driver.key("ctrl+c", None);
        let _: futures_util::future::BoxFuture<'_, Result<(), D::Error>> = driver.scroll(None);
        let _: futures_util::future::BoxFuture<'_, Result<os::SandboxRunResult, D::Error>> =
            driver.exec("fixture", None);
        let _: (&D, &str, os::OsDriverType) =
            (&binding.driver, &binding.container_name, binding.r#type);
    }
}
