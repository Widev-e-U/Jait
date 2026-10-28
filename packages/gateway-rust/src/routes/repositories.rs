//! Authenticated repository REST API. Generation uses an explicitly injected authority.
use super::auth::{self, AuthState, response};
pub use crate::execution::process_runner::ProcessCancellation as EffectCancellation;
use crate::services::{repositories::*, users::Patch};
use axum::{
    Router,
    extract::{Request, State},
    http::Method,
    response::Response,
    routing::{get, patch, post},
};
use futures_util::future::BoxFuture;
use serde_json::{Value, json};
use std::sync::Arc;
pub(crate) struct EffectCancellationGuard(pub EffectCancellation);
impl Drop for EffectCancellationGuard {
    fn drop(&mut self) {
        self.0.cancel();
    }
}
pub(crate) fn effect_permit() -> ApiResult<tokio::sync::OwnedSemaphorePermit> {
    static SLOTS: std::sync::OnceLock<Arc<tokio::sync::Semaphore>> = std::sync::OnceLock::new();
    SLOTS
        .get_or_init(|| Arc::new(tokio::sync::Semaphore::new(4)))
        .clone()
        .try_acquire_owned()
        .map_err(|_| error(503, "Effect capacity exhausted"))
}
pub type RepositoryAutoAssignPort =
    Arc<dyn Fn(String, EffectCancellation) -> BoxFuture<'static, Result<(), String>> + Send + Sync>;
pub type EventSink = Arc<dyn Fn(&str, Value) + Send + Sync>;
#[derive(Clone, Debug)]
pub struct GenerationRequest {
    pub owner: String,
    pub repository: RepositoryRecord,
    pub purpose: GenerationPurpose,
    pub prompt: String,
    pub provider: String,
    pub model: Option<String>,
    pub supervised: bool,
    pub existing: Vec<Value>,
}
#[derive(Clone, Copy, Debug)]
pub enum GenerationPurpose {
    Strategy,
    PlanTasks,
    Todos,
}
/// Implementations enforce filesystem/node/provider policy and supervise cleanup.
/// Cancellation fires on HTTP cancellation and the bounded deadline.
pub type Generator = Arc<
    dyn Fn(GenerationRequest, EffectCancellation) -> BoxFuture<'static, Result<String, String>>
        + Send
        + Sync,
