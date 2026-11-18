/** Import the real barrel and all real factory modules; isolate only engine ports. */
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
let witness:any;
async function identities(){
 if(witness)return witness;
 const base=new URL('../../../packages/gateway/src/tools/core/',import.meta.url);
 const files=['read','edit','execute','search','web','agent','todo','jait'];
 const entry=`import * as api from ${JSON.stringify(fileURLToPath(new URL('index.ts',base)))};\n`+files.map((x,i)=>`import * as m${i} from ${JSON.stringify(fileURLToPath(new URL(x+'.ts',base)))};`).join('\n')+`
 export const result={exports:Object.keys(api).sort(),same:{`+files.map((x,i)=>{const key='create'+x[0].toUpperCase()+x.slice(1)+'Tool';return `${key}:api.${key}===m${i}.${key}`;}).concat(['getSessionTodos:api.getSessionTodos===m6.getSessionTodos','clearSessionTodos:api.clearSessionTodos===m6.clearSessionTodos']).join(',')+`}};`;
 const artifact=new URL('../../../.jait/artifacts/gateway-rust/core-exports/identity-entry.ts',import.meta.url);await Bun.write(artifact,entry);
 const built=await Bun.build({entrypoints:[fileURLToPath(artifact)],target:'bun',plugins:[{name:'core-barrel-engine-ports',setup(build){
  build.onResolve({filter:/terminal-tools\.js$/},()=>({path:'terminal',namespace:'exports-port'}));
  build.onResolve({filter:/get-fs\.js$/},()=>({path:'filesystem',namespace:'exports-port'}));
  build.onResolve({filter:/browser-tools\.js$/},()=>({path:'web',namespace:'exports-port'}));
  build.onResolve({filter:/agent-tools\.js$/},()=>({path:'agent',namespace:'exports-port'}));
  build.onResolve({filter:/services\/project-search\.js$/},()=>({path:'search',namespace:'exports-port'}));
  build.onLoad({filter:/.*/,namespace:'exports-port'},args=>({contents:({
   terminal:'export function createTerminalRunTool(){throw Error("identity witness cannot execute engines");}',
   filesystem:'export function getFs(){throw Error("identity witness cannot execute engines");} export function resolveProjectRoot(){throw Error("identity witness cannot execute engines");}',
   web:'export function createWebSearchTool(){throw Error("identity witness cannot execute engines");} export function createWebFetchTool(){throw Error("identity witness cannot execute engines");}',
   agent:'export function createAgentSpawnTool(){throw Error("identity witness cannot execute engines");}',
   search:'export const PROJECT_SEARCH_DEFAULT_RESULTS=20,PROJECT_SEARCH_MAX_RESULTS=200;export function normalizeProjectSearchLimit(){throw Error("identity witness cannot execute engines");} export function searchProject(){throw Error("identity witness cannot execute engines");} export class ProjectSearchUnavailableError extends Error{}',
  }as Record<string,string>)[args.path],loader:'js'}));
 }}]});
 if(!built.success)throw Error('barrel identity build failed: '+built.logs.join('\n'));
 const code=await built.outputs[0].text();const hash=createHash('sha256').update(code).digest('hex');const out=new URL(`../../../.jait/artifacts/gateway-rust/core-exports/fixtures/${hash}.mjs`,import.meta.url);await Bun.write(out,code);return witness=(await import(out.href)).result;
}
export async function dispatch(call:any){
 if(call.op==='nativecoreexports.identities')return identities();
 const {createTodoTool,getSessionTodos,clearSessionTodos}=await import('../../../packages/gateway/src/tools/core/todo.ts');
 const tool=createTodoTool(),other=createTodoTool(),session=call.session;clearSessionTodos(session);let held:any;const events=[],states=[];
 for(const step of call.steps){if(step.clear)clearSessionTodos(session);else {const result=await (step.other?other:tool).execute(step.input,{sessionId:session}as any);if(!result.ok)throw Error('valid todo fixture failed: '+result.message);events.push(result);held??=getSessionTodos(session);}
 const current=getSessionTodos(session);states.push({current,sameHeld:held===current});}
 const result={metadata:(({execute,...rest})=>rest)(tool),events,states,held,current:getSessionTodos(session),otherSession:getSessionTodos(session+'-isolated')};clearSessionTodos(session);return result;
}
