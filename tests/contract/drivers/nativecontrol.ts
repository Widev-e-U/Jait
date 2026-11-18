import {ControlAccess} from '../../../packages/gateway/src/security/control-access.ts';
import {worktreeGitMountArgs} from '../../../packages/gateway/src/security/worktree-sandbox.ts';
import {DeviceRegistry} from '../../../packages/gateway/src/services/device-registry.ts';
import {SessionService} from '../../../packages/gateway/src/services/sessions.ts';
import {openDatabase,migrateDatabase} from '../../../packages/gateway/src/db/connection.ts';
export async function dispatch(call:any){
  if(call.op==='nativecontrol.mount'){try{return {args:worktreeGitMountArgs(call.root)}}catch(error){return {error:true}}}
  const OriginalDate=Date;const log=console.log;console.log=(...args)=>console.error(...args);
  let sqlite:any;
  try {
    let now=OriginalDate.parse('2026-10-18T12:00:00.000Z');
    globalThis.Date=class extends OriginalDate{constructor(value?:any){super(value===undefined?now:value)}static override now(){return now}}as DateConstructor;
    if(call.op==='nativecontrol.devices'){
      const registry=new DeviceRegistry();const results:any[]=[];
      for(const step of call.steps){
        if(step.now)now=OriginalDate.parse(step.now);
        if(step.op==='register')results.push(structuredClone(registry.register(step.data)));
        else if(step.op==='heartbeat')results.push(structuredClone(registry.heartbeat(step.id)));
        else if(step.op==='list')results.push(structuredClone(registry.list()));
        else if(step.op==='count')results.push(registry.count());
        else throw new Error('unknown device step');
      }return results;
    }
    if(call.op!=='nativecontrol.access')throw new Error('unknown control operation');
    const opened=await openDatabase(':memory:');sqlite=opened.sqlite;migrateDatabase(sqlite);
    if(call.sql)sqlite.exec(call.sql);
    const sessions=call.sessions===false?undefined:new SessionService(opened.db);
    const surfaces=call.surfaces===undefined?undefined:{
      getSurface:(id:string)=>call.surfaces[id],
      getOwner:(id:string)=>call.owners?.[id],
    };
    const consent=call.consent===undefined?undefined:{getRequest:(id:string)=>call.consent[id]};
    const threads=call.threads===undefined?undefined:{getById:(id:string)=>call.threads[id]};
    const policy=new ControlAccess(sessions,surfaces as any,consent as any,threads as any);
    const results:any[]=[];
    for(const step of call.steps){
      try {
        let result:any;
        if(step.op==='session')result=policy.session(step.id,step.user??null);
        else if(step.op==='surface')result=policy.surface(step.id,step.user??null);
        else if(step.op==='consent')result=policy.consentRequest(step.id,step.user??null);
        else if(step.op==='execution'){
          result=policy.executionSession(step.id,step.user,step.root);
          if(step.id==='default'&&sessions){const record=sessions.getById(result);result={created:result!=='default',user:record?.userId,name:record?.name,path:record?.projectPath}}
        }else throw new Error('unknown access step');
        results.push(result);
      }catch{results.push({error:true})}
    }
    return {results,count:sqlite.query('SELECT count(*) AS n FROM sessions').get().n};
  }finally{sqlite?.close();console.log=log;globalThis.Date=OriginalDate}
}
