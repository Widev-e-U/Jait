/** Real Fastify server/SQLite reference; Rust owns requests and expected comparisons. */
import { createServer } from '../../../packages/gateway/src/server.ts';
import { loadConfig } from '../../../packages/gateway/src/config.ts';
import { openDatabase,migrateDatabase } from '../../../packages/gateway/src/db/connection.ts';
import { UserService } from '../../../packages/gateway/src/services/users.ts';
import { signAuthToken } from '../../../packages/gateway/src/security/http-auth.ts';
import { isAllowedRequestOrigin } from '../../../packages/gateway/src/security/request-origin.ts';
import { scryptSync } from 'node:crypto';
type Step={method:string;path:string;body?:unknown;raw?:string;user?:string;headers?:Record<string,string>;mutate?:string;};
type Call={op:string;seed?:string;empty?:boolean;steps?:Step[];tools?:unknown[];origin?:string;host?:string;cors?:string;};
export async function dispatch(call:Call):Promise<unknown> {
  if (call.op==='nativehttp.origin') return isAllowedRequestOrigin({origin:call.origin,host:call.host},{corsOrigin:call.cors??''});
  if (call.op!=='nativehttp.auth') throw new Error('unknown native HTTP operation');
  const {db,sqlite}=await openDatabase(':memory:');
  const log=console.log;console.log=(...args)=>console.error(...args);
  let app:Awaited<ReturnType<typeof createServer>>|undefined;
  try {
    migrateDatabase(sqlite);
    const hash='scrypt$0123456789abcdef$'+scryptSync('password 🦀','0123456789abcdef',64).toString('hex');
    if (!call.empty) {
      const insert=sqlite.prepare('INSERT INTO users(id,username,password_hash,created_at,updated_at) VALUES(?,?,?,?,?)');
      insert.run('owner','alice',hash,'2026-01-01','2026-01-01');
      insert.run('other','bob',hash,'2026-01-02','2026-01-02');
    }
    if(call.seed)sqlite.exec(call.seed);
    const config={...loadConfig(),jwtSecret:'http-fixture-secret',corsOrigin:call.cors??'',logLevel:'silent' as const};
    app=await createServer(config,{sqlite,userService:new UserService(db),...(call.tools?{toolRegistry:{listInfo:()=>call.tools,list:()=>[]} as any}:{})});
    const address=await app.listen({host:"127.0.0.1",port:0});
    const results=[];
    for(const step of call.steps??[]) {
      if(step.mutate)sqlite.exec(step.mutate);
      const headers:Record<string,string>={host:'fixture.local',connection:'close',...step.headers};
      if(step.user)headers.authorization='Bearer '+await signAuthToken({id:step.user,username:step.user==='owner'?'alice':'bob'},config.jwtSecret);
      let payload:string|undefined;
      if(step.raw!==undefined)payload=step.raw;
      else if(step.body!==undefined){payload=JSON.stringify(step.body);headers['content-type']??='application/json';}
      const res=await fetch(address+step.path,{method:step.method,headers,body:payload,redirect:'manual'});
      const raw=await res.text();
      let body:unknown=raw;
      try{body=JSON.parse(raw);}catch{}
      const cookies=res.headers.getSetCookie();
      results.push({status:res.status,body,cookie:cookies.length?cookies:null});
    }
    return {results,hash,users:sqlite.prepare('SELECT id,username FROM users ORDER BY username').all(),
      sessions:sqlite.prepare('SELECT id,user_id FROM sessions ORDER BY id').all()};
  }finally{
    // All response bodies are consumed above. Destroy fixture-owned sockets before
    // closing: Bun can retain a connection rejected before reading its request body.
    // Do not change server hooks, request assertions, or the driver deadline.
    app?.server.closeAllConnections();
    try{await app?.close();}finally{sqlite.close();console.log=log;}
  }
}
