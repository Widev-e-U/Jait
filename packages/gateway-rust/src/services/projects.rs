//! Project repository and scoped organization rules. Execute on the database worker.
use super::sessions::{SessionFilter, SessionRecord, SessionService};
use crate::contracts::bounded_json::Utf16Text;
use rusqlite::{Connection, OptionalExtension, params, params_from_iter};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value, json};
use std::collections::{BTreeMap, HashSet, VecDeque};
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectRecord {
    pub id: String,
    pub user_id: Option<String>,
    pub title: Option<String>,
    pub root_path: Option<String>,
    pub node_id: Option<String>,
    pub created_at: String,
    pub last_active_at: String,
    pub status: Option<String>,
    pub metadata: Option<String>,
    pub parent_id: Option<String>,
    pub instructions: Option<String>,
    pub description: Option<String>,
    pub color: Option<String>,
    pub kind: String,
}
#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct CreateProject {
    pub user_id: Option<String>,
    pub title: Option<String>,
    pub root_path: Option<String>,
    pub node_id: Option<String>,
    pub metadata: Option<Map<String, Value>>,
    pub parent_id: Option<String>,
    pub instructions: Option<String>,
    pub description: Option<String>,
    pub color: Option<String>,
}
#[derive(Clone, Copy, Debug, Serialize, PartialEq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum MoveRejection {
    ParentNotFound,
    Cycle,
    TooDeep,
}
#[derive(Debug)]
pub enum ProjectError {
    Database(rusqlite::Error),
    Move(MoveRejection),
}
impl std::fmt::Display for ProjectError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Database(e) => write!(f, "{e}"),
            Self::Move(e) => write!(f, "Project move rejected: {e:?}"),
        }
    }
}
impl std::error::Error for ProjectError {}
impl From<rusqlite::Error> for ProjectError {
    fn from(e: rusqlite::Error) -> Self {
        Self::Database(e)
    }
}
const COLUMNS: &str = "id,user_id,title,root_path,node_id,created_at,last_active_at,status,metadata,parent_id,instructions,description,color,kind";
fn row(r: &rusqlite::Row<'_>) -> rusqlite::Result<ProjectRecord> {
    Ok(ProjectRecord {
        id: r.get(0)?,
        user_id: r.get(1)?,
        title: r.get(2)?,
        root_path: r.get(3)?,
        node_id: r.get(4)?,
        created_at: r.get(5)?,
        last_active_at: r.get(6)?,
        status: r.get(7)?,
        metadata: r.get(8)?,
        parent_id: r.get(9)?,
        instructions: r.get(10)?,
        description: r.get(11)?,
        color: r.get(12)?,
        kind: r.get(13)?,
    })
}
fn nonempty(v: Option<&str>) -> Option<&str> {
    v.filter(|v| !v.is_empty())
}
fn trimmed(v: Option<&str>) -> Option<String> {
    v.map(crate::text::js_trim)
        .filter(|v| !v.is_empty())
        .map(String::from)
}
pub fn normalize_color(value: Option<&str>) -> Option<String> {
    let value = trimmed(value)?.to_lowercase();
    let palette = [
        "slate", "red", "orange", "amber", "green", "teal", "blue", "violet", "pink",
    ];
    (palette.contains(&value.as_str())
        || (value.len() == 7
            && value.starts_with('#')
            && value.as_bytes()[1..].iter().all(u8::is_ascii_hexdigit)))
    .then_some(value)
}
pub fn project_kind(root: Option<&str>) -> &'static str {
    if trimmed(root).is_some() {
        "workspace"
    } else {
        "folder"
    }
}
pub fn parse_metadata(project: Option<&ProjectRecord>) -> Map<String, Value> {
    project
        .and_then(|p| p.metadata.as_deref())
        .and_then(|v| serde_json::from_str::<Value>(v).ok())
        .and_then(|v| v.as_object().cloned())
        .unwrap_or_default()
}
pub fn repository_id(project: Option<&ProjectRecord>) -> Option<String> {
    let metadata = parse_metadata(project);
    let value = metadata
        .get("repositoryId")
        .filter(|v| !v.is_null())
        .or_else(|| metadata.get("repoId"))?;
    trimmed(value.as_str())
}
fn normalize_root(root: &str) -> String {
    let root = crate::text::js_trim(root)
        .replace('\\', "/")
        .trim_end_matches('/')
        .to_owned();
    if root.as_bytes().get(1) == Some(&b':')
        && root.as_bytes().get(2) == Some(&b'/')
        && root.as_bytes()[0].is_ascii_alphabetic()
    {
        root.to_lowercase()
    } else {
        root
    }
}
fn fallback_title(root: Option<&str>, folder: bool) -> String {
    root.map(crate::text::js_trim)
        .filter(|v| !v.is_empty())
        .and_then(|v| {
            v.trim_end_matches(['/', '\\'])
                .rsplit(['/', '\\'])
                .find(|v| !v.is_empty())
        })
        .map(String::from)
        .unwrap_or_else(|| {
            if folder {
                "New folder".into()
            } else {
                "Untitled Project".into()
            }
        })
}
fn ancestors<'a>(rows: &'a [ProjectRecord], id: &str) -> Vec<&'a ProjectRecord> {
    let by_id: BTreeMap<&str, &ProjectRecord> = rows.iter().map(|r| (r.id.as_str(), r)).collect();
    let mut seen = HashSet::from([id]);
    let mut chain = vec![];
    let mut cursor = by_id.get(id).and_then(|p| nonempty(p.parent_id.as_deref()));
    while let Some(id) = cursor {
        if !seen.insert(id) {
            break;
        }
        let Some(parent) = by_id.get(id) else { break };
        chain.push(*parent);
        cursor = nonempty(parent.parent_id.as_deref());
    }
    chain.reverse();
    chain
}
fn descendants(rows: &[ProjectRecord], id: &str) -> Vec<String> {
    let mut children = BTreeMap::<&str, Vec<&str>>::new();
    for row in rows {
        if let Some(parent) = nonempty(row.parent_id.as_deref()) {
            children.entry(parent).or_default().push(&row.id)
        }
    }
    let mut queue = VecDeque::from(children.get(id).cloned().unwrap_or_default());
    let mut seen = HashSet::from([id]);
    let mut result = vec![];
    while let Some(next) = queue.pop_front() {
        if !seen.insert(next) {
            continue;
        }
        result.push(next.to_string());
        queue.extend(children.get(next).into_iter().flatten().copied());
    }
    result
}
fn subtree_height(rows: &[ProjectRecord], id: &str, seen: &mut HashSet<String>) -> usize {
    if !seen.insert(id.to_owned()) {
        return 0;
    }
    // Validation only needs to distinguish values above the five-level ceiling.
    if seen.len() > 5 {
        seen.remove(id);
        return 6;
    }
    let height = rows
        .iter()
        .filter(|r| r.parent_id.as_deref() == Some(id))
        .map(|r| 1 + subtree_height(rows, &r.id, seen))
        .max()
        .unwrap_or(0);
    seen.remove(id);
    height
}
fn validate_move(rows: &[ProjectRecord], id: &str, parent: Option<&str>) -> Option<MoveRejection> {
    let parent = nonempty(parent)?;
    if !rows.iter().any(|r| r.id == parent) {
        return Some(MoveRejection::ParentNotFound);
    }
    if parent == id || descendants(rows, id).iter().any(|v| v == parent) {
        return Some(MoveRejection::Cycle);
    }
    if ancestors(rows, parent).len() + 2 + subtree_height(rows, id, &mut HashSet::new()) > 5 {
        return Some(MoveRejection::TooDeep);
    }
    None
}
pub struct ProjectService<'a> {
    db: &'a Connection,
    time: Option<&'a str>,
}
impl<'a> ProjectService<'a> {
    pub fn new(db: &'a Connection) -> Self {
        Self { db, time: None }
    }
    pub fn with_time(db: &'a Connection, time: &'a str) -> Self {
        Self {
            db,
            time: Some(time),
        }
    }
    fn now(&self) -> rusqlite::Result<String> {
        self.time.map(|v| Ok(v.into())).unwrap_or_else(|| {
            self.db
                .query_row("SELECT strftime('%Y-%m-%dT%H:%M:%fZ','now')", [], |r| {
                    r.get(0)
                })
        })
    }
    pub fn create(&self, data: CreateProject) -> rusqlite::Result<ProjectRecord> {
        let id = crate::db::identifiers::uuidv7().to_string();
        let now = self.now()?;
        let root = data
            .root_path
            .filter(|v| !crate::text::js_trim(v).is_empty());
        let kind = project_kind(root.as_deref());
        let title = trimmed(data.title.as_deref())
            .unwrap_or_else(|| fallback_title(root.as_deref(), kind == "folder"));
        self.db.execute("INSERT INTO projects(id,user_id,title,root_path,node_id,created_at,last_active_at,status,metadata,parent_id,instructions,description,color,kind) VALUES(?,?,?,?,?,?,?,'active',?,?,?,?,?,?)",
            params![id,data.user_id,title,root,data.node_id.unwrap_or_else(||"gateway".into()),now,now,data.metadata.map(|v|Value::Object(v).to_string()),data.parent_id,trimmed(data.instructions.as_deref()),trimmed(data.description.as_deref()),normalize_color(data.color.as_deref()),kind])?;
        Ok(self.get(&id, None)?.expect("created project"))
    }
    pub fn get(&self, id: &str, user: Option<&str>) -> rusqlite::Result<Option<ProjectRecord>> {
        self.db
            .query_row(
                &format!(
                    "SELECT {COLUMNS} FROM projects WHERE id=?1 AND (?2 IS NULL OR user_id=?2)"
                ),
                params![id, nonempty(user)],
                row,
            )
            .optional()
    }
    pub fn list(
        &self,
        status: Option<&str>,
        user: Option<&str>,
        limit: Option<f64>,
    ) -> rusqlite::Result<Vec<ProjectRecord>> {
        let limit = limit
            .filter(|v| v.is_finite() && *v >= 1.0)
            .map(|v| v.floor() as i64)
            .unwrap_or(-1);
        let mut statement=self.db.prepare(&format!("SELECT {COLUMNS} FROM projects WHERE (?1 IS NULL OR status=?1) AND (?2 IS NULL OR user_id=?2) ORDER BY last_active_at DESC LIMIT ?3"))?;
        statement
            .query_map(params![nonempty(status), nonempty(user), limit], row)?
            .collect()
    }
    pub fn list_with_sessions(
        &self,
        user: Option<&str>,
        status: &str,
        limit: Option<f64>,
    ) -> rusqlite::Result<Value> {
        let projects = self.list(Some(status), user, limit.map(|v| v + 1.0))?;
        let end = limit
            .map(|v| {
                if v.is_nan() {
                    0
                } else if v < 0.0 {
                    (projects.len() as f64 + v.trunc()).max(0.0) as usize
                } else {
                    v as usize
                }
            })
            .unwrap_or(projects.len())
            .min(projects.len());
        let mut limited = projects[..end].to_vec();
        if limit.is_some() && !limited.is_empty() {
            let all = self.list(Some(status), user, None)?;
            let mut included = limited.iter().map(|r| r.id.clone()).collect::<HashSet<_>>();
            for project in limited.clone() {
                let mut cursor = project.parent_id;
                let mut guard = HashSet::from([project.id]);
                while let Some(id) = nonempty(cursor.as_deref()) {
                    if included.contains(id) || !guard.insert(id.to_string()) {
                        break;
                    }
                    let Some(parent) = all.iter().find(|p| p.id == id) else {
                        break;
                    };
                    included.insert(parent.id.clone());
                    limited.push(parent.clone());
                    cursor = parent.parent_id.clone();
                }
            }
            limited.sort_by(|a, b| b.last_active_at.cmp(&a.last_active_at));
        }
        let ids = limited.iter().map(|p| p.id.clone()).collect::<Vec<_>>();
        let sessions = self.sessions_for_projects(&ids, user)?;
        let rows = limited
            .into_iter()
            .map(|p| {
                let children = sessions
                    .iter()
                    .filter(|s| s.project_id.as_deref() == Some(&p.id))
                    .collect::<Vec<_>>();
                with_sessions(p, &children)
            })
            .collect::<Vec<_>>();
        Ok(json!({"projects":rows,"hasMore":limit.is_some_and(|v|projects.len() as f64>v)}))
    }
    pub fn search_with_sessions(&self, user: &str, query: &str) -> rusqlite::Result<Value> {
        let query = crate::text::js_trim(query).to_lowercase();
        if query.is_empty() {
            return Ok(json!({"projects":[],"personalSessions":[]}));
        }
        let projects = self.list(Some("active"), Some(user), None)?;
        let sessions = SessionService::new(self.db).list(SessionFilter {
            status: Some("active"),
            user_id: Some(user),
            ..Default::default()
        })?;
        let matches = |v: Option<&str>| v.is_some_and(|v| v.to_lowercase().contains(&query));
        let matching = sessions
            .iter()
            .filter(|s| matches(s.name.as_deref()) || matches(s.project_path.as_deref()))
            .collect::<Vec<_>>();
        let personal = matching
            .iter()
            .filter(|s| nonempty(s.project_id.as_deref()).is_none())
            .collect::<Vec<_>>();
        let projects = projects
            .into_iter()
            .filter_map(|p| {
                let children = matching
                    .iter()
                    .filter(|s| s.project_id.as_deref() == Some(&p.id))
                    .copied()
                    .collect::<Vec<_>>();
                (matches(p.title.as_deref())
                    || matches(p.root_path.as_deref())
                    || matches(p.description.as_deref())
                    || !children.is_empty())
                .then(|| with_sessions(p, &children))
            })
            .collect::<Vec<_>>();
        Ok(json!({"projects":projects,"personalSessions":personal}))
    }
    pub fn find_by_root(
        &self,
        root: &str,
        node: &str,
        user: Option<&str>,
    ) -> rusqlite::Result<Option<ProjectRecord>> {
        let Some(root) = trimmed(Some(root)) else {
            return Ok(None);
        };
        let exact=self.db.query_row(&format!("SELECT {COLUMNS} FROM projects WHERE root_path=?1 AND node_id=?2 AND status='active' AND (?3 IS NULL OR user_id=?3) LIMIT 1"),params![root,node,nonempty(user)],row).optional()?;
        if exact.is_some() {
            return Ok(exact);
        }
        if node == "gateway" && nonempty(user).is_some() {
            let normalized = normalize_root(&root);
            return Ok(self
                .list(Some("active"), user, None)?
                .into_iter()
                .find(|p| {
                    p.node_id.as_deref() != Some("gateway")
                        && p.root_path
                            .as_deref()
                            .is_some_and(|r| normalize_root(r) == normalized)
                }));
        }
        Ok(None)
    }
    pub fn get_or_create_for_root(&self, data: CreateProject) -> rusqlite::Result<ProjectRecord> {
        if let Some(root) = trimmed(data.root_path.as_deref())
            && let Some(project) = self.find_by_root(
                &root,
                data.node_id.as_deref().unwrap_or("gateway"),
                data.user_id.as_deref(),
            )?
        {
            return Ok(project);
        }
        self.create(data)
    }
    pub fn touch(&self, id: &str) -> rusqlite::Result<()> {
        self.db.execute(
            "UPDATE projects SET last_active_at=?1 WHERE id=?2",
            params![self.now()?, id],
        )?;
        Ok(())
    }
    pub fn update(
        &self,
        id: &str,
        data: &Map<String, Value>,
        user: Option<&str>,
    ) -> rusqlite::Result<()> {
        let mut values = vec![];
        let mut columns = vec![];
        for (key, column) in [
            ("title", "title"),
            ("rootPath", "root_path"),
            ("nodeId", "node_id"),
            ("metadata", "metadata"),
            ("instructions", "instructions"),
            ("description", "description"),
            ("color", "color"),
        ] {
            if let Some(v) = data.get(key) {
                let result = match key {
                    "metadata" => Some(v.to_string()),
                    "title" | "instructions" | "description" => trimmed(v.as_str()),
                    "color" => normalize_color(v.as_str()),
                    "rootPath" => v
                        .as_str()
                        .filter(|v| !crate::text::js_trim(v).is_empty())
                        .map(String::from),
                    _ => v.as_str().map(String::from),
                };
                if key == "rootPath" {
                    columns.push("kind=?".into());
                    values.push(rusqlite::types::Value::Text(
                        project_kind(result.as_deref()).into(),
                    ));
                }
                columns.push(format!("{column}=?"));
                values.push(
                    result
                        .map(rusqlite::types::Value::Text)
                        .unwrap_or(rusqlite::types::Value::Null),
                );
            }
        }
        if columns.is_empty() {
            return Ok(());
        }
        values.push(rusqlite::types::Value::Text(id.into()));
        values.push(
            nonempty(user)
                .map(|v| rusqlite::types::Value::Text(v.into()))
                .unwrap_or(rusqlite::types::Value::Null),
        );
        let n = values.len();
        self.db.execute(
            &format!(
                "UPDATE projects SET {} WHERE id=?{} AND (?{n} IS NULL OR user_id=?{n})",
                columns.join(","),
                n - 1
            ),
            params_from_iter(values),
        )?;
        Ok(())
    }
    pub fn move_project(
        &self,
        id: &str,
        parent: Option<&str>,
        user: Option<&str>,
    ) -> Result<Option<ProjectRecord>, ProjectError> {
        let rows = self.list(Some("active"), user, None)?;
        if let Some(rejection) = validate_move(&rows, id, parent) {
            return Err(ProjectError::Move(rejection));
        }
        self.db.execute("UPDATE projects SET parent_id=?1,last_active_at=?2 WHERE id=?3 AND (?4 IS NULL OR user_id=?4)",params![parent,self.now()?,id,nonempty(user)])?;
        Ok(self.get(id, user)?)
    }
    pub fn resolve_instruction_chain(
        &self,
        id: &str,
        user: Option<&str>,
    ) -> rusqlite::Result<Option<Utf16Text>> {
        let Some(project) = self.get(id, user)? else {
            return Ok(None);
        };
        let rows = self.list(Some("active"), user, None)?;
        let mut chain = ancestors(&rows, id);
        chain.push(&project);
        let blocks = chain
            .into_iter()
            .filter_map(|p| {
                let instructions = trimmed(p.instructions.as_deref())?;
                Some(format!(
                    "## {}\n{instructions}",
                    trimmed(p.title.as_deref()).unwrap_or_else(|| "Project".into())
                ))
            })
            .collect::<Vec<_>>();
        if blocks.is_empty() {
            return Ok(None);
        }
        let mut kept = vec![];
        let mut total = 0;
        for block in blocks.iter().rev() {
            let len = block.encode_utf16().count();
            if total + len > 8000 {
                break;
            }
            total += len;
            kept.push(block.as_str());
        }
        if kept.is_empty() {
            let units = blocks
                .last()
                .expect("nonempty")
                .encode_utf16()
                .take(8000)
                .collect::<Vec<_>>();
            let mut units = units;
            units.extend("\n[truncated]".encode_utf16());
            return Ok(Some(Utf16Text(units)));
        }
        kept.reverse();
        let suffix = if kept.len() < blocks.len() {
            "\n\n[earlier project context truncated]"
        } else {
            ""
        };
        Ok(Some(Utf16Text(
            format!("{}{suffix}", kept.join("\n\n"))
                .encode_utf16()
                .collect(),
        )))
    }
    pub fn effective_root_path(
        &self,
        id: &str,
        user: Option<&str>,
    ) -> rusqlite::Result<Option<String>> {
        self.effective_root_for_record(self.get(id, user)?.as_ref(), user)
    }
    pub fn effective_root_for_record(
        &self,
        project: Option<&ProjectRecord>,
        user: Option<&str>,
    ) -> rusqlite::Result<Option<String>> {
        let Some(project) = project else {
            return Ok(None);
        };
        if trimmed(project.root_path.as_deref()).is_some() {
            return Ok(project.root_path.clone());
        }
        let rows = self.list(Some("active"), user, None)?;
        Ok(ancestors(&rows, &project.id)
            .into_iter()
            .rev()
            .find_map(|p| {
                p.root_path
                    .as_deref()
                    .filter(|v| !crate::text::js_trim(v).is_empty())
                    .map(String::from)
            }))
    }
    pub fn list_descendant_ids(
        &self,
        id: &str,
        user: Option<&str>,
    ) -> rusqlite::Result<Vec<String>> {
        Ok(descendants(&self.list(Some("active"), user, None)?, id))
    }
    pub fn assign_repository(
        &self,
        id: &str,
        repository: &str,
        user: Option<&str>,
    ) -> rusqlite::Result<Option<ProjectRecord>> {
        let transaction = self.db.unchecked_transaction()?;
        let Some(project) = self.get(id, user)? else {
            return Ok(None);
        };
        let mut metadata = parse_metadata(Some(&project));
        metadata.insert("repositoryId".into(), json!(repository));
        self.update(
            id,
            json!({"metadata":metadata}).as_object().expect("object"),
            user,
        )?;
        let updated = self.get(id, user)?;
        if updated.is_some() {
            transaction.commit()?;
        }
        Ok(updated)
    }
    pub fn clear_repository(
        &self,
        id: &str,
        user: Option<&str>,
    ) -> rusqlite::Result<Option<ProjectRecord>> {
        let Some(project) = self.get(id, user)? else {
            return Ok(None);
        };
        let mut metadata = parse_metadata(Some(&project));
        if !metadata.contains_key("repositoryId") && !metadata.contains_key("repoId") {
            return Ok(Some(project));
        }
        metadata.remove("repositoryId");
        metadata.remove("repoId");
        self.update(
            id,
            json!({"metadata":metadata}).as_object().expect("object"),
            user,
        )?;
        self.get(id, user)
    }
    pub fn archive(&self, id: &str, user: Option<&str>) -> rusqlite::Result<Vec<String>> {
        let ids = std::iter::once(id.to_owned())
            .chain(self.list_descendant_ids(id, user)?)
            .collect::<Vec<_>>();
        self.batch_status(&ids, "archived", nonempty(user))?;
        Ok(ids)
    }
    pub fn count_sessions_in_subtree(
        &self,
        id: &str,
        user: Option<&str>,
    ) -> rusqlite::Result<usize> {
        let mut ids = self
            .list_descendant_ids(id, user)?
            .into_iter()
            .collect::<HashSet<_>>();
        ids.insert(id.to_owned());
        let mut values = ids
            .into_iter()
            .map(rusqlite::types::Value::Text)
            .collect::<Vec<_>>();
        let clause = std::iter::repeat_n("?", values.len())
            .collect::<Vec<_>>()
            .join(",");
        values.push(
            nonempty(user)
                .map(|v| rusqlite::types::Value::Text(v.into()))
                .unwrap_or(rusqlite::types::Value::Null),
        );
        let n = values.len();
        self.db.query_row(&format!("SELECT count(*) FROM sessions WHERE project_id IN ({clause}) AND status='active' AND (?{n} IS NULL OR user_id=?{n})"),params_from_iter(values),|r|r.get::<_,i64>(0).map(|n|n as usize))
    }
    pub fn set_status(&self, id: &str, status: &str, user: Option<&str>) -> rusqlite::Result<()> {
        self.db.execute(
            "UPDATE projects SET status=?1 WHERE id=?2 AND (?3 IS NULL OR user_id=?3)",
            params![status, id, nonempty(user)],
        )?;
        Ok(())
    }
    pub fn delete_archived(&self, user: &str) -> rusqlite::Result<usize> {
        let archived = self.list(Some("archived"), Some(user), None)?;
        if !archived.is_empty() {
            self.batch_status(
                &archived.iter().map(|p| p.id.clone()).collect::<Vec<_>>(),
                "deleted",
                Some(user),
            )?;
        }
        Ok(archived.len())
    }
    fn batch_status(
        &self,
        ids: &[String],
        status: &str,
        user: Option<&str>,
    ) -> rusqlite::Result<()> {
        if ids.is_empty() {
            return Ok(());
        }
        let mut values = ids
            .iter()
            .map(|v| rusqlite::types::Value::Text(v.clone()))
            .collect::<Vec<_>>();
        let clause = (1..=ids.len())
            .map(|i| format!("?{i}"))
            .collect::<Vec<_>>()
            .join(",");
        values.push(rusqlite::types::Value::Text(status.into()));
        values.push(
            user.map(|v| rusqlite::types::Value::Text(v.into()))
                .unwrap_or(rusqlite::types::Value::Null),
        );
        let n = values.len();
        self.db.execute(&format!("UPDATE projects SET status=?{} WHERE id IN ({clause}) AND (?{n} IS NULL OR user_id=?{n})",n-1),params_from_iter(values))?;
        Ok(())
    }
    fn sessions_for_projects(
        &self,
        ids: &[String],
        user: Option<&str>,
    ) -> rusqlite::Result<Vec<SessionRecord>> {
        if ids.is_empty() {
            return Ok(vec![]);
        }
        let mut values = ids
            .iter()
            .map(|v| rusqlite::types::Value::Text(v.clone()))
            .collect::<Vec<_>>();
        let clause = (1..=ids.len())
            .map(|i| format!("?{i}"))
            .collect::<Vec<_>>()
            .join(",");
        values.push(
            nonempty(user)
                .map(|v| rusqlite::types::Value::Text(v.into()))
                .unwrap_or(rusqlite::types::Value::Null),
        );
        let n = values.len();
        let mut statement=self.db.prepare(&format!("SELECT {} FROM sessions WHERE project_id IN ({clause}) AND status='active' AND (?{n} IS NULL OR user_id=?{n}) ORDER BY last_active_at DESC",super::sessions::COLUMNS))?;
        statement
            .query_map(params_from_iter(values), super::sessions::record)?
            .collect()
    }

    pub fn active_session_counts(&self, user: &str) -> rusqlite::Result<BTreeMap<String, i64>> {
        let mut statement=self.db.prepare("SELECT project_id,count(*) FROM sessions WHERE user_id=? AND status='active' GROUP BY project_id")?;
        let counts = statement
            .query_map([user], |r| {
                Ok((r.get::<_, Option<String>>(0)?, r.get::<_, i64>(1)?))
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(counts
            .into_iter()
            .filter_map(|(id, count)| id.filter(|v| !v.is_empty()).map(|id| (id, count)))
            .collect())
    }
}
fn with_sessions(project: ProjectRecord, sessions: &[&SessionRecord]) -> Value {
    let mut value = serde_json::to_value(project).expect("record");
    value
        .as_object_mut()
        .expect("record")
        .insert("sessions".into(), json!(sessions));
    value
}
