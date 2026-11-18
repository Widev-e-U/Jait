import { mkdir, readFile, readdir, writeFile, utimes } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
export async function launchAcp(call:any) {
  const root=join(process.env.JAIT_STATE_DIR!,'acp');
  const install=join(root,'fixture','1','local');
  await mkdir(join(root,'fixture','1'),{recursive:true});
  let downloads=0;
  const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch:()=>{downloads++;return new Response(Buffer.from(call.archiveHex,'hex'),{status:call.httpStatus ?? 200});}});
  const spec={id:'fixture',version:'1',target:'local',archive:'https://contract.invalid/agent.tar',cmd:call.command ?? 'agent',args:call.args ?? [],env:{...call.env,JAIT_ACP_SIGNAL_READY:join(root,'signal-ready')},...(call.sha256?{sha256:call.sha256}:{})};
  if(call.staleLock) {await mkdir(install+'.lock');await utimes(install+'.lock',new Date(0),new Date(0));}
  if(call.invalidMarker) {
    await mkdir(install,{recursive:true});
    await writeFile(join(install,'.jait-acp-install.json'),'{bad');
  }
  const results:any[]=[];
  try {
    for(let i=0;i<(call.repeat ?? 1);i++) {
      const child=Bun.spawn([process.execPath,'--no-env-file',fileURLToPath(new URL('./migration-acp-entry.ts',import.meta.url)),Buffer.from(JSON.stringify(spec)).toString('base64url'),...(call.forwarded ?? [])],{env:{...process.env,JAIT_ACP_BINARY_ROOT:root,JAIT_ACP_TEST_ORIGIN:`http://127.0.0.1:${server.port}/agent.tar`},stdout:'pipe',stderr:'pipe'});
      const timer=setTimeout(()=>child.kill('SIGKILL'),30000);
      try {
        if(call.signal) {
          const deadline=Date.now()+25000;
          while(!await Bun.file(join(root,'signal-ready')).exists()) {if(Date.now()>deadline)throw new Error('agent signal readiness deadline');await Bun.sleep(10);}
          child.kill('SIGTERM');
        }
        const [stdout,stderr,exit]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]);
        results.push({stdout,stderr,exit});
      } finally {clearTimeout(timer);child.kill();}
    }
    return {results,downloads,entries:await readdir(join(root,'fixture','1')),marker:await readFile(join(install,'.jait-acp-install.json'),'utf8').then(JSON.parse).catch(()=>null)};
  } finally {server.stop(true);}
}
