//! Lane `network-resources`: differential contract suite.
//!
//! The native port (`jait_gateway::services::network_resources`) is compared
//! against the **real** TypeScript exports of
//! `packages/gateway/src/services/network-resources.ts`, executed through
//! `internal_driver::call`. That helper returns the adapter's **results array**
//! (one entry per request call), not the response wrapper.
//!
//! Every Docker interaction is scripted by `drivers/nativenetworkresources.ts`
//! (TypeScript side) or by an owned in-process adapter (native side). No live
//! Docker daemon, socket or network discovery is used anywhere in this suite.

#[path = "../src/internal_driver.rs"]
mod internal_driver;

use jait_gateway::services::network_resources::{
    Clock, CommandOutput, DockerError, DockerErrorKind, DockerPlatform, DockerResourceInventory,
    DockerRunner, INSPECT_FORMAT, INSPECT_MAX_BUFFER, INSPECT_TIMEOUT_MS, LIST_ARGV,
    LocalDockerHost, LocalDockerRunner, MAX_CONTAINERS, TTL_MS, container_resource,
    resolve_endpoint,
};
use serde_json::{Value, json};
use std::{
    collections::VecDeque,
    fs,
    future::Future,
    path::PathBuf,
    sync::{
        Arc, Mutex,
        atomic::{AtomicI64, AtomicUsize, Ordering},
    },
    time::Duration,
};

const OBSERVED: &str = "2026-10-20T06:30:00.000Z";
/// 64 hex characters: the only shape `docker ps --no-trunc` may emit.
const FULL_ID: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
/// 12 hex characters: rejected by the `ps` filter, accepted by `containerResource`.
const SHORT_ID: &str = "abcdefabcdef";

fn repo_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..")
}

static NEXT_DIR: AtomicUsize = AtomicUsize::new(0);

/// Runs one driver request batch and returns the per-call results array.
fn observe(calls: Vec<Value>) -> Vec<Value> {
    let root = repo_root();
    let directory = root
        .join(".jait/artifacts/gateway-rust/parallel-20261020/network-resources/contract")
        .join(format!(
            "{}-{}",
            std::process::id(),
            NEXT_DIR.fetch_add(1, Ordering::SeqCst)
        ));
    fs::create_dir_all(&directory).unwrap();
    internal_driver::call(
        &root,
        &directory,
        json!({"version": 1, "calls": calls}),
        &|| false,
    )
    .expect("internal driver call")
    .as_array()
    .expect("driver results array")
    .clone()
}

fn ts_resources(rows: &[Value]) -> Vec<Value> {
    let calls = rows
        .iter()
        .map(|row| {
            json!({
                "op": "nativenetworkresources.resource",
                "value": row,
                "observedAt": OBSERVED,
            })
        })
        .collect();
    observe(calls)
        .into_iter()
        .map(|result| result["resource"].clone())
        .collect()
}

fn native_resources(rows: &[Value]) -> Vec<Value> {
    rows.iter()
        .map(|row| serde_json::to_value(container_resource(row, OBSERVED)).unwrap())
        .collect()
}

fn host_json(docker_host: Option<&str>, platform: &str, home: &str, socket: bool) -> Value {
    json!({
        "dockerHost": docker_host,
        "platform": platform,
        "home": home,
        "socketExists": socket,
    })
}

fn inventory_request(
    host: Option<Value>,
    nows: Vec<i64>,
    responses: Vec<Value>,
    mode: Option<&str>,
) -> Value {
    let mut call = json!({
        "op": "nativenetworkresources.inventory",
        "nows": nows,
        "responses": responses,
    });
    if let Some(host) = host {
        call["host"] = host;
    }
    if let Some(mode) = mode {
        call["mode"] = json!(mode);
    }
    call
}

fn listing(ids: &[String]) -> Value {
    json!({ "stdout": ids.join("\n") })
}

fn row(id: &str) -> Value {
    json!({
        "id": id,
        "name": "/probe",
        "image": "nginx:1.27",
        "state": "running",
        "created": "2026-10-20T06:00:00.000000000Z",
        "networks": {"bridge": {"IPAddress": "172.17.0.2"}},
    })
}

// ---------------------------------------------------------------------------
// Scripted adapters (owned fixtures; no daemon, socket or network)
// ---------------------------------------------------------------------------

#[derive(Clone, Default)]
struct Peer {
    calls: Arc<Mutex<Vec<Vec<String>>>>,
    queue: Arc<Mutex<VecDeque<Result<String, DockerError>>>>,
}

