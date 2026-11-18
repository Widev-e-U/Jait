use crate::{
    client::{bounded_body, equal, string},
    scenarios::{Scenario, Suite},
};
use anyhow::{Context, Result, ensure};
use serde_json::{Value, json};

pub const CASES: &[Scenario] = &[
    (
        "reminders require authentication on every operation",
        reminder_auth,
    ),
    (
        "reminders normalize content tags provenance and defaults",
        reminder_defaults,
    ),
    (
        "reminders reject invalid creation without adding rows",
        reminder_validation,
    ),
    (
        "reminders archive restore and preserve valid state after rejected edits",
        reminder_lifecycle,
    ),
    (
        "reminders are isolated across users and denied edits have no effect",
        reminder_isolation,
    ),
    (
        "reminders filter by session status and limit",
        reminder_filters,
    ),
    (
        "reminders export markdown with ownership and status filtering",
        reminder_export,
    ),
    (
        "reminders enforce linked session ownership",
        reminder_session_ownership,
    ),
    ("reminders return missing-record errors", reminder_missing),
    ("jobs require authentication on every operation", job_auth),
    (
        "jobs preserve normalized system payload through CRUD",
        job_lifecycle,
    ),
    (
        "jobs reject invalid schedules without partial writes",
        job_validation,
    ),
    (
        "jobs preserve agent configuration strip title and clear model",
        job_agent,
    ),
    ("jobs paginate and filter disabled schedules", job_filters),
    (
        "jobs hide foreign records and forbid foreign triggering",
        job_isolation,
    ),
    ("jobs report missing records consistently", job_missing),
    ("plans require authentication on every operation", plan_auth),
    (
        "plans persist tasks title and status through CRUD",
        plan_lifecycle,
    ),
    (
        "plans hide foreign records and forbid every foreign mutation",
        plan_isolation,
    ),
    (
        "plans approve individual tasks and select only runnable tasks",
        plan_task_selection,
    ),
    (
        "plans reject empty starts missing tasks and linked threads",
        plan_task_errors,
    ),
    ("plans report missing plans and repositories", plan_missing),
];

fn request(s: &Suite, method: &str, path: &str, body: Option<Value>, status: u16) -> Result<Value> {
    s.gateway
        .api
        .json(method, path, Some(&s.owner), body, status)
}

fn rows(value: &Value, key: &str) -> Result<Vec<Value>> {
    value[key]
        .as_array()
        .cloned()
        .with_context(|| format!("expected {key} array"))
}

fn includes(value: &Value, key: &str, id: &str) -> Result<bool> {
    Ok(rows(value, key)?.iter().any(|row| row["id"] == id))
}

fn reminders(s: &Suite, query: &str) -> Result<Value> {
    request(s, "GET", &format!("/api/reminders{query}"), None, 200)
}

fn reminder(s: &Suite, body: Value) -> Result<Value> {
    Ok(request(s, "POST", "/api/reminders", Some(body), 201)?["reminder"].clone())
}

fn delete_reminder(s: &Suite, id: &str) -> Result<()> {
    let response = request(s, "DELETE", &format!("/api/reminders/{id}"), None, 200)?;
    equal(
        &response["ok"],
        json!(true),
        "reminder deletion acknowledgement",
    )
}

fn reminder_auth(s: &mut Suite) -> Result<()> {
    for (method, path, body) in [
        ("GET", "/api/reminders", None),
        ("GET", "/api/reminders/export.md", None),
        (
            "POST",
            "/api/reminders",
            Some(json!({"content":"unauthorized reminder"})),
        ),
        (
            "PATCH",
            "/api/reminders/missing",
            Some(json!({"content":"unauthorized edit"})),
        ),
        ("DELETE", "/api/reminders/missing", None),
    ] {
        s.gateway.api.expect(method, path, None, body, 401)?;
    }
    Ok(())
}

