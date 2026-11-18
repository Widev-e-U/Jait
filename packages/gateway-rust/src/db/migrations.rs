use rusqlite::{Connection, OptionalExtension, params};
use serde::Deserialize;
use serde_json::Value;
use std::{
    collections::{HashMap, HashSet},
    fmt,
    sync::LazyLock,
};

#[derive(Deserialize)]
struct Plan {
    migrations: Vec<Migration>,
    repairs: serde_json::Map<String, Value>,
}
#[derive(Deserialize)]
struct Migration {
    id: u32,
    name: String,
    operations: Vec<Operation>,
}
#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
enum Operation {
    Sql { sql: String, ignore_errors: bool },
    BackfillWorkspaces,
    RenameProjects,
    DeduplicateRepositories,
}
static PLAN: LazyLock<Plan> = LazyLock::new(|| {
    serde_json::from_str(include_str!("migrations.json")).expect("reviewed migration plan")
});

#[derive(Debug)]
pub struct MigrationError {
    pub id: u32,
    pub name: String,
    pub source: rusqlite::Error,
}
impl fmt::Display for MigrationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "Database migration {} ({}) failed: {}. The migration was not recorded as applied; fix the migration or restore from backup before retrying.",
            self.id, self.name, self.source
        )
    }
}
impl std::error::Error for MigrationError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        Some(&self.source)
    }
}
fn error(id: u32, name: &str, source: rusqlite::Error) -> MigrationError {
    MigrationError {
        id,
        name: name.into(),
        source,
    }
}
pub fn migration_inventory() -> Vec<(u32, String)> {
    PLAN.migrations
        .iter()
        .map(|m| (m.id, m.name.clone()))
        .collect()
}
pub fn schema_version(db: &Connection) -> u32 {
    db.query_row("SELECT MAX(id) FROM _migrations", [], |r| {
        r.get::<_, Option<u32>>(0)
    })
    .ok()
    .flatten()
    .unwrap_or(0)
}
pub fn apply_migrations_through(db: &Connection, through: u32) -> Result<(), MigrationError> {
    apply_plan_through(db, through, &PLAN.migrations)
}

