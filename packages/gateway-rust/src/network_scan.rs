//! Native port of `packages/gateway/src/lib/network-scan.ts`.
//!
//! Discovery pipeline (ARP table → subnet ping sweep → port probes → detail
//! probes → topology/health enrichment) is preserved one-for-one. Every host
//! side effect (process exec, TCP connect, HTTP fetch, SSH banner read, clock)
//! is reached through [`NetworkScanHost`] so the scan logic itself is
//! transport-free and deterministically testable.

use std::collections::HashSet;
use std::fmt;
use std::time::{SystemTime, UNIX_EPOCH};

use futures_util::stream::{self, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

/// Ports probed for any responsive address during the discovery pass.
pub const QUICK_DISCOVERY_PORTS: [u16; 9] = [53, 80, 139, 443, 445, 554, 8000, 8080, 22];
/// Ports probed on hosts that survived discovery, in the detail pass.
pub const DETAIL_PROBE_PORTS: [u16; 9] = [22, 53, 80, 139, 443, 445, 554, 8000, 8080];
/// Gateway agent health endpoint port.
pub const AGENT_HEALTH_PORT: u16 = 8000;
pub const DISCOVERY_CONCURRENCY: usize = 64;
pub const DETAIL_CONCURRENCY: usize = 20;
pub const PING_TIMEOUT_MS: u64 = 900;
pub const QUICK_PROBE_TIMEOUT_MS: u64 = 250;
pub const DETAIL_PROBE_TIMEOUT_MS: u64 = 1_500;
pub const HTTP_TIMEOUT_MS: u64 = 2_000;
pub const SSH_BANNER_TIMEOUT_MS: u64 = 3_000;
pub const REVERSE_LOOKUP_TIMEOUT_MS: u64 = 3_000;
/// Time granted to the subnet sweep before the ARP table is re-read.
pub const SWEEP_SETTLE_MS: u64 = 2_500;
/// Time granted to neighbour discovery after the detail probes.
pub const ARP_SETTLE_MS: u64 = 1_000;

/// ARP/neighbour cache row.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct HostEntry {
    pub ip: String,
    pub mac: Option<String>,
    pub responsive: bool,
}

/// Options accepted by [`scan_network`]; mirrors `NetworkScanOptions`.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct NetworkScanOptions {
    /// Subnet prefix (`192.168.1`, `192.168.1.0/24`, …) instead of auto-detect.
    pub subnet: Option<String>,
    /// `false` skips the sweep and only reads the neighbour cache.
    pub deep: Option<bool>,
    /// Extra addresses that must appear in the result.
    pub include_ips: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum AgentStatus {
    NotInstalled,
    Installed,
    Running,
    Unreachable,
}

/// One discovered host; field names match `@jait/shared` `NetworkHost`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkHost {
    pub ip: String,
    pub mac: Option<String>,
    pub hostname: Option<String>,
    pub vendor: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_router: Option<bool>,
    pub alive: bool,
    pub open_ports: Vec<u16>,
    pub ssh_reachable: bool,
    pub agent_status: AgentStatus,
    pub os_version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub providers: Option<Vec<String>>,
    pub last_seen: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkScanResult {
    pub subnet: String,
    pub hosts: Vec<NetworkHost>,
    pub router_ip: Option<String>,
    pub scanned_at: String,
    pub duration_ms: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ScanError {
    /// TS parity: `throw new Error("No active IPv4 subnets found")`.
    NoActiveSubnets,
}

impl fmt::Display for ScanError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ScanError::NoActiveSubnets => f.write_str("No active IPv4 subnets found"),
        }
    }
}

impl std::error::Error for ScanError {}

/// Host platform, as far as command construction is concerned.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Platform {
    Linux,
    MacOs,
    Windows,
    Other,
}

impl Platform {
    /// Parse a Node `process.platform` / `os.platform()` value.
    pub fn from_node_platform(value: &str) -> Self {
        match value {
            "win32" => Platform::Windows,
            "darwin" => Platform::MacOs,
            "linux" | "android" => Platform::Linux,
            _ => Platform::Other,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Platform::Linux => "linux",
            Platform::MacOs => "darwin",
            Platform::Windows => "win32",
            Platform::Other => "other",
        }
    }
}

/// One `os.networkInterfaces()` address entry.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LocalIpv4Interface {
    pub address: String,
    pub internal: bool,
}

/// Boxed host future. The trait stays object safe (`&dyn NetworkScanHost`)
/// without pulling in a proc-macro dependency.
pub type HostFuture<'a, T> = std::pin::Pin<Box<dyn std::future::Future<Output = T> + Send + 'a>>;

/// Environment the scan runs against.
pub trait NetworkScanHost: Send + Sync {
    fn platform(&self) -> Platform;
    /// All IPv4 interfaces; `internal` entries are dropped by the scan.
    fn local_ipv4_interfaces(&self) -> Vec<LocalIpv4Interface>;
    /// Run a shell command, returning stdout on success.
    fn exec<'a>(&'a self, command: &'a str, timeout_ms: u64) -> HostFuture<'a, Result<String, String>>;
    fn probe_port<'a>(&'a self, ip: &'a str, port: u16, timeout_ms: u64) -> HostFuture<'a, bool>;
    /// GET a JSON document; `None` on any transport or parse failure.
    fn http_get_json<'a>(&'a self, url: &'a str, timeout_ms: u64) -> HostFuture<'a, Option<Value>>;
    /// Read the SSH identification banner.
    fn ssh_banner<'a>(&'a self, ip: &'a str, timeout_ms: u64) -> HostFuture<'a, Option<String>>;
    fn sleep_ms(&self, ms: u64) -> HostFuture<'_, ()>;
    /// Millisecond clock; JS `Date.now()` parity.
    fn now_ms(&self) -> i64 {
        system_now_ms()
    }
}

pub fn system_now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn iso(ms: i64) -> String {
    crate::time::iso(ms).unwrap_or_default()
}

/// JS `String.prototype.trim` whitespace set (includes BOM).
fn js_trim(value: &str) -> &str {
    value.trim_matches(|c: char| c.is_whitespace() || c == '\u{feff}')
}

