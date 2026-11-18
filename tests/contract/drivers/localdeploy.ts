/** Test-only JavaScript reference for the native deployment controller. */
import {VERIFY_STEPS,verifyAndActivate,activateLocal,systemdQuote,overrideUnit,treeDigest} from '../../../scripts/local-deploy.mjs';
export async function dispatch(call:any){
 if(call.op==='localdeploy.steps')return VERIFY_STEPS.map(([id,command,args])=>({id,command,args}));
 if(call.op==='localdeploy.digest')return treeDigest(call.root);
 if(call.op==='localdeploy.quote'){
  try{return {result:call.argv?overrideUnit(call.argv,call.entry):systemdQuote(call.value),error:null};}
  catch(e){return {result:null,error:(e as Error).message};}
 }
 if(call.op==='localdeploy.activate'){
  const events:any[]=[];let failed=false,error:string|null=null;
  const event=(name:string,value?:any)=>{events.push(value===undefined?[name]:[name,value]);if(name===call.fail&&!failed){failed=true;throw Error('injected failure');}};
  try{await activateLocal({override:'/test/local.conf',unitText:'new override',unit:'jait-gateway.service',port:8000,version:'new',previousVersion:'old'},{
   read:async()=>{event('read');if(call.absent)throw Object.assign(Error('absent'),{code:'ENOENT'});return 'old override';},
   backup:async(previous:any)=>event('backup',previous??null),write:async(_path:any,text:string)=>event('write',text),
   remove:async()=>event('remove'),command:async(_program:any,args:string[])=>event(args.includes('restart')?'restart':'reload'),
   health:async(_port:any,version:string)=>event('health',version),
  });}catch(e){error=(e as Error).message;}
  return {events,error};
 }
 const events:string[]=[];let activated=0,fingerprints=0,error:string|null=null;
 try{await verifyAndActivate({fingerprint:async()=>call.drift?String(fingerprints++):'exact-build',runStep:async(id:string)=>{events.push(id);if(id===call.fail)throw Error('failed stage');},activate:async(proof:any)=>{if(proof.checks.length!==VERIFY_STEPS.length)throw Error('incomplete evidence');activated++;}});}catch(e){error=(e as Error).message;}
 return {required:VERIFY_STEPS.map(([id])=>id),events,activated,error};
}
