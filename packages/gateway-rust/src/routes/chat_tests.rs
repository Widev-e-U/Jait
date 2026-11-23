use super::*;
use crate::{
    db,
    providers::openai_stream::{ParsedStream, SseDecoder, StreamFailure},
    runtime::chat_turn::TurnEvent,
    security::{consent_executor::ToolResult, http_auth::sign_auth_token},
};
use futures_util::future::BoxFuture;
use tokio::sync::oneshot;

struct NoTools;
impl TurnTools for NoTools {
    fn execute<'a>(
        &'a self,
        _: &'a str,
        _: &'a Value,
        _: &'a ToolExecutionContext,
    ) -> BoxFuture<'a, Result<ToolResult, String>> {
        panic!("no tools advertised")
    }
}
struct TestProvider {
    pause: AtomicBool,
    started: AtomicBool,
    burst: usize,
    retain: AtomicBool,
    retained: Mutex<Option<EventSink>>,
}
impl TurnProvider for TestProvider {
    fn stream<'a>(
        &'a self,
        _: Value,
        _: &'a ProcessCancellation,
        sink: EventSink,
    ) -> BoxFuture<'a, Result<ParsedStream, StreamFailure>> {
        Box::pin(async move {
            self.started.store(true, Ordering::SeqCst);
            if self.retain.load(Ordering::SeqCst) {
                *self.retained.lock().unwrap() = Some(sink.clone());
            }
            sink(json!({"type":"thinking","content":"reason"}))
                .await
                .map_err(StreamFailure::Other)?;
            let mut content = String::new();
            for _ in 0..self.burst {
                let text = "response fragment ";
                content.push_str(text);
                sink(json!({"type":"token","content":text}))
                    .await
                    .map_err(StreamFailure::Other)?;
            }
            if self.pause.load(Ordering::SeqCst) {
                return std::future::pending().await;
            }
            Ok(ParsedStream {
                content_text: content,
                thinking_text: "reason".into(),
                finish_reason: Some("stop".into()),
                ..ParsedStream::default()
            })
        })
    }
}
struct TestFactory {
    provider: Arc<TestProvider>,
    calls: AtomicUsize,
    selections: Mutex<Vec<super::TurnSelection>>,
}
impl ChatFactory for TestFactory {
    fn prepare(
        &self,
        user: AuthUser,
        session: SessionRecord,
        selection: super::TurnSelection,
    ) -> BoxFuture<'_, Result<PreparedChat, super::PrepareError>> {
        assert_eq!(user.id, "owner");
        assert_eq!(session.user_id.as_deref(), Some("owner"));
        self.calls.fetch_add(1, Ordering::SeqCst);
        self.selections.lock().unwrap().push(selection.clone());
        // Like the settings factory, a choice this fixture cannot honor is refused, not replaced.
        if selection.provider.is_some() {
            return Box::pin(async {
                Err(super::PrepareError::refused(400, "PROVIDER_NOT_CONFIGURED"))
            });
        }
        if selection
            .model
            .as_deref()
            .is_some_and(|model| model != "configured-model")
        {
            return Box::pin(async {
                Err(super::PrepareError::refused(400, "MODEL_NOT_CONFIGURED"))
            });
        }
        Box::pin(async {
            Ok(PreparedChat {
                config: TurnConfig {
                    model: "configured-model".into(),
                    tools: vec![],
                    max_rounds: 3,
                    max_tool_calls: 3,
                    max_history_bytes: 128 * 1024,
                    max_tool_result_bytes: 4096,
                    timeout: Duration::from_secs(20),
                },
                provider: self.provider.clone(),
                tools: Arc::new(NoTools),
            })
        })
    }
}
struct Fixture {
    auth: AuthState,
    routes: ChatRoutes,
    factory: Arc<TestFactory>,
    client: reqwest::Client,
    url: String,
    token: String,
    shutdown: oneshot::Sender<()>,
    server: tokio::task::JoinHandle<Result<(), std::io::Error>>,
}
impl Fixture {
    async fn new(pause: bool, burst: usize, limits: ChatLimits) -> Self {
        Self::with_stop_hook(pause, burst, limits, None).await
    }
    async fn with_stop_hook(
        pause: bool,
        burst: usize,
        limits: ChatLimits,
        stop: Option<crate::routes::agent_control::StopAgents>,
    ) -> Self {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../.jait/artifacts/gateway-rust/chat-http")
            .join(uuid::Uuid::new_v4().to_string());
        std::fs::create_dir_all(&root).unwrap();
        let db = db::open_database(&root.join("http.sqlite")).unwrap();
        db::migrate_database(&db).unwrap();
        db.execute("INSERT INTO users(id,username,password_hash,created_at,updated_at) VALUES('owner','owner','unused','now','now')",[]).unwrap();
        for (id, owner, status) in [
            ("session", "owner", "active"),
            ("foreign", "other", "active"),
            ("archived", "owner", "archived"),
        ] {
            db.execute("INSERT INTO sessions(id,user_id,created_at,last_active_at,status) VALUES(?,?, 'now','now',?)",rusqlite::params![id,owner,status]).unwrap();
        }
        let auth = AuthState::new(db, "fixture-key".into()).unwrap();
        let factory = Arc::new(TestFactory {
            provider: Arc::new(TestProvider {
                pause: AtomicBool::new(pause),
                started: AtomicBool::new(false),
                burst,
                retain: AtomicBool::new(false),
                retained: Mutex::new(None),
            }),
            calls: AtomicUsize::new(0),
            selections: Mutex::new(Vec::new()),
        });
        let routes = ChatRoutes::new(
            auth.clone(),
            factory.clone(),
            SessionTurnManager::new(NonZeroU16::new(4).unwrap()),
            root,
        )
        .unwrap()
        .with_limits(limits)
        .unwrap();
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let (tx, rx) = oneshot::channel();
        let mut control = crate::routes::agent_control::AgentControlRoutes::new(auth.clone());
        let halt_chat = routes.clone();
        control.on_halt_persisted = Arc::new(move |owner| halt_chat.cancel_owner_threads(owner));
        if let Some(stop) = stop {
            control.stop_running = stop;
        }
        let router = routes.router().merge(control.router());
        let server = tokio::spawn(async move {
            axum::serve(listener, router)
                .with_graceful_shutdown(async {
                    let _ = rx.await;
                })
                .await
        });
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(10))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .unwrap();
        let token = sign_auth_token(
            &AuthUser {
                id: "owner".into(),
                username: "owner".into(),
            },
            "fixture-key",
        )
        .unwrap();
        Self {
            auth,
            routes,
            factory,
            client,
            url: format!("http://{address}"),
            token,
            shutdown: tx,
            server,
        }
    }
    fn post(&self, path: &str) -> reqwest::RequestBuilder {
        self.client
            .post(format!("{}{path}", self.url))
            .bearer_auth(&self.token)
    }
    fn get(&self, path: &str) -> reqwest::RequestBuilder {
        self.client
            .get(format!("{}{path}", self.url))
            .bearer_auth(&self.token)
    }
    async fn events(&self) -> Vec<TurnEvent> {
        SqliteTurnStore::new(self.auth.clone(), "owner".into(), "session".into())
            .unwrap()
            .load()
            .await
            .unwrap()
    }
    async fn finish(self) {
        self.routes.shutdown().await.unwrap();
        let _ = self.shutdown.send(());
        tokio::time::timeout(Duration::from_secs(2), self.server)
            .await
            .unwrap()
            .unwrap()
            .unwrap();
        self.auth.shutdown().await.unwrap();
    }
}
fn frames(body: &str) -> Vec<Value> {
    body.split("\n\n")
        .filter_map(|frame| frame.strip_prefix("data: "))
        .map(|json| serde_json::from_str(json).unwrap())
        .collect()
}
#[tokio::test]
async fn authentication_origin_and_active_ownership_gate_factory_and_execution() {
    let fixture = Fixture::new(false, 1, ChatLimits::default()).await;
    assert_eq!(
        fixture
            .client
            .post(format!("{}/api/chat", fixture.url))
            .json(&json!({"sessionId":"session","content":"hi"}))
            .send()
            .await
            .unwrap()
            .status(),
        401
    );
    assert_eq!(
        fixture
            .client
            .post(format!("{}/api/chat", fixture.url))
            .header(header::COOKIE, format!("jait_token={}", fixture.token))
            .header(header::ORIGIN, "https://untrusted.invalid")
            .json(&json!({"sessionId":"session","content":"hi"}))
            .send()
            .await
            .unwrap()
            .status(),
        403
    );
    let missing = sign_auth_token(
        &AuthUser {
            id: "deleted-user".into(),
            username: "deleted".into(),
        },
        "fixture-key",
    )
    .unwrap();
    assert_eq!(
        fixture
            .client
            .post(format!("{}/api/chat", fixture.url))
            .bearer_auth(missing)
            .json(&json!({"sessionId":"session","content":"hi"}))
            .send()
            .await
            .unwrap()
            .status(),
        401
    );
    for session in ["foreign", "archived", "unknown"] {
        assert_eq!(
            fixture
                .post("/api/chat")
                .json(&json!({"sessionId":session,"content":"hi"}))
                .send()
                .await
                .unwrap()
                .status(),
            404
        );
    }
    assert_eq!(fixture.factory.calls.load(Ordering::SeqCst), 0);
    assert!(fixture.events().await.is_empty());
    fixture.finish().await;
}
#[tokio::test]
async fn sse_frames_persist_and_messages_endpoint_projects_completed_turn() {
    let fixture = Fixture::new(false, 2, ChatLimits::default()).await;
    let response = fixture
        .post("/api/chat")
        .json(&json!({"session_id":"session","message":"hi"}))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    assert_eq!(
        response.headers()[header::CONTENT_TYPE],
        "text/event-stream"
    );
    let body = response.text().await.unwrap();
    let frames = frames(&body);
    assert_eq!(frames[0]["type"], "thinking");
    assert_eq!(frames[1]["type"], "token");
    assert_eq!(frames.last().unwrap()["type"], "done");
    assert_eq!(frames.last().unwrap()["session_id"], "session");
    let events = fixture.events().await;
    assert_eq!(events.len(), 2);
    assert!(
        matches!(&events[1],TurnEvent::Assistant{content,thinking,..}if content=="response fragment response fragment "&&thinking=="reason")
    );
    let projection = fixture
        .get("/api/sessions/session/messages?limit=5")
        .send()
        .await
        .unwrap();
    assert_eq!(projection.status(), 200);
    let projection: Value = projection.json().await.unwrap();
    assert_eq!(projection["streaming"], false);
    assert_eq!(projection["messages"].as_array().unwrap().len(), 2);
    fixture.finish().await;
}
#[tokio::test]
async fn web_chat_payload_and_legacy_aliases_preserve_content() {
    let fixture = Fixture::new(false, 1, ChatLimits::default()).await;
    for (payload, expected) in [
        (
            json!({"sessionId":"session","content":"web message"}),
            "web message",
        ),
        (
            json!({"session_id":"session","message":"legacy message"}),
            "legacy message",
        ),
    ] {
        let response = fixture
            .post("/api/chat")
            .json(&payload)
            .send()
            .await
            .unwrap();
        assert_eq!(response.status(), 200);
        assert_eq!(
            frames(&response.text().await.unwrap()).last().unwrap()["type"],
            "done"
        );
        assert!(
            fixture.events().await.iter().any(
                |event| matches!(event, TurnEvent::User { content, .. } if content == expected)
            )
        );
    }
    fixture.finish().await;
}

