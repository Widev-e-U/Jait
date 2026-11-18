import {openDatabase,migrateDatabase} from '../../../packages/gateway/src/db/connection.ts';
import {UserService} from '../../../packages/gateway/src/services/users.ts';
import {TrustEngine} from '../../../packages/gateway/src/security/trust-engine.ts';
import {loadConfig} from '../../../packages/gateway/src/config.ts';
import {signAuthToken} from '../../../packages/gateway/src/security/http-auth.ts';
export async function dispatch(call:any){
 const log=console.log;console.log=(...args)=>console.error(...args);
 const {db,sqlite}=await openDatabase(':memory:');let app:any;
 try{
  migrateDatabase(sqlite);sqlite.exec("INSERT INTO users(id,username,password_hash,created_at,updated_at)VALUES('owner','alice','fixture','old','old'),('other','bob','fixture','old','old');");
  if(call.seed)sqlite.exec(call.seed);
  const engine=new TrustEngine(call.memory?undefined:db);
  const config={...loadConfig(),jwtSecret:'trust-http-secret',logLevel:'silent' as const};
  const {createServer}=await import('../../../packages/gateway/src/server.ts');app=await createServer(config,{sqlite,userService:new UserService(db),trustEngine:engine});
  const base=await app.listen({host:'127.0.0.1',port:0});const results=[];
  for(const step of call.steps){
   if(step.approve){let state;for(let n=0;n<(step.count??1);n++)state=engine.recordApproval(step.approve);results.push(structuredClone(state));continue;}
   if(step.revert){results.push(structuredClone(engine.recordRevert(step.revert)));continue;}
   if(step.sql){sqlite.exec(step.sql);results.push(null);continue;}
   const headers:any={host:'fixture.local',connection:'close',...step.headers};
   if(step.user)headers.authorization='Bearer '+await signAuthToken({id:step.user,username:step.user==='owner'?'alice':'bob'},config.jwtSecret);
   if(step.cookie)headers.cookie='jait_token='+await signAuthToken({id:step.cookie,username:'alice'},config.jwtSecret);
   let body:any;if(step.raw!==undefined)body=step.raw;else if('body'in step){body=JSON.stringify(step.body);headers['content-type']??='application/json';}
   const response=await fetch(base+step.path,{method:step.method,headers,body,redirect:'manual'});const raw=await response.text();let value:any=raw;try{value=JSON.parse(raw);}catch{}
   results.push({status:response.status,body:value});
  }
  // Capture states when returned, not live aliases modified by a later approval.
  return {results,rows:sqlite.query('SELECT * FROM trust_levels ORDER BY rowid').all()};
 }finally{app?.server.closeAllConnections();await app?.close();sqlite.close();console.log=log;}
}
