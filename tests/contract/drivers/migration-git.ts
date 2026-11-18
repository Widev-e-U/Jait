import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { GitService, gitExecArgs } from '../../../packages/gateway/src/services/git.ts';
import { registerGitRoutes } from '../../../packages/gateway/src/routes/git.ts';
import { signAuthToken } from '../../../packages/gateway/src/security/http-auth.ts';
const require=createRequire(new URL('../../../packages/gateway/package.json',import.meta.url));
export async function gitWorkflow(call:any) {
  const cwd=join(process.env.JAIT_STATE_DIR!,'repository');await mkdir(cwd,{recursive:true});
  await gitExecArgs(cwd,['init','--initial-branch=main']);
  await gitExecArgs(cwd,['config','user.name','Local Fixture']);await gitExecArgs(cwd,['config','user.email','fixture@invalid.local']);
  await writeFile(join(cwd,'tracked α.txt'),'original\n');
  await gitExecArgs(cwd,['add','--','tracked α.txt']);await gitExecArgs(cwd,['commit','-m','fixture']);
  const git=new GitService();
  const fastify=require('fastify');const app=fastify();
  const secret='migration-local-signing-secret';
  const token=await signAuthToken({id:'owner',username:'owner'},secret);
  const proxied:any[]=[];
  const ws:any={getFsNodes:()=>[{id:'remote',platform:'linux',isGateway:false}],proxyFsOp:async(node:string,op:string,input:any)=>{proxied.push({node,op,input});if(node!=='remote')throw new Error('Node not connected');if(call.remoteError)throw new Error('synthetic remote failure');return {stdout:input.args?.includes('abbrev-ref')?'main\n':''};}};
  registerGitRoutes(app,{jwtSecret:secret} as any,{ws});
  const results:any[]=[];
  try {
    for(const step of call.steps) {
      try {
        switch(step.op) {
          case 'write': await writeFile(join(cwd,step.path),step.content);results.push(null);break;
          case 'stage': await git.stage(cwd,step.paths);results.push(null);break;
          case 'unstage': await git.unstage(cwd,step.paths);results.push(null);break;
          case 'discard': results.push(await git.discardChanges(cwd,step.paths));break;
          case 'read': results.push(await readFile(join(cwd,step.path),'utf8'));break;
          case 'porcelain': results.push(await gitExecArgs(cwd,['status','--porcelain=v1','-z']));break;
          case 'worktree': {
            const path=join(process.env.JAIT_STATE_DIR!,'worktree');
            results.push(await git.createWorktree(cwd,'main','fixture-branch',path,{fastPath:false}));break;
          }
          case 'route': {
            const result=await app.inject({method:'POST',url:step.path,headers:step.anonymous?{}:{authorization:`Bearer ${token}`},payload:{cwd:step.remote?'/synthetic-remote-project':cwd,...step.body}});
            results.push({status:result.statusCode,body:result.json()});break;
          }
          default: throw new Error('unknown git fixture operation');
        }
      } catch(error:any) {results.push({error:error.message});}
    }
    return {results,proxied};
  } finally {await app.close();}
}
