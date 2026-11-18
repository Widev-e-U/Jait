/** Actual factory with an explicitly owned monitor port; no terminal starts. */
import {createTerminalExecutionTool} from '../../../packages/gateway/src/tools/terminal-execution.ts';
import {backgroundCommandMonitor} from '../../../packages/gateway/src/services/background-command-monitor.ts';
export async function dispatch(call:any) {
  const tool = createTerminalExecutionTool();
  const {execute, ...metadata} = tool;
  const calls:any[]=[];
  const oldInspect=backgroundCommandMonitor.inspectExecution;
  const oldCancel=backgroundCommandMonitor.cancelExecution;
  let cursor=0;
  const invoke=(action:string,sessionId:string,terminalId:string,executionId:string)=>{
    calls.push({action,sessionId,terminalId,executionId});
    const step=call.responses[cursor++];
    if(step?.error)throw Error(step.error);
    return step?.result ?? undefined;
  };
  backgroundCommandMonitor.inspectExecution=(...args:any[])=>invoke('inspect',...args as [string,string,string]);
  backgroundCommandMonitor.cancelExecution=(...args:any[])=>invoke('cancel',...args as [string,string,string]);
  try {
    const results:any[]=[];
    for(const step of call.steps) {
      try {results.push({value:await execute(step.input,{sessionId:step.sessionId} as any)});}
      catch(error){results.push({error:error instanceof Error?error.message:String(error)});}
    }
    return {metadata,calls,results};
  } finally {
    backgroundCommandMonitor.inspectExecution=oldInspect;
    backgroundCommandMonitor.cancelExecution=oldCancel;
  }
}
