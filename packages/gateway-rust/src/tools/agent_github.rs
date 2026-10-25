//! Agent GitHub tool presentation over explicit identity and credential-service ports.
//! The host retains owner checks, key storage, bounded network access and token policy.
use super::core_io::HostError;
use crate::services::calendar::{js_text, truthy};
use futures_util::future::BoxFuture;
use serde_json::{Value, json};
use std::sync::{Arc, LazyLock};

pub fn metadata() -> &'static Value {
    static DATA: LazyLock<Value> = LazyLock::new(|| {
        serde_json::from_str(include_str!("agent-github-metadata.json"))
            .expect("GitHub tool metadata")
    });
    &DATA
}
#[derive(Clone, Debug)]
pub enum GithubOperation {
    Initialize,
    CurrentAgent {
        user: String,
        thread: Option<String>,
    },
    List(String),
    Get(String, String),
    PublicBaseUrl,
    WebhookSecret(String, String),
    Test(String, String),
    ResolveEnv(String, String),
}
pub type GithubPort =
    Arc<dyn Fn(GithubOperation) -> BoxFuture<'static, Result<Value, HostError>> + Send + Sync>;
pub struct GithubTools {
    pub port: GithubPort,
    pub has_current_agent: bool,
}
fn fail(message: impl Into<String>) -> Value {
    json!({"ok":false,"message":message.into()})
}
fn success(message: String, data: Value) -> Value {
    json!({"ok":true,"message":message,"data":data})
}
fn text(value: Option<&Value>) -> String {
    value.map(js_text).unwrap_or_else(|| "undefined".into())
}
fn fallback(value: &Value, default: Value) -> Value {
    if truthy(value) {
        value.clone()
    } else {
        default
    }
}
fn error_text(error: HostError) -> String {
    match error {
        HostError::Error(s) => s,
        HostError::Thrown(v) => js_text(&v),
    }
}
// ECMAScript WhiteSpace + LineTerminator; Rust's trim also accepts U+0085.
fn trim(s: &str) -> &str {
    s.trim_matches(|c| matches!(c,'\u{9}'..='\u{d}'|' '|'\u{a0}'|'\u{1680}'|'\u{2000}'..='\u{200a}'|'\u{2028}'|'\u{2029}'|'\u{202f}'|'\u{205f}'|'\u{3000}'|'\u{feff}'))
}
impl GithubTools {
    async fn resolve(
        &self,
        input: &Value,
        user: &str,
        thread: Option<&str>,
    ) -> Result<Option<String>, HostError> {
        if let Some(id) = input["agentId"]
            .as_str()
            .map(trim)
            .filter(|s| !s.is_empty())
        {
            return Ok(Some(id.into()));
        }
        if self.has_current_agent {
            let value = (self.port)(GithubOperation::CurrentAgent {
                user: user.into(),
                thread: thread.map(str::to_owned),
            })
            .await?;
            return Ok(value.as_str().filter(|s| !s.is_empty()).map(str::to_owned));
        }
        Ok(None)
    }
    /// Inputs have passed registry validation; only execution policy lives here.
    pub async fn execute(
        &self,
        token: bool,
        input: &Value,
        user: Option<&str>,
        thread: Option<&str>,
    ) -> Result<Value, HostError> {
        let Some(user) = user.filter(|s| !s.is_empty()) else {
            return Ok(fail(if token {
                "Authenticated user required to mint an agent GitHub token."
            } else {
                "Authenticated user required to inspect GitHub App connections."
            }));
        };
        if !token {
            (self.port)(GithubOperation::Initialize).await?;
        }
        let agent = self.resolve(input, user, thread).await?;
        if token {
            return self.token(user, agent).await;
        }
        if truthy(&input["agentId"]) && agent.is_none() {
            return Ok(fail("A valid agent id is required."));
        }
        match input["action"].as_str() {
            Some("status") => {
                let connections = (self.port)(GithubOperation::List(user.into())).await?;
                let message = if let Some(id) = &agent {
                    let connection =
                        (self.port)(GithubOperation::Get(user.into(), id.clone())).await?;
                    if truthy(&connection) {
                        format!("Agent {id} GitHub App: {}.", text(connection.get("status")))
                    } else {
                        format!("Agent {id} has no GitHub App connected.")
                    }
                } else {
                    let list = connections.as_array().expect("typed connection list");
                    format!(
                        "{} of {} agents are connected to GitHub Apps.",
                        list.iter().filter(|c| c["status"] == "connected").count(),
                        list.len()
                    )
                };
                let base = (self.port)(GithubOperation::PublicBaseUrl).await?;
                let mut data = json!({"connections":connections,"webhookUrl":format!("{}/api/github/apps/webhook",js_text(&base)),"currentAgentId":agent});
                if let Some(id) = agent {
                    data["webhookSecretAvailable"] = json!(truthy(
                        &(self.port)(GithubOperation::WebhookSecret(user.into(), id)).await?
                    ));
                }
                Ok(success(message, data))
            }
            Some("instructions") => {
                let first = (self.port)(GithubOperation::PublicBaseUrl).await?;
                let message = format!(
                    "Webhook URL for every agent App: {}/api/github/apps/webhook\nConnect an App from the Agents page (Agents → agent → GitHub) using the one-click manifest flow\nor register an existing App manually with its App id + private key and installation id.\nRequired App permissions: Contents, Pull requests, Issues (read/write), Metadata (read).",
                    js_text(&first)
                );
                let base = (self.port)(GithubOperation::PublicBaseUrl).await?;
                Ok(success(
                    message,
                    json!({"page":"/agents","webhookUrl":format!("{}/api/github/apps/webhook",js_text(&base)),"agentId":agent}),
                ))
            }
            _ => {
                let Some(id) = agent else {
                    return Ok(fail(
                        "Specify agentId (or run inside that agent's thread) to test its connection.",
                    ));
                };
                Ok(
                    match (self.port)(GithubOperation::Test(user.into(), id.clone())).await {
                        Ok(result) => {
                            let message = if truthy(&result["ok"]) {
                                format!(
                                    "Agent {id} authenticates as {} with access to {} repositories.",
                                    result
                                        .get("botLogin")
                                        .filter(|v| !v.is_null())
                                        .map(js_text)
                                        .unwrap_or_else(|| "its App bot".into()),
                                    result
                                        .get("repositoryCount")
                                        .filter(|v| !v.is_null())
                                        .map(js_text)
                                        .unwrap_or_else(|| "0".into())
                                )
                            } else {
                                format!("Agent {id} GitHub App test failed.")
                            };
                            success(message, result)
                        }
                        Err(error) => fail(format!(
                            "Agent GitHub App test failed: {}",
                            error_text(error)
                        )),
                    },
                )
            }
        }
    }
    async fn token(&self, user: &str, agent: Option<String>) -> Result<Value, HostError> {
        let Some(id) = agent else {
            return Ok(fail("No agent identity resolved; pass agentId explicitly."));
        };
        (self.port)(GithubOperation::Initialize).await?;
        let connection = (self.port)(GithubOperation::Get(user.into(), id.clone())).await?;
        if !truthy(&connection) {
            return Ok(fail(format!(
                "Agent {id} has no GitHub App connected. Connect it on the Agents page first."
            )));
        }
        if connection["status"] != "connected" {
            return Ok(fail(format!(
                "Agent {id} GitHub App is {}: {}.",
                text(connection.get("status")),
                connection
                    .get("lastError")
                    .filter(|v| !v.is_null())
                    .map(js_text)
                    .unwrap_or_else(|| "not usable yet".into())
            )));
        }
        Ok(
            match (self.port)(GithubOperation::ResolveEnv(user.into(), id.clone())).await {
                Ok(env) => {
                    if !truthy(&env) {
                        return Ok(fail(format!(
                            "Agent {id} GitHub App could not mint a token."
                        )));
                    }
                    let identity = fallback(&env["GITHUB_APP_BOT_LOGIN"], Value::Null);
                    let mut data = json!({"tokenType":"installation","identity":identity,"appSlug":fallback(&env["GITHUB_APP_SLUG"],Value::Null),"installationId":fallback(&env["GITHUB_APP_INSTALLATION_ID"],Value::Null),"env":env,"usage":format!("Use the token as GH_TOKEN for gh/git commands, e.g.\n  GH_TOKEN={} gh api /installation/repositories\nIt expires shortly, so mint a fresh one per task instead of storing it.",text(env.get("GH_TOKEN")))});
                    for (output, key) in [
                        ("token", "GH_TOKEN"),
                        ("expiresAt", "JAIT_GITHUB_TOKEN_EXPIRES_AT"),
                    ] {
                        if let Some(value) = env.get(key) {
                            data[output] = value.clone();
                        }
                    }
                    success(
                        format!(
                            "Minted GitHub App token for agent {id} as {}, expiring {}.",
                            js_text(&fallback(&env["GITHUB_APP_BOT_LOGIN"], json!("bot"))),
                            text(env.get("JAIT_GITHUB_TOKEN_EXPIRES_AT"))
                        ),
                        data,
                    )
                }
                Err(error) => fail(format!(
                    "Could not mint agent GitHub token: {}",
                    error_text(error)
                )),
            },
        )
    }
}
