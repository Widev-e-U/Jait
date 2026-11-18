//! Port of `packages/gateway/scripts/security-smoke.ts`.
//!
//! The reference is an optional local-fixture validation run: it generates a
//! disposable certificate with `openssl`, stands up HTTP, HTTPS and SSH
//! fixtures on `127.0.0.1`, drives the assessment service and the security
//! workbench through eleven checks (each with its own refusal message), prints a
//! single-line JSON verdict, and always tears the fixtures down.
//!
//! # Platform boundary
//!
//! * The HTTP and SSH fixtures are real sockets over `std::net`, bound to
//!   `127.0.0.1:0`. The HTTP fixture answers with the reference's two headers and
//!   body, and honours the reference's mutable `fixed` toggle (nosniff is only
//!   sent once the run has recorded the missing-header finding). The response is
//!   hand-written HTTP/1.1 rather than produced by `node:http`, so it carries no
//!   `Date`/keep-alive metadata; only the fixture's own headers and body match
//!   the reference.
//! * The certificate step shells out to `openssl` with the reference's exact
//!   argument vector.
//! * The HTTPS fixture is **not** implementable here: the reference builds a
//!   TLS server from `node:https`, and this crate has no TLS server stack. The
//!   native run therefore reports [`SmokeError::UnsupportedCapability`] at the
//!   TLS check instead of pretending a TLS listener exists.
//! * Measurement itself is injected: the reference imports the concrete
//!   assessment service and workbench, while this crate's assessment layer is
//!   adapter-driven. [`SecuritySmokeMeasurement`] is the seam, and
//!   [`run_security_smoke`] keeps the reference's check order, its exact refusal
//!   messages, and its report shape. Tests drive it with scripted measurements;
//!   wiring it to a live adapter is the caller's job.
use std::{
    ffi::OsString,
    fs,
    io::{self, Read, Write},
    net::{Ipv4Addr, SocketAddr, TcpListener, TcpStream},
    path::{Path, PathBuf},
    process::Command,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    thread::{self, JoinHandle},
    time::Duration,
};

use serde::Serialize;

/// Body served by both HTTP fixtures.
pub const FIXTURE_BODY: &str = "fixture body, discarded";
/// Header the HTTP fixture emits only after the missing-header finding exists.
pub const NOSNIFF_HEADER: (&str, &str) = ("X-Content-Type-Options", "nosniff");
/// Header the HTTP fixture always emits.
pub const FRAME_OPTIONS_HEADER: (&str, &str) = ("X-Frame-Options", "DENY");
/// Banner the SSH fixture writes and the reference's comment-discard check reads.
pub const SSH_BANNER: &str = "SSH-2.0-FixtureSSH_1.0 private comment discarded\r\n";
/// Principal the reference passes to every workbench and service call.
pub const PRINCIPAL: &str = "bun-fixture";
/// Target address all fixtures are reached on.
pub const TARGET: &str = "127.0.0.1";
/// Server name used for the TLS identity check.
pub const SERVER_NAME: &str = "fixture.example";
/// Profile that records the missing-header finding.
pub const NOSNIFF_RULE_ID: &str = "http.nosniff";
/// Policy finding the trivy config scan must produce for an insecure Dockerfile.
pub const NONROOT_RULE_ID: &str = "trivy.config.AVD-DS-0002";
/// Policy finding the HTTPS fixture must produce.
pub const HSTS_RULE_ID: &str = "http.hsts";
/// Methods the reference requests in its assessment scope.
pub const SCOPE_METHODS: [&str; 10] = [
    "tcp",
    "tls",
    "http",
    "https",
    "ssh",
    "host-audit",
    "nmap",
    "nuclei",
    "trivy",
    "telemetry",
];
/// Files the scope declares for path-based profiles.
pub const SCOPE_PATHS: [&str; 2] = ["Dockerfile", "alerts.jsonl"];
/// Insecure fixture Dockerfile that must yield the non-root policy finding.
pub const INSECURE_DOCKERFILE: &str = "FROM alpine:3.20\nCMD [\"sleep\",\"3600\"]\n";
/// Remediated fixture Dockerfile that must make the finding verify absent.
pub const REMEDIATED_DOCKERFILE: &str =
    "FROM alpine:3.20\nRUN adduser -D app\nUSER app\nHEALTHCHECK NONE\nCMD [\"sleep\",\"3600\"]\n";
/// Telemetry fixture the reference writes before the import check.
pub const TELEMETRY_FIXTURE: &str = "{\"event_type\":\"alert\",\"dest_ip\":\"127.0.0.1\",\"alert\":{\"signature_id\":42,\"signature\":\"untrusted content discarded\"}}";
/// Status the reference requires for a successful measurement.
pub const STATUS_COMPLETED: &str = "completed";
/// Status a telemetry import must report, because it cannot verify independently.
pub const STATUS_PARTIAL: &str = "partial";
/// Finding status a telemetry import must report.
pub const STATUS_SUSPECTED: &str = "suspected";
/// Verification verdict that means the finding disappeared after remediation.
pub const VERDICT_VERIFIED_ABSENT: &str = "verified-absent";
/// Observation state the native inventory must report.
pub const OBSERVATION_OPEN: &str = "open";

/// Refusals raised by the smoke run.
#[derive(Debug)]
pub enum SmokeError {
    /// A required external tool was not found.
    MissingTool { tool: String },
    /// `openssl` did not produce a usable certificate.
    CertificateGeneration { detail: String },
    /// A check failed, with the reference's wording.
    Assertion { message: String },
    /// A capability the reference relies on does not exist in this crate.
    UnsupportedCapability { capability: String },
    /// Filesystem failure, with the path that failed.
    Io { path: PathBuf, source: io::Error },
    /// Socket failure while standing up a fixture.
    Fixture { detail: String },
}

impl SmokeError {
    fn io(path: impl Into<PathBuf>, source: io::Error) -> Self {
        Self::Io {
            path: path.into(),
            source,
        }
    }

    fn assertion(message: impl Into<String>) -> Self {
        Self::Assertion {
            message: message.into(),
        }
    }
}

impl std::fmt::Display for SmokeError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::MissingTool { tool } => {
                write!(formatter, "Required tool {tool} is not available")
            }
            Self::CertificateGeneration { .. } => {
                formatter.write_str("Could not generate disposable certificate")
            }
            Self::Assertion { message } => formatter.write_str(message),
            Self::UnsupportedCapability { capability } => write!(
                formatter,
                "Native security smoke cannot provide {capability}"
            ),
            Self::Io { path, source } => write!(formatter, "{}: {source}", path.display()),
            Self::Fixture { detail } => write!(formatter, "Fixture failure: {detail}"),
        }
    }
}