impl Peer {
    fn new(responses: Vec<Result<String, DockerError>>) -> Self {
        Self {
            calls: Arc::new(Mutex::new(Vec::new())),
            queue: Arc::new(Mutex::new(responses.into())),
        }
    }

    fn calls(&self) -> Vec<Vec<String>> {
        self.calls.lock().unwrap().clone()
    }
}

impl DockerRunner for Peer {
    fn run(&self, args: &[String]) -> impl Future<Output = Result<String, DockerError>> + Send {
        self.calls.lock().unwrap().push(args.to_vec());
        let next = self
            .queue
            .lock()
            .unwrap()
            .pop_front()
            .unwrap_or(Ok(String::new()));
        async move { next }
    }
}

/// Handles kept by the test while the `Host` itself is owned by the runner.
#[derive(Clone, Default)]
struct Recorder {
    sockets: Arc<Mutex<Vec<String>>>,
    launched: Arc<Mutex<Vec<Vec<String>>>>,
}

impl Recorder {
    fn launched(&self) -> Vec<Vec<String>> {
        self.launched.lock().unwrap().clone()
    }

    fn probed(&self) -> Vec<String> {
        self.sockets.lock().unwrap().clone()
    }
}

struct Host {
    docker_host: Option<String>,
    platform: &'static str,
    home: String,
    socket: bool,
    recorder: Recorder,
    peer: Arc<Mutex<VecDeque<Result<String, DockerError>>>>,
}

impl Host {
    fn new(
        docker_host: Option<&str>,
        platform: &'static str,
        home: &str,
        socket: bool,
        responses: Vec<Result<String, DockerError>>,
    ) -> (Self, Recorder) {
        let recorder = Recorder::default();
        (
            Self {
                docker_host: docker_host.map(str::to_string),
                platform,
                home: home.to_string(),
                socket,
                recorder: recorder.clone(),
                peer: Arc::new(Mutex::new(responses.into())),
            },
            recorder,
        )
    }
}

impl LocalDockerHost for Host {
    fn docker_host(&self) -> Option<String> {
        self.docker_host.clone()
    }

    fn platform(&self) -> DockerPlatform {
        DockerPlatform::from_name(self.platform)
    }

    fn home_dir(&self) -> String {
        self.home.clone()
    }

    fn socket_exists(&self, path: &str) -> bool {
        self.recorder.sockets.lock().unwrap().push(path.to_string());
        self.socket
    }

    fn launch(
        &self,
        program: &str,
        argv: &[String],
    ) -> impl Future<Output = Result<CommandOutput, DockerError>> + Send {
        let mut line = vec![program.to_string()];
        line.extend(argv.iter().cloned());
        self.recorder.launched.lock().unwrap().push(line);
        let next = self
            .peer
            .lock()
            .unwrap()
            .pop_front()
            .unwrap_or(Ok(String::new()));
        async move {
            next.map(|stdout| CommandOutput {
                stdout,
                stderr: String::new(),
            })
        }
    }
}

#[derive(Clone)]
struct TestClock(Arc<AtomicI64>);

impl TestClock {
    fn new(now: i64) -> Self {
        Self(Arc::new(AtomicI64::new(now)))
    }

    fn set(&self, now: i64) {
        self.0.store(now, Ordering::SeqCst);
    }
}

impl Clock for TestClock {
    fn now_ms(&self) -> i64 {
        self.0.load(Ordering::SeqCst)
    }
}

fn serialized(inventory: &impl serde::Serialize) -> Value {
    serde_json::to_value(inventory).unwrap()
}

// ---------------------------------------------------------------------------
// 1. Metadata projection
// ---------------------------------------------------------------------------

