import { PtyBrokerClient } from '../../../packages/gateway/src/pty-broker-client.ts';
export async function ptyLifecycle(call:any) {
  const broker=new PtyBrokerClient();const output:string[]=[];let pid:number|undefined;
  let exited:(value:any)=>void=()=>{};
  broker.onOutput=(_id,data)=>output.push(data);
  const exit=new Promise(resolve=>{exited=resolve;});
  broker.onExit=(id,code,signal)=>exited({id,code,signal});
  const alive=(pid:number)=>{try{process.kill(pid,0);return true;}catch{return false;}};
  try {
    await broker.start();
    const child=await broker.spawn({shell:'/bin/sh',cwd:process.env.JAIT_STATE_DIR,env:{PS1:''}});pid=child.pid;
    await broker.resize(child.ptyId,96,24);
    if(call.stopPending) {
      const pending=broker.resize(child.ptyId,80,20).then(()=>({ok:true}),error=>({error:error.message}));
      await broker.stop();const rejected=await pending;
      const deadline=Date.now()+2000;while(alive(pid) && Date.now()<deadline)await Bun.sleep(10);
      return {pending:rejected,childAlive:alive(pid)};
    }
    let missingError='';try{await broker.write('missing','fixture');}catch(error:any){missingError=error.message;}
    await broker.write(child.ptyId,call.command);
    const result=await Promise.race([exit,Bun.sleep(5000).then(()=>{throw new Error('PTY exit deadline');})]);
    return {output:output.join(''),exit:result,missingError};
  } finally {
    await broker.stop();
    if(pid && alive(pid)) {try{process.kill(pid,'SIGKILL');}catch{}}
  }
}
