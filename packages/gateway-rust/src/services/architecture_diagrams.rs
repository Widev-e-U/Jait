//! File-first architecture diagrams with legacy SQLite fallback.
//! Execute all operations on the bounded database/blocking worker.
//! Secure writes require gateway-owned project and .jait directories without
//! group/world write access; non-Unix platforms fail closed. Atomic replacement
//! creates a new inode with private permissions instead of preserving metadata.
use super::storage::Storage;
use crate::{
    db::identifiers::uuidv7, integrations::skills::filesystem::Directory,
    security::path_guard::PathGuard, text::js_trim,
};
use rusqlite::{Connection, OptionalExtension, params};
use serde_json::{Value, json};
use std::{
    io,
    path::{Path, PathBuf},
};
pub type DiagramError = Box<dyn std::error::Error + Send + Sync>;
pub const DEFAULT_ARCHITECTURE_DIAGRAM_FILE: &str = ".jait/architecture.mmd";
pub struct ArchitectureDiagramService<'a> {
    db: &'a Connection,
    time: Option<&'a str>,
}
fn hydrate(r: &rusqlite::Row<'_>) -> rusqlite::Result<Value> {
    Ok(
        json!({"id":r.get::<_,String>(0)?,"userId":r.get::<_,Option<String>>(1)?,"projectRoot":r.get::<_,String>(2)?,"diagram":r.get::<_,String>(3)?,"createdAt":r.get::<_,String>(4)?,"updatedAt":r.get::<_,String>(5)?}),
    )
}
const COLUMNS: &str = "id,user_id,project_root,diagram,created_at,updated_at";
impl<'a> ArchitectureDiagramService<'a> {
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
        Storage {
            db: self.db,
            time: self.time,
        }
        .now()
    }
    fn stored(&self, root: &str, user: Option<&str>) -> rusqlite::Result<Option<Value>> {
        let user = user.filter(|s| !s.is_empty());
        self.db.query_row(&format!("SELECT {COLUMNS} FROM architecture_diagrams WHERE project_root=?1 AND user_id IS ?2"),params![root,user],hydrate).optional()
    }
    pub fn get_file_path(&self, root: &str) -> Result<PathBuf, DiagramError> {
        let root = js_trim(root);
        if root.is_empty() {
            return Err("projectRoot is required".into());
        }
        PathGuard::new(Path::new(root), &[], true)?.validate(DEFAULT_ARCHITECTURE_DIAGRAM_FILE)
    }
    pub fn get_by_project(
        &self,
        root: &str,
        user: Option<&str>,
    ) -> Result<Option<Value>, DiagramError> {
        let root = js_trim(root);
        if root.is_empty() {
            return Ok(None);
        }
        let path = self.get_file_path(root)?;
        let read = || -> io::Result<Vec<u8>> {
            let root = path
                .parent()
                .and_then(Path::parent)
                .ok_or_else(|| io::Error::other("missing diagram root"))?;
            let directory = Directory::open(root)?.child(".jait", false)?;
            directory.read_single_link("architecture.mmd", usize::MAX - 1)
        };
        let file = match read() {
            Ok(bytes) => Some(bytes),
            Err(error) if error.kind() == io::ErrorKind::NotFound => None,
            Err(error) => return Err(error.into()),
        };
        if let Some(bytes) = file {
            let text = String::from_utf8_lossy(&bytes);
            let diagram = js_trim(&text);
            if !diagram.is_empty() {
                let row = self.stored(root, user)?.unwrap_or(Value::Null);
                let now = self.now()?;
                return Ok(Some(json!({
                 "id":row["id"].as_str().map(String::from).unwrap_or_else(||format!("file:{root}")),
                 "userId":user.map(String::from).or_else(||row["userId"].as_str().map(String::from)),
                 "projectRoot":root,"diagram":diagram,
                 "createdAt":row["createdAt"].as_str().unwrap_or(&now),
                 "updatedAt":row["updatedAt"].as_str().unwrap_or(&now),
                 "filePath":path.to_string_lossy(),"source":"file"
                })));
            }
        }
        let Some(mut record) = self.stored(root, user)? else {
            return Ok(None);
        };
        record["filePath"] = json!(path.to_string_lossy());
        record["source"] = json!("database");
        Ok(Some(record))
    }
    pub fn save(
        &self,
        root: &str,
        diagram: &str,
        user: Option<&str>,
    ) -> Result<Value, DiagramError> {
        let root = js_trim(root);
        let diagram = js_trim(diagram);
        if root.is_empty() {
            return Err("projectRoot is required".into());
        }
        if diagram.is_empty() {
            return Err("diagram is required".into());
        }
        let path = self.get_file_path(root)?;
        let root_path = path
            .parent()
            .and_then(Path::parent)
            .ok_or("missing diagram root")?;
        let root_dir = Directory::open(root_path)?;
        root_dir.ensure_owned()?;
        let directory = root_dir.child(".jait", true)?;
        let temporary = format!("architecture-{}.tmp", uuid::Uuid::new_v4());
        directory.write_new(&temporary, format!("{diagram}\n").as_bytes())?;
        if let Err(error) = directory.rename(&temporary, &directory, "architecture.mmd", true) {
            let _ = directory.remove_file(&temporary);
            return Err(error.into());
        }
        let now = self.now()?;
        if let Some(existing) = self.stored(root, user)? {
            self.db.execute(
                "UPDATE architecture_diagrams SET diagram=?,updated_at=? WHERE id=?",
                params![diagram, now, existing["id"].as_str()],
            )?;
        } else {
            self.db.execute("INSERT INTO architecture_diagrams(id,user_id,project_root,diagram,created_at,updated_at)VALUES(?,?,?,?,?,?)",params![uuidv7().to_string(),user,root,diagram,now,now])?;
        }
        Ok(self.get_by_project(root, user)?.expect("saved diagram"))
    }
    pub fn list(&self, user: Option<&str>) -> rusqlite::Result<Vec<Value>> {
        self.db.prepare(&format!("SELECT {COLUMNS} FROM architecture_diagrams WHERE user_id IS ? ORDER BY updated_at DESC"))?
   .query_map([user.filter(|s|!s.is_empty())],hydrate)?.collect()
    }
}
