/** SQLite call/observation bridge. All scenarios and acceptance assertions live in Rust. */
import { mkdirSync, copyFileSync, realpathSync, writeFileSync, readFileSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase, migrateDatabase, getSchemaVersion } from '../../../packages/gateway/src/db/connection.ts';
import { migrations } from '../../../packages/gateway/src/db/migrations.ts';
import { sqliteBackend, type SqliteDatabase } from '../../../packages/gateway/src/db/sqlite-shim.ts';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const artifacts = process.env.JAIT_STATE_DIR!;
if (!artifacts || !resolve(artifacts).startsWith(join(root, '.jait/artifacts') + '/')) throw new Error('project-local state required');
mkdirSync(artifacts, { recursive: true });
if (realpathSync(artifacts) !== artifacts) throw new Error('artifact directory symlink rejected');
// The importing migration bridge owns the process deadline; importing this helper
// must not install a second watchdog that can kill unrelated messenger operations.
process.env.NODE_ENV = 'test';
// Never allow environment defaults to select a real database.
delete process.env.JAIT_DB_PATH;
console.log = (...args) => console.error(...args);
const handles = new Map<string, SqliteDatabase>();
function fixture(name: string): string {
  if (!/^[a-zA-Z0-9_-]+\.db$/.test(name)) throw new Error('fixture basename required');
  const path = resolve(artifacts, name);
  // Defense against a pre-existing symlink redirecting a sanitized fixture.
  try { if (realpathSync(path) !== path) throw new Error('fixture symlink rejected'); }
  catch (error: any) { if (error.code !== 'ENOENT') throw error; }
  return path;
}
async function dispatch(a: any): Promise<unknown> {
  const db = handles.get(a.handle ?? 'db')!;
  switch (a.op) {
    case 'inventory': return { backend: sqliteBackend, bun: Bun.version,
      migrations: [...migrations].sort((a,b) => a.id-b.id).map(({id,name}) => ({id,name})),
      sources: Object.fromEntries(['packages/gateway/src/db/migrations.ts', 'packages/gateway/src/db/connection.ts', 'packages/gateway/src/db/sqlite-shim.ts'].map(p => [p, new Bun.CryptoHasher('sha256').update(readFileSync(join(root,p))).digest('hex')])) };
    case 'open': {
      const path = fixture(a.file);
      const opened = await openDatabase(path);
      handles.set(a.handle ?? 'db', opened.sqlite);
      return { path, backend: sqliteBackend, sqlite: opened.sqlite.prepare('SELECT sqlite_version() AS version').get() };
    }
    case 'close': db.close(); handles.delete(a.handle ?? 'db'); return null;
    case 'exec': db.exec(a.sql); return null;
    case 'query': return db.prepare(a.sql).all(...(a.params ?? []));
    case 'files': return Object.fromEntries(['', '-wal', '-shm'].map(suffix => {
      try { return [suffix || 'db', statSync(fixture(a.file) + suffix).size]; }
      catch (e: any) { if (e.code === 'ENOENT') return [suffix || 'db', null]; throw e; }
    }));
    case 'version': return getSchemaVersion(db);
    case 'prefix': {
      // Reconstruct historical DDL from current definitions, without today's verifySchema repairs.
      db.exec(`CREATE TABLE _migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )`);
      for (const m of [...migrations].sort((a,b) => a.id-b.id).filter(m => m.id <= a.version)) {
        m.run(db);
        db.prepare('INSERT INTO _migrations VALUES (?, ?, ?)').run(m.id, m.name, '2026-01-01T00:00:00.000Z');
      }
      return getSchemaVersion(db);
    }
    case 'migrate': migrateDatabase(db); return getSchemaVersion(db);
    case 'page-limit': { const current = db.prepare('PRAGMA page_count').get() as {page_count:number}; db.exec(`PRAGMA max_page_count=${current.page_count}`); return current.page_count; }
    case 'corrupt': writeFileSync(fixture(a.file), Buffer.from(a.bytes)); return null;
    case 'schema': {
      const objects = db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all() as any[];
      const tables = objects.filter(o => o.type === 'table');
      const quote = (s: string) => '"' + s.replaceAll('"','""') + '"';
      return { objects, tables: Object.fromEntries(tables.map(t => [t.name, {
        columns: db.prepare(`PRAGMA table_info(${quote(t.name)})`).all(),
        indexes: db.prepare(`PRAGMA index_list(${quote(t.name)})`).all().map((i: any) => ({...i, columns: db.prepare(`PRAGMA index_xinfo(${quote(i.name)})`).all()})),
        foreignKeys: db.prepare(`PRAGMA foreign_key_list(${quote(t.name)})`).all(),
      }])) };
    }
    case 'backup': db.exec(`VACUUM INTO '${fixture(a.file).replaceAll("'", "''")}'`); return null;
    case 'copy': copyFileSync(fixture(a.from), fixture(a.to)); return null;
    case 'transaction': return db.transaction(() => { for (const sql of a.sql) db.exec(sql); }).immediate();
    default: throw new Error(`unknown operation ${a.op}`);
  }
}

export async function recoveryPlan(actions: any[]) {
  const observations: Record<string, unknown> = {};
  try {
    for (const a of actions) {
      try { observations[a.key] = {value:await dispatch(a)}; }
      catch (error: any) { observations[a.key] = {error:error.message}; }
    }
    return observations;
  } finally { for (const db of handles.values()) db.close(); handles.clear(); }
}
