#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::{
    memory::contracts as memory, sessions::contracts as sessions, surfaces::contracts as surfaces,
};
use serde::{Serialize, de::DeserializeOwned};
use serde_json::{Value, json};
use std::{future::Future, path::PathBuf, pin::Pin, process::Command};
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}
fn fixtures() -> Value {
    let root = root();
    internal_driver::call(&root,&root.join(".jait/artifacts/gateway-rust/public-contracts").join(uuid::Uuid::new_v4().to_string()),json!({"version":1,"calls":[{"op":"nativepubliccontracts.fixtures"},{"op":"nativepubliccontracts.exports"}]}),&||false).unwrap()
}
fn roundtrip<T: Serialize + DeserializeOwned>(values: &Value) {
    for value in values.as_array().unwrap() {
        let typed: T = serde_json::from_value(value.clone()).unwrap();
        assert_eq!(serde_json::to_value(typed).unwrap(), *value);
    }
}
#[test]
fn source_typed_records_roundtrip_in_native_public_contracts() {
    let f = fixtures();
    let f = &f[0];
    roundtrip::<memory::MemoryScope>(&f["scopes"]);
    roundtrip::<memory::MemorySource>(&f["sources"]);
    roundtrip::<memory::MemoryEntry>(&f["entries"]);
    roundtrip::<memory::SaveMemoryInput>(&f["save"]);
    roundtrip::<sessions::SessionDescriptor>(&f["sessions"]);
    roundtrip::<surfaces::SurfaceState>(&f["states"]);
    roundtrip::<surfaces::SurfaceStartInput>(&f["start"]);
    roundtrip::<surfaces::SurfaceStopInput>(&f["stop"]);
    roundtrip::<surfaces::SurfaceSnapshot>(&f["snapshots"]);
    let values = [
        0.0,
        0.9,
        -0.9,
        -1.0,
        f64::NAN,
        8_640_000_000_000_000.0,
        -8_640_000_000_000_000.0,
        8_640_000_000_000_001.0,
    ];
    assert_eq!(
        serde_json::to_value(values.map(memory::MemoryDate::from_millis)).unwrap(),
        f["dates"]
    );
}
#[test]
fn declarations_are_type_only_and_positive_negative_fixtures_compile() {
    assert_eq!(
        fixtures()[1],
        json!({"memory":[],"sessions":[],"surfaces":[]})
    );
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
            "--allowImportingTsExtensions",
        ])
        .arg(root.join("tests/contract/drivers/nativepubliccontracts.ts"))
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
fn imported_storage_records_need_a_known_public_memory_scope() {
    let entry: memory::MemoryEntry =
        serde_json::from_value(fixtures()[0]["entries"][0].clone()).unwrap();
    let expected = serde_json::to_value(&entry).unwrap();
    let mut stored: jait_gateway::memory::entries::MemoryEntry = entry.into();
    assert_eq!(
        serde_json::to_value(memory::MemoryEntry::try_from(stored.clone()).unwrap()).unwrap(),
        expected
    );
    stored.scope = jait_gateway::memory::entries::MemoryScope::Other("untrusted".into());
    assert!(memory::MemoryEntry::try_from(stored).is_err());
    assert!(serde_json::from_value::<memory::MemoryScope>(json!("system")).is_err());
    let save: memory::SaveMemoryInput =
        serde_json::from_value(fixtures()[0]["save"][1].clone()).unwrap();
    let internal: jait_gateway::memory::engine::SaveMemoryInput = save.into();
    assert_eq!(
        internal.scope,
        jait_gateway::memory::entries::MemoryScope::Contact
    );
}
#[test]
fn surface_metadata_is_primitive_only_and_existing_registry_conversion_is_explicit() {
    let value = fixtures()[0]["snapshots"][0].clone();
    let internal: jait_gateway::surfaces::registry::SurfaceSnapshot =
        serde_json::from_value(value.clone()).unwrap();
    assert_eq!(
        serde_json::to_value(surfaces::SurfaceSnapshot::try_from(internal).unwrap()).unwrap(),
        value
    );
    for invalid in [json!({"nested":true}), json!([1, 2])] {
        let mut value = value.clone();
        value["metadata"]["bad"] = invalid;
        assert!(serde_json::from_value::<surfaces::SurfaceSnapshot>(value).is_err());
    }
    let count = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let copied = count.clone();
    let callbacks = surfaces::SurfaceCallbacks {
        on_output: Some(std::sync::Arc::new(move |text| {
            assert_eq!(text, "output");
            copied.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        })),
        on_state_change: None,
    };
    callbacks.on_output.unwrap()("output".into());
    assert_eq!(count.load(std::sync::atomic::Ordering::SeqCst), 1);
}
#[test]
fn native_async_service_signatures_and_callback_slots_are_checked() {
    type F<'a, T> = Pin<Box<dyn Future<Output = T> + Send + 'a>>;
    let _: Option<F<'static, Result<(), String>>> = None;
    fn _memory<B: memory::MemoryBackend, M: memory::MemoryService>(
        backend: &mut B,
        memory: &mut M,
        entry: memory::MemoryEntry,
        save: memory::SaveMemoryInput,
    ) {
        let _: F<'_, Result<(), B::Error>> = backend.save(entry.clone());
        let _: F<'_, Result<(), B::Error>> = backend.update(entry);
        let _: F<'_, Result<Vec<memory::MemoryEntry>, B::Error>> =
            backend.list(Some(memory::MemoryScope::Project));
        let _: F<'_, Result<bool, B::Error>> = backend.forget("id");
        let _: F<'_, Result<f64, B::Error>> =
            backend.forget_expired(Some(memory::MemoryDate::from_millis(0.0)));
        let _: F<'_, Result<memory::MemoryEntry, M::Error>> = memory.save(save);
        let _: F<'_, Result<Vec<memory::MemoryEntry>, M::Error>> = memory.list(None);
        let _: F<'_, Result<Vec<memory::MemoryEntry>, M::Error>> =
            memory.search("q", Some(f64::NAN), None);
        let _: F<'_, Result<bool, M::Error>> = memory.forget("id");
        let _: F<'_, Result<f64, M::Error>> = memory.forget_expired(None);
        let _: F<'_, Result<f64, M::Error>> =
            memory.flush_pre_compaction("id", vec!["fact".into()]);
    }
    fn _session<S: sessions::SessionRouter>(router: &mut S) {
        let _: F<'_, Result<sessions::SessionDescriptor, S::Error>> =
            router.create("name", "project");
        let _: F<'_, Result<Vec<sessions::SessionDescriptor>, S::Error>> = router.list(None);
        let _: F<'_, Result<(), S::Error>> = router.activate("id");
        let _: F<'_, Result<Option<sessions::SessionDescriptor>, S::Error>> =
            router.get_active("p");
    }
    fn _surface<S: surfaces::Surface, F: surfaces::SurfaceFactory>(
        surface: &mut S,
        factory: &F,
        input: surfaces::SurfaceStartInput,
    ) {
        let _: (&str, &str, surfaces::SurfaceState, Option<&str>) = (
            surface.id(),
            surface.kind(),
            surface.state(),
            surface.session_id(),
        );
        let _: Pin<Box<dyn Future<Output = Result<(), S::Error>> + Send + '_>> =
            surface.start(input);
        let _: Pin<Box<dyn Future<Output = Result<(), S::Error>> + Send + '_>> =
            surface.stop(Some(surfaces::SurfaceStopInput { reason: None }));
        let _: Result<surfaces::SurfaceSnapshot, S::Error> = surface.snapshot();
        let _: &mut surfaces::SurfaceCallbacks = surface.callbacks();
        let _: Result<F::Surface, <F::Surface as surfaces::Surface>::Error> = factory.create("id");
        let _: &str = factory.kind();
    }
    // Generic bodies above are compiler assertions, without a pretend runtime engine.
    let search = memory::SearchMemoryInput {
        query: "q".into(),
        scope: None,
        limit: Some(f64::NAN),
        now: Some(memory::MemoryDate::from_millis(f64::NAN)),
    };
    assert!(search.now.unwrap().millis().is_none());
    assert!(search.limit.unwrap().is_nan());
}
