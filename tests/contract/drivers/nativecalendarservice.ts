/** Test-only reference adapter; inputs and assertions are owned by Rust. */
export async function dispatch(call: any) {
  const { openDatabase, migrateDatabase } = await import('../../../packages/gateway/src/db/connection.ts');
  const { CalendarService } = await import('../../../packages/gateway/src/services/calendar/service.ts');
  const { UserSecretService } = await import('../../../packages/gateway/src/services/user-secrets.ts');
  const { createHash } = await import('node:crypto');
  const log = console.log, realFetch = globalThis.fetch, RealDate = Date;
  const envKeys = ['GOOGLE_CALENDAR_OAUTH_CLIENT_ID','GOOGLE_CALENDAR_OAUTH_CLIENT_SECRET','GMAIL_OAUTH_CLIENT_ID','GMAIL_OAUTH_CLIENT_SECRET'];
  const envBefore = Object.fromEntries(envKeys.map(k=>[k,process.env[k]]));
  let now = call.now, fetches: any[] = [], requests: any[] = [], service: any;
  const aliases = new Map<string,string>(), starts = new Map<string,any>();
  globalThis.Date = class extends RealDate {
    constructor(...args: any[]) { super(...(args.length ? args : [now]) as [any]); }
    static now() { return now; }
  } as DateConstructor;
  console.log = (...a)=>console.error(...a);
  const {db,sqlite} = await openDatabase(':memory:');
  const secrets = new UserSecretService(db,'calendar-service-fixture');
  const resolve = (s: any) => typeof s === 'string' && s.startsWith('$') ? aliases.get(s.slice(1)) ?? s : s;
  globalThis.fetch = (async (url: any, options: any = {}) => {
    const request: any = {url:String(url),method:options.method??'GET',headers:options.headers??{}};
    if(options.body!==undefined) {
      const form=new URLSearchParams(String(options.body));
      if(form.has('code_verifier')) {
        const verifier=form.get('code_verifier')!;
        request.pkceValid=[...starts.values()].some(s=>s.challenge===createHash('sha256').update(verifier).digest('base64url'));
        form.set('code_verifier','<verifier>');
      }
      request.body=form.toString();
    }
    requests.push(request);
    const response=fetches.shift();
    if(!response)throw new Error('unexpected provider request');
    if(response.error)throw new Error(response.error);
    return {ok:(response.status??200)>=200&&(response.status??200)<300,status:response.status??200,
      json:async()=>{if(response.invalidJson)throw new Error('invalid JSON');return response.data;}} as any;
  }) as any;
  function normalize(v:any):any {
    if(typeof v==='string'){for(const [alias,id] of aliases)v=v.replaceAll(id,'$'+alias);return v;}
    if(Array.isArray(v))return v.map(normalize);
    if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,v])=>[k,normalize(v)]));
    return v;
  }
  try {
    for(const key of envKeys) {if(call.env?.[key]!==undefined)process.env[key]=call.env[key];else delete process.env[key];}
    migrateDatabase(sqlite);
    sqlite.exec("INSERT INTO users(id,username,password_hash,created_at,updated_at)VALUES('owner','alice','fixture','old','old'),('other','bob','fixture','old','old');");
    if(call.seed)sqlite.exec(call.seed);
    service=new CalendarService(db,secrets);
    const results=[];
    for(const s of call.steps) {
      fetches=s.fetches??[];
      try {
        let value:any=null;
        switch(s.op) {
          case 'time':now=s.now;break;
          case 'sql':sqlite.exec(s.sql);break;
          case 'restart':service=new CalendarService(db,secrets);break;
          case 'saveApp':service.saveAppCredentials(s.user??null,s.credentials);break;
          case 'secret':secrets.save({...s.params,key:resolve(s.params.key)});break;
          case 'credentials':value=service.resolveCredentials(s.user??null);break;
          case 'configured':value=service.isConfigured(s.user??null);break;
          case 'start':{
            const v=service.startConnect({userId:s.user??null,redirectUri:s.redirect});
            const url=new URL(v.authUrl),state=url.searchParams.get('state')!,challenge=url.searchParams.get('code_challenge')!;
            starts.set(s.alias,{state,challenge});
            url.searchParams.set('state','<state>');url.searchParams.set('code_challenge','<challenge>');
            value={redirectUri:v.redirectUri,authUrl:url.toString(),stateValid:/^[A-Za-z0-9_-]{32}$/.test(state),challengeValid:/^[A-Za-z0-9_-]{43}$/.test(challenge)};break;
          }
          case 'complete':value=await service.completeConnect({code:s.code,state:starts.get(s.start)?.state??s.state});break;
          case 'sync':value=service.syncDeviceCalendar(s.user??null,s.snapshot);break;
          case 'list':value=service.listAccounts(s.user??null);break;
          case 'get':value=service.getAccount(s.user??null,resolve(s.id));break;
          case 'resolve':value=service.resolveAccount(s.user??null,resolve(s.id));break;
          case 'disconnect':value=service.disconnect(s.user??null,resolve(s.id));break;
          case 'calendars':value=await service.listCalendars(s.user??null,resolve(s.id));break;
          case 'events':value=await service.listEvents(s.user??null,resolve(s.id),s.options);break;
          default:throw new Error('unknown step');
        }
        if(s.alias&&value?.id)aliases.set(s.alias,value.id);
        results.push(value);
      }catch(e:any) {
        results.push({error:e instanceof TypeError?'Invalid provider response shape':s.sqlError?'database operation failed':e.message});
      }
    }
    const accounts=sqlite.prepare('SELECT * FROM calendar_accounts').all();
    for(const a of accounts as any[])if(![...aliases.values()].includes(a.id))aliases.set('account:'+a.provider+'|'+(a.user_id??'')+'|'+a.email,a.id);
    const snapshots=sqlite.prepare('SELECT * FROM device_calendar_snapshots').all().map((r:any)=>({...r,calendars:r.calendars,events:r.events}));
    // Values are decrypted without calling getValue, so observations do not mark secrets used.
    const {createDecipheriv,createHash}=await import('node:crypto');
    const key=createHash('sha256').update('jait:user-secrets:calendar-service-fixture').digest();
    const rows=sqlite.prepare('SELECT user_id,type,key,label,encrypted_value,iv,auth_tag,created_at,updated_at,last_used_at FROM user_secrets').all().map((r:any)=>{
      const d=createDecipheriv('aes-256-gcm',key,Buffer.from(r.iv,'base64'));d.setAuthTag(Buffer.from(r.auth_tag,'base64'));
      let text=Buffer.concat([d.update(Buffer.from(r.encrypted_value,'base64')),d.final()]).toString('utf8');
      let value:any=text;try{value=JSON.parse(text);}catch{}
      return {user_id:r.user_id,type:r.type,key:r.key,label:r.label,value,created_at:r.created_at,updated_at:r.updated_at,last_used_at:r.last_used_at};
    });
    const output=normalize({results,requests,accounts,snapshots,secrets:rows});
    for(const r of output.snapshots)for(const k of ['calendars','events'])try{r[k]=JSON.parse(r[k]);}catch{}
    for(const k of ['accounts','snapshots','secrets'])output[k].sort((a:any,b:any)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
    return output;
  }finally {
    globalThis.fetch=realFetch;globalThis.Date=RealDate;console.log=log;sqlite.close();
    for(const k of envKeys){if(envBefore[k]===undefined)delete process.env[k];else process.env[k]=envBefore[k];}
  }
}
