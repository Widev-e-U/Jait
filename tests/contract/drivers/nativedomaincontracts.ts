import type { TrustLevel, ConsentRequest, ConsentDecision, AuditRecord, SecurityService } from '../../../packages/gateway/src/security/contracts.ts';
import type { ScheduledJob, SchedulerService } from '../../../packages/gateway/src/scheduler/contracts.ts';
const request = { actionId: '', toolName: 'fixture', summary: 'Consent 😀', risk: 'low', createdAt: 'created' } satisfies ConsentRequest;
const decision = { actionId: '', approved: false, decidedAt: 'decided', decidedBy: 'owner' } satisfies ConsentDecision;
const audit = { actionId: '', sessionId: 's', toolName: 'fixture', status: 'started', input: '', timestamp: 'time' } satisfies AuditRecord;
const job = {id:'id',name:'Job',cron:'* * * * *',enabled:false,createdAt:'created',updatedAt:'updated'} satisfies ScheduledJob;
export const fixtures = {
  trust:[0,1,2,3] satisfies TrustLevel[],
  requests:[request,{...request,risk:'medium',expiresAt:''},{...request,risk:'high',expiresAt:'expiry'}] satisfies ConsentRequest[],
  decisions:[decision,{...decision,approved:true,reason:''},{...decision,reason:'declined'}] satisfies ConsentDecision[],
  audit:[audit,{...audit,status:'completed',output:''},{...audit,status:'failed',output:'failure'}] satisfies AuditRecord[],
  jobs:[job,{...job,enabled:true,name:''}] satisfies ScheduledJob[],
  create:[{name:'Job',cron:'',enabled:false},{name:'',cron:'*/5 * * * *',enabled:true}] satisfies Parameters<SchedulerService['create']>[0][],
};
// These remain compile-time contracts. No fake engine behavior is used as implementation evidence.
const security = {requestConsent: async (_request: ConsentRequest) => decision as ConsentDecision | null, recordAudit: async (_record: AuditRecord) => {}, getTrustLevel: async (_id: string) => 0 as TrustLevel} satisfies SecurityService;
const scheduler = {create: async (_job: Parameters<SchedulerService['create']>[0]) => job, list: async () => [job], remove: async (_id: string) => false, trigger: async (_id: string) => {}} satisfies SchedulerService;
void security; void scheduler;
// @ts-expect-error trust levels are a bounded numeric literal union
const invalidTrust: TrustLevel = 4;
// @ts-expect-error scheduled job creation omits generated identifiers
const invalidCreate: Parameters<SchedulerService['create']>[0] = {...fixtures.create[0], id:'forbidden'};
void invalidTrust; void invalidCreate;
export async function dispatch(call: {op:string}) {
  if (call.op === 'nativedomaincontracts.fixtures') return fixtures;
  if (call.op === 'nativedomaincontracts.exports') {
    const base = '../../../packages/gateway/src/';
    return {security:Object.keys(await import(`${base}security/contracts.ts`)), scheduler:Object.keys(await import(`${base}scheduler/contracts.ts`))};
  }
  throw new Error('unknown domain contract operation');
}