fn is_digits(value: &str, min: usize, max: usize) -> bool {
    (min..=max).contains(&value.len()) && value.bytes().all(|b| b.is_ascii_digit())
}

pub fn is_valid_octet(value: &str) -> bool {
    if !is_digits(value, 1, 3) {
        return false;
    }
    value.parse::<u32>().map(|n| n <= 255).unwrap_or(false)
}

/// Four `\d{1,3}` groups (range-unchecked), matching the regexes in the TS.
fn split_groups4(value: &str) -> Option<Vec<&str>> {
    let parts: Vec<&str> = value.split('.').collect();
    if parts.len() == 4 && parts.iter().all(|p| is_digits(p, 1, 3)) {
        Some(parts)
    } else {
        None
    }
}

fn split_groups3(value: &str) -> Option<Vec<&str>> {
    let parts: Vec<&str> = value.split('.').collect();
    if parts.len() == 3 && parts.iter().all(|p| is_digits(p, 1, 3)) {
        Some(parts)
    } else {
        None
    }
}

pub fn is_valid_ipv4(value: &str) -> bool {
    split_groups4(value)
        .map(|parts| parts.iter().all(|p| is_valid_octet(p)))
        .unwrap_or(false)
}

/// `normalizeSubnetPrefix`: accept a `/24` CIDR, a full address, or a bare
/// three-octet prefix.
pub fn normalize_subnet_prefix(value: &str) -> Option<String> {
    let trimmed = js_trim(value);

    if let Some(base) = trimmed.strip_suffix("/24") {
        return match split_groups4(base) {
            Some(parts) if parts.iter().all(|p| is_valid_octet(p)) => Some(parts[..3].join(".")),
            _ => None,
        };
    }

    if let Some(parts) = split_groups4(trimmed) {
        return if parts.iter().all(|p| is_valid_octet(p)) {
            Some(parts[..3].join("."))
        } else {
            None
        };
    }

    if let Some(parts) = split_groups3(trimmed) {
        return if parts.iter().all(|p| is_valid_octet(p)) {
            Some(trimmed.to_string())
        } else {
            None
        };
    }

    None
}

/// `normalizeIps`: trim, keep valid IPv4 only, de-duplicate in first-seen order.
pub fn normalize_ips(values: &[String]) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for value in values {
        let trimmed = js_trim(value);
        if trimmed.is_empty() || !is_valid_ipv4(trimmed) {
            continue;
        }
        if seen.insert(trimmed.to_string()) {
            out.push(trimmed.to_string());
        }
    }
    out
}

/// `getLocalSubnets`: unique /24 prefixes of non-internal, non-link-local IPv4.
pub fn get_local_subnets(interfaces: &[LocalIpv4Interface]) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut subnets = Vec::new();
    for iface in interfaces {
        if iface.internal || iface.address.starts_with("169.254.") {
            continue;
        }
        let parts: Vec<&str> = iface.address.split('.').collect();
        if parts.len() != 4 {
            continue;
        }
        let prefix = parts[..3].join(".");
        if seen.insert(prefix.clone()) {
            subnets.push(prefix);
        }
    }
    subnets
}

/// `mergeEntries`: later rows win, first-seen ordering is preserved.
pub fn merge_entries(rows: &[HostEntry]) -> Vec<HostEntry> {
    let mut out: Vec<HostEntry> = Vec::new();
    let mut index: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
    for row in rows {
        match index.get(&row.ip) {
            Some(&i) => {
                if row.mac.is_some() {
                    out[i].mac = row.mac.clone();
                }
                out[i].responsive = out[i].responsive || row.responsive;
            }
            None => {
                index.insert(row.ip.clone(), out.len());
                out.push(row.clone());
            }
        }
    }
    out
}

/// `buildSubnetCandidates`: every host address in the subnets except network
/// and broadcast, plus the local host addresses (which are reachable but not
/// always in the ARP table).
pub fn build_subnet_candidates(subnets: &[String], interfaces: &[LocalIpv4Interface]) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut candidates = Vec::new();
    for subnet in subnets {
        for host in 1..=254u32 {
            let ip = format!("{subnet}.{host}");
            if seen.insert(ip.clone()) {
                candidates.push(ip);
            }
        }
    }
    for iface in interfaces {
        if iface.internal || iface.address.starts_with("169.254.") {
            continue;
        }
        if is_valid_ipv4(&iface.address) && seen.insert(iface.address.clone()) {
            candidates.push(iface.address.clone());
        }
    }
    candidates
}

fn normalize_mac(raw: &str) -> Option<String> {
    let lowered = raw.replace('-', ":").to_ascii_lowercase();
    let groups: Vec<&str> = lowered.split(':').collect();
    if groups.len() != 6 || !groups.iter().all(|g| (1..=2).contains(&g.len())) {
        return None;
    }
    Some(
        groups
            .iter()
            .map(|g| format!("{g:0>2}"))
            .collect::<Vec<_>>()
            .join(":"),
    )
}

/// Accept only unicast, non-zero MACs (the ARP cache is full of broadcast and
/// multicast rows).
fn is_usable_mac(mac: &str) -> bool {
    if mac == "ff:ff:ff:ff:ff:ff" || mac == "00:00:00:00:00:00" {
        return false;
    }
    match mac.split(':').next().and_then(|o| u8::from_str_radix(o, 16).ok()) {
        Some(first) => first & 1 == 0,
        None => false,
    }
}

/// Try to read `a.b.c.d` starting at `start`; returns `(ip, end_index)`.
fn parse_ipv4_at(haystack: &str, start: usize) -> Option<(String, usize)> {
    if !haystack.is_char_boundary(start) {
        return None;
    }
    let bytes = haystack.as_bytes();
    let mut i = start;
    for group in 0..4 {
        let group_start = i;
        while i < bytes.len() && bytes[i].is_ascii_digit() && i - group_start < 4 {
            i += 1;
        }
        if i == group_start || i - group_start > 3 {
            return None;
        }
        if group < 3 {
            if i >= bytes.len() || bytes[i] != b'.' {
                return None;
            }
            i += 1;
        }
    }
    Some((haystack[start..i].to_string(), i))
}

