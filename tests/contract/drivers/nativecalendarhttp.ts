import {openDatabase,migrateDatabase} from '../../../packages/gateway/src/db/connection.ts';
import {UserService} from '../../../packages/gateway/src/services/users.ts';
import {UserSecretService} from '../../../packages/gateway/src/services/user-secrets.ts';
import {CalendarService} from '../../../packages/gateway/src/services/calendar/service.ts';
import {registerCalendarRoutes} from '../../../packages/gateway/src/routes/calendar.ts';
import {signAuthToken} from '../../../packages/gateway/src/security/http-auth.ts';
import {loadConfig} from '../../../packages/gateway/src/config.ts';
export async function dispatch(call:any) {
 const log=console.log;console.log=(...a)=>console.error(...a);
 const realFetch=globalThis.fetch;
 const keys=['JAIT_PUBLIC_URL','GOOGLE_CALENDAR_OAUTH_CLIENT_ID','GOOGLE_CALENDAR_OAUTH_CLIENT_SECRET','GMAIL_OAUTH_CLIENT_ID','GMAIL_OAUTH_CLIENT_SECRET'];
 const before=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 for(const k of keys)delete process.env[k];
 if(call.publicBase!==undefined)process.env.JAIT_PUBLIC_URL=call.publicBase;
 const {db,sqlite}=await openDatabase(':memory:');let app:any;
 const requests:any[]=[];let fetches:any[]=[];const aliases=new Map<string,string>();const starts=new Map<string,string>();
 globalThis.fetch=(async(input:any,options:any={})=>{
  const url=String(input);
  if(url.startsWith('http://127.0.0.1:'))return realFetch(input,options);
  const r:any={url,method:options.method??'GET',headers:options.headers??{}};
  if(options.body!==undefined){const f=new URLSearchParams(String(options.body));if(f.has('code_verifier'))f.set('code_verifier','<verifier>');r.body=f.toString();}
  requests.push(r);
  const res=fetches.shift();if(!res)throw new Error('unexpected provider request');
  if(res.error)throw new Error(res.error);
  return {ok:(res.status??200)>=200&&(res.status??200)<300,status:res.status??200,json:async()=>res.data};
 }) as any;
 function normalize(v:any):any {
  if(typeof v==='string'){for(const [id,name]of aliases)v=v.replaceAll(id,name);return v;}
  if(Array.isArray(v))return v.map(normalize);
  if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,['createdAt','updatedAt','created_at','updated_at','synced_at'].includes(k)?'<time>':normalize(x)]));
  return v;
 }
 function observe(v:any) {
  if(!v||typeof v!=='object')return;
  if(v.id&&v.email&&v.provider)aliases.set(v.id,'$account:'+v.provider+'|'+(v.userId??'')+'|'+v.email);
  for(const x of Object.values(v))if(x&&typeof x==='object'){if(Array.isArray(x))x.forEach(observe);else observe(x);}
 }
 try{
  migrateDatabase(sqlite);
  sqlite.exec("INSERT INTO users(id,username,password_hash,created_at,updated_at)VALUES('owner','alice','fixture','old','old'),('other','bob','fixture','old','old');");
  if(call.seed)sqlite.exec(call.seed);
  const calendar=new CalendarService(db,new UserSecretService(db,'calendar-http-fixture'));
  const config={...loadConfig(),jwtSecret:'calendar-http-secret',logLevel:'silent' as const};
  const {createServer}=await import('../../../packages/gateway/src/server.ts');
  app=await createServer(config,{sqlite,userService:new UserService(db)});
  registerCalendarRoutes(app,config,calendar);
  const base=await app.listen({host:'127.0.0.1',port:0});const results=[];
  for(const s of call.steps){
   if(s.sql){sqlite.exec(s.sql);continue;}
   fetches=s.fetches??[];
   let path=s.path;
   for(const [name,state]of starts)path=path.replaceAll('$state:'+name,encodeURIComponent(state));
   for(const [id,name]of aliases)path=path.replaceAll(name,encodeURIComponent(id));
   const headers:any={host:'fixture.local',connection:'close',...s.headers};
   for(const field of ['user','cookie'])if(s[field]){
    const token=await signAuthToken({id:s[field],username:s[field]==='owner'?'alice':'bob'},config.jwtSecret);
    if(field==='user')headers.authorization='Bearer '+token;else headers.cookie='jait_token='+token;
   }
   let body:any;
   if(s.raw!==undefined)body=s.raw;
   else if('body'in s){body=JSON.stringify(s.body);headers['content-type']??='application/json';}
   const res=await realFetch(base+path,{method:s.method,headers,body,redirect:'manual'});
   const raw=await res.text();let data:any=raw;try{data=JSON.parse(raw);}catch{}
   observe(data);
   if(s.start&&data.authUrl){
    const url=new URL(data.authUrl),state=url.searchParams.get('state')!,challenge=url.searchParams.get('code_challenge')!;
    starts.set(s.start,state);
    data.stateValid=/^[a-zA-Z0-9_-]{32}$/.test(state);data.challengeValid=/^[a-zA-Z0-9_-]{43}$/.test(challenge);
    url.searchParams.set('state','<state>');url.searchParams.set('code_challenge','<challenge>');data.authUrl=url.toString();
   }
   results.push({status:res.status,contentType:res.headers.get('content-type'),body:data});
  }
  const accounts=sqlite.prepare('SELECT * FROM calendar_accounts ORDER BY user_id,email').all();
  for(const r of accounts as any[])aliases.set(r.id,'$account:'+r.provider+'|'+(r.user_id??'')+'|'+r.email);
  const snapshots=sqlite.prepare('SELECT account_id,user_id,calendars,events FROM device_calendar_snapshots ORDER BY user_id').all().map((r:any)=>({...r,calendars:JSON.parse(r.calendars),events:JSON.parse(r.events)}));
  return normalize({results,requests,accounts,snapshots});
 }finally{
  app?.server.closeAllConnections();await app?.close();sqlite.close();globalThis.fetch=realFetch;console.log=log;
  for(const k of keys){if(before[k]===undefined)delete process.env[k];else process.env[k]=before[k];}
 }
}
