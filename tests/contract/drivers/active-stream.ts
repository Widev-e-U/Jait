/** Real shipping HTTP routes; fixture-only provider and gate, no outcome assertions. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

// Finish the ESM dependency before the gateway graph also requires it through
// matrix-bot-sdk. Bun otherwise races the two loading paths.
const gatewayRequire = createRequire(new URL('../../../packages/gateway/package.json', import.meta.url));
await import(gatewayRequire.resolve('htmlparser2'));
const { createServer } = await import('../../../packages/gateway/src/server.ts');
import { loadConfig } from '../../../packages/gateway/src/config.ts';
import { openDatabase, migrateDatabase } from '../../../packages/gateway/src/db/index.ts';
import { UserService } from '../../../packages/gateway/src/services/users.ts';
import { SessionService } from '../../../packages/gateway/src/services/sessions.ts';
import { signAuthToken } from '../../../packages/gateway/src/security/http-auth.ts';
import { ToolRegistry } from '../../../packages/gateway/src/tools/registry.ts';

console.log = (...args) => console.error(...args);
const ready = process.env.JAIT_CONTRACT_READY_FILE!;
const directory = dirname(ready);
// Match managed fixture Git isolation, including the default chat project cwd.
const project = join(directory, 'project');
mkdirSync(join(project, '.git'), {recursive:true});
process.chdir(project);
const encoder = new TextEncoder();
let release = () => {};
let calls = 0;
let mode = "normal";
let producedBytes = 0;
let producerCancelled = false;
const requests: unknown[] = [];
const provider = Bun.serve({ hostname: '127.0.0.1', port: 0, async fetch(request) {
  requests.push(await request.json());
  const round = ++calls;
  if (mode === 'provider-error') return Response.json({error:{message:'synthetic provider failure'}},{status:503});
  if (mode === 'flood') return new Response(new ReadableStream({
    async start(controller) {
      try {
        let seed=0x12345678;
        for(let i=0;i<256 && !producerCancelled;i++) {
          const bytes=Buffer.alloc(32768);
          for(let j=0;j<bytes.length;j++){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;bytes[j]=seed&255;}
          const content=bytes.toString('hex');producedBytes+=content.length;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({choices:[{delta:{content},finish_reason:null}]})}\n\n`));
          await Bun.sleep(3);
        }
        if(!producerCancelled) {controller.enqueue(encoder.encode('data: [DONE]\n\n'));controller.close();}
      } catch {producerCancelled=true;}
    },
    cancel(){producerCancelled=true;}
  }),{headers:{'content-type':'text/event-stream'}});
  return new Response(new ReadableStream({ async start(controller) {
    const send = async (delta: unknown, finish_reason: string | null = null) => {
      const bytes = encoder.encode(`data: ${JSON.stringify({choices:[{delta,finish_reason}]})}\n\n`);
      // Split every UTF-8 code point and SSE delimiter across writes.
      for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
      await Bun.sleep(5);
    };
    try {
      // Install the gate before exposing the token: the client may release as
      // soon as it receives those bytes, while send() is still yielding.
      const gate = round === 1 ? new Promise<void>(resolve => { release = resolve; }) : undefined;
      await send({content: round === 1 ? 'α🙂' : '終'});
      if (round === 1) {
        await gate;
        await send({content:'β'});
        await send({tool_calls:[{index:0,id:'active-proof',type:'function',function:{name:'proof_ok',arguments:'{}'}}]});
        await send({}, 'tool_calls');
      } else await send({}, 'stop');
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    } catch { /* disconnected provider reader */ }
  }}), { headers: {'content-type':'text/event-stream'} });
}});
const networkFetch = globalThis.fetch;
globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
  const url = String(input);
  if (url === 'https://openrouter.ai/api/v1/chat/completions') {
    return networkFetch(`http://127.0.0.1:${provider.port}/completion`, init);
  }
  if (url.startsWith('http://127.0.0.1:')) return networkFetch(input, init);
  throw new Error(`Fixture blocks non-loopback network: ${url}`);
}) as typeof fetch;
const {db, sqlite} = await openDatabase(process.env.JAIT_DB_PATH!);
migrateDatabase(sqlite);
const users = new UserService(db);
const sessions = new SessionService(db);
// Persist fixture identity separately; restart reuses the same user/session/token.
const identityPath = join(directory, 'identity.json');
let identity: {token: string; session: string; foreignToken: string};
if (await Bun.file(identityPath).exists()) identity = await Bun.file(identityPath).json();
else {
  const user = users.createUser('active-stream', 'local-fixture-password');
  users.updateSettings(user.id, {jaitBackend:'openrouter', apiKeys:{OPENROUTER_API_KEY:'local-unused'}});
  const foreign = users.createUser('foreign-stream', 'local-fixture-password');
  identity = {foreignToken:await signAuthToken({id:foreign.id, username:foreign.username}, process.env.JWT_SECRET!), token:await signAuthToken({id:user.id, username:user.username}, process.env.JWT_SECRET!), session:sessions.create({userId:user.id,name:'active stream'}).id};
  writeFileSync(identityPath, JSON.stringify(identity), {mode:0o600});
}
const tools = new ToolRegistry();
tools.register({name:'proof.ok',description:'Local deterministic proof',tier:'core',category:'meta',parameters:{type:'object',properties:{}},execute:async()=>{if(mode==='tool-error')throw new Error('synthetic tool failure');return {ok:true,message:'local-proof'};}});
const app = await createServer({...loadConfig(), port:0,wsPort:0,logLevel:'silent',jwtSecret:process.env.JWT_SECRET!}, {db,sqlite,userService:users,sessionService:sessions,toolRegistry:tools});
app.post('/__fixture/release', async () => { release(); return {calls}; });
app.post('/__fixture/mode', async request => {mode=(request.body as {mode:string}).mode;calls=0;requests.length=0;producedBytes=0;producerCancelled=false;return {mode};});
app.get('/__fixture/requests', async () => ({calls, requests, producedBytes, producerCancelled}));
await app.listen({host:'127.0.0.1',port:0});
writeFileSync(ready, String((app.server.address() as {port:number}).port));
