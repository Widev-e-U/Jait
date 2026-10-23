import {createCodeGraphTools} from '../../../packages/gateway/src/tools/code-graph-tools.ts';
export async function dispatch(call:any) {
  const events:any[]=[];
  const controller=new AbortController();if(call.aborted)controller.abort();
  const context={...call.context,...(call.signal?{signal:controller.signal}:{})};
  const service:any={};
  for(const method of ['index','query','shortestPath','prepareGraphRag','getIndex']) {
    service[method]=(...args:any[])=>{
      const params=method==='getIndex'?{projectRoot:args[0],userId:args[1]}:args[0];
      const {signal,...plain}=params;
      events.push({method,params:plain,contextSignal:signal===context.signal,aborted:signal?.aborted??null});
      if(call.error)throw Error(call.error);
      if('thrown' in call)throw call.thrown;
      return call.result;
    };
  }
  const tools=createCodeGraphTools(service);
  if(call.op==='nativegraphtools.metadata')return tools.map(({execute,...metadata})=>metadata);
  const tool=tools.find(t=>t.name===call.name)!;
  return {result:await tool.execute(call.input??{},context as any),events};
}
