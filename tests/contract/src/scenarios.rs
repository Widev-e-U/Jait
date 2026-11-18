use crate::{
    client::{Api, bounded_body, equal, string},
    fixture::Gateway,
    sse,
};
use anyhow::{Context, Result, ensure};
use serde_json::{Value, json};
use std::collections::HashSet;

const PASSWORD: &str = "contract-fixture-password";
pub type Scenario = (&'static str, fn(&mut Suite) -> Result<()>);

pub struct Suite {
    pub gateway: Gateway,
    pub owner: String,
    pub member: String,
    owner_name: String,
    member_name: String,
    pub owner_id: String,
}

impl Suite {
    pub fn new(gateway: Gateway) -> Result<Self> {
        let suffix = uuid::Uuid::new_v4();
        let owner_name = format!("contract-owner-{suffix}");
        let member_name = format!("contract-member-{suffix}");
        let owner = gateway
            .api
            .json(
                "POST",
                "/api/auth/register",
                None,
                Some(json!({"username":owner_name,"password":PASSWORD})),
                200,
            )
            .context("bootstrap requires a fresh, disposable backend with no existing users")?;
        let owner_id = string(&owner["user"], "id")?;
        let token = string(&owner, "access_token")?;
        let invitation =
            gateway
                .api
                .json("POST", "/api/auth/invitations", Some(&token), None, 200)?;
        let member = gateway.api.json("POST", "/api/auth/register", None,
            Some(json!({"username":member_name,"password":PASSWORD,"invitation":string(&invitation,"invitation")?})),200)?;
        Ok(Self {
            gateway,
            owner: token,
            member: string(&member, "access_token")?,
            owner_name,
            member_name,
            owner_id,
        })
    }

    pub fn create(&self, name: &str) -> Result<String> {
        let session = self.gateway.api.json(
            "POST",
            "/api/sessions",
            Some(&self.owner),
            Some(json!({"name":name})),
            201,
        )?;
        equal(&session["name"], json!(name), "created name")?;
        equal(&session["status"], json!("active"), "created status")?;
        string(&session, "id")
    }

    pub fn delete(&self, id: &str) -> Result<()> {
        let response = self.gateway.api.json(
            "DELETE",
            &format!("/api/sessions/{id}"),
            Some(&self.owner),
            None,
            200,
        )?;
        equal(&response["ok"], json!(true), "delete acknowledgement")
    }
}

fn listed(api: &Api, token: &str, query: &str, id: &str) -> Result<bool> {
    let list = api.json(
        "GET",
        &format!("/api/sessions{query}"),
        Some(token),
        None,
        200,
    )?;
    let sessions = list["sessions"]
        .as_array()
        .context("session list needs a sessions array")?;
    Ok(sessions.iter().any(|session| session["id"] == id))
}

fn anonymous(s: &mut Suite) -> Result<()> {
    for path in [
        "/api/auth/me",
        "/api/sessions",
        "/api/jobs",
        "/api/repos",
        "/api/reminders",
    ] {
        s.gateway.api.expect("GET", path, None, None, 401)?;
    }
    s.gateway.api.expect(
        "POST",
        "/api/sessions",
        None,
        Some(json!({"name":"unauthorized"})),
        401,
    )?;
    s.gateway.api.expect(
        "POST",
        "/api/chat",
        None,
        Some(json!({"content":"must not run"})),
        401,
    )?;
    Ok(())
}

fn invalid_tokens(s: &mut Suite) -> Result<()> {
    for token in ["not-a-token", "eyJhbGciOiJub25lIn0.eyJzdWIiOiJvd25lciJ9."] {
        s.gateway
            .api
            .expect("GET", "/api/auth/me", Some(token), None, 401)?;
        s.gateway
            .api
            .expect("GET", "/api/sessions", Some(token), None, 401)?;
    }
    Ok(())
}

fn registration(s: &mut Suite) -> Result<()> {
    for body in [json!({}), json!({"username":"short","password":"tiny"})] {
        s.gateway
            .api
            .expect("POST", "/api/auth/register", None, Some(body), 400)?;
    }
    s.gateway.api.expect(
        "POST",
        "/api/auth/register",
        None,
        Some(json!({"username":format!("uninvited-{}",uuid::Uuid::new_v4()),"password":PASSWORD})),
        403,
    )?;
    s.gateway.api.expect(
        "POST",
        "/api/auth/register",
        None,
        Some(json!({"username":s.owner_name,"password":PASSWORD})),
        409,
    )?;
    Ok(())
}

fn login(s: &mut Suite) -> Result<()> {
    s.gateway.api.expect(
        "POST",
        "/api/auth/login",
        None,
        Some(json!({"username":s.owner_name,"password":"incorrect-password"})),
        401,
    )?;
    s.gateway
        .api
        .expect("POST", "/api/auth/login", None, Some(json!({})), 400)?;
    let login = s.gateway.api.json(
        "POST",
        "/api/auth/login",
        None,
        Some(json!({"username":s.owner_name,"password":PASSWORD})),
        200,
    )?;
    let me = s.gateway.api.json(
        "GET",
        "/api/auth/me",
        Some(&string(&login, "access_token")?),
        None,
        200,
    )?;
    equal(&me["id"], json!(s.owner_id), "login identity")?;
    equal(&me["username"], json!(s.owner_name), "login username")
}

fn invitations(s: &mut Suite) -> Result<()> {
    s.gateway
        .api
        .expect("POST", "/api/auth/invitations", None, None, 401)?;
    s.gateway
        .api
        .expect("POST", "/api/auth/invitations", Some(&s.member), None, 403)?;
    let invitation =
        s.gateway
            .api
            .json("POST", "/api/auth/invitations", Some(&s.owner), None, 200)?;
    let code = string(&invitation, "invitation")?;
    for (suffix, status) in [("first", 200), ("reused", 403)] {
        s.gateway.api.expect("POST","/api/auth/register",None,
            Some(json!({"username":format!("{suffix}-{}",uuid::Uuid::new_v4()),"password":PASSWORD,"invitation":code})),status)?;
    }
    Ok(())
}

fn cookies(s: &mut Suite) -> Result<()> {
    let login = s.gateway.api.expect(
        "POST",
        "/api/auth/login",
        None,
        Some(json!({"username":s.owner_name,"password":PASSWORD})),
        200,
    )?;
    let header = login
        .headers()
        .get(reqwest::header::SET_COOKIE)
        .context("login must set auth cookie")?
        .to_str()?;
    ensure!(header.contains("HttpOnly"), "auth cookie must be HttpOnly");
    let cookie = header.split(';').next().context("empty auth cookie")?;
    ensure!(
        cookie.starts_with("jait_token="),
        "auth cookie name changed"
    );
    let refresh = s.gateway.api.cookie_request("/api/auth/refresh", cookie)?;
    ensure!(refresh.status() == 200, "cookie refresh must authenticate");
    let refreshed: Value = serde_json::from_slice(&bounded_body(refresh)?)?;
    let me = s.gateway.api.json(
        "GET",
        "/api/auth/me",
        Some(&string(&refreshed, "access_token")?),
        None,
        200,
    )?;
    equal(&me["id"], json!(s.owner_id), "cookie identity")?;
    s.gateway
        .api
        .expect("POST", "/api/auth/refresh", None, None, 204)?;
    let logout = s.gateway.api.cookie_request("/api/auth/logout", cookie)?;
    ensure!(logout.status() == 200, "logout must succeed");
    let cleared = logout
        .headers()
        .get(reqwest::header::SET_COOKIE)
        .context("logout must clear cookie")?
        .to_str()?
        .to_ascii_lowercase();
    ensure!(
        cleared.starts_with("jait_token=") && cleared.contains("max-age=0"),
        "logout must expire auth cookie"
    );
    Ok(())
}

fn lifecycle(s: &mut Suite) -> Result<()> {
    let id = s.create("Home network investigation")?;
    let path = format!("/api/sessions/{id}");
    let name = "Router investigation — café 🔒";
    s.gateway.api.json(
        "PATCH",
        &path,
        Some(&s.owner),
        Some(json!({"name":name})),
        200,
    )?;
    let fresh = Api::new(&s.gateway.api.base)?;
    let read = fresh.json("GET", &path, Some(&s.owner), None, 200)?;
    equal(&read["name"], json!(name), "renamed session")?;
    ensure!(
        listed(&fresh, &s.owner, "?status=active", &id)?,
        "active list omitted session"
    );
    let archived = fresh.json(
        "POST",
        &format!("{path}/archive"),
        Some(&s.owner),
        None,
        200,
    )?;
    equal(&archived["status"], json!("archived"), "archive status")?;
    ensure!(
        !listed(&fresh, &s.owner, "?status=active", &id)?,
        "archived session remains active"
    );
    s.delete(&id)?;
    // Deletion is a soft status transition; the unfiltered list includes tombstones.
    for status in ["active", "archived"] {
        ensure!(
            !listed(&fresh, &s.owner, &format!("?status={status}"), &id)?,
            "deleted session remains in {status} list"
        );
    }
    let deleted = fresh.json("GET", &path, Some(&s.owner), None, 200)?;
    equal(&deleted["status"], json!("deleted"), "soft-delete status")?;
    ensure!(
        listed(&fresh, &s.owner, "?status=deleted", &id)?,
        "deleted list omitted tombstone"
    );
    Ok(())
}

fn state(s: &mut Suite) -> Result<()> {
    let id = s.create("Persistent UI state")?;
    let path = format!("/api/sessions/{id}/state");
    let value =
        json!({"contract.panel":{"open":true,"tab":"terminal","label":"café"},"contract.zero":0});
    s.gateway
        .api
        .json("PATCH", &path, Some(&s.owner), Some(value.clone()), 200)?;
    let independent = Api::new(&s.gateway.api.base)?;
    equal(
        &independent.json(
            "GET",
            &format!("{path}?keys=contract.panel,contract.zero"),
            Some(&s.owner),
            None,
            200,
        )?,
        value,
        "persisted state",
    )?;
    s.gateway.api.json(
        "PATCH",
        &path,
        Some(&s.owner),
        Some(json!({"contract.zero":7})),
        200,
    )?;
    equal(
        &independent.json(
            "GET",
            &format!("{path}?keys=contract.panel"),
            Some(&s.owner),
            None,
            200,
        )?,
        json!({"contract.panel":{"open":true,"tab":"terminal","label":"café"}}),
        "state merge",
    )?;
    s.delete(&id)
}

fn isolation(s: &mut Suite) -> Result<()> {
    let id = s.create("Private investigation")?;
    let path = format!("/api/sessions/{id}");
    s.gateway.api.json(
        "PATCH",
        &format!("{path}/state"),
        Some(&s.owner),
        Some(json!({"contract.secret":"owner-only"})),
        200,
    )?;
    for (method, suffix, body) in [
        ("GET", "", None),
        ("PATCH", "", Some(json!({"name":"intrusion"}))),
        ("POST", "/archive", None),
        ("DELETE", "", None),
        ("GET", "/state", None),
        (
            "PATCH",
            "/state",
            Some(json!({"contract.secret":"intrusion"})),
        ),
        ("GET", "/stream", None),
        ("GET", "/trajectory", None),
    ] {
        s.gateway.api.expect(
            method,
            &format!("{path}{suffix}"),
            Some(&s.member),
            body,
            404,
        )?;
    }
    ensure!(
        !listed(&s.gateway.api, &s.member, "", &id)?,
        "foreign session leaked through list"
    );
    let own = s
        .gateway
        .api
        .json("GET", &path, Some(&s.owner), None, 200)?;
    equal(
        &own["name"],
        json!("Private investigation"),
        "denied mutation changed name",
    )?;
    equal(
        &own["status"],
        json!("active"),
        "denied mutation changed status",
    )?;
    equal(
        &s.gateway.api.json(
            "GET",
            &format!("{path}/state?keys=contract.secret"),
            Some(&s.owner),
            None,
            200,
        )?,
        json!({"contract.secret":"owner-only"}),
        "denied mutation changed state",
    )?;
    s.delete(&id)
}

fn missing(s: &mut Suite) -> Result<()> {
    let path = format!("/api/sessions/{}", uuid::Uuid::new_v4());
    for (method, suffix, body) in [
        ("GET", "", None),
        ("PATCH", "", Some(json!({"name":"missing"}))),
        ("DELETE", "", None),
        ("POST", "/archive", None),
        ("GET", "/state", None),
        ("GET", "/stream", None),
    ] {
        s.gateway.api.expect(
            method,
            &format!("{path}{suffix}"),
            Some(&s.owner),
            body,
            404,
        )?;
    }
    Ok(())
}

fn stream(s: &mut Suite) -> Result<()> {
    let id = s.create("Idle SSE snapshot")?;
    let path = format!("/api/sessions/{id}/stream");
    s.gateway.api.expect("GET", &path, None, None, 401)?;
    let response = s
        .gateway
        .api
        .expect("GET", &path, Some(&s.owner), None, 200)?;
    ensure!(
        response
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|h| h.to_str().ok())
            .is_some_and(|h| h.starts_with("text/event-stream")),
        "stream must use SSE content type"
    );
    sse::idle_snapshot(&bounded_body(response)?, &id)?;
    s.delete(&id)
}

