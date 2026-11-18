/** Production memory ranking and SQLite storage, with no live records or logs. */
import {openDatabase,migrateDatabase} from '../../../packages/gateway/src/db/connection.ts';
import {SqliteMemoryBackend} from '../../../packages/gateway/src/memory/sqlite-backend.ts';
import {bm25Tokens,bm25Rank} from '../../../packages/gateway/src/memory/scoring.ts';
export async function dispatch(call:any) {
  if(call.op==='nativememory.tokens')return bm25Tokens(call.text);
  if(call.op==='nativememory.rank')return bm25Rank(call.query,call.documents);
  if(call.op!=='nativememory.backend')throw new Error('unknown native memory operation');
  const OriginalDate=Date;const {db,sqlite}=await openDatabase(':memory:');const log=console.log;console.log=(...args)=>console.error(...args);
  try {
    migrateDatabase(sqlite);if(call.seed)sqlite.exec(call.seed);const now=OriginalDate.parse(call.now);
    globalThis.Date=class extends OriginalDate {constructor(value?:any){super(value===undefined?now:value)}static override now(){return now}} as DateConstructor;
    const backend=new SqliteMemoryBackend(db);const results:any[]=[];
    for(const step of call.steps) {
      let value:any=null;
      try {
        switch(step.op) {
          case 'save':await backend.save(step.data);break;
          case 'update':await backend.update(step.data);break;
          case 'list':value=await backend.list(step.scope);break;
          case 'forget':value=await backend.forget(step.id);break;
          case 'expire':value=await backend.forgetExpired(step.now?new Date(step.now):undefined);break;
          case 'sql':sqlite.exec(step.sql);break;
          default:throw new Error('unknown memory step');
        }
        results.push(structuredClone(value));
      }catch{results.push({error:true})}
    }
    let rows:any;try{rows=sqlite.query('SELECT * FROM memories ORDER BY id').all()}catch{rows={error:true}}
    return {results,rows};
  }finally{globalThis.Date=OriginalDate;console.log=log;sqlite.close()}
}
