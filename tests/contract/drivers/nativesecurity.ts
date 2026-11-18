/** Thin reference adapter: only production TypeScript computes observations. */
import { SSRFGuard } from '../../../packages/gateway/src/security/ssrf-guard.ts';
import * as preview from '../../../packages/gateway/src/security/preview-token.ts';
import { createHmac } from 'node:crypto';
type Call = {op:string;raw?:string;allowPrivateHosts?:boolean;allowedHosts?:string[];now?:number;userId?:string;resource?:string;secret?:string;token?:string;payload?:unknown;header?:unknown};
export async function dispatch(call:Call):Promise<unknown> {
  const OriginalDate=globalThis.Date;
  if(call.now!==undefined) {
    const fixed=call.now*1000;
    globalThis.Date=class extends OriginalDate {
      constructor(value?:string|number){super(value===undefined?fixed:value);}
      static now(){return fixed;}
    } as DateConstructor;
  }
  try {
    if(call.op==='nativesecurity.url') {
      try{return {url:new SSRFGuard({allowPrivateHosts:call.allowPrivateHosts,allowedHosts:call.allowedHosts}).validate(call.raw!).href};}
      catch(e){return {error:e instanceof Error?e.message:String(e)};}
    }
    if(call.op==='nativesecurity.previewSign'){
      try{return {token:await preview.signPreviewToken(call.userId!,call.resource!,call.secret!)};}
      catch(e){return {error:e instanceof Error?e.message:String(e)};}
    }
    if(call.op==='nativesecurity.previewVerify')return preview.verifyPreviewToken(call.token!,call.resource!,call.secret!);
    if(call.op==='nativesecurity.previewFixture') {
      const data=Buffer.from(JSON.stringify(call.header??{alg:'HS256'})).toString('base64url')+'.'+Buffer.from(JSON.stringify(call.payload)).toString('base64url');
      const token=data+'.'+createHmac('sha256',call.secret!).update(data).digest('base64url');
      return {token,userId:await preview.verifyPreviewToken(token,call.resource!,call.secret!)};
    }
    throw new Error('unknown native security operation');
  } finally {globalThis.Date=OriginalDate;}
}
