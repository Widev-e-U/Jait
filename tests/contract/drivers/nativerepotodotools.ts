/** Actual repository todo factory with explicit injected services. */
import {createJaitTodosTool} from '../../../packages/gateway/src/tools/repo-proposal-tools.ts';
export async function dispatch(call:any){
 if(call.op==='nativerepotodotools.metadata'){const {execute,...metadata}=createJaitTodosTool({repoService:{}as any,repoProposalService:{}as any});return metadata;}
 const results=[];
 for(const test of call.cases){
  const events:any[]=[];let cursor=0;
  const port=(service:string)=>new Proxy({}, {get(_target,name){return(...args:any[])=>{
   events.push({service,method:String(name),args:args.map(v=>v===undefined?null:structuredClone(v))});
   const step=test.steps[cursor++];if(!step||step.service!==service||step.method!==String(name))throw Error('Unexpected service call: '+service+'.'+String(name));
   if('error'in step)throw Error(step.error);if('thrown'in step)throw step.thrown;
   return structuredClone(step.value);
  };}});
  const tool=createJaitTodosTool({repoService:port('repositories')as any,repoProposalService:port('todos')as any,...(test.threads?{threadService:port('threads')as any}:{})});
  try{const result=await tool.execute(structuredClone(test.input),structuredClone(test.context));const message=Array.from({length:result.message.length},(_,i)=>result.message.charCodeAt(i));results.push({ok:true,result:{...result,message},events,consumed:cursor});}
  catch(error){results.push({ok:false,error:error instanceof Error?{kind:'Error',message:error.message}:{kind:'Thrown',value:error},events,consumed:cursor});}
 }return results;
}
