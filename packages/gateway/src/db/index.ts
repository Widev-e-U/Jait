export { openDatabase, migrateDatabase, verifySchema, getSchemaVersion, defaultDbPath, resolveDatabasePath, type JaitDB, type SqliteDatabase } from "./connection.js";
export * as schema from "./schema.js";
export { migrations } from "./migrations.js";
export { sqliteBackend } from "./sqlite-shim.js";
