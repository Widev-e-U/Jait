//! OS sandbox selection and connection metadata over explicit manager/factory ports.
//! Resolving a driver grants no permission to execute it.
use super::contracts::{OsControlDriver, OsDriverBinding, OsDriverType};
use crate::{contracts::js_number, text::js_trim};
use futures_util::future::BoxFuture;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::Arc;
#[derive(Clone, Debug, PartialEq)]
pub enum ResolverError {
    Message(String),
    Thrown(Value),
}
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OsSandboxInfo {
    pub container_name: String,
    pub r#type: OsDriverType,
    pub running: bool,
    pub vnc_port: Option<f64>,
    pub novnc_port: Option<f64>,
    pub rdp_port: Option<f64>,
    pub web_viewer_port: Option<f64>,
    pub ssh_port: Option<f64>,
}
pub trait OsSandboxSource: Send + Sync {
    fn list_running_os_sandboxes(&self)
    -> BoxFuture<'_, Result<Vec<OsSandboxInfo>, ResolverError>>;
}
#[derive(Clone, Debug, Default, Deserialize)]
pub struct WindowsSshConfig {
    pub username: Option<String>,
    pub password: Option<String>,
}
#[derive(Clone, Debug, Serialize)]
#[serde(tag = "type")]
pub enum OsSandboxConnection {
    #[serde(rename = "linux-desktop")]
    LinuxDesktop {
        #[serde(rename = "containerName")]
        container_name: String,
        display: &'static str,
        #[serde(rename = "vncPort", with = "js_number")]
        vnc_port: f64,
        #[serde(rename = "novncPort", with = "js_number")]
        novnc_port: f64,
    },
    #[serde(rename = "windows")]
    Windows {
        #[serde(rename = "containerName")]
        container_name: String,
        #[serde(rename = "rdpPort", with = "js_number")]
        rdp_port: f64,
        #[serde(rename = "webViewerPort", with = "js_number")]
        web_viewer_port: f64,
        #[serde(rename = "sshPort", with = "js_number")]
        ssh_port: f64,
    },
}
pub trait OsDriverFactory<D: OsControlDriver>: Send + Sync {
    fn linux_desktop(
        &self,
        manager: Arc<dyn OsSandboxSource>,
        name: &str,
    ) -> Result<D, ResolverError>;
    fn windows(
        &self,
        name: &str,
        username: &str,
        password: Option<&str>,
    ) -> Result<D, ResolverError>;
}
pub struct OsControlResolver<D: OsControlDriver> {
    manager: Arc<dyn OsSandboxSource>,
    factory: Arc<dyn OsDriverFactory<D>>,
    windows_ssh: WindowsSshConfig,
}
impl<D: OsControlDriver> OsControlResolver<D> {
    pub fn new(
        manager: Arc<dyn OsSandboxSource>,
        factory: Arc<dyn OsDriverFactory<D>>,
        windows_ssh: WindowsSshConfig,
    ) -> Self {
        Self {
            manager,
            factory,
            windows_ssh,
        }
    }
    pub async fn list_sandboxes(&self) -> Result<Vec<OsSandboxConnection>, ResolverError> {
        let infos = self.manager.list_running_os_sandboxes().await?;
        Ok(infos
            .into_iter()
            .filter(|i| i.running)
            .map(|i| match i.r#type {
                OsDriverType::LinuxDesktop => OsSandboxConnection::LinuxDesktop {
                    container_name: i.container_name,
                    display: ":99",
                    vnc_port: i.vnc_port.unwrap_or(5900.0),
                    novnc_port: i.novnc_port.unwrap_or(6080.0),
                },
                OsDriverType::Windows => OsSandboxConnection::Windows {
                    container_name: i.container_name,
                    rdp_port: i.rdp_port.unwrap_or(3389.0),
                    web_viewer_port: i.web_viewer_port.unwrap_or(8006.0),
                    ssh_port: i.ssh_port.unwrap_or(2222.0),
                },
            })
            .collect())
    }
    pub async fn resolve(
        &self,
        container_name: Option<&str>,
    ) -> Result<OsDriverBinding<D>, ResolverError> {
        let infos = self.manager.list_running_os_sandboxes().await?;
        let target = if let Some(name) = container_name.filter(|s| !js_trim(s).is_empty()) {
            let target=infos.iter().find(|i|i.container_name==js_trim(name))
    .ok_or_else(||ResolverError::Message(format!("No OS sandbox named \"{name}\" was found. Start one first (see os.sandbox list) and try again.")))?;
            if !target.running {
                return Err(ResolverError::Message(format!(
                    "OS sandbox \"{name}\" is not running. Start it first."
                )));
            }
            target
        } else {
            infos.iter().rev().find(|i|i.running).ok_or_else(||ResolverError::Message("No OS sandbox is running. Start a Linux desktop or Windows sandbox first, or pass a containerName.".into()))?
        };
        let driver = match target.r#type {
            OsDriverType::LinuxDesktop => self
                .factory
                .linux_desktop(self.manager.clone(), &target.container_name)?,
            OsDriverType::Windows => self.factory.windows(
                &target.container_name,
                self.windows_ssh.username.as_deref().unwrap_or("docker"),
                self.windows_ssh.password.as_deref(),
            )?,
        };
        Ok(OsDriverBinding {
            driver,
            container_name: target.container_name.clone(),
            r#type: target.r#type,
        })
    }
}
