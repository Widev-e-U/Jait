//! Validation of the private desktop-host launch arguments.
//! This does not authorize the state directory or start a gateway.
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DesktopNetwork {
    Local,
    Network,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DesktopHostConfig {
    pub state_dir: PathBuf,
    pub port: u16,
    pub network: DesktopNetwork,
}

impl DesktopHostConfig {
    pub fn parse(state_dir: &str, port_text: &str, network: &str) -> Result<Self, &'static str> {
        const ERROR: &str = "Invalid desktop gateway launch configuration";
        let path = Path::new(state_dir);
        let number = js_number(port_text).ok_or(ERROR)?;
        let network = match network {
            "local" => DesktopNetwork::Local,
            "network" => DesktopNetwork::Network,
            _ => return Err(ERROR),
        };
        if state_dir.is_empty()
            || !path.is_absolute()
            || !number.is_finite()
            || number.fract() != 0.0
            || !(1024.0..=65535.0).contains(&number)
        {
            return Err(ERROR);
        }
        Ok(Self {
            state_dir: path.to_path_buf(),
            port: number as u16,
            network,
        })
    }

    pub fn bind_host(&self) -> &'static str {
        match self.network {
            DesktopNetwork::Local => "127.0.0.1",
            DesktopNetwork::Network => "0.0.0.0",
        }
    }
}

// Number() accepts unsigned radix prefixes and decimal/exponent notation.
fn js_number(input: &str) -> Option<f64> {
    let text = input.trim_matches(|c: char| matches!(c, '\u{0009}'..='\u{000d}' | '\u{0020}' | '\u{00a0}' | '\u{1680}' | '\u{2000}'..='\u{200a}' | '\u{2028}' | '\u{2029}' | '\u{202f}' | '\u{205f}' | '\u{3000}' | '\u{feff}'));
    if text.is_empty() {
        return Some(0.0);
    }
    for (prefix, radix) in [
        ("0x", 16),
        ("0X", 16),
        ("0o", 8),
        ("0O", 8),
        ("0b", 2),
        ("0B", 2),
    ] {
        if let Some(digits) = text.strip_prefix(prefix) {
            if digits.is_empty() || !digits.chars().all(|c| c.is_ascii() && c.is_digit(radix)) {
                return None;
            }
            return u64::from_str_radix(digits, radix).ok().map(|n| n as f64);
        }
    }
    // Rust permits inf but JavaScript Number does not; both are rejected above.
    text.parse::<f64>().ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_reference_number_forms_and_binds_requested_network() {
        let cfg = DesktopHostConfig::parse("/state", "0x400", "local").unwrap();
        assert_eq!(cfg.port, 1024);
        assert_eq!(cfg.bind_host(), "127.0.0.1");
        let cfg = DesktopHostConfig::parse("/state", " 6.5535e4 ", "network").unwrap();
        assert_eq!(cfg.port, 65535);
        assert_eq!(cfg.bind_host(), "0.0.0.0");
    }

    #[test]
    fn rejects_invalid_path_port_and_network() {
        for (path, port, network) in [
            ("relative", "1024", "local"),
            ("", "1024", "local"),
            ("/state", "1023", "local"),
            ("/state", "65536", "local"),
            ("/state", "1024.5", "local"),
            ("/state", "NaN", "local"),
            ("/state", "1024", "public"),
            ("/state", "", "local"),
            ("/state", "0x+400", "local"),
            ("/state", "\u{0085}1024\u{0085}", "local"),
        ] {
            assert!(DesktopHostConfig::parse(path, port, network).is_err());
        }
    }
}
