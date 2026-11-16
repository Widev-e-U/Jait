//! SQLite assistant profiles. Execute on the bounded database worker.
use super::storage::Storage;
use crate::{db::identifiers::uuidv7, text::js_trim};
use rusqlite::{Connection, OptionalExtension, params, types::Value as SqlValue};
use serde_json::{Value, json};

pub struct AssistantProfileService<'a> {
    db: &'a Connection,
    time: Option<&'a str>,
}
fn strings(value: &Value, trim_empty: bool) -> Value {
    json!(
        value
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(Value::as_str)
            .filter(|s| !trim_empty || !js_trim(s).is_empty())
            .collect::<Vec<_>>()
    )
}
fn hydrate(row: &rusqlite::Row<'_>) -> rusqlite::Result<Value> {
    let parse = |index| -> rusqlite::Result<Value> {
        let text: Option<String> = row.get(index)?;
        Ok(strings(
            &text
                .and_then(|s| serde_json::from_str(&s).ok())
                .unwrap_or(Value::Null),
            false,
        ))
    };
    Ok(json!({
        "id":row.get::<_,String>(0)?, "userId":row.get::<_,Option<String>>(1)?,
        "name":row.get::<_,String>(2)?, "description":row.get::<_,Option<String>>(3)?,
        "systemPrompt":row.get::<_,Option<String>>(4)?, "runtimeMode":row.get::<_,Option<String>>(5)?,
        "toolProfile":row.get::<_,Option<String>>(6)?, "enabledSkills":parse(7)?,
        "enabledPlugins":parse(8)?, "isDefault":row.get::<_,i64>(9)? == 1,
        "createdAt":row.get::<_,String>(10)?, "updatedAt":row.get::<_,String>(11)?
    }))
}
const COLUMNS: &str = "id,user_id,name,description,system_prompt,runtime_mode,tool_profile,enabled_skills,enabled_plugins,is_default,created_at,updated_at";
impl<'a> AssistantProfileService<'a> {
    pub fn new(db: &'a Connection) -> Self {
        Self { db, time: None }
    }
    pub fn with_time(db: &'a Connection, time: &'a str) -> Self {
        Self {
            db,
            time: Some(time),
        }
    }
    fn storage(&self) -> Storage<'_> {
        Storage {
            db: self.db,
            time: self.time,
        }
    }
    pub fn list(&self, user: Option<&str>) -> rusqlite::Result<Vec<Value>> {
        let mut stmt = self.db.prepare(&format!("SELECT {COLUMNS} FROM assistant_profiles WHERE (?1 IS NULL OR user_id=?1) ORDER BY updated_at DESC"))?;
        stmt.query_map([user.filter(|s| !s.is_empty())], hydrate)?
            .collect()
    }
    pub fn get(&self, id: &str, user: Option<&str>) -> rusqlite::Result<Option<Value>> {
        self.db.query_row(&format!("SELECT {COLUMNS} FROM assistant_profiles WHERE id=?1 AND (?2 IS NULL OR user_id=?2)"), params![id,user.filter(|s| !s.is_empty())], hydrate).optional()
    }
    fn clear_default(&self, user: &str) -> rusqlite::Result<()> {
        self.db.execute(
            "UPDATE assistant_profiles SET is_default=0,updated_at=? WHERE user_id=?",
            params![self.storage().now()?, user],
        )?;
        Ok(())
    }
    pub fn create(&self, user: &str, input: &Value) -> rusqlite::Result<Value> {
        self.create_with_id(&uuidv7().to_string(), user, input)
    }
    pub fn create_with_id(&self, id: &str, user: &str, input: &Value) -> rusqlite::Result<Value> {
        let tx = rusqlite::Transaction::new_unchecked(
            self.db,
            rusqlite::TransactionBehavior::Immediate,
        )?;
        let service = AssistantProfileService {
            db: &tx,
            time: self.time,
        };
        let result = service.create_with_id_inner(id, user, input)?;
        tx.commit()?;
        Ok(result)
    }
    fn create_with_id_inner(&self, id: &str, user: &str, input: &Value) -> rusqlite::Result<Value> {
        let now = self.storage().now()?;
        let default = input["isDefault"] == true || self.list(Some(user))?.is_empty();
        if default {
            self.clear_default(user)?;
        }
        self.db.execute("INSERT INTO assistant_profiles(id,user_id,name,description,system_prompt,runtime_mode,tool_profile,enabled_skills,enabled_plugins,is_default,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
            params![id,user,js_trim(input["name"].as_str().unwrap_or("")),input["description"].as_str(),input["systemPrompt"].as_str(),input["runtimeMode"].as_str(),input["toolProfile"].as_str(),strings(&input["enabledSkills"],true).to_string(),strings(&input["enabledPlugins"],true).to_string(),default as i64,now,now])?;
        Ok(self.get(id, Some(user))?.expect("inserted profile"))
    }
    pub fn update(&self, id: &str, user: &str, input: &Value) -> rusqlite::Result<Option<Value>> {
        let tx = rusqlite::Transaction::new_unchecked(
            self.db,
            rusqlite::TransactionBehavior::Immediate,
        )?;
        let service = AssistantProfileService {
            db: &tx,
            time: self.time,
        };
        let result = service.update_inner(id, user, input)?;
        tx.commit()?;
        Ok(result)
    }
    fn update_inner(&self, id: &str, user: &str, input: &Value) -> rusqlite::Result<Option<Value>> {
        if self.get(id, Some(user))?.is_none() {
            return Ok(None);
        }
        if input["isDefault"] == true {
            self.clear_default(user)?;
        }
        let mut fields = vec![];
        for (key, column) in [
            ("name", "name"),
            ("description", "description"),
            ("systemPrompt", "system_prompt"),
            ("runtimeMode", "runtime_mode"),
            ("toolProfile", "tool_profile"),
        ] {
            if let Some(value) = input.get(key) {
                if let Some(s) = value.as_str() {
                    fields.push((
                        column,
                        SqlValue::Text(if key == "name" {
                            js_trim(s).into()
                        } else {
                            s.into()
                        }),
                    ));
                } else if value.is_null() && key != "name" {
                    fields.push((column, SqlValue::Null));
                }
            }
        }
        for (key, column) in [
            ("enabledSkills", "enabled_skills"),
            ("enabledPlugins", "enabled_plugins"),
        ] {
            if input.get(key).is_some() {
                fields.push((
                    column,
                    SqlValue::Text(strings(&input[key], true).to_string()),
                ));
            }
        }
        if let Some(default) = input["isDefault"].as_bool() {
            fields.push(("is_default", SqlValue::Integer(default as i64)));
        }
        let now = self.storage().now()?;
        self.storage()
            .update_at("assistant_profiles", id, fields, &now)?;
        if self.get(id, Some(user))?.is_none() {
            return Ok(None);
        }
        if !self
            .list(Some(user))?
            .iter()
            .any(|p| p["isDefault"] == true)
        {
            self.db.execute(
                "UPDATE assistant_profiles SET is_default=1,updated_at=? WHERE id=? AND user_id=?",
                params![now, id, user],
            )?;
        }
        self.get(id, Some(user))
    }
    pub fn delete(&self, id: &str, user: &str) -> rusqlite::Result<bool> {
        let tx = rusqlite::Transaction::new_unchecked(
            self.db,
            rusqlite::TransactionBehavior::Immediate,
        )?;
        let service = AssistantProfileService {
            db: &tx,
            time: self.time,
        };
        let result = service.delete_inner(id, user)?;
        tx.commit()?;
        Ok(result)
    }
    fn delete_inner(&self, id: &str, user: &str) -> rusqlite::Result<bool> {
        let Some(existing) = self.get(id, Some(user))? else {
            return Ok(false);
        };
        self.db.execute(
            "DELETE FROM assistant_profiles WHERE id=? AND user_id=?",
            params![id, user],
        )?;
        if existing["isDefault"] == true
            && let Some(next) = self.list(Some(user))?.first()
        {
            self.db.execute(
                "UPDATE assistant_profiles SET is_default=1,updated_at=? WHERE id=?",
                params![self.storage().now()?, next["id"].as_str()],
            )?;
        }
        Ok(true)
    }
}