#[test]
fn metadata_projection_matches_typescript_for_every_row_shape() {
    let long_name = format!("/{}", "n".repeat(300));
    let long_image = format!("docker.io/library/nginx:{}", "t".repeat(600));
    let rows = vec![
        json!({"id": FULL_ID, "name": "/nginx", "image": "nginx:1.27", "state": "running",
               "created": "2026-10-20T06:00:00.000000000Z",
               "networks": {"bridge": {"IPAddress": "172.17.0.2"}}}),
        json!({"id": FULL_ID, "name": "nginx-no-slash", "image": "docker.io/library/redis:7",
               "state": "exited", "networks": {"bridge": {"IPAddress": "10.0.0.5"},
                                                "other": {"IPAddress": "10.0.0.5"}}}),
        json!({"id": FULL_ID, "name": "/pg", "image": "docker.io/postgres@sha256:deadbeef",
               "state": "running"}),
        json!({"id": FULL_ID, "name": "/ha", "image": "ghcr.io/home-assistant/home-assistant:stable",
               "state": "running"}),
        json!({"id": FULL_ID, "name": "/ha2", "image": "homeassistant/home-assistant",
               "state": "running"}),
        json!({"id": FULL_ID, "name": "/jait-agent-sb-1", "image": "jait/gateway:1",
               "state": "running", "networks": {"jait": {"IPAddress": "172.30.0.4"}}}),
        json!({"id": FULL_ID, "name": "jait-sb-2", "image": "jait/agent:latest", "state": "created"}),
        json!({"id": FULL_ID, "name": "/jait-sb-3", "image": "ubuntu:24.04", "state": "running"}),
        json!({"id": FULL_ID, "name": "/sandbox", "image": "", "state": "jait-sb-x"}),
        json!({"id": FULL_ID, "name": long_name, "image": long_image, "state": "running"}),
        // Networks in the shapes Docker may hand back.
        json!({"id": FULL_ID, "name": "/a", "image": "nginx", "state": "running",
               "networks": [{"IPAddress": "192.168.1.9"}, {"IPAddress": "not-an-ip"}]}),
        json!({"id": FULL_ID, "name": "/b", "image": "nginx", "state": "running", "networks": null}),
        json!({"id": FULL_ID, "name": "/c", "image": "nginx", "state": "running", "networks": "bridge"}),
        json!({"id": FULL_ID, "name": "/d", "image": "nginx", "state": "running",
               "networks": {"bridge": {"IPAddress": "999.1.1.1"}, "host": {"IPAddress": "1.2.3"}}}),
        json!({"id": FULL_ID, "name": "/e", "image": "nginx", "state": "running",
               "networks": {"bridge": [{"IPAddress": "10.9.9.9"}]}}),
        // Identity boundaries.
        json!({"id": SHORT_ID, "name": "/short", "image": "nginx", "state": "running"}),
        json!({"id": "0123456789a", "name": "/eleven", "image": "nginx", "state": "running"}),
        json!({"id": format!("{FULL_ID}a"), "name": "/long", "image": "nginx", "state": "running"}),
        json!({"id": FULL_ID.to_uppercase(), "name": "/upper", "image": "nginx", "state": "running"}),
        json!({"id": "z".repeat(64), "name": "/zz", "image": "nginx", "state": "running"}),
        json!({"id": FULL_ID, "name": 42, "image": "nginx", "state": "running"}),
        json!({"id": FULL_ID, "name": "/x", "image": null, "state": "running"}),
        json!({"id": FULL_ID, "name": "/y", "image": "nginx", "state": {"Status": "running"}}),
        json!(null),
        json!(42),
        json!("container"),
        json!([]),
        json!({"id": null}),
        // Extra fields must never reach the projection.
        json!({"id": FULL_ID, "name": "/leaky", "image": "nginx", "state": "running",
               "env": ["JWT_SECRET=super-secret"], "mounts": [{"Source": "/secret"}],
               "labels": {"token": "super-secret"},
               "config": {"Env": ["JWT_SECRET=super-secret"]},
               "networks": {"bridge": {"IPAddress": "172.17.0.3"}}}),
    ];

    let typescript = ts_resources(&rows);
    let native = native_resources(&rows);
    assert_eq!(
        native.len(),
        typescript.len(),
        "driver must answer every row"
    );
    for (index, (native_row, ts_row)) in native.iter().zip(typescript.iter()).enumerate() {
        assert_eq!(
            native_row, ts_row,
            "row {index} diverged from the TypeScript projection: {}",
            rows[index]
        );
    }

    // Identity rules and projection minimization, asserted on both sides.
    let accepted_short = &typescript[15]["id"];
    assert_eq!(accepted_short, &format!("docker-{SHORT_ID}"));
    assert_eq!(&native[15]["id"], accepted_short, "12-char ids map in both");
    assert!(
        native[16].is_null() && typescript[16].is_null(),
        "11-char id rejected"
    );
    assert!(
        native[17].is_null(),
        "65-char id rejected by the row mapper"
    );
    assert!(native[18].is_null(), "uppercase hex rejected");
    assert!(native[19].is_null(), "non-hex rejected");
    assert!(
        native[23..28].iter().all(Value::is_null),
        "non-object rows rejected"
    );

    let leaky = native.last().unwrap().to_string();
    assert!(
        !leaky.contains("super-secret"),
        "env/labels must not leak: {leaky}"
    );
    assert!(!leaky.contains("JWT_SECRET"));
    assert!(!leaky.contains("/secret"));
    assert!(
        !INSPECT_FORMAT.contains("Env")
            && !INSPECT_FORMAT.contains("Mounts")
            && !INSPECT_FORMAT.contains("Labels"),
        "the docker inspect projection must stay minimized"
    );
}

