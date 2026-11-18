/** Reference repository adapter. Uses migrated disposable SQLite and production services. */
import {openDatabase,migrateDatabase} from '../../../packages/gateway/src/db/connection.ts';
import {TrustEngine} from '../../../packages/gateway/src/security/trust-engine.ts';
import {NodeCredentialsService} from '../../../packages/gateway/src/services/node-credentials.ts';
import {SessionStateService} from '../../../packages/gateway/src/services/session-state.ts';
import {ProjectStateService} from '../../../packages/gateway/src/services/project-state.ts';
type Step={op:string;action?:string;node?:string;user?:string;sql?:string;slot?:number;token?:string;id?:string;keys?:string[];key?:string;entries?:Record<string,unknown>};
type Call={op:string;memory?:boolean;seed?:string;steps?:Step[];project?:boolean};
export async function dispatch(call:Call):Promise<unknown> {
  const {db,sqlite}=await openDatabase(':memory:');
  const originalLog=console.log;console.log=(...args)=>console.error(...args);
  try {
    migrateDatabase(sqlite);
    if(call.seed)sqlite.exec(call.seed);
    const results:unknown[]=[];
    if(call.op==='nativestate.jsonstate') {
      const service=call.project?new ProjectStateService(db):new SessionStateService(db);
      for(const step of call.steps??[]) {
        let value:unknown;
        switch(step.op) {
          case 'get':value=service.get(step.id!,step.keys);break;
          case 'set':service.set(step.id!,step.entries!);value=null;break;
          case 'byKey':value=(service as SessionStateService).getByKey(step.key!);break;
          case 'deleteAll':(service as SessionStateService).deleteAll(step.id!);value=null;break;
          case 'mutate':sqlite.exec(step.sql!);value=null;break;
          default:throw new Error('unknown JSON state step');
        }
        results.push(structuredClone(value));
      }
      const rows=sqlite.prepare(call.project?'SELECT * FROM project_state ORDER BY project_id,key':'SELECT * FROM session_state ORDER BY session_id,key').all();
      return {results,rows};
    }
    if(call.op==='nativestate.trust') {
      let engine=new TrustEngine(call.memory?undefined:db);
      for(const step of call.steps??[]) {
        let value:unknown;
        switch(step.op) {
          case 'state':value=engine.getState(step.action!);break;
          case 'level':value=engine.getLevel(step.action!);break;
          case 'approve':value=engine.recordApproval(step.action!);break;
          case 'revert':value=engine.recordRevert(step.action!);break;
          case 'reset':value=engine.reset(step.action!);break;
          case 'list':value=engine.listAll();break;
          case 'reopen':engine=new TrustEngine(call.memory?undefined:db);value=null;break;
          case 'mutate':sqlite.exec(step.sql!);value=null;break;
          default:throw new Error('unknown trust step');
        }
        results.push(structuredClone(value));
      }
      return results;
    }
    if(call.op==='nativestate.credentials') {
      let service=new NodeCredentialsService(call.memory?null:db);
      const tokens:Array<string|null>=[];
      for(const step of call.steps??[]) {
        let value:unknown;
        switch(step.op) {
          case 'owner':value=service.owner(step.node!);break;
          case 'bind':value=service.bind(step.node!,step.user!);break;
          case 'issue':value=service.issue(step.node!,step.user!);tokens.push(value as string|null);break;
          case 'resolve':value=service.resolve(step.token??tokens[step.slot??0]??'');break;
          case 'revoke':value=service.revoke(step.node!,step.user!);break;
          case 'reopen':service=new NodeCredentialsService(call.memory?null:db);value=null;break;
          case 'mutate':sqlite.exec(step.sql!);value=null;break;
          default:throw new Error('unknown credentials step');
        }
        results.push(structuredClone(value));
      }
      return {results,rows:call.memory?null:sqlite.prepare('SELECT * FROM node_credentials ORDER BY node_id,user_id').all()};
    }
    throw new Error('unknown native state operation');
  } finally {sqlite.close();console.log=originalLog;}
}