fn reconnect(s: &mut Suite) -> Result<()> {
    let id = s.create("Reconnect idle stream")?;
    let path = format!("/api/sessions/{id}/stream");
    let mut baseline: Option<Value> = None;
    for _ in 0..3 {
        let independent = Api::new(&s.gateway.api.base)?;
        let response = independent.expect("GET", &path, Some(&s.owner), None, 200)?;
        let snapshot = sse::idle_snapshot(&bounded_body(response)?, &id)?;
        if let Some(previous) = &baseline {
            equal(&snapshot, previous.clone(), "reconnected snapshot")?;
        }
        baseline = Some(snapshot);
    }
    s.delete(&id)
}

fn validation(s: &mut Suite) -> Result<()> {
    let id = s.create("Validation leaves state unchanged")?;
    let path = format!("/api/sessions/{id}/state");
    s.gateway.api.json(
        "PATCH",
        &path,
        Some(&s.owner),
        Some(json!({"contract.value":1})),
        200,
    )?;
    s.gateway.api.expect(
        "PATCH",
        &path,
        Some(&s.owner),
        Some(json!(["not", "an", "object"])),
        400,
    )?;
    equal(
        &s.gateway.api.json(
            "GET",
            &format!("{path}?keys=contract.value"),
            Some(&s.owner),
            None,
            200,
        )?,
        json!({"contract.value":1}),
        "invalid update changed state",
    )?;
    s.delete(&id)
}

