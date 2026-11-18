import {mergeJaitCodexConfig,JAIT_CORE_MCP_SERVER_NAME,JAIT_DEFERRED_MCP_SERVER_NAME,JAIT_CORE_CODE_MODE_NAMESPACE,OMNIROUTE_MCP_SERVER_NAME} from '../../../packages/gateway/src/providers/jait-mcp.ts';
export async function dispatch(call:any) {
 if(call.op==='nativemcp.binding'){
  const {providerMcpBinding}=await import('../fixtures/provider-mcp-binding.ts');
  return providerMcpBinding(call.providerType);
 }
 if(call.op==='nativemcp.constants')return [JAIT_CORE_MCP_SERVER_NAME,JAIT_DEFERRED_MCP_SERVER_NAME,JAIT_CORE_CODE_MODE_NAMESPACE,OMNIROUTE_MCP_SERVER_NAME];
 return mergeJaitCodexConfig(call.raw);
}
