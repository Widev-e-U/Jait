export async function dispatch(call:any){
 if(call.op==='nativehelpers.cron'){
  const {isValidCronExpression}=await import('../../../packages/gateway/src/scheduler/cron.ts');
  return call.values.map((v:string)=>isValidCronExpression(v));
 }
 if(call.op==='nativehelpers.manifest'){
  const {validateManifest}=await import('../../../packages/gateway/src/plugins/manifest.ts');
  return call.values.map(validateManifest);
 }
 if(call.op==='nativehelpers.uuid'){
  const crypto=globalThis.crypto, old=crypto.getRandomValues,oldNow=Date.now;
  crypto.getRandomValues=((a:Uint8Array)=>{a.set(call.entropy);return a;})as any;
  Date.now=()=>call.now;
  try{
   const m=await import('../../../packages/gateway/src/lib/uuidv7.ts');
   return [m.uuidv7(),m.newActionId()];
  }finally{crypto.getRandomValues=old;Date.now=oldNow;}
 }
 if(call.op==='nativehelpers.continuation'){
  const {openDatabase,migrateDatabase}=await import('../../../packages/gateway/src/db/connection.ts');
  const {UserService}=await import('../../../packages/gateway/src/services/users.ts');
  const {SessionStateService}=await import('../../../packages/gateway/src/services/session-state.ts');
  const {buildBackgroundCommandContinuationPayload}=await import('../../../packages/gateway/src/services/background-command-continuation.ts');
  const log=console.log;console.log=(...a)=>console.error(...a);
  const {db,sqlite}=await openDatabase(':memory:');
  try{
   migrateDatabase(sqlite);
   const users=new UserService(db),state=new SessionStateService(db);
   users.getSettings('u');
   if(call.seed)sqlite.exec(call.seed);
   if(call.state)state.set('s',call.state);
   try{return buildBackgroundCommandContinuationPayload({
    sessionId:call.sessionId??'s',notification:call.notification??'Command completed',notice:call.notice,
    userId:call.userId??'u',userService:users,sessionState:call.withState===false?undefined:state,
    sessionMetadata:call.metadata
   });}catch{return {error:true};}
  }finally{sqlite.close();console.log=log;}
 }
 if(call.op==='nativehelpers.resume'){
  const {interventionRunResumeRegistry:r}=await import('../../../packages/gateway/src/services/intervention-run-resume.ts');
  r.clearForTests();
  const handlers:any={},releases:any={},events:any[]=[],results=[];
  for(const [name,behavior]of Object.entries(call.handlers)as [string,any][]){
   handlers[name]=async(message:string,options?:unknown)=>{events.push({name,message,...(call.captureOptions?{options:options===undefined?{undefined:true}:options}:{})});
    if(behavior.error!==undefined)throw new Error(behavior.error);
    await Promise.resolve();return behavior.value;
   };
  }
  try{for(const step of call.steps){
   let value:any=null;
   if(step.op==='register')releases[step.alias]=step.kind==='chat'?r.registerChatSession(step.id,handlers[step.handler]):r.registerThread(step.id,handlers[step.handler]);
   if(step.op==='release')releases[step.alias]();
   if(step.op==='resume')value=step.kind==='chat'?await r.resumeChatSession(step.id,step.message,step.options):await r.resumeThread(step.id,step.message);
   if(step.op==='clear')r.clearForTests();
   results.push(value);
  }return {results,events};}finally{r.clearForTests();}
 }
 if(call.op==='nativehelpers.resumeRace'){
  const {interventionRunResumeRegistry:r}=await import('../../../packages/gateway/src/services/intervention-run-resume.ts');
  r.clearForTests();const events:string[]=[];
  let started!:()=>void,finish!:()=>void;
  const entered=new Promise<void>(resolve=>started=resolve),barrier=new Promise<void>(resolve=>finish=resolve);
  const old=r.registerChatSession('race',async()=>{events.push('first:start');started();await barrier;events.push('first:end');return {status:'steered'};});
  try{
   const pending=r.resumeChatSession('race','first');await entered;
   const current=r.registerChatSession('race',()=>{events.push('second');return {status:'steered'};});
   old();const second=await r.resumeChatSession('race','second');finish();const first=await pending;
   current();const missing=await r.resumeChatSession('race','missing');
   return {events,first,second,missing};
  }finally{finish();r.clearForTests();}
 }
 throw new Error('unknown operation');
}
