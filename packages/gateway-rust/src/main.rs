use jait_gateway::runtime::application::{Application, ApplicationConfig};
use jait_gateway::{Gateway, config::GatewayConfig, health::HealthState};
use std::process::ExitCode;

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
        let application =
            Application::bind_with_chat(config, application, chat.map(|config| config.factory()))
                .await?;
        println!(
            "{}",
            serde_json::json!({
                "event":"gateway.ready", "address":application.local_addr()?.to_string(),
                "runtime":"rust", "migration":true, "application":if chat_enabled {"accounts-sessions-chat"}else{"accounts-sessions"}
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
