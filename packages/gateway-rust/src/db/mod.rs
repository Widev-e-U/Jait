pub mod identifiers;
mod migrations;
pub mod worker;
pub use migrations::{
    MigrationError, apply_migrations_through, migration_inventory, schema_version, verify_schema,
};
use rusqlite::Connection;
use std::path::Path;

/// Explicit-path-only database boundary. Startup does not call this until storage is enabled.
pub fn open_database(path: &Path) -> Result<Connection, Box<dyn std::error::Error + Send + Sync>> {
    if path != Path::new(":memory:")
        && let Some(parent) = path.parent().filter(|p| !p.as_os_str().is_empty())
    {
        std::fs::create_dir_all(parent)?;
    }
    let connection = Connection::open(path)?;
    connection.execute_batch(
        "PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON;",
    )?;
    Ok(connection)
}
pub fn migrate_database(connection: &Connection) -> Result<(), MigrationError> {
    apply_migrations_through(connection, migration_inventory().last().map_or(0, |m| m.0))?;
    verify_schema(connection).map_err(|source| MigrationError {
        id: 0,
        name: "verify_schema".into(),
        source,
    })?;
    Ok(())
}

pub mod schema;

pub mod sqlite_shim;

pub mod index;
