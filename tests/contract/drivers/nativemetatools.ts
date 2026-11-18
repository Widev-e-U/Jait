import {createToolsListTool,createToolsSearchTool} from '../../../packages/gateway/src/tools/meta-tools.ts';
import {ToolRegistry} from '../../../packages/gateway/src/tools/registry.ts';
const units=(s:string)=>Array.from({length:s.length},(_,i)=>s.charCodeAt(i));
export async function dispatch(call:any){
 if(call.op==='nativemetatools.metadata')return [createToolsListTool({}as any),createToolsSearchTool({}as any)].map(({execute,...metadata})=>metadata);
 const results=[];
 for(const test of call.cases){
  const events:any[]=[];
  const registry=test.real?new ToolRegistry():{
   listForMcp(){events.push({op:'mcp'});return test.mcpTools??test.tools;},
   listInfo(){events.push({op:'info'});return test.tools;},
   async rankSearchWithSystemOne(query:string,options:any,keys:any){events.push({op:'rank',query,...(options.candidates===undefined?{}:{candidates:options.candidates}),limit:options.limit,...(keys===undefined?{}:{keys})});if(test.error)throw Error(test.error);return test.ranked??[];}
  };
  if(test.real){for(const tool of test.tools)registry.register({...tool,execute:async()=>({ok:true,message:'unused'})});registry.rankSearchWithSystemOne=async(query:any,options:any)=>registry.rankSearch(query,options);}
  try{
   const tool=test.tool==='tools.list'?createToolsListTool(registry as any):createToolsSearchTool(registry as any);
   const result=await tool.execute(test.input,test.context??{});result.message=units(result.message);
   results.push({result,events});
  }catch(error){results.push({error:(error as Error).message,events});}
 }return results;
}