impl std::error::Error for SmokeError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Io { source, .. } => Some(source),
            _ => None,
        }
    }
}

/// The exact `openssl req` argument vector the reference runs.
pub fn certificate_argv(key: &Path, certificate: &Path) -> Vec<OsString> {
    vec![
        OsString::from("req"),
        OsString::from("-x509"),
        OsString::from("-newkey"),
        OsString::from("rsa:2048"),
        OsString::from("-nodes"),
        OsString::from("-keyout"),
        key.as_os_str().to_os_string(),
        OsString::from("-out"),
        certificate.as_os_str().to_os_string(),
        OsString::from("-days"),
        OsString::from("2"),
        OsString::from("-subj"),
        OsString::from("/CN=fixture.example"),
        OsString::from("-addext"),
        OsString::from("subjectAltName=DNS:fixture.example,IP:127.0.0.1"),
    ]
}

/// Generate the disposable certificate/key pair into `root`.
pub fn generate_certificate(root: &Path) -> Result<(PathBuf, PathBuf), SmokeError> {
    let certificate = root.join("certificate.pem");
    let key = root.join("key.pem");
    let output = Command::new("openssl")
        .args(certificate_argv(&key, &certificate))
        .output()
        .map_err(|error| match error.kind() {
            io::ErrorKind::NotFound => SmokeError::MissingTool {
                tool: "openssl".to_string(),
            },
            _ => SmokeError::io("openssl", error),
        })?;
    if !output.status.success() {
        return Err(SmokeError::CertificateGeneration {
            detail: String::from_utf8_lossy(&output.stderr).into_owned(),
        });
    }
    if !certificate.exists() || !key.exists() {
        return Err(SmokeError::CertificateGeneration {
            detail: "openssl reported success without writing both files".to_string(),
        });
    }
    Ok((certificate, key))
}

/// One parsed response from the HTTP fixture.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FixtureResponse {
    /// Numeric status from the status line.
    pub status: u16,
    /// Header names lowercased, in wire order.
    pub headers: Vec<(String, String)>,
    /// Response body.
    pub body: String,
}

impl FixtureResponse {
    /// Case-insensitive header lookup.
    pub fn header(&self, name: &str) -> Option<&str> {
        let wanted = name.to_ascii_lowercase();
        self.headers
            .iter()
            .find(|(header, _)| *header == wanted)
            .map(|(_, value)| value.as_str())
    }
}

fn respond(stream: &mut TcpStream, nosniff: bool) -> io::Result<()> {
    let _ = stream.set_read_timeout(Some(Duration::from_millis(500)));
    let mut request = Vec::new();
    let mut chunk = [0u8; 1024];
    while request.len() < 8192 && !request.windows(4).any(|part| part == b"\r\n\r\n") {
        let read = stream.read(&mut chunk)?;
        if read == 0 {
            break;
        }
        request.extend_from_slice(&chunk[..read]);
    }
    let mut response = String::from("HTTP/1.1 200 OK\r\n");
    if nosniff {
        response.push_str(&format!("{}: {}\r\n", NOSNIFF_HEADER.0, NOSNIFF_HEADER.1));
    }
    response.push_str(&format!(
        "{}: {}\r\n",
        FRAME_OPTIONS_HEADER.0, FRAME_OPTIONS_HEADER.1
    ));
    response.push_str(&format!("Content-Length: {}\r\n", FIXTURE_BODY.len()));
    response.push_str("Connection: close\r\n\r\n");
    response.push_str(FIXTURE_BODY);
    stream.write_all(response.as_bytes())?;
    stream.flush()
}

/// Loopback HTTP fixture with the reference's mutable `fixed` toggle.
#[derive(Debug)]
pub struct HttpFixture {
    addr: SocketAddr,
    fixed: Arc<AtomicBool>,
    shutdown: Arc<AtomicBool>,
    worker: Option<JoinHandle<()>>,
}

impl HttpFixture {
    /// Bind `127.0.0.1:0` and start answering requests.
    pub fn start() -> Result<Self, SmokeError> {
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0))
            .map_err(|error| SmokeError::io("http fixture", error))?;
        listener
            .set_nonblocking(true)
            .map_err(|error| SmokeError::io("http fixture", error))?;
        let addr = listener
            .local_addr()
            .map_err(|error| SmokeError::io("http fixture", error))?;
        let fixed = Arc::new(AtomicBool::new(false));
        let shutdown = Arc::new(AtomicBool::new(false));
        let worker = {
            let fixed = Arc::clone(&fixed);
            let shutdown = Arc::clone(&shutdown);
            thread::spawn(move || {
                while !shutdown.load(Ordering::SeqCst) {
                    match listener.accept() {
                        Ok((mut stream, _)) => {
                            let _ = respond(&mut stream, fixed.load(Ordering::SeqCst));
                        }
                        Err(error) if error.kind() == io::ErrorKind::WouldBlock => {
                            thread::sleep(Duration::from_millis(2));
                        }
                        Err(_) => break,
                    }
                }
            })
        };
        Ok(Self {
            addr,
            fixed,
            shutdown,
            worker: Some(worker),
        })
    }

    /// Port the fixture listens on.
    pub fn port(&self) -> u16 {
        self.addr.port()
    }

    /// Address the fixture listens on.
    pub fn addr(&self) -> SocketAddr {
        self.addr
    }

    /// Current value of the reference's `fixed` flag.
    pub fn fixed(&self) -> bool {
        self.fixed.load(Ordering::SeqCst)
    }

    /// Set the reference's `fixed` flag.
    pub fn set_fixed(&self, value: bool) {
        self.fixed.store(value, Ordering::SeqCst);
    }

    /// Issue `GET <path>` and parse the response.
    pub fn get(&self, path: &str) -> io::Result<FixtureResponse> {
        let mut stream = TcpStream::connect(self.addr)?;
        stream.set_read_timeout(Some(Duration::from_secs(5)))?;
        write!(
            stream,
            "GET {path} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n"
        )?;
        stream.flush()?;
        let mut raw = Vec::new();
        stream.read_to_end(&mut raw)?;
        parse_response(&String::from_utf8_lossy(&raw))
    }

    /// Stop the accept loop.
    pub fn close(mut self) {
        self.stop();
    }

    fn stop(&mut self) {
        self.shutdown.store(true, Ordering::SeqCst);
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}

