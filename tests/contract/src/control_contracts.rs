//! Public API contracts for repository metadata and consent state.
//! Real HTTP/SQLite; repositories are metadata-only records pointing at nonexistent
//! project-local paths. No git subprocess, paid provider, or pending tool is invoked.
use crate::{
    client::{equal, string},
    scenarios::{Scenario, Suite},
};
use anyhow::{Context, Result, ensure};
use serde_json::{Value, json};

fn repos(s: &Suite, token: &str) -> Result<Vec<Value>> {
    let value = s
        .gateway
        .api
        .json("GET", "/api/repos", Some(token), None, 200)?;
    Ok(value["repos"]
        .as_array()
        .context("repositories array missing")?
        .clone())
}

fn create_repo(s: &Suite) -> Result<(String, String)> {
    let path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../.jait/artifacts/contracts/nonexistent-repositories")
        .join(uuid::Uuid::new_v4().to_string())
        .display()
        .to_string();
    let value = s.gateway.api.json("POST", "/api/repos", Some(&s.owner),
        Some(json!({"name":"Homelab investigation — café 🔒","localPath":path,"defaultBranch":"trunk"})), 200)?;
    equal(
        &value["repo"]["userId"],
        json!(s.owner_id),
        "repository owner",
    )?;
    equal(
        &value["repo"]["defaultBranch"],
        json!("trunk"),
        "repository branch",
    )?;
    Ok((string(&value["repo"], "id")?, path))
}

fn repo_lifecycle(s: &mut Suite) -> Result<()> {
    let (id, _) = create_repo(s)?;
    let path = format!("/api/repos/{id}");
    let name = "Gateway compatibility — 日本語";
    let value = s.gateway.api.json(
        "PATCH",
        &path,
        Some(&s.owner),
        Some(json!({"name":name,"defaultBranch":"release"})),
        200,
    )?;
    equal(&value["repo"]["name"], json!(name), "repository rename")?;
    equal(
        &value["repo"]["defaultBranch"],
        json!("release"),
        "repository branch update",
    )?;
    let list = repos(s, &s.owner)?;
    let persisted = list
        .iter()
        .find(|repo| repo["id"] == id)
        .context("repository absent from list")?;
    equal(
        &persisted["name"],
        json!(name),
        "persisted repository rename",
    )?;
    let deleted = s
        .gateway
        .api
        .json("DELETE", &path, Some(&s.owner), None, 200)?;
    equal(&deleted["ok"], json!(true), "repository deletion")?;
    ensure!(
        !repos(s, &s.owner)?.iter().any(|repo| repo["id"] == id),
        "deleted repository remains listed"
    );
    s.gateway
        .api
        .expect("DELETE", &path, Some(&s.owner), None, 404)?;
    Ok(())
}

fn repo_idempotency(s: &mut Suite) -> Result<()> {
    let (id, path) = create_repo(s)?;
    let duplicate = s.gateway.api.json(
        "POST",
        "/api/repos",
        Some(&s.owner),
        Some(json!({"name":"duplicate must preserve original metadata","localPath":path})),
        200,
    )?;
    equal(
        &duplicate["repo"]["id"],
        json!(id),
        "duplicate repository ID",
    )?;
    equal(
        &duplicate["repo"]["name"],
        json!("Homelab investigation — café 🔒"),
        "duplicate preserves name",
    )?;
    ensure!(
        repos(s, &s.owner)?
            .iter()
            .filter(|repo| repo["localPath"] == path)
            .count()
            == 1,
        "duplicate repository path creates duplicate records"
    );
    let foreign = s.gateway.api.json(
        "POST",
        "/api/repos",
        Some(&s.member),
        Some(json!({"name":"Member-owned metadata","localPath":path})),
        200,
    )?;
    let foreign_id = string(&foreign["repo"], "id")?;
    ensure!(
        foreign_id != id,
        "different users share repository identity"
    );
    s.gateway.api.expect(
        "DELETE",
        &format!("/api/repos/{foreign_id}"),
        Some(&s.member),
        None,
        200,
    )?;
    s.gateway.api.expect(
        "DELETE",
        &format!("/api/repos/{id}"),
        Some(&s.owner),
        None,
        200,
    )?;
    Ok(())
}

fn repo_validation(s: &mut Suite) -> Result<()> {
    let before = repos(s, &s.owner)?;
    for body in [
        json!({}),
        json!({"name":"Missing path"}),
        json!({"localPath":"missing-name"}),
    ] {
        s.gateway
            .api
            .expect("POST", "/api/repos", Some(&s.owner), Some(body), 400)?;
    }
    equal(
        &json!(repos(s, &s.owner)?),
        json!(before),
        "invalid repository create leaves list unchanged",
    )
}