fn parse_arp_line(line: &str) -> Option<(String, String)> {
    let bytes = line.as_bytes();
    for start in 0..bytes.len() {
        if !bytes[start].is_ascii_digit() {
            continue;
        }
        let Some((ip, mut i)) = parse_ipv4_at(line, start) else {
            continue;
        };
        // `\(| at ` — at least one `)`/whitespace separator.
        let sep_start = i;
        while i < bytes.len() && (bytes[i] == b')' || bytes[i].is_ascii_whitespace()) {
            i += 1;
        }
        if i == sep_start {
            continue;
        }
        if line[i..].starts_with("at ") {
            i += 3;
            while i < bytes.len() && bytes[i].is_ascii_whitespace() {
                i += 1;
            }
        }
        if let Some((mac, _)) = parse_mac_at(line, sep_start) {
            return Some((ip, mac));
        }
    }
    None
}

/// Find the first six-group MAC (`aa:bb:…` or `AA-BB-…`) at or after `from`.
fn parse_mac_at(line: &str, from: usize) -> Option<(String, usize)> {
    let bytes = line.as_bytes();
    let mut scan = from;
    while scan < bytes.len() {
        if !bytes[scan].is_ascii_hexdigit() {
            scan += 1;
            continue;
        }
        let mac_start = scan;
        let mut i = scan;
        let mut groups = 0usize;
        loop {
            let g_start = i;
            while i < bytes.len() && bytes[i].is_ascii_hexdigit() && i - g_start < 2 {
                i += 1;
            }
            if i == g_start {
                break;
            }
            groups += 1;
            if groups == 6 {
                break;
            }
            if i < bytes.len() && (bytes[i] == b':' || bytes[i] == b'-') {
                i += 1;
            } else {
                break;
            }
        }
        if groups == 6 {
            if let Some(mac) = normalize_mac(&line[mac_start..i]) {
                return Some((mac, i));
            }
        }
        scan = mac_start + 1;
    }
    None
}

/// `parseArpTable`: tolerate Linux/macOS `arp -a` and Windows `arp -a` rows.
pub fn parse_arp_table(output: &str) -> Vec<HostEntry> {
    let mut entries = Vec::new();
    for line in output.split(['\n', '\r']) {
        let Some((ip, mac)) = parse_arp_line(line) else {
            continue;
        };
        if !is_usable_mac(&mac) {
            continue;
        }
        entries.push(HostEntry {
            ip,
            mac: Some(mac),
            responsive: true,
        });
    }
    entries
}

/// `parseWindowsNeighborCsv`: PowerShell neighbour rows (`"ip","mac","state"`).
pub fn parse_windows_neighbor_csv(output: &str, subnets: &[String]) -> Vec<HostEntry> {
    let mut entries = Vec::new();
    for line in output.split(['\n', '\r']) {
        let columns: Vec<&str> = line
            .split(',')
            .map(|c| js_trim(c).trim_matches('"'))
            .collect();
        if columns.len() < 2 {
            continue;
        }
        let ip = columns[0];
        let mac = columns[1].replace('-', ":").to_ascii_lowercase();
        if !is_valid_ipv4(ip) || mac.is_empty() {
            continue;
        }
        if !subnets
            .iter()
            .any(|subnet| ip.starts_with(&format!("{subnet}.")))
        {
            continue;
        }
        if !mac.contains(':') {
            continue;
        }
        entries.push(HostEntry {
            ip: ip.to_string(),
            mac: Some(mac),
            responsive: true,
        });
    }
    entries
}

/// `detectDefaultGatewayIp` output parsing.
pub fn parse_default_gateway_output(platform: Platform, stdout: &str) -> Option<String> {
    match platform {
        Platform::Windows => stdout
            .lines()
            .next()
            .map(js_trim)
            .filter(|line| is_valid_ipv4(line))
            .map(|line| line.to_string()),
        Platform::MacOs => {
            let lower = stdout.to_ascii_lowercase();
            let idx = lower.find("gateway:")?;
            let rest = &stdout[idx + "gateway:".len()..];
            let candidate: String = rest
                .trim_start()
                .chars()
                .take_while(|c| c.is_ascii_digit() || *c == '.')
                .collect();
            is_valid_ipv4(&candidate).then_some(candidate)
        }
        _ => {
            let lower = stdout.to_ascii_lowercase();
            let idx = lower.find("default via ")?;
            let rest = &stdout[idx + "default via ".len()..];
            if rest.starts_with('(') {
                return None;
            }
            let candidate: String = rest
                .chars()
                .take_while(|c| c.is_ascii_digit() || *c == '.')
                .collect();
            is_valid_ipv4(&candidate).then_some(candidate)
        }
    }
}

/// `reverseResolve` output parsing (Windows `nslookup` / POSIX `host`).
///
/// TS tries `/Name:\s+(\S+)/i` first on *every* platform and only then
/// `/pointer\s+(\S+)/i`, so the helper is deliberately platform agnostic and
/// captures a single non-space token instead of the rest of the line.
pub fn parse_reverse_lookup_output(stdout: &str) -> Option<String> {
    for line in stdout.lines() {
        let lower = line.to_ascii_lowercase();
        let Some(idx) = lower.find("name") else { continue };
        let rest = &line[idx + "name".len()..];
        let Some(rest) = rest.strip_prefix(':') else { continue };
        if !rest.starts_with([' ', '\t']) {
            continue;
        }
        let token: String = rest.chars().skip_while(|c| c.is_whitespace()).take_while(|c| !c.is_whitespace()).collect();
        if !token.is_empty() {
            return Some(token);
        }
    }
    for line in stdout.lines() {
        let lower = line.to_ascii_lowercase();
        let Some(idx) = lower.find("pointer") else { continue };
        let rest = &line[idx + "pointer".len()..];
        if !rest.starts_with([' ', '\t']) {
            continue;
        }
        let token: String = rest.chars().skip_while(|c| c.is_whitespace()).take_while(|c| !c.is_whitespace()).collect();
        let token = token.trim_end_matches('.');
        if !token.is_empty() {
            return Some(token.to_string());
        }
    }
    None
}

