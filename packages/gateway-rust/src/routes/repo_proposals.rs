//! Repository todos and legacy proposal aliases using canonical native storage.
use super::{
    auth::{self, AuthState, response},
    repositories::*,
};
use crate::services::{repo_proposals::*, users::Patch};
use axum::{
    Router,
    extract::{Request, State},
    http::Method,
    response::Response,
    routing::{get, patch, post},
};
use serde_json::{Value, json};
use std::collections::HashSet;
#[derive(Clone)]
pub struct RepoProposalRoutes {
    pub auth: AuthState,
    pub generator: Option<Generator>,
}
impl RepoProposalRoutes {
    pub fn new(auth: AuthState) -> Self {
        Self {
            auth,
            generator: None,
        }
    }
    pub fn router(self) -> Router {
        Router::new()
            .route("/api/repos/{repoId}/proposals", get(handle).post(handle))
            .route("/api/repos/{repoId}/todos", get(handle).post(handle))
            .route("/api/repos/{repoId}/todos/generate", post(handle))
            .route("/api/repo-proposals/{id}", patch(handle).delete(handle))
            .route("/api/jait-todos/{id}", patch(handle).delete(handle))
            .with_state(self)
    }
}
fn status(v: &Value) -> Option<String> {
    v.as_str()
        .filter(|s| matches!(*s, "open" | "in_progress" | "done"))
        .map(str::to_owned)
}
fn priority(v: &Value) -> Option<String> {
    v.as_str()
        .filter(|s| matches!(*s, "low" | "normal" | "high"))
        .map(str::to_owned)
}
fn tags(v: Option<&Value>) -> Option<Vec<String>> {
    v.map(|v| {
        let mut seen = HashSet::new();
        v.as_array()
            .into_iter()
            .flatten()
            .filter_map(Value::as_str)
            .map(|s| s.trim().to_lowercase())
            .filter(|s| !s.is_empty() && seen.insert(s.clone()))
            .take(12)
            .collect()
    })
}
fn date(v: Option<&Value>) -> Patch<Option<String>> {
    match v {
        None => Patch::Missing,
        Some(v) => {
            let date = v
                .as_str()
                .filter(|s| {
                    s.len() == 10
                        && s.bytes().enumerate().all(|(i, b)| {
                            if i == 4 || i == 7 {
                                b == b'-'
                            } else {
                                b.is_ascii_digit()
                            }
                        })
                })
                .map(str::to_owned);
            Patch::Set(date)
        }
    }
}
fn create(repo: String, user: String, body: &Value) -> ApiResult<CreateProposal> {
    let message = body["message"]
        .as_str()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .ok_or_else(|| error(400, "message is required"))?
        .into();
    let due_date = match date(body.get("dueDate")) {
        Patch::Set(v) => v,
        Patch::Missing => None,
    };
    Ok(CreateProposal {
        repo_id: repo,
        user_id: Some(user),
        message,
        status: status(&body["status"]),
        priority: priority(&body["priority"]),
        due_date,
        tags: tags(body.get("tags")),
        source_thread_id: body["sourceThreadId"].as_str().map(str::to_owned),
        source_thread_title: body["sourceThreadTitle"].as_str().map(str::to_owned),
    })
}
async fn with_proposal<T: Send + 'static>(
    auth: &AuthState,
    id: String,
    user: String,
    f: impl FnOnce(&rusqlite::Connection, ProposalRecord) -> rusqlite::Result<T> + Send + 'static,
) -> ApiResult<T> {
    database(auth, move |db| {
        let Some(row) = RepoProposalService::new(db)
            .get(&id)?
            .filter(|p| p.user_id.as_deref() == Some(&user))
        else {
            return Ok(None);
        };
        f(db, row).map(Some)
    })
    .await?
    .ok_or_else(|| error(404, "Todo not found"))
}
async fn handle(State(s): State<RepoProposalRoutes>, req: Request) -> Response {
    match dispatch(s, req).await {
        Ok(r) => r,
        Err(r) => *r,
    }
}
async fn dispatch(s: RepoProposalRoutes, req: Request) -> ApiResult<Response> {
    let h = req.headers().clone();
    let method = req.method().clone();
    let parts = segments(req.uri().path());
    let owner = auth::require_user(&s.auth, &h).await?.id;
    let body = auth::parse_body(req.into_body(), &h).await?;
    if parts[1] == "repos" {
        let repo = owned(&s.auth, parts[2].clone(), owner.clone()).await?;
        if parts.len() == 5 {
            let key = repo.id.clone();
            let existing = database(&s.auth, move |db| {
                RepoProposalService::new(db).list_by_repo(&key)
            })
            .await?;
            let values = existing.iter().map(|v| json!(v)).collect();
            let raw = generate(
                &s.generator,
                generation(
                    owner.clone(),
                    repo.clone(),
                    GenerationPurpose::Todos,
                    &body,
                    values,
                ),
            )
            .await?;
            let generated = generated_array(&raw)?;
            // Re-check ownership and existing messages under the single database worker.
            let rows = database(&s.auth, move |db| {
                let current =
                    crate::services::repositories::RepositoryService::new(db).get(&repo.id)?;
                if !current.is_some_and(|r| r.user_id.as_deref() == Some(&owner)) {
                    return Ok(None);
                }
                let service = RepoProposalService::new(db);
                let existing: HashSet<_> = service
                    .list_by_repo(&repo.id)?
                    .into_iter()
                    .map(|t| t.message.trim().to_lowercase())
                    .collect();
                let mut rows = Vec::new();
                for mut item in generated.into_iter().filter(Value::is_object) {
                    if !item["message"].is_string() {
                        item["message"] = item["title"].clone()
                    }
                    let Some(message) = item["message"].as_str() else {
                        continue;
                    };
                    if message.is_empty() || existing.contains(&message.trim().to_lowercase()) {
                        continue;
                    }
                    let Ok(params) = create(repo.id.clone(), owner.clone(), &item) else {
                        continue;
                    };
                    rows.push(service.create(params)?);
                    if rows.len() == 8 {
                        break;
                    }
                }
                Ok(Some(rows))
            })
            .await?
            .ok_or_else(|| error(404, "Repository not found"))?;
            return Ok(bounded(200, json!({"todos":rows,"generated":rows.len()})));
        }
        let plural = if parts[3] == "todos" {
            "todos"
        } else {
            "proposals"
        };
        let singular = if parts[3] == "todos" {
            "todo"
        } else {
            "proposal"
        };
        if method == Method::GET {
            let rows = database(&s.auth, move |db| {
                RepoProposalService::new(db).list_by_repo(&repo.id)
            })
            .await?;
            return Ok(bounded(200, json!({(plural):rows})));
        }
        let params = create(repo.id.clone(), owner.clone(), &body)?;
        let row = with_repo(&s.auth, repo.id, owner, move |db, _| {
            RepoProposalService::new(db).create(params)
        })
        .await?;
        return Ok(bounded(201, json!({(singular):row})));
    }
    let id = parts[2].clone();
    let key = id.clone();
    let row = database(&s.auth, move |db| RepoProposalService::new(db).get(&key))
        .await?
        .filter(|p| p.user_id.as_deref() == Some(&owner))
        .ok_or_else(|| error(404, "Todo not found"))?;
    if method == Method::DELETE {
        with_proposal(&s.auth, id, owner.clone(), move |db, row| {
            RepoProposalService::new(db).delete(&row.id)
        })
        .await?;
        return Ok(response(200, json!({"ok":true})));
    }
    let message = body["message"].as_str().map(str::trim).map(str::to_owned);
    if body.get("message").is_some() && message.as_ref().is_none_or(String::is_empty) {
        return Err(error(400, "message must not be empty"));
    }
    if body.get("status").is_some() && status(&body["status"]).is_none() {
        return Err(error(400, "invalid status"));
    }
    if body.get("priority").is_some() && priority(&body["priority"]).is_none() {
        return Err(error(400, "invalid priority"));
    }
    let params = ProposalPatch {
        message,
        status: status(&body["status"]),
        priority: priority(&body["priority"]),
        due_date: date(body.get("dueDate")),
        tags: tags(body.get("tags")),
    };
    let row = with_proposal(&s.auth, row.id, owner, move |db, row| {
        RepoProposalService::new(db).update(&row.id, params)
    })
    .await?;
    let key = if parts[1] == "jait-todos" {
        "todo"
    } else {
        "proposal"
    };
    Ok(bounded(200, json!({(key):row})))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn todo_normalization() {
        assert_eq!(
            tags(Some(&json!([" One ", "one", 3, "TWO", ""]))),
            Some(vec!["one".into(), "two".into()])
        );
        assert!(matches!(date(None), Patch::Missing));
        assert!(matches!(
            date(Some(&json!("2026-10-26"))),
            Patch::Set(Some(_))
        ));
        assert!(matches!(date(Some(&json!("wrong"))), Patch::Set(None)));
    }
}