fn reminder_defaults(s: &mut Suite) -> Result<()> {
    let row = reminder(
        s,
        json!({
            "content":"  Router changes require verification — café 🔒  ",
            "tags":[" Network ", "NETWORK", "", " café ", 7, null],
            "status":"unsupported"
        }),
    )?;
    equal(
        &row["content"],
        json!("Router changes require verification — café 🔒"),
        "trimmed reminder",
    )?;
    equal(&row["status"], json!("active"), "default status")?;
    equal(&row["sourceType"], json!("user"), "default source type")?;
    equal(
        &row["sourceSurface"],
        json!("web"),
        "default source surface",
    )?;
    equal(&row["userId"], json!(s.owner_id), "reminder owner")?;
    equal(&row["usageCount"], json!(0), "initial usage")?;
    ensure!(
        row["projectId"].is_null() && row["sessionId"].is_null(),
        "unexpected scope defaults"
    );
    let tags: Value = serde_json::from_str(&string(&row, "tags")?)?;
    equal(
        &tags,
        json!(["network", "café"]),
        "normalized deduplicated tags",
    )?;
    string(&row, "createdAt")?;
    string(&row, "updatedAt")?;
    delete_reminder(s, &string(&row, "id")?)
}

fn reminder_validation(s: &mut Suite) -> Result<()> {
    let before = reminders(s, "?status=all")?;
    for body in [
        json!({}),
        json!({"content":""}),
        json!({"content":" \n "}),
        json!({"content":17}),
    ] {
        let response = request(s, "POST", "/api/reminders", Some(body), 400)?;
        equal(
            &response["error"],
            json!("content is required"),
            "missing reminder content error",
        )?;
    }
    let after = reminders(s, "?status=all")?;
    equal(
        &after["reminders"],
        before["reminders"].clone(),
        "invalid creates changed reminder list",
    )
}

fn reminder_lifecycle(s: &mut Suite) -> Result<()> {
    let row = reminder(
        s,
        json!({"content":"Verify backup restoration","tags":["backup"]}),
    )?;
    let id = string(&row, "id")?;
    let path = format!("/api/reminders/{id}");
    for body in [
        json!({"content":" "}),
        json!({"status":"deleted"}),
        json!({"content":"must not persist","status":"invalid"}),
    ] {
        request(s, "PATCH", &path, Some(body), 400)?;
        let list = reminders(s, "?status=all")?;
        let persisted = rows(&list, "reminders")?
            .into_iter()
            .find(|r| r["id"] == id)
            .context("reminder disappeared")?;
        equal(
            &persisted["content"],
            row["content"].clone(),
            "rejected patch changed content",
        )?;
        equal(
            &persisted["status"],
            json!("active"),
            "rejected patch changed status",
        )?;
    }
    let updated = request(
        s,
        "PATCH",
        &path,
        Some(json!({"content":"  Backup restoration verified  ","status":"archived"})),
        200,
    )?;
    equal(
        &updated["reminder"]["content"],
        json!("Backup restoration verified"),
        "edited content",
    )?;
    equal(
        &updated["reminder"]["tags"],
        row["tags"].clone(),
        "omitted tags were lost",
    )?;
    ensure!(
        !includes(&reminders(s, "")?, "reminders", &id)?,
        "archive remained active"
    );
    ensure!(
        includes(&reminders(s, "?status=archived")?, "reminders", &id)?,
        "archive missing"
    );
    request(
        s,
        "PATCH",
        &path,
        Some(json!({"status":"active","tags":[]})),
        200,
    )?;
    ensure!(
        includes(&reminders(s, "")?, "reminders", &id)?,
        "restored reminder missing"
    );
    delete_reminder(s, &id)?;
    ensure!(
        !includes(&reminders(s, "?status=all")?, "reminders", &id)?,
        "deleted reminder remains"
    );
    Ok(())
}

fn reminder_isolation(s: &mut Suite) -> Result<()> {
    let row = reminder(s, json!({"content":"Owner private backup policy"}))?;
    let id = string(&row, "id")?;
    let path = format!("/api/reminders/{id}");
    let foreign = s.gateway.api.json(
        "GET",
        "/api/reminders?status=all",
        Some(&s.member),
        None,
        200,
    )?;
    ensure!(
        !includes(&foreign, "reminders", &id)?,
        "foreign reminder leaked"
    );
    for (method, body) in [
        (
            "PATCH",
            Some(json!({"content":"changed by foreign user","status":"archived"})),
        ),
        ("DELETE", None),
    ] {
        s.gateway
            .api
            .expect(method, &path, Some(&s.member), body, 404)?;
    }
    let persisted = rows(&reminders(s, "?status=all")?, "reminders")?
        .into_iter()
        .find(|r| r["id"] == id)
        .context("foreign deletion succeeded")?;
    equal(
        &persisted["content"],
        row["content"].clone(),
        "foreign edit changed content",
    )?;
    equal(
        &persisted["status"],
        json!("active"),
        "foreign edit changed status",
    )?;
    delete_reminder(s, &id)
}

