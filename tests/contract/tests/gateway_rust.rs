//! Initial native gateway evidence, not full-gateway compatibility certification.
#[path = "../src/internal_driver.rs"]
mod internal_driver;

use jait_gateway::{
    Gateway,
    config::GatewayConfig,
    health::{HealthConfig, HealthSnapshot, HealthState},
};
use serde_json::{Value, json};
use std::{
    fs,
    net::SocketAddr,
    path::PathBuf,
    process::{Child, Command, Stdio},
    time::{Duration, Instant},
};
use tokio::{sync::oneshot, task::JoinHandle};

/// Serializes ephemeral-port acquisition against the release windows verified by
/// `assert_address_reusable`. Without it a gateway bound concurrently through
/// `127.0.0.1:0` can be handed the port a stopped gateway just released, which
/// makes the rebind assertion fail on a port this process still legitimately owns.
static PORT_LEASE: std::sync::LazyLock<tokio::sync::Mutex<()>> =
    std::sync::LazyLock::new(|| tokio::sync::Mutex::new(()));

async fn port_lease() -> tokio::sync::MutexGuard<'static, ()> {
    PORT_LEASE.lock().await
}

fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}
fn artifacts() -> PathBuf {
    let path = root()
        .join(".jait/artifacts/gateway-rust")
        .join(uuid::Uuid::new_v4().to_string());
    fs::create_dir_all(&path).unwrap();
    path
}
struct LiveGateway {
    url: String,
    address: SocketAddr,
    shutdown: Option<oneshot::Sender<()>>,
    task: Option<JoinHandle<std::io::Result<()>>>,
}
impl LiveGateway {
    async fn start(health: HealthState) -> Self {
        let gateway = {
            let _lease = port_lease().await;
            let config = GatewayConfig {
                address: SocketAddr::from(([127, 0, 0, 1], 0)),
            };
            Gateway::bind(config, health).await.unwrap()
        };
        let address = gateway.local_addr().unwrap();
        let (send, receive) = oneshot::channel();
        let task = tokio::spawn(gateway.serve(async {
            let _ = receive.await;
        }));
        Self {
            url: format!("http://{address}"),
            address,
            shutdown: Some(send),
            task: Some(task),
        }
    }
    async fn stop(mut self) {
        let _lease = port_lease().await;
        self.shutdown.take().unwrap().send(()).unwrap();
        tokio::time::timeout(Duration::from_secs(7), self.task.take().unwrap())
            .await
            .unwrap()
            .unwrap()
            .unwrap();
        assert_address_reusable(self.address);
    }
}
impl Drop for LiveGateway {
    fn drop(&mut self) {
        // Resolve shutdown on assertion failures too.
        self.shutdown.take();
    }
}
fn client() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .redirect(reqwest::redirect::Policy::none())
        .no_proxy()
        .build()
        .unwrap()
}
fn without_uptime(mut value: Value) -> Value {
    assert!(
        value["uptime"].is_u64(),
        "uptime must be nonnegative whole seconds"
    );
    value.as_object_mut().unwrap().remove("uptime");
    value
}

#[test]
fn bootstrap_config_is_isolated_strict_and_loopback_only() {
    let defaults = GatewayConfig::from_lookup(|_| None).unwrap();
    assert_eq!(defaults.address, "127.0.0.1:8220".parse().unwrap());
    let parse = |host: &str, port: &str| {
        GatewayConfig::from_lookup(|key| {
            Some(if key == "JAIT_RUST_HOST" {
                host.into()
            } else {
                port.into()
            })
        })
    };
    assert_eq!(
        parse("::1", "0").unwrap().address,
        "[::1]:0".parse().unwrap()
    );
    assert_eq!(parse("127.0.0.1", "65535").unwrap().address.port(), 65535);
    for host in [
        "0.0.0.0",
        "::",
        "192.168.1.2",
        "localhost",
        "https://localhost",
        "not-a-secret-host",
    ] {
        let error = parse(host, "8220").unwrap_err().to_string();
        assert!(!error.contains(host), "errors must not echo values");
    }
    for port in [
        "",
        "-1",
        "+1",
        "65536",
        "1.5",
        " 8220",
        "8220 ",
        "secret-value",
    ] {
        assert!(parse("127.0.0.1", port).is_err());
    }
    let inherited = GatewayConfig::from_lookup(|key| match key {
        "HOST" => Some("0.0.0.0".into()),
        "PORT" => Some("8080".into()),
        _ => None,
    })
    .unwrap();
    assert_eq!(inherited.address, defaults.address);
}

