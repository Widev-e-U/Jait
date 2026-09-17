//! Hosting controls are available only to the bundled main webview.
use crate::gateway_host::{GatewayConfig, GatewayHost, GatewayStatus};
use parking_lot::Mutex;
use std::sync::Arc;
use tauri::{AppHandle, Manager, State, WebviewWindow};

pub struct DesktopGateway(pub Arc<Mutex<GatewayHost>>);
fn trusted(window: &WebviewWindow) -> Result<(), String> {
    let url = window.url().map_err(|e| e.to_string())?;
    if window.label() == "main"
        && (url.scheme() == "tauri" || url.host_str() == Some("tauri.localhost"))
    {
        Ok(())
    } else {
        Err("Gateway hosting is available only in the bundled desktop app".into())
    }
}
#[tauri::command]
pub async fn desktop_gateway_status(
    window: WebviewWindow,
    host: State<'_, DesktopGateway>,
) -> Result<GatewayStatus, String> {
    trusted(&window)?;
    let host = host.0.clone();
    tauri::async_runtime::spawn_blocking(move || host.lock().status())
        .await
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub async fn desktop_gateway_configure(
    window: WebviewWindow,
    host: State<'_, DesktopGateway>,
    config: GatewayConfig,
) -> Result<GatewayStatus, String> {
    trusted(&window)?;
    let host = host.0.clone();
    tauri::async_runtime::spawn_blocking(move || host.lock().configure(config))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn desktop_gateway_restart_app(
    window: WebviewWindow,
    app: AppHandle,
) -> Result<(), String> {
    trusted(&window)?;
    stop(&app).await;
    app.restart();
}
pub async fn stop(app: &AppHandle) {
    if let Some(host) = app.try_state::<DesktopGateway>() {
        let host = host.0.clone();
        let _ = tauri::async_runtime::spawn_blocking(move || host.lock().stop()).await;
    }
}