fn reminder_filters(s: &mut Suite) -> Result<()> {
    let session = s.create("Reminder filter fixture")?;
    let other_session = s.create("Other reminder fixture")?;
    let first = reminder(
        s,
        json!({"content":"Scoped active reminder","sessionId":session}),
    )?;
    let second = reminder(
        s,
        json!({"content":"Scoped archived reminder","sessionId":session,"status":"archived"}),
    )?;
    let other = reminder(
        s,
        json!({"content":"Different session reminder","sessionId":other_session}),
    )?;
    let first_id = string(&first, "id")?;
    let second_id = string(&second, "id")?;
    let other_id = string(&other, "id")?;
    let list = reminders(s, &format!("?sessionId={session}&status=all"))?;
    ensure!(
        includes(&list, "reminders", &first_id)? && includes(&list, "reminders", &second_id)?,
        "scope list omitted reminder"
    );
    ensure!(
        !includes(&list, "reminders", &other_id)?,
        "scope filter leaked another session"
    );
    let active = reminders(s, &format!("?sessionId={session}"))?;
    ensure!(
        includes(&active, "reminders", &first_id)? && !includes(&active, "reminders", &second_id)?,
        "default active filter failed"
    );
    let fallback = reminders(s, &format!("?sessionId={session}&status=invalid"))?;
    equal(
        &fallback["reminders"],
        active["reminders"].clone(),
        "invalid status fallback",
    )?;
    let limited = reminders(s, &format!("?sessionId={session}&status=all&limit=1"))?;
    ensure!(
        rows(&limited, "reminders")?.len() == 1,
        "reminder limit ignored"
    );
    let invalid_limit = reminders(s, &format!("?sessionId={session}&status=all&limit=-1"))?;
    ensure!(
        rows(&invalid_limit, "reminders")?.len() == 2,
        "invalid limit did not fall back"
    );
    for id in [&first_id, &second_id, &other_id] {
        delete_reminder(s, id)?;
    }
    s.delete(&session)?;
    s.delete(&other_session)
}

fn reminder_export(s: &mut Suite) -> Result<()> {
    let unique = uuid::Uuid::new_v4();
    let active_text = format!("Export active policy {unique}");
    let archived_text = format!("Export archived policy {unique}");
    let active = reminder(s, json!({"content":active_text,"tags":["policy"]}))?;
    let archived = reminder(s, json!({"content":archived_text,"status":"archived"}))?;
    for (query, includes_archived) in [("", true), ("?status=active", false)] {
        let response = s.gateway.api.expect(
            "GET",
            &format!("/api/reminders/export.md{query}"),
            Some(&s.owner),
            None,
            200,
        )?;
        ensure!(
            response
                .headers()
                .get("content-type")
                .and_then(|v| v.to_str().ok())
                .is_some_and(|v| v.starts_with("text/markdown")),
            "export content type"
        );
        ensure!(
            response
                .headers()
                .get("content-disposition")
                .and_then(|v| v.to_str().ok())
                .is_some_and(|v| v.contains("jait-memory.md")),
            "export disposition"
        );
        let text = String::from_utf8(bounded_body(response)?)?;
        ensure!(
            text.starts_with("# Memory Export") && text.contains(&active_text),
            "export omitted active content"
        );
        ensure!(
            text.contains(&archived_text) == includes_archived,
            "export status filter failed"
        );
        ensure!(text.contains("tags=policy"), "export omitted metadata");
    }
    let response = s.gateway.api.expect(
        "GET",
        "/api/reminders/export.md",
        Some(&s.member),
        None,
        200,
    )?;
    let foreign = String::from_utf8(bounded_body(response)?)?;
    ensure!(
        !foreign.contains(&unique.to_string()),
        "export leaked another user's reminder"
    );
    delete_reminder(s, &string(&active, "id")?)?;
    delete_reminder(s, &string(&archived, "id")?)
}

fn reminder_session_ownership(s: &mut Suite) -> Result<()> {
    let session = s.create("Private session linked reminder")?;
    for body in [
        json!({"content":"foreign scope reminder","sessionId":session}),
        json!({"content":"missing scope reminder","sessionId":uuid::Uuid::new_v4().to_string()}),
        json!({"content":"missing project reminder","projectId":uuid::Uuid::new_v4().to_string()}),
    ] {
        s.gateway
            .api
            .expect("POST", "/api/reminders", Some(&s.member), Some(body), 404)?;
    }
    s.delete(&session)
}