fn repo_strategy(s: &mut Suite) -> Result<()> {
    let (id, _) = create_repo(s)?;
    let path = format!("/api/repos/{id}/strategy");
    let empty = s
        .gateway
        .api
        .json("GET", &path, Some(&s.owner), None, 200)?;
    equal(&empty["strategy"], json!(""), "default strategy")?;
    let markdown = "# Homelab 🔒\n\nVerify café and 日本語.\n";
    let write = s.gateway.api.json(
        "PUT",
        &path,
        Some(&s.owner),
        Some(json!({"strategy":markdown})),
        200,
    )?;
    equal(&write["strategy"], json!(markdown), "strategy write")?;
    for body in [json!({}), json!({"strategy":17}), json!({"strategy":null})] {
        s.gateway
            .api
            .expect("PUT", &path, Some(&s.owner), Some(body), 400)?;
    }
    let read = s
        .gateway
        .api
        .json("GET", &path, Some(&s.owner), None, 200)?;
    equal(
        &read["strategy"],
        json!(markdown),
        "invalid strategy write leaves data unchanged",
    )?;
    s.gateway.api.expect(
        "PUT",
        &path,
        Some(&s.owner),
        Some(json!({"strategy":""})),
        200,
    )?;
    equal(
        &s.gateway
            .api
            .json("GET", &path, Some(&s.owner), None, 200)?["strategy"],
        json!(""),
        "strategy clear",
    )?;
    s.gateway.api.expect(
        "DELETE",
        &format!("/api/repos/{id}"),
        Some(&s.owner),
        None,
        200,
    )?;
    Ok(())
}

fn repo_isolation(s: &mut Suite) -> Result<()> {
    let (id, _) = create_repo(s)?;
    let path = format!("/api/repos/{id}");
    for (method, suffix, body) in [
        ("PATCH", "", Some(json!({"name":"foreign mutation"}))),
        ("DELETE", "", None),
        ("GET", "/strategy", None),
        (
            "PUT",
            "/strategy",
            Some(json!({"strategy":"foreign mutation"})),
        ),
        ("POST", "/strategy/generate", Some(json!({}))),
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
        !repos(s, &s.member)?.iter().any(|repo| repo["id"] == id),
        "foreign repository listed"
    );
    let list = repos(s, &s.owner)?;
    let own = list
        .iter()
        .find(|repo| repo["id"] == id)
        .context("foreign delete removed repository")?;
    equal(
        &own["name"],
        json!("Homelab investigation — café 🔒"),
        "foreign rename changed data",
    )?;
    equal(
        &s.gateway.api.json(
            "GET",
            &format!("{path}/strategy"),
            Some(&s.owner),
            None,
            200,
        )?["strategy"],
        json!(""),
        "foreign strategy write changed data",
    )?;
    s.gateway
        .api
        .expect("DELETE", &path, Some(&s.owner), None, 200)?;
    Ok(())
}