fn concurrent(s: &mut Suite) -> Result<()> {
    let mut workers = Vec::new();
    for index in 0..8 {
        let api = s.gateway.api.clone();
        let owner = s.owner.clone();
        workers.push(std::thread::spawn(move || -> Result<(String, String)> {
            let name = format!("Concurrent investigation {index}");
            let response = api.json(
                "POST",
                "/api/sessions",
                Some(&owner),
                Some(json!({"name":name})),
                201,
            )?;
            equal(&response["name"], json!(name), "concurrent session name")?;
            Ok((string(&response, "id")?, name))
        }));
    }
    // Join every worker even if one fails, before fixture cleanup/restart.
    let outcomes: Vec<_> = workers.into_iter().map(|w| w.join()).collect();
    let mut sessions = Vec::new();
    for outcome in outcomes {
        sessions.push(outcome.map_err(|_| anyhow::anyhow!("request worker panicked"))??);
    }
    ensure!(
        sessions
            .iter()
            .map(|(id, _)| id)
            .collect::<HashSet<_>>()
            .len()
            == 8,
        "concurrent requests reused IDs"
    );
    for (id, name) in sessions {
        let read = s.gateway.api.json(
            "GET",
            &format!("/api/sessions/{id}"),
            Some(&s.owner),
            None,
            200,
        )?;
        equal(&read["name"], json!(name), "concurrent persisted name")?;
        s.delete(&id)?;
    }
    Ok(())
}

