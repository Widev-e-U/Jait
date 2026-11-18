/** Actual profile exports, isolated module identity; no tool execution. */
import {pathToFileURL,fileURLToPath} from 'node:url';
const source=fileURLToPath(new URL('../../../packages/gateway/src/security/tool-profiles.ts',import.meta.url));
export async function dispatch(call:any) {
  const profile=await import(pathToFileURL(source).href+'?native-profile='+crypto.randomUUID());
  const maps=new Map<string,Map<string,any>>(),overrides=new Map<string,any[]>(),serialized=new Map<string,any>();
  const results:any[]=[];
  for(const step of call.steps) {
    try {
      let value:any;
      switch(step.op) {
        case 'names':value=profile.listProfiles();break;
        case 'get':maps.set(step.alias,profile.getProfile(step.name));value=null;break;
        case 'serialize':value=profile.serializeProfile(step.name);break;
        case 'hold':serialized.set(step.alias,profile.serializeProfile(step.name));value=null;break;
        case 'held':value=serialized.get(step.alias);break;
        case 'overrides':overrides.set(step.alias,step.permissions);value=null;break;
        case 'extend':maps.set(step.alias,profile.extendProfile(step.name,overrides.get(step.overrides)??[]));value=null;break;
        case 'snapshot':value=[...maps.get(step.alias)!.entries()];break;
        case 'remove':value=maps.get(step.alias)!.delete(step.key);break;
        case 'mutate':Object.assign(maps.get(step.alias)!.get(step.key)!,step.patch);value=null;break;
        case 'mutateOverride':Object.assign(overrides.get(step.alias)![step.index],step.patch);value=null;break;
        default:throw new Error('unknown profile step');
      }
      results.push(structuredClone(value));
    }catch(error:any){results.push({error:error.message});}
  }
  return results;
}