impl Drop for HttpFixture {
    fn drop(&mut self) {
        self.stop();
    }
}

/// Parse an HTTP/1.x response into status, headers and body.
pub fn parse_response(raw: &str) -> io::Result<FixtureResponse> {
    let (head, body) = raw.split_once("\r\n\r\n").ok_or_else(|| {
        io::Error::new(io::ErrorKind::InvalidData, "response has no header block")
    })?;
    let mut lines = head.split("\r\n");
    let status_line = lines
        .next()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidData, "response has no status line"))?;
    let status = status_line
        .split_whitespace()
        .nth(1)
        .and_then(|code| code.parse::<u16>().ok())
        .ok_or_else(|| {
            io::Error::new(io::ErrorKind::InvalidData, "response status is not numeric")
        })?;
    let headers = lines
        .filter_map(|line| line.split_once(':'))
        .map(|(name, value)| (name.trim().to_ascii_lowercase(), value.trim().to_string()))
        .collect();
    Ok(FixtureResponse {
        status,
        headers,
        body: body.to_string(),
    })
}

/// Loopback SSH banner fixture, mirroring the reference's comment-discarding
/// identification exchange.
#[derive(Debug)]
pub struct SshFixture {
    addr: SocketAddr,
    shutdown: Arc<AtomicBool>,
    worker: Option<JoinHandle<()>>,
}

impl SshFixture {
    /// Bind `127.0.0.1:0` and start answering with [`SSH_BANNER`].
    pub fn start() -> Result<Self, SmokeError> {
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0))
            .map_err(|error| SmokeError::io("ssh fixture", error))?;
        listener
            .set_nonblocking(true)
            .map_err(|error| SmokeError::io("ssh fixture", error))?;
        let addr = listener
            .local_addr()
            .map_err(|error| SmokeError::io("ssh fixture", error))?;
        let shutdown = Arc::new(AtomicBool::new(false));
        let worker = {
            let shutdown = Arc::clone(&shutdown);
            thread::spawn(move || {
                while !shutdown.load(Ordering::SeqCst) {
                    match listener.accept() {
                        Ok((mut stream, _)) => {
                            let _ = stream.set_read_timeout(Some(Duration::from_millis(500)));
                            let _ = stream.write_all(SSH_BANNER.as_bytes());
                            let _ = stream.flush();
                            let _ = stream.shutdown(std::net::Shutdown::Both);
                        }
                        Err(error) if error.kind() == io::ErrorKind::WouldBlock => {
                            thread::sleep(Duration::from_millis(2));
                        }
                        Err(_) => break,
                    }
                }
            })
        };
        Ok(Self {
            addr,
            shutdown,
            worker: Some(worker),
        })
    }

    /// Port the fixture listens on.
    pub fn port(&self) -> u16 {
        self.addr.port()
    }

    /// Read the identification string, as a scanner would.
    pub fn read_banner(&self) -> io::Result<String> {
        let mut stream = TcpStream::connect(self.addr)?;
        stream.set_read_timeout(Some(Duration::from_secs(5)))?;
        let mut banner = String::new();
        stream.read_to_string(&mut banner)?;
        Ok(banner)
    }

    /// Stop the accept loop.
    pub fn close(mut self) {
        self.stop();
    }

    fn stop(&mut self) {
        self.shutdown.store(true, Ordering::SeqCst);
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}

impl Drop for SshFixture {
    fn drop(&mut self) {
        self.stop();
    }
}

/// Fixtures plus the disposable certificate for one smoke run.
///
/// Dropping the set closes both servers and removes the temporary root, which is
/// the reference's `finally` block.
#[derive(Debug)]
pub struct SmokeFixtures {
    root: PathBuf,
    certificate: PathBuf,
    key: PathBuf,
    http: HttpFixture,
    ssh: SshFixture,
    tls_port: Option<u16>,
}

impl SmokeFixtures {
    /// Create a temporary root, generate the certificate, and start both
    /// implementable fixtures.
    pub fn start() -> Result<Self, SmokeError> {
        let base =
            Path::new(env!("CARGO_MANIFEST_DIR")).join("../../.jait/artifacts/security-smoke");
        Self::start_in(&base)
    }

    /// Create an owned fixture directory inside `root`; the parent is never removed.
    pub fn start_in(root: &Path) -> Result<Self, SmokeError> {
        fs::create_dir_all(root).map_err(|error| SmokeError::io(root, error))?;
        let owned = temporary_root(root)?;
        let result = (|| {
            let (certificate, key) = generate_certificate(&owned)?;
            Ok(Self {
                root: owned.clone(),
                certificate,
                key,
                http: HttpFixture::start()?,
                ssh: SshFixture::start()?,
                tls_port: None,
            })
        })();
        if result.is_err() {
            let _ = fs::remove_dir_all(&owned);
        }
        result
    }

    /// Temporary root holding the fixtures' files.
    pub fn root(&self) -> &Path {
        &self.root
    }

    /// Generated certificate path.
    pub fn certificate(&self) -> &Path {
        &self.certificate
    }

    /// Generated private key path.
    pub fn key(&self) -> &Path {
        &self.key
    }

    /// HTTP fixture.
    pub fn http(&self) -> &HttpFixture {
        &self.http
    }

    /// SSH fixture.
    pub fn ssh(&self) -> &SshFixture {
        &self.ssh
    }

    /// Attach an externally provided TLS endpoint.
    ///
    /// The reference stands up its own HTTPS fixture from the disposable
    /// certificate; this crate has no TLS server stack, so a caller that wants
    /// the full check sequence attaches the port of a TLS endpoint it provides
    /// itself. Without one, [`run_security_smoke`] refuses at the TLS check.
    pub fn with_tls_port(mut self, port: u16) -> Self {
        self.tls_port = Some(port);
        self
    }

    /// Ports the reference would advertise as `[httpPort, tlsPort, sshPort]`.
    ///
    /// The TLS slot is `None` until [`SmokeFixtures::with_tls_port`] attaches an
    /// endpoint this crate cannot create itself.
    pub fn ports(&self) -> (u16, Option<u16>, u16) {
        (self.http.port(), self.tls_port, self.ssh.port())
    }

