#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::providers::pi_mcp_provision::*;
use serde_json::{Value, json};
use std::{fs, path::PathBuf};
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}
fn directory() -> PathBuf {
    let p = root()
        .join(".jait/artifacts/gateway-rust/pi-mcp")
        .join(uuid::Uuid::new_v4().to_string());
    fs::create_dir_all(&p).unwrap();
    p
}
fn reference(calls: Vec<Value>, base: &std::path::Path) -> Value {
    internal_driver::call(&root(), base, json!({"version":1,"calls":calls}), &|| false).unwrap()
}
fn normalize(text: &str, dir: &str) -> String {
    let escaped = dir
        .chars()
        .flat_map(|c| {
            if matches!(c, '"' | '\\' | '$' | '\u{0060}') {
                vec!['\\', c]
            } else {
                vec![c]
            }
        })
        .collect::<String>();
    text.replace(&escaped, "<dir>").replace(dir, "<dir>")
}
fn units(text: &str) -> Vec<u16> {
    text.encode_utf16().collect()
}
fn options(root: PathBuf, c: &Value) -> PiMcpOptions {
    PiMcpOptions {
        session_id: c["session"].as_str().unwrap_or("session").into(),
        real_pi_command: c["command"].as_str().map(String::from),
        scratch_root: root,
        platform: if c["windows"] == true {
            WrapperPlatform::Windows
        } else {
            WrapperPlatform::Unix
        },
    }
}
fn compare(mut c: Value) {
    let base = directory();
    let root = base.join(if c["specialRoot"] == true {
        "root \"$JAIT_PI_MARKER\""
    } else {
        "root"
    });
    fs::create_dir_all(&root).unwrap();
    if c["execute"] == true {
        let real = base.join("pi \"$JAIT_PI_MARKER\" \\ path");
        fs::write(
            &real,
            "#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify(process.argv.slice(2)));\n",
        )
        .unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&real, fs::Permissions::from_mode(0o755)).unwrap();
        }
        c["command"] = json!(real);
    }
    c["op"] = json!("nativepimcp.run");
    c["root"] = json!(root);
    let expected = reference(vec![c.clone()], &base)[0].clone();
    let scratch = if c["badRoot"] == true {
        root.join("not-directory")
    } else {
        root.clone()
    };
    let servers: Vec<PiMcpServer> = if c["servers"].is_null() {
        vec![]
    } else {
        serde_json::from_value(c["servers"].clone()).unwrap()
    };
    let mut warnings = 0;
    let provision = provision_pi_mcp(
        c["provider"].as_str().unwrap_or("pi"),
        &servers,
        &options(scratch, &c),
        |_| warnings += 1,
    );
    let actual = if let Some(provision) = provision {
        let dir = provision.directory().to_str().unwrap();
        let config: Value =
            serde_json::from_str(&fs::read_to_string(provision.config_path()).unwrap()).unwrap();
        let wrapper = fs::read_to_string(provision.wrapper_path()).unwrap();
        let mut env = provision.env();
        env.get_mut("PI_ACP_PI_COMMAND")
            .unwrap()
            .clone_from(&normalize(provision.wrapper_path().to_str().unwrap(), dir));
        #[cfg(unix)]
        let (private, executable) = {
            use std::os::unix::fs::PermissionsExt;
            (
                (fs::metadata(provision.directory())
                    .unwrap()
                    .permissions()
                    .mode()
                    & 0o777)
                    == 0o700,
                (fs::metadata(provision.wrapper_path())
                    .unwrap()
                    .permissions()
                    .mode()
                    & 0o100)
                    != 0,
            )
        };
        #[cfg(not(unix))]
        let (private, executable) = (true, false);
        let mut v = json!({"env":env,"config":config,"wrapper":units(&normalize(&wrapper,dir)),"privateDirectory":private,"executable":if c["windows"]==true{Value::Null}else{json!(executable)}});
        if c["execute"] == true {
            let out = std::process::Command::new(provision.wrapper_path())
                .args(
                    c["args"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .map(|a| a.as_str().unwrap()),
                )
                .env("JAIT_PI_MARKER", "expanded")
                .output()
                .unwrap();
            let output = if out.status.success() {
                Value::Array(
                    serde_json::from_slice::<Vec<String>>(&out.stdout)
                        .unwrap()
                        .iter()
                        .map(|s| json!(normalize(s, dir)))
                        .collect(),
                )
            } else {
                json!(String::from_utf8_lossy(&out.stdout))
            };
            v["execution"] = json!({"status":out.status.code(),"output":output});
        }
        provision.cleanup();
        provision.cleanup();
        v["removed"] = json!(!provision.directory().exists());
        json!({"provision":v,"warnings":warnings,"entries":[]})
    } else {
        json!({"provision":null,"warnings":warnings,"entries":[]})
    };
    assert_eq!(actual, expected, "Pi MCP {c}");
    assert!(fs::read_dir(root).unwrap().all(|p| {
        !p.unwrap()
            .file_name()
            .to_string_lossy()
            .starts_with("jait-pi-mcp-")
    }));
}
fn http() -> Value {
    json!([{"name":"jait_core","transport":"http","url":"http://127.0.0.1:8765/mcp?sessionId=s1&toolSet=core"},{"name":"jait","transport":"sse","url":"http://127.0.0.1:8765/mcp?toolSet=deferred"}])
}
#[test]
fn provider_filtering_empty_servers_default_command_and_command_trimming() {
    let values = [
        "pi",
        "pi-gemini",
        "Pi",
        " pi",
        "codex",
        "claude-code",
        "cursor",
        "",
        "pi-gemini-extra",
    ];
    let expected = reference(
        vec![json!({"op":"nativepimcp.kinds","values":values})],
        &directory(),
    );
    assert_eq!(
        json!({"types":PI_BASED_PROVIDER_TYPES,"values":values.iter().map(|p|is_pi_based_provider(p)).collect::<Vec<_>>()}),
        expected[0]
    );
    for provider in values {
        compare(json!({"provider":provider,"servers":http()}))
    }
    compare(json!({"provider":"pi"}));
    compare(json!({"provider":"pi","servers":[]}));
    for command in [
        "",
        "  ",
        "\u{feff}\u{a0}",
        " /opt/pi cli ",
        "C:\\Program Files\\pi.exe",
        "\u{85}pi",
    ] {
        compare(json!({"servers":http(),"command":command}))
    }
}
#[test]
fn stdio_http_sse_names_defaults_env_duplicates_and_numeric_key_order() {
    compare(json!({"servers":[
     {"name":"local","transport":"stdio","command":"node","args":["server.js","literal ; $(x)"],"env":{"Z":"last","2":"numeric","A":"first"}},
     {"name":"empty","transport":"stdio","command":"node"},
     {"name":"empty-env","transport":"stdio","command":"node","args":null,"env":{}},
     {"name":"10","transport":"http","url":"http://example.test/ten"},
     {"name":"2","transport":"http","url":"http://example.test/two"},
     {"name":"__proto__","transport":"http","url":"http://example.test/proto"},
     {"name":"constructor","transport":"sse","url":"http://example.test/ctor"},
     {"name":"2","transport":"sse","url":"http://example.test/replaced"},
     {"name":"","transport":"stdio","command":"zero"},
    ]}));
}
#[test]
fn wrapper_exec_preserves_literal_paths_arguments_and_session_config() {
    compare(
        json!({"servers":http(),"execute":true,"specialRoot":true,"args":["--mode","rpc","two words","$JAIT_PI_MARKER","; &","中文 😀"]}),
    );
    for command in [
        "quotes\"and\\slashes",
        "dollar$HOME",
        "backtick\u{0060}literal\u{0060}",
    ] {
        compare(json!({"servers":http(),"command":command}))
    }
}
#[test]
fn windows_wrapper_text_retains_crlf_percent_forwarding_and_stdio_config() {
    compare(
        json!({"provider":"pi-gemini","servers":http(),"windows":true,"command":"C:\\Program Files\\pi.exe"}),
    );
}
#[test]
fn invalid_roots_and_session_paths_are_best_effort_without_leaked_files() {
    compare(json!({"servers":http(),"badRoot":true}));
    for session in ["../escape", "x/y", "x\\y", "x\u{0}y"] {
        compare(json!({"servers":http(),"session":session}))
    }
    compare(json!({"servers":http(),"session":""}));
    compare(json!({"servers":http(),"session":"中文 \" $unit"}));
}
#[test]
fn concurrent_session_configs_are_distinct_and_last_owner_cleanup_is_idempotent() {
    let root = directory();
    let servers: Vec<PiMcpServer> = serde_json::from_value(http()).unwrap();
    let opts = options(root.clone(), &json!({}));
    let a = provision_pi_mcp("pi", &servers, &opts, |m| panic!("{m}")).unwrap();
    let b = provision_pi_mcp("pi-gemini", &servers, &opts, |m| panic!("{m}")).unwrap();
    assert_ne!(a.directory(), b.directory());
    let ap = a.directory().to_path_buf();
    let bp = b.directory().to_path_buf();
    a.cleanup();
    assert!(!ap.exists());
    assert!(b.config_path().exists());
    drop(a);
    assert!(bp.exists());
    drop(b);
    assert!(!bp.exists());
}
