//! Native port of `packages/gateway/src/tools/project-tools.ts`.
//!
//! Four agent-callable project tools (`project.create`, `project.list`,
//! `project.assign_repository`, `project.move`, `project.transfer`) over the
//! native project store in [`crate::services::projects`]. The TypeScript
//! implementation delegates to the same service layer, so this module is a
//! thin tool surface: validation, host-owned side effects (node path probing,
//! client broadcasts, repository attachment) and result shaping.
//!
//! Host-owned concerns are expressed through [`ProjectToolsHost`] so the tool
//! layer stays testable without a runtime.

use crate::services::projects::{
    CreateProject, MoveRejection, ProjectError, ProjectRecord, ProjectService, parse_metadata,
    repository_id,
};
use serde_json::{Map, Value, json};

/// Cap on `project.list` results, matching the TypeScript tool contract.
const LIST_DEFAULT_LIMIT: f64 = 20.0;
const LIST_MAX_LIMIT: f64 = 100.0;

/// Capabilities the surrounding gateway runtime must provide.
///
/// * `path_exists` – probe a folder on another node. `Ok(None)` means the node
///   is unknown, `Ok(Some(false))` an unknown folder.
/// * `broadcast` – push a client event so open project lists refresh.
/// * `assign_repository` – resolve and attach a repository for the project
///   root; `Ok(None)` leaves the project unattached.
pub trait ProjectToolsHost {
    /// Returns `Ok(None)` when the node id is not registered.
    fn path_exists(&self, node_id: &str, path: &str) -> Result<Option<bool>, String>;
    fn broadcast(&self, user_id: &str, event: &str, payload: Value);
    fn assign_repository(
        &self,
        project_id: &str,
        repository_id: &str,
        user_id: &str,
    ) -> Result<Option<String>, String>;
}

/// Declarative tool metadata exposed to the tool registry.
pub fn metadata() -> Value {
    serde_json::from_str::<Value>(include_str!("project-tools-metadata.json"))
        .unwrap_or_else(|_| json!([]))
}

/// Single tool definition by name.
pub fn definition(name: &str) -> Option<Value> {
    metadata()
        .as_array()
        .and_then(|tools| {
            tools
                .iter()
                .find(|tool| tool.get("name").and_then(Value::as_str) == Some(name))
        })
        .cloned()
}

/// Names of the tools implemented here, in registry order.
pub fn tool_names() -> Vec<String> {
    metadata()
        .as_array()
        .map(|tools| {
            tools
                .iter()
                .filter_map(|tool| tool.get("name").and_then(Value::as_str))
                .map(str::to_owned)
                .collect()
        })
        .unwrap_or_default()
}

/// Project tool surface bound to a store and a host adapter.
pub struct ProjectTools<'a> {
    repo: ProjectService<'a>,
    host: &'a dyn ProjectToolsHost,
}

impl<'a> ProjectTools<'a> {
    pub fn new(connection: &'a rusqlite::Connection, host: &'a dyn ProjectToolsHost) -> Self {
        Self {
            repo: ProjectService::new(connection),
            host,
        }
    }

    /// Execute one tool. `user_id` scopes every lookup and mutation, matching
    /// the TypeScript tool which always passes the session user through.
    pub fn execute(&self, name: &str, input: &Value, user_id: &str) -> Value {
        match name {
            "project.create" => self.create(input, user_id),
            "project.list" => self.list(input, user_id),
            "project.assign_repository" => self.assign_repository(input, user_id),
            "project.move" => self.move_project(input, user_id),
            "project.transfer" => self.transfer(input, user_id),
            other => fail(format!("Unknown project tool: {other}")),
        }
    }

