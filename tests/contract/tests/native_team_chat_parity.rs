//! Native parity for the three W2 ledger components:
//!   * `packages/gateway-rust/src/routes/team_chat.rs`
//!   * `packages/gateway-rust/src/services/team_chat.rs`
//!   * `packages/gateway-rust/src/services/messenger_matrix_runtime.rs`
//!
//! WHERE THE EXPECTED VALUES COME FROM
//! -----------------------------------
//! Every expectation below is the *unmodified output of the TypeScript reference*
//! (`packages/gateway/src/...`), captured under `bun` and embedded at compile time from
//!   .jait/artifacts/gateway-rust/team-chat-w2/vectors.json
//!   .jait/artifacts/gateway-rust/team-chat-w2/vectors_runtime.json
//! The capture scripts are `probe_team_chat.ts` / `probe_matrix_runtime.ts` in the same
//! directory; they import the real TS modules and `record()` raw return values. That is the
//! same harness family the contract driver uses (`tests/contract/src/internal_driver.rs`
//! -> `drivers/internals.ts` -> `drivers/nativeteamchat.ts#dispatch`,
//! `drivers/migration-messenger.ts#dispatch`). So the assertions compare native output
//! against TS output, never against a hand-written guess.

use jait_gateway::routes::team_chat::{self as routes, AuthUser, RouteResponse};
use jait_gateway::services::messenger_matrix_runtime::{
    CryptoBackend, EncryptedRoomEvent, HistoryLookup, decrypt_messenger_event,
};
use jait_gateway::services::team_chat::{
    InMemoryDirectory, InMemorySessions, InMemoryTeamChatStore, PersonaAgentProfile,
    TeamChatService, rank_team_recipients, read_team_work, team_root,
};
use serde_json::{Value, json};

const VECTORS: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../.jait/artifacts/gateway-rust/team-chat-w2/vectors.json"
));
const RUNTIME: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../.jait/artifacts/gateway-rust/team-chat-w2/vectors_runtime.json"
));

fn vectors() -> Value {
    serde_json::from_str(VECTORS).expect("vectors.json must parse")
}

fn runtime() -> Value {
    serde_json::from_str(RUNTIME).expect("vectors_runtime.json must parse")
}

fn want<'a>(doc: &'a Value, key: &str) -> &'a Value {
    doc.get(key)
        .unwrap_or_else(|| panic!("missing captured TS vector `{key}`"))
}

/// The probes recorded either a bare value or `{status, body}` / `{thrown}` envelopes.
/// Accept both so the test stays honest about what the TS run produced.
fn check_response(label: &str, got: &RouteResponse, captured: &Value) {
    if let Some(status) = captured.get("status").and_then(Value::as_u64) {
        assert_eq!(
            u64::from(got.status),
            status,
            "{label}: status differs from TS ({captured})"
        );
        let body = captured
            .get("payload")
            .or_else(|| captured.get("body"))
            .unwrap_or_else(|| panic!("{label}: no body"));
        assert_eq!(&got.body, body, "{label}: body differs from TS");
    } else {
        assert_eq!(&got.body, captured, "{label}: body differs from TS");
    }
}

fn check_thrown(label: &str, message: &str, captured: &Value) {
    let expected = captured
        .get("thrown")
        .and_then(Value::as_str)
        .unwrap_or_else(|| panic!("{label}: captured value is not a thrown error: {captured}"));
    assert_eq!(
        format!("Error: {message}"),
        expected,
        "{label}: error text differs from TS"
    );
}

// ---------------------------------------------------------------------------
// Fixtures mirroring probe_team_chat.ts lines 20-29 (identical roster inputs).
// ---------------------------------------------------------------------------

fn agent(
    id: &str,
    name: &str,
    role: &str,
    skills: &[&str],
    reports_to: Option<&str>,
    paused: bool,
) -> PersonaAgentProfile {
    PersonaAgentProfile {
        id: id.to_string(),
        name: name.to_string(),
        role: if role.is_empty() {
            None
        } else {
            Some(role.to_string())
        },
        skill_ids: skills.iter().map(|s| s.to_string()).collect(),
        paused,
        reports_to_id: reports_to.map(str::to_string),
        avatar: None,
        provider_id: String::new(),
        model: None,
        requires_approval: false,
        uses_all_skills: false,
    }
}

