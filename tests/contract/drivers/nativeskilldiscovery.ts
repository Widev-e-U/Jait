/** Real registry and tool exports; files are owned project-local fixtures. */
import { SkillRegistry } from '../../../packages/gateway/src/skills/index.ts';
import { searchInstalledSkills, createSkillDiscoveryTools } from '../../../packages/gateway/src/tools/skill-discovery-tools.ts';
function limit(call: any) {
  if(call.limitKind==='nan')return NaN;
  if(call.limitKind==='infinity')return Infinity;
  if(call.limitKind==='negative-infinity')return -Infinity;
  return call.limit;
}
export async function dispatch(call: any) {
  const skills=(call.skills??[]).map((s:any)=>({source:'project',filePath:'unused',enabled:true,...s}));
  if(call.op==='nativeskilldiscovery.search') {
    return JSON.stringify(searchInstalledSkills(skills,call.query,limit(call)));
  }
  const registry=new SkillRegistry();
  for(const skill of skills)registry.add(skill);
  const tools=createSkillDiscoveryTools(registry);
  if(call.op==='nativeskilldiscovery.metadata')return tools.map(({execute,...metadata})=>metadata);
  if(call.op==='nativeskilldiscovery.tool') {
    const tool=tools.find(t=>t.name===call.tool)!;
    const input={...call.input};
    if(call.tool==='skills.search')input.limit=limit(call);
    return JSON.stringify(await tool.execute(input,{} as any));
  }
  throw new Error('unknown skill discovery operation');
}
