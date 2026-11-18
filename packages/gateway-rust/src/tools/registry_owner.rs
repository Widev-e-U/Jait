//! Serial local registry owner. The caller must supervise `run` until it exits.
//! This primitive does not grant consent and is not mounted into chat.
use super::{
    registry::{AuditPort, RegistryError, RegistryResult, ToolRegistry},
    registry_authority::RegistryAuthority,
    validate::ToolInput,
};
use crate::{
    execution::process_runner::ProcessCancellation,
    security::consent_executor::{ToolDelegate, ToolExecutionContext, ToolResult},
};
use serde_json::Value;
use std::sync::Arc;
use tokio::sync::{OwnedSemaphorePermit, mpsc, oneshot};

const MAX_INPUT_BYTES: usize = 256 * 1024;
const MAX_NAME_BYTES: usize = 256;

struct Request {
    name: String,
    input: Value,
    context: ToolExecutionContext,
    parent: ProcessCancellation,
    reply: oneshot::Sender<Result<RegistryResult, RegistryError>>,
    _capacity: Arc<OwnedSemaphorePermit>,
}

#[derive(Clone)]
pub struct RegistryOwnerHandle {
    sender: mpsc::Sender<Request>,
    shutdown: ProcessCancellation,
}

struct CancelOnDrop(ProcessCancellation);
impl Drop for CancelOnDrop {
    fn drop(&mut self) {
        self.0.cancel();
    }
}

impl RegistryOwnerHandle {
    /// Fail immediately when the bounded mailbox is full or closed. The private
    /// effect cancellation is signalled if the caller drops its response future.
    pub async fn execute(
        &self,
        name: &str,
        input: &Value,
        context: &ToolExecutionContext,
        capacity: Arc<OwnedSemaphorePermit>,
    ) -> Result<Result<RegistryResult, RegistryError>, &'static str> {
        if self.shutdown.is_cancelled() || context.cancellation.is_cancelled() {
            return Err("registry unavailable or cancelled");
        }
        if name.len() > MAX_NAME_BYTES
            || serde_json::to_vec(input)
                .map_err(|_| "invalid input")?
                .len()
                > MAX_INPUT_BYTES
        {
            return Err("registry request too large");
        }
        let effect = ProcessCancellation::default();
        let guard = CancelOnDrop(effect.clone());
        let mut owned_context = context.clone();
        owned_context.cancellation = effect;
        let (reply, response) = oneshot::channel();
        self.sender
            .try_send(Request {
                name: name.to_owned(),
                input: input.clone(),
                context: owned_context,
                parent: context.cancellation.clone(),
                reply,
                _capacity: capacity,
            })
            .map_err(|_| "registry mailbox full or closed")?;
        let result = tokio::select! {
            biased;
            _ = context.cancellation.wait_cancelled() => return Err("registry request cancelled"),
            _ = self.shutdown.wait_cancelled() => return Err("registry owner shutting down"),
            result = response => result.map_err(|_| "registry owner stopped")?,
        };
        drop(guard);
        Ok(result)
    }

    /// Close admission and request cancellation; the supervisor must still await `run`.
    pub fn shutdown(&self) {
        self.shutdown.cancel();
    }
}

/// Internal bridge only; callers must supply server-authenticated context and supervise
/// the owner. Malformed result fields are rejected instead of granting success.
#[allow(dead_code, reason = "Staged migration code has no runtime caller yet")]
pub(crate) fn consent_delegate(handle: RegistryOwnerHandle) -> ToolDelegate {
    Arc::new(move |name, input, context, permit| {
        let handle = handle.clone();
        Box::pin(async move {
            let result = handle
                .execute(name, input, context, permit)
                .await
                .map_err(str::to_owned)?
                .map_err(|_| "registry execution failed".to_owned())?;
            convert_result(result)
        })
    })
}

