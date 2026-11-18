import {openDatabase,migrateDatabase} from '../../../packages/gateway/src/db/connection.ts';
import {ProjectService,parseProjectMetadata,getProjectRepositoryId,projectKindForRoot} from '../../../packages/gateway/src/services/projects.ts';
export async function dispatch(call:any) {
  const OriginalDate=Date;const {db,sqlite}=await openDatabase(':memory:');const log=console.log;console.log=(...args)=>console.error(...args);
  try {
    migrateDatabase(sqlite);if(call.seed)sqlite.exec(call.seed);
    const now=OriginalDate.parse(call.now);
    globalThis.Date=class extends OriginalDate {
      constructor(value?:any){super(value===undefined?now:value)}static override now(){return now}
    } as DateConstructor;
    const service=new ProjectService(db);const results:any[]=[];let created:string|undefined;
    for(const step of call.steps) {
      const id=step.id==='$created'?created!:step.id;let value:any=null;
      try {
        switch(step.op) {
          case 'create':value=service.create(step.data);created=value.id;break;
          case 'get':value=service.getById(id,step.user)??null;break;
          case 'list':value=service.list(step.status,step.user,step.limit);break;
          case 'withSessions':value=service.listWithSessions(step.user,step.status??'active',step.limit);break;
          case 'search':value=service.searchWithSessions(step.user,step.query);break;
          case 'find':value=service.findByRoot(step.root,step.node??'gateway',step.user)??null;break;
          case 'adopt':value=service.getOrCreateForRoot(step.data);created=value.id;break;
          case 'touch':service.touch(id);break;
          case 'update':service.update(id,step.data,step.user);break;
          case 'move':value=service.move(id,step.parent??null,step.user)??null;break;
          case 'chain':value=JSON.stringify(service.resolveInstructionChain(id,step.user));break;
          case 'root':value=service.effectiveRootPath(step.record??id,step.user);break;
          case 'descendants':value=service.listDescendantIds(id,step.user);break;
          case 'assign':value=service.assignRepository(id,step.repository,step.user)??null;break;
          case 'clear':value=service.clearRepository(id,step.user)??null;break;
          case 'metadata':value=parseProjectMetadata(service.getById(id,step.user));break;
          case 'repository':value=getProjectRepositoryId(service.getById(id,step.user));break;
          case 'kind':value=projectKindForRoot(step.root);break;
          case 'archive':value=service.archive(id,step.user);break;
          case 'restore':service.restore(id,step.user);break;
          case 'delete':service.delete(id,step.user);break;
          case 'deleteArchived':value=service.deleteArchived(step.user);break;
          case 'countSessions':value=service.countSessionsInSubtree(id,step.user);break;
          case 'counts':value=Object.fromEntries(service.getActiveSessionCounts(step.user));break;
          case 'sql':sqlite.exec(step.sql);break;
          default:throw new Error('unknown project operation');
        }
        results.push(structuredClone(value));
      }catch(error){results.push({error:(error as any).name==='ProjectMoveError'?(error as any).code:true})}
    }
    return {results,projects:sqlite.query('SELECT * FROM projects ORDER BY id').all(),sessions:sqlite.query('SELECT * FROM sessions ORDER BY id').all()};
  } finally {globalThis.Date=OriginalDate;console.log=log;sqlite.close()}
}
