//! Syntactic outbound URL policy matching the gateway's SSRFGuard.
//! DNS resolution, redirects, and connection pinning belong to the transport adapter.
use std::net::{IpAddr, Ipv4Addr};
use url::Url;

#[derive(Clone, Debug, Default)]
pub struct SsrfGuard {
    pub allow_private_hosts: bool,
    pub allowed_hosts: Vec<String>,
}
impl SsrfGuard {
    pub fn validate(&self, raw: &str) -> Result<Url, String> {
        let url = Url::parse(raw).map_err(|_| format!("Invalid URL: {raw}"))?;
        if !matches!(url.scheme(), "http" | "https") {
            return Err(format!("Blocked protocol: {}:", url.scheme()));
        }
        let host = url
            .host_str()
            .unwrap_or("")
            .trim_matches(['[', ']'])
            .to_lowercase();
        if !self.allowed_hosts.is_empty()
            && !self
                .allowed_hosts
                .iter()
                .any(|candidate| candidate.to_lowercase() == host)
        {
            return Err(format!("Host not allowlisted: {host}"));
        }
        if !self.allow_private_hosts && is_private_host(&host) {
            return Err(format!("Blocked private host: {host}"));
        }
        Ok(url)
    }
}
fn private_v4(ip: Ipv4Addr) -> bool {
    let value = u32::from(ip);
    [
        ([0, 0, 0, 0], 8),
        ([10, 0, 0, 0], 8),
        ([127, 0, 0, 0], 8),
        ([100, 64, 0, 0], 10),
        ([169, 254, 0, 0], 16),
        ([172, 16, 0, 0], 12),
        ([192, 0, 0, 0], 24),
        ([192, 0, 2, 0], 24),
        ([192, 168, 0, 0], 16),
        ([198, 18, 0, 0], 15),
        ([198, 51, 100, 0], 24),
        ([203, 0, 113, 0], 24),
        ([224, 0, 0, 0], 4),
        ([240, 0, 0, 0], 4),
    ]
    .into_iter()
    .any(|(network, prefix)| {
        value & (u32::MAX << (32 - prefix)) == u32::from(Ipv4Addr::from(network))
    })
}
fn is_private_host(host: &str) -> bool {
    if host == "localhost" || host.ends_with(".localhost") {
        return true;
    }
    match host.parse::<IpAddr>() {
        Ok(IpAddr::V4(ip)) => private_v4(ip),
        Ok(IpAddr::V6(ip)) => {
            let segments = ip.segments();
            ip.is_unspecified()
                || ip.is_loopback()
                || segments[0] & 0xfe00 == 0xfc00
                || segments[0] & 0xffc0 == 0xfe80
                || segments[0] & 0xff00 == 0xff00
                || (segments[0] == 0x2001 && segments[1] == 0xdb8)
                || ip.to_ipv4_mapped().is_some_and(private_v4)
        }
        Err(_) => false,
    }
}
