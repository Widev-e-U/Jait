/** Actual store route source, with installer imports bound to scripted host ports. */
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {signAuthToken, requireAuth} from '../../../packages/gateway/src/security/http-auth.ts';
const requireGateway=createRequire(new URL('../../../packages/gateway/package.json',import.meta.url));
let loaded:Promise<any>|undefined;
async function load(){return loaded??=(async()=>{
 let source=await Bun.file(new URL('../../../packages/gateway/src/routes/store.ts',import.meta.url)).text();
 const binding='import { installClawHubSkill, uninstallClawHubSkill } from "../skills/install.js";';
 if(source.split(binding).length!==2)throw Error('Store installer binding changed');
 source=source.replace(binding,'const installClawHubSkill=p=>globalThis.__storeEffect("install",[p.slug,p.version]); const uninstallClawHubSkill=p=>globalThis.__storeEffect("uninstall",[p.slug]);');
 const code=new Bun.Transpiler({loader:'ts'}).transformSync(source);
 const file=new URL('../../../.jait/artifacts/gateway-rust/store/fixtures/'+createHash('sha256').update(code).digest('hex')+'.mjs',import.meta.url);
 await Bun.write(file,code);return import(file.href);
})();}
export async function dispatch(call:any){
 const module=await load();
 const {default:fastify}=await import(requireGateway.resolve('fastify'));
 const {default:cookie}=await import(requireGateway.resolve('@fastify/cookie'));
 const app=fastify({logger:false});await app.register(cookie);
 app.addHook('preHandler',async(req:any,reply:any)=>{if(!await requireAuth(req,reply,'store-route-fixture'))return reply;});
 let step:any;const events:any[]=[];
 function effect(name:string,args:any[]){
  events.push({name,args:JSON.parse(JSON.stringify(args))});
  if(step.errorAt===name){if('thrown' in step)throw step.thrown;throw Error(step.error);}
  const item=step.replies?.[name];
  const value=name==='getSkill'&&step.details?step.details[String(args[0])]:item;
  if(value?.__error)throw Error(value.__error);
  if(value?.__pending)return new Promise(()=>{});
  return structuredClone(value??(name==='listInstalled'||name==='search'||name==='packages'?[]:name==='isInstalled'?false:null));
 }
 (globalThis as any).__storeEffect=effect;
 module.registerStoreRoutes(app,{clawhub:{searchSkills:(...a:any[])=>effect('search',a),getSkill:(...a:any[])=>effect('getSkill',a),listPackages:(o:any)=>effect('packages',[o.limit])},skillRegistry:{list:()=>effect('listInstalled',[]),get:(slug:string)=>effect('isInstalled',[slug])?{}:undefined}});
 const results:any[]=[];
 try{
  for(step of call.steps){
   const headers:any={...step.headers};
   if(step.user){const token=await signAuthToken({id:step.user,username:'alice'},'store-route-fixture');if(step.cookie)headers.cookie='jait_token='+token;else headers.authorization='Bearer '+token;}
   const opts:any={method:step.method,url:step.path,headers};
   if('raw' in step)opts.payload=step.raw;
   else if('body' in step){opts.payload=JSON.stringify(step.body);headers['content-type']??='application/json';}
   const result=await app.inject(opts);let body:any=result.body;try{body=JSON.parse(body);}catch{}
   results.push({status:result.statusCode,body});
  }
  return {results,events};
 }finally{await app.close();}
}