fn restart(s: &mut Suite) -> Result<()> {
    let id = s.create("Survive abrupt restart — café")?;
    let state = json!({"contract.panel":{"open":true,"tab":"terminal"}});
    let path = format!("/api/sessions/{id}");
    s.gateway.api.json(
        "PATCH",
        &format!("{path}/state"),
        Some(&s.owner),
        Some(state.clone()),
        200,
    )?;
    s.gateway.restart()?;
    let read = s
        .gateway
        .api
        .json("GET", &path, Some(&s.owner), None, 200)?;
    equal(
        &read["name"],
        json!("Survive abrupt restart — café"),
        "restart session persistence",
    )?;
    equal(
        &s.gateway.api.json(
            "GET",
            &format!("{path}/state?keys=contract.panel"),
            Some(&s.owner),
            None,
            200,
        )?,
        state,
        "restart state persistence",
    )?;
    // Credentials and invitation-created accounts must also survive.
    let member = s.gateway.api.json(
        "POST",
        "/api/auth/login",
        None,
        Some(json!({"username":s.member_name,"password":PASSWORD})),
        200,
    )?;
    ensure!(
        !listed(&s.gateway.api, &string(&member, "access_token")?, "", &id)?,
        "restart lost ownership boundary"
    );
    sse::idle_snapshot(
        &bounded_body(s.gateway.api.expect(
            "GET",
            &format!("{path}/stream"),
            Some(&s.owner),
            None,
            200,
        )?)?,
        &id,
    )?;
    s.delete(&id)
}

pub const NETWORK_CASES: &[Scenario] = &[
    ("auth.anonymous-denied", anonymous),
    ("auth.invalid-token-denied", invalid_tokens),
    ("auth.registration-validation", registration),
    ("auth.login-identity", login),
    ("auth.invitation-owner-and-single-use", invitations),
    ("auth.cookie-refresh-and-logout", cookies),
    ("sessions.lifecycle", lifecycle),
    ("sessions.state-persistence", state),
    ("sessions.cross-user-isolation", isolation),
    ("sessions.missing-resource", missing),
    ("stream.idle-snapshot-and-completion", stream),
    ("stream.idle-reconnect", reconnect),
    ("sessions.invalid-state-unchanged", validation),
    ("sessions.concurrent-create", concurrent),
];
pub const RESTART_CASE: Scenario = ("persistence.abrupt-restart", restart);
