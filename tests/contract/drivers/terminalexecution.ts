/** Rust-owned acceptance cases execute the real tool and monitor; only PTY I/O is injected. */
import { resolveCommandYieldMs } from '../../../packages/gateway/src/lib/command-wait.ts';
import { createTerminalRunTool } from '../../../packages/gateway/src/tools/terminal-tools.ts';
import { createTerminalExecutionTool } from '../../../packages/gateway/src/tools/terminal-execution.ts';
import { backgroundCommandMonitor as monitor } from '../../../packages/gateway/src/services/background-command-monitor.ts';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../../../',import.meta.url));
export async function dispatch(call:any){
 if(call.op==='terminalexecution.wait')return call.cases.map((c:any)=>resolveCommandYieldMs(c.value,c.timeout));
 if(call.op!=='terminalexecution.run')throw Error('unknown terminal execution case');
 monitor.clearForTests();
 const listeners=new Set<(s:string)=>void>(), writes:string[]=[];let stopped=0;
 const surface={id:'terminal',type:'terminal',state:'running',shellIntegrationReady:true,touch(){},
  write(s:string){writes.push(s);},snapshot(){return {metadata:{shell:'/bin/bash'}};},
  addOutputListener(f:any){listeners.add(f);},removeOutputListener(f:any){listeners.delete(f);}};
 const registry={getSurface:()=>surface,async stopSurface(){stopped++;}};
 const context={sessionId:'owner',actionId:'execution-1',projectRoot:root,requestedBy:'test'};
 const notifications:any[]=[];monitor.setCompletionHandler(r=>{notifications.push(r);});
 const tool=createTerminalRunTool(registry as any), inspect=createTerminalExecutionTool();
 const emit=(s:string)=>{for(const f of [...listeners])f(s);};
 try{
  if(call.scenario==='capacity'){
   for(let i=0;i<50;i++)monitor.track({sessionId:'capacity',terminalId:'busy-'+i,command:'held',surface});
   const result=await tool.execute({terminalId:surface.id,command:'build-app',isBackground:true},context);
   return {ok:result.ok,writes:writes.length};
  }
  if(call.scenario==='syntax'){
   const result=await tool.execute({terminalId:surface.id,command:'printf "unfinished'},context);
   return {ok:result.ok,syntaxError:(result.data as any)?.syntaxError,writes:writes.length,active:monitor.activeCount};
  }
  const pending=tool.execute({terminalId:surface.id,command:'build-app',yieldTimeMs:5,isBackground:call.scenario==='startupDeadline',timeout:['deadline','startupDeadline'].includes(call.scenario)?60:5000},context);
  await new Promise(r=>setTimeout(r,2));emit('stage one\r\n');
  const result=await pending;const ids=result.data as any;
  if(call.scenario==='startupDeadline')return {ok:result.ok,timedOut:ids.timedOut,stopped,notifications:notifications.length,active:monitor.activeCount};
  const foreign=await inspect.execute({terminalId:ids.terminalId,executionId:ids.executionId,action:'cancel'},{...context,sessionId:'foreign'});
  const stale=await inspect.execute({terminalId:ids.terminalId,executionId:'previous',action:'cancel'},context);
  emit('stage two\r\n');
  const progress=await inspect.execute({terminalId:ids.terminalId,executionId:ids.executionId,action:'inspect'},context);
  if(call.scenario==='cancel')await inspect.execute({terminalId:ids.terminalId,executionId:ids.executionId,action:'cancel'},context);
  else if(call.scenario==='deadline')await new Promise(r=>setTimeout(r,100));
  else emit('done\r\n\x1b]633;D;0\x07\x1b]633;B\x07');
  emit('\x1b]633;D;0\x07');await Promise.resolve();
  const final=await inspect.execute({terminalId:ids.terminalId,executionId:ids.executionId,action:'inspect'},context);
  return {yielded:ids.yielded,timedOut:ids.timedOut,executionId:ids.executionId,
   progress:(progress.data as any)?.status,partial:(progress.data as any)?.output.includes('stage two'),
   foreign:foreign.ok,stale:stale.ok,final:(final.data as any)?.status,stopped,writes:writes.length,
   notifications:notifications.length,deadlineNotification:notifications[0]?.timedOut??false,active:monitor.activeCount};
 }finally{monitor.clearForTests();}
}
