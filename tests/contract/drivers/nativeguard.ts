import {ExecutionGuard} from '../../../packages/gateway/src/services/execution-guard.ts';
export async function dispatch(call:any){
 return call.cases.map((c:any)=>{
  const guard=new ExecutionGuard(c.checkpoint,c.maxCalls??120,c.windowSize??20);
  const rows=c.steps.map((s:any)=>{
   const reason=s.op==='before'?guard.beforeCall():s.op==='record'?guard.record(s.tool,s.result):undefined;
   return {reason:reason??null,stopReason:guard.stopReason??null,checkpoint:guard.snapshot()};
  });
  return c.finalOnly?rows.slice(-1):rows;
 });
}