fn reminder_missing(s: &mut Suite) -> Result<()> {
    let path = format!("/api/reminders/{}", uuid::Uuid::new_v4());
    for (method, body) in [
        ("PATCH", Some(json!({"content":"missing reminder"}))),
        ("DELETE", None),
    ] {
        let response = request(s, method, &path, body, 404)?;
        equal(
            &response["error"],
            json!("NOT_FOUND"),
            "missing reminder error",
        )?;
    }
    Ok(())
}

fn job(s: &Suite, body: Value) -> Result<Value> {
    request(s, "POST", "/api/jobs", Some(body), 201)
}

fn remove_job(s: &Suite, id: &str) -> Result<()> {
    let response = s.gateway.api.expect(
        "DELETE",
        &format!("/api/jobs/{id}"),
        Some(&s.owner),
        None,
        204,
    )?;
    ensure!(
        bounded_body(response)?.is_empty(),
        "204 deletion returned a body"
    );
    Ok(())
}

fn job_auth(s: &mut Suite) -> Result<()> {
    for (method, path, body) in [
        ("GET", "/api/jobs", None),
        ("GET", "/api/jobs/missing", None),
        ("GET", "/api/jobs/providers/available", None),
        ("GET", "/api/jobs/missing/runs", None),
        (
            "POST",
            "/api/jobs",
            Some(json!({"name":"denied","cron_expression":"0 9 * * *","enabled":false})),
        ),
        ("PATCH", "/api/jobs/missing", Some(json!({"enabled":false}))),
        ("DELETE", "/api/jobs/missing", None),
        ("POST", "/api/jobs/missing/trigger", None),
    ] {
        s.gateway.api.expect(method, path, None, body, 401)?;
    }
    Ok(())
}

fn job_lifecycle(s: &mut Suite) -> Result<()> {
    let created = job(
        s,
        json!({
            "name":"  Weekly backup status  ","cron_expression":" 0 9 * * 1 ",
            "enabled":false,"description":"Review backup health",
            "payload":{"command":"gateway_status","args":{"source":"rust-contract","nested":{"enabled":false}}}
        }),
    )?;
    let id = string(&created, "id")?;
    let path = format!("/api/jobs/{id}");
    equal(
        &created["name"],
        json!("Weekly backup status"),
        "trimmed job name",
    )?;
    equal(
        &created["cron_expression"],
        json!("0 9 * * 1"),
        "trimmed job cron",
    )?;
    equal(
        &created["tool_name"],
        json!("gateway.status"),
        "tool normalization",
    )?;
    equal(
        &created["payload"],
        json!({"command":"gateway.status","args":{"source":"rust-contract","nested":{"enabled":false}}}),
        "system job payload",
    )?;
    equal(&created["user_id"], json!(s.owner_id), "job owner")?;
    equal(&created["enabled"], json!(false), "job disabled")?;
    equal(
        &created["job_type"],
        json!("system_job"),
        "default job type",
    )?;
    let read = request(s, "GET", &path, None, 200)?;
    equal(&read, created.clone(), "persisted job")?;
    let patched = request(
        s,
        "PATCH",
        &path,
        Some(json!({"name":"Monthly backup status","cron_expression":"0 9 1 * *"})),
        200,
    )?;
    equal(
        &patched["name"],
        json!("Monthly backup status"),
        "job rename",
    )?;
    equal(
        &patched["payload"],
        created["payload"].clone(),
        "plain edit lost payload",
    )?;
    equal(
        &patched["description"],
        created["description"].clone(),
        "plain edit lost metadata",
    )?;
    let runs = request(
        s,
        "GET",
        &format!("{path}/runs?page=-1&size=9999"),
        None,
        200,
    )?;
    equal(&runs["items"], json!([]), "new job runs")?;
    equal(&runs["total"], json!(0), "new job run count")?;
    equal(&runs["page"], json!(1), "run page clamp")?;
    equal(&runs["size"], json!(500), "run size clamp")?;
    remove_job(s, &id)?;
    request(s, "GET", &path, None, 404)?;
    Ok(())
}

