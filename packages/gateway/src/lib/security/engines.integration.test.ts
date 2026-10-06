import { afterEach, describe, expect, it } from "vitest";
import { createServer } from "node:http";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { engineStatus, scanNmap, scanNuclei, runCommand } from "./engines.js";
import { scanSoftware } from "./host-software.js";
const cleanup:Array<()=>Promise<void>>=[];
afterEach(async()=>{await Promise.all(cleanup.splice(0).map(fn=>fn()))});
const signal=()=>new AbortController().signal;
describe.skipIf(process.env.JAIT_TEST_SECURITY_ENGINES!=="1")("installed scanner adapters",()=>{
 it("checks real versions and Nmap TCP XML on an owned loopback fixture",async()=>{
  const status=await engineStatus(signal());expect(status.every(engine=>engine.available)).toBe(true);
  const server=createServer((_request,response)=>response.end("fixture"));
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));cleanup.push(()=>new Promise(resolve=>server.close(()=>resolve())));
  const address=server.address();if(!address||typeof address==="string")throw new Error("Expected port");
  const result=await scanNmap(["127.0.0.1"],[address.port],signal());
  expect(result.conclusive).toBe(true);expect(result.evidence[0]?.facts.state).toBe("open");
 },60_000);
 it("runs the actual pinned Nuclei template and observes match then absence after a header fix",async()=>{
  let fixed=false,requests=0;
  const server=createServer((_request,response)=>{requests++;if(fixed)response.setHeader("X-Content-Type-Options","nosniff");response.end("fixture")});
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));cleanup.push(()=>new Promise(resolve=>server.close(()=>resolve())));
  const address=server.address();if(!address||typeof address==="string")throw new Error("Expected port");
  const url="http://127.0.0.1:"+address.port;
  const before=await scanNuclei(url,signal());expect(before.rules.some(rule=>rule.ruleId==="http.nosniff")).toBe(true);
  fixed=true;const after=await scanNuclei(url,signal());expect(after.rules).toEqual([]);
  expect(requests).toBeGreaterThanOrEqual(2);expect(requests).toBeLessThanOrEqual(4);
 },60_000);
 it("runs offline Trivy config checks on a real bounded Dockerfile snapshot",async()=>{
  const root=await mkdtemp(join(tmpdir(),"jait-trivy-fixture-"));cleanup.push(()=>rm(root,{recursive:true,force:true}));
  await writeFile(join(root,"Dockerfile"),'FROM alpine:3.20\nCMD ["sleep","3600"]\n');
  const before=await scanSoftware(root,"Dockerfile",signal());
  expect(before.conclusive).toBe(true);expect(before.rules.some(rule=>rule.ruleId.startsWith("trivy.config."))).toBe(true);
  await writeFile(join(root,"Dockerfile"),'FROM alpine:3.20\nRUN adduser -D app\nUSER app\nHEALTHCHECK NONE\nCMD ["sleep","3600"]\n');
  const after=await scanSoftware(root,"Dockerfile",signal());
  expect(after.conclusive).toBe(true);
  expect(after.rules.length).toBeLessThan(before.rules.length);
 },60_000);
 it.skipIf(!process.env.JAIT_TEST_TRIVY_CACHE)("correlates a vulnerable npm lockfile then verifies that the pinned-version fix removes those correlations",async()=>{
  const root=await mkdtemp(join(tmpdir(),"jait-packages-fixture-"));cleanup.push(()=>rm(root,{recursive:true,force:true}));
  const manifest=(version:string)=>JSON.stringify({name:"fixture",lockfileVersion:3,packages:{"":{name:"fixture",dependencies:{lodash:version}},"node_modules/lodash":{version,resolved:"https://registry.npmjs.org/lodash/-/lodash-"+version+".tgz"}}});
  await writeFile(join(root,"package-lock.json"),manifest("4.17.20"));
  const before=await scanSoftware(root,"package-lock.json",signal(),runCommand,true,process.env.JAIT_TEST_TRIVY_CACHE);
  expect(before.conclusive).toBe(true);expect(before.engineVersion).toContain("/db-");
  const correlations=before.rules.filter(rule=>rule.ruleId.startsWith("trivy.package."));expect(correlations.length).toBeGreaterThan(0);expect(correlations.every(rule=>rule.status==="suspected")).toBe(true);
  // The database may contain newer advisories against 4.17.21; verify this historical fix specifically.
  expect(correlations.some(rule=>rule.ruleId==="trivy.package.CVE-2021-23337.lodash")).toBe(true);
  await writeFile(join(root,"package-lock.json"),manifest("4.17.21"));
  const after=await scanSoftware(root,"package-lock.json",signal(),runCommand,true,process.env.JAIT_TEST_TRIVY_CACHE);
  expect(after.conclusive).toBe(true);expect(after.rules.some(rule=>rule.ruleId==="trivy.package.CVE-2021-23337.lodash")).toBe(false);
 },60_000);
});