fn roster() -> Vec<PersonaAgentProfile> {
    vec![
        agent("root", "Coordinator", "coordinator", &[], None, false),
        agent(
            "dev",
            "Builder",
            "developer",
            &["rust"],
            Some("root"),
            false,
        ),
        agent("qa", "Prober", "qa", &["testing"], Some("root"), false),
        agent("rev", "Critic", "reviewer", &[], Some("root"), true),
        agent("orphan", "Solo", "", &[], Some("gone"), false),
    ]
}

fn user() -> AuthUser {
    AuthUser {
        id: "u1".to_string(),
        username: "probe".to_string(),
    }
}

/// Build a service over empty in-memory adapters. `InMemoryDirectory` implements both
/// `AgentDirectory` and `ThreadWriter`, so two instances are needed to satisfy the
/// exclusive borrows the constructor takes.
struct Harness {
    store: InMemoryTeamChatStore,
    sessions: InMemorySessions,
    profiles: InMemoryDirectory,
    writer: InMemoryDirectory,
}

impl Harness {
    fn new() -> Harness {
        Harness {
            store: InMemoryTeamChatStore::default(),
            sessions: InMemorySessions::default(),
            profiles: InMemoryDirectory::default(),
            writer: InMemoryDirectory::default(),
        }
    }

    fn service(&mut self) -> TeamChatService<'_> {
        TeamChatService::new(
            &mut self.store,
            &self.sessions,
            &self.profiles,
            &mut self.writer,
        )
    }
}

// ===========================================================================
// Component 1 - routes/team_chat.rs
// ===========================================================================

/// CHECK route-1: the registered route table is exactly the TS one
/// (`packages/gateway/src/routes/team-chat.ts`).
#[test]
fn route_table_matches_typescript_registration() {
    assert_eq!(
        routes::ROUTES,
        [
            ("GET", "/api/team-rooms"),
            ("POST", "/api/team-rooms"),
            ("GET", "/api/team-rooms/:id"),
            ("POST", "/api/team-rooms/:id/messages"),
        ],
        "route table differs from TS"
    );
}

/// CHECK route-2: `GET /api/team-rooms/:id` on an unknown room -> TS 404 payload
/// (vector `route.get.missing`).
#[test]
fn route_get_missing_room_matches_typescript() {
    let v = vectors();
    let mut harness = Harness::new();
    let mut service = harness.service();
    let response = routes::get_room(&service, &user(), "no-such-room");
    check_response(
        "route.get.missing",
        &response,
        want(&v, "route.get.missing"),
    );
    // untouched room list afterwards (no side effects on a miss)
    let listed = routes::list_rooms(&service, &user());
    assert_eq!(listed.status, 200);
    assert_eq!(listed.body, json!({ "rooms": [] }));
}

/// CHECK route-3: `POST /api/team-rooms/:id/messages` with a body the TS parser rejects
/// -> 400 + TS error payload (vector `route.post.invalid`).
#[test]
fn route_post_invalid_body_matches_typescript() {
    let v = vectors();
    let mut harness = Harness::new();
    let mut service = harness.service();
    let response = routes::post_message(&mut service, &user(), "r1", &json!({}));
    check_response(
        "route.post.invalid",
        &response,
        want(&v, "route.post.invalid"),
    );
}

/// CHECK route-4: posting to a room that does not exist is a 404, and the TS status code
/// recorded for `route.post.notfound` is reproduced; the message is not persisted.
#[test]
fn route_post_unknown_room_matches_typescript() {
    let v = vectors();
    let mut harness = Harness::new();
    let mut service = harness.service();
    let body = json!({ "content": "hello", "clientKey": "probe" });
    let response = routes::post_message(&mut service, &user(), "missing", &body);
    let captured = want(&v, "route.post.notfound");
    check_response("route.post.notfound", &response, captured);
    assert_eq!(
        response.status, 400,
        "unknown room must be 400 for TS parity"
    );
}

// ===========================================================================
// Component 2 - services/team_chat.rs
// ===========================================================================

