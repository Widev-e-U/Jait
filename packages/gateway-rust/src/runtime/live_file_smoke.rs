//! Opt-in, isolated end-to-end experiment, not a production tool registry.
//! Only the one disposable file and content approved for this test may be written.
use super::{
    application::{Application, ApplicationConfig},
    blocking::BlockingLane,
    chat_turn::{TurnConfig, TurnTool},
};
use crate::{
    config::GatewayConfig,
    providers::openai_stream::OpenAiHttp,
    routes::chat::{ChatFactory, PreparedChat},
    security::{
        consent_executor::{
            ConsentAwareExecutor, ConsentExecutorOptions, ToolDelegate, ToolExecutionContext,
            ToolResult, ToolTrust,
        },
        consent_manager::{ConsentManager, ConsentManagerOptions},
        http_auth::AuthUser,
        scoped_file::ScopedFileRoot,
    },
    services::sessions::SessionRecord,
    tools::{
        core_io::{HostError, HostPort},
        file_tools::create_file_write_tool,
    },
};
use futures_util::future::BoxFuture;
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    num::NonZeroU16,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::Duration,
};
const FILE: &str = "hello.txt";
const CONTENT: &str = "Hello from Rust gateway!\n";
struct LowTrust;
impl ToolTrust for LowTrust {
    fn level<'a>(&'a self, _: &'a str) -> BoxFuture<'a, Result<f64, String>> {
        Box::pin(async { Ok(0.0) })
    }
    fn record_approval<'a>(&'a self, _: &'a str) -> BoxFuture<'a, Result<(), String>> {
        Box::pin(async { Ok(()) })
    }
}
struct SmokeFactory {
    root: PathBuf,
    decisions: Arc<Mutex<Vec<String>>>,
}
impl ChatFactory for SmokeFactory {
    fn prepare(
        &self,
        user: AuthUser,
        session: SessionRecord,
    ) -> BoxFuture<'_, Result<PreparedChat, String>> {
        Box::pin(async move {
            let scope = Arc::new(ScopedFileRoot::open(&self.root).map_err(|e| e.to_string())?);
            let root = self.root.clone();
            let lane = BlockingLane::new(NonZeroU16::new(1).unwrap());
            let manager_slot = Arc::new(Mutex::new(None::<ConsentManager>));
            let slot = manager_slot.clone();
            let decisions = self.decisions.clone();
            let expected_session = session.id.clone();
            let manager = ConsentManager::new(ConsentManagerOptions {
                on_request: Some(Arc::new(move |request| {
                    let r = request.snapshot();
                    let allowed = r.session_id == expected_session
                        && r.tool_name == "file.write"
                        && r.preview.get("path") == Some(&json!(FILE))
                        && r.preview.get("content") == Some(&json!(CONTENT));
                    decisions
                        .lock()
                        .unwrap()
                        .push(if allowed { "approved" } else { "rejected" }.into());
                    let manager = slot.lock().unwrap();
                    if allowed {
                        manager.as_ref().unwrap().approve(
                            &r.id,
                            None,
                            Some("Preapproved disposable smoke file".into()),
                        )?;
                    } else {
                        manager.as_ref().unwrap().reject(
                            &r.id,
                            None,
                            Some("Outside smoke scope".into()),
                        )?;
                    }
                    Ok(())
                })),
                ..ConsentManagerOptions::default()
            });
            *manager_slot.lock().unwrap() = Some(manager.clone());
            let delegate: ToolDelegate = Arc::new(move |name, input, context, permit| {
                let lane = lane.clone();
                let scope = scope.clone();
                let root = root.clone();
                Box::pin(async move {
                    if name != "file.write"
                        || input.get("path") != Some(&json!(FILE))
                        || input.get("content") != Some(&json!(CONTENT))
                        || context.project_root != root
                        || context.cancellation.is_cancelled()
                    {
                        return Ok(ToolResult::message(
                            false,
                            "Outside the approved smoke-test scope",
                        ));
                    }
                    let cancellation = context.cancellation.clone();
                    let port: HostPort<ToolExecutionContext> =
                        Arc::new(move |method, input, _context| {
                            let lane = lane.clone();
                            let scope = scope.clone();
                            let cancellation = cancellation.clone();
                            let permit = permit.clone();
                            let valid = input.get("path") == Some(&json!(FILE));
                            let content = input
                                .get("content")
                                .and_then(Value::as_str)
                                .map(str::to_owned);
                            let method = method.to_owned();
                            Box::pin(async move {
                                if !valid || cancellation.is_cancelled() {
                                    return Err(HostError::Error("Scope rejected".into()));
                                }
                                if method == "resolve" {
                                    return Ok(Value::Null);
                                }
                                if method != "write" || content.as_deref() != Some(CONTENT) {
                                    return Err(HostError::Error("Scope rejected".into()));
                                }
                                lane.run(move || {
                                    let _permit = permit;
                                    if cancellation.is_cancelled() {
                                        return Err("Cancelled".to_string());
                                    }
                                    scope
                                        .write_existing(Path::new(FILE), CONTENT.as_bytes())
                                        .map_err(|e| e.to_string())
                                })
                                .await
                                .map_err(|e| HostError::Error(e.to_string()))?
                                .map_err(HostError::Error)?;
                                Ok(Value::Null)
                            })
                        });
                    let result = create_file_write_tool(port).execute(input, context).await;
                    Ok(ToolResult {
                        ok: result["ok"].as_bool().unwrap_or(false),
                        message: result["message"].as_str().unwrap_or("No result").to_owned(),
                        data: result.get("data").cloned(),
                    })
                })
            });
            let executor = ConsentAwareExecutor::new(
                ConsentExecutorOptions {
                    user_id: user.id,
                    session_id: session.id.clone(),
                    permissions: HashMap::new(),
                    session_approvals: Default::default(),
                    profile_name: None,
                    max_concurrent: NonZeroU16::new(1).unwrap(),
                },
                manager,
                Arc::new(LowTrust),
                delegate,
            );
            Ok(PreparedChat {
                config: TurnConfig {
                    model: "deepseek-v4.1-flash:cloud".into(),
                    tools: vec![TurnTool {
                        name: "file.write".into(),
                        description: "Write the approved disposable hello.txt file".into(),
                        parameters: json!({"type":"object","properties":{"path":{"type":"string"},"content":{"type":"string"}},"required":["path","content"],"additionalProperties":false}),
                    }],
                    max_rounds: 4,
                    max_tool_calls: 4,
                    max_history_bytes: 1024 * 1024,
                    max_tool_result_bytes: 4096,
                    timeout: Duration::from_secs(180),
                },
                provider: Arc::new(OpenAiHttp::configured(
                    "http://127.0.0.1:11434/v1",
                    "",
                    &session.id,
                )?),
                tools: Arc::new(executor),
            })
        })
    }
}
#[tokio::test]
#[ignore = "explicit live Ollama cloud smoke test; sends disposable prompt to provider"]
async fn live_ollama_file_edit() {
    let work = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../.jait/artifacts/gateway-rust/live-file-smoke")
        .join(uuid::Uuid::new_v4().to_string());
    std::fs::create_dir_all(&work).unwrap();
    let work = work.canonicalize().unwrap();
    std::fs::write(work.join(FILE), "before\n").unwrap();
    // Copy only the requested identity, never the existing password hash or settings.
    let source =
        std::env::var("JAIT_RUST_SMOKE_USER_DB").expect("explicit source database required");
    let source =
        rusqlite::Connection::open_with_flags(source, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)
            .unwrap();
    let owner_id: String = source
        .query_row("SELECT id FROM users WHERE username=?", ["jakob"], |row| {
            row.get(0)
        })
        .unwrap();
    drop(source);
    let password = uuid::Uuid::new_v4().to_string();
    let database = crate::db::open_database(&work.join("isolated.sqlite")).unwrap();
    crate::db::migrate_database(&database).unwrap();
    let hash = crate::services::users::hash_password(&password).unwrap();
    let now = chrono::Utc::now().to_rfc3339();
    database.execute("INSERT INTO users(id,username,password_hash,created_at,updated_at) VALUES(?1,'jakob',?2,?3,?3)", rusqlite::params![owner_id, hash, now]).unwrap();
    database.execute("INSERT INTO user_settings(user_id,theme,api_keys,stt_provider,chat_streaming_action,chat_provider,jait_backend,updated_at) VALUES(?1,'system','{}','whisper','steer','jait','openai',?2)", rusqlite::params![owner_id, now]).unwrap();
    drop(database);
    let decisions = Arc::new(Mutex::new(Vec::new()));
    let app = Application::bind_with_chat(
        GatewayConfig {
            address: "127.0.0.1:0".parse().unwrap(),
            allow_non_loopback: false,
        },
        ApplicationConfig {
            database_path: work.join("isolated.sqlite"),
            project_root: work.clone(),
            jwt_secret: uuid::Uuid::new_v4().to_string(),
            cors_origin: String::new(),
            web_root: None,
            health: None,
        },
        Some(Arc::new(SmokeFactory {
            root: work.clone(),
            decisions: decisions.clone(),
        })),
    )
    .await
    .unwrap();
    let base = format!("http://{}", app.local_addr().unwrap());
    let (stop, stopped) = tokio::sync::oneshot::channel();
    let server = tokio::spawn(async move {
        app.serve(async {
            let _ = stopped.await;
        })
        .await
    });
    let client = reqwest::Client::builder()
        .no_proxy()
        .timeout(Duration::from_secs(200))
        .build()
        .unwrap();
    let login: Value = client
        .post(format!("{base}/api/auth/login"))
        .json(&json!({"username":"jakob","password":password}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let token = login["access_token"].as_str().expect("login token");
    let session: Value = client
        .post(format!("{base}/api/sessions"))
        .bearer_auth(token)
        .json(&json!({"name":"isolated file edit"}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let id = session["id"].as_str().expect("session id");
    let response = client.post(format!("{base}/api/chat")).bearer_auth(token).json(&json!({"sessionId":id,"content":"Use the file.write tool now to replace hello.txt with exactly: Hello from Rust gateway! followed by a newline. Do not just describe the action."})).send().await.unwrap();
    assert!(
        response.status().is_success(),
        "chat status {}",
        response.status()
    );
    let stream = response.text().await.unwrap();
    assert!(stream.contains("\"tool\":\"file.write\""));
    assert!(stream.contains("\"ok\":true"));
    println!("Smoke directory: {}", work.display());
    assert_eq!(
        std::fs::read_to_string(work.join(FILE)).unwrap(),
        CONTENT,
        "file was not changed"
    );
    assert_eq!(*decisions.lock().unwrap(), vec!["approved"]);
    assert!(
        stream.contains("\"type\":\"done\""),
        "turn did not complete"
    );
    stop.send(()).unwrap();
    tokio::time::timeout(Duration::from_secs(10), server)
        .await
        .unwrap()
        .unwrap()
        .unwrap();
    let persisted = rusqlite::Connection::open(work.join("isolated.sqlite")).unwrap();
    let recorded: i64 = persisted.query_row("SELECT count(*) FROM session_events WHERE payload LIKE '%file.write%' AND payload LIKE '%Wrote hello.txt%'", [], |row| row.get(0)).unwrap();
    assert!(recorded > 0, "tool result was not persisted");
    println!("Authenticated copied user identity; file.write succeeded and was persisted");
}
