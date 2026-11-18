//! HTTP edge-matrix contracts: agent-control auth, session message/cancel
//! surfaces, token refresh, stable JSON error bodies, repo proposals CRUD and
//! project repository node-claim assignment. Real HTTP/SQLite; project roots
//! are disposable directories carrying a plain `.git` marker and repository
//! records are metadata-only (their paths do not exist), so no git subprocess
//! completes and no provider, network call or model turn is ever invoked.
use crate::{
    client::{bounded_body, equal, string},
    scenarios::{Scenario, Suite},
};
use anyhow::{Context, Result, ensure};
use serde_json::{Value, json};
use std::fs;

fn expect_body(
    s: &Suite,
    method: &str,
    path: &str,
    token: Option<&str>,
    body: Option<Value>,
    status: u16,
    expected: Value,
) -> Result<()> {
    let response = s.gateway.api.expect(method, path, token, body, status)?;
    let actual: Value = serde_json::from_slice(&bounded_body(response)?)
        .with_context(|| format!("{method} {path}: expected a JSON body"))?;
    equal(&actual, expected, &format!("{method} {path} body"))
}

fn field(value: &Value, key: &str, expected: Value, label: &str) -> Result<()> {
    equal(&value[key], expected, label)
}

/// Disposable project root with a `.git` marker, removed again on drop.
struct TempRoot {
    path: String,
}

impl TempRoot {
    fn git() -> Result<Self> {
        Self::new(true)
    }

    fn plain() -> Result<Self> {
        Self::new(false)
    }

    fn new(git: bool) -> Result<Self> {
        let path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../.jait/artifacts/contracts/edge-projects")
            .join(uuid::Uuid::new_v4().to_string());
        fs::create_dir_all(&path)?;
        if git {
            fs::create_dir_all(path.join(".git"))?;
        }
        Ok(Self {
            path: path.display().to_string(),
        })
    }
}

impl Drop for TempRoot {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.path);
    }
}

// ── agent control ────────────────────────────────────────────────────────────

fn control_anonymous(s: &mut Suite) -> Result<()> {
    let before = s
        .gateway
        .api
        .json("GET", "/api/agent-control", Some(&s.owner), None, 200)?;
    for (method, path, body) in [
        ("GET", "/api/agent-control", None),
        ("POST", "/api/agent-control/halt", Some(json!({}))),
        ("POST", "/api/agent-control/resume", None),
    ] {
        expect_body(
            s,
            method,
            path,
            None,
            body,
            401,
            json!({"detail":"login_required"}),
        )?;
    }
    // No control action may leave a halt behind for the real owner.
    let state = s
        .gateway
        .api
        .json("GET", "/api/agent-control", Some(&s.owner), None, 200)?;
    equal(&state, before, "anonymous request changed the halt state")
}

fn control_halt_refusal(s: &mut Suite) -> Result<()> {
    let running = s
        .gateway
        .api
        .json("GET", "/api/agent-control", Some(&s.owner), None, 200)?;
    for (key, expected) in [
        ("halted", json!(false)),
        ("reason", json!(null)),
        ("haltedAt", json!(null)),
    ] {
        field(&running["state"], key, expected, "running state shape")?;
    }
    // The owner's halt switch works while work is frozen and reports teardown.
    let halted = s.gateway.api.json(
        "POST",
        "/api/agent-control/halt",
        Some(&s.owner),
        Some(json!({"reason":"contract probe"})),
        200,
    )?;
    field(&halted, "stopped", json!(0), "halt stop count")?;
    field(&halted, "stopError", json!(null), "halt stop error")?;
    let halted_state = &halted["state"];
    field(halted_state, "halted", json!(true), "halted flag")?;
    field(
        halted_state,
        "reason",
        json!("contract probe"),
        "halt reason",
    )?;
    ensure!(
        halted_state["haltedAt"].is_string() && halted_state["updatedAt"].is_string(),
        "halt timestamps must be present while halted"
    );
    equal(
        &s.gateway
            .api
            .json("GET", "/api/agent-control", Some(&s.owner), None, 200)?["state"],
        halted_state.clone(),
        "halted state persists",
    )?;
    // Refusal bodies are machine-readable and carry the stable agent_halted code.
    expect_body(
        s,
        "POST",
        "/api/threads",
        Some(&s.owner),
        Some(json!({"title":"Must not start"})),
        409,
        json!({
            "code":"agent_halted","halted":true,"reason":"contract probe",
            "haltedAt":halted_state["haltedAt"],"action":"create-thread",
            "error":"Autonomous agents are halted (contract probe). Resume agents to continue."
        }),
    )?;
    // Resume is the only path that clears the stop, and it keeps the timestamp.
    let resumed = s.gateway.api.json(
        "POST",
        "/api/agent-control/resume",
        Some(&s.owner),
        None,
        200,
    )?;
    let resumed_state = &resumed["state"];
    field(resumed_state, "halted", json!(false), "resumed flag")?;
    field(resumed_state, "reason", json!(null), "resumed reason")?;
    field(resumed_state, "haltedAt", json!(null), "resumed haltedAt")?;
    ensure!(
        resumed_state["updatedAt"].is_string(),
        "resume must record its own timestamp"
    );
    // Creating the record after resume proves dispatch is unblocked. This
    // endpoint only persists metadata; it does not start a provider session.
    let thread = s.gateway.api.json(
        "POST",
        "/api/threads",
        Some(&s.owner),
        Some(json!({"title":"Allowed after resume","providerId":"jait"})),
        201,
    )?;
    let id = string(&thread, "id")?;
    s.gateway.api.expect(
        "DELETE",
        &format!("/api/threads/{id}"),
        Some(&s.owner),
        None,
        204,
    )?;
    Ok(())
}

