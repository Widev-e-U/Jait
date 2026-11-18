use serde_json::{Value, json};
use std::{
    fs,
    io::{Read, Write},
    net::TcpListener,
    path::PathBuf,
    process::{Command, Stdio},
    thread,
    time::{Duration, Instant},
};

#[test]
fn backend_fixture_process() {
    let Some(ready) = std::env::var_os("JAIT_CONTRACT_READY_FILE") else {
        return;
    };
    let ready = PathBuf::from(ready);
    let root = ready.parent().unwrap();
    let project = root.join("invalid-git-marker");
    fs::create_dir_all(project.join(".git")).unwrap();
    let git = Command::new("git")
        .args(["rev-parse", "--show-toplevel"])
        .current_dir(&project)
        .output()
        .unwrap();
    let snapshot = json!({
        "pid":std::process::id(),
        "home":std::env::var("HOME").unwrap(),
        "temporary":std::env::var("TMPDIR").unwrap(),
        "git_discovered_parent":git.status.success(),
        "git_prompt":std::env::var("GIT_TERMINAL_PROMPT").unwrap(),
        "git_global_config":std::env::var("GIT_CONFIG_GLOBAL").unwrap(),
        "git_ceiling":std::env::var("GIT_CEILING_DIRECTORIES").unwrap(),
    });
    fs::write(
        root.join("backend-environment.json"),
        serde_json::to_vec(&snapshot).unwrap(),
    )
    .unwrap();
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    listener.set_nonblocking(true).unwrap();
    fs::write(&ready, listener.local_addr().unwrap().port().to_string()).unwrap();
    let deadline = Instant::now() + Duration::from_secs(15);
    while Instant::now() < deadline {
        match listener.accept() {
            Ok((mut stream, _)) => {
                stream
                    .set_read_timeout(Some(Duration::from_secs(1)))
                    .unwrap();
                let mut bytes = [0; 4096];
                let _ = stream.read(&mut bytes);
                // Health succeeds; the missing auth fields then force an honest
                // setup failure, proving a custom backend never falls back to Bun.
                let _=stream.write_all(b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}");
            }
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                thread::sleep(Duration::from_millis(5))
            }
            Err(error) => panic!("fixture HTTP: {error}"),
        }
    }
}

#[test]
fn custom_backend_uses_owned_isolated_environment_and_git_boundary() {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap();
    let directory = root
        .join(".jait/artifacts/rust-continuation/backend-launch")
        .join(uuid::Uuid::new_v4().to_string());
    fs::create_dir_all(&directory).unwrap();
    let stdout = directory.join("stdout.log");
    let argv = json!([
        std::env::current_exe().unwrap(),
        "--exact",
        "backend_fixture_process",
        "--nocapture"
    ]);
    let mut child = Command::new(env!("CARGO_BIN_EXE_jait-contract"))
        .args(["--label", "isolated-test-probe"])
        .env("JAIT_CONTRACT_BACKEND_ARGV", argv.to_string())
        .stdin(Stdio::null())
        .stdout(fs::File::create(&stdout).unwrap())
        .stderr(fs::File::create(directory.join("stderr.log")).unwrap())
        .spawn()
        .unwrap();
    let deadline = Instant::now() + Duration::from_secs(10);
    let status = loop {
        if let Some(status) = child.try_wait().unwrap() {
            break status;
        }
        if Instant::now() > deadline {
            let _ = child.kill();
            let _ = child.wait();
            panic!("backend launch probe exceeded ten seconds");
        }
        thread::sleep(Duration::from_millis(20));
    };
    assert_eq!(status.code(), Some(1));
    let output = fs::read_to_string(stdout).unwrap();
    let run = PathBuf::from(
        output
            .lines()
            .find_map(|line| line.strip_prefix("Artifacts: "))
            .unwrap(),
    );
    let report: Value =
        serde_json::from_slice(&fs::read(run.join("report.json")).unwrap()).unwrap();
    assert_eq!(report["success"], false);
    assert!(report["setup_error"].is_string());
    assert!(
        report["cases"]
            .as_array()
            .unwrap()
            .iter()
            .all(|case| case["status"] == "blocked")
    );
    let environment: Value =
        serde_json::from_slice(&fs::read(run.join("backend-environment.json")).unwrap()).unwrap();
    assert_eq!(environment["home"], run.join("home").to_str().unwrap());
    assert_eq!(environment["temporary"], run.join("tmp").to_str().unwrap());
    assert_eq!(environment["git_prompt"], "0");
    assert_eq!(environment["git_discovered_parent"], false);
    assert_eq!(
        environment["git_global_config"],
        run.join("home/.gitconfig").to_str().unwrap()
    );
    assert_eq!(
        environment["git_ceiling"],
        root.join(".jait/artifacts").to_str().unwrap()
    );
    #[cfg(target_os = "linux")]
    assert!(
        !PathBuf::from(format!("/proc/{}", environment["pid"].as_u64().unwrap())).exists(),
        "owned backend remained alive after setup failure"
    );
}

#[test]
fn custom_backend_requires_an_explicit_evidence_label_before_spawn() {
    let output = Command::new(env!("CARGO_BIN_EXE_jait-contract"))
        .env(
            "JAIT_CONTRACT_BACKEND_ARGV",
            r#"["backend-that-must-not-launch"]"#,
        )
        .output()
        .unwrap();
    assert_eq!(output.status.code(), Some(2));
    assert!(String::from_utf8_lossy(&output.stderr).contains("explicit --label"));
}
