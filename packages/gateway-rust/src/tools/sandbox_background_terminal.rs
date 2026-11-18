//! Startup/completion policy for an already authorized sandbox execution.
//! The host owns process admission, output bounds, stop/reap and shutdown. This
//! adapter does not grant sandbox, filesystem, network or credential authority.
use crate::{
    contracts::bounded_json::Utf16Text,
    services::background_command_monitor::{
        BackgroundCommandMonitor, CancelTimer, Completion, ExternalOptions, OutputCallback,
        Schedule,
    },
    time::Clock,
    tools::core_io::HostError,
};
use futures_util::{FutureExt, future::BoxFuture};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::sync::{Arc, Mutex};
use tokio::sync::Notify;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SandboxOptions {
    #[serde(rename = "timeoutMs")]
    pub timeout_ms: f64,
    #[serde(flatten)]
    pub fields: Map<String, Value>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SandboxCompletion {
    pub ok: bool,
    pub output: Utf16Text,
    pub exit_code: Option<f64>,
    pub timed_out: bool,
    pub container_name: String,
}
/// Unregisters a host listener, including when the startup future is dropped.
pub struct Subscription(pub Option<Box<dyn FnOnce() + Send>>);
impl Drop for Subscription {
    fn drop(&mut self) {
        if let Some(remove) = self.0.take() {
            remove();
        }
    }
}
pub trait AbortSignal: Send + Sync {
    fn aborted(&self) -> bool;
    fn subscribe(&self, callback: Arc<dyn Fn() + Send + Sync>) -> Subscription;
}
pub trait SandboxExecution: Send + Sync {
    fn container_name(&self) -> String;
    fn output(&self) -> Utf16Text;
    fn on_output(&self, callback: OutputCallback) -> Result<Subscription, HostError>;
    fn completion(&self) -> BoxFuture<'static, Result<SandboxCompletion, HostError>>;
    /// Initiate a supervised stop synchronously. The future observes its outcome;
    /// dropping that observation must not cancel the host's stop/reap operation.
    fn stop(&self) -> BoxFuture<'static, Result<(), HostError>>;
}
pub trait SandboxManager: Send + Sync {
    fn start_background_command(
        &self,
        options: SandboxOptions,
    ) -> Result<Arc<dyn SandboxExecution>, HostError>;
}
pub struct Context {
    pub session_id: String,
    pub action_id: Option<String>,
    pub sandbox_container_name: Option<String>,
    pub signal: Option<Arc<dyn AbortSignal>>,
    pub on_output_chunk: Option<OutputCallback>,
}
#[derive(Clone, Copy)]
pub struct Wait {
    pub is_background: bool,
    pub yield_time_ms: f64,
}
impl Default for Wait {
    fn default() -> Self {
        Self {
            is_background: true,
            yield_time_ms: 5000.0,
        }
    }
}
#[derive(Debug, Serialize)]
pub struct ToolResult {
    pub ok: bool,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<Data>,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Data {
    pub sandbox: bool,
    pub container_name: String,
    pub thread_sandbox: bool,
    pub host_unaffected: bool,
    pub terminal_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub execution_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output: Option<Utf16Text>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cancelled: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ok: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub exit_code: Option<Option<f64>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timed_out: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_background: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub watched: Option<bool>,
}
struct StartupState {
    pending: bool,
    idle: Option<CancelTimer>,
}
struct StartupCleanup {
    state: Arc<Mutex<StartupState>>,
    timer: CancelTimer,
    output: Option<Subscription>,
}
impl Drop for StartupCleanup {
    fn drop(&mut self) {
        let mut s = self.state.lock().unwrap();
        s.pending = false;
        (self.timer)();
        if let Some(cancel) = s.idle.take() {
            cancel();
        }
        drop(s);
        self.output.take();
    }
}
fn aborted(signal: &Option<Arc<dyn AbortSignal>>) -> bool {
    signal.as_ref().is_some_and(|s| s.aborted())
}

pub struct SandboxBackgroundTerminal {
    pub monitor: BackgroundCommandMonitor,
    pub schedule: Schedule,
    pub clock: Clock,
    /// The runtime supplies its shared UUIDv7 generator.
    pub next_id: Arc<dyn Fn() -> String + Send + Sync>,
}
impl SandboxBackgroundTerminal {
    pub async fn run(
        &self,
        manager: &dyn SandboxManager,
        options: SandboxOptions,
        command: String,
        context: Context,
        wait: Wait,
    ) -> Result<ToolResult, HostError> {
        if aborted(&context.signal) {
            return Ok(ToolResult {
                ok: false,
                message: "Cancelled".into(),
                data: None,
            });
        }
        let started_at = (self.clock)() as f64;
        let timeout = options.timeout_ms.min(if wait.is_background {
            5000.0
        } else {
            wait.yield_time_ms
        });
        let execution = manager.start_background_command(options)?;
        let terminal_id = format!("sandbox-command-{}", (self.next_id)());
        let release = Arc::new(Notify::new());
        let notify = release.clone();
        let timer = (self.schedule)(
            timeout,
            Box::new(move || {
                notify.notify_one();
                Ok(())
            }),
        );
        let state = Arc::new(Mutex::new(StartupState {
            pending: true,
            idle: None,
        }));
        let mut cleanup = StartupCleanup {
            state: state.clone(),
            timer,
            output: None,
        };
        let abort_execution = execution.clone();
        let notify = release.clone();
        let on_abort: Arc<dyn Fn() + Send + Sync> = Arc::new(move || {
            drop(abort_execution.stop());
            notify.notify_one();
        });
        let abort_subscription = Arc::new(Mutex::new(
            context
                .signal
                .as_ref()
                .map(|s| s.subscribe(on_abort.clone())),
        ));
        if aborted(&context.signal) {
            on_abort();
        }
        let output_context = context.on_output_chunk.clone();
        let schedule = self.schedule.clone();
        let notify = release.clone();
        cleanup.output = Some(execution.on_output(Arc::new(move |chunk| {
            if !state.lock().unwrap().pending {
                return Ok(());
            }
            if let Some(output) = &output_context {
                output(chunk)?;
            }
            if wait.is_background {
                let mut s = state.lock().unwrap();
                if !s.pending {
                    return Ok(());
                }
                if let Some(cancel) = s.idle.take() {
                    cancel();
                }
                let notify = notify.clone();
                s.idle = Some(schedule(
                    500.0,
                    Box::new(move || {
                        notify.notify_one();
                        Ok(())
                    }),
                ));
            }
            Ok(())
        }))?);
        let completed = Arc::new(Mutex::new(None));
        let result_slot = completed.clone();
        let notify = release.clone();
        let completion = execution
            .completion()
            .map(move |result| {
                if let Ok(value) = &result {
                    *result_slot.lock().unwrap() = Some(value.clone());
                    abort_subscription.lock().unwrap().take();
                    notify.notify_one();
                }
                result
            })
            .boxed()
            .shared();
        tokio::select! {
            biased;
            _ = completion.clone() => { release.notified().await; }
            _ = release.notified() => {}
        }
        drop(cleanup);
        let mut data = Data {
            sandbox: true,
            container_name: execution.container_name(),
            thread_sandbox: context
                .sandbox_container_name
                .as_ref()
                .is_some_and(|s| !s.is_empty()),
            host_unaffected: true,
            terminal_id: terminal_id.clone(),
            execution_id: context.action_id.clone(),
            output: None,
            cancelled: None,
            ok: None,
            exit_code: None,
            timed_out: None,
            is_background: None,
            watched: None,
        };
        if aborted(&context.signal) {
            execution.stop().await?;
            data.output = Some(execution.output());
            data.cancelled = Some(true);
            return Ok(ToolResult {
                ok: false,
                message: "Cancelled".into(),
                data: Some(data),
            });
        }
        if let Some(result) = completed.lock().unwrap().take() {
            let message = if result.timed_out {
                "Sandbox command timed out".into()
            } else {
                format!(
                    "Sandbox command completed (exit code {})",
                    result.exit_code.map_or_else(
                        || "unavailable".to_owned(),
                        |v| ryu_js::Buffer::new().format(v).to_owned()
                    )
                )
            };
            data.container_name = result.container_name;
            data.output = Some(result.output);
            data.ok = Some(result.ok);
            data.exit_code = Some(result.exit_code);
            data.timed_out = Some(result.timed_out);
            data.is_background = Some(false);
            data.watched = Some(false);
            return Ok(ToolResult {
                ok: result.ok,
                message,
                data: Some(data),
            });
        }
        let output_execution = execution.clone();
        let stop_execution = execution.clone();
        let signal = context.signal.clone();
        let watched = self.monitor.track_external(
            ExternalOptions {
                session_id: context.session_id,
                terminal_id,
                execution_id: context.action_id,
                command,
                started_at,
                get_output: Some(Arc::new(move || output_execution.output())),
                should_notify: Some(Arc::new(move || !aborted(&signal))),
                on_cancel: Some(Arc::new(move || {
                    drop(stop_execution.stop());
                    Ok(())
                })),
            },
            Box::pin(async move {
                completion
                    .await
                    .map(|result| Completion {
                        exit_code: result.exit_code,
                        output: result.output,
                        timed_out: result.timed_out,
                    })
                    .map_err(|error| format!("{error:?}"))
            }),
        );
        if !watched {
            execution.stop().await?;
            return Ok(ToolResult {
                ok: false,
                message: "Background command limit reached; sandbox command stopped".into(),
                data: Some(data),
            });
        }
        data.output = Some(execution.output());
        data.exit_code = Some(None);
        data.timed_out = Some(false);
        data.is_background = Some(true);
        data.watched = Some(true);
        Ok(ToolResult{ok:true,message:"Sandbox command is running. Output is partial, not completion. Continue independent work; completion will resume you automatically. Use terminal.execution to inspect progress or cancel. Do not rerun the command.".into(),data:Some(data)})
    }
}
