//! Plan lifecycle REST API; thread creation remains a browser responsibility.
use super::{
    auth::{self, AuthState, response},
    repositories::*,
};
use crate::services::plans::*;
use axum::{
    Router,
    extract::{Request, State},
    http::Method,
    response::Response,
    routing::{get, post},
};
use serde_json::{Value, json};
#[derive(Clone)]
pub struct PlanRoutes {
    pub auth: AuthState,
    pub events: Option<EventSink>,
    pub generator: Option<Generator>,
}
impl PlanRoutes {
    pub fn new(auth: AuthState) -> Self {
        Self {
            auth,
            events: None,
            generator: None,
        }
    }
    pub fn router(self) -> Router {
        Router::new()
            .route("/api/repos/{repoId}/plans", get(handle).post(handle))
            .route("/api/plans/{id}", get(handle).patch(handle).delete(handle))
            .route("/api/plans/{id}/generate", post(handle))
            .route("/api/plans/{id}/start", post(handle))
            .route("/api/plans/{id}/tasks/{taskId}/start", post(handle))
            .with_state(self)
    }
}
async fn with_plan<T: Send + 'static>(
    auth: &AuthState,
    id: String,
    user: String,
    f: impl FnOnce(&rusqlite::Connection, PlanRecord) -> rusqlite::Result<T> + Send + 'static,
) -> ApiResult<T> {
    database(auth, move |db| {
        let Some(plan) = PlanService::new(db)
            .get(&id)?
            .filter(|p| p.user_id.as_deref() == Some(&user))
        else {
            return Ok(None);
        };
        f(db, plan).map(Some)
    })
    .await?
    .ok_or_else(|| error(404, "Plan not found"))
}
async fn handle(State(s): State<PlanRoutes>, req: Request) -> Response {
    match dispatch(s, req).await {
        Ok(r) => r,
        Err(r) => *r,
    }
}
async fn dispatch(s: PlanRoutes, req: Request) -> ApiResult<Response> {
    let h = req.headers().clone();
    let method = req.method().clone();
    let parts = segments(req.uri().path());
    let owner = auth::require_user(&s.auth, &h).await?.id;
    let body = auth::parse_body(req.into_body(), &h).await?;
    if parts[1] == "repos" {
        let repo = owned(&s.auth, parts[2].clone(), owner.clone()).await?;
        if method == Method::GET {
            let rows = database(&s.auth, move |db| {
                PlanService::new(db).list_by_repo(&repo.id)
            })
            .await?;
            return Ok(bounded(200, json!({"plans":rows})));
        }
        let plan = CreatePlan {
            repo_id: repo.id,
            user_id: Some(owner.clone()),
            title: body["title"].as_str().unwrap_or("New Plan").into(),
            tasks: body.get("tasks").and_then(Value::as_array).cloned(),
        };
        let row = with_repo(&s.auth, plan.repo_id.clone(), owner, move |db, _| {
            PlanService::new(db).create(plan)
        })
        .await?;
        publish(&s.events, "plan.created", json!({"plan":row}));
        return Ok(bounded(201, json!({"plan":row})));
    }
    let id = parts[2].clone();
    let key = id.clone();
    let uid = owner.clone();
    let plan = database(&s.auth, move |db| PlanService::new(db).get(&key))
        .await?
        .filter(|p| p.user_id.as_deref() == Some(&uid))
        .ok_or_else(|| error(404, "Plan not found"))?;
    if parts.len() == 3 {
        if method == Method::GET {
            return Ok(bounded(200, json!({"plan":plan})));
        }
        if method == Method::DELETE {
            with_plan(&s.auth, id, owner, move |db, plan| {
                PlanService::new(db).delete(&plan.id)
            })
            .await?;
            publish(&s.events, "plan.deleted", json!({"planId":plan.id}));
            return Ok(response(200, json!({"ok":true})));
        }
        let patch = PlanPatch {
            title: body["title"].as_str().map(str::to_owned),
            status: body["status"]
                .as_str()
                .filter(|v| matches!(*v, "draft" | "active" | "completed" | "archived"))
                .map(str::to_owned),
            tasks: body.get("tasks").and_then(Value::as_array).cloned(),
        };
        let row = with_plan(&s.auth, id, owner, move |db, plan| {
            PlanService::new(db).update(&plan.id, patch)
        })
        .await?;
        publish(&s.events, "plan.updated", json!({"plan":row}));
        return Ok(bounded(200, json!({"plan":row})));
    }
    let repo = owned(&s.auth, plan.repo_id.clone(), owner.clone()).await?;
    let repo_view = json!({"id":repo.id,"name":repo.name,"localPath":repo.local_path,"defaultBranch":repo.default_branch,"githubUrl":repo.github_url});
    if parts[3] == "generate" {
        let raw = generate(
            &s.generator,
            generation(
                owner.clone(),
                repo,
                GenerationPurpose::PlanTasks,
                &body,
                plan.tasks.clone(),
            ),
        )
        .await?;
        let tasks:Vec<Value>=generated_array(&raw)?.into_iter().filter(|v|v["title"].as_str().is_some_and(|s|!s.is_empty())).map(|v|{
       let mut task=json!({"id":new_task_id(),"title":v["title"],"description":v["description"].as_str().unwrap_or(""),"status":"proposed","skillCandidate":v["skillCandidate"]==true});
       for k in ["skillTitle","skillRationale"]{if let Some(v)=v[k].as_str().map(str::trim).filter(|s|!s.is_empty()){task[k]=json!(v)}}
       task
    }).collect();
        let count = tasks.len();
        // Re-read inside the write worker so concurrent task edits are retained.
        let row = with_plan(&s.auth, id.clone(), owner.clone(), move |db, current| {
            let service = PlanService::new(db);
            let mut all = current.tasks;
            all.extend(tasks);
            service.update(
                &id,
                PlanPatch {
                    tasks: Some(all),
                    ..Default::default()
                },
            )
        })
        .await?
        .ok_or_else(|| error(404, "Plan not found"))?;
        publish(&s.events, "plan.updated", json!({"plan":row}));
        return Ok(bounded(200, json!({"plan":row,"generated":count})));
    }
    if parts[3] == "tasks" {
        let task = plan
            .tasks
            .iter()
            .find(|t| t["id"].as_str() == Some(&parts[4]))
            .cloned()
            .ok_or_else(|| error(404, "Task not found in plan"))?;
        if task["threadId"].as_str().is_some_and(|s| !s.is_empty()) {
            return Err(error(409, "Task already has a thread"));
        }
        let task_id = parts[4].clone();
        let row = with_plan(&s.auth, id.clone(), owner.clone(), move |db, current| {
            let service = PlanService::new(db);
            let current_task = current
                .tasks
                .iter()
                .find(|t| t["id"].as_str() == Some(&task_id));
            if current_task.is_some_and(|t| {
                t["status"] == "proposed" && t["threadId"].as_str().is_none_or(str::is_empty)
            }) {
                service.update_task(
                    &id,
                    &task_id,
                    json!({"status":"approved"}).as_object().unwrap(),
                )?;
            }
            service.get(&id)
        })
        .await?;
        publish(&s.events, "plan.updated", json!({"plan":row}));
        let task = plan
            .tasks
            .into_iter()
            .find(|t| t["id"].as_str() == Some(&parts[4]))
            .unwrap();
        return Ok(bounded(200, json!({"task":task,"repo":repo_view})));
    }
    let approved: Vec<_> = plan
        .tasks
        .into_iter()
        .filter(|t| t["status"] == "approved" && t["threadId"].as_str().is_none_or(str::is_empty))
        .collect();
    if approved.is_empty() {
        return Err(error(400, "No approved tasks to start"));
    }
    let row = with_plan(&s.auth, id.clone(), owner, move |db, _| {
        PlanService::new(db).update(
            &id,
            PlanPatch {
                status: Some("active".into()),
                ..Default::default()
            },
        )
    })
    .await?;
    publish(&s.events, "plan.updated", json!({"plan":row}));
    Ok(bounded(200, json!({"tasks":approved,"repo":repo_view})))
}
