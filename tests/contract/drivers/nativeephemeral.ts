export async function dispatch(call:any) {
 if(call.op==='nativeephemeral.computer') {
  const {ComputerControlSessionService}=await import('../../../packages/gateway/src/services/computer-control.ts');
  let now=call.now;const service=new ComputerControlSessionService(()=>now,call.leaseMs??1800000);
  const ids:any={},results:any[]=[];
  for(const s of call.steps){
   const id=ids[s.id]??s.id;let value:any=null;
   try{
    if(s.op==='time'){now=s.now;}
    if(s.op==='start')value=service.start(s.owner,s.node);
    if(s.op==='get')value=service.get(id)??null;
    if(s.op==='owned')value=service.requireOwned(id,s.owner);
    if(s.op==='list')value=service.listForOwner(s.owner);
    if(s.op==='stop')value=service.stop(id)??null;
    if(s.alias && value)ids[s.alias]=value.id;
   }catch(e){value={error:(e as Error).message};}
   results.push(value);
  }
  let text=JSON.stringify(results);
  for(const [alias,id]of Object.entries(ids))text=text.replaceAll(id as string,'<'+alias+'>');
  return JSON.parse(text);
 }
 if(call.op==='nativeephemeral.lease') {
  const {claimAssessmentExecution}=await import('../../../packages/gateway/src/security/assessment-lease.ts');
  const releases:any={},results=[];
  try{
   for(const s of call.steps){
    try{if(s.op==='claim'){releases[s.alias]=claimAssessmentExecution(s.id);results.push(true);}
    else{releases[s.alias]();results.push(null);}}
    catch(e){results.push({error:(e as Error).message});}
   }
   return results;
  }finally{for(const release of Object.values(releases)as any[])release();}
 }
 if(call.op==='nativeephemeral.swarm') {
  const m=await import('../../../packages/gateway/src/tools/swarm-mailbox.ts');
  const retain:any={},results=[];
  const old=Date.now;let now=call.now;Date.now=()=>now;
  try{for(const s of call.steps){
   let value:any=null;
   if(s.op==='time')now=s.now;
   if(s.op==='create')m.createSwarmRound(s.id,s.count);
   if(s.op==='end')m.endSwarmRound(s.id);
   if(s.op==='post')value=m.postSwarmMessage(s.id,s.from,s.content);
   if(s.op==='peek')value=m.peekSwarmMessages(s.id);
   if(s.op==='count')value=m.getSwarmParticipantCount(s.id);
   if(s.op==='observe')value=retain[s.alias];
   if(s.retain)retain[s.retain]=value;
   results.push(structuredClone(value));
  }return results;}finally{Date.now=old;for(const s of call.steps)if(s.id)m.endSwarmRound(s.id);}
 }
 if(call.op==='nativeephemeral.inline') {
  const {inlineImageData,embedInlineImages}=await import('../../../packages/gateway/src/services/email/inline-images.ts');
  const {createHash}=await import('node:crypto');
  return call.cases.map((c:any)=>{
   const value=c.html!==undefined?embedInlineImages(c.html,new Map(Object.entries(c.images??{}))as Map<string,string>):inlineImageData(c.type,c.data.repeat(c.repeat??1));
   return value && value.length>200?{length:value.length,sha256:createHash('sha256').update(value).digest('hex')}:value;
  });
 }
 throw new Error('unknown operation');
}