    /// Write a file under the fixture root, as the reference does with
    /// `writeFile`.
    pub fn write_fixture(&self, name: &str, contents: &str) -> Result<PathBuf, SmokeError> {
        if !SCOPE_PATHS.contains(&name) {
            return Err(SmokeError::Fixture {
                detail: "invalid fixture name".into(),
            });
        }
        let path = self.root.join(name);
        fs::write(&path, contents).map_err(|error| SmokeError::io(&path, error))?;
        Ok(path)
    }
}

impl Drop for SmokeFixtures {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.root);
    }
}

fn temporary_root(base: &Path) -> Result<PathBuf, SmokeError> {
    for attempt in 0..64u32 {
        let candidate = base.join(format!(
            "jait-bun-security-{}-{attempt}",
            std::process::id()
        ));
        match fs::create_dir(&candidate) {
            Ok(()) => return Ok(candidate),
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(SmokeError::io(&candidate, error)),
        }
    }
    Err(SmokeError::Fixture {
        detail: "could not allocate a temporary fixture root".to_string(),
    })
}

/// Assessment scope the reference requests, serialized with its field names.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FixtureScope {
    /// Hosts under assessment.
    pub targets: Vec<String>,
    /// Addresses excluded from assessment.
    pub exclusions: Vec<String>,
    /// Ports declared up front (HTTP, TLS, SSH; the TLS entry is omitted when
    /// the TLS fixture is unavailable).
    pub ports: Vec<u16>,
    /// Enabled measurement methods.
    pub methods: Vec<String>,
    /// Paths the path-based profiles may read.
    pub paths: Vec<String>,
    /// Names used for TLS identity checks.
    pub server_names: Vec<String>,
    /// Whether the operator asserted authorization.
    pub authorized: bool,
    /// ISO-8601 expiry.
    pub expires_at: String,
}

impl FixtureScope {
    /// Build the reference's scope for the given ports and expiry.
    pub fn new(ports: Vec<u16>, expires_at: impl Into<String>) -> Self {
        Self {
            targets: vec![TARGET.to_string()],
            exclusions: Vec::new(),
            ports,
            methods: SCOPE_METHODS
                .iter()
                .map(|value| value.to_string())
                .collect(),
            paths: SCOPE_PATHS.iter().map(|value| value.to_string()).collect(),
            server_names: vec![SERVER_NAME.to_string()],
            authorized: true,
            expires_at: expires_at.into(),
        }
    }
}

/// Measurement profiles the reference drives.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SmokeProfile {
    Tcp,
    Tls,
    Http,
    Https,
    Ssh,
    HostAudit,
    Nmap,
    Nuclei,
    Trivy,
    Telemetry,
}

impl SmokeProfile {
    /// Profile name used by the workbench API.
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Tcp => "tcp",
            Self::Tls => "tls",
            Self::Http => "http",
            Self::Https => "https",
            Self::Ssh => "ssh",
            Self::HostAudit => "host-audit",
            Self::Nmap => "nmap",
            Self::Nuclei => "nuclei",
            Self::Trivy => "trivy",
            Self::Telemetry => "telemetry",
        }
    }
}

/// One workbench start input.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProfileInput {
    /// Scope the run belongs to.
    pub scope_id: String,
    /// Profile to run.
    pub profile: SmokeProfile,
    /// Target address.
    pub target: Option<String>,
    /// Port for network profiles.
    pub port: Option<u16>,
    /// Name for TLS identity checks.
    pub server_name: Option<String>,
    /// Path for path-based profiles.
    pub path: Option<String>,
    /// Telemetry source name.
    pub source: Option<String>,
}

impl ProfileInput {
    /// Network-profile input for `profile` on `port`.
    pub fn network(scope_id: &str, profile: SmokeProfile, port: u16) -> Self {
        Self {
            scope_id: scope_id.to_string(),
            profile,
            target: Some(TARGET.to_string()),
            port: Some(port),
            server_name: None,
            path: None,
            source: None,
        }
    }

    /// Host-audit input.
    pub fn host_audit(scope_id: &str) -> Self {
        Self {
            scope_id: scope_id.to_string(),
            profile: SmokeProfile::HostAudit,
            target: Some(TARGET.to_string()),
            port: None,
            server_name: None,
            path: None,
            source: None,
        }
    }

    /// Path-profile input for `profile` reading `path`.
    pub fn with_path(mut self, path: &str) -> Self {
        self.path = Some(path.to_string());
        self
    }

    /// Telemetry input for `source` reading `path`.
    pub fn telemetry(scope_id: &str, source: &str, path: &str) -> Self {
        Self {
            scope_id: scope_id.to_string(),
            profile: SmokeProfile::Telemetry,
            target: Some(TARGET.to_string()),
            port: None,
            server_name: None,
            path: Some(path.to_string()),
            source: Some(source.to_string()),
        }
    }

    /// Set the TLS server name.
    pub fn with_server_name(mut self, server_name: &str) -> Self {
        self.server_name = Some(server_name.to_string());
        self
    }
}

/// Finding as the assertions read it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SmokeFinding {
    /// Opaque finding identifier used for verification.
    pub id: String,
    /// Rule that produced the finding.
    pub rule_id: String,
    /// Finding status (`suspected`, `confirmed`, ...).
    pub status: String,
}

/// Evidence record as the assertions read it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SmokeEvidence {
    /// Structured facts; keys are read by name.
    pub facts: serde_json::Value,
}

impl SmokeEvidence {
    /// Read a boolean fact, mirroring the reference's `facts.x === true/false`.
    pub fn fact_bool(&self, key: &str) -> Option<bool> {
        self.facts.get(key).and_then(serde_json::Value::as_bool)
    }
}

/// Observation from the native inventory run.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SmokeObservation {
    /// Port/service state.
    pub state: String,
}

/// Result of one workbench or service run.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SmokeRun {
    /// Run status.
    pub status: String,
    /// Findings produced.
    pub findings: Vec<SmokeFinding>,
    /// Evidence produced.
    pub evidence: Vec<SmokeEvidence>,
    /// Observations produced by the native inventory.
    pub observations: Vec<SmokeObservation>,
    /// Coverage gaps, echoed in the nmap/nuclei refusal message.
    pub coverage_gaps: serde_json::Value,
}

impl SmokeRun {
    /// A completed run with no findings, evidence, or observations.
    pub fn completed() -> Self {
        Self {
            status: STATUS_COMPLETED.to_string(),
            findings: Vec::new(),
            evidence: Vec::new(),
            observations: Vec::new(),
            coverage_gaps: serde_json::Value::Null,
        }
    }

