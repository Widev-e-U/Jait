use super::*;
use crate::{
    db,
    providers::openai_stream::{ParsedStream, StreamFailure},
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
}
impl ChatFactory for TestFactory {
    fn prepare(
        &self,
        user: AuthUser,
        session: SessionRecord,
    ) -> BoxFuture<'_, Result<PreparedChat, String>> {
        assert_eq!(user.id, "owner");
        assert_eq!(session.user_id.as_deref(), Some("owner"));
        self.calls.fetch_add(1, Ordering::SeqCst);
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
                burst,
                retain: AtomicBool::new(false),
                retained: Mutex::new(None),
            }),
            calls: AtomicUsize::new(0),
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
        let router = routes.router();
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
async fn request_limits_and_execution_configuration_fields_are_rejected() {
    let limits = ChatLimits {
        body_bytes: 1024,
        ..ChatLimits::default()
    };
    let fixture = Fixture::new(false, 1, limits).await;
    for field in [
        "runtimeMode",
        "projectRoot",
        "provider",
        "openaiBaseUrl",
        "userId",
    ] {
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
async fn same_session_is_rejected_and_owner_cancel_persists_partial_then_releases() {
    let fixture = Fixture::new(true, 1, ChatLimits::default()).await;
    let mut first = fixture
        .post("/api/chat")
        .json(&json!({"sessionId":"session","content":"hi"}))
        .send()
        .await
        .unwrap();
    first.chunk().await.unwrap().unwrap();
    assert_eq!(
        fixture
            .post("/api/chat")
            .json(&json!({"sessionId":"session","content":"again"}))
            .send()
            .await
            .unwrap()
            .status(),
        409
    );
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
    fixture
        .factory
        .provider
        .pause
        .store(false, Ordering::SeqCst);
    let next = fixture
        .post("/api/chat")
        .json(&json!({"sessionId":"session","content":"again"}))
        .send()
        .await
        .unwrap();
    assert_eq!(next.status(), 200);
    assert!(next.text().await.unwrap().contains("\"type\":\"done\""));
    fixture.finish().await;
}
#[tokio::test]
async fn disconnected_http_consumer_cancels_and_drains_durable_partial_turn() {
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
async fn full_consumer_channel_has_a_bounded_wait_and_cancels() {
    let (sender, _receiver) = mpsc::channel(1);
    let cancellation = ProcessCancellation::default();
    let sink = event_sink(sender, cancellation.clone(), ChatLimits::default());
    sink(json!({"type":"token","content":"one"})).await.unwrap();
    assert!(sink(json!({"type":"token","content":"two"})).await.is_err());
    assert!(cancellation.is_cancelled());
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
    let durable = fixture.events().await;
    assert!(
        durable.len() >= 2,
        "a completed turn persists user and assistant events"
    );

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
        (1..=durable.len() as i64).collect::<Vec<_>>(),
        "replay must reproduce the durable sequence from the start"
    );
    let payloads = frame_payloads(&body);
    assert_eq!(payloads.len(), durable.len());
    assert!(payloads.iter().all(|payload| payload.get("type").is_some()));
    fixture.finish().await;
}

#[tokio::test]
async fn stream_resumes_after_last_event_id() {
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
        .get("/api/sessions/session/stream")
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
    // Dropping it after headers cancels this development turn, potentially before
    // the first append; that tests cancellation rather than live delivery.
    let turn = fixture
        .post("/api/chat")
        .json(&json!({"session_id":"session","message":"hi"}))
        .send()
        .await
        .unwrap();
    assert_eq!(turn.status(), 200);
    let body = read_frames(stream, 1).await;
    let payloads = frame_payloads(&body);
    assert!(
        !payloads.is_empty(),
        "a subscriber attached before the turn must receive live frames"
    );
    assert_eq!(payloads[0]["type"], "user");
    assert!(
        !frame_ids(&body).is_empty(),
        "live frames carry their log id"
    );
    drop(turn);
    fixture.finish().await;
}