// ── session message and cancel surfaces ─────────────────────────────────────

fn session_message_cancel(s: &mut Suite) -> Result<()> {
    let missing = uuid::Uuid::new_v4();
    for (method, suffix, body) in [
        ("GET", "/messages", None),
        ("POST", "/cancel", Some(json!({}))),
    ] {
        let path = format!("/api/sessions/{missing}{suffix}");
        // Anonymous callers are refused on both surfaces.
        expect_body(
            s,
            method,
            &path,
            None,
            body.clone(),
            401,
            json!({"detail":"login_required"}),
        )?;
        // Missing sessions answer with the stable NOT_FOUND envelope.
        expect_body(
            s,
            method,
            &path,
            Some(&s.owner),
            body,
            404,
            json!({"error":"NOT_FOUND","details":"Session not found"}),
        )?;
    }
    let id = s.create("Edge message and cancel surfaces")?;
    let empty = s.gateway.api.json(
        "GET",
        &format!("/api/sessions/{id}/messages"),
        Some(&s.owner),
        None,
        200,
    )?;
    field(&empty, "sessionId", json!(id), "message window session")?;
    field(&empty, "streaming", json!(false), "idle streaming flag")?;
    field(&empty, "seq", json!(0), "empty window seq")?;
    field(&empty, "total", json!(0), "empty window total")?;
    field(&empty, "hasMore", json!(false), "empty window paging")?;
    field(&empty, "limit", json!(5), "default message window limit")?;
    field(&empty, "messages", json!([]), "empty message window")?;
    ensure!(
        empty["lastActiveAt"].is_string(),
        "message window must report lastActiveAt"
    );
    // Cancelling an idle session succeeds and reports that nothing was stopped.
    equal(
        &s.gateway.api.json(
            "POST",
            &format!("/api/sessions/{id}/cancel"),
            Some(&s.owner),
            Some(json!({})),
            200,
        )?,
        json!({"ok":true,"cancelled":false}),
        "idle cancel acknowledgement",
    )?;
    expect_body(
        s,
        "POST",
        &format!("/api/sessions/{id}/cancel"),
        Some(&s.owner),
        Some(json!({"queuedMessageId":"  "})),
        400,
        json!({"error":"VALIDATION_ERROR","details":"queuedMessageId must be a non-empty string"}),
    )?;
    // A foreign account cannot read messages or cancel the turn.
    expect_body(
        s,
        "GET",
        &format!("/api/sessions/{id}/messages"),
        Some(&s.member),
        None,
        404,
        json!({"error":"NOT_FOUND","details":"Session not found"}),
    )?;
    expect_body(
        s,
        "POST",
        &format!("/api/sessions/{id}/cancel"),
        Some(&s.member),
        Some(json!({})),
        404,
        json!({"error":"NOT_FOUND","details":"Session not found"}),
    )?;
    s.delete(&id)
}

// ── token refresh ───────────────────────────────────────────────────────────

fn refresh_invalid_token(s: &mut Suite) -> Result<()> {
    for token in [
        "not-a-token",
        "eyJhbGciOiJub25lIn0.eyJzdWIiOiJvd25lciJ9.",
        "garbage.token.value",
    ] {
        let response = s
            .gateway
            .api
            .expect("POST", "/api/auth/refresh", Some(token), None, 204)?;
        ensure!(
            bounded_body(response)?.is_empty(),
            "refresh with an invalid token must have an empty 204 body"
        );
    }
    // An invalid cookie session is refused the same way, without a fresh cookie.
    let response = s
        .gateway
        .api
        .cookie_request("/api/auth/refresh", "jait_token=not-a-real-session")?;
    ensure!(response.status() == 204, "cookie refresh must answer 204");
    ensure!(
        bounded_body(response)?.is_empty(),
        "cookie refresh refusal must have an empty body"
    );
    let response =
        s.gateway
            .api
            .expect("POST", "/api/auth/refresh", Some("not-a-token"), None, 204)?;
    ensure!(
        response
            .headers()
            .get(reqwest::header::SET_COOKIE)
            .is_none(),
        "refused refresh must not set an auth cookie"
    );
    // Refresh is registered for POST only; the GET probe some clients send is
    // answered by the API not-found envelope instead of a session restore.
    expect_body(
        s,
        "GET",
        "/api/auth/refresh",
        Some("not-a-token"),
        None,
        404,
        json!({"error":"Not Found"}),
    )
}