    /// A run with an arbitrary status.
    pub fn with_status(status: &str) -> Self {
        Self {
            status: status.to_string(),
            ..Self::completed()
        }
    }

    /// Whether the run reached [`STATUS_COMPLETED`].
    pub fn is_completed(&self) -> bool {
        self.status == STATUS_COMPLETED
    }

    /// First finding with `rule_id`.
    pub fn finding(&self, rule_id: &str) -> Option<&SmokeFinding> {
        self.findings
            .iter()
            .find(|finding| finding.rule_id == rule_id)
    }

    /// First evidence record.
    pub fn first_evidence(&self) -> Option<&SmokeEvidence> {
        self.evidence.first()
    }

    /// Add a finding. Measurement implementations live outside this crate, so
    /// this is the only way for them to populate a run.
    pub fn add_finding(mut self, id: &str, rule_id: &str, status: &str) -> Self {
        self.findings.push(SmokeFinding {
            id: id.to_string(),
            rule_id: rule_id.to_string(),
            status: status.to_string(),
        });
        self
    }

    /// Add an evidence record with `facts`.
    pub fn add_evidence(mut self, facts: serde_json::Value) -> Self {
        self.evidence.push(SmokeEvidence { facts });
        self
    }

    /// Add an observation with `state`.
    pub fn add_observation(mut self, state: &str) -> Self {
        self.observations.push(SmokeObservation {
            state: state.to_string(),
        });
        self
    }
}

/// The workbench surface the smoke run drives.
///
/// The reference uses the concrete assessment service and workbench directly;
/// this crate's assessment layer is adapter-driven, so the smoke takes the same
/// operations through this seam.
pub trait SecuritySmokeMeasurement {
    /// Resolve the current scope owned by `principal`. Deny unknown, revoked,
    /// foreign or unavailable scopes. This must consult authoritative state.
    fn resolve_scope(
        &mut self,
        principal: &str,
        scope_id: &str,
    ) -> Result<FixtureScope, SmokeError>;

    /// Adapters must revalidate authority at every actual I/O dispatch, enforce
    /// the input and scope, and stop/clean up promptly on cancellation or expiry.
    fn run_profile(
        &mut self,
        input: &ProfileInput,
        cancellation: &SmokeCancellation,
    ) -> Result<SmokeRun, SmokeError>;
    /// Bind the finding to this scope and original input before re-running it.
    fn verify_finding(
        &mut self,
        finding_id: &str,
        input: &ProfileInput,
        cancellation: &SmokeCancellation,
    ) -> Result<String, SmokeError>;
    /// Native TCP inventory is limited to these fixture ports and must obey
    /// the same scope and cancellation contract.
    fn native_inventory(
        &mut self,
        input: &ProfileInput,
        ports: &[u16],
        cancellation: &SmokeCancellation,
    ) -> Result<SmokeRun, SmokeError>;
    fn runtime_version(&self) -> String;
}

/// Cooperative cancellation shared with the assessment adapter.
#[derive(Clone, Default)]
pub struct SmokeCancellation(Arc<AtomicBool>);
impl SmokeCancellation {
    pub fn cancel(&self) {
        self.0.store(true, Ordering::SeqCst);
    }
    pub fn is_cancelled(&self) -> bool {
        self.0.load(Ordering::SeqCst)
    }
}

/// Checks are repeated at each smoke effect boundary. This is defense in depth:
/// the adapter must enforce authority and cancellation inside its own effects.
struct SmokeGuard<'a> {
    measurement: &'a mut dyn SecuritySmokeMeasurement,
    scope_id: &'a str,
    expires_at: &'a str,
    ports: [u16; 3],
    cancellation: &'a SmokeCancellation,
}
impl SmokeGuard<'_> {
    fn check(&mut self) -> Result<(), SmokeError> {
        if self.cancellation.is_cancelled() {
            return Err(SmokeError::assertion("Fixture smoke cancelled"));
        }
        ensure_scope_unexpired(self.expires_at)?;
        let scope = self.measurement.resolve_scope(PRINCIPAL, self.scope_id)?;
        ensure_scope_unexpired(&scope.expires_at)?;
        let expiry = chrono::DateTime::parse_from_rfc3339(self.expires_at)
            .map_err(|_| SmokeError::assertion("Invalid fixture scope expiry"))?;
        let actual = chrono::DateTime::parse_from_rfc3339(&scope.expires_at)
            .map_err(|_| SmokeError::assertion("Invalid authoritative scope expiry"))?;
        if self.scope_id.is_empty()
            || !scope.authorized
            || actual != expiry
            || !scope.targets.iter().any(|v| v == TARGET)
            || scope.exclusions.iter().any(|v| v == TARGET)
            || self
                .ports
                .iter()
                .any(|p| *p == 0 || !scope.ports.contains(p))
            || SCOPE_METHODS
                .iter()
                .any(|m| !scope.methods.iter().any(|v| v == m))
            || SCOPE_PATHS
                .iter()
                .any(|p| !scope.paths.iter().any(|v| v == p))
            || !scope.server_names.iter().any(|v| v == SERVER_NAME)
        {
            return Err(SmokeError::assertion(
                "Fixture scope does not authorize this smoke run",
            ));
        }
        if self.cancellation.is_cancelled() {
            return Err(SmokeError::assertion("Fixture smoke cancelled"));
        }
        ensure_scope_unexpired(&scope.expires_at)
    }
    fn check_input(&self, input: &ProfileInput) -> Result<(), SmokeError> {
        if input.scope_id != self.scope_id
            || !SCOPE_METHODS.contains(&input.profile.as_str())
            || input.target.as_deref().is_some_and(|v| v != TARGET)
            || input.port.is_some_and(|v| !self.ports.contains(&v))
            || input
                .path
                .as_deref()
                .is_some_and(|v| !SCOPE_PATHS.contains(&v))
            || input
                .server_name
                .as_deref()
                .is_some_and(|v| v != SERVER_NAME)
        {
            return Err(SmokeError::assertion("Fixture input outside smoke scope"));
        }
        Ok(())
    }
    fn run_profile(&mut self, input: &ProfileInput) -> Result<SmokeRun, SmokeError> {
        self.check_input(input)?;
        self.check()?;
        let result = self.measurement.run_profile(input, self.cancellation)?;
        self.check()?;
        Ok(result)
    }
    fn verify_finding(&mut self, id: &str, input: &ProfileInput) -> Result<String, SmokeError> {
        self.check_input(input)?;
        self.check()?;
        let result = self
            .measurement
            .verify_finding(id, input, self.cancellation)?;
        self.check()?;
        Ok(result)
    }
    fn native_inventory(&mut self, input: &ProfileInput) -> Result<SmokeRun, SmokeError> {
        self.check_input(input)?;
        self.check()?;
        let result = self
            .measurement
            .native_inventory(input, &self.ports, self.cancellation)?;
        self.check()?;
        Ok(result)
    }
}

