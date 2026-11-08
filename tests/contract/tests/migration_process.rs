//! Black-box process assertions shared by the Bun and native launch commands.
#[allow(dead_code)]
#[path = "../src/client.rs"]
mod client;
#[allow(dead_code)]
#[path = "../src/fixture.rs"]
mod fixture;
use anyhow::Result;
use std::{
    fs,
    net::{SocketAddr, TcpListener, TcpStream},
    path::PathBuf,
};
fn workspace() -> Result<(PathBuf, PathBuf)> {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()?;
    let dir = root
        .join(".jait/artifacts/migration-process")
        .join(uuid::Uuid::new_v4().to_string());
    fs::create_dir_all(&dir)?;
    Ok((root, dir))
}
fn start() -> Result<fixture::Gateway> {
    let (root, dir) = workspace()?;
    fixture::Gateway::start(&root, &dir, None)
}
fn address(g: &fixture::Gateway) -> SocketAddr {
    g.api.base.strip_prefix("http://").unwrap().parse().unwrap()
}
#[test]
fn process_restart_reports_fresh_readiness_and_releases_previous_listener() -> Result<()> {
    let mut g = start()?;
    let old = address(&g);
    let pid = g.process_id();
    g.restart()?;
    assert_ne!(pid, g.process_id());
    g.api.expect("GET", "/health", None, None, 200)?;
    if old != address(&g) {
        let _listener = TcpListener::bind(old)?;
    }
    let current = address(&g);
    g.stop()?;
    let _listener = TcpListener::bind(current)?;
    Ok(())
}
#[cfg(unix)]
#[test]
fn graceful_shutdown_finishes_with_an_open_idle_connection() -> Result<()> {
    let mut g = start()?;
    let addr = address(&g);
    let _idle = TcpStream::connect(addr)?;
    g.shutdown()?;
    let _listener = TcpListener::bind(addr)?;
    Ok(())
}

// A readiness response from an unrelated listener must never mask failed startup.
#[cfg(unix)]
#[test]
fn occupied_port_fails_without_readiness_and_recovers_after_release() -> Result<()> {
    let (root, dir) = workspace()?;
    let listener = TcpListener::bind("127.0.0.1:0")?;
    let port = listener.local_addr()?.port();
    let started = std::time::Instant::now();
    let failed = fixture::Gateway::start_on_port(&root, &dir, port);
    assert!(
        failed.is_err(),
        "occupied port unexpectedly reported readiness"
    );
    let error = failed.err().unwrap().to_string();
    assert!(error.contains("exited unsuccessfully"), "{error}");
    assert!(
        started.elapsed() < fixture::STARTUP_TIMEOUT + std::time::Duration::from_secs(5),
        "failed startup did not exit promptly"
    );
    assert!(!dir.join("ready-port").exists());
    drop(listener);
    let mut recovered = fixture::Gateway::start_on_port(&root, &dir, port)?;
    assert_eq!(address(&recovered).port(), port);
    recovered.api.expect("GET", "/health", None, None, 200)?;
    recovered.shutdown()?;
    let _released = TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, port))?;
    Ok(())
}

#[cfg(unix)]
#[test]
fn corrupt_database_fails_without_readiness_and_preserves_original_bytes() -> Result<()> {
    let (root, dir) = workspace()?;
    fs::create_dir_all(dir.join("state"))?;
    let database = dir.join("state/jait.db");
    let corrupt = b"This is deliberately not a SQLite database.\0";
    fs::write(&database, corrupt)?;
    let started = std::time::Instant::now();
    let failed = fixture::Gateway::start(&root, &dir, None);
    assert!(
        failed.is_err(),
        "corrupt database unexpectedly reported readiness"
    );
    let error = failed.err().unwrap().to_string();
    assert!(error.contains("exited unsuccessfully"), "{error}");
    assert!(
        started.elapsed() < fixture::STARTUP_TIMEOUT + std::time::Duration::from_secs(5),
        "failed startup did not exit promptly"
    );
    assert!(!dir.join("ready-port").exists());
    assert_eq!(
        fs::read(&database)?,
        corrupt,
        "failed startup replaced the corrupt database"
    );
    fs::rename(&database, dir.join("state/corrupt.db"))?;
    let mut recovered = fixture::Gateway::start(&root, &dir, None)?;
    recovered.api.expect("GET", "/health", None, None, 200)?;
    recovered.shutdown()?;
    assert_eq!(fs::read(dir.join("state/corrupt.db"))?, corrupt);
    Ok(())
}
