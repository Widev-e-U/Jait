// Migration-time extraction of immutable prompt prose. Native selection, modes,
// registry and context assembly are implemented in Rust; this is never a runtime dependency.
import * as api from '../../gateway/src/tools/prompts/index.ts';
import * as shared from '../../gateway/src/tools/prompts/shared-sections.ts';
import {SYSTEM_ONE_PROMPT} from '../../gateway/src/services/system-one.ts';
import {writeFileSync,mkdirSync} from 'node:fs';
const root=new URL('../src/prompts/',import.meta.url);mkdirSync(root,{recursive:true});
const definitions=api.promptRegistry.resolvers;
const endpoint=(model,backend)=>({model,backend,baseUrl:'https://fixture.invalid/v1'});
const extra={
  anthropic:{default:endpoint('claude-4.6'),sonnet4:endpoint('claude-sonnet-4'),claude45:endpoint('claude-sonnet-4-5')},
  gemini:{default:endpoint('gemini'),alternate:endpoint('gemini-hidden')},
  gpt5:{default:endpoint('gpt-5'),mini:endpoint('gpt-5-mini')},
};
const data={
  constants:{identity:api.DEFAULT_IDENTITY,safety:api.DEFAULT_SAFETY,reminder:api.DEFAULT_REMINDER,systemOne:SYSTEM_ONE_PROMPT},
  shared:Object.fromEntries(Object.entries(shared).filter(([,v])=>typeof v==='string')),
  modes:Object.fromEntries(['agent','ask','plan','swarm'].map(mode=>[mode,shared.getModeInstructions(mode)])),
  styles:Object.fromEntries(['normal','simple','caveman','caveman-ultra'].map(style=>[style,shared.getResponseStyleInstructions(style)])),
  resolvers:definitions.map(r=>({
    name:r.name,prefixes:r.familyPrefixes,internal:r.isInternalJaitProvider===true,
    variants:Object.fromEntries(Object.entries(extra[r.name]??{default:endpoint('fixture')}).map(([variant,e])=>[variant,{
      system:r.resolveSystemPrompt('agent',e),reminder:r.resolveReminderInstructions?.('agent',e)??null,
      identity:r.resolveIdentityRules?.(e)??null,safety:r.resolveSafetyRules?.(e)??null
    }]))
  }))
};
writeFileSync(new URL('assets.json',root),JSON.stringify(data,null,2)+'\n');
console.log(JSON.stringify({resolvers:data.resolvers.map(r=>r.name),shared:Object.keys(data.shared),bytes:JSON.stringify(data).length}));
