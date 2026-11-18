//! Exact metadata-guidance values and filesystem operation order.
#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::services::ollama_usage_setup::{KeyMetadata, UsageHost, get_ollama_usage_setup};
use serde_json::{Value, json};
use std::{
    cell::RefCell,
    io,
    path::{Path, PathBuf},
};
struct Metadata {
    paths: Value,
    calls: RefCell<Vec<Value>>,
}
fn error(code: &str) -> io::Error {
    let kind = match code {
        "EACCES" | "EPERM" => io::ErrorKind::PermissionDenied,
        "ENOENT" => io::ErrorKind::NotFound,
        "EINVAL" => io::ErrorKind::InvalidInput,
        _ => io::ErrorKind::Other,
    };
    io::Error::new(kind, code.to_string())
}
impl KeyMetadata for Metadata {
    fn is_file(&self, path: &Path) -> io::Result<bool> {
        let path = path.to_str().unwrap();
        self.calls.borrow_mut().push(json!(["stat", path]));
        match self.paths[path]["stat"].as_str().unwrap_or("ENOENT") {
            "file" => Ok(true),
            "directory" => Ok(false),
            code => Err(error(code)),
        }
    }
    fn readable(&self, path: &Path) -> io::Result<()> {
        let path = path.to_str().unwrap();
        self.calls.borrow_mut().push(json!(["access", path, 4]));
        match self.paths[path]["access"].as_str().unwrap_or("EACCES") {
            "ok" => Ok(()),
            code => Err(error(code)),
        }
    }
}
fn request(url: &str, host: Value, paths: Value) -> Value {
    let mut complete = json!({"host":"gateway-host","platform":"linux","gatewayUser":"test-user","uid":1234,"homeDir":"/owned/home","configuredKeyPath":null});
    complete
        .as_object_mut()
        .unwrap()
        .extend(host.as_object().unwrap().clone());
    json!({"op":"nativeollamasetup.inspect","url":url,"host":complete,"paths":paths})
}
fn compare(calls: Vec<Value>) {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap();
    let expected = internal_driver::call(
        &root,
        &root.join(".jait/artifacts/gateway-rust/ollama-setup"),
        json!({"version":1,"calls":calls}),
        &|| false,
    )
    .unwrap();
    let actual: Vec<_> = calls
        .iter()
        .map(|call| {
            let host: UsageHost = serde_json::from_value(call["host"].clone()).unwrap();
            let metadata = Metadata {
                paths: call["paths"].clone(),
                calls: RefCell::new(vec![]),
            };
            let result = get_ollama_usage_setup(call["url"].as_str().unwrap(), &host, &metadata);
            json!({"result":result,"calls":metadata.calls.into_inner()})
        })
        .collect();
    assert_eq!(json!(actual), expected, "requests={calls:?}");
}
#[test]
fn local_url_classifier_including_normalized_and_empty_url_components() {
    compare(
        [
            "http://localhost:11434",
            "https://localhost",
            "http://127.0.0.1/",
            "http://[::1]/",
            "HTTP://LOCALHOST",
            "http://127.1",
            "http://2130706433",
            "http://0x7f000001",
            "http://0177.0.0.1",
            "http://localhost?",
            "http://localhost#",
            "http://localhost?#",
            "http://@localhost",
            "http://:@localhost",
            "http://localhost/a/..",
            "http:\\localhost\\",
            "\n http://localhost\t\r",
        ]
        .into_iter()
        .map(|url| request(url, json!({}), json!({})))
        .collect(),
    );
}
#[test]
fn remote_and_invalid_urls_do_not_probe_any_files() {
    compare(
        [
            "http://other-host:11434",
            "http://localhost.",
            "http://127.0.0.2",
            "http://[::ffff:127.0.0.1]",
            "ftp://localhost",
            "file:///etc/passwd",
            "http://user@localhost",
            "http://:secret@localhost",
            "http://localhost/path",
            "http://localhost/?q=x",
            "http://localhost/#x",
            "not a URL",
            "//localhost",
            "http://localhost:65536",
            "http://localhost/%2f",
            "http://localhost/%00",
        ]
        .into_iter()
        .map(|url| request(url, json!({}), json!({})))
        .collect(),
    );
}
#[test]
fn configured_path_trimming_and_shell_quoting_are_inert() {
    compare(
        [
            " /custom/key ",
            "\u{feff}/custom/key\u{a0}",
            "/custom/it's a $(key); `cmd`\nnext",
            "relative key",
            "\0bad",
        ]
        .into_iter()
        .map(|path| {
            let trimmed = path.trim_matches(|c: char| c.is_whitespace() || c == '\u{feff}');
            request(
                "http://localhost",
                json!({"configuredKeyPath":path}),
                json!({trimmed:{"stat":"file","access":"EACCES"}}),
            )
        })
        .collect(),
    );
}
#[test]
fn first_failure_retention_and_readable_fallback() {
    let cases = [
        json!({"/owned/home/.ollama/id_ed25519":{"stat":"file","access":"EACCES"},"/usr/share/ollama/.ollama/id_ed25519":{"stat":"file","access":"ok"}}),
        json!({}),
        json!({"/owned/home/.ollama/id_ed25519":{"stat":"directory"},"/usr/share/ollama/.ollama/id_ed25519":{"stat":"file","access":"ok"}}),
        json!({"/owned/home/.ollama/id_ed25519":{"stat":"EACCES"},"/usr/share/ollama/.ollama/id_ed25519":{"stat":"file","access":"ok"}}),
        json!({"/owned/home/.ollama/id_ed25519":{"stat":"EPERM"},"/usr/share/ollama/.ollama/id_ed25519":{"stat":"file","access":"EACCES"}}),
        json!({"/owned/home/.ollama/id_ed25519":{"stat":"file","access":"EIO"},"/usr/share/ollama/.ollama/id_ed25519":{"stat":"EPERM"}}),
        json!({"/owned/home/.ollama/id_ed25519":{"stat":"EIO"},"/usr/share/ollama/.ollama/id_ed25519":{"stat":"EACCES"}}),
        json!({"/owned/home/.ollama/id_ed25519":{"stat":"file","access":"ok"}}),
    ];
    compare(
        cases
            .into_iter()
            .map(|paths| request("http://localhost", json!({}), paths))
            .collect(),
    );
}
#[test]
fn platform_and_uid_control_only_guidance_and_candidate_paths() {
    compare(
        [
            ("linux", 0),
            ("linux", -1),
            ("darwin", 123),
            ("win32", -1),
            ("freebsd", 42),
        ]
        .into_iter()
        .flat_map(|(platform, uid)| {
            [
                json!({"/owned/home/.ollama/id_ed25519":{"stat":"file","access":"EACCES"}}),
                json!({}),
            ]
            .into_iter()
            .map(move |paths| {
                request(
                    "http://localhost",
                    json!({"platform":platform,"uid":uid}),
                    paths,
                )
            })
        })
        .collect(),
    );
}
#[test]
fn empty_operator_override_uses_standard_locations() {
    compare(
        [None, Some(""), Some(" \t\n"), Some("\u{feff}\u{a0}")]
            .into_iter()
            .map(|configured| {
                request(
                    "http://localhost",
                    json!({"configuredKeyPath":configured}),
                    json!({}),
                )
            })
            .collect(),
    );
}
#[test]
fn default_paths_use_node_lexical_join_normalization() {
    compare(
        [
            "",
            "/",
            "/owned//home/../other/",
            "relative/./home",
            "../../home",
        ]
        .into_iter()
        .map(|home| request("http://localhost", json!({"homeDir":home}), json!({})))
        .collect(),
    );
}
#[test]
fn real_filesystem_metadata_follows_links_and_does_not_read_or_change_key_material() {
    use jait_gateway::services::ollama_usage_setup::SystemKeyMetadata;
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap();
    let work = root
        .join(".jait/artifacts/gateway-rust/ollama-setup-live")
        .join(uuid::Uuid::new_v4().to_string());
    std::fs::create_dir_all(&work).unwrap();
    let key = work.join("operator's $(key)");
    std::fs::write(
        &key,
        b"not a private key; fixture contents must stay unchanged",
    )
    .unwrap();
    let directory = work.join("directory");
    std::fs::create_dir(&directory).unwrap();
    let mut paths = vec![
        key.clone(),
        directory,
        work.join("missing"),
        work.join("invalid\0path"),
    ];
    #[cfg(unix)]
    {
        use std::os::unix::fs::{PermissionsExt, symlink};
        let link = work.join("symlink");
        symlink(&key, &link).unwrap();
        paths.push(link);
        let blocked = work.join("blocked");
        std::fs::write(&blocked, b"fixture").unwrap();
        std::fs::set_permissions(&blocked, std::fs::Permissions::from_mode(0o000)).unwrap();
        paths.push(blocked);
    }
    let calls: Vec<_> = paths
        .iter()
        .map(|p| {
            let mut call = request(
                "http://localhost",
                json!({"configuredKeyPath":p.to_str().unwrap()}),
                json!({}),
            );
            call["live"] = json!(true);
            call
        })
        .collect();
    let expected = internal_driver::call(
        &root,
        &root.join(".jait/artifacts/gateway-rust/ollama-setup"),
        json!({"version":1,"calls":calls}),
        &|| false,
    )
    .unwrap();
    let actual: Vec<_> = calls
        .iter()
        .map(|c| {
            let host: UsageHost = serde_json::from_value(c["host"].clone()).unwrap();
            get_ollama_usage_setup(c["url"].as_str().unwrap(), &host, &SystemKeyMetadata)
        })
        .map(|r| json!(r))
        .collect();
    let expected: Vec<_> = expected
        .as_array()
        .unwrap()
        .iter()
        .map(|v| v["result"].clone())
        .collect();
    assert_eq!(actual, expected);
    assert_eq!(
        std::fs::read(key).unwrap(),
        b"not a private key; fixture contents must stay unchanged"
    );
}