fn job_validation(s: &mut Suite) -> Result<()> {
    let before = request(s, "GET", "/api/jobs", None, 200)?;
    let missing_prompt = request(
        s,
        "POST",
        "/api/jobs",
        Some(
            json!({"name":"Missing prompt","cron_expression":"* * * * *","job_type":"agent_task"}),
        ),
        400,
    )?;
    equal(
        &missing_prompt["detail"],
        json!("prompt is required for agent_task"),
        "missing agent prompt detail",
    )?;
    for body in [
        json!({}),
        json!({"name":" "}),
        json!({"name":"Invalid","cron_expression":"not-a-cron","enabled":false}),
        json!({"name":"Invalid","cron_expression":"60 * * * *","enabled":false}),
        json!({"name":"Invalid","cron_expression":"*/0 * * * *","enabled":false}),
        json!({"name":"Invalid","cron_expression":"0junk 9 * * *","enabled":false}),
        json!({"name":"Invalid","cron_expression":"0 9 * * *","job_type":"agent_task","prompt":" ","enabled":false}),
    ] {
        let expects_cron = body.get("cron_expression").is_some() && body.get("job_type").is_none();
        let rejected = request(s, "POST", "/api/jobs", Some(body), 400)?;
        if expects_cron {
            ensure!(
                rejected["detail"]
                    .as_str()
                    .is_some_and(|detail| detail.to_lowercase().contains("cron")),
                "invalid schedule must explain the cron rejection"
            );
        }
    }
    equal(
        &request(s, "GET", "/api/jobs", None, 200)?["items"],
        before["items"].clone(),
        "invalid creates added jobs",
    )?;
    let created = job(
        s,
        json!({"name":"Weekly review","cron_expression":"0 9 * * 1","enabled":false}),
    )?;
    let id = string(&created, "id")?;
    let path = format!("/api/jobs/{id}");
    for cron in [json!("not-a-cron"), json!(""), json!(123), Value::Null] {
        request(
            s,
            "PATCH",
            &path,
            Some(json!({"name":"must not change","cron_expression":cron,"enabled":true})),
            400,
        )?;
        let read = request(s, "GET", &path, None, 200)?;
        equal(
            &read,
            created.clone(),
            "invalid schedule partially changed job",
        )?;
    }
    remove_job(s, &id)
}

fn job_agent(s: &mut Suite) -> Result<()> {
    let created = job(
        s,
        json!({
            "name":"Review repository daily","cron_expression":"0 9 * * *","job_type":"agent_task",
            "enabled":false,"prompt":"  Read the repository status and prepare a summary.  ",
            "provider":"codex","model":"contract-model",
            "payload":{"title":"discard static title","allowedTools":"file.list,file.read",
                "personaAgentId":"fixture-persona","skillIds":["research"],"runtimeMode":"supervised"}
        }),
    )?;
    let id = string(&created, "id")?;
    let path = format!("/api/jobs/{id}");
    equal(&created["tool_name"], json!("thread.control"), "agent tool")?;
    equal(
        &created["prompt"],
        json!("Read the repository status and prepare a summary."),
        "trimmed agent prompt",
    )?;
    for (key, expected) in [
        ("action", json!("create")),
        ("kind", json!("delivery")),
        ("providerId", json!("codex")),
        ("start", json!(true)),
        ("detach", json!(true)),
        ("allowedTools", json!("file.list,file.read")),
        ("personaAgentId", json!("fixture-persona")),
        ("skillIds", json!(["research"])),
        ("runtimeMode", json!("supervised")),
    ] {
        equal(
            &created["payload"][key],
            expected,
            "agent execution payload",
        )?;
    }
    ensure!(
        created["payload"].get("title").is_none(),
        "static thread title leaked"
    );
    let cleared = request(s, "PATCH", &path, Some(json!({"model":null})), 200)?;
    ensure!(
        cleared["model"].is_null() && cleared["payload"].get("model").is_none(),
        "agent model was not cleared"
    );
    equal(
        &cleared["prompt"],
        created["prompt"].clone(),
        "model update lost prompt",
    )?;
    // Administrative changes must not reinterpret the semantic payload.
    let renamed = request(
        s,
        "PATCH",
        &path,
        Some(json!({"name":"Renamed daily review","enabled":false})),
        200,
    )?;
    equal(
        &renamed["payload"],
        cleared["payload"].clone(),
        "administrative edit changed payload",
    )?;
    remove_job(s, &id)
}

