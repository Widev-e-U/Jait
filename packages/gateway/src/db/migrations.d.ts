/**
 * Numbered database migrations for Jait.
 *
 * Each migration has an `id` (monotonically increasing) and a `run` function
 * that receives the raw bun:sqlite Database handle.
 *
 * The migration runner (in connection.ts) tracks applied migrations in a
 * `_migrations` table and only runs new ones. This makes updates safe and
 * idempotent — deploy a new version and it picks up from where it left off.
 *
 * Rules for adding migrations:
 *   - Always append to the end of the array.
 *   - Never modify an existing migration's `run` function.
 *   - Use `CREATE TABLE IF NOT EXISTS` and try/catch `ALTER TABLE` for safety.
 *   - Give each migration a short human-readable `name`.
 */
import type Database from "better-sqlite3";
export interface Migration {
    id: number;
    name: string;
    run: (db: Database.Database) => void;
}
export declare const migrations: Migration[];
//# sourceMappingURL=migrations.d.ts.map