/** Actual TS routes + service; signaling stays inside this test, never captures a screen. */
export async function dispatch(call:any){
 const {openDatabase,migrateDatabase}=await import('../../../packages/gateway/src/db/connection.ts');
 const {createServer}=await import('../../../packages/gateway/src/server.ts');
 const {UserService}=await import('../../../packages/gateway/src/services/users.ts');
 const {signAuthToken}=await import('../../../packages/gateway/src/security/http-auth.ts');
 const {loadConfig}=await import('../../../packages/gateway/src/config.ts');
 const {ScreenShareService}=await import('../../../packages/screen-share/src/service.ts');
 const {db,sqlite}=await openDatabase(':memory:');
 const previous=console.log;console.log=(...args)=>console.error(...args);
 const service=new ScreenShareService();const events:any[]=[];let matched=0;let app:any;
 const effect=(name:string,args:any)=>{events.push(structuredClone({name,...args}));
  if(call.failure?.name===name && ++matched===(call.failure.occurrence??1)){
   if('message' in call.failure)throw Error(call.failure.message);throw call.failure.thrown;
  }
 };
 const capture=service.captureScreen.bind(service);const record=service.startRecording.bind(service);
 service.captureScreen=()=>{effect('capture',{});return capture();};
 service.startRecording=()=>{effect('record',{});return record();};
 const ws:any={registerGatewayFsNode:()=>{},broadcastScreenShareState:(session:any)=>effect('broadcast',{session}),broadcastScreenShareControlHandoff:(sessionId:string,controlOwner:string)=>effect('handoff',{sessionId,controlOwner}),sendScreenShareStartRequest:(sessionId:string,hostDeviceId:string,viewerDeviceIds?:string[])=>effect('start',{sessionId,hostDeviceId,...(viewerDeviceIds===undefined?{}:{viewerDeviceIds})})};
 try{
  migrateDatabase(sqlite);sqlite.exec("INSERT INTO users(id,username,password_hash,created_at,updated_at)VALUES('owner','alice','fixture','old','old'),('other','bob','fixture','old','old')");
  for(const device of call.devices??[])service.registerDevice(device);
  // Chat ownership is fixture-controlled; this exercises the real route's
  // access boundary without creating unrelated chat/runtime dependencies.
  const sessionService:any={getById:(id:string,user:string)=>user==='owner' && !(call.missingChats??[]).includes(id) && !(call.threadChats??[]).includes(id)?{id,userId:user}:undefined};
  const threadService:any=call.threadChats?{getById:(id:string)=>(call.threadChats as string[]).includes(id)?{id,userId:'owner'}:undefined}:undefined;
  app=await createServer({...loadConfig(),jwtSecret:'screen-share-fixture',logLevel:'silent' as const},{sqlite,userService:new UserService(db),sessionService,threadService,screenShare:service,ws});
  const base=await app.listen({host:'127.0.0.1',port:0});const responses=[];const vars:Record<string,string>={};
  const replace=(v:any):any=>typeof v==='string'?Object.entries(vars).reduce((text,[key,value])=>text.replaceAll(`$${key}`,value),v):Array.isArray(v)?v.map(replace):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([key,value])=>[key,replace(value)])):v;
  for(const source of call.steps){
   const step=replace(source);
   if(step.delayMs)await new Promise(resolve=>setTimeout(resolve,step.delayMs));
   const headers:any={host:'fixture.local',connection:'close',...step.headers};
   if(step.user){const token=await signAuthToken({id:step.user,username:step.user==='owner'?'alice':'bob'},'screen-share-fixture');if(step.cookie)headers.cookie='jait_auth='+token;else headers.authorization='Bearer '+token;}
   let body:any;if('raw' in step)body=step.raw;else if('body' in step){body=JSON.stringify(step.body);headers['content-type']??='application/json';}
   const res=await fetch(base+step.path,{method:step.method,headers,body});const raw=await res.text();let value:any=raw;try{value=JSON.parse(raw);}catch{}
   responses.push({status:res.status,body:value});
   if(step.bind && typeof value?.session?.id==='string')vars[step.bind]=value.session.id;
  }
  return {responses,events,state:service.getState()};
 }finally{app?.server.closeAllConnections();await app?.close();sqlite.close();console.log=previous;}
}
