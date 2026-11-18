import type {MemoryScope,MemorySource,MemoryEntry,SaveMemoryInput,SearchMemoryInput,MemoryBackend,MemoryService} from '../../../packages/gateway/src/memory/contracts.ts';
import type {SessionDescriptor,SessionRouter} from '../../../packages/gateway/src/sessions/contracts.ts';
import type {SurfaceState,SurfaceStartInput,SurfaceStopInput,SurfaceSnapshot,Surface,SurfaceFactory} from '../../../packages/gateway/src/surfaces/contracts.ts';
const source={type:'fixture',id:'source',surface:'chat'} satisfies MemorySource;
const entry={id:'id',scope:'project',content:'Durable 😀',source,createdAt:'created',updatedAt:'updated'} satisfies MemoryEntry;
const session={id:'id',name:'Session 😀',projectId:'project',createdAt:'created',lastActivityAt:'last'} satisfies SessionDescriptor;
const snapshot={id:'id',type:'fixture',state:'idle',sessionId:'session',metadata:{text:'value',flag:false,count:0,empty:null}} satisfies SurfaceSnapshot;
export const fixtures={
 scopes:['project','contact'] satisfies MemoryScope[],
 sources:[source,{type:'',id:'',surface:''}] satisfies MemorySource[],
 entries:[entry,{...entry,scope:'contact',expiresAt:''}] satisfies MemoryEntry[],
 save:[{scope:'project',content:'',source},{scope:'contact',content:'content',source,expiresAt:'expiry'}] satisfies SaveMemoryInput[],
 sessions:[session,{...session,name:'',projectId:''}] satisfies SessionDescriptor[],
 states:['idle','starting','running','stopping','stopped','error'] satisfies SurfaceState[],
 start:[{sessionId:'session',projectRoot:'/owned'},{sessionId:'session',projectRoot:'/owned',nodeId:'node',custom:{nested:[true,2,null]}}] satisfies SurfaceStartInput[],
 stop:[{},{reason:''},{reason:'stop'}] satisfies SurfaceStopInput[],
 snapshots:[snapshot,{...snapshot,state:'running',startedAt:'started',metadata:{large:9007199254740991,fraction:1.5,negative:-3}}] satisfies SurfaceSnapshot[],
 dates:[new Date(0),new Date(0.9),new Date(-0.9),new Date(-1),new Date(NaN),new Date(8640000000000000),new Date(-8640000000000000),new Date(8640000000000001)],
};
// Type-only function contracts: no fake backend/router/surface behavior is credited.
function signatures(backend:MemoryBackend,memory:MemoryService,router:SessionRouter,surface:Surface,factory:SurfaceFactory) {
 const search:SearchMemoryInput={query:'q',scope:'project',limit:NaN,now:new Date(NaN)};
 const a:Promise<void>=backend.save(entry), b:Promise<void>=backend.update(entry);
 const c:Promise<MemoryEntry[]>=backend.list(), d:Promise<boolean>=backend.forget('id'), e:Promise<number>=backend.forgetExpired(search.now);
 const f:Promise<MemoryEntry>=memory.save(fixtures.save[0]),g:Promise<MemoryEntry[]>=memory.list('contact'),h:Promise<MemoryEntry[]>=memory.search(search.query,search.limit,search.scope);
 const i:Promise<boolean>=memory.forget('id'), j:Promise<number>=memory.forgetExpired(), k:Promise<number>=memory.flushPreCompaction('s',['durable']);
 const l:Promise<SessionDescriptor>=router.create('name','p'),m:Promise<SessionDescriptor[]>=router.list(),n:Promise<void>=router.activate('id'),o:Promise<SessionDescriptor|null>=router.getActive('p');
 const p:Promise<void>=surface.start(fixtures.start[1]),q:Promise<void>=surface.stop(),r:SurfaceSnapshot=surface.snapshot(),s:Surface=factory.create('id');
 const readonlyFields:[string,string,SurfaceState,string|null]=[surface.id,surface.type,surface.state,surface.sessionId];
 surface.onOutput=(data:string)=>{};surface.onStateChange=(state:SurfaceState)=>{};
 void [a,b,c,d,e,f,g,h,i,j,k,l,m,n,o,p,q,r,s,readonlyFields];
 // @ts-expect-error surface state is read-only
 surface.state='running';
}
void signatures;
// @ts-expect-error public memory scopes are closed
const invalidScope:MemoryScope='system';
// @ts-expect-error session ids are strings
const invalidSession:SessionDescriptor={...session,id:42};
// @ts-expect-error snapshot metadata is primitive-only
const invalidSnapshot:SurfaceSnapshot={...snapshot,metadata:{nested:{value:1}}};
// @ts-expect-error callback state is the surface-state union
const invalidCallback:NonNullable<Surface['onStateChange']>=(state:number)=>{};
void [invalidScope,invalidSession,invalidSnapshot,invalidCallback];
export async function dispatch(call:{op:string}) {
 if (call.op==='nativepubliccontracts.fixtures') return fixtures;
 if (call.op==='nativepubliccontracts.exports') return {
  memory:Object.keys(await import('../../../packages/gateway/src/memory/contracts.ts')),
  sessions:Object.keys(await import('../../../packages/gateway/src/sessions/contracts.ts')),
  surfaces:Object.keys(await import('../../../packages/gateway/src/surfaces/contracts.ts')),
 };
 throw new Error('unknown public contract operation');
}