>;
pub(crate) type ApiResult<T> = Result<T, Box<Response>>;
pub(crate) fn error(status: u16, msg: &str) -> Box<Response> {
    Box::new(response(status, json!({"error":msg})))
}
pub(crate) async fn database<T: Send + 'static>(
    auth: &AuthState,
    f: impl FnOnce(&rusqlite::Connection) -> rusqlite::Result<T> + Send + 'static,
) -> ApiResult<T> {
    auth.with_database(move |db| Ok(f(db)?))
        .await
        .map_err(|e| Box::new(auth::database_failure(&e)))
}
pub(crate) async fn with_repo<T: Send + 'static>(
    auth: &AuthState,
    id: String,
    user: String,
    f: impl FnOnce(&rusqlite::Connection, RepositoryRecord) -> rusqlite::Result<T> + Send + 'static,
) -> ApiResult<T> {
    database(auth, move |db| {
        let Some(repo) = RepositoryService::new(db)
            .get(&id)?
            .filter(|r| r.user_id.as_deref() == Some(&user))
        else {
            return Ok(None);
        };
        f(db, repo).map(Some)
    })
    .await?
    .ok_or_else(|| error(404, "Repository not found"))
}
pub(crate) async fn owned(
    auth: &AuthState,
    id: String,
    user: String,
) -> ApiResult<RepositoryRecord> {
    database(auth, move |db| RepositoryService::new(db).get(&id))
        .await?
        .filter(|r| r.user_id.as_deref() == Some(&user))
        .ok_or_else(|| error(404, "Repository not found"))
}
pub(crate) fn segments(path: &str) -> Vec<String> {
    path.trim_matches('/')
        .split('/')
        .map(|s| {
            percent_encoding::percent_decode_str(s)
                .decode_utf8_lossy()
                .into_owned()
        })
        .collect()
}
pub(crate) fn bounded(status: u16, v: Value) -> Response {
    if serde_json::to_vec(&v).map_or(true, |v| v.len() > 2 * 1024 * 1024) {
        return response(502, json!({"error":"Response exceeds byte limit"}));
    }
    response(status, v)
}
pub(crate) fn publish(events: &Option<EventSink>, kind: &str, v: Value) {
    if let Some(events) = events {
        events(kind, v)
    }
}
pub(crate) async fn generate(
    port: &Option<Generator>,
    request: GenerationRequest,
) -> ApiResult<String> {
    let Some(port) = port else {
        return Err(error(503, "Generation service is unavailable"));
    };
    let _permit = effect_permit()?;
    let cancel = EffectCancellation::default();
    let _guard = EffectCancellationGuard(cancel.clone());
    let result = tokio::time::timeout(std::time::Duration::from_secs(120), port(request, cancel))
        .await
        .map_err(|_| error(504, "Generation timed out"))?
        .map_err(|e| error(500, &e))?;
    if result.len() > 512 * 1024 {
        return Err(error(502, "Generated output exceeds byte limit"));
    }
    Ok(result)
}
pub(crate) fn generation(
    owner: String,
    repository: RepositoryRecord,
    purpose: GenerationPurpose,
    body: &Value,
    existing: Vec<Value>,
) -> GenerationRequest {
    GenerationRequest {
        owner,
        repository,
        purpose,
        prompt: body["prompt"].as_str().unwrap_or("").trim().into(),
        provider: body["provider"].as_str().unwrap_or("jait").into(),
        model: body["model"]
            .as_str()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_owned),
        supervised: body["runtimeMode"] == "supervised",
        existing,
    }
}
pub(crate) fn generated_array(raw: &str) -> ApiResult<Vec<Value>> {
    let fence = String::from_utf8(vec![96; 3]).unwrap();
    let mut raw = raw.trim();
    if let Some(stripped) = raw.strip_prefix(fence.as_str()) {
        raw = stripped
            .strip_prefix("json")
            .or_else(|| stripped.strip_prefix("JSON"))
            .unwrap_or(stripped)
            .trim_start();
        raw = raw.strip_suffix(fence.as_str()).unwrap_or(raw).trim_end();
    }
    let value: Value =
        serde_json::from_str(raw).map_err(|_| error(500, "LLM returned invalid JSON"))?;
    value
        .as_array()
        .cloned()
        .ok_or_else(|| error(500, "LLM did not return an array"))
}
#[derive(Clone)]
pub struct RepositoryRoutes {
    pub auth: AuthState,
    pub events: Option<EventSink>,
    pub generator: Option<Generator>,
    pub auto_assign: Option<RepositoryAutoAssignPort>,
}
impl RepositoryRoutes {
    pub fn new(auth: AuthState) -> Self {
        Self {
            auth,
            events: None,
            generator: None,
            auto_assign: None,
        }
    }
    pub fn router(self) -> Router {
        Router::new()
            .route("/api/repos", get(handle).post(handle))
            .route("/api/repos/{id}", patch(handle).delete(handle))
            .route("/api/repos/{id}/strategy", get(handle).put(handle))
            .route("/api/repos/{id}/strategy/generate", post(handle))
            .with_state(self)
    }
}
async fn handle(State(s): State<RepositoryRoutes>, req: Request) -> Response {
    match dispatch(s, req).await {
        Ok(r) => r,
        Err(r) => *r,
    }
}
async fn dispatch(s: RepositoryRoutes, req: Request) -> ApiResult<Response> {
    let h = req.headers().clone();
    let method = req.method().clone();
    let parts = segments(req.uri().path());
    let owner = auth::require_user(&s.auth, &h).await?.id;
    let body = auth::parse_body(req.into_body(), &h).await?;
    if parts.len() == 2 {
        if method == Method::GET {
            if let Some(assign) = &s.auto_assign {
                let _permit = effect_permit()?;
                let cancel = EffectCancellation::default();
                let _guard = EffectCancellationGuard(cancel.clone());
                tokio::time::timeout(
                    std::time::Duration::from_secs(60),
                    assign(owner.clone(), cancel),
                )
                .await
                .map_err(|_| error(504, "Repository synchronization timed out"))?
                .map_err(|e| error(500, &e))?;
            }
            let rows = database(&s.auth, move |db| {
                RepositoryService::new(db).list(Some(&owner))
            })
            .await?;
            return Ok(bounded(200, json!({"repos":rows})));
        }
        let mut data: CreateRepository = serde_json::from_value(body.clone())
            .map_err(|_| error(400, "name and localPath are required"))?;
        if data.name.is_empty() || data.local_path.is_empty() {
            return Err(error(400, "name and localPath are required"));
        }
        data.user_id = Some(owner.clone());
        let (row, kind) = database(&s.auth, move |db| {
            let store = RepositoryService::new(db);
            if let Some(existing) = store.find_by_path(&data.local_path, Some(&owner))? {
                let device = data
                    .device_id
                    .as_deref()
                    .map(str::trim)
                    .filter(|s| !s.is_empty())
                    .map(str::to_owned);
                if existing.device_id != device {
                    let row = store
                        .update(
                            &existing.id,
                            RepositoryPatch {
                                device_id: Patch::Set(device),
                                ..Default::default()
                            },
                        )?
                        .unwrap_or(existing);
                    return Ok((row, Some("repo.updated")));
                }
                return Ok((existing, None));
            }
            Ok((store.create(data)?, Some("repo.created")))
        })
        .await?;
        if let Some(kind) = kind {
            publish(&s.events, kind, json!({"repo":row}))
        }
        return Ok(bounded(200, json!({"repo":row})));
    }
    let repo = owned(&s.auth, parts[2].clone(), owner.clone()).await?;
    if parts.len() > 3 {
        if method == Method::GET {
            return Ok(bounded(
                200,
                json!({"strategy":repo.strategy.unwrap_or_default()}),
            ));
        }
        if parts.len() == 5 {
            let result = generate(
                &s.generator,
                generation(
                    owner.clone(),
                    repo,
                    GenerationPurpose::Strategy,
                    &body,
                    vec![],
                ),
            )
            .await?;
            if result.trim().is_empty() {
                return Err(error(500, "LLM returned empty strategy"));
            }
            return Ok(bounded(200, json!({"strategy":result.trim()})));
        }
        if !body["strategy"].is_string() {
            return Err(error(400, "strategy must be a string"));
        }
    }
    let id = repo.id;
    if method == Method::DELETE {
        let key = id.clone();
        with_repo(&s.auth, key, owner.clone(), move |db, repo| {
            RepositoryService::new(db).delete(&repo.id)
        })
        .await?;
        publish(&s.events, "repo.deleted", json!({"repoId":id}));
        return Ok(response(200, json!({"ok":true})));
    }
    let patch: RepositoryPatch = serde_json::from_value(if parts.len() > 3 {
        json!({"strategy":body["strategy"]})
    } else {
        body
    })
    .map_err(|_| error(400, "Invalid repository update"))?;
    let row = with_repo(&s.auth, id, owner, move |db, repo| {
        RepositoryService::new(db).update(&repo.id, patch)
    })
    .await?
    .ok_or_else(|| error(404, "Repository not found"))?;
    publish(&s.events, "repo.updated", json!({"repo":row}));
    Ok(bounded(200, json!({"repo":row})))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::security::http_auth::{AuthUser, sign_auth_token};
    use crate::services::users::UserService;
    struct Server {
        base: String,
        task: tokio::task::JoinHandle<()>,
    }
    impl Drop for Server {
        fn drop(&mut self) {
            self.task.abort();
        }
    }
    async fn server(router: Router) -> Server {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        let task = tokio::spawn(async move { axum::serve(listener, router).await.unwrap() });
        Server { base, task }
    }
    fn fixture() -> (AuthState, String, String, String) {
        let db = rusqlite::Connection::open_in_memory().unwrap();
        crate::db::migrate_database(&db).unwrap();
        let owner = UserService::new(&db)
            .create_user_with_hash("route-owner", "test-hash")
            .unwrap();
        let other = UserService::new(&db)
            .create_user_with_hash("route-other", "test-hash")
            .unwrap();
        let repo = RepositoryService::new(&db)
            .create(
                serde_json::from_value(
                    json!({"name":"test","localPath":"/explicit-test-root","userId":owner.id}),
                )
                .unwrap(),
            )
            .unwrap();
        let secret = "route-test-secret-at-least-thirty-two-bytes";
        let token = sign_auth_token(
            &AuthUser {
                id: owner.id,
                username: owner.username,
            },
            secret,
        )
        .unwrap();
        (
            AuthState::new(db, secret.into()).unwrap(),
            repo.id,
            other.id,
            token,
        )
    }
    async fn request(
        server: &Server,
        token: &str,
        method: &str,
        path: &str,
        body: Option<Value>,
    ) -> (u16, Value) {
        let mut request = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(3))
            .build()
            .unwrap()
            .request(method.parse().unwrap(), format!("{}{}", server.base, path))
            .bearer_auth(token);
        if let Some(body) = body {
            request = request.json(&body)
        }
        let result = request.send().await.unwrap();
        let status = result.status().as_u16();
        (status, result.json().await.unwrap())
    }
    #[tokio::test]
    async fn repository_dedup_strategy_and_ownership() {
        let (auth, id, other, token) = fixture();
        let router = RepositoryRoutes::new(auth.clone()).router();
        let server = server(router).await;
        let (status, v) = request(&server, &token, "GET", "/api/repos", None).await;
        assert_eq!(status, 200);
        assert_eq!(v["repos"].as_array().unwrap().len(), 1);
        let (status, v) = request(
            &server,
            &token,
            "POST",
            "/api/repos",
            Some(json!({"name":"renamed","localPath":"/explicit-test-root","deviceId":" remote "})),
        )
        .await;
        assert_eq!(status, 200);
        assert_eq!(v["repo"]["id"], id);
        assert_eq!(v["repo"]["deviceId"], "remote");
        let (status, _) = request(
            &server,
            &token,
            "PUT",
            &format!("/api/repos/{id}/strategy"),
            Some(json!({"strategy":"documented"})),
        )
        .await;
        assert_eq!(status, 200);
        let (_, v) = request(
            &server,
            &token,
            "GET",
            &format!("/api/repos/{id}/strategy"),
            None,
        )
        .await;
        assert_eq!(v["strategy"], "documented");
        let key = id.clone();
        auth.with_database(move |db| {
            db.execute(
                "UPDATE automation_repositories SET user_id=? WHERE id=?",
                rusqlite::params![other, key],
            )?;
            Ok(())
        })
        .await
        .unwrap();
        let (status, _) =
            request(&server, &token, "DELETE", &format!("/api/repos/{id}"), None).await;
        assert_eq!(status, 404);
        assert_eq!(
            request(&server, "invalid", "GET", "/api/repos", None)
                .await
                .0,
            401
        );
        auth.shutdown().await.unwrap();
    }
    #[tokio::test]
    async fn plan_start_prepares_browser_tasks_and_generation_appends() {
        let (auth, id, _, token) = fixture();
        let mut plans = super::super::plans::PlanRoutes::new(auth.clone());
        plans.generator = Some(Arc::new(|request, cancel| {
            assert!(matches!(request.purpose, GenerationPurpose::PlanTasks));
            assert!(!cancel.is_cancelled());
            Box::pin(async { Ok("[{\"title\":\"generated\",\"description\":\"details\"}]".into()) })
        }));
        let server = server(plans.router()).await;
        let (status, v) = request(
            &server,
            &token,
            "POST",
            &format!("/api/repos/{id}/plans"),
            Some(json!({"tasks":[{"id":"one","title":"existing","status":"proposed"}]})),
        )
        .await;
        assert_eq!(status, 201);
        let plan = v["plan"]["id"].as_str().unwrap();
        let path = format!("/api/plans/{plan}");
        let (status, v) = request(
            &server,
            &token,
            "POST",
            &format!("{path}/tasks/one/start"),
            None,
        )
        .await;
        assert_eq!(status, 200);
        assert_eq!(v["task"]["status"], "proposed");
        let (status, v) = request(&server, &token, "POST", &format!("{path}/start"), None).await;
        assert_eq!(status, 200);
        assert_eq!(v["tasks"][0]["status"], "approved");
        assert_eq!(v["repo"]["id"], id);
        let (status, v) = request(
            &server,
            &token,
            "POST",
            &format!("{path}/generate"),
            Some(json!({})),
        )
        .await;
        assert_eq!(status, 200);
        assert_eq!(v["generated"], 1);
        assert_eq!(v["plan"]["tasks"].as_array().unwrap().len(), 2);
        auth.shutdown().await.unwrap();
    }
    #[tokio::test]
    async fn todo_aliases_normalization_and_history() {
        let (auth, id, _, token) = fixture();
        let server =
            server(super::super::repo_proposals::RepoProposalRoutes::new(auth.clone()).router())
                .await;
        let (status, v) = request(
            &server,
            &token,
            "POST",
            &format!("/api/repos/{id}/todos"),
            Some(json!({"message":" useful task ","tags":[" One ","one"],"dueDate":"bad"})),
        )
        .await;
        assert_eq!(status, 201);
        let todo = v["todo"]["id"].as_str().unwrap();
        assert_eq!(v["todo"]["message"], "useful task");
        assert_eq!(v["todo"]["tags"], "[\"one\"]");
        assert!(v["todo"]["dueDate"].is_null());
        let (status, v) = request(
            &server,
            &token,
            "PATCH",
            &format!("/api/repo-proposals/{todo}"),
            Some(json!({"status":"done"})),
        )
        .await;
        assert_eq!(status, 200);
        assert!(v["proposal"]["completedAt"].is_string());
        let (status, v) = request(
            &server,
            &token,
            "GET",
            &format!("/api/repos/{id}/proposals"),
            None,
        )
        .await;
        assert_eq!(status, 200);
        assert_eq!(v["proposals"][0]["status"], "done");
        let (status, _) = request(
            &server,
            &token,
            "PATCH",
            &format!("/api/jait-todos/{todo}"),
            Some(json!({"status":"invalid"})),
        )
        .await;
        assert_eq!(status, 400);
        auth.shutdown().await.unwrap();
    }
    #[tokio::test]
    async fn pull_requests_deny_missing_authority_validate_and_bind_owner() {
        use super::super::pull_requests::*;
        let (auth, id, _, token) = fixture();
        let server_denied = server(PullRequestRoutes::new(auth.clone()).router()).await;
        let path = format!("/api/repos/{id}/pull-requests");
        assert_eq!(
            request(&server_denied, &token, "GET", &path, None).await.0,
            503
        );
        let seen = Arc::new(std::sync::Mutex::new(Vec::new()));
        let sink = seen.clone();
        let mut routes = PullRequestRoutes::new(auth.clone());
        routes.operations = Some(Arc::new(move |request, _| {
            assert_eq!(
                request.repository.user_id.as_deref(),
                Some(request.owner.as_str())
            );
            let result = match &request.operation {
                PullRequestOperation::List { limit, state } => {
                    assert_eq!(*limit, 100);
                    assert_eq!(state, "open");
                    json!([])
                }
                _ => Value::Null,
            };
            sink.lock()
                .unwrap()
                .push(format!("{:?}", request.operation));
            Box::pin(async move { Ok(result) })
        }));
        let server = server(routes.router()).await;
        assert_eq!(
            request(
                &server,
                &token,
                "GET",
                &format!("{path}?limit=999&state=bad"),
                None
            )
            .await
            .0,
            200
        );
        assert_eq!(
            request(
                &server,
                &token,
                "POST",
                &format!("{path}/7/comments"),
                Some(json!({"body":" "}))
            )
            .await
            .0,
            400
        );
        assert_eq!(
            request(
                &server,
                &token,
                "POST",
                &format!("{path}/7/merge"),
                Some(json!({"method":"invalid"}))
            )
            .await
            .0,
            400
        );
        assert_eq!(
            request(
                &server,
                &token,
                "PATCH",
                &format!("{path}/7"),
                Some(json!({"title":" edited ","state":"closed"}))
            )
            .await
            .0,
            200
        );
        {
            let seen = seen.lock().unwrap();
            assert_eq!(seen.len(), 3);
            assert!(seen[1].starts_with("Update"));
            assert!(seen[2].starts_with("SetState"));
        }
        auth.shutdown().await.unwrap();
    }
    #[tokio::test]
    async fn generation_cancels_on_request_drop() {
        let (auth, id, _, _) = fixture();
        let repository = database(&auth, move |db| RepositoryService::new(db).get(&id))
            .await
            .unwrap()
            .unwrap();
        let (sent, received) = tokio::sync::oneshot::channel();
        let sent = Arc::new(std::sync::Mutex::new(Some(sent)));
        let port: Generator = Arc::new(move |_, cancel| {
            assert!(sent.lock().unwrap().take().unwrap().send(cancel).is_ok());
            Box::pin(std::future::pending())
        });
        let request = generation(
            repository.user_id.clone().unwrap(),
            repository,
            GenerationPurpose::Strategy,
            &json!({}),
            vec![],
        );
        let task = tokio::spawn(async move { generate(&Some(port), request).await });
        let cancel = received.await.unwrap();
        assert!(!cancel.is_cancelled());
        task.abort();
        let _ = task.await;
        assert!(cancel.is_cancelled());
        auth.shutdown().await.unwrap();
    }
}