#[tokio::test]
async fn raw_config_cannot_bypass_loopback_and_bind_errors_are_reported() {
    let config = GatewayConfig {
        address: "0.0.0.0:0".parse().unwrap(),
    };
    assert!(Gateway::bind(config, HealthState::default()).await.is_err());
    let occupied = {
        let _lease = port_lease().await;
        std::net::TcpListener::bind("127.0.0.1:0").unwrap()
    };
    let config = GatewayConfig {
        address: occupied.local_addr().unwrap(),
    };
    assert!(Gateway::bind(config, HealthState::default()).await.is_err());
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn native_health_matches_real_typescript_handler_across_provider_branches() {
    let calls = json!([
        {"op":"nativehealth.response"},
        {"op":"nativehealth.response","config":{}},
        {"op":"nativehealth.response","config":{"llmProvider":"ollama","ollamaModel":"模型 🦀","ollamaUrl":"http://127.0.0.1:11434"},"snapshot":{"schemaVersion":76,"sessions":9,"surfaces":3,"devices":2,"userCount":1}},
        {"op":"nativehealth.response","config":{"llmProvider":"openai","openaiModel":"fixture-model","ollamaUrl":"must-not-appear"},"snapshot":{"userCount":2}},
        {"op":"nativehealth.response","config":{"llmProvider":"openai"}},
        {"op":"nativehealth.response","config":{"llmProvider":"ollama","ollamaModel":"","ollamaUrl":""}}
    ]);
    let request = json!({"version":1,"calls":calls});
    let reference = tokio::task::spawn_blocking(move || {
        internal_driver::call(&root(), &artifacts(), request, &|| false).unwrap()
    })
    .await
    .unwrap();
    for (index, call) in calls.as_array().unwrap().iter().enumerate() {
        let config: Option<HealthConfig> = call
            .get("config")
            .map(|c| serde_json::from_value(c.clone()).unwrap());
        let snapshot: HealthSnapshot =
            serde_json::from_value(call.get("snapshot").cloned().unwrap_or(json!({}))).unwrap();
        let gateway = LiveGateway::start(HealthState::new(config, snapshot)).await;
        let response = client()
            .get(format!("{}/health", gateway.url))
            .send()
            .await
            .unwrap();
        assert_eq!(
            response.status().as_u16(),
            reference[index]["status"].as_u64().unwrap() as u16
        );
        assert!(
            response.headers()["content-type"]
                .to_str()
                .unwrap()
                .starts_with("application/json")
        );
        let body: Value = response.json().await.unwrap();
        assert_eq!(
            without_uptime(body),
            without_uptime(reference[index]["body"].clone()),
            "branch {index}"
        );
        gateway.stop().await;
    }
}

#[tokio::test]
async fn standalone_http_handles_head_query_concurrency_and_unported_routes() {
    let gateway = LiveGateway::start(HealthState::default()).await;
    let client = client();
    let mut tasks = Vec::new();
    for _ in 0..8 {
        let request = client.get(format!("{}/health?probe=1", gateway.url));
        tasks.push(tokio::spawn(async move {
            request.send().await.unwrap().json::<Value>().await.unwrap()
        }));
    }
    for task in tasks {
        let body = task.await.unwrap();
        let expected = json!({"version":jait_gateway::VERSION,"schemaVersion":0,"sessions":0,"surfaces":0,"devices":0,"hasUsers":false,"healthy":true,"provider":"ollama","model":null,"ollamaUrl":null});
        assert_eq!(without_uptime(body), expected);
    }
    let head = client
        .head(format!("{}/health", gateway.url))
        .send()
        .await
        .unwrap();
    assert_eq!(head.status(), 200);
    assert!(head.bytes().await.unwrap().is_empty());
    assert_eq!(
        client
            .post(format!("{}/health", gateway.url))
            .send()
            .await
            .unwrap()
            .status(),
        405
    );
    for path in ["/api/sessions", "/api/auth/register", "/api/tools", "/"] {
        assert_eq!(
            client
                .get(format!("{}{path}", gateway.url))
                .send()
                .await
                .unwrap()
                .status(),
            404
        );
    }
    gateway.stop().await;
}

struct OwnedChild(Child);
impl Drop for OwnedChild {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}
fn wait_for_exit(child: &mut Child) -> std::process::ExitStatus {
    let deadline = Instant::now() + Duration::from_secs(10);
    loop {
        if let Some(status) = child.try_wait().unwrap() {
            return status;
        }
        assert!(Instant::now() < deadline, "native process exit deadline");
        std::thread::sleep(Duration::from_millis(10));
    }
}
#[test]
fn native_binary_rejects_invalid_configuration_without_values_in_logs() {
    let directory = artifacts();
    let log = directory.join("invalid.log");
    let mut child = OwnedChild(
        Command::new(env!("CARGO_BIN_EXE_gateway-native"))
            .env_clear()
            .env("JAIT_RUST_PORT", "private-secret-value")
            .current_dir(&directory)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::from(fs::File::create(&log).unwrap()))
            .spawn()
            .unwrap(),
    );
    assert!(!wait_for_exit(&mut child.0).success());
    let log = fs::read_to_string(log).unwrap();
    assert!(log.contains("JAIT_RUST_PORT"));
    assert!(!log.contains("private-secret-value"));
}