/// `detectOsVersion` from the gateway health payload.
pub fn detect_os_from_health(health: &Value) -> Option<String> {
    for key in ["osVersion", "os"] {
        if let Some(value) = health.get(key).and_then(Value::as_str) {
            if !value.is_empty() {
                return Some(value.to_string());
            }
        }
    }
    None
}

/// `detectOsVersion` from an SSH identification banner.
pub fn detect_os_from_banner(banner: &str) -> Option<String> {
    let trimmed: String = js_trim(banner).chars().take(200).collect();
    if trimmed.is_empty() {
        return None;
    }
    if let Some(idx) = trimmed.to_ascii_lowercase().find("ubuntu") {
        let rest = &trimmed[idx + "ubuntu".len()..];
        let rest = rest.trim_start_matches([' ', '\t']);
        // `[\s-]*(\S*)` — optional separator then the first non-space run.
        let rest = rest.strip_prefix('-').unwrap_or(rest);
        let rest = rest.trim_start_matches([' ', '\t']);
        let token: String = rest.chars().take_while(|c| !c.is_whitespace()).collect();
        return Some(format!("Ubuntu {token}"));
    }
    if trimmed.to_ascii_lowercase().contains("debian") {
        return Some("Debian".to_string());
    }
    if trimmed.to_ascii_lowercase().contains("windows") {
        return Some("Windows".to_string());
    }
    if trimmed.to_ascii_lowercase().contains("raspbian") {
        return Some("Raspbian".to_string());
    }
    if trimmed.starts_with("SSH-") {
        return Some(trimmed);
    }
    None
}

/// `classifyAgentHealth`: the payload must look like a running jait-gateway.
pub fn classify_agent_health(health: &Value) -> bool {
    let name_match = health.get("name").and_then(Value::as_str) == Some("jait-gateway");
    let healthy = health.get("healthy").and_then(Value::as_bool) == Some(true);
    let versioned = health.get("version").map(Value::is_string).unwrap_or(false);
    name_match || (healthy && versioned)
}

/// `topologyProviders`: union of `devices[].providers`, first-seen order.
pub fn topology_providers(topology: &Value) -> Option<Vec<String>> {
    let mut seen = HashSet::new();
    let mut providers = Vec::new();
    for device in topology.get("devices").and_then(Value::as_array)? {
        for provider in device
            .get("providers")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(Value::as_str)
        {
            if !provider.is_empty() && seen.insert(provider.to_string()) {
                providers.push(provider.to_string());
            }
        }
    }
    if providers.is_empty() {
        None
    } else {
        Some(providers)
    }
}

/// `ipSortKey`: numeric comparison of the four octets.
pub fn ip_sort_key(ip: &str) -> u64 {
    ip.split('.')
        .take(4)
        .fold(0u64, |acc, part| acc.wrapping_mul(256).wrapping_add(part.parse::<u64>().unwrap_or(0)))
}

async fn map_concurrent<T, R, F, Fut>(items: Vec<T>, concurrency: usize, f: F) -> Vec<R>
where
    T: Send,
    R: Send,
    Fut: std::future::Future<Output = R> + Send,
    F: FnMut(T) -> Fut + Send,
{
    let limit = concurrency.max(1);
    stream::iter(items).map(f).buffered(limit).collect().await
}

fn gateway_command(platform: Platform) -> (&'static str, u64) {
    match platform {
        Platform::Windows => ("powershell -NoProfile -Command \"(Get-NetRoute -DestinationPrefix '0.0.0.0/0' | Select-Object -First 1).NextHop\"", 4000),
        Platform::MacOs => ("route -n get default", 4000),
        _ => ("ip route show default", 4000),
    }
}

async fn detect_default_gateway(host: &dyn NetworkScanHost) -> Option<String> {
    let (command, timeout) = gateway_command(host.platform());
    let stdout = host.exec(command, timeout).await.ok()?;
    parse_default_gateway_output(host.platform(), &stdout)
}

async fn read_arp_entries(host: &dyn NetworkScanHost, subnets: &[String]) -> Vec<HostEntry> {
    if host.platform() == Platform::Windows {
        // ARP first: PowerShell neighbour discovery covers hosts `arp -a` misses.
        let arp = host.exec("arp -a", 5000).await.unwrap_or_default();
        let mut entries = parse_arp_table(&arp);
        let powershell = host
            .exec(
                "powershell -NoProfile -Command \"Get-NetNeighbor -AddressFamily IPv4 | Where-Object State -ne 'Unreachable' | Select-Object -Property IPAddress,LinkLayerAddress,State | ConvertTo-Csv -NoTypeInformation\"",
                6000,
            )
            .await
            .unwrap_or_default();
        entries.extend(parse_windows_neighbor_csv(&powershell, subnets));
        return entries;
    }
    let arp = host.exec("arp -a", 5000).await.unwrap_or_default();
    parse_arp_table(&arp)
}

async fn run_subnet_ping_sweep(host: &dyn NetworkScanHost, subnets: &[String]) {
    let platform = host.platform();
    let mut commands = Vec::new();
    for subnet in subnets {
        for host_octet in 1..=254u32 {
            let ip = format!("{subnet}.{host_octet}");
            let command = match platform {
                Platform::Windows => format!("ping -n 1 -w 200 {ip}"),
                Platform::MacOs => format!("ping -c 1 -W 200 {ip}"),
                _ => format!("ping -c 1 -W 1 {ip}"),
            };
            commands.push(command);
        }
    }
    // The TS implementation fires these without awaiting each result.
    let _ = map_concurrent(commands, DISCOVERY_CONCURRENCY, |command| async move {
        host.exec(&command, PING_TIMEOUT_MS).await.ok()
    })
    .await;
}

async fn ping_host(host: &dyn NetworkScanHost, ip: &str) -> bool {
    let platform = host.platform();
    let command = match platform {
        Platform::Windows => format!("ping -n 1 -w 400 {ip}"),
        Platform::MacOs => format!("ping -c 1 -W 400 {ip}"),
        _ => format!("ping -c 1 -W 1 {ip}"),
    };
    host.exec(&command, PING_TIMEOUT_MS).await.is_ok()
}

