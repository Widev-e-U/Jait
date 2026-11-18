export async function dispatch(call:any) {
 if(call.op==='nativecalendar.env') {
  const {envCalendarCredentials}=await import('../../../packages/gateway/src/services/calendar/oauth.ts');
  const keys=['GOOGLE_CALENDAR_OAUTH_CLIENT_ID','GOOGLE_CALENDAR_OAUTH_CLIENT_SECRET','GMAIL_OAUTH_CLIENT_ID','GMAIL_OAUTH_CLIENT_SECRET'];
  const original=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
  try{return call.values.map((env:any)=>{for(const k of keys){if(env[k]!==undefined)process.env[k]=env[k];else delete process.env[k];}return envCalendarCredentials();});}
  finally{for(const k of keys){if(original[k]!==undefined)process.env[k]=original[k];else delete process.env[k];}}
 }
 if(call.op==='nativecalendar.authorize'){
  const m=await import('../../../packages/gateway/src/services/calendar/oauth.ts');
  return call.values.map(m.buildCalendarAuthorizeUrl);
 }
 if(call.op==='nativecalendar.pkce'){
  const m=await import('../../../packages/gateway/src/services/calendar/oauth.ts');
  const {createHash}=await import('node:crypto');
  const generated=Array.from({length:50},()=>m.createCalendarPkce());
  return {generated,expected:call.verifiers.map((s:string)=>createHash('sha256').update(s).digest('base64url'))};
 }
 if(call.op==='nativecalendar.http'){
  const {GoogleCalendarClient}=await import('../../../packages/gateway/src/services/calendar/google.ts');
  const m=await import('../../../packages/gateway/src/services/calendar/oauth.ts');
  const fetch0=globalThis.fetch,now=Date.now,requests:any[]=[],results=[];
  let step:any;
  Date.now=()=>call.now;
  globalThis.fetch=(async(url:any,options:any={})=>{
   requests.push({url:String(url),method:options.method??'GET',headers:options.headers??{},...(options.body!==undefined?{body:String(options.body)}:{})});
   if(step.error)throw new Error(step.error);
   return {ok:(step.status??200)>=200&&(step.status??200)<300,status:step.status??200,json:async()=>{if(step.invalidJson)throw new Error('invalid JSON');return step.data;}} as any;
  })as any;
  try{
   const client=new GoogleCalendarClient();
   for(step of call.steps){
    try{
     let v;
     if(step.op==='profile')v=await client.getProfileEmail(call.token);
     if(step.op==='calendars')v=await client.listCalendars(call.token);
     if(step.op==='events')v=await client.listEvents(call.token,step.calendar,step.options);
     if(step.op==='exchange')v=await m.exchangeCalendarCode({credentials:call.credentials,redirectUri:step.redirect,code:step.code,codeVerifier:step.verifier});
     if(step.op==='refresh')v=await m.refreshCalendarTokens({credentials:call.credentials,refreshToken:step.refresh});
     results.push(v);
    }catch(e:any){results.push({error:e instanceof TypeError?'Invalid provider response shape':e.message});}
   }
   return {results,requests};
  }finally{globalThis.fetch=fetch0;Date.now=now;}
 }
 throw new Error('unknown operation');
}
