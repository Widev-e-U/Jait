/** Actual credential service with real SQLite and encrypted UserSecretService.
 * All GitHub calls use bounded fixture responses; no real network effects. */
import {createPublicKey,verify,createHmac} from 'node:crypto';
import {createRequire} from 'node:module';
import {request as httpRequest} from 'node:http';
import {registerAgentGithubAppRoutes} from '../../../packages/gateway/src/routes/agent-github-apps.ts';
import {createAgentGithubTool,createAgentGithubTokenTool} from '../../../packages/gateway/src/tools/agent-github-tools.ts';
import {signAuthToken} from '../../../packages/gateway/src/security/http-auth.ts';
import {AgentGithubAppService,buildAppJwt} from '../../../packages/gateway/src/services/agent-github-apps.ts';
import {UserSecretService} from '../../../packages/gateway/src/services/user-secrets.ts';
import {openDatabase,migrateDatabase} from '../../../packages/gateway/src/db/connection.ts';
// Physical HTTP preserves repeated header lines; inject joins arrays differently.
async function wireRequest(base:string,opts:any):Promise<any>{
 return new Promise((resolve,reject)=>{
  let total=0;const chunks:Buffer[]=[];
  const req=httpRequest(new URL(opts.url,base),{method:opts.method,headers:opts.headers,agent:false},res=>{
   res.on('data',chunk=>{total+=chunk.length;if(total>1024*1024)req.destroy(Error('fixture response limit'));else chunks.push(Buffer.from(chunk));});
   res.on('error',reject);
   res.on('end',()=>{clearTimeout(timer);resolve({statusCode:res.statusCode,headers:res.headers,body:Buffer.concat(chunks).toString('utf8')});});
  });
  const timer=setTimeout(()=>req.destroy(Error('fixture request deadline')),5000);
  req.on('error',e=>{clearTimeout(timer);reject(e);});
  req.end(opts.payload);
 });
}
export async function dispatch(call:any){
 if(call.mode==='jwt') {
  const token=call.verifyJwt??buildAppJwt(call.app,call.key,call.now);
  const [h,p,s]=token.split('.');
  return {token,header:JSON.parse(Buffer.from(h,'base64url').toString()),claims:JSON.parse(Buffer.from(p,'base64url').toString()),verified:verify('RSA-SHA256',Buffer.from(`${h}.${p}`),createPublicKey(call.key),Buffer.from(s,'base64url'))};
 }
 let app:any;const lifecycle:any[]=[];const webhooks:any[]=[];const portCalls:string[]=[];let activeStep:any;let hookCounts:Record<string,number>={};
 const effects:any[]=[];let response:any;let responses:any[]|undefined;let now=call.now;
 const oldTimezone=process.env.TZ;
 if(typeof call.timezone==='string')process.env.TZ=call.timezone;
 const oldEnv=process.env.JAIT_PUBLIC_URL;
 if(call.environment==null)delete process.env.JAIT_PUBLIC_URL;else process.env.JAIT_PUBLIC_URL=call.environment;
 const {db,sqlite}=await openDatabase(':memory:');const log=console.log;console.log=(...a)=>console.error(...a);
 try{
  migrateDatabase(sqlite);if(call.seed)sqlite.exec(call.seed);
  const secrets=call.noSecrets?undefined:new UserSecretService(db,'github-storage-fixture');
  const service=new AgentGithubAppService({db,userSecretService:secrets,now:()=>now,stateSecret:call.secret,publicBaseUrl:call.publicUrl,apiBaseUrl:call.apiBase,fetchImpl:async(url,init)=>{
   effects.push({url,method:init?.method,headers:Object.entries(init?.headers??{}),body:init?.body??null});
   if(responses)response=responses.shift();
   if(!response)throw Error('unexpected network effect');
   if(response.error!==undefined)throw Error(response.error);
   return {ok:response.status>=200&&response.status<300,status:response.status,text:async()=>{if(response.textError)throw Error('read failed');if(response.bytes)return new Response(Uint8Array.from(response.bytes)).text();return response.body??JSON.stringify(response.data);}} as Response;
  }});
  const interleaveDisconnect=service.disconnect.bind(service);
  let serviceDepth=0;
  // Only outer calls made by the route are recorded. Nested real service calls
  // remain unchanged; deterministic mutations run after the outer call returns.
  if(call.mode==='composition'&&call.observe)for(const name of ['publicBaseUrl','readState','get','completeSetup','attachInstallation','findByAppId','findByInstallationId','webhookSecret','list','saveManualApp','disconnect','beginSetup']){
   const original=(service as any)[name].bind(service);
   (service as any)[name]=(...args:any[])=>{
    const outer=serviceDepth++===0;
    if(activeStep&&outer)portCalls.push(name);
    const finish=(value:any)=>{
     serviceDepth--;
     if(activeStep&&outer){
      const n=hookCounts[name]=(hookCounts[name]??0)+1;const hook=activeStep.interleave;
      if(hook?.operation===name&&n===(hook.nth??1)){
       if(hook.action==='disconnect')interleaveDisconnect('u','a');
       else if(hook.action==='rotate')secrets!.save({userId:'u',type:'github-app',key:'agent:a:webhook',label:'fixture',value:hook.value});
      }
     }
     return value;
    };
    let result:any;try{result=original(...args);}catch(e){serviceDepth--;throw e;}
    return result&&typeof result.then==='function'?result.then(finish,(e:any)=>{serviceDepth--;throw e;}):finish(result);
   };
  }
  const deps={service:()=>{lifecycle.push('initialize');if(call.initError)throw Error(call.initError);return service;},currentAgentId:({userId,threadId}:any)=>{lifecycle.push({user:userId,thread:threadId??null});return userId==='u'&&threadId==='thread-a'?'a':undefined;}};
  const tools=[createAgentGithubTool(deps),createAgentGithubTokenTool(deps)];
  if(call.mode==='composition'){
   const requireGateway=createRequire(new URL('../../../packages/gateway/package.json',import.meta.url));
   const {default:fastify}=await import(requireGateway.resolve('fastify'));
   const {default:cookie}=await import(requireGateway.resolve('@fastify/cookie'));
   app=fastify({logger:false});await app.register(cookie);
   registerAgentGithubAppRoutes(app,{jwtSecret:'github-route-fixture'} as any,{service,agentExists:(u,a)=>u==='u'&&a==='a',onWebhook:e=>{webhooks.push(e);if(activeStep?.sinkError)throw Error('fixture sink failure');}});
  }
  if(call.mode==='request'){response=call.response;return (service as any).request('/probe',{});}
  const wireBase=call.steps.some((s:any)=>s.wire)?await app.listen({host:'127.0.0.1',port:0}):undefined;
  const results:any[]=[];const issuedStates:string[]=[];
  for(const s of call.steps){try{
   let v:any;
   if(s.op==='http'){
    responses=[...(s.referenceResponses??s.responses??[])];
    activeStep=s;hookCounts={};
    const headers:any={host:'fixture.test',...s.headers};
    if(s.user)headers.authorization='Bearer '+await signAuthToken({id:s.user,username:'alice'},'github-route-fixture');
    const opts:any={method:s.method,url:s.path.replace(/\$state(\d+)/g,(_m:string,i:string)=>{if(!issuedStates[+i])throw Error('missing issued setup state');return encodeURIComponent(issuedStates[+i]);}),headers};
    if('raw' in s)opts.payload=s.raw;
    else if('body' in s){opts.payload=JSON.stringify(s.body);headers['content-type']='application/json';}
    if('sign' in s)headers['x-hub-signature-256']='sha256='+createHmac('sha256',s.sign).update(opts.payload??'').digest('hex');
    try{const r=s.wire?await wireRequest(wireBase,opts):await app.inject(opts);let body:any=r.body;try{body=JSON.parse(body);}catch{}
     if(s.captureState){const token=body.state;if(typeof token!=='string'||!token||!body.postUrl.includes(encodeURIComponent(token)))throw Error('setup did not issue matching state');const active=activeStep;activeStep=undefined;const parsed=service.readState(token);activeStep=active;if(!parsed||parsed.userId!=='u'||parsed.agentId!=='a')throw Error('invalid issued state principal');if(issuedStates.includes(token))throw Error('setup nonce reused');issuedStates.push(token);body={...body,state:parsed,postUrl:body.postUrl.replace(encodeURIComponent(token),'<state>')};}
     v={status:r.statusCode,body,location:r.headers.location??null};}finally{responses=undefined;activeStep=undefined;}
   }
   else if(s.op==='issuedChallenge'){const row=sqlite.prepare('SELECT data FROM agent_github_apps WHERE user_id=? AND agent_id=?').get('u','a') as any;const state=row?JSON.parse(row.data).manifestState:undefined;v={row:!!row,active:typeof state==='string'&&!!state,index:typeof state==='string'?issuedStates.indexOf(state):null};}
   else if(s.op==='tool'){
    responses=[...(s.responses??[])];try{v=await tools[s.token?1:0].execute(s.input,{userId:s.user,threadId:s.thread} as any);}finally{responses=undefined;}
   }
   else if(s.op==='begin'){
    v=await service.beginSetup(s.user,s.agent,s.options);
    const token=v.state;
    v.state=service.readState(token);v.postUrl=v.postUrl.replace(encodeURIComponent(token),'<state>');
    v.manifest.name=Array.from({length:v.manifest.name.length},(_,i)=>v.manifest.name.charCodeAt(i));
   }
   else if(s.op==='advance'){now+=s.ms;v=null;}
   else if(['token','test','env'].includes(s.op)){responses=[...(s.responses??[])];try{v=s.op==='token'?await service.mintInstallationToken(s.user,s.agent):s.op==='test'?await service.testConnection(s.user,s.agent):await service.resolveAgentGithubEnv(s.user,s.agent);}finally{responses=undefined;}}
   else if(s.op==='verify'){responses=[...s.responses];try{v=await service.verify(s.user,s.agent);}finally{responses=undefined;}}
   else if(s.op==='attach'){response=s.response;v=await service.attachInstallation(s.user,s.agent,s.installation);}
   else if(s.op==='complete'){response=s.response;v=await service.completeSetup(s.user,s.agent,s.code);}
   else if(s.op==='base')v={configured:service.configuredBaseUrl(),public:service.publicBaseUrl()};
   else if(s.op==='disconnect')v=service.disconnect(s.user,s.agent);
   else if(s.op==='installed')v=service.installedAgentIds(s.user);
   else if(s.op==='webhook')v=service.webhookSecret(s.user,s.agent);
   else if(s.op==='secret'){secrets!.save({userId:s.user,type:s.type??'github-app',key:s.key,label:'fixture',value:s.value});v=null;}
   else if(s.op==='save')v=await service.saveManualApp(s.user,s.agent,s.options);
   else if(s.op==='get')v=service.get(s.user,s.agent);
   else if(s.op==='list')v=service.list(s.user);
   else if(s.op==='findApp')v=service.findByAppId(s.id);
   else if(s.op==='findInstallation')v=service.findByInstallationId(s.id);
   else if(s.op==='state')v=service.readState(s.state);
   else if(s.op==='sign')v=(service as any).signState(s.user,s.agent);
   else if(s.op==='sql'){sqlite.exec(s.sql);v=null;}
   else throw Error('unknown operation');
   results.push(v);
  }catch(e){results.push({error:(e as Error).message});}}
  // Preserve JavaScript lone-surrogate prefixes as code units for the Rust JSON client.
  if(call.tokenPrefixUnits)for(const result of results){if(typeof result?.tokenPrefix==='string')result.tokenPrefix=Array.from({length:result.tokenPrefix.length},(_,i)=>result.tokenPrefix.charCodeAt(i));}
  if(call.mode==='composition')return {results,effects,lifecycle,webhooks,...(call.observe?{portCalls}:{})};
  const rows=sqlite.prepare('SELECT user_id,agent_id,status,data FROM agent_github_apps ORDER BY user_id,agent_id').all().map((r:any)=>({...r,data:JSON.parse(r.data)}));
  for(const row of rows){if(row.data.manifestState&&service.readState(row.data.manifestState))row.data.manifestState='<state>'; }
  const encrypted=sqlite.prepare('SELECT user_id,type,key,label,encrypted_value FROM user_secrets ORDER BY user_id,key').all().map((r:any)=>{
   const value=secrets?.getValue(r.user_id,r.type,r.key);return {user:r.user_id,type:r.type,key:r.key,label:r.label,value,encrypted:r.encrypted_value!==value&&!r.encrypted_value.includes('PRIVATE KEY')};
  });
  return {results,rows,secrets:encrypted,effects};
 }finally{if(oldTimezone===undefined)delete process.env.TZ;else process.env.TZ=oldTimezone;if(app)await app.close();sqlite.close();console.log=log;if(oldEnv===undefined)delete process.env.JAIT_PUBLIC_URL;else process.env.JAIT_PUBLIC_URL=oldEnv;}
}
