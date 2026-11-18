export async function dispatch(call:any) {
 const m=await import('../../../packages/gateway/src/services/email/oauth.ts');
 if(call.op==='nativeemailoauth.env'){
  const keys=['GMAIL_OAUTH_CLIENT_ID','GMAIL_OAUTH_CLIENT_SECRET','OUTLOOK_OAUTH_CLIENT_ID','OUTLOOK_OAUTH_CLIENT_SECRET'];
  const original=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
  try{return call.values.map((v:any)=>{for(const k of keys){if(v.env[k]!==undefined)process.env[k]=v.env[k];else delete process.env[k];}return m.envClientCredentials(v.provider);});}
  finally{for(const k of keys){if(original[k]!==undefined)process.env[k]=original[k];else delete process.env[k];}}
 }
 if(call.op==='nativeemailoauth.authorize')return call.values.map(m.buildAuthorizeUrl);
 if(call.op==='nativeemailoauth.pkce'){
  const {createHash}=await import('node:crypto');
  return {generated:Array.from({length:50},()=>m.createPkce()),expected:call.verifiers.map((s:string)=>createHash('sha256').update(s).digest('base64url'))};
 }
 if(call.op==='nativeemailoauth.http'){
  const fetch0=globalThis.fetch,now=Date.now,requests:any[]=[],results=[];let step:any;
  Date.now=()=>call.now;
  globalThis.fetch=(async(url:any,options:any)=>{
   requests.push({url:String(url),method:options.method,headers:options.headers,body:String(options.body)});
   if(step.error)throw new Error(step.error);
   return {ok:(step.status??200)>=200&&(step.status??200)<300,status:step.status??200,json:async()=>{if(step.invalidJson)throw new Error('invalid JSON');return step.data;}}as any;
  })as any;
  try{
   for(step of call.steps){
    try{
     const v=step.op==='exchange'?await m.exchangeCode({provider:step.provider,credentials:call.credentials,redirectUri:step.redirect,code:step.code,codeVerifier:step.verifier}):
      await m.refreshTokens({provider:step.provider,credentials:call.credentials,refreshToken:step.refresh});
     results.push(v);
    }catch(e:any){results.push({error:e instanceof TypeError?'Invalid provider response shape':e.message});}
   }
   return {results,requests};
  }finally{globalThis.fetch=fetch0;Date.now=now;}
 }
 throw new Error('unknown operation');
}
