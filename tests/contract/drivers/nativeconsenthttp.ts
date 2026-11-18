/** Actual consent route registrar and native-reference queue, isolated from live state. */
import {createRequire} from 'node:module';
import {registerConsentRoutes} from '../../../packages/gateway/src/routes/consent.ts';
import {ConsentManager} from '../../../packages/gateway/src/security/consent-manager.ts';
import {ControlAccess} from '../../../packages/gateway/src/security/control-access.ts';
import {signAuthToken} from '../../../packages/gateway/src/security/http-auth.ts';
const requireGateway=createRequire(new URL('../../../packages/gateway/package.json',import.meta.url));
export async function dispatch(call:any){
 const {default:fastify}=await import(requireGateway.resolve('fastify'));
 const {default:cookie}=await import(requireGateway.resolve('@fastify/cookie'));
 const app=fastify({logger:false});await app.register(cookie);
 const ids=new Map<string,string>(),events:any[]=[],results:any[]=[],aliases=new Map<string,string>();
 let active:any={};let currentAlias='';
 const manager=new ConsentManager({defaultTimeoutMs:120000,onRequest(req){ids.set(req.id,currentAlias);aliases.set(currentAlias,req.id);},onDecision(decision){events.push({kind:'decision',value:structuredClone(decision)});if(active.throwDecision)throw Error('decision failed');}});
 const access=new ControlAccess({getById(id:string,user:string){if(call.accessError)throw Error('ownership failed');return call.owners?.[id]===user?{id}:undefined;}} as any,undefined,manager,{getById(id:string){return call.threads?.[id]?{userId:call.threads[id]}:undefined;}} as any);
 const permissions=new Map((call.permissions??[]).map((p:any)=>[p.toolName,p]));
 registerConsentRoutes(app,manager,{write(event:any){if(!/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(event.actionId))throw Error('invalid audit uuid');const value=structuredClone(event);value.actionId='<audit-id>';events.push({kind:'audit',value});if(active.throwAudit)throw Error('audit failed');}} as any,{config:{jwtSecret:'consent-http-fixture'} as any,access,activeProfileName:call.profile,permissions:permissions as any});
 function norm(v:any):any{if(Array.isArray(v))return v.map(norm);if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,['createdAt','expiresAt','decidedAt'].includes(k)?'<time>':norm(x)]));if(typeof v==='string')return ids.get(v)??v;return v;}
 const base=await app.listen({host:'127.0.0.1',port:0});
 try{
  for(active of call.steps){
   if(active.ask){currentAlias=active.ask;const promise=manager.requestConsent(active.input);promise.catch(()=>{});results.push({asked:active.ask});continue;}
   const path=active.path.replace(/\$([a-zA-Z0-9_-]+)/g,(_:string,key:string)=>aliases.get(key)??key);
   const headers:any={...active.headers};
   if(active.user){const token=await signAuthToken({id:active.user,username:'alice'},'consent-http-fixture');if(active.cookie)headers.cookie='jait_token='+token;else headers.authorization='Bearer '+token;}
   const opts:any={method:active.method,url:path,headers};
   if('raw' in active)opts.payload=active.raw;
   else if('body' in active){opts.payload=JSON.stringify(active.body);headers['content-type']??='application/json';}
   const reply=await fetch(base+path,{method:opts.method,headers,body:opts.payload,signal:AbortSignal.timeout(5000)});let body:any=await reply.text();try{body=JSON.parse(body);}catch{}
   results.push(norm({status:reply.status,body}));
  }
  return {results,events:norm(events),pending:norm(manager.listPending()),enabled:Object.fromEntries(Object.keys(call.owners??{}).map(s=>[s,manager.isApproveAllEnabledForSession(s)]))};
 }finally{manager.cancelAll('fixture done');await app.close();}
}
