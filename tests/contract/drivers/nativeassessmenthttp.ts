/** Actual assessment routes and service; explicit test probe performs no network I/O. */
export async function dispatch(call:any) {
 const {openDatabase,migrateDatabase}=await import('../../../packages/gateway/src/db/connection.ts');
 const {createServer}=await import('../../../packages/gateway/src/server.ts');
 const {UserService}=await import('../../../packages/gateway/src/services/users.ts');
 const {setAssessmentDb,getAssessmentService}=await import('../../../packages/gateway/src/security/assessment.ts');
 const {signAuthToken}=await import('../../../packages/gateway/src/security/http-auth.ts');
 const {loadConfig}=await import('../../../packages/gateway/src/config.ts');
 const {db,sqlite}=await openDatabase(':memory:');
 const previous=console.log;console.log=(...args)=>console.error(...args);
 const config={...loadConfig(),jwtSecret:'assessment-route-fixture',logLevel:'silent' as const};
 const aliases:any={};const results:any[]=[];let app:any;
 try {
  migrateDatabase(sqlite);
  sqlite.exec("INSERT INTO users(id,username,password_hash,created_at,updated_at)VALUES('owner','alice','fixture','old','old'),('other','bob','fixture','old','old')");
  if(call.seed)sqlite.exec(call.seed);
  setAssessmentDb(sqlite);
  const service:any=getAssessmentService();
  service.probe=async(_target:string,_port:number,signal:AbortSignal)=>{
   await new Promise<void>(resolve=>{if(signal.aborted)return resolve();signal.addEventListener('abort',()=>resolve(),{once:true});});return 'error';
  };
  app=await createServer(config,{sqlite:call.noProjectDatabase?undefined:sqlite,userService:new UserService(db)});
  const base=await app.listen({host:'127.0.0.1',port:0});
  for(const step of call.steps){
   if(step.wait){await service.wait(aliases[step.wait],step.user??'owner');continue;}
   if(step.sql){sqlite.exec(step.sql);continue;}
   let path=step.path.replace(/\$([^/]+)/g,(_:any,key:string)=>aliases[key]??'missing');
   const headers:any={host:'fixture.local',connection:'close',...step.headers};
   if(step.user){const token=await signAuthToken({id:step.user,username:step.user==='owner'?'alice':'bob'},config.jwtSecret);if(step.cookie)headers.cookie='jait_token='+token;else headers.authorization='Bearer '+token;}
   let body:any;
   if('raw' in step)body=step.raw;
   else if('body' in step){const value=structuredClone(step.body);if(typeof value?.scopeId==='string'&&value.scopeId.startsWith('$'))value.scopeId=aliases[value.scopeId.slice(1)]??value.scopeId;body=JSON.stringify(value);headers['content-type']??='application/json';}
   const res=await fetch(base+path,{method:step.method,headers,body});
   const raw=await res.text();let value:any=raw;try{value=JSON.parse(raw);}catch{}
   if(step.alias&&value.id)aliases[step.alias]=value.id;
   results.push({status:res.status,body:value});
  }
  return results;
 }finally{
  for(const id of Object.values(aliases)){try{const s=getAssessmentService();s.cancel(id as string,'owner');await s.wait(id as string,'owner');}catch{}}
  app?.server.closeAllConnections();await app?.close();sqlite.close();console.log=previous;
 }
}
