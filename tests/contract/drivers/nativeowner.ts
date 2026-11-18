export async function dispatch(call:any) {
 if(call.op==='nativeowner.live') {
  const m=await import('../../../packages/gateway/src/security/agent-sandbox-owner.ts');
  return {alive:call.owners.map((s:string)=>m.commandSandboxOwnerAlive(s))};
 }
 const {mock}=await import('bun:test');
 const fs=await import('node:fs'),os=await import('node:os');
 let active:any;
 const kill0=process.kill,env=process.env.JAIT_STATE_DIR;
 mock.module('node:fs',()=>({...fs,
  readFileSync:(path:any)=>{const v=active.files?.[String(path)];if(v===undefined)throw new Error('fixture unavailable');return v;},
  readlinkSync:(path:any)=>{const v=active.links?.[String(path)];if(v===undefined)throw new Error('fixture unavailable');return v;}
 }));
 mock.module('node:os',()=>({...os,hostname:()=>active.hostname??'host'}));
 process.kill=((pid:any,signal:any)=>{
  if(signal!==0)throw new Error('fixture only permits signal zero');
  const result=active.probes?.[String(pid)]??'alive';
  if(result==='alive')return true;
  const e:any=new Error('fixture probe');e.code=result;throw e;
 }) as any;
 try {
  const m=await import('../../../packages/gateway/src/security/agent-sandbox-owner.ts');
  return call.values.map((v:any)=>{
   active=v;process.env.JAIT_STATE_DIR=v.state;
   return {gateway:m.commandSandboxGateway(),alive:v.owners.map((s:string)=>m.commandSandboxOwnerAlive(s))};
  });
 }finally{process.kill=kill0;if(env===undefined)delete process.env.JAIT_STATE_DIR;else process.env.JAIT_STATE_DIR=env;}
}
