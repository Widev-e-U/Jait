/** Real HTTP/auth/route handlers; required installer and checker are fixture ports. */
import { mock } from 'bun:test';
let current: any = {}, events: unknown[] = [];
const skills = await import('../../../packages/gateway/src/skills/index.ts');
mock.module('../../../packages/gateway/src/skills/index.ts', () => ({...skills, checkSkillTools(skill: any) {
  events.push({check:skill.id});
  if (current.checkThrow) throw new Error(current.checkThrow);
  return current.tools?.[skill.id] ?? {satisfied:true, missing:[]};
}}));
const installers = await import('../../../packages/gateway/src/skills/install.ts');
mock.module('../../../packages/gateway/src/skills/install.ts', () => ({...installers, async installSkillTool({skill,installId}:any) {
  events.push({install:skill.id,...(installId !== undefined ? {installId} : {})});
  await Promise.resolve();
  if (current.installThrow) throw current.throwString ? current.installThrow : new Error(current.installThrow);
  Object.assign(skill,current.afterInstall ?? {});
  return current.installResult ?? {ok:true,package:'fixture-package',output:'fixture output'};
}}));
export async function dispatch(call:any) {
  if (call.op !== 'nativeskillhttp.routes') throw new Error('unknown skill route operation');
  const {openDatabase,migrateDatabase} = await import('../../../packages/gateway/src/db/connection.ts');
  const {UserService} = await import('../../../packages/gateway/src/services/users.ts');
  const {signAuthToken} = await import('../../../packages/gateway/src/security/http-auth.ts');
  const {loadConfig} = await import('../../../packages/gateway/src/config.ts');
  const {createServer} = await import('../../../packages/gateway/src/server.ts');
  const {db,sqlite} = await openDatabase(':memory:'); let app:any;
  const registry = new skills.SkillRegistry(); for (const skill of call.skills ?? []) registry.add(skill);
  const log = console.log; console.log = (...a) => console.error(...a); events=[];
  const config={...loadConfig(),jwtSecret:'skill-http-fixture',logLevel:'silent' as const};
  try {
    migrateDatabase(sqlite);
    sqlite.exec("INSERT INTO users(id,username,password_hash,created_at,updated_at)VALUES('owner','alice','fixture','old','old'),('other','bob','fixture','old','old')");
    app=await createServer(config,{sqlite,userService:new UserService(db),skillRegistry:registry});
    const base=await app.listen({host:'127.0.0.1',port:0}); const results=[];
    for (const step of call.steps) {
      current=step;
      const headers:any={host:'fixture.local',connection:'close',...step.headers};
      if(step.user)headers.authorization='Bearer '+await signAuthToken({id:step.user,username:step.user==='owner'?'alice':'bob'},config.jwtSecret);
      if(step.cookie)headers.cookie='jait_token='+await signAuthToken({id:step.cookie,username:'alice'},config.jwtSecret);
      let body:any;
      if(step.raw !== undefined)body=step.raw;
      else if('body' in step){body=JSON.stringify(step.body);headers['content-type']??='application/json';}
      const res=await fetch(base+step.path,{method:step.method,headers,body,redirect:'manual'});
      const raw=await res.text(); let data:any=raw; try{data=JSON.parse(raw);}catch{}
      results.push({status:res.status,body:data});
    }
    return {results,events,skills:registry.list()};
  } finally {app?.server.closeAllConnections();await app?.close();sqlite.close();console.log=log;}
}