#[cfg(unix)]
#[test]
fn native_binary_runs_without_node_bun_or_path_and_exits_on_sigterm() {
    let directory = artifacts();
    let log = directory.join("gateway.log");
    let file = fs::File::create(&log).unwrap();
    let mut child = OwnedChild(
        Command::new(env!("CARGO_BIN_EXE_gateway-native"))
            .env_clear()
            .env("JAIT_RUST_PORT", "0")
            .current_dir(&directory)
            .stdin(Stdio::null())
            .stdout(Stdio::from(file.try_clone().unwrap()))
            .stderr(Stdio::from(file))
            .spawn()
            .unwrap(),
    );
    let deadline = Instant::now() + Duration::from_secs(10);
    let address = loop {
        assert!(
            child.0.try_wait().unwrap().is_none(),
            "native process failed startup"
        );
        let text = fs::read_to_string(&log).unwrap();
        if let Some(ready) = text
            .lines()
            .filter_map(|line| serde_json::from_str::<Value>(line).ok())
            .find(|line| line["event"] == "gateway.ready")
        {
            assert_eq!(ready["runtime"], "rust");
            assert_eq!(ready["migration"], true);
            break ready["address"].as_str().unwrap().to_string();
        }
        assert!(Instant::now() < deadline, "native startup deadline");
        std::thread::sleep(Duration::from_millis(10));
    };
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(3))
        .no_proxy()
        .build()
        .unwrap();
    let response = client
        .get(format!("http://{address}/health"))
        .send()
        .unwrap();
    assert_eq!(response.status(), 200);
    assert_eq!(response.json::<Value>().unwrap()["healthy"], true);
    assert!(
        Command::new("kill")
            .args(["-TERM", &child.0.id().to_string()])
            .status()
            .unwrap()
            .success()
    );
    assert!(wait_for_exit(&mut child.0).success());
    assert!(fs::read_to_string(log).unwrap().contains("gateway.stopped"));
    assert_address_reusable(address.parse().unwrap());
    assert_eq!(
        fs::read_dir(&directory).unwrap().count(),
        1,
        "native startup must not create state or config"
    );
}

