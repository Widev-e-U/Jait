/** Actual production routes/server/auth. Only the authorized runner and sinks are scripted. */
import {createServer} from '../../../packages/gateway/src/server.ts';
import {registerMaintenanceRoutes} from '../../../packages/gateway/src/routes/maintenance.ts';
import {openDatabase,migrateDatabase} from '../../../packages/gateway/src/db/connection.ts';
import {UserService} from '../../../packages/gateway/src/services/users.ts';
import {loadConfig} from '../../../packages/gateway/src/config.ts';
import {signAuthToken} from '../../../packages/gateway/src/security/http-auth.ts';
export async function dispatch(call:any){
 const {db,sqlite}=await openDatabase(':memory:');
 const RealDate=globalThis.Date,savedLog=console.log;console.log=(...a)=>console.error(...a);
 let app:any,step:any={};const events:any[]=[];
 const reject=(field:string)=>{if(field in step){if(step.errorKind==='thrown')throw step[field];throw Error(step[field]);}};
 try{
  migrateDatabase(sqlite);
  sqlite.exec("INSERT INTO users(id,username,password_hash,created_at,updated_at)VALUES('owner','alice','fixture','old','old'),('other','bob','fixture','old','old')");
  const config={...loadConfig(),jwtSecret:'maintenance-http-fixture',logLevel:'silent' as const};
  app=await createServer(config,{sqlite,userService:new UserService(db)});
  const maintenanceService:any={
   listRuns:(jobId:any,limit:any)=>{events.push({op:'list',jobId:jobId??null,limit});reject('error');return step.result??[];},
   getRun:(id:any)=>{events.push({op:'get',id});reject('error');return step.result;},
   runForRepo:async(repoId:any,jobId:any)=>{events.push({op:'run',repoId,jobId});reject('error');return step.result;},
  };
  const ws=call.noBroadcast?undefined:{broadcastAll:(event:any)=>{events.push({op:'broadcast',event});reject('broadcastError');}};
  const notifications=call.noNotifications?undefined:{
   success:(title:string,body:string,link?:string)=>{events.push({op:'notify',level:'success',title,body,...(link===undefined?{}:{link})});reject('notificationError');},
   warning:(title:string,body:string,link?:string)=>{events.push({op:'notify',level:'warning',title,body,...(link===undefined?{}:{link})});reject('notificationError');},
  };
  registerMaintenanceRoutes(app,config,{maintenanceService,ws,notifications} as any);
  const base=await app.listen({host:'127.0.0.1',port:0});
  const now=call.now;
  globalThis.Date=class extends RealDate{constructor(...args:any[]){super(...(args.length?args:[now]) as [any]);}static now(){return now;}} as any;
  const results=[];
  for(step of call.steps){
   const headers:any={host:'fixture.local',connection:'close',...step.headers};
   const user=step.user??step.cookie;
   if(user){const token=await signAuthToken({id:user,username:user==='owner'?'alice':'bob'},config.jwtSecret);if(step.cookie)headers.cookie='jait_token='+token;else headers.authorization='Bearer '+token;}
   let body:any;
   if('body'in step){body=JSON.stringify(step.body);headers['content-type']??='application/json';}
   if('raw'in step)body=step.raw;
   if(step.oversize){body='x'.repeat(26*1024*1024);headers['content-type']='application/json';}
   const res=await fetch(base+step.path,{method:step.method,headers,body});
   const raw=await res.text();let value:any=raw;try{value=JSON.parse(raw);}catch{}
   results.push({status:res.status,body:value,contentType:res.headers.get('content-type')});
  }
  return {results,events};
 }finally{globalThis.Date=RealDate;app?.server.closeAllConnections();await app?.close();sqlite.close();console.log=savedLog;}
}
