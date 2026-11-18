//! Owned repository pull-request REST handlers with an injected operation authority.
//! No remote URL, credentials, process arguments or execution node are selected by clients.
use super::{
    auth::{self, AuthState, response},
    repositories::*,
};
use axum::{
    Router,
    extract::{Request, State},
    http::Method,
    response::Response,
    routing::{get, post},
};
use futures_util::future::BoxFuture;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{collections::BTreeMap, sync::Arc};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ReviewEvent {
    Approve,
    Comment,
    RequestChanges,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MergeMethod {
    Merge,
    Squash,
    Rebase,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ConflictSide {
    Ours,
    Theirs,
}
#[derive(Clone, Debug)]
pub enum PullRequestOperation {
    List {
        state: String,
        limit: u32,
    },
    Get {
        number: u64,
    },
    Diff {
        number: u64,
    },
    Comment {
        number: u64,
        body: String,
    },
    Review {
        number: u64,
        event: ReviewEvent,
        body: String,
    },
    Merge {
        number: u64,
        method: MergeMethod,
        delete_branch: bool,
    },
    ResolveConflicts {
        number: u64,
        resolution: Option<BTreeMap<String, ConflictSide>>,
    },
    Update {
        number: u64,
        title: Option<String>,
        body: Option<String>,
    },
    SetState {
        number: u64,
        state: String,
    },
}
#[derive(Clone, Debug)]
pub struct PullRequestRequest {
    pub owner: String,
    pub repository: crate::services::repositories::RepositoryRecord,
    pub operation: PullRequestOperation,
}
/// Implementations must supervise all descendants and honor cancellation and remote policy.
pub type PullRequestPort = Arc<
    dyn Fn(PullRequestRequest, EffectCancellation) -> BoxFuture<'static, Result<Value, String>>
        + Send
        + Sync,
>;
#[derive(Clone)]
pub struct PullRequestRoutes {
    pub auth: AuthState,
    pub operations: Option<PullRequestPort>,
}
impl PullRequestRoutes {
    pub fn new(auth: AuthState) -> Self {
        Self {
            auth,
            operations: None,
        }
    }
    pub fn router(self) -> Router {
        Router::new()
            .route("/api/repos/{id}/pull-requests", get(handle))
            .route(
                "/api/repos/{id}/pull-requests/{number}",
                get(handle).patch(handle),
            )
            .route("/api/repos/{id}/pull-requests/{number}/diff", get(handle))
            .route(
                "/api/repos/{id}/pull-requests/{number}/comments",
                post(handle),
            )
            .route(
                "/api/repos/{id}/pull-requests/{number}/reviews",
                post(handle),
            )
            .route("/api/repos/{id}/pull-requests/{number}/merge", post(handle))
            .route(
                "/api/repos/{id}/pull-requests/{number}/resolve-conflicts",
                post(handle),
            )
            .with_state(self)
    }
}
fn parse_integer(raw: &str) -> Option<i64> {
    let raw = raw.trim_start();
    let sign = if raw.starts_with('-') { -1 } else { 1 };
    let raw = raw.strip_prefix(['+', '-']).unwrap_or(raw);
    let digits: String = raw.chars().take_while(char::is_ascii_digit).collect();
    digits.parse::<i64>().ok().and_then(|v| v.checked_mul(sign))
}
async fn handle(State(s): State<PullRequestRoutes>, req: Request) -> Response {
    match dispatch(s, req).await {
        Ok(r) => r,
        Err(r) => *r,
    }
}
async fn dispatch(s: PullRequestRoutes, req: Request) -> ApiResult<Response> {
    let h = req.headers().clone();
    let method = req.method().clone();
    let parts = segments(req.uri().path());
    let query = req.uri().query().unwrap_or("").to_owned();
    let owner = auth::require_user(&s.auth, &h).await?.id;
    let repo = owned(&s.auth, parts[2].clone(), owner.clone()).await?;
    let Some(port) = s.operations else {
        return Err(error(503, "GitHub pull request service is unavailable"));
    };
    let body = auth::parse_body(req.into_body(), &h).await?;
    let invoke = |operation| {
        let request = PullRequestRequest {
            owner: owner.clone(),
            repository: repo.clone(),
            operation,
        };
        let port = port.clone();
        async move {
            let _permit = effect_permit()?;
            let token = EffectCancellation::default();
            let _guard = EffectCancellationGuard(token.clone());
            tokio::time::timeout(std::time::Duration::from_secs(120), port(request, token))
                .await
                .map_err(|_| error(504, "Pull request operation timed out"))?
                .map_err(|e| error(502, &e))
        }
    };
    if parts.len() == 4 {
        let query: BTreeMap<_, _> = url::form_urlencoded::parse(query.as_bytes())
            .into_owned()
            .collect();
        let state = query
            .get("state")
            .map(String::as_str)
            .filter(|s| matches!(*s, "open" | "closed" | "merged" | "all"))
            .unwrap_or("open")
            .to_owned();
        let limit = query
            .get("limit")
            .and_then(|v| parse_integer(v))
            .unwrap_or(50)
            .clamp(1, 100) as u32;
        let rows = invoke(PullRequestOperation::List { state, limit }).await?;
        return Ok(bounded(200, json!({"pullRequests":rows})));
    }
    let number = parse_integer(&parts[4])
        .filter(|n| *n > 0)
        .ok_or_else(|| error(400, "Invalid pull request number"))? as u64;
    if parts.len() == 5 && method == Method::GET {
        return Ok(bounded(
            200,
            json!({"pullRequest":invoke(PullRequestOperation::Get{number}).await?}),
        ));
    }
    if parts.len() == 5 {
        let state = body["state"].as_str().filter(|v| !v.is_empty());
        if state.is_some_and(|s| !matches!(s, "open" | "closed")) {
            return Err(error(400, "Invalid pull request state"));
        }
        let has_edit = body.get("title").is_some() || body.get("body").is_some();
        if state.is_none() && !has_edit {
            return Err(error(400, "No changes supplied"));
        }
        if has_edit {
            let title = body["title"].as_str().map(str::trim).map(str::to_owned);
            if body.get("title").is_some() && title.as_ref().is_none_or(String::is_empty) {
                return Err(error(400, "Pull request title cannot be empty"));
            }
            invoke(PullRequestOperation::Update {
                number,
                title,
                body: body["body"].as_str().map(str::to_owned),
            })
            .await?;
        }
        if let Some(state) = state {
            invoke(PullRequestOperation::SetState {
                number,
                state: state.into(),
            })
            .await?;
        }
        return Ok(response(200, json!({"ok":true})));
    }
    let operation = match parts[5].as_str() {
        "diff" => {
            return Ok(bounded(
                200,
                invoke(PullRequestOperation::Diff { number }).await?,
            ));
        }
        "comments" => {
            let body = body["body"]
                .as_str()
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .ok_or_else(|| error(400, "Comment body is required"))?
                .into();
            PullRequestOperation::Comment { number, body }
        }
        "reviews" => PullRequestOperation::Review {
            number,
            event: serde_json::from_value(body["event"].clone())
                .map_err(|_| error(400, "Invalid review event"))?,
            body: body["body"].as_str().unwrap_or("").into(),
        },
        "merge" => PullRequestOperation::Merge {
            number,
            method: serde_json::from_value(body.get("method").cloned().unwrap_or(json!("squash")))
                .map_err(|_| error(400, "Invalid merge method"))?,
            delete_branch: body["deleteBranch"].as_bool().unwrap_or(true),
        },
        "resolve-conflicts" => {
            let resolution = body
                .get("resolution")
                .map(|r| serde_json::from_value(r.clone()))
                .transpose()
                .map_err(|_| error(400, "Invalid conflict resolution side"))?;
            return Ok(bounded(
                200,
                invoke(PullRequestOperation::ResolveConflicts { number, resolution }).await?,
            ));
        }
        _ => return Err(error(404, "Route not found")),
    };
    invoke(operation).await?;
    Ok(response(200, json!({"ok":true})))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn reference_integer_prefix() {
        assert_eq!(parse_integer("  +12suffix"), Some(12));
        assert_eq!(parse_integer("-1x"), Some(-1));
        assert_eq!(parse_integer("bad"), None);
    }
}
