/** Actual jobs routes, actual scheduler, SQLite and registry; only provider catalogues are scripted. */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../../../',import.meta.url)).replace(/\/+$/,'');
export async function dispatch(call:any) {
 const {openDatabase,migrateDatabase}=await import('../../../packages/gateway/src/db/connection.ts');
 const {createServer}=await import('../../../packages/gateway/src/server.ts');
 const {UserService}=await import('../../../packages/gateway/src/services/users.ts');
 const {SchedulerService}=await import('../../../packages/gateway/src/scheduler/service.ts');
 const {ProviderRegistry}=await import('../../../packages/gateway/src/providers/registry.ts');
 const {signAuthToken}=await import('../../../packages/gateway/src/security/http-auth.ts');
 const {loadConfig}=await import('../../../packages/gateway/src/config.ts');
 const {db,sqlite}=await openDatabase(':memory:');
 const savedLog=console.log,RealDate=globalThis.Date;console.log=(...a)=>console.error(...a);
 const calls:any[]=[],events:any[]=[],catalogueCalls:any[]=[],aliases=new Map<string,string>();let step:any={},app:any;
 const normalize=(value:any):any=>{
  if(typeof value==='string')return aliases.get(value)??(value.startsWith('Job not found: ')&&aliases.has(value.slice(15))?'Job not found: '+aliases.get(value.slice(15)):value);
  if(Array.isArray(value))return value.map(normalize);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,normalize(v)]));
  return value;
 };
 const observe=(v:any)=>{
  if(!v||typeof v!=='object')return;
  if(v.id&&v.job_id&&!aliases.has(v.id)){if(!/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v.id))throw Error('invalid run UUIDv7');aliases.set(v.id,'run:'+aliases.size);}
  for(const x of Object.values(v))observe(x);
 };
 try {
  migrateDatabase(sqlite);
  sqlite.exec("INSERT INTO users(id,username,password_hash,created_at,updated_at)VALUES('owner','alice','fixture','old','old'),('other','bob','fixture','old','old')");
  if(call.seed)sqlite.exec(call.seed);
  const config={...loadConfig(),jwtSecret:'job-route-fixture',logLevel:'silent' as const,openaiApiKey:'',openaiBaseUrl:'https://api.openai.com/v1',ollamaUrl:'http://fixture.invalid:11434',omnirouteBaseUrl:'http://fixture.invalid:20128/v1',omnirouteApiKey:''};
  const registry=new ProviderRegistry();
  for(const p of call.providers??[])registry.register({id:p.id,ownerUserId:p.owner,info:{id:p.id,name:p.name},listModels:p.noModels?undefined:async()=>{
   catalogueCalls.push(p.id);if(p.error)throw Error(p.error);return p.models??[];
  }} as any);
  const scheduler=new SchedulerService({db,executeTool:async(execution:any)=>{
   calls.push(execution);if(step.throw)throw Error(step.throw);return step.result??{ok:true,message:'done',data:{answer:42}};
  },onExecuted:(event:any)=>{events.push(event);if(step.callbackError)throw Error(step.callbackError);}});
  app=await createServer(config,{sqlite,userService:new UserService(db)});
  // Redirect the imported model-fetcher dependency at its existing component seam.
  // The route and its scheduler remain the actual source.
  const dir=root+'/.jait/artifacts/gateway-rust/jobs-http/reference';mkdirSync(dir,{recursive:true});
  const peers=pathToFileURL(root+'/tests/contract/drivers/nativejaitmodels.ts').href;
  writeFileSync(dir+'/catalogue.ts','import {dispatch} from '+JSON.stringify(peers)+';\nexport async function listJaitModels(options:any){const r:any=await dispatch({op:"nativejaitmodels.list",payload:{...options,script:{}}});return r.models;}\n');
  let source=readFileSync(root+'/packages/gateway/src/routes/jobs.ts','utf8');
  source=source.replace('from "../services/jait-models.js"','from "./catalogue.ts"');
  for(const match of [...source.matchAll(/from "(\.\.\/[^"]+)"/g)]){
   const target=new URL(match[1],pathToFileURL(root+'/packages/gateway/src/routes/jobs.ts')).href.replace(/\.js$/i,'.ts');source=source.replaceAll(match[0],'from '+JSON.stringify(target));
  }
  writeFileSync(dir+'/jobs.ts',source);
  const {registerJobRoutes}=await import(pathToFileURL(dir+'/jobs.ts').href);
  const users=new UserService(db);
  if(call.settingsError)users.getSettings=()=>{throw Error(call.settingsError)};
  registerJobRoutes(app,config,scheduler,{providerRegistry:call.noRegistry?undefined:registry,userService:call.jaitCatalogue?users:undefined});
  const base=await app.listen({host:'127.0.0.1',port:0});
  const now=call.now;
  globalThis.Date=class extends RealDate {constructor(...args:any[]){super(...(args.length?args:[now]) as [any]);}static now(){return now;}} as any;
  const results=[];
  for(step of call.steps){
   if(step.sql){let sql=step.sql;for(const [id,alias]of aliases)sql=sql.replaceAll('$'+alias,id);sqlite.exec(sql);continue;}
   let path=step.path;for(const [id,alias]of aliases)path=path.replaceAll('$'+alias,encodeURIComponent(id));
   const headers:any={host:'fixture.local',connection:'close',...step.headers};
   if(step.user){const token=await signAuthToken({id:step.user,username:step.user==='owner'?'alice':'bob'},config.jwtSecret);if(step.cookie)headers.cookie='jait_token='+token;else headers.authorization='Bearer '+token;}
   let body:any;
   if(step.oversize){body='x'.repeat(1048577);headers['content-type']='application/json';}
   else if('raw'in step)body=step.raw;
   else if('body'in step){body=JSON.stringify(step.body);headers['content-type']??='application/json';}
   const res=await fetch(base+path,{method:step.method,headers,body});
   const raw=await res.text();let value:any=raw;try{value=JSON.parse(raw)}catch{}
   if(step.alias&&value.id){if(!/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value.id))throw Error('invalid job UUIDv7');aliases.set(value.id,step.alias);}
   observe(value);
   results.push({status:res.status,body:value,contentType:res.headers.get("content-type")});
  }
  for(const event of events)if(event.actionId&&!aliases.has(event.actionId))aliases.set(event.actionId,'run:'+aliases.size);
  return normalize({results,calls,events,catalogueCalls});
 } finally {
  globalThis.Date=RealDate;app?.server.closeAllConnections();await app?.close();sqlite.close();console.log=savedLog;
 }
}
