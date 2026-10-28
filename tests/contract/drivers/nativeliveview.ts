/** Execute the actual production lifecycle module; replace only external effects.
 * No Docker, display daemon, real host socket or child is started by this driver. */
import {loadLiveView} from './liveview-fixture-loader.ts';
import {EventEmitter} from 'node:events';
export async function dispatch(call:any){
 const events:any[]=[]; let clock=0,port=6100,spawned=false,reservations=0,children=0;
 const oldNow=Date.now, oldTimeout=globalThis.setTimeout, oldEnv=process.env.JAIT_MAX_CONTAINER_LIVE_VIEW_STARTS;
 const cwd=process.cwd;
 const effect=(v:any)=>{events.push(v);if(call.debug)console.error(v);};
 const reserve=(container:boolean)=>{
  const n=++reservations,p=port++;effect({name:'reserve',container,port:p});
  if(call.reserveFailure===n)throw Error('reserve failed');
  const failure=call.reserveErrors?.[n];if(failure)return (async()=>{for(let i=0;i<failure.ticks;i++)await Promise.resolve();throw Error(failure.message);})();return p;
 };
 const sandboxResult=call.sandbox??{containerName:'fixture-container',vncPort:7001,novncPort:7002,novncUrl:'http://fixture/vnc',cdpUrl:'http://fixture/cdp'};
 const ports:any={};ports.sandbox={
  reserveLocalPort:async()=>reserve(true),
  SandboxManager:class {
   async startBrowserSandbox(request:any){effect({name:'sandboxStart',request});if(call.sandboxFailure)throw Error(call.sandboxFailure);return sandboxResult;}
   async stopContainer(container:string){effect({name:'sandboxStop',container});if(call.stopFailure)throw Error('stop failed');}
  }
 };
 ports.fs={existsSync:(path:string)=>{
  const display=path.split('/X').at(-1)!;const exists=spawned?clock>=(call.readyAt??0):call.allOccupied===true||(call.occupied??[]).includes(display);
  effect({name:'exists',display,exists});return exists;
 }};
 ports.child={spawn:(command:string,args:string[],options:any)=>{
  effect({name:'spawn',command,args,options});const proc:any=new EventEmitter(); const id=++children;
  proc.unref=()=>effect({name:'unref',id});proc.kill=()=>{effect({name:'kill',id});if((call.killFailures??[]).includes(id))throw Error('kill failed');return true;};
  queueMicrotask(()=>{if(call.spawnFailure===command)proc.emit('error',Error(`spawn ${command} failed`));else{spawned=true;proc.emit('spawn');}});return proc;
 }};
 ports.net={createServer:()=>{
  const server:any=new EventEmitter();let p:number;
  server.unref=()=>{};server.listen=(_port:number,_host:string,cb:()=>void)=>{try{p=reserve(false);queueMicrotask(cb);}catch(e){queueMicrotask(()=>server.emit('error',e));}};
  server.address=()=>({port:p});server.close=(cb:any)=>cb();return server;
 }};
 const {startLiveView,stopLiveView}=await loadLiveView(ports);
 Date.now=()=>clock;
 globalThis.setTimeout=((cb:any,ms:number)=>{effect({name:'sleep',ms});clock+=ms;queueMicrotask(cb);return 0;}) as any;
 process.cwd=()=>'/fixture/project';
 if(call.environment==null)delete process.env.JAIT_MAX_CONTAINER_LIVE_VIEW_STARTS;else process.env.JAIT_MAX_CONTAINER_LIVE_VIEW_STARTS=call.environment;
 try{

  let result:any;
  try{
   const session=await startLiveView(call.options);
   const describe=()=>{const {processes,...description}=session;return {...description,processCount:processes.length};};
   result={before:describe()};
   if(call.clearContainerName)session.containerName='';
   if(call.stop!==false){await stopLiveView(session);result.after=describe();}
  }catch(e:any){result={error:e.message};}
  return {result,events};
 }finally{Date.now=oldNow;globalThis.setTimeout=oldTimeout;process.cwd=cwd;if(oldEnv==null)delete process.env.JAIT_MAX_CONTAINER_LIVE_VIEW_STARTS;else process.env.JAIT_MAX_CONTAINER_LIVE_VIEW_STARTS=oldEnv;}
}
