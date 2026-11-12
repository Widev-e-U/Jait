//! Project file tools for the settings chat.
//!
//! `file.read` and `file.write` run on a registry owned by a dedicated thread (the registry is
//! `Rc`-based) behind `ConsentAwareExecutor`. Both go through `ScopedFileRoot` (openat2 beneath the
//! project root, no symlinks), so the model cannot leave the project. `file.read` needs no consent;
//! `file.write` replaces an existing file only and `terminal.run` runs a one-shot command in the
//! project root; both wait for approval on the shared `ConsentManager` (served at /api/consent).
//! `file.list` needs no consent; `file.patch` replaces the first match in an existing file and
//! waits for approval like `file.write`. Persistent-terminal tools are not mounted.
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
        core_jait::JaitPort,
        file_tools::{
            FileTool, create_file_list_tool, create_file_patch_tool, create_file_read_tool,
            create_file_write_tool, metadata,
        },
        registry::{ExecutePort, RegistryContext, RegistryResult, ToolRegistry},
        registry_authority::RegistryAuthority,
        registry_owner::{RegistryOwner, consent_delegate},
        terminal_tools::TerminalTools,
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
                "write" => {
                    let root = ctx.capabilities.execution().project_root.clone();
                    let path = relative(&root, args["path"].as_str().unwrap_or_default())?;
                    let content = args["content"].as_str().unwrap_or_default().to_owned();
                    tokio::task::spawn_blocking(move || {
                        crate::security::scoped_file::ScopedFileRoot::open(&root)
                            .and_then(|r| r.write_existing(&path, content.as_bytes()))
                            .map_err(|e| HostError::Error(format!("Cannot write file: {e}")))?;
                        Ok(Value::Null)
                    })
                    .await
                    .map_err(|_| HostError::Error("File write failed".into()))?
                }
                "list" => {
                    let root = ctx.capabilities.execution().project_root.clone();
                    let path = relative(&root, args["path"].as_str().unwrap_or_default())?;
                    tokio::task::spawn_blocking(move || {
                        let entries = crate::security::scoped_file::ScopedFileRoot::open(&root)
                            .and_then(|r| r.list_dir(&path))
                            .map_err(|e| HostError::Error(format!("Cannot list directory: {e}")))?;
                        Ok(Value::Array(
                            entries
                                .into_iter()
                                .map(|(name, dir)| json!({"name": name, "isDirectory": dir}))
                                .collect(),
                        ))
                    })
                    .await
                    .map_err(|_| HostError::Error("Directory listing failed".into()))?
                }
                "patch" => {
                    let root = ctx.capabilities.execution().project_root.clone();
                    let path = relative(&root, args["path"].as_str().unwrap_or_default())?;
                    let search = args["search"].as_str().unwrap_or_default().to_owned();
                    let replace = args["replace"].as_str().unwrap_or_default().to_owned();
                    tokio::task::spawn_blocking(move || {
                        let scoped = crate::security::scoped_file::ScopedFileRoot::open(&root)
                            .map_err(|e| HostError::Error(format!("Cannot patch file: {e}")))?;
                        let text = String::from_utf8(
                            scoped
                                .read(&path)
                                .map_err(|e| HostError::Error(format!("Cannot read file: {e}")))?,
                        )
                        .map_err(|_| HostError::Error("File is not valid UTF-8".into()))?;
                        if search.is_empty() || !text.contains(&search) {
                            return Ok(json!({"matched": false}));
                        }
                        scoped
                            .write_existing(&path, text.replacen(&search, &replace, 1).as_bytes())
                            .map_err(|e| HostError::Error(format!("Cannot write file: {e}")))?;
                        Ok(json!({"matched": true}))
                    })
                    .await
                    .map_err(|_| HostError::Error("File patch failed".into()))?
                }
                _ => Err(HostError::Error("Operation is not available".into())),
            }
        })
    })
}

/// One-shot `sh -c` in the project root: bounded output, hard timeout, killed on drop. There is
/// no persistent terminal behind the chat tool, so a command that outlives its timeout is killed.
fn terminal_port() -> JaitPort<Ctx> {
    Arc::new(|method, args, ctx| {
        Box::pin(async move {
            if method != "terminalRun" {
                return Err(HostError::Error("Operation is not available".into()));
            }
            let spec = args.first().cloned().unwrap_or(Value::Null);
            let command = spec["command"].as_str().unwrap_or_default().to_owned();
            if spec["sudo"].as_bool() == Some(true) || spec["background"].as_bool() == Some(true) {
                return Err(HostError::Error(
                    "sudo and background commands are not available in chat".into(),
                ));
            }
            let timeout = std::time::Duration::from_millis(
                spec["timeoutMs"].as_u64().unwrap_or(60_000).min(120_000),
            );
            let root = ctx.capabilities.execution().project_root.clone();
            let mut child = tokio::process::Command::new("sh");
            child
                .arg("-c")
                .arg(&command)
                .current_dir(&root)
                .stdin(std::process::Stdio::null())
                .kill_on_drop(true);
            let run = async {
                let out = child.output().await;
                out.map(|o| {
                    let mut text = String::from_utf8_lossy(&o.stdout).into_owned();
                    text.push_str(&String::from_utf8_lossy(&o.stderr));
                    (text, o.status.code())
                })
            };
            Ok(Some(match tokio::time::timeout(timeout, run).await {
                Ok(Ok((output, code))) => {
                    json!({"output": output, "exitCode": code, "timedOut": false})
                }
                Ok(Err(e)) => return Err(HostError::Error(format!("Cannot run command: {e}"))),
                Err(_) => {
                    json!({"error": format!("Command timed out after {}ms and was stopped", timeout.as_millis())})
                }
            }))
        })
    })
}

