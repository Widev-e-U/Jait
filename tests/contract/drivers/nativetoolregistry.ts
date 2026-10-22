/** Actual registry, validator, plugin declarations and shared page rules.
 * Only UUID allocation and System One's explicit ranking service are controlled.
 */
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
let loaded:Promise<any>|undefined;
const key=Symbol.for('jait.registry.contract');
async function load(){return loaded??=(async()=>{
 const source=fileURLToPath(new URL('../../../packages/gateway/src/tools/registry.ts',import.meta.url));
 const built=await Bun.build({entrypoints:[source],target:'bun',plugins:[{name:'registry-explicit-ports',setup(build){
  build.onResolve({filter:/services\/system-one\.js$/},()=>({path:'model',namespace:'registry-fixture'}));
  build.onResolve({filter:/db\/uuidv7\.js$/},()=>({path:'ids',namespace:'registry-fixture'}));
  build.onLoad({filter:/.*/,namespace:'registry-fixture'},args=>({contents:args.path==='ids'?
   'export function uuidv7(){return globalThis[Symbol.for("jait.registry.contract")].id();}':
   'export function systemOneEnabled(keys){return globalThis[Symbol.for("jait.registry.contract")].enabled(keys);}export async function rankSystemOne(keys,query,candidates,describe,purpose,signal,onScore,minimum){return globalThis[Symbol.for("jait.registry.contract")].rank(keys,query,candidates,describe,purpose,signal,onScore,minimum);}',loader:'js'}));
 }}]});if(!built.success)throw Error('registry fixture build failed: '+built.logs.join('\n'));
 const code=await built.outputs[0].text();const hash=createHash('sha256').update(code).digest('hex');const artifact=new URL(`../../../.jait/artifacts/gateway-rust/registry/fixtures/${hash}.mjs`,import.meta.url);await Bun.write(artifact,code);return import(artifact.href);
})();}
const units=(s:string)=>Array.from({length:s.length},(_,i)=>s.charCodeAt(i));
const snapshot=(v:any)=>v===undefined?null:JSON.parse(JSON.stringify(v));
const thrown=(e:any)=>e instanceof TypeError?{validation:{name:e.name}}:e instanceof Error?{error:e.message}:{value:e};
export async function dispatch(call:any){
 const {ToolRegistry}=await load();const results=[];
 for(const test of call.cases){
  const registry=new ToolRegistry();const events:any[]=[];const outcomes=[];let current:any={};let next=0;let auditCursor=0;
  const capabilities={};const context={...test.context,capabilities};
  const fail=(step:any)=>{if(step&&'error'in step)throw Error(step.error);if(step&&'thrown'in step)throw step.thrown;};
  (globalThis as any)[key]={
   id(){const id=`id-${++next}`;events.push({op:'id',id});return id;},
   enabled(keys:any){events.push({op:'enabled',...(keys===undefined?{}:{keys})});return !!current.model?.enabled;},
   async rank(keys:any,query:any,candidates:any[],describe:any,purpose:any,signal:any,onScore:any,minimum:any){
    events.push({op:'rank',...(keys===undefined?{}:{keys}),queryUnits:units(query),candidates:snapshot(candidates),descriptions:candidates.map(describe),purpose,signalAbsent:signal===undefined,minimumAbsent:minimum===undefined});
    fail(current.model);
    (current.model?.scores??[]).forEach((score:any,i:number)=>{if(candidates[i])onScore(candidates[i],score);});
    if(current.model?.identity)return candidates;
    return (current.model?.order??candidates.map((_,i)=>i).reverse()).map((i:number)=>candidates[i]);
   }
  };
  const make=(item:any)=>({...item.definition,async execute(input:any,ctx:any){
   const {capabilities:cap,...fields}=ctx;
   events.push({op:'tool',handler:item.handler??item.definition.name,definition:snapshot(this),inputWire:JSON.stringify(input),inputKeys:input&&typeof input==='object'?Object.keys(input).map(units):null,context:fields,sameContext:ctx===context,sameCapabilities:cap===capabilities});
   fail(item.script);
   if(item.script?.setNumber)input[item.script.setNumber.key]=item.script.setNumber.value;
   return item.script?.echoWire?{ok:true,message:JSON.stringify(input)}:structuredClone(item.script?.result??{ok:true,message:'result'});
  }});
  for(const item of test.tools??[])registry.register(make(item));
  for(current of test.ops){
   try{
    let value:any;
    const opts={...current.options,...(current.options?.disabledTools?{disabledTools:new Set(current.options.disabledTools)}:{}),...(current.options?.candidates?{candidates:current.options.candidates.map((name:string)=>registry.get(name))}:{})};
    const disabled=new Set(current.disabled??[]);
    switch(current.op){
     case 'register':registry.register(make(current.item));value=null;break;
     case 'plugin':registry.registerPluginTools(current.plugin,current.tools.map(make));value=null;break;
     case 'unregister':value=registry.unregister(current.name);break;
     case 'get':value=registry.get(current.name)??null;break;
     case 'has':value=registry.has(current.name);break;
     case 'names':value=registry.listNames();break;
     case 'list':value=registry.list();break;
     case 'tier':value=registry.listByTier(current.value);break;
     case 'category':value=registry.listByCategory(current.value);break;
     case 'info':value=registry.listInfo();break;
     case 'infoFiltered':value=registry.listInfoFiltered(disabled);break;
     case 'mcp':value=registry.listForMcp(disabled);break;
     case 'llm':value=registry.listForLLM(disabled);break;
     case 'executable':value=registry.isExecutable(current.name,disabled);break;
     case 'rank':value=registry.rankSearch(current.query,opts);break;
     case 'search':value=registry.search(current.query,opts);break;
     case 'select':value=registry.selectForLLM(current.query,disabled,current.limit);break;
     case 'model':value=await registry.rankSearchWithSystemOne(current.query,opts,current.keys);break;
     case 'execute':{
      let input=structuredClone(current.input);
      const audit=current.audit?{write(entry:any){events.push({op:'audit',entry:snapshot(entry)});fail(current.auditSteps?.[auditCursor++]);}}:undefined;
      try{const result=await registry.execute(current.name,input,context as any,audit);result.message=units(result.message);value={result,inputWire:JSON.stringify(input)};}
      catch(error){value={thrown:thrown(error),inputWire:JSON.stringify(input)};}
      break;
     }
     default:throw Error('unknown fixture op');
    }
    outcomes.push({value:snapshot(value)});
   }catch(error){outcomes.push({thrown:thrown(error)});}
  }
  results.push({outcomes,events});delete(globalThis as any)[key];
 }
 return results;
}
