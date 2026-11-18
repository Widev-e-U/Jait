import * as estimates from '../../../packages/gateway/src/tools/token-estimator.ts';
import {extractTodoResultItems} from '../../../packages/gateway/src/providers/todo-result.ts';
export async function dispatch(call:any){
  if(call.op==='nativecontext.todo')return call.cases.map((c:any)=>{try{return extractTodoResultItems(c.name,c.data,c.args);}catch(e){return {error:(e as Error).message};}});
  return call.cases.map((c:any)=>({
    text:estimates.estimateTokens(c.text??''),json:estimates.estimateJsonTokens(c.json),
    messages:c.messages.map(estimates.estimateMessageTokens),history:estimates.estimateHistoryTokens(c.messages),
    schemas:estimates.estimateToolSchemaTokens(c.schemas),
    usage:estimates.computeContextUsage(c.messages,c.schemas,c.window)
  }));
}