// ---------------------------------------------------------------------------
// 2. Endpoint guard and invocation plan
// ---------------------------------------------------------------------------

#[tokio::test]
async fn endpoint_guard_and_invocation_plan_match_typescript() {
    let listing_one = listing(&[FULL_ID.to_string()]);
    let row_one = json!({ "stdout": row(FULL_ID).to_string() });
    let responses = || vec![listing_one.clone(), row_one.clone()];

    struct Case {
        label: &'static str,
        docker_host: Option<&'static str>,
        platform: &'static str,
        home: &'static str,
        socket: bool,
        endpoint: Option<&'static str>,
        probes: usize,
    }

    let cases = [
        Case {
            label: "linux default socket",
            docker_host: None,
            platform: "linux",
            home: "/owned/home",
            socket: false,
            endpoint: Some("unix:///var/run/docker.sock"),
            probes: 2,
        },
        Case {
            label: "linux rootless socket",
            docker_host: None,
            platform: "linux",
            home: "/owned/home",
            socket: true,
            endpoint: Some("unix:///owned/home/.docker/run/docker.sock"),
            probes: 2,
        },
        Case {
            label: "windows named pipe",
            docker_host: None,
            platform: "win32",
            home: "C:/Users/owned",
            socket: true,
            endpoint: Some("npipe:////./pipe/docker_engine"),
            probes: 0,
        },
        Case {
            label: "configured unix socket",
            docker_host: Some("unix:///run/user/1000/docker.sock"),
            platform: "linux",
            home: "/owned/home",
            socket: false,
            endpoint: Some("unix:///run/user/1000/docker.sock"),
            probes: 0,
        },
        Case {
            label: "configured named pipe",
            docker_host: Some("npipe:////./pipe/alt"),
            platform: "win32",
            home: "C:/Users/owned",
            socket: false,
            endpoint: Some("npipe:////./pipe/alt"),
            probes: 0,
        },
        Case {
            label: "remote tcp context",
            docker_host: Some("tcp://10.1.2.3:2375"),
            platform: "linux",
            home: "/owned/home",
            socket: false,
            endpoint: None,
            probes: 0,
        },
        Case {
            label: "remote ssh context",
            docker_host: Some("ssh://docker@build-host"),
            platform: "linux",
            home: "/owned/home",
            socket: false,
            endpoint: None,
            probes: 0,
        },
        // TypeScript uses `configured ?? fallback`, so an empty string is passed
        // through verbatim rather than replaced by the platform default.
        Case {
            label: "empty configured host",
            docker_host: Some(""),
            platform: "linux",
            home: "/owned/home",
            socket: false,
            endpoint: Some(""),
            probes: 0,
        },
    ];

    let requests: Vec<Value> = cases
        .iter()
        .map(|case| {
            inventory_request(
                Some(host_json(
                    case.docker_host,
                    case.platform,
                    case.home,
                    case.socket,
                )),
                vec![1_700_000_000_000],
                responses(),
                None,
            )
        })
        .collect();
    let typescript = observe(requests);

    for (index, case) in cases.iter().enumerate() {
        let ts = &typescript[index];
        let (host, recorder) = Host::new(
            case.docker_host,
            case.platform,
            case.home,
            case.socket,
            vec![
                Ok(listing_one["stdout"].as_str().unwrap().to_string()),
                Ok(row(FULL_ID).to_string()),
            ],
        );
        let runner = LocalDockerRunner::new(host);
        let clock = TestClock::new(1_700_000_000_000);
        let inventory = DockerResourceInventory::with_clock(runner, clock);
        let native = serialized(&inventory.get().await);
        let launched = recorder.launched();

        assert_eq!(
            native, ts["results"][0],
            "{}: inventory diverged from TypeScript",
            case.label
        );
        assert_eq!(
            serde_json::to_value(&launched).unwrap(),
            ts["calls"],
            "{}: argv plan diverged from TypeScript",
            case.label
        );
        assert_eq!(
            launched.len(),
            if case.endpoint.is_some() { 2 } else { 0 },
            "{}: a remote endpoint must fail closed before spawning",
            case.label
        );

        match case.endpoint {
            Some(expected) => {
                let listing = &launched[0];
                assert_eq!(listing.len(), 3 + LIST_ARGV.len(), "{}", case.label);
                assert_eq!(listing[0], "docker", "{}", case.label);
                assert_eq!(listing[1], "--host", "{}", case.label);
                assert_eq!(listing[2], expected, "{}", case.label);
                assert_eq!(
                    listing[3..].to_vec(),
                    LIST_ARGV.map(str::to_string).to_vec(),
                    "{}: listing argv",
                    case.label
                );

                let inspect = &launched[1];
                assert_eq!(inspect[2], expected, "{}: inspect endpoint", case.label);
                assert_eq!(
                    inspect[3..6].to_vec(),
                    ["inspect", "--type", "container"]
                        .map(str::to_string)
                        .to_vec(),
                    "{}: inspect argv",
                    case.label
                );
                assert_eq!(inspect[7], INSPECT_FORMAT, "{}", case.label);
                assert_eq!(
                    inspect.last().unwrap(),
                    FULL_ID,
                    "{}: inspected id",
                    case.label
                );

                assert_eq!(native["status"], "available", "{}", case.label);
                assert_eq!(
                    recorder.probed().len(),
                    case.probes,
                    "{}: socket probes",
                    case.label
                );
                if case.docker_host.is_none() && case.platform == "linux" {
                    assert_eq!(
                        recorder.probed(),
                        vec!["/owned/home/.docker/run/docker.sock".to_string(); 2],
                        "{}: only the rootless socket is probed from the owned home",
                        case.label
                    );
                }

                let (probe_host, _) = Host::new(
                    case.docker_host,
                    case.platform,
                    case.home,
                    case.socket,
                    vec![],
                );
                assert_eq!(
                    resolve_endpoint(&probe_host).unwrap(),
                    expected,
                    "{}: resolve_endpoint",
                    case.label
                );
            }
            None => {
                assert_eq!(native["status"], "unavailable", "{}", case.label);
                assert!(
                    ts["calls"].as_array().unwrap().is_empty(),
                    "{}: TypeScript must not spawn",
                    case.label
                );
                assert!(
                    recorder.probed().is_empty(),
                    "{}: no socket probing for remote hosts",
                    case.label
                );
                let (probe_host, _) = Host::new(
                    case.docker_host,
                    case.platform,
                    case.home,
                    case.socket,
                    vec![],
                );
                assert_eq!(
                    resolve_endpoint(&probe_host).unwrap_err().kind,
                    DockerErrorKind::NonLocalEndpoint,
                    "{}",
                    case.label
                );
            }
        }
    }

    // Socket probing is the only filesystem touch and it is platform gated.
    let ts_probes = typescript[0]["sockets"].as_array().unwrap();
    assert_eq!(ts_probes.len(), 2);
    assert_eq!(ts_probes[0], "/owned/home/.docker/run/docker.sock");
    assert!(
        typescript[2]["sockets"].as_array().unwrap().is_empty(),
        "win32 must not probe sockets"
    );

    // Bounded execution options are asserted on the TypeScript side here and on
    // the native side through the shared constants.
    let options = &typescript[0]["options"][0];
    assert_eq!(options["timeout"], INSPECT_TIMEOUT_MS as i64);
    assert_eq!(options["maxBuffer"], INSPECT_MAX_BUFFER as i64);
    assert_eq!(options["windowsHide"], true);
}

