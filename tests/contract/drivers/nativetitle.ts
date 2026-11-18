/** Actual thread-title policy with scripted provider, fetch and shared-LLM ports. */
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
let loaded:Promise<any>|undefined;
async function factory(){
 return loaded??=(async()=>{
  const path=fileURLToPath(new URL('../../../packages/gateway/src/services/thread-title.ts',import.meta.url));
  let source=await Bun.file(path).text();
  const binding='import { resolveJaitLlmConfig, callJaitLlmCompletion } from "./jait-llm.js";';
  if(source.split(binding).length!==2)throw Error('Title LLM binding changed');
  source=source.replace(binding,`const resolveJaitLlmConfig=(...args)=>globalThis.__titlePort('resolve',args); const callJaitLlmCompletion=(...args)=>globalThis.__titlePort('complete',args);`);
  const timer='const TITLE_TURN_TIMEOUT_MS = 30_000;';
  if(source.split(timer).length!==2)throw Error('Title timeout changed; update virtual-time comparison');
  // Transpile without bundling: keep lexical names in engine TypeError diagnostics.
  const code=new Bun.Transpiler({loader:'ts'}).transformSync(source.replace(timer,'const TITLE_TURN_TIMEOUT_MS = 5;'));
  const output=new URL('../../../.jait/artifacts/gateway-rust/thread-title/fixtures/'+createHash('sha256').update(code).digest('hex')+'.mjs',import.meta.url);
  await Bun.write(output,code);return import(output.href);
 })();
}
function errorMessage(error:Error){
 // Engine source-expression spelling differs between Bun transpilation modes.
 // Retain the error type and failing property, normalize only that spelling.
 if(error.name==='TypeError'){
  const field=/null is not an object.*\.(message|choices)'/.exec(error.message)?.[1];
  if(field)return `Cannot read properties of null (reading '${field}')`;
  if(error.message.includes('content?.trim is not a function'))return 'Title response content.trim is not a function';
 }
 return error.message;
}
function fail(test:any,key:string){if(key in test)throw Error(test[key]);if(key+'Thrown' in test)throw test[key+'Thrown'];}
export async function dispatch(call:any){
 const module=await factory(), results=[];
 for(const test of call.cases){
  const events:any[]=[];
  const savedFetch=globalThis.fetch;
  const savedSetTimeout=globalThis.setTimeout;
  const timers:any[]=[];
  globalThis.setTimeout=((...args:any[])=>{const timer=(savedSetTimeout as any)(...args);timers.push(timer);return timer;})as any;
  try{
   let result;
   if(test.turn){
    let listener:any;
    const provider={
     onEvent(fn:any){events.push({name:'subscribe'});fail(test,'subscribeError');listener=fn;return()=>{if(listener)events.push({name:'unsubscribe'});listener=undefined;};},
     async sendTurn(session:string,prompt:string){
      events.push({name:'send',session,prompt});
      for(const event of test.events??[])listener?.(event);
      if(test.delayedEvents){await Promise.resolve();for(const event of test.delayedEvents)listener?.(event);}
      fail(test,'sendError');
      if(test.pending)await new Promise(()=>{});
     },
    };
    result=await module.generateTitleViaTurn(provider,test.session??'s',test.task??' task ');
   }else{
    (globalThis as any).__titlePort=(name:string,args:any[])=>{
     events.push({name,args:structuredClone(args)});
     fail(test,name+'Error');
     return structuredClone(name==='resolve'?test.resolved:test.raw);
    };
    globalThis.fetch=(async(url:any,init:any)=>{
     events.push({name:'fetch',url,method:init.method,headers:init.headers,body:JSON.parse(init.body)});
     fail(test,'fetchError');
     return {ok:test.status>=200&&test.status<300,status:test.status,json:async()=>{fail(test,'jsonError');return structuredClone(test.body);}};
    })as any;
    result=await module.generateTitleViaApi(structuredClone(test.options));
   }
   results.push({ok:true,result:Array.from({length:result.length},(_,i)=>result.charCodeAt(i)),events});
  }catch(error){results.push({ok:false,error:error instanceof Error?{kind:'Error',name:error.name,message:errorMessage(error)}:{kind:'Thrown',value:error},events});}
  finally{for(const timer of timers)clearTimeout(timer);globalThis.setTimeout=savedSetTimeout;globalThis.fetch=savedFetch;delete(globalThis as any).__titlePort;}
 }
 return results;
}
