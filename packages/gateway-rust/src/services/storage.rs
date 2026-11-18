//! Internal helpers for SQLite repositories. Call from the bounded database worker.
use super::users::Patch;
use rusqlite::{Connection, params_from_iter, types::Value as SqlValue};
use serde_json::Value;
pub(crate) struct Storage<'a> {
    pub db: &'a Connection,
    pub time: Option<&'a str>,
}
impl Storage<'_> {
    pub fn now(&self) -> rusqlite::Result<String> {
        self.time.map(|v| Ok(v.to_owned())).unwrap_or_else(|| {
            self.db
                .query_row("SELECT strftime('%Y-%m-%dT%H:%M:%fZ','now')", [], |r| {
                    r.get(0)
                })
        })
    }
    pub fn update(
        &self,
        table: &'static str,
        id: &str,
        fields: Vec<(&'static str, SqlValue)>,
    ) -> rusqlite::Result<()> {
        self.update_at(table, id, fields, &self.now()?)
    }
    pub fn update_at(
        &self,
        table: &'static str,
        id: &str,
        fields: Vec<(&'static str, SqlValue)>,
        now: &str,
    ) -> rusqlite::Result<()> {
        let mut columns = vec!["updated_at=?".to_string()];
        let mut values = vec![SqlValue::Text(now.into())];
        for (column, value) in fields {
            columns.push(format!("{column}=?"));
            values.push(value);
        }
        values.push(SqlValue::Text(id.into()));
        self.db.execute(
            &format!("UPDATE {table} SET {} WHERE id=?", columns.join(",")),
            params_from_iter(values),
        )?;
        Ok(())
    }
}
pub(crate) fn patch_text(
    fields: &mut Vec<(&'static str, SqlValue)>,
    key: &'static str,
    value: Patch<Option<String>>,
) {
    if let Patch::Set(value) = value {
        fields.push((key, value.map(SqlValue::Text).unwrap_or(SqlValue::Null)));
    }
}
pub(crate) fn json_text(value: &Value) -> String {
    crate::contracts::bounded_json::JsonGraph::from_value(value)
        .stringify()
        .unwrap_or_else(|| value.to_string())
}
