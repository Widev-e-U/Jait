/** Actual core wrapper. Only its explicit inner-factory dependency is isolated. */
import {fileURLToPath} from 'node:url';
const source=fileURLToPath(new URL('../../../packages/gateway/src/tools/core/agent.ts',import.meta.url));
let factory:any;
async function load(){
 if(factory)return factory;
 const built=await Bun.build({entrypoints:[source],target:'bun',plugins:[{name:'core-agent-explicit-port',setup(build){
  build.onResolve({filter:/agent-tools\.js$/},()=>({path:'inner-factory',namespace:'core-agent-fixture'}));
  build.onLoad({filter:/.*/,namespace:'core-agent-fixture'},()=>({contents:'export function createAgentSpawnTool(deps) { return deps.createInner(); }',loader:'js'}));
 }}]});
 if(!built.success)throw new Error('core agent wrapper fixture build failed: '+built.logs.join('\n'));
 const module=await import('data:text/javascript;base64,'+Buffer.from(await built.outputs[0].text()).toString('base64'));
 factory=module.createAgentTool;return factory;
}
function thrown(value:any){return value instanceof Error?{error:value.message}:{value};}
export async function dispatch(call:any){
 const create=await load();const results:any[]=[];
 for(const test of call.cases){
  let constructions=0;const requests:any[]=[];let inner:any;
  const make=()=>{constructions++;if('factoryThrown' in test)throw test.factoryThrown;inner={async execute(input:any,context:any){requests.push({input,context,sameInput:input===test.input,sameContext:context===test.context,sameReceiver:this===inner});if('thrown' in test)throw test.thrown;if(test.error)throw new Error(test.error);return test.response;}};return inner;};
  try{
   const tool=create({createInner:make} as any);const {execute,...metadata}=tool;
   const outcomes=[];
   for(let n=0;n<(test.repeats??1);n++)try{const result=await execute(test.input,test.context);outcomes.push({outcome:result,sameResult:result===test.response});}catch(error){outcomes.push({thrown:thrown(error)});}
   results.push({metadata,constructions,requests,outcomes});
  }catch(error){results.push({factoryThrown:thrown(error),constructions,requests});}
 }
 return results;
}