/// CHECK service-1: recipient ranking for the TS `rank.builder` scenario.
#[test]
fn service_rank_builder_matches_typescript() {
    let v = vectors();
    let ranked = rank_team_recipients("Please fix this bug in Rust", &roster(), "root", None);
    assert_eq!(
        json!(
            ranked
                .iter()
                .map(|item| json!({"id": item.id, "score":item.score}))
                .collect::<Vec<_>>()
        ),
        *want(&v, "rank.builder"),
        "rank.builder ordering/scores differ from TS"
    );
}

/// CHECK service-2: ranking is stable for the `rank.review` and `rank.rootonly` scenarios
/// (review language pulls the reviewer forward; empty text yields the root only).
#[test]
fn service_rank_review_and_rootonly_match_typescript() {
    let v = vectors();
    let review = rank_team_recipients("review the audit please", &roster(), "root", None);
    assert_eq!(
        json!(
            review
                .iter()
                .map(|item| json!({"id": item.id, "score":item.score}))
                .collect::<Vec<_>>()
        ),
        *want(&v, "rank.review"),
        "rank.review differs from TS"
    );
    let root_only = rank_team_recipients("", &roster(), "root", None);
    assert_eq!(
        json!(
            root_only
                .iter()
                .map(|item| json!({"id": item.id, "score":item.score}))
                .collect::<Vec<_>>()
        ),
        *want(&v, "rank.rootonly"),
        "rank.rootonly differs from TS"
    );
}

/// CHECK service-3: `readTeamWork` parsing - full, partial and absent payloads.
#[test]
fn service_read_team_work_matches_typescript() {
    let v = vectors();
    let full = read_team_work(Some(
        r#"{"teamWork":{"roomId":"r","agentId":"a","deliveryId":"d","messageId":"m"}}"#,
    ));
    assert_eq!(
        serde_json::to_value(&full).expect("team work serialises"),
        *want(&v, "readTeamWork.valid"),
        "readTeamWork.valid differs from TS"
    );
    let partial = read_team_work(Some(r#"{"teamWork":{"roomId":"r","agentId":"a"}}"#));
    assert_eq!(
        serde_json::to_value(&partial).expect("team work serialises"),
        *want(&v, "readTeamWork.partial"),
        "readTeamWork.partial differs from TS"
    );
    let absent = read_team_work(None);
    assert_eq!(
        serde_json::to_value(&absent).expect("team work serialises"),
        *want(&v, "readTeamWork.empty"),
        "readTeamWork.empty differs from TS"
    );
    let broken = read_team_work(Some("{not json"));
    assert_eq!(
        serde_json::to_value(&broken).expect("team work serialises"),
        *want(&v, "readTeamWork.broken"),
        "readTeamWork.broken differs from TS"
    );
}

/// CHECK service-4: escalation chain resolution and its error text.
#[test]
fn service_team_root_matches_typescript() {
    let v = vectors();
    let chain = team_root("dev", &roster()).expect("dev has a chain");
    assert_eq!(
        chain,
        want(&v, "teamRoot.chain")
            .as_str()
            .expect("teamRoot.chain is a string"),
        "teamRoot.chain differs from TS"
    );
    let orphan = team_root("orphan", &roster()).expect("orphan resolves to itself");
    assert_eq!(
        orphan,
        want(&v, "teamRoot.orphan")
            .as_str()
            .expect("teamRoot.orphan is a string"),
        "teamRoot.orphan differs from TS"
    );
    match team_root("nope", &roster()) {
        Ok(root) => panic!("unknown agent must fail like TS, got {root}"),
        Err(err) => check_thrown(
            "teamRoot.missing",
            &err.to_string(),
            want(&v, "teamRoot.missing"),
        ),
    }
}

// ===========================================================================
// Component 3 - services/messenger_matrix_runtime.rs (event mapping)
// ===========================================================================

fn no_backend() -> Option<&'static dyn CryptoBackend> {
    None
}

fn no_history() -> Option<&'static dyn HistoryLookup> {
    None
}

fn plain_event() -> Value {
    json!({
        "type": "m.room.message",
        "event_id": "$p",
        "content": { "msgtype": "m.text", "body": "hi" },
        "unsigned": { "age": 5 }
    })
}

fn plain_event_no_unsigned() -> Value {
    json!({
        "type": "m.room.message",
        "event_id": "$p2",
        "content": { "body": "x" }
    })
}

