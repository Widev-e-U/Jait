import {getTerminalOutputSlice} from '../../../packages/gateway/src/surfaces/terminal-output.ts';
import {isPowerShellShell,isShellPromptLine} from '../../../packages/gateway/src/tools/shell-prompt.ts';
import {resolveRemoteGitNodeId} from '../../../packages/gateway/src/routes/git-node-routing.ts';
import {llmRequestHeaders} from '../../../packages/gateway/src/services/llm-headers.ts';
function number(value:any,otherwise:any){return value==='NaN'?NaN:value==='Infinity'?Infinity:value==='-Infinity'?-Infinity:value??otherwise}
export async function dispatch(call:any){
  if(call.op==='nativeterminal.slice')return getTerminalOutputSlice(call.buffer,call.count,number(call.offset,0),number(call.end,undefined),number(call.lines,100),call.trim??false);
  if(call.op==='nativeterminal.prompt')return {powershell:isPowerShellShell(call.shell),prompt:isShellPromptLine(call.line,call.shell)};
  if(call.op==='nativeterminal.routing')return resolveRemoteGitNodeId(call.nodes,call.cwd,call.requested,call.local??false);
  if(call.op==='nativeterminal.headers'){
    const configs=call.configs;const ids=new Map<string,string>();let serial=0;
    return call.steps.map((step:any)=>{
      const headers=llmRequestHeaders(configs[step.config],step.session);
      const id=headers['x-opencode-session'];
      if(id&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)){
        if(!ids.has(id))ids.set(id,'generated-'+(++serial));headers['x-opencode-session']=ids.get(id)!;
      }
      return headers;
    });
  }
  throw new Error('unknown terminal operation');
}
