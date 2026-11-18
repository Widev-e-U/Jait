//! Registry-facing view of ACP providers: identity, availability probing and the built-in
//! definitions. Sessions stay in `acp_provider`; this only reports what is installed.

use std::{collections::BTreeMap, sync::Arc, time::Duration};

use futures_util::future::BoxFuture;
use serde_json::{Value, json};
use tokio::process::Command;

use super::{
    acp_provider::{AcpProvider, AcpProviderConfig, STRIPPED_ENV_VARS, build_child_env},
    registry::{ProviderAdapter, ProviderRegistry},
};

const AVAILABILITY_PROBE_TIMEOUT: Duration = Duration::from_secs(5);

/// Display metadata and probe command that `AcpProviderConfig` does not carry.
#[derive(Clone, Debug)]
pub struct AcpDefinition {
    pub config: AcpProviderConfig,
    pub name: String,
    pub description: String,
    pub availability_command: Option<String>,
}

fn definition(
    id: &str,
    name: &str,
    description: &str,
    package: &str,
    availability_command: Option<&str>,
) -> AcpDefinition {
    AcpDefinition {
        config: AcpProviderConfig {
            id: id.into(),
            command: "npx".into(),
            args: vec!["-y".into(), package.into()],
            provider_type: id.into(),
            execution_node_id: None,
        },
        name: name.into(),
        description: description.into(),
        availability_command: availability_command.map(str::to_string),
    }
}

/// Built-in definitions, matching `loadAcpProviderConfigs` defaults.
pub fn default_definitions() -> Vec<AcpDefinition> {
    vec![
        definition(
            "codex",
            "Codex",
            "OpenAI Codex via Agent Client Protocol",
            "@agentclientprotocol/codex-acp",
            None,
        ),
        definition(
            "claude-code",
            "Claude Code",
            "Claude Code via Agent Client Protocol",
            "@agentclientprotocol/claude-agent-acp",
            None,
        ),
        definition(
            "pi",
            "Pi",
            "Pi coding agent via Agent Client Protocol",
            "pi-acp",
            Some("pi"),
        ),
        definition(
            "muse",
            "Muse Code",
            "Meta Muse Code via Agent Client Protocol",
            "@bex-co/muse-code-acp",
            Some("muse"),
        ),
    ]
}

/// `JAIT_ACP_PROVIDERS` is a JSON array like the Node gateway's; malformed input falls back to defaults.
pub fn definitions_from_env(raw: Option<&str>) -> Vec<AcpDefinition> {
    let Some(raw) = raw.map(str::trim).filter(|r| !r.is_empty()) else {
        return default_definitions();
    };
    let Ok(Value::Array(items)) = serde_json::from_str::<Value>(raw) else {
        return default_definitions();
    };
    items
        .iter()
        .filter_map(|item| {
            let id = item.get("id")?.as_str()?;
            let command = item.get("command")?.as_str()?;
            let text = |key: &str| item.get(key).and_then(Value::as_str);
            Some(AcpDefinition {
                config: AcpProviderConfig {
                    id: id.into(),
                    command: command.into(),
                    args: item
                        .get("args")
                        .and_then(Value::as_array)
                        .map(|a| {
                            a.iter()
                                .filter_map(|v| v.as_str().map(str::to_string))
                                .collect()
                        })
                        .unwrap_or_default(),
                    provider_type: text("providerType").unwrap_or(id).into(),
                    execution_node_id: text("executionNodeId").map(str::to_string),
                },
                name: text("name").unwrap_or(id).into(),
                description: text("description").unwrap_or_default().into(),
                availability_command: text("availabilityCommand").map(str::to_string),
            })
        })
        .collect()
}

pub struct AcpAdapter {
    provider: AcpProvider,
    name: String,
    description: String,
    availability_command: Option<String>,
}

