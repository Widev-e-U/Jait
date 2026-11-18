/** Disposable production history-service reference; Rust owns inputs and assertions. */
import { openDatabase, migrateDatabase } from '../../../packages/gateway/src/db/connection.ts';
import { ChatTracesService } from '../../../packages/gateway/src/services/chat-traces.ts';
import { SessionSearchService, buildFtsQuery } from '../../../packages/gateway/src/services/session-search.ts';
function units(text: string) { return Array.from({length:text.length},(_,i)=>text.charCodeAt(i)); }
export async function dispatch(call: any) {
  if (call.op === 'nativehistory.query') return call.queries.map(buildFtsQuery);
  const log = console.log;
  console.log = (...args) => console.error(...args);
  const { sqlite } = await openDatabase(':memory:');
  try {
    migrateDatabase(sqlite);
    if (call.seed) sqlite.exec(call.seed);
    const service = new ChatTracesService(sqlite);
    const results = call.options.map((options: any) => {
      try {
        if(call.op === 'nativehistory.search') return new SessionSearchService(sqlite).search(options).map(r=>({...r,content:units(r.content),snippet:units(r.snippet)}));
        return service.traces(options);
      } catch { return { error: true }; }
    });
    return results;
  } finally { sqlite.close(); console.log = log; }
}
