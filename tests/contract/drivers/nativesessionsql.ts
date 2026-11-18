/** Actual SessionSqlService on disposable in-memory SQLite. Seed/SQL steps are
 * trusted contract fixtures only; this adapter is not a runtime query endpoint. */
import {openRawSqlite} from '../../../packages/gateway/src/db/sqlite-shim.ts';
import {createSessionSqlTool} from '../../../packages/gateway/src/tools/session-sql-tools.ts';
import {SessionSqlService} from '../../../packages/gateway/src/services/session-sql.ts';
export async function dispatch(call:any) {
  const db=await openRawSqlite(':memory:');
  try {
    db.exec(call.seed);
    let service=new SessionSqlService(db);
    const results=[];
    for(const step of call.steps) {
      try {
        switch(step.op) {
          case 'schema':results.push(service.schema());break;
          case 'tool':results.push(await createSessionSqlTool(service).execute(step.input,{} as any));break;
          case 'exec':db.exec(step.sql);results.push(null);break;
          case 'reset':service=new SessionSqlService(db);results.push(null);break;
          default:results.push(service.query(step.input));
        }
      }catch(error:any){results.push({thrown:error.message});}
    }
    return {results,remaining:db.prepare('SELECT id, name FROM sessions ORDER BY id').all()};
  }finally{db.close();}
}
