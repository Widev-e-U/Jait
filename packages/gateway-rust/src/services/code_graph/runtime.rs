//! Pinned Graphify runtime provisioning over explicit argv/environment ports.
//! Callers authorize installation and supply a state root; no host state is found.
use super::engine::{ExecOutput, ExecRequest, Executor, GraphError, path_join};
use crate::{
    text::js_trim,
    time::{Clock, default_clock},
};
use futures_util::{
    FutureExt,
    future::{BoxFuture, Shared},
};
use serde::Serialize;
use serde_json::json;
use std::{
    collections::{BTreeMap, HashMap},
    sync::{Arc, LazyLock, Mutex},
};
use tokio::sync::oneshot;
pub const PACKAGE_NAME: &str = "graphifyy";
pub const PACKAGE_VERSION: &str = "0.9.30";
pub const MIN_PYTHON_VERSION: &str = "3.10";
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimePaths {
    pub runtime_dir: String,
    pub venv_dir: String,
    pub python_path: String,
    pub command_path: String,
    pub metadata_path: String,
}
pub fn runtime_paths(state_dir: &str, windows: bool) -> RuntimePaths {
    let runtime_dir = path_join(&[state_dir, "runtime", "graphify"]);
    let venv_dir = path_join(&[&runtime_dir, "venv"]);
    let bin = if windows { "Scripts" } else { "bin" };
    RuntimePaths {
        python_path: path_join(&[
            &venv_dir,
            bin,
            if windows { "python.exe" } else { "python" },
        ]),
        command_path: path_join(&[
            &venv_dir,
            bin,
            if windows { "graphify.exe" } else { "graphify" },
        ]),
        metadata_path: path_join(&[&runtime_dir, "runtime.json"]),
        runtime_dir,
        venv_dir,
    }
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeStatus {
    pub ready: bool,
    pub managed: bool,
    pub command: String,
    pub version: Option<String>,
    pub expected_version: String,
    pub error: Option<String>,
}
type Install = Shared<BoxFuture<'static, Result<RuntimeStatus, GraphError>>>;
#[derive(Clone, Default)]
pub struct InstallRegistry(Arc<Mutex<HashMap<String, Install>>>);
static INSTALLS: LazyLock<InstallRegistry> = LazyLock::new(InstallRegistry::default);
pub type Progress = Arc<dyn Fn(String) + Send + Sync>;
#[derive(Clone)]
pub struct GraphifyRuntime {
    pub state_dir: String,
    pub env: BTreeMap<String, String>,
    pub windows: bool,
    pub execute: Executor,
    pub clock: Clock,
    pub progress: Option<Progress>,
    pub installs: InstallRegistry,
}
impl GraphifyRuntime {
    pub fn new(state_dir: String, env: BTreeMap<String, String>, execute: Executor) -> Self {
        Self {
            state_dir,
            env,
            execute,
            windows: cfg!(windows),
            clock: default_clock(),
            progress: None,
            installs: INSTALLS.clone(),
        }
    }
    pub fn paths(&self) -> RuntimePaths {
        runtime_paths(&self.state_dir, self.windows)
    }
    pub fn command(&self) -> String {
        self.env
            .get("JAIT_GRAPHIFY_COMMAND")
            .map(|value| js_trim(value))
            .filter(|value| !value.is_empty())
            .map(str::to_owned)
            .unwrap_or_else(|| self.paths().command_path)
    }
    async fn run(&self, command: String, args: Vec<String>) -> Result<ExecOutput, GraphError> {
        (self.execute)(ExecRequest {
            command,
            args,
            cwd: None,
            env: self.env.clone(),
            signal: None,
        })
        .await
    }
    pub async fn inspect(&self) -> RuntimeStatus {
        let command = self.command();
        let managed = self
            .env
            .get("JAIT_GRAPHIFY_COMMAND")
            .is_none_or(|value| js_trim(value).is_empty());
        let (version, probe_error) = match self.run(command.clone(), vec!["--version".into()]).await
        {
            Ok(result) => {
                let output = if result.stdout.is_empty() {
                    result.stderr
                } else {
                    result.stdout
                };
                let output = js_trim(&output);
                if output.is_empty() {
                    (
                        None,
                        Some("Graphify returned no version information".into()),
                    )
                } else {
                    (Some(output.to_owned()), None)
                }
            }
            Err(error) => (None, Some(error.message)),
        };
        let ready = version
            .as_ref()
            .is_some_and(|value| !managed || includes_expected_version(value));
        let error = if ready {
            None
        } else if let Some(version) = &version {
            Some(format!(
                "Expected Graphify {PACKAGE_VERSION}, found {version}"
            ))
        } else {
            probe_error
        };
        RuntimeStatus {
            ready,
            managed,
            command,
            version,
            expected_version: PACKAGE_VERSION.into(),
            error,
        }
    }
    async fn python(&self) -> Result<(String, Vec<String>), GraphError> {
        let mut candidates = vec![];
        if let Some(command) = self
            .env
            .get("JAIT_GRAPHIFY_PYTHON")
            .map(|value| js_trim(value))
            .filter(|value| !value.is_empty())
        {
            candidates.push((command.to_owned(), vec![]));
        }
        if self.windows {
            candidates.push(("py".into(), vec!["-3".into()]));
        }
        candidates.push(("python3".into(), vec![]));
        candidates.push(("python".into(), vec![]));
        let mut failures = vec![];
        for (command, prefix) in candidates {
            let mut args = prefix.clone();
            args.push("--version".into());
            match self.run(command.clone(), args).await {
                Ok(result) => {
                    let output = format!("{}\n{}", result.stdout, result.stderr);
                    let output = js_trim(&output);
                    if supports_python(output) {
                        return Ok((command, prefix));
                    }
                    failures.push(format!(
                        "{command}: {}",
                        if output.is_empty() {
                            "unknown version"
                        } else {
                            output
                        }
                    ));
                }
                Err(_) => failures.push(format!("{command}: unavailable")),
            }
        }
        Err(GraphError::runtime(format!(
            "Graphify requires Python {MIN_PYTHON_VERSION} or newer. Install Python and restart Jait. Checked: {}",
            failures.join(", ")
        )))
    }
    async fn provision(&self) -> Result<RuntimeStatus, GraphError> {
        if let Some(command) = self
            .env
            .get("JAIT_GRAPHIFY_COMMAND")
            .map(|value| js_trim(value))
            .filter(|value| !value.is_empty())
        {
            let status = self.inspect().await;
            if !status.ready {
                return Err(GraphError::runtime(format!(
                    "JAIT_GRAPHIFY_COMMAND points to an unusable Graphify executable ({command}): {}",
                    status.error.as_deref().unwrap_or("version probe failed")
                )));
            }
            return Ok(status);
        }
        let existing = self.inspect().await;
        if existing.ready {
            return Ok(existing);
        }
        if let Some(progress) = &self.progress {
            progress(format!(
                "Installing required Graphify {PACKAGE_VERSION} runtime..."
            ));
        }
        let paths = self.paths();
        tokio::fs::create_dir_all(&paths.runtime_dir)
            .await
            .map_err(|error| GraphError::io(error, "mkdir", &paths.runtime_dir))?;
        let (command, mut args) = self.python().await?;
        args.extend(["-m".into(), "venv".into(), paths.venv_dir.clone()]);
        let install = async {
            self.run(command, args).await?;
            self.run(
                paths.python_path.clone(),
                vec![
                    "-m".into(),
                    "pip".into(),
                    "install".into(),
                    "--disable-pip-version-check".into(),
                    "--upgrade".into(),
                    format!("{PACKAGE_NAME}=={PACKAGE_VERSION}"),
                ],
            )
            .await?;
            Ok::<_, GraphError>(())
        }
        .await;
        if let Err(cause) = install {
            return Err(GraphError {
                cause: Some(Box::new(cause)),
                ..GraphError::runtime(format!(
                    "Jait could not install Graphify {PACKAGE_VERSION}. Ensure Python {MIN_PYTHON_VERSION}+ includes venv and pip, then run jait doctor."
                ))
            });
        }
        let status = self.inspect().await;
        if !status.ready {
            return Err(GraphError::runtime(format!(
                "Graphify installation completed but validation failed: {}",
                status.error.as_deref().unwrap_or("unknown error")
            )));
        }
        let installed_at = crate::time::iso((self.clock)()).map_err(GraphError::error)?;
        let metadata = json!({"package":PACKAGE_NAME,"version":PACKAGE_VERSION,"command":paths.command_path,"installedAt":installed_at});
        let text = serde_json::to_string_pretty(&metadata).unwrap() + "\n";
        tokio::fs::write(&paths.metadata_path, text)
            .await
            .map_err(|error| GraphError::io(error, "open", &paths.metadata_path))?;
        if let Some(progress) = &self.progress {
            progress(format!("Graphify {PACKAGE_VERSION} is ready."));
        }
        Ok(status)
    }
    /// One shared install per state-directory/command key. Spawned work survives a
    /// dropped waiter, as the reference promise does; all completions clear the key.
    pub async fn ensure(&self) -> Result<RuntimeStatus, GraphError> {
        let key = format!(
            "{}:{}",
            self.state_dir,
            self.env
                .get("JAIT_GRAPHIFY_COMMAND")
                .map(|value| js_trim(value))
                .unwrap_or("managed")
        );
        let install = {
            let mut active = self.installs.0.lock().unwrap();
            if let Some(install) = active.get(&key) {
                install.clone()
            } else {
                let (send, receive) = oneshot::channel();
                let future = async move {
                    receive.await.unwrap_or_else(|_| {
                        Err(GraphError::runtime("Graphify installation worker stopped"))
                    })
                }
                .boxed()
                .shared();
                active.insert(key.clone(), future.clone());
                let runtime = self.clone();
                tokio::spawn(async move {
                    let result = runtime.provision().await;
                    runtime.installs.0.lock().unwrap().remove(&key);
                    let _ = send.send(result);
                });
                future
            }
        };
        install.await
    }
    pub async fn files_exist(&self) -> bool {
        tokio::fs::metadata(self.paths().command_path).await.is_ok()
    }
}
pub fn includes_expected_version(value: &str) -> bool {
    static PATTERN: LazyLock<regex::Regex> =
        LazyLock::new(|| regex::Regex::new(r"(^|[^0-9])0\.9\.30([^0-9]|$)").unwrap());
    PATTERN.is_match(value)
}
pub fn supports_python(value: &str) -> bool {
    static PATTERN: LazyLock<regex::Regex> = LazyLock::new(|| {
        regex::Regex::new(r"(?i-u:python)[\x09-\x0d\x20\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+([0-9]+)\.([0-9]+)").unwrap()
    });
    PATTERN.captures(value).is_some_and(|capture| {
        let major = capture[1].parse::<f64>().unwrap_or(f64::INFINITY);
        let minor = capture[2].parse::<f64>().unwrap_or(f64::INFINITY);
        major > 3.0 || major == 3.0 && minor >= 10.0
    })
}
