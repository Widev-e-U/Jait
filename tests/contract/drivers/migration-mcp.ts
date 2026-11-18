import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { peer, sdk } from './migration-mcp-peer.ts';
import { ToolRegistry } from '../../../packages/gateway/src/tools/registry.ts';
import { connectMcpServer, callMcpTool, disconnectMcpServer, registerMcpTools, unregisterMcpTools } from '../../../packages/gateway/src/tools/mcp-bridge.ts';
export async function exerciseMcp(call:any) {
  const id='contract-peer';
  const pidFile=join(process.env.JAIT_STATE_DIR!,'mcp-peer.pid');
  const registry=new ToolRegistry();
  const servers:any[]=[];
  let transport:any;
  let http:any;
  if(call.transport==='streamable-http' && !call.missing) {
    const {WebStandardStreamableHTTPServerTransport}=await sdk('server/webStandardStreamableHttp.js');
    transport=new WebStandardStreamableHTTPServerTransport({sessionIdGenerator:()=>crypto.randomUUID(),enableJsonResponse:true});
    const server=await peer(call);servers.push(server);await server.connect(transport);
    http=Bun.serve({hostname:'127.0.0.1',port:0,fetch:request=>transport.handleRequest(request)});
  }
  const listener=call.transport!=='sse' || call.missing ? null : createServer(async(req,res)=>{
    try {
      if(call.transport==='sse') {
        if(req.method==='GET') {
          const {SSEServerTransport}=await sdk('server/sse.js');
          transport=new SSEServerTransport('/messages',res);
          const server=await peer(call);servers.push(server);await server.connect(transport);
        } else await transport.handlePostMessage(req,res);
      }
    } catch {if(!res.headersSent)res.writeHead(500);res.end();}
  });
  if(listener) await new Promise<void>(resolve=>listener.listen(0,'127.0.0.1',resolve));
  const config:any={id,name:'Migration peer',transport:call.transport};
  if(!call.missing) {
    if(call.transport==='stdio') Object.assign(config,{command:process.execPath,args:['--no-env-file',fileURLToPath(new URL('./migration-mcp-peer.ts',import.meta.url)),JSON.stringify(call)],env:{...process.env,JAIT_MCP_PEER_PID:pidFile}});
    else config.url=`http://127.0.0.1:${http?.port ?? (listener!.address() as any).port}/mcp`;
  }
  const observations:any[]=[];
  try {
    for(const step of call.steps) {
      if(step.action==='connect') {
        const c=await connectMcpServer(config); registerMcpTools(registry,c); observations.push(c);
      } else if(step.action==='call') observations.push(await callMcpTool(id,step.name,step.args));
      else if(step.action==='names') observations.push(registry.listNames());
      else if(step.action==='disconnect') {unregisterMcpTools(registry,id);await disconnectMcpServer(id); observations.push(registry.listNames());}
    }
  } finally {
    await disconnectMcpServer(id);
    for(const s of servers) await s.close();
    http?.stop(true);
    if(listener) {listener.closeAllConnections();await new Promise<void>(resolve=>listener.close(()=>resolve()));}
  }
  let childAlive = false;
  let childPid: number | undefined;
  try {
    childPid = Number(readFileSync(pidFile, 'utf8'));
    process.kill(childPid, 0);
    childAlive = true;
  } catch {}
  // Preserve the observed leak as a failing Rust assertion while ensuring a
  // deliberately broken implementation cannot leave this local peer running.
  if (childAlive && childPid) {
    try { process.kill(childPid, 'SIGTERM'); } catch {}
  }
  return {observations, childAlive};
}
export async function exerciseMcpManager(call:any) {
  const {McpManager}=await import('../../../packages/gateway/src/tools/mcp-bridge.ts');
  const {writeFile,access}=await import('node:fs/promises');
  const directory=process.env.JAIT_STATE_DIR!;
  const registry=new ToolRegistry();const manager=new McpManager(registry);
  const payload=(name:string,extra:any={})=>({tools:[{name,inputSchema:{type:'object',properties:{}}}],...extra});
  const config=(data:any)=>({id:'managed',name:'Managed fixture',transport:'stdio' as const,command:process.execPath,args:['--no-env-file',fileURLToPath(new URL('./migration-mcp-peer.ts',import.meta.url)),JSON.stringify(data)],env:process.env as Record<string,string>});
  const observations:any[]=[];
  try {
    if(call.race) {
      const gate=join(directory,'release');const ready=join(directory,'listed');
      manager.addServer(config(payload('removed',{gate,ready})));
      const pending=manager.connect('managed');
      const deadline=Date.now()+5000;
      while(true) {try {await access(ready);break;}catch {if(Date.now()>deadline)throw new Error('peer gate deadline');await Bun.sleep(10);}}
      manager.removeServer('managed');await writeFile(gate,'release');
      observations.push(await pending,registry.listNames(),manager.getStatus());
    } else {
      manager.addServer(config(payload('old')));observations.push(await manager.connect('managed'),registry.listNames());
      manager.addServer(config(payload('new')));observations.push(await manager.connect('managed'),registry.listNames());
      manager.removeServer('managed');observations.push(registry.listNames(),manager.getStatus());
    }
    return observations;
  } finally {manager.removeServer('managed');await disconnectMcpServer('managed');}
}
