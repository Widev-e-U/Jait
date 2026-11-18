import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { GiteaForge, GitHubForge } from '../../../packages/gateway/src/services/git-forge.ts';
export async function forgeWorkflow(call:any) {
  const dir=process.env.JAIT_STATE_DIR!;
  if(call.auth) {
    const bin=join(dir,'bin');await mkdir(bin,{recursive:true});
    await writeFile(join(bin,'gh'),`#!${process.execPath}\nif(process.env.FIXTURE_AUTH_FAIL==='1'){console.error('synthetic rejection '+process.env.GH_TOKEN);process.exit(1);}console.log('fixture-owner');\n`,{mode:0o700});
    const previous=process.env.PATH;process.env.PATH=bin+':'+previous;process.env.FIXTURE_AUTH_FAIL=call.fail?'1':'0';
    try {return await new GitHubForge().loginWithToken(call.token,dir);}
    finally {process.env.PATH=previous;delete process.env.FIXTURE_AUTH_FAIL;}
  }
  const observations:any[]=[];
  const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch:async request=>{
    observations.push({method:request.method,path:new URL(request.url).pathname,authorization:request.headers.get('authorization'),body:await request.json()});
    return Response.json(call.response,{status:call.status ?? 200});
  }});
  const previous=globalThis.fetch;
  globalThis.fetch=((input:any,init:any)=>{
    const url=new URL(String(input));if(url.origin!=='https://forge.invalid')throw new Error('fixture blocked forge network');
    return previous(`http://127.0.0.1:${server.port}${url.pathname}`,init);
  }) as typeof fetch;
  try {
    const remote={provider:'gitea' as const,host:'forge.invalid',normalizedUrl:'https://forge.invalid/owner/repository',owner:'owner',repo:'repository'};
    try {return {result:await new GiteaForge().createPr(dir,remote,call.input,call.token),requests:observations};}
    catch(error:any) {return {error:error.message,requests:observations};}
  } finally {globalThis.fetch=previous;server.stop(true);}
}