// The consent executor currently exposes a boolean and a Rust String. Reject
// values it cannot preserve rather than silently changing the returned result.
// This is a compatibility restriction, so the bridge must remain unmounted
// until the executor and its clients can carry the original JSON and UTF-16.
#[allow(dead_code, reason = "Staged migration code has no runtime caller yet")]
fn convert_result(result: RegistryResult) -> Result<ToolResult, String> {
    let ok = result
        .ok
        .as_bool()
        .ok_or("invalid registry result status")?;
    let message =
        String::from_utf16(&result.message.0).map_err(|_| "invalid registry result message")?;
    Ok(ToolResult {
        ok,
        message,
        data: result.data,
    })
}

pub struct RegistryOwner {
    registry: ToolRegistry<RegistryAuthority>,
    audit: Option<AuditPort>,
    receiver: mpsc::Receiver<Request>,
    shutdown: ProcessCancellation,
}
impl RegistryOwner {
    pub fn new(
        registry: ToolRegistry<RegistryAuthority>,
        audit: Option<AuditPort>,
        capacity: std::num::NonZeroUsize,
    ) -> (Self, RegistryOwnerHandle) {
        let (sender, receiver) = mpsc::channel(capacity.get());
        let shutdown = ProcessCancellation::default();
        (
            Self {
                registry,
                audit,
                receiver,
                shutdown: shutdown.clone(),
            },
            RegistryOwnerHandle { sender, shutdown },
        )
    }