fn encrypted_event() -> Value {
    json!({
        "type": "m.room.encrypted",
        "event_id": "$e",
        "content": { "algorithm": "m.megolm.v1.aes-sha2", "ciphertext": "xx" },
        "unsigned": {}
    })
}

struct OkBackend;

impl CryptoBackend for OkBackend {
    fn decrypt_room_event(
        &self,
        _event: &EncryptedRoomEvent,
        _room_id: &str,
    ) -> Result<Value, String> {
        Ok(json!({
            "type": "m.room.message",
            "event_id": "$e",
            "content": { "msgtype": "m.text", "body": "secret" },
            "unsigned": { "age": 1 }
        }))
    }
}

struct FailingBackend;

impl CryptoBackend for FailingBackend {
    fn decrypt_room_event(
        &self,
        _event: &EncryptedRoomEvent,
        _room_id: &str,
    ) -> Result<Value, String> {
        Err("no key".to_string())
    }
}

struct HistoryOk;

impl HistoryLookup for HistoryOk {
    fn decrypt(&self, _room_id: &str, event: &EncryptedRoomEvent) -> Result<Value, String> {
        Ok(json!({
            "content": { "msgtype": "m.text", "body": "from-history" },
            "event_id": event.event().get("event_id").cloned().unwrap_or(Value::Null)
        }))
    }
}

struct HistoryFail;

impl HistoryLookup for HistoryFail {
    fn decrypt(&self, _room_id: &str, _event: &EncryptedRoomEvent) -> Result<Value, String> {
        Err("nope".to_string())
    }
}

/// CHECK matrix-1: plain (unencrypted) events pass through untouched.
#[test]
fn matrix_plain_event_passthrough_matches_typescript() {
    let v = runtime();
    let mapped = decrypt_messenger_event(no_backend(), no_history(), "!r", plain_event());
    assert_eq!(
        mapped,
        *want(&v, "event.plain"),
        "event.plain mapping differs from TS"
    );
    let mapped =
        decrypt_messenger_event(no_backend(), no_history(), "!r", plain_event_no_unsigned());
    assert_eq!(
        mapped,
        *want(&v, "event.plainNoUnsigned"),
        "event.plainNoUnsigned mapping differs from TS"
    );
}

/// CHECK matrix-2: crypto backend success is merged in with `unsigned.jaitEncrypted = true`.
#[test]
fn matrix_decrypt_success_matches_typescript() {
    let v = runtime();
    let backend = OkBackend;
    let mapped = decrypt_messenger_event(Some(&backend), no_history(), "!r", encrypted_event());
    assert_eq!(
        mapped,
        *want(&v, "event.decryptOk"),
        "event.decryptOk mapping differs from TS"
    );
}

/// CHECK matrix-3: crypto failure falls back to history, and failure of both is passthrough.
#[test]
fn matrix_failure_paths_match_typescript() {
    let v = runtime();
    let backend = FailingBackend;
    let history = HistoryOk;
    let fallback = decrypt_messenger_event(Some(&backend), Some(&history), "!r", encrypted_event());
    assert_eq!(
        fallback,
        *want(&v, "event.historyFallback"),
        "event.historyFallback mapping differs from TS"
    );

    let history_fail = HistoryFail;
    let failed =
        decrypt_messenger_event(Some(&backend), Some(&history_fail), "!r", encrypted_event());
    assert_eq!(
        failed,
        *want(&v, "event.decryptFail"),
        "event.decryptFail mapping differs from TS"
    );

    let no_hist = decrypt_messenger_event(Some(&backend), no_history(), "!r", encrypted_event());
    assert_eq!(
        no_hist,
        *want(&v, "event.decryptFailNoHistory"),
        "event.decryptFailNoHistory mapping differs from TS"
    );
}

#[test]
fn team_room_owner_is_user_authority_and_cross_owner_reads_are_denied() {
    let mut harness = Harness::new();
    harness.profiles.agents = roster();
    let mut service = harness.service();
    let response = routes::create_room(
        &mut service,
        &user(),
        &json!({"name":"Team","memberIds":["root","dev"]}),
    );
    assert_eq!(response.status, 200);
    let room = response.body["room"]["id"].as_str().unwrap();
    assert_eq!(service.owner(room).unwrap(), "u1");
    assert!(service.get("other-owner", room).is_err());
}

