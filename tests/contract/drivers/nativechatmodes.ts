import * as source from '../../../packages/gateway/src/tools/chat-modes.ts';
import ts from 'typescript';
import {fileURLToPath} from 'node:url';
function contracts() {
  const path=fileURLToPath(new URL('../../../packages/gateway/src/tools/chat-modes.ts',import.meta.url));
  const program=ts.createProgram([path],{strict:true,noEmit:true,skipLibCheck:true,target:ts.ScriptTarget.ESNext});
  const checker=program.getTypeChecker();const file=program.getSourceFile(path)!;
  const module=checker.getSymbolAtLocation(file)!;
  const exported=checker.getExportsOfModule(module);
  const type=(name:string)=>checker.getDeclaredTypeOfSymbol(exported.find(s=>s.name===name)!);
  const fields=(type:ts.Type)=>type.getProperties().map(p=>({name:p.name,optional:!!(p.flags&ts.SymbolFlags.Optional)}));
  const property=(type:ts.Type,name:string)=>checker.getTypeOfSymbolAtLocation(type.getProperty(name)!,file);
  const strings=(type:ts.Type):string[]=>type.isUnion()?type.types.flatMap(t=>t.isStringLiteral()?[t.value]:[]).sort():[];
  return {plan:fields(type('Plan')),action:fields(type('PlannedAction')),
    result:fields(checker.getNonNullableType(property(type('PlannedAction'),'result'))),
    modes:strings(type('ChatMode')),planStatuses:strings(property(type('Plan'),'status')),
    actionStatuses:strings(property(type('PlannedAction'),'status')),
    actionOrder:checker.typeToString(property(type('PlannedAction'),'order')),
    actionArgs:checker.typeToString(property(type('PlannedAction'),'args'))};
}
export async function dispatch(call:Record<string,any>) {
  switch(call.op) {
    case 'nativechatmodes.policy': return {modes:source.CHAT_MODES,ask:[...source.ASK_MODE_TOOLS],mutating:[...source.MUTATING_TOOLS],swarm:[...source.SWARM_ORCHESTRATION_TOOLS],teams:source.SWARM_TEAMS};
    case 'nativechatmodes.valid': return call.values.map((v:any)=>source.isValidChatMode(v));
    case 'nativechatmodes.prompts': return call.values.map((v:any)=>source.getSystemPromptForMode(v));
    case 'nativechatmodes.roster': return 'teams'in call?source.formatSwarmTeamsRoster(call.teams):source.formatSwarmTeamsRoster();
    case 'nativechatmodes.contracts': return contracts();
    default: throw new Error('unknown nativechatmodes operation');
  }
}
