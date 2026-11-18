//! Test-only observation adapter. No expected outcomes or replacement implementations.
use anyhow::{Context, Result, bail, ensure};
use jait_gateway::{
    db,
    services::persisted_tool_calls::{SerializationOptions, serialize_persisted_tool_calls},
};
use rusqlite::{Connection, types::ValueRef};
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    fs,
    io::{self, Read},
    path::{Path, PathBuf},
};

fn query(db: &Connection, sql: &str) -> Result<Value> {
    let mut statement = db.prepare(sql)?;
    let names: Vec<String> = statement
        .column_names()
        .iter()
        .map(|s| s.to_string())
        .collect();
    let rows = statement
        .query_map([], |row| {
            let mut out = serde_json::Map::new();
            for (i, name) in names.iter().enumerate() {
                let value = match row.get_ref(i)? {
                    ValueRef::Null => Value::Null,
                    ValueRef::Integer(n) => json!(n),
                    ValueRef::Real(n) => json!(n),
                    ValueRef::Text(_) => json!(row.get::<_, String>(i)?),
                    ValueRef::Blob(s) => json!(s),
                };
                out.insert(name.clone(), value);
            }
            Ok(Value::Object(out))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(json!(rows))
}
fn name(value: &Value, field: &str) -> Result<String> {
    Ok(value[field]
        .as_str()
        .context(format!("missing {field}"))?
        .into())
}
fn fixture(dir: &Path, name: &str) -> Result<PathBuf> {
    ensure!(
        name.ends_with(".db")
            && name
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || "-_.".contains(c))
            && !name.contains(".."),
        "fixture basename required"
    );
    let path = dir.join(name);
    if path.exists() {
        ensure!(path.canonicalize()? == path, "fixture symlink rejected");
    }
    Ok(path)
}
fn schema(db: &Connection) -> Result<Value> {
    let objects = query(
        db,
        "SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name",
    )?;
    let mut tables = serde_json::Map::new();
    for t in objects
        .as_array()
        .unwrap()
        .iter()
        .filter(|t| t["type"] == "table")
    {
        let n = t["name"].as_str().unwrap();
        let quoted = n.replace('"', "\"\"");
        let columns = query(db, &format!("PRAGMA table_info(\"{quoted}\")"))?;
        let foreign_keys = query(db, &format!("PRAGMA foreign_key_list(\"{quoted}\")"))?;
        tables.insert(
            n.into(),
            json!({"columns":columns,"foreignKeys":foreign_keys}),
        );
    }
    Ok(json!({"objects":objects,"tables":tables}))
}
fn recovery(actions: &[Value], dir: &Path) -> Result<Value> {
    let mut handles: HashMap<String, Connection> = HashMap::new();
    let mut out = serde_json::Map::new();
    for a in actions {
        let result = (|| -> Result<Value> {
            let op = name(a, "op")?;
            let handle = a["handle"].as_str().unwrap_or("db");
            if op == "open" {
                let path = fixture(dir, &name(a, "file")?)?;
                let db = db::open_database(&path).map_err(|e| anyhow::anyhow!(e.to_string()))?;
                handles.insert(handle.into(), db);
                return Ok(json!({"backend":"rusqlite","path":path}));
            }
            if op == "close" {
                handles.remove(handle).context("missing handle")?;
                return Ok(Value::Null);
            }
            if op == "corrupt" {
                let bytes: Vec<u8> = serde_json::from_value(a["bytes"].clone())?;
                fs::write(fixture(dir, &name(a, "file")?)?, bytes)?;
                return Ok(Value::Null);
            }
            if op == "copy" {
                fs::copy(
                    fixture(dir, &name(a, "from")?)?,
                    fixture(dir, &name(a, "to")?)?,
                )?;
                return Ok(Value::Null);
            }
            let db = handles.get(handle).context("missing database handle")?;
            match op.as_str() {
                "exec" => {
                    db.execute_batch(&name(a, "sql")?)?;
                    Ok(Value::Null)
                }
                "query" => query(db, &name(a, "sql")?),
                "page-limit" => {
                    let pages: i64 = db.query_row("PRAGMA page_count", [], |r| r.get(0))?;
                    db.execute_batch(&format!("PRAGMA max_page_count={pages}"))?;
                    Ok(json!(pages))
                }
                "migrate" => {
                    db::migrate_database(db)?;
                    Ok(json!(db::schema_version(db)))
                }
                "prefix" => {
                    db::apply_migrations_through(
                        db,
                        a["version"].as_u64().context("missing prefix")? as u32,
                    )?;
                    Ok(json!(db::schema_version(db)))
                }
                "version" => Ok(json!(db::schema_version(db))),
                "schema" => schema(db),
                "backup" => {
                    let target = fixture(dir, &name(a, "file")?)?;
                    db.execute("VACUUM INTO ?", [target.to_string_lossy().as_ref()])?;
                    Ok(Value::Null)
                }
                "transaction" => {
                    db.execute_batch("BEGIN IMMEDIATE")?;
                    let result = (|| -> Result<()> {
                        for s in a["sql"].as_array().context("SQL array required")? {
                            db.execute_batch(s.as_str().context("SQL string required")?)?;
                        }
                        Ok(())
                    })();
                    match result {
                        Ok(()) => db.execute_batch("COMMIT")?,
                        Err(e) => {
                            db.execute_batch("ROLLBACK")?;
                            return Err(e);
                        }
                    }
                    Ok(Value::Null)
                }
                _ => bail!("unsupported native recovery operation {op}"),
            }
        })();
        out.insert(
            name(a, "key")?,
            match result {
                Ok(value) => json!({"value":value}),
                Err(e) => json!({"error":e.to_string()}),
            },
        );
    }
    Ok(Value::Object(out))
}
fn run() -> Result<()> {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()?;
    let dir = PathBuf::from(std::env::var("JAIT_STATE_DIR")?);
    fs::create_dir_all(&dir)?;
    ensure!(
        dir.canonicalize()?
            .starts_with(root.join(".jait/artifacts")),
        "project-local state required"
    );
    let mut input = String::new();
    io::stdin().take(65_537).read_to_string(&mut input)?;
    ensure!(input.len() <= 65_536, "input limit exceeded");
    let input: Value = serde_json::from_str(&input)?;
    let calls = input["calls"].as_array().context("calls array required")?;
    ensure!(
        input["version"] == 1 && calls.len() <= 64,
        "invalid protocol"
    );
    let mut results = Vec::new();
    for call in calls {
        let op = name(call, "op")?;
        let result = match op.as_str() {
            "recovery.plan" => recovery(
                call["actions"].as_array().context("actions required")?,
                &dir,
            )?,
            "toolcalls.serialize" => json!(serialize_persisted_tool_calls(
                call["raw"].as_str(),
                &serde_json::from_value::<SerializationOptions>(
                    call.get("options").cloned().unwrap_or(json!({}))
                )?
            )),
            _ => json!({"unsupported":op,"backend":"rust"}),
        };
        results.push(result);
    }
    println!("{}", json!({"version":1,"results":results}));
    Ok(())
}
fn main() {
    if let Err(error) = run() {
        eprintln!("{error:#}");
        std::process::exit(1);
    }
}
