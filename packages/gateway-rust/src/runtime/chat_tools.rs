//! Read-only project tools for the settings chat.
//!
//! `file.read` runs on a registry owned by a dedicated thread (the registry is `Rc`-based) behind
//! `ConsentAwareExecutor`. Reads go through `ScopedFileRoot` (openat2 beneath the project root, no
//! symlinks), so the model cannot leave the project. Write, patch, terminal and other tools are not
//! mounted: they need an interactive consent surface that is not wired yet.
use super::chat_turn::TurnTool;
use crate::{
    contracts::bounded_json::Utf16Text,
    security::{
        consent_executor::{ConsentAwareExecutor, ConsentExecutorOptions, ToolDelegate, ToolTrust},
        consent_manager::ConsentManager,
        contracts::Risk,
        tool_permissions::{ConsentLevel, ToolPermission},
    },
    tools::{
        core_io::{HostError, HostPort},
        file_tools::{create_file_read_tool, metadata},
        registry::{RegistryContext, RegistryResult, ToolRegistry},
        registry_authority::RegistryAuthority,
        registry_owner::{RegistryOwner, consent_delegate},
    },
};
use futures_util::future::BoxFuture;
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    num::{NonZeroU16, NonZeroUsize},
    path::{Path, PathBuf},
    rc::Rc,
    sync::Arc,
};

struct NoTrust;
impl ToolTrust for NoTrust {
    fn level<'a>(&'a self, _: &'a str) -> BoxFuture<'a, Result<f64, String>> {
        Box::pin(async { Ok(0.0) })
    }
    fn record_approval<'a>(&'a self, _: &'a str) -> BoxFuture<'a, Result<(), String>> {
        Box::pin(async { Ok(()) })
    }
}

type Ctx = RegistryContext<RegistryAuthority>;

fn relative(root: &Path, requested: &str) -> Result<PathBuf, HostError> {
    let requested = Path::new(requested.trim());
    let relative = if requested.is_absolute() {
        requested
            .strip_prefix(root)
            .map_err(|_| HostError::Error("Path is outside the project".into()))?
    } else {
        requested
    };
    Ok(relative.to_path_buf())
}

fn host_port() -> HostPort<Ctx> {
    Arc::new(|op, args, ctx| {
        Box::pin(async move {
            match op {
                "resolve" => Ok(Value::Null),
                "read" => {
                    let root = ctx.capabilities.execution().project_root.clone();
                    let path = relative(&root, args["path"].as_str().unwrap_or_default())?;
                    tokio::task::spawn_blocking(move || {
                        let file = crate::security::scoped_file::ScopedFileRoot::open(&root)
                            .and_then(|r| r.read(&path))
                            .map_err(|e| HostError::Error(format!("Cannot read file: {e}")))?;
                        String::from_utf8(file)
                            .map(Value::String)
                            .map_err(|_| HostError::Error("File is not valid UTF-8".into()))
                    })
                    .await
                    .map_err(|_| HostError::Error("File read failed".into()))?
                }
                _ => Err(HostError::Error("Operation is not available".into())),
            }
        })
    })
}

/// Tool definitions offered to the model, and the consent executor that runs them.
pub fn read_only_tools(
    user_id: &str,
    session_id: &str,
) -> Result<(Vec<TurnTool>, Arc<ConsentAwareExecutor>), String> {
    let definition = metadata("read")
        .ok_or("file.read definition missing")?
        .clone();
    let turn_tool = TurnTool {
        name: definition["name"].as_str().unwrap_or("file.read").into(),
        description: definition["description"]
            .as_str()
            .unwrap_or_default()
            .into(),
        parameters: definition["parameters"].clone(),
    };
    let (handle_tx, handle_rx) = std::sync::mpsc::channel();
    std::thread::Builder::new()
        .name("jait-chat-tools".into())
        .spawn(move || {
            let runtime = match tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
            {
                Ok(runtime) => runtime,
                Err(_) => return,
            };
            let local = tokio::task::LocalSet::new();
            local.block_on(&runtime, async move {
                let tool = Rc::new(create_file_read_tool(host_port()));
                let mut registry: ToolRegistry<RegistryAuthority> =
                    ToolRegistry::new(Rc::new(|| uuid::Uuid::new_v4().to_string()));
                registry.register(
                    definition,
                    Rc::new(move |_definition, input, ctx| {
                        let tool = tool.clone();
                        let input = input.value();
                        Box::pin(async move {
                            let out = tool.execute(&input, ctx).await;
                            Ok(RegistryResult {
                                ok: json!(out["ok"].as_bool().unwrap_or(true)),
                                message: Utf16Text::from(
                                    out["message"].as_str().unwrap_or_default().to_owned(),
                                ),
                                data: out.get("data").cloned(),
                            })
                        })
                    }),
                );
                let (owner, handle) =
                    RegistryOwner::new(registry, None, NonZeroUsize::new(8).unwrap());
                let _ = handle_tx.send(handle);
                owner.run().await;
            });
        })
        .map_err(|e| e.to_string())?;
    let handle = handle_rx
        .recv()
        .map_err(|_| "tool registry failed to start")?;
    let delegate: ToolDelegate = consent_delegate(handle);
    let permission = ToolPermission {
        tool_name: "file.read".into(),
        consent_level: ConsentLevel::None,
        risk: Risk::Low,
        allowed_commands: None,
        denied_commands: None,
        allowed_paths: None,
        denied_paths: None,
        description: "Read-only access to files inside the project".into(),
    };
    let executor = ConsentAwareExecutor::new(
        ConsentExecutorOptions {
            user_id: user_id.into(),
            session_id: session_id.into(),
            permissions: HashMap::from([("file.read".to_owned(), permission)]),
            session_approvals: Default::default(),
            profile_name: None,
            max_concurrent: NonZeroU16::new(4).unwrap(),
        },
        ConsentManager::default(),
        Arc::new(NoTrust),
        delegate,
    );
    Ok((vec![turn_tool], Arc::new(executor)))
}
