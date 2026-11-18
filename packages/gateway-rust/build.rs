fn main() {
    // Keep the existing gateway package as the release version source of truth.
    let package = "../gateway/package.json";
    println!("cargo:rerun-if-changed={package}");
    let source = std::fs::read_to_string(package).expect("read gateway package.json");
    let metadata: serde_json::Value = serde_json::from_str(&source).expect("gateway package JSON");
    let version = metadata["version"]
        .as_str()
        .expect("gateway package version");
    println!("cargo:rustc-env=JAIT_GATEWAY_VERSION={version}");
}
