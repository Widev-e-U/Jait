/** Actual wrappers with only explicit host dependencies replaced. No I/O occurs. */
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const factories:Record<string,any>={};
async function load(kind:string){
 if(factories[kind])return factories[kind];
 const source=fileURLToPath(new URL(`../../../packages/gateway/src/tools/core/${kind}.ts`,import.meta.url));
 const built=await Bun.build({entrypoints:[source],target:'bun',plugins:[{name:'core-io-explicit-ports',setup(build){
  build.onResolve({filter:/terminal-tools\.js$/},()=>({path:'terminal',namespace:'core-io-fixture'}));
  build.onResolve({filter:/get-fs\.js$/},()=>({path:'filesystem',namespace:'core-io-fixture'}));
  build.onResolve({filter:/browser-tools\.js$/},()=>({path:'web',namespace:'core-io-fixture'}));
  build.onLoad({filter:/.*/,namespace:'core-io-fixture'},args=>({contents:args.path==='terminal'?
   'export function createTerminalRunTool(registry,unused,ws,secret,env) { if(unused!==undefined || ws!==registry.ws || secret!==registry.secret || env!==registry.env)throw new Error("bad factory wiring"); return {execute(input,context){return registry.port("terminal",input,context);}}; }':args.path==='filesystem'?
   'export async function getFs(registry,context,path){await registry.port("resolve",{path},context);return {patch(path,search,replace){return registry.port("patch",{path,search,replace},context)},write(path,content){return registry.port("write",{path,content},context)},statFile(path){return registry.port("stat",{path},context)},list(path){return registry.port("list",{path},context)},read(path){return registry.port("read",{path},context)}};}':
   'export function createWebSearchTool(){return {execute(input,context){return context.fixturePort("search",input,context)}};} export function createWebFetchTool(){return {execute(input,context){return context.fixturePort("fetch",input,context)}};}',loader:'js'}));
 }}]});
 if(!built.success)throw new Error('fixture build failed: '+built.logs.join('\n'));
 const code=await built.outputs[0].text();const hash=createHash('sha256').update(code).digest('hex');
 const artifact=new URL(`../../../.jait/artifacts/gateway-rust/core-io/fixtures/${kind}-${hash}.mjs`,import.meta.url);
 await Bun.write(artifact,code);const m=await import(artifact.href);
 return factories[kind]=m[`create${kind[0].toUpperCase()+kind.slice(1)}Tool`];
}
function thrown(value:any){return value instanceof Error?{error:value.message}:{value};}
export async function dispatch(call:any){
 const output=[];
 for(const test of call.cases){
  const create=await load(test.kind);const events:any[]=[];let cursor=0;
  const context={...test.context};
  const port=async(op:string,args:any,ctx:any)=>{const step=test.steps?.[cursor++]??{};events.push({op,args,sameContext:ctx===context});if(step.delay)await new Promise(r=>setTimeout(r,step.delay));if('error'in step)throw new Error(step.error);if('thrown'in step)throw step.thrown;if(step.repeatText)return step.repeatText.unit.repeat(step.repeatText.count);return "response" in step?step.response:{};};
  Object.defineProperty(context,'fixturePort',{value:port,enumerable:false});
  const registry={port,secret:{},ws:{},env:()=>{}};
  const tool=create(registry,registry.secret,registry.ws,registry.env);const {execute,...metadata}=tool;
  try {output.push({metadata,result:await execute(test.input,context),events});}catch(error){output.push({metadata,thrown:thrown(error),events});}
 }
 return output;
}
