//! Differential schema metadata against the live Drizzle module, including additions.
use jait_gateway::db::schema::{self, ColumnDefault, IndexKind};
use serde_json::{Value, json};
use std::process::Command;

#[test]
fn current_drizzle_columns_and_indexes_match_native_schema() {
    compare_drizzle_schema(None);
}

#[test]
fn new_database_tables_match_live_drizzle_metadata() {
    compare_drizzle_schema(Some(&[
        "browserWorkflowRuns",
        "browserWorkflows",
        "githubIntakeDecisions",
        "githubIntakePolicies",
    ]));
}

fn compare_drizzle_schema(selected: Option<&[&str]>) {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let output = Command::new("bun")
        .current_dir(root.join("packages/gateway"))
        .args([
            "--eval",
            r#"
import * as schema from './src/db/schema.ts';
import { getTableConfig } from 'drizzle-orm/sqlite-core';
import { getTableColumns } from 'drizzle-orm';
const result = Object.entries(schema).map(([key, table]) => {
  const config = getTableConfig(table);
  return { key, name: config.name,
    columns: Object.entries(getTableColumns(table)).map(([key, c]) => ({
      key, name: c.name, kind: c.getSQLType(), boolean: c.columnType === 'SQLiteBoolean',
      primary: c.primary, notNull: c.notNull, unique: c.isUnique, default: c.default ?? null
    })),
    indexes: config.indexes.map(i => ({
      name: i.config.name, unique: i.config.unique,
      columns: i.config.columns.map(c => c.name)
    }))
  };
}).sort((a,b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
console.log(JSON.stringify(result));
"#,
        ])
        .output()
        .expect("Bun must be available for the live Drizzle differential");
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let actual: Value = serde_json::from_slice(&output.stdout).expect("Drizzle JSON");
    let includes = |key: &str| selected.is_none_or(|names| names.contains(&key));
    let native: Vec<Value> = schema::namespace_order().into_iter().filter(|table| includes(table.var)).map(|table| {
        let columns: Vec<Value> = table.columns.iter().map(|c| json!({
            "key": c.key, "name": c.name, "kind": c.kind.sql_type(), "boolean": c.boolean_mode,
            "primary": c.primary_key, "notNull": c.not_null, "unique": c.unique,
            "default": match c.default {
                None => Value::Null,
                Some(ColumnDefault::Boolean(v)) => json!(v),
                Some(ColumnDefault::Integer(v)) => json!(v),
                Some(ColumnDefault::Text(v)) => json!(v),
            }
        })).collect();
        let indexes: Vec<Value> = table.extra.iter().filter(|i| !i.is_primary_key()).map(|i| json!({
            "name": i.name, "unique": matches!(i.kind, IndexKind::UniqueIndex),
            "columns": i.columns.iter().map(|key| table.column(key).expect("indexed column").name).collect::<Vec<_>>()
        })).collect();
        json!({"key": table.var, "name": table.name, "columns": columns, "indexes": indexes})
    }).collect();
    let expected = json!(native);
    let actual_tables: Vec<_> = actual
        .as_array()
        .expect("table array")
        .iter()
        .filter(|table| includes(table["key"].as_str().expect("table key")))
        .collect();
    if let Some(names) = selected {
        assert_eq!(
            actual_tables.len(),
            names.len(),
            "selected live table inventory"
        );
        assert_eq!(native.len(), names.len(), "selected native table inventory");
    }
    assert_eq!(actual_tables.len(), native.len(), "live table inventory");
    for (ts, rust) in actual_tables.iter().zip(expected.as_array().unwrap()) {
        assert_eq!(*ts, rust, "schema metadata for {}", ts["key"]);
    }
}
