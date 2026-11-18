/** Actual GitHub tool factories; every service and credential value is a fixture. */
import {createAgentGithubTools} from '../../../packages/gateway/src/tools/agent-github-tools.ts';
export async function dispatch(call:any){
 if(call.op==='nativeagentgithub.metadata')return createAgentGithubTools({service:()=>{throw Error('unused')}}).map(({execute,...metadata})=>metadata);
 const results=[];
 for(const test of call.cases){
  const events:any[]=[];let cursor=0;
  const invoke=(name:string,args:any[])=>{
   events.push({name,args:structuredClone(args)});const step=test.steps[cursor++];
   if(!step||step.name!==name)throw Error('Unexpected call: '+name);
   if('error'in step)throw Error(step.error);if('thrown'in step)throw step.thrown;
   return structuredClone(step.value);
  };
  const service=new Proxy({}, {get(_target,name){return(...args:any[])=>invoke(String(name),args);}});
  const deps={service:()=>{invoke('initialize',[]);return service as any;},...(test.resolver?{currentAgentId:(context:any)=>invoke('currentAgentId',[context])}: {})};
  const tool=createAgentGithubTools(deps)[test.token?1:0];
  try{results.push({ok:true,result:await tool.execute(structuredClone(test.input),{userId:test.user,threadId:test.thread}),events,consumed:cursor});}
  catch(error){results.push({ok:false,error:error instanceof Error?{kind:'Error',message:error.message}:{kind:'Thrown',value:error},events,consumed:cursor});}
 }
 return results;
}
