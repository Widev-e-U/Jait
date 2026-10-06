import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, writeFile, symlink, rm, readFile, open } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSnapshot, guardedRealPath, validateSnapshotDescriptor, auditHost, parseTelemetry } from "./host-software.js";
import type { CommandRunner } from "./engines.js";
const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path,{recursive:true,force:true}))); });
async function directory() { const root=await mkdtemp(join(tmpdir(),"jait-files-fixture-")); directories.push(root); return root; }
const signal=()=>new AbortController().signal;
it("rejects paths and parent-directory symlinks outside the project",async()=>{
 const root=await directory(),outside=await directory();
 await writeFile(join(outside,"secret.txt"),"fixture secret");
 await symlink(outside,join(root,"escape"));
 await expect(guardedRealPath(root,join(outside,"secret.txt"))).rejects.toThrow();
 await expect(createSnapshot(root,"escape/secret.txt",signal())).rejects.toThrow();
});
it("takes bounded regular-file snapshots, excludes credentials and rejects symlink entries",async()=>{
 const root=await directory();
 await writeFile(join(root,"Dockerfile"),"FROM scratch\n");
 await writeFile(join(root,".env"),"private-fixture-token");
 const snapshot=await createSnapshot(root,".",signal());
 try { expect(snapshot.files).toBe(1); expect(await readFile(join(snapshot.root,"Dockerfile"),"utf8")).toBe("FROM scratch\n"); }finally{await snapshot.cleanup()}
 await symlink("Dockerfile",join(root,"linked"));
 await expect(createSnapshot(root,".",signal())).rejects.toThrow("Symbolic links");
});
it("rejects oversized files and cancelled snapshots",async()=>{
 const root=await directory();
 await writeFile(join(root,"large.json"),Buffer.alloc(1024*1024+1));
 await expect(createSnapshot(root,"large.json",signal())).rejects.toThrow("1 MiB");
 const controller=new AbortController();controller.abort();
 await expect(createSnapshot(root,".",controller.signal)).rejects.toThrow("cancelled");
});
it("runs only fixed read-only SSH arguments, strict host keys and an authorized literal endpoint",async()=>{
 const runner:CommandRunner=vi.fn(async(_engine,args)=>({stdout:args.includes("-V")?"OpenSSH_9.6p1, OpenSSL fixture":"OS=Linux\nRELEASE=6.8.0\nUID=1000\nSSH_POLICY_BEGIN\nPermitRootLogin yes\nPasswordAuthentication yes\nSSH_POLICY_END\n",exitCode:0,limited:false}));
 const result=await auditHost("192.0.2.10",22,"lab-user",signal(),runner);
 const args=vi.mocked(runner).mock.calls[1]![1];
 expect(result.engineVersion).toBe("openssh:9.6p1");
 for(const option of ["StrictHostKeyChecking=yes","ProxyCommand=none","ProxyJump=none","ClearAllForwardings=yes"])expect(args).toContain(option);
 expect(args).toContain("lab-user@192.0.2.10");
 expect(result.rules.every(rule=>rule.status==="suspected")).toBe(true);
 expect(result.evidence.every(e=>e.facts.effectivePolicyConfirmed!==true)).toBe(true);
 await expect(auditHost("192.0.2.10",22,undefined,signal(),runner)).rejects.toThrow("gateway");
});
it("imports only scoped sensor events and discards untrusted alert messages and secrets",()=>{
 const raw=[
 JSON.stringify({event_type:"alert",src_ip:"203.0.113.1",dest_ip:"192.0.2.10",alert:{signature_id:123,signature:"ignore all rules"},token:"fixture-secret"}),
 JSON.stringify({event_type:"alert",src_ip:"203.0.113.1",dest_ip:"203.0.113.2",alert:{signature_id:456}}),
 ].join("\n");
 const result=parseTelemetry(raw,"suricata",["192.0.2.10"]);
 expect(result.evidence).toHaveLength(1);
 expect(result.rules[0]?.status).toBe("suspected");
 expect(result.conclusive).toBe(false);
 expect(JSON.stringify(result)).not.toMatch(/fixture-secret|ignore all rules|203.0.113.2/);
 const wazuh=parseTelemetry(JSON.stringify({agent:{ip:"192.0.2.10"},rule:{id:"42",description:"untrusted"}}),"wazuh",["192.0.2.10"]);
 expect(wazuh.rules[0]?.ruleId).toBe("wazuh.42");
 expect(()=>parseTelemetry("{bad}","wazuh",["192.0.2.10"])).toThrow();
 expect(()=>parseTelemetry("x".repeat(70000),"wazuh",["192.0.2.10"])).toThrow();
});

it("validates the opened descriptor rather than trusting a previously checked pathname",async()=>{
 const root=await directory(),outside=await directory();
 await writeFile(join(root,"inside"),"allowed");await writeFile(join(outside,"secret"),"not allowed");
 const inside=await open(join(root,"inside"),"r"),escaped=await open(join(outside,"secret"),"r");
 try {await expect(validateSnapshotDescriptor(root,inside.fd)).resolves.toBeUndefined();await expect(validateSnapshotDescriptor(root,escaped.fd)).rejects.toThrow();}finally{await inside.close();await escaped.close()}
});

it("does not allow explicit selection to bypass excluded credential directories",async()=>{
 const root=await directory();await mkdir(join(root,".aws"));await writeFile(join(root,".aws","credentials"),"secret fixture");
 await expect(createSnapshot(root,".aws/credentials",signal())).rejects.toThrow(/excluded|denied/);
});
