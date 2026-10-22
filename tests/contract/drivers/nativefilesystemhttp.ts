/** Actual filesystem route source and Fastify HTTP, real temporary project-local files.
 * Only OS identity, drive command and remote control-plane ports are scripted. */
import {mock} from 'bun:test';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../../../',import.meta.url)).replace(/\/+$/,'');
export async function dispatch(call:any) {
 const {openDatabase,migrateDatabase}=await import('../../../packages/gateway/src/db/connection.ts');
 const {UserService}=await import('../../../packages/gateway/src/services/users.ts');
 const {signAuthToken}=await import('../../../packages/gateway/src/security/http-auth.ts');
 const {loadConfig}=await import('../../../packages/gateway/src/config.ts');
 const RealDate=Date, savedLog=console.log;console.log=(...a)=>console.error(...a);
 const {db,sqlite}=await openDatabase(':memory:');let app:any;
 const calls:any[]=[];
 try {
  migrateDatabase(sqlite);
  sqlite.exec("INSERT INTO users(id,username,password_hash,created_at,updated_at)VALUES('owner','alice','fixture','old','old')");
  const config={...loadConfig(),jwtSecret:'filesystem-http-fixture',logLevel:'silent' as const};
  const dir=call.artifactRoot+'/source';mkdirSync(dir,{recursive:true});
  writeFileSync(dir+'/os.ts','export const homedir=()=>'+JSON.stringify(call.home)+';export const hostname=()=>"fixture-host";export const platform=()=>'+JSON.stringify(call.platform??'linux')+';');
  writeFileSync(dir+'/child.ts','export function execSync(command,options){if(command!=="wmic logicaldisk get name"||options.encoding!=="utf-8"||options.windowsHide!==true)throw Error("bad drive invocation");'+(call.driveError?'throw Error("drive failure")':'return '+JSON.stringify(call.drives??'Name\nC:\nD:\n'))+';}');
  let source=readFileSync(root+'/packages/gateway/src/routes/filesystem.ts','utf8');
  for(const [before,after] of [
   ['from "node:os"','from "./os.ts"'],
   ['import("node:child_process")','import("./child.ts")'],
   ['process.platform',JSON.stringify(call.platform??'linux')],
  ]){if(source.split(before).length!==2)throw Error('fixture source seam changed: '+before);source=source.replace(before,after);}
  writeFileSync(dir+'/filesystem.ts',source);
  const {registerFilesystemRoutes}=await import(pathToFileURL(dir+'/filesystem.ts').href);
  globalThis.Date=class extends RealDate {constructor(...args:any[]){super(...(args.length?args:[call.now]) as [any]);}static now(){return new RealDate(call.now).getTime();}} as DateConstructor;
  const result=(op:string,node:any,path?:any)=>{
   calls.push({op,node,...(path===undefined?{}:{path})});
   if(call.error!==undefined)throw Error(call.error);
   if('thrown'in call)throw call.thrown;
   return op==='roots'?(call.remoteRoots??[]):(call.remoteBrowse??{path:'remote',parent:null,entries:[]});
  };
  const nodes=[...(call.nodes??[])];
  const ws={registerGatewayFsNode:(node:any)=>{calls.push({op:'register',node});nodes.push(node);},getFsNodes:()=>nodes,proxyFsRoots:async(node:any)=>result('roots',node),proxyFsBrowse:async(node:any,path:any)=>result('browse',node,path)};
  mock.module('../../../packages/gateway/src/routes/filesystem.ts',()=>({registerFilesystemRoutes}));
  const {createServer}=await import('../../../packages/gateway/src/server.ts');
  app=await createServer(config,{sqlite,userService:new UserService(db),ws:call.ws===false?undefined:ws as any});
  const base=await app.listen({host:'127.0.0.1',port:0}),results=[];
  for(const step of call.steps){
   if(step.deleteUser){sqlite.exec("DELETE FROM users WHERE id='owner'");continue;}
   const headers:any={host:'fixture.local',connection:'close',...step.headers};
   if(step.user)headers.authorization='Bearer '+await signAuthToken({id:step.user,username:'alice'},config.jwtSecret);
   const res=await fetch(base+step.path,{method:step.method??'GET',headers});
   const raw=await res.text();let body:any=raw;try{body=JSON.parse(raw)}catch{}
   results.push({status:res.status,body});
  }
  return {results,calls};
 } finally {app?.server.closeAllConnections();await app?.close();sqlite.close();globalThis.Date=RealDate;console.log=savedLog;}
}