#[tokio::test]
async fn web_options_are_explicitly_rejected_before_preparation() {
    let fixture = Fixture::new(false, 1, ChatLimits::default()).await;
    for (option, value) in [
        ("personaAgentId", json!("agent")),
        ("attachments", json!([])),
        ("_queuedDrain", json!(true)),
        ("_queuedMessageId", json!("queue")),
        ("_systemNotification", json!("notice")),
        ("_systemNotice", json!("notice")),
        ("_recoveryAttempts", json!(1)),
        ("_loopRevision", json!(1)),
    ] {
        let mut payload = json!({"sessionId":"session","content":"hi"});
        payload[option] = value;
        let response = fixture
            .post("/api/chat")
            .json(&payload)
            .send()
            .await
            .unwrap();
        assert_eq!(response.status(), 400, "{option}");
        let body: Value = response.json().await.unwrap();
        assert_eq!(
            body,
            json!({"error":"UNSUPPORTED_CHAT_OPTION","option":option})
        );
    }
    let response = fixture
        .post("/api/chat")
        .json(&json!({"sessionId":"session","content":"hi","unexpected":true}))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 400);
    assert_eq!(
        response.json::<Value>().await.unwrap()["error"],
        "INVALID_CHAT_REQUEST"
    );
    assert_eq!(fixture.factory.calls.load(Ordering::SeqCst), 0);
    assert!(fixture.events().await.is_empty());
    fixture.finish().await;
}

#[tokio::test]
async fn web_options_are_validated_before_preparation() {
    let fixture = Fixture::new(false, 1, ChatLimits::default()).await;
    // Malformed values and postures the native turn does not run are refused by the route itself.
    for (option, value, expected) in [
        (
            "mode",
            json!("ask"),
            json!({"error":"UNSUPPORTED_CHAT_OPTION","option":"mode"}),
        ),
        (
            "runtimeMode",
            json!("full-access"),
            json!({"error":"RUNTIME_MODE_UNSUPPORTED","runtimeMode":"full-access"}),
        ),
        (
            "runtimeMode",
            json!("guarded"),
            json!({"error":"INVALID_CHAT_REQUEST"}),
        ),
        (
            "runtimeMode",
            json!(1),
            json!({"error":"INVALID_CHAT_REQUEST"}),
        ),
        (
            "responseStyle",
            json!("concise"),
            json!({"error":"INVALID_CHAT_REQUEST"}),
        ),
        (
            "reasoningEffort",
            json!("high power"),
            json!({"error":"INVALID_CHAT_REQUEST"}),
        ),
        (
            "reasoningEffort",
            json!(3),
            json!({"error":"INVALID_CHAT_REQUEST"}),
        ),
        ("model", json!(7), json!({"error":"INVALID_CHAT_REQUEST"})),
        (
            "provider",
            json!(false),
            json!({"error":"INVALID_CHAT_REQUEST"}),
        ),
        (
            "displaySegments",
            json!({"type":"text"}),
            json!({"error":"INVALID_CHAT_REQUEST"}),
        ),
        (
            "displaySegments",
            json!([{"text":"no type"}]),
            json!({"error":"INVALID_CHAT_REQUEST"}),
        ),
    ] {
        let mut payload = json!({"sessionId":"session","content":"hi"});
        payload[option] = value;
        let response = fixture
            .post("/api/chat")
            .json(&payload)
            .send()
            .await
            .unwrap();
        assert_eq!(response.status(), 400, "{option}");
        assert_eq!(
            response.json::<Value>().await.unwrap(),
            expected,
            "{option}"
        );
    }
    assert_eq!(fixture.factory.calls.load(Ordering::SeqCst), 0);
    assert!(fixture.events().await.is_empty());
    // Choices the owner's configuration decides on reach the factory, and it refuses them itself.
    for (option, value, expected) in [
        (
            "provider",
            json!("untrusted"),
            json!({"error":"PROVIDER_NOT_CONFIGURED"}),
        ),
        (
            "model",
            json!("other-model"),
            json!({"error":"MODEL_NOT_CONFIGURED"}),
        ),
    ] {
        let mut payload = json!({"sessionId":"session","content":"hi"});
        payload[option] = value;
        let response = fixture
            .post("/api/chat")
            .json(&payload)
            .send()
            .await
            .unwrap();
        assert_eq!(response.status(), 400, "{option}");
        assert_eq!(
            response.json::<Value>().await.unwrap(),
            expected,
            "{option}"
        );
    }
    assert_eq!(fixture.factory.calls.load(Ordering::SeqCst), 2);
    assert!(fixture.events().await.is_empty());
    // The web client's shape for a supervised turn is accepted and runs.
    let response = fixture
        .post("/api/chat")
        .json(&json!({
            "sessionId": "session",
            "content": "hi",
            "clientMessageId": "user-abcdefgh",
            "mode": "agent",
            "runtimeMode": "supervised",
            "reasoningEffort": null,
            "model": "configured-model",
            "displaySegments": [{"type": "text", "text": "hi"}]
        }))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    assert_eq!(
        frames(&response.text().await.unwrap()).last().unwrap()["type"],
        "done"
    );
    assert_eq!(fixture.factory.calls.load(Ordering::SeqCst), 3);
    fixture.finish().await;
}

