/** Actual Fastify server/auth and graph routes; graph/project service ports scripted. */
import {createServer} from '../../../packages/gateway/src/server.ts';
import {registerCodeGraphRoutes} from '../../../packages/gateway/src/routes/code-graph.ts';
import {GraphifyUnavailableError} from '../../../packages/gateway/src/services/code-graph/graphify-runner.ts';
import {openDatabase,migrateDatabase} from '../../../packages/gateway/src/db/connection.ts';
import {UserService} from '../../../packages/gateway/src/services/users.ts';
import {loadConfig} from '../../../packages/gateway/src/config.ts';
import {signAuthToken} from '../../../packages/gateway/src/security/http-auth.ts';
export async function dispatch(call:any){
 const {db,sqlite}=await openDatabase(':memory:');
 const savedLog=console.log;console.log=(...args)=>console.error(...args);
 let app:any,step:any={};const events:any[]=[];
 const reject=()=>{if(step.unavailable)throw new GraphifyUnavailableError(step.error);if(step.error)throw Error(step.error);};
 try{
  migrateDatabase(sqlite);
  sqlite.exec("INSERT INTO users(id,username,password_hash,created_at,updated_at)VALUES('owner','alice','fixture','old','old'),('other','bob','fixture','old','old')");
  const config={...loadConfig(),jwtSecret:'code-graph-http-fixture',logLevel:'silent' as const};
  app=await createServer(config,{sqlite,userService:new UserService(db)});
  const projects={list:(status:any,userId:any)=>{events.push({method:'projects.list',status,userId});if(step.projectError)throw Error(step.projectError);return step.projects??call.projects??[];}};
  const service:any={};
  for(const method of ['index','query','shortestPath','snapshot','prepareGraphRag','getIndex']){
   service[method]=(...args:any[])=>{
    const params=method==='getIndex'?{projectRoot:args[0],userId:args[1]}:args[0];
    const {signal,...plain}=params;
    events.push({method,params:plain,hasSignal:!!signal});
    reject();return step.result??null;
   };
  }
  registerCodeGraphRoutes(app,config,service,projects as any);
  const base=await app.listen({host:'127.0.0.1',port:0});
  const results=[];
  for(step of call.steps){
   const headers:any={host:'fixture.local',connection:'close',...step.headers};
   const user=step.user??step.cookie;
   if(user){const token=await signAuthToken({id:user,username:user==='owner'?'alice':'bob'},config.jwtSecret);if(step.cookie)headers.cookie='jait_token='+token;else headers.authorization='Bearer '+token;}
   let body:any;
   if('body'in step){body=JSON.stringify(step.body);headers['content-type']??='application/json';}
   if('raw'in step)body=step.raw;
   const res=await fetch(base+step.path,{method:step.method,headers,body,signal:AbortSignal.timeout(8000)});
   const raw=await res.text();let value:any=raw;try{value=JSON.parse(raw);}catch{}
   results.push({status:res.status,body:value,contentType:res.headers.get('content-type')});
  }
  return {results,events};
 }finally{app?.server.closeAllConnections();await app?.close();sqlite.close();console.log=savedLog;}
}