// ── stable error and acknowledgement bodies ────────────────────────────────

fn error_status_shapes(s: &mut Suite) -> Result<()> {
    // Registration refusals keep distinct statuses over their detail bodies.
    expect_body(
        s,
        "POST",
        "/api/auth/register",
        None,
        Some(json!({"username":"short","password":"tiny"})),
        400,
        json!({"detail":"password must be at least 8 characters"}),
    )?;
    expect_body(
        s,
        "POST",
        "/api/auth/register",
        None,
        Some(json!({})),
        400,
        json!({"detail":"username and password are required"}),
    )?;
    // A duplicate registration is refused even with valid credentials.
    let invitation =
        s.gateway
            .api
            .json("POST", "/api/auth/invitations", Some(&s.owner), None, 200)?;
    let duplicate = format!("edge-duplicate-{}", uuid::Uuid::new_v4());
    s.gateway.api.expect(
        "POST",
        "/api/auth/register",
        None,
        Some(json!({"username":duplicate,"password":"contract-fixture-password","invitation":invitation["invitation"]})),
        200,
    )?;
    expect_body(
        s,
        "POST",
        "/api/auth/register",
        None,
        Some(json!({"username":duplicate,"password":"contract-fixture-password"})),
        409,
        json!({"detail":"username already exists"}),
    )?;
    expect_body(
        s,
        "POST",
        "/api/auth/register",
        None,
        Some(
            json!({"username":format!("uninvited-{}",uuid::Uuid::new_v4()),"password":"contract-fixture-password"}),
        ),
        403,
        json!({"detail":"An invitation from the gateway owner is required"}),
    )?;
    // Session envelopes: default naming, validation and idempotent deletion.
    let id = s.create("Edge error bodies")?;
    let created = s.gateway.api.json(
        "POST",
        "/api/sessions",
        Some(&s.owner),
        Some(json!({})),
        201,
    )?;
    field(&created, "name", json!("New Chat"), "default session name")?;
    let default_id = string(&created, "id")?;
    expect_body(
        s,
        "PATCH",
        &format!("/api/sessions/{id}/state"),
        Some(&s.owner),
        Some(json!(["not", "an", "object"])),
        400,
        json!({"error":"VALIDATION_ERROR","details":"Body must be a JSON object of key\u{2192}value pairs"}),
    )?;
    expect_body(
        s,
        "DELETE",
        &format!("/api/sessions/{id}"),
        Some(&s.owner),
        None,
        200,
        json!({"ok":true}),
    )?;
    expect_body(
        s,
        "DELETE",
        &format!("/api/sessions/{id}"),
        Some(&s.owner),
        None,
        200,
        json!({"ok":true}),
    )?;
    let deleted = s.gateway.api.json(
        "GET",
        &format!("/api/sessions/{id}"),
        Some(&s.owner),
        None,
        200,
    )?;
    field(&deleted, "status", json!("deleted"), "soft-deleted session")?;
    expect_body(
        s,
        "DELETE",
        &format!("/api/sessions/{default_id}"),
        Some(&s.owner),
        None,
        200,
        json!({"ok":true}),
    )?;
    expect_body(
        s,
        "POST",
        "/api/auth/logout",
        Some(&s.owner),
        None,
        200,
        json!({"ok":true}),
    )
}

// ── repo proposals CRUD ─────────────────────────────────────────────────────

fn proposal_for(
    value: &Value,
    repo_id: &str,
    message: &str,
    tags: Value,
    due_date: Value,
) -> Result<String> {
    field(value, "repoId", json!(repo_id), "proposal repository")?;
    field(value, "message", json!(message), "proposal message")?;
    field(value, "status", json!("open"), "proposal default status")?;
    field(value, "dueDate", due_date, "proposal due date")?;
    field(value, "tags", tags, "proposal tags")?;
    field(value, "completedAt", json!(null), "proposal completion")?;
    field(value, "completionHistory", json!("[]"), "proposal history")?;
    field(
        value,
        "sourceThreadId",
        json!(null),
        "proposal source thread",
    )?;
    field(
        value,
        "sourceThreadTitle",
        json!(null),
        "proposal source title",
    )?;
    ensure!(
        value["id"].is_string()
            && value["userId"].is_string()
            && value["createdAt"].is_string()
            && value["updatedAt"].is_string(),
        "proposal identity fields must be present"
    );
    string(value, "id")
}

