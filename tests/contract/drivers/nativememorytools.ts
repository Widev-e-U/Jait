/** Actual factories; explicit memory/reminder services and clock are scripted. */
import * as factories from '../../../packages/gateway/src/tools/memory-tools.ts';
const names={save:'createMemorySaveTool',search:'createMemorySearchTool',forget:'createMemoryForgetTool',hygiene:'createMemoryHygieneTool',review:'createMemoryReviewChatsTool',list:'createMemoryListTool',update:'createMemoryUpdateTool'};
function create(kind:string,memory:any,reminders:any){const fn=(factories as any)[names[kind as keyof typeof names]];return ['hygiene','review','list','update'].includes(kind)?fn(reminders):fn(memory,reminders);}
export function metadata(){return Object.fromEntries(Object.keys(names).map(kind=>{const {execute,...definition}=create(kind,{},{});return [kind,definition]}));}
export async function dispatch(call:any){
 const output=[];
 for(const test of call.cases){
  const events:any[]=[];let cursor=0;
  const port=(op:string,args:any)=>{
   const step=test.steps?.[cursor++]??{};events.push({op,args});
   if('error'in step)throw new Error(step.error);if('thrown'in step)throw step.thrown;
   return 'response'in step?step.response:{};
  };
  const memory={save:(args:any)=>port('memory.save',args),search:(query:any,limit:any,scope:any)=>port('memory.search',{query,limit,scope}),forget:(id:any)=>port('memory.forget',{id})};
  const reminders=test.reminders===false?undefined:{
   create:(args:any)=>port('reminders.create',args),
   list:(args:any)=>port('reminders.list',args),
   delete:(id:any,userId:any)=>port('reminders.delete',{id,userId}),
   update:(id:any,patch:any,userId:any)=>port('reminders.update',{id,patch,userId}),
   runHygiene:(userId:any)=>port('reminders.runHygiene',{userId}),
   scanOldChatsForMemory:(userId:any,limit:any)=>port('reminders.scanOldChatsForMemory',{userId,limit}),
   ...(test.markRetrieved===false?{}:{markRetrieved:(ids:any,userId:any)=>port('reminders.markRetrieved',{ids,userId})})
  };
  const tool=create(test.kind,memory,reminders);const {execute,...definition}=tool;
  const previous=Date.now;Date.now=()=>test.now??1740000000000;
  try {const result=await execute(test.input,{...test.context});result.message=Array.from({length:result.message.length},(_,i)=>result.message.charCodeAt(i));output.push({metadata:definition,result,events});}
  catch(error){output.push({metadata:definition,thrown:error instanceof Error?{error:error.message}:{value:error},events});}
  finally{Date.now=previous;}
 }
 return output;
}