#[test]
fn route_optional_null_and_utf16_limits_match_zod() {
    let mut harness = Harness::new();
    let mut service = harness.service();
    for field in ["attachments", "recipientIds", "targetSessionId", "kind"] {
        let mut body = json!({"content":"hello","clientKey":"one"});
        body[field] = Value::Null;
        let response = routes::post_message(&mut service, &user(), "absent", &body);
        assert_eq!(
            response.body,
            json!({"error":"Invalid team message."}),
            "{field}"
        );
    }
    for body in [
        json!({"content":"🙂".repeat(10_001),"clientKey":"one"}),
        json!({"content":"hello","clientKey":"🙂".repeat(101)}),
    ] {
        let response = routes::post_message(&mut service, &user(), "absent", &body);
        assert_eq!(response.body, json!({"error":"Invalid team message."}));
    }
    let response = routes::create_room(
        &mut service,
        &user(),
        &json!({"agentId":"root","sourceSessionId":null}),
    );
    assert_eq!(response.body, json!({"error":"Invalid room request."}));
}

#[test]
fn route_implicit_recipient_is_ranked_and_retries_keep_original_routing() {
    let mut harness = Harness::new();
    harness.profiles.agents = roster();
    let mut service = harness.service();
    let created = routes::create_room(
        &mut service,
        &user(),
        &json!({"name":"Team","memberIds":["root","dev","qa"]}),
    );
    let room = created.body["room"]["id"].as_str().unwrap();
    let posted = routes::post_message(
        &mut service,
        &user(),
        room,
        &json!({"content":"Builder please implement this Rust bug fix","clientKey":"route-key"}),
    );
    assert_eq!(posted.status, 201, "{posted:?}");
    assert_eq!(posted.body["message"]["recipientIds"], json!(["dev"]));
    assert_eq!(
        posted.body["message"]["routingDecision"]["source"],
        "fallback"
    );
    let duplicate = routes::post_message(
        &mut service,
        &user(),
        room,
        &json!({"content":"Prober please test","clientKey":"route-key"}),
    );
    assert_eq!(posted.body, duplicate.body);
}

fn goals_vectors() -> Value {
    serde_json::from_str(include_str!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../.jait/artifacts/gateway-rust/team-chat-w2/vectors_goals.json"
    )))
    .unwrap()
}

fn goal_sender(id: &str, kind: &str) -> jait_gateway::services::team_chat::TeamSender {
    jait_gateway::services::team_chat::TeamSender {
        kind: kind.into(),
        id: id.into(),
        name: id.into(),
        avatar: None,
        source_session_id: None,
        source_thread_id: None,
    }
}

fn goal_harness() -> Harness {
    use jait_gateway::services::team_chat::{SessionRef, TeamChatStore, TeamRoom};
    let mut harness = Harness::new();
    harness.profiles.agents = roster().into_iter().take(3).collect();
    harness
        .profiles
        .persona_texts
        .insert(("u1".into(), "root".into()), "Leads the team.".into());
    harness
        .profiles
        .persona_texts
        .insert(("u1".into(), "dev".into()), "Builds fixes.".into());
    harness.store.insert_room(
        "u1",
        &TeamRoom {
            id: "r".into(),
            name: "Team".into(),
            member_ids: Some(vec!["root".into(), "dev".into(), "qa".into()]),
            root_agent_id: "root".into(),
            project_id: None,
            project_path: None,
            goal: None,
        },
    );
    harness.sessions.sessions.push(SessionRef {
        id: "source".into(),
        name: None,
        project_id: None,
        project_path: None,
    });
    harness.sessions.metadata.insert(
        ("u1".into(), "source".into()),
        json!({"teamWork":{"roomId":"r","agentId":"root","deliveryId":"d","messageId":"m"}})
            .to_string(),
    );
    harness
}