impl AcpAdapter {
    pub fn new(definition: AcpDefinition) -> Self {
        Self {
            provider: AcpProvider::new(definition.config),
            name: definition.name,
            description: definition.description,
            availability_command: definition.availability_command,
        }
    }

    pub fn provider(&self) -> &AcpProvider {
        &self.provider
    }

    fn info_with(&self, available: bool, reason: Option<String>) -> Value {
        let config = &self.provider.config;
        json!({
            "id": config.id,
            "providerType": config.provider_type,
            "name": self.name,
            "description": self.description,
            "available": available,
            "unavailableReason": reason,
            "modes": ["full-access", "supervised"],
        })
    }
}

impl ProviderAdapter for AcpAdapter {
    fn id(&self) -> &str {
        &self.provider.config.id
    }

    fn info(&self) -> Value {
        self.info_with(false, None)
    }

    /// Only a failure to spawn the binary counts as missing; a non-zero `--version` exit or a
    /// timeout still means the command exists (npx may be downloading the adapter).
    fn check_availability(&self) -> BoxFuture<'static, Result<(), String>> {
        let node_error = self.provider.ensure_local().err();
        let command = self
            .availability_command
            .clone()
            .unwrap_or_else(|| self.provider.config.command.clone());
        Box::pin(async move {
            if let Some(error) = node_error {
                return Err(error);
            }
            let env = build_child_env(
                &std::env::vars().collect::<BTreeMap<_, _>>(),
                &[],
                STRIPPED_ENV_VARS,
            );
            let mut probe = Command::new(&command);
            probe
                .arg("--version")
                .env_clear()
                .envs(env)
                .kill_on_drop(true);
            match tokio::time::timeout(AVAILABILITY_PROBE_TIMEOUT, probe.output()).await {
                Ok(Err(error))
                    if error.kind() == std::io::ErrorKind::NotFound && command != "npx" =>
                {
                    Err(format!("ACP provider command not found: {command}"))
                }
                _ => Ok(()),
            }
        })
    }
}

/// Registers every definition whose id is not already taken.
pub fn register_all(registry: &ProviderRegistry, definitions: Vec<AcpDefinition>) {
    for definition in definitions {
        if registry.get(&definition.config.id).is_none() {
            registry.register(Arc::new(AcpAdapter::new(definition)));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_cover_the_four_builtin_agents() {
        let ids: Vec<_> = default_definitions()
            .into_iter()
            .map(|d| d.config.id)
            .collect();
        assert_eq!(ids, ["codex", "claude-code", "pi", "muse"]);
    }

    #[test]
    fn env_definitions_filter_invalid_and_fall_back_on_garbage() {
        let parsed = definitions_from_env(Some(
            r#"[{"id":"x","command":"x-bin","args":["a"]},{"id":"bad"},7]"#,
        ));
        assert_eq!(parsed.len(), 1);
        assert_eq!(parsed[0].config.args, ["a"]);
        assert_eq!(parsed[0].config.provider_type, "x");
        assert_eq!(definitions_from_env(Some("{nope")).len(), 4);
        assert_eq!(definitions_from_env(Some("  ")).len(), 4);
    }

    #[tokio::test]
    async fn missing_binary_is_unavailable_but_npx_is_not_probed_strictly() {
        let mut def = default_definitions().remove(0);
        def.config.command = "definitely-not-installed-jait".into();
        let missing = AcpAdapter::new(def);
        assert!(
            missing
                .check_availability()
                .await
                .unwrap_err()
                .contains("definitely-not-installed-jait")
        );
        let mut remote = default_definitions().remove(0);
        remote.config.execution_node_id = Some("laptop".into());
        assert!(AcpAdapter::new(remote).check_availability().await.is_err());
    }

    #[test]
    fn register_all_keeps_existing_ids() {
        let registry = ProviderRegistry::default();
        register_all(&registry, default_definitions());
        register_all(&registry, default_definitions());
        assert_eq!(registry.list().len(), 4);
    }
}