// ---------------------------------------------------------------------------
// 3. Listing filter and inspect batching
// ---------------------------------------------------------------------------

#[tokio::test]
async fn listing_filter_and_inspect_batches_match_typescript() {
    let ids = [
        FULL_ID.to_string(),
        String::new(),
        SHORT_ID.to_string(),
        "a".repeat(63),
        "a".repeat(65),
        FULL_ID.to_uppercase(),
        format!("  {FULL_ID}  "),
        "g".repeat(64),
    ];
    let stdout = ids.join("\r\n");
    let response = row(FULL_ID).to_string();
    let request = inventory_request(
        None,
        vec![1_700_000_000_000],
        vec![json!({ "stdout": stdout }), json!({ "stdout": response })],
        None,
    );
    let ts = observe(vec![request]).remove(0);

    let peer = Peer::new(vec![Ok(stdout.clone()), Ok(response.clone())]);
    let clock = TestClock::new(1_700_000_000_000);
    let inventory = DockerResourceInventory::with_clock(peer.clone(), clock.clone());
    let native = serialized(&inventory.get().await);

    assert_eq!(native, ts["results"][0], "listing filter diverged");
    assert_eq!(
        serde_json::to_value(peer.calls()).unwrap(),
        ts["calls"],
        "argv diverged"
    );
    assert_eq!(peer.calls().len(), 2, "only one full id may be inspected");
    assert_eq!(
        peer.calls()[0],
        LIST_ARGV.map(str::to_string).to_vec(),
        "listing argv"
    );
    let inspect = &peer.calls()[1];
    assert_eq!(inspect.len(), 5 + 1, "one id, no padding batches");
    assert_eq!(inspect[..4].join(" "), "inspect --type container --format");
    assert_eq!(inspect[4], INSPECT_FORMAT);
    assert_eq!(inspect[5], FULL_ID);
    assert_eq!(native["truncated"], false);
    assert_eq!(native["resources"].as_array().unwrap().len(), 1);

    // 12-character ids are still valid *row* identities even though `ps` filters
    // them out; this asymmetry exists in both implementations.
    let short_row = json!({"id": SHORT_ID, "name": "/short", "image": "nginx", "state": "running"});
    let ts_short = ts_resources(std::slice::from_ref(&short_row));
    assert_eq!(ts_short[0]["id"], format!("docker-{SHORT_ID}"));
    assert_eq!(native_resources(&[short_row])[0], ts_short[0]);
}

