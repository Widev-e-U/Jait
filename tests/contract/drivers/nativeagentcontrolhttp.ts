import { AgentControlService } from '../../../packages/gateway/src/services/agent-control.ts';
import { registerAgentControlRoutes } from '../../../packages/gateway/src/routes/agent-control.ts';
import { openDatabase, migrateDatabase } from '../../../packages/gateway/src/db/connection.ts';
import { UserService } from '../../../packages/gateway/src/services/users.ts';
import { AuditWriter } from '../../../packages/gateway/src/services/audit.ts';
import { signAuthToken } from '../../../packages/gateway/src/security/http-auth.ts';
import { loadConfig } from '../../../packages/gateway/src/config.ts';

export async function dispatch(call: any) {
  const OriginalDate = Date, log = console.log;
  console.log = (...args) => console.error(...args);
  let now = '2026-10-20T06:00:00.000Z';
  let sqlite: any, app: any;
  try {
    globalThis.Date = class extends OriginalDate {
      constructor(value?: any) { super(value === undefined ? now : value); }
      static override now() { return OriginalDate.parse(now); }
    } as DateConstructor;
    const opened = await openDatabase(':memory:'); sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    sqlite.exec("INSERT INTO users(id,username,password_hash,created_at,updated_at)VALUES('owner','alice','fixture','old','old'),('other','bob','fixture','old','old')");
    if (call.sql) sqlite.exec(call.sql);
    let current: any = {};
    const events: any[] = [];
    let service: AgentControlService;
    service = new AgentControlService(opened.db, {
      stopRunning: async user => {
        events.push({ op:'stop', user, state: service.getState(user) });
        await Promise.resolve();
        if (current.interleaveResume) service.resume(user);
        if ('stopThrow' in current) throw new Error(current.stopThrow);
        return current.stopResult ?? 0;
      },
      onChange: ({userId: user,state}) => {
        events.push({ op:'change',user,state });
        if (current.changeThrow) throw new Error(current.changeThrow);
      },
    });
    const writer = new AuditWriter(opened.db);
    const audit = call.noAudit ? undefined : {
      write(entry: any) {
        if (current.auditThrow) throw new Error('fixture audit failure');
        return writer.write(entry);
      },
    };
    const config = {...loadConfig(),jwtSecret:'agent-control-http-secret',logLevel:'silent' as const};
    const { createServer } = await import('../../../packages/gateway/src/server.ts');
    app = await createServer(config,{sqlite,userService:new UserService(opened.db)});
    registerAgentControlRoutes(app,config,{agentControl:service,audit:audit as any});
    const base = await app.listen({host:'127.0.0.1',port:0});
    const results = [];
    for (const step of call.steps) {
      current = step;
      if (step.now) now = step.now;
      const headers: any = {host:'fixture.local',connection:'close',...step.headers};
      if (step.user) headers.authorization = 'Bearer '+await signAuthToken({id:step.user,username:step.user==='owner'?'alice':'bob'},config.jwtSecret);
      if (step.cookie) headers.cookie = 'jait_token='+await signAuthToken({id:step.cookie,username:'alice'},config.jwtSecret);
      let body: any;
      if ('raw' in step) body = step.raw;
      else if ('body' in step) { body = JSON.stringify(step.body); headers['content-type'] ??= 'application/json'; }
      const res = await fetch(base+step.path,{method:step.method,headers,body,redirect:'manual'});
      const text = await res.text();
      let data: any = text; try { data=JSON.parse(text); } catch {}
      results.push({status:res.status,body:data});
    }
    const rows = sqlite.query('SELECT user_id,halted,reason,halted_at,updated_at FROM agent_control ORDER BY user_id').all();
    const audits = sqlite.query('SELECT action_id,action_type,tool_name,inputs,outputs,status FROM audit_log ORDER BY rowid').all()
      .map((r:any)=>({...r,inputs:r.inputs===null?null:JSON.parse(r.inputs),outputs:r.outputs===null?null:JSON.parse(r.outputs)}));
    return {results,events,rows,audits};
  } finally {
    app?.server.closeAllConnections(); await app?.close(); sqlite?.close();
    globalThis.Date=OriginalDate; console.log=log;
  }
}