/// The reference's single-line verdict, in its key order.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SmokeReport {
    /// Runtime that performed the measurements.
    pub runtime: String,
    /// TCP inventory passed.
    pub tcp: String,
    /// TLS certificate measurement passed.
    pub tls: String,
    /// HTTPS policy check passed.
    pub https: String,
    /// SSH identification passed.
    pub ssh_identification: String,
    /// Local host inventory passed.
    pub local_host_audit: String,
    /// Header finding verified fixed.
    pub http_issue_fix_verification: String,
    /// nmap profile passed.
    pub nmap: String,
    /// Nuclei finding verified fixed.
    pub nuclei_issue_fix_verification: String,
    /// Trivy finding verified fixed.
    pub trivy_issue_fix_verification: String,
    /// Telemetry import kept unverified.
    pub telemetry_unverified_import: String,
}

/// Verdict value used for every passing check.
pub const PASSED: &str = "passed";

impl SmokeReport {
    /// Compact JSON line the reference prints.
    pub fn to_line(&self) -> String {
        serde_json::to_string(self).unwrap_or_else(|_| "{}".to_string())
    }

    fn all_passed(runtime: String) -> Self {
        let passed = || PASSED.to_string();
        Self {
            runtime,
            tcp: passed(),
            tls: passed(),
            https: passed(),
            ssh_identification: passed(),
            local_host_audit: passed(),
            http_issue_fix_verification: passed(),
            nmap: passed(),
            nuclei_issue_fix_verification: passed(),
            trivy_issue_fix_verification: passed(),
            telemetry_unverified_import: passed(),
        }
    }
}

fn ensure_scope_unexpired(expires_at: &str) -> Result<(), SmokeError> {
    let expiry = chrono::DateTime::parse_from_rfc3339(expires_at)
        .map_err(|_| SmokeError::assertion("Invalid fixture scope expiry"))?;
    if expiry <= chrono::Utc::now() {
        return Err(SmokeError::assertion("Fixture scope expired"));
    }
    Ok(())
}

/// Run the reference's eleven checks against `measurement`, using `fixtures` for
/// ports, the disposable certificate and the Dockerfile/telemetry files.
///
/// The adapter must resolve the principal-owned scope and enforce it at every
/// assessment effect, including cancellation and expiry during in-flight work.
/// Without an externally supplied HTTPS fixture it refuses before measurement.
pub fn run_security_smoke(
    measurement: &mut dyn SecuritySmokeMeasurement,
    fixtures: &SmokeFixtures,
    scope_id: &str,
    expires_at: &str,
    cancellation: &SmokeCancellation,
) -> Result<SmokeReport, SmokeError> {
    ensure_scope_unexpired(expires_at)?;
    let (http_port, tls_port, ssh_port) = fixtures.ports();
    let tls_port = tls_port.ok_or_else(|| SmokeError::UnsupportedCapability {
        capability: "the HTTPS fixture: no TLS server stack is available to serve the disposable certificate"
            .to_string(),
    })?;

    let mut guard = SmokeGuard {
        measurement,
        scope_id,
        expires_at,
        ports: [http_port, tls_port, ssh_port],
        cancellation,
    };
    guard.check()?;
    let http_input = ProfileInput::network(scope_id, SmokeProfile::Http, http_port);

    // 1. The missing-header finding must exist before remediation.
    guard.check()?;
    let before = guard.run_profile(&http_input)?;
    let header_issue = before
        .finding(NOSNIFF_RULE_ID)
        .ok_or_else(|| SmokeError::assertion("Bun did not detect fixture header issue"))?
        .clone();
    if !before.is_completed() {
        return Err(SmokeError::assertion(
            "Bun did not detect fixture header issue",
        ));
    }

    // 2. Remediating the fixture must verify the finding absent.
    guard.check()?;
    fixtures.http().set_fixed(true);
    guard.check()?;
    if guard.verify_finding(&header_issue.id, &http_input)? != VERDICT_VERIFIED_ABSENT {
        return Err(SmokeError::assertion("Bun did not verify header fix"));
    }

    // 3. TLS identity must match the fixture name and must not be trusted.
    guard.check()?;
    let tls = guard.run_profile(
        &ProfileInput::network(scope_id, SmokeProfile::Tls, tls_port).with_server_name(SERVER_NAME),
    )?;
    let identity_matches = tls
        .first_evidence()
        .and_then(|evidence| evidence.fact_bool("identityMatches"))
        == Some(true);
    let trusted = tls
        .first_evidence()
        .and_then(|evidence| evidence.fact_bool("trustedByGateway"));
    if !tls.is_completed() || !identity_matches || trusted != Some(false) {
        return Err(SmokeError::assertion(
            "Bun TLS certificate measurement failed",
        ));
    }

    // 4. The HTTPS fixture must trip the HSTS policy check.
    guard.check()?;
    let https = guard.run_profile(&ProfileInput::network(
        scope_id,
        SmokeProfile::Https,
        tls_port,
    ))?;
    if !https.is_completed() || https.finding(HSTS_RULE_ID).is_none() {
        return Err(SmokeError::assertion("Bun HTTPS policy check failed"));
    }

    // 5. SSH identification must not attempt authentication.
    guard.check()?;
    let ssh = guard.run_profile(&ProfileInput::network(
        scope_id,
        SmokeProfile::Ssh,
        ssh_port,
    ))?;
    let authentication_attempted = ssh
        .first_evidence()
        .and_then(|evidence| evidence.fact_bool("authenticationAttempted"));
    if !ssh.is_completed() || authentication_attempted != Some(false) {
        return Err(SmokeError::assertion("Bun SSH identification failed"));
    }

    // 6. Local host inventory must produce evidence.
    guard.check()?;
    let host = guard.run_profile(&ProfileInput::host_audit(scope_id))?;
    if !host.is_completed() || host.evidence.is_empty() {
        return Err(SmokeError::assertion("Bun local host inventory failed"));
    }

    // 7. Native inventory must report every observation open.
    guard.check()?;
    let native = guard.native_inventory(&ProfileInput::network(
        scope_id,
        SmokeProfile::Tcp,
        http_port,
    ))?;
    if !native.is_completed()
        || native
            .observations
            .iter()
            .any(|observation| observation.state != OBSERVATION_OPEN)
    {
        return Err(SmokeError::assertion("Bun native inventory failed"));
    }

    // 8. nmap and nuclei must complete; the nuclei finding must verify absent.
    for profile in [SmokeProfile::Nmap, SmokeProfile::Nuclei] {
        if profile == SmokeProfile::Nuclei {
            guard.check()?;
            fixtures.http().set_fixed(false);
        }
        guard.check()?;
        let result = guard.run_profile(&ProfileInput::network(scope_id, profile, http_port))?;
        if !result.is_completed() {
            return Err(SmokeError::assertion(format!(
                "{} failed on Bun: {}",
                profile.as_str(),
                result.coverage_gaps
            )));
        }
        if profile == SmokeProfile::Nuclei {
            let issue = result
                .finding(NOSNIFF_RULE_ID)
                .ok_or_else(|| SmokeError::assertion("Nuclei did not observe fixture issue"))?
                .clone();
            guard.check()?;
            fixtures.http().set_fixed(true);
            guard.check()?;
            if guard.verify_finding(
                &issue.id,
                &ProfileInput::network(scope_id, SmokeProfile::Nuclei, http_port),
            )? != VERDICT_VERIFIED_ABSENT
            {
                return Err(SmokeError::assertion("Nuclei verification failed on Bun"));
            }
        }
    }

    // 9. The insecure Dockerfile must trip the non-root policy check.
    guard.check()?;
    fixtures.write_fixture("Dockerfile", INSECURE_DOCKERFILE)?;
    guard.check()?;
    let config = guard.run_profile(
        &ProfileInput::network(scope_id, SmokeProfile::Trivy, http_port).with_path("Dockerfile"),
    )?;
    let config_issue = config
        .finding(NONROOT_RULE_ID)
        .ok_or_else(|| SmokeError::assertion("Expected nonroot policy finding"))?
        .clone();
    if !config.is_completed() {
        return Err(SmokeError::assertion("Expected nonroot policy finding"));
    }

    // 10. The remediated Dockerfile must verify the policy finding absent.
    guard.check()?;
    fixtures.write_fixture("Dockerfile", REMEDIATED_DOCKERFILE)?;
    guard.check()?;
    if guard.verify_finding(
        &config_issue.id,
        &ProfileInput::network(scope_id, SmokeProfile::Trivy, http_port).with_path("Dockerfile"),
    )? != VERDICT_VERIFIED_ABSENT
    {
        return Err(SmokeError::assertion("Trivy verification failed on Bun"));
    }

    // 11. A telemetry import must stay unverified.
    guard.check()?;
    fixtures.write_fixture("alerts.jsonl", TELEMETRY_FIXTURE)?;
    guard.check()?;
    let imported = guard.run_profile(&ProfileInput::telemetry(
        scope_id,
        "suricata",
        "alerts.jsonl",
    ))?;
    let first_status = imported
        .findings
        .first()
        .map(|finding| finding.status.as_str());
    if imported.status != STATUS_PARTIAL || first_status != Some(STATUS_SUSPECTED) {
        return Err(SmokeError::assertion(
            "Telemetry unexpectedly claimed independent verification",
        ));
    }

    guard.check()?;
    Ok(SmokeReport::all_passed(guard.measurement.runtime_version()))
}

