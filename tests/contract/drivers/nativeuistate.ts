/** Production UI-state services on disposable SQLite; inputs/assertions are Rust-owned. */
import { openDatabase, migrateDatabase } from '../../../packages/gateway/src/db/connection.ts';
import { SessionStateService } from '../../../packages/gateway/src/services/session-state.ts';
import { ProjectStateService } from '../../../packages/gateway/src/services/project-state.ts';
export async function dispatch(call: any) {
  const log = console.log; console.log = (...args) => console.error(...args);
  const RealDate = Date;
  // Same fixed clock for both implementations, restored even on failures.
  globalThis.Date = class extends RealDate { constructor(...args: any[]) { super(...(args.length ? args : [call.now]) as [any]); } static now() { return new RealDate(call.now).getTime(); } } as DateConstructor;
  let sqlite: any;
  try {
    const opened = await openDatabase(':memory:'); sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    if (call.seed) sqlite.exec(call.seed);
    const service = call.scope === 'project' ? new ProjectStateService(opened.db) : new SessionStateService(opened.db);
    const results = call.steps.map((s: any) => {
      try {
        switch(s.op) {
          case 'sql': sqlite.exec(s.sql); return null;
          case 'set': service.set(s.id, s.entries); return null;
          case 'delete': (service as SessionStateService).deleteAll(s.id); return null;
          case 'key': return (service as SessionStateService).getByKey(s.key);
          default: return service.get(s.id,s.keys);
        }
      } catch { return {error:true}; }
    });
    const table = call.scope === 'project' ? 'project_state' : 'session_state';
    return {results,rows:sqlite.query(`SELECT * FROM ${table} ORDER BY rowid`).all()};
  } finally { sqlite?.close(); console.log = log; globalThis.Date = RealDate; }
}