fn apply_plan_through(
    db: &Connection,
    through: u32,
    migrations: &[Migration],
) -> Result<(), MigrationError> {
    db.execute_batch("CREATE TABLE IF NOT EXISTS _migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)").map_err(|e| error(0,"migration_tracking",e))?;
    let applied: HashSet<u32> = db
        .prepare("SELECT id FROM _migrations")
        .and_then(|mut s| s.query_map([], |r| r.get(0))?.collect())
        .map_err(|e| error(0, "migration_tracking", e))?;
    let mut ordered: Vec<_> = migrations.iter().collect();
    ordered.sort_by_key(|migration| migration.id);
    for migration in ordered
        .into_iter()
        .filter(|m| m.id <= through && !applied.contains(&m.id))
    {
        for operation in &migration.operations {
            let result = match operation {
                Operation::Sql { sql, ignore_errors } => {
                    let result = db.execute_batch(sql);
                    if *ignore_errors { Ok(()) } else { result }
                }
                Operation::BackfillWorkspaces => backfill_workspaces(db),
                Operation::RenameProjects => rename_projects(db),
                Operation::DeduplicateRepositories => deduplicate_repositories(db),
            };
            result.map_err(|e| error(migration.id, &migration.name, e))?;
        }
        db.execute("INSERT INTO _migrations (id,name,applied_at) VALUES (?,?,strftime('%Y-%m-%dT%H:%M:%fZ','now'))", params![migration.id,migration.name]).map_err(|e| error(migration.id,&migration.name,e))?;
    }
    Ok(())
}
fn table_exists(db: &Connection, name: &str) -> rusqlite::Result<bool> {
    Ok(db
        .query_row(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
            [name],
            |_| Ok(()),
        )
        .optional()?
        .is_some())
}
fn columns(db: &Connection, table: &str) -> rusqlite::Result<HashSet<String>> {
    db.prepare(&format!(
        "PRAGMA table_info(\"{}\")",
        table.replace('"', "\"\"")
    ))?
    .query_map([], |r| r.get(1))?
    .collect()
}
pub fn verify_schema(db: &Connection) -> rusqlite::Result<usize> {
    let mut repaired = 0;
    for (table, expected) in &PLAN.repairs {
        if !table_exists(db, table)? {
            continue;
        }
        let existing = columns(db, table)?;
        let expected = expected.as_object().expect("reviewed repair columns");
        for (column, ddl) in expected {
            let ddl = ddl.as_str().expect("reviewed repair definition");
            if !existing.contains(column) {
                match db.execute_batch(&format!("ALTER TABLE {table} ADD COLUMN {column} {ddl}")) {
                    Ok(()) => repaired += 1,
                    Err(error) => eprintln!("Schema repair failed for {table}.{column}: {error}"),
                }
            }
        }
    }
    Ok(repaired)
}
fn backfill_workspaces(db: &Connection) -> rusqlite::Result<()> {
    type Workspace = (String, Option<String>, Option<String>, Option<String>);
    let rows: Vec<Workspace> = db
        .prepare("SELECT id,user_id,root_path,node_id FROM workspaces")?
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))?
        .collect::<rusqlite::Result<_>>()?;
    let mut by_root = HashMap::new();
    for (id, user, root, node) in rows {
        if let Some(root) = root.filter(|p| !p.is_empty()) {
            by_root.insert(
                format!(
                    "{}::{}::{root}",
                    user.as_deref().unwrap_or(""),
                    node.as_deref().unwrap_or("gateway")
                ),
                id,
            );
        }
    }
    type Session = (
        String,
        Option<String>,
        Option<String>,
        Option<String>,
        String,
        String,
        Option<String>,
    );
    let sessions: Vec<Session> = db.prepare("SELECT id,user_id,name,workspace_path,created_at,last_active_at,workspace_id FROM sessions ORDER BY created_at ASC")?.query_map([],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?,r.get(4)?,r.get(5)?,r.get(6)?)))?.collect::<rusqlite::Result<_>>()?;
    for (session, user, name, path, created, active, workspace) in sessions {
        if workspace.is_some_and(|s| !s.is_empty()) {
            continue;
        }
        let name = crate::text::js_trim(name.as_deref().unwrap_or(""));
        let id = if let Some(path) = path.as_deref().filter(|p| !p.is_empty()) {
            let key = format!("{}::gateway::{path}", user.as_deref().unwrap_or(""));
            if let Some(id) = by_root.get(&key).filter(|id| !id.is_empty()) {
                id.clone()
            } else {
                let id = super::identifiers::uuidv7().to_string();
                let title = crate::text::js_trim(path)
                    .trim_end_matches(['\\', '/'])
                    .split(['\\', '/'])
                    .rfind(|s| !s.is_empty())
                    .filter(|s| !s.is_empty())
                    .unwrap_or(if name.is_empty() { "Workspace" } else { name });
                db.execute("INSERT INTO workspaces (id,user_id,title,root_path,node_id,created_at,last_active_at,status,metadata) VALUES (?,?,?,?,'gateway',?,?,'active',NULL)",params![id,user,title,path,created,active])?;
                by_root.insert(key, id.clone());
                id
            }
        } else {
            let id = super::identifiers::uuidv7().to_string();
            db.execute("INSERT INTO workspaces (id,user_id,title,root_path,node_id,created_at,last_active_at,status,metadata) VALUES (?,?,?,NULL,'gateway',?,?,'active',NULL)",params![id,user,if name.is_empty(){"Untitled Workspace"}else{name},created,active])?;
            id
        };
        db.execute(
            "UPDATE sessions SET workspace_id=? WHERE id=?",
            params![id, session],
        )?;
    }
    Ok(())
}
fn rename_projects(db: &Connection) -> rusqlite::Result<()> {
    for (from, to) in [
        ("workspaces", "projects"),
        ("workspace_state", "project_state"),
    ] {
        if table_exists(db, from)? && !table_exists(db, to)? {
            db.execute_batch(&format!("ALTER TABLE \"{from}\" RENAME TO \"{to}\""))?;
        }
    }
    for (table, from, to) in [
        ("project_state", "workspace_id", "project_id"),
        ("sessions", "workspace_id", "project_id"),
        ("sessions", "workspace_path", "project_path"),
        (
            "user_settings",
            "workspace_picker_path",
            "project_picker_path",
        ),
        (
            "user_settings",
            "workspace_picker_node_id",
            "project_picker_node_id",
        ),
        ("reminders", "workspace_id", "project_id"),
        ("architecture_diagrams", "workspace_root", "project_root"),
        ("scheduled_jobs", "workspace_root", "project_root"),
        ("browser_sessions", "workspace_root", "project_root"),
    ] {
        if !table_exists(db, table)? {
            continue;
        }
        let names = columns(db, table)?;
        if names.contains(from) && !names.contains(to) {
            db.execute_batch(&format!(
                "ALTER TABLE \"{table}\" RENAME COLUMN \"{from}\" TO \"{to}\""
            ))?;
        }
    }
    for index in [
        "idx_workspaces_user_status",
        "idx_workspaces_user_root",
        "idx_workspace_state_workspace",
        "idx_reminders_workspace",
        "idx_architecture_diagrams_user_workspace",
    ] {
        db.execute_batch(&format!("DROP INDEX IF EXISTS \"{index}\""))?;
    }
    for (table, sql) in [
        (
            "projects",
            "CREATE INDEX IF NOT EXISTS idx_projects_user_status ON projects(user_id, status, last_active_at); CREATE INDEX IF NOT EXISTS idx_projects_user_root ON projects(user_id, root_path, node_id)",
        ),
        (
            "project_state",
            "CREATE INDEX IF NOT EXISTS idx_project_state_project ON project_state(project_id)",
        ),
        (
            "reminders",
            "CREATE INDEX IF NOT EXISTS idx_reminders_project ON reminders(project_id, updated_at DESC)",
        ),
        (
            "architecture_diagrams",
            "CREATE INDEX IF NOT EXISTS idx_architecture_diagrams_user_project ON architecture_diagrams(user_id, project_root)",
        ),
        (
            "memories",
            "UPDATE memories SET scope = 'project' WHERE scope = 'workspace'",
        ),
        (
            "project_state",
            "UPDATE project_state SET key = 'project.ui' WHERE key = 'workspace.ui'; UPDATE project_state SET key = 'project.panel' WHERE key = 'workspace.panel'; UPDATE project_state SET key = 'project.tabs' WHERE key = 'workspace.tabs'; UPDATE project_state SET key = 'project.layout' WHERE key = 'workspace.layout'; UPDATE project_state SET key = 'project.layout.mobile' WHERE key = 'workspace.layout.mobile'",
        ),
    ] {
        if table_exists(db, table)? {
            db.execute_batch(sql)?;
        }
    }
    if table_exists(db, "session_state")? {
        for key in ["panel", "tabs", "layout", "layout.mobile"] {
            db.execute(
                "UPDATE session_state SET key=? WHERE key=?",
                params![format!("project.{key}"), format!("workspace.{key}")],
            )?;
        }
    }
    Ok(())
}
fn deduplicate_repositories(db: &Connection) -> rusqlite::Result<()> {
    type Repo = (String, Option<String>, String);
    let rows: Vec<Repo> = db.prepare("SELECT id,user_id,local_path FROM automation_repositories ORDER BY created_at ASC,id ASC")?.query_map([],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?)))?.collect::<rusqlite::Result<_>>()?;
    let mut keepers: HashMap<String, String> = HashMap::new();
    let mut redirects = Vec::new();
    for (id, user, path) in rows {
        let key = format!("{}\0{path}", user.as_deref().unwrap_or(""));
        if let Some(keeper) = keepers.get(&key).filter(|id| !id.is_empty()) {
            redirects.push((id, keeper.clone()));
        } else {
            keepers.insert(key, id);
        }
    }
    if !redirects.is_empty() {
        for (table, column) in [
            ("automation_plans", "repo_id"),
            ("automation_repo_proposals", "repo_id"),
            ("code_graph_indexes", "repository_id"),
        ] {
            if !table_exists(db, table)? || !columns(db, table)?.contains(column) {
                continue;
            }
            for (from, to) in &redirects {
                db.execute(
                    &format!("UPDATE {table} SET {column}=? WHERE {column}=?"),
                    params![to, from],
                )?;
            }
        }
        if table_exists(db, "projects")? {
            let projects: Vec<(String,String)> = db.prepare("SELECT id,metadata FROM projects WHERE metadata IS NOT NULL AND metadata != ''")?.query_map([],|r|Ok((r.get(0)?,r.get(1)?)))?.collect::<rusqlite::Result<_>>()?;
            for (id, metadata) in projects {
                let parsed = serde_json::from_str::<Value>(&metadata);
                // Preserve the reference failure on JSON null while redirecting repos.
                if matches!(parsed, Ok(Value::Null)) {
                    return Err(rusqlite::Error::InvalidQuery);
                }
                let Ok(Value::Object(mut object)) = parsed else {
                    continue;
                };
                let mut changed = false;
                for key in ["repositoryId", "repoId"] {
                    if let Some(value) = object.get(key).and_then(Value::as_str)
                        && let Some((_, keeper)) = redirects
                            .iter()
                            .find(|(from, _)| from == crate::text::js_trim(value))
                    {
                        object.insert(key.into(), Value::String(keeper.clone()));
                        changed = true;
                    }
                }
                if changed {
                    db.execute(
                        "UPDATE projects SET metadata=? WHERE id=?",
                        params![serde_json::to_string(&object).expect("JSON object"), id],
                    )?;
                }
            }
        }
        for (id, _) in redirects {
            db.execute("DELETE FROM automation_repositories WHERE id=?", [id])?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod ordering_tests {
    use super::*;

    #[test]
    fn historical_prefix_20_upgrades_sessions_and_preserves_data() {
        let db = Connection::open_in_memory().unwrap();
        apply_migrations_through(&db, 20).unwrap();
        db.execute_batch("INSERT INTO sessions (id, user_id, name, workspace_path, created_at, last_active_at) VALUES
            ('one', 'u', 'First', '/repo', '2020', '2021'),
            ('two', 'u', 'Second', '/repo', '2020', '2021');").unwrap();
        super::super::migrate_database(&db).unwrap();
        let rows: Vec<(String, String, String)> = db
            .prepare("SELECT id, name, project_id FROM sessions ORDER BY id")
            .unwrap()
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))
            .unwrap()
            .collect::<rusqlite::Result<_>>()
            .unwrap();
        assert_eq!(rows.len(), 2);
        assert_eq!(
            (&rows[0].0, &rows[0].1),
            (&"one".to_owned(), &"First".to_owned())
        );
        assert_eq!(
            (&rows[1].0, &rows[1].1),
            (&"two".to_owned(), &"Second".to_owned())
        );
        assert!(!rows[0].2.is_empty());
        assert_eq!(rows[0].2, rows[1].2);
        let root: String = db
            .query_row(
                "SELECT root_path FROM projects WHERE id = ?",
                [&rows[0].2],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(root, "/repo");
        assert_eq!(schema_version(&db), 77);
        super::super::migrate_database(&db).unwrap();
        let count: u32 = db
            .query_row("SELECT COUNT(*) FROM projects", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn schema_repair_continues_when_column_additions_fail() {
        let db = Connection::open_in_memory().unwrap();
        db.execute_batch("CREATE TABLE messages (id TEXT); PRAGMA query_only = ON;")
            .unwrap();
        assert_eq!(verify_schema(&db).unwrap(), 0);
        assert_eq!(
            columns(&db, "messages").unwrap(),
            HashSet::from(["id".to_owned()])
        );
    }

    #[test]
    fn schema_repair_preserves_reference_column_order() {
        let db = Connection::open_in_memory().unwrap();
        db.execute_batch("CREATE TABLE messages (id TEXT)").unwrap();
        assert_eq!(verify_schema(&db).unwrap(), 2);
        let columns: Vec<String> = db
            .prepare("PRAGMA table_info(messages)")
            .unwrap()
            .query_map([], |row| row.get(1))
            .unwrap()
            .collect::<rusqlite::Result<_>>()
            .unwrap();
        assert_eq!(columns, ["id", "tool_calls", "segments"]);
    }

    #[test]
    fn tracking_insert_failure_reports_migration_and_preserves_prior_effects() {
        let db = Connection::open_in_memory().unwrap();
        db.execute_batch("CREATE TABLE _migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL);
            CREATE TRIGGER reject_migration BEFORE INSERT ON _migrations BEGIN SELECT RAISE(FAIL, 'tracking rejected'); END;").unwrap();
        let migration = Migration {
            id: 123,
            name: "tracking_failure".into(),
            operations: vec![Operation::Sql {
                sql: "CREATE TABLE migration_effect (id INTEGER)".into(),
                ignore_errors: false,
            }],
        };
        let error = apply_plan_through(&db, 123, &[migration]).unwrap_err();
        assert_eq!(error.id, 123);
        assert_eq!(error.name, "tracking_failure");
        assert!(error.to_string().contains("tracking rejected"));
        assert!(table_exists(&db, "migration_effect").unwrap());
        let applied: u32 = db
            .query_row("SELECT COUNT(*) FROM _migrations", [], |row| row.get(0))
            .unwrap();
        assert_eq!(applied, 0);
    }

    #[test]
    fn migration_62_reports_unique_index_failure_for_empty_keeper() {
        let db = Connection::open_in_memory().unwrap();
        db.execute_batch(
            "CREATE TABLE automation_repositories (id TEXT PRIMARY KEY, user_id TEXT, local_path TEXT, created_at TEXT);
             INSERT INTO automation_repositories VALUES ('', 'u', '/repo', '1'), ('second', 'u', '/repo', '2'), ('third', 'u', '/repo', '3');"
        ).unwrap();
        let migration = PLAN
            .migrations
            .iter()
            .find(|migration| migration.id == 62)
            .unwrap();
        let error = apply_plan_through(&db, 62, std::slice::from_ref(migration)).unwrap_err();
        assert_eq!(error.id, 62);
        assert!(matches!(error.source, rusqlite::Error::SqliteFailure(_, _)));
        let ids: Vec<String> = db
            .prepare("SELECT id FROM automation_repositories ORDER BY created_at")
            .unwrap()
            .query_map([], |row| row.get(0))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert_eq!(ids, ["", "second"]);
        let applied: u32 = db
            .query_row(
                "SELECT COUNT(*) FROM _migrations WHERE id = 62",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(applied, 0);
        let index: u32 = db.query_row("SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name = 'idx_automation_repos_user_path'", [], |row| row.get(0)).unwrap();
        assert_eq!(index, 0);
    }

    #[test]
    fn deduplication_does_not_redirect_to_empty_keeper() {
        let db = Connection::open_in_memory().unwrap();
        db.execute_batch(
            r#"CREATE TABLE automation_repositories (id TEXT PRIMARY KEY, user_id TEXT, local_path TEXT, created_at TEXT);
             CREATE TABLE automation_plans (repo_id TEXT);
             CREATE TABLE projects (id TEXT PRIMARY KEY, metadata TEXT);
             INSERT INTO automation_repositories VALUES ('', 'u', '/repo', '1'), ('second', 'u', '/repo', '2'), ('third', 'u', '/repo', '3');
             INSERT INTO automation_plans VALUES ('third');
             INSERT INTO projects VALUES ('p', '{"repoId":"third"}');"#
        ).unwrap();
        deduplicate_repositories(&db).unwrap();
        let ids: Vec<String> = db
            .prepare("SELECT id FROM automation_repositories ORDER BY created_at")
            .unwrap()
            .query_map([], |row| row.get(0))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert_eq!(ids, ["", "second"]);
        let plan: String = db
            .query_row("SELECT repo_id FROM automation_plans", [], |row| row.get(0))
            .unwrap();
        assert_eq!(plan, "second");
        let metadata: String = db
            .query_row("SELECT metadata FROM projects", [], |row| row.get(0))
            .unwrap();
        assert_eq!(
            serde_json::from_str::<Value>(&metadata).unwrap()["repoId"],
            "second"
        );
    }

    #[test]
    fn backfill_replaces_empty_existing_workspace_id() {
        let db = Connection::open_in_memory().unwrap();
        db.execute_batch("CREATE TABLE workspaces (id TEXT PRIMARY KEY, user_id TEXT, title TEXT, root_path TEXT, node_id TEXT, created_at TEXT, last_active_at TEXT, status TEXT, metadata TEXT); CREATE TABLE sessions (id TEXT PRIMARY KEY, user_id TEXT, name TEXT, workspace_path TEXT, created_at TEXT, last_active_at TEXT, workspace_id TEXT); INSERT INTO workspaces VALUES ('', 'user', 'old', '/project', 'gateway', '1', '1', 'active', NULL); INSERT INTO sessions VALUES ('s1', 'user', 'name', '/project', '1', '1', NULL), ('s2', 'user', 'name', '/project', '2', '2', NULL);").unwrap();
        backfill_workspaces(&db).unwrap();
        let ids: Vec<String> = db
            .prepare("SELECT workspace_id FROM sessions ORDER BY id")
            .unwrap()
            .query_map([], |row| row.get(0))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert!(!ids[0].is_empty());
        assert_eq!(ids[0], ids[1]);
        let count: i64 = db
            .query_row(
                "SELECT count(*) FROM workspaces WHERE id = ?1",
                [&ids[0]],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn migrations_run_by_id_even_when_plan_is_out_of_order() {
        let db = Connection::open_in_memory().unwrap();
        let migrations: Vec<Migration> = serde_json::from_str(r#"[
            {"id":2,"name":"insert","operations":[{"kind":"sql","sql":"INSERT INTO example VALUES (42)","ignore_errors":false}]},
            {"id":1,"name":"create","operations":[{"kind":"sql","sql":"CREATE TABLE example (value INTEGER)","ignore_errors":false}]}
        ]"#).unwrap();
        apply_plan_through(&db, 2, &migrations).unwrap();
        assert_eq!(
            db.query_row("SELECT value FROM example", [], |row| row.get::<_, i64>(0))
                .unwrap(),
            42
        );
    }
}