async fn probe_any_port(host: &dyn NetworkScanHost, ip: &str, ports: &[u16], timeout_ms: u64) -> Vec<u16> {
    let candidates: Vec<u16> = ports.to_vec();
    let concurrency = candidates.len().max(1);
    let target = ip.to_string();
    let results = map_concurrent(candidates, concurrency, |port| {
        let target = target.clone();
        async move { (port, host.probe_port(&target, port, timeout_ms).await) }
    })
    .await;
    results.into_iter().filter_map(|(port, open)| open.then_some(port)).collect()
}

async fn reverse_resolve(host: &dyn NetworkScanHost, ip: &str) -> Option<String> {
    let command = match host.platform() {
        Platform::Windows => format!("nslookup {ip} 2>nul"),
        _ => format!("host {ip} 2>/dev/null || true"),
    };
    let stdout = host.exec(&command, REVERSE_LOOKUP_TIMEOUT_MS).await.ok()?;
    parse_reverse_lookup_output(&stdout)
}

async fn detect_os_version(host: &dyn NetworkScanHost, ip: &str) -> Option<String> {
    if let Some(health) = host
        .http_get_json(&format!("http://{ip}:{AGENT_HEALTH_PORT}/api/health"), HTTP_TIMEOUT_MS)
        .await
    {
        if let Some(os) = detect_os_from_health(&health) {
            return Some(os);
        }
    }
    let banner = host.ssh_banner(ip, SSH_BANNER_TIMEOUT_MS).await?;
    detect_os_from_banner(&banner)
}

/// Detail pass for one host: open ports, SSH, agent health, topology, OS.
async fn scan_host_detail(
    host: &dyn NetworkScanHost,
    entry: &HostEntry,
    router_ip: Option<&str>,
    scanned_at: &str,
) -> NetworkHost {
    let ip = entry.ip.as_str();
    let open_ports = probe_any_port(host, ip, &DETAIL_PROBE_PORTS, DETAIL_PROBE_TIMEOUT_MS).await;
    let ssh_reachable = open_ports.contains(&22);

    let mut agent_status = AgentStatus::NotInstalled;
    let mut providers = None;
    let mut health_os = None;
    if open_ports.contains(&AGENT_HEALTH_PORT) {
        if let Some(health) = host
            .http_get_json(&format!("http://{ip}:{AGENT_HEALTH_PORT}/api/health"), HTTP_TIMEOUT_MS)
            .await
        {
            if classify_agent_health(&health) {
                agent_status = AgentStatus::Running;
                health_os = detect_os_from_health(&health);
                if let Some(topology) = host
                    .http_get_json(
                        &format!("http://{ip}:{AGENT_HEALTH_PORT}/api/network/topology"),
                        HTTP_TIMEOUT_MS,
                    )
                    .await
                {
                    providers = topology_providers(&topology);
                }
            } else {
                agent_status = AgentStatus::Installed;
            }
        } else if ssh_reachable {
            agent_status = AgentStatus::Installed;
        }
    } else if ssh_reachable {
        agent_status = AgentStatus::Installed;
    }

    let hostname = if entry.mac.is_some() || entry.responsive {
        reverse_resolve(host, ip).await
    } else {
        None
    };

    let os_version = match health_os {
        Some(os) => Some(os),
        None => detect_os_version(host, ip).await,
    };

    NetworkHost {
        ip: entry.ip.clone(),
        mac: entry.mac.clone(),
        hostname,
        vendor: None,
        is_router: Some(router_ip == Some(ip)),
        alive: entry.responsive || !open_ports.is_empty(),
        open_ports,
        ssh_reachable,
        agent_status,
        os_version,
        providers,
        last_seen: scanned_at.to_string(),
    }
}

/// Full scan, mirroring `scanNetwork` step for step.
pub async fn scan_network(
    host: &dyn NetworkScanHost,
    options: NetworkScanOptions,
) -> Result<NetworkScanResult, ScanError> {
    let started = host.now_ms();
    let interfaces = host.local_ipv4_interfaces();

    let requested = options
        .subnet
        .as_deref()
        .and_then(normalize_subnet_prefix);
    let subnets = match requested {
        Some(subnet) => vec![subnet],
        None => get_local_subnets(&interfaces),
    };
    if subnets.is_empty() {
        return Err(ScanError::NoActiveSubnets);
    }
    let include_ips = normalize_ips(&options.include_ips);

    let router_ip = detect_default_gateway(host).await;

    let mut rows = read_arp_entries(host, &subnets).await;
    let known: HashSet<String> = rows.iter().map(|row| row.ip.clone()).collect();

    // The sweep is opt-out: `deep: false` skips it.
    if options.deep != Some(false) {
        run_subnet_ping_sweep(host, &subnets).await;
        host.sleep_ms(SWEEP_SETTLE_MS).await;

        let mut candidates = build_subnet_candidates(&subnets, &interfaces);
        for ip in &include_ips {
            if !candidates.contains(ip) {
                candidates.push(ip.clone());
            }
        }
        let unknown: Vec<String> = candidates
            .into_iter()
            .filter(|ip| !known.contains(ip))
            .collect();

        let discoveries = map_concurrent(unknown, DISCOVERY_CONCURRENCY, |ip| async move {
            if ping_host(host, &ip).await {
                return Some((ip, true));
            }
            let open = probe_any_port(host, &ip, &QUICK_DISCOVERY_PORTS, QUICK_PROBE_TIMEOUT_MS).await;
            (!open.is_empty()).then_some((ip, false))
        })
        .await;

        for discovery in discoveries.into_iter().flatten() {
            rows.push(HostEntry {
                ip: discovery.0,
                mac: None,
                responsive: discovery.1,
            });
        }

        host.sleep_ms(ARP_SETTLE_MS).await;
        rows.extend(read_arp_entries(host, &subnets).await);
    }

    let include_set: HashSet<&String> = include_ips.iter().collect();
    let mut scoped: Vec<HostEntry> = merge_entries(&rows)
        .into_iter()
        .filter(|row| {
            include_set.contains(&row.ip)
                || subnets
                    .iter()
                    .any(|subnet| row.ip.starts_with(&format!("{subnet}.")))
        })
        .collect();
    let present: HashSet<String> = scoped.iter().map(|row| row.ip.clone()).collect();
    for ip in &include_ips {
        if !present.contains(ip) {
            scoped.push(HostEntry {
                ip: ip.clone(),
                mac: None,
                responsive: false,
            });
        }
    }

    let scanned_at = iso(host.now_ms());
    let router_ref = router_ip.as_deref();
    let mut hosts = map_concurrent(scoped, DETAIL_CONCURRENCY, |entry| {
        let scanned_at = scanned_at.clone();
        async move { scan_host_detail(host, &entry, router_ref, &scanned_at).await }
    })
    .await;
    hosts.sort_by_key(|host| ip_sort_key(&host.ip));

    Ok(NetworkScanResult {
        subnet: subnets
            .iter()
            .map(|subnet| format!("{subnet}.0/24"))
            .collect::<Vec<_>>()
            .join(", "),
        hosts,
        router_ip,
        scanned_at,
        duration_ms: host.now_ms() - started,
    })
}