    /// Drive on a local executor and retain the task handle. Cancellation requests
    /// never drop an admitted registry future: its audit and cleanup must finish.
    pub async fn run(mut self) {
        loop {
            let request = tokio::select! {
                biased;
                _ = self.shutdown.wait_cancelled() => break,
                request = self.receiver.recv() => match request { Some(request) => request, None => break },
            };
            if request.parent.is_cancelled()
                || request.context.cancellation.is_cancelled()
                || self.shutdown.is_cancelled()
            {
                continue;
            }
            let mut input = ToolInput::new(&request.input);
            let context = RegistryAuthority::from_execution(&request.context);
            let future =
                self.registry
                    .execute(&request.name, &mut input, &context, self.audit.as_ref());
            tokio::pin!(future);
            let result = tokio::select! {
                biased;
                result = &mut future => result,
                _ = request.parent.wait_cancelled() => { request.context.cancellation.cancel(); future.await },
                _ = self.shutdown.wait_cancelled() => { request.context.cancellation.cancel(); future.await },
            };
            let _ = request.reply.send(result);
        }
        self.receiver.close();
        while self.receiver.try_recv().is_ok() {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::security::consent_executor::{ExecutionOrigin, RuntimeMode};
    use serde_json::json;
    use std::{cell::RefCell, num::NonZeroUsize, path::PathBuf, rc::Rc, sync::Arc};
    use tokio::sync::Notify;

    #[test]
    fn result_conversion_rejects_unrepresentable_values() {
        use crate::contracts::bounded_json::Utf16Text;
        let result = |ok, units| RegistryResult {
            ok,
            message: Utf16Text(units),
            data: None,
        };
        for status in [json!(null), json!(0), json!(1), json!("yes"), json!({})] {
            assert_eq!(
                convert_result(result(status, vec![])).unwrap_err(),
                "invalid registry result status"
            );
        }
        assert_eq!(
            convert_result(result(json!(true), vec![0xd800])).unwrap_err(),
            "invalid registry result message"
        );
        let converted =
            convert_result(result(json!(false), "hello 😀".encode_utf16().collect())).unwrap();
        assert!(!converted.ok);
        assert_eq!(converted.message, "hello 😀");
    }

    #[test]
    fn surrogate_transport_requires_more_than_json_value() {
        use crate::contracts::bounded_json::Utf16Text;
        let text = Utf16Text(vec![0xd800]);
        // Raw JSON can encode the original JavaScript code unit. Chat's Value
        // projections cannot represent it, so conversion must not be relaxed
        // until persistence, replay, and event delivery all preserve it.
        assert_eq!(serde_json::to_string(&text).unwrap(), "\"\\ud800\"");
        assert!(serde_json::to_value(&text).is_err());
    }

    fn context() -> ToolExecutionContext {
        ToolExecutionContext {
            user_id: "user".into(),
            session_id: "session".into(),
            action_id: "action".into(),
            project_root: PathBuf::from("/project"),
            origin: ExecutionOrigin::Agent,
            runtime_mode: RuntimeMode::Guarded,
            cancellation: ProcessCancellation::default(),
            on_output: None,
        }
    }

    #[tokio::test(flavor = "current_thread")]
    async fn dropped_caller_and_shutdown_wait_for_cleanup_and_audit() {
        tokio::task::LocalSet::new()
            .run_until(async {
                let started = Arc::new(Notify::new());
                let cancelled = Arc::new(Notify::new());
                let release = Arc::new(Notify::new());
                let events = Rc::new(RefCell::new(Vec::<String>::new()));
                let mut registry: ToolRegistry<RegistryAuthority> =
                    ToolRegistry::new(Rc::new(|| "id".into()));
                let (a, b, c) = (started.clone(), cancelled.clone(), release.clone());
                registry.register(
                    json!({"name":"example","parameters":{"type":"object","properties":{}}}),
                    Rc::new(move |_, _, ctx| {
                        let (a, b, c) = (a.clone(), b.clone(), c.clone());
                        Box::pin(async move {
                            a.notify_one();
                            ctx.capabilities
                                .execution()
                                .cancellation
                                .wait_cancelled()
                                .await;
                            b.notify_one();
                            c.notified().await;
                            Ok(RegistryResult {
                                ok: json!(true),
                                message: "done".into(),
                                data: None,
                            })
                        })
                    }),
                );
                let captured = events.clone();
                let audit: AuditPort = Rc::new(move |event| {
                    captured.borrow_mut().push(event.to_owned());
                    Ok(())
                });
                let (owner, handle) =
                    RegistryOwner::new(registry, Some(audit), NonZeroUsize::new(1).unwrap());
                let task = tokio::task::spawn_local(owner.run());
                let capacity = Arc::new(tokio::sync::Semaphore::new(1));
                let permit = Arc::new(capacity.clone().try_acquire_owned().unwrap());
                let caller_handle = handle.clone();
                let caller = tokio::task::spawn_local(async move {
                    caller_handle
                        .execute("example", &json!({}), &context(), permit)
                        .await
                });
                tokio::time::timeout(std::time::Duration::from_secs(2), started.notified())
                    .await
                    .expect("tool did not start");
                caller.abort();
                tokio::time::timeout(std::time::Duration::from_secs(2), cancelled.notified())
                    .await
                    .expect("effect did not receive cancellation");
                assert_eq!(
                    capacity.available_permits(),
                    0,
                    "capacity must cover cleanup"
                );
                handle.shutdown();
                tokio::task::yield_now().await;
                assert!(!task.is_finished(), "owner must wait for effect cleanup");
                assert_eq!(
                    events.borrow().len(),
                    1,
                    "result audit must wait for cleanup"
                );
                release.notify_one();
                tokio::time::timeout(std::time::Duration::from_secs(2), task)
                    .await
                    .expect("owner did not stop")
                    .unwrap();
                assert_eq!(
                    capacity.available_permits(),
                    1,
                    "capacity returns after audit"
                );
                assert_eq!(
                    events.borrow().len(),
                    2,
                    "result audit must be written after cleanup"
                );
                assert!(
                    handle
                        .execute(
                            "example",
                            &json!({}),
                            &context(),
                            Arc::new(capacity.clone().try_acquire_owned().unwrap())
                        )
                        .await
                        .is_err()
                );
            })
            .await;
    }
    #[tokio::test(flavor = "current_thread")]
    async fn consent_capacity_survives_dropped_caller_until_registry_audit() {
        use crate::security::{
            consent_executor::{
                ConsentAwareExecutor, ConsentExecutorOptions, ExecuteOptions, ToolTrust,
            },
            consent_manager::{ConsentManager, ConsentManagerOptions},
        };
        use futures_util::future::BoxFuture;
        use std::{collections::HashMap, num::NonZeroU16, time::Duration};
        struct Trust;
        impl ToolTrust for Trust {
            fn level<'a>(&'a self, _: &'a str) -> BoxFuture<'a, Result<f64, String>> {
                Box::pin(async { Ok(0.0) })
            }
            fn record_approval<'a>(&'a self, _: &'a str) -> BoxFuture<'a, Result<(), String>> {
                Box::pin(async { Ok(()) })
            }
        }
        tokio::task::LocalSet::new()
            .run_until(async {
                let started = Arc::new(Notify::new());
                let cancelled = Arc::new(Notify::new());
                let release = Arc::new(Notify::new());
                let events = Rc::new(RefCell::new(Vec::<String>::new()));
                let mut registry: ToolRegistry<RegistryAuthority> =
                    ToolRegistry::new(Rc::new(|| "id".into()));
                let (a, b, c) = (started.clone(), cancelled.clone(), release.clone());
                registry.register(
                    json!({"name":"example","parameters":{"type":"object","properties":{}}}),
                    Rc::new(move |_, _, ctx| {
                        let (a, b, c) = (a.clone(), b.clone(), c.clone());
                        Box::pin(async move {
                            a.notify_one();
                            ctx.capabilities
                                .execution()
                                .cancellation
                                .wait_cancelled()
                                .await;
                            b.notify_one();
                            c.notified().await;
                            Ok(RegistryResult {
                                ok: json!(true),
                                message: "done".into(),
                                data: None,
                            })
                        })
                    }),
                );
                let observed = events.clone();
                let audit: AuditPort = Rc::new(move |event| {
                    observed.borrow_mut().push(event.to_owned());
                    Ok(())
                });
                let (owner, handle) =
                    RegistryOwner::new(registry, Some(audit), NonZeroUsize::new(1).unwrap());
                let owner_task = tokio::task::spawn_local(owner.run());
                let executor = Arc::new(ConsentAwareExecutor::new(
                    ConsentExecutorOptions {
                        user_id: "user".into(),
                        session_id: "session".into(),
                        permissions: HashMap::new(),
                        session_approvals: Default::default(),
                        profile_name: None,
                        max_concurrent: NonZeroU16::new(1).unwrap(),
                    },
                    ConsentManager::new(ConsentManagerOptions::default()),
                    Arc::new(Trust),
                    consent_delegate(handle.clone()),
                ));
                let mut ctx = context();
                ctx.runtime_mode = RuntimeMode::FullAccess;
                let task_executor = executor.clone();
                let task_context = ctx.clone();
                let caller = tokio::task::spawn_local(async move {
                    task_executor
                        .execute(
                            "example",
                            &json!({}),
                            &task_context,
                            ExecuteOptions::default(),
                        )
                        .await
                });
                tokio::time::timeout(Duration::from_secs(2), started.notified())
                    .await
                    .expect("tool did not start");
                caller.abort();
                tokio::time::timeout(Duration::from_secs(2), cancelled.notified())
                    .await
                    .expect("cancellation was not delivered");
                assert_eq!(
                    executor
                        .execute("other", &json!({}), &ctx, ExecuteOptions::default())
                        .await
                        .unwrap_err(),
                    "tool execution capacity unavailable"
                );
                assert_eq!(events.borrow().len(), 1);
                release.notify_one();
                tokio::time::timeout(Duration::from_secs(2), async {
                    loop {
                        if events.borrow().len() == 2 {
                            match executor
                                .execute("other", &json!({}), &ctx, ExecuteOptions::default())
                                .await
                            {
                                Ok(result) => {
                                    assert!(!result.ok);
                                    break;
                                }
                                Err(error) => {
                                    assert_eq!(error, "tool execution capacity unavailable")
                                }
                            }
                        }
                        tokio::task::yield_now().await;
                    }
                })
                .await
                .expect("capacity did not return after audit");
                handle.shutdown();
                tokio::time::timeout(Duration::from_secs(2), owner_task)
                    .await
                    .unwrap()
                    .unwrap();
            })
            .await;
    }
    #[tokio::test(flavor = "current_thread")]
    async fn queued_cancelled_request_never_reaches_registry() {
        use std::time::Duration;
        tokio::task::LocalSet::new()
            .run_until(async {
                let started = Arc::new(Notify::new());
                let release = Arc::new(Notify::new());
                let calls = Rc::new(RefCell::new(0usize));
                let mut registry: ToolRegistry<RegistryAuthority> =
                    ToolRegistry::new(Rc::new(|| "id".into()));
                let (a, b, count) = (started.clone(), release.clone(), calls.clone());
                registry.register(
                    json!({"name":"example","parameters":{"type":"object","properties":{}}}),
                    Rc::new(move |_, _, _| {
                        *count.borrow_mut() += 1;
                        let (a, b) = (a.clone(), b.clone());
                        Box::pin(async move {
                            a.notify_one();
                            b.notified().await;
                            Ok(RegistryResult {
                                ok: json!(true),
                                message: "done".into(),
                                data: None,
                            })
                        })
                    }),
                );
                let (owner, handle) =
                    RegistryOwner::new(registry, None, NonZeroUsize::new(1).unwrap());
                let owner_task = tokio::task::spawn_local(owner.run());
                let permits = Arc::new(tokio::sync::Semaphore::new(2));
                let delegate = consent_delegate(handle.clone());
                let first_delegate = delegate.clone();
                let first_permit = Arc::new(permits.clone().try_acquire_owned().unwrap());
                let first = tokio::task::spawn_local(async move {
                    first_delegate("example", &json!({}), &context(), first_permit).await
                });
                tokio::time::timeout(Duration::from_secs(2), started.notified())
                    .await
                    .unwrap();
                let second_ctx = context();
                let cancellation = second_ctx.cancellation.clone();
                let second_delegate = delegate.clone();
                let second_permit = Arc::new(permits.clone().try_acquire_owned().unwrap());
                let second = tokio::task::spawn_local(async move {
                    second_delegate("example", &json!({}), &second_ctx, second_permit).await
                });
                tokio::time::timeout(Duration::from_secs(2), async {
                    while handle.sender.capacity() != 0 {
                        tokio::task::yield_now().await;
                    }
                })
                .await
                .unwrap();
                cancellation.cancel();
                assert!(
                    tokio::time::timeout(Duration::from_secs(2), second)
                        .await
                        .expect("queued cancellation did not return promptly")
                        .unwrap()
                        .is_err()
                );
                assert_eq!(
                    permits.available_permits(),
                    0,
                    "queued request retains capacity until drained"
                );
                assert_eq!(*calls.borrow(), 1);
                release.notify_one();
                assert!(
                    tokio::time::timeout(Duration::from_secs(2), first)
                        .await
                        .unwrap()
                        .unwrap()
                        .is_ok()
                );
                assert_eq!(*calls.borrow(), 1);
                assert_eq!(permits.available_permits(), 2);
                handle.shutdown();
                tokio::time::timeout(Duration::from_secs(2), owner_task)
                    .await
                    .unwrap()
                    .unwrap();
            })
            .await;
    }
    #[tokio::test(flavor = "current_thread")]
    async fn cancelled_pending_consent_cleans_up_without_registry_dispatch() {
        use crate::security::{
            consent_executor::{
                ConsentAwareExecutor, ConsentExecutorOptions, ExecuteOptions, ToolTrust,
            },
            consent_manager::{ConsentManager, ConsentManagerOptions},
        };
        use futures_util::future::BoxFuture;
        use std::{collections::HashMap, num::NonZeroU16, time::Duration};
        struct Trust;
        impl ToolTrust for Trust {
            fn level<'a>(&'a self, _: &'a str) -> BoxFuture<'a, Result<f64, String>> {
                Box::pin(async { Ok(0.0) })
            }
            fn record_approval<'a>(&'a self, _: &'a str) -> BoxFuture<'a, Result<(), String>> {
                Box::pin(async { Ok(()) })
            }
        }
        tokio::task::LocalSet::new()
            .run_until(async {
                let requested = Arc::new(Notify::new());
                let notice = requested.clone();
                let consent = ConsentManager::new(ConsentManagerOptions {
                    on_request: Some(Arc::new(move |_| {
                        notice.notify_one();
                        Ok(())
                    })),
                    ..ConsentManagerOptions::default()
                });
                let calls = Rc::new(RefCell::new(0usize));
                let observed = calls.clone();
                let mut registry: ToolRegistry<RegistryAuthority> =
                    ToolRegistry::new(Rc::new(|| "id".into()));
                registry.register(
                    json!({"name":"terminal.run","parameters":{"type":"object","properties":{}}}),
                    Rc::new(move |_, _, _| {
                        *observed.borrow_mut() += 1;
                        Box::pin(async {
                            Ok(RegistryResult {
                                ok: json!(true),
                                message: "done".into(),
                                data: None,
                            })
                        })
                    }),
                );
                let (owner, handle) =
                    RegistryOwner::new(registry, None, NonZeroUsize::new(1).unwrap());
                let owner_task = tokio::task::spawn_local(owner.run());
                let executor = Arc::new(ConsentAwareExecutor::new(
                    ConsentExecutorOptions {
                        user_id: "user".into(),
                        session_id: "session".into(),
                        permissions: HashMap::new(),
                        session_approvals: Default::default(),
                        profile_name: None,
                        max_concurrent: NonZeroU16::new(1).unwrap(),
                    },
                    consent.clone(),
                    Arc::new(Trust),
                    consent_delegate(handle.clone()),
                ));
                let ctx = context();
                let cancellation = ctx.cancellation.clone();
                let task_executor = executor.clone();
                let task = tokio::task::spawn_local(async move {
                    task_executor
                        .execute("terminal.run", &json!({}), &ctx, ExecuteOptions::default())
                        .await
                });
                tokio::time::timeout(Duration::from_secs(2), requested.notified())
                    .await
                    .expect("consent was not requested");
                let id = consent.list_pending(Some("session"))[0].snapshot().id;
                cancellation.cancel();
                assert!(
                    !tokio::time::timeout(Duration::from_secs(2), task)
                        .await
                        .unwrap()
                        .unwrap()
                        .unwrap()
                        .ok
                );
                tokio::time::timeout(Duration::from_secs(2), async {
                    while !consent.list_pending(Some("session")).is_empty() {
                        tokio::task::yield_now().await;
                    }
                })
                .await
                .unwrap();
                assert!(!consent.approve(&id, None, None).unwrap());
                tokio::time::timeout(Duration::from_secs(2), async {
                    loop {
                        match executor
                            .execute(
                                "terminal.run",
                                &json!({}),
                                &context(),
                                ExecuteOptions {
                                    dry_run: true,
                                    ..ExecuteOptions::default()
                                },
                            )
                            .await
                        {
                            Ok(_) => break,
                            Err(error) => assert_eq!(error, "tool execution capacity unavailable"),
                        }
                        tokio::task::yield_now().await;
                    }
                })
                .await
                .expect("capacity was not returned");
                assert_eq!(*calls.borrow(), 0);
                handle.shutdown();
                tokio::time::timeout(Duration::from_secs(2), owner_task)
                    .await
                    .unwrap()
                    .unwrap();
            })
            .await;
    }
    #[tokio::test(flavor = "current_thread")]
    async fn approved_pending_consent_dispatches_and_retains_capacity() {
        use crate::security::{
            consent_executor::{
                ConsentAwareExecutor, ConsentExecutorOptions, ExecuteOptions, ToolTrust,
            },
            consent_manager::{ConsentManager, ConsentManagerOptions},
        };
        use futures_util::future::BoxFuture;
        use std::{collections::HashMap, num::NonZeroU16, time::Duration};
        struct Trust;
        impl ToolTrust for Trust {
            fn level<'a>(&'a self, _: &'a str) -> BoxFuture<'a, Result<f64, String>> {
                Box::pin(async { Ok(0.0) })
            }
            fn record_approval<'a>(&'a self, _: &'a str) -> BoxFuture<'a, Result<(), String>> {
                Box::pin(async { Ok(()) })
            }
        }
        tokio::task::LocalSet::new()
            .run_until(async {
                let requested = Arc::new(Notify::new());
                let notice = requested.clone();
                let consent = ConsentManager::new(ConsentManagerOptions {
                    on_request: Some(Arc::new(move |_| {
                        notice.notify_one();
                        Ok(())
                    })),
                    ..ConsentManagerOptions::default()
                });
                let calls = Rc::new(RefCell::new(0usize));
                let observed = calls.clone();
                let started = Arc::new(Notify::new());
                let release = Arc::new(Notify::new());
                let (tool_started, tool_release) = (started.clone(), release.clone());
                let mut registry: ToolRegistry<RegistryAuthority> =
                    ToolRegistry::new(Rc::new(|| "id".into()));
                registry.register(
                    json!({"name":"terminal.run","parameters":{"type":"object","properties":{}}}),
                    Rc::new(move |_, _, _| {
                        *observed.borrow_mut() += 1;
                        let (started, release) = (tool_started.clone(), tool_release.clone());
                        Box::pin(async move {
                            started.notify_one();
                            release.notified().await;
                            Ok(RegistryResult {
                                ok: json!(true),
                                message: "done".into(),
                                data: None,
                            })
                        })
                    }),
                );
                let (owner, handle) =
                    RegistryOwner::new(registry, None, NonZeroUsize::new(1).unwrap());
                let owner_task = tokio::task::spawn_local(owner.run());
                let executor = Arc::new(ConsentAwareExecutor::new(
                    ConsentExecutorOptions {
                        user_id: "user".into(),
                        session_id: "session".into(),
                        permissions: HashMap::new(),
                        session_approvals: Default::default(),
                        profile_name: None,
                        max_concurrent: NonZeroU16::new(1).unwrap(),
                    },
                    consent.clone(),
                    Arc::new(Trust),
                    consent_delegate(handle.clone()),
                ));
                let ctx = context();
                let task_executor = executor.clone();
                let task = tokio::task::spawn_local(async move {
                    task_executor
                        .execute("terminal.run", &json!({}), &ctx, ExecuteOptions::default())
                        .await
                });
                tokio::time::timeout(Duration::from_secs(2), requested.notified())
                    .await
                    .expect("consent was not requested");
                let id = consent.list_pending(Some("session"))[0].snapshot().id;
                assert!(consent.approve(&id, None, None).unwrap());
                tokio::time::timeout(Duration::from_secs(2), started.notified())
                    .await
                    .expect("approved tool did not start");
                assert_eq!(*calls.borrow(), 1);
                assert_eq!(
                    executor
                        .execute(
                            "terminal.run",
                            &json!({}),
                            &context(),
                            ExecuteOptions::default()
                        )
                        .await
                        .unwrap_err(),
                    "tool execution capacity unavailable"
                );
                release.notify_one();
                let result = tokio::time::timeout(Duration::from_secs(2), task)
                    .await
                    .unwrap()
                    .unwrap()
                    .unwrap();
                assert!(result.ok);
                assert_eq!(result.message, "done");
                assert!(consent.list_pending(Some("session")).is_empty());
                assert_eq!(*calls.borrow(), 1);
                handle.shutdown();
                tokio::time::timeout(Duration::from_secs(2), owner_task)
                    .await
                    .unwrap()
                    .unwrap();
            })
            .await;
    }
    #[tokio::test(flavor = "current_thread")]
    async fn cancellation_wins_when_approval_and_cancellation_are_ready() {
        use crate::security::{
            consent_executor::{
                ConsentAwareExecutor, ConsentExecutorOptions, ExecuteOptions, ToolTrust,
            },
            consent_manager::{ConsentManager, ConsentManagerOptions},
        };
        use futures_util::future::BoxFuture;
        use std::{collections::HashMap, num::NonZeroU16, time::Duration};
        struct Trust;
        impl ToolTrust for Trust {
            fn level<'a>(&'a self, _: &'a str) -> BoxFuture<'a, Result<f64, String>> {
                Box::pin(async { Ok(0.0) })
            }
            fn record_approval<'a>(&'a self, _: &'a str) -> BoxFuture<'a, Result<(), String>> {
                Box::pin(async { Ok(()) })
            }
        }
        tokio::task::LocalSet::new()
            .run_until(async {
                let requested = Arc::new(Notify::new());
                let notice = requested.clone();
                let consent = ConsentManager::new(ConsentManagerOptions {
                    on_request: Some(Arc::new(move |_| {
                        notice.notify_one();
                        Ok(())
                    })),
                    ..ConsentManagerOptions::default()
                });
                let calls = Rc::new(RefCell::new(0usize));
                let observed = calls.clone();
                let started = Arc::new(Notify::new());
                let release = Arc::new(Notify::new());
                let (tool_started, tool_release) = (started.clone(), release.clone());
                let mut registry: ToolRegistry<RegistryAuthority> =
                    ToolRegistry::new(Rc::new(|| "id".into()));
                registry.register(
                    json!({"name":"terminal.run","parameters":{"type":"object","properties":{}}}),
                    Rc::new(move |_, _, _| {
                        *observed.borrow_mut() += 1;
                        let (started, release) = (tool_started.clone(), tool_release.clone());
                        Box::pin(async move {
                            started.notify_one();
                            release.notified().await;
                            Ok(RegistryResult {
                                ok: json!(true),
                                message: "done".into(),
                                data: None,
                            })
                        })
                    }),
                );
                let (owner, handle) =
                    RegistryOwner::new(registry, None, NonZeroUsize::new(1).unwrap());
                let owner_task = tokio::task::spawn_local(owner.run());
                let executor = Arc::new(ConsentAwareExecutor::new(
                    ConsentExecutorOptions {
                        user_id: "user".into(),
                        session_id: "session".into(),
                        permissions: HashMap::new(),
                        session_approvals: Default::default(),
                        profile_name: None,
                        max_concurrent: NonZeroU16::new(1).unwrap(),
                    },
                    consent.clone(),
                    Arc::new(Trust),
                    consent_delegate(handle.clone()),
                ));
                let ctx = context();
                let cancellation = ctx.cancellation.clone();
                let task_executor = executor.clone();
                let task = tokio::task::spawn_local(async move {
                    task_executor
                        .execute("terminal.run", &json!({}), &ctx, ExecuteOptions::default())
                        .await
                });
                tokio::time::timeout(Duration::from_secs(2), requested.notified())
                    .await
                    .expect("consent was not requested");
                let id = consent.list_pending(Some("session"))[0].snapshot().id;
                assert!(consent.approve(&id, None, None).unwrap());
                cancellation.cancel();
                let result = tokio::time::timeout(Duration::from_secs(2), task)
                    .await
                    .unwrap()
                    .unwrap()
                    .unwrap();
                assert!(!result.ok);
                assert_eq!(*calls.borrow(), 0);
                assert!(consent.list_pending(Some("session")).is_empty());
                let probe = executor
                    .execute(
                        "terminal.run",
                        &json!({}),
                        &context(),
                        ExecuteOptions {
                            dry_run: true,
                            ..ExecuteOptions::default()
                        },
                    )
                    .await;
                assert!(probe.is_ok(), "admission must be returned");
                handle.shutdown();
                tokio::time::timeout(Duration::from_secs(2), owner_task)
                    .await
                    .unwrap()
                    .unwrap();
            })
            .await;
    }
}
