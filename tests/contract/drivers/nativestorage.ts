/** Disposable fixture transport. Rust owns assertions and native execution. */
import { mkdirSync, realpathSync, copyFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase, migrateDatabase, getSchemaVersion } from '../../../packages/gateway/src/db/connection.ts';
import { migrations } from '../../../packages/gateway/src/db/migrations.ts';
import { uuidv7, newActionId } from '../../../packages/gateway/src/db/uuidv7.ts';
import { getStateDirectory } from '../../../packages/gateway/src/state-directory.ts';
import { resolveDatabasePath } from '../../../packages/gateway/src/db/connection.ts';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const base = join(root, '.jait/artifacts/gateway-rust/native-storage');
function directory(id: string): string {
  if (!/^[a-z0-9-]{1,64}$/.test(id)) throw new Error('fixture ID required');
  const path = join(base, id);
  mkdirSync(path, { recursive: true });
  if (realpathSync(path) !== path) throw new Error('fixture symlink rejected');
  return path;
}
type Call = { op: string; id: string; file?: string; versions?: number[]; timestamp?: number; entropy?: number[]; settings?: Record<string,string>; explicit?: string; seed?: string; expectedFailure?: boolean };
export async function dispatch(call: Call): Promise<unknown> {
  if (call.op === 'nativestorage.identifier') {
    const originalNow = Date.now;
    const originalRandom = crypto.getRandomValues;
    Date.now = () => call.timestamp!;
    crypto.getRandomValues = ((bytes: Uint8Array) => { bytes.set(call.entropy!); return bytes; }) as typeof crypto.getRandomValues;
    try { return { uuid: uuidv7(), action: newActionId() }; }
    finally { Date.now = originalNow; crypto.getRandomValues = originalRandom; }
  }
  if (call.op === 'nativestorage.paths') {
    const original = process.env.JAIT_STATE_DIR;
    try {
      if (call.settings?.JAIT_STATE_DIR === undefined) delete process.env.JAIT_STATE_DIR;
      else process.env.JAIT_STATE_DIR = call.settings.JAIT_STATE_DIR;
      const state = getStateDirectory();
      return { state, database: resolveDatabasePath(call.explicit, call.settings ?? {}) };
    } catch (error) { return { error: error instanceof Error ? error.message : String(error) }; }
    finally {
      if (original === undefined) delete process.env.JAIT_STATE_DIR;
      else process.env.JAIT_STATE_DIR = original;
    }
  }
  const dir = directory(call.id);
  const log = console.log;
  console.log = (...args) => console.error(...args);
  try {
    if (call.op === 'nativestorage.prefixes') {
      if (!call.versions || call.versions.length > 78 || call.versions.some(n => !Number.isInteger(n) || n < 0 || n > 77)) throw new Error('schema prefixes required');
      const observations = [];
      for (const version of call.versions) {
        const reference = join(dir, `reference-${version}.db`);
        const native = join(dir, `native-${version}.db`);
        const { sqlite } = await openDatabase(reference);
        try {
          sqlite.exec('CREATE TABLE _migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)');
          for (const migration of [...migrations].sort((a,b) => a.id-b.id).filter(m => m.id <= version)) {
            migration.run(sqlite);
            sqlite.prepare('INSERT INTO _migrations VALUES (?,?,?)').run(migration.id,migration.name,'2026-01-01T00:00:00.000Z');
          }
          if (version >= 1) {
            const pathColumn = version < 37 ? 'workspace_path' : 'project_path';
            const insert = sqlite.prepare(`INSERT INTO sessions (id,user_id,name,${pathColumn},created_at,last_active_at) VALUES (?,?,?,?,?,?)`);
            for (const [id,user,name,path] of [
              ['s1','owner','  First  ','/fixture/shared/'], ['s2','owner','Second','/fixture/shared/'],
              ['s3','other','Other','/fixture/shared/'], ['s4',null,'  Lone  ',null],
              ['s5','owner','Windows','C:\\fixture\\資料\\'], ['s6','owner','Root','/']
            ]) insert.run(id,user,name,path,'2026-01-01T00:00:00.000Z','2026-01-02T00:00:00.000Z');
            sqlite.exec(`INSERT INTO messages(id,session_id,role,content,created_at) VALUES ('msg','s1','user','保持 🦀','2026-01-01T00:00:00.000Z')`);
          }
          if (version >= 4 && version < 37) {
            for (const key of ['panel','tabs','layout','layout.mobile']) sqlite.prepare('INSERT INTO session_state VALUES (?,?,?,?)').run('s1',`workspace.${key}`,'{"preserved":true}','2026-01-01');
          }
          if (call.seed) sqlite.exec(call.seed);
          // Snapshot committed WAL contents before copying the main database file.
          sqlite.exec('PRAGMA wal_checkpoint(TRUNCATE)');
        } finally { sqlite.close(); }
        copyFileSync(reference,native);
        const updated = await openDatabase(reference);
        let migrationError: string | undefined;
        try { migrateDatabase(updated.sqlite); }
        catch (error) {
          if (!call.expectedFailure) throw error;
          migrationError = error instanceof Error ? error.message : String(error);
        } finally { updated.sqlite.close(); }
        observations.push({ version, native, reference, migrationError });
      }
      return observations;
    }
    if (call.op === 'nativestorage.reopen') {
      if (!call.file || resolve(call.file) !== call.file || !call.file.startsWith(`${dir}/`) || realpathSync(call.file) !== call.file) throw new Error('owned fixture required');
      const { sqlite } = await openDatabase(call.file);
      try {
        migrateDatabase(sqlite);
        return { version:getSchemaVersion(sqlite), integrity:sqlite.prepare('PRAGMA integrity_check').all(), sessions:sqlite.prepare('SELECT id,name FROM sessions ORDER BY id').all() };
      } finally { sqlite.close(); }
    }
    throw new Error('unknown native storage operation');
  } finally { console.log = log; }
}
