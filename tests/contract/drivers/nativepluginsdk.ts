/** Actual SDK helpers. Only extension callbacks are fixture implementations. */
import {buildPluginToolSourceMetadata,toPluginToolDefinition,definePlugin} from '../../../packages/gateway/src/plugins/contracts.ts';
export async function dispatch(call:any) {
 if(call.op==='nativepluginsdk.records')return installedRecords;
 if(call.op==='nativepluginsdk.metadata'){
  const execute=async(input:any,context:any)=>({ok:true,message:'fixture',data:{input,context}});
  const tool={...call.tool,execute};
  const result=toPluginToolDefinition(call.plugin,tool);
  return {metadata:buildPluginToolSourceMetadata(call.plugin),definition:result,definitionKeys:Object.keys(result).filter(key=>key!=="execute"),identity:result.execute===execute,inputUnchanged:JSON.stringify(tool)===JSON.stringify(call.tool),executed:await result.execute(call.input,call.context)};
 }
 if(call.op==='nativepluginsdk.lifecycle'){
  const calls:any[]=[];
  const setup=async(context:any)=>{calls.push(['setup',context]);if(call.setupError)throw call.setupError;return call.contribution;};
  const dispose=async()=>{calls.push(['dispose']);if(call.disposeError)throw call.disposeError;};
  const entry:any={id:call.id,displayName:call.displayName,setup,extra:'drop'};
  if(call.customDispose)entry.dispose=dispose;
  const module=definePlugin(entry);
  const result:any={id:module.id,displayName:module.displayName,keys:Object.keys(module),setupIdentity:module.setup===setup,disposeIdentity:call.customDispose?module.dispose===dispose:null,initialCalls:[...calls]};
  try{result.contribution=await module.setup(call.context);}catch(error){result.setupError=error;}
  for(let i=0;i<2;i++){try{await module.dispose();}catch(error){result.disposeError=error;}}
  result.calls=calls;return result;
 }
 throw Error('unknown plugin SDK operation');
}

import type {InstalledPlugin,PluginStatus,PluginToolDeclaration,PluginModule} from '../../../packages/gateway/src/plugins/contracts.ts';
const statuses:PluginStatus[]=['installed','enabled','disabled','error'];
const records:InstalledPlugin[]=statuses.flatMap(status=>{
 const base:InstalledPlugin={id:'fixture',displayName:'Fixture',version:'1.0.0',path:'/fixture',status,config:{nested:[1,true,null]},installedAt:'now',updatedAt:'later'};
 return [base,{...base,error:'failed',author:'A',description:''}];
});
// @ts-expect-error status union is closed
const invalidStatus:PluginStatus='running';
const validTool:PluginToolDeclaration={name:'x',description:'x',parameters:{type:'object',properties:{}},tier:'external',category:'external',risk:'high',defaultConsentLevel:'dangerous',execute:async()=>({ok:true,message:'done'})};
// @ts-expect-error plugin declarations require an explicit risk
const invalidTool:PluginToolDeclaration={...validTool,risk:undefined};
// @ts-expect-error a constructed module requires disposal
const invalidModule:PluginModule={id:'x',displayName:'X',setup:async()=>{}};
void[records,invalidStatus,invalidTool,invalidModule];
export const installedRecords=records;