// ---------------------------------------------------------------------------
// 4. Container cap, truncation flag and batch sizes at the boundary
// ---------------------------------------------------------------------------

#[tokio::test]
async fn container_cap_and_truncation_match_typescript() {
    for count in [MAX_CONTAINERS, MAX_CONTAINERS + 1] {
        let ids: Vec<String> = (1..=count).map(|index| format!("{index:064x}")).collect();
        let stdout = ids.join("\n");
        let ts = observe(vec![inventory_request(
            None,
            vec![1_700_000_000_000],
            vec![json!({ "stdout": stdout })],
            None,
        )])
        .remove(0);

        let peer = Peer::new(vec![Ok(stdout.clone())]);
        let clock = TestClock::new(1_700_000_000_000);
        let inventory = DockerResourceInventory::with_clock(peer.clone(), clock.clone());
        let native = serialized(&inventory.get().await);

        assert_eq!(native, ts["results"][0], "{count} containers diverged");
        assert_eq!(
            serde_json::to_value(peer.calls()).unwrap(),
            ts["calls"],
            "{count} containers: argv plan diverged"
        );
        let expected_batches = MAX_CONTAINERS.div_ceil(32);
        assert_eq!(
            peer.calls().len(),
            1 + expected_batches,
            "{count} containers: batch count"
        );
        for batch in &peer.calls()[1..] {
            assert_eq!(batch.len(), 5 + 32, "every batch carries 32 ids");
        }
        assert_eq!(
            native["truncated"],
            json!(count > MAX_CONTAINERS),
            "{count} containers: truncation flag"
        );
        // Only the first MAX_CONTAINERS ids may ever reach docker inspect.
        let calls = peer.calls();
        let inspected: Vec<&str> = calls[1..]
            .iter()
            .flat_map(|batch| batch[5..].iter().map(String::as_str))
            .collect();
        assert_eq!(inspected.len(), MAX_CONTAINERS);
        assert_eq!(inspected.first().copied(), Some(ids[0].as_str()));
        assert_eq!(
            inspected.last().copied(),
            Some(ids[MAX_CONTAINERS - 1].as_str())
        );
        assert!(native["resources"].as_array().unwrap().is_empty());
    }
}

// ---------------------------------------------------------------------------
// 5. Malformed output and cached failures
// ---------------------------------------------------------------------------

#[tokio::test]
async fn malformed_inspect_output_and_failure_cache_match_typescript() {
    let stdout = format!("{FULL_ID}\n");
    let nows = vec![1_700_000_000_000i64, 1_700_000_001_000];
    let ts = observe(vec![inventory_request(
        None,
        nows.clone(),
        vec![
            json!({ "stdout": stdout }),
            json!({ "stdout": "{not json}\n" }),
        ],
        None,
    )])
    .remove(0);

    let peer = Peer::new(vec![Ok(stdout.clone()), Ok("{not json}\n".to_string())]);
    let clock = TestClock::new(nows[0]);
    let inventory = DockerResourceInventory::with_clock(peer.clone(), clock.clone());
    let first = serialized(&inventory.get().await);
    clock.set(nows[1]);
    let second = serialized(&inventory.get().await);

    assert_eq!(
        first, ts["results"][0],
        "decode failure must degrade to unavailable"
    );
    assert_eq!(first["status"], "unavailable");
    assert_eq!(first.get("truncated"), None, "unavailable omits truncated");
    assert_eq!(second, ts["results"][1], "cached failure diverged");
    assert_eq!(serde_json::to_value(peer.calls()).unwrap(), ts["calls"]);
    assert_eq!(
        peer.calls().len(),
        2,
        "within TTL a failed collection is not retried"
    );
    let decode = DockerError::new(DockerErrorKind::Decode, "invalid docker inspect JSON");
    assert_eq!(decode.kind, DockerErrorKind::Decode);
}

