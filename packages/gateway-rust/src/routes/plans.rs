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

// Decide from the current row while holding SQLite's write reservation. The
// browser still creates the thread; approval alone is not a thread reservation.
enum TaskAdmission {
    PlanMissing,
    TaskMissing,
    AlreadyStarted,
    Accepted {
        task: Value,
        plan: Option<Box<PlanRecord>>,
    },
}

fn admit_task(
    db: &rusqlite::Connection,
    id: &str,
    owner: &str,
    task_id: &str,
) -> rusqlite::Result<TaskAdmission> {
    let tx = rusqlite::Transaction::new_unchecked(db, rusqlite::TransactionBehavior::Immediate)?;
    let service = PlanService::new(&tx);
    let Some(plan) = service
        .get(id)?
        .filter(|plan| plan.user_id.as_deref() == Some(owner))
    else {
        return Ok(TaskAdmission::PlanMissing);
    };
    let Some(task) = plan
        .tasks
        .iter()
        .find(|task| task["id"].as_str() == Some(task_id))
        .cloned()
    else {
        return Ok(TaskAdmission::TaskMissing);
    };
    if task["threadId"]
        .as_str()
        .is_some_and(|thread| !thread.is_empty())
    {
        return Ok(TaskAdmission::AlreadyStarted);
    }
    if task["status"] == "proposed" {
        service.update_task(
            id,
            task_id,
            json!({"status":"approved"}).as_object().unwrap(),
        )?;
    }
    let plan = service.get(id)?;
    tx.commit()?;
    Ok(TaskAdmission::Accepted {
        task,
        plan: plan.map(Box::new),
    })
}

enum BulkAdmission {
    PlanMissing,
    NoTasks,
    Accepted {
        tasks: Vec<Value>,
        plan: Option<Box<PlanRecord>>,
    },
}

fn admit_tasks(
    db: &rusqlite::Connection,
    id: &str,
    owner: &str,
) -> rusqlite::Result<BulkAdmission> {
    let tx = rusqlite::Transaction::new_unchecked(db, rusqlite::TransactionBehavior::Immediate)?;
    let service = PlanService::new(&tx);
    let Some(plan) = service
        .get(id)?
        .filter(|plan| plan.user_id.as_deref() == Some(owner))
    else {
        return Ok(BulkAdmission::PlanMissing);
    };
    let tasks: Vec<_> = plan
        .tasks
        .into_iter()
        .filter(|task| {
            task["status"] == "approved" && task["threadId"].as_str().is_none_or(str::is_empty)
        })
        .collect();
    if tasks.is_empty() {
        return Ok(BulkAdmission::NoTasks);
    }
    let plan = service.update(
        id,
        PlanPatch {
            status: Some("active".into()),
            ..Default::default()
        },
    )?;
    tx.commit()?;
    Ok(BulkAdmission::Accepted {
        tasks,
        plan: plan.map(Box::new),
    })
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
        let task_id = parts[4].clone();
        let plan_id = id.clone();
        let user = owner.clone();
        let admission =
            database(&s.auth, move |db| admit_task(db, &plan_id, &user, &task_id)).await?;
        let (task, row) = match admission {
            TaskAdmission::PlanMissing => return Err(error(404, "Plan not found")),
            TaskAdmission::TaskMissing => return Err(error(404, "Task not found in plan")),
            TaskAdmission::AlreadyStarted => return Err(error(409, "Task already has a thread")),
            TaskAdmission::Accepted { task, plan } => (task, plan),
        };
        publish(&s.events, "plan.updated", json!({"plan":row}));
        return Ok(bounded(200, json!({"task":task,"repo":repo_view})));
    }
    let plan_id = id.clone();
    let user = owner.clone();
    let admission = database(&s.auth, move |db| admit_tasks(db, &plan_id, &user)).await?;
    let (tasks, row) = match admission {
        BulkAdmission::PlanMissing => return Err(error(404, "Plan not found")),
        BulkAdmission::NoTasks => return Err(error(400, "No approved tasks to start")),
        BulkAdmission::Accepted { tasks, plan } => (tasks, plan),
    };
    publish(&s.events, "plan.updated", json!({"plan":row}));
    Ok(bounded(200, json!({"tasks":tasks,"repo":repo_view})))
}

#[cfg(test)]
mod admission_tests {
    use super::*;

