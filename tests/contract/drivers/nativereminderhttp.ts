import {openDatabase,migrateDatabase} from '../../../packages/gateway/src/db/connection.ts';
import {UserService} from '../../../packages/gateway/src/services/users.ts';
import {ReminderService} from '../../../packages/gateway/src/services/reminders.ts';
import {registerReminderRoutes} from '../../../packages/gateway/src/routes/reminders.ts';
import {signAuthToken} from '../../../packages/gateway/src/security/http-auth.ts';
import {loadConfig} from '../../../packages/gateway/src/config.ts';
export async function dispatch(call:any){
 const log=console.log,Original=globalThis.Date;console.log=(...a)=>console.error(...a);const now='2026-10-22T00:00:00.000Z';
 globalThis.Date=class extends Original{constructor(...args:any[]){if(args.length)super(...args as [any]);else super(now);}static now(){return new Original(now).getTime();}}as any;
 const {db,sqlite}=await openDatabase(':memory:');let app:any;
 try{migrateDatabase(sqlite);sqlite.exec("INSERT INTO users(id,username,password_hash,created_at,updated_at)VALUES('owner','alice','fixture','old','old'),('other','bob','fixture','old','old');");if(call.seed)sqlite.exec(call.seed);
  const events:any[]=[],aliases=new Map<string,string>();let current:any={};
  const port=(service:string,method:string,args:any[])=>{events.push({service,method,args});if(current.portError===service+'.'+method)throw Error('fixture '+service+' failure');switch(service+'.'+method){
   case 'memory.list':return call.memories??[];case 'memory.forget':return args[0]==='engine';
   case 'projects.listWithSessions':return call.projects??{projects:[],hasMore:false};
   case 'projects.getById':case 'sessions.getById':return args[0]==='owned'?{id:'owned'}:undefined;
   case 'threads.list':return call.threads??[];default:throw Error('unknown extra port');}};
  const deps:any={reminderService:new ReminderService(db)};
  if(call.extras?.includes('memory'))deps.memoryService={list:()=>port('memory','list',[]),forget:(...a:any[])=>port('memory','forget',a)};
  if(call.extras?.includes('projects'))deps.projectService={listWithSessions:(...a:any[])=>port('projects','listWithSessions',a),getById:(...a:any[])=>port('projects','getById',a)};
  if(call.extras?.includes('sessions'))deps.sessionService={getById:(...a:any[])=>port('sessions','getById',a)};
  if(call.extras?.includes('threads'))deps.threadService={list:(...a:any[])=>port('threads','list',a)};
  const config={...loadConfig(),jwtSecret:'reminder-http-secret',logLevel:'silent' as const};const {createServer}=await import('../../../packages/gateway/src/server.ts');app=await createServer(config,{sqlite,userService:new UserService(db)});registerReminderRoutes(app,config,deps);const base=await app.listen({host:'127.0.0.1',port:0});
  const normalize=(v:any):any=>typeof v==='string'?Array.from(aliases).reduce((s,[id,label])=>s.replaceAll(id,label),v):Array.isArray(v)?v.map(normalize):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,v])=>[k,normalize(v)])):v;
  const results=[];
  for(const step of call.steps){current=step;let path=step.path;for(const[id,label]of aliases)path=path.replaceAll(label,id);const headers:any={host:'fixture.local',connection:'close',...step.headers};if(step.user)headers.authorization='Bearer '+await signAuthToken({id:step.user,username:step.user==='owner'?'alice':'bob'},config.jwtSecret);if(step.cookie)headers.cookie='jait_token='+await signAuthToken({id:step.cookie,username:'alice'},config.jwtSecret);
   let payload:any;if(step.raw!==undefined)payload=step.raw;else if('body'in step){payload=JSON.stringify(step.body);headers['content-type']??='application/json';}
   const res=await fetch(base+path,{method:step.method,headers,body:payload,signal:AbortSignal.timeout(8000)});let body:any=await res.text();try{body=JSON.parse(body);}catch{}
   for(const row of sqlite.prepare('SELECT id FROM reminders ORDER BY rowid').all()as any[]){if(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(row.id)&&!aliases.has(row.id))aliases.set(row.id,'$r'+aliases.size);}
   results.push(normalize({status:res.status,body,contentType:res.headers.get('content-type'),disposition:res.headers.get('content-disposition')}));
  }
  return normalize({results,events,rows:deps.reminderService.list({status:'all',limit:500})});
 }finally{app?.server.closeAllConnections();await app?.close();sqlite.close();globalThis.Date=Original;console.log=log;}
}