#[tokio::test]
async fn request_limits_and_execution_configuration_fields_are_rejected() {
    let limits = ChatLimits {
        body_bytes: 1024,
        ..ChatLimits::default()
    };
    let fixture = Fixture::new(false, 1, limits).await;
    // `provider` is a choice the factory checks against the owner's configuration, so it is covered by
    // web_options_are_validated_before_preparation instead of this list of refused-before-preparation fields.
    for field in ["runtimeMode", "projectRoot", "openaiBaseUrl", "userId"] {
        let mut input = json!({"sessionId":"session","content":"hi"});
        input[field] = json!("untrusted");
        assert_eq!(
            fixture
                .post("/api/chat")
                .json(&input)
                .send()
                .await
                .unwrap()
                .status(),
            400
        );
    }
    assert_eq!(
        fixture
            .post("/api/chat")
            .header(header::CONTENT_TYPE, "application/json")
            .body("x".repeat(1025))
            .send()
            .await
            .unwrap()
            .status(),
        413
    );
    assert_eq!(
        fixture
            .post("/api/chat")
            .header(header::CONTENT_TYPE, "application/json")
            .body("{")
            .send()
            .await
            .unwrap()
            .status(),
        400
    );
    assert_eq!(
        fixture
            .get("/api/sessions/session/messages?before=invalid")
            .send()
            .await
            .unwrap()
            .status(),
        400
    );
    assert_eq!(
        fixture
            .get("/api/sessions/session/messages?limit=1&limit=2")
            .send()
            .await
            .unwrap()
            .status(),
        400
    );
    assert_eq!(fixture.factory.calls.load(Ordering::SeqCst), 0);
    fixture.finish().await;
}
#[tokio::test]
async fn same_session_send_queues_and_owner_cancel_persists_partial_then_runs_the_queue() {
    let fixture = Fixture::new(true, 1, ChatLimits::default()).await;
    let mut first = fixture
        .post("/api/chat")
        .json(&json!({"sessionId":"session","content":"hi"}))
        .send()
        .await
        .unwrap();
    first.chunk().await.unwrap().unwrap();
    // A send during the running turn joins the session's queue instead of starting a second turn.
    let queued = fixture
        .post("/api/chat")
        .json(&json!({"sessionId":"session","content":"again"}))
        .send()
        .await
        .unwrap();
    assert_eq!(queued.status(), 202);
    assert!(queued.text().await.unwrap().contains("\"type\":\"queued\""));
    assert_eq!(
        fixture
            .post("/api/chat/cancel")
            .json(&json!({"sessionId":"foreign"}))
            .send()
            .await
            .unwrap()
            .status(),
        404
    );
    let projection: Value = fixture
        .get("/api/sessions/session/messages")
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(projection["streaming"], true);
    let cancelled: Value = fixture
        .post("/api/sessions/session/cancel")
        .json(&json!({}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(cancelled["cancelled"], true);
    let rest = first.text().await.unwrap();
    assert!(
        frames(&rest)
            .iter()
            .any(|event| event["type"] == "done" && event["cancelled"] == true)
    );
    assert!(
        matches!(&fixture.events().await[1],TurnEvent::Assistant{content,tool_calls,..}if content=="response fragment "&&tool_calls.is_empty())
    );
    // The queued send starts by itself once the cancelled turn releases the session. The provider
    // stays paused, so the session is busy until the explicit cancel below.
    wait_for_running_turn(&fixture, "again").await;
    let rerun: Value = fixture
        .post("/api/sessions/session/cancel")
        .json(&json!({}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(rerun["cancelled"], true);
    fixture.finish().await;
}
/// Waits until a turn whose message is `content` is running for the session.
async fn wait_for_running_turn(fixture: &Fixture, content: &str) {
    tokio::time::timeout(Duration::from_secs(3), async {
        loop {
            let events = fixture.events().await;
            let started = events
                .iter()
                .any(|event| matches!(event, TurnEvent::User { content: text } if text == content));
            let running = fixture
                .routes
                .active
                .turns
                .lock()
                .unwrap()
                .contains_key("session");
            if started && running {
                return;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap();
}
#[tokio::test]
async fn queued_turn_resumes_after_another_session_releases_capacity() {
    let limits = ChatLimits {
        max_active: NonZeroU16::new(1).unwrap(),
        ..ChatLimits::default()
    };
    let fixture = Fixture::new(true, 1, limits).await;
    let blocker = match fixture.routes.try_admit("owner", "other-session", false) {
        Ok(lease) => lease,
        Err(_) => panic!("capacity blocker should be admitted"),
    };
    fixture
        .auth
        .with_database(|db| {
            chat_queue::store(
                db,
                "session",
                &[json!({"id":"waiting", "content":"waiting"})],
                &[],
            )?;
            Ok(())
        })
        .await
        .unwrap();

    fixture.routes.drain_queued("owner", "session").await;
    assert_eq!(fixture.factory.calls.load(Ordering::SeqCst), 0);
    drop(blocker);
    wait_for_running_turn(&fixture, "waiting").await;
    fixture.routes.close();
    fixture.finish().await;
}
#[tokio::test]
async fn queued_turn_resumes_when_capacity_lease_drops_outside_runtime() {
    let limits = ChatLimits {
        max_active: NonZeroU16::new(1).unwrap(),
        ..ChatLimits::default()
    };
    let fixture = Fixture::new(true, 1, limits).await;
    let blocker = fixture
        .routes
        .try_admit("owner", "other-session", false)
        .unwrap_or_else(|_| panic!("capacity blocker should be admitted"));
    fixture
        .auth
        .with_database(|db| {
            chat_queue::store(
                db,
                "session",
                &[json!({"id":"waiting", "content":"waiting"})],
                &[],
            )?;
            Ok(())
        })
        .await
        .unwrap();
    fixture.routes.drain_queued("owner", "session").await;
    std::thread::spawn(move || drop(blocker)).join().unwrap();
    wait_for_running_turn(&fixture, "waiting").await;
    fixture.routes.close();
    fixture.finish().await;
}

#[tokio::test]
async fn queued_turn_resumes_after_device_change_finishes() {
    let fixture = Fixture::new(true, 1, ChatLimits::default()).await;
    let device_change = fixture.routes.device_change_lease("session").unwrap();
    fixture
        .auth
        .with_database(|db| {
            chat_queue::store(
                db,
                "session",
                &[json!({"id":"waiting", "content":"waiting"})],
                &[],
            )?;
            Ok(())
        })
        .await
        .unwrap();

    fixture.routes.drain_queued("owner", "session").await;
    assert_eq!(fixture.factory.calls.load(Ordering::SeqCst), 0);
    drop(device_change);
    wait_for_running_turn(&fixture, "waiting").await;
    fixture.routes.close();
    fixture.finish().await;
}
#[tokio::test]
async fn queued_upload_remains_intact_and_blocks_later_messages() {
    let fixture = Fixture::new(false, 1, ChatLimits::default()).await;
    let queue = vec![
        json!({"id": "upload", "content": "describe", "attachments": [{"name": "image.png"}]}),
        json!({"id": "later", "content": "later"}),
    ];
    let stored = queue.clone();
    fixture
        .auth
        .with_database(move |db| Ok(chat_queue::store(db, "session", &stored, &[])?))
        .await
        .unwrap();

    fixture.routes.drain_queued("owner", "session").await;

    let (remaining, consumed) = fixture
        .auth
        .with_database(|db| Ok(chat_queue::read(db, "session")?))
        .await
        .unwrap();
    assert_eq!(remaining, queue);
    assert!(consumed.is_empty());
    assert_eq!(fixture.factory.calls.load(Ordering::SeqCst), 0);
    fixture.finish().await;
}
#[tokio::test]
async fn a_send_never_joins_a_queued_entry_that_already_ran() {
    let fixture = Fixture::new(true, 1, ChatLimits::default()).await;
    let mut first = fixture
        .post("/api/chat")
        .json(&json!({"sessionId":"session","content":"hi"}))
        .send()
        .await
        .unwrap();
    first.chunk().await.unwrap().unwrap();
    // A stale client snapshot can bring back an entry whose id already ran. That entry must not
    // absorb a new send with the same text, or the send would never run.
    fixture
        .auth
        .with_database(|db| {
            crate::routes::chat_queue::store(
                db,
                "session",
                &[json!({"id":"q-ran","content":"again"})],
                &["q-ran".to_owned()],
            )?;
            Ok(())
        })
        .await
        .unwrap();
    let queued = fixture
        .post("/api/chat")
        .json(&json!({"sessionId":"session","content":"again"}))
        .send()
        .await
        .unwrap();
    assert_eq!(queued.status(), 202);
    let body = queued.text().await.unwrap();
    let event = frames(&body)
        .into_iter()
        .find(|event| event["type"] == "queued")
        .unwrap();
    assert_ne!(event["message"]["id"], "q-ran");
    let cancelled: Value = fixture
        .post("/api/sessions/session/cancel")
        .json(&json!({}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(cancelled["cancelled"], true);
    wait_for_running_turn(&fixture, "again").await;
    let rerun: Value = fixture
        .post("/api/sessions/session/cancel")
        .json(&json!({}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(rerun["cancelled"], true);
    fixture.finish().await;
}
#[tokio::test]
async fn queued_message_ids_are_validated_before_preparation() {
    let fixture = Fixture::new(false, 1, ChatLimits::default()).await;
    for id in [json!(5), json!("x".repeat(129)), json!("bad\nid")] {
        let response = fixture
            .post("/api/chat")
            .json(&json!({"sessionId":"session","content":"hi","queuedMessageId":id}))
            .send()
            .await
            .unwrap();
        assert_eq!(response.status(), 400);
        assert_eq!(
            response.json::<Value>().await.unwrap()["error"],
            "INVALID_CHAT_REQUEST"
        );
    }
    assert_eq!(fixture.factory.calls.load(Ordering::SeqCst), 0);
    assert!(fixture.events().await.is_empty());
    fixture.finish().await;
}
/// The drain replays a queue entry only with options this binary honors. A known style replays with
/// that style, `normal` is no style, and an unknown style leaves the entry queued.
#[test]
fn a_queued_entry_replays_a_known_style_and_keeps_an_unknown_one_queued() {
    let entry = |style: &str| json!({"content": "later", "responseStyle": style});
    let replay = queued_request("session", &entry("caveman")).expect("a known style replays");
    assert_eq!(replay.selection.response_style.as_deref(), Some("caveman"));
    let plain = queued_request("session", &entry("normal")).expect("normal replays");
    assert_eq!(plain.selection.response_style, None);
    assert!(queued_request("session", &entry("concise")).is_none());
}

#[tokio::test]
async fn a_queued_send_keeps_its_id_and_choices_and_the_drain_replays_them() {
    let fixture = Fixture::new(true, 1, ChatLimits::default()).await;
    let mut first = fixture
        .post("/api/chat")
        .json(&json!({"sessionId":"session","content":"hi"}))
        .send()
        .await
        .unwrap();
    first.chunk().await.unwrap().unwrap();
    let queued = fixture
        .post("/api/chat")
        .json(&json!({
            "sessionId":"session",
            "content":"again",
            "queuedMessageId":"q-web-1",
            "model":"configured-model",
            "reasoningEffort":"medium",
            "responseStyle":"caveman",
            "displaySegments":[{"type":"text","text":"again"}]
        }))
        .send()
        .await
        .unwrap();
    assert_eq!(queued.status(), 202);
    let event = frames(&queued.text().await.unwrap())
        .into_iter()
        .find(|event| event["type"] == "queued")
        .unwrap();
    assert_eq!(event["message"]["id"], "q-web-1");
    assert_eq!(event["message"]["model"], "configured-model");
    assert_eq!(event["message"]["reasoningEffort"], "medium");
    assert_eq!(event["message"]["responseStyle"], "caveman");
    assert_eq!(
        event["message"]["displaySegments"],
        json!([{"type":"text","text":"again"}])
    );
    // Ending the paused turn drains the queue. The drained turn runs with the choices the entry kept.
    let cancelled: Value = fixture
        .post("/api/sessions/session/cancel")
        .json(&json!({}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(cancelled["cancelled"], true);
    wait_for_running_turn(&fixture, "again").await;
    let selections = fixture.factory.selections.lock().unwrap().clone();
    assert_eq!(selections.len(), 2);
    assert_eq!(
        selections[1],
        TurnSelection {
            provider: None,
            model: Some("configured-model".into()),
            reasoning_effort: Some("medium".into()),
            response_style: Some("caveman".into()),
        }
    );
    // A retry of the delivered send is answered as consumed. No second turn starts.
    let retry = fixture
        .post("/api/chat")
        .json(&json!({"sessionId":"session","content":"again","queuedMessageId":"q-web-1"}))
        .send()
        .await
        .unwrap();
    assert_eq!(retry.status(), 202);
    assert_eq!(
        retry.json::<Value>().await.unwrap(),
        json!({"ok":true,"skipped":"queue-already-consumed","queuedMessageId":"q-web-1"})
    );
    assert_eq!(fixture.factory.calls.load(Ordering::SeqCst), 2);
    let rerun: Value = fixture
        .post("/api/sessions/session/cancel")
        .json(&json!({}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(rerun["cancelled"], true);
    fixture.finish().await;
}
#[tokio::test]
async fn a_direct_send_claims_its_queue_entry_and_a_stale_snapshot_cannot_resend() {
    let fixture = Fixture::new(false, 1, ChatLimits::default()).await;
    fixture
        .auth
        .with_database(|db| {
            Ok(chat_queue::store(
                db,
                "session",
                &[json!({"id":"q-held","content":"later","held":true})],
                &[],
            )?)
        })
        .await
        .unwrap();
    let sent = fixture
        .post("/api/chat")
        .json(&json!({"sessionId":"session","content":"later","queuedMessageId":"q-held"}))
        .send()
        .await
        .unwrap();
    assert_eq!(sent.status(), 200);
    assert!(
        frames(&sent.text().await.unwrap())
            .iter()
            .any(|event| event["type"] == "done")
    );
    let (queue, consumed) = fixture
        .auth
        .with_database(|db| Ok(chat_queue::read(db, "session")?))
        .await
        .unwrap();
    assert!(queue.is_empty());
    assert_eq!(consumed, ["q-held".to_owned()]);
    // A stale client snapshot brings the entry back. Its id is consumed, so the drain drops it.
    fixture
        .auth
        .with_database(move |db| {
            Ok(chat_queue::store(
                db,
                "session",
                &[json!({"id":"q-held","content":"later","held":true})],
                &consumed,
            )?)
        })
        .await
        .unwrap();
    fixture.routes.drain_queued("owner", "session").await;
    assert_eq!(fixture.factory.calls.load(Ordering::SeqCst), 1);
    fixture.finish().await;
}
#[tokio::test]
async fn claiming_a_send_consumes_its_id_and_same_text_entries_once() {
    let fixture = Fixture::new(false, 1, ChatLimits::default()).await;
    fixture
        .auth
        .with_database(|db| {
            Ok(chat_queue::store(
                db,
                "session",
                &[
                    json!({"id":"q-a","content":"same"}),
                    json!({"id":"q-b","content":"other"}),
                ],
                &[],
            )?)
        })
        .await
        .unwrap();
    let first = fixture
        .routes
        .claim_send("session", Some("q-x"), "same")
        .await
        .unwrap();
    assert!(
        matches!(first, Claim::Claimed(Some(queue)) if queue == vec![json!({"id":"q-b","content":"other"})])
    );
    let again = fixture
        .routes
        .claim_send("session", Some("q-x"), "anything")
        .await
        .unwrap();
    assert!(matches!(again, Claim::Consumed));
    let (queue, consumed) = fixture
        .auth
        .with_database(|db| Ok(chat_queue::read(db, "session")?))
        .await
        .unwrap();
    assert_eq!(queue, vec![json!({"id":"q-b","content":"other"})]);
    assert_eq!(consumed, ["q-a".to_owned(), "q-x".to_owned()]);
    fixture.finish().await;
}
#[tokio::test]
async fn a_queued_entry_whose_choice_is_refused_stays_queued() {
    let fixture = Fixture::new(false, 1, ChatLimits::default()).await;
    let entry = json!({"id":"q-bad","content":"needs another provider","provider":"unknown-agent"});
    let stored = vec![entry.clone()];
    fixture
        .auth
        .with_database(move |db| Ok(chat_queue::store(db, "session", &stored, &[])?))
        .await
        .unwrap();
    fixture.routes.drain_queued("owner", "session").await;
    // The factory refused the choice, so no turn started and the entry is where it was.
    assert_eq!(fixture.factory.calls.load(Ordering::SeqCst), 1);
    let (queue, consumed) = fixture
        .auth
        .with_database(|db| Ok(chat_queue::read(db, "session")?))
        .await
        .unwrap();
    assert_eq!(queue, vec![entry]);
    assert!(consumed.is_empty());
    assert!(fixture.events().await.is_empty());
    fixture.finish().await;
}
#[tokio::test]
async fn stop_and_send_moves_the_selected_entry_to_the_front_and_runs_it_next() {
    let fixture = Fixture::new(true, 1, ChatLimits::default()).await;
    // Nothing is running yet, so there is no turn to stop for a send.
    let idle = fixture
        .post("/api/sessions/session/cancel")
        .json(&json!({"queuedMessageId":"q-b"}))
        .send()
        .await
        .unwrap();
    assert_eq!(idle.status(), 409);
    let mut first = fixture
        .post("/api/chat")
        .json(&json!({"sessionId":"session","content":"hi"}))
        .send()
        .await
        .unwrap();
    first.chunk().await.unwrap().unwrap();
    fixture
        .auth
        .with_database(|db| {
            Ok(chat_queue::store(
                db,
                "session",
                &[
                    json!({"id":"q-a","content":"first in line"}),
                    json!({"id":"q-b","content":"selected","held":true}),
                ],
                &[],
            )?)
        })
        .await
        .unwrap();
    let missing = fixture
        .post("/api/sessions/session/cancel")
        .json(&json!({"queuedMessageId":"q-gone"}))
        .send()
        .await
        .unwrap();
    assert_eq!(missing.status(), 404);
    let malformed = fixture
        .post("/api/sessions/session/cancel")
        .json(&json!({"queuedMessageId":5}))
        .send()
        .await
        .unwrap();
    assert_eq!(malformed.status(), 400);
    let sent: Value = fixture
        .post("/api/sessions/session/cancel")
        .json(&json!({"queuedMessageId":"q-b"}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(sent, json!({"ok":true,"cancelled":true}));
    wait_for_running_turn(&fixture, "selected").await;
    assert!(
        !fixture.events().await.iter().any(
            |event| matches!(event, TurnEvent::User { content } if content == "first in line")
        )
    );
    let (queue, _) = fixture
        .auth
        .with_database(|db| Ok(chat_queue::read(db, "session")?))
        .await
        .unwrap();
    assert_eq!(queue, vec![json!({"id":"q-a","content":"first in line"})]);
    let stopped: Value = fixture
        .post("/api/sessions/session/cancel")
        .json(&json!({}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(stopped["cancelled"], true);
    fixture.finish().await;
}
#[test]
fn a_path_cancel_reads_only_the_queued_message_id_as_node_does() {
    assert_eq!(send_now_target(&json!(null)).ok().flatten(), None);
    assert_eq!(send_now_target(&json!({})).ok().flatten(), None);
    assert_eq!(
        send_now_target(&json!({"reason": "stop"})).ok().flatten(),
        None
    );
    assert_eq!(
        send_now_target(&json!({"queuedMessageId": "q-1", "extra": true}))
            .ok()
            .flatten(),
        Some("q-1".to_owned())
    );
    for refused in [
        json!({"queuedMessageId": ""}),
        json!({"queuedMessageId": "   "}),
        json!({"queuedMessageId": null}),
        json!({"queuedMessageId": 7}),
    ] {
        assert!(send_now_target(&refused).is_err(), "{refused}");
    }
}
#[tokio::test]
async fn terminal_write_failure_is_visible_without_a_durable_id() {
    let fixture = Fixture::new(true, 1, ChatLimits::default()).await;
    let mut post = fixture
        .post("/api/chat")
        .json(&json!({"sessionId":"session","content":"hi"}))
        .send()
        .await
        .unwrap();
    post.chunk().await.unwrap().unwrap();
    fixture.auth.with_database(|db| {
        db.execute_batch("CREATE TRIGGER fail_terminal BEFORE INSERT ON session_events WHEN NEW.type = 'rust.chat.stream' AND (json_extract(NEW.payload, '$.type') = 'done' OR json_extract(NEW.payload, '$.type') = 'error') BEGIN SELECT RAISE(FAIL, 'injected failure'); END;")?;
        Ok(())
    }).await.unwrap();
    let cancelled = fixture
        .post("/api/sessions/session/cancel")
        .json(&json!({}))
        .send()
        .await
        .unwrap();
    assert_eq!(cancelled.status(), 200);
    let body = post.text().await.unwrap();
    assert!(body.contains("Chat stream could not be persisted"));
    let mut subscription = fixture
        .get("/api/sessions/session/events")
        .send()
        .await
        .unwrap();
    let frame = tokio::time::timeout(Duration::from_secs(3), subscription.chunk())
        .await
        .unwrap()
        .unwrap()
        .unwrap();
    let frame = String::from_utf8(frame.to_vec()).unwrap();
    assert!(
        frame.contains("Chat stream could not be persisted"),
        "{frame}"
    );
    assert!(!frame.contains("id:"), "{frame}");
    drop(subscription);
    let terminal_count: i64 = fixture.auth.with_database(|db| Ok(db.query_row("SELECT count(*) FROM session_events WHERE type='rust.chat.stream' AND json_extract(payload, '$.type') IN ('done','error')", [], |row| row.get(0))?)).await.unwrap();
    assert_eq!(terminal_count, 0);
    fixture.finish().await;
}

#[tokio::test]
async fn disconnected_http_consumer_keeps_turn_until_explicit_cancel() {
    let fixture = Fixture::new(true, 1, ChatLimits::default()).await;
    let mut response = fixture
        .post("/api/chat")
        .json(&json!({"sessionId":"session","content":"hi"}))
        .send()
        .await
        .unwrap();
    response.chunk().await.unwrap().unwrap();
    let mut done = fixture
        .routes
        .active
        .turns
        .lock()
        .unwrap()
        .get("session")
        .unwrap()
        .done
        .subscribe();
    drop(response);
    assert!(!*done.borrow());
    assert!(
        fixture
            .routes
            .active
            .turns
            .lock()
            .unwrap()
            .contains_key("session")
    );
    let cancelled = fixture
        .post("/api/sessions/session/cancel")
        .json(&json!({}))
        .send()
        .await
        .unwrap();
    assert_eq!(cancelled.status(), 200);
    assert_eq!(cancelled.json::<Value>().await.unwrap()["cancelled"], true);
    tokio::time::timeout(Duration::from_secs(3), async {
        while !*done.borrow_and_update() {
            done.changed().await.unwrap();
        }
    })
    .await
    .unwrap();
    assert!(fixture.routes.active.turns.lock().unwrap().is_empty());
    assert!(
        matches!(&fixture.events().await[1],TurnEvent::Assistant{content,..}if content=="response fragment ")
    );
    fixture.finish().await;
}
#[tokio::test]
async fn http_stream_total_bytes_are_bounded_and_terminal_event_fits_reserve() {
    let limits = ChatLimits {
        stream_bytes: 4096,
        event_bytes: 512,
        ..ChatLimits::default()
    };
    let fixture = Fixture::new(false, 500, limits).await;
    let response = fixture
        .post("/api/chat")
        .json(&json!({"sessionId":"session","content":"hi"}))
        .send()
        .await
        .unwrap();
    let text = response.text().await.unwrap();
    assert!(text.len() <= 4096);
    let events = frames(&text);
    let terminal = events.last().unwrap();
    assert!(terminal["type"] == "error" || terminal["cancelled"] == true);
    assert!(fixture.events().await.len() >= 2);
    fixture.finish().await;
}
#[tokio::test(start_paused = true)]
async fn full_consumer_channel_detaches_without_cancelling_turn() {
    let fixture = Fixture::new(false, 1, ChatLimits::default()).await;
    let (sender, _receiver) = mpsc::channel(1);
    let cancellation = ProcessCancellation::default();
    let delivery_failed = Arc::new(AtomicBool::new(false));
    let store =
        SqliteTurnStore::new(fixture.auth.clone(), "owner".into(), "session".into()).unwrap();
    let sink = event_sink(
        sender,
        cancellation.clone(),
        ChatLimits::default(),
        store,
        Arc::new(tokio::sync::Mutex::new(())),
        StreamFlags {
            closed: Arc::new(AtomicBool::new(false)),
            delivery_failed: delivery_failed.clone(),
            stream_failed: Arc::new(AtomicBool::new(false)),
        },
    );
    sink(json!({"type":"token","content":"one"})).await.unwrap();
    sink(json!({"type":"token","content":"two"})).await.unwrap();
    assert!(delivery_failed.load(Ordering::Acquire));
    assert!(!cancellation.is_cancelled());
    fixture.finish().await;
}
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn abandoned_sink_keeps_serial_guard_until_started_write_finishes() {
    let fixture = Fixture::new(false, 1, ChatLimits::default()).await;
    let (started_tx, started_rx) = tokio::sync::oneshot::channel();
    let (release_tx, release_rx) = std::sync::mpsc::channel();
    fixture
        .auth
        .with_database(move |db| {
            let mut started = Some(started_tx);
            db.progress_handler(
                1,
                Some(move || {
                    if let Some(started) = started.take() {
                        let _ = started.send(());
                        let _ = release_rx.recv();
                    }
                    false
                }),
            )?;
            Ok(())
        })
        .await
        .unwrap();
    let serial = Arc::new(tokio::sync::Mutex::new(()));
    let (sender, _receiver) = mpsc::channel(1);
    let store =
        SqliteTurnStore::new(fixture.auth.clone(), "owner".into(), "session".into()).unwrap();
    let sink = event_sink(
        sender,
        ProcessCancellation::default(),
        ChatLimits::default(),
        store,
        serial.clone(),
        StreamFlags::default(),
    );
    let task = tokio::spawn(async move { sink(json!({"type":"token","content":"partial"})).await });
    started_rx.await.unwrap();
    task.abort();
    let _ = task.await;
    assert!(
        serial.try_lock().is_err(),
        "finalization must wait for the started write"
    );
    release_tx.send(()).unwrap();
    let guard = tokio::time::timeout(Duration::from_secs(3), serial.lock())
        .await
        .unwrap();
    drop(guard);
    fixture.auth.with_database(|db| {
        db.progress_handler(0, None::<fn() -> bool>)?;
        let count: i64 = db.query_row(
            "SELECT count(*) FROM session_events WHERE session_id='session' AND type='rust.chat.stream' AND payload LIKE '%partial%'",
            [], |row| row.get(0))?;
        assert_eq!(count, 1);
        Ok(())
    }).await.unwrap();
    fixture.finish().await;
}

#[tokio::test]
async fn shutdown_closes_new_turn_admission() {
    let fixture = Fixture::new(false, 1, ChatLimits::default()).await;
    fixture.routes.shutdown().await.unwrap();
    assert_eq!(
        fixture
            .post("/api/chat")
            .json(&json!({"sessionId":"session","content":"hi"}))
            .send()
            .await
            .unwrap()
            .status(),
        503
    );
    assert_eq!(fixture.factory.calls.load(Ordering::SeqCst), 0);
    fixture.finish().await;
}

#[tokio::test]
async fn completed_turn_delivers_terminal_even_if_adapter_retains_sink_clone() {
    let fixture = Fixture::new(false, 1, ChatLimits::default()).await;
    fixture
        .factory
        .provider
        .retain
        .store(true, Ordering::SeqCst);
    let response = fixture
        .post("/api/chat")
        .json(&json!({"sessionId":"session","content":"hi"}))
        .send()
        .await
        .unwrap();
    let text = tokio::time::timeout(Duration::from_secs(2), response.text())
        .await
        .unwrap()
        .unwrap();
    assert_eq!(frames(&text).last().unwrap()["type"], "done");
    assert!(fixture.factory.provider.retained.lock().unwrap().is_some());
    fixture.finish().await;
}

// ---------------------------------------------------------------------------
// GET /api/sessions/{id}/stream — browser subscription over the durable log
// ---------------------------------------------------------------------------
/// Read SSE bytes until `min_frames` `data:` frames arrive, the stream ends, or
/// five seconds pass, whichever happens first.
async fn read_frames(mut response: reqwest::Response, min_frames: usize) -> String {
    let mut text = String::new();
    let deadline = tokio::time::Instant::now() + Duration::from_secs(5);
    while text.matches("data: ").count() < min_frames {
        let left = deadline.saturating_duration_since(tokio::time::Instant::now());
        match tokio::time::timeout(left, response.chunk()).await {
            Ok(Ok(Some(chunk))) => text.push_str(&String::from_utf8_lossy(&chunk)),
            _ => break,
        }
    }
    text
}

/// Read until a frame of one of `kinds` has arrived. The turn log records the
/// user request before the provider runs, so counting frames races that entry;
/// tests that assert on provider output wait for the type instead.
async fn read_until_type(mut response: reqwest::Response, kinds: &[&str]) -> String {
    let mut text = String::new();
    let deadline = tokio::time::Instant::now() + Duration::from_secs(5);
    loop {
        let found = frame_payloads(&text)
            .iter()
            .any(|payload| kinds.iter().any(|kind| payload["type"] == *kind));
        if found {
            return text;
        }
        let left = deadline.saturating_duration_since(tokio::time::Instant::now());
        match tokio::time::timeout(left, response.chunk()).await {
            Ok(Ok(Some(chunk))) => text.push_str(&String::from_utf8_lossy(&chunk)),
            _ => return text,
        }
    }
}

/// Frame ids in arrival order: the browser resumes from the last one it saw.
fn frame_ids(body: &str) -> Vec<i64> {
    body.split("\n\n")
        .filter_map(|frame| {
            frame
                .lines()
                .find_map(|line| line.strip_prefix("id: "))
                .and_then(|id| id.trim().parse::<i64>().ok())
        })
        .collect()
}

fn frame_payloads(body: &str) -> Vec<Value> {
    body.split("\n\n")
        .filter_map(|frame| {
            frame
                .lines()
                .find_map(|line| line.strip_prefix("data: "))
                .filter(|data| data.starts_with('{'))
                .and_then(|data| serde_json::from_str::<Value>(data).ok())
        })
        .collect()
}

#[tokio::test]
async fn stream_replays_durable_events_with_ascending_ids() {
    let fixture = Fixture::new(false, 2, ChatLimits::default()).await;
    let turn = fixture
        .post("/api/chat")
        .json(&json!({"session_id":"session","message":"hi"}))
        .send()
        .await
        .unwrap();
    assert_eq!(turn.status(), 200);
    turn.bytes().await.unwrap();
    let durable: Vec<i64> = fixture.auth.with_database(|db| {
        let mut stmt = db.prepare("SELECT log_id FROM session_events WHERE session_id='session' AND type='rust.chat.stream' ORDER BY log_id")?;
        let rows = stmt.query_map([], |row| row.get(0))?.collect::<Result<Vec<i64>, _>>()?;
        Ok(rows)
    }).await.unwrap();
    assert!(!durable.is_empty(), "a completed turn persists UI frames");

    let stream = fixture
        .get("/api/sessions/session/stream")
        .header("Last-Event-ID", "0")
        .send()
        .await
        .unwrap();
    assert_eq!(stream.status(), 200);
    assert_eq!(
        stream.headers().get(header::CONTENT_TYPE).unwrap(),
        "text/event-stream"
    );
    let body = read_frames(stream, durable.len()).await;
    assert_eq!(
        frame_ids(&body),
        durable,
        "replay must reproduce the durable sequence from the start"
    );
    let payloads = frame_payloads(&body);
    assert_eq!(payloads.len(), frame_ids(&body).len());
    assert!(payloads.iter().all(|payload| payload.get("type").is_some()));
    assert!(payloads.iter().all(|payload| payload["replay"] == true));
    fixture.finish().await;
}

#[tokio::test]
async fn provisional_identity_survives_http_snapshot_and_reconnect() {
    let fixture = Fixture::new(true, 0, ChatLimits::default()).await;
    fixture
        .factory
        .provider
        .retain
        .store(true, Ordering::SeqCst);
    let turn = fixture
        .post("/api/chat")
        .json(&json!({"session_id":"session","message":"hi"}))
        .send()
        .await
        .unwrap();
    assert_eq!(turn.status(), 200);
    let sink = tokio::time::timeout(Duration::from_secs(2), async {
        loop {
            if let Some(sink) = fixture.factory.provider.retained.lock().unwrap().clone() {
                break sink;
            }
            tokio::task::yield_now().await;
        }
    })
    .await
    .unwrap();
    let mut decoder = SseDecoder::default();
    let first = format!(
        "data: {}\n\n",
        json!({"choices":[{"delta":{"tool_calls":[{"index":4,"function":{"name":"file_"}}]}}]})
    );
    for event in decoder.feed(first.as_bytes()).unwrap() {
        sink(event).await.unwrap();
    }
    let projection: Value = fixture
        .get("/api/sessions/session/messages?limit=5")
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let calls = projection["messages"]
        .as_array()
        .unwrap()
        .iter()
        .find_map(|m| m["toolCalls"].as_array().filter(|calls| !calls.is_empty()))
        .unwrap();
    assert_eq!(calls[0]["callId"], "pending-0");
    assert_eq!(calls[0]["streamIndex"], 4);
    assert_eq!(calls[0]["provisional"], true);
    let before: i64 = fixture.auth.with_database(|db| Ok(db.query_row(
        "SELECT MAX(log_id) FROM session_events WHERE session_id='session' AND type='rust.chat.stream'", [], |row| row.get(0)
    )?)).await.unwrap();
    let second = format!(
        "data: {}\n\n",
        json!({"choices":[{"delta":{"tool_calls":[{"index":4,"id":"real-4","function":{"name":"read"}}]}}]})
    );
    for event in decoder.feed(second.as_bytes()).unwrap() {
        sink(event).await.unwrap();
    }
    let stream = fixture
        .get("/api/sessions/session/stream")
        .header("Last-Event-ID", before.to_string())
        .send()
        .await
        .unwrap();
    let body = read_frames(stream, 1).await;
    let payloads = frame_payloads(&body);
    assert_eq!(payloads[0]["call_id"], "real-4");
    assert_eq!(payloads[0]["provisional"], false);
    let projection: Value = fixture
        .get("/api/sessions/session/messages?limit=5")
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let calls = projection["messages"]
        .as_array()
        .unwrap()
        .iter()
        .find_map(|m| m["toolCalls"].as_array().filter(|calls| !calls.is_empty()))
        .unwrap();
    assert_eq!(calls[0]["callId"], "real-4");
    assert_eq!(calls[0]["provisional"], false);
    assert_eq!(calls[0]["tool"], "file_read");
    // Exercise the explicit identity contract independently of the provider's
    // current compatibility guard for pending-prefixed real IDs.
    sink(json!({"type":"tool_call_delta","call_id":"pending-1","index":7,"provisional":true,"name_delta":"other_"})).await.unwrap();
    sink(json!({"type":"tool_call_delta","call_id":"pending-3","index":7,"provisional":false,"name_delta":"tool"})).await.unwrap();
    let projection: Value = fixture
        .get("/api/sessions/session/messages?limit=5")
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let calls = projection["messages"]
        .as_array()
        .unwrap()
        .iter()
        .find_map(|m| m["toolCalls"].as_array().filter(|calls| calls.len() == 2))
        .unwrap();
    assert_eq!(calls[1]["callId"], "pending-3");
    assert_eq!(calls[1]["provisional"], false);
    assert_eq!(calls[1]["tool"], "other_tool");
    drop(turn);
    fixture.finish().await;
}

#[tokio::test]
async fn ui_events_route_resumes_after_last_event_id() {
    let fixture = Fixture::new(false, 2, ChatLimits::default()).await;
    let turn = fixture
        .post("/api/chat")
        .json(&json!({"session_id":"session","message":"hi"}))
        .send()
        .await
        .unwrap();
    assert_eq!(turn.status(), 200);
    turn.bytes().await.unwrap();
    let durable = fixture.events().await;
    assert!(durable.len() >= 2);

    let stream = fixture
        .get("/api/sessions/session/events")
        .header("Last-Event-ID", "1")
        .send()
        .await
        .unwrap();
    let body = read_frames(stream, durable.len() - 1).await;
    assert_eq!(
        frame_ids(&body),
        (2..=durable.len() as i64).collect::<Vec<_>>(),
        "already-delivered ids must not be replayed"
    );
    fixture.finish().await;
}

#[tokio::test]
async fn stream_gates_authentication_and_session_ownership() {
    let fixture = Fixture::new(false, 1, ChatLimits::default()).await;
    let unauthenticated = fixture
        .client
        .get(format!("{}/api/sessions/session/stream", fixture.url))
        .send()
        .await
        .unwrap();
    assert_eq!(unauthenticated.status(), 401);
    for session in ["foreign", "archived", "missing"] {
        assert_eq!(
            fixture
                .get(&format!("/api/sessions/{session}/stream"))
                .send()
                .await
                .unwrap()
                .status(),
            404,
            "{session} must not expose a stream"
        );
    }
    assert_eq!(
        fixture
            .client
            .get(format!("{}/api/sessions/session/events", fixture.url))
            .send()
            .await
            .unwrap()
            .status(),
        401
    );
    assert_eq!(
        fixture
            .get("/api/sessions/foreign/events")
            .send()
            .await
            .unwrap()
            .status(),
        404
    );
    fixture.finish().await;
}

#[tokio::test]
async fn stream_delivers_live_events_published_after_subscribe() {
    // The paused provider holds the turn open, so anything observed here was
    // pushed by the bus rather than read back from SQLite.
    let fixture = Fixture::new(true, 1, ChatLimits::default()).await;
    let stream = fixture
        .get("/api/sessions/session/stream")
        .send()
        .await
        .unwrap();
    assert_eq!(stream.status(), 200);
    // Keep the POST response alive while observing the independent subscription.
    let turn = fixture
        .post("/api/chat")
        .json(&json!({"session_id":"session","message":"hi"}))
        .send()
        .await
        .unwrap();
    assert_eq!(turn.status(), 200);
    // The turn log records the user request before the provider runs, so this
    // waits for the provider's own frame instead of counting frames.
    let body = read_until_type(stream, &["thinking"]).await;
    let payloads = frame_payloads(&body);
    // The log records the user turn itself as a `request` entry (and closes
    // with `done`); chat_projection treats both as non-projection rows. The
    // subscription point of this test is the provider stream, so skip them.
    let streamed: Vec<_> = payloads
        .iter()
        .filter(|payload| !matches!(payload["type"].as_str(), Some("request" | "done")))
        .collect();
    assert_eq!(
        streamed.first().map(|payload| &payload["type"]),
        Some(&json!("thinking")),
        "a subscriber attached before the turn must receive live provider frames"
    );
    assert!(
        !frame_ids(&body).is_empty(),
        "live frames carry their log id"
    );
    drop(turn);
    fixture.finish().await;
}

#[tokio::test]
async fn shared_stream_delivers_filtered_live_frames_and_revokes() {
    let fixture = Fixture::new(false, 1, ChatLimits::default()).await;
    let mut response = fixture
        .get("/api/sessions/session/shared-stream")
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    let mut text = String::new();
    tokio::time::timeout(Duration::from_secs(5), async {
        while !text.contains("\n\n") {
            text.push_str(&String::from_utf8_lossy(
                &response.chunk().await.unwrap().unwrap(),
            ));
        }
    })
    .await
    .unwrap();
    assert_eq!(frame_payloads(&text)[0]["type"], "snapshot");

    // Frame zero is already covered by the snapshot cursor. Hidden frames must
    // advance the cursor without exposing their contents or disturbing order.
    for (id, payload) in [
        (0, json!({"type":"token","content":"old-secret"})),
        (
            1,
            json!({"type":"request","content":"hello","authorUserId":"owner","secret":"private"}),
        ),
        (2, json!({"type":"thinking","content":"thinking-secret"})),
        (
            3,
            json!({"type":"request","content":"notice-secret","systemNotice":"malformed"}),
        ),
        (
            4,
            json!({"type":"token","content":"answer","secret":"private"}),
        ),
        (5, json!({"type":"done","secret":"private"})),
    ] {
        fixture
            .routes
            .events
            .publish_serialized("session", id, payload.to_string())
            .unwrap();
    }
    tokio::time::timeout(Duration::from_secs(5), async {
        while frame_payloads(&text).len() < 4 {
            text.push_str(&String::from_utf8_lossy(
                &response.chunk().await.unwrap().unwrap(),
            ));
        }
    })
    .await
    .unwrap();
    assert_eq!(
        frame_payloads(&text),
        vec![
            json!({"type":"snapshot","messages":[],"streaming":false}),
            json!({"type":"request","content":"hello","authorUserId":"owner"}),
            json!({"type":"token","content":"answer"}),
            json!({"type":"done"}),
        ]
    );
    fixture
        .auth
        .with_database(|db| {
            db.execute(
                "UPDATE sessions SET status='archived' WHERE id='session'",
                [],
            )?;
            Ok(())
        })
        .await
        .unwrap();
    fixture
        .routes
        .events
        .publish_serialized(
            "session",
            6,
            json!({"type":"token","content":"after-revocation"}).to_string(),
        )
        .unwrap();
    assert!(
        tokio::time::timeout(Duration::from_secs(5), response.chunk())
            .await
            .unwrap()
            .unwrap()
            .is_none()
    );
    drop(response);
    fixture.finish().await;
}

#[tokio::test]
async fn shared_stream_receives_real_turn_events() {
    let fixture = Fixture::new(true, 1, ChatLimits::default()).await;
    let stream = fixture
        .get("/api/sessions/session/shared-stream")
        .send()
        .await
        .unwrap();
    assert_eq!(stream.status(), 200);
    let turn = fixture
        .post("/api/chat")
        .json(&json!({"session_id":"session","message":"hi"}))
        .send()
        .await
        .unwrap();
    assert_eq!(turn.status(), 200);
    let body = read_until_type(stream, &["token"]).await;
    let values = frame_payloads(&body);
    assert!(
        values
            .iter()
            .any(|value| value["type"] == "request" && value["content"] == "hi")
    );
    assert!(
        values
            .iter()
            .any(|value| value["type"] == "token" && value["content"] == "response fragment ")
    );
    assert!(!body.contains("thinking") && !body.contains("reason"));
    drop(turn);
    fixture.finish().await;
}

#[tokio::test]
async fn snapshot_retries_when_session_lease_completes_during_projection() {
    let fixture = Fixture::new(false, 0, ChatLimits::default()).await;
    let lease = fixture.routes.admit("owner", "session", false).unwrap();
    let started = Arc::new(tokio::sync::Barrier::new(2));
    let resume = Arc::new(tokio::sync::Barrier::new(2));
    let attempts = Arc::new(AtomicUsize::new(0));
    let active = fixture.routes.active.clone();
    let task = {
        let (started, resume, attempts) = (started.clone(), resume.clone(), attempts.clone());
        tokio::spawn(async move {
            consistent_snapshot(&active, "owner", "session", || {
                let (started, resume, attempts) =
                    (started.clone(), resume.clone(), attempts.clone());
                async move {
                    let attempt = attempts.fetch_add(1, Ordering::SeqCst);
                    if attempt == 0 {
                        started.wait().await;
                        resume.wait().await;
                    }
                    Ok::<_, ()>(json!({"seq": attempt}))
                }
            })
            .await
            .unwrap()
            .unwrap()
        })
    };
    started.wait().await;
    drop(lease);
    resume.wait().await;
    let value = task.await.unwrap();
    assert_eq!(attempts.load(Ordering::SeqCst), 2);
    assert_eq!(value["seq"], 1);
    assert_eq!(value["streaming"], false);
    assert!(fixture.routes.active.snapshots.lock().unwrap().is_empty());
    fixture.finish().await;
}

#[tokio::test]
async fn independent_session_activity_does_not_retry_snapshot() {
    let fixture = Fixture::new(false, 0, ChatLimits::default()).await;
    let started = Arc::new(tokio::sync::Barrier::new(2));
    let resume = Arc::new(tokio::sync::Barrier::new(2));
    let attempts = Arc::new(AtomicUsize::new(0));
    let active = fixture.routes.active.clone();
    let task = {
        let (started, resume, attempts) = (started.clone(), resume.clone(), attempts.clone());
        tokio::spawn(async move {
            consistent_snapshot(&active, "owner", "session", || {
                let (started, resume, attempts) =
                    (started.clone(), resume.clone(), attempts.clone());
                async move {
                    if attempts.fetch_add(1, Ordering::SeqCst) == 0 {
                        started.wait().await;
                        resume.wait().await;
                    }
                    Ok::<_, ()>(json!({"seq": 7}))
                }
            })
            .await
            .unwrap()
            .unwrap()
        })
    };
    started.wait().await;
    for _ in 0..4 {
        drop(
            fixture
                .routes
                .admit("owner", "other-session", false)
                .unwrap(),
        );
    }
    resume.wait().await;
    let value = task.await.unwrap();
    assert_eq!(attempts.load(Ordering::SeqCst), 1);
    assert_eq!(value["seq"], 7);
    assert_eq!(value["streaming"], false);
    assert!(fixture.routes.active.snapshots.lock().unwrap().is_empty());
    fixture.finish().await;
}

#[tokio::test]
async fn snapshot_detects_a_complete_lease_between_projection_boundaries() {
    let fixture = Fixture::new(false, 0, ChatLimits::default()).await;
    let started = Arc::new(tokio::sync::Barrier::new(2));
    let resume = Arc::new(tokio::sync::Barrier::new(2));
    let attempts = Arc::new(AtomicUsize::new(0));
    let active = fixture.routes.active.clone();
    let task = {
        let (started, resume, attempts) = (started.clone(), resume.clone(), attempts.clone());
        tokio::spawn(async move {
            consistent_snapshot(&active, "owner", "session", || {
                let (started, resume, attempts) =
                    (started.clone(), resume.clone(), attempts.clone());
                async move {
                    let attempt = attempts.fetch_add(1, Ordering::SeqCst);
                    if attempt == 0 {
                        started.wait().await;
                        resume.wait().await;
                    }
                    Ok::<_, ()>(json!({"seq": attempt}))
                }
            })
            .await
            .unwrap()
            .unwrap()
        })
    };
    started.wait().await;
    drop(fixture.routes.admit("owner", "session", false).unwrap());
    resume.wait().await;
    let value = task.await.unwrap();
    assert_eq!(attempts.load(Ordering::SeqCst), 2);
    assert_eq!(value["seq"], 1);
    assert_eq!(value["streaming"], false);
    fixture.finish().await;
}

#[tokio::test]
async fn repeated_same_session_changes_exhaust_snapshot_retries() {
    let fixture = Fixture::new(false, 0, ChatLimits::default()).await;
    let routes = fixture.routes.clone();
    let attempts = AtomicUsize::new(0);
    let result = consistent_snapshot(&fixture.routes.active, "owner", "session", || {
        attempts.fetch_add(1, Ordering::SeqCst);
        drop(routes.admit("owner", "session", false).unwrap());
        async { Ok::<_, ()>(json!({"seq": 0})) }
    })
    .await
    .unwrap();
    assert!(result.is_none());
    assert_eq!(attempts.load(Ordering::SeqCst), 3);
    assert!(fixture.routes.active.snapshots.lock().unwrap().is_empty());
    fixture.finish().await;
}

#[tokio::test]
async fn close_cancels_admitted_turn_and_rejects_new_turns() {
    let fixture = Fixture::new(false, 0, ChatLimits::default()).await;
    let lease = fixture.routes.admit("owner", "session", false).unwrap();
    let cancellation = lease.cancellation.clone();
    fixture.routes.close();
    assert!(cancellation.is_cancelled());
    assert!(fixture.routes.admit("owner", "other", false).is_err());
    drop(lease);
    fixture.routes.shutdown().await.unwrap();
    let _ = fixture.shutdown.send(());
    fixture.server.await.unwrap().unwrap();
    fixture.auth.shutdown().await.unwrap();
}

#[tokio::test]
async fn device_change_and_turn_admission_are_exclusive_per_session() {
    let fixture = Fixture::new(false, 1, ChatLimits::default()).await;
    let change = fixture.routes.device_change_lease("session").unwrap();
    assert!(fixture.routes.device_change_lease("session").is_none());
    let blocked = fixture
        .post("/api/chat")
        .json(&json!({"sessionId":"session","content":"hi"}))
        .send()
        .await
        .unwrap();
    assert_eq!(blocked.status(), 409);
    assert_eq!(fixture.factory.calls.load(Ordering::SeqCst), 0);
    let other = fixture
        .routes
        .admit("owner", "other-session", false)
        .unwrap();
    drop(other);
    drop(change);
    let turn = fixture.routes.admit("owner", "session", false).unwrap();
    assert!(fixture.routes.device_change_lease("session").is_none());
    drop(turn);
    assert!(fixture.routes.device_change_lease("session").is_some());
    fixture.finish().await;
}

#[tokio::test]
async fn halt_cancels_only_the_owners_thread_leases() {
    let fixture = Fixture::new(false, 0, ChatLimits::default()).await;
    let thread = fixture.routes.admit("owner", "thread", true).unwrap();
    let chat = fixture.routes.admit("owner", "chat", false).unwrap();
    let other = fixture.routes.admit("other", "other-thread", true).unwrap();
    fixture.routes.cancel_owner_threads("owner");
    assert!(thread.cancellation.is_cancelled());
    assert!(!chat.cancellation.is_cancelled());
    assert!(!other.cancellation.is_cancelled());
    drop((thread, chat, other));
    assert!(fixture.routes.active.turns.lock().unwrap().is_empty());
    fixture.finish().await;
}

#[tokio::test]
async fn halt_interrupts_running_thread_and_resume_allows_another_turn() {
    let fixture = Fixture::new(true, 1, ChatLimits::default()).await;
    fixture.auth.with_database(|db| {
        db.execute("INSERT INTO agent_threads (id,user_id,session_id,title,provider_id,status,created_at,updated_at) VALUES ('thread','owner','session','test','test','idle','now','now')", [])?;
        Ok(())
    }).await.unwrap();
    assert_eq!(
        fixture
            .post("/api/threads/thread/start")
            .json(&json!({"message":"start"}))
            .send()
            .await
            .unwrap()
            .status(),
        200
    );
    tokio::time::timeout(Duration::from_secs(5), async {
        while !fixture.factory.provider.started.load(Ordering::SeqCst) {
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .expect("provider did not start");
    assert_eq!(
        fixture
            .post("/api/agent-control/halt")
            .json(&json!({"reason":"test"}))
            .send()
            .await
            .unwrap()
            .status(),
        200
    );
    tokio::time::timeout(Duration::from_secs(5), async {
        loop {
            let status: String = fixture
                .auth
                .with_database(|db| {
                    Ok(db.query_row(
                        "SELECT status FROM agent_threads WHERE id='thread'",
                        [],
                        |row| row.get(0),
                    )?)
                })
                .await
                .unwrap();
            if status == "interrupted" {
                break;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .expect("halt did not interrupt running thread");
    tokio::time::timeout(Duration::from_secs(5), async {
        while !fixture.routes.active.turns.lock().unwrap().is_empty() {
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .expect("interrupted turn did not release its lease");
    assert_eq!(
        fixture
            .post("/api/threads/thread/resume")
            .json(&json!({}))
            .send()
            .await
            .unwrap()
            .status(),
        409
    );
    assert_eq!(
        fixture
            .post("/api/agent-control/resume")
            .json(&json!({}))
            .send()
            .await
            .unwrap()
            .status(),
        200
    );
    fixture
        .factory
        .provider
        .pause
        .store(false, Ordering::SeqCst);
    assert_eq!(
        fixture
            .post("/api/threads/thread/resume")
            .json(&json!({}))
            .send()
            .await
            .unwrap()
            .status(),
        200
    );
    tokio::time::timeout(Duration::from_secs(5), async {
        loop {
            let status: String = fixture
                .auth
                .with_database(|db| {
                    Ok(db.query_row(
                        "SELECT status FROM agent_threads WHERE id='thread'",
                        [],
                        |row| row.get(0),
                    )?)
                })
                .await
                .unwrap();
            if status == "completed" {
                break;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .expect("resumed thread did not complete");
    fixture.finish().await;
}

#[tokio::test]
async fn resume_during_halt_teardown_does_not_cancel_new_thread() {
    use crate::services::agent_control::AgentStopResult;
    let entered = Arc::new(tokio::sync::Notify::new());
    let release = Arc::new(tokio::sync::Notify::new());
    let stop: crate::routes::agent_control::StopAgents = {
        let entered = entered.clone();
        let release = release.clone();
        Arc::new(move |_| {
            let entered = entered.clone();
            let release = release.clone();
            Box::pin(async move {
                entered.notify_one();
                release.notified().await;
                Ok(AgentStopResult::Count(0.0))
            })
        })
    };
    let fixture = Fixture::with_stop_hook(true, 1, ChatLimits::default(), Some(stop)).await;
    fixture.auth.with_database(|db| {
        db.execute("INSERT INTO agent_threads (id,user_id,session_id,title,provider_id,status,created_at,updated_at) VALUES ('thread','owner','session','test','test','idle','now','now')", [])?;
        Ok(())
    }).await.unwrap();
    let old = fixture.routes.admit("owner", "old-session", true).unwrap();
    let halt = fixture.post("/api/agent-control/halt").json(&json!({}));
    let halt = tokio::spawn(async move { halt.send().await.unwrap() });
    tokio::time::timeout(Duration::from_secs(5), entered.notified())
        .await
        .expect("halt did not reach teardown");
    assert!(old.cancellation.is_cancelled());
    drop(old);
    assert_eq!(
        fixture
            .post("/api/agent-control/resume")
            .json(&json!({}))
            .send()
            .await
            .unwrap()
            .status(),
        200
    );
    assert_eq!(
        fixture
            .post("/api/threads/thread/start")
            .json(&json!({"message":"new"}))
            .send()
            .await
            .unwrap()
            .status(),
        200
    );
    tokio::time::timeout(Duration::from_secs(5), async {
        while !fixture.factory.provider.started.load(Ordering::SeqCst) {
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .expect("new thread did not start");
    release.notify_one();
    assert_eq!(halt.await.unwrap().status(), 200);
    {
        let active = fixture.routes.active.turns.lock().unwrap();
        assert!(
            !active
                .get("session")
                .expect("new thread was removed")
                .cancellation
                .is_cancelled()
        );
    }
    fixture.finish().await;
}