// ---------------------------------------------------------------------------
// 6. TTL expiry and recovery
// ---------------------------------------------------------------------------

#[tokio::test]
async fn failure_cache_ttl_and_recovery_match_typescript() {
    let base = 1_700_000_000_000i64;
    let stdout = format!("{FULL_ID}\n");
    let response = row(FULL_ID).to_string();
    let ts = observe(vec![inventory_request(
        None,
        vec![base, base + TTL_MS - 1, base + TTL_MS],
        vec![
            json!({ "error": { "code": "ENOENT", "message": "spawn docker ENOENT" } }),
            json!({ "stdout": stdout }),
            json!({ "stdout": response }),
        ],
        None,
    )])
    .remove(0);

    let peer = Peer::new(vec![
        Err(DockerError::new(
            DockerErrorKind::Spawn {
                code: "ENOENT".into(),
            },
            "spawn docker ENOENT",
        )),
        Ok(stdout.clone()),
        Ok(response.clone()),
    ]);
    let clock = TestClock::new(base);
    let inventory = DockerResourceInventory::with_clock(peer.clone(), clock.clone());
    let mut native = Vec::new();
    for now in [base, base + TTL_MS - 1, base + TTL_MS] {
        clock.set(now);
        native.push(serialized(&inventory.get().await));
    }

    for (index, native_result) in native.iter().enumerate() {
        assert_eq!(
            native_result, &ts["results"][index],
            "step {index} diverged"
        );
    }
    assert_eq!(native[0]["status"], "unavailable", "spawn failure degrades");
    assert_eq!(
        native[1], native[0],
        "inside the TTL the failure is served from cache"
    );
    assert_eq!(
        native[2]["status"], "available",
        "expiry retries and recovers"
    );
    assert_eq!(serde_json::to_value(peer.calls()).unwrap(), ts["calls"]);
    assert_eq!(
        peer.calls().len(),
        3,
        "attempt, cache hit, retry (ps + inspect)"
    );
}

// ---------------------------------------------------------------------------
// 7. Coalescing of concurrent `get` calls
// ---------------------------------------------------------------------------

struct Gated {
    calls: Arc<AtomicUsize>,
    entered: tokio::sync::mpsc::UnboundedSender<()>,
    release: Arc<tokio::sync::Semaphore>,
    queue: Arc<Mutex<VecDeque<Result<String, DockerError>>>>,
}

