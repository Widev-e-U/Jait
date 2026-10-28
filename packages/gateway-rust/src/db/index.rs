//! Port of `packages/gateway/src/db/index.ts`.
//!
//! The TS barrel re-exports the connection helpers, the whole `schema` namespace, the
//! migration inventory and the module-level `sqliteBackend` binding. The native port keeps
//! exactly that surface: the connection helpers come from this module and
//! `crate::state_directory`, the schema namespace is `crate::db::schema`, the inventory is
//! `migration_inventory`, and the backend binding becomes the `Backend` value carried by an
//! opened `SqliteDatabase` (a process-global mutable binding has no place in safe Rust).
//!
//! `JaitDB` in TS is the drizzle query-builder handle, which is TS-only; the native boundary
//! exposes the underlying `rusqlite::Connection` instead (see `JaitDb`).

pub use crate::db::{
    MigrationError, apply_migrations_through, migrate_database, migration_inventory,
    open_database, schema, schema_version, sqlite_shim, verify_schema,
};
pub use crate::db::sqlite_shim::{Backend as SqliteBackend, BackendStatus, SqliteDatabase};
pub use crate::state_directory::{StatePathError, default_db_path, resolve_database_path};

/// Stand-in for TS `type JaitDB = DrizzleDB`: the native handle a caller actually queries.
pub type JaitDb = rusqlite::Connection;

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn barrel_exposes_the_same_surface_as_the_ts_index() {
        // Mirrors `export { openDatabase, migrateDatabase, verifySchema, getSchemaVersion,
        // defaultDbPath, resolveDatabasePath } from "./connection.js"`.
        let _: fn(&Path) -> Result<JaitDb, Box<dyn std::error::Error + Send + Sync>> = open_database;
        let _: fn(&JaitDb) -> Result<(), MigrationError> = migrate_database;
        let _: fn(&JaitDb) -> rusqlite::Result<usize> = verify_schema;
        let _: fn(&JaitDb) -> u32 = schema_version;
        let _: fn(&Path, Option<&str>) -> Result<std::path::PathBuf, StatePathError> = default_db_path;
        let resolved = resolve_database_path(
            Some(":memory:"),
            |_| None,
            Path::new("/home/me"),
        )
        .expect("explicit path");
        assert_eq!(resolved, Path::new(":memory:"));

        // `export * as schema from "./schema.js"` — the namespace must expose table metadata.
        assert_eq!(schema::namespace_order().len(), schema::TABLES.len());

        // `export { migrations } from "./migrations.js"`.
        assert!(!migration_inventory().is_empty());

        // `export { sqliteBackend } from "./sqlite-shim.js"` — a mutable binding in TS becomes
        // an explicit value that starts at the same `"better-sqlite3"` export.
        assert_eq!(BackendStatus::new().get(), SqliteBackend::BetterSqlite3);
        assert_eq!(BackendStatus::new().name(), "better-sqlite3");
    }

    #[test]
    fn default_db_path_matches_the_ts_join_of_state_directory_data_and_file() {
        assert_eq!(
            default_db_path(Path::new("/home/me"), None).expect("default"),
            Path::new("/home/me/.jait/data/jait.db")
        );
    }

    #[test]
    fn open_migrate_and_verify_round_trip_matches_the_connection_helpers() {
        let connection = open_database(Path::new(":memory:")).expect("open in-memory database");

        // `openDatabase` sets WAL/journal + foreign keys before returning the handle.
        let foreign_keys: i64 = connection
            .query_row("PRAGMA foreign_keys", [], |row| row.get(0))
            .expect("pragma foreign_keys");
        assert_eq!(foreign_keys, 1);

        migrate_database(&connection).expect("migrate");

        let expected = migration_inventory().last().map_or(0, |migration| migration.0);
        assert_eq!(schema_version(&connection), expected);
        verify_schema(&connection).expect("schema verification passes after migration");
    }

    #[test]
    fn open_database_creates_the_parent_directory_for_a_file_path() {
        let root = std::env::temp_dir().join(format!(
            "jait-db-index-{}-{:?}",
            std::process::id(),
            std::thread::current().id()
        ));
        let database_path = root.join("nested/data/jait.db");
        let connection = open_database(&database_path).expect("open database file");
        drop(connection);
        assert!(database_path.exists());
        std::fs::remove_dir_all(&root).expect("cleanup");
    }
}
