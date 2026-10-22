/** Real surface wrappers and registry; only browser engine and ID source are ports. */
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {SurfaceRegistry} from '../../../packages/gateway/src/surfaces/registry.ts';
let module:any;
async function load(){
 if(module)return module;
 const source=fileURLToPath(new URL('../../../packages/gateway/src/tools/surface-tools.ts',import.meta.url));
 const built=await Bun.build({entrypoints:[source],target:'bun',plugins:[{name:'surface-tool-ports',setup(build){
  build.onResolve({filter:/browser-tools\.js$/},()=>({path:'browser',namespace:'surface-tool-port'}));
  build.onResolve({filter:/db\/uuidv7\.js$/},()=>({path:'id',namespace:'surface-tool-port'}));
  build.onLoad({filter:/.*/,namespace:'surface-tool-port'},args=>({contents:args.path==='id'?'export function uuidv7(){return "01800000-0000-7000-8000-000000000001";}':'export function createBrowserInspectTool(registry,preview){if(!preview)throw new Error("missing preview");return {execute(input,context){return registry.fixtureInspect(input,context);}};}',loader:'js'}));
 }}]});
 if(!built.success)throw new Error('fixture build failed: '+built.logs.join('\n'));
 const code=await built.outputs[0].text();const hash=createHash('sha256').update(code).digest('hex');const artifact=new URL(`../../../.jait/artifacts/gateway-rust/surface-tools/fixtures/${hash}.mjs`,import.meta.url);await Bun.write(artifact,code);return module=await import(artifact.href);
}
function thrown(e:any){return e instanceof Error?{error:e.message}:{value:e};}
export async function dispatch(call:any){
 const m=await load();const results=[];
 for(const test of call.cases){
  const registry=new SurfaceRegistry();const events:any[]=[];
  function surface(id:string,kind:string,config:any){let state=config.state??'idle';let sessionId=config.sessionId??'';return {id,type:kind,get state(){return state},get sessionId(){return sessionId},async start(input:any){events.push({op:'start',id,input});state='starting';sessionId=input.sessionId;if(config.failStart)throw new Error('start failed');state='running';},async stop(input:any){events.push({op:'stop',id,input});state='stopping';if(config.failStop)throw new Error('stop failed');state='stopped';},snapshot(){if(config.failSnapshot)throw new Error('snapshot failed');return {id,type:kind,state,sessionId,metadata:config.metadata??{}};}};}
  for(const f of test.factories??[])registry.register({type:f.type,create(id:string){if(f.failCreate)throw new Error('create failed');return surface(id,f.type,f);}} as any);
  for(const s of test.instances??[])registry.registerInstance(s.id,surface(s.id,s.type,s) as any);
  (registry as any).fixtureInspect=async(input:any,context:any)=>{events.push({op:'inspect',input,context});if('error'in(test.inspect??{}))throw new Error(test.inspect.error);if('thrown'in(test.inspect??{}))throw test.inspect.thrown;return test.inspect?.response??{ok:false,message:'no browser'};};
  const tools=[m.createSurfacesListTool(registry),m.createSurfacesStartTool(registry,test.preview?{}:undefined),m.createSurfacesStopTool(registry)];
  const metadata=tools.map(({execute,...rest}:any)=>rest);const outcomes=[];
  for(const op of test.ops??[])try{const result=await tools[{list:0,start:1,stop:2}[op.op] as number].execute(op.input??{},op.context??{});if(op.op==="list"){const {message,...rest}=result;outcomes.push({result:{...rest,messageUnits:Array.from({length:message.length},(_,i)=>message.charCodeAt(i))}});}else outcomes.push({result});}catch(e){outcomes.push({thrown:thrown(e)});}
  results.push({metadata,outcomes,events});
 }
 return results;
}