impl DockerRunner for Gated {
    fn run(&self, _args: &[String]) -> impl Future<Output = Result<String, DockerError>> + Send {
        let index = self.calls.fetch_add(1, Ordering::SeqCst);
        let entered = self.entered.clone();
        let release = self.release.clone();
        let next = self
            .queue
            .lock()
            .unwrap()
            .pop_front()
            .unwrap_or(Ok(String::new()));
        async move {
            if index == 0 {
                let _ = entered.send(());
                if let Ok(permit) = release.acquire().await {
                    permit.forget();
                }
            }
            next
        }
    }
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn concurrent_gets_coalesce_into_one_collection() {
    let base = 1_700_000_000_000i64;
    let stdout = format!("{FULL_ID}\n");
    let response = row(FULL_ID).to_string();
    let ts = observe(vec![inventory_request(
        None,
        vec![base],
        vec![json!({ "stdout": stdout }), json!({ "stdout": response })],
        Some("concurrent"),
    )])
    .remove(0);

    let calls = Arc::new(AtomicUsize::new(0));
    let release = Arc::new(tokio::sync::Semaphore::new(0));
    let (entered, mut started) = tokio::sync::mpsc::unbounded_channel();
    let gated = Gated {
        calls: calls.clone(),
        entered,
        release: release.clone(),
        queue: Arc::new(Mutex::new(VecDeque::from(vec![
            Ok(stdout.clone()),
            Ok(response.clone()),
        ]))),
    };
    let clock = TestClock::new(base);
    let inventory = Arc::new(DockerResourceInventory::with_clock(gated, clock));

    let first = tokio::spawn({
        let inventory = inventory.clone();
        async move { inventory.get().await }
    });
    started
        .recv()
        .await
        .expect("the first collection must start");
    assert_eq!(calls.load(Ordering::SeqCst), 1);

    let second = tokio::spawn({
        let inventory = inventory.clone();
        async move { inventory.get().await }
    });
    let third = tokio::spawn({
        let inventory = inventory.clone();
        async move { inventory.get().await }
    });
    tokio::time::sleep(Duration::from_millis(50)).await;
    assert_eq!(
        calls.load(Ordering::SeqCst),
        1,
        "concurrent gets must join the in-flight collection instead of spawning more work"
    );

    release.add_permits(1);
    let (a, b, c) = (
        first.await.unwrap(),
        second.await.unwrap(),
        third.await.unwrap(),
    );
    assert_eq!(
        calls.load(Ordering::SeqCst),
        2,
        "exactly one ps and one inspect"
    );
    assert_eq!(a, b);
    assert_eq!(b, c);

    let native = serialized(&a);
    assert_eq!(native, ts["results"][0], "coalesced inventory diverged");
    assert_eq!(native, ts["inventory"]);
    for result in ts["results"].as_array().unwrap() {
        assert_eq!(
            result, &ts["results"][0],
            "every TypeScript caller saw one result"
        );
    }
    assert_eq!(
        ts["calls"].as_array().unwrap().len(),
        2,
        "TypeScript coalesced as well"
    );
    assert_eq!(native["status"], "available");
}

// ---------------------------------------------------------------------------
// 8. Shared limits and projection, cross-checked against the TypeScript source
// ---------------------------------------------------------------------------

#[test]
fn limits_and_projection_match_the_typescript_source() {
    assert_eq!(MAX_CONTAINERS, 512);
    assert_eq!(TTL_MS, 30_000);
    assert_eq!(INSPECT_TIMEOUT_MS, 8_000);
    assert_eq!(INSPECT_MAX_BUFFER, 8 * 1024 * 1024);
    assert_eq!(
        LIST_ARGV,
        ["ps", "--all", "--no-trunc", "--format", "{{.ID}}"]
    );
    let projection = r#"{"id":{{json .Id}},"name":{{json .Name}},"image":{{json .Config.Image}},"state":{{json .State.Status}},"created":{{json .Created}},"networks":{{json .NetworkSettings.Networks}}}"#;
    assert_eq!(INSPECT_FORMAT, projection);
    const {
        assert!(
            MAX_CONTAINERS >= 1 && 32 * 16 == MAX_CONTAINERS,
            "batch size 32 must divide the cap evenly"
        );
    }

    let source =
        fs::read_to_string(repo_root().join("packages/gateway/src/services/network-resources.ts"))
            .expect("TypeScript source must be readable for the parity check");
    assert!(source.contains("const MAX_CONTAINERS = 512"));
    assert!(source.contains("const TTL_MS = 30_000"));
    assert!(source.contains(&format!("'{projection}'")));
    assert!(source.contains("timeout: 8000, maxBuffer: 8 * 1024 * 1024, windowsHide: true"));
    assert!(
        source.contains("!configured.startsWith('unix://') && !configured.startsWith('npipe://')")
    );
    assert!(source.contains("offset += 32"));
    assert!(source.contains("/^[a-f0-9]{64}$/"));
    assert!(source.contains("/^[a-f0-9]{12,64}$/"));
}

#[test]
fn exact_utf16_wire_and_legacy_icon_keys_match_reference() {
    let rows = [
        json!({"id":FULL_ID,"name":format!("/{}😀","n".repeat(255)),"image":format!("{}😀","x".repeat(511)),"state":"running"}),
        json!({"id":FULL_ID,"name":"plain","image":"constructor:latest","state":"running"}),
        json!({"id":FULL_ID,"name":"plain","image":"__proto__","state":"running"}),
        json!({"id":FULL_ID,"name":"plain","image":"toString","state":"running"}),
    ];
    let expected = observe(rows.iter().map(|value|json!({"op":"nativenetworkresources.wire","value":value,"observedAt":OBSERVED})).collect());
    for (index, value) in rows.iter().enumerate() {
        assert_eq!(
            serde_json::to_string(&container_resource(value, OBSERVED)).unwrap(),
            expected[index].as_str().unwrap(),
            "row {index}"
        );
    }
}