fn repo_proposal_crud(s: &mut Suite) -> Result<()> {
    // Ownership and validation refusals use plain error bodies.
    for (method, path, body, expected) in [
        (
            "GET",
            "/api/repos/missing/proposals",
            None,
            json!({"error":"Repository not found"}),
        ),
        (
            "POST",
            "/api/repos/missing/proposals",
            Some(json!({"message":"x"})),
            json!({"error":"Repository not found"}),
        ),
        (
            "PATCH",
            "/api/repo-proposals/missing",
            Some(json!({})),
            json!({"error":"Todo not found"}),
        ),
        (
            "DELETE",
            "/api/repo-proposals/missing",
            None,
            json!({"error":"Todo not found"}),
        ),
    ] {
        expect_body(s, method, path, Some(&s.owner), body, 404, expected)?;
    }
    let local_path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../.jait/artifacts/contracts/nonexistent-repositories")
        .join(uuid::Uuid::new_v4().to_string())
        .display()
        .to_string();
    let repo = s.gateway.api.json(
        "POST",
        "/api/repos",
        Some(&s.owner),
        Some(json!({"name":"Edge proposals","localPath":local_path})),
        200,
    )?;
    let repo_id = string(&repo["repo"], "id")?;
    let list_path = format!("/api/repos/{repo_id}/proposals");
    equal(
        &s.gateway
            .api
            .json("GET", &list_path, Some(&s.owner), None, 200)?,
        json!({"proposals":[]}),
        "empty proposal list",
    )?;
    expect_body(
        s,
        "POST",
        &list_path,
        Some(&s.owner),
        Some(json!({"message":"  "})),
        400,
        json!({"error":"message is required"}),
    )?;
    let created = s.gateway.api.json(
        "POST",
        &list_path,
        Some(&s.owner),
        Some(json!({"message":"Edge proposal","priority":"high","tags":["MiXeD","mixed","  "],"dueDate":"2030-01-02"})),
        201,
    )?;
    let proposal_id = proposal_for(
        &created["proposal"],
        &repo_id,
        "Edge proposal",
        json!(r#"["mixed"]"#),
        json!("2030-01-02"),
    )?;
    ensure!(
        created["proposal"]["priority"] == json!("high"),
        "proposal priority must round-trip"
    );
    ensure!(
        created["proposal"]["dueDate"] == json!("2030-01-02"),
        "proposal due date must round-trip"
    );
    // The /todos alias shares the same store with its own response key.
    let todo = s.gateway.api.json(
        "POST",
        &format!("/api/repos/{repo_id}/todos"),
        Some(&s.owner),
        Some(json!({"message":"Edge todo"})),
        201,
    )?;
    let todo_id = proposal_for(
        &todo["todo"],
        &repo_id,
        "Edge todo",
        json!(r#"[]"#),
        json!(null),
    )?;
    ensure!(
        todo_id != proposal_id,
        "proposal and todo shared one identity"
    );
    // Valid updates move through the /jait-todos alias and keep history.
    let patched = s.gateway.api.json(
        "PATCH",
        &format!("/api/jait-todos/{todo_id}"),
        Some(&s.owner),
        Some(json!({"status":"done"})),
        200,
    )?;
    field(
        &patched["todo"],
        "status",
        json!("done"),
        "todo status update",
    )?;
    ensure!(
        patched["todo"]["completedAt"].is_string(),
        "completed todo must record completedAt"
    );
    let done = patched["todo"]["completionHistory"]
        .as_str()
        .context("completion history must be a JSON string")?;
    let history: Value = serde_json::from_str(done)?;
    ensure!(
        history[0]["previousStatus"] == json!("open") && history[0]["completedAt"].is_string(),
        "completion history must record the previous status"
    );
    let renamed = s.gateway.api.json(
        "PATCH",
        &format!("/api/repo-proposals/{proposal_id}"),
        Some(&s.owner),
        Some(json!({"message":"Edge proposal renamed","tags":["one","one","TWO"]})),
        200,
    )?;
    proposal_for(
        &renamed["proposal"],
        &repo_id,
        "Edge proposal renamed",
        json!(r#"["one","two"]"#),
        json!("2030-01-02"),
    )?;
    for (body, expected) in [
        (
            json!({"message":""}),
            json!({"error":"message must not be empty"}),
        ),
        (json!({"status":"bogus"}), json!({"error":"invalid status"})),
        (
            json!({"priority":"urgent"}),
            json!({"error":"invalid priority"}),
        ),
    ] {
        expect_body(
            s,
            "PATCH",
            &format!("/api/repo-proposals/{proposal_id}"),
            Some(&s.owner),
            Some(body),
            400,
            expected,
        )?;
    }
    // Foreign accounts see the repository and its proposals as absent.
    expect_body(
        s,
        "GET",
        &list_path,
        Some(&s.member),
        None,
        404,
        json!({"error":"Repository not found"}),
    )?;
    for (method, path, body) in [
        (
            "PATCH",
            format!("/api/repo-proposals/{proposal_id}"),
            Some(json!({"message":"intrusion"})),
        ),
        ("DELETE", format!("/api/repo-proposals/{proposal_id}"), None),
    ] {
        expect_body(
            s,
            method,
            &path,
            Some(&s.member),
            body,
            404,
            json!({"error":"Todo not found"}),
        )?;
    }
    equal(
        &s.gateway.api.json(
            "DELETE",
            &format!("/api/repo-proposals/{proposal_id}"),
            Some(&s.owner),
            None,
            200,
        )?,
        json!({"ok":true}),
        "proposal deletion",
    )?;
    let remaining = s
        .gateway
        .api
        .json("GET", &list_path, Some(&s.owner), None, 200)?;
    let rows = remaining["proposals"]
        .as_array()
        .context("proposals array missing")?;
    ensure!(
        rows.len() == 1 && rows[0]["id"] == json!(todo_id),
        "deletion must leave exactly the other proposal"
    );
    // Generation is provider-backed; without a configured provider the
    // refusals themselves are the stable contract.
    expect_body(
        s,
        "POST",
        &format!("/api/repos/{repo_id}/todos/generate"),
        Some(&s.owner),
        Some(json!({"provider":"contract-bogus-provider"})),
        400,
        json!({"error":"Unknown provider: contract-bogus-provider"}),
    )?;
    let failed = s.gateway.api.expect(
        "POST",
        &format!("/api/repos/{repo_id}/todos/generate"),
        Some(&s.owner),
        Some(json!({})),
        500,
    )?;
    let body: Value = serde_json::from_slice(&bounded_body(failed)?)?;
    ensure!(
        body["error"]
            .as_str()
            .is_some_and(|error| error.starts_with("Todo generation failed: ")),
        "generation failure must carry the Todo generation failed prefix"
    );
    equal(
        &s.gateway.api.json(
            "DELETE",
            &format!("/api/repos/{repo_id}"),
            Some(&s.owner),
            None,
            200,
        )?,
        json!({"ok":true}),
        "proposal repository cleanup",
    )
}

// ── project repository node claims ─────────────────────────────────────────

fn repository_id(project: &Value) -> Result<String> {
    let metadata: Value = serde_json::from_str(
        project["metadata"]
            .as_str()
            .context("project metadata must be a JSON string")?,
    )?;
    string(&metadata, "repositoryId")
}

fn project_node_claims(s: &mut Suite) -> Result<()> {
    // A node-scoped request for a node this account cannot reach is refused.
    s.gateway.api.expect(
        "POST",
        "/api/projects",
        Some(&s.owner),
        Some(json!({"title":"Refused node project","nodeId":"contract-missing-node","rootPath":std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../.jait/artifacts/contracts/nonexistent-root")})),
        404,
    )?;
    let fresh = s
        .gateway
        .api
        .json("GET", "/api/projects", Some(&s.owner), None, 200)?;
    ensure!(
        fresh["projects"].is_array() && fresh["hasMore"] == json!(false),
        "project list envelope changed"
    );
    let git_root = TempRoot::git()?;
    let plain_root = TempRoot::plain()?;
    // Creating a project over a folder with a .git marker claims a repository.
    let created = s.gateway.api.json(
        "POST",
        "/api/projects",
        Some(&s.owner),
        Some(json!({"title":"Edge claim project","rootPath":git_root.path})),
        201,
    )?;
    let project_id = string(&created, "id")?;
    field(&created, "nodeId", json!("gateway"), "project node")?;
    field(&created, "rootPath", json!(git_root.path), "project root")?;
    field(
        &created,
        "rootPathStatus",
        json!("available"),
        "project root status",
    )?;
    ensure!(
        created["metadata"].is_string() && created["editorModeActive"] == json!(false),
        "project must report claim metadata and editor state"
    );
    let repo_id = repository_id(&created)?;
    let claim_path = format!("/api/projects/{project_id}/repository");
    let assignment =
        s.gateway
            .api
            .json("POST", &claim_path, Some(&s.owner), Some(json!({})), 200)?;
    for (key, expected) in [
        ("assigned", json!(false)),
        ("skipped", json!(true)),
        ("created", json!(false)),
    ] {
        field(&assignment, key, expected, "idempotent claim flags")?;
    }
    field(
        &assignment["repo"],
        "id",
        json!(repo_id),
        "claimed repository",
    )?;
    field(
        &assignment["repo"],
        "localPath",
        json!(git_root.path),
        "claimed repository path",
    )?;
    field(
        &assignment["repo"],
        "deviceId",
        json!(null),
        "gateway claim is not node-owned",
    )?;
    equal(
        &assignment["project"]["metadata"],
        created["metadata"].clone(),
        "stable claim metadata",
    )?;
    // A repository record staking a node claim on a gateway path is reclaimed
    // for the gateway when the project is assigned again.
    s.gateway.api.expect(
        "DELETE",
        &format!("/api/repos/{repo_id}"),
        Some(&s.owner),
        None,
        200,
    )?;
    let stale = s.gateway.api.json(
        "POST",
        "/api/repos",
        Some(&s.owner),
        Some(json!({"name":"Stale node claim","localPath":git_root.path,"deviceId":"base-node"})),
        200,
    )?;
    field(
        &stale["repo"],
        "deviceId",
        json!("base-node"),
        "stale node claim",
    )?;
    let stale_id = string(&stale["repo"], "id")?;
    let repaired = s
        .gateway
        .api
        .json("POST", &claim_path, Some(&s.owner), Some(json!({})), 200)?;
    field(&repaired, "assigned", json!(true), "reclaimed repository")?;
    field(&repaired, "skipped", json!(false), "reclaim is not a skip")?;
    field(
        &repaired,
        "created",
        json!(false),
        "reclaim reuses the record",
    )?;
    field(
        &repaired["repo"],
        "id",
        json!(stale_id),
        "reclaimed repository identity",
    )?;
    field(
        &repaired["repo"],
        "deviceId",
        json!(null),
        "stale node claim must be cleared",
    )?;
    // Claim refusals carry their machine-readable assignment codes.
    let plain = s.gateway.api.json(
        "POST",
        "/api/projects",
        Some(&s.owner),
        Some(json!({"title":"Edge plain folder","rootPath":plain_root.path})),
        201,
    )?;
    let plain_id = string(&plain, "id")?;
    let folder = s.gateway.api.json(
        "POST",
        "/api/projects",
        Some(&s.owner),
        Some(json!({"title":"Edge folder"})),
        201,
    )?;
    let folder_id = string(&folder, "id")?;
    for (project, expected) in [
        (
            plain_id.as_str(),
            json!({"error":"PROJECT_NOT_GIT","details":"Project folder does not contain .git."}),
        ),
        (
            folder_id.as_str(),
            json!({"error":"PROJECT_HAS_NO_ROOT","details":"Project has no folder path."}),
        ),
    ] {
        expect_body(
            s,
            "POST",
            &format!("/api/projects/{project}/repository"),
            Some(&s.owner),
            Some(json!({})),
            400,
            expected,
        )?;
    }
    expect_body(
        s,
        "POST",
        &format!("/api/projects/{}/repository", uuid::Uuid::new_v4()),
        Some(&s.owner),
        Some(json!({})),
        404,
        json!({"error":"PROJECT_NOT_FOUND","details":"Project not found."}),
    )?;
    let foreign_path = format!("{}-foreign", git_root.path);
    let foreign = s.gateway.api.json(
        "POST",
        "/api/repos",
        Some(&s.member),
        Some(json!({"name":"Member repository","localPath":foreign_path})),
        200,
    )?;
    let foreign_id = string(&foreign["repo"], "id")?;
    expect_body(
        s,
        "POST",
        &claim_path,
        Some(&s.owner),
        Some(json!({"repoId":foreign_id})),
        404,
        json!({"error":"REPOSITORY_NOT_FOUND","details":"Repository not found."}),
    )?;
    // Cleanup: remove repository records, archive and purge the projects.
    for (repo, owner) in [(&stale_id, &s.owner), (&foreign_id, &s.member)] {
        s.gateway.api.expect(
            "DELETE",
            &format!("/api/repos/{repo}"),
            Some(owner),
            None,
            200,
        )?;
    }
    for project in [&project_id, &plain_id, &folder_id] {
        s.gateway.api.expect(
            "DELETE",
            &format!("/api/projects/{project}"),
            Some(&s.owner),
            None,
            204,
        )?;
    }
    s.gateway.api.expect(
        "DELETE",
        "/api/projects/archived",
        Some(&s.owner),
        None,
        200,
    )?;
    for status in ["active", "archived"] {
        let list = s.gateway.api.json(
            "GET",
            &format!("/api/projects?status={status}"),
            Some(&s.owner),
            None,
            200,
        )?;
        let projects = list["projects"]
            .as_array()
            .context("project list needs a projects array")?;
        for project in [&project_id, &plain_id, &folder_id] {
            ensure!(
                !projects.iter().any(|row| row["id"] == *project),
                "deleted project remains in the {status} list"
            );
        }
    }
    Ok(())
}

fn control_validation(s: &mut Suite) -> Result<()> {
    let before = s
        .gateway
        .api
        .json("GET", "/api/agent-control", Some(&s.owner), None, 200)?;
    for reason in [json!("x".repeat(501)), json!(17), json!(null), json!([])] {
        expect_body(
            s,
            "POST",
            "/api/agent-control/halt",
            Some(&s.owner),
            Some(json!({"reason":reason})),
            400,
            json!({"error":"Invalid halt request"}),
        )?;
        equal(
            &s.gateway
                .api
                .json("GET", "/api/agent-control", Some(&s.owner), None, 200)?,
            before.clone(),
            "invalid halt changed control state",
        )?;
    }
    Ok(())
}

fn control_owner_isolation(s: &mut Suite) -> Result<()> {
    let member_before =
        s.gateway
            .api
            .json("GET", "/api/agent-control", Some(&s.member), None, 200)?;
    let first = s.gateway.api.json(
        "POST",
        "/api/agent-control/halt",
        Some(&s.owner),
        Some(json!({"reason":"  incident  "})),
        200,
    )?;
    field(
        &first["state"],
        "reason",
        json!("incident"),
        "trimmed halt reason",
    )?;
    let repeated = s.gateway.api.json(
        "POST",
        "/api/agent-control/halt",
        Some(&s.owner),
        Some(json!({"reason":"second thought"})),
        200,
    )?;
    equal(
        &repeated["state"]["haltedAt"],
        first["state"]["haltedAt"].clone(),
        "repeated halt reset incident timestamp",
    )?;
    field(
        &repeated["state"],
        "reason",
        json!("second thought"),
        "repeated halt reason",
    )?;
    equal(
        &s.gateway
            .api
            .json("GET", "/api/agent-control", Some(&s.member), None, 200)?,
        member_before,
        "owner halt changed member control state",
    )?;
    s.gateway.api.json(
        "POST",
        "/api/agent-control/resume",
        Some(&s.member),
        None,
        200,
    )?;
    equal(
        &s.gateway
            .api
            .json("GET", "/api/agent-control", Some(&s.owner), None, 200)?["state"],
        repeated["state"].clone(),
        "member resume cleared owner halt",
    )?;
    let resumed = s.gateway.api.json(
        "POST",
        "/api/agent-control/resume",
        Some(&s.owner),
        None,
        200,
    )?;
    field(&resumed["state"], "halted", json!(false), "owner resume")?;
    field(
        &resumed["state"],
        "reason",
        json!(null),
        "resume cleared reason",
    )?;
    field(
        &resumed["state"],
        "haltedAt",
        json!(null),
        "resume cleared incident timestamp",
    )
}

fn refresh_valid_bearer(s: &mut Suite) -> Result<()> {
    let identity = s
        .gateway
        .api
        .json("GET", "/api/auth/me", Some(&s.owner), None, 200)?;
    let response = s
        .gateway
        .api
        .expect("POST", "/api/auth/refresh", Some(&s.owner), None, 200)?;
    let cookie = response
        .headers()
        .get(reqwest::header::SET_COOKIE)
        .context("bearer refresh must issue cookie")?
        .to_str()?
        .to_owned();
    ensure!(
        cookie.starts_with("jait_token=") && cookie.to_ascii_lowercase().contains("httponly"),
        "bearer refresh must issue HttpOnly jait_token cookie"
    );
    let refreshed: Value = serde_json::from_slice(&bounded_body(response)?)?;
    equal(
        &refreshed["user"],
        json!({"id":s.owner_id,"username":identity["username"]}),
        "bearer refresh response identity",
    )?;
    let token = string(&refreshed, "access_token")?;
    equal(
        &s.gateway
            .api
            .json("GET", "/api/auth/me", Some(&token), None, 200)?["id"],
        json!(s.owner_id),
        "refreshed bearer identity",
    )?;
    let cookie_session = s.gateway.api.cookie_request(
        "/api/auth/refresh",
        cookie.split(';').next().context("cookie pair missing")?,
    )?;
    ensure!(
        cookie_session.status() == 200,
        "issued refresh cookie must authenticate"
    );
    let cookie_json: Value = serde_json::from_slice(&bounded_body(cookie_session)?)?;
    equal(
        &cookie_json["user"],
        refreshed["user"].clone(),
        "issued cookie identity",
    )?;
    let missing = s
        .gateway
        .api
        .expect("POST", "/api/auth/refresh", None, None, 204)?;
    ensure!(
        bounded_body(missing)?.is_empty(),
        "missing refresh session must have empty body"
    );
    Ok(())
}

fn proposal_history(s: &mut Suite) -> Result<()> {
    let local_path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../.jait/artifacts/contracts/nonexistent-repositories")
        .join(uuid::Uuid::new_v4().to_string());
    let repo = s.gateway.api.json(
        "POST",
        "/api/repos",
        Some(&s.owner),
        Some(json!({"name":"Proposal history contracts","localPath":local_path})),
        200,
    )?;
    let repo_id = string(&repo["repo"], "id")?;
    let path = format!("/api/repos/{repo_id}/proposals");
    let first = s.gateway.api.json(
        "POST",
        &path,
        Some(&s.owner),
        Some(json!({"message":"First follow-up"})),
        201,
    )?;
    let first_id = string(&first["proposal"], "id")?;
    let second = s.gateway.api.json("POST", &path, Some(&s.owner), Some(json!({
        "message":"Second follow-up","priority":"high","dueDate":"2030-05-12","tags":["ui","todo"],
        "sourceThreadId":"contract-origin-thread","sourceThreadTitle":"Thread Two"
    })), 201)?;
    let second_id = string(&second["proposal"], "id")?;
    let list = s
        .gateway
        .api
        .json("GET", &path, Some(&s.owner), None, 200)?;
    let rows = list["proposals"]
        .as_array()
        .context("proposals array missing")?;
    ensure!(rows.len() == 2, "expected two persisted proposals");
    equal(
        &rows[0],
        second["proposal"].clone(),
        "newest proposal ordering and metadata",
    )?;
    equal(
        &rows[1],
        first["proposal"].clone(),
        "oldest proposal ordering",
    )?;
    for (key, value) in [
        ("sourceThreadTitle", json!("Thread Two")),
        ("sourceThreadId", json!("contract-origin-thread")),
        ("priority", json!("high")),
        ("dueDate", json!("2030-05-12")),
        ("tags", json!(r#"["ui","todo"]"#)),
        ("completedAt", json!(null)),
        ("completionHistory", json!("[]")),
    ] {
        field(&rows[0], key, value, "persisted proposal metadata")?;
    }
    let item = format!("/api/repo-proposals/{first_id}");
    let updated = s.gateway.api.json("PATCH", &item, Some(&s.owner), Some(json!({
        "message":"Updated prompt","status":"in_progress","priority":"low","dueDate":"2030-05-20","tags":["cleanup"]
    })), 200)?;
    for (key, value) in [
        ("message", json!("Updated prompt")),
        ("status", json!("in_progress")),
        ("priority", json!("low")),
        ("dueDate", json!("2030-05-20")),
        ("tags", json!(r#"["cleanup"]"#)),
        ("completedAt", json!(null)),
    ] {
        field(&updated["proposal"], key, value, "proposal update")?;
    }
    let completed = s.gateway.api.json(
        "PATCH",
        &item,
        Some(&s.owner),
        Some(json!({"status":"done"})),
        200,
    )?;
    ensure!(
        completed["proposal"]["completedAt"].is_string(),
        "completion timestamp missing"
    );
    let history: Value = serde_json::from_str(
        completed["proposal"]["completionHistory"]
            .as_str()
            .context("completion history missing")?,
    )?;
    equal(
        &history,
        json!([{"completedAt":completed["proposal"]["completedAt"],"previousStatus":"in_progress"}]),
        "completion history transition",
    )?;
    let reopened = s.gateway.api.json(
        "PATCH",
        &item,
        Some(&s.owner),
        Some(json!({"status":"open"})),
        200,
    )?;
    field(
        &reopened["proposal"],
        "completedAt",
        json!(null),
        "reopen clears completion",
    )?;
    equal(
        &reopened["proposal"]["completionHistory"],
        completed["proposal"]["completionHistory"].clone(),
        "reopen retains completion history",
    )?;
    let done = s.gateway.api.json(
        "POST",
        &path,
        Some(&s.owner),
        Some(json!({"message":"Already finished","status":"done"})),
        201,
    )?;
    ensure!(
        done["proposal"]["completedAt"].is_string(),
        "created-done timestamp missing"
    );
    let done_history: Value = serde_json::from_str(
        done["proposal"]["completionHistory"]
            .as_str()
            .context("created-done history missing")?,
    )?;
    equal(
        &done_history,
        json!([{"completedAt":done["proposal"]["completedAt"],"previousStatus":null}]),
        "created-done initial history",
    )?;
    let done_id = string(&done["proposal"], "id")?;
    // Rejected foreign updates must leave all persisted fields unchanged.
    let before = s
        .gateway
        .api
        .json("GET", &path, Some(&s.owner), None, 200)?;
    for (method, body) in [("PATCH", Some(json!({"status":"done"}))), ("DELETE", None)] {
        expect_body(
            s,
            method,
            &item,
            Some(&s.member),
            body,
            404,
            json!({"error":"Todo not found"}),
        )?;
    }
    equal(
        &s.gateway
            .api
            .json("GET", &path, Some(&s.owner), None, 200)?,
        before,
        "foreign mutation changed proposal history",
    )?;
    for id in [&first_id, &second_id, &done_id] {
        s.gateway.api.expect(
            "DELETE",
            &format!("/api/repo-proposals/{id}"),
            Some(&s.owner),
            None,
            200,
        )?;
    }
    equal(
        &s.gateway
            .api
            .json("GET", &path, Some(&s.owner), None, 200)?,
        json!({"proposals":[]}),
        "proposal deletion must remove stored rows",
    )?;
    s.gateway.api.expect(
        "DELETE",
        &format!("/api/repos/{repo_id}"),
        Some(&s.owner),
        None,
        200,
    )?;
    Ok(())
}

pub const CASES: &[Scenario] = &[
    ("edge.control-invalid-halt-unchanged", control_validation),
    ("edge.control-owner-isolation", control_owner_isolation),
    ("edge.refresh-valid-bearer", refresh_valid_bearer),
    ("edge.repo-proposal-history", proposal_history),
    ("edge.control-anonymous-denied", control_anonymous),
    ("edge.control-halt-refusal-body", control_halt_refusal),
    ("edge.session-message-cancel-auth", session_message_cancel),
    ("edge.refresh-invalid-token", refresh_invalid_token),
    ("edge.error-body-shapes", error_status_shapes),
    ("edge.repo-proposal-crud", repo_proposal_crud),
    ("edge.project-node-claims", project_node_claims),
];
