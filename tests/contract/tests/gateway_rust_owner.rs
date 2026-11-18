#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::security::agent_sandbox_owner::*;
use serde_json::{Value, json};
use std::{
    fs,
    path::{Path, PathBuf},
    process::{Command, Stdio},
};
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}
fn reference(call: Value) -> Value {
    let dir = root()
        .join(".jait/artifacts/gateway-rust/sandbox-owner")
        .join(uuid::Uuid::new_v4().to_string());
    fs::create_dir_all(&dir).unwrap();
    internal_driver::call(&root(), &dir, json!({"version":1,"calls":[call]}), &|| {
        false
    })
    .unwrap()[0]
        .clone()
}
struct Fixture(Value);
impl Host for Fixture {
    fn hostname(&self) -> String {
        self.0["hostname"].as_str().unwrap_or("host").into()
    }
    fn read(&self, p: &str) -> Option<String> {
        self.0["files"][p].as_str().map(String::from)
    }
    fn read_link(&self, p: &str) -> Option<String> {
        self.0["links"][p].as_str().map(String::from)
    }
    fn pid(&self) -> u32 {
        42
    }
    fn probe(&self, p: u64) -> Probe {
        match self.0["probes"][p.to_string()].as_str().unwrap_or("alive") {
            "ESRCH" => Probe::Missing,
            "alive" => Probe::Alive,
            _ => Probe::Unknown,
        }
    }
}
fn stat(start: &str) -> String {
    format!(
        "42 (name (with spaces)) {} {start} tail",
        vec!["S"; 19].join(" ")
    )
}
#[test]
fn gateway_hash_and_owner_probe_match_reference_os_fixtures() {
    let owners = json!([
        "bad",
        "",
        "42",
        "42::",
        "42:10:boot",
        "42:11:boot",
        "42:10:old",
        "43:10:boot",
        "44::boot",
        "45::boot",
        "00042:10:boot",
        "0::",
        "-1::",
        "1:2:3:4",
        "9007199254740992::",
        "9007199254740991::",
        "99999999999999999999999999999999999999999999999999999999::",
        "2147483648::"
    ]);
    let mut values = vec![];
    for (boot, hostname, state) in [
        ("boot", "host", "/fixture/state"),
        ("other", "host", "/fixture/state"),
        ("", "host", "/fixture/state"),
        ("boot", "host😀\nquote\"", "  /fixture/a/../state//  "),
        ("boot", "other", "/fixture/state"),
    ] {
        values.push(json!({"hostname":hostname,"state":state,"files":{"/etc/machine-id":" machine\n","/proc/sys/kernel/random/boot_id":boot,"/proc/42/stat":stat("10")},"links":{"/proc/self/ns/pid":"pid:[123]"},"probes":{"43":"EPERM","44":"ESRCH","45":"EINVAL"},"owners":owners}));
    }
    values.push(json!({"state":"/fixture/state","files":{},"links":{},"owners":owners}));
    let actual:Vec<_>=values.iter().map(|v|{
  let host=Fixture(v.clone());
  let path=jait_gateway::state_directory::state_directory(Path::new("/fixture/home"),v["state"].as_str()).unwrap();
  json!({"gateway":command_sandbox_gateway(&host,&path).unwrap(),"alive":v["owners"].as_array().unwrap().iter().map(|s|command_sandbox_owner_alive(&host,s.as_str().unwrap())).collect::<Vec<_>>()})
 }).collect();
    assert_eq!(
        json!(actual),
        reference(json!({"op":"nativeowner.fixtures","values":values}))
    );
}
#[test]
fn proc_start_parser_uses_last_parenthesis_and_preserves_whitespace_splitting() {
    assert_eq!(process_start_from_stat(&stat("12345")), "12345");
    assert_eq!(process_start_from_stat(""), "");
    assert_eq!(process_start_from_stat("malformed"), "");
    let leading = format!("42 (x)  {} 12345 tail", vec!["S"; 19].join(" "));
    assert_eq!(process_start_from_stat(&leading), "S");
}
#[test]
fn native_process_and_reaped_child_agree_with_reference_signal_zero() {
    let host = SystemHost;
    let owner = command_sandbox_owner(&host);
    assert!(owner.starts_with(&format!("{}:", std::process::id())));
    assert!(command_sandbox_owner_alive(&host, &owner));
    let mut child = Command::new(std::env::current_exe().unwrap())
        .arg("--list")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .unwrap();
    let dead = child.id();
    assert!(child.wait().unwrap().success());
    let fields: Vec<_> = owner.split(':').collect();
    let owners = vec![
        owner.clone(),
        format!("{}:wrong-start:{}", std::process::id(), fields[2]),
        format!("{}::wrong-boot", std::process::id()),
        format!("{dead}::"),
        "999999999999999999999999::".into(),
    ];
    let actual: Vec<_> = owners
        .iter()
        .map(|s| command_sandbox_owner_alive(&host, s))
        .collect();
    assert_eq!(
        json!({"alive":actual}),
        reference(json!({"op":"nativeowner.live","owners":owners}))
    );
    #[cfg(target_os = "linux")]
    {
        assert!(!fields[1].is_empty());
        assert!(!fields[2].is_empty());
        assert_eq!(actual, [true, false, false, false, true]);
    }
}
