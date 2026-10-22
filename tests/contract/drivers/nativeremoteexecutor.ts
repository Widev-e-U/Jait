/** Real router and path helper, scripted WS/local execution only. No command runs. */
import {createRemoteToolExecutor,proxyTimeoutMs,resolveRemoteNodeForSession} from '../../../packages/gateway/src/tools/remote-executor.ts';
export async function dispatch(call:any){
 const output=[];
 for(const test of call.cases){
  const events:any[]=[];const chunks:any[]=[];
  const fail=(step:any)=>{if(step && 'error'in step)throw new Error(step.error);if(step && 'thrown'in step)throw step.thrown;};
  const onOutputChunk=(text:any)=>chunks.push(text);
  const context={...test.context,...(test.callback?{onOutputChunk}:{})};
  const ws={
   findNodeByDeviceId(id:any){events.push({op:'find',id});fail(test.findFailure);return test.connected?{id}:undefined;},
   getFsNodes(){events.push({op:'nodes'});fail(test.nodesFailure);return test.nodes??[];},
   registerRemoteBackgroundCommand(args:any){events.push({op:'register',args});return 'unexpected';},
   unregisterRemoteBackgroundCommand(id:any){events.push({op:'unregister',id});},
   async proxyToolOp(node:any,tool:any,input:any,opts:any){const {onOutputChunk:callback,...options}=opts;events.push({op:'proxy',node,tool,input,options,sameCallback:callback===context.onOutputChunk});if(test.chunk && callback)callback(test.chunk);fail(test.proxyFailure);return 'response'in test?test.response:{};}
  };
  const localExecutor=async(tool:any,input:any,ctx:any,options:any)=>{const {onOutputChunk:callback,...contextData}=ctx;events.push({op:'local',tool,input,context:contextData,...(options===undefined?{}:{options}),sameContext:ctx===context,sameCallback:callback===context.onOutputChunk});if(test.chunk && callback)callback(test.chunk);fail(test.localFailure);return 'response'in test?test.response:{};};
  const env={default:process.env.JAIT_TERMINAL_TIMEOUT_MS,max:process.env.JAIT_TERMINAL_TIMEOUT_MAX_MS};
  if(test.policy?.default===undefined)delete process.env.JAIT_TERMINAL_TIMEOUT_MS;else process.env.JAIT_TERMINAL_TIMEOUT_MS=test.policy.default;
  if(test.policy?.max===undefined)delete process.env.JAIT_TERMINAL_TIMEOUT_MAX_MS;else process.env.JAIT_TERMINAL_TIMEOUT_MAX_MS=test.policy.max;
  try {
   let result;
   if(test.kind==='timeout')result=proxyTimeoutMs(test.tool,test.input);
   else if(test.kind==='resolve')result=resolveRemoteNodeForSession(ws as any,test.path,test.projectNodeId);
   else result=await createRemoteToolExecutor({ws:ws as any,localExecutor},test.node??null)(test.tool,test.input,context as any,test.options);
   output.push({result,events,chunks});
  } catch(error){output.push({thrown:error instanceof Error?{error:error.message}:{value:error},events,chunks});}
  finally {for(const [key,value]of [['JAIT_TERMINAL_TIMEOUT_MS',env.default],['JAIT_TERMINAL_TIMEOUT_MAX_MS',env.max]]){if(value===undefined)delete process.env[key!];else process.env[key!]=value;}}
 }
 return output;
}
