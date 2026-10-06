import { afterEach, expect, it, vi } from "vitest";
import { createSecurityWorkbenchTools } from "./security-workbench-tools.js";
import { getSecurityWorkbench } from "../security/workbench.js";
import { getAssessmentService } from "../security/assessment.js";
import type { SchedulerService } from "../scheduler/service.js";
import type { ToolContext } from "./contracts.js";
const context: ToolContext = {userId:"monitor-owner",requestedBy:"agent",sessionId:"fixture",actionId:"fixture",projectRoot:process.cwd()};
afterEach(()=>vi.restoreAllMocks());
it("binds monitoring to the stored exact target/profile and disables expired scopes",async()=>{
 const scope=getAssessmentService().createScope({targets:["127.0.0.1","127.0.0.2"],exclusions:[],ports:[80,443],methods:["http","tls"],authorized:true,expiresAt:new Date(Date.now()+60_000).toISOString()},"monitor-owner");
 const saved={scopeId:scope.id,profile:"http",target:"127.0.0.1",port:80,minutes:15};
 let job={id:"monitor-job",userId:"monitor-owner",enabled:true,toolName:"security.monitor.tick",input:saved};
 const fake={create:vi.fn(()=>job),update:vi.fn((_id,patch)=>{job={...job,...patch};return job}),get:vi.fn((_id,owner)=>owner===job.userId?job:null)};
 const tools=createSecurityWorkbenchTools(fake as unknown as SchedulerService);
 const schedule=tools.find(t=>t.name==="security.monitor.schedule")!;
 expect(schedule.defaultConsentLevel).toBe("always");
 expect((await schedule.execute({...saved,minutes:1},context)).ok).toBe(false);
 expect((await schedule.execute(saved,context)).ok).toBe(true);
 const service=getSecurityWorkbench();
 const start=vi.spyOn(service,"start").mockReturnValue({id:"monitor-run"} as ReturnType<typeof service.start>);
 vi.spyOn(service,"history").mockReturnValue({runs:[],findings:[]});
 vi.spyOn(service,"wait").mockResolvedValue({id:"monitor-run",status:"completed",coverageGaps:[]} as Awaited<ReturnType<typeof service.wait>>);
 const tick=tools.find(t=>t.name==="security.monitor.tick")!;
 expect((await tick.execute({...saved,monitorJobId:job.id,target:"127.0.0.2",profile:"tls",port:443},context)).ok).toBe(true);
 expect(start.mock.calls[0][0]).toMatchObject(saved);
 expect((await tick.execute({...saved,monitorJobId:job.id},{...context,userId:"other"})).ok).toBe(false);
 vi.spyOn(Date,"now").mockReturnValue(Date.parse(scope.expiresAt)+1);
 expect((await tick.execute({...saved,monitorJobId:job.id},context)).message).toContain("expired");
 expect(fake.update).toHaveBeenLastCalledWith(job.id,{enabled:false},"monitor-owner");
 expect(start).toHaveBeenCalledTimes(1);
});

it("shows saved owned results without rescanning and denies foreign results", async () => {
 const expanded = getSecurityWorkbench();
 const native = getAssessmentService();
 const fakeRun = { id: "saved-expanded", operatorId: context.userId, status: "completed", evidence: [], findings: [] };
 const getExpanded = vi.spyOn(expanded, "get").mockImplementation((id, owner) => {
   if (id === fakeRun.id && owner === context.userId) return fakeRun as ReturnType<typeof expanded.get>;
   throw new Error("Security check not found");
 });
 const getNative = vi.spyOn(native, "getRun").mockImplementation((id, owner) => {
   if (id === "saved-native" && owner === context.userId) return { id, status: "partial", observations: [] } as ReturnType<typeof native.getRun>;
   throw new Error("Assessment not found");
 });
 const startExpanded = vi.spyOn(expanded, "start");
 const startNative = vi.spyOn(native, "start");
 const show = createSecurityWorkbenchTools().find(tool => tool.name === "security.results.show")!;
 expect(show.parameters.required).toEqual(["runId"]);
 expect(await show.execute({ runId: fakeRun.id }, context)).toMatchObject({ ok: true, data: fakeRun });
 expect(await show.execute({ runId: "saved-native" }, context)).toMatchObject({ ok: true, data: { status: "partial" } });
 expect((await show.execute({ runId: fakeRun.id }, { ...context, userId: "other" })).ok).toBe(false);
 expect((await show.execute({ runId: "saved-native" }, { ...context, userId: "other" })).ok).toBe(false);
 expect(getExpanded).toHaveBeenCalledWith(fakeRun.id, context.userId);
 expect(getNative).toHaveBeenCalledWith("saved-native", context.userId);
 expect(startExpanded).not.toHaveBeenCalled();
 expect(startNative).not.toHaveBeenCalled();
});
