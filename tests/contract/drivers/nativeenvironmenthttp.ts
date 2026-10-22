/** Real route, auth, SQLite and domain repositories; only node/provider I/O is scripted. */
import {createServer} from '../../../packages/gateway/src/server.ts';
import {openDatabase,migrateDatabase} from '../../../packages/gateway/src/db/connection.ts';
import {UserService} from '../../../packages/gateway/src/services/users.ts';
import {AssistantProfileService} from '../../../packages/gateway/src/services/assistant-profiles.ts';
import {ProjectService} from '../../../packages/gateway/src/services/projects.ts';
import {RepositoryService} from '../../../packages/gateway/src/services/repositories.ts';
import {ProviderRegistry} from '../../../packages/gateway/src/providers/registry.ts';
import {loadConfig} from '../../../packages/gateway/src/config.ts';
import {signAuthToken} from '../../../packages/gateway/src/security/http-auth.ts';
export async function dispatch(call:any){
 if(call.op==='nativeenvironmenthttp.jsonparse')return call.inputs.map((input:string)=>{try{JSON.parse(input);return null;}catch(error){const s=(error as Error).message;return Array.from({length:s.length},(_,i)=>s.charCodeAt(i));}});
 const {db,sqlite}=await openDatabase(':memory:');
 const RealDate=globalThis.Date,savedLog=console.log;console.log=(...a)=>console.error(...a);
 let app:any;const events:any[]=[];
 try{
  migrateDatabase(sqlite);
  sqlite.exec("INSERT INTO users(id,username,password_hash,created_at,updated_at)VALUES('owner','alice','fixture','old','old'),('other','bob','fixture','old','old')");
  if(call.seed)sqlite.exec(call.seed);
  const config={...loadConfig(),jwtSecret:'environment-http-fixture',logLevel:'silent' as const};
  const registry=new ProviderRegistry();
  for(const p of call.providers??[]){
   const info={...p.info};
   registry.register({id:info.id,ownerUserId:p.owner,info,checkAvailability:async()=>{events.push({op:'check',id:info.id});if(p.error)throw Error(p.error);Object.assign(info,p.after??{});}} as any);
  }
  const ws=call.noNodes?undefined:{registerGatewayFsNode:()=>{},getNodeRegistry:()=>{events.push({op:'nodes'});return {nodes:call.nodes??[]};},getFsNodes:()=>{events.push({op:'fsNodes'});return call.fsNodes??[];}};
  app=await createServer(config,{
   userService:new UserService(db),
   assistantProfileService:call.noAssistants?undefined:new AssistantProfileService(db),
   projectService:call.noProjects?undefined:new ProjectService(db),
   repoService:call.noRepositories?undefined:new RepositoryService(db),
   sqlite:call.noNetwork?undefined:sqlite,
   providerRegistry:call.noProviders?undefined:registry,
   ws,
  } as any);
  const base=await app.listen({host:'127.0.0.1',port:0});
  // Startup availability probes are outside this route trace.
  events.length=0;
  const now=call.now;
  globalThis.Date=class extends RealDate{constructor(...args:any[]){super(...(args.length?args:[now]) as [any]);}static now(){return now;}} as any;
  const results=[];
  for(const step of call.steps){
   if(step.sql){sqlite.exec(step.sql);continue;}
   const headers:any={host:'fixture.local',connection:'close',...step.headers};
   const user=step.user??step.cookie;
   if(user){const token=await signAuthToken({id:user,username:user==='owner'?'alice':'bob'},config.jwtSecret);if(step.cookie)headers.cookie='jait_token='+token;else headers.authorization='Bearer '+token;}
   const res=await fetch(base+step.path,{method:step.method,headers});
   const raw=await res.text();let value:any=raw;if(step.exactRaw)value=Array.from({length:raw.length},(_,i)=>raw.charCodeAt(i));else try{value=JSON.parse(raw);}catch{}
   results.push({status:res.status,body:value,contentType:res.headers.get('content-type')});
  }
  return {results,events};
 }finally{globalThis.Date=RealDate;app?.server.closeAllConnections();await app?.close();sqlite.close();console.log=savedLog;}
}