    fn create(&self, input: &Value, user_id: &str) -> Value {
        let Some(title) = text(input, "title") else {
            return fail("title is required");
        };
        let node_id = text(input, "nodeId").unwrap_or_else(|| "gateway".into());
        let project_root = text(input, "projectRoot");
        let data = CreateProject {
            user_id: Some(user_id.to_owned()),
            title: Some(title),
            root_path: project_root.clone(),
            node_id: Some(node_id.clone()),
            metadata: None,
            parent_id: text(input, "parentId"),
            instructions: text(input, "instructions"),
            description: None,
            color: None,
        };
        // Re-creating a project for an existing folder returns the existing
        // project so tool retries stay idempotent.
        let outcome: Result<(ProjectRecord, bool), String> = match project_root {
            Some(root) => match self
                .repo
                .find_by_root(&root, &node_id, Some(user_id))
            {
                Ok(Some(existing)) => Ok((existing, false)),
                Ok(None) => self
                    .repo
                    .get_or_create_for_root(data)
                    .map(|project| (project, true))
                    .map_err(|error| error.to_string()),
                Err(error) => Err(error.to_string()),
            },
            None => self
                .repo
                .create(data)
                .map(|project| (project, true))
                .map_err(|error| error.to_string()),
        };
        match outcome {
            Ok((project, created)) => json!({
                "ok": true,
                "created": created,
                "project": summary(&project),
            }),
            Err(message) => fail(message),
        }
    }

    fn list(&self, input: &Value, user_id: &str) -> Value {
        let limit = input
            .get("limit")
            .and_then(Value::as_f64)
            .filter(|value| value.is_finite() && *value >= 1.0)
            .map(|value| value.floor().min(LIST_MAX_LIMIT))
            .unwrap_or(LIST_DEFAULT_LIMIT);
        let query = text(input, "query").map(|value| value.to_lowercase());
        let rows = match self.repo.list(Some("active"), Some(user_id), None) {
            Ok(rows) => rows,
            Err(error) => return fail(error.to_string()),
        };
        let mut projects: Vec<Value> = rows
            .iter()
            .filter(|project| match &query {
                None => true,
                Some(query) => matches_query(project, query),
            })
            .map(summary)
            .collect();
        projects.truncate(limit as usize);
        json!({
            "ok": true,
            "count": projects.len(),
            "projects": projects,
        })
    }

    fn assign_repository(&self, input: &Value, user_id: &str) -> Value {
        let (Some(project_id), Some(repository)) =
            (text(input, "projectId"), text(input, "repositoryId"))
        else {
            return fail("projectId and repositoryId are required");
        };
        match self.repo.get(&project_id, Some(user_id)) {
            Ok(None) => return fail("Project not found"),
            Ok(Some(_)) => {}
            Err(error) => return fail(error.to_string()),
        }
        let attached = match self
            .host
            .assign_repository(&project_id, &repository, user_id)
        {
            Ok(attached) => attached,
            Err(message) => return fail(message),
        };
        let Some(attached) = attached else {
            return fail(format!(
                "Repository {repository} could not be resolved for this project"
            ));
        };
        if let Err(error) = self.repo.assign_repository(&project_id, &attached, Some(user_id)) {
            return fail(error.to_string());
        }
        self.host
            .broadcast(user_id, "project.updated", json!({ "projectId": project_id }));
        match self.repo.get(&project_id, Some(user_id)) {
            Ok(Some(project)) => json!({ "ok": true, "project": summary(&project) }),
            Ok(None) => fail("Project not found"),
            Err(error) => fail(error.to_string()),
        }
    }

    fn move_project(&self, input: &Value, user_id: &str) -> Value {
        let Some(project_id) = text(input, "projectId") else {
            return fail("projectId is required");
        };
        let parent = match input.get("parentId") {
            None | Some(Value::Null) => None,
            Some(Value::String(value)) if crate::text::js_trim(value).is_empty() => None,
            Some(Value::String(value)) => Some(value.clone()),
            Some(_) => return fail("parentId must be a string or null"),
        };
        let moved = match self
            .repo
            .move_project(&project_id, parent.as_deref(), Some(user_id))
        {
            Ok(moved) => moved,
            Err(ProjectError::Move(rejection)) => return fail(move_message(rejection)),
            Err(ProjectError::Database(error)) => return fail(error.to_string()),
        };
        let Some(project) = moved else {
            return fail("Project not found");
        };
        if let Some(title) = text(input, "title") {
            let mut patch = Map::new();
            patch.insert("title".into(), json!(title));
            if let Err(error) = self.repo.update(&project_id, &patch, Some(user_id)) {
                return fail(error.to_string());
            }
        }
        self.host
            .broadcast(user_id, "project.updated", json!({ "projectId": project_id }));
        let project = match self.repo.get(&project_id, Some(user_id)) {
            Ok(Some(updated)) => updated,
            Ok(None) => project,
            Err(error) => return fail(error.to_string()),
        };
        json!({ "ok": true, "project": summary(&project) })
    }