/// Convenience: agent health payload for a host, used by callers that only
/// need reachability (`ssh-tools.ts` does the same probe).
pub async fn fetch_agent_health(host: &dyn NetworkScanHost, ip: &str) -> Option<Value> {
    host.http_get_json(
        &format!("http://{ip}:{AGENT_HEALTH_PORT}/api/health"),
        HTTP_TIMEOUT_MS,
    )
    .await
}

/// Serialisable scan request, for the HTTP route layer.
pub fn scan_request_body(result: &NetworkScanResult) -> Value {
    json!(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicI64, AtomicUsize, Ordering};
    use std::sync::Mutex;

    fn iface(address: &str, internal: bool) -> LocalIpv4Interface {
        LocalIpv4Interface {
            address: address.to_string(),
            internal,
        }
    }

    #[test]
    fn octets_and_ipv4_validation() {
        assert!(is_valid_octet("0"));
        assert!(is_valid_octet("255"));
        assert!(!is_valid_octet("256"));
        assert!(!is_valid_octet("1234"));
        assert!(!is_valid_octet("1a"));
        assert!(is_valid_ipv4("192.168.1.10"));
        assert!(!is_valid_ipv4("192.168.1"));
        assert!(!is_valid_ipv4("192.168.1.256"));
    }

    #[test]
    fn subnet_prefix_normalisation() {
        assert_eq!(normalize_subnet_prefix("192.168.1.0/24").as_deref(), Some("192.168.1"));
        assert_eq!(normalize_subnet_prefix("  10.0.0.7 ").as_deref(), Some("10.0.0"));
        assert_eq!(normalize_subnet_prefix("10.0.5").as_deref(), Some("10.0.5"));
        assert_eq!(normalize_subnet_prefix("10.0.300"), None);
        assert_eq!(normalize_subnet_prefix("10.0.0.300/24"), None);
        assert_eq!(normalize_subnet_prefix("nonsense"), None);
    }

    #[test]
    fn ip_normalisation_dedupes_and_filters() {
        let input = vec![
            " 192.168.1.5 ".to_string(),
            "192.168.1.5".to_string(),
            "999.1.1.1".to_string(),
            "".to_string(),
            "10.0.0.1".to_string(),
        ];
        assert_eq!(normalize_ips(&input), vec!["192.168.1.5", "10.0.0.1"]);
    }

    #[test]
    fn local_subnets_skip_internal_and_link_local() {
        let interfaces = vec![
            iface("127.0.0.1", true),
            iface("192.168.1.10", false),
            iface("169.254.3.4", false),
            iface("192.168.1.11", false),
            iface("10.1.2.3", false),
        ];
        assert_eq!(get_local_subnets(&interfaces), vec!["192.168.1", "10.1.2"]);
    }

    #[test]
    fn arp_table_parsing_variants() {
        let output = "\
? (192.168.1.1) at 3c:37:86:aa:bb:cc on en0 ifscope [ethernet]
? (192.168.1.20) at 0:1b:44:11:3a:b7 on en0 ifscope [ethernet]
? (192.168.1.30) at ff:ff:ff:ff:ff:ff on en0 ifscope [ethernet]
? (224.0.0.251) at 1:0:5e:0:0:fb on en0 ifscope permanent [ethernet]
garbage line without addresses
192.168.1.40              ether   A4-83-E7-11-22-33   C                     en0
";
        let entries = parse_arp_table(output);
        assert_eq!(
            entries,
            vec![
                HostEntry { ip: "192.168.1.1".into(), mac: Some("3c:37:86:aa:bb:cc".into()), responsive: true },
                HostEntry { ip: "192.168.1.20".into(), mac: Some("00:1b:44:11:3a:b7".into()), responsive: true },
                HostEntry { ip: "192.168.1.40".into(), mac: Some("a4:83:e7:11:22:33".into()), responsive: true },
            ]
        );
    }

    #[test]
    fn windows_neighbour_csv_is_scoped_to_subnets() {
        let output = "\
\"IPAddress\",\"LinkLayerAddress\",\"State\"
\"192.168.1.1\",\"3C-37-86-AA-BB-CC\",\"Reachable\"
\"192.168.1.55\",\"AA-BB-CC-DD-EE-FF\",\"Stale\"
\"10.9.9.9\",\"AA-BB-CC-DD-EE-00\",\"Reachable\"
\"192.168.1.77\",\"\",\"Reachable\"
";
        let entries = parse_windows_neighbor_csv(output, &["192.168.1".to_string()]);
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].mac.as_deref(), Some("3c:37:86:aa:bb:cc"));
        assert_eq!(entries[1].ip, "192.168.1.55");
    }

    #[test]
    fn entries_merge_prefers_new_mac_and_keeps_order() {
        let merged = merge_entries(&[
            HostEntry { ip: "10.0.0.2".into(), mac: None, responsive: false },
            HostEntry { ip: "10.0.0.1".into(), mac: Some("aa:bb:cc:dd:ee:ff".into()), responsive: true },
            HostEntry { ip: "10.0.0.2".into(), mac: Some("11:22:33:44:55:66".into()), responsive: false },
        ]);
        assert_eq!(merged.len(), 2);
        assert_eq!(merged[0].ip, "10.0.0.2");
        assert_eq!(merged[0].mac.as_deref(), Some("11:22:33:44:55:66"));
        assert_eq!(merged[1].ip, "10.0.0.1");
    }

    #[test]
    fn subnet_candidates_cover_range_and_local_addresses() {
        let candidates = build_subnet_candidates(&["10.0.0".to_string()], &[iface("10.0.0.5", false)]);
        assert_eq!(candidates.len(), 254);
        assert_eq!(candidates[0], "10.0.0.1");
        assert_eq!(candidates[253], "10.0.0.254");
        assert!(!candidates.iter().any(|c| c == "10.0.0.255"));
    }

    #[test]
    fn default_gateway_parsing_per_platform() {
        assert_eq!(
            parse_default_gateway_output(Platform::Linux, "default via 192.168.1.1 dev eth0 proto dhcp\n").as_deref(),
            Some("192.168.1.1")
        );
        assert_eq!(
            parse_default_gateway_output(Platform::MacOs, "   route to: default\ngateway: 10.0.0.1\ninterface: en0\n").as_deref(),
            Some("10.0.0.1")
        );
        assert_eq!(
            parse_default_gateway_output(Platform::Windows, " 172.16.0.1 \r\n").as_deref(),
            Some("172.16.0.1")
        );
        assert_eq!(parse_default_gateway_output(Platform::Linux, "default via fdfd::1 dev eth0"), None);
    }

    #[test]
    fn reverse_lookup_parsing() {
        assert_eq!(
            parse_reverse_lookup_output(
                "Server:  UnKnown\nAddress:  192.168.1.1\n\nName:    printer.lan\n"
            )
            .as_deref(),
            Some("printer.lan")
        );
        assert_eq!(
            parse_reverse_lookup_output(
                "20.1.168.192.in-addr.arpa domain name pointer nas.lan.\n"
            )
            .as_deref(),
            Some("nas.lan")
        );
        // `Name:` must be followed by whitespace and a single non-space token.
        assert_eq!(
            parse_reverse_lookup_output("Name:printer.lan\n").as_deref(),
            None
        );
        assert_eq!(
            parse_reverse_lookup_output("Host 10.0.0.9.in-addr.arpa. not found: 3(NXDOMAIN)\n"),
            None
        );
        assert_eq!(parse_reverse_lookup_output(""), None);
    }

    #[test]
    fn os_detection_prefers_health_then_banner() {
        assert_eq!(
            detect_os_from_health(&json!({"osVersion": "Windows 11 Pro 23H2", "os": "windows"})).as_deref(),
            Some("Windows 11 Pro 23H2")
        );
        assert_eq!(
            detect_os_from_health(&json!({"osVersion": "", "os": "linux"})).as_deref(),
            Some("linux")
        );
        assert_eq!(detect_os_from_health(&json!({})), None);

        assert_eq!(
            detect_os_from_banner("SSH-2.0-OpenSSH_8.9p1 Ubuntu-3ubuntu0.1").as_deref(),
            Some("Ubuntu 3ubuntu0.1")
        );
        assert_eq!(detect_os_from_banner("SSH-2.0-OpenSSH_9.6 Debian-1").as_deref(), Some("Debian"));
        assert_eq!(detect_os_from_banner("SSH-2.0-OpenSSH_for_Windows_8.6").as_deref(), Some("Windows"));
        assert_eq!(detect_os_from_banner("SSH-2.0-OpenSSH_7.4 Raspbian").as_deref(), Some("Raspbian"));
        assert_eq!(detect_os_from_banner("SSH-2.0-OpenSSH_7.4").as_deref(), Some("SSH-2.0-OpenSSH_7.4"));
        assert_eq!(detect_os_from_banner("   "), None);
    }

    #[test]
    fn agent_health_classification_and_topology_providers() {
        assert!(classify_agent_health(&json!({"name": "jait-gateway"})));
        assert!(classify_agent_health(&json!({"healthy": true, "version": "1.2.3"})));
        assert!(!classify_agent_health(&json!({"healthy": true})));
        assert!(!classify_agent_health(&json!({"name": "other"})));

        assert_eq!(
            topology_providers(&json!({"devices": [
                {"providers": ["anthropic", "openai"]},
                {"providers": ["openai", "ollama"]}
            ]}))
            .as_deref()
            .map(|p| p.to_vec()),
            Some(vec!["anthropic".to_string(), "openai".to_string(), "ollama".to_string()])
        );
        assert_eq!(topology_providers(&json!({"devices": []})), None);
    }

    #[test]
    fn ip_sort_key_is_numeric() {
        let mut ips = vec!["192.168.1.10", "192.168.1.9", "10.0.0.1"];
        ips.sort_by_key(|ip| ip_sort_key(ip));
        assert_eq!(ips, vec!["10.0.0.1", "192.168.1.9", "192.168.1.10"]);
    }

    struct FakeHost {
        interfaces: Vec<LocalIpv4Interface>,
        arp_calls: AtomicUsize,
        pinged: Mutex<Vec<String>>,
        sweeps: AtomicUsize,
        sleeps: Mutex<Vec<u64>>,
        now: AtomicI64,
    }

    impl FakeHost {
        fn new(interfaces: Vec<LocalIpv4Interface>) -> Self {
            Self {
                interfaces,
                arp_calls: AtomicUsize::new(0),
                pinged: Mutex::new(Vec::new()),
                sweeps: AtomicUsize::new(0),
                sleeps: Mutex::new(Vec::new()),
                now: AtomicI64::new(1_700_000_000_000),
            }
        }
    }

    impl NetworkScanHost for FakeHost {
        fn platform(&self) -> Platform {
            Platform::Linux
        }

        fn local_ipv4_interfaces(&self) -> Vec<LocalIpv4Interface> {
            self.interfaces.clone()
        }

        fn exec<'a>(&'a self, command: &'a str, _timeout_ms: u64) -> HostFuture<'a, Result<String, String>> {
            Box::pin(async move {
            if command.contains("ip route show default") {
                return Ok("default via 192.168.1.1 dev eth0\n".to_string());
            }
            if command.contains("arp -a") {
                let call = self.arp_calls.fetch_add(1, Ordering::SeqCst);
                return Ok(if call == 0 {
                    "? (192.168.1.1) at 3c:37:86:aa:bb:cc on eth0\n".to_string()
                } else {
                    "? (192.168.1.1) at 3c:37:86:aa:bb:cc on eth0\n? (192.168.1.20) at a4:83:e7:11:22:33 on eth0\n".to_string()
                });
            }
            if command.starts_with("ping ") {
                self.sweeps.fetch_add(1, Ordering::SeqCst);
                let ip = command.rsplit(' ').next().unwrap_or("").to_string();
                self.pinged.lock().unwrap().push(ip.clone());
                return if ip == "192.168.1.20" {
                    Ok("64 bytes from 192.168.1.20".to_string())
                } else {
                    Err("unreachable".to_string())
                };
            }
            if command.starts_with("host ") {
                return Ok(if command.contains("192.168.1.20") {
                    "20.1.168.192.in-addr.arpa domain name pointer nas.localdomain.\n".to_string()
                } else {
                    "Host 192.168.1.1.in-addr.arpa. not found: 3(NXDOMAIN)\n".to_string()
                });
            }
            Err("unsupported".to_string())
            })
        }

        fn probe_port<'a>(&'a self, ip: &'a str, port: u16, _timeout_ms: u64) -> HostFuture<'a, bool> {
            Box::pin(async move { ip == "192.168.1.20" && matches!(port, 22 | 8000) })
        }

        fn http_get_json<'a>(&'a self, url: &'a str, _timeout_ms: u64) -> HostFuture<'a, Option<Value>> {
            Box::pin(async move {
            if !url.starts_with("http://192.168.1.20:8000/") {
                return None;
            }
            if url.ends_with("/api/health") {
                return Some(json!({"name": "jait-gateway", "healthy": true, "version": "1.4.0"}));
            }
            if url.ends_with("/api/network/topology") {
                return Some(json!({"devices": [{"providers": ["anthropic", "openai"]}]}));
            }
            None
            })
        }

        fn ssh_banner<'a>(&'a self, ip: &'a str, _timeout_ms: u64) -> HostFuture<'a, Option<String>> {
            Box::pin(async move { (ip == "192.168.1.20").then(|| "SSH-2.0-OpenSSH_8.9p1 Ubuntu-3ubuntu0.1".to_string()) })
        }

        fn sleep_ms(&self, ms: u64) -> HostFuture<'_, ()> {
            Box::pin(async move { self.sleeps.lock().unwrap().push(ms); })
        }

        fn now_ms(&self) -> i64 {
            self.now.fetch_add(250, Ordering::SeqCst)
        }
    }

    #[tokio::test]
    async fn scan_network_discovers_enriches_and_scopes_hosts() {
        let host = FakeHost::new(vec![iface("192.168.1.10", false), iface("127.0.0.1", true)]);
        let result = scan_network(
            &host,
            NetworkScanOptions {
                subnet: None,
                deep: Some(true),
                include_ips: vec!["192.168.1.99".to_string()],
            },
        )
        .await
        .expect("scan succeeds");

        assert_eq!(result.subnet, "192.168.1.0/24");
        assert_eq!(result.router_ip.as_deref(), Some("192.168.1.1"));

        let ips: Vec<&str> = result.hosts.iter().map(|h| h.ip.as_str()).collect();
        assert_eq!(ips, vec!["192.168.1.1", "192.168.1.20", "192.168.1.99"]);

        let router = &result.hosts[0];
        assert_eq!(router.is_router, Some(true));
        // `alive = entry.responsive || openPorts.length > 0`; the gateway's ARP
        // row makes it responsive even though no port answers.
        assert!(router.alive);
        assert!(router.open_ports.is_empty());
        assert_eq!(router.agent_status, AgentStatus::NotInstalled);

        let nas = &result.hosts[1];
        assert_eq!(nas.mac.as_deref(), Some("a4:83:e7:11:22:33"));
        assert_eq!(nas.hostname.as_deref(), Some("nas.localdomain"));
        assert!(nas.alive);
        assert_eq!(nas.open_ports, vec![22, 8000]);
        assert!(nas.ssh_reachable);
        assert_eq!(nas.agent_status, AgentStatus::Running);
        assert_eq!(nas.providers.as_deref(), Some(&["anthropic".to_string(), "openai".to_string()][..]));
        assert_eq!(nas.os_version.as_deref(), Some("Ubuntu 3ubuntu0.1"));

        let included = &result.hosts[2];
        assert!(!included.alive);
        assert_eq!(included.is_router, Some(false));

        // Sweep ran once, sleeps are the two settle windows, and the ARP cache
        // was re-read after the sweep.
        assert!(host.sweeps.load(Ordering::SeqCst) > 0);
        assert_eq!(host.sleeps.lock().unwrap().as_slice(), &[SWEEP_SETTLE_MS, ARP_SETTLE_MS]);
        assert_eq!(host.arp_calls.load(Ordering::SeqCst), 2);
        assert!(result.duration_ms >= 0);
        assert!(!result.scanned_at.is_empty());
    }

    #[tokio::test]
    async fn deep_false_skips_sweep_but_keeps_neighbour_cache() {
        let host = FakeHost::new(vec![iface("192.168.1.10", false)]);
        let result = scan_network(
            &host,
            NetworkScanOptions {
                subnet: Some("192.168.1.0/24".to_string()),
                deep: Some(false),
                include_ips: Vec::new(),
            },
        )
        .await
        .expect("scan succeeds");

        assert_eq!(host.sweeps.load(Ordering::SeqCst), 0);
        assert!(host.sleeps.lock().unwrap().is_empty());
        assert_eq!(host.arp_calls.load(Ordering::SeqCst), 1);
        assert_eq!(result.hosts.len(), 1);
        assert_eq!(result.hosts[0].ip, "192.168.1.1");
    }

    #[tokio::test]
    async fn scan_without_subnets_reports_parity_error() {
        let host = FakeHost::new(vec![iface("127.0.0.1", true)]);
        let error = scan_network(&host, NetworkScanOptions::default())
            .await
            .expect_err("no subnets");
        assert_eq!(error, ScanError::NoActiveSubnets);
        assert_eq!(error.to_string(), "No active IPv4 subnets found");
    }
}
