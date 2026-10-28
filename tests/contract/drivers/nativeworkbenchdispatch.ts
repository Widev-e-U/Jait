/** Invoke the actual dispatch method with owned engine/filesystem ports. Only
 * dependency bindings change; branch and merge logic remain the original. */
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const KEY=Symbol.for('jait.workbench.dispatch.fixture');let loaded:Promise<any>|undefined;
async function load(){return loaded??=(async()=>{
 const source=fileURLToPath(new URL('../../../packages/gateway/src/security/workbench.ts',import.meta.url));
 const built=await Bun.build({entrypoints:[source],target:'bun',plugins:[{name:'owned-engine-ports',setup(build){
  build.onLoad({filter:/security\/workbench\.ts$/},async args=>({loader:'ts',contents:(await Bun.file(args.path).text()).replace('import { readFile } from "node:fs/promises";',`const readFile=(...args)=>globalThis[Symbol.for('jait.workbench.dispatch.fixture')].readFile(...args);`).replace('await import("node:fs/promises")',`{readdir:(...args)=>globalThis[Symbol.for('jait.workbench.dispatch.fixture')].readdir(...args)}`)}));
  build.onResolve({filter:/lib\/security\/(protocols|engines|host-software)\.js$/},args=>({path:args.path,namespace:'engine-port'}));
  build.onLoad({filter:/.*/,namespace:'engine-port'},()=>({loader:'js',contents:`const key=Symbol.for('jait.workbench.dispatch.fixture');export class EngineUnavailable extends Error{};export function runCommand(){};${['checkTls','checkHttp','checkSsh','scanNmap','scanNuclei','auditHost','scanSoftware','parseTelemetry','engineStatus'].map(name=>`export function ${name}(...args){return globalThis[key].call('${name}',args);}`).join('')}export async function createSnapshot(...args){await globalThis[key].call('createSnapshot',args);return {root:'snapshot',cleanup:()=>globalThis[key].call('cleanup',[])};}`}));
 }}]});if(!built.success)throw Error(built.logs.join('\n'));const code=await built.outputs[0].text();const hash=createHash('sha256').update(code).digest('hex');const path=new URL(`../../../.jait/artifacts/gateway-rust/workbench-dispatch-fixtures/${hash}-${process.pid}.mjs`,import.meta.url);await Bun.write(path,code);return import(path.href);
})();}
export async function dispatch(call:any){const {SecurityWorkbenchService}=await load();const controller=new AbortController();const events:any[]=[];let n=0;
 const invoke=(name:string,args:any[])=>{events.push({name,args:args.filter(v=>v!==controller.signal&&typeof v!=='function'),signal:args.includes(controller.signal),runner:args.some(v=>typeof v==='function'),aborted:controller.signal.aborted});const step=call.engineSteps[n++];if(!step||step.name!==name)throw Error('Unexpected engine call: '+name);if(step.abort)controller.abort();if(step.error)throw Error(step.error);return structuredClone(step.value);};
 (globalThis as any)[KEY]={call:invoke,readFile:(path:string,encoding:string)=>invoke('readFile',[path,encoding]),readdir:(path:string)=>invoke('readdir',[path])};
 try{const service=new SecurityWorkbenchService();try{return {ok:true,value:await service.dispatch(call.input,call.scope,controller.signal),events,consumed:n};}catch(error){return {ok:false,error:error instanceof Error?error.message:String(error),events,consumed:n};}}finally{delete(globalThis as any)[KEY];}
}
