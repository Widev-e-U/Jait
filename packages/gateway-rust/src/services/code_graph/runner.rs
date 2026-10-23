//! Graphify extraction argv, version and output-path orchestration.
use super::{
    engine::{ErrorKind, ExecOutput, ExecRequest, Executor, GraphError, path_join},
    runtime::GraphifyRuntime,
};
use crate::{execution::process_runner::ProcessCancellation, text::js_trim};
use futures_util::future::BoxFuture;
use serde::Serialize;
use std::sync::Arc;
pub type EnsureRuntime = Arc<dyn Fn() -> BoxFuture<'static, Result<(), GraphError>> + Send + Sync>;
#[derive(Default)]
pub struct RunnerOptions {
    pub command: Option<String>,
    pub execute: Option<Executor>,
    pub ensure_runtime: Option<EnsureRuntime>,
}
#[derive(Clone)]
pub struct GraphifyRunner {
    pub command: String,
    pub execute: Executor,
    pub ensure_runtime: EnsureRuntime,
    pub runtime: GraphifyRuntime,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunResult {
    pub graph_path: String,
    pub version: Option<String>,
    pub stdout: String,
    pub stderr: String,
}
impl GraphifyRunner {
    pub fn new(runtime: GraphifyRuntime, options: RunnerOptions) -> Self {
        let command = options.command.clone().unwrap_or_else(|| runtime.command());
        let override_runtime = options
            .command
            .as_ref()
            .is_some_and(|command| !command.is_empty())
            || options.execute.is_some();
        let execute = options.execute.unwrap_or_else(|| {
            let execute = runtime.execute.clone();
            Arc::new(move |request| {
                let future = execute(request);
                Box::pin(async move {
                    future.await.map_err(|error| {
                        if error.code.as_ref().and_then(|code| code.as_str()) == Some("ENOENT") {
                            GraphError::unavailable()
                        } else {
                            error
                        }
                    })
                })
            })
        });
        let ensure_runtime = options.ensure_runtime.unwrap_or_else(|| {
            if override_runtime {
                Arc::new(|| Box::pin(async { Ok(()) }))
            } else {
                let runtime = runtime.clone();
                Arc::new(move || {
                    let runtime = runtime.clone();
                    Box::pin(async move { runtime.ensure().await.map(|_| ()) })
                })
            }
        });
        Self {
            command,
            execute,
            ensure_runtime,
            runtime,
        }
    }
    pub async fn version(&self, cwd: &str) -> Result<Option<String>, GraphError> {
        match (self.execute)(ExecRequest {
            command: self.command.clone(),
            args: vec!["--version".into()],
            cwd: Some(cwd.into()),
            env: self.runtime.env.clone(),
            signal: None,
        })
        .await
        {
            Ok(ExecOutput { stdout, stderr }) => {
                let output = if stdout.is_empty() { stderr } else { stdout };
                let output = js_trim(&output);
                Ok(if output.is_empty() {
                    None
                } else {
                    Some(output.into())
                })
            }
            Err(error) if error.kind == ErrorKind::Unavailable => Err(error),
            Err(_) => Ok(None),
        }
    }
    pub async fn build(
        &self,
        project_root: &str,
        output_dir: &str,
        signal: Option<ProcessCancellation>,
    ) -> Result<RunResult, GraphError> {
        (self.ensure_runtime)().await?;
        tokio::fs::create_dir_all(output_dir)
            .await
            .map_err(|error| GraphError::io(error, "mkdir", output_dir))?;
        let version = self.version(project_root).await?;
        let mut env = self.runtime.env.clone();
        env.insert("GRAPHIFY_QUERY_LOG_DISABLE".into(), "1".into());
        let result = (self.execute)(ExecRequest {
            command: self.command.clone(),
            args: vec![
                "extract".into(),
                project_root.into(),
                "--code-only".into(),
                "--out".into(),
                output_dir.into(),
            ],
            cwd: Some(project_root.into()),
            env,
            signal,
        })
        .await?;
        let path = path_join(&[output_dir, "graphify-out", "graph.json"]);
        let legacy = path_join(&[output_dir, "graph.json"]);
        let graph_path = if tokio::fs::metadata(&path).await.is_ok() {
            path
        } else if tokio::fs::metadata(&legacy).await.is_ok() {
            legacy
        } else {
            path
        };
        Ok(RunResult {
            graph_path,
            version,
            stdout: result.stdout,
            stderr: result.stderr,
        })
    }
}
