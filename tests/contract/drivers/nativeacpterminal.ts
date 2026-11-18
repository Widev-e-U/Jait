import {AcpTerminal} from '../../../packages/gateway/src/providers/acp-terminal.ts';
import {extractCompletionOutput} from '../../../packages/gateway/src/services/background-command-monitor.ts';
function units(s:string){return Array.from({length:s.length},(_,i)=>s.charCodeAt(i));}
function text(v:number[]){return v.map(u=>String.fromCharCode(u)).join('');}
function number(v:any){return v==='NaN'?NaN:v==='Infinity'?Infinity:v==='-Infinity'?-Infinity:v;}
export async function dispatch(call:any) {
 if(call.op==='nativeacpterminal.cleanup')return units(extractCompletionOutput(call.units?text(call.units):call.raw,call.command??'',call.shell??''));
 const before=Date.now();
 const t=new AcpTerminal({
  command:call.command??'node',args:call.args??['-e',call.script],cwd:call.cwd,
  env:call.env,outputByteLimit:number(call.limit),
 });
 const startedValid=Number.isInteger(t.startedAt)&&t.startedAt>=before&&t.startedAt<=Date.now();
 let timer:any;
 try {
  if(call.stop){
   const deadline=Date.now()+5000;
   while(!t.currentOutput().output.includes('READY')){
    if(Date.now()>deadline)throw new Error('fixture READY missing');
    await new Promise(resolve=>setTimeout(resolve,2));
   }
   if(call.stop==='kill'){t.kill();t.kill();}else{t.release();t.release();}
  }
  const exit=await Promise.race([t.waitForExit(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('ACP exit wait did not settle')),6000);})]);
  const completion=await t.waitForCompletion();
  const repeated=await t.waitForExit();
  t.kill();t.release();t.release();
  const output=t.currentOutput();
  function clean(s:string){return call.spawnFailure?s.replace(/\[terminal error: [\s\S]*\]$/,'[terminal error: <spawn-error>]'):s;}
  return {command:t.command,startedValid,running:t.isRunning,exit,repeated,output:{...output,output:units(clean(output.output))},completion:{...completion,output:units(clean(completion.output))}};
 }finally{clearTimeout(timer);t.release();}
}
