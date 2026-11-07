use jait_gateway::runtime::application::{Application, ApplicationConfig};
use jait_gateway::ws::WsHubConfig;
use jait_gateway::{Gateway, config::GatewayConfig, health::HealthState};
use std::num::NonZeroUsize;
use std::process::ExitCode;
use std::time::Duration;

/// Concurrent websocket upgrades the hub serves before refusing new ones.
const WS_MAX_CONNECTIONS: usize = 512;
/// Deadline for the per-attempt database user check; expiry denies.
const WS_AUTHORITY_TIMEOUT: Duration = Duration::from_secs(2);

#[tokio::main]
async fn main() -> ExitCode {
    match run().await {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            // Config errors contain key names, never supplied values or credentials.
            eprintln!(
                "{}",
                serde_json::json!({"event":"gateway.error", "error":error.to_string()})
            );
            ExitCode::FAILURE
        }
    }
}
async fn run() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let config = GatewayConfig::from_lookup(|key| std::env::var(key).ok())?;
    // Install signals before announcing readiness.
    #[cfg(unix)]
    let mut terminate = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())?;
    #[cfg(unix)]
    let mut interrupt = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::interrupt())?;
    let application = ApplicationConfig::from_lookup(|key| std::env::var(key).ok())?;
    let chat = jait_gateway::runtime::chat_config::ChatConfiguration::from_lookup(|key| {
        std::env::var(key).ok()
    })?;
    let chat_enabled = chat.is_some();
    let shutdown = async move {
        #[cfg(unix)]
        tokio::select! { _ = terminate.recv() => {}, _ = interrupt.recv() => {} }
        #[cfg(not(unix))]
        if tokio::signal::ctrl_c().await.is_err() {
            eprintln!("{}", serde_json::json!({"event":"gateway.signal-error"}));
        }
    };
    if let Some(application) = application {
        let mut application =
            Application::bind_with_chat(config, application, chat.map(|config| config.factory()))
                .await?;
        // The hub is mounted here, not by embedders, so `/ws` identity admission is
        // always the database-backed authority bound to this runtime's signing secret.
        let max_connections =
            NonZeroUsize::new(WS_MAX_CONNECTIONS).ok_or("WS_MAX_CONNECTIONS must be non-zero")?;
        application.mount_websocket(
            WsHubConfig::default(),
            max_connections,
            WS_AUTHORITY_TIMEOUT,
        )?;
        println!(
            "{}",
            serde_json::json!({
                "event":"gateway.ready", "address":application.local_addr()?.to_string(),
                "runtime":"rust", "migration":true, "websocket":"/ws",
                "application":if chat_enabled {"accounts-sessions-chat"}else{"accounts-sessions"}
            })
        );
        application.serve(shutdown).await?;
    } else {
        let gateway = Gateway::bind(config, HealthState::default()).await?;
        println!(
            "{}",
            serde_json::json!({"event":"gateway.ready", "address":gateway.local_addr()?.to_string(), "runtime":"rust", "migration":true})
        );
        gateway.serve(shutdown).await?;
    }
    println!("{}", serde_json::json!({"event":"gateway.stopped"}));
    Ok(())
}