fn repo_missing(s: &mut Suite) -> Result<()> {
    let path = format!("/api/repos/{}", uuid::Uuid::new_v4());
    for (method, suffix, body) in [
        ("PATCH", "", Some(json!({"name":"missing"}))),
        ("DELETE", "", None),
        ("GET", "/strategy", None),
        ("PUT", "/strategy", Some(json!({"strategy":"missing"}))),
        ("POST", "/strategy/generate", Some(json!({}))),
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

fn consent_empty(s: &mut Suite) -> Result<()> {
    equal(
        &s.gateway
            .api
            .json("GET", "/api/consent/pending", Some(&s.owner), None, 200)?,
        json!({"requests":[]}),
        "fresh pending consent",
    )?;
    equal(
        &s.gateway
            .api
            .json("GET", "/api/consent/count", Some(&s.owner), None, 200)?,
        json!({"count":0}),
        "fresh pending count",
    )?;
    let policy = s
        .gateway
        .api
        .json("GET", "/api/consent/policy", Some(&s.owner), None, 200)?;
    equal(
        &policy["unknownToolsRequireConsent"],
        json!(true),
        "unknown tools policy",
    )?;
    let permissions = policy["permissions"]
        .as_array()
        .context("consent permissions array missing")?;
    equal(
        &policy["toolCount"],
        json!(permissions.len()),
        "consent policy count",
    )?;
    ensure!(
        policy["activeProfileName"].is_null() || policy["activeProfileName"].is_string(),
        "invalid profile field"
    );
    Ok(())
}

fn consent_missing(s: &mut Suite) -> Result<()> {
    for suffix in ["", "/approve", "/reject", "/approve-all"] {
        let method = if suffix.is_empty() { "GET" } else { "POST" };
        let path = format!("/api/consent/{}{suffix}", uuid::Uuid::new_v4());
        s.gateway.api.expect(
            method,
            &path,
            Some(&s.owner),
            if method == "POST" {
                Some(json!({}))
            } else {
                None
            },
            404,
        )?;
    }
    let missing = uuid::Uuid::new_v4();
    for (method, suffix) in [
        ("GET", ""),
        ("GET", "/approve-all"),
        ("POST", "/approve-all"),
        ("DELETE", "/approve-all"),
    ] {
        s.gateway.api.expect(
            method,
            &format!("/api/consent/pending/{missing}{suffix}"),
            Some(&s.owner),
            if method == "POST" {
                Some(json!({}))
            } else {
                None
            },
            404,
        )?;
    }
    Ok(())
}

fn consent_state(s: &mut Suite) -> Result<()> {
    let id = s.create("Disposable consent mode 🔒")?;
    let pending = format!("/api/consent/pending/{id}");
    let path = format!("{pending}/approve-all");
    equal(
        &s.gateway
            .api
            .json("GET", &pending, Some(&s.owner), None, 200)?,
        json!({"requests":[]}),
        "session pending list",
    )?;
    equal(
        &s.gateway
            .api
            .json("GET", &path, Some(&s.owner), None, 200)?["approveAllEnabled"],
        json!(false),
        "initial approval mode",
    )?;
    let enabled = s.gateway.api.json(
        "POST",
        &path,
        Some(&s.owner),
        Some(json!({"reason":"isolated contract fixture"})),
        200,
    )?;
    equal(
        &enabled["approveAllEnabled"],
        json!(true),
        "enable approval mode",
    )?;
    equal(&enabled["approvedCount"], json!(0), "empty approval count")?;
    equal(&enabled["requestIds"], json!([]), "empty approval IDs")?;
    equal(
        &enabled["sessionId"],
        json!(id),
        "approval session identity",
    )?;
    equal(
        &s.gateway
            .api
            .json("GET", &path, Some(&s.owner), None, 200)?["approveAllEnabled"],
        json!(true),
        "persisted approval mode",
    )?;
    // Foreign clients cannot clear a mode or enable it for another user's chat.
    for method in ["GET", "POST", "DELETE"] {
        s.gateway.api.expect(
            method,
            &path,
            Some(&s.member),
            if method == "POST" {
                Some(json!({}))
            } else {
                None
            },
            404,
        )?;
    }
    equal(
        &s.gateway
            .api
            .json("GET", &path, Some(&s.owner), None, 200)?["approveAllEnabled"],
        json!(true),
        "foreign request changed mode",
    )?;
    s.gateway
        .api
        .expect("GET", &pending, Some(&s.member), None, 404)?;
    let cleared = s
        .gateway
        .api
        .json("DELETE", &path, Some(&s.owner), None, 200)?;
    equal(
        &cleared["approveAllEnabled"],
        json!(false),
        "clear approval mode",
    )?;
    equal(
        &s.gateway
            .api
            .json("GET", &path, Some(&s.owner), None, 200)?["approveAllEnabled"],
        json!(false),
        "cleared approval mode",
    )?;
    s.delete(&id)
}

fn control_anonymous(s: &mut Suite) -> Result<()> {
    for (method, path, body) in [
        ("GET", "/api/repos", None),
        ("POST", "/api/repos", Some(json!({}))),
        ("PATCH", "/api/repos/missing", Some(json!({}))),
        ("DELETE", "/api/repos/missing", None),
        ("GET", "/api/repos/missing/strategy", None),
        ("PUT", "/api/repos/missing/strategy", Some(json!({}))),
        (
            "POST",
            "/api/repos/missing/strategy/generate",
            Some(json!({})),
        ),
        ("GET", "/api/consent/policy", None),
        ("GET", "/api/consent/pending", None),
        ("GET", "/api/consent/count", None),
        ("GET", "/api/consent/missing", None),
        ("POST", "/api/consent/missing/approve", Some(json!({}))),
        ("POST", "/api/consent/missing/reject", Some(json!({}))),
        ("POST", "/api/consent/missing/approve-all", Some(json!({}))),
        ("GET", "/api/consent/pending/missing/approve-all", None),
        (
            "POST",
            "/api/consent/pending/missing/approve-all",
            Some(json!({})),
        ),
        ("DELETE", "/api/consent/pending/missing/approve-all", None),
    ] {
        s.gateway.api.expect(method, path, None, body, 401)?;
    }
    Ok(())
}

pub const CASES: &[Scenario] = &[
    ("repos.lifecycle", repo_lifecycle),
    ("repos.path-idempotency-and-user-identity", repo_idempotency),
    ("repos.validation-no-mutation", repo_validation),
    ("repos.unicode-strategy-and-invalid-write", repo_strategy),
    ("repos.cross-user-denied-writes", repo_isolation),
    ("repos.missing-resource", repo_missing),
    ("consent.empty-queue-and-policy", consent_empty),
    ("consent.missing-request-and-session", consent_missing),
    (
        "consent.session-mode-and-cross-user-isolation",
        consent_state,
    ),
    ("control.anonymous-denial", control_anonymous),
];
