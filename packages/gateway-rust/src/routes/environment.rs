//! Environment snapshot from native domain repositories and explicit node views.
//! Read-only composition; no discovery, network assessment or execution occurs.
use super::auth::{self, AuthState, response};
use crate::{
    contracts::{ecmascript_json::JsonDocument, json_diagnostic},
    db::worker::{DatabaseError, DatabaseWorker, OperationError},
    providers::registry::ProviderRegistry,
    services::{
        assistant_profiles::AssistantProfileService,
        calendar::{js_text, truthy},
        projects::ProjectService,
        repositories::RepositoryService,
    },
    time::Clock,
};
use axum::{
    Router,
    extract::{Request, State},
    response::{IntoResponse, Response},
    routing::get,
};
use serde::Serialize;
use serde_json::{Value, json};
use std::{collections::HashMap, sync::Arc};
pub trait EnvironmentControlPlane: Send + Sync {
    fn nodes(&self) -> Result<Vec<Value>, String>;
    fn filesystem_nodes(&self) -> Result<Vec<Value>, String>;
}
#[derive(Clone)]
pub struct EnvironmentRoutes {
    pub auth: AuthState,
    pub assistants: Option<DatabaseWorker>,
    pub projects: Option<DatabaseWorker>,
    pub repositories: Option<DatabaseWorker>,
    pub network_hosts: Option<DatabaseWorker>,
    pub providers: Option<ProviderRegistry>,
    pub nodes: Option<Arc<dyn EnvironmentControlPlane>>,
    pub clock: Clock,
}
impl EnvironmentRoutes {
    pub fn router(self) -> Router {
        Router::new()
            .route("/api/environment/snapshot", get(handle))
            .with_state(self)
    }
}
fn internal(message: &str) -> Response {
    response(
        500,
        json!({"statusCode":500,"error":"Internal Server Error","message":message}),
    )
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ParseFailure<'a> {
    status_code: u16,
    error: &'static str,
    message: &'a crate::contracts::bounded_json::Utf16Text,
}
fn database_error(error: DatabaseError) -> Box<Response> {
    if let DatabaseError::Operation(error) = error {
        if let Some(error) = error.downcast_ref::<json_diagnostic::JsonParseError>() {
            let body = serde_json::to_string(&ParseFailure {
                status_code: 500,
                error: "Internal Server Error",
                message: &error.0,
            })
            .expect("UTF16 JSON error");
            return Box::new(
                (
                    axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                    [(axum::http::header::CONTENT_TYPE, "application/json")],
                    body,
                )
                    .into_response(),
            );
        }
        if let Some(rusqlite::Error::SqliteFailure(code, Some(message))) =
            error.downcast_ref::<rusqlite::Error>()
        {
            // Bun exposes the SQLite error code on missing-table failures.
            if code.extended_code == rusqlite::ffi::SQLITE_ERROR {
                return Box::new(response(
                    500,
                    json!({"statusCode":500,"code":"SQLITE_ERROR","error":"Internal Server Error","message":message}),
                ));
            }
            return Box::new(internal(message));
        }
        return Box::new(internal(&error.to_string()));
    }
    Box::new(internal(&error.to_string()))
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct NetworkHost {
    ip: String,
    mac: Option<String>,
    hostname: Option<String>,
    vendor: Option<String>,
    alive: bool,
    open_ports: JsonDocument,
    ssh_reachable: bool,
    agent_status: String,
    os_version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    providers: Option<JsonDocument>,
    last_seen: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct EnvironmentSnapshot {
    server_time: String,
    assistants: Vec<Value>,
    nodes: Vec<Value>,
    projects: Vec<Value>,
    repositories: Vec<Value>,
    network_hosts: Vec<NetworkHost>,
    connectors: Vec<Value>,
}
#[derive(Serialize)]
struct SnapshotEnvelope {
    snapshot: EnvironmentSnapshot,
}
fn snapshot_response(value: SnapshotEnvelope) -> Response {
    match serde_json::to_string(&value) {
        Ok(body) => (
            [(axum::http::header::CONTENT_TYPE, "application/json")],
            body,
        )
            .into_response(),
        Err(error) => internal(&error.to_string()),
    }
}
fn hosts(db: &rusqlite::Connection) -> Result<Vec<NetworkHost>, OperationError> {
    let mut query=db.prepare("SELECT ip,mac,hostname,os_version,open_ports,ssh_reachable,agent_status,providers,last_seen_at FROM network_hosts ORDER BY last_seen_at DESC")?;
    let rows = query.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, Option<String>>(1)?,
            row.get::<_, Option<String>>(2)?,
            row.get::<_, Option<String>>(3)?,
            row.get::<_, String>(4)?,
            row.get::<_, i64>(5)?,
            row.get::<_, String>(6)?,
            row.get::<_, Option<String>>(7)?,
            row.get::<_, String>(8)?,
        ))
    })?;
    let mut hosts = vec![];
    for row in rows {
        let (ip, mac, hostname, os_version, ports, ssh, status, providers, last_seen) = row?;
        let open_ports = json_diagnostic::parse(&ports)?;
        let providers = providers
            .filter(|s| !s.is_empty())
            .map(|s| json_diagnostic::parse(&s))
            .transpose()?;
        hosts.push(NetworkHost {
            ip,
            mac,
            hostname,
            vendor: None,
            alive: true,
            open_ports,
            ssh_reachable: ssh == 1,
            agent_status: status,
            os_version,
            providers,
            last_seen,
        });
    }
    Ok(hosts)
}
async fn handle(State(state): State<EnvironmentRoutes>, request: Request) -> Response {
    let mut result = dispatch(state, request).await;
    if result
        .headers()
        .get(axum::http::header::CONTENT_TYPE)
        .is_some_and(|v| v == "application/json")
    {
        result.headers_mut().insert(
            axum::http::header::CONTENT_TYPE,
            "application/json; charset=utf-8".parse().unwrap(),
        );
    }
    result
}
async fn dispatch(state: EnvironmentRoutes, request: Request) -> Response {
    let headers = request.headers().clone();
    let user = match auth::require_user(&state.auth, &headers).await {
        Ok(user) => user,
        Err(r) => return *r,
    };
    if let Err(r) = auth::parse_body(request.into_body(), &headers).await {
        return *r;
    }
    let result:Result<SnapshotEnvelope,Box<Response>>=async{
  let owner=user.id.clone();
  let assistants=if let Some(worker)=&state.assistants{
   worker.run(move|db|Ok(AssistantProfileService::new(db).list(Some(&owner))?)).await.map_err(database_error)?
  }else{vec![]};
  let nodes=state.nodes.as_ref().map(|s|s.nodes()).transpose().map_err(|e|Box::new(internal(&e)))?.unwrap_or_default();
  let owner=user.id.clone();
  let projects=if let Some(worker)=&state.projects{
   worker.run(move|db|{
    let service=ProjectService::new(db);
    let projects=service.list(Some("active"),Some(&owner),None)?;
    let counts=service.active_session_counts(&owner)?;
    Ok(projects.into_iter().map(|p|json!({"id":p.id,"title":p.title,"rootPath":p.root_path,"nodeId":p.node_id,"status":p.status,"sessionCount":counts.get(&p.id).copied().unwrap_or(0),"lastActiveAt":p.last_active_at})).collect::<Vec<_>>())
   }).await.map_err(database_error)?
  }else{vec![]};
  let fs_nodes=state.nodes.as_ref().map(|s|s.filesystem_nodes()).transpose().map_err(|e|Box::new(internal(&e)))?.unwrap_or_default();
  let connected:HashMap<String,Value>=fs_nodes.into_iter().filter_map(|n|n["id"].as_str().map(|id|(id.to_owned(),n["name"].clone()))).collect();
  let owner=user.id.clone();
  let repositories=if let Some(worker)=&state.repositories {
   worker.run(move|db|{
    let repositories=RepositoryService::new(db).list(Some(&owner))?;
    Ok(repositories.into_iter().map(|r|{
     let (name,is_connected)=if let Some(device)=r.device_id.as_deref().filter(|s|!s.is_empty()){
      (connected.get(device).cloned().unwrap_or(Value::Null),connected.contains_key(device))
     }else{(json!("Gateway"),true)};
     json!({"id":r.id,"name":r.name,"localPath":r.local_path,"defaultBranch":r.default_branch,"githubUrl":r.github_url,"deviceId":r.device_id,"nodeName":name,"connected":is_connected,"updatedAt":r.updated_at})
    }).collect::<Vec<_>>())
   }).await.map_err(database_error)?
  }else{vec![]};
  let mut connectors=if let Some(providers)=&state.providers {
   providers.check_all().await.into_iter().map(|p|json!({"id":p["id"],"kind":"provider","name":p["name"],"status":if truthy(&p["available"]){"ready"}else{"offline"},"details":p.get("unavailableReason").filter(|v|!v.is_null()).cloned().unwrap_or(Value::Null)})).collect::<Vec<_>>()
  }else{vec![]};
  connectors.extend(nodes.iter().map(|n|json!({"id":n["id"],"kind":"node","name":n["name"],"status":if n["lifecycle"]=="ready"{"ready"}else{"offline"},"details":format!("{} · {}",js_text(&n["platform"]),js_text(&n["role"]))})));
  let server_time=chrono::DateTime::from_timestamp_millis((state.clock)()).ok_or_else(||Box::new(internal("Invalid time value")))?.to_rfc3339_opts(chrono::SecondsFormat::Millis,true);
  let network_hosts=if let Some(worker)=&state.network_hosts{worker.run(hosts).await.map_err(database_error)?}else{vec![]};
  Ok(SnapshotEnvelope{snapshot:EnvironmentSnapshot{server_time,assistants,nodes,projects,repositories,network_hosts,connectors}})
 }.await;
    match result {
        Ok(v) => snapshot_response(v),
        Err(e) => *e,
    }
}
// Stored JSON uses the lossless ECMAScript representation; corruption fails
// the complete snapshot with reference-compatible parser diagnostics.
