/** Actual security factories; only explicit service singletons and time are controlled. */
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const key=Symbol.for('jait.security.tools.contract');
const loaded=new Map<string,Promise<any>>();
async function load(kind:string){
 if(!loaded.has(kind))loaded.set(kind,(async()=>{
  const source=fileURLToPath(new URL(`../../../packages/gateway/src/tools/${kind}.ts`,import.meta.url));
  const built=await Bun.build({entrypoints:[source],target:'bun',plugins:[{name:'security-service-ports',setup(build){
   build.onResolve({filter:/security\/(assessment|workbench)\.js$/},args=>({path:args.path.includes('assessment')?'assessment':'workbench',namespace:'security-fixture'}));
   build.onLoad({filter:/.*/,namespace:'security-fixture'},args=>({contents:args.path==='assessment'?'export function getAssessmentService(){return globalThis[Symbol.for("jait.security.tools.contract")].assessment;}':'export function getSecurityWorkbench(){return globalThis[Symbol.for("jait.security.tools.contract")].workbench;}',loader:'js'}));
  }}]});
  if(!built.success)throw Error('security factory fixture build failed: '+built.logs.join('\n'));
  const code=await built.outputs[0].text();const hash=createHash('sha256').update(code).digest('hex');const artifact=new URL(`../../../.jait/artifacts/gateway-rust/security-tools-fixtures/${hash}.mjs`,import.meta.url);await Bun.write(artifact,code);return import(artifact.href);
 })());
 return loaded.get(kind)!;
}
const units=(s:string)=>Array.from({length:s.length},(_,i)=>s.charCodeAt(i));
const strip=(tools:any[])=>tools.map(({execute,...definition})=>definition);
export async function dispatch(call:any){
 const base=await load('security-tools'),workbench=await load('security-workbench-tools');
 if(call.op==='nativesecuritytools.metadata')return {assessment:strip(base.createSecurityTools()),base:strip(workbench.createSecurityWorkbenchTools()),scheduled:strip(workbench.createSecurityWorkbenchTools({}as any))};
 const results=[];
 for(const test of call.cases){
  const controller=new AbortController();if(test.aborted)controller.abort();
  const signal=test.hasSignal===false?undefined:controller.signal;
  const events:any[]=[];let cursor=0;
  const service=(name:string)=>new Proxy({}, {get(_target,method){return (...args:any[])=>{
   const indices=args.flatMap((value,i)=>signal!==undefined&&value===signal?[i]:[]);
   events.push({service:name,method:String(method),args:args.map(value=>signal!==undefined&&value===signal?'<signal>':value===undefined?null:structuredClone(value)),signalIndices:indices,aborted:indices.length?signal!.aborted:null});
   const step=test.steps?.[cursor++];
   if(!step||step.service!==name||step.method!==String(method))throw Error('Unexpected service call: '+name+'.'+String(method));
   if('error'in step)throw Error(step.error);
   if('thrown'in step)throw step.thrown;
   if('reject'in step)return Promise.reject(Error(step.reject));
   return structuredClone(step.value);
  };}});
  (globalThis as any)[key]={assessment:service('assessment'),workbench:service('workbench')};
  const previousNow=Date.now;Date.now=()=>test.now??Date.parse('2026-10-22T12:00:00.000Z');
  try{
   const tools=test.kind==='assessment'?base.createSecurityTools():workbench.createSecurityWorkbenchTools(test.scheduler?service('scheduler'):undefined);
   const tool=tools.find((tool:any)=>tool.name===test.name);if(!tool)throw Error('Unknown fixture tool');
   const result=await tool.execute(structuredClone(test.input),{...test.context,...(signal?{signal}:{})});
   result.message=units(result.message);
   results.push({result,events,consumed:cursor});
  }finally{Date.now=previousNow;delete(globalThis as any)[key];}
 }
 return results;
}
