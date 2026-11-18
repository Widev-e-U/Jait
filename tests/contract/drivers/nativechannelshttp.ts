/** Actual routes; all connector effects use an inert stateful host fixture. */
import {createRequire} from 'node:module';
import {registerChannelRoutes} from '../../../packages/gateway/src/routes/channels.ts';
import {signAuthToken} from '../../../packages/gateway/src/security/http-auth.ts';

const requireGateway=createRequire(new URL('../../../packages/gateway/package.json',import.meta.url));
export async function dispatch(call:any){
 const {default:fastify}=await import(requireGateway.resolve('fastify'));
 const {default:cookie}=await import(requireGateway.resolve('@fastify/cookie'));
 // Match createServer transport options without unrelated connector imports.
 const app=fastify({logger:{level:'silent'},logController:new fastify.LogController({disableRequestLogging:false}),maxParamLength:4000,bodyLimit:25*1024*1024});await app.register(cookie);
 let active:any={},config:any=structuredClone(call.config??{enabled:true,token:' fixture-secret '});
 const events:any[]=[],results:any[]=[];
 const record:any={connector:{id:'telegram',currentQr(){effect('currentQr',['telegram']);return active.qr??null;}},status:'stopped',detail:{}};
 function effect(name:string,args:any[]){events.push({name,args});if(active.errorAt===name){if('thrown' in active)throw active.thrown;throw Error(active.error??'host failed');}}
 function update(value:any){record.connector.id=value?.id??'telegram';record.status=value?.status??'stopped';record.detail=value?.detail??{};}
 const manager:any={
  list(){effect('list',[]);return active.list??[{id:'telegram',label:'Telegram',status:record.status,config}];},
  get(id:string){effect('get',[id]);return active.missing?undefined:record;},
  getConfig(id:string){effect('config',[id]);return config;},
  setConfig(id:string,patch:any){effect('setConfig',[id,patch]);return config={...config,...patch};},
  async setupGuide(id:string){effect('setup',[id]);return active.guide;},
  async start(id:string,options:any){effect('start',[id,options]);if(active.after)update(active.after);},
  async stop(id:string){effect('stop',[id]);},
  async pair(id:string,options:any){effect('pair',[id,options]);if(active.after)update(active.after);},
 };
 registerChannelRoutes(app,{jwtSecret:'channels-http-fixture'} as any,manager);
 const base=await app.listen({host:'127.0.0.1',port:0});
 try{for(active of call.steps){
  update(active.state);const headers:any={host:'fixture.local',connection:'close',...active.headers};
  if(active.user){const token=await signAuthToken({id:active.user,username:'alice'},'channels-http-fixture');if(active.cookie)headers.cookie='jait_token='+token;else headers.authorization='Bearer '+token;}
  let payload:any;
  if('raw' in active)payload=active.raw;else if('body' in active){payload=JSON.stringify(active.body);headers['content-type']??='application/json';}
  const reply=await fetch(base+active.path,{method:active.method,headers,body:payload,signal:AbortSignal.timeout(5000)});
  let body:any=await reply.text();try{body=JSON.parse(body);}catch{}
  results.push({status:reply.status,body});
 }return normalize({results,events,config});}finally{app.server.closeAllConnections();await app.close();}
}

// JSON transport cannot decode lone surrogate strings into a Rust String.
// Preserve the exact unit identity in comparison values; production stays raw.
function normalize(v:any):any{
 if(typeof v==='string'&&v.length===1&&v.charCodeAt(0)>=0xd800&&v.charCodeAt(0)<=0xdfff)return '<unit-'+v.charCodeAt(0).toString(16)+'>';
 if(Array.isArray(v))return v.map(normalize);
 if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,normalize(x)]));return v;
}
