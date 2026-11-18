/** Local protocol peer; supplies Rust-authored payloads, never expected outcomes. */
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
const require = createRequire(new URL('../../../packages/gateway/package.json', import.meta.url));
const sdk = async (path:string) => import(require.resolve(`@modelcontextprotocol/sdk/${path}`));
export async function peer(payload:any) {
  const {Server}=await sdk('server/index.js');
  const {ListToolsRequestSchema,CallToolRequestSchema}=await sdk('types.js');
  const server=new Server({name:'local-migration-peer',version:'1.0.0'},{capabilities:{tools:{}}});
  server.setRequestHandler(ListToolsRequestSchema,async()=>{
    if(payload.gate) {writeFileSync(payload.ready,'ready');const deadline=Date.now()+5000;while(!await Bun.file(payload.gate).exists()){if(Date.now()>deadline)throw new Error('gate deadline');await Bun.sleep(10);}}
    if(payload.listError) throw new Error('synthetic list failure');
    return {tools:payload.tools};
  });
  server.setRequestHandler(CallToolRequestSchema,async(request:any)=>{
    if(request.params.name==='throw') throw new Error('synthetic call failure');
    return payload.result ?? {content:[{type:'text',text:JSON.stringify(request.params.arguments ?? {})}]};
  });
  return server;
}
export {sdk};
if(import.meta.main) {
  const payload=JSON.parse(process.argv[2]!);
  if(process.env.JAIT_MCP_PEER_PID) writeFileSync(process.env.JAIT_MCP_PEER_PID,String(process.pid));
  const {StdioServerTransport}=await sdk('server/stdio.js');
  const server=await peer(payload);
  await server.connect(new StdioServerTransport());
}
