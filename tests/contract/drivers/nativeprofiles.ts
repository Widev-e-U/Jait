export async function dispatch(call:any) {
  if(call.op==='nativeprofiles.service') {
    const {openDatabase,migrateDatabase}=await import('../../../packages/gateway/src/db/connection.ts');
    const {AssistantProfileService}=await import('../../../packages/gateway/src/services/assistant-profiles.ts');
    const {db,sqlite}=await openDatabase(':memory:');
    const log=console.log;console.log=(...args)=>console.error(...args);
    const RealDate=Date;
    globalThis.Date=class extends RealDate { constructor(...args:any[]){ super(...(args.length?args:[call.now]) as [any]); } } as DateConstructor;
    try{
      migrateDatabase(sqlite);if(call.seed)sqlite.exec(call.seed);
      const service=new AssistantProfileService(db), ids:any={},results=[];
      for(const step of call.steps){
        const id=ids[step.id]??step.id;
        try{
          let value:any=null;
          if(step.op==='create')value=service.create(step.user,step.input);
          if(step.op==='update')value=service.update(id,step.user,step.input)??null;
          if(step.op==='delete')value=service.delete(id,step.user);
          if(step.op==='get')value=service.getById(id,step.user)??null;
          if(step.op==='list')value=service.list(step.user);
          if(step.op==='sql'){sqlite.exec(step.sql);value=null;}
          if(step.alias && value)ids[step.alias]=value.id;
          results.push(value);
        }catch{results.push({error:'database'});}
      }
      return {results};
    }finally{globalThis.Date=RealDate;sqlite.close();console.log=log;}
  }
  if (call.op === 'nativeprofiles.routes') {
    const { openDatabase, migrateDatabase } = await import('../../../packages/gateway/src/db/connection.ts');
    const { UserService } = await import('../../../packages/gateway/src/services/users.ts');
    const { AssistantProfileService } = await import('../../../packages/gateway/src/services/assistant-profiles.ts');
    const { registerAssistantProfileRoutes } = await import('../../../packages/gateway/src/routes/assistant-profiles.ts');
    const { signAuthToken } = await import('../../../packages/gateway/src/security/http-auth.ts');
    const { loadConfig } = await import('../../../packages/gateway/src/config.ts');
    const { db, sqlite } = await openDatabase(':memory:');
    const log = console.log; console.log = (...args) => console.error(...args);
    const ids: any = {};
    let app: any;
    const profiles = new AssistantProfileService(db);
    const config = { ...loadConfig(), jwtSecret: call.secret ?? 'secrets-fixture', logLevel: 'silent' as const };
    try {
      migrateDatabase(sqlite);
      sqlite.exec("INSERT INTO users(id,username,password_hash,created_at,updated_at) VALUES('owner','alice','fixture','old','old'),('other','bob','fixture','old','old');");
      if (call.seed) sqlite.exec(call.seed);
      const { createServer } = await import('../../../packages/gateway/src/server.ts');
      app = await createServer(config, { sqlite, userService: new UserService(db) });
      registerAssistantProfileRoutes(app, config, profiles);
      const base = await app.listen({ host: '127.0.0.1', port: 0 });
      const results = [];
      for (const step of call.steps) {
        const path = step.path.replace(/\$([^/]+)/g, (_: any, key: any) => ids[key] ?? 'missing');
        const headers: any = { host: 'fixture.local', connection: 'close', ...step.headers };
        if (step.user) headers.authorization = 'Bearer ' + await signAuthToken({ id: step.user, username: step.user === 'owner' ? 'alice' : 'bob' }, config.jwtSecret);
        if (step.cookie) headers.cookie = 'jait_token=' + await signAuthToken({ id: step.cookie, username: 'alice' }, config.jwtSecret);
        let body: any;
        if (step.raw !== undefined) body = step.raw;
        else if ('body' in step) { body = JSON.stringify(step.body); headers['content-type'] ??= 'application/json'; }
        const res = await fetch(base + path, { method: step.method, headers, body, redirect: 'manual' });
        const raw = await res.text();
        let data: any = raw;
        try { data = JSON.parse(raw); } catch {}
        if (step.alias && data.profile) ids[step.alias] = data.profile.id;
        results.push({ status: res.status, body: data });
      }
      return { results };
    } finally {
      app?.server.closeAllConnections();
      await app?.close();
      sqlite.close();
      console.log = log;
    }
  }
throw new Error('unknown driver operation');
}
