import {openDatabase,migrateDatabase} from '../../../packages/gateway/src/db/connection.ts';
import {UserService} from '../../../packages/gateway/src/services/users.ts';
import {UserQuestionService} from '../../../packages/gateway/src/services/user-questions.ts';
import {registerUserQuestionRoutes} from '../../../packages/gateway/src/routes/user-questions.ts';
import {registerHookRoutes} from '../../../packages/gateway/src/routes/hooks.ts';
import {HookBus} from '../../../packages/gateway/src/scheduler/hooks.ts';
import {signAuthToken} from '../../../packages/gateway/src/security/http-auth.ts';
import {loadConfig} from '../../../packages/gateway/src/config.ts';
export async function dispatch(call:any){
 const log=console.log;console.log=(...a)=>console.error(...a);
 const {db,sqlite}=await openDatabase(':memory:');let app:any;
 const events:any[]=[];const answers:any={};const ids:any={};const labels:any={};
 const questions=new UserQuestionService({onRequest:r=>{ids[r.sessionId]=r.id;labels[r.id]=r.sessionId;},onResolved:r=>events.push({kind:'resolved',request:r})});
 const hooks=new HookBus();
 hooks.on('hook.*',event=>{events.push({kind:'hook',event:structuredClone(event)});if(call.hookMutation&&event.payload&&typeof event.payload==='object')(event.payload as any).fromHook=true;if(call.hookError)throw new Error('fixture hook failure');});
 const config={...loadConfig(),jwtSecret:'question-http-secret',logLevel:'silent' as const};
 try{
  migrateDatabase(sqlite);sqlite.exec("INSERT INTO users(id,username,password_hash,created_at,updated_at)VALUES('owner','alice','fixture','old','old'),('other','bob','fixture','old','old');");
  if(call.seed)sqlite.exec(call.seed);
  const {createServer}=await import('../../../packages/gateway/src/server.ts');app=await createServer(config,{sqlite,userService:new UserService(db)});
  registerUserQuestionRoutes(app,config,questions);
  registerHookRoutes(app,{hookSecret:call.secret??'hook-fixture',hooks,onWake:async()=>{events.push({kind:'wake'});if(call.callbackError)throw new Error('fixture callback failure');return call.result;},onAgentHook:async payload=>{events.push({kind:'agent',payload:structuredClone(payload)});if(call.callbackError)throw new Error('fixture callback failure');return call.result;}});
  const base=await app.listen({host:'127.0.0.1',port:0});const results=[];
  for(const step of call.steps){
   if(step.ask){const p=questions.ask(step.ask);p.then(v=>answers[step.ask.sessionId]=v);results.push(null);continue;}
   const path=step.path.replace(/\$([^/]+)/g,(_:any,key:any)=>ids[key]??'missing');
   const headers:any={host:'fixture.local',connection:'close',...step.headers};
   if(step.user)headers.authorization='Bearer '+await signAuthToken({id:step.user,username:step.user==='owner'?'alice':'bob'},config.jwtSecret);
   if(step.cookie)headers.cookie='jait_token='+await signAuthToken({id:step.cookie,username:'alice'},config.jwtSecret);
   let body:any;
   if(step.raw!==undefined)body=step.raw;else if('body'in step){body=JSON.stringify(step.body);headers['content-type']??='application/json';}
   const res=await fetch(base+path,{method:step.method,headers,body,redirect:'manual'});const raw=await res.text();let data:any=raw;try{data=JSON.parse(raw);}catch{}
   results.push({status:res.status,body:data});
  }
  const normalize=(v:any):any=>{if(Array.isArray(v))return v.map(normalize);if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,k==='createdAt'||k==='timestamp'?'<time>':normalize(x)]));if(typeof v==='string'&&labels[v])return '<request:'+labels[v]+'>';return v;};
  return normalize({results,events,answers,pending:questions.listPending()});
 }finally{app?.server.closeAllConnections();await app?.close();sqlite.close();console.log=log;}
}