fn job_filters(s: &mut Suite) -> Result<()> {
    let baseline = request(s, "GET", "/api/jobs?size=500", None, 200)?;
    let a = job(
        s,
        json!({"name":"Disabled filter fixture A","cron_expression":"0 0 1 1 *","enabled":false}),
    )?;
    let b = job(
        s,
        json!({"name":"Disabled filter fixture B","cron_expression":"0 0 1 1 *","enabled":"false"}),
    )?;
    let a_id = string(&a, "id")?;
    let b_id = string(&b, "id")?;
    let all = request(s, "GET", "/api/jobs?size=500", None, 200)?;
    ensure!(
        includes(&all, "items", &a_id)? && includes(&all, "items", &b_id)?,
        "default list excludes disabled jobs"
    );
    let count = baseline["total"].as_u64().context("job total")? + 2;
    equal(&all["total"], json!(count), "job total")?;
    let enabled = request(
        s,
        "GET",
        "/api/jobs?include_disabled=false&size=500",
        None,
        200,
    )?;
    ensure!(
        !includes(&enabled, "items", &a_id)? && !includes(&enabled, "items", &b_id)?,
        "disabled filter failed"
    );
    let first = request(s, "GET", "/api/jobs?page=1&size=1", None, 200)?;
    let second = request(s, "GET", "/api/jobs?page=2&size=1", None, 200)?;
    ensure!(
        rows(&first, "items")?.len() == 1 && rows(&second, "items")?.len() == 1,
        "pagination ignored size"
    );
    ensure!(
        first["items"][0]["id"] != second["items"][0]["id"],
        "pagination repeated row"
    );
    equal(&first["total"], json!(count), "pagination total")?;
    let outside = request(s, "GET", "/api/jobs?page=9999&size=1", None, 200)?;
    equal(&outside["items"], json!([]), "out of range page")?;
    let clamped = request(s, "GET", "/api/jobs?page=-1&size=9999", None, 200)?;
    equal(&clamped["page"], json!(1), "job page clamp")?;
    equal(&clamped["size"], json!(500), "job size clamp")?;
    remove_job(s, &a_id)?;
    remove_job(s, &b_id)
}

fn job_isolation(s: &mut Suite) -> Result<()> {
    let created = job(
        s,
        json!({"name":"Owner-only schedule","cron_expression":"0 9 * * *","enabled":false}),
    )?;
    let id = string(&created, "id")?;
    let path = format!("/api/jobs/{id}");
    let foreign = s
        .gateway
        .api
        .json("GET", "/api/jobs?size=500", Some(&s.member), None, 200)?;
    ensure!(
        !includes(&foreign, "items", &id)?,
        "job leaked through foreign list"
    );
    for (method, suffix, body) in [
        ("GET", "", None),
        ("GET", "/runs", None),
        (
            "PATCH",
            "",
            Some(json!({"name":"foreign edit","enabled":true})),
        ),
        ("DELETE", "", None),
        ("POST", "/trigger", None),
    ] {
        s.gateway.api.expect(
            method,
            &format!("{path}{suffix}"),
            Some(&s.member),
            body,
            404,
        )?;
    }
    equal(
        &request(s, "GET", &path, None, 200)?,
        created,
        "foreign mutation changed job",
    )?;
    equal(
        &request(s, "GET", &format!("{path}/runs"), None, 200)?["total"],
        json!(0),
        "foreign trigger persisted a run",
    )?;
    remove_job(s, &id)
}

fn job_missing(s: &mut Suite) -> Result<()> {
    let path = format!("/api/jobs/{}", uuid::Uuid::new_v4());
    for (method, suffix, body) in [
        ("GET", "", None),
        ("GET", "/runs", None),
        ("DELETE", "", None),
        ("POST", "/trigger", None),
        ("PATCH", "", Some(json!({"name":"missing job"}))),
    ] {
        request(s, method, &format!("{path}{suffix}"), body, 404)?;
    }
    Ok(())
}

fn plan_fixture(s: &Suite, tasks: Value) -> Result<(String, String)> {
    // An unmaterialized project-local path avoids touching the maintainer's repository.
    let repo = request(
        s,
        "POST",
        "/api/repos",
        Some(json!({
            "name":"Rust contract plan repository",
            "localPath":format!("/home/jakob/jait/.jait/artifacts/contract-plan-{}",uuid::Uuid::new_v4())
        })),
        200,
    )?;
    let repo_id = string(&repo["repo"], "id")?;
    let plan = request(
        s,
        "POST",
        &format!("/api/repos/{repo_id}/plans"),
        Some(json!({"title":"Owned network maintenance","tasks":tasks})),
        201,
    )?;
    Ok((repo_id, string(&plan["plan"], "id")?))
}