#[test]
fn goal_lifecycle_matches_live_typescript_vectors() {
    let vectors = goals_vectors();
    let mut harness = goal_harness();
    let mut service = harness.service();
    let root = goal_sender("root", "agent");
    let dev = goal_sender("dev", "agent");
    let user = goal_sender("u1", "user");
    let goal = service
        .set_goal("u1", "r", "  Ship fix  ", vec!["pass tests".into()], &root)
        .unwrap();
    assert_eq!(serde_json::to_value(goal).unwrap(), vectors["goal.set"]);
    for (key, result) in [
        (
            "goal.manageDenied",
            service.set_goal("u1", "r", "Fix", vec!["pass".into()], &dev),
        ),
        (
            "goal.empty",
            service.set_goal("u1", "r", "Fix", vec![], &root),
        ),
        (
            "goal.utf16",
            service.set_goal("u1", "r", "Fix", vec!["🙂".repeat(1001)], &root),
        ),
        (
            "goal.ownerDenied",
            service.set_goal("u2", "r", "Fix", vec!["pass".into()], &root),
        ),
    ] {
        check_thrown(key, &result.unwrap_err().to_string(), &vectors[key]);
    }
    service
        .set_goal("u1", "r", "Fix", vec!["pass".into()], &root)
        .unwrap();
    check_thrown(
        "goal.independentRequired",
        &service
            .complete_goal("u1", "r", vec!["ok".into()], &root)
            .unwrap_err()
            .to_string(),
        &vectors["goal.independentRequired"],
    );
    check_thrown(
        "goal.invalidEvidence",
        &service
            .complete_goal("u1", "r", vec!["  ".into()], &root)
            .unwrap_err()
            .to_string(),
        &vectors["goal.invalidEvidence"],
    );
    let completed = service
        .complete_goal("u1", "r", vec!["ok".into()], &user)
        .unwrap();
    assert_eq!(
        serde_json::to_value(completed).unwrap(),
        vectors["goal.userComplete"]
    );
    assert!(
        service
            .complete_goal("u1", "r", vec!["ok".into()], &user)
            .is_err()
    );
}

#[test]
fn context_matches_actual_typescript_for_leader_and_member() {
    let vectors = goals_vectors();
    let mut harness = goal_harness();
    let root = harness.profiles.agents[0].clone();
    let dev = harness.profiles.agents[1].clone();
    let mut service = harness.service();
    assert_eq!(
        service
            .context("u1", "source", Some(&root))
            .unwrap()
            .unwrap(),
        vectors["context.root"].as_str().unwrap()
    );
    assert_eq!(
        service
            .context("u1", "source", Some(&dev))
            .unwrap()
            .unwrap(),
        vectors["context.dev"].as_str().unwrap()
    );
    assert_eq!(service.context("u1", "unknown", None).unwrap(), None);
}

fn post_goal_verification(service: &mut TeamChatService<'_>, sender_id: &str, key: &str) {
    use jait_gateway::services::team_chat::PostInput;
    service
        .post(
            "u1",
            "r",
            PostInput {
                content: "Verified actual acceptance evidence.".into(),
                attachments: None,
                sender: goal_sender(sender_id, "agent"),
                kind: Some("verification".into()),
                recipient_ids: Some(vec![]),
                routing_decision: None,
                client_key: key.into(),
                parent_message_id: None,
                work_session_id: None,
                work_thread_id: None,
                target_session_id: None,
            },
        )
        .unwrap();
}

#[test]
fn coordinator_requires_fresh_independent_verification_and_preserves_failed_state() {
    let mut harness = goal_harness();
    let mut service = harness.service();
    let root = goal_sender("root", "agent");
    post_goal_verification(&mut service, "dev", "old");
    service
        .set_goal("u1", "r", "Fix", vec!["pass".into()], &root)
        .unwrap();
    assert!(
        service
            .complete_goal("u1", "r", vec!["ok".into()], &root)
            .is_err()
    );
    post_goal_verification(&mut service, "root", "self");
    assert!(
        service
            .complete_goal("u1", "r", vec!["ok".into()], &root)
            .is_err()
    );
    assert_eq!(
        service.get("u1", "r").unwrap().goal.unwrap()["status"],
        "active"
    );
    post_goal_verification(&mut service, "qa", "independent");
    let result = service
        .complete_goal("u1", "r", vec!["measured passing check".into()], &root)
        .unwrap();
    assert_eq!(result.goal.unwrap()["status"], "completed");
    assert!(service.get("u2", "r").is_err());
}
