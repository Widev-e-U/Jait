/** Real permission exports; no mocks, policy inputs only. Never executes commands. */
import * as permissions from '../../../packages/gateway/src/security/tool-permissions.ts';
export function dispatch(call:any) {
  const p=call.permission??undefined;
  switch(call.op) {
    case 'nativepermission.resolve':return permissions.resolveToolPermission(call.name,new Map(call.entries??[]));
    case 'nativepermission.requires':return permissions.requiresConsent(p,call.trustKind==='nan'?NaN:call.trustKind==='infinity'?Infinity:call.trust??0,new Set(call.approvals??[]));
    case 'nativepermission.command':return permissions.isCommandAllowed(call.value,p);
    case 'nativepermission.path':return permissions.isPathAllowedByPermission(call.value,p);
    case 'nativepermission.classify':return permissions.classifyIrreversibleCommand(call.value);
    case 'nativepermission.glob':return permissions.matchGlob(call.value,call.pattern);
    default:throw new Error('unknown permission op');
  }
}