fn turn_tool(definition: &Value, fallback: &str) -> TurnTool {
    TurnTool {
        name: definition["name"].as_str().unwrap_or(fallback).into(),
        description: definition["description"]
            .as_str()
            .unwrap_or_default()
            .into(),
        parameters: definition["parameters"].clone(),
    }
}

fn execute_port(tool: Rc<FileTool<Ctx>>) -> ExecutePort<RegistryAuthority> {
    Rc::new(move |_definition, input, ctx| {
        let tool = tool.clone();
        let input = input.value();
        Box::pin(async move {
            let out = tool.execute(&input, ctx).await;
            Ok(RegistryResult {
                ok: json!(out["ok"].as_bool().unwrap_or(true)),
                message: Utf16Text::from(out["message"].as_str().unwrap_or_default().to_owned()),
                data: out.get("data").cloned(),
            })
        })
    })
}

/// Full definitions of the tools the gateway can execute today (the same set `project_tools` mounts).
pub fn project_tool_definitions() -> Result<Vec<Value>, String> {
    let read = metadata("read")
        .ok_or("file.read definition missing")?
        .clone();
    let write = metadata("write")
        .ok_or("file.write definition missing")?
        .clone();
    let terminal = TerminalTools::<Ctx>::metadata()
        .as_array()
        .and_then(|a| a.iter().find(|e| e["name"] == "terminal.run"))
        .ok_or("terminal.run definition missing")?
        .clone();
    let list = metadata("list")
        .ok_or("file.list definition missing")?
        .clone();
    let patch = metadata("patch")
        .ok_or("file.patch definition missing")?
        .clone();
    Ok(vec![read, write, terminal, list, patch])
}

/// Tool definitions offered to the model, and the consent executor that runs them.
pub fn project_tools(
    user_id: &str,
    session_id: &str,
    consent: ConsentManager,
) -> Result<(Vec<TurnTool>, Arc<ConsentAwareExecutor>), String> {
    project_tools_with_questions(user_id, session_id, consent, None)
}