#[tokio::test]
async fn stopped_gateway_rebinds_with_a_peer_that_has_not_closed_yet() {
    let mut gateway = LiveGateway::start(HealthState::default()).await;
    let address = gateway.address;
    let peer = tokio::task::spawn_blocking(move || {
        use std::io::{BufRead, BufReader, Read, Write};
        let mut stream = std::net::TcpStream::connect(address).unwrap();
        stream
            .set_read_timeout(Some(Duration::from_secs(3)))
            .unwrap();
        stream
            .write_all(b"GET /health HTTP/1.1\r\nHost: localhost\r\n\r\n")
            .unwrap();
        let mut reader = BufReader::new(stream);
        let mut length = 0;
        loop {
            let mut line = String::new();
            assert!(reader.read_line(&mut line).unwrap() > 0);
            if line == "\r\n" {
                break;
            }
            if let Some(value) = line.to_ascii_lowercase().strip_prefix("content-length:") {
                length = value.trim().parse::<usize>().unwrap();
            }
        }
        assert!(length > 0);
        let mut body = vec![0; length];
        reader.read_exact(&mut body).unwrap();
        assert_eq!(
            serde_json::from_slice::<Value>(&body).unwrap()["healthy"],
            true
        );
        reader.into_inner()
    })
    .await
    .unwrap();
    let _lease = port_lease().await;
    gateway.shutdown.take().unwrap().send(()).unwrap();
    tokio::time::timeout(Duration::from_secs(7), gateway.task.take().unwrap())
        .await
        .unwrap()
        .unwrap()
        .unwrap();
    let peer = tokio::task::spawn_blocking(move || {
        use std::io::Read;
        let mut peer = peer;
        assert_eq!(peer.read(&mut [0_u8; 1]).unwrap(), 0);
        peer
    })
    .await
    .unwrap();
    assert_address_reusable(address);
    drop(peer);
}

/// Rebinding the way a restart would: `SO_REUSEADDR` still fails while any
/// listener holds the port, but tolerates connections the stopped process left
/// behind. A plain `bind` cannot tell those two states apart and flakes whenever
/// a peer socket outlives shutdown.
fn assert_address_reusable(address: SocketAddr) {
    let listening = listening_inodes(address.port());
    let owned = socket_inodes();
    let ours = listening
        .iter()
        .filter(|inode| owned.contains(inode))
        .collect::<Vec<_>>();
    assert!(
        ours.is_empty(),
        "this process still listens on {address}: inodes={ours:?}"
    );
    let socket = match address {
        SocketAddr::V4(_) => tokio::net::TcpSocket::new_v4(),
        SocketAddr::V6(_) => tokio::net::TcpSocket::new_v6(),
    }
    .unwrap();
    socket.set_reuseaddr(true).unwrap();
    if let Err(error) = socket.bind(address) {
        // The kernel allows a single listener per port, so a foreign inode proves
        // this process released its own: the port was simply reclaimed by another
        // program and the failed bind says nothing about the shutdown under test.
        assert!(
            !listening.is_empty(),
            "listener must be released: {error}; address={address}; kernel={:?}",
            kernel_rows(address)
        );
    }
}

/// Inodes this process holds open, used to attribute kernel socket rows to it.
fn socket_inodes() -> Vec<u64> {
    let Ok(entries) = fs::read_dir("/proc/self/fd") else {
        return Vec::new();
    };
    entries
        .filter_map(Result::ok)
        .filter_map(|entry| fs::read_link(entry.path()).ok())
        .filter_map(|target| socket_inode(target.to_string_lossy().as_ref()))
        .collect()
}

fn socket_inode(link: &str) -> Option<u64> {
    link.strip_prefix("socket:[")?
        .strip_suffix(']')?
        .parse()
        .ok()
}

/// Inodes with a listening socket on `port`, per the kernel socket tables.
fn listening_inodes(port: u16) -> Vec<u64> {
    kernel_table()
        .into_iter()
        .filter_map(|line| {
            let mut fields = line.split_whitespace();
            let _slot = fields.next()?;
            let local = fields.next()?;
            let _remote = fields.next()?;
            let state = fields.next()?;
            let inode = fields.nth(5)?;
            if state != "0A" {
                return None;
            }
            let bound = local.rsplit(':').next()?;
            (u16::from_str_radix(bound, 16).ok()? == port)
                .then(|| inode.parse().ok())
                .flatten()
        })
        .collect()
}

fn kernel_rows(address: SocketAddr) -> Vec<String> {
    let needle = format!(":{:04X}", address.port());
    kernel_table()
        .into_iter()
        .filter(|line| {
            line.split_whitespace()
                .nth(1)
                .is_some_and(|local| local.ends_with(&needle))
        })
        .collect()
}

fn kernel_table() -> Vec<String> {
    ["/proc/net/tcp", "/proc/net/tcp6"]
        .into_iter()
        .filter_map(|path| fs::read_to_string(path).ok())
        .flat_map(|table| table.lines().map(str::to_owned).collect::<Vec<_>>())
        .collect()
}