fn cleanup_plan(s: &Suite, repo: &str, id: &str) -> Result<()> {
    let deleted = request(s, "DELETE", &format!("/api/plans/{id}"), None, 200)?;
    equal(&deleted["ok"], json!(true), "plan delete acknowledgement")?;
    request(s, "DELETE", &format!("/api/repos/{repo}"), None, 200)?;
    Ok(())
}

fn plan_auth(s: &mut Suite) -> Result<()> {
    for (method, path, body) in [
        ("GET", "/api/repos/missing/plans", None),
        (
            "POST",
            "/api/repos/missing/plans",
            Some(json!({"title":"unauthorized"})),
        ),
        ("GET", "/api/plans/missing", None),
        (
            "PATCH",
            "/api/plans/missing",
            Some(json!({"title":"unauthorized"})),
        ),
        ("DELETE", "/api/plans/missing", None),
        ("POST", "/api/plans/missing/generate", Some(json!({}))),
        ("POST", "/api/plans/missing/start", None),
        ("POST", "/api/plans/missing/tasks/missing/start", None),
    ] {
        s.gateway.api.expect(method, path, None, body, 401)?;
    }
    Ok(())
}

fn plan_lifecycle(s: &mut Suite) -> Result<()> {
    let tasks = json!([{"id":"verify-backup","title":"Verify backup restore","description":"Use an isolated restore directory.","status":"proposed"}]);
    let (repo, id) = plan_fixture(s, tasks.clone())?;
    let path = format!("/api/plans/{id}");
    let created = request(s, "GET", &path, None, 200)?;
    equal(
        &created["plan"]["status"],
        json!("draft"),
        "new plan status",
    )?;
    equal(&created["plan"]["tasks"], tasks.clone(), "new plan tasks")?;
    equal(&created["plan"]["userId"], json!(s.owner_id), "plan owner")?;
    ensure!(
        includes(
            &request(s, "GET", &format!("/api/repos/{repo}/plans"), None, 200)?,
            "plans",
            &id
        )?,
        "repository plan list omitted plan"
    );
    let changed = request(
        s,
        "PATCH",
        &path,
        Some(json!({"title":"Backup restore — café 🔒","status":"active"})),
        200,
    )?;
    equal(
        &changed["plan"]["title"],
        json!("Backup restore — café 🔒"),
        "plan title update",
    )?;
    equal(
        &changed["plan"]["tasks"],
        tasks.clone(),
        "title update lost tasks",
    )?;
    for status in ["completed", "archived", "draft"] {
        let changed = request(s, "PATCH", &path, Some(json!({"status":status})), 200)?;
        equal(
            &changed["plan"]["status"],
            json!(status),
            "plan status transition",
        )?;
    }
    let unchanged_status = request(
        s,
        "PATCH",
        &path,
        Some(json!({"status":"unsupported"})),
        200,
    )?;
    equal(
        &unchanged_status["plan"]["status"],
        json!("draft"),
        "unknown status changed plan",
    )?;
    let replaced = request(s, "PATCH", &path, Some(json!({"tasks":[]})), 200)?;
    equal(&replaced["plan"]["tasks"], json!([]), "tasks replacement")?;
    cleanup_plan(s, &repo, &id)?;
    request(s, "GET", &path, None, 404)?;
    Ok(())
}

fn plan_isolation(s: &mut Suite) -> Result<()> {
    let (repo, id) = plan_fixture(s, json!([]))?;
    let path = format!("/api/plans/{id}");
    let original = request(s, "GET", &path, None, 200)?;
    for (method, path, body) in [
        ("GET", format!("/api/repos/{repo}/plans"), None),
        (
            "POST",
            format!("/api/repos/{repo}/plans"),
            Some(json!({"title":"foreign plan"})),
        ),
        ("GET", path.clone(), None),
        (
            "PATCH",
            path.clone(),
            Some(json!({"title":"foreign edit","status":"completed","tasks":[]})),
        ),
        ("DELETE", path.clone(), None),
        (
            "POST",
            format!("{path}/generate"),
            Some(json!({"provider":"must-never-run"})),
        ),
        ("POST", format!("{path}/start"), None),
        ("POST", format!("{path}/tasks/missing/start"), None),
    ] {
        s.gateway
            .api
            .expect(method, &path, Some(&s.member), body, 404)?;
    }
    equal(
        &request(s, "GET", &path, None, 200)?,
        original,
        "foreign mutation changed plan",
    )?;
    cleanup_plan(s, &repo, &id)
}

