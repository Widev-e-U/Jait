//! Per-session Pi MCP config and owned wrapper files. Callers supply an authorized scratch root.
use crate::text::js_trim;
use serde::Deserialize;
use serde_json::{Map, Value, json};
use std::{
    collections::BTreeMap,
    fs, io,
    path::{Path, PathBuf},
};
pub const PI_BASED_PROVIDER_TYPES: [&str; 2] = ["pi", "pi-gemini"];
pub fn is_pi_based_provider(provider: &str) -> bool {
    PI_BASED_PROVIDER_TYPES.contains(&provider)
}
#[derive(Clone, Debug, Deserialize)]
pub struct PiMcpServer {
    pub name: String,
    #[serde(flatten)]
    pub connection: PiMcpConnection,
}
#[derive(Clone, Debug, Deserialize)]
#[serde(tag = "transport", rename_all = "lowercase")]
pub enum PiMcpConnection {
    Stdio {
        command: String,
        #[serde(default)]
        args: Option<Vec<String>>,
        #[serde(default)]
        env: Option<Map<String, Value>>,
    },
    Http {
        url: String,
    },
    Sse {
        url: String,
    },
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WrapperPlatform {
    Unix,
    Windows,
}
impl Default for WrapperPlatform {
    fn default() -> Self {
        if cfg!(windows) {
            Self::Windows
        } else {
            Self::Unix
        }
    }
}
pub struct PiMcpOptions {
    pub session_id: String,
    pub real_pi_command: Option<String>,
    pub scratch_root: PathBuf,
    pub platform: WrapperPlatform,
}
pub struct PiMcpProvision {
    directory: PathBuf,
    config: PathBuf,
    wrapper: PathBuf,
}
impl PiMcpProvision {
    pub fn directory(&self) -> &Path {
        &self.directory
    }
    pub fn config_path(&self) -> &Path {
        &self.config
    }
    pub fn wrapper_path(&self) -> &Path {
        &self.wrapper
    }
    pub fn env(&self) -> BTreeMap<String, String> {
        BTreeMap::from([(
            "PI_ACP_PI_COMMAND".into(),
            self.wrapper.to_str().expect("validated UTF-8 root").into(),
        )])
    }
    pub fn cleanup(&self) {
        let _ = fs::remove_dir_all(&self.directory);
    }
}
impl Drop for PiMcpProvision {
    fn drop(&mut self) {
        self.cleanup();
    }
}
fn create_directory(options: &PiMcpOptions) -> io::Result<PathBuf> {
    if options.session_id.contains(['/', '\\', '\0']) {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "Invalid pi MCP session id",
        ));
    }
    if options.scratch_root.to_str().is_none() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "Pi MCP scratch root is not UTF-8",
        ));
    }
    for _ in 0..8 {
        let dir = options.scratch_root.join(format!(
            "jait-pi-mcp-{}-{}",
            options.session_id,
            uuid::Uuid::new_v4()
        ));
        let mut builder = fs::DirBuilder::new();
        #[cfg(unix)]
        {
            use std::os::unix::fs::DirBuilderExt;
            builder.mode(0o700);
        }
        match builder.create(&dir) {
            Ok(()) => return Ok(dir),
            Err(e) if e.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(e),
        }
    }
    Err(io::Error::new(
        io::ErrorKind::AlreadyExists,
        "Pi MCP directory name collision",
    ))
}
fn ordered_object(map: Map<String, Value>) -> Map<String, Value> {
    fn index(key: &str) -> Option<u32> {
        key.parse::<u32>()
            .ok()
            .filter(|n| *n < u32::MAX && n.to_string() == key)
    }
    let mut rows = map.into_iter().collect::<Vec<_>>();
    // JavaScript object enumeration sorts array indices before other insertion-ordered keys.
    rows.sort_by_key(|(key, _)| index(key).map(|n| (0, n)).unwrap_or((1, 0)));
    rows.into_iter().collect()
}
pub fn to_pi_mcp_servers(servers: &[PiMcpServer]) -> Value {
    let mut map = Map::new();
    for server in servers {
        let value = match &server.connection {
            PiMcpConnection::Stdio { command, args, env } => {
                let mut v = json!({"command":command,"args":args.as_deref().unwrap_or(&[])});
                if let Some(env) = env {
                    v["env"] = Value::Object(ordered_object(env.clone()))
                }
                v
            }
            PiMcpConnection::Http { url } | PiMcpConnection::Sse { url } => {
                json!({"url":url,"lifecycle":"lazy"})
            }
        };
        map.insert(server.name.clone(), value);
    }
    Value::Object(ordered_object(map))
}
fn quote_posix(value: &str) -> String {
    let mut out = String::from("\"");
    for c in value.chars() {
        if matches!(c, '"' | '\\' | '$' | '\u{0060}') {
            out.push('\\')
        }
        out.push(c)
    }
    out.push('"');
    out
}
pub fn build_pi_wrapper(config: &str, command: &str, platform: WrapperPlatform) -> String {
    if platform == WrapperPlatform::Windows {
        format!("@echo off\r\n\"{command}\" --mcp-config \"{config}\" %*\r\n")
    } else {
        format!(
            "#!/bin/sh\nexec {} --mcp-config {} \"$@\"\n",
            quote_posix(command),
            quote_posix(config)
        )
    }
}
pub fn provision_pi_mcp(
    provider: &str,
    servers: &[PiMcpServer],
    options: &PiMcpOptions,
    warn: impl FnMut(String),
) -> Option<PiMcpProvision> {
    provision_with_writer(provider, servers, options, warn, write_files)
}
fn write_files(
    provision: &PiMcpProvision,
    options: &PiMcpOptions,
    servers: &[PiMcpServer],
) -> io::Result<()> {
    let data = json!({"mcpServers":to_pi_mcp_servers(servers)});
    fs::write(
        &provision.config,
        format!("{}\n", serde_json::to_string_pretty(&data)?),
    )?;
    let command = options
        .real_pi_command
        .as_deref()
        .map(js_trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("pi");
    fs::write(
        &provision.wrapper,
        build_pi_wrapper(
            provision.config.to_str().unwrap(),
            command,
            options.platform,
        ),
    )?;
    #[cfg(unix)]
    if options.platform == WrapperPlatform::Unix {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&provision.wrapper, fs::Permissions::from_mode(0o755))?;
    }
    Ok(())
}
fn provision_with_writer(
    provider: &str,
    servers: &[PiMcpServer],
    options: &PiMcpOptions,
    mut warn: impl FnMut(String),
    writer: impl FnOnce(&PiMcpProvision, &PiMcpOptions, &[PiMcpServer]) -> io::Result<()>,
) -> Option<PiMcpProvision> {
    if !is_pi_based_provider(provider) || servers.is_empty() {
        return None;
    }
    let directory = match create_directory(options) {
        Ok(d) => d,
        Err(e) => {
            warn(format!(
                "[acp] pi MCP provisioning failed, continuing without Jait tools: {e}"
            ));
            return None;
        }
    };
    let provision = PiMcpProvision {
        config: directory.join("mcp.json"),
        wrapper: directory.join(if options.platform == WrapperPlatform::Windows {
            "pi-wrapper.cmd"
        } else {
            "pi-wrapper.sh"
        }),
        directory,
    };
    if let Err(e) = writer(&provision, options, servers) {
        warn(format!(
            "[acp] pi MCP provisioning failed, continuing without Jait tools: {e}"
        ));
        return None;
    }
    Some(provision)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn partial_write_failure_cleans_real_files_and_returns_none() {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../.jait/artifacts/gateway-rust/pi-partial-write")
            .join(uuid::Uuid::new_v4().to_string());
        fs::create_dir_all(&root).unwrap();
        let options = PiMcpOptions {
            session_id: "partial".into(),
            real_pi_command: None,
            scratch_root: root.clone(),
            platform: WrapperPlatform::Unix,
        };
        let servers = vec![PiMcpServer {
            name: "local".into(),
            connection: PiMcpConnection::Http {
                url: "http://example.test/mcp".into(),
            },
        }];
        let mut warnings = vec![];
        let result = provision_with_writer(
            "pi",
            &servers,
            &options,
            |m| warnings.push(m),
            |p, _, _| {
                fs::write(&p.config, "partial")?;
                fs::create_dir(&p.wrapper)?;
                fs::write(&p.wrapper, "cannot write a file over a directory")
            },
        );
        assert!(result.is_none());
        assert_eq!(warnings.len(), 1);
        assert!(fs::read_dir(&root).unwrap().next().is_none());
    }
}
