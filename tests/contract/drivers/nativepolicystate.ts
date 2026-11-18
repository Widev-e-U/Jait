/** Real node grants/settings services on disposable SQLite. */
import {openDatabase,migrateDatabase} from '../../../packages/gateway/src/db/connection.ts';
import {NodePermissionsService,isNodeCapability} from '../../../packages/gateway/src/services/node-permissions.ts';
import {resolveThreadSelectionDefaults,normalizeReasoningEffort} from '../../../packages/gateway/src/services/thread-defaults.ts';
import {UserService} from '../../../packages/gateway/src/services/users.ts';
import {SessionStateService} from '../../../packages/gateway/src/services/session-state.ts';
export async function dispatch(call:any) {
  if(call.op==='nativepolicystate.effort')return normalizeReasoningEffort(call.value)??null;
  if(call.op==='nativepolicystate.capability')return isNodeCapability(call.value);
  if(call.op!=='nativepolicystate.run')throw new Error('unknown policy state operation');
  const OriginalDate=Date;const {db,sqlite}=await openDatabase(':memory:');const log=console.log;console.log=(...args)=>console.error(...args);
  try {
    migrateDatabase(sqlite);if(call.seed)sqlite.exec(call.seed);
    const now=OriginalDate.parse(call.now);globalThis.Date=class extends OriginalDate {constructor(value?:any){super(value===undefined?now:value)}static override now(){return now}} as DateConstructor;
    const nodes=new NodePermissionsService(call.noDb?null:db),users=new UserService(db),state=new SessionStateService(db);const results:any[]=[];
    for(const step of call.steps) {
      try {
        let value:any=null;
        switch(step.op) {
          case 'seen':nodes.ensureNodeSeen(step.hello,step.now);break;
          case 'granted':value=nodes.isGranted(step.node,step.capability);break;
          case 'permissions':value=nodes.getPermissions(step.node);break;
          case 'list':value=nodes.listNodePermissions();break;
          case 'update':value=nodes.updatePermissions(step.node,step.grants,step.now);break;
          case 'forget':value=nodes.forgetNode(step.node);break;
          case 'deny':nodes.logDenied(step.node,step.capability,step.detail??'fixture denial');break;
          case 'defaults':value=resolveThreadSelectionDefaults({userId:step.user,sessionId:step.session,userService:step.withUsers===false?undefined:users,sessionState:step.withState===false?undefined:state});break;
          case 'sql':sqlite.exec(step.sql);break;
          default:throw new Error('unknown policy state step');
        }
        results.push(structuredClone(value));
      }catch{results.push({error:true})}
    }
    const tables=Object.fromEntries(['nodes','node_permissions','consent_log','user_settings','session_state'].map(table=>{try{return [table,sqlite.query('SELECT * FROM '+table).all()]}catch{return [table,{error:true}]}}));
    return {results,tables};
  }finally{globalThis.Date=OriginalDate;console.log=log;sqlite.close()}
}