/// Convenience constructor for a completed run carrying the header finding.
pub fn run_with_header_finding(rule_id: &str) -> SmokeRun {
    SmokeRun::completed().add_finding("finding-1", rule_id, STATUS_SUSPECTED)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn packaging_smoke_authority_and_cancellation_gate_effects() {
        struct Adapter {
            scope: FixtureScope,
            calls: usize,
        }
        impl SecuritySmokeMeasurement for Adapter {
            fn resolve_scope(
                &mut self,
                principal: &str,
                id: &str,
            ) -> Result<FixtureScope, SmokeError> {
                assert_eq!((principal, id), (PRINCIPAL, "scope"));
                Ok(self.scope.clone())
            }
            fn run_profile(
                &mut self,
                _: &ProfileInput,
                _: &SmokeCancellation,
            ) -> Result<SmokeRun, SmokeError> {
                self.calls += 1;
                Ok(SmokeRun::completed())
            }
            fn verify_finding(
                &mut self,
                _: &str,
                _: &ProfileInput,
                _: &SmokeCancellation,
            ) -> Result<String, SmokeError> {
                unreachable!()
            }
            fn native_inventory(
                &mut self,
                _: &ProfileInput,
                _: &[u16],
                _: &SmokeCancellation,
            ) -> Result<SmokeRun, SmokeError> {
                unreachable!()
            }
            fn runtime_version(&self) -> String {
                String::new()
            }
        }
        let expiry = (chrono::Utc::now() + chrono::Duration::minutes(1)).to_rfc3339();
        let base = FixtureScope::new(vec![1, 2, 3], &expiry);
        let cancel = SmokeCancellation::default();
        let input = ProfileInput::network("scope", SmokeProfile::Http, 1);
        for scope in {
            let mut missing_target = base.clone();
            missing_target.targets.clear();
            let mut excluded = base.clone();
            excluded.exclusions.push(TARGET.into());
            let mut missing_method = base.clone();
            missing_method.methods.retain(|m| m != "http");
            let mut missing_port = base.clone();
            missing_port.ports.pop();
            let mut unauthorized = base.clone();
            unauthorized.authorized = false;
            let mut different_expiry = base.clone();
            different_expiry.expires_at =
                (chrono::Utc::now() + chrono::Duration::seconds(30)).to_rfc3339();
            vec![
                missing_target,
                excluded,
                missing_method,
                missing_port,
                unauthorized,
                different_expiry,
            ]
        } {
            let mut adapter = Adapter { scope, calls: 0 };
            let mut guard = SmokeGuard {
                measurement: &mut adapter,
                scope_id: "scope",
                expires_at: &expiry,
                ports: [1, 2, 3],
                cancellation: &cancel,
            };
            assert!(guard.run_profile(&input).is_err());
            assert_eq!(adapter.calls, 0);
        }
        let mut adapter = Adapter {
            scope: base,
            calls: 0,
        };
        let mut guard = SmokeGuard {
            measurement: &mut adapter,
            scope_id: "scope",
            expires_at: &expiry,
            ports: [1, 2, 3],
            cancellation: &cancel,
        };
        let mut foreign = input.clone();
        foreign.target = Some("192.0.2.1".into());
        assert!(guard.run_profile(&foreign).is_err());
        assert!(guard.run_profile(&input).is_ok());
        cancel.cancel();
        assert!(guard.run_profile(&input).is_err());
        assert_eq!(adapter.calls, 1);
    }

    #[test]
    fn packaging_smoke_stops_after_expiry_during_measurement() {
        struct SlowMeasurement {
            calls: usize,
            ports: Vec<u16>,
            expiry: String,
        }
        impl SecuritySmokeMeasurement for SlowMeasurement {
            fn resolve_scope(&mut self, _: &str, _: &str) -> Result<FixtureScope, SmokeError> {
                Ok(FixtureScope::new(self.ports.clone(), self.expiry.clone()))
            }
            fn run_profile(
                &mut self,
                _: &ProfileInput,
                _: &SmokeCancellation,
            ) -> Result<SmokeRun, SmokeError> {
                self.calls += 1;
                thread::sleep(Duration::from_millis(1300));
                Ok(run_with_header_finding(NOSNIFF_RULE_ID))
            }
            fn verify_finding(
                &mut self,
                _: &str,
                _: &ProfileInput,
                _: &SmokeCancellation,
            ) -> Result<String, SmokeError> {
                self.calls += 1;
                Ok(VERDICT_VERIFIED_ABSENT.into())
            }
            fn native_inventory(
                &mut self,
                _: &ProfileInput,
                _: &[u16],
                _: &SmokeCancellation,
            ) -> Result<SmokeRun, SmokeError> {
                panic!("expired")
            }
            fn runtime_version(&self) -> String {
                "test".into()
            }
        }
        let parent =
            Path::new(env!("CARGO_MANIFEST_DIR")).join(".jait/artifacts/packaging-smoke-expiry");
        let fixtures = SmokeFixtures::start_in(&parent).unwrap().with_tls_port(1);
        let expiry = (chrono::Utc::now() + chrono::Duration::seconds(1)).to_rfc3339();
        let (http, tls, ssh) = fixtures.ports();
        let mut measurement = SlowMeasurement {
            calls: 0,
            ports: vec![http, tls.unwrap(), ssh],
            expiry: expiry.clone(),
        };
        let error = run_security_smoke(
            &mut measurement,
            &fixtures,
            "scope",
            &expiry,
            &SmokeCancellation::default(),
        )
        .unwrap_err();
        assert!(error.to_string().contains("expired"));
        assert_eq!(measurement.calls, 1);
    }

    #[test]
    fn packaging_smoke_scope_rejects_expired_and_invalid_expiry() {
        assert!(ensure_scope_unexpired("2000-01-01T00:00:00Z").is_err());
        assert!(ensure_scope_unexpired("invalid").is_err());
        let future = (chrono::Utc::now() + chrono::Duration::minutes(1)).to_rfc3339();
        assert!(ensure_scope_unexpired(&future).is_ok());
    }

    #[test]
    fn fixture_root_is_created_inside_parent() {
        let parent = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../.jait/artifacts/security-smoke-tests");
        fs::create_dir_all(&parent).unwrap();
        let child = temporary_root(&parent).unwrap();
        assert_eq!(child.parent(), Some(parent.as_path()));
        fs::remove_dir_all(child).unwrap();
        assert!(parent.is_dir());
    }

    #[test]
    fn certificate_argv_matches_reference() {
        let argv = certificate_argv(Path::new("/tmp/key.pem"), Path::new("/tmp/certificate.pem"));
        let rendered: Vec<String> = argv
            .iter()
            .map(|arg| arg.to_string_lossy().into_owned())
            .collect();
        assert_eq!(
            rendered,
            vec![
                "req",
                "-x509",
                "-newkey",
                "rsa:2048",
                "-nodes",
                "-keyout",
                "/tmp/key.pem",
                "-out",
                "/tmp/certificate.pem",
                "-days",
                "2",
                "-subj",
                "/CN=fixture.example",
                "-addext",
                "subjectAltName=DNS:fixture.example,IP:127.0.0.1",
            ]
        );
    }

    #[test]
    fn http_fixture_toggles_nosniff() {
        let fixture = HttpFixture::start().unwrap();
        let before = fixture.get("/").unwrap();
        assert_eq!(before.status, 200);
        assert_eq!(before.header("x-content-type-options"), None);
        assert_eq!(before.header("X-Frame-Options"), Some("DENY"));
        assert_eq!(before.body, FIXTURE_BODY);
        fixture.set_fixed(true);
        let after = fixture.get("/").unwrap();
        assert_eq!(after.header("x-content-type-options"), Some("nosniff"));
    }

    #[test]
    fn ssh_fixture_sends_banner() {
        let fixture = SshFixture::start().unwrap();
        assert_eq!(fixture.read_banner().unwrap(), SSH_BANNER);
    }

    #[test]
    fn report_line_has_reference_keys() {
        let report = SmokeReport::all_passed("1.2.3".to_string());
        let line = report.to_line();
        assert!(line.starts_with("{\"runtime\":\"1.2.3\",\"tcp\":\"passed\",\"tls\":\"passed\""));
        assert!(line.contains("\"sshIdentification\":\"passed\""));
        assert!(line.contains("\"telemetryUnverifiedImport\":\"passed\""));
    }

    #[test]
    fn scope_serializes_reference_fields() {
        let scope = FixtureScope::new(vec![1, 2, 3], "2024-01-01T00:00:00.000Z");
        let json = serde_json::to_value(&scope).unwrap();
        assert_eq!(json["targets"], serde_json::json!(["127.0.0.1"]));
        assert_eq!(json["serverNames"], serde_json::json!(["fixture.example"]));
        assert_eq!(json["authorized"], serde_json::json!(true));
        assert_eq!(
            json["paths"],
            serde_json::json!(["Dockerfile", "alerts.jsonl"])
        );
        assert_eq!(json["methods"].as_array().unwrap().len(), 10);
    }
}
