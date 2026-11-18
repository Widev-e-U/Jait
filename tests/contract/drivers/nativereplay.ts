/** The production replay builder; the activity repository is an explicit boundary. */
import {buildThreadHistoryReplayPrompt} from '../../../packages/gateway/src/services/thread-history.ts';
export function dispatch(call:any) {
  if(call.op!=='nativereplay.build')throw new Error('unknown replay operation');
  const calls:any[]=[];
  function observe(name:string,id:string,limit?:number) {
    calls.push(limit===undefined?[name,id]:[name,id,limit]);
    if(call.errorAt===name)throw new Error('fixture source error');
  }
  const source:any={getActivities:(id:string,limit:number)=>{observe('activities',id,limit);return (call.activities??[]).map((a:any)=>({...a,createdAt:new Date(a.createdAtMs).toISOString()}));}};
  if(!call.omitTask)source.getTaskContext=(id:string)=>{observe('task',id);return call.task??null};
  if(!call.omitLocation)source.getById=(id:string)=>{observe('location',id);return call.location??null};
  if(!call.omitExecution)source.getExecutionCheckpoint=(id:string)=>{observe('execution',id);return call.execution??null};
  try{return {prompt:JSON.stringify(buildThreadHistoryReplayPrompt(source,call.id??'thread')),calls}}
  catch{return {error:true,calls}}
}
