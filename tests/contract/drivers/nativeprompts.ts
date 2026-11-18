/** Prompt comparisons use digests of every UTF-16 unit to keep transport bounded. */
import {createHash} from 'node:crypto';
import {mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
const snapshot=(s:string|null|undefined)=>s==null?null:{length:s.length,sha256:createHash('sha256').update(Buffer.from(s,'utf16le')).digest('hex')};
export async function dispatch(call:any){
  delete process.env.JAIT_SOUL_PATH;delete process.env.JAIT_GLOBAL_INSTRUCTIONS_PATH;
  if(call.soulPath!=null)process.env.JAIT_SOUL_PATH=call.soulPath;
  if(call.legacyPath!=null)process.env.JAIT_GLOBAL_INSTRUCTIONS_PATH=call.legacyPath;
  const state=process.env.JAIT_STATE_DIR!;const home=process.env.HOME!;
  mkdirSync(state,{recursive:true});
  rmSync(join(state,'SOUL.md'),{force:true});
  if(call.global!==undefined)writeFileSync(join(state,'SOUL.md'),call.global);
  for(const file of call.files??[]){
    const base=file.scope==='home'?home:file.scope==='state'?state:process.cwd();
    const path=join(base,file.path);
    if(file.directory){mkdirSync(path,{recursive:true});continue;}
    mkdirSync(join(path,'..'),{recursive:true});
    writeFileSync(path,file.bytes?Buffer.from(file.bytes):file.content);
  }
  const api=await import('../../../packages/gateway/src/tools/prompts/index.ts');
  const sections=await import('../../../packages/gateway/src/tools/prompts/shared-sections.ts');
  if(call.op==='nativeprompts.shared')return {defaults:[api.DEFAULT_IDENTITY,api.DEFAULT_SAFETY,api.DEFAULT_REMINDER].map(snapshot),
    strings:Object.fromEntries(Object.entries(sections).filter(([,v])=>typeof v==='string').map(([k,v])=>[k,snapshot(v as string)])),
    modes:call.modes.map((m:string)=>snapshot(sections.getModeInstructions(m as any))),
    styles:call.styles.map((s:any)=>({valid:sections.isResponseStyle(s),text:snapshot(sections.getResponseStyleInstructions(s))}))
  };
  if(call.op==='nativeprompts.load')return snapshot(api.loadGlobalJaitInstructions());
  for(const custom of call.custom??[]){
    api.promptRegistry.register({
      name:custom.name,familyPrefixes:custom.prefixes??[],
      matchesModel:custom.matcher?(endpoint:any)=>endpoint.model.includes(custom.matcher):undefined,
      resolveSystemPrompt:()=>custom.system??'',
      resolveReminderInstructions:()=>custom.reminder??null,
      resolveIdentityRules:()=>custom.identity??null,
      resolveSafetyRules:()=>custom.safety??null,
      isInternalJaitProvider:custom.internal===true
    });
  }
  return {order:api.promptRegistry.listResolvers(),cases:call.cases.map((c:any)=>{
    const endpoint={model:c.model,baseUrl:c.baseUrl??'https://fixture.invalid/v1',backend:c.backend};
    const r=c.direct?(api.promptRegistry as any).resolvers.find((r:any)=>r.name===c.direct):api.promptRegistry.resolve(endpoint);
    if(c.direct)return {resolver:r.name,matched:r.matchesModel?.(endpoint)??false,prefixes:r.familyPrefixes,internal:r.isInternalJaitProvider===true,raw:snapshot(r.resolveSystemPrompt(c.mode,endpoint)),reminder:snapshot(r.resolveReminderInstructions?.(c.mode,endpoint))};
    return {resolver:r.name,raw:snapshot(r.resolveSystemPrompt(c.mode,endpoint)),
      reminder:snapshot(api.getReminderInstructions(c.mode,endpoint)),
      system:snapshot(api.buildSystemPrompt(c.mode,endpoint,c.context??call.context))};
  })};
}
