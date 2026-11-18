import {JAIT_PAGES,JAIT_PAGE_IDS} from '../../../packages/shared/src/capability-catalog.ts';
import {createJaitCatalogTool} from '../../../packages/gateway/src/tools/catalog-tools.ts';
function expand(tool:any){const {parameterRepeat,...out}=tool;if(parameterRepeat)out.parameters={type:'object',properties:{text:{type:'string',description:parameterRepeat.unit.repeat(parameterRepeat.count)}}};return out;}
export async function dispatch(call:any){
 if(call.op==='nativecatalog.data'){const {execute,...metadata}=createJaitCatalogTool({}as any);return {pages:JAIT_PAGES,ids:JAIT_PAGE_IDS,metadata};}
 const results=[];
 for(const test of call.cases){const events:any[]=[],tools=test.tools.map(expand),mcp=test.mcpTools?.map(expand)??tools;
 const registry={list(){events.push({op:'list',mcp:false});return tools;},listForMcp(){events.push({op:'list',mcp:true});return mcp;},search(query:string,options:any){events.push({op:'search',query,candidates:options.candidates.map((t:any)=>t.name),limit:options.limit});return test.searchNames?test.searchNames.flatMap((name:string)=>options.candidates.filter((t:any)=>t.name===name)).slice(0,options.limit):options.candidates.slice().reverse().slice(0,options.limit);}};
 results.push({result:await createJaitCatalogTool(registry as any).execute(test.input,test.context??{}),events});
 }return results;
}
