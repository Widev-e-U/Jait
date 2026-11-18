//! SSH/SCP transfer orchestration. This is an internal authorized-execution boundary.
use crate::runtime::command::{CommandFailure, CommandPool, CommandSpec};
use serde::{Deserialize, Serialize};
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectTransferInput {
    pub source_path: String,
    pub destination_path: String,
    pub ssh_host: String,
    pub ssh_user: String,
    #[serde(default)]
    pub ssh_port: OptionalPort,
}
#[derive(Clone, Debug, Default)]
pub enum OptionalPort {
    #[default]
    Missing,
    Present(serde_json::Value),
}
impl<'de> Deserialize<'de> for OptionalPort {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        serde_json::Value::deserialize(deserializer).map(Self::Present)
    }
}
#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
pub struct ProjectTransferResult {
    pub output: String,
}
fn validation(message: &str) -> CommandFailure {
    CommandFailure {
        message: message.into(),
    }
}
fn validate_ssh_part(value: &str, label: &str) -> Result<(), CommandFailure> {
    if crate::text::js_trim(value).is_empty() {
        return Err(validation(&format!("{label} is required.")));
    }
    if value
        .bytes()
        .any(|c| !c.is_ascii_alphanumeric() && !b"._:-".contains(&c))
    {
        return Err(validation(&format!(
            "{label} contains unsupported characters."
        )));
    }
    Ok(())
}
/// Plans are useful for review; constructing one performs no transfer.
pub fn transfer_plan(input: &ProjectTransferInput) -> Result<[CommandSpec; 2], CommandFailure> {
    validate_ssh_part(&input.ssh_host, "sshHost")?;
    validate_ssh_part(&input.ssh_user, "sshUser")?;
    let port = match &input.ssh_port {
        OptionalPort::Missing => None,
        OptionalPort::Present(value) => Some(
            value
                .as_f64()
                .filter(|n| n.is_finite() && n.fract() == 0.0 && (1.0..=65535.0).contains(n))
                .ok_or_else(|| validation("sshPort must be an integer between 1 and 65535."))?
                as u16,
        ),
    };
    if input
        .destination_path
        .chars()
        .any(|c| matches!(c, '\0' | '\r' | '\n'))
    {
        return Err(validation(
            "Destination path contains unsupported characters.",
        ));
    }
    let target = format!("{}@{}", input.ssh_user, input.ssh_host);
    let remote = format!("'{}'", input.destination_path.replace('\'', "'\"'\"'"));
    let mut ssh = vec![
        "-o".into(),
        "BatchMode=yes".into(),
        "-o".into(),
        "ConnectTimeout=10".into(),
    ];
    let mut scp = vec![
        "-r".into(),
        "-o".into(),
        "BatchMode=yes".into(),
        "-o".into(),
        "ConnectTimeout=10".into(),
    ];
    if let Some(port) = port {
        let port = port.to_string();
        ssh.extend(["-p".into(), port.clone()]);
        scp.extend(["-P".into(), port]);
    }
    ssh.extend([target.clone(), format!("mkdir -p -- {remote}")]);
    scp.extend([
        format!("{}/.", input.source_path.trim_end_matches(['\\', '/'])),
        format!("{target}:{remote}"),
    ]);
    Ok([
        CommandSpec {
            program: "ssh".into(),
            args: ssh,
            timeout_ms: 30_000,
            max_buffer: 1024 * 1024,
        },
        CommandSpec {
            program: "scp".into(),
            args: scp,
            timeout_ms: 15 * 60_000,
            max_buffer: 10 * 1024 * 1024,
        },
    ])
}
pub async fn transfer_project_with_scp(
    input: &ProjectTransferInput,
    pool: &CommandPool,
) -> Result<ProjectTransferResult, CommandFailure> {
    let [prepared, copied] = transfer_plan(input)?;
    let prepared = pool.run(&prepared).await?;
    let copied = pool.run(&copied).await?;
    let output = [
        prepared.stdout,
        prepared.stderr,
        copied.stdout,
        copied.stderr,
    ]
    .into_iter()
    .filter(|s| !s.is_empty())
    .collect::<Vec<_>>()
    .join("\n");
    Ok(ProjectTransferResult {
        output: crate::text::js_trim(&output).into(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    fn input() -> ProjectTransferInput {
        serde_json::from_value(json!({"sourcePath":"C:\\owned\\project\\/","destinationPath":"/owned/a'b","sshHost":"host.invalid","sshUser":"owner","sshPort":2222})).unwrap()
    }
    #[test]
    fn command_plans_preserve_quoting_ports_contents_and_execution_limits() {
        let [ssh, scp] = transfer_plan(&input()).unwrap();
        assert_eq!(
            ssh.args,
            vec![
                "-o",
                "BatchMode=yes",
                "-o",
                "ConnectTimeout=10",
                "-p",
                "2222",
                "owner@host.invalid",
                "mkdir -p -- '/owned/a'\"'\"'b'"
            ]
        );
        assert_eq!(
            scp.args,
            vec![
                "-r",
                "-o",
                "BatchMode=yes",
                "-o",
                "ConnectTimeout=10",
                "-P",
                "2222",
                "C:\\owned\\project/.",
                "owner@host.invalid:'/owned/a'\"'\"'b'"
            ]
        );
        assert_eq!((ssh.timeout_ms, ssh.max_buffer), (30_000, 1024 * 1024));
        assert_eq!(
            (scp.timeout_ms, scp.max_buffer),
            (900_000, 10 * 1024 * 1024)
        );
    }
    #[test]
    fn explicit_null_port_and_destination_injection_fail_before_execution() {
        let mut input = input();
        input.ssh_port = OptionalPort::Present(serde_json::Value::Null);
        assert_eq!(
            transfer_plan(&input).unwrap_err().message,
            "sshPort must be an integer between 1 and 65535."
        );
        input.ssh_port = OptionalPort::Missing;
        input.destination_path = "bad\npath".into();
        assert_eq!(
            transfer_plan(&input).unwrap_err().message,
            "Destination path contains unsupported characters."
        );
        input.ssh_host = "host;id".into();
        assert_eq!(
            transfer_plan(&input).unwrap_err().message,
            "sshHost contains unsupported characters."
        );
    }
}
