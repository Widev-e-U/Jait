/** Real Fastify/SQLite route reference. Only external runtime boundaries are fixtures. */
import { mock } from 'bun:test';
import { mkdirSync,mkdtempSync,writeFileSync,rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { openDatabase,migrateDatabase } from '../../../packages/gateway/src/db/connection.ts';
import { SessionService } from '../../../packages/gateway/src/services/sessions.ts';
import { ProjectService } from '../../../packages/gateway/src/services/projects.ts';
import { SessionStateService } from '../../../packages/gateway/src/services/session-state.ts';
import { UserService } from '../../../packages/gateway/src/services/users.ts';
import { AuditWriter } from '../../../packages/gateway/src/services/audit.ts';
import { signAuthToken } from '../../../packages/gateway/src/security/http-auth.ts';
import { loadConfig } from '../../../packages/gateway/src/config.ts';
export async function dispatch(call:any) {
  if(call.op==='nativesessionhttp.normalize') {
    const {normalizeGeneratedThreadTitle}=await import('../../../packages/gateway/src/services/thread-title.ts');
    return call.inputs.map((v:any)=>{const title=normalizeGeneratedThreadTitle(v[0],v[1]);return Array.from({length:title.length},(_,i)=>title.charCodeAt(i));});
  }
  const log=console.log;console.log=(...a)=>console.error(...a);
  const RealDate=Date; const realFetch=fetch;
  // Pin the existing production SPA fallback rather than depending on a local build.
  const fixtureRoot=fileURLToPath(new URL('../../../.jait/artifacts/gateway-rust/reference-web/',import.meta.url));
  mkdirSync(fixtureRoot,{recursive:true});
  const webDir=mkdtempSync(join(fixtureRoot,'sessions-'));
  writeFileSync(join(webDir,'index.html'),'<!doctype html><title>Session route fixture</title>');
  const previousWebDir=process.env.JAIT_WEB_DIR;process.env.JAIT_WEB_DIR=webDir;
  globalThis.Date=class extends RealDate {constructor(...args:any[]){super(...(args.length?args:[call.now]) as [any]);} static now(){return new RealDate(call.now).getTime();}} as DateConstructor;
  const {db,sqlite}=await openDatabase(':memory:');
  let app:any;
  const runtime:any[]=[];
  try {
    migrateDatabase(sqlite);
    sqlite.exec("INSERT INTO users(id,username,password_hash,created_at,updated_at) VALUES('owner','alice','fixture','old','old'),('other','bob','fixture','old','old');");
    if(call.seed)sqlite.exec(call.seed);
    const chat=await import('../../../packages/gateway/src/routes/chat.ts');
    mock.module('../../../packages/gateway/src/routes/chat.ts',()=>({...chat,isChatTurnActive:(id:string)=>(call.busy??[]).includes(id)}));
    const {createServer}=await import('../../../packages/gateway/src/server.ts');
    const {registerSessionRoutes}=await import('../../../packages/gateway/src/routes/sessions.ts');
    const users=new UserService(db);
    const config={...loadConfig(),jwtSecret:'session-http-secret',logLevel:'silent' as const,llmProvider:'openai' as const,openaiApiKey:'fixture',openaiBaseUrl:'https://title.invalid',openaiModel:'fixture'};
    const titleUrl=config.openaiBaseUrl+'/chat/completions';
    globalThis.fetch=(async(url:any,init:any)=>{
      if(String(url)!==titleUrl)throw new Error('fixture disallows external network');
      const request=JSON.parse(init.body);
      runtime.push({kind:'title',prompt:request.messages[1].content,model:request.model==='fixture'?null:request.model});
      if(call.titleMutation)sqlite.exec(call.titleMutation);
      if(call.titleError)throw new Error('fixture title failure');
      return new Response(JSON.stringify({choices:[{message:{content:call.title??'Generated task title'}}]}),{status:200,headers:{'content-type':'application/json'}});
    }) as typeof fetch;
    app=await createServer(config,{sqlite,userService:users});
    const hooks={emit:(event:string,data:any)=>runtime.push({kind:'hook',event,data})};
    const ws={getFsNodes:()=>call.nodes??[],canAccessNode:(id:string,user:string)=>(call.allowed??[]).includes(id+':'+user),broadcastToUser:(user:string,event:any)=>runtime.push({kind:'broadcast',user,event})};
    registerSessionRoutes(app,config,new SessionService(db),new AuditWriter(db),hooks as any,call.state===false?undefined:new SessionStateService(db),call.projects===false?undefined:new ProjectService(db),call.ws===false?undefined:ws as any,call.settings===false?undefined:users);
    const address=await app.listen({host:'127.0.0.1',port:0});
    const results=[];let newId='';
    for(const step of call.steps){
      if(step.sql){sqlite.exec(step.sql);results.push(null);continue;}
      const path=step.path.replace('$new',newId);
      const headers:any={host:'fixture.local',connection:'close',...step.headers};
      if(step.user)headers.authorization='Bearer '+await signAuthToken({id:step.user,username:step.user==='owner'?'alice':'bob'},config.jwtSecret);
      let body:any;
      if(step.raw!==undefined)body=step.raw;
      else if('body'in step){body=JSON.stringify(step.body);headers['content-type']??='application/json';}
      const res=await realFetch(address+path,{method:step.method,headers,body,redirect:'manual'});
      const raw=await res.text();let data:any=raw;try{data=JSON.parse(raw);}catch{}
      if(res.status===201&&data.id)newId=data.id;
      results.push({status:res.status,body:data});
    }
    return {results,runtime,sessions:sqlite.query('SELECT * FROM sessions ORDER BY rowid').all(),projects:sqlite.query('SELECT * FROM projects ORDER BY rowid').all(),state:sqlite.query('SELECT * FROM session_state ORDER BY rowid').all(),audit:sqlite.query('SELECT * FROM audit_log ORDER BY rowid').all()};
  }finally{app?.server.closeAllConnections();try{await app?.close();}finally{sqlite.close();console.log=log;globalThis.Date=RealDate;globalThis.fetch=realFetch;if(previousWebDir===undefined)delete process.env.JAIT_WEB_DIR;else process.env.JAIT_WEB_DIR=previousWebDir;rmSync(webDir,{recursive:true,force:true});}}
}