fn plan_task_selection(s: &mut Suite) -> Result<()> {
    let (repo, id) = plan_fixture(
        s,
        json!([
            {"id":"proposed","title":"Review proposed check","description":"Review first.","status":"proposed"},
            {"id":"approved","title":"Approved check","description":"Ready to run.","status":"approved"},
            {"id":"linked","title":"Already linked check","description":"Already assigned.","status":"approved","threadId":"existing-fixture-thread"},
            {"id":"rejected","title":"Rejected check","description":"Do not run.","status":"rejected"}
        ]),
    )?;
    let path = format!("/api/plans/{id}");
    let selected = request(s, "POST", &format!("{path}/start"), None, 200)?;
    ensure!(
        rows(&selected, "tasks")?.len() == 1 && selected["tasks"][0]["id"] == "approved",
        "batch start selected ineligible tasks"
    );
    equal(
        &selected["repo"]["id"],
        json!(repo),
        "batch start repository",
    )?;
    equal(
        &request(s, "GET", &path, None, 200)?["plan"]["status"],
        json!("active"),
        "batch start did not activate plan",
    )?;
    let single = request(
        s,
        "POST",
        &format!("{path}/tasks/proposed/start"),
        None,
        200,
    )?;
    equal(&single["repo"]["id"], json!(repo), "single task repository")?;
    let persisted = request(s, "GET", &path, None, 200)?;
    let proposed = rows(&persisted["plan"], "tasks")?
        .into_iter()
        .find(|r| r["id"] == "proposed")
        .context("task disappeared")?;
    equal(
        &proposed["status"],
        json!("approved"),
        "single start did not approve task",
    )?;
    ensure!(
        proposed.get("threadId").is_none(),
        "approval unexpectedly created thread"
    );
    let selected = request(s, "POST", &format!("{path}/start"), None, 200)?;
    let ids: Vec<Value> = rows(&selected, "tasks")?
        .iter()
        .map(|r| r["id"].clone())
        .collect();
    equal(
        &json!(ids),
        json!(["proposed", "approved"]),
        "batch start approved selection",
    )?;
    cleanup_plan(s, &repo, &id)
}

fn plan_task_errors(s: &mut Suite) -> Result<()> {
    let (repo, id) = plan_fixture(
        s,
        json!([
            {"id":"linked","title":"Linked task","description":"Already assigned.","status":"approved","threadId":"existing-thread"},
            {"id":"proposed","title":"Pending task","description":"Needs approval.","status":"proposed"}
        ]),
    )?;
    let path = format!("/api/plans/{id}");
    let original = request(s, "GET", &path, None, 200)?;
    request(s, "POST", &format!("{path}/start"), None, 400)?;
    request(s, "POST", &format!("{path}/tasks/missing/start"), None, 404)?;
    request(s, "POST", &format!("{path}/tasks/linked/start"), None, 409)?;
    equal(
        &request(s, "GET", &path, None, 200)?,
        original,
        "rejected task operation changed plan",
    )?;
    cleanup_plan(s, &repo, &id)
}

fn plan_missing(s: &mut Suite) -> Result<()> {
    let id = uuid::Uuid::new_v4();
    let path = format!("/api/plans/{id}");
    for (method, path, body) in [
        ("GET", format!("/api/repos/{id}/plans"), None),
        (
            "POST",
            format!("/api/repos/{id}/plans"),
            Some(json!({"title":"missing repo"})),
        ),
        ("GET", path.clone(), None),
        ("PATCH", path.clone(), Some(json!({"title":"missing plan"}))),
        ("DELETE", path.clone(), None),
        ("POST", format!("{path}/generate"), Some(json!({}))),
        ("POST", format!("{path}/start"), None),
        ("POST", format!("{path}/tasks/missing/start"), None),
    ] {
        request(s, method, &path, body, 404)?;
    }
    Ok(())
}
