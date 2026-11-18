export async function dispatch(call:any) {
 if(call.op!=='nativearchitecturehttp.http')throw new Error('unknown operation');
 const {openDatabase,migrateDatabase}=await import('../../../packages/gateway/src/db/connection.ts');
 const {UserService}=await import('../../../packages/gateway/src/services/users.ts');
 const {ArchitectureDiagramService}=await import('../../../packages/gateway/src/services/architecture-diagrams.ts');
 const {signAuthToken}=await import('../../../packages/gateway/src/security/http-auth.ts');
 const {loadConfig}=await import('../../../packages/gateway/src/config.ts');
 const {mkdirSync,readFileSync}=await import('node:fs');
 const {createServer}=await import('../../../packages/gateway/src/server.ts');
 const log=console.log;console.log=(...a)=>console.error(...a);
 const {db,sqlite}=await openDatabase(':memory:');let app:any;
 const config={...loadConfig(),jwtSecret:'architecture-fixture',logLevel:'silent' as const};
 try {
  migrateDatabase(sqlite);mkdirSync(call.root,{recursive:true});
  sqlite.exec("INSERT INTO users(id,username,password_hash,created_at,updated_at)VALUES('owner','alice','fixture','old','old'),('other','bob','fixture','old','old');");
  if(call.seed)sqlite.exec(call.seed.replaceAll('$ROOT',call.root));
  app=await createServer(config,{sqlite,userService:new UserService(db),architectureDiagramService:new ArchitectureDiagramService(db)});
  const base=await app.listen({host:'127.0.0.1',port:0});const results=[];
  for(const s of call.steps){
   const headers:any={host:'fixture.local',connection:'close',...s.headers};
   if(s.user)headers.authorization='Bearer '+await signAuthToken({id:s.user,username:s.user==='owner'?'alice':'bob'},config.jwtSecret);
   if(s.cookie)headers.cookie='jait_token='+await signAuthToken({id:s.cookie,username:'alice'},config.jwtSecret);
   let body:any;
   if(s.raw!==undefined)body=s.raw;
   else if('body' in s){body=JSON.stringify(s.body).replaceAll('$ROOT',call.root);headers['content-type']??='application/json';}
   const res=await fetch(base+s.path.replaceAll('$ROOT',encodeURIComponent(call.root)),{method:s.method,headers,body,redirect:'manual'});
   const raw=await res.text();let data:any=raw;try{data=JSON.parse(raw);}catch{}
   results.push({status:res.status,body:data});
  }
  let fileText=null;try{fileText=readFileSync(call.root+'/.jait/architecture.mmd','utf8');}catch{}
  return JSON.parse(JSON.stringify({results,fileText}).replaceAll(call.root,'<root>'));
 }finally{app?.server.closeAllConnections();await app?.close();sqlite.close();console.log=log;}
}