    fn transfer(&self, input: &Value, user_id: &str) -> Value {
        let (Some(project_id), Some(node_id), Some(target_root)) = (
            text(input, "projectId"),
            text(input, "nodeId"),
            text(input, "targetRootPath"),
        ) else {
            return fail("projectId, nodeId and targetRootPath are required");
        };
        let project = match self.repo.get(&project_id, Some(user_id)) {
            Ok(Some(project)) => project,
            Ok(None) => return fail("Project not found"),
            Err(error) => return fail(error.to_string()),
        };
        match self.host.path_exists(&node_id, &target_root) {
            Ok(None) => return fail(format!("Node not found: {node_id}")),
            Ok(Some(false)) => {
                return fail(format!(
                    "Target folder does not exist on {node_id}: {target_root}"
                ));
            }
            Ok(Some(true)) => {}
            Err(message) => return fail(message),
        }
        let cleared = repository_id(Some(&project)).is_some();
        let mut metadata = parse_metadata(Some(&project));
        // Repository ids are node scoped, so a cross-node move detaches them.
        metadata.remove("repositoryId");
        metadata.remove("repoId");
        let mut patch = Map::new();
        patch.insert("rootPath".into(), json!(target_root));
        patch.insert("nodeId".into(), json!(node_id));
        patch.insert("metadata".into(), Value::Object(metadata));
        if let Err(error) = self.repo.update(&project_id, &patch, Some(user_id)) {
            return fail(error.to_string());
        }
        self.host
            .broadcast(user_id, "project.updated", json!({ "projectId": project_id }));
        let updated = match self.repo.get(&project_id, Some(user_id)) {
            Ok(Some(updated)) => updated,
            Ok(None) => project,
            Err(error) => return fail(error.to_string()),
        };
        json!({
            "ok": true,
            "repositoryCleared": cleared,
            "note": if cleared {
                Some("Repository attachment cleared because repository ids are node scoped")
            } else {
                None
            },
            "project": summary(&updated),
        })
    }
}

fn move_message(rejection: MoveRejection) -> &'static str {
    match rejection {
        MoveRejection::ParentNotFound => "Parent project not found",
        MoveRejection::Cycle => "Cannot move a project into itself or one of its descendants",
        MoveRejection::TooDeep => "Project hierarchy is too deep",
    }
}