pub fn project_tools_with_questions(
    user_id: &str,
    session_id: &str,
    consent: ConsentManager,
    questions: Option<crate::services::input_requests::UserQuestionService>,
) -> Result<(Vec<TurnTool>, Arc<ConsentAwareExecutor>), String> {
    let read_definition = metadata("read")
        .ok_or("file.read definition missing")?
        .clone();
    let write_definition = metadata("write")
        .ok_or("file.write definition missing")?
        .clone();
    let terminal_definition = TerminalTools::<Ctx>::metadata()
        .as_array()
        .and_then(|a| a.iter().find(|e| e["name"] == "terminal.run"))
        .ok_or("terminal.run definition missing")?
        .clone();
    let list_definition = metadata("list")
        .ok_or("file.list definition missing")?
        .clone();
    let patch_definition = metadata("patch")
        .ok_or("file.patch definition missing")?
        .clone();
    let mut turn_tools = vec![
        turn_tool(&read_definition, "file.read"),
        turn_tool(&write_definition, "file.write"),
        turn_tool(&terminal_definition, "terminal.run"),
        turn_tool(&list_definition, "file.list"),
        turn_tool(&patch_definition, "file.patch"),
    ];
    let question_context = crate::tools::user_ask::AskContext {
        session_id: session_id.to_owned(),
        user_id: Some(user_id.to_owned()),
        requested_by: None,
    };
    if questions.is_some() {
        turn_tools.push(turn_tool(crate::tools::user_ask::metadata(), "user.ask"));
    }
    let terminal_definition_for_registry = terminal_definition.clone();
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
                let mut registry: ToolRegistry<RegistryAuthority> =
                    ToolRegistry::new(Rc::new(|| uuid::Uuid::new_v4().to_string()));
                registry.register(
                    read_definition,
                    execute_port(Rc::new(create_file_read_tool(host_port()))),
                );
                registry.register(
                    write_definition,
                    execute_port(Rc::new(create_file_write_tool(host_port()))),
                );
                registry.register(
                    list_definition,
                    execute_port(Rc::new(create_file_list_tool(host_port()))),
                );
                registry.register(
                    patch_definition,
                    execute_port(Rc::new(create_file_patch_tool(host_port()))),
                );
                let terminal = Rc::new(TerminalTools::new(terminal_port()));
                registry.register(
                    terminal_definition_for_registry,
                    Rc::new(move |_definition, input, ctx| {
                        let terminal = terminal.clone();
                        let input = input.value();
                        Box::pin(async move {
                            let context = json!({});
                            let out = terminal.run(&input, &context, ctx).await;
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
                if let Some(questions) = questions {
                    registry.register(
                        crate::tools::user_ask::metadata().clone(),
                        Rc::new(move |_definition, input, _ctx| {
                            let questions = questions.clone();
                            let context = question_context.clone();
                            let input = input.value();
                            Box::pin(async move {
                                let out = match serde_json::from_value(input) {
                                    Ok(input) => {
                                        crate::tools::user_ask::execute(&questions, input, &context)
                                            .await
                                    }
                                    Err(_) => {
                                        json!({"ok": false, "message": "Invalid user.ask input"})
                                    }
                                };
                                Ok(RegistryResult {
                                    ok: json!(out["ok"].as_bool().unwrap_or(false)),
                                    message: Utf16Text::from(
                                        out["message"].as_str().unwrap_or_default().to_owned(),
                                    ),
                                    data: out.get("data").cloned(),
                                })
                            })
                        }),
                    );
                }
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
    let permission = |name: &str, consent_level, risk, description: &str| {
        (
            name.to_owned(),
            ToolPermission {
                tool_name: name.into(),
                consent_level,
                risk,
                allowed_commands: None,
                denied_commands: None,
                allowed_paths: None,
                denied_paths: None,
                description: description.into(),
            },
        )
    };
    let executor = ConsentAwareExecutor::new(
        ConsentExecutorOptions {
            user_id: user_id.into(),
            session_id: session_id.into(),
            permissions: HashMap::from([
                permission(
                    "user.ask",
                    ConsentLevel::None,
                    Risk::Low,
                    "Ask the user a question",
                ),
                permission(
                    "file.read",
                    ConsentLevel::None,
                    Risk::Low,
                    "Read-only access to files inside the project",
                ),
                permission(
                    "terminal.run",
                    ConsentLevel::Once,
                    Risk::High,
                    "Run a shell command in the project root",
                ),
                permission(
                    "file.list",
                    ConsentLevel::None,
                    Risk::Low,
                    "List a directory inside the project",
                ),
                permission(
                    "file.patch",
                    ConsentLevel::Once,
                    Risk::Medium,
                    "Replace the first match of a string in an existing project file",
                ),
                permission(
                    "file.write",
                    ConsentLevel::Once,
                    Risk::Medium,
                    "Replace the contents of an existing file inside the project",
                ),
            ]),
            session_approvals: Default::default(),
            profile_name: None,
            max_concurrent: NonZeroU16::new(4).unwrap(),
        },
        consent,
        Arc::new(NoTrust),
        delegate,
    );
    Ok((turn_tools, Arc::new(executor)))
}

#[cfg(test)]
mod question_integration_tests {
    use super::*;
    use crate::security::consent_executor::{
        ExecuteOptions, ExecutionOrigin, RuntimeMode, ToolExecutionContext,
    };

    #[tokio::test]
    async fn settings_dispatcher_shares_owner_scoped_question_service() {
        let questions = crate::services::input_requests::UserQuestionService::default();
        let (tools, executor) = project_tools_with_questions(
            "owner",
            "session",
            ConsentManager::default(),
            Some(questions.clone()),
        )
        .unwrap();
        assert!(tools.iter().any(|tool| tool.name == "user.ask"));
        let context = ToolExecutionContext {
            user_id: "owner".into(),
            session_id: "session".into(),
            action_id: "action".into(),
            project_root: PathBuf::from("/"),
            origin: ExecutionOrigin::Agent,
            runtime_mode: RuntimeMode::Guarded,
            cancellation: Default::default(),
            on_output: None,
        };
        let task = tokio::spawn(async move {
            executor
                .execute(
                    "user.ask",
                    &json!({"questions":[{"id":"q","header":"Question","question":"Proceed?"}]}),
                    &context,
                    ExecuteOptions::default(),
                )
                .await
                .unwrap()
        });
        let request = tokio::time::timeout(std::time::Duration::from_secs(5), async {
            loop {
                if let Some(request) = questions
                    .list_pending(Some("session"), Some("owner"))
                    .into_iter()
                    .next()
                {
                    break request;
                }
                tokio::time::sleep(std::time::Duration::from_millis(10)).await;
            }
        })
        .await
        .expect("dispatcher should create a question");
        assert!(
            questions
                .list_pending(Some("session"), Some("other"))
                .is_empty()
        );
        assert!(!questions.submit(&request.id, json!({"answers":{}}), Some("other")));
        assert!(questions.submit(
            &request.id,
            json!({"answers":{"q":{"selected":["yes"]}}}),
            Some("owner")
        ));
        let result = tokio::time::timeout(std::time::Duration::from_secs(5), task)
            .await
            .unwrap()
            .unwrap();
        assert!(result.ok, "{}", result.message);
        assert_eq!(result.data.unwrap()["answers"]["q"]["selected"][0], "yes");
    }
}
