use std::{
    io::{Read, Write},
    net::TcpListener,
    process::Command,
    thread,
    time::{Duration, Instant},
};

fn executable() -> Command {
    Command::new(env!("CARGO_BIN_EXE_jait-contract"))
}

#[test]
fn external_target_requires_explicit_disposable_ack_before_network_access() {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    listener.set_nonblocking(true).unwrap();
    let output = executable()
        .args([
            "--base-url",
            &format!("http://{}", listener.local_addr().unwrap()),
        ])
        .output()
        .unwrap();
    assert_eq!(output.status.code(), Some(2));
    assert!(String::from_utf8_lossy(&output.stderr).contains("--disposable"));
    assert_eq!(
        listener.accept().unwrap_err().kind(),
        std::io::ErrorKind::WouldBlock
    );
}

#[test]
fn unhealthy_backend_fails_and_reports_required_cases_as_blocked() {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    listener.set_nonblocking(true).unwrap();
    let server = thread::spawn(move || {
        let deadline = Instant::now() + Duration::from_secs(5);
        while Instant::now() < deadline {
            match listener.accept() {
                Ok((mut stream, _)) => {
                    stream
                        .set_read_timeout(Some(Duration::from_secs(2)))
                        .unwrap();
                    let mut buffer = [0; 4096];
                    let _ = stream.read(&mut buffer);
                    stream.write_all(b"HTTP/1.1 503 Service Unavailable\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").unwrap();
                    return;
                }
                Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                    thread::sleep(Duration::from_millis(10))
                }
                Err(error) => panic!("{error}"),
            }
        }
        panic!("runner never checked backend health");
    });
    let output = executable()
        .args([
            "--base-url",
            &format!("http://{address}"),
            "--disposable",
            "--label",
            "expected-unhealthy-backend",
        ])
        .output()
        .unwrap();
    server.join().unwrap();
    assert_eq!(output.status.code(), Some(1));
    let stdout = String::from_utf8(output.stdout).unwrap();
    let directory = stdout
        .lines()
        .find_map(|line| line.strip_prefix("Artifacts: "))
        .unwrap();
    let report: serde_json::Value = serde_json::from_slice(
        &std::fs::read(std::path::Path::new(directory).join("report.json")).unwrap(),
    )
    .unwrap();
    assert_eq!(report["success"], false);
    assert!(
        report["setup_error"]
            .as_str()
            .unwrap()
            .contains("expected HTTP 200, got 503")
    );
    let cases = report["cases"].as_array().unwrap();
    assert!(!cases.is_empty());
    assert!(cases.iter().all(|case| case["status"] == "blocked"));
    assert_eq!(report["summary"]["passed"], 0);
}