    #[test]
    fn task_admission_observes_concurrent_committed_thread() {
        use std::{sync::mpsc, time::Duration};
        let artifact_dir =
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../.jait/artifacts");
        std::fs::create_dir_all(&artifact_dir).unwrap();
        let path = artifact_dir.join(format!("plan-admission-{}.sqlite", uuid::Uuid::new_v4()));
        let db = rusqlite::Connection::open(&path).unwrap();
        db.execute_batch(r#"CREATE TABLE automation_plans (id TEXT PRIMARY KEY, repo_id TEXT, user_id TEXT, title TEXT, status TEXT, tasks TEXT, created_at TEXT, updated_at TEXT); INSERT INTO automation_plans VALUES ('p','r','u','plan','draft','[{"id":"t","status":"proposed"}]','now','now');"#).unwrap();
        let tx =
            rusqlite::Transaction::new_unchecked(&db, rusqlite::TransactionBehavior::Immediate)
                .unwrap();
        PlanService::new(&tx)
            .update_task("p", "t", json!({"threadId":"thread"}).as_object().unwrap())
            .unwrap();
        let (started_tx, started_rx) = mpsc::channel();
        let (finished_tx, finished_rx) = mpsc::channel();
        let thread_path = path.clone();
        let worker = std::thread::spawn(move || {
            let other = rusqlite::Connection::open(thread_path).unwrap();
            other.busy_timeout(Duration::from_secs(5)).unwrap();
            started_tx.send(()).unwrap();
            finished_tx.send(admit_task(&other, "p", "u", "t")).unwrap();
        });
        started_rx.recv_timeout(Duration::from_secs(5)).unwrap();
        assert!(matches!(
            finished_rx.recv_timeout(Duration::from_millis(100)),
            Err(mpsc::RecvTimeoutError::Timeout)
        ));
        tx.commit().unwrap();
        assert!(matches!(
            finished_rx
                .recv_timeout(Duration::from_secs(5))
                .unwrap()
                .unwrap(),
            TaskAdmission::AlreadyStarted
        ));
        worker.join().unwrap();
        drop(db);
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn bulk_admission_uses_current_tasks_and_activates_plan() {
        let db = rusqlite::Connection::open_in_memory().unwrap();
        db.execute_batch("CREATE TABLE automation_plans (id TEXT PRIMARY KEY, repo_id TEXT, user_id TEXT, title TEXT, status TEXT, tasks TEXT, created_at TEXT, updated_at TEXT); INSERT INTO automation_plans VALUES ('p','r','u','plan','draft','[]','now','now');").unwrap();
        let service = PlanService::new(&db);
        service
            .update(
                "p",
                PlanPatch {
                    tasks: Some(vec![
                        json!({"id":"linked","status":"approved","threadId":"existing"}),
                        json!({"id":"ready","status":"approved"}),
                        json!({"id":"proposed","status":"proposed"}),
                    ]),
                    ..Default::default()
                },
            )
            .unwrap();
        let BulkAdmission::Accepted { tasks, plan } = admit_tasks(&db, "p", "u").unwrap() else {
            panic!("expected admission")
        };
        assert_eq!(tasks.len(), 1);
        assert_eq!(tasks[0]["id"], "ready");
        assert_eq!(plan.unwrap().status, "active");
        service
            .update_task("p", "ready", json!({"threadId":"new"}).as_object().unwrap())
            .unwrap();
        assert!(matches!(
            admit_tasks(&db, "p", "u").unwrap(),
            BulkAdmission::NoTasks
        ));
        assert!(matches!(
            admit_tasks(&db, "p", "other").unwrap(),
            BulkAdmission::PlanMissing
        ));
    }

    #[test]
    fn task_admission_uses_current_database_state() {
        let db = rusqlite::Connection::open_in_memory().unwrap();
        db.execute_batch("CREATE TABLE automation_plans (id TEXT PRIMARY KEY, repo_id TEXT, user_id TEXT, title TEXT, status TEXT, tasks TEXT, created_at TEXT, updated_at TEXT);
            INSERT INTO automation_plans VALUES ('p','r','u','plan','draft','[]','now','now');").unwrap();
        let service = PlanService::new(&db);
        service
            .update(
                "p",
                PlanPatch {
                    tasks: Some(vec![json!({"id":"t","status":"proposed"})]),
                    ..Default::default()
                },
            )
            .unwrap();
        let TaskAdmission::Accepted { task, plan } = admit_task(&db, "p", "u", "t").unwrap() else {
            panic!("expected admission")
        };
        assert_eq!(task["status"], "proposed");
        assert_eq!(plan.unwrap().tasks[0]["status"], "approved");
        service
            .update_task("p", "t", json!({"threadId":"thread"}).as_object().unwrap())
            .unwrap();
        assert!(matches!(
            admit_task(&db, "p", "u", "t").unwrap(),
            TaskAdmission::AlreadyStarted
        ));
        service
            .update(
                "p",
                PlanPatch {
                    tasks: Some(vec![]),
                    ..Default::default()
                },
            )
            .unwrap();
        assert!(matches!(
            admit_task(&db, "p", "u", "t").unwrap(),
            TaskAdmission::TaskMissing
        ));
        assert!(matches!(
            admit_task(&db, "p", "other", "t").unwrap(),
            TaskAdmission::PlanMissing
        ));
    }
}
