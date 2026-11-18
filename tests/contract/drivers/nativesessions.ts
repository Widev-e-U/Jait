/** Disposable reference adapter; no production route or live database access. */
import {openDatabase,migrateDatabase} from '../../../packages/gateway/src/db/connection.ts';
import {SessionService} from '../../../packages/gateway/src/services/sessions.ts';
type Call={op:string;seed?:string;now:string;steps:Array<Record<string,any>>};
export async function dispatch(call:Call) {
  const OriginalDate=Date;
  const {db,sqlite}=await openDatabase(':memory:');
  const log=console.log;console.log=(...args)=>console.error(...args);
  try {
    migrateDatabase(sqlite);if(call.seed)sqlite.exec(call.seed);
    const now=OriginalDate.parse(call.now);
    globalThis.Date=class extends OriginalDate {
      constructor(value?:any){super(value===undefined?now:value)}
      static override now(){return now}
    } as DateConstructor;
    const service=new SessionService(db);
    const results:unknown[]=[];
    let created:string|undefined;
    for(const step of call.steps) {
      const id=step.id==='$created'?created!:step.id;
      let result:unknown=null;
      try {
        switch(step.op) {
          case 'create':result=service.create(step.data);created=(result as any).id;break;
          case 'get':result=service.getById(id,step.user)??null;break;
          case 'count':result=service.count(step.status);break;
          case 'list':result=service.list(step.status,step.user,step.limit,step.personalOnly);break;
          case 'projectList':result=service.listByProject(step.project,step.status,step.user,step.limit);break;
          case 'lastActive':result=service.lastActive(step.user);break;
          case 'touch':service.touch(id);break;
          case 'view':service.markViewed(id,step.user,step.observed);break;
          case 'archive':service.archive(id,step.user);break;
          case 'delete':service.delete(id,step.user);break;
          case 'projectStatus': {
            const method={archive:'archiveByProject',restore:'restoreByProject',delete:'deleteByProject'}[step.operation]!;
            (service as any)[method](step.project,step.user);break;
          }
          case 'update':service.update(id,step.data,step.user);break;
          case 'move':result=service.moveToProject(id,step.project??null,step.path??null,step.user)??null;break;
          case 'selection':service.updateChatSelection(id,step.data,step.user);break;
          case 'error':service.updateChatError(id,step.error??null,step.user);break;
          case 'fork':result=service.fork(id,{userId:step.user,liveSnapshot:step.live});if(result)created=(result as any).id;break;
          case 'sql':sqlite.exec(step.sql);break;
          default:throw new Error('unknown session operation');
        }
        results.push(structuredClone(result));
      } catch { results.push({error:true}); }
    }
    return {results,sessions:sqlite.query('SELECT * FROM sessions ORDER BY id').all(),messages:sqlite.query('SELECT * FROM messages ORDER BY session_id,created_at,id').all(),context:sqlite.query('SELECT * FROM message_context_metadata ORDER BY message_id').all()};
  } finally {globalThis.Date=OriginalDate;console.log=log;sqlite.close();}
}