fn text(input: &Value, key: &str) -> Option<String> {
    input
        .get(key)
        .and_then(Value::as_str)
        .map(crate::text::js_trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}

fn matches_query(project: &ProjectRecord, query: &str) -> bool {
    let Ok(value) = serde_json::to_value(project) else {
        return false;
    };
    ["title", "rootPath", "description"].iter().any(|key| {
        value
            .get(key)
            .and_then(Value::as_str)
            .is_some_and(|field| field.to_lowercase().contains(query))
    })
}

/// Compact project projection for tool results.
fn summary(project: &ProjectRecord) -> Value {
    let mut value = serde_json::to_value(project).unwrap_or_else(|_| json!({ "id": project.id }));
    if let Value::Object(map) = &mut value {
        map.remove("userId");
        map.remove("instructions");
        map.remove("metadata");
        if let Some(repository) = repository_id(Some(project)) {
            map.insert("repositoryId".into(), json!(repository));
        }
    }
    value
}

fn fail(message: impl Into<String>) -> Value {
    json!({ "ok": false, "message": message.into() })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;
    use std::collections::{HashMap, HashSet};

    #[derive(Default)]
    struct FakeHost {
        nodes: HashSet<String>,
        folders: HashMap<(String, String), bool>,
        broadcasts: RefCell<Vec<(String, String, Value)>>,
        attach_as: Option<String>,
    }

    impl FakeHost {
        fn with_node(node: &str) -> Self {
            let mut host = Self::default();
            host.nodes.insert(node.to_owned());
            host
        }
    }

    impl ProjectToolsHost for FakeHost {
        fn path_exists(&self, node_id: &str, path: &str) -> Result<Option<bool>, String> {
            if !self.nodes.contains(node_id) {
                return Ok(None);
            }
            Ok(Some(
                self.folders
                    .get(&(node_id.to_owned(), path.to_owned()))
                    .copied()
                    .unwrap_or(false),
            ))
        }

        fn broadcast(&self, user_id: &str, event: &str, payload: Value) {
            self.broadcasts
                .borrow_mut()
                .push((user_id.to_owned(), event.to_owned(), payload));
        }

        fn assign_repository(
            &self,
            _project_id: &str,
            _repository_id: &str,
            _user_id: &str,
        ) -> Result<Option<String>, String> {
            Ok(self.attach_as.clone())
        }
    }

    struct Fixture {
        connection: rusqlite::Connection,
        host: FakeHost,
    }

    impl Fixture {
        fn new(host: FakeHost) -> Self {
            let connection = rusqlite::Connection::open_in_memory().expect("in-memory sqlite");
            crate::db::migrate_database(&connection).expect("migrations");
            Self { connection, host }
        }

        fn tools(&self) -> ProjectTools<'_> {
            ProjectTools::new(&self.connection, &self.host)
        }
    }

    const USER: &str = "user-1";

    #[test]
    fn metadata_exposes_five_tools() {
        let names = tool_names();
        assert_eq!(
            names,
            vec![
                "project.create",
                "project.list",
                "project.assign_repository",
                "project.move",
                "project.transfer",
            ]
        );
        let tool = definition("project.transfer").expect("definition");
        assert_eq!(tool.get("risk").and_then(Value::as_str), Some("write"));
        assert!(definition("project.unknown").is_none());
    }

    #[test]
    fn create_is_idempotent_per_folder() {
        let fixture = Fixture::new(FakeHost::with_node("gateway"));
        let tools = fixture.tools();
        let first = tools.execute(
            "project.create",
            &json!({ "title": "Alpha", "projectRoot": "/work/alpha" }),
            USER,
        );
        assert_eq!(first.get("ok"), Some(&json!(true)));
        assert_eq!(first.get("created"), Some(&json!(true)));
        let id = first["project"]["id"].as_str().expect("id").to_owned();
        assert_eq!(first["project"]["rootPath"], json!("/work/alpha"));

        let second = tools.execute(
            "project.create",
            &json!({ "title": "Alpha again", "projectRoot": "/work/alpha" }),
            USER,
        );
        assert_eq!(second.get("created"), Some(&json!(false)));
        assert_eq!(second["project"]["id"], json!(id));
    }

    #[test]
    fn create_requires_title() {
        let fixture = Fixture::new(FakeHost::with_node("gateway"));
        let result = fixture
            .tools()
            .execute("project.create", &json!({ "projectRoot": "/work/x" }), USER);
        assert_eq!(result["ok"], json!(false));
        assert!(
            result["message"]
                .as_str()
                .is_some_and(|message| message.contains("title"))
        );
    }

    #[test]
    fn list_filters_by_query_and_respects_limit() {
        let fixture = Fixture::new(FakeHost::with_node("gateway"));
        let tools = fixture.tools();
        for title in ["Alpha", "Beta", "Alphabet"] {
            let result = tools.execute("project.create", &json!({ "title": title }), USER);
            assert_eq!(result["ok"], json!(true), "create {title}: {result}");
        }
        let filtered = tools.execute("project.list", &json!({ "query": "alpha" }), USER);
        assert_eq!(filtered["count"], json!(2));
        let limited = tools.execute("project.list", &json!({ "limit": 1 }), USER);
        assert_eq!(limited["count"], json!(1));
        // Summaries never leak instructions or metadata.
        assert!(limited["projects"][0].get("metadata").is_none());
        assert!(limited["projects"][0].get("instructions").is_none());
    }

    #[test]
    fn move_rejects_cycles_and_supports_root_moves() {
        let fixture = Fixture::new(FakeHost::with_node("gateway"));
        let tools = fixture.tools();
        let parent = tools.execute("project.create", &json!({ "title": "Parent" }), USER);
        let parent_id = parent["project"]["id"].as_str().expect("id").to_owned();
        let child = tools.execute(
            "project.create",
            &json!({ "title": "Child", "parentId": parent_id }),
            USER,
        );
        let child_id = child["project"]["id"].as_str().expect("id").to_owned();
        assert_eq!(child["project"]["parentId"], json!(parent_id));

        let cycle = tools.execute(
            "project.move",
            &json!({ "projectId": parent_id, "parentId": child_id }),
            USER,
        );
        assert_eq!(cycle["ok"], json!(false));
        assert!(
            cycle["message"]
                .as_str()
                .is_some_and(|message| message.contains("descendant")),
        );

        let detach = tools.execute(
            "project.move",
            &json!({ "projectId": child_id, "parentId": null, "title": "Renamed" }),
            USER,
        );
        assert_eq!(detach["ok"], json!(true), "detach: {detach}");
        assert_eq!(detach["project"]["title"], json!("Renamed"));
        assert_eq!(detach["project"]["parentId"], Value::Null);
    }

    #[test]
    fn move_reports_unknown_parent() {
        let fixture = Fixture::new(FakeHost::with_node("gateway"));
        let tools = fixture.tools();
        let created = tools.execute("project.create", &json!({ "title": "Solo" }), USER);
        let id = created["project"]["id"].as_str().expect("id").to_owned();
        let moved = tools.execute(
            "project.move",
            &json!({ "projectId": id, "parentId": "missing-project" }),
            USER,
        );
        assert_eq!(moved["ok"], json!(false));
        assert_eq!(moved["message"], json!("Parent project not found"));
    }

    #[test]
    fn transfer_validates_node_and_folder() {
        let fixture = Fixture::new(FakeHost::with_node("gateway"));
        let tools = fixture.tools();
        let created = tools.execute("project.create", &json!({ "title": "Move me" }), USER);
        let id = created["project"]["id"].as_str().expect("id").to_owned();

        let unknown_node = tools.execute(
            "project.transfer",
            &json!({ "projectId": id, "nodeId": "node-9", "targetRootPath": "/srv/app" }),
            USER,
        );
        assert_eq!(unknown_node["ok"], json!(false));
        assert_eq!(unknown_node["message"], json!("Node not found: node-9"));

        let missing_folder = tools.execute(
            "project.transfer",
            &json!({ "projectId": id, "nodeId": "gateway", "targetRootPath": "/srv/app" }),
            USER,
        );
        assert_eq!(missing_folder["ok"], json!(false));
        assert!(
            missing_folder["message"]
                .as_str()
                .is_some_and(|message| message.contains("/srv/app")),
        );
    }

    #[test]
    fn transfer_moves_project_and_clears_repository() {
        let mut host = FakeHost::with_node("gateway");
        host.attach_as = Some("repo-1".into());
        host.folders
            .insert(("gateway".into(), "/srv/app".into()), true);
        let fixture = Fixture::new(host);
        let tools = fixture.tools();
        let created = tools.execute(
            "project.create",
            &json!({ "title": "Attached", "projectRoot": "/work/attached" }),
            USER,
        );
        let id = created["project"]["id"].as_str().expect("id").to_owned();

        let attached = tools.execute(
            "project.assign_repository",
            &json!({ "projectId": id, "repositoryId": "repo-1" }),
            USER,
        );
        assert_eq!(attached["ok"], json!(true), "attach: {attached}");
        assert_eq!(attached["project"]["repositoryId"], json!("repo-1"));

        let transferred = tools.execute(
            "project.transfer",
            &json!({ "projectId": id, "nodeId": "gateway", "targetRootPath": "/srv/app" }),
            USER,
        );
        assert_eq!(transferred["ok"], json!(true), "transfer: {transferred}");
        assert_eq!(transferred["repositoryCleared"], json!(true));
        assert_eq!(transferred["project"]["rootPath"], json!("/srv/app"));
        assert_eq!(transferred["project"]["nodeId"], json!("gateway"));
        assert!(
            transferred["project"].get("repositoryId").is_none(),
            "repository must be detached: {transferred}",
        );
        let broadcasts = fixture.host.broadcasts.borrow();
        assert_eq!(broadcasts.len(), 2, "attach + transfer broadcast");
        assert!(broadcasts.iter().all(|(user, event, _)| {
            user == USER && event == "project.updated"
        }));
    }

    #[test]
    fn unknown_tool_is_rejected() {
        let fixture = Fixture::new(FakeHost::with_node("gateway"));
        let result = fixture
            .tools()
            .execute("project.destroy", &json!({}), USER);
        assert_eq!(result["ok"], json!(false));
        assert!(
            result["message"]
                .as_str()
                .is_some_and(|message| message.contains("Unknown project tool")),
        );
    }
}
