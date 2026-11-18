/** Actual route registration and authentication over owned loopback HTTP.
 * Service/scheduler ports are scripted; no assessment or job is executed. */
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const gatewayRequire=createRequire(new URL('../../../packages/gateway/package.json',import.meta.url));
const KEY=Symbol.for('jait.workbench.http.fixture');let loaded:Promise<any>|undefined;
async function load(){return loaded??=(async()=>{
 const source=fileURLToPath(new URL('../../../packages/gateway/src/routes/security-workbench.ts',import.meta.url));
 const built=await Bun.build({entrypoints:[source],target:'bun',plugins:[{name:'workbench-route-ports',setup(build){
  build.onResolve({filter:/security\/workbench\.js$/},()=>({path:'service',namespace:'workbench-route'}));
  build.onResolve({filter:/tools\/security-workbench-tools\.js$/},()=>({path:'monitor',namespace:'workbench-route'}));
  build.onLoad({filter:/.*/,namespace:'workbench-route'},args=>({loader:'js',contents:args.path==='service'?"export function getSecurityWorkbench(){return globalThis[Symbol.for('jait.workbench.http.fixture')].service;}":"export function createSecurityWorkbenchTools(){return [{name:'security.monitor.schedule',execute:(input,context)=>globalThis[Symbol.for('jait.workbench.http.fixture')].monitor(input,context)}];}"}));
 }}]});if(!built.success)throw Error(built.logs.join('\n'));const code=await built.outputs[0].text();const hash=createHash('sha256').update(code).digest('hex');const path=new URL(`../../../.jait/artifacts/gateway-rust/workbench-http-fixtures/${hash}.mjs`,import.meta.url);await Bun.write(path,code);return import(path.href);
})();}
export async function dispatch(call:any){
 const {registerSecurityWorkbenchRoutes}=await load();const {default:fastify}=await import(gatewayRequire.resolve('fastify'));const {default:cookie}=await import(gatewayRequire.resolve('@fastify/cookie'));const {signAuthToken}=await import('../../../packages/gateway/src/security/http-auth.ts');
 const app=fastify({logger:false});await app.register(cookie);let step:any;const events:any[]=[];
 const invoke=(name:string,args:any[])=>{events.push({name,args:structuredClone(args)});if(step.serviceError)throw Error(step.serviceError);return structuredClone(step.reply??null);};
 const service=new Proxy({}, {get(_target,name){return (...args:any[])=>invoke(String(name),args);}});
 (globalThis as any)[KEY]={service,monitor:(input:any,context:any)=>{context.actionId='<request>';context.projectRoot='<project>';return invoke('monitor',[input,context]);}};
 registerSecurityWorkbenchRoutes(app,{jwtSecret:'workbench-route-fixture'}as any,call.scheduler?{}as any:undefined);
 const base=await app.listen({host:'127.0.0.1',port:0});const results:any[]=[];
 try{for(step of call.steps){
  const headers:any={connection:'close',...step.headers};if(step.user){const token=await signAuthToken({id:step.user,username:step.user==='owner'?'alice':'bob'},'workbench-route-fixture');if(step.cookie)headers.cookie='jait_token='+token;else headers.authorization='Bearer '+token;}
  let body:any;if('raw'in step)body=step.raw;else if('body'in step){body=JSON.stringify(step.body);headers['content-type']??='application/json';}
  const result=await fetch(base+step.path,{method:step.method,headers,body});const raw=await result.text();let value:any=raw;try{value=JSON.parse(raw);}catch{}results.push({status:result.status,body:value});
 }return {results,events};}finally{delete(globalThis as any)[KEY];app.server.closeAllConnections();await app.close();}
}
