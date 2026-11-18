import {homedir} from 'node:os';
import * as auth from '../../../packages/gateway/src/providers/provider-auth.ts';
import {hasCompleteDeviceAuthDetails} from '../../../packages/shared/src/provider-auth.ts';
function units(s:string){return Array.from({length:s.length},(_,i)=>s.charCodeAt(i));}
function serialize(r:any,failed=false){return {...r,message:failed?'<spawn-error>':r.message,...(r.rawOutput===undefined?{}:{rawOutput:units(r.rawOutput)})};}
export async function dispatch(c:any){
 switch(c.op){
  case 'nativeproviderauth.parse':return auth.parseCommandLine(c.line);
  case 'nativeproviderauth.ansi':return auth.stripAnsi(c.text);
  case 'nativeproviderauth.details':{const d=auth.extractDeviceAuthDetails(c.text);return {details:d,complete:hasCompleteDeviceAuthDetails(d)};}
  case 'nativeproviderauth.unsupported':return [auth.NO_PROVIDER_AUTH,auth.DEVICE_PROVIDER_AUTH,auth.SHADOWED_GITHUB_COPILOT_TOKEN_ENV_VARS,auth.unsupportedLogin(c.provider,c.message),auth.unsupportedLogout(c.provider,c.message)];
  case 'nativeproviderauth.env':{
   const previous={...process.env};for(const key of Object.keys(process.env))delete process.env[key];Object.assign(process.env,c.inherited);
   try {const overrides={...c.overrides};for(const k of c.undefined??[])overrides[k]=undefined;return {env:auth.buildProviderAuthEnv(overrides,c.unset),home:homedir()};}
   finally{for(const key of Object.keys(process.env))delete process.env[key];Object.assign(process.env,previous);}
  }
  case 'nativeproviderauth.stripenv':{const env={...c.env};const out=auth.stripEnvVars(env,c.unset);return {env:out,same:env===out};}
 }
 const opts={providerId:'fixture',label:'Fixture',commandLine:c.commandLine??'node',args:c.args??['-e',c.script],timeoutMs:c.timeout??3000,env:c.env,unsetEnv:c.unset};
 if(c.op==='nativeproviderauth.run')return serialize(await auth.runAuthCommand(opts.providerId,opts.commandLine,opts.args,opts.timeoutMs,opts.env,opts.unsetEnv),c.spawnFailure);
 const {result,child}=await auth.startDeviceLoginCommand(opts);
 try {
  if(child&&c.input){child.stdin?.write(c.input);}
  const value={result:serialize(result,c.spawnFailure),child:!!child};
  if(child){child.kill();await new Promise<void>(resolve=>{if(child.exitCode!==null||child.signalCode!==null)resolve();else child.once('exit',()=>resolve());});}
  return value;
 }finally{if(child)child.kill();}
}
