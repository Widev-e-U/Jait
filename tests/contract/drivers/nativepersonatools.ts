/** Actual factory and shared Zod schema; only UUID and dependency ports are fixtures. */
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {personaAgentProfileSchema} from '../../../packages/shared/src/persona-agent.ts';
import {createPersonaAgentTool,createPersonaAgentInspectTool} from '../../../packages/gateway/src/tools/persona-agent-tools.ts';
let loaded:Promise<any>|undefined;
async function factory(){
 return loaded??=(async()=>{
  const source=fileURLToPath(new URL('../../../packages/gateway/src/tools/persona-agent-tools.ts',import.meta.url));
  const built=await Bun.build({entrypoints:[source],target:'bun',plugins:[{name:'fixture-profile-id',setup(build){
   build.onLoad({filter:/tools\/persona-agent-tools\.ts$/},async args=>{
    const source=await Bun.file(args.path).text();
    const importLine='import { uuidv7 } from "../db/uuidv7.js";';
    if(source.split(importLine).length!==2)throw Error('UUID import changed; review fixture binding');
    return {loader:'ts',contents:source.replace(importLine,'const uuidv7 = () => "019f0000-0000-7000-8000-000000000001";')};
   });
  }}]});
  if(!built.success)throw Error(built.logs.join('\n'));
  const code=await built.outputs[0].text();
  const path=new URL('../../../.jait/artifacts/gateway-rust/persona-tools/fixtures/'+createHash('sha256').update(code).digest('hex')+'-'+process.pid+'.mjs',import.meta.url);
  await Bun.write(path,code);return import(path.href);
 })();
}
export async function dispatch(call:any){
 if(call.op==='nativepersonatools.metadata')return [createPersonaAgentTool,createPersonaAgentInspectTool].map(make=>{const{execute,...metadata}=make({threadService:{}as any,providerAvailable:()=>false});return metadata;});
 if(call.op==='nativepersonatools.parse')return call.profiles.map((v:any)=>{const p=personaAgentProfileSchema.safeParse(v);return p.success?{ok:p.data}:{error:p.error.issues.map(i=>i.path.join('.')+': '+i.message).join('; ')};});
 const module=await factory();const results=[];
 for(const test of call.cases){
  const events:any[]=[];let cursor=0;
  const invoke=(name:string,args:any[])=>{
   events.push({name,args:structuredClone(args)});const step=test.steps[cursor++];
   if(!step||step.name!==name)throw Error('Unexpected call: '+name);
   if('error'in step)throw Error(step.error);if('thrown'in step)throw step.thrown;
   return structuredClone(step.value);
  };
  const service=new Proxy({}, {get(_target,name){return(...args:any[])=>invoke(String(name),args);}});
  const tool=(test.inspect?module.createPersonaAgentInspectTool:module.createPersonaAgentTool)({threadService:service,providerAvailable:(...args:any[])=>invoke('providerAvailable',args)});
  try {results.push({ok:true,result:await tool.execute(structuredClone(test.input),{userId:test.user}),events,consumed:cursor});}
  catch(error){results.push({ok:false,error:error instanceof Error?{kind:'Error',message:error.message}:{kind:'Thrown',value:error},events,consumed:cursor});}
 }return results;
}
