/** Unmodified actual Fastify GitHub App routes, scripted credential/effect ports only. */
import {createRequire} from 'node:module';
import {createHmac} from 'node:crypto';
import {registerAgentGithubAppRoutes} from '../../../packages/gateway/src/routes/agent-github-apps.ts';
import {signAuthToken} from '../../../packages/gateway/src/security/http-auth.ts';
const requireGateway=createRequire(new URL('../../../packages/gateway/package.json',import.meta.url));
export async function dispatch(call:any){
 const {default:fastify}=await import(requireGateway.resolve('fastify'));
 const {default:cookie}=await import(requireGateway.resolve('@fastify/cookie'));
 const app=fastify({logger:false,bodyLimit:25*1024*1024});await app.register(cookie);
 let step:any;let counts:Record<string,number>={};const events:any[]=[];
 function effect(name:string,args:any[]){
  events.push({name,args:JSON.parse(JSON.stringify(args))});
  if(step.errorAt===name){if('thrown' in step)throw step.thrown;throw Error(step.error);}
  let value=step.replies?.[name];
  if(value?.sequence){const i=counts[name]??0;counts[name]=i+1;value=value.sequence[Math.min(i,value.sequence.length-1)];}
  if(value?.__error)throw Error(value.__error);
  if(value!==undefined)return structuredClone(value);
  return name==='list'?[]:name==='publicBaseUrl'?'https://jait.test':null;
 }
 const service:any={};
 for(const name of ['list','get','publicBaseUrl','webhookSecret','beginSetup','saveManualApp','attachInstallation','verify','testConnection','disconnect','readState','completeSetup','findByAppId','findByInstallationId'])service[name]=(...args:any[])=>effect(name,args);
 registerAgentGithubAppRoutes(app,{jwtSecret:'github-route-fixture'} as any,{service,agentExists:call.noChecker?undefined:(u,a)=>{events.push({name:'agentExists',args:[u,a]});return step.agentMissing!==true;},onWebhook:call.noSink?undefined:e=>{effect('onWebhook',[e]);}});
 const results:any[]=[];
 try{
  for(step of call.steps){
   counts={};const headers:any={host:'fixture.test',...step.headers};
   for(const key of Object.keys(headers))if(Array.isArray(headers[key]))headers[key]=headers[key].join(', ');
   if(step.user){const token=await signAuthToken({id:step.user,username:'alice'},'github-route-fixture');if(step.cookie)headers.cookie='jait_token='+token;else headers.authorization='Bearer '+token;}
   const opts:any={method:step.method,url:step.path,headers};
   if('raw' in step)opts.payload=step.raw;
   else if('body' in step){opts.payload=JSON.stringify(step.body);headers['content-type']??='application/json';}
   if('sign' in step)headers['x-hub-signature-256']='sha256='+createHmac('sha256',step.sign).update(opts.payload??'').digest('hex');
   const result=await app.inject(opts);let body:any=result.body;try{body=JSON.parse(body);}catch{}
   results.push({status:result.statusCode,body,location:result.headers.location??null});
  }
  return {results,events};
 }finally{await app.close();}
}
